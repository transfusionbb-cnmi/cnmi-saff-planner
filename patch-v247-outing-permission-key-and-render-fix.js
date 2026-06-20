/* =========================
   V247 Outing Permission Key + Stable Render Fix
   - Keeps “สิทธิ์เฉพาะบุคคล” on the same tab when changing Slot type/count (no Slot Master flicker).
   - Separates outing-date permission keys from normal-day permission keys for every outing slot, including Blood Bank/Manual slots.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V247_OUTING_PERMISSION_KEY_AND_RENDER_FIX';
  if (window.__CNMI_V247_OUTING_PERMISSION_KEY_AND_RENDER_FIX__) return;
  window.__CNMI_V247_OUTING_PERMISSION_KEY_AND_RENDER_FIX__ = true;

  const KIND_KEY = 'cnmi_personal_permission_slot_kind_v245';
  const COUNT_KEY = 'cnmi_personal_permission_slot_count_v245';
  const DAY_SETS = [8,9,10,11,12,13,14];

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function appState(){ try { return state || null; } catch (_) { return window.state || null; } }
  function adminSafe(){
    try { return !!isAdmin(); } catch (_) { const st = appState(); return !!(st && st.profile && st.profile.role === 'admin'); }
  }
  function toast(msg, tone){ try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } }
  function friendly(err){ try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } }
  function staffName(st){ return st ? (st.nickname || st.full_name || st.email || '-') : '-'; }
  function activeStaffRows(){
    const rows = ((appState()?.staff) || []).filter(s => s && s.is_active !== false);
    try { return orderedStaff(rows); } catch (_) { return rows; }
  }
  function cleanBaseCode(v){ return String(v || '').replace(/^OUTING:/i, '').trim(); }
  function outingKey(code){ const base = cleanBaseCode(code); return base ? `OUTING:${base}` : ''; }
  function isOutingMarker(row, forced){
    return !!forced || row?.is_outing === true || String(row?.eligibility_code || '').startsWith('OUTING:') || String(row?.zone || '').trim() === 'ออกหน่วย';
  }
  function readKind(){
    const st = appState();
    const fromState = st && st.personalPermissionSlotKindV245;
    const raw = fromState || (() => { try { return localStorage.getItem(KIND_KEY); } catch (_) { return ''; } })();
    return String(raw || 'day') === 'outing' ? 'outing' : 'day';
  }
  function readCount(){
    const st = appState();
    const raw = (st && st.personalPermissionSlotCountV245) || (() => { try { return localStorage.getItem(COUNT_KEY); } catch (_) { return ''; } })() || state?.baseSlotCountV231 || 14;
    const n = Math.max(8, Math.min(14, Math.round(Number(raw) || 14)));
    return DAY_SETS.includes(n) ? n : 14;
  }
  function setKind(v){
    const kind = String(v || 'day') === 'outing' ? 'outing' : 'day';
    const st = appState();
    if (st) st.personalPermissionSlotKindV245 = kind;
    try { localStorage.setItem(KIND_KEY, kind); } catch (_) {}
    return kind;
  }
  function setCount(v){
    const n = Math.max(8, Math.min(14, Math.round(Number(v) || 14)));
    const count = DAY_SETS.includes(n) ? n : 14;
    const st = appState();
    if (st) st.personalPermissionSlotCountV245 = count;
    try { localStorage.setItem(COUNT_KEY, String(count)); } catch (_) {}
    return count;
  }
  function normalizeZone(row){
    const raw = String(row?.zone || '').trim();
    const code = String(row?.code || row?.position_code || '').trim();
    if (raw === 'ออกหน่วย') return 'ออกหน่วย';
    if (raw === 'Manual') return 'Manual';
    if (/^BB-Manual/i.test(code) || /manual/i.test(code)) return 'Manual';
    if (raw === 'Donor Room' || raw === 'Donor' || /^DR-/i.test(code)) return raw === 'ออกหน่วย' ? 'ออกหน่วย' : 'Donor Room';
    if (raw === 'Blood Bank' || /^BB-/i.test(code)) return 'Blood Bank';
    return raw || 'Blood Bank';
  }
  function normalizeRow(row, i, forcedOuting){
    const rawCode = row?.code || row?.position_code || cleanBaseCode(row?.eligibility_code || '');
    const code = cleanBaseCode(rawCode);
    if (!code) return null;
    const zone = normalizeZone({ ...row, code, position_code: code });
    const isOuting = isOutingMarker(row, forcedOuting);
    const rawElig = String(row?.eligibility_code || '').trim();
    const eligibilityCode = isOuting ? outingKey(code) : (rawElig && !rawElig.startsWith('OUTING:') ? rawElig : code);
    return {
      ...row,
      code,
      position_code: code,
      zone,
      main_rule: String(row?.main_rule || '').trim() || '-',
      break_time: String(row?.break_time || '').trim() || (isOuting && zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
      job_desc: String(row?.job_desc || row?.detail || '').trim() || '',
      sort_order: Number(row?.sort_order || row?.order || i + 1) || i + 1,
      is_outing: !!isOuting,
      eligibility_code: eligibilityCode,
      is_active: row?.is_active === false ? false : true
    };
  }
  function normalizeRows(rows, forcedOuting){
    return (Array.isArray(rows) ? rows : [])
      .map((r, i) => normalizeRow(r, i, forcedOuting))
      .filter(Boolean)
      .sort((a,b) => (Number(a.sort_order || 999) - Number(b.sort_order || 999)) || String(a.code).localeCompare(String(b.code), 'th'));
  }
  function normalizeConfigInPlace(cfg){
    if (!cfg || typeof cfg !== 'object') return cfg;
    try {
      cfg.day = cfg.day || {};
      DAY_SETS.forEach(n => {
        if (Array.isArray(cfg.day[n]) || Array.isArray(cfg.day[String(n)])) {
          const rows = normalizeRows(cfg.day[n] || cfg.day[String(n)], false);
          cfg.day[n] = rows;
          cfg.day[String(n)] = rows;
        }
      });
      if (Array.isArray(cfg.outing)) cfg.outing = normalizeRows(cfg.outing, true);
      if (cfg.outing_by_count && typeof cfg.outing_by_count === 'object') {
        [12,13,14].forEach(n => {
          if (Array.isArray(cfg.outing_by_count[n]) || Array.isArray(cfg.outing_by_count[String(n)])) {
            const rows = normalizeRows(cfg.outing_by_count[n] || cfg.outing_by_count[String(n)], true);
            cfg.outing_by_count[n] = rows;
            cfg.outing_by_count[String(n)] = rows;
          }
        });
      }
    } catch (err) { console.warn(`${VERSION}: config normalize skipped`, err); }
    return cfg;
  }
  function cloneConfig(cfg){ try { return JSON.parse(JSON.stringify(cfg || {})); } catch (_) { return cfg; } }
  function patchConfigApi(obj, method){
    if (!obj || typeof obj[method] !== 'function' || obj[method].__v247Normalized) return;
    const old = obj[method];
    const wrapped = function(){
      const cfg = old.apply(this, arguments);
      return normalizeConfigInPlace(cfg);
    };
    wrapped.__v247Normalized = true;
    obj[method] = wrapped;
  }
  function patchRuntimeSlotApi(){
    try {
      const api = window.cnmiDayPositionSlotsV218;
      if (!api || api.__v247RuntimePatched) return;
      ['outingSlotsV224','outingSlotsV226','outingSlotsV232'].forEach(name => {
        if (typeof api[name] === 'function') {
          const old = api[name];
          api[name] = function(){ return normalizeRows(old.apply(this, arguments), true); };
        }
      });
      api.__v247RuntimePatched = true;
    } catch (_) {}
  }
  function patchConfigApis(){
    try { patchConfigApi(window.cnmiV224, 'currentConfigs'); } catch (_) {}
    try { patchConfigApi(window.cnmiV226, 'currentConfigs226'); } catch (_) {}
    try { patchConfigApi(window.cnmiV227, 'currentConfigs226'); } catch (_) {}
    try {
      if (window.cnmiV232 && typeof window.cnmiV232.defaultConfigs232 === 'function' && !window.cnmiV232.defaultConfigs232.__v247Normalized) {
        const oldDefault = window.cnmiV232.defaultConfigs232;
        window.cnmiV232.defaultConfigs232 = function(){ return normalizeConfigInPlace(oldDefault.apply(this, arguments)); };
        window.cnmiV232.defaultConfigs232.__v247Normalized = true;
      }
      if (window.cnmiV232 && typeof window.cnmiV232.applyRuntime232 === 'function' && !window.cnmiV232.applyRuntime232.__v247Normalized) {
        const oldApply = window.cnmiV232.applyRuntime232;
        window.cnmiV232.applyRuntime232 = function(cfg){ return normalizeConfigInPlace(oldApply.call(this, normalizeConfigInPlace(cfg))); };
        window.cnmiV232.applyRuntime232.__v247Normalized = true;
      }
    } catch (_) {}
    patchRuntimeSlotApi();
    try { normalizeConfigInPlace(window.cnmiV224?.currentConfigs?.()); } catch (_) {}
  }

  const oldPositionEligible = window.positionEligible || (typeof positionEligible === 'function' ? positionEligible : null);
  function positionEligibleV247(staff, positionCode){
    if (!staff || !positionCode) return false;
    const key = String(positionCode || '').trim();
    const rows = (appState()?.positionEligibility) || [];
    const rec = rows.find(x => String(x.staff_id) === String(staff.id) && String(x.position_code) === key);
    if (rec) return !!rec.is_eligible;
    const legacyKey = key.replace(/^(DR-Finger\+Interview|DR-Main)\s+\d+$/, '$1');
    if (legacyKey !== key) {
      const legacyRec = rows.find(x => String(x.staff_id) === String(staff.id) && String(x.position_code) === legacyKey);
      if (legacyRec) return !!legacyRec.is_eligible;
    }
    const hasAnyExact = rows.some(x => String(x.position_code) === key);
    if (key.startsWith('OUTING:')) return hasAnyExact ? false : true;
    return oldPositionEligible ? oldPositionEligible(staff, key) : !hasAnyExact;
  }
  try { window.positionEligible = positionEligible = positionEligibleV247; } catch (_) { window.positionEligible = positionEligibleV247; }

  const oldPositionCandidateOk = window.positionCandidateOk || (typeof positionCandidateOk === 'function' ? positionCandidateOk : null);
  function positionCandidateOkV247(staff, positionRow, date){
    try {
      const row = positionRow || {};
      const out = isOutingMarker(row, false);
      const key = out ? outingKey(row.code || row.position_code || row.eligibility_code) : (row.eligibility_code || row.code || row.position_code);
      return isDailyPositionEnabled(staff)
        && !isActiveLeaveOn(staff.id, date || (typeof todayStr === 'function' ? todayStr() : ''))
        && positionRuleOk(staff, row.main_rule)
        && positionEligibleV247(staff, key);
    } catch (_) {
      return oldPositionCandidateOk ? oldPositionCandidateOk(staff, positionRow, date) : false;
    }
  }
  try { window.positionCandidateOk = positionCandidateOk = positionCandidateOkV247; } catch (_) { window.positionCandidateOk = positionCandidateOkV247; }

  function safeConfigs(){
    patchConfigApis();
    try {
      const cfg = window.cnmiV224?.currentConfigs?.() || window.cnmiV226?.currentConfigs226?.() || window.cnmiV227?.currentConfigs226?.();
      if (cfg && typeof cfg === 'object') return normalizeConfigInPlace(cfg);
    } catch (_) {}
    return null;
  }
  function fallbackRows(kind){
    try {
      const rows = kind === 'outing'
        ? (window.cnmiPositionCatalogV182?.outingPositions182?.() || [])
        : (window.cnmiPositionCatalogV182?.normalPositions182?.() || []);
      return normalizeRows(rows, kind === 'outing');
    } catch (_) { return []; }
  }
  function selectedSlotRows(){
    const kind = readKind();
    const count = readCount();
    const cfg = safeConfigs();
    let rows = [];
    if (cfg) {
      if (kind === 'outing') {
        const bucket = count <= 12 ? 12 : (count <= 13 ? 13 : 14);
        rows = cfg.outing_by_count?.[bucket] || cfg.outing_by_count?.[String(bucket)] || cfg.outing || [];
      } else {
        rows = cfg.day?.[count] || cfg.day?.[String(count)] || [];
      }
    }
    if (!Array.isArray(rows) || !rows.length) rows = fallbackRows(kind);
    return normalizeRows(rows, kind === 'outing');
  }
  function ruleOk(staff, mainRule){ try { return positionRuleOk(staff, mainRule); } catch (_) { return true; } }
  function isEligible(staff, key){ try { return positionEligibleV247(staff, key); } catch (_) { return true; } }
  function groupRows(rows){
    const zoneOrder = ['Blood Bank','Manual','Donor Room','ออกหน่วย'];
    const grouped = new Map();
    (rows || []).forEach(r => {
      const z = normalizeZone(r);
      if (!grouped.has(z)) grouped.set(z, []);
      grouped.get(z).push(r);
    });
    return Array.from(grouped.entries()).sort((a,b) => {
      const ai = zoneOrder.indexOf(a[0]);
      const bi = zoneOrder.indexOf(b[0]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || String(a[0]).localeCompare(String(b[0]), 'th');
    });
  }
  function slotFilterHtml(rows){
    const kind = readKind();
    const count = readCount();
    const outingBucket = count <= 12 ? 12 : (count <= 13 ? 13 : 14);
    const optionValues = kind === 'outing' ? [12,13,14] : DAY_SETS;
    const selectedCount = kind === 'outing' ? outingBucket : count;
    const countOptions = optionValues.map(n => `<option value="${n}" ${n===selectedCount?'selected':''}>${n} คน</option>`).join('');
    const label = kind === 'outing' ? `วันที่ออกหน่วย ${outingBucket} คน` : `วันทำงานปกติ ${count} คน`;
    return `<div class="card v245-permission-filter-card">
      <div class="section-title compact"><div><h3>เลือกชุด Slot ก่อนติ๊กสิทธิ์</h3><p class="hint">แต่ละชุด Slot มีตำแหน่งไม่เหมือนกัน จึงแสดงเฉพาะตำแหน่งของชุดที่เลือกอยู่</p></div></div>
      <div class="v245-permission-filter-grid">
        <label>ประเภท Slot
          <select id="eligibilitySlotKindV245" data-v245-permission-kind>
            <option value="day" ${kind==='day'?'selected':''}>วันทำงานปกติ 8-14 คน</option>
            <option value="outing" ${kind==='outing'?'selected':''}>วันที่ออกหน่วย</option>
          </select>
        </label>
        <label>จำนวนคน
          <select id="eligibilitySlotCountV245" data-v245-permission-count>${countOptions}</select>
        </label>
        <div class="v245-selected-slot-note"><b>${esc(label)}</b><small>${rows.length} Slot ในชุดนี้</small></div>
      </div>
      <div class="notice soft-notice compact"><b>หลักคิด:</b> Slot Master เป็นกฎตั้งต้น ส่วนหน้านี้ใช้ติ๊ก override รายคนเฉพาะตำแหน่งที่คนนั้นทำได้จริง</div>
    </div>`;
  }
  function renderEligibilityPageV247(){
    if (!adminSafe()) {
      try { return noPermission(); } catch (_) { return '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>'; }
    }
    const activeStaff = activeStaffRows();
    if (!activeStaff.length) {
      try { return empty('ยังไม่มีเจ้าหน้าที่ active'); } catch (_) { return '<div class="card">ยังไม่มีเจ้าหน้าที่ active</div>'; }
    }
    if (!state.eligibilityStaffId || !activeStaff.some(s => String(s.id) === String(state.eligibilityStaffId))) state.eligibilityStaffId = activeStaff[0].id;
    const selected = activeStaff.find(s => String(s.id) === String(state.eligibilityStaffId)) || activeStaff[0];
    const rows = selectedSlotRows();
    const grouped = groupRows(rows);
    const kind = readKind();
    const count = readCount();
    const slotName = kind === 'outing' ? `วันที่ออกหน่วย ${count <= 12 ? 12 : (count <= 13 ? 13 : 14)} คน` : `วันทำงานปกติ ${count} คน`;

    return `<div class="v245-eligibility-page v247-eligibility-page">
      ${slotFilterHtml(rows)}
      <div class="grid eligibility-page v245-permission-layout">
        <div class="card eligibility-staff-panel">
          <div class="section-title"><h3>เลือกเจ้าหน้าที่</h3></div>
          <label>เจ้าหน้าที่
            <select id="eligibilityStaffSelect">${activeStaff.map(s => `<option value="${esc(s.id)}" ${String(selected.id)===String(s.id)?'selected':''}>${esc(staffName(s))} (${esc(s.staff_type || '-')})</option>`).join('')}</select>
          </label>
          <div class="selected-staff-card" style="--staff-bg:${esc(typeof staffColor === 'function' ? staffColor(selected) : '#e8f3ff')};--staff-fg:${esc(typeof textColorFor === 'function' ? textColorFor(typeof staffColor === 'function' ? staffColor(selected) : '#e8f3ff') : '#0f172a')}">
            <div class="big-staff-name">${esc(staffName(selected))}</div>
            <div>${esc(selected.full_name || '')}</div>
            <small>${esc(selected.staff_type || '-')} • ${esc(selected.position_training_status || 'ใช้งานปกติ')}</small>
          </div>
        </div>
        <div class="card eligibility-position-panel">
          <div class="section-title">
            <div><h3>สิทธิ์เฉพาะบุคคลของ ${esc(staffName(selected))}</h3><p class="hint">กำลังแก้จากชุด Slot: ${esc(slotName)} — ติ๊กเฉพาะตำแหน่งที่คนนี้ทำได้จริงในชุดนี้</p></div>
            <button class="primary-btn" data-save-position-eligibility>บันทึกสิทธิ์เฉพาะบุคคล</button>
          </div>
          ${rows.length ? '' : '<div class="notice error-notice compact">ยังไม่พบตำแหน่งในชุด Slot นี้ กรุณากลับไปเพิ่มในแท็บ “ชุด Slot ตำแหน่งกลางวัน” ก่อน</div>'}
          <div class="position-card-grid v245-position-card-grid">
            ${grouped.map(([zone, positions]) => `<div class="position-zone-card"><h4>${esc(zone)}</h4>${positions.map(p => {
              const eligibilityKey = p.eligibility_code || (p.is_outing ? outingKey(p.code) : p.code);
              const checked = isEligible(selected, eligibilityKey);
              const ok = ruleOk(selected, p.main_rule);
              return `<label class="position-check ${checked?'checked':''} ${ok?'':'rule-mismatch'}">
                <input type="checkbox" data-eligibility data-staff-id="${esc(selected.id)}" data-position-code="${esc(eligibilityKey)}" ${checked?'checked':''}>
                <span><b>${esc(p.code)}</b><small>${esc(p.main_rule || '-')}${p.is_outing ? ' • ออกหน่วย' : ''}${ok ? '' : ' • ไม่ตรงผู้ปฏิบัติหลัก'}</small><em>${esc(p.job_desc || '')}</em></span>
              </label>`;
            }).join('')}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }
  try { window.renderEligibilityPage = renderEligibilityPage = renderEligibilityPageV247; } catch (_) { window.renderEligibilityPage = renderEligibilityPageV247; }
  try { window.renderPositionEligibilityMatrix = renderPositionEligibilityMatrix = function(){ return renderEligibilityPageV247(); }; } catch (_) { window.renderPositionEligibilityMatrix = function(){ return renderEligibilityPageV247(); }; }

  function renderPermissionsStable(){
    try { patchConfigApis(); } catch (_) {}
    try { window.cnmiV244PositionPermissions?.setTab?.('permissions'); } catch (_) {}
    const st = appState();
    if (st) { st.page = 'positionManagement'; st.positionManagementSubtabV244 = 'permissions'; }
    try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); }
    catch (_) { try { renderPage(); } catch (__) {} }
  }

  window.addEventListener('change', function(e){
    const kind = e.target?.closest?.('[data-v245-permission-kind]');
    const count = e.target?.closest?.('[data-v245-permission-count]');
    if (!kind && !count) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (kind) setKind(kind.value);
    if (count) setCount(count.value);
    renderPermissionsStable();
  }, true);

  document.addEventListener('change', function(e){
    const st = appState();
    if (e.target && e.target.id === 'eligibilityStaffSelect' && st && st.page === 'positionManagement') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      st.eligibilityStaffId = e.target.value;
      renderPermissionsStable();
    }
  }, true);

  async function savePositionEligibilityV247(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const checks = Array.from(document.querySelectorAll('[data-eligibility]'));
    const rowMap = new Map();
    checks.forEach(cb => {
      const staffId = cb.dataset.staffId;
      const positionCode = String(cb.dataset.positionCode || '').trim();
      if (!staffId || !positionCode) return;
      rowMap.set(`${staffId}|${positionCode}`, {
        staff_id: staffId,
        position_code: positionCode,
        is_eligible: !!cb.checked,
        updated_by: (typeof currentStaffId === 'function' ? currentStaffId() : state?.profile?.id || null)
      });
    });
    const rows = Array.from(rowMap.values());
    if (!rows.length) return toast('ไม่มีข้อมูลสิทธิ์เฉพาะบุคคลให้บันทึก');
    if (typeof sb === 'undefined' || !sb) return toast('ไม่พบ Supabase client', 'error');
    const { error } = await sb.from('daily_position_eligibility').upsert(rows, { onConflict: 'staff_id,position_code' });
    if (error) return toast(friendly(error), 'error');
    try { await loadAllData(); } catch (_) {}
    renderPermissionsStable();
    toast('บันทึกสิทธิ์เฉพาะบุคคลแล้ว');
  }
  try { window.savePositionEligibility = savePositionEligibility = savePositionEligibilityV247; } catch (_) { window.savePositionEligibility = savePositionEligibilityV247; }

  const style = document.createElement('style');
  style.id = 'cnmi-v247-outing-permission-fix-style';
  style.textContent = `
    .v247-eligibility-page .position-check small{display:block}
    .v247-eligibility-page .position-check input[data-position-code^="OUTING:"] + span b::after{content:' ออกหน่วย';font-size:11px;font-weight:800;color:#0284c7;background:#e0f2fe;border-radius:999px;padding:1px 7px;margin-left:6px;white-space:nowrap}
    @media(max-width:720px){.v247-eligibility-page .position-check input[data-position-code^="OUTING:"] + span b::after{display:inline-block;margin-top:3px}}
  `;
  document.head.appendChild(style);

  patchConfigApis();
  setTimeout(() => { patchConfigApis(); try { const st = appState(); if (st?.page === 'positionManagement' && window.cnmiV244PositionPermissions?.currentTab?.() === 'permissions') renderPermissionsStable(); } catch (_) {} }, 120);
  setTimeout(patchConfigApis, 650);

  console.info(`${VERSION} loaded`);
})();
