/* CNMI Staff Planner V316 — early route navigation guard
   Loaded before app.js so legacy capture listeners cannot bypass the route-aware loader.
*/
(function(){
  'use strict';
  const VERSION='V316_NAVIGATION_PRELOAD';
  if(window.__CNMI_V316_NAVIGATION_PRELOAD__) return;
  window.__CNMI_V316_NAVIGATION_PRELOAD__=true;
  const PAGES=new Set([
    'dashboard','calendar','leave','myProfile','activities','schedule','tradeRequests',
    'positionMonthView','positions','ot','audit','hr','hrSummary','scheduler',
    'positionMonth','profileRequests','users','eligibility','positionManagement','internManagement'
  ]);
  let serial=0;
  function appState(){try{return state;}catch(_){return window.state||null;}}
  function render(){try{const fn=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(typeof fn==='function')fn();}catch(error){console.warn(`[${VERSION}] render`,error);}}
  function closeSidebar(){
    try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }
  }
  window.addEventListener('click',async event=>{
    const node=event.target?.closest?.('[data-page]');
    const page=String(node?.getAttribute?.('data-page')||'');
    if(!PAGES.has(page)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const st=appState();
    if(!st) return;
    st.page=page;
    closeSidebar();
    render();
    const ticket=++serial;
    try{await window.cnmiV316?.loadPageData?.(page,{force:false});}
    catch(error){console.warn(`[${VERSION}] route load`,page,error);}
    if(ticket===serial&&appState()?.page===page) render();
  },true);
  console.info(`[${VERSION}] loaded`);
})();
