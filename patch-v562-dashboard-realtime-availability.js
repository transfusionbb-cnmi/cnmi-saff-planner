/* CNMI Staff Planner V562
 * Realtime dashboard availability from leave + blocking activities.
 * - Weekday manpower uses exact activity time windows (08:00-16:00), not whole-day subtraction.
 * - Multiple overlapping activities for the same person are merged for counting, so no double subtraction.
 * - Shows minimum available staff in morning / afternoon and a compact time-line drilldown.
 * - Physician Consult shows all overlapping meeting/training/outing windows and exact-time minimum readiness.
 * - Display-only: no Supabase schema/write changes and no extra network requests.
 */
(function(){
  'use strict';
  const VERSION='V562_DASHBOARD_REALTIME_AVAILABILITY';
  if(window.__CNMI_V562_DASHBOARD_REALTIME_AVAILABILITY__)return;
  window.__CNMI_V562_DASHBOARD_REALTIME_AVAILABILITY__=true;

  const WORK_START=8*60, MIDDAY=12*60, WORK_END=16*60;
  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S()?.dashboardDateV443)||normDate(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function isOffDay(date){
    try{return !!window.cnmiDashboardHolidayManpowerV440?.isOffDay?.(date);}catch(_){return false;}
  }
  function staffById(id){return (S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
  function nick(id){const p=staffById(id);return txt(p?.nickname||p?.full_name||p?.email||'-');}
  function isPhysician(p){
    if(!p)return false;
    try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(_){ }
    const t=`${txt(p?.staff_type)} ${txt(p?.role)} ${txt(p?.position)} ${txt(p?.job_title)}`;
    if(/นักเทคนิคการแพทย์|เทคนิคการแพทย์/i.test(t))return false;
    return /แพทย์|physician|doctor/i.test(t);
  }
  function groupOf(p){
    if(isPhysician(p))return 'แพทย์';
    const t=`${txt(p?.staff_type)} ${txt(p?.role)} ${txt(p?.position)} ${txt(p?.job_title)}`;
    return txt(p?.staff_type)==='เคิก'||/clerk|ธุรการ/i.test(t)?'เคิก':'MT';
  }
  function activeOn(p,date){
    if(!p||p.is_active===false||p.active===false)return false;
    try{if(window.cnmiStaffLifecycleV462?.employmentOn&&!window.cnmiStaffLifecycleV462.employmentOn(p,date))return false;}catch(_){ }
    return true;
  }
  function activeStaff(date,{physicians=false}={}){
    return (S()?.staff||[]).filter(p=>activeOn(p,date)&&(physicians?isPhysician(p):!isPhysician(p)));
  }
  function effectiveLeave(row){
    try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}
    catch(_){return !/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}
  }
  function leaveType(row){return txt(row?.type||row?.leave_type).split(':::')[0].trim();}
  function actualLeave(row){return !!row&&effectiveLeave(row)&&!!leaveType(row)&&leaveType(row)!=='ไม่รับเวร';}
  function inRange(date,row){
    const a=normDate(row?.start_date),b=normDate(row?.end_date||row?.start_date);
    return !!date&&(!a||date>=a)&&(!b||date<=b);
  }
  function leaveKind(row){
    const r=txt(row?.leave_period||row?.period||'เต็มวัน').toLowerCase();
    if(/ครึ่งเช้า|morning/.test(r))return 'morning';
    if(/ครึ่งบ่าย|afternoon/.test(r))return 'afternoon';
    return 'full';
  }
  function minute(v){const m=txt(v).match(/^(\d{1,2}):(\d{2})/);if(!m)return null;const h=Number(m[1]),n=Number(m[2]);return Number.isFinite(h)&&Number.isFinite(n)?h*60+n:null;}
  function timeText(m){m=Math.max(0,Math.floor(Number(m)||0));const h=Math.floor((m%1440)/60),n=m%60;return `${String(h).padStart(2,'0')}:${String(n).padStart(2,'0')}`;}
  function parseIds(v){
    if(Array.isArray(v))return v.filter(Boolean).map(String);
    const s=txt(v);if(!s)return [];
    try{const x=JSON.parse(s);if(Array.isArray(x))return x.filter(Boolean).map(String);}catch(_){ }
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  function clearlyInUnit(a){
    const location=txt(a?.location);if(!location)return false;
    return /เวชศาสตร์บริการโลหิต|ห้องบริจาคโลหิต|คลังเลือด|blood\s*bank|donor\s*room|cnmi\s*blood/i.test(location);
  }
  function blockingActivity(a){
    try{if(window.cnmiPhysicianActivityV512?.blockingActivity)return !!window.cnmiPhysicianActivityV512.blockingActivity(a);}catch(_){ }
    const type=txt(a?.event_type),words=`${txt(a?.title)} ${txt(a?.note)} ${txt(a?.location)}`;
    if(['อบรม','ประชุม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE'].includes(type))return true;
    if(/ติดสอน|สอน|สัมมนา|conference|training|teaching|ไปประชุม|ไปราชการ|นอกสถานที่|ออกหน่วย/i.test(words))return true;
    if(type==='อื่นๆ'&&txt(a?.location)&&!clearlyInUnit(a))return true;
    return false;
  }
  function rawActivityInterval(a){
    let s=minute(a?.start_time),e=minute(a?.end_time);
    if(s==null&&e==null)return [WORK_START,WORK_END];
    if(s==null)s=0;if(e==null)e=1440;
    if(e<=s)e+=1440;
    return [s,e];
  }
  function overlapInterval(a,b){return Math.max(a[0],b[0])<Math.min(a[1],b[1]);}
  function clippedInterval(a,b){const s=Math.max(a[0],b[0]),e=Math.min(a[1],b[1]);return s<e?[s,e]:null;}
  function leaveInterval(row){
    const k=leaveKind(row);
    if(k==='morning')return [WORK_START,MIDDAY];
    if(k==='afternoon')return [MIDDAY,WORK_END];
    return [WORK_START,WORK_END];
  }
  function activityLabel(a){return txt(a?.event_type)||'กิจกรรม';}
  function blockLabel(b){return b.kind==='leave'?b.label:`${b.label}`;}

  let renderCtx=null;
  function makeContext(date){
    const leavesById=new Map(),activitiesById=new Map(),relevantActivities=[];
    (S()?.leaves||[]).forEach(r=>{
      if(!actualLeave(r)||!inRange(date,r)||!r?.staff_id)return;
      const id=String(r.staff_id);if(!leavesById.has(id))leavesById.set(id,[]);leavesById.get(id).push(r);
    });
    (S()?.activities||[]).forEach(a=>{
      if(!a||!inRange(date,a)||!blockingActivity(a))return;
      relevantActivities.push(a);
      parseIds(a?.participant_ids).forEach(id=>{id=String(id);if(!activitiesById.has(id))activitiesById.set(id,[]);activitiesById.get(id).push(a);});
    });
    return {date,leavesById,activitiesById,relevantActivities};
  }

  function personBlocks(id,date,period=[WORK_START,WORK_END]){
    const sid=String(id||''),out=[],ctx=renderCtx&&renderCtx.date===date?renderCtx:null;
    const leaves=ctx?(ctx.leavesById.get(sid)||[]):(S()?.leaves||[]).filter(r=>String(r?.staff_id||'')===sid&&actualLeave(r)&&inRange(date,r));
    leaves.forEach(r=>{
      const x=clippedInterval(leaveInterval(r),period);if(x)out.push({start:x[0],end:x[1],kind:'leave',label:leaveType(r)||'ลา',title:leaveType(r)||'ลา'});
    });
    const activities=ctx?(ctx.activitiesById.get(sid)||[]):(S()?.activities||[]).filter(a=>a&&inRange(date,a)&&blockingActivity(a)&&parseIds(a?.participant_ids).includes(sid));
    activities.forEach(a=>{
      const x=clippedInterval(rawActivityInterval(a),period);if(x)out.push({start:x[0],end:x[1],kind:'activity',label:activityLabel(a),title:txt(a?.title),raw:a});
    });
    return out.sort((a,b)=>a.start-b.start||a.end-b.end);
  }
  function mergeIntervals(blocks){
    const arr=(blocks||[]).map(b=>[b.start,b.end]).filter(x=>x[0]<x[1]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const out=[];arr.forEach(x=>{const last=out[out.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push(x.slice());});return out;
  }
  function personBlockedAt(blocks,minutePoint){return blocks.some(b=>b.start<=minutePoint&&minutePoint<b.end);}
  function reasonAt(blocks,minutePoint){
    const hits=blocks.filter(b=>b.start<=minutePoint&&minutePoint<b.end);
    const uniq=[];hits.forEach(b=>{const x=blockLabel(b);if(x&&!uniq.includes(x))uniq.push(x);});return uniq.join('+')||'ไม่พร้อม';
  }
  function buildTimeline(staff,date,start,end){
    const blocksById=new Map();
    staff.forEach(p=>blocksById.set(String(p.id),personBlocks(p.id,date,[start,end])));
    const points=new Set([start,end]);blocksById.forEach(bs=>bs.forEach(b=>{points.add(Math.max(start,b.start));points.add(Math.min(end,b.end));}));
    const p=[...points].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b),segments=[];
    for(let i=0;i<p.length-1;i++){
      const a=p[i],b=p[i+1];if(a>=b)continue;const mid=(a+b)/2,absent=[],blocked=[];
      const groupTotal={MT:0,'เคิก':0},groupBlocked={MT:0,'เคิก':0};
      staff.forEach(st=>{
        const bs=blocksById.get(String(st.id))||[];
        const leave=bs.find(x=>x.kind==='leave'&&x.start<=mid&&mid<x.end);
        if(leave){absent.push({id:String(st.id),name:nick(st.id),reason:leave.label});return;}
        const g=groupOf(st);if(g==='MT'||g==='เคิก')groupTotal[g]++;
        const acts=bs.filter(x=>x.kind==='activity'&&x.start<=mid&&mid<x.end);
        if(acts.length){blocked.push({id:String(st.id),name:nick(st.id),group:g,reason:[...new Set(acts.map(x=>x.label))].join('+')});if(g==='MT'||g==='เคิก')groupBlocked[g]++;}
      });
      const total=staff.length-absent.length,available=total-blocked.length;
      const groupAvailable={MT:groupTotal.MT-groupBlocked.MT,'เคิก':groupTotal['เคิก']-groupBlocked['เคิก']};
      const key=absent.map(x=>x.id).sort().join('|')+'/'+blocked.map(x=>x.id+':'+x.reason).sort().join('|');
      const last=segments[segments.length-1];
      if(last&&last.blockedKey===key)last.end=b;
      else segments.push({start:a,end:b,total,available,absent,blocked,blockedKey:key,groupAvailable,groupTotal});
    }
    if(!segments.length)segments.push({start,end,total:staff.length,available:staff.length,absent:[],blocked:[],blockedKey:'',groupAvailable:{MT:staff.filter(x=>groupOf(x)==='MT').length,'เคิก':staff.filter(x=>groupOf(x)==='เคิก').length},groupTotal:{MT:staff.filter(x=>groupOf(x)==='MT').length,'เคิก':staff.filter(x=>groupOf(x)==='เคิก').length}});
    return {staff,blocksById,segments};
  }
  function minSummary(timeline){
    const seg=timeline.segments;
    const minAvailable=Math.min(...seg.map(x=>x.available));
    const total=Math.min(...seg.filter(x=>x.available===minAvailable).map(x=>x.total));
    const minGroups={MT:Math.min(...seg.map(x=>x.groupAvailable.MT)),'เคิก':Math.min(...seg.map(x=>x.groupAvailable['เคิก']))};
    const totalGroups={MT:Math.min(...seg.filter(x=>x.groupAvailable.MT===minGroups.MT).map(x=>x.groupTotal.MT)),'เคิก':Math.min(...seg.filter(x=>x.groupAvailable['เคิก']===minGroups['เคิก']).map(x=>x.groupTotal['เคิก']))};
    return {minAvailable,total,totalGroups,minGroups};
  }
  function impactSummary(staff,date){
    const byType=new Map(),staffIds=new Set(staff.map(p=>String(p.id)));
    const activities=(renderCtx&&renderCtx.date===date)?renderCtx.relevantActivities:(S()?.activities||[]).filter(a=>a&&inRange(date,a)&&blockingActivity(a));
    activities.forEach(a=>{
      const ids=parseIds(a?.participant_ids),type=activityLabel(a);if(!byType.has(type))byType.set(type,new Set());
      const set=byType.get(type),interval=rawActivityInterval(a);ids.forEach(id=>{if(staffIds.has(String(id))){const ls=(renderCtx?.leavesById.get(String(id))||[]).map(leaveInterval);const relevant=clippedInterval(interval,[WORK_START,WORK_END]);if(relevant&&(!ls.length||[relevant[0],...ls.flat()].filter(t=>t>=relevant[0]&&t<relevant[1]).some(t=>!ls.some(l=>l[0]<=t&&t<l[1]))))set.add(String(id));}});
    });
    return [...byType.entries()].map(([type,set])=>({type,count:set.size})).filter(x=>x.count>0);
  }
  function periodBlockPeople(tl){const ids=new Set();tl.segments.forEach(s=>s.blocked.forEach(x=>ids.add(x.id)));return ids.size;}
  function renderTimelineRows(full,total){
    return full.segments.map(s=>{
      const people=s.blocked.length?s.blocked.map(x=>`<span>${esc(x.name)} <small>${esc(x.reason)}</small></span>`).join(''):'<em>ไม่มีคนติดประชุม/กิจกรรม</em>';
      return `<div class="v562-time-row"><b>${timeText(s.start)}–${timeText(s.end)}</b><strong class="${s.available<total?'is-low':''}">พร้อม ${s.available}/${s.total}</strong><div>${people}</div></div>`;
    }).join('');
  }
  function manpowerCard(date){
    const staff=activeStaff(date,{physicians:false});
    const morningTL=buildTimeline(staff,date,WORK_START,MIDDAY),afternoonTL=buildTimeline(staff,date,MIDDAY,WORK_END),fullTL=buildTimeline(staff,date,WORK_START,WORK_END);
    const am=minSummary(morningTL),pm=minSummary(afternoonTL),impacts=impactSummary(staff,date);
    const activityPills=impacts.length?impacts.map(x=>`<span>${esc(x.type)} <b>${x.count}</b></span>`).join(''):'<span class="muted">ไม่มีกิจกรรมที่หักกำลังคน</span>';
    const lowSegments=fullTL.segments.filter(s=>s.available<s.total).length;
    return `<div class="card v433-manpower-card v562-manpower-card" data-v433-manpower data-v562-manpower>
      <div class="v562-title-row"><div class="v433-manpower-title">กำลังคนพร้อมปฏิบัติงาน <small>หักลา + กิจกรรมตามเวลาจริง</small></div><span class="v562-live-pill">08:00–16:00</span></div>
      <div class="v433-period-totals v562-period-totals">
        <div><span>เช้า</span><strong>${am.minAvailable}</strong><small>/${am.total} ต่ำสุด</small></div>
        <div class="v433-divider" aria-hidden="true"></div>
        <div><span>บ่าย</span><strong>${pm.minAvailable}</strong><small>/${pm.total} ต่ำสุด</small></div>
      </div>
      <div class="v433-type-breakdown v562-type-breakdown">
        <div class="v433-type-line"><b>เช้า</b><span>MT <strong>${am.minGroups.MT}</strong>/${am.totalGroups.MT}</span><span>เคิก <strong>${am.minGroups['เคิก']}</strong>/${am.totalGroups['เคิก']}</span>${periodBlockPeople(morningTL)?`<span class="v562-impact">ไม่พร้อม ${periodBlockPeople(morningTL)} คน</span>`:''}</div>
        <div class="v433-type-line"><b>บ่าย</b><span>MT <strong>${pm.minGroups.MT}</strong>/${pm.totalGroups.MT}</span><span>เคิก <strong>${pm.minGroups['เคิก']}</strong>/${pm.totalGroups['เคิก']}</span>${periodBlockPeople(afternoonTL)?`<span class="v562-impact">ไม่พร้อม ${periodBlockPeople(afternoonTL)} คน</span>`:''}</div>
      </div>
      <div class="v562-activity-impact">${activityPills}</div>
      <details class="v562-time-details" ${lowSegments?'':'data-no-impact'}><summary>ดูตามช่วงเวลา</summary><div class="v562-time-list">${renderTimelineRows(fullTL,staff.length)}</div></details>
      <div class="v433-manpower-note">ผู้ลาถูกตัดออกจากฐานในช่วงที่ลา · ประชุม/อบรมหักเฉพาะคนที่ยังปฏิบัติงาน · แพทย์ดูสถานะตามเวลาจริงที่ Consult</div>
    </div>`;
  }

  function assignmentModel(date){
    try{
      const m=window.cnmiPhysicianConsultV452?.baseForDate?.(date);if(!m)return null;
      if(m.weekday)return {weekday:true,rows:[
        {id:m.donor,time:'08:00–16:00',site:'Donor',interval:[WORK_START,WORK_END]},
        {id:m.bb,time:'08:00–16:00',site:'Blood Bank',interval:[WORK_START,WORK_END]},
        {id:m.combined,time:'16:00–08:00',site:'Donor & BB',interval:[WORK_END,WORK_END+16*60]}
      ]};
      return {weekday:false,rows:[{id:m.combined,time:'ตลอดวัน',site:'Donor & BB',interval:[0,1440]}]};
    }catch(_){return null;}
  }
  function physicianBlocks(id,date,period){
    if(!id)return [];
    const base=personBlocks(id,date,[Math.max(0,period[0]),Math.min(1440,period[1])]);
    // Full-day physician leave also blocks an overnight Consult assignment, matching V510 behavior.
    if(period[1]>1440){
      const hasFull=(S()?.leaves||[]).some(r=>String(r?.staff_id||'')===String(id)&&actualLeave(r)&&inRange(date,r)&&leaveKind(r)==='full');
      if(hasFull)base.push({start:period[0],end:period[1],kind:'leave',label:'ลาเต็มวัน',title:'ลาเต็มวัน'});
    }
    return base.sort((a,b)=>a.start-b.start||a.end-b.end);
  }
  function compactReasonBlocks(blocks){
    const out=[];
    blocks.forEach(b=>{
      const label=b.kind==='leave'?b.label:activityLabel(b.raw||{})||b.label;
      const text=(b.kind==='leave'&&/เต็มวัน/.test(label))?label:`${label} ${timeText(b.start)}–${timeText(b.end)}`;
      if(!out.includes(text))out.push(text);
    });
    return out;
  }
  function minReadyForAssignments(rows,start,end,date){
    const activeRows=rows.filter(r=>r.id&&overlapInterval(r.interval,[start,end]));
    if(!activeRows.length)return {min:0,total:0};
    const points=new Set([start,end]);
    const blocks=new Map();
    activeRows.forEach((r,i)=>{
      const bs=physicianBlocks(r.id,date,r.interval).filter(b=>overlapInterval([b.start,b.end],[start,end]));blocks.set(i,bs);
      bs.forEach(b=>{points.add(Math.max(start,b.start));points.add(Math.min(end,b.end));});
      points.add(Math.max(start,r.interval[0]));points.add(Math.min(end,r.interval[1]));
    });
    const p=[...points].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b);let min=Infinity,maxTotal=0;
    for(let j=0;j<p.length-1;j++){
      const a=p[j],b=p[j+1];if(a>=b)continue;const mid=(a+b)/2;
      let total=0,ready=0;activeRows.forEach((r,i)=>{if(r.interval[0]<=mid&&mid<r.interval[1]){total++;if(!personBlockedAt(blocks.get(i)||[],mid))ready++;}});
      if(total){maxTotal=Math.max(maxTotal,total);min=Math.min(min,ready);}
    }
    if(min===Infinity)min=activeRows.length;
    return {min,total:maxTotal||activeRows.length};
  }
  function decoratePhysicianCard(root,date){
    const card=root.querySelector?.('[data-v452-physician-card]');if(!card)return;
    const model=assignmentModel(date);if(!model)return;

    const desktopRows=[...card.querySelectorAll('.v452-dashboard-table tbody tr')];
    const mobileRows=[...card.querySelectorAll('.v456-mobile-consult-row')];
    model.rows.forEach((r,i)=>{
      if(!r.id)return;const blocks=physicianBlocks(r.id,date,r.interval),reasons=compactReasonBlocks(blocks),name=nick(r.id);
      if(!reasons.length)return;
      const status=`<span class="v562-physician-busy"><b>${esc(name)}</b><small>${reasons.map(esc).join(' · ')}</small></span>`;
      const dcell=desktopRows[i]?.children?.[2];if(dcell)dcell.innerHTML=status;
      const mcell=mobileRows[i]?.querySelector?.('.v456-mobile-consult-doctor');if(mcell){const label=mcell.querySelector('.v456-mobile-doctor-label');mcell.innerHTML='';if(label)mcell.appendChild(label);mcell.insertAdjacentHTML('beforeend',status);}
    });

    const meta=card.querySelector('.v452-card-meta');
    if(meta){
      const badge=meta.querySelector('.v452-ready');
      if(model.weekday){
        const day=minReadyForAssignments(model.rows,WORK_START,WORK_END,date);
        const night=minReadyForAssignments(model.rows,WORK_END,WORK_END+16*60,date);
        if(badge){badge.textContent=`กลางวันต่ำสุด ${day.min}/${day.total}`;badge.classList.toggle('is-complete',day.min===day.total);badge.classList.toggle('v562-has-gap',day.min<day.total);}
        let nb=meta.querySelector('.v562-night-ready');if(!nb){nb=document.createElement('span');nb.className='v562-night-ready';badge?.insertAdjacentElement('afterend',nb);}
        nb.textContent=`นอกเวลา ${night.min}/${night.total}`;nb.classList.toggle('is-complete',night.min===night.total);
      }else{
        const all=minReadyForAssignments(model.rows,0,1440,date);
        if(badge){badge.textContent=`พร้อมต่ำสุด ${all.min}/${all.total}`;badge.classList.toggle('is-complete',all.min===all.total);badge.classList.toggle('v562-has-gap',all.min<all.total);}
      }
    }
    if(!card.querySelector('.v562-physician-note'))card.insertAdjacentHTML('beforeend','<div class="v562-physician-note">ประชุม/อบรม/ออกหน่วยหักเฉพาะช่วงเวลาจริง · หลายกิจกรรมของแพทย์คนเดียวแสดงครบทุกช่วง</div>');
  }

  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    const date=selectedDate();renderCtx=makeContext(date);
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      if(!isOffDay(date)){
        const old=tpl.content.querySelector('[data-v433-manpower]');
        if(old){const box=document.createElement('template');box.innerHTML=manpowerCard(date).trim();old.replaceWith(box.content.firstElementChild);}
      }
      decoratePhysicianCard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decorate`,err);return html;}
    finally{renderCtx=null;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV562(){return decorate(String(previousDashboard.apply(this,arguments)||''));};
    wrapped.__v562Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v562-style';style.textContent=`
    .v562-manpower-card{gap:9px!important}.v562-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.v562-live-pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#edf7ff;border:1px solid #cfe8f8;color:#38749a;font-size:9px;font-weight:900;white-space:nowrap}
    .v562-period-totals small{white-space:nowrap}.v562-type-breakdown .v433-type-line{align-items:center}.v562-impact{display:inline-flex;padding:2px 6px;border-radius:999px;background:#fff3e5;color:#a65e16;font-weight:850}
    .v562-activity-impact{display:flex;gap:5px;flex-wrap:wrap}.v562-activity-impact>span{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:999px;background:#fff7e9;border:1px solid #ffe0ad;color:#8d651e;font-size:9px;font-weight:800}.v562-activity-impact>span.muted{background:#f6f8fa;border-color:#e7edf2;color:#8a99a6}.v562-activity-impact b{color:#6f4b0d}
    .v562-time-details{border-top:1px dashed #dce7ef;padding-top:7px}.v562-time-details summary{cursor:pointer;color:#2d79a8;font-size:10px;font-weight:900;list-style:none}.v562-time-details summary::-webkit-details-marker{display:none}.v562-time-details summary::before{content:'▸';display:inline-block;margin-right:5px;transition:transform .15s}.v562-time-details[open] summary::before{transform:rotate(90deg)}.v562-time-list{display:grid;gap:5px;margin-top:7px}.v562-time-row{display:grid;grid-template-columns:86px 94px minmax(0,1fr);align-items:start;gap:7px;padding:6px 7px;border-radius:9px;background:#f8fbfd;font-size:9px;color:#657b8d}.v562-time-row>b{color:#324e66}.v562-time-row>strong{color:#2b7caa}.v562-time-row>strong.is-low{color:#b05f16}.v562-time-row>div{display:flex;gap:4px;flex-wrap:wrap}.v562-time-row span{display:inline-flex;gap:3px;padding:2px 5px;border-radius:999px;background:#fff2e2;color:#8c5d18;font-weight:800}.v562-time-row span small{font-size:8px;color:#a77936}.v562-time-row em{font-style:normal;color:#8da0af}
    .v562-physician-busy{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;max-width:100%;padding:6px 9px;border-radius:12px;background:#fff6e7;border:1px solid #ffd89a;color:#8f5e14;line-height:1.25}.v562-physician-busy b{font-size:11px}.v562-physician-busy small{font-size:9px;color:#a46d18;white-space:normal}.v562-night-ready{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eef6fc;border:1px solid #d6e7f3;color:#55758c;font-size:9px;font-weight:900}.v562-night-ready.is-complete{background:#eef9f2;border-color:#ccebd7;color:#3f7b57}.v452-ready.v562-has-gap{background:#fff7e7!important;border-color:#ffd99a!important;color:#956111!important}.v562-physician-note{margin-top:8px;font-size:9px;line-height:1.35;color:#8a9cab}
    @media(max-width:820px){
      .v562-title-row{align-items:flex-start}.v562-live-pill{font-size:10px;padding:5px 8px}.v562-activity-impact>span{font-size:10px;padding:5px 8px}.v562-time-details summary{font-size:12px}.v562-time-row{grid-template-columns:88px 98px minmax(0,1fr);font-size:10px;padding:7px 8px}.v562-time-row span small{font-size:9px}.v562-physician-busy{padding:7px 11px}.v562-physician-busy b{font-size:14px}.v562-physician-busy small{font-size:11px}.v562-night-ready{font-size:10px;padding:5px 8px}.v562-physician-note{font-size:10px}
    }
    @media(max-width:520px){
      .v562-title-row{display:grid;grid-template-columns:1fr auto}.v562-manpower-card .v433-manpower-title small{display:block;margin:3px 0 0}.v562-time-row{grid-template-columns:78px 1fr}.v562-time-row>div{grid-column:1/-1;padding-left:0}.v562-time-row>strong{text-align:right}.v562-activity-impact{gap:4px}
    }
  `;document.head.appendChild(style);

  function versionChip(){try{document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{chip.textContent='v564';chip.title='Realtime manpower availability by leave + activity time (V562)';});}catch(_){ }}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',versionChip,{once:true});else versionChip();
  window.addEventListener('pageshow',versionChip);
  window.cnmiAvailabilityV562={version:VERSION,personBlocks,buildTimeline,manpowerCard,blockingActivity};
  console.info(`[${VERSION}] loaded`);
})();
