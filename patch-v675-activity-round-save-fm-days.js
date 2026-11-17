/* CNMI Staff Planner v675 — show saved session assignments in activity results
   and Dashboard. The actual save and FM day-count fixes are inside the existing
   patch-v396-training-integrated.js (updated in this release).
   No DOM MutationObserver and no database migration. */
(function(){
  'use strict';
  if(window.__CNMI_V675_ACTIVITY_ROUNDS_VISIBLE__)return;
  window.__CNMI_V675_ACTIVITY_ROUNDS_VISIBLE__=true;
  const safe=value=>String(value??'');
  const esc=value=>safe(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function stateNow(){return window.state||{};}
  function rowIndex(){
    const s=stateNow();
    const m=new Map();
    for(const row of [...(s.activities||[]),...(s.activityListRowsV398||[])])if(row?.id!=null)m.set(String(row.id),row);
    return m;
  }
  function staffName(id){
    const person=(stateNow().staff||[]).find(x=>String(x?.id)===String(id));
    return safe(person?.nickname||person?.full_name||id);
  }
  function sessions(row){
    try{return window.cnmiActivitySessionsV654?.parse?.(row)||null;}
    catch(err){console.warn('v675 session summary',err);return null;}
  }
  function markup(rows){
    const lines=rows.map((round,i)=>{
      const members=(round.staff_ids||[]).map(staffName).join(', ');
      const when=safe(round.start)+'–'+safe(round.end)+' น.';
      return `<div class="v675-round-line"><strong>รอบที่ ${i+1} · ${esc(when)}</strong><span>${esc(members||'-')}</span></div>`;
    }).join('');
    return `<section class="v675-round-summary" aria-label="รายละเอียดรอบกิจกรรมที่บันทึกแล้ว"><div class="v675-round-summary-head">แบ่ง ${rows.length} รอบ · ผู้เข้าร่วมตามเวลาจริง</div>${lines}</section>`;
  }
  function decorate(html,cardSelector,attribute,insertSelector){
    if(typeof html!=='string'||!html.includes(cardSelector.slice(1)))return html;
    const m=rowIndex();
    if(![...m.values()].some(row=>sessions(row)!==null))return html;
    const template=document.createElement('template');template.innerHTML=html;
    template.content.querySelectorAll(cardSelector).forEach(card=>{
      const row=m.get(safe(card.getAttribute(attribute)));
      const rounds=row&&sessions(row);
      if(!rounds?.length||card.querySelector('.v675-round-summary'))return;
      const anchor=card.querySelector(insertSelector);
      const slot=document.createElement('template');slot.innerHTML=markup(rounds);
      if(anchor)anchor.before(slot.content);else card.appendChild(slot.content);
    });
    return template.innerHTML;
  }
  const oldActivities=window.renderActivitiesPage||(typeof renderActivitiesPage==='function'?renderActivitiesPage:null);
  if(typeof oldActivities==='function'){
    const wrapped=function renderActivitiesPageV675(){
      return decorate(oldActivities.apply(this,arguments),'.activity-row-card','data-v487-activity-id','.actions');
    };
    try{window.renderActivitiesPage=renderActivitiesPage=wrapped;}
    catch(_){window.renderActivitiesPage=wrapped;}
  }
  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV675(){
      return decorate(oldDashboard.apply(this,arguments),'.v518-dashboard-activity','data-v518-activity-id','.v518-activity-meta');
    };
    try{window.renderDashboard=renderDashboard=wrapped;}
    catch(_){window.renderDashboard=wrapped;}
  }
  const style=document.createElement('style');
  style.id='v675-activity-round-summary-style';
  style.textContent=`
    .v675-round-summary{padding:9px 11px;margin:10px 0;border:1px solid #b6dff5;border-radius:10px;background:#f2faff;font-size:12px;color:#28465c}
    .v675-round-summary-head{font-weight:700;margin-bottom:5px;color:#126a9c}
    .v675-round-line{display:grid;grid-template-columns:minmax(125px,.46fr) minmax(0,1fr);gap:8px;padding:4px 0;border-top:1px solid #e1eef7;overflow-wrap:anywhere}
    .v675-round-line strong{font-weight:700}.v675-round-line span{min-width:0}
    @media(max-width:620px){.v675-round-line{grid-template-columns:1fr;gap:2px}}
  `;
  document.head.appendChild(style);
  console.info('[V675_ACTIVITY_ROUND_SAVE_FM_HALFDAY] loaded');
})();
