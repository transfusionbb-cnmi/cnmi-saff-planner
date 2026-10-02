/* CNMI Staff Planner V580 — Staff Detail Trade Recalculation Core Fix */
(function(){
  'use strict';
  if(window.__CNMI_V580__)return; window.__CNMI_V580__=true;
  function mark(){document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{if(/^v\d+/i.test(String(x.textContent||'').trim())){x.textContent='v580';x.title='Staff Detail Trade Recalculation Core Fix';}})}
  mark(); setTimeout(mark,300); setTimeout(mark,1200); window.addEventListener('hashchange',()=>setTimeout(mark,250));
  new MutationObserver(()=>mark()).observe(document.documentElement,{subtree:true,childList:true});
  console.info('[V580] Staff detail trade recalculation core fix loaded');
})();
