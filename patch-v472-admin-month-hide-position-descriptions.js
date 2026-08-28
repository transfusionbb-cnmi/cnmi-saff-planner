/* CNMI Staff Planner V472
 * Admin monthly daytime-position page: hide the long position-description section.
 * - Admin page (state.page === 'positionMonth'): hide "คำอธิบายตำแหน่งที่ใช้ในตาราง".
 * - Staff monthly view (state.page === 'positionMonthView'): keep it exactly as before.
 * - Display-only. No Supabase/data changes.
 */
(function(){
  'use strict';
  const VERSION='V472_ADMIN_MONTH_HIDE_POSITION_DESCRIPTIONS';
  const ROOT_CLASS='v472-admin-position-month';
  if(window.__CNMI_V472_ADMIN_MONTH_HIDE_POSITION_DESCRIPTIONS__) return;
  window.__CNMI_V472_ADMIN_MONTH_HIDE_POSITION_DESCRIPTIONS__=true;

  let queued=false;
  function S(){
    try{return state || window.state || null;}
    catch(_){return window.state || null;}
  }
  function apply(){
    queued=false;
    const adminMonth=String(S()?.page||'')==='positionMonth';
    document.documentElement.classList.toggle(ROOT_CLASS,adminMonth);
    // Accessibility / layout fallback in case an older browser has stale CSS.
    document.querySelectorAll?.('[data-v297-position-descriptions]').forEach(section=>{
      if(adminMonth){
        section.setAttribute('data-v472-admin-hidden','1');
        section.setAttribute('aria-hidden','true');
      }else if(section.getAttribute('data-v472-admin-hidden')==='1'){
        section.removeAttribute('data-v472-admin-hidden');
        section.removeAttribute('aria-hidden');
      }
    });
  }
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(apply);
  }

  const style=document.createElement('style');
  style.id='cnmi-v472-admin-month-hide-position-descriptions-style';
  style.textContent=`
    html.${ROOT_CLASS} [data-v297-position-descriptions],
    html.${ROOT_CLASS} .v297-position-description-card{
      display:none!important;
    }
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-page']});
  document.addEventListener('click',queue,true);
  document.addEventListener('change',queue,true);
  window.addEventListener('popstate',queue);
  window.addEventListener('hashchange',queue);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});
  queue();
  setTimeout(queue,120);
  setTimeout(queue,600);

  window.cnmiV472={version:VERSION,apply};
})();
