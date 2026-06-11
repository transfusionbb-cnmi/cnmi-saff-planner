/* CNMI Staff Planner Patch V128
   Scope: Fix Excel-like monthly roster UI/UX and print layout only.
   1) Compact row height and hide trade text while keeping clickable button.
   2) Keep staff row colors on mobile/table scroll.
   3) Show “ไม่รับเวร” in the real roster grid.
   4) Show “ลาคลอด” for long-term leave staff throughout the month.
   5) Make Print/PDF use compact landscape Excel-like grid with exact colors.
*/
(function patchV128ExcelGridPrintUxFix(){
  if (window.__CNMI_V128_EXCEL_GRID_PRINT_UX_FIX__) return;
  window.__CNMI_V128_EXCEL_GRID_PRINT_UX_FIX__ = true;

  const esc = (v) => {
    try { if (typeof escapeHtml === 'function') return escapeHtml(v); } catch (_) {}
    return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const monthKeySafe = () => String(state?.monthKey || new Date().toISOString().slice(0, 7));
  const parseDateSafe = (date) => {
    try { if (typeof parseDate === 'function') return parseDate(date); } catch (_) {}
    const [y, m, d] = String(date || '').slice(0,10).split('-').map(Number);
    return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
  };
  const monthRangeSafe = (key=monthKeySafe()) => {
    try { if (typeof getMonthRange === 'function') return getMonthRange(key); } catch (_) {}
    const [y, m] = String(key).split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { y, m, start:`${y}-${pad2(m)}-01`, end:`${y}-${pad2(m)}-${pad2(last)}` };
  };
  const staffById = (id) => (state?.staff || []).find(s => String(s.id) === String(id));
  const staffRowsSafe = () => {
    const rows = (state?.staff || []).filter(s => {
      try { return typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : true; } catch (_) { return true; }
    });
    try { return typeof orderedStaff === 'function' ? orderedStaff(rows) : rows; } catch (_) { return rows; }
  };
  const staffNameSafe = (staff) => staff?.nickname || staff?.full_name || staff?.name || '-';
  const staffColorSafe = (staffOrId, alpha=false) => {
    const staff = typeof staffOrId === 'object' ? staffOrId : staffById(staffOrId);
    let color = '#dbeafe';
    try { if (typeof staffColor === 'function') color = staffColor(staff || staffOrId); } catch (_) {}
    if (!alpha) return color;
    const m = String(color || '').trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return color;
    return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},0.18)`;
  };
  const textColorSafe = (bg) => { try { if (typeof textColorFor === 'function') return textColorFor(bg); } catch (_) {} return '#0f172a'; };
  function isWeekendSafe(date) {
    try { if (typeof window.isWeekend === 'function') return window.isWeekend(date); } catch (_) {}
    const dow = parseDateSafe(date).getDay();
    return dow === 0 || dow === 6;
  }
  function isHolidaySafe(date) {
    try { if (typeof isHolidayDate === 'function') return isHolidayDate(date); } catch (_) {}
    const ds = String(date || '').slice(0,10);
    return (state?.holidays || []).some(h => String(h.holiday_date || h.date || h).slice(0,10) === ds);
  }
  function overlapsDateSafe(row, date) {
    try { if (typeof overlapsDate === 'function') return overlapsDate(row, date); } catch (_) {}
    const ds = String(date || '').slice(0,10);
    return String(row?.start_date || '').slice(0,10) <= ds && String(row?.end_date || '').slice(0,10) >= ds;
  }
  function activeLeaveRows(staffId, date) {
    return (state?.leaves || []).filter(l => String(l.staff_id) === String(staffId) && String(l.status || 'active') !== 'cancelled' && overlapsDateSafe(l, date));
  }
  function hasNoDuty(staffId, date) {
    return activeLeaveRows(staffId, date).some(l => String(l.type || '').trim() === 'ไม่รับเวร');
  }
  function hasMaternityLeave(staffId, date) {
    return activeLeaveRows(staffId, date).some(l => String(l.type || '').includes('ลาคลอด'));
  }
  function isLongTermOrMatLeave(staff, date) {
    if (!staff) return false;
    if (staff.isLongTermLeave === true || staff.is_long_term_leave === true) return true;
    if (String(staff.leave_status || '').includes('ลาคลอด') || String(staff.leave_status || '').includes('ลาระยะยาว')) return true;
    if (hasMaternityLeave(staff.id, date)) return true;
    try { if (typeof window.isLongTermExcludedStaffV127 === 'function' && window.isLongTermExcludedStaffV127(staff, monthKeySafe()) && hasMaternityLeave(staff.id, date)) return true; } catch (_) {}
    return false;
  }
  function normalizeDuty(code='') {
    const c = String(code || '').trim();
    if (c === 'ช9-MT') return 'ช9';
    if (c.startsWith('ช9')) return 'ช9';
    if (c.startsWith('ช4') || c === 'ช4-MT/แตง 1' || c === 'ช4-MT/แตง 2') return 'ช4';
    return c;
  }
  function renderTradeBtnCompact(row) {
    try {
      if (typeof renderTradeButton === 'function') {
        const html = renderTradeButton(row);
        return html ? `<span class="v128-trade-click" title="แลก/ขาย/ยกเวร">${html}</span>` : '';
      }
    } catch (_) {}
    const id = row?.id || row?._temp_id || '';
    return id ? `<button type="button" class="tiny-btn trade-btn v128-trade-btn" data-trade-duty="${esc(id)}" title="แลก/ขาย/ยกเวร" aria-label="แลก/ขาย/ยกเวร"></button>` : '';
  }

  // Override Excel-like schedule matrix from v127: compact, row color, no-duty and maternity labels.
  window.renderSchedulePersonMatrix = renderSchedulePersonMatrix = function renderSchedulePersonMatrixV128(assignments) {
    const key = monthKeySafe();
    const { y, m } = monthRangeSafe(key);
    const last = new Date(y, m, 0).getDate();
    const days = Array.from({ length:last }, (_, i) => i + 1);
    const activeStaff = staffRowsSafe();
    const rowsHtml = activeStaff.map(st => {
      const strong = staffColorSafe(st);
      const rowBg = staffColorSafe(st, true);
      const fg = textColorSafe(strong);
      const cells = days.map(day => {
        const date = `${y}-${pad2(m)}-${pad2(day)}`;
        const dutyRows = (assignments || []).filter(a => String(a.staff_id) === String(st.id) && String(a.duty_date) === date);
        const holiday = isHolidaySafe(date);
        const weekend = isWeekendSafe(date);
        const noDuty = hasNoDuty(st.id, date);
        const matLeave = isLongTermOrMatLeave(st, date);
        const cls = [holiday ? 'holiday-cell' : '', weekend ? 'weekend-cell' : '', noDuty ? 'v128-noduty-cell' : '', matLeave ? 'v128-matleave-cell' : '', dutyRows.length ? 'has-duty-cell' : ''].filter(Boolean).join(' ');
        let inner = '';
        if (matLeave) {
          inner = `<span class="v128-leave-label v128-matleave-label">ลาคลอด</span>`;
        } else if (dutyRows.length) {
          inner = dutyRows.map(a => `<button type="button" class="v128-duty-pill" data-staff-stat="${esc(st.id)}" title="${esc(normalizeDuty(a.duty_code))}">${esc(normalizeDuty(a.duty_code))}</button>${renderTradeBtnCompact(a)}`).join('');
          if (noDuty) inner += `<span class="v128-leave-label v128-noduty-label">ไม่รับเวร</span>`;
        } else if (noDuty) {
          inner = `<span class="v128-leave-label v128-noduty-label">ไม่รับเวร</span>`;
        } else {
          inner = '';
        }
        return `<td class="${cls}">${inner}</td>`;
      }).join('');
      return `<tr style="--row-bg:${rowBg};--staff-bg:${strong};--staff-fg:${fg}"><th class="v128-staff-head" style="background:${strong};color:${fg}">${esc(staffNameSafe(st))}</th>${cells}</tr>`;
    }).join('');
    return `<div class="table-wrap mobile-schedule-matrix-wrap v127-schedule-grid-wrap v128-schedule-grid-wrap"><table id="scheduleTable" class="schedule-person-matrix v127-colored-grid v128-colored-grid"><thead><tr><th class="v128-staff-head">เจ้าหน้าที่</th>${days.map(day => {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      return `<th>${day}<br><span>${parseDateSafe(date).toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  };

  // Make sure print button prints the table view and not calendar view.
  document.addEventListener('click', function(e){
    if (e.target.closest?.('[data-print-page]') && state?.page === 'schedule') {
      e.preventDefault();
      e.stopImmediatePropagation();
      state.scheduleDesktopViewV125 = 'table';
      state.scheduleDesktopViewV121 = 'table';
      state.scheduleMobileViewV125 = 'table';
      state.scheduleMobileViewV121 = 'table';
      document.body.classList.add('print-schedule-grid','v128-printing-schedule');
      try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
      setTimeout(() => window.print(), 80);
    }
  }, true);
  window.addEventListener('afterprint', () => document.body.classList.remove('print-schedule-grid','print-month-positions','v128-printing-schedule'));

  const css = document.createElement('style');
  css.textContent = `
    /* V128 compact Excel-like roster grid */
    .v128-schedule-grid-wrap{overflow:auto;-webkit-overflow-scrolling:touch;max-width:100%}
    .v128-colored-grid{border-collapse:collapse;table-layout:fixed;min-width:980px;width:max-content}
    .v128-colored-grid th,.v128-colored-grid td{padding:2px 3px!important;line-height:1.05!important;vertical-align:middle!important;min-height:20px!important;height:24px!important}
    .v128-colored-grid thead th{font-size:11px!important;white-space:normal!important}
    .v128-colored-grid tbody td{background:var(--row-bg)!important;font-size:11px!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important;text-align:center!important}
    .v128-colored-grid tbody th.v128-staff-head{position:sticky;left:0;z-index:4;min-width:86px!important;max-width:110px!important;font-size:11px!important;white-space:normal!important;word-break:break-word!important}
    .v128-colored-grid tbody td.weekend-cell,.v128-colored-grid tbody td.holiday-cell{background:color-mix(in srgb, var(--row-bg) 76%, #fff7ed)!important}
    .v128-duty-pill{display:inline-block;border:0;border-radius:8px;background:rgba(255,255,255,.76);color:#0f172a;font-weight:800;font-size:10.5px;line-height:1;padding:2px 4px;margin:0 1px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(15,23,42,.08)}
    .v128-duty-pill:hover{filter:brightness(.97)}
    .v128-leave-label{display:inline-block;border-radius:7px;padding:2px 4px;margin:0 1px;font-weight:800;font-size:10px;line-height:1.05;white-space:normal}
    .v128-noduty-label{background:#ffedd5;color:#c2410c;border:1px solid #fdba74}
    .v128-matleave-label{background:#fce7f3;color:#be185d;border:1px solid #f9a8d4}
    .v128-matleave-cell{opacity:.96}.v128-noduty-cell{box-shadow:inset 0 0 0 1px rgba(251,146,60,.35)}

    /* Hide text “แลก/ขาย/ยก” but keep button clickable. */
    .v128-colored-grid .trade-btn,.v128-trade-click .trade-btn{font-size:0!important;line-height:1!important;padding:0!important;margin:0 1px!important;width:15px!important;height:15px!important;min-width:15px!important;border-radius:999px!important;cursor:pointer!important;vertical-align:middle!important;overflow:hidden!important;color:transparent!important}
    .v128-colored-grid .trade-btn::after,.v128-trade-click .trade-btn::after{content:'↔';font-size:10px!important;color:#2563eb!important;line-height:15px!important;display:block!important;text-align:center!important}

    @media (max-width: 760px){
      .v128-schedule-grid-wrap{margin:0 -8px;padding-bottom:8px;overflow-x:auto!important;background:#fff;border-radius:14px}
      .v128-colored-grid{min-width:920px!important;width:max-content!important}
      .v128-colored-grid th,.v128-colored-grid td{height:22px!important;padding:1px 2px!important}
      .v128-colored-grid tbody td{background:var(--row-bg)!important;font-size:10px!important}
      .v128-colored-grid tbody th.v128-staff-head{font-size:10px!important;min-width:76px!important;max-width:88px!important}
      .v128-duty-pill,.v128-leave-label{font-size:9.5px!important;padding:1px 3px!important}
      .v128-colored-grid tbody td.weekend-cell,.v128-colored-grid tbody td.holiday-cell{background:color-mix(in srgb, var(--row-bg) 72%, #fff7ed)!important}
    }

    @media print{
      @page{size:landscape;margin:5mm}
      *{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}
      body.print-schedule-grid, body.print-month-positions{background:#fff!important}
      body.print-schedule-grid .sidebar, body.print-schedule-grid aside, body.print-schedule-grid .topbar, body.print-schedule-grid .toolbar, body.print-schedule-grid .no-print, body.print-schedule-grid .v121-tabs, body.print-schedule-grid .v121-mobile-only,
      body.print-month-positions .sidebar, body.print-month-positions aside, body.print-month-positions .topbar, body.print-month-positions .toolbar, body.print-month-positions .no-print{display:none!important}
      body.print-schedule-grid .main-panel, body.print-schedule-grid main, body.print-schedule-grid .page-content, body.print-month-positions .main-panel, body.print-month-positions main, body.print-month-positions .page-content{margin:0!important;padding:0!important;width:100%!important;max-width:none!important;overflow:visible!important}
      body.print-schedule-grid .v121-desktop-only{display:block!important}
      body.print-schedule-grid .schedule-page-v127, body.print-schedule-grid .card, body.print-month-positions .monthly-position-page, body.print-month-positions .card{box-shadow:none!important;border:0!important;padding:0!important;margin:0!important;background:#fff!important;max-width:none!important;overflow:visible!important}
      body.print-schedule-grid .v127-print-grid, body.print-schedule-grid .v128-schedule-grid-wrap, body.print-month-positions .table-wrap{overflow:visible!important;max-width:none!important;width:100%!important}
      body.print-schedule-grid table, body.print-month-positions table{table-layout:fixed!important;border-collapse:collapse!important;width:100%!important;min-width:0!important;max-width:none!important;font-size:8px!important;line-height:1.05!important;page-break-inside:auto!important}
      body.print-schedule-grid th, body.print-schedule-grid td, body.print-month-positions th, body.print-month-positions td{border:1px solid #94a3b8!important;padding:1px 2px!important;height:auto!important;min-height:0!important;font-size:8px!important;line-height:1.05!important;white-space:normal!important;word-wrap:break-word!important;overflow-wrap:anywhere!important;word-break:break-word!important;vertical-align:middle!important}
      body.print-schedule-grid thead{display:table-header-group!important}
      body.print-schedule-grid tr, body.print-month-positions tr{page-break-inside:avoid!important}
      body.print-schedule-grid .v128-colored-grid tbody tr, body.print-schedule-grid .v128-colored-grid tbody td{background:var(--row-bg)!important}
      body.print-schedule-grid .v128-colored-grid tbody td.weekend-cell, body.print-schedule-grid .v128-colored-grid tbody td.holiday-cell{background:color-mix(in srgb, var(--row-bg) 76%, #fff7ed)!important}
      body.print-schedule-grid .v128-staff-head{position:static!important;min-width:0!important;max-width:none!important;width:7.5%!important;font-size:8px!important}
      body.print-schedule-grid .v128-duty-pill, body.print-schedule-grid .v128-leave-label{font-size:7px!important;line-height:1!important;padding:1px!important;margin:0!important;border-radius:3px!important;box-shadow:none!important}
      body.print-schedule-grid .trade-btn, body.print-schedule-grid .v128-trade-click, body.print-month-positions select, body.print-month-positions button{display:none!important}
      body.print-schedule-grid ::-webkit-scrollbar, body.print-month-positions ::-webkit-scrollbar{display:none!important}
    }
  `;
  document.head.appendChild(css);
})();
