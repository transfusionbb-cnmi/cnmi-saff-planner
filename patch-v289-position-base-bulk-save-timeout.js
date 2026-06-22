/* CNMI Staff Planner V289
   Reliable Supabase save for Position Management.
   - Replaces the long sequential V224/V226/V260 save chain with bulk requests.
   - Adds a timeout to every Supabase request so the page cannot wait forever.
   - Verifies the records by reading them back before showing success.
   - Saves the visible primary Slot count together with "save all".
   - Does not modify daily_position_eligibility or any personal permission.
   No SQL or schema change is required when the V182/V214 table and policies already exist.
*/
(function(){
  'use strict';
  const VERSION='V289_POSITION_BASE_BULK_SAVE_TIMEOUT';
  if(window.__CNMI_V289_POSITION_BASE_BULK_SAVE_TIMEOUT__)return;
  window.__CNMI_V289_POSITION_BASE_BULK_SAVE_TIMEOUT__=true;

  const CFG_PREFIX='__CNMI_SLOT_TEMPLATE_V224__';
  const BASE_COUNT_KEY='__CNMI_SLOT_BASE_COUNT_V231__';
  const DAY_SETS=[8,9,10,11,12,13,14];
  const OUTING_SETS=[12,13,14];
  const REQUEST_TIMEOUT_MS=18000;
  let saving=false;
  let operationNo=0;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function DB(){try{return sb||window.sb||null;}catch(_){return window.sb||null;}}
  function isAdminSafe(){
    try{return !!isAdmin();}
    catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function userId(){
    try{return currentStaffId();}
    catch(_){return S()?.profile?.id||null;}
  }
  function toast(message,tone){
    try{showToast(message,tone?{tone}:undefined);}
    catch(_){console.info(message);}
  }
  function friendly(error){
    try{return friendlyDbError(error);}
    catch(_){return error?.message||error?.details||error?.hint||String(error||'เกิดข้อผิดพลาด');}
  }
  function clone(value){
    try{return structuredClone(value);}
    catch(_){try{return JSON.parse(JSON.stringify(value));}catch(__){return value;}}
  }
  function cleanCode(value){return String(value||'').replace(/^OUTING:/i,'').trim();}
  function isConfigCode(code){return String(code||'').startsWith(`${CFG_PREFIX}:`)||String(code||'')===BASE_COUNT_KEY;}
  function isOutingRow(row){return row?.is_outing===true||String(row?.eligibility_code||'').startsWith('OUTING:');}
  function rowKey(row){return `${cleanCode(row?.code)}|${isOutingRow(row)?'1':'0'}`;}
  function timeoutError(label){
    const error=new Error(`${label} ใช้เวลานานเกิน ${Math.round(REQUEST_TIMEOUT_MS/1000)} วินาที ระบบยกเลิกการรอแล้ว กรุณาตรวจอินเทอร์เน็ตหรือสิทธิ์ Supabase`);
    error.code='CNMI_SAVE_TIMEOUT';
    return error;
  }
  async function runQuery(label,query,timeoutMs=REQUEST_TIMEOUT_MS){
    let timer;
    try{
      const result=await Promise.race([
        Promise.resolve(query),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError(label)),timeoutMs);})
      ]);
      if(result?.error)throw result.error;
      return result;
    }finally{if(timer)clearTimeout(timer);}
  }
  function setStatus(text,tone='working'){
    const el=document.getElementById('syncStatus');
    if(!el)return;
    if(!el.dataset.v289Original)el.dataset.v289Original=el.textContent||'พร้อมใช้งาน';
    el.textContent=text||el.dataset.v289Original;
    el.dataset.v289Tone=tone;
  }
  function setButtonsBusy(busy,label){
    document.querySelectorAll('[data-v260-save-slot-base],[data-v224-save-all],[data-v226-save-all],[data-v224-save-current],[data-v226-save-current],[data-v231-save-base-slot]').forEach(button=>{
      button.disabled=!!busy;
      button.setAttribute('aria-busy',busy?'true':'false');
    });
    if(busy)setStatus(label||'กำลังบันทึก…');
  }
  function rawCurrentConfigs(){
    const st=S();
    try{
      return clone(
        window.cnmiV224?.currentConfigs?.()
        ||window.cnmiV227?.currentConfigs226?.()
        ||window.cnmiV226?.currentConfigs226?.()
        ||st?.slotTemplateV224?.configs
        ||{day:{},outing:[],outing_by_count:{}}
      );
    }catch(_){return clone(st?.slotTemplateV224?.configs||{day:{},outing:[],outing_by_count:{}});}
  }
  function normalizedConfigs(){
    const raw=rawCurrentConfigs();
    try{return window.cnmiV260?.normalizeConfig?window.cnmiV260.normalizeConfig(raw):raw;}
    catch(error){console.warn(`${VERSION}: V260 normalize skipped`,error);return raw;}
  }
  function normalizeRows(rows,outing){
    return (Array.isArray(rows)?rows:[]).map((row,index)=>{
      const code=cleanCode(row?.code||row?.position_code||row?.eligibility_code);
      if(!code)return null;
      const rawZone=String(row?.zone||'').trim();
      const zone=rawZone||(outing?'ออกหน่วย':(/^DR-/i.test(code)?'Donor Room':'Blood Bank'));
      return {
        code,
        eligibility_code:outing?`OUTING:${code}`:(String(row?.eligibility_code||'').replace(/^OUTING:/i,'').trim()||code),
        zone,
        break_time:String(row?.break_time||'').trim()||(outing?'ออกหน่วย':'-'),
        main_rule:String(row?.main_rule||'').trim()||null,
        job_desc:String(row?.job_desc||row?.detail||'').trim()||null,
        is_outing:!!outing,
        is_active:true,
        sort_order:Number(row?.sort_order||row?.order||index+1)||(index+1),
        deleted_at:null,
        updated_by:userId()
      };
    }).filter(Boolean);
  }
  function configEntries(cfg){
    const entries=[];
    DAY_SETS.forEach(count=>entries.push({
      code:`${CFG_PREFIX}:DAY:${count}`,
      rows:normalizeRows(cfg?.day?.[count]||cfg?.day?.[String(count)]||[],false)
    }));
    const outing14=normalizeRows(cfg?.outing_by_count?.[14]||cfg?.outing_by_count?.['14']||cfg?.outing||[],true);
    entries.push({code:`${CFG_PREFIX}:OUTING`,rows:outing14});
    OUTING_SETS.forEach(count=>entries.push({
      code:`${CFG_PREFIX}:OUTING:${count}`,
      rows:normalizeRows(cfg?.outing_by_count?.[count]||cfg?.outing_by_count?.[String(count)]||(count===14?outing14:[])||[],true)
    }));
    return entries;
  }
  function validateConfigEntries(entries){
    const problems=[];
    (entries||[]).forEach(entry=>{
      const day=String(entry?.code||'').match(/:DAY:(\d+)$/);
      const outing=String(entry?.code||'').match(/:OUTING:(\d+)$/);
      const expected=day?Number(day[1]):outing?Number(outing[1]):String(entry?.code||'').endsWith(':OUTING')?14:0;
      const actual=Array.isArray(entry?.rows)?entry.rows.length:0;
      if(expected&&actual!==expected)problems.push(`${entry.code} มี ${actual}/${expected} Slot`);
    });
    if(problems.length)throw new Error(`ข้อมูลชุด Slot ยังไม่ครบ จึงหยุดก่อนบันทึกเพื่อป้องกันฐานข้อมูลเสีย: ${problems.join(' · ')}`);
    return true;
  }
  function configPayload(entry){
    return {
      code:entry.code,
      eligibility_code:null,
      zone:'SYSTEM',
      break_time:'-',
      main_rule:'SLOT_TEMPLATE_CONFIG',
      job_desc:JSON.stringify(entry.rows||[]),
      is_outing:false,
      is_active:false,
      sort_order:99000,
      deleted_at:null,
      updated_by:userId()
    };
  }
  function baseCount(){
    const fromApi=Number(window.cnmiV231?.getBaseSlotCount231?.());
    const fromInput=Number(document.getElementById('slotBaseCountV231')?.value);
    const fromState=Number(S()?.baseSlotCountV231);
    const value=[fromInput,fromApi,fromState,14].find(n=>Number.isFinite(n)&&n>=8&&n<=14);
    return Math.max(8,Math.min(14,Math.round(value||14)));
  }
  function baseCountPayload(){
    const value=baseCount();
    return {
      code:BASE_COUNT_KEY,
      eligibility_code:null,
      zone:'SYSTEM',
      break_time:'-',
      main_rule:'MAIN_DAY_SLOT_COUNT',
      job_desc:JSON.stringify({base_slot_count:value,updated_at:new Date().toISOString()}),
      is_outing:false,
      is_active:false,
      sort_order:99010,
      deleted_at:null,
      updated_by:userId()
    };
  }
  function activeMasterPayloads(cfg){
    const dayMap=new Map();
    [14,13,12,11,10,9,8].forEach(count=>{
      normalizeRows(cfg?.day?.[count]||cfg?.day?.[String(count)]||[],false).forEach(row=>{
        if(row.code&&!dayMap.has(row.code))dayMap.set(row.code,row);
      });
    });
    const outingRows=normalizeRows(cfg?.outing_by_count?.[14]||cfg?.outing_by_count?.['14']||cfg?.outing||[],true);
    const outingMap=new Map();
    outingRows.forEach(row=>{if(row.code&&!outingMap.has(row.code))outingMap.set(row.code,row);});
    return [...dayMap.values(),...outingMap.values()];
  }
  function selectedKind(){
    return String(
      document.getElementById('slotTemplateKindV226')?.value
      ||document.querySelector('[data-v226-kind]')?.value
      ||S()?.slotTemplateV224?.kind
      ||'day'
    ).toLowerCase()==='outing'?'outing':'day';
  }
  function selectedCount(){
    const value=Number(
      document.getElementById('slotTemplateSetV226')?.value
      ||document.querySelector('[data-v226-set]')?.value
      ||S()?.slotTemplateV224?.setNo
      ||14
    );
    return Math.max(8,Math.min(14,Math.round(Number.isFinite(value)?value:14)));
  }
  function selectedConfigPayloads(cfg){
    const kind=selectedKind();
    const count=selectedCount();
    if(kind==='outing'){
      const bucket=count<=12?12:(count<=13?13:14);
      const rows=normalizeRows(cfg?.outing_by_count?.[bucket]||cfg?.outing_by_count?.[String(bucket)]||cfg?.outing||[],true);
      const payloads=[configPayload({code:`${CFG_PREFIX}:OUTING:${bucket}`,rows})];
      if(bucket===14)payloads.push(configPayload({code:`${CFG_PREFIX}:OUTING`,rows}));
      return {payloads,label:`ชุดออกหน่วย ${bucket} คน`,expected:[`${CFG_PREFIX}:OUTING:${bucket}`,...(bucket===14?[`${CFG_PREFIX}:OUTING`]:[])]};
    }
    const rows=normalizeRows(cfg?.day?.[count]||cfg?.day?.[String(count)]||[],false);
    return {payloads:[configPayload({code:`${CFG_PREFIX}:DAY:${count}`,rows})],label:`ชุดวันทำงานปกติ ${count} คน`,expected:[`${CFG_PREFIX}:DAY:${count}`]};
  }
  async function readExisting(){
    const db=DB();
    return runQuery('อ่านฐานตำแหน่งเดิม',db.from('daily_position_masters').select('id,code,eligibility_code,is_outing,is_active,deleted_at'));
  }
  async function bulkUpsert(payloads,label){
    if(!payloads.length)throw new Error('ไม่มีข้อมูล Slot สำหรับบันทึก');
    const db=DB();
    return runQuery(label,db.from('daily_position_masters').upsert(payloads,{onConflict:'code,is_outing'}));
  }
  async function deactivateObsolete(existing,expectedKeys){
    const ids=(existing||[]).filter(row=>{
      if(isConfigCode(row?.code)||row?.is_active===false)return false;
      return !expectedKeys.has(rowKey(row));
    }).map(row=>row.id).filter(Boolean);
    if(!ids.length)return 0;
    const db=DB();
    await runQuery('ปิดตำแหน่งเก่าที่ไม่ได้ใช้งาน',db.from('daily_position_masters').update({
      is_active:false,
      deleted_at:new Date().toISOString(),
      updated_by:userId()
    }).in('id',ids));
    return ids.length;
  }
  async function verifyAll(expectedConfigCodes,expectedMasterKeys){
    const db=DB();
    const result=await runQuery('ตรวจสอบข้อมูลที่บันทึกกลับจาก Supabase',db.from('daily_position_masters').select('*'));
    const rows=result.data||[];
    const missingConfigs=expectedConfigCodes.filter(code=>!rows.some(row=>String(row?.code||'')===code&&row?.is_outing===false));
    const activeKeys=new Set(rows.filter(row=>!isConfigCode(row?.code)&&row?.is_active!==false&&!row?.deleted_at).map(rowKey));
    const missingMasters=[...expectedMasterKeys].filter(key=>!activeKeys.has(key));
    const unexpected=[...activeKeys].filter(key=>!expectedMasterKeys.has(key));
    if(missingConfigs.length||missingMasters.length||unexpected.length){
      const parts=[];
      if(missingConfigs.length)parts.push(`ชุด Slot ขาด ${missingConfigs.length} ชุด`);
      if(missingMasters.length)parts.push(`ตำแหน่งใช้งานขาด ${missingMasters.length} รายการ`);
      if(unexpected.length)parts.push(`ยังมีตำแหน่งเก่าเปิดใช้งาน ${unexpected.length} รายการ`);
      throw new Error(`Supabase ตอบกลับไม่ครบ: ${parts.join(' · ')}`);
    }
    const st=S();
    if(st){
      st.positionMasters=rows;
      st.positionMastersLoaded=true;
      st.positionMasterLoadError='';
      st.baseSlotCountV231=baseCount();
      st.baseSlotCountLoadedV231=true;
    }
    return rows;
  }
  async function verifySelected(expectedCodes){
    const db=DB();
    const result=await runQuery('ตรวจสอบชุด Slot ที่บันทึก',db.from('daily_position_masters').select('code,is_outing,job_desc').in('code',expectedCodes));
    const rows=result.data||[];
    const missing=expectedCodes.filter(code=>!rows.some(row=>String(row?.code||'')===code&&row?.is_outing===false));
    if(missing.length)throw new Error(`อ่านข้อมูลกลับไม่พบ ${missing.join(', ')}`);
    return rows;
  }
  function applyLocal(cfg){
    try{window.cnmiV260?.applySlotConfig?.(cfg);}catch(error){console.warn(`${VERSION}: apply V260 skipped`,error);}
    try{window.cnmiV224?.applyConfigsToRuntime?.();}catch(_){}
    try{localStorage.setItem('cnmi_slot_template_v224_cache',JSON.stringify(cfg));}catch(_){}
  }
  async function confirmSave(message,title){
    try{
      return typeof confirmDialog==='function'?await confirmDialog(message,title):window.confirm(message);
    }catch(_){return window.confirm(message);}
  }
  async function saveAll(){
    if(!isAdminSafe())return toast('เฉพาะ Admin เท่านั้น','error');
    if(saving)return toast('ระบบกำลังบันทึกอยู่ กรุณารอผลรายการเดิม');
    const accepted=await confirmSave('บันทึกชุด Slot 8-14 คน ชุดออกหน่วย 12-14 คน จำนวน Slot หลัก และฐานตำแหน่งที่ใช้งานจริงลง Supabase หรือไม่? การบันทึกนี้จะไม่แตะสิทธิ์เฉพาะบุคคล','ยืนยันบันทึกฐานตำแหน่ง');
    if(!accepted)return;

    const myOperation=++operationNo;
    saving=true;
    setButtonsBusy(true,'กำลังเตรียมข้อมูล Slot…');
    try{
      const db=DB();
      if(!db)throw new Error('ไม่พบ Supabase client');
      const cfg=normalizedConfigs();
      const configs=configEntries(cfg);
      validateConfigEntries(configs);
      const masters=activeMasterPayloads(cfg);
      if(!masters.length)throw new Error('ไม่พบรายการตำแหน่งใช้งาน จึงยังไม่บันทึกเพื่อป้องกันฐานข้อมูลว่าง');
      const configPayloads=configs.map(configPayload);
      const expectedConfigCodes=[...configs.map(x=>x.code),BASE_COUNT_KEY];
      const expectedMasterKeys=new Set(masters.map(rowKey));

      setStatus('กำลังอ่านฐานตำแหน่งเดิม…');
      const existing=(await readExisting()).data||[];

      setStatus(`กำลังบันทึก ${configPayloads.length} ชุด และ ${masters.length} ตำแหน่ง…`);
      await bulkUpsert([...configPayloads,baseCountPayload(),...masters],'บันทึกฐานตำแหน่งแบบกลุ่ม');

      setStatus('กำลังปิดตำแหน่งเก่าที่ไม่อยู่ในชุดปัจจุบัน…');
      await deactivateObsolete(existing,expectedMasterKeys);

      setStatus('กำลังตรวจสอบข้อมูลจาก Supabase…');
      await verifyAll(expectedConfigCodes,expectedMasterKeys);
      if(myOperation!==operationNo)return;

      applyLocal(cfg);
      toast(`บันทึกสำเร็จและตรวจสอบกลับแล้ว: ${configPayloads.length} ชุด Slot · ${masters.length} ตำแหน่ง · Slot หลัก ${baseCount()} คน`);
      setStatus('บันทึก Supabase สำเร็จ','success');
      setTimeout(()=>{if(myOperation===operationNo)setStatus('พร้อมใช้งาน','ready');},2500);
    }catch(error){
      console.error(`${VERSION}: save all failed`,error);
      toast('บันทึกฐานตำแหน่งไม่สำเร็จ: '+friendly(error),'error');
      setStatus('บันทึกไม่สำเร็จ','error');
      setTimeout(()=>{if(myOperation===operationNo)setStatus('พร้อมใช้งาน','ready');},3500);
    }finally{
      if(myOperation===operationNo){saving=false;setButtonsBusy(false);}
    }
  }
  async function saveCurrent(){
    if(!isAdminSafe())return toast('เฉพาะ Admin เท่านั้น','error');
    if(saving)return toast('ระบบกำลังบันทึกอยู่ กรุณารอผลรายการเดิม');
    const myOperation=++operationNo;
    saving=true;
    setButtonsBusy(true,'กำลังบันทึกชุดที่เลือก…');
    try{
      const db=DB();
      if(!db)throw new Error('ไม่พบ Supabase client');
      const cfg=normalizedConfigs();
      const selected=selectedConfigPayloads(cfg);
      await bulkUpsert(selected.payloads,`บันทึก${selected.label}`);
      await verifySelected(selected.expected);
      if(myOperation!==operationNo)return;
      applyLocal(cfg);
      toast(`บันทึก ${selected.label} ลง Supabase และตรวจสอบกลับแล้ว`);
      setStatus('บันทึก Supabase สำเร็จ','success');
      setTimeout(()=>{if(myOperation===operationNo)setStatus('พร้อมใช้งาน','ready');},2200);
    }catch(error){
      console.error(`${VERSION}: save current failed`,error);
      toast('บันทึกชุดนี้ไม่สำเร็จ: '+friendly(error),'error');
      setStatus('บันทึกไม่สำเร็จ','error');
      setTimeout(()=>{if(myOperation===operationNo)setStatus('พร้อมใช้งาน','ready');},3500);
    }finally{
      if(myOperation===operationNo){saving=false;setButtonsBusy(false);}
    }
  }
  async function saveBaseOnly(){
    if(!isAdminSafe())return toast('เฉพาะ Admin เท่านั้น','error');
    if(saving)return toast('ระบบกำลังบันทึกอยู่ กรุณารอผลรายการเดิม');
    const myOperation=++operationNo;
    saving=true;
    setButtonsBusy(true,'กำลังบันทึกจำนวน Slot หลัก…');
    try{
      const db=DB();
      if(!db)throw new Error('ไม่พบ Supabase client');
      await bulkUpsert([baseCountPayload()],'บันทึกจำนวน Slot หลัก');
      await verifySelected([BASE_COUNT_KEY]);
      const st=S();
      if(st){st.baseSlotCountV231=baseCount();st.baseSlotCountLoadedV231=true;}
      toast(`บันทึกจำนวน Slot หลัก ${baseCount()} คนลง Supabase และตรวจสอบกลับแล้ว`);
      setStatus('บันทึก Supabase สำเร็จ','success');
      setTimeout(()=>{if(myOperation===operationNo)setStatus('พร้อมใช้งาน','ready');},2200);
    }catch(error){
      console.error(`${VERSION}: save base count failed`,error);
      toast('บันทึกจำนวน Slot หลักไม่สำเร็จ: '+friendly(error),'error');
      setStatus('บันทึกไม่สำเร็จ','error');
      setTimeout(()=>{if(myOperation===operationNo)setStatus('พร้อมใช้งาน','ready');},3500);
    }finally{
      if(myOperation===operationNo){saving=false;setButtonsBusy(false);}
    }
  }

  /* Window capture runs before the older document-capture listeners in V224/V226/V231/V260. */
  window.addEventListener('click',event=>{
    const all=event.target?.closest?.('[data-v260-save-slot-base],[data-v224-save-all],[data-v226-save-all]');
    const current=event.target?.closest?.('[data-v224-save-current],[data-v226-save-current]');
    const base=event.target?.closest?.('[data-v231-save-base-slot]');
    if(!all&&!current&&!base)return;
    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
    if(all){saveAll();return;}
    if(current){saveCurrent();return;}
    if(base)saveBaseOnly();
  },true);

  try{
    window.cnmiV260=window.cnmiV260||{};
    window.cnmiV260.saveAllSlotConfigsAsCurrentBase=saveAll;
    window.cnmiV289={saveAll,saveCurrent,saveBaseOnly,runQuery,normalizedConfigs,activeMasterPayloads};
  }catch(_){}

  const style=document.createElement('style');
  style.id='v289-position-save-status-style';
  style.textContent=`
    #syncStatus[data-v289-tone="working"]{color:#92400e;background:#fef3c7;border-color:#fcd34d}
    #syncStatus[data-v289-tone="success"]{color:#166534;background:#dcfce7;border-color:#86efac}
    #syncStatus[data-v289-tone="error"]{color:#991b1b;background:#fee2e2;border-color:#fca5a5}
    [aria-busy="true"]{cursor:wait!important;opacity:.68!important}
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
