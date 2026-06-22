/* CNMI Staff Planner V293
   Monthly daytime-position Admin cleanup and full-height matrix.
   - Removes the drag-position pool and old explanatory notice.
   - Removes the matrix's internal vertical viewport; the page shows every staff row.
   - Keeps horizontal scrolling for the long month table.
   - Summary classification is corrected in V275/V278/V290 to use the actual date and code.
*/
(function(){
  'use strict';
  const VERSION='V293_POSITION_MONTH_ADMIN_CLEAN_FULL_SUMMARY_FIX';
  if(window.__CNMI_V293_POSITION_MONTH_ADMIN_CLEAN_FULL_SUMMARY_FIX__)return;
  window.__CNMI_V293_POSITION_MONTH_ADMIN_CLEAN_FULL_SUMMARY_FIX__=true;

  let queued=false;
  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}}
  function isTarget(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}
  function apply(){
    if(!isTarget())return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(!page||!wrap)return;
    page.classList.add('v293-position-month-admin');
    wrap.classList.add('v293-position-month-full');
    page.querySelectorAll('.v275-position-pool').forEach(node=>node.remove());
    page.querySelectorAll('.notice.soft-notice').forEach(node=>{
      if(String(node.textContent||'').includes('ไม่แสดง')&&String(node.textContent||'').includes('ไม่รับเวร'))node.remove();
    });
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }

  const style=document.createElement('style');
  style.id='v293-position-month-admin-style';
  style.textContent=`
    .v293-position-month-admin .v275-position-pool{display:none!important}
    .v293-position-month-admin .v293-position-month-full,
    .v293-position-month-admin .v291-position-month-wrap,
    .v293-position-month-admin .v281-compact-position-wrap,
    body.v277-contained-table-page .v293-position-month-admin .v277-table-scroller.v275-position-wrap{
      height:auto!important;
      min-height:0!important;
      max-height:none!important;
      overflow-x:auto!important;
      overflow-y:visible!important;
      scrollbar-gutter:auto!important;
      overscroll-behavior-x:contain!important;
      overscroll-behavior-y:auto!important;
      touch-action:pan-x pan-y!important;
      will-change:auto!important;
    }
  `;
  document.head.appendChild(style);

  const root=document.getElementById('pageContent')||document.body;
  new MutationObserver(mutations=>{
    if(!isTarget())return;
    const structural=mutations.some(m=>Array.from(m.addedNodes||[]).some(node=>node?.nodeType===1&&(node.matches?.('.v275-page,.v275-position-wrap,.v275-position-pool,.soft-notice')||node.querySelector?.('.v275-position-wrap,.v275-position-pool,.soft-notice'))));
    if(structural)queue();
  }).observe(root,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,40),{once:true});
  setTimeout(apply,0);setTimeout(apply,160);setTimeout(apply,500);

  window.cnmiV293={apply,version:VERSION};
  console.info(`${VERSION} loaded`);
})();
