/* v135 Regression Final Fix
   - Schedule tab click guard
   - Supabase recovery/invite link must show password setup form before any normal login/dashboard routing
   - Final compact schedule grid UI + Ch4 admin columns
*/
(function () {
  'use strict';

  const FORCE_KEY = 'cnmi.forcePasswordSetup.v134';
  const FORCE_KEY_135 = 'cnmi.forcePasswordSetup.v135';

  function rawAuthUrl() {
    return String(window.location.href || '') + ' ' + String(window.location.search || '') + ' ' + String(window.location.hash || '');
  }
  function isAuthRecoveryUrl(raw = rawAuthUrl()) {
    return /(access_token|refresh_token|token_hash|code)=/i.test(raw)
      || /type=(recovery|password_recovery|invite|signup)/i.test(raw)
      || /mode=(recovery|set-password|update-password)/i.test(raw);
  }
  function hasAuthError(raw = rawAuthUrl()) {
    return /(error=|error_code=|error_description=)/i.test(raw);
  }
  function forcePasswordSetup(reason) {
    try { window.sessionStorage.setItem(FORCE_KEY, JSON.stringify({ reason: reason || 'v135', at: Date.now() })); } catch (_) {}
    try { window.sessionStorage.setItem(FORCE_KEY_135, '1'); } catch (_) {}
    window.RECOVERY_INTENT = true;
    window.AUTH_LINK_PROCESSING = true;
    document.documentElement.classList.add('v135-force-password-setup');
  }
  function isForcedPasswordSetup() {
    try { if (window.sessionStorage.getItem(FORCE_KEY) || window.sessionStorage.getItem(FORCE_KEY_135)) return true; } catch (_) {}
    return !!window.RECOVERY_INTENT || (isAuthRecoveryUrl() && !hasAuthError());
  }
  function clearForcedPasswordSetup() {
    try { window.sessionStorage.removeItem(FORCE_KEY); window.sessionStorage.removeItem(FORCE_KEY_135); } catch (_) {}
    window.RECOVERY_INTENT = false;
    window.AUTH_LINK_PROCESSING = false;
    document.documentElement.classList.remove('v135-force-password-setup');
  }

  if (isAuthRecoveryUrl() && !hasAuthError()) forcePasswordSetup('early-url-before-router');

  function showPasswordFormNow() {
    const authView = document.getElementById('authView');
    const appView = document.getElementById('appView');
    const form = document.getElementById('resetPasswordForm');
    if (!authView || !appView || !form) return;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    form.classList.remove('hidden');
    form.classList.add('active');
    const h = document.querySelector('.auth-card h1');
    if (h) h.textContent = 'ตั้งชื่อผู้ใช้และรหัสผ่านใหม่';
  }

  const originalShowReset = window.showResetPasswordPanel;
  window.showResetPasswordPanel = function showResetPasswordPanelV135() {
    if (typeof originalShowReset === 'function') {
      try { originalShowReset(); } catch (_) {}
    }
    showPasswordFormNow();
  };
  try { showResetPasswordPanel = window.showResetPasswordPanel; } catch (_) {}

  const originalEnterApp = window.enterApp;
  window.enterApp = async function enterAppV135() {
    if (isForcedPasswordSetup()) {
      forcePasswordSetup('block-enter-app');
      showPasswordFormNow();
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
      return;
    }
    return originalEnterApp ? originalEnterApp.apply(this, arguments) : undefined;
  };
  try { enterApp = window.enterApp; } catch (_) {}

  // Keep reset form visible even if older patches temporarily render login/dashboard.
  document.addEventListener('DOMContentLoaded', () => {
    if (isForcedPasswordSetup()) {
      showPasswordFormNow();
      setTimeout(showPasswordFormNow, 80);
      setTimeout(showPasswordFormNow, 500);
      setTimeout(showPasswordFormNow, 1200);
    }
  });

  // When password form is submitted successfully, older handler will update password and enter app.
  // This capture only clears the v135 extra flag after updateUser has a chance to succeed.
  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'resetPasswordForm') {
      setTimeout(() => {
        const appVisible = !document.getElementById('appView')?.classList.contains('hidden');
        if (appVisible) clearForcedPasswordSetup();
      }, 1800);
    }
  }, true);

  function html(s) { return typeof escapeHtml === 'function' ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function monthRange(key) { return typeof getMonthRange === 'function' ? getMonthRange(key) : (() => { const [y,m] = String(key).split('-').map(Number); return { y, m, start:`${y}-${String(m).padStart(2,'0')}-01`, end:'' }; })(); }
  function pad2(n) { return typeof pad === 'function' ? pad(n) : String(n).padStart(2, '0'); }
  function dObj(d) { return typeof parseDate === 'function' ? parseDate(d) : new Date(`${d}T00:00:00`); }
  function wk(d) { return dObj(d).getDay(); }
  function isWE(d) { return typeof isWeekend === 'function' ? isWeekend(d) : [0,6].includes(wk(d)); }
  function isHol(d) { return typeof isHolidayDate === 'function' ? isHolidayDate(d) : false; }
  function holName(d) { return typeof holidayName === 'function' ? holidayName(d) : ''; }
  function stById(id) { return (state.staff || []).find(s => String(s.id) === String(id)); }
  function colorOf(st) { return typeof staffColor === 'function' ? staffColor(st) : (st?.staff_color || '#e8f3ff'); }
  function fgOf(bg) { return typeof textColorFor === 'function' ? textColorFor(bg) : '#1f2937'; }
  function rosterStaff() { return typeof orderedStaff === 'function' ? orderedStaff((state.staff || []).filter(s => isRosterEnabled(s))) : (state.staff || []); }
  function dutyStaffLabel(code) { return (code === 'ช4A' || code === 'ช4B') ? 'ช4' : ((window.DUTY_LABEL && DUTY_LABEL[code]) || code || ''); }
  function dutyAdminLabel(code) { return code === 'ช4A' ? 'ช4 (1)' : code === 'ช4B' ? 'ช4 (2)' : dutyStaffLabel(code); }
  function dutyOrderIndex(code) { return (window.DUTY_COLUMNS || []).indexOf(code); }
  function activeScheduleView() {
    const v = state.scheduleMobileView || state.scheduleView || 'table';
    return ['table', 'day', 'person'].includes(v) ? v : 'table';
  }
  function setScheduleView(v) { state.scheduleMobileView = v; state.scheduleView = v; }

  function isLeaveActive(l) {
    const st = String(l?.status || 'active').toLowerCase();
    return !['cancelled', 'rejected', 'deleted'].includes(st);
  }
  function isLongTermStaff(staff) {
    if (!staff) return false;
    return staff.isLongTermLeave === true
      || staff.is_long_term_leave === true
      || staff.long_term_leave === true
      || staff.maternity_status === true
      || String(staff.maternity_status || '').toLowerCase() === 'true'
      || String(staff.position_training_status || '').includes('ลาคลอด');
  }
  function statusForStaffDate(staff, date) {
    const labels = [];
    if (isLongTermStaff(staff)) labels.push('ลาคลอด');
    (state.leaves || []).filter(isLeaveActive).forEach(l => {
      if (String(l.staff_id) !== String(staff?.id)) return;
      if (!(String(l.start_date || '') <= date && String(l.end_date || l.start_date || '') >= date)) return;
      const type = String(l.type || '').trim();
      if (/ไม่รับเวร/.test(type)) labels.push('ไม่รับเวร');
      else if (/คลอด/.test(type)) labels.push('ลาคลอด');
      else if (/กิจ/.test(type)) labels.push('ลากิจ');
      else if (/ป่วย/.test(type)) labels.push('ลาป่วย');
      else if (/พักผ่อน|พักร้อน|annual/i.test(type)) labels.push('ลาพักผ่อน');
      else if (type) labels.push(type);
    });
    return [...new Set(labels)];
  }
  function statusBadges(staff, date) {
    const arr = statusForStaffDate(staff, date);
    return arr.map(x => `<span class="v135-status ${x === 'ไม่รับเวร' ? 'no-duty' : x === 'ลาคลอด' ? 'maternity' : 'leave'}">${html(x)}</span>`).join('');
  }
  function shiftPill(slot, staff) {
    if (!slot || !staff) return '';
    const bg = colorOf(staff);
    const fg = fgOf(bg);
    const attrs = slot.id && typeof canRequestTrade === 'function' && canRequestTrade(slot)
      ? `data-trade-duty="${html(slot.id)}" title="คลิกเพื่อแลก/ขาย/ยกเวร"`
      : `data-staff-stat="${html(staff.id)}" title="คลิกเพื่อดูสถิติ"`;
    return `<button type="button" class="v135-shift-pill" style="--staff-bg:${html(bg)};--staff-fg:${html(fg)}" ${attrs}>${html(dutyStaffLabel(slot.duty_code))}</button>`;
  }
  function dayHeader(y, m, day) {
    const date = `${y}-${pad2(m)}-${pad2(day)}`;
    const cls = isHol(date) || isWE(date) ? 'v135-day-off-col' : '';
    const wd = dObj(date).toLocaleDateString('th-TH', { weekday:'short' });
    return `<th class="${cls}">${day}<br><span>${html(wd)}</span></th>`;
  }

  window.renderMonthlySchedulePage = function renderMonthlySchedulePageV135() {
    const assignments = getAssignmentsForMonth(state.monthKey);
    if (!state.scheduleMobileView || !['table','day','person'].includes(state.scheduleMobileView)) setScheduleView('table');
    const view = activeScheduleView();
    return `<div class="card schedule-page-card v135-schedule-page">
      <div class="toolbar no-print">
        <label>เดือน <input type="month" id="scheduleMonthInput" value="${html(state.monthKey)}"></label>
        <button class="ghost-btn" data-export-schedule-excel>Export Excel</button>
        <button class="ghost-btn" data-print-page>Export PDF / พิมพ์</button>
        <button class="soft-btn" data-show-fairness>ดูสมดุลเวร</button>
      </div>
      <div class="v135-schedule-tabs no-print" aria-label="ตารางเวร tabs">
        ${v135ScheduleTab('table', 'ตารางรายเดือน', view)}
        ${v135ScheduleTab('day', 'ดูรายวัน', view)}
        ${v135ScheduleTab('person', 'ดูรายคน', view)}
      </div>
      <h3 class="print-only">ตารางเวรประจำเดือน ${html(state.monthKey)}</h3>
      ${typeof renderScheduleSummary === 'function' ? renderScheduleSummary(assignments) : ''}
      ${renderReadOnlySchedule(assignments)}
      ${typeof renderDutyTradePanel === 'function' ? renderDutyTradePanel(assignments) : ''}
    </div>`;
  };
  try { renderMonthlySchedulePage = window.renderMonthlySchedulePage; } catch (_) {}

  function v135ScheduleTab(id, label, active) {
    return `<button type="button" class="v135-tab ${active === id ? 'active' : ''}" data-schedule-mobile-view="${id}" data-schedule-view="${id}">${html(label)}</button>`;
  }

  window.renderReadOnlySchedule = function renderReadOnlyScheduleV135(assignments) {
    if (!assignments || !assignments.length) return typeof empty === 'function' ? empty('ยังไม่มีตารางเวรของเดือนนี้') : '<div>ยังไม่มีตารางเวรของเดือนนี้</div>';
    const view = activeScheduleView();
    if (view === 'day') return renderV135DayView(assignments);
    if (view === 'person') return renderV135PersonView(assignments);
    return renderV135ExcelGrid(assignments);
  };
  try { renderReadOnlySchedule = window.renderReadOnlySchedule; } catch (_) {}

  function renderV135ExcelGrid(assignments) {
    const { y, m } = monthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    const days = Array.from({ length: last }, (_, i) => i + 1);
    const staffRows = rosterStaff();
    return `<div class="table-wrap desktop-schedule-table v135-grid-wrap"><table id="scheduleTable" class="v135-schedule-grid"><thead><tr><th class="v135-sticky-name">เจ้าหน้าที่</th>${days.map(d => dayHeader(y,m,d)).join('')}</tr></thead><tbody>${staffRows.map((s, idx) => {
      const bg = colorOf(s); const fg = fgOf(bg);
      return `<tr class="${idx % 2 ? 'zebra' : ''}"><th class="v135-name-cell" style="--staff-bg:${html(bg)};--staff-fg:${html(fg)}"><button type="button" data-staff-stat="${html(s.id)}">${html(s.nickname || s.full_name || '-')}</button></th>${days.map(day => {
        const date = `${y}-${pad2(m)}-${pad2(day)}`;
        const cls = isHol(date) || isWE(date) ? 'v135-day-off-cell' : '';
        const shifts = (assignments || []).filter(a => String(a.staff_id) === String(s.id) && a.duty_date === date).sort((a,b) => dutyOrderIndex(a.duty_code) - dutyOrderIndex(b.duty_code));
        return `<td class="${cls}"><div class="v135-cell-stack">${statusBadges(s, date)}${shifts.map(slot => shiftPill(slot, s)).join('')}</div></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderV135DayView(assignments) {
    const { y, m } = monthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    return `<div class="v135-day-cards">${Array.from({ length:last }, (_,i)=>i+1).map(day => {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      const cls = isHol(date) || isWE(date) ? 'dayoff' : '';
      const rows = (assignments || []).filter(a => a.duty_date === date && a.staff_id).sort((a,b)=>dutyOrderIndex(a.duty_code)-dutyOrderIndex(b.duty_code));
      return `<div class="v135-day-card ${cls}"><div class="v135-day-head"><b>${day}</b><span>${html(dObj(date).toLocaleDateString('th-TH', { weekday:'short' }))}</span>${isHol(date) ? `<span class="badge yellow">${html(holName(date))}</span>` : ''}</div>${rows.length ? rows.map(a => {
        const s = stById(a.staff_id); return `<div class="v135-day-line"><b>${html(dutyStaffLabel(a.duty_code))}</b>${shiftPill(a, s)}</div>`;
      }).join('') : '<span class="muted">ไม่มีเวร</span>'}</div>`;
    }).join('')}</div>`;
  }

  function renderV135PersonView(assignments) {
    const staffRows = rosterStaff();
    return `<div class="v135-person-list">${staffRows.map(s => {
      const rows = (assignments || []).filter(a => String(a.staff_id) === String(s.id)).sort((a,b)=>String(a.duty_date).localeCompare(String(b.duty_date)) || dutyOrderIndex(a.duty_code)-dutyOrderIndex(b.duty_code));
      const bg = colorOf(s); const fg = fgOf(bg);
      return `<button type="button" class="v135-person-card" style="--staff-bg:${html(bg)};--staff-fg:${html(fg)}" data-staff-stat="${html(s.id)}"><b>${html(s.nickname || s.full_name)}</b><span>${rows.length} เวร</span><small>${rows.slice(0,6).map(a => `${Number(String(a.duty_date).slice(-2))}:${dutyStaffLabel(a.duty_code)}`).join(' • ') || 'ไม่มีเวรเดือนนี้'}</small></button>`;
    }).join('')}</div>`;
  }

  window.renderRosterGrid = function renderRosterGridV135(assignments) {
    if (!assignments || !assignments.length) return typeof empty === 'function' ? empty('กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร') : '';
    const { y, m } = monthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    const desktopTable = `<div class="table-wrap roster-table-wrap v135-roster-admin-wrap"><table class="roster-table v135-roster-admin"><thead><tr><th>วันที่</th>${DUTY_COLUMNS.map(c => `<th>${html(dutyAdminLabel(c))}</th>`).join('')}</tr></thead><tbody>
      ${Array.from({length:last}, (_,i)=>i+1).map(day => {
        const date = `${y}-${pad2(m)}-${pad2(day)}`;
        const dow = dObj(date).toLocaleDateString('th-TH', { weekday:'short' });
        const rowCls = isHol(date) || isWE(date) ? 'v135-admin-dayoff-row' : '';
        return `<tr class="${rowCls}"><td class="v135-admin-date"><b>${day}</b><br><span class="muted">${html(dow)}</span>${isHol(date) ? `<br><span class="badge yellow">${html(holName(date))}</span>` : ''}</td>${DUTY_COLUMNS.map(code => {
          if (!allowedDutyCodesForDate(date).includes(code)) return '<td class="muted v135-admin-dayoff-cell">-</td>';
          const slot = assignments.find(a => a.duty_date === date && a.duty_code === code);
          if (!slot) return '<td class="muted">-</td>';
          const id = slot.id || slot._temp_id;
          return `<td><div class="roster-slot ${slot.is_locked?'locked':''}" data-drop-slot="${html(id)}">
            <div class="assigned-name">${slot.staff_id ? staffPill(slot.staff_id) : 'ยังไม่จัด'}</div>
            <div class="slot-meta">${html(slot.required_role)} ${slot.is_locked?'• locked':''}</div>
            <select class="mobile-roster-select" data-roster-slot-select="${html(id)}" ${slot.is_locked?'disabled':''}><option value="">ยังไม่จัด</option>${staffOptionList(slot.staff_id, st => canStaffWorkSlot(st.id, slot))}</select>
            <div class="actions"><button class="tiny-btn" data-clear-slot="${html(id)}">ล้าง</button><button class="tiny-btn" data-toggle-lock-slot="${html(id)}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button></div>
          </div></td>`;
        }).join('')}</tr>`;
      }).join('')}
    </tbody></table></div>`;
    return desktopTable + (typeof renderRosterMobileGrid === 'function' ? renderRosterMobileGrid(assignments, y, m, last) : '');
  };
  try { renderRosterGrid = window.renderRosterGrid; } catch (_) {}

  // Capture tab clicks before older handlers. This fixes regression when a transparent layer or old handler swallows the click.
  document.addEventListener('click', function v135ScheduleTabClick(e) {
    const t = e.target.closest('[data-schedule-view], [data-schedule-mobile-view]');
    if (!t) return;
    const v = t.dataset.scheduleView || t.dataset.scheduleMobileView;
    if (!v) return;
    e.preventDefault();
    e.stopPropagation();
    setScheduleView(v);
    if (typeof renderPage === 'function') renderPage();
  }, true);

  // If older patch saved a broken renderPage reference, force the schedule page to use the new renderer after every render.
  const originalRenderPage = window.renderPage;
  window.renderPage = function renderPageV135() {
    const res = originalRenderPage ? originalRenderPage.apply(this, arguments) : undefined;
    if (state && state.page === 'schedule') {
      const content = document.getElementById('pageContent');
      if (content && !content.querySelector('.v135-schedule-page')) content.innerHTML = window.renderMonthlySchedulePage();
    }
    return res;
  };
  try { renderPage = window.renderPage; } catch (_) {}

})();
