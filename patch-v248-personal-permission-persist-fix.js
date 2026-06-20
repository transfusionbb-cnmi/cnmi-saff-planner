/* =========================
   V248 Personal Permission Persist Fix
   - Fixes checkbox values that appear to revert after save/scroll on mobile.
   - Normalizes duplicate daily_position_eligibility rows by latest update.
   - Saves visible personal permissions with delete+insert per staff/slot set to prevent stale duplicates.
   - Keeps checkbox card visual state in sync immediately after tapping.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V248_PERSONAL_PERMISSION_PERSIST_FIX';
  if (window.__CNMI_V248_PERSONAL_PERMISSION_PERSIST_FIX__) return;
  window.__CNMI_V248_PERSONAL_PERMISSION_PERSIST_FIX__ = true;

  function appState(){ try { return state || null; } catch (_) { return window.state || null; } }
  function adminSafe(){ try { return !!isAdmin(); } catch (_) { const st = appState(); return !!(st && st.profile && st.profile.role === 'admin'); } }
  function toast(msg, tone){ try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } }
  function friendly(err){ try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } }
  function currentUserId(){ try { return currentStaffId(); } catch (_) { return appState()?.profile?.id || null; } }

  function rowKey(r){ return `${String(r?.staff_id || '')}|${String(r?.position_code || '')}`; }
  function timeValue(r){
    const raw = r?.updated_at || r?.created_at || r?.inserted_at || r?.modified_at || '';
    const t = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(t) ? t : 0;
  }
  function betterRow(a, b, bi){
    if (!a) return b;
    const at = timeValue(a), bt = timeValue(b);
    if (bt !== at) return bt > at ? b : a;
    const aid = Number(a?.id), bid = Number(b?.id);
    if (Number.isFinite(aid) && Number.isFinite(bid) && bid !== aid) return bid > aid ? b : a;
    // If timestamp/id are not useful, prefer the later record returned by Supabase.
    return { ...b, __v248_order: bi };
  }
  function normalizeEligibilityRows(rows){
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r, i) => {
      if (!r || !r.staff_id || !r.position_code) return;
      const k = rowKey(r);
      const existing = map.get(k);
      if (!existing) map.set(k, { ...r, __v248_order: i });
      else map.set(k, betterRow(existing, r, i));
    });
    return Array.from(map.values()).map(r => { const x = { ...r }; delete x.__v248_order; return x; });
  }
  function normalizeStateEligibility(){
    const st = appState();
    if (!st) return [];
    st.positionEligibility = normalizeEligibilityRows(st.positionEligibility || []);
    return st.positionEligibility;
  }
  function findEligibility(staffId, positionCode){
    const rows = normalizeStateEligibility();
    return rows.find(r => String(r.staff_id) === String(staffId) && String(r.position_code) === String(positionCode));
  }
  function applyLocalRows(rows){
    const st = appState();
    if (!st) return;
    const keys = new Set((rows || []).map(rowKey));
    st.positionEligibility = normalizeEligibilityRows((st.positionEligibility || []).filter(r => !keys.has(rowKey(r))).concat(rows || []));
  }

  // Normalize after loadAllData so old duplicate rows cannot override the newest saved value.
  try {
    const oldLoad = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
    if (oldLoad && !oldLoad.__v248EligibilityNormalized) {
      const wrappedLoad = async function loadAllDataV248(){
        const out = await oldLoad.apply(this, arguments);
        normalizeStateEligibility();
        return out;
      };
      wrappedLoad.__v248EligibilityNormalized = true;
      window.loadAllData = loadAllData = wrappedLoad;
    }
  } catch (_) {}

  const oldPositionEligible = window.positionEligible || (typeof positionEligible === 'function' ? positionEligible : null);
  function positionEligibleV248(staff, positionCode){
    if (!staff || !positionCode) return false;
    const key = String(positionCode || '').trim();
    const rec = findEligibility(staff.id, key);
    if (rec) return !!rec.is_eligible;
    const legacyKey = key.replace(/^(DR-Finger\+Interview|DR-Main)\s+\d+$/, '$1');
    if (legacyKey !== key) {
      const legacyRec = findEligibility(staff.id, legacyKey);
      if (legacyRec) return !!legacyRec.is_eligible;
    }
    // For OUTING keys, no explicit row means default allowed until Admin sets overrides.
    if (key.startsWith('OUTING:')) return true;
    return oldPositionEligible ? oldPositionEligible(staff, key) : true;
  }
  try { window.positionEligible = positionEligible = positionEligibleV248; } catch (_) { window.positionEligible = positionEligibleV248; }

  // Keep candidate check aligned with the normalized latest personal permission.
  const oldCandidateOk = window.positionCandidateOk || (typeof positionCandidateOk === 'function' ? positionCandidateOk : null);
  function positionCandidateOkV248(staff, positionRow, date){
    try {
      const row = positionRow || {};
      const rawKey = row.eligibility_code || row.code || row.position_code || '';
      const key = String(rawKey || '').trim();
      return isDailyPositionEnabled(staff)
        && !isActiveLeaveOn(staff.id, date || (typeof todayStr === 'function' ? todayStr() : ''))
        && positionRuleOk(staff, row.main_rule)
        && positionEligibleV248(staff, key);
    } catch (_) {
      return oldCandidateOk ? oldCandidateOk(staff, positionRow, date) : false;
    }
  }
  try { window.positionCandidateOk = positionCandidateOk = positionCandidateOkV248; } catch (_) { window.positionCandidateOk = positionCandidateOkV248; }

  function syncCheckVisual(cb){
    try {
      const label = cb.closest('.position-check');
      if (!label) return;
      label.classList.toggle('checked', !!cb.checked);
      label.setAttribute('data-v248-checked', cb.checked ? '1' : '0');
    } catch (_) {}
  }

  document.addEventListener('change', function(e){
    const cb = e.target && e.target.closest && e.target.closest('input[data-eligibility]');
    if (!cb) return;
    syncCheckVisual(cb);
  }, true);

  async function savePositionEligibilityV248(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const st = appState();
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const checks = Array.from(document.querySelectorAll('input[data-eligibility]'));
    const rowMap = new Map();
    checks.forEach(cb => {
      const staffId = cb.dataset.staffId;
      const positionCode = String(cb.dataset.positionCode || '').trim();
      if (!staffId || !positionCode) return;
      rowMap.set(`${staffId}|${positionCode}`, {
        staff_id: staffId,
        position_code: positionCode,
        is_eligible: !!cb.checked,
        updated_by: currentUserId()
      });
    });
    const rows = Array.from(rowMap.values());
    if (!rows.length) return toast('ไม่มีข้อมูลสิทธิ์เฉพาะบุคคลให้บันทึก');
    if (typeof sb === 'undefined' || !sb) return toast('ไม่พบ Supabase client', 'error');

    // Update local state immediately; this prevents the UI from reverting while Supabase is saving.
    applyLocalRows(rows);

    const byStaff = new Map();
    rows.forEach(r => {
      const sid = String(r.staff_id);
      if (!byStaff.has(sid)) byStaff.set(sid, []);
      byStaff.get(sid).push(r.position_code);
    });

    let savedRows = [];
    try {
      for (const [sid, codes] of byStaff.entries()) {
        // Remove stale duplicates first. If delete is blocked, fall back to upsert below.
        const del = await sb.from('daily_position_eligibility').delete().eq('staff_id', sid).in('position_code', codes);
        if (del.error) console.warn(`${VERSION}: duplicate cleanup skipped`, del.error);
      }
      const ins = await sb.from('daily_position_eligibility').insert(rows).select('*');
      if (ins.error) {
        const up = await sb.from('daily_position_eligibility').upsert(rows, { onConflict:'staff_id,position_code' }).select('*');
        if (up.error) throw up.error;
        savedRows = up.data || rows;
      } else {
        savedRows = ins.data || rows;
      }
    } catch (err) {
      // Restore from server if possible, but keep a clear message.
      try { await loadAllData(); } catch (_) {}
      return toast(friendly(err), 'error');
    }

    applyLocalRows(savedRows.length ? savedRows : rows);
    normalizeStateEligibility();

    if (st) {
      st.page = 'positionManagement';
      st.positionManagementSubtabV244 = 'permissions';
    }
    try { window.cnmiV244PositionPermissions?.setTab?.('permissions'); } catch (_) {}
    try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); }
    catch (_) { try { renderPage(); } catch (__) {} }
    setTimeout(() => { try { window.scrollTo(0, scrollY); } catch (_) {} }, 0);
    toast('บันทึกสิทธิ์เฉพาะบุคคลแล้ว');
  }
  try { window.savePositionEligibility = savePositionEligibility = savePositionEligibilityV248; } catch (_) { window.savePositionEligibility = savePositionEligibilityV248; }

  // Normalize before every permission render called by V244/V247 wrappers.
  try {
    if (window.cnmiV244PositionPermissions && typeof window.cnmiV244PositionPermissions.renderTabbedPositionManagement === 'function' && !window.cnmiV244PositionPermissions.renderTabbedPositionManagement.__v248Normalized) {
      const oldRender = window.cnmiV244PositionPermissions.renderTabbedPositionManagement;
      const wrappedRender = function(){ normalizeStateEligibility(); return oldRender.apply(this, arguments); };
      wrappedRender.__v248Normalized = true;
      window.cnmiV244PositionPermissions.renderTabbedPositionManagement = wrappedRender;
    }
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v248-personal-permission-persist-style';
  style.textContent = `
    .position-check[data-v248-checked="1"]{background:#d9f99d!important;border-color:#84cc16!important;box-shadow:0 8px 18px rgba(132,204,22,.16)}
    .position-check[data-v248-checked="0"]{background:#fff!important;border-color:#e5e7eb!important;box-shadow:none!important}
  `;
  document.head.appendChild(style);

  normalizeStateEligibility();
  setTimeout(normalizeStateEligibility, 400);
  console.info(`${VERSION} loaded`);
})();
