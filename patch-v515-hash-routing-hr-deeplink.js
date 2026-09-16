/* CNMI Staff Planner V515
 * URL hash routing + HR deep-link/safe-status sync.
 *
 * Goals:
 * - Every app page has a readable URL (#/dashboard, #/hr-check?month=2026-09, ...).
 * - Browser Back/Forward and Refresh reopen the same page/filter instead of always looking like the root app.
 * - Admin HR page refreshes public.hr_check_status_public before rendering pending status,
 *   so a Staff "ลาในระบบแล้ว" confirmation is visible even when public.hr_checks is protected by RLS.
 * - No schema change / no SQL required.
 */
(function(){
  'use strict';
  const VERSION='V515_HASH_ROUTING_HR_DEEPLINK';
  if(window.__CNMI_V515_HASH_ROUTING_HR_DEEPLINK__) return;
  window.__CNMI_V515_HASH_ROUTING_HR_DEEPLINK__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.sb||window.supabaseClient||null;}
  function text(v){return String(v==null?'':v).trim();}
  function validMonth(v){return /^\d{4}-\d{2}$/.test(text(v));}
  function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(text(v));}
  function authHash(raw){return /(?:^|[#&?])(access_token|refresh_token|token_hash|code|type)=(?:[^&]*)/i.test(String(raw||'')) && /(access_token|refresh_token|token_hash|type=(?:recovery|password_recovery|invite)|(?:^|[?&#])code=)/i.test(String(raw||''));}

  const PAGE_TO_ROUTE={
    dashboard:'dashboard', calendar:'calendar', leave:'leave', myProfile:'profile',
    activities:'activities', myTraining:'training', trainingAdmin:'training-admin',
    schedule:'roster', tradeRequests:'trade', positionMonthView:'positions/month',
    positions:'positions/day', ot:'ot', audit:'audit', hr:'hr-check', hrSummary:'hr-summary',
    scheduler:'roster-admin', positionMonth:'positions/month-admin', positionManagement:'positions/manage',
    profileRequests:'profile-requests', profileRequestSummary:'profile-requests/history', users:'users',
    eligibility:'eligibility', internManagement:'intern', claimHistory:'ot/claims',
    physicianConsult:'physician-consult', donorHelpers:'donor-helpers', holidayRulesV107:'holiday-rules',
    dutyEligibilityV107:'duty-eligibility', accountSettings:'account'
  };
  const ROUTE_TO_PAGE=Object.fromEntries(Object.entries(PAGE_TO_ROUTE).map(([p,r])=>[r,p]));

  function navIds(){
    try{return new Set((typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]).map(x=>text(x?.id)).filter(Boolean));}
    catch(_){return new Set(Object.keys(PAGE_TO_ROUTE));}
  }
  function knownPage(page){return !!page&&(navIds().has(page)||Object.prototype.hasOwnProperty.call(PAGE_TO_ROUTE,page));}
  function routeForPage(page){return PAGE_TO_ROUTE[page]||text(page||'dashboard').replace(/^\/+|\/+$/g,'')||'dashboard';}
  function pageForRoute(route){
    const clean=text(route).replace(/^\/+|\/+$/g,'');
    const mapped=ROUTE_TO_PAGE[clean];
    if(mapped)return mapped;
    // Fallback allows future pages to deep-link using their internal page id.
    if(knownPage(clean))return clean;
    return 'dashboard';
  }
  function parseHash(){
    const raw=String(location.hash||'');
    if(!raw||raw==='#'||authHash(raw))return null;
    const h=raw.replace(/^#\/?/,'');
    const q=h.indexOf('?');
    const route=decodeURIComponent((q>=0?h.slice(0,q):h)||'dashboard');
    const params=new URLSearchParams(q>=0?h.slice(q+1):'');
    return {page:pageForRoute(route),route,params};
  }

  function selectedDashboardDate(){
    const st=S();
    try{
      const d=window.cnmiDashboardDateV443?.selectedDate?.();
      if(validDate(d))return d;
    }catch(_){ }
    return validDate(st.dashboardDateV443)?st.dashboardDateV443:'';
  }
  function monthForPage(page){
    const st=S();
    if(page==='hr')return validMonth(st.hrFilterMonth)?st.hrFilterMonth:(validMonth(st.monthKey)?st.monthKey:'');
    if(page==='hrSummary')return validMonth(st.hrSummaryFilterMonth)?st.hrSummaryFilterMonth:(validMonth(st.monthKey)?st.monthKey:'');
    if(page==='positionMonth')return validMonth(st.positionMonthKey)?st.positionMonthKey:'';
    if(page==='positionMonthView')return validMonth(st.positionMonthViewKey)?st.positionMonthViewKey:'';
    if(['schedule','scheduler','tradeRequests'].includes(page))return validMonth(st.monthKey)?st.monthKey:'';
    if(page==='physicianConsult')return validMonth(st.physicianConsultMonthV452)?st.physicianConsultMonthV452:(validMonth(st.monthKey)?st.monthKey:'');
    return '';
  }
  function paramsFromState(page,override={}){
    const st=S(),p=new URLSearchParams();
    const month=validMonth(override.month)?override.month:monthForPage(page);
    const date=validDate(override.date)?override.date:'';
    if(month)p.set('month',month);
    if(page==='dashboard'){
      const d=date||selectedDashboardDate(); if(validDate(d))p.set('date',d);
    }else if(page==='positions'){
      const d=date||(validDate(st.positionDate)?st.positionDate:''); if(validDate(d))p.set('date',d);
    }else if(page==='audit'){
      const d=date||(validDate(st.auditDate)?st.auditDate:''); if(validDate(d))p.set('date',d);
    }else if(page==='calendar'){
      try{
        const cd=st.calendarDate instanceof Date&&!Number.isNaN(st.calendarDate.getTime())?st.calendarDate:null;
        if(cd){const d=[cd.getFullYear(),String(cd.getMonth()+1).padStart(2,'0'),String(cd.getDate()).padStart(2,'0')].join('-');p.set('date',d);}
      }catch(_){ }
      if(st.calendarView)p.set('view',text(st.calendarView));
    }
    if(page==='hr'&&text(st.hrFilterStaff))p.set('staff',text(st.hrFilterStaff));
    if(page==='hrSummary'&&text(st.hrSummaryFilterStaff))p.set('staff',text(st.hrSummaryFilterStaff));
    return p;
  }
  function hashFor(page,override={}){
    const route=routeForPage(page),p=paramsFromState(page,override),qs=p.toString();
    return `#/${route}${qs?`?${qs}`:''}`;
  }
  function setUrl(page,{push=false,override={}}={}){
    if(authHash(location.hash))return;
    const target=hashFor(page,override);
    if(location.hash===target)return;
    try{
      if(push)history.pushState({cnmiPage:page},'',target);
      else history.replaceState({cnmiPage:page},'',target);
    }catch(_){
      if(push)location.hash=target; else location.replace(target);
    }
  }

  function applyParams(page,params){
    const st=S(); if(!st)return;
    const month=text(params.get('month')),date=text(params.get('date')),staff=text(params.get('staff')),view=text(params.get('view'));
    if(validMonth(month)){
      if(page==='hr')st.hrFilterMonth=month;
      else if(page==='hrSummary')st.hrSummaryFilterMonth=month;
      else if(page==='positionMonth')st.positionMonthKey=month;
      else if(page==='positionMonthView')st.positionMonthViewKey=month;
      else if(['schedule','scheduler','tradeRequests'].includes(page))st.monthKey=month;
      else if(page==='physicianConsult'){st.physicianConsultMonthV452=month;st.monthKey=month;}
    }
    if(validDate(date)){
      if(page==='dashboard')st.dashboardDateV443=date;
      else if(page==='positions')st.positionDate=date;
      else if(page==='audit')st.auditDate=date;
      else if(page==='calendar'){
        const d=new Date(`${date}T12:00:00`); if(!Number.isNaN(d.getTime()))st.calendarDate=d;
      }
    }
    if(page==='calendar'&&['month','week','day'].includes(view))st.calendarView=view;
    if(page==='hr'&&staff)st.hrFilterStaff=staff;
    if(page==='hrSummary'&&staff)st.hrSummaryFilterStaff=staff;
  }

  let hrPromise=null,hrLoadedAt=0,hrSignature='';
  function hrSig(rows){return (rows||[]).map(r=>`${r?.leave_request_id||''}|${r?.status||''}|${r?.hr_reported_date||''}`).sort().join('~');}
  async function syncSafeHr(force=false,{render=true}={}){
    const st=S(),db=DB();
    if(!st?.profile||!db)return st?.hrChecks||[];
    if(hrPromise)return hrPromise;
    if(!force&&Date.now()-hrLoadedAt<5000&&hrSig(st.hrChecks||[])===hrSignature)return st.hrChecks||[];
    hrPromise=(async()=>{
      try{
        const q=await db.from('hr_check_status_public').select('leave_request_id,status,hr_reported_date').limit(2000);
        if(q?.error)throw q.error;
        const safe=Array.isArray(q?.data)?q.data:[];
        const oldMap=new Map((st.hrChecks||[]).map(r=>[String(r?.leave_request_id||''),r]));
        const merged=safe.map(r=>({...oldMap.get(String(r?.leave_request_id||'')),...r}));
        const sig=hrSig(merged),changed=sig!==hrSignature||hrSig(st.hrChecks||[])!==sig;
        st.hrChecks=merged;hrSignature=sig;hrLoadedAt=Date.now();
        if(changed&&render&&['hr','hrSummary','leave','calendar'].includes(text(st.page))){
          setTimeout(()=>{try{if(typeof renderPage==='function')renderPage();}catch(_){ }},0);
        }
        return merged;
      }catch(err){
        console.warn(`[${VERSION}] safe HR sync failed`,err);
        return st.hrChecks||[];
      }finally{hrPromise=null;}
    })();
    return hrPromise;
  }

  let routeApplyToken=0;
  async function loadRoutePage(page,{force=false}={}){
    const token=++routeApplyToken,st=S();
    if(!st?.profile)return;
    try{
      if(window.cnmiV316?.loadPageData)await window.cnmiV316.loadPageData(page,{force});
      else if(typeof loadAllData==='function')await loadAllData({force});
    }catch(err){console.warn(`[${VERSION}] route load`,page,err);}
    if(['hr','hrSummary'].includes(page))await syncSafeHr(true,{render:false});
    if(token!==routeApplyToken||text(S().page)!==page)return;
    try{if(typeof renderPage==='function')renderPage();}catch(_){ }
  }
  async function applyLocationRoute({load=true}={}){
    const parsed=parseHash();if(!parsed)return;
    const st=S();if(!st)return;
    st.page=parsed.page;applyParams(parsed.page,parsed.params);
    try{if(typeof renderPage==='function'&&st.profile)renderPage();}catch(_){ }
    if(load&&st.profile)await loadRoutePage(parsed.page,{force:false});
  }

  // Parse early so the route-aware loader enters the correct page on first login/session restore.
  try{applyLocationRoute({load:false});}catch(_){ }

  // Update URL before legacy handlers process menu clicks. We don't prevent the click.
  document.addEventListener('click',e=>{
    const nav=e.target?.closest?.('[data-page]');
    if(nav){
      const page=text(nav.getAttribute('data-page'));
      if(page){setUrl(page,{push:true});return;}
    }
    const pending=e.target?.closest?.('[data-v460-open-page]');
    if(pending){
      const page=text(pending.getAttribute('data-v460-open-page'))||'dashboard';
      const month=text(pending.getAttribute('data-v460-open-month'));
      const date=text(pending.getAttribute('data-v460-open-date'));
      setUrl(page,{push:true,override:{month,date}});
    }
  },true);

  // Keep URL aligned with programmatic navigation and filters.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV515(){
      const out=previousRender.apply(this,arguments);
      const st=S(),page=text(st?.page)||'dashboard';
      try{setUrl(page,{push:false});}catch(_){ }
      try{
        const item=(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]).find(x=>text(x?.id)===page);
        if(item?.title)document.title=`${item.title} | Staff Planner`;
      }catch(_){ }
      if(['hr','hrSummary'].includes(page)){
        // V316 can still receive zero hr_checks rows because that private table is RLS protected.
        // Always refresh the safe projection after its render so the HR page converges to the real status.
        setTimeout(()=>syncSafeHr(false,{render:true}),0);
      }
      return out;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  let popTimer=null;
  function scheduleRouteFromHistory(){
    clearTimeout(popTimer);popTimer=setTimeout(()=>applyLocationRoute({load:true}),20);
  }
  window.addEventListener('popstate',scheduleRouteFromHistory);
  window.addEventListener('hashchange',scheduleRouteFromHistory);

  // HR filters change the deep-link in place. Other page filters are synchronized by renderPage.
  document.addEventListener('change',e=>{
    const id=text(e.target?.id);
    if(['hrFilterMonth','hrFilterStaff','hrSummaryFilterMonth','hrSummaryFilterStaff','auditDateInput','positionDateInput','positionMonthInput','positionMonthViewInput','rosterMonthInput','scheduleMonthInput'].includes(id)){
      setTimeout(()=>{try{setUrl(text(S().page)||'dashboard',{push:false});}catch(_){ }},0);
    }
  },true);

  window.cnmiV515={
    version:VERSION,
    parseHash,hashFor,setUrl,applyLocationRoute,syncSafeHr,
    navigate(page,params={}){
      const p=knownPage(page)?page:pageForRoute(page);
      setUrl(p,{push:true,override:params});
      const st=S();st.page=p;
      const fake=new URLSearchParams();if(params.month)fake.set('month',params.month);if(params.date)fake.set('date',params.date);if(params.staff)fake.set('staff',params.staff);
      applyParams(p,fake);try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      return loadRoutePage(p,{force:false});
    }
  };
  console.info(`${VERSION} loaded`);
})();
