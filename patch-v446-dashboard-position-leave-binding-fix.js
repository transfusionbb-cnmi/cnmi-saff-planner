/* CNMI Staff Planner V446
 * Fix Dashboard daytime-position leave badges binding.
 *
 * V445 correctly loaded the selected date, but paired position rows to rendered
 * cards by array index. The Dashboard groups Blood Bank / Donor Room before
 * rendering, so the DOM order can differ from the authoritative row order.
 * This patch removes that positional pairing and binds each rendered card by
 * zone + position code, then reads leave by the matched row's staff_id.
 *
 * Display-only. Keeps the V434/V435 layout and V445 styles unchanged.
 */
(function(){
  'use strict';
  const VERSION='V446_DASHBOARD_POSITION_LEAVE_BINDING_FIX';
  if(window.__CNMI_V446_DASHBOARD_POSITION_LEAVE_BINDING_FIX__)return;
  window.__CNMI_V446_DASHBOARD_POSITION_LEAVE_BINDING_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function normDate(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S().dashboardDateV443);}catch(_){return normDate(S().dashboardDateV443);}
  }
  function isDashboard(){return String(S().page||'')==='dashboard';}
  function text(v){return String(v==null?'':v).trim();}
  function key(v){return text(v).replace(/\s+/g,'').replace(/[–—]/g,'-').toLowerCase();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}

  function rowsForDate(date){
    try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}
  }
  function zoneOf(row){
    try{return text(window.cnmiDashboardPositionsV434?.zoneOf?.(row))||text(row?.zone)||'อื่นๆ';}catch(_){return text(row?.zone)||'อื่นๆ';}
  }
  function codeOf(row){return text(row?.position_code||row?.code);}
  function labelOf(row){
    const code=codeOf(row);
    try{if(typeof positionLabelForCell==='function')return text(positionLabelForCell(code))||code;}catch(_){ }
    try{if(typeof labelCode==='function')return text(labelCode(code))||code;}catch(_){ }
    return code;
  }
  function rowKey(row){return `${key(zoneOf(row))}|${key(labelOf(row)||codeOf(row))}`;}
  function itemLabel(item){
    const node=item?.querySelector?.('.v434-position-code');
    if(!node)return '';
    const clone=node.cloneNode(true);
    clone.querySelectorAll?.('.v435-info-mark').forEach(n=>n.remove());
    return text(clone.textContent);
  }
  function itemKey(item){
    const zone=text(item?.closest?.('.v434-zone-group')?.querySelector?.('.v434-zone-head b')?.textContent)||'อื่นๆ';
    return `${key(zone)}|${key(itemLabel(item))}`;
  }

  function inRange(row,date){
    const s=normDate(row?.start_date),e=normDate(row?.end_date||row?.start_date);
    return !!s&&s<=date&&e>=date;
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!['cancelled','ยกเลิก'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;}}
  function actualLeave(row){
    if(!row||!effective(row))return false;
    const t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveFor(staffId,date){
    if(!staffId)return null;
    return (S().leaves||[]).find(r=>String(r?.staff_id||'')===String(staffId)&&actualLeave(r)&&inRange(r,date))||null;
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
  function hrLabel(row){return hrChecked(row)?'✓ ตรวจ HR แล้ว':'รอตรวจ HR';}

  function resetItem(item){
    item?.querySelectorAll?.('.v445-position-leave-meta').forEach(n=>n.remove());
    item?.classList?.remove('v445-has-leave','v445-half-leave','v445-full-leave');
    if(item){delete item.dataset.v446StaffId;delete item.dataset.v446PositionCode;}
  }
  function addLeaveMeta(item,leave){
    const kind=periodKind(leave);
    item.classList.add('v445-has-leave',kind==='full'?'v445-full-leave':'v445-half-leave');
    const meta=document.createElement('div');
    meta.className='v445-position-leave-meta';
    const hr=admin()?`<span class="v445-hr-pill ${hrChecked(leave)?'is-done':'is-pending'}">${esc(hrLabel(leave))}</span>`:'';
    meta.innerHTML=`<div class="v445-position-status-line"><span class="v445-leave-pill">${esc(periodLabel(leave))}</span>${hr}</div><div class="v445-shortage-pill">${esc(shortageLabel(leave))}</div>`;
    item.appendChild(meta);
  }

  function fixPositionCard(root,date){
    const card=root?.querySelector?.('[data-v434-daytime-positions]');
    if(!card)return;
    const rows=rowsForDate(date);
    if(!rows.length)return;
    const items=[...card.querySelectorAll('.v434-position-item')];
    if(!items.length)return;

    // V445 may already have decorated the wrong cards; clear all of those first.
    items.forEach(resetItem);

    const rowMap=new Map();
    rows.forEach(row=>{
      const rk=rowKey(row);
      if(rk&&!rowMap.has(rk))rowMap.set(rk,row);
    });

    let assigned=0,leaveCount=0;
    const byZone=new Map();

    items.forEach(item=>{
      const row=rowMap.get(itemKey(item));
      if(!row)return;
      const sid=row?.staff_id||'';
      const zone=zoneOf(row)||'อื่นๆ';
      const position=codeOf(row)||labelOf(row);
      item.dataset.v446StaffId=String(sid||'');
      item.dataset.v446PositionCode=String(position||'');

      if(!byZone.has(zone))byZone.set(zone,{total:0,assigned:0,leave:0});
      const z=byZone.get(zone);z.total++;
      if(sid){assigned++;z.assigned++;}

      const leave=sid?leaveFor(sid,date):null;
      if(!leave)return;
      leaveCount++;z.leave++;
      addLeaveMeta(item,leave);
    });

    // Count rows that did not find a rendered card only for total/assigned fallback.
    // In normal V434 output every row has one card; this protects summary accuracy
    // without ever attaching a leave badge to a guessed DOM position.
    if(assigned===0&&rows.some(r=>r?.staff_id))assigned=rows.filter(r=>!!r?.staff_id).length;

    const ready=Math.max(0,assigned-leaveCount);
    const summaries=card.querySelector('.v434-summary-badges');
    if(summaries){
      summaries.querySelectorAll('.v445-ready-badge,.v445-leave-count-badge').forEach(n=>n.remove());
      const complete=summaries.querySelector('.v434-complete-badge');
      if(complete&&/^ครบ\s/.test(text(complete.textContent)))complete.textContent=text(complete.textContent).replace(/^ครบ\s*/, 'จัดครบ ');
      summaries.insertAdjacentHTML('beforeend',`<span class="v445-ready-badge">พร้อมปฏิบัติงาน ${ready}/${rows.length}</span>${leaveCount?`<span class="v445-leave-count-badge">ลา ${leaveCount}</span>`:''}`);
    }

    [...card.querySelectorAll('.v434-zone-group')].forEach(group=>{
      const zone=text(group.querySelector('.v434-zone-head b')?.textContent);
      const stat=byZone.get(zone);if(!stat)return;
      const span=group.querySelector('.v434-zone-head span');if(!span)return;
      const readyZone=Math.max(0,stat.assigned-stat.leave);
      span.classList.add('v445-zone-count');
      span.innerHTML=`<b>พร้อม ${readyZone}/${stat.total}</b><small>จัด ${stat.assigned}/${stat.total}</small>`;
    });

    card.dataset.v446LeaveBinding='position-code-staff-id';
  }

  function decorateHtml(html){
    if(!isDashboard())return html;
    const date=selectedDate();if(!date)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      fixPositionCard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn('[V446] HTML correction skipped',err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v446Wrapped){
    const wrapped=function renderDashboardV446(){return decorateHtml(previousDashboard.apply(this,arguments));};
    wrapped.__v446Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function fixCurrentDom(){
    if(!isDashboard())return;
    const date=selectedDate();
    if(date)fixPositionCard(document,date);
  }

  // The renderDashboard wrapper above is the authoritative path. pageshow is only a
  // safety refresh for restored mobile/PWA pages; no MutationObserver is used here
  // because rebuilding badges itself is a DOM mutation.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fixCurrentDom,{once:true});else queueMicrotask(fixCurrentDom);
  window.addEventListener('pageshow',fixCurrentDom);
  window.cnmiDashboardPositionLeaveV446={version:VERSION,fixPositionCard,rowKey,itemKey,leaveFor};
  console.info(`${VERSION} loaded`);
})();
