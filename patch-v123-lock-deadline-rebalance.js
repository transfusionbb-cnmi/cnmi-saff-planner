/* CNMI Staff Planner Patch V123
   Scope: roster logic only
   1) Auto Assign must respect locked slots. Locked means is_locked/isLocked === true.
   2) Staff no-duty deadline: active for roster month 2026-07 onward only.
      - Before deadline: save no-duty and silently rebalance draft roster.
      - After deadline: staff cannot save no-duty; show exact message.
   3) findBestSubstitute(): choose replacement by hard constraints first, then priority sorting.
      - Ch3A/Ch3B/Ch9 count as base 8 hours.
      - Ch4 slots count as 0 balance hours.
*/
(function patchV123LockDeadlineRebalance(){
  if (window.__CNMI_V123_LOCK_DEADLINE_REBALANCE__) return;
  window.__CNMI_V123_LOCK_DEADLINE_REBALANCE__ = true;

  const ACTIVE_FROM_MONTH = '2026-07';
  const NO_DUTY_DEADLINE_DAY = 20;
  const NO_DUTY_DEADLINE_MESSAGE = 'หมดเขตลงไม่รับเวรแล้ว กรุณาหาแลก หรือซื้อขายเวรกับเจ้าหน้าที่ภายในหน่วยงาน';

  const pad2 = (n) => {
    try { return pad(n); } catch (_) { return String(n).padStart(2, '0'); }
  };
  const parseSafeDate = (date) => {
    try { return parseDate(date); } catch (_) { return new Date(`${date}T00:00:00`); }
  };
  const toISODate = (dateObj) => {
    try { return toDateInput(dateObj); } catch (_) {
      const y = dateObj.getFullYear();
      const m = pad2(dateObj.getMonth() + 1);
      const d = pad2(dateObj.getDate());
      return `${y}-${m}-${d}`;
    }
  };
  const clone = (obj) => {
    try { return structuredClone(obj); } catch (_) { return JSON.parse(JSON.stringify(obj || null)); }
  };
  const staffIdOf = (s) => String(typeof s === 'object' ? s?.id : s);
  const isActiveRosterMonth = (monthKey) => String(monthKey || '').slice(0, 7) >= ACTIVE_FROM_MONTH;
  const monthKeyOfDate = (date) => String(date || '').slice(0, 7);
  const rosterStaffList = () => {
    const rows = (state.staff || []).filter(s => {
      try { return isRosterEnabled(s); } catch (_) { return true; }
    });
    try { return orderedStaff(rows); } catch (_) { return rows; }
  };
  const staffByIdV123 = (id) => (state.staff || []).find(s => String(s.id) === String(id));
  const staffOrderScore = (s) => {
    try { return staffOrderIndex(s); } catch (_) {}
    const list = rosterStaffList();
    const idx = list.findIndex(x => String(x.id) === String(s?.id));
    return idx >= 0 ? idx : 9999;
  };
  const compareStaff = (a, b) => {
    try { return compareStaffOrder(a, b); } catch (_) { return staffOrderScore(a) - staffOrderScore(b); }
  };
  const isWeekendSafe = (date) => {
    try { return isWeekend(date); } catch (_) { return [0, 6].includes(parseSafeDate(date).getDay()); }
  };
  const isHolidaySafe = (date) => {
    try { return isHolidayDate(date); } catch (_) { return (state.holidays || []).some(h => h.holiday_date === date); }
  };
  const getDateList = (start, end) => {
    try { return datesBetween(start, end); } catch (_) {}
    try { return daysBetween(start, end); } catch (_) {}
    const out = [];
    let d = parseSafeDate(start);
    const last = parseSafeDate(end);
    while (d <= last) {
      out.push(toISODate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  };

  function normalizeDutyCodeV123(code='') {
    const c = String(code || '').trim();
    if (!c) return '';
    if (c === 'ช9-MT') return 'ช9-MT/แตง';
    if (c === 'ช4A' || c === 'ช4-1' || c === 'ช4-MT/แตง1' || c === 'ช4-MT/แตง-1') return 'ช4-MT/แตง 1';
    if (c === 'ช4B' || c === 'ช4-2' || c === 'ช4-MT/แตง2' || c === 'ช4-MT/แตง-2') return 'ช4-MT/แตง 2';
    if (c === 'ช4' || c === 'ช4-MT/แตง') return 'ช4-MT/แตง 1';
    return c;
  }

  function roleForDutyV123(code, date) {
    const c = normalizeDutyCodeV123(code);
    if (c === 'ช9-เคิก') return 'เคิก';
    if (c === 'ช9-MT/แตง' || c.startsWith('ช4')) return 'MT_OR_TANG';
    if (c === 'ชบด3') {
      const holiday = isHolidaySafe(date);
      if (holiday) {
        try {
          const h = (state.holidays || []).find(x => x.holiday_date === date);
          const text = String(h?.title || '');
          if (text.includes('MT_MT_MT') || text.includes('MT / MT / MT')) return 'MT';
        } catch (_) {}
      }
      return 'MT_OR_KERK';
    }
    return 'MT';
  }

  function normalizeAssignmentV123(a) {
    if (!a) return a;
    const duty_code = normalizeDutyCodeV123(a.duty_code);
    return {
      ...a,
      duty_code,
      required_role: a.required_role || roleForDutyV123(duty_code, a.duty_date),
      is_locked: isSlotLockedV123(a)
    };
  }

  function isSlotLockedV123(slot) {
    if (!slot) return false;
    if (slot.is_locked === true || slot.isLocked === true || slot.locked === true) return true;
    const raw = String(slot.is_locked ?? slot.isLocked ?? slot.locked ?? '').toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'locked';
  }

  // Deadline = วันที่ 20 เวลา 23:59:59 ของเดือนก่อนหน้าเดือนเวร เช่น ตาราง ก.ค. ปิด 20 มิ.ย.
  function noDutyDeadlineForRosterMonth(monthKey) {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    return new Date(y, (m || 1) - 2, NO_DUTY_DEADLINE_DAY, 23, 59, 59, 999);
  }

  function isAfterNoDutyDeadlineForMonth(monthKey, now=new Date()) {
    if (!isActiveRosterMonth(monthKey)) return false; // เดือน มิ.ย. และก่อนหน้าไม่เอาเข้าสมการนี้
    return now > noDutyDeadlineForRosterMonth(monthKey);
  }

  function canSilentRebalanceMonth(monthKey, now=new Date()) {
    if (!isActiveRosterMonth(monthKey)) return false;
    if (isAfterNoDutyDeadlineForMonth(monthKey, now)) return false;
    try {
      const { y, m } = getMonthRange(monthKey);
      const month = (state.rosterMonths || []).find(x => Number(x.year) === Number(y) && Number(x.month) === Number(m));
      if (['published', 'locked', 'official'].includes(String(month?.status || '').toLowerCase())) return false;
    } catch (_) {}
    return true;
  }

  // ให้ระบบเดิมที่เช็ค isNoDutyLockedForDate ใช้กฎใหม่: เริ่มบล็อกเฉพาะเดือน ก.ค. เป็นต้นไป
  window.isNoDutyLockedForDate = isNoDutyLockedForDate = function isNoDutyLockedForDateV123(date) {
    if (typeof isAdmin === 'function' && isAdmin() && (!window.CFG || CFG.ADMIN_BYPASS_LEAVE_CLOSE_RULE !== false)) return false;
    return isAfterNoDutyDeadlineForMonth(monthKeyOfDate(date));
  };
  window.isRosterLockedForDate = isRosterLockedForDate = window.isNoDutyLockedForDate;

  function balanceHoursForDutyV123(assignment) {
    const code = normalizeDutyCodeV123(assignment?.duty_code || assignment || '');
    if (code.startsWith('ช4')) return 0; // ช4 = bonus/extra OT ไม่เอาเข้า balance
    if (code === 'ช3A' || code === 'ช3B' || code.startsWith('ช9')) return 8; // base 8 ชม.
    try { return Number(dutyMetrics(assignment).hours || 0); } catch (_) {}
    const date = assignment?.duty_date;
    if (['ชบด1', 'ชบด2', 'ชบด3'].includes(code)) return (isWeekendSafe(date) || isHolidaySafe(date)) ? 24 : 16;
    return 8;
  }

  function monthAssignmentsForBalance(monthKey, assignments) {
    const rows = assignments || (typeof getAssignmentsForMonth === 'function' ? getAssignmentsForMonth(monthKey) : []);
    return (rows || []).map(normalizeAssignmentV123).filter(a => a?.staff_id && monthKeyOfDate(a.duty_date) === monthKey);
  }

  function buildCurrentBalance(assignments, monthKey) {
    const stats = {};
    rosterStaffList().forEach(s => { stats[s.id] = { hours:0, total:0, weekend:0, weekCounts:{} }; });
    monthAssignmentsForBalance(monthKey, assignments).forEach(a => {
      const id = a.staff_id;
      const row = stats[id] = stats[id] || { hours:0, total:0, weekend:0, weekCounts:{} };
      row.hours += balanceHoursForDutyV123(a);
      row.total += 1;
      if (isWeekendSafe(a.duty_date) || isHolidaySafe(a.duty_date)) row.weekend += 1;
      try {
        const wk = weekKeyOf(a.duty_date);
        row.weekCounts[wk] = (row.weekCounts[wk] || 0) + 1;
      } catch (_) {}
    });
    return stats;
  }

  function buildHistoricalDataV123(monthKey, assignments) {
    const activeStaff = rosterStaffList();
    const ids = new Set(activeStaff.map(s => String(s.id)));
    const historyHours = {};
    activeStaff.forEach(s => { historyHours[s.id] = 0; });

    // เริ่มสะสมตั้งแต่ ก.ค. เป็นต้นไปเท่านั้น ห้ามเอาเดือน มิ.ย. เข้ามาทบ
    (state.rosterAssignments || []).map(normalizeAssignmentV123).forEach(a => {
      if (!a?.staff_id || !ids.has(String(a.staff_id))) return;
      const mk = monthKeyOfDate(a.duty_date);
      if (mk < ACTIVE_FROM_MONTH || mk >= String(monthKey)) return;
      historyHours[a.staff_id] = (historyHours[a.staff_id] || 0) + balanceHoursForDutyV123(a);
    });

    const values = activeStaff.map(s => Number(historyHours[s.id] || 0));
    const avg = values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;
    const carryHoursByStaff = {};
    activeStaff.forEach(s => {
      // ค่าบวก = เดือนก่อนทำมากกว่าเฉลี่ย จึงควรถูกลด priority ในการโดนเสียบเวร
      carryHoursByStaff[s.id] = Number(historyHours[s.id] || 0) - avg;
    });

    const current = buildCurrentBalance(assignments, monthKey);
    const currentValues = activeStaff.map(s => Number(current[s.id]?.hours || 0));
    const currentAvg = currentValues.length ? currentValues.reduce((sum, x) => sum + x, 0) / currentValues.length : 0;
    const targetHoursByStaff = {};
    activeStaff.forEach(s => { targetHoursByStaff[s.id] = currentAvg; });

    const specialAdjustmentHoursByStaff = {};
    activeStaff.forEach(s => {
      // รองรับ field เผื่ออนาคต: ค่าบวก = เคยทำเกิน เช่น +8 ชม. จึงเลี่ยงให้ก่อน
      specialAdjustmentHoursByStaff[s.id] = Number(
        s.special_adjustment_hours ?? s.balance_adjustment_hours ?? s.carry_over_hours ?? 0
      ) || 0;
    });

    return { current, carryHoursByStaff, targetHoursByStaff, specialAdjustmentHoursByStaff };
  }

  function hasBlockedLeaveOrNoDutyV123(staffId, date) {
    return (state.leaves || []).some(l => {
      if (String(l.staff_id) !== String(staffId)) return false;
      if (String(l.status || 'active').toLowerCase() === 'cancelled') return false;
      try { return overlapsDate(l, date); } catch (_) { return date >= l.start_date && date <= l.end_date; }
    });
  }

  function canStaffCoverShiftV123(staff, slot, assignments) {
    if (!staff || !slot) return false;
    if (hasBlockedLeaveOrNoDutyV123(staff.id, slot.duty_date)) return false;
    try { return canStaffWorkSlot(staff.id, slot, assignments); } catch (_) {}
    try { if (!isRosterEnabled(staff)) return false; } catch (_) {}
    try { if (!supportsRequiredRole(staff, slot.required_role || roleForDutyV123(slot.duty_code, slot.duty_date))) return false; } catch (_) {}
    try { if (hasSameDayDuty(staff.id, slot.duty_date, assignments, slot)) return false; } catch (_) {}
    try { if (hasAdjacentDuty(staff.id, slot.duty_date, assignments, slot)) return false; } catch (_) {}
    return true;
  }

  // Output หลักตาม prompt: หาเจ้าหน้าที่แทน โดยผ่าน Hard Constraints ก่อน แล้วค่อยเรียง Priority
  window.findBestSubstitute = function findBestSubstitute(shiftDetails, staffList, historicalData={}) {
    const slot = normalizeAssignmentV123(shiftDetails || {});
    const monthKey = monthKeyOfDate(slot.duty_date || state.monthKey);
    const assignments = (shiftDetails?.currentAssignments || historicalData.currentAssignments || getAssignmentsForMonth(monthKey) || [])
      .map(normalizeAssignmentV123);
    const staffRows = (staffList && staffList.length ? staffList : rosterStaffList());
    const hist = {
      ...buildHistoricalDataV123(monthKey, assignments),
      ...historicalData
    };
    const current = hist.current || buildCurrentBalance(assignments, monthKey);
    const allCurrentHours = staffRows.map(s => Number(current[s.id]?.hours || 0));
    const avgCurrent = allCurrentHours.length ? allCurrentHours.reduce((sum, x) => sum + x, 0) / allCurrentHours.length : 0;
    const wk = (() => { try { return weekKeyOf(slot.duty_date); } catch (_) { return ''; } })();

    const candidates = staffRows
      // Hard Constraint 1: ต้องไม่ลา/ไม่รับเวร และไม่ชนเวรเดิม/เวรติดกัน
      // Hard Constraint 2: ต้องมีสิทธิ์/ทักษะตรงกับ duty slot นั้นจริง
      .filter(staff => canStaffCoverShiftV123(staff, slot, assignments))
      .map(staff => {
        const c = current[staff.id] || { hours:0, total:0, weekend:0, weekCounts:{} };
        const target = Number((hist.targetHoursByStaff || {})[staff.id] ?? avgCurrent);
        const quotaGap = target - Number(c.hours || 0); // ค่ายิ่งมาก = เวรยังขาดจากเป้าหมายมาก ให้มาก่อน
        const historicalBurden = Number((hist.carryHoursByStaff || {})[staff.id] || 0); // ค่าบวก = เดือนก่อนทำมากกว่าเฉลี่ย ให้หลบก่อน
        const specialAvoidHours = Number((hist.specialAdjustmentHoursByStaff || {})[staff.id] || 0); // ค่าบวก = มีชดเชย ต้องเลี่ยงให้ก่อน
        return {
          staff,
          quotaGap,
          historicalBurden,
          specialAvoidHours,
          currentHours: Number(c.hours || 0),
          currentTotal: Number(c.total || 0),
          currentWeekend: Number(c.weekend || 0),
          weekCount: Number((c.weekCounts || {})[wk] || 0)
        };
      });

    candidates.sort((a, b) => {
      // Priority 1: ใครยังขาด quota มากกว่า มาก่อน
      const quota = b.quotaGap - a.quotaGap;
      if (Math.abs(quota) > 0.0001) return quota;
      // Priority 2: คนที่เดือนก่อนถูกดึงเยอะกว่า/วันหยุดสะสมน้อยกว่า ให้ลด priority
      const history = a.historicalBurden - b.historicalBurden;
      if (Math.abs(history) > 0.0001) return history;
      // Priority 3: คนที่มี special adjustment เช่น ทำเกินมา 8 ชม. ให้หลบก่อน
      const special = a.specialAvoidHours - b.specialAvoidHours;
      if (Math.abs(special) > 0.0001) return special;
      // ตัว tie-breaker เพื่อไม่ให้กระจุกในสัปดาห์/วันหยุด/คนเดิม
      return (a.weekCount - b.weekCount)
        || (a.currentHours - b.currentHours)
        || (a.currentWeekend - b.currentWeekend)
        || (a.currentTotal - b.currentTotal)
        || compareStaff(a.staff, b.staff);
    });

    return candidates[0]?.staff || null;
  };

  function addAssignmentToBalance(current, slot, staffId) {
    const c = current[staffId] = current[staffId] || { hours:0, total:0, weekend:0, weekCounts:{} };
    c.hours += balanceHoursForDutyV123({ ...slot, staff_id:staffId });
    c.total += 1;
    if (isWeekendSafe(slot.duty_date) || isHolidaySafe(slot.duty_date)) c.weekend += 1;
    try {
      const wk = weekKeyOf(slot.duty_date);
      c.weekCounts[wk] = (c.weekCounts[wk] || 0) + 1;
    } catch (_) {}
  }

  // Auto Assign ใหม่: เริ่มจากตารางที่มีอยู่จริงเสมอ เพื่อรักษาช่องที่ Admin lock ไว้
  window.autoAssignRoster = autoAssignRoster = function autoAssignRosterV123(opts={}) {
    const key = state.monthKey;
    if (!state.rosterDraft || state.rosterDraft.monthKey !== key) {
      const existing = (typeof getAssignmentsForMonth === 'function' ? getAssignmentsForMonth(key) : []) || [];
      state.rosterDraft = { monthKey:key, assignments: clone(existing).map(normalizeAssignmentV123) };
      if (!state.rosterDraft.assignments.length && typeof generateEmptyAssignments === 'function') {
        state.rosterDraft.assignments = clone(generateEmptyAssignments(key)).map(normalizeAssignmentV123);
      }
    } else {
      state.rosterDraft.assignments = (state.rosterDraft.assignments || []).map(normalizeAssignmentV123);
    }

    const assignments = state.rosterDraft.assignments;
    const historical = buildHistoricalDataV123(key, assignments);
    let unfilled = 0;
    let skippedLocked = 0;

    assignments.forEach(slot => {
      // ข้อสำคัญที่สุด: lock ศักดิ์สิทธิ์ ห้ามทับ ห้ามเปลี่ยน ห้าม clear
      if (isSlotLockedV123(slot)) { skippedLocked++; return; }
      // ถ้ามีคนอยู่แล้วแต่ไม่ได้ lock ก็ถือว่า Admin/ระบบเคยใส่ไว้ ไม่ทับซ้ำตอนกด Auto Assign
      if (slot.staff_id) return;

      const chosen = window.findBestSubstitute({ ...slot, currentAssignments: assignments }, rosterStaffList(), historical);
      if (!chosen) { unfilled++; return; }
      slot.staff_id = chosen.id;
      addAssignmentToBalance(historical.current, slot, chosen.id);
    });

    if (opts.silent) return { unfilled, skippedLocked };
    if (unfilled) showToast(`Auto Assign แล้ว โดยไม่แตะช่องที่ล็อกไว้ แต่ยังเหลือ ${unfilled} ช่องที่จัดไม่ได้`);
    else showToast('Auto Assign แล้ว โดยไม่แตะช่องที่ล็อกไว้');
    try { renderPage(); } catch (_) {}
    return { unfilled, skippedLocked };
  };

  async function persistRosterDraftV123(monthKey, status='draft') {
    if (!state.rosterDraft || state.rosterDraft.monthKey !== monthKey || !state.rosterDraft.assignments?.length) return false;
    const { y, m } = getMonthRange(monthKey);
    let month = (state.rosterMonths || []).find(x => Number(x.year) === Number(y) && Number(x.month) === Number(m));
    const monthPayload = { year:y, month:m, status, updated_by:currentStaffId() };
    if (!month) {
      const { data, error } = await sb.from('roster_months').insert({ ...monthPayload, created_by:currentStaffId() }).select().single();
      if (error) throw error;
      month = data;
    } else {
      const { error } = await sb.from('roster_months').update(monthPayload).eq('id', month.id);
      if (error) throw error;
    }
    const rows = state.rosterDraft.assignments.map(a0 => {
      const a = normalizeAssignmentV123(a0);
      const row = {
        roster_month_id: month.id,
        duty_date: a.duty_date,
        duty_code: a.duty_code,
        required_role: a.required_role || roleForDutyV123(a.duty_code, a.duty_date),
        staff_id: a.staff_id || null,
        is_locked: isSlotLockedV123(a),
        updated_by: currentStaffId()
      };
      if (a.id) row.id = a.id;
      return row;
    });
    const { error } = await sb.from('roster_assignments').upsert(rows, { onConflict:'roster_month_id,duty_date,duty_code' });
    if (error) throw error;
    try { await sb.from('roster_assignments').delete().eq('roster_month_id', month.id).in('duty_code', ['ช4A','ช4B','ช9-MT']); } catch (_) {}
    state.rosterDraft = null;
    await loadAllData();
    return true;
  }

  async function silentAutoRebalanceForNoDutyV123(row) {
    if (!row?.staff_id || row.type !== 'ไม่รับเวร') return { adjusted:0, unfilled:0 };
    const months = Array.from(new Set(getDateList(row.start_date, row.end_date).map(monthKeyOfDate)));
    let adjusted = 0;
    let unfilled = 0;

    for (const mk of months) {
      if (!canSilentRebalanceMonth(mk)) continue;
      const oldMonthKey = state.monthKey;
      state.monthKey = mk;
      const targetDates = new Set(getDateList(row.start_date, row.end_date).filter(d => monthKeyOfDate(d) === mk));
      const assignments = clone(getAssignmentsForMonth(mk) || []).map(normalizeAssignmentV123);
      state.rosterDraft = { monthKey:mk, assignments };
      const historical = buildHistoricalDataV123(mk, assignments);
      let changed = false;

      // ถ้า staff ลงไม่รับเวรชนร่างเวร ให้ดึงออกเฉพาะ slot ที่ไม่ lock เท่านั้น
      for (const slot of assignments) {
        if (!targetDates.has(slot.duty_date)) continue;
        if (String(slot.staff_id) !== String(row.staff_id)) continue;
        if (isSlotLockedV123(slot)) continue; // lock ของ Admin ต้องไม่ถูก silent rebalance ทับ
        slot.staff_id = null;
        changed = true;
        const chosen = window.findBestSubstitute({ ...slot, currentAssignments:assignments }, rosterStaffList(), historical);
        if (chosen) {
          slot.staff_id = chosen.id;
          addAssignmentToBalance(historical.current, slot, chosen.id);
        } else {
          unfilled++;
        }
      }

      // เติมช่องว่างอื่นที่ไม่ lock ด้วย logic เดียวกัน แต่ไม่ไปยุ่งกับช่องที่มีคนแล้ว
      for (const slot of assignments) {
        if (isSlotLockedV123(slot) || slot.staff_id) continue;
        const chosen = window.findBestSubstitute({ ...slot, currentAssignments:assignments }, rosterStaffList(), historical);
        if (chosen) {
          slot.staff_id = chosen.id;
          addAssignmentToBalance(historical.current, slot, chosen.id);
          changed = true;
        } else {
          unfilled++;
        }
      }

      if (changed) {
        await persistRosterDraftV123(mk, 'draft');
        adjusted++;
      } else {
        state.rosterDraft = null;
      }
      state.monthKey = oldMonthKey;
    }
    return { adjusted, unfilled };
  }

  function noDutyDeadlineBlockMessage(row) {
    if (!row || row.type !== 'ไม่รับเวร') return '';
    if (typeof isAdmin === 'function' && isAdmin()) return '';
    const blocked = getDateList(row.start_date, row.end_date).some(date => isAfterNoDutyDeadlineForMonth(monthKeyOfDate(date)));
    return blocked ? NO_DUTY_DEADLINE_MESSAGE : '';
  }

  // Override saveLeave เพื่อให้ message หลังวันที่ 20 ตรงตาม requirement และ rebalance แบบ silent หลังบันทึกสำเร็จ
  window.saveLeave = saveLeave = async function saveLeaveV123(form) {
    const fd = new FormData(form);
    const row = {
      staff_id: (typeof isAdmin === 'function' && isAdmin()) ? (fd.get('staff_id') || currentStaffId()) : currentStaffId(),
      type: fd.get('type'),
      start_date: fd.get('start_date'),
      end_date: fd.get('end_date'),
      leave_period: fd.get('leave_period') || 'เต็มวัน',
      note: fd.get('note'),
      contact_phone: fd.get('contact_phone'),
      updated_by: currentStaffId()
    };

    if (row.end_date < row.start_date) return showToast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');

    const blockMessage = noDutyDeadlineBlockMessage(row);
    if (blockMessage) return showToast(blockMessage, { tone:'error' });

    const requestedDates = getDateList(row.start_date, row.end_date);
    if (!(typeof isAdmin === 'function' && isAdmin())) {
      if (row.start_date < todayStr()) return showToast('Staff ไม่สามารถบันทึกย้อนหลังได้ กรุณาให้ Admin บันทึกแทน');
      const limitMsg = (typeof validateNoDutyLimit === 'function') ? validateNoDutyLimit(row, state.editingLeaveId || '') : null;
      if (limitMsg) return showToast(limitMsg, { tone:'error' });
    }

    if (typeof isAdmin === 'function' && isAdmin()) {
      const isBackdated = row.start_date < todayStr();
      row.recorded_by_admin = row.staff_id !== currentStaffId() || isBackdated;
      row.admin_record_reason = String(fd.get('admin_record_reason') || '').trim() || null;
    }

    const hasPublishedDay = requestedDates.some(d => {
      try { return positionDayPublished(d); } catch (_) { return false; }
    });
    if (hasPublishedDay && !(typeof isAdmin === 'function' && isAdmin())) {
      row.note = [row.note, '[ระบบเตือน] วันที่ขอลามีการประกาศตารางตำแหน่งแล้ว กรุณาแจ้งอินชาร์จหรือหัวหน้า'].filter(Boolean).join(' | ');
      showToast('วันที่ขอลามีการประกาศตำแหน่งแล้ว กรุณาแจ้งอินชาร์จหรือหัวหน้าเพื่อปรับหน้างาน');
    }
    if (hasPublishedDay && typeof isAdmin === 'function' && isAdmin()) {
      row.recorded_by_admin = true;
      row.admin_record_reason = row.admin_record_reason || 'Admin บันทึก/แก้ไขรายการหลังประกาศตารางตำแหน่งรายวัน';
    }

    const file = fd.get('file');
    if (file && file.size) row.attachment_path = await uploadFile(file, 'leave');

    setBusy(true, 'กำลังบันทึก');
    const id = state.editingLeaveId;
    let res;
    if (typeof isAdmin === 'function' && isAdmin()) {
      const adminReason = String(row.admin_record_reason || '').trim();
      if ((row.staff_id !== currentStaffId() || row.start_date < todayStr() || hasPublishedDay) && !adminReason) {
        setBusy(false);
        return showToast('กรุณาระบุเหตุผลที่ Admin บันทึกแทน/ย้อนหลัง เพื่อให้ Audit Log ชัดเจน');
      }
      res = await sb.rpc('admin_upsert_leave_v32', {
        p_id: id || null,
        p_staff_id: row.staff_id,
        p_type: row.type,
        p_start_date: row.start_date,
        p_end_date: row.end_date,
        p_leave_period: row.leave_period,
        p_note: row.note || null,
        p_contact_phone: row.contact_phone || null,
        p_attachment_path: row.attachment_path || null,
        p_admin_record_reason: adminReason || null,
        p_recorded_by_admin: true
      });
      if (res.error && (String(res.error.message || '').includes('admin_upsert_leave_v32') || String(res.error.message || '').includes('Could not find the function') || String(res.error.message || '').includes('schema cache'))) {
        const directRow = { ...row, recorded_by_admin:true, admin_record_reason:adminReason || row.admin_record_reason || 'Admin บันทึกแทน', updated_by:currentStaffId() };
        res = id ? await sb.from('leave_requests').update(directRow).eq('id', id) : await sb.from('leave_requests').insert({ ...directRow, created_by:currentStaffId(), status:'active' });
      }
    } else {
      res = id ? await sb.from('leave_requests').update(row).eq('id', id) : await sb.from('leave_requests').insert({ ...row, created_by:currentStaffId(), status:'active' });
    }
    setBusy(false);
    if (res.error) return showToast(friendlyDbError(res.error));

    state.editingLeaveId = null;
    await loadAllData();

    let rebalance = { adjusted:0, unfilled:0 };
    try { rebalance = await silentAutoRebalanceForNoDutyV123(row); }
    catch (err) { console.warn('V123 silent rebalance failed', err); }

    await loadAllData();
    renderPage();

    const backdated = (typeof isAdmin === 'function' && isAdmin()) && row.start_date < todayStr();
    if (row.type === 'ไม่รับเวร' && rebalance.adjusted) {
      showToast(rebalance.unfilled ? `บันทึกแล้ว ระบบเกลี่ยเวรร่างให้อัตโนมัติ แต่ยังเหลือ ${rebalance.unfilled} ช่องที่ต้องจัดมือ` : 'บันทึกแล้ว ระบบเกลี่ยเวรร่างให้อัตโนมัติ');
    } else {
      showToast(backdated ? 'บันทึกลาย้อนหลังแทนเจ้าหน้าที่แล้ว' : 'บันทึกแล้ว');
    }
  };
})();
