/* CNMI Staff Planner V381
   Daily position metadata must follow the currently configured Slot set.

   Fixes a mismatch where the daily page could show an old break time/detail saved
   inside daily_positions, while Position Management and the monthly legend already
   showed the latest Slot configuration.

   Scope:
   - Keeps the selected monthly Slot count/order from V379.
   - Keeps the saved staff assignment.
   - Uses zone, break time, main rule, and duty description from the current Slot
     configuration for the selected date.
   - Updates form datasets so the next Admin save writes the current metadata.
   - No SQL/schema change and no automatic database write.
*/
(function(){
  'use strict';

  const VERSION='V381_DAILY_POSITION_SLOT_METADATA_SOURCE';
  if(window.__CNMI_V381_DAILY_POSITION_SLOT_METADATA_SOURCE__)return;
  window.__CNMI_V381_DAILY_POSITION_SLOT_METADATA_SOURCE__=true;

  let queued=false;
  let applying=false;
  let loading=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function page(){return text(S()?.page);}
  function normDate(v){
    try{if(typeof window.normalizeDateKey==='function')return text(window.normalizeDateKey(v)).slice(0,10);}catch(_){ }
    return text(v).slice(0,10);
  }
  function dateValue(){return normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate||'');}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function keyOf(v){return text(v).replace(/\s+/g,'').toLowerCase();}
  function useful(v){const s=text(v);return !!s&&!['-','--','—'].includes(s);}
  function isOutingDate(date){
    try{if(typeof window.hasOutingSafe==='function'&&window.hasOutingSafe(date))return true;}catch(_){ }
    try{if(typeof hasOutingSafe==='function'&&hasOutingSafe(date))return true;}catch(_){ }
    return (S()?.positions||[]).some(row=>normDate(row?.work_date)===date&&(row?.is_outing===true||text(row?.zone)==='ออกหน่วย'||text(row?.eligibility_code).startsWith('OUTING:')));
  }

  function targetForDate(date){
    try{
      const n=Number(window.cnmiV379?.targetForDate?.(date));
      if(Number.isFinite(n)&&n>0)return n;
    }catch(_){ }
    const row=(S()?.manualDaySlotSettingsV273||[]).find(item=>normDate(item?.work_date)===date);
    const n=Number(row?.target_slots);
    return Number.isFinite(n)&&n>0?Math.round(n):null;
  }

  function configs(){
    try{return window.cnmiV224?.currentConfigs?.()||null;}catch(_){return null;}
  }
  function rowsForDate(date){
    const cfg=configs();
    if(!cfg)return[];
    if(isOutingDate(date)){
      const n=targetForDate(date)||14;
      const bucket=n<=12?12:(n<=13?13:14);
      return Array.isArray(cfg?.outing_by_count?.[bucket])?cfg.outing_by_count[bucket]:(Array.isArray(cfg?.outing)?cfg.outing:[]);
    }
    const n=targetForDate(date);
    const rows=n!=null?(cfg?.day?.[n]||cfg?.day?.[String(n)]):null;
    return Array.isArray(rows)?rows:[];
  }
  function masterFor(code){
    const key=keyOf(code);
    for(const list of [S()?.positionMasters,S()?.dailyPositionMasters]){
      if(!Array.isArray(list))continue;
      const found=list.find(row=>keyOf(codeOf(row))===key&&row?.is_active!==false&&!row?.deleted_at);
      if(found)return found;
    }
    return null;
  }
  function templateFor(code,date){
    const key=keyOf(code);
    const configured=rowsForDate(date).find(row=>keyOf(codeOf(row))===key);
    return configured||masterFor(code)||null;
  }
  function metadataFor(row,date){
    const code=codeOf(row);
    const src=templateFor(code,date)||{};
    return {
      code,
      zone: useful(src?.zone)?text(src.zone):text(row?.zone),
      break_time: useful(src?.break_time)?text(src.break_time):text(row?.break_time||'-'),
      main_rule: useful(src?.main_rule||src?.required_role)?text(src.main_rule||src.required_role):text(row?.main_rule||row?.required_role||'-'),
      job_desc: useful(src?.job_desc||src?.description||src?.detail)?text(src.job_desc||src.description||src.detail):text(row?.job_desc||row?.description||'-')
    };
  }

  function dailyArrays(){
    const out=[];
    const add=list=>{if(Array.isArray(list)&&!out.includes(list))out.push(list);};
    add(window.__CNMI_V225_DAILY_POSITION_ROWS__);
    add(window.__CNMI_V226_DAILY_POSITION_ROWS__);
    add(window.__CNMI_V379_DAILY_POSITION_ROWS__);
    return out;
  }
  function syncRows(date){
    let changed=false;
    dailyArrays().forEach(list=>list.forEach(row=>{
      const meta=metadataFor(row,date);
      ['zone','break_time','main_rule','job_desc'].forEach(key=>{
        if(text(row?.[key])!==text(meta[key])){row[key]=meta[key];changed=true;}
      });
    }));
    return changed;
  }

  function updateSelect(select,meta){
    if(!select)return;
    if(text(select.dataset.positionZone)!==meta.zone)select.dataset.positionZone=meta.zone;
    if(text(select.dataset.positionBreak)!==meta.break_time)select.dataset.positionBreak=meta.break_time;
    if(text(select.dataset.positionRule)!==meta.main_rule)select.dataset.positionRule=meta.main_rule;
    if(text(select.dataset.positionJob)!==meta.job_desc)select.dataset.positionJob=meta.job_desc;
  }
  function updateTable(area,rows,date){
    area.querySelectorAll('.v225-daily-position-table tbody tr').forEach((tr,index)=>{
      const row=rows[index]||{};
      const select=tr.querySelector('select[data-position-row]');
      const code=codeOf(row)||text(select?.dataset?.positionCode)||text(tr.children?.[1]?.textContent);
      const meta=metadataFor({...row,position_code:code},date);
      if(tr.children?.[0]&&text(tr.children[0].textContent)!==meta.zone)tr.children[0].textContent=meta.zone;
      if(tr.children?.[2]&&text(tr.children[2].textContent)!==meta.break_time)tr.children[2].textContent=meta.break_time;
      if(tr.children?.[5]&&text(tr.children[5].textContent)!==meta.main_rule)tr.children[5].textContent=meta.main_rule;
      const job=tr.querySelector('.v378-job-text,.v225-job-short,.v219-job-short');
      if(job&&text(job.textContent)!==meta.job_desc)job.textContent=meta.job_desc;
      updateSelect(select,meta);
    });
  }
  function updateCards(area,rows,date){
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card').forEach((card,index)=>{
      const row=rows[index]||{};
      const select=card.querySelector('select[data-position-row]');
      const code=codeOf(row)||text(select?.dataset?.positionCode)||text(card.querySelector('h2,h3,h4')?.textContent);
      const meta=metadataFor({...row,position_code:code},date);
      const metaNode=Array.from(card.children||[]).find(node=>node?.classList?.contains('muted')&&/^พัก/.test(text(node.textContent)));
      const nextMeta=`พัก ${meta.break_time} • ${meta.main_rule}`;
      if(metaNode&&text(metaNode.textContent)!==nextMeta)metaNode.textContent=nextMeta;
      const duty=card.querySelector('.v378-position-duty-card p');
      if(duty&&text(duty.textContent)!==meta.job_desc)duty.textContent=meta.job_desc;
      updateSelect(select,meta);
    });
  }

  function currentRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return[];
  }
  function apply(root=document){
    if(applying||page()!=='positions')return false;
    const date=dateValue();
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page')||document.querySelector('.v225-positions-page,.v226-positions-page');
    if(!date||!area)return false;
    applying=true;
    try{
      syncRows(date);
      const rows=currentRows();
      updateTable(area,rows,date);
      updateCards(area,rows,date);
      area.dataset.v381SlotMetadataSource='configured-slot';
      try{window.cnmiV378?.enhance?.(document);}catch(_){ }
      return true;
    }finally{applying=false;}
  }
  function queue(delay=0){
    if(delay>0){setTimeout(()=>queue(0),delay);return;}
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply(document);});
  }
  async function ensureConfigs(){
    if(loading||typeof window.cnmiV224?.loadDbConfigs!=='function')return;
    loading=true;
    try{await window.cnmiV224.loadDbConfigs(false);}catch(err){console.warn(`[${VERSION}] Slot config load skipped`,err);}
    finally{loading=false;[0,80,250].forEach(queue);}
  }
  function install(){
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v381SlotMetadataObserver){
      const observer=new MutationObserver(()=>queue(0));
      observer.observe(root,{childList:true,subtree:true});
      root.__v381SlotMetadataObserver=observer;
    }
    ensureConfigs();
    [0,100,350,900,1800].forEach(queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',()=>{ensureConfigs();[0,120,600].forEach(queue);});
  document.addEventListener('change',event=>{
    if(event.target?.closest?.('#positionDateInput,select[data-position-row]'))[0,80,250].forEach(queue);
  },true);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-nav="positions"],[data-page="positions"],button,a'))queue(120);
  },true);

  window.cnmiV381={version:VERSION,apply,templateFor,metadataFor,rowsForDate};
  console.info(`[${VERSION}] loaded`);
})();
