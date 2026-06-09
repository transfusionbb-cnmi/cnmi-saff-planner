/* V118 safe restore: schedule views only + robust OT hours. Do not override admin pages. */
(function(){
  if (window.__CNMI_V118_SAFE_RESTORE__) return;
  window.__CNMI_V118_SAFE_RESTORE__ = true;

  function isMobileV118(){ return window.matchMedia && window.matchMedia('(max-width: 820px)').matches; }
  function esc(v){ return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
  function dutyShortV118(code){
    const c = String(code || '');
    if (c.startsWith('ช9')) return 'ช9';
    if (c.startsWith('ช4')) return 'ช4';
    return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL[c]) ? DUTY_LABEL[c] : c;
  }
  function getRosterStaffV118(){
    try { return orderedStaff((state.staff || []).filter(s => isRosterEnabled(s))); }
    catch(e){ return state.staff || []; }
  }
  function getMonthAssignmentsV118(){
    try { return getAssignmentsForMonth(state.monthKey || todayStr().slice(0,7)); }
    catch(e){ return []; }
  }
  function staffColorStyleV118(staffId){
    const st = (state.staff || []).find(s => String(s.id) === String(staffId)) || staffId;
    let bg = '#dbeafe', fg = '#0f172a';
    try { bg = staffColor(st); fg = textColorFor(bg); } catch(e) {}
    return `--staff-bg:${bg};--staff-fg:${fg};background:${bg};color:${fg}`;
  }
  function assignmentSortV118(a,b){ return String(a.duty_date || '').localeCompare(String(b.duty_date || '')) || String(a.duty_code || '').localeCompare(String(b.duty_code || '')); }
  function dutiesForStaffV118(assignments, staffId){ return (assignments || []).filter(a => String(a.staff_id) === String(staffId)).sort(assignmentSortV118); }
  function assignmentsForDateV118(assignments, date){
    return (assignments || []).filter(a => String(a.duty_date) === String(date) && a.staff_id).sort((a,b)=>String(a.duty_code||'').localeCompare(String(b.duty_code||'')));
  }
  function buttonTradeV118(a){
    try { return canRequestTrade(a) ? `<button class="tiny-btn" data-trade-duty="${a.id || a._temp_id}">ขอแลก/ขาย/ยกเวร</button>` : ''; }
    catch(e){ return ''; }
  }

  function showDutyPopupV118(id){
    const assignments = getMonthAssignmentsV118();
    const a = assignments.find(x => String(x.id || x._temp_id) === String(id));
    if (!a) return;
    const st = (state.staff || []).find(s => String(s.id) === String(a.staff_id));
    showModal(`<h2>รายละเอียดเวร</h2>
      <p class="hint">${staffPill(a.staff_id)} • ${formatThaiDate(a.duty_date)} • ${esc(dutyShortV118(a.duty_code))}</p>
      <div class="confirm-actions">${buttonTradeV118(a)}<button class="primary-btn" data-app-alert-ok>ปิด</button></div>`);
  }
  function showPersonDutyPopupV118(staffId){
    const assignments = getMonthAssignmentsV118();
    const rows = dutiesForStaffV118(assignments, staffId);
    const detail = rows.map(a => `<tr><td>${formatThaiDate(a.duty_date)}</td><td>${esc(dutyShortV118(a.duty_code))}</td><td>${buttonTradeV118(a) || '-'}</td></tr>`).join('');
    showModal(`<h2>${staffPill(staffId)}</h2><p class="hint">รายการเวรประจำเดือน ${esc(state.monthKey || '')}</p>
      <div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>แลก/ขาย</th></tr></thead><tbody>${detail || '<tr><td colspan="3">ไม่มีเวรเดือนนี้</td></tr>'}</tbody></table></div>`);
  }

  function renderScheduleToolbarV118(){
    return `<div class="toolbar no-print schedule-toolbar-v118">
      <label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(state.monthKey)}"></label>
      <button class="ghost-btn" data-export-schedule-excel>Export Excel</button>
      <button class="ghost-btn" data-print-page>Export PDF / พิมพ์</button>
      <button class="soft-btn" data-show-fairness>กดชื่อคนเพื่อดูสถิติ หรือดูสมดุลเวร</button>
    </div>`;
  }
  function tabBtnV118(view, label, target){
    const key = target === 'desktop' ? (state.scheduleDesktopView || 'table') : (state.scheduleMobileView || 'table');
    const attr = target === 'desktop' ? 'data-schedule-desktop-view' : 'data-schedule-mobile-view';
    return `<button type="button" class="${key === view ? 'primary-btn' : 'ghost-btn'}" ${attr}="${view}">${label}</button>`;
  }

  function renderCalendarCardsV118(assignments, compact=false){
    const { y, m } = getMonthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    const firstDow = new Date(y, m-1, 1).getDay();
    const cells = [];
    for (let i=0;i<firstDow;i++) cells.push({ blank:true, day:'' });
    for (let day=1; day<=last; day++) cells.push({ day, date:`${y}-${pad(m)}-${pad(day)}` });
    const tail = (7 - (cells.length % 7)) % 7;
    for (let i=0;i<tail;i++) cells.push({ blank:true, day:'' });
    return `<div class="schedule-calendar-v118 ${compact?'compact':''}">
      <div class="calendar-week-head-v118"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>
      <div class="calendar-grid-v118">${cells.map(c => {
        if (c.blank) return `<div class="calendar-day-v118 empty"></div>`;
        const rows = assignmentsForDateV118(assignments, c.date);
        const hidden = Math.max(0, rows.length - (compact ? 4 : 8));
        const shown = rows.slice(0, compact ? 4 : 8);
        return `<div class="calendar-day-v118 ${isWeekend(c.date) || isHolidayDate(c.date) ? 'weekend' : ''}" data-date="${c.date}">
          <div class="cal-date-v118"><b>${c.day}</b><span>${parseDate(c.date).toLocaleDateString('th-TH', {weekday:'short'})}</span></div>
          ${shown.map(a => `<button type="button" class="cal-duty-v118" data-duty-popup-v118="${a.id || a._temp_id}" style="${staffColorStyleV118(a.staff_id)}"><span>${esc(dutyShortV118(a.duty_code))}</span> <b>${esc(staffNick(a.staff_id))}</b></button>`).join('')}
          ${hidden ? `<div class="cal-more-v118">+${hidden}</div>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  function renderPersonCardsV118(assignments){
    const active = getRosterStaffV118();
    return `<div class="person-cards-v118">${active.map(s => {
      const rows = dutiesForStaffV118(assignments, s.id);
      return `<button type="button" class="person-card-v118" data-schedule-person-popup-v118="${s.id}" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}">
        <div class="person-head-v118"><b>${esc(s.nickname || s.full_name)}</b><span>${rows.length} เวร</span></div>
        <div class="person-list-v118">${rows.slice(0,8).map(a => `<span>${formatThaiDate(a.duty_date)} ${esc(dutyShortV118(a.duty_code))}</span>`).join('') || '<span class="muted">ไม่มีเวรเดือนนี้</span>'}</div>
      </button>`;
    }).join('')}</div>`;
  }

  function countDaysOffV118(staffId, assignments){
    const { y, m } = getMonthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    const days = new Set();
    for (let day=1; day<=last; day++) {
      const date = `${y}-${pad(m)}-${pad(day)}`;
      const hasDuty = (assignments || []).some(a => String(a.staff_id) === String(staffId) && String(a.duty_date) === date);
      if ((isWeekend(date) || isHolidayDate(date)) && !hasDuty) days.add(date);
    }
    (state.leaves || []).forEach(l => {
      if (String(l.staff_id) !== String(staffId) || l.type !== 'ไม่รับเวร') return;
      datesBetween(l.start_date, l.end_date).forEach(date => { if (isWeekend(date)) days.add(date); });
    });
    return days.size;
  }

  function renderOtCardsV118(assignments){
    const stats = calcFairness((assignments || []).filter(x => x.staff_id));
    const active = getRosterStaffV118();
    return `<div class="ot-cards-v118">${active.map(s => {
      const rows = dutiesForStaffV118(assignments, s.id);
      const r = stats[s.id] || {};
      const count = pred => rows.filter(pred).length;
      return `<button type="button" class="ot-card-v118" data-schedule-person-popup-v118="${s.id}" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}">
        <div class="ot-name-v118"><span class="pill-name-v118" style="background:${staffColor(s)};color:${textColorFor(staffColor(s))}">${esc(s.nickname || s.full_name)}</span></div>
        <div class="ot-grid-v118">
          <span>ชั่วโมงเวร/OT</span><b>${Number(r.hours || 0).toFixed(1)}</b>
          <span>ชั่วโมงอินชาร์จ</span><b>0.0</b>
          <span>รวม OT</span><b>${Number(r.hours || 0).toFixed(1)}</b>
          <span>เงินประมาณ</span><b>${Number(r.pay || 0).toLocaleString()}</b>
          <span>จำนวนเวร</span><b>${rows.length}</b>
          <span>วันที่ได้หยุด</span><b>${countDaysOffV118(s.id, assignments)}</b>
          <span>ชบด1</span><b>${count(a => a.duty_code === 'ชบด1')}</b>
          <span>ชบด2</span><b>${count(a => a.duty_code === 'ชบด2')}</b>
          <span>ชบด3</span><b>${count(a => a.duty_code === 'ชบด3')}</b>
          <span>ช9</span><b>${count(a => String(a.duty_code||'').startsWith('ช9'))}</b>
          <span>ช3A</span><b>${count(a => a.duty_code === 'ช3A')}</b>
          <span>ช3B</span><b>${count(a => a.duty_code === 'ช3B')}</b>
          <span>ช4</span><b>${count(a => String(a.duty_code||'').startsWith('ช4'))}</b>
        </div>
      </button>`;
    }).join('')}</div>`;
  }

  function renderScheduleMainViewV118(assignments, target){
    const view = target === 'desktop' ? (state.scheduleDesktopView || 'table') : (state.scheduleMobileView || 'table');
    if (view === 'day') return renderCalendarCardsV118(assignments, target === 'mobile');
    if (view === 'person') return renderPersonCardsV118(assignments);
    if (view === 'ot') return renderOtCardsV118(assignments);
    try { return renderSchedulePersonMatrix(assignments); }
    catch(e) { return renderReadOnlySchedule(assignments); }
  }

  window.renderMonthlySchedulePage = renderMonthlySchedulePage = function renderMonthlySchedulePageV118(){
    if (!state.scheduleDesktopView) state.scheduleDesktopView = 'table';
    if (!state.scheduleMobileView) state.scheduleMobileView = 'table';
    const assignments = getMonthAssignmentsV118();
    return `<div class="card schedule-page-card schedule-page-v118">
      ${renderScheduleToolbarV118()}
      <div class="schedule-desktop-only-v118">
        <div class="desktop-schedule-tabs-v118 no-print">
          ${tabBtnV118('table','ตารางทั้งเดือน','desktop')}
          ${tabBtnV118('day','ดูตามวัน','desktop')}
          ${tabBtnV118('person','ดูตามคน','desktop')}
        </div>
        <div class="schedule-view-v118">${renderScheduleMainViewV118(assignments, 'desktop')}</div>
      </div>
      <div class="schedule-mobile-only-v118">
        <div class="mobile-schedule-tabs no-print">
          ${tabBtnV118('day','ดูตามวัน','mobile')}
          ${tabBtnV118('person','ดูตามคน','mobile')}
          ${tabBtnV118('ot','สรุป OT','mobile')}
          ${tabBtnV118('table','ตาราง','mobile')}
        </div>
        <div class="schedule-view-v118">${renderScheduleMainViewV118(assignments, 'mobile')}</div>
      </div>
      ${renderDutyTradePanel(assignments)}
    </div>`;
  };

  // Robust OT hours for end_time forms like HH:mm or HH:mm:ss.
  window.calcOtHours = calcOtHours = function calcOtHoursV118(r){
    const note = String(r?.note || '');
    const auto = note.match(/AUTO_HOURS\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (auto) return Math.max(0, Number(auto[1]));
    if (!r?.work_date || !r?.end_time) return 0;
    const endText = String(r.end_time).trim();
    const m = endText.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return 0;
    const start = new Date(`${r.work_date}T16:00:00`);
    let end = new Date(`${r.work_date}T${pad(Number(m[1]))}:${m[2]}:00`);
    if (Number.isNaN(end.getTime())) return 0;
    if (end < start) end = new Date(end.getTime() + 24*36e5);
    return Math.round(Math.max(0, (end - start)/36e5) * 10) / 10;
  };

  const oldRenderPageV118 = window.renderPage || renderPage;
  window.renderPage = renderPage = function renderPageV118(){
    if (state.page === 'schedule') {
      const item = NAV_ITEMS.find(x => x.id === state.page) || NAV_ITEMS[0];
      $('pageTitle').textContent = item.title;
      $('pageSubtitle').textContent = item.subtitle;
      renderNav();
      $('pageContent').innerHTML = renderMonthlySchedulePage();
      return;
    }
    return oldRenderPageV118();
  };

  document.addEventListener('click', function(e){
    const t = e.target.closest?.('[data-schedule-desktop-view],[data-schedule-mobile-view],[data-duty-popup-v118],[data-schedule-person-popup-v118]');
    if (!t) return;
    if (t.dataset.scheduleDesktopView) {
      e.preventDefault(); e.stopImmediatePropagation();
      state.scheduleDesktopView = t.dataset.scheduleDesktopView || 'table';
      renderPage();
      return;
    }
    if (t.dataset.scheduleMobileView) {
      e.preventDefault(); e.stopImmediatePropagation();
      state.scheduleMobileView = t.dataset.scheduleMobileView || 'table';
      renderPage();
      return;
    }
    if (t.dataset.dutyPopupV118) {
      e.preventDefault(); e.stopImmediatePropagation();
      showDutyPopupV118(t.dataset.dutyPopupV118);
      return;
    }
    if (t.dataset.schedulePersonPopupV118) {
      e.preventDefault(); e.stopImmediatePropagation();
      showPersonDutyPopupV118(t.dataset.schedulePersonPopupV118);
      return;
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .schedule-desktop-only-v118{display:block}.schedule-mobile-only-v118{display:none}
    .desktop-schedule-tabs-v118,.mobile-schedule-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 16px}
    .schedule-view-v118{margin-top:8px}
    .calendar-week-head-v118{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin:8px 0 8px;text-align:center;color:#64748b;font-weight:700}
    .calendar-grid-v118{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}
    .calendar-day-v118{min-height:150px;border:1px solid #dbe7f3;border-radius:16px;background:#fff;padding:10px;overflow:hidden}
    .calendar-day-v118.weekend{background:#fff9e8}.calendar-day-v118.empty{background:#f8fafc;opacity:.7}
    .cal-date-v118{display:flex;gap:8px;align-items:baseline;margin-bottom:8px}.cal-date-v118 b{font-size:18px}.cal-date-v118 span{color:#64748b}
    .cal-duty-v118{display:block;width:100%;border:0;border-radius:9px;margin:4px 0;padding:5px 8px;text-align:left;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
    .cal-more-v118{color:#64748b;font-weight:700;margin-top:4px}.person-cards-v118{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
    .person-card-v118,.ot-card-v118{border:1px solid #dbe7f3;background:#fff;border-radius:16px;padding:12px;text-align:left;cursor:pointer}
    .person-head-v118{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px}.person-head-v118 b{background:var(--staff-bg);color:var(--staff-fg);border-radius:999px;padding:5px 12px}
    .person-list-v118{display:flex;flex-direction:column;gap:4px;color:#334155}.ot-cards-v118{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.ot-grid-v118{display:grid;grid-template-columns:1fr auto;gap:6px 10px;margin-top:10px}.ot-grid-v118 span{color:#64748b}.ot-grid-v118 b{color:#0f172a}.pill-name-v118{display:inline-block;border-radius:999px;padding:5px 12px;font-weight:700}
    @media(max-width:820px){
      .schedule-desktop-only-v118{display:none!important}.schedule-mobile-only-v118{display:block!important}.schedule-page-v118 .desktop-schedule-summary{display:none!important}
      .schedule-page-v118>.desktop-schedule-table,.schedule-page-v118>.table-wrap:not(.mobile-schedule-matrix-wrap){display:none!important}
      .mobile-schedule-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.mobile-schedule-tabs button{padding:12px 6px;font-size:16px;border-radius:14px}
      .schedule-calendar-v118.compact .calendar-week-head-v118{gap:6px;font-size:14px}.schedule-calendar-v118.compact .calendar-grid-v118{gap:6px}.schedule-calendar-v118.compact .calendar-day-v118{min-height:92px;border-radius:12px;padding:7px}.schedule-calendar-v118.compact .cal-duty-v118{font-size:12px;padding:3px 5px;margin:3px 0;border-radius:7px}.schedule-calendar-v118.compact .cal-date-v118{margin-bottom:4px}.schedule-calendar-v118.compact .cal-date-v118 b{font-size:18px}
      .schedule-person-matrix th:first-child{min-width:112px!important;width:112px!important;font-size:14px!important;line-height:1.1!important}.schedule-person-matrix th,.schedule-person-matrix td{height:34px!important;min-height:34px!important;padding:3px 4px!important;font-size:12px!important}.schedule-person-matrix .trade-btn{display:none!important}.schedule-person-matrix b{font-size:12px!important}.mobile-schedule-matrix-wrap{max-height:none!important}
      .person-cards-v118,.ot-cards-v118{grid-template-columns:1fr}.trade-panel{margin-top:16px}
    }
  `;
  document.head.appendChild(style);
})();
