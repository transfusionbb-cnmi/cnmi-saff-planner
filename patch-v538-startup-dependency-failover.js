/* CNMI Staff Planner V538 — startup dependency failover UI marker */
(function(){
  'use strict';
  if(window.__CNMI_V538_STARTUP_DEPENDENCY_UI__) return;
  window.__CNMI_V538_STARTUP_DEPENDENCY_UI__=true;
  const VERSION='V538_STARTUP_CDN_FAILOVER';
  function decorate(){
    const chip=document.querySelector('.v537-version-chip,.v536-version-chip,.v535-version-chip,.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip) return;
    if(chip.textContent!=='v538') chip.textContent='v538';
    if(chip.title!=='Startup CDN failover + non-blocking optional libraries') chip.title='Startup CDN failover + non-blocking optional libraries';
    chip.classList.add('v538-version-chip');
  }
  function start(){
    decorate();
    const foot=document.querySelector('.sidebar-foot');
    if(foot) new MutationObserver(decorate).observe(foot,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','title']});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  window.cnmiV538={version:VERSION};
})();
