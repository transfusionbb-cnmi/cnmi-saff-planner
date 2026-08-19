/* CNMI Staff Planner V454
 * Show leave HR workflow status to every authenticated staff account, not only Admin.
 *
 * Privacy boundary:
 * - Staff reads ONLY public.hr_check_status_public (leave_request_id, status, hr_reported_date)
 * - HR note / checked_by / checked_at / internal row id are NOT exposed through this patch.
 * - Admin keeps using the existing full hr_checks data and existing V453 UI.
 *
 * Requires: supabase_v454_hr_status_public_view.sql (run once)
 */
(function(){
  'use strict';
  const VERSION='V454_HR_STATUS_VISIBLE_TO_ALL';
  if(window.__CNMI_V454_HR_STATUS_VISIBLE_TO_ALL__)return;
  window.__CNMI_V454_HR_STATUS_VISIBLE_TO_ALL__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.sb||window.supabaseClient||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function actualAdmin(){
    try{if(typeof isActualAdmin==='function')return !!isActualAdmin();}catch(_){}
    try{if(typeof window.isActualAdmin==='function')return !!window.isActualAdmin();}catch(_){}
    return String(S().profile?.role||'').trim().toLowerCase()==='admin';
  }
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){return norm(S().dashboardDateV443);}
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!['cancelled','ยกเลิก'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;}}
  function typeOf(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function realLeave(row){return !!row&&effective(row)&&!!typeOf(row)&&typeOf(row)!=='ไม่รับเวร';}
  function inRange(row,date){const s=norm(row?.start_date),e=norm(row?.end_date||row?.start_date);return !!s&&s<=date&&e>=date;}
  function leaveFor(staffId,date){
    const sid=String(staffId||'');if(!sid||!date)return null;
    return (S().leaves||[]).find(r=>String(r?.staff_id||'')===sid&&realLeave(r)&&inRange(r,date))||null;
  }
  function staffNickSafe(id){try{return typeof staffNick==='function'?String(staffNick(id)||''):String(id||'');}catch(_){return String(id||'');}}

  function hrRow(leave){
    const id=String(leave?.id||'');if(!id)return null;
    return (S().hrChecks||[]).find(h=>String(h?.leave_request_id||'')===id)||null;
  }
  function hrMeta(leave){
    try{if(window.cnmiHrStatusV453?.hrMeta)return window.cnmiHrStatusV453.hrMeta(leave);}catch(_){}
    const h=hrRow(leave);const status=String(h?.status||'').trim();
    if(status==='ตรวจสอบแล้ว')return {key:'done',label:'✓ ตรวจสอบ HR แล้ว',cls:'is-done'};
    if(status==='รอเอกสาร')return {key:'waiting-doc',label:'รอเอกสาร HR',cls:'is-waiting'};
    if(status==='ยกเลิก')return {key:'cancelled',label:'HR ยกเลิก',cls:'is-muted'};
    if(h?.hr_reported_date)return {key:'pending',label:'รอตรวจสอบ HR',cls:'is-pending'};
    return {key:'not-reported',label:'ยังไม่ลง HR',cls:'is-not-reported'};
  }
  function hrPill(leave,extraClass=''){
    const m=hrMeta(leave);
    return `<span class="v445-hr-pill v453-hr-pill v454-hr-pill ${m.cls}${extraClass?` ${extraClass}`:''}">${esc(m.label)}</span>`;
  }

  async function loadPublicHrStatus(){
    if(actualAdmin()){
      S().hrStatusPublicReadyV454=true;
      return S().hrChecks||[];
    }
    const db=DB();
    if(!db){S().hrStatusPublicReadyV454=false;return []}
    try{
      const q=await db.from('hr_check_status_public')
        .select('leave_request_id,status,hr_reported_date')
        .limit(3000);
      if(q.error)throw q.error;
      S().hrChecks=q.data||[];
      S().hrStatusPublicReadyV454=true;
      S().hrStatusPublicErrorV454='';
      return S().hrChecks;
    }catch(err){
      S().hrStatusPublicReadyV454=false;
      S().hrStatusPublicErrorV454=String(err?.message||err||'');
      console.warn(`[${VERSION}] public HR status unavailable. Run supabase_v454_hr_status_public_view.sql once.`,err);
      return [];
    }
  }

  /* Load safe HR status after every normal data refresh. This makes Refresh and
     post-save reloads authoritative for Staff without exposing full hr_checks. */
  const previousLoad=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  if(typeof previousLoad==='function'&&!previousLoad.__v454Wrapped){
    const wrapped=async function loadAllDataV454(){
      const out=await previousLoad.apply(this,arguments);
      await loadPublicHrStatus();
      return out;
    };
    wrapped.__v454Wrapped=true;
    try{window.loadAllData=loadAllData=wrapped;}catch(_){window.loadAllData=wrapped;}
  }

  function canShowForStaff(){return actualAdmin()||S().hrStatusPublicReadyV454===true;}

  function decorateDashboardForStaff(root,date){
    if(!root||!date||actualAdmin()||!canShowForStaff())return;

    root.querySelectorAll?.('[data-v434-daytime-positions] .v434-position-item.v445-has-leave').forEach(item=>{
      const sid=String(item.dataset.v448LeaveStaff||item.dataset.v446StaffId||'');
      const leave=sid?leaveFor(sid,date):null;if(!leave)return;
      const line=item.querySelector('.v445-position-status-line');if(!line)return;
      line.querySelectorAll('.v454-hr-pill').forEach(n=>n.remove());
      /* V448 does not add HR status for Staff. If a future patch does, avoid duplicates. */
      const hasAny=[...line.querySelectorAll('.v445-hr-pill')].some(n=>/HR/.test(String(n.textContent||'')));
      if(!hasAny)line.insertAdjacentHTML('beforeend',hrPill(leave));
    });

    const cards=[...root.querySelectorAll?.('.card')||[]];
    const leaveCard=cards.find(c=>String(c.querySelector('h3')?.textContent||'').includes('ลา / ไม่รับเวรวันนี้'));
    if(leaveCard){
      const byNick=new Map();
      (S().leaves||[]).filter(r=>realLeave(r)&&inRange(r,date)).forEach(r=>{
        const nick=staffNickSafe(r.staff_id);if(!nick)return;
        if(!byNick.has(nick))byNick.set(nick,[]);byNick.get(nick).push(r);
      });
      byNick.forEach(rows=>rows.sort((a,b)=>Date.parse(a?.created_at||0)-Date.parse(b?.created_at||0)));
      const used=new Map();
      leaveCard.querySelectorAll('.v397-today-item').forEach(item=>{
        item.querySelectorAll('.v454-dashboard-hr-pill').forEach(n=>n.remove());
        const typeText=[...item.querySelectorAll('.badge')].map(n=>String(n.textContent||'').trim()).join(' ');
        if(typeText.includes('ไม่รับเวร'))return;
        const nick=String(item.querySelector('b')?.textContent||'').trim();
        const rows=byNick.get(nick)||[];const idx=used.get(nick)||0;const leave=rows[idx]||rows[0];
        if(!leave)return;used.set(nick,idx+1);
        const head=item.firstElementChild||item;
        const existing=[...head.querySelectorAll('.v445-hr-pill')].some(n=>/HR/.test(String(n.textContent||'')));
        if(!existing)head.insertAdjacentHTML('beforeend',hrPill(leave,'v454-dashboard-hr-pill'));
      });
    }
  }

  function decorateDashboardHtml(html){
    if(String(S().page||'')!=='dashboard'||actualAdmin()||!canShowForStaff())return html;
    const date=selectedDate();if(!date)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decorateDashboardForStaff(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] Staff dashboard HR decoration skipped`,err);return html;}
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v454Wrapped){
    const wrapped=function renderDashboardV454(){return decorateDashboardHtml(previousDashboard.apply(this,arguments));};
    wrapped.__v454Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  /* Calendar detail: Staff sees the same HR status pill Admin already gets from V453. */
  const previousCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof previousCollect==='function'&&!previousCollect.__v454Wrapped){
    const wrapped=function collectCalendarEventsV454(){
      const rows=previousCollect.apply(this,arguments)||[];
      if(actualAdmin()||!canShowForStaff())return rows;
      return rows.map(e=>{
        if(!e?.raw||!realLeave(e.raw))return e;
        const title=String(e.title||'')
          .replace(/\s*✓\s*ตรวจสอบ\s*HR\s*แล้ว/gi,'')
          .replace(/\s*✓\s*ตรวจ\s*HR\s*แล้ว/gi,'')
          .replace(/\s{2,}/g,' ').trim();
        return {...e,title,hrChecked:false,hrStatusV454:hrMeta(e.raw)};
      });
    };
    wrapped.__v454Wrapped=true;
    try{window.collectCalendarEvents=collectCalendarEvents=wrapped;}catch(_){window.collectCalendarEvents=wrapped;}
  }

  const previousCalendarDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof previousCalendarDetail==='function'&&!previousCalendarDetail.__v454Wrapped){
    const wrapped=function calendarEventDetailV454(e){
      const base=String(previousCalendarDetail.apply(this,arguments)||'');
      if(actualAdmin()||!canShowForStaff()||!e?.raw||!realLeave(e.raw))return base;
      return `<br>${hrPill(e.raw,'v454-calendar-hr-pill')}${base}`;
    };
    wrapped.__v454Wrapped=true;
    try{window.calendarEventDetail=calendarEventDetail=wrapped;}catch(_){window.calendarEventDetail=wrapped;}
  }

  function refreshCurrentDom(){
    try{
      if(String(S().page||'')==='dashboard')decorateDashboardForStaff(document,selectedDate());
    }catch(err){console.warn(`[${VERSION}] DOM refresh skipped`,err);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshCurrentDom,{once:true});else queueMicrotask(refreshCurrentDom);
  window.addEventListener('pageshow',refreshCurrentDom);

  const style=document.createElement('style');
  style.id='cnmi-v454-hr-status-visible-to-all';
  style.textContent=`
    .v454-dashboard-hr-pill{margin-left:5px}
    .v454-calendar-hr-pill{display:inline-flex!important;margin:3px 0 2px!important}
    @media(max-width:820px){.v454-dashboard-hr-pill{margin-left:4px}}
  `;
  document.head.appendChild(style);

  window.cnmiHrStatusV454={version:VERSION,loadPublicHrStatus,hrMeta,hrRow,decorateDashboardForStaff};
  console.info(`${VERSION} loaded`);
})();
