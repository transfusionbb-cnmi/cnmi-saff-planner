/* CNMI Staff Planner V284 compatibility layer (revised in V286)
   - Keeps the Admin monthly position width improvements.
   - Removes the old synchronous capture handlers on the daily position page.
     Those handlers replaced the date input DOM during the native change event
     and could leave Safari/Chrome in a non-responsive state.
   Daily-page routing and interaction recovery are now owned by V286.
*/
(function(){
  'use strict';
  const VERSION='V284_WIDTH_COMPAT_REVISED_V286';
  if(window.__CNMI_V284_DAILY_POSITION_INTERACTION_AND_WIDTH_FIX__) return;
  window.__CNMI_V284_DAILY_POSITION_INTERACTION_AND_WIDTH_FIX__=true;

  let monthlyQueued=false;
  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}}
  function isAdminMonthPage(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}

  function enhanceMonthlyWidths(){
    if(!isAdminMonthPage()) return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(!page||!wrap) return;
    page.classList.add('v284-position-width-fix');
    wrap.classList.add('v284-position-width-wrap');
    wrap.querySelectorAll('[data-v275-position-select],[data-v275-mentor-select]').forEach(select=>{
      const option=select.options?.[select.selectedIndex];
      select.title=option?.textContent?.trim()||select.value||'เลือกตำแหน่ง';
    });
  }
  function queueMonthlyEnhance(){
    if(monthlyQueued||!isAdminMonthPage()) return;
    monthlyQueued=true;
    requestAnimationFrame(()=>{monthlyQueued=false;enhanceMonthlyWidths();});
  }

  const style=document.createElement('style');
  style.id='v284-daily-position-interaction-and-width-style';
  style.textContent=`
    #modal.hidden,.modal.hidden{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
    #modal.hidden *,.modal.hidden *{pointer-events:none!important}

    .v284-position-width-fix .v284-position-width-wrap{--v284-day-width:148px}
    .v284-position-width-fix .v275-position-table tr>th:nth-child(n+3),
    .v284-position-width-fix .v275-position-table tr>td:nth-child(n+3){
      width:var(--v284-day-width)!important;min-width:var(--v284-day-width)!important;max-width:var(--v284-day-width)!important
    }
    .v284-position-width-fix .v275-count-row>td:nth-child(n+3){white-space:nowrap!important;overflow:visible!important;font-size:9px!important;padding:2px 5px!important}
    .v284-position-width-fix .v275-count-row input[data-v275-slot]{width:40px!important;min-width:40px!important;max-width:40px!important;height:23px!important;padding:1px 4px!important;font-size:9px!important}
    .v284-position-width-fix .v275-position-cell select,
    .v284-position-width-fix .v275-mentor-cell select{width:100%!important;min-width:0!important;height:24px!important;min-height:24px!important;padding:1px 22px 1px 6px!important;font-size:9px!important;line-height:22px!important;text-overflow:clip!important;white-space:nowrap!important}
    .v284-position-width-fix .v275-position-table tbody tr:not(.v275-count-row)>th,
    .v284-position-width-fix .v275-position-table tbody tr:not(.v275-count-row)>td,
    .v284-position-width-fix .v275-position-day{height:29px!important;min-height:29px!important;max-height:29px!important}
    .v284-position-width-fix .v275-position-cell{height:25px!important;min-height:25px!important}
    @media(max-width:820px){
      .v284-position-width-fix .v284-position-width-wrap{--v284-day-width:136px}
      .v284-position-width-fix .v275-position-cell select,
      .v284-position-width-fix .v275-mentor-cell select{font-size:8.5px!important}
    }
  `;
  document.head.appendChild(style);

  try{
    const root=document.getElementById('pageContent')||document.documentElement;
    const observer=new MutationObserver(queueMonthlyEnhance);
    observer.observe(root,{childList:true,subtree:true});
    window.__CNMI_V284_OBSERVER__=observer;
  }catch(_){}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(queueMonthlyEnhance,80));
  setTimeout(queueMonthlyEnhance,0);
  setTimeout(queueMonthlyEnhance,400);
  window.cnmiV284={enhanceMonthlyWidths};
  console.info(`${VERSION} loaded`);
})();
