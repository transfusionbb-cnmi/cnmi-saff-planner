/* CNMI Staff Planner V462
 * Physician monthly visibility + staff lifecycle dates + historical schedule preservation.
 *
 * 1) ตารางเวรประจำเดือน: shows a compact Physician Consult summary with tappable doctor names.
 * 2) Staff lifecycle:
 *    - employment_start_date: first employment/use date.
 *    - employment_end_date: last day the account may be used and staff is eligible for future schedules.
 *    - daily_position_start_date: first day counted as regular staff for daytime positions.
 * 3) Historical safety:
 *    - Existing roster/daily-position assignments remain visible after a staff member becomes inactive
 *      or transitions from trainee -> regular.
 *    - Future months exclude staff outside their employment range.
 * 4) Account access automatically stops after employment_end_date (Asia/Bangkok).
 * Requires SQL_V462_STAFF_LIFECYCLE.sql once.
 */
(function(){
  'use strict';
  const VERSION='V462_PHYSICIAN_MONTH_STAFF_LIFECYCLE';
  if(window.__CNMI_V462_PHYSICIAN_MONTH_STAFF_LIFECYCLE__)return;
  window.__CNMI_V462_PHYSICIAN_MONTH_STAFF_LIFECYCLE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function pad(n){return String(n).padStart(2,'0');}
  function bangkokToday(){
    try{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;}
    catch(_){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  }
  function monthBounds(key){const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));if(!m)return null;const y=Number(m[1]),mo=Number(m[2]),last=new Date(y,mo,0).getDate();return {key:String(key),first:`${key}-01`,last:`${key}-${pad(last)}`};}
  function monthDates(key){const b=monthBounds(key);if(!b)return[];return Array.from({length:Number(b.last.slice(8))},(_,i)=>`${key}-${pad(i+1)}`);}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):new Date(`${date}T12:00:00`).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}catch(_){return date;}}
  function thaiMonth(key){try{const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key;}}
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function explicitFalse(v){return v===false||['false','0','no','off','ปิด'].includes(String(v??'').trim().toLowerCase());}
  function activeNow(p){if(!p)return false;const raw=Object.prototype.hasOwnProperty.call(p,'active')?p.active:p.is_active;return !explicitFalse(raw)&&raw!=null;}
  function actualAdmin(){try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function employmentStart(p){return norm(p?.employment_start_date||p?.start_date||'');}
  function employmentEnd(p){return norm(p?.employment_end_date||'');}
  function dailyPositionStart(p){return norm(p?.daily_position_start_date||'');}
  function employmentOn(p,date){const d=norm(date),start=employmentStart(p),end=employmentEnd(p);if(!d)return true;if(start&&d<start)return false;if(end&&d>end)return false;return true;}
  function employmentOverlapsMonth(p,key){const b=monthBounds(key);if(!b)return true;const start=employmentStart(p),end=employmentEnd(p);return (!start||start<=b.last)&&(!end||end>=b.first);}
  function dailyPositionOn(p,date){const d=norm(date),start=dailyPositionStart(p);return employmentOn(p,d)&&(!start||!d||d>=start);}
  function isRosterBase(p){if(!p||String(p?.staff_type||'').trim()==='แพทย์'||p?.maternity_status)return false;const v=p?.roster_enabled??p?.duty_enabled??p?.can_roster??p?.is_roster_enabled??p?.schedule_enabled??p?.is_schedule_enabled??p?.['สถานะจัดเวร'];return !explicitFalse(v);}
  function order(rows){try{return typeof orderedStaff==='function'?orderedStaff(rows):rows;}catch(_){return rows;}}
  function monthAssignments(key){try{return typeof getAssignmentsForMonth==='function'?(getAssignmentsForMonth(key)||[]):((S().rosterAssignments||[]).filter(r=>norm(r?.duty_date).startsWith(key)));}catch(_){return (S().rosterAssignments||[]).filter(r=>norm(r?.duty_date).startsWith(key));}}
  function assignmentStaffIds(key){return new Set(monthAssignments(key).map(r=>String(r?.staff_id||'')).filter(Boolean));}
  function rosterStaffForMonth(key){
    const ids=assignmentStaffIds(key),rows=(S().staff||[]).filter(p=>{
      if(!p?.id||String(p?.staff_type||'').trim()==='แพทย์'||p?.maternity_status)return false;
      if(ids.has(String(p.id)))return true; // saved history must stay visible
      if(!isRosterBase(p)||!employmentOverlapsMonth(p,key))return false;
      if(activeNow(p))return true;
      // Planned leaver may be inactive today but should remain visible in their historical employment month.
      return !!employmentEnd(p);
    });
    return order(rows);
  }
  function scheduleMonthKey(){return String(S().monthKey||new Date().toISOString().slice(0,7)).slice(0,7);}
  function selectedDashboardDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||bangkokToday();}catch(_){return bangkokToday();}}

  function assignGlobal(name,value){try{window[name]=value;}catch(_){}try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){} }

  // Preserve monthly roster history instead of filtering assignments by today's Active status.
  assignGlobal('scheduleStaffList',function scheduleStaffListV462(){return rosterStaffForMonth(scheduleMonthKey());});
  assignGlobal('scheduleAssignmentsForMonth',function scheduleAssignmentsForMonthV462(key=scheduleMonthKey()){
    return monthAssignments(key).filter(r=>norm(r?.duty_date).startsWith(key));
  });

  // Date-aware daytime candidate pool. Saved rows are rendered separately by V275 and are never deleted here.
  const previousDailyWorking=window.dailyWorkingStaff||(typeof dailyWorkingStaff==='function'?dailyWorkingStaff:null);
  if(typeof previousDailyWorking==='function')assignGlobal('dailyWorkingStaff',function dailyWorkingStaffV462(date){return (previousDailyWorking(date)||[]).filter(p=>dailyPositionOn(p,date));});
  const previousCandidate=window.positionCandidateOk||(typeof positionCandidateOk==='function'?positionCandidateOk:null);
  if(typeof previousCandidate==='function')assignGlobal('positionCandidateOk',function positionCandidateOkV462(staff,row,date){return dailyPositionOn(staff,date)&&previousCandidate(staff,row,date);});

  function doctorButton(id,site,time){
    if(!id)return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn v462-month-doctor" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(staffName(id))}</button>`;
  }
  function compressOnCall(key){
    const api=window.cnmiPhysicianConsultV452;if(!api?.baseForDate)return[];
    const dates=monthDates(key),out=[];let cur=null;
    dates.forEach(date=>{
      const id=api.baseForDate(date)?.combined||'';
      if(cur&&String(cur.id)===String(id)){cur.end=date;return;}
      if(cur)out.push(cur);cur={start:date,end:date,id};
    });
    if(cur)out.push(cur);return out;
  }
  function weekdayBase(key){
    const api=window.cnmiPhysicianConsultV452;if(!api?.baseForDate)return {donor:'',bb:'',exceptions:[]};
    const weekdays=monthDates(key).filter(d=>!isWeekendSafe(d)&&!isHolidaySafe(d));if(!weekdays.length)return {donor:'',bb:'',exceptions:[]};
    const models=weekdays.map(d=>({date:d,m:api.baseForDate(d)}));
    const freq=new Map();models.forEach(x=>{const k=`${x.m?.donor||''}|${x.m?.bb||''}`;freq.set(k,(freq.get(k)||0)+1);});
    const base=[...freq.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'|';const [donor,bb]=base.split('|');
    const exceptions=models.filter(x=>String(x.m?.donor||'')!==String(donor)||String(x.m?.bb||'')!==String(bb));
    return {donor,bb,exceptions};
  }
  function physicianMonthCard(key){
    const api=window.cnmiPhysicianConsultV452;
    if(!api)return '';
    if(!api.cache?.loaded){api.ensureLoaded?.();return `<section class="card v462-physician-month-card" data-v462-physician-month><div class="section-title"><div><h3>แพทย์ Consult · ${esc(thaiMonth(key))}</h3><p class="hint">กำลังโหลดตารางแพทย์…</p></div></div></section>`;}
    if(api.cache?.unavailable)return '';
    const day=weekdayBase(key),oncall=compressOnCall(key),exceptions=day.exceptions||[];
    return `<section class="card v462-physician-month-card" data-v462-physician-month>
      <div class="section-title"><div><h3>แพทย์ Consult · ${esc(thaiMonth(key))}</h3><p class="hint">ชื่อแพทย์กดดูเบอร์โทรได้ • วันธรรมดา 16:00–08:00 / เสาร์–อาทิตย์–นักขัตฤกษ์ 24 ชม.</p></div>${actualAdmin()?'<button type="button" class="ghost-btn" data-page="physicianConsult">จัดการตาราง</button>':''}</div>
      <div class="v462-physician-month-grid">
        <div class="v462-physician-block"><b>ในเวลา จ.–ศ. 08:00–16:00</b><div><span>Donor</span>${doctorButton(day.donor,'Donor','08:00–16:00')}</div><div><span>Blood Bank</span>${doctorButton(day.bb,'Blood Bank','08:00–16:00')}</div></div>
        <div class="v462-physician-block"><b>On-call / วันหยุด</b>${oncall.length?oncall.map(r=>`<div class="v462-oncall-row"><span>${esc(r.start===r.end?thaiDate(r.start):`${thaiDate(r.start)} – ${thaiDate(r.end)}`)}</span>${doctorButton(r.id,'Donor & BB','วันธรรมดา 16:00–08:00 / วันหยุด 24 ชม.')}</div>`).join(''):'<div class="v462-empty-line">ยังไม่กำหนดแพทย์ On-call</div>'}</div>
      </div>
      ${exceptions.length?`<div class="v462-physician-exceptions"><b>แก้เฉพาะวัน</b>${exceptions.map(x=>`<span>${esc(thaiDate(x.date))}: Donor ${esc(staffName(x.m?.donor))} · BB ${esc(staffName(x.m?.bb))}</span>`).join('')}</div>`:''}
    </section>`;
  }

  // Staff monthly schedule page: physician summary appears before the roster table.
  const previousMonthly=window.renderMonthlySchedulePage||(typeof renderMonthlySchedulePage==='function'?renderMonthlySchedulePage:null);
  if(typeof previousMonthly==='function'){
    const wrapped=function renderMonthlySchedulePageV462(){const key=scheduleMonthKey();const card=physicianMonthCard(key);return `${card}${previousMonthly.apply(this,arguments)}`;};
    assignGlobal('renderMonthlySchedulePage',wrapped);
  }

  function injectPhysicianIntoAdminScheduler(){
    if(String(S().page||'')!=='scheduler')return;
    const root=document.getElementById('pageContent');if(!root||root.querySelector('[data-v462-physician-month]'))return;
    const key=scheduleMonthKey(),html=physicianMonthCard(key);if(!html)return;
    const t=document.createElement('template');t.innerHTML=html.trim();const page=root.querySelector('.v275-page')||root;page.insertBefore(t.content.firstElementChild,page.firstChild);
  }

  // Decorate Users page with lifecycle explanation/status. Fields themselves are emitted by V396 (updated in V462 package).
  const previousUsers=window.renderUsersPage||(typeof renderUsersPage==='function'?renderUsersPage:null);
  if(typeof previousUsers==='function'){
    const wrapped=function renderUsersPageV462(){
      let html=String(previousUsers.apply(this,arguments)||'');
      try{
        const p=(S().staff||[]).find(x=>String(x?.id||'')===String(S().usersStaffId||''));
        const end=employmentEnd(p),dp=dailyPositionStart(p),status=[];
        if(end)status.push(`ใช้งานถึง ${thaiDate(end)}`);if(dp)status.push(`เริ่มตัวจริง ${thaiDate(dp)}`);
        const note=`<div class="v462-lifecycle-help"><b>ช่วงการใช้งาน</b><span>กรณีลาออก ไม่ต้องปิด Active ล่วงหน้า: ใส่ “ใช้งานถึงวันที่” ระบบจะให้เข้าแอปได้ถึงวันนั้น และหยุดนำชื่อไปจัดตารางหลังวันสิ้นสุดโดยอัตโนมัติ</span>${status.length?`<em>${esc(status.join(' • '))}</em>`:''}</div>`;
        html=html.replace('<div class="admin-user-form">',`${note}<div class="admin-user-form">`);
      }catch(_){ }
      return html;
    };
    assignGlobal('renderUsersPage',wrapped);
  }

  // Final Auth-aware create flow: keep V161 account creation, then save lifecycle dates by email.
  const previousSaveNew=window.saveNewStaff||(typeof saveNewStaff==='function'?saveNewStaff:null);
  if(typeof previousSaveNew==='function'){
    const wrapped=async function saveNewStaffV462(form){
      const fd=new FormData(form),email=String(fd.get('email')||'').trim().toLowerCase(),dates={employment_start_date:norm(fd.get('employment_start_date'))||null,employment_end_date:norm(fd.get('employment_end_date'))||null,daily_position_start_date:norm(fd.get('daily_position_start_date'))||null};
      const existedBefore=(S().staff||[]).some(p=>String(p?.email||'').trim().toLowerCase()===email);
      await previousSaveNew(form);
      if(!email||existedBefore||!Object.values(dates).some(Boolean))return;
      const created=(S().staff||[]).find(p=>String(p?.email||'').trim().toLowerCase()===email);if(!created?.id)return;
      const db=DB();if(!db)return;
      try{const q=await db.from('staff_profiles').update(dates).eq('id',created.id);if(q.error)throw q.error;try{await loadAllData();renderPage();}catch(_){ }}catch(err){console.warn('[V462] save new staff lifecycle',err);try{showToast(`สร้างบัญชีแล้ว แต่บันทึกช่วงวันที่ไม่สำเร็จ: ${err.message||err}`);}catch(_){ }}
    };
    assignGlobal('saveNewStaff',wrapped);
  }

  function accessExpired(p,date=bangkokToday()){const end=employmentEnd(p);return !!end&&date>end;}
  async function enforceAccess(){
    const p=S().profile;if(!p||!accessExpired(p))return false;
    try{if(typeof clearCachedAppSession==='function')clearCachedAppSession();}catch(_){ }
    try{await DB()?.auth?.signOut?.();}catch(_){ }
    try{document.getElementById('appView')?.classList.add('hidden');document.getElementById('authView')?.classList.remove('hidden');}catch(_){ }
    try{showToast(`สิทธิ์ใช้งานสิ้นสุดวันที่ ${thaiDate(employmentEnd(p))} กรุณาติดต่อ Admin`);}catch(_){ }
    return true;
  }
  const previousEnter=window.enterApp||(typeof enterApp==='function'?enterApp:null);
  if(typeof previousEnter==='function'){
    const wrapped=async function enterAppV462(){
      try{if(typeof loadProfile==='function')await loadProfile();}catch(_){ }
      if(await enforceAccess())return;
      return previousEnter.apply(this,arguments);
    };
    assignGlobal('enterApp',wrapped);
  }
  window.addEventListener('focus',()=>{enforceAccess();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforceAccess();});
  setInterval(()=>{if(S().profile)enforceAccess();},60000);

  // Life-cycle aware weekday manpower so a leaver is not counted after their end date.
  function groupOf(p){const t=`${p?.staff_type||''} ${p?.role||''}`;if(/แพทย์|physician|doctor/i.test(t))return 'แพทย์';if(String(p?.staff_type||'').trim()==='เคิก'||/clerk|ธุรการ/i.test(t))return 'เคิก';return 'MT';}
  function actualLeave(row){try{if(typeof isLeaveEffective==='function'&&!isLeaveEffective(row))return false;}catch(_){ }const t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();return !!t&&t!=='ไม่รับเวร';}
  function overlap(row,date){return norm(row?.start_date)<=date&&norm(row?.end_date||row?.start_date)>=date;}
  function period(row){const x=String(row?.leave_period||row?.period||'เต็มวัน').toLowerCase();if(/ครึ่งเช้า|morning/.test(x))return'morning';if(/ครึ่งบ่าย|afternoon/.test(x))return'afternoon';return'full';}
  function manpower(date){
    const staff=(S().staff||[]).filter(p=>activeNow(p)&&employmentOn(p,date)),byId=new Set(staff.map(p=>String(p.id))),am=new Set(),pm=new Set();
    (S().leaves||[]).forEach(r=>{const id=String(r?.staff_id||'');if(!byId.has(id)||!actualLeave(r)||!overlap(r,date))return;const k=period(r);if(k==='full'||k==='morning')am.add(id);if(k==='full'||k==='afternoon')pm.add(id);});
    const groups=['MT','เคิก','แพทย์'],total=Object.fromEntries(groups.map(g=>[g,0])),morning=Object.fromEntries(groups.map(g=>[g,0])),afternoon=Object.fromEntries(groups.map(g=>[g,0]));
    staff.forEach(p=>{const id=String(p.id),g=groupOf(p);total[g]++;if(!am.has(id))morning[g]++;if(!pm.has(id))afternoon[g]++;});const sum=o=>groups.reduce((n,g)=>n+(o[g]||0),0);return{total,morning,afternoon,morningCount:sum(morning),afternoonCount:sum(afternoon)};
  }
  function updateManpowerCard(root,date){
    if(isWeekendSafe(date)||isHolidaySafe(date))return;const card=root.querySelector?.('[data-v433-manpower]');if(!card)return;const m=manpower(date),groups=['MT','เคิก','แพทย์'];
    const totals=card.querySelectorAll('.v433-period-totals strong');if(totals[0])totals[0].textContent=m.morningCount;if(totals[1])totals[1].textContent=m.afternoonCount;
    const lines=[...card.querySelectorAll('.v433-type-line')];[['เช้า',m.morning],['บ่าย',m.afternoon]].forEach(([label,c],i)=>{if(!lines[i])return;lines[i].innerHTML=`<b>${label}</b>${groups.map(g=>`<span>${g==='เคิก'?'เคิก':g} <strong>${c[g]||0}</strong>/${m.total[g]||0}</span>`).join('')}`;});
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV462(){let html=String(previousDashboard.apply(this,arguments)||'');try{const tpl=document.createElement('template');tpl.innerHTML=html;updateManpowerCard(tpl.content,selectedDashboardDate());const h=document.createElement('div');h.appendChild(tpl.content.cloneNode(true));html=h.innerHTML;}catch(e){console.warn('[V462] dashboard lifecycle',e);}return html;};
    assignGlobal('renderDashboard',wrapped);
  }

  // Final render wrapper: add physician card to Admin manual scheduler after V275 replaces page content.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV462(){const ret=previousRender.apply(this,arguments);try{if(String(S().page||'')==='scheduler'){window.cnmiPhysicianConsultV452?.ensureLoaded?.();injectPhysicianIntoAdminScheduler();}}catch(_){ }return ret;};
    assignGlobal('renderPage',wrapped);
  }

  document.addEventListener('change',e=>{
    if(!e.target?.matches?.('[data-field="employment_start_date"],[data-field="employment_end_date"],[data-field="daily_position_start_date"]'))return;
    const card=e.target.closest('[data-staff-row]');if(!card)return;
    const start=norm(card.querySelector('[data-field="employment_start_date"]')?.value),end=norm(card.querySelector('[data-field="employment_end_date"]')?.value),dp=norm(card.querySelector('[data-field="daily_position_start_date"]')?.value);
    if(start&&end&&end<start){try{showToast('วันสิ้นสุดการใช้งานต้องไม่ก่อนวันเริ่มงาน');}catch(_){ }e.target.value='';}
    if(dp&&end&&dp>end){try{showToast('วันเริ่มเป็นตัวจริงต้องไม่หลังวันสิ้นสุดการใช้งาน');}catch(_){ }e.target.value='';}
  },true);

  const style=document.createElement('style');style.id='cnmi-v462-style';style.textContent=`
    .v462-physician-month-card{margin-bottom:14px}.v462-physician-month-card .section-title{align-items:flex-start}.v462-physician-month-grid{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:10px}.v462-physician-block{border:1px solid #e1eaf1;border-radius:13px;padding:11px;background:#fbfdff;display:grid;gap:8px}.v462-physician-block>b{color:#334f67}.v462-physician-block>div,.v462-oncall-row{display:flex;align-items:center;justify-content:space-between;gap:9px}.v462-physician-block>div>span,.v462-oncall-row>span{font-size:11px;color:#71879a}.v462-month-doctor{white-space:nowrap}.v462-empty-line{color:#8ca0b0!important;justify-content:flex-start!important}.v462-physician-exceptions{margin-top:9px;padding:9px 11px;border-radius:11px;background:#fff8e9;display:flex;gap:7px;flex-wrap:wrap;font-size:10px;color:#80622e}.v462-physician-exceptions>b{color:#76520e}.v462-lifecycle-help{margin:0 0 12px;padding:11px 12px;border-radius:12px;background:#eef8ff;border:1px solid #cfe6f6;display:grid;gap:4px;color:#496b83}.v462-lifecycle-help b{color:#245b7d}.v462-lifecycle-help span{font-size:11px;line-height:1.45}.v462-lifecycle-help em{font-size:10px;font-style:normal;font-weight:850;color:#1c7250}.v462-lifecycle-off{background:#f7f9fb!important}.v462-lifecycle-cell{display:block;color:#9aa9b5;font-size:9px;line-height:1.2;text-align:center;padding:4px}.v462-preserved-note{display:block;margin-top:4px;color:#a16a17!important;font-size:8px!important;line-height:1.25}.admin-user-form label small.hint{display:block;font-size:9px;line-height:1.3;color:#7c8e9d;font-weight:500;margin-top:3px}
    @media(max-width:820px){.v462-physician-month-grid{grid-template-columns:1fr}.v462-physician-block{padding:12px}.v462-physician-block>b{font-size:14px}.v462-physician-block>div>span,.v462-oncall-row>span{font-size:12px}.v462-lifecycle-help span{font-size:12px}.v462-lifecycle-help em{font-size:11px}.v462-lifecycle-cell{font-size:10px}.v462-preserved-note{font-size:9px!important}}
  `;document.head.appendChild(style);

  // Warm consult cache for schedule pages; rerender once names are ready.
  setTimeout(()=>{try{window.cnmiPhysicianConsultV452?.ensureLoaded?.().then(()=>{if(['schedule','scheduler'].includes(String(S().page||''))&&typeof renderPage==='function')renderPage();});}catch(_){ }},900);

  window.cnmiStaffLifecycleV462={version:VERSION,bangkokToday,employmentOn,employmentOverlapsMonth,dailyPositionOn,rosterStaffForMonth,physicianMonthCard,enforceAccess};
  console.info(`${VERSION} loaded`);
})();
