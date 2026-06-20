/* =========================
   V255 Personal Permission Enforcement for Position Plans
   Optimized in V257
   - Staff with no eligible position in the active Slot set are excluded from monthly counts.
   - Current/future assignments that conflict with newly saved permissions are removed.
   - Invalid saved assignments are hidden and are not saved back.
   - Historical assignments before today are preserved.
   - Uses per-render caches and does not replace the Slot-template resolver, preventing the monthly page from freezing.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V255_PERSONAL_PERMISSION_ENFORCE_PLAN_V257_OPTIMIZED';
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
  function cloneRows(rows){ return (Array.isArray(rows) ? rows : []).map(r => ({ ...r })); }

  const oldExpected231 = window.cnmiV231?.expectedTemplatesForDate231 || null;
  const oldWeekly233 = window.cnmiV233?.weeklyAvailableStaff || null;
  const oldWeekly231 = window.cnmiV231?.weeklyAvailableStaff231 || null;

  let expectedCache = new Map();
  let anyEligibleCache = new Map();
  let weeklyCache = new Map();

  function resetPermissionCaches(){
    expectedCache = new Map();
    anyEligibleCache = new Map();
    weeklyCache = new Map();
  }
  function originalExpected(date){
    const d = normDate(date);
    if (expectedCache.has(d)) return expectedCache.get(d);
    let rows = [];
    try {
      rows = oldExpected231 ? oldExpected231(d) : (typeof monthPositionRoleOptionsForDate === 'function' ? monthPositionRoleOptionsForDate(d, '') : []);
    } catch (_) { rows = []; }
    const clean = cloneRows(rows);
    expectedCache.set(d, clean);
    return clean;
  }
  function originalWeeklyStaff(date){
    const d = normDate(date);
    try {
      const rows = oldWeekly233 ? oldWeekly233(d) : oldWeekly231 ? oldWeekly231(d) : [];
      return Array.isArray(rows) ? rows.slice() : [];
    } catch (_) { return []; }
  }
  function hasAnyEligible(staff, date, templates){
    if (!staff) return false;
    const d = normDate(date);
    const sid = String(staff?.id || '');
    const list = Array.isArray(templates) ? templates : originalExpected(d);
    const signature = list.map(p => String(p?.code || p?.position_code || '')).join('|');
    const key = `${d}|${sid}|${signature}`;
    if (anyEligibleCache.has(key)) return anyEligibleCache.get(key);
    const allowed = list.some(p => templateAllowedForStaff(staff, p, d));
    anyEligibleCache.set(key, allowed);
    return allowed;
  }
  function effectiveWeeklyStaff(date){
    const d = normDate(date);
    if (weeklyCache.has(d)) return weeklyCache.get(d).slice();
    const source = originalWeeklyStaff(d);
    const templates = originalExpected(d);
    const filtered = templates.length ? source.filter(st => hasAnyEligible(st, d, templates)) : source;
    weeklyCache.set(d, filtered.slice());
    return filtered;
  }

  // Important: only replace the weekly staff source. Do not replace
  // expectedTemplatesForDate231 because the monthly matrix calls both APIs many
  // times per cell; replacing both created a recursive/heavy render path.
  function applyFastWeeklyApi(){
    try {
      if (window.cnmiV233) window.cnmiV233.weeklyAvailableStaff = effectiveWeeklyStaff;
    } catch (_) {}
  }
  applyFastWeeklyApi();

  function sanitizeRows(rows, options={}){
    const invalid = [];
    const cleaned = [];
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const code = codeOf(row);
      const date = normDate(row?.work_date);
      const staff = staffById(row?.staff_id);
      if (!date || !staff) { cleaned.push(row); return; }
      if (isReviewCode(code)) {
        if (options.dropZeroPermissionReview !== false && !hasAnyEligible(staff, date, originalExpected(date))) {
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
      resetPermissionCaches();
      applyFastWeeklyApi();
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
      resetPermissionCaches();
      applyFastWeeklyApi();
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
      resetPermissionCaches();
      applyFastWeeklyApi();
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
    resetPermissionCaches();
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
          const del = await sb.from('daily_positions').delete()
            .eq('staff_id', sid)
            .eq('work_date', normDate(row.work_date))
            .eq('position_code', codeOf(row));
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
    resetPermissionCaches();
    applyFastWeeklyApi();
    if (Array.isArray(st.positions)) st.positions = sanitizeRows(st.positions, { dropZeroPermissionReview:true }).rows;
    if (Array.isArray(st.monthPositionDraft?.rows)) st.monthPositionDraft.rows = sanitizeRows(st.monthPositionDraft.rows, { dropZeroPermissionReview:true }).rows;
  }

  const oldSaveEligibility = window.savePositionEligibility || (typeof savePositionEligibility === 'function' ? savePositionEligibility : null);
  if (oldSaveEligibility && !oldSaveEligibility.__v255PermissionEnforced) {
    const wrappedSaveEligibility = async function savePositionEligibilityV255(){
      const snapshot = desiredPermissionSnapshot();
      const staffIds = snapshot.map(x => x.staffId);
      await oldSaveEligibility.apply(this, arguments);
      resetPermissionCaches();
      applyFastWeeklyApi();
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

  // Re-apply only the fast weekly staff hook after delayed configuration renders.
  [80, 300, 900].forEach(ms => setTimeout(() => {
    resetPermissionCaches();
    applyFastWeeklyApi();
  }, ms));

  const style = document.createElement('style');
  style.id = 'cnmi-v255-personal-permission-enforce-style';
  style.textContent = `
    .v255-invalid-position-note{margin:0 0 10px;border-color:#fbbf24;background:#fffbeb;color:#92400e}
    .v255-invalid-position-note span{font-weight:600}
  `;
  document.head.appendChild(style);

  window.cnmiV255 = {
    assignmentAllowed,
    effectiveWeeklyStaff,
    sanitizeRows,
    deleteInvalidFutureAssignments,
    resetPermissionCaches,
    optimizedInV257:true
  };
  console.info(`${VERSION} loaded`);
})();
