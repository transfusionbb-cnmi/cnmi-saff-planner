/* CNMI Staff Planner V481
 * Staff HR self-confirmation + 7-day reminder window + Admin pending center.
 *
 * - V480 is intentionally NOT loaded in index.html anymore.
 * - Admin keeps the original "รอดำเนินการ Admin" center from V460/V464/V465.
 * - Staff gets a separate HC iService reminder starting 7 calendar days
 *   before the leave start date. It is independent of the Dashboard selected
 *   day, so the reminder is visible even when today itself has no leave.
 * - Staff can press "ลาในระบบแล้ว". A locked-down RPC records only the staff's
 *   own leave as HR-reported and moves it to "รอตรวจสอบ" for Admin.
 * - All real leave types are reminded; "ไม่รับเวร" is excluded.
 * - Vacation leave has the special HC iService rule: submit at least 3 calendar
 *   days before the leave start date. Staff Planner does NOT fake/override that
 *   external HC iService lock; it shows the deadline and a strong late warning.
 *
 * Requires SQL_V481_STAFF_MARK_HR_REPORTED.sql once.
 */
(function(){
  'use strict';
  const VERSION='V482_STAFF_HR_REMINDER_7_DAYS';
  const LEAVE_URL='https://www3.ra.mahidol.ac.th/leaveRama/';
  const VACATION_ADVANCE_DAYS=3;
  const FUTURE_WINDOW_DAYS=7;
  const RECENT_WINDOW_DAYS=7;
  if(window.__CNMI_V481_STAFF_HR_CONFIRM_ADMIN_PENDING__)return;
  window.__CNMI_V481_STAFF_HR_CONFIRM_ADMIN_PENDING__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.rpc)return sb;}catch(_){}return window.sb||window.supabaseClient||null;}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function effectiveAdmin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return txt(S()?.profile?.role).toLowerCase()==='admin';}}
  function currentId(){try{return typeof currentStaffId==='function'?txt(currentStaffId()):txt(S()?.profile?.id||S()?.profile?.staff_id);}catch(_){return txt(S()?.profile?.id||S()?.profile?.staff_id);}}
  function norm(v){
    try{if(typeof normalizeDateKey==='function')return txt(normalizeDateKey(v)).slice(0,10);}catch(_){}
    const s=txt(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
  }
  function localToday(){
    try{if(typeof todayStr==='function')return norm(todayStr());}catch(_){}
    const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function dateObj(date){const d=norm(date);return d?new Date(`${d}T12:00:00`):null;}
  function addDays(date,days){const d=dateObj(date);if(!d)return'';d.setDate(d.getDate()+Number(days||0));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function diffDays(a,b){const da=dateObj(a),db=dateObj(b);if(!da||!db)return 0;return Math.round((da-db)/86400000);}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}}
  function staffName(id){const row=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''));return txt(row?.nickname||row?.full_name||row?.email||'เจ้าหน้าที่');}
  function typeOf(row){
    try{if(typeof leaveDisplayType==='function')return txt(leaveDisplayType(row));}catch(_){}
    const t=txt(row?.type||row?.leave_type).split(':::')[0].trim();return t==='ลาพักร้อน'?'ลาพักผ่อน':t;
  }
  function periodOf(row){
    const raw=txt(row?.leave_period||row?.period||'เต็มวัน');
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw;
  }
  function thaiRange(row){const s=norm(row?.start_date),e=norm(row?.end_date||row?.start_date);if(!s)return'-';return e&&e!==s?`${thaiDate(s)} – ${thaiDate(e)}`:thaiDate(s);}
  function effective(row){
    try{if(typeof isLeaveEffective==='function'&&!isLeaveEffective(row))return false;}catch(_){}
    const st=txt(row?.status).toLowerCase();
    return !/(cancel|delete|inactive|ยกเลิก|ไม่อนุมัติ)/i.test(st);
  }
  function realLeave(row){return !!row&&effective(row)&&!!typeOf(row)&&typeOf(row)!=='ไม่รับเวร';}
  function vacation(row){const t=typeOf(row);return t==='ลาพักผ่อน'||t==='ลาพักร้อน';}
  function hrRow(row){const id=String(row?.id||'');return (S().hrChecks||[]).find(h=>String(h?.leave_request_id||'')===id)||null;}
  function reported(row){const h=hrRow(row),status=txt(h?.status);return !!h?.hr_reported_date||status==='ตรวจสอบแล้ว';}

  function actionableRows(){
    if(effectiveAdmin())return [];
    const mine=currentId();if(!mine)return[];
    const today=localToday(),futureEnd=addDays(today,FUTURE_WINDOW_DAYS),recentStart=addDays(today,-RECENT_WINDOW_DAYS);
    return (S().leaves||[])
      .filter(r=>String(r?.staff_id||'')===String(mine)&&realLeave(r)&&!reported(r))
      .filter(r=>{
        const s=norm(r?.start_date),e=norm(r?.end_date||r?.start_date);if(!s)return false;
        return s<=futureEnd&&(e||s)>=recentStart;
      })
      .map(r=>{
        const start=norm(r?.start_date),deadline=vacation(r)?addDays(start,-VACATION_ADVANCE_DAYS):'',daysToDeadline=deadline?diffDays(deadline,today):null;
        return {...r,_v481Deadline:deadline,_v481DaysToDeadline:daysToDeadline};
      })
      .sort((a,b)=>{
        const ad=a._v481Deadline||norm(a.start_date),bd=b._v481Deadline||norm(b.start_date);
        return String(ad).localeCompare(String(bd))||String(a.start_date||'').localeCompare(String(b.start_date||''));
      });
  }

  function vacationMeta(row){
    if(!vacation(row))return {key:'normal',label:'อย่าลืมลาออนไลน์',detail:'หลังลาใน HC iService แล้ว ให้กดยืนยันด้านขวา'};
    const d=Number(row?._v481DaysToDeadline||0),deadline=thaiDate(row?._v481Deadline);
    if(d<0)return {key:'late',label:'พ้นกำหนดล่วงหน้า 3 วัน',detail:`HC iService กำหนดให้ยื่นภายใน ${deadline} และอาจล็อกรายการแล้ว`};
    if(d===0)return {key:'today',label:'วันนี้วันสุดท้าย',detail:`ลาพักผ่อนต้องยื่น HC iService วันนี้ (${deadline})`};
    if(d<=3)return {key:'soon',label:`เหลือ ${d} วันถึงกำหนด`,detail:`ต้องยื่น HC iService ภายใน ${deadline}`};
    return {key:'plan',label:`ต้องยื่นภายใน ${deadline}`,detail:'ลาพักผ่อนต้องลาออนไลน์ล่วงหน้าอย่างน้อย 3 วันปฏิทิน'};
  }

  function rowHtml(row){
    const m=vacationMeta(row),type=typeOf(row),period=periodOf(row);
    return `<div class="v481-reminder-item tone-${esc(m.key)}">
      <div class="v481-reminder-main">
        <div class="v481-reminder-title"><b>${esc(type)}</b><span class="v481-period">${esc(period)}</span>${vacation(row)?'<span class="v481-vacation">กติกา 3 วัน</span>':''}</div>
        <div class="v481-reminder-date"><b>วันลา</b> ${esc(thaiRange(row))}</div>
        <div class="v481-reminder-rule"><strong>${esc(m.label)}</strong><span>${esc(m.detail)}</span></div>
      </div>
      <div class="v481-reminder-actions">
        <a class="v481-open-link" href="${LEAVE_URL}" target="_blank" rel="noopener noreferrer external">เปิด HC iService ↗</a>
        <button type="button" class="v481-confirm-btn" data-v481-mark-hr="${esc(row.id)}">✓ ลาในระบบแล้ว</button>
      </div>
    </div>`;
  }

  function panelHtml(){
    if(effectiveAdmin())return'';
    const rows=actionableRows(),shown=rows.slice(0,6),extra=Math.max(0,rows.length-shown.length);
    const head=`<div class="v481-reminder-head"><div><h3>ลาออนไลน์ HC iService</h3><p>Staff Planner มีรายการลาแล้ว แต่ต้องลาในระบบโรงพยาบาลแยกอีกครั้ง • เมื่อลาออนไลน์เสร็จให้กด “ลาในระบบแล้ว”</p></div><a class="v481-head-link" href="${LEAVE_URL}" target="_blank" rel="noopener noreferrer external">เปิด HC iService ↗</a></div>`;
    if(!rows.length)return `<section class="card v481-staff-hr-reminder is-clear" data-v481-staff-hr-reminder>${head}<div class="v481-clear"><span>✓</span><div><b>ตอนนี้ไม่มีรายการลาที่รอยืนยัน HC iService</b><small>ถ้ามีรายการลาใหม่ ระบบจะเริ่มเตือนเมื่อเหลือ 7 วันก่อนวันลา โดยไม่ยึดว่าวันที่ Dashboard กำลังเปิดคือวันไหน</small></div></div></section>`;
    return `<section class="card v481-staff-hr-reminder" data-v481-staff-hr-reminder>${head}<div class="v481-reminder-list">${shown.map(rowHtml).join('')}</div>${extra?`<div class="v481-more">และอีก ${extra} รายการ • ดูรายการลาเพิ่มเติมได้ที่เมนู แจ้งลา / ไม่รับเวร</div>`:''}<div class="v481-footnote">“ลาในระบบแล้ว” = Staff ยืนยันว่าได้บันทึกใน HC iService แล้ว จากนั้นสถานะจะเปลี่ยนเป็น <b>รอตรวจสอบ HR</b> เพื่อให้ Admin ตรวจต่อ</div></section>`;
  }

  function mutateDashboard(html){
    if(String(S()?.page||'')!=='dashboard')return html;
    try{
      const t=document.createElement('template');t.innerHTML=String(html||'');
      t.content.querySelectorAll('[data-v480-leave-reminder],[data-v481-staff-hr-reminder]').forEach(n=>n.remove());
      if(!effectiveAdmin()){
        const box=document.createElement('template');box.innerHTML=panelHtml().trim();
        const panel=box.content.firstElementChild;
        const nav=t.content.querySelector('[data-v443-dashboard-date-nav]');
        if(panel){if(nav)nav.insertAdjacentElement('afterend',panel);else t.content.insertBefore(panel,t.content.firstChild);}
      }
      const holder=document.createElement('div');holder.appendChild(t.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v481StaffHrReminder){
    const wrapped=function renderDashboardV481(){return mutateDashboard(previousDashboard.apply(this,arguments));};
    wrapped.__v481StaffHrReminder=true;wrapped.__v481Previous=previousDashboard;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function leaveFormNoteHtml(){
    return `<div class="notice soft-notice wide v481-leave-form-note" data-v481-leave-form-note>
      <div class="v481-form-note-main"><b>หลังบันทึกรายการลา</b><span>ไปลาออนไลน์ใน HC iService แล้วกลับมาที่ Dashboard กด <b>“ลาในระบบแล้ว”</b> เพื่อให้ Admin ทราบว่าพร้อมตรวจ HR</span></div>
      <div class="v481-form-vacation-rule" data-v481-vacation-rule></div>
      <a href="${LEAVE_URL}" target="_blank" rel="noopener noreferrer external">เปิด HC iService ↗</a>
    </div>`;
  }
  function injectLeaveForm(html){
    if(String(S()?.page||'')!=='leave'||!String(html||'').includes('id="leaveForm"'))return html;
    try{
      const t=document.createElement('template');t.innerHTML=String(html||'');const form=t.content.querySelector('#leaveForm');
      if(!form)return html;
      form.querySelectorAll('[data-v480-leave-form-note],[data-v481-leave-form-note]').forEach(n=>n.remove());
      const typeSelect=form.querySelector('select[name="type"]'),label=typeSelect?.closest('label');if(!typeSelect||!label)return html;
      const note=document.createElement('template');note.innerHTML=leaveFormNoteHtml().trim();label.insertAdjacentElement('afterend',note.content.firstElementChild);
      const holder=document.createElement('div');holder.appendChild(t.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] leave form`,err);return html;}
  }
  const previousLeave=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof previousLeave==='function'&&!previousLeave.__v481HrNote){
    const wrapped=function renderLeavePageV481(){return injectLeaveForm(previousLeave.apply(this,arguments));};
    wrapped.__v481HrNote=true;wrapped.__v481Previous=previousLeave;
    try{window.renderLeavePage=renderLeavePage=wrapped;}catch(_){window.renderLeavePage=wrapped;}
  }

  function updateLeaveFormNote(form){
    if(!form)return;
    const note=form.querySelector('[data-v481-leave-form-note]'),rule=form.querySelector('[data-v481-vacation-rule]');if(!note||!rule)return;
    const setRule=html=>{if(rule.innerHTML!==html)rule.innerHTML=html;};
    const type=txt(form.querySelector('[name="type"]')?.value),start=norm(form.querySelector('[name="start_date"]')?.value),isNoDuty=type==='ไม่รับเวร';
    note.hidden=isNoDuty;
    if(isNoDuty){setRule('');return;}
    const isVacation=type==='ลาพักผ่อน'||type==='ลาพักร้อน';
    if(!isVacation){setRule('<span class="v481-rule-neutral">รายการลาประเภทนี้ไม่มีเงื่อนไข “ล่วงหน้า 3 วัน” ใน Staff Planner</span>');return;}
    if(!start){setRule('<span class="v481-rule-neutral">เลือกวันที่เริ่มลาเพื่อดูวันสุดท้ายที่ต้องยื่น HC iService</span>');return;}
    const today=localToday(),deadline=addDays(start,-VACATION_ADVANCE_DAYS),d=diffDays(deadline,today);
    if(d<0)setRule(`<span class="v481-rule-danger"><b>ลาพักผ่อน:</b> พ้นกำหนดล่วงหน้า 3 วันแล้ว • HC iService กำหนดให้ยื่นภายใน <b>${esc(thaiDate(deadline))}</b> และระบบภายนอกอาจล็อกไม่ให้ยื่น กรุณาติดต่อหัวหน้า/HR หากยังไม่ได้ลาออนไลน์</span>`);
    else if(d===0)setRule(`<span class="v481-rule-warn"><b>ลาพักผ่อน:</b> วันนี้เป็นวันสุดท้ายที่ต้องยื่น HC iService • กำหนด <b>${esc(thaiDate(deadline))}</b></span>`);
    else setRule(`<span class="v481-rule-ok"><b>ลาพักผ่อน:</b> ต้องยื่น HC iService ล่วงหน้าอย่างน้อย 3 วันปฏิทิน • วันสุดท้ายคือ <b>${esc(thaiDate(deadline))}</b> (${d} วันจากวันนี้)</span>`);
  }

  async function confirmDialogSafe(message,title){
    try{if(typeof confirmDialog==='function')return !!(await confirmDialog(message,title));}catch(_){}
    return window.confirm(message);
  }
  function mergeHrResult(payload){
    if(!payload||!payload.leave_request_id)return;
    const rows=S().hrChecks||(S().hrChecks=[]),idx=rows.findIndex(h=>String(h?.leave_request_id||'')===String(payload.leave_request_id));
    const safe={leave_request_id:payload.leave_request_id,status:payload.status,hr_reported_date:payload.hr_reported_date};
    if(idx>=0)rows[idx]={...rows[idx],...safe};else rows.push(safe);
  }
  async function markHrReported(leaveId,button){
    const row=(S().leaves||[]).find(r=>String(r?.id||'')===String(leaveId||''));
    if(!row||String(row?.staff_id||'')!==String(currentId()))return typeof showToast==='function'&&showToast('ยืนยันได้เฉพาะรายการลาของตัวเอง');
    if(!realLeave(row))return typeof showToast==='function'&&showToast('รายการนี้ไม่ใช่วันลาที่ต้องลง HC iService');
    const ok=await confirmDialogSafe(`ยืนยันว่าได้บันทึก “${typeOf(row)}” วันที่ ${thaiRange(row)} ใน HC iService เรียบร้อยแล้วจริง?\n\nหลังยืนยัน Admin จะเห็นเป็น “รอตรวจสอบ HR”`,'ยืนยันลาในระบบแล้ว');
    if(!ok)return;
    const db=DB();if(!db)return typeof showToast==='function'&&showToast('ยังเชื่อมต่อ Supabase ไม่สำเร็จ');
    const oldText=button?.textContent;try{if(button){button.disabled=true;button.textContent='กำลังบันทึก…';}}
    catch(_){}
    try{
      const res=await db.rpc('staff_mark_leave_hr_reported_v481',{p_leave_request_id:leaveId});
      if(res?.error){
        const msg=txt(res.error.message||res.error);
        if(/staff_mark_leave_hr_reported_v481|Could not find the function|schema cache/i.test(msg))throw new Error('ยังไม่ได้ Run SQL_V481_STAFF_MARK_HR_REPORTED.sql ใน Supabase');
        throw res.error;
      }
      let payload=res?.data;
      if(Array.isArray(payload))payload=payload[0]||null;
      if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch(_){} }
      mergeHrResult(payload);
      try{if(window.cnmiHrStatusV454?.loadPublicHrStatus)await window.cnmiHrStatusV454.loadPublicHrStatus();}catch(_){}
      try{if(typeof renderPage==='function')renderPage();}catch(_){}
      if(typeof showToast==='function')showToast('บันทึกว่า “ลาในระบบแล้ว” แล้ว • รอ Admin ตรวจสอบ HR');
    }catch(err){
      console.warn(`[${VERSION}] mark HR reported`,err);
      if(typeof showToast==='function')showToast(txt(err?.message||err||'บันทึกไม่สำเร็จ'));
    }finally{try{if(button){button.disabled=false;button.textContent=oldText||'✓ ลาในระบบแล้ว';}}catch(_){} }
  }

  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('[data-v481-mark-hr]');if(!btn)return;
    e.preventDefault();e.stopPropagation();markHrReported(btn.getAttribute('data-v481-mark-hr'),btn);
  },true);
  document.addEventListener('change',e=>{
    const form=e.target?.closest?.('#leaveForm');if(!form)return;
    if(['type','start_date','end_date'].includes(e.target?.name))updateLeaveFormNote(form);
  },true);

  function guardDom(){
    if(String(S()?.page||'')==='dashboard'){
      document.querySelectorAll('[data-v480-leave-reminder]').forEach(n=>n.remove());
      if(effectiveAdmin())document.querySelectorAll('[data-v481-staff-hr-reminder]').forEach(n=>n.remove());
      else{
        const page=document.getElementById('pageContent');
        if(page&&!page.querySelector('[data-v481-staff-hr-reminder]')){
          const nav=page.querySelector('[data-v443-dashboard-date-nav]');
          const t=document.createElement('template');t.innerHTML=panelHtml().trim();const panel=t.content.firstElementChild;
          if(panel){if(nav)nav.insertAdjacentElement('afterend',panel);else page.insertBefore(panel,page.firstChild);}
        }
      }
    }
    if(String(S()?.page||'')==='leave')updateLeaveFormNote(document.querySelector('#leaveForm'));
  }
  const mo=new MutationObserver(()=>guardDom());
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){}
  setTimeout(guardDom,80);setTimeout(guardDom,350);

  const style=document.createElement('style');style.id='cnmi-v481-style';style.textContent=`
    .v481-staff-hr-reminder{margin:0 0 14px;border:1px solid #bcdcf0;background:linear-gradient(180deg,#f8fcff,#fff);box-shadow:0 6px 18px rgba(36,92,130,.05)}
    .v481-staff-hr-reminder.is-clear{border-color:#cfe8d8;background:linear-gradient(180deg,#fbfffc,#fff)}
    .v481-reminder-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.v481-reminder-head h3{margin:0;color:#233f55;font-size:17px}.v481-reminder-head p{margin:4px 0 0;color:#6f8294;font-size:11px;line-height:1.45}
    .v481-head-link,.v481-open-link{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:850;border-radius:10px;white-space:nowrap}.v481-head-link{padding:9px 12px;background:#e7f5ff;color:#1573ad;border:1px solid #bfe3f8;font-size:11px}.v481-open-link{padding:7px 9px;border:1px solid #d6e7f3;background:#f5fbff;color:#2573a3;font-size:10px}
    .v481-reminder-list{display:grid;gap:8px;margin-top:12px}.v481-reminder-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 12px;border:1px solid #e0e9f0;border-radius:13px;background:#fff}.v481-reminder-item.tone-late{border-color:#ffc8c3;background:#fff8f7}.v481-reminder-item.tone-today{border-color:#ffd795;background:#fffaf1}.v481-reminder-item.tone-soon{border-color:#cfe2f0;background:#fbfdff}
    .v481-reminder-main{display:grid;gap:5px;min-width:0}.v481-reminder-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:#29465b}.v481-reminder-title b{font-size:13px}.v481-period,.v481-vacation{display:inline-flex;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:850}.v481-period{background:#eaf3ff;color:#275f94}.v481-vacation{background:#e8f7ed;color:#317e56}.v481-reminder-date{font-size:10px;color:#6c8091}.v481-reminder-date b{color:#3c566a}.v481-reminder-rule{display:flex;gap:6px;flex-wrap:wrap;align-items:baseline;font-size:10px}.v481-reminder-rule strong{color:#2877a9}.v481-reminder-rule span{color:#788b9a}.tone-late .v481-reminder-rule strong{color:#b33228}.tone-today .v481-reminder-rule strong{color:#a86100}
    .v481-reminder-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;min-width:255px}.v481-confirm-btn{appearance:none;border:1px solid #9ed7ba;border-radius:10px;background:#eaf8f0;color:#187449;font:inherit;font-size:10px;font-weight:900;padding:7px 9px;cursor:pointer}.v481-confirm-btn:hover{filter:brightness(.98)}.v481-confirm-btn:disabled{opacity:.55;cursor:wait}
    .v481-clear{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;border:1px solid #d7ebde;border-radius:12px;background:#f7fcf9}.v481-clear>span{display:grid;place-items:center;width:25px;height:25px;border-radius:999px;background:#e2f5e8;color:#187745;font-weight:950}.v481-clear div{display:grid;gap:2px}.v481-clear b{font-size:11px;color:#37624a}.v481-clear small{font-size:9px;color:#789084}.v481-more,.v481-footnote{margin-top:8px;color:#788b9a;font-size:9px}.v481-footnote{border-top:1px dashed #e3ebf1;padding-top:7px}
    .v481-leave-form-note{display:grid!important;gap:7px;border-color:#bfe0f4!important;background:#f4fbff!important;color:#355c74!important}.v481-leave-form-note[hidden]{display:none!important}.v481-form-note-main{display:grid;gap:2px}.v481-form-note-main>b{color:#245d80}.v481-leave-form-note a{width:max-content;color:#1477b2;font-weight:850;text-decoration:none}.v481-form-vacation-rule>span{display:block;padding:7px 9px;border-radius:9px;font-size:11px;line-height:1.45}.v481-rule-ok{background:#eef9f2;color:#2e6e49}.v481-rule-warn{background:#fff7e8;color:#8b5a00}.v481-rule-danger{background:#fff0ef;color:#a43a32}.v481-rule-neutral{background:#f4f6f8;color:#647586}
    @media(max-width:820px){
      .v481-staff-hr-reminder{margin-bottom:12px}.v481-reminder-head{align-items:stretch;flex-direction:column;gap:8px}.v481-reminder-head h3{font-size:17px}.v481-reminder-head p{font-size:11px}.v481-head-link{width:100%;font-size:12px;padding:9px 10px}
      .v481-reminder-item{align-items:stretch;flex-direction:column;gap:9px;padding:11px}.v481-reminder-title b{font-size:14px}.v481-period,.v481-vacation{font-size:10px}.v481-reminder-date,.v481-reminder-rule{font-size:11px}.v481-reminder-actions{min-width:0;grid-template-columns:1fr}.v481-open-link,.v481-confirm-btn{width:100%;font-size:12px;padding:9px 10px}.v481-clear b{font-size:12px}.v481-clear small,.v481-more,.v481-footnote{font-size:10px;line-height:1.4}.v481-form-vacation-rule>span{font-size:11px}
    }
  `;document.head.appendChild(style);

  window.cnmiV481={version:VERSION,url:LEAVE_URL,actionableRows,panelHtml,markHrReported,updateLeaveFormNote};
  console.info(`[${VERSION}] loaded`);
})();
