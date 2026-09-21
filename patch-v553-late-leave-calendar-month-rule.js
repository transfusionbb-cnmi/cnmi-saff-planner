/* CNMI Staff Planner V553 — Late leave calendar-month rule
   User rule:
   - Leave submitted BEFORE the leave month starts = normal leave, even if the roster is already published.
   - Leave submitted ON/AFTER day 1 of that leave month = "ลานอกตาราง".
   Examples:
     submit 21 Sep for 1 Oct  => normal leave
     submit 1 Oct for 5 Oct   => late leave / ลานอกตาราง
   Uses Asia/Bangkok for submission-date comparison. No schema / SQL / write changes.
*/
(function(){
  'use strict';
  const VERSION='V553_LATE_LEAVE_CALENDAR_MONTH_RULE';
  if(window.__CNMI_V553_LATE_LEAVE_CALENDAR_MONTH_RULE__) return;
  window.__CNMI_V553_LATE_LEAVE_CALENDAR_MONTH_RULE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function normDate(v){
    try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function effective(row){
    try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(String(row?.status||''));}
    catch(_){return true;}
  }
  function leaveType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function actualLeave(row){
    const type=leaveType(row);
    return !!row&&effective(row)&&!!type&&type!=='ไม่รับเวร';
  }
  function submissionRaw(row){
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt,row?.updated_at]){
      if(v!=null&&String(v).trim()) return v;
    }
    return '';
  }
  function bangkokDateKey(value){
    if(value==null||String(value).trim()==='')return '';
    const raw=String(value).trim();
    // Plain date is already an unambiguous calendar date.
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=new Date(raw);
    if(Number.isNaN(d.getTime()))return normDate(raw);
    try{
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
      const get=t=>parts.find(p=>p.type===t)?.value||'';
      const y=get('year'),m=get('month'),day=get('day');
      if(y&&m&&day)return `${y}-${m}-${day}`;
    }catch(_){ }
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function submissionDateKey(row){return bangkokDateKey(submissionRaw(row));}
  function monthStart(date){const d=normDate(date);return /^\d{4}-\d{2}-\d{2}$/.test(d)?`${d.slice(0,7)}-01`:'';}

  function isLateLeaveForDate(row,date){
    if(!actualLeave(row))return false;
    const start=monthStart(date),submitted=submissionDateKey(row);
    if(!start||!submitted)return false;
    // Main V553 rule: request reaches the system during (or after) the leave month.
    return submitted>=start;
  }
  function isLateLeave(row){
    if(!actualLeave(row))return false;
    const first=normDate(row?.start_date||row?.date);
    return !!first&&isLateLeaveForDate(row,first);
  }

  // Keep the established public helper name so all later UI patches automatically
  // use the corrected rule (Dashboard, position shortage, leave history, etc.).
  const lateApi=window.cnmiLateLeaveV430||{};
  lateApi.isLateLeaveForDate=isLateLeaveForDate;
  lateApi.isLateLeave=isLateLeave;
  lateApi.submissionDateKey=submissionDateKey;
  lateApi.rule='calendar-month-start-v553';
  window.cnmiLateLeaveV430=lateApi;
  window.cnmiLateLeaveV553={isLateLeaveForDate,isLateLeave,submissionDateKey,monthStart};

  function scheduleDates(month){
    try{return typeof scheduleMonthDates==='function'?scheduleMonthDates(month):[];}catch(_){return [];}
  }
  function activeLeave(staffId,date){
    try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}
  }
  function rosterStaff(staffList){
    return (staffList||[]).filter(st=>{try{return typeof isRosterEnabled==='function'?!!isRosterEnabled(st):true;}catch(_){return true;}});
  }

  /* Monthly roster: V430's old wrapper may already have stamped a roster-publish-based
     badge. Remove it from the table, then rebuild badges strictly from the V553 rule. */
  const previousGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof previousGrid==='function'){
    const wrappedGrid=function renderGridViewV553(staffList,assignments,key){
      let html=String(previousGrid.apply(this,arguments)||'');
      const month=String(key||S()?.monthKey||'').slice(0,7),dates=scheduleDates(month);
      if(!dates.length)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const table=tpl.content.querySelector('table.clean-schedule-grid,table#scheduleTable');
        if(!table)return html;
        table.querySelectorAll('.v430-late-leave-badge').forEach(n=>n.remove());
        table.querySelectorAll('.v430-late-leave-cell').forEach(n=>n.classList.remove('v430-late-leave-cell'));
        const bodyRows=[...table.querySelectorAll('tbody tr')],displayStaff=rosterStaff(staffList);
        bodyRows.forEach((tr,rowIndex)=>{
          const st=displayStaff[rowIndex];if(!st)return;
          const dateCells=[...tr.children].slice(-dates.length);
          dates.forEach((date,i)=>{
            const cell=dateCells[i],leave=cell?activeLeave(st.id,date):null;
            if(!cell||!leave||!isLateLeaveForDate(leave,date))return;
            const stack=cell.querySelector('.clean-cell-stack')||cell;
            if(!stack.querySelector('.v553-late-leave-badge'))stack.insertAdjacentHTML('beforeend','<span class="v430-late-leave-badge v553-late-leave-badge">ลานอกตาราง</span>');
            cell.classList.add('v430-late-leave-cell','v553-late-leave-cell');
          });
        });
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn(`[${VERSION}] roster decoration skipped`,err);}
      return html;
    };
    wrappedGrid.__v553Wrapped=true;
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  /* Calendar: remove any V430 suffix made by the old publication-date rule, then
     re-apply the marker with V553. This keeps both month cells and the day popup correct. */
  function stripLateText(title){
    return String(title||'')
      .replace(/\s*(?:·|•|—|-)\s*ลานอกตาราง\b/gi,'')
      .replace(/\s{2,}/g,' ')
      .trim();
  }
  const previousCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof previousCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV553(){
      const rows=previousCollect.apply(this,arguments)||[];
      return rows.map(e=>{
        if(!e?.raw||!actualLeave(e.raw))return e;
        const late=isLateLeaveForDate(e.raw,e.date),base=stripLateText(e.title);
        return {...e,title:late?`${base} · ลานอกตาราง`:base,lateLeaveV430:late,lateLeaveV553:late};
      });
    };
    wrappedCollect.__v553Wrapped=true;
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  /* Dashboard: downstream V511 reads cnmiLateLeaveV430 dynamically, so item-level
     badges are already rebuilt correctly. Only remove V430's old aggregate summary,
     which was calculated with the obsolete roster-publish rule. */
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrappedDashboard=function renderDashboardV553(){
      let html=String(previousDashboard.apply(this,arguments)||'');
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        tpl.content.querySelectorAll('.v430-late-summary').forEach(n=>n.remove());
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(_){ }
      return html;
    };
    wrappedDashboard.__v553Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      chip.textContent='v553';
      chip.title='Late leave = submitted during the leave month (V553)';
    });
  }
  let versionQueued=false;
  function queueVersion(){if(versionQueued)return;versionQueued=true;requestAnimationFrame(()=>{versionQueued=false;setVersion(document);});}
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'){
    const wrappedRenderPage=function renderPageV553(){const out=previousRenderPage.apply(this,arguments);queueVersion();return out;};
    try{window.renderPage=renderPage=wrappedRenderPage;}catch(_){window.renderPage=wrappedRenderPage;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v553-late-leave-calendar-month-rule';
  style.textContent=`
    .v553-late-leave-badge{font-weight:900}
    .v553-late-leave-cell{box-shadow:inset 0 0 0 1px rgba(245,158,11,.32)}
  `;
  document.head.appendChild(style);
  setVersion(document);
  console.info(`[${VERSION}] loaded`);
})();
