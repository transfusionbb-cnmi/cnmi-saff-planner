/* CNMI Staff Planner V577 — OT Attendance Source + Export Consistency Fix
 * Goal:
 * 1) Treat staff-confirmed attendance OT rows as the primary actual-work source.
 * 2) Ensure roster assignments + completed trade requests are loaded before HR normalization/export.
 * 3) Make OT detail / monthly summary / Export HR use the same trade-aware normalization source.
 * 4) Prevent an Export click from racing before trade data has arrived.
 * No database schema change required.
 */
(function(){
  'use strict';
  const VERSION='V603_OT_EXPORT_LIVE_BUTTON_REPLAY_FIX';
  if(window.__CNMI_V577_OT_ATTENDANCE_SOURCE_EXPORT_FIX__) return;
  window.__CNMI_V577_OT_ATTENDANCE_SOURCE_EXPORT_FIX__=true;

  let loading=null;
  let loadedMonth='';
  let replayingExport=false;
  let warmTimer=null;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function toastSafe(msg,tone='info'){
    try{ if(typeof showToast==='function') return showToast(msg,{tone}); }catch(_){ }
    try{ if(typeof toast==='function') return toast(msg,tone); }catch(_){ }
    try{ console[tone==='error'?'error':'info'](msg); }catch(_){ }
  }
  function normMonth(raw){ const s=String(raw||'').slice(0,7); return /^\d{4}-\d{2}$/.test(s)?s:''; }
  function routeMonth(){
    const h=String(location.hash||'');
    try{ const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null; const m=normMonth(q?.get('month')); if(m)return m; }catch(_){ }
    const st=S();
    return normMonth(st.otSourceMonthV241)||normMonth(st.otMoneyMonthV241)||normMonth(st.otMenuMonthV369)||normMonth(st.monthKey)||new Date().toISOString().slice(0,7);
  }
  function monthEnd(m){ const [y,mo]=m.split('-').map(Number); return `${m}-${String(new Date(y,mo,0).getDate()).padStart(2,'0')}`; }
  function keyOf(x,fallback){ return String(x?.id||fallback?.(x)||''); }
  function mergeRows(current,incoming,fallback){
    const map=new Map();
    for(const x of (current||[])){ if(!x)continue; const k=keyOf(x,fallback); if(k)map.set(k,x); }
    for(const x of (incoming||[])){ if(!x)continue; const k=keyOf(x,fallback); if(k)map.set(k,x); }
    return [...map.values()];
  }
  async function selectCompletedTrades(db,assignmentIds){
    if(!assignmentIds.length) return [];
    const rows=[];
    for(let i=0;i<assignmentIds.length;i+=75){
      const ids=assignmentIds.slice(i,i+75);
      const r=await db.from('roster_trade_requests').select('*').in('from_assignment_id',ids).eq('status','completed');
      if(r?.error) throw r.error;
      rows.push(...(r?.data||[]));
    }
    return rows;
  }
  async function preloadOtReferenceData(month,{force=false}={}){
    month=normMonth(month)||routeMonth();
    if(!force && loadedMonth===month && Array.isArray(S().rosterAssignments) && Array.isArray(S().tradeRequests)) return {month,cached:true};
    if(loading) return loading;
    loading=(async()=>{
      const db=DB(); if(!db?.from) throw new Error('ไม่พบการเชื่อมต่อฐานข้อมูล');
      const start=`${month}-01`, end=monthEnd(month);
      const roster=await db.from('roster_assignments').select('*').gte('duty_date',start).lte('duty_date',end).order('duty_date');
      if(roster?.error) throw roster.error;
      const assignments=roster?.data||[];
      const trades=await selectCompletedTrades(db,assignments.map(x=>x.id).filter(Boolean));
      const st=S();
      st.rosterAssignments=mergeRows(st.rosterAssignments,assignments,x=>`${x.duty_date}|${x.duty_code}|${x.staff_id}`);
      st.tradeRequests=mergeRows(st.tradeRequests,trades,x=>`${x.from_assignment_id}|${x.requester_id}|${x.receiver_id}`);
      // Keep any helper cache used by rate-normalization patches in sync as well.
      try{ if(window.cnmiV348?.ensureHelpers) await window.cnmiV348.ensureHelpers(month,{force:true}); }catch(err){ console.warn(`[${VERSION}] helper preload`,err); }
      loadedMonth=month;
      return {month,assignments:assignments.length,trades:trades.length};
    })().finally(()=>{loading=null;});
    return loading;
  }

  function isOtPage(){ return String(location.hash||'').startsWith('#/ot'); }
  function isStaffDetailPage(){
    const h=String(location.hash||'');
    return h.startsWith('#/ot') && /(?:\?|&)section=staff-detail(?:&|$)/.test(h);
  }
  function rerender(){ try{ if(typeof renderPage==='function') return renderPage(); }catch(_){ } try{return window.renderPage?.();}catch(_){ } }
  function warm({force=false,render=true}={}){
    if(!isOtPage()) return;
    clearTimeout(warmTimer);
    warmTimer=setTimeout(async()=>{
      try{
        // Staff detail already hydrates itself. Re-rendering the whole page here causes
        // the loading card to be destroyed/recreated repeatedly and can look frozen.
        const detail=isStaffDetailPage();
        await preloadOtReferenceData(routeMonth(),{force: detail ? false : force});
        if(render && !detail) rerender();
      }catch(err){ console.warn(`[${VERSION}] warm preload`,err); }
    },80);
  }

  // Hard gate Export until trade/roster reference data are fully loaded.
  window.addEventListener('click',async function(e){
    const btn=e.target?.closest?.('[data-export-hr-v318],[data-export-hr-v241],[data-export-hr-v238],[data-export-hr-v234]');
    if(!btn||replayingExport) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if(btn.dataset.v577Busy==='1') return;
    btn.dataset.v577Busy='1';
    const oldText=btn.textContent, oldDisabled=btn.disabled;
    btn.disabled=true; btn.textContent='กำลังตรวจข้อมูลเวรจริงและขายเวร…';
    try{
      await preloadOtReferenceData(routeMonth(),{force:true});
      // Refresh calculations before the legacy exporter builds Staff_Total / HR_OT / copy.
      // IMPORTANT: renderPage() replaces the Export button node. Clicking the old detached
      // node does not bubble to the document-level V318 exporter, which made the page appear
      // to jump back without downloading anything. Re-acquire the live button after render.
      const selector = btn.matches?.('[data-export-hr-v318]') ? '[data-export-hr-v318]'
        : btn.matches?.('[data-export-hr-v241]') ? '[data-export-hr-v241]'
        : btn.matches?.('[data-export-hr-v238]') ? '[data-export-hr-v238]'
        : '[data-export-hr-v234]';
      const scrollX = window.scrollX, scrollY = window.scrollY;
      rerender();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const liveBtn=document.querySelector(selector) || document.querySelector('[data-export-hr-v318],[data-export-hr-v241],[data-export-hr-v238],[data-export-hr-v234]');
      if(!liveBtn) throw new Error('ไม่พบปุ่ม Export หลังรีเฟรชหน้า กรุณารีเฟรชหน้าเว็บแล้วลองใหม่');
      replayingExport=true;
      liveBtn.disabled=false; liveBtn.textContent=oldText;
      try{ window.scrollTo(scrollX,scrollY); }catch(_){ }
      liveBtn.click();
      setTimeout(()=>{replayingExport=false;},0);
    }catch(err){
      console.error(`[${VERSION}] export preload`,err);
      toastSafe(`Export ไม่สำเร็จ เพราะโหลดข้อมูลอ้างอิง OT ไม่ครบ: ${err?.message||err}`,'error');
    }finally{
      btn.dataset.v577Busy='0';
      if(btn.isConnected){ btn.disabled=oldDisabled; btn.textContent=oldText; }
    }
  },true);

  // When admin changes month/section inside OT, refresh the reference source once.
  window.addEventListener('hashchange',()=>warm({force:true,render:true}));
  window.addEventListener('pageshow',()=>warm({force:false,render:false}));
  setTimeout(()=>warm({force:false,render:true}),200);

  // Visible deployed version. Do not rely on older owner chips only.
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim()))return;
      x.textContent='v603';
      x.title='HR Export Live Button Replay Fix';
    });
  }
  setTimeout(markVersion,500);
  window.addEventListener('hashchange',()=>setTimeout(markVersion,250));

  window.cnmiV577={version:VERSION,preloadOtReferenceData,warm};
  console.info(`[${VERSION}] loaded`);
})();
