/* CNMI Staff Planner V316 — route-aware low-egress loader
   Loaded after every legacy patch so this becomes the final loadAllData/route loader.
   It does not alter roster, OT, balance, eligibility, or trade formulas.
*/
(function(){
  'use strict';
  const VERSION='V317_ROUTE_AWARE_LOADER';
  if(window.__CNMI_V316_ROUTE_LOADER__) return;
  window.__CNMI_V316_ROUTE_LOADER__=true;

  const memory=new Map();
  const pending=new Map();
  const STATIC_TTL=5*60*1000;
  const PAGE_TTL=25*1000;
  const ERROR_TTL=45*1000;
  const STANDARD_PAGES=new Set([
    'dashboard','calendar','leave','myProfile','activities','schedule','tradeRequests',
    'positionMonthView','positions','ot','audit','hr','hrSummary','scheduler',
    'positionMonth','profileRequests','users','eligibility','positionManagement','internManagement'
  ]);

  function appState(){try{return state;}catch(_){return window.state||null;}}
  function client(){try{return sb;}catch(_){return window.sb||null;}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function pad2(n){return String(n).padStart(2,'0');}
  function dateKey(value){
    try{
      if(typeof normalizeDateKey==='function') return String(normalizeDateKey(value)||'').slice(0,10);
    }catch(_){ }
    const d=value instanceof Date?new Date(value):new Date(String(value||''));
    if(Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function monthKeySafe(value){
    const raw=String(value||'').slice(0,7);
    if(/^\d{4}-\d{2}$/.test(raw)) return raw;
    const d=value instanceof Date?value:new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  }
  function monthRange(key){
    const mk=monthKeySafe(key);
    const [y,m]=mk.split('-').map(Number);
    const last=new Date(y,m,0).getDate();
    return {key:mk,start:`${mk}-01`,end:`${mk}-${pad2(last)}`,year:y,month:m};
  }
  function addDays(key,days){
    const d=new Date(`${dateKey(key)}T12:00:00`);
    d.setDate(d.getDate()+days);
    return dateKey(d);
  }
  function calendarRange(){
    const st=appState();
    const base=st?.calendarDate instanceof Date?new Date(st.calendarDate):new Date(st?.calendarDate||Date.now());
    const view=String(st?.calendarView||'month');
    if(view==='day'){
      const d=dateKey(base);return {start:d,end:d};
    }
    if(view==='week'){
      const d=dateKey(base);return {start:addDays(d,-base.getDay()),end:addDays(d,6-base.getDay())};
    }
    const first=new Date(base.getFullYear(),base.getMonth(),1);
    const start=new Date(first);start.setDate(1-first.getDay());
    const end=new Date(start);end.setDate(start.getDate()+41);
    return {start:dateKey(start),end:dateKey(end)};
  }
  function fiscalRange(){
    const now=new Date();
    const y=now.getFullYear();
    const fiscalEndYear=(now.getMonth()+1)>=10?y+1:y;
    return {start:`${fiscalEndYear-1}-10-01`,end:`${fiscalEndYear+1}-09-30`};
  }
  function recentMonths(back=12,ahead=3){
    const now=new Date();
    const s=new Date(now.getFullYear(),now.getMonth()-back,1);
    const e=new Date(now.getFullYear(),now.getMonth()+ahead+1,0);
    return {start:dateKey(s),end:dateKey(e)};
  }
  function selectedMonthFor(page){
    const st=appState();
    if(page==='positionMonth') return st?.positionMonthKey||st?.monthKey;
    if(page==='positionMonthView') return st?.positionMonthViewKey||st?.monthKey;
    if(page==='ot') return st?.otSourceMonthV241||st?.otMoneyMonthV241||st?.otApprovalMonthFilter||st?.monthKey;
    return st?.monthKey;
  }
  function setSync(text){
    try{const el=document.getElementById('syncStatus');if(el)el.textContent=text;}catch(_){ }
  }
  function ordered(rows){
    try{return typeof orderedStaff==='function'?orderedStaff(rows):rows;}catch(_){return rows;}
  }
  function applyRows(name,rows){
    const st=appState();if(!st)return;
    if(name==='staff') st.staff=ordered(rows||[]);
    else st[name]=rows||[];
  }
  async function cached(key,ttl,fetcher,apply,options={}){
    const force=!!options.force;
    const now=Date.now();
    const saved=memory.get(key);
    if(!force&&saved&&saved.expiresAt>now){
      if(saved.ok&&apply) apply(saved.value);
      return saved.ok?saved.value:null;
    }
    if(!force&&pending.has(key)){
      const value=await pending.get(key);
      if(value!==null&&apply) apply(value);
      return value;
    }
    const task=(async()=>{
      try{
        const result=await fetcher();
        if(result?.error) throw result.error;
        const value=result?.data??[];
        memory.set(key,{ok:true,value,expiresAt:Date.now()+ttl});
        return value;
      }catch(error){
        memory.set(key,{ok:false,error,expiresAt:Date.now()+ERROR_TTL});
        console.warn(`[${VERSION}] ${key} skipped`,error);
        return null;
      }
    })();
    pending.set(key,task);
    try{
      const value=await task;
      if(value!==null&&apply) apply(value);
      return value;
    }finally{pending.delete(key);}
  }
  async function group(tasks){await Promise.all(tasks.filter(Boolean));}
  function qStaff(force){
    const db=client();if(!db)return null;
    return cached('staff:all',STATIC_TTL,()=>db.from('staff_profiles').select('*').order('staff_type').order('nickname'),v=>applyRows('staff',v),{force});
  }
  function qLeaves(range,force){
    const db=client();if(!db)return null;
    return cached(`leaves:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('leave_requests').select('*').gte('end_date',range.start).lte('start_date',range.end).order('start_date',{ascending:false}),v=>applyRows('leaves',v),{force});
  }
  function qActivities(range,force){
    const db=client();if(!db)return null;
    return cached(`activities:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('activity_events').select('*').gte('end_date',range.start).lte('start_date',range.end).order('start_date'),v=>applyRows('activities',v),{force});
  }
  function qRoster(range,force){
    const db=client();if(!db)return null;
    return cached(`roster:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('roster_assignments').select('*').gte('duty_date',range.start).lte('duty_date',range.end).order('duty_date'),v=>applyRows('rosterAssignments',v),{force});
  }
  function qPositions(range,force){
    const db=client();if(!db)return null;
    return cached(`positions:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('daily_positions').select('*').gte('work_date',range.start).lte('work_date',range.end).order('work_date').order('position_code'),v=>applyRows('positions',v),{force});
  }
  function qDayStatus(range,force){
    const db=client();if(!db)return null;
    return cached(`position-status:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('daily_position_day_status').select('*').gte('work_date',range.start).lte('work_date',range.end).order('work_date'),v=>applyRows('positionDayStatus',v),{force});
  }
  function qAttendance(range,force){
    const db=client();if(!db)return null;
    return cached(`attendance:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('attendance_logs').select('*').gte('duty_date',range.start).lte('duty_date',range.end).order('duty_date',{ascending:false}),v=>applyRows('attendance',v),{force});
  }
  function qOt(range,force){
    const db=client();if(!db)return null;
    let query=db.from('ot_requests').select('*').gte('work_date',range.start).lte('work_date',range.end).order('work_date',{ascending:false});
    if(!isAdminSafe()){
      try{const sid=typeof currentStaffId==='function'?currentStaffId():'';if(sid)query=query.eq('staff_id',sid);}catch(_){ }
    }
    return cached(`ot:${isAdminSafe()?'admin':'staff'}:${range.start}:${range.end}`,PAGE_TTL,()=>query,v=>applyRows('otRequests',v),{force});
  }
  function qTrades(range,force){
    const db=client();if(!db)return null;
    return cached(`trades:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('roster_trade_requests').select('*').gte('created_at',`${range.start}T00:00:00`).lte('created_at',`${range.end}T23:59:59`).order('created_at',{ascending:false}),v=>applyRows('tradeRequests',v),{force});
  }
  function qHolidays(range,force){
    const db=client();if(!db)return null;
    return cached(`holidays:${range.start}:${range.end}`,STATIC_TTL,()=>db.from('public_holidays').select('*').gte('holiday_date',range.start).lte('holiday_date',range.end).order('holiday_date'),v=>applyRows('holidays',v),{force});
  }
  function qIncharges(range,force){
    const db=client();if(!db)return null;
    const start=range.start.slice(0,7),end=range.end.slice(0,7);
    return cached(`incharges:${start}:${end}`,STATIC_TTL,()=>db.from('monthly_incharges').select('*').gte('month_key',start).lte('month_key',end).order('month_key',{ascending:false}),v=>applyRows('incharges',v),{force});
  }
  function qRosterMonths(mr,force){
    const db=client();if(!db)return null;
    return cached(`roster-month:${mr.key}`,STATIC_TTL,()=>db.from('roster_months').select('*').eq('year',mr.year).eq('month',mr.month).limit(5),v=>applyRows('rosterMonths',v),{force});
  }
  function qHrChecks(force){
    const db=client();if(!db||!isAdminSafe())return null;
    return cached('hr-checks:admin',PAGE_TTL,()=>db.from('hr_checks').select('*').order('updated_at',{ascending:false}).limit(1500),v=>applyRows('hrChecks',v),{force});
  }
  function qAudit(force){
    const db=client(),st=appState();if(!db)return null;
    const day=dateKey(st?.auditDate||'');
    const key=day?`audit:${day}`:'audit:latest';
    const factory=()=>{
      let query=db.from('audit_logs').select('*').order('created_at',{ascending:false});
      if(day) query=query.gte('created_at',`${day}T00:00:00`).lte('created_at',`${day}T23:59:59`).limit(500);
      else query=query.limit(250);
      return query;
    };
    return cached(key,PAGE_TTL,factory,v=>applyRows('auditLogs',v),{force});
  }
  function qShiftConfirmations(range,force){
    const db=client();if(!db)return null;
    return cached(`shift-confirmations:${range.start}:${range.end}`,PAGE_TTL,()=>db.from('shift_confirmations').select('*').gte('work_date',range.start).lte('work_date',range.end).order('work_date',{ascending:false}),v=>{
      applyRows('shiftConfirmations',v);
      const st=appState();if(st)st.shiftConfirmationReadyV209=true;
    },{force}).then(value=>{
      if(value===null){const st=appState();if(st){st.shiftConfirmations=[];st.shiftConfirmationReadyV209=false;}}
      return value;
    });
  }
  async function qPositionConfig(force){
    const tasks=[];
    if(window.cnmiV260?.refreshPermissionsFromDatabase){
      tasks.push(cached('position-permissions:all',STATIC_TTL,async()=>{
        await window.cnmiV260.refreshPermissionsFromDatabase({render:false,silent:true,force:true,allowEmpty:true});
        return {data:(appState()?.positionEligibility||[]),error:null};
      },v=>applyRows('positionEligibility',v),{force}));
    }
    if(window.cnmiV260?.refreshSlotTemplatesFromDatabase){
      tasks.push(cached('position-templates:all',STATIC_TTL,async()=>{
        await window.cnmiV260.refreshSlotTemplatesFromDatabase({render:false,silent:true,force:true});
        return {data:(appState()?.positionMasters||[]),error:null};
      },v=>applyRows('positionMasters',v),{force}));
    }
    if(window.cnmiV271?.loadTrainingAssignments){
      tasks.push(cached('training-assignments:all',STATIC_TTL,async()=>{
        await window.cnmiV271.loadTrainingAssignments({force:true});
        return {data:(appState()?.trainingAssignmentsV271||appState()?.trainingAssignments||[]),error:null};
      },v=>{
        const st=appState();if(st){st.trainingAssignmentsV271=v||[];st.trainingAssignments=v||[];}
      },{force}));
    }
    await group(tasks);
  }
  async function qDutyEligibility(force){
    const fn=window.refreshDutyEligibilityFromDbV197;
    if(typeof fn!=='function')return;
    await cached('duty-eligibility:all',STATIC_TTL,async()=>{
      await fn({clearDraft:false,toast:false});
      return {data:(appState()?.dutyEligibilityV197||appState()?.dutyEligibility||[]),error:null};
    },v=>{const st=appState();if(st){st.dutyEligibilityV197=v||[];st.dutyEligibility=v||[];}},{force});
  }
  async function qProfileRequests(force){
    const fn=window.loadProfileChangeRequests||(typeof loadProfileChangeRequests==='function'?loadProfileChangeRequests:null);
    if(typeof fn!=='function')return;
    await cached(`profile-requests:${isAdminSafe()?'admin':'self'}`,PAGE_TTL,async()=>{
      await fn();return {data:(appState()?.profileChangeRequests||[]),error:null};
    },v=>applyRows('profileChangeRequests',v),{force});
  }

  async function loadPageData(page,options={}){
    const st=appState();
    if(!st?.profile||!client())return;
    const force=!!options.force;
    const p=String(page||st.page||'dashboard');
    setSync('กำลังโหลด');
    try{
      await qStaff(force);
      const today=dateKey(new Date());
      const todayRange={start:today,end:today};
      const mr=monthRange(selectedMonthFor(p));
      const fiscal=fiscalRange();

      if(p==='dashboard'){
        const now=new Date();const yearRange={start:`${now.getFullYear()}-01-01`,end:mr.end};
        await group([qLeaves(yearRange,force),qActivities(todayRange,force),qRoster(mr,force),qPositions(todayRange,force),qAttendance(todayRange,force),qOt(mr,force),qHolidays(mr,force),qIncharges(mr,force),qDayStatus(todayRange,force)]);
      }else if(p==='calendar'){
        const r=calendarRange();
        await group([qLeaves(r,force),qActivities(r,force),qRoster(r,force),qHolidays(r,force),qHrChecks(force)]);
      }else if(p==='leave'){
        await group([qLeaves(fiscal,force),qHolidays(fiscal,force),qHrChecks(force)]);
      }else if(p==='activities'){
        const r=recentMonths(6,6);await qActivities(r,force);
      }else if(p==='schedule'){
        await group([qRosterMonths(mr,force),qRoster(mr,force),qLeaves(mr,force),qHolidays(mr,force),qAttendance(mr,force),qOt(mr,force),qTrades(recentMonths(6,6),force),qShiftConfirmations(mr,force),qIncharges(mr,force)]);
      }else if(p==='tradeRequests'){
        const r=recentMonths(12,6);await group([qTrades(r,force),qRoster(r,force),qOt(r,force)]);
      }else if(p==='positionMonthView'||p==='positionMonth'){
        await group([qPositions(mr,force),qDayStatus(mr,force),qLeaves(mr,force),qActivities(mr,force),qHolidays(mr,force),qIncharges(mr,force),qRoster(mr,force)]);
        await qPositionConfig(force);
      }else if(p==='positions'){
        const d=dateKey(st.positionDate||today),r={start:d,end:d};
        await group([qPositions(r,force),qDayStatus(r,force),qLeaves(r,force),qActivities(r,force),qHolidays(r,force),qIncharges(r,force),qRoster(r,force)]);
        await qPositionConfig(force);
      }else if(p==='ot'){
        // V317: OT page reads only the selected source month. Export history uses its own
        // staff+month query after both filters are selected, so no multi-year preload is needed.
        await group([qOt(mr,force),qRoster(mr,force),qAttendance(mr,force),qHolidays(mr,force),qIncharges(mr,force),qShiftConfirmations(mr,force)]);
      }else if(p==='audit'){
        await qAudit(force);
      }else if(p==='hr'||p==='hrSummary'){
        await group([qLeaves(fiscal,force),qHrChecks(force)]);
      }else if(p==='scheduler'){
        await group([qRosterMonths(mr,force),qRoster(mr,force),qLeaves(mr,force),qActivities(mr,force),qHolidays(mr,force),qPositions(mr,force),qDayStatus(mr,force)]);
        await qPositionConfig(force);
        await qDutyEligibility(force);
      }else if(p==='eligibility'||p==='positionManagement'||p==='internManagement'){
        await qPositionConfig(force);
      }else if(p==='myProfile'||p==='profileRequests'){
        await qProfileRequests(force);
      }
      setSync('พร้อมใช้งาน');
    }catch(error){
      console.error(`[${VERSION}] page load failed`,p,error);
      setSync('โหลดบางส่วนไม่สำเร็จ');
    }
  }

  const legacyLoad=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  const finalLoad=async function loadAllDataV316(options={}){
    const force=options===true||options?.force===true;
    return loadPageData(appState()?.page||'dashboard',{force});
  };
  finalLoad.__v316RouteAware=true;
  try{window.loadAllData=loadAllData=finalLoad;}catch(_){window.loadAllData=finalLoad;}

  const previousClick=window.handleClick||(typeof handleClick==='function'?handleClick:null);
  if(typeof previousClick==='function'){
    const wrappedClick=async function handleClickV316(event){
      const target=event.target?.closest?.('button,[data-page],[data-cal-nav],[data-cal-view]');
      const page=String(target?.dataset?.page||'');
      if(page&&STANDARD_PAGES.has(page)){
        event.preventDefault();
        event.stopPropagation();
        const st=appState();if(st)st.page=page;
        try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }
        try{if(typeof renderPage==='function')renderPage();}catch(_){ }
        await loadPageData(page,{force:false});
        try{if(appState()?.page===page&&typeof renderPage==='function')renderPage();}catch(_){ }
        return;
      }
      const isCalendar=!!(target?.dataset?.calNav||target?.dataset?.calView);
      const result=await previousClick.apply(this,arguments);
      if(isCalendar&&appState()?.page==='calendar'){
        await loadPageData('calendar',{force:false});
        try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      }
      return result;
    };
    try{window.handleClick=handleClick=wrappedClick;}catch(_){window.handleClick=wrappedClick;}
  }

  const previousChange=window.handleChange||(typeof handleChange==='function'?handleChange:null);
  if(typeof previousChange==='function'){
    const reloadIds=new Set(['rosterMonthInput','scheduleMonthInput','positionDateInput','positionMonthInput','positionMonthViewInput','otApprovalMonthFilter','otMoneyMonthV241','otSourceMonthV241','auditDateInput']);
    const wrappedChange=async function handleChangeV316(event){
      const id=String(event.target?.id||'');
      const result=previousChange.apply(this,arguments);
      if(result&&typeof result.then==='function')await result;
      if(reloadIds.has(id)){
        const page=appState()?.page||'dashboard';
        await loadPageData(page,{force:false});
        try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      }
      return result;
    };
    try{window.handleChange=handleChange=wrappedChange;}catch(_){window.handleChange=wrappedChange;}
  }

  window.addEventListener('cnmi:v316-cache-invalidated',()=>memory.clear());
  window.cnmiV316={
    version:VERSION,
    loadPageData,
    clearCache(){memory.clear();pending.clear();window.cnmiV316FetchGuard?.clear?.();},
    cacheKeys(){return [...memory.keys()];},
    legacyLoad
  };
  console.info(`[${VERSION}] loaded`);
})();
