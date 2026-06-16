/* =========================
   V237 Monthly Position UX + Weekly Swap
   - Full-week leave cells show only leave type (ex: ลาคลอด), details stay in data/title.
   - Count row shows compact "13/13 คน" only; extra slot details stay in title.
   - Missing row treats reduced weekly slot target as complete when all required staff/unique slots are filled.
   - Editing one monthly position swaps that position across the same work week.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V237_MONTH_POSITION_COMPACT_WEEK_SWAP';
  if (window.__CNMI_V237_MONTH_POSITION_COMPACT_WEEK_SWAP__) return;
  window.__CNMI_V237_MONTH_POSITION_COMPACT_WEEK_SWAP__ = true;

  const prevValueByCell = new Map();

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function parseSafe(date){
    try { return parseDate(normDate(date)); }
    catch (_) { return new Date(`${normDate(date)}T00:00:00`); }
  }
  function monthNow(){
    try { return monthKey(new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 7); }
  }
  function currentStaffSafe(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || null; }
  }
  function isAdminSafe(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function copyRows(rows){
    try { return structuredClone(rows || []); }
    catch (_) { return JSON.parse(JSON.stringify(rows || [])); }
  }
  function noPositionDay(date){
    const d = normDate(date);
    try { if (typeof isNoPositionDay === 'function') return !!isNoPositionDay(d); } catch (_) {}
    try { return !!isWeekend(d) || !!isHolidayDate(d); } catch (_) { return false; }
  }
  function holidayLabel(date){
    const d = normDate(date);
    try { return isHolidayDate(d) ? 'HOLIDAY' : 'WEEKEND'; } catch (_) { return 'WEEKEND'; }
  }
  function hasOutingSafe(date){ try { return !!hasOuting(normDate(date)); } catch (_) { return false; } }
  function sameMonth(date, key){ return normDate(date).startsWith(String(key || '').slice(0, 7)); }
  function codeOf(row){
    const raw = String(row?.position_code || row?.code || '').trim();
    if (!raw) return '';
    try { return positionBaseCode(raw) || raw; } catch (_) { return raw.replace(/\s+#\d+$/, '').trim(); }
  }
  function templateByCode(code, date){
    try { return positionTemplateByCode(code, date) || {}; } catch (_) { return {}; }
  }
  function makeRow(date, staffId, code){
    const d = normDate(date);
    const c = String(code || '').trim();
    try { return makeMonthPositionRow(d, staffId, c); }
    catch (_) {
      const base = templateByCode(c, d);
      return {
        work_date: d,
        position_code: c,
        zone: base.zone || 'รอตรวจสอบ',
        break_time: base.break_time || '-',
        main_rule: base.main_rule || '',
        job_desc: base.job_desc || '',
        staff_id: staffId,
        updated_by: currentStaffSafe()
      };
    }
  }
  function leaveText(row){
    try { return leaveDisplayType(row); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || 'ลา').split(':::')[0].trim(); }
  }
  function leaveClass(row){
    try { return leaveCellClass(leaveText(row)); } catch (_) { return 'leave-other'; }
  }
  function leaveEffective(row){
    try { return typeof isLeaveEffective === 'function' ? isLeaveEffective(row) : true; }
    catch (_) {
      const raw = String(row?.status || row?.approval_status || 'active').trim();
      const st = raw.toLowerCase();
      if (['cancelled','canceled','deleted','inactive','void','rejected'].includes(st)) return false;
      if (['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw)) return false;
      return true;
    }
  }
  function dateInLeave(row, date){
    const d = normDate(date);
    try { return overlapsDate(row, d) && leaveEffective(row); }
    catch (_) {
      const s = normDate(row?.start_date || row?.date || row?.work_date);
      const e = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!s && !!e && s <= d && e >= d && leaveEffective(row);
    }
  }
  function activeLeaveRow(staffId, date){
    const sid = String(staffId || '');
    const d = normDate(date);
    if (!sid || !d) return null;
    try {
      const row = activeLeaveRecordOn(sid, d);
      if (row) return row;
    } catch (_) {}
    return (state.leaves || []).find(l => String(l?.staff_id || '') === sid && dateInLeave(l, d)) || null;
  }
  function fullWeekLeaveInfo(staffId, date){
    try {
      if (window.cnmiV233?.fullWeekLeaveInfo) return window.cnmiV233.fullWeekLeaveInfo(staffId, date);
    } catch (_) {}
    const dates = weekWorkDates(date);
    if (!staffId || !dates.length) return null;
    const rows = dates.map(d => activeLeaveRow(staffId, d));
    if (!rows.every(Boolean)) return null;
    const labels = Array.from(new Set(rows.map(leaveText).filter(Boolean)));
    return { rows, label: labels.length ? labels.join(' / ') : 'ลา', dates };
  }
  function isFullWeekLeave(staffId, date){ return !!fullWeekLeaveInfo(staffId, date); }
  function monthDates(key){
    const k = String(key || monthNow()).slice(0, 7);
    try {
      const r = getMonthRange(k);
      const last = r.last || new Date(r.y, r.m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${r.y}-${pad(r.m)}-${pad(i + 1)}`);
    } catch (_) {
      const [y, m] = k.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${y}-${pad2(m)}-${pad2(i + 1)}`);
    }
  }
  function weekKey(date){
    try { return weekKeyOf(date); }
    catch (_) {
      const d = parseSafe(date);
      const day = d.getDay() || 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - day + 1);
      return ymd(mon);
    }
  }
  function weekWorkDates(date){
    const d = normDate(date);
    const key = d.slice(0, 7);
    return monthDates(key).filter(x => !noPositionDay(x) && weekKey(x) === weekKey(d));
  }
  function mondayToFriday(date){
    const base = parseSafe(date);
    const day = base.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(base);
    mon.setDate(base.getDate() + diff);
    const key = normDate(date).slice(0, 7);
    return Array.from({ length:5 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return ymd(d);
    }).filter(d => sameMonth(d, key) && !noPositionDay(d));
  }
  function positionEnabledStaff(){
    return (state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s); }
      catch (_) { return !!s?.id && s?.is_active !== false && s?.active !== false; }
    });
  }
  function weeklyAvailableStaff(date){
    try {
      if (window.cnmiV233?.weeklyAvailableStaff) return window.cnmiV233.weeklyAvailableStaff(date) || [];
    } catch (_) {}
    try {
      if (window.cnmiV231?.weeklyAvailableStaff231) return window.cnmiV231.weeklyAvailableStaff231(date) || [];
    } catch (_) {}
    const list = positionEnabledStaff().filter(s => !isFullWeekLeave(s.id, date));
    try { return orderedStaff(list); } catch (_) { return list; }
  }
  function fullWeekLeaveCount(date){
    try { if (window.cnmiV233?.fullWeekLeaveCount) return window.cnmiV233.fullWeekLeaveCount(date) || 0; } catch (_) {}
    return positionEnabledStaff().filter(s => isFullWeekLeave(s.id, date)).length;
  }
  function expectedTemplates(date){
    const d = normDate(date);
    if (!d || noPositionDay(d)) return [];
    try {
      const list = window.cnmiV231?.expectedTemplatesForDate231?.(d);
      if (Array.isArray(list) && list.length) return list;
    } catch (_) {}
    try {
      const list = monthPositionRoleOptionsForDate(d, '');
      if (Array.isArray(list)) return list;
    } catch (_) {}
    return [];
  }
  function optionsForDate(date, current){
    try {
      const list = monthPositionRoleOptionsForDate(normDate(date), current || '');
      if (Array.isArray(list)) return list;
    } catch (_) {}
    return expectedTemplates(date);
  }
  function codeAllowedOnDate(date, code){
    const c = String(code || '').trim();
    if (!c) return true;
    const list = optionsForDate(date, c);
    if (!list.length) return true;
    return list.some(p => String(p?.code || p?.position_code || '') === c);
  }
  function canEditMonth(){ return isAdminSafe() && String(state?.page || '') === 'positionMonth'; }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function staffColorSafe(st){ try { return staffColor(st); } catch (_) { return '#e0f2fe'; } }
  function textColorSafe(bg){ try { return textColorFor(bg); } catch (_) { return '#0f172a'; } }
  function staffOrder(list){ try { return orderedStaff(list); } catch (_) { return list; } }
  function leaveIndex(dates){
    const out = new Map();
    positionEnabledStaff().forEach(st => {
      (dates || []).forEach(d => {
        const row = activeLeaveRow(st.id, d);
        if (row) out.set(`${String(st.id)}|${d}`, row);
      });
    });
    return out;
  }
  function renderCountCell(date, assignedStaffByDate){
    const d = normDate(date);
    if (noPositionDay(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const available = weeklyAvailableStaff(d).length;
    const slots = expectedTemplates(d).length;
    const assigned = assignedStaffByDate.get(d)?.size || 0;
    const fullOut = fullWeekLeaveCount(d);
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    const target = Math.min(available || slots, slots || available);
    const tone = assigned >= target ? 'complete' : 'has-missing';
    const title = fullOut ? `Slot หลัก ${base} คน • ลาทั้งสัปดาห์ ${fullOut} คน • ใช้ชุด ${slots} คน` : `Slot หลัก ${base} คน • ใช้ชุด ${slots} คน`;
    return `<th class="count-role-cell ${tone}" title="${esc(title)}"><b>${esc(available)}/${esc(slots)} คน</b></th>`;
  }
  function renderMissingCell(date, assignedByDate, assignedStaffByDate){
    const d = normDate(date);
    if (noPositionDay(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const assigned = assignedByDate.get(d) || new Set();
    const expected = expectedTemplates(d);
    const missing = expected.filter(p => !assigned.has(codeOf(p)));
    const available = weeklyAvailableStaff(d).length;
    const slots = expected.length;
    const target = Math.min(available || slots, slots || available);
    const assignedStaff = assignedStaffByDate.get(d)?.size || 0;
    if (!missing.length || (assignedStaff >= target && assigned.size >= target)) {
      return `<th class="missing-role-cell complete">ครบ</th>`;
    }
    return `<th class="missing-role-cell has-missing" title="ยังขาด: ${esc(missing.map(p => p?.code || p?.position_code || '').join(', '))}"><b>${esc(missing.length)}</b><br><small>${missing.map(p => esc(p?.code || p?.position_code || '')).join(', ')}</small></th>`;
  }
  function renderMonthCell(staff, date, cellRows, canEdit, leaves){
    const d = normDate(date);
    if (noPositionDay(d)) return `<td class="matrix-cell no-position-day"><span>${holidayLabel(d)}</span></td>`;
    const sid = String(staff?.id || '');
    const fullLeave = fullWeekLeaveInfo(sid, d);
    const leaveRow = leaves.get(`${sid}|${d}`) || activeLeaveRow(sid, d) || null;
    const hasLeave = !!leaveRow;
    const leaveLabel = fullLeave?.label || (leaveRow ? leaveText(leaveRow) : '');
    if (fullLeave) {
      const cls = `full-week-leave-cell ${leaveClass(leaveRow || fullLeave.rows?.[0])}`;
      return `<td class="matrix-cell leave-cell ${cls}" title="${esc('ลาทั้งสัปดาห์ / ไม่จัดตำแหน่ง: ' + leaveLabel)}"><span class="v237-full-week-leave-pill">${esc(leaveLabel || 'ลา')}</span></td>`;
    }
    const row = (cellRows || [])[0] || null;
    const cleanCodes = (cellRows || []).map(r => String(r?.position_code || r?.code || '').trim()).filter(Boolean).filter(c => c !== 'รอตรวจสอบ');
    const cls = `${hasOutingSafe(d) ? 'outing-cell' : ''} ${hasLeave ? 'leave-cell ' + leaveClass(leaveRow) : ''} ${!cleanCodes.length && !hasLeave ? 'needs-review-cell' : ''}`.trim();
    const leaveMark = hasLeave ? `<small class="leave-note-v228">${esc(leaveLabel)}</small>` : '';
    if (canEdit) {
      const current = row?.position_code || '';
      const options = optionsForDate(d, current);
      return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(d)}|${esc(sid)}" data-v237-current="${esc(current)}"><option value="">${hasLeave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${options.map(t => `<option value="${esc(t.code)}" ${current===t.code?'selected':''}>${esc(t.code)}</option>`).join('')}</select>${leaveMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    }
    const text = cleanCodes.length ? cleanCodes.join(' / ') : (hasLeave ? leaveLabel : '');
    const safeText = esc(text);
    return `<td class="matrix-cell ${cls}">${safeText ? `<span title="${safeText}${hasLeave && cleanCodes.length ? ' • ' + esc(leaveLabel) : ''}">${safeText}</span>` : ''}${leaveMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
  }

  const renderV237 = function renderMonthPositionMatrixV237(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) && dates.length ? dates : monthDates(state.positionMonthKey || state.monthKey || monthNow());
    if (!rows.length) return emptySafe('ยังไม่มีแผนรายเดือน กด “สร้างตารางตั้งต้นเปล่า” หรือ “สร้างแผนรายสัปดาห์ทั้งเดือน” ก่อน');
    const byCell = Object.create(null);
    const assignedByDate = new Map();
    const assignedStaffByDate = new Map();
    rows.forEach((r, idx) => {
      const sid = String(r?.staff_id || '');
      const d = normDate(r?.work_date);
      if (!sid || !d) return;
      if (isFullWeekLeave(sid, d)) return;
      const row = { ...r, zone:(r.zone || ''), _idx:idx };
      (byCell[`${sid}|${d}`] ||= []).push(row);
      const code = codeOf(r);
      if (code && code !== 'รอตรวจสอบ') {
        if (!assignedByDate.has(d)) assignedByDate.set(d, new Set());
        assignedByDate.get(d).add(code);
        if (!assignedStaffByDate.has(d)) assignedStaffByDate.set(d, new Set());
        assignedStaffByDate.get(d).add(sid);
      }
    });
    const rowStaffIds = new Set(rows.map(r => String(r?.staff_id || '')).filter(Boolean));
    const displayStaff = staffOrder((state.staff || []).filter(s => {
      const sid = String(s?.id || '');
      if (!sid) return false;
      try { return isDailyPositionEnabled(s) || rowStaffIds.has(sid); }
      catch (_) { return rowStaffIds.has(sid) || s?.is_active !== false; }
    }));
    const canEdit = canEditMonth();
    const leaves = leaveIndex(dates);
    const heads = dates.map(date => {
      const d = parseSafe(date);
      const cls = (() => { try { return isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; } catch (_) { return ''; } })();
      return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('');
    const countRow = dates.map(date => renderCountCell(date, assignedStaffByDate)).join('');
    const missing = dates.map(date => renderMissingCell(date, assignedByDate, assignedStaffByDate)).join('');
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    return `<div class="monthly-matrix-wrap v182-position-matrix v218-position-matrix v228-position-matrix v231-position-matrix v233-position-matrix v237-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="legend-box leave"></span> Slot หลัก ${esc(base)} คน • ลาทั้งสัปดาห์แสดงเฉพาะประเภทลา ${canEdit ? '<span class="hint">เลือกตำแหน่ง 1 ช่อง = สลับตำแหน่งทั้งสัปดาห์อัตโนมัติ แล้วกดบันทึกแผนทั้งเดือน</span>' : ''}</div><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countRow}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missing}</tr></thead><tbody>${displayStaff.map(st => { const bg = staffColorSafe(st); const fg = textColorSafe(bg); return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(st.nickname || st.full_name || '-')}</b><small>${esc(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell(st, date, byCell[`${st.id}|${date}`] || [], canEdit, leaves)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };
  window.renderMonthPositionMatrix = renderV237;
  try { renderMonthPositionMatrix = renderV237; } catch (_) {}

  function baseRowsForMonth(key){
    if (state.monthPositionDraft?.monthKey === key && Array.isArray(state.monthPositionDraft.rows)) return copyRows(state.monthPositionDraft.rows);
    const saved = copyRows((state.positions || []).filter(r => normDate(r?.work_date).startsWith(key)));
    if (saved.length) return saved;
    try { return copyRows(buildMonthlyPositionDraft(key)?.rows || []); } catch (_) { return []; }
  }
  function mergeVisibleSelections(rows, key, skipEncoded){
    const selects = Array.from(document.querySelectorAll('[data-month-position-edit]'));
    if (!selects.length) return copyRows(rows || []);
    let next = copyRows(rows || []);
    selects.forEach(sel => {
      const encoded = String(sel.dataset.monthPositionEdit || '');
      if (skipEncoded && encoded === skipEncoded) return;
      const [dateRaw, staffRaw] = encoded.split('|');
      const d = normDate(dateRaw);
      const sid = String(staffRaw || '').trim();
      if (!d || !sid || !sameMonth(d, key)) return;
      next = next.filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === sid));
      const code = String(sel.value || '').trim();
      if (code) next.push(makeRow(d, sid, code));
    });
    return next;
  }
  function rowForStaffDate(rows, date, staffId){
    const d = normDate(date);
    const sid = String(staffId || '');
    return (rows || []).find(r => normDate(r?.work_date) === d && String(r?.staff_id || '') === sid && codeOf(r) && codeOf(r) !== 'รอตรวจสอบ') || null;
  }
  function ownerOfCode(rows, date, code, excludeStaffId){
    const d = normDate(date);
    const c = String(code || '').trim();
    const exclude = String(excludeStaffId || '');
    if (!c) return null;
    return (rows || []).find(r => normDate(r?.work_date) === d && String(r?.staff_id || '') !== exclude && codeOf(r) === c) || null;
  }
  function upsertCell(rows, date, staffId, code){
    const d = normDate(date);
    const sid = String(staffId || '');
    const c = String(code || '').trim();
    let next = (rows || []).filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === sid));
    if (c) next.push(makeRow(d, sid, c));
    return next;
  }
  function rerenderPreserve(){
    const fn = () => { try { renderPage(); } catch (_) {} };
    try { if (typeof withPreservedTableScrollV168 === 'function') return withPreservedTableScrollV168(fn); } catch (_) {}
    try {
      const wrap = document.querySelector('.month-position-matrix');
      const left = wrap?.scrollLeft || 0;
      const top = wrap?.scrollTop || 0;
      fn();
      setTimeout(() => { const w = document.querySelector('.month-position-matrix'); if (w) { w.scrollLeft = left; w.scrollTop = top; } highlightSwaps(); }, 0);
    } catch (_) { fn(); }
  }
  function highlightSwaps(){
    try {
      const set = state.weeklySwappedPositionCellsV237;
      if (!set || !set.size) return;
      document.querySelectorAll('[data-month-position-edit]').forEach(sel => {
        const [dateRaw, staffRaw] = String(sel.dataset.monthPositionEdit || '').split('|');
        const key = `${String(staffRaw || '')}|${normDate(dateRaw)}`;
        if (set.has(key)) sel.closest('td')?.classList.add('week-swap-cell-v237');
      });
    } catch (_) {}
  }

  const previousApply = window.applyMonthPositionEdit || (typeof applyMonthPositionEdit === 'function' ? applyMonthPositionEdit : null);
  function applyMonthPositionEditV237(value, encoded){
    if (!isAdminSafe()) return;
    const [sourceDateRaw, staffIdRaw] = String(encoded || '').split('|');
    const sourceDate = normDate(sourceDateRaw);
    const staffId = String(staffIdRaw || '').trim();
    const selectedCode = String(value || '').trim();
    if (!sourceDate || !staffId) return;
    const key = sourceDate.slice(0, 7);
    let rows = mergeVisibleSelections(baseRowsForMonth(key), key, `${sourceDate}|${staffId}`);
    const prevCode = String(prevValueByCell.get(`${sourceDate}|${staffId}`) || '').trim();
    const targets = mondayToFriday(sourceDate);
    const changedCells = new Set();
    let changed = 0;
    let swapped = 0;
    let skipped = 0;

    targets.forEach(d => {
      if (isFullWeekLeave(staffId, d)) { skipped += 1; return; }
      if (selectedCode && !codeAllowedOnDate(d, selectedCode)) { skipped += 1; return; }
      const oldRow = rowForStaffDate(rows, d, staffId);
      let oldCode = codeOf(oldRow);
      if (d === sourceDate && !oldCode) oldCode = prevCode;
      if (oldCode && !codeAllowedOnDate(d, oldCode)) oldCode = '';
      const owner = ownerOfCode(rows, d, selectedCode, staffId);
      if (!selectedCode && !oldCode) return;
      rows = upsertCell(rows, d, staffId, selectedCode);
      changedCells.add(`${staffId}|${d}`);
      if (owner && String(owner.staff_id || '') !== staffId) {
        rows = upsertCell(rows, d, owner.staff_id, oldCode);
        changedCells.add(`${String(owner.staff_id || '')}|${d}`);
        swapped += 1;
      }
      changed += 1;
    });

    state.monthPositionDraft = { monthKey:key, rows };
    state.positionMonthKey = key;
    state.weeklySwappedPositionCellsV237 = changedCells;
    rerenderPreserve();
    setTimeout(highlightSwaps, 40);
    if (!changed) return toast('ยังไม่ได้เปลี่ยนตำแหน่ง: วันในสัปดาห์นี้อาจเป็นวันหยุด/ตำแหน่งไม่อยู่ในชุด Slot ของวันนั้น', 'error');
    const sourceStaff = (() => { try { return state.staff.find(s => String(s.id) === staffId)?.nickname || ''; } catch (_) { return ''; } })();
    toast(`สลับตำแหน่งทั้งสัปดาห์แล้ว${sourceStaff ? ` (${sourceStaff})` : ''}: เปลี่ยน ${changed} วัน${swapped ? ` • สลับคู่ ${swapped} ช่อง` : ''}${skipped ? ` • ข้าม ${skipped} วัน` : ''} — ตรวจทานแล้วกดบันทึกแผนทั้งเดือน`);
  }
  window.applyMonthPositionEdit = applyMonthPositionEditV237;
  try { applyMonthPositionEdit = applyMonthPositionEditV237; } catch (_) {}

  document.addEventListener('focusin', function(e){
    const sel = e.target?.closest?.('[data-month-position-edit]');
    if (!sel) return;
    prevValueByCell.set(String(sel.dataset.monthPositionEdit || ''), String(sel.value || ''));
  }, true);
  document.addEventListener('mousedown', function(e){
    const sel = e.target?.closest?.('[data-month-position-edit]');
    if (!sel) return;
    prevValueByCell.set(String(sel.dataset.monthPositionEdit || ''), String(sel.value || ''));
  }, true);

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV237(){
      const out = previousRenderPage.apply(this, arguments);
      setTimeout(highlightSwaps, 20);
      return out;
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .v237-position-matrix .count-role-cell b{white-space:nowrap;font-size:12px}
    .v237-position-matrix .count-role-cell small{display:none!important}
    .v237-position-matrix .missing-role-cell.complete{font-weight:800;color:#166534;background:#f0fdf4!important}
    .v237-position-matrix .missing-role-cell.has-missing small{display:block;max-width:94px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}
    .v237-position-matrix .full-week-leave-cell{background:#fff1f2!important;border-color:#fecdd3!important;text-align:center;min-width:110px}
    .v237-full-week-leave-pill{display:inline-flex;align-items:center;justify-content:center;min-width:76px;padding:5px 10px;border-radius:999px;background:#ffe4e6;color:#9f1239;font-weight:800;font-size:12px;line-height:1.1}
    .v237-position-matrix .week-swap-cell-v237{outline:2px solid #60a5fa;outline-offset:-2px;background:#eff6ff!important}
    .v237-position-matrix .matrix-legend .hint{margin-left:8px;color:#64748b;font-size:12px}
  `;
  document.head.appendChild(style);

  window.cnmiV237 = { renderMonthPositionMatrixV237: renderV237, applyMonthPositionEditV237 };
  console.info(`${VERSION} loaded`);
})();
