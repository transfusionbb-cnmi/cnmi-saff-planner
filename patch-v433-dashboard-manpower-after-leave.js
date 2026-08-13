/* CNMI Staff Planner V433
 * Dashboard manpower summary after leave.
 * - Replaces the low-value "เจ้าหน้าที่ทั้งหมด" stat card with morning/afternoon manpower.
 * - Splits active staff into MT / เคิก / แพทย์.
 * - Full-day leave subtracts both periods; half-morning / half-afternoon subtracts only that period.
 * - "ไม่รับเวร" and activities do NOT subtract daytime manpower.
 * - Display-only. No Supabase query/write/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V433_DASHBOARD_MANPOWER_AFTER_LEAVE';
  if(window.__CNMI_V433_DASHBOARD_MANPOWER_AFTER_LEAVE__)return;
  window.__CNMI_V433_DASHBOARD_MANPOWER_AFTER_LEAVE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function dToday(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function overlaps(row,date){try{return typeof overlapsDate==='function'?overlapsDate(row,date):String(row?.start_date||'').slice(0,10)<=date&&String(row?.end_date||row?.start_date||'').slice(0,10)>=date;}catch(_){return false;}}
  function isActualLeave(row){
    if(!row||!effective(row))return false;
    const type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!type&&type!=='ไม่รับเวร';
  }
  function periodKind(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(raw.includes('ครึ่งเช้า')||raw.includes('morning'))return 'morning';
    if(raw.includes('ครึ่งบ่าย')||raw.includes('afternoon'))return 'afternoon';
    return 'full';
  }
  function groupOf(staff){
    const type=String(staff?.staff_type||'').trim();
    const role=String(staff?.role||'').trim();
    const text=`${type} ${role}`;
    if(/แพทย์|physician|doctor/i.test(text))return 'แพทย์';
    if(type==='เคิก'||/clerk|ธุรการ/i.test(text))return 'เคิก';
    return 'MT';
  }
  function activeStaff(){return (S().staff||[]).filter(x=>!!x?.is_active);}
  function manpowerForDate(date){
    const staff=activeStaff();
    const byId=new Map(staff.map(s=>[String(s.id),s]));
    const absentMorning=new Set();
    const absentAfternoon=new Set();
    (S().leaves||[]).forEach(row=>{
      if(!isActualLeave(row)||!overlaps(row,date))return;
      const sid=String(row?.staff_id||'');
      if(!sid||!byId.has(sid))return;
      const kind=periodKind(row);
      if(kind==='full'||kind==='morning')absentMorning.add(sid);
      if(kind==='full'||kind==='afternoon')absentAfternoon.add(sid);
    });
    const groups=['MT','เคิก','แพทย์'];
    const total=Object.fromEntries(groups.map(g=>[g,0]));
    const morning=Object.fromEntries(groups.map(g=>[g,0]));
    const afternoon=Object.fromEntries(groups.map(g=>[g,0]));
    staff.forEach(s=>{
      const sid=String(s.id),g=groupOf(s);
      total[g]=(total[g]||0)+1;
      if(!absentMorning.has(sid))morning[g]=(morning[g]||0)+1;
      if(!absentAfternoon.has(sid))afternoon[g]=(afternoon[g]||0)+1;
    });
    const sum=obj=>groups.reduce((n,g)=>n+(Number(obj[g])||0),0);
    return {date,total,morning,afternoon,totalCount:sum(total),morningCount:sum(morning),afternoonCount:sum(afternoon),absentMorning,absentAfternoon};
  }
  window.cnmiDashboardManpowerV433={manpowerForDate,periodKind,groupOf};

  function typeLine(label,counts,total){
    return `<div class="v433-type-line"><b>${esc(label)}</b><span>MT <strong>${counts.MT||0}</strong>/${total.MT||0}</span><span>เคิก <strong>${counts['เคิก']||0}</strong>/${total['เคิก']||0}</span><span>แพทย์ <strong>${counts['แพทย์']||0}</strong>/${total['แพทย์']||0}</span></div>`;
  }
  function manpowerCard(m){
    return `<div class="card v433-manpower-card" data-v433-manpower>
      <div class="v433-manpower-title">กำลังคนวันนี้ <small>หลังหักลา</small></div>
      <div class="v433-period-totals">
        <div><span>เช้า</span><strong>${m.morningCount}</strong><small>คน</small></div>
        <div class="v433-divider" aria-hidden="true"></div>
        <div><span>บ่าย</span><strong>${m.afternoonCount}</strong><small>คน</small></div>
      </div>
      <div class="v433-type-breakdown">
        ${typeLine('เช้า',m.morning,m.total)}
        ${typeLine('บ่าย',m.afternoon,m.total)}
      </div>
      <div class="v433-manpower-note">เต็มวันหักทั้งวัน · ครึ่งวันหักเฉพาะช่วง · ไม่รับเวร/กิจกรรมยังไม่หัก</div>
    </div>`;
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV433(){
      let html=String(oldDashboard.apply(this,arguments)||'');
      try{
        const m=manpowerForDate(dToday());
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const stats=tpl.content.querySelector('.v401-dashboard-stats');
        if(!stats)return html;
        const cards=[...stats.querySelectorAll(':scope > .stat-card')];
        const totalCard=cards.find(c=>String(c.querySelector('.label')?.textContent||'').includes('เจ้าหน้าที่ทั้งหมด'))||cards[cards.length-1];
        if(totalCard){
          const box=document.createElement('template');box.innerHTML=manpowerCard(m).trim();
          totalCard.replaceWith(box.content.firstElementChild);
        }else{
          stats.insertAdjacentHTML('beforeend',manpowerCard(m));
        }
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn('[V433] manpower render fallback',err);}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v433-dashboard-manpower';
  style.textContent=`
    .v433-manpower-card{display:grid;gap:8px;align-content:start}
    .v433-manpower-title{color:#60758b;font-weight:850;font-size:14px;line-height:1.25}
    .v433-manpower-title small{font-size:10px;font-weight:800;color:#8b9bae;margin-left:4px}
    .v433-period-totals{display:grid;grid-template-columns:1fr 1px 1fr;align-items:center;gap:10px;padding:1px 0 2px}
    .v433-period-totals>div:not(.v433-divider){display:flex;align-items:baseline;gap:5px;min-width:0}
    .v433-period-totals span{font-size:13px;font-weight:850;color:#36536f}
    .v433-period-totals strong{font-size:29px;line-height:1;color:var(--primary-dark,#237db7);font-weight:950}
    .v433-period-totals small{font-size:10px;font-weight:800;color:#75899e}
    .v433-divider{height:27px;background:#dce7f0;border-radius:999px}
    .v433-type-breakdown{display:grid;gap:4px;border-top:1px solid #e5edf4;padding-top:7px}
    .v433-type-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#60758b;font-size:10px;line-height:1.25}
    .v433-type-line>b{color:#2d4a65;font-size:10px;min-width:25px}
    .v433-type-line span{white-space:nowrap}
    .v433-type-line strong{color:#20384f;font-size:11px}
    .v433-manpower-note{font-size:9px;line-height:1.3;color:#8a9bad}
    @media(max-width:820px){
      .v433-manpower-card{padding-top:16px!important;padding-bottom:15px!important;gap:10px}
      .v433-manpower-title{font-size:16px}.v433-manpower-title small{font-size:11px}
      .v433-period-totals{max-width:360px;gap:14px}
      .v433-period-totals strong{font-size:34px}.v433-period-totals span{font-size:15px}.v433-period-totals small{font-size:11px}
      .v433-type-breakdown{gap:6px;padding-top:9px}
      .v433-type-line{font-size:12px;gap:10px}.v433-type-line>b{font-size:12px;min-width:30px}.v433-type-line strong{font-size:13px}
      .v433-manpower-note{font-size:10px}
    }
    @media(max-width:390px){
      .v433-type-line{gap:7px;font-size:11px}.v433-type-line>b{font-size:11px;min-width:27px}.v433-type-line strong{font-size:12px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
