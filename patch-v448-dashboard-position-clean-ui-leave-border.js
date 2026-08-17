/* CNMI Staff Planner V448
 * Dashboard daytime-position cleanup.
 * - Hide the unused draft badge and Admin edit/jump button on the Dashboard card.
 * - Reconcile leave decoration so orange/yellow leave borders appear ONLY on the
 *   position whose assigned staff has an effective real leave on the selected date.
 * - Preserve the existing V434/V435 card layout, staff colors, info buttons,
 *   ready/leave summary, HR badge, and position-shortage text.
 * Display-only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V448_DASHBOARD_POSITION_CLEAN_UI_LEAVE_BORDER';
  if(window.__CNMI_V448_DASHBOARD_POSITION_CLEAN_UI_LEAVE_BORDER__)return;
  window.__CNMI_V448_DASHBOARD_POSITION_CLEAN_UI_LEAVE_BORDER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function isDashboard(){return String(S().page||'')==='dashboard';}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){return norm(S().dashboardDateV443);}
  }
  function text(v){return String(v==null?'':v).trim();}
  function key(v){return text(v).replace(/\s+/g,'').replace(/[–—]/g,'-').toLowerCase();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}

  function rowsFor(date){try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}}
  function zoneOf(row){try{return text(window.cnmiDashboardPositionsV434?.zoneOf?.(row))||text(row?.zone)||'อื่นๆ';}catch(_){return text(row?.zone)||'อื่นๆ';}}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function labelOf(row){
    const code=codeOf(row);
    try{if(typeof positionLabelForCell==='function')return text(positionLabelForCell(code))||code;}catch(_){ }
    try{if(typeof labelCode==='function')return text(labelCode(code))||code;}catch(_){ }
    return code;
  }
  function rowKey(row){return `${key(zoneOf(row))}|${key(labelOf(row)||codeOf(row))}`;}
  function itemLabel(item){
    const node=item?.querySelector?.('.v434-position-code');if(!node)return '';
    const clone=node.cloneNode(true);clone.querySelectorAll?.('.v435-info-mark').forEach(n=>n.remove());
    return text(clone.textContent);
  }
  function itemKey(item){
    const zone=text(item?.closest?.('.v434-zone-group')?.querySelector?.('.v434-zone-head b')?.textContent)||'อื่นๆ';
    return `${key(zone)}|${key(itemLabel(item))}`;
  }

  function inRange(row,date){const s=norm(row?.start_date),e=norm(row?.end_date||row?.start_date);return !!s&&s<=date&&e>=date;}
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!['cancelled','ยกเลิก'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;}}
  function realLeave(row){
    if(!row||!effective(row))return false;
    let t='';
    try{t=typeof leaveDisplayType==='function'?text(leaveDisplayType(row)):text(row?.type||row?.leave_type).split(':::')[0];}catch(_){t=text(row?.type||row?.leave_type).split(':::')[0];}
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveFor(staffId,date){
    if(!staffId)return null;
    return (S().leaves||[]).find(r=>String(r?.staff_id||'')===String(staffId)&&realLeave(r)&&inRange(r,date))||null;
  }
  function periodKind(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(/ครึ่งเช้า|morning/.test(raw))return 'morning';
    if(/ครึ่งบ่าย|afternoon/.test(raw))return 'afternoon';
    return 'full';
  }
  function periodLabel(row){const k=periodKind(row);return k==='morning'?'ลาครึ่งเช้า':k==='afternoon'?'ลาครึ่งบ่าย':'ลาทั้งวัน';}
  function shortageLabel(row){const k=periodKind(row);return k==='morning'?'⚠ ขาดช่วงเช้า':k==='afternoon'?'⚠ ขาดช่วงบ่าย':'⚠ ตำแหน่งขาด';}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function hrChecked(row){
    try{return typeof isLeaveHrChecked==='function'?!!isLeaveHrChecked(row?.id):(S().hrChecks||[]).some(h=>String(h?.leave_request_id||'')===String(row?.id||'')&&String(h?.status||'')==='ตรวจสอบแล้ว');}
    catch(_){return false;}
  }

  function clearLeaveState(item){
    item?.querySelectorAll?.('.v445-position-leave-meta').forEach(n=>n.remove());
    item?.classList?.remove('v445-has-leave','v445-half-leave','v445-full-leave');
    if(item){delete item.dataset.v448LeaveStaff;delete item.dataset.v448LeavePosition;}
  }
  function addLeaveState(item,leave,row){
    const kind=periodKind(leave);
    item.classList.add('v445-has-leave',kind==='full'?'v445-full-leave':'v445-half-leave');
    item.dataset.v448LeaveStaff=String(row?.staff_id||'');
    item.dataset.v448LeavePosition=String(codeOf(row)||labelOf(row));
    const meta=document.createElement('div');meta.className='v445-position-leave-meta';
    const hr=admin()?`<span class="v445-hr-pill ${hrChecked(leave)?'is-done':'is-pending'}">${hrChecked(leave)?'✓ ตรวจ HR แล้ว':'รอตรวจ HR'}</span>`:'';
    meta.innerHTML=`<div class="v445-position-status-line"><span class="v445-leave-pill">${esc(periodLabel(leave))}</span>${hr}</div><div class="v445-shortage-pill">${esc(shortageLabel(leave))}</div>`;
    item.appendChild(meta);
  }

  function cleanCard(root,date){
    const card=root?.querySelector?.('[data-v434-daytime-positions]');if(!card)return;

    // These controls are intentionally not used in the operational Dashboard.
    card.querySelectorAll('.v434-draft-badge,.v434-jump-btn').forEach(n=>n.remove());

    const items=[...card.querySelectorAll('.v434-position-item')];
    items.forEach(clearLeaveState);

    const rows=rowsFor(date);if(!rows.length)return;
    const rowMap=new Map();
    rows.forEach(row=>{const k=rowKey(row);if(k&&!rowMap.has(k))rowMap.set(k,row);});

    let assigned=0,leaveCount=0;
    const byZone=new Map();
    items.forEach(item=>{
      const row=rowMap.get(itemKey(item));if(!row)return;
      const sid=row?.staff_id||'';const zone=zoneOf(row)||'อื่นๆ';
      if(!byZone.has(zone))byZone.set(zone,{total:0,assigned:0,leave:0});
      const z=byZone.get(zone);z.total++;
      if(sid){assigned++;z.assigned++;}
      const leave=sid?leaveFor(sid,date):null;
      if(!leave)return;
      leaveCount++;z.leave++;addLeaveState(item,leave,row);
    });

    const summaries=card.querySelector('.v434-summary-badges');
    if(summaries){
      summaries.querySelectorAll('.v434-draft-badge,.v445-ready-badge,.v445-leave-count-badge').forEach(n=>n.remove());
      const complete=summaries.querySelector('.v434-complete-badge');
      if(complete&&/^ครบ\s/.test(text(complete.textContent)))complete.textContent=text(complete.textContent).replace(/^ครบ\s*/,'จัดครบ ');
      const ready=Math.max(0,assigned-leaveCount);
      summaries.insertAdjacentHTML('beforeend',`<span class="v445-ready-badge">พร้อมปฏิบัติงาน ${ready}/${rows.length}</span>${leaveCount?`<span class="v445-leave-count-badge">ลา ${leaveCount}</span>`:''}`);
    }

    [...card.querySelectorAll('.v434-zone-group')].forEach(group=>{
      const zone=text(group.querySelector('.v434-zone-head b')?.textContent);const stat=byZone.get(zone);if(!stat)return;
      const span=group.querySelector('.v434-zone-head span');if(!span)return;
      const ready=Math.max(0,stat.assigned-stat.leave);
      span.classList.add('v445-zone-count');span.innerHTML=`<b>พร้อม ${ready}/${stat.total}</b><small>จัด ${stat.assigned}/${stat.total}</small>`;
    });
    card.dataset.v448Clean='true';
  }

  function decorateHtml(html){
    if(!isDashboard())return html;const date=selectedDate();if(!date)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');cleanCard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn('[V448] dashboard cleanup skipped',err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v448Wrapped){
    const wrapped=function renderDashboardV448(){return decorateHtml(previousDashboard.apply(this,arguments));};
    wrapped.__v448Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function cleanCurrent(){if(!isDashboard())return;const date=selectedDate();if(date)cleanCard(document,date);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanCurrent,{once:true});else queueMicrotask(cleanCurrent);
  window.addEventListener('pageshow',cleanCurrent);

  const style=document.createElement('style');style.id='cnmi-v448-dashboard-position-clean-ui-leave-border';style.textContent=`
    [data-v434-daytime-positions] .v434-draft-badge,
    [data-v434-daytime-positions] .v434-jump-btn{display:none!important}
    /* Safety default: ordinary assigned positions stay on the original neutral card. */
    [data-v434-daytime-positions] .v434-position-item:not(.v445-has-leave){background:#fff!important;border-color:#e6edf4!important;box-shadow:none!important}
    [data-v434-daytime-positions] .v434-position-item.is-vacant:not(.v445-has-leave){background:#fffaf4!important;border-color:#ffd9aa!important}
  `;document.head.appendChild(style);

  window.cnmiDashboardPositionCleanV448={version:VERSION,cleanCard,leaveFor,rowKey,itemKey};
  console.info(`${VERSION} loaded`);
})();
