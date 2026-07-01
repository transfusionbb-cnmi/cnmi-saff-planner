/* CNMI Staff Planner V315 — early interaction router
   Loaded before app.js so Calendar / OT edit / CH4 actions are handled before
   legacy capture listeners. No database logic is executed in this file.
*/
(function(){
  'use strict';
  const VERSION='V315_INTERACTION_PRELOAD';
  if(window.__CNMI_V315_INTERACTION_PRELOAD__) return;
  window.__CNMI_V315_INTERACTION_PRELOAD__=true;

  let lastKey='';
  let lastAt=0;
  const pointers=new Map();

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
  function normDate(value){
    try{
      const fn=window.normalizeDateKey || (typeof normalizeDateKey==='function' ? normalizeDateKey : null);
      if(typeof fn==='function') return String(fn(value)||'').slice(0,10);
    }catch(_){ }
    return String(value||'').slice(0,10);
  }
  function stop(event){
    try{event.preventDefault();}catch(_){ }
    try{event.stopPropagation();}catch(_){ }
    try{event.stopImmediatePropagation?.();}catch(_){ }
  }
  function showModalDom(html,opts={}){
    try{
      const fn=window.showModal || (typeof showModal==='function' ? showModal : null);
      if(typeof fn==='function') fn(html,opts);
    }catch(_){ }
    const modal=document.getElementById('modal');
    const body=document.getElementById('modalBody');
    if(!modal || !body) return false;
    if(!String(body.innerHTML||'').trim()) body.innerHTML=html;
    try{
      if(window.__modalCloseTimerV193){
        clearTimeout(window.__modalCloseTimerV193);
        window.__modalCloseTimerV193=null;
      }
    }catch(_){ }
    modal.classList.remove('hidden','modal-closing');
    modal.classList.toggle('modal-sm',!!opts.small);
    modal.classList.toggle('modal-lg',!!opts.large);
    modal.classList.add('modal-ready');
    document.body.classList.add('modal-open');
    const card=modal.querySelector('.modal-card');
    if(card) card.scrollTop=0;
    return true;
  }
  function toast(message){
    try{
      const fn=window.showToast || (typeof showToast==='function' ? showToast : null);
      if(typeof fn==='function') return fn(message,{tone:'error'});
    }catch(_){ }
    showModalDom(`<div class="app-alert error"><div class="app-alert-icon">!</div><h2>แจ้งเตือน</h2><p>${esc(message)}</p><div class="confirm-actions"><button class="primary-btn" type="button" data-app-alert-ok>ตกลง</button></div></div>`,{small:true});
  }
  function stateSafe(){
    try{return window.state || state || null;}catch(_){return window.state || null;}
  }
  function calendarRows(date){
    try{
      const fn=window.collectCalendarEvents || (typeof collectCalendarEvents==='function' ? collectCalendarEvents : null);
      const rows=typeof fn==='function' ? fn() : [];
      return (Array.isArray(rows)?rows:[]).filter(row=>normDate(row?.date)===date);
    }catch(error){
      console.warn(`[${VERSION}] calendar collect fallback`,error);
      return [];
    }
  }
  function calendarTitle(date){
    try{
      const fn=window.formatThaiDate || (typeof formatThaiDate==='function' ? formatThaiDate : null);
      if(typeof fn==='function') return fn(date);
    }catch(_){ }
    return date;
  }
  function fallbackCalendarRow(row){
    const raw=row?.raw||{};
    const title=row?.title || row?.name || row?.type || '-';
    const detail=raw?.note || raw?.admin_record_reason || row?.reason || '';
    return `<div class="calendar-modal-row"><div class="event-title"><b>${esc(title)}</b></div>${detail?`<div class="muted">${esc(detail)}</div>`:''}</div>`;
  }
  function renderCalendarRow(row){
    try{
      const fn=window.renderCalendarModalRow || (typeof renderCalendarModalRow==='function' ? renderCalendarModalRow : null);
      if(typeof fn==='function') return fn(row);
    }catch(error){
      console.warn(`[${VERSION}] calendar row fallback`,error);
    }
    return fallbackCalendarRow(row);
  }
  function openCalendar(date){
    const key=normDate(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return toast('ไม่พบวันที่ที่ต้องการเปิด');
    try{
      const rows=calendarRows(key);
      const body=rows.length?rows.map(renderCalendarRow).join(''):'<div class="empty-state">ไม่มีรายการในวันนี้</div>';
      if(!showModalDom(`<div class="v314-calendar-modal"><h2>${esc(calendarTitle(key))}</h2><div class="calendar-modal-list">${body}</div></div>`,{large:false})){
        throw new Error('modal container not found');
      }
    }catch(error){
      console.error(`[${VERSION}] calendar open failed`,error);
      toast('เปิดรายละเอียด Calendar ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }
  function forceModalSoon(){
    const force=()=>{
      const modal=document.getElementById('modal');
      const body=document.getElementById('modalBody');
      if(!modal || !body || !String(body.innerHTML||'').trim()) return;
      modal.classList.remove('hidden','modal-closing');
      modal.classList.add('modal-ready');
      document.body.classList.add('modal-open');
    };
    requestAnimationFrame(force);
    setTimeout(force,60);
  }
  function openTrade(button){
    const id=String(
      button?.getAttribute?.('data-trade-duty') ||
      button?.getAttribute?.('data-v313-trade-id') ||
      button?.getAttribute?.('data-v312-trade-id') ||
      ''
    ).trim();
    if(!id) return toast('ไม่พบรายการเวรที่ต้องการขาย กรุณากดรีเฟรชแล้วลองใหม่');
    try{
      const fn=window.showTradeModal || (typeof showTradeModal==='function' ? showTradeModal : null);
      if(typeof fn==='function') fn(id);
      else if(typeof window.cnmiV313?.openTrade==='function') window.cnmiV313.openTrade(id);
      else if(typeof window.cnmiV312?.openTrade==='function') window.cnmiV312.openTrade(id);
      else throw new Error('trade function not ready');
      forceModalSoon();
      setTimeout(forceModalSoon,160);
    }catch(error){
      console.error(`[${VERSION}] trade open failed`,error);
      toast('เปิดหน้าขายเวรไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }
  function openEdit(button){
    const id=String(button?.getAttribute?.('data-edit-ot')||'').trim();
    if(!id) return toast('ไม่พบรายการ OT ที่ต้องการแก้ไข');
    if(button.disabled || button.hasAttribute('disabled')) return toast(button.title || 'รายการนี้ยังแก้ไขไม่ได้');
    try{
      const custom=window.cnmiV314?.openEditOt;
      if(typeof custom==='function') custom(id);
      else{
        const fn=window.openEditOtModal || window.openEditModal;
        if(typeof fn!=='function') throw new Error('edit function not ready');
        fn(id);
      }
      forceModalSoon();
    }catch(error){
      console.error(`[${VERSION}] OT edit open failed`,error);
      toast('เปิดหน้าต่างแก้ไข OT ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }
  function runCh4(button,type){
    const attrs={self:'data-v234-ch4-self',cover:'data-v234-ch4-cover',noClaim:'data-v234-ch4-no-claim'};
    const oldAttrs={self:'data-ch4-self',cover:'data-ch4-cover'};
    const key=String(button?.getAttribute?.(attrs[type]) || button?.getAttribute?.(oldAttrs[type]) || '').trim();
    if(!key) return toast('ไม่พบรายการ ช4 ที่ต้องการจัดการ');
    const fn=window.cnmiV314?.runCh4Action;
    if(typeof fn!=='function') return toast('ระบบจัดการ ช4 ยังโหลดไม่สมบูรณ์ กรุณารีเฟรชหน้า');
    Promise.resolve(fn(type,key)).catch(error=>{
      console.error(`[${VERSION}] CH4 action failed`,error);
      toast(error?.message || 'จัดการสถานะ ช4 ไม่สำเร็จ');
    });
  }
  function actionFor(target){
    if(target?.nodeType===3) target=target.parentElement;
    if(!target?.closest) return null;
    const trade=target.closest('[data-trade-duty],[data-v313-trade-id],[data-v312-trade-id]');
    if(trade){
      const id=trade.getAttribute('data-trade-duty') || trade.getAttribute('data-v313-trade-id') || trade.getAttribute('data-v312-trade-id') || '';
      return {type:'trade',key:`trade:${id}`,node:trade};
    }
    const calendar=target.closest('[data-day-detail]');
    if(calendar) return {type:'calendar',key:`calendar:${calendar.getAttribute('data-day-detail')||''}`,node:calendar};
    const edit=target.closest('[data-edit-ot]');
    if(edit) return {type:'edit',key:`edit:${edit.getAttribute('data-edit-ot')||''}`,node:edit};
    const self=target.closest('[data-v234-ch4-self],[data-ch4-self]');
    if(self) return {type:'ch4-self',key:`ch4-self:${self.getAttribute('data-v234-ch4-self')||self.getAttribute('data-ch4-self')||''}`,node:self};
    const cover=target.closest('[data-v234-ch4-cover],[data-ch4-cover]');
    if(cover) return {type:'ch4-cover',key:`ch4-cover:${cover.getAttribute('data-v234-ch4-cover')||cover.getAttribute('data-ch4-cover')||''}`,node:cover};
    const noClaim=target.closest('[data-v234-ch4-no-claim]');
    if(noClaim) return {type:'ch4-no-claim',key:`ch4-no-claim:${noClaim.getAttribute('data-v234-ch4-no-claim')||''}`,node:noClaim};
    return null;
  }
  function execute(event,action){
    if(!action) return false;
    const now=Date.now();
    if(action.key===lastKey && now-lastAt<900){stop(event);return true;}
    lastKey=action.key;
    lastAt=now;
    stop(event);
    if(action.type==='trade') openTrade(action.node);
    else if(action.type==='calendar') openCalendar(action.node.getAttribute('data-day-detail'));
    else if(action.type==='edit') openEdit(action.node);
    else if(action.type==='ch4-self') runCh4(action.node,'self');
    else if(action.type==='ch4-cover') runCh4(action.node,'cover');
    else if(action.type==='ch4-no-claim') runCh4(action.node,'noClaim');
    return true;
  }

  window.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse') return;
    const action=actionFor(event.target);
    if(!action) return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,action,moved:false});
  },true);
  window.addEventListener('pointermove',event=>{
    const start=pointers.get(event.pointerId);
    if(start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>24) start.moved=true;
  },true);
  window.addEventListener('pointerup',event=>{
    if(event.pointerType==='mouse') return;
    const start=pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if(!start || start.moved) return;
    const target=document.elementFromPoint(event.clientX,event.clientY);
    execute(event,actionFor(target)||start.action);
  },true);
  window.addEventListener('pointercancel',event=>pointers.delete(event.pointerId),true);
  window.addEventListener('click',event=>execute(event,actionFor(event.target)),true);
  window.addEventListener('keydown',event=>{
    if(event.key!=='Enter' && event.key!==' ') return;
    execute(event,actionFor(event.target));
  },true);

  window.__cnmiV315Preload={openCalendar,openTrade,showModalDom,toast,stateSafe};
  console.info(`[${VERSION}] loaded`);
})();
