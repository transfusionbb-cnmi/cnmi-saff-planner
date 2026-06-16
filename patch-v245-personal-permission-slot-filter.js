/* =========================
   V245 Personal Permission Slot Filter
   - In “สิทธิ์เฉพาะบุคคล”, choose staff + choose slot set first.
   - The checkbox list shows only positions from the selected Slot Master set.
   - Keeps existing daily_position_eligibility data and save logic.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V245_PERSONAL_PERMISSION_SLOT_FILTER';
  if (window.__CNMI_V245_PERSONAL_PERMISSION_SLOT_FILTER__) return;
  window.__CNMI_V245_PERSONAL_PERMISSION_SLOT_FILTER__ = true;

  const KIND_KEY = 'cnmi_personal_permission_slot_kind_v245';
  const COUNT_KEY = 'cnmi_personal_permission_slot_count_v245';
  const DAY_SETS = [8,9,10,11,12,13,14];

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function adminSafe(){
    try { return !!isAdmin(); } catch (_) { return !!(state && state.profile && state.profile.role === 'admin'); }
  }
  function staffName(st){ return st ? (st.nickname || st.full_name || st.email || '-') : '-'; }
  function activeStaffRows(){
    const rows = ((state && state.staff) || []).filter(s => s && s.is_active !== false);
    try { return orderedStaff(rows); } catch (_) { return rows; }
  }
  function readKind(){
    const fromState = state && state.personalPermissionSlotKindV245;
    const raw = fromState || (() => { try { return localStorage.getItem(KIND_KEY); } catch (_) { return ''; } })();
    return String(raw || 'day') === 'outing' ? 'outing' : 'day';
  }
  function readCount(){
    const raw = (state && state.personalPermissionSlotCountV245) || (() => { try { return localStorage.getItem(COUNT_KEY); } catch (_) { return ''; } })() || state?.baseSlotCountV231 || 14;
    const n = Math.max(8, Math.min(14, Math.round(Number(raw) || 14)));
    return DAY_SETS.includes(n) ? n : 14;
  }
  function setKind(v){
    const kind = String(v || 'day') === 'outing' ? 'outing' : 'day';
    if (state) state.personalPermissionSlotKindV245 = kind;
    try { localStorage.setItem(KIND_KEY, kind); } catch (_) {}
    return kind;
  }
  function setCount(v){
    const n = Math.max(8, Math.min(14, Math.round(Number(v) || 14)));
    const count = DAY_SETS.includes(n) ? n : 14;
    if (state) state.personalPermissionSlotCountV245 = count;
    try { localStorage.setItem(COUNT_KEY, String(count)); } catch (_) {}
    return count;
  }
  function safeConfigs(){
    try {
      const cfg = window.cnmiV224?.currentConfigs?.() || window.cnmiV226?.currentConfigs226?.() || window.cnmiV227?.currentConfigs226?.();
      if (cfg && typeof cfg === 'object') return cfg;
    } catch (_) {}
    return null;
  }
  function normalizeZone(row){
    const raw = String(row?.zone || '').trim();
    const code = String(row?.code || row?.position_code || '').trim();
    if (raw === 'ออกหน่วย') return 'ออกหน่วย';
    if (raw === 'Manual') return 'Manual';
    if (/^BB-Manual/i.test(code) || /manual/i.test(code)) return 'Manual';
    if (raw === 'Donor Room' || /^DR-/i.test(code)) return 'Donor Room';
    if (raw === 'Blood Bank' || /^BB-/i.test(code)) return 'Blood Bank';
    return raw || 'Blood Bank';
  }
  function normalizeRow(row, i, isOutingSet){
    const code = String(row?.code || row?.position_code || '').trim();
    if (!code) return null;
    const zone = normalizeZone(row);
    const isOuting = isOutingSet || row?.is_outing === true || zone === 'ออกหน่วย' || String(row?.eligibility_code || '').startsWith('OUTING:');
    return {
      ...row,
      code,
      position_code: code,
      zone,
      main_rule: String(row?.main_rule || '').trim() || '-',
      break_time: String(row?.break_time || '').trim() || (isOuting ? 'ออกหน่วย' : '-'),
      job_desc: String(row?.job_desc || row?.detail || '').trim() || '',
      sort_order: Number(row?.sort_order || row?.order || i + 1) || i + 1,
      is_outing: isOuting,
      eligibility_code: String(row?.eligibility_code || '').trim() || (isOuting && zone === 'ออกหน่วย' ? `OUTING:${code}` : code)
    };
  }
  function fallbackRows(kind){
    try {
      const rows = kind === 'outing'
        ? (window.cnmiPositionCatalogV182?.outingPositions182?.() || [])
        : (window.cnmiPositionCatalogV182?.normalPositions182?.() || []);
      return rows.map((r,i) => normalizeRow(r, i, kind === 'outing')).filter(Boolean);
    } catch (_) { return []; }
  }
  function selectedSlotRows(){
    const kind = readKind();
    const count = readCount();
    const cfg = safeConfigs();
    let rows = [];
    if (cfg) rows = kind === 'outing' ? (cfg.outing || []) : (cfg.day?.[count] || cfg.day?.[String(count)] || []);
    if (!Array.isArray(rows) || !rows.length) rows = fallbackRows(kind);
    return rows.map((r,i) => normalizeRow(r, i, kind === 'outing')).filter(Boolean).sort((a,b) => (Number(a.sort_order || 999) - Number(b.sort_order || 999)) || String(a.code).localeCompare(String(b.code), 'th'));
  }
  function ruleOk(staff, mainRule){
    try { return positionRuleOk(staff, mainRule); } catch (_) { return true; }
  }
  function isEligible(staff, key){
    try { return positionEligible(staff, key); } catch (_) { return true; }
  }
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
    const countOptions = DAY_SETS.map(n => `<option value="${n}" ${n===count?'selected':''}>${n} คน</option>`).join('');
    const label = kind === 'outing' ? 'วันที่ออกหน่วย' : `วันทำงานปกติ ${count} คน`;
    return `<div class="card v245-permission-filter-card">
      <div class="section-title compact"><div><h3>เลือกชุด Slot ก่อนติ๊กสิทธิ์</h3><p class="hint">แต่ละชุด Slot มีตำแหน่งไม่เหมือนกัน จึงแสดงเฉพาะตำแหน่งของชุดที่เลือกอยู่</p></div></div>
      <div class="v245-permission-filter-grid">
        <label>ประเภท Slot
          <select id="eligibilitySlotKindV245" data-v245-permission-kind>
            <option value="day" ${kind==='day'?'selected':''}>วันทำงานปกติ 8-14 คน</option>
            <option value="outing" ${kind==='outing'?'selected':''}>วันที่ออกหน่วย</option>
          </select>
        </label>
        <label class="${kind==='outing'?'hidden':''}">จำนวนคน
          <select id="eligibilitySlotCountV245" data-v245-permission-count>${countOptions}</select>
        </label>
        <div class="v245-selected-slot-note"><b>${esc(label)}</b><small>${rows.length} Slot ในชุดนี้</small></div>
      </div>
      <div class="notice soft-notice compact"><b>หลักคิด:</b> Slot Master เป็นกฎตั้งต้น ส่วนหน้านี้ใช้ติ๊ก override รายคนเฉพาะตำแหน่งที่คนนั้นทำได้จริง</div>
    </div>`;
  }
  function renderEligibilityPageV245(){
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
    const slotName = kind === 'outing' ? 'วันที่ออกหน่วย' : `วันทำงานปกติ ${count} คน`;

    return `<div class="v245-eligibility-page">
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
              const eligibilityKey = p.eligibility_code || p.code;
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

  try { window.renderEligibilityPage = renderEligibilityPage = renderEligibilityPageV245; } catch (_) { window.renderEligibilityPage = renderEligibilityPageV245; }
  try { window.renderPositionEligibilityMatrix = renderPositionEligibilityMatrix = function(){ return renderEligibilityPageV245(); }; } catch (_) { window.renderPositionEligibilityMatrix = function(){ return renderEligibilityPageV245(); }; }

  function rerenderPermissions(){
    try { window.cnmiV244PositionPermissions?.setTab?.('permissions'); } catch (_) {}
    if (state) state.positionManagementSubtabV244 = 'permissions';
    try { renderPage(); }
    catch (_) { try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); } catch (__) {} }
  }

  document.addEventListener('change', function(e){
    const kind = e.target?.closest?.('[data-v245-permission-kind]');
    if (kind) {
      e.preventDefault();
      setKind(kind.value);
      rerenderPermissions();
      return;
    }
    const count = e.target?.closest?.('[data-v245-permission-count]');
    if (count) {
      e.preventDefault();
      setCount(count.value);
      rerenderPermissions();
      return;
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v245-permission-filter-card{margin-bottom:14px;background:#f8fbff;border-color:#dbeafe}
    .v245-permission-filter-grid{display:grid;grid-template-columns:minmax(220px,300px) minmax(160px,220px) minmax(220px,1fr);gap:12px;align-items:end}
    .v245-permission-filter-grid label{display:flex;flex-direction:column;gap:6px;font-weight:700;color:#334155}
    .v245-selected-slot-note{min-height:44px;border:1px solid #bae6fd;background:#e0f2fe;border-radius:14px;padding:10px 14px;display:flex;flex-direction:column;justify-content:center}
    .v245-selected-slot-note b{color:#075985}.v245-selected-slot-note small{font-size:12px;color:#64748b}
    .v245-permission-layout{align-items:start}.v245-position-card-grid .position-check b{font-size:14px}.v245-position-card-grid .position-check small{line-height:1.25}
    @media(max-width:860px){.v245-permission-filter-grid{grid-template-columns:1fr}.v245-selected-slot-note{min-height:0}.v245-permission-layout{display:block}.v245-permission-layout>.card{margin-bottom:12px}}
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    try {
      if (state?.page === 'positionManagement' && window.cnmiV244PositionPermissions?.currentTab?.() === 'permissions') rerenderPermissions();
    } catch (_) {}
  }, 260);

  console.info(`${VERSION} loaded`);
})();
