/* CNMI Staff Planner V335 — Daily position save route lock
   Scope: daily daytime-position Save/Publish buttons only.
   - Keeps Admin/Incharge on the daily page after saving.
   - Uses the V261 authoritative daily save directly, bypassing legacy wrappers
     that reload all page data and can switch the current route to the monthly page.
   - Preserves trainee/mentor synchronization and reads the saved date back once.
   - Does not change popup, calendar, roster, leave, OT, or monthly-position UI logic.
*/
(function(){
  'use strict';
  const VERSION='V335_DAILY_POSITION_SAVE_ROUTE_LOCK';
  if(window.__CNMI_V335_DAILY_POSITION_SAVE_ROUTE_LOCK__) return;
  window.__CNMI_V335_DAILY_POSITION_SAVE_ROUTE_LOCK__=true;

  let inFlight=false;

  function S(){
    try{return state||window.state||null;}
    catch(_){return window.state||null;}
  }
  function normDate(value){
    try{if(typeof normalizeDateKey==='function') return normalizeDateKey(value);}
    catch(_){}
    return String(value||'').trim().slice(0,10);
  }
  function friendly(error){
    try{if(typeof friendlyDbError==='function') return friendlyDbError(error);}
    catch(_){}
    return error?.message||error?.details||error?.hint||String(error||'เกิดข้อผิดพลาด');
  }
  function toast(message,tone){
    try{
      if(typeof showToast==='function') showToast(message,tone?{tone}:undefined);
      else console.info(message);
    }catch(_){console.info(message);}
  }
  function assignGlobal(name,value){
    try{window[name]=value;}catch(_){}
    try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){}
  }
  function dailyDate(){
    const st=S();
    return normDate(document.getElementById('positionDateInput')?.value||st?.positionDate||'');
  }
  function pinDailyRoute(date){
    const st=S();
    if(!st) return;
    st.page='positions';
    if(date) st.positionDate=normDate(date);
  }
  function isDailyPage(){return String(S()?.page||'')==='positions';}
  function snapshotScroll(){
    const root=document.getElementById('pageContent');
    const scroller=root?.querySelector('.daily-position-table,.v331-daily-position-list,.table-wrap');
    return {
      windowX:window.scrollX||0,
      windowY:window.scrollY||0,
      rootTop:root?.scrollTop||0,
      rootLeft:root?.scrollLeft||0,
      tableTop:scroller?.scrollTop||0,
      tableLeft:scroller?.scrollLeft||0
    };
  }
  function restoreScroll(saved){
    if(!saved) return;
    requestAnimationFrame(()=>{
      try{window.scrollTo(saved.windowX,saved.windowY);}catch(_){}
      const root=document.getElementById('pageContent');
      if(root){root.scrollTop=saved.rootTop;root.scrollLeft=saved.rootLeft;}
      const scroller=root?.querySelector('.daily-position-table,.v331-daily-position-list,.table-wrap');
      if(scroller){scroller.scrollTop=saved.tableTop;scroller.scrollLeft=saved.tableLeft;}
    });
  }
  function renderDaily(date,scroll){
    pinDailyRoute(date);
    try{
      if(window.cnmiV287?.renderDailyStable) window.cnmiV287.renderDailyStable();
      else if(typeof renderPage==='function') renderPage();
      else window.renderPage?.();
    }catch(error){console.warn(`${VERSION}: daily rerender skipped`,error);}
    restoreScroll(scroll);
  }
  function setButtonsDisabled(disabled){
    document.querySelectorAll('[data-save-positions],[data-publish-positions]').forEach(button=>{
      try{button.disabled=!!disabled;button.setAttribute('aria-busy',disabled?'true':'false');}
      catch(_){}
    });
  }

  async function syncTrainingRows(date){
    /* V270 becomes inert when V271 date-range mentorship is active, but keeping
       this call preserves compatibility with older saved staff profiles. */
    if(window.cnmiV270?.syncTraineePairsForDate){
      await window.cnmiV270.syncTraineePairsForDate(date);
      pinDailyRoute(date);
    }
    if(window.cnmiV271?.syncTrainingPairsForDate){
      await window.cnmiV271.syncTrainingPairsForDate(date);
      pinDailyRoute(date);
    }
  }

  async function refreshSavedDate(date){
    const api=window.cnmiV261;
    if(!api?.fetchDateFromDatabase||!api?.replaceDateInState) return;
    const fresh=await api.fetchDateFromDatabase(date);
    api.replaceDateInState(date,fresh?.rows||[],fresh?.status||null);
    pinDailyRoute(date);
  }

  const previousSave=window.savePositions||(typeof savePositions==='function'?savePositions:null);
  const previousPublish=window.publishPositionsForDay||(typeof publishPositionsForDay==='function'?publishPositionsForDay:null);

  async function runStableDailySave(publish,args,context){
    if(!isDailyPage()){
      const fallback=publish?previousPublish:previousSave;
      return typeof fallback==='function'?fallback.apply(context,args):false;
    }
    const date=dailyDate();
    if(!date) return false;
    if(inFlight){toast('ระบบกำลังบันทึกตำแหน่งวันนี้ กรุณารอสักครู่');return false;}

    const core=window.cnmiV261?.saveDailyAuthoritative;
    if(typeof core!=='function'){
      const fallback=publish?previousPublish:previousSave;
      return typeof fallback==='function'?fallback.apply(context,args):false;
    }

    const scroll=snapshotScroll();
    inFlight=true;
    pinDailyRoute(date);
    setButtonsDisabled(true);
    try{
      const result=await core({publish:!!publish});
      pinDailyRoute(date);
      if(result!==true){renderDaily(date,scroll);return result;}

      try{
        await syncTrainingRows(date);
        await refreshSavedDate(date);
      }catch(error){
        console.error(`${VERSION}: trainee sync/readback failed`,error);
        toast(`บันทึกตำแหน่งหลักแล้ว แต่ซิงก์ผู้ฝึกไม่สำเร็จ: ${friendly(error)}`,'error');
      }

      /* Invalidate only in-memory route caches. No extra Supabase request is made
         here; the next page opens with fresh data instead of an old cached month. */
      try{window.cnmiV316?.clearCache?.();}catch(_){}
      pinDailyRoute(date);
      renderDaily(date,scroll);
      return result;
    }finally{
      pinDailyRoute(date);
      inFlight=false;
      setButtonsDisabled(false);
    }
  }

  const saveStable=async function savePositionsV335(){
    return runStableDailySave(false,arguments,this);
  };
  saveStable.__v335DailyRouteLock=true;
  assignGlobal('savePositions',saveStable);

  const publishStable=async function publishPositionsForDayV335(){
    return runStableDailySave(true,arguments,this);
  };
  publishStable.__v335DailyRouteLock=true;
  assignGlobal('publishPositionsForDay',publishStable);

  window.cnmiV335={version:VERSION,runStableDailySave,pinDailyRoute};
  console.info(`${VERSION} loaded`);
})();
