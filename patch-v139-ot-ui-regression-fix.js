/* v139 OT + Schedule UI Regression Fix
   Scope: 1) force schedule summary cards to render only in person tab,
          2) robust manual OT hour calculation,
          3) weekday/weekend OT start rule,
          4) OT approval filters.
   Does not change roster assignment / fairness formulas.
*/
(function () {
  'use strict';

  const esc = (v) => (typeof escapeHtml === 'function') ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  };
  const activeScheduleView = () => {
    const v = (window.state && (state.scheduleView || state.scheduleMobileView)) || 'table';
    return v === 'ot' ? 'balance' : v;
  };

  // ---------------------------------------------------------------------------
  // 1) Conditional rendering guard for schedule summary cards.
  //    Old renderers may still inject .schedule-summary before later patches run.
  //    This patch both overrides renderScheduleSummary and removes any leaked DOM
  //    when the active tab is not "ดูตามคน".
  // ---------------------------------------------------------------------------
  const oldRenderScheduleSummary = window.renderScheduleSummary || (typeof renderScheduleSummary === 'function' ? renderScheduleSummary : null);
  window.renderScheduleSummary = function renderScheduleSummaryV139(assignments) {
    return activeScheduleView() === 'person' && typeof oldRenderScheduleSummary === 'function'
      ? oldRenderScheduleSummary(assignments)
      : '';
  };
  try { renderScheduleSummary = window.renderScheduleSummary; } catch (_) {}

  function removeLeakedSummaryCards() {
    if (!window.state || state.page !== 'schedule') return;
    const view = activeScheduleView();
    if (view === 'person') return;
    document.querySelectorAll([
      '.schedule-summary',
      '.desktop-schedule-summary',
      '.mobile-ot-summary-list',
      '.ot-summary-card',
      '.summary-chip',
      '.staff-summary-cards',
      '.roster-summary-cards',
      '.v139-person-summary-only'
    ].join(',')).forEach(el => {
      const keep = el.closest('.v136-person-list') || el.closest('.v137-balance-dashboard') || el.closest('.v136-balance-dashboard');
      if (!keep) el.remove();
    });
  }

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = function renderPageV139() {
    const res = typeof oldRenderPage === 'function' ? oldRenderPage.apply(this, arguments) : undefined;
    setTimeout(removeLeakedSummaryCards, 0);
    setTimeout(removeLeakedSummaryCards, 120);
    return res;
  };
  try { renderPage = window.renderPage; } catch (_) {}

  const mo = new MutationObserver(() => removeLeakedSummaryCards());
  document.addEventListener('DOMContentLoaded', () => {
    const pc = document.getElementById('pageContent') || document.body;
    try { mo.observe(pc, { childList: true, subtree: true }); } catch (_) {}
    removeLeakedSummaryCards();
  });

  // ---------------------------------------------------------------------------
  // 2-3) Robust OT hour calculation.
  // Manualย้อนหลัง must use work_date + end_time, never current save timestamp.
  // Weekday OT starts 16:00; weekend/public holiday starts 17:00.
  // ---------------------------------------------------------------------------
  function isWeekendLocal(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    const day = d.getDay();
    return day === 0 || day === 6;
  }
  function isHolidayLocal(dateStr) {
    try { return typeof isHolidayDate === 'function' && isHolidayDate(dateStr); }
    catch (_) { return false; }
  }
  function normalizeTime(t) {
    const s = String(t || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return '';
    const hh = Math.max(0, Math.min(23, Number(m[1])));
    const mm = Math.max(0, Math.min(59, Number(m[2])));
    const ss = Math.max(0, Math.min(59, Number(m[3] || 0)));
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  function makeLocalDate(dateStr, timeStr) {
    const time = normalizeTime(timeStr);
    if (!dateStr || !time) return null;
    const d = new Date(`${dateStr}T${time}`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function otStartTimeFor(dateStr) {
    return (isWeekendLocal(dateStr) || isHolidayLocal(dateStr)) ? '17:00:00' : '16:00:00';
  }
  window.calcOtHours = function calcOtHoursV139(row) {
    try {
      const workDate = String(row?.work_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return 0;

      const start = makeLocalDate(workDate, otStartTimeFor(workDate));
      // If user entered end_time manually, it is the source of truth.
      // Do not use check_out_at/created_at because retroactive saves would create 23/71 hr bugs.
      let end = row?.end_time ? makeLocalDate(workDate, row.end_time) : null;
      if (!end && row?.check_out_at) {
        const tmp = new Date(row.check_out_at);
        if (Number.isFinite(tmp.getTime())) end = tmp;
      }
      if (!start || !end) return 0;

      let hours = (end.getTime() - start.getTime()) / 36e5;
      if (!Number.isFinite(hours) || Number.isNaN(hours)) return 0;
      // OT ปั่นเลือดไม่ควรข้ามวันในฟอร์มนี้ ถ้าติดลบให้เป็น 0 ไม่เดาเอง
      hours = Math.max(0, hours);
      // Guard กันข้อมูลผิดพลาดทะลุวันจาก timestamp เก่า
      if (hours > 16) hours = 0;
      return Math.round(hours * 10) / 10;
    } catch (_) {
      return 0;
    }
  };
  try { calcOtHours = window.calcOtHours; } catch (_) {}

  // ---------------------------------------------------------------------------
  // 4) OT approval filters and latest-first sorting.
  // ---------------------------------------------------------------------------
  function staffLabelById(id) {
    try { return typeof staffName === 'function' ? staffName(id) : ''; }
    catch (_) { return ''; }
  }
  function getOtFilterState() {
    if (!window.state) return { month: todayMonth(), date: '', q: '' };
    if (!state.otFilterMonth) state.otFilterMonth = state.monthKey || todayMonth();
    return {
      month: state.otFilterMonth || state.monthKey || todayMonth(),
      date: state.otFilterDate || '',
      q: String(state.otFilterText || '').trim().toLowerCase()
    };
  }
  function filteredOtRows(rows) {
    const f = getOtFilterState();
    return (rows || []).filter(r => {
      const d = String(r.work_date || '').slice(0, 10);
      if (f.date && d !== f.date) return false;
      if (!f.date && f.month && !d.startsWith(f.month)) return false;
      if (f.q) {
        const hay = [staffLabelById(r.staff_id), r.reason, r.note, r.status, d].join(' ').toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const ad = String(a.work_date || '');
      const bd = String(b.work_date || '');
      if (ad !== bd) return bd.localeCompare(ad);
      return String(b.created_at || b.check_out_at || '').localeCompare(String(a.created_at || a.check_out_at || ''));
    });
  }
  function renderOtFilterBar(total, shown) {
    const f = getOtFilterState();
    return `<div class="toolbar compact-filter no-print v139-ot-filter">
      <label>เดือน/ปี <input type="month" id="otFilterMonth" value="${esc(f.month)}"></label>
      <label>ค้นตามวันที่ทำงาน <input type="date" id="otFilterDate" value="${esc(f.date)}"></label>
      <label>ค้นหา <input type="search" id="otFilterText" value="${esc(f.q)}" placeholder="ชื่อ / เหตุผล / สถานะ"></label>
      <button type="button" class="ghost-btn" data-clear-ot-filter>ล้างตัวกรอง</button>
      <span class="badge blue">แสดง ${shown}/${total} รายการ</span>
    </div>`;
  }

  const oldRenderOtTable = window.renderOtTable || (typeof renderOtTable === 'function' ? renderOtTable : null);
  window.renderOtTable = function renderOtTableV139(rows) {
    const sorted = filteredOtRows(rows || []);
    if (typeof oldRenderOtTable !== 'function') return '';
    return oldRenderOtTable(sorted);
  };
  try { renderOtTable = window.renderOtTable; } catch (_) {}

  const oldRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  window.renderOtPage = function renderOtPageV139() {
    if (typeof oldRenderOtPage !== 'function') return '';
    const html = oldRenderOtPage();
    if (!window.state || !state.otRequests) return html;
    const myRows = state.otRequests.filter(x => typeof currentStaffId === 'function' && x.staff_id === currentStaffId());
    const baseRows = (typeof isAdmin === 'function' && isAdmin()) ? state.otRequests : myRows;
    const shown = filteredOtRows(baseRows).length;
    const filter = (typeof isAdmin === 'function' && isAdmin()) ? renderOtFilterBar(baseRows.length, shown) : '';
    return html.replace(/(<div class="section-title"><h3>ส่วนที่ 3 อนุมัติ OT<\/h3>[\s\S]*?<\/div>)/, `$1${filter}`);
  };
  try { renderOtPage = window.renderOtPage; } catch (_) {}

  document.addEventListener('change', function(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'otFilterMonth') { state.otFilterMonth = t.value || ''; state.otFilterDate = ''; if (typeof renderPage === 'function') renderPage(); }
    if (t.id === 'otFilterDate') { state.otFilterDate = t.value || ''; if (typeof renderPage === 'function') renderPage(); }
  }, true);
  document.addEventListener('input', function(e) {
    const t = e.target;
    if (t && t.id === 'otFilterText') { state.otFilterText = t.value || ''; if (window.__v139OtInputTimer) clearTimeout(window.__v139OtInputTimer); window.__v139OtInputTimer = setTimeout(() => { if (typeof renderPage === 'function') renderPage(); }, 250); }
  }, true);
  document.addEventListener('click', function(e) {
    const t = e.target.closest && e.target.closest('[data-clear-ot-filter]');
    if (!t) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    state.otFilterMonth = state.monthKey || todayMonth();
    state.otFilterDate = '';
    state.otFilterText = '';
    if (typeof renderPage === 'function') renderPage();
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v139-ot-filter{margin:8px 0 12px;gap:8px;align-items:end}.v139-ot-filter label{min-width:150px}.v139-ot-filter input{height:36px}
    .ot-desktop-table td,.ot-desktop-table th{padding:7px 8px!important}
    .schedule-page-card:not(.v139-person-active) .schedule-summary,
    .schedule-page-card:not(.v139-person-active) .desktop-schedule-summary,
    .schedule-page-card:not(.v139-person-active) .summary-chip,
    .v136-schedule-page:not(.v137-person-active) .schedule-summary,
    .v136-schedule-page:not(.v137-person-active) .desktop-schedule-summary,
    .v136-schedule-page:not(.v137-person-active) .summary-chip{display:none!important}
    @media(max-width:820px){.v139-ot-filter{display:grid;grid-template-columns:1fr}.v139-ot-filter label{min-width:0}}
  `;
  document.head.appendChild(style);
})();
