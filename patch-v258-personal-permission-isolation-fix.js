/* =========================
   V258 Personal Permission Isolation + Duplicate Repair
   - Saves only the currently selected staff member.
   - Updates every duplicate row for the same staff + position to the same value.
   - Verifies the saved values from Supabase before showing success.
   - Prevents a later loadAllData/render from restoring an older duplicate value.
   - Adds a one-click action to enable every known position for the selected staff.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V258_PERSONAL_PERMISSION_ISOLATION_FIX';
  if (window.__CNMI_V258_PERSONAL_PERMISSION_ISOLATION_FIX__) return;
  window.__CNMI_V258_PERSONAL_PERMISSION_ISOLATION_FIX__ = true;

  const sessionValues = new Map();
  let saveInFlight = false;

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function adminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return appState()?.profile?.role === 'admin'; }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function currentUserId(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function rowKey(staffId, positionCode){
    return `${String(staffId || '')}|${String(positionCode || '').trim()}`;
  }
  function boolValue(value){
    return value === true || String(value).toLowerCase() === 'true';
  }
  function rowTime(row){
    const raw = row?.updated_at || row?.modified_at || row?.created_at || row?.inserted_at || '';
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function rowOrder(row, index){
    const numericId = Number(row?.id);
    if (Number.isFinite(numericId)) return numericId;
    return index;
  }
  function chooseLatest(rows){
    let best = null;
    let bestTime = -1;
    let bestOrder = -1;
    (rows || []).forEach((row, index) => {
      const t = rowTime(row);
      const order = rowOrder(row, index);
      if (!best || t > bestTime || (t === bestTime && order >= bestOrder)) {
        best = row;
        bestTime = t;
        bestOrder = order;
      }
    });
    return best;
  }
  function normalizeStateRows(){
    const st = appState();
    if (!st) return [];
    const groups = new Map();
    (Array.isArray(st.positionEligibility) ? st.positionEligibility : []).forEach((row, index) => {
      if (!row?.staff_id || !row?.position_code) return;
      const key = rowKey(row.staff_id, row.position_code);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...row, __v258Index:index });
    });
    const normalized = [];
    groups.forEach((rows, key) => {
      const latest = chooseLatest(rows) || rows[rows.length - 1];
      const override = sessionValues.get(key);
      const row = { ...latest };
      delete row.__v258Index;
      if (override !== undefined) row.is_eligible = !!override;
      normalized.push(row);
    });
    sessionValues.forEach((value, key) => {
      if (groups.has(key)) return;
      const split = key.indexOf('|');
      if (split < 1) return;
      normalized.push({
        staff_id:key.slice(0, split),
        position_code:key.slice(split + 1),
        is_eligible:!!value,
        updated_by:currentUserId()
      });
    });
    st.positionEligibility = normalized;
    return normalized;
  }
  function applyDesiredLocally(rows){
    const st = appState();
    if (!st) return;
    const targetKeys = new Set();
    (rows || []).forEach(row => {
      const key = rowKey(row.staff_id, row.position_code);
      targetKeys.add(key);
      sessionValues.set(key, !!row.is_eligible);
    });
    st.positionEligibility = (Array.isArray(st.positionEligibility) ? st.positionEligibility : [])
      .filter(row => !targetKeys.has(rowKey(row?.staff_id, row?.position_code)))
      .concat((rows || []).map(row => ({ ...row })));
    normalizeStateRows();
  }
  function selectedStaffId(){
    const st = appState();
    const select = document.getElementById('eligibilityStaffSelect');
    return String(select?.value || st?.eligibilityStaffId || '').trim();
  }
  function visibleSnapshot(){
    const sid = selectedStaffId();
    const checks = Array.from(document.querySelectorAll('.v247-eligibility-page input[data-eligibility], .v245-eligibility-page input[data-eligibility]'));
    const map = new Map();
    checks.forEach(cb => {
      const staffId = String(cb.dataset.staffId || '').trim();
      const positionCode = String(cb.dataset.positionCode || '').trim();
      if (!staffId || !positionCode || (sid && staffId !== sid)) return;
      map.set(rowKey(staffId, positionCode), {
        staff_id:staffId,
        position_code:positionCode,
        is_eligible:!!cb.checked,
        updated_by:currentUserId()
      });
    });
    return Array.from(map.values());
  }
  function setSaveBusy(busy, message){
    document.querySelectorAll('[data-save-position-eligibility], [data-v258-enable-all]').forEach(button => {
      if (!button.dataset.v258OriginalText) button.dataset.v258OriginalText = button.textContent || '';
      button.disabled = !!busy;
      if (busy && button.hasAttribute('data-save-position-eligibility')) button.textContent = message || 'กำลังบันทึก…';
      if (!busy && button.dataset.v258OriginalText) button.textContent = button.dataset.v258OriginalText;
    });
  }

  async function fetchRows(staffId, codes){
    if (!codes.length) return [];
    const query = await sb.from('daily_position_eligibility')
      .select('*')
      .eq('staff_id', staffId)
      .in('position_code', codes);
    if (query.error) throw query.error;
    return query.data || [];
  }
  async function persistOne(row, existingRows){
    const payload = {
      is_eligible:!!row.is_eligible,
      updated_by:row.updated_by || currentUserId()
    };
    if ((existingRows || []).length) {
      const updated = await sb.from('daily_position_eligibility')
        .update(payload)
        .eq('staff_id', row.staff_id)
        .eq('position_code', row.position_code)
        .select('*');
      if (updated.error) throw updated.error;
      if ((updated.data || []).length) return updated.data;
    }

    const inserted = await sb.from('daily_position_eligibility')
      .insert({ ...row, ...payload })
      .select('*');
    if (!inserted.error) return inserted.data || [];

    // A concurrent save or an existing unique row can make insert conflict.
    // Update again rather than deleting rows, so another staff member is never touched.
    const retried = await sb.from('daily_position_eligibility')
      .update(payload)
      .eq('staff_id', row.staff_id)
      .eq('position_code', row.position_code)
      .select('*');
    if (retried.error) throw inserted.error;
    if (!(retried.data || []).length) throw inserted.error;
    return retried.data || [];
  }
  async function persistRows(rows){
    if (!Array.isArray(rows) || !rows.length) throw new Error('ไม่มีข้อมูลสิทธิ์ให้บันทึก');
    const staffIds = Array.from(new Set(rows.map(row => String(row.staff_id || '')).filter(Boolean)));
    if (staffIds.length !== 1) throw new Error('หน้าจอมีข้อมูลมากกว่าหนึ่งคน ระบบจึงหยุดบันทึกเพื่อไม่ให้สิทธิ์ของคนอื่นเปลี่ยน');
    const staffId = staffIds[0];
    const codes = Array.from(new Set(rows.map(row => String(row.position_code || '').trim()).filter(Boolean)));
    const before = await fetchRows(staffId, codes);
    const byCode = new Map();
    before.forEach(row => {
      const code = String(row.position_code || '').trim();
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(row);
    });

    for (const row of rows) {
      await persistOne(row, byCode.get(row.position_code) || []);
    }

    let verified = await fetchRows(staffId, codes);
    let verifyMap = new Map();
    verified.forEach(row => {
      const code = String(row.position_code || '').trim();
      if (!verifyMap.has(code)) verifyMap.set(code, []);
      verifyMap.get(code).push(row);
    });

    // If old duplicate rows exist, force every duplicate to the same value one more time.
    for (const desired of rows) {
      const matches = verifyMap.get(desired.position_code) || [];
      const wrong = !matches.length || matches.some(row => boolValue(row.is_eligible) !== !!desired.is_eligible);
      if (!wrong) continue;
      const fixed = await sb.from('daily_position_eligibility')
        .update({ is_eligible:!!desired.is_eligible, updated_by:desired.updated_by || currentUserId() })
        .eq('staff_id', desired.staff_id)
        .eq('position_code', desired.position_code)
        .select('*');
      if (fixed.error) throw fixed.error;
    }

    verified = await fetchRows(staffId, codes);
    verifyMap = new Map();
    verified.forEach(row => {
      const code = String(row.position_code || '').trim();
      if (!verifyMap.has(code)) verifyMap.set(code, []);
      verifyMap.get(code).push(row);
    });
    for (const desired of rows) {
      const matches = verifyMap.get(desired.position_code) || [];
      if (!matches.length || matches.some(row => boolValue(row.is_eligible) !== !!desired.is_eligible)) {
        throw new Error(`ตรวจสอบสิทธิ์ ${desired.position_code} หลังบันทึกไม่ผ่าน กรุณาแจ้ง Admin ฐานข้อมูล`);
      }
    }

    applyDesiredLocally(rows);
    return { staffId, codes, verified };
  }
  function sanitizeLocalPositions(){
    const st = appState();
    if (!st || !window.cnmiV255?.sanitizeRows) return;
    try {
      if (Array.isArray(st.positions)) st.positions = window.cnmiV255.sanitizeRows(st.positions, { dropZeroPermissionReview:true }).rows;
      if (Array.isArray(st.monthPositionDraft?.rows)) st.monthPositionDraft.rows = window.cnmiV255.sanitizeRows(st.monthPositionDraft.rows, { dropZeroPermissionReview:true }).rows;
    } catch (error) {
      console.warn(`${VERSION}: local position sanitize skipped`, error);
    }
  }
  async function cleanupFuturePositions(staffId){
    if (!window.cnmiV255?.deleteInvalidFutureAssignments) return 0;
    try {
      const removed = await window.cnmiV255.deleteInvalidFutureAssignments([staffId]);
      sanitizeLocalPositions();
      return Number(removed || 0);
    } catch (error) {
      console.error(`${VERSION}: position cleanup failed`, error);
      toast('บันทึกสิทธิ์สำเร็จ แต่ล้างตำแหน่งอนาคตไม่ครบ: ' + friendly(error), 'error');
      return 0;
    }
  }
  function rerenderPermissionPage(){
    normalizeStateRows();
    const st = appState();
    if (st) {
      st.page = 'positionManagement';
      st.positionManagementSubtabV244 = 'permissions';
    }
    try { window.cnmiV244PositionPermissions?.setTab?.('permissions'); } catch (_) {}
    try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); }
    catch (_) { try { renderPage(); } catch (__) {} }
  }

  async function savePositionEligibilityV258(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (saveInFlight) return toast('ระบบกำลังบันทึกอยู่ กรุณารอสักครู่');
    if (typeof sb === 'undefined' || !sb) return toast('ไม่พบ Supabase client', 'error');
    const rows = visibleSnapshot();
    if (!rows.length) return toast('ไม่มีข้อมูลสิทธิ์ในชุด Slot ที่เห็นอยู่', 'error');

    saveInFlight = true;
    setSaveBusy(true, 'กำลังบันทึกและตรวจสอบ…');
    try {
      const result = await persistRows(rows);
      const removed = await cleanupFuturePositions(result.staffId);
      rerenderPermissionPage();
      toast(removed > 0
        ? `บันทึกสิทธิ์ของคนนี้แล้ว และนำตำแหน่งอนาคตที่ไม่ตรงสิทธิ์ออก ${removed} รายการ`
        : 'บันทึกและตรวจสอบสิทธิ์ของคนนี้เรียบร้อยแล้ว');
    } catch (error) {
      console.error(`${VERSION}: save failed`, error);
      toast('บันทึกไม่สำเร็จ: ' + friendly(error), 'error');
    } finally {
      saveInFlight = false;
      setSaveBusy(false);
    }
  }

  function currentConfigs(){
    try {
      return window.cnmiV224?.currentConfigs?.()
        || window.cnmiV226?.currentConfigs226?.()
        || window.cnmiV227?.currentConfigs226?.()
        || null;
    } catch (_) { return null; }
  }
  function baseCode(value){ return String(value || '').replace(/^OUTING:/i, '').trim(); }
  function allKnownPermissionCodes(){
    const codes = new Set();
    const addRows = (rows, outing) => {
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const code = baseCode(row?.code || row?.position_code || row?.eligibility_code);
        if (!code) return;
        const raw = String(row?.eligibility_code || '').trim();
        codes.add(outing ? `OUTING:${code}` : (raw && !raw.startsWith('OUTING:') ? raw : code));
      });
    };
    const cfg = currentConfigs();
    if (cfg) {
      [8,9,10,11,12,13,14].forEach(count => addRows(cfg.day?.[count] || cfg.day?.[String(count)] || [], false));
      if (cfg.outing_by_count) [12,13,14].forEach(count => addRows(cfg.outing_by_count[count] || cfg.outing_by_count[String(count)] || [], true));
      addRows(cfg.outing || [], true);
    }
    document.querySelectorAll('input[data-eligibility]').forEach(cb => {
      const code = String(cb.dataset.positionCode || '').trim();
      if (code) codes.add(code);
    });
    return Array.from(codes).sort((a,b) => a.localeCompare(b, 'th'));
  }
  async function enableAllForSelectedStaff(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (saveInFlight) return toast('ระบบกำลังบันทึกอยู่ กรุณารอสักครู่');
    const staffId = selectedStaffId();
    if (!staffId) return toast('กรุณาเลือกเจ้าหน้าที่ก่อน', 'error');
    const staff = (appState()?.staff || []).find(item => String(item?.id || '') === staffId);
    const name = staff?.nickname || staff?.full_name || 'เจ้าหน้าที่คนนี้';
    const codes = allKnownPermissionCodes();
    if (!codes.length) return toast('ยังไม่พบตำแหน่งใน Slot Master', 'error');
    let accepted = true;
    try {
      accepted = typeof confirmDialog === 'function'
        ? await confirmDialog(`เปิดสิทธิ์ทุกตำแหน่งจากทุกชุด Slot ให้ ${name} จำนวน ${codes.length} ตำแหน่ง?`, 'เปิดสิทธิ์ทุกตำแหน่ง')
        : window.confirm(`เปิดสิทธิ์ทุกตำแหน่งจากทุกชุด Slot ให้ ${name} จำนวน ${codes.length} ตำแหน่ง?`);
    } catch (_) {}
    if (!accepted) return;

    const rows = codes.map(positionCode => ({
      staff_id:staffId,
      position_code:positionCode,
      is_eligible:true,
      updated_by:currentUserId()
    }));
    saveInFlight = true;
    setSaveBusy(true, 'กำลังบันทึกทุกตำแหน่ง…');
    try {
      await persistRows(rows);
      rerenderPermissionPage();
      toast(`เปิดและตรวจสอบสิทธิ์ทุกตำแหน่งของ ${name} แล้ว ${codes.length} ตำแหน่ง`);
    } catch (error) {
      console.error(`${VERSION}: enable all failed`, error);
      toast('บันทึกทุกตำแหน่งไม่สำเร็จ: ' + friendly(error), 'error');
    } finally {
      saveInFlight = false;
      setSaveBusy(false);
    }
  }

  // Keep permission reads stable even when the database already contains duplicate rows.
  const oldPositionEligible = window.positionEligible || (typeof positionEligible === 'function' ? positionEligible : null);
  function positionEligibleV258(staff, positionCode){
    if (!staff || !positionCode) return false;
    const key = rowKey(staff.id, positionCode);
    if (sessionValues.has(key)) return !!sessionValues.get(key);
    normalizeStateRows();
    const row = (appState()?.positionEligibility || []).find(item => rowKey(item?.staff_id, item?.position_code) === key);
    if (row) return boolValue(row.is_eligible);
    return oldPositionEligible ? !!oldPositionEligible(staff, positionCode) : false;
  }
  try { window.positionEligible = positionEligible = positionEligibleV258; }
  catch (_) { window.positionEligible = positionEligibleV258; }

  // The V247 renderer calls its own closed-over eligibility reader. Normalize state
  // immediately before it runs so it can only see one deterministic row per key.
  try {
    const oldRenderEligibility = window.renderEligibilityPage || (typeof renderEligibilityPage === 'function' ? renderEligibilityPage : null);
    if (oldRenderEligibility && !oldRenderEligibility.__v258Isolated) {
      const wrappedRender = function renderEligibilityPageV258(){
        normalizeStateRows();
        let html = String(oldRenderEligibility.apply(this, arguments) || '');
        if (!html.includes('data-v258-enable-all')) {
          html = html.replace(
            /(<button[^>]*data-save-position-eligibility[^>]*>[\s\S]*?<\/button>)/,
            `$1<button type="button" class="secondary-btn v258-enable-all-btn" data-v258-enable-all>เปิดทุกตำแหน่งของคนนี้ (ทุกชุด Slot)</button>`
          );
          html = html.replace(
            /(<div class="position-card-grid[^>]*>)/,
            `<div class="notice soft-notice compact v258-save-scope-note"><b>บันทึกแยกรายคน:</b> การกดบันทึกหน้านี้จะเปลี่ยนเฉพาะเจ้าหน้าที่ที่เลือกอยู่ ไม่แตะสิทธิ์ของคนอื่น</div>$1`
          );
        }
        return html;
      };
      wrappedRender.__v258Isolated = true;
      window.renderEligibilityPage = wrappedRender;
      try { renderEligibilityPage = wrappedRender; } catch (_) {}
      window.renderPositionEligibilityMatrix = function(){ return wrappedRender(); };
      try { renderPositionEligibilityMatrix = window.renderPositionEligibilityMatrix; } catch (_) {}
    }
  } catch (error) {
    console.warn(`${VERSION}: render wrapper skipped`, error);
  }

  // Reapply session-confirmed values after any full data reload.
  try {
    const oldLoadAllData = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
    if (oldLoadAllData && !oldLoadAllData.__v258PermissionStable) {
      const wrappedLoad = async function loadAllDataV258(){
        const result = await oldLoadAllData.apply(this, arguments);
        normalizeStateRows();
        return result;
      };
      wrappedLoad.__v258PermissionStable = true;
      window.loadAllData = wrappedLoad;
      try { loadAllData = wrappedLoad; } catch (_) {}
    }
  } catch (_) {}

  // Replace the final V255 wrapper. Cleanup is performed only after server verification.
  try { window.savePositionEligibility = savePositionEligibility = savePositionEligibilityV258; }
  catch (_) { window.savePositionEligibility = savePositionEligibilityV258; }

  document.addEventListener('click', function(event){
    const button = event.target?.closest?.('[data-v258-enable-all]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    enableAllForSelectedStaff();
  }, true);

  const style = document.createElement('style');
  style.id = 'cnmi-v258-personal-permission-isolation-style';
  style.textContent = `
    .eligibility-position-panel .section-title{gap:8px;flex-wrap:wrap}
    .v258-enable-all-btn{margin-left:auto;white-space:normal}
    .v258-save-scope-note{margin:8px 0 12px;border-color:#86efac;background:#f0fdf4;color:#166534}
    [data-save-position-eligibility]:disabled,[data-v258-enable-all]:disabled{opacity:.65;cursor:wait}
    @media(max-width:720px){.v258-enable-all-btn{width:100%;margin-left:0}.eligibility-position-panel [data-save-position-eligibility]{width:100%}}
  `;
  document.head.appendChild(style);

  normalizeStateRows();
  window.cnmiV258 = {
    normalizeStateRows,
    persistRows,
    visibleSnapshot,
    enableAllForSelectedStaff,
    sessionValues
  };
  console.info(`${VERSION} loaded`);
})();
