/* CNMI Staff Planner V465
 * Admin pending center is visible/active only in effective Admin mode.
 * If an Admin account switches to Staff mode, the panel is hidden and
 * the V464 one-minute auto-refresh does not query pending data.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V465_ADMIN_PENDING_ADMIN_MODE_ONLY';
  if(window.__CNMI_V465_ADMIN_PENDING_ADMIN_MODE_ONLY__)return;
  window.__CNMI_V465_ADMIN_PENDING_ADMIN_MODE_ONLY__=true;

  function effectiveAdmin(){
    try{return typeof isAdmin==='function' && !!isAdmin();}
    catch(_){
      try{return typeof window.isAdmin==='function' && !!window.isAdmin();}
      catch(__){return false;}
    }
  }

  function stripPanelFromHtml(html){
    if(effectiveAdmin())return html;
    try{
      const t=document.createElement('template');
      t.innerHTML=String(html||'');
      t.content.querySelectorAll('[data-v460-admin-pending]').forEach(el=>el.remove());
      const out=document.createElement('div');
      out.appendChild(t.content.cloneNode(true));
      return out.innerHTML;
    }catch(_){return html;}
  }

  // V460 injects by actual account role. Add a final guard for the current UI mode.
  const prevDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof prevDashboard==='function'){
    const wrapped=function renderDashboardV465(){
      return stripPanelFromHtml(prevDashboard.apply(this,arguments));
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // V464 timer calls cnmiV460.loadAdminPending dynamically. Block its DB work in Staff mode.
  try{
    const api=window.cnmiV460;
    if(api?.loadAdminPending && !api.__v465Wrapped){
      const original=api.loadAdminPending.bind(api);
      api.loadAdminPending=async function(){
        if(!effectiveAdmin())return [];
        return original.apply(api,arguments);
      };
      api.__v465Wrapped=true;
    }
  }catch(_){ }

  function enforceDom(){
    if(effectiveAdmin())return;
    document.querySelectorAll('[data-v460-admin-pending]').forEach(el=>el.remove());
  }
  const mo=new MutationObserver(enforceDom);
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  document.addEventListener('click',()=>setTimeout(enforceDom,0),true);
  setTimeout(enforceDom,100);

  window.cnmiV465={version:VERSION,effectiveAdmin};
  console.info(`${VERSION} loaded`);
})();
