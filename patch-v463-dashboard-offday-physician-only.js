/* CNMI Staff Planner V463
 * Dashboard physician consult visibility on off-days + remove physician summary from monthly roster pages.
 *
 * 1) Dashboard:
 *    - Weekdays remain unchanged (Donor / Blood Bank / On-call).
 *    - Saturday / Sunday / public holiday always gets a Physician Consult card.
 *    - Off-day card shows one Donor & BB physician for 24 hours from the existing on-call schedule.
 *    - Physician name remains tappable for V455 phone popup; mobile uses V456-style card.
 * 2) Monthly roster pages:
 *    - Remove V462 physician monthly summary from both Staff monthly roster and Admin scheduler.
 *
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V463_DASHBOARD_OFFDAY_PHYSICIAN_ONLY';
  if(window.__CNMI_V463_DASHBOARD_OFFDAY_PHYSICIAN_ONLY__)return;
  window.__CNMI_V463_DASHBOARD_OFFDAY_PHYSICIAN_ONLY__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(todayStr());}
    catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function isOffDay(date){return isWeekendSafe(date)||isHolidaySafe(date);}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function versionText(m){
    const vals=[];
    for(const v of [m?.override?.version_label,m?.callBase?.version_label]){
      const s=String(v||'').trim();if(s&&!vals.includes(s))vals.push(s);
    }
    return vals.join(' · ');
  }
  function doctorButton(id,site,time){
    if(!id)return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" aria-label="ดูเบอร์โทร ${esc(staffName(id))}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(staffName(id))}</button>`;
  }
  function loadingCard(date){
    return `<div class="card v452-physician-card" data-v452-physician-card><div class="section-title"><h3>แพทย์ Consult</h3><span>${esc(thaiDate(date))}</span></div><div class="v452-loading">กำลังโหลดตารางแพทย์…</div></div>`;
  }
  function offdayCard(date){
    const api=window.cnmiPhysicianConsultV452;
    if(!api||api.cache?.unavailable)return '';
    if(!api.cache?.loaded){try{api.ensureLoaded?.();}catch(_){}return loadingCard(date);}
    const m=api.baseForDate?.(date)||{};
    const id=m?.combined||null,site='Donor & BB',time='24 ชม.',version=versionText(m);
    const btn=doctorButton(id,site,time);
    return `<div class="card v452-physician-card v463-offday-physician" data-v452-physician-card data-v463-offday-physician>
      <div class="section-title v452-card-head"><div><h3>แพทย์ Consult</h3><span>${esc(thaiDate(date))}</span></div><div class="v452-card-meta"><span class="v452-ready ${id?'is-complete':''}">พร้อม ${id?1:0}/1</span>${version?`<span class="v452-version">${esc(version)}</span>`:''}</div></div>
      <div class="v452-dashboard-table-wrap"><table class="v452-dashboard-table"><thead><tr><th>เวลา</th><th>จุด Consult</th><th>แพทย์</th></tr></thead><tbody><tr><td>${esc(time)}</td><td><b>${esc(site)}</b></td><td>${btn}</td></tr></tbody></table></div>
      <div class="v456-mobile-consult-list"><div class="v456-mobile-consult-row"><div class="v456-mobile-consult-top"><strong class="v456-mobile-consult-site">${esc(site)}</strong><span class="v456-mobile-consult-time">${esc(time)}</span></div><div class="v456-mobile-consult-doctor"><span class="v456-mobile-doctor-label">แพทย์</span>${id?btn.replace('v455-doctor-contact-btn"','v455-doctor-contact-btn v456-mobile-doctor-button"'):'<span class="v452-not-set v456-mobile-not-set">ยังไม่กำหนด</span>'}</div></div></div>
      ${m?.override?`<div class="v452-override-note">มีการแก้เฉพาะวันนี้${m.override.note?` · ${esc(m.override.note)}`:''}</div>`:''}
    </div>`;
  }
  function insertOffdayPhysician(html){
    const date=selectedDate();
    if(!isOffDay(date))return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      if(tpl.content.querySelector('[data-v452-physician-card]'))return html;
      const cardHtml=offdayCard(date);if(!cardHtml)return html;
      const t=document.createElement('template');t.innerHTML=cardHtml.trim();const card=t.content.firstElementChild;if(!card)return html;
      const manpower=tpl.content.querySelector('[data-v440-holiday-manpower]');
      if(manpower?.parentNode)manpower.parentNode.insertBefore(card,manpower.nextSibling);
      else{
        const cards=[...tpl.content.querySelectorAll('.card')];
        const roster=cards.find(c=>/^(เวรวันนี้|เวร)$/.test(String(c.querySelector('.section-title h3')?.textContent||'').trim()));
        if(roster?.parentNode)roster.parentNode.insertBefore(card,roster);
        else{
          const content=tpl.content.firstElementChild||tpl.content;
          content.appendChild(card);
        }
      }
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn('[V463] off-day physician insert',err);return html;}
  }
  function stripMonthlyPhysician(html){
    if(!String(html||'').includes('v462-physician-month-card'))return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      tpl.content.querySelectorAll('[data-v462-physician-month],.v462-physician-month-card').forEach(x=>x.remove());
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(_){return html;}
  }

  // Dashboard: V452 originally inserts before daytime positions; off-days have no daytime-position card.
  // This final wrapper guarantees the physician card still exists on those days.
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV463(){return insertOffdayPhysician(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // Staff monthly roster page: keep roster only.
  const previousMonthly=window.renderMonthlySchedulePage||(typeof renderMonthlySchedulePage==='function'?renderMonthlySchedulePage:null);
  if(typeof previousMonthly==='function'){
    const wrapped=function renderMonthlySchedulePageV463(){return stripMonthlyPhysician(previousMonthly.apply(this,arguments));};
    try{window.renderMonthlySchedulePage=renderMonthlySchedulePage=wrapped;}catch(_){window.renderMonthlySchedulePage=wrapped;}
  }

  // Admin monthly scheduler: V462 may inject into the live DOM after rendering; remove it after the chain returns.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV463(){
      const ret=previousRender.apply(this,arguments);
      try{
        if(['schedule','scheduler'].includes(String(S().page||''))){
          const root=document.getElementById('pageContent');
          root?.querySelectorAll?.('[data-v462-physician-month],.v462-physician-month-card')?.forEach?.(x=>x.remove());
        }
      }catch(_){ }
      return ret;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  // Fallback in case an older asynchronous V462 callback inserts the monthly card after a page render.
  const observer=new MutationObserver(()=>{
    try{
      if(!['schedule','scheduler'].includes(String(S().page||'')))return;
      document.getElementById('pageContent')?.querySelectorAll?.('[data-v462-physician-month],.v462-physician-month-card')?.forEach?.(x=>x.remove());
    }catch(_){ }
  });
  try{observer.observe(document.documentElement,{childList:true,subtree:true});}catch(_){ }

  const style=document.createElement('style');style.id='cnmi-v463-style';style.textContent=`
    .v462-physician-month-card,[data-v462-physician-month]{display:none!important}
    .v463-offday-physician{margin-top:14px;margin-bottom:14px}
  `;document.head.appendChild(style);

  window.cnmiV463={version:VERSION,offdayCard,stripMonthlyPhysician};
  console.info(`${VERSION} loaded`);
})();
