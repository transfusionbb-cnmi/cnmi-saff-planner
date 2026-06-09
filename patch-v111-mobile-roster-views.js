/* CNMI Staff Planner Patch V111
   Mobile-only roster page polish
   - Mobile default view = ตาราง (Excel roster)
   - Excel roster appears only inside the ตาราง tab on mobile
   - ดูตามวัน = calendar cards
   - สรุป OT = readable cards with detailed duty counts and days off
   - Keep desktop behavior untouched
*/
(function patchV111(){
  window.CNMI_PATCH_V111 = true;

  const oldRenderReadOnlyScheduleV111 = window.renderReadOnlySchedule || renderReadOnlySchedule;
  const oldHandleClickV111 = window.handleClick || handleClick;

  const DUTY_ORDER_V111 = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง','ช4-MT/แตง'];

  function isMobileV111(){
    try { return window.matchMedia && window.matchMedia('(max-width: 820px)').matches; }
    catch(_) { return window.innerWidth <= 820; }
  }
  function normDutyV111(code=''){
    const c = String(code || '').trim();
    if (c === 'ช9-MT') return 'ช9-MT/แตง';
    if (c === 'ช4' || c === 'ช4A' || c === 'ช4B') return 'ช4-MT/แตง';
    return c;
  }
  function dutyLabelV111(code=''){
    const c = normDutyV111(code);
    if (c === 'ช9-เคิก' || c === 'ช9-MT/แตง') return 'ช9';
    if (c === 'ช4-MT/แตง') return 'ช4';
    return c;
  }
  function dutySortV111(code){
    const idx = DUTY_ORDER_V111.indexOf(normDutyV111(code));
    return idx < 0 ? 999 : idx;
  }
  function staffActiveForRosterV111(assignments){
    return orderedStaff((state.staff || []).filter(s => isRosterEnabled(s) || (assignments || []).some(a => String(a.staff_id) === String(s.id))));
  }
  function rowsByStaffDateV111(assignments){
    const map = {};
    (assignments || []).filter(a => a.staff_id).forEach(a0 => {
      const a = { ...a0, duty_code: normDutyV111(a0.duty_code) };
      const key = `${a.staff_id}|${a.duty_date}`;
      map[key] = map[key] || [];
      map[key].push(a);
    });
    Object.values(map).forEach(arr => arr.sort((a,b) => dutySortV111(a.duty_code) - dutySortV111(b.duty_code)));
    return map;
  }
  function leaveRowsV111(staffId, date){
    return (state.leaves || []).filter(l => String(l.staff_id) === String(staffId) && overlapsDate(l, date));
  }
  function leaveTextV111(staffId, date){
    const rows = leaveRowsV111(staffId, date);
    if (!rows.length) return '';
    const priority = rows.find(r => r.type === 'ไม่รับเวร') || rows[0];
    const map = { 'ลาพักร้อน':'Vac', 'ลากิจ':'Per', 'ลาป่วย':'Sick', 'ลาคลอด':'Mat', 'ไม่รับเวร':'ไม่รับเวร' };
    return map[priority.type] || priority.type || 'ลา';
  }
  function hasLeaveTypeV111(staffId, date, types){
    return leaveRowsV111(staffId, date).some(r => types.includes(r.type));
  }
  function formatDowV111(date){
    return parseDate(date).toLocaleDateString('th-TH', { weekday:'short' });
  }
  function monthPartsV111(){
    const { y, m } = getMonthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    return { y, m, last, days:Array.from({ length:last }, (_, i) => i + 1) };
  }

  function renderMobileExcelRosterV111(assignments){
    const { y, m, days } = monthPartsV111();
    const active = staffActiveForRosterV111(assignments);
    const byStaffDate = rowsByStaffDateV111(assignments);
    return `<div class="excel-roster-section-v107 excel-roster-section-v109 excel-roster-section-v110 excel-roster-section-v111 mobile-only-roster-v111">
      <div class="section-title"><div><h3>ตารางเวรรายเดือนแบบ Excel ${state.monthKey}</h3></div></div>
      <div class="table-wrap excel-roster-wrap-v107 excel-roster-wrap-v109 excel-roster-wrap-v110 excel-roster-wrap-v111"><table id="scheduleTable" class="excel-roster-table-v107 excel-roster-table-v109 excel-roster-table-v110 excel-roster-table-v111"><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th>${days.map(day => {
        const date = `${y}-${pad(m)}-${pad(day)}`;
        const cls = isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : '';
        return `<th class="${cls}"><span>${day}</span><small>${formatDowV111(date)}</small></th>`;
      }).join('')}</tr></thead><tbody>
        ${active.map(st => `<tr><th class="sticky-col staff-col staff-name-cell" style="--staff-bg:${staffColor(st)};--staff-fg:${textColorFor(staffColor(st))}" title="${escapeHtml(st.full_name || st.nickname || '')}"><b>${escapeHtml(st.nickname || st.full_name)}</b></th>${days.map(day => {
          const date = `${y}-${pad(m)}-${pad(day)}`;
          const rows = byStaffDate[`${st.id}|${date}`] || [];
          const leaveText = leaveTextV111(st.id, date);
          const cls = [isHolidayDate(date) ? 'holiday-cell' : '', isWeekend(date) ? 'weekend-cell' : '', leaveText ? 'leave-cell' : '', rows.length ? 'has-duty-cell' : ''].join(' ');
          const cellText = rows.length ? rows.map(a => escapeHtml(dutyLabelV111(a.duty_code))).join('<br>') : escapeHtml(leaveText || '');
          const ids = rows.map(a => a.id || a._temp_id).filter(Boolean).join(',');
          return `<td class="${cls}" data-roster-excel-cell="${st.id}|${date}|${ids}" title="${escapeHtml(staffNick(st.id))} ${formatThaiDate(date)}"><button type="button" class="excel-duty-cell-btn" data-roster-excel-cell="${st.id}|${date}|${ids}">${cellText || '&nbsp;'}</button></td>`;
        }).join('')}</tr>`).join('')}
      </tbody></table></div>
    </div>`;
  }

  function renderMobileScheduleByDayV111(assignments){
    const { y, m, last } = monthPartsV111();
    return `<div class="mobile-schedule-list mobile-day-calendar-v111">${Array.from({ length:last }, (_, i) => i + 1).map(day => {
      const date = `${y}-${pad(m)}-${pad(day)}`;
      const slots = (assignments || [])
        .filter(a => a.duty_date === date && a.staff_id)
        .sort((a,b) => dutySortV111(a.duty_code) - dutySortV111(b.duty_code));
      return `<div class="schedule-day-card ${isHolidayDate(date)||isWeekend(date)?'weekend-row':''}"><div class="mobile-day-head"><b>${day}</b><span>${formatDowV111(date)}</span>${isHolidayDate(date) ? badge(holidayName(date),'yellow') : ''}</div>${slots.length ? slots.map(slot => `<div class="mobile-duty-line"><b>${escapeHtml(dutyLabelV111(slot.duty_code))}</b><span>${staffPill(slot.staff_id, { button:true, attrs:`data-staff-stat="${slot.staff_id}" type="button"` })}</span>${renderTradeButton(slot)}</div>`).join('') : '<span class="muted">ไม่มีเวร</span>'}</div>`;
    }).join('')}</div>`;
  }

  function renderMobileScheduleByPersonV111(assignments){
    const active = staffActiveForRosterV111(assignments);
    return `<div class="mobile-schedule-person-list">${active.map(s => {
      const rows = (assignments || []).filter(a => String(a.staff_id) === String(s.id)).sort((a,b)=>String(a.duty_date).localeCompare(String(b.duty_date)) || dutySortV111(a.duty_code)-dutySortV111(b.duty_code));
      return `<div class="schedule-person-card" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}"><div class="person-card-head"><b>${escapeHtml(s.nickname || s.full_name)}</b><span>${rows.length} เวร</span></div>${rows.length ? rows.map(a => `<div class="person-duty-line"><span>${formatThaiDate(a.duty_date)}</span><b>${escapeHtml(dutyLabelV111(a.duty_code))}</b>${renderTradeButton(a)}</div>`).join('') : '<span class="muted">ไม่มีเวรเดือนนี้</span>'}</div>`;
    }).join('')}</div>`;
  }

  function countDaysOffV111(staffId, assignments){
    const { y, m, days } = monthPartsV111();
    let count = 0;
    days.forEach(day => {
      const date = `${y}-${pad(m)}-${pad(day)}`;
      const hasDuty = (assignments || []).some(a => String(a.staff_id) === String(staffId) && a.duty_date === date);
      if (hasDuty) return;
      if (hasLeaveTypeV111(staffId, date, ['ลาพักร้อน','ลากิจ','ลาป่วย','ลาคลอด'])) return;
      const noDutyWeekend = isWeekend(date) && hasLeaveTypeV111(staffId, date, ['ไม่รับเวร']);
      if (isWeekend(date) || isHolidayDate(date) || noDutyWeekend) count += 1;
    });
    return count;
  }
  function dutyCountsV111(staffId, assignments){
    const c = { chbd1:0, chbd2:0, chbd3:0, ch9:0, ch3A:0, ch3B:0, ch4:0, total:0 };
    (assignments || []).filter(a => String(a.staff_id) === String(staffId)).forEach(a => {
      const d = normDutyV111(a.duty_code);
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
  function renderMobileScheduleOtCardsV111(assignments){
    const stats = calcFairness((assignments || []).filter(x => x.staff_id));
    const active = staffActiveForRosterV111(assignments);
    return `<div class="mobile-ot-summary-list-v111">${active.map(s => {
      const r = stats[s.id] || {};
      const counts = dutyCountsV111(s.id, assignments);
      const hours = Number(r.hours || 0);
      const incharge = 0;
      const totalHours = hours + incharge;
      const pay = Number(r.pay || 0);
      return `<button class="ot-summary-card-v111" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}" data-staff-stat="${s.id}" type="button">
        <div class="ot-card-head-v111"><span class="staff-pill" style="--staff-bg:${staffColor(s)};--staff-fg:${textColorFor(staffColor(s))}">${escapeHtml(s.nickname || s.full_name)}</span></div>
        <div class="ot-card-grid-v111">
          <span>ชั่วโมงเวร/OT:</span><b>${hours.toFixed(1)}</b>
          <span>ชั่วโมงอินชาร์จ:</span><b>${incharge.toFixed(1)}</b>
          <span>รวม OT:</span><b>${totalHours.toFixed(1)}</b>
          <span>เงินประมาณ:</span><b>${pay.toLocaleString()}</b>
          <span>จำนวนเวร:</span><b>${counts.total}</b>
          <span>วันที่ได้หยุด:</span><b>${countDaysOffV111(s.id, assignments)}</b>
        </div>
        <div class="ot-duty-counts-v111">
          <span>ชบด1: <b>${counts.chbd1}</b></span>
          <span>ชบด2: <b>${counts.chbd2}</b></span>
          <span>ชบด3: <b>${counts.chbd3}</b></span>
          <span>ช9: <b>${counts.ch9}</b></span>
          <span>ช3A: <b>${counts.ch3A}</b></span>
          <span>ช3B: <b>${counts.ch3B}</b></span>
          <span>ช4: <b>${counts.ch4}</b></span>
        </div>
      </button>`;
    }).join('')}</div>`;
  }

  function renderMobileSelectedViewV111(assignments){
    const view = state._v111MobileScheduleTouched ? (state.scheduleMobileView || 'table') : 'table';
    if (view === 'person') return renderMobileScheduleByPersonV111(assignments);
    if (view === 'ot') return renderMobileScheduleOtCardsV111(assignments);
    if (view === 'day') return renderMobileScheduleByDayV111(assignments);
    return renderMobileExcelRosterV111(assignments);
  }

  renderReadOnlySchedule = function renderReadOnlyScheduleV111(assignments){
    if (!isMobileV111()) return oldRenderReadOnlyScheduleV111(assignments);
    if (!assignments.length) return empty('ยังไม่มีตารางเวรของเดือนนี้');
    return `<div class="mobile-schedule-view-v111">${renderMobileSelectedViewV111(assignments)}</div>`;
  };
  window.renderReadOnlySchedule = renderReadOnlySchedule;

  handleClick = function handleClickV111(e){
    const tab = e.target?.closest?.('[data-schedule-mobile-view]');
    if (tab) state._v111MobileScheduleTouched = true;
    return oldHandleClickV111(e);
  };
  window.handleClick = handleClick;
})();
