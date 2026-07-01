/* CNMI Staff Planner V309
   - Reliable Calendar day popup on mobile/PWA and desktop.
   - Reliable monthly roster sell-duty popup.
   - Reliable monthly daytime-position duty detail popup.
   - Removes the redundant daily-position detail button while keeping duty text visible.
   - Removes the unused standalone monthly Ch4-status card / SQL warning.
   - Repairs the daily Slot comparison display when trainee/Intern staff are excluded.
*/
(function(){
  'use strict';

  const VERSION = 'V309_POPUP_INTERACTION_CLEANUP';
  if (window.__CNMI_V309_POPUP_INTERACTION_CLEANUP__) return;
  window.__CNMI_V309_POPUP_INTERACTION_CLEANUP__ = true;

  const pointerStarts = new Map();
  let lastActionKey = '';
  let lastActionAt = 0;
  let enhanceQueued = false;

  function esc(value){
    try {
      const fn = window.escapeHtml || (typeof escapeHtml === 'function' ? escapeHtml : null);
      if (typeof fn === 'function') return fn(value == null ? '' : String(value));
    } catch (_) {}
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }

  function toast(message, tone='error'){
    try {
      const fn = window.showToast || (typeof showToast === 'function' ? showToast : null);
      if (typeof fn === 'function') return fn(message, { tone });
    } catch (_) {}
    console[tone === 'error' ? 'error' : 'log'](`[${VERSION}] ${message}`);
  }

  function stopEvent(event){
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
    try { event.stopImmediatePropagation?.(); } catch (_) {}
  }

  function forceModalVisible(html, opts={}){
    const modal = document.getElementById('modal');
    const body = document.getElementById('modalBody');
    if (!modal || !body) return false;
    if (typeof html === 'string') body.innerHTML = html;
    if (window.__modalCloseTimerV193) {
      try { clearTimeout(window.__modalCloseTimerV193); } catch (_) {}
      window.__modalCloseTimerV193 = null;
    }
    modal.classList.remove('hidden', 'modal-closing');
    modal.classList.toggle('modal-sm', !!opts.small);
    modal.classList.toggle('modal-lg', !!opts.large);
    modal.classList.add('modal-ready');
    document.body.classList.add('modal-open');
    const card = modal.querySelector('.modal-card');
    if (card) card.scrollTop = 0;
    return true;
  }

  function openModal(html, opts={}){
    try {
      const fn = window.showModal || (typeof showModal === 'function' ? showModal : null);
      if (typeof fn === 'function') fn(html, opts);
    } catch (error) {
      console.warn(`[${VERSION}] showModal failed; using DOM fallback`, error);
    }
    const ok = forceModalVisible(null, opts);
    if (!ok) return forceModalVisible(html, opts);
    const body = document.getElementById('modalBody');
    if (body && !body.innerHTML.trim()) body.innerHTML = html;
    requestAnimationFrame(() => forceModalVisible(null, opts));
    return true;
  }

  function formatThaiDateSafe(date){
    try {
      const fn = window.formatThaiDate || (typeof formatThaiDate === 'function' ? formatThaiDate : null);
      if (typeof fn === 'function') return fn(date);
    } catch (_) {}
    return date;
  }

  function calendarEvents(date){
    try {
      const fn = window.collectCalendarEvents || (typeof collectCalendarEvents === 'function' ? collectCalendarEvents : null);
      const rows = typeof fn === 'function' ? fn() : [];
      const order = ['ชบด1','ชบด2','ชบด3','ช4','ช3A','ช3B','ช9-เคิก','ช9-MT','ช9'];
      return (Array.isArray(rows) ? rows : [])
        .filter(row => String(row?.date || '').slice(0,10) === date)
        .sort((a,b) => {
          const ac = String(a?.raw?.duty_code || '');
          const bc = String(b?.raw?.duty_code || '');
          const ai = a?.type === 'duty' ? order.findIndex(code => ac === code || ac.startsWith(code)) : 999;
          const bi = b?.type === 'duty' ? order.findIndex(code => bc === code || bc.startsWith(code)) : 999;
          return (ai < 0 ? 998 : ai) - (bi < 0 ? 998 : bi);
        });
    } catch (error) {
      console.warn(`[${VERSION}] collectCalendarEvents failed`, error);
      return [];
    }
  }

  function calendarRow(row){
    try {
      const fn = window.renderCalendarModalRow || (typeof renderCalendarModalRow === 'function' ? renderCalendarModalRow : null);
      if (typeof fn === 'function') return fn(row);
    } catch (_) {}
    return `<div class="calendar-modal-row"><div class="event-title"><b>${esc(row?.title || '-')}</b></div></div>`;
  }

  function openCalendarDay(rawDate){
    const date = String(rawDate || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast('ไม่พบวันที่ที่ต้องการเปิด กรุณารีเฟรชแล้วลองใหม่');
      return;
    }
    const rows = calendarEvents(date);
    const html = `<div class="v309-calendar-modal"><h2>${esc(formatThaiDateSafe(date))}</h2><div class="calendar-modal-list">${rows.length ? rows.map(calendarRow).join('') : '<div class="empty-state">ไม่มีรายการในวันนี้</div>'}</div></div>`;
    if (!openModal(html, { large:false })) toast('เปิดรายละเอียด Calendar ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
  }

  function currentStaffIdSafe(){
    try {
      const fn = window.currentStaffId || (typeof currentStaffId === 'function' ? currentStaffId : null);
      if (typeof fn === 'function') return String(fn() || '');
    } catch (_) {}
    const st = appState();
    return String(st?.profile?.staff_id || st?.user?.staff_id || st?.currentStaffId || '');
  }

  function isAdminSafe(){
    try {
      const fn = window.isAdmin || (typeof isAdmin === 'function' ? isAdmin : null);
      if (typeof fn === 'function') return !!fn();
    } catch (_) {}
    const st = appState();
    return String(st?.role || st?.currentRole || '').toLowerCase() === 'admin';
  }

  function monthDatesSafe(key){
    try {
      const fn = window.scheduleMonthDates || (typeof scheduleMonthDates === 'function' ? scheduleMonthDates : null);
      const rows = typeof fn === 'function' ? fn(key) : [];
      if (Array.isArray(rows) && rows.length) return rows.map(x => String(x).slice(0,10));
    } catch (_) {}
    if (!/^\d{4}-\d{2}$/.test(key)) return [];
    const [year,month] = key.split('-').map(Number);
    const last = new Date(year, month, 0).getDate();
    return Array.from({length:last}, (_,i) => `${key}-${String(i+1).padStart(2,'0')}`);
  }

  function rosterAssignmentsSafe(key){
    try {
      const fn = window.scheduleAssignmentsForMonth || (typeof scheduleAssignmentsForMonth === 'function' ? scheduleAssignmentsForMonth : null);
      const rows = typeof fn === 'function' ? fn(key) : null;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
    return (appState()?.rosterAssignments || []).filter(row => String(row?.duty_date || '').slice(0,7) === key);
  }

  function resolveRowStaffId(row){
    if (!row) return '';
    const direct = row.querySelector('[data-staff-stat]')?.getAttribute('data-staff-stat')
      || row.querySelector('[data-staff-id]')?.getAttribute('data-staff-id');
    if (direct) return String(direct);
    const name = String(row.children?.[0]?.textContent || '').replace(/\s+/g,' ').trim();
    if (!name) return '';
    const staff = appState()?.staff || [];
    const person = staff.find(item => {
      const nick = String(item?.nickname || '').trim();
      const full = String(item?.full_name || '').trim();
      return (nick && name.includes(nick)) || (full && name.includes(full));
    });
    return String(person?.id || '');
  }

  function resolveTradeAssignmentId(button){
    const direct = String(button?.getAttribute?.('data-trade-duty') || '').trim();
    if (direct) return direct;
    if (!button?.closest) return '';
    const row = button.closest('tr');
    const cell = button.closest('td,th');
    const table = button.closest('table');
    if (!row || !cell || !table) return '';
    const st = appState();
    const key = String(document.getElementById('scheduleMonthInput')?.value || st?.monthKey || st?.scheduleMonthKey || '').slice(0,7);
    const dates = monthDatesSafe(key);
    if (!dates.length) return '';
    const cellIndex = Array.from(row.children || []).indexOf(cell);
    const offset = Math.max(0, (row.children?.length || 0) - dates.length);
    const date = dates[cellIndex - offset];
    const staffId = resolveRowStaffId(row);
    if (!date || !staffId) return '';
    const rows = rosterAssignmentsSafe(key).filter(item =>
      String(item?.staff_id || '') === staffId && String(item?.duty_date || '').slice(0,10) === date
    );
    if (!rows.length) return '';
    const pillText = String(button.textContent || '').replace(/\s+/g,'').trim();
    let matched = rows.find(item => {
      let label = String(item?.duty_code || '');
      try {
        const fn = window.dutyDisplayLabel || (typeof dutyDisplayLabel === 'function' ? dutyDisplayLabel : null);
        if (typeof fn === 'function') label = String(fn(item?.duty_code) || label);
      } catch (_) {}
      return label.replace(/\s+/g,'') === pillText;
    });
    if (!matched) {
      const pills = Array.from(cell.querySelectorAll('.clean-shift-pill,[data-trade-duty]'));
      const index = Math.max(0, pills.indexOf(button));
      matched = rows[index] || rows[0];
    }
    if (!matched) return '';
    if (!isAdminSafe() && String(matched.staff_id || '') !== currentStaffIdSafe()) return '';
    button.setAttribute('data-trade-duty', String(matched.id || ''));
    return String(matched.id || '');
  }

  function openTradePopup(button){
    const id = resolveTradeAssignmentId(button);
    if (!id) {
      toast('ไม่พบรายการเวรของช่องนี้ กรุณากดรีเฟรชแล้วลองใหม่');
      return;
    }
    try {
      const fn = window.showTradeModal || (typeof showTradeModal === 'function' ? showTradeModal : null);
      if (typeof fn !== 'function') throw new Error('ไม่พบฟังก์ชันขายเวร');
      fn(id);
      setTimeout(() => forceModalVisible(null, { large:false }), 0);
    } catch (error) {
      console.error(`[${VERSION}] trade popup failed`, error);
      toast('เปิดหน้าขายเวรไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }

  function positionMaster(code){
    const value = String(code || '').trim();
    const st = appState();
    const catalog = Array.isArray(st?.positionMasters) ? st.positionMasters : [];
    let row = catalog.find(item => String(item?.code || item?.position_code || '').trim() === value);
    if (!row) {
      row = (st?.positions || []).find(item => String(item?.position_code || item?.code || '').trim() === value);
    }
    if (!row) {
      try {
        const list = window.DEFAULT_DAILY_POSITIONS || (typeof DEFAULT_DAILY_POSITIONS !== 'undefined' ? DEFAULT_DAILY_POSITIONS : []);
        row = (Array.isArray(list) ? list : []).find(item => String(item?.code || '').trim() === value);
      } catch (_) {}
    }
    return row || {};
  }

  function openPositionDetail(button){
    const code = String(button?.getAttribute?.('data-v275-job') || button?.getAttribute?.('data-v273-job-code') || '').trim();
    if (!code) return;
    const row = positionMaster(code);
    const zone = row?.zone || '-';
    const breakTime = row?.break_time || '-';
    const rule = row?.main_rule || '-';
    const job = row?.job_desc || row?.description || 'ยังไม่ได้ระบุรายละเอียดหน้าที่';
    openModal(`<div class="v309-position-detail-modal"><h2>${esc(code)}</h2><div class="v309-position-meta"><span><small>โซน</small><b>${esc(zone)}</b></span><span><small>เวลาพัก</small><b>${esc(breakTime)}</b></span></div><div class="v309-position-box"><h3>ผู้ปฏิบัติหลัก / เงื่อนไข</h3><p>${esc(rule)}</p></div><div class="v309-position-box"><h3>รายละเอียดหน้าที่</h3><p>${esc(job)}</p></div></div>`, { large:false });
  }

  function dailyDetailButton(target){
    return target?.closest?.('[data-v296-position-detail],[data-v226-position-detail],[data-v225-position-detail],[data-position-detail-v219]') || null;
  }

  function actionTarget(target){
    if (!target) return null;
    if (target.nodeType === 3) target = target.parentElement;
    if (!target?.closest) return null;
    const calendar = target.closest('[data-day-detail]');
    if (calendar) return { type:'calendar', target:calendar, key:`calendar:${calendar.getAttribute('data-day-detail') || ''}` };
    const position = target.closest('[data-v275-job],[data-v273-job-code]');
    if (position) {
      const code = position.getAttribute('data-v275-job') || position.getAttribute('data-v273-job-code') || '';
      return { type:'position', target:position, key:`position:${code}` };
    }
    const daily = dailyDetailButton(target);
    if (daily) return { type:'daily-detail-remove', target:daily, key:'daily-detail-remove' };
    const directTrade = target.closest('[data-trade-duty]');
    if (directTrade) {
      const id = directTrade.getAttribute('data-trade-duty') || '';
      return { type:'trade', target:directTrade, key:`trade:${id || String(directTrade.textContent || '').trim()}` };
    }
    const trade = target.closest('.clean-schedule-page .clean-shift-pill,.v160-schedule-grid .clean-shift-pill');
    if (trade) {
      const rowStaffId = resolveRowStaffId(trade.closest('tr'));
      if (isAdminSafe() || (rowStaffId && rowStaffId === currentStaffIdSafe())) {
        return { type:'trade', target:trade, key:`trade:${rowStaffId}:${String(trade.textContent || '').trim()}` };
      }
    }
    return null;
  }

  function executeAction(event, action){
    if (!action) return false;
    const now = Date.now();
    if (action.key === lastActionKey && now - lastActionAt < 850) {
      stopEvent(event);
      return true;
    }
    lastActionKey = action.key;
    lastActionAt = now;
    stopEvent(event);
    if (action.type === 'calendar') openCalendarDay(action.target.getAttribute('data-day-detail'));
    else if (action.type === 'position') openPositionDetail(action.target);
    else if (action.type === 'trade') openTradePopup(action.target);
    else if (action.type === 'daily-detail-remove') action.target.remove();
    return true;
  }

  /* This script loads immediately after app.js and before older popup patches,
     so its window-capture handler gets the first chance to handle mobile taps. */
  window.addEventListener('click', event => {
    const action = actionTarget(event.target);
    if (action) executeAction(event, action);
  }, true);

  window.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    const action = actionTarget(event.target);
    if (!action) return;
    pointerStarts.set(event.pointerId, {
      x:Number(event.clientX || 0), y:Number(event.clientY || 0), action
    });
  }, true);

  window.addEventListener('pointerup', event => {
    if (event.pointerType === 'mouse') return;
    const start = pointerStarts.get(event.pointerId);
    pointerStarts.delete(event.pointerId);
    if (!start) return;
    const dx = Number(event.clientX || 0) - start.x;
    const dy = Number(event.clientY || 0) - start.y;
    if (Math.hypot(dx,dy) > 14) return;
    const current = actionTarget(event.target);
    executeAction(event, current || start.action);
  }, true);

  window.addEventListener('pointercancel', event => pointerStarts.delete(event.pointerId), true);

  function removeDailyDetailButtons(root=document){
    root.querySelectorAll?.('[data-v296-position-detail],[data-v226-position-detail],[data-v225-position-detail],[data-position-detail-v219]').forEach(button => {
      const actions = button.closest('.actions');
      button.remove();
      if (actions && !actions.children.length) actions.remove();
    });
  }

  function removeUnusedCh4Cards(root=document){
    root.querySelectorAll?.('.v234-ch4-shared-card,.v209-admin-ch4-card').forEach(card => card.remove());
    root.querySelectorAll?.('.card').forEach(card => {
      const heading = card.querySelector('h2,h3');
      const text = String(heading?.textContent || '').replace(/\s+/g,' ').trim();
      if (/^สถานะ\s*ช4\s*\/\s*งานปั่นเลือด(?:\s*รายเดือน)?$/.test(text)) card.remove();
    });
  }

  function numberFrom(node){
    const match = String(node?.textContent || '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function countedStaffForSlot(date, fallback){
    try {
      const fn = window.cnmiV227?.slotCountedWorkingStaffToday || window.cnmiV226?.slotCountedWorkingStaffToday;
      const rows = typeof fn === 'function' ? fn(date) : null;
      if (Array.isArray(rows)) return rows.length;
    } catch (_) {}
    return fallback;
  }

  function repairDailySlotPanel(root=document){
    const st = appState();
    if (st?.page && st.page !== 'positions') return;
    const panel = root.querySelector?.('.v225-daily-compare-panel,.v226-daily-compare-panel');
    if (!panel) return;
    const cards = panel.querySelector('.v225-compare-cards');
    if (!cards) return;
    const items = Array.from(cards.children);
    const date = String(document.getElementById('positionDateInput')?.value || st?.positionDate || '').slice(0,10);
    if (!date) return;

    let total = 0, plan = 0, slots = 0;
    if (items.length >= 5) {
      total = numberFrom(items[0].querySelector('b,strong'));
      plan = numberFrom(items[2].querySelector('b,strong'));
      slots = numberFrom(items[3].querySelector('b,strong'));
    } else if (items.length >= 4) {
      total = numberFrom(items[0].querySelector('b,strong'));
      plan = numberFrom(items[1].querySelector('b,strong'));
      slots = numberFrom(items[2].querySelector('b,strong'));
    } else return;

    const counted = countedStaffForSlot(date, total);
    const excluded = Math.max(0, total - counted);
    const diff = counted - slots;
    cards.classList.add('v308-five-cards','v309-five-cards');
    const signature = `${total}|${counted}|${plan}|${slots}|${excluded}`;
    if (cards.dataset.v309Signature !== signature) {
      cards.dataset.v309Signature = signature;
      cards.innerHTML = `<div><b>${total}</b><span>คนอยู่จริงทั้งหมด</span></div><div><b>${counted}</b><span>คนที่นับเป็น Slot</span></div><div><b>${plan}</b><span>คนในแผนตั้งต้น</span></div><div><b>${slots}</b><span>Slot วันนี้</span></div><div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`}</b><span>เทียบคนที่นับ Slot</span></div>`;
    }

    let note = panel.querySelector('.v309-trainee-note');
    if (excluded > 0) {
      if (!note) {
        note = document.createElement('div');
        note.className = 'notice soft-notice compact v309-trainee-note';
        const toolbar = panel.querySelector('.v225-daily-slot-toolbar');
        if (toolbar) toolbar.insertAdjacentElement('beforebegin', note);
        else cards.insertAdjacentElement('afterend', note);
      }
      const noteHtml = `<b>น้องใหม่/Intern ${excluded} คน:</b> แสดงในจำนวนคนอยู่จริง แต่ไม่นำมาคำนวณ Slot`;
      if (note.innerHTML !== noteHtml) note.innerHTML = noteHtml;
    } else if (note) note.remove();
  }

  function enhance(root=document){
    removeDailyDetailButtons(root);
    removeUnusedCh4Cards(root);
    repairDailySlotPanel(root);
  }

  function queueEnhance(){
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      enhance(document);
    });
  }

  const style = document.createElement('style');
  style.id = 'v309-popup-interaction-cleanup-style';
  style.textContent = `
    [data-v296-position-detail],[data-v226-position-detail],[data-v225-position-detail],[data-position-detail-v219]{display:none!important}
    .v234-ch4-shared-card,.v209-admin-ch4-card{display:none!important}
    .v309-position-detail-modal h2,.v309-calendar-modal h2{margin:0 0 14px}
    .v309-position-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}
    .v309-position-meta>span,.v309-position-box{padding:13px;border:1px solid #dbe7f3;border-radius:15px;background:#f8fbff}
    .v309-position-meta small{display:block;color:#64748b;margin-bottom:3px}
    .v309-position-meta b{color:#17324d}
    .v309-position-box{margin-top:10px;background:#fff}
    .v309-position-box h3{margin:0 0 6px;color:#17324d}
    .v309-position-box p{margin:0;white-space:pre-wrap;line-height:1.65;color:#334155}
    .v309-five-cards{grid-template-columns:repeat(5,minmax(105px,1fr))!important}
    .v309-trainee-note{margin-top:10px!important;border-color:#fed7aa!important;background:#fff7ed!important;color:#9a3412!important}
    @media(max-width:980px){.v309-five-cards{grid-template-columns:repeat(3,minmax(105px,1fr))!important}}
    @media(max-width:760px){.v309-five-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}.v309-position-meta{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(queueEnhance);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', queueEnhance, { once:true });
  window.addEventListener('pageshow', queueEnhance);
  window.addEventListener('resize', queueEnhance);
  queueEnhance();

  window.cnmiV309 = {
    openCalendarDay,
    openTradePopup,
    openPositionDetail,
    enhance,
    repairDailySlotPanel
  };
  console.info(`[${VERSION}] loaded`);
})();
