/* CNMI Staff Planner V284
   Targeted recovery only:
   1) Restore interaction on the daily daytime-position page for Staff / Incharge / Admin.
   2) Widen the Admin monthly daytime-position Slot counter and position dropdowns.
   No roster, Slot-template, mentor, statistics, or Supabase calculation logic is changed.
*/
(function(){
  'use strict';
  const VERSION='V284_DAILY_POSITION_INTERACTION_AND_WIDTH_FIX';
  if(window.__CNMI_V284_DAILY_POSITION_INTERACTION_AND_WIDTH_FIX__) return;
  window.__CNMI_V284_DAILY_POSITION_INTERACTION_AND_WIDTH_FIX__=true;

  let recoveryQueued=false;
  let monthlyQueued=false;
  let actionBusy=false;

  function S(){
    try{return state||window.state||null;}catch(_){return window.state||null;}
  }
  function isDailyPage(){return String(S()?.page||'')==='positions';}
  function isAdminSafe(){
    try{return !!isAdmin();}
    catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isAdminMonthPage(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}

  function clearStaleBlockingUi(){
    if(!isDailyPage()) return;
    try{
      const modal=document.getElementById('modal');
      if(modal?.classList.contains('hidden')){
        modal.classList.remove('modal-sm','modal-lg','modal-closing','modal-ready','modal-ot-edit-v193');
        modal.setAttribute('aria-hidden','true');
        modal.style.removeProperty('display');
        modal.style.removeProperty('pointer-events');
        const body=document.getElementById('modalBody');
        if(body && body.childElementCount===0) body.innerHTML='';
        document.body.classList.remove('modal-open');
      }
      document.querySelectorAll('.loading-overlay,.busy-overlay,.screen-overlay,.route-guard-overlay').forEach(node=>{
        node.style.pointerEvents='none';
      });
      document.body.classList.remove('dragging','is-busy','route-loading');
      const root=document.getElementById('pageContent');
      if(root){
        root.classList.add('v284-daily-interaction-safe');
        root.removeAttribute('inert');
        root.setAttribute('aria-busy','false');
        root.style.pointerEvents='auto';
      }
      const app=document.getElementById('appView');
      if(app){
        app.removeAttribute('inert');
        app.style.pointerEvents='auto';
      }
    }catch(error){console.warn(`${VERSION}: stale UI cleanup skipped`,error);}
  }

  function queueDailyRecovery(){
    if(recoveryQueued||!isDailyPage()) return;
    recoveryQueued=true;
    requestAnimationFrame(()=>{
      recoveryQueued=false;
      clearStaleBlockingUi();
    });
  }

  function enhanceMonthlyWidths(){
    if(!isAdminMonthPage()) return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(!page||!wrap) return;
    page.classList.add('v284-position-width-fix');
    wrap.classList.add('v284-position-width-wrap');
    wrap.querySelectorAll('[data-v275-position-select],[data-v275-mentor-select]').forEach(select=>{
      const option=select.options?.[select.selectedIndex];
      select.title=option?.textContent?.trim()||select.value||'เลือกตำแหน่ง';
    });
  }

  function queueMonthlyEnhance(){
    if(monthlyQueued||!isAdminMonthPage()) return;
    monthlyQueued=true;
    requestAnimationFrame(()=>{
      monthlyQueued=false;
      enhanceMonthlyWidths();
    });
  }

  async function runDailyAction(fnName){
    if(actionBusy) return;
    const fn=window[fnName]||(()=>{try{return eval(fnName);}catch(_){return null;}})();
    if(typeof fn!=='function') return;
    actionBusy=true;
    try{await fn();}
    catch(error){
      console.error(`${VERSION}: ${fnName} failed`,error);
      try{showToast(error?.message||'ทำรายการไม่สำเร็จ',{tone:'error'});}catch(_){}
    }finally{
      actionBusy=false;
      queueDailyRecovery();
    }
  }

  /* Capture daily-page controls before older delegated listeners can be swallowed. */
  window.addEventListener('change',event=>{
    if(!isDailyPage()) return;
    const target=event.target;
    if(target?.id!=='positionDateInput') return;
    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
    const st=S();
    if(st) st.positionDate=target.value;
    clearStaleBlockingUi();
    try{if(typeof renderPage==='function') renderPage(); else window.renderPage?.();}
    catch(error){console.error(`${VERSION}: daily date render failed`,error);}
    setTimeout(queueDailyRecovery,0);
  },true);

  window.addEventListener('click',event=>{
    if(!isDailyPage()) return;
    const target=event.target;

    const nav=target?.closest?.('[data-page]');
    if(nav){
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
      const st=S();
      if(st) st.page=nav.dataset.page;
      document.getElementById('sidebar')?.classList.remove('open');
      document.body.classList.remove('sidebar-open','modal-open');
      try{if(typeof renderPage==='function') renderPage(); else window.renderPage?.();}
      catch(error){console.error(`${VERSION}: navigation failed`,error);}
      return;
    }

    const menu=target?.closest?.('#mobileMenuBtn');
    if(menu){
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
      document.getElementById('sidebar')?.classList.toggle('open');
      document.body.classList.toggle('sidebar-open');
      return;
    }

    if(target?.closest?.('[data-save-incharge]')){
      event.preventDefault();event.stopPropagation();
      if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
      runDailyAction('saveIncharge');
      return;
    }
    if(target?.closest?.('[data-save-positions]')){
      event.preventDefault();event.stopPropagation();
      if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
      runDailyAction('savePositions');
      return;
    }
    if(target?.closest?.('[data-publish-positions]')){
      event.preventDefault();event.stopPropagation();
      if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
      runDailyAction('publishPositionsForDay');
      return;
    }
  },true);

  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRender&&!previousRender.__v284InteractionWidthFix){
    const wrapped=function renderPageV284(){
      const result=previousRender.apply(this,arguments);
      if(isDailyPage()) setTimeout(queueDailyRecovery,0);
      if(isAdminMonthPage()) setTimeout(queueMonthlyEnhance,0);
      return result;
    };
    wrapped.__v284InteractionWidthFix=true;
    window.renderPage=wrapped;
    try{renderPage=wrapped;}catch(_){}
  }

  const style=document.createElement('style');
  style.id='v284-daily-position-interaction-and-width-style';
  style.textContent=`
    /* A hidden modal must never remain as an invisible full-screen click blocker. */
    #modal.hidden,
    .modal.hidden{
      display:none!important;
      visibility:hidden!important;
      opacity:0!important;
      pointer-events:none!important;
    }
    #modal.hidden *,.modal.hidden *{pointer-events:none!important}

    .v284-daily-interaction-safe,
    .v284-daily-interaction-safe .card,
    .v284-daily-interaction-safe .toolbar,
    .v284-daily-interaction-safe input,
    .v284-daily-interaction-safe select,
    .v284-daily-interaction-safe button{
      pointer-events:auto!important;
    }
    .v284-daily-interaction-safe{position:relative;z-index:1}

    /* Admin monthly position matrix: readable Slot count and full position names. */
    .v284-position-width-fix .v284-position-width-wrap{
      --v284-day-width:148px;
    }
    .v284-position-width-fix .v275-position-table tr>th:nth-child(n+3),
    .v284-position-width-fix .v275-position-table tr>td:nth-child(n+3){
      width:var(--v284-day-width)!important;
      min-width:var(--v284-day-width)!important;
      max-width:var(--v284-day-width)!important;
    }
    .v284-position-width-fix .v275-count-row>td:nth-child(n+3){
      white-space:nowrap!important;
      overflow:visible!important;
      font-size:9px!important;
      padding:2px 5px!important;
    }
    .v284-position-width-fix .v275-count-row input[data-v275-slot]{
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      height:23px!important;
      padding:1px 4px!important;
      font-size:9px!important;
    }
    .v284-position-width-fix .v275-position-cell select,
    .v284-position-width-fix .v275-mentor-cell select{
      width:100%!important;
      min-width:0!important;
      height:24px!important;
      min-height:24px!important;
      padding:1px 22px 1px 6px!important;
      font-size:9px!important;
      line-height:22px!important;
      text-overflow:clip!important;
      white-space:nowrap!important;
    }
    .v284-position-width-fix .v275-position-table tbody tr:not(.v275-count-row)>th,
    .v284-position-width-fix .v275-position-table tbody tr:not(.v275-count-row)>td,
    .v284-position-width-fix .v275-position-day{
      height:29px!important;
      min-height:29px!important;
      max-height:29px!important;
    }
    .v284-position-width-fix .v275-position-cell{
      height:25px!important;
      min-height:25px!important;
    }
    @media(max-width:820px){
      .v284-position-width-fix .v284-position-width-wrap{--v284-day-width:136px}
      .v284-position-width-fix .v275-position-cell select,
      .v284-position-width-fix .v275-mentor-cell select{font-size:8.5px!important}
    }
  `;
  document.head.appendChild(style);

  try{
    const root=document.getElementById('pageContent')||document.documentElement;
    const observer=new MutationObserver(()=>{
      if(isDailyPage()) queueDailyRecovery();
      if(isAdminMonthPage()) queueMonthlyEnhance();
    });
    observer.observe(root,{childList:true,subtree:true});
    window.__CNMI_V284_OBSERVER__=observer;
  }catch(_){}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(queueDailyRecovery,80);
    setTimeout(queueMonthlyEnhance,80);
  });
  setTimeout(queueDailyRecovery,0);
  setTimeout(queueMonthlyEnhance,0);
  setTimeout(queueDailyRecovery,400);
  setTimeout(queueMonthlyEnhance,400);

  window.cnmiV284={clearStaleBlockingUi,enhanceMonthlyWidths};
  console.info(`${VERSION} loaded`);
})();
