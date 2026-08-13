/* CNMI Staff Planner V441
 * Fix HR badge false-pending on Dashboard / My Leave.
 * Root cause: V439/V440 read state.hrChecks, while route-aware loader intentionally
 * loads hr_checks only in Admin mode / HR-related pages. Staff mode therefore saw an
 * empty array and was incorrectly labelled "รอตรวจ HR" even when Admin had checked it.
 *
 * V441 sources status in this order:
 * 1) state.hrChecks (full Admin data already loaded)
 * 2) direct status-only hr_checks query for an actual Admin, even while viewing Staff mode
 * 3) safe authenticated RPC get_hr_status_public_v441 for normal Staff
 *
 * No leave/position/roster formulas are changed.
 */
(function(){
  'use strict';
  const VERSION='V441_HR_STATUS_DASHBOARD_SYNC';
  if(window.__CNMI_V441_HR_STATUS_DASHBOARD_SYNC__) return;
  window.__CNMI_V441_HR_STATUS_DASHBOARD_SYNC__=true;

  const CACHE_TTL=15000;
  const cache=new Map(); // leaveId -> {status, at}
  let pendingPromise=null;
  let lastIdsKey='';

  function S(){ try{return window.state||state||{};}catch(_){return window.state||{};} }
  function client(){ try{return window.sb||sb||null;}catch(_){return window.sb||null;} }
  function isActualAdminSafe(){
    try{
      if(typeof window.isActualAdminV167==='function') return !!window.isActualAdminV167();
      if(typeof window.isActualAdmin==='function') return !!window.isActualAdmin();
      return String(S().profile?.role||'')==='admin';
    }catch(_){return String(S().profile?.role||'')==='admin';}
  }
  function norm(v){return String(v||'').slice(0,10);}
  function today(){
    try{return todayStr();}
    catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function uniqueIds(rows){return [...new Set((rows||[]).map(r=>String(r?.id||r?.leave_request_id||'')).filter(Boolean))];}
  function fresh(id){const x=cache.get(String(id));return !!x&&(Date.now()-x.at)<CACHE_TTL;}
  function localFullStatus(id){
    const row=(S().hrChecks||[]).find(h=>String(h?.leave_request_id||'')===String(id||''));
    return row?String(row.status||''):'';
  }
  function publicStatus(id){
    const x=cache.get(String(id||''));
    return x?String(x.status||''):'';
  }
  function statusOf(id){return localFullStatus(id)||publicStatus(id);}
  function metaFromStatus(status,loaded){
    if(status==='ตรวจสอบแล้ว') return {checked:true,label:'✓ ตรวจ HR แล้ว',key:'done'};
    if(status==='รอเอกสาร') return {checked:false,label:'รอเอกสาร HR',key:'waiting'};
    if(status==='ยกเลิก') return {checked:false,label:'ยกเลิกการตรวจ HR',key:'cancelled'};
    if(status==='รอตรวจสอบ'||loaded) return {checked:false,label:'รอตรวจ HR',key:'pending'};
    return {checked:false,label:'กำลังตรวจ HR…',key:'loading'};
  }
  function hrMeta(row){
    const id=String(row?.id||'');
    const status=statusOf(id);
    return metaFromStatus(status,fresh(id)||!!localFullStatus(id));
  }

  async function fetchDirect(ids){
    const db=client(); if(!db||!ids.length) return null;
    const res=await db.from('hr_checks').select('leave_request_id,status').in('leave_request_id',ids);
    if(res?.error) throw res.error;
    return res?.data||[];
  }
  async function fetchRpc(ids){
    const db=client(); if(!db||!ids.length) return null;
    const res=await db.rpc('get_hr_status_public_v441',{p_leave_ids:ids});
    if(res?.error) throw res.error;
    return res?.data||[];
  }
  function applyRows(ids,rows){
    const now=Date.now();
    const byId=new Map((rows||[]).map(r=>[String(r.leave_request_id||''),String(r.status||'')]));
    // Cache a missing result as pending too; otherwise every render would refetch forever.
    ids.forEach(id=>cache.set(String(id),{status:byId.get(String(id))||'รอตรวจสอบ',at:now}));
  }
  async function ensureStatuses(rowsOrIds,{force=false,rerender=true}={}){
    const ids=uniqueIds((rowsOrIds||[]).map(x=>typeof x==='string'?{id:x}:x));
    const wanted=force?ids:ids.filter(id=>!fresh(id)&&!localFullStatus(id));
    if(!wanted.length) return true;
    const key=[...wanted].sort().join(',');
    if(pendingPromise&&key===lastIdsKey) return pendingPromise;
    lastIdsKey=key;
    pendingPromise=(async()=>{
      let rows=null;
      try{
        if(isActualAdminSafe()) rows=await fetchDirect(wanted);
        else rows=await fetchRpc(wanted);
      }catch(primaryError){
        // Some installations already permit status-only SELECT to authenticated staff.
        // Try it as a compatibility fallback before declaring status unavailable.
        try{rows=await fetchDirect(wanted);}catch(fallbackError){
          console.warn(`[${VERSION}] HR status load skipped`,primaryError,fallbackError);
          return false;
        }
      }
      applyRows(wanted,rows||[]);
      if(rerender){
        setTimeout(()=>{try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){ }},0);
      }
      return true;
    })();
    try{return await pendingPromise;}finally{pendingPromise=null;lastIdsKey='';}
  }

  function todayAffectedLeaves(){
    try{
      const date=today();
      const api=window.cnmiDashboardPositionsV434;
      const leaveApi=window.cnmiLeavePositionV439;
      if(!api?.rowsFor||!leaveApi?.leaveFor) return [];
      return uniqueLeaves((api.rowsFor(date)||[]).map(r=>r?.staff_id?leaveApi.leaveFor(r.staff_id,date):null).filter(Boolean));
    }catch(_){return [];}
  }
  function uniqueLeaves(rows){
    const m=new Map();(rows||[]).forEach(r=>{if(r?.id)m.set(String(r.id),r);});return [...m.values()];
  }

  // Override the API used by V440 rebuildDashboard. This makes the existing dashboard
  // decoration use the synced source without rewriting the position layout again.
  if(window.cnmiLeavePositionV439){
    window.cnmiLeavePositionV439.hrMeta=hrMeta;
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV441(){
      const leaves=todayAffectedLeaves();
      if(leaves.length) ensureStatuses(leaves,{force:false,rerender:true});
      return oldDashboard.apply(this,arguments);
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function monthNow(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function myLeaveRows(){
    try{return window.cnmiLeavePositionV439?.myLeaveRows?.(S().myLeaveMonth||monthNow())||[];}catch(_){return [];}
  }
  function patchMyLeaveDom(){
    if(S().page!=='myLeave')return;
    const rows=myLeaveRows();
    if(rows.length) ensureStatuses(rows,{force:false,rerender:true});
    const cards=[...document.querySelectorAll('.v439-my-leave-card')];
    let checked=0,pending=0,loading=0;
    rows.forEach((row,i)=>{
      const m=hrMeta(row);if(m.checked)checked++;else if(m.key==='loading')loading++;else pending++;
      const el=cards[i]?.querySelector('.v439-hr-status');if(!el)return;
      el.textContent=m.label;
      el.classList.toggle('is-checked',m.checked);
      el.classList.toggle('is-pending',!m.checked&&m.key!=='loading');
      el.classList.toggle('v441-loading',m.key==='loading');
    });
    const sum=document.querySelector('.v439-my-leave-summary');
    if(sum){
      sum.innerHTML=`<span>รายการลา <b>${rows.length}</b></span><span class="ok">✓ ตรวจ HR แล้ว <b>${checked}</b></span>${pending?`<span class="pending">รอตรวจ HR <b>${pending}</b></span>`:''}${loading?`<span class="v441-summary-loading">กำลังตรวจสถานะ <b>${loading}</b></span>`:''}`;
    }
  }
  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV441(){const out=oldRenderPage.apply(this,arguments);setTimeout(patchMyLeaveDom,0);return out;};
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  function invalidate(ids){
    if(!ids){cache.clear();return;}
    (Array.isArray(ids)?ids:[ids]).forEach(id=>cache.delete(String(id)));
  }
  // After Admin changes HR status, do not keep V316's 25-second route cache or V441 status cache.
  const oldSave=window.saveHrCheck||(typeof saveHrCheck==='function'?saveHrCheck:null);
  if(typeof oldSave==='function'){
    const wrappedSave=async function saveHrCheckV441(form){
      const leaveId=form?.dataset?.leaveId||'';
      const out=await oldSave.apply(this,arguments);
      invalidate(leaveId);try{window.cnmiV316?.clearCache?.();await (window.loadAllData||loadAllData)?.({force:true});(window.renderPage||renderPage)?.();}catch(_){ }
      return out;
    };
    try{window.saveHrCheck=saveHrCheck=wrappedSave;}catch(_){window.saveHrCheck=wrappedSave;}
  }
  const oldRevert=window.revertHrCheck||(typeof revertHrCheck==='function'?revertHrCheck:null);
  if(typeof oldRevert==='function'){
    const wrappedRevert=async function revertHrCheckV441(id){
      const out=await oldRevert.apply(this,arguments);
      invalidate();try{window.cnmiV316?.clearCache?.();await (window.loadAllData||loadAllData)?.({force:true});(window.renderPage||renderPage)?.();}catch(_){ }
      return out;
    };
    try{window.revertHrCheck=revertHrCheck=wrappedRevert;}catch(_){window.revertHrCheck=wrappedRevert;}
  }

  const style=document.createElement('style');style.id='cnmi-v441-hr-status-sync';style.textContent=`
    .v439-hr-status.v441-loading,.v439-hr-pill.v441-loading{background:#eef4fb!important;color:#53708c!important}
    .v441-summary-loading{background:#eef4fb!important;color:#53708c!important}
  `;document.head.appendChild(style);

  // Prime current screen once after all patches are loaded.
  setTimeout(()=>{
    try{
      const leaves=todayAffectedLeaves();if(leaves.length)ensureStatuses(leaves,{rerender:true});
      patchMyLeaveDom();
    }catch(_){ }
  },0);

  window.cnmiV441={hrMeta,ensureStatuses,invalidate,cache,todayAffectedLeaves};
  console.info(`${VERSION} loaded`);
})();
