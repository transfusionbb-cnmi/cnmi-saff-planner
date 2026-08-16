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
