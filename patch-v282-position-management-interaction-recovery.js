/* CNMI Staff Planner V282
   Position Management interaction recovery.
   Scope:
   - Keep the existing Slot CRUD / Supabase logic unchanged.
   - Render the Slot page through one stable route instead of stacking legacy tab renderers.
   - Prevent MutationObserver self-rerender loops that can freeze clicks after opening Position Management.
   - Keep navigation and all buttons usable after entering/leaving this page.
*/
(function(){
  'use strict';
  const VERSION='V282_POSITION_MANAGEMENT_INTERACTION_RECOVERY';
  if(window.__CNMI_V282_POSITION_MANAGEMENT_INTERACTION_RECOVERY__) return;
  window.__CNMI_V282_POSITION_MANAGEMENT_INTERACTION_RECOVERY__=true;

  let rendering=false;
  let configLoadStarted=false;
  let recoveryQueued=false;

  function S(){
    try{return state||window.state||null;}
    catch(_){return window.state||null;}
  }
  function isPositionManagement(){return String(S()?.page||'')==='positionManagement';}
  function closeTransientUi(){
    try{
      const modal=document.getElementById('modal');
      if(modal?.classList.contains('hidden')) document.body.classList.remove('modal-open');
      if(window.innerWidth>820){
        document.body.classList.remove('sidebar-open');
        document.getElementById('sidebar')?.classList.remove('open');
      }
    }catch(_){}
  }
  function setHeader(){
    try{
      const title=document.getElementById('pageTitle');
      const subtitle=document.getElementById('pageSubtitle');
      if(title && title.textContent!=='จัดการตำแหน่ง') title.textContent='จัดการตำแหน่ง';
      if(subtitle && subtitle.textContent!=='จัดการชุด Slot ตำแหน่งกลางวัน') subtitle.textContent='จัดการชุด Slot ตำแหน่งกลางวัน';
    }catch(_){}
  }
  function renderNavSafe(){
    try{ if(typeof renderNav==='function') renderNav(); }
    catch(error){ console.warn(`${VERSION}: renderNav skipped`,error); }
  }
  function renderSlotPage(){
    const root=document.getElementById('pageContent');
    if(!root || !isPositionManagement()) return false;
    try{
      if(window.cnmiV224?.renderPositionManagementV224){
        window.cnmiV224.renderPositionManagementV224();
        return true;
      }
    }catch(error){console.warn(`${VERSION}: V224 render skipped`,error);}
    return false;
  }
  function decorateStablePage(){
    if(!isPositionManagement()) return;
    const root=document.getElementById('pageContent');
    if(!root) return;
    root.classList.add('v282-position-management-root');
    root.querySelectorAll('.v244-position-management-page').forEach(wrapper=>{
      const slot=wrapper.querySelector('.v224-position-template-page,.position-management-page');
      if(slot && wrapper.parentNode){
        wrapper.parentNode.replaceChild(slot,wrapper);
      }
    });
    root.querySelectorAll('.v224-position-template-page,.position-management-page').forEach(page=>page.classList.add('v282-position-management-stable'));
    closeTransientUi();
  }
  function loadConfigOnce(){
    if(configLoadStarted || !isPositionManagement()) return;
    const load=window.cnmiV224?.loadDbConfigs;
    if(typeof load!=='function') return;
    configLoadStarted=true;
    Promise.resolve().then(()=>load(false)).catch(error=>{
      console.warn(`${VERSION}: background Slot load skipped`,error);
    }).finally(()=>{
      configLoadStarted=false;
      if(!isPositionManagement()) return;
      renderSlotPage();
      decorateStablePage();
    });
  }
  function renderStablePositionManagement(){
    if(!isPositionManagement() || rendering) return;
    rendering=true;
    try{
      renderNavSafe();
      setHeader();
      if(!renderSlotPage()){
        const root=document.getElementById('pageContent');
        if(root) root.innerHTML='<div class="card"><h3>จัดการตำแหน่ง</h3><p class="hint">กำลังเตรียมหน้าจัดการ Slot…</p></div>';
      }
      decorateStablePage();
      loadConfigOnce();
    }finally{rendering=false;}
  }
  function queueRecovery(){
    if(recoveryQueued || !isPositionManagement()) return;
    recoveryQueued=true;
    requestAnimationFrame(()=>{
      recoveryQueued=false;
      if(!isPositionManagement()) return;
      const root=document.getElementById('pageContent');
      const hasStable=!!root?.querySelector('.v224-position-template-page,.position-management-page');
      const hasLegacyWrapper=!!root?.querySelector('.v244-position-management-page');
      if(!hasStable || hasLegacyWrapper) renderStablePositionManagement();
      else decorateStablePage();
    });
  }

  const previousRender=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(previousRender && !previousRender.__v282PositionManagementStable){
    const wrapped=function renderPageV282(){
      if(isPositionManagement()){
        renderStablePositionManagement();
        return;
      }
      return previousRender.apply(this,arguments);
    };
    wrapped.__v282PositionManagementStable=true;
    window.renderPage=wrapped;
    try{renderPage=wrapped;}catch(_){}
  }

  // Recover if a legacy delayed renderer replaces the stable Slot page.
  try{
    const root=document.getElementById('pageContent');
    if(root){
      const observer=new MutationObserver(queueRecovery);
      observer.observe(root,{childList:true,subtree:false});
      window.__CNMI_V282_POSITION_MANAGEMENT_OBSERVER__=observer;
    }
  }catch(_){}

  // Make sure stale responsive overlays never cover the management controls.
  const style=document.createElement('style');
  style.id='v282-position-management-interaction-style';
  style.textContent=`
    .v282-position-management-root,
    .v282-position-management-root .v282-position-management-stable,
    .v282-position-management-root button,
    .v282-position-management-root select,
    .v282-position-management-root input,
    .v282-position-management-root textarea{pointer-events:auto!important}
    .v282-position-management-root{position:relative;z-index:1;isolation:isolate}
    .v282-position-management-root .v224-slot-table{max-height:calc(100dvh - 330px);overflow:auto}
    @media(max-width:820px){
      .v282-position-management-root .v224-slot-table{max-height:58dvh}
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>setTimeout(queueRecovery,120));
  setTimeout(queueRecovery,0);
  setTimeout(queueRecovery,350);

  window.cnmiV282={renderStablePositionManagement,queueRecovery};
  console.info(`${VERSION} loaded`);
})();
