/* v148 Conflict Stabilizer
   Scope:
   1) Restore Monthly Schedule 4 tabs with explicit props/data and safe fallbacks.
   2) Normalize holiday matching for Monthly Position cells.
   3) Restore OT page calculation and tidy status filters.
   4) Lock strict Days Off definition.
*/
(function () {
  'use strict';

  const arr = (v) => Array.isArray(v) ? v : [];
  const pad2 = (n) => String(n).padStart(2, '0');
  const st = () => window.state || {};
  const safe = (fn, fallback) => { try { return fn(); } catch (err) { console.warn('[v148 safe]', err); return fallback; } };
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
  const num = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

  function dateKey(v) {
    if (!v) return '';
    if (v instanceof Date && Number.isFinite(v.getTime())) return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
    const s = String(v).trim();
    const iso = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
    const dt = new Date(s);
    if (Number.isFinite(dt.getTime())) return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
    return '';
  }
  function localDate(v) {
    const k = dateKey(v); const m = k.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function monthInfo(key) {
    const raw = String(key || st().monthKey || new Date().toISOString().slice(0,7));
    const m = raw.match(/^(\d{4})-(\d{1,2})$/);
    const y = m ? Number(m[1]) : new Date().getFullYear();
    const mm = m ? Number(m[2]) : new Date().getMonth() + 1;
    return { key: `${y}-${pad2(mm)}`, y, m: mm, last: new Date(y, mm, 0).getDate() };
  }
  function isWeekendDate(v) { const d = localDate(v); if (!d) return false; return d.getDay() === 0 || d.getDay() === 6; }
  function cleanHolidayName(v) { return String(v || '').split(':::')[0].trim(); }
  function holidayRows() { return arr(st().holidays || st().publicHolidays); }
  function holidayByDate(v) {
    const k = dateKey(v);
    if (!k) return null;
    return holidayRows().find(h => dateKey(h?.holiday_date || h?.date || h?.work_date || h?.duty_date || h?.day) === k) || null;
  }
  function isPublicHolidayDate(v) { return !!holidayByDate(v); }
  function holidayTitle(v) {
    const h = holidayByDate(v);
    if (!h) return '';
    return cleanHolidayName(h.holiday_name || h.name || h.title || h.description || 'HOLIDAY') || 'HOLIDAY';
  }
  window.isPublicHoliday = isPublicHolidayDate;
  window.isHolidayDate = isPublicHolidayDate;
  window.holidayName = holidayTitle;
  try { isPublicHoliday = window.isPublicHoliday; } catch (_) {}
  try { isHolidayDate = window.isHolidayDate; } catch (_) {}
  try { holidayName = window.holidayName; } catch (_) {}

  function lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function explicitFalse(v) { return v === false || v === 0 || ['false','0','no','n'].includes(lower(v)) || /inactive|disabled|ยกเลิก|ลาออก|ปิด/.test(lower(v)); }
  function explicitTrue(v) { return v === true || v === 1 || ['true','1','yes','y'].includes(lower(v)) || /active|ใช้งาน|เปิด/.test(lower(v)); }
  function isDoctor(s) { return /แพทย์|physician|doctor/i.test(String(s?.staff_type || s?.position || s?.role || '')); }
  function activeStaffRows() {
    const all = arr(st().staff);
    if (!all.length) return [];
    // Requirement: prove data first. Keep only active true if present, otherwise only remove explicit disabled/doctor.
    let rows = all.filter(s => s && !isDoctor(s) && (explicitTrue(s.active) || explicitTrue(s.is_active)));
    if (!rows.length) rows = all.filter(s => s && !isDoctor(s) && !explicitFalse(s.active) && !explicitFalse(s.is_active));
    if (!rows.length) rows = all.filter(s => s && !isDoctor(s));
    rows = rows.length ? rows : all.slice();
    return safe(() => typeof window.orderedStaff === 'function' ? window.orderedStaff(rows) : rows.slice().sort((a,b)=>String(a?.nickname||a?.full_name||'').localeCompare(String(b?.nickname||b?.full_name||''),'th')), rows);
  }
  window.isRosterEnabled = (s) => !!(s && !isDoctor(s) && !explicitFalse(s.active) && !explicitFalse(s.is_active));
  try { isRosterEnabled = window.isRosterEnabled; } catch (_) {}

  function staffById(id, staffList) { return arr(staffList || st().staff).find(s => String(s?.id) === String(id)) || null; }
  function staffLabel(x, staffList) { const s = typeof x === 'object' ? x : staffById(x, staffList); return s ? (s.nickname || s.full_name || s.name || '-') : '-'; }
  function staffColorSafe(s) { return safe(() => typeof window.staffColor === 'function' ? window.staffColor(s) : (s?.staff_color || s?.color || '#dbeafe'), '#dbeafe'); }
  function textColorSafe(bg) { return safe(() => typeof window.textColorFor === 'function' ? window.textColorFor(bg) : '#111827', '#111827'); }
  function dutyCols() { return ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT']; }
  function dutyLabel(code, staffView = true) {
    const c = String(code || '');
    if (/^(ช4A|ช4B|ช4|ช4-1|ช4-2|ช4-MT\/แตง)/.test(c)) return staffView ? 'ช4' : (c === 'ช4B' ? 'ช4 (2)' : 'ช4 (1)');
    return safe(() => (window.DUTY_LABEL && window.DUTY_LABEL[c]) || c, c);
  }
  function dutyOrder(code) { const i = dutyCols().indexOf(String(code || '')); return i < 0 ? 999 : i; }
  function monthAssignments(key) {
    const mk = monthInfo(key).key;
    let rows = safe(() => typeof window.getAssignmentsForMonth === 'function' ? arr(window.getAssignmentsForMonth(mk)) : [], []);
    if (!rows.length) rows = arr(st().rosterAssignments).filter(a => dateKey(a?.duty_date).startsWith(mk));
    return rows;
  }

  let recoveryBusy = false;
  async function recoverDataIfNeeded() {
    if (recoveryBusy || !window.state || typeof window.sb === 'undefined' || !window.sb) return;
    const { key, last } = monthInfo();
    const start = `${key}-01`, end = `${key}-${pad2(last)}`;
    const needStaff = !arr(state.staff).length;
    const needAssign = !arr(state.rosterAssignments).some(a => dateKey(a?.duty_date).startsWith(key));
    const needHol = !arr(state.holidays).some(h => dateKey(h?.holiday_date || h?.date).startsWith(key));
    if (!needStaff && !needAssign && !needHol) return;
    recoveryBusy = true;
    try {
      const jobs = [];
      if (needStaff) jobs.push(sb.from('staff_profiles').select('*').order('staff_type').order('nickname').then(res => ['staff', res]));
      if (needAssign) jobs.push(sb.from('roster_assignments').select('*').gte('duty_date', start).lte('duty_date', end).order('duty_date').then(res => ['assign', res]));
      if (needHol) jobs.push(sb.from('public_holidays').select('*').gte('holiday_date', start).lte('holiday_date', end).order('holiday_date').then(res => ['holiday', res]));
      const results = await Promise.all(jobs);
      results.forEach(([name, res]) => {
        if (res?.error) { console.warn('[v148 recovery fetch error]', name, res.error); return; }
        if (name === 'staff') state.staff = arr(res.data);
        if (name === 'assign') state.rosterAssignments = arr(state.rosterAssignments).filter(a => !dateKey(a?.duty_date).startsWith(key)).concat(arr(res.data));
        if (name === 'holiday') state.holidays = arr(state.holidays).filter(h => !dateKey(h?.holiday_date || h?.date).startsWith(key)).concat(arr(res.data));
      });
      console.log('Monthly Schedule Data:', { staffList: activeStaffRows(), holidays: holidayRows(), assignments: monthAssignments() });
      if (st().page === 'schedule' && typeof window.renderPage === 'function') window.renderPage();
    } catch (err) { console.error('[v148 recovery failed]', err); }
    finally { setTimeout(() => { recoveryBusy = false; }, 800); }
  }

  function activeView() {
    const raw = String(st().scheduleView || st().scheduleMobileView || 'day');
    if (raw === 'ot') return 'balance';
    return ['day','person','balance','table'].includes(raw) ? raw : 'day';
  }
  function setView(v) { if (window.state) { state.scheduleView = v === 'ot' ? 'balance' : v; state.scheduleMobileView = state.scheduleView; } }
  function thaiDow(k) { const d = localDate(k); return d ? d.toLocaleDateString('th-TH', { weekday:'short' }) : ''; }
  function dayOffType(k) { return isWeekendDate(k) || isPublicHolidayDate(k); }
  function activeLeave(row) { return !/reject|cancel|delete|ยกเลิก|ไม่อนุมัติ/i.test(String(row?.status || row?.approval_status || 'active')); }
  function inLeaveDate(k, row) { const s = dateKey(row?.start_date || row?.work_date || row?.date), e = dateKey(row?.end_date || row?.start_date || row?.work_date || row?.date); return !!s && s <= k && k <= e; }
  function longLeave(s) { return explicitTrue(s?.is_long_term_leave) || explicitTrue(s?.isLongTermLeave) || explicitTrue(s?.long_term_leave); }
  function leaveLabel(row) {
    const t = String(row?.leave_type || row?.type || row?.reason || row?.note || '').trim();
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
  function statusLabels(s, k) {
    const labels = arr(st().leaves).filter(l => activeLeave(l) && String(l?.staff_id) === String(s?.id) && inLeaveDate(k, l)).map(leaveLabel);
    if (!labels.length && longLeave(s)) labels.push('ลาระยะยาว');
    return [...new Set(labels)];
  }
  function hasDuty(staffId, k, assignments) { return arr(assignments).some(a => String(a?.staff_id) === String(staffId) && dateKey(a?.duty_date) === k); }
  function calcDaysOffStrict(s, assignments) {
    if (longLeave(s)) return 0;
    const { key, last } = monthInfo();
    let count = 0;
    for (let d = 1; d <= last; d++) {
      const k = `${key}-${pad2(d)}`;
      if (!dayOffType(k)) continue;
      if (hasDuty(s.id, k, assignments)) continue;
      // Leave/no-duty status is allowed to count, but a duty in system always blocks the count.
      count += 1;
    }
    return count;
  }
  window.calculateDaysOff = calcDaysOffStrict;
  window.calculateDaysOffStrictV148 = calcDaysOffStrict;

  function statusBadge(text) {
    const cls = text === 'ไม่รับเวร' ? 'no-duty' : /ลาระยะยาว|บวช|ดูใจ|ถือศีล/.test(text) ? 'long' : 'leave';
    return `<span class="v148-status ${cls}">${esc(text)}</span>`;
  }
  function shiftPill(a, s) {
    const bg = staffColorSafe(s), fg = textColorSafe(bg);
    const id = a?.id ? `data-trade-duty="${esc(a.id)}"` : `data-staff-stat="${esc(s?.id || '')}"`;
    return `<button type="button" class="v148-shift-pill" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}" ${id}>${esc(dutyLabel(a?.duty_code, true))}</button>`;
  }
  function calcStats(assignments) {
    return safe(() => typeof window.calcFairness === 'function' ? (window.calcFairness(arr(assignments).filter(a => a?.staff_id)) || {}) : {}, {}) || {};
  }
  function targetOf(s, fallback) { const raw = s?.targetShifts ?? s?.target_shifts ?? s?.monthly_target_shifts ?? s?.quota_shifts; return raw === undefined || raw === null || raw === '' ? fallback : num(raw, fallback); }
  function targetZero(s) { return !longLeave(s) && targetOf(s, NaN) === 0; }

  function renderTabs(view) {
    const b = (id, label) => `<button type="button" class="v148-tab ${view===id?'active':''}" data-v148-tab="${id}">${esc(label)}</button>`;
    return `<div class="v148-tabs no-print">${b('day','ดูตามวัน')}${b('person','ดูตามคน')}${b('balance','ดูสมดุล การกระจายเวร')}${b('table','ตาราง')}</div>`;
  }
  function renderDayView(data) {
    const staffList = arr(data.staffList), assignments = arr(data.assignments);
    const { key, last } = monthInfo();
    if (!staffList.length) return `<div class="empty-state">ไม่มีรายชื่อเจ้าหน้าที่ที่เปิดใช้จัดเวร</div>`;
    return `<div class="v148-day-cards">${Array.from({length:last},(_,i)=>i+1).map(d=>{
      const k = `${key}-${pad2(d)}`;
      const rows = assignments.filter(a => dateKey(a?.duty_date) === k && a?.staff_id).sort((a,b)=>dutyOrder(a?.duty_code)-dutyOrder(b?.duty_code));
      return `<div class="v148-day-card ${dayOffType(k)?'off':''}"><div class="v148-day-head"><b>${d}</b><span>${esc(thaiDow(k))}</span>${isPublicHolidayDate(k)?`<span class="badge yellow">${esc(holidayTitle(k))}</span>`:''}</div>${rows.length ? rows.map(a=>{ const s=staffById(a.staff_id, staffList); return `<div class="v148-day-line"><b>${esc(dutyLabel(a.duty_code,true))}</b>${s ? shiftPill(a,s) : `<span>${esc(a.staff_id)}</span>`}</div>`; }).join('') : '<span class="muted">ไม่มีเวร</span>'}</div>`;
    }).join('')}</div>`;
  }
  function renderPersonView(data) {
    const staffList = arr(data.staffList), assignments = arr(data.assignments);
    if (!staffList.length) return `<div class="empty-state">ไม่มีรายชื่อเจ้าหน้าที่ที่เปิดใช้จัดเวร</div>`;
    const stats = calcStats(assignments);
    const cards = `<div class="v148-summary-cards">${staffList.map(s=>{ const bg=staffColorSafe(s), fg=textColorSafe(bg), r=stats[s.id]||{}; return `<button type="button" class="v148-summary-card" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}" data-staff-stat="${esc(s.id)}"><b>${esc(staffLabel(s))}</b><span>${num(r.units??r.total,0).toFixed(1)} เวร • ${num(r.hours,0).toFixed(0)} ชม.</span></button>`; }).join('')}</div>`;
    const list = `<div class="v148-person-list">${staffList.map(s=>{ const rows = assignments.filter(a => String(a?.staff_id) === String(s.id)).sort((a,b)=>dateKey(a?.duty_date).localeCompare(dateKey(b?.duty_date))||dutyOrder(a?.duty_code)-dutyOrder(b?.duty_code)); return `<div class="v148-person-card"><div><b>${esc(staffLabel(s))}</b> <span class="badge blue">${rows.length} เวร</span></div>${rows.length ? rows.map(a=>`<div class="v148-person-duty"><span>${esc(dateKey(a.duty_date).slice(-2))}</span><b>${esc(dutyLabel(a.duty_code,true))}</b></div>`).join('') : '<span class="muted">ไม่มีเวรเดือนนี้</span>'}</div>`; }).join('')}</div>`;
    return cards + list;
  }
  function renderBalanceView(data) {
    const staffList = arr(data.staffList), assignments = arr(data.assignments);
    if (!staffList.length) return `<div class="empty-state">ไม่มีรายชื่อเจ้าหน้าที่ที่เปิดใช้จัดเวร</div>`;
    const stats = calcStats(assignments);
    const active = staffList.filter(s => !longLeave(s) && !targetZero(s));
    const avg = active.length ? active.reduce((sum,s)=>sum + num(stats[s.id]?.units ?? stats[s.id]?.total,0),0) / active.length : 0;
    return `<div class="v148-balance-wrap"><div class="notice soft-notice">นิยามวันหยุด: เสาร์/อาทิตย์/นักขัต และไม่มีชื่อขึ้นเวรในระบบ ถ้ามีเวรจะไม่นับเป็นวันหยุด</div><div class="table-wrap"><table class="v148-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เป้าหมาย</th><th>จัดแล้ว</th><th>Quota Gap</th><th>OT Balance/ยกยอด</th><th>จำนวนวันหยุด</th><th>Status</th></tr></thead><tbody>${staffList.map(s=>{ const isLong=longLeave(s), isZero=targetZero(s), exempt=isLong||isZero; const current=exempt?0:num(stats[s.id]?.units ?? stats[s.id]?.total,0); const target=exempt?0:targetOf(s,avg); const gap=exempt?0:target-current; const carry=exempt?0:num(s.carry_over_balance ?? s.overtime_balance ?? s.overtimeBalance ?? s.ot_balance,0); const days=exempt?0:calcDaysOffStrict(s,assignments); const status=isLong?'ยกเว้น/ลาระยะยาว':isZero?'ไม่มีเป้าหมายเวร':Math.abs(gap)<0.5?'สมดุล':gap>0?'ขาดเวร':'งานหนักเกิน'; const cls=isLong||isZero?'exempt':Math.abs(gap)<0.5?'ok':gap>0?'warn':'over'; return `<tr><td>${esc(staffLabel(s))}</td><td>${target.toFixed(1)}</td><td>${current.toFixed(1)}</td><td>${gap.toFixed(1)}</td><td>${carry.toFixed(1)} ชม.</td><td>${days}</td><td><span class="v148-balance ${cls}">${esc(status)}</span></td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  function renderGridView(data) {
    const staffList = arr(data.staffList), assignments = arr(data.assignments);
    if (!staffList.length) return `<div class="empty-state">ไม่มีรายชื่อเจ้าหน้าที่ที่เปิดใช้จัดเวร</div>`;
    const { key, last } = monthInfo();
    const days = Array.from({length:last},(_,i)=>i+1);
    return `<div class="table-wrap v148-grid-wrap"><table id="scheduleTable" class="v148-grid"><thead><tr><th class="v148-name-head">เจ้าหน้าที่</th>${days.map(d=>{ const k=`${key}-${pad2(d)}`; return `<th class="${dayOffType(k)?'v148-off-col':''}">${d}<br><span>${esc(thaiDow(k))}</span></th>`; }).join('')}</tr></thead><tbody>${staffList.map((s,i)=>{ const bg=staffColorSafe(s), fg=textColorSafe(bg); return `<tr class="${i%2?'zebra':''}"><th class="v148-name-cell" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}"><button type="button" data-staff-stat="${esc(s.id)}">${esc(staffLabel(s))}</button></th>${days.map(d=>{ const k=`${key}-${pad2(d)}`; const shifts=assignments.filter(a=>String(a?.staff_id)===String(s.id)&&dateKey(a?.duty_date)===k).sort((a,b)=>dutyOrder(a?.duty_code)-dutyOrder(b?.duty_code)); return `<td class="${dayOffType(k)?'v148-off-cell':''}"><div class="v148-cell-stack">${statusLabels(s,k).map(statusBadge).join('')}${shifts.map(a=>shiftPill(a,s)).join('')}</div></td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`;
  }
  function renderContent(view, data) {
    try {
      if (view === 'day') return renderDayView(data);
      if (view === 'person') return renderPersonView(data);
      if (view === 'balance') return renderBalanceView(data);
      return renderGridView(data);
    } catch (err) {
      console.error('[v148 tab render failed]', view, err, data);
      return `<div class="notice danger">ไม่สามารถแสดงแท็บนี้ได้: ${esc(err?.message || err)}</div>`;
    }
  }
  window.renderMonthlySchedulePage = function renderMonthlySchedulePageV148() {
    const view = activeView();
    const staffList = activeStaffRows();
    const holidays = holidayRows();
    const assignments = monthAssignments();
    console.log('Monthly Schedule Data:', { staffList, holidays, assignments });
    if (!staffList.length || !assignments.length || !holidays.length) setTimeout(recoverDataIfNeeded, 0);
    let trade = '';
    if (view === 'person') trade = safe(() => typeof window.renderDutyTradePanel === 'function' ? window.renderDutyTradePanel(assignments) : '', '');
    return `<div class="card schedule-page-card v148-schedule-page"><div class="toolbar no-print v148-toolbar"><label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(monthInfo().key)}"></label><button class="ghost-btn" data-export-schedule-excel>Export Excel</button><button class="ghost-btn" data-print-page>Export PDF / พิมพ์</button></div>${renderTabs(view)}<h3 class="print-only">ตารางเวรประจำเดือน ${esc(monthInfo().key)}</h3><div id="scheduleTabContent" class="v148-tab-content" data-active-view="${esc(view)}">${renderContent(view, { staffList, holidays, assignments })}</div>${trade}</div>`;
  };
  try { renderMonthlySchedulePage = window.renderMonthlySchedulePage; } catch (_) {}

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = function renderPageV148() {
    if (st().page === 'schedule') {
      const pc = document.getElementById('pageContent');
      if (!pc) return false;
      try {
        const title = document.getElementById('pageTitle'), sub = document.getElementById('pageSubtitle');
        if (title) title.textContent = 'ตารางเวรประจำเดือน';
        if (sub) sub.textContent = 'ดูตามวัน / ดูตามคน / ดูสมดุล / ตาราง';
        pc.innerHTML = window.renderMonthlySchedulePage();
        return true;
      } catch (err) {
        console.error('[v148 schedule render failed]', err);
        pc.innerHTML = `<div class="notice danger">หน้า “ตารางเวรประจำเดือน” มีข้อผิดพลาด: ${esc(err?.message || err)}</div>`;
        return false;
      }
    }
    return safe(() => typeof oldRenderPage === 'function' ? oldRenderPage.apply(this, arguments) : undefined, undefined);
  };
  try { renderPage = window.renderPage; } catch (_) {}

  document.addEventListener('click', function (e) {
    const btn = e.target?.closest?.('[data-v148-tab],[data-v147-schedule-tab],[data-v146-schedule-tab],[data-schedule-mobile-view],[data-schedule-view]');
    if (!btn) return;
    const v = btn.dataset.v148Tab || btn.dataset.v147ScheduleTab || btn.dataset.v146ScheduleTab || btn.dataset.scheduleMobileView || btn.dataset.scheduleView;
    if (!['day','person','balance','table','ot'].includes(v)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    setView(v);
    if (typeof window.renderPage === 'function') window.renderPage();
  }, true);

  // Monthly position: exact HOLIDAY/WEEKEND renderer.
  window.isNoPositionDay = (date) => isWeekendDate(date) || isPublicHolidayDate(date);
  try { isNoPositionDay = window.isNoPositionDay; } catch (_) {}
  const oldPositionCell = window.renderMonthPositionCell || (typeof renderMonthPositionCell === 'function' ? renderMonthPositionCell : null);
  window.renderMonthPositionCell = function renderMonthPositionCellV148(staff, date, cellRows, canEdit) {
    const k = dateKey(date);
    if (isWeekendDate(k)) return `<td class="matrix-cell no-position-day weekend-day"><span>WEEKEND</span></td>`;
    if (isPublicHolidayDate(k)) return `<td class="matrix-cell no-position-day holiday-day"><span>HOLIDAY</span></td>`;
    return safe(() => typeof oldPositionCell === 'function' ? oldPositionCell(staff, k || date, arr(cellRows), canEdit) : `<td class="matrix-cell"></td>`, `<td class="matrix-cell"></td>`);
  };
  try { renderMonthPositionCell = window.renderMonthPositionCell; } catch (_) {}

  // OT restore and tidy filter layout.
  function normalizeTime(v) { const m = String(v || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/); if (!m) return ''; return `${pad2(Math.min(23, Math.max(0, Number(m[1]))))}:${pad2(Math.min(59, Math.max(0, Number(m[2]))))}:${pad2(Math.min(59, Math.max(0, Number(m[3] || 0))))}`; }
  function localDateTime(k, time) { const dk = dateKey(k), tt = normalizeTime(time); if (!dk || !tt) return null; const d = new Date(`${dk}T${tt}`); return Number.isFinite(d.getTime()) ? d : null; }
  function otStart(k) { return dayOffType(k) ? '17:00:00' : '16:00:00'; }
  window.calcOtHours = function calcOtHoursV148(row) {
    try {
      const k = dateKey(row?.work_date); if (!k) return 0;
      const start = localDateTime(k, otStart(k));
      let end = row?.end_time ? localDateTime(k, row.end_time) : null;
      if (!end && row?.check_out_at && !row?.end_time) { const d = new Date(row.check_out_at); if (Number.isFinite(d.getTime())) end = d; }
      if (!start || !end) return 0;
      const h = (end.getTime() - start.getTime()) / 36e5;
      if (!Number.isFinite(h) || Number.isNaN(h) || h < 0 || h > 16) return 0;
      return Math.round(h * 10) / 10;
    } catch (_) { return 0; }
  };
  try { calcOtHours = window.calcOtHours; } catch (_) {}
  function currentMonth() { return st().monthKey || new Date().toISOString().slice(0,7); }
  function otFilters() {
    if (!window.state) return { status:'รออนุมัติ', month:currentMonth(), date:'', q:'' };
    if (!state.otFilterStatus) state.otFilterStatus = 'รออนุมัติ';
    if (!state.otFilterMonth) state.otFilterMonth = currentMonth();
    return { status: state.otFilterStatus || 'รออนุมัติ', month: state.otFilterMonth || '', date: state.otFilterDate || '', q: String(state.otFilterText || '').trim().toLowerCase() };
  }
  function rowStatus(r) { return String(r?.status || 'รออนุมัติ'); }
  function filterOt(rows) {
    const f = otFilters();
    return arr(rows).filter(r => {
      const k = dateKey(r?.work_date);
      if (f.date && k !== f.date) return false;
      if (!f.date && f.month && !k.startsWith(f.month)) return false;
      if (f.status !== 'ทั้งหมด' && rowStatus(r) !== f.status) return false;
      if (f.q) {
        const hay = [staffLabel(r?.staff_id), r?.reason, r?.note, rowStatus(r), k].join(' ').toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    }).sort((a,b) => dateKey(b?.work_date).localeCompare(dateKey(a?.work_date)) || String(b?.created_at || b?.check_out_at || '').localeCompare(String(a?.created_at || a?.check_out_at || '')));
  }
  function renderOtFilter(total, shown) {
    const f = otFilters(); const statuses = ['ทั้งหมด','รออนุมัติ','อนุมัติ','ไม่อนุมัติ'];
    return `<div class="v148-ot-filter no-print"><label>สถานะ <select id="otFilterStatus">${statuses.map(x=>`<option value="${esc(x)}" ${f.status===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>เดือน/ปี <input id="otFilterMonth" type="month" value="${esc(f.month)}"></label><label>ค้นตามวันที่ทำงาน <input id="otFilterDate" type="date" value="${esc(f.date)}"></label><label>ค้นหา <input id="otFilterText" type="search" value="${esc(f.q)}" placeholder="ชื่อ / เหตุผล / สถานะ"></label><button type="button" class="ghost-btn" data-clear-ot-filter>ล้างตัวกรอง</button><span class="badge blue">แสดง ${shown}/${total}</span></div>`;
  }
  const oldRenderOtTable = window.renderOtTable || (typeof renderOtTable === 'function' ? renderOtTable : null);
  window.renderOtTable = function renderOtTableV148(rows) { return safe(() => typeof oldRenderOtTable === 'function' ? oldRenderOtTable(filterOt(rows)) : '', ''); };
  try { renderOtTable = window.renderOtTable; } catch (_) {}
  const oldOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  window.renderOtPage = function renderOtPageV148() {
    const html = safe(() => typeof oldOtPage === 'function' ? oldOtPage() : '', '');
    if (!(typeof window.isAdmin === 'function' ? window.isAdmin() : safe(() => isAdmin(), false))) return html;
    if (html.includes('v148-ot-filter')) return html;
    const all = arr(st().otRequests); const shown = filterOt(all).length;
    return html.replace(/(<div class="section-title"><h3>ส่วนที่ 3 อนุมัติ OT<\/h3>[\s\S]*?<\/div>)/, `$1${renderOtFilter(all.length, shown)}`);
  };
  try { renderOtPage = window.renderOtPage; } catch (_) {}

  document.addEventListener('change', function(e){ const t=e.target; if(!t||!window.state)return; if(t.id==='otFilterStatus'){state.otFilterStatus=t.value||'รออนุมัติ'; window.renderPage?.();} if(t.id==='otFilterMonth'){state.otFilterMonth=t.value||'';state.otFilterDate='';window.renderPage?.();} if(t.id==='otFilterDate'){state.otFilterDate=t.value||'';window.renderPage?.();}}, true);
  document.addEventListener('input', function(e){ const t=e.target; if(!t||!window.state)return; if(t.id==='otFilterText'){state.otFilterText=t.value||''; clearTimeout(window.__v148OtTimer); window.__v148OtTimer=setTimeout(()=>window.renderPage?.(),220);}}, true);
  document.addEventListener('click', function(e){ const b=e.target?.closest?.('[data-clear-ot-filter]'); if(!b||!window.state)return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation(); state.otFilterStatus='รออนุมัติ';state.otFilterMonth=currentMonth();state.otFilterDate='';state.otFilterText='';window.renderPage?.();}, true);

  const css = document.createElement('style');
  css.textContent = `
  .v148-tabs{position:sticky;top:0;z-index:260;display:flex;gap:8px;flex-wrap:wrap;background:#fff;padding:8px 0;margin-bottom:10px;border-bottom:1px solid #e5e7eb;pointer-events:auto!important}.v148-tab{cursor:pointer!important;pointer-events:auto!important;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 12px;font-weight:800}.v148-tab.active{background:#0ea5e9;color:#fff;border-color:#0ea5e9}.v148-tab-content{min-height:160px}.v148-day-cards,.v148-person-list,.v148-summary-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.v148-summary-cards{margin-bottom:12px}.v148-day-card,.v148-person-card,.v148-summary-card{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:10px;text-align:left}.v148-day-card.off{background:#f8fafc}.v148-day-head{display:flex;gap:6px;align-items:center;margin-bottom:8px}.v148-day-line,.v148-person-duty{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:3px 0;border-top:1px dashed #e5e7eb}.v148-summary-card{cursor:pointer;background:var(--staff-bg,#fff);color:var(--staff-fg,#111827);display:flex;flex-direction:column;gap:4px}.v148-grid-wrap{overflow:auto}.v148-grid,.v148-balance-table{border-collapse:collapse;width:max-content;min-width:100%;font-size:12px;table-layout:fixed}.v148-grid th,.v148-grid td,.v148-balance-table th,.v148-balance-table td{border:1px solid #e5e7eb;padding:3px 5px;line-height:1.12;vertical-align:top}.v148-name-head,.v148-name-cell{position:sticky;left:0;z-index:20;min-width:96px;max-width:118px}.v148-name-head{background:#fff!important}.v148-name-cell{background:var(--staff-bg,#fff)!important;color:var(--staff-fg,#111827)!important}.v148-name-cell button{all:unset;cursor:pointer;font-weight:800}.v148-off-col,.v148-off-cell{background:#f1f5f9!important}.v148-cell-stack{display:flex;flex-direction:column;gap:2px;min-height:16px}.v148-shift-pill{border:0;border-radius:8px;padding:2px 5px;background:var(--staff-bg,#dbeafe);color:var(--staff-fg,#111827);font-weight:800;font-size:11px;line-height:1.1;cursor:pointer;white-space:nowrap}.v148-status{display:inline-block;border-radius:7px;padding:1px 4px;font-size:10px;font-weight:800;background:#f3f4f6;border:1px solid #d1d5db;color:#374151}.v148-status.no-duty{background:#fff7ed;border-color:#fdba74;color:#9a3412}.v148-status.long{background:#f1f5f9;border-color:#94a3b8;color:#334155}.v148-status.leave{background:#f8fafc;border-color:#cbd5e1;color:#475569}.v148-balance{display:inline-block;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800}.v148-balance.exempt{background:#f1f5f9;color:#334155}.v148-balance.ok{background:#dcfce7;color:#166534}.v148-balance.warn{background:#fef3c7;color:#92400e}.v148-balance.over{background:#fee2e2;color:#991b1b}.holiday-day{background:#fef3c7!important;color:#92400e!important;font-weight:800}.weekend-day{background:#e5e7eb!important;color:#374151!important;font-weight:800}.v148-ot-filter{display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin:10px 0 14px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px}.v148-ot-filter label{display:flex;flex-direction:column;gap:4px;min-width:145px;font-weight:700}.v148-ot-filter input,.v148-ot-filter select{height:36px}.empty-state{padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;text-align:center}@media(max-width:820px){.v148-ot-filter{display:grid;grid-template-columns:1fr}.v148-ot-filter label{min-width:0}.v148-grid,.v148-balance-table{font-size:11px}}
  `;
  document.head.appendChild(css);

  setTimeout(() => { if (st().page === 'schedule') safe(() => window.renderPage?.(), null); }, 0);
})();
