/* CNMI Staff Planner V510
 * Physician dashboard separation + Consult leave sync
 *
 * Goals
 * 1) Physician leave is self-managed and must not appear in Staff leave/no-duty dashboard lists.
 * 2) General Staff manpower summary is MT/Clerk only; physician availability belongs to Consult.
 * 3) Physician Consult must respect active physician leave on the selected Dashboard date.
 *    - Full-day leave: assigned physician is shown as unavailable and readiness decreases.
 *    - Half-day leave: daytime/24h Consult is shown as partially unavailable and readiness decreases.
 *    - 16:00-08:00 Consult is not blocked by a daytime half-day leave.
 * 4) No schema / SQL changes.
 */
(function(){
  'use strict';
  const VERSION='V510_PHYSICIAN_DASHBOARD_CONSULT_SYNC';
  if(window.__CNMI_V510_PHYSICIAN_DASHBOARD_CONSULT_SYNC__)return;
  window.__CNMI_V510_PHYSICIAN_DASHBOARD_CONSULT_SYNC__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S()?.dashboardDateV443)||normDate(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function profileText(p){return `${txt(p?.staff_type)} ${txt(p?.role)} ${txt(p?.position)} ${txt(p?.job_title)}`;}
  function isPhysicianProfile(p){return !!p&&/แพทย์|physician|doctor/i.test(profileText(p));}
  function staffById(id){return (S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
  function isPhysicianId(id){
    try{if(window.cnmiPhysicianLeaveV504?.isPhysicianId)return !!window.cnmiPhysicianLeaveV504.isPhysicianId(id);}catch(_){}
    return isPhysicianProfile(staffById(id));
  }
  function nick(id){const p=staffById(id);return txt(p?.nickname||p?.full_name||p?.email||'แพทย์');}
  function activeStaffOnly(date){return (S()?.staff||[]).filter(p=>{if(!p||p.is_active===false||p.active===false||isPhysicianProfile(p))return false;try{if(window.cnmiStaffLifecycleV462?.employmentOn&&!window.cnmiStaffLifecycleV462.employmentOn(p,date))return false;}catch(_){}return true;});}
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}catch(_){return !/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}}
  function overlaps(row,date){
    try{return typeof overlapsDate==='function'?!!overlapsDate(row,date):normDate(row?.start_date)<=date&&normDate(row?.end_date||row?.start_date)>=date;}
    catch(_){return false;}
  }
  function leaveType(row){return txt(row?.type||row?.leave_type).split(':::')[0].trim();}
  function actualLeave(row){return !!row&&effective(row)&&leaveType(row)&&leaveType(row)!=='ไม่รับเวร';}
  function periodKind(row){
    const raw=txt(row?.leave_period||row?.period||'เต็มวัน').toLowerCase();
    if(/ครึ่งเช้า|เช้า|morning/.test(raw))return 'morning';
    if(/ครึ่งบ่าย|บ่าย|afternoon/.test(raw))return 'afternoon';
    return 'full';
  }
  function physicianLeaves(id,date){return (S()?.leaves||[]).filter(r=>String(r?.staff_id||'')===String(id||'')&&actualLeave(r)&&overlaps(r,date));}
  function leaveStatusForTime(id,date,time){
    const rows=physicianLeaves(id,date);if(!rows.length)return null;
    const kinds=new Set(rows.map(periodKind));
    if(kinds.has('full')||(kinds.has('morning')&&kinds.has('afternoon')))return {kind:'full',label:'ลาเต็มวัน'};
    const t=txt(time);
    const daytime=/08:?00.*16:?00|กลางวัน/i.test(t);
    const allDay=/24\s*ชม|ตลอดวัน|ทั้งวัน/i.test(t);
    const overnight=/16:?00.*08:?00|กลางคืน|นอกเวลา/i.test(t);
    if(overnight&&!allDay)return null;
    if(daytime||allDay){
      if(kinds.has('morning'))return {kind:'partial',label:'ลาครึ่งเช้า'};
      if(kinds.has('afternoon'))return {kind:'partial',label:'ลาครึ่งบ่าย'};
    }
    return null;
  }
  function physicianNames(){
    const set=new Set();
    (S()?.staff||[]).filter(isPhysicianProfile).forEach(p=>[p?.nickname,p?.full_name,p?.email].map(txt).filter(Boolean).forEach(x=>set.add(x)));
    return set;
  }

  function staffOnlyManpower(date){
    const staff=activeStaffOnly(date),byId=new Set(staff.map(p=>String(p.id)));
    const absentMorning=new Set(),absentAfternoon=new Set();
    (S()?.leaves||[]).forEach(r=>{
      const sid=String(r?.staff_id||'');if(!sid||!byId.has(sid)||!actualLeave(r)||!overlaps(r,date))return;
      const k=periodKind(r);if(k==='full'||k==='morning')absentMorning.add(sid);if(k==='full'||k==='afternoon')absentAfternoon.add(sid);
    });
    const group=p=>{const text=profileText(p);return txt(p?.staff_type)==='เคิก'||/clerk|ธุรการ/i.test(text)?'เคิก':'MT';};
    const total={MT:0,'เคิก':0},morning={MT:0,'เคิก':0},afternoon={MT:0,'เคิก':0};
    staff.forEach(p=>{const sid=String(p.id),g=group(p);total[g]++;if(!absentMorning.has(sid))morning[g]++;if(!absentAfternoon.has(sid))afternoon[g]++;});
    const sum=x=>(x.MT||0)+(x['เคิก']||0);
    return {total,morning,afternoon,morningCount:sum(morning),afternoonCount:sum(afternoon)};
  }

  function cleanLeaveCard(root,date){
    const names=physicianNames();
    const cards=[...root.querySelectorAll?.('.card')||[]];
    const card=cards.find(c=>/ลา\s*\/\s*ไม่รับเวร|ลา\s*\/\s*ไม่รับเวรวันนี้/.test(txt(c.querySelector('h3')?.textContent)));
    if(card){
      card.querySelectorAll('.v397-today-item').forEach(item=>{const n=txt(item.querySelector('b')?.textContent);if(names.has(n))item.remove();});
      card.querySelectorAll('.v460-no-duty-row').forEach(item=>{const n=txt(item.querySelector('.v460-no-duty-name')?.textContent);if(names.has(n))item.remove();});
      const list=card.querySelector('.v397-today-list');
      if(list&&list.querySelectorAll('.v397-today-item').length===0){list.remove();if(!card.querySelector('.empty-state'))card.insertAdjacentHTML('beforeend','<div class="empty-state">วันนี้ไม่มีรายการลา/ไม่รับเวร</div>');}
    }
    const staffLeaveCount=(S()?.leaves||[]).filter(r=>actualLeave(r)&&overlaps(r,date)&&!isPhysicianId(r?.staff_id)).length;
    root.querySelectorAll('.stat-card').forEach(c=>{const label=txt(c.querySelector('.label')?.textContent);if(/^คนลา(?:วันนี้)?$/.test(label)){const num=c.querySelector('.num');if(num)num.textContent=String(staffLeaveCount);}});
  }

  function cleanManpower(root,date){
    const m=staffOnlyManpower(date),card=root.querySelector?.('[data-v433-manpower],.v433-manpower-card');
    if(card){
      const totals=[...card.querySelectorAll('.v433-period-totals>div:not(.v433-divider)')];
      if(totals[0]?.querySelector('strong'))totals[0].querySelector('strong').textContent=String(m.morningCount);
      if(totals[1]?.querySelector('strong'))totals[1].querySelector('strong').textContent=String(m.afternoonCount);
      card.querySelectorAll('.v433-type-line').forEach(line=>{
        const label=txt(line.querySelector('b')?.textContent)||'ช่วง';
        const src=/เช้า/.test(label)?m.morning:m.afternoon;
        line.innerHTML=`<b>${esc(label)}</b><span>MT <strong>${src.MT||0}</strong>/${m.total.MT||0}</span><span>เคิก <strong>${src['เคิก']||0}</strong>/${m.total['เคิก']||0}</span>`;
      });
      const note=card.querySelector('.v433-manpower-note');if(note)note.textContent='เต็มวันหักทั้งวัน · ครึ่งวันหักเฉพาะช่วง · แพทย์ดูสถานะที่ Consult';
    }
    root.querySelectorAll('.v460-offday-detail>div').forEach(row=>{
      const b=txt(row.querySelector('b')?.textContent);if(b!=='เวร')return;const span=row.querySelector('span');if(!span)return;
      span.textContent=txt(span.textContent).replace(/\s*[•·]\s*แพทย์\s*\d+/g,'').replace(/แพทย์\s*\d+\s*[•·]?\s*/g,'').trim();
    });
  }

  function consultAssignments(date){
    try{
      const api=window.cnmiPhysicianConsultV452,m=api?.baseForDate?.(date);if(!m)return [];
      if(m.weekday)return [
        {id:m.donor,time:'08:00–16:00',site:'Donor'},
        {id:m.bb,time:'08:00–16:00',site:'Blood Bank'},
        {id:m.combined,time:'16:00–08:00',site:'Donor & BB'}
      ];
      return [{id:m.combined,time:'24 ชม.',site:'Donor & BB'}];
    }catch(_){return [];}
  }
  function syncConsult(root,date){
    const card=root.querySelector?.('[data-v452-physician-card]');if(!card)return;
    const assignments=consultAssignments(date);if(!assignments.length)return;
    let unavailable=0;
    assignments.forEach(a=>{if(a?.id&&leaveStatusForTime(a.id,date,a.time))unavailable++;});
    card.querySelectorAll('[data-v455-doctor-id]').forEach(el=>{
      const id=el.getAttribute('data-v455-doctor-id'),time=el.getAttribute('data-v455-time')||'';
      const st=leaveStatusForTime(id,date,time);if(!st)return;
      const replacement=document.createElement('span');replacement.className=`v510-consult-leave ${st.kind==='full'?'is-full':'is-partial'}`;
      replacement.setAttribute('data-v510-physician-leave',st.kind);replacement.textContent=`${nick(id)} · ${st.label}`;replacement.title='แพทย์บันทึกลางานใน Staff Planner';el.replaceWith(replacement);
    });
    const ready=assignments.filter(a=>a?.id&&!leaveStatusForTime(a.id,date,a.time)).length,total=assignments.length;
    const badge=card.querySelector('.v452-ready');if(badge){badge.textContent=`พร้อม ${ready}/${total}`;badge.classList.toggle('is-complete',ready===total);badge.classList.toggle('v510-has-leave',unavailable>0);}
  }

  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;const date=selectedDate();
      cleanLeaveCard(tpl.content,date);cleanManpower(tpl.content,date);syncConsult(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] decorate`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV510(){return decorate(previousDashboard.apply(this,arguments));};
    wrapped.__v510Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v510-style';style.textContent=`
    .v510-consult-leave{display:inline-flex;align-items:center;min-height:30px;padding:5px 9px;border-radius:999px;font-weight:850;font-size:11px;line-height:1.2}
    .v510-consult-leave.is-full{background:#fff0ef;border:1px solid #ffc9c5;color:#a33b35}
    .v510-consult-leave.is-partial{background:#fff7e7;border:1px solid #ffd99a;color:#956111}
    .v452-ready.v510-has-leave{background:#fff7e7!important;border-color:#ffd99a!important;color:#956111!important}
    @media(max-width:760px){.v510-consult-leave{font-size:13px;min-height:36px;padding:7px 11px;white-space:normal}}
  `;document.head.appendChild(style);

  window.cnmiPhysicianDashboardV510={version:VERSION,decorate,leaveStatusForTime,staffOnlyManpower};
  console.info(`${VERSION} loaded`);
})();
