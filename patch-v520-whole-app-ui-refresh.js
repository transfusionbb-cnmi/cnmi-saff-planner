/* CNMI Staff Planner V520 — Whole App UI/UX Refresh
   UI only. Keeps formal names/data intact; operational pickers can display nickname-first. */
(function(){
  'use strict';
  if(window.__CNMI_V520_UI_REFRESH__) return;
  window.__CNMI_V520_UI_REFRESH__=true;
  const VERSION='V520_WHOLE_APP_UI_REFRESH';

  function stateSafe(){
    try{return window.state || (typeof state!=='undefined'?state:null);}catch(_){return null;}
  }
  function pageName(){return String(stateSafe()?.page||'').trim();}

  function decorateVersion(){
    const foot=document.querySelector('.sidebar-foot');
    if(!foot || foot.querySelector('.v520-version-chip')) return;
    const el=document.createElement('span');
    el.className='v520-version-chip';
    el.textContent='v520';
    el.title='Whole App UI/UX Refresh';
    const user=foot.querySelector('.user-mini');
    if(user?.nextSibling) foot.insertBefore(el,user.nextSibling); else foot.prepend(el);
  }

  function compactActivityPeople(root=document){
    root.querySelectorAll?.('.v396-participant').forEach(item=>{
      const nick=String(item.querySelector('b')?.textContent||'').trim();
      const full=String(item.querySelector('small')?.textContent||'').trim();
      if(full){
        item.dataset.v520FullName=full;
        item.title=full;
        item.setAttribute('aria-label',nick && nick!==full ? `${nick} — ${full}` : full);
      }
    });
  }

  function exposeFullNamesAccessibly(root=document){
    root.querySelectorAll?.('.staff-color-pill[title]').forEach(el=>{
      if(!el.getAttribute('aria-label')) el.setAttribute('aria-label',el.getAttribute('title')||String(el.textContent||'').trim());
    });
  }

  function apply(root=document){
    document.body.classList.add('v520-ui-refresh');
    document.body.dataset.cnmiPage=pageName();
    decorateVersion();
    compactActivityPeople(root);
    exposeFullNamesAccessibly(root);
  }

  function queue(root=document){
    if(queue.pending) return;
    queue.pending=true;
    requestAnimationFrame(()=>{queue.pending=false;apply(root);});
  }
  queue.pending=false;

  const previousRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage){
    const wrapped=function renderPageV520(){
      const result=previousRenderPage.apply(this,arguments);
      queue(document);
      return result;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  const start=()=>{
    apply(document);
    const content=document.getElementById('pageContent');
    if(content){
      const observer=new MutationObserver(mutations=>{
        let changed=false;
        for(const m of mutations){ if((m.addedNodes||[]).length){changed=true;break;} }
        if(changed) queue(content);
      });
      observer.observe(content,{childList:true,subtree:true});
    }
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  window.cnmiV520={version:VERSION,apply};
  console.info(`[${VERSION}] loaded`);
})();
