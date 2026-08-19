/* CNMI Staff Planner V452
 * Physician Consult Schedule
 * - Adds Admin > ตารางแพทย์ Consult.
 * - Stores three schedule layers in Supabase:
 *   1) weekday daytime by month (Donor + Blood Bank, 08:00-16:00)
 *   2) off-hours/weekend/holiday by date range (Donor & BB)
 *   3) one-day overrides for late swaps/changes.
 * - Dashboard shows "แพทย์ Consult" BEFORE daytime staff positions.
 * - Physician rows do NOT change the staff daytime-position 13/13 counts.
 * Requires: supabase_v452_physician_consult_schedule.sql (run once).
 */
(function(){
  'use strict';
  const VERSION='V452_PHYSICIAN_CONSULT_SCHEDULE';
  const TABLE='physician_consult_schedules';
  if(window.__CNMI_V452_PHYSICIAN_CONSULT_SCHEDULE__)return;
  window.__CNMI_V452_PHYSICIAN_CONSULT_SCHEDULE__=true;

  const cache={rows:[],loaded:false,loading:false,unavailable:false,error:'',promise:null};

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function client(){try{return window.supabaseClient||(typeof sb!=='undefined'?sb:null);}catch(_){return window.supabaseClient||null;}}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v);}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function toastSafe(msg){try{if(typeof toast==='function')return toast(msg);}catch(_){ } try{if(typeof showToast==='function')return showToast(msg);}catch(_){ } console.info('[V452]',msg);}
  function currentStaff(){try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||null;}catch(_){return S()?.profile?.id||null;}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function pad(n){return String(n).padStart(2,'0');}
  function today(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function monthStart(key){return /^\d{4}-\d{2}$/.test(String(key||''))?`${key}-01`:'';}
  function monthEnd(key){if(!/^\d{4}-\d{2}$/.test(String(key||'')))return '';const [y,m]=key.split('-').map(Number);return `${key}-${pad(new Date(y,m,0).getDate())}`;}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):new Date(`${date}T12:00:00`).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}catch(_){return date;}}
  function thaiMonth(key){try{const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key;}}
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function selectedDashboardDate(){return normDate(S()?.dashboardDateV443)||(()=>{try{return normDate(todayStr())||today();}catch(_){return today();}})();}
  function physicians(){return (S().staff||[]).filter(p=>{
    if(!p||p.is_active===false||p.active===false)return false;
    return /แพทย์|physician|doctor/i.test(`${p.staff_type||''} ${p.role||''} ${p.position||''}`);
  }).sort((a,b)=>String(a.nickname||a.full_name||'').localeCompare(String(b.nickname||b.full_name||''),'th'));}
  function person(id){return (S().staff||[]).find(p=>String(p?.id)===String(id||''))||null;}
  function personName(id){const p=person(id);return p?(p.full_name||p.nickname||p.email||'-'):'-';}
  function personShort(id){const p=person(id);return p?(p.nickname||p.full_name||'-'):'-';}
  function doctorOptions(value='',placeholder='เลือกแพทย์'){
    const list=physicians();
    return `<option value="">${esc(placeholder)}</option>${list.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(value)?'selected':''}>${esc(p.full_name||p.nickname||p.email||p.id)}</option>`).join('')}`;
  }
  function newest(rows){return [...(rows||[])].sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')))[0]||null;}
  function activeRows(){return (cache.rows||[]).filter(r=>r&&r.is_active!==false);}
  function matching(type,date){return activeRows().filter(r=>String(r.schedule_type)===type&&normDate(r.start_date)<=date&&normDate(r.end_date)>=date);}
  function baseForDate(date){
    const weekend=isWeekendSafe(date),holiday=isHolidaySafe(date),weekday=!weekend&&!holiday;
    const dayBase=weekday?newest(matching('daytime_month',date)):null;
    const callBase=newest(matching('oncall_range',date));
    const override=newest(matching('daily_override',date));
    const donor=override?.donor_staff_id||dayBase?.donor_staff_id||null;
    const bb=override?.bb_staff_id||dayBase?.bb_staff_id||null;
    const combined=override?.combined_staff_id||callBase?.combined_staff_id||null;
    return {date,weekday,weekend,holiday,dayBase,callBase,override,donor,bb,combined};
  }
  function versionText(model){
    const items=[];
    const a=String(model.override?.version_label||model.dayBase?.version_label||'').trim();
    const b=String(model.override?.version_label||model.callBase?.version_label||'').trim();
    if(a)items.push(a);
    if(b&&b!==a)items.push(b);
    return items.join(' · ');
  }
  function dashboardCard(date){
    if(cache.unavailable)return '';
    if(!cache.loaded){ensureLoaded();return `<div class="card v452-physician-card" data-v452-physician-card><div class="section-title"><h3>แพทย์ Consult</h3><span>${esc(thaiDate(date))}</span></div><div class="v452-loading">กำลังโหลดตารางแพทย์…</div></div>`;}
    const m=baseForDate(date);
    const rows=[];
    if(m.weekday){
      rows.push({time:'08:00–16:00',site:'Donor',staff:m.donor});
      rows.push({time:'08:00–16:00',site:'Blood Bank',staff:m.bb});
      rows.push({time:'16:00–08:00',site:'Donor & BB',staff:m.combined});
    }else{
      rows.push({time:'ตลอดวัน',site:'Donor & BB',staff:m.combined});
    }
    const configured=rows.filter(r=>!!r.staff).length;
    const version=versionText(m);
    return `<div class="card v452-physician-card" data-v452-physician-card>
      <div class="section-title v452-card-head"><div><h3>แพทย์ Consult</h3><span>${esc(thaiDate(date))}</span></div><div class="v452-card-meta"><span class="v452-ready ${configured===rows.length?'is-complete':''}">พร้อม ${configured}/${rows.length}</span>${version?`<span class="v452-version">${esc(version)}</span>`:''}</div></div>
      <div class="v452-dashboard-table-wrap"><table class="v452-dashboard-table"><thead><tr><th>เวลา</th><th>จุด Consult</th><th>แพทย์</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.time)}</td><td><b>${esc(r.site)}</b></td><td>${r.staff?`<span class="v452-doctor-pill">${esc(personShort(r.staff))}</span>`:'<span class="v452-not-set">ยังไม่กำหนด</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${m.override?'<div class="v452-override-note">มีการแก้เฉพาะวันนี้'+(m.override.note?` · ${esc(m.override.note)}`:'')+'</div>':''}
    </div>`;
  }

  async function ensureLoaded(force=false){
    if(cache.loading)return cache.promise;
    if(cache.loaded&&!force)return cache.rows;
    const c=client();
    if(!c){cache.error='ยังไม่พบการเชื่อมต่อ Supabase';return [];} 
    cache.loading=true;cache.error='';cache.unavailable=false;
    cache.promise=(async()=>{
      const {data,error}=await c.from(TABLE).select('*').eq('is_active',true).order('start_date',{ascending:true}).order('updated_at',{ascending:true});
      if(error){
        cache.rows=[];cache.loaded=false;
        const msg=String(error.message||error.code||error);
        cache.unavailable=error.code==='42P01'||/does not exist|schema cache|physician_consult_schedules/i.test(msg);
        cache.error=msg;
        throw error;
      }
      cache.rows=data||[];cache.loaded=true;cache.unavailable=false;return cache.rows;
    })().catch(err=>{console.warn('[V452] load physician schedule',err);return [];}).finally(()=>{
      cache.loading=false;
      try{if(['dashboard','physicianConsult'].includes(String(S().page||''))&&typeof renderPage==='function')renderPage();}catch(_){ }
    });
    return cache.promise;
  }

  function scheduleTypeLabel(t){return t==='daytime_month'?'ในเวลา จ.–ศ.':t==='oncall_range'?'นอกเวลา / วันหยุด':'แก้เฉพาะวัน';}
  function rangeLabel(r){if(r.schedule_type==='daytime_month')return thaiMonth(String(r.start_date||'').slice(0,7));if(r.schedule_type==='daily_override')return thaiDate(r.start_date);return `${thaiDate(r.start_date)} – ${thaiDate(r.end_date)}`;}
  function doctorSummary(r){
    if(r.schedule_type==='daytime_month')return `Donor: ${personShort(r.donor_staff_id)} · BB: ${personShort(r.bb_staff_id)}`;
    if(r.schedule_type==='oncall_range')return `Donor & BB: ${personShort(r.combined_staff_id)}`;
    const parts=[];if(r.donor_staff_id)parts.push(`Donor → ${personShort(r.donor_staff_id)}`);if(r.bb_staff_id)parts.push(`BB → ${personShort(r.bb_staff_id)}`);if(r.combined_staff_id)parts.push(`นอกเวลา → ${personShort(r.combined_staff_id)}`);return parts.join(' · ')||'-';
  }
  function setupNotice(){return `<div class="card v452-setup"><h3>ต้องเปิดตารางแพทย์ใน Supabase ก่อนใช้งาน</h3><p>ให้รันไฟล์ <b>supabase_v452_physician_consult_schedule.sql</b> ใน Supabase → SQL Editor เพียงครั้งเดียว แล้วกดปุ่มด้านล่าง</p><button class="primary-btn" type="button" data-v452-retry>ลองเชื่อมต่ออีกครั้ง</button>${cache.error?`<p class="hint">${esc(cache.error)}</p>`:''}</div>`;}
  function rowsTable(){
    const rows=[...activeRows()].sort((a,b)=>normDate(b.start_date).localeCompare(normDate(a.start_date))||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
    if(!rows.length)return '<div class="empty-state">ยังไม่มีตารางแพทย์ที่บันทึกไว้</div>';
    return `<div class="table-wrap v452-list-wrap"><table><thead><tr><th>ประเภท</th><th>ช่วงวันที่</th><th>แพทย์</th><th>Version/หมายเหตุ</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(scheduleTypeLabel(r.schedule_type))}</td><td>${esc(rangeLabel(r))}</td><td>${esc(doctorSummary(r))}</td><td>${esc([r.version_label,r.note].filter(Boolean).join(' · ')||'-')}</td><td><button type="button" class="tiny-btn danger" data-v452-delete="${esc(r.id)}">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderAdminPage(){
    if(!admin())return '<div class="card"><div class="empty-state">หน้านี้สำหรับ Admin เท่านั้น</div></div>';
    if(cache.unavailable)return setupNotice();
    if(!cache.loaded){ensureLoaded();return '<div class="card"><div class="empty-state">กำลังโหลดตารางแพทย์ Consult…</div></div>';}
    const now=today(),month=now.slice(0,7);
    return `<div class="v452-admin-page">
      <div class="card v452-intro"><div class="section-title"><div><h3>ตารางแพทย์ Consult</h3><span>Dashboard จะดึงตารางนี้อัตโนมัติ และแสดงก่อนตำแหน่งเจ้าหน้าที่</span></div><button type="button" class="soft-btn" data-v452-refresh>รีเฟรช</button></div><p class="hint">ลำดับการใช้ข้อมูล: <b>แก้เฉพาะวัน</b> → ตารางประจำเดือน/ช่วงวันที่ → ถ้าไม่มีข้อมูลจะแสดง “ยังไม่กำหนด” โดยไม่ไปรวมกับจำนวนตำแหน่งเจ้าหน้าที่</p></div>
      <div class="grid grid-2 v452-form-grid">
        <form class="card v452-form" id="v452DaytimeForm"><h3>ในเวลา จ.–ศ. 08:00–16:00</h3><p class="hint">กำหนดรายเดือน แยก Donor และ Blood Bank</p><div class="v452-fields"><label>เดือน<input type="month" name="month" value="${esc(month)}" required></label><label>แพทย์ Donor<select name="donor_staff_id" required>${doctorOptions('','เลือกแพทย์ Donor')}</select></label><label>แพทย์ Blood Bank<select name="bb_staff_id" required>${doctorOptions('','เลือกแพทย์ Blood Bank')}</select></label><label>Version<input name="version_label" placeholder="เช่น Version 2"></label></div><button class="primary-btn" type="submit">บันทึกตารางในเวลา</button></form>
        <form class="card v452-form" id="v452OncallForm"><h3>นอกเวลา / เสาร์–อาทิตย์ / วันหยุด</h3><p class="hint">แพทย์ 1 คนดูแล Donor & BB ตามช่วงวันที่</p><div class="v452-fields"><label>วันที่เริ่ม<input type="date" name="start_date" value="${esc(now)}" required></label><label>วันที่สิ้นสุด<input type="date" name="end_date" value="${esc(now)}" required></label><label>แพทย์ Donor & BB<select name="combined_staff_id" required>${doctorOptions('','เลือกแพทย์')}</select></label><label>Version<input name="version_label" placeholder="เช่น Version 2"></label></div><button class="primary-btn" type="submit">บันทึกช่วงนอกเวลา</button></form>
      </div>
      <form class="card v452-form v452-override-form" id="v452OverrideForm"><h3>แก้เฉพาะวัน</h3><p class="hint">ใช้เมื่อมีการสลับ/อัปเดตกะทันหัน ช่องที่ไม่เลือกจะใช้ตารางเดิม</p><div class="v452-fields v452-override-fields"><label>วันที่<input type="date" name="work_date" value="${esc(now)}" required></label><label>Donor 08:00–16:00<select name="donor_staff_id">${doctorOptions('','ใช้ตารางเดิม')}</select></label><label>Blood Bank 08:00–16:00<select name="bb_staff_id">${doctorOptions('','ใช้ตารางเดิม')}</select></label><label>นอกเวลา Donor & BB<select name="combined_staff_id">${doctorOptions('','ใช้ตารางเดิม')}</select></label><label>Version<input name="version_label" placeholder="ถ้ามี"></label><label class="v452-note-field">หมายเหตุ<input name="note" placeholder="เช่น สลับเวรกับ พญ.…"></label></div><button class="primary-btn" type="submit">บันทึกการแก้เฉพาะวัน</button></form>
      <div class="card"><div class="section-title"><h3>รายการที่บันทึกแล้ว</h3><span>${activeRows().length} รายการ</span></div>${rowsTable()}</div>
    </div>`;
  }

  async function savePayload(type,form){
    if(!admin())return toastSafe('เฉพาะ Admin เท่านั้น');
    const c=client();if(!c)return toastSafe('ยังไม่เชื่อมต่อ Supabase');
    const fd=new FormData(form),actor=currentStaff();let payload={schedule_type:type,is_active:true,version_label:String(fd.get('version_label')||'').trim()||null,updated_by_staff_id:actor||null};
    let existing=null;
    if(type==='daytime_month'){
      const mk=String(fd.get('month')||'');payload.start_date=monthStart(mk);payload.end_date=monthEnd(mk);payload.donor_staff_id=fd.get('donor_staff_id')||null;payload.bb_staff_id=fd.get('bb_staff_id')||null;payload.combined_staff_id=null;
      if(!payload.start_date||!payload.donor_staff_id||!payload.bb_staff_id)return toastSafe('เลือกเดือนและแพทย์ให้ครบ');
      existing=newest(activeRows().filter(r=>r.schedule_type===type&&normDate(r.start_date)===payload.start_date));
    }else if(type==='oncall_range'){
      payload.start_date=normDate(fd.get('start_date'));payload.end_date=normDate(fd.get('end_date'));payload.combined_staff_id=fd.get('combined_staff_id')||null;payload.donor_staff_id=null;payload.bb_staff_id=null;
      if(!payload.start_date||!payload.end_date||payload.start_date>payload.end_date||!payload.combined_staff_id)return toastSafe('ตรวจวันที่และเลือกแพทย์ให้ครบ');
      existing=newest(activeRows().filter(r=>r.schedule_type===type&&normDate(r.start_date)===payload.start_date&&normDate(r.end_date)===payload.end_date));
    }else{
      const d=normDate(fd.get('work_date'));payload.start_date=d;payload.end_date=d;payload.donor_staff_id=fd.get('donor_staff_id')||null;payload.bb_staff_id=fd.get('bb_staff_id')||null;payload.combined_staff_id=fd.get('combined_staff_id')||null;payload.note=String(fd.get('note')||'').trim()||null;
      if(!d)return toastSafe('เลือกวันที่');
      if(!payload.donor_staff_id&&!payload.bb_staff_id&&!payload.combined_staff_id)return toastSafe('เลือกอย่างน้อย 1 ช่องที่ต้องการแก้');
      existing=newest(activeRows().filter(r=>r.schedule_type===type&&normDate(r.start_date)===d));
    }
    let result;
    if(existing){result=await c.from(TABLE).update(payload).eq('id',existing.id).select().single();}
    else{payload.created_by_staff_id=actor||null;result=await c.from(TABLE).insert(payload).select().single();}
    if(result.error){console.error('[V452] save',result.error);toastSafe(`บันทึกไม่สำเร็จ: ${result.error.message||result.error}`);return;}
    await ensureLoaded(true);toastSafe('บันทึกตารางแพทย์แล้ว');
  }
  async function softDelete(id){
    if(!admin()||!id)return;
    if(!confirm('ลบรายการตารางแพทย์นี้ใช่ไหม?'))return;
    const c=client();if(!c)return;
    const {error}=await c.from(TABLE).update({is_active:false,updated_by_staff_id:currentStaff()||null}).eq('id',id);
    if(error)return toastSafe(`ลบไม่สำเร็จ: ${error.message||error}`);
    await ensureLoaded(true);toastSafe('ลบรายการแล้ว');
  }

  // Add Admin navigation without changing the original app.js.
  try{
    if(typeof NAV_ITEMS!=='undefined'&&!NAV_ITEMS.some(x=>x.id==='physicianConsult')){
      const idx=NAV_ITEMS.findIndex(x=>x.id==='users');
      const item={id:'physicianConsult',icon:'🩺',title:'ตารางแพทย์ Consult',subtitle:'กำหนดแพทย์ Donor / Blood Bank และแพทย์นอกเวลา',group:'admin'};
      if(idx>=0)NAV_ITEMS.splice(idx,0,item);else NAV_ITEMS.push(item);
    }
  }catch(err){console.warn('[V452] nav item',err);}

  // Custom Admin page renderer.
  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV452(){
      if(String(S().page||'')!=='physicianConsult')return oldRenderPage.apply(this,arguments);
      const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),content=document.getElementById('pageContent');
      if(title)title.textContent='ตารางแพทย์ Consult';if(sub)sub.textContent='กำหนดแพทย์ Donor / Blood Bank และแพทย์นอกเวลา';
      try{if(typeof renderNav==='function')renderNav();}catch(_){ }
      if(content)content.innerHTML=renderAdminPage();
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  // Dashboard card: insert before daytime staff positions.
  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV452(){
      let html=String(oldDashboard.apply(this,arguments)||'');
      try{
        const date=selectedDashboardDate(),tpl=document.createElement('template');tpl.innerHTML=html;
        if(!tpl.content.querySelector('[data-v452-physician-card]')){
          const positionCard=tpl.content.querySelector('[data-v434-daytime-positions]');
          if(positionCard){
            const card=dashboardCard(date);if(card){const t=document.createElement('template');t.innerHTML=card.trim();positionCard.parentNode.insertBefore(t.content.firstElementChild,positionCard);}
          }
        }
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn('[V452] dashboard card',err);}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  document.addEventListener('click',async e=>{
    const nav=e.target?.closest?.('[data-page="physicianConsult"]');
    if(nav){e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();S().page='physicianConsult';try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }await ensureLoaded();if(typeof renderPage==='function')renderPage();return;}
    const retry=e.target?.closest?.('[data-v452-retry],[data-v452-refresh]');if(retry){e.preventDefault();cache.unavailable=false;cache.loaded=false;await ensureLoaded(true);if(typeof renderPage==='function')renderPage();return;}
    const del=e.target?.closest?.('[data-v452-delete]');if(del){e.preventDefault();await softDelete(del.getAttribute('data-v452-delete'));if(typeof renderPage==='function')renderPage();return;}
  },true);
  document.addEventListener('submit',async e=>{
    if(e.target?.id==='v452DaytimeForm'){e.preventDefault();e.stopPropagation();await savePayload('daytime_month',e.target);if(typeof renderPage==='function')renderPage();}
    else if(e.target?.id==='v452OncallForm'){e.preventDefault();e.stopPropagation();await savePayload('oncall_range',e.target);if(typeof renderPage==='function')renderPage();}
    else if(e.target?.id==='v452OverrideForm'){e.preventDefault();e.stopPropagation();await savePayload('daily_override',e.target);if(typeof renderPage==='function')renderPage();}
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v452-physician-consult-style';
  style.textContent=`
    .v452-physician-card{margin-bottom:14px}.v452-card-head{align-items:flex-start;gap:10px}.v452-card-head h3{margin:0}.v452-card-head>div:first-child span{font-size:11px;color:#8193a5}.v452-card-meta{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap}.v452-ready,.v452-version{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:850;white-space:nowrap}.v452-ready{background:#fff5df;border:1px solid #ffd28a;color:#9a5a00}.v452-ready.is-complete{background:#e9f8ee;border-color:#bde5c9;color:#18733b}.v452-version{background:#eef5fb;color:#607b92}.v452-dashboard-table-wrap{overflow:hidden;border:1px solid #e3ebf3;border-radius:12px}.v452-dashboard-table{margin:0;width:100%;border-collapse:collapse}.v452-dashboard-table th,.v452-dashboard-table td{padding:9px 10px;border-bottom:1px solid #edf2f6;text-align:left;font-size:11px}.v452-dashboard-table tr:last-child td{border-bottom:0}.v452-dashboard-table th{background:#f7fafc;color:#6c8194;font-size:10px}.v452-doctor-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#e8f5ff;border:1px solid #bcdff5;color:#245e82;font-weight:850}.v452-not-set{color:#9aa9b6}.v452-override-note{margin-top:7px;padding:6px 9px;border-radius:9px;background:#fff7e9;color:#96620d;font-size:10px}.v452-loading{padding:18px;text-align:center;color:#7890a4}.v452-intro{margin-bottom:12px}.v452-form-grid{align-items:stretch}.v452-form{margin-bottom:12px}.v452-form h3{margin:0 0 4px}.v452-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}.v452-fields label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#4d657b}.v452-fields input,.v452-fields select{width:100%;min-width:0}.v452-override-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.v452-note-field{grid-column:span 2}.v452-list-wrap{max-height:440px;overflow:auto}.v452-list-wrap td{vertical-align:top}.v452-setup p{line-height:1.5}
    @media(max-width:760px){.v452-card-head{display:flex!important}.v452-dashboard-table th,.v452-dashboard-table td{padding:8px 7px;font-size:10px}.v452-dashboard-table th{font-size:9px}.v452-doctor-pill{padding:4px 7px}.v452-form-grid{grid-template-columns:1fr!important}.v452-fields,.v452-override-fields{grid-template-columns:1fr}.v452-note-field{grid-column:auto}.v452-list-wrap table{min-width:720px}}
  `;
  document.head.appendChild(style);

  // Warm cache after login/state bootstrap; harmless if table has not been created yet.
  setTimeout(()=>{if(client())ensureLoaded();},800);
  window.cnmiPhysicianConsultV452={version:VERSION,cache,ensureLoaded,baseForDate,dashboardCard,renderAdminPage};
  console.info(`${VERSION} loaded`);
})();
