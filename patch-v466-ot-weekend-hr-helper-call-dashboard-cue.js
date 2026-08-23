/* CNMI Staff Planner V466
 * 1) OT extra request: restore authoritative default start time (17:00 on weekend/holiday,
 *    16:00 on normal weekday) and enforce it on submit so staff do not forget.
 * 2) Rename OT reason "มาช่วยออกหน่วย" -> "เตรียมของออกหน่วย/เคลียงานออกหน่วย".
 * 3) Weekday Dashboard leave/no-duty rows show a visible "• แตะดู" cue and the row is tappable.
 * 4) Admin pending center gets HR pending leaves independently from Supabase, only leave dates
 *    not later than Bangkok today (future leave is excluded).
 * 5) Holiday helper names on Dashboard are tappable tel links for both internal/external helpers.
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V466_OT_WEEKEND_HR_HELPER_CALL_DASHBOARD_CUE';
  if(window.__CNMI_V466_OT_WEEKEND_HR_HELPER_CALL_DASHBOARD_CUE__)return;
  window.__CNMI_V466_OT_WEEKEND_HR_HELPER_CALL_DASHBOARD_CUE__=true;

  const OLD_OUTING_REASON='มาช่วยออกหน่วย';
  const NEW_OUTING_REASON='เตรียมของออกหน่วย/เคลียงานออกหน่วย';
  const hrSync={loading:false,lastAt:0,lastSignature:'',promise:null};

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function effectiveAdmin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){try{return typeof window.isAdmin==='function'&&!!window.isAdmin();}catch(__){return false;}}}
  function selectedDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}catch(_){return bangkokToday();}}
  function bangkokToday(){
    try{
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
      return `${m.year}-${m.month}-${m.day}`;
    }catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function isOffDay(date){try{return window.cnmiDashboardHolidayManpowerV440?.isOffDay?.(date)??((typeof isWeekend==='function'&&isWeekend(date))||(typeof isHolidayDate==='function'&&isHolidayDate(date)));}catch(_){return false;}}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffNameSafe(id){const p=staffById(id);return String(p?.nickname||p?.full_name||p?.email||'-');}
  function helperDisplayName(row){if(row?.internal_staff_id){const p=staffById(row.internal_staff_id);if(p)return String(p.nickname||p.full_name||p.email||row.helper_name||'-');}return String(row?.helper_name||'-').trim()||'-';}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?String(formatThaiDate(date)||date):date;}catch(_){return date;}}
  function periodLabel(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim();
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw;
  }
  function typeOf(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'ลา').trim():String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
  }
  function effectiveLeave(row){
    try{if(typeof isLeaveEffective==='function')return !!isLeaveEffective(row);}catch(_){ }
    const st=String(row?.status||'active').trim().toLowerCase();
    return !['cancelled','canceled','ยกเลิก','rejected','declined','ไม่อนุมัติ'].includes(st);
  }

  /* ---------- OT reason + weekend/holiday default ---------- */
  function installOtReason(){
    let rows=null;
    try{if(typeof OT_REASONS!=='undefined'&&Array.isArray(OT_REASONS))rows=OT_REASONS;}catch(_){ }
    if(!rows&&Array.isArray(window.OT_REASONS))rows=window.OT_REASONS;
    if(!rows)rows=[];
    const oldIndex=rows.findIndex(x=>String(x).trim()===OLD_OUTING_REASON);
    const newIndex=rows.findIndex(x=>String(x).trim()===NEW_OUTING_REASON);
    if(oldIndex>=0){
      if(newIndex>=0&&newIndex!==oldIndex)rows.splice(oldIndex,1);
      else rows.splice(oldIndex,1,NEW_OUTING_REASON);
    }else if(newIndex<0){
      const other=rows.findIndex(x=>String(x).trim()==='อื่นๆ');
      if(other>=0)rows.splice(other,0,NEW_OUTING_REASON);else rows.push(NEW_OUTING_REASON);
    }
    window.OT_REASONS=rows;
  }
  installOtReason();

  function defaultOtStart(date){
    const d=norm(date)||bangkokToday();
    try{if(typeof otStartHourForDate==='function')return `${String(otStartHourForDate(d)).padStart(2,'0')}:00`;}catch(_){ }
    try{const dow=new Date(`${d}T12:00:00`).getDay();return (dow===0||dow===6)?'17:00':'16:00';}catch(_){return '16:00';}
  }
  function tuneOtFormNode(form){
    if(!form||form.dataset?.adminSimple==='1')return;
    const date=form.querySelector('input[name="work_date"]');
    const start=form.querySelector('input[name="start_time"]');
    if(!date||!start)return;
    const expected=defaultOtStart(date.value);
    start.setAttribute('value',expected);
    start.value=expected;
    start.defaultValue=expected;
    const label=start.closest('label');
    if(label&&!label.querySelector('.v466-ot-start-note')){
      const note=document.createElement('small');
      note.className='hint v466-ot-start-note';
      note.textContent='ระบบตั้งอัตโนมัติ: วันธรรมดา 16:00 • เสาร์-อาทิตย์/วันหยุด 17:00';
      label.appendChild(note);
    }
  }
  function decorateOtHtml(html){
    let out=String(html||'').split(OLD_OUTING_REASON).join(NEW_OUTING_REASON);
    try{
      const tpl=document.createElement('template');tpl.innerHTML=out;
      tpl.content.querySelectorAll('#otForm').forEach(tuneOtFormNode);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(_){return out;}
  }
  const previousOtRender=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof previousOtRender==='function'){
    const wrapped=function renderOtPageV466(){installOtReason();return decorateOtHtml(previousOtRender.apply(this,arguments));};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }
  const previousSaveOt=window.saveOtRequest||(typeof saveOtRequest==='function'?saveOtRequest:null);
  if(typeof previousSaveOt==='function'){
    const wrappedSave=async function saveOtRequestV466(form){
      try{
        if(form?.id==='otForm'&&form?.dataset?.adminSimple!=='1'){
          const date=form.querySelector('input[name="work_date"]');
          const start=form.querySelector('input[name="start_time"]');
          const reason=form.querySelector('[name="reason"]');
          if(start&&date)start.value=defaultOtStart(date.value);
          if(reason&&String(reason.value||'').trim()===OLD_OUTING_REASON)reason.value=NEW_OUTING_REASON;
        }
      }catch(_){ }
      return previousSaveOt.apply(this,arguments);
    };
    try{window.saveOtRequest=saveOtRequest=wrappedSave;}catch(_){window.saveOtRequest=wrappedSave;}
  }

  document.addEventListener('change',event=>{
    const date=event.target?.closest?.('#otForm input[name="work_date"]');
    if(!date)return;
    const form=date.form,start=form?.querySelector('input[name="start_time"]');
    if(form?.dataset?.adminSimple==='1'||!start)return;
    start.value=defaultOtStart(date.value);
  },true);

  /* ---------- Dashboard helpers phone + weekday "แตะดู" ---------- */
  function helperPhone(row){
    let raw=String(row?.phone||'').trim();
    if(!raw&&row?.internal_staff_id){
      const p=staffById(row.internal_staff_id)||{};
      raw=String(p.phone||p.phone_number||p.mobile||p.mobile_phone||'').trim();
    }
    const digits=raw.replace(/\D/g,'');
    return digits.length>=9?digits:'';
  }
  function decorateHelperPhones(root,date){
    const api=window.cnmiDashboardHolidayManpowerV440;
    if(!api?.offDayManpower||!isOffDay(date))return;
    let rows=[];try{rows=api.offDayManpower(date)?.helpers?.rows||[];}catch(_){rows=[];}
    const chips=[...root.querySelectorAll?.('.v460-helper-name')||[]];
    chips.forEach((chip,index)=>{
      const row=rows[index];if(!row)return;
      const phone=helperPhone(row);if(!phone)return;
      const a=document.createElement('a');
      a.className=`${chip.className} v466-helper-call-link`;
      a.href=`tel:${phone}`;
      a.title='แตะเพื่อโทร';
      a.setAttribute('aria-label',`โทรหา ${helperDisplayName(row)}`);
      a.innerHTML=`${chip.innerHTML}<span class="v466-helper-phone-icon" aria-hidden="true">☎</span>`;
      chip.replaceWith(a);
    });
  }
  function decorateWeekdayTapCue(root,date){
    if(isOffDay(date))return;
    const cards=[...root.querySelectorAll?.('.card')||[]];
    const card=cards.find(c=>/ลา\s*\/\s*ไม่รับเวร/.test(String(c.querySelector?.('h3')?.textContent||'')));
    if(!card)return;
    card.querySelectorAll('.v447-leave-rank-button,.v436-no-duty-rank-badge').forEach(btn=>btn.classList.add('v466-dashboard-tap-cue'));
    card.querySelectorAll('.v397-today-item').forEach(item=>{
      const target=item.querySelector('.v447-leave-rank-button,.v436-no-duty-rank-badge');
      if(!target)return;
      item.classList.add('v466-dashboard-detail-row');
      item.setAttribute('role','button');item.setAttribute('tabindex','0');
      item.title='แตะดูวันที่และเวลาที่บันทึกครั้งแรก';
    });
  }

  /* ---------- HR pending category, <= Bangkok today ---------- */
  function mergeRows(key,rows){
    const st=S(),cur=Array.isArray(st[key])?st[key]:[],map=new Map();
    [...cur,...(rows||[])].forEach(r=>{if(r?.id!=null)map.set(String(r.id),r);});
    st[key]=[...map.values()];
  }
  function hrPendingLabel(hr){
    const status=String(hr?.status||'').trim();
    if(status==='รอเอกสาร')return 'รอเอกสาร HR';
    if(status==='รอตรวจสอบ'||hr?.hr_reported_date)return 'รอตรวจสอบ HR';
    return 'ยังไม่ลง HR';
  }
  function hrPendingItems(leaves,hrRows,today){
    const hrMap=new Map();
    (hrRows||[]).forEach(h=>{const id=String(h?.leave_request_id||'');if(id)hrMap.set(id,h);});
    return (leaves||[])
      .filter(r=>effectiveLeave(r)&&typeOf(r)!=='ไม่รับเวร')
      .filter(r=>{const d=norm(r?.start_date);return d&&d<=today;})
      .filter(r=>{const h=hrMap.get(String(r?.id||''));const s=String(h?.status||'').trim();return !['ตรวจสอบแล้ว','ยกเลิก'].includes(s);})
      .sort((a,b)=>norm(a?.start_date).localeCompare(norm(b?.start_date))||String(a?.created_at||'').localeCompare(String(b?.created_at||'')))
      .map(r=>{
        const h=hrMap.get(String(r?.id||''))||null;
        const start=norm(r.start_date),end=norm(r.end_date||r.start_date);
        const dateText=end&&end!==start?`${thaiDate(start)}–${thaiDate(end)}`:thaiDate(start);
        return {id:r.id,page:'hr',month:start.slice(0,7),date:start,title:staffNameSafe(r.staff_id),detail:`${typeOf(r)} · ${periodLabel(r)} · ${dateText} · ${hrPendingLabel(h)}`};
      });
  }
  function signature(items){return (items||[]).map(x=>`${x.id}|${x.detail}`).join('||');}
  function replaceHrCategory(items){
    const api=window.cnmiV460;if(!api?.pendingCache)return false;
    const pc=api.pendingCache,cats=Array.isArray(pc.categories)?pc.categories.filter(c=>c?.key!=='hr'):[];
    if(items.length)cats.push({key:'hr',label:'ตรวจ HR',tone:'gray',items});
    const sig=signature(items);const changed=sig!==hrSync.lastSignature;
    hrSync.lastSignature=sig;pc.categories=cats;pc.status='loaded';pc.loadedAt=Date.now();
    return changed;
  }
  async function syncHrPending(force=false,{rerender=true}={}){
    if(!effectiveAdmin()||String(S().page||'')!=='dashboard'||document.hidden)return [];
    if(hrSync.loading)return hrSync.promise||[];
    if(!force&&Date.now()-hrSync.lastAt<55000)return [];
    /* V460 may still be building the other pending categories. Wait for it so
       our HR category is applied last instead of being overwritten by a late base response. */
    try{
      const pc=window.cnmiV460?.pendingCache;
      for(let i=0;pc?.status==='loading'&&i<80;i++)await new Promise(r=>setTimeout(r,100));
    }catch(_){ }
    const db=DB();if(!db)return[];
    hrSync.loading=true;
    hrSync.promise=(async()=>{
      try{
        const today=bangkokToday();
        const [leaveRes,hrRes]=await Promise.all([
          db.from('leave_requests').select('*').lte('start_date',today).order('start_date',{ascending:true}).limit(600),
          db.from('hr_checks').select('*').order('updated_at',{ascending:false}).limit(1200)
        ]);
        if(leaveRes?.error)throw leaveRes.error;
        if(hrRes?.error)throw hrRes.error;
        const leaves=leaveRes?.data||[],hrs=hrRes?.data||[];
        mergeRows('leaves',leaves);mergeRows('hrChecks',hrs);
        const items=hrPendingItems(leaves,hrs,today);
        const changed=replaceHrCategory(items);
        hrSync.lastAt=Date.now();
        if(changed&&rerender&&effectiveAdmin()&&String(S().page||'')==='dashboard'){
          const y=window.scrollY||0;
          try{if(typeof renderPage==='function')renderPage();}catch(_){ }
          setTimeout(()=>{try{window.scrollTo(0,y);}catch(_){ }},0);
        }
        return items;
      }catch(err){console.warn('[V466] HR pending sync failed',err);return[];}
      finally{hrSync.loading=false;hrSync.promise=null;}
    })();
    return hrSync.promise;
  }

  const api460=window.cnmiV460||null;
  const basePendingLoader=api460?.loadAdminPending?api460.loadAdminPending.bind(api460):null;
  if(api460&&basePendingLoader&&!api460.__v466HrWrapped){
    api460.loadAdminPending=async function loadAdminPendingV466(force=false){
      const out=await basePendingLoader(!!force);
      await syncHrPending(!!force,{rerender:true});
      return api460.pendingCache?.categories||out||[];
    };
    api460.__v466HrWrapped=true;
  }

  function decorateDashboardHtml(html){
    try{
      const date=selectedDate(),tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decorateWeekdayTapCue(tpl.content,date);
      decorateHelperPhones(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      if(effectiveAdmin()&&String(S().page||'')==='dashboard')setTimeout(()=>syncHrPending(false,{rerender:true}),350);
      return holder.innerHTML;
    }catch(err){console.warn('[V466] dashboard decorate skipped',err);return html;}
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV466(){return decorateDashboardHtml(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  document.addEventListener('click',event=>{
    const row=event.target?.closest?.('.v466-dashboard-detail-row');
    if(row&&!event.target?.closest?.('button,a,input,select,textarea,label')){
      const btn=row.querySelector('.v447-leave-rank-button,.v436-no-duty-rank-badge');
      if(btn){event.preventDefault();btn.click();return;}
    }
    if(event.target?.closest?.('[data-v460-refresh-pending]'))setTimeout(()=>syncHrPending(true,{rerender:true}),450);
  },true);
  document.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key))return;
    const row=event.target?.closest?.('.v466-dashboard-detail-row');if(!row)return;
    event.preventDefault();row.querySelector('.v447-leave-rank-button,.v436-no-duty-rank-badge')?.click();
  },true);

  const style=document.createElement('style');style.id='cnmi-v466-style';style.textContent=`
    .v466-ot-start-note{display:block;margin-top:4px;font-size:9px!important;line-height:1.35;color:#6f8190!important;font-weight:600!important}
    .v466-dashboard-detail-row{cursor:pointer;touch-action:manipulation}.v466-dashboard-detail-row:hover{background:#f7fbfe}.v466-dashboard-detail-row:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(54,126,174,.16)}
    .v466-dashboard-tap-cue::after{content:' • แตะดู';color:#71879a;font-weight:800;font-size:.92em}
    .v466-helper-call-link{text-decoration:none!important;cursor:pointer;touch-action:manipulation}.v466-helper-call-link:hover{background:#e8f5fc!important;border-color:#9fcce5!important}.v466-helper-phone-icon{font-size:9px;line-height:1;color:#2477a8;margin-left:1px}.v466-helper-call-link:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(61,139,186,.18)}
    @media(max-width:820px){.v466-ot-start-note{font-size:10px!important}.v466-dashboard-tap-cue::after{font-size:1em}.v466-helper-phone-icon{font-size:11px}}
  `;document.head.appendChild(style);

  window.cnmiV466={version:VERSION,syncHrPending,defaultOtStart,hrSync};
  console.info(`${VERSION} loaded`);
})();
