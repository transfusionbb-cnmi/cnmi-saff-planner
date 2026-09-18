/* CNMI Staff Planner V526 — Sidebar Navigation Hotfix
 * Prevents V517 busy feedback from treating sidebar tree navigation as action buttons.
 * Also clears any stale busy UI inside #mainNav and marks tree buttons as navigation-safe.
 * UI/navigation only. No business-rule or DB changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V526_NAV_HOTFIX__) return;
  window.__CNMI_V526_NAV_HOTFIX__=true;
  const VERSION='V526_SIDEBAR_NAVIGATION_HOTFIX';

  function markNavigation(root=document){
    const nav=root?.id==='mainNav'?root:document.getElementById('mainNav');
    if(!nav) return;
    nav.querySelectorAll('button[data-v523-submenu-toggle],button[data-v523-ot-item],button[data-v524-tree-toggle],button[data-v524-child-key]').forEach(btn=>{
      /* Empty data-page keeps V517 from treating it as an action; base handler ignores empty value. */
      if(!btn.hasAttribute('data-page')) btn.setAttribute('data-page','');
      btn.classList.remove('v517-action-busy');
      btn.removeAttribute('aria-busy');
      if(btn.dataset.v517OriginalHtml!=null){
        btn.innerHTML=btn.dataset.v517OriginalHtml;
        delete btn.dataset.v517OriginalHtml;
      }
      delete btn.dataset.v517Busy;
    });
  }

  function decorateVersion(){
    const chip=document.querySelector('.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){
      chip.textContent='v526';
      chip.title='Sidebar navigation hotfix';
      chip.classList.add('v526-version-chip');
    }
  }

  let queued=false;
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      markNavigation();
      decorateVersion();
    });
  }

  function start(){
    markNavigation();
    decorateVersion();
    const nav=document.getElementById('mainNav');
    if(nav){
      new MutationObserver(muts=>{
        for(const m of muts){
          if(m.addedNodes?.length || m.type==='attributes'){queue();break;}
        }
      }).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-busy']});
    }
    window.addEventListener('pageshow',queue);
    window.addEventListener('hashchange',queue);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  window.cnmiV526={version:VERSION,apply:queue};
  console.info(`[${VERSION}] loaded`);
})();
