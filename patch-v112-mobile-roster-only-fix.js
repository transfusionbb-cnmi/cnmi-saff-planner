/* CNMI Staff Planner Patch V112
   Mobile-only roster tab fix
   - ตาราง tab = Excel roster only
   - ดูตามวัน = compact month cards/grid
   - สรุป OT = mobile cards
   - Excel roster no longer sticks across all mobile tabs
   - Desktop behavior untouched
*/
(function patchV112(){
  window.CNMI_PATCH_V112 = true;

  const DUTY_ORDER = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง','ช4-MT/แตง'];

  function isMobile(){
    try { return window.matchMedia && window.matchMedia('(max-width: 820px)').matches; }
    catch(_) { return window.innerWidth <= 820; }
  }
  function normDuty(code=''){
    const c = String(code || '').trim();
    if (c === 'ช9-MT') return 'ช9-MT/แตง';
    if (c === 'ช4' || c === 'ช4A' || c === 'ช4B') return 'ช4-MT/แตง';
    return c;
  }
  function dutyLabel(code=''){
    const c = normDuty(code);
    if (c === 'ช9-เคิก' || c === 'ช9-MT/แตง') return 'ช9';
    if (c === 'ช4-MT/แตง') return 'ช4';
    return c;
  }
  function dutySort(code){
    const idx = DUTY_ORDER.indexOf(normDuty(code));
    return idx < 0 ? 999 : idx;
  }
  function monthParts(){
    const { y, m } = getMonthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    return { y, m, last, days:Array.from({ length:last }, (_, i) => i + 1) };
  }
  function activeStaff(assignments){
    return orderedStaff((state.staff || []).filter(s => isRosterEnabled(s) || (assignments || []).some(a => String(a.staff_id) === String(s.id))));
  }
  function byStaffDate(assignments){
    const map = {};
    (assignments || []).filter(a => a.staff_id).forEach(a0 => {
      const a = { ...a0, duty_code:normDuty(a0.duty_code) };
      const key = `${a.staff_id}|${a.duty_date}`;
      map[key] = map[key] || [];
      map[key].push(a);
    });
    Object.values(map).forEach(arr => arr.sort((a,b) => dutySort(a.duty_code) - dutySort(b.duty_code)));
    return map;
  }
  function leaveRows(staffId, date){
    return (state.leaves || []).filter(l => String(l.staff_id) === String(staffId) && overlapsDate(l, date));
  }
  function leaveText(staffId, date){
    const rows = leaveRows(staffId, date);
    if (!rows.length) return '';
    const priority = rows.find(r => r.type === 'ไม่รับเวร') || rows[0];
    const map = { 'ลาพักร้อน':'Vac', 'ลากิจ':'Per', 'ลาป่วย':'Sick', 'ลาคลอด':'Mat', 'ไม่รับเวร':'ไม่รับเวร' };
    return map[priority.type] || priority.type || 'ลา';
  }
  function hasLeaveType(staffId, date, types){
    return leaveRows(staffId, date).some(r => types.includes(r.type));
  }
  function formatDow(date){
    return parseDate(date).toLocaleDateString('th-TH', { weekday:'short' });
  }

  function renderExcel(assignments){
    const { y, m, days } = monthParts();
    const active = activeStaff(assignments);
    const map = byStaffDate(assignments);
    return `<div class="excel-roster-section-v107 excel-roster-section-v109 excel-roster-section-v110 excel-roster-section-v111 excel-roster-section-v112 mobile-only-roster-v111 mobile-only-roster-v112">
      <div class="section-title mobile-roster-title-v112"><div><h3>ตารางเวรรายเดือนแบบ Excel ${state.monthKey}</h3></div></div>
      <div class="table-wrap excel-roster-wrap-v107 excel-roster-wrap-v109 excel-roster-wrap-v110 excel-roster-wrap-v111 excel-roster-wrap-v112"><table id="scheduleTable" class="excel-roster-table-v107 excel-roster-table-v109 excel-roster-table-v110 excel-roster-table-v111 excel-roster-table-v112"><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th>${days.map(day => {
        const date = `${y}-${pad(m)}-${pad(day)}`;
        const cls = isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : '';
        return `<th class="${cls}"><span>${day}</span><small>${formatDow(date)}</small></th>`;
      }).join('')}</tr></thead><tbody>${active.map(st => `<tr><th class="sticky-col staff-col staff-name-cell" style="--staff-bg:${staffColor(st)};--staff-fg:${textColorFor(staffColor(st))}" title="${escapeHtml(st.full_name || st.nickname || '')}"><b>${escapeHtml(st.nickname || st.full_name)}</b></th>${days.map(day => {
        const date = `${y}-${pad(m)}-${pad(day)}`;
        const rows = map[`${st.id}|${date}`] || [];
        const txt = leaveText(st.id, date);
        const cls = [isHolidayDate(date) ? 'holiday-cell' : '', isWeekend(date) ? 'weekend-cell' : '', txt ? 'leave-cell' : '', rows.length ? 'has-duty-cell' : ''].join(' ');
        const cellText = rows.length ? rows.map(a => escapeHtml(dutyLabel(a.duty_code))).join('<br>') : escapeHtml(txt || '');
        const ids = rows.map(a => a.id || a._temp_id).filter(Boolean).join(',');
        return `<td class="${cls}" data-roster-excel-cell="${st.id}|${date}|${ids}" title="${escapeHtml(staffNick(st.id))} ${formatThaiDate(date)}"><button type="button" class="excel-duty-cell-btn" data-roster-excel-cell="${st.id}|${date}|${ids}">${cellText || '&nbsp;'}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
    </div>`;
  }

  function renderDayGrid(assignments){
    const { y, m, last } = monthParts();
    const first = new Date(y, m - 1, 1).getDay(); // 0 Sun
    const blanks = Array.from({ length:first }, (_, i) => `<div class="month-day-card-v112 muted-card-v112"><b></b></div>`).join('');
    const cards = Array.from({ length:last }, (_, i) => i + 1).map(day => {
      const date = `${y}-${pad(m)}-${pad(day)}`;
      const slots = (assignments || []).filter(a => a.duty_date === date && a.staff_id).sort((a,b)=>dutySort(a.duty_code)-dutySort(b.duty_code));
      const maxShow = 4;
      return `<button type="button" class="month-day-card-v112 ${isHolidayDate(date)||isWeekend(date)?'weekend-row':''}" data-day-detail="${date}">
        <div class="month-day-head-v112"><b>${day}</b><span>${formatDow(date)}</span></div>
        <div class="month-duty-list-v112">${slots.slice(0,maxShow).map(a => `<span><b>${escapeHtml(dutyLabel(a.duty_code))}</b> ${escapeHtml(staffNick(a.staff_id))}</span>`).join('')}${slots.length > maxShow ? `<em>+${slots.length - maxShow}</em>` : ''}${!slots.length ? `<small>ไม่มีเวร</small>` : ''}</div>
      </button>`;
    }).join('');
    return `<div class="mobile-day-month-v112"><div class="month-dow-row-v112"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div><div class="month-grid-v112">${blanks}${cards}</div></div>`;
  }

  function renderPerson(assignments){
    const active = activeStaff(assignments);
    return `<div class="mobile-schedule-person-list mobile-person-list-v112">${active.map(s => {
      const rows = (assignments || []).filter(a => String(a.staff_id) === String(s.id)).sort((a,b)=>String(a.duty_date).localeCompare(String(b.duty_date)) || dutySort(a.duty_code)-dutySort(b.duty_code));
      return `<div class="schedule-person-card" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}"><div class="person-card-head"><b>${escapeHtml(s.nickname || s.full_name)}</b><span>${rows.length} เวร</span></div>${rows.length ? rows.map(a => `<div class="person-duty-line"><span>${formatThaiDate(a.duty_date)}</span><b>${escapeHtml(dutyLabel(a.duty_code))}</b>${renderTradeButton(a)}</div>`).join('') : '<span class="muted">ไม่มีเวรเดือนนี้</span>'}</div>`;
    }).join('')}</div>`;
  }

  function countDaysOff(staffId, assignments){
    const { y, m, days } = monthParts();
    let count = 0;
    days.forEach(day => {
      const date = `${y}-${pad(m)}-${pad(day)}`;
      const hasDuty = (assignments || []).some(a => String(a.staff_id) === String(staffId) && a.duty_date === date);
      if (hasDuty) return;
      if (hasLeaveType(staffId, date, ['ลาพักร้อน','ลากิจ','ลาป่วย','ลาคลอด'])) return;
      if (isWeekend(date) || isHolidayDate(date)) count += 1;
    });
    return count;
  }
  function dutyCounts(staffId, assignments){
    const c = { chbd1:0, chbd2:0, chbd3:0, ch9:0, ch3A:0, ch3B:0, ch4:0, total:0 };
    (assignments || []).filter(a => String(a.staff_id) === String(staffId)).forEach(a => {
      const d = normDuty(a.duty_code);
      c.total += 1;
      if (d === 'ชบด1') c.chbd1 += 1;
      else if (d === 'ชบด2') c.chbd2 += 1;
      else if (d === 'ชบด3') c.chbd3 += 1;
      else if (d === 'ช3A') c.ch3A += 1;
      else if (d === 'ช3B') c.ch3B += 1;
      else if (d === 'ช9-เคิก' || d === 'ช9-MT/แตง') c.ch9 += 1;
      else if (d === 'ช4-MT/แตง') c.ch4 += 1;
    });
    return c;
  }
  function renderOtCards(assignments){
    const stats = calcFairness((assignments || []).filter(x => x.staff_id));
    const active = activeStaff(assignments);
    const inchargeId = currentInchargeForMonth(state.monthKey);
    return `<div class="mobile-ot-summary-list-v111 mobile-ot-summary-list-v112">${active.map(s => {
      const r = stats[s.id] || {};
      const counts = dutyCounts(s.id, assignments);
      const hours = Number(r.hours || 0);
      const incharge = String(inchargeId || '') === String(s.id) ? 8 : 0;
      const totalHours = hours + incharge;
      const pay = Number(r.pay || 0);
      return `<button class="ot-summary-card-v111 ot-summary-card-v112" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}" data-staff-stat="${s.id}" type="button">
        <div class="ot-card-head-v111"><span class="staff-pill" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}">${escapeHtml(s.nickname || s.full_name)}</span></div>
        <div class="ot-card-grid-v111">
          <span>ชั่วโมงเวร/OT:</span><b>${hours.toFixed(1)}</b>
          <span>ชั่วโมงอินชาร์จ:</span><b>${incharge.toFixed(1)}</b>
          <span>รวม OT:</span><b>${totalHours.toFixed(1)}</b>
          <span>เงินประมาณ:</span><b>${pay.toLocaleString()}</b>
          <span>จำนวนเวร:</span><b>${counts.total}</b>
          <span>วันที่ได้หยุด:</span><b>${countDaysOff(s.id, assignments)}</b>
        </div>
        <div class="ot-duty-counts-v111">
          <span>ชบด1: <b>${counts.chbd1}</b></span><span>ชบด2: <b>${counts.chbd2}</b></span><span>ชบด3: <b>${counts.chbd3}</b></span><span>ช9: <b>${counts.ch9}</b></span><span>ช3A: <b>${counts.ch3A}</b></span><span>ช3B: <b>${counts.ch3B}</b></span><span>ช4: <b>${counts.ch4}</b></span>
        </div>
      </button>`;
    }).join('')}</div>`;
  }

  const oldRenderReadOnly = window.renderReadOnlySchedule || renderReadOnlySchedule;
  renderReadOnlySchedule = function renderReadOnlyScheduleV112(assignments){
    if (!isMobile()) return oldRenderReadOnly(assignments);
    if (!assignments.length) return empty('ยังไม่มีตารางเวรของเดือนนี้');
    const view = state.scheduleMobileView || 'table';
    let html = '';
    if (view === 'day') html = renderDayGrid(assignments);
    else if (view === 'person') html = renderPerson(assignments);
    else if (view === 'ot') html = renderOtCards(assignments);
    else html = renderExcel(assignments);
    return `<div class="mobile-schedule-view-v111 mobile-schedule-view-v112">${html}</div>`;
  };
  window.renderReadOnlySchedule = renderReadOnlySchedule;

  const oldRenderMonthly = window.renderMonthlySchedulePage || renderMonthlySchedulePage;
  renderMonthlySchedulePage = function renderMonthlySchedulePageV112(){
    if (isMobile() && !state._v112MobileScheduleDefaulted) {
      state.scheduleMobileView = 'table';
      state._v112MobileScheduleDefaulted = true;
    }
    return oldRenderMonthly();
  };
  window.renderMonthlySchedulePage = renderMonthlySchedulePage;

  if (isMobile()) state.scheduleMobileView = state.scheduleMobileView || 'table';

  document.addEventListener('click', function(e){
    const t = e.target.closest?.('[data-schedule-mobile-view]');
    if (!t) return;
    state.scheduleMobileView = t.dataset.scheduleMobileView || 'table';
    state._v112MobileScheduleDefaulted = true;
  }, true);
})();
