/* v143 Neutral Long-term Leave Label Patch
   Scope only: fix hardcoded maternity wording in schedule grid and balance views.
   - Staff with is_long_term_leave true renders as "ลาระยะยาว" by default, not "ลาคลอด".
   - Balance status renders "ยกเว้น/ลาระยะยาว".
   - targetShifts === 0 without long-term flag renders "ไม่มีเป้าหมายเวร" only; it is not treated as long-term leave.
   Does not change duty assignment, OT calculation, or Supabase write logic.
*/
(function () {
  'use strict';

  const html = (v) => (typeof escapeHtml === 'function')
    ? escapeHtml(v == null ? '' : String(v))
    : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
  const isTrue = (v) => v === true || String(v).toLowerCase() === 'true' || String(v) === '1';
  const LONG_LEAVE_WORDS = /(ลาบวช|บวช|ลาดูใจ|ดูใจ|ลาถือศีล|ถือศีล|ลาป่วยยาว|พักงานยาว|ลาระยะยาว|long.?term|maternity|mat\s*leave|ลาคลอด|คลอด)/i;

  function parseD(date) {
    try { return typeof parseDate === 'function' ? parseDate(date) : new Date(`${date}T12:00:00`); }
    catch (_) { return new Date(`${date}T12:00:00`); }
  }
  function isWE(date) {
    try { if (typeof isWeekend === 'function') return !!isWeekend(date); } catch (_) {}
    const d = parseD(date).getDay(); return d === 0 || d === 6;
  }
  function isHol(date) {
    try { if (typeof isHolidayDate === 'function' && isHolidayDate(date)) return true; } catch (_) {}
    try { if (typeof holidayName === 'function' && holidayName(date)) return true; } catch (_) {}
    try { if (typeof getHolidayName === 'function' && getHolidayName(date)) return true; } catch (_) {}
    return false;
  }
  function holName(date) {
    try { if (typeof holidayName === 'function') return holidayName(date) || ''; } catch (_) {}
    try { if (typeof getHolidayName === 'function') return getHolidayName(date) || ''; } catch (_) {}
    return '';
  }
  function monthRange(key) {
    const [y, m] = String(key || (window.state && state.monthKey) || '').split('-').map(Number);
    const yy = y || new Date().getFullYear(); const mm = m || (new Date().getMonth() + 1);
    return { y: yy, m: mm, last: new Date(yy, mm, 0).getDate() };
  }
  function prevMonthKey(key) {
    const { y, m } = monthRange(key);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  function activeView() {
    const v = (window.state && (state.scheduleMobileView || state.scheduleView)) || 'table';
    return v === 'ot' ? 'balance' : (['day','person','balance','table'].includes(v) ? v : 'table');
  }
  function setView(v) {
    if (!window.state) return;
    const next = v === 'ot' ? 'balance' : v;
    state.scheduleMobileView = next;
    state.scheduleView = next;
  }
  function rosterStaff() {
    const arr = (window.state && Array.isArray(state.staff)) ? state.staff : [];
    const filtered = arr.filter(s => {
      try { return typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : (s && s.is_active !== false && s.staff_type !== 'แพทย์' && s.roster_enabled !== false); }
      catch (_) { return s && s.is_active !== false; }
    });
    try { return typeof orderedStaff === 'function' ? orderedStaff(filtered) : filtered; } catch (_) { return filtered; }
  }
  function stById(id) { return ((window.state && state.staff) || []).find(s => String(s.id) === String(id)); }
  function staffColorSafe(s) { try { return typeof staffColor === 'function' ? staffColor(s) : (s?.staff_color || s?.color || '#e8f3ff'); } catch (_) { return '#e8f3ff'; } }
  function textColorSafe(bg) { try { return typeof textColorFor === 'function' ? textColorFor(bg) : '#1f2937'; } catch (_) { return '#1f2937'; } }
  function dutyColumnsFinal() {
    const base = (typeof DUTY_COLUMNS !== 'undefined' && Array.isArray(DUTY_COLUMNS)) ? DUTY_COLUMNS.slice() : ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT'];
    const out = [];
    base.forEach(c => {
      const code = String(c || '');
      if (/^(ช4|ช4-1|ช4-MT\/แตง 1|ช4-MT\/แตง)$/.test(code)) { if (!out.includes('ช4A')) out.push('ช4A'); if (!out.includes('ช4B')) out.push('ช4B'); }
      else if (/^(ช4-2|ช4-MT\/แตง 2)$/.test(code)) { if (!out.includes('ช4B')) out.push('ช4B'); }
      else if (!out.includes(code)) out.push(code);
    });
    if (!out.includes('ช4A')) out.splice(Math.min(3, out.length), 0, 'ช4A');
    if (!out.includes('ช4B')) out.splice(Math.min(out.indexOf('ช4A') + 1, out.length), 0, 'ช4B');
    return out;
  }
  function dutyStaffLabelSafe(code) {
    const c = String(code || '');
    if (/^(ช4A|ช4B|ช4|ช4-1|ช4-2|ช4-MT\/แตง)/.test(c)) return 'ช4';
    try { return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL[c]) || c; } catch (_) { return c; }
  }
  function dutyAdminLabelSafe(code) { return code === 'ช4A' ? 'ช4 (1)' : code === 'ช4B' ? 'ช4 (2)' : dutyStaffLabelSafe(code); }
  function dutyIdx(code) { const i = dutyColumnsFinal().indexOf(code); return i < 0 ? 999 : i; }
  function activeLeave(l) {
    const st = String(l?.status || l?.approval_status || 'active').toLowerCase();
    return !/reject|cancel|delete|ยกเลิก|ไม่อนุมัติ/.test(st);
  }
  function leaveType(l) { return String(l?.type || l?.leave_type || l?.reason || l?.note || '').trim(); }
  function dateInRange(date, l) {
    const start = String(l?.start_date || l?.work_date || '');
    const end = String(l?.end_date || l?.start_date || l?.work_date || '');
    return !!start && start <= date && date <= end;
  }
  function isLongTermFlag(staff) {
    if (!staff) return false;
    if (isTrue(staff.is_long_term_leave) || isTrue(staff.isLongTermLeave) || isTrue(staff.long_term_leave)) return true;
    // Keep legacy free-text detection, but this is independent from targetShifts === 0.
    return LONG_LEAVE_WORDS.test(String(staff.position_training_status || staff.long_leave_reason || staff.note || staff.remark || ''));
  }
  function hasExplicitLongLeaveInMonth(staff, key) {
    const { y, m, last } = monthRange(key);
    const start = `${y}-${pad2(m)}-01`;
    const end = `${y}-${pad2(m)}-${pad2(last)}`;
    return ((window.state && state.leaves) || []).some(l => {
      if (!activeLeave(l) || String(l.staff_id) !== String(staff?.id)) return false;
      if (!LONG_LEAVE_WORDS.test(leaveType(l))) return false;
      const ls = String(l.start_date || l.work_date || '');
      const le = String(l.end_date || l.start_date || l.work_date || '');
      return ls <= end && le >= start;
    });
  }
  function isLongTermActual(staff, key) { return isLongTermFlag(staff) || hasExplicitLongLeaveInMonth(staff, key || (window.state && state.monthKey)); }
  function targetRaw(staff) { return staff?.targetShifts ?? staff?.target_shifts ?? staff?.monthly_target_shifts ?? staff?.quota_shifts; }
  function isTargetZeroOnly(staff, key) {
    const raw = targetRaw(staff);
    return !isLongTermActual(staff, key) && raw !== undefined && raw !== null && raw !== '' && num(raw, 0) === 0;
  }
  function explicitLeaveLabels(staff, date) {
    const labels = [];
    ((window.state && state.leaves) || []).filter(activeLeave).forEach(l => {
      if (String(l.staff_id) !== String(staff?.id) || !dateInRange(date, l)) return;
      const t = leaveType(l);
      if (/ไม่รับเวร/.test(t)) labels.push('ไม่รับเวร');
      else if (/คลอด/.test(t)) labels.push('ลาคลอด');
      else if (/บวช/.test(t)) labels.push('ลาบวช');
      else if (/ดูใจ/.test(t)) labels.push('ลาดูใจ');
      else if (/ถือศีล/.test(t)) labels.push('ลาถือศีล');
      else if (/ป่วย/.test(t)) labels.push('ลาป่วย');
      else if (/กิจ/.test(t)) labels.push('ลากิจ');
      else if (/พักผ่อน|พักร้อน|annual/i.test(t)) labels.push('ลาพักผ่อน');
      else if (t) labels.push(t);
    });
    return [...new Set(labels)];
  }
  function statusLabels(staff, date) {
    const labels = explicitLeaveLabels(staff, date);
    // Default badge for manual long-term toggle only when no explicit leave type is recorded for that date.
    if (isLongTermFlag(staff) && labels.length === 0) labels.push('ลาระยะยาว');
    return [...new Set(labels)];
  }
  function statusClass(label) {
    if (label === 'ไม่รับเวร') return 'no-duty';
    if (label === 'ลาคลอด') return 'maternity';
    if (label === 'ลาระยะยาว' || /บวช|ดูใจ|ถือศีล/.test(label)) return 'long-leave';
    return 'leave';
  }
  function statusBadges(staff, date) {
    return statusLabels(staff, date).map(x => `<span class="v143-status ${statusClass(x)}">${html(x)}</span>`).join('');
  }
  function shiftPill(slot, staff) {
    if (!slot || !staff) return '';
    const bg = staffColorSafe(staff), fg = textColorSafe(bg);
    const attrs = slot.id && typeof canRequestTrade === 'function' && canRequestTrade(slot)
      ? `data-trade-duty="${html(slot.id)}" title="คลิกเพื่อจัดการเวร"`
      : `data-staff-stat="${html(staff.id)}" title="คลิกเพื่อดูสถิติ"`;
    return `<button type="button" class="v143-shift-pill" style="--staff-bg:${html(bg)};--staff-fg:${html(fg)}" ${attrs}>${html(dutyStaffLabelSafe(slot.duty_code))}</button>`;
  }
  function getAssignments() {
    try { if (typeof getAssignmentsForMonth === 'function') return getAssignmentsForMonth(state.monthKey); } catch (_) {}
    return ((window.state && state.rosterAssignments) || []).filter(a => String(a.duty_date || '').startsWith(state.monthKey));
  }
  function computeStats(assignments) {
    try { if (typeof calcFairness === 'function') return calcFairness((assignments || []).filter(a => a.staff_id)) || {}; } catch (_) {}
    const out = {};
    (assignments || []).forEach(a => { if (!a.staff_id) return; out[a.staff_id] = out[a.staff_id] || { units: 0, total: 0 }; out[a.staff_id].units += 1; out[a.staff_id].total += 1; });
    return out;
  }
  function daysOffFor(staff, key, assignments) {
    if (isLongTermActual(staff, key) || isTargetZeroOnly(staff, key)) return 0;
    const { y, m, last } = monthRange(key);
    let count = 0;
    for (let day = 1; day <= last; day++) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (!(isWE(date) || isHol(date))) continue;
      const hasDuty = (assignments || []).some(a => String(a.staff_id) === String(staff.id) && String(a.duty_date) === date);
      const labels = statusLabels(staff, date);
      if (!hasDuty || labels.includes('ไม่รับเวร')) count++;
    }
    return count;
  }
  function renderGrid(assignments) {
    const { y, m, last } = monthRange(state.monthKey);
    const days = Array.from({ length: last }, (_, i) => i + 1);
    return `<div class="table-wrap desktop-schedule-table v143-grid-wrap"><table id="scheduleTable" class="v143-schedule-grid"><thead><tr><th class="v143-sticky-name">เจ้าหน้าที่</th>${days.map(day => {
      const date = `${y}-${pad2(m)}-${pad2(day)}`; const off = isWE(date) || isHol(date);
      return `<th class="${off ? 'v143-dayoff-col' : ''}">${day}<br><span>${html(parseD(date).toLocaleDateString('th-TH',{weekday:'short'}))}</span></th>`;
    }).join('')}</tr></thead><tbody>${rosterStaff().map((s, idx) => {
      const bg = staffColorSafe(s), fg = textColorSafe(bg);
      return `<tr class="${idx % 2 ? 'zebra' : ''}"><th class="v143-name-cell" style="--staff-bg:${html(bg)};--staff-fg:${html(fg)}"><button type="button" data-staff-stat="${html(s.id)}">${html(s.nickname || s.full_name || '-')}</button></th>${days.map(day => {
        const date = `${y}-${pad2(m)}-${pad2(day)}`; const off = isWE(date) || isHol(date);
        const shifts = (assignments || []).filter(a => String(a.staff_id) === String(s.id) && String(a.duty_date) === date).sort((a,b) => dutyIdx(a.duty_code) - dutyIdx(b.duty_code));
        return `<td class="${off ? 'v143-dayoff-cell' : ''}"><div class="v143-cell-stack">${statusBadges(s, date)}${shifts.map(a => shiftPill(a, s)).join('')}</div></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function renderDayCards(assignments) {
    const { y, m, last } = monthRange(state.monthKey);
    return `<div class="v143-calendar-cards">${Array.from({ length: last }, (_, i) => i + 1).map(day => {
      const date = `${y}-${pad2(m)}-${pad2(day)}`; const off = isWE(date) || isHol(date);
      const rows = (assignments || []).filter(a => a.duty_date === date && a.staff_id).sort((a,b)=>dutyIdx(a.duty_code)-dutyIdx(b.duty_code));
      return `<div class="v143-day-card ${off?'dayoff':''}"><div class="v143-day-head"><b>${day}</b><span>${html(parseD(date).toLocaleDateString('th-TH',{weekday:'short'}))}</span>${isHol(date)?`<span class="badge yellow">${html(String(holName(date)).split(':::')[0])}</span>`:''}</div>${rows.length ? rows.map(a => { const s = stById(a.staff_id); return `<div class="v143-day-line"><span>${html(dutyStaffLabelSafe(a.duty_code))}</span>${shiftPill(a, s)}</div>`; }).join('') : '<span class="muted">ไม่มีเวร</span>'}</div>`;
    }).join('')}</div>`;
  }
  function renderPersonView(assignments) {
    return `<div class="v143-person-list">${rosterStaff().map(s => { const bg = staffColorSafe(s), fg = textColorSafe(bg); const rows = (assignments || []).filter(a => String(a.staff_id) === String(s.id)).sort((a,b)=>String(a.duty_date).localeCompare(String(b.duty_date)) || dutyIdx(a.duty_code)-dutyIdx(b.duty_code)); return `<button type="button" class="v143-person-card" style="--staff-bg:${html(bg)};--staff-fg:${html(fg)}" data-staff-stat="${html(s.id)}"><b>${html(s.nickname || s.full_name)}</b><span>${rows.length} เวร</span><small>${rows.slice(0,8).map(a => `${Number(String(a.duty_date).slice(-2))}:${dutyStaffLabelSafe(a.duty_code)}`).join(' • ') || 'ไม่มีเวรเดือนนี้'}</small></button>`; }).join('')}</div>`;
  }
  function renderBalance(assignments) {
    const key = state.monthKey;
    const prevKey = prevMonthKey(key);
    const staff = rosterStaff();
    const stats = computeStats(assignments || []);
    const activeNonExempt = staff.filter(s => !isLongTermActual(s, key) && !isTargetZeroOnly(s, key));
    const values = activeNonExempt.map(s => num(stats[s.id]?.units ?? stats[s.id]?.total, 0));
    const avgQuota = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
    const prevAssignments = ((window.state && state.rosterAssignments) || []).filter(a => String(a.duty_date || '').startsWith(prevKey));
    const prevOffValues = activeNonExempt.map(s => daysOffFor(s, prevKey, prevAssignments));
    const avgPrevOff = prevOffValues.length ? prevOffValues.reduce((a,b)=>a+b,0)/prevOffValues.length : 0;

    const rows = staff.map(s => {
      const r = stats[s.id] || {};
      const longExempt = isLongTermActual(s, key);
      const zeroTarget = isTargetZeroOnly(s, key);
      const prevLong = isLongTermActual(s, prevKey);
      const exempt = longExempt || zeroTarget;
      const current = exempt ? 0 : num(r.units ?? r.total, 0);
      const target = exempt ? 0 : num(targetRaw(s), avgQuota);
      const gap = exempt ? 0 : target - current;
      const carry = (exempt || prevLong) ? 0 : num(s.carry_over_balance ?? s.overtime_balance ?? s.overtimeBalance ?? s.ot_balance, 0);
      const daysOff = exempt ? 0 : daysOffFor(s, key, assignments || []);
      const prevDaysOff = exempt ? 0 : daysOffFor(s, prevKey, prevAssignments);
      const nextOff = exempt ? 0 : avgPrevOff - prevDaysOff;
      const status = longExempt ? 'ยกเว้น/ลาระยะยาว'
        : zeroTarget ? 'ไม่มีเป้าหมายเวร'
        : prevLong ? 'รีเซ็ตยอดสะสมแล้ว'
        : Math.abs(gap) < 0.5 ? 'สมดุล'
        : gap > 0 ? 'ขาดเวร' : 'งานหนักเกิน';
      const cls = longExempt || zeroTarget ? 'exempt' : prevLong ? 'reset' : Math.abs(gap) < 0.5 ? 'ok' : gap > 0 ? 'warn' : 'over';
      const name = typeof staffPill === 'function' ? staffPill(s) : html(s.nickname || s.full_name || '-');
      return `<tr class="${exempt ? 'v143-exempt-row' : ''}"><td>${name}</td><td>${target.toFixed(1)}</td><td>${current.toFixed(1)}</td><td>${gap.toFixed(1)}</td><td>${carry.toFixed(1)} ชม.</td><td>${daysOff}</td><td>${nextOff.toFixed(1)}</td><td><span class="v143-balance-status ${cls}">${html(status)}</span></td></tr>`;
    }).join('');
    return `<div class="v143-balance-dashboard"><div class="notice soft-notice">คนที่เปิดสถานะลาระยะยาวจะแสดงเป็น “ยกเว้น/ลาระยะยาว”; คนที่ targetShifts = 0 แต่ไม่ได้เปิดสถานะนี้จะแสดงเป็น “ไม่มีเป้าหมายเวร” และไม่ถูกเหมารวมเป็นลาระยะยาว</div><div class="table-wrap"><table class="v143-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เป้าหมายเวร</th><th>เวรที่จัดแล้ว</th><th>Quota Gap</th><th>OT Balance/ยกยอด</th><th>จำนวนวันหยุด</th><th>ทบวันหยุดครั้งหน้า</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function renderScheduleView(assignments) {
    const v = activeView();
    if (v === 'day') return renderDayCards(assignments);
    if (v === 'person') return renderPersonView(assignments);
    if (v === 'balance') return renderBalance(assignments);
    return renderGrid(assignments);
  }
  function tab(id, label, active) { return `<button type="button" class="v143-tab ${active === id ? 'active' : ''}" data-schedule-view="${id}" data-schedule-mobile-view="${id}">${html(label)}</button>`; }

  window.renderReadOnlySchedule = function renderReadOnlyScheduleV143(assignments) { return renderScheduleView(assignments || getAssignments()); };
  try { renderReadOnlySchedule = window.renderReadOnlySchedule; } catch (_) {}

  window.renderMonthlySchedulePage = function renderMonthlySchedulePageV143() {
    const assignments = getAssignments();
    const view = activeView();
    return `<div class="card schedule-page-card v143-schedule-page"><div class="toolbar no-print v143-toolbar"><label>เดือน <input type="month" id="scheduleMonthInput" value="${html(state.monthKey)}"></label><button class="ghost-btn" data-export-schedule-excel>Export Excel</button><button class="ghost-btn" data-print-page>Export PDF / พิมพ์</button></div><div class="v143-schedule-tabs no-print" aria-label="ตารางเวรประจำเดือน">${tab('day','ดูตามวัน',view)}${tab('person','ดูตามคน',view)}${tab('balance','ดูสมดุล การกระจายเวร',view)}${tab('table','ตาราง',view)}</div><h3 class="print-only">ตารางเวรประจำเดือน ${html(state.monthKey)}</h3>${renderScheduleView(assignments)}${typeof renderDutyTradePanel === 'function' ? renderDutyTradePanel(assignments) : ''}</div>`;
  };
  try { renderMonthlySchedulePage = window.renderMonthlySchedulePage; } catch (_) {}

  // Admin roster grid: keep ช4 (1)/(2) intact, with cleaned holiday name string.
  window.renderRosterGrid = function renderRosterGridV143(assignments) {
    if (!assignments || !assignments.length) return typeof empty === 'function' ? empty('กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร') : '';
    const { y, m, last } = monthRange(state.monthKey);
    const cols = dutyColumnsFinal();
    return `<div class="table-wrap roster-table-wrap v143-roster-admin-wrap"><table class="roster-table v143-roster-admin"><thead><tr><th class="v143-admin-date-col">วันที่</th>${cols.map(c => `<th>${html(dutyAdminLabelSafe(c))}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: last }, (_, i) => i + 1).map(day => {
      const date = `${y}-${pad2(m)}-${pad2(day)}`; const dow = parseD(date).toLocaleDateString('th-TH',{ weekday:'short' }); const rowCls = isWE(date)||isHol(date) ? 'v143-admin-dayoff-row' : '';
      return `<tr class="${rowCls}"><td class="v143-admin-date"><b>${day}</b><br><span>${html(dow)}</span>${isHol(date) ? `<br><span class="badge yellow">${html(String(holName(date)).split(':::')[0])}</span>` : ''}</td>${cols.map(code => {
        try { if (typeof allowedDutyCodesForDate === 'function' && !allowedDutyCodesForDate(date).includes(code)) return '<td class="muted v143-admin-dayoff-cell">-</td>'; } catch (_) {}
        const slot = (assignments || []).find(a => a.duty_date === date && a.duty_code === code);
        if (!slot) return '<td class="muted">-</td>';
        const id = slot.id || slot._temp_id;
        return `<td><div class="roster-slot ${slot.is_locked?'locked':''}" data-drop-slot="${html(id)}"><div class="assigned-name">${slot.staff_id && typeof staffPill === 'function' ? staffPill(slot.staff_id) : 'ยังไม่จัด'}</div><select class="mobile-roster-select" data-roster-slot-select="${html(id)}" ${slot.is_locked?'disabled':''}><option value="">ยังไม่จัด</option>${typeof staffOptionList === 'function' ? staffOptionList(slot.staff_id, st => typeof canStaffWorkSlot === 'function' ? canStaffWorkSlot(st.id, slot) : true) : ''}</select><div class="actions"><button class="tiny-btn" data-clear-slot="${html(id)}">ล้าง</button><button class="tiny-btn" data-toggle-lock-slot="${html(id)}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button></div></div></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table></div>${typeof renderRosterMobileGrid === 'function' ? renderRosterMobileGrid(assignments, y, m, last) : ''}`;
  };
  try { renderRosterGrid = window.renderRosterGrid; } catch (_) {}

  document.addEventListener('click', function v143ScheduleTabClick(e) {
    const t = e.target.closest('[data-schedule-view], [data-schedule-mobile-view]');
    if (!t) return;
    const v = t.dataset.scheduleView || t.dataset.scheduleMobileView;
    if (!['day','person','balance','table','ot'].includes(v)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    setView(v);
    if (typeof renderPage === 'function') renderPage();
  }, true);

  const oldRenderPage = window.renderPage;
  window.renderPage = function renderPageV143() {
    const res = typeof oldRenderPage === 'function' ? oldRenderPage.apply(this, arguments) : undefined;
    if (window.state && state.page === 'schedule') {
      const content = document.getElementById('pageContent');
      if (content && !content.querySelector('.v143-schedule-page')) content.innerHTML = window.renderMonthlySchedulePage();
    }
    cleanupLegacyLongLeaveText();
    return res;
  };
  try { renderPage = window.renderPage; } catch (_) {}

  function cleanupLegacyLongLeaveText() {
    // Safety net for older patched DOM: only replace balance status; do not rewrite explicit leave badges.
    document.querySelectorAll('.v136-balance-status, .v137-balance-status, .v140-balance-status').forEach(el => {
      if (el.textContent && el.textContent.trim() === 'ยกเว้น/ลาคลอด') el.textContent = 'ยกเว้น/ลาระยะยาว';
    });
  }
  const css = document.createElement('style');
  css.textContent = `
    .v143-schedule-tabs{position:sticky;top:0;z-index:50;display:flex;gap:8px;flex-wrap:wrap;background:#fff;padding:8px 0;margin-bottom:10px;border-bottom:1px solid #e5e7eb}
    .v143-tab{cursor:pointer;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 12px;font-weight:700}.v143-tab.active{background:#0ea5e9;color:#fff;border-color:#0ea5e9}
    .v143-grid-wrap,.v143-roster-admin-wrap{overflow:auto}.v143-schedule-grid,.v143-roster-admin,.v143-balance-table{border-collapse:collapse;width:max-content;min-width:100%;table-layout:fixed;font-size:12px}.v143-schedule-grid th,.v143-schedule-grid td,.v143-roster-admin th,.v143-roster-admin td,.v143-balance-table th,.v143-balance-table td{border:1px solid #e5e7eb;padding:3px 5px;vertical-align:top;line-height:1.15}.v143-sticky-name,.v143-name-cell{position:sticky;left:0;z-index:12;background:var(--staff-bg,#fff)!important;color:var(--staff-fg,#111827)!important;min-width:92px;max-width:110px}.v143-name-cell button{all:unset;cursor:pointer;font-weight:800}.v143-dayoff-col,.v143-dayoff-cell{background:#f1f5f9!important}.v143-cell-stack{display:flex;flex-direction:column;gap:2px;min-height:18px}.v143-shift-pill{border:0;border-radius:8px;padding:2px 5px;background:var(--staff-bg,#dbeafe);color:var(--staff-fg,#111827);font-weight:800;font-size:11px;line-height:1.1;cursor:pointer;white-space:nowrap}.v143-status{display:inline-block;border-radius:7px;padding:1px 4px;font-size:10px;font-weight:800;background:#f3f4f6;border:1px solid #d1d5db;color:#374151}.v143-status.no-duty{background:#fff7ed;border-color:#fdba74;color:#9a3412}.v143-status.maternity{background:#fef3c7;border-color:#fbbf24;color:#92400e}.v143-status.long-leave{background:#f1f5f9;border-color:#94a3b8;color:#334155}.v143-status.leave{background:#f8fafc;border-color:#cbd5e1;color:#475569}.v143-balance-status{display:inline-block;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800}.v143-balance-status.exempt{background:#f1f5f9;color:#334155}.v143-balance-status.reset{background:#dcfce7;color:#166534}.v143-balance-status.ok{background:#dcfce7;color:#166534}.v143-balance-status.warn{background:#fef3c7;color:#92400e}.v143-balance-status.over{background:#fee2e2;color:#991b1b}.v143-calendar-cards,.v143-person-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.v143-day-card,.v143-person-card{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:10px;text-align:left}.v143-day-card.dayoff{background:#f8fafc}.v143-day-head{display:flex;gap:6px;align-items:center;margin-bottom:8px}.v143-day-line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:3px 0;border-top:1px dashed #e5e7eb}.v143-person-card{cursor:pointer;background:var(--staff-bg,#fff);color:var(--staff-fg,#111827)}.v143-admin-date-col{width:100px;min-width:100px;max-width:100px}.v143-admin-date{width:100px;min-width:100px;max-width:100px}.v143-admin-dayoff-row,.v143-admin-dayoff-cell{background:#f8fafc!important}
  `;
  document.head.appendChild(css);

  document.addEventListener('DOMContentLoaded', cleanupLegacyLongLeaveText);
})();
