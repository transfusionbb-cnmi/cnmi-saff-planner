/* V266 Context-aware Auto Assign
   - Centralizes staff availability before roster Auto Assign.
   - Real leave blocks both roster duty and daytime positions on that date.
   - "ไม่รับเวร" blocks roster/night duty only; daytime positions remain allowed.
   - Cancelled/rejected/inactive leave records do not block assignment.
   - Existing unlocked assignments that became invalid are cleared before fairness calculation.
   - Unfillable slots remain vacant and are labelled "ตำแหน่งว่าง (Vacant)".
*/
(function(){
  'use strict';
  const VERSION = 'V266_CONTEXT_AWARE_AUTO_ASSIGN';
  if (window.__CNMI_V266_CONTEXT_AWARE_AUTO_ASSIGN__) return;
  window.__CNMI_V266_CONTEXT_AWARE_AUTO_ASSIGN__ = true;

  const DUTY_RULE_PREFIX = 'DUTY_RULE:';
  const RESTRICTED_CODES = new Set(['ชบด1', 'ชบด2', 'ชบด3']);
  // Every code below belongs to the roster/night-duty table. The 'night_roster'
  // context therefore applies to all of them, not only to BB/Donor labels.
  const NIGHT_ROSTER_DUTY_CODES = new Set([
    'ชบด1','ชบด2','ชบด3',
    'ช3A','ช3B',
    'ช4','ช4A','ช4B','ช4-MT/แตง 1','ช4-MT/แตง 2',
    'ช9','ช9-เคิก','ช9-MT','ช9-MT/แตง'
  ]);

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function normId(value){ return String(value == null ? '' : value); }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function clone(value){
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  }
  function assignGlobal(name, fn){
    try { window[name] = fn; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function truthy(value){
    if (value === true) return true;
    return ['true','1','yes','y','on','active','ใช่','เปิด','ลา','on_leave','leave'].includes(String(value ?? '').trim().toLowerCase());
  }
  function explicitlyFalse(value){
    if (value === false) return true;
    return ['false','0','no','n','off','inactive','ปิด','ไม่','ไม่รับเวร','ไม่รับ'].includes(String(value ?? '').trim().toLowerCase());
  }
  function leaveType(row){
    try { return String(leaveDisplayType(row) || '').trim(); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || '').split(':::')[0].trim(); }
  }
  function isNoDuty(row){
    try { return typeof isNoDutyLeaveType === 'function' ? !!isNoDutyLeaveType(row) : leaveType(row) === 'ไม่รับเวร'; }
    catch (_) { return leaveType(row) === 'ไม่รับเวร'; }
  }
  function leaveIsEffective(row){
    try { return typeof isLeaveEffective === 'function' ? !!isLeaveEffective(row) : true; }
    catch (_) {
      const raw = String(row?.status || row?.approval_status || 'active').trim();
      const lower = raw.toLowerCase();
      return !['cancelled','canceled','deleted','inactive','void','rejected'].includes(lower)
        && !['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw);
    }
  }
  function leaveOverlaps(row, date){
    const d = normDate(date);
    try { return typeof overlapsDate === 'function' ? !!overlapsDate(row, d) : false; }
    catch (_) {
      const start = normDate(row?.start_date || row?.date || row?.work_date);
      const end = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!start && !!end && start <= d && d <= end;
    }
  }
  function activeStatusRows(staffId, date){
    const st = appState();
    const sid = normId(staffId);
    const d = normDate(date);
    if (!st || !sid || !d) return [];
    return (Array.isArray(st.leaves) ? st.leaves : []).filter(row =>
      normId(row?.staff_id) === sid && leaveIsEffective(row) && leaveOverlaps(row, d)
    );
  }
  function staffById(staffId){
    const st = appState();
    return (st?.staff || []).find(person => normId(person?.id) === normId(staffId)) || null;
  }
  function staffGloballyOnLeave(staff){
    if (!staff || !Object.prototype.hasOwnProperty.call(staff, 'status_leave')) return false;
    return truthy(staff.status_leave);
  }
  function staffAcceptsNightDuty(staff){
    if (!staff || !Object.prototype.hasOwnProperty.call(staff, 'status_accept_night_shift')) return true;
    return !explicitlyFalse(staff.status_accept_night_shift);
  }

  /* Context source of truth.
     context = 'night_roster' or 'day_position'. */
  function getStaffAvailabilityContextV266(staffOrId, date, context='night_roster'){
    const staff = typeof staffOrId === 'object' ? staffOrId : staffById(staffOrId);
    const d = normDate(date);
    if (!staff || !d) return { available:false, reason:'ไม่พบข้อมูลเจ้าหน้าที่', realLeave:null, noDuty:null };

    let enabled = true;
    try {
      enabled = context === 'day_position'
        ? (typeof isDailyPositionEnabled === 'function' ? !!isDailyPositionEnabled(staff) : staff.is_active !== false)
        : (typeof isRosterEnabled === 'function' ? !!isRosterEnabled(staff) : staff.is_active !== false);
    } catch (_) { enabled = staff.is_active !== false; }
    if (!enabled) return { available:false, reason:context === 'day_position' ? 'ปิดใช้งานตำแหน่งกลางวัน' : 'ปิดใช้งานการจัดเวร', realLeave:null, noDuty:null };
    if (staffGloballyOnLeave(staff)) return { available:false, reason:'สถานะพนักงานเป็นลา', realLeave:{ type:'status_leave' }, noDuty:null };

    const rows = activeStatusRows(staff.id, d);
    const realLeave = rows.find(row => !isNoDuty(row)) || null;
    const noDuty = rows.find(isNoDuty) || null;

    // Show the specific leave type once (e.g. 'ลาคลอด'), without 'ลา: ลาคลอด'.
    if (realLeave) return { available:false, reason:leaveType(realLeave) || 'ลา', realLeave, noDuty };
    if (context === 'night_roster') {
      if (!staffAcceptsNightDuty(staff)) return { available:false, reason:'สถานะไม่รับเวรกลางคืน', realLeave:null, noDuty };
      if (noDuty) return { available:false, reason:'ไม่รับเวรในวันนั้น', realLeave:null, noDuty };
    }
    return { available:true, reason:'พร้อมทำงาน', realLeave:null, noDuty };
  }

  function parseDutyDate(date){
    try { return typeof parseDate === 'function' ? parseDate(date) : new Date(`${normDate(date)}T00:00:00`); }
    catch (_) { return new Date(`${normDate(date)}T00:00:00`); }
  }
  function dutyDayKey(date){ return ['sun','mon','tue','wed','thu','fri','sat'][parseDutyDate(date).getDay()]; }
  function normalizedDutyForPermission(code=''){
    const value = String(code || '').trim();
    if (['ช4A','ช4','ช4-MT/แตง','ช4-MT/แตง1','ช4-MT/แตง-1','ช4-1','ช4-MT/แตง 1'].includes(value)) return 'ช4-MT/แตง 1';
    if (['ช4B','ช4-MT/แตง2','ช4-MT/แตง-2','ช4-2','ช4-MT/แตง 2'].includes(value)) return 'ช4-MT/แตง 2';
    if (['ช9-MT','ช9','ช9-MT/แตง'].includes(value)) return 'ช9-MT/แตง';
    return value;
  }
  function dutyPermissionCode(slot){
    return `${DUTY_RULE_PREFIX}${dutyDayKey(slot?.duty_date)}:${normalizedDutyForPermission(slot?.duty_code)}`;
  }
  function supportsFallbackRole(staff, requiredRole){
    try { return typeof supportsRequiredRole === 'function' ? !!supportsRequiredRole(staff, requiredRole) : true; }
    catch (_) { return true; }
  }
  function dutyPermissionAllowsV266(staff, slot){
    const st = appState();
    if (!staff || !slot) return false;
    const sid = normId(staff.id);
    const rows = Array.isArray(st?.positionEligibility) ? st.positionEligibility : [];
    const code = dutyPermissionCode(slot);
    const explicit = rows.find(row => normId(row?.staff_id) === sid && String(row?.position_code || '') === code);
    if (explicit) return explicit.is_eligible === true || String(explicit.is_eligible).toLowerCase() === 'true';
    const prefix = `${DUTY_RULE_PREFIX}${dutyDayKey(slot.duty_date)}:`;
    const hasConfiguredRulesForDay = rows.some(row => normId(row?.staff_id) === sid && String(row?.position_code || '').startsWith(prefix));
    if (hasConfiguredRulesForDay) return false;
    return supportsFallbackRole(staff, slot.required_role);
  }
  function isRestrictedDuty(code){ return RESTRICTED_CODES.has(String(code || '').trim()); }
  function isNightRosterDutyCodeV266(code){
    const raw = String(code || '').trim();
    return NIGHT_ROSTER_DUTY_CODES.has(raw)
      || RESTRICTED_CODES.has(raw)
      || raw === 'ช3A' || raw === 'ช3B'
      || raw.startsWith('ช4') || raw.startsWith('ช9');
  }
  function verifyNightRosterCoverageV266(){
    const required = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช4','ช4A','ช4B','ช9','ช9-เคิก','ช9-MT'];
    const missing = required.filter(code => !isNightRosterDutyCodeV266(code));
    return { ok:missing.length === 0, required, missing };
  }
  function sameDayBlocked(staffId, slot, assignments){
    try { return typeof hasSameDayDuty === 'function' && !!hasSameDayDuty(staffId, slot.duty_date, assignments, slot); }
    catch (_) { return false; }
  }
  function adjacentBlocked(staffId, slot, assignments){
    if (!isRestrictedDuty(slot?.duty_code)) return false;
    try { return typeof hasAdjacentDuty === 'function' && !!hasAdjacentDuty(staffId, slot.duty_date, assignments, slot); }
    catch (_) { return false; }
  }

  function evaluateRosterCandidateV266(staff, slot, assignments, options={}){
    if (!staff || !slot) return { ok:false, stage:'staff', reason:'ไม่พบข้อมูลเจ้าหน้าที่หรือช่องเวร' };
    // All assignments reaching this function are roster slots. This includes
    // ชบด1-3, ช3A, ช3B, ช4A/B and ช9 variants.
    const availability = getStaffAvailabilityContextV266(staff, slot.duty_date, 'night_roster');
    if (!availability.available) return { ok:false, stage:availability.noDuty ? 'noDuty' : 'leave', reason:availability.reason, availability };
    if (!dutyPermissionAllowsV266(staff, slot)) return { ok:false, stage:'permission', reason:'ไม่มีสิทธิ์ตามวัน/ประเภทเวร', availability };
    if (options.checkSameDay !== false && sameDayBlocked(staff.id, slot, assignments)) return { ok:false, stage:'sameDay', reason:'มีเวรอื่นในวันเดียวกัน', availability };
    if (options.checkAdjacent !== false && adjacentBlocked(staff.id, slot, assignments)) return { ok:false, stage:'consecutiveChbd', reason:'ชบดติดกับวันก่อนหรือวันถัดไป', availability };
    return { ok:true, stage:'ready', reason:'พร้อมจัดเวร', availability };
  }

  /* This is the main function that filters staff BEFORE Auto Assign starts. */
  function filterEligibleStaffBeforeAutoAssignV266(slot, assignments){
    const st = appState();
    const rosterStaff = (st?.staff || []).filter(person => {
      try { return typeof isRosterEnabled === 'function' ? !!isRosterEnabled(person) : person?.is_active !== false; }
      catch (_) { return person?.is_active !== false; }
    });
    const permissionEligible = rosterStaff.filter(person => dutyPermissionAllowsV266(person, slot));
    const statusEligible = permissionEligible.filter(person => getStaffAvailabilityContextV266(person, slot.duty_date, 'night_roster').available);
    const sameDayEligible = statusEligible.filter(person => !sameDayBlocked(person.id, slot, assignments));
    const candidates = isRestrictedDuty(slot?.duty_code)
      ? sameDayEligible.filter(person => !adjacentBlocked(person.id, slot, assignments))
      : sameDayEligible;
    return { rosterStaff, permissionEligible, statusEligible, sameDayEligible, candidates };
  }

  function vacancyReasonV266(stages, slot){
    if (!stages.rosterStaff.length) return 'ไม่มีเจ้าหน้าที่ที่เปิดใช้งานการจัดเวร';
    if (!stages.permissionEligible.length) return 'ไม่มีผู้มีสิทธิ์ตามวัน/ประเภทเวร';
    if (!stages.statusEligible.length) {
      const statusReasons = stages.permissionEligible.map(person => getStaffAvailabilityContextV266(person, slot.duty_date, 'night_roster').reason);
      if (statusReasons.some(text => /ไม่รับเวร/.test(text))) return 'ผู้มีสิทธิ์ไม่รับเวรในวันนั้น';
      return 'ผู้มีสิทธิ์ติดลาในวันนั้น';
    }
    if (!stages.sameDayEligible.length) return 'ผู้มีสิทธิ์มีเวรอื่นในวันเดียวกัน';
    if (isRestrictedDuty(slot?.duty_code)) return 'ผู้มีสิทธิ์ติดกฎ ชบด ห้ามติดวันก่อน/วันถัดไป';
    return 'ไม่มีผู้พร้อมลงช่อง';
  }
  function slotId(slot){
    try { return typeof getSlotId === 'function' ? String(getSlotId(slot)) : String(slot?.id || slot?._temp_id || `${slot?.duty_date}|${slot?.duty_code}`); }
    catch (_) { return String(slot?.id || slot?._temp_id || `${slot?.duty_date}|${slot?.duty_code}`); }
  }
  function sanitizeExistingAssignmentsV266(assignments){
    const cleared = [];
    const lockedInvalid = [];
    (assignments || []).forEach(slot => {
      delete slot._vacant_reason_v266;
      delete slot._vacant_label_v266;
      if (!slot?.staff_id) return;
      const staff = staffById(slot.staff_id);
      const result = evaluateRosterCandidateV266(staff, slot, assignments, { checkSameDay:true, checkAdjacent:true });
      if (result.ok) return;
      if (slot.is_locked) {
        lockedInvalid.push({ slot, staff, reason:result.reason });
        return;
      }
      cleared.push({ slot:clone(slot), staff, reason:result.reason });
      slot.staff_id = null;
      slot._vacant_reason_v266 = result.reason;
      slot._vacant_label_v266 = 'ตำแหน่งว่าง (Vacant)';
    });
    return { cleared, lockedInvalid };
  }
  function validAssignmentsForFairnessV266(assignments){
    return (assignments || []).filter(slot => {
      if (!slot?.staff_id) return false;
      return evaluateRosterCandidateV266(staffById(slot.staff_id), slot, assignments, { checkSameDay:true, checkAdjacent:true }).ok;
    });
  }
  function dutyFamily(code=''){
    const value = String(code || '');
    if (value.startsWith('ชบด')) return 'ชบด';
    if (value.startsWith('ช4')) return 'ช4';
    if (value.startsWith('ช3')) return 'ช3';
    if (value.startsWith('ช9')) return 'ช9';
    return value;
  }
  function buildDutyMixCountsV266(assignments){
    const result = {};
    (assignments || []).forEach(slot => {
      if (!slot?.staff_id) return;
      const sid = normId(slot.staff_id);
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      result[sid] = result[sid] || { byCode:{}, byFamily:{} };
      result[sid].byCode[code] = (result[sid].byCode[code] || 0) + 1;
      result[sid].byFamily[family] = (result[sid].byFamily[family] || 0) + 1;
    });
    return result;
  }
  function addFairnessCountV266(counts, mixCounts, staff, slot, weekKey){
    const sid = staff.id;
    const current = counts[sid] = counts[sid] || { total:0, mon:0, fri:0, weekend:0, weekday:0, hours:0, pay:0, units:0, weekCounts:{} };
    current.total = (current.total || 0) + 1;
    try {
      const metrics = typeof dutyMetrics === 'function' ? dutyMetrics(slot, sid) : { hours:0, units:1, pay:0 };
      current.hours = (current.hours || 0) + (Number(metrics?.hours) || 0);
      current.units = (current.units || 0) + (Number(metrics?.units) || 0);
      current.pay = (current.pay || 0) + (Number(metrics?.pay) || 0);
    } catch (_) {}
    current.weekCounts = current.weekCounts || {};
    current.weekCounts[weekKey] = (current.weekCounts[weekKey] || 0) + 1;
    try {
      if ((typeof isWeekend === 'function' && isWeekend(slot.duty_date)) || (typeof isHolidayDate === 'function' && isHolidayDate(slot.duty_date))) current.weekend = (current.weekend || 0) + 1;
      else current.weekday = (current.weekday || 0) + 1;
    } catch (_) {}
    const code = String(slot.duty_code || '');
    const family = dutyFamily(code);
    mixCounts[sid] = mixCounts[sid] || { byCode:{}, byFamily:{} };
    mixCounts[sid].byCode[code] = (mixCounts[sid].byCode[code] || 0) + 1;
    mixCounts[sid].byFamily[family] = (mixCounts[sid].byFamily[family] || 0) + 1;
  }

  window.autoAssignRoster = autoAssignRoster = function autoAssignRosterV266(){
    const st = appState();
    if (!st.rosterDraft || st.rosterDraft.monthKey !== st.monthKey) {
      st.rosterDraft = { monthKey:st.monthKey, assignments:generateEmptyAssignments(st.monthKey) };
    }
    const assignments = st.rosterDraft.assignments || [];
    const cleanup = sanitizeExistingAssignmentsV266(assignments);
    const validAssigned = validAssignmentsForFairnessV266(assignments);
    const counts = typeof calcFairness === 'function' ? calcFairness(validAssigned) : {};
    const mixCounts = buildDutyMixCountsV266(validAssigned);
    const diagnostics = { vacant:0, cleared:cleanup.cleared, lockedInvalid:cleanup.lockedInvalid, details:[] };

    assignments.forEach(slot => {
      if (slot.is_locked || slot.staff_id) return;
      const weekKey = typeof weekKeyOf === 'function' ? weekKeyOf(slot.duty_date) : normDate(slot.duty_date);
      const stages = filterEligibleStaffBeforeAutoAssignV266(slot, assignments);
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      stages.candidates.sort((a, b) => {
        const ca = counts[a.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const cb = counts[b.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const ma = mixCounts[a.id] || { byCode:{}, byFamily:{} };
        const mb = mixCounts[b.id] || { byCode:{}, byFamily:{} };
        const order = typeof compareStaffOrder === 'function'
          ? compareStaffOrder(a, b)
          : String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th');
        return ((ma.byCode[code] || 0) - (mb.byCode[code] || 0))
          || ((ma.byFamily[family] || 0) - (mb.byFamily[family] || 0))
          || ((ca.pay || 0) - (cb.pay || 0))
          || ((ca.hours || 0) - (cb.hours || 0))
          || (((ca.weekCounts || {})[weekKey] || 0) - ((cb.weekCounts || {})[weekKey] || 0))
          || ((ca.weekend || 0) - (cb.weekend || 0))
          || ((ca.total || 0) - (cb.total || 0))
          || order;
      });

      const chosen = stages.candidates[0] || null;
      if (chosen) {
        slot.staff_id = chosen.id;
        delete slot._vacant_reason_v266;
        delete slot._vacant_label_v266;
        addFairnessCountV266(counts, mixCounts, chosen, slot, weekKey);
        return;
      }

      const reason = vacancyReasonV266(stages, slot);
      slot.staff_id = null;
      slot._vacant_reason_v266 = reason;
      slot._vacant_label_v266 = 'ตำแหน่งว่าง (Vacant)';
      diagnostics.vacant++;
      diagnostics.details.push({ duty_date:slot.duty_date, duty_code:slot.duty_code, reason });
    });

    st.rosterDraft = { monthKey:st.monthKey, assignments };
    st.__lastAutoAssignDiagnosticsV266 = diagnostics;
    decorateVacanciesV266();

    const parts = [];
    if (cleanup.cleared.length) parts.push(`ล้างชื่อเดิมที่ติดลา/ไม่รับเวร/หมดสิทธิ์ ${cleanup.cleared.length} ช่อง`);
    if (diagnostics.vacant) parts.push(`เหลือตำแหน่งว่าง ${diagnostics.vacant} ช่อง`);
    if (cleanup.lockedInvalid.length) parts.push(`ช่องล็อกที่ต้องตรวจเอง ${cleanup.lockedInvalid.length} ช่อง`);
    if (parts.length) showToast(`Auto Assign เสร็จแล้ว: ${parts.join(' • ')}`);
    else showToast('Auto Assign เสร็จแล้ว โดยคัดกรองสถานะพนักงานก่อนจัดและเกลี่ยชนิดเวรแยกกัน');
    try { console.info(`${VERSION} diagnostics`, diagnostics); } catch (_) {}
  };

  window.canStaffWorkSlot = canStaffWorkSlot = function canStaffWorkSlotV266(staffId, slot, assignments){
    const list = assignments || appState()?.rosterDraft?.assignments || (typeof getAssignmentsForMonth === 'function' ? getAssignmentsForMonth(appState()?.monthKey) : []);
    return evaluateRosterCandidateV266(staffById(staffId), slot, list, { checkSameDay:true, checkAdjacent:true }).ok;
  };

  /* Daytime position candidate: real leave blocks, "ไม่รับเวร" does not. */
  window.positionCandidateOk = positionCandidateOk = function positionCandidateOkV266(staff, positionRow, date){
    try {
      const d = normDate(date || (typeof todayStr === 'function' ? todayStr() : ''));
      const availability = getStaffAvailabilityContextV266(staff, d, 'day_position');
      if (!availability.available) return false;
      const key = positionRow?.eligibility_code || positionRow?.code || positionRow?.position_code || '';
      if (typeof positionRuleOk === 'function' && !positionRuleOk(staff, positionRow?.main_rule || '')) return false;
      if (typeof positionEligible === 'function' && !positionEligible(staff, key)) return false;
      return true;
    } catch (_) { return false; }
  };

  function decorateVacanciesV266(){
    try {
      const assignments = appState()?.rosterDraft?.assignments || [];
      const map = new Map(assignments.map(slot => [slotId(slot), slot]));
      document.querySelectorAll('.roster-slot[data-drop-slot]').forEach(el => {
        const slot = map.get(String(el.dataset.dropSlot || ''));
        if (!slot || slot.staff_id || !slot._vacant_reason_v266) return;
        el.classList.add('v266-vacant-slot');
        el.setAttribute('title', slot._vacant_reason_v266);
        const name = el.querySelector('.assigned-name');
        if (name) name.textContent = 'ตำแหน่งว่าง (Vacant)';
        const meta = el.querySelector('.slot-meta');
        if (meta && !meta.querySelector('.v266-vacant-reason')) {
          const reason = document.createElement('div');
          reason.className = 'v266-vacant-reason';
          reason.textContent = slot._vacant_reason_v266;
          meta.appendChild(reason);
        }
        const select = el.querySelector('[data-roster-slot-select]');
        if (select?.options?.[0]) select.options[0].textContent = 'ตำแหน่งว่าง (Vacant)';
      });
      document.querySelectorAll('[data-roster-slot-select]').forEach(select => {
        const slot = map.get(String(select.dataset.rosterSlotSelect || ''));
        if (!slot || slot.staff_id || !slot._vacant_reason_v266) return;
        if (select.options?.[0]) select.options[0].textContent = 'ตำแหน่งว่าง (Vacant)';
        const card = select.closest('.mobile-roster-slot');
        if (card) {
          card.classList.add('v266-vacant-slot');
          card.setAttribute('title', slot._vacant_reason_v266);
        }
      });
    } catch (_) {}
  }

  try {
    const style = document.createElement('style');
    style.textContent = `
      .v266-vacant-slot{outline:2px dashed #d97706;background:#fff7ed!important}
      .v266-vacant-slot .assigned-name{color:#9a3412;font-weight:700}
      .v266-vacant-reason{margin-top:4px;color:#9a3412;font-size:11px;line-height:1.25}
    `;
    document.head.appendChild(style);
  } catch (_) {}

  try {
    const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRenderPage && !previousRenderPage.__v266VacancyDecorated) {
      const wrapped = function renderPageV266(){
        const result = previousRenderPage.apply(this, arguments);
        try { requestAnimationFrame(decorateVacanciesV266); } catch (_) { decorateVacanciesV266(); }
        return result;
      };
      wrapped.__v266VacancyDecorated = true;
      assignGlobal('renderPage', wrapped);
    }
  } catch (_) {}

  window.cnmiV266 = {
    getStaffAvailabilityContextV266,
    filterEligibleStaffBeforeAutoAssignV266,
    evaluateRosterCandidateV266,
    dutyPermissionAllowsV266,
    isNightRosterDutyCodeV266,
    verifyNightRosterCoverageV266,
    decorateVacanciesV266
  };

  try {
    const coverage = verifyNightRosterCoverageV266();
    if (!coverage.ok) console.error(`${VERSION}: missing night-roster duty coverage`, coverage.missing);
    else console.info(`${VERSION}: night-roster coverage verified`, coverage.required);
  } catch (_) {}
  console.info(`${VERSION} loaded`);
})();
