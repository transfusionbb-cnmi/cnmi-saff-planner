/* CNMI Staff Planner V537 — Sidebar Plain Navigation Hard Collapse
 * Fixes the remaining case where a previously opened sidebar subtree could stay
 * expanded after navigating to a top-level menu that has no submenu.
 *
 * Rules:
 * - Submenu child navigation keeps its parent tree open.
 * - Opening another tree moves the open state to that tree.
 * - Clicking a plain/top-level menu immediately collapses every subtree and
 *   keeps them closed across the render cycle.
 * - Normal rerenders on a tree page do not collapse the active tree.
 *
 * Navigation/UI only. No roster/leave/HR/OT business logic or DB changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V537_SIDEBAR_PLAIN_HARD_COLLAPSE__) return;
  window.__CNMI_V537_SIDEBAR_PLAIN_HARD_COLLAPSE__=true;

  const VERSION='V537_SIDEBAR_PLAIN_NAV_HARD_COLLAPSE';
  const LEGACY_OPEN_KEY='cnmi-sidebar-tree-open-id';
  const STICKY_KEY='cnmi-v536-sidebar-open-tree';
  const NONE='v536:none';
  let plainLockToken=0;
  let plainTarget='';
  let queued=false;

  function ssSet(key,value){try{sessionStorage.setItem(key,String(value));}catch(_){} }
  function currentPage(){
    try{return String((window.state||{}).page||'');}catch(_){return '';}
  }
  function isInsideTree(el){return !!el?.closest?.('.v523-nav-tree,.v524-nav-tree');}

  function collapseOt(){
    const tree=document.querySelector('.v523-nav-tree');
    const parent=tree?.querySelector('.v523-nav-parent');
    const sub=tree?.querySelector('.v523-nav-submenu');
    if(parent && parent.getAttribute('aria-expanded')!=='false') parent.setAttribute('aria-expanded','false');
    if(sub?.classList.contains('open')) sub.classList.remove('open');
    if(sub && sub.getAttribute('aria-hidden')!=='true') sub.setAttribute('aria-hidden','true');
    ssSet('cnmi-v523-ot-open','0');
  }

  function collapseV524(){
    document.querySelectorAll('.v524-nav-tree').forEach(tree=>{
      const key=String(tree.dataset.v524Tree||'');
      const parent=tree.querySelector('.v524-nav-parent');
      if(parent && parent.getAttribute('aria-expanded')!=='false') parent.setAttribute('aria-expanded','false');
      const sub=tree.querySelector('.v524-nav-submenu');
      if(sub?.classList.contains('open')) sub.classList.remove('open');
      if(sub && sub.getAttribute('aria-hidden')!=='true') sub.setAttribute('aria-hidden','true');
      if(key) ssSet(`cnmi-v524-tree-${key}-open`,'0');
    });
  }

  function collapseNestedOt(){
    ssSet('cnmi-v528-admin-extra-open','0');
    const branch=document.querySelector('[data-v528-extra-tree]');
    const toggle=branch?.querySelector('[data-v528-extra-toggle]');
    if(toggle && toggle.getAttribute('aria-expanded')!=='false') toggle.setAttribute('aria-expanded','false');
    const sub=branch?.querySelector('[data-v528-extra-submenu]');
    if(sub?.classList.contains('open')) sub.classList.remove('open');
    if(sub && sub.getAttribute('aria-hidden')!=='true') sub.setAttribute('aria-hidden','true');
  }

  function stampClosedState(){
    /* Keep a sentinel instead of removing the legacy key. Older V523/V524 code
       treats an empty key as permission to auto-open the active branch again. */
    ssSet(STICKY_KEY,NONE);
    ssSet(LEGACY_OPEN_KEY,NONE);
  }

  function hardCollapse(){
    stampClosedState();
    collapseOt();
    collapseV524();
    collapseNestedOt();
  }

  function stopPlainLock(){
    plainLockToken++;
    plainTarget='';
  }

  function beginPlainLock(page){
    const token=++plainLockToken;
    plainTarget=String(page||'');
    hardCollapse();

    /* Route rendering and older navigation patches do not all finish in the same
       microtask. Re-assert the user's plain-nav intent during that short window. */
    [0,30,90,180,420,900,1600].forEach(ms=>{
      setTimeout(()=>{
        if(token!==plainLockToken) return;
        const p=currentPage();
        if(!plainTarget || !p || p===plainTarget || ms<180) hardCollapse();
      },ms);
    });
  }

  function queuePlainGuard(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      if(!plainTarget) return;
      if(currentPage()===plainTarget) hardCollapse();
    });
  }

  /* Capture on window so this runs before document-level handlers from V523–V531. */
  window.addEventListener('click',function(e){
    const target=e.target;

    /* Any genuine tree interaction cancels a pending plain-menu lock. */
    if(target?.closest?.('[data-v523-submenu-toggle],[data-v524-tree-toggle],[data-v523-ot-item],[data-v524-child-key]')){
      stopPlainLock();
      return;
    }

    const action=target?.closest?.('#mainNav [data-page],#mainNav [data-nav]');
    if(!action || isInsideTree(action)) return;

    const page=String(action.dataset.page||action.dataset.nav||'').trim();
    if(!page) return;
    beginPlainLock(page);

    /* Also tell every older accordion layer that this is intentionally plain nav. */
    try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:`plain:${page}`,source:'v537'}}));}catch(_){}
  },true);

  /* If an older patch announces a real tree open, user intent has moved back to a tree. */
  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    const id=String(e?.detail?.id||'');
    if(id==='ot' || id.startsWith('v524:')){
      /* A real user tree click already cancels the lock in the capture handler
         above. If plainTarget is still set, this announcement is from a late
         render/legacy auto-open and must not override the plain-menu click. */
      if(plainTarget){hardCollapse();return;}
      stopPlainLock();
      return;
    }
    if(id.startsWith('plain:')){
      if(e?.detail?.source==='v537') return;
      const page=id.slice(6);
      if(page) beginPlainLock(page);
    }
  });

  function decorateVersion(){
    const chip=document.querySelector('.v536-version-chip,.v535-version-chip,.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip) return;
    if(chip.textContent!=='v537') chip.textContent='v537';
    chip.title='Sidebar plain navigation hard-collapse fix';
    chip.classList.add('v537-version-chip');
  }

  function start(){
    decorateVersion();
    const nav=document.getElementById('mainNav');
    if(nav){
      new MutationObserver(()=>{
        decorateVersion();
        queuePlainGuard();
      }).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-expanded']});
    }
    const foot=document.querySelector('.sidebar-foot');
    if(foot) new MutationObserver(()=>decorateVersion()).observe(foot,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();

  window.cnmiV537={version:VERSION,hardCollapse};
  console.info(`[${VERSION}] loaded`);
})();
