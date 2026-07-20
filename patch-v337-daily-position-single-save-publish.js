/* CNMI Staff Planner V337 — Daily position single Save + Publish
   Scope: daily daytime-position page only.
   - Replaces the confusing two-step Save / Publish flow with one button.
   - Synchronizes desktop and mobile dropdown copies before saving.
   - Blocks an accidental all-blank overwrite when the baseline still has staff.
   - Uses the existing V335/V261 authoritative save flow; no new read loop or egress-heavy loader.
*/
(function(){
  'use strict';
  const VERSION='V337_DAILY_POSITION_SINGLE_SAVE_PUBLISH';
  if(window.__CNMI_V337_DAILY_POSITION_SINGLE_SAVE_PUBLISH__)return;
  window.__CNMI_V337_DAILY_POSITION_SINGLE_SAVE_PUBLISH__=true;

  let queued=false;
  let saving=false;

  function S(){try{return window.state||state||null;}catch(_){return window.state||null;}}
  function isDaily(){return String(S()?.page||'')==='positions';}
  function text(value){return String(value==null?'':value).trim();}
  function toast(message,tone){
    try{if(typeof window.showToast==='function')return window.showToast(message,tone?{tone}:undefined);}catch(_){}
    try{window.alert(message);}catch(_){console.info(message);}
  }
  function visible(control){
    if(!control||control.disabled)return false;
    try{
      const style=window.getComputedStyle(control);
      if(style.display==='none'||style.visibility==='hidden')return false;
      if(control.closest('[hidden],.hidden'))return false;
      return control.getClientRects().length>0;
    }catch(_){return true;}
  }
  function identity(select){
    return [
      text(select?.dataset?.positionCode),
      text(select?.dataset?.positionZone),
      text(select?.dataset?.positionBreak),
      text(select?.dataset?.positionRule),
      text(select?.dataset?.positionJob),
      text(select?.dataset?.positionRow)
    ].join('|');
  }
  function controlsByIdentity(root=document){
    const groups=new Map();
    root.querySelectorAll?.('select[data-position-row]')?.forEach(select=>{
      const key=identity(select);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(select);
    });
    return groups;
  }
  function changedAt(control){
    return Math.max(Number(control?.dataset?.v337ChangedAt||0),Number(control?.dataset?.v261ChangedAt||0));
  }
  function chooseControl(list){
    const rows=Array.from(list||[]);
    if(!rows.length)return null;
    const active=rows.find(row=>row===document.activeElement);
    if(active)return active;
    const changed=rows.slice().sort((a,b)=>changedAt(b)-changedAt(a))[0];
    if(changed&&changedAt(changed)>0)return changed;
    return rows.find(visible)||rows.find(row=>text(row.value))||rows[0];
  }
  function syncGroup(list,source){
    const chosen=source||chooseControl(list);
    if(!chosen)return '';
    const value=String(chosen.value||'');
    const stamp=String(Date.now());
    Array.from(list||[]).forEach(control=>{
      const exists=Array.from(control.options||[]).some(option=>String(option.value)===value);
      if(exists||value==='')control.value=value;
      control.dataset.v337ChangedAt=stamp;
      control.dataset.v261ChangedAt=stamp;
    });
    return value;
  }
  function synchronizeDailySelections(){
    const page=document.querySelector('#pageContent .v225-positions-page,#pageContent .v226-positions-page')||document;
    const groups=controlsByIdentity(page);
    const snapshot=[];
    groups.forEach((list,key)=>snapshot.push({key,value:syncGroup(list)}));
    return snapshot;
  }
  function baselineAssignedCount(){
    const rows=window.__CNMI_V226_DAILY_POSITION_ROWS__||window.__CNMI_V225_DAILY_POSITION_ROWS__||[];
    return Array.isArray(rows)?rows.filter(row=>text(row?._planned_staff_id||row?.staff_id)).length:0;
  }
  function assignedCount(snapshot){return (snapshot||[]).filter(row=>text(row.value)).length;}

  function enhance(){
    if(!isDaily())return;
    const page=document.querySelector('#pageContent .v225-positions-page,#pageContent .v226-positions-page');
    if(!page)return;
    const toolbar=page.querySelector('.v225-position-toolbar,.toolbar');
    if(toolbar){
      const oldSave=toolbar.querySelector('[data-save-positions]');
      const oldPublish=toolbar.querySelector('[data-publish-positions]');
      let single=toolbar.querySelector('[data-v337-save-publish]');
      if(!single){
        single=document.createElement('button');
        single.type='button';
        single.className='primary-btn v337-save-publish-btn';
        single.setAttribute('data-v337-save-publish','');
        single.textContent='บันทึกและประกาศให้ Staff เห็น';
        if(oldSave)oldSave.replaceWith(single);
        else if(oldPublish)oldPublish.insertAdjacentElement('beforebegin',single);
        else toolbar.appendChild(single);
      }
      oldSave?.remove();
      oldPublish?.remove();
    }
    const note=page.querySelector('.v225-position-note');
    if(note)note.innerHTML='<b>วิธีใช้:</b> เลือกหรือปรับคนในแต่ละตำแหน่ง แล้วกด “บันทึกและประกาศให้ Staff เห็น” เพียงครั้งเดียว ระบบจะบันทึกและเผยแพร่พร้อมกัน';
    const heading=page.querySelector('.v322-daily-change-summary h3');
    if(heading)heading.textContent='ตรวจสอบก่อนบันทึก: แผนตั้งต้นเทียบกับวันนี้';
    page.dataset.v337SingleSavePublish='1';
  }
  function queueEnhance(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance();});
  }

  document.addEventListener('change',event=>{
    const source=event.target?.closest?.('select[data-position-row]');
    if(!source||!isDaily())return;
    source.dataset.v337ChangedAt=String(Date.now());
    const page=source.closest('.v225-positions-page,.v226-positions-page')||document;
    const group=controlsByIdentity(page).get(identity(source));
    if(group)syncGroup(group,source);
    try{window.cnmiV322?.queueEnhance?.();}catch(_){}
  },true);

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-v337-save-publish]');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
    if(saving){toast('ระบบกำลังบันทึกและประกาศ กรุณารอสักครู่');return;}
    (async()=>{
      const snapshot=synchronizeDailySelections();
      const baseline=baselineAssignedCount();
      const assigned=assignedCount(snapshot);
      if(baseline>0&&assigned===0){
        toast('ระบบหยุดการบันทึก เพราะพบว่ารายชื่อทุกตำแหน่งกลายเป็นว่าง กรุณารีเฟรชหน้าแล้วลองใหม่','error');
        return;
      }
      const publish=window.publishPositionsForDay||(typeof publishPositionsForDay==='function'?publishPositionsForDay:null);
      if(typeof publish!=='function'){
        toast('ไม่พบคำสั่งบันทึกตำแหน่ง กรุณารีเฟรชหน้า','error');
        return;
      }
      saving=true;
      button.disabled=true;
      button.setAttribute('aria-busy','true');
      try{
        await publish();
      }catch(error){
        console.error(`${VERSION}: save/publish failed`,error);
        toast(`บันทึกไม่สำเร็จ: ${error?.message||error}`,'error');
      }finally{
        saving=false;
        queueEnhance();
      }
    })();
  },true);

  function install(){
    const root=document.getElementById('pageContent');
    if(root&&!root.__v337Observer){
      const observer=new MutationObserver(queueEnhance);
      observer.observe(root,{childList:true,subtree:true});
      root.__v337Observer=observer;
    }
    queueEnhance();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  window.cnmiV337={version:VERSION,enhance,synchronizeDailySelections};
  console.info(`${VERSION} loaded`);
})();
