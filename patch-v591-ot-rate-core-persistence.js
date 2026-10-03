/* CNMI Staff Planner V591 — OT rate override core persistence
 * Core fix lives in app-v545 V191 save + bundled V221 correctedOtRow.
 * This patch only exposes a tiny verifier and version marker.
 */
(function(){
  'use strict';
  const VERSION='V591_OT_RATE_CORE_PERSISTENCE';
  if(window.__CNMI_V591_OT_RATE_CORE_PERSISTENCE__) return;
  window.__CNMI_V591_OT_RATE_CORE_PERSISTENCE__=true;
  function rateToken(row){
    const m=String(`${row?.note||''} ${row?.device||''}`).match(/\[OT_RATE_TYPE=(MT|CLERK)\]/i);
    return m?String(m[1]).toUpperCase():'';
  }
  function mark(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(x&&/^v\d+/i.test(String(x.textContent||'').trim())){x.textContent='v591';x.title='OT rate override core persistence';}
    });
  }
  setTimeout(mark,120);
  window.addEventListener('pageshow',()=>setTimeout(mark,120));
  window.addEventListener('hashchange',()=>setTimeout(mark,100));
  window.cnmiV591={version:VERSION,rateToken};
  console.info(`[${VERSION}] loaded`);
})();
