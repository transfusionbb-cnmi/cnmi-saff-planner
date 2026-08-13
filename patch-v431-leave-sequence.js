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
