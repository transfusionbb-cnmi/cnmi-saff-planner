/* CNMI Staff Planner V531 — Fractional HR Unit + Strict Sidebar Accordion Freeze Fix
   - Plain sidebar navigation collapses all open tree branches.
   - Only one top-level tree stays open at a time, including OT tree vs other trees.
   - Leaving OT closes the nested Admin-extra subtree.
   - Version/UI hotfix only; fractional-unit calculation lives in V527/V318 patches.
*/
(function(){
  'use strict';
  if(window.__CNMI_V531_FRACTIONAL_HR_UNIT_ACCORDION__) return;
  window.__CNMI_V531_FRACTIONAL_HR_UNIT_ACCORDION__=true;
  const VERSION='V531_FRACTIONAL_HR_UNIT_ACCORDION_FREEZE_FIX';
  const OPEN_KEY='cnmi-sidebar-tree-open-id';
  const EXTRA_KEY='cnmi-v528-admin-extra-open';

  function setOpen(id){try{if(id)sessionStorage.setItem(OPEN_KEY,id);else sessionStorage.removeItem(OPEN_KEY);}catch(_){} }
  function setExtra(v){try{sessionStorage.setItem(EXTRA_KEY,v?'1':'0');}catch(_){} }
  function closeOtExtra(){
    setExtra(false);
    const branch=document.querySelector('[data-v528-extra-tree]');
    branch?.querySelector('[data-v528-extra-toggle]')?.setAttribute('aria-expanded','false');
    const sub=branch?.querySelector('[data-v528-extra-submenu]');
    sub?.classList.remove('open');sub?.setAttribute('aria-hidden','true');
  }
  function collapseAll(except=''){
    const ot=document.querySelector('.v523-nav-tree');
    if(except!=='ot'&&ot){
      ot.querySelector('.v523-nav-parent')?.setAttribute('aria-expanded','false');
      const sub=ot.querySelector('.v523-nav-submenu');sub?.classList.remove('open');sub?.setAttribute('aria-hidden','true');
      closeOtExtra();
    }
    document.querySelectorAll('.v524-nav-tree').forEach(tree=>{
      const id=`v524:${tree.dataset.v524Tree||''}`;
      if(id===except)return;
      tree.querySelector('.v524-nav-parent')?.setAttribute('aria-expanded','false');
      const sub=tree.querySelector('.v524-nav-submenu');sub?.classList.remove('open');sub?.setAttribute('aria-hidden','true');
    });
  }
  function announce(id){setOpen(id);collapseAll(id);try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id}}));}catch(_){} }

  document.addEventListener('click',function(e){
    const otToggle=e.target?.closest?.('[data-v523-submenu-toggle]');
    if(otToggle){
      const willOpen=otToggle.getAttribute('aria-expanded')!=='true';
      if(willOpen)announce('ot');
      return;
    }
    const treeToggle=e.target?.closest?.('[data-v524-tree-toggle]');
    if(treeToggle){
      const id=`v524:${String(treeToggle.dataset.v524TreeToggle||'')}`;
      const willOpen=treeToggle.getAttribute('aria-expanded')!=='true';
      if(willOpen)announce(id);
      return;
    }
    const plain=e.target?.closest?.('#mainNav .nav-btn[data-page]');
    if(plain && !plain.closest('.v523-nav-tree,.v524-nav-tree')){
      setOpen('');collapseAll('');
      try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:`plain:${plain.dataset.page||''}`}}));}catch(_){}
    }
  },true);

  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    const id=String(e?.detail?.id||'');
    if(id!=='ot')closeOtExtra();
    collapseAll(id);
  });

  function decorateVersion(){
    const chip=document.querySelector('.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip) return;
    if(chip.textContent!=='v531') chip.textContent='v531';
    if(chip.title!=='V531 fractional HR unit + strict sidebar accordion freeze fix') chip.title='V531 fractional HR unit + strict sidebar accordion freeze fix';
    chip.classList.add('v530-version-chip','v531-version-chip');
  }
  /* V531 hotfix: do not observe sidebar-foot here. The former observer rewrote
     textContent inside its own callback and could trigger itself forever. */
  function start(){decorateVersion();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV531={version:VERSION,collapseAll};
  console.info(`[${VERSION}] loaded`);
})();
