/* CNMI Staff Planner V453
 * 1) Make HR leave status consistent for the real Admin even while using Staff view:
 *    - ✓ ตรวจสอบ HR แล้ว
 *    - รอตรวจสอบ HR
 *    - ยังไม่ลง HR
 *    Applies to Dashboard leave items, daytime-position shortage cards, and Calendar detail.
 * 2) Fix V430 late-leave badges on the leave-history page so each "ลานอกตาราง"
 *    badge is bound to its own leave record instead of stacking on the first card
 *    of the same staff member.
 *
 * No schema/write changes. Existing hr_checks and leave_requests are reused.
 */
(function(){
  'use strict';
  const VERSION='V453_HR_STATUS_AND_LATE_LEAVE_RECORD_BINDING';
  if(window.__CNMI_V453_HR_STATUS_AND_LATE_LEAVE_RECORD_BINDING__)return;
  window.__CNMI_V453_HR_STATUS_AND_LATE_LEAVE_RECORD_BINDING__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.sb||window.supabaseClient||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){return norm(S().dashboardDateV443);}
  }
  function actualAdmin(){
    try{if(typeof isActualAdmin==='function')return !!isActualAdmin();}catch(_){}
    try{if(typeof window.isActualAdmin==='function')return !!window.isActualAdmin();}catch(_){}
    return String(S().profile?.role||'')==='admin';
  }
  function adminView(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function currentStaff(){try{return typeof currentStaffId==='function'?String(currentStaffId()||''):String(S().profile?.id||'');}catch(_){return String(S().profile?.id||'');}}
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
    const h=hrRow(leave);
    const status=String(h?.status||'').trim();
    if(status==='ตรวจสอบแล้ว')return {key:'done',label:'✓ ตรวจสอบ HR แล้ว',cls:'is-done'};
    if(status==='รอเอกสาร')return {key:'waiting-doc',label:'รอเอกสาร HR',cls:'is-waiting'};
    if(status==='ยกเลิก')return {key:'cancelled',label:'HR ยกเลิก',cls:'is-muted'};
    if(h?.hr_reported_date)return {key:'pending',label:'รอตรวจสอบ HR',cls:'is-pending'};
    return {key:'not-reported',label:'ยังไม่ลง HR',cls:'is-not-reported'};
  }
  function hrPill(leave,extraClass=''){
    const m=hrMeta(leave);
    return `<span class="v445-hr-pill v453-hr-pill ${m.cls}${extraClass?` ${extraClass}`:''}">${esc(m.label)}</span>`;
  }

  /* Base loadAllData intentionally skips hr_checks while an Admin is previewing
     Staff mode. The real Admin still needs the authoritative HR state for QA.
     Re-fetch read-only hr_checks after the normal loader in that one case. */
  const previousLoad=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  if(typeof previousLoad==='function'&&!previousLoad.__v453Wrapped){
    const wrapped=async function loadAllDataV453(){
      const out=await previousLoad.apply(this,arguments);
      if(actualAdmin()){
        try{
          const db=DB();
          if(db){
            const q=await db.from('hr_checks').select('*').order('updated_at',{ascending:false});
            if(!q.error)S().hrChecks=q.data||[];
            else console.warn(`[${VERSION}] hr_checks refresh skipped`,q.error);
          }
        }catch(err){console.warn(`[${VERSION}] hr_checks refresh failed`,err);}
      }
      return out;
    };
    wrapped.__v453Wrapped=true;
    try{window.loadAllData=loadAllData=wrapped;}catch(_){window.loadAllData=wrapped;}
  }

  function decorateDashboard(root,date){
    if(!actualAdmin()||!root||!date)return;

    /* Daytime positions: V445-V448 already identify the exact leave/position.
       Replace the view-mode-gated HR badge with the real Admin status. */
    root.querySelectorAll?.('[data-v434-daytime-positions] .v434-position-item.v445-has-leave').forEach(item=>{
      const sid=String(item.dataset.v448LeaveStaff||item.dataset.v446StaffId||'');
      const leave=sid?leaveFor(sid,date):null;if(!leave)return;
      const line=item.querySelector('.v445-position-status-line');if(!line)return;
      line.querySelectorAll('.v445-hr-pill,.v453-hr-pill').forEach(n=>n.remove());
      line.insertAdjacentHTML('beforeend',hrPill(leave));
    });

    /* "ลา / ไม่รับเวรวันนี้": show one HR state for each real leave, but never
       attach HR workflow to "ไม่รับเวร". */
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
        item.querySelectorAll('.v453-dashboard-hr-pill').forEach(n=>n.remove());
        const typeText=[...item.querySelectorAll('.badge')].map(n=>String(n.textContent||'').trim()).join(' ');
        if(typeText.includes('ไม่รับเวร'))return;
        const nick=String(item.querySelector('b')?.textContent||'').trim();
        const rows=byNick.get(nick)||[];const idx=used.get(nick)||0;const leave=rows[idx]||rows[0];
        if(!leave)return;used.set(nick,idx+1);
        const head=item.firstElementChild||item;
        head.insertAdjacentHTML('beforeend',hrPill(leave,'v453-dashboard-hr-pill'));
      });
    }
  }

  function decorateDashboardHtml(html){
    if(String(S().page||'')!=='dashboard'||!actualAdmin())return html;
    const date=selectedDate();if(!date)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decorateDashboard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard HR decoration skipped`,err);return html;}
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v453Wrapped){
    const wrapped=function renderDashboardV453(){return decorateDashboardHtml(previousDashboard.apply(this,arguments));};
    wrapped.__v453Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  /* Calendar: base code only renders a badge when HR is already checked. That is
     why pending leaves looked like they had no HR status. Replace that binary
     behavior with the same three-state Admin display used above. */
  const previousCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof previousCollect==='function'&&!previousCollect.__v453Wrapped){
    const wrapped=function collectCalendarEventsV453(){
      const rows=previousCollect.apply(this,arguments)||[];
      if(!actualAdmin())return rows;
      return rows.map(e=>{
        if(!e?.raw||!realLeave(e.raw))return e;
        const title=String(e.title||'')
          .replace(/\s*✓\s*ตรวจสอบ\s*HR\s*แล้ว/gi,'')
          .replace(/\s*✓\s*ตรวจ\s*HR\s*แล้ว/gi,'')
          .replace(/\s{2,}/g,' ').trim();
        return {...e,title,hrChecked:false,hrStatusV453:hrMeta(e.raw)};
      });
    };
    wrapped.__v453Wrapped=true;
    try{window.collectCalendarEvents=collectCalendarEvents=wrapped;}catch(_){window.collectCalendarEvents=wrapped;}
  }

  const previousCalendarDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof previousCalendarDetail==='function'&&!previousCalendarDetail.__v453Wrapped){
    const wrapped=function calendarEventDetailV453(e){
      const base=String(previousCalendarDetail.apply(this,arguments)||'');
      if(!actualAdmin()||!e?.raw||!realLeave(e.raw))return base;
      return `<br>${hrPill(e.raw,'v453-calendar-hr-pill')}${base}`;
    };
    wrapped.__v453Wrapped=true;
    try{window.calendarEventDetail=calendarEventDetail=wrapped;}catch(_){window.calendarEventDetail=wrapped;}
  }

  /* Leave history: V430 inserted badges by replacing the first matching nickname.
     Repeated late leaves from the same person therefore stacked on one card.
     Remove those generated badges and bind exactly one badge by row index. */
  function leaveRowsForCurrentPage(){
    const rows=S().leaves||[];
    return rows.filter(r=>adminView()||String(r?.staff_id||'')===currentStaff());
  }
  function isLate(row){try{return !!window.cnmiLateLeaveV430?.isLateLeave?.(row);}catch(_){return false;}}
  function lateBadge(){return '<span class="v430-late-leave-badge v453-record-late-badge">ลานอกตาราง</span>';}
  function fixLeaveHistory(root){
    if(!root)return;
    const rows=leaveRowsForCurrentPage();if(!rows.length)return;
    const tableRows=[...root.querySelectorAll?.('.leave-desktop-table tbody tr')||[]];
    const listCard=root.querySelector?.('.leave-desktop-table')?.closest?.('.card');
    const mobileRows=[...(listCard?.querySelectorAll?.('.mobile-cards .mobile-card')||[])];

    tableRows.forEach((tr,i)=>{
      tr.querySelectorAll('.v430-late-leave-badge,.v453-record-late-badge').forEach(n=>n.remove());
      const row=rows[i];if(!row||!isLate(row))return;
      const cell=tr.children?.[0];if(cell)cell.insertAdjacentHTML('beforeend',`<br>${lateBadge()}`);
    });
    mobileRows.forEach((card,i)=>{
      card.querySelectorAll('.v430-late-leave-badge,.v453-record-late-badge').forEach(n=>n.remove());
      const row=rows[i];if(!row||!isLate(row))return;
      const head=card.querySelector('.section-title');
      if(head)head.insertAdjacentHTML('beforeend',lateBadge());
    });
  }
  function fixLeaveHistoryHtml(html){
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');fixLeaveHistory(tpl.content);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] leave-history binding skipped`,err);return html;}
  }
  const previousLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof previousLeavePage==='function'&&!previousLeavePage.__v453Wrapped){
    const wrapped=function renderLeavePageV453(){return fixLeaveHistoryHtml(previousLeavePage.apply(this,arguments));};
    wrapped.__v453Wrapped=true;
    try{window.renderLeavePage=renderLeavePage=wrapped;}catch(_){window.renderLeavePage=wrapped;}
  }

  function refreshCurrentDom(){
    try{
      if(String(S().page||'')==='dashboard')decorateDashboard(document,selectedDate());
      if(String(S().page||'')==='leave')fixLeaveHistory(document);
    }catch(err){console.warn(`[${VERSION}] DOM refresh skipped`,err);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshCurrentDom,{once:true});else queueMicrotask(refreshCurrentDom);
  window.addEventListener('pageshow',refreshCurrentDom);

  const style=document.createElement('style');
  style.id='cnmi-v453-hr-status-and-late-leave-record-binding';
  style.textContent=`
    .v453-hr-pill.is-done{background:#ecfdf3!important;color:#067647!important}
    .v453-hr-pill.is-pending{background:#fff7ed!important;color:#b45309!important;border:1px solid #fed7aa}
    .v453-hr-pill.is-not-reported{background:#f2f4f7!important;color:#667085!important;border:1px solid #e4e7ec}
    .v453-hr-pill.is-waiting{background:#fffaeb!important;color:#b54708!important;border:1px solid #fedf89}
    .v453-hr-pill.is-muted{background:#f2f4f7!important;color:#667085!important}
    .v453-dashboard-hr-pill{margin-left:5px}
    .v453-calendar-hr-pill{display:inline-flex!important;margin:3px 0 2px!important}
    .v453-record-late-badge{margin-top:4px}
    .leave-desktop-table .v453-record-late-badge{margin-left:0}
    @media(max-width:820px){
      .v453-dashboard-hr-pill{margin-left:4px}
      .v453-record-late-badge{font-size:10px;padding:3px 7px}
    }
  `;
  document.head.appendChild(style);

  window.cnmiHrStatusV453={version:VERSION,hrMeta,hrRow,fixLeaveHistory,decorateDashboard};
  console.info(`${VERSION} loaded`);
})();
