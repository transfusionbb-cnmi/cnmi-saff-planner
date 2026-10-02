/* CNMI Staff Planner V584/V587 — Approved OT canonical source
 * V587 correction:
 * - Never synthesize extra OT rows from trade requests.
 * - The real approved ot_requests row is the single canonical row shown to Staff/Admin.
 * - Admin staff-detail is the same staff perspective, only with a selectable staff id.
 * - Effective duty correction may be applied in memory for display/calculation only.
 * No database/schema/write change.
 */
(function(){
  'use strict';
  const VERSION='V587_APPROVED_OT_CANONICAL_SOURCE';
  if(window.__CNMI_V584_APPROVED_TRACKING_SOURCE_OF_TRUTH__) return;
  window.__CNMI_V584_APPROVED_TRACKING_SOURCE_OF_TRUTH__=true;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function monthFromRoute(){
    try{
      const h=String(location.hash||'');
      const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null;
      const m=String(q?.get('month')||'').slice(0,7);
      if(/^\d{4}-\d{2}$/.test(m)) return m;
    }catch(_){ }
    const st=S();
    for(const v of [st.otMenuMonthV369,st.otMoneyMonthV241,st.otSourceMonthV241,st.myDutyMonthFilter,st.monthKey]){
      const m=String(v||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(m)) return m;
    }
    return new Date().toISOString().slice(0,7);
  }
  function isSynthetic(row){
    return !!row?._v584Synthetic || /^v584-trade-/i.test(String(row?.id||'')) || /\[V584_TRACKING_SOURCE=approved\]/i.test(String(row?.note||''));
  }
  function stripSyntheticState(){
    const st=S();
    if(!Array.isArray(st.otRequests)) return 0;
    const before=st.otRequests.length;
    st.otRequests=st.otRequests.filter(r=>!isSynthetic(r));
    return before-st.otRequests.length;
  }
  function corrected(row){
    if(!row) return row;
    try{
      const fn=window.cnmiV221DutyOt?.correctedOtRow;
      if(typeof fn==='function') return fn(row)||row;
    }catch(_){ }
    return row;
  }
  function patchApprovedDetails(){
    const api=window.cnmiV347;
    if(!api||typeof api.approvedDetails!=='function') return false;
    if(api.approvedDetails.__v587Canonical) return true;
    let prev=api.approvedDetails;
    // If an older V584 wrapper is somehow present in a long-lived tab, unwrap it first.
    while(prev?.__v584Previous) prev=prev.__v584Previous;
    const wrapped=function(staffId,month){
      stripSyntheticState();
      const rows=prev.call(this,staffId,month)||[];
      return rows.filter(r=>!isSynthetic(r)).map(corrected);
    };
    wrapped.__v587Canonical=true;
    wrapped.__v587Previous=prev;
    api.approvedDetails=wrapped;
    return true;
  }
  async function preloadAndSync(){
    stripSyntheticState();
    patchApprovedDetails();
    try{ await window.cnmiV577?.preloadOtReferenceData?.(monthFromRoute(),{force:false}); }catch(err){ console.warn(`[${VERSION}] reference preload`,err); }
    stripSyntheticState();
    patchApprovedDetails();
    return {changed:false,count:0};
  }
  function sync(){
    const removed=stripSyntheticState();
    patchApprovedDetails();
    return {changed:removed>0,count:0,removed};
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim())) return;
      x.textContent='v587'; x.title='Staff/Admin OT parity + canonical real rows';
    });
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(patchApprovedDetails()||tries>100){ clearInterval(timer); preloadAndSync(); setTimeout(markVersion,250); }
  },80);
  window.addEventListener('hashchange',()=>{ stripSyntheticState(); setTimeout(preloadAndSync,60); setTimeout(markVersion,220); });
  window.addEventListener('pageshow',()=>{ stripSyntheticState(); setTimeout(preloadAndSync,100); setTimeout(markVersion,250); });

  window.cnmiV584={version:VERSION,sync,synthRows:()=>[],patchApprovedDetails,preloadAndSync,stripSyntheticState};
  console.info(`[${VERSION}] loaded`);
})();
