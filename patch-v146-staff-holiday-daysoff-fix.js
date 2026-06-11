/* v146 Staff/Holiday/Days-off Recovery Fix
   Scope:
   1) Restore schedule data when active staff filter was too strict.
   2) Show HOLIDAY in Monthly Position Schedule for public holidays.
   3) Lock strict Days Off definition for balance view.
*/
(function () {
  'use strict';

  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (typeof window.escapeHtml === 'function') { try { return window.escapeHtml(s); } catch (_) {} }
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  };
  const arr = (v) => Array.isArray(v) ? v : [];
  const pad2 = (n) => String(n).padStart(2, '0');
  const toDateKey = (v) => String(v || '').slice(0, 10);
  const num = (v, f = 0) => { const n = Number(v); return Number.isFinite(n) ? n : f; };
  const getState = () => window.state || {};
  const cleanHolidayTitle = (v) => String(v || '').split(':::')[0].trim();

  function parseLocalDate(date) {
    const s = toDateKey(date);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function monthParts() {
    const key0 = String(getState().monthKey || new Date().toISOString().slice(0, 7));
    const [yy, mm] = key0.split('-').map(Number);
    const y = Number.isFinite(yy) ? yy : new Date().getFullYear();
    const m = Number.isFinite(mm) ? mm : new Date().getMonth() + 1;
    return { y, m, key: `${y}-${pad2(m)}`, last: new Date(y, m, 0).getDate() };
  }
  function isWeekendExact(date) {
    const d = parseLocalDate(date);
    if (!d) return false;
    const day = d.getDay();
    return day === 0 || day === 6;
  }
  function holidayRowExact(date) {
    const key = toDateKey(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    return arr(getState().holidays).find(h => {
      const raw = h && (h.holiday_date || h.date || h.work_date || h.duty_date);
      return toDateKey(raw) === key;
    }) || null;
  }
  function isPublicHolidayExact(date) { return !!holidayRowExact(date); }
  function holidayNameExact(date) {
    const h = holidayRowExact(date);
    if (!h) return '';
    return cleanHolidayTitle(h.title || h.name || h.holiday_name || 'HOLIDAY') || 'HOLIDAY';
  }
  window.isHolidayDate = isPublicHolidayExact;
  window.holidayName = holidayNameExact;
  window.isPublicHoliday = isPublicHolidayExact;
  try { isHolidayDate = window.isHolidayDate; } catch (_) {}
  try { holidayName = window.holidayName; } catch (_) {}

  function boolFalse(v) {
    return v === false || v === 0 || String(v).toLowerCase() === 'false' || String(v) === '0' || /inactive|disabled|ลาออก|ยกเลิก|ปิด/i.test(String(v || ''));
  }
  function boolTrue(v) {
    return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1' || /active|ใช้งาน|เปิด/i.test(String(v || ''));
  }
  function staffIsPhysician(s) { return /แพทย์|physician|doctor/i.test(String(s?.staff_type || s?.role || '')); }
  function isLongTermStaff(s) {
    return boolTrue(s?.is_long_term_leave) || boolTrue(s?.isLongTermLeave) || boolTrue(s?.long_term_leave);
  }
  function rosterEnabledLoose(s) {
    if (!s || staffIsPhysician(s)) return false;
    if (boolFalse(s.deleted) || boolFalse(s.is_deleted) || boolFalse(s.archived)) return false;
    if (boolFalse(s.roster_enabled) || boolFalse(s.enable_roster) || boolFalse(s.duty_enabled)) return false;
    // is_active is often missing/null in older rows. Treat only explicit false/inactive as disabled.
    if (boolFalse(s.is_active) || boolFalse(s.active) || boolFalse(s.status)) return false;
    return true;
  }
  function ordered(list) {
    try { if (typeof window.orderedStaff === 'function') return arr(window.orderedStaff(list)); } catch (_) {}
    return arr(list).slice().sort((a,b) => String(a?.sort_order ?? a?.order_no ?? '').localeCompare(String(b?.sort_order ?? b?.order_no ?? '')) || String(a?.nickname || a?.full_name || '').localeCompare(String(b?.nickname || b?.full_name || ''), 'th'));
  }
  function rosterStaffLoose() {
    const all = arr(getState().staff);
    let list = all.filter(rosterEnabledLoose);
    // Recovery fallback: if schema flags differ and filter becomes empty, do not blank the schedule.
    if (!list.length && all.length) list = all.filter(s => s && !staffIsPhysician(s) && !boolFalse(s.deleted) && !boolFalse(s.is_deleted));
    if (!list.length && all.length) list = all.slice();
    return ordered(list);
  }
  window.isRosterEnabledV146 = rosterEnabledLoose;

  function staffById(id) { return arr(getState().staff).find(s => String(s.id) === String(id)) || null; }
  function staffName(sOrId) {
    const s = typeof sOrId === 'object' ? sOrId : staffById(sOrId);
    return s ? (s.nickname || s.full_name || s.name || '-') : '-';
  }
  function staffColor(s) {
    try { if (typeof window.staffColor === 'function') return window.staffColor(s); } catch (_) {}
    return s?.staff_color || s?.color || '#e0f2fe';
  }
  function textColor(bg) {
    try { if (typeof window.textColorFor === 'function') return window.textColorFor(bg); } catch (_) {}
    return '#111827';
  }
  function dutyColumns() {
    const src = arr(window.DUTY_COLUMNS || (typeof DUTY_COLUMNS !== 'undefined' ? DUTY_COLUMNS : null));
    const base = src.length ? src : ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT'];
    const out = [];
    base.forEach(x => {
      const c = String(x || '').trim();
      if (!c) return;
      if (/^(ช4|ช4-1|ช4A|ช4-MT\/แตง 1|ช4-MT\/แตง)$/i.test(c)) { if (!out.includes('ช4A')) out.push('ช4A'); if (!out.includes('ช4B')) out.push('ช4B'); }
      else if (/^(ช4-2|ช4B|ช4-MT\/แตง 2)$/i.test(c)) { if (!out.includes('ช4B')) out.push('ช4B'); }
      else if (!out.includes(c)) out.push(c);
    });
    if (!out.includes('ช4A')) out.splice(Math.min(3, out.length), 0, 'ช4A');
    if (!out.includes('ช4B')) out.splice(Math.min(out.indexOf('ช4A') + 1, out.length), 0, 'ช4B');
    return out;
  }
  function dutyLabel(code, staffView = true) {
    const c = String(code || '');
    if (/^(ช4A|ช4B|ช4|ช4-1|ช4-2|ช4-MT\/แตง)/.test(c)) return staffView ? 'ช4' : (c === 'ช4B' ? 'ช4 (2)' : 'ช4 (1)');
    try { return (window.DUTY_LABEL && window.DUTY_LABEL[c]) || (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL[c]) || c; } catch (_) { return c; }
  }
  function dutyOrder(code) { const i = dutyColumns().indexOf(String(code || '')); return i < 0 ? 999 : i; }
  function assignmentsForMonth() {
    const key = monthParts().key;
    let rows = [];
    try { if (typeof window.getAssignmentsForMonth === 'function') rows = arr(window.getAssignmentsForMonth(key)); } catch (e) { console.warn('v146 getAssignmentsForMonth failed', e); }
    if (!rows.length) rows = arr(getState().rosterAssignments).filter(a => toDateKey(a?.duty_date).startsWith(key));
    return rows;
  }
  function activeLeave(l) { return !/reject|cancel|delete|ยกเลิก|ไม่อนุมัติ/i.test(String(l?.status || l?.approval_status || 'active')); }
  function dateInLeave(date, l) {
    const start = toDateKey(l?.start_date || l?.work_date || l?.date);
    const end = toDateKey(l?.end_date || l?.start_date || l?.work_date || l?.date);
    return !!start && start <= date && date <= end;
  }
  function leaveText(l) {
    const t = String(l?.type || l?.leave_type || l?.reason || l?.note || '').trim();
    if (/ไม่รับเวร/.test(t)) return 'ไม่รับเวร';
    if (/คลอด/.test(t)) return 'ลาคลอด';
    if (/บวช/.test(t)) return 'ลาบวช';
    if (/ดูใจ/.test(t)) return 'ลาดูใจ';
    if (/ถือศีล/.test(t)) return 'ลาถือศีล';
    if (/ป่วย/.test(t)) return 'ลาป่วย';
    if (/กิจ/.test(t)) return 'ลากิจ';
    if (/พักผ่อน|พักร้อน|annual/i.test(t)) return 'ลาพักผ่อน';
    return t || 'ลา';
  }
  function dayStatusLabels(s, date) {
    const labels = arr(getState().leaves).filter(l => activeLeave(l) && String(l.staff_id) === String(s?.id) && dateInLeave(date, l)).map(leaveText);
    if (!labels.length && isLongTermStaff(s)) labels.push('ลาระยะยาว');
    return [...new Set(labels)];
  }
  function statusBadge(label) {
    const cls = label === 'ไม่รับเวร' ? 'no-duty' : /ลาระยะยาว|บวช|ดูใจ|ถือศีล/.test(label) ? 'long' : /คลอด/.test(label) ? 'mat' : 'leave';
    return `<span class="v146-status ${cls}">${esc(label)}</span>`;
  }
  function shiftPill(a, s) {
    if (!a || !s) return '';
    const bg = staffColor(s), fg = textColor(bg);
    const id = esc(a.id || '');
    return `<button type="button" class="v146-shift-pill" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}" ${id ? `data-trade-duty="${id}"` : `data-staff-stat="${esc(s.id)}"`}>${esc(dutyLabel(a.duty_code, true))}</button>`;
  }
  function isDayOffType(date) { return isWeekendExact(date) || isPublicHolidayExact(date); }
  function hasAnyDuty(staffId, date, assignments) {
    return arr(assignments).some(a => String(a?.staff_id) === String(staffId) && toDateKey(a?.duty_date) === date);
  }
  function hasLeaveOrNoDutyStatus(s, date) {
    return dayStatusLabels(s, date).some(x => /ไม่รับเวร|ลา|ลาระยะยาว|คลอด|บวช|ดูใจ|ถือศีล|ป่วย|กิจ|พักผ่อน/.test(x));
  }
  // Locked definition: days off = Sat/Sun/Public holiday AND no duty. Leave/no-duty only confirms non-working day; duty always wins.
  function calculateDaysOffStrict(s, assignments) {
    if (isLongTermStaff(s)) return 0;
    const { y, m, last } = monthParts();
    let count = 0;
    for (let d = 1; d <= last; d++) {
      const date = `${y}-${pad2(m)}-${pad2(d)}`;
      if (!isDayOffType(date)) continue;
      if (hasAnyDuty(s.id, date, assignments)) continue;
      // If no duty on a weekend/holiday, count as day off. If leave/no-duty exists, still counted, not double-counted.
      count += 1;
    }
    return count;
  }
  window.calculateDaysOffStrictV146 = calculateDaysOffStrict;

  function safeStats(assignments) {
    try { if (typeof window.calcFairness === 'function') return window.calcFairness(arr(assignments).filter(a => a?.staff_id)) || {}; } catch (_) {}
    const out = {};
    arr(assignments).forEach(a => { if (!a?.staff_id) return; out[a.staff_id] = out[a.staff_id] || { units:0, hours:0, total:0 }; out[a.staff_id].units += 1; out[a.staff_id].total += 1; });
    return out;
  }
  function targetShifts(s, fallback) {
    const raw = s?.targetShifts ?? s?.target_shifts ?? s?.monthly_target_shifts ?? s?.quota_shifts;
    if (raw === undefined || raw === null || raw === '') return fallback;
    return num(raw, fallback);
  }
  function targetZeroOnly(s) { return !isLongTermStaff(s) && targetShifts(s, NaN) === 0; }
  function currentView() {
    const v = String(getState().scheduleView || getState().scheduleMobileView || 'day');
    return v === 'ot' ? 'balance' : (['day','person','balance','table'].includes(v) ? v : 'day');
  }
  function setView(v) { if (window.state) { state.scheduleView = v === 'ot' ? 'balance' : v; state.scheduleMobileView = state.scheduleView; } }
  function tab(id, label, active) { return `<button type="button" class="v146-tab ${active===id?'active':''}" data-v146-schedule-tab="${id}">${esc(label)}</button>`; }
  function thaiDow(date) { const d = parseLocalDate(date); return d ? d.toLocaleDateString('th-TH', { weekday:'short' }) : ''; }

  function renderGrid(assignments) {
    const { y, m, last } = monthParts();
    const staff = rosterStaffLoose();
    if (!staff.length) return `<div class="empty-state">ยังไม่พบรายชื่อเจ้าหน้าที่สำหรับจัดเวร<br><small>กรุณาตรวจข้อมูล staff_profiles หรือสิทธิ์ RLS หากรายชื่อควรมีอยู่แล้ว</small></div>`;
    const days = Array.from({ length:last }, (_,i)=>i+1);
    return `<div class="table-wrap v146-grid-wrap"><table id="scheduleTable" class="v146-grid"><thead><tr><th class="v146-name-head">เจ้าหน้าที่</th>${days.map(d => { const date=`${y}-${pad2(m)}-${pad2(d)}`; return `<th class="${isDayOffType(date)?'v146-off-col':''}">${d}<br><span>${esc(thaiDow(date))}</span></th>`; }).join('')}</tr></thead><tbody>${staff.map((s,i)=>{ const bg=staffColor(s), fg=textColor(bg); return `<tr class="${i%2?'zebra':''}"><th class="v146-name-cell" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}"><button type="button" data-staff-stat="${esc(s.id)}">${esc(staffName(s))}</button></th>${days.map(d=>{ const date=`${y}-${pad2(m)}-${pad2(d)}`; const shifts=arr(assignments).filter(a=>String(a?.staff_id)===String(s.id)&&toDateKey(a?.duty_date)===date).sort((a,b)=>dutyOrder(a?.duty_code)-dutyOrder(b?.duty_code)); return `<td class="${isDayOffType(date)?'v146-off-cell':''}"><div class="v146-cell-stack">${dayStatusLabels(s,date).map(statusBadge).join('')}${shifts.map(a=>shiftPill(a,s)).join('')}</div></td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`;
  }
  function renderDay(assignments) {
    const { y, m, last } = monthParts();
    return `<div class="v146-day-cards">${Array.from({length:last},(_,i)=>i+1).map(d=>{ const date=`${y}-${pad2(m)}-${pad2(d)}`; const rows=arr(assignments).filter(a=>toDateKey(a?.duty_date)===date&&a?.staff_id).sort((a,b)=>dutyOrder(a?.duty_code)-dutyOrder(b?.duty_code)); return `<div class="v146-day-card ${isDayOffType(date)?'off':''}"><div class="v146-day-head"><b>${d}</b><span>${esc(thaiDow(date))}</span>${isPublicHolidayExact(date)?`<span class="badge yellow">${esc(holidayNameExact(date))}</span>`:''}</div>${rows.length?rows.map(a=>{ const s=staffById(a.staff_id); return `<div class="v146-day-line"><b>${esc(dutyLabel(a.duty_code,true))}</b>${s?shiftPill(a,s):`<span>${esc(a.staff_id)}</span>`}</div>`; }).join(''):'<span class="muted">ไม่มีเวร</span>'}</div>`; }).join('')}</div>`;
  }
  function renderPerson(assignments) {
    const staff = rosterStaffLoose();
    if (!staff.length) return `<div class="empty-state">ยังไม่พบรายชื่อเจ้าหน้าที่</div>`;
    const stats = safeStats(assignments);
    const summary = `<div class="v146-summary-cards">${staff.map(s=>{ const bg=staffColor(s), fg=textColor(bg), r=stats[s.id]||{}; return `<button type="button" class="v146-summary-card" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}" data-staff-stat="${esc(s.id)}"><b>${esc(staffName(s))}</b><span>${num(r.units??r.total,0).toFixed(1)} เวร • ${num(r.hours,0).toFixed(0)} ชม.</span></button>`; }).join('')}</div>`;
    const list = `<div class="v146-person-list">${staff.map(s=>{ const bg=staffColor(s), fg=textColor(bg); const rows=arr(assignments).filter(a=>String(a?.staff_id)===String(s.id)).sort((a,b)=>toDateKey(a?.duty_date).localeCompare(toDateKey(b?.duty_date))||dutyOrder(a?.duty_code)-dutyOrder(b?.duty_code)); return `<button type="button" class="v146-person-card" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}" data-staff-stat="${esc(s.id)}"><b>${esc(staffName(s))}</b><span>${rows.length} เวร</span><small>${rows.slice(0,12).map(a=>`${Number(toDateKey(a?.duty_date).slice(-2))}:${dutyLabel(a?.duty_code,true)}`).join(' • ') || 'ไม่มีเวรเดือนนี้'}</small></button>`; }).join('')}</div>`;
    return summary + list;
  }
  function renderBalance(assignments) {
    const staff = rosterStaffLoose();
    if (!staff.length) return `<div class="empty-state">ยังไม่พบรายชื่อเจ้าหน้าที่</div>`;
    const stats = safeStats(assignments);
    const nonExempt = staff.filter(s => !isLongTermStaff(s) && !targetZeroOnly(s));
    const avg = nonExempt.length ? nonExempt.reduce((sum,s)=>sum+num(stats[s.id]?.units??stats[s.id]?.total,0),0)/nonExempt.length : 0;
    const rows = staff.map(s=>{ const long=isLongTermStaff(s), zero=targetZeroOnly(s), exempt=long||zero; const current=exempt?0:num(stats[s.id]?.units??stats[s.id]?.total,0); const target=exempt?0:targetShifts(s,avg); const gap=exempt?0:target-current; const carry=exempt?0:num(s.carry_over_balance??s.overtime_balance??s.overtimeBalance??s.ot_balance,0); const off=exempt?0:calculateDaysOffStrict(s, assignments); const status=long?'ยกเว้น/ลาระยะยาว':zero?'ไม่มีเป้าหมายเวร':Math.abs(gap)<0.5?'สมดุล':gap>0?'ขาดเวร':'งานหนักเกิน'; const cls=long||zero?'exempt':Math.abs(gap)<0.5?'ok':gap>0?'warn':'over'; const name=(typeof window.staffPill==='function')?window.staffPill(s):esc(staffName(s)); return `<tr><td>${name}</td><td>${target.toFixed(1)}</td><td>${current.toFixed(1)}</td><td>${gap.toFixed(1)}</td><td>${carry.toFixed(1)} ชม.</td><td>${off}</td><td><span class="v146-balance ${cls}">${esc(status)}</span></td></tr>`; }).join('');
    return `<div class="v146-balance-wrap"><div class="notice soft-notice">นิยามวันหยุด: เสาร์/อาทิตย์/นักขัตที่ไม่มีเวรในระบบเท่านั้น ถ้ามีเวรจะไม่นับเป็นวันหยุด</div><div class="table-wrap"><table class="v146-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เป้าหมายเวร</th><th>เวรที่จัดแล้ว</th><th>Quota Gap</th><th>OT Balance/ยกยอด</th><th>จำนวนวันหยุด</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function renderContent(view, assignments) {
    try {
      if (view === 'day') return renderDay(assignments);
      if (view === 'person') return renderPerson(assignments);
      if (view === 'balance') return renderBalance(assignments);
      return renderGrid(assignments);
    } catch (err) {
      console.error('v146 schedule tab render error', err);
      return `<div class="notice danger">ไม่สามารถแสดงข้อมูลแท็บนี้ได้: ${esc(err?.message || err)}</div>`;
    }
  }
  window.renderMonthlySchedulePage = function renderMonthlySchedulePageV146() {
    const active = currentView();
    const assignments = assignmentsForMonth();
    let trade = '';
    try { if (typeof window.renderDutyTradePanel === 'function') trade = window.renderDutyTradePanel(assignments); } catch (_) {}
    return `<div class="card schedule-page-card v146-schedule-page"><div class="toolbar no-print v146-toolbar"><label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(monthParts().key)}"></label><button class="ghost-btn" data-export-schedule-excel>Export Excel</button><button class="ghost-btn" data-print-page>Export PDF / พิมพ์</button></div><div class="v146-tabs no-print">${tab('day','ดูตามวัน',active)}${tab('person','ดูตามคน',active)}${tab('balance','ดูสมดุล การกระจายเวร',active)}${tab('table','ตาราง',active)}</div><h3 class="print-only">ตารางเวรประจำเดือน ${esc(monthParts().key)}</h3><div id="scheduleTabContent" class="v146-tab-content" data-active-view="${esc(active)}">${renderContent(active, assignments)}</div>${trade}</div>`;
  };
  try { renderMonthlySchedulePage = window.renderMonthlySchedulePage; } catch (_) {}
  window.renderReadOnlySchedule = function renderReadOnlyScheduleV146(assignments) { return renderGrid(assignments || assignmentsForMonth()); };
  try { renderReadOnlySchedule = window.renderReadOnlySchedule; } catch (_) {}

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = function renderPageV146() {
    if (getState().page === 'schedule') {
      const pc = document.getElementById('pageContent');
      if (!pc) return false;
      try {
        const title = document.getElementById('pageTitle'), sub = document.getElementById('pageSubtitle');
        if (title) title.textContent = 'ตารางเวรประจำเดือน';
        if (sub) sub.textContent = 'ดูตามวัน / ดูตามคน / ดูสมดุล / ตาราง';
        pc.innerHTML = window.renderMonthlySchedulePage();
        return true;
      } catch (err) {
        pc.innerHTML = `<div class="notice danger">หน้า “ตารางเวรประจำเดือน” มีข้อผิดพลาด: ${esc(err?.message || err)}</div>`;
        return false;
      }
    }
    try { return typeof oldRenderPage === 'function' ? oldRenderPage.apply(this, arguments) : undefined; }
    catch (err) { console.error('v146 renderPage error', err); const pc=document.getElementById('pageContent'); if (pc) pc.innerHTML=`<div class="notice danger">เกิดข้อผิดพลาดในการแสดงหน้า: ${esc(err?.message || err)}</div>`; return undefined; }
  };
  try { renderPage = window.renderPage; } catch (_) {}

  // Monthly Position Schedule: public holidays must render HOLIDAY, not an editable dropdown.
  window.isNoPositionDay = function isNoPositionDayV146(date) { return isWeekendExact(date) || isPublicHolidayExact(date); };
  try { isNoPositionDay = window.isNoPositionDay; } catch (_) {}
  const oldRenderMonthPositionCell = window.renderMonthPositionCell || (typeof renderMonthPositionCell === 'function' ? renderMonthPositionCell : null);
  window.renderMonthPositionCell = function renderMonthPositionCellV146(staff, date, cellRows, canEdit) {
    if (isWeekendExact(date)) return `<td class="matrix-cell no-position-day weekend-day"><span>WEEKEND</span></td>`;
    if (isPublicHolidayExact(date)) return `<td class="matrix-cell no-position-day holiday-day"><span>HOLIDAY</span></td>`;
    if (typeof oldRenderMonthPositionCell === 'function') return oldRenderMonthPositionCell(staff, date, cellRows, canEdit);
    return `<td class="matrix-cell"></td>`;
  };
  try { renderMonthPositionCell = window.renderMonthPositionCell; } catch (_) {}

  document.addEventListener('click', function(e){
    const t = e.target && e.target.closest && e.target.closest('[data-v146-schedule-tab],[data-v145-schedule-tab],[data-schedule-view],[data-schedule-mobile-view]');
    if (!t) return;
    const v = t.dataset.v146ScheduleTab || t.dataset.v145ScheduleTab || t.dataset.scheduleView || t.dataset.scheduleMobileView;
    if (!['day','person','balance','table','ot'].includes(v)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    setView(v);
    if (typeof window.renderPage === 'function') window.renderPage();
  }, true);

  const style = document.createElement('style');
  style.textContent = `
  .v146-tabs{position:sticky;top:0;z-index:150;display:flex;gap:8px;flex-wrap:wrap;background:#fff;padding:8px 0;margin-bottom:10px;border-bottom:1px solid #e5e7eb;pointer-events:auto!important}.v146-tab{cursor:pointer!important;pointer-events:auto!important;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 12px;font-weight:800}.v146-tab.active{background:#0ea5e9;color:#fff;border-color:#0ea5e9}.v146-tab-content{min-height:140px}.v146-grid-wrap{overflow:auto}.v146-grid,.v146-balance-table{border-collapse:collapse;width:max-content;min-width:100%;font-size:12px;table-layout:fixed}.v146-grid th,.v146-grid td,.v146-balance-table th,.v146-balance-table td{border:1px solid #e5e7eb;padding:3px 5px;line-height:1.12;vertical-align:top}.v146-name-head,.v146-name-cell{position:sticky;left:0;z-index:20;min-width:96px;max-width:115px}.v146-name-head{background:#fff!important}.v146-name-cell{background:var(--staff-bg,#fff)!important;color:var(--staff-fg,#111827)!important}.v146-name-cell button{all:unset;cursor:pointer;font-weight:800}.v146-off-col,.v146-off-cell{background:#f1f5f9!important}.v146-cell-stack{display:flex;flex-direction:column;gap:2px;min-height:16px}.v146-shift-pill{border:0;border-radius:8px;padding:2px 5px;background:var(--staff-bg,#dbeafe);color:var(--staff-fg,#111827);font-weight:800;font-size:11px;line-height:1.1;cursor:pointer;white-space:nowrap}.v146-status{display:inline-block;border-radius:7px;padding:1px 4px;font-size:10px;font-weight:800;background:#f3f4f6;border:1px solid #d1d5db;color:#374151}.v146-status.no-duty{background:#fff7ed;border-color:#fdba74;color:#9a3412}.v146-status.long{background:#f1f5f9;border-color:#94a3b8;color:#334155}.v146-status.mat{background:#fef3c7;border-color:#fbbf24;color:#92400e}.v146-status.leave{background:#f8fafc;border-color:#cbd5e1;color:#475569}.v146-day-cards,.v146-person-list,.v146-summary-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.v146-summary-cards{margin-bottom:12px}.v146-day-card,.v146-person-card,.v146-summary-card{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:10px;text-align:left}.v146-day-card.off{background:#f8fafc}.v146-day-head{display:flex;gap:6px;align-items:center;margin-bottom:8px}.v146-day-line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:3px 0;border-top:1px dashed #e5e7eb}.v146-person-card,.v146-summary-card{cursor:pointer;background:var(--staff-bg,#fff);color:var(--staff-fg,#111827);display:flex;flex-direction:column;gap:4px}.v146-balance{display:inline-block;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800}.v146-balance.exempt{background:#f1f5f9;color:#334155}.v146-balance.ok{background:#dcfce7;color:#166534}.v146-balance.warn{background:#fef3c7;color:#92400e}.v146-balance.over{background:#fee2e2;color:#991b1b}.holiday-day{background:#fef3c7!important;color:#92400e!important;font-weight:800}.weekend-day{background:#e5e7eb!important;color:#374151!important;font-weight:800}
  `;
  document.head.appendChild(style);

  // Re-render current broken schedule page after patch loads.
  setTimeout(() => { try { if (getState().page === 'schedule' && typeof window.renderPage === 'function') window.renderPage(); } catch (_) {} }, 0);
})();
