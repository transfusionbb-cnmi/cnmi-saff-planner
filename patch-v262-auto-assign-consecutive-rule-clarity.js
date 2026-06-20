/* V262: Auto Assign consecutive-duty rule clarity.
   Scope is intentionally limited to roster Auto Assign.
   - The consecutive-day restriction is applied ONLY when the target slot is ชบด1/ชบด2/ชบด3.
   - ช4, ช3A, ช3B and ช9 may be assigned on adjacent dates as before.
   - Unfilled warnings report the actual blocking category instead of implying every blank is caused by consecutive ชบด. */
(function(){
  'use strict';
  if (window.__CNMI_V262_AUTO_ASSIGN_CONSECUTIVE_RULE_CLARITY__) return;
  window.__CNMI_V262_AUTO_ASSIGN_CONSECUTIVE_RULE_CLARITY__ = true;

  const DUTY_RULE_PREFIX = 'DUTY_RULE:';
  const RESTRICTED_CODES = new Set(['ชบด1', 'ชบด2', 'ชบด3']);

  const normId = (value) => String(value == null ? '' : value);
  const parseDutyDate = (date) => {
    try { return typeof parseDate === 'function' ? parseDate(date) : new Date(`${String(date).slice(0, 10)}T00:00:00`); }
    catch (_) { return new Date(`${String(date).slice(0, 10)}T00:00:00`); }
  };
  const dayKey = (date) => ['sun','mon','tue','wed','thu','fri','sat'][parseDutyDate(date).getDay()];
  const isRestricted = (code) => RESTRICTED_CODES.has(String(code || '').trim());
  const isRosterOn = (staff) => {
    try { return typeof isRosterEnabled === 'function' ? isRosterEnabled(staff) : !!staff && staff.is_active !== false && staff.staff_type !== 'แพทย์'; }
    catch (_) { return !!staff; }
  };
  const staffType = (staff) => String(staff?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT';
  const isTang = (staff) => String(staff?.nickname || staff?.full_name || '').trim() === 'แตง';

  function normalizeEligibilityDuty(code='') {
    const value = String(code || '').trim();
    if (['ช4A','ช4','ช4-MT/แตง','ช4-MT/แตง1','ช4-MT/แตง-1','ช4-1','ช4-MT/แตง 1'].includes(value)) return 'ช4-MT/แตง 1';
    if (['ช4B','ช4-MT/แตง2','ช4-MT/แตง-2','ช4-2','ช4-MT/แตง 2'].includes(value)) return 'ช4-MT/แตง 2';
    if (value === 'ช9-MT' || value === 'ช9' || value === 'ช9-MT/แตง') return 'ช9-MT/แตง';
    return value;
  }

  function eligibilityCode(slot) {
    return `${DUTY_RULE_PREFIX}${dayKey(slot.duty_date)}:${normalizeEligibilityDuty(slot.duty_code)}`;
  }

  function supportsFallbackRole(staff, requiredRole) {
    try {
      if (typeof supportsRequiredRole === 'function') return supportsRequiredRole(staff, requiredRole);
    } catch (_) {}
    const required = String(requiredRole || '').trim();
    if (!required || required === '-' || required === 'ใครก็ได้' || required === 'MT/เคิก') return ['MT','เคิก'].includes(staffType(staff));
    if (required === 'ไม่มีสิทธิ์') return false;
    if (required === 'MT/แตง' || required === 'MT_OR_TANG') return staffType(staff) === 'MT' || isTang(staff);
    if (required === 'MT') return staffType(staff) === 'MT';
    if (required === 'เคิก') return staffType(staff) === 'เคิก';
    return true;
  }

  // Mirrors V197 permission behavior so this patch changes only the consecutive-day filter.
  function dutyEligibilityAllowsStaff(staff, slot) {
    const staffId = normId(staff?.id);
    if (!staffId || !slot) return false;
    const code = eligibilityCode(slot);
    const rows = Array.isArray(state?.positionEligibility) ? state.positionEligibility : [];
    const explicit = rows.find(row => normId(row?.staff_id) === staffId && String(row?.position_code || '') === code);
    if (explicit) return explicit.is_eligible === true || String(explicit.is_eligible).toLowerCase() === 'true';

    const prefix = `${DUTY_RULE_PREFIX}${dayKey(slot.duty_date)}:`;
    const hasConfiguredRulesForDay = rows.some(row => normId(row?.staff_id) === staffId && String(row?.position_code || '').startsWith(prefix));
    if (hasConfiguredRulesForDay) return false;
    return supportsFallbackRole(staff, slot.required_role);
  }

  function isOnLeave(staffId, date) {
    try {
      if (Array.isArray(state?.leaves) && typeof overlapsDate === 'function') {
        return state.leaves.some(leave => normId(leave?.staff_id) === normId(staffId) && overlapsDate(leave, date));
      }
      if (typeof activeLeaveRecordOn === 'function') return !!activeLeaveRecordOn(staffId, date);
    } catch (_) {}
    return false;
  }

  function hasSameDay(staffId, slot, assignments) {
    try {
      return typeof hasSameDayDuty === 'function' && hasSameDayDuty(staffId, slot.duty_date, assignments, slot);
    } catch (_) { return false; }
  }

  function hasRestrictedAdjacent(staffId, slot, assignments) {
    if (!isRestricted(slot?.duty_code)) return false;
    try {
      return typeof hasAdjacentDuty === 'function' && hasAdjacentDuty(staffId, slot.duty_date, assignments, slot);
    } catch (_) { return false; }
  }

  function addFairnessCount(counts, staff, slot, weekKey) {
    const current = counts[staff.id] = counts[staff.id] || {
      total:0, mon:0, fri:0, weekend:0, weekday:0,
      hours:0, pay:0, units:0, weekCounts:{}
    };
    current.total = (current.total || 0) + 1;
    try {
      const metrics = typeof dutyMetrics === 'function' ? dutyMetrics(slot, staff.id) : { hours:0, units:1, pay:0 };
      current.hours = (current.hours || 0) + (Number(metrics?.hours) || 0);
      current.units = (current.units || 0) + (Number(metrics?.units) || 0);
      current.pay = (current.pay || 0) + (Number(metrics?.pay) || 0);
    } catch (_) {}
    current.weekCounts = current.weekCounts || {};
    current.weekCounts[weekKey] = (current.weekCounts[weekKey] || 0) + 1;
    try {
      if ((typeof isWeekend === 'function' && isWeekend(slot.duty_date)) || (typeof isHolidayDate === 'function' && isHolidayDate(slot.duty_date))) {
        current.weekend = (current.weekend || 0) + 1;
      } else {
        current.weekday = (current.weekday || 0) + 1;
      }
    } catch (_) {}
  }

  function reasonLabel(reason) {
    const labels = {
      permission: 'ไม่มีผู้มีสิทธิ์ตามวัน/ประเภทเวร',
      leave: 'ผู้มีสิทธิ์ติดลา',
      sameDay: 'ผู้มีสิทธิ์มีเวรอื่นในวันเดียวกัน',
      consecutiveChbd: 'ชบดติดกับวันก่อนหรือวันถัดไป',
      other: 'ไม่มีผู้พร้อมลงช่อง'
    };
    return labels[reason] || labels.other;
  }

  window.autoAssignRoster = autoAssignRoster = function autoAssignRosterV262() {
    if (!state.rosterDraft || state.rosterDraft.monthKey !== state.monthKey) {
      state.rosterDraft = { monthKey: state.monthKey, assignments: generateEmptyAssignments(state.monthKey) };
    }

    const assignments = state.rosterDraft.assignments || [];
    const counts = typeof calcFairness === 'function' ? calcFairness(assignments.filter(row => row.staff_id)) : {};
    const diagnostics = {
      permission:0,
      leave:0,
      sameDay:0,
      consecutiveChbd:0,
      other:0,
      details:[]
    };
    let unfilled = 0;

    assignments.forEach(slot => {
      if (slot.is_locked || slot.staff_id) return;

      const weekKey = typeof weekKeyOf === 'function' ? weekKeyOf(slot.duty_date) : String(slot.duty_date || '').slice(0, 10);
      const rosterStaff = (state.staff || []).filter(isRosterOn);
      const eligibleStaff = rosterStaff.filter(staff => dutyEligibilityAllowsStaff(staff, slot));
      const leaveFreeStaff = eligibleStaff.filter(staff => !isOnLeave(staff.id, slot.duty_date));
      const baseCandidates = leaveFreeStaff.filter(staff => !hasSameDay(staff.id, slot, assignments));

      // V262 core rule: adjacency is checked only for ชบด1/ชบด2/ชบด3.
      const candidates = isRestricted(slot.duty_code)
        ? baseCandidates.filter(staff => !hasRestrictedAdjacent(staff.id, slot, assignments))
        : baseCandidates;

      candidates.sort((a, b) => {
        const ca = counts[a.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const cb = counts[b.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const order = typeof compareStaffOrder === 'function'
          ? compareStaffOrder(a, b)
          : String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th');
        return ((ca.pay || 0) - (cb.pay || 0))
          || ((ca.hours || 0) - (cb.hours || 0))
          || (((ca.weekCounts || {})[weekKey] || 0) - ((cb.weekCounts || {})[weekKey] || 0))
          || ((ca.weekend || 0) - (cb.weekend || 0))
          || ((ca.total || 0) - (cb.total || 0))
          || order;
      });

      if (candidates[0]) {
        slot.staff_id = candidates[0].id;
        addFairnessCount(counts, candidates[0], slot, weekKey);
        return;
      }

      unfilled++;
      let reason = 'other';
      if (!eligibleStaff.length) reason = 'permission';
      else if (!leaveFreeStaff.length) reason = 'leave';
      else if (!baseCandidates.length) reason = 'sameDay';
      else if (isRestricted(slot.duty_code)) reason = 'consecutiveChbd';
      diagnostics[reason]++;
      diagnostics.details.push({ duty_date:slot.duty_date, duty_code:slot.duty_code, reason });
    });

    state.rosterDraft = { monthKey: state.monthKey, assignments };
    state.__lastAutoAssignDiagnosticsV262 = diagnostics;

    if (!unfilled) {
      showToast('Auto Assign แล้ว: ห้ามติดกันเฉพาะ ชบด1/ชบด2/ชบด3 ส่วน ช4, ช3A, ช3B และ ช9 ติดวันก่อนหรือวันถัดไปได้');
      return;
    }

    const reasonText = ['permission','leave','sameDay','consecutiveChbd','other']
      .filter(key => diagnostics[key] > 0)
      .map(key => `${reasonLabel(key)} ${diagnostics[key]} ช่อง`)
      .join(' • ');
    showToast(`Auto Assign แล้ว แต่เหลือ ${unfilled} ช่อง: ${reasonText}`);
    try { console.info('V262 Auto Assign unfilled diagnostics', diagnostics); } catch (_) {}
  };

  console.info('V262 Auto Assign consecutive rule clarity loaded');
})();
