/* CNMI Staff Planner V596
 * Physician leave applies to regular daytime duty only; Consult on-call remains active.
 *
 * Rules:
 * - Weekday Donor / Blood Bank 08:00-16:00: physician leave still affects availability.
 * - Weekday Donor & BB 16:00-08:00: leave_requests never cancels on-call duty.
 * - Weekend/public-holiday 24h Donor & BB: this is on-call duty, so leave_requests never cancels it.
 * - A real overlapping physician activity may still mark the on-call physician unavailable (V512 logic).
 * - No quota / leave-count / HR / OT / database logic is changed.
 */
(function(){
  'use strict';
  const VERSION='V596_PHYSICIAN_LEAVE_DAYTIME_ONCALL_FIX';
  if(window.__CNMI_V596_PHYSICIAN_LEAVE_DAYTIME_ONCALL_FIX__)return;
  window.__CNMI_V596_PHYSICIAN_LEAVE_DAYTIME_ONCALL_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S()?.dashboardDateV443)||normDate(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function staffById(id){return (S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
  function nick(id){const p=staffById(id);return txt(p?.nickname||p?.full_name||p?.email||'แพทย์');}
  function assignmentModel(date){
    try{return window.cnmiPhysicianConsultV452?.baseForDate?.(date)||null;}catch(_){return null;}
  }
  function isOnCallTime(time,weekday){
    const t=txt(time);
    if(weekday)return /16:?00\s*[–-]\s*08:?00|นอกเวลา|กลางคืน/i.test(t);
    return /24\s*ชม|ตลอดวัน|ทั้งวัน/i.test(t);
  }
  function onCallAssignment(date){
    const m=assignmentModel(date);if(!m)return null;
    if(m.weekday)return {id:m.combined||null,time:'16:00–08:00',site:'Donor & BB',weekday:true};
    return {id:m.combined||null,time:'24 ชม.',site:'Donor & BB',weekday:false};
  }
  function physicianActivities(id,date,time){
    try{return window.cnmiPhysicianActivityV512?.physicianActivities?.(id,date,time)||[];}catch(_){return [];}
  }
  function activityLabel(a){
    const api=window.cnmiPhysicianActivityV512;
    if(api?.combinedStatus){
      try{
        // combinedStatus also asks V510 about leave, so use only the returned activity when source=activity.
        const x=api.combinedStatus(a?.__staffId||'',a?.__date||'',a?.__time||'');
        if(x?.source==='activity'&&x?.label)return txt(x.label);
      }catch(_){ }
    }
    const type=txt(a?.event_type)||'กิจกรรม';
    const s=txt(a?.start_time).slice(0,5),e=txt(a?.end_time).slice(0,5);
    const period=s&&e?`${s}–${e}`:(s?`ตั้งแต่ ${s}`:'ทั้งวัน');
    return type==='อื่นๆ'?`ติดกิจกรรม ${period}`:`${type} ${period}`;
  }
  function doctorButton(id,site,time,mobile){
    if(!id)return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn${mobile?' v456-mobile-doctor-button':''}" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" aria-label="ดูเบอร์โทร ${esc(nick(id))}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(nick(id))}</button>`;
  }
  function activitySpan(id,a){
    const label=activityLabel(a);
    return `<span class="v512-consult-activity" data-v512-physician-activity="1" title="${esc(txt(a?.title)||'แพทย์มีกิจกรรมทับช่วง Consult')}">${esc(nick(id))} · ${esc(label)}</span>`;
  }
  function rowTime(el){
    const desktop=el.closest?.('tr');
    if(desktop){const td=desktop.querySelector('td');if(td)return txt(td.textContent);}
    const mobile=el.closest?.('.v456-mobile-consult-row');
    if(mobile)return txt(mobile.querySelector?.('.v456-mobile-consult-time')?.textContent);
    return '';
  }
  function restoreOnCall(root,date){
    const a=onCallAssignment(date);if(!a)return;
    const card=root.querySelector?.('[data-v452-physician-card]');if(!card)return;
    const acts=a.id?physicianActivities(a.id,date,a.time):[];
    card.querySelectorAll('.v510-consult-leave').forEach(el=>{
      const t=rowTime(el);
      if(!isOnCallTime(t||a.time,a.weekday))return;
      const mobile=!!el.closest?.('.v456-mobile-consult-row');
      const html=acts.length?activitySpan(a.id,acts[0]):doctorButton(a.id,a.site,a.time,mobile);
      const tpl=document.createElement('template');tpl.innerHTML=html.trim();const repl=tpl.content.firstElementChild;
      if(repl)el.replaceWith(repl);
    });
    // If an older renderer marked the on-call slot as leave but the row is otherwise hard to identify,
    // repair any remaining leave badge inside the explicit on-call row only.
    card.querySelectorAll('tr,.v456-mobile-consult-row').forEach(row=>{
      const t=txt(row.querySelector?.('td')?.textContent)||txt(row.querySelector?.('.v456-mobile-consult-time')?.textContent);
      if(!isOnCallTime(t,a.weekday))return;
      row.querySelectorAll?.('.v510-consult-leave')?.forEach(el=>{
        const mobile=!!el.closest?.('.v456-mobile-consult-row');
        const html=acts.length?activitySpan(a.id,acts[0]):doctorButton(a.id,a.site,a.time,mobile);
        const tpl=document.createElement('template');tpl.innerHTML=html.trim();const repl=tpl.content.firstElementChild;if(repl)el.replaceWith(repl);
      });
    });
  }
  function recomputeReady(root,date){
    const card=root.querySelector?.('[data-v452-physician-card]');if(!card)return;
    const m=assignmentModel(date);if(!m)return;
    const assignments=m.weekday?[
      {id:m.donor,time:'08:00–16:00',oncall:false},
      {id:m.bb,time:'08:00–16:00',oncall:false},
      {id:m.combined,time:'16:00–08:00',oncall:true}
    ]:[{id:m.combined,time:'24 ชม.',oncall:true}];
    const leaveApi=window.cnmiPhysicianDashboardV510;
    let anyLeave=false,anyActivity=false;
    const ready=assignments.filter(x=>{
      if(!x.id)return false;
      const acts=physicianActivities(x.id,date,x.time);if(acts.length){anyActivity=true;return false;}
      if(!x.oncall){
        let leave=null;try{leave=leaveApi?.leaveStatusForTime?.(x.id,date,x.time)||null;}catch(_){leave=null;}
        if(leave){anyLeave=true;return false;}
      }
      return true;
    }).length;
    const badge=card.querySelector('.v452-ready');
    if(badge){
      badge.textContent=`พร้อม ${ready}/${assignments.length}`;
      badge.classList.toggle('is-complete',ready===assignments.length);
      badge.classList.toggle('v510-has-leave',anyLeave);
      badge.classList.toggle('v512-has-activity',anyActivity);
    }
  }
  // Make the shared V510 API obey the same rule for any later consumer (for example V512).
  try{
    const api=window.cnmiPhysicianDashboardV510;
    if(api?.leaveStatusForTime&&!api.__v596LeaveWrapped){
      const previousLeaveStatus=api.leaveStatusForTime.bind(api);
      api.leaveStatusForTime=function leaveStatusForTimeV596(id,date,time){
        const m=assignmentModel(normDate(date));
        const weekday=m?!!m.weekday:true;
        if(isOnCallTime(time,weekday))return null;
        return previousLeaveStatus(id,date,time);
      };
      api.__v596LeaveWrapped=true;
    }
  }catch(err){console.warn(`[${VERSION}] V510 API patch`,err);}

  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;const date=selectedDate();
      restoreOnCall(tpl.content,date);recomputeReady(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] decorate`,err);return html;}
  }

  const previousDashboard=(()=>{try{return window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);}catch(_){return window.renderDashboard||null;}})();
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV596(){return decorate(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  window.cnmiPhysicianOnCallV596={version:VERSION,decorate,onCallAssignment};
  console.info(`${VERSION} loaded`);
})();
