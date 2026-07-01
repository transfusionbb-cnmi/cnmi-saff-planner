/* CNMI Staff Planner V290
   Monthly daytime-position background save without page rerender.
   - Intercepts Admin position dropdown/drop changes before the legacy V275 handler.
   - Saves through Supabase JS (Fetch/AJAX) without form postback or renderPage().
   - Keeps horizontal/vertical table scroll and the browser viewport unchanged.
   - Updates the affected cells, counters, summaries, and local state in place.
   - Serializes saves per date and adds a request timeout to avoid endless waiting.
   No SQL or schema change is required.
*/
(function(){
  'use strict';
  const VERSION='V290_POSITION_MONTH_AJAX_NO_RERENDER';
  if(window.__CNMI_V290_POSITION_MONTH_AJAX_NO_RERENDER__)return;
  window.__CNMI_V290_POSITION_MONTH_AJAX_NO_RERENDER__=true;

  const REQUEST_TIMEOUT_MS=18000;
  const SAVE_DEBOUNCE_MS=120;
  const cellControllers=new Map();
  const mentorControllers=new Map();
  const dateChains=new Map();

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function DB(){try{return sb||window.sb||null;}catch(_){return window.sb||null;}}
  function normId(value){return String(value==null?'':value);}
  function normDate(value){
    try{return normalizeDateKey(value);}
    catch(_){return String(value||'').slice(0,10);}
  }
  function currentStaff(){
    try{return currentStaffId();}
    catch(_){return S()?.profile?.id||null;}
  }
  function isAdminSafe(){
    try{return !!isAdmin();}
    catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isTargetPage(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}
  function friendly(error){
    try{return friendlyDbError(error);}
    catch(_){return error?.message||error?.details||error?.hint||String(error||'เกิดข้อผิดพลาด');}
  }
  function toast(message,tone){
    try{showToast(message,tone?{tone}:undefined);}
    catch(_){console.info(message);}
  }
  function escapeSafe(value){
    try{return escapeHtml(value==null?'':String(value));}
    catch(_){return String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  }
  function cssEscape(value){
    try{return CSS.escape(String(value??''));}
    catch(_){return String(value??'').replace(/["\\]/g,'\\$&');}
  }
  function timeoutError(label){
    const error=new Error(`${label} ใช้เวลานานเกิน ${Math.round(REQUEST_TIMEOUT_MS/1000)} วินาที กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่`);
    error.code='CNMI_V290_TIMEOUT';
    return error;
  }
  async function runQuery(label,query){
    let timer;
    try{
      const result=await Promise.race([
        Promise.resolve(query),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError(label)),REQUEST_TIMEOUT_MS);})
      ]);
      if(result?.error)throw result.error;
      return result;
    }finally{if(timer)clearTimeout(timer);}
  }
  function positionCode(row){return String(row?.code||row?.position_code||'').trim();}
  function isOutingDateSafe(date){
    const key=normDate(date);
    try{return !!hasOuting(key);}
    catch(_){return (S()?.activities||[]).some(a=>String(a?.event_type||'').trim()==='ออกหน่วย'&&normDate(a?.start_date)<=key&&normDate(a?.end_date||a?.start_date)>=key);}
  }
  function isOutingMaster(row){
    const zone=String(row?.zone||'').trim().toLowerCase();
    return row?.is_outing===true||zone.includes('ออกหน่วย')||String(row?.eligibility_code||'').startsWith('OUTING:');
  }
  function positionMaster(code,date=''){
    const wanted=String(code||'');
    if(date){
      try{
        const configured=window.cnmiV278?.templateRowsForDate?.(normDate(date))?.find(row=>positionCode(row)===wanted);
        if(configured)return configured;
      }catch(_){}
    }
    const candidates=(S()?.positionMasters||[]).filter(row=>positionCode(row)===wanted);
    if(!candidates.length)return null;
    if(date){
      const outing=isOutingDateSafe(date);
      const matched=candidates.find(row=>isOutingMaster(row)===outing);
      if(matched)return matched;
    }
    return candidates.find(row=>!isOutingMaster(row))||candidates[0];
  }
  function positionRow(date,staffId){
    return (S()?.positions||[]).find(row=>normDate(row?.work_date)===date&&normId(row?.staff_id)===normId(staffId))||null;
  }
  function controllerKey(date,staffId){return `${date}|${normId(staffId)}`;}
  function controllerFor(cell,select){
    const date=normDate(cell?.dataset?.date);
    const staffId=normId(cell?.dataset?.staffId);
    const key=controllerKey(date,staffId);
    let controller=cellControllers.get(key);
    if(!controller){
      controller={key,date,staffId,seq:0,timer:null,committedCode:String(positionRow(date,staffId)?.position_code||select?.value||''),desiredCode:String(select?.value||''),cell,select};
      cellControllers.set(key,controller);
    }else{
      controller.cell=cell;
      controller.select=select;
      if(controller.committedCode==null)controller.committedCode=String(positionRow(date,staffId)?.position_code||'');
    }
    return controller;
  }
  function markStatus(cell,text,stateName){
    const status=cell?.querySelector?.('[data-v275-status]');
    if(status)status.textContent=text||'';
    if(cell){
      if(stateName)cell.dataset.v290SaveState=stateName;
      else delete cell.dataset.v290SaveState;
    }
  }
  function syncInfoButton(cell,code){
    if(!cell)return;
    let button=cell.querySelector('[data-v275-job]');
    if(!code){button?.remove();return;}
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='v275-info';
      button.textContent='i';
      const select=cell.querySelector('[data-v275-position-select]');
      select?.insertAdjacentElement('afterend',button);
    }
    button.dataset.v275Job=code;
  }
  function setCellValue(date,staffId,code,message){
    const cell=document.querySelector(`[data-v275-position-cell][data-date="${cssEscape(date)}"][data-staff-id="${cssEscape(staffId)}"]`);
    if(!cell)return;
    const select=cell.querySelector('[data-v275-position-select]');
    if(select)select.value=String(code||'');
    syncInfoButton(cell,String(code||''));
    const controller=controllerFor(cell,select);
    controller.committedCode=String(code||'');
    controller.desiredCode=String(code||'');
    if(message){
      markStatus(cell,message,'saved');
      setTimeout(()=>{if(cell.isConnected&&cell.dataset.v290SaveState==='saved')markStatus(cell,'','');},1300);
    }
  }
  function updateLocalState(date,staffId,code,savedRow){
    const st=S();
    if(!st)return {displacedStaffIds:[],currentYearDelta:0,displacedYearDelta:{}};
    const existing=Array.isArray(st.positions)?st.positions:[];
    const currentHadRow=existing.some(row=>normDate(row?.work_date)===date&&normId(row?.staff_id)===normId(staffId)&&String(row?.position_code||'').trim());
    const displacedStaffIds=[];
    existing.forEach(row=>{
      if(normDate(row?.work_date)!==date)return;
      if(code&&String(row?.position_code||'')===code&&normId(row?.staff_id)!==normId(staffId))displacedStaffIds.push(normId(row.staff_id));
    });
    st.positions=existing.filter(row=>{
      if(normDate(row?.work_date)!==date)return true;
      if(normId(row?.staff_id)===normId(staffId))return false;
      if(code&&String(row?.position_code||'')===code)return false;
      return true;
    });
    if(savedRow)st.positions.push(savedRow);
    const uniqueDisplaced=[...new Set(displacedStaffIds)];
    return {
      displacedStaffIds:uniqueDisplaced,
      currentYearDelta:(code?1:0)-(currentHadRow?1:0),
      displacedYearDelta:Object.fromEntries(uniqueDisplaced.map(id=>[id,-1]))
    };
  }
  function updateDateCount(date){
    const selects=[...document.querySelectorAll(`.v275-position-wrap [data-v275-position-cell][data-date="${cssEscape(date)}"] [data-v275-position-select]`)];
    const actual=new Set(selects.filter(select=>String(select.value||'').trim()).map(select=>normId(select.closest('[data-v275-position-cell]')?.dataset?.staffId)).filter(Boolean)).size;
    const input=document.querySelector(`.v275-position-wrap [data-v275-slot][data-date="${cssEscape(date)}"]`);
    const label=input?.closest('.v275-slot-control')?.querySelector('b');
    if(label)label.textContent=`${actual}/`;
  }
  function staffName(staffId){
    const person=(S()?.staff||[]).find(row=>normId(row?.id)===normId(staffId));
    return String(person?.nickname||person?.full_name||person?.email||'');
  }
  function zoneBucket(row){
    const date=normDate(row?.work_date),master=positionMaster(row?.position_code,date)||{},code=String(row?.position_code||'').trim().toUpperCase(),zone=String(row?.zone||master.zone||'').trim().toLowerCase();
    if(isOutingDateSafe(date)&&(zone.includes('ออกหน่วย')||row?.is_outing===true))return'outing';
    if(code.startsWith('BB-'))return'bb';
    if(code.startsWith('DR-'))return'donor';
    if(zone.includes('donor')||zone.includes('บริจาค'))return'donor';
    return'bb';
  }
  function summaryFor(staffId,monthKey){
    const rows=Array.isArray(S()?.positions)?S().positions:[];
    const own=rows.filter(row=>normId(row?.staff_id)===normId(staffId)&&normDate(row?.work_date).startsWith(monthKey));
    const result={total:own.length,bb:0,donor:0,outing:0,counts:{}};
    own.forEach(row=>{result[zoneBucket(row)]+=1;const code=String(row?.position_code||'-');result.counts[code]=(result.counts[code]||0)+1;});
    result.top=Object.entries(result.counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([code,count])=>`${code} ${count}`).join(' · ');
    return result;
  }
  function displayedYearTotal(staffId){
    const button=document.querySelector(`[data-v275-position-summary="${cssEscape(staffId)}"]`);
    const match=String(button?.querySelector('span')?.textContent||'').match(/ปีงบ\s*(\d+)/);
    if(match)return Number(match[1]);
    const name=staffName(staffId);
    let value=null;
    document.querySelectorAll('.v275-admin-position-stats tbody tr').forEach(row=>{
      if(value!=null||String(row.querySelector('td:first-child b')?.textContent||'').trim()!==name.trim())return;
      const cells=row.querySelectorAll('td');
      const parsed=Number(cells[6]?.textContent);
      if(Number.isFinite(parsed))value=parsed;
    });
    return Number.isFinite(value)?value:0;
  }
  function updateStaffSummary(staffId,date,yearDelta=0){
    if(!staffId)return;
    const monthKey=date.slice(0,7),summary=summaryFor(staffId,monthKey);
    const yearTotal=Math.max(0,displayedYearTotal(staffId)+Number(yearDelta||0));
    const button=document.querySelector(`[data-v275-position-summary="${cssEscape(staffId)}"]`);
    if(button){
      button.innerHTML=`<b>BB ${summary.bb} · Donor ${summary.donor}</b><span>ออกหน่วย ${summary.outing} · ปีงบ ${yearTotal}</span><small>${escapeSafe(summary.top||'ยังไม่มีตำแหน่ง')}</small>`;
    }
    const name=staffName(staffId);
    if(name){
      document.querySelectorAll('.v275-admin-position-stats tbody tr').forEach(row=>{
        if(String(row.querySelector('td:first-child b')?.textContent||'').trim()!==name.trim())return;
        const cells=row.querySelectorAll('td');
        if(cells[1])cells[1].textContent=String(summary.total);
        if(cells[2])cells[2].textContent=String(summary.bb);
        if(cells[3])cells[3].textContent=String(summary.donor);
        if(cells[4])cells[4].textContent=String(summary.outing);
        if(cells[5])cells[5].textContent=summary.top||'-';
        if(cells[6])cells[6].textContent=String(yearTotal);
      });
    }
  }
  function enqueueDate(date,task){
    const previous=dateChains.get(date)||Promise.resolve();
    const next=previous.catch(()=>{}).then(task);
    const tracked=next.finally(()=>{if(dateChains.get(date)===tracked)dateChains.delete(date);});
    dateChains.set(date,tracked);
    return next;
  }
  async function persistPosition(controller,requestedCode,operationSeq){
    const {date,staffId}=controller;
    const db=DB();
    if(!db)throw new Error('ไม่พบ Supabase client');
    const code=String(requestedCode||'').trim();
    const cell=controller.cell;
    markStatus(cell,'กำลังบันทึก…','saving');

    await runQuery('ลบตำแหน่งเดิมของเจ้าหน้าที่',db.from('daily_positions').delete().eq('work_date',date).eq('staff_id',staffId));
    if(code){
      await runQuery('ตรวจสอบตำแหน่งซ้ำในวันเดียวกัน',db.from('daily_positions').delete().eq('work_date',date).eq('position_code',code));
    }

    let savedRow=null;
    if(code){
      const master=positionMaster(code,date)||{};
      const payload={
        work_date:date,
        position_code:code,
        zone:master.zone||'',
        break_time:master.break_time||'-',
        main_rule:master.main_rule||'',
        job_desc:master.job_desc||'',
        staff_id:staffId,
        updated_by:currentStaff()
      };
      const inserted=await runQuery('บันทึกตำแหน่งที่เลือก',db.from('daily_positions').insert(payload).select('*').single());
      savedRow=inserted.data||payload;
    }
    await runQuery('บันทึกสถานะร่างของวัน',db.from('daily_position_day_status').upsert({work_date:date,month_key:date.slice(0,7),status:'draft',updated_by:currentStaff()},{onConflict:'work_date'}));

    const {displacedStaffIds,currentYearDelta,displacedYearDelta}=updateLocalState(date,staffId,code,savedRow);
    controller.committedCode=code;
    displacedStaffIds.forEach(id=>setCellValue(date,id,'','ตำแหน่งถูกย้าย'));
    updateDateCount(date);
    updateStaffSummary(staffId,date,currentYearDelta);
    displacedStaffIds.forEach(id=>updateStaffSummary(id,date,displacedYearDelta[id]||0));

    if(controller.seq===operationSeq){
      const liveCell=document.querySelector(`[data-v275-position-cell][data-date="${cssEscape(date)}"][data-staff-id="${cssEscape(staffId)}"]`)||cell;
      const liveSelect=liveCell?.querySelector?.('[data-v275-position-select]');
      if(liveSelect)liveSelect.value=code;
      syncInfoButton(liveCell,code);
      markStatus(liveCell,'บันทึกแล้ว','saved');
      setTimeout(()=>{if(liveCell?.isConnected&&liveCell.dataset.v290SaveState==='saved')markStatus(liveCell,'','');},1300);
    }
    return savedRow;
  }
  function schedulePositionSave(cell,select,code){
    if(!cell||!select)return;
    const controller=controllerFor(cell,select);
    controller.seq+=1;
    controller.desiredCode=String(code||'');
    controller.cell=cell;
    controller.select=select;
    const operationSeq=controller.seq;
    clearTimeout(controller.timer);
    markStatus(cell,'รอบันทึก…','queued');
    controller.timer=setTimeout(()=>{
      controller.timer=null;
      enqueueDate(controller.date,()=>persistPosition(controller,controller.desiredCode,operationSeq)).catch(error=>{
        console.error(`${VERSION}: background save failed`,error);
        if(controller.seq===operationSeq){
          const liveCell=document.querySelector(`[data-v275-position-cell][data-date="${cssEscape(controller.date)}"][data-staff-id="${cssEscape(controller.staffId)}"]`)||controller.cell;
          const liveSelect=liveCell?.querySelector?.('[data-v275-position-select]');
          if(liveSelect)liveSelect.value=controller.committedCode||'';
          syncInfoButton(liveCell,controller.committedCode||'');
          markStatus(liveCell,'บันทึกไม่สำเร็จ','error');
        }
        toast(`บันทึกตำแหน่งไม่สำเร็จ: ${friendly(error)}`,'error');
      });
    },SAVE_DEBOUNCE_MS);
  }
  function captureCommitted(select){
    const cell=select?.closest?.('[data-v275-position-cell]');
    if(!cell)return;
    const controller=controllerFor(cell,select);
    if(!controller.timer&&controller.seq===0)controller.committedCode=String(positionRow(controller.date,controller.staffId)?.position_code||select.value||'');
  }
  function trainingIdentity(row){
    if(row?.trainee_staff_id)return `staff:${normId(row.trainee_staff_id)}`;
    return `name:${String(row?.trainee_name||'').trim().toLowerCase()}`;
  }
  function mentorFor(identity,date){
    return (S()?.trainingAssignmentsV271||[]).find(row=>trainingIdentity(row)===identity&&row?.active!==false&&normDate(row?.start_date)<=date&&normDate(row?.end_date)>=date)?.mentor_staff_id||'';
  }
  function mentorControllerFor(cell,select){
    const date=normDate(cell?.dataset?.date),identity=String(cell?.dataset?.identity||''),key=`${identity}|${date}`;
    let controller=mentorControllers.get(key);
    if(!controller){
      controller={key,date,identity,seq:0,timer:null,committedId:normId(mentorFor(identity,date)||select?.value||''),desiredId:normId(select?.value||''),cell,select};
      mentorControllers.set(key,controller);
    }else{controller.cell=cell;controller.select=select;}
    return controller;
  }
  function updateMentorCell(cell,mentorId){
    if(!cell)return;
    const date=normDate(cell.dataset?.date);
    const mentorPosition=mentorId?positionRow(date,mentorId):null;
    const label=cell.querySelector('span');
    if(label)label.textContent=mentorId?(mentorPosition?.position_code||'กรุณาเลือกพี่เลี้ยงแทน'):'เลือกพี่เลี้ยงแทนตำแหน่ง';
    cell.closest('td')?.classList.toggle('bad',!!mentorId&&!mentorPosition);
  }
  function updateTraineeSummary(cell){
    const row=cell?.closest('tr');
    const summary=row?.querySelector('.v275-trainee-summary');
    if(!summary)return;
    const identity=String(cell.dataset?.identity||'');
    const month=normDate(cell.dataset?.date).slice(0,7);
    const monthEnd=(()=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);})();
    const names=new Set();
    (S()?.trainingAssignmentsV271||[]).forEach(item=>{
      if(trainingIdentity(item)!==identity||item?.active===false)return;
      if(normDate(item?.end_date)<`${month}-01`||normDate(item?.start_date)>monthEnd)return;
      if(item?.mentor_staff_id)names.add(staffName(item.mentor_staff_id));
    });
    const span=summary.querySelector('span');
    if(span)span.textContent=names.size?`พี่เลี้ยง: ${Array.from(names).join(', ')}`:'ยังไม่กำหนดพี่เลี้ยง';
  }
  async function persistMentor(controller,mentorId,operationSeq){
    const cell=controller.cell,date=controller.date,identity=controller.identity;
    if(!window.cnmiV272?.replaceRange)throw new Error('ไม่พบระบบบันทึกพี่เลี้ยง');
    markStatus(cell,'กำลังบันทึก…','saving');
    const args={
      traineeType:String(cell?.dataset?.type||'intern'),
      startDate:date,
      endDate:date,
      mentorStaffId:mentorId||null,
      note:'กำหนดจากตารางตำแหน่งกลางวัน V290'
    };
    if(identity.startsWith('staff:'))args.traineeStaffId=String(cell?.dataset?.traineeStaffId||identity.slice(6));
    else args.traineeName=String(cell?.dataset?.label||'');
    await runQuery('บันทึกพี่เลี้ยง',window.cnmiV272.replaceRange(args));
    if(window.cnmiV271?.loadTrainingAssignments)await runQuery('อ่านข้อมูลพี่เลี้ยงล่าสุด',window.cnmiV271.loadTrainingAssignments({force:true}));
    controller.committedId=normId(mentorId);
    updateMentorCell(cell,mentorId);
    updateTraineeSummary(cell);
    if(controller.seq===operationSeq){
      const select=cell?.querySelector?.('[data-v275-mentor-select]');
      if(select)select.value=normId(mentorId);
      markStatus(cell,'บันทึกแล้ว','saved');
      setTimeout(()=>{if(cell?.isConnected&&cell.dataset.v290SaveState==='saved')markStatus(cell,'','');},1300);
    }
  }
  function scheduleMentorSave(cell,select,mentorId){
    const controller=mentorControllerFor(cell,select);
    controller.seq+=1;
    controller.desiredId=normId(mentorId);
    const operationSeq=controller.seq;
    clearTimeout(controller.timer);
    markStatus(cell,'รอบันทึก…','queued');
    controller.timer=setTimeout(()=>{
      controller.timer=null;
      enqueueDate(`mentor:${controller.key}`,()=>persistMentor(controller,controller.desiredId,operationSeq)).catch(error=>{
        console.error(`${VERSION}: mentor background save failed`,error);
        if(controller.seq===operationSeq){
          select.value=controller.committedId||'';
          updateMentorCell(cell,controller.committedId||'');
          markStatus(cell,'บันทึกไม่สำเร็จ','error');
        }
        toast(`บันทึกพี่เลี้ยงไม่สำเร็จ: ${friendly(error)}`,'error');
      });
    },SAVE_DEBOUNCE_MS);
  }
  function captureMentorCommitted(select){
    const cell=select?.closest?.('[data-v275-mentor-cell]');
    if(!cell)return;
    const controller=mentorControllerFor(cell,select);
    if(!controller.timer&&controller.seq===0)controller.committedId=normId(mentorFor(controller.identity,controller.date)||select.value||'');
  }
  function interceptPositionChange(event){
    if(!isTargetPage())return false;
    const positionSelect=event.target?.closest?.('.v275-position-wrap [data-v275-position-select]');
    const mentorSelect=event.target?.closest?.('.v275-position-wrap [data-v275-mentor-select]');
    if(!positionSelect&&!mentorSelect)return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if(positionSelect){
      const cell=positionSelect.closest('[data-v275-position-cell]');
      if(cell)schedulePositionSave(cell,positionSelect,positionSelect.value);
    }else{
      const cell=mentorSelect.closest('[data-v275-mentor-cell]');
      if(cell)scheduleMentorSave(cell,mentorSelect,mentorSelect.value);
    }
    return true;
  }
  function interceptPositionDrop(event){
    if(!isTargetPage())return false;
    const cell=event.target?.closest?.('.v275-position-wrap [data-v275-position-cell]');
    if(!cell)return false;
    const code=String(event.dataTransfer?.getData('v275Position')||'').trim();
    if(!code)return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    cell.classList.remove('drag-over');
    const select=cell.querySelector('[data-v275-position-select]');
    if(!select)return true;
    captureCommitted(select);
    select.value=code;
    schedulePositionSave(cell,select,code);
    return true;
  }

  /* Window capture runs before the legacy document-capture V275 listeners. */
  window.addEventListener('pointerdown',event=>{
    if(!isTargetPage())return;
    const positionSelect=event.target?.closest?.('.v275-position-wrap [data-v275-position-select]');
    const mentorSelect=event.target?.closest?.('.v275-position-wrap [data-v275-mentor-select]');
    if(positionSelect)captureCommitted(positionSelect);
    if(mentorSelect)captureMentorCommitted(mentorSelect);
  },true);
  window.addEventListener('focusin',event=>{
    if(!isTargetPage())return;
    const positionSelect=event.target?.closest?.('.v275-position-wrap [data-v275-position-select]');
    const mentorSelect=event.target?.closest?.('.v275-position-wrap [data-v275-mentor-select]');
    if(positionSelect)captureCommitted(positionSelect);
    if(mentorSelect)captureMentorCommitted(mentorSelect);
  },true);
  window.addEventListener('change',interceptPositionChange,true);
  window.addEventListener('drop',interceptPositionDrop,true);

  /* Safety net: a future form wrapper around this table must never create a browser postback. */
  window.addEventListener('submit',event=>{
    if(!isTargetPage())return;
    const form=event.target;
    if(!form?.querySelector?.('.v275-position-wrap'))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  },true);

  const style=document.createElement('style');
  style.id='v290-position-month-ajax-style';
  style.textContent=`
    .v275-position-cell[data-v290-save-state="queued"] select,.v275-mentor-cell[data-v290-save-state="queued"] select{border-color:#60a5fa}
    .v275-position-cell[data-v290-save-state="saving"] select,.v275-mentor-cell[data-v290-save-state="saving"] select{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.12)}
    .v275-position-cell[data-v290-save-state="saved"] select,.v275-mentor-cell[data-v290-save-state="saved"] select{border-color:#16a34a}
    .v275-position-cell[data-v290-save-state="error"] select,.v275-mentor-cell[data-v290-save-state="error"] select{border-color:#dc2626}
  `;
  document.head.appendChild(style);

  window.cnmiV290={savePositionInBackground:(cell,code)=>{const select=cell?.querySelector?.('[data-v275-position-select]');if(select){select.value=String(code||'');schedulePositionSave(cell,select,code);}},version:VERSION};
  console.info(`${VERSION} loaded`);
})();
