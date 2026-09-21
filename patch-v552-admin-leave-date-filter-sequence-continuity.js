/* CNMI Staff Planner V552 — Admin leave date filter + continuous leave sequence
   Scope:
   1) Admin leave history: add one-day overlap filter (วันที่ลา)
   2) Leave sequence: rank only active roster staff so visible roster ranks never skip
   UI/read-only calculation patch. No Auth/PWA/SW/Supabase schema/write changes.
*/
(function(){
  'use strict';
  const VERSION='V552_ADMIN_LEAVE_DATE_FILTER_SEQUENCE_CONTINUITY';
  if(window.__CNMI_V552_ADMIN_LEAVE_DATE_FILTER_SEQUENCE_CONTINUITY__) return;
  window.__CNMI_V552_ADMIN_LEAVE_DATE_FILTER_SEQUENCE_CONTINUITY__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function normDate(v){
    try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function overlaps(row,date){
    const d=normDate(date),a=normDate(row?.start_date),b=normDate(row?.end_date||row?.start_date);
    return !!d&&!!a&&!!b&&a<=d&&b>=d;
  }
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    catch(_){return String(v??'');}
  }

  /* ---------- 1. Admin date filter ---------- */
  const previousLeaveTable=window.renderLeaveTable||(typeof renderLeaveTable==='function'?renderLeaveTable:null);
  if(typeof previousLeaveTable==='function'){
    const wrappedTable=function renderLeaveTableV552(rows){
      let adjusted=Array.isArray(rows)?rows:[];
      const date=normDate(S()?.leaveFilterDateV552);
      if(isAdminSafe()&&date) adjusted=adjusted.filter(row=>overlaps(row,date));
      return previousLeaveTable.call(this,adjusted);
    };
    try{window.renderLeaveTable=renderLeaveTable=wrappedTable;}catch(_){window.renderLeaveTable=wrappedTable;}
  }

  function dateFilterHtml(){
    const value=normDate(S()?.leaveFilterDateV552);
    return `<label class="v552-leave-date-filter">วันที่ลา
      <span class="v552-date-input-row">
        <input type="date" id="leaveFilterDateV552" value="${esc(value)}" aria-label="กรองตามวันที่ลา">
        ${value?'<button type="button" class="tiny-btn v552-clear-date" data-v552-clear-leave-date title="ล้างตัวกรองวันที่">ล้าง</button>':''}
      </span>
    </label>`;
  }

  function injectDateFilter(html){
    let out=String(html||'');
    if(!isAdminSafe()||!out.includes('leave-filter-bar')) return out;
    if(!out.includes('id="leaveFilterDateV552"')){
      out=out.replace(
        /(<div class="leave-filter-bar compact-filter">)([\s\S]*?)(<\/div>)/i,
        (m,open,body,close)=>`${open}${body}${dateFilterHtml()}${close}`
      );
    }
    const date=normDate(S()?.leaveFilterDateV552);
    if(date&&!out.includes('data-v552-date-filter-note')){
      let thai=date;
      try{thai=typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){}
      const note=`<div class="v552-date-filter-note" data-v552-date-filter-note>กำลังแสดงรายการที่มีวันลาคร่อม <b>${esc(thai)}</b></div>`;
      out=out.replace(/(<div class="leave-filter-bar compact-filter">[\s\S]*?<\/div>)/i,`$1${note}`);
    }
    return out;
  }

  const previousLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof previousLeavePage==='function'){
    const wrappedPage=function renderLeavePageV552(){return injectDateFilter(previousLeavePage.apply(this,arguments));};
    try{window.renderLeavePage=renderLeavePage=wrappedPage;}catch(_){window.renderLeavePage=wrappedPage;}
  }

  document.addEventListener('change',function(e){
    const t=e.target;
    if(!t||t.id!=='leaveFilterDateV552') return;
    const s=S();s.leaveFilterDateV552=normDate(t.value);
    try{if(typeof renderPage==='function')renderPage();}catch(err){console.warn(`[${VERSION}] date filter render failed`,err);}
  },true);
  document.addEventListener('click',function(e){
    const btn=e.target?.closest?.('[data-v552-clear-leave-date]');
    if(!btn)return;
    e.preventDefault();
    const s=S();s.leaveFilterDateV552='';
    try{if(typeof renderPage==='function')renderPage();}catch(err){console.warn(`[${VERSION}] clear date render failed`,err);}
  },true);

  /* ---------- 2. Continuous leave sequence for operational roster ---------- */
  function effective(row){
    try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/cancel|delete|inactive|ยกเลิก/i.test(String(row?.status||''));}
    catch(_){return true;}
  }
  function actualLeave(row){
    if(!row||!effective(row))return false;
    let type='';
    try{type=typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    return !!type&&type!=='ไม่รับเวร';
  }
  function rosterEligibleStaff(staffId){
    const list=Array.isArray(S()?.staff)?S().staff:[];
    const st=list.find(x=>String(x?.id||'')===String(staffId||''));
    if(!st)return false;
    try{return typeof isRosterEnabled==='function'?!!isRosterEnabled(st):st?.is_active!==false&&String(st?.staff_type||'')!=='แพทย์';}
    catch(_){return st?.is_active!==false&&String(st?.staff_type||'')!=='แพทย์';}
  }
  function submittedMs(row){
    try{
      const old=window.cnmiLeaveSequenceV431?.leaveSubmittedMs;
      if(typeof old==='function'){
        const n=Number(old(row));if(Number.isFinite(n))return n;
      }
    }catch(_){}
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt,row?.updated_at]){
      const n=Date.parse(String(v||''));if(Number.isFinite(n))return n;
    }
    return Number.POSITIVE_INFINITY;
  }
  function staffOrder(id){
    const list=Array.isArray(S()?.staff)?S().staff:[];
    const i=list.findIndex(x=>String(x?.id||'')===String(id||''));return i<0?99999:i;
  }
  function sequenceForDate(date){
    const d=normDate(date);if(!d)return [];
    const perStaff=new Map();
    (Array.isArray(S()?.leaves)?S().leaves:[]).forEach(row=>{
      if(!actualLeave(row)||!overlaps(row,d)||!rosterEligibleStaff(row?.staff_id))return;
      const sid=String(row?.staff_id||'');if(!sid)return;
      const prev=perStaff.get(sid);
      if(!prev||submittedMs(row)<submittedMs(prev))perStaff.set(sid,row);
    });
    const rows=[...perStaff.values()].sort((a,b)=>{
      const ta=submittedMs(a),tb=submittedMs(b);if(ta!==tb)return ta-tb;
      const oa=staffOrder(a?.staff_id),ob=staffOrder(b?.staff_id);if(oa!==ob)return oa-ob;
      return String(a?.id||'').localeCompare(String(b?.id||''),'th');
    });
    return rows.map((row,i)=>({row,rank:i+1,staff_id:String(row?.staff_id||''),submitted_ms:submittedMs(row)}));
  }
  function rankFor(row,date){
    if(!actualLeave(row)||!rosterEligibleStaff(row?.staff_id))return null;
    const sid=String(row?.staff_id||'');
    return sequenceForDate(date).find(x=>x.staff_id===sid)?.rank||null;
  }

  if(window.cnmiLeaveSequenceV431){
    window.cnmiLeaveSequenceV431.leaveSequenceForDate=sequenceForDate;
    window.cnmiLeaveSequenceV431.rankFor=rankFor;
  }

  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      chip.textContent='v552';
      chip.title='Admin leave date filter + continuous leave sequence (V552)';
    });
  }
  let queued=false;
  function queueVersion(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;setVersion(document);});}
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'){
    const wrappedRenderPage=function renderPageV552(){const r=previousRenderPage.apply(this,arguments);queueVersion();return r;};
    try{window.renderPage=renderPage=wrappedRenderPage;}catch(_){window.renderPage=wrappedRenderPage;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v552-admin-leave-date-sequence';
  style.textContent=`
    .v552-date-input-row{display:flex;align-items:center;gap:6px;min-width:0}
    .v552-date-input-row input{min-width:0;flex:1}
    .v552-clear-date{flex:0 0 auto;white-space:nowrap}
    .v552-date-filter-note{margin:-2px 0 10px;padding:7px 10px;border:1px solid #cfe6f8;background:#f3f9fe;border-radius:10px;color:#55758f;font-size:.82rem;font-weight:650}
    @media(max-width:820px){
      .leave-filter-bar.compact-filter .v552-leave-date-filter{grid-column:1/-1}
      .v552-date-filter-note{font-size:.78rem;margin-top:-1px}
    }
  `;
  document.head.appendChild(style);

  setVersion(document);
  console.info(`[${VERSION}] loaded`);
})();
