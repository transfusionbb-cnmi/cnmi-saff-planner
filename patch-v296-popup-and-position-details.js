/* V296 Popup interaction recovery + daily position duty details
   1) Restores Calendar day-detail popup on mobile/desktop.
   2) Restores duty sell-request popup from the monthly roster.
   3) Shows what each daily position is responsible for, with a full-detail popup.
*/
(function(){
  'use strict';

  const VERSION = 'V296_POPUP_AND_POSITION_DETAILS';

  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
      }[ch]));
    }
  }

  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console[tone === 'error' ? 'error' : 'log'](message); }
  }

  function currentId(){
    try { return String(currentStaffId() || ''); }
    catch (_) { return String(state?.user?.staff_id || state?.profile?.staff_id || ''); }
  }

  function admin(){
    try { return !!isAdmin(); }
    catch (_) { return String(state?.role || state?.currentRole || '').toLowerCase() === 'admin'; }
  }

  /* The old function used strict equality. Supabase IDs can arrive as either
     strings or typed values, so use normalized string comparison. */
  const previousCanRequestTrade = window.canRequestTrade || (typeof canRequestTrade === 'function' ? canRequestTrade : null);
  const canRequestTradeV296 = function(slot){
    if (!slot?.id || !slot?.staff_id) return false;
    if (admin()) return true;
    return String(slot.staff_id) === currentId();
  };
  window.canRequestTrade = canRequestTradeV296;
  try { canRequestTrade = canRequestTradeV296; } catch (_) {}

  function openCalendarDay(date){
    const key = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    try {
      if (typeof showDayDetail === 'function') {
        showDayDetail(key);
        return;
      }
    } catch (error) {
      console.warn(`${VERSION}: showDayDetail fallback`, error);
    }

    try {
      const events = (typeof collectCalendarEvents === 'function' ? collectCalendarEvents() : [])
        .filter(item => String(item?.date || '').slice(0,10) === key);
      const title = typeof formatThaiDate === 'function' ? formatThaiDate(key) : key;
      const body = events.length
        ? events.map(item => typeof renderCalendarModalRow === 'function'
          ? renderCalendarModalRow(item)
          : `<div class="calendar-modal-row"><b>${esc(item?.title || '-')}</b></div>`).join('')
        : '<div class="empty-state">ไม่มีรายการในวันนี้</div>';
      showModal(`<h2>${esc(title)}</h2><div class="calendar-modal-list">${body}</div>`);
    } catch (error) {
      console.error(`${VERSION}: calendar popup failed`, error);
      toast('เปิดรายละเอียด Calendar ไม่สำเร็จ กรุณากดรีเฟรชแล้วลองอีกครั้ง', 'error');
    }
  }

  function openTrade(assignmentId){
    const id = String(assignmentId || '').trim();
    if (!id) return;
    try {
      const fn = window.showTradeModal || (typeof showTradeModal === 'function' ? showTradeModal : null);
      if (typeof fn !== 'function') throw new Error('ไม่พบฟังก์ชันขายเวร');
      fn(id);
    } catch (error) {
      console.error(`${VERSION}: trade popup failed`, error);
      toast('เปิดหน้าขายเวรไม่สำเร็จ กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง', 'error');
    }
  }

  function dailyRows(){
    return Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__)
      ? window.__CNMI_V226_DAILY_POSITION_ROWS__
      : Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__)
        ? window.__CNMI_V225_DAILY_POSITION_ROWS__
        : [];
  }

  function positionLabel(row){
    const code = row?.position_code || row?.code || 'ตำแหน่ง';
    try { return labelCode(code); }
    catch (_) { return String(code); }
  }

  function positionZone(row){
    try { return zoneOf(row) || row?.zone || '-'; }
    catch (_) { return row?.zone || '-'; }
  }

  function openPositionDetail(index){
    const row = dailyRows()[Number(index)];
    if (!row) {
      toast('ไม่พบรายละเอียดตำแหน่งนี้ กรุณารีเฟรชหน้า', 'error');
      return;
    }
    const job = String(row.job_desc || row.description || '').trim() || 'ยังไม่ได้ระบุรายละเอียดหน้าที่';
    const rule = String(row.main_rule || '-');
    const breakTime = String(row.break_time || '-');
    showModal(`
      <div class="v296-position-modal">
        <h2>${esc(positionLabel(row))}</h2>
        <div class="v296-position-meta">
          <span class="badge blue">${esc(positionZone(row))}</span>
          <span>พัก ${esc(breakTime)}</span>
        </div>
        <div class="v296-position-section">
          <h3>ผู้ปฏิบัติหลัก / เงื่อนไข</h3>
          <p>${esc(rule)}</p>
        </div>
        <div class="v296-position-section v296-position-job-full">
          <h3>รายละเอียดหน้าที่ที่ต้องทำ</h3>
          <p>${esc(job)}</p>
        </div>
      </div>
    `, { large:false });
  }

  function enhanceDailyPositionDetails(root=document){
    const page = root.querySelector?.('.v225-positions-page, .v226-positions-page');
    if (!page) return;
    const rows = dailyRows();

    page.querySelectorAll('[data-v226-position-detail], [data-v225-position-detail], [data-position-detail-v219]').forEach(button => {
      const rawIndex = button.getAttribute('data-v226-position-detail')
        ?? button.getAttribute('data-v225-position-detail')
        ?? button.getAttribute('data-position-detail-v219');
      const index = Number(rawIndex);
      const row = rows[index];

      button.classList.remove('v265-description-hidden');
      button.style.removeProperty('display');
      if (button.textContent.trim() !== 'ดูรายละเอียดทั้งหมด') button.textContent = 'ดูรายละเอียดทั้งหมด';
      button.setAttribute('data-v296-position-detail', String(index));

      const card = button.closest('.v225-position-card, .v219-position-card, .position-mobile-card');
      if (card && row && !card.querySelector('.v296-position-duty-preview')) {
        const job = String(row.job_desc || row.description || '').trim() || 'ยังไม่ได้ระบุรายละเอียดหน้าที่';
        const preview = document.createElement('div');
        preview.className = 'v296-position-duty-preview';
        preview.innerHTML = `<b>หน้าที่:</b><span>${esc(job)}</span>`;
        const actions = button.closest('.actions');
        if (actions) actions.insertAdjacentElement('beforebegin', preview);
        else card.appendChild(preview);
      }
    });

    page.querySelectorAll('.v225-job-short, .v219-job-short').forEach(node => {
      node.classList.remove('v265-description-hidden');
      node.style.removeProperty('display');
    });
    page.querySelectorAll('.daily-position-table th:last-child, .daily-position-table td:last-child').forEach(node => {
      node.classList.remove('v265-description-hidden');
      node.style.removeProperty('display');
    });
  }

  function resolveTradeTargetFromTable(button){
    if (!button || button.dataset.tradeDuty) return button?.dataset?.tradeDuty || '';
    if (!button.classList.contains('clean-shift-pill')) return '';

    try {
      const row = button.closest('tr');
      const cell = button.closest('td');
      const table = button.closest('table');
      if (!row || !cell || !table) return '';
      const ownerButton = row.querySelector('th [data-staff-stat], th[data-staff-stat]');
      const staffId = ownerButton?.dataset?.staffStat || '';
      const cellIndex = Array.from(row.children).indexOf(cell);
      const key = String(state?.monthKey || '').slice(0,7);
      const dates = typeof scheduleMonthDates === 'function' ? scheduleMonthDates(key) : [];
      const date = dates[cellIndex - 1];
      if (!staffId || !date) return '';

      const assignments = typeof scheduleAssignmentsForMonth === 'function'
        ? scheduleAssignmentsForMonth(key)
        : (state?.rosterAssignments || []).filter(item => String(item?.duty_date || '').startsWith(key));
      const sameCell = assignments.filter(item =>
        String(item?.staff_id || '') === String(staffId) &&
        String(item?.duty_date || '').slice(0,10) === date
      ).sort((a,b) => {
        try { return dutySortIndex(a?.duty_code) - dutySortIndex(b?.duty_code); }
        catch (_) { return String(a?.duty_code || '').localeCompare(String(b?.duty_code || '')); }
      });
      const pillIndex = Array.from(cell.querySelectorAll('.clean-shift-pill')).indexOf(button);
      const assignment = sameCell[pillIndex] || sameCell[0];
      if (!assignment || !canRequestTradeV296(assignment)) return '';
      button.dataset.tradeDuty = String(assignment.id);
      return String(assignment.id);
    } catch (_) {
      return '';
    }
  }

  function enhanceScheduleTargets(root=document){
    const page = root.querySelector?.('.clean-schedule-page');
    if (!page) return;
    page.querySelectorAll('.clean-shift-pill').forEach(button => {
      const id = resolveTradeTargetFromTable(button);
      if (id) {
        button.classList.add('v296-trade-ready');
        button.setAttribute('title', 'แตะเพื่อเปิดขายเวร / เบิก OT ผ่าน HR');
      }
    });
  }

  let queued = false;
  function queueEnhance(){
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceDailyPositionDetails(document);
      enhanceScheduleTargets(document);
    });
  }

  /* Window capture fires before the older document/body handlers that were
     swallowing these taps on iOS Safari. */
  window.addEventListener('click', function(event){
    const calendarTarget = event.target?.closest?.('[data-day-detail]');
    if (calendarTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openCalendarDay(calendarTarget.getAttribute('data-day-detail'));
      return;
    }

    const detailTarget = event.target?.closest?.('[data-v296-position-detail], [data-v226-position-detail], [data-v225-position-detail], [data-position-detail-v219]');
    if (detailTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const index = detailTarget.getAttribute('data-v296-position-detail')
        ?? detailTarget.getAttribute('data-v226-position-detail')
        ?? detailTarget.getAttribute('data-v225-position-detail')
        ?? detailTarget.getAttribute('data-position-detail-v219');
      openPositionDetail(index);
      return;
    }

    const directTrade = event.target?.closest?.('[data-trade-duty]');
    if (directTrade) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openTrade(directTrade.getAttribute('data-trade-duty'));
      return;
    }

    const shiftPill = event.target?.closest?.('.clean-schedule-page .clean-shift-pill');
    if (shiftPill) {
      const assignmentId = resolveTradeTargetFromTable(shiftPill);
      if (assignmentId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openTrade(assignmentId);
      }
    }
  }, true);

  const observer = new MutationObserver(queueEnhance);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', queueEnhance, { once:true });
  queueEnhance();

  try {
    const style = document.createElement('style');
    style.id = 'v296-popup-position-detail-style';
    style.textContent = `
      .v226-positions-page .daily-position-table th:last-child,
      .v226-positions-page .daily-position-table td:last-child,
      .v225-positions-page .daily-position-table th:last-child,
      .v225-positions-page .daily-position-table td:last-child{display:table-cell!important;min-width:220px}
      .v226-positions-page [data-v226-position-detail],
      .v225-positions-page [data-v225-position-detail],
      .v219-positions-page [data-position-detail-v219],
      .v225-position-card [data-v226-position-detail],
      .v225-position-card [data-v225-position-detail]{display:inline-flex!important;align-items:center;justify-content:center}
      .v226-positions-page .v225-job-short.v265-description-hidden,
      .v225-positions-page .v225-job-short.v265-description-hidden,
      .v219-job-short.v265-description-hidden{display:inline!important}
      .v296-position-duty-preview{margin-top:12px;padding:11px 12px;border:1px solid #d8e7f7;border-radius:14px;background:#f7fbff;color:#334155;line-height:1.55}
      .v296-position-duty-preview b{display:block;color:#16324f;margin-bottom:3px}
      .v296-position-duty-preview span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;white-space:pre-line}
      .v296-position-modal h2{margin-bottom:8px}
      .v296-position-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:#64748b;margin-bottom:14px}
      .v296-position-section{padding:14px;border:1px solid #dbe7f3;border-radius:16px;background:#f8fbff;margin-top:12px}
      .v296-position-section h3{margin:0 0 7px;color:#16324f}
      .v296-position-section p{margin:0;white-space:pre-wrap;line-height:1.65;color:#334155}
      .v296-position-job-full{background:#ffffff}
      .clean-shift-pill.v296-trade-ready{cursor:pointer;box-shadow:0 0 0 1px rgba(37,99,235,.16)}
      @media (max-width:820px){
        .v226-positions-page .daily-position-table th:last-child,
        .v226-positions-page .daily-position-table td:last-child,
        .v225-positions-page .daily-position-table th:last-child,
        .v225-positions-page .daily-position-table td:last-child{min-width:190px}
        .v296-position-duty-preview span{-webkit-line-clamp:4}
      }
    `;
    document.head.appendChild(style);
  } catch (_) {}

  window.cnmiV296 = {
    openCalendarDay,
    openTrade,
    openPositionDetail,
    enhanceDailyPositionDetails,
    enhanceScheduleTargets
  };
  console.info(`[${VERSION}] loaded`);
})();
