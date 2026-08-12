/* CNMI Staff Planner V430
 * Late leave / "ลานอกตาราง" marker.
 * Goal: distinguish leave submitted after the monthly duty roster had already been arranged.
 * Historical logic (no schema change):
 *   1) Prefer the first roster_months audit event that reached published/locked.
 *   2) Also estimate roster-build completion from the 90th percentile of roster_assignment created_at timestamps.
 *   3) Fall back to roster_months published_at/locked_at/updated_at when needed.
 * Actual leave types only; "ไม่รับเวร" is intentionally excluded.
 */
(function(){
  'use strict';
  const VERSION='V430_LATE_LEAVE_AFTER_ROSTER';
  if(window.__CNMI_V430_LATE_LEAVE_AFTER_ROSTER__)return;
  window.__CNMI_V430_LATE_LEAVE_AFTER_ROSTER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function timeMs(v){const n=Date.parse(String(v||''));return Number.isFinite(n)?n:NaN;}
  function jsonObj(v){
    if(v&&typeof v==='object')return v;
    if(typeof v==='string'){try{const x=JSON.parse(v);return x&&typeof x==='object'?x:{};}catch(_){}}
    return {};
  }
  function monthKeyForDate(date){return normDate(date).slice(0,7);}
  function monthRow(key){
    const [y,m]=String(key||'').split('-').map(Number);
    return (S().rosterMonths||[]).find(r=>Number(r?.year)===y&&Number(r?.month)===m)||null;
  }
  function actualLeave(row){
    if(!row)return false;
    try{if(typeof isLeaveEffective==='function'&&!isLeaveEffective(row))return false;}catch(_){}
    const type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!type&&type!=='ไม่รับเวร';
  }
  function leaveCreatedMs(row){
    const created=timeMs(row?.created_at);
    if(Number.isFinite(created))return created;
    // Very old rows may not expose created_at in a legacy view; updated_at is a conservative fallback.
    const updated=timeMs(row?.updated_at);
    return Number.isFinite(updated)?updated:NaN;
  }
  function auditPublishMs(key,row){
    const logs=[...(S().rosterPublishAuditV430||[]),...(S().auditLogs||[])];
    const id=String(row?.id||'');
    const matches=[];
    logs.forEach(a=>{
      if(String(a?.table_name||'')!=='roster_months')return;
      const n=jsonObj(a?.new_data),o=jsonObj(a?.old_data);
      const status=String(n.status||'').toLowerCase();
      if(!['published','locked'].includes(status))return;
      let same=false;
      if(id&&String(a?.record_id||'')===id)same=true;
      const ay=Number(n.year??o.year),am=Number(n.month??o.month);
      const [y,m]=String(key||'').split('-').map(Number);
      if(ay===y&&am===m)same=true;
      if(!same)return;
      const t=timeMs(a?.created_at);
      if(Number.isFinite(t))matches.push(t);
    });
    return matches.length?Math.min(...matches):NaN;
  }
  function assignmentBuildMs(key){
    const times=(S().rosterAssignments||[])
      .filter(a=>monthKeyForDate(a?.duty_date)===key)
      .map(a=>timeMs(a?.created_at))
      .filter(Number.isFinite)
      .sort((a,b)=>a-b);
    if(times.length<4)return NaN;
    // 90% of the month's current assignment rows already existed by this point.
    // This is much more stable than the latest edited row and supports historical data.
    const idx=Math.max(0,Math.min(times.length-1,Math.ceil(times.length*0.90)-1));
    return times[idx];
  }
  function rosterFallbackMs(row){
    if(!row)return NaN;
    const explicit=[row.published_at,row.locked_at].map(timeMs).filter(Number.isFinite);
    if(explicit.length)return Math.min(...explicit);
    const status=String(row.status||'').toLowerCase();
    if(['published','locked'].includes(status)){
      const u=timeMs(row.updated_at);
      if(Number.isFinite(u))return u;
    }
    return NaN;
  }
  function rosterArrangedMs(key){
    const row=monthRow(key);
    const audit=auditPublishMs(key,row);
    const built=assignmentBuildMs(key);
    const fallback=rosterFallbackMs(row);
    const strong=[audit,built].filter(Number.isFinite);
    if(strong.length)return Math.min(...strong);
    return fallback;
  }
  function isLateLeaveForDate(row,date){
    if(!actualLeave(row))return false;
    const d=normDate(date);
    if(!d)return false;
    const created=leaveCreatedMs(row),arranged=rosterArrangedMs(d.slice(0,7));
    if(!Number.isFinite(created)||!Number.isFinite(arranged))return false;
    return created>arranged+60000; // ignore sub-minute timestamp jitter
  }
  function isLateLeave(row){
    if(!actualLeave(row))return false;
    let days=[];
    try{days=typeof daysBetween==='function'?daysBetween(row.start_date,row.end_date):[normDate(row.start_date)];}catch(_){days=[normDate(row.start_date)];}
    return days.some(d=>isLateLeaveForDate(row,d));
  }
  window.cnmiLateLeaveV430={isLateLeaveForDate,isLateLeave,rosterArrangedMs};

  // Fetch roster publication audit history independently from the general 250-row audit list.
  // Failure is harmless; the timestamp fallbacks above still work.
  const oldLoadAllData=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  if(typeof oldLoadAllData==='function'){
    const wrappedLoad=async function loadAllDataV430(){
      const result=await oldLoadAllData.apply(this,arguments);
      try{
        const db=window.sb||(typeof sb!=='undefined'?sb:null);
        if(db){
          const q=await db.from('audit_logs').select('id,table_name,record_id,new_data,old_data,created_at').eq('table_name','roster_months').order('created_at',{ascending:true}).limit(2000);
          if(!q.error)S().rosterPublishAuditV430=q.data||[];
        }
      }catch(_){}
      return result;
    };
    try{window.loadAllData=loadAllData=wrappedLoad;}catch(_){window.loadAllData=wrappedLoad;}
  }

  const oldLeaveCellBadge=window.leaveCellBadge||(typeof leaveCellBadge==='function'?leaveCellBadge:null);
  if(typeof oldLeaveCellBadge==='function'){
    const wrappedBadge=function leaveCellBadgeV430(row){
      const base=oldLeaveCellBadge.apply(this,arguments);
      // activeLeaveRecordOn calls this per date but does not pass date; infer the date in cell-specific callers
      // through the row's own range only when every date in the range is late. For exact cell marking, renderGrid wrapper below adds it.
      return base;
    };
    try{window.leaveCellBadge=leaveCellBadge=wrappedBadge;}catch(_){window.leaveCellBadge=wrappedBadge;}
  }

  // Exact marking for the monthly duty table by wrapping the current final renderer.
  const oldRenderGridView=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldRenderGridView==='function'){
    const wrappedGrid=function renderGridViewV430(staffList,assignments,key){
      let html=String(oldRenderGridView.apply(this,arguments)||'');
      const month=String(key||S().monthKey||'').slice(0,7);
      const dates=[];
      try{dates=typeof scheduleMonthDates==='function'?scheduleMonthDates(month):[];}catch(_){}
      // Add a marker after the existing leave badge. We target the exact staff/date cell using the row/column order.
      if(!dates.length)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const table=tpl.content.querySelector('table.clean-schedule-grid, table#scheduleTable');
        if(!table)return html;
        const bodyRows=[...table.querySelectorAll('tbody tr')];
        const displayStaff=(staffList||[]).filter(st=>{try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}});
        bodyRows.forEach((tr,rowIndex)=>{
          const st=displayStaff[rowIndex];if(!st)return;
          const cells=[...tr.children].slice(2); // current clean table has sticky name + summary before dates in V217
          // Some legacy renderers have only one sticky column; align from the right to keep dates exact.
          const dateCells=cells.length===dates.length?cells:[...tr.children].slice(-dates.length);
          dates.forEach((date,i)=>{
            const cell=dateCells[i];if(!cell)return;
            let leave=null;try{leave=typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(st.id,date):null;}catch(_){}
            if(!leave||!isLateLeaveForDate(leave,date))return;
            const stack=cell.querySelector('.clean-cell-stack')||cell;
            if(!stack.querySelector('.v430-late-leave-badge'))stack.insertAdjacentHTML('beforeend','<span class="v430-late-leave-badge">ลานอกตาราง</span>');
            cell.classList.add('v430-late-leave-cell');
          });
        });
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(_){}
      return html;
    };
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  // Dashboard: show who added leave after roster arrangement.
  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV430(){
      const d=typeof todayStr==='function'?todayStr():new Date().toISOString().slice(0,10);
      let html=String(oldDashboard.apply(this,arguments)||'');
      const late=(S().leaves||[]).filter(r=>{try{return typeof overlapsDate==='function'&&overlapsDate(r,d)&&isLateLeaveForDate(r,d);}catch(_){return false;}});
      if(!late.length)return html;
      late.forEach(row=>{
        let nick='';try{nick=typeof staffNick==='function'?staffNick(row.staff_id):'';}catch(_){}
        if(!nick)return;
        const token=`<div class="v397-today-item"><div><b>${esc(nick)}</b> `;
        const replacement=`<div class="v397-today-item v430-late-today-item"><div><b>${esc(nick)}</b> <span class="v430-late-leave-badge">ลานอกตาราง</span> `;
        html=html.replace(token,replacement);
      });
      html=html.replace('<span class="hint">แสดงช่วงลาและเหตุผล</span>',`<span class="hint">แสดงช่วงลาและเหตุผล</span><span class="v430-late-summary">ลานอกตาราง ${late.length} คน</span>`);
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  // Calendar: keep the historical marker visible when opening past dates.
  const oldCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof oldCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV430(){
      const rows=oldCollect.apply(this,arguments)||[];
      return rows.map(e=>{
        if(e?.raw&&actualLeave(e.raw)&&isLateLeaveForDate(e.raw,e.date)&&!String(e.title||'').includes('ลานอกตาราง')){
          return {...e,title:`${e.title} · ลานอกตาราง`,lateLeaveV430:true};
        }
        return e;
      });
    };
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  // Leave list: add a compact historical flag without changing stored data.
  const oldRenderLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof oldRenderLeavePage==='function'){
    const wrappedLeavePage=function renderLeavePageV430(){
      let html=String(oldRenderLeavePage.apply(this,arguments)||'');
      const lateRows=(S().leaves||[]).filter(isLateLeave);
      lateRows.forEach(row=>{
        let nick='';try{nick=typeof staffNick==='function'?staffNick(row.staff_id):'';}catch(_){}
        if(!nick)return;
        // Mobile card heading; table cells are handled below by matching the first staff name occurrence.
        html=html.replace(`<h3>${esc(nick)}</h3>`,`<h3>${esc(nick)}</h3><span class="v430-late-leave-badge">ลานอกตาราง</span>`);
        html=html.replace(`<td>${esc(nick)}`,`<td>${esc(nick)} <span class="v430-late-leave-badge">ลานอกตาราง</span>`);
      });
      return html;
    };
    try{window.renderLeavePage=renderLeavePage=wrappedLeavePage;}catch(_){window.renderLeavePage=wrappedLeavePage;}
  }

  const style=document.createElement('style');style.id='v430-late-leave-style';style.textContent=`
    .v430-late-leave-badge{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;padding:2px 7px;border:1px solid #fdba74;border-radius:999px;background:#fff4e6;color:#b45309;font-size:10px;font-weight:900;line-height:1.25;white-space:nowrap}
    .clean-cell-stack>.v430-late-leave-badge{margin:2px auto 0}.v430-late-leave-cell{box-shadow:inset 0 0 0 1px rgba(245,158,11,.32)}
    .v430-late-summary{display:inline-flex;margin-left:8px;padding:3px 8px;border-radius:999px;background:#fff4e6;color:#b45309;font-size:11px;font-weight:850}.v430-late-today-item{border-color:#fed7aa;background:#fffaf5}
    @media(max-width:820px){.v430-late-leave-badge{font-size:9px;padding:2px 6px}.v430-late-summary{display:block;width:max-content;margin:5px 0 0;font-size:10px}}
  `;document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
