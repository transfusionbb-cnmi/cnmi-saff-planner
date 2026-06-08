/* CNMI Duty Hub v92 - Duty role: ช3A/ช3B/ช9-MT allow MT_OR_TANG
   Purpose: allow MT or แตง for ช3A, ช3B and ช9-MT without touching schema.
*/
(function(){
  'use strict';
  const PATCH_ID = 'v92-duty-mt-or-tang';
  const TARGET_CODES = new Set(['ช3A', 'ช3B', 'ช9-MT', 'ช9']);

  function isTargetDutyCode(code){
    return TARGET_CODES.has(String(code || ''));
  }

  function normalizeRequiredRoleForDuty(code, role){
    // ช9-เคิก must remain เคิก. Only the old MT slot ช9-MT changes to MT_OR_TANG.
    if (String(code || '') === 'ช9-เคิก') return role || 'เคิก';
    if (isTargetDutyCode(code)) return 'MT_OR_TANG';
    return role;
  }

  function normalizeSlot(slot){
    if (!slot) return slot;
    if (isTargetDutyCode(slot.duty_code)) slot.required_role = 'MT_OR_TANG';
    return slot;
  }

  function normalizeRosterRows(rows){
    if (!Array.isArray(rows)) return rows;
    rows.forEach(normalizeSlot);
    return rows;
  }

  function normalizeState(){
    try {
      if (typeof state !== 'undefined') {
        normalizeRosterRows(state.rosterAssignments);
        if (state.rosterDraft && Array.isArray(state.rosterDraft.assignments)) {
          normalizeRosterRows(state.rosterDraft.assignments);
        }
      }
    } catch (err) {
      console.warn(`[${PATCH_ID}] normalizeState skipped`, err);
    }
  }

  // Override dutyRuleForDate so newly generated empty drafts use MT_OR_TANG.
  try {
    const previousDutyRuleForDate = typeof dutyRuleForDate === 'function' ? dutyRuleForDate : null;
    dutyRuleForDate = function(date){
      let rules = [];
      if (previousDutyRuleForDate) {
        rules = previousDutyRuleForDate(date) || [];
      } else {
        const dow = parseDate(date).getDay();
        if (isHolidayDate(date)) {
          rules = [
            { code: 'ชบด1', role: 'MT' },
            { code: 'ชบด2', role: 'MT' },
            { code: 'ชบด3', role: dow === 0 ? 'MT' : 'เคิก' }
          ];
        } else if (dow === 0) {
          rules = [
            { code: 'ชบด1', role: 'MT' },
            { code: 'ชบด2', role: 'MT' },
            { code: 'ชบด3', role: 'MT' },
            { code: 'ช9-เคิก', role: 'เคิก' },
            { code: 'ช3A', role: 'MT_OR_TANG' },
            { code: 'ช3B', role: 'MT_OR_TANG' },
            { code: 'ช9-MT', role: 'MT_OR_TANG' }
          ];
        } else if (dow === 6) {
          rules = [
            { code: 'ชบด1', role: 'MT' },
            { code: 'ชบด2', role: 'MT' },
            { code: 'ชบด3', role: 'เคิก' },
            { code: 'ช9-เคิก', role: 'เคิก' },
            { code: 'ช3A', role: 'MT_OR_TANG' },
            { code: 'ช3B', role: 'MT_OR_TANG' },
            { code: 'ช9-MT', role: 'MT_OR_TANG' }
          ];
        } else {
          rules = [
            { code: 'ชบด1', role: 'MT' },
            { code: 'ชบด2', role: 'MT' },
            { code: 'ชบด3', role: 'เคิก' },
            { code: 'ช4A', role: 'MT_OR_TANG' },
            { code: 'ช4B', role: 'MT_OR_TANG' }
          ];
        }
      }
      return rules.map(r => ({ ...r, role: normalizeRequiredRoleForDuty(r.code, r.role) }));
    };
  } catch (err) {
    console.warn(`[${PATCH_ID}] dutyRuleForDate override failed`, err);
  }

  // Override generateEmptyAssignments so drafts created after this patch carry the new role.
  try {
    generateEmptyAssignments = function(key) {
      const { y, m } = getMonthRange(key);
      const last = new Date(y, m, 0).getDate();
      const rows = [];
      for (let day = 1; day <= last; day++) {
        const date = `${y}-${pad(m)}-${pad(day)}`;
        const rule = dutyRuleForDate(date);
        rule.forEach(slot => rows.push({
          _temp_id: uid(),
          duty_date: date,
          duty_code: slot.code,
          required_role: normalizeRequiredRoleForDuty(slot.code, slot.role),
          staff_id: null,
          is_locked: false
        }));
      }
      return rows;
    };
  } catch (err) {
    console.warn(`[${PATCH_ID}] generateEmptyAssignments override failed`, err);
  }

  // Override canStaffWorkSlot for saved/old slots whose required_role is still MT in DB/state.
  try {
    canStaffWorkSlot = function(staffId, slot, assignments = getAssignmentsForMonth(state.monthKey)) {
      const s = state.staff.find(x => x.id === staffId);
      if (!isRosterEnabled(s)) return false;
      const normalizedSlot = { ...slot, required_role: normalizeRequiredRoleForDuty(slot?.duty_code, slot?.required_role) };
      if (!supportsRequiredRole(s, normalizedSlot.required_role)) return false;
      const blocked = state.leaves.some(l => l.staff_id === staffId && overlapsDate(l, normalizedSlot.duty_date));
      if (blocked) return false;
      if (hasSameDayDuty(staffId, normalizedSlot.duty_date, assignments, normalizedSlot)) return false;
      if (hasAdjacentDuty(staffId, normalizedSlot.duty_date, assignments, normalizedSlot)) return false;
      return true;
    };
  } catch (err) {
    console.warn(`[${PATCH_ID}] canStaffWorkSlot override failed`, err);
  }

  // Normalize loaded data after data reloads and before every render.
  try {
    if (typeof loadAllData === 'function' && !loadAllData.__v92DutyRolePatch) {
      const oldLoadAllData = loadAllData;
      loadAllData = async function(...args){
        const result = await oldLoadAllData.apply(this, args);
        normalizeState();
        return result;
      };
      loadAllData.__v92DutyRolePatch = true;
    }
  } catch (err) {
    console.warn(`[${PATCH_ID}] loadAllData wrap failed`, err);
  }

  try {
    if (typeof renderPage === 'function' && !renderPage.__v92DutyRolePatch) {
      const oldRenderPage = renderPage;
      renderPage = function(...args){
        normalizeState();
        return oldRenderPage.apply(this, args);
      };
      renderPage.__v92DutyRolePatch = true;
    }
  } catch (err) {
    console.warn(`[${PATCH_ID}] renderPage wrap failed`, err);
  }

  normalizeState();
  console.info(`[${PATCH_ID}] loaded: ช3A/ช3B/ช9-MT => MT_OR_TANG`);
})();
