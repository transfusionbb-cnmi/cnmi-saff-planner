/* =========================
   V255 Personal Permission Enforcement for Position Plans
   - A staff member with no eligible positions in the active Slot set is excluded from Auto Assign counts.
   - Existing current/future assignments that conflict with newly saved personal permissions are removed.
   - Stale invalid assignments are hidden from the monthly matrix and are not saved back.
   - Historical assignments before today are preserved.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V255_PERSONAL_PERMISSION_ENFORCE_PLAN';
  if (window.__CNMI_V255_PERSONAL_PERMISSION_ENFORCE_PLAN__) return;
  window.__CNMI_V255_PERSONAL_PERMISSION_ENFORCE_PLAN__ = true;

  function appState(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function todayKey(){
    try { return todayStr(); }
    catch (_) {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function friendly(err){
    try { return friendlyDbError(err); }
    catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); }
  }
  function staffById(id){
    const sid = String(id || '');
    return (appState()?.staff || []).find(s => String(s?.id || '') === sid) || null;
  }
  function codeOf(row){ return String(row?.position_code || row?.code || '').trim(); }
  function isReviewCode(code){ return !code || code === 'รอตรวจสอบ'; }
  function templateFor(row){
    const code = codeOf(row);
    const date = normDate(row?.work_date);
    try { return positionTemplateByCode(code, date) || row || {}; }
    catch (_) { return row || {}; }
  }
  function eligibilityKey(row){
    const code = codeOf(row);
    const tpl = templateFor(row);
    const raw = String(tpl?.eligibility_code || row?.eligibility_code || code || '').trim();
    if (!raw) return '';
    try {
      if (typeof hasOuting === 'function' && hasOuting(normDate(row?.work_date)) && !raw.startsWith('OUTING:')) {
        const out = String(tpl?.zone || row?.zone || '').trim() === 'ออกหน่วย' || tpl?.is_outing === true;
        if (out) return `OUTING:${raw.replace(/^OUTING:/, '')}`;
      }
    } catch (_) {}
    return raw;
  }
  function assignmentAllowed(row){
    const code = codeOf(row);
    if (isReviewCode(code)) return true;
    const staff = staffById(row?.staff_id);
    if (!staff) return false;
    const tpl = templateFor(row);
    const key = eligibilityKey({ ...row, ...tpl, position_code:code, work_date:row?.work_date });
    try {
      return isDailyPositionEnabled(staff)
        && positionRuleOk(staff, tpl?.main_rule || row?.main_rule || '')
        && positionEligible(staff, key || code);
    } catch (_) { return false; }
  }
  function templateAllowedForStaff(staff, template, date){
    if (!staff || !template) return false;
    const row = { ...template, staff_id:staff.id, work_date:normDate(date), position_code:template.code || template.position_code };
    return assignmentAllowed(row);
  }
  function hasAnyEligible(staff, date, templates){
    return (templates || []).some(p => templateAllowedForStaff(staff, p, date));
  }
  function cloneRows(rows){ return (Array.isArray(rows) ? rows : []).map(r => ({ ...r })); }
  function codesKey(rows){ return (rows || []).map(r => String(r?.code || r?.position_code || '')).filter(Boolean).join('|'); }

  const oldExpected231 = window.cnmiV231?.expectedTemplatesForDate231 || null;
  const oldWeekly233 = window.cnmiV233?.weeklyAvailableStaff || null;
  const oldWeekly231 = window.cnmiV231?.weeklyAvailableStaff231 || null;

  function originalExpected(date){
    const d = normDate(date);
    try {
      const rows = oldExpected231 ? oldExpected231(d) : (typeof monthPositionRoleOptionsForDate === 'function' ? monthPositionRoleOptionsForDate(d, '') : []);
      return cloneRows(rows);
    } catch (_) { return []; }
  }
  function originalWeeklyStaff(date){
    const d = normDate(date);
    try {
      const rows = oldWeekly233 ? oldWeekly233(d) : oldWeekly231 ? oldWeekly231(d) : [];
      return Array.isArray(rows) ? rows.slice() : [];
    } catch (_) { return []; }
  }
  function runtimeDaySlots(count){
    const n = Math.max(8, Math.min(14, Math.round(Number(count) || 8)));
    try {
      const sets = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS;
      if (Array.isArray(sets?.[n]) && sets[n].length) return cloneRows(sets[n]);
    } catch (_) {}
    return [];
  }
  function isOutingDate(date){ try { return !!hasOuting(normDate(date)); } catch (_) { return false; } }
  function effectiveExpected(date){
    const d = normDate(date);
    let templates = originalExpected(d);
    if (!templates.length || isOutingDate(d)) return templates;
    const source = originalWeeklyStaff(d);
    if (!source.length) return templates;

    // Iterate because reducing the Slot set can also change which staff still have an eligible position.
    for (let i = 0; i < 4; i += 1) {
      const eligibleStaff = source.filter(st => hasAnyEligible(st, d, templates));
      const target = Math.min(templates.length, eligibleStaff.length);
      if (target >= templates.length || target < 8) break;
      const next = runtimeDaySlots(target);
      if (!next.length || codesKey(next) === codesKey(templates)) break;
      templates = next;
    }
    return templates;
  }
  function effectiveWeeklyStaff(date){
    const d = normDate(date);
    const templates = effectiveExpected(d);
    return originalWeeklyStaff(d).filter(st => hasAnyEligible(st, d, templates));
  }

  // V237 reads these APIs dynamically for count rows and Slot options.
  try {
    if (window.cnmiV231) window.cnmiV231.expectedTemplatesForDate231 = effectiveExpected;
    if (window.cnmiV233) window.cnmiV233.weeklyAvailableStaff = effectiveWeeklyStaff;
  } catch (_) {}

  function sanitizeRows(rows, options={}){
    const invalid = [];
    const cleaned = [];
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const code = codeOf(row);
      const date = normDate(row?.work_date);
      const staff = staffById(row?.staff_id);
      if (!date || !staff) { cleaned.push(row); return; }
      if (isReviewCode(code)) {
        if (options.dropZeroPermissionReview !== false && !hasAnyEligible(staff, date, effectiveExpected(date))) {
          invalid.push({ ...row, _v255_reason:'no_eligible_position' });
          return;
        }
        cleaned.push(row);
        return;
      }
      if (!assignmentAllowed(row)) {
        invalid.push({ ...row, _v255_reason:'permission_revoked' });
        return;
      }
      cleaned.push(row);
    });
    return { rows:cleaned, invalid };
  }

  const oldBuildMonthly = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
  if (oldBuildMonthly && !oldBuildMonthly.__v255PermissionEnforced) {
    const wrappedBuild = function buildMonthlyPositionDraftV255(){
      const draft = oldBuildMonthly.apply(this, arguments) || { monthKey:String(arguments[0] || '').slice(0,7), rows:[] };
      const result = sanitizeRows(draft.rows || [], { dropZeroPermissionReview:true });
      return { ...draft, rows:result.rows, invalidPermissionRowsV255:result.invalid.length };
    };
    wrappedBuild.__v255PermissionEnforced = true;
    window.buildMonthlyPositionDraft = wrappedBuild;
    try { buildMonthlyPositionDraft = wrappedBuild; } catch (_) {}
  }

  const oldRenderMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
  if (oldRenderMatrix && !oldRenderMatrix.__v255PermissionEnforced) {
    const wrappedRender = function renderMonthPositionMatrixV255(rows, dates){
      const result = sanitizeRows(rows || [], { dropZeroPermissionReview:true });
      let html = String(oldRenderMatrix.call(this, result.rows, dates) || '');
      if (result.invalid.length) {
        const staffCount = new Set(result.invalid.map(r => String(r?.staff_id || '')).filter(Boolean)).size;
        const note = `<div class="notice soft-notice compact v255-invalid-position-note"><b>ระบบซ่อนตำแหน่งเดิมที่ขัดกับสิทธิ์แล้ว ${result.invalid.length} ช่อง</b><span> • ${staffCount} คน • กด “บันทึก/ประกาศให้ Staff เห็น” เพื่อยืนยันตารางที่แก้แล้ว</span></div>`;
        html = note + html;
      }
      return html;
    };
    wrappedRender.__v255PermissionEnforced = true;
    window.renderMonthPositionMatrix = wrappedRender;
    try { renderMonthPositionMatrix = wrappedRender; } catch (_) {}
  }

  const oldSaveMonthly = window.saveMonthlyPositions || (typeof saveMonthlyPositions === 'function' ? saveMonthlyPositions : null);
  if (oldSaveMonthly && !oldSaveMonthly.__v255PermissionEnforced) {
    const wrappedSaveMonthly = async function saveMonthlyPositionsV255(){
      const st = appState();
      const key = String(st?.positionMonthKey || st?.monthKey || todayKey().slice(0,7)).slice(0,7);
      const source = st?.monthPositionDraft?.monthKey === key
        ? (st.monthPositionDraft.rows || [])
        : (st?.positions || []).filter(r => normDate(r?.work_date).startsWith(key));
      const cleaned = sanitizeRows(source, { dropZeroPermissionReview:true });
      if (st) st.monthPositionDraft = { ...(st.monthPositionDraft || {}), monthKey:key, rows:cleaned.rows, permissionSanitizedV255:true };
      return oldSaveMonthly.apply(this, arguments);
    };
    wrappedSaveMonthly.__v255PermissionEnforced = true;
    window.saveMonthlyPositions = wrappedSaveMonthly;
    try { saveMonthlyPositions = wrappedSaveMonthly; } catch (_) {}
  }

  async function deleteInvalidFutureAssignments(staffIds){
    const ids = Array.from(new Set((staffIds || []).map(String).filter(Boolean)));
    if (!ids.length || typeof sb === 'undefined' || !sb) return 0;
    let removed = 0;
    for (const sid of ids) {
      const res = await sb.from('daily_positions').select('*').eq('staff_id', sid).gte('work_date', todayKey());
      if (res.error) throw res.error;
      const bad = (res.data || []).filter(row => !assignmentAllowed(row));
      if (!bad.length) continue;
      const rowIds = bad.map(r => r?.id).filter(v => v !== null && v !== undefined && v !== '');
      if (rowIds.length === bad.length) {
        for (let i = 0; i < rowIds.length; i += 100) {
          const del = await sb.from('daily_positions').delete().in('id', rowIds.slice(i, i + 100));
          if (del.error) throw del.error;
        }
      } else {
        for (const row of bad) {
          let q = sb.from('daily_positions').delete().eq('staff_id', sid).eq('work_date', normDate(row.work_date)).eq('position_code', codeOf(row));
          const del = await q;
          if (del.error) throw del.error;
        }
      }
      removed += bad.length;
    }
    return removed;
  }

  function desiredPermissionSnapshot(){
    return Array.from(document.querySelectorAll('input[data-eligibility]')).map(cb => ({
      staffId:String(cb.dataset.staffId || ''),
      code:String(cb.dataset.positionCode || '').trim(),
      checked:!!cb.checked
    })).filter(x => x.staffId && x.code);
  }
  function permissionSaveSucceeded(snapshot){
    return (snapshot || []).every(item => {
      const st = staffById(item.staffId);
      if (!st) return false;
      try { return !!positionEligible(st, item.code) === item.checked; }
      catch (_) { return false; }
    });
  }
  function sanitizeLocalPositionState(){
    const st = appState();
    if (!st) return;
    if (Array.isArray(st.positions)) st.positions = sanitizeRows(st.positions, { dropZeroPermissionReview:true }).rows;
    if (Array.isArray(st.monthPositionDraft?.rows)) st.monthPositionDraft.rows = sanitizeRows(st.monthPositionDraft.rows, { dropZeroPermissionReview:true }).rows;
  }

  const oldSaveEligibility = window.savePositionEligibility || (typeof savePositionEligibility === 'function' ? savePositionEligibility : null);
  if (oldSaveEligibility && !oldSaveEligibility.__v255PermissionEnforced) {
    const wrappedSaveEligibility = async function savePositionEligibilityV255(){
      const snapshot = desiredPermissionSnapshot();
      const staffIds = snapshot.map(x => x.staffId);
      await oldSaveEligibility.apply(this, arguments);
      if (!permissionSaveSucceeded(snapshot)) return;
      try {
        sanitizeLocalPositionState();
        const removed = await deleteInvalidFutureAssignments(staffIds);
        if (removed > 0) {
          try { await loadAllData(); } catch (_) {}
          sanitizeLocalPositionState();
          try {
            const st = appState();
            if (st) { st.page = 'positionManagement'; st.positionManagementSubtabV244 = 'permissions'; }
            window.cnmiV244PositionPermissions?.setTab?.('permissions');
            renderPage();
          } catch (_) {}
          toast(`บันทึกสิทธิ์แล้ว และนำตำแหน่งปัจจุบัน/อนาคตที่ไม่ตรงสิทธิ์ออก ${removed} รายการ`);
        }
      } catch (err) {
        console.error(`${VERSION}: future assignment cleanup failed`, err);
        toast('บันทึกสิทธิ์สำเร็จ แต่ล้างตำแหน่งเดิมไม่ครบ: ' + friendly(err), 'error');
      }
    };
    wrappedSaveEligibility.__v255PermissionEnforced = true;
    window.savePositionEligibility = wrappedSaveEligibility;
    try { savePositionEligibility = wrappedSaveEligibility; } catch (_) {}
  }

  // Keep APIs patched after delayed renders/config reloads from older patches.
  [80, 300, 900].forEach(ms => setTimeout(() => {
    try {
      if (window.cnmiV231) window.cnmiV231.expectedTemplatesForDate231 = effectiveExpected;
      if (window.cnmiV233) window.cnmiV233.weeklyAvailableStaff = effectiveWeeklyStaff;
    } catch (_) {}
  }, ms));

  const style = document.createElement('style');
  style.id = 'cnmi-v255-personal-permission-enforce-style';
  style.textContent = `
    .v255-invalid-position-note{margin:0 0 10px;border-color:#fbbf24;background:#fffbeb;color:#92400e}
    .v255-invalid-position-note span{font-weight:600}
  `;
  document.head.appendChild(style);

  window.cnmiV255 = { assignmentAllowed, effectiveExpected, effectiveWeeklyStaff, sanitizeRows, deleteInvalidFutureAssignments };
  console.info(`${VERSION} loaded`);
})();
