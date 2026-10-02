/* CNMI Staff Planner V573 — OT Admin Extra Submenu Navigation Hard Fix
 * Handles the three nested "ขอ OT เพิ่มแทนเจ้าหน้าที่" choices at WINDOW capture phase
 * before older document-level navigation handlers can restore a stale section.
 * Navigation only; no OT/HR calculation or database changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V573_OT_ADMIN_EXTRA_NAV__) return;
  window.__CNMI_V573_OT_ADMIN_EXTRA_NAV__=true;
  const VERSION='V573_OT_ADMIN_EXTRA_NAV';
  const VALID=new Set(['work','adjustment','activity']);
  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function month(){
    const s=S();
    const v=String(s.otMenuMonthV369||s.otSourceMonthV241||s.otMoneyMonthV241||'').slice(0,7);
    return /^\d{4}-\d{2}$/.test(v)?v:'';
  }
  function go(mode){
    if(!admin()||!VALID.has(mode)) return;
    const s=S();
    s.page='ot';
    s.otMenuV369='admin-extra';
    s.otGroupV522='ot';
    s.v527ExtraMode=mode;
    try{
      sessionStorage.setItem('cnmi-v528-admin-extra-mode',mode);
      sessionStorage.setItem('cnmi-v528-admin-extra-open','1');
      sessionStorage.setItem('cnmi-v523-ot-open','1');
      sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');
    }catch(_){ }
    const qs=new URLSearchParams();
    qs.set('section','request-extra');
    const m=month(); if(m) qs.set('month',m);
    qs.set('mode',mode);
    const target='#/ot?'+qs.toString();
    try{history.pushState({cnmiV573:true},'',target);}catch(_){location.hash=target;}
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){ }
    try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:'ot'}}));}catch(_){ }
    const sidebar=document.getElementById('sidebar');
    if(sidebar&&window.matchMedia('(max-width:820px)').matches){sidebar.classList.remove('open');document.body.classList.remove('sidebar-open');}
    setTimeout(()=>{
      try{
        if(String(location.hash||'')!==target) history.replaceState({cnmiV573:true},'',target);
        document.querySelectorAll('[data-v528-extra-mode]').forEach(b=>{
          const yes=b.dataset.v528ExtraMode===mode;
          b.classList.toggle('active',yes);b.setAttribute('aria-current',yes?'page':'false');
        });
      }catch(_){ }
    },0);
  }
  window.addEventListener('click',function(e){
    const btn=e.target?.closest?.('[data-v528-extra-mode]');
    if(!btn) return;
    const mode=String(btn.dataset.v528ExtraMode||'');
    if(!VALID.has(mode)||!admin()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    go(mode);
  },true);
  console.info('['+VERSION+'] loaded');
})();
