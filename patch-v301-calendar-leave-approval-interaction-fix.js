/* V301 Calendar + leave-cancellation interaction recovery
   - Opens full Calendar day details reliably on iPhone/iPad/Android and desktop.
   - Restores Admin approve/reject cancellation buttons.
   - Uses window-capture before the older V296 handler, with a pointer fallback
     for installed PWA/mobile browsers that occasionally suppress synthetic click.
   - Keeps the existing Supabase functions and approval workflow unchanged.
*/
(function(){
  'use strict';

  const VERSION = 'V301_CALENDAR_LEAVE_APPROVAL_INTERACTION_FIX';
  const ACTION_SELECTOR = [
    '[data-day-detail]',
    '[data-approve-cancel-leave]',
    '[data-reject-cancel-leave]'
  ].join(',');

  let lastActionKey = '';
  let lastActionAt = 0;
  const pointerStarts = new Map();

  function esc(value){
    try {
      if (typeof window.escapeHtml === 'function') return window.escapeHtml(value == null ? '' : String(value));
      if (typeof escapeHtml === 'function') return escapeHtml(value == null ? '' : String(value));
    } catch (_) {}
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function closestAction(target){
    if (!target) return null;
    if (target.nodeType === 3) target = target.parentElement;
    try { return target.closest?.(ACTION_SELECTOR) || null; }
    catch (_) { return null; }
  }

  function stopEvent(event){
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
    try { event.stopImmediatePropagation?.(); } catch (_) {}
  }

  function toast(message, tone='error'){
    try {
      const fn = window.showToast || (typeof showToast === 'function' ? showToast : null);
      if (typeof fn === 'function') return fn(message, { tone });
    } catch (_) {}
    console[tone === 'error' ? 'error' : 'log'](`[${VERSION}] ${message}`);
  }

  function forceShowModal(html, opts={}){
    try {
      const fn = window.showModal || (typeof showModal === 'function' ? showModal : null);
      if (typeof fn === 'function') {
        fn(html, opts);
        const modal = document.getElementById('modal');
        if (modal && !modal.classList.contains('hidden')) return true;
      }
    } catch (error) {
      console.warn(`[${VERSION}] normal showModal failed; using DOM fallback`, error);
    }

    try {
      const modal = document.getElementById('modal');
      const body = document.getElementById('modalBody');
      if (!modal || !body) throw new Error('modal container not found');
      body.innerHTML = html;
      modal.classList.remove('hidden', 'modal-closing');
      modal.classList.toggle('modal-sm', !!opts.small);
      modal.classList.toggle('modal-lg', !!opts.large);
      modal.classList.add('modal-ready');
      document.body.classList.add('modal-open');
      const card = modal.querySelector('.modal-card');
      if (card) card.scrollTop = 0;
      return true;
    } catch (error) {
      console.error(`[${VERSION}] modal fallback failed`, error);
      return false;
    }
  }

  function calendarEventsFor(date){
    try {
      const fn = window.collectCalendarEvents || (typeof collectCalendarEvents === 'function' ? collectCalendarEvents : null);
      const rows = typeof fn === 'function' ? fn() : [];
      return (Array.isArray(rows) ? rows : []).filter(row => String(row?.date || '').slice(0,10) === date);
    } catch (error) {
      console.warn(`[${VERSION}] collectCalendarEvents failed`, error);
      return [];
    }
  }

  function renderCalendarRow(row){
    try {
      const fn = window.renderCalendarModalRow || (typeof renderCalendarModalRow === 'function' ? renderCalendarModalRow : null);
      if (typeof fn === 'function') return fn(row);
    } catch (_) {}
    const title = row?.title || row?.name || row?.type || '-';
    return `<div class="calendar-modal-row"><div class="event-title"><b>${esc(title)}</b></div></div>`;
  }

  function thaiDate(date){
    try {
      const fn = window.formatThaiDate || (typeof formatThaiDate === 'function' ? formatThaiDate : null);
      if (typeof fn === 'function') return fn(date);
    } catch (_) {}
    return date;
  }

  function openCalendarDayV301(rawDate){
    const date = String(rawDate || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast('ไม่พบวันที่ที่ต้องการเปิด กรุณารีเฟรชหน้าแล้วลองใหม่');
      return;
    }

    try {
      const events = calendarEventsFor(date);
      const body = events.length
        ? events.map(renderCalendarRow).join('')
        : '<div class="empty-state">ไม่มีรายการในวันนี้</div>';
      const ok = forceShowModal(
        `<h2>${esc(thaiDate(date))}</h2><div class="calendar-modal-list">${body}</div>`,
        { large:false }
      );
      if (!ok) throw new Error('cannot display calendar modal');
    } catch (error) {
      console.error(`[${VERSION}] calendar details failed`, error);
      toast('เปิดรายละเอียด Calendar ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง');
    }
  }

  async function runLeaveCancellationAction(button, action){
    const attr = action === 'approve' ? 'data-approve-cancel-leave' : 'data-reject-cancel-leave';
    const id = String(button.getAttribute(attr) || '').trim();
    if (!id) return toast('ไม่พบรหัสรายการ กรุณารีเฟรชหน้าแล้วลองใหม่');

    const fnName = action === 'approve' ? 'approveCancelLeave' : 'rejectCancelLeave';
    let fn = null;
    try {
      fn = window[fnName] || (fnName === 'approveCancelLeave'
        ? (typeof approveCancelLeave === 'function' ? approveCancelLeave : null)
        : (typeof rejectCancelLeave === 'function' ? rejectCancelLeave : null));
    } catch (_) {}

    if (typeof fn !== 'function') {
      toast('ระบบอนุมัติยังโหลดไม่สมบูรณ์ กรุณารีเฟรชหน้าแล้วลองใหม่');
      return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await fn(id);
    } catch (error) {
      console.error(`[${VERSION}] ${fnName} failed`, error);
      toast(error?.message || 'ดำเนินการอนุมัติไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    }
  }

  function actionKey(target){
    if (target.hasAttribute('data-day-detail')) return `calendar:${target.getAttribute('data-day-detail') || ''}`;
    if (target.hasAttribute('data-approve-cancel-leave')) return `approve:${target.getAttribute('data-approve-cancel-leave') || ''}`;
    if (target.hasAttribute('data-reject-cancel-leave')) return `reject:${target.getAttribute('data-reject-cancel-leave') || ''}`;
    return '';
  }

  function handleAction(event, target){
    const key = actionKey(target);
    if (!key) return false;

    const now = Date.now();
    if (key === lastActionKey && now - lastActionAt < 900) {
      stopEvent(event);
      return true;
    }
    lastActionKey = key;
    lastActionAt = now;
    stopEvent(event);

    if (target.hasAttribute('data-day-detail')) {
      openCalendarDayV301(target.getAttribute('data-day-detail'));
      return true;
    }
    if (target.hasAttribute('data-approve-cancel-leave')) {
      void runLeaveCancellationAction(target, 'approve');
      return true;
    }
    if (target.hasAttribute('data-reject-cancel-leave')) {
      void runLeaveCancellationAction(target, 'reject');
      return true;
    }
    return false;
  }

  /* Load this patch immediately before V296. Therefore this window-capture
     handler runs first and avoids the old handler swallowing Calendar taps. */
  window.addEventListener('click', function(event){
    const target = closestAction(event.target);
    if (target) handleAction(event, target);
  }, true);

  /* Mobile/PWA fallback: some iOS WebKit sessions lose the synthetic click
     after a long scroll. A short, non-drag pointer tap still performs the action. */
  window.addEventListener('pointerdown', function(event){
    const target = closestAction(event.target);
    if (!target || event.pointerType === 'mouse') return;
    pointerStarts.set(event.pointerId, {
      x: Number(event.clientX || 0),
      y: Number(event.clientY || 0),
      target
    });
  }, true);

  window.addEventListener('pointerup', function(event){
    if (event.pointerType === 'mouse') return;
    const start = pointerStarts.get(event.pointerId);
    pointerStarts.delete(event.pointerId);
    if (!start) return;
    const dx = Number(event.clientX || 0) - start.x;
    const dy = Number(event.clientY || 0) - start.y;
    if (Math.hypot(dx, dy) > 14) return;
    const target = closestAction(event.target) || start.target;
    if (target) handleAction(event, target);
  }, true);

  window.addEventListener('pointercancel', function(event){
    pointerStarts.delete(event.pointerId);
  }, true);

  console.info(`[${VERSION}] loaded`);
})();
