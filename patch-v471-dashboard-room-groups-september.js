/* CNMI Staff Planner V471
 * Dashboard daytime positions: real work-room grouping effective 1 Sep 2026.
 * - Sep 2026 onward: Specimen & Issue / Blood Bank / Component Prep / Donor Room.
 * - Aug 2026 and earlier keep the previous Dashboard grouping for historical continuity.
 * - Reuses the exact assigned position rows already rendered; display only.
 * - Position popup room badge follows the same room grouping from Sep 2026 onward.
 * - No Supabase schema/data changes.
 */
(function(){
  'use strict';
  const VERSION='V471_DASHBOARD_ROOM_GROUPS_SEPTEMBER';
  const EFFECTIVE='2026-09-01';
  if(window.__CNMI_V471_DASHBOARD_ROOM_GROUPS_SEPTEMBER__) return;
  window.__CNMI_V471_DASHBOARD_ROOM_GROUPS_SEPTEMBER__=true;

  const GROUPS=[
    {id:'specimen-issue',label:'Specimen & Issue',thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank',label:'Blood Bank',thai:'ตรวจ Donor / Immunohematology และเคสยาก'},
    {id:'component-prep',label:'Component Prep',thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room',label:'Donor Room',thai:'ห้องบริจาคโลหิต'},
    {id:'other',label:'อื่นๆ',thai:'ตำแหน่งอื่น'}
  ];
  const byId=id=>GROUPS.find(g=>g.id===id)||GROUPS[GROUPS.length-1];

  function text(v){return String(v==null?'':v).trim();}
  function normDate(v){return text(v).slice(0,10);}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(typeof todayStr==='function'?todayStr():'');}catch(_){return normDate(new Date().toISOString());}
  }
  function isNew(date){const d=normDate(date);return !!d&&d>=EFFECTIVE;}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function roomGroup(code){
    try{const g=window.cnmiV470?.roomGroup?.(code);if(g)return g;}catch(_){ }
    const raw=text(code),k=raw.toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');
    if(/^dr-/i.test(raw))return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2')return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4')return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport')return 'specimen-issue';
    if(/^bb-/i.test(raw))return 'specimen-issue';
    return 'other';
  }
  function rowsFor(date){try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}}
  function isVacant(item){return !!item?.querySelector?.('.v434-vacant-pill')||item?.classList?.contains('is-vacant');}
  function isOnLeave(item){return !!item?.classList?.contains('v445-has-leave');}

  function buildGroup(groupId,entries){
    const g=byId(groupId);
    const total=entries.length;
    const assigned=entries.filter(x=>!isVacant(x.item)).length;
    const ready=entries.filter(x=>!isVacant(x.item)&&!isOnLeave(x.item)).length;
    const section=document.createElement('section');
    section.className='v434-zone-group v471-room-group';
    section.dataset.v471Group=groupId;
    section.innerHTML=`<div class="v434-zone-head v471-room-head"><div class="v471-room-title"><b>${g.label}</b><small>${g.thai}</small></div><span class="v445-zone-count"><b>พร้อม ${ready}/${total}</b><small>จัด ${assigned}/${total}</small></span></div><div class="v434-position-grid"></div>`;
    const grid=section.querySelector('.v434-position-grid');
    entries.forEach(x=>grid.appendChild(x.item));
    return section;
  }

  function decorateCard(card,date){
    if(!card||!isNew(date))return;
    if(card.dataset.v471Date===date)return;
    const rows=rowsFor(date);
    const items=Array.from(card.querySelectorAll('.v434-position-item'));
    if(!rows.length||!items.length)return;

    // Preserve the exact rendered item (leave/HR/status decorations included) and regroup only its container.
    const entries=[];
    items.forEach((item,index)=>{
      const row=rows[index];
      if(!row)return;
      entries.push({item,row,group:roomGroup(codeOf(row))});
    });
    if(!entries.length)return;

    const holder=card.querySelector('.v434-groups');
    if(!holder)return;
    holder.innerHTML='';
    GROUPS.forEach(g=>{
      const list=entries.filter(x=>x.group===g.id);
      if(list.length)holder.appendChild(buildGroup(g.id,list));
    });
    card.dataset.v471Date=date;
    card.dataset.v471DashboardRooms='1';

    const title=card.querySelector('.v434-title .hint');
    if(title&&!card.querySelector('.v471-effective-note')){
      const note=document.createElement('span');
      note.className='v471-effective-note';
      note.textContent='จัดตามห้องจริง';
      note.title='ใช้โครงสร้างห้องใหม่ตั้งแต่ 1 ก.ย. 2569';
      title.insertAdjacentElement('afterend',note);
    }
  }

  function decorateDashboard(root=document,date=selectedDate()){
    if(!isNew(date))return;
    root.querySelectorAll?.('[data-v434-daytime-positions]').forEach(card=>decorateCard(card,date));
  }

  function decorateHtml(html){
    const date=selectedDate();
    if(!isNew(date))return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decorateDashboard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] HTML decoration skipped`,err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV471(){return decorateHtml(String(oldDashboard.apply(this,arguments)||''));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function popupCode(modal){return text(modal?.querySelector?.('.v435-modal-heading h2')?.textContent);}
  function decoratePositionPopup(date){
    if(!isNew(date))return;
    document.querySelectorAll('.v435-position-summary-modal,.v435-position-full-modal').forEach(modal=>{
      const d=normDate(modal.dataset.v435Date)||date;
      if(!isNew(d))return;
      const badge=modal.querySelector('.v435-zone-badge');
      const code=popupCode(modal);
      if(!badge||!code)return;
      const g=byId(roomGroup(code));
      badge.textContent=g.label;
      badge.title=g.thai;
      badge.dataset.v471Group=g.id;
    });
  }

  let queued=false;
  function queue(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;const d=selectedDate();decorateDashboard(document,d);decoratePositionPopup(d);});
  }
  document.addEventListener('DOMContentLoaded',queue,{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});

  const style=document.createElement('style');
  style.id='cnmi-v471-dashboard-room-groups-september';
  style.textContent=`
    .v471-effective-note{display:inline-flex;margin-left:6px;padding:2px 6px;border-radius:999px;background:#eef5fb;color:#587087;font-size:9px;font-weight:800;vertical-align:middle}
    .v471-room-head{align-items:flex-start!important}
    .v471-room-title{min-width:0;display:flex;flex-direction:column;gap:2px}
    .v471-room-title b{font-size:12px!important;color:#2c4a65}
    .v471-room-title small{font-size:8.5px;color:#7b8fa3;font-weight:650;line-height:1.2}
    .v471-room-group[data-v471-group="specimen-issue"]{border-top:3px solid #60a5fa;background:#f8fbff}
    .v471-room-group[data-v471-group="blood-bank"]{border-top:3px solid #f59e0b;background:#fffdf8}
    .v471-room-group[data-v471-group="component-prep"]{border-top:3px solid #8b5cf6;background:#fcfaff}
    .v471-room-group[data-v471-group="donor-room"]{border-top:3px solid #22c55e;background:#f9fefb}
    .v471-room-group[data-v471-group="other"]{border-top:3px solid #94a3b8}
    .v435-zone-badge[data-v471-group="specimen-issue"]{background:#eef6ff;border-color:#bfdbfe;color:#2563a6}
    .v435-zone-badge[data-v471-group="blood-bank"]{background:#fff8e8;border-color:#fde68a;color:#9a6200}
    .v435-zone-badge[data-v471-group="component-prep"]{background:#f7f0ff;border-color:#ddd6fe;color:#6d42ad}
    .v435-zone-badge[data-v471-group="donor-room"]{background:#eefaf2;border-color:#bbf7d0;color:#23814a}
    @media(max-width:820px){
      .v471-room-title b{font-size:13px!important}.v471-room-title small{font-size:9px}
      .v471-effective-note{font-size:8.5px}
    }
  `;
  document.head.appendChild(style);

  window.cnmiV471={version:VERSION,effectiveDate:EFFECTIVE,roomGroup,decorateDashboard};
  console.info(`[${VERSION}] loaded; effective ${EFFECTIVE}`);
})();
