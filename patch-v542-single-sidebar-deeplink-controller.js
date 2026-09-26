/* CNMI Staff Planner V542 — Single Sidebar + Deep-link State Controller
 * One authoritative owner for:
 *   1) top-level sidebar accordion state,
 *   2) cnmi-sidebar-tree-open-id compatibility state,
 *   3) the visible app version chip.
 * Legacy V523/V524 still build the menu DOM; legacy business/UI patches remain intact.
 * V531/V539 state controllers are no longer loaded to avoid competing observers.
 */
(function(){
  'use strict';
  if(window.__CNMI_V542_SINGLE_SIDEBAR_CONTROLLER__) return;
  window.__CNMI_V542_SINGLE_SIDEBAR_CONTROLLER__=true;
  window.__CNMI_V542_NAV_OWNER__=true;
  window.__CNMI_V542_VERSION_OWNER__=true;

  const VERSION='V550_RACE_TRADE_STATE_STABILITY';
  const LEGACY_OPEN='cnmi-sidebar-tree-open-id';
  const OWNER_OPEN='cnmi-v542-sidebar-open-tree';
  const OLD_STICKY='cnmi-v536-sidebar-open-tree';
  const MANUAL_CLOSED='cnmi-v542-sidebar-manual-closed-tree';
  const EXTRA_OPEN='cnmi-v528-admin-extra-open';
  let openTree='';
  let manualClosed='';
  let lastRouteTree='';
  let syncQueued=false;

  function ssGet(k,d=''){try{const v=sessionStorage.getItem(k);return v==null?d:String(v);}catch(_){return d;}}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){} }
  function ssDel(k){try{sessionStorage.removeItem(k);}catch(_){} }
  function normalize(id){
    const x=String(id||'').trim();
    if(!x) return '';
    if(x==='ot'||x.startsWith('v524:')) return x;
    if(x.startsWith('plain:')) return '';
    return `v524:${x}`;
  }
  function persist(){
    if(openTree){ssSet(OWNER_OPEN,openTree);ssSet(LEGACY_OPEN,openTree);ssSet(OLD_STICKY,openTree);}
    else{ssDel(OWNER_OPEN);ssDel(LEGACY_OPEN);ssDel(OLD_STICKY);}
    if(manualClosed)ssSet(MANUAL_CLOSED,manualClosed);else ssDel(MANUAL_CLOSED);
  }
  function getOpenTree(){return openTree;}
  function setOpenTree(id,opts={}){
    const next=normalize(id);
    openTree=next;
    if(next) manualClosed='';
    else if(opts.manualTree) manualClosed=normalize(opts.manualTree);
    else if(opts.clearManual) manualClosed='';
    persist();
    queueSync();
    return openTree;
  }
  function setManualClosed(id){
    openTree='';manualClosed=normalize(id);persist();queueSync();
  }
  function closeNestedOt(){
    ssSet('cnmi-v523-ot-open','0');
    ssSet(EXTRA_OPEN,'0');
    const branch=document.querySelector('[data-v528-extra-tree]');
    branch?.querySelector('[data-v528-extra-toggle]')?.setAttribute('aria-expanded','false');
    const extra=branch?.querySelector('[data-v528-extra-submenu]');
    extra?.classList.remove('open');extra?.setAttribute('aria-hidden','true');
  }
  function collapsePlain(page=''){
    openTree='';manualClosed='';persist();closeNestedOt();
    try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:`plain:${page||''}`,owner:'v542'}}));}catch(_){}
    queueSync();
  }

  const ROUTE_TREE=new Map([
    ['ot','ot'],
    ['leave','v524:leave'],['profile','v524:profile'],
    ['activities','v524:activities'],['training','v524:activities'],
    ['roster','v524:roster'],['trade','v524:roster'],
    ['positions/day','v524:positions-staff'],['positions/month','v524:positions-staff'],
    ['hr-check','v524:hr'],['hr-summary','v524:hr'],
    ['positions/month-admin','v524:positions-admin'],['positions/manage','v524:positions-admin'],['intern','v524:positions-admin'],
    ['physician-consult','v524:physician'],['users','v524:users'],
    ['profile-requests','v524:profile-requests'],['profile-requests/history','v524:profile-requests']
  ]);
  function routeName(){
    const raw=String(location.hash||'').replace(/^#\/?/,'');
    const q=raw.indexOf('?');
    try{return decodeURIComponent(q>=0?raw.slice(0,q):raw)||'dashboard';}catch(_){return (q>=0?raw.slice(0,q):raw)||'dashboard';}
  }
  function routeTree(){return ROUTE_TREE.get(routeName())||'';}
  function adoptRoute({initial=false,history=false}={}){
    const nextTree=routeTree();
    if(!nextTree){
      if(openTree) collapsePlain(routeName());
      lastRouteTree='';
      return;
    }
    const routeChanged=nextTree!==lastRouteTree;
    if(initial || history || routeChanged){
      if(manualClosed!==nextTree) setOpenTree(nextTree);
    }
    lastRouteTree=nextTree;
  }

  function syncDom(){
    syncQueued=false;
    document.querySelectorAll('.v523-nav-tree').forEach(tree=>{
      const open=openTree==='ot';
      tree.querySelector('.v523-nav-parent')?.setAttribute('aria-expanded',open?'true':'false');
      const sub=tree.querySelector('.v523-nav-submenu');
      sub?.classList.toggle('open',open);sub?.setAttribute('aria-hidden',open?'false':'true');
      ssSet('cnmi-v523-ot-open',open?'1':'0');
      if(!open) closeNestedOt();
    });
    document.querySelectorAll('.v524-nav-tree').forEach(tree=>{
      const id=`v524:${String(tree.dataset.v524Tree||'')}`;
      const open=openTree===id;
      tree.querySelector('.v524-nav-parent')?.setAttribute('aria-expanded',open?'true':'false');
      const sub=tree.querySelector('.v524-nav-submenu');
      sub?.classList.toggle('open',open);sub?.setAttribute('aria-hidden',open?'false':'true');
      ssSet(`cnmi-v524-tree-${String(tree.dataset.v524Tree||'')}-open`,open?'1':'0');
    });
  }
  function queueSync(){
    if(syncQueued)return;syncQueued=true;
    requestAnimationFrame(syncDom);
  }

  function decorateVersion(){
    const foot=document.querySelector('.sidebar-foot');
    if(!foot)return;
    let chip=foot.querySelector('[class*="version-chip"]');
    if(!chip){
      chip=document.createElement('div');chip.className='v520-version-chip v542-version-chip';foot.prepend(chip);
    }
    if(chip.textContent!=='v568')chip.textContent='v568';
    if(chip.title!=='RACE uses completed trade state that remains stable across async route refreshes (V550)')chip.title='RACE uses completed trade state that remains stable across async route refreshes (V550)';
    chip.classList.add('v542-version-chip');
  }

  /* Registered before legacy V523/V524 click handlers because this file is loaded first. */
  document.addEventListener('click',function(e){
    const target=e.target;
    const otToggle=target?.closest?.('[data-v523-submenu-toggle]');
    if(otToggle){
      const willOpen=otToggle.getAttribute('aria-expanded')!=='true';
      if(willOpen)setOpenTree('ot');else setManualClosed('ot');
      return;
    }
    const treeToggle=target?.closest?.('[data-v524-tree-toggle]');
    if(treeToggle){
      const id=`v524:${String(treeToggle.dataset.v524TreeToggle||'')}`;
      const willOpen=treeToggle.getAttribute('aria-expanded')!=='true';
      if(willOpen)setOpenTree(id);else setManualClosed(id);
      return;
    }
    const nested=target?.closest?.('[data-v528-extra-mode],[data-v528-extra-toggle]');
    if(nested){setOpenTree('ot');return;}
    const otItem=target?.closest?.('[data-v523-ot-item]');
    if(otItem){setOpenTree('ot');return;}
    const treeItem=target?.closest?.('[data-v524-child-key]');
    if(treeItem){setOpenTree(`v524:${String(treeItem.dataset.v524TreeItem||'')}`);return;}
    const plain=target?.closest?.('#mainNav .nav-btn[data-page]');
    if(plain && !plain.closest('.v523-nav-tree,.v524-nav-tree')){
      collapsePlain(String(plain.dataset.page||''));
    }
  },true);

  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    if(e?.detail?.owner==='v542')return;
    const id=String(e?.detail?.id||'');
    if(id.startsWith('plain:')){collapsePlain(id.slice(6));return;}
    const next=normalize(id);if(next)setOpenTree(next);
  });

  function onHistory(){adoptRoute({history:true});queueSync();decorateVersion();}
  window.addEventListener('hashchange',onHistory,true);
  window.addEventListener('popstate',onHistory,true);
  window.addEventListener('pageshow',()=>{adoptRoute({history:true});queueSync();decorateVersion();});

  function start(){
    openTree=normalize(ssGet(OWNER_OPEN,ssGet(LEGACY_OPEN,ssGet(OLD_STICKY,''))));
    manualClosed=normalize(ssGet(MANUAL_CLOSED,''));
    lastRouteTree=routeTree();
    if(lastRouteTree){
      if(!openTree && manualClosed!==lastRouteTree) openTree=lastRouteTree;
    }else{
      openTree='';manualClosed='';
    }
    persist();queueSync();decorateVersion();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(()=>queueSync()).observe(nav,{childList:true,subtree:true});
    const sidebar=document.getElementById('sidebar');
    if(sidebar)new MutationObserver(muts=>{
      if(muts.some(m=>m.addedNodes?.length)){queueSync();decorateVersion();}
    }).observe(sidebar,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV542SidebarOwner={version:VERSION,getOpenTree,setOpenTree,collapsePlain,sync:queueSync,decorateVersion,routeTree};
  console.info(`[${VERSION}] loaded`);
})();
