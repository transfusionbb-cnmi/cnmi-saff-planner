/* CNMI Staff Planner Patch V126
   Scope: emergency safe guard for ตารางเวรประจำเดือน menu.
   - Do not change roster/OT/rebalance logic.
   - Force schedule menu click to render safely.
   - If the newest schedule renderer throws, fall back to a simple read-only monthly table instead of leaving the menu unresponsive.
*/
(function patchV126ScheduleMenuSafe(){
  if (window.__CNMI_V126_SCHEDULE_MENU_SAFE__) return;
  window.__CNMI_V126_SCHEDULE_MENU_SAFE__ = true;

  const $id = (id) => document.getElementById(id);
  const esc = (v) => {
    try { if (typeof escapeHtml === 'function') return escapeHtml(v); } catch (_) {}
    return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const currentMonthKey = () => String(state?.monthKey || new Date().toISOString().slice(0, 7));
  const parseDateSafe = (date) => {
    try { if (typeof parseDate === 'function') return parseDate(date); } catch (_) {}
    const [y, m, d] = String(date || '').slice(0, 10).split('-').map(Number);
    return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
  };
  const monthRangeSafe = (key=currentMonthKey()) => {
    try { if (typeof getMonthRange === 'function') return getMonthRange(key); } catch (_) {}
    const [y, m] = String(key).split('-').map(Number);
    return { y, m, start:`${y}-${pad2(m)}-01`, end:`${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}` };
  };
  const isWeekendSafe = (date) => {
    try { if (typeof isWeekend === 'function') return isWeekend(date); } catch (_) {}
    const d = parseDateSafe(date).getDay();
    return d === 0 || d === 6;
  };
  const isHolidaySafe = (date) => {
    try { if (typeof isHolidayDate === 'function') return isHolidayDate(date); } catch (_) {}
    return (state?.holidays || []).some(h => String(h.holiday_date || h.date || '').slice(0, 10) === String(date));
  };
  const holidayNameSafe = (date) => {
    try { if (typeof holidayName === 'function') return holidayName(date); } catch (_) {}
    return (state?.holidays || []).find(h => String(h.holiday_date || h.date || '').slice(0, 10) === String(date))?.title || 'วันหยุด';
  };
  const staffPillSafe = (id) => {
    try { if (typeof staffPill === 'function') return staffPill(id, { button:true, attrs:`data-staff-stat="${esc(id)}" type="button"` }); } catch (_) {}
    const s = (state?.staff || []).find(x => String(x.id) === String(id));
    return `<button type="button" class="staff-color-pill staff-pill-btn" data-staff-stat="${esc(id)}">${esc(s?.nickname || s?.full_name || '-')}</button>`;
  };
  const dutyLabelSafe = (code) => {
    const map = (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL) || {};
    return map[code] || code || '-';
  };
  const dutyCodesSafe = () => {
    try { if (typeof DUTY_COLUMNS !== 'undefined' && Array.isArray(DUTY_COLUMNS)) return DUTY_COLUMNS; } catch (_) {}
    return ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT'];
  };
  const allowedCodesSafe = (date) => {
    try { if (typeof allowedDutyCodesForDate === 'function') return allowedDutyCodesForDate(date); } catch (_) {}
    return dutyCodesSafe();
  };
  const assignmentsForCurrentMonth = () => {
    const key = currentMonthKey();
    try { if (typeof getAssignmentsForMonth === 'function') return getAssignmentsForMonth(key); } catch (_) {}
    const { start, end } = monthRangeSafe(key);
    return (state?.rosterAssignments || []).filter(a => String(a.duty_date || '') >= start && String(a.duty_date || '') <= end);
  };

  const previousScheduleRenderer = window.renderMonthlySchedulePage || (typeof renderMonthlySchedulePage === 'function' ? renderMonthlySchedulePage : null);

  function renderScheduleFallback(error) {
    const key = currentMonthKey();
    const { y, m } = monthRangeSafe(key);
    const last = new Date(y, m, 0).getDate();
    const assignments = assignmentsForCurrentMonth();
    const codes = dutyCodesSafe();
    const rows = Array.from({ length:last }, (_, i) => i + 1).map(day => {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      const cls = isHolidaySafe(date) ? 'holiday-row' : isWeekendSafe(date) ? 'weekend-row' : '';
      const dow = parseDateSafe(date).toLocaleDateString('th-TH', { weekday:'short' });
      return `<tr class="${cls}"><td class="date-cell"><b>${day}</b><br><span class="muted">${esc(dow)}</span>${isHolidaySafe(date) ? `<br><span class="badge yellow">${esc(holidayNameSafe(date))}</span>` : ''}</td>${codes.map(code => {
        if (!allowedCodesSafe(date).includes(code)) return '<td class="muted">-</td>';
        const slot = assignments.find(a => String(a.duty_date) === date && String(a.duty_code) === String(code));
        return `<td>${slot?.staff_id ? staffPillSafe(slot.staff_id) : '-'}</td>`;
      }).join('')}</tr>`;
    }).join('');
    const errText = error ? `<div class="notice soft-notice"><b>โหลดหน้าตารางเวรด้วยโหมดสำรอง</b><br><span class="muted">รายละเอียดสำหรับแก้ไข: ${esc(error.message || error)}</span></div>` : '';
    return `<div class="card schedule-page-card schedule-safe-v126">
      <div class="toolbar no-print"><label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(key)}"></label><button type="button" class="ghost-btn" data-export-schedule-excel>Export Excel</button><button type="button" class="ghost-btn" data-print-page>Export PDF / พิมพ์</button></div>
      ${errText}
      <h3>ตารางเวรประจำเดือน ${esc(key)}</h3>
      <div class="table-wrap desktop-schedule-table"><table id="scheduleTable" class="schedule-readable"><thead><tr><th>วันที่</th>${codes.map(c => `<th>${esc(dutyLabelSafe(c))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }

  function renderScheduleSafeV126() {
    if (previousScheduleRenderer && previousScheduleRenderer !== renderScheduleSafeV126) {
      try { return previousScheduleRenderer(); }
      catch (err) { console.error('[V126] schedule renderer failed; using fallback', err); return renderScheduleFallback(err); }
    }
    return renderScheduleFallback();
  }

  window.renderMonthlySchedulePage = renderMonthlySchedulePage = renderScheduleSafeV126;

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = renderPage = function renderPageV126() {
    if (state?.page === 'schedule') {
      const item = (typeof NAV_ITEMS !== 'undefined' ? NAV_ITEMS : []).find(x => x.id === 'schedule') || { title:'ตารางเวรประจำเดือน', subtitle:'ดูรายเดือน Export Excel / PDF / Print' };
      if ($id('pageTitle')) $id('pageTitle').textContent = item.title || 'ตารางเวรประจำเดือน';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = item.subtitle || 'ดูรายเดือน Export Excel / PDF / Print';
      try { if (typeof renderNav === 'function') renderNav(); } catch (err) { console.warn('[V126] renderNav skipped', err); }
      if ($id('pageContent')) $id('pageContent').innerHTML = renderScheduleSafeV126();
      return;
    }
    if (previousRenderPage) return previousRenderPage.apply(this, arguments);
  };

  // Force the sidebar/menu click for ตารางเวร to work even if another patch catches the click first.
  document.addEventListener('click', function(e) {
    const btn = e.target.closest?.('[data-page="schedule"]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    state.page = 'schedule';
    try { $id('sidebar')?.classList.remove('open'); document.body.classList.remove('sidebar-open'); } catch (_) {}
    renderPage();
  }, true);

  const css = document.createElement('style');
  css.textContent = `.schedule-safe-v126 .notice{margin:10px 0}.schedule-safe-v126 table{min-width:900px}`;
  document.head.appendChild(css);
})();
