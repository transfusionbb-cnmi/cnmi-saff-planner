/* CNMI Staff Planner V276
   Sticky and compact monthly matrices
   - Freeze columns 1-2 in Staff/Admin monthly daytime-position tables
   - Show only BB / Donor in the regular staff summary column
   - Freeze column 1 in the Admin monthly roster table
*/
(function(){
  'use strict';
  const VERSION = 'V276_STICKY_COMPACT_COLUMNS';
  if (window.__CNMI_V276_STICKY_COMPACT_COLUMNS__) return;
  window.__CNMI_V276_STICKY_COMPACT_COLUMNS__ = true;

  function updateStickyOffsets(){
    document.querySelectorAll('.v275-position-wrap').forEach((wrap)=>{
      const firstHeader = wrap.querySelector('.v275-position-table thead tr > :first-child');
      if (!firstHeader) return;
      const width = Math.max(72, Math.ceil(firstHeader.getBoundingClientRect().width || firstHeader.offsetWidth || 88));
      wrap.style.setProperty('--v276-position-name-width', `${width}px`);
    });
  }

  let queued = false;
  function queueUpdate(){
    if (queued) return;
    queued = true;
    requestAnimationFrame(()=>{
      queued = false;
      updateStickyOffsets();
    });
  }

  const style = document.createElement('style');
  style.id = 'v276-sticky-compact-columns-style';
  style.textContent = `
    /* Keep sticky cells in their own paint layer. */
    .v275-position-wrap,
    .v275-roster-wrap{
      position:relative!important;
      isolation:isolate;
      -webkit-overflow-scrolling:touch;
    }

    /* Staff + Admin monthly daytime-position matrix: freeze columns 1 and 2. */
    .v275-position-wrap{
      --v276-position-name-width:88px;
    }
    .v275-position-table{
      table-layout:auto;
    }
    .v275-position-table tr > :nth-child(1){
      position:sticky!important;
      left:0!important;
      width:88px!important;
      min-width:88px!important;
      max-width:88px!important;
      z-index:20!important;
      background-clip:padding-box!important;
    }
    .v275-position-table tr > :nth-child(2){
      position:sticky!important;
      left:var(--v276-position-name-width)!important;
      width:118px!important;
      min-width:118px!important;
      max-width:118px!important;
      z-index:19!important;
      background:#fff!important;
      background-clip:padding-box!important;
      box-shadow:3px 0 5px rgba(15,23,42,.12)!important;
    }
    .v275-position-table thead tr > :nth-child(1){
      z-index:32!important;
      background:#f8fafc!important;
      color:#0f172a!important;
    }
    .v275-position-table thead tr > :nth-child(2){
      z-index:31!important;
      background:#f8fafc!important;
    }
    .v275-position-table .v275-count-row > :nth-child(1){
      z-index:27!important;
      background:#fffaf0!important;
    }
    .v275-position-table .v275-count-row > :nth-child(2){
      z-index:26!important;
      background:#fffaf0!important;
    }

    /* Regular summary becomes one compact line: BB x · Donor y. */
    .v275-summary-cell{
      display:block!important;
      min-height:0!important;
      line-height:1.2!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      padding:1px 2px!important;
    }
    .v275-summary-cell > b{
      display:block!important;
      font-size:9px!important;
      line-height:1.2!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    .v275-summary-cell > span,
    .v275-summary-cell > small{
      display:none!important;
    }
    .v275-position-table tbody tr:not(.v275-count-row) > th,
    .v275-position-table tbody tr:not(.v275-count-row) > td{
      height:40px!important;
    }
    .v275-position-day{
      height:40px!important;
    }

    /* Admin monthly roster: freeze the staff-name column. */
    .v275-roster-table tr > :first-child{
      position:sticky!important;
      left:0!important;
      width:82px!important;
      min-width:82px!important;
      max-width:82px!important;
      z-index:22!important;
      background-clip:padding-box!important;
      box-shadow:3px 0 5px rgba(15,23,42,.12)!important;
    }
    .v275-roster-table thead tr > :first-child{
      z-index:34!important;
      background:#f8fafc!important;
      color:#0f172a!important;
    }

    @media(max-width:820px){
      .v275-position-wrap{
        --v276-position-name-width:76px;
      }
      .v275-position-table tr > :nth-child(1){
        width:76px!important;
        min-width:76px!important;
        max-width:76px!important;
      }
      .v275-position-table tr > :nth-child(2){
        width:104px!important;
        min-width:104px!important;
        max-width:104px!important;
      }
      .v275-position-table .v275-sticky-name b{
        font-size:9px!important;
      }
      .v275-summary-cell > b{
        font-size:8px!important;
      }
      .v275-roster-table tr > :first-child{
        width:72px!important;
        min-width:72px!important;
        max-width:72px!important;
      }
    }
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(queueUpdate);
  observer.observe(document.documentElement, {subtree:true, childList:true});
  window.addEventListener('resize', queueUpdate, {passive:true});
  window.addEventListener('orientationchange', queueUpdate, {passive:true});
  setTimeout(queueUpdate, 0);
  setTimeout(queueUpdate, 150);
  setTimeout(queueUpdate, 600);

  console.info(`${VERSION} loaded`);
})();
