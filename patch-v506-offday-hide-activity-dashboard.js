/* CNMI Staff Planner V506
 * Weekend / public-holiday Dashboard cleanup.
 * - Hide the "กิจกรรมวันนี้ / กิจกรรม" summary/detail card on Saturday, Sunday and public holidays.
 * - Keep weekday Dashboard unchanged.
 * - Let the holiday manpower card use the freed width when applicable.
 * - Display-only; no SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V506_OFFDAY_HIDE_ACTIVITY_DASHBOARD';
  if(window.__CNMI_V506_OFFDAY_HIDE_ACTIVITY_DASHBOARD__)return;
  window.__CNMI_V506_OFFDAY_HIDE_ACTIVITY_DASHBOARD__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(todayStr());}
    catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function isWeekendSafe(date){
    try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}
    catch(_){return false;}
  }
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function isOffDay(date){
    try{
      const api=window.cnmiDashboardHolidayManpowerV440;
      if(api&&typeof api.isOffDay==='function')return !!api.isOffDay(date);
    }catch(_){ }
    return isWeekendSafe(date)||isHolidaySafe(date);
  }
  function text(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim();}
  function isActivityStat(card){
    const label=text(card?.querySelector?.('.label'));
    return label==='กิจกรรมวันนี้'||label==='กิจกรรม'||label.includes('กิจกรรมวันนี้');
  }
  function isActivityCard(card){
    const title=text(card?.querySelector?.('.section-title h3')||card?.querySelector?.('h3'));
    return title==='กิจกรรมวันนี้'||title==='กิจกรรม'||title.includes('กิจกรรมวันนี้');
  }
  function cleanOffday(html){
    const date=selectedDate();
    if(!isOffDay(date))return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'');
      let removed=false;

      tpl.content.querySelectorAll('.v401-dashboard-stats').forEach(stats=>{
        [...stats.querySelectorAll(':scope > .stat-card')].forEach(card=>{
          if(isActivityStat(card)){card.remove();removed=true;}
        });
        stats.classList.add('v506-offday-no-activity');
      });

      [...tpl.content.querySelectorAll('.card')].forEach(card=>{
        if(isActivityCard(card)){card.remove();removed=true;}
      });

      // Defensive cleanup for legacy activity card class if the title was changed by another patch.
      tpl.content.querySelectorAll('.v401-dashboard-activity-card').forEach(card=>{card.remove();removed=true;});

      if(removed){
        tpl.content.querySelectorAll('.v401-dashboard-stats').forEach(stats=>stats.classList.add('v506-offday-no-activity'));
      }

      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){
      console.warn('[V506] off-day activity cleanup fallback',err);
      return html;
    }
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV506(){return cleanOffday(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v506-offday-hide-activity-dashboard';
  style.textContent=`
    .v401-dashboard-stats.v506-offday-no-activity>[data-v440-holiday-manpower],
    .v401-dashboard-stats.v506-offday-no-activity>[data-v433-manpower]{grid-column:1/-1!important}
  `;
  document.head.appendChild(style);

  window.cnmiV506={version:VERSION,isOffDay,selectedDate,cleanOffday};
  console.info(`${VERSION} loaded`);
})();
