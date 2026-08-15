/* CNMI Staff Planner V440
 * Dashboard holiday manpower + donor-helper count.
 * - Weekdays (non-holiday): keep V433 morning/afternoon manpower after leave.
 * - Saturday/Sunday/public holiday: count unique people from today's duty roster only.
 * - Subtract roster staff who have an effective leave record today and flag "เวรมีลา".
 * - Add unique signed-up donor-room helpers (internal + external), excluding cancelled/no-show/pending-cancel.
 * - Avoid double-counting an internal helper who is also already in today's duty roster.
 * - Hide "ตำแหน่งกลางวันวันนี้" on weekends/public holidays even if stale position rows exist.
 * - Display-only; reuses existing V327 donor-helper RPC loader. No schema/SQL/write changes.
 */
(function(){
  'use strict';
  const VERSION='V440_DASHBOARD_HOLIDAY_MANPOWER_HELPER_COUNT';
  if(window.__CNMI_V440_DASHBOARD_HOLIDAY_MANPOWER_HELPER_COUNT__)return;
  window.__CNMI_V440_DASHBOARD_HOLIDAY_MANPOWER_HELPER_COUNT__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v);}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function today(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function norm(v){return String(v||'').slice(0,10);}
  function monthOf(date){return String(date||'').slice(0,7);}
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'&&!!isHolidayDate(date);}catch(_){return false;}}
  function isOffDay(date){try{return typeof isNoPositionDay==='function'?!!isNoPositionDay(date):(isWeekendSafe(date)||isHolidaySafe(date));}catch(_){return isWeekendSafe(date)||isHolidaySafe(date);}}
  function holidayTitle(date){
    let parts=[];
    try{
      const dow=new Date(`${date}T12:00:00`).getDay();
      if(dow===6)parts.push('วันเสาร์');
      else if(dow===0)parts.push('วันอาทิตย์');
    }catch(_){ }
    if(isHolidaySafe(date)){
      let name='วันหยุดนักขัตฤกษ์';
      try{name=String(holidayName(date)||name).split(':::')[0].trim()||name;}catch(_){ }
      if(!parts.includes(name))parts.push(name);
    }
    return parts.join(' • ')||'วันหยุด';
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function overlaps(row,date){try{return typeof overlapsDate==='function'?!!overlapsDate(row,date):(norm(row?.start_date)<=date&&norm(row?.end_date||row?.start_date)>=date);}catch(_){return false;}}
  function actualLeave(row,date){
    if(!row||!effective(row)||!overlaps(row,date))return false;
    const type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!type&&type!=='ไม่รับเวร';
  }
  function activeStaffMap(){return new Map((S().staff||[]).filter(x=>x?.is_active).map(x=>[String(x.id),x]));}
  function groupOf(staff){
    const type=String(staff?.staff_type||'').trim(),role=String(staff?.role||'').trim(),text=`${type} ${role}`;
    if(/แพทย์|physician|doctor/i.test(text))return 'แพทย์';
    if(type==='เคิก'||/clerk|ธุรการ/i.test(text))return 'เคิก';
    return 'MT';
  }
  function rosterPeople(date){
    const map=activeStaffMap(),ids=new Set();
    (S().rosterAssignments||[]).forEach(row=>{
      if(norm(row?.duty_date)!==date||!row?.staff_id)return;
      const id=String(row.staff_id);
      if(map.has(id))ids.add(id);
    });
    return ids;
  }
  function rosterLeavePeople(date,rosterIds){
    const out=new Set();
    (S().leaves||[]).forEach(row=>{
      const id=String(row?.staff_id||'');
      if(id&&rosterIds.has(id)&&actualLeave(row,date))out.add(id);
    });
    return out;
  }
  function helperStatusCountable(status){return ['confirmed','completed'].includes(String(status||'confirmed').toLowerCase());}
  function helperStatusPendingCancel(status){return String(status||'').toLowerCase()==='cancel_requested';}
  function helperPersonKey(row){
    if(row?.internal_staff_id)return `staff:${String(row.internal_staff_id)}`;
    const name=String(row?.helper_name||'').trim().replace(/\s+/g,' ').toLowerCase();
    const unit=String(row?.unit_name||'').trim().replace(/\s+/g,' ').toLowerCase();
    const phone=String(row?.phone||'').replace(/\D/g,'');
    return `external:${name}|${unit}|${phone}`;
  }
  function helperSummary(date,rosterIds){
    const st=S(),month=monthOf(date);
    const loaded=String(st.donorHelperLoadedMonthV327||'')===month;
    const loading=!!st.donorHelperLoadingV327;
    const error=String(st.donorHelperErrorV327||'');
    const payload=st.donorHelperPayloadV327||{};
    const rows=Array.isArray(payload.rows)?payload.rows:[];
    const people=new Map(),pending=new Map();
    rows.forEach(row=>{
      if(norm(row?.work_date)!==date)return;
      const internalId=row?.internal_staff_id?String(row.internal_staff_id):'';
      if(internalId&&rosterIds.has(internalId))return; // prevent double count
      const key=helperPersonKey(row);
      if(helperStatusCountable(row?.status))people.set(key,row);
      else if(helperStatusPendingCancel(row?.status))pending.set(key,row);
    });
    let internal=0,external=0;
    people.forEach(row=>{if(row?.internal_staff_id)internal++;else external++;});
    return {loaded,loading,error,total:people.size,internal,external,pendingCancel:pending.size,rows:[...people.values()]};
  }
  function countGroups(ids){
    const map=activeStaffMap(),counts={MT:0,'เคิก':0,'แพทย์':0};
    ids.forEach(id=>{const g=groupOf(map.get(String(id)));counts[g]=(counts[g]||0)+1;});
    return counts;
  }
  function offDayManpower(date){
    const scheduled=rosterPeople(date);
    const onLeave=rosterLeavePeople(date,scheduled);
    const available=new Set([...scheduled].filter(id=>!onLeave.has(id)));
    const helpers=helperSummary(date,scheduled);
    const group=countGroups(available);
    return {
      date,scheduled,onLeave,available,helpers,group,
      scheduledCount:scheduled.size,
      leaveCount:onLeave.size,
      dutyAvailableCount:available.size,
      totalPresentExpected:available.size+helpers.total
    };
  }

  function helperLine(h){
    if(!h.loaded){
      if(h.loading)return '<span class="v440-helper-loading">กำลังโหลดรายชื่อคนมาช่วย…</span>';
      if(h.error)return '<span class="v440-helper-error">โหลดข้อมูลคนมาช่วยไม่สำเร็จ</span>';
      return '<span class="v440-helper-loading">กำลังตรวจรายชื่อคนมาช่วย…</span>';
    }
    let text=`ลงชื่อมาช่วย <strong>${h.total}</strong> คน`;
    if(h.total)text+=` <small>ในหน่วย ${h.internal} • นอกหน่วย ${h.external}</small>`;
    if(h.pendingCancel)text+=` <em>รอยกเลิก ${h.pendingCancel}</em>`;
    return `<span>${text}</span>`;
  }
  function holidayCard(m){
    const h=m.helpers;
    const totalKnown=h.loaded;
    const total=totalKnown?m.totalPresentExpected:m.dutyAvailableCount;
    const leaveBadge=m.leaveCount?`<span class="v440-alert-pill">เวรมีลา ${m.leaveCount}</span>`:'';
    const helperBadge=h.loaded?`<span class="v440-helper-pill">มาช่วย ${h.total}</span>`:'<span class="v440-helper-pill muted">มาช่วย …</span>';
    const totalLabel=totalKnown?'รวมคาดการณ์หน้างาน':'ตามเวรที่พร้อม';
    return `<div class="card v433-manpower-card v440-holiday-manpower-card" data-v433-manpower data-v440-holiday-manpower>
      <div class="v440-title-row">
        <div class="v433-manpower-title">กำลังคนตามเวรวันนี้ <small>${esc(holidayTitle(m.date))}</small></div>
        <div class="v440-pills">${helperBadge}${leaveBadge}</div>
      </div>
      <div class="v440-main-count"><strong>${total}</strong><span>คน</span><small>${esc(totalLabel)}</small></div>
      <div class="v440-breakdown">
        <div><span>จัดเวร</span><b>${m.scheduledCount}</b><small>คน</small></div>
        <div><span>พร้อมตามเวร</span><b>${m.dutyAvailableCount}</b><small>คน</small></div>
        <div><span>คนมาช่วย</span><b>${h.loaded?h.total:'…'}</b><small>คน</small></div>
      </div>
      <div class="v440-detail-lines">
        <div><b>เวรวันนี้</b><span>MT ${m.group.MT||0} • เคิก ${m.group['เคิก']||0} • แพทย์ ${m.group['แพทย์']||0}</span></div>
        <div><b>คนมาช่วย</b>${helperLine(h)}</div>
      </div>
      <div class="v440-note">นับคนไม่ซ้ำจากตารางเวรวันนี้ + ผู้ลงชื่อมาช่วย • ไม่รับเวรไม่นำมาหัก${m.leaveCount?' • ผู้มีเวรที่ลาถูกหักและขึ้นเตือน':''}</div>
    </div>`;
  }

  window.cnmiDashboardHolidayManpowerV440={offDayManpower,helperSummary,rosterPeople,rosterLeavePeople,isOffDay};

  let helperLoadPromise=null;
  function ensureHelpers(date){
    if(!isOffDay(date))return;
    const st=S(),month=monthOf(date);
    if(String(st.donorHelperLoadedMonthV327||'')===month||st.donorHelperLoadingV327)return;
    const api=window.cnmiDonorHelperV327;
    if(!api||typeof api.loadMonth!=='function'||helperLoadPromise)return;
    helperLoadPromise=Promise.resolve(api.loadMonth(month,{force:false})).catch(err=>console.warn('[V440] helper load',err)).finally(()=>{
      helperLoadPromise=null;
      try{
        const cur=S();
        if(cur?.page==='dashboard'&&typeof renderPage==='function')renderPage();
      }catch(_){ }
    });
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV440(){
      let html=String(oldDashboard.apply(this,arguments)||'');
      const date=today();
      if(!isOffDay(date))return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const oldCard=tpl.content.querySelector('[data-v433-manpower]');
        if(oldCard){
          const box=document.createElement('template');box.innerHTML=holidayCard(offDayManpower(date)).trim();
          oldCard.replaceWith(box.content.firstElementChild);
        }
        // Weekends/public holidays do not use normal daytime-position assignments.
        tpl.content.querySelectorAll('[data-v434-daytime-positions]').forEach(node=>node.remove());
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
        window.setTimeout(()=>ensureHelpers(date),0);
      }catch(err){console.warn('[V440] dashboard holiday render fallback',err);}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v440-dashboard-holiday-manpower';
  style.textContent=`
    .v440-holiday-manpower-card{gap:10px!important}
    .v440-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .v440-pills{display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .v440-helper-pill,.v440-alert-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900;white-space:nowrap}
    .v440-helper-pill{background:#e7f5ff;color:#17699d;border:1px solid #bfdef1}.v440-helper-pill.muted{color:#778b9d;background:#f3f6f8;border-color:#dde6ec}
    .v440-alert-pill{background:#fff0e5;color:#b45412;border:1px solid #ffd0ad}
    .v440-main-count{display:flex;align-items:baseline;gap:6px;padding:1px 0}
    .v440-main-count strong{font-size:36px;line-height:1;color:var(--primary-dark,#237db7);font-weight:950}.v440-main-count>span{font-size:13px;font-weight:850;color:#526c84}.v440-main-count>small{font-size:10px;color:#7b8fa2;font-weight:800;margin-left:3px}
    .v440-breakdown{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    .v440-breakdown>div{display:flex;align-items:baseline;gap:4px;padding:7px 8px;border:1px solid #e4edf4;border-radius:10px;background:#f9fbfd;min-width:0}
    .v440-breakdown span{font-size:9px;color:#61778d;font-weight:800}.v440-breakdown b{font-size:17px;color:#294964}.v440-breakdown small{font-size:8px;color:#8294a5}
    .v440-detail-lines{display:grid;gap:5px;border-top:1px solid #e5edf4;padding-top:8px;color:#60758b;font-size:10px}
    .v440-detail-lines>div{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.v440-detail-lines b{color:#2c4a65;min-width:51px}.v440-detail-lines strong{color:#1f405d}.v440-detail-lines small{font-size:9px;color:#8294a5}.v440-detail-lines em{font-size:9px;font-style:normal;color:#a96119;background:#fff5e8;border-radius:999px;padding:2px 5px}
    .v440-helper-loading{color:#7b8fa2}.v440-helper-error{color:#b45309}
    .v440-note{font-size:9px;line-height:1.35;color:#899bab}
    @media(max-width:820px){
      .v440-title-row{align-items:center}.v440-holiday-manpower-card .v433-manpower-title{font-size:16px}.v440-holiday-manpower-card .v433-manpower-title small{font-size:11px;display:inline-block}
      .v440-helper-pill,.v440-alert-pill{font-size:10px;padding:5px 8px}.v440-main-count strong{font-size:38px}.v440-main-count>span{font-size:14px}.v440-main-count>small{font-size:11px}
      .v440-breakdown span{font-size:10px}.v440-breakdown b{font-size:19px}.v440-breakdown small{font-size:9px}.v440-detail-lines{font-size:11px}.v440-detail-lines small,.v440-detail-lines em{font-size:10px}.v440-note{font-size:10px}
    }
    @media(max-width:430px){
      .v440-title-row{display:grid;grid-template-columns:1fr}.v440-pills{justify-content:flex-start}.v440-breakdown{gap:5px}.v440-breakdown>div{display:grid;grid-template-columns:1fr auto;gap:1px 4px;padding:7px}.v440-breakdown small{grid-column:2}.v440-main-count>small{display:block}.v440-detail-lines>div{align-items:flex-start}.v440-detail-lines b{min-width:48px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
