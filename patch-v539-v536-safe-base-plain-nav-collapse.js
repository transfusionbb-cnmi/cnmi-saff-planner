/* CNMI Staff Planner V539 — Safe Sidebar State + Plain Navigation Collapse
 * Keeps the last explicitly opened top-level sidebar tree stable across renderPage,
 * hash routing, MutationObserver refreshes and async page rendering.
 * Preserves the V531 strict-accordion rule: only one top-level tree is open.
 * Navigation/UI only. No roster/leave/HR/OT business logic or DB changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V539_SIDEBAR_SAFE_STATE__) return;
  window.__CNMI_V539_SIDEBAR_SAFE_STATE__=true;

  const VERSION='V539_V536_SAFE_BASE_PLAIN_NAV_COLLAPSE';
  const LEGACY_OPEN_KEY='cnmi-sidebar-tree-open-id';
  const STICKY_KEY='cnmi-v536-sidebar-open-tree';
  const NONE='v536:none';
  let syncing=false;
  let queued=false;
  let explicitCloseUntil=0;
  let plainCloseLocked=false;

  function getSS(key,fallback=''){
    try{const v=sessionStorage.getItem(key);return v==null?fallback:v;}catch(_){return fallback;}
  }
  function setSS(key,value){try{sessionStorage.setItem(key,String(value));}catch(_){}}
  function delSS(key){try{sessionStorage.removeItem(key);}catch(_){}}

  function validTreeId(id){
    return id==='ot' || /^v524:[a-z0-9-]+$/i.test(String(id||''));
  }
  function treeExists(id){
    if(id==='ot') return !!document.querySelector('.v523-nav-tree');
    if(String(id).startsWith('v524:')){
      const key=String(id).slice(5);
      try{return !!document.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(key)}"]`);}catch(_){return false;}
    }
    return false;
  }
  function activeTreeId(){
    const ot=document.querySelector('.v523-nav-tree .v523-nav-parent.active');
    if(ot) return 'ot';
    const active=document.querySelector('.v524-nav-tree .v524-nav-parent.active');
    const tree=active?.closest?.('.v524-nav-tree');
    return tree?.dataset?.v524Tree ? `v524:${tree.dataset.v524Tree}` : '';
  }
  function currentOpenDomId(){
    const ot=document.querySelector('.v523-nav-tree .v523-nav-parent[aria-expanded="true"]');
    if(ot) return 'ot';
    const parent=document.querySelector('.v524-nav-tree .v524-nav-parent[aria-expanded="true"]');
    const tree=parent?.closest?.('.v524-nav-tree');
    return tree?.dataset?.v524Tree ? `v524:${tree.dataset.v524Tree}` : '';
  }

  function writeLegacy(id){
    /* Keep a non-empty sentinel when explicitly closed so V523/V524 do not
       auto-open the active page again during their next apply()/observer pass. */
    setSS(LEGACY_OPEN_KEY,id||NONE);
  }
  function setSticky(id,{explicitClose=false}={}){
    const next=validTreeId(id)?id:NONE;
    setSS(STICKY_KEY,next);
    writeLegacy(next===NONE?'':next);
    if(explicitClose) explicitCloseUntil=Date.now()+1200;
  }
  function getSticky(){
    const stored=getSS(STICKY_KEY,'');
    if(stored===NONE) return NONE;
    if(validTreeId(stored)) return stored;

    const legacy=getSS(LEGACY_OPEN_KEY,'');
    if(validTreeId(legacy)) return legacy;

    const dom=currentOpenDomId();
    if(validTreeId(dom)) return dom;

    const active=activeTreeId();
    if(validTreeId(active)) return active;
    return NONE;
  }

  function setTreeDom(id,open){
    if(id==='ot'){
      const tree=document.querySelector('.v523-nav-tree');
      if(!tree) return;
      const parent=tree.querySelector('.v523-nav-parent');
      const sub=tree.querySelector('.v523-nav-submenu');
      const expanded=open?'true':'false';
      const hidden=open?'false':'true';
      if(parent && parent.getAttribute('aria-expanded')!==expanded) parent.setAttribute('aria-expanded',expanded);
      if(sub){
        sub.classList.toggle('open',open);
        if(sub.getAttribute('aria-hidden')!==hidden) sub.setAttribute('aria-hidden',hidden);
      }
      try{sessionStorage.setItem('cnmi-v523-ot-open',open?'1':'0');}catch(_){}
      return;
    }
    if(String(id).startsWith('v524:')){
      const key=String(id).slice(5);
      let tree=null;
      try{tree=document.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(key)}"]`);}catch(_){}
      if(!tree) return;
      const parent=tree.querySelector('.v524-nav-parent');
      const sub=tree.querySelector('.v524-nav-submenu');
      const expanded=open?'true':'false';
      const hidden=open?'false':'true';
      if(parent && parent.getAttribute('aria-expanded')!==expanded) parent.setAttribute('aria-expanded',expanded);
      if(sub){
        sub.classList.toggle('open',open);
        if(sub.getAttribute('aria-hidden')!==hidden) sub.setAttribute('aria-hidden',hidden);
      }
      try{sessionStorage.setItem(`cnmi-v524-tree-${key}-open`,open?'1':'0');}catch(_){}
    }
  }

  function collapseNestedOtIfLeaving(target){
    if(target==='ot') return;
    try{sessionStorage.setItem('cnmi-v528-admin-extra-open','0');}catch(_){}
    const branch=document.querySelector('[data-v528-extra-tree]');
    const extraToggle=branch?.querySelector('[data-v528-extra-toggle]');
    if(extraToggle && extraToggle.getAttribute('aria-expanded')!=='false') extraToggle.setAttribute('aria-expanded','false');
    const sub=branch?.querySelector('[data-v528-extra-submenu]');
    sub?.classList.remove('open');
    if(sub && sub.getAttribute('aria-hidden')!=='true') sub.setAttribute('aria-hidden','true');
  }

  function sync(){
    if(syncing) return;
    syncing=true;
    try{
      let target=plainCloseLocked?NONE:getSticky();

      /* If a route/deep-link entered a tree page without a prior click, open its
         active branch. Do not override an explicit close while the old patches render. */
      if(!plainCloseLocked && target===NONE && Date.now()>explicitCloseUntil){
        const active=activeTreeId();
        const legacy=getSS(LEGACY_OPEN_KEY,'');
        if(validTreeId(legacy)) target=legacy;
        else if(validTreeId(active) && !getSS(STICKY_KEY,'')) target=active;
      }

      if(target!==NONE && !treeExists(target)){
        /* Nav may be between render cycles. Keep the stored target; do not erase it. */
        writeLegacy(target);
        return;
      }

      const ot=document.querySelector('.v523-nav-tree');
      if(ot) setTreeDom('ot',target==='ot');
      document.querySelectorAll('.v524-nav-tree').forEach(tree=>{
        const id=tree.dataset.v524Tree?`v524:${tree.dataset.v524Tree}`:'';
        if(id) setTreeDom(id,target===id);
      });
      collapseNestedOtIfLeaving(target);
      writeLegacy(target===NONE?'':target);
    }finally{
      syncing=false;
    }
  }

  function queueSync(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      sync();
      /* A second pass wins over late async render/apply calls from older patches. */
      setTimeout(sync,40);
      setTimeout(sync,140);
      setTimeout(decorateVersion,240);
    });
  }

  function topIdFromToggle(toggle){
    if(toggle?.matches?.('[data-v523-submenu-toggle]')) return 'ot';
    if(toggle?.matches?.('[data-v524-tree-toggle]')){
      const id=String(toggle.dataset.v524TreeToggle||'');
      return id?`v524:${id}`:'';
    }
    return '';
  }

  /* Run before the older handlers. We record user intent first; older patches may
     rerender afterward, then queueSync restores exactly that intent. */
  window.addEventListener('click',function(e){
    const target=e.target;
    const toggle=target?.closest?.('[data-v523-submenu-toggle],[data-v524-tree-toggle]');
    if(toggle){
      plainCloseLocked=false;
      const id=topIdFromToggle(toggle);
      if(!id) return;
      const willOpen=toggle.getAttribute('aria-expanded')!=='true';
      setSticky(willOpen?id:'',{explicitClose:!willOpen});
      queueSync();
      return;
    }

    const otItem=target?.closest?.('[data-v523-ot-item]');
    if(otItem){
      plainCloseLocked=false;
      setSticky('ot');
      queueSync();
      return;
    }

    const child=target?.closest?.('[data-v524-child-key]');
    if(child){
      plainCloseLocked=false;
      const id=String(child.dataset.v524TreeItem||'');
      if(id){setSticky(`v524:${id}`);queueSync();}
      return;
    }

    /* V539: any real top-level navigation with no subtree is authoritative.
       Keep all subtrees closed across the route/render cycle until the user
       explicitly interacts with a tree again. */
    const plain=target?.closest?.('#mainNav [data-page],#mainNav [data-nav]');
    if(plain && !plain.closest('.v523-nav-tree,.v524-nav-tree')){
      plainCloseLocked=true;
      setSticky('',{explicitClose:true});
      /* Close immediately before older navigation/render handlers run. */
      setTreeDom('ot',false);
      document.querySelectorAll('.v524-nav-tree').forEach(tree=>{
        const id=tree.dataset.v524Tree?`v524:${tree.dataset.v524Tree}`:'';
        if(id) setTreeDom(id,false);
      });
      collapseNestedOtIfLeaving(NONE);
      queueSync();
    }
  },true);

  /* Accept legitimate tree-open announcements, but ignore old-patch attempts to
     clear/open something else during the short explicit-close protection window. */
  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    const id=String(e?.detail?.id||'');
    if(validTreeId(id)){
      if(plainCloseLocked || Date.now()<=explicitCloseUntil) return;
      setSticky(id);
      queueSync();
      return;
    }
    if(id.startsWith('plain:')){
      plainCloseLocked=true;
      setSticky('',{explicitClose:true});
      queueSync();
    }
  });

  function decorateVersion(){
    if(window.__CNMI_V540_SUBMENU_DEEP_LINK_ROUTING__) return;
    const chip=document.querySelector('.v535-version-chip,.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip) return;
    if(chip.textContent!=='v539') chip.textContent='v539';
    if(chip.title!=='V539 safe sidebar state + plain navigation collapse') chip.title='V539 safe sidebar state + plain navigation collapse';
    if(!chip.classList.contains('v539-version-chip')) chip.classList.add('v539-version-chip');
  }

  function start(){
    const seeded=getSticky();
    setSS(STICKY_KEY,seeded);
    writeLegacy(seeded===NONE?'':seeded);
    decorateVersion();
    queueSync();

    const nav=document.getElementById('mainNav');
    if(nav){
      new MutationObserver(muts=>{
        if(muts.some(m=>m.addedNodes?.length || m.removedNodes?.length || (m.type==='attributes' && ['class','aria-expanded'].includes(m.attributeName)))) queueSync();
      }).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-expanded']});
    }
    const foot=document.querySelector('.sidebar-foot');
    if(foot){
      new MutationObserver(()=>decorateVersion()).observe(foot,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','title']});
    }
    window.addEventListener('hashchange',queueSync);
    window.addEventListener('pageshow',queueSync);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();

  window.cnmiV539={version:VERSION,sync:queueSync,getOpen:()=>getSticky(),isPlainLocked:()=>plainCloseLocked};
  console.info(`[${VERSION}] loaded`);
})();
