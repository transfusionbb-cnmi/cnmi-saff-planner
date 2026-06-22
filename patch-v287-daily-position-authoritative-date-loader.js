/* CNMI Staff Planner V287
   Daily daytime-position page reliability fix for Admin / Incharge / Staff.
   - Header is always "ตารางตำแหน่งกลางวัน รายวัน".
   - A selected date is read directly from Supabase before rendering.
   - Only the selected date is replaced in state; no full loadAllData() loop.
   - Rapid date changes use a request token so an older response cannot overwrite a newer date.
   - Loading is local to the daily card and never places a full-screen click blocker.
   No SQL or schema change is required.
*/
(function(){
  'use strict';
  const VERSION='V287_DAILY_POSITION_AUTHORITATIVE_DATE_LOADER';
  const TITLE='ตารางตำแหน่งกลางวัน รายวัน';
  const SUBTITLE='ดูหรือปรับตำแหน่งประจำวัน';
  if(window.__CNMI_V287_DAILY_POSITION_AUTHORITATIVE_DATE_LOADER__)return;
  window.__CNMI_V287_DAILY_POSITION_AUTHORITATIVE_DATE_LOADER__=true;

  let rendering=false;
  let requestSerial=0;
  let activeDate='';
  let headerQueued=false;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function DB(){
    try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}
    return window.sb||window.supabaseClient||null;
  }
  function isDaily(){return String(S()?.page||'')==='positions';}
  function normDate(value){
    try{if(typeof normalizeDateKey==='function')return normalizeDateKey(value);}catch(_){}
    return String(value||'').trim().slice(0,10);
  }
  function esc(value){
    try{return escapeHtml(String(value??''));}
    catch(_){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  }
  function friendly(error){
    try{if(typeof friendlyDbError==='function')return friendlyDbError(error);}catch(_){}
    return error?.message||error?.details||error?.hint||String(error||'เกิดข้อผิดพลาด');
  }
  function toast(message,tone){
    try{if(typeof showToast==='function')showToast(message,tone?{tone}:undefined);else console.info(message);}catch(_){console.info(message);}
  }
  function assignGlobal(name,value){
    try{window[name]=value;}catch(_){}
    try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){}
  }
  function navItems(){
    try{return window.NAV_ITEMS||(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:[]);}catch(_){return window.NAV_ITEMS||[];}
  }
  function ensureNavMetadata(){
    const item=(navItems()||[]).find(row=>row?.id==='positions');
    if(item){item.title=TITLE;item.subtitle=SUBTITLE;}
  }
  function setHeading(){
    if(!isDaily())return;
    ensureNavMetadata();
    const title=document.getElementById('pageTitle');
    const subtitle=document.getElementById('pageSubtitle');
    if(title&&title.textContent!==TITLE)title.textContent=TITLE;
    if(subtitle&&subtitle.textContent!==SUBTITLE)subtitle.textContent=SUBTITLE;
  }
  function queueHeading(){
    if(headerQueued)return;
    headerQueued=true;
    queueMicrotask(()=>{headerQueued=false;setHeading();});
  }
  function dailyRenderer(){
    try{
      const fn=window.renderPositionsPage||(typeof renderPositionsPage==='function'?renderPositionsPage:null);
      return typeof fn==='function'?fn:null;
    }catch(_){return typeof window.renderPositionsPage==='function'?window.renderPositionsPage:null;}
  }
  function cleanHiddenModal(){
    const modal=document.getElementById('modal');
    if(modal?.classList.contains('hidden')){
      modal.setAttribute('aria-hidden','true');
      modal.style.setProperty('display','none','important');
      modal.style.setProperty('pointer-events','none','important');
      document.body.classList.remove('modal-open');
    }
    const root=document.getElementById('pageContent');
    if(root){root.removeAttribute('inert');root.style.removeProperty('pointer-events');}
  }
  function renderDailyStable(){
    if(!isDaily()||rendering)return;
    rendering=true;
    try{
      ensureNavMetadata();
      try{if(typeof renderNav==='function')renderNav();else window.renderNav?.();}catch(_){}
      setHeading();
      const root=document.getElementById('pageContent');
      const renderer=dailyRenderer();
      if(!root||!renderer)return;
      root.innerHTML=String(renderer()||'');
      root.dataset.v287Daily='1';
      setHeading();
      cleanHiddenModal();
      const currentDate=normDate(S()?.positionDate||document.getElementById('positionDateInput')?.value);
      if(currentDate&&activeDate!==currentDate){
        setTimeout(()=>{if(isDaily()&&activeDate!==currentDate)loadSelectedDate(currentDate);},0);
      }
    }catch(error){
      console.error(`${VERSION}: render failed`,error);
      const date=normDate(S()?.positionDate)||(new Date()).toISOString().slice(0,10);
      const root=document.getElementById('pageContent');
      if(root)root.innerHTML=`<div class="card v287-daily-error"><div class="toolbar"><label>วันที่ <input type="date" id="positionDateInput" value="${esc(date)}"></label></div><div class="notice error-notice">โหลดตารางตำแหน่งกลางวัน รายวันไม่สำเร็จ: ${esc(friendly(error))}</div></div>`;
      setHeading();
      cleanHiddenModal();
    }finally{rendering=false;}
  }
  function setLocalLoading(active,date){
    if(!isDaily())return;
    const root=document.getElementById('pageContent');
    if(!root)return;
    root.classList.toggle('v287-daily-loading',!!active);
    root.setAttribute('aria-busy',active?'true':'false');
    root.querySelectorAll('.v287-date-loading').forEach(node=>node.remove());
    if(!active)return;
    const toolbar=root.querySelector('.v225-position-toolbar,.v226-positions-page .toolbar,.toolbar');
    if(toolbar){
      const note=document.createElement('span');
      note.className='badge blue v287-date-loading';
      note.textContent=`กำลังโหลดข้อมูล ${date}`;
      toolbar.appendChild(note);
    }
  }
  function replaceDateRows(date,rows,status){
    const st=S();
    if(!st)return;
    const d=normDate(date);
    if(window.cnmiV261?.replaceDateInState){
      window.cnmiV261.replaceDateInState(d,Array.isArray(rows)?rows:[],status||null);
      return;
    }
    st.positions=(Array.isArray(st.positions)?st.positions:[]).filter(row=>normDate(row?.work_date)!==d).concat(Array.isArray(rows)?rows:[]);
    st.positionDayStatus=(Array.isArray(st.positionDayStatus)?st.positionDayStatus:[]).filter(row=>normDate(row?.work_date)!==d).concat(status?[status]:[]);
  }
  function overlap(row,date,startField='start_date',endField='end_date'){
    const start=normDate(row?.[startField]);
    const end=normDate(row?.[endField]||row?.[startField]);
    return !!start&&start<=date&&(!end||end>=date);
  }
  function mergeRowsByIdentity(current,fresh,prefix){
    const map=new Map();
    (Array.isArray(current)?current:[]).forEach((row,index)=>{
      const key=String(row?.id||`${prefix}|${row?.staff_id||''}|${row?.start_date||''}|${row?.end_date||''}|${row?.type||row?.activity_type||''}|${index}`);
      map.set(key,row);
    });
    (Array.isArray(fresh)?fresh:[]).forEach((row,index)=>{
      const key=String(row?.id||`${prefix}|${row?.staff_id||''}|${row?.start_date||''}|${row?.end_date||''}|${row?.type||row?.activity_type||''}|fresh-${index}`);
      map.set(key,row);
    });
    return Array.from(map.values());
  }
  function mergeContext(date,context){
    const st=S();
    if(!st)return;
    const month=date.slice(0,7);
    if(Array.isArray(context.incharges)){
      st.incharges=(Array.isArray(st.incharges)?st.incharges:[]).filter(row=>String(row?.month_key||'').slice(0,7)!==month).concat(context.incharges);
    }
    if(Array.isArray(context.holidays)){
      st.holidays=(Array.isArray(st.holidays)?st.holidays:[]).filter(row=>normDate(row?.holiday_date)!==date).concat(context.holidays);
    }
    /* Leave/activity RLS can differ by role. Merge returned rows without deleting
       cached rows that another role may not be allowed to read. */
    if(Array.isArray(context.leaves))st.leaves=mergeRowsByIdentity(st.leaves,context.leaves,'leave');
    if(Array.isArray(context.activities))st.activities=mergeRowsByIdentity(st.activities,context.activities,'activity');
  }
  async function fetchEssential(date){
    if(window.cnmiV261?.fetchDateFromDatabase)return window.cnmiV261.fetchDateFromDatabase(date);
    const db=DB();
    if(!db)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const [positions,status]=await Promise.all([
      db.from('daily_positions').select('*').eq('work_date',date).order('position_code'),
      db.from('daily_position_day_status').select('*').eq('work_date',date).maybeSingle()
    ]);
    if(positions.error)throw positions.error;
    if(status.error)throw status.error;
    return{rows:positions.data||[],status:status.data||null};
  }
  async function fetchContext(date){
    const db=DB();
    if(!db)return{};
    const month=date.slice(0,7);
    const jobs={
      incharges:db.from('monthly_incharges').select('*').eq('month_key',month),
      holidays:db.from('public_holidays').select('*').eq('holiday_date',date),
      leaves:db.from('leave_requests').select('*').lte('start_date',date).gte('end_date',date),
      activities:db.from('activity_events').select('*').lte('start_date',date).gte('end_date',date)
    };
    const entries=Object.entries(jobs);
    const results=await Promise.allSettled(entries.map(([,job])=>job));
    const out={};
    results.forEach((result,index)=>{
      const key=entries[index][0];
      if(result.status==='fulfilled'&&!result.value?.error)out[key]=result.value?.data||[];
      else if(result.status==='fulfilled'&&result.value?.error)console.warn(`${VERSION}: optional ${key} load skipped`,result.value.error);
      else console.warn(`${VERSION}: optional ${key} load skipped`,result.reason);
    });
    return out;
  }
  function withTimeout(promise,ms){
    let timer;
    return Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('หมดเวลารอข้อมูลจากฐานข้อมูล กรุณาเลือกวันที่อีกครั้ง')),ms);})
    ]).finally(()=>clearTimeout(timer));
  }
  async function loadSelectedDate(date){
    const d=normDate(date);
    if(!d||!isDaily())return false;
    const st=S();
    if(st)st.positionDate=d;
    activeDate=d;
    const serial=++requestSerial;
    setLocalLoading(true,d);
    const contextPromise=fetchContext(d);
    try{
      const fresh=await withTimeout(fetchEssential(d),15000);
      if(serial!==requestSerial||!isDaily()||normDate(S()?.positionDate)!==d)return false;
      replaceDateRows(d,fresh?.rows||[],fresh?.status||null);
      const context=await Promise.race([contextPromise,new Promise(resolve=>setTimeout(()=>resolve({}),2500))]);
      if(serial!==requestSerial||!isDaily()||normDate(S()?.positionDate)!==d)return false;
      mergeContext(d,context||{});
      renderDailyStable();
      console.info(`${VERSION}: selected date loaded`,{date:d,rows:(fresh?.rows||[]).length,status:fresh?.status?.status||null});
      contextPromise.then(late=>{
        if(serial!==requestSerial||!isDaily()||normDate(S()?.positionDate)!==d)return;
        mergeContext(d,late||{});
        renderDailyStable();
      }).catch(()=>{});
      return true;
    }catch(error){
      if(serial!==requestSerial)return false;
      console.error(`${VERSION}: selected date load failed`,error);
      toast(`โหลดข้อมูลวันที่ ${d} ไม่สำเร็จ: ${friendly(error)}`,'error');
      renderDailyStable();
      return false;
    }finally{
      if(serial===requestSerial)setLocalLoading(false,d);
    }
  }

  ensureNavMetadata();

  /* Final route entry: daily page is rendered once, without traversing the long legacy route chain. */
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRender&&!previousRender.__v287DailyStableRoute){
    const wrapped=function renderPageV287(){
      if(isDaily()){
        renderDailyStable();
        return;
      }
      activeDate='';
      requestSerial+=1;
      return previousRender.apply(this,arguments);
    };
    wrapped.__v287DailyStableRoute=true;
    assignGlobal('renderPage',wrapped);
  }

  /* Stop the old immediate render. The DOM is not replaced until the native date event has ended
     and Supabase has returned the authoritative rows for the selected date. */
  window.addEventListener('change',event=>{
    if(!isDaily()||event.target?.id!=='positionDateInput')return;
    const value=normDate(event.target.value);
    if(!value)return;
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const st=S();
    if(st)st.positionDate=value;
    setTimeout(()=>loadSelectedDate(value),0);
  },true);

  /* Correct the header if any delayed legacy callback writes an older page title. */
  try{
    const title=document.getElementById('pageTitle');
    if(title){
      const observer=new MutationObserver(()=>{if(isDaily())queueHeading();});
      observer.observe(title,{childList:true,characterData:true,subtree:true});
      window.__CNMI_V287_HEADER_OBSERVER__=observer;
    }
  }catch(_){}

  const style=document.createElement('style');
  style.id='v287-daily-position-authoritative-date-loader-style';
  style.textContent=`
    #pageContent.v287-daily-loading .v225-positions-page,
    #pageContent.v287-daily-loading .v226-positions-page{outline:2px solid rgba(14,165,233,.16);outline-offset:2px}
    .v287-date-loading{display:inline-flex!important;align-items:center;gap:6px;white-space:nowrap}
    .v287-date-loading::before{content:'';width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:v287spin .75s linear infinite}
    @keyframes v287spin{to{transform:rotate(360deg)}}
    .v287-daily-error{max-width:760px}
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ensureNavMetadata();if(isDaily()){setHeading();renderDailyStable();}},80));
  setTimeout(()=>{ensureNavMetadata();if(isDaily()){setHeading();renderDailyStable();}},0);
  setTimeout(()=>{if(isDaily())setHeading();},400);

  window.cnmiV287={loadSelectedDate,renderDailyStable,setHeading,fetchEssential,fetchContext};
  console.info(`${VERSION} loaded`);
})();
