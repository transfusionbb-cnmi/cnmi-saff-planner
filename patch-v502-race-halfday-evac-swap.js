/* CNMI Staff Planner V502
 * Code 01 / RACE daily board bridge.
 * - Weekday daytime: derive RACE from actual daily-position assignments.
 * - Weekday evening: derive from ChBD + Ch4 while Ch4 is still on site.
 * - Night / after Ch4: derive from ChBD only.
 * - Weekend donor-open period: Ch3A=Donor Main, Ch3B=Finger/Interview, Ch9=Register.
 * - Weekend helpers who are not official roster assignments are intentionally excluded.
 * - Daytime emergency team leader: Parichat when present; fallback to BB-Approve, then first available assigned staff.
 * - Off-hours emergency team leader: ChBD1, then ChBD2/3 fallback.
 * - V501: one person can appear in only one R/A/C/E role per phase.
 * - Off-hours with only ChBD1-3: no fixed Rescue; Alarm and Control are separate people; Evacuate is a whole-team action when ordered.
 * - Weekday daytime: the two scheduled consult physicians are assigned to Rescue when present; full-day leave/training/off-site physicians are excluded.
 * - Daytime Control targets four distinct operators: 2 Blood Bank + 2 Component Prep/Manual, with zone-local fallbacks.
 * - Donor evacuation note: actively donating / needing staff assistance = yellow group; after needle removal and able to walk independently = green group.
 * - Extinguisher quick guide is shown persistently instead of the copy-roster action.
 * - V502: half-day leave never holds a fixed R/A/C role: a full-day Evacuate candidate covers that role for the whole day; the half-day person becomes Evacuate only while on site.
 * - V502: dashboard exception box is intentionally limited to leave information; routine staffing/target hints are not repeated there.
 * Display-only; no Supabase schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V502_RACE_HALFDAY_EVAC_SWAP';
  if(window.__CNMI_V502_RACE_HALFDAY_EVAC_SWAP__) return;
  window.__CNMI_V502_RACE_HALFDAY_EVAC_SWAP__=true;

  const ROLE_META={
    R:{title:'Rescue',thai:'ช่วยผู้บริจาค / ผู้ที่อยู่ในอันตราย'},
    A:{title:'Alarm',thai:'แจ้งเหตุ · ครอบคลุมด้านหน้าและด้านหลัง'},
    C:{title:'Control',thai:'ควบคุมพื้นที่ / ระงับเหตุขั้นต้น'},
    E:{title:'Evacuate',thai:'อพยพ / ตรวจผู้ตกค้าง'}
  };
  const ROLE_ORDER=['R','A','C','E'];
  const phaseStore=window.__CNMI_V502_RACE_PHASES__||(window.__CNMI_V502_RACE_PHASES__={});

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return escapeHtml(txt(v));}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){return txt(v).slice(0,10);}
  function selectedDate(){
    try{const d=window.cnmiDashboardDateV443?.selectedDate?.();if(/^\d{4}-\d{2}-\d{2}$/.test(txt(d)))return txt(d);}catch(_){ }
    try{const d=S().dashboardDateV443;if(/^\d{4}-\d{2}-\d{2}$/.test(txt(d)))return txt(d);}catch(_){ }
    try{return normDate(todayStr());}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function thaiDate(date){try{return formatThaiDate(date);}catch(_){return date;}}
  function isWeekendDate(date){try{return !!isWeekend(date);}catch(_){const d=new Date(`${date}T12:00:00`);return d.getDay()===0||d.getDay()===6;}}
  function isHoliday(date){try{return !!isHolidayDate(date);}catch(_){return false;}}
  function staffById(id){return (S().staff||[]).find(s=>String(s?.id)===String(id))||null;}
  function staffName(id){const s=staffById(id);return txt(s?.nickname||s?.full_name)||'-';}
  function staffHtml(id,extra=''){
    if(!id)return '<span class="v497-empty-person">ยังไม่มีผู้รับผิดชอบ</span>';
    let html='';
    try{html=staffPill(id);}catch(_){html=`<span class="v497-person-fallback">${esc(staffName(id))}</span>`;}
    return `<span class="v497-person">${html}${extra?`<small>${esc(extra)}</small>`:''}</span>`;
  }
  function isParichat(st){
    const n=txt(st?.nickname).toLowerCase();
    const f=txt(st?.full_name).replace(/\s+/g,'');
    return n==='มัส'||n==='mus'||f.includes('ปาริฉัตร');
  }
  function normalizeCode(v){return txt(v).toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');}
  function positionCode(row){return txt(row?.position_code||row?.code);}
  function positionRole(code){
    const k=normalizeCode(code);
    if(/^drmain(?:1|2)?$/.test(k)||k.startsWith('drmain')) return 'R';
    if(k.startsWith('drregister')||k.startsWith('drregistration')||k.startsWith('bbsupport')) return 'A';
    if(k.startsWith('bbstockissue')||k.startsWith('bbmanual4')) return 'C';
    if(k.startsWith('bbapprove')||k.startsWith('bbreport')||k.startsWith('bbmanual1')||k.startsWith('bbmanual2')||k.startsWith('bbmanual3')||k.startsWith('drfinger')||k.startsWith('drsupport')) return 'E';
    return '';
  }
  function positionZone(code){
    const k=normalizeCode(code);
    if(k.startsWith('dr')) return 'front';
    return 'back';
  }
  function positionArea(code){
    const k=normalizeCode(code);
    if(k.startsWith('dr'))return 'front';
    if(k.startsWith('bbmanual'))return 'manual';
    return 'bloodbank';
  }
  function codeLabel(row){
    const c=positionCode(row);
    try{return txt(positionLabelForCell(c)||c);}catch(_){return c;}
  }
  function rowsForDate(date){
    try{if(window.cnmiDashboardPositionsV434?.rowsFor)return window.cnmiDashboardPositionsV434.rowsFor(date)||[];}catch(_){ }
    return (S().positions||[]).filter(r=>normDate(r?.work_date)===date&&positionCode(r));
  }
  function parseIds(v){
    if(Array.isArray(v))return v.filter(Boolean).map(String);
    const s=txt(v);if(!s)return [];
    try{const a=JSON.parse(s);if(Array.isArray(a))return a.filter(Boolean).map(String);}catch(_){ }
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  function minutes(v){const m=txt(v).match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;}
  function fullDayActivity(a){
    const t=txt(a?.event_type);
    if(!['อบรม','ประชุม','ออกหน่วย'].includes(t))return false;
    const a0=minutes(a?.start_time),b0=minutes(a?.end_time);
    if(a0==null||b0==null)return t==='ออกหน่วย';
    let b=b0;if(b<=a0)b+=1440;
    return (b-a0)>=360 || (a0<=540&&b0>=930);
  }
  function inRange(date,a){return (!a?.start_date||date>=normDate(a.start_date))&&(!a?.end_date||date<=normDate(a.end_date));}
  function effectiveLeave(l){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(l):txt(l?.status).toLowerCase()!=='cancelled';}catch(_){return true;}}
  function overlapsLeave(l,date){try{return typeof overlapsDate==='function'?!!overlapsDate(l,date):normDate(l?.start_date)<=date&&normDate(l?.end_date||l?.start_date)>=date;}catch(_){return false;}}
  function leavePeriod(l){
    const p=txt(l?.leave_period||l?.period||'เต็มวัน').toLowerCase();
    if(p.includes('ครึ่งเช้า')||p.includes('morning'))return 'morning';
    if(p.includes('ครึ่งบ่าย')||p.includes('afternoon'))return 'afternoon';
    return 'full';
  }
  function unavailableDay(date){
    const full=new Set(),partial=new Map(),reasons=new Map(),leaveInfo=new Map();
    (S().leaves||[]).forEach(l=>{
      if(!effectiveLeave(l)||!overlapsLeave(l,date))return;
      const type=txt(l?.type||l?.leave_type).split(':::')[0].trim();
      if(!type||type==='ไม่รับเวร')return;
      const id=String(l?.staff_id||'');if(!id)return;
      const p=leavePeriod(l);
      if(p==='full'){
        full.add(id);reasons.set(id,type||'ลา');leaveInfo.set(id,{period:'full',type:type||'ลา'});
      }else{
        partial.set(id,p);leaveInfo.set(id,{period:p,type:type||'ลา'});
      }
    });
    (S().activities||[]).forEach(a=>{
      if(!inRange(date,a)||!fullDayActivity(a))return;
      parseIds(a?.participant_ids).forEach(id=>{full.add(String(id));reasons.set(String(id),txt(a?.event_type)||'กิจกรรม');});
    });
    return {full,partial,reasons,leaveInfo};
  }
  function uniquePeople(list){
    const seen=new Set();return (list||[]).filter(x=>{const id=String(x?.staff_id||x?.id||'');if(!id||seen.has(id))return false;seen.add(id);return true;});
  }
  function emptyRoles(){return {R:[],A:[],C:[],E:[]};}
  function addRole(roles,role,person){if(role&&person?.staff_id&&!roles[role].some(x=>String(x.staff_id)===String(person.staff_id)))roles[role].push(person);}
  function removeLeaderFromRoles(roles,leaderId){
    if(!leaderId)return;
    ROLE_ORDER.forEach(role=>{roles[role]=roles[role].filter(p=>String(p?.staff_id)!==String(leaderId));});
  }
  function roleOfStaff(roles,staffId){
    const sid=String(staffId||'');
    if(!sid)return '';
    return ROLE_ORDER.find(r=>(roles[r]||[]).some(p=>String(p?.staff_id)===sid))||'';
  }
  function addExclusiveRole(roles,role,person){
    if(!role||!person?.staff_id)return false;
    const current=roleOfStaff(roles,person.staff_id);
    if(current)return current===role;
    addRole(roles,role,person);
    return true;
  }
  function physicianDaytimePeople(date,unavailable,warnings,pushLeaveWarning){
    const api=window.cnmiPhysicianConsultV452;
    if(!api?.baseForDate)return [];
    let model=null;
    try{model=api.baseForDate(date);}catch(_){return [];}
    if(!model?.weekday)return [];
    const slots=[['donor','แพทย์ Consult · Donor'],['bb','แพทย์ Consult · Blood Bank']];
    const seen=new Set(),out=[];
    slots.forEach(([key,label])=>{
      const sid=String(model?.[key]||'');
      if(!sid)return;
      if(unavailable.full.has(sid)){
        const li=unavailable.leaveInfo?.get(sid);
        if(li&&pushLeaveWarning)pushLeaveWarning(sid,`${staffName(sid)} ลาทั้งวัน`);
        return;
      }
      const p=unavailable.partial.get(sid)||'';
      if(p&&pushLeaveWarning){
        const present=p==='morning'?'บ่าย':'เช้า';
        pushLeaveWarning(sid,`${staffName(sid)} ลาครึ่ง${p==='morning'?'เช้า':'บ่าย'} · ช่วง${present}เป็น Evacuate`);
      }
      if(seen.has(sid))return;
      seen.add(sid);
      out.push({staff_id:sid,label,slot:key,partial:p});
    });
    return out;
  }

  function daytimePlan(date){
    const unavailable=unavailableDay(date);
    const roles=emptyRoles(),warnings=[];
    const warningIds=new Set();
    const pushLeaveWarning=(sid,msg)=>{const key=String(sid||'')+'|'+String(msg||'');if(!warningIds.has(key)){warningIds.add(key);warnings.push(msg);}};
    const allRows=rowsForDate(date).filter(r=>positionRole(positionCode(r)));
    const availableRows=[];
    const seenStaff=new Set();
    allRows.forEach(row=>{
      const sid=String(row?.staff_id||'');
      if(!sid)return;
      if(unavailable.full.has(sid)){
        if(unavailable.leaveInfo?.has(sid))pushLeaveWarning(sid,`${staffName(sid)} ลาทั้งวัน`);
        return;
      }
      const p=unavailable.partial.get(sid)||'';
      const item={row,staff_id:sid,label:codeLabel(row),partial:p,zone:positionZone(positionCode(row)),area:positionArea(positionCode(row))};
      availableRows.push(item);
      seenStaff.add(sid);
      if(p){
        const present=p==='morning'?'บ่าย':'เช้า';
        pushLeaveWarning(sid,`${staffName(sid)} ลาครึ่ง${p==='morning'?'เช้า':'บ่าย'} · ช่วง${present}เป็น Evacuate`);
      }
    });

    // ผู้ลาครึ่งวันไม่ถือ fixed R/A/C หรือหัวหน้าทีมทั้งวัน เพื่อไม่ต้องเปลี่ยนบอร์ดตอนเที่ยง
    const fullDayRows=availableRows.filter(x=>!x.partial);
    const parichat=(S().staff||[]).find(isParichat);
    let leaderId='';let leaderNote='';
    if(parichat&&fullDayRows.some(x=>String(x.staff_id)===String(parichat.id))){leaderId=String(parichat.id);leaderNote='หัวหน้าหน่วย · อยู่หน้างาน';}
    if(!leaderId){
      const approve=fullDayRows.find(x=>normalizeCode(positionCode(x.row)).startsWith('bbapprove'));
      if(approve){leaderId=String(approve.staff_id);leaderNote='ผู้แทนหัวหน้าทีม · BB-Approve';}
    }
    if(!leaderId&&fullDayRows[0]){leaderId=String(fullDayRows[0].staff_id);leaderNote='ผู้แทนหัวหน้าทีม';}

    const pool=fullDayRows.filter(x=>String(x.staff_id)!==String(leaderId));
    const partialPool=availableRows.filter(x=>x.partial&&String(x.staff_id)!==String(leaderId));
    const used=new Set();
    const rowBy=(codes)=>{
      for(const c of codes){
        const hit=pool.find(x=>normalizeCode(positionCode(x.row)).startsWith(c)&&!used.has(String(x.staff_id)));
        if(hit)return hit;
      }
      return null;
    };
    const fallbackByArea=(areas)=>{
      const wanted=Array.isArray(areas)?areas:[areas];
      return pool.find(x=>!used.has(String(x.staff_id))&&wanted.includes(x.area))||null;
    };
    const fallbackAny=()=>pool.find(x=>!used.has(String(x.staff_id)))||null;
    const take=(role,item,secondary='')=>{
      if(!item||used.has(String(item.staff_id)))return false;
      const p={staff_id:String(item.staff_id),label:item.label,secondary:secondary||item.label};
      addRole(roles,role,p);used.add(String(item.staff_id));return true;
    };
    const takeSlot=(role,item,area,normalText,replacementText)=>{
      if(item)return take(role,item,normalText||item.label);
      const fb=fallbackByArea(area)||fallbackAny();
      return fb?take(role,fb,replacementText||`${fb.label} · ผู้แทน`):false;
    };

    // R — Rescue: DR-Main ที่อยู่เต็มวันเป็นหลัก; ถ้าลาครึ่งวัน ดึงคนที่เดิมจะเป็น E ในโซนหน้าแทนทั้งวัน
    let r1=rowBy(['drmain1']);
    takeSlot('R',r1,'front',r1?'DR-Main 1 · จุดเจาะเก็บ':'',r1?'':null);
    if(!r1&&roles.R.length){roles.R[roles.R.length-1].secondary=`${roles.R[roles.R.length-1].label} · แทน Rescue จุดเจาะเก็บ 1`;}
    let r2=rowBy(['drmain2']);
    takeSlot('R',r2,'front',r2?'DR-Main 2 · จุดเจาะเก็บ':'',r2?'':null);
    if(!r2&&roles.R.length){const last=roles.R[roles.R.length-1];if(!String(last.secondary).includes('จุดเจาะเก็บ 1'))last.secondary=`${last.label} · แทน Rescue จุดเจาะเก็บ 2`;}

    // A — Alarm: ด้านหน้า + ด้านหลัง คนละคน; ถ้าคนหลักลาครึ่งวันใช้คน E ใกล้เคียงแทนทั้งวัน
    let alarmFront=rowBy(['drregister','drregistration']);
    if(!alarmFront)alarmFront=rowBy(['drfinger','drsupport']);
    takeSlot('A',alarmFront,'front',alarmFront?`${alarmFront.label} · ด้านหน้า`:'',`${(fallbackByArea('front')||{}).label||'ผู้แทน'} · แทน Alarm ด้านหน้า`);
    let alarmBack=rowBy(['bbsupport']);
    if(!alarmBack)alarmBack=rowBy(['bbreport','bbapprove','bbstockissue']);
    takeSlot('A',alarmBack,['bloodbank','manual'],alarmBack?`${alarmBack.label} · ด้านหลัง`:'',`${(fallbackByArea(['bloodbank','manual'])||{}).label||'ผู้แทน'} · แทน Alarm ด้านหลัง`);

    // C — Control เป้าหมาย 4 คน: Blood Bank 2 + Component Prep/Manual 2
    let c1=rowBy(['bbstockissue']);
    if(!c1)c1=rowBy(['bbreport','bbapprove']);
    takeSlot('C',c1,'bloodbank',c1?`${c1.label} · Blood Bank 1`:'',`${(fallbackByArea('bloodbank')||{}).label||'ผู้แทน'} · แทน Control Blood Bank 1`);
    let c2=rowBy(['bbreport']);
    if(!c2)c2=rowBy(['bbstockissue','bbapprove']);
    takeSlot('C',c2,'bloodbank',c2?`${c2.label} · Blood Bank 2`:'',`${(fallbackByArea('bloodbank')||{}).label||'ผู้แทน'} · แทน Control Blood Bank 2`);
    let c3=rowBy(['bbmanual3']);
    if(!c3)c3=rowBy(['bbmanual2','bbmanual1','bbmanual4']);
    takeSlot('C',c3,'manual',c3?`${c3.label} · Component Prep 1`:'',`${(fallbackByArea('manual')||{}).label||'ผู้แทน'} · แทน Control Component Prep 1`);
    let c4=rowBy(['bbmanual4']);
    if(!c4)c4=rowBy(['bbmanual2','bbmanual1','bbmanual3']);
    takeSlot('C',c4,'manual',c4?`${c4.label} · Component Prep 2`:'',`${(fallbackByArea('manual')||{}).label||'ผู้แทน'} · แทน Control Component Prep 2`);

    // แพทย์ Consult: อยู่เต็มวันช่วย Rescue; ลาครึ่งวันจะอยู่ E เฉพาะช่วงที่มาปฏิบัติงาน
    const doctors=physicianDaytimePeople(date,unavailable,warnings,pushLeaveWarning);
    doctors.filter(p=>!p.partial).forEach(p=>{
      if(String(p.staff_id)===String(leaderId)||used.has(String(p.staff_id)))return;
      addRole(roles,'R',{staff_id:String(p.staff_id),label:p.label,secondary:`${p.label} · ช่วย Rescue`});
      used.add(String(p.staff_id));
    });

    // E — คนที่เหลือ + ผู้ลาครึ่งวันในช่วงที่อยู่หน้างาน
    pool.forEach(item=>{
      if(used.has(String(item.staff_id)))return;
      take('E',item,`${item.label} · อพยพ/ตรวจผู้ตกค้าง`);
    });
    partialPool.forEach(item=>{
      if(used.has(String(item.staff_id)))return;
      const present=item.partial==='morning'?'บ่าย':'เช้า';
      addRole(roles,'E',{staff_id:String(item.staff_id),label:item.label,secondary:`${item.label} · Evacuate เฉพาะช่วง${present}`});
      used.add(String(item.staff_id));
    });
    doctors.filter(p=>p.partial).forEach(p=>{
      if(String(p.staff_id)===String(leaderId)||used.has(String(p.staff_id)))return;
      const present=p.partial==='morning'?'บ่าย':'เช้า';
      addRole(roles,'E',{staff_id:String(p.staff_id),label:p.label,secondary:`${p.label} · Evacuate เฉพาะช่วง${present}`});
      used.add(String(p.staff_id));
    });

    const teamIds=uniquePeople([...availableRows.map(x=>({staff_id:x.staff_id})),...doctors.map(x=>({staff_id:x.staff_id}))]);
    return {id:'day',label:'กลางวัน',sub:'อิงตำแหน่งกลางวันจริง',leaderId,leaderNote,roles,roleNotes:{},roleTips:{R:'กลุ่มอพยพผู้บริจาค: กำลังเจาะ/ยังต้องมีคนช่วยก่อนเคลื่อนย้าย = เหลือง · หลังถอดเข็มและเดินได้เอง = เขียว'},warnings,teamCount:teamIds.length,note:'ลาครึ่งวัน: ใช้ผู้ปฏิบัติจาก Evacuate แทน R/A/C เดิมตลอดวัน เพื่อไม่ต้องเปลี่ยนบอร์ดกลางวัน; ผู้ลาครึ่งวันอยู่ Evacuate เฉพาะช่วงที่มาปฏิบัติงาน'};
  }

  function dutyCode(a){return txt(a?.duty_code);}
  function dutyRows(date){return (S().rosterAssignments||[]).filter(a=>normDate(a?.duty_date)===date&&a?.staff_id);}
  function findDuty(rows,codes){return rows.find(a=>codes.includes(dutyCode(a)))||null;}
  function dutyPerson(a,extra=''){return a?{staff_id:String(a.staff_id),label:(window.DUTY_LABEL?.[dutyCode(a)]||((typeof DUTY_LABEL!=='undefined'&&DUTY_LABEL[dutyCode(a)])||dutyCode(a))),secondary:extra}:null;}
  function dutyLeader(rows){
    const a=findDuty(rows,['ชบด1'])||findDuty(rows,['ชบด2'])||findDuty(rows,['ชบด3'])||rows[0];
    return a?{id:String(a.staff_id),note:`หัวหน้าทีมจาก ${dutyCode(a)}`}: {id:'',note:''};
  }
  function dutyPlan(date,kind){
    const all=dutyRows(date);
    const chbd=all.filter(a=>['ชบด1','ชบด2','ชบด3'].includes(dutyCode(a)));
    const ch4=all.filter(a=>['ช4','ช4A','ช4B'].includes(dutyCode(a)));
    const donor=all.filter(a=>['ช3A','ช3B','ช9','ช9-เคิก','ช9-MT'].includes(dutyCode(a)));
    let included=[],label='',sub='',note='';
    if(kind==='weekend-donor'){
      included=[...chbd,...donor];label='ช่วงเปิดห้องบริจาค';sub='เสาร์–อาทิตย์ · เฉพาะเวรหลักใน Staff Planner';
      note='ผู้มาช่วยที่ไม่ได้อยู่ในเวรหลักของหน่วยจะไม่ถูกดึงเข้า RACE อัตโนมัติ';
    }else if(kind==='evening'){
      included=[...chbd,...ch4];label='ช่วงเย็น';sub=ch4.length?'ชบด + ช4 (ระหว่างผู้ปฏิบัติ ช4 ยังอยู่)':'ชบด';
      note=ch4.length?'เมื่อผู้ปฏิบัติ ช4 กลับ ให้ใช้แผน “กลางคืน” ต่อ':'ไม่มี ช4 ในตารางวันนี้';
    }else if(kind==='holiday'){
      included=[...chbd];label='วันหยุด / 24 ชม.';sub='อิง ชบด1–3';note='ไม่มีตำแหน่งกลางวันแบบวันราชการ';
    }else{
      included=[...chbd];label='กลางคืน';sub='หลังห้องบริจาค/ช4 ปิด · อิง ชบด1–3';note='ช่วงนี้ไม่มีผู้บริจาคตามการทำงานปกติของหน่วย';
    }
    included=uniquePeople(included.map(a=>({staff_id:String(a.staff_id),assignment:a}))).map(x=>x.assignment);
    const roles=emptyRoles(),roleNotes={},roleTips={},warnings=[];
    const leader=dutyLeader(included);
    const working=included.filter(a=>String(a?.staff_id)!==String(leader.id));
    const get=(code)=>working.filter(a=>dutyCode(a)===code);
    const claim=(role,a,extra='')=>{
      if(!a)return false;
      const p=dutyPerson(a,extra);
      return addExclusiveRole(roles,role,p);
    };
    const claimMany=(role,arr,extra='')=>(arr||[]).forEach(a=>claim(role,a,extra));
    const firstUnassigned=(codes=[])=>{
      for(const code of codes){
        const a=get(code).find(x=>!roleOfStaff(roles,x.staff_id));
        if(a)return a;
      }
      return working.find(x=>!roleOfStaff(roles,x.staff_id))||null;
    };

    if(kind==='weekend-donor'){
      roleTips.R='กลุ่มอพยพผู้บริจาค: กำลังเจาะ/ยังต้องมีคนช่วยก่อนเคลื่อนย้าย = เหลือง · หลังถอดเข็มและเดินได้เอง = เขียว';
      // Donor open: ช3A อยู่จุดเจาะเก็บ = Rescue, ช9/Register = Alarm, ช3B/Finger = Evacuate
      claimMany('R',get('ช3A'));
      const alarm=firstUnassigned(['ช9','ช9-เคิก','ช9-MT','ชบด2','ชบด3']);
      if(alarm)claim('A',alarm,'Alarm ประจำกะ');
      claimMany('E',get('ช3B'));
      // เจ้าหน้าที่คลังเลือดที่เหลือรับ Control โดยไม่ซ้ำกับ role อื่น
      [...get('ชบด2'),...get('ชบด3')].forEach(a=>{if(!roleOfStaff(roles,a.staff_id))claim('C',a,'Control ประจำกะ');});
      if(!roles.R.length){const a=firstUnassigned(['ช3B','ช9','ช9-เคิก','ช9-MT','ชบด2','ชบด3']);if(a)claim('R',a,'สำรอง Rescue');}
      if(!roles.E.length){const a=firstUnassigned(['ช3B','ช9','ช9-เคิก','ช9-MT','ช3A','ชบด3','ชบด2']);if(a)claim('E',a,'สำรอง Evacuate');}
      if(!roles.C.length){const a=firstUnassigned(['ชบด3','ชบด2']);if(a)claim('C',a,'สำรอง Control');}
    }else if(kind==='evening'){
      // หลังห้องบริจาคปิด ไม่มีผู้บริจาค: ไม่กำหนด Rescue ประจำ
      roleNotes.R='ไม่กำหนดผู้รับผิดชอบประจำช่วงนี้ · หากพบผู้ที่อยู่ในอันตราย ให้ผู้พบเหตุ Rescue ตามหลัก RACE';
      const alarm=firstUnassigned(['ชบด2','ชบด3']);
      if(alarm)claim('A',alarm,'Alarm ประจำกะ');
      const control=firstUnassigned(['ชบด3','ชบด2']);
      if(control)claim('C',control,'Control ประจำกะ');
      claimMany('E',[...get('ช4'),...get('ช4A'),...get('ช4B')],'Evacuate ประจำช่วงเย็น');
      if(!roles.E.length)roleNotes.E='ทุกคนเมื่อมีคำสั่งอพยพ';
    }else{
      // กลางคืน/วันหยุดที่ไม่มี Donor: ชบด1 เป็นหัวหน้าทีม, ชบด2 Alarm, ชบด3 Control
      // Rescue ไม่ตั้งคนประจำ และ Evacuate เป็นการปฏิบัติของทั้งทีมเมื่อมีคำสั่ง
      roleNotes.R='ไม่กำหนดผู้รับผิดชอบประจำช่วงนี้ · ไม่มีผู้บริจาคตามการทำงานปกติ';
      roleNotes.E='ทุกคนเมื่อมีคำสั่งอพยพ · หัวหน้าทีมตรวจสอบความครบถ้วน';
      const alarm=firstUnassigned(['ชบด2','ชบด3']);
      if(alarm)claim('A',alarm,'Alarm ประจำกะ');
      const control=firstUnassigned(['ชบด3','ชบด2']);
      if(control)claim('C',control,'Control ประจำกะ');
    }

    removeLeaderFromRoles(roles,leader.id);
    ROLE_ORDER.forEach(r=>{if(!roles[r].length&&!roleNotes[r])warnings.push(`${ROLE_META[r].title} ยังไม่มีผู้รับผิดชอบในเวรนี้ (ไม่จัดชื่อซ้ำข้าม R/A/C/E)`);});
    if(!included.length)warnings.push('ยังไม่มีรายชื่อเวรที่ใช้สร้าง RACE ในช่วงนี้');
    if(included.length===1&&leader.id)warnings.push('เวรนี้มีเพียงหัวหน้าทีมฉุกเฉิน 1 คน จึงยังไม่มีผู้ปฏิบัติ R/A/C/E');
    const leaderRule='หัวหน้าทีมฉุกเฉินแยกจาก R/A/C/E และผู้ปฏิบัติ 1 คนไม่ซ้ำหลายบทบาท';
    return {id:kind,label,sub,leaderId:leader.id,leaderNote:leader.note,roles,roleNotes,roleTips,warnings,teamCount:included.length,note:[note,leaderRule].filter(Boolean).join(' · ')};
  }

  function buildPlans(date){
    const weekend=isWeekendDate(date),holiday=isHoliday(date),rows=dutyRows(date);
    const hasDonor=rows.some(a=>['ช3A','ช3B','ช9','ช9-เคิก','ช9-MT'].includes(dutyCode(a)));
    const hasCh4=rows.some(a=>['ช4','ช4A','ช4B'].includes(dutyCode(a)));
    if(weekend&&hasDonor)return [dutyPlan(date,'weekend-donor'),dutyPlan(date,'night')];
    if(weekend||holiday)return [dutyPlan(date,'holiday')];
    const plans=[daytimePlan(date)];
    if(hasCh4)plans.push(dutyPlan(date,'evening'));
    plans.push(dutyPlan(date,'night'));
    return plans;
  }

  function roleHtml(role,people,note='',tip=''){
    const m=ROLE_META[role];
    const body=people.length?people.map(p=>staffHtml(p.staff_id,p.secondary||p.label)).join(''):(note?`<span class="v500-role-policy">${esc(note)}</span>`:'<span class="v497-empty-person">ยังไม่มีผู้รับผิดชอบ</span>');
    return `<section class="v497-role v497-role-${role}">
      <div class="v497-role-head"><span class="v497-letter">${role}</span><div><b>${m.title}</b><small>${m.thai}</small></div><em>${people.length}</em></div>
      <div class="v497-role-people">${body}</div>
      ${tip?`<div class="v501-role-tip">${esc(tip)}</div>`:''}
    </section>`;
  }
  function planHtml(plan,date){
    return `<div class="v497-plan" data-v497-plan="${esc(plan.id)}">
      <div class="v497-leader-row"><div><span>หัวหน้าทีมฉุกเฉิน</span>${plan.leaderId?staffHtml(plan.leaderId,plan.leaderNote):'<b class="v497-no-leader">ยังไม่มีผู้รับผิดชอบ</b>'}</div><div class="v497-team-count"><strong>${plan.teamCount}</strong><span>คนในแผน</span></div></div>
      <div class="v497-role-grid">${ROLE_ORDER.map(r=>roleHtml(r,plan.roles[r]||[],plan.roleNotes?.[r]||'',plan.roleTips?.[r]||'')).join('')}</div>
      ${plan.warnings?.length?`<div class="v497-warnings"><b>การลาวันนี้</b>${plan.warnings.map(w=>`<span>• ${esc(w)}</span>`).join('')}</div>`:''}
      <div class="v497-plan-note">${esc(plan.note||'')}</div>
      <div class="v497-actions"><button type="button" class="soft-btn" data-v497-race-info>ดูหลัก RACE ของ รพ.</button><div class="v501-ext-guide"><b>ถังดับเพลิง</b><span>ดึงสายฉีด → ปลดสลัก → กดคันบีบ → ส่ายปลายสายไปที่ฐานไฟ</span></div></div>
    </div>`;
  }
  function cardHtml(date){
    const plans=buildPlans(date);if(!plans.length)return '';
    let phase=phaseStore[date];if(!plans.some(p=>p.id===phase))phase=plans[0].id;phaseStore[date]=phase;
    const active=plans.find(p=>p.id===phase)||plans[0];
    return `<div class="card v497-race-card" data-v497-race-card data-v497-date="${esc(date)}">
      <div class="section-title v497-title"><div><h3>Code 01 · RACE ประจำวัน</h3><span class="hint">${esc(thaiDate(date))} · สร้างจากคนที่อยู่หน้างานใน Staff Planner</span></div><span class="v497-auto-badge">AUTO</span></div>
      <div class="v497-phase-tabs">${plans.map(p=>`<button type="button" class="${p.id===phase?'active':''}" data-v497-phase="${esc(p.id)}" data-v497-date="${esc(date)}"><b>${esc(p.label)}</b><small>${esc(p.sub)}</small></button>`).join('')}</div>
      ${planHtml(active,date)}
      <div class="v497-footer">RACE ในแอปใช้แบ่งหน้าที่หลักเพื่อซ้อม/เตรียมพร้อม และไม่แทนลำดับปฏิบัติ Code 01 ของโรงพยาบาล</div>
    </div>`;
  }

  function decorateHtml(html){
    try{
      const date=selectedDate();const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      if(tpl.content.querySelector('[data-v497-race-card]'))return html;
      const t=document.createElement('template');t.innerHTML=cardHtml(date).trim();const card=t.content.firstElementChild;if(!card)return html;
      const pos=tpl.content.querySelector('[data-v434-daytime-positions]');
      const details=tpl.content.querySelector('.v401-dashboard-details');
      if(pos&&pos.parentNode)pos.insertAdjacentElement('afterend',card);
      else if(details&&details.parentNode)details.parentNode.insertBefore(card,details);
      else return html;
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decoration skipped`,err);return html;}
  }

  const previous=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previous==='function'){
    const wrapped=function renderDashboardV502(){return decorateHtml(previous.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function currentPlan(date,id){return buildPlans(date).find(p=>p.id===id)||buildPlans(date)[0];}
  function showRaceInfo(){
    const body=`<div class="v497-info"><p class="hint">ใช้คำและหลักตามบอร์ด Code 01 ของโรงพยาบาล</p>
      <div><b>R — Rescue</b><span>ช่วยเหลือผู้ป่วย/ผู้ที่อยู่ในพื้นที่เสี่ยง คัดกรองตามแผน และพาไปยังจุดปลอดภัยของหน่วยงาน<br><strong>ผู้บริจาค:</strong> กำลังเจาะหรือยังต้องมีคนช่วยก่อนเคลื่อนย้าย = กลุ่มเหลือง; หลังถอดเข็มและเดินได้เอง = กลุ่มเขียว</span></div>
      <div><b>A — Alarm</b><span>ดึงสัญญาณแจ้งเตือน แจ้งเพื่อนร่วมงาน/พื้นที่ใกล้เคียง และโทรแจ้งเหตุฉุกเฉิน (ภายใน 6888 · 02-839-6888)</span></div>
      <div><b>C — Control</b><span>ควบคุมพื้นที่ ปิดแหล่งเสี่ยงตามแผน และระงับเหตุขั้นต้นด้วยถังดับเพลิงเมื่อทำได้อย่างปลอดภัย<br><strong>ถังดับเพลิง:</strong> ดึงสายฉีด → ปลดสลัก → กดคันบีบ → ส่ายปลายสายไปที่ฐานไฟ</span></div>
      <div><b>E — Evacuate</b><span>นำทางอพยพไปจุดรวมพล เคลื่อนย้ายสิ่งจำเป็น รวบรวมรายชื่อ และตรวจสอบผู้ตกค้าง</span></div>
      <p class="v497-info-note">หัวหน้าทีมฉุกเฉินคุมภาพรวมและไม่ถือ R/A/C/E ซ้ำ ผู้ปฏิบัติแต่ละคนมี RACE หลักเพียง 1 บทบาท ส่วนช่วงกลางคืน Rescue/Evacuate อาจกำหนดเป็นการปฏิบัติตามสถานการณ์แทนการใส่ชื่อซ้ำ</p></div>`;
    try{showModal(`<h2>Code 01 · RACE</h2>${body}`);}catch(_){alert('RACE: Rescue · Alarm · Control · Evacuate');}
  }

  document.addEventListener('click',e=>{
    const phase=e.target.closest?.('[data-v497-phase]');
    if(phase){
      const date=phase.dataset.v497Date||selectedDate();phaseStore[date]=phase.dataset.v497Phase;
      try{if(String(S().page||'')==='dashboard'&&typeof renderPage==='function')renderPage();}catch(_){ }
      return;
    }
    if(e.target.closest?.('[data-v497-race-info]'))showRaceInfo();
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v497-race-code01-daily-board';
  style.textContent=`
    .v497-race-card{margin-bottom:14px;border:1px solid #e4eaf0;background:linear-gradient(180deg,#fff,#fbfdff)}
    .v497-title{align-items:flex-start;gap:10px;margin-bottom:10px}.v497-title h3{margin:0 0 2px;font-size:18px}.v497-title .hint{font-size:11px}
    .v497-auto-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eef6ff;border:1px solid #cfe3f8;color:#3973a8;font-size:9px;font-weight:900;letter-spacing:.05em}
    .v497-phase-tabs{display:flex;gap:7px;overflow:auto;padding:1px 1px 8px;scrollbar-width:thin}.v497-phase-tabs button{min-width:150px;max-width:230px;border:1px solid #dde7f0;background:#fff;border-radius:11px;padding:8px 10px;text-align:left;color:#51697f;cursor:pointer}.v497-phase-tabs button.active{border-color:#7dc5f4;background:#eef8ff;box-shadow:inset 0 0 0 1px rgba(57,143,202,.08)}.v497-phase-tabs b{display:block;font-size:11px;color:#294963}.v497-phase-tabs small{display:block;font-size:8.5px;line-height:1.25;margin-top:2px;color:#8193a5}
    .v497-plan{display:grid;gap:9px}.v497-leader-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #dce8d9;border-radius:11px;background:#f8fff7}.v497-leader-row>div:first-child{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.v497-leader-row>div:first-child>span:first-child{font-size:10px;font-weight:850;color:#5f7659}.v497-person{display:inline-flex;align-items:center;gap:5px;min-width:0}.v497-person .staff-color-pill{font-size:10px!important;padding:4px 7px!important}.v497-person small{font-size:8px;color:#75889a;line-height:1.15}.v497-person-fallback{font-size:10px;font-weight:850;color:#2d4b64}.v497-no-leader{font-size:10px;color:#b45309}.v497-team-count{display:flex;align-items:baseline;gap:4px;white-space:nowrap}.v497-team-count strong{font-size:20px;line-height:1;color:#2b6f9e}.v497-team-count span{font-size:8px;color:#8293a4}
    .v497-role-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.v497-role{min-width:0;border:1px solid #e3e9ef;border-radius:11px;padding:8px;background:#fff}.v497-role-R{border-top:3px solid #60a5fa;background:#f8fbff}.v497-role-A{border-top:3px solid #f29aa5;background:#fff9fa}.v497-role-C{border-top:3px solid #7ac79a;background:#f9fefa}.v497-role-E{border-top:3px solid #e9b26b;background:#fffaf3}.v497-role-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:6px}.v497-letter{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#f0f4f7;font-size:11px;font-weight:950;color:#263e54}.v497-role-head b{display:block;font-size:11px;color:#2e485f}.v497-role-head small{display:block;font-size:7.5px;line-height:1.15;color:#8696a5;margin-top:1px}.v497-role-head em{font-style:normal;font-size:8px;font-weight:900;color:#8393a2;background:#f1f5f8;padding:2px 5px;border-radius:999px}.v497-role-people{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.v497-role-people .v497-person{display:flex;flex:1 1 100%;justify-content:flex-start}.v497-role-people .v497-person small{margin-left:auto;text-align:right;max-width:58%;overflow-wrap:anywhere}.v500-role-policy{display:block;font-size:8.5px;line-height:1.35;color:#657b8e;background:#f4f7fa;border:1px dashed #cfdae4;border-radius:8px;padding:6px 7px}.v497-empty-person{font-size:9px;color:#a66a20;background:#fff4df;border:1px solid #f6d6a7;border-radius:8px;padding:4px 6px}
    .v497-warnings{display:grid;gap:3px;padding:8px 10px;border:1px solid #f3d4a4;border-radius:10px;background:#fffaf2;color:#8a5a19}.v497-warnings b{font-size:9px}.v497-warnings span{font-size:8px;line-height:1.3}.v497-plan-note,.v497-footer{font-size:8.5px;line-height:1.35;color:#8191a0}.v497-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}.v497-actions .soft-btn{font-size:9px!important;padding:6px 8px!important}.v501-ext-guide{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 10px;border:1px solid #f1c77a;border-radius:10px;background:#fff9ed;color:#76511d;font-size:9px;line-height:1.35}.v501-ext-guide b{white-space:nowrap;color:#9a5b00}.v501-ext-guide span{font-weight:700}.v501-role-tip{margin-top:7px;padding:6px 8px;border-radius:8px;background:#fff8df;border:1px solid #f3df96;color:#715b20;font-size:8px;line-height:1.35}.v497-footer{padding-top:7px;border-top:1px dashed #e1e8ee}
    .v497-info{display:grid;gap:8px}.v497-info>div{display:grid;gap:2px;padding:9px 10px;border:1px solid #e3eaf0;border-radius:10px;background:#fbfdff}.v497-info b{font-size:13px;color:#2e4b64}.v497-info span{font-size:12px;line-height:1.45;color:#5c7184}.v497-info-note{font-size:11px;color:#6c7e8f;background:#f6f8fa;padding:8px 10px;border-radius:9px}
    @media(max-width:1050px){.v497-role-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:820px){.v497-title h3{font-size:17px}.v497-title .hint{font-size:10px}.v497-phase-tabs button{min-width:135px;padding:8px}.v497-role-grid{grid-template-columns:1fr 1fr;gap:7px}.v497-role{padding:9px}.v497-role-head b{font-size:12px}.v497-role-head small{font-size:8px}.v497-role-people .staff-color-pill{font-size:11px!important}.v497-leader-row{align-items:flex-start}.v497-team-count strong{font-size:22px}.v497-actions{justify-content:stretch}.v497-actions .soft-btn{flex:0 0 auto;min-height:36px;font-size:10px!important}.v501-ext-guide{flex:1 1 100%;font-size:9.5px}.v497-warnings span{font-size:9px}.v497-plan-note,.v497-footer{font-size:9px}}
    @media(max-width:430px){.v497-role-grid{grid-template-columns:1fr}.v497-role-people .v497-person{flex:0 1 auto}.v497-role-people .v497-person small{max-width:none;margin-left:0}.v497-leader-row{display:grid;grid-template-columns:1fr auto}.v497-phase-tabs button{min-width:125px}.v497-title{margin-bottom:8px}}
  `;
  document.head.appendChild(style);

  window.cnmiV502Race={version:VERSION,buildPlans,daytimePlan,dutyPlan,positionRole,selectedDate};
  console.info(`[${VERSION}] loaded`);
})();
