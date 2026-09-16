/* CNMI Staff Planner V511
 * Restore Dashboard leave/no-duty list after V510 physician separation.
 * - All operational absences remain visible, including physician leave.
 * - Physician leave is self-managed: no HR status / HR workflow badge.
 * - Staff leave keeps HR status exactly as before.
 * - General manpower remains MT/Clerk only; Consult remains physician-aware.
 * Display/workflow split only; no schema / SQL changes.
 */
(function(){
  'use strict';
  const VERSION='V511_LEAVE_LIST_PHYSICIAN_HR_SPLIT';
  if(window.__CNMI_V511_LEAVE_LIST_PHYSICIAN_HR_SPLIT__)return;
  window.__CNMI_V511_LEAVE_LIST_PHYSICIAN_HR_SPLIT__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S()?.dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}catch(_){return true;}}
  function overlaps(row,date){try{return typeof overlapsDate==='function'?!!overlapsDate(row,date):norm(row?.start_date)<=date&&norm(row?.end_date||row?.start_date)>=date;}catch(_){return false;}}
  function rowType(row){return txt(row?.type||row?.leave_type).split(':::')[0].trim();}
  function isNoDuty(row){return rowType(row)==='ไม่รับเวร';}
  function isLeave(row){return !!row&&effective(row)&&!!rowType(row)&&!isNoDuty(row);}
  function isVisible(row,date){return !!row&&effective(row)&&!!rowType(row)&&overlaps(row,date);}
  function isPhysicianId(id){
    try{if(window.cnmiPhysicianLeaveV504?.isPhysicianId)return !!window.cnmiPhysicianLeaveV504.isPhysicianId(id);}catch(_){}
    const p=(S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''));
    if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);
    const type=txt(p?.staff_type);return !!p&&/^(แพทย์|physician|doctor)$/i.test(type);
  }
  function nick(id){try{return typeof staffNick==='function'?txt(staffNick(id)):txt((S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''))?.nickname||id);}catch(_){return txt(id)||'-';}}
  function periodLabel(row){
    const raw=txt(row?.leave_period||row?.period||'เต็มวัน');
    if(!raw||raw==='เต็มวัน'||raw==='ทั้งวัน')return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw;
  }
  function displayType(row){
    if(isNoDuty(row))return 'ไม่รับเวร';
    try{return typeof leaveDisplayType==='function'?txt(leaveDisplayType(row)):(rowType(row)||'ลา');}catch(_){return rowType(row)||'ลา';}
  }
  function badgeHtml(label,row){
    try{
      const cls=isNoDuty(row)?'gray':(typeof leaveBadgeClass==='function'?leaveBadgeClass(label):'blue');
      if(typeof badge==='function')return badge(label,cls);
    }catch(_){}
    return `<span class="badge">${esc(label)}</span>`;
  }
  function reason(row){
    try{return typeof leaveReasonText==='function'?txt(leaveReasonText(row)):txt(row?.reason||row?.note);}catch(_){return txt(row?.reason||row?.note);}
  }
  function dateLabel(row){
    const f=v=>{try{return typeof formatThaiDate==='function'?formatThaiDate(v):txt(v);}catch(_){return txt(v);}};
    const a=norm(row?.start_date),b=norm(row?.end_date||row?.start_date);
    return a===b?f(a):`${f(a)}–${f(b)}`;
  }
  function rankLeave(row,date){try{return Number(window.cnmiLeaveSequenceV431?.rankFor?.(row,date))||null;}catch(_){return null;}}
  function rankNoDuty(row,date){try{return Number(window.cnmiNoDutySequenceV436?.rankFor?.(row,date))||null;}catch(_){return null;}}
  function submittedMs(row){
    try{if(isNoDuty(row)&&window.cnmiNoDutySequenceV436?.submittedMs)return Number(window.cnmiNoDutySequenceV436.submittedMs(row));}catch(_){}
    try{if(window.cnmiLeaveSequenceV431?.leaveSubmittedMs)return Number(window.cnmiLeaveSequenceV431.leaveSubmittedMs(row));}catch(_){}
    const n=Date.parse(String(row?.created_at||row?.submitted_at||row?.updated_at||''));return Number.isFinite(n)?n:Number.POSITIVE_INFINITY;
  }
  function hrMeta(row){
    if(!isLeave(row)||isPhysicianId(row?.staff_id))return null;
    const id=String(row?.id||'');
    const h=(S()?.hrChecks||[]).find(x=>String(x?.leave_request_id||'')===id)||null;
    const status=txt(h?.status);
    if(status==='ตรวจสอบแล้ว')return {label:'✓ ตรวจสอบ HR แล้ว',cls:'is-done'};
    if(status==='รอเอกสาร')return {label:'รอเอกสาร HR',cls:'is-waiting'};
    if(status==='ยกเลิก')return {label:'HR ยกเลิก',cls:'is-muted'};
    if(h?.hr_reported_date)return {label:'รอตรวจสอบ HR',cls:'is-pending'};
    return {label:'ยังไม่ลง HR',cls:'is-not-reported'};
  }
  function hrHtml(row){const m=hrMeta(row);return m?` <span class="v445-hr-pill v453-hr-pill v511-dashboard-hr-pill ${m.cls}">${esc(m.label)}</span>`:'';}
  function lateHtml(row,date){
    if(!isLeave(row)||isPhysicianId(row?.staff_id))return '';
    try{return window.cnmiLateLeaveV430?.isLateLeaveForDate?.(row,date)?' <span class="v430-late-leave-badge">ลานอกตาราง</span>':'';}catch(_){return '';}
  }
  function sequenceHtml(row,date){
    if(isNoDuty(row)){
      const r=rankNoDuty(row,date);return r?` <button type="button" class="v436-no-duty-rank-badge" data-v436-no-duty-rank="${r}" data-v436-date="${esc(date)}" data-v436-staff="${esc(row?.staff_id)}" title="แตะดูเวลาที่บันทึกครั้งแรก">ลำดับไม่รับเวร ${r}</button>`:'';
    }
    const r=rankLeave(row,date);return r?` <span class="v431-leave-rank-badge">ลำดับลา ${r}</span>`:'';
  }
  function itemHtml(row,date){
    const physician=isPhysicianId(row?.staff_id);
    const label=displayType(row);
    const cls=(function(){try{return !physician&&window.cnmiLateLeaveV430?.isLateLeaveForDate?.(row,date)?' v430-late-today-item':'';}catch(_){return '';}})();
    const note=reason(row);
    return `<div class="v397-today-item${cls}" data-v511-staff="${esc(row?.staff_id)}" data-v511-physician="${physician?'1':'0'}"><div><b>${esc(nick(row?.staff_id))}</b>${sequenceHtml(row,date)} ${badgeHtml(label,row)}${hrHtml(row)}${lateHtml(row,date)}</div><div class="v397-detail-line">ช่วงเวลา: <span class="v397-period">${esc(periodLabel(row))}</span> · วันที่: ${esc(dateLabel(row))}</div>${note?`<div class="v397-detail-note">เหตุผล: ${esc(note)}</div>`:''}</div>`;
  }

  function rowsFor(date){
    const rows=(S()?.leaves||[]).filter(r=>isVisible(r,date));
    const leaves=rows.filter(isLeave).sort((a,b)=>{
      const ra=rankLeave(a,date)||99999,rb=rankLeave(b,date)||99999;if(ra!==rb)return ra-rb;
      return submittedMs(a)-submittedMs(b);
    });
    const noDuty=rows.filter(isNoDuty).sort((a,b)=>{
      const ra=rankNoDuty(a,date)||99999,rb=rankNoDuty(b,date)||99999;if(ra!==rb)return ra-rb;
      return submittedMs(a)-submittedMs(b);
    });
    return [...leaves,...noDuty];
  }

  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    const date=selectedDate();
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      const cards=[...tpl.content.querySelectorAll('.card')];
      const card=cards.find(c=>/ลา\s*\/\s*ไม่รับเวร/.test(txt(c.querySelector('h3')?.textContent)));
      if(!card)return html;
      const rows=rowsFor(date);
      card.querySelectorAll('.v397-today-list,.empty-state,.v431-rank-help,.v436-rank-help').forEach(n=>n.remove());
      const title=card.querySelector('.section-title');
      const help=document.createElement('div');help.className='v431-rank-help v436-rank-help';help.textContent='ลำดับลาและลำดับไม่รับเวร แยกกัน เรียงตามเวลาที่บันทึกครั้งแรก';
      if(title)title.insertAdjacentElement('afterend',help);
      if(rows.length){
        const list=document.createElement('div');list.className='v397-today-list v511-leave-list';list.innerHTML=rows.map(r=>itemHtml(r,date)).join('');
        help.insertAdjacentElement('afterend',list);
      }else{
        const empty=document.createElement('div');empty.className='empty-state';empty.textContent=date===norm(typeof todayStr==='function'?todayStr():'')?'วันนี้ไม่มีรายการลา/ไม่รับเวร':'ไม่มีรายการลา/ไม่รับเวรในวันที่เลือก';
        help.insertAdjacentElement('afterend',empty);
      }
      // Leave statistic = all real leave records, including physician leave; no-duty is separate.
      const leaveCount=rows.filter(isLeave).length;
      tpl.content.querySelectorAll('.stat-card').forEach(c=>{const label=txt(c.querySelector('.label')?.textContent);if(/^คนลา(?:วันนี้)?$/.test(label)){const num=c.querySelector('.num');if(num)num.textContent=String(leaveCount);}});
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard leave restore`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV511(){return decorate(String(previousDashboard.apply(this,arguments)||''));};
    wrapped.__v511Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v511-style';style.textContent=`
    .v511-leave-list [data-v511-physician="1"] .v445-hr-pill,.v511-leave-list [data-v511-physician="1"] .v453-hr-pill,.v511-leave-list [data-v511-physician="1"] .v454-hr-pill{display:none!important}
  `;document.head.appendChild(style);

  window.cnmiDashboardLeaveV511={version:VERSION,decorate,rowsFor,isPhysicianId};
  console.info(`${VERSION} loaded`);
})();
