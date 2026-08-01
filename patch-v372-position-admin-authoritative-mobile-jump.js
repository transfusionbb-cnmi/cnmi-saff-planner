/* CNMI Staff Planner V372 (corrected from V371)
   Scope:
   - Daily daytime positions: Admin is the only editor. Incharge/Staff see the saved Admin plan.
   - Daily Slot auto increase/decrease control is removed. Monthly Slot target inputs remain unchanged.
   - Prevents untouched Admin selections from being saved as blank.
   - Fills missing break time / role rule / job description.
   - On mobile monthly tables, tapping a position info/pill jumps to and opens its description below.
   - Removes only redundant explanatory blocks from position pages.
   No SQL/schema change.
*/
(function(){
  'use strict';
  const VERSION='V372_POSITION_ADMIN_AUTHORITATIVE_MOBILE_JUMP_CORRECTED';
  if(window.__CNMI_V372_POSITION_ADMIN_AUTHORITATIVE_MOBILE_JUMP_CORRECTED__)return;
  window.__CNMI_V372_POSITION_ADMIN_AUTHORITATIVE_MOBILE_JUMP_CORRECTED__=true;

  let queued=false;
  let lastJumpAt=0;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function page(){return txt(S()?.page);}
  function normDate(v){
    try{if(typeof window.normalizeDateKey==='function')return txt(window.normalizeDateKey(v)).slice(0,10);}catch(_){}
    return txt(v).slice(0,10);
  }
  function admin(){
    try{if(typeof window.isAdmin==='function')return !!window.isAdmin();}catch(_){}
    try{if(typeof isAdmin==='function')return !!isAdmin();}catch(_){}
    return txt(S()?.currentRole||S()?.role||S()?.profile?.role).toLowerCase()==='admin';
  }
  function assignGlobal(name,value){
    try{window[name]=value;}catch(_){}
    try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){}
  }
  function isMissing(v){
    const s=txt(v);
    return !s||s==='-'||s==='--'||s==='—'||/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);
  }
  function codeKey(v){return txt(v).replace(/\s+/g,' ').replace(/(\D)(\d+)$/,'$1 $2').trim();}
  function normCode(v){return codeKey(v).toLowerCase().replace(/\s+/g,'');}
  function staffName(id){
    const p=(S()?.staff||[]).find(x=>txt(x?.id)===txt(id))||{};
    return txt(p.nickname||p.full_name||p.email||id||'-');
  }
  function leaveText(staffId,date){
    if(!staffId||!date)return'';
    try{
      const row=typeof window.activeLeaveRecordOn==='function'?window.activeLeaveRecordOn(staffId,date):
        (typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null);
      if(!row)return'';
      if(typeof window.leaveDisplayType==='function')return txt(window.leaveDisplayType(row));
      if(typeof leaveDisplayType==='function')return txt(leaveDisplayType(row));
      return txt(row.type||row.leave_type||'ลา');
    }catch(_){return'';}
  }

  const DETAIL={
    report:'รับผิดชอบการออกผลตรวจ Routine, คล้องเลือด (Cross-match), พิมพ์รายงาน A4 และตรวจสอบงานที่เกี่ยวข้องให้ครบถ้วน',
    approve:'รับผิดชอบการอนุมัติผลในระบบ LIS, รับเลือดเข้า Stock, จ่ายเลือดทั้งกรณีปกติและเร่งด่วน และปลดเลือดตามขั้นตอน',
    manual12:'ตรวจผู้บริจาคโลหิตด้วยเครื่อง IH-500, ตรวจ Ab ID และรับผิดชอบงาน Manual ตามที่ได้รับมอบหมาย',
    manual34:'ปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, วัดค่า pH, วัดเม็ดเลือดขาว, QC ถุงเลือด, รูดสาย และงาน Manual ที่เกี่ยวข้อง',
    bbSupport:'รับแล็บ, เดินส่งเลือด, รับโทรศัพท์ประสานงาน, รับเลือดจากสภากาชาด และบันทึกอุณหภูมิห้อง BB/Manual',
    register:'ลงทะเบียนผู้บริจาค, คัดกรอง Vital signs และบันทึกอุณหภูมิห้อง Donor',
    finger1:'ซักประวัติผู้บริจาคในห้องสัมภาษณ์ 1 และเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    finger2:'ซักประวัติผู้บริจาคในห้องสัมภาษณ์ 2 และเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    main:'เจาะเลือดผู้บริจาค ดูแลผู้บริจาค และจัดการเคส Reaction ตามแนวทางของหน่วยงาน',
    drSupport:'ช่วยงานห้องบริจาคโลหิตตามหน้างาน เตรียมอุปกรณ์ ดูแลพื้นที่ รับ-ส่งสิ่งของ และสนับสนุนจุดบริการที่จำเป็น',
    processing:'นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, ประสานงาน QC ถุงเลือด และดูแลขั้นตอนหลังการเจาะ',
    preparing:'เตรียม Set อุปกรณ์เจาะเลือด เติมน้ำดื่ม/ขนม และดูแลความเรียบร้อยของเตียงบริจาค'
  };

  function fallback(code){
    const c=codeKey(code),n=normCode(c);
    if(/^bb-report/.test(n))return{zone:'Blood Bank',break_time:'11:00',main_rule:'MT เท่านั้น',job_desc:DETAIL.report};
    if(/^bb-approve/.test(n))return{zone:'Blood Bank',break_time:'12:00',main_rule:'MT เท่านั้น',job_desc:DETAIL.approve};
    if(/^bb-manual/.test(n)){
      const m=c.match(/(\d+)\s*$/),no=m?Number(m[1]):0;
      return{zone:'Blood Bank',break_time:no>=3?'12:00':'11:00',main_rule:'MT เท่านั้น',job_desc:no>=3?DETAIL.manual34:DETAIL.manual12};
    }
    if(/^bb-support/.test(n))return{zone:'Blood Bank',break_time:'11:00',main_rule:'Clerk หรือ แตง',job_desc:DETAIL.bbSupport};
    if(/^dr-register/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'Clerk หรือ แตง',job_desc:DETAIL.register};
    if(/^dr-finger\+?interview/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT หรือ แตง',job_desc:/2\s*$/.test(c)?DETAIL.finger2:DETAIL.finger1};
    if(/^dr-main/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT หรือ แตง',job_desc:DETAIL.main};
    if(/^dr-support/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT, Clerk หรือ แตง',job_desc:DETAIL.drSupport};
    if(/^dr-processing/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT เท่านั้น',job_desc:DETAIL.processing};
    if(/^dr-preparing/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'Clerk หรือ แตง',job_desc:DETAIL.preparing};
    if(/^bb-/.test(n))return{zone:'Blood Bank',break_time:'12:00',main_rule:'MT เท่านั้น',job_desc:`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c}`};
    if(/^dr-/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT หรือ แตง',job_desc:`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c}`};
    return{zone:'-',break_time:'12:00',main_rule:'ตามที่ได้รับมอบหมาย',job_desc:`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c||'นี้'}`};
  }
  function enrich(row,code){
    const src={...(row||{})};
    const c=codeKey(code||src.code||src.position_code);
    const fb=fallback(c);
    src.code=src.code||c;
    src.position_code=src.position_code||c;
    if(isMissing(src.zone))src.zone=fb.zone;
    if(isMissing(src.break_time))src.break_time=fb.break_time;
    if(isMissing(src.main_rule||src.required_role))src.main_rule=fb.main_rule;
    if(isMissing(src.job_desc||src.description))src.job_desc=fb.job_desc;
    return src;
  }

  function wrapPositionFunctions(){
    ['positionByCode','positionTemplateByCode'].forEach(name=>{
      const old=window[name]||(typeof globalThis[name]==='function'?globalThis[name]:null);
      if(typeof old!=='function'||old.__v372CorrectedEnriched)return;
      const next=function(){return enrich(old.apply(this,arguments)||{},arguments[0]);};
      next.__v372CorrectedEnriched=true;
      next.__v372Previous=old;
      assignGlobal(name,next);
    });
  }
  function makeAdminOnlyDaily(){
    const old=window.canManagePositions||(typeof canManagePositions==='function'?canManagePositions:null);
    if(typeof old!=='function'||old.__v372CorrectedAdminOnly)return;
    const next=function(){return admin();};
    next.__v372CorrectedAdminOnly=true;
    next.__v372Previous=old;
    assignGlobal('canManagePositions',next);
  }

  function dailyRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return[];
  }
  function plannedId(row){return txt(row?._planned_staff_id||row?.staff_id);}
  function savedRowsForDate(date){
    return(S()?.positions||[]).filter(row=>normDate(row?.work_date)===date&&codeKey(row?.position_code||row?.code));
  }

  /* The daily page must show the exact Admin-saved monthly/daily plan, not a Slot set recalculated from attendance. */
  function lockDailyToSavedPlan(root=document){
    if(page()!=='positions')return;
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    const date=normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate);
    if(!date)return;
    const saved=savedRowsForDate(date);
    if(!saved.length)return;
    const savedByCode=new Map(saved.map(row=>[normCode(row.position_code||row.code),enrich(row)]));
    const current=dailyRows();
    const kept=[],keepIndexes=[];
    current.forEach((row,index)=>{
      const authoritative=savedByCode.get(normCode(row?.position_code||row?.code));
      if(!authoritative)return;
      kept.push(enrich({...row,...authoritative,_planned_staff_id:authoritative.staff_id||null,_source:'slot'},authoritative.position_code||authoritative.code));
      keepIndexes.push(index);
    });
    if(!kept.length)return;
    window.__CNMI_V225_DAILY_POSITION_ROWS__=kept;
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))window.__CNMI_V226_DAILY_POSITION_ROWS__=kept;

    const keep=new Set(keepIndexes);
    const tableRows=Array.from(area.querySelectorAll('.v225-daily-position-table tbody tr'));
    const cards=Array.from(area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
    tableRows.forEach((row,index)=>{if(!keep.has(index))row.remove();});
    cards.forEach((card,index)=>{if(!keep.has(index))card.remove();});

    const remainingTable=Array.from(area.querySelectorAll('.v225-daily-position-table tbody tr'));
    const remainingCards=Array.from(area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
    [...remainingTable,...remainingCards].forEach((holder,index)=>{
      const localIndex=index>=remainingTable.length?index-remainingTable.length:index;
      holder.querySelectorAll('[data-position-row]').forEach(select=>{select.dataset.positionRow=String(localIndex);});
      holder.querySelectorAll('[data-v225-position-detail],[data-v226-position-detail],[data-v296-position-detail],[data-position-detail-v219]').forEach(button=>{
        ['v225PositionDetail','v226PositionDetail','v296PositionDetail','positionDetailV219'].forEach(key=>{if(key in button.dataset)button.dataset[key]=String(localIndex);});
      });
    });
    area.querySelectorAll('.v225-extra-plan-row').forEach(node=>node.classList.remove('v225-extra-plan-row'));
  }

  function enrichState(){
    const st=S();
    ['positionMasters','dailyPositionMasters'].forEach(key=>{if(Array.isArray(st?.[key]))st[key].forEach(row=>Object.assign(row,enrich(row)));});
    if(Array.isArray(st?.positions))st.positions.forEach(row=>Object.assign(row,enrich(row)));
    dailyRows().forEach(row=>Object.assign(row,enrich(row)));
  }
  function optionExists(select,value){return Array.from(select?.options||[]).some(o=>txt(o.value)===txt(value));}
  function setSelectValue(select,value){
    if(!select||!value)return;
    if(!optionExists(select,value)){
      const option=document.createElement('option');option.value=value;option.textContent=staffName(value);select.appendChild(option);
    }
    select.value=value;
  }

  /* Untouched Admin dropdowns keep the saved person, so Save cannot wipe the day to blank. */
  function fillAdminDefaults(root=document){
    if(!admin()||page()!=='positions')return;
    const rows=dailyRows();
    root.querySelectorAll?.('select[data-position-row]')?.forEach(select=>{
      const idx=Number(select.dataset.positionRow);
      const row=rows[Number.isFinite(idx)?idx:0]||{};
      const pid=plannedId(row);
      if(!txt(select.value)&&pid&&select.dataset.v372Touched!=='1')setSelectValue(select,pid);
      const detail=enrich(row,select.dataset.positionCode);
      select.dataset.positionZone=detail.zone;
      select.dataset.positionBreak=detail.break_time;
      select.dataset.positionRule=detail.main_rule;
      select.dataset.positionJob=detail.job_desc;
    });
    try{window.cnmiV322?.queueEnhance?.();}catch(_){}
  }

  function updateDailyDetails(root=document){
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    const rows=dailyRows();
    rows.forEach(row=>Object.assign(row,enrich(row)));
    area.querySelectorAll('.v225-daily-position-table tbody tr').forEach((tr,index)=>{
      const select=tr.querySelector('select[data-position-row]');
      const code=select?.dataset?.positionCode||txt(tr.children?.[1]?.textContent);
      const detail=enrich(rows[index]||{},code);
      if(tr.children?.[2])tr.children[2].textContent=detail.break_time;
      if(tr.children?.[5]&&(isMissing(tr.children[5].textContent)||tr.children[5].textContent!==detail.main_rule))tr.children[5].textContent=detail.main_rule;
      const short=tr.querySelector('.v225-job-short,.v219-job-short');
      if(short)short.textContent=detail.job_desc.length>90?`${detail.job_desc.slice(0,90)}…`:detail.job_desc;
    });
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card').forEach((card,index)=>{
      const code=txt(card.querySelector('h2,h3,h4')?.textContent)||rows[index]?.position_code;
      const detail=enrich(rows[index]||{},code);
      const meta=Array.from(card.children||[]).find(node=>node?.classList?.contains('muted')&&/^พัก/.test(txt(node.textContent)));
      if(meta)meta.textContent=`พัก ${detail.break_time} • ${detail.main_rule}`;
      const select=card.querySelector('select[data-position-row]');
      if(select){
        select.dataset.positionZone=detail.zone;
        select.dataset.positionBreak=detail.break_time;
        select.dataset.positionRule=detail.main_rule;
        select.dataset.positionJob=detail.job_desc;
      }
    });
  }

  function makeDailyReadOnly(root=document){
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    if(admin()){
      area.dataset.v372Readonly='0';
      fillAdminDefaults(area);
      return;
    }
    area.dataset.v372Readonly='1';
    area.querySelectorAll('[data-save-positions],[data-publish-positions],[data-v337-save-publish]').forEach(node=>node.remove());
    area.querySelectorAll('select[data-position-row]').forEach(select=>{select.disabled=true;select.tabIndex=-1;});
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card > label,.v225-mobile-position-list > .v225-position-card > label,.v322-change-status').forEach(node=>node.remove());
    area.querySelectorAll('.v322-baseline-label').forEach(node=>{node.textContent='ผู้รับผิดชอบ';});
    area.querySelectorAll('.v225-daily-position-table thead th').forEach((th,index)=>{if(index===3)th.textContent='ผู้รับผิดชอบ';});
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card').forEach((card,index)=>{
      const planned=Array.from(card.children||[]).find(node=>/แผนตั้งต้น/.test(txt(node.textContent)));
      if(planned){
        planned.innerHTML=planned.innerHTML.replace('แผนตั้งต้น:','ผู้รับผิดชอบ:');
        const row=dailyRows()[index]||{};
        const leave=leaveText(plannedId(row),normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate));
        if(leave&&!planned.querySelector('.v372-leave-note'))planned.insertAdjacentHTML('beforeend',`<div class="v372-leave-note">${leave}</div>`);
      }
    });
  }

  /* Daily only. Monthly inputs [data-v275-slot] are intentionally untouched. */
  function removeDailySlotAdjustment(root=document){
    if(page()!=='positions')return;
    root.querySelectorAll?.('.v225-daily-slot-toolbar,[data-v225-daily-slot-set]')?.forEach(node=>{
      const holder=node.closest?.('.v225-daily-slot-toolbar');(holder||node).remove();
    });
    root.querySelectorAll?.('.v225-daily-compare-panel')?.forEach(node=>node.remove());
  }
  function compactPositionPages(root=document){
    if(page()==='positions'){
      root.querySelectorAll?.('.v225-position-note,.v322-daily-change-summary')?.forEach(node=>node.remove());
      root.querySelectorAll?.('.notice.compact')?.forEach(node=>{
        if(/ปรับชุด Slot วันนี้|ระบบเลือกจากคนเหลือจริง|วิธีใช้/.test(txt(node.textContent)))node.remove();
      });
    }
    if(['positionMonth','positionMonthView'].includes(page())){
      root.querySelectorAll?.('.v297-position-description-card .section-title p,.v275-page>.card .section-title p.hint')?.forEach(node=>node.remove());
    }
  }

  function markDescriptionTable(root=document){
    root.querySelectorAll?.('[data-v297-position-descriptions] tbody tr')?.forEach(row=>{
      const code=codeKey(row.children?.[0]?.textContent);
      if(!code)return;
      const detail=enrich({},code);
      if(row.children?.[2]&&isMissing(row.children[2].textContent))row.children[2].textContent=detail.zone;
      if(row.children?.[3]&&isMissing(row.children[3].textContent))row.children[3].textContent=detail.break_time;
      if(row.children?.[4]&&isMissing(row.children[4].textContent))row.children[4].textContent=detail.main_rule;
      if(row.children?.[5]&&isMissing(row.children[5].textContent))row.children[5].textContent=detail.job_desc;
      row.dataset.v372DescriptionCode=normCode(code);
      row.setAttribute('tabindex','-1');
    });
  }
  function markMobileDescriptionCards(root=document){
    root.querySelectorAll?.('.v305-position-description-item')?.forEach(item=>{
      const code=codeKey(item.querySelector('.v305-position-code')?.textContent);
      if(!code)return;
      const detail=enrich({},code);
      item.dataset.v372DescriptionCode=normCode(code);
      const body=item.querySelector('.v305-position-description-body');
      const blocks=Array.from(body?.children||[]);
      const values=[detail.zone,detail.break_time,detail.main_rule,detail.job_desc];
      blocks.forEach((block,index)=>{
        const target=block.querySelector('b,p');
        if(target&&isMissing(target.textContent))target.textContent=values[index]||'-';
      });
    });
  }
  function mobile(){return window.matchMedia?.('(max-width: 900px), (pointer: coarse)')?.matches||window.innerWidth<=900;}
  function monthlyPositionButton(target){
    if(!mobile()||!['positionMonth','positionMonthView'].includes(page()))return null;
    if(target?.nodeType===3)target=target.parentElement;
    return target?.closest?.('[data-v275-job],[data-v273-job-code]')||null;
  }
  function descriptionTarget(code){
    markDescriptionTable(document);markMobileDescriptionCards(document);
    const key=normCode(code);
    const mobileItem=Array.from(document.querySelectorAll('.v305-position-description-item')).find(item=>item.dataset.v372DescriptionCode===key);
    if(mobileItem)return mobileItem;
    return Array.from(document.querySelectorAll('[data-v297-position-descriptions] tbody tr')).find(row=>row.dataset.v372DescriptionCode===key)||null;
  }
  function jumpToDescription(target,event){
    const button=monthlyPositionButton(target);
    if(!button)return false;
    const code=button.getAttribute('data-v275-job')||button.getAttribute('data-v273-job-code')||txt(button.textContent);
    const destination=descriptionTarget(code);
    if(!destination)return false;
    try{event?.preventDefault();event?.stopPropagation();event?.stopImmediatePropagation?.();}catch(_){}
    const now=Date.now();if(now-lastJumpAt<350)return true;lastJumpAt=now;
    if(destination.tagName==='DETAILS')destination.open=true;
    destination.classList.remove('v372-description-hit');
    destination.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
    requestAnimationFrame(()=>destination.classList.add('v372-description-hit'));
    setTimeout(()=>destination.classList.remove('v372-description-hit'),2200);
    return true;
  }

  function enhance(root=document){
    if(!['positions','positionMonth','positionMonthView'].includes(page()))return;
    wrapPositionFunctions();
    makeAdminOnlyDaily();
    enrichState();
    if(page()==='positions'){
      lockDailyToSavedPlan(root);
      updateDailyDetails(root);
      fillAdminDefaults(root);
      makeDailyReadOnly(root);
      removeDailySlotAdjustment(root);
    }
    compactPositionPages(root);
    markDescriptionTable(root);
    markMobileDescriptionCards(root);
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});}

  document.addEventListener('change',event=>{
    const select=event.target?.closest?.('select[data-position-row]');
    if(select){
      const row=txt(select.dataset.positionRow);
      document.querySelectorAll(`select[data-position-row="${CSS.escape(row)}"]`).forEach(twin=>{twin.dataset.v372Touched='1';});
      queue();
    }
  },true);

  /* Window capture runs before older document-capture save and modal handlers. */
  window.addEventListener('click',event=>{
    const save=event.target?.closest?.('[data-v337-save-publish],[data-save-positions],[data-publish-positions]');
    if(save&&page()==='positions')fillAdminDefaults(document);
    jumpToDescription(event.target,event);
  },true);

  const style=document.createElement('style');
  style.id='v372-position-admin-authoritative-style-corrected';
  style.textContent=`
    .v225-daily-slot-toolbar,[data-v225-daily-slot-set],.v225-daily-compare-panel{display:none!important}
    .v372-leave-note{margin-top:5px;color:#b45309;font-weight:800}
    .v225-positions-page[data-v372-readonly="1"] .v225-daily-position-table th:nth-child(5),
    .v225-positions-page[data-v372-readonly="1"] .v225-daily-position-table td:nth-child(5),
    .v226-positions-page[data-v372-readonly="1"] .v225-daily-position-table th:nth-child(5),
    .v226-positions-page[data-v372-readonly="1"] .v225-daily-position-table td:nth-child(5){display:none!important}
    .v225-positions-page[data-v372-readonly="1"] .v322-change-status,
    .v226-positions-page[data-v372-readonly="1"] .v322-change-status,
    .v225-positions-page[data-v372-readonly="1"] label:has(select[data-position-row]),
    .v226-positions-page[data-v372-readonly="1"] label:has(select[data-position-row]){display:none!important}
    [data-v297-position-descriptions] tbody tr.v372-description-hit>td{background:#fff3c4!important;box-shadow:inset 0 0 0 2px #f3b61f;transition:background .2s ease}
    .v305-position-description-item.v372-description-hit{box-shadow:0 0 0 3px #f3b61f,0 8px 20px rgba(15,23,42,.10)!important}
    @media(max-width:900px){[data-v275-job],[data-v273-job-code]{cursor:pointer;touch-action:manipulation}}
  `;
  document.head.appendChild(style);

  const install=()=>{
    wrapPositionFunctions();makeAdminOnlyDaily();
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v372CorrectedObserver){
      const observer=new MutationObserver(queue);observer.observe(root,{childList:true,subtree:true});root.__v372CorrectedObserver=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);

  window.cnmiV372={version:VERSION,enrich,fallback,fillAdminDefaults,enhance,jumpToDescription};
  console.info(`[${VERSION}] loaded`);
})();
