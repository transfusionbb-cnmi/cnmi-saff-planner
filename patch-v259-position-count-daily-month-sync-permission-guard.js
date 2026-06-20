/* =========================
   V259 Position Count + Daily/Month Sync + Permission Guard
   1) "ไม่รับเวร" is not treated as absence in position planning/counting.
   2) Outing-day Slot set follows the effective weekly headcount (12/13/14), including full-week leave reduction.
   3) Saving daily positions immediately updates the same date inside the monthly draft/overview.
   4) Personal position permissions are backed up locally and never overwritten by Slot/template updates.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V259_POSITION_COUNT_DAILY_MONTH_SYNC_PERMISSION_GUARD';
  if (window.__CNMI_V259_POSITION_COUNT_DAILY_MONTH_SYNC_PERMISSION_GUARD__) return;
  window.__CNMI_V259_POSITION_COUNT_DAILY_MONTH_SYNC_PERMISSION_GUARD__ = true;

  const PERMISSION_CACHE_KEY = 'cnmi_v259_position_permission_backup_v1';

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function clone(value){
    try { return structuredClone(value); }
    catch (_) {
      try { return JSON.parse(JSON.stringify(value)); }
      catch (__) { return value; }
    }
  }
  function rowType(row){
    try { return String(leaveDisplayType(row) || '').trim(); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || '').split(':::')[0].trim(); }
  }
  function isNoDutyRow(row){
    return rowType(row) === 'ไม่รับเวร';
  }
  function leaveEffective(row){
    try { return typeof isLeaveEffective === 'function' ? !!isLeaveEffective(row) : true; }
    catch (_) {
      const raw = String(row?.status || row?.approval_status || '').trim();
      const lower = raw.toLowerCase();
      if (['cancelled','canceled','deleted','inactive','void','rejected'].includes(lower)) return false;
      if (['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw)) return false;
      return true;
    }
  }
  function overlaps(row, date){
    const d = normDate(date);
    try { return !!overlapsDate(row, d); }
    catch (_) {
      const start = normDate(row?.start_date || row?.date || row?.work_date);
      const end = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!start && !!end && start <= d && end >= d;
    }
  }
  function realLeaveRecord(staffId, date){
    const st = appState();
    const sid = String(staffId || '');
    const d = normDate(date);
    if (!st || !sid || !d) return null;
    return (Array.isArray(st.leaves) ? st.leaves : []).find(row =>
      String(row?.staff_id || '') === sid
      && leaveEffective(row)
      && !isNoDutyRow(row)
      && overlaps(row, d)
    ) || null;
  }
  function ordered(rows){
    try { return orderedStaff(rows || []); }
    catch (_) { return (rows || []).slice(); }
  }
  function positionEnabledStaff(){
    const st = appState();
    return ordered((st?.staff || []).filter(person => {
      try { return !!isDailyPositionEnabled(person); }
      catch (_) { return !!person?.id && person?.is_active !== false && person?.active !== false && person?.staff_type !== 'แพทย์'; }
    }));
  }
  function realWorkingStaff(date){
    const d = normDate(date);
    return positionEnabledStaff().filter(person => !realLeaveRecord(person.id, d));
  }

  function assignGlobalFunction(name, fn){
    try { window[name] = fn; } catch (_) {}
    try {
      // eslint-disable-next-line no-eval
      (0, eval)(`${name} = window[${JSON.stringify(name)}]`);
    } catch (_) {}
  }
  function withPositionLeaveRules(callback){
    const oldActive = window.activeLeaveRecordOn || (typeof activeLeaveRecordOn === 'function' ? activeLeaveRecordOn : null);
    const oldIsActive = window.isActiveLeaveOn || (typeof isActiveLeaveOn === 'function' ? isActiveLeaveOn : null);
    const oldWorking = window.dailyWorkingStaff || (typeof dailyWorkingStaff === 'function' ? dailyWorkingStaff : null);
    const replacementActive = function activePositionLeaveRecordOn(staffId, date){ return realLeaveRecord(staffId, date); };
    const replacementIsActive = function isActivePositionLeaveOn(staffId, date){ return !!realLeaveRecord(staffId, date); };
    const replacementWorking = function dailyPositionWorkingStaff(date){ return realWorkingStaff(date); };
    assignGlobalFunction('activeLeaveRecordOn', replacementActive);
    assignGlobalFunction('isActiveLeaveOn', replacementIsActive);
    assignGlobalFunction('dailyWorkingStaff', replacementWorking);
    try {
      return callback();
    } finally {
      if (oldActive) assignGlobalFunction('activeLeaveRecordOn', oldActive);
      if (oldIsActive) assignGlobalFunction('isActiveLeaveOn', oldIsActive);
      if (oldWorking) assignGlobalFunction('dailyWorkingStaff', oldWorking);
    }
  }

  function hasOutingSafe(date){
    try { return !!hasOuting(normDate(date)); }
    catch (_) { return false; }
  }
  function baseCode(value){
    try { return String(positionBaseCode(value) || '').trim(); }
    catch (_) { return String(value || '').replace(/\s+#\d+$/, '').trim(); }
  }
  function outingBucket(value){
    const n = Number(value || 14);
    if (n <= 12) return 12;
    if (n <= 13) return 13;
    return 14;
  }
  function effectiveWeeklySlotCount(date){
    return withPositionLeaveRules(() => {
      try {
        const count = Number(window.cnmiV231?.weekSlotCount231?.(normDate(date)) || 0);
        if (count) return Math.max(8, Math.min(14, count));
      } catch (_) {}
      try {
        const list = window.cnmiV233?.weeklyAvailableStaff?.(normDate(date));
        if (Array.isArray(list) && list.length) return Math.max(8, Math.min(14, list.length));
      } catch (_) {}
      return Math.max(8, Math.min(14, realWorkingStaff(date).length || 14));
    });
  }
  function outingSlotsForCount(count){
    const bucket = outingBucket(count);
    try {
      const rows = window.cnmiDayPositionSlotsV218?.outingSlotsV232?.(bucket);
      if (Array.isArray(rows) && rows.length) return clone(rows).slice(0, bucket);
    } catch (_) {}
    try {
      const cfg = window.cnmiV224?.currentConfigs?.() || appState()?.slotTemplateV224?.configs;
      const rows = cfg?.outing_by_count?.[bucket] || cfg?.outing_by_count?.[String(bucket)] || cfg?.outing || [];
      if (Array.isArray(rows) && rows.length) return clone(rows).slice(0, bucket);
    } catch (_) {}
    return [];
  }
  function currentSlotConfig(){
    const st = appState();
    if (st?.slotTemplateV224?.configs) return st.slotTemplateV224.configs;
    try { return window.cnmiV224?.currentConfigs?.() || null; }
    catch (_) { return null; }
  }

  // Render daily position page under position-only leave rules.
  // On outing dates, temporarily feed V227 the 12/13/14 outing template matching the effective week count.
  try {
    const oldRenderPositions = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (oldRenderPositions && !oldRenderPositions.__v259PositionCountFixed) {
      const wrappedRenderPositions = function renderPositionsPageV259(){
        const st = appState();
        const date = normDate(st?.positionDate || (typeof todayStr === 'function' ? todayStr() : ''));
        return withPositionLeaveRules(() => {
          const cfg = currentSlotConfig();
          const originalOuting = cfg && Array.isArray(cfg.outing) ? cfg.outing : null;
          const originalPositions = st && Array.isArray(st.positions) ? st.positions : null;
          try {
            if (date && hasOutingSafe(date)) {
              const effective = effectiveWeeklySlotCount(date);
              const outingRows = outingSlotsForCount(effective);
              if (cfg && outingRows.length) cfg.outing = clone(outingRows);

              // Old 14-slot rows must not return as "extra-plan" after this week has been reduced to 13.
              if (st && originalPositions && outingRows.length) {
                const allowed = new Set(outingRows.map(row => baseCode(row?.code || row?.position_code)).filter(Boolean));
                st.positions = originalPositions.filter(row => {
                  if (normDate(row?.work_date) !== date) return true;
                  return allowed.has(baseCode(row?.position_code || row?.code));
                });
              }
            }
            let html = String(oldRenderPositions.apply(this, arguments) || '');
            html = html
              .replace(/หลังหักลา\/ไม่รับเวรแล้ว/g, 'หลังหักวันลาจริงแล้ว (ไม่รับเวรไม่นับ)')
              .replace(/คนลาและงานจริง/g, 'วันลาจริงและงานจริง');
            return html;
          } finally {
            if (cfg && originalOuting) cfg.outing = originalOuting;
            if (st && originalPositions) st.positions = originalPositions;
          }
        });
      };
      wrappedRenderPositions.__v259PositionCountFixed = true;
      assignGlobalFunction('renderPositionsPage', wrappedRenderPositions);
    }
  } catch (error) {
    console.warn(`${VERSION}: daily render wrapper skipped`, error);
  }

  // Monthly renderer and generator must also ignore "ไม่รับเวร" as a position absence.
  try {
    const oldRenderMonth = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
    if (oldRenderMonth && !oldRenderMonth.__v259NoDutyIgnored) {
      const wrappedRenderMonth = function renderMonthPositionMatrixV259(){
        return withPositionLeaveRules(() => oldRenderMonth.apply(this, arguments));
      };
      wrappedRenderMonth.__v259NoDutyIgnored = true;
      assignGlobalFunction('renderMonthPositionMatrix', wrappedRenderMonth);
    }
  } catch (_) {}

  try {
    const oldBuildMonth = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (oldBuildMonth && !oldBuildMonth.__v259NoDutyIgnored) {
      const wrappedBuildMonth = function buildMonthlyPositionDraftV259(){
        return withPositionLeaveRules(() => oldBuildMonth.apply(this, arguments));
      };
      wrappedBuildMonth.__v259NoDutyIgnored = true;
      assignGlobalFunction('buildMonthlyPositionDraft', wrappedBuildMonth);
    }
  } catch (_) {}

  function dateRowsSignature(rows){
    return (rows || []).map(row => [
      String(row?.id || ''),
      normDate(row?.work_date),
      String(row?.position_code || row?.code || ''),
      String(row?.staff_id || ''),
      String(row?.zone || '')
    ].join('|')).sort().join('~~');
  }
  function syncDailyRowsIntoMonthlyDraft(date){
    const st = appState();
    const d = normDate(date);
    if (!st || !d) return;
    const key = d.slice(0, 7);
    const savedRows = (st.positions || []).filter(row => normDate(row?.work_date) === d).map(row => ({ ...row }));
    if (st.monthPositionDraft?.monthKey === key && Array.isArray(st.monthPositionDraft.rows)) {
      st.monthPositionDraft = {
        ...st.monthPositionDraft,
        rows: st.monthPositionDraft.rows.filter(row => normDate(row?.work_date) !== d).concat(savedRows),
        dailySyncedV259: true
      };
    }
    st.positionMonthKey = st.positionMonthKey || key;
  }

  // V213 saves correctly to daily_positions, but its old month draft can keep showing the pre-edit assignment.
  try {
    const oldSavePositions = window.savePositions || (typeof savePositions === 'function' ? savePositions : null);
    if (oldSavePositions && !oldSavePositions.__v259MonthSynced) {
      const wrappedSavePositions = async function savePositionsV259(){
        const st = appState();
        const date = normDate(document.getElementById('positionDateInput')?.value || st?.positionDate || '');
        const before = dateRowsSignature((st?.positions || []).filter(row => normDate(row?.work_date) === date));
        const result = await oldSavePositions.apply(this, arguments);
        const after = dateRowsSignature((st?.positions || []).filter(row => normDate(row?.work_date) === date));
        if (date && before !== after) syncDailyRowsIntoMonthlyDraft(date);
        return result;
      };
      wrappedSavePositions.__v259MonthSynced = true;
      assignGlobalFunction('savePositions', wrappedSavePositions);
    }
  } catch (error) {
    console.warn(`${VERSION}: daily save wrapper skipped`, error);
  }

  function permissionKey(row){
    return `${String(row?.staff_id || '')}|${String(row?.position_code || '').trim()}`;
  }
  function normalizePermissionRows(rows){
    const latest = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      if (!row?.staff_id || !row?.position_code) return;
      const key = permissionKey(row);
      const old = latest.get(key);
      const oldTime = old ? Date.parse(old.updated_at || old.modified_at || old.created_at || '') || 0 : -1;
      const newTime = Date.parse(row.updated_at || row.modified_at || row.created_at || '') || 0;
      if (!old || newTime > oldTime || (newTime === oldTime && index >= old.__v259Index)) {
        latest.set(key, { ...row, is_eligible:row.is_eligible === true || String(row.is_eligible).toLowerCase() === 'true', __v259Index:index });
      }
    });
    return Array.from(latest.values()).map(row => { const out = { ...row }; delete out.__v259Index; return out; });
  }
  function readPermissionCache(){
    try {
      const parsed = JSON.parse(localStorage.getItem(PERMISSION_CACHE_KEY) || '{}');
      return normalizePermissionRows(parsed?.rows || []);
    } catch (_) { return []; }
  }
  function cachePermissions(){
    const st = appState();
    const rows = normalizePermissionRows(st?.positionEligibility || []);
    if (!rows.length) return;
    try {
      localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify({ version:1, saved_at:new Date().toISOString(), rows }));
    } catch (_) {}
  }
  function restoreMissingPermissionsFromCache(){
    const st = appState();
    if (!st) return 0;
    const serverRows = normalizePermissionRows(st.positionEligibility || []);
    const cachedRows = readPermissionCache();
    if (!cachedRows.length) {
      st.positionEligibility = serverRows;
      return 0;
    }
    const keys = new Set(serverRows.map(permissionKey));
    const validStaff = new Set((st.staff || []).map(person => String(person?.id || '')).filter(Boolean));
    const missing = cachedRows.filter(row => !keys.has(permissionKey(row)) && (!validStaff.size || validStaff.has(String(row.staff_id))));
    st.positionEligibility = serverRows.concat(missing.map(row => ({ ...row, __restored_from_v259_cache:true })));
    return missing.length;
  }

  // Preserve a local safety copy across ZIP/version updates. Server rows always win; cache fills only missing keys.
  cachePermissions();
  try {
    const oldLoadAllData = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
    if (oldLoadAllData && !oldLoadAllData.__v259PermissionGuard) {
      const wrappedLoadAllData = async function loadAllDataV259(){
        cachePermissions();
        const result = await oldLoadAllData.apply(this, arguments);
        restoreMissingPermissionsFromCache();
        try { window.cnmiV258?.normalizeStateRows?.(); } catch (_) {}
        cachePermissions();
        return result;
      };
      wrappedLoadAllData.__v259PermissionGuard = true;
      assignGlobalFunction('loadAllData', wrappedLoadAllData);
    }
  } catch (_) {}

  try {
    const oldSaveEligibility = window.savePositionEligibility || (typeof savePositionEligibility === 'function' ? savePositionEligibility : null);
    if (oldSaveEligibility && !oldSaveEligibility.__v259PermissionGuard) {
      const wrappedSaveEligibility = async function savePositionEligibilityV259(){
        const result = await oldSaveEligibility.apply(this, arguments);
        cachePermissions();
        return result;
      };
      wrappedSaveEligibility.__v259PermissionGuard = true;
      assignGlobalFunction('savePositionEligibility', wrappedSaveEligibility);
    }
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v259-position-count-sync-style';
  style.textContent = `
    .v225-position-note{line-height:1.45}
    .v225-compare-cards>div b{font-variant-numeric:tabular-nums}
  `;
  document.head.appendChild(style);

  window.cnmiV259 = {
    realLeaveRecord,
    realWorkingStaff,
    withPositionLeaveRules,
    effectiveWeeklySlotCount,
    outingSlotsForCount,
    syncDailyRowsIntoMonthlyDraft,
    cachePermissions,
    restoreMissingPermissionsFromCache
  };
  console.info(`${VERSION} loaded`);
})();
