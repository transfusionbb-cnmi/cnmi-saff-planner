/* CNMI Staff Planner V291
   Monthly daytime-position rendering and scroll performance.
   - Leave days keep the normal Admin position dropdown; Admin decides whether to assign or leave blank.
   - Removes the old "ขยายช่องตาราง" control and locks the matrix viewport height.
   - Reduces scroll-time layout/paint work and avoids mutation work for tiny save-status changes.
   - V290 background Supabase save remains authoritative; no SQL/schema change.
*/
(function(){
  'use strict';
  const VERSION='V291_POSITION_MONTH_ALWAYS_DROPDOWN_SMOOTH_SCROLL';
  if(window.__CNMI_V291_POSITION_MONTH_ALWAYS_DROPDOWN_SMOOTH_SCROLL__)return;
  window.__CNMI_V291_POSITION_MONTH_ALWAYS_DROPDOWN_SMOOTH_SCROLL__=true;

  let queued=false;
  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}}
  function isTarget(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}

  function apply(){
    if(!isTarget())return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(!page||!wrap)return;
    page.classList.add('v291-position-month-page');
    page.classList.remove('v281-relaxed');
    wrap.classList.add('v291-position-month-wrap');
    page.querySelectorAll('[data-v281-density]').forEach(button=>button.remove());
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }

  const style=document.createElement('style');
  style.id='v291-position-month-style';
  style.textContent=`
    .v291-position-month-page .v291-position-month-wrap{
      height:420px!important;
      min-height:420px!important;
      max-height:420px!important;
      overflow:auto!important;
      overflow-anchor:none!important;
      overscroll-behavior:contain!important;
      scroll-behavior:auto!important;
      scrollbar-gutter:stable!important;
      touch-action:pan-x pan-y!important;
      will-change:scroll-position;
      isolation:isolate;
    }
    .v291-position-month-page .v275-position-table{
      table-layout:fixed!important;
      border-collapse:separate!important;
      border-spacing:0!important;
    }
    .v291-position-month-page .v275-position-table td,
    .v291-position-month-page .v275-position-table th{
      background-clip:padding-box!important;
    }
    .v291-position-month-page .v275-sticky-summary{
      box-shadow:none!important;
      border-right:2px solid #cbd5e1!important;
    }
    .v291-position-month-page .v275-position-cell,
    .v291-position-month-page .v275-mentor-cell{
      contain:layout style!important;
    }
    .v291-position-month-page .v291-leave-dropdown{
      position:relative!important;
      background:#fff7ed!important;
    }
    .v291-position-month-page .v291-leave-dropdown::after{
      content:attr(data-v291-leave-label);
      position:absolute;
      z-index:3;
      top:1px;
      left:3px;
      max-width:calc(100% - 20px);
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      pointer-events:none;
      font-size:5.5px;
      line-height:7px;
      font-weight:700;
      color:#9a3412;
      background:rgba(255,247,237,.9);
      border-radius:3px;
      padding:0 2px;
    }
    .v291-position-month-page .v291-leave-dropdown .v275-position-cell select{
      padding-top:6px!important;
      line-height:14px!important;
    }
    .v291-position-month-page .v291-density-btn,
    .v291-position-month-page [data-v281-density]{display:none!important}

    @media(max-width:820px){
      .v291-position-month-page .v291-position-month-wrap{
        height:420px!important;
        min-height:420px!important;
        max-height:420px!important;
      }
    }
  `;
  document.head.appendChild(style);

  const root=document.getElementById('pageContent')||document.body;
  if(root){
    new MutationObserver(mutations=>{
      if(!isTarget())return;
      const structural=mutations.some(m=>Array.from(m.addedNodes||[]).some(node=>node?.nodeType===1&&(node.matches?.('.v275-page,.v275-position-wrap')||node.querySelector?.('.v275-position-wrap'))));
      if(structural)queue();
    }).observe(root,{childList:true,subtree:true});
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,50),{once:true});
  setTimeout(apply,0);
  setTimeout(apply,180);

  window.cnmiV291={apply,version:VERSION};
  console.info(`${VERSION} loaded`);
})();
