/* CNMI Staff Planner V312
   Targeted app-only repair. No database/schema changes.
   1) Daily daytime-position duty box no longer overlaps the planned-staff box.
   2) Full-month roster duty pills reliably open the sell-duty / HR OT modal in PWA/mobile.
   3) Monthly daytime-position descriptions use the same current Slot configuration as the daily page.
*/
(function(){
  'use strict';

  const VERSION='V312_APP_TARGETED_POSITION_TRADE_FIX';
  if(window.__CNMI_V312_APP_TARGETED_POSITION_TRADE_FIX__) return;
  window.__CNMI_V312_APP_TARGETED_POSITION_TRADE_FIX__=true;

  let queued=false;
  let lastTouchAction='';
  let lastTouchAt=0;
  const pointerStarts=new Map();

  function S(){
    try{return state || window.state || null;}
    catch(_){return window.state || null;}
  }

  function esc(value){
    try{
      const fn=window.escapeHtml || (typeof escapeHtml==='function' ? escapeHtml : null);
      if(typeof fn==='function') return fn(value==null?'':String(value));
    }catch(_){}
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function normDate(value){
    try{
      const fn=window.normalizeDateKey || (typeof normalizeDateKey==='function' ? normalizeDateKey : null);
      if(typeof fn==='function') return String(fn(value)||'').slice(0,10);
    }catch(_){}
    return String(value||'').slice(0,10);
  }

  function stop(event){
    try{event.preventDefault();}catch(_){}
    try{event.stopPropagation();}catch(_){}
    try{event.stopImmediatePropagation?.();}catch(_){}
  }

  function toast(message){
    try{
      const fn=window.showToast || (typeof showToast==='function' ? showToast : null);
      if(typeof fn==='function') return fn(message,{tone:'error'});
    }catch(_){}
    console.error(`[${VERSION}] ${message}`);
  }

  function forceModal(){
    const modal=document.getElementById('modal');
    const body=document.getElementById('modalBody');
    if(!modal || !body || !String(body.innerHTML||'').trim()) return;
    try{
      if(window.__modalCloseTimerV193){
        clearTimeout(window.__modalCloseTimerV193);
        window.__modalCloseTimerV193=null;
      }
    }catch(_){}
    modal.classList.remove('hidden','modal-closing');
    modal.classList.add('modal-ready');
    document.body.classList.add('modal-open');
    const card=modal.querySelector('.modal-card');
    if(card) card.scrollTop=0;
  }

  function currentStaffId(){
    try{
      const fn=window.currentStaffId || (typeof currentStaffId==='function' ? currentStaffId : null);
      if(typeof fn==='function') return String(fn()||'');
    }catch(_){}
    const st=S();
    return String(st?.profile?.staff_id || st?.profile?.id || st?.user?.staff_id || st?.currentStaffId || '');
  }

  function isAdmin(){
    try{
      const fn=window.isAdmin || (typeof isAdmin==='function' ? isAdmin : null);
      if(typeof fn==='function') return !!fn();
    }catch(_){}
    const st=S();
    return String(st?.role || st?.currentRole || '').toLowerCase()==='admin';
  }

  function monthKey(){
    const st=S();
    const input=document.getElementById('scheduleMonthInput');
    return String(input?.value || st?.positionMonthViewKey || st?.positionMonthKey || st?.monthKey || '').slice(0,7);
  }

  function monthDates(key=monthKey()){
    try{
      const fn=window.scheduleMonthDates || (typeof scheduleMonthDates==='function' ? scheduleMonthDates : null);
      const result=typeof fn==='function' ? fn(key) : null;
      if(Array.isArray(result) && result.length) return result.map(normDate);
    }catch(_){}
    if(!/^\d{4}-\d{2}$/.test(key)) return [];
    const [year,month]=key.split('-').map(Number);
    const last=new Date(year,month,0).getDate();
    return Array.from({length:last},(_,index)=>`${key}-${String(index+1).padStart(2,'0')}`);
  }

  function dailyRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__)) return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__)) return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return [];
  }

  function numberFrom(node){
    const match=String(node?.textContent||'').match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function removeObsoleteCh4(root=document){
    root.querySelectorAll?.('.v234-ch4-shared-card,.v209-admin-ch4-card').forEach(node=>node.remove());
    root.querySelectorAll?.('.card').forEach(card=>{
      const heading=String(card.querySelector('h1,h2,h3,h4')?.textContent||'').replace(/\s+/g,' ').trim();
      const text=String(card.textContent||'').replace(/\s+/g,' ').trim();
      if(/^สถานะ\s*ช4\s*\/\s*งานปั่นเลือด(?:\s*รายเดือน)?$/i.test(heading)
        || (/สถานะ\s*ช4\s*\/\s*งานปั่นเลือด/i.test(text) && /SQL\s*V209|SQL\s*V234/i.test(text))){
        card.remove();
      }
    });
  }

  function repairDailySummary(root=document){
    const panel=root.querySelector?.('.v225-daily-compare-panel,.v226-daily-compare-panel');
    if(!panel) return;
    const cards=panel.querySelector('.v225-compare-cards');
    if(!cards) return;

    panel.querySelectorAll('.v308-trainee-note,.v309-trainee-note,.v311-trainee-note,.v312-trainee-note').forEach(node=>node.remove());
    panel.querySelectorAll('.v225-daily-slot-toolbar .hint').forEach(node=>node.remove());

    const text=String(cards.textContent||'');
    if(/คนเข้าร่วมออกหน่วย|Slot ชุดออกหน่วย/.test(text)) return;

    const oldItems=Array.from(cards.children||[]);
    const total=oldItems.length ? numberFrom(oldItems[0].querySelector('b,strong')) : 0;
    const rows=dailyRows();
    const baseRows=rows.filter(row=>row?._source!=='extra-plan');
    const originalPlan=oldItems.length>=5 ? numberFrom(oldItems[2].querySelector('b,strong')) : 0;
    const originalSlots=oldItems.length>=5 ? numberFrom(oldItems[3].querySelector('b,strong')) : 0;
    const slotCount=originalSlots || baseRows.length;
    const filledCount=baseRows.filter(row=>String(row?.staff_id || row?._planned_staff_id || '').trim()).length;
    const counted=Math.min(slotCount,Math.max(originalPlan,filledCount,slotCount||0));
    const diff=counted-slotCount;
    const html=`<div><b>${total}</b><span>คนอยู่จริงทั้งหมด</span></div><div><b>${counted}/${slotCount}</b><span>คน/Slot วันนี้</span></div><div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`}</b><span>สถานะกำลังคน</span></div>`;

    cards.className='v225-compare-cards v312-summary-cards';
    if(cards.innerHTML!==html) cards.innerHTML=html;
  }

  function dutyPreviewHtml(job){
    return `<b>หน้าที่:</b><span>${esc(job)}</span>`;
  }

  function keepDailyDutyText(root=document){
    const page=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!page) return;
    const rows=dailyRows();
    const cards=Array.from(page.querySelectorAll('.position-mobile-card.v225-position-card,.position-mobile-card'));

    cards.forEach((card,index)=>{
      const detailButton=card.querySelector('[data-v296-position-detail],[data-v226-position-detail],[data-v225-position-detail],[data-position-detail-v219]');
      const rawIndex=detailButton?.getAttribute('data-v296-position-detail')
        ?? detailButton?.getAttribute('data-v226-position-detail')
        ?? detailButton?.getAttribute('data-v225-position-detail')
        ?? detailButton?.getAttribute('data-position-detail-v219');
      const row=rows[Number.isFinite(Number(rawIndex)) ? Number(rawIndex) : index] || rows[index] || {};
      const job=String(row?.job_desc || row?.description || '').trim() || 'ยังไม่ได้ระบุรายละเอียดหน้าที่';
      const html=dutyPreviewHtml(job);

      let preview=card.querySelector('.v312-position-duty-preview');
      if(!preview){
        preview=document.createElement('div');
        preview.className='v312-position-duty-preview';
        const actions=card.querySelector('.actions');
        if(actions) actions.insertAdjacentElement('beforebegin',preview);
        else card.appendChild(preview);
      }
      if(preview.innerHTML!==html) preview.innerHTML=html;

      card.querySelectorAll('.v296-position-duty-preview,.v311-position-duty-preview').forEach(node=>node.remove());
      card.querySelectorAll('[data-v296-position-detail],[data-v226-position-detail],[data-v225-position-detail],[data-position-detail-v219]').forEach(button=>{
        const actions=button.closest('.actions');
        button.remove();
        if(actions && !actions.querySelector('button,a,input,select,textarea')) actions.remove();
      });
    });

    page.querySelectorAll('.v225-job-short,.v219-job-short').forEach(node=>{
      node.classList.remove('v265-description-hidden');
      node.style.removeProperty('display');
    });
  }

  function rosterAssignments(key=monthKey()){
    try{
      const fn=window.scheduleAssignmentsForMonth || (typeof scheduleAssignmentsForMonth==='function' ? scheduleAssignmentsForMonth : null);
      const rows=typeof fn==='function' ? fn(key) : null;
      if(Array.isArray(rows)) return rows;
    }catch(_){}
    return (S()?.rosterAssignments||[]).filter(row=>normDate(row?.duty_date).startsWith(key));
  }

  function dutySort(code){
    try{
      const fn=window.dutySortIndex || (typeof dutySortIndex==='function' ? dutySortIndex : null);
      if(typeof fn==='function') return Number(fn(code))||0;
    }catch(_){}
    return String(code||'');
  }

  function dutyLabel(code){
    try{
      const fn=window.dutyDisplayLabel || (typeof dutyDisplayLabel==='function' ? dutyDisplayLabel : null);
      if(typeof fn==='function') return String(fn(code)||code||'');
    }catch(_){}
    return String(code||'');
  }

  function resolveStaffIdFromRow(row){
    const direct=row?.querySelector?.('[data-staff-stat]')?.getAttribute('data-staff-stat')
      || row?.querySelector?.('[data-staff-id]')?.getAttribute('data-staff-id');
    if(direct) return String(direct);
    const name=String(row?.children?.[0]?.textContent||'').replace(/\s+/g,' ').trim();
    if(!name) return '';
    const person=(S()?.staff||[]).find(item=>{
      const nick=String(item?.nickname||'').trim();
      const full=String(item?.full_name||'').trim();
      return (nick && name.includes(nick)) || (full && name.includes(full));
    });
    return String(person?.id||'');
  }

  function canOpenTrade(assignment){
    if(!assignment?.id || !assignment?.staff_id) return false;
    if(isAdmin()) return true;
    return String(assignment.staff_id)===currentStaffId();
  }

  function repairFullMonthTradeTargets(root=document){
    const table=root.querySelector?.('.clean-schedule-page #scheduleTable.clean-schedule-grid,.clean-schedule-page #scheduleTable');
    if(!table) return;
    const key=String(document.getElementById('scheduleMonthInput')?.value || S()?.monthKey || '').slice(0,7);
    const dates=monthDates(key);
    if(!dates.length) return;
    const assignments=rosterAssignments(key);

    table.querySelectorAll('tbody tr').forEach(row=>{
      const staffId=resolveStaffIdFromRow(row);
      if(!staffId) return;
      const cells=Array.from(row.children||[]);
      const frozenCount=Math.max(0,cells.length-dates.length);
      dates.forEach((date,dateIndex)=>{
        const cell=cells[frozenCount+dateIndex];
        if(!cell) return;
        const candidates=assignments.filter(item=>
          String(item?.staff_id||'')===staffId && normDate(item?.duty_date)===date
        ).sort((a,b)=>{
          const ai=dutySort(a?.duty_code),bi=dutySort(b?.duty_code);
          return typeof ai==='number'&&typeof bi==='number' ? ai-bi : String(ai).localeCompare(String(bi));
        });
        const used=new Set();
        const pills=Array.from(cell.querySelectorAll('.clean-shift-pill'));
        pills.forEach((pill,pillIndex)=>{
          if(pill.classList.contains('v217-received')) return;
          let id=String(pill.getAttribute('data-trade-duty')||'').trim();
          let assignment=id ? candidates.find(item=>String(item?.id||'')===id) : null;
          if(!assignment){
            const label=String(pill.textContent||'').replace(/\s+/g,'').trim();
            assignment=candidates.find(item=>!used.has(String(item?.id||'')) && dutyLabel(item?.duty_code).replace(/\s+/g,'')===label)
              || candidates.find(item=>!used.has(String(item?.id||'')))
              || candidates[pillIndex]
              || candidates[0];
          }
          if(!canOpenTrade(assignment)) return;
          id=String(assignment.id);
          used.add(id);
          pill.setAttribute('data-trade-duty',id);
          pill.setAttribute('data-v312-trade-id',id);
          pill.classList.add('v312-trade-ready');
          pill.setAttribute('title','แตะเพื่อขายเวร / เบิก OT ผ่าน HR');
          pill.setAttribute('role','button');
          if(!pill.hasAttribute('tabindex')) pill.setAttribute('tabindex','0');
        });
      });
    });
  }

  function openTrade(id){
    const assignmentId=String(id||'').trim();
    if(!assignmentId){
      toast('ไม่พบรายการเวรของช่องนี้ กรุณารีเฟรชแล้วลองใหม่');
      return;
    }
    const input=document.getElementById('scheduleMonthInput');
    if(input?.value && S() && String(S().monthKey||'')!==String(input.value)) S().monthKey=input.value;
    try{
      const fn=window.showTradeModal || (typeof showTradeModal==='function' ? showTradeModal : null);
      if(typeof fn!=='function') throw new Error('ไม่พบฟังก์ชันขายเวร');
      fn(assignmentId);
      requestAnimationFrame(forceModal);
      setTimeout(forceModal,60);
      setTimeout(forceModal,180);
    }catch(error){
      console.error(`[${VERSION}] trade modal`,error);
      toast('เปิดหน้าขายเวรไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }

  function isWeekendOrHoliday(date){
    try{
      const weekend=typeof window.isWeekend==='function' ? window.isWeekend(date) : (typeof isWeekend==='function' ? isWeekend(date) : false);
      const holiday=typeof window.isHolidayDate==='function' ? window.isHolidayDate(date) : (typeof isHolidayDate==='function' ? isHolidayDate(date) : false);
      return !!(weekend||holiday);
    }catch(_){}
    const d=new Date(`${date}T00:00:00`);
    return d.getDay()===0 || d.getDay()===6;
  }

  function isOutingDate(date){
    try{
      const fn=window.hasOuting || (typeof hasOuting==='function' ? hasOuting : null);
      if(typeof fn==='function') return !!fn(date);
    }catch(_){}
    return (S()?.activities||[]).some(row=>
      String(row?.event_type||'').trim()==='ออกหน่วย'
      && normDate(row?.start_date)<=date
      && normDate(row?.end_date||row?.start_date)>=date
    );
  }

  function currentConfigs(){
    try{return window.cnmiV224?.currentConfigs?.() || S()?.slotTemplateV224?.configs || null;}
    catch(_){return S()?.slotTemplateV224?.configs || null;}
  }

  function codeOf(row){
    return String(row?.code || row?.position_code || '').trim();
  }

  function slotTarget(date){
    const selector=`[data-v275-slot][data-date="${String(date).replace(/"/g,'\\"')}"]`;
    const input=document.querySelector(selector);
    const row=(S()?.manualDaySlotSettingsV273||[]).find(item=>normDate(item?.work_date)===date);
    const raw=input?.value ?? row?.target_slots;
    const n=Number(raw);
    return Number.isFinite(n)&&n>0 ? Math.round(n) : null;
  }

  function configBuckets(configs){
    const buckets=[];
    Object.entries(configs?.day||{}).forEach(([count,rows])=>{
      if(Array.isArray(rows)) buckets.push({kind:'day',count:Number(count),rows});
    });
    Object.entries(configs?.outing_by_count||{}).forEach(([count,rows])=>{
      if(Array.isArray(rows)) buckets.push({kind:'outing',count:Number(count),rows});
    });
    if(Array.isArray(configs?.outing)) buckets.push({kind:'outing',count:14,rows:configs.outing});
    return buckets;
  }

  function expectedCodesForDate(date){
    try{
      const rows=window.cnmiV278?.templateRowsForDate?.(date) || [];
      return rows.map(codeOf).filter(Boolean);
    }catch(_){return [];}
  }

  function configuredRowsForDate(date){
    const configs=currentConfigs();
    const target=slotTarget(date);
    const outing=isOutingDate(date);
    if(configs && target){
      if(outing){
        const bucket=target<=12?12:(target<=13?13:14);
        const rows=configs.outing_by_count?.[bucket] || configs.outing_by_count?.[String(bucket)] || configs.outing || [];
        if(Array.isArray(rows)&&rows.length) return rows;
      }else{
        const rows=configs.day?.[target] || configs.day?.[String(target)] || [];
        if(Array.isArray(rows)&&rows.length) return rows;
      }
    }

    const expected=expectedCodesForDate(date);
    const buckets=configBuckets(configs).filter(bucket=>bucket.kind===(outing?'outing':'day'));
    if(expected.length && buckets.length){
      const wanted=expected.join('\u241f');
      const exact=buckets.find(bucket=>bucket.rows.map(codeOf).filter(Boolean).join('\u241f')===wanted);
      if(exact) return exact.rows;
      const scored=buckets.map(bucket=>{
        const codes=bucket.rows.map(codeOf).filter(Boolean);
        const overlap=expected.filter(code=>codes.includes(code)).length;
        return {bucket,score:overlap*100-(Math.abs(codes.length-expected.length)*5)+(codes.length===expected.length?20:0)};
      }).sort((a,b)=>b.score-a.score);
      if(scored[0]?.score>0) return scored[0].bucket.rows;
    }

    const masters=(S()?.positionMasters||[]).filter(row=>row && row.is_active!==false && !row.deleted_at && !codeOf(row).startsWith('__CNMI_SLOT_TEMPLATE'));
    return masters.filter(row=>outing ? (row.is_outing===true || String(row.zone||'')==='ออกหน่วย') : !(row.is_outing===true || String(row.zone||'')==='ออกหน่วย'));
  }

  function hasMonthPositionData(key){
    if(document.querySelector('.v275-position-wrap [data-v275-position-select] option:checked:not([value=""])')) return true;
    if(document.querySelector('.v275-position-wrap [data-v275-job]')) return true;
    return (S()?.positions||[]).some(row=>normDate(row?.work_date).startsWith(key) && codeOf(row) && codeOf(row)!=='รอตรวจสอบ');
  }

  function compactDays(values){
    const nums=[...new Set((values||[]).map(value=>Number(String(value).slice(-2))).filter(Number.isFinite))].sort((a,b)=>a-b);
    if(!nums.length) return '-';
    const out=[];
    let start=nums[0],previous=nums[0];
    for(let index=1;index<=nums.length;index++){
      const current=nums[index];
      if(current===previous+1){previous=current;continue;}
      out.push(start===previous?String(start):`${start}-${previous}`);
      start=current;
      previous=current;
    }
    return out.join(', ');
  }

  function positionDatesWithData(key){
    const dates=new Set();
    const wrap=document.querySelector('.v275-position-wrap');
    if(wrap){
      wrap.querySelectorAll('[data-v275-position-cell][data-date]').forEach(cell=>{
        const code=String(cell.querySelector('[data-v275-position-select]')?.value||'').trim();
        const date=normDate(cell.getAttribute('data-date'));
        if(code && code!=='รอตรวจสอบ' && date.startsWith(key)) dates.add(date);
      });
      wrap.querySelectorAll('[data-v275-job]').forEach(button=>{
        const date=dateFromPositionButton(button);
        if(date.startsWith(key)) dates.add(date);
      });
      if(dates.size) return dates;
    }
    (S()?.positions||[]).forEach(row=>{
      const date=normDate(row?.work_date),code=codeOf(row);
      if(date.startsWith(key) && code && code!=='รอตรวจสอบ') dates.add(date);
    });
    return dates;
  }

  function authoritativeDescriptionRows(key){
    if(!hasMonthPositionData(key)) return [];
    const activeDates=positionDatesWithData(key);
    const map=new Map();
    monthDates(key).forEach(date=>{
      if(isWeekendOrHoliday(date) || (activeDates.size && !activeDates.has(date))) return;
      const rows=configuredRowsForDate(date);
      rows.forEach((row,index)=>{
        const code=codeOf(row);
        if(!code || code==='รอตรวจสอบ' || row?.is_active===false) return;
        const detail={
          code,
          zone:String(row?.zone||'-'),
          break_time:String(row?.break_time||'-'),
          main_rule:String(row?.main_rule||row?.required_role||'-'),
          job_desc:String(row?.job_desc||row?.description||'ยังไม่ได้ระบุรายละเอียดหน้าที่'),
          sort_order:Number(row?.sort_order||index+1)||index+1
        };
        const signature=[detail.code,detail.zone,detail.break_time,detail.main_rule,detail.job_desc].join('\u241f');
        if(!map.has(signature)) map.set(signature,{...detail,dates:new Set()});
        map.get(signature).dates.add(date);
      });
    });
    return [...map.values()].map(row=>({...row,dates:[...row.dates]})).sort((a,b)=>
      Number(a.sort_order||999)-Number(b.sort_order||999)
      || String(a.code).localeCompare(String(b.code),'th')
    );
  }

  function descriptionTableHtml(rows){
    if(!rows.length) return '<div class="empty-state">เดือนนี้ยังไม่มีตำแหน่งในตาราง</div>';
    return `<div class="table-wrap v297-position-description-wrap"><table class="v297-position-description-table"><thead><tr><th>ตำแหน่ง</th><th>วันที่ใช้</th><th>โซน</th><th>เวลาพัก</th><th>ผู้ปฏิบัติหลัก / เงื่อนไข</th><th>รายละเอียดหน้าที่</th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${esc(row.code)}</b></td><td>${esc(compactDays(row.dates))}</td><td>${esc(row.zone)}</td><td>${esc(row.break_time)}</td><td>${esc(row.main_rule)}</td><td class="v297-job-cell">${esc(row.job_desc)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function repairMonthlyPositionDescriptions(root=document){
    const st=S();
    if(!['positionMonth','positionMonthView'].includes(st?.page)) return;
    const page=root.querySelector?.('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(!page || !wrap) return;
    const key=String(st?.page==='positionMonthView' ? (st?.positionMonthViewKey||st?.monthKey) : (st?.positionMonthKey||st?.monthKey)).slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(key)) return;
    const rows=authoritativeDescriptionRows(key);
    const signature=rows.map(row=>[row.code,row.zone,row.break_time,row.main_rule,row.job_desc,row.dates.join(',')].join('|')).join('||');
    let section=page.querySelector('[data-v297-position-descriptions]');
    if(!section){
      section=document.createElement('section');
      section.className='v297-position-description-card';
      section.setAttribute('data-v297-position-descriptions','');
      wrap.insertAdjacentElement('afterend',section);
    }
    if(section.dataset.v312Signature===signature) return;
    section.dataset.v312Signature=signature;
    section.innerHTML=`<div class="section-title"><div><h3>คำอธิบายตำแหน่งที่ใช้ในตาราง</h3><p class="hint">อ้างอิงฐาน Slot ปัจจุบันชุดเดียวกับหน้าตารางตำแหน่งกลางวัน รายวัน</p></div></div>${descriptionTableHtml(rows)}`;
  }

  function detailForPosition(code,date=''){
    const wanted=String(code||'').trim();
    const rows=date ? configuredRowsForDate(date) : [];
    let row=rows.find(item=>codeOf(item)===wanted);
    if(!row){
      const family=wanted.replace(/\s+\d+$/,'').trim();
      const familyRows=rows.filter(item=>codeOf(item).replace(/\s+\d+$/,'').trim()===family);
      if(familyRows.length===1) row=familyRows[0];
    }
    if(!row){
      const buckets=configBuckets(currentConfigs());
      row=buckets.flatMap(bucket=>bucket.rows).find(item=>codeOf(item)===wanted);
    }
    if(!row){
      row=(S()?.positionMasters||[]).find(item=>codeOf(item)===wanted && item?.is_active!==false && !item?.deleted_at);
    }
    return row || {code:wanted,zone:'-',break_time:'-',main_rule:'-',job_desc:'ยังไม่ได้ระบุรายละเอียดหน้าที่'};
  }

  function dateFromPositionButton(button){
    const direct=button?.closest?.('[data-date]')?.getAttribute('data-date');
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(direct||''))) return String(direct);
    const cell=button?.closest?.('td');
    const row=button?.closest?.('tr');
    const dates=monthDates();
    if(!cell || !row || !dates.length) return '';
    const children=Array.from(row.children||[]);
    const index=children.indexOf(cell);
    const frozen=Math.max(0,children.length-dates.length);
    return dates[index-frozen] || '';
  }

  function openPosition(button){
    const code=String(button?.getAttribute?.('data-v275-job') || button?.getAttribute?.('data-v273-job-code') || '').trim();
    if(!code) return;
    const date=dateFromPositionButton(button);
    const row=detailForPosition(code,date);
    try{
      const fn=window.showModal || (typeof showModal==='function' ? showModal : null);
      if(typeof fn!=='function') throw new Error('ไม่พบ Modal');
      fn(`<div class="v312-position-modal"><h2>${esc(codeOf(row)||code)}</h2><div class="v312-position-meta"><span><small>โซน</small><b>${esc(row?.zone||'-')}</b></span><span><small>เวลาพัก</small><b>${esc(row?.break_time||'-')}</b></span></div><div class="v312-position-box"><h3>ผู้ปฏิบัติหลัก / เงื่อนไข</h3><p>${esc(row?.main_rule||row?.required_role||'-')}</p></div><div class="v312-position-box"><h3>รายละเอียดหน้าที่</h3><p>${esc(row?.job_desc||row?.description||'ยังไม่ได้ระบุรายละเอียดหน้าที่')}</p></div></div>`,{large:false});
      requestAnimationFrame(forceModal);
      setTimeout(forceModal,60);
    }catch(error){
      console.error(`[${VERSION}] position modal`,error);
      toast('เปิดรายละเอียดตำแหน่งไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }

  function openCalendar(date){
    const key=normDate(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    try{
      const direct=window.showDayDetail || (typeof showDayDetail==='function' ? showDayDetail : null);
      if(typeof direct==='function') direct(key);
      else{
        const collect=window.collectCalendarEvents || (typeof collectCalendarEvents==='function' ? collectCalendarEvents : null);
        const render=window.renderCalendarModalRow || (typeof renderCalendarModalRow==='function' ? renderCalendarModalRow : null);
        const rows=(typeof collect==='function' ? collect() : []).filter(row=>normDate(row?.date)===key);
        const format=window.formatThaiDate || (typeof formatThaiDate==='function' ? formatThaiDate : null);
        const title=typeof format==='function' ? format(key) : key;
        const body=rows.length ? rows.map(row=>typeof render==='function'?render(row):`<div class="calendar-modal-row"><b>${esc(row?.title||'-')}</b></div>`).join('') : '<div class="empty-state">ไม่มีรายการในวันนี้</div>';
        const show=window.showModal || (typeof showModal==='function' ? showModal : null);
        if(typeof show==='function') show(`<h2>${esc(title)}</h2><div class="calendar-modal-list">${body}</div>`);
      }
      requestAnimationFrame(forceModal);
      setTimeout(forceModal,60);
    }catch(error){
      console.error(`[${VERSION}] calendar modal`,error);
      toast('เปิดรายละเอียด Calendar ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }

  function touchActionFor(target){
    if(target?.nodeType===3) target=target.parentElement;
    if(!target?.closest) return null;
    const trade=target.closest('#scheduleTable [data-v312-trade-id]');
    if(trade) return {type:'trade',key:`trade:${trade.getAttribute('data-v312-trade-id')}`,node:trade};
    const calendar=target.closest('[data-day-detail]');
    if(calendar) return {type:'calendar',key:`calendar:${calendar.getAttribute('data-day-detail')}`,node:calendar};
    const position=target.closest('[data-v275-job],[data-v273-job-code]');
    if(position){
      const code=position.getAttribute('data-v275-job')||position.getAttribute('data-v273-job-code')||'';
      return {type:'position',key:`position:${code}`,node:position};
    }
    return null;
  }

  function runTouchAction(event,action){
    if(!action) return;
    const now=Date.now();
    if(action.key===lastTouchAction && now-lastTouchAt<700){stop(event);return;}
    lastTouchAction=action.key;
    lastTouchAt=now;
    stop(event);
    if(action.type==='trade') openTrade(action.node.getAttribute('data-v312-trade-id'));
    else if(action.type==='calendar') openCalendar(action.node.getAttribute('data-day-detail'));
    else if(action.type==='position') openPosition(action.node);
  }

  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse') return;
    const action=touchActionFor(event.target);
    if(!action) return;
    pointerStarts.set(event.pointerId,{x:event.clientX,y:event.clientY,action,moved:false});
  },{capture:true,passive:true});

  document.addEventListener('pointermove',event=>{
    const start=pointerStarts.get(event.pointerId);
    if(!start) return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>14) start.moved=true;
  },{capture:true,passive:true});

  document.addEventListener('pointerup',event=>{
    if(event.pointerType==='mouse') return;
    const start=pointerStarts.get(event.pointerId);
    pointerStarts.delete(event.pointerId);
    if(!start || start.moved) return;
    const current=touchActionFor(document.elementFromPoint(event.clientX,event.clientY)) || start.action;
    runTouchAction(event,current);
  },{capture:true,passive:false});

  document.addEventListener('pointercancel',event=>pointerStarts.delete(event.pointerId),{capture:true,passive:true});

  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter' && event.key!==' ') return;
    const trade=event.target?.closest?.('#scheduleTable [data-v312-trade-id]');
    if(!trade) return;
    stop(event);
    openTrade(trade.getAttribute('data-v312-trade-id'));
  },true);

  function enhance(root=document){
    removeObsoleteCh4(root);
    repairDailySummary(root);
    keepDailyDutyText(root);
    repairFullMonthTradeTargets(root);
    repairMonthlyPositionDescriptions(root);
  }

  function queueEnhance(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      enhance(document);
    });
  }

  const style=document.createElement('style');
  style.id='v312-app-targeted-position-trade-style';
  style.textContent=`
    .v234-ch4-shared-card,.v209-admin-ch4-card{display:none!important}
    .v312-summary-cards{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important}
    .v312-summary-cards>div{min-width:0}

    .position-mobile-card.v225-position-card{
      grid-template-areas:
        "head head"
        "meta meta"
        "plan edit"
        "duty duty"
        "action action"!important;
    }
    .position-mobile-card.v225-position-card>.v312-position-duty-preview{
      grid-area:duty!important;
      width:100%!important;
      min-width:0!important;
      box-sizing:border-box!important;
      margin:0!important;
      padding:12px 13px!important;
      border:1px solid #d6e7f7!important;
      border-radius:14px!important;
      background:#f7fbff!important;
      color:#334155!important;
      line-height:1.6!important;
      position:relative!important;
      z-index:1!important;
    }
    .position-mobile-card.v225-position-card>.v312-position-duty-preview b{display:block!important;color:#17324d!important;margin:0 0 4px!important;font-size:14px!important}
    .position-mobile-card.v225-position-card>.v312-position-duty-preview span{display:block!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important}
    .v225-positions-page [data-v296-position-detail],
    .v225-positions-page [data-v225-position-detail],
    .v226-positions-page [data-v226-position-detail],
    .v219-positions-page [data-position-detail-v219]{display:none!important}

    #scheduleTable .clean-shift-pill.v312-trade-ready{cursor:pointer!important;touch-action:manipulation!important;box-shadow:0 0 0 1px rgba(37,99,235,.18)}

    .v312-position-modal h2{margin:0 0 14px}
    .v312-position-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}
    .v312-position-meta>span,.v312-position-box{padding:13px;border:1px solid #dbe7f3;border-radius:15px;background:#f8fbff}
    .v312-position-meta small{display:block;color:#64748b;margin-bottom:3px}
    .v312-position-box{margin-top:10px;background:#fff}
    .v312-position-box h3{margin:0 0 6px;color:#17324d}
    .v312-position-box p{margin:0;white-space:pre-wrap;line-height:1.65;color:#334155}

    @media(max-width:760px){
      .position-mobile-card.v225-position-card{
        grid-template-columns:minmax(0,1fr)!important;
        grid-template-areas:
          "head"
          "meta"
          "plan"
          "edit"
          "duty"
          "action"!important;
        gap:10px!important;
      }
    }
    @media(max-width:520px){
      .v312-summary-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .v312-summary-cards>div:last-child{grid-column:1/-1}
      .v312-position-meta{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queueEnhance);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',queueEnhance,{once:true});
  window.addEventListener('pageshow',queueEnhance);
  window.addEventListener('resize',queueEnhance);
  queueEnhance();

  window.cnmiV312={
    enhance,
    repairDailySummary,
    keepDailyDutyText,
    repairFullMonthTradeTargets,
    repairMonthlyPositionDescriptions,
    openTrade,
    openPosition,
    openCalendar,
    authoritativeDescriptionRows
  };
  console.info(`[${VERSION}] loaded`);
})();
