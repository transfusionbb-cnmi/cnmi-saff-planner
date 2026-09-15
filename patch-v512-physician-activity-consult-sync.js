/* CNMI Staff Planner V512
 * Physician Consult activity availability sync
 *
 * - Physician leave remains handled by V510/V511.
 * - Activities involving a physician can make that physician unavailable for Consult
 *   only for the overlapping time window.
 * - Clear in-unit "other" activities do not automatically block Consult.
 * - External/teaching/training/meeting/outing activities do block Consult.
 * - No database/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V512_PHYSICIAN_ACTIVITY_CONSULT_SYNC';
  if(window.__CNMI_V512_PHYSICIAN_ACTIVITY_CONSULT_SYNC__)return;
  window.__CNMI_V512_PHYSICIAN_ACTIVITY_CONSULT_SYNC__=true;

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
  function parseIds(v){
    if(Array.isArray(v))return v.filter(Boolean).map(String);
    const s=txt(v);if(!s)return [];
    try{const x=JSON.parse(s);if(Array.isArray(x))return x.filter(Boolean).map(String);}catch(_){ }
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  function inDateRange(date,a){
    const s=normDate(a?.start_date),e=normDate(a?.end_date||a?.start_date);
    return (!s||date>=s)&&(!e||date<=e);
  }
  function minute(v){const m=txt(v).match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;}
  function interval(start,end){
    let a=minute(start),b=minute(end);
    if(a==null&&b==null)return null;
    if(a==null)a=0;if(b==null)b=1440;
    if(b<=a)b+=1440;
    return [a,b];
  }
  function consultInterval(time){
    const s=txt(time);
    if(/24\s*ชม|ตลอดวัน|ทั้งวัน/i.test(s))return [0,1440];
    const m=s.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    if(!m)return [0,1440];
    let a=Number(m[1])*60+Number(m[2]),b=Number(m[3])*60+Number(m[4]);
    if(b<=a)b+=1440;
    return [a,b];
  }
  function overlapsInterval(a,b){return Math.max(a[0],b[0])<Math.min(a[1],b[1]);}
  function timeLabel(a){
    const s=txt(a?.start_time).slice(0,5),e=txt(a?.end_time).slice(0,5);
    if(s&&e)return `${s}–${e}`;
    if(s)return `ตั้งแต่ ${s}`;
    return 'ทั้งวัน';
  }
  function activityLabel(a){
    const type=txt(a?.event_type)||'กิจกรรม';
    if(type==='อื่นๆ')return `ติดกิจกรรม ${timeLabel(a)}`;
    return `${type} ${timeLabel(a)}`;
  }
  function clearlyInUnit(a){
    const location=txt(a?.location);
    if(!location)return false;
    return /เวชศาสตร์บริการโลหิต|ห้องบริจาคโลหิต|คลังเลือด|blood\s*bank|donor\s*room|cnmi\s*blood/i.test(location);
  }
  function blockingActivity(a){
    const type=txt(a?.event_type);
    const words=`${txt(a?.title)} ${txt(a?.note)} ${txt(a?.location)}`;
    if(['อบรม','ประชุม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE'].includes(type))return true;
    if(/ติดสอน|สอน|สัมมนา|conference|training|teaching|ไปประชุม|ไปราชการ|นอกสถานที่|ออกหน่วย/i.test(words))return true;
    // "อื่นๆ" ที่ระบุสถานที่นอกหน่วยชัดเจน ถือว่าแพทย์ไม่อยู่จุด Consult
    if(type==='อื่นๆ'&&txt(a?.location)&&!clearlyInUnit(a))return true;
    return false;
  }
  function physicianActivities(id,date,time){
    const ci=consultInterval(time);
    return (S()?.activities||[]).filter(a=>{
      if(!a||!inDateRange(date,a)||!parseIds(a?.participant_ids).includes(String(id||''))||!blockingActivity(a))return false;
      const ai=interval(a?.start_time,a?.end_time)||[0,1440];
      return overlapsInterval(ai,ci);
    }).sort((a,b)=>(minute(a?.start_time)??0)-(minute(b?.start_time)??0));
  }
  function leaveStatus(id,date,time){
    try{return window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(id,date,time)||null;}catch(_){return null;}
  }
  function combinedStatus(id,date,time){
    const leave=leaveStatus(id,date,time);if(leave)return {source:'leave',...leave};
    const acts=physicianActivities(id,date,time);if(!acts.length)return null;
    const a=acts[0];return {source:'activity',kind:'activity',label:activityLabel(a),title:txt(a?.title),activity:a};
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

    card.querySelectorAll('[data-v455-doctor-id]').forEach(el=>{
      const id=el.getAttribute('data-v455-doctor-id'),time=el.getAttribute('data-v455-time')||'';
      if(!id||leaveStatus(id,date,time))return; // V510 already renders physician leave.
      const acts=physicianActivities(id,date,time);if(!acts.length)return;
      const a=acts[0];
      const replacement=document.createElement('span');
      replacement.className='v512-consult-activity';
      replacement.setAttribute('data-v512-physician-activity','1');
      replacement.textContent=`${nick(id)} · ${activityLabel(a)}`;
      replacement.title=txt(a?.title)||'แพทย์มีกิจกรรมทับช่วง Consult';
      el.replaceWith(replacement);
    });

    const total=assignments.length;
    const ready=assignments.filter(a=>a?.id&&!combinedStatus(a.id,date,a.time)).length;
    const badge=card.querySelector('.v452-ready');
    if(badge){
      badge.textContent=`พร้อม ${ready}/${total}`;
      badge.classList.toggle('is-complete',ready===total);
      badge.classList.toggle('v510-has-leave',ready<total);
      badge.classList.toggle('v512-has-activity',assignments.some(a=>a?.id&&physicianActivities(a.id,date,a.time).length));
    }
  }
  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      syncConsult(tpl.content,selectedDate());
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] decorate`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV512(){return decorate(previousDashboard.apply(this,arguments));};
    wrapped.__v512Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v512-style';style.textContent=`
    .v512-consult-activity{display:inline-flex;align-items:center;min-height:30px;padding:5px 9px;border-radius:999px;font-weight:850;font-size:11px;line-height:1.2;background:#fff7e7;border:1px solid #ffd99a;color:#956111}
    .v452-ready.v512-has-activity{background:#fff7e7!important;border-color:#ffd99a!important;color:#956111!important}
    @media(max-width:760px){.v512-consult-activity{font-size:13px;min-height:36px;padding:7px 11px;white-space:normal}}
  `;document.head.appendChild(style);

  window.cnmiPhysicianActivityV512={version:VERSION,physicianActivities,blockingActivity,combinedStatus};
  console.info(`${VERSION} loaded`);
})();
