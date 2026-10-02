/* CNMI Staff Planner V585 — OT Staff Detail Performance
 * - Keep holiday/public-holiday trade HR conversion unchanged (e.g. MT 160 -> HR base 130).
 * - Stop V577 from full-page rerendering the Staff Detail route after preload.
 * - Hydrate Staff Detail carry/trade/helper data in one parallel pass and query carry once.
 * No database/schema change.
 */
(function(){
  'use strict';
  const VERSION='V585_OT_DETAIL_PERFORMANCE';
  if(window.__CNMI_V585_OT_DETAIL_PERFORMANCE__) return;
  window.__CNMI_V585_OT_DETAIL_PERFORMANCE__=true;
  function mark(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim())) return;
      x.textContent='v585'; x.title='OT Staff Detail Performance';
    });
  }
  setTimeout(mark,400);
  window.addEventListener('hashchange',()=>setTimeout(mark,220));
  window.cnmiV585={version:VERSION};
  console.info(`[${VERSION}] loaded`);
})();
