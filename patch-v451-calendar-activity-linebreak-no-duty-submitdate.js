/* CNMI Staff Planner V451
 * 1) Calendar activity popup preserves line breaks typed in activity notes/details.
 * 2) Monthly roster compact "ไม่รับ" badge is tappable and opens the existing
 *    V436 no-duty sequence detail popup, including the original submission date/time.
 * Display-only. No Supabase schema/query/write changes.
 */
(function(){
  'use strict';
  const VERSION='V451_CALENDAR_ACTIVITY_LINEBREAK_NO_DUTY_SUBMITDATE';
  if(window.__CNMI_V451_CALENDAR_ACTIVITY_LINEBREAK_NO_DUTY_SUBMITDATE__)return;
  window.__CNMI_V451_CALENDAR_ACTIVITY_LINEBREAK_NO_DUTY_SUBMITDATE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function normDate(v){try{return typeof normalizeDateKey==='function'?normalizeDateKey(v):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function rowType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function isNoDuty(row){return !!row&&rowType(row)==='ไม่รับเวร';}
  function rosterEnabled(st){try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}}
  function activeLeave(staffId,date){try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}}
  function monthDates(key){
    try{
      const rows=typeof scheduleMonthDates==='function'?scheduleMonthDates(String(key||'').slice(0,7)):[];
      return Array.isArray(rows)?rows.map(normDate).filter(Boolean):[];
    }catch(_){return [];}
  }
  function noDutyRank(row,date){try{return Number(window.cnmiNoDutySequenceV436?.rankFor?.(row,date))||null;}catch(_){return null;}}
  function submittedText(row){try{return String(window.cnmiNoDutySequenceV436?.submittedDateTime?.(row)||'').trim();}catch(_){return '';}}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?String(formatThaiDate(date)||date):date;}catch(_){return date;}}

  function decorateRosterHtml(html,staffList,key){
    const dates=monthDates(key||S().monthKey);if(!dates.length)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const table=tpl.content.querySelector('table.clean-schedule-grid,table#scheduleTable');if(!table)return html;
      const staff=(staffList||[]).filter(rosterEnabled);
      const rows=[...table.querySelectorAll('tbody tr')];
      rows.forEach((tr,rowIndex)=>{
        const st=staff[rowIndex];if(!st)return;
        const cells=[...tr.children].slice(-dates.length);
        dates.forEach((date,i)=>{
          const cell=cells[i];if(!cell)return;
          const leave=activeLeave(st.id,date);if(!isNoDuty(leave))return;
          const rank=noDutyRank(leave,date);if(!rank)return;
          const badge=cell.querySelector('.v438-compact-no-duty');if(!badge)return;
          const staffId=String(st.id||leave.staff_id||'');
          const submitted=submittedText(leave);
          badge.dataset.v436NoDutyRank=String(rank);
          badge.dataset.v436Date=date;
          badge.dataset.v436Staff=staffId;
          badge.dataset.v451NoDutyDetail='true';
          badge.setAttribute('role','button');
          badge.setAttribute('tabindex','0');
          const aria=`ลำดับไม่รับเวร ${rank} · วันที่ไม่รับเวร ${thaiDate(date)}${submitted?` · วันที่น้องลงบันทึกครั้งแรก ${submitted}`:''}`;
          badge.setAttribute('aria-label',aria);
          badge.setAttribute('title',aria);
        });
      });
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] roster decoration skipped`,err);return html;}
  }

  const oldGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldGrid==='function'){
    const wrappedGrid=function renderGridViewV451(staffList,assignments,key){return decorateRosterHtml(oldGrid.apply(this,arguments),staffList,key);};
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const target=event.target?.closest?.('[data-v451-no-duty-detail]');if(!target)return;
    event.preventDefault();event.stopPropagation();target.click();
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v451-calendar-activity-linebreak-no-duty-submitdate';
  style.textContent=`
    /* Activity note is already escaped as text; preserve the exact line breaks entered by Admin. */
    #modal #modalBody .calendar-modal-row .muted{white-space:pre-wrap}
    #modal #modalBody .calendar-modal-row .muted .v404-activity-link{white-space:normal}

    /* The compact monthly no-duty pill now behaves like the leave-rank pill. */
    .clean-schedule-grid .v438-compact-no-duty[data-v451-no-duty-detail]{cursor:pointer;touch-action:manipulation}
    .clean-schedule-grid .v438-compact-no-duty[data-v451-no-duty-detail]:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(100,116,139,.20)!important}
  `;
  document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();
