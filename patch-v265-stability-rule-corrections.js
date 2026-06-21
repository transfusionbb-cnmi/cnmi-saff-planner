/* =========================
   V265 Stability Rule Corrections
   - Personal position permissions are saved per person and verified from Supabase.
   - Outing Slot/headcount uses staff actually available that day, while "ไม่รับเวร" remains a normal working-day staff member.
   - Daily position save/publish is forced back into the monthly source immediately.
   - Only ชบด1/ชบด2/ชบด3 are consecutive-day restricted.
   - Balance reset is reflected in the grouped monthly balance and the detail columns are expanded.
   - Nonessential description text is hidden without hiding warnings or validation messages.
   ========================= */
(function(){
  'use strict';

  const VERSION = 'V265_STABILITY_RULE_CORRECTIONS';
  if (window.__CNMI_V265_STABILITY_RULE_CORRECTIONS__) return;
  window.__CNMI_V265_STABILITY_RULE_CORRECTIONS__ = true;

  const PERMISSION_CACHE_KEY = 'cnmi_v259_position_permission_backup_v1';
  const DAILY_OVERRIDE_KEY = '__v265DailyPositionOverrides';
  const RESTRICTED_DUTIES = new Set(['ชบด1','ชบด2','ชบด3']);
  let permissionSaveInFlight = false;
  let dailySyncInFlight = false;

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function client(){
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (_) {}
    return window.supabaseClient || window.sbClient || window.sb || null;
  }
  function assignGlobal(name, value){
    try { window[name] = value; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function bool(value){ return value === true || String(value).toLowerCase() === 'true'; }
  function num(value, fallback=0){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function clone(value){
    try { return structuredClone(value); }
    catch (_) { try { return JSON.parse(JSON.stringify(value)); } catch (__) { return value; } }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function busy(active, message){ try { setBusy(!!active, message || ''); } catch (_) {} }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function ordered(list){
    try { return orderedStaff(list || []); }
    catch (_) { return (list || []).slice(); }
  }
  function currentUser(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function baseCode(value){
    try { return String(positionBaseCode(value) || '').trim(); }
    catch (_) { return String(value || '').replace(/\s+#\d+$/, '').trim(); }
  }
  function hasOutingSafe(date){
    try { return !!hasOuting(normDate(date)); }
    catch (_) { return false; }
  }
  function isNoPositionDaySafe(date){
    try { return !!isNoPositionDay(normDate(date)); }
    catch (_) {
      try { return !!(isWeekend(normDate(date)) || isHolidayDate(normDate(date))); }
      catch (__) { return false; }
    }
  }
  function parseSafe(date){
    try { return parseDate(date); }
    catch (_) { return new Date(normDate(date) + 'T00:00:00'); }
  }

  /* ------------------------------------------------------------------
     1) Consecutive-duty rule: only ชบด1/2/3 are restricted.
     ------------------------------------------------------------------ */
  function isConsecutiveRestrictedDutyV265(code){
    return RESTRICTED_DUTIES.has(String(code || '').trim());
  }
  function restrictedDutyOnDate(staffId, date, assignments, excludeSlot){
    const sid = String(staffId || '');
    const d = normDate(date);
    const excluded = excludeSlot ? String(excludeSlot.id || excludeSlot._temp_id || '') : '';
    const match = row => {
      if (!row || String(row.staff_id || '') !== sid || normDate(row.duty_date) !== d) return false;
      if (!isConsecutiveRestrictedDutyV265(row.duty_code)) return false;
      return !excluded || String(row.id || row._temp_id || '') !== excluded;
    };
    const st = appState();
    return (Array.isArray(assignments) ? assignments : []).some(match)
      || (Array.isArray(st?.rosterAssignments) ? st.rosterAssignments : []).some(match);
  }
  function hasAdjacentDutyV265(staffId, date, assignments=[], excludeSlot=null){
    // ช4, ช3A, ช3B, ช9 are allowed next to ชบด. Only a target ชบด is checked.
    if (excludeSlot && !isConsecutiveRestrictedDutyV265(excludeSlot.duty_code)) return false;
    const d = parseSafe(date);
    const before = new Date(d); before.setDate(d.getDate() - 1);
    const after = new Date(d); after.setDate(d.getDate() + 1);
    const toKey = value => {
      try { return toDateInput(value); }
      catch (_) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    };
    return restrictedDutyOnDate(staffId, toKey(before), assignments, excludeSlot)
      || restrictedDutyOnDate(staffId, toKey(after), assignments, excludeSlot);
  }
  assignGlobal('isConsecutiveRestrictedDuty', isConsecutiveRestrictedDutyV265);
  assignGlobal('hasAdjacentDuty', hasAdjacentDutyV265);

  /* ------------------------------------------------------------------
     2) Actual available staff and outing Slot count.
     ------------------------------------------------------------------ */
  function leaveType(row){
    try { return String(leaveDisplayType(row) || '').trim(); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || '').split(':::')[0].trim(); }
  }
  function leaveEffective(row){
    try { return typeof isLeaveEffective === 'function' ? !!isLeaveEffective(row) : true; }
    catch (_) {
      const raw = String(row?.status || row?.approval_status || '').trim();
      const lower = raw.toLowerCase();
      return !['cancelled','canceled','deleted','inactive','void','rejected','ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(lower)
        && !['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw);
    }
  }
  function leaveOverlaps(row, date){
    const d = normDate(date);
    try { return !!overlapsDate(row, d); }
    catch (_) {
      const start = normDate(row?.start_date || row?.date || row?.work_date);
      const end = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!start && !!end && start <= d && end >= d;
    }
  }
  function isNoDutyRequest(row){
    try { if (typeof isNoDutyLeaveType === 'function') return !!isNoDutyLeaveType(row); }
    catch (_) {}
    const type = leaveType(row).replace(/\s+/g, ' ').trim().toLowerCase();
    return type === 'ไม่รับเวร'
      || type === 'no duty'
      || type === 'no-duty'
      || type === 'noduty'
      || type === 'no_duty';
  }
  function unavailableRecord(staffId, date){
    const st = appState();
    const sid = String(staffId || '');
    const d = normDate(date);
    if (!st || !sid || !d) return null;
    return (Array.isArray(st.leaves) ? st.leaves : []).find(row =>
      String(row?.staff_id || '') === sid
      && leaveEffective(row)
      && leaveOverlaps(row, d)
      && !isNoDutyRequest(row)
    ) || null;
  }
  function positionStaffEnabled(person){
    if (!person?.id) return false;
    const statusText = `${person.status || ''} ${person.position_training_status || ''} ${person.employment_status || ''}`.toLowerCase();
    if (/ลาออก|resigned|terminated|inactive|ยุติ/.test(statusText)) return false;
    try { return !!isDailyPositionEnabled(person); }
    catch (_) {
      return person.is_active !== false && person.active !== false && person.staff_type !== 'แพทย์' && !person.maternity_status;
    }
  }
  function actualAvailableStaff(date){
    const st = appState();
    const d = normDate(date);
    return ordered((st?.staff || []).filter(person => positionStaffEnabled(person) && !unavailableRecord(person.id, d) && !window.cnmiV271?.excludeFromDaySlot?.(person, d)));
  }
  // Slot size is a weekly rule: a one-day leave keeps the weekly Slot base,
  // while real leave covering every working day of the week reduces it.
  // "ไม่รับเวร" is excluded by unavailableRecord(), so it never reduces daytime Slots.
  function weekWorkingDatesV265(date){
    const d = parseSafe(date);
    if (Number.isNaN(d.getTime())) return [];
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    const dates = [];
    for (let i=0; i<7; i++) {
      const current = new Date(monday);
      current.setDate(monday.getDate() + i);
      const key = (() => {
        try { return toDateInput(current); }
        catch (_) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const dayNo = String(current.getDate()).padStart(2, '0');
          return `${y}-${m}-${dayNo}`;
        }
      })();
      if (!isNoPositionDaySafe(key)) dates.push(key);
    }
    return dates;
  }
  function hasFullWeekRealLeaveV265(person, date){
    if (!person?.id) return false;
    const dates = weekWorkingDatesV265(date);
    return dates.length > 0 && dates.every(workDate => !!unavailableRecord(person.id, workDate));
  }
  function weeklySlotStaffV265(date){
    const st = appState();
    return ordered((st?.staff || []).filter(person =>
      positionStaffEnabled(person)
      && !hasFullWeekRealLeaveV265(person, date)
      && !window.cnmiV271?.excludeFromDaySlot?.(person, normDate(date))
    ));
  }
  function weeklySlotHeadcountV265(date){ return weeklySlotStaffV265(date).length; }
  function outingBucket(count){
    const n = Math.max(0, Number(count || 0));
    if (n <= 12) return 12;
    if (n === 13) return 13;
    return 14;
  }
  function slotConfig(){
    const st = appState();
    try { return window.cnmiV224?.currentConfigs?.() || st?.slotTemplateV224?.configs || null; }
    catch (_) { return st?.slotTemplateV224?.configs || null; }
  }
  function outingSlotsForCount(count){
    const bucket = outingBucket(count);
    try {
      const rows = window.cnmiDayPositionSlotsV218?.outingSlotsV232?.(bucket);
      if (Array.isArray(rows) && rows.length) return clone(rows).slice(0, bucket);
    } catch (_) {}
    const cfg = slotConfig();
    const rows = cfg?.outing_by_count?.[bucket] || cfg?.outing_by_count?.[String(bucket)] || cfg?.outing || [];
    return Array.isArray(rows) ? clone(rows).slice(0, bucket) : [];
  }
  const previousExpectedTemplates231 = window.cnmiV231?.expectedTemplatesForDate231 || null;
  function expectedTemplatesV265(date){
    const d = normDate(date);
    if (!d || isNoPositionDaySafe(d)) return [];
    if (hasOutingSafe(d)) return outingSlotsForCount(weeklySlotHeadcountV265(d));
    try {
      const rows = previousExpectedTemplates231 ? previousExpectedTemplates231(d) : null;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
    try {
      const rows = monthPositionRoleOptionsForDate(d, '');
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
    return [];
  }
  if (window.cnmiV231) {
    window.cnmiV231.weekSlotCount231 = function weekSlotCountV265(date){ return outingBucket(weeklySlotHeadcountV265(date)); };
    window.cnmiV231.expectedTemplatesForDate231 = expectedTemplatesV265;
  }

  function participantIds(date){
    try { return new Set((outingParticipants(normDate(date)) || []).map(String)); }
    catch (_) { return new Set(); }
  }
  function templateZone(template){
    const value = String(template?.zone || '').trim();
    if (/ออกหน่วย/.test(value)) return 'ออกหน่วย';
    return value || 'Blood Bank';
  }
  function positionAllowed(person, template, date){
    if (!person || !template) return false;
    const code = String(template.eligibility_code || template.code || template.position_code || '').trim();
    try {
      if (!positionRuleOk(person, template.main_rule || '')) return false;
    } catch (_) {}
    try {
      if (code && !positionEligible(person, code)) return false;
    } catch (_) {}
    try {
      if (typeof positionCandidateOk === 'function' && !positionCandidateOk(person, template, date)) return false;
    } catch (_) {}
    return true;
  }
  function makePositionRow(person, date, template){
    const code = String(template?.code || template?.position_code || '').trim();
    return {
      work_date:normDate(date),
      position_code:code,
      zone:templateZone(template),
      break_time:template?.break_time || '-',
      main_rule:template?.main_rule || '',
      job_desc:template?.job_desc || '',
      staff_id:person?.id || null,
      updated_by:currentUser()
    };
  }
  function rebuildOutingDateRows(date, oldRows){
    const d = normDate(date);
    const available = actualAvailableStaff(d);
    const availableIds = new Set(available.map(person => String(person.id)));
    const participants = participantIds(d);
    const templates = outingSlotsForCount(weeklySlotHeadcountV265(d));
    const existingByCode = new Map();
    (oldRows || []).forEach(row => {
      const code = baseCode(row?.position_code || row?.code);
      if (code && !existingByCode.has(code)) existingByCode.set(code, row);
    });
    const used = new Set();
    const result = [];
    templates.forEach(template => {
      const code = baseCode(template?.code || template?.position_code);
      const old = existingByCode.get(code);
      let chosen = old && availableIds.has(String(old.staff_id || ''))
        ? available.find(person => String(person.id) === String(old.staff_id))
        : null;
      const zone = templateZone(template);
      const pool = available.filter(person => {
        const sid = String(person.id);
        if (used.has(sid)) return false;
        const belongs = participants.has(sid);
        if (zone === 'ออกหน่วย' && !belongs) return false;
        if (zone !== 'ออกหน่วย' && belongs) return false;
        return positionAllowed(person, template, d);
      });
      if (chosen) {
        const sid = String(chosen.id);
        const belongs = participants.has(sid);
        if (used.has(sid) || (zone === 'ออกหน่วย' && !belongs) || (zone !== 'ออกหน่วย' && belongs) || !positionAllowed(chosen, template, d)) chosen = null;
      }
      if (!chosen) chosen = pool[0] || null;
      if (!chosen) {
        // Keep the Slot visible as missing; do not pull an absent or ineligible person back into the plan.
        return;
      }
      used.add(String(chosen.id));
      result.push({ ...(old || {}), ...makePositionRow(chosen, d, template) });
    });
    return result;
  }
  function postProcessMonthlyDraft(draft, key){
    const st = appState();
    const month = String(key || draft?.monthKey || st?.positionMonthKey || st?.monthKey || '').slice(0, 7);
    if (!draft || !Array.isArray(draft.rows) || !/^\d{4}-\d{2}$/.test(month)) return draft;
    const rows = draft.rows.slice();
    const outingDates = Array.from(new Set(rows.map(row => normDate(row?.work_date)).filter(date => date.startsWith(month) && hasOutingSafe(date))));
    // Include outing dates even when the old generator produced no row for them.
    try {
      const [year, monthNo] = month.split('-').map(Number);
      const last = new Date(year, monthNo, 0).getDate();
      for (let day=1; day<=last; day++) {
        const date = `${month}-${String(day).padStart(2,'0')}`;
        if (hasOutingSafe(date) && !outingDates.includes(date)) outingDates.push(date);
      }
    } catch (_) {}
    let next = rows.filter(row => !outingDates.includes(normDate(row?.work_date)));
    outingDates.sort().forEach(date => {
      const old = rows.filter(row => normDate(row?.work_date) === date);
      next = next.concat(rebuildOutingDateRows(date, old));
    });
    draft.rows = next;
    draft.outingActualHeadcountV265 = true;
    return draft;
  }
  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v265ActualOutingCount) {
      const wrappedBuild = function buildMonthlyPositionDraftV265(key){
        return postProcessMonthlyDraft(previousBuild.apply(this, arguments), key);
      };
      wrappedBuild.__v265ActualOutingCount = true;
      assignGlobal('buildMonthlyPositionDraft', wrappedBuild);
    }
  } catch (error) { console.warn(`${VERSION}: monthly draft wrapper skipped`, error); }

  /* Render monthly matrix with the actual available count for each outing day. */
  function activeLeaveRow(staffId, date){ return unavailableRecord(staffId, date); }
  function leaveLabel(row){ return leaveType(row) || 'ลา'; }
  function leaveClassSafe(row){
    try { return leaveCellClass(leaveLabel(row)); }
    catch (_) { return 'leave-other'; }
  }
  function staffColorSafe(person){ try { return staffColor(person); } catch (_) { return '#dbeafe'; } }
  function textColorSafe(color){ try { return textColorFor(color); } catch (_) { return '#0f172a'; } }
  function canEditMonth(){
    try { return isAdmin() && appState()?.page === 'positionMonth'; }
    catch (_) { return appState()?.profile?.role === 'admin' && appState()?.page === 'positionMonth'; }
  }
  function monthOptions(date, current){
    const expected = expectedTemplatesV265(date).slice();
    const code = String(current || '').trim();
    if (code && !expected.some(row => String(row?.code || row?.position_code || '') === code)) {
      try {
        const extra = positionTemplateByCode(code, date);
        if (extra?.code) expected.push(extra);
      } catch (_) {}
    }
    const seen = new Set();
    return expected.filter(row => {
      const c = String(row?.code || row?.position_code || '').trim();
      return c && !seen.has(c) && !!seen.add(c);
    });
  }
  function renderMonthPositionMatrixV265(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) ? dates : [];
    if (!rows.length) {
      try { return empty('ยังไม่มีแผนรายเดือน กดสร้างตารางหรือสร้างแผนก่อน'); }
      catch (_) { return '<div class="empty">ยังไม่มีแผนรายเดือน</div>'; }
    }
    const st = appState();
    const byCell = Object.create(null);
    const assignedCodes = new Map();
    const assignedStaff = new Map();
    rows.forEach((row, index) => {
      const sid = String(row?.staff_id || '');
      const date = normDate(row?.work_date);
      if (!sid || !date) return;
      const unavailable = activeLeaveRow(sid, date);
      const person = (st?.staff || []).find(item => String(item?.id || '') === sid) || null;
      if (hasOutingSafe(date) && (unavailable || !positionStaffEnabled(person))) return;
      const item = { ...row, _idx:index };
      (byCell[`${sid}|${date}`] ||= []).push(item);
      const code = String(row?.position_code || row?.code || '').trim();
      if (code && code !== 'รอตรวจสอบ') {
        if (!assignedCodes.has(date)) assignedCodes.set(date, new Set());
        assignedCodes.get(date).add(baseCode(code));
        if (!assignedStaff.has(date)) assignedStaff.set(date, new Set());
        assignedStaff.get(date).add(sid);
      }
    });
    const rowStaffIds = new Set(rows.map(row => String(row?.staff_id || '')).filter(Boolean));
    const displayStaff = ordered((st?.staff || []).filter(person => positionStaffEnabled(person) || rowStaffIds.has(String(person.id))));
    const editable = canEditMonth();
    const heads = dates.map(date => {
      const parsed = parseSafe(date);
      let cls = '';
      try { cls = isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; } catch (_) {}
      return `<th class="date-head ${cls}"><b>${parsed.getDate()}</b><br><span>${esc(parsed.toLocaleDateString('th-TH', { weekday:'short' }))}</span></th>`;
    }).join('');
    const countCells = dates.map(date => {
      if (isNoPositionDaySafe(date)) return '<th class="count-role-cell no-position-day">ไม่จัด</th>';
      const available = hasOutingSafe(date) ? actualAvailableStaff(date).length : (() => {
        try { return window.cnmiV233?.weeklyAvailableStaff?.(date)?.length || actualAvailableStaff(date).length; }
        catch (_) { return actualAvailableStaff(date).length; }
      })();
      const slots = expectedTemplatesV265(date).length;
      const assigned = assignedStaff.get(normDate(date))?.size || 0;
      const tone = assigned >= Math.min(available, slots) ? 'complete' : 'has-missing';
      return `<th class="count-role-cell ${tone}"><b>${available}/${slots}</b><br><small>คน/Slot</small></th>`;
    }).join('');
    const missingCells = dates.map(date => {
      if (isNoPositionDaySafe(date)) return '<th class="missing-role-cell no-position-day">ไม่จัด</th>';
      const assigned = assignedCodes.get(normDate(date)) || new Set();
      const missing = expectedTemplatesV265(date).filter(row => !assigned.has(baseCode(row?.code || row?.position_code)));
      if (!missing.length) return '<th class="missing-role-cell complete">ครบ</th>';
      return `<th class="missing-role-cell has-missing"><b>${missing.length}</b><br><small>${missing.map(row => esc(row?.code || row?.position_code || '')).join(', ')}</small></th>`;
    }).join('');
    const body = displayStaff.map(person => {
      const bg = staffColorSafe(person);
      const fg = textColorSafe(bg);
      const cells = dates.map(date => {
        if (isNoPositionDaySafe(date)) {
          let label = 'WEEKEND';
          try { if (isHolidayDate(date)) label = 'HOLIDAY'; } catch (_) {}
          return `<td class="matrix-cell no-position-day"><span>${label}</span></td>`;
        }
        const sid = String(person.id);
        const leave = activeLeaveRow(sid, date);
        const cellRows = byCell[`${sid}|${normDate(date)}`] || [];
        const cleanCodes = cellRows.map(row => String(row?.position_code || row?.code || '').trim()).filter(code => code && code !== 'รอตรวจสอบ');
        const current = cleanCodes[0] || '';
        const classes = `${hasOutingSafe(date) ? 'outing-cell' : ''} ${leave ? 'leave-cell ' + leaveClassSafe(leave) : ''} ${!cleanCodes.length && !leave ? 'needs-review-cell' : ''}`.trim();
        if (editable) {
          const options = monthOptions(date, current);
          return `<td class="matrix-cell ${classes}"><select class="month-position-select" data-month-position-edit="${esc(normDate(date))}|${esc(sid)}"><option value="">${leave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${options.map(row => { const code = String(row?.code || row?.position_code || ''); return `<option value="${esc(code)}" ${current === code ? 'selected' : ''}>${esc(code)}</option>`; }).join('')}</select>${leave ? `<small class="leave-note-v228">${esc(leaveLabel(leave))}</small>` : ''}</td>`;
        }
        // If there is no position, show the leave type only once in the leave note.
        // If there is a position plus partial-day leave, show position + one leave note.
        const text = cleanCodes.length ? cleanCodes.join(' / ') : '';
        return `<td class="matrix-cell ${classes}">${text ? `<span>${esc(text)}</span>` : ''}${leave ? `<small class="leave-note-v228">${esc(leaveLabel(leave))}</small>` : ''}</td>`;
      }).join('');
      return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(person.nickname || person.full_name || '-')}</b><small>${esc(person.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(person.id)}" type="button">ดูสรุป</button></td>${cells}</tr>`;
    }).join('');
    return `<div class="monthly-matrix-wrap v265-position-matrix"><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countCells}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missingCells}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  }
  assignGlobal('renderMonthPositionMatrix', renderMonthPositionMatrixV265);

  /* Daily page: feed the outing template matching the actual available count. */
  try {
    const previousDailyRender = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (previousDailyRender && !previousDailyRender.__v265ActualOutingCount) {
      const wrappedDailyRender = function renderPositionsPageV265(){
        const st = appState();
        const date = normDate(st?.positionDate || document.getElementById('positionDateInput')?.value || '');
        const cfg = slotConfig();
        const oldOuting = cfg && Array.isArray(cfg.outing) ? cfg.outing : null;
        const oldPositions = st && Array.isArray(st.positions) ? st.positions : null;
        const unavailableIds = new Set();
        try {
          if (date && hasOutingSafe(date)) {
            const available = actualAvailableStaff(date);
            const availableIds = new Set(available.map(person => String(person.id)));
            (st?.staff || []).forEach(person => { if (!availableIds.has(String(person.id))) unavailableIds.add(String(person.id)); });
            if (cfg) cfg.outing = outingSlotsForCount(weeklySlotHeadcountV265(date));
            if (st && oldPositions) {
              st.positions = oldPositions.filter(row => normDate(row?.work_date) !== date || !row?.staff_id || availableIds.has(String(row.staff_id)));
            }
          }
          let html = String(previousDailyRender.apply(this, arguments) || '');
          if (date && hasOutingSafe(date) && unavailableIds.size && typeof document !== 'undefined') {
            const template = document.createElement('template');
            template.innerHTML = html;
            template.content.querySelectorAll('select[data-position-row] option').forEach(option => {
              if (unavailableIds.has(String(option.value || ''))) option.remove();
            });
            html = template.innerHTML;
          }
          return html;
        } finally {
          if (cfg && oldOuting) cfg.outing = oldOuting;
          if (st && oldPositions) st.positions = oldPositions;
        }
      };
      wrappedDailyRender.__v265ActualOutingCount = true;
      assignGlobal('renderPositionsPage', wrappedDailyRender);
    }
  } catch (error) { console.warn(`${VERSION}: daily render wrapper skipped`, error); }

  function updateDailyCompareCards(){
    const st = appState();
    if (st?.page !== 'positions') return;
    const date = normDate(document.getElementById('positionDateInput')?.value || st.positionDate || '');
    if (!date || !hasOutingSafe(date)) return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    const available = actualAvailableStaff(date);
    const participants = participantIds(date);
    const joining = available.filter(person => participants.has(String(person.id))).length;
    const slots = outingSlotsForCount(weeklySlotHeadcountV265(date)).length;
    const cards = root.querySelectorAll('.v225-compare-cards > div');
    const diff = available.length - slots;
    cards.forEach((card, index) => {
      const strong = card.querySelector('b, strong, .metric-value');
      const label = card.querySelector('span');
      if (!strong) return;
      if (index === 0) strong.textContent = String(available.length);
      if (index === 1) strong.textContent = String(joining);
      if (index === 2) strong.textContent = String(slots);
      if (index === 3) {
        strong.textContent = diff === 0 ? 'พอดี' : (diff > 0 ? `เกิน ${diff}` : `ขาด ${Math.abs(diff)}`);
        if (label) label.textContent = 'เทียบคนที่อยู่จริงกับ Slot';
        card.classList.toggle('warn', diff < 0);
        card.classList.toggle('info', diff > 0);
        card.classList.toggle('ok', diff === 0);
      }
    });
  }

  /* ------------------------------------------------------------------
     3) Server-verified personal permissions; never overwrite another person.
     ------------------------------------------------------------------ */
  function normalizePermissionRows(rows){
    try { return window.cnmiV260?.normalizePermissionRows?.(rows) || rows || []; }
    catch (_) { return rows || []; }
  }
  function writePermissionCache(rows){
    try {
      localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify({
        version:3,
        source:'supabase-v265',
        saved_at:new Date().toISOString(),
        rows:normalizePermissionRows(rows)
      }));
    } catch (_) {}
  }
  function setPermissionBusy(active){
    document.querySelectorAll('[data-save-position-eligibility], [data-v258-enable-all]').forEach(button => {
      if (!button.dataset.v265Text) button.dataset.v265Text = button.textContent || '';
      button.disabled = !!active;
      if (active && button.hasAttribute('data-save-position-eligibility')) button.textContent = 'กำลังบันทึกและตรวจสอบ…';
      if (!active && button.dataset.v265Text) button.textContent = button.dataset.v265Text;
    });
  }
  async function savePositionEligibilityV265(){
    const st = appState();
    try { if (typeof isAdmin === 'function' && !isAdmin()) return toast('เฉพาะ Admin เท่านั้น', 'error'); }
    catch (_) { if (st?.profile?.role !== 'admin') return toast('เฉพาะ Admin เท่านั้น', 'error'); }
    if (permissionSaveInFlight) return toast('ระบบกำลังบันทึกสิทธิ์ กรุณารอสักครู่');
    const api = window.cnmiV258;
    if (!api?.visibleSnapshot || !api?.persistRows) return toast('ไม่พบระบบบันทึกสิทธิ์รายบุคคล', 'error');
    const rows = api.visibleSnapshot();
    if (!rows.length) return toast('ไม่มีข้อมูลสิทธิ์ของเจ้าหน้าที่ที่เลือก', 'error');
    const staffIds = new Set(rows.map(row => String(row.staff_id || '')).filter(Boolean));
    if (staffIds.size !== 1) return toast('หน้าจอมีข้อมูลมากกว่าหนึ่งคน ระบบหยุดเพื่อป้องกันสิทธิ์ปนกัน', 'error');
    const db = client();
    if (!db) return toast('ไม่พบ Supabase client', 'error');

    permissionSaveInFlight = true;
    setPermissionBusy(true);
    busy(true, 'กำลังบันทึกสิทธิ์เฉพาะบุคคล');
    try {
      // Every web save must write the newly selected values to Supabase first.
      // Local state/cache is updated only after the database read-back matches.
      const result = await api.persistRows(rows);
      const staffId = result.staffId || Array.from(staffIds)[0];
      // V269: bypass every old in-flight/global refresh flag and read this staff directly.
      // This is the real post-save force refresh used by the final active save function.
      let serverRows;
      if (typeof window.loadStaffPermissions === 'function') {
        serverRows = normalizePermissionRows(await window.loadStaffPermissions(staffId, { force:true, render:false, silent:true }));
      } else {
        const readback = await db.from('daily_position_eligibility').select('*').eq('staff_id', staffId);
        if (readback.error) throw readback.error;
        serverRows = normalizePermissionRows(readback.data || []);
      }
      const desired = new Map(rows.map(row => [String(row.position_code), !!row.is_eligible]));
      for (const [code, wanted] of desired) {
        const saved = serverRows.find(row => String(row.position_code) === code);
        if (!saved || bool(saved.is_eligible) !== wanted) throw new Error(`ตรวจสอบสิทธิ์ ${code} หลังบันทึกไม่ผ่าน`);
      }
      const others = (st?.positionEligibility || []).filter(row => String(row?.staff_id || '') !== String(staffId));
      if (st) {
        st.positionEligibility = normalizePermissionRows(others.concat(serverRows));
        st.positionEligibilitySourceV265 = 'supabase-force-verified-v269';
        st.positionEligibilityLoadedAtV265 = new Date().toISOString();
      }
      try { api.sessionValues?.clear?.(); } catch (_) {}
      writePermissionCache(st?.positionEligibility || serverRows);
      let removed = 0;
      try { removed = Number(await window.cnmiV255?.deleteInvalidFutureAssignments?.([staffId]) || 0); } catch (cleanupError) { console.warn(`${VERSION}: future cleanup skipped`, cleanupError); }
      try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); }
      catch (_) { try { renderPage(); } catch (__) {} }
      toast(removed > 0
        ? `บันทึกสิทธิ์รายบุคคลแล้ว และล้างตำแหน่งอนาคตที่ไม่ตรงสิทธิ์ ${removed} รายการ`
        : 'บันทึกและตรวจสอบสิทธิ์รายบุคคลกับ Supabase แล้ว');
      return true;
    } catch (error) {
      console.error(`${VERSION}: permission save failed`, error);
      toast('บันทึกสิทธิ์ไม่สำเร็จ: ' + friendly(error), 'error');
      return false;
    } finally {
      permissionSaveInFlight = false;
      setPermissionBusy(false);
      busy(false);
    }
  }
  assignGlobal('savePositionEligibility', savePositionEligibilityV265);

  /* ------------------------------------------------------------------
     4) Daily save/publish -> monthly source of truth.
     ------------------------------------------------------------------ */
  function overrideMap(){
    const st = appState();
    if (!st) return {};
    if (!st[DAILY_OVERRIDE_KEY] || typeof st[DAILY_OVERRIDE_KEY] !== 'object') st[DAILY_OVERRIDE_KEY] = {};
    return st[DAILY_OVERRIDE_KEY];
  }
  function applyDateRows(date, rows, status, remember=true){
    const st = appState();
    const d = normDate(date);
    if (!st || !d) return;
    const freshRows = (rows || []).map(row => ({ ...row }));
    st.positions = (Array.isArray(st.positions) ? st.positions : []).filter(row => normDate(row?.work_date) !== d).concat(freshRows);
    st.positionDayStatus = (Array.isArray(st.positionDayStatus) ? st.positionDayStatus : []).filter(row => normDate(row?.work_date) !== d).concat(status ? [{ ...status }] : []);
    if (st.monthPositionDraft?.monthKey === d.slice(0,7) && Array.isArray(st.monthPositionDraft.rows)) {
      st.monthPositionDraft = {
        ...st.monthPositionDraft,
        rows:st.monthPositionDraft.rows.filter(row => normDate(row?.work_date) !== d).concat(freshRows),
        dailyAuthoritativeV265:true
      };
    }
    if (remember) overrideMap()[d] = { rows:freshRows, status:status ? { ...status } : null, at:new Date().toISOString() };
  }
  function applyStoredOverrides(){
    const st = appState();
    if (!st) return;
    const map = overrideMap();
    Object.keys(map).forEach(date => {
      const savedAt = Date.parse(map[date]?.at || '') || 0;
      if (!savedAt || Date.now() - savedAt > 120000) { delete map[date]; return; }
      applyDateRows(date, map[date]?.rows || [], map[date]?.status || null, false);
    });
  }
  async function forceDailyReadback(date){
    const d = normDate(date);
    if (!d) return false;
    const api = window.cnmiV261;
    const db = client();
    if (!api?.fetchDateFromDatabase || !db) return false;
    const fresh = await api.fetchDateFromDatabase(d);
    applyDateRows(d, fresh.rows || [], fresh.status || null);
    try { await api.refreshMonthFromDatabase?.(d.slice(0,7), { render:false, silent:true }); } catch (_) {}
    // Reapply exact daily row after a month fetch, so stale draft/cache cannot win.
    applyDateRows(d, fresh.rows || [], fresh.status || null);
    return true;
  }
  function wrapDailyAction(name){
    const previous = window[name] || null;
    if (typeof previous !== 'function' || previous.__v265MonthlyAuthoritative) return;
    const wrapped = async function dailyActionV265(){
      if (dailySyncInFlight) return previous.apply(this, arguments);
      const st = appState();
      const date = normDate(document.getElementById('positionDateInput')?.value || st?.positionDate || '');
      dailySyncInFlight = true;
      try {
        const result = await previous.apply(this, arguments);
        if (result !== false && date) {
          await forceDailyReadback(date);
          try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
        }
        return result;
      } catch (error) {
        console.error(`${VERSION}: daily/month sync failed`, error);
        toast('บันทึกตำแหน่งแล้ว แต่ซิงก์หน้ารายเดือนไม่สำเร็จ: ' + friendly(error), 'error');
        return false;
      } finally { dailySyncInFlight = false; }
    };
    wrapped.__v265MonthlyAuthoritative = true;
    assignGlobal(name, wrapped);
  }
  wrapDailyAction('savePositions');
  wrapDailyAction('publishPositionsForDay');

  /* ------------------------------------------------------------------
     5) Grouped balance with reset-aware OT Balance and position detail.
     ------------------------------------------------------------------ */
  function monthKeySafe(key){ return /^\d{4}-\d{2}$/.test(String(key || '').slice(0,7)) ? String(key).slice(0,7) : new Date().toISOString().slice(0,7); }
  function nextMonthKey(key){
    const month = monthKeySafe(key);
    const [year, monthNo] = month.split('-').map(Number);
    const next = new Date(year, monthNo, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2,'0')}`;
  }
  function resetMonth(person){ return String(person?.balance_reset_at || '').slice(0,7); }
  function carryValue(person){ return num(person?.carry_over_balance ?? person?.overtime_balance ?? person?.overtimeBalance ?? person?.ot_balance, 0); }
  function excludedFromBalance(person){
    try { return !!isLongTermLeaveStaff(person); }
    catch (_) {
      const target = person?.targetShifts ?? person?.target_shifts ?? person?.target_shift_count;
      return bool(person?.is_long_term_leave) || Number(target) === 0;
    }
  }
  function groupLabel(person){ return String(person?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT'; }
  function countDutyCodes(assignments, staffId){
    const out = { chbd1:0, chbd2:0, chbd3:0, ch3a:0, ch3b:0, ch4:0, ch9:0 };
    (assignments || []).forEach(row => {
      if (String(row?.staff_id || '') !== String(staffId)) return;
      const code = String(row?.duty_code || '').trim();
      if (code === 'ชบด1') out.chbd1++;
      else if (code === 'ชบด2') out.chbd2++;
      else if (code === 'ชบด3') out.chbd3++;
      else if (code === 'ช3A') out.ch3a++;
      else if (code === 'ช3B') out.ch3b++;
      else if (code === 'ช4' || code === 'ช4A' || code === 'ช4B' || code === 'ช4-MT') out.ch4++;
      else if (code.startsWith('ช9')) out.ch9++;
    });
    return out;
  }
  function badgeSafe(text, color){
    try { return badge(text, color); }
    catch (_) { return `<span class="badge ${esc(color)}">${esc(text)}</span>`; }
  }
  function staffPillSafe(person){
    try { return staffPill(person); }
    catch (_) { return esc(person?.nickname || person?.full_name || '-'); }
  }
  function balanceData(staffList, assignments, key){
    const month = monthKeySafe(key);
    let stats = {};
    try { stats = calcFairness((assignments || []).filter(row => row.staff_id)) || {}; } catch (_) {}
    return ['MT','เคิก'].map(label => {
      const people = (staffList || []).filter(person => groupLabel(person) === label);
      const included = people.filter(person => !excludedFromBalance(person));
      const units = included.map(person => num(stats[person.id]?.units, 0));
      const average = units.length ? units.reduce((sum, value) => sum + value, 0) / units.length : 0;
      const rows = people.map(person => {
        const stat = stats[person.id] || {};
        const excluded = excludedFromBalance(person);
        const unit = num(stat.units, 0);
        const gap = excluded ? 0 : unit - average;
        const resetKey = resetMonth(person);
        const savedCarry = carryValue(person);
        const localEffectiveMonth = String(person?.__balance_reset_effective_month_v265 || '').slice(0,7);
        const resetWindow = !!resetKey && savedCarry === 0 && month >= resetKey && month <= nextMonthKey(resetKey);
        const resetActive = localEffectiveMonth === month || resetWindow;
        const carry = (excluded || resetActive) ? 0 : savedCarry;
        // Reset means the cumulative OT Balance starts at zero; Quota Gap remains visible separately.
        const otBalance = excluded || resetActive ? 0 : carry + gap;
        let daysOff = 0;
        try { daysOff = excluded ? 0 : calculateDaysOff(person.id, month, assignments); } catch (_) {}
        const detail = countDutyCodes(assignments, person.id);
        const total = (assignments || []).filter(row => String(row?.staff_id || '') === String(person.id)).length;
        let status = 'สมดุล'; let color = 'green';
        if (excluded) { status = 'ลาระยะยาว / ไม่คิดหนี้เวร'; color = 'black'; }
        else if (resetActive) { status = 'รีเซ็ตยอดสะสมเป็น 0 แล้ว'; color = 'blue'; }
        else if (otBalance > 0.5) { status = 'เวรมากกว่าสมดุล'; color = 'orange'; }
        else if (otBalance < -0.5) { status = 'เวรน้อยกว่าสมดุล'; color = 'blue'; }
        return {
          person, total, units:unit, hours:num(stat.hours,0), pay:num(stat.pay,0), gap, otBalance, daysOff, detail, status, color
        };
      });
      return { label, people, average, rows };
    }).filter(group => group.people.length);
  }
  function balanceTableHtml(staffList, assignments, key, options={}){
    const groups = balanceData(staffList, assignments, key);
    const sections = groups.map(group => `<section class="balance-group-section v265-balance-group"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeSafe(`ค่าเฉลี่ย ${group.average.toFixed(1)} หน่วยเวร`, 'blue')}</span></div><div class="table-wrap v265-balance-wrap"><table class="clean-balance-table v265-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th>OT Balance</th><th>วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th></tr></thead><tbody>${group.rows.map(row => `<tr><td>${staffPillSafe(row.person)}</td><td>${row.total}</td><td>${row.units.toFixed(1)}</td><td>${row.hours.toFixed(1)}</td><td>${row.pay.toLocaleString()}</td><td>${row.gap.toFixed(1)}</td><td>${row.otBalance.toFixed(1)}</td><td>${row.daysOff}</td><td>${row.detail.chbd1}</td><td>${row.detail.chbd2}</td><td>${row.detail.chbd3}</td><td>${row.detail.ch3a}</td><td>${row.detail.ch3b}</td><td>${row.detail.ch4}</td><td>${row.detail.ch9}</td><td>${badgeSafe(row.status, row.color)}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v265-balance-dashboard">${sections || '<div class="empty">ยังไม่มีข้อมูลสำหรับคำนวณสมดุลเวร</div>'}</div>`;
  }
  function renderBalanceDashboardV265(staffList, assignments, key){
    return balanceTableHtml(staffList, assignments, key || appState()?.monthKey);
  }
  function showFairnessV265(){
    const st = appState();
    const key = monthKeySafe(st?.monthKey);
    let assignments = [];
    try { assignments = getAssignmentsForMonth(key).filter(row => row.staff_id); }
    catch (_) { assignments = (st?.rosterAssignments || []).filter(row => normDate(row?.duty_date).startsWith(key) && row.staff_id); }
    let staffList = [];
    try { staffList = scheduleStaffList(); }
    catch (_) { staffList = ordered((st?.staff || []).filter(person => { try { return isRosterEnabled(person); } catch (__) { return true; } })); }
    try { showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${balanceTableHtml(staffList, assignments, key, { modal:true })}`, { large:true }); }
    catch (_) {}
  }
  assignGlobal('renderBalanceDashboard', renderBalanceDashboardV265);
  assignGlobal('showFairness', showFairnessV265);

  async function resetBalanceV265(staffId){
    const db = client();
    const st = appState();
    if (!db) return toast('ไม่พบ Supabase client', 'error');
    const person = (st?.staff || []).find(row => String(row?.id || '') === String(staffId)) || {};
    const name = person.nickname || person.full_name || 'เจ้าหน้าที่นี้';
    let accepted = false;
    try { accepted = await confirmDialog(`ยืนยันรีเซ็ตยอดสะสมของ ${name} เป็น 0 โดยไม่แก้ประวัติตารางเวรย้อนหลัง?`, 'รีเซ็ตยอดสะสม'); }
    catch (_) { accepted = window.confirm(`ยืนยันรีเซ็ตยอดสะสมของ ${name} เป็น 0 ?`); }
    if (!accepted) return false;
    busy(true, 'กำลังรีเซ็ตยอดสะสม');
    try {
      const resetAt = new Date().toISOString();
      const patch = { carry_over_balance:0, overtime_balance:0, ot_balance:0, balance_reset_at:resetAt };
      const rpc = await db.rpc('reset_staff_balance_v140', { p_staff_id:staffId });
      if (rpc.error) {
        const update = await db.from('staff_profiles').update(patch).eq('id', staffId).select('*').maybeSingle();
        if (update.error) throw update.error;
        if (!update.data) throw rpc.error;
      }
      const readback = await db.from('staff_profiles').select('*').eq('id', staffId).maybeSingle();
      if (readback.error) throw readback.error;
      Object.assign(person, patch, readback.data || {});
      person.__balance_reset_effective_month_v265 = monthKeySafe(st?.monthKey);
      try { renderPage(); } catch (_) {}
      toast('รีเซ็ตยอดสะสมเป็น 0 แล้ว โดยไม่แก้ประวัติเวรย้อนหลัง');
      return true;
    } catch (error) {
      console.error(`${VERSION}: balance reset failed`, error);
      toast('รีเซ็ตยอดสะสมไม่สำเร็จ: ' + friendly(error), 'error');
      return false;
    } finally { busy(false); }
  }

  /* Remove the old V140 click target so its closed-over reset handler cannot run first. */
  function upgradeResetButtons(){
    document.querySelectorAll('[data-v140-reset-balance]').forEach(button => {
      const id = button.getAttribute('data-v140-reset-balance');
      button.removeAttribute('data-v140-reset-balance');
      button.setAttribute('data-v265-reset-balance', id || '');
    });
  }
  document.addEventListener('click', function(event){
    const button = event.target?.closest?.('[data-v265-reset-balance]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    resetBalanceV265(button.getAttribute('data-v265-reset-balance'));
  }, true);

  /* ------------------------------------------------------------------
     6) UI cleanup and final render hook.
     ------------------------------------------------------------------ */
  function cleanDescriptions(){
    const subtitle = document.getElementById('pageSubtitle');
    if (subtitle) { subtitle.textContent = ''; subtitle.setAttribute('aria-hidden','true'); }
    document.querySelectorAll('.v225-job-short, [data-v226-position-detail], .daily-position-table th:last-child, .daily-position-table td:last-child').forEach(node => node.classList.add('v265-description-hidden'));
    upgradeResetButtons();
    updateDailyCompareCards();
  }
  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !oldRenderPage.__v265FinalRender) {
    const renderPageV265 = function(){
      applyStoredOverrides();
      const result = oldRenderPage.apply(this, arguments);
      setTimeout(cleanDescriptions, 0);
      setTimeout(cleanDescriptions, 80);
      return result;
    };
    renderPageV265.__v265FinalRender = true;
    assignGlobal('renderPage', renderPageV265);
  }

  try {
    const observer = new MutationObserver(() => cleanDescriptions());
    observer.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v265-stability-style';
  style.textContent = `
    #pageSubtitle,.nav-section-title small,.v265-description-hidden{display:none!important}
    .section-title p.hint,.section-title span.hint,.v225-position-note,.v260-source-note,.v260-permission-source-note,.v258-save-scope-note{display:none!important}
    .daily-position-table th:last-child,.daily-position-table td:last-child,.v225-position-card [data-v226-position-detail]{display:none!important}
    .v265-balance-wrap{max-width:100%;overflow:auto}
    .v265-balance-table{min-width:1480px}
    .v265-balance-table th,.v265-balance-table td{white-space:nowrap;text-align:center}
    .v265-balance-table th:first-child,.v265-balance-table td:first-child{text-align:left;position:sticky;left:0;z-index:2;background:var(--surface,#fff)}
    .v265-balance-group{margin-bottom:14px}
    .v265-position-matrix .count-role-cell b{font-size:13px}
    @media(max-width:760px){.v265-balance-table{min-width:1320px}.v265-balance-table th,.v265-balance-table td{font-size:11px;padding:7px 6px}}
  `;
  document.head.appendChild(style);

  setTimeout(cleanDescriptions, 100);
  setTimeout(cleanDescriptions, 600);

  window.cnmiV265 = {
    actualAvailableStaff,
    weeklySlotStaffV265,
    weeklySlotHeadcountV265,
    hasFullWeekRealLeaveV265,
    unavailableRecord,
    outingSlotsForCount,
    expectedTemplatesV265,
    postProcessMonthlyDraft,
    rebuildOutingDateRows,
    savePositionEligibilityV265,
    forceDailyReadback,
    renderBalanceDashboardV265,
    resetBalanceV265,
    hasAdjacentDutyV265,
    cleanDescriptions
  };
  console.info(`${VERSION} loaded`);
})();
