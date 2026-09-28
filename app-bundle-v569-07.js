
/* Original source: patch-v430-late-leave-after-roster.js */
try {
/* CNMI Staff Planner V430
 * Late leave / "ลานอกตาราง" marker.
 * Goal: distinguish leave submitted after the monthly duty roster had already been arranged.
 * Historical logic (no schema change):
 *   1) A leave can be "ลานอกตาราง" only after the monthly duty roster is actually published/locked.
 *   2) Prefer the first roster_months audit event that reached published/locked.
 *   3) Fall back to roster_months published_at/locked_at/updated_at only when the current month status is published/locked.
 * Draft/generated assignments alone must never trigger the orange late-leave state.
 * Actual leave types only; "ไม่รับเวร" is intentionally excluded.
 */
(function(){
  'use strict';
  const VERSION='V430_LATE_LEAVE_AFTER_ROSTER_V509_PUBLISH_GATE';
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
    const status=String(row?.status||'').toLowerCase();
    // V509: orange "ลานอกตาราง" starts only after the roster was actually released.
    // A draft can already contain many roster_assignment rows, but staff have not received the roster yet.
    if(!row||!['published','locked'].includes(status))return NaN;
    const audit=auditPublishMs(key,row);
    if(Number.isFinite(audit))return audit;
    return rosterFallbackMs(row);
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

} catch (error) { console.error("[v569] patch-v430-late-leave-after-roster.js", error); }
;

/* Original source: patch-v431-leave-sequence.js */
try {
/* CNMI Staff Planner V431
 * Leave sequence / ลำดับลา by the original submission timestamp.
 * Purpose:
 *   - show who was leave #1, #2, #3, #4 ... on each date
 *   - keep V430 "ลานอกตาราง" as a separate concept
 *   - sort the dashboard leave list by actual leave submission order
 * Historical: calculated from existing leave_requests.created_at; no schema/query change.
 */
(function(){
  'use strict';
  const VERSION='V431_LEAVE_SEQUENCE';
  if(window.__CNMI_V431_LEAVE_SEQUENCE__)return;
  window.__CNMI_V431_LEAVE_SEQUENCE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function timeMs(v){const n=Date.parse(String(v||''));return Number.isFinite(n)?n:NaN;}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function actualLeave(row){
    if(!row||!effective(row))return false;
    const type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!type&&type!=='ไม่รับเวร';
  }
  function overlaps(row,date){
    try{return typeof overlapsDate==='function'?overlapsDate(row,date):normDate(row?.start_date)<=date&&normDate(row?.end_date)>=date;}catch(_){return false;}
  }
  function leaveSubmittedMs(row){
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt]){
      const n=timeMs(v);if(Number.isFinite(n))return n;
    }
    // Legacy fallback only. created_at is expected for normal rows.
    const u=timeMs(row?.updated_at);return Number.isFinite(u)?u:Number.POSITIVE_INFINITY;
  }
  function staffOrder(id){
    const list=S().staff||[];
    const i=list.findIndex(x=>String(x?.id)===String(id));
    return i<0?99999:i;
  }
  function stableKey(row){return `${String(row?.id||'')}|${String(row?.staff_id||'')}`;}

  function leaveSequenceForDate(date){
    const d=normDate(date);if(!d)return [];
    const perStaff=new Map();
    (S().leaves||[]).forEach(row=>{
      if(!actualLeave(row)||!overlaps(row,d))return;
      const sid=String(row?.staff_id||'');if(!sid)return;
      const existing=perStaff.get(sid);
      if(!existing||leaveSubmittedMs(row)<leaveSubmittedMs(existing))perStaff.set(sid,row);
    });
    const rows=[...perStaff.values()].sort((a,b)=>{
      const ta=leaveSubmittedMs(a),tb=leaveSubmittedMs(b);
      if(ta!==tb)return ta-tb;
      const oa=staffOrder(a?.staff_id),ob=staffOrder(b?.staff_id);
      if(oa!==ob)return oa-ob;
      return stableKey(a).localeCompare(stableKey(b),'th');
    });
    return rows.map((row,i)=>({row,rank:i+1,staff_id:String(row?.staff_id||''),submitted_ms:leaveSubmittedMs(row)}));
  }
  function rankFor(row,date){
    if(!actualLeave(row))return null;
    const sid=String(row?.staff_id||'');
    const hit=leaveSequenceForDate(date).find(x=>x.staff_id===sid);
    return hit?hit.rank:null;
  }
  function circled(n){
    const chars=['','①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
    return n>=1&&n<=20?chars[n]:`(${n})`;
  }
  window.cnmiLeaveSequenceV431={leaveSequenceForDate,rankFor,circled,leaveSubmittedMs};

  // Monthly roster table: compact circled sequence number only, to avoid widening cells.
  const oldRenderGridView=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldRenderGridView==='function'){
    const wrappedGrid=function renderGridViewV431(staffList,assignments,key){
      let html=String(oldRenderGridView.apply(this,arguments)||'');
      const month=String(key||S().monthKey||'').slice(0,7);
      let dates=[];try{dates=typeof scheduleMonthDates==='function'?scheduleMonthDates(month):[];}catch(_){}
      if(!dates.length)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const table=tpl.content.querySelector('table.clean-schedule-grid, table#scheduleTable');
        if(!table)return html;
        const bodyRows=[...table.querySelectorAll('tbody tr')];
        const displayStaff=(staffList||[]).filter(st=>{try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}});
        bodyRows.forEach((tr,rowIndex)=>{
          const st=displayStaff[rowIndex];if(!st)return;
          const dateCells=[...tr.children].slice(-dates.length);
          dates.forEach((date,i)=>{
            const cell=dateCells[i];if(!cell)return;
            let leave=null;try{leave=typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(st.id,date):null;}catch(_){}
            if(!leave||!actualLeave(leave))return;
            const rank=rankFor(leave,date);if(!rank)return;
            const stack=cell.querySelector('.clean-cell-stack')||cell;
            if(stack.querySelector('.v431-leave-rank-cell'))return;
            stack.insertAdjacentHTML('afterbegin',`<span class="v431-leave-rank-cell" title="ลำดับลา ${rank}" aria-label="ลำดับลา ${rank}">${esc(circled(rank))}</span>`);
          });
        });
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(_){}
      return html;
    };
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  // Dashboard: full label + chronological sorting. "ไม่รับเวร" remains after actual leave items and has no leave rank.
  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV431(){
      const d=typeof todayStr==='function'?todayStr():new Date().toISOString().slice(0,10);
      let html=String(oldDashboard.apply(this,arguments)||'');
      const seq=leaveSequenceForDate(d);
      if(!seq.length)return html;
      const rankByNick=new Map();
      seq.forEach(x=>{let n='';try{n=typeof staffNick==='function'?staffNick(x.staff_id):'';}catch(_){}if(n)rankByNick.set(String(n).trim(),x.rank);});
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const cards=[...tpl.content.querySelectorAll('.card')];
        const card=cards.find(c=>String(c.querySelector('h3')?.textContent||'').includes('ลา / ไม่รับเวรวันนี้'));
        const list=card?.querySelector('.v397-today-list');
        if(!card||!list)return html;
        const items=[...list.querySelectorAll(':scope > .v397-today-item')];
        items.forEach((item,index)=>{
          const nameEl=item.querySelector('b');
          const nick=String(nameEl?.textContent||'').trim();
          const isNoDuty=String(item.textContent||'').includes('ไม่รับเวร');
          const rank=!isNoDuty?rankByNick.get(nick):null;
          item.dataset.v431OriginalOrder=String(index);
          item.dataset.v431LeaveRank=rank?String(rank):'';
          if(rank&&nameEl&&!item.querySelector('.v431-leave-rank-badge')){
            nameEl.insertAdjacentHTML('afterend',` <span class="v431-leave-rank-badge">ลำดับลา ${rank}</span>`);
          }
        });
        items.sort((a,b)=>{
          const ar=Number(a.dataset.v431LeaveRank||99999),br=Number(b.dataset.v431LeaveRank||99999);
          if(ar!==br)return ar-br;
          return Number(a.dataset.v431OriginalOrder||0)-Number(b.dataset.v431OriginalOrder||0);
        }).forEach(x=>list.appendChild(x));
        const title=card.querySelector('.section-title');
        if(title&&!card.querySelector('.v431-rank-help'))title.insertAdjacentHTML('afterend','<div class="v431-rank-help">ลำดับลาเรียงตามเวลาที่บันทึกคำลา</div>');
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(_){}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  // Calendar: prefix the compact sequence in titles and show the full rank in detail/pop-up.
  const oldCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof oldCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV431(){
      const rows=oldCollect.apply(this,arguments)||[];
      return rows.map(e=>{
        if(!e?.raw||!actualLeave(e.raw))return e;
        const rank=rankFor(e.raw,e.date);if(!rank)return e;
        const title=String(e.title||'');
        return {...e,leaveRankV431:rank,title:title.startsWith(circled(rank))?title:`${circled(rank)} ${title}`};
      });
    };
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  const oldCalendarDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof oldCalendarDetail==='function'){
    const wrappedDetail=function calendarEventDetailV431(e){
      const base=String(oldCalendarDetail.apply(this,arguments)||'');
      const rank=Number(e?.leaveRankV431)||((e?.raw&&actualLeave(e.raw)&&e?.date)?rankFor(e.raw,e.date):null);
      if(!rank)return base;
      return `<br><span class="v431-calendar-rank">ลำดับลา ${rank}</span>${base}`;
    };
    try{window.calendarEventDetail=calendarEventDetail=wrappedDetail;}catch(_){window.calendarEventDetail=wrappedDetail;}
  }

  const style=document.createElement('style');style.id='v431-leave-sequence-style';style.textContent=`
    .v431-leave-rank-cell{display:inline-flex;align-items:center;justify-content:center;margin:0 auto 1px;color:#1d5e9c;font-size:12px;font-weight:950;line-height:1;white-space:nowrap}
    .v431-leave-rank-badge{display:inline-flex;align-items:center;justify-content:center;width:max-content;padding:2px 7px;border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;color:#1d5e9c;font-size:10px;font-weight:900;line-height:1.25;white-space:nowrap;margin-left:5px}
    .v431-rank-help{margin:-3px 0 9px;color:#6b7f93;font-size:11px;font-weight:700}.v431-calendar-rank{display:inline-flex;padding:2px 7px;border-radius:999px;background:#eff6ff;color:#1d5e9c;font-weight:850;font-size:11px}
    @media(max-width:820px){.v431-leave-rank-cell{font-size:10px}.v431-leave-rank-badge{font-size:9px;padding:2px 6px}.v431-rank-help{font-size:10px}}
  `;document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v431-leave-sequence.js", error); }
;

/* Original source: patch-v432-compact-roster-leave-and-calendar-order.js */
try {
/* CNMI Staff Planner V432
 * Compact monthly roster leave labels + chronological leave order in Calendar day popup.
 * Scope:
 *   - monthly roster table (web/mobile and image-export clone)
 *   - calendar event ordering for leave items only
 *   - NO dashboard changes
 * Export layout is tuned against the 31-day (maximum-width) month.
 */
(function(){
  'use strict';
  const VERSION='V432_COMPACT_ROSTER_LEAVE_CALENDAR_ORDER';
  if(window.__CNMI_V432_COMPACT_ROSTER_LEAVE_CALENDAR_ORDER__)return;
  window.__CNMI_V432_COMPACT_ROSTER_LEAVE_CALENDAR_ORDER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function actualLeave(row){
    if(!row)return false;
    try{if(typeof isLeaveEffective==='function'&&!isLeaveEffective(row))return false;}catch(_){}
    let t='';
    try{t=typeof leaveDisplayType==='function'?leaveDisplayType(row):String(row?.type||row?.leave_type||'').split(':::')[0].trim();}catch(_){t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'ลา'):String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
  }
  function shortType(row){
    const t=leaveType(row);
    const map={
      'ลาพักผ่อน':'พัก','ลาพักร้อน':'พัก','ลากิจ':'กิจ','ลาป่วย':'ป่วย','ลาคลอด':'คลอด',
      'ลาอุปสมบท':'บวช','ลาศึกษา':'ศึกษา','ลาฝึกอบรม':'อบรม','ลาอื่นๆ':'ลา','ลาอื่น':'ลา'
    };
    if(map[t])return map[t];
    const compact=t.replace(/^ลา\s*/,'').trim();
    return compact||'ลา';
  }
  function periodShort(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim();
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return '';
    if(/เช้า|morning/i.test(raw))return '½ช';
    if(/บ่าย|afternoon/i.test(raw))return '½บ';
    // Keep uncommon custom periods informative, but compact.
    const clock=raw.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if(clock)return `${clock[1]}–${clock[2]}`;
    return raw.length<=7?raw:raw.slice(0,7);
  }
  function rankFor(row,date){
    try{return Number(window.cnmiLeaveSequenceV431?.rankFor?.(row,date))||null;}catch(_){return null;}
  }
  function circled(rank){
    try{return window.cnmiLeaveSequenceV431?.circled?.(rank)||String(rank||'');}catch(_){return String(rank||'');}
  }
  function lateFor(row,date){
    try{return !!window.cnmiLateLeaveV430?.isLateLeaveForDate?.(row,date);}catch(_){return false;}
  }
  function activeLeave(staffId,date){
    try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}
  }
  function rosterEnabled(st){
    try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}
  }
  function monthDates(key){
    try{
      const rows=typeof scheduleMonthDates==='function'?scheduleMonthDates(String(key||'').slice(0,7)):[];
      return Array.isArray(rows)?rows.map(normDate).filter(Boolean):[];
    }catch(_){return [];}
  }
  function cellLeaveBadge(stack,row){
    if(!stack||!row)return null;
    let cls='';
    try{cls=typeof leaveCellClass==='function'?String(leaveCellClass(leaveType(row))||''):'';}catch(_){}
    if(cls){const hit=stack.querySelector(`.mini-status.${cls}`);if(hit)return hit;}
    return stack.querySelector('.mini-status');
  }
  function compactLabel(row,date){
    const rank=rankFor(row,date);
    const bits=[];
    if(rank)bits.push(circled(rank));
    bits.push(shortType(row));
    const p=periodShort(row);if(p)bits.push(p);
    return bits.filter(Boolean).join(' ');
  }
  function fullTitle(row,date){
    const rank=rankFor(row,date);
    const p=String(row?.leave_period||row?.period||'เต็มวัน').trim()||'เต็มวัน';
    const late=lateFor(row,date);
    return `${rank?`ลำดับลา ${rank} · `:''}${leaveType(row)} · ${p}${late?' · ลานอกตาราง':''}`;
  }

  // Monthly roster: one compact leave line, then duty pills beneath it.
  // Dashboard deliberately untouched.
  const oldRenderGridView=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldRenderGridView==='function'){
    const wrappedGrid=function renderGridViewV432(staffList,assignments,key){
      let html=String(oldRenderGridView.apply(this,arguments)||'');
      const dates=monthDates(key||S().monthKey);
      if(!dates.length)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const table=tpl.content.querySelector('table.clean-schedule-grid,table#scheduleTable');
        if(!table)return html;
        const staff=(staffList||[]).filter(rosterEnabled);
        const bodyRows=[...table.querySelectorAll('tbody tr')];
        let hasLeave=false;
        bodyRows.forEach((tr,rowIndex)=>{
          const st=staff[rowIndex];if(!st)return;
          const cells=[...tr.children].slice(-dates.length);
          dates.forEach((date,i)=>{
            const cell=cells[i];if(!cell)return;
            const leave=activeLeave(st.id,date);
            if(!actualLeave(leave))return;
            hasLeave=true;
            const stack=cell.querySelector('.clean-cell-stack')||cell;
            // V431 used a separate line for the rank; V432 folds it into the leave label.
            stack.querySelectorAll('.v431-leave-rank-cell').forEach(n=>n.remove());
            // V430 text badge is replaced with an orange border on the leave pill.
            stack.querySelectorAll('.v430-late-leave-badge').forEach(n=>n.remove());
            const badge=cellLeaveBadge(stack,leave);
            if(!badge)return;
            const label=compactLabel(leave,date);
            badge.classList.add('v432-compact-leave');
            badge.classList.toggle('v432-late-compact',lateFor(leave,date));
            badge.setAttribute('title',fullTitle(leave,date));
            badge.setAttribute('aria-label',fullTitle(leave,date));
            badge.innerHTML=`<span class="v432-compact-leave-text">${esc(label)}</span>`;
          });
        });
        if(hasLeave&&!tpl.content.querySelector('.v432-roster-legend')){
          const legend=document.createElement('div');
          legend.className='v432-roster-legend';
          legend.innerHTML='<span>①②③… = ลำดับลา</span><span>กรอบส้ม = ลานอกตาราง</span><span>½ช = ครึ่งเช้า</span><span>½บ = ครึ่งบ่าย</span>';
          const gridWrap=table.closest('.table-wrap,.clean-grid-wrap')||table;
          gridWrap.insertAdjacentElement('afterend',legend);
        }
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn(`${VERSION} roster compact failed`,err);}
      return html;
    };
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  // Calendar: preserve the existing event categories/positions, but sort leave rows occupying
  // the leave slots of each date by the original submission rank 1 -> 2 -> 3 -> ... .
  // This fixes the day popup without redesigning the Calendar UI.
  const oldCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof oldCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV432(){
      const rows=oldCollect.apply(this,arguments)||[];
      const out=Array.isArray(rows)?rows.slice():[];
      const byDate=new Map();
      out.forEach((e,index)=>{
        if(!e?.raw)return;
        const isNoDuty=String(e?.type||'')==='noduty'||String(e?.raw?.type||e?.raw?.leave_type||'').split(':::')[0].trim()==='ไม่รับเวร';
        if(!actualLeave(e.raw)&&!isNoDuty)return;
        const d=normDate(e.date);if(!d)return;
        // Actual leave is ordered 1..n; no-duty stays after actual leave rows.
        const rank=actualLeave(e.raw)?(Number(e.leaveRankV431)||rankFor(e.raw,d)||89999):(90000+index);
        if(!byDate.has(d))byDate.set(d,[]);
        byDate.get(d).push({index,event:e,rank});
      });
      byDate.forEach(items=>{
        if(items.length<2)return;
        const positions=items.map(x=>x.index).sort((a,b)=>a-b);
        const sorted=items.slice().sort((a,b)=>a.rank-b.rank||a.index-b.index).map(x=>x.event);
        positions.forEach((pos,i)=>{out[pos]=sorted[i];});
      });
      return out;
    };
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  const style=document.createElement('style');style.id='v432-compact-roster-style';style.textContent=`
    /* Web/mobile monthly roster */
    .clean-schedule-grid .v432-compact-leave{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:max-content!important;max-width:100%!important;min-height:0!important;padding:2px 5px!important;margin:0 auto!important;line-height:1.05!important;white-space:nowrap!important;font-size:11px!important;font-weight:900!important;box-sizing:border-box!important}
    .clean-schedule-grid .v432-compact-leave-text{display:block;white-space:nowrap;line-height:1.05}
    .clean-schedule-grid .v432-late-compact{border:1.5px solid #f59e0b!important;box-shadow:0 0 0 1px rgba(245,158,11,.13)!important}
    .clean-schedule-grid td.v430-late-leave-cell{box-shadow:none!important}
    .clean-schedule-grid .clean-cell-stack>.v430-late-leave-badge,.clean-schedule-grid .v431-leave-rank-cell{display:none!important}
    .v432-roster-legend{display:flex;flex-wrap:wrap;gap:5px 12px;align-items:center;margin:7px 2px 0;color:#61758a;font-size:10px;font-weight:750;line-height:1.25}
    .v432-roster-legend span{white-space:nowrap}
    @media(max-width:820px){
      .clean-schedule-grid .v432-compact-leave{font-size:10px!important;padding:2px 4px!important}
      .v432-roster-legend{font-size:9px;gap:4px 9px;margin-top:5px}
    }

    /* Image export: compact enough for the worst-case 31-day month while keeping all staff readable. */
    .schedule-export-clone .schedule-brand-header{display:flex!important;align-items:center!important;gap:8px!important;margin:2px 0 5px!important;padding:5px 8px!important;border-radius:10px!important;min-height:0!important}
    .schedule-export-clone .schedule-brand-logo-circle{width:42px!important;height:42px!important;border-width:2px!important;box-shadow:none!important}
    .schedule-export-clone .schedule-brand-logo-main{font-size:15px!important}.schedule-export-clone .schedule-brand-logo-sub{font-size:7px!important;margin-top:2px!important}
    .schedule-export-clone .schedule-brand-copy{display:flex!important;flex-direction:row!important;align-items:baseline!important;gap:7px!important;white-space:nowrap!important}
    .schedule-export-clone .schedule-brand-unit{font-size:11px!important}.schedule-export-clone .schedule-export-title{font-size:13px!important}.schedule-export-clone .schedule-export-subtitle{font-size:11px!important}
    .schedule-export-clone .clean-schedule-grid thead th{padding:3px 2px!important;font-size:10px!important;line-height:1.05!important}
    .schedule-export-clone .clean-schedule-grid tbody th,.schedule-export-clone .clean-schedule-grid tbody td{padding:2px!important;font-size:10px!important;line-height:1.05!important;vertical-align:middle!important}
    .schedule-export-clone .clean-schedule-grid tbody tr{height:34px!important}
    .schedule-export-clone .clean-cell-stack{gap:1px!important;min-height:30px!important;justify-content:center!important}
    .schedule-export-clone .clean-schedule-grid .v432-compact-leave{font-size:9px!important;padding:1px 3px!important;line-height:1!important}
    .schedule-export-clone .clean-schedule-grid .clean-shift-pill{font-size:9px!important;line-height:1!important;min-height:0!important;padding:2px 5px!important;margin:0 auto!important;border-radius:999px!important}
    .schedule-export-clone .clean-schedule-grid .muted{font-size:9px!important;line-height:1!important}
    .schedule-export-clone .v432-roster-legend{margin:4px 2px 0!important;font-size:9px!important;gap:3px 10px!important;line-height:1.1!important}
  `;document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v432-compact-roster-leave-and-calendar-order.js", error); }
;

/* Original source: patch-v433-dashboard-manpower-after-leave.js */
try {
/* CNMI Staff Planner V433
 * Dashboard manpower summary after leave.
 * - Replaces the low-value "เจ้าหน้าที่ทั้งหมด" stat card with morning/afternoon manpower.
 * - Splits active staff into MT / เคิก / แพทย์.
 * - Full-day leave subtracts both periods; half-morning / half-afternoon subtracts only that period.
 * - "ไม่รับเวร" and activities do NOT subtract daytime manpower.
 * - Display-only. No Supabase query/write/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V433_DASHBOARD_MANPOWER_AFTER_LEAVE';
  if(window.__CNMI_V433_DASHBOARD_MANPOWER_AFTER_LEAVE__)return;
  window.__CNMI_V433_DASHBOARD_MANPOWER_AFTER_LEAVE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function dToday(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function overlaps(row,date){try{return typeof overlapsDate==='function'?overlapsDate(row,date):String(row?.start_date||'').slice(0,10)<=date&&String(row?.end_date||row?.start_date||'').slice(0,10)>=date;}catch(_){return false;}}
  function isActualLeave(row){
    if(!row||!effective(row))return false;
    const type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!type&&type!=='ไม่รับเวร';
  }
  function periodKind(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(raw.includes('ครึ่งเช้า')||raw.includes('morning'))return 'morning';
    if(raw.includes('ครึ่งบ่าย')||raw.includes('afternoon'))return 'afternoon';
    return 'full';
  }
  function groupOf(staff){
    const type=String(staff?.staff_type||'').trim();
    const role=String(staff?.role||'').trim();
    const text=`${type} ${role}`;
    if(window.cnmiPersonTypeV516?.isPhysician?.(staff) ?? /^(แพทย์|physician|doctor)$/i.test(type))return 'แพทย์';
    if(type==='เคิก'||/clerk|ธุรการ/i.test(text))return 'เคิก';
    return 'MT';
  }
  function activeStaff(){return (S().staff||[]).filter(x=>!!x?.is_active);}
  function manpowerForDate(date){
    const staff=activeStaff();
    const byId=new Map(staff.map(s=>[String(s.id),s]));
    const absentMorning=new Set();
    const absentAfternoon=new Set();
    (S().leaves||[]).forEach(row=>{
      if(!isActualLeave(row)||!overlaps(row,date))return;
      const sid=String(row?.staff_id||'');
      if(!sid||!byId.has(sid))return;
      const kind=periodKind(row);
      if(kind==='full'||kind==='morning')absentMorning.add(sid);
      if(kind==='full'||kind==='afternoon')absentAfternoon.add(sid);
    });
    const groups=['MT','เคิก','แพทย์'];
    const total=Object.fromEntries(groups.map(g=>[g,0]));
    const morning=Object.fromEntries(groups.map(g=>[g,0]));
    const afternoon=Object.fromEntries(groups.map(g=>[g,0]));
    staff.forEach(s=>{
      const sid=String(s.id),g=groupOf(s);
      total[g]=(total[g]||0)+1;
      if(!absentMorning.has(sid))morning[g]=(morning[g]||0)+1;
      if(!absentAfternoon.has(sid))afternoon[g]=(afternoon[g]||0)+1;
    });
    const sum=obj=>groups.reduce((n,g)=>n+(Number(obj[g])||0),0);
    return {date,total,morning,afternoon,totalCount:sum(total),morningCount:sum(morning),afternoonCount:sum(afternoon),absentMorning,absentAfternoon};
  }
  window.cnmiDashboardManpowerV433={manpowerForDate,periodKind,groupOf};

  function typeLine(label,counts,total){
    return `<div class="v433-type-line"><b>${esc(label)}</b><span>MT <strong>${counts.MT||0}</strong>/${total.MT||0}</span><span>เคิก <strong>${counts['เคิก']||0}</strong>/${total['เคิก']||0}</span><span>แพทย์ <strong>${counts['แพทย์']||0}</strong>/${total['แพทย์']||0}</span></div>`;
  }
  function manpowerCard(m){
    return `<div class="card v433-manpower-card" data-v433-manpower>
      <div class="v433-manpower-title">กำลังคนวันนี้ <small>หลังหักลา</small></div>
      <div class="v433-period-totals">
        <div><span>เช้า</span><strong>${m.morningCount}</strong><small>คน</small></div>
        <div class="v433-divider" aria-hidden="true"></div>
        <div><span>บ่าย</span><strong>${m.afternoonCount}</strong><small>คน</small></div>
      </div>
      <div class="v433-type-breakdown">
        ${typeLine('เช้า',m.morning,m.total)}
        ${typeLine('บ่าย',m.afternoon,m.total)}
      </div>
      <div class="v433-manpower-note">เต็มวันหักทั้งวัน · ครึ่งวันหักเฉพาะช่วง · ไม่รับเวร/กิจกรรมยังไม่หัก</div>
    </div>`;
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV433(){
      let html=String(oldDashboard.apply(this,arguments)||'');
      try{
        const m=manpowerForDate(dToday());
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const stats=tpl.content.querySelector('.v401-dashboard-stats');
        if(!stats)return html;
        const cards=[...stats.querySelectorAll(':scope > .stat-card')];
        const totalCard=cards.find(c=>String(c.querySelector('.label')?.textContent||'').includes('เจ้าหน้าที่ทั้งหมด'))||cards[cards.length-1];
        if(totalCard){
          const box=document.createElement('template');box.innerHTML=manpowerCard(m).trim();
          totalCard.replaceWith(box.content.firstElementChild);
        }else{
          stats.insertAdjacentHTML('beforeend',manpowerCard(m));
        }
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn('[V433] manpower render fallback',err);}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v433-dashboard-manpower';
  style.textContent=`
    .v433-manpower-card{display:grid;gap:8px;align-content:start}
    .v433-manpower-title{color:#60758b;font-weight:850;font-size:14px;line-height:1.25}
    .v433-manpower-title small{font-size:10px;font-weight:800;color:#8b9bae;margin-left:4px}
    .v433-period-totals{display:grid;grid-template-columns:1fr 1px 1fr;align-items:center;gap:10px;padding:1px 0 2px}
    .v433-period-totals>div:not(.v433-divider){display:flex;align-items:baseline;gap:5px;min-width:0}
    .v433-period-totals span{font-size:13px;font-weight:850;color:#36536f}
    .v433-period-totals strong{font-size:29px;line-height:1;color:var(--primary-dark,#237db7);font-weight:950}
    .v433-period-totals small{font-size:10px;font-weight:800;color:#75899e}
    .v433-divider{height:27px;background:#dce7f0;border-radius:999px}
    .v433-type-breakdown{display:grid;gap:4px;border-top:1px solid #e5edf4;padding-top:7px}
    .v433-type-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#60758b;font-size:10px;line-height:1.25}
    .v433-type-line>b{color:#2d4a65;font-size:10px;min-width:25px}
    .v433-type-line span{white-space:nowrap}
    .v433-type-line strong{color:#20384f;font-size:11px}
    .v433-manpower-note{font-size:9px;line-height:1.3;color:#8a9bad}
    @media(max-width:820px){
      .v433-manpower-card{padding-top:16px!important;padding-bottom:15px!important;gap:10px}
      .v433-manpower-title{font-size:16px}.v433-manpower-title small{font-size:11px}
      .v433-period-totals{max-width:360px;gap:14px}
      .v433-period-totals strong{font-size:34px}.v433-period-totals span{font-size:15px}.v433-period-totals small{font-size:11px}
      .v433-type-breakdown{gap:6px;padding-top:9px}
      .v433-type-line{font-size:12px;gap:10px}.v433-type-line>b{font-size:12px;min-width:30px}.v433-type-line strong{font-size:13px}
      .v433-manpower-note{font-size:10px}
    }
    @media(max-width:390px){
      .v433-type-line{gap:7px;font-size:11px}.v433-type-line>b{font-size:11px;min-width:27px}.v433-type-line strong{font-size:12px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v433-dashboard-manpower-after-leave.js", error); }
;

/* Original source: patch-v434-dashboard-daytime-positions.js */
try {
/* CNMI Staff Planner V434
 * Dashboard compact daytime-position summary.
 * - Adds today's daytime positions to "ภาพรวมวันนี้" without changing the existing detail page.
 * - Shows compact position -> staff assignments grouped by Blood Bank / Donor Room / ออกหน่วย.
 * - Shows assigned/total and vacancy count at a glance.
 * - Admin can jump to the existing daily-position page to edit; Staff can still use that page for detail.
 * - Display-only. No Supabase query/write/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V434_DASHBOARD_DAYTIME_POSITIONS';
  if(window.__CNMI_V434_DASHBOARD_DAYTIME_POSITIONS__)return;
  window.__CNMI_V434_DASHBOARD_DAYTIME_POSITIONS__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function today(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function codeOf(row){return String(row?.position_code||row?.code||'').trim();}
  function codeKey(v){return String(v||'').toLowerCase().replace(/\s+/g,'');}
  function labelOf(row){
    const code=codeOf(row);
    try{return typeof positionLabelForCell==='function'?String(positionLabelForCell(code)||code):code;}catch(_){return code;}
  }
  function zoneOf(row){
    const code=codeOf(row);
    const z=String(row?.zone||'').trim();
    if(z==='ออกหน่วย'||row?.is_outing===true||/^OUTING:/i.test(String(row?.eligibility_code||'')))return 'ออกหน่วย';
    if(z==='Blood Bank'||z==='Manual'||/^BB-/i.test(code)||/manual/i.test(code))return 'Blood Bank';
    if(z==='Donor Room'||/^DR-/i.test(code))return 'Donor Room';
    return z||'อื่นๆ';
  }
  function formatDate(date){try{return formatThaiDate(date);}catch(_){return date;}}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function noPositionDay(date){try{return typeof isNoPositionDay==='function'&&!!isNoPositionDay(date);}catch(_){return false;}}
  function staffHtml(id){
    if(!id)return '<span class="v434-vacant-pill">ว่าง</span>';
    try{return staffPill(id);}catch(_){
      const st=(S().staff||[]).find(x=>String(x?.id)===String(id));
      return `<span class="v434-staff-fallback">${esc(st?.nickname||st?.full_name||'-')}</span>`;
    }
  }
  function statusFor(date){return (S().positionDayStatus||[]).find(x=>norm(x?.work_date)===date)||null;}

  function dedupeAndSort(rows){
    const map=new Map();
    (rows||[]).forEach((row,index)=>{
      const code=codeOf(row);if(!code)return;
      const key=codeKey(code);
      const old=map.get(key);
      if(!old){map.set(key,{row,index});return;}
      const a=String(old.row?.updated_at||old.row?.created_at||'');
      const b=String(row?.updated_at||row?.created_at||'');
      if(b>=a)map.set(key,{row,index});
    });
    let out=[...map.values()].sort((a,b)=>a.index-b.index).map(x=>x.row);
    try{if(typeof sortPositionRows==='function')out=sortPositionRows(out);}catch(_){ }
    return out;
  }
  function rowsFor(date){
    return dedupeAndSort((S().positions||[]).filter(row=>norm(row?.work_date)===date&&codeOf(row)));
  }
  function zoneOrder(z){return z==='Blood Bank'?1:z==='Donor Room'?2:z==='ออกหน่วย'?3:9;}
  function groupRows(rows){
    const groups=new Map();
    rows.forEach(row=>{const z=zoneOf(row);if(!groups.has(z))groups.set(z,[]);groups.get(z).push(row);});
    return [...groups.entries()].sort((a,b)=>zoneOrder(a[0])-zoneOrder(b[0])||a[0].localeCompare(b[0],'th'));
  }
  function compactStatus(rows,date){
    const assigned=rows.filter(r=>!!r?.staff_id).length;
    const total=rows.length;
    const vacant=Math.max(0,total-assigned);
    const status=String(statusFor(date)?.status||'').toLowerCase();
    const publishBadge=status==='published'?'<span class="badge green v434-publish-badge">ประกาศแล้ว</span>':(status?'<span class="badge v434-draft-badge">ร่าง</span>':'');
    const vacancy=vacant?`<span class="v434-vacancy-badge">ว่าง ${vacant}</span>`:`<span class="v434-complete-badge">ครบ ${assigned}/${total}</span>`;
    const fraction=vacant?`<span class="v434-assigned-count">จัดแล้ว ${assigned}/${total}</span>`:'';
    return `${vacancy}${fraction}${publishBadge}`;
  }
  function positionItem(row){
    const label=labelOf(row);
    return `<div class="v434-position-item${row?.staff_id?'':' is-vacant'}" title="${esc(label)}">
      <div class="v434-position-code">${esc(label)}</div>
      <div class="v434-position-staff">${staffHtml(row?.staff_id)}</div>
    </div>`;
  }
  function groupHtml(zone,rows){
    const assigned=rows.filter(r=>!!r?.staff_id).length;
    return `<section class="v434-zone-group">
      <div class="v434-zone-head"><b>${esc(zone)}</b><span>${assigned}/${rows.length}</span></div>
      <div class="v434-position-grid">${rows.map(positionItem).join('')}</div>
    </section>`;
  }
  function cardHtml(date){
    const rows=rowsFor(date);
    if(!rows.length){
      if(noPositionDay(date))return '';
      return `<div class="card v434-daytime-card" data-v434-daytime-positions>
        <div class="section-title v434-title"><div><h3>ตำแหน่งกลางวันวันนี้</h3><span class="hint">${esc(formatDate(date))}</span></div>${admin()?'<button type="button" class="soft-btn v434-jump-btn" data-nav="positions">จัดตำแหน่ง</button>':''}</div>
        <div class="v434-empty">ยังไม่ได้จัดตำแหน่งกลางวันสำหรับวันนี้</div>
      </div>`;
    }
    const groups=groupRows(rows);
    return `<div class="card v434-daytime-card" data-v434-daytime-positions>
      <div class="section-title v434-title">
        <div><h3>ตำแหน่งกลางวันวันนี้</h3><span class="hint">${esc(formatDate(date))}</span></div>
        <div class="v434-head-actions"><div class="v434-summary-badges">${compactStatus(rows,date)}</div>${admin()?'<button type="button" class="soft-btn v434-jump-btn" data-nav="positions">จัด/แก้ไข</button>':''}</div>
      </div>
      <div class="v434-groups">${groups.map(([z,list])=>groupHtml(z,list)).join('')}</div>
    </div>`;
  }

  window.cnmiDashboardPositionsV434={rowsFor,groupRows,zoneOf,cardHtml};

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV434(){
      let html=String(oldDashboard.apply(this,arguments)||'');
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const detail=tpl.content.querySelector('.v401-dashboard-details');
        if(detail&&!tpl.content.querySelector('[data-v434-daytime-positions]')){
          const card=cardHtml(today());
          if(card){
            const t=document.createElement('template');t.innerHTML=card.trim();
            detail.parentNode.insertBefore(t.content.firstElementChild,detail);
          }
        }
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn('[V434] dashboard position render fallback',err);}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v434-dashboard-daytime-positions';
  style.textContent=`
    .v434-daytime-card{margin-bottom:14px}
    .v434-title{align-items:flex-start;gap:12px;margin-bottom:10px}
    .v434-title>div:first-child{min-width:0}
    .v434-title h3{margin:0 0 2px;font-size:18px}
    .v434-title .hint{font-size:11px}
    .v434-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
    .v434-summary-badges{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap}
    .v434-vacancy-badge,.v434-complete-badge,.v434-assigned-count{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:10px;line-height:1;font-weight:850;white-space:nowrap}
    .v434-vacancy-badge{background:#fff1df;color:#a85a00;border:1px solid #ffd39d}
    .v434-complete-badge{background:#e9f8ee;color:#16713a;border:1px solid #bfe8cc}
    .v434-assigned-count{background:#eef5fb;color:#587087}
    .v434-publish-badge,.v434-draft-badge{font-size:9px!important;padding:4px 7px!important}
    .v434-draft-badge{background:#f1f4f7;color:#697d91}
    .v434-jump-btn{padding:6px 9px!important;font-size:10px!important;white-space:nowrap}
    .v434-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
    .v434-zone-group{min-width:0;border:1px solid #e2ebf3;border-radius:12px;background:#fbfdff;padding:9px}
    .v434-zone-group:only-child{grid-column:1/-1}
    .v434-zone-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 1px 7px;color:#36536f;font-size:11px}
    .v434-zone-head b{font-size:12px}.v434-zone-head span{color:#7b8fa3;font-size:10px;font-weight:800}
    .v434-position-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .v434-position-item{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;padding:7px 8px;border:1px solid #e6edf4;border-radius:10px;background:#fff;min-height:42px}
    .v434-position-item.is-vacant{background:#fffaf4;border-color:#ffd9aa}
    .v434-position-code{min-width:0;color:#314d68;font-size:10px;font-weight:850;line-height:1.15;overflow-wrap:anywhere}
    .v434-position-staff{min-width:0;display:flex;justify-content:flex-end;align-items:center}
    .v434-position-staff .staff-color-pill{font-size:10px!important;line-height:1!important;padding:5px 8px!important;min-width:0;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .v434-vacant-pill{display:inline-flex;padding:4px 7px;border-radius:999px;background:#fff0dc;color:#a85a00;font-size:9px;font-weight:900;border:1px solid #ffd39d;white-space:nowrap}
    .v434-staff-fallback{font-size:10px;font-weight:850;color:#314d68}
    .v434-empty{padding:12px;border-radius:10px;background:#f6f9fc;color:#71869a;font-size:12px;text-align:center}
    @media(max-width:900px){
      .v434-daytime-card{margin-bottom:14px;padding:15px!important}
      .v434-title{margin-bottom:11px}.v434-title h3{font-size:18px}.v434-title .hint{font-size:11px}
      .v434-groups{grid-template-columns:1fr;gap:9px}
      .v434-zone-group:only-child{grid-column:auto}
      .v434-position-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .v434-position-item{grid-template-columns:1fr;gap:5px;align-content:center;min-height:58px;padding:8px 9px}
      .v434-position-code{font-size:12px;line-height:1.2}
      .v434-position-staff{justify-content:flex-start}
      .v434-position-staff .staff-color-pill{font-size:11px!important;padding:5px 9px!important;max-width:100%}
      .v434-vacant-pill{font-size:10px;padding:5px 8px}
      .v434-zone-head{font-size:12px}.v434-zone-head b{font-size:13px}.v434-zone-head span{font-size:11px}
      .v434-vacancy-badge,.v434-complete-badge,.v434-assigned-count{font-size:11px;padding:5px 8px}
    }
    @media(max-width:390px){
      .v434-daytime-card{padding:13px!important}
      .v434-title{display:grid;grid-template-columns:1fr;gap:8px}
      .v434-head-actions{justify-content:flex-start}
      .v434-summary-badges{justify-content:flex-start}
      .v434-position-grid{gap:6px}
      .v434-position-code{font-size:11px}
      .v434-position-item{padding:7px 8px;min-height:55px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v434-dashboard-daytime-positions.js", error); }
;

/* Original source: patch-v435-dashboard-position-description-popup.js */
try {
/* CNMI Staff Planner V435
 * Dashboard daytime-position quick description.
 * - Makes each position name in "ตำแหน่งกลางวันวันนี้" tappable/clickable.
 * - Opens a compact mobile-friendly summary with up to 3 main-duty bullets + break time.
 * - "ดูคำอธิบายตำแหน่งฉบับเต็ม" opens the complete duty detail without leaving Dashboard.
 * - Uses the current Slot metadata source when available (V381), with safe fallbacks.
 * - Display-only. No Supabase query/write/schema changes.
 */
(function(){
  'use strict';

  const VERSION='V435_DASHBOARD_POSITION_DESCRIPTION_POPUP';
  if(window.__CNMI_V435_DASHBOARD_POSITION_DESCRIPTION_POPUP__)return;
  window.__CNMI_V435_DASHBOARD_POSITION_DESCRIPTION_POPUP__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function esc(v){
    try{if(typeof escapeHtml==='function')return escapeHtml(v==null?'':String(v));}catch(_){ }
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function today(){
    try{return typeof todayStr==='function'?todayStr():'';}catch(_){ }
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function codeOf(row){return text(row?.position_code||row?.code);}
  function keyOf(v){return text(v).replace(/\s+/g,'').toLowerCase();}
  function useful(v){const s=text(v);return !!s&&!['-','--','—'].includes(s)&&!/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);}

  function labelOf(row){
    const code=codeOf(row)||'ตำแหน่ง';
    try{if(typeof positionLabelForCell==='function')return text(positionLabelForCell(code))||code;}catch(_){ }
    try{if(typeof labelCode==='function')return text(labelCode(code))||code;}catch(_){ }
    return code;
  }
  function zoneOf(row){
    try{return text(window.cnmiDashboardPositionsV434?.zoneOf?.(row))||text(row?.zone)||'-';}catch(_){return text(row?.zone)||'-';}
  }

  function masterFor(code){
    const key=keyOf(code);
    for(const list of [S()?.positionMasters,S()?.dailyPositionMasters]){
      if(!Array.isArray(list))continue;
      const found=list.find(row=>keyOf(codeOf(row))===key&&row?.is_active!==false&&!row?.deleted_at);
      if(found)return found;
    }
    try{if(typeof positionByCode==='function')return positionByCode(code)||null;}catch(_){ }
    return null;
  }

  function metadataFor(row,date){
    let current={};
    try{current=window.cnmiV381?.metadataFor?.(row,date)||{};}catch(_){current={};}
    const master=masterFor(codeOf(row))||{};
    let detail='';
    try{detail=text(window.cnmiV378?.detailOf?.(row,null));}catch(_){detail='';}
    return {
      zone: useful(current?.zone)?text(current.zone):(useful(row?.zone)?text(row.zone):(useful(master?.zone)?text(master.zone):zoneOf(row))),
      break_time: useful(current?.break_time)?text(current.break_time):(useful(row?.break_time)?text(row.break_time):(useful(master?.break_time)?text(master.break_time):'-')),
      main_rule: useful(current?.main_rule)?text(current.main_rule):(useful(row?.main_rule||row?.required_role)?text(row.main_rule||row.required_role):(useful(master?.main_rule||master?.required_role)?text(master.main_rule||master.required_role):'-')),
      job_desc: useful(current?.job_desc)?text(current.job_desc):(useful(row?.job_desc||row?.description)?text(row.job_desc||row.description):(useful(master?.job_desc||master?.description)?text(master.job_desc||master.description):(useful(detail)?detail:`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${codeOf(row)||'ที่ได้รับมอบหมาย'}`)))
    };
  }

  function rowsFor(date){
    try{
      const api=window.cnmiDashboardPositionsV434;
      if(api?.rowsFor&&api?.groupRows){
        const rows=api.rowsFor(date)||[];
        const groups=api.groupRows(rows)||[];
        return groups.flatMap(group=>Array.isArray(group?.[1])?group[1]:[]);
      }
    }catch(_){ }
    return (S()?.positions||[]).filter(row=>text(row?.work_date).slice(0,10)===date&&codeOf(row));
  }

  function splitMainDuties(job){
    const source=text(job).replace(/\r/g,'\n');
    if(!source)return[];
    let parts=source.split(/\n+|[•;]|,(?=\s|$)/).map(v=>text(v)).filter(Boolean);
    if(parts.length<2){
      parts=source.split(/\s+และ(?=การ|งาน|ทำ|ตรวจ|รับ|บันทึก|ดูแล|แจ้ง|นำ|จ่าย|เตรียม|ปั่น)/).map(v=>text(v)).filter(Boolean);
    }
    const clean=[];
    for(const part of parts){
      const item=part.replace(/^[\-–—•\s]+/,'').trim();
      if(item&&!clean.some(x=>x===item))clean.push(item);
    }
    return (clean.length?clean:[source]).slice(0,3);
  }

  function rowByIndex(index,date){
    const list=rowsFor(date);
    const row=list[Number(index)];
    return row||null;
  }

  function showSummary(row,date,index){
    if(!row)return;
    const meta=metadataFor(row,date);
    const duties=splitMainDuties(meta.job_desc);
    const dutyHtml=duties.map(item=>`<li>${esc(item)}</li>`).join('');
    const breakText=meta.break_time==='-'?'-':`${meta.break_time}${/^\d{1,2}:\d{2}$/.test(meta.break_time)?' น.':''}`;
    showModal(`
      <div class="v435-position-summary-modal" data-v435-row-index="${Number(index)}" data-v435-date="${esc(date)}">
        <div class="v435-modal-heading">
          <div>
            <h2>${esc(labelOf(row))}</h2>
            <span class="v435-zone-badge">${esc(meta.zone||zoneOf(row))}</span>
          </div>
        </div>
        <section class="v435-main-duty-box">
          <h3>หน้าที่หลัก</h3>
          <ul>${dutyHtml}</ul>
          <div class="v435-break-row"><span>เวลาพัก</span><b>${esc(breakText)}</b></div>
        </section>
        <button type="button" class="soft-btn v435-full-detail-btn" data-v435-full-detail="${Number(index)}" data-v435-date="${esc(date)}">ดูคำอธิบายตำแหน่งฉบับเต็ม</button>
      </div>
    `,{small:true});
  }

  function showFull(row,date,index){
    if(!row)return;
    const meta=metadataFor(row,date);
    const breakText=meta.break_time==='-'?'-':`${meta.break_time}${/^\d{1,2}:\d{2}$/.test(meta.break_time)?' น.':''}`;
    showModal(`
      <div class="v435-position-full-modal" data-v435-row-index="${Number(index)}" data-v435-date="${esc(date)}">
        <div class="v435-modal-heading">
          <div>
            <h2>${esc(labelOf(row))}</h2>
            <span class="v435-zone-badge">${esc(meta.zone||zoneOf(row))}</span>
          </div>
        </div>
        <div class="v435-full-meta-grid">
          <div><small>เวลาพัก</small><b>${esc(breakText)}</b></div>
          <div><small>ผู้ปฏิบัติหลัก / เงื่อนไข</small><b>${esc(meta.main_rule||'-')}</b></div>
        </div>
        <section class="v435-full-duty-box">
          <h3>รายละเอียดหน้าที่ที่ต้องทำ</h3>
          <p>${esc(meta.job_desc||'-')}</p>
        </section>
        <button type="button" class="soft-btn v435-back-summary-btn" data-v435-back-summary="${Number(index)}" data-v435-date="${esc(date)}">กลับหน้าที่หลัก</button>
      </div>
    `,{small:true});
  }

  function decorateCard(card,date){
    if(!card)return;
    const rows=rowsFor(date);
    const items=Array.from(card.querySelectorAll('.v434-position-item'));
    items.forEach((item,index)=>{
      const row=rows[index];
      const codeNode=item.querySelector('.v434-position-code');
      if(!row||!codeNode)return;
      codeNode.dataset.v435PositionOpen=String(index);
      codeNode.dataset.v435Date=date;
      codeNode.setAttribute('role','button');
      codeNode.setAttribute('tabindex','0');
      codeNode.setAttribute('aria-label',`ดูหน้าที่ตำแหน่ง ${labelOf(row)}`);
      codeNode.title='แตะดูหน้าที่ตำแหน่ง';
      codeNode.classList.add('v435-position-link');
      if(!codeNode.querySelector('.v435-info-mark')){
        const mark=document.createElement('span');
        mark.className='v435-info-mark';
        mark.textContent='i';
        mark.setAttribute('aria-hidden','true');
        codeNode.appendChild(mark);
      }
    });
    card.dataset.v435PositionDescriptions='1';
  }

  function decorateDashboard(root=document){
    const date=today();
    root.querySelectorAll?.('[data-v434-daytime-positions]').forEach(card=>decorateCard(card,date));
  }

  function decorateHtml(html){
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'');
      decorateDashboard(tpl.content);
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){
      console.warn(`[${VERSION}] dashboard HTML decoration skipped`,err);
      return html;
    }
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v435Wrapped){
    const wrapped=function renderDashboardV435(){
      return decorateHtml(previousDashboard.apply(this,arguments));
    };
    wrapped.__v435Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  let queued=false;
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorateDashboard(document);});
  }

  const root=document.getElementById('pageContent')||document.body;
  if(root&&!root.__v435DashboardPositionObserver){
    const observer=new MutationObserver(queue);
    observer.observe(root,{childList:true,subtree:true});
    root.__v435DashboardPositionObserver=observer;
  }

  document.addEventListener('click',event=>{
    const open=event.target?.closest?.('[data-v435-position-open]');
    if(open){
      event.preventDefault();
      event.stopPropagation();
      const index=Number(open.dataset.v435PositionOpen);
      const date=text(open.dataset.v435Date)||today();
      showSummary(rowByIndex(index,date),date,index);
      return;
    }
    const full=event.target?.closest?.('[data-v435-full-detail]');
    if(full){
      event.preventDefault();
      event.stopPropagation();
      const index=Number(full.dataset.v435FullDetail);
      const date=text(full.dataset.v435Date)||today();
      showFull(rowByIndex(index,date),date,index);
      return;
    }
    const back=event.target?.closest?.('[data-v435-back-summary]');
    if(back){
      event.preventDefault();
      event.stopPropagation();
      const index=Number(back.dataset.v435BackSummary);
      const date=text(back.dataset.v435Date)||today();
      showSummary(rowByIndex(index,date),date,index);
    }
  },true);

  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const open=event.target?.closest?.('[data-v435-position-open]');
    if(!open)return;
    event.preventDefault();
    const index=Number(open.dataset.v435PositionOpen);
    const date=text(open.dataset.v435Date)||today();
    showSummary(rowByIndex(index,date),date,index);
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v435-dashboard-position-description-popup';
  style.textContent=`
    .v434-position-code.v435-position-link{display:flex;align-items:center;gap:5px;width:max-content;max-width:100%;cursor:pointer;touch-action:manipulation;outline:none}
    .v434-position-code.v435-position-link:hover{color:#1677ae}
    .v434-position-code.v435-position-link:focus-visible{border-radius:7px;box-shadow:0 0 0 3px rgba(42,157,208,.18)}
    .v435-info-mark{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:15px;height:15px;border-radius:999px;background:#e9f5fb;color:#1682b8;border:1px solid #bfe2f2;font-size:10px;font-weight:900;font-family:Arial,sans-serif;line-height:1}
    .v435-position-summary-modal,.v435-position-full-modal{padding:2px 0 0}
    .v435-modal-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-right:34px;margin-bottom:14px}
    .v435-modal-heading h2{margin:0 0 7px;color:#20364d;font-size:22px;line-height:1.25;overflow-wrap:anywhere}
    .v435-zone-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:#edf6ff;color:#28648f;border:1px solid #d1e7fa;font-size:11px;font-weight:850}
    .v435-main-duty-box,.v435-full-duty-box{border:1px solid #dce8f3;border-radius:16px;background:#f9fcff;padding:14px 15px}
    .v435-main-duty-box h3,.v435-full-duty-box h3{margin:0 0 9px;color:#20364d;font-size:16px}
    .v435-main-duty-box ul{margin:0;padding-left:22px;color:#3c5369}
    .v435-main-duty-box li{margin:0 0 7px;line-height:1.5;overflow-wrap:anywhere}
    .v435-main-duty-box li:last-child{margin-bottom:0}
    .v435-break-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px;padding-top:11px;border-top:1px solid #e1ebf4;color:#5a7086}
    .v435-break-row b{color:#214763;font-size:15px;white-space:nowrap}
    .v435-full-detail-btn,.v435-back-summary-btn{width:100%;margin-top:12px;justify-content:center!important;padding:10px 14px!important;font-size:13px!important;font-weight:850!important}
    .v435-full-meta-grid{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr);gap:9px;margin-bottom:10px}
    .v435-full-meta-grid>div{min-width:0;padding:11px 12px;border-radius:13px;background:#f4f8fc;border:1px solid #e0e9f2}
    .v435-full-meta-grid small{display:block;margin-bottom:4px;color:#71879a;font-size:11px;font-weight:800}
    .v435-full-meta-grid b{display:block;color:#29465f;line-height:1.45;overflow-wrap:anywhere}
    .v435-full-duty-box{background:#fff}
    .v435-full-duty-box p{margin:0;color:#3c5369;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
    @media(max-width:820px){
      #modal:has(.v435-position-summary-modal),#modal:has(.v435-position-full-modal){place-items:end center;padding:0!important}
      #modal:has(.v435-position-summary-modal)>.modal-card,#modal:has(.v435-position-full-modal)>.modal-card{width:100%!important;max-width:none!important;max-height:82dvh!important;border-radius:24px 24px 0 0!important;padding:22px 18px max(22px,env(safe-area-inset-bottom))!important}
      .v435-modal-heading h2{font-size:21px}
      .v435-main-duty-box,.v435-full-duty-box{padding:13px 14px}
      .v435-main-duty-box li{font-size:14px}
      .v435-full-meta-grid{grid-template-columns:1fr}
    }
    @media(max-width:390px){
      .v435-modal-heading h2{font-size:19px}
      .v435-main-duty-box h3,.v435-full-duty-box h3{font-size:15px}
      .v435-main-duty-box li,.v435-full-duty-box p{font-size:13px}
    }
  `;
  document.head.appendChild(style);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});else queue();
  window.addEventListener('pageshow',queue);
  window.cnmiV435={version:VERSION,decorateDashboard,metadataFor,splitMainDuties,showSummary,showFull};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v435-dashboard-position-description-popup.js", error); }
;

/* Original source: patch-v436-no-duty-sequence.js */
try {
/* CNMI Staff Planner V436
 * No-duty sequence / ลำดับไม่รับเวร by the original submission timestamp.
 * Purpose:
 *   - keep leave sequence and no-duty sequence separate
 *   - show who submitted "ไม่รับเวร" #1, #2, #3 ... for each date
 *   - sort today's no-duty cards by the original submission time
 *   - show the sequence in Calendar detail and keep no-duty rows chronological
 *   - tapping the dashboard sequence badge shows the original submission timestamp
 * Historical/display-only: calculated from leave_requests.created_at; no schema/query/write change.
 */
(function(){
  'use strict';
  const VERSION='V436_NO_DUTY_SEQUENCE';
  if(window.__CNMI_V436_NO_DUTY_SEQUENCE__)return;
  window.__CNMI_V436_NO_DUTY_SEQUENCE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function timeMs(v){const n=Date.parse(String(v||''));return Number.isFinite(n)?n:NaN;}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function rowType(row){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  function noDuty(row){return !!row&&effective(row)&&rowType(row)==='ไม่รับเวร';}
  function overlaps(row,date){
    try{return typeof overlapsDate==='function'?overlapsDate(row,date):normDate(row?.start_date)<=date&&normDate(row?.end_date||row?.start_date)>=date;}
    catch(_){return false;}
  }
  function submittedMs(row){
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt]){
      const n=timeMs(v);if(Number.isFinite(n))return n;
    }
    const u=timeMs(row?.updated_at);return Number.isFinite(u)?u:Number.POSITIVE_INFINITY;
  }
  function staffOrder(id){
    const list=S().staff||[];
    const i=list.findIndex(x=>String(x?.id)===String(id));
    return i<0?99999:i;
  }
  function stableKey(row){return `${String(row?.id||'')}|${String(row?.staff_id||'')}`;}
  function staffNickSafe(id){try{return typeof staffNick==='function'?String(staffNick(id)||''):'';}catch(_){return '';}}

  function sequenceForDate(date){
    const d=normDate(date);if(!d)return [];
    const perStaff=new Map();
    (S().leaves||[]).forEach(row=>{
      if(!noDuty(row)||!overlaps(row,d))return;
      const sid=String(row?.staff_id||'');if(!sid)return;
      const existing=perStaff.get(sid);
      if(!existing||submittedMs(row)<submittedMs(existing))perStaff.set(sid,row);
    });
    const rows=[...perStaff.values()].sort((a,b)=>{
      const ta=submittedMs(a),tb=submittedMs(b);
      if(ta!==tb)return ta-tb;
      const oa=staffOrder(a?.staff_id),ob=staffOrder(b?.staff_id);
      if(oa!==ob)return oa-ob;
      return stableKey(a).localeCompare(stableKey(b),'th');
    });
    return rows.map((row,i)=>({
      row,
      rank:i+1,
      staff_id:String(row?.staff_id||''),
      submitted_ms:submittedMs(row)
    }));
  }
  function rankFor(row,date){
    if(!noDuty(row))return null;
    const sid=String(row?.staff_id||'');
    const hit=sequenceForDate(date).find(x=>x.staff_id===sid);
    return hit?hit.rank:null;
  }
  function submittedDateTime(row){
    const ms=submittedMs(row);
    if(!Number.isFinite(ms)||ms===Number.POSITIVE_INFINITY)return 'ไม่พบเวลาบันทึกเดิม';
    const d=new Date(ms);
    if(Number.isNaN(d.getTime()))return 'ไม่พบเวลาบันทึกเดิม';
    try{
      const date=d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
      const time=d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',hour12:false});
      return `${date} เวลา ${time} น.`;
    }catch(_){return d.toLocaleString();}
  }
  window.cnmiNoDutySequenceV436={sequenceForDate,rankFor,submittedMs,submittedDateTime};

  function today(){try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}}

  function decorateDashboardHtml(html){
    const date=today();
    const seq=sequenceForDate(date);
    if(!seq.length)return html;
    const byNick=new Map();
    seq.forEach(x=>{const nick=staffNickSafe(x.staff_id).trim();if(nick)byNick.set(nick,x);});
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const cards=[...tpl.content.querySelectorAll('.card')];
      const card=cards.find(c=>String(c.querySelector('h3')?.textContent||'').includes('ลา / ไม่รับเวรวันนี้'));
      const list=card?.querySelector('.v397-today-list');
      if(!card||!list)return html;

      const leaveItems=[];
      const noDutyItems=[];
      [...list.querySelectorAll(':scope > .v397-today-item')].forEach((item,index)=>{
        const isNoDuty=String(item.textContent||'').includes('ไม่รับเวร');
        if(!isNoDuty){leaveItems.push(item);return;}
        const nameEl=item.querySelector('b');
        const nick=String(nameEl?.textContent||'').trim();
        const hit=byNick.get(nick);
        const rank=hit?.rank||null;
        item.dataset.v436OriginalOrder=String(index);
        item.dataset.v436NoDutyRank=rank?String(rank):'';
        if(rank&&nameEl&&!item.querySelector('.v436-no-duty-rank-badge')){
          nameEl.insertAdjacentHTML('afterend',` <button type="button" class="v436-no-duty-rank-badge" data-v436-no-duty-rank="${rank}" data-v436-date="${esc(date)}" data-v436-staff="${esc(hit.staff_id)}" title="แตะดูเวลาที่บันทึกครั้งแรก">ลำดับไม่รับเวร ${rank}</button>`);
        }
        noDutyItems.push(item);
      });

      noDutyItems.sort((a,b)=>{
        const ar=Number(a.dataset.v436NoDutyRank||99999),br=Number(b.dataset.v436NoDutyRank||99999);
        if(ar!==br)return ar-br;
        return Number(a.dataset.v436OriginalOrder||0)-Number(b.dataset.v436OriginalOrder||0);
      });
      [...leaveItems,...noDutyItems].forEach(x=>list.appendChild(x));

      const help=card.querySelector('.v431-rank-help');
      if(help)help.textContent='ลำดับลาและลำดับไม่รับเวร แยกกัน เรียงตามเวลาที่บันทึกครั้งแรก';
      else{
        const title=card.querySelector('.section-title');
        if(title&&!card.querySelector('.v436-rank-help'))title.insertAdjacentHTML('afterend','<div class="v431-rank-help v436-rank-help">ลำดับลาและลำดับไม่รับเวร แยกกัน เรียงตามเวลาที่บันทึกครั้งแรก</div>');
      }

      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decoration skipped`,err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV436(){return decorateDashboardHtml(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  // Calendar: prefix no-duty titles with #rank and order no-duty rows by their own sequence.
  const oldCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof oldCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV436(){
      const rows=oldCollect.apply(this,arguments)||[];
      const out=Array.isArray(rows)?rows.map(e=>{
        const isNoDuty=String(e?.type||'')==='noduty'||noDuty(e?.raw);
        if(!isNoDuty||!e?.raw||!e?.date)return e;
        const rank=rankFor(e.raw,e.date);if(!rank)return e;
        let title=String(e.title||'');
        title=title.replace(/^#\d+\s+/,'');
        return {...e,noDutyRankV436:rank,title:`#${rank} ${title}`};
      }):[];

      const byDate=new Map();
      out.forEach((e,index)=>{
        if(!e?.raw)return;
        const isActualLeave=(function(){
          try{return typeof window.cnmiLeaveSequenceV431?.rankFor==='function'&&rowType(e.raw)!=='ไม่รับเวร'&&!!window.cnmiLeaveSequenceV431.rankFor(e.raw,e.date);}catch(_){return false;}
        })();
        const isND=String(e?.type||'')==='noduty'||noDuty(e?.raw);
        if(!isActualLeave&&!isND)return;
        const d=normDate(e.date);if(!d)return;
        let group=2,rank=99999;
        if(isActualLeave){group=0;rank=Number(e.leaveRankV431)||Number(window.cnmiLeaveSequenceV431?.rankFor?.(e.raw,d))||89999;}
        else if(isND){group=1;rank=Number(e.noDutyRankV436)||rankFor(e.raw,d)||89999;}
        if(!byDate.has(d))byDate.set(d,[]);
        byDate.get(d).push({index,event:e,group,rank});
      });
      byDate.forEach(items=>{
        if(items.length<2)return;
        const positions=items.map(x=>x.index).sort((a,b)=>a-b);
        const sorted=items.slice().sort((a,b)=>a.group-b.group||a.rank-b.rank||a.index-b.index).map(x=>x.event);
        positions.forEach((pos,i)=>{out[pos]=sorted[i];});
      });
      return out;
    };
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  const oldCalendarDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof oldCalendarDetail==='function'){
    const wrappedDetail=function calendarEventDetailV436(e){
      const base=String(oldCalendarDetail.apply(this,arguments)||'');
      const isND=String(e?.type||'')==='noduty'||noDuty(e?.raw);
      if(!isND||!e?.raw||!e?.date)return base;
      const rank=Number(e?.noDutyRankV436)||rankFor(e.raw,e.date);
      if(!rank)return base;
      return `<br><button type="button" class="v436-calendar-noduty-rank" data-v436-no-duty-rank="${rank}" data-v436-date="${esc(normDate(e.date))}" data-v436-staff="${esc(String(e.raw.staff_id||''))}">ลำดับไม่รับเวร ${rank}</button>${base}`;
    };
    try{window.calendarEventDetail=calendarEventDetail=wrappedDetail;}catch(_){window.calendarEventDetail=wrappedDetail;}
  }

  function showRankDetail(date,staffId){
    const hit=sequenceForDate(date).find(x=>String(x.staff_id)===String(staffId));
    if(!hit)return;
    const nick=staffNickSafe(hit.staff_id)||'-';
    const requested=(()=>{try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}})();
    const submitted=submittedDateTime(hit.row);
    const modalHtml=`
      <div class="v436-rank-detail-modal">
        <div class="v436-rank-detail-head">
          <span class="v436-rank-detail-number">${hit.rank}</span>
          <div><h2>ลำดับไม่รับเวร ${hit.rank}</h2><p>${esc(nick)}</p></div>
        </div>
        <div class="v436-rank-detail-grid">
          <div><small>วันที่ไม่รับเวร</small><b>${esc(requested)}</b></div>
          <div><small>วันที่น้องลงบันทึกครั้งแรก</small><b>${esc(submitted)}</b></div>
        </div>
        <p class="v436-rank-detail-note">ลำดับนี้อ้างอิงวันที่และเวลาที่น้องลงบันทึกครั้งแรกของรายการ ไม่เปลี่ยนเมื่อกลับมาแก้หมายเหตุภายหลัง</p>
      </div>`;
    try{if(typeof showModal==='function')showModal(modalHtml,{small:true});}
    catch(_){ }
  }

  document.addEventListener('click',event=>{
    const badge=event.target?.closest?.('[data-v436-no-duty-rank]');
    if(!badge)return;
    event.preventDefault();event.stopPropagation();
    const date=normDate(badge.dataset.v436Date)||today();
    const staffId=String(badge.dataset.v436Staff||'');
    if(staffId)showRankDetail(date,staffId);
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v436-no-duty-sequence';
  style.textContent=`
    .v436-no-duty-rank-badge,.v436-calendar-noduty-rank{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;padding:2px 7px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#475569;font:inherit;font-size:10px;font-weight:900;line-height:1.25;white-space:nowrap;cursor:pointer;touch-action:manipulation;vertical-align:middle}
    .v436-no-duty-rank-badge:hover,.v436-calendar-noduty-rank:hover{background:#eef2f7;border-color:#94a3b8;color:#334155}
    .v436-no-duty-rank-badge:focus-visible,.v436-calendar-noduty-rank:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(100,116,139,.18)}
    .v436-rank-help{color:#718398}
    .v436-calendar-noduty-rank{margin:4px 0 2px;font-size:11px}
    .v436-rank-detail-modal{display:grid;gap:13px}
    .v436-rank-detail-head{display:flex;align-items:center;gap:11px}
    .v436-rank-detail-number{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#eef2f7;color:#334155;font-size:20px;font-weight:950;flex:0 0 auto}
    .v436-rank-detail-head h2{margin:0;color:#263d53;font-size:18px;line-height:1.2}.v436-rank-detail-head p{margin:3px 0 0;color:#667b90;font-weight:800}
    .v436-rank-detail-grid{display:grid;gap:8px}.v436-rank-detail-grid>div{display:grid;gap:3px;padding:10px 12px;border:1px solid #dce7f0;border-radius:11px;background:#fbfdff}.v436-rank-detail-grid small{color:#7b8ea2;font-size:10px;font-weight:800}.v436-rank-detail-grid b{color:#334b62;font-size:13px;line-height:1.35}
    .v436-rank-detail-note{margin:0;color:#7b8ea2;font-size:10px;line-height:1.45}
    @media(max-width:820px){.v436-no-duty-rank-badge{font-size:10px;padding:3px 7px}.v436-rank-detail-head h2{font-size:20px}.v436-rank-detail-grid b{font-size:14px}}
  `;
  document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v436-no-duty-sequence.js", error); }
;

/* Original source: patch-v437-hr-leave-period-pending-summary.js */
try {
/* CNMI Staff Planner V437
 * HR leave period + pending summary for Admin.
 * Scope:
 *   - show เต็มวัน / ครึ่งเช้า / ครึ่งบ่าย in "ตรวจสอบ HR"
 *   - add compact pending summary above the review forms
 *   - distinguish "ยังไม่ลง HR" from "รอตรวจสอบ" using existing hr_reported_date
 *   - copy a LINE-ready summary without changing leave/HR data
 * Display-only: no schema/query/write changes.
 */
(function(){
  'use strict';
  const VERSION='V437_HR_LEAVE_PERIOD_PENDING_SUMMARY';
  if(window.__CNMI_V437_HR_LEAVE_PERIOD_PENDING_SUMMARY__)return;
  window.__CNMI_V437_HR_LEAVE_PERIOD_PENDING_SUMMARY__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):true;}catch(_){return true;}}
  function checked(id){try{return typeof isLeaveHrChecked==='function'?isLeaveHrChecked(id):(S().hrChecks||[]).some(h=>String(h.leave_request_id)===String(id)&&h.status==='ตรวจสอบแล้ว');}catch(_){return false;}}
  function typeOf(row){try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'ลา'):String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}catch(_){return String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}}
  function periodLabel(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim();
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw.replace(/\s*\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s*/g,'').trim()||raw;
  }
  function staffNameSafe(id){try{return typeof staffName==='function'?staffName(id):(typeof staffNick==='function'?staffNick(id):String(id||'-'));}catch(_){return String(id||'-');}}
  function staffNickSafe(id){try{return typeof staffNick==='function'?staffNick(id):staffNameSafe(id);}catch(_){return staffNameSafe(id);}}
  function thaiDate(d){try{return typeof formatThaiDate==='function'?formatThaiDate(d):String(d||'-');}catch(_){return String(d||'-');}}
  function dateRange(row){
    const a=String(row?.start_date||'').slice(0,10),b=String(row?.end_date||row?.start_date||'').slice(0,10);
    if(!a)return '-';
    return !b||a===b?thaiDate(a):`${thaiDate(a)} – ${thaiDate(b)}`;
  }
  function hrFor(row){return (S().hrChecks||[]).find(h=>String(h?.leave_request_id||'')===String(row?.id||''))||{};}
  function pendingStatus(row){
    const h=hrFor(row);
    const status=String(h?.status||'รอตรวจสอบ').trim();
    if(status==='ตรวจสอบแล้ว')return {key:'done',label:'ตรวจสอบแล้ว',tone:'green',h};
    if(h?.hr_reported_date){
      if(status==='รอเอกสาร')return {key:'waiting',label:'รอเอกสาร',tone:'yellow',h};
      if(status==='ยกเลิก')return {key:'cancelled',label:'ยกเลิก',tone:'gray',h};
      return {key:'waiting',label:'รอตรวจสอบ',tone:'orange',h};
    }
    if(status==='รอเอกสาร')return {key:'action',label:'รอเอกสาร',tone:'yellow',h};
    if(status==='ยกเลิก')return {key:'cancelled',label:'ยกเลิก',tone:'gray',h};
    return {key:'action',label:'ยังไม่ลง HR',tone:'red',h};
  }
  function pendingRows(){
    const staffFilter=S().hrFilterStaff||'';
    const monthFilter=S().hrFilterMonth||S().monthKey||'';
    return (S().leaves||[])
      .filter(x=>String(x?.type||'').trim()!=='ไม่รับเวร'&&effective(x)&&!checked(x.id))
      .filter(x=>!staffFilter||String(x.staff_id)===String(staffFilter))
      .filter(x=>!monthFilter||String(x.start_date||'').startsWith(monthFilter)||String(x.end_date||'').startsWith(monthFilter));
  }
  function badgeStatus(meta){
    const cls=meta.tone==='red'?'v437-status-red':meta.tone==='green'?'v437-status-green':meta.tone==='yellow'?'v437-status-yellow':meta.tone==='gray'?'v437-status-gray':'v437-status-orange';
    return `<span class="v437-hr-status ${cls}">${esc(meta.label)}</span>`;
  }
  function periodBadge(row){return `<span class="v437-period-badge">${esc(periodLabel(row))}</span>`;}

  function summaryHtml(rows){
    const actionable=rows.filter(r=>pendingStatus(r).key==='action').length;
    const waiting=rows.filter(r=>pendingStatus(r).key==='waiting').length;
    const other=rows.length-actionable-waiting;
    const counts=[`ยังไม่ลง HR ${actionable}`,`แจ้งแล้วรอตรวจสอบ ${waiting}`];
    if(other>0)counts.push(`สถานะอื่น ${other}`);
    if(!rows.length)return '';
    const body=rows.map(r=>{
      const meta=pendingStatus(r);
      return `<tr><td><b>${esc(staffNickSafe(r.staff_id))}</b></td><td>${esc(typeOf(r))}</td><td>${periodBadge(r)}</td><td>${esc(dateRange(r))}</td><td>${badgeStatus(meta)}</td></tr>`;
    }).join('');
    const cards=rows.map(r=>{
      const meta=pendingStatus(r);
      return `<div class="v437-summary-card"><div class="v437-summary-card-head"><b>${esc(staffNickSafe(r.staff_id))}</b>${badgeStatus(meta)}</div><div>${esc(typeOf(r))} ${periodBadge(r)}</div><div class="v437-summary-date">${esc(dateRange(r))}</div></div>`;
    }).join('');
    return `<section class="v437-pending-summary" aria-label="สรุปรายการรอดำเนินการ HR">
      <div class="v437-summary-head">
        <div><h4>สรุปรายการรอดำเนินการ HR</h4><p>${esc(counts.join(' • '))}</p></div>
        <button type="button" class="ghost-btn v437-copy-hr-summary" data-v437-copy-hr-summary>คัดลอกสรุปส่ง LINE</button>
      </div>
      <div class="table-wrap desktop-table v437-summary-table"><table><thead><tr><th>เจ้าหน้าที่</th><th>ประเภท</th><th>ช่วงลา</th><th>วันที่ลา</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="mobile-cards v437-summary-cards">${cards}</div>
      <div class="v437-summary-note">“ยังไม่ลง HR” = ยังไม่มีวันที่แจ้งใน HR • “รอตรวจสอบ” = แจ้ง HR แล้ว แต่ยังไม่ได้ตรวจยืนยัน</div>
    </section>`;
  }

  function decorateHrHtml(html){
    const rows=pendingRows();
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const card=tpl.content.querySelector('.card');if(!card)return html;
      const toolbar=card.querySelector('.toolbar.compact-filter');
      const summary=summaryHtml(rows);
      if(summary){
        const holder=document.createElement('template');holder.innerHTML=summary;
        if(toolbar)toolbar.insertAdjacentElement('afterend',holder.content.firstElementChild);
        else card.insertAdjacentElement('afterbegin',holder.content.firstElementChild);
      }
      const table=card.querySelector(':scope > .table-wrap table')||card.querySelector('.table-wrap table');
      if(table){
        const th=[...table.querySelectorAll('thead th')];
        if(th[1])th[1].textContent='ประเภท / ช่วงลา / วันที่';
        const trs=[...table.querySelectorAll('tbody tr')];
        trs.forEach((tr,i)=>{
          const row=rows[i];if(!row)return;
          const cells=[...tr.children];const cell=cells[1];if(!cell||cell.querySelector('.v437-period-badge'))return;
          const firstBadge=cell.querySelector('.badge');
          if(firstBadge)firstBadge.insertAdjacentHTML('afterend',` ${periodBadge(row)}`);
          else cell.insertAdjacentHTML('afterbegin',`${periodBadge(row)}<br>`);
        });
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] HR decoration skipped`,err);return html;}
  }

  const oldHr=window.renderHrPage||(typeof renderHrPage==='function'?renderHrPage:null);
  if(typeof oldHr==='function'){
    const wrapped=function renderHrPageV437(){return decorateHrHtml(oldHr.apply(this,arguments));};
    try{window.renderHrPage=renderHrPage=wrapped;}catch(_){window.renderHrPage=wrapped;}
  }

  // Keep the completed-history page consistent: show leave period there as well.
  function decorateHrSummaryHtml(html){
    try{
      const staffFilter=S().hrSummaryFilterStaff||'';
      const monthFilter=S().hrSummaryFilterMonth||S().monthKey||'';
      const rows=(S().hrChecks||[]).filter(h=>h.status==='ตรวจสอบแล้ว').map(h=>({h,l:(S().leaves||[]).find(x=>String(x.id)===String(h.leave_request_id))})).filter(x=>x.l)
        .filter(x=>!staffFilter||String(x.l.staff_id)===String(staffFilter))
        .filter(x=>!monthFilter||String(x.l.start_date||'').startsWith(monthFilter)||String(x.l.end_date||'').startsWith(monthFilter)||String(x.h.hr_reported_date||'').startsWith(monthFilter));
      if(!rows.length)return html;
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const desktop=[...tpl.content.querySelectorAll('.desktop-table tbody tr')];
      desktop.forEach((tr,i)=>{const cell=tr.children[1],row=rows[i]?.l;if(!cell||!row||cell.querySelector('.v437-period-badge'))return;const b=cell.querySelector('.badge');if(b)b.insertAdjacentHTML('afterend',` ${periodBadge(row)}`);});
      const cards=[...tpl.content.querySelectorAll('.mobile-cards .mobile-card')];
      cards.forEach((card,i)=>{const row=rows[i]?.l;if(!row||card.querySelector('.v437-period-badge'))return;const head=card.querySelector('.section-title');if(head)head.insertAdjacentHTML('afterend',`<div class="v437-history-period"><b>ช่วงลา:</b> ${periodBadge(row)}</div>`);});
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] HR summary decoration skipped`,err);return html;}
  }
  const oldHrSummary=window.renderHrSummaryPage||(typeof renderHrSummaryPage==='function'?renderHrSummaryPage:null);
  if(typeof oldHrSummary==='function'){
    const wrappedSummary=function renderHrSummaryPageV437(){return decorateHrSummaryHtml(oldHrSummary.apply(this,arguments));};
    try{window.renderHrSummaryPage=renderHrSummaryPage=wrappedSummary;}catch(_){window.renderHrSummaryPage=wrappedSummary;}
  }

  function lineText(){
    const rows=pendingRows();
    const action=rows.filter(r=>pendingStatus(r).key==='action');
    const waiting=rows.filter(r=>pendingStatus(r).key==='waiting');
    const other=rows.filter(r=>!['action','waiting'].includes(pendingStatus(r).key));
    const lines=['รายการลาที่ยังรอดำเนินการ HR',''];
    if(action.length){
      lines.push('กรุณาดำเนินการในระบบ HR');
      action.forEach(r=>lines.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} — ${periodLabel(r)} — ${dateRange(r)}${pendingStatus(r).label!=='ยังไม่ลง HR'?` — ${pendingStatus(r).label}`:''}`));
      lines.push('');
    }
    if(waiting.length){
      lines.push('แจ้ง HR แล้ว รอตรวจสอบ');
      waiting.forEach(r=>lines.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} — ${periodLabel(r)} — ${dateRange(r)}`));
      lines.push('');
    }
    if(other.length){
      lines.push('สถานะอื่น');
      other.forEach(r=>lines.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} — ${periodLabel(r)} — ${dateRange(r)} — ${pendingStatus(r).label}`));
      lines.push('');
    }
    if(!rows.length)lines.push('ไม่มีรายการค้างตามตัวกรองนี้');
    else if(action.length)lines.push('รบกวนตรวจสอบและดำเนินการลาในระบบ HR ให้เรียบร้อยครับ');
    return lines.join('\n').trim();
  }
  async function copyText(text){
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}
    const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy failed');return true;
  }
  document.addEventListener('click',async event=>{
    const btn=event.target?.closest?.('[data-v437-copy-hr-summary]');if(!btn)return;
    event.preventDefault();event.stopPropagation();
    try{await copyText(lineText());if(typeof showToast==='function')showToast('คัดลอกสรุปรายการ HR แล้ว');}
    catch(err){console.warn(`[${VERSION}] copy failed`,err);if(typeof showToast==='function')showToast('คัดลอกไม่สำเร็จ กรุณาลองใหม่',{tone:'error'});}
  },true);

  const style=document.createElement('style');style.id='cnmi-v437-hr-summary';style.textContent=`
    .v437-period-badge{display:inline-flex;align-items:center;width:max-content;padding:2px 8px;border-radius:999px;background:#eaf3ff;color:#275f94;border:1px solid #cde3fb;font-size:11px;font-weight:900;line-height:1.35;white-space:nowrap;vertical-align:middle}
    .v437-pending-summary{margin:14px 0 16px;padding:14px;border:1px solid #d9e6f0;border-radius:16px;background:#fbfdff;display:grid;gap:11px}
    .v437-summary-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.v437-summary-head h4{margin:0;color:#263d53;font-size:17px}.v437-summary-head p{margin:4px 0 0;color:#718398;font-size:12px;font-weight:750}
    .v437-copy-hr-summary{flex:0 0 auto}
    .v437-summary-table{margin:0}.v437-summary-table table{min-width:650px}.v437-summary-table th,.v437-summary-table td{vertical-align:middle}
    .v437-hr-status{display:inline-flex;align-items:center;width:max-content;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:900;line-height:1.25;white-space:nowrap;border:1px solid transparent}
    .v437-status-red{background:#fff1f2;color:#b42318;border-color:#fecdd3}.v437-status-orange{background:#fff7ed;color:#b45309;border-color:#fed7aa}.v437-status-yellow{background:#fffbea;color:#8a6800;border-color:#fde68a}.v437-status-green{background:#ecfdf3;color:#067647;border-color:#abefc6}.v437-status-gray{background:#f2f4f7;color:#475467;border-color:#e4e7ec}
    .v437-summary-note{color:#718398;font-size:11px;line-height:1.45}.v437-summary-cards{display:none}.v437-summary-card{display:grid;gap:5px;padding:10px 11px;border:1px solid #e1eaf2;border-radius:12px;background:#fff}.v437-summary-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.v437-summary-date{color:#64788d;font-size:12px}.v437-history-period{margin:2px 0 6px;color:#52687e;font-size:12px}
    @media(max-width:820px){.v437-pending-summary{padding:12px;margin:12px 0 14px}.v437-summary-head{align-items:stretch;flex-direction:column}.v437-copy-hr-summary{width:100%}.v437-summary-table{display:none!important}.v437-summary-cards{display:grid;gap:8px}.v437-period-badge{font-size:11px;padding:3px 8px}.v437-summary-head h4{font-size:18px}.v437-summary-head p{font-size:12px}}
  `;document.head.appendChild(style);

  window.cnmiHrSummaryV437={periodLabel,pendingRows,pendingStatus,lineText};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v437-hr-leave-period-pending-summary.js", error); }
;

/* Original source: patch-v438-no-duty-full-day-roster-sequence.js */
try {
/* CNMI Staff Planner V438
 * No-duty = full-day only + compact no-duty rank in monthly roster.
 * Scope:
 *   - hide/disable leave-period selector when type is "ไม่รับเวร"
 *   - force leave_period = "เต็มวัน" before save for no-duty rows
 *   - monthly roster shows ① ไม่รับ, ② ไม่รับ, ... using V436 original created_at sequence
 *   - leave sequence and no-duty sequence stay separate
 * No SQL/schema/query change.
 */
(function(){
  'use strict';
  const VERSION='V438_NO_DUTY_FULL_DAY_ROSTER_SEQUENCE';
  if(window.__CNMI_V438_NO_DUTY_FULL_DAY_ROSTER_SEQUENCE__)return;
  window.__CNMI_V438_NO_DUTY_FULL_DAY_ROSTER_SEQUENCE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function rowType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function isNoDuty(rowOrType){
    if(rowOrType&&typeof rowOrType==='object')return rowType(rowOrType)==='ไม่รับเวร';
    return String(rowOrType||'').split(':::')[0].trim()==='ไม่รับเวร';
  }
  function rosterEnabled(st){try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}}
  function activeLeave(staffId,date){try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}}
  function monthDates(key){
    try{const rows=typeof scheduleMonthDates==='function'?scheduleMonthDates(String(key||'').slice(0,7)):[];return Array.isArray(rows)?rows.map(normDate).filter(Boolean):[];}
    catch(_){return [];}
  }
  function noDutyRank(row,date){
    try{return Number(window.cnmiNoDutySequenceV436?.rankFor?.(row,date))||null;}catch(_){return null;}
  }
  function circled(n){
    const v=Number(n)||0;
    const chars=['','①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
    return chars[v]||String(v||'');
  }

  /* ---------- Leave form: no-duty is always full day ---------- */
  function periodLabelOf(form){
    const select=form?.querySelector?.('select[name="leave_period"]');
    return select?.closest?.('label')||null;
  }
  function syncNoDutyPeriod(form){
    if(!form)return;
    const typeSel=form.querySelector('select[name="type"]');
    const periodSel=form.querySelector('select[name="leave_period"]');
    if(!typeSel||!periodSel)return;
    const noDuty=isNoDuty(typeSel.value);
    const label=periodLabelOf(form);
    if(noDuty){
      periodSel.value='เต็มวัน';
      periodSel.disabled=true;
      periodSel.setAttribute('data-v438-forced-full-day','true');
      if(label){label.hidden=true;label.classList.add('v438-no-duty-period-hidden');}
    }else{
      periodSel.disabled=false;
      periodSel.removeAttribute('data-v438-forced-full-day');
      if(label){label.hidden=false;label.classList.remove('v438-no-duty-period-hidden');}
    }
  }
  function decorateLeaveHtml(html){
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const form=tpl.content.querySelector('#leaveForm');
      if(!form)return html;
      const typeSel=form.querySelector('select[name="type"]');
      const periodSel=form.querySelector('select[name="leave_period"]');
      if(typeSel&&periodSel&&isNoDuty(typeSel.value)){
        periodSel.value='เต็มวัน';
        periodSel.disabled=true;
        periodSel.setAttribute('data-v438-forced-full-day','true');
        const label=periodSel.closest('label');if(label){label.hidden=true;label.classList.add('v438-no-duty-period-hidden');}
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] leave form decoration skipped`,err);return html;}
  }
  const oldLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof oldLeavePage==='function'){
    const wrappedLeave=function renderLeavePageV438(){return decorateLeaveHtml(oldLeavePage.apply(this,arguments));};
    try{window.renderLeavePage=renderLeavePage=wrappedLeave;}catch(_){window.renderLeavePage=wrappedLeave;}
  }

  document.addEventListener('change',event=>{
    const typeSel=event.target?.closest?.('#leaveForm select[name="type"]');
    if(!typeSel)return;
    syncNoDutyPeriod(typeSel.closest('#leaveForm'));
  },true);

  /* Last-line guard before the existing save code reads FormData. */
  const oldSaveLeave=window.saveLeave||(typeof saveLeave==='function'?saveLeave:null);
  if(typeof oldSaveLeave==='function'){
    const wrappedSave=async function saveLeaveV438(form){
      try{
        const typeSel=form?.querySelector?.('select[name="type"]');
        const periodSel=form?.querySelector?.('select[name="leave_period"]');
        if(typeSel&&periodSel&&isNoDuty(typeSel.value)){
          periodSel.disabled=false; // FormData now carries the forced value explicitly.
          periodSel.value='เต็มวัน';
        }
      }catch(_){ }
      return oldSaveLeave.apply(this,arguments);
    };
    try{window.saveLeave=saveLeave=wrappedSave;}catch(_){window.saveLeave=wrappedSave;}
  }

  /* ---------- Monthly roster: ① ไม่รับ / ② ไม่รับ / ... ---------- */
  function decorateRosterHtml(html,staffList,key){
    const dates=monthDates(key||S().monthKey);
    if(!dates.length)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const table=tpl.content.querySelector('table.clean-schedule-grid,table#scheduleTable');
      if(!table)return html;
      const staff=(staffList||[]).filter(rosterEnabled);
      const bodyRows=[...table.querySelectorAll('tbody tr')];
      let hasNoDuty=false;

      bodyRows.forEach((tr,rowIndex)=>{
        const st=staff[rowIndex];if(!st)return;
        const cells=[...tr.children].slice(-dates.length);
        dates.forEach((date,i)=>{
          const cell=cells[i];if(!cell)return;
          const row=activeLeave(st.id,date);
          if(!isNoDuty(row))return;
          hasNoDuty=true;
          const rank=noDutyRank(row,date);
          const label=`${rank?circled(rank)+' ':''}ไม่รับ`;
          const fullTitle=`${rank?`ลำดับไม่รับเวร ${rank} · `:''}ไม่รับเวร · เต็มวัน`;
          const stack=cell.querySelector('.clean-cell-stack')||cell;
          let badge=stack.querySelector('.mini-status.leave-no-duty');
          if(!badge){
            badge=[...stack.querySelectorAll('.mini-status')].find(n=>/ไม่รับเวร|ไม่รับ/.test(String(n.textContent||'')))||null;
          }
          if(!badge)return;
          badge.classList.add('v438-compact-no-duty');
          badge.setAttribute('title',fullTitle);
          badge.setAttribute('aria-label',fullTitle);
          badge.innerHTML=`<span class="v438-compact-no-duty-text">${esc(label)}</span>`;
          // Remove any old rank/helper line if an earlier patch added one in the cell.
          stack.querySelectorAll('.v436-calendar-noduty-rank,.v436-no-duty-rank-badge,[data-v436-no-duty-rank]').forEach(n=>{if(n!==badge)n.remove();});
        });
      });

      if(hasNoDuty){
        let legend=tpl.content.querySelector('.v432-roster-legend');
        if(!legend){
          legend=document.createElement('div');legend.className='v432-roster-legend';
          const gridWrap=table.closest('.table-wrap,.clean-grid-wrap')||table;
          gridWrap.insertAdjacentElement('afterend',legend);
        }
        if(!legend.querySelector('[data-v438-no-duty-legend]')){
          const item=document.createElement('span');
          item.setAttribute('data-v438-no-duty-legend','true');
          item.textContent='①②③… ไม่รับ = ลำดับไม่รับเวร (แยกจากลำดับลา)';
          legend.appendChild(item);
        }
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] roster decoration skipped`,err);return html;}
  }

  const oldGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldGrid==='function'){
    const wrappedGrid=function renderGridViewV438(staffList,assignments,key){return decorateRosterHtml(oldGrid.apply(this,arguments),staffList,key);};
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v438-no-duty-full-day-roster';
  style.textContent=`
    #leaveForm .v438-no-duty-period-hidden{display:none!important}
    .clean-schedule-grid .v438-compact-no-duty{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:max-content!important;max-width:100%!important;min-height:0!important;padding:2px 5px!important;margin:0 auto!important;line-height:1.05!important;white-space:nowrap!important;font-size:11px!important;font-weight:900!important;box-sizing:border-box!important}
    .clean-schedule-grid .v438-compact-no-duty-text{display:block;white-space:nowrap;line-height:1.05}
    @media(max-width:820px){.clean-schedule-grid .v438-compact-no-duty{font-size:10px!important;padding:2px 4px!important}}
  `;
  document.head.appendChild(style);

  window.cnmiNoDutyFullDayV438={isNoDuty,noDutyRank,circled,syncNoDutyPeriod};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v438-no-duty-full-day-roster-sequence.js", error); }
;

/* Original source: patch-v440-dashboard-holiday-manpower-helper-count.js */
try {
/* CNMI Staff Planner V440
 * Dashboard holiday manpower + donor-helper count.
 * - Weekdays (non-holiday): keep V433 morning/afternoon manpower after leave.
 * - Saturday/Sunday/public holiday: count unique people from today's duty roster only.
 * - Subtract roster staff who have an effective leave record today and flag "เวรมีลา".
 * - Add unique signed-up donor-room helpers (internal + external), excluding cancelled/no-show/pending-cancel.
 * - Avoid double-counting an internal helper who is also already in today's duty roster.
 * - Hide "ตำแหน่งกลางวันวันนี้" on weekends/public holidays even if stale position rows exist.
 * - Display-only; reuses existing V327 donor-helper RPC loader. No schema/SQL/write changes.
 */
(function(){
  'use strict';
  const VERSION='V440_DASHBOARD_HOLIDAY_MANPOWER_HELPER_COUNT';
  if(window.__CNMI_V440_DASHBOARD_HOLIDAY_MANPOWER_HELPER_COUNT__)return;
  window.__CNMI_V440_DASHBOARD_HOLIDAY_MANPOWER_HELPER_COUNT__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v);}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function today(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function norm(v){return String(v||'').slice(0,10);}
  function monthOf(date){return String(date||'').slice(0,7);}
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'&&!!isHolidayDate(date);}catch(_){return false;}}
  function isOffDay(date){try{return typeof isNoPositionDay==='function'?!!isNoPositionDay(date):(isWeekendSafe(date)||isHolidaySafe(date));}catch(_){return isWeekendSafe(date)||isHolidaySafe(date);}}
  function holidayTitle(date){
    let parts=[];
    try{
      const dow=new Date(`${date}T12:00:00`).getDay();
      if(dow===6)parts.push('วันเสาร์');
      else if(dow===0)parts.push('วันอาทิตย์');
    }catch(_){ }
    if(isHolidaySafe(date)){
      let name='วันหยุดนักขัตฤกษ์';
      try{name=String(holidayName(date)||name).split(':::')[0].trim()||name;}catch(_){ }
      if(!parts.includes(name))parts.push(name);
    }
    return parts.join(' • ')||'วันหยุด';
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function overlaps(row,date){try{return typeof overlapsDate==='function'?!!overlapsDate(row,date):(norm(row?.start_date)<=date&&norm(row?.end_date||row?.start_date)>=date);}catch(_){return false;}}
  function actualLeave(row,date){
    if(!row||!effective(row)||!overlaps(row,date))return false;
    const type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!type&&type!=='ไม่รับเวร';
  }
  function activeStaffMap(){return new Map((S().staff||[]).filter(x=>x?.is_active).map(x=>[String(x.id),x]));}
  function groupOf(staff){
    const type=String(staff?.staff_type||'').trim(),role=String(staff?.role||'').trim(),text=`${type} ${role}`;
    if(window.cnmiPersonTypeV516?.isPhysician?.(staff) ?? /^(แพทย์|physician|doctor)$/i.test(type))return 'แพทย์';
    if(type==='เคิก'||/clerk|ธุรการ/i.test(text))return 'เคิก';
    return 'MT';
  }
  function rosterPeople(date){
    const map=activeStaffMap(),ids=new Set();
    (S().rosterAssignments||[]).forEach(row=>{
      if(norm(row?.duty_date)!==date||!row?.staff_id)return;
      const id=String(row.staff_id);
      if(map.has(id))ids.add(id);
    });
    return ids;
  }
  function rosterLeavePeople(date,rosterIds){
    const out=new Set();
    (S().leaves||[]).forEach(row=>{
      const id=String(row?.staff_id||'');
      if(id&&rosterIds.has(id)&&actualLeave(row,date))out.add(id);
    });
    return out;
  }
  function helperStatusCountable(status){return ['confirmed','completed'].includes(String(status||'confirmed').toLowerCase());}
  function helperStatusPendingCancel(status){return String(status||'').toLowerCase()==='cancel_requested';}
  function helperPersonKey(row){
    if(row?.internal_staff_id)return `staff:${String(row.internal_staff_id)}`;
    const name=String(row?.helper_name||'').trim().replace(/\s+/g,' ').toLowerCase();
    const unit=String(row?.unit_name||'').trim().replace(/\s+/g,' ').toLowerCase();
    const phone=String(row?.phone||'').replace(/\D/g,'');
    return `external:${name}|${unit}|${phone}`;
  }
  function helperSummary(date,rosterIds){
    const st=S(),month=monthOf(date);
    const loaded=String(st.donorHelperLoadedMonthV327||'')===month;
    const loading=!!st.donorHelperLoadingV327;
    const error=String(st.donorHelperErrorV327||'');
    const payload=st.donorHelperPayloadV327||{};
    const rows=Array.isArray(payload.rows)?payload.rows:[];
    const people=new Map(),pending=new Map();
    rows.forEach(row=>{
      if(norm(row?.work_date)!==date)return;
      const internalId=row?.internal_staff_id?String(row.internal_staff_id):'';
      if(internalId&&rosterIds.has(internalId))return; // prevent double count
      const key=helperPersonKey(row);
      if(helperStatusCountable(row?.status))people.set(key,row);
      else if(helperStatusPendingCancel(row?.status))pending.set(key,row);
    });
    let internal=0,external=0;
    people.forEach(row=>{if(row?.internal_staff_id)internal++;else external++;});
    return {loaded,loading,error,total:people.size,internal,external,pendingCancel:pending.size,rows:[...people.values()]};
  }
  function countGroups(ids){
    const map=activeStaffMap(),counts={MT:0,'เคิก':0,'แพทย์':0};
    ids.forEach(id=>{const g=groupOf(map.get(String(id)));counts[g]=(counts[g]||0)+1;});
    return counts;
  }
  function offDayManpower(date){
    const scheduled=rosterPeople(date);
    const onLeave=rosterLeavePeople(date,scheduled);
    const available=new Set([...scheduled].filter(id=>!onLeave.has(id)));
    const helpers=helperSummary(date,scheduled);
    const group=countGroups(available);
    return {
      date,scheduled,onLeave,available,helpers,group,
      scheduledCount:scheduled.size,
      leaveCount:onLeave.size,
      dutyAvailableCount:available.size,
      totalPresentExpected:available.size+helpers.total
    };
  }

  function helperLine(h){
    if(!h.loaded){
      if(h.loading)return '<span class="v440-helper-loading">กำลังโหลดรายชื่อคนมาช่วย…</span>';
      if(h.error)return '<span class="v440-helper-error">โหลดข้อมูลคนมาช่วยไม่สำเร็จ</span>';
      return '<span class="v440-helper-loading">กำลังตรวจรายชื่อคนมาช่วย…</span>';
    }
    let text=`ลงชื่อมาช่วย <strong>${h.total}</strong> คน`;
    if(h.total)text+=` <small>ในหน่วย ${h.internal} • นอกหน่วย ${h.external}</small>`;
    if(h.pendingCancel)text+=` <em>รอยกเลิก ${h.pendingCancel}</em>`;
    return `<span>${text}</span>`;
  }
  function holidayCard(m){
    const h=m.helpers;
    const totalKnown=h.loaded;
    const total=totalKnown?m.totalPresentExpected:m.dutyAvailableCount;
    const leaveBadge=m.leaveCount?`<span class="v440-alert-pill">เวรมีลา ${m.leaveCount}</span>`:'';
    const helperBadge=h.loaded?`<span class="v440-helper-pill">มาช่วย ${h.total}</span>`:'<span class="v440-helper-pill muted">มาช่วย …</span>';
    const totalLabel=totalKnown?'รวมคาดการณ์หน้างาน':'ตามเวรที่พร้อม';
    return `<div class="card v433-manpower-card v440-holiday-manpower-card" data-v433-manpower data-v440-holiday-manpower>
      <div class="v440-title-row">
        <div class="v433-manpower-title">กำลังคนตามเวรวันนี้ <small>${esc(holidayTitle(m.date))}</small></div>
        <div class="v440-pills">${helperBadge}${leaveBadge}</div>
      </div>
      <div class="v440-main-count"><strong>${total}</strong><span>คน</span><small>${esc(totalLabel)}</small></div>
      <div class="v440-breakdown">
        <div><span>จัดเวร</span><b>${m.scheduledCount}</b><small>คน</small></div>
        <div><span>พร้อมตามเวร</span><b>${m.dutyAvailableCount}</b><small>คน</small></div>
        <div><span>คนมาช่วย</span><b>${h.loaded?h.total:'…'}</b><small>คน</small></div>
      </div>
      <div class="v440-detail-lines">
        <div><b>เวรวันนี้</b><span>MT ${m.group.MT||0} • เคิก ${m.group['เคิก']||0} • แพทย์ ${m.group['แพทย์']||0}</span></div>
        <div><b>คนมาช่วย</b>${helperLine(h)}</div>
      </div>
      <div class="v440-note">นับคนไม่ซ้ำจากตารางเวรวันนี้ + ผู้ลงชื่อมาช่วย • ไม่รับเวรไม่นำมาหัก${m.leaveCount?' • ผู้มีเวรที่ลาถูกหักและขึ้นเตือน':''}</div>
    </div>`;
  }

  window.cnmiDashboardHolidayManpowerV440={offDayManpower,helperSummary,rosterPeople,rosterLeavePeople,isOffDay};

  let helperLoadPromise=null;
  function ensureHelpers(date){
    if(!isOffDay(date))return;
    const st=S(),month=monthOf(date);
    if(String(st.donorHelperLoadedMonthV327||'')===month||st.donorHelperLoadingV327)return;
    const api=window.cnmiDonorHelperV327;
    if(!api||typeof api.loadMonth!=='function'||helperLoadPromise)return;
    helperLoadPromise=Promise.resolve(api.loadMonth(month,{force:false})).catch(err=>console.warn('[V440] helper load',err)).finally(()=>{
      helperLoadPromise=null;
      try{
        const cur=S();
        if(cur?.page==='dashboard'&&typeof renderPage==='function')renderPage();
      }catch(_){ }
    });
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV440(){
      let html=String(oldDashboard.apply(this,arguments)||'');
      const date=today();
      if(!isOffDay(date))return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const oldCard=tpl.content.querySelector('[data-v433-manpower]');
        if(oldCard){
          const box=document.createElement('template');box.innerHTML=holidayCard(offDayManpower(date)).trim();
          oldCard.replaceWith(box.content.firstElementChild);
        }
        // Weekends/public holidays do not use normal daytime-position assignments.
        tpl.content.querySelectorAll('[data-v434-daytime-positions]').forEach(node=>node.remove());
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
        window.setTimeout(()=>ensureHelpers(date),0);
      }catch(err){console.warn('[V440] dashboard holiday render fallback',err);}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v440-dashboard-holiday-manpower';
  style.textContent=`
    .v440-holiday-manpower-card{gap:10px!important}
    .v440-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .v440-pills{display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .v440-helper-pill,.v440-alert-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900;white-space:nowrap}
    .v440-helper-pill{background:#e7f5ff;color:#17699d;border:1px solid #bfdef1}.v440-helper-pill.muted{color:#778b9d;background:#f3f6f8;border-color:#dde6ec}
    .v440-alert-pill{background:#fff0e5;color:#b45412;border:1px solid #ffd0ad}
    .v440-main-count{display:flex;align-items:baseline;gap:6px;padding:1px 0}
    .v440-main-count strong{font-size:36px;line-height:1;color:var(--primary-dark,#237db7);font-weight:950}.v440-main-count>span{font-size:13px;font-weight:850;color:#526c84}.v440-main-count>small{font-size:10px;color:#7b8fa2;font-weight:800;margin-left:3px}
    .v440-breakdown{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    .v440-breakdown>div{display:flex;align-items:baseline;gap:4px;padding:7px 8px;border:1px solid #e4edf4;border-radius:10px;background:#f9fbfd;min-width:0}
    .v440-breakdown span{font-size:9px;color:#61778d;font-weight:800}.v440-breakdown b{font-size:17px;color:#294964}.v440-breakdown small{font-size:8px;color:#8294a5}
    .v440-detail-lines{display:grid;gap:5px;border-top:1px solid #e5edf4;padding-top:8px;color:#60758b;font-size:10px}
    .v440-detail-lines>div{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.v440-detail-lines b{color:#2c4a65;min-width:51px}.v440-detail-lines strong{color:#1f405d}.v440-detail-lines small{font-size:9px;color:#8294a5}.v440-detail-lines em{font-size:9px;font-style:normal;color:#a96119;background:#fff5e8;border-radius:999px;padding:2px 5px}
    .v440-helper-loading{color:#7b8fa2}.v440-helper-error{color:#b45309}
    .v440-note{font-size:9px;line-height:1.35;color:#899bab}
    @media(max-width:820px){
      .v440-title-row{align-items:center}.v440-holiday-manpower-card .v433-manpower-title{font-size:16px}.v440-holiday-manpower-card .v433-manpower-title small{font-size:11px;display:inline-block}
      .v440-helper-pill,.v440-alert-pill{font-size:10px;padding:5px 8px}.v440-main-count strong{font-size:38px}.v440-main-count>span{font-size:14px}.v440-main-count>small{font-size:11px}
      .v440-breakdown span{font-size:10px}.v440-breakdown b{font-size:19px}.v440-breakdown small{font-size:9px}.v440-detail-lines{font-size:11px}.v440-detail-lines small,.v440-detail-lines em{font-size:10px}.v440-note{font-size:10px}
    }
    @media(max-width:430px){
      .v440-title-row{display:grid;grid-template-columns:1fr}.v440-pills{justify-content:flex-start}.v440-breakdown{gap:5px}.v440-breakdown>div{display:grid;grid-template-columns:1fr auto;gap:1px 4px;padding:7px}.v440-breakdown small{grid-column:2}.v440-main-count>small{display:block}.v440-detail-lines>div{align-items:flex-start}.v440-detail-lines b{min-width:48px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v440-dashboard-holiday-manpower-helper-count.js", error); }
;

/* Original source: patch-v441-ch4-transfer-to-cover.js */
try {
/* CNMI Staff Planner V441
 * CH4 cover = transfer the CH4 roster assignment to the selected replacement.
 * - Keeps CH4 manual: no automatic OT request is created.
 * - Reconciles older covered_by_other records only when the roster still belongs to the original owner.
 * - Safe guard: never overwrites a roster assignment that has already been moved to a different person.
 */
(function(){
  'use strict';
  const VERSION='V441_CH4_TRANSFER_TO_COVER';
  if(window.__CNMI_V441_CH4_TRANSFER_TO_COVER__)return;
  window.__CNMI_V441_CH4_TRANSFER_TO_COVER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{return window.sb||sb||null;}catch(_){return window.sb||null;}}
  function txt(v){return String(v==null?'':v).trim();}
  function normDate(v){return txt(v).slice(0,10);}
  function currentStaff(){
    try{if(typeof window.currentStaffId==='function')return txt(window.currentStaffId());}catch(_){ }
    const s=S();return txt(s.profile?.staff_id||s.profile?.id||s.user?.id||'');
  }
  function staffName(id){
    const row=(S().staff||[]).find(x=>txt(x?.id)===txt(id))||{};
    return txt(row.nickname||row.full_name||row.email||id||'-');
  }
  function isCovered(rec){return txt(rec?.status).toLowerCase()==='covered_by_other'&&!!txt(rec?.covered_by_staff_id);}
  function assignmentFor(rec){
    const rows=S().rosterAssignments||[];
    const rid=txt(rec?.roster_assignment_id);
    if(rid){const byId=rows.find(r=>txt(r?.id)===rid);if(byId)return byId;}
    const date=normDate(rec?.work_date||rec?.duty_date),owner=txt(rec?.owner_staff_id||rec?.staff_id),code=txt(rec?.duty_code||'ช4');
    return rows.find(r=>normDate(r?.duty_date)===date&&txt(r?.staff_id)===owner&&txt(r?.duty_code||'ช4')===code)||null;
  }
  function updateLocal(assignment,coveredBy,saved){
    const s=S(),id=txt(assignment?.id||saved?.id);
    const patch=row=>{
      if(!row)return row;
      if(id&&txt(row.id)===id)return Object.assign(row,saved||{}, {staff_id:coveredBy});
      if(!id&&normDate(row.duty_date)===normDate(assignment?.duty_date)&&txt(row.duty_code)===txt(assignment?.duty_code)&&txt(row.staff_id)===txt(assignment?.staff_id))return Object.assign(row,saved||{}, {staff_id:coveredBy});
      return row;
    };
    if(Array.isArray(s.rosterAssignments))s.rosterAssignments.forEach(patch);
    if(Array.isArray(s.rosterDraft?.assignments))s.rosterDraft.assignments.forEach(patch);
    if(assignment)Object.assign(assignment,saved||{}, {staff_id:coveredBy});
  }
  async function transferCh4Assignment(assignment,coveredBy,opts={}){
    const client=DB();
    if(!client)throw new Error('ยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    if(!assignment)throw new Error('ไม่พบรายการ ช4');
    const owner=txt(opts.ownerStaffId||assignment.staff_id),receiver=txt(coveredBy);
    if(!receiver)throw new Error('กรุณาเลือกผู้ที่อยู่แทน');
    if(receiver===owner)return assignment;

    // Already transferred locally: treat as success.
    if(txt(assignment.staff_id)===receiver)return assignment;
    // A different later change wins; do not overwrite it.
    if(txt(assignment.staff_id)!==owner)return assignment;

    const patch={staff_id:receiver};
    const updater=currentStaff();if(updater)patch.updated_by=updater;
    const attempts=[patch, {staff_id:receiver}];
    let last=null;
    for(const payload of attempts){
      let q=client.from('roster_assignments').update(payload);
      if(assignment.id)q=q.eq('id',assignment.id).eq('staff_id',owner);
      else q=q.eq('duty_date',normDate(assignment.duty_date)).eq('duty_code',assignment.duty_code||'ช4').eq('staff_id',owner);
      const res=await q.select('*').maybeSingle();
      if(!res.error){
        let saved=res.data||null;
        if(!saved){
          let check=client.from('roster_assignments').select('*');
          if(assignment.id)check=check.eq('id',assignment.id);
          else check=check.eq('duty_date',normDate(assignment.duty_date)).eq('duty_code',assignment.duty_code||'ช4');
          const current=await check.maybeSingle();
          if(current.error)throw current.error;
          if(txt(current.data?.staff_id)===receiver)saved=current.data;
          else if(current.data&&txt(current.data.staff_id)!==owner)return current.data; // a later manual change wins
          else throw new Error('ย้าย ช4 ไม่สำเร็จ');
        }
        updateLocal(assignment,receiver,saved);
        return saved;
      }
      last=res.error;
      if(!/updated_by|column|schema|cache/i.test(txt(res.error?.message)))break;
    }
    throw last||new Error('ย้าย ช4 ไม่สำเร็จ');
  }

  let reconciling=null;
  async function reconcileExisting(){
    if(reconciling)return reconciling;
    reconciling=(async()=>{
      const recs=(S().shiftConfirmations||[]).filter(isCovered);
      let moved=0;
      for(const rec of recs){
        const assignment=assignmentFor(rec);if(!assignment)continue;
        const owner=txt(rec.owner_staff_id),receiver=txt(rec.covered_by_staff_id);
        // Only migrate old records whose roster is still with the original owner.
        if(!owner||!receiver||txt(assignment.staff_id)!==owner)continue;
        try{await transferCh4Assignment(assignment,receiver,{ownerStaffId:owner,quiet:true});moved++;}
        catch(err){console.warn('[V441] reconcile CH4 cover failed',err);}
      }
      return moved;
    })().finally(()=>{reconciling=null;});
    return reconciling;
  }

  // Reconcile after normal data refresh so older "มีคนอยู่แทน" records are reflected in the roster too.
  const oldLoad=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  if(typeof oldLoad==='function'&&!oldLoad.__v441Wrapped){
    const wrapped=async function loadAllDataV441(){
      const out=await oldLoad.apply(this,arguments);
      await reconcileExisting();
      return out;
    };
    wrapped.__v441Wrapped=true;
    try{window.loadAllData=loadAllData=wrapped;}catch(_){window.loadAllData=wrapped;}
  }

  window.cnmiV441Ch4Transfer={transferCh4Assignment,reconcileExisting,staffName};
  window.setTimeout(()=>{void reconcileExisting();},700);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v441-ch4-transfer-to-cover.js", error); }
;

/* Original source: patch-v442-ch4-transfer-authoritative-fix.js */
try {
/* CNMI Staff Planner V442
 * Authoritative CH4 transfer fix.
 * Problem in V441: some "มีคนอยู่แทน" records were saved in shift_confirmations
 * but the published roster could remain with the original owner.
 *
 * V442 rules:
 * - covered_by_other MUST move the actual roster_assignments.staff_id to the selected replacement.
 * - Never creates OT automatically.
 * - Uses an authoritative DB read -> guarded update -> DB verification.
 * - Repairs existing covered_by_other records when the roster is still with the original owner.
 * - Never overwrites a roster row that was subsequently changed to a third person.
 */
(function(){
  'use strict';
  const VERSION='V442_CH4_TRANSFER_AUTHORITATIVE_FIX';
  if(window.__CNMI_V442_CH4_TRANSFER_AUTHORITATIVE_FIX__)return;
  window.__CNMI_V442_CH4_TRANSFER_AUTHORITATIVE_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{return window.sb||sb||null;}catch(_){return window.sb||null;}}
  function txt(v){return String(v==null?'':v).trim();}
  function dateKey(v){
    try{if(typeof window.normalizeDateKey==='function')return txt(window.normalizeDateKey(v)).slice(0,10);}catch(_){ }
    return txt(v).slice(0,10);
  }
  function isCh4(code){return ['ช4','ช4A','ช4B','ช4-MT'].includes(txt(code));}
  function currentStaff(){
    try{if(typeof window.currentStaffId==='function')return txt(window.currentStaffId());}catch(_){ }
    const s=S();return txt(s.profile?.staff_id||s.profile?.id||'');
  }
  function staffName(id){
    const row=(S().staff||[]).find(x=>txt(x?.id)===txt(id))||{};
    return txt(row.nickname||row.full_name||row.email||id||'-');
  }
  function sameSlot(a,b){
    if(!a||!b)return false;
    if(txt(a.id)&&txt(b.id)&&txt(a.id)===txt(b.id))return true;
    return dateKey(a.duty_date)===dateKey(b.duty_date)
      && txt(a.duty_code)===txt(b.duty_code)
      && (!txt(a.roster_month_id)||!txt(b.roster_month_id)||txt(a.roster_month_id)===txt(b.roster_month_id));
  }
  function syncLocal(saved){
    if(!saved)return;
    const s=S();
    const apply=list=>{
      if(!Array.isArray(list))return;
      const i=list.findIndex(r=>sameSlot(r,saved));
      if(i>=0)list[i]=Object.assign(list[i]||{},saved);
      else list.push(saved);
    };
    apply(s.rosterAssignments);
    if(Array.isArray(s.rosterDraft?.assignments))apply(s.rosterDraft.assignments);
  }
  async function selectCurrent(assignment){
    const client=DB();if(!client)throw new Error('ยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    let res=null;
    if(txt(assignment?.id)){
      res=await client.from('roster_assignments').select('*').eq('id',assignment.id).maybeSingle();
      if(res.error)throw res.error;
      if(res.data)return res.data;
    }
    const date=dateKey(assignment?.duty_date),code=txt(assignment?.duty_code),monthId=txt(assignment?.roster_month_id);
    if(!date||!code)throw new Error('ข้อมูลเวร ช4 ไม่ครบ');
    let q=client.from('roster_assignments').select('*').eq('duty_date',date).eq('duty_code',code);
    if(monthId)q=q.eq('roster_month_id',monthId);
    const rows=await q.limit(5);
    if(rows.error)throw rows.error;
    const data=Array.isArray(rows.data)?rows.data:[];
    if(data.length===1)return data[0];
    const owner=txt(assignment?.staff_id);
    return data.find(r=>txt(r?.staff_id)===owner)||data[0]||null;
  }
  async function updateAuthoritative(current,owner,receiver){
    const client=DB();
    const updater=currentStaff();
    const variants=[];
    if(updater)variants.push({staff_id:receiver,updated_by:updater});
    variants.push({staff_id:receiver});
    let last=null;
    for(const payload of variants){
      let q=client.from('roster_assignments').update(payload);
      if(txt(current?.id))q=q.eq('id',current.id);
      else{
        q=q.eq('duty_date',dateKey(current?.duty_date)).eq('duty_code',txt(current?.duty_code));
        if(txt(current?.roster_month_id))q=q.eq('roster_month_id',current.roster_month_id);
      }
      // Guard against overwriting a later manual change.
      if(owner)q=q.eq('staff_id',owner);
      const res=await q.select('*').maybeSingle();
      if(!res.error&&res.data)return res.data;
      if(!res.error&&!res.data){last=new Error('ไม่พบแถวเวรที่ตรงกับเจ้าของเดิม');break;}
      last=res.error;
      if(!/updated_by|column|schema|cache/i.test(txt(res.error?.message)))break;
    }
    throw last||new Error('ย้าย ช4 ไม่สำเร็จ');
  }
  async function verifyCurrent(reference,receiver){
    const now=await selectCurrent(reference);
    if(!now||txt(now.staff_id)!==txt(receiver))throw new Error('ตรวจสอบแล้ว ช4 ยังไม่ถูกย้าย กรุณาลองใหม่');
    syncLocal(now);
    return now;
  }
  async function transferCh4Assignment(assignment,coveredBy,opts={}){
    if(!assignment)throw new Error('ไม่พบรายการ ช4');
    const receiver=txt(coveredBy);
    if(!receiver)throw new Error('กรุณาเลือกผู้ที่อยู่แทน');
    const owner=txt(opts.ownerStaffId||assignment.staff_id);
    if(receiver===owner)return assignment;

    const current=await selectCurrent(assignment);
    if(!current)throw new Error('ไม่พบรายการ ช4 ในตารางเวรจริง');
    if(!isCh4(current.duty_code)&&!isCh4(assignment.duty_code))throw new Error('รายการนี้ไม่ใช่ ช4');

    const currentOwner=txt(current.staff_id);
    if(currentOwner===receiver){syncLocal(current);return current;}
    if(owner&&currentOwner!==owner){
      // Somebody changed the roster after the cover record was created. Preserve that later edit.
      const err=new Error(`ช4 ถูกแก้เป็น ${staffName(currentOwner)} แล้ว จึงไม่เขียนทับ`);
      err.code='CH4_LATER_CHANGE';
      throw err;
    }

    const saved=await updateAuthoritative(current,owner||currentOwner,receiver);
    syncLocal(saved);
    return await verifyCurrent(saved,receiver);
  }

  function coveredRecords(){
    return (S().shiftConfirmations||[]).filter(r=>txt(r?.status).toLowerCase()==='covered_by_other'&&txt(r?.covered_by_staff_id));
  }
  function localAssignmentFor(rec){
    const rows=S().rosterAssignments||[];
    const rid=txt(rec?.roster_assignment_id);
    if(rid){const x=rows.find(r=>txt(r?.id)===rid);if(x)return x;}
    const d=dateKey(rec?.work_date||rec?.duty_date),owner=txt(rec?.owner_staff_id||rec?.staff_id),code=txt(rec?.duty_code);
    let list=rows.filter(r=>dateKey(r?.duty_date)===d&&txt(r?.staff_id)===owner);
    if(code) {
      const exact=list.find(r=>txt(r?.duty_code)===code);if(exact)return exact;
    }
    list=list.filter(r=>isCh4(r?.duty_code));
    return list.length===1?list[0]:null;
  }
  async function dbAssignmentFor(rec){
    const client=DB();if(!client)return null;
    const rid=txt(rec?.roster_assignment_id);
    if(rid){
      const byId=await client.from('roster_assignments').select('*').eq('id',rid).maybeSingle();
      if(!byId.error&&byId.data)return byId.data;
    }
    const d=dateKey(rec?.work_date||rec?.duty_date),owner=txt(rec?.owner_staff_id||rec?.staff_id),code=txt(rec?.duty_code);
    if(!d||!owner)return null;
    let q=client.from('roster_assignments').select('*').eq('duty_date',d).eq('staff_id',owner);
    if(code&&code!=='ช4')q=q.eq('duty_code',code);else q=q.in('duty_code',['ช4','ช4A','ช4B','ช4-MT']);
    const out=await q.limit(5);
    if(out.error)return null;
    const list=(out.data||[]).filter(r=>isCh4(r?.duty_code));
    return list.length===1?list[0]:(list.find(r=>txt(r?.duty_code)===code)||null);
  }

  let repairing=null;
  async function reconcileExisting(){
    if(repairing)return repairing;
    repairing=(async()=>{
      let moved=0,already=0,skipped=0,failed=0;
      for(const rec of coveredRecords()){
        const owner=txt(rec?.owner_staff_id||rec?.staff_id),receiver=txt(rec?.covered_by_staff_id);
        if(!owner||!receiver||owner===receiver)continue;
        let assignment=localAssignmentFor(rec);
        if(!assignment)assignment=await dbAssignmentFor(rec);
        if(!assignment){skipped++;continue;}
        try{
          const before=txt(assignment.staff_id);
          const out=await transferCh4Assignment(assignment,receiver,{ownerStaffId:owner,repair:true});
          if(before===receiver||txt(out?.staff_id)===receiver&&before!==owner)already++;
          else if(txt(out?.staff_id)===receiver)moved++;
        }catch(err){
          if(err?.code==='CH4_LATER_CHANGE')skipped++;
          else{failed++;console.warn('[V442] repair CH4 cover failed',rec,err);}
        }
      }
      return {moved,already,skipped,failed};
    })().finally(()=>{repairing=null;});
    return repairing;
  }

  // Replace the V441 transfer implementation so every existing V222/V314/V331 handler uses V442 automatically.
  window.cnmiV442Ch4Transfer={transferCh4Assignment,reconcileExisting,staffName};
  window.cnmiV441Ch4Transfer=window.cnmiV441Ch4Transfer||{};
  window.cnmiV441Ch4Transfer.transferCh4Assignment=transferCh4Assignment;
  window.cnmiV441Ch4Transfer.reconcileExisting=reconcileExisting;

  // Run repair after every normal refresh, after shift_confirmations has been loaded.
  const oldLoad=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  if(typeof oldLoad==='function'&&!oldLoad.__v442Wrapped){
    const wrapped=async function loadAllDataV442(){
      const out=await oldLoad.apply(this,arguments);
      await reconcileExisting();
      return out;
    };
    wrapped.__v442Wrapped=true;
    try{window.loadAllData=loadAllData=wrapped;}catch(_){window.loadAllData=wrapped;}
  }

  // Initial repair: the first app load may have started before this final patch file executed.
  // Retry a few times so slow mobile/network loads still get repaired without requiring a manual refresh.
  [900,2200,5000].forEach(delay=>window.setTimeout(async()=>{
    try{
      if(!(S().shiftConfirmations||[]).length)return;
      const result=await reconcileExisting();
      if(result?.moved>0&&typeof window.renderPage==='function')window.renderPage();
    }catch(err){console.warn('[V442] initial repair failed',err);}
  },delay));

  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v442-ch4-transfer-authoritative-fix.js", error); }
;

/* Original source: patch-v443-dashboard-date-navigation.js */
try {
/* CNMI Staff Planner V443
 * Dashboard date navigation.
 * - Keep the existing "ภาพรวมวันนี้" layout, but allow viewing any loaded date.
 * - Previous / next day, native date picker, and one-tap return to today.
 * - All existing dashboard logic follows the selected date because todayStr is scoped
 *   to the selected date only while the dashboard renderer chain is running.
 * - Weekend / public-holiday manpower, helper count, roster, leave/no-duty, activities,
 *   leave/no-duty sequence, and daytime positions therefore reuse their existing rules.
 * - Display/navigation only. No schema/SQL/write changes.
 */
(function(){
  'use strict';
  const VERSION='V443_DASHBOARD_DATE_NAVIGATION';
  if(window.__CNMI_V443_DASHBOARD_DATE_NAVIGATION__)return;
  window.__CNMI_V443_DASHBOARD_DATE_NAVIGATION__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function pad(n){return String(n).padStart(2,'0');}
  function actualToday(){
    const d=new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function validDate(v){
    const s=String(v||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
    const [y,m,d]=s.split('-').map(Number),dt=new Date(y,m-1,d);
    return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?s:'';
  }
  function range(){
    const st=S(),fw=st.fiscalYearWindow||{};
    const now=new Date(),fallbackMin=`${now.getFullYear()-1}-01-01`,fallbackMax=`${now.getFullYear()+1}-12-31`;
    return {min:validDate(fw.calendarQueryStart)||fallbackMin,max:validDate(fw.calendarQueryEnd)||fallbackMax};
  }
  function clamp(v){
    const date=validDate(v)||actualToday(),r=range();
    if(date<r.min)return r.min;
    if(date>r.max)return r.max;
    return date;
  }
  function selectedDate(){
    const st=S();
    const value=clamp(st.dashboardDateV443||actualToday());
    st.dashboardDateV443=value;
    return value;
  }
  function setSelectedDate(v){
    const st=S();
    st.dashboardDateV443=clamp(v);
    try{if(st.page==='dashboard'&&typeof renderPage==='function')renderPage();}catch(err){console.warn('[V443] render selected date',err);}
  }
  function addDays(date,days){
    const [y,m,d]=String(date).split('-').map(Number),dt=new Date(y,m-1,d);
    dt.setDate(dt.getDate()+Number(days||0));
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  }
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v);}
    catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function thaiDate(date){
    try{return typeof formatThaiDate==='function'?String(formatThaiDate(date)):date;}
    catch(_){
      const [y,m,d]=String(date).split('-').map(Number);
      try{return new Date(y,m-1,d).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}catch(__){return date;}
    }
  }
  function weekday(date){
    const [y,m,d]=String(date).split('-').map(Number);
    try{return new Date(y,m-1,d).toLocaleDateString('th-TH',{weekday:'long'});}catch(_){return '';}
  }

  function dateNavHtml(date){
    const r=range(),isToday=date===actualToday();
    return `<div class="v443-dashboard-date-nav" data-v443-dashboard-date-nav>
      <button type="button" class="v443-date-step" data-v443-date-prev aria-label="วันก่อนหน้า" ${date<=r.min?'disabled':''}>‹</button>
      <div class="v443-date-current">
        <strong>${esc(thaiDate(date))}</strong>
        <span>${esc(weekday(date))}</span>
      </div>
      <button type="button" class="v443-date-step" data-v443-date-next aria-label="วันถัดไป" ${date>=r.max?'disabled':''}>›</button>
      <label class="v443-date-picker" title="เลือกวันที่">
        <span>เลือกวันที่</span>
        <input type="date" data-v443-date-input value="${esc(date)}" min="${esc(r.min)}" max="${esc(r.max)}" aria-label="เลือกวันที่สำหรับภาพรวม">
      </label>
      <button type="button" class="v443-today-btn${isToday?' is-current':''}" data-v443-date-today ${isToday?'disabled':''}>วันนี้</button>
    </div>`;
  }

  function replaceDirectText(el,from,to){
    if(!el)return;
    [...el.childNodes].forEach(node=>{
      if(node.nodeType!==Node.TEXT_NODE)return;
      const text=String(node.nodeValue||'');
      if(text.includes(from))node.nodeValue=text.replace(from,to);
    });
  }
  function neutralizeSelectedDateLabels(root){
    // Selector above is the source of truth for the date; keep the cards compact when browsing another day.
    root.querySelectorAll('.stat-card .label').forEach(el=>{
      const t=String(el.textContent||'').trim();
      if(t==='คนลาวันนี้')el.textContent='คนลา';
      else if(t==='กิจกรรมวันนี้')el.textContent='กิจกรรม';
      else if(t==='คนไม่รับเวรวันนี้')el.textContent='คนไม่รับเวร';
      else if(t==='คนอบรมวันนี้')el.textContent='คนอบรม';
      else if(t==='คนออกหน่วยวันนี้')el.textContent='คนออกหน่วย';
      else if(t==='ประชุมวันนี้')el.textContent='ประชุม';
    });
    root.querySelectorAll('.section-title h3').forEach(el=>{
      const t=String(el.textContent||'').trim();
      const map={
        'เวรวันนี้':'เวร',
        'ลา / ไม่รับเวรวันนี้':'ลา / ไม่รับเวร',
        'กิจกรรมวันนี้':'กิจกรรม',
        'ตำแหน่งกลางวันวันนี้':'ตำแหน่งกลางวัน'
      };
      if(map[t])el.textContent=map[t];
    });
    root.querySelectorAll('.v433-manpower-title').forEach(el=>{
      replaceDirectText(el,'กำลังคนตามเวรวันนี้','กำลังคนตามเวร');
      replaceDirectText(el,'กำลังคนวันนี้','กำลังคน');
    });
    root.querySelectorAll('.v440-detail-lines b').forEach(el=>{if(String(el.textContent||'').trim()==='เวรวันนี้')el.textContent='เวร';});
    root.querySelectorAll('.empty-state').forEach(el=>{
      const t=String(el.textContent||'').trim();
      if(t==='ยังไม่มีตารางเวรวันนี้')el.textContent='ยังไม่มีตารางเวรในวันที่เลือก';
      else if(t==='วันนี้ไม่มีรายการลา/ไม่รับเวร')el.textContent='ไม่มีรายการลา/ไม่รับเวรในวันที่เลือก';
      else if(t==='วันนี้ไม่มีกิจกรรม')el.textContent='ไม่มีกิจกรรมในวันที่เลือก';
    });
  }

  function renderWithSelectedDate(oldDashboard,ctx,args){
    const date=selectedDate();
    const originalWindowToday=window.todayStr;
    let originalBinding=null;
    try{originalBinding=typeof todayStr==='function'?todayStr:null;}catch(_){originalBinding=null;}
    const forced=()=>date;
    let html='';
    try{
      try{window.todayStr=forced;todayStr=forced;}catch(_){window.todayStr=forced;}
      html=String(oldDashboard.apply(ctx,args)||'');
    }finally{
      try{
        if(originalBinding){window.todayStr=originalBinding;todayStr=originalBinding;}
        else if(originalWindowToday)window.todayStr=originalWindowToday;
      }catch(_){if(originalWindowToday)window.todayStr=originalWindowToday;}
    }
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      if(date!==actualToday())neutralizeSelectedDateLabels(tpl.content);
      if(!tpl.content.querySelector('[data-v443-dashboard-date-nav]')){
        const nav=document.createElement('template');nav.innerHTML=dateNavHtml(date).trim();
        tpl.content.insertBefore(nav.content.firstElementChild,tpl.content.firstChild);
      }
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      html=holder.innerHTML;
    }catch(err){console.warn('[V443] dashboard date navigation decoration',err);}
    return html;
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV443(){return renderWithSelectedDate(oldDashboard,this,arguments);};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function syncHeader(){
    const st=S();
    if(st.page!=='dashboard')return;
    const date=selectedDate(),isToday=date===actualToday();
    const title=document.getElementById('pageTitle'),subtitle=document.getElementById('pageSubtitle');
    if(title)title.textContent=isToday?'ภาพรวมวันนี้':`ภาพรวมวันที่ ${thaiDate(date)}`;
    if(subtitle)subtitle.textContent=isToday?'สรุปภาพรวมทั้งหมดของวันนี้':'สรุปภาพรวมของวันที่เลือก';
  }
  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV443(){
      const result=oldRenderPage.apply(this,arguments);
      try{syncHeader();}catch(err){console.warn('[V443] dashboard header sync',err);}
      return result;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  document.addEventListener('click',function(e){
    const prev=e.target?.closest?.('[data-v443-date-prev]');
    const next=e.target?.closest?.('[data-v443-date-next]');
    const now=e.target?.closest?.('[data-v443-date-today]');
    if(!prev&&!next&&!now)return;
    e.preventDefault();
    if((prev||next)?.disabled||now?.disabled)return;
    const current=selectedDate();
    if(prev)setSelectedDate(addDays(current,-1));
    else if(next)setSelectedDate(addDays(current,1));
    else setSelectedDate(actualToday());
  },true);

  document.addEventListener('change',function(e){
    const input=e.target?.closest?.('[data-v443-date-input]');
    if(!input)return;
    const value=validDate(input.value);
    if(!value)return;
    setSelectedDate(value);
  },true);

  window.cnmiDashboardDateV443={selectedDate,setSelectedDate,actualToday,range,addDays};

  const style=document.createElement('style');
  style.id='cnmi-v443-dashboard-date-navigation';
  style.textContent=`
    .v443-dashboard-date-nav{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:0 0 14px;padding:9px 10px;border:1px solid #dce8f2;border-radius:14px;background:#fff;box-shadow:0 4px 14px rgba(35,74,105,.04)}
    .v443-date-step,.v443-today-btn,.v443-date-picker{height:34px;border:1px solid #d9e6ef;border-radius:10px;background:#f8fbfd;color:#2d5878;font:inherit;font-weight:850}
    .v443-date-step{width:38px;padding:0;font-size:24px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
    .v443-date-step:disabled{opacity:.35;cursor:default}
    .v443-date-current{min-width:150px;text-align:center;display:grid;line-height:1.15;padding:0 4px}
    .v443-date-current strong{font-size:14px;color:#243c55;font-weight:900}.v443-date-current span{font-size:10px;color:#7b8fa2;font-weight:750;margin-top:2px}
    .v443-date-picker{position:relative;display:inline-flex;align-items:center;justify-content:center;padding:0 12px;cursor:pointer;overflow:hidden;background:#eef7fd;border-color:#cde3f1;color:#2475a9;font-size:11px}
    .v443-date-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
    .v443-today-btn{padding:0 12px;cursor:pointer;font-size:11px;background:#fff}.v443-today-btn.is-current{opacity:.42;cursor:default}
    @media(max-width:820px){
      .v443-dashboard-date-nav{justify-content:flex-start;gap:7px;margin-bottom:13px;padding:9px;border-radius:13px}
      .v443-date-current{min-width:128px;flex:1}.v443-date-current strong{font-size:13px}.v443-date-current span{font-size:10px}
      .v443-date-picker,.v443-today-btn{height:32px;font-size:10px}.v443-date-step{height:32px;width:34px}
    }
    @media(max-width:390px){
      .v443-date-current{min-width:105px}.v443-date-picker{padding:0 10px}.v443-today-btn{padding:0 10px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v443-dashboard-date-navigation.js", error); }
;

/* Original source: patch-v444-dashboard-authoritative-position-date-loader.js */
try {
/* CNMI Staff Planner V444
 * Dashboard authoritative daytime-position loader for selected dates.
 *
 * Problem fixed:
 * - V443 lets the dashboard browse another date, but the daytime-position card could
 *   render before that date's rows had been loaded into state.positions.
 * - The monthly position page could therefore show assignments while Dashboard said
 *   "ยังไม่ได้จัดตำแหน่งกลางวัน".
 *
 * V444 behavior:
 * - Whenever Dashboard opens or its selected date changes, read ONLY that date's
 *   daily_positions + daily_position_day_status directly from Supabase.
 * - Replace only that date in local state, then re-render through the existing V434/V435
 *   card chain. Existing visual design, leave overlays, HR badges, position info popup,
 *   holiday hiding, and all other Dashboard cards remain unchanged.
 * - While a weekday date is being verified, an empty position card says
 *   "กำลังโหลดตำแหน่งกลางวัน…" instead of incorrectly saying there is no schedule.
 * - Read-only sync. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V444_DASHBOARD_AUTHORITATIVE_POSITION_DATE_LOADER';
  if(window.__CNMI_V444_DASHBOARD_AUTHORITATIVE_POSITION_DATE_LOADER__)return;
  window.__CNMI_V444_DASHBOARD_AUTHORITATIVE_POSITION_DATE_LOADER__=true;

  let requestSerial=0;
  let trackedDate='';
  let lastPage='';
  const loadByDate=new Map(); // date -> {status:'loading'|'loaded'|'error',error,at}

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){
    try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}
    return window.sb||window.supabaseClient||null;
  }
  function norm(v){
    try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function actualToday(){
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function selectedDate(){
    try{
      const api=window.cnmiDashboardDateV443;
      if(api&&typeof api.selectedDate==='function')return norm(api.selectedDate());
    }catch(_){}
    return norm(S()?.dashboardDateV443)||actualToday();
  }
  function isDashboard(){return String(S()?.page||'')==='dashboard';}
  function friendly(error){
    try{if(typeof friendlyDbError==='function')return friendlyDbError(error);}catch(_){}
    return error?.message||error?.details||error?.hint||String(error||'เกิดข้อผิดพลาด');
  }
  function replaceDate(date,rows,status){
    const d=norm(date),st=S();
    if(!d||!st)return;
    try{
      if(window.cnmiV261?.replaceDateInState){
        window.cnmiV261.replaceDateInState(d,Array.isArray(rows)?rows:[],status||null);
        return;
      }
    }catch(_){}
    st.positions=(Array.isArray(st.positions)?st.positions:[])
      .filter(row=>norm(row?.work_date)!==d)
      .concat(Array.isArray(rows)?rows:[]);
    st.positionDayStatus=(Array.isArray(st.positionDayStatus)?st.positionDayStatus:[])
      .filter(row=>norm(row?.work_date)!==d)
      .concat(status?[status]:[]);
  }
  async function fetchDate(date){
    const d=norm(date);
    if(!d)throw new Error('วันที่ไม่ถูกต้อง');
    try{
      if(window.cnmiV261?.fetchDateFromDatabase)return await window.cnmiV261.fetchDateFromDatabase(d);
    }catch(error){
      // If the shared authoritative helper itself returned a database error, keep that error.
      throw error;
    }
    const db=DB();
    if(!db)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const [positions,status]=await Promise.all([
      db.from('daily_positions').select('*').eq('work_date',d).order('position_code'),
      db.from('daily_position_day_status').select('*').eq('work_date',d).maybeSingle()
    ]);
    if(positions.error)throw positions.error;
    if(status.error)throw status.error;
    return {rows:positions.data||[],status:status.data||null};
  }
  function renderIfCurrent(date){
    if(!isDashboard()||selectedDate()!==norm(date))return;
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}
    catch(error){console.warn('[V444] dashboard rerender skipped',error);}
  }
  async function loadSelected(date,options={}){
    const d=norm(date);
    if(!d||!isDashboard())return false;
    const current=loadByDate.get(d);
    if(current?.status==='loading'&&!options.force)return current.promise||false;

    const serial=++requestSerial;
    const record={status:'loading',error:null,at:Date.now(),promise:null};
    loadByDate.set(d,record);
    if(options.showLoading!==false)renderIfCurrent(d);

    const promise=(async()=>{
      try{
        const fresh=await fetchDate(d);
        if(serial!==requestSerial||!isDashboard()||selectedDate()!==d)return false;
        replaceDate(d,fresh?.rows||[],fresh?.status||null);
        loadByDate.set(d,{status:'loaded',error:null,at:Date.now(),rows:(fresh?.rows||[]).length,promise:null});
        renderIfCurrent(d);
        console.info(`${VERSION}: selected dashboard date synchronized`,{date:d,rows:(fresh?.rows||[]).length,status:fresh?.status?.status||null});
        return true;
      }catch(error){
        if(serial!==requestSerial)return false;
        console.error(`${VERSION}: selected dashboard date load failed`,error);
        loadByDate.set(d,{status:'error',error:friendly(error),at:Date.now(),promise:null});
        renderIfCurrent(d);
        return false;
      }
    })();
    record.promise=promise;
    return promise;
  }

  function decorateDashboardHtml(html){
    if(!isDashboard())return html;
    const date=selectedDate();
    const load=loadByDate.get(date);
    if(!load)return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'');
      const card=tpl.content.querySelector('[data-v434-daytime-positions]');
      if(card){
        const empty=card.querySelector('.v434-empty');
        if(load.status==='loading'&&empty){
          empty.innerHTML='<span class="v444-position-loading"><span class="v444-position-spinner" aria-hidden="true"></span>กำลังโหลดตำแหน่งกลางวัน…</span>';
          empty.setAttribute('aria-live','polite');
        }else if(load.status==='error'&&empty){
          empty.innerHTML=`<span class="v444-position-load-error">โหลดตำแหน่งกลางวันไม่สำเร็จ<br><small>${escapeSafe(load.error||'กรุณาลองเลือกวันที่อีกครั้ง')}</small></span>`;
          empty.setAttribute('aria-live','polite');
        }else if(load.status==='loaded'&&empty&&date!==actualToday()){
          empty.textContent='ยังไม่ได้จัดตำแหน่งกลางวันสำหรับวันที่เลือก';
        }
      }
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(error){
      console.warn('[V444] dashboard position loading decoration skipped',error);
      return html;
    }
  }
  function escapeSafe(v){
    try{return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');}
    catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV444(){
      const html=oldDashboard.apply(this,arguments);
      return decorateDashboardHtml(String(html||''));
    };
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV444(){
      const page=String(S()?.page||'');
      if(page!=='dashboard'){
        if(lastPage==='dashboard'){
          trackedDate='';
          requestSerial+=1;
        }
        lastPage=page;
        return oldRenderPage.apply(this,arguments);
      }

      lastPage='dashboard';
      const d=selectedDate();
      const changed=d&&d!==trackedDate;
      if(changed){
        trackedDate=d;
        requestSerial+=1; // invalidate any previous selected-date response immediately
        loadByDate.set(d,{status:'loading',error:null,at:Date.now(),promise:null});
      }

      const result=oldRenderPage.apply(this,arguments);
      if(changed){
        // Start only after the current render returns, so the existing V443 date controls stay responsive.
        queueMicrotask(()=>{
          if(isDashboard()&&selectedDate()===d)loadSelected(d,{force:true,showLoading:false});
        });
      }
      return result;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  // Safety net for the initial dashboard if it was already rendered before this patch executed.
  queueMicrotask(()=>{
    if(!isDashboard())return;
    const d=selectedDate();
    if(!d)return;
    if(!trackedDate)trackedDate=d;
    if(!loadByDate.has(d)){
      loadByDate.set(d,{status:'loading',error:null,at:Date.now(),promise:null});
      renderIfCurrent(d);
      loadSelected(d,{force:true,showLoading:false});
    }
  });

  const style=document.createElement('style');
  style.id='cnmi-v444-dashboard-authoritative-position-date-loader';
  style.textContent=`
    .v444-position-loading{display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#66829a;font-weight:750}
    .v444-position-spinner{width:14px;height:14px;border:2px solid #b9d9ec;border-right-color:#2f91c8;border-radius:50%;animation:v444spin .8s linear infinite;flex:0 0 auto}
    .v444-position-load-error{color:#a85b5b;line-height:1.35}.v444-position-load-error small{font-size:10px;color:#8799a9;font-weight:600}
    @keyframes v444spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  window.cnmiDashboardPositionLoaderV444={loadSelected,selectedDate,loadByDate};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v444-dashboard-authoritative-position-date-loader.js", error); }
;

/* Original source: patch-v445-dashboard-selected-date-complete-sync.js */
try {
/* CNMI Staff Planner V445
 * Dashboard selected-date complete sync + restore daytime leave overlays.
 *
 * Fixes two visible regressions when browsing another date from V443/V444:
 * 1) Activities could show 0/empty because Dashboard reused only the preload cache.
 * 2) Daytime-position rows loaded correctly, but the old leave/HR/shortage presentation
 *    was not restored on the compact Dashboard card.
 *
 * Behavior:
 * - Read selected date directly from Supabase for leave/activity/roster/holiday rows.
 * - Merge only the selected date into local state, then let the existing Dashboard chain render.
 * - Keep V434/V435 visual structure and info buttons; only decorate assigned positions with
 *   leave period, HR status and shortage badges, plus ready/assigned summary.
 * - Read-only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V445_DASHBOARD_SELECTED_DATE_COMPLETE_SYNC';
  if(window.__CNMI_V445_DASHBOARD_SELECTED_DATE_COMPLETE_SYNC__)return;
  window.__CNMI_V445_DASHBOARD_SELECTED_DATE_COMPLETE_SYNC__=true;

  let trackedDate='';
  let serial=0;
  const loads=new Map(); // date -> {status,error,at,promise}

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.sb||window.supabaseClient||null;}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function selectedDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443);}catch(_){return norm(S().dashboardDateV443);}}
  function isDashboard(){return String(S().page||'')==='dashboard';}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function friendly(err){try{return typeof friendlyDbError==='function'?friendlyDbError(err):(err?.message||String(err||''));}catch(_){return err?.message||String(err||'');}}
  function inRange(row,date){
    const s=norm(row?.start_date),e=norm(row?.end_date||row?.start_date);
    return !!s&&s<=date&&e>=date;
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!['cancelled','ยกเลิก'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;}}
  function actualLeave(row){
    if(!row||!effective(row))return false;
    const t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveFor(staffId,date){
    return (S().leaves||[]).find(r=>String(r?.staff_id||'')===String(staffId||'')&&actualLeave(r)&&inRange(r,date))||null;
  }
  function periodKind(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(/ครึ่งเช้า|morning/.test(raw))return 'morning';
    if(/ครึ่งบ่าย|afternoon/.test(raw))return 'afternoon';
    return 'full';
  }
  function periodLabel(row){
    const k=periodKind(row);
    return k==='morning'?'ลาครึ่งเช้า':k==='afternoon'?'ลาครึ่งบ่าย':'ลาทั้งวัน';
  }
  function shortageLabel(row){
    const k=periodKind(row);
    return k==='morning'?'⚠ ขาดช่วงเช้า':k==='afternoon'?'⚠ ขาดช่วงบ่าย':'⚠ ตำแหน่งขาด';
  }
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function hrChecked(row){
    try{return typeof isLeaveHrChecked==='function'?!!isLeaveHrChecked(row?.id):(S().hrChecks||[]).some(h=>String(h?.leave_request_id||'')===String(row?.id||'')&&String(h?.status||'')==='ตรวจสอบแล้ว');}
    catch(_){return false;}
  }
  function hrLabel(row){return hrChecked(row)?'✓ ตรวจ HR แล้ว':'รอตรวจ HR';}

  function replaceOverlap(key,date,rows,predicate){
    const st=S(),cur=Array.isArray(st[key])?st[key]:[];
    st[key]=cur.filter(x=>!predicate(x,date)).concat(Array.isArray(rows)?rows:[]);
  }
  function replaceSelectedDate(date,payload){
    replaceOverlap('activities',date,payload.activities,(r,d)=>inRange(r,d));
    replaceOverlap('leaves',date,payload.leaves,(r,d)=>inRange(r,d));
    replaceOverlap('rosterAssignments',date,payload.roster,(r,d)=>norm(r?.duty_date)===d);
    replaceOverlap('holidays',date,payload.holidays,(r,d)=>norm(r?.holiday_date)===d);
  }

  async function fetchSelectedDate(date){
    const db=DB();if(!db)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const [activities,leaves,roster,holidays]=await Promise.all([
      db.from('activity_events').select('*').lte('start_date',date).gte('end_date',date).order('start_date').order('start_time'),
      db.from('leave_requests').select('*').lte('start_date',date).gte('end_date',date).order('created_at',{ascending:true}),
      db.from('roster_assignments').select('*').eq('duty_date',date).order('duty_code'),
      db.from('public_holidays').select('*').eq('holiday_date',date).order('holiday_date')
    ]);
    const packs={activities,leaves,roster,holidays};
    for(const [name,res] of Object.entries(packs))if(res?.error)throw new Error(`${name}: ${friendly(res.error)}`);
    return {
      activities:activities.data||[],
      leaves:leaves.data||[],
      roster:roster.data||[],
      holidays:holidays.data||[]
    };
  }

  function rerenderIfCurrent(date){
    if(!isDashboard()||selectedDate()!==date)return;
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(err){console.warn('[V445] rerender skipped',err);}
  }
  async function loadSelected(date,{force=false}={}){
    const d=norm(date);if(!d||!isDashboard())return false;
    const old=loads.get(d);
    if(old?.status==='loading'&&!force)return old.promise||false;
    const my=++serial;
    const rec={status:'loading',error:null,at:Date.now(),promise:null};
    loads.set(d,rec);
    rerenderIfCurrent(d);
    const promise=(async()=>{
      try{
        const payload=await fetchSelectedDate(d);
        if(my!==serial||!isDashboard()||selectedDate()!==d)return false;
        replaceSelectedDate(d,payload);
        loads.set(d,{status:'loaded',error:null,at:Date.now(),promise:null,activityCount:payload.activities.length,leaveCount:payload.leaves.length,rosterCount:payload.roster.length});
        rerenderIfCurrent(d);
        console.info(`${VERSION}: synchronized`,{date:d,activities:payload.activities.length,leaves:payload.leaves.length,roster:payload.roster.length});
        return true;
      }catch(err){
        if(my!==serial)return false;
        loads.set(d,{status:'error',error:friendly(err),at:Date.now(),promise:null});
        console.error(`${VERSION}: load failed`,err);
        rerenderIfCurrent(d);
        return false;
      }
    })();
    rec.promise=promise;
    return promise;
  }

  function rowsForDate(date){
    try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}
  }
  function zoneOf(row){try{return window.cnmiDashboardPositionsV434?.zoneOf?.(row)||String(row?.zone||'');}catch(_){return String(row?.zone||'');}}
  function decoratePositionCard(root,date){
    const card=root.querySelector?.('[data-v434-daytime-positions]');
    if(!card)return;
    const rows=rowsForDate(date);
    if(!rows.length)return;
    const items=[...card.querySelectorAll('.v434-position-item')];
    const byZone=new Map();
    let assigned=0,leaveCount=0;

    rows.forEach((row,i)=>{
      const item=items[i];if(!item)return;
      item.querySelectorAll('.v445-position-leave-meta').forEach(n=>n.remove());
      item.classList.remove('v445-has-leave','v445-half-leave','v445-full-leave');
      const sid=row?.staff_id;
      if(sid)assigned++;
      const leave=sid?leaveFor(sid,date):null;
      const zone=zoneOf(row)||'อื่นๆ';
      if(!byZone.has(zone))byZone.set(zone,{total:0,assigned:0,leave:0});
      const z=byZone.get(zone);z.total++;if(sid)z.assigned++;
      if(!leave)return;
      leaveCount++;z.leave++;
      const kind=periodKind(leave);
      item.classList.add('v445-has-leave',kind==='full'?'v445-full-leave':'v445-half-leave');
      const meta=document.createElement('div');
      meta.className='v445-position-leave-meta';
      const hr=admin()?`<span class="v445-hr-pill ${hrChecked(leave)?'is-done':'is-pending'}">${esc(hrLabel(leave))}</span>`:'';
      meta.innerHTML=`<div class="v445-position-status-line"><span class="v445-leave-pill">${esc(periodLabel(leave))}</span>${hr}</div><div class="v445-shortage-pill">${esc(shortageLabel(leave))}</div>`;
      item.appendChild(meta);
    });

    const ready=Math.max(0,assigned-leaveCount);
    const summaries=card.querySelector('.v434-summary-badges');
    if(summaries){
      summaries.querySelectorAll('.v445-ready-badge,.v445-leave-count-badge').forEach(n=>n.remove());
      const complete=summaries.querySelector('.v434-complete-badge');
      if(complete&&/^ครบ\s/.test(String(complete.textContent||'').trim()))complete.textContent=String(complete.textContent||'').replace(/^ครบ\s*/,'จัดครบ ');
      summaries.insertAdjacentHTML('beforeend',`<span class="v445-ready-badge">พร้อมปฏิบัติงาน ${ready}/${rows.length}</span>${leaveCount?`<span class="v445-leave-count-badge">ลา ${leaveCount}</span>`:''}`);
    }

    const groups=[...card.querySelectorAll('.v434-zone-group')];
    groups.forEach(group=>{
      const name=String(group.querySelector('.v434-zone-head b')?.textContent||'').trim();
      const stat=byZone.get(name);if(!stat)return;
      const span=group.querySelector('.v434-zone-head span');if(!span)return;
      const readyZone=Math.max(0,stat.assigned-stat.leave);
      span.classList.add('v445-zone-count');
      span.innerHTML=`<b>พร้อม ${readyZone}/${stat.total}</b><small>จัด ${stat.assigned}/${stat.total}</small>`;
    });
  }

  function decorateActivityLoading(root,date){
    const load=loads.get(date);if(!load)return;
    const cards=[...root.querySelectorAll?.('.card')||[]];
    const activityCard=cards.find(c=>String(c.querySelector('h3')?.textContent||'').trim()==='กิจกรรม'||String(c.querySelector('h3')?.textContent||'').includes('กิจกรรมวันนี้'));
    const stat=[...root.querySelectorAll?.('.stat-card')||[]].find(c=>String(c.querySelector('.label')?.textContent||'').includes('กิจกรรม'));
    if(load.status==='loading'){
      if(stat?.querySelector('.num'))stat.querySelector('.num').textContent='…';
      const empty=activityCard?.querySelector('.empty-state');
      if(empty)empty.innerHTML='<span class="v445-activity-loading"><span class="v445-spinner"></span>กำลังโหลดกิจกรรม…</span>';
    }else if(load.status==='error'){
      const empty=activityCard?.querySelector('.empty-state');
      if(empty)empty.innerHTML=`<span class="v445-load-error">โหลดกิจกรรมไม่สำเร็จ<br><small>${esc(load.error||'กรุณาลองเลือกวันที่อีกครั้ง')}</small></span>`;
    }
  }

  function decorateHtml(html){
    if(!isDashboard())return html;
    const d=selectedDate();if(!d)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decoratePositionCard(tpl.content,d);
      decorateActivityLoading(tpl.content,d);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn('[V445] dashboard decoration skipped',err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV445(){return decorateHtml(String(oldDashboard.apply(this,arguments)||''));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV445(){
      const page=String(S().page||'');
      if(page!=='dashboard'){
        trackedDate='';serial++;
        return oldRenderPage.apply(this,arguments);
      }
      const d=selectedDate(),changed=!!d&&d!==trackedDate;
      if(changed){trackedDate=d;serial++;loads.set(d,{status:'loading',error:null,at:Date.now(),promise:null});}
      const out=oldRenderPage.apply(this,arguments);
      if(changed)queueMicrotask(()=>{if(isDashboard()&&selectedDate()===d)loadSelected(d,{force:true});});
      return out;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  queueMicrotask(()=>{
    if(!isDashboard())return;
    const d=selectedDate();if(!d)return;
    if(!trackedDate)trackedDate=d;
    if(!loads.has(d)){loads.set(d,{status:'loading',error:null,at:Date.now(),promise:null});loadSelected(d,{force:true});}
  });

  const style=document.createElement('style');style.id='cnmi-v445-dashboard-selected-date-complete-sync';style.textContent=`
    .v445-position-leave-meta{grid-column:1/-1;display:grid;gap:5px;margin-top:2px;min-width:0}
    .v445-position-status-line{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
    .v445-leave-pill,.v445-hr-pill,.v445-shortage-pill,.v445-ready-badge,.v445-leave-count-badge{display:inline-flex;align-items:center;width:max-content;max-width:100%;border-radius:999px;font-weight:900;line-height:1.15;white-space:nowrap}
    .v445-leave-pill{padding:4px 8px;background:#fff7ed;color:#b45309;border:1px solid #fdba74;font-size:10px}
    .v445-hr-pill{padding:4px 8px;font-size:9px}.v445-hr-pill.is-done{background:#ecfdf3;color:#067647}.v445-hr-pill.is-pending{background:#f2f4f7;color:#667085}
    .v445-shortage-pill{padding:4px 8px;background:#fff1f2;color:#b42318;font-size:10px}
    .v434-position-item.v445-has-leave{background:#fffaf5!important;border-color:#f3b25d!important;box-shadow:inset 4px 0 0 #f3b25d}
    .v434-position-item.v445-half-leave{background:#fffdf3!important;border-color:#e9c55c!important;box-shadow:inset 4px 0 0 #e9c55c}
    .v445-ready-badge{padding:5px 9px;background:#fff7e6;color:#9b5d00;border:1px solid #f4c76d;font-size:10px}
    .v445-leave-count-badge{padding:5px 9px;background:#fff1f0;color:#b42318;border:1px solid #ffc8c2;font-size:10px}
    .v445-zone-count{display:grid!important;justify-items:end;gap:1px;line-height:1.05!important}.v445-zone-count b{font-size:10px;color:#72879a}.v445-zone-count small{font-size:9px;color:#9aa9b6;font-weight:800}
    .v445-activity-loading{display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#66829a;font-weight:750}.v445-spinner{width:14px;height:14px;border:2px solid #b9d9ec;border-right-color:#2f91c8;border-radius:50%;animation:v445spin .8s linear infinite}.v445-load-error{color:#a85b5b}.v445-load-error small{color:#8799a9;font-size:10px}
    @keyframes v445spin{to{transform:rotate(360deg)}}
    @media(max-width:820px){
      .v445-position-leave-meta{gap:6px;margin-top:1px}.v445-leave-pill,.v445-shortage-pill{font-size:11px;padding:5px 9px}.v445-hr-pill{font-size:10px;padding:5px 8px}
      .v445-ready-badge,.v445-leave-count-badge{font-size:11px;padding:5px 9px}.v445-zone-count b{font-size:12px}.v445-zone-count small{font-size:10px}
      .v434-position-item.v445-has-leave{min-height:86px}
    }
  `;document.head.appendChild(style);

  window.cnmiDashboardSelectedDateV445={loadSelected,loads,selectedDate,leaveFor,decoratePositionCard};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v445-dashboard-selected-date-complete-sync.js", error); }
;

/* Original source: patch-v446-dashboard-position-leave-binding-fix.js */
try {
/* CNMI Staff Planner V446
 * Fix Dashboard daytime-position leave badges binding.
 *
 * V445 correctly loaded the selected date, but paired position rows to rendered
 * cards by array index. The Dashboard groups Blood Bank / Donor Room before
 * rendering, so the DOM order can differ from the authoritative row order.
 * This patch removes that positional pairing and binds each rendered card by
 * zone + position code, then reads leave by the matched row's staff_id.
 *
 * Display-only. Keeps the V434/V435 layout and V445 styles unchanged.
 */
(function(){
  'use strict';
  const VERSION='V446_DASHBOARD_POSITION_LEAVE_BINDING_FIX';
  if(window.__CNMI_V446_DASHBOARD_POSITION_LEAVE_BINDING_FIX__)return;
  window.__CNMI_V446_DASHBOARD_POSITION_LEAVE_BINDING_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function normDate(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S().dashboardDateV443);}catch(_){return normDate(S().dashboardDateV443);}
  }
  function isDashboard(){return String(S().page||'')==='dashboard';}
  function text(v){return String(v==null?'':v).trim();}
  function key(v){return text(v).replace(/\s+/g,'').replace(/[–—]/g,'-').toLowerCase();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}

  function rowsForDate(date){
    try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}
  }
  function zoneOf(row){
    try{return text(window.cnmiDashboardPositionsV434?.zoneOf?.(row))||text(row?.zone)||'อื่นๆ';}catch(_){return text(row?.zone)||'อื่นๆ';}
  }
  function codeOf(row){return text(row?.position_code||row?.code);}
  function labelOf(row){
    const code=codeOf(row);
    try{if(typeof positionLabelForCell==='function')return text(positionLabelForCell(code))||code;}catch(_){ }
    try{if(typeof labelCode==='function')return text(labelCode(code))||code;}catch(_){ }
    return code;
  }
  function rowKey(row){return `${key(zoneOf(row))}|${key(labelOf(row)||codeOf(row))}`;}
  function itemLabel(item){
    const node=item?.querySelector?.('.v434-position-code');
    if(!node)return '';
    const clone=node.cloneNode(true);
    clone.querySelectorAll?.('.v435-info-mark').forEach(n=>n.remove());
    return text(clone.textContent);
  }
  function itemKey(item){
    const zone=text(item?.closest?.('.v434-zone-group')?.querySelector?.('.v434-zone-head b')?.textContent)||'อื่นๆ';
    return `${key(zone)}|${key(itemLabel(item))}`;
  }

  function inRange(row,date){
    const s=normDate(row?.start_date),e=normDate(row?.end_date||row?.start_date);
    return !!s&&s<=date&&e>=date;
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!['cancelled','ยกเลิก'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;}}
  function actualLeave(row){
    if(!row||!effective(row))return false;
    const t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveFor(staffId,date){
    if(!staffId)return null;
    return (S().leaves||[]).find(r=>String(r?.staff_id||'')===String(staffId)&&actualLeave(r)&&inRange(r,date))||null;
  }
  function periodKind(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(/ครึ่งเช้า|morning/.test(raw))return 'morning';
    if(/ครึ่งบ่าย|afternoon/.test(raw))return 'afternoon';
    return 'full';
  }
  function periodLabel(row){const k=periodKind(row);return k==='morning'?'ลาครึ่งเช้า':k==='afternoon'?'ลาครึ่งบ่าย':'ลาทั้งวัน';}
  function shortageLabel(row){const k=periodKind(row);return k==='morning'?'⚠ ขาดช่วงเช้า':k==='afternoon'?'⚠ ขาดช่วงบ่าย':'⚠ ตำแหน่งขาด';}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function hrChecked(row){
    try{return typeof isLeaveHrChecked==='function'?!!isLeaveHrChecked(row?.id):(S().hrChecks||[]).some(h=>String(h?.leave_request_id||'')===String(row?.id||'')&&String(h?.status||'')==='ตรวจสอบแล้ว');}
    catch(_){return false;}
  }
  function hrLabel(row){return hrChecked(row)?'✓ ตรวจ HR แล้ว':'รอตรวจ HR';}

  function resetItem(item){
    item?.querySelectorAll?.('.v445-position-leave-meta').forEach(n=>n.remove());
    item?.classList?.remove('v445-has-leave','v445-half-leave','v445-full-leave');
    if(item){delete item.dataset.v446StaffId;delete item.dataset.v446PositionCode;}
  }
  function addLeaveMeta(item,leave){
    const kind=periodKind(leave);
    item.classList.add('v445-has-leave',kind==='full'?'v445-full-leave':'v445-half-leave');
    const meta=document.createElement('div');
    meta.className='v445-position-leave-meta';
    const hr=admin()?`<span class="v445-hr-pill ${hrChecked(leave)?'is-done':'is-pending'}">${esc(hrLabel(leave))}</span>`:'';
    meta.innerHTML=`<div class="v445-position-status-line"><span class="v445-leave-pill">${esc(periodLabel(leave))}</span>${hr}</div><div class="v445-shortage-pill">${esc(shortageLabel(leave))}</div>`;
    item.appendChild(meta);
  }

  function fixPositionCard(root,date){
    const card=root?.querySelector?.('[data-v434-daytime-positions]');
    if(!card)return;
    const rows=rowsForDate(date);
    if(!rows.length)return;
    const items=[...card.querySelectorAll('.v434-position-item')];
    if(!items.length)return;

    // V445 may already have decorated the wrong cards; clear all of those first.
    items.forEach(resetItem);

    const rowMap=new Map();
    rows.forEach(row=>{
      const rk=rowKey(row);
      if(rk&&!rowMap.has(rk))rowMap.set(rk,row);
    });

    let assigned=0,leaveCount=0;
    const byZone=new Map();

    items.forEach(item=>{
      const row=rowMap.get(itemKey(item));
      if(!row)return;
      const sid=row?.staff_id||'';
      const zone=zoneOf(row)||'อื่นๆ';
      const position=codeOf(row)||labelOf(row);
      item.dataset.v446StaffId=String(sid||'');
      item.dataset.v446PositionCode=String(position||'');

      if(!byZone.has(zone))byZone.set(zone,{total:0,assigned:0,leave:0});
      const z=byZone.get(zone);z.total++;
      if(sid){assigned++;z.assigned++;}

      const leave=sid?leaveFor(sid,date):null;
      if(!leave)return;
      leaveCount++;z.leave++;
      addLeaveMeta(item,leave);
    });

    // Count rows that did not find a rendered card only for total/assigned fallback.
    // In normal V434 output every row has one card; this protects summary accuracy
    // without ever attaching a leave badge to a guessed DOM position.
    if(assigned===0&&rows.some(r=>r?.staff_id))assigned=rows.filter(r=>!!r?.staff_id).length;

    const ready=Math.max(0,assigned-leaveCount);
    const summaries=card.querySelector('.v434-summary-badges');
    if(summaries){
      summaries.querySelectorAll('.v445-ready-badge,.v445-leave-count-badge').forEach(n=>n.remove());
      const complete=summaries.querySelector('.v434-complete-badge');
      if(complete&&/^ครบ\s/.test(text(complete.textContent)))complete.textContent=text(complete.textContent).replace(/^ครบ\s*/, 'จัดครบ ');
      summaries.insertAdjacentHTML('beforeend',`<span class="v445-ready-badge">พร้อมปฏิบัติงาน ${ready}/${rows.length}</span>${leaveCount?`<span class="v445-leave-count-badge">ลา ${leaveCount}</span>`:''}`);
    }

    [...card.querySelectorAll('.v434-zone-group')].forEach(group=>{
      const zone=text(group.querySelector('.v434-zone-head b')?.textContent);
      const stat=byZone.get(zone);if(!stat)return;
      const span=group.querySelector('.v434-zone-head span');if(!span)return;
      const readyZone=Math.max(0,stat.assigned-stat.leave);
      span.classList.add('v445-zone-count');
      span.innerHTML=`<b>พร้อม ${readyZone}/${stat.total}</b><small>จัด ${stat.assigned}/${stat.total}</small>`;
    });

    card.dataset.v446LeaveBinding='position-code-staff-id';
  }

  function decorateHtml(html){
    if(!isDashboard())return html;
    const date=selectedDate();if(!date)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      fixPositionCard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn('[V446] HTML correction skipped',err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v446Wrapped){
    const wrapped=function renderDashboardV446(){return decorateHtml(previousDashboard.apply(this,arguments));};
    wrapped.__v446Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function fixCurrentDom(){
    if(!isDashboard())return;
    const date=selectedDate();
    if(date)fixPositionCard(document,date);
  }

  // The renderDashboard wrapper above is the authoritative path. pageshow is only a
  // safety refresh for restored mobile/PWA pages; no MutationObserver is used here
  // because rebuilding badges itself is a DOM mutation.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fixCurrentDom,{once:true});else queueMicrotask(fixCurrentDom);
  window.addEventListener('pageshow',fixCurrentDom);
  window.cnmiDashboardPositionLeaveV446={version:VERSION,fixPositionCard,rowKey,itemKey,leaveFor};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v446-dashboard-position-leave-binding-fix.js", error); }
;

/* Original source: patch-v447-leave-sequence-detail-popup.js */
try {
/* CNMI Staff Planner V447
 * Leave sequence detail popup.
 * - Tap "ลำดับลา 1/2/3..." to see the original leave submission timestamp.
 * - Dashboard supports the V443 selected date.
 * - Calendar detail and monthly roster compact leave badges are tappable too.
 * - Uses existing V431 sequence logic / leave_requests.created_at; display-only.
 * No SQL/schema/query/write changes.
 */
(function(){
  'use strict';
  const VERSION='V447_LEAVE_SEQUENCE_DETAIL_POPUP';
  if(window.__CNMI_V447_LEAVE_SEQUENCE_DETAIL_POPUP__)return;
  window.__CNMI_V447_LEAVE_SEQUENCE_DETAIL_POPUP__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v);}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return typeof normalizeDateKey==='function'?normalizeDateKey(v):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function rowType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function actualLeave(row){return !!row&&effective(row)&&!!rowType(row)&&rowType(row)!=='ไม่รับเวร';}
  function staffNickSafe(id){try{return typeof staffNick==='function'?String(staffNick(id)||''):'';}catch(_){return '';}}
  function rosterEnabled(st){try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}}
  function activeLeave(staffId,date){try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}}
  function monthDates(key){
    try{const rows=typeof scheduleMonthDates==='function'?scheduleMonthDates(String(key||'').slice(0,7)):[];return Array.isArray(rows)?rows.map(normDate).filter(Boolean):[];}
    catch(_){return [];}
  }
  function selectedDashboardDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(typeof todayStr==='function'?todayStr():'');}
    catch(_){try{return normDate(todayStr());}catch(__){return new Date().toISOString().slice(0,10);}}
  }
  function sequenceForDate(date){
    try{return Array.isArray(window.cnmiLeaveSequenceV431?.leaveSequenceForDate?.(date))?window.cnmiLeaveSequenceV431.leaveSequenceForDate(date):[];}
    catch(_){return [];}
  }
  function rankFor(row,date){try{return Number(window.cnmiLeaveSequenceV431?.rankFor?.(row,date))||null;}catch(_){return null;}}
  function submittedMs(row){
    try{
      const n=Number(window.cnmiLeaveSequenceV431?.leaveSubmittedMs?.(row));
      if(Number.isFinite(n))return n;
    }catch(_){ }
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt,row?.updated_at]){
      const n=Date.parse(String(v||''));if(Number.isFinite(n))return n;
    }
    return Number.POSITIVE_INFINITY;
  }
  function submittedDateTime(row){
    const ms=submittedMs(row);
    if(!Number.isFinite(ms)||ms===Number.POSITIVE_INFINITY)return 'ไม่พบเวลาบันทึกเดิม';
    const d=new Date(ms);if(Number.isNaN(d.getTime()))return 'ไม่พบเวลาบันทึกเดิม';
    try{
      const date=d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
      const time=d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',hour12:false});
      return `${date} เวลา ${time} น.`;
    }catch(_){return d.toLocaleString();}
  }
  function thaiDate(date){
    try{return typeof formatThaiDate==='function'?String(formatThaiDate(date)):date;}
    catch(_){
      try{const [y,m,d]=String(date).split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}catch(__){return date;}
    }
  }
  function hitFor(date,staffId,rank){
    const seq=sequenceForDate(date);
    if(staffId){const byStaff=seq.find(x=>String(x?.staff_id||'')===String(staffId));if(byStaff)return byStaff;}
    if(rank){const byRank=seq.find(x=>Number(x?.rank)===Number(rank));if(byRank)return byRank;}
    return null;
  }

  function showLeaveRankDetail(date,staffId,rank){
    const d=normDate(date)||selectedDashboardDate();
    const hit=hitFor(d,staffId,rank);if(!hit)return;
    const nick=staffNickSafe(hit.staff_id)||'-';
    const submitted=submittedDateTime(hit.row);
    const modalHtml=`
      <div class="v447-rank-detail-modal">
        <div class="v447-rank-detail-head">
          <span class="v447-rank-detail-number">${Number(hit.rank)||''}</span>
          <div><h2>ลำดับลา ${Number(hit.rank)||''}</h2><p>${esc(nick)}</p></div>
        </div>
        <div class="v447-rank-detail-grid">
          <div><small>วันที่ลา</small><b>${esc(thaiDate(d))}</b></div>
          <div><small>บันทึกคำลาครั้งแรก</small><b>${esc(submitted)}</b></div>
        </div>
        <p class="v447-rank-detail-note">ลำดับนี้อ้างอิงเวลาบันทึกคำลาครั้งแรกของรายการ ไม่เปลี่ยนเมื่อกลับมาแก้เหตุผลภายหลัง</p>
      </div>`;
    try{if(typeof showModal==='function')showModal(modalHtml,{small:true});}
    catch(err){console.warn(`[${VERSION}] show modal failed`,err);}
  }

  /* Dashboard: turn the existing V431 leave-rank badge into a real button.
     We intentionally do not rebuild the card, preserving all V445/V446 styling. */
  function decorateDashboardHtml(html){
    const date=selectedDashboardDate();
    const seq=sequenceForDate(date);if(!seq.length)return html;
    const byNick=new Map();
    seq.forEach(x=>{const nick=staffNickSafe(x.staff_id).trim();if(nick)byNick.set(nick,x);});
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      tpl.content.querySelectorAll('.v431-leave-rank-badge').forEach(old=>{
        if(old.matches('[data-v447-leave-rank]'))return;
        const item=old.closest('.v397-today-item');
        if(item&&/ไม่รับเวร/.test(String(item.textContent||'')))return;
        const nick=String(item?.querySelector('b')?.textContent||'').trim();
        let hit=byNick.get(nick)||null;
        const rankText=String(old.textContent||'').match(/(\d+)/);
        if(!hit&&rankText)hit=seq.find(x=>Number(x.rank)===Number(rankText[1]))||null;
        if(!hit)return;
        const btn=document.createElement('button');
        btn.type='button';
        btn.className=`${old.className} v447-leave-rank-button`;
        btn.dataset.v447LeaveRank=String(hit.rank);
        btn.dataset.v447Date=date;
        btn.dataset.v447Staff=String(hit.staff_id||'');
        btn.title='แตะดูเวลาที่บันทึกคำลาครั้งแรก';
        btn.textContent=`ลำดับลา ${hit.rank}`;
        old.replaceWith(btn);
      });
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decoration skipped`,err);return html;}
  }
  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV447(){return decorateDashboardHtml(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  /* Monthly roster: keep the exact compact ① พัก / ② กิจ appearance from V432,
     but make the leave pill tappable without changing its layout. */
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
          const leave=activeLeave(st.id,date);if(!actualLeave(leave))return;
          const rank=rankFor(leave,date);if(!rank)return;
          const badge=cell.querySelector('.v432-compact-leave');if(!badge)return;
          badge.dataset.v447LeaveRank=String(rank);
          badge.dataset.v447Date=date;
          badge.dataset.v447Staff=String(st.id||leave.staff_id||'');
          badge.setAttribute('tabindex','0');
          badge.setAttribute('role','button');
          badge.classList.add('v447-roster-leave-clickable');
          badge.title=`${badge.title||`ลำดับลา ${rank}`} · แตะดูเวลาที่บันทึกครั้งแรก`;
        });
      });
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] roster decoration skipped`,err);return html;}
  }
  const oldGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldGrid==='function'){
    const wrappedGrid=function renderGridViewV447(staffList,assignments,key){return decorateRosterHtml(oldGrid.apply(this,arguments),staffList,key);};
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  /* Calendar day/detail popup: convert V431's leave-rank label to the same tappable control. */
  const oldCalendarDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof oldCalendarDetail==='function'){
    const wrappedDetail=function calendarEventDetailV447(e){
      let base=String(oldCalendarDetail.apply(this,arguments)||'');
      if(!e?.raw||!e?.date||!actualLeave(e.raw))return base;
      const date=normDate(e.date),rank=Number(e?.leaveRankV431)||rankFor(e.raw,date);if(!rank)return base;
      const staffId=String(e.raw?.staff_id||'');
      const button=`<button type="button" class="v431-calendar-rank v447-calendar-leave-rank" data-v447-leave-rank="${rank}" data-v447-date="${esc(date)}" data-v447-staff="${esc(staffId)}" title="แตะดูเวลาที่บันทึกคำลาครั้งแรก">ลำดับลา ${rank}</button>`;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=base;
        const old=tpl.content.querySelector('.v431-calendar-rank');
        if(old){const t=document.createElement('template');t.innerHTML=button;old.replaceWith(t.content.firstElementChild);}
        else{const t=document.createElement('template');t.innerHTML=`<br>${button}`;tpl.content.insertBefore(t.content.cloneNode(true),tpl.content.firstChild);}
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));base=holder.innerHTML;
      }catch(_){base=`<br>${button}${base}`;}
      return base;
    };
    try{window.calendarEventDetail=calendarEventDetail=wrappedDetail;}catch(_){window.calendarEventDetail=wrappedDetail;}
  }

  function activate(target){
    if(!target)return false;
    const date=normDate(target.dataset.v447Date)||selectedDashboardDate();
    const staffId=String(target.dataset.v447Staff||'');
    const rank=Number(target.dataset.v447LeaveRank)||null;
    showLeaveRankDetail(date,staffId,rank);
    return true;
  }
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-v447-leave-rank]');if(!target)return;
    event.preventDefault();event.stopPropagation();activate(target);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const target=event.target?.closest?.('[data-v447-leave-rank]');if(!target)return;
    event.preventDefault();event.stopPropagation();activate(target);
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v447-leave-sequence-detail-popup';
  style.textContent=`
    .v431-leave-rank-badge.v447-leave-rank-button,.v447-calendar-leave-rank{appearance:none;-webkit-appearance:none;font-family:inherit;cursor:pointer;touch-action:manipulation}
    .v431-leave-rank-badge.v447-leave-rank-button{border:1px solid #b9daf3;background:#f1f8ff;color:#216ca3}
    .v431-leave-rank-badge.v447-leave-rank-button:hover,.v447-calendar-leave-rank:hover{background:#e7f4ff;border-color:#8ec8ed}
    .v431-leave-rank-badge.v447-leave-rank-button:focus-visible,.v447-calendar-leave-rank:focus-visible,.v447-roster-leave-clickable:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(47,145,200,.18)}
    .v447-calendar-leave-rank{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;margin:4px 0 2px;padding:2px 7px;border:1px solid #b9daf3;border-radius:999px;background:#f1f8ff;color:#216ca3;font-size:11px;font-weight:900;line-height:1.25;white-space:nowrap}
    .clean-schedule-grid .v447-roster-leave-clickable{cursor:pointer;touch-action:manipulation}
    .v447-rank-detail-modal{display:grid;gap:13px}
    .v447-rank-detail-head{display:flex;align-items:center;gap:11px}
    .v447-rank-detail-number{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#eef6fd;color:#2a5f88;font-size:20px;font-weight:950;flex:0 0 auto}
    .v447-rank-detail-head h2{margin:0;color:#263d53;font-size:18px;line-height:1.2}.v447-rank-detail-head p{margin:3px 0 0;color:#667b90;font-weight:800}
    .v447-rank-detail-grid{display:grid;gap:8px}.v447-rank-detail-grid>div{display:grid;gap:3px;padding:10px 12px;border:1px solid #dce7f0;border-radius:11px;background:#fbfdff}.v447-rank-detail-grid small{color:#7b8ea2;font-size:10px;font-weight:800}.v447-rank-detail-grid b{color:#334b62;font-size:13px;line-height:1.35}
    .v447-rank-detail-note{margin:0;color:#7b8ea2;font-size:10px;line-height:1.45}
    @media(max-width:820px){.v447-rank-detail-head h2{font-size:20px}.v447-rank-detail-grid b{font-size:14px}}
  `;
  document.head.appendChild(style);

  window.cnmiLeaveSequenceDetailV447={showLeaveRankDetail,submittedDateTime,selectedDashboardDate};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v447-leave-sequence-detail-popup.js", error); }
;

/* Original source: patch-v448-dashboard-position-clean-ui-leave-border.js */
try {
/* CNMI Staff Planner V448
 * Dashboard daytime-position cleanup.
 * - Hide the unused draft badge and Admin edit/jump button on the Dashboard card.
 * - Reconcile leave decoration so orange/yellow leave borders appear ONLY on the
 *   position whose assigned staff has an effective real leave on the selected date.
 * - Preserve the existing V434/V435 card layout, staff colors, info buttons,
 *   ready/leave summary, HR badge, and position-shortage text.
 * Display-only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V448_DASHBOARD_POSITION_CLEAN_UI_LEAVE_BORDER';
  if(window.__CNMI_V448_DASHBOARD_POSITION_CLEAN_UI_LEAVE_BORDER__)return;
  window.__CNMI_V448_DASHBOARD_POSITION_CLEAN_UI_LEAVE_BORDER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function isDashboard(){return String(S().page||'')==='dashboard';}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){return norm(S().dashboardDateV443);}
  }
  function text(v){return String(v==null?'':v).trim();}
  function key(v){return text(v).replace(/\s+/g,'').replace(/[–—]/g,'-').toLowerCase();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}

  function rowsFor(date){try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}}
  function zoneOf(row){try{return text(window.cnmiDashboardPositionsV434?.zoneOf?.(row))||text(row?.zone)||'อื่นๆ';}catch(_){return text(row?.zone)||'อื่นๆ';}}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function labelOf(row){
    const code=codeOf(row);
    try{if(typeof positionLabelForCell==='function')return text(positionLabelForCell(code))||code;}catch(_){ }
    try{if(typeof labelCode==='function')return text(labelCode(code))||code;}catch(_){ }
    return code;
  }
  function rowKey(row){return `${key(zoneOf(row))}|${key(labelOf(row)||codeOf(row))}`;}
  function itemLabel(item){
    const node=item?.querySelector?.('.v434-position-code');if(!node)return '';
    const clone=node.cloneNode(true);clone.querySelectorAll?.('.v435-info-mark').forEach(n=>n.remove());
    return text(clone.textContent);
  }
  function itemKey(item){
    const zone=text(item?.closest?.('.v434-zone-group')?.querySelector?.('.v434-zone-head b')?.textContent)||'อื่นๆ';
    return `${key(zone)}|${key(itemLabel(item))}`;
  }

  function inRange(row,date){const s=norm(row?.start_date),e=norm(row?.end_date||row?.start_date);return !!s&&s<=date&&e>=date;}
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!['cancelled','ยกเลิก'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;}}
  function realLeave(row){
    if(!row||!effective(row))return false;
    let t='';
    try{t=typeof leaveDisplayType==='function'?text(leaveDisplayType(row)):text(row?.type||row?.leave_type).split(':::')[0];}catch(_){t=text(row?.type||row?.leave_type).split(':::')[0];}
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveFor(staffId,date){
    if(!staffId)return null;
    return (S().leaves||[]).find(r=>String(r?.staff_id||'')===String(staffId)&&realLeave(r)&&inRange(r,date))||null;
  }
  function periodKind(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(/ครึ่งเช้า|morning/.test(raw))return 'morning';
    if(/ครึ่งบ่าย|afternoon/.test(raw))return 'afternoon';
    return 'full';
  }
  function periodLabel(row){const k=periodKind(row);return k==='morning'?'ลาครึ่งเช้า':k==='afternoon'?'ลาครึ่งบ่าย':'ลาทั้งวัน';}
  function shortageLabel(row){const k=periodKind(row);return k==='morning'?'⚠ ขาดช่วงเช้า':k==='afternoon'?'⚠ ขาดช่วงบ่าย':'⚠ ตำแหน่งขาด';}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function hrChecked(row){
    try{return typeof isLeaveHrChecked==='function'?!!isLeaveHrChecked(row?.id):(S().hrChecks||[]).some(h=>String(h?.leave_request_id||'')===String(row?.id||'')&&String(h?.status||'')==='ตรวจสอบแล้ว');}
    catch(_){return false;}
  }

  function clearLeaveState(item){
    item?.querySelectorAll?.('.v445-position-leave-meta').forEach(n=>n.remove());
    item?.classList?.remove('v445-has-leave','v445-half-leave','v445-full-leave');
    if(item){delete item.dataset.v448LeaveStaff;delete item.dataset.v448LeavePosition;}
  }
  function addLeaveState(item,leave,row){
    const kind=periodKind(leave);
    item.classList.add('v445-has-leave',kind==='full'?'v445-full-leave':'v445-half-leave');
    item.dataset.v448LeaveStaff=String(row?.staff_id||'');
    item.dataset.v448LeavePosition=String(codeOf(row)||labelOf(row));
    const meta=document.createElement('div');meta.className='v445-position-leave-meta';
    const hr=admin()?`<span class="v445-hr-pill ${hrChecked(leave)?'is-done':'is-pending'}">${hrChecked(leave)?'✓ ตรวจ HR แล้ว':'รอตรวจ HR'}</span>`:'';
    meta.innerHTML=`<div class="v445-position-status-line"><span class="v445-leave-pill">${esc(periodLabel(leave))}</span>${hr}</div><div class="v445-shortage-pill">${esc(shortageLabel(leave))}</div>`;
    item.appendChild(meta);
  }

  function cleanCard(root,date){
    const card=root?.querySelector?.('[data-v434-daytime-positions]');if(!card)return;

    // These controls are intentionally not used in the operational Dashboard.
    card.querySelectorAll('.v434-draft-badge,.v434-jump-btn').forEach(n=>n.remove());

    const items=[...card.querySelectorAll('.v434-position-item')];
    items.forEach(clearLeaveState);

    const rows=rowsFor(date);if(!rows.length)return;
    const rowMap=new Map();
    rows.forEach(row=>{const k=rowKey(row);if(k&&!rowMap.has(k))rowMap.set(k,row);});

    let assigned=0,leaveCount=0;
    const byZone=new Map();
    items.forEach(item=>{
      const row=rowMap.get(itemKey(item));if(!row)return;
      const sid=row?.staff_id||'';const zone=zoneOf(row)||'อื่นๆ';
      if(!byZone.has(zone))byZone.set(zone,{total:0,assigned:0,leave:0});
      const z=byZone.get(zone);z.total++;
      if(sid){assigned++;z.assigned++;}
      const leave=sid?leaveFor(sid,date):null;
      if(!leave)return;
      leaveCount++;z.leave++;addLeaveState(item,leave,row);
    });

    const summaries=card.querySelector('.v434-summary-badges');
    if(summaries){
      summaries.querySelectorAll('.v434-draft-badge,.v445-ready-badge,.v445-leave-count-badge').forEach(n=>n.remove());
      const complete=summaries.querySelector('.v434-complete-badge');
      if(complete&&/^ครบ\s/.test(text(complete.textContent)))complete.textContent=text(complete.textContent).replace(/^ครบ\s*/,'จัดครบ ');
      const ready=Math.max(0,assigned-leaveCount);
      summaries.insertAdjacentHTML('beforeend',`<span class="v445-ready-badge">พร้อมปฏิบัติงาน ${ready}/${rows.length}</span>${leaveCount?`<span class="v445-leave-count-badge">ลา ${leaveCount}</span>`:''}`);
    }

    [...card.querySelectorAll('.v434-zone-group')].forEach(group=>{
      const zone=text(group.querySelector('.v434-zone-head b')?.textContent);const stat=byZone.get(zone);if(!stat)return;
      const span=group.querySelector('.v434-zone-head span');if(!span)return;
      const ready=Math.max(0,stat.assigned-stat.leave);
      span.classList.add('v445-zone-count');span.innerHTML=`<b>พร้อม ${ready}/${stat.total}</b><small>จัด ${stat.assigned}/${stat.total}</small>`;
    });
    card.dataset.v448Clean='true';
  }

  function decorateHtml(html){
    if(!isDashboard())return html;const date=selectedDate();if(!date)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');cleanCard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn('[V448] dashboard cleanup skipped',err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v448Wrapped){
    const wrapped=function renderDashboardV448(){return decorateHtml(previousDashboard.apply(this,arguments));};
    wrapped.__v448Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function cleanCurrent(){if(!isDashboard())return;const date=selectedDate();if(date)cleanCard(document,date);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanCurrent,{once:true});else queueMicrotask(cleanCurrent);
  window.addEventListener('pageshow',cleanCurrent);

  const style=document.createElement('style');style.id='cnmi-v448-dashboard-position-clean-ui-leave-border';style.textContent=`
    [data-v434-daytime-positions] .v434-draft-badge,
    [data-v434-daytime-positions] .v434-jump-btn{display:none!important}
    /* Safety default: ordinary assigned positions stay on the original neutral card. */
    [data-v434-daytime-positions] .v434-position-item:not(.v445-has-leave){background:#fff!important;border-color:#e6edf4!important;box-shadow:none!important}
    [data-v434-daytime-positions] .v434-position-item.is-vacant:not(.v445-has-leave){background:#fffaf4!important;border-color:#ffd9aa!important}
  `;document.head.appendChild(style);

  window.cnmiDashboardPositionCleanV448={version:VERSION,cleanCard,leaveFor,rowKey,itemKey};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v448-dashboard-position-clean-ui-leave-border.js", error); }
;

/* Original source: patch-v449-dashboard-late-leave-border-only.js */
try {
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

} catch (error) { console.error("[v569] patch-v449-dashboard-late-leave-border-only.js", error); }
;

/* Original source: patch-v450-daily-position-baseline-only.js */
try {
/* CNMI Staff Planner V450
 * Daily daytime-position page: baseline-only / no daily rearrangement.
 * - Keep the Admin baseline assignment as the visible source of truth.
 * - Hide and disable the "ปรับวันนี้" controls for every role, including Admin.
 * - Hide the daily Save + Publish action and draft/published status badges.
 * - Keep date selection, in-charge selection/save, leave indicators, conditions,
 *   and job descriptions unchanged.
 * UI/interaction-only. No SQL/schema changes and no automatic data deletion.
 */
(function(){
  'use strict';
  const VERSION='V450_DAILY_POSITION_BASELINE_ONLY';
  if(window.__CNMI_V450_DAILY_POSITION_BASELINE_ONLY__)return;
  window.__CNMI_V450_DAILY_POSITION_BASELINE_ONLY__=true;

  let queued=false;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function isDaily(){return String(S()?.page||'')==='positions';}

  function lockPage(root=document){
    if(!isDaily())return;
    const area=root.querySelector?.('#pageContent .v225-positions-page,#pageContent .v226-positions-page,.v225-positions-page,.v226-positions-page');
    if(!area)return;

    area.dataset.v450BaselineOnly='1';

    // The controls stay in the DOM so older observers do not recreate them,
    // but they are disabled and permanently hidden by the V450 stylesheet.
    area.querySelectorAll('select[data-position-row]').forEach(select=>{
      select.disabled=true;
      select.tabIndex=-1;
      select.setAttribute('aria-hidden','true');
    });
    area.querySelectorAll('[data-save-positions],[data-publish-positions],[data-v337-save-publish]').forEach(button=>{
      button.disabled=true;
      button.tabIndex=-1;
      button.setAttribute('aria-hidden','true');
    });

    // Remove compare/change helper blocks because there is no daily-edit workflow anymore.
    area.querySelectorAll('.v322-daily-change-summary,.v322-change-status,.v225-position-note,.v225-daily-compare-panel').forEach(node=>{
      node.hidden=true;
      node.setAttribute('aria-hidden','true');
    });

    // Status "ร่าง/ประกาศแล้ว" no longer has operational meaning on this page.
    const toolbar=area.querySelector('.v225-position-toolbar,.toolbar');
    toolbar?.querySelectorAll('.badge.orange,.badge.green,.v434-draft-badge,.v434-publish-badge').forEach(badge=>{
      const value=String(badge.textContent||'').trim();
      if(/ร่าง|ประกาศแล้ว/.test(value)){
        badge.hidden=true;
        badge.setAttribute('aria-hidden','true');
      }
    });

    // Keep the visible baseline wording stable even if an older patch tries to rename it.
    const headers=area.querySelectorAll('.v225-daily-position-table thead th');
    if(headers?.[3])headers[3].textContent='ตั้งต้นจาก Admin';
    area.querySelectorAll('.v322-baseline-label').forEach(node=>{node.textContent='ตั้งต้นจาก Admin';});
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      lockPage(document);
    });
  }

  function install(){
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v450BaselineOnlyObserver){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v450BaselineOnlyObserver=observer;
    }
    queue();
  }

  document.addEventListener('change',event=>{
    if(event.target?.closest?.('#positionDateInput,#inchargeSelect'))[0,60,180].forEach(ms=>setTimeout(queue,ms));
  },true);

  window.addEventListener('pageshow',queue);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  const style=document.createElement('style');
  style.id='cnmi-v450-daily-position-baseline-only-style';
  style.textContent=`
    /* Daily page: baseline is authoritative; daily-adjust column is intentionally unavailable. */
    .v225-positions-page[data-v450-baseline-only="1"] [data-save-positions],
    .v225-positions-page[data-v450-baseline-only="1"] [data-publish-positions],
    .v225-positions-page[data-v450-baseline-only="1"] [data-v337-save-publish],
    .v226-positions-page[data-v450-baseline-only="1"] [data-save-positions],
    .v226-positions-page[data-v450-baseline-only="1"] [data-publish-positions],
    .v226-positions-page[data-v450-baseline-only="1"] [data-v337-save-publish]{display:none!important}

    .v225-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table th:nth-child(5),
    .v225-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table td:nth-child(5),
    .v226-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table th:nth-child(5),
    .v226-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table td:nth-child(5){display:none!important}

    .v225-positions-page[data-v450-baseline-only="1"] .v225-mobile-position-list label:has(select[data-position-row]),
    .v226-positions-page[data-v450-baseline-only="1"] .v225-mobile-position-list label:has(select[data-position-row]),
    .v225-positions-page[data-v450-baseline-only="1"] .v322-change-status,
    .v226-positions-page[data-v450-baseline-only="1"] .v322-change-status,
    .v225-positions-page[data-v450-baseline-only="1"] .v322-daily-change-summary,
    .v226-positions-page[data-v450-baseline-only="1"] .v322-daily-change-summary,
    .v225-positions-page[data-v450-baseline-only="1"] .v225-position-note,
    .v226-positions-page[data-v450-baseline-only="1"] .v225-position-note,
    .v225-positions-page[data-v450-baseline-only="1"] .v225-daily-compare-panel,
    .v226-positions-page[data-v450-baseline-only="1"] .v225-daily-compare-panel{display:none!important}

    .v225-positions-page[data-v450-baseline-only="1"] select[data-position-row],
    .v226-positions-page[data-v450-baseline-only="1"] select[data-position-row]{pointer-events:none!important}
  `;
  document.head.appendChild(style);

  window.cnmiV450={version:VERSION,lockPage,queue};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v450-daily-position-baseline-only.js", error); }
;

/* Original source: patch-v451-calendar-activity-linebreak-no-duty-submitdate.js */
try {
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

} catch (error) { console.error("[v569] patch-v451-calendar-activity-linebreak-no-duty-submitdate.js", error); }
;

/* Original source: patch-v452-physician-consult-schedule.js */
try {
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
  function physician(){
    const p=S()?.profile||(S()?.staff||[]).find(x=>String(x.id)===String(currentStaff()))||null;
    if(!p)return false;
    try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(_){ }
    return [p.staff_type,p.position,p.role].some(v=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(v||'').trim()));
  }
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
    return window.cnmiPersonTypeV516?.isPhysician?.(p) ?? /^(แพทย์|physician|doctor)$/i.test(String(p.staff_type||p.role||'').trim());
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
    if(!admin()&&!physician())return '<div class="card"><div class="empty-state">หน้านี้สำหรับ Admin และแพทย์เท่านั้น</div></div>';
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
    if(!admin()&&!physician())return toastSafe('เฉพาะ Admin และแพทย์เท่านั้น');
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
    if((!admin()&&!physician())||!id)return;
    if(!(await confirmDialog('ลบรายการตารางแพทย์นี้ใช่ไหม?','ยืนยันลบตารางแพทย์')))return;
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

  // Doctors can manage all Consult schedule sections in their Staff menu.
  const previousRenderNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);
  if(typeof previousRenderNav==='function'){
    const wrappedNav=function(){
      try{const item=NAV_ITEMS.find(x=>x.id==='physicianConsult');if(item)item.group=physician()&&!admin()?'staff':'admin';}catch(_){ }
      return previousRenderNav.apply(this,arguments);
    };
    try{window.renderNav=renderNav=wrappedNav;}catch(_){window.renderNav=wrappedNav;}
  }

  // Consult schedule page renderer for admins and physicians.
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

} catch (error) { console.error("[v569] patch-v452-physician-consult-schedule.js", error); }
;

/* Original source: patch-v453-hr-status-and-late-leave-record-binding.js */
try {
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

} catch (error) { console.error("[v569] patch-v453-hr-status-and-late-leave-record-binding.js", error); }
;

/* Original source: patch-v454-hr-status-visible-to-all.js */
try {
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

} catch (error) { console.error("[v569] patch-v454-hr-status-visible-to-all.js", error); }
;
