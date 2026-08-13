/* CNMI Staff Planner V442
 * 1) Mobile "ดูตามวัน": long public-holiday names wrap on their own full-width row.
 * 2) After a staff member has confirmed attendance for a date, duties on that date can no longer be sold.
 *    Lock is date + staff based (not duty-code based) and applies to Staff and Admin.
 *    Defense in depth: hides/disables trade entry points and blocks modal/save if stale DOM is clicked.
 */
(function(){
  'use strict';

  const VERSION='V442_HOLIDAY_WRAP_TRADE_AFTER_CHECKIN_LOCK';
  if(window.__CNMI_V442_HOLIDAY_WRAP_TRADE_AFTER_CHECKIN_LOCK__) return;
  window.__CNMI_V442_HOLIDAY_WRAP_TRADE_AFTER_CHECKIN_LOCK__=true;

  function normDate(value){
    try {
      if(typeof normalizeDateKey==='function') return String(normalizeDateKey(value)||'').slice(0,10);
    } catch (_) {}
    const raw=String(value||'').trim();
    const m=raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function currentId(){
    try { return String(currentStaffId()||''); }
    catch (_) { return String(state?.profile?.staff_id||state?.user?.staff_id||''); }
  }

  function admin(){
    try { return !!isAdmin(); }
    catch (_) { return String(state?.role||state?.currentRole||'').toLowerCase()==='admin'; }
  }

  function hasConfirmedAttendance(staffId,date){
    const sid=String(staffId||'');
    const d=normDate(date);
    if(!sid || !d) return false;

    const attendance=(state?.attendance||[]).some(row =>
      String(row?.staff_id||'')===sid && normDate(row?.duty_date)===d
    );
    if(attendance) return true;

    // Fallback protects records where attendance_logs and OT synchronization were repaired separately.
    return (state?.otRequests||[]).some(row =>
      String(row?.staff_id||'')===sid &&
      normDate(row?.work_date)===d &&
      /ยืนยันอยู่เวร/.test(String(row?.reason||''))
    );
  }

  function assignmentById(id){
    const key=String(id||'');
    if(!key) return null;
    const sources=[];
    try {
      if(typeof getAssignmentsForMonth==='function') sources.push(...(getAssignmentsForMonth(state?.monthKey)||[]));
    } catch (_) {}
    try { sources.push(...(state?.rosterAssignments||[])); } catch (_) {}
    return sources.find(row=>String(row?.id||'')===key) || null;
  }

  function lockedMessage(slot){
    let dateText=normDate(slot?.duty_date)||'วันที่นี้';
    try { if(typeof formatThaiDate==='function' && normDate(slot?.duty_date)) dateText=formatThaiDate(normDate(slot.duty_date)); } catch (_) {}
    return `${dateText} ยืนยันอยู่เวรแล้ว จึงไม่สามารถขายเวรย้อนหลังได้`;
  }

  function toastLocked(slot){
    const msg=lockedMessage(slot);
    try { showToast(msg,{tone:'error'}); }
    catch (_) { console.warn(`[${VERSION}] ${msg}`); }
  }

  // Replace the final permission function after legacy patches. Check the attendance lock first,
  // then preserve the existing owner/Admin permission rule.
  const canRequestTradeV442=function(slot){
    if(!slot?.id || !slot?.staff_id) return false;
    if(hasConfirmedAttendance(slot.staff_id,slot.duty_date)) return false;
    if(admin()) return true;
    return String(slot.staff_id)===currentId();
  };
  window.canRequestTrade=canRequestTradeV442;
  try { canRequestTrade=canRequestTradeV442; } catch (_) {}

  // Guard opening the trade popup too, so a stale button left on screen cannot bypass the rule.
  const previousShowTradeModal=window.showTradeModal || (typeof showTradeModal==='function' ? showTradeModal : null);
  if(typeof previousShowTradeModal==='function'){
    const showTradeModalV442=function(assignmentId,existingRequest=null){
      const slot=assignmentById(assignmentId);
      if(slot && hasConfirmedAttendance(slot.staff_id,slot.duty_date)){
        toastLocked(slot);
        return;
      }
      return previousShowTradeModal.apply(this,arguments);
    };
    window.showTradeModal=showTradeModalV442;
    try { showTradeModal=showTradeModalV442; } catch (_) {}
  }

  // Final save guard for any modal/form that was already open before attendance was confirmed.
  const previousSaveTradeRequest=window.saveTradeRequest || (typeof saveTradeRequest==='function' ? saveTradeRequest : null);
  if(typeof previousSaveTradeRequest==='function'){
    const saveTradeRequestV442=async function(form){
      try {
        const id=form?.querySelector?.('[name="from_assignment_id"]')?.value || form?.dataset?.assignmentId || '';
        const slot=assignmentById(id);
        if(slot && hasConfirmedAttendance(slot.staff_id,slot.duty_date)){
          toastLocked(slot);
          return;
        }
      } catch (error) {
        console.warn(`[${VERSION}] save guard lookup failed`,error);
      }
      return previousSaveTradeRequest.apply(this,arguments);
    };
    window.saveTradeRequest=saveTradeRequestV442;
    try { saveTradeRequest=saveTradeRequestV442; } catch (_) {}
  }

  // Long holiday names on the mobile single-day schedule should never push outside the card.
  const style=document.createElement('style');
  style.id='cnmi-v442-holiday-wrap-trade-lock';
  style.textContent=`
    @media (max-width: 820px) {
      .clean-calendar-cards.single-day-cards .clean-day-head {
        display:grid !important;
        grid-template-columns:auto minmax(0,1fr);
        align-items:center;
        justify-content:stretch;
        column-gap:12px;
        row-gap:8px;
        width:100%;
        min-width:0;
      }
      .clean-calendar-cards.single-day-cards .clean-day-head > b {
        grid-column:1;
        grid-row:1;
      }
      .clean-calendar-cards.single-day-cards .clean-day-head > span:not(.badge) {
        grid-column:2;
        grid-row:1;
        justify-self:end;
        min-width:0;
      }
      .clean-calendar-cards.single-day-cards .clean-day-head > .badge.yellow {
        grid-column:1 / -1;
        grid-row:2;
        justify-self:stretch;
        width:100%;
        max-width:100%;
        box-sizing:border-box;
        white-space:normal !important;
        overflow-wrap:anywhere;
        word-break:break-word;
        line-height:1.4;
        text-align:center;
        justify-content:center;
        border-radius:14px;
        padding:7px 10px;
      }
    }
  `;
  document.head.appendChild(style);

  window.cnmiV442={hasConfirmedAttendance,canRequestTrade:canRequestTradeV442};
  console.info(`[${VERSION}] loaded`);
})();
