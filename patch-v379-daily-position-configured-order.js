/* CNMI Staff Planner V379 — revised build
   Daily position order follows the Slot count explicitly selected in the monthly table.

   Source priority for a normal workday:
   1) manual_day_slot_settings.target_slots (the "Slot" value selected by Admin in the monthly table)
   2) infer from the Admin-saved positions for that date when the setting has not loaded yet

   The selected count is synchronized to the legacy daily Slot store before the daily page renders,
   so existing V225/V226 rendering uses the correct 8-14 Slot template and its exact order.
   Saved staff assignments, descriptions, colors, OT, leave, and Supabase rows are not modified.
*/
(function(){
  'use strict';

  const VERSION='V379_DAILY_POSITION_MONTH_SLOT_SOURCE_R2';
  const DAILY_SLOT_KEY='cnmi_v225_daily_slot_set_by_date';
  const VALID_SET_MIN=8;
  const VALID_SET_MAX=14;

  if(window.__CNMI_V379_DAILY_POSITION_MONTH_SLOT_SOURCE_R2__)return;
  window.__CNMI_V379_DAILY_POSITION_MONTH_SLOT_SOURCE_R2__=true;

  let queued=false;
  let reRendering=false;
  let reordering=false;
  const loadingMonths=new Set();

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function normDate(v){return text(v).slice(0,10);}
  function page(){return text(S()?.page);}
  function dateValue(){return normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate||'');}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function keyOf(value){return text(value).replace(/\s+/g,'').toLowerCase();}
  function validCode(value){
    const k=keyOf(value);
    return !!k && k!=='รอตรวจสอบ' && !k.startsWith('__cnmi_slot_template');
  }
  function finiteNumber(v){const n=Number(v);return Number.isFinite(n)?n:null;}

  function configs(){
    try{
      const cfg=window.cnmiV224?.currentConfigs?.();
      if(cfg)return cfg;
    }catch(_){ }
    const runtime=window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218||window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS||{};
    return {day:runtime,outing:[]};
  }
  function daySetEntries(){
    const day=configs()?.day||{};
    const out=[];
    for(let n=VALID_SET_MIN;n<=VALID_SET_MAX;n++){
      const rows=Array.isArray(day[n])?day[n]:(Array.isArray(day[String(n)])?day[String(n)]:[]);
      if(rows.length)out.push({count:n,rows});
    }
    return out;
  }
  function selectedSetRows(count){
    const found=daySetEntries().find(item=>item.count===Number(count));
    return found?.rows||[];
  }
  function isOutingDate(date){
    try{if(typeof hasOutingSafe==='function'&&hasOutingSafe(date))return true;}catch(_){ }
    const rows=(S()?.positions||[]).filter(row=>normDate(row?.work_date)===date);
    return rows.some(row=>row?.is_outing===true||text(row?.zone)==='ออกหน่วย'||text(row?.eligibility_code).startsWith('OUTING:'));
  }

  function explicitTarget(date){
    const row=(S()?.manualDaySlotSettingsV273||[]).find(item=>normDate(item?.work_date)===date);
    const target=finiteNumber(row?.target_slots);
    if(target===null)return null;
    const rounded=Math.round(target);
    return daySetEntries().some(item=>item.count===rounded)?rounded:null;
  }
  function savedPlanRows(date){
    return (S()?.positions||[]).filter(row=>normDate(row?.work_date)===date&&validCode(codeOf(row)));
  }
  function inferTarget(date){
    const plan=savedPlanRows(date);
    if(!plan.length)return null;
    const wanted=new Set(plan.map(row=>keyOf(codeOf(row))).filter(Boolean));
    const candidates=daySetEntries();
    if(!candidates.length)return null;

    /* First use the exact number of distinct Slot codes saved in the monthly table. */
    const exact=candidates.filter(item=>item.count===wanted.size).sort((a,b)=>{
      const overlapA=a.rows.reduce((sum,row)=>sum+(wanted.has(keyOf(codeOf(row)))?1:0),0);
      const overlapB=b.rows.reduce((sum,row)=>sum+(wanted.has(keyOf(codeOf(row)))?1:0),0);
      return overlapB-overlapA;
    })[0];
    if(exact)return exact.count;

    /* Fallback for legacy/duplicate rows: choose the set that covers the saved plan best. */
    let best=null;
    candidates.forEach(item=>{
      const set=new Set(item.rows.map(row=>keyOf(codeOf(row))).filter(Boolean));
      let overlap=0;
      wanted.forEach(code=>{if(set.has(code))overlap++;});
      const missing=wanted.size-overlap;
      const extra=Math.max(0,set.size-overlap);
      const complete=missing===0?1:0;
      const score=(complete*100000)+(overlap*1000)-(missing*500)-(extra*10)-Math.abs(item.count-wanted.size);
      if(!best||score>best.score)best={count:item.count,score};
    });
    return best?.count||null;
  }
  function targetForDate(date){
    if(!date||isOutingDate(date))return null;
    return explicitTarget(date)??inferTarget(date);
  }

  function readDailyStore(){try{return JSON.parse(localStorage.getItem(DAILY_SLOT_KEY)||'{}')||{};}catch(_){return{};}}
  function syncLegacyDailyStore(date,target){
    if(!date||!target)return false;
    const store=readDailyStore();
    if(Number(store[date])===Number(target))return false;
    store[date]=Number(target);
    try{localStorage.setItem(DAILY_SLOT_KEY,JSON.stringify(store));return true;}catch(_){return false;}
  }

  function loadMonthSetting(date){
    const month=normDate(date).slice(0,7);
    if(!month||loadingMonths.has(month)||typeof window.cnmiV273?.loadSlotSettings!=='function')return;
    loadingMonths.add(month);
    Promise.resolve(window.cnmiV273.loadSlotSettings(month,false)).then(()=>{
      loadingMonths.delete(month);
      const current=dateValue();
      if(page()!=='positions'||!current||current.slice(0,7)!==month)return;
      const target=targetForDate(current);
      if(syncLegacyDailyStore(current,target))requestDailyRender();
      else queue(0);
    }).catch(err=>{
      loadingMonths.delete(month);
      console.warn(`[${VERSION}] load Slot setting failed`,err);
    });
  }

  function syncBeforeRender(){
    if(page()!=='positions')return false;
    const date=dateValue()||normDate(S()?.positionDate);
    if(!date)return false;
    const changed=syncLegacyDailyStore(date,targetForDate(date));
    loadMonthSetting(date);
    return changed;
  }

  function requestDailyRender(){
    if(reRendering||page()!=='positions')return;
    const fn=window.renderPage||(typeof renderPage==='function'?renderPage:null);
    if(typeof fn!=='function')return;
    reRendering=true;
    try{fn();}catch(err){console.warn(`[${VERSION}] re-render failed`,err);}
    finally{reRendering=false;}
  }

  /* Ensure the correct monthly Slot count is present before legacy V225/V226 builds the daily rows. */
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'&&!previousRenderPage.__v379MonthSlotSourceR2){
    const wrapped=function renderPageV379MonthSlotSource(){
      try{syncBeforeRender();}catch(err){console.warn(`[${VERSION}] pre-render sync failed`,err);}
      return previousRenderPage.apply(this,arguments);
    };
    wrapped.__v379MonthSlotSourceR2=true;
    wrapped.__v379Previous=previousRenderPage;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  function dailyRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return[];
  }
  function masterRank(){
    const list=(S()?.positionMasters||S()?.dailyPositionMasters||[]).filter(row=>validCode(codeOf(row)))
      .map((row,index)=>({row,index,order:finiteNumber(row?.sort_order??row?.order)??99999}))
      .sort((a,b)=>a.order-b.order||a.index-b.index);
    const map=new Map();
    list.forEach((entry,index)=>{const key=keyOf(codeOf(entry.row));if(key&&!map.has(key))map.set(key,index+1);});
    return map;
  }
  function orderedEntries(rows,date){
    const target=targetForDate(date);
    const rank=new Map();
    selectedSetRows(target).forEach((row,index)=>{const key=keyOf(codeOf(row));if(key&&!rank.has(key))rank.set(key,index+1);});
    const masters=masterRank();
    return rows.map((row,index)=>({row,index,key:keyOf(codeOf(row))})).sort((a,b)=>{
      const ar=rank.get(a.key)??99999;
      const br=rank.get(b.key)??99999;
      if(ar!==br)return ar-br;
      const am=masters.get(a.key)??99999;
      const bm=masters.get(b.key)??99999;
      if(am!==bm)return am-bm;
      return a.index-b.index;
    });
  }
  function setIndexes(holder,index){
    holder.querySelectorAll?.('[data-position-row]').forEach(node=>node.setAttribute('data-position-row',String(index)));
    ['data-v225-position-detail','data-v226-position-detail','data-v296-position-detail','data-position-detail-v219'].forEach(attr=>{
      holder.querySelectorAll?.(`[${attr}]`).forEach(node=>node.setAttribute(attr,String(index)));
    });
  }
  function reorderDaily(root=document){
    if(reordering||page()!=='positions')return false;
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page')||document.querySelector('.v225-positions-page,.v226-positions-page');
    if(!area)return false;
    const date=dateValue();
    const rows=dailyRows();
    if(!date||!rows.length)return false;
    const entries=orderedEntries(rows,date);
    if(!entries.length)return false;

    const tableBody=area.querySelector('.v225-daily-position-table tbody');
    const cardList=area.querySelector('.v225-mobile-position-list');
    const tableNodes=tableBody?Array.from(tableBody.children):[];
    const cardNodes=cardList?Array.from(cardList.children).filter(node=>node.matches?.('.position-mobile-card,.v225-position-card')):[];
    if(tableNodes.length!==rows.length&&cardNodes.length!==rows.length)return false;

    const changed=entries.some((entry,index)=>entry.index!==index);
    reordering=true;
    try{
      const sorted=entries.map(entry=>entry.row);
      window.__CNMI_V225_DAILY_POSITION_ROWS__=sorted;
      if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))window.__CNMI_V226_DAILY_POSITION_ROWS__=sorted;
      window.__CNMI_V379_DAILY_POSITION_ROWS__=sorted;

      if(tableNodes.length===rows.length){
        if(changed)entries.forEach((entry,index)=>{const node=tableNodes[entry.index];if(node){tableBody.appendChild(node);setIndexes(node,index);}});
        else tableNodes.forEach((node,index)=>setIndexes(node,index));
      }
      if(cardNodes.length===rows.length){
        if(changed)entries.forEach((entry,index)=>{const node=cardNodes[entry.index];if(node){cardList.appendChild(node);setIndexes(node,index);}});
        else cardNodes.forEach((node,index)=>setIndexes(node,index));
      }
      area.dataset.v379MonthSlotCount=String(targetForDate(date)||'');
      area.dataset.v379MonthSlotSource=explicitTarget(date)!=null?'monthly-setting':'saved-plan';
      if(changed){try{window.cnmiV378?.enhance?.(document);}catch(_){ }}
      return changed;
    }finally{reordering=false;}
  }

  function apply(){
    if(page()!=='positions')return;
    const date=dateValue()||normDate(S()?.positionDate);
    if(!date)return;
    const changed=syncLegacyDailyStore(date,targetForDate(date));
    loadMonthSetting(date);
    if(changed){requestDailyRender();return;}
    reorderDaily(document);
  }
  function queue(delay=0){
    if(delay>0){setTimeout(()=>queue(0),delay);return;}
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  function install(){
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v379MonthSlotObserverR2){
      const observer=new MutationObserver(()=>queue(0));
      observer.observe(root,{childList:true,subtree:true});
      root.__v379MonthSlotObserverR2=observer;
    }
    [0,80,250,700,1500].forEach(queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',()=>[0,120,600].forEach(queue));
  document.addEventListener('change',event=>{
    if(event.target?.closest?.('#positionDateInput'))[0,80,300].forEach(queue);
  },true);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-nav="positions"],[data-page="positions"],button,a'))queue(120);
  },true);

  window.cnmiV379={
    version:VERSION,
    targetForDate,
    explicitTarget,
    inferTarget,
    syncBeforeRender,
    reorderDaily
  };
  console.info(`[${VERSION}] loaded`);
})();
