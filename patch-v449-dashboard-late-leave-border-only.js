/* CNMI Staff Planner V449
 * Dashboard daytime-position leave border rule.
 *
 * Operational rule:
 *   - Normal/expected leave: keep leave period, HR status and shortage warning,
 *     but keep the position card in the normal neutral border.
 *   - Late leave ("ลานอกตาราง"): use the orange warning border/background.
 *
 * Uses V430's historical late-leave classifier and V448's authoritative
 * position/staff binding. Display-only; no SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V449_DASHBOARD_LATE_LEAVE_BORDER_ONLY';
  if(window.__CNMI_V449_DASHBOARD_LATE_LEAVE_BORDER_ONLY__)return;
  window.__CNMI_V449_DASHBOARD_LATE_LEAVE_BORDER_ONLY__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function norm(v){
    try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function selectedDate(){
    try{
      return norm(window.cnmiDashboardDateV443?.selectedDate?.())||
             norm(S().dashboardDateV443)||
             norm(typeof todayStr==='function'?todayStr():'');
    }catch(_){return norm(S().dashboardDateV443);}
  }
  function isDashboard(){return String(S().page||'')==='dashboard';}

  function leaveForStaff(staffId,date){
    if(!staffId||!date)return null;
    try{
      const v448=window.cnmiDashboardPositionCleanV448;
      if(v448?.leaveFor)return v448.leaveFor(staffId,date)||null;
    }catch(_){ }
    try{
      const v446=window.cnmiDashboardPositionLeaveV446;
      if(v446?.leaveFor)return v446.leaveFor(staffId,date)||null;
    }catch(_){ }
    return null;
  }

  function isLate(leave,date){
    if(!leave||!date)return false;
    try{return !!window.cnmiLateLeaveV430?.isLateLeaveForDate?.(leave,date);}
    catch(_){return false;}
  }

  function applyRule(root,date){
    const card=root?.querySelector?.('[data-v434-daytime-positions]');
    if(!card||!date)return;

    const items=[...card.querySelectorAll('.v434-position-item')];
    items.forEach(item=>{
      item.classList.remove('v449-late-leave');
      delete item.dataset.v449LateLeave;

      // Only cards already confirmed as leave cards by V446/V448 are relevant.
      if(!item.classList.contains('v445-has-leave'))return;

      const staffId=String(
        item.dataset.v448LeaveStaff||
        item.dataset.v446StaffId||
        ''
      );
      if(!staffId)return;

      const leave=leaveForStaff(staffId,date);
      if(!isLate(leave,date))return;

      item.classList.add('v449-late-leave');
      item.dataset.v449LateLeave='true';
    });
    card.dataset.v449LeaveBorderRule='late-leave-only';
  }

  function decorateHtml(html){
    if(!isDashboard())return html;
    const date=selectedDate();
    if(!date)return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'');
      applyRule(tpl.content,date);
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){
      console.warn('[V449] late-leave border correction skipped',err);
      return html;
    }
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v449Wrapped){
    const wrapped=function renderDashboardV449(){
      return decorateHtml(previousDashboard.apply(this,arguments));
    };
    wrapped.__v449Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function applyCurrent(){
    if(!isDashboard())return;
    const date=selectedDate();
    if(date)applyRule(document,date);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyCurrent,{once:true});
  else queueMicrotask(applyCurrent);
  window.addEventListener('pageshow',applyCurrent);

  const style=document.createElement('style');
  style.id='cnmi-v449-dashboard-late-leave-border-only';
  style.textContent=`
    /* Normal leave: keep all leave/HR/shortage badges but do NOT use orange warning framing. */
    [data-v434-daytime-positions] .v434-position-item.v445-has-leave:not(.v449-late-leave){
      background:#fff!important;
      border-color:#e6edf4!important;
      box-shadow:none!important;
    }

    /* Orange frame is reserved for leave submitted after the roster was arranged. */
    [data-v434-daytime-positions] .v434-position-item.v445-has-leave.v449-late-leave{
      background:#fffaf5!important;
      border-color:#f3b25d!important;
      box-shadow:inset 4px 0 0 #f3b25d!important;
    }
  `;
  document.head.appendChild(style);

  window.cnmiDashboardLateLeaveBorderV449={version:VERSION,applyRule,isLate};
  console.info(`${VERSION} loaded`);
})();
