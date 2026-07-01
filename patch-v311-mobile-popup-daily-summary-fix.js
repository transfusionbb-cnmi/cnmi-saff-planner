/* CNMI Staff Planner V311
   Final fixes for:
   - Calendar day popup on mobile/PWA and desktop
   - Monthly roster sell-duty popup
   - Monthly daytime-position detail popup
   - Daily position duty text without redundant detail buttons
   - Daily Slot display aligned with the monthly table (e.g. 11/11)
   - Removal of obsolete Ch4 monthly status / SQL warning card
*/
(function(){
  'use strict';

  const VERSION='V311_MOBILE_POPUP_DAILY_SUMMARY_FIX';
  if(window.__CNMI_V311_MOBILE_POPUP_DAILY_SUMMARY_FIX__) return;
  window.__CNMI_V311_MOBILE_POPUP_DAILY_SUMMARY_FIX__=true;

  const touchStarts=new Map();
  let queued=false;
  let lastAction='';
  let lastActionAt=0;

  function esc(value){
    try{
      const fn=window.escapeHtml || (typeof escapeHtml==='function' ? escapeHtml : null);
      if(typeof fn==='function') return fn(value==null?'':String(value));
    }catch(_){}
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function appState(){
    try{return state || window.state || null;}catch(_){return window.state || null;}
  }

  function showToastSafe(message){
    try{
      const fn=window.showToast || (typeof showToast==='function' ? showToast : null);
      if(typeof fn==='function') return fn(message,{tone:'error'});
    }catch(_){}
    console.error(`[${VERSION}] ${message}`);
  }

  function stop(event){
    try{event.preventDefault();}catch(_){}
    try{event.stopPropagation();}catch(_){}
    try{event.stopImmediatePropagation?.();}catch(_){}
  }

  function forceModal(html,opts={}){
    const modal=document.getElementById('modal');
    const body=document.getElementById('modalBody');
    if(!modal || !body) return false;
    if(typeof html==='string') body.innerHTML=html;
    try{
      if(window.__modalCloseTimerV193){
        clearTimeout(window.__modalCloseTimerV193);
        window.__modalCloseTimerV193=null;
      }
    }catch(_){}
    modal.classList.remove('hidden','modal-closing');
    modal.classList.add('modal-ready');
    modal.classList.toggle('modal-lg',!!opts.large);
    modal.classList.toggle('modal-sm',!!opts.small);
    document.body.classList.add('modal-open');
    const card=modal.querySelector('.modal-card');
    if(card) card.scrollTop=0;
    return true;
  }

  function openModalSafe(html,opts={}){
    let called=false;
    try{
      const fn=window.showModal || (typeof showModal==='function' ? showModal : null);
      if(typeof fn==='function'){
        fn(html,opts);
        called=true;
      }
    }catch(error){
      console.warn(`[${VERSION}] showModal failed`,error);
    }
    if(!called) forceModal(html,opts);
    else forceModal(null,opts);
    requestAnimationFrame(()=>forceModal(null,opts));
    setTimeout(()=>forceModal(null,opts),60);
  }

  function formatThaiDateSafe(date){
    try{
      const fn=window.formatThaiDate || (typeof formatThaiDate==='function' ? formatThaiDate : null);
      if(typeof fn==='function') return fn(date);
    }catch(_){}
    return date;
  }

  function openCalendar(date){
    const key=String(date||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    try{
      const collect=window.collectCalendarEvents || (typeof collectCalendarEvents==='function' ? collectCalendarEvents : null);
      const all=typeof collect==='function' ? collect() : [];
      const rows=(Array.isArray(all)?all:[]).filter(row=>String(row?.date||'').slice(0,10)===key);
      const render=window.renderCalendarModalRow || (typeof renderCalendarModalRow==='function' ? renderCalendarModalRow : null);
      const body=rows.length
        ? rows.map(row=>{
            try{if(typeof render==='function') return render(row);}catch(_){}
            return `<div class="calendar-modal-row"><b>${esc(row?.title||'-')}</b></div>`;
          }).join('')
        : '<div class="empty-state">ไม่มีรายการในวันนี้</div>';
      openModalSafe(`<div class="v311-calendar-modal"><h2>${esc(formatThaiDateSafe(key))}</h2><div class="calendar-modal-list">${body}</div></div>`,{large:false});
    }catch(error){
      console.error(`[${VERSION}] calendar popup failed`,error);
      showToastSafe('เปิดรายละเอียด Calendar ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }

  function currentStaffIdSafe(){
    try{
      const fn=window.currentStaffId || (typeof currentStaffId==='function' ? currentStaffId : null);
      if(typeof fn==='function') return String(fn()||'');
    }catch(_){}
    const st=appState();
    return String(st?.profile?.staff_id || st?.user?.staff_id || st?.currentStaffId || '');
  }

  function isAdminSafe(){
    try{
      const fn=window.isAdmin || (typeof isAdmin==='function' ? isAdmin : null);
      if(typeof fn==='function') return !!fn();
    }catch(_){}
    const st=appState();
    return String(st?.role || st?.currentRole || '').toLowerCase()==='admin';
  }

  function scheduleMonthKey(){
    const st=appState();
    return String(document.getElementById('scheduleMonthInput')?.value || st?.monthKey || st?.scheduleMonthKey || '').slice(0,7);
  }

  function monthDates(key){
    try{
      const fn=window.scheduleMonthDates || (typeof scheduleMonthDates==='function' ? scheduleMonthDates : null);
      const rows=typeof fn==='function' ? fn(key) : [];
      if(Array.isArray(rows) && rows.length) return rows.map(x=>String(x).slice(0,10));
    }catch(_){}
    if(!/^\d{4}-\d{2}$/.test(key)) return [];
    const [year,month]=key.split('-').map(Number);
    const last=new Date(year,month,0).getDate();
    return Array.from({length:last},(_,i)=>`${key}-${String(i+1).padStart(2,'0')}`);
  }

  function rosterAssignments(key){
    try{
      const fn=window.scheduleAssignmentsForMonth || (typeof scheduleAssignmentsForMonth==='function' ? scheduleAssignmentsForMonth : null);
      const rows=typeof fn==='function' ? fn(key) : null;
      if(Array.isArray(rows)) return rows;
    }catch(_){}
    return (appState()?.rosterAssignments||[]).filter(row=>String(row?.duty_date||'').slice(0,7)===key);
  }

  function resolveStaffIdFromRow(row){
    const direct=row?.querySelector?.('[data-staff-stat]')?.getAttribute('data-staff-stat')
      || row?.querySelector?.('[data-staff-id]')?.getAttribute('data-staff-id');
    if(direct) return String(direct);
    const name=String(row?.children?.[0]?.textContent||'').replace(/\s+/g,' ').trim();
    if(!name) return '';
    const person=(appState()?.staff||[]).find(item=>{
      const nick=String(item?.nickname||'').trim();
      const full=String(item?.full_name||'').trim();
      return (nick && name.includes(nick)) || (full && name.includes(full));
    });
    return String(person?.id||'');
  }

  function resolveTradeId(button){
    const direct=String(button?.getAttribute?.('data-trade-duty')||'').trim();
    if(direct) return direct;
    const row=button?.closest?.('tr');
    const cell=button?.closest?.('td,th');
    if(!row || !cell) return '';
    const key=scheduleMonthKey();
    const dates=monthDates(key);
    if(!dates.length) return '';
    const children=Array.from(row.children||[]);
    const cellIndex=children.indexOf(cell);
    const frozenCount=Math.max(0,children.length-dates.length);
    const date=dates[cellIndex-frozenCount];
    const staffId=resolveStaffIdFromRow(row);
    if(!date || !staffId) return '';
    if(!isAdminSafe() && staffId!==currentStaffIdSafe()) return '';
    const candidates=rosterAssignments(key).filter(item=>
      String(item?.staff_id||'')===staffId && String(item?.duty_date||'').slice(0,10)===date
    );
    if(!candidates.length) return '';
    const text=String(button.textContent||'').replace(/\s+/g,'').trim();
    let match=candidates.find(item=>{
      let label=String(item?.duty_code||'');
      try{
        const fn=window.dutyDisplayLabel || (typeof dutyDisplayLabel==='function' ? dutyDisplayLabel : null);
        if(typeof fn==='function') label=String(fn(item?.duty_code)||label);
      }catch(_){}
      return label.replace(/\s+/g,'')===text;
    });
    if(!match){
      const pills=Array.from(cell.querySelectorAll('.clean-shift-pill,[data-trade-duty]'));
      const idx=Math.max(0,pills.indexOf(button));
      match=candidates[idx] || candidates[0];
    }
    const id=String(match?.id||'');
    if(id) button.setAttribute('data-trade-duty',id);
    return id;
  }

  function openTrade(button){
    const id=resolveTradeId(button);
    if(!id){
      showToastSafe('ไม่พบรายการเวรของช่องนี้ หรือเวรนี้ไม่ใช่เวรของผู้ใช้งาน');
      return;
    }
    try{
      const fn=window.showTradeModal || (typeof showTradeModal==='function' ? showTradeModal : null);
      if(typeof fn!=='function') throw new Error('ไม่พบฟังก์ชันขายเวร');
      fn(id);
      requestAnimationFrame(()=>forceModal(null,{large:false}));
      setTimeout(()=>forceModal(null,{large:false}),80);
    }catch(error){
      console.error(`[${VERSION}] trade popup failed`,error);
      showToastSafe('เปิดหน้าขายเวรไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }

  function findPositionByCode(code){
    const value=String(code||'').trim();
    const st=appState();
    const lists=[st?.positionMasters,st?.dailyPositionMasters,st?.positions];
    for(const list of lists){
      if(!Array.isArray(list)) continue;
      const found=list.find(row=>String(row?.code || row?.position_code || '').trim()===value);
      if(found) return found;
    }
    try{
      const fn=window.positionByCode;
      if(typeof fn==='function'){
        const found=fn(value);
        if(found) return found;
      }
    }catch(_){}
    try{
      const list=window.DEFAULT_DAILY_POSITIONS || (typeof DEFAULT_DAILY_POSITIONS!=='undefined' ? DEFAULT_DAILY_POSITIONS : []);
      const found=(Array.isArray(list)?list:[]).find(row=>String(row?.code||'').trim()===value);
      if(found) return found;
    }catch(_){}
    return {};
  }

  function openPosition(button){
    const code=String(button?.getAttribute?.('data-v275-job') || button?.getAttribute?.('data-v273-job-code') || '').trim();
    if(!code) return;
    const row=findPositionByCode(code);
    const zone=row?.zone || '-';
    const breakTime=row?.break_time || '-';
    const rule=row?.main_rule || '-';
    const job=row?.job_desc || row?.description || 'ยังไม่ได้ระบุรายละเอียดหน้าที่';
    openModalSafe(`<div class="v311-position-modal"><h2>${esc(code)}</h2><div class="v311-position-meta"><span><small>โซน</small><b>${esc(zone)}</b></span><span><small>เวลาพัก</small><b>${esc(breakTime)}</b></span></div><div class="v311-position-box"><h3>ผู้ปฏิบัติหลัก / เงื่อนไข</h3><p>${esc(rule)}</p></div><div class="v311-position-box"><h3>รายละเอียดหน้าที่</h3><p>${esc(job)}</p></div></div>`,{large:false});
  }

  function actionFor(target){
    if(target?.nodeType===3) target=target.parentElement;
    if(!target?.closest) return null;
    const calendar=target.closest('[data-day-detail]');
    if(calendar) return {type:'calendar',node:calendar,key:`calendar:${calendar.getAttribute('data-day-detail')||''}`};
    const position=target.closest('[data-v275-job],[data-v273-job-code]');
    if(position){
      const code=position.getAttribute('data-v275-job') || position.getAttribute('data-v273-job-code') || '';
      return {type:'position',node:position,key:`position:${code}`};
    }
    const trade=target.closest('[data-trade-duty],#scheduleTable .clean-shift-pill,.clean-schedule-grid .clean-shift-pill');
    if(trade) return {type:'trade',node:trade,key:`trade:${trade.getAttribute('data-trade-duty')||trade.textContent||''}`};
    return null;
  }

  function runAction(event,action){
    if(!action) return false;
    const now=Date.now();
    if(action.key===lastAction && now-lastActionAt<700){
      stop(event);
      return true;
    }
    lastAction=action.key;
    lastActionAt=now;
    stop(event);
    if(action.type==='calendar') openCalendar(action.node.getAttribute('data-day-detail'));
    else if(action.type==='position') openPosition(action.node);
    else if(action.type==='trade') openTrade(action.node);
    return true;
  }

  /* Use touch events because older pointer/click handlers can swallow iOS taps. */
  document.addEventListener('touchstart',event=>{
    const action=actionFor(event.target);
    if(!action) return;
    const touch=event.changedTouches?.[0];
    if(!touch) return;
    touchStarts.set(touch.identifier,{x:touch.clientX,y:touch.clientY,action,moved:false});
  },{capture:true,passive:true});

  document.addEventListener('touchmove',event=>{
    for(const touch of Array.from(event.changedTouches||[])){
      const start=touchStarts.get(touch.identifier);
      if(!start) continue;
      if(Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>14) start.moved=true;
    }
  },{capture:true,passive:true});

  document.addEventListener('touchend',event=>{
    const touch=event.changedTouches?.[0];
    if(!touch) return;
    const start=touchStarts.get(touch.identifier);
    touchStarts.delete(touch.identifier);
    if(!start || start.moved) return;
    const current=actionFor(document.elementFromPoint(touch.clientX,touch.clientY)) || start.action;
    if(current) runAction(event,current);
  },{capture:true,passive:false});

  document.addEventListener('touchcancel',event=>{
    for(const touch of Array.from(event.changedTouches||[])) touchStarts.delete(touch.identifier);
  },{capture:true,passive:true});

  /* Desktop fallback without relying on the older click chain. */
  document.addEventListener('mousedown',event=>{
    if(event.button!==0) return;
    const action=actionFor(event.target);
    if(action) runAction(event,action);
  },true);

  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter' && event.key!==' ') return;
    const action=actionFor(event.target);
    if(action) runAction(event,action);
  },true);

  function dailyRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__)) return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__)) return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return [];
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

  function removeOldTraineeNotes(panel){
    panel?.querySelectorAll?.('.v308-trainee-note,.v309-trainee-note,.v311-trainee-note').forEach(node=>node.remove());
  }

  function numberFrom(node){
    const match=String(node?.textContent||'').match(/\d+/);
    return match?Number(match[0]):0;
  }

  function repairDailySummary(root=document){
    const panel=root.querySelector?.('.v225-daily-compare-panel,.v226-daily-compare-panel');
    if(!panel) return;
    const cards=panel.querySelector('.v225-compare-cards');
    if(!cards) return;

    removeOldTraineeNotes(panel);
    panel.querySelectorAll('.v225-daily-slot-toolbar .hint').forEach(node=>node.remove());

    const originalText=String(cards.textContent||'');
    if(/คนเข้าร่วมออกหน่วย|Slot ชุดออกหน่วย/.test(originalText)) return;

    const oldItems=Array.from(cards.children||[]);
    const total=oldItems.length ? numberFrom(oldItems[0].querySelector('b,strong')) : 0;
    const rows=dailyRows();
    const baseRows=rows.filter(row=>row?._source!=='extra-plan');
    const fallbackSlots=baseRows.length;
    const originalPlan=oldItems.length>=5 ? numberFrom(oldItems[2].querySelector('b,strong')) : 0;
    const originalSlots=oldItems.length>=5 ? numberFrom(oldItems[3].querySelector('b,strong')) : 0;
    const slotCount=originalSlots || fallbackSlots;
    const filledCount=baseRows.filter(row=>String(row?.staff_id || row?._planned_staff_id || '').trim()).length;
    const counted=Math.min(slotCount,Math.max(originalPlan,filledCount,slotCount||0));
    const diff=counted-slotCount;

    cards.className='v225-compare-cards v311-summary-cards';
    cards.innerHTML=`<div><b>${total}</b><span>คนอยู่จริงทั้งหมด</span></div><div><b>${counted}/${slotCount}</b><span>คน/Slot วันนี้</span></div><div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`}</b><span>สถานะกำลังคน</span></div>`;
  }

  function keepDailyDutyText(root=document){
    const page=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!page) return;
    const rows=dailyRows();
    const cards=Array.from(page.querySelectorAll('.position-mobile-card,.v225-position-card'));
    cards.forEach((card,index)=>{
      const row=rows[index]||{};
      const job=String(row?.job_desc || row?.description || '').trim() || 'ยังไม่ได้ระบุรายละเอียดหน้าที่';
      card.querySelectorAll('.v296-position-duty-preview,.v311-position-duty-preview').forEach(node=>node.remove());
      const preview=document.createElement('div');
      preview.className='v311-position-duty-preview';
      preview.innerHTML=`<b>หน้าที่:</b><span>${esc(job)}</span>`;
      const actions=card.querySelector('.actions');
      if(actions) actions.insertAdjacentElement('beforebegin',preview);
      else card.appendChild(preview);
    });
    page.querySelectorAll('[data-v296-position-detail],[data-v226-position-detail],[data-v225-position-detail],[data-position-detail-v219]').forEach(button=>{
      const actions=button.closest('.actions');
      button.remove();
      if(actions && !actions.querySelector('button,a,input,select,textarea')) actions.remove();
    });
    page.querySelectorAll('.v225-job-short,.v219-job-short').forEach(node=>{
      node.classList.remove('v265-description-hidden');
      node.style.removeProperty('display');
    });
  }

  function enhance(root=document){
    removeObsoleteCh4(root);
    repairDailySummary(root);
    keepDailyDutyText(root);
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
  style.id='v311-mobile-popup-daily-summary-style';
  style.textContent=`
    .v234-ch4-shared-card,.v209-admin-ch4-card{display:none!important}
    .v311-summary-cards{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important}
    .v311-summary-cards>div{min-width:0}
    .v311-position-duty-preview{margin-top:12px;padding:12px 13px;border:1px solid #d6e7f7;border-radius:14px;background:#f7fbff;color:#334155;line-height:1.6}
    .v311-position-duty-preview b{display:block;color:#17324d;margin-bottom:4px}
    .v311-position-duty-preview span{display:block;white-space:pre-wrap;overflow-wrap:anywhere}
    .v311-position-modal h2,.v311-calendar-modal h2{margin:0 0 14px}
    .v311-position-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}
    .v311-position-meta>span,.v311-position-box{padding:13px;border:1px solid #dbe7f3;border-radius:15px;background:#f8fbff}
    .v311-position-meta small{display:block;color:#64748b;margin-bottom:3px}
    .v311-position-box{margin-top:10px;background:#fff}
    .v311-position-box h3{margin:0 0 6px;color:#17324d}
    .v311-position-box p{margin:0;white-space:pre-wrap;line-height:1.65;color:#334155}
    @media(max-width:520px){
      .v311-summary-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .v311-summary-cards>div:last-child{grid-column:1/-1}
      .v311-position-meta{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queueEnhance);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',queueEnhance,{once:true});
  window.addEventListener('pageshow',queueEnhance);
  queueEnhance();

  window.cnmiV311={enhance,openCalendar,openTrade,openPosition,repairDailySummary,keepDailyDutyText,removeObsoleteCh4};
  console.info(`[${VERSION}] loaded`);
})();
