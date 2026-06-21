/* =========================
   V233 Full-week leave = no monthly position
   - If staff has leave covering every working day in that week, the monthly matrix shows only leave cells.
   - Full-week leave staff are removed from generated monthly position rows even if older saved rows still exist.
   - Single-day / partial-week leave keeps the weekly position and shows a leave marker as before.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V233_FULL_WEEK_LEAVE_NO_POSITION';
  if (window.__CNMI_V233_FULL_WEEK_LEAVE_NO_POSITION__) return;
  window.__CNMI_V233_FULL_WEEK_LEAVE_NO_POSITION__ = true;

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function monthNow(){
    try { return monthKey(new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 7); }
  }
  function parseDateSafe(v){
    try { return parseDate(v); }
    catch (_) { return new Date(String(v).slice(0,10) + 'T00:00:00'); }
  }
  function isNoPositionDaySafe(date){
    try { return isNoPositionDay(date); }
    catch (_) {
      try { return isWeekend(date) || isHolidayDate(date); }
      catch (__) { return false; }
    }
  }
  function hasOutingSafe(date){
    try { return hasOuting(date); } catch (_) { return false; }
  }
  function leaveText(row){
    try { return leaveDisplayType(row); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || 'ลา').split(':::')[0].trim(); }
  }
  function leaveClass(row){
    try { return leaveCellClass(leaveText(row)); } catch (_) { return 'leave-other'; }
  }
  function leaveEffective(row){
    try { return isLeaveEffective(row); }
    catch (_) {
      const stRaw = String(row?.status || row?.approval_status || 'active').trim();
      const st = stRaw.toLowerCase();
      if (['cancelled','canceled','deleted','inactive','void','rejected'].includes(st)) return false;
      if (['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(stRaw)) return false;
      return true;
    }
  }
  function dateInLeave(row, date){
    const d = normDate(date);
    try { return overlapsDate(row, d); }
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
    return (state.leaves || []).find(l => String(l?.staff_id || '') === sid && leaveEffective(l) && dateInLeave(l, d)) || null;
  }
  function monthDates(key){
    const k = String(key || monthNow()).slice(0, 7);
    try {
      const r = getMonthRange(k);
      const last = r.last || new Date(r.y, r.m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${r.y}-${pad(r.m)}-${pad(i + 1)}`);
    } catch (_) {
      const [y, m] = k.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${y}-${String(m).padStart(2,'0')}-${String(i + 1).padStart(2,'0')}`);
    }
  }
  function workDatesForMonth(key){ return monthDates(key).filter(d => !isNoPositionDaySafe(d)); }
  function weekKey(date){
    try { return weekKeyOf(date); }
    catch (_) {
      const d = parseDateSafe(date);
      const day = d.getDay() || 7;
      const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
      return mon.toISOString().slice(0,10);
    }
  }
  function weekWorkMap(key){
    const map = new Map();
    workDatesForMonth(key).forEach(d => {
      const wk = weekKey(d);
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(d);
    });
    return map;
  }
  function weekDatesForDate(date){
    const d = normDate(date);
    const key = d.slice(0, 7);
    return weekWorkMap(key).get(weekKey(d)) || [];
  }
  function fullWeekLeaveInfo(staffId, dateOrWeekDates){
    const dates = Array.isArray(dateOrWeekDates) ? dateOrWeekDates : weekDatesForDate(dateOrWeekDates);
    const workDates = (dates || []).filter(d => !isNoPositionDaySafe(d));
    if (!staffId || !workDates.length) return null;
    const rows = workDates.map(d => activeLeaveRow(staffId, d));
    if (!rows.every(Boolean)) return null;
    const labels = Array.from(new Set(rows.map(leaveText).filter(Boolean)));
    return { rows, label: labels.length ? labels.join(' / ') : 'ลา', dates: workDates };
  }
  function isFullWeekLeave(staffId, dateOrWeekDates){ return !!fullWeekLeaveInfo(staffId, dateOrWeekDates); }
  function positionEnabledStaff(){
    return (state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s); }
      catch (_) { return !!s?.id && s?.is_active !== false && s?.active !== false; }
    });
  }
  function fullWeekLeaveCount(date){
    const weekDates = weekDatesForDate(date);
    return positionEnabledStaff().filter(s => isFullWeekLeave(s.id, weekDates)).length;
  }
  function weeklyAvailableStaff(date){
    const weekDates = weekDatesForDate(date);
    const list = positionEnabledStaff().filter(s => !isFullWeekLeave(s.id, weekDates));
    try { return orderedStaff(list); } catch (_) { return list; }
  }
  function expectedTemplates(date){
    const d = normDate(date);
    if (!d || isNoPositionDaySafe(d)) return [];
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
  function positionBase(code){
    try { return positionBaseCode(code); } catch (_) { return String(code || '').trim(); }
  }
  function canEditMonth(){
    try { return isAdmin() && state.page === 'positionMonth'; } catch (_) { return false; }
  }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function staffColorSafe(st){
    try { return staffColor(st); } catch (_) { return '#e0f2fe'; }
  }
  function textColorSafe(bg){
    try { return textColorFor(bg); } catch (_) { return '#0f172a'; }
  }
  function staffOrder(list){
    try { return orderedStaff(list); } catch (_) { return list; }
  }
  function monthPositionOptions(date, current){
    try { return monthPositionRoleOptionsForDate(date, current); }
    catch (_) { return expectedTemplates(date); }
  }
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

  const oldBuildMonthlyPositionDraft = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
  if (oldBuildMonthlyPositionDraft) {
    const buildV233 = function buildMonthlyPositionDraftV233(key){
      const draft = oldBuildMonthlyPositionDraft.apply(this, arguments) || { monthKey:String(key || state.positionMonthKey || state.monthKey || monthNow()).slice(0,7), rows:[] };
      const rows = Array.isArray(draft.rows) ? draft.rows : [];
      draft.rows = rows.filter(r => {
        const d = normDate(r?.work_date);
        const sid = String(r?.staff_id || '');
        if (!d || !sid) return false;
        return !isFullWeekLeave(sid, d);
      });
      draft.autoPlanV233 = true;
      return draft;
    };
    window.buildMonthlyPositionDraft = buildV233;
    try { buildMonthlyPositionDraft = buildV233; } catch (_) {}
  }

  function renderCountCell(date, assignedStaffByDate){
    const d = normDate(date);
    if (isNoPositionDaySafe(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const available = weeklyAvailableStaff(d).length;
    const slots = expectedTemplates(d).length;
    const assigned = assignedStaffByDate.get(d)?.size || 0;
    const fullOut = fullWeekLeaveCount(d);
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    const target = Math.min(available || slots, slots || available);
    const tone = assigned >= target ? 'complete' : 'has-missing';
    const title = fullOut ? `Slot หลัก ${base} คน และมีคนลาทั้งสัปดาห์ ${fullOut} คน ระบบจะไม่จัดตำแหน่งให้คนลาทั้งสัปดาห์` : `Slot หลัก ${base} คน`;
    return `<th class="count-role-cell ${tone}" title="${esc(title)}"><b>${esc(available)}/${esc(slots)}</b><br><small>คน/Slot • ฐาน ${esc(base)}${fullOut ? ` • ลาทั้งสัปดาห์ ${esc(fullOut)}` : ''}</small></th>`;
  }
  function renderMissingCell(date, assignedByDate){
    const d = normDate(date);
    if (isNoPositionDaySafe(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const assigned = assignedByDate.get(d) || new Set();
    const expected = expectedTemplates(d);
    const missing = expected.filter(p => !assigned.has(String(p?.code || p?.position_code || '').trim()));
    if (!missing.length) return `<th class="missing-role-cell complete">ครบ<br><small>${esc(expected.length)} ตำแหน่ง</small></th>`;
    return `<th class="missing-role-cell has-missing"><b>${esc(missing.length)}</b><br><small>${missing.map(p => esc(p?.code || p?.position_code || '')).join(', ')}</small></th>`;
  }
  function renderMonthCell(staff, date, cellRows, canEdit, leaves){
    const d = normDate(date);
    if (isNoPositionDaySafe(d)) return `<td class="matrix-cell no-position-day"><span>${isHolidayDate(d) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
    const sid = String(staff?.id || '');
    const fullLeave = fullWeekLeaveInfo(sid, d);
    const leaveRow = leaves.get(`${sid}|${d}`) || activeLeaveRow(sid, d) || null;
    const hasLeave = !!leaveRow;
    const leaveLabel = fullLeave?.label || (leaveRow ? leaveText(leaveRow) : '');
    const fullLeaveClass = fullLeave ? `full-week-leave-cell ${leaveClass(leaveRow || fullLeave.rows?.[0])}` : '';
    if (fullLeave) {
      return `<td class="matrix-cell leave-cell ${fullLeaveClass}" title="${esc('ลาทั้งสัปดาห์: ' + leaveLabel)}"><span class="v233-full-week-leave-pill">${esc(leaveLabel || 'ลา')}</span><small class="leave-note-v233">ลาทั้งสัปดาห์ • ไม่จัดตำแหน่ง</small></td>`;
    }
    const row = (cellRows || [])[0] || null;
    const cleanCodes = (cellRows || []).map(r => String(r?.position_code || r?.code || '').trim()).filter(Boolean).filter(c => c !== 'รอตรวจสอบ');
    const cls = `${hasOutingSafe(d) ? 'outing-cell' : ''} ${hasLeave ? 'leave-cell ' + leaveClass(leaveRow) : ''} ${!cleanCodes.length && !hasLeave ? 'needs-review-cell' : ''}`.trim();
    const leaveMark = hasLeave ? `<small class="leave-note-v228">${esc(leaveLabel)}</small>` : '';
    if (canEdit) {
      const current = row?.position_code || '';
      const options = monthPositionOptions(d, current);
      return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(d)}|${esc(sid)}"><option value="">${hasLeave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${options.map(t => `<option value="${esc(t.code)}" ${current===t.code?'selected':''}>${esc(t.code)}</option>`).join('')}</select>${leaveMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    }
    // Avoid rendering the leave type twice when no position is assigned.
    const text = cleanCodes.length ? cleanCodes.join(' / ') : '';
    const safeText = esc(text);
    return `<td class="matrix-cell ${cls}">${safeText ? `<span title="${safeText}${hasLeave && cleanCodes.length ? ' • ' + esc(leaveLabel) : ''}">${safeText}</span>` : ''}${leaveMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
  }

  const renderV233 = function renderMonthPositionMatrixV233(rows, dates){
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
      if (isFullWeekLeave(sid, d)) return; // stale saved positions must not appear/count during full-week leave
      const row = { ...r, zone:(r.zone || ''), _idx:idx };
      (byCell[`${sid}|${d}`] ||= []).push(row);
      const code = String(r?.position_code || r?.code || '').trim();
      if (code && code !== 'รอตรวจสอบ') {
        if (!assignedByDate.has(d)) assignedByDate.set(d, new Set());
        assignedByDate.get(d).add(positionBase(code));
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
      const d = parseDateSafe(date);
      const cls = (() => { try { return isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; } catch (_) { return ''; } })();
      return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('');
    const countRow = dates.map(date => renderCountCell(date, assignedStaffByDate)).join('');
    const missing = dates.map(date => renderMissingCell(date, assignedByDate)).join('');
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    return `<div class="monthly-matrix-wrap v182-position-matrix v218-position-matrix v228-position-matrix v231-position-matrix v233-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="legend-box leave"></span> Slot หลัก ${esc(base)} คน • คนลาเฉพาะบางวันยังคงตำแหน่งประจำสัปดาห์ / คนลาทั้งสัปดาห์จะแสดงเฉพาะลาและไม่ถูกจัดตำแหน่ง ${canEdit ? '<span class="hint">ถ้ามีข้อมูลเก่าค้าง ให้กดบันทึก/ประกาศอีกครั้ง ระบบจะลบตำแหน่งของคนลาทั้งสัปดาห์ออกให้</span>' : ''}</div><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countRow}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missing}</tr></thead><tbody>${displayStaff.map(st => { const bg = staffColorSafe(st); const fg = textColorSafe(bg); return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(st.nickname || st.full_name || '-')}</b><small>${esc(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell(st, date, byCell[`${st.id}|${date}`] || [], canEdit, leaves)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };
  window.renderMonthPositionMatrix = renderV233;
  try { renderMonthPositionMatrix = renderV233; } catch (_) {}

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage) {
    const renderPageV233 = function(){
      const out = oldRenderPage.apply(this, arguments);
      setTimeout(() => {
        try {
          if (state?.page === 'positionMonth' && document.querySelector('.v231-position-matrix:not(.v233-position-matrix)') && typeof window.renderPositionMonthPage === 'function') {
            const content = document.getElementById('pageContent');
            if (content) content.innerHTML = window.renderPositionMonthPage();
          }
        } catch (_) {}
      }, 0);
      return out;
    };
    window.renderPage = renderPageV233;
    try { renderPage = renderPageV233; } catch (_) {}
  }

  const style = document.createElement('style');
  style.textContent = `
    .v233-position-matrix .full-week-leave-cell{background:#fff1f2!important;border-color:#fecdd3!important;text-align:center;min-width:120px}
    .v233-full-week-leave-pill{display:inline-flex;align-items:center;justify-content:center;min-width:78px;padding:5px 10px;border-radius:999px;background:#ffe4e6;color:#9f1239;font-weight:700;font-size:12px;line-height:1.1}
    .v233-position-matrix .leave-note-v233{display:block;margin-top:4px;font-size:10px;line-height:1.15;color:#9f1239;white-space:normal}
    .v233-position-matrix .matrix-legend .hint{margin-left:8px;color:#64748b;font-size:12px}
  `;
  document.head.appendChild(style);

  window.cnmiV233 = { isFullWeekLeave, fullWeekLeaveInfo, weeklyAvailableStaff, fullWeekLeaveCount };
  console.info(`${VERSION} loaded`);
})();
