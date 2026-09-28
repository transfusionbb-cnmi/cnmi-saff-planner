
/* Original source: patch-v245-personal-permission-slot-filter.js */
try {
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

} catch (error) { console.error("[v569] patch-v245-personal-permission-slot-filter.js", error); }
;

/* Original source: patch-v246-mobile-position-menu-fix.js */
try {
/* =========================
   V246 Mobile Position Menu Fix
   - Mobile-only responsive polish for Position Management.
   - Fixes iPhone/phone drawer scrolling and prevents horizontal clipping in Slot/Permission tabs.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V246_MOBILE_POSITION_MENU_FIX';
  if (window.__CNMI_V246_MOBILE_POSITION_MENU_FIX__) return;
  window.__CNMI_V246_MOBILE_POSITION_MENU_FIX__ = true;

  const style = document.createElement('style');
  style.id = 'cnmi-v246-mobile-position-menu-fix-style';
  style.textContent = `
    /* Phone drawer: keep header/footer visible and make the menu itself scrollable on iOS/Safari */
    @media (max-width: 820px) {
      html, body { max-width: 100%; overflow-x: hidden; }
      #appView.app-view { grid-template-columns: minmax(0, 1fr) !important; width: 100% !important; }
      #appView .main-panel, #pageContent.page-content { min-width: 0 !important; max-width: 100vw !important; }
      #sidebar.sidebar {
        position: fixed !important;
        inset: 0 auto 0 0 !important;
        width: min(86vw, 320px) !important;
        max-width: 86vw !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        padding: 14px 12px !important;
        z-index: 80 !important;
        transform: translateX(-105%) !important;
      }
      #sidebar.sidebar.open { transform: translateX(0) !important; }
      #sidebar .sidebar-head { flex: 0 0 auto !important; margin-bottom: 10px !important; }
      #sidebar #mainNav.main-nav {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        overscroll-behavior: contain !important;
        touch-action: pan-y !important;
        padding: 0 4px 12px 0 !important;
      }
      #sidebar .sidebar-foot {
        flex: 0 0 auto !important;
        position: relative !important;
        bottom: auto !important;
        margin-top: 10px !important;
        padding-top: 10px !important;
        padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
      }
      #sidebar .nav-btn {
        min-height: 42px !important;
        padding: 10px 10px !important;
        border-radius: 14px !important;
        font-size: 14px !important;
      }
      #sidebar .nav-btn span:last-child {
        white-space: normal !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 2 !important;
        -webkit-box-orient: vertical !important;
        overflow: hidden !important;
      }
      #sidebar .nav-section-title {
        position: sticky !important;
        top: 0 !important;
        z-index: 2 !important;
        background: linear-gradient(180deg, #d9efff, rgba(217,239,255,.94)) !important;
        padding: 7px 6px 5px !important;
        margin: 4px 0 2px !important;
        border-radius: 12px !important;
      }
      .topbar { max-width: 100vw !important; }
      .topbar > div:nth-child(2) { min-width: 0 !important; }
      .topbar #pageTitle { font-size: 22px !important; line-height: 1.15 !important; }
      .topbar #pageSubtitle { font-size: 14px !important; line-height: 1.25 !important; overflow-wrap: anywhere !important; }
    }

    /* Position Management: phone-only, remove horizontal clipping and turn the wide table into cards */
    @media (max-width: 720px) {
      .v244-position-management-page,
      .v244-position-management-page * { min-width: 0; }
      .v244-position-management-page {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }
      .v244-position-management-page .card {
        border-radius: 18px !important;
        padding: 14px !important;
        max-width: 100% !important;
      }
      .v244-position-management-page h3 { font-size: 18px !important; line-height: 1.25 !important; }
      .v244-position-management-page .hint,
      .v244-position-management-page p,
      .v244-position-management-page small,
      .v244-position-management-page em {
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }

      .v244-position-tabs-card { margin-bottom: 12px !important; }
      .v244-position-tabs-card .section-title { display: block !important; margin-bottom: 10px !important; }
      .v244-position-tabs-card .section-title .hint { font-size: 13px !important; line-height: 1.35 !important; }
      .v244-position-tabs {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
        align-items: stretch !important;
      }
      .v244-position-tab {
        width: 100% !important;
        min-width: 0 !important;
        padding: 10px 8px !important;
        border-radius: 16px !important;
        text-align: center !important;
      }
      .v244-position-tab b { font-size: 14px !important; line-height: 1.22 !important; }
      .v244-position-tab small { font-size: 11px !important; line-height: 1.18 !important; }

      .v224-slot-crud-card .section-title,
      .v245-permission-filter-card .section-title,
      .eligibility-position-panel .section-title {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
        align-items: start !important;
      }
      .v224-slot-crud-card .section-title .actions,
      .v224-slot-crud-card .section-title .v232-default-slot-actions,
      .eligibility-position-panel .section-title .actions {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 8px !important;
      }
      .v224-slot-crud-card .section-title button,
      .v232-default-slot-actions button,
      .eligibility-position-panel [data-save-position-eligibility] {
        width: 100% !important;
        white-space: normal !important;
      }

      .v224-template-toolbar {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
        align-items: end !important;
        padding: 10px !important;
        margin: 10px 0 !important;
      }
      .v224-template-toolbar label,
      .v224-template-toolbar button {
        width: 100% !important;
        min-width: 0 !important;
      }
      .v224-template-toolbar select { width: 100% !important; }

      .v224-slot-table {
        overflow: visible !important;
        border: 0 !important;
        background: transparent !important;
      }
      .v224-slot-table table,
      .v224-slot-table thead,
      .v224-slot-table tbody,
      .v224-slot-table tr,
      .v224-slot-table td {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
      }
      .v224-slot-table thead { display: none !important; }
      .v224-slot-table tr {
        background: #fff !important;
        border: 1px solid #dbeafe !important;
        border-radius: 16px !important;
        padding: 10px !important;
        margin-bottom: 10px !important;
        box-shadow: 0 6px 18px rgba(15,23,42,.04) !important;
      }
      .v224-slot-table td {
        border: 0 !important;
        padding: 5px 4px !important;
        line-height: 1.35 !important;
      }
      .v224-slot-table td:nth-child(1) { display: none !important; }
      .v224-slot-table td:nth-child(2) b { font-size: 16px !important; }
      .v224-slot-table td:nth-child(3)::before { content: 'โซน: '; font-weight: 800; color: #64748b; }
      .v224-slot-table td:nth-child(4)::before { content: 'ผู้ปฏิบัติหลัก: '; font-weight: 800; color: #64748b; }
      .v224-slot-table td:nth-child(5)::before { content: 'เวลาพัก: '; font-weight: 800; color: #64748b; }
      .v224-slot-table td:nth-child(6)::before { content: 'หน้าที่: '; font-weight: 800; color: #64748b; }
      .v224-desc-cell {
        min-width: 0 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }
      .v224-actions-cell {
        min-width: 0 !important;
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 6px !important;
        padding-top: 8px !important;
      }
      .v224-actions-cell .tiny-btn { width: 100% !important; }

      .v245-permission-filter-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }
      .v245-permission-filter-grid label,
      .v245-permission-filter-grid select { width: 100% !important; }
      .v245-selected-slot-note {
        min-height: 0 !important;
        padding: 10px 12px !important;
      }
      .v245-permission-layout,
      .eligibility-page.v245-permission-layout {
        display: block !important;
      }
      .v245-permission-layout > .card { margin-bottom: 12px !important; }
      .eligibility-staff-panel { position: static !important; }
      .selected-staff-card { padding: 14px !important; border-radius: 18px !important; }
      .big-staff-name { font-size: 24px !important; }
      .position-card-grid,
      .v245-position-card-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }
      .position-zone-card {
        border-radius: 18px !important;
        padding: 12px !important;
      }
      .position-check {
        grid-template-columns: 22px minmax(0, 1fr) !important;
        gap: 9px !important;
        padding: 10px !important;
        border-radius: 14px !important;
      }
      .position-check em {
        display: block !important;
        line-height: 1.35 !important;
      }
    }

    @media (max-width: 380px) {
      .v244-position-tabs,
      .v224-template-toolbar {
        grid-template-columns: 1fr !important;
      }
      .v244-position-tab small { display: none !important; }
    }
  `;
  document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v246-mobile-position-menu-fix.js", error); }
;

/* Original source: patch-v247-outing-permission-key-and-render-fix.js */
try {
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

} catch (error) { console.error("[v569] patch-v247-outing-permission-key-and-render-fix.js", error); }
;

/* Original source: patch-v248-personal-permission-persist-fix.js */
try {
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

} catch (error) { console.error("[v569] patch-v248-personal-permission-persist-fix.js", error); }
;

/* Original source: patch-v249-mobile-position-compare-compact.js */
try {
(function(){
  const VERSION = 'V249_MOBILE_POSITION_COMPARE_COMPACT';
  function injectStyle(){
    if (document.getElementById('v249-mobile-position-compare-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'v249-mobile-position-compare-compact-style';
    style.textContent = `
@media (max-width: 760px){
  /* Daily/month position page: make mobile view compare like desktop columns */
  .v225-positions-page,
  .v226-positions-page{
    padding: 14px !important;
  }
  .v225-positions-page .v225-position-note,
  .v226-positions-page .v225-position-note{
    font-size: 14px !important;
    line-height: 1.45 !important;
  }
  .v225-compare-cards{
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }
  .v225-compare-cards > div{
    min-width: 0 !important;
    padding: 10px 6px !important;
    border-radius: 14px !important;
    text-align: center !important;
  }
  .v225-compare-cards > div b{
    font-size: 22px !important;
    line-height: 1 !important;
  }
  .v225-compare-cards > div span{
    display: block !important;
    font-size: 11px !important;
    line-height: 1.2 !important;
    margin-top: 6px !important;
  }
  .v225-daily-slot-toolbar{
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 6px !important;
    margin-top: 10px !important;
  }
  .v225-daily-slot-toolbar label,
  .v225-daily-slot-toolbar select{
    width: 100% !important;
  }
  .v225-mobile-position-list,
  .mobile-position-list{
    gap: 10px !important;
  }
  .position-mobile-card.v225-position-card{
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    grid-template-areas:
      "head head"
      "meta meta"
      "plan edit"
      "action action" !important;
    gap: 8px 10px !important;
    padding: 14px !important;
    border-radius: 18px !important;
  }
  .position-mobile-card.v225-position-card > .section-title{
    grid-area: head !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    margin: 0 !important;
  }
  .position-mobile-card.v225-position-card > .section-title h3{
    font-size: 20px !important;
    line-height: 1.15 !important;
    margin: 0 !important;
    overflow-wrap: anywhere !important;
  }
  .position-mobile-card.v225-position-card > .section-title .badge{
    flex: 0 0 auto !important;
    font-size: 12px !important;
    padding: 5px 9px !important;
  }
  .position-mobile-card.v225-position-card > .muted{
    grid-area: meta !important;
    font-size: 14px !important;
    line-height: 1.3 !important;
    margin: 0 !important;
  }
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions){
    grid-area: plan !important;
    min-width: 0 !important;
    padding: 9px 8px !important;
    border: 1px solid #dbeafe !important;
    border-radius: 14px !important;
    background: #f8fbff !important;
    font-size: 13px !important;
    line-height: 1.25 !important;
  }
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions) b{
    display: block !important;
    margin-bottom: 5px !important;
    font-size: 12px !important;
    color: #64748b !important;
  }
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions) .staff-pill,
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions) .badge{
    max-width: 100% !important;
    display: inline-flex !important;
    justify-content: center !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    font-size: 14px !important;
    padding: 5px 10px !important;
  }
  .position-mobile-card.v225-position-card > label{
    grid-area: edit !important;
    min-width: 0 !important;
    display: block !important;
    padding: 9px 8px !important;
    border: 1px solid #dbeafe !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    font-size: 12px !important;
    line-height: 1.25 !important;
    color: #64748b !important;
    font-weight: 700 !important;
  }
  .position-mobile-card.v225-position-card > label select{
    margin-top: 5px !important;
    width: 100% !important;
    min-height: 34px !important;
    height: 34px !important;
    padding: 4px 24px 4px 8px !important;
    border-radius: 999px !important;
    font-size: 15px !important;
    text-align: center !important;
    text-align-last: center !important;
  }
  .position-mobile-card.v225-position-card > .actions{
    grid-area: action !important;
    margin: 0 !important;
    display: flex !important;
    justify-content: flex-end !important;
  }
  .position-mobile-card.v225-position-card > .actions .tiny-btn{
    width: auto !important;
    min-height: 32px !important;
    padding: 6px 12px !important;
    font-size: 13px !important;
  }
}
@media (max-width: 390px){
  .v225-compare-cards{ grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .position-mobile-card.v225-position-card{
    grid-template-columns: 1fr !important;
    grid-template-areas:
      "head"
      "meta"
      "plan"
      "edit"
      "action" !important;
  }
}
`;
    document.head.appendChild(style);
  }
  injectStyle();
  window.addEventListener('DOMContentLoaded', injectStyle);
  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !window.__CNMI_V249_RENDER_WRAP__) {
    window.__CNMI_V249_RENDER_WRAP__ = true;
    window.renderPage = renderPage = function renderPageV249(){
      const out = oldRenderPage.apply(this, arguments);
      injectStyle();
      return out;
    };
  }
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v249-mobile-position-compare-compact.js", error); }
;

/* Original source: patch-v250-block-no-duty-on-public-holiday.js */
try {
/* =========================================================
   V250 Block Staff No-Duty on Public Holidays
   - Staff mode: ห้ามบันทึก "ไม่รับเวร" ในวันที่ถูกตั้งเป็นวันหยุดราชการ/นักขัตฤกษ์
   - ครอบคลุมช่วงวันที่หลายวัน ถ้ามีวันหยุดราชการอยู่ในช่วง จะบล็อกก่อนบันทึก
   - Admin ยังบันทึกแทนได้ เพื่อรองรับการแก้ไขย้อนหลัง/ข้อมูลนำเข้าเดิม
   ========================================================= */
(function(){
  'use strict';
  const VERSION_V250 = 'V250_BLOCK_NO_DUTY_ON_PUBLIC_HOLIDAY';

  function safeEsc250(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }

  function normalizeDate250(value){
    try { return normalizeDateKey(value); }
    catch (_) {
      if (!value) return '';
      const text = String(value).trim();
      const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }
  }

  function addDays250(dateKey, days){
    const [y, m, d] = String(dateKey || '').split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + Number(days || 0));
    return normalizeDate250(dt);
  }

  function datesBetween250(start, end){
    const s = normalizeDate250(start);
    const e = normalizeDate250(end || start);
    if (!s || !e) return [];
    if (e < s) return [];
    try { return datesBetween(s, e).map(normalizeDate250).filter(Boolean); }
    catch (_) {
      const out = [];
      let cur = s;
      let guard = 0;
      while (cur && cur <= e && guard < 370) {
        out.push(cur);
        cur = addDays250(cur, 1);
        guard += 1;
      }
      return out;
    }
  }

  function publicHolidayRow250(date){
    const key = normalizeDate250(date);
    const rows = Array.isArray(window.state?.holidays) ? window.state.holidays : (Array.isArray(state?.holidays) ? state.holidays : []);
    return rows.find(row => {
      try { return normalizeDate250(row?.holiday_date || row?.date || row?.work_date || row?.day || row?.start_date || row) === key; }
      catch (_) { return false; }
    }) || null;
  }

  function isPublicHoliday250(date){
    try { if (typeof isHolidayDate === 'function' && isHolidayDate(date)) return true; } catch (_) {}
    return !!publicHolidayRow250(date);
  }

  function publicHolidayName250(date){
    try {
      if (typeof holidayName === 'function') {
        const name = holidayName(date);
        if (name) return String(name);
      }
    } catch (_) {}
    const row = publicHolidayRow250(date);
    if (!row) return 'วันหยุดราชการ/นักขัตฤกษ์';
    if (typeof row === 'string') return row;
    return String(row.title || row.name || row.holiday_name || 'วันหยุดราชการ/นักขัตฤกษ์').split(':::')[0].trim();
  }

  function formatThaiDate250(date){
    try { return formatThaiDate(date); }
    catch (_) { return normalizeDate250(date) || '-'; }
  }

  function isAdmin250(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }

  function buildBlockInfo250(form){
    if (!form) return null;
    // Requirement นี้ตั้งใจบล็อกเฉพาะน้อง/Staff mode เท่านั้น
    if (isAdmin250()) return null;
    const type = String(form.querySelector?.('[name="type"]')?.value || '').trim();
    if (type !== 'ไม่รับเวร') return null;
    const start = normalizeDate250(form.querySelector?.('[name="start_date"]')?.value || '');
    const end = normalizeDate250(form.querySelector?.('[name="end_date"]')?.value || start);
    if (!start || !end || end < start) return null;
    const blockedDates = datesBetween250(start, end).filter(isPublicHoliday250);
    if (!blockedDates.length) return null;
    return {
      dates: blockedDates,
      firstDate: blockedDates[0],
      labels: blockedDates.map(d => `${formatThaiDate250(d)} ${publicHolidayName250(d)}`)
    };
  }

  function blockMessage250(info){
    const detail = (info?.labels || []).slice(0, 3).join(', ');
    const more = (info?.labels || []).length > 3 ? ` และอีก ${(info.labels.length - 3)} วัน` : '';
    return `วันที่เลือกมีวันนักขัตฤกษ์/วันหยุดราชการที่ตั้งไว้แล้ว (${detail}${more}) จึงไม่ต้องลง “ไม่รับเวร” สำหรับวันนั้น`;
  }

  function updateLeaveFormHolidayGuard250(form){
    if (!form) return;
    const old = form.querySelector('[data-v250-no-duty-holiday-warning]');
    const submit = form.querySelector('button[type="submit"]');
    const info = buildBlockInfo250(form);
    if (info) {
      const html = `<div class="notice soft-notice wide" data-v250-no-duty-holiday-warning><b>บันทึกไม่ได้:</b> ${safeEsc250(blockMessage250(info))}<br><span class="hint">วันนักขัตฤกษ์ที่ Admin ตั้งไว้ ระบบถือว่าเป็นวันหยุดอยู่แล้ว ไม่ต้องส่งรายการไม่รับเวรซ้ำ</span></div>`;
      if (old) old.outerHTML = html;
      else if (submit) submit.insertAdjacentHTML('beforebegin', html);
      if (submit) {
        submit.dataset.v250Disabled = '1';
        submit.disabled = true;
        submit.classList.add('disabled-by-v250');
      }
    } else {
      if (old) old.remove();
      if (submit && submit.dataset.v250Disabled === '1') {
        submit.disabled = false;
        delete submit.dataset.v250Disabled;
        submit.classList.remove('disabled-by-v250');
      }
    }
  }

  const previousRenderLeavePage250 = window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null);
  if (previousRenderLeavePage250) {
    const patchedRender = function renderLeavePageV250(){
      let html = previousRenderLeavePage250.apply(this, arguments);
      const note = `<div class="notice soft-notice wide" data-v250-no-duty-holiday-note>หมายเหตุ: กรณี “ไม่รับเวร” ห้ามเลือกวันที่เป็นวันนักขัตฤกษ์/วันหยุดราชการที่ Admin ตั้งไว้ เพราะระบบนับเป็นวันหยุดให้อยู่แล้ว</div>`;
      if (String(html).includes('data-v250-no-duty-holiday-note')) return html;
      return String(html).replace(/<button class="primary-btn wide" type="submit">/i, `${note}<button class="primary-btn wide" type="submit">`);
    };
    window.renderLeavePage = patchedRender;
    try { renderLeavePage = patchedRender; } catch (_) {}
  }

  const previousSaveLeave250 = window.saveLeave || (typeof saveLeave === 'function' ? saveLeave : null);
  if (previousSaveLeave250) {
    const patchedSave = async function saveLeaveV250(form){
      const info = buildBlockInfo250(form);
      if (info) {
        updateLeaveFormHolidayGuard250(form);
        try { showToast(blockMessage250(info)); } catch (_) { alert(blockMessage250(info)); }
        const input = form?.querySelector?.('[name="start_date"]');
        try { input?.focus?.(); } catch (_) {}
        return;
      }
      return previousSaveLeave250.apply(this, arguments);
    };
    window.saveLeave = patchedSave;
    try { saveLeave = patchedSave; } catch (_) {}
  }

  document.addEventListener('change', function(e){
    const form = e.target?.closest?.('#leaveForm');
    if (!form) return;
    if (['type', 'start_date', 'end_date'].includes(e.target?.name)) updateLeaveFormHolidayGuard250(form);
  }, true);

  document.addEventListener('input', function(e){
    const form = e.target?.closest?.('#leaveForm');
    if (!form) return;
    if (['type', 'start_date', 'end_date'].includes(e.target?.name)) updateLeaveFormHolidayGuard250(form);
  }, true);

  document.addEventListener('DOMContentLoaded', function(){
    updateLeaveFormHolidayGuard250(document.querySelector('#leaveForm'));
  });

  // หลัง renderPage เปลี่ยนหน้า ให้ประเมินซ้ำแบบเบา ๆ โดยไม่รบกวน flow เดิม
  const previousRenderPage250 = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage250) {
    const patchedRenderPage = function renderPageV250(){
      const result = previousRenderPage250.apply(this, arguments);
      setTimeout(() => updateLeaveFormHolidayGuard250(document.querySelector('#leaveForm')), 0);
      return result;
    };
    window.renderPage = patchedRenderPage;
    try { renderPage = patchedRenderPage; } catch (_) {}
  }

  console.info(`[${VERSION_V250}] staff no-duty on configured public holidays is blocked`);
})();

} catch (error) { console.error("[v569] patch-v250-block-no-duty-on-public-holiday.js", error); }
;

/* Original source: patch-v252-month-position-slot-identity-fix.js */
try {
/* =========================
   V252 Monthly Position Slot Identity Fix
   - Keep duplicate duties as separate slots (e.g. DR-Finger+Interview 1/2, DR-Main 1/2).
   - Migrate legacy unnumbered monthly rows in memory so 13 staff = 13 slots.
   - Preserve old personal-permission rows as fallback until Admin saves the new per-slot permissions.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V252_MONTH_POSITION_SLOT_IDENTITY_FIX';
  if (window.__CNMI_V252_MONTH_POSITION_SLOT_IDENTITY_FIX__) return;
  window.__CNMI_V252_MONTH_POSITION_SLOT_IDENTITY_FIX__ = true;

  const NUMBERED_FAMILIES = ['DR-Finger+Interview', 'DR-Main'];

  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function currentMonthKey(){
    const raw = state?.page === 'positionMonthView'
      ? (state.positionMonthViewKey || state.monthKey)
      : (state?.positionMonthKey || state?.monthKey);
    return String(raw || new Date().toISOString().slice(0, 7)).slice(0, 7);
  }
  function familyBase(code){
    const text = String(code || '').trim();
    for (const base of NUMBERED_FAMILIES) {
      if (text === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+$`).test(text)) return base;
    }
    return '';
  }
  function slotCode(row){ return String(row?.code || row?.position_code || '').trim(); }
  function cloneRow(row){ return row && typeof row === 'object' ? { ...row } : row; }

  function makeUniqueRuntimeRows(rows){
    const list = (rows || []).map(cloneRow).filter(Boolean);
    const totals = new Map();
    list.forEach(r => {
      const code = slotCode(r);
      if (code) totals.set(code, (totals.get(code) || 0) + 1);
    });
    const seen = new Map();
    return list.map(r => {
      const code = slotCode(r);
      if (!code || (totals.get(code) || 0) <= 1) return r;
      const no = (seen.get(code) || 0) + 1;
      seen.set(code, no);
      const uniqueCode = `${code} ${no}`;
      const eligibility = String(r.eligibility_code || '').trim();
      return {
        ...r,
        code: uniqueCode,
        position_code: uniqueCode,
        eligibility_code: !eligibility || eligibility === code ? uniqueCode : eligibility,
        legacy_position_code: code
      };
    });
  }

  function canonicalizeRuntimeSlotSets(){
    try {
      const api = window.cnmiDayPositionSlotsV218;
      const sets = api?.DAY_POSITION_SLOT_SETS_218 || api?.DAY_POSITION_SLOT_SETS;
      if (!sets) return;
      [8,9,10,11,12,13,14].forEach(n => {
        if (Array.isArray(sets[n])) sets[n] = makeUniqueRuntimeRows(sets[n]);
      });
      api.DAY_POSITION_SLOT_SETS_218 = sets;
      api.DAY_POSITION_SLOT_SETS = sets;
    } catch (err) {
      console.warn(`${VERSION}: runtime slot normalization skipped`, err);
    }
  }

  function expectedForDate(date){
    const d = normDate(date);
    if (!d) return [];
    try {
      const rows = window.cnmiV231?.expectedTemplatesForDate231?.(d);
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }

  function staffOrderIndex(){
    const map = new Map();
    let list = state?.staff || [];
    try { if (typeof orderedStaff === 'function') list = orderedStaff(list); } catch (_) {}
    list.forEach((s, i) => map.set(String(s?.id || ''), i));
    return map;
  }

  function normalizeLegacyRows(rows, monthKey){
    if (!Array.isArray(rows) || !rows.length) return rows || [];
    const order = staffOrderIndex();
    const byDate = new Map();
    rows.forEach((row, index) => {
      const d = normDate(row?.work_date);
      if (!d || (monthKey && !d.startsWith(monthKey))) return;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push({ row, index });
    });

    byDate.forEach((items, date) => {
      const expected = expectedForDate(date);
      if (!expected.length) return;
      NUMBERED_FAMILIES.forEach(base => {
        const variants = expected.map(slotCode).filter(code => familyBase(code) === base);
        if (variants.length <= 1) return;

        const familyRows = items.filter(item => familyBase(item.row?.position_code || item.row?.code) === base);
        if (!familyRows.length) return;
        familyRows.sort((a,b) => {
          const oa = order.get(String(a.row?.staff_id || '')) ?? 9999;
          const ob = order.get(String(b.row?.staff_id || '')) ?? 9999;
          return oa - ob || a.index - b.index;
        });

        const variantSet = new Set(variants);
        const used = new Set();
        familyRows.forEach(item => {
          const code = String(item.row?.position_code || item.row?.code || '').trim();
          if (variantSet.has(code)) used.add(code);
        });
        const available = variants.filter(code => !used.has(code));

        familyRows.forEach(item => {
          const current = String(item.row?.position_code || item.row?.code || '').trim();
          if (variantSet.has(current)) return;
          const next = available.shift();
          if (!next) return;
          item.row.position_code = next;
          if (Object.prototype.hasOwnProperty.call(item.row, 'code')) item.row.code = next;
          item.row._v252_legacy_slot_code = current;
        });
      });
    });
    return rows;
  }

  function normalizeStateMonthRows(){
    try {
      if (!window.state) return;
      const key = currentMonthKey();
      canonicalizeRuntimeSlotSets();
      if (Array.isArray(state.positions)) normalizeLegacyRows(state.positions, key);
      if (state.monthPositionDraft?.monthKey === key && Array.isArray(state.monthPositionDraft.rows)) {
        normalizeLegacyRows(state.monthPositionDraft.rows, key);
      }
    } catch (err) {
      console.warn(`${VERSION}: monthly row migration skipped`, err);
    }
  }

  const oldPositionEligible = window.positionEligible || (typeof positionEligible === 'function' ? positionEligible : null);
  function positionEligibleV252(staff, positionCode){
    if (!staff || !positionCode) return false;
    const key = String(positionCode || '').trim();
    try {
      const rows = state?.positionEligibility || [];
      const exact = rows.find(x => String(x?.staff_id) === String(staff.id) && String(x?.position_code) === key);
      if (exact) return !!exact.is_eligible;
      const base = familyBase(key);
      if (base && base !== key) {
        const legacy = rows.find(x => String(x?.staff_id) === String(staff.id) && String(x?.position_code) === base);
        if (legacy) return !!legacy.is_eligible;
      }
    } catch (_) {}
    return oldPositionEligible ? oldPositionEligible(staff, key) : true;
  }
  try { window.positionEligible = positionEligible = positionEligibleV252; }
  catch (_) { window.positionEligible = positionEligibleV252; }

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !oldRenderPage.__v252Wrapped) {
    const wrapped = function renderPageV252(){
      normalizeStateMonthRows();
      return oldRenderPage.apply(this, arguments);
    };
    wrapped.__v252Wrapped = true;
    window.renderPage = wrapped;
    try { renderPage = wrapped; } catch (_) {}
  }

  const oldRenderPositionMonthPage = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage && !oldRenderPositionMonthPage.__v252Wrapped) {
    const wrappedMonth = function renderPositionMonthPageV252(){
      normalizeStateMonthRows();
      return oldRenderPositionMonthPage.apply(this, arguments);
    };
    wrappedMonth.__v252Wrapped = true;
    window.renderPositionMonthPage = wrappedMonth;
    try { renderPositionMonthPage = wrappedMonth; } catch (_) {}
  }

  canonicalizeRuntimeSlotSets();
  normalizeStateMonthRows();
  [80, 260, 700, 1200].forEach(ms => setTimeout(() => {
    canonicalizeRuntimeSlotSets();
    normalizeStateMonthRows();
  }, ms));

  window.cnmiV252 = { canonicalizeRuntimeSlotSets, normalizeLegacyRows, normalizeStateMonthRows, familyBase };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v252-month-position-slot-identity-fix.js", error); }
;

/* Original source: patch-v253-admin-holiday-unrestricted.js */
try {
/* =========================================================
   V253 Admin Holiday Unrestricted Save
   - Admin mode can always add/update public holidays.
   - Holiday title is optional; blank becomes "วันหยุดราชการ".
   - Uses an actual-admin check rather than staff-facing restrictions.
   - Preserves encoded holiday duty rules when editing an existing date.
   ========================================================= */
(function(){
  'use strict';
  const VERSION_V253 = 'V253_ADMIN_HOLIDAY_UNRESTRICTED';
  const DUTY_RULE_MARKER_V253 = ':::DUTY_RULES:';

  function actualAdmin253(){
    try {
      if (typeof window.isActualAdmin === 'function') return !!window.isActualAdmin();
    } catch (_) {}
    return String(window.state?.profile?.role || '').trim().toLowerCase() === 'admin';
  }

  function adminMode253(){
    if (!actualAdmin253()) return false;
    try {
      if (typeof window.getViewAsMode === 'function') return window.getViewAsMode() === 'admin';
    } catch (_) {}
    try {
      if (typeof isAdmin === 'function') return !!isAdmin();
    } catch (_) {}
    return true;
  }

  function toast253(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { window.alert(message); }
  }

  function cleanTitle253(value){
    const raw = String(value || '');
    const markerAt = raw.indexOf(DUTY_RULE_MARKER_V253);
    return (markerAt >= 0 ? raw.slice(0, markerAt) : raw).trim();
  }

  function ruleSuffix253(value){
    const raw = String(value || '');
    const markerAt = raw.indexOf(DUTY_RULE_MARKER_V253);
    return markerAt >= 0 ? raw.slice(markerAt).trim() : '';
  }

  function applyHolidayForm253(){
    const form = document.getElementById('holidayForm');
    if (!form) return;

    // Validate ourselves so a blank optional title never blocks the submit event.
    form.noValidate = true;
    form.setAttribute('novalidate', 'novalidate');

    const title = form.querySelector('[name="title"]');
    if (title) {
      title.required = false;
      title.removeAttribute('required');
      title.placeholder = 'เว้นว่างได้ ระบบจะใช้ “วันหยุดราชการ”';
    }

    if (!form.querySelector('[data-v253-holiday-help]')) {
      const button = form.querySelector('button[type="submit"]');
      const help = document.createElement('div');
      help.className = 'hint wide';
      help.dataset.v253HolidayHelp = '1';
      help.textContent = 'Admin ระบุวันที่อย่างเดียวได้ หากไม่ใส่ชื่อ ระบบจะบันทึกเป็น “วันหยุดราชการ”';
      if (button) button.insertAdjacentElement('beforebegin', help);
      else form.appendChild(help);
    }
  }

  async function saveHoliday253(form){
    if (!actualAdmin253()) {
      toast253('บัญชีนี้ไม่ใช่ Admin จึงไม่สามารถตั้งวันหยุดราชการได้', 'error');
      return;
    }
    if (!adminMode253()) {
      toast253('กรุณาสลับเป็น Admin mode ก่อนตั้งวันหยุดราชการ', 'error');
      return;
    }

    const fd = new FormData(form);
    const date = String(fd.get('holiday_date') || '').trim();
    let title = String(fd.get('title') || '').trim();
    if (!date) {
      toast253('กรุณาเลือกวันที่วันหยุดราชการ', 'error');
      form.querySelector('[name="holiday_date"]')?.focus();
      return;
    }

    const existing = (window.state?.holidays || []).find(h => String(h?.holiday_date || '') === date);
    const existingTitle = String(existing?.title || existing?.name || existing?.holiday_name || '');
    if (!title) title = cleanTitle253(existingTitle) || 'วันหยุดราชการ';

    // The holiday-rules page stores duty configuration after the visible title.
    // Keep that configuration when the simple scheduler form updates the name/date.
    const suffix = ruleSuffix253(existingTitle);
    const storedTitle = suffix ? `${title} ${suffix}` : title;
    const row = {
      holiday_date: date,
      title: storedTitle,
      updated_by: (typeof currentStaffId === 'function' ? currentStaffId() : window.state?.profile?.id || null)
    };

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const result = await sb.from('public_holidays').upsert(row, { onConflict:'holiday_date' }).select('*').maybeSingle();
      if (result.error) {
        const msg = String(result.error.message || result.error);
        const isPolicy = /row-level security|policy|permission denied|not authorized|42501/i.test(msg);
        toast253(isPolicy
          ? 'ฐานข้อมูลยังไม่อนุญาตให้ Admin บันทึกวันหยุด กรุณารันไฟล์ supabase_v253_admin_public_holidays_policy.sql ใน Supabase SQL Editor 1 ครั้ง'
          : `บันทึกวันหยุดไม่สำเร็จ: ${msg}`, 'error');
        return;
      }

      if (window.state) {
        const saved = result.data || row;
        const others = (window.state.holidays || []).filter(h => String(h?.holiday_date || '') !== date);
        window.state.holidays = [...others, saved].sort((a,b) => String(a.holiday_date || '').localeCompare(String(b.holiday_date || '')));
        window.state.rosterDraft = null;
      }

      try { await loadAllData(); } catch (err) { console.warn(`${VERSION_V253} reload warning`, err); }
      try { renderPage(); } catch (_) {}
      toast253(`บันทึกวันหยุด ${date} แล้ว`);
    } catch (err) {
      console.error(`${VERSION_V253} save failed`, err);
      toast253(`บันทึกวันหยุดไม่สำเร็จ: ${err?.message || err}`, 'error');
    } finally {
      if (button && document.contains(button)) button.disabled = false;
    }
  }

  // Capture before legacy submit handlers so the holiday is saved only once.
  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'holidayForm') return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    saveHoliday253(e.target);
  }, true);

  const previousRenderPage253 = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage253) {
    const patchedRenderPage253 = function(){
      const result = previousRenderPage253.apply(this, arguments);
      setTimeout(applyHolidayForm253, 0);
      return result;
    };
    window.renderPage = patchedRenderPage253;
    try { renderPage = patchedRenderPage253; } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', function(){ setTimeout(applyHolidayForm253, 0); });
  window.saveHolidayV253 = saveHoliday253;
  console.info(`[${VERSION_V253}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v253-admin-holiday-unrestricted.js", error); }
;

/* Original source: patch-v254-leave-status-filter-admin-first.js */
try {
/* =========================================================
   V254 Admin Leave Status Filter + Pending First
   - เพิ่มตัวกรอง "สถานะ" ในรายการของทุกคน เฉพาะ Admin
   - แสดงรายการที่รอ Admin อนุมัติยกเลิกก่อนรายการอื่นเสมอ
   - ไม่แก้ Logic ปีงบประมาณ V203
   - ไม่แก้ Logic บล็อก Staff ลง "ไม่รับเวร" ในวันหยุด V250
   ========================================================= */
(function(){
  'use strict';

  const VERSION_V254 = 'V254_LEAVE_STATUS_FILTER_ADMIN_FIRST';
  let leaveRenderContext254 = false;
  let lastFilteredCount254 = null;
  let lastPendingCount254 = 0;

  function isAdmin254(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }

  function state254(){
    try { if (typeof state !== 'undefined' && state) return state; } catch (_) {}
    return window.state || null;
  }

  function rawLeaveStatus254(row){
    try {
      if (typeof leaveStatusText === 'function') return String(leaveStatusText(row) || '').trim();
    } catch (_) {}
    return String(row?.status || row?.approval_status || 'active').trim();
  }

  function isPendingAdmin254(row){
    try {
      if (typeof isLeaveCancellationRequested === 'function' && isLeaveCancellationRequested(row)) return true;
    } catch (_) {}
    const raw = rawLeaveStatus254(row);
    const st = raw.toLowerCase();
    return [
      'รออนุมัติยกเลิก',
      'รอ admin อนุมัติยกเลิก',
      'รอแอดมินอนุมัติยกเลิก',
      'รออนุมัติ',
      'รอ admin อนุมัติ',
      'รอแอดมินอนุมัติ',
      'cancel_requested',
      'pending_cancel',
      'pending_cancellation',
      'pending',
      'pending_approval',
      'waiting_approval'
    ].includes(st);
  }

  function isInactive254(row){
    try {
      if (typeof isLeaveFinalInactive === 'function') return !!isLeaveFinalInactive(row);
    } catch (_) {}
    const raw = rawLeaveStatus254(row);
    const st = raw.toLowerCase();
    return [
      'cancelled', 'canceled', 'deleted', 'inactive', 'void', 'rejected',
      'ยกเลิกแล้ว', 'ลบทิ้ง', 'ไม่อนุมัติ'
    ].includes(st);
  }

  function leaveStatusGroup254(row){
    if (isPendingAdmin254(row)) return 'pending_admin';
    if (isInactive254(row)) return 'cancelled';
    const raw = rawLeaveStatus254(row).toLowerCase();
    if (!raw || ['active', 'approved', 'ใช้งาน', 'อนุมัติแล้ว'].includes(raw)) return 'active';
    return 'other';
  }

  function dateSortKey254(row){
    return String(
      row?.updated_at || row?.created_at || row?.start_date || row?.end_date || ''
    );
  }

  function sortLeaveRows254(rows){
    const priority = { pending_admin: 0, active: 1, other: 2, cancelled: 3 };
    return (rows || []).slice().sort((a, b) => {
      const pa = priority[leaveStatusGroup254(a)] ?? 9;
      const pb = priority[leaveStatusGroup254(b)] ?? 9;
      if (pa !== pb) return pa - pb;
      return dateSortKey254(b).localeCompare(dateSortKey254(a));
    });
  }

  function filteredByStatus254(rows){
    const selected = String(state254()?.leaveFilterStatus || '').trim();
    const source = rows || [];
    lastPendingCount254 = source.filter(isPendingAdmin254).length;
    const filtered = selected
      ? source.filter(row => leaveStatusGroup254(row) === selected)
      : source.slice();
    lastFilteredCount254 = filtered.length;
    return sortLeaveRows254(filtered);
  }

  const previousRenderLeaveTable254 = window.renderLeaveTable || (typeof renderLeaveTable === 'function' ? renderLeaveTable : null);
  if (previousRenderLeaveTable254) {
    const patchedRenderLeaveTable254 = function renderLeaveTableV254(rows){
      if (!leaveRenderContext254 || !isAdmin254()) {
        return previousRenderLeaveTable254.apply(this, arguments);
      }
      const adjusted = filteredByStatus254(rows);
      return previousRenderLeaveTable254.call(this, adjusted);
    };
    window.renderLeaveTable = patchedRenderLeaveTable254;
    try { renderLeaveTable = patchedRenderLeaveTable254; } catch (_) {}
  }

  function statusFilterHtml254(){
    const current = String(state254()?.leaveFilterStatus || '').trim();
    const selected = value => current === value ? 'selected' : '';
    return `<label>สถานะ
      <select id="leaveFilterStatus">
        <option value="" ${selected('')}>ทั้งหมด</option>
        <option value="pending_admin" ${selected('pending_admin')}>รอ Admin อนุมัติยกเลิก (${lastPendingCount254})</option>
        <option value="active" ${selected('active')}>ใช้งานอยู่</option>
        <option value="cancelled" ${selected('cancelled')}>ยกเลิกแล้ว</option>
        <option value="other" ${selected('other')}>สถานะอื่น</option>
      </select>
    </label>`;
  }

  function injectStatusFilter254(html){
    let out = String(html || '');
    if (!isAdmin254() || !out.includes('leave-filter-bar')) return out;

    if (!out.includes('id="leaveFilterStatus"')) {
      out = out.replace(
        /(<div class="leave-filter-bar compact-filter">)([\s\S]*?)(<\/div>)/i,
        (match, open, body, close) => `${open}${body}${statusFilterHtml254()}${close}`
      );
    }

    if (Number.isFinite(lastFilteredCount254)) {
      out = out.replace(
        /แสดง\s+\d+\s*\/\s*(\d+)\s+รายการ/,
        (_, total) => `แสดง ${lastFilteredCount254} / ${total} รายการ`
      );
    }

    if (lastPendingCount254 > 0 && !out.includes('data-v254-pending-admin-summary')) {
      const summary = `<div class="notice soft-notice v254-pending-admin-summary" data-v254-pending-admin-summary>
        <b>รอ Admin อนุมัติยกเลิก ${lastPendingCount254} รายการ</b>
        <span>ระบบเรียงรายการเหล่านี้ไว้ด้านบนก่อนแล้ว</span>
      </div>`;
      out = out.replace(
        /(<div class="leave-filter-bar compact-filter">[\s\S]*?<\/div>)/i,
        `$1${summary}`
      );
    }

    return out;
  }

  const previousRenderLeavePage254 = window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null);
  if (previousRenderLeavePage254) {
    const patchedRenderLeavePage254 = function renderLeavePageV254(){
      leaveRenderContext254 = true;
      lastFilteredCount254 = null;
      lastPendingCount254 = 0;
      try {
        return injectStatusFilter254(previousRenderLeavePage254.apply(this, arguments));
      } finally {
        leaveRenderContext254 = false;
      }
    };
    window.renderLeavePage = patchedRenderLeavePage254;
    try { renderLeavePage = patchedRenderLeavePage254; } catch (_) {}
  }

  document.addEventListener('change', function(event){
    const target = event.target;
    if (!target || target.id !== 'leaveFilterStatus') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const appState = state254();
    if (!appState) return;
    appState.leaveFilterStatus = target.value || '';
    try {
      if (typeof renderPage === 'function') renderPage();
    } catch (err) {
      console.error(`[${VERSION_V254}] cannot render after status filter change`, err);
    }
  }, true);

  const style = document.createElement('style');
  style.setAttribute('data-v254-leave-status-style', '');
  style.textContent = `
    .v254-pending-admin-summary{
      display:flex;
      gap:10px;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      margin:-2px 0 12px;
      border-color:#fed7aa;
      background:#fff7ed;
      color:#9a3412;
    }
    .v254-pending-admin-summary span{font-size:.88rem;font-weight:600;}
    @media(max-width:820px){
      .v254-pending-admin-summary{align-items:flex-start;}
    }
  `;
  document.head.appendChild(style);

  console.info(`[${VERSION_V254}] admin leave status filter and pending-first sorting loaded`);
})();

} catch (error) { console.error("[v569] patch-v254-leave-status-filter-admin-first.js", error); }
;

/* Original source: patch-v255-personal-permission-enforce-plan.js */
try {
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

} catch (error) { console.error("[v569] patch-v255-personal-permission-enforce-plan.js", error); }
;

/* Original source: patch-v256-selected-month-data-loader.js */
try {
/* =========================================================
   V256 Selected Month Data Loader
   - Fixes future/past month pages that were rendered from the
     fixed "today -2 months / +3 months" data window only.
   - Loads and merges the month currently selected by Admin.
   - Keeps holidays visible after save/reload and also keeps the
     roster, leave/activity context, positions and incharge data
     available for that selected month.
   ========================================================= */
(function(){
  'use strict';

  const VERSION_V256 = 'V256_SELECTED_MONTH_DATA_LOADER';
  const MONTH_INPUT_IDS_V256 = new Set([
    'rosterMonthInput',
    'scheduleMonthInput',
    'positionMonthInput',
    'positionMonthViewInput'
  ]);

  function validMonth256(value){
    const key = String(value || '').trim().slice(0, 7);
    return /^\d{4}-\d{2}$/.test(key) ? key : '';
  }

  function monthRange256(value){
    const key = validMonth256(value);
    if (!key) return null;
    const [year, month] = key.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return { key, start:`${key}-01`, end:`${key}-${String(lastDay).padStart(2, '0')}` };
  }

  function dateKey256(row, field){
    const raw = row?.[field];
    if (!raw) return '';
    return String(raw).slice(0, 10);
  }

  function mergeDateRows256(current, fresh, field, start, end){
    const kept = (Array.isArray(current) ? current : []).filter(row => {
      const date = dateKey256(row, field);
      return !date || date < start || date > end;
    });
    return kept.concat(Array.isArray(fresh) ? fresh : []);
  }


  function mergeOverlapRows256(current, fresh, startField, endField, start, end){
    const kept = (Array.isArray(current) ? current : []).filter(row => {
      const rowStart = String(row?.[startField] || '').slice(0, 10);
      const rowEnd = String(row?.[endField] || row?.[startField] || '').slice(0, 10);
      if (!rowStart) return true;
      return rowEnd < start || rowStart > end;
    });
    return kept.concat(Array.isArray(fresh) ? fresh : []);
  }

  function mergeMonthRows256(current, fresh, field, monthKey){
    const kept = (Array.isArray(current) ? current : []).filter(row => String(row?.[field] || '').slice(0, 7) !== monthKey);
    return kept.concat(Array.isArray(fresh) ? fresh : []);
  }

  function selectedMonthKeys256(){
    const values = [
      state?.monthKey,
      state?.positionMonthKey,
      state?.positionMonthViewKey
    ];
    return [...new Set(values.map(validMonth256).filter(Boolean))];
  }

  async function loadSelectedMonthData256(monthValue, options={}){
    const range = monthRange256(monthValue);
    if (!range || typeof sb === 'undefined' || !sb || typeof state === 'undefined' || !state?.profile) return false;

    const { key, start, end } = range;
    const queries = {
      holidays: sb.from('public_holidays').select('*').gte('holiday_date', start).lte('holiday_date', end).order('holiday_date'),
      assignments: sb.from('roster_assignments').select('*').gte('duty_date', start).lte('duty_date', end).order('duty_date'),
      leaves: sb.from('leave_requests').select('*').gte('end_date', start).lte('start_date', end).order('start_date', { ascending:false }),
      activities: sb.from('activity_events').select('*').gte('end_date', start).lte('start_date', end).order('start_date'),
      positions: sb.from('daily_positions').select('*').gte('work_date', start).lte('work_date', end).order('work_date'),
      positionDayStatus: sb.from('daily_position_day_status').select('*').gte('work_date', start).lte('work_date', end).order('work_date'),
      incharges: sb.from('monthly_incharges').select('*').eq('month_key', key)
    };

    const entries = Object.entries(queries);
    const results = await Promise.all(entries.map(([,promise]) => promise));
    const data = {};
    const errors = [];

    results.forEach((result, index) => {
      const name = entries[index][0];
      if (result?.error) errors.push(`${name}: ${result.error.message || result.error}`);
      else data[name] = result?.data || [];
    });

    if (errors.length) {
      console.warn(`[${VERSION_V256}] selected month partial load`, errors);
      if (!options.silent) {
        try { showToast(`โหลดข้อมูลเดือน ${key} ได้ไม่ครบ: ${errors[0]}`, { tone:'error' }); } catch (_) {}
      }
    }

    if (data.holidays) state.holidays = mergeDateRows256(state.holidays, data.holidays, 'holiday_date', start, end).sort((a,b) => String(a.holiday_date || '').localeCompare(String(b.holiday_date || '')));
    if (data.assignments) state.rosterAssignments = mergeDateRows256(state.rosterAssignments, data.assignments, 'duty_date', start, end).sort((a,b) => String(a.duty_date || '').localeCompare(String(b.duty_date || '')));
    if (data.leaves) state.leaves = mergeOverlapRows256(state.leaves, data.leaves, 'start_date', 'end_date', start, end).sort((a,b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
    if (data.activities) state.activities = mergeOverlapRows256(state.activities, data.activities, 'start_date', 'end_date', start, end).sort((a,b) => String(a.start_date || '').localeCompare(String(b.start_date || '')));
    if (data.positions) state.positions = mergeDateRows256(state.positions, data.positions, 'work_date', start, end).sort((a,b) => String(a.work_date || '').localeCompare(String(b.work_date || '')));
    if (data.positionDayStatus) state.positionDayStatus = mergeDateRows256(state.positionDayStatus, data.positionDayStatus, 'work_date', start, end).sort((a,b) => String(a.work_date || '').localeCompare(String(b.work_date || '')));
    if (data.incharges) state.incharges = mergeMonthRows256(state.incharges, data.incharges, 'month_key', key).sort((a,b) => String(b.month_key || '').localeCompare(String(a.month_key || '')));

    return !errors.length;
  }

  async function loadAllSelectedMonths256(options={}){
    const keys = selectedMonthKeys256();
    for (const key of keys) await loadSelectedMonthData256(key, options);
  }

  const originalLoadAllData256 = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
  if (originalLoadAllData256) {
    const patchedLoadAllData256 = async function(){
      const result = await originalLoadAllData256.apply(this, arguments);
      await loadAllSelectedMonths256({ silent:true });
      return result;
    };
    window.loadAllData = patchedLoadAllData256;
    try { loadAllData = patchedLoadAllData256; } catch (_) {}
  }

  document.addEventListener('change', function(e){
    const input = e.target;
    if (!input || !MONTH_INPUT_IDS_V256.has(input.id)) return;
    const key = validMonth256(input.value);
    if (!key) return;

    // Legacy change handler updates state/render first. Then fetch the
    // selected month and render again with the real holiday/data context.
    setTimeout(async function(){
      try {
        await loadSelectedMonthData256(key);
        if (typeof renderPage === 'function') renderPage();
      } catch (err) {
        console.error(`[${VERSION_V256}] month change load failed`, err);
        try { showToast(`โหลดข้อมูลเดือน ${key} ไม่สำเร็จ: ${err?.message || err}`, { tone:'error' }); } catch (_) {}
      }
    }, 0);
  });

  window.loadSelectedMonthDataV256 = loadSelectedMonthData256;
  console.info(`[${VERSION_V256}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v256-selected-month-data-loader.js", error); }
;

/* Original source: patch-v258-personal-permission-isolation-fix.js */
try {
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

} catch (error) { console.error("[v569] patch-v258-personal-permission-isolation-fix.js", error); }
;

/* Original source: patch-v259-position-count-daily-month-sync-permission-guard.js */
try {
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

} catch (error) { console.error("[v569] patch-v259-position-count-daily-month-sync-permission-guard.js", error); }
;

/* Original source: patch-v260-supabase-position-source-of-truth.js */
try {
/* =========================
   V260 Supabase Position Source of Truth
   - Slot templates and personal permissions always reload from Supabase after login/data refresh.
   - Disables automatic V240 template seeding/restoration UI.
   - Adds explicit Supabase refresh and "save current position base" actions.
   - Saving Slot templates never updates daily_position_eligibility.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V260_SUPABASE_POSITION_SOURCE_OF_TRUTH';
  if (window.__CNMI_V260_SUPABASE_POSITION_SOURCE_OF_TRUTH__) return;
  window.__CNMI_V260_SUPABASE_POSITION_SOURCE_OF_TRUTH__ = true;

  const CFG_PREFIX = '__CNMI_SLOT_TEMPLATE_V224__';
  const SLOT_CACHE_KEY = 'cnmi_slot_template_v224_cache';
  const PERMISSION_CACHE_KEY = 'cnmi_v259_position_permission_backup_v1';
  const DAY_SETS = [8,9,10,11,12,13,14];
  const OUTING_SETS = [12,13,14];
  let slotRefreshInFlight = null;
  let permissionRefreshInFlight = null;
  let permissionRefreshSequence = Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0);
  let saveSlotInFlight = false;

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function adminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return appState()?.profile?.role === 'admin'; }
  }
  function currentUserId(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function clone(value){
    try { return structuredClone(value); }
    catch (_) {
      try { return JSON.parse(JSON.stringify(value)); }
      catch (__) { return value; }
    }
  }
  function assignGlobalFunction(name, fn){
    try { window[name] = fn; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function boolValue(value){ return value === true || String(value).toLowerCase() === 'true'; }
  function cleanCode(value){ return String(value || '').replace(/^OUTING:/i, '').trim(); }
  function isConfigRow(row){ return String(row?.code || '').startsWith(`${CFG_PREFIX}:`); }
  function safeJson(value){ try { return JSON.parse(String(value || '')); } catch (_) { return null; } }
  function isOutingMaster(row){
    return row?.is_outing === true || String(row?.eligibility_code || '').startsWith('OUTING:');
  }
  function normalizeZone(row, outingSet){
    const raw = String(row?.zone || '').trim();
    const code = cleanCode(row?.code || row?.position_code || row?.eligibility_code);
    if (raw === 'ออกหน่วย') return 'ออกหน่วย';
    if (raw === 'Manual') return 'Manual';
    if (/^BB-Manual/i.test(code)) return 'Manual';
    if (raw === 'Donor Room' || raw === 'Donor' || /^DR-/i.test(code)) return outingSet && raw === 'ออกหน่วย' ? 'ออกหน่วย' : 'Donor Room';
    if (raw === 'Blood Bank' || /^BB-/i.test(code)) return 'Blood Bank';
    return raw || (outingSet ? 'ออกหน่วย' : 'Blood Bank');
  }
  function normalizeSlotRows(rows, outingSet){
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
      const code = cleanCode(row?.code || row?.position_code || row?.eligibility_code);
      if (!code) return null;
      const zone = normalizeZone({ ...row, code }, outingSet);
      return {
        ...row,
        code,
        position_code:code,
        zone,
        main_rule:String(row?.main_rule || '').trim(),
        break_time:String(row?.break_time || '').trim() || (zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
        job_desc:String(row?.job_desc || row?.detail || '').trim(),
        sort_order:Number(row?.sort_order || row?.order || index + 1) || (index + 1),
        eligibility_code:outingSet ? `OUTING:${code}` : (String(row?.eligibility_code || '').trim().replace(/^OUTING:/i, '') || code),
        is_outing:!!outingSet,
        is_active:row?.is_active === false ? false : true
      };
    }).filter(Boolean).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }
  function currentSlotConfigs(){
    const st = appState();
    try {
      return clone(window.cnmiV224?.currentConfigs?.()
        || window.cnmiV227?.currentConfigs226?.()
        || window.cnmiV226?.currentConfigs226?.()
        || st?.slotTemplateV224?.configs
        || { day:{}, outing:[], outing_by_count:{} });
    } catch (_) {
      return clone(st?.slotTemplateV224?.configs || { day:{}, outing:[], outing_by_count:{} });
    }
  }
  function normalizeConfig(config){
    const source = config || {};
    const out = { day:{}, outing:[], outing_by_count:{} };
    DAY_SETS.forEach(count => {
      out.day[count] = normalizeSlotRows(source.day?.[count] || source.day?.[String(count)] || [], false);
    });
    OUTING_SETS.forEach(count => {
      out.outing_by_count[count] = normalizeSlotRows(
        source.outing_by_count?.[count]
        || source.outing_by_count?.[String(count)]
        || (count === 14 ? source.outing : [])
        || [],
        true
      );
    });
    out.outing = normalizeSlotRows(source.outing || out.outing_by_count[14] || [], true);
    if (!out.outing.length && out.outing_by_count[14].length) out.outing = clone(out.outing_by_count[14]);
    if (!out.outing_by_count[14].length && out.outing.length) out.outing_by_count[14] = clone(out.outing);
    return out;
  }
  function parseDbConfigs(rows, fallback){
    const out = normalizeConfig(fallback || currentSlotConfigs());
    let found = 0;
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const parsed = safeJson(row?.job_desc);
      if (!Array.isArray(parsed)) return;
      const code = String(row?.code || '');
      const day = code.match(/:DAY:(\d+)$/);
      const outingCount = code.match(/:OUTING:(\d+)$/);
      if (day && DAY_SETS.includes(Number(day[1]))) {
        out.day[Number(day[1])] = normalizeSlotRows(parsed, false);
        found += 1;
        return;
      }
      if (outingCount && OUTING_SETS.includes(Number(outingCount[1]))) {
        out.outing_by_count[Number(outingCount[1])] = normalizeSlotRows(parsed, true);
        found += 1;
        return;
      }
      if (code.endsWith(':OUTING')) {
        out.outing = normalizeSlotRows(parsed, true);
        found += 1;
      }
    });
    if (!out.outing_by_count[14].length && out.outing.length) out.outing_by_count[14] = clone(out.outing);
    if (!out.outing.length && out.outing_by_count[14].length) out.outing = clone(out.outing_by_count[14]);
    return { config:out, found };
  }
  function applySlotConfig(config){
    const cfg = normalizeConfig(config);
    const st = appState();
    if (st) {
      if (!st.slotTemplateV224) st.slotTemplateV224 = { kind:'day', setNo:14, configs:null, loaded:false, loading:false };
      st.slotTemplateV224.configs = cfg;
      st.slotTemplateV224.loaded = true;
      st.slotTemplateV224.loading = false;
      st.slotTemplateV224.sourceV260 = 'supabase';
      st.slotTemplateV224.loadedAtV260 = new Date().toISOString();
    }
    try { localStorage.setItem(SLOT_CACHE_KEY, JSON.stringify(cfg)); } catch (_) {}
    try { window.cnmiV224?.applyConfigsToRuntime?.(); } catch (_) {}
    try { window.cnmiV227?.applyConfigs226?.(); } catch (_) {}
    try {
      const api = window.cnmiDayPositionSlotsV218 = window.cnmiDayPositionSlotsV218 || {};
      const target = api.DAY_POSITION_SLOT_SETS_218 || api.DAY_POSITION_SLOT_SETS || {};
      DAY_SETS.forEach(count => { target[count] = clone(cfg.day[count] || []); });
      api.DAY_POSITION_SLOT_SETS_218 = target;
      api.DAY_POSITION_SLOT_SETS = target;
      api.outingSlotsV232 = function(count){
        const n = Number(count || 14) <= 12 ? 12 : (Number(count || 14) <= 13 ? 13 : 14);
        return clone(cfg.outing_by_count[n] || cfg.outing || []);
      };
      api.outingSlotsV224 = () => clone(cfg.outing_by_count[14] || cfg.outing || []);
      api.outingSlotsV226 = () => clone(cfg.outing_by_count[14] || cfg.outing || []);
    } catch (error) {
      console.warn(`${VERSION}: runtime slot apply skipped`, error);
    }
    return cfg;
  }
  async function refreshSlotTemplatesFromDatabase(options={}){
    if (slotRefreshInFlight) return slotRefreshInFlight;
    slotRefreshInFlight = (async () => {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const result = await sb.from('daily_position_masters')
        .select('code,job_desc,is_outing,zone,is_active,sort_order,updated_at')
        .like('code', `${CFG_PREFIX}:%`);
      if (result.error) throw result.error;
      const parsed = parseDbConfigs(result.data || [], currentSlotConfigs());
      if (!parsed.found) throw new Error('ไม่พบฐานชุด Slot ที่บันทึกไว้ใน Supabase ระบบจึงไม่ใช้ต้นแบบ V240 มาทับ');
      const cfg = applySlotConfig(parsed.config);
      if (options.render !== false) rerenderCurrentPositionTab();
      if (!options.silent) toast(`รีเฟรชชุด Slot จาก Supabase แล้ว ${parsed.found} ชุด`);
      return cfg;
    })().finally(() => { slotRefreshInFlight = null; });
    return slotRefreshInFlight;
  }

  function permissionKey(row){ return `${String(row?.staff_id || '')}|${String(row?.position_code || '').trim()}`; }
  function normalizePermissionRows(rows){
    const latest = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      if (!row?.staff_id || !row?.position_code) return;
      const key = permissionKey(row);
      const previous = latest.get(key);
      const previousTime = previous ? Date.parse(previous.updated_at || previous.modified_at || previous.created_at || '') || 0 : -1;
      const nextTime = Date.parse(row.updated_at || row.modified_at || row.created_at || '') || 0;
      const previousId = Number(previous?.id);
      const nextId = Number(row?.id);
      const newer = !previous || nextTime > previousTime || (nextTime === previousTime && Number.isFinite(nextId) && (!Number.isFinite(previousId) || nextId >= previousId)) || (nextTime === previousTime && !Number.isFinite(nextId) && index >= Number(previous?.__v260Index || 0));
      if (newer) latest.set(key, { ...row, is_eligible:boolValue(row.is_eligible), __v260Index:index });
    });
    return Array.from(latest.values()).map(row => { const out = { ...row }; delete out.__v260Index; return out; });
  }
  function writePermissionCache(rows){
    try {
      localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify({ version:2, source:'supabase', saved_at:new Date().toISOString(), rows:normalizePermissionRows(rows) }));
    } catch (_) {}
  }
  function nextPermissionRefreshGeneration(){
    permissionRefreshSequence = Math.max(permissionRefreshSequence, Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0)) + 1;
    window.__CNMI_PERMISSION_REFRESH_GENERATION__ = permissionRefreshSequence;
    return permissionRefreshSequence;
  }
  function isLatestPermissionRefresh(generation){
    return Number(generation) === Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0);
  }
  function clearSessionValuesForStaff(staffId){
    try {
      const map = window.cnmiV258?.sessionValues;
      if (!map || typeof map.keys !== 'function') return;
      const prefix = `${String(staffId || '')}|`;
      Array.from(map.keys()).forEach(key => { if (String(key).startsWith(prefix)) map.delete(key); });
    } catch (_) {}
  }
  function replaceStaffPermissionRows(staffId, serverRows){
    const st = appState();
    if (!st) return normalizePermissionRows(serverRows || []);
    const sid = String(staffId || '');
    const others = (Array.isArray(st.positionEligibility) ? st.positionEligibility : [])
      .filter(row => String(row?.staff_id || '') !== sid);
    const merged = normalizePermissionRows(others.concat(serverRows || []));
    clearSessionValuesForStaff(sid);
    st.positionEligibility = merged;
    st.positionEligibilitySourceV260 = 'supabase-force-readback';
    st.positionEligibilityLoadedAtV260 = new Date().toISOString();
    try { window.cnmiV258?.normalizeStateRows?.(); } catch (_) {}
    writePermissionCache(st.positionEligibility || merged);
    return normalizePermissionRows(serverRows || []);
  }

  async function loadStaffPermissions(staffId, options={}){
    const sid = String(staffId || '').trim();
    if (!sid) throw new Error('ไม่พบ staffId สำหรับโหลดสิทธิ์');
    if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
    // Always starts a new request. It never reuses permissionRefreshInFlight.
    const generation = nextPermissionRefreshGeneration();
    const result = await sb.from('daily_position_eligibility').select('*').eq('staff_id', sid);
    if (result.error) throw result.error;
    const rows = normalizePermissionRows(result.data || []);
    if (!isLatestPermissionRefresh(generation)) {
      try { console.info(`${VERSION}: ignored stale per-staff permission response`, sid, generation); } catch (_) {}
      return rows;
    }
    replaceStaffPermissionRows(sid, rows);
    if (options.render !== false) rerenderCurrentPositionTab();
    if (!options.silent) toast(`โหลดสิทธิ์ล่าสุดของเจ้าหน้าที่ที่เลือกแล้ว ${rows.length} รายการ`);
    return rows;
  }

  async function refreshPermissionsFromDatabase(options={}){
    if (permissionRefreshInFlight && options.force !== true) return permissionRefreshInFlight;
    const generation = nextPermissionRefreshGeneration();
    const request = (async () => {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const result = await sb.from('daily_position_eligibility').select('*');
      if (result.error) throw result.error;
      const rows = normalizePermissionRows(result.data || []);
      const st = appState();
      const currentCount = Array.isArray(st?.positionEligibility) ? st.positionEligibility.length : 0;
      if (!rows.length && currentCount && options.allowEmpty !== true) {
        throw new Error('Supabase คืนค่าสิทธิ์ 0 รายการ ระบบจึงหยุดไว้ก่อนและไม่ล้างค่าที่หน้าจอ');
      }
      // A request started before a save/readback is stale and must not touch UI state.
      if (!isLatestPermissionRefresh(generation)) {
        try { console.info(`${VERSION}: ignored stale all-permission response`, generation); } catch (_) {}
        return rows;
      }
      try { window.cnmiV258?.sessionValues?.clear?.(); } catch (_) {}
      if (st) {
        st.positionEligibility = rows;
        st.positionEligibilitySourceV260 = options.force === true ? 'supabase-force' : 'supabase';
        st.positionEligibilityLoadedAtV260 = new Date().toISOString();
      }
      try { window.cnmiV258?.normalizeStateRows?.(); } catch (_) {}
      writePermissionCache(rows);
      if (options.render !== false) rerenderCurrentPositionTab();
      if (!options.silent) toast(`รีเฟรชสิทธิ์เฉพาะบุคคลจาก Supabase แล้ว ${rows.length} รายการ`);
      return rows;
    })();
    permissionRefreshInFlight = request;
    try { return await request; }
    finally { if (permissionRefreshInFlight === request) permissionRefreshInFlight = null; }
  }

  function slotConfigEntries(config){
    const cfg = normalizeConfig(config);
    const entries = [];
    DAY_SETS.forEach(count => entries.push({
      code:`${CFG_PREFIX}:DAY:${count}`,
      rows:cfg.day[count] || []
    }));
    entries.push({ code:`${CFG_PREFIX}:OUTING`, rows:cfg.outing_by_count[14] || cfg.outing || [] });
    OUTING_SETS.forEach(count => entries.push({
      code:`${CFG_PREFIX}:OUTING:${count}`,
      rows:cfg.outing_by_count[count] || []
    }));
    return { cfg, entries };
  }
  async function upsertConfigRows(config){
    const packed = slotConfigEntries(config);
    for (const entry of packed.entries) {
      const payload = {
        code:entry.code,
        eligibility_code:null,
        zone:'SYSTEM',
        break_time:'-',
        main_rule:'SLOT_TEMPLATE_CONFIG',
        job_desc:JSON.stringify(entry.rows || []),
        is_outing:false,
        is_active:false,
        sort_order:99000,
        deleted_at:null,
        updated_by:currentUserId()
      };
      const result = await sb.from('daily_position_masters').upsert(payload, { onConflict:'code,is_outing' });
      if (result.error) throw result.error;
    }
    return packed.cfg;
  }
  function uniqueDayMasterRows(config){
    const map = new Map();
    [14,13,12,11,10,9,8].forEach(count => {
      (config.day[count] || []).forEach(row => {
        const code = cleanCode(row?.code);
        if (code && !map.has(code)) map.set(code, { ...row, code, is_outing:false });
      });
    });
    return Array.from(map.values());
  }
  async function syncActiveMasterRows(config){
    const cfg = normalizeConfig(config);
    const dayRows = uniqueDayMasterRows(cfg);
    const outingRows = normalizeSlotRows(cfg.outing_by_count[14] || cfg.outing || [], true);
    const dayCodes = new Set(dayRows.map(row => row.code));
    const outingCodes = new Set(outingRows.map(row => row.code));
    const existingResult = await sb.from('daily_position_masters').select('*');
    if (existingResult.error) throw existingResult.error;
    const existing = existingResult.data || [];

    for (const row of existing) {
      if (isConfigRow(row)) continue;
      const code = cleanCode(row?.code);
      if (!code) continue;
      const shouldExist = isOutingMaster(row) ? outingCodes.has(code) : dayCodes.has(code);
      if (!shouldExist && row.is_active !== false) {
        const update = await sb.from('daily_position_masters')
          .update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:currentUserId() })
          .eq('id', row.id);
        if (update.error) throw update.error;
      }
    }

    const saveMaster = async (row, outing) => {
      const code = cleanCode(row?.code);
      const payload = {
        code,
        eligibility_code:outing ? `OUTING:${code}` : (String(row?.eligibility_code || '').replace(/^OUTING:/i, '').trim() || code),
        zone:row?.zone || (outing ? 'ออกหน่วย' : 'Blood Bank'),
        break_time:row?.break_time || (row?.zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
        main_rule:row?.main_rule || null,
        job_desc:row?.job_desc || null,
        is_outing:!!outing,
        is_active:true,
        sort_order:Number(row?.sort_order || 999),
        deleted_at:null,
        updated_by:currentUserId()
      };
      const found = existing.find(item => !isConfigRow(item) && cleanCode(item?.code) === code && isOutingMaster(item) === !!outing);
      const result = found?.id
        ? await sb.from('daily_position_masters').update(payload).eq('id', found.id)
        : await sb.from('daily_position_masters').insert({ ...payload, created_by:currentUserId() });
      if (result.error) throw result.error;
    };
    for (const row of dayRows) await saveMaster(row, false);
    for (const row of outingRows) await saveMaster(row, true);
  }
  async function saveAllSlotConfigsAsCurrentBase(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (saveSlotInFlight) return toast('ระบบกำลังบันทึกฐานตำแหน่งอยู่ กรุณารอสักครู่');
    let accepted = true;
    try {
      accepted = typeof confirmDialog === 'function'
        ? await confirmDialog('บันทึกชุด Slot 8-14 คน และชุดออกหน่วย 12-14 คนที่เห็นอยู่ทั้งหมดลง Supabase เป็นฐานตำแหน่งปัจจุบัน? การบันทึกนี้จะไม่แก้ไขสิทธิ์เฉพาะบุคคล', 'ยืนยันฐานตำแหน่งปัจจุบัน')
        : window.confirm('ยืนยันบันทึกชุด Slot ทั้งหมดเป็นฐานตำแหน่งปัจจุบัน?');
    } catch (_) {}
    if (!accepted) return;

    saveSlotInFlight = true;
    setPositionSourceButtonsBusy(true, 'กำลังบันทึกฐานตำแหน่ง…');
    try {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const cfg = normalizeConfig(currentSlotConfigs());
      await upsertConfigRows(cfg);
      await syncActiveMasterRows(cfg);
      applySlotConfig(cfg);
      try { await window.cnmiV212RefreshPositionMasters?.({ renderAfter:false, silent:true }); } catch (_) {}
      await refreshSlotTemplatesFromDatabase({ render:false, silent:true });
      rerenderCurrentPositionTab();
      toast('บันทึกทั้งหมดเป็นฐานตำแหน่งปัจจุบันใน Supabase แล้ว โดยไม่แตะสิทธิ์เฉพาะบุคคล');
    } catch (error) {
      console.error(`${VERSION}: save slot base failed`, error);
      toast('บันทึกฐานตำแหน่งไม่สำเร็จ: ' + friendly(error), 'error');
    } finally {
      saveSlotInFlight = false;
      setPositionSourceButtonsBusy(false);
    }
  }

  function currentTab(){
    try { return window.cnmiV244PositionPermissions?.currentTab?.() || appState()?.positionManagementSubtabV244 || 'slots'; }
    catch (_) { return appState()?.positionManagementSubtabV244 || 'slots'; }
  }
  function rerenderCurrentPositionTab(){
    const st = appState();
    if (!st || st.page !== 'positionManagement') return;
    try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); }
    catch (_) { try { renderPage(); } catch (__) {} }
    setTimeout(injectPositionSourceControls, 30);
  }
  function setPositionSourceButtonsBusy(busy, text){
    document.querySelectorAll('[data-v260-refresh-slots],[data-v260-save-slot-base],[data-v260-refresh-permissions]').forEach(button => {
      if (!button.dataset.v260Text) button.dataset.v260Text = button.textContent || '';
      button.disabled = !!busy;
      if (busy && text) button.textContent = text;
      if (!busy && button.dataset.v260Text) button.textContent = button.dataset.v260Text;
    });
  }
  function removeLegacyV240Buttons(root){
    try { (root || document).querySelectorAll('.v232-default-slot-actions,[data-v232-load-default-slots],[data-v232-save-default-slots]').forEach(node => node.remove()); }
    catch (_) {}
  }
  function slotSourceActionsHtml(){
    return `<div class="actions v260-slot-source-actions">
      <button type="button" class="ghost-btn" data-v260-refresh-slots>รีเฟรชจากฐานข้อมูลล่าสุด</button>
      <button type="button" class="primary-btn" data-v260-save-slot-base>บันทึกทั้งหมดเป็นฐานตำแหน่งปัจจุบัน</button>
    </div>`;
  }
  function injectPositionSourceControls(){
    const st = appState();
    if (!st || st.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    removeLegacyV240Buttons(root);

    if (currentTab() === 'slots') {
      root.querySelectorAll('[data-v224-refresh-config],[data-v224-save-all],[data-v226-refresh-config],[data-v226-save-all]').forEach(button => {
        button.classList.add('v260-legacy-slot-action');
        button.setAttribute('aria-hidden', 'true');
        button.tabIndex = -1;
      });
      const card = root.querySelector('.v224-slot-crud-card') || root.querySelector('.v226-position-template-page .card');
      if (card && !card.querySelector('[data-v260-refresh-slots]')) {
        const title = card.querySelector('.section-title');
        if (title) title.insertAdjacentHTML('beforeend', slotSourceActionsHtml());
        else card.insertAdjacentHTML('afterbegin', slotSourceActionsHtml());
      }
      if (card && !card.querySelector('.v260-source-note')) {
        const toolbar = card.querySelector('.v224-template-toolbar');
        const note = `<div class="notice soft-notice compact v260-source-note"><b>ต้นทางปัจจุบัน: Supabase</b> • เปิดหน้าใหม่หรืออัปเดตไฟล์ ระบบจะโหลดชุด Slot ที่บันทึกไว้ในฐานข้อมูล ไม่โหลด V240 มาทับอัตโนมัติ</div>`;
        if (toolbar) toolbar.insertAdjacentHTML('beforebegin', note); else card.insertAdjacentHTML('afterbegin', note);
      }
    } else {
      const panel = root.querySelector('.eligibility-position-panel');
      const section = panel?.querySelector('.section-title');
      if (section && !section.querySelector('[data-v260-refresh-permissions]')) {
        section.insertAdjacentHTML('beforeend', `<button type="button" class="ghost-btn v260-refresh-permission-btn" data-v260-refresh-permissions>รีเฟรชสิทธิ์จากฐานข้อมูลล่าสุด</button>`);
      }
      if (panel && !panel.querySelector('.v260-permission-source-note')) {
        const grid = panel.querySelector('.position-card-grid');
        const note = `<div class="notice soft-notice compact v260-permission-source-note"><b>ต้นทางสิทธิ์: Supabase</b> • การติ๊กแล้วกดบันทึกจะเป็นฐานถาวรของรายคนนั้น และการอัปเดต ZIP จะไม่สร้างสิทธิ์ใหม่ทับ</div>`;
        if (grid) grid.insertAdjacentHTML('beforebegin', note); else panel.insertAdjacentHTML('beforeend', note);
      }
    }
  }

  document.addEventListener('click', function(event){
    const refreshSlots = event.target?.closest?.('[data-v260-refresh-slots]');
    const saveSlots = event.target?.closest?.('[data-v260-save-slot-base]');
    const refreshPermissions = event.target?.closest?.('[data-v260-refresh-permissions]');
    if (!refreshSlots && !saveSlots && !refreshPermissions) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (refreshSlots) {
      setPositionSourceButtonsBusy(true, 'กำลังโหลดจาก Supabase…');
      refreshSlotTemplatesFromDatabase().catch(error => {
        console.error(`${VERSION}: slot refresh failed`, error);
        toast('รีเฟรชชุด Slot ไม่สำเร็จ: ' + friendly(error), 'error');
      }).finally(() => setPositionSourceButtonsBusy(false));
      return;
    }
    if (saveSlots) { saveAllSlotConfigsAsCurrentBase(); return; }
    if (refreshPermissions) {
      setPositionSourceButtonsBusy(true, 'กำลังโหลดสิทธิ์…');
      const sid = String(document.getElementById('eligibilityStaffSelect')?.value || appState()?.eligibilityStaffId || '').trim();
      const task = sid
        ? loadStaffPermissions(sid, { force:true })
        : refreshPermissionsFromDatabase({ force:true });
      task.catch(error => {
        console.error(`${VERSION}: permission refresh failed`, error);
        toast('รีเฟรชสิทธิ์ไม่สำเร็จ: ' + friendly(error), 'error');
      }).finally(() => setPositionSourceButtonsBusy(false));
    }
  }, true);

  // Supabase must win after every full application reload. V259 local backup remains only a safety copy.
  try {
    const oldLoadAllData = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
    if (oldLoadAllData && !oldLoadAllData.__v260PositionSourceOfTruth) {
      const wrappedLoadAllData = async function loadAllDataV260(){
        const result = await oldLoadAllData.apply(this, arguments);
        const tasks = [
          refreshPermissionsFromDatabase({ render:false, silent:true }),
          refreshSlotTemplatesFromDatabase({ render:false, silent:true })
        ];
        const settled = await Promise.allSettled(tasks);
        settled.forEach(item => { if (item.status === 'rejected') console.warn(`${VERSION}: post-load refresh skipped`, item.reason); });
        setTimeout(injectPositionSourceControls, 0);
        return result;
      };
      wrappedLoadAllData.__v260PositionSourceOfTruth = true;
      assignGlobalFunction('loadAllData', wrappedLoadAllData);
    }
  } catch (_) {}

  // After each permission save, read the saved truth back from Supabase and replace session/cache values.
  try {
    const oldSaveEligibility = window.savePositionEligibility || (typeof savePositionEligibility === 'function' ? savePositionEligibility : null);
    if (oldSaveEligibility && !oldSaveEligibility.__v260ServerVerified) {
      const wrappedSaveEligibility = async function savePositionEligibilityV260(){
        const sid = String(document.getElementById('eligibilityStaffSelect')?.value || appState()?.eligibilityStaffId || '').trim();
        const result = await oldSaveEligibility.apply(this, arguments);
        if (result === false) return result;
        try {
          if (sid) await loadStaffPermissions(sid, { force:true, render:false, silent:true });
          else await refreshPermissionsFromDatabase({ force:true, render:false, silent:true, allowEmpty:true });
        } catch (error) { console.warn(`${VERSION}: post-save permission force refresh failed`, error); }
        rerenderCurrentPositionTab();
        return result;
      };
      wrappedSaveEligibility.__v260ServerVerified = true;
      assignGlobalFunction('savePositionEligibility', wrappedSaveEligibility);
    }
  } catch (_) {}

  try {
    const observer = new MutationObserver(() => injectPositionSourceControls());
    observer.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v260-position-source-style';
  style.textContent = `
    .v232-default-slot-actions,.v260-legacy-slot-action{display:none!important}
    .v260-slot-source-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
    .v260-source-note,.v260-permission-source-note{border-color:#86efac;background:#f0fdf4;color:#166534}
    .v260-refresh-permission-btn{margin-left:auto;white-space:normal}
    [data-v260-refresh-slots]:disabled,[data-v260-save-slot-base]:disabled,[data-v260-refresh-permissions]:disabled{opacity:.65;cursor:wait}
    @media(max-width:760px){.v260-slot-source-actions{width:100%;margin-left:0}.v260-slot-source-actions button,.v260-refresh-permission-btn{width:100%;margin-left:0}}
  `;
  document.head.appendChild(style);

  setTimeout(injectPositionSourceControls, 100);
  setTimeout(injectPositionSourceControls, 500);
  setTimeout(() => {
    const st = appState();
    if (!st?.profile || !['positionManagement','eligibility','positions','positionMonth','positionMonthView','scheduler','internManagement'].includes(String(st.page || ''))) return;
    Promise.allSettled([
      refreshPermissionsFromDatabase({ render:false, silent:true }),
      refreshSlotTemplatesFromDatabase({ render:false, silent:true })
    ]).finally(() => injectPositionSourceControls());
  }, 900);

  assignGlobalFunction('loadStaffPermissions', loadStaffPermissions);

  window.cnmiV260 = {
    refreshSlotTemplatesFromDatabase,
    refreshPermissionsFromDatabase,
    loadStaffPermissions,
    saveAllSlotConfigsAsCurrentBase,
    normalizeConfig,
    normalizePermissionRows,
    applySlotConfig,
    injectPositionSourceControls
  };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v260-supabase-position-source-of-truth.js", error); }
;

/* Original source: patch-v261-daily-position-authoritative-sync.js */
try {
/* =========================
   V261 Daily Position Authoritative Sync
   - A daily save writes the visible "ปรับวันนี้" selections to Supabase.
   - Desktop/mobile duplicate selects are synchronized before saving.
   - Publishing also saves the current selections first.
   - The same date is replaced in state.positions and stale monthly drafts are cleared.
   - Monthly position pages refresh the selected month from Supabase when opened.
   ========================= */
(function(){
  'use strict';

  const VERSION = 'V261_DAILY_POSITION_AUTHORITATIVE_SYNC';
  if (window.__CNMI_V261_DAILY_POSITION_AUTHORITATIVE_SYNC__) return;
  window.__CNMI_V261_DAILY_POSITION_AUTHORITATIVE_SYNC__ = true;

  const monthRefreshAt = new Map();
  const monthRefreshInFlight = new Map();
  let dailySaveInFlight = false;

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function canManage(date){
    try { return !!canManagePositions(date); }
    catch (_) {
      try { return !!isAdmin(); }
      catch (__) { return appState()?.profile?.role === 'admin'; }
    }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function busy(active, message){
    try { setBusy(!!active, message || ''); } catch (_) {}
  }
  function assignGlobalFunction(name, fn){
    try { window[name] = fn; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function visibleControl(el){
    if (!el || el.disabled) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const parent = el.closest('[hidden], .hidden');
      if (parent) return false;
      return el.getClientRects().length > 0;
    } catch (_) { return true; }
  }
  function rowIdentity(sel){
    return [
      String(sel?.dataset?.positionCode || '').trim(),
      String(sel?.dataset?.positionZone || '').trim(),
      String(sel?.dataset?.positionBreak || '').trim(),
      String(sel?.dataset?.positionRule || '').trim(),
      String(sel?.dataset?.positionJob || '').trim()
    ].join('|');
  }
  function syncDuplicateSelects(source){
    if (!source?.matches?.('[data-position-row]')) return;
    const identity = rowIdentity(source);
    document.querySelectorAll('[data-position-row]').forEach(other => {
      if (other !== source && rowIdentity(other) === identity && other.value !== source.value) other.value = source.value;
    });
    source.dataset.v261ChangedAt = String(Date.now());
  }

  document.addEventListener('change', function(event){
    const select = event.target?.closest?.('[data-position-row]');
    if (select) syncDuplicateSelects(select);
  }, true);

  function chosenSelect(group){
    const list = Array.from(group || []);
    if (!list.length) return null;
    const active = list.find(el => el === document.activeElement);
    if (active) return active;
    const changed = list.slice().sort((a,b) => Number(b.dataset.v261ChangedAt || 0) - Number(a.dataset.v261ChangedAt || 0))[0];
    if (changed && Number(changed.dataset.v261ChangedAt || 0) > 0) return changed;
    return list.find(visibleControl) || list[0];
  }
  function collectDailyRows(date){
    const controls = Array.from(document.querySelectorAll('[data-position-row]'));
    const groups = new Map();
    controls.forEach(select => {
      const identity = rowIdentity(select) || `row:${select.dataset.positionRow || groups.size}`;
      if (!groups.has(identity)) groups.set(identity, []);
      groups.get(identity).push(select);
    });

    const rows = [];
    groups.forEach(group => {
      const select = chosenSelect(group);
      if (!select) return;
      const code = String(select.dataset.positionCode || '').trim();
      if (!code) return;
      let base = {};
      try { base = positionTemplateByCode(code, date) || {}; } catch (_) {}
      rows.push({
        work_date: date,
        position_code: code,
        zone: select.dataset.positionZone || base.zone || 'รอตรวจสอบ',
        break_time: select.dataset.positionBreak || base.break_time || '-',
        main_rule: select.dataset.positionRule || base.main_rule || '',
        job_desc: select.dataset.positionJob || base.job_desc || '',
        staff_id: select.value || null,
        updated_by: currentStaff()
      });
    });

    // Keep exactly one row per displayed Slot identity.
    const deduped = [];
    const seen = new Set();
    rows.forEach(row => {
      const key = [row.position_code, row.zone, row.break_time, row.main_rule, row.job_desc].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    try { return sortPositionRows(deduped); }
    catch (_) { return deduped; }
  }

  function replaceDateInState(date, rows, statusRow){
    const st = appState();
    if (!st) return;
    const d = normDate(date);
    const month = d.slice(0, 7);
    st.positions = (Array.isArray(st.positions) ? st.positions : [])
      .filter(row => normDate(row?.work_date) !== d)
      .concat(Array.isArray(rows) ? rows : []);
    st.positionDayStatus = (Array.isArray(st.positionDayStatus) ? st.positionDayStatus : [])
      .filter(row => normDate(row?.work_date) !== d)
      .concat(statusRow ? [statusRow] : []);

    // A monthly draft made before the daily edit is stale by definition.
    if (st.monthPositionDraft?.monthKey === month) st.monthPositionDraft = null;
    st.__v261LastDailySync = { date:d, at:new Date().toISOString(), rows:(rows || []).length };
  }

  async function fetchDateFromDatabase(date){
    const d = normDate(date);
    const [positionResult, statusResult] = await Promise.all([
      sb.from('daily_positions').select('*').eq('work_date', d).order('position_code'),
      sb.from('daily_position_day_status').select('*').eq('work_date', d).maybeSingle()
    ]);
    if (positionResult.error) throw positionResult.error;
    if (statusResult.error) throw statusResult.error;
    return { rows:positionResult.data || [], status:statusResult.data || null };
  }

  async function saveDailyAuthoritative(options={}){
    const st = appState();
    const date = normDate(document.getElementById('positionDateInput')?.value || st?.positionDate || (typeof todayStr === 'function' ? todayStr() : ''));
    if (!date) return false;
    if (!canManage(date)) {
      toast('เฉพาะ Admin หรืออินชาร์จประจำเดือนนี้เท่านั้น', 'error');
      return false;
    }
    if (dailySaveInFlight) {
      toast('ระบบกำลังบันทึกตำแหน่งวันนี้ กรุณารอสักครู่');
      return false;
    }

    const rows = collectDailyRows(date);
    if (!rows.length) {
      toast('ไม่พบรายการ Slot ที่จะบันทึก', 'error');
      return false;
    }

    const publish = options.publish === true;
    dailySaveInFlight = true;
    busy(true, publish ? 'กำลังบันทึกและประกาศตำแหน่งวันนี้' : 'กำลังบันทึกตำแหน่งวันนี้');
    try {
      const del = await sb.from('daily_positions').delete().eq('work_date', date);
      if (del.error) throw del.error;

      const ins = await sb.from('daily_positions').insert(rows).select('*');
      if (ins.error) throw ins.error;

      const statusPayload = {
        work_date: date,
        month_key: date.slice(0, 7),
        status: publish ? 'published' : 'draft',
        updated_by: currentStaff()
      };
      if (publish) {
        statusPayload.published_by = currentStaff();
        statusPayload.published_at = new Date().toISOString();
      }
      const statusResult = await sb.from('daily_position_day_status')
        .upsert(statusPayload, { onConflict:'work_date' })
        .select('*')
        .maybeSingle();
      if (statusResult.error) throw statusResult.error;

      // Read the exact date back from Supabase. This is the value both daily and monthly pages must use.
      const fresh = await fetchDateFromDatabase(date);
      replaceDateInState(date, fresh.rows.length ? fresh.rows : (ins.data || rows), fresh.status || statusResult.data || statusPayload);
      monthRefreshAt.set(date.slice(0,7), Date.now());

      try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
      toast(publish ? 'บันทึกและประกาศตารางตำแหน่งวันนี้แล้ว ตารางรายเดือนอัปเดตตามวันที่นี้แล้ว' : 'บันทึกตำแหน่งวันนี้แล้ว ตารางรายเดือนอัปเดตตามวันที่นี้แล้ว');
      console.info(`${VERSION}: daily date synchronized`, { date, publish, rows:fresh.rows.length || rows.length });
      return true;
    } catch (error) {
      console.error(`${VERSION}: daily save failed`, error);
      toast(`บันทึกตำแหน่งวันนี้ไม่สำเร็จ: ${friendly(error)}`, 'error');
      return false;
    } finally {
      dailySaveInFlight = false;
      busy(false);
    }
  }

  const savePositionsV261 = async function(){
    return saveDailyAuthoritative({ publish:false });
  };
  savePositionsV261.__v261Authoritative = true;
  assignGlobalFunction('savePositions', savePositionsV261);

  const publishPositionsV261 = async function(){
    // Publishing is intentionally save + publish in one transaction flow, so a user cannot publish stale dropdown values.
    return saveDailyAuthoritative({ publish:true });
  };
  publishPositionsV261.__v261Authoritative = true;
  assignGlobalFunction('publishPositionsForDay', publishPositionsV261);

  function monthRange(monthKey){
    const key = String(monthKey || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return null;
    const [year, month] = key.split('-').map(Number);
    const last = new Date(year, month, 0).getDate();
    return { key, start:`${key}-01`, end:`${key}-${String(last).padStart(2,'0')}` };
  }
  function mergeMonthRows(current, fresh, field, key){
    return (Array.isArray(current) ? current : [])
      .filter(row => String(row?.[field] || '').slice(0,7) !== key)
      .concat(Array.isArray(fresh) ? fresh : []);
  }
  async function refreshMonthFromDatabase(monthKey, options={}){
    const range = monthRange(monthKey);
    if (!range) return false;
    if (monthRefreshInFlight.has(range.key)) return monthRefreshInFlight.get(range.key);

    const task = (async () => {
      const [positionsResult, statusResult] = await Promise.all([
        sb.from('daily_positions').select('*').gte('work_date', range.start).lte('work_date', range.end).order('work_date').order('position_code'),
        sb.from('daily_position_day_status').select('*').gte('work_date', range.start).lte('work_date', range.end).order('work_date')
      ]);
      if (positionsResult.error) throw positionsResult.error;
      if (statusResult.error) throw statusResult.error;
      const st = appState();
      if (!st) return false;
      st.positions = mergeMonthRows(st.positions, positionsResult.data || [], 'work_date', range.key);
      st.positionDayStatus = mergeMonthRows(st.positionDayStatus, statusResult.data || [], 'work_date', range.key);
      monthRefreshAt.set(range.key, Date.now());
      if (options.render !== false) {
        const currentPage = st.page;
        const currentKey = currentPage === 'positionMonthView'
          ? String(st.positionMonthViewKey || st.monthKey || '').slice(0,7)
          : String(st.positionMonthKey || st.monthKey || '').slice(0,7);
        if ((currentPage === 'positionMonthView' || currentPage === 'positionMonth') && currentKey === range.key) {
          try { renderPage(); } catch (_) {}
        }
      }
      return true;
    })().catch(error => {
      console.error(`${VERSION}: monthly refresh failed`, error);
      if (!options.silent) toast(`รีเฟรชตารางตำแหน่งกลางวัน รายเดือนไม่สำเร็จ: ${friendly(error)}`, 'error');
      return false;
    }).finally(() => monthRefreshInFlight.delete(range.key));

    monthRefreshInFlight.set(range.key, task);
    return task;
  }

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !oldRenderPage.__v261MonthRefresh) {
    const renderPageV261 = function(){
      const result = oldRenderPage.apply(this, arguments);
      const st = appState();
      if (!st || (st.page !== 'positionMonthView' && st.page !== 'positionMonth')) return result;
      const key = st.page === 'positionMonthView'
        ? String(st.positionMonthViewKey || st.monthKey || '').slice(0,7)
        : String(st.positionMonthKey || st.monthKey || '').slice(0,7);
      if (!/^\d{4}-\d{2}$/.test(key)) return result;
      if (st.page === 'positionMonth' && st.monthPositionDraft?.monthKey === key) return result;
      const age = Date.now() - Number(monthRefreshAt.get(key) || 0);
      if (age > 2500 && !monthRefreshInFlight.has(key)) {
        setTimeout(() => refreshMonthFromDatabase(key, { silent:true }), 0);
      }
      return result;
    };
    renderPageV261.__v261MonthRefresh = true;
    assignGlobalFunction('renderPage', renderPageV261);
  }

  window.cnmiV261 = {
    collectDailyRows,
    saveDailyAuthoritative,
    fetchDateFromDatabase,
    refreshMonthFromDatabase,
    replaceDateInState
  };

  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v261-daily-position-authoritative-sync.js", error); }
;

/* Original source: patch-v262-auto-assign-consecutive-rule-clarity.js */
try {
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

} catch (error) { console.error("[v569] patch-v262-auto-assign-consecutive-rule-clarity.js", error); }
;

/* Original source: patch-v265-stability-rule-corrections.js */
try {
/* =========================
   V265 Stability Rule Corrections
   - Personal position permissions are saved per person and verified from Supabase.
   - Outing Slot/headcount uses staff actually available that day, while "ไม่รับเวร" remains a normal working-day staff member.
   - Daily position save/publish is forced back into the monthly source immediately.
   - Only ชบด1/ชบด2/ชบด3 are consecutive-day restricted.
   - Balance reset is reflected in the grouped monthly balance and the detail columns are expanded.
   - Nonessential description text is hidden without hiding warnings or validation messages.
   ========================= */
(function(){
  'use strict';

  const VERSION = 'V265_STABILITY_RULE_CORRECTIONS';
  if (window.__CNMI_V265_STABILITY_RULE_CORRECTIONS__) return;
  window.__CNMI_V265_STABILITY_RULE_CORRECTIONS__ = true;

  const PERMISSION_CACHE_KEY = 'cnmi_v259_position_permission_backup_v1';
  const DAILY_OVERRIDE_KEY = '__v265DailyPositionOverrides';
  const RESTRICTED_DUTIES = new Set(['ชบด1','ชบด2','ชบด3']);
  let permissionSaveInFlight = false;
  let dailySyncInFlight = false;

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function client(){
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (_) {}
    return window.supabaseClient || window.sbClient || window.sb || null;
  }
  function assignGlobal(name, value){
    try { window[name] = value; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function bool(value){ return value === true || String(value).toLowerCase() === 'true'; }
  function num(value, fallback=0){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function clone(value){
    try { return structuredClone(value); }
    catch (_) { try { return JSON.parse(JSON.stringify(value)); } catch (__) { return value; } }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function busy(active, message){ try { setBusy(!!active, message || ''); } catch (_) {} }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function ordered(list){
    try { return orderedStaff(list || []); }
    catch (_) { return (list || []).slice(); }
  }
  function currentUser(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function baseCode(value){
    try { return String(positionBaseCode(value) || '').trim(); }
    catch (_) { return String(value || '').replace(/\s+#\d+$/, '').trim(); }
  }
  function hasOutingSafe(date){
    try { return !!hasOuting(normDate(date)); }
    catch (_) { return false; }
  }
  function isNoPositionDaySafe(date){
    try { return !!isNoPositionDay(normDate(date)); }
    catch (_) {
      try { return !!(isWeekend(normDate(date)) || isHolidayDate(normDate(date))); }
      catch (__) { return false; }
    }
  }
  function parseSafe(date){
    try { return parseDate(date); }
    catch (_) { return new Date(normDate(date) + 'T00:00:00'); }
  }

  /* ------------------------------------------------------------------
     1) Consecutive-duty rule: only ชบด1/2/3 are restricted.
     ------------------------------------------------------------------ */
  function isConsecutiveRestrictedDutyV265(code){
    return RESTRICTED_DUTIES.has(String(code || '').trim());
  }
  function restrictedDutyOnDate(staffId, date, assignments, excludeSlot){
    const sid = String(staffId || '');
    const d = normDate(date);
    const excluded = excludeSlot ? String(excludeSlot.id || excludeSlot._temp_id || '') : '';
    const match = row => {
      if (!row || String(row.staff_id || '') !== sid || normDate(row.duty_date) !== d) return false;
      if (!isConsecutiveRestrictedDutyV265(row.duty_code)) return false;
      return !excluded || String(row.id || row._temp_id || '') !== excluded;
    };
    const st = appState();
    return (Array.isArray(assignments) ? assignments : []).some(match)
      || (Array.isArray(st?.rosterAssignments) ? st.rosterAssignments : []).some(match);
  }
  function hasAdjacentDutyV265(staffId, date, assignments=[], excludeSlot=null){
    // ช4, ช3A, ช3B, ช9 are allowed next to ชบด. Only a target ชบด is checked.
    if (excludeSlot && !isConsecutiveRestrictedDutyV265(excludeSlot.duty_code)) return false;
    const d = parseSafe(date);
    const before = new Date(d); before.setDate(d.getDate() - 1);
    const after = new Date(d); after.setDate(d.getDate() + 1);
    const toKey = value => {
      try { return toDateInput(value); }
      catch (_) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    };
    return restrictedDutyOnDate(staffId, toKey(before), assignments, excludeSlot)
      || restrictedDutyOnDate(staffId, toKey(after), assignments, excludeSlot);
  }
  assignGlobal('isConsecutiveRestrictedDuty', isConsecutiveRestrictedDutyV265);
  assignGlobal('hasAdjacentDuty', hasAdjacentDutyV265);

  /* ------------------------------------------------------------------
     2) Actual available staff and outing Slot count.
     ------------------------------------------------------------------ */
  function leaveType(row){
    try { return String(leaveDisplayType(row) || '').trim(); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || '').split(':::')[0].trim(); }
  }
  function leaveEffective(row){
    try { return typeof isLeaveEffective === 'function' ? !!isLeaveEffective(row) : true; }
    catch (_) {
      const raw = String(row?.status || row?.approval_status || '').trim();
      const lower = raw.toLowerCase();
      return !['cancelled','canceled','deleted','inactive','void','rejected','ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(lower)
        && !['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw);
    }
  }
  function leaveOverlaps(row, date){
    const d = normDate(date);
    try { return !!overlapsDate(row, d); }
    catch (_) {
      const start = normDate(row?.start_date || row?.date || row?.work_date);
      const end = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!start && !!end && start <= d && end >= d;
    }
  }
  function isNoDutyRequest(row){
    try { if (typeof isNoDutyLeaveType === 'function') return !!isNoDutyLeaveType(row); }
    catch (_) {}
    const type = leaveType(row).replace(/\s+/g, ' ').trim().toLowerCase();
    return type === 'ไม่รับเวร'
      || type === 'no duty'
      || type === 'no-duty'
      || type === 'noduty'
      || type === 'no_duty';
  }
  function unavailableRecord(staffId, date){
    const st = appState();
    const sid = String(staffId || '');
    const d = normDate(date);
    if (!st || !sid || !d) return null;
    return (Array.isArray(st.leaves) ? st.leaves : []).find(row =>
      String(row?.staff_id || '') === sid
      && leaveEffective(row)
      && leaveOverlaps(row, d)
      && !isNoDutyRequest(row)
    ) || null;
  }
  function positionStaffEnabled(person){
    if (!person?.id) return false;
    const statusText = `${person.status || ''} ${person.position_training_status || ''} ${person.employment_status || ''}`.toLowerCase();
    if (/ลาออก|resigned|terminated|inactive|ยุติ/.test(statusText)) return false;
    try { return !!isDailyPositionEnabled(person); }
    catch (_) {
      return person.is_active !== false && person.active !== false && person.staff_type !== 'แพทย์' && !person.maternity_status;
    }
  }
  function actualAvailableStaff(date){
    const st = appState();
    const d = normDate(date);
    return ordered((st?.staff || []).filter(person => positionStaffEnabled(person) && !unavailableRecord(person.id, d) && !window.cnmiV271?.excludeFromDaySlot?.(person, d)));
  }
  // Slot size is a weekly rule: a one-day leave keeps the weekly Slot base,
  // while real leave covering every working day of the week reduces it.
  // "ไม่รับเวร" is excluded by unavailableRecord(), so it never reduces daytime Slots.
  function weekWorkingDatesV265(date){
    const d = parseSafe(date);
    if (Number.isNaN(d.getTime())) return [];
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    const dates = [];
    for (let i=0; i<7; i++) {
      const current = new Date(monday);
      current.setDate(monday.getDate() + i);
      const key = (() => {
        try { return toDateInput(current); }
        catch (_) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const dayNo = String(current.getDate()).padStart(2, '0');
          return `${y}-${m}-${dayNo}`;
        }
      })();
      if (!isNoPositionDaySafe(key)) dates.push(key);
    }
    return dates;
  }
  function hasFullWeekRealLeaveV265(person, date){
    if (!person?.id) return false;
    const dates = weekWorkingDatesV265(date);
    return dates.length > 0 && dates.every(workDate => !!unavailableRecord(person.id, workDate));
  }
  function weeklySlotStaffV265(date){
    const st = appState();
    return ordered((st?.staff || []).filter(person =>
      positionStaffEnabled(person)
      && !hasFullWeekRealLeaveV265(person, date)
      && !window.cnmiV271?.excludeFromDaySlot?.(person, normDate(date))
    ));
  }
  function weeklySlotHeadcountV265(date){ return weeklySlotStaffV265(date).length; }
  function outingBucket(count){
    const n = Math.max(0, Number(count || 0));
    if (n <= 12) return 12;
    if (n === 13) return 13;
    return 14;
  }
  function slotConfig(){
    const st = appState();
    try { return window.cnmiV224?.currentConfigs?.() || st?.slotTemplateV224?.configs || null; }
    catch (_) { return st?.slotTemplateV224?.configs || null; }
  }
  function outingSlotsForCount(count){
    const bucket = outingBucket(count);
    try {
      const rows = window.cnmiDayPositionSlotsV218?.outingSlotsV232?.(bucket);
      if (Array.isArray(rows) && rows.length) return clone(rows).slice(0, bucket);
    } catch (_) {}
    const cfg = slotConfig();
    const rows = cfg?.outing_by_count?.[bucket] || cfg?.outing_by_count?.[String(bucket)] || cfg?.outing || [];
    return Array.isArray(rows) ? clone(rows).slice(0, bucket) : [];
  }
  const previousExpectedTemplates231 = window.cnmiV231?.expectedTemplatesForDate231 || null;
  function expectedTemplatesV265(date){
    const d = normDate(date);
    if (!d || isNoPositionDaySafe(d)) return [];
    if (hasOutingSafe(d)) return outingSlotsForCount(weeklySlotHeadcountV265(d));
    try {
      const rows = previousExpectedTemplates231 ? previousExpectedTemplates231(d) : null;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
    try {
      const rows = monthPositionRoleOptionsForDate(d, '');
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
    return [];
  }
  if (window.cnmiV231) {
    window.cnmiV231.weekSlotCount231 = function weekSlotCountV265(date){ return outingBucket(weeklySlotHeadcountV265(date)); };
    window.cnmiV231.expectedTemplatesForDate231 = expectedTemplatesV265;
  }

  function participantIds(date){
    try { return new Set((outingParticipants(normDate(date)) || []).map(String)); }
    catch (_) { return new Set(); }
  }
  function templateZone(template){
    const value = String(template?.zone || '').trim();
    if (/ออกหน่วย/.test(value)) return 'ออกหน่วย';
    return value || 'Blood Bank';
  }
  function positionAllowed(person, template, date){
    if (!person || !template) return false;
    const code = String(template.eligibility_code || template.code || template.position_code || '').trim();
    try {
      if (!positionRuleOk(person, template.main_rule || '')) return false;
    } catch (_) {}
    try {
      if (code && !positionEligible(person, code)) return false;
    } catch (_) {}
    try {
      if (typeof positionCandidateOk === 'function' && !positionCandidateOk(person, template, date)) return false;
    } catch (_) {}
    return true;
  }
  function makePositionRow(person, date, template){
    const code = String(template?.code || template?.position_code || '').trim();
    return {
      work_date:normDate(date),
      position_code:code,
      zone:templateZone(template),
      break_time:template?.break_time || '-',
      main_rule:template?.main_rule || '',
      job_desc:template?.job_desc || '',
      staff_id:person?.id || null,
      updated_by:currentUser()
    };
  }
  function rebuildOutingDateRows(date, oldRows){
    const d = normDate(date);
    const available = actualAvailableStaff(d);
    const availableIds = new Set(available.map(person => String(person.id)));
    const participants = participantIds(d);
    const templates = outingSlotsForCount(weeklySlotHeadcountV265(d));
    const existingByCode = new Map();
    (oldRows || []).forEach(row => {
      const code = baseCode(row?.position_code || row?.code);
      if (code && !existingByCode.has(code)) existingByCode.set(code, row);
    });
    const used = new Set();
    const result = [];
    templates.forEach(template => {
      const code = baseCode(template?.code || template?.position_code);
      const old = existingByCode.get(code);
      let chosen = old && availableIds.has(String(old.staff_id || ''))
        ? available.find(person => String(person.id) === String(old.staff_id))
        : null;
      const zone = templateZone(template);
      const pool = available.filter(person => {
        const sid = String(person.id);
        if (used.has(sid)) return false;
        const belongs = participants.has(sid);
        if (zone === 'ออกหน่วย' && !belongs) return false;
        if (zone !== 'ออกหน่วย' && belongs) return false;
        return positionAllowed(person, template, d);
      });
      if (chosen) {
        const sid = String(chosen.id);
        const belongs = participants.has(sid);
        if (used.has(sid) || (zone === 'ออกหน่วย' && !belongs) || (zone !== 'ออกหน่วย' && belongs) || !positionAllowed(chosen, template, d)) chosen = null;
      }
      if (!chosen) chosen = pool[0] || null;
      if (!chosen) {
        // Keep the Slot visible as missing; do not pull an absent or ineligible person back into the plan.
        return;
      }
      used.add(String(chosen.id));
      result.push({ ...(old || {}), ...makePositionRow(chosen, d, template) });
    });
    return result;
  }
  function postProcessMonthlyDraft(draft, key){
    const st = appState();
    const month = String(key || draft?.monthKey || st?.positionMonthKey || st?.monthKey || '').slice(0, 7);
    if (!draft || !Array.isArray(draft.rows) || !/^\d{4}-\d{2}$/.test(month)) return draft;
    const rows = draft.rows.slice();
    const outingDates = Array.from(new Set(rows.map(row => normDate(row?.work_date)).filter(date => date.startsWith(month) && hasOutingSafe(date))));
    // Include outing dates even when the old generator produced no row for them.
    try {
      const [year, monthNo] = month.split('-').map(Number);
      const last = new Date(year, monthNo, 0).getDate();
      for (let day=1; day<=last; day++) {
        const date = `${month}-${String(day).padStart(2,'0')}`;
        if (hasOutingSafe(date) && !outingDates.includes(date)) outingDates.push(date);
      }
    } catch (_) {}
    let next = rows.filter(row => !outingDates.includes(normDate(row?.work_date)));
    outingDates.sort().forEach(date => {
      const old = rows.filter(row => normDate(row?.work_date) === date);
      next = next.concat(rebuildOutingDateRows(date, old));
    });
    draft.rows = next;
    draft.outingActualHeadcountV265 = true;
    return draft;
  }
  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v265ActualOutingCount) {
      const wrappedBuild = function buildMonthlyPositionDraftV265(key){
        return postProcessMonthlyDraft(previousBuild.apply(this, arguments), key);
      };
      wrappedBuild.__v265ActualOutingCount = true;
      assignGlobal('buildMonthlyPositionDraft', wrappedBuild);
    }
  } catch (error) { console.warn(`${VERSION}: monthly draft wrapper skipped`, error); }

  /* Render monthly matrix with the actual available count for each outing day. */
  function activeLeaveRow(staffId, date){ return unavailableRecord(staffId, date); }
  function leaveLabel(row){ return leaveType(row) || 'ลา'; }
  function leaveClassSafe(row){
    try { return leaveCellClass(leaveLabel(row)); }
    catch (_) { return 'leave-other'; }
  }
  function staffColorSafe(person){ try { return staffColor(person); } catch (_) { return '#dbeafe'; } }
  function textColorSafe(color){ try { return textColorFor(color); } catch (_) { return '#0f172a'; } }
  function canEditMonth(){
    try { return isAdmin() && appState()?.page === 'positionMonth'; }
    catch (_) { return appState()?.profile?.role === 'admin' && appState()?.page === 'positionMonth'; }
  }
  function monthOptions(date, current){
    const expected = expectedTemplatesV265(date).slice();
    const code = String(current || '').trim();
    if (code && !expected.some(row => String(row?.code || row?.position_code || '') === code)) {
      try {
        const extra = positionTemplateByCode(code, date);
        if (extra?.code) expected.push(extra);
      } catch (_) {}
    }
    const seen = new Set();
    return expected.filter(row => {
      const c = String(row?.code || row?.position_code || '').trim();
      return c && !seen.has(c) && !!seen.add(c);
    });
  }
  function renderMonthPositionMatrixV265(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) ? dates : [];
    if (!rows.length) {
      try { return empty('ยังไม่มีแผนรายเดือน กดสร้างตารางหรือสร้างแผนก่อน'); }
      catch (_) { return '<div class="empty">ยังไม่มีแผนรายเดือน</div>'; }
    }
    const st = appState();
    const byCell = Object.create(null);
    const assignedCodes = new Map();
    const assignedStaff = new Map();
    rows.forEach((row, index) => {
      const sid = String(row?.staff_id || '');
      const date = normDate(row?.work_date);
      if (!sid || !date) return;
      const unavailable = activeLeaveRow(sid, date);
      const person = (st?.staff || []).find(item => String(item?.id || '') === sid) || null;
      if (hasOutingSafe(date) && (unavailable || !positionStaffEnabled(person))) return;
      const item = { ...row, _idx:index };
      (byCell[`${sid}|${date}`] ||= []).push(item);
      const code = String(row?.position_code || row?.code || '').trim();
      if (code && code !== 'รอตรวจสอบ') {
        if (!assignedCodes.has(date)) assignedCodes.set(date, new Set());
        assignedCodes.get(date).add(baseCode(code));
        if (!assignedStaff.has(date)) assignedStaff.set(date, new Set());
        assignedStaff.get(date).add(sid);
      }
    });
    const rowStaffIds = new Set(rows.map(row => String(row?.staff_id || '')).filter(Boolean));
    const displayStaff = ordered((st?.staff || []).filter(person => positionStaffEnabled(person) || rowStaffIds.has(String(person.id))));
    const editable = canEditMonth();
    const heads = dates.map(date => {
      const parsed = parseSafe(date);
      let cls = '';
      try { cls = isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; } catch (_) {}
      return `<th class="date-head ${cls}"><b>${parsed.getDate()}</b><br><span>${esc(parsed.toLocaleDateString('th-TH', { weekday:'short' }))}</span></th>`;
    }).join('');
    const countCells = dates.map(date => {
      if (isNoPositionDaySafe(date)) return '<th class="count-role-cell no-position-day">ไม่จัด</th>';
      const available = hasOutingSafe(date) ? actualAvailableStaff(date).length : (() => {
        try { return window.cnmiV233?.weeklyAvailableStaff?.(date)?.length || actualAvailableStaff(date).length; }
        catch (_) { return actualAvailableStaff(date).length; }
      })();
      const slots = expectedTemplatesV265(date).length;
      const assigned = assignedStaff.get(normDate(date))?.size || 0;
      const tone = assigned >= Math.min(available, slots) ? 'complete' : 'has-missing';
      return `<th class="count-role-cell ${tone}"><b>${available}/${slots}</b><br><small>คน/Slot</small></th>`;
    }).join('');
    const missingCells = dates.map(date => {
      if (isNoPositionDaySafe(date)) return '<th class="missing-role-cell no-position-day">ไม่จัด</th>';
      const assigned = assignedCodes.get(normDate(date)) || new Set();
      const missing = expectedTemplatesV265(date).filter(row => !assigned.has(baseCode(row?.code || row?.position_code)));
      if (!missing.length) return '<th class="missing-role-cell complete">ครบ</th>';
      return `<th class="missing-role-cell has-missing"><b>${missing.length}</b><br><small>${missing.map(row => esc(row?.code || row?.position_code || '')).join(', ')}</small></th>`;
    }).join('');
    const body = displayStaff.map(person => {
      const bg = staffColorSafe(person);
      const fg = textColorSafe(bg);
      const cells = dates.map(date => {
        if (isNoPositionDaySafe(date)) {
          let label = 'WEEKEND';
          try { if (isHolidayDate(date)) label = 'HOLIDAY'; } catch (_) {}
          return `<td class="matrix-cell no-position-day"><span>${label}</span></td>`;
        }
        const sid = String(person.id);
        const leave = activeLeaveRow(sid, date);
        const cellRows = byCell[`${sid}|${normDate(date)}`] || [];
        const cleanCodes = cellRows.map(row => String(row?.position_code || row?.code || '').trim()).filter(code => code && code !== 'รอตรวจสอบ');
        const current = cleanCodes[0] || '';
        const classes = `${hasOutingSafe(date) ? 'outing-cell' : ''} ${leave ? 'leave-cell ' + leaveClassSafe(leave) : ''} ${!cleanCodes.length && !leave ? 'needs-review-cell' : ''}`.trim();
        if (editable) {
          const options = monthOptions(date, current);
          return `<td class="matrix-cell ${classes}"><select class="month-position-select" data-month-position-edit="${esc(normDate(date))}|${esc(sid)}"><option value="">${leave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${options.map(row => { const code = String(row?.code || row?.position_code || ''); return `<option value="${esc(code)}" ${current === code ? 'selected' : ''}>${esc(code)}</option>`; }).join('')}</select>${leave ? `<small class="leave-note-v228">${esc(leaveLabel(leave))}</small>` : ''}</td>`;
        }
        // If there is no position, show the leave type only once in the leave note.
        // If there is a position plus partial-day leave, show position + one leave note.
        const text = cleanCodes.length ? cleanCodes.join(' / ') : '';
        return `<td class="matrix-cell ${classes}">${text ? `<span>${esc(text)}</span>` : ''}${leave ? `<small class="leave-note-v228">${esc(leaveLabel(leave))}</small>` : ''}</td>`;
      }).join('');
      return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(person.nickname || person.full_name || '-')}</b><small>${esc(person.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(person.id)}" type="button">ดูสรุป</button></td>${cells}</tr>`;
    }).join('');
    return `<div class="monthly-matrix-wrap v265-position-matrix"><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countCells}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missingCells}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  }
  assignGlobal('renderMonthPositionMatrix', renderMonthPositionMatrixV265);

  /* Daily page: feed the outing template matching the actual available count. */
  try {
    const previousDailyRender = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (previousDailyRender && !previousDailyRender.__v265ActualOutingCount) {
      const wrappedDailyRender = function renderPositionsPageV265(){
        const st = appState();
        const date = normDate(st?.positionDate || document.getElementById('positionDateInput')?.value || '');
        const cfg = slotConfig();
        const oldOuting = cfg && Array.isArray(cfg.outing) ? cfg.outing : null;
        const oldPositions = st && Array.isArray(st.positions) ? st.positions : null;
        const unavailableIds = new Set();
        try {
          if (date && hasOutingSafe(date)) {
            const available = actualAvailableStaff(date);
            const availableIds = new Set(available.map(person => String(person.id)));
            (st?.staff || []).forEach(person => { if (!availableIds.has(String(person.id))) unavailableIds.add(String(person.id)); });
            if (cfg) cfg.outing = outingSlotsForCount(weeklySlotHeadcountV265(date));
            if (st && oldPositions) {
              st.positions = oldPositions.filter(row => normDate(row?.work_date) !== date || !row?.staff_id || availableIds.has(String(row.staff_id)));
            }
          }
          let html = String(previousDailyRender.apply(this, arguments) || '');
          if (date && hasOutingSafe(date) && unavailableIds.size && typeof document !== 'undefined') {
            const template = document.createElement('template');
            template.innerHTML = html;
            template.content.querySelectorAll('select[data-position-row] option').forEach(option => {
              if (unavailableIds.has(String(option.value || ''))) option.remove();
            });
            html = template.innerHTML;
          }
          return html;
        } finally {
          if (cfg && oldOuting) cfg.outing = oldOuting;
          if (st && oldPositions) st.positions = oldPositions;
        }
      };
      wrappedDailyRender.__v265ActualOutingCount = true;
      assignGlobal('renderPositionsPage', wrappedDailyRender);
    }
  } catch (error) { console.warn(`${VERSION}: daily render wrapper skipped`, error); }

  function updateDailyCompareCards(){
    const st = appState();
    if (st?.page !== 'positions') return;
    const date = normDate(document.getElementById('positionDateInput')?.value || st.positionDate || '');
    if (!date || !hasOutingSafe(date)) return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    const available = actualAvailableStaff(date);
    const participants = participantIds(date);
    const joining = available.filter(person => participants.has(String(person.id))).length;
    const slots = outingSlotsForCount(weeklySlotHeadcountV265(date)).length;
    const cards = root.querySelectorAll('.v225-compare-cards > div');
    const diff = available.length - slots;
    cards.forEach((card, index) => {
      const strong = card.querySelector('b, strong, .metric-value');
      const label = card.querySelector('span');
      if (!strong) return;
      if (index === 0) strong.textContent = String(available.length);
      if (index === 1) strong.textContent = String(joining);
      if (index === 2) strong.textContent = String(slots);
      if (index === 3) {
        strong.textContent = diff === 0 ? 'พอดี' : (diff > 0 ? `เกิน ${diff}` : `ขาด ${Math.abs(diff)}`);
        if (label) label.textContent = 'เทียบคนที่อยู่จริงกับ Slot';
        card.classList.toggle('warn', diff < 0);
        card.classList.toggle('info', diff > 0);
        card.classList.toggle('ok', diff === 0);
      }
    });
  }

  /* ------------------------------------------------------------------
     3) Server-verified personal permissions; never overwrite another person.
     ------------------------------------------------------------------ */
  function normalizePermissionRows(rows){
    try { return window.cnmiV260?.normalizePermissionRows?.(rows) || rows || []; }
    catch (_) { return rows || []; }
  }
  function writePermissionCache(rows){
    try {
      localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify({
        version:3,
        source:'supabase-v265',
        saved_at:new Date().toISOString(),
        rows:normalizePermissionRows(rows)
      }));
    } catch (_) {}
  }
  function setPermissionBusy(active){
    document.querySelectorAll('[data-save-position-eligibility], [data-v258-enable-all]').forEach(button => {
      if (!button.dataset.v265Text) button.dataset.v265Text = button.textContent || '';
      button.disabled = !!active;
      if (active && button.hasAttribute('data-save-position-eligibility')) button.textContent = 'กำลังบันทึกและตรวจสอบ…';
      if (!active && button.dataset.v265Text) button.textContent = button.dataset.v265Text;
    });
  }
  async function savePositionEligibilityV265(){
    const st = appState();
    try { if (typeof isAdmin === 'function' && !isAdmin()) return toast('เฉพาะ Admin เท่านั้น', 'error'); }
    catch (_) { if (st?.profile?.role !== 'admin') return toast('เฉพาะ Admin เท่านั้น', 'error'); }
    if (permissionSaveInFlight) return toast('ระบบกำลังบันทึกสิทธิ์ กรุณารอสักครู่');
    const api = window.cnmiV258;
    if (!api?.visibleSnapshot || !api?.persistRows) return toast('ไม่พบระบบบันทึกสิทธิ์รายบุคคล', 'error');
    const rows = api.visibleSnapshot();
    if (!rows.length) return toast('ไม่มีข้อมูลสิทธิ์ของเจ้าหน้าที่ที่เลือก', 'error');
    const staffIds = new Set(rows.map(row => String(row.staff_id || '')).filter(Boolean));
    if (staffIds.size !== 1) return toast('หน้าจอมีข้อมูลมากกว่าหนึ่งคน ระบบหยุดเพื่อป้องกันสิทธิ์ปนกัน', 'error');
    const db = client();
    if (!db) return toast('ไม่พบ Supabase client', 'error');

    permissionSaveInFlight = true;
    setPermissionBusy(true);
    busy(true, 'กำลังบันทึกสิทธิ์เฉพาะบุคคล');
    try {
      // Every web save must write the newly selected values to Supabase first.
      // Local state/cache is updated only after the database read-back matches.
      const result = await api.persistRows(rows);
      const staffId = result.staffId || Array.from(staffIds)[0];
      // V269: bypass every old in-flight/global refresh flag and read this staff directly.
      // This is the real post-save force refresh used by the final active save function.
      let serverRows;
      if (typeof window.loadStaffPermissions === 'function') {
        serverRows = normalizePermissionRows(await window.loadStaffPermissions(staffId, { force:true, render:false, silent:true }));
      } else {
        const readback = await db.from('daily_position_eligibility').select('*').eq('staff_id', staffId);
        if (readback.error) throw readback.error;
        serverRows = normalizePermissionRows(readback.data || []);
      }
      const desired = new Map(rows.map(row => [String(row.position_code), !!row.is_eligible]));
      for (const [code, wanted] of desired) {
        const saved = serverRows.find(row => String(row.position_code) === code);
        if (!saved || bool(saved.is_eligible) !== wanted) throw new Error(`ตรวจสอบสิทธิ์ ${code} หลังบันทึกไม่ผ่าน`);
      }
      const others = (st?.positionEligibility || []).filter(row => String(row?.staff_id || '') !== String(staffId));
      if (st) {
        st.positionEligibility = normalizePermissionRows(others.concat(serverRows));
        st.positionEligibilitySourceV265 = 'supabase-force-verified-v269';
        st.positionEligibilityLoadedAtV265 = new Date().toISOString();
      }
      try { api.sessionValues?.clear?.(); } catch (_) {}
      writePermissionCache(st?.positionEligibility || serverRows);
      let removed = 0;
      try { removed = Number(await window.cnmiV255?.deleteInvalidFutureAssignments?.([staffId]) || 0); } catch (cleanupError) { console.warn(`${VERSION}: future cleanup skipped`, cleanupError); }
      try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); }
      catch (_) { try { renderPage(); } catch (__) {} }
      toast(removed > 0
        ? `บันทึกสิทธิ์รายบุคคลแล้ว และล้างตำแหน่งอนาคตที่ไม่ตรงสิทธิ์ ${removed} รายการ`
        : 'บันทึกและตรวจสอบสิทธิ์รายบุคคลกับ Supabase แล้ว');
      return true;
    } catch (error) {
      console.error(`${VERSION}: permission save failed`, error);
      toast('บันทึกสิทธิ์ไม่สำเร็จ: ' + friendly(error), 'error');
      return false;
    } finally {
      permissionSaveInFlight = false;
      setPermissionBusy(false);
      busy(false);
    }
  }
  assignGlobal('savePositionEligibility', savePositionEligibilityV265);

  /* ------------------------------------------------------------------
     4) Daily save/publish -> monthly source of truth.
     ------------------------------------------------------------------ */
  function overrideMap(){
    const st = appState();
    if (!st) return {};
    if (!st[DAILY_OVERRIDE_KEY] || typeof st[DAILY_OVERRIDE_KEY] !== 'object') st[DAILY_OVERRIDE_KEY] = {};
    return st[DAILY_OVERRIDE_KEY];
  }
  function applyDateRows(date, rows, status, remember=true){
    const st = appState();
    const d = normDate(date);
    if (!st || !d) return;
    const freshRows = (rows || []).map(row => ({ ...row }));
    st.positions = (Array.isArray(st.positions) ? st.positions : []).filter(row => normDate(row?.work_date) !== d).concat(freshRows);
    st.positionDayStatus = (Array.isArray(st.positionDayStatus) ? st.positionDayStatus : []).filter(row => normDate(row?.work_date) !== d).concat(status ? [{ ...status }] : []);
    if (st.monthPositionDraft?.monthKey === d.slice(0,7) && Array.isArray(st.monthPositionDraft.rows)) {
      st.monthPositionDraft = {
        ...st.monthPositionDraft,
        rows:st.monthPositionDraft.rows.filter(row => normDate(row?.work_date) !== d).concat(freshRows),
        dailyAuthoritativeV265:true
      };
    }
    if (remember) overrideMap()[d] = { rows:freshRows, status:status ? { ...status } : null, at:new Date().toISOString() };
  }
  function applyStoredOverrides(){
    const st = appState();
    if (!st) return;
    const map = overrideMap();
    Object.keys(map).forEach(date => {
      const savedAt = Date.parse(map[date]?.at || '') || 0;
      if (!savedAt || Date.now() - savedAt > 120000) { delete map[date]; return; }
      applyDateRows(date, map[date]?.rows || [], map[date]?.status || null, false);
    });
  }
  async function forceDailyReadback(date){
    const d = normDate(date);
    if (!d) return false;
    const api = window.cnmiV261;
    const db = client();
    if (!api?.fetchDateFromDatabase || !db) return false;
    const fresh = await api.fetchDateFromDatabase(d);
    applyDateRows(d, fresh.rows || [], fresh.status || null);
    try { await api.refreshMonthFromDatabase?.(d.slice(0,7), { render:false, silent:true }); } catch (_) {}
    // Reapply exact daily row after a month fetch, so stale draft/cache cannot win.
    applyDateRows(d, fresh.rows || [], fresh.status || null);
    return true;
  }
  function wrapDailyAction(name){
    const previous = window[name] || null;
    if (typeof previous !== 'function' || previous.__v265MonthlyAuthoritative) return;
    const wrapped = async function dailyActionV265(){
      if (dailySyncInFlight) return previous.apply(this, arguments);
      const st = appState();
      const date = normDate(document.getElementById('positionDateInput')?.value || st?.positionDate || '');
      dailySyncInFlight = true;
      try {
        const result = await previous.apply(this, arguments);
        if (result !== false && date) {
          await forceDailyReadback(date);
          try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
        }
        return result;
      } catch (error) {
        console.error(`${VERSION}: daily/month sync failed`, error);
        toast('บันทึกตำแหน่งแล้ว แต่ซิงก์หน้ารายเดือนไม่สำเร็จ: ' + friendly(error), 'error');
        return false;
      } finally { dailySyncInFlight = false; }
    };
    wrapped.__v265MonthlyAuthoritative = true;
    assignGlobal(name, wrapped);
  }
  wrapDailyAction('savePositions');
  wrapDailyAction('publishPositionsForDay');

  /* ------------------------------------------------------------------
     5) Grouped balance with reset-aware OT Balance and position detail.
     ------------------------------------------------------------------ */
  function monthKeySafe(key){ return /^\d{4}-\d{2}$/.test(String(key || '').slice(0,7)) ? String(key).slice(0,7) : new Date().toISOString().slice(0,7); }
  function nextMonthKey(key){
    const month = monthKeySafe(key);
    const [year, monthNo] = month.split('-').map(Number);
    const next = new Date(year, monthNo, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2,'0')}`;
  }
  function resetMonth(person){ return String(person?.balance_reset_at || '').slice(0,7); }
  function carryValue(person){ return num(person?.carry_over_balance ?? person?.overtime_balance ?? person?.overtimeBalance ?? person?.ot_balance, 0); }
  function excludedFromBalance(person){
    try { return !!isLongTermLeaveStaff(person); }
    catch (_) {
      const target = person?.targetShifts ?? person?.target_shifts ?? person?.target_shift_count;
      return bool(person?.is_long_term_leave) || Number(target) === 0;
    }
  }
  function groupLabel(person){ return String(person?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT'; }
  function countDutyCodes(assignments, staffId){
    const out = { chbd1:0, chbd2:0, chbd3:0, ch3a:0, ch3b:0, ch4:0, ch9:0 };
    (assignments || []).forEach(row => {
      if (String(row?.staff_id || '') !== String(staffId)) return;
      const code = String(row?.duty_code || '').trim();
      if (code === 'ชบด1') out.chbd1++;
      else if (code === 'ชบด2') out.chbd2++;
      else if (code === 'ชบด3') out.chbd3++;
      else if (code === 'ช3A') out.ch3a++;
      else if (code === 'ช3B') out.ch3b++;
      else if (code === 'ช4' || code === 'ช4A' || code === 'ช4B' || code === 'ช4-MT') out.ch4++;
      else if (code.startsWith('ช9')) out.ch9++;
    });
    return out;
  }
  function badgeSafe(text, color){
    try { return badge(text, color); }
    catch (_) { return `<span class="badge ${esc(color)}">${esc(text)}</span>`; }
  }
  function staffPillSafe(person){
    try { return staffPill(person); }
    catch (_) { return esc(person?.nickname || person?.full_name || '-'); }
  }
  function balanceData(staffList, assignments, key){
    const month = monthKeySafe(key);
    let stats = {};
    try { stats = calcFairness((assignments || []).filter(row => row.staff_id)) || {}; } catch (_) {}
    return ['MT','เคิก'].map(label => {
      const people = (staffList || []).filter(person => groupLabel(person) === label);
      const included = people.filter(person => !excludedFromBalance(person));
      const units = included.map(person => num(stats[person.id]?.units, 0));
      const average = units.length ? units.reduce((sum, value) => sum + value, 0) / units.length : 0;
      const rows = people.map(person => {
        const stat = stats[person.id] || {};
        const excluded = excludedFromBalance(person);
        const unit = num(stat.units, 0);
        const gap = excluded ? 0 : unit - average;
        const resetKey = resetMonth(person);
        const savedCarry = carryValue(person);
        const localEffectiveMonth = String(person?.__balance_reset_effective_month_v265 || '').slice(0,7);
        const resetWindow = !!resetKey && savedCarry === 0 && month >= resetKey && month <= nextMonthKey(resetKey);
        const resetActive = localEffectiveMonth === month || resetWindow;
        const carry = (excluded || resetActive) ? 0 : savedCarry;
        // Reset means the cumulative OT Balance starts at zero; Quota Gap remains visible separately.
        const otBalance = excluded || resetActive ? 0 : carry + gap;
        let daysOff = 0;
        try { daysOff = excluded ? 0 : calculateDaysOff(person.id, month, assignments); } catch (_) {}
        const detail = countDutyCodes(assignments, person.id);
        const total = (assignments || []).filter(row => String(row?.staff_id || '') === String(person.id)).length;
        let status = 'สมดุล'; let color = 'green';
        if (excluded) { status = 'ลาระยะยาว / ไม่คิดหนี้เวร'; color = 'black'; }
        else if (resetActive) { status = 'รีเซ็ตยอดสะสมเป็น 0 แล้ว'; color = 'blue'; }
        else if (otBalance > 0.5) { status = 'เวรมากกว่าสมดุล'; color = 'orange'; }
        else if (otBalance < -0.5) { status = 'เวรน้อยกว่าสมดุล'; color = 'blue'; }
        return {
          person, total, units:unit, hours:num(stat.hours,0), pay:num(stat.pay,0), gap, otBalance, daysOff, detail, status, color
        };
      });
      return { label, people, average, rows };
    }).filter(group => group.people.length);
  }
  function balanceTableHtml(staffList, assignments, key, options={}){
    const groups = balanceData(staffList, assignments, key);
    const sections = groups.map(group => `<section class="balance-group-section v265-balance-group"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeSafe(`ค่าเฉลี่ย ${group.average.toFixed(1)} หน่วยเวร`, 'blue')}</span></div><div class="table-wrap v265-balance-wrap"><table class="clean-balance-table v265-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th>OT Balance</th><th>วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th></tr></thead><tbody>${group.rows.map(row => `<tr><td>${staffPillSafe(row.person)}</td><td>${row.total}</td><td>${row.units.toFixed(1)}</td><td>${row.hours.toFixed(1)}</td><td>${row.pay.toLocaleString()}</td><td>${row.gap.toFixed(1)}</td><td>${row.otBalance.toFixed(1)}</td><td>${row.daysOff}</td><td>${row.detail.chbd1}</td><td>${row.detail.chbd2}</td><td>${row.detail.chbd3}</td><td>${row.detail.ch3a}</td><td>${row.detail.ch3b}</td><td>${row.detail.ch4}</td><td>${row.detail.ch9}</td><td>${badgeSafe(row.status, row.color)}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v265-balance-dashboard">${sections || '<div class="empty">ยังไม่มีข้อมูลสำหรับคำนวณสมดุลเวร</div>'}</div>`;
  }
  function renderBalanceDashboardV265(staffList, assignments, key){
    return balanceTableHtml(staffList, assignments, key || appState()?.monthKey);
  }
  function showFairnessV265(){
    const st = appState();
    const key = monthKeySafe(st?.monthKey);
    let assignments = [];
    try { assignments = getAssignmentsForMonth(key).filter(row => row.staff_id); }
    catch (_) { assignments = (st?.rosterAssignments || []).filter(row => normDate(row?.duty_date).startsWith(key) && row.staff_id); }
    let staffList = [];
    try { staffList = scheduleStaffList(); }
    catch (_) { staffList = ordered((st?.staff || []).filter(person => { try { return isRosterEnabled(person); } catch (__) { return true; } })); }
    try { showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${balanceTableHtml(staffList, assignments, key, { modal:true })}`, { large:true }); }
    catch (_) {}
  }
  assignGlobal('renderBalanceDashboard', renderBalanceDashboardV265);
  assignGlobal('showFairness', showFairnessV265);

  async function resetBalanceV265(staffId){
    const db = client();
    const st = appState();
    if (!db) return toast('ไม่พบ Supabase client', 'error');
    const person = (st?.staff || []).find(row => String(row?.id || '') === String(staffId)) || {};
    const name = person.nickname || person.full_name || 'เจ้าหน้าที่นี้';
    let accepted = false;
    try { accepted = await confirmDialog(`ยืนยันรีเซ็ตยอดสะสมของ ${name} เป็น 0 โดยไม่แก้ประวัติตารางเวรย้อนหลัง?`, 'รีเซ็ตยอดสะสม'); }
    catch (_) { accepted = window.confirm(`ยืนยันรีเซ็ตยอดสะสมของ ${name} เป็น 0 ?`); }
    if (!accepted) return false;
    busy(true, 'กำลังรีเซ็ตยอดสะสม');
    try {
      const resetAt = new Date().toISOString();
      const patch = { carry_over_balance:0, overtime_balance:0, ot_balance:0, balance_reset_at:resetAt };
      const rpc = await db.rpc('reset_staff_balance_v140', { p_staff_id:staffId });
      if (rpc.error) {
        const update = await db.from('staff_profiles').update(patch).eq('id', staffId).select('*').maybeSingle();
        if (update.error) throw update.error;
        if (!update.data) throw rpc.error;
      }
      const readback = await db.from('staff_profiles').select('*').eq('id', staffId).maybeSingle();
      if (readback.error) throw readback.error;
      Object.assign(person, patch, readback.data || {});
      person.__balance_reset_effective_month_v265 = monthKeySafe(st?.monthKey);
      try { renderPage(); } catch (_) {}
      toast('รีเซ็ตยอดสะสมเป็น 0 แล้ว โดยไม่แก้ประวัติเวรย้อนหลัง');
      return true;
    } catch (error) {
      console.error(`${VERSION}: balance reset failed`, error);
      toast('รีเซ็ตยอดสะสมไม่สำเร็จ: ' + friendly(error), 'error');
      return false;
    } finally { busy(false); }
  }

  /* Remove the old V140 click target so its closed-over reset handler cannot run first. */
  function upgradeResetButtons(){
    document.querySelectorAll('[data-v140-reset-balance]').forEach(button => {
      const id = button.getAttribute('data-v140-reset-balance');
      button.removeAttribute('data-v140-reset-balance');
      button.setAttribute('data-v265-reset-balance', id || '');
    });
  }
  document.addEventListener('click', function(event){
    const button = event.target?.closest?.('[data-v265-reset-balance]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    resetBalanceV265(button.getAttribute('data-v265-reset-balance'));
  }, true);

  /* ------------------------------------------------------------------
     6) UI cleanup and final render hook.
     ------------------------------------------------------------------ */
  function cleanDescriptions(){
    const subtitle = document.getElementById('pageSubtitle');
    if (subtitle) { subtitle.textContent = ''; subtitle.setAttribute('aria-hidden','true'); }
    document.querySelectorAll('.v225-job-short, [data-v226-position-detail], .daily-position-table th:last-child, .daily-position-table td:last-child').forEach(node => node.classList.add('v265-description-hidden'));
    upgradeResetButtons();
    updateDailyCompareCards();
  }
  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !oldRenderPage.__v265FinalRender) {
    const renderPageV265 = function(){
      applyStoredOverrides();
      const result = oldRenderPage.apply(this, arguments);
      setTimeout(cleanDescriptions, 0);
      setTimeout(cleanDescriptions, 80);
      return result;
    };
    renderPageV265.__v265FinalRender = true;
    assignGlobal('renderPage', renderPageV265);
  }

  try {
    const observer = new MutationObserver(() => cleanDescriptions());
    observer.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v265-stability-style';
  style.textContent = `
    #pageSubtitle,.nav-section-title small,.v265-description-hidden{display:none!important}
    .section-title p.hint,.section-title span.hint,.v225-position-note,.v260-source-note,.v260-permission-source-note,.v258-save-scope-note{display:none!important}
    .daily-position-table th:last-child,.daily-position-table td:last-child,.v225-position-card [data-v226-position-detail]{display:none!important}
    .v265-balance-wrap{max-width:100%;overflow:auto}
    .v265-balance-table{min-width:1480px}
    .v265-balance-table th,.v265-balance-table td{white-space:nowrap;text-align:center}
    .v265-balance-table th:first-child,.v265-balance-table td:first-child{text-align:left;position:sticky;left:0;z-index:2;background:var(--surface,#fff)}
    .v265-balance-group{margin-bottom:14px}
    .v265-position-matrix .count-role-cell b{font-size:13px}
    @media(max-width:760px){.v265-balance-table{min-width:1320px}.v265-balance-table th,.v265-balance-table td{font-size:11px;padding:7px 6px}}
  `;
  document.head.appendChild(style);

  setTimeout(cleanDescriptions, 100);
  setTimeout(cleanDescriptions, 600);

  window.cnmiV265 = {
    actualAvailableStaff,
    weeklySlotStaffV265,
    weeklySlotHeadcountV265,
    hasFullWeekRealLeaveV265,
    unavailableRecord,
    outingSlotsForCount,
    expectedTemplatesV265,
    postProcessMonthlyDraft,
    rebuildOutingDateRows,
    savePositionEligibilityV265,
    forceDailyReadback,
    renderBalanceDashboardV265,
    resetBalanceV265,
    hasAdjacentDutyV265,
    cleanDescriptions
  };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v265-stability-rule-corrections.js", error); }
;

/* Original source: patch-v266-context-aware-auto-assign.js */
try {
/* V266 Context-aware Auto Assign
   - Centralizes staff availability before roster Auto Assign.
   - Real leave blocks both roster duty and daytime positions on that date.
   - "ไม่รับเวร" blocks roster/night duty only; daytime positions remain allowed.
   - Cancelled/rejected/inactive leave records do not block assignment.
   - Existing unlocked assignments that became invalid are cleared before fairness calculation.
   - Unfillable slots remain vacant and are labelled "ตำแหน่งว่าง (Vacant)".
*/
(function(){
  'use strict';
  const VERSION = 'V266_CONTEXT_AWARE_AUTO_ASSIGN';
  if (window.__CNMI_V266_CONTEXT_AWARE_AUTO_ASSIGN__) return;
  window.__CNMI_V266_CONTEXT_AWARE_AUTO_ASSIGN__ = true;

  const DUTY_RULE_PREFIX = 'DUTY_RULE:';
  const RESTRICTED_CODES = new Set(['ชบด1', 'ชบด2', 'ชบด3']);
  // Every code below belongs to the roster/night-duty table. The 'night_roster'
  // context therefore applies to all of them, not only to BB/Donor labels.
  const NIGHT_ROSTER_DUTY_CODES = new Set([
    'ชบด1','ชบด2','ชบด3',
    'ช3A','ช3B',
    'ช4','ช4A','ช4B','ช4-MT/แตง 1','ช4-MT/แตง 2',
    'ช9','ช9-เคิก','ช9-MT','ช9-MT/แตง'
  ]);

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function normId(value){ return String(value == null ? '' : value); }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function clone(value){
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  }
  function assignGlobal(name, fn){
    try { window[name] = fn; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function truthy(value){
    if (value === true) return true;
    return ['true','1','yes','y','on','active','ใช่','เปิด','ลา','on_leave','leave'].includes(String(value ?? '').trim().toLowerCase());
  }
  function explicitlyFalse(value){
    if (value === false) return true;
    return ['false','0','no','n','off','inactive','ปิด','ไม่','ไม่รับเวร','ไม่รับ'].includes(String(value ?? '').trim().toLowerCase());
  }
  function leaveType(row){
    try { return String(leaveDisplayType(row) || '').trim(); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || '').split(':::')[0].trim(); }
  }
  function isNoDuty(row){
    try { return typeof isNoDutyLeaveType === 'function' ? !!isNoDutyLeaveType(row) : leaveType(row) === 'ไม่รับเวร'; }
    catch (_) { return leaveType(row) === 'ไม่รับเวร'; }
  }
  function leaveIsEffective(row){
    try { return typeof isLeaveEffective === 'function' ? !!isLeaveEffective(row) : true; }
    catch (_) {
      const raw = String(row?.status || row?.approval_status || 'active').trim();
      const lower = raw.toLowerCase();
      return !['cancelled','canceled','deleted','inactive','void','rejected'].includes(lower)
        && !['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw);
    }
  }
  function leaveOverlaps(row, date){
    const d = normDate(date);
    try { return typeof overlapsDate === 'function' ? !!overlapsDate(row, d) : false; }
    catch (_) {
      const start = normDate(row?.start_date || row?.date || row?.work_date);
      const end = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!start && !!end && start <= d && d <= end;
    }
  }
  function activeStatusRows(staffId, date){
    const st = appState();
    const sid = normId(staffId);
    const d = normDate(date);
    if (!st || !sid || !d) return [];
    return (Array.isArray(st.leaves) ? st.leaves : []).filter(row =>
      normId(row?.staff_id) === sid && leaveIsEffective(row) && leaveOverlaps(row, d)
    );
  }
  function staffById(staffId){
    const st = appState();
    return (st?.staff || []).find(person => normId(person?.id) === normId(staffId)) || null;
  }
  function staffGloballyOnLeave(staff){
    if (!staff || !Object.prototype.hasOwnProperty.call(staff, 'status_leave')) return false;
    return truthy(staff.status_leave);
  }
  function staffAcceptsNightDuty(staff){
    if (!staff || !Object.prototype.hasOwnProperty.call(staff, 'status_accept_night_shift')) return true;
    return !explicitlyFalse(staff.status_accept_night_shift);
  }

  /* Context source of truth.
     context = 'night_roster' or 'day_position'. */
  function getStaffAvailabilityContextV266(staffOrId, date, context='night_roster'){
    const staff = typeof staffOrId === 'object' ? staffOrId : staffById(staffOrId);
    const d = normDate(date);
    if (!staff || !d) return { available:false, reason:'ไม่พบข้อมูลเจ้าหน้าที่', realLeave:null, noDuty:null };

    let enabled = true;
    try {
      enabled = context === 'day_position'
        ? (typeof isDailyPositionEnabled === 'function' ? !!isDailyPositionEnabled(staff) : staff.is_active !== false)
        : (typeof isRosterEnabled === 'function' ? !!isRosterEnabled(staff) : staff.is_active !== false);
    } catch (_) { enabled = staff.is_active !== false; }
    if (!enabled) return { available:false, reason:context === 'day_position' ? 'ปิดใช้งานตำแหน่งกลางวัน' : 'ปิดใช้งานการจัดเวร', realLeave:null, noDuty:null };
    if (staffGloballyOnLeave(staff)) return { available:false, reason:'สถานะพนักงานเป็นลา', realLeave:{ type:'status_leave' }, noDuty:null };

    const rows = activeStatusRows(staff.id, d);
    const realLeave = rows.find(row => !isNoDuty(row)) || null;
    const noDuty = rows.find(isNoDuty) || null;

    // Show the specific leave type once (e.g. 'ลาคลอด'), without 'ลา: ลาคลอด'.
    if (realLeave) return { available:false, reason:leaveType(realLeave) || 'ลา', realLeave, noDuty };
    if (context === 'night_roster') {
      if (!staffAcceptsNightDuty(staff)) return { available:false, reason:'สถานะไม่รับเวรกลางคืน', realLeave:null, noDuty };
      if (noDuty) return { available:false, reason:'ไม่รับเวรในวันนั้น', realLeave:null, noDuty };
    }
    return { available:true, reason:'พร้อมทำงาน', realLeave:null, noDuty };
  }

  function parseDutyDate(date){
    try { return typeof parseDate === 'function' ? parseDate(date) : new Date(`${normDate(date)}T00:00:00`); }
    catch (_) { return new Date(`${normDate(date)}T00:00:00`); }
  }
  function dutyDayKey(date){ return ['sun','mon','tue','wed','thu','fri','sat'][parseDutyDate(date).getDay()]; }
  function normalizedDutyForPermission(code=''){
    const value = String(code || '').trim();
    if (['ช4A','ช4','ช4-MT/แตง','ช4-MT/แตง1','ช4-MT/แตง-1','ช4-1','ช4-MT/แตง 1'].includes(value)) return 'ช4-MT/แตง 1';
    if (['ช4B','ช4-MT/แตง2','ช4-MT/แตง-2','ช4-2','ช4-MT/แตง 2'].includes(value)) return 'ช4-MT/แตง 2';
    if (['ช9-MT','ช9','ช9-MT/แตง'].includes(value)) return 'ช9-MT/แตง';
    return value;
  }
  function dutyPermissionCode(slot){
    return `${DUTY_RULE_PREFIX}${dutyDayKey(slot?.duty_date)}:${normalizedDutyForPermission(slot?.duty_code)}`;
  }
  function supportsFallbackRole(staff, requiredRole){
    try { return typeof supportsRequiredRole === 'function' ? !!supportsRequiredRole(staff, requiredRole) : true; }
    catch (_) { return true; }
  }
  function dutyPermissionAllowsV266(staff, slot){
    const st = appState();
    if (!staff || !slot) return false;
    const sid = normId(staff.id);
    const rows = Array.isArray(st?.positionEligibility) ? st.positionEligibility : [];
    const code = dutyPermissionCode(slot);
    const explicit = rows.find(row => normId(row?.staff_id) === sid && String(row?.position_code || '') === code);
    if (explicit) return explicit.is_eligible === true || String(explicit.is_eligible).toLowerCase() === 'true';
    const prefix = `${DUTY_RULE_PREFIX}${dutyDayKey(slot.duty_date)}:`;
    const hasConfiguredRulesForDay = rows.some(row => normId(row?.staff_id) === sid && String(row?.position_code || '').startsWith(prefix));
    if (hasConfiguredRulesForDay) return false;
    return supportsFallbackRole(staff, slot.required_role);
  }
  function isRestrictedDuty(code){ return RESTRICTED_CODES.has(String(code || '').trim()); }
  function isNightRosterDutyCodeV266(code){
    const raw = String(code || '').trim();
    return NIGHT_ROSTER_DUTY_CODES.has(raw)
      || RESTRICTED_CODES.has(raw)
      || raw === 'ช3A' || raw === 'ช3B'
      || raw.startsWith('ช4') || raw.startsWith('ช9');
  }
  function verifyNightRosterCoverageV266(){
    const required = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช4','ช4A','ช4B','ช9','ช9-เคิก','ช9-MT'];
    const missing = required.filter(code => !isNightRosterDutyCodeV266(code));
    return { ok:missing.length === 0, required, missing };
  }
  function sameDayBlocked(staffId, slot, assignments){
    try { return typeof hasSameDayDuty === 'function' && !!hasSameDayDuty(staffId, slot.duty_date, assignments, slot); }
    catch (_) { return false; }
  }
  function adjacentBlocked(staffId, slot, assignments){
    if (!isRestrictedDuty(slot?.duty_code)) return false;
    try { return typeof hasAdjacentDuty === 'function' && !!hasAdjacentDuty(staffId, slot.duty_date, assignments, slot); }
    catch (_) { return false; }
  }

  function evaluateRosterCandidateV266(staff, slot, assignments, options={}){
    if (!staff || !slot) return { ok:false, stage:'staff', reason:'ไม่พบข้อมูลเจ้าหน้าที่หรือช่องเวร' };
    // All assignments reaching this function are roster slots. This includes
    // ชบด1-3, ช3A, ช3B, ช4A/B and ช9 variants.
    const availability = getStaffAvailabilityContextV266(staff, slot.duty_date, 'night_roster');
    if (!availability.available) return { ok:false, stage:availability.noDuty ? 'noDuty' : 'leave', reason:availability.reason, availability };
    if (!dutyPermissionAllowsV266(staff, slot)) return { ok:false, stage:'permission', reason:'ไม่มีสิทธิ์ตามวัน/ประเภทเวร', availability };
    if (options.checkSameDay !== false && sameDayBlocked(staff.id, slot, assignments)) return { ok:false, stage:'sameDay', reason:'มีเวรอื่นในวันเดียวกัน', availability };
    if (options.checkAdjacent !== false && adjacentBlocked(staff.id, slot, assignments)) return { ok:false, stage:'consecutiveChbd', reason:'ชบดติดกับวันก่อนหรือวันถัดไป', availability };
    return { ok:true, stage:'ready', reason:'พร้อมจัดเวร', availability };
  }

  /* This is the main function that filters staff BEFORE Auto Assign starts. */
  function filterEligibleStaffBeforeAutoAssignV266(slot, assignments){
    const st = appState();
    const rosterStaff = (st?.staff || []).filter(person => {
      try { return typeof isRosterEnabled === 'function' ? !!isRosterEnabled(person) : person?.is_active !== false; }
      catch (_) { return person?.is_active !== false; }
    });
    const permissionEligible = rosterStaff.filter(person => dutyPermissionAllowsV266(person, slot));
    const statusEligible = permissionEligible.filter(person => getStaffAvailabilityContextV266(person, slot.duty_date, 'night_roster').available);
    const sameDayEligible = statusEligible.filter(person => !sameDayBlocked(person.id, slot, assignments));
    const candidates = isRestrictedDuty(slot?.duty_code)
      ? sameDayEligible.filter(person => !adjacentBlocked(person.id, slot, assignments))
      : sameDayEligible;
    return { rosterStaff, permissionEligible, statusEligible, sameDayEligible, candidates };
  }

  function vacancyReasonV266(stages, slot){
    if (!stages.rosterStaff.length) return 'ไม่มีเจ้าหน้าที่ที่เปิดใช้งานการจัดเวร';
    if (!stages.permissionEligible.length) return 'ไม่มีผู้มีสิทธิ์ตามวัน/ประเภทเวร';
    if (!stages.statusEligible.length) {
      const statusReasons = stages.permissionEligible.map(person => getStaffAvailabilityContextV266(person, slot.duty_date, 'night_roster').reason);
      if (statusReasons.some(text => /ไม่รับเวร/.test(text))) return 'ผู้มีสิทธิ์ไม่รับเวรในวันนั้น';
      return 'ผู้มีสิทธิ์ติดลาในวันนั้น';
    }
    if (!stages.sameDayEligible.length) return 'ผู้มีสิทธิ์มีเวรอื่นในวันเดียวกัน';
    if (isRestrictedDuty(slot?.duty_code)) return 'ผู้มีสิทธิ์ติดกฎ ชบด ห้ามติดวันก่อน/วันถัดไป';
    return 'ไม่มีผู้พร้อมลงช่อง';
  }
  function slotId(slot){
    try { return typeof getSlotId === 'function' ? String(getSlotId(slot)) : String(slot?.id || slot?._temp_id || `${slot?.duty_date}|${slot?.duty_code}`); }
    catch (_) { return String(slot?.id || slot?._temp_id || `${slot?.duty_date}|${slot?.duty_code}`); }
  }
  function sanitizeExistingAssignmentsV266(assignments){
    const cleared = [];
    const lockedInvalid = [];
    (assignments || []).forEach(slot => {
      delete slot._vacant_reason_v266;
      delete slot._vacant_label_v266;
      if (!slot?.staff_id) return;
      const staff = staffById(slot.staff_id);
      const result = evaluateRosterCandidateV266(staff, slot, assignments, { checkSameDay:true, checkAdjacent:true });
      if (result.ok) return;
      if (slot.is_locked) {
        lockedInvalid.push({ slot, staff, reason:result.reason });
        return;
      }
      cleared.push({ slot:clone(slot), staff, reason:result.reason });
      slot.staff_id = null;
      slot._vacant_reason_v266 = result.reason;
      slot._vacant_label_v266 = 'ตำแหน่งว่าง (Vacant)';
    });
    return { cleared, lockedInvalid };
  }
  function validAssignmentsForFairnessV266(assignments){
    return (assignments || []).filter(slot => {
      if (!slot?.staff_id) return false;
      return evaluateRosterCandidateV266(staffById(slot.staff_id), slot, assignments, { checkSameDay:true, checkAdjacent:true }).ok;
    });
  }
  function dutyFamily(code=''){
    const value = String(code || '');
    if (value.startsWith('ชบด')) return 'ชบด';
    if (value.startsWith('ช4')) return 'ช4';
    if (value.startsWith('ช3')) return 'ช3';
    if (value.startsWith('ช9')) return 'ช9';
    return value;
  }
  function buildDutyMixCountsV266(assignments){
    const result = {};
    (assignments || []).forEach(slot => {
      if (!slot?.staff_id) return;
      const sid = normId(slot.staff_id);
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      result[sid] = result[sid] || { byCode:{}, byFamily:{} };
      result[sid].byCode[code] = (result[sid].byCode[code] || 0) + 1;
      result[sid].byFamily[family] = (result[sid].byFamily[family] || 0) + 1;
    });
    return result;
  }
  function addFairnessCountV266(counts, mixCounts, staff, slot, weekKey){
    const sid = staff.id;
    const current = counts[sid] = counts[sid] || { total:0, mon:0, fri:0, weekend:0, weekday:0, hours:0, pay:0, units:0, weekCounts:{} };
    current.total = (current.total || 0) + 1;
    try {
      const metrics = typeof dutyMetrics === 'function' ? dutyMetrics(slot, sid) : { hours:0, units:1, pay:0 };
      current.hours = (current.hours || 0) + (Number(metrics?.hours) || 0);
      current.units = (current.units || 0) + (Number(metrics?.units) || 0);
      current.pay = (current.pay || 0) + (Number(metrics?.pay) || 0);
    } catch (_) {}
    current.weekCounts = current.weekCounts || {};
    current.weekCounts[weekKey] = (current.weekCounts[weekKey] || 0) + 1;
    try {
      if ((typeof isWeekend === 'function' && isWeekend(slot.duty_date)) || (typeof isHolidayDate === 'function' && isHolidayDate(slot.duty_date))) current.weekend = (current.weekend || 0) + 1;
      else current.weekday = (current.weekday || 0) + 1;
    } catch (_) {}
    const code = String(slot.duty_code || '');
    const family = dutyFamily(code);
    mixCounts[sid] = mixCounts[sid] || { byCode:{}, byFamily:{} };
    mixCounts[sid].byCode[code] = (mixCounts[sid].byCode[code] || 0) + 1;
    mixCounts[sid].byFamily[family] = (mixCounts[sid].byFamily[family] || 0) + 1;
  }

  window.autoAssignRoster = autoAssignRoster = function autoAssignRosterV266(){
    const st = appState();
    if (!st.rosterDraft || st.rosterDraft.monthKey !== st.monthKey) {
      st.rosterDraft = { monthKey:st.monthKey, assignments:generateEmptyAssignments(st.monthKey) };
    }
    const assignments = st.rosterDraft.assignments || [];
    const cleanup = sanitizeExistingAssignmentsV266(assignments);
    const validAssigned = validAssignmentsForFairnessV266(assignments);
    const counts = typeof calcFairness === 'function' ? calcFairness(validAssigned) : {};
    const mixCounts = buildDutyMixCountsV266(validAssigned);
    const diagnostics = { vacant:0, cleared:cleanup.cleared, lockedInvalid:cleanup.lockedInvalid, details:[] };

    assignments.forEach(slot => {
      if (slot.is_locked || slot.staff_id) return;
      const weekKey = typeof weekKeyOf === 'function' ? weekKeyOf(slot.duty_date) : normDate(slot.duty_date);
      const stages = filterEligibleStaffBeforeAutoAssignV266(slot, assignments);
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      stages.candidates.sort((a, b) => {
        const ca = counts[a.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const cb = counts[b.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const ma = mixCounts[a.id] || { byCode:{}, byFamily:{} };
        const mb = mixCounts[b.id] || { byCode:{}, byFamily:{} };
        const order = typeof compareStaffOrder === 'function'
          ? compareStaffOrder(a, b)
          : String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th');
        return ((ma.byCode[code] || 0) - (mb.byCode[code] || 0))
          || ((ma.byFamily[family] || 0) - (mb.byFamily[family] || 0))
          || ((ca.pay || 0) - (cb.pay || 0))
          || ((ca.hours || 0) - (cb.hours || 0))
          || (((ca.weekCounts || {})[weekKey] || 0) - ((cb.weekCounts || {})[weekKey] || 0))
          || ((ca.weekend || 0) - (cb.weekend || 0))
          || ((ca.total || 0) - (cb.total || 0))
          || order;
      });

      const chosen = stages.candidates[0] || null;
      if (chosen) {
        slot.staff_id = chosen.id;
        delete slot._vacant_reason_v266;
        delete slot._vacant_label_v266;
        addFairnessCountV266(counts, mixCounts, chosen, slot, weekKey);
        return;
      }

      const reason = vacancyReasonV266(stages, slot);
      slot.staff_id = null;
      slot._vacant_reason_v266 = reason;
      slot._vacant_label_v266 = 'ตำแหน่งว่าง (Vacant)';
      diagnostics.vacant++;
      diagnostics.details.push({ duty_date:slot.duty_date, duty_code:slot.duty_code, reason });
    });

    st.rosterDraft = { monthKey:st.monthKey, assignments };
    st.__lastAutoAssignDiagnosticsV266 = diagnostics;
    decorateVacanciesV266();

    const parts = [];
    if (cleanup.cleared.length) parts.push(`ล้างชื่อเดิมที่ติดลา/ไม่รับเวร/หมดสิทธิ์ ${cleanup.cleared.length} ช่อง`);
    if (diagnostics.vacant) parts.push(`เหลือตำแหน่งว่าง ${diagnostics.vacant} ช่อง`);
    if (cleanup.lockedInvalid.length) parts.push(`ช่องล็อกที่ต้องตรวจเอง ${cleanup.lockedInvalid.length} ช่อง`);
    if (parts.length) showToast(`Auto Assign เสร็จแล้ว: ${parts.join(' • ')}`);
    else showToast('Auto Assign เสร็จแล้ว โดยคัดกรองสถานะพนักงานก่อนจัดและเกลี่ยชนิดเวรแยกกัน');
    try { console.info(`${VERSION} diagnostics`, diagnostics); } catch (_) {}
  };

  window.canStaffWorkSlot = canStaffWorkSlot = function canStaffWorkSlotV266(staffId, slot, assignments){
    const list = assignments || appState()?.rosterDraft?.assignments || (typeof getAssignmentsForMonth === 'function' ? getAssignmentsForMonth(appState()?.monthKey) : []);
    return evaluateRosterCandidateV266(staffById(staffId), slot, list, { checkSameDay:true, checkAdjacent:true }).ok;
  };

  /* Daytime position candidate: real leave blocks, "ไม่รับเวร" does not. */
  window.positionCandidateOk = positionCandidateOk = function positionCandidateOkV266(staff, positionRow, date){
    try {
      const d = normDate(date || (typeof todayStr === 'function' ? todayStr() : ''));
      const availability = getStaffAvailabilityContextV266(staff, d, 'day_position');
      if (!availability.available) return false;
      const key = positionRow?.eligibility_code || positionRow?.code || positionRow?.position_code || '';
      if (typeof positionRuleOk === 'function' && !positionRuleOk(staff, positionRow?.main_rule || '')) return false;
      if (typeof positionEligible === 'function' && !positionEligible(staff, key)) return false;
      return true;
    } catch (_) { return false; }
  };

  function decorateVacanciesV266(){
    try {
      const assignments = appState()?.rosterDraft?.assignments || [];
      const map = new Map(assignments.map(slot => [slotId(slot), slot]));
      document.querySelectorAll('.roster-slot[data-drop-slot]').forEach(el => {
        const slot = map.get(String(el.dataset.dropSlot || ''));
        if (!slot || slot.staff_id || !slot._vacant_reason_v266) return;
        el.classList.add('v266-vacant-slot');
        el.setAttribute('title', slot._vacant_reason_v266);
        const name = el.querySelector('.assigned-name');
        if (name) name.textContent = 'ตำแหน่งว่าง (Vacant)';
        const meta = el.querySelector('.slot-meta');
        if (meta && !meta.querySelector('.v266-vacant-reason')) {
          const reason = document.createElement('div');
          reason.className = 'v266-vacant-reason';
          reason.textContent = slot._vacant_reason_v266;
          meta.appendChild(reason);
        }
        const select = el.querySelector('[data-roster-slot-select]');
        if (select?.options?.[0]) select.options[0].textContent = 'ตำแหน่งว่าง (Vacant)';
      });
      document.querySelectorAll('[data-roster-slot-select]').forEach(select => {
        const slot = map.get(String(select.dataset.rosterSlotSelect || ''));
        if (!slot || slot.staff_id || !slot._vacant_reason_v266) return;
        if (select.options?.[0]) select.options[0].textContent = 'ตำแหน่งว่าง (Vacant)';
        const card = select.closest('.mobile-roster-slot');
        if (card) {
          card.classList.add('v266-vacant-slot');
          card.setAttribute('title', slot._vacant_reason_v266);
        }
      });
    } catch (_) {}
  }

  try {
    const style = document.createElement('style');
    style.textContent = `
      .v266-vacant-slot{outline:2px dashed #d97706;background:#fff7ed!important}
      .v266-vacant-slot .assigned-name{color:#9a3412;font-weight:700}
      .v266-vacant-reason{margin-top:4px;color:#9a3412;font-size:11px;line-height:1.25}
    `;
    document.head.appendChild(style);
  } catch (_) {}

  try {
    const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRenderPage && !previousRenderPage.__v266VacancyDecorated) {
      const wrapped = function renderPageV266(){
        const result = previousRenderPage.apply(this, arguments);
        try { requestAnimationFrame(decorateVacanciesV266); } catch (_) { decorateVacanciesV266(); }
        return result;
      };
      wrapped.__v266VacancyDecorated = true;
      assignGlobal('renderPage', wrapped);
    }
  } catch (_) {}

  window.cnmiV266 = {
    getStaffAvailabilityContextV266,
    filterEligibleStaffBeforeAutoAssignV266,
    evaluateRosterCandidateV266,
    dutyPermissionAllowsV266,
    isNightRosterDutyCodeV266,
    verifyNightRosterCoverageV266,
    decorateVacanciesV266
  };

  try {
    const coverage = verifyNightRosterCoverageV266();
    if (!coverage.ok) console.error(`${VERSION}: missing night-roster duty coverage`, coverage.missing);
    else console.info(`${VERSION}: night-roster coverage verified`, coverage.required);
  } catch (_) {}
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v266-context-aware-auto-assign.js", error); }
;

/* Original source: patch-v270-trainee-semi-manual-roster.js */
try {
/* V270 Trainee/Mentor + Daytime Slot Guard + Semi-Manual Roster
   - Adds a mentor/trainee tab under Position Management.
   - Trainees do not consume daytime Slot headcount.
   - A trainee follows the mentor's daytime position as an extra person.
   - Auto Assign creates suggestions only; it never overwrites actual names.
   - Locked roster slots are immutable anchors.
*/
(function(){
  'use strict';
  const VERSION = 'V270_TRAINEE_SEMI_MANUAL_ROSTER';
  if (window.__CNMI_V270_TRAINEE_SEMI_MANUAL_ROSTER__) return;
  window.__CNMI_V270_TRAINEE_SEMI_MANUAL_ROSTER__ = true;

  const MENTOR_TAB_KEY = 'cnmi_position_management_mentor_tab_v270';
  const SUGGESTION_FIELD = '_suggested_staff_id_v270';
  const SUGGESTION_REASON = '_suggestion_reason_v270';

  function appState(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function db(){ try { return sb || window.sb || null; } catch (_) { return window.sb || null; } }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function assignGlobal(name, value){
    window[name] = value;
    try {
      if (name === 'autoAssignRoster') autoAssignRoster = value;
      else if (name === 'renderSchedulerPage') renderSchedulerPage = value;
      else if (name === 'renderMonthPositionMatrix') renderMonthPositionMatrix = value;
      else if (name === 'renderPositionsPage') renderPositionsPage = value;
      else if (name === 'buildMonthlyPositionDraft') buildMonthlyPositionDraft = value;
      else if (name === 'savePositions') savePositions = value;
      else if (name === 'renderPage') renderPage = value;
    } catch (_) {}
  }
  function currentStaffIdSafe(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return appState()?.profile?.role === 'admin'; }
  }
  function ordered(rows){
    try { return orderedStaff(rows || []); }
    catch (_) { return (rows || []).slice().sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function activeStaff(){ return ordered((appState()?.staff || []).filter(person => person && person.is_active !== false)); }
  function activeMT(){ return activeStaff().filter(person => String(person.staff_type || '').toUpperCase() === 'MT'); }
  function isTrainee(person){
    // V271 replaces permanent profile flags with date-range mentorship rows.
    // Keep this patch inert after V271 is loaded so it cannot pair/exclude people forever.
    if (window.cnmiV271?.usesDateRangeMentorship) return false;
    if (!person) return false;
    if (person.is_trainee === true) return true;
    if (person.is_trainee === false) return false;
    return /น้องใหม่|trainee|probation/i.test(String(person.position_training_status || ''));
  }
  function mentorId(person){ return String(person?.mentor_staff_id || person?.mentor_id || ''); }
  function staffById(id){ return (appState()?.staff || []).find(person => String(person?.id || '') === String(id || '')) || null; }
  function regexEscape(value){ return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function staffName(personOrId){
    const person = typeof personOrId === 'object' ? personOrId : staffById(personOrId);
    return person ? (person.nickname || person.full_name || person.email || '-') : '-';
  }
  function traineeRows(){ return activeMT().filter(isTrainee); }
  function mentorPairs(){
    return traineeRows().map(trainee => ({ trainee, mentor:staffById(mentorId(trainee)) })).filter(pair => pair.mentor);
  }
  function schemaReady(){
    const rows = appState()?.staff || [];
    return rows.some(person => Object.prototype.hasOwnProperty.call(person, 'is_trainee') || Object.prototype.hasOwnProperty.call(person, 'mentor_staff_id'));
  }
  function isDayPositionAvailable(person, date){
    if (!person || !date) return false;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(person, date, 'day_position');
      if (result) return !!result.available;
    } catch (_) {}
    try {
      const row = window.cnmiV265?.unavailableRecord?.(person.id, date);
      return !row;
    } catch (_) { return true; }
  }
  function sanitizePositionRow(source, trainee, date){
    return {
      work_date:String(date || source?.work_date || '').slice(0,10),
      position_code:source?.position_code || source?.code || '',
      zone:source?.zone || '',
      break_time:source?.break_time || '-',
      main_rule:source?.main_rule || '',
      job_desc:source?.job_desc || '',
      staff_id:trainee.id,
      updated_by:currentStaffIdSafe()
    };
  }
  function pairTraineesWithMentors(rows){
    const source = Array.isArray(rows) ? rows : [];
    const trainees = traineeRows();
    if (!trainees.length) return source.slice();
    const traineeIds = new Set(trainees.map(person => String(person.id)));
    const base = source.filter(row => !traineeIds.has(String(row?.staff_id || '')));
    const byStaffDate = new Map();
    base.forEach(row => {
      const sid = String(row?.staff_id || '');
      const date = String(row?.work_date || '').slice(0,10);
      const code = String(row?.position_code || row?.code || '').trim();
      if (sid && date && code) byStaffDate.set(`${sid}|${date}`, row);
    });
    const dates = Array.from(new Set(base.map(row => String(row?.work_date || '').slice(0,10)).filter(Boolean)));
    const extra = [];
    trainees.forEach(trainee => {
      const mid = mentorId(trainee);
      if (!mid || mid === String(trainee.id)) return;
      dates.forEach(date => {
        if (!isDayPositionAvailable(trainee, date)) return;
        const mentorRow = byStaffDate.get(`${mid}|${date}`);
        if (!mentorRow) return;
        const paired = sanitizePositionRow(mentorRow, trainee, date);
        if (paired.position_code) extra.push(paired);
      });
    });
    return base.concat(extra);
  }
  function withTraineesExcludedFromSlotCount(callback){
    const trainees = traineeRows();
    const snapshots = trainees.map(person => ({
      person,
      daily_position_enabled:person.daily_position_enabled,
      position_training_status:person.position_training_status
    }));
    trainees.forEach(person => { person.daily_position_enabled = false; });
    try { return callback(); }
    finally {
      snapshots.forEach(item => {
        if (item.daily_position_enabled === undefined) delete item.person.daily_position_enabled;
        else item.person.daily_position_enabled = item.daily_position_enabled;
        item.person.position_training_status = item.position_training_status;
      });
    }
  }

  /* ------------------------------------------------------------------
     Position Management: mentor/trainee tab
     ------------------------------------------------------------------ */
  function mentorTabActive(){
    const st = appState();
    if (st?.positionManagementSubtabV270 === 'mentors') return true;
    try { return localStorage.getItem(MENTOR_TAB_KEY) === 'mentors'; }
    catch (_) { return false; }
  }
  function setMentorTab(active){
    const st = appState();
    if (st) st.positionManagementSubtabV270 = active ? 'mentors' : '';
    try { active ? localStorage.setItem(MENTOR_TAB_KEY, 'mentors') : localStorage.removeItem(MENTOR_TAB_KEY); } catch (_) {}
  }
  function selectedTrainee(){
    const rows = activeMT();
    const st = appState();
    let id = String(st?.selectedTraineeV270 || '');
    if (!rows.some(person => String(person.id) === id)) id = String((rows.find(isTrainee) || rows[0] || {}).id || '');
    if (st) st.selectedTraineeV270 = id;
    return rows.find(person => String(person.id) === id) || null;
  }
  function mentorshipBodyHtml(){
    if (!isAdminSafe()) return '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>';
    const mtRows = activeMT();
    if (!mtRows.length) return '<div class="card">ยังไม่มีเจ้าหน้าที่ MT ที่เปิดใช้งาน</div>';
    const trainee = selectedTrainee();
    const mentors = mtRows.filter(person => String(person.id) !== String(trainee?.id || '') && !isTrainee(person));
    const selectedMentor = mentorId(trainee);
    const pairs = traineeRows();
    const warning = schemaReady() ? '' : `<div class="notice error-notice"><b>ต้องรัน SQL ครั้งเดียวก่อนใช้งาน:</b> เปิด Supabase SQL Editor แล้วรันไฟล์ <code>supabase_v270_trainee_mentor.sql</code></div>`;
    return `<div class="v270-mentor-tab-body">
      ${warning}
      <div class="grid v270-mentor-layout">
        <div class="card">
          <div class="section-title"><div><h3>จับคู่พี่เลี้ยง–น้องใหม่</h3><p class="hint">เลือกน้องใหม่ MT และพี่เลี้ยง MT เมื่อบันทึก ระบบจะติด Flag <code>is_trainee=true</code></p></div></div>
          <div class="form-grid">
            <label>น้องใหม่ (MT)
              <select data-v270-trainee-select>${mtRows.map(person => `<option value="${esc(person.id)}" ${String(person.id)===String(trainee?.id||'')?'selected':''}>${esc(staffName(person))}${isTrainee(person)?' • น้องใหม่':''}</option>`).join('')}</select>
            </label>
            <label>พี่เลี้ยง (MT)
              <select data-v270-mentor-select><option value="">เลือกพี่เลี้ยง</option>${mentors.map(person => `<option value="${esc(person.id)}" ${String(person.id)===selectedMentor?'selected':''}>${esc(staffName(person))}</option>`).join('')}</select>
            </label>
            <button class="primary-btn" type="button" data-v270-save-mentor ${!trainee?'disabled':''}>บันทึกการจับคู่</button>
            ${trainee && isTrainee(trainee) ? `<button class="ghost-btn danger" type="button" data-v270-remove-trainee="${esc(trainee.id)}">ยกเลิกสถานะน้องใหม่</button>` : ''}
          </div>
          <div class="notice soft-notice compact"><b>กฎ Slot:</b> น้องใหม่ยังแสดงในตารางตำแหน่งและตามตำแหน่งของพี่เลี้ยง แต่จะไม่นับเป็นจำนวนคนสำหรับเลือกชุด Slot</div>
        </div>
        <div class="card">
          <div class="section-title"><h3>รายการที่จับคู่แล้ว</h3><span class="badge blue">${pairs.length} คน</span></div>
          ${pairs.length ? `<div class="table-wrap"><table><thead><tr><th>น้องใหม่</th><th>พี่เลี้ยง</th><th>การนับ Slot</th><th></th></tr></thead><tbody>${pairs.map(person => `<tr><td><b>${esc(staffName(person))}</b></td><td>${esc(staffName(mentorId(person)))}</td><td><span class="badge orange">ไม่นับ Slot</span></td><td><button class="tiny-btn danger" type="button" data-v270-remove-trainee="${esc(person.id)}">ยกเลิก</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีน้องใหม่ที่จับคู่พี่เลี้ยง</div>'}
        </div>
      </div>
    </div>`;
  }
  function decoratePositionManagement(){
    const st = appState();
    if (st?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    const page = root?.querySelector('.v244-position-management-page');
    const tabs = page?.querySelector('.v244-position-tabs');
    if (!page || !tabs) return;
    if (!tabs.querySelector('[data-v270-position-tab="mentors"]')) {
      tabs.insertAdjacentHTML('beforeend', `<button type="button" class="v244-position-tab" data-v270-position-tab="mentors"><b>พี่เลี้ยง–น้องใหม่</b><small>จับคู่ MT และป้องกันยอด Slot เพี้ยน</small></button>`);
    }
    const mentorButton = tabs.querySelector('[data-v270-position-tab="mentors"]');
    if (!mentorTabActive()) {
      mentorButton?.classList.remove('active');
      return;
    }
    tabs.querySelectorAll('.v244-position-tab').forEach(button => button.classList.remove('active'));
    mentorButton?.classList.add('active');
    if (page.querySelector(':scope > .v270-mentor-tab-body')) return;
    while (page.children.length > 1) page.removeChild(page.lastElementChild);
    page.insertAdjacentHTML('beforeend', mentorshipBodyHtml());
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'จัดการตำแหน่ง';
  }
  async function saveMentorPair(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const traineeId = String(document.querySelector('[data-v270-trainee-select]')?.value || '');
    const selectedMentorId = String(document.querySelector('[data-v270-mentor-select]')?.value || '');
    if (!traineeId) return toast('กรุณาเลือกน้องใหม่', 'error');
    if (!selectedMentorId) return toast('กรุณาเลือกพี่เลี้ยง', 'error');
    if (traineeId === selectedMentorId) return toast('น้องใหม่และพี่เลี้ยงต้องเป็นคนละคน', 'error');
    const client = db();
    if (!client) return toast('ไม่พบ Supabase client', 'error');
    try {
      const result = await client.from('staff_profiles').update({
        is_trainee:true,
        mentor_staff_id:selectedMentorId
      }).eq('id', traineeId).select('*').maybeSingle();
      if (result.error) throw result.error;
      const st = appState();
      const local = (st?.staff || []).find(person => String(person.id) === traineeId);
      if (local) Object.assign(local, result.data || { is_trainee:true, mentor_staff_id:selectedMentorId });
      try { await loadAllData(); } catch (_) {}
      setMentorTab(true);
      try { renderPage(); } catch (_) {}
      setTimeout(decoratePositionManagement, 60);
      toast('บันทึกพี่เลี้ยง–น้องใหม่แล้ว และน้องใหม่จะไม่ถูกนับใน Slot');
    } catch (error) {
      const message = friendly(error);
      const missingColumn = /is_trainee|mentor_staff_id|column/i.test(message);
      toast(missingColumn ? `ยังไม่ได้รัน supabase_v270_trainee_mentor.sql: ${message}` : `บันทึกไม่สำเร็จ: ${message}`, 'error');
    }
  }
  async function removeTrainee(id){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const client = db();
    if (!client) return toast('ไม่พบ Supabase client', 'error');
    try {
      const result = await client.from('staff_profiles').update({ is_trainee:false, mentor_staff_id:null }).eq('id', id).select('*').maybeSingle();
      if (result.error) throw result.error;
      try { await loadAllData(); } catch (_) {}
      setMentorTab(true);
      try { renderPage(); } catch (_) {}
      setTimeout(decoratePositionManagement, 60);
      toast('ยกเลิกสถานะน้องใหม่แล้ว ระบบจะกลับมานับใน Slot ตามปกติ');
    } catch (error) { toast(`ยกเลิกไม่สำเร็จ: ${friendly(error)}`, 'error'); }
  }

  window.addEventListener('click', function(event){
    const existingTab = event.target?.closest?.('[data-v244-position-tab]');
    if (existingTab) setMentorTab(false);

    const mentorTab = event.target?.closest?.('[data-v270-position-tab="mentors"]');
    if (mentorTab) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      setMentorTab(true);
      const st = appState();
      if (st) st.page = 'positionManagement';
      try { renderPage(); } catch (_) {}
      setTimeout(decoratePositionManagement, 40);
      return;
    }
    if (event.target?.closest?.('[data-v270-save-mentor]')) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      saveMentorPair();
      return;
    }
    const remove = event.target?.closest?.('[data-v270-remove-trainee]');
    if (remove) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      removeTrainee(remove.getAttribute('data-v270-remove-trainee'));
    }
  }, true);
  window.addEventListener('change', function(event){
    const select = event.target?.closest?.('[data-v270-trainee-select]');
    if (!select) return;
    event.preventDefault(); event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    const st = appState();
    if (st) st.selectedTraineeV270 = select.value;
    setMentorTab(true);
    document.querySelector('.v270-mentor-tab-body')?.remove();
    decoratePositionManagement();
  }, true);

  /* ------------------------------------------------------------------
     Daytime position Slot count and pairing
     ------------------------------------------------------------------ */
  try {
    if (window.cnmiV265) {
      const oldActual = window.cnmiV265.actualAvailableStaff;
      const oldWeekly = window.cnmiV265.weeklySlotStaffV265;
      if (typeof oldActual === 'function') window.cnmiV265.actualAvailableStaff = date => oldActual(date).filter(person => !isTrainee(person));
      if (typeof oldWeekly === 'function') window.cnmiV265.weeklySlotStaffV265 = date => oldWeekly(date).filter(person => !isTrainee(person));
      window.cnmiV265.weeklySlotHeadcountV265 = date => (window.cnmiV265.weeklySlotStaffV265?.(date) || []).length;
    }
  } catch (_) {}

  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v270TraineePairing) {
      const wrappedBuild = function buildMonthlyPositionDraftV270(){
        const draft = withTraineesExcludedFromSlotCount(() => previousBuild.apply(this, arguments));
        if (draft && Array.isArray(draft.rows)) {
          draft.rows = pairTraineesWithMentors(draft.rows);
          draft.traineePairingV270 = true;
        }
        return draft;
      };
      wrappedBuild.__v270TraineePairing = true;
      assignGlobal('buildMonthlyPositionDraft', wrappedBuild);
    }
  } catch (error) { console.warn(`${VERSION}: build wrapper skipped`, error); }

  try {
    const previousMonthMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
    if (previousMonthMatrix && !previousMonthMatrix.__v270TraineeCount) {
      const wrappedMatrix = function renderMonthPositionMatrixV270(rows, dates){
        const pairedRows = pairTraineesWithMentors(Array.isArray(rows) ? rows : []);
        let html = withTraineesExcludedFromSlotCount(() => String(previousMonthMatrix.call(this, pairedRows, dates) || ''));
        traineeRows().forEach(person => {
          const name = regexEscape(esc(staffName(person)));
          html = html.replace(new RegExp(`(<div class="matrix-staff-name"><b>${name}<\\/b><small>)(.*?)(<\\/small>)`), `$1$2 • น้องใหม่ (ไม่นับ Slot)$3`);
        });
        return html;
      };
      wrappedMatrix.__v270TraineeCount = true;
      assignGlobal('renderMonthPositionMatrix', wrappedMatrix);
    }
  } catch (error) { console.warn(`${VERSION}: month matrix wrapper skipped`, error); }

  try {
    const previousDailyRender = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (previousDailyRender && !previousDailyRender.__v270TraineeCount) {
      const wrappedDaily = function renderPositionsPageV270(){
        const st = appState();
        const oldPositions = st?.positions;
        if (st && Array.isArray(oldPositions)) st.positions = oldPositions.filter(row => !isTrainee(staffById(row?.staff_id)));
        try {
          let html = withTraineesExcludedFromSlotCount(() => String(previousDailyRender.apply(this, arguments) || ''));
          const pairs = mentorPairs();
          if (pairs.length) {
            const summary = `<div class="card v270-daily-trainee-summary"><div class="section-title"><h3>พี่เลี้ยง–น้องใหม่วันนี้</h3><span class="badge orange">น้องใหม่ไม่นับ Slot</span></div><div class="chip-line">${pairs.map(pair => `<span class="badge blue">${esc(staffName(pair.trainee))} → ${esc(staffName(pair.mentor))}</span>`).join('')}</div></div>`;
            html += summary;
          }
          return html;
        } finally { if (st) st.positions = oldPositions; }
      };
      wrappedDaily.__v270TraineeCount = true;
      assignGlobal('renderPositionsPage', wrappedDaily);
    }
  } catch (error) { console.warn(`${VERSION}: daily render wrapper skipped`, error); }

  async function syncTraineePairsForDate(date){
    const client = db();
    const d = String(date || '').slice(0,10);
    if (!client || !d || !traineeRows().length) return;
    const read = await client.from('daily_positions').select('*').eq('work_date', d);
    if (read.error) throw read.error;
    const rows = read.data || [];
    const traineeIds = traineeRows().map(person => person.id);
    if (traineeIds.length) {
      const del = await client.from('daily_positions').delete().eq('work_date', d).in('staff_id', traineeIds);
      if (del.error) throw del.error;
    }
    const paired = pairTraineesWithMentors(rows).filter(row => traineeIds.map(String).includes(String(row.staff_id)));
    if (paired.length) {
      const ins = await client.from('daily_positions').insert(paired);
      if (ins.error) throw ins.error;
    }
  }
  try {
    const previousSavePositions = window.savePositions || (typeof savePositions === 'function' ? savePositions : null);
    if (previousSavePositions && !previousSavePositions.__v270TraineePairing) {
      const wrappedSave = async function savePositionsV270(){
        const date = document.getElementById('positionDateInput')?.value || appState()?.positionDate;
        const result = await previousSavePositions.apply(this, arguments);
        try {
          await syncTraineePairsForDate(date);
          try { await loadAllData(); } catch (_) {}
          try { renderPage(); } catch (_) {}
        } catch (error) { toast(`บันทึกตำแหน่งหลักแล้ว แต่ซิงก์น้องใหม่ไม่สำเร็จ: ${friendly(error)}`, 'error'); }
        return result;
      };
      wrappedSave.__v270TraineePairing = true;
      assignGlobal('savePositions', wrappedSave);
    }
  } catch (error) { console.warn(`${VERSION}: daily save wrapper skipped`, error); }

  /* ------------------------------------------------------------------
     Semi-manual roster suggestions
     ------------------------------------------------------------------ */
  function rosterAssignments(){
    const st = appState();
    if (st?.rosterDraft?.monthKey === st?.monthKey && Array.isArray(st.rosterDraft.assignments)) return st.rosterDraft.assignments;
    try { return getAssignmentsForMonth(st?.monthKey) || []; }
    catch (_) { return st?.rosterAssignments || []; }
  }
  function rosterSlotId(slot){ return String(slot?.id || slot?._temp_id || `${slot?.duty_date || ''}|${slot?.duty_code || ''}`); }
  function rosterStaff(){
    const rows = activeStaff().filter(person => {
      try { return isRosterEnabled(person); }
      catch (_) { return person.roster_enabled !== false; }
    });
    return rows;
  }
  function dutyFamily(code){
    const text = String(code || '');
    if (text.startsWith('ชบด')) return 'ชบด';
    if (text.startsWith('ช4')) return 'ช4';
    if (text.startsWith('ช3')) return 'ช3';
    if (text.startsWith('ช9')) return 'ช9';
    return text;
  }
  function suggestionCounts(assignments){
    const out = {};
    (assignments || []).forEach(slot => {
      const sid = String(slot?.staff_id || '');
      if (!sid) return;
      const row = out[sid] ||= { total:0, weekend:0, byCode:{}, byFamily:{} };
      row.total++;
      const code = String(slot.duty_code || '');
      row.byCode[code] = (row.byCode[code] || 0) + 1;
      const family = dutyFamily(code);
      row.byFamily[family] = (row.byFamily[family] || 0) + 1;
      try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) row.weekend++; } catch (_) {}
    });
    return out;
  }
  function evaluateCandidate(person, slot, assignments){
    try {
      const result = window.cnmiV266?.evaluateRosterCandidateV266?.(person, slot, assignments, { checkSameDay:true, checkAdjacent:true });
      if (result) return result;
    } catch (_) {}
    try { return { ok:!!canStaffWorkSlot(person.id, slot, assignments), reason:'ไม่ผ่านเงื่อนไขเวร' }; }
    catch (_) { return { ok:true, reason:'' }; }
  }
  function candidatesFor(slot, assignments){
    try {
      const stages = window.cnmiV266?.filterEligibleStaffBeforeAutoAssignV266?.(slot, assignments);
      if (stages?.candidates) return { candidates:stages.candidates, stages };
    } catch (_) {}
    const candidates = rosterStaff().filter(person => evaluateCandidate(person, slot, assignments).ok);
    return { candidates, stages:null };
  }
  function vacancyReason(stages){
    if (!stages) return 'ไม่พบผู้ที่ผ่านเงื่อนไข';
    if (!stages.statusEligible?.length) return 'ทุกคนติดลา/ไม่รับเวร/ปิดใช้งาน';
    if (!stages.permissionEligible?.length) return 'ไม่มีผู้มีสิทธิ์ทำเวรนี้';
    if (!stages.sameDayEligible?.length) return 'ทุกคนมีเวรอื่นในวันเดียวกัน';
    if (!stages.adjacentEligible?.length) return 'ติดกฎ ชบด ห้ามวันต่อเนื่อง';
    return 'ไม่พบผู้ที่ผ่านเงื่อนไขทั้งหมด';
  }
  function lockedBalanceImpact(assignments){
    const locked = (assignments || []).filter(slot => slot.is_locked && slot.staff_id);
    if (!locked.length) return false;
    const totals = rosterStaff().map(person => (assignments || []).filter(slot => String(slot.staff_id || '') === String(person.id)).length);
    if (!totals.length) return false;
    return Math.max(...totals) - Math.min(...totals) > 1;
  }
  function autoAssignRosterV270(){
    const st = appState();
    if (!st) return;
    if (!st.rosterDraft || st.rosterDraft.monthKey !== st.monthKey) {
      st.rosterDraft = { monthKey:st.monthKey, assignments:generateEmptyAssignments(st.monthKey) };
    }
    const assignments = st.rosterDraft.assignments || [];
    assignments.forEach(slot => { delete slot[SUGGESTION_FIELD]; delete slot[SUGGESTION_REASON]; });
    const working = assignments.map(slot => ({ ...slot }));
    const counts = suggestionCounts(working);
    const diagnostics = { suggested:0, vacant:0, lockedInvalid:[], existingInvalid:[], details:[], lockedImpact:false };

    working.forEach((slot, index) => {
      const original = assignments[index];
      if (slot.staff_id) {
        const person = staffById(slot.staff_id);
        const check = evaluateCandidate(person, slot, working);
        if (!check.ok) {
          const detail = { slot:original, person, reason:check.reason || 'ไม่ผ่านเงื่อนไข' };
          if (slot.is_locked) diagnostics.lockedInvalid.push(detail);
          else diagnostics.existingInvalid.push(detail);
        }
        return;
      }
      if (slot.is_locked) return;
      const result = candidatesFor(slot, working);
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      result.candidates.sort((a,b) => {
        const ca = counts[String(a.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const cb = counts[String(b.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const order = String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th');
        return ((ca.byCode[code] || 0) - (cb.byCode[code] || 0))
          || ((ca.byFamily[family] || 0) - (cb.byFamily[family] || 0))
          || (ca.weekend - cb.weekend)
          || (ca.total - cb.total)
          || order;
      });
      const chosen = result.candidates[0] || null;
      if (!chosen) {
        const reason = vacancyReason(result.stages);
        original[SUGGESTION_REASON] = reason;
        diagnostics.vacant++;
        diagnostics.details.push({ slot:original, reason });
        return;
      }
      original[SUGGESTION_FIELD] = chosen.id;
      original[SUGGESTION_REASON] = '';
      slot.staff_id = chosen.id; // working copy only, used to validate later suggestions
      const row = counts[String(chosen.id)] ||= { total:0, weekend:0, byCode:{}, byFamily:{} };
      row.total++;
      row.byCode[code] = (row.byCode[code] || 0) + 1;
      row.byFamily[family] = (row.byFamily[family] || 0) + 1;
      try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) row.weekend++; } catch (_) {}
      diagnostics.suggested++;
    });
    diagnostics.lockedImpact = lockedBalanceImpact(working);
    st.__lastAutoAssignDiagnosticsV270 = diagnostics;
    st.rosterDraft = { monthKey:st.monthKey, assignments };
    const parts = [`คำแนะนำ ${diagnostics.suggested} ช่อง`];
    if (diagnostics.vacant) parts.push(`ยังว่าง ${diagnostics.vacant} ช่อง`);
    if (diagnostics.existingInvalid.length) parts.push(`ชื่อเดิมที่ควรตรวจ ${diagnostics.existingInvalid.length} ช่อง`);
    if (diagnostics.lockedInvalid.length || diagnostics.lockedImpact) parts.push('มีตำแหน่งที่ล็อกไว้ส่งผลกระทบต่อความสมดุล');
    toast(`สร้างคำแนะนำแล้ว: ${parts.join(' • ')} — ยังไม่ได้เปลี่ยนชื่อจริง`);
    try { console.info(`${VERSION} suggestion diagnostics`, diagnostics); } catch (_) {}
  }
  assignGlobal('autoAssignRoster', autoAssignRosterV270);

  function findRosterSlot(id){ return rosterAssignments().find(slot => rosterSlotId(slot) === String(id || '')) || null; }
  function applySuggestion(id){
    const slot = findRosterSlot(id);
    if (!slot) return toast('ไม่พบช่องเวร', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่ ระบบจะไม่แตะต้อง', 'error');
    if (slot.staff_id) return toast('ช่องนี้มีชื่อจริงอยู่แล้ว', 'error');
    const suggested = slot[SUGGESTION_FIELD];
    if (!suggested) return toast('ช่องนี้ไม่มีคำแนะนำ', 'error');
    const check = evaluateCandidate(staffById(suggested), slot, rosterAssignments());
    if (!check.ok) return toast(`คำแนะนำนี้ใช้ไม่ได้แล้ว: ${check.reason || 'เงื่อนไขเปลี่ยน'}`, 'error');
    slot.staff_id = suggested;
    delete slot[SUGGESTION_FIELD];
    delete slot[SUGGESTION_REASON];
    try { renderPage(); } catch (_) {}
  }
  function applyAllSuggestions(){
    const assignments = rosterAssignments();
    let applied = 0, skipped = 0;
    assignments.forEach(slot => {
      const suggested = slot[SUGGESTION_FIELD];
      if (!suggested) return;
      if (slot.is_locked || slot.staff_id) { skipped++; return; }
      const check = evaluateCandidate(staffById(suggested), slot, assignments);
      if (!check.ok) { skipped++; return; }
      slot.staff_id = suggested;
      delete slot[SUGGESTION_FIELD];
      delete slot[SUGGESTION_REASON];
      applied++;
    });
    try { renderPage(); } catch (_) {}
    toast(`ใช้คำแนะนำแล้ว ${applied} ช่อง${skipped ? ` • ข้าม ${skipped} ช่องที่ล็อก/เงื่อนไขเปลี่ยน` : ''}`);
  }
  function clearSuggestions(){
    rosterAssignments().forEach(slot => { delete slot[SUGGESTION_FIELD]; delete slot[SUGGESTION_REASON]; });
    const st = appState(); if (st) st.__lastAutoAssignDiagnosticsV270 = null;
    try { renderPage(); } catch (_) {}
    toast('ล้างคำแนะนำแล้ว โดยไม่เปลี่ยนชื่อจริง');
  }

  function rosterStatisticsHtml(){
    const assignments = rosterAssignments();
    const rows = rosterStaff().map(person => {
      const actual = assignments.filter(slot => String(slot.staff_id || '') === String(person.id));
      const suggested = assignments.filter(slot => String(slot[SUGGESTION_FIELD] || '') === String(person.id));
      const locked = actual.filter(slot => slot.is_locked).length;
      let weekend = 0;
      actual.forEach(slot => { try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) weekend++; } catch (_) {} });
      return { person, actual:actual.length, suggested:suggested.length, locked, weekend };
    });
    const diag = appState()?.__lastAutoAssignDiagnosticsV270;
    const warning = diag && (diag.lockedInvalid?.length || diag.lockedImpact)
      ? '<div class="notice warn-notice"><b>มีตำแหน่งที่ล็อกไว้ส่งผลกระทบต่อความสมดุล</b> ระบบคงชื่อเดิมไว้และจะไม่แก้เอง กรุณาตรวจสอบในฐานะ Admin</div>'
      : '';
    return `<div class="card v270-roster-stat-card"><div class="section-title"><div><h3>สถิติสรุปรายเดือน</h3><p class="hint">ใช้ช่วยตัดสินใจแบบ Semi-Manual ชื่อจริงจะเปลี่ยนเมื่อ Admin เลือกหรือกดใช้คำแนะนำเท่านั้น</p></div><span class="badge blue">${esc(appState()?.monthKey || '')}</span></div>${warning}<div class="table-wrap"><table><thead><tr><th>เจ้าหน้าที่</th><th>เวรจริง</th><th>คำแนะนำ</th><th>วันหยุด</th><th>ล็อก</th></tr></thead><tbody>${rows.map(row => `<tr><td><b>${esc(staffName(row.person))}</b></td><td>${row.actual}</td><td>${row.suggested}</td><td>${row.weekend}</td><td>${row.locked}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  try {
    const previousScheduler = window.renderSchedulerPage || (typeof renderSchedulerPage === 'function' ? renderSchedulerPage : null);
    if (previousScheduler && !previousScheduler.__v270SemiManual) {
      const wrappedScheduler = function renderSchedulerPageV270(){
        let html = String(previousScheduler.apply(this, arguments) || '');
        html = html.replace(/data-auto-assign>สร้างร่าง Auto Assign<\/button>/g, 'data-auto-assign>สร้างคำแนะนำ Auto Assign</button><button class="primary-btn" type="button" data-v270-apply-all-suggestions>ใช้คำแนะนำทั้งหมด</button><button class="ghost-btn" type="button" data-v270-clear-suggestions>ล้างคำแนะนำ</button>');
        html = html.replace('Auto Assign จะช่วยเกลี่ยเวรตามกติกาและไม่แตะช่องที่ล็อกไว้', 'Auto Assign จะแสดงคำแนะนำเท่านั้น ไม่เขียนทับชื่อจริง และไม่แตะช่องที่ล็อกไว้');
        html = html.replace(/<\/div>\s*$/, `${rosterStatisticsHtml()}</div>`);
        return html;
      };
      wrappedScheduler.__v270SemiManual = true;
      assignGlobal('renderSchedulerPage', wrappedScheduler);
    }
  } catch (error) { console.warn(`${VERSION}: scheduler wrapper skipped`, error); }

  function decorateRosterSuggestions(){
    const st = appState();
    if (st?.page !== 'scheduler') return;
    const assignments = rosterAssignments();
    assignments.forEach(slot => {
      const id = rosterSlotId(slot);
      const suggested = slot[SUGGESTION_FIELD];
      const reason = slot[SUGGESTION_REASON];
      const containers = Array.from(document.querySelectorAll(`[data-drop-slot="${CSS.escape(id)}"]`));
      document.querySelectorAll(`[data-edit-roster-slot-v213="${CSS.escape(id)}"]`).forEach(button => {
        const card = button.closest('.mobile-roster-slot');
        if (card && !containers.includes(card)) containers.push(card);
      });
      containers.forEach(container => {
        const existing = container.querySelector('.v270-slot-suggestion');
        if (slot.is_locked || slot.staff_id || (!suggested && !reason)) {
          if (existing) existing.remove();
          return;
        }
        const signature = suggested ? `suggest:${suggested}` : `reason:${reason}`;
        if (existing?.dataset?.v270Signature === signature) return;
        if (existing) existing.remove();
        if (suggested) {
          const box = document.createElement('div');
          box.className = 'v270-slot-suggestion';
          box.dataset.v270Signature = signature;
          box.innerHTML = `<span><b>แนะนำ:</b> ${esc(staffName(suggested))}</span><button type="button" class="tiny-btn" data-v270-accept-suggestion="${esc(id)}">ใช้คำแนะนำ</button>`;
          container.appendChild(box);
        } else if (reason) {
          const box = document.createElement('div');
          box.className = 'v270-slot-suggestion v270-no-suggestion';
          box.dataset.v270Signature = signature;
          box.textContent = `ยังแนะนำไม่ได้: ${reason}`;
          container.appendChild(box);
        }
      });
    });
  }

  window.addEventListener('click', function(event){
    const one = event.target?.closest?.('[data-v270-accept-suggestion]');
    if (one) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      applySuggestion(one.getAttribute('data-v270-accept-suggestion'));
      return;
    }
    if (event.target?.closest?.('[data-v270-apply-all-suggestions]')) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      applyAllSuggestions();
      return;
    }
    if (event.target?.closest?.('[data-v270-clear-suggestions]')) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      clearSuggestions();
    }
  }, true);

  /* Final render hook: add the third tab and suggestion decorations after older patches finish. */
  try {
    const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRenderPage && !previousRenderPage.__v270FinalRender) {
      const wrappedRenderPage = function renderPageV270(){
        const result = previousRenderPage.apply(this, arguments);
        setTimeout(decoratePositionManagement, 45);
        setTimeout(decorateRosterSuggestions, 45);
        setTimeout(decoratePositionManagement, 140);
        setTimeout(decorateRosterSuggestions, 140);
        return result;
      };
      wrappedRenderPage.__v270FinalRender = true;
      assignGlobal('renderPage', wrappedRenderPage);
    }
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v270-style';
  style.textContent = `
    .v270-mentor-layout{grid-template-columns:minmax(320px,.9fr) minmax(420px,1.1fr)}
    .v270-mentor-tab-body code{background:#eff6ff;border-radius:7px;padding:2px 6px;color:#1d4ed8}
    .v270-daily-trainee-summary{margin-top:14px}
    .v270-slot-suggestion{margin-top:7px;padding:7px 8px;border:1px dashed #60a5fa;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:11px;display:flex;gap:7px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    .v270-slot-suggestion.v270-no-suggestion{border-color:#fdba74;background:#fff7ed;color:#9a3412;display:block}
    .v270-roster-stat-card{margin-top:14px}
    .v270-roster-stat-card table{min-width:560px}
    .v270-roster-stat-card th,.v270-roster-stat-card td{text-align:center}
    .v270-roster-stat-card th:first-child,.v270-roster-stat-card td:first-child{text-align:left}
    @media(max-width:900px){.v270-mentor-layout{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  try {
    const observer = new MutationObserver(() => {
      decoratePositionManagement();
      decorateRosterSuggestions();
    });
    observer.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  window.cnmiV270 = {
    isTrainee,
    mentorPairs,
    pairTraineesWithMentors,
    decoratePositionManagement,
    decorateRosterSuggestions,
    autoAssignRosterV270,
    applySuggestion,
    applyAllSuggestions,
    clearSuggestions,
    syncTraineePairsForDate
  };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v270-trainee-semi-manual-roster.js", error); }
;

/* Original source: patch-v271-semi-manual-assistant-hardening.js */
try {
/* CNMI Staff Planner V271 - Semi-Manual Assistant Hardening
   - Optimistic permission auto-save with per-checkbox server verification.
   - Date-range mentor/new-staff/intern records; Supabase remains source of truth.
   - Exact consecutive rule: only ชบด1/ชบด2/ชบด3 on adjacent dates.
   - Candidate diagnostics with Hard Error / Warning separation and Force Assign audit.
   - Auto Assign only creates safe suggestions and never overwrites actual assignments.
   - Detailed monthly summary for human review.
*/
(function(){
  'use strict';
  const VERSION = 'V271_SEMI_MANUAL_ASSISTANT_HARDENING';
  if (window.__CNMI_V271_SEMI_MANUAL_ASSISTANT_HARDENING__) return;
  window.__CNMI_V271_SEMI_MANUAL_ASSISTANT_HARDENING__ = true;

  const TRAINING_TABLE = 'staff_training_assignments';
  const OVERRIDE_TABLE = 'roster_manual_overrides';
  const RESTRICTED = new Set(['ชบด1','ชบด2','ชบด3']);
  const SUGGESTION_FIELD = '_suggested_staff_id_v270';
  const SUGGESTION_REASON = '_suggestion_reason_v270';
  const permissionTimers = new Map();
  const permissionGeneration = new Map();
  const permissionInFlight = new Map();
  const permissionConfirmed = new Map();
  const permissionFailedDesired = new Map();
  let trainingLoadInFlight = null;
  let trainingSchemaReady = null;
  let overrideSchemaReady = null;

  function st(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function client(){ try { return sb || window.sb || null; } catch (_) { return window.sb || null; } }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function assignGlobal(name, value){
    try { window[name] = value; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return st()?.profile?.id || null; }
  }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return String(st()?.profile?.role || '').toLowerCase() === 'admin'; }
  }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0,10); }
  }
  function validDate(value){ return /^\d{4}-\d{2}-\d{2}$/.test(normDate(value)); }
  function normId(value){ return String(value == null ? '' : value); }
  function bool(value){ return value === true || String(value).toLowerCase() === 'true'; }
  function ordered(rows){
    try { return orderedStaff(rows || []); }
    catch (_) { return (rows || []).slice().sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function staffRows(){ return ordered((st()?.staff || []).filter(person => person && person.is_active !== false)); }
  function rosterRows(){
    return staffRows().filter(person => {
      try { return isRosterEnabled(person); }
      catch (_) { return person.roster_enabled !== false; }
    });
  }
  function staffById(id){ return (st()?.staff || []).find(person => normId(person?.id) === normId(id)) || null; }
  function staffName(personOrId){
    const person = typeof personOrId === 'object' ? personOrId : staffById(personOrId);
    return person ? (person.nickname || person.full_name || person.email || '-') : '-';
  }
  function slotId(slot){
    try { return String(getSlotId(slot)); }
    catch (_) { return String(slot?.id || slot?._temp_id || `${slot?.duty_date || ''}|${slot?.duty_code || ''}`); }
  }
  function sameSlot(a,b){
    const aid = normId(a?.id || a?._temp_id);
    const bid = normId(b?.id || b?._temp_id);
    if (aid && bid) return aid === bid;
    return normDate(a?.duty_date) === normDate(b?.duty_date) && String(a?.duty_code || '') === String(b?.duty_code || '');
  }
  function dayDiff(a,b){
    const aa = Date.parse(`${normDate(a)}T00:00:00Z`);
    const bb = Date.parse(`${normDate(b)}T00:00:00Z`);
    if (!Number.isFinite(aa) || !Number.isFinite(bb)) return NaN;
    return Math.round(Math.abs(aa - bb) / 86400000);
  }
  function dutyLabel(code){
    try { return DUTY_LABEL[code] || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function monthAssignments(){
    const stateRef = st();
    if (stateRef?.rosterDraft?.monthKey === stateRef?.monthKey && Array.isArray(stateRef.rosterDraft.assignments)) return stateRef.rosterDraft.assignments;
    try { return getAssignmentsForMonth(stateRef?.monthKey) || []; }
    catch (_) { return stateRef?.rosterAssignments || []; }
  }

  /* ------------------------------------------------------------------
     Date-range mentor / trainee / intern data
     ------------------------------------------------------------------ */
  function trainingRows(){ return Array.isArray(st()?.trainingAssignmentsV271) ? st().trainingAssignmentsV271 : []; }
  function trainingIdentity(row){ return row?.trainee_staff_id ? `staff:${row.trainee_staff_id}` : `name:${String(row?.trainee_name || '').trim().toLowerCase()}`; }
  function trainingName(row){ return row?.trainee_staff_id ? staffName(row.trainee_staff_id) : (row?.trainee_name || '-'); }
  function trainingTypeLabel(type){ return type === 'intern' ? 'Intern (เด็กฝึกงาน)' : 'น้องใหม่'; }
  function activeTrainingOn(row, date){
    const d = normDate(date);
    return !!row && row.active !== false && validDate(d) && normDate(row.start_date) <= d && d <= normDate(row.end_date);
  }
  function trainingForDate(date){ return trainingRows().filter(row => activeTrainingOn(row, date)); }
  function isTrainingPersonOnDate(staffId, date){
    const sid = normId(staffId);
    return !!sid && trainingForDate(date).some(row => normId(row.trainee_staff_id) === sid);
  }
  function trainingOverlapsMonth(row, monthKey){
    const key = String(monthKey || '').slice(0,7);
    if (!/^\d{4}-\d{2}$/.test(key)) return false;
    const start = `${key}-01`;
    const endDate = new Date(Date.UTC(Number(key.slice(0,4)), Number(key.slice(5,7)), 0));
    const end = endDate.toISOString().slice(0,10);
    return row.active !== false && normDate(row.start_date) <= end && normDate(row.end_date) >= start;
  }
  async function loadTrainingAssignments(options={}){
    if (trainingLoadInFlight && options.force !== true) return trainingLoadInFlight;
    const db = client();
    if (!db) return [];
    const request = (async () => {
      const result = await db.from(TRAINING_TABLE).select('*').order('start_date', { ascending:false }).order('created_at', { ascending:false });
      if (result.error) {
        trainingSchemaReady = false;
        if (!/does not exist|schema cache|relation/i.test(friendly(result.error))) console.warn(`${VERSION}: training load failed`, result.error);
        const stateRef = st();
        if (stateRef) stateRef.trainingAssignmentsV271 = [];
        return [];
      }
      trainingSchemaReady = true;
      const stateRef = st();
      if (stateRef) {
        stateRef.trainingAssignmentsV271 = result.data || [];
        stateRef.trainingAssignmentsLoadedAtV271 = new Date().toISOString();
      }
      return result.data || [];
    })();
    trainingLoadInFlight = request;
    try { return await request; }
    finally { if (trainingLoadInFlight === request) trainingLoadInFlight = null; }
  }

  function excludeFromDaySlot(person, date){ return !!person?.id && isTrainingPersonOnDate(person.id, date); }

  function cleanTrainingPositionRow(source, assignment, date){
    if (!assignment?.trainee_staff_id) return null;
    return {
      work_date:normDate(date || source?.work_date),
      position_code:source?.position_code || source?.code || '',
      zone:source?.zone || '',
      break_time:source?.break_time || '-',
      main_rule:source?.main_rule || '',
      job_desc:source?.job_desc || '',
      staff_id:assignment.trainee_staff_id,
      updated_by:currentStaff(),
      _training_pair_id_v271:assignment.id,
      _training_type_v271:assignment.trainee_type
    };
  }
  function traineeAvailable(assignment, date){
    if (!assignment?.trainee_staff_id) return true;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(staffById(assignment.trainee_staff_id), date, 'day_position');
      return !result || !!result.available;
    } catch (_) { return true; }
  }
  function pairTrainingRows(sourceRows){
    const source = Array.isArray(sourceRows) ? sourceRows : [];
    const base = source.filter(row => !isTrainingPersonOnDate(row?.staff_id, row?.work_date));
    const byStaffDate = new Map();
    base.forEach(row => {
      const sid = normId(row?.staff_id);
      const date = normDate(row?.work_date);
      const code = String(row?.position_code || row?.code || '').trim();
      if (sid && date && code && code !== 'รอตรวจสอบ') byStaffDate.set(`${sid}|${date}`, row);
    });
    const dates = Array.from(new Set(base.map(row => normDate(row?.work_date)).filter(validDate)));
    const extra = [];
    dates.forEach(date => {
      trainingForDate(date).forEach(assignment => {
        if (!assignment.trainee_staff_id || !traineeAvailable(assignment, date)) return;
        const mentorRow = byStaffDate.get(`${assignment.mentor_staff_id}|${date}`);
        if (!mentorRow) return;
        const paired = cleanTrainingPositionRow(mentorRow, assignment, date);
        if (paired?.position_code) extra.push(paired);
      });
    });
    return base.concat(extra);
  }
  async function syncTrainingPairsForDate(date){
    const d = normDate(date);
    const db = client();
    if (!db || !validDate(d) || trainingSchemaReady === false) return;
    const assignments = trainingForDate(d).filter(row => row.trainee_staff_id);
    const traineeIds = Array.from(new Set(assignments.map(row => row.trainee_staff_id).filter(Boolean)));
    if (!traineeIds.length) return;
    const read = await db.from('daily_positions').select('*').eq('work_date', d);
    if (read.error) throw read.error;
    const existing = read.data || [];
    const remove = await db.from('daily_positions').delete().eq('work_date', d).in('staff_id', traineeIds);
    if (remove.error) throw remove.error;
    const operational = existing.filter(row => !traineeIds.map(String).includes(String(row.staff_id)));
    const byStaff = new Map(operational.map(row => [normId(row.staff_id), row]));
    const payload = assignments.map(assignment => {
      const mentorRow = byStaff.get(normId(assignment.mentor_staff_id));
      if (!mentorRow || !traineeAvailable(assignment, d)) return null;
      const row = cleanTrainingPositionRow(mentorRow, assignment, d);
      if (!row) return null;
      delete row._training_pair_id_v271;
      delete row._training_type_v271;
      return row;
    }).filter(Boolean);
    if (payload.length) {
      const inserted = await db.from('daily_positions').insert(payload);
      if (inserted.error) throw inserted.error;
    }
  }

  /* ------------------------------------------------------------------
     Optimistic permission auto-save
     ------------------------------------------------------------------ */
  function permissionKey(staffId, code){ return `${normId(staffId)}|${String(code || '').trim()}`; }
  function permissionRow(staffId, code){
    return (st()?.positionEligibility || []).find(row => normId(row?.staff_id) === normId(staffId) && String(row?.position_code || '').trim() === String(code || '').trim()) || null;
  }
  function setPermissionLocal(staffId, code, value){
    const stateRef = st();
    if (!stateRef) return;
    const sid = normId(staffId);
    const pcode = String(code || '').trim();
    const others = (stateRef.positionEligibility || []).filter(row => !(normId(row?.staff_id) === sid && String(row?.position_code || '').trim() === pcode));
    stateRef.positionEligibility = others.concat([{ staff_id:sid, position_code:pcode, is_eligible:!!value, updated_by:currentStaff(), updated_at:new Date().toISOString() }]);
    stateRef.positionEligibilitySourceV271 = 'optimistic-ui';
    try { window.cnmiV258?.sessionValues?.set?.(permissionKey(sid,pcode), !!value); } catch (_) {}
  }
  function permissionStatusElement(input){
    const label = input?.closest?.('.position-check') || input?.parentElement;
    if (!label) return null;
    let el = label.querySelector('.v271-permission-save-state');
    if (!el) {
      el = document.createElement('small');
      el.className = 'v271-permission-save-state';
      const span = label.querySelector('span');
      (span || label).appendChild(el);
    }
    return el;
  }
  function setPermissionStatus(input, status, message){
    const el = permissionStatusElement(input);
    if (!el) return;
    el.dataset.status = status;
    el.textContent = message || (status === 'saving' ? 'กำลังบันทึก…' : status === 'saved' ? 'บันทึกแล้ว' : status === 'error' ? 'บันทึกไม่สำเร็จ' : 'พร้อม Auto-Save');
  }
  async function persistPermissionRow(payload){
    const api = window.cnmiV258;
    if (api?.persistRows) {
      await api.persistRows([payload]);
    } else {
      const db = client();
      if (!db) throw new Error('ไม่พบ Supabase client');
      const update = await db.from('daily_position_eligibility')
        .update({ is_eligible:payload.is_eligible, updated_by:payload.updated_by })
        .eq('staff_id', payload.staff_id).eq('position_code', payload.position_code).select('*');
      if (update.error) throw update.error;
      if (!(update.data || []).length) {
        const insert = await db.from('daily_position_eligibility').insert(payload).select('*');
        if (insert.error) throw insert.error;
      }
    }
    const verify = await client().from('daily_position_eligibility').select('*')
      .eq('staff_id', payload.staff_id).eq('position_code', payload.position_code);
    if (verify.error) throw verify.error;
    const rows = verify.data || [];
    if (!rows.length || rows.some(row => bool(row.is_eligible) !== !!payload.is_eligible)) throw new Error(`ตรวจสอบสิทธิ์ ${payload.position_code} หลังบันทึกไม่ผ่าน`);
    const stateRef = st();
    if (stateRef) {
      const others = (stateRef.positionEligibility || []).filter(row => !(normId(row?.staff_id) === normId(payload.staff_id) && String(row?.position_code || '') === payload.position_code));
      stateRef.positionEligibility = others.concat(rows);
      stateRef.positionEligibilitySourceV271 = 'supabase-verified';
      stateRef.positionEligibilityLoadedAtV271 = new Date().toISOString();
    }
    return rows;
  }
  function findPermissionInput(key){
    return Array.from(document.querySelectorAll('input[data-eligibility]')).find(input => permissionKey(input.dataset.staffId, input.dataset.positionCode) === key) || null;
  }
  function schedulePermissionSave(input, previousValue){
    const staffId = normId(input.dataset.staffId);
    const code = String(input.dataset.positionCode || '').trim();
    if (!staffId || !code) return;
    const key = permissionKey(staffId, code);
    const generation = (permissionGeneration.get(key) || 0) + 1;
    permissionGeneration.set(key, generation);
    if (permissionTimers.has(key)) clearTimeout(permissionTimers.get(key));
    setPermissionStatus(input, 'saving', 'รอบันทึก…');
    permissionTimers.set(key, setTimeout(() => {
      permissionTimers.delete(key);
      const run = async () => {
        const currentInput = findPermissionInput(key) || input;
        const desired = !!currentInput.checked;
        setPermissionStatus(currentInput, 'saving', 'กำลังบันทึก…');
        try {
          await persistPermissionRow({ staff_id:staffId, position_code:code, is_eligible:desired, updated_by:currentStaff() });
          permissionConfirmed.set(key, desired);
          permissionFailedDesired.delete(key);
          if (permissionGeneration.get(key) === generation) setPermissionStatus(findPermissionInput(key) || currentInput, 'saved', 'บันทึกแล้ว');
          else schedulePermissionSave(findPermissionInput(key) || currentInput, desired);
        } catch (error) {
          console.error(`${VERSION}: permission autosave failed`, error);
          if (permissionGeneration.get(key) === generation) {
            const latest = findPermissionInput(key) || currentInput;
            permissionFailedDesired.set(key, desired);
            const rollback = permissionConfirmed.has(key) ? permissionConfirmed.get(key) : !!previousValue;
            latest.checked = !!rollback;
            latest.closest('.position-check')?.classList.toggle('checked', !!rollback);
            setPermissionLocal(staffId, code, !!rollback);
            setPermissionStatus(latest, 'error', 'บันทึกไม่สำเร็จ • คลิกเพื่อลองใหม่');
            toast(`บันทึกสิทธิ์ ${code} ไม่สำเร็จ: ${friendly(error)}`, 'error');
          }
        }
      };
      const chain = (permissionInFlight.get(key) || Promise.resolve()).then(run, run);
      const tracked = chain.finally(() => { if (permissionInFlight.get(key) === tracked) permissionInFlight.delete(key); });
      permissionInFlight.set(key, tracked);
    }, 450));
  }
  async function saveAllVisiblePermissions(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const inputs = Array.from(document.querySelectorAll('.v247-eligibility-page input[data-eligibility], .v245-eligibility-page input[data-eligibility]'));
    if (!inputs.length) return toast('ไม่พบสิทธิ์ที่แสดงอยู่', 'error');
    inputs.forEach(input => setPermissionStatus(input, 'saving', 'กำลังตรวจสอบ…'));
    try {
      const rows = inputs.map(input => ({ staff_id:normId(input.dataset.staffId), position_code:String(input.dataset.positionCode || '').trim(), is_eligible:!!input.checked, updated_by:currentStaff() }));
      const staffIds = new Set(rows.map(row => row.staff_id));
      if (staffIds.size !== 1) throw new Error('หน้าจอมีข้อมูลมากกว่าหนึ่งคน');
      for (const row of rows) await persistPermissionRow(row);
      inputs.forEach(input => setPermissionStatus(input, 'saved', 'บันทึกแล้ว'));
      toast('บันทึกและตรวจสอบสิทธิ์ที่เห็นอยู่กับ Supabase แล้ว');
    } catch (error) {
      inputs.forEach(input => setPermissionStatus(input, 'error', 'ตรวจสอบไม่ผ่าน'));
      toast(`บันทึกสิทธิ์ไม่สำเร็จ: ${friendly(error)}`, 'error');
    }
  }
  function decoratePermissionAutosave(){
    if (st()?.page !== 'positionManagement') return;
    const panel = document.querySelector('.eligibility-position-panel');
    if (!panel) return;
    const button = panel.querySelector('[data-save-position-eligibility]');
    if (button) {
      button.textContent = 'บันทึกทั้งหมดตอนนี้';
      button.title = 'ปกติระบบ Auto-Save ให้ทีละรายการ ปุ่มนี้ใช้ตรวจสอบและบันทึกทั้งหมดที่เห็นอยู่ซ้ำอีกครั้ง';
    }
    const title = panel.querySelector('.section-title');
    if (title && !title.querySelector('.v271-autosave-badge')) title.insertAdjacentHTML('beforeend', '<span class="badge blue v271-autosave-badge">Auto-Save • Supabase</span>');
    panel.querySelectorAll('input[data-eligibility]').forEach(input => {
      const key = permissionKey(input.dataset.staffId,input.dataset.positionCode);
      if (!permissionConfirmed.has(key)) permissionConfirmed.set(key, !!input.checked);
      if (!permissionStatusElement(input)?.textContent) setPermissionStatus(input, 'idle', 'พร้อม Auto-Save');
    });
  }

  /* ------------------------------------------------------------------
     Hard Error / Warning candidate evaluation
     ------------------------------------------------------------------ */
  function roleMatches(person, requiredRole){
    try { return supportsRequiredRole(person, requiredRole); }
    catch (_) { return true; }
  }
  function permissionAllows(person, slot){
    try { return window.cnmiV266?.dutyPermissionAllowsV266?.(person, slot) !== false; }
    catch (_) { return true; }
  }
  function availability(person, slot){
    try { return window.cnmiV266?.getStaffAvailabilityContextV266?.(person, slot.duty_date, 'night_roster') || { available:true, reason:'พร้อมทำงาน' }; }
    catch (_) { return { available:true, reason:'พร้อมทำงาน' }; }
  }
  function sameDayConflict(person, slot, assignments){
    return (assignments || []).some(other => other && other.staff_id && normId(other.staff_id) === normId(person?.id) && normDate(other.duty_date) === normDate(slot?.duty_date) && !sameSlot(other, slot));
  }
  function exactAdjacentChbd(person, slot, assignments){
    const currentCode = String(slot?.duty_code || '').trim();
    if (!RESTRICTED.has(currentCode)) return null;
    return (assignments || []).find(other => other && other.staff_id && normId(other.staff_id) === normId(person?.id) && RESTRICTED.has(String(other.duty_code || '').trim()) && !sameSlot(other,slot) && dayDiff(other.duty_date, slot.duty_date) === 1) || null;
  }
  function quotaWarning(person, slot, assignments){
    const target = Number(person?.target_shifts ?? person?.targetShifts ?? person?.monthly_quota ?? 0);
    if (!(target > 0)) return null;
    const total = (assignments || []).filter(row => normId(row?.staff_id) === normId(person.id) && !sameSlot(row,slot)).length + 1;
    return total > target ? `Quota เกิน ${total-target} เวร (เป้าหมาย ${target})` : null;
  }
  function evaluateCandidateV271(person, slot, assignments){
    const hardErrors = [];
    const warnings = [];
    const info = [];
    if (!person?.id) hardErrors.push({ code:'STAFF_NOT_FOUND', message:'ไม่พบข้อมูลเจ้าหน้าที่' });
    if (!slot || !validDate(slot?.duty_date) || !String(slot?.duty_code || '').trim()) hardErrors.push({ code:'INVALID_SLOT', message:'วันที่หรือรหัสเวรไม่ถูกต้อง' });
    if (!person?.id || hardErrors.length) return { ok:false, hardErrors, warnings, info, stage:'hard', reason:hardErrors[0]?.message || 'ข้อมูลไม่ครบ' };
    let enabled = person.is_active !== false;
    try { enabled = !!isRosterEnabled(person); } catch (_) {}
    if (!enabled) hardErrors.push({ code:'ROSTER_DISABLED', message:'ปิดใช้งานการจัดเวร' });
    const available = availability(person,slot);
    if (!available.available) hardErrors.push({ code:available.noDuty ? 'NO_DUTY' : 'LEAVE_OR_UNAVAILABLE', message:available.reason || 'ลา/ไม่พร้อมทำเวร' });
    if (sameDayConflict(person, slot, assignments)) hardErrors.push({ code:'SAME_DAY_CONFLICT', message:'มีเวรอื่นในวันเดียวกัน' });
    if (!permissionAllows(person,slot)) warnings.push({ code:'PERMISSION_MISMATCH', message:'ไม่มีสิทธิ์ตามวัน/ประเภทเวร' });
    if (!roleMatches(person, slot?.required_role)) warnings.push({ code:'ROLE_MISMATCH', message:`ไม่ตรงกลุ่มผู้ปฏิบัติหลัก ${slot?.required_role || ''}`.trim() });
    const adjacent = exactAdjacentChbd(person,slot,assignments);
    if (adjacent) warnings.push({ code:'ADJACENT_CHBD', message:`ชบดติดวันข้างเคียง: ${normDate(adjacent.duty_date)} ${adjacent.duty_code}` });
    const quota = quotaWarning(person,slot,assignments);
    if (quota) warnings.push({ code:'QUOTA_EXCEEDED', message:quota });
    if (!hardErrors.length) info.push({ code:'AVAILABLE', message:'ไม่มีการลาและไม่มีเวรซ้ำวันเดียวกัน' });
    return {
      ok:hardErrors.length === 0,
      hardErrors,
      warnings,
      info,
      stage:hardErrors.length ? 'hard' : warnings.length ? 'warning' : 'ready',
      reason:hardErrors[0]?.message || warnings[0]?.message || 'พร้อมจัดเวร'
    };
  }
  function filterCandidatesV271(slot, assignments){
    const evaluations = rosterRows().map(person => ({ person, result:evaluateCandidateV271(person,slot,assignments) }));
    const candidates = evaluations.filter(item => item.result.ok).map(item => item.person);
    return {
      rosterStaff:rosterRows(),
      permissionEligible:evaluations.filter(item => !item.result.warnings.some(w => w.code === 'PERMISSION_MISMATCH')).map(item => item.person),
      statusEligible:evaluations.filter(item => !item.result.hardErrors.some(h => ['LEAVE_OR_UNAVAILABLE','NO_DUTY','ROSTER_DISABLED'].includes(h.code))).map(item => item.person),
      sameDayEligible:evaluations.filter(item => !item.result.hardErrors.some(h => h.code === 'SAME_DAY_CONFLICT')).map(item => item.person),
      candidates,
      evaluations
    };
  }
  function canStaffWorkSlotV271(staffId, slot, assignments){ return evaluateCandidateV271(staffById(staffId), slot, assignments || monthAssignments()).ok; }

  function diagnosticsHtml(result){
    const hard = result?.hardErrors || [];
    const warnings = result?.warnings || [];
    const info = result?.info || [];
    return `<div class="v271-candidate-diagnostics">
      ${hard.map(item => `<div class="v271-diagnostic hard"><b>บล็อก:</b> ${esc(item.message)}</div>`).join('')}
      ${warnings.map(item => `<div class="v271-diagnostic warning"><b>เตือน:</b> ${esc(item.message)}</div>`).join('')}
      ${!hard.length && !warnings.length ? `<div class="v271-diagnostic ok"><b>ผ่าน:</b> ${esc(info[0]?.message || 'พร้อมจัดเวร')}</div>` : ''}
    </div>`;
  }
  function candidateDialogState(slot, assignments){
    const items = rosterRows().map(person => ({ person, result:evaluateCandidateV271(person,slot,assignments) }));
    return { slot, assignments, items };
  }
  function showCandidateModal(slot, preferredStaffId){
    if (!slot) return toast('ไม่พบช่องเวร', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่ กรุณาปลดล็อกก่อน', 'error');
    const assignments = monthAssignments();
    const dialog = candidateDialogState(slot, assignments);
    st().__candidateDialogV271 = dialog;
    const options = dialog.items.map(item => {
      const hard = item.result.hardErrors.length;
      const warn = item.result.warnings.length;
      const suffix = hard ? `⛔ ${item.result.hardErrors[0].message}` : warn ? `⚠ ${warn} คำเตือน` : 'ผ่าน';
      return `<option value="${esc(item.person.id)}" ${normId(item.person.id)===normId(slot.staff_id)?'selected':''} ${hard?'disabled':''}>${esc(staffName(item.person))} — ${esc(suffix)}</option>`;
    }).join('');
    const preferred = normId(preferredStaffId || slot.staff_id);
    const selected = dialog.items.find(item => normId(item.person.id) === preferred && item.result.ok) || dialog.items.find(item => item.result.ok) || null;
    const selectedId = selected?.person?.id || '';
    const html = `<h2>เลือกคนลงเวร</h2>
      <p class="hint">${esc(normDate(slot.duty_date))} • ${esc(dutyLabel(slot.duty_code))} • ${esc(slot.required_role || '-')}</p>
      <form id="v271RosterCandidateForm" data-slot-id="${esc(slotId(slot))}" class="form-grid compact-form">
        <label>ผู้รับผิดชอบ
          <select name="staff_id" id="v271CandidateSelect"><option value="">ยังไม่จัด</option>${options}</select>
        </label>
        <div id="v271SelectedCandidateDiagnostics">${selected ? diagnosticsHtml(selected.result) : '<div class="v271-diagnostic ok">ปล่อยช่องว่างได้</div>'}</div>
        <details class="v271-debug-list" open><summary>เหตุผลของผู้สมัครแต่ละคน</summary>
          <div class="v271-debug-rows">${dialog.items.map(item => `<div class="v271-debug-row ${item.result.hardErrors.length?'hard':item.result.warnings.length?'warning':'ok'}"><b>${esc(staffName(item.person))}</b>${diagnosticsHtml(item.result)}</div>`).join('')}</div>
        </details>
        <label id="v271OverrideReasonWrap" class="${selected?.result?.warnings?.length ? '' : 'hidden'}">เหตุผลที่ Admin บังคับข้ามคำเตือน
          <textarea name="override_reason" rows="2" placeholder="ระบุเหตุผลสั้น ๆ เพื่อเก็บ Audit Log"></textarea>
        </label>
        <div class="actions v271-candidate-actions">
          <button class="primary-btn" type="submit" name="action" value="assign">ยืนยันจัดเวร</button>
          <button class="warn-btn ${selected?.result?.warnings?.length ? '' : 'hidden'}" type="submit" name="action" value="force" id="v271ForceAssignBtn">Force Assign</button>
          <button class="ghost-btn" type="submit" name="action" value="clear">ปล่อยว่าง</button>
        </div>
      </form>`;
    if (typeof showModal === 'function') showModal(html); else toast('ไม่สามารถเปิดหน้าต่างเลือกคนได้', 'error');
    const select = document.getElementById('v271CandidateSelect');
    if (select && selectedId) select.value = selectedId;
    updateCandidateModalSelection();
  }
  function updateCandidateModalSelection(){
    const dialog = st()?.__candidateDialogV271;
    const select = document.getElementById('v271CandidateSelect');
    if (!dialog || !select) return;
    const item = dialog.items.find(row => normId(row.person.id) === normId(select.value));
    const box = document.getElementById('v271SelectedCandidateDiagnostics');
    if (box) box.innerHTML = item ? diagnosticsHtml(item.result) : '<div class="v271-diagnostic ok">ปล่อยช่องว่างได้</div>';
    const hasWarnings = !!item?.result?.warnings?.length;
    document.getElementById('v271OverrideReasonWrap')?.classList.toggle('hidden', !hasWarnings);
    document.getElementById('v271ForceAssignBtn')?.classList.toggle('hidden', !hasWarnings);
  }
  async function writeOverrideAudit(slot, person, result, reason){
    const db = client();
    if (!db) throw new Error('ไม่พบ Supabase client');
    const payload = {
      roster_month_key:String(st()?.monthKey || normDate(slot.duty_date).slice(0,7)),
      duty_date:normDate(slot.duty_date),
      duty_code:String(slot.duty_code || ''),
      staff_id:person.id,
      warning_codes:(result.warnings || []).map(item => item.code),
      warning_details:result.warnings || [],
      override_reason:String(reason || '').trim(),
      actor_id:currentStaff()
    };
    const insert = await db.from(OVERRIDE_TABLE).insert(payload).select('*').maybeSingle();
    if (insert.error) {
      overrideSchemaReady = false;
      throw insert.error;
    }
    overrideSchemaReady = true;
    return insert.data;
  }
  async function submitCandidateForm(event){
    const form = event.target;
    const slot = monthAssignments().find(row => slotId(row) === String(form.dataset.slotId || ''));
    if (!slot) return toast('ไม่พบช่องเวร กรุณารีเฟรชหน้า', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่', 'error');
    const fd = new FormData(form);
    const action = event.submitter?.value || 'assign';
    if (action === 'clear') {
      slot.staff_id = null;
      delete slot._manual_override_v271;
      try { closeModal(); } catch (_) {}
      try { renderPage(); } catch (_) {}
      return toast('ปล่อยช่องนี้ว่างแล้ว กดบันทึกตารางเพื่อบันทึกจริง');
    }
    const staffId = normId(fd.get('staff_id'));
    const person = staffById(staffId);
    const result = evaluateCandidateV271(person,slot,monthAssignments());
    if (result.hardErrors.length) return toast(`จัดไม่ได้: ${result.hardErrors.map(item => item.message).join(' • ')}`, 'error');
    if (result.warnings.length && action !== 'force') return toast('คนนี้มีคำเตือน กรุณาตรวจสอบแล้วกด Force Assign', 'error');
    const reason = String(fd.get('override_reason') || '').trim();
    if (result.warnings.length && !reason) return toast('กรุณาระบุเหตุผลที่บังคับข้ามคำเตือน', 'error');
    if (result.warnings.length) {
      try {
        await writeOverrideAudit(slot,person,result,reason);
      } catch (error) {
        const message = friendly(error);
        if (/does not exist|schema cache|relation/i.test(message)) return toast('ยังไม่ได้รัน supabase_v271_semi_manual_assistant.sql จึงยังเก็บ Audit Log ไม่ได้', 'error');
        return toast(`บันทึก Audit Log ไม่สำเร็จ: ${message}`, 'error');
      }
      slot._manual_override_v271 = { warning_codes:result.warnings.map(item => item.code), warning_details:result.warnings, reason, actor_id:currentStaff(), at:new Date().toISOString() };
    } else delete slot._manual_override_v271;
    slot.staff_id = staffId;
    delete slot[SUGGESTION_FIELD];
    delete slot[SUGGESTION_REASON];
    try { closeModal(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(result.warnings.length ? 'Force Assign แล้ว และบันทึก Audit Log เรียบร้อย กดบันทึกตารางเพื่อบันทึกจริง' : 'แก้ไขช่องเวรแล้ว กดบันทึกตารางเพื่อบันทึกจริง');
  }

  /* ------------------------------------------------------------------
     Safe Auto Assign suggestions
     ------------------------------------------------------------------ */
  function dutyFamily(code){
    const value = String(code || '');
    if (value.startsWith('ชบด')) return 'ชบด';
    if (value.startsWith('ช4')) return 'ช4';
    if (value.startsWith('ช3')) return 'ช3';
    if (value.startsWith('ช9')) return 'ช9';
    return value;
  }
  function fairnessCounts(assignments){
    const out = {};
    (assignments || []).forEach(slot => {
      if (!slot?.staff_id) return;
      const sid = normId(slot.staff_id);
      const row = out[sid] ||= { total:0, weekend:0, byCode:{}, byFamily:{} };
      row.total++;
      const code = String(slot.duty_code || '');
      row.byCode[code] = (row.byCode[code] || 0) + 1;
      const family = dutyFamily(code);
      row.byFamily[family] = (row.byFamily[family] || 0) + 1;
      try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) row.weekend++; } catch (_) {}
    });
    return out;
  }
  function aggregateHardReasons(evaluations){
    const counts = new Map();
    evaluations.forEach(item => item.result.hardErrors.forEach(error => counts.set(error.message, (counts.get(error.message) || 0) + 1)));
    return Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).map(([message,count]) => `${message} ${count} คน`).join(' • ') || 'ไม่พบผู้สมัครที่ผ่าน Hard Validation';
  }
  function autoAssignRosterV271(){
    const stateRef = st();
    if (!stateRef) return;
    if (!stateRef.rosterDraft || stateRef.rosterDraft.monthKey !== stateRef.monthKey) {
      stateRef.rosterDraft = { monthKey:stateRef.monthKey, assignments:generateEmptyAssignments(stateRef.monthKey) };
    }
    const assignments = stateRef.rosterDraft.assignments || [];
    assignments.forEach(slot => { delete slot[SUGGESTION_FIELD]; delete slot[SUGGESTION_REASON]; });
    const working = assignments.map(slot => ({ ...slot }));
    const counts = fairnessCounts(working);
    const diagnostics = { suggested:0, vacant:0, warningOnly:0, details:[] };
    working.forEach((slot,index) => {
      const original = assignments[index];
      if (slot.staff_id || slot.is_locked) return;
      const evaluated = rosterRows().map(person => ({ person, result:evaluateCandidateV271(person,slot,working) }));
      const safe = evaluated.filter(item => item.result.ok && item.result.warnings.length === 0);
      safe.sort((a,b) => {
        const ca = counts[normId(a.person.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const cb = counts[normId(b.person.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const code = String(slot.duty_code || '');
        const family = dutyFamily(code);
        return ((ca.byCode[code] || 0) - (cb.byCode[code] || 0))
          || ((ca.byFamily[family] || 0) - (cb.byFamily[family] || 0))
          || (ca.weekend - cb.weekend)
          || (ca.total - cb.total)
          || staffName(a.person).localeCompare(staffName(b.person),'th');
      });
      const chosen = safe[0] || null;
      if (!chosen) {
        const warningOnly = evaluated.filter(item => item.result.ok && item.result.warnings.length);
        const reason = warningOnly.length
          ? `มีผู้สมัคร ${warningOnly.length} คน แต่ต้อง Manual Override: ${warningOnly.slice(0,3).map(item => `${staffName(item.person)} (${item.result.warnings.map(w => w.message).join(', ')})`).join(' • ')}`
          : aggregateHardReasons(evaluated);
        original[SUGGESTION_REASON] = reason;
        diagnostics.vacant++;
        if (warningOnly.length) diagnostics.warningOnly++;
        diagnostics.details.push({ duty_date:slot.duty_date, duty_code:slot.duty_code, reason });
        return;
      }
      original[SUGGESTION_FIELD] = chosen.person.id;
      original[SUGGESTION_REASON] = '';
      slot.staff_id = chosen.person.id;
      const sid = normId(chosen.person.id);
      const row = counts[sid] ||= { total:0, weekend:0, byCode:{}, byFamily:{} };
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      row.total++;
      row.byCode[code] = (row.byCode[code] || 0) + 1;
      row.byFamily[family] = (row.byFamily[family] || 0) + 1;
      try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) row.weekend++; } catch (_) {}
      diagnostics.suggested++;
    });
    stateRef.__lastAutoAssignDiagnosticsV271 = diagnostics;
    stateRef.rosterDraft = { monthKey:stateRef.monthKey, assignments };
    try { renderPage(); } catch (_) {}
    toast(`สร้างคำแนะนำที่ผ่าน Hard Validation และไม่มี Warning แล้ว ${diagnostics.suggested} ช่อง${diagnostics.vacant ? ` • ต้องตรวจเอง ${diagnostics.vacant} ช่อง` : ''} — ยังไม่ได้เปลี่ยนชื่อจริง`);
    console.info(`${VERSION}: Auto Assign diagnostics`, diagnostics);
  }

  /* ------------------------------------------------------------------
     Mentor/date-range management UI
     ------------------------------------------------------------------ */
  function selectedTraining(){
    const id = normId(st()?.editingTrainingIdV271);
    return trainingRows().find(row => normId(row.id) === id) || null;
  }
  function trainingFormHtml(){
    const edit = selectedTraining();
    const staff = staffRows().filter(person => String(person.staff_type || '').toUpperCase() === 'MT');
    const traineeId = normId(edit?.trainee_staff_id);
    const mentorId = normId(edit?.mentor_staff_id);
    const today = (() => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } })();
    const defaultEnd = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+6); return d.toISOString().slice(0,10); })();
    const warning = trainingSchemaReady === false ? '<div class="notice error-notice"><b>ต้องรัน SQL ก่อน:</b> เปิด Supabase SQL Editor แล้วรัน <code>supabase_v271_semi_manual_assistant.sql</code></div>' : '';
    return `<div class="v270-mentor-tab-body v271-training-body">
      ${warning}
      <div class="grid v271-training-layout">
        <div class="card">
          <div class="section-title"><div><h3>${edit ? 'แก้ไขช่วงพี่เลี้ยง' : 'เพิ่มช่วงพี่เลี้ยง'}</h3><p class="hint">กำหนดเป็นช่วงวันที่ น้องใหม่/Intern จะตามตำแหน่งพี่เลี้ยงและไม่นับ Slot เฉพาะช่วงนี้</p></div></div>
          <form id="v271TrainingForm" data-training-id="${esc(edit?.id || '')}" class="form-grid">
            <label>ประเภทผู้ฝึก
              <select name="trainee_type"><option value="new_staff" ${edit?.trainee_type!=='intern'?'selected':''}>น้องใหม่</option><option value="intern" ${edit?.trainee_type==='intern'?'selected':''}>Intern (เด็กฝึกงาน)</option></select>
            </label>
            <label>ผู้ฝึกที่มีรายชื่อในระบบ
              <select name="trainee_staff_id"><option value="">ใช้ชื่อผู้ฝึกภายนอกด้านล่าง</option>${staff.map(person => `<option value="${esc(person.id)}" ${normId(person.id)===traineeId?'selected':''}>${esc(staffName(person))}</option>`).join('')}</select>
            </label>
            <label>ชื่อผู้ฝึกภายนอก / เด็กฝึกงาน
              <input name="trainee_name" value="${esc(edit?.trainee_name || '')}" placeholder="กรอกเมื่อไม่มีรายชื่อในระบบ">
            </label>
            <label>พี่เลี้ยง
              <select name="mentor_staff_id" required><option value="">เลือกพี่เลี้ยง</option>${staff.map(person => `<option value="${esc(person.id)}" ${normId(person.id)===mentorId?'selected':''}>${esc(staffName(person))}</option>`).join('')}</select>
            </label>
            <label>เริ่มวันที่ <input type="date" name="start_date" value="${esc(edit?.start_date || today)}" required></label>
            <label>สิ้นสุดวันที่ <input type="date" name="end_date" value="${esc(edit?.end_date || defaultEnd)}" required></label>
            <label class="full-span">หมายเหตุ <input name="note" value="${esc(edit?.note || '')}" placeholder="เช่น ฝึก Blood Bank สัปดาห์ที่ 1"></label>
            <div class="actions full-span"><button class="primary-btn" type="submit">${edit ? 'บันทึกการแก้ไข' : 'เพิ่มช่วงพี่เลี้ยง'}</button>${edit ? '<button class="ghost-btn" type="button" data-v271-cancel-training-edit>ยกเลิกแก้ไข</button>' : ''}</div>
          </form>
          <div class="notice soft-notice compact"><b>กฎ Slot:</b> ผู้ฝึกจะไม่ถูกนำไปเลือกชุด Slot และจะไม่เพิ่มจำนวนตำแหน่ง หากพี่เลี้ยงไม่มีตำแหน่ง ระบบแสดง “รอกำหนดพี่เลี้ยง/ตำแหน่ง”</div>
        </div>
        <div class="card">
          <div class="section-title"><h3>รายการตามช่วงวันที่</h3><span class="badge blue">${trainingRows().length} รายการ</span></div>
          ${trainingRows().length ? `<div class="table-wrap"><table class="v271-training-table"><thead><tr><th>ผู้ฝึก</th><th>ประเภท</th><th>พี่เลี้ยง</th><th>ช่วงวันที่</th><th>สถานะ</th><th></th></tr></thead><tbody>${trainingRows().map(row => {
            const nowActive = activeTrainingOn(row,today);
            return `<tr><td><b>${esc(trainingName(row))}</b>${row.note?`<br><small>${esc(row.note)}</small>`:''}</td><td>${esc(trainingTypeLabel(row.trainee_type))}</td><td>${esc(staffName(row.mentor_staff_id))}</td><td>${esc(normDate(row.start_date))}<br>ถึง ${esc(normDate(row.end_date))}</td><td>${row.active===false?'<span class="badge gray">ยกเลิก</span>':nowActive?'<span class="badge green">กำลังใช้งาน</span>':'<span class="badge blue">ตามช่วงวันที่</span>'}</td><td><div class="actions"><button class="tiny-btn" type="button" data-v271-edit-training="${esc(row.id)}">แก้ไข</button>${row.active!==false?`<button class="tiny-btn danger" type="button" data-v271-deactivate-training="${esc(row.id)}">ยกเลิก</button>`:''}</div></td></tr>`;
          }).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีช่วงพี่เลี้ยง</div>'}
        </div>
      </div>
    </div>`;
  }
  function mentorTabIsActive(){
    const button = document.querySelector('[data-v270-position-tab="mentors"]');
    return !!button?.classList.contains('active') || st()?.positionManagementSubtabV270 === 'mentors';
  }
  function decorateTrainingManagement(){
    if (st()?.page !== 'positionManagement') return;
    const tab = document.querySelector('[data-v270-position-tab="mentors"]');
    if (tab) {
      const desired = '<b>พี่เลี้ยง–น้องใหม่ / Intern</b><small>กำหนดช่วงวันที่และไม่นับ Slot</small>';
      if (tab.innerHTML !== desired) tab.innerHTML = desired;
    }
    if (!mentorTabIsActive()) return;
    const page = document.querySelector('.v244-position-management-page');
    if (!page) return;
    const old = page.querySelector(':scope > .v270-mentor-tab-body, :scope > .v271-training-body');
    if (old?.classList.contains('v271-training-body')) return;
    if (old) old.remove();
    page.insertAdjacentHTML('beforeend', trainingFormHtml());
  }
  async function saveTrainingForm(form){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const db = client();
    if (!db) return toast('ไม่พบ Supabase client', 'error');
    const fd = new FormData(form);
    const traineeStaffId = normId(fd.get('trainee_staff_id')) || null;
    const traineeName = String(fd.get('trainee_name') || '').trim() || null;
    const mentorStaffId = normId(fd.get('mentor_staff_id'));
    const startDate = normDate(fd.get('start_date'));
    const endDate = normDate(fd.get('end_date'));
    if (!traineeStaffId && !traineeName) return toast('กรุณาเลือกผู้ฝึกหรือกรอกชื่อผู้ฝึกภายนอก', 'error');
    if (!mentorStaffId) return toast('กรุณาเลือกพี่เลี้ยง', 'error');
    if (traineeStaffId && traineeStaffId === mentorStaffId) return toast('ผู้ฝึกและพี่เลี้ยงต้องเป็นคนละคน', 'error');
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return toast('ช่วงวันที่ไม่ถูกต้อง', 'error');
    const payload = {
      trainee_staff_id:traineeStaffId,
      trainee_name:traineeName,
      mentor_staff_id:mentorStaffId,
      trainee_type:String(fd.get('trainee_type') || 'new_staff'),
      start_date:startDate,
      end_date:endDate,
      active:true,
      note:String(fd.get('note') || '').trim() || null,
      updated_by:currentStaff(),
      updated_at:new Date().toISOString()
    };
    const id = normId(form.dataset.trainingId);
    const result = id
      ? await db.from(TRAINING_TABLE).update(payload).eq('id',id).select('*').maybeSingle()
      : await db.from(TRAINING_TABLE).insert({ ...payload, created_by:currentStaff() }).select('*').maybeSingle();
    if (result.error) return toast(`บันทึกช่วงพี่เลี้ยงไม่สำเร็จ: ${friendly(result.error)}`, 'error');
    trainingSchemaReady = true;
    st().editingTrainingIdV271 = null;
    await loadTrainingAssignments({ force:true });
    decorateTrainingManagementForce();
    toast('บันทึกช่วงพี่เลี้ยงแล้ว ผู้ฝึกจะตามตำแหน่งเฉพาะช่วงวันที่และไม่นับ Slot');
  }
  async function deactivateTraining(id){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const result = await client().from(TRAINING_TABLE).update({ active:false, updated_by:currentStaff(), updated_at:new Date().toISOString() }).eq('id',id);
    if (result.error) return toast(`ยกเลิกรายการไม่สำเร็จ: ${friendly(result.error)}`, 'error');
    await loadTrainingAssignments({ force:true });
    decorateTrainingManagementForce();
    toast('ยกเลิกช่วงพี่เลี้ยงแล้ว');
  }
  function decorateTrainingManagementForce(){
    const old = document.querySelector('.v271-training-body, .v270-mentor-tab-body');
    if (old) old.remove();
    decorateTrainingManagement();
  }

  /* ------------------------------------------------------------------
     Day/month position display and summary
     ------------------------------------------------------------------ */
  function trainingStatusForDate(assignment,date,rows){
    const mentorRow = (rows || []).find(row => normDate(row?.work_date) === normDate(date) && normId(row?.staff_id) === normId(assignment.mentor_staff_id));
    if (!mentorRow) return 'รอกำหนดพี่เลี้ยง/ตำแหน่ง';
    if (!traineeAvailable(assignment,date)) return 'ผู้ฝึกลา/ไม่พร้อมทำงาน';
    return mentorRow.position_code || mentorRow.code || 'รอกำหนดตำแหน่ง';
  }
  function dailyTrainingSummary(date,rows){
    const pairs = trainingForDate(date);
    if (!pairs.length) return '';
    return `<div class="card v271-daily-training-summary"><div class="section-title"><h3>พี่เลี้ยง–ผู้ฝึกวันนี้</h3><span class="badge orange">ผู้ฝึกไม่นับ Slot</span></div><div class="v271-training-chips">${pairs.map(pair => `<span class="v271-training-chip"><b>${esc(trainingName(pair))}</b> (${esc(trainingTypeLabel(pair.trainee_type))}) → ${esc(staffName(pair.mentor_staff_id))}<small>${esc(trainingStatusForDate(pair,date,rows))}</small></span>`).join('')}</div></div>`;
  }

  function positionCountsForMonth(person, monthKey){
    const rows = (st()?.positions || []).filter(row => normId(row?.staff_id) === normId(person.id) && normDate(row?.work_date).startsWith(monthKey) && !isTrainingPersonOnDate(person.id,row.work_date));
    return {
      bb:rows.filter(row => /blood bank|manual/i.test(String(row.zone || '')) || /^BB-/i.test(String(row.position_code || ''))).length,
      donor:rows.filter(row => /donor/i.test(String(row.zone || '')) || /^DR-/i.test(String(row.position_code || ''))).length
    };
  }
  function leaveDaysForMonth(person, monthKey){
    if (!person?.id || !/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return 0;
    const first = `${monthKey}-01`;
    const last = new Date(Date.UTC(Number(monthKey.slice(0,4)), Number(monthKey.slice(5,7)), 0)).toISOString().slice(0,10);
    const days = new Set();
    (st()?.leaves || []).forEach(row => {
      if (normId(row?.staff_id) !== normId(person.id)) return;
      try { if (typeof isLeaveEffective === 'function' && !isLeaveEffective(row)) return; } catch (_) {}
      try { if (typeof isNoDutyLeaveType === 'function' && isNoDutyLeaveType(row)) return; } catch (_) { if (String(row?.type || row?.leave_type || '').split(':::')[0].trim() === 'ไม่รับเวร') return; }
      const start = normDate(row?.start_date || row?.date || row?.work_date);
      const end = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      if (!validDate(start) || !validDate(end) || start > last || end < first) return;
      const from = new Date(`${start < first ? first : start}T00:00:00Z`);
      const to = new Date(`${end > last ? last : end}T00:00:00Z`);
      for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate()+1)) days.add(d.toISOString().slice(0,10));
    });
    return days.size;
  }
  function detailedRosterSummaryHtml(){
    const assignments = monthAssignments();
    const monthKey = String(st()?.monthKey || '');
    const rows = rosterRows().map(person => {
      const own = assignments.filter(slot => normId(slot?.staff_id) === normId(person.id));
      const count = prefix => own.filter(slot => String(slot.duty_code || '').startsWith(prefix)).length;
      const warnings = own.filter(slot => evaluateCandidateV271(person,slot,assignments).warnings.length > 0).length;
      const position = positionCountsForMonth(person,monthKey);
      const eligible = (st()?.positionEligibility || []).filter(row => normId(row?.staff_id) === normId(person.id) && bool(row.is_eligible)).length;
      const trainees = trainingRows().filter(row => normId(row.mentor_staff_id) === normId(person.id) && trainingOverlapsMonth(row,monthKey)).map(trainingName);
      let holiday = 0;
      own.forEach(slot => { try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) holiday++; } catch (_) {} });
      return { person, own, chbd:count('ชบด'), ch4:count('ช4'), ch3a:own.filter(s=>s.duty_code==='ช3A').length, ch3b:own.filter(s=>s.duty_code==='ช3B').length, ch9:count('ช9'), holiday, leaveDays:leaveDaysForMonth(person,monthKey), warnings, bb:position.bb, donor:position.donor, eligible, trainees };
    });
    return `<div class="card v271-detailed-summary"><div class="section-title"><div><h3>ตารางสรุปเพื่อช่วยตัดสินใจ</h3><p class="hint">คลิกชื่อเพื่อดูเวรทั้งหมด สิทธิ์ที่ทำได้ และแก้ไขรายช่อง ระบบแสดงข้อมูลเพื่อให้ Admin ตัดสินใจเอง</p></div><span class="badge blue">${esc(monthKey)}</span></div><div class="table-wrap"><table><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>ชบด</th><th>ช4</th><th>ช3A</th><th>ช3B</th><th>ช9</th><th>เวรวันหยุด</th><th>วันลา</th><th>BB</th><th>Donor</th><th>สิทธิ์</th><th>Warning</th><th>ผู้ฝึกที่ติดตาม</th></tr></thead><tbody>${rows.map(row => `<tr><td><button type="button" class="link-btn" data-v271-summary-staff="${esc(row.person.id)}"><b>${esc(staffName(row.person))}</b></button></td><td>${row.own.length}</td><td>${row.chbd}</td><td>${row.ch4}</td><td>${row.ch3a}</td><td>${row.ch3b}</td><td>${row.ch9}</td><td>${row.holiday}</td><td>${row.leaveDays}</td><td>${row.bb}</td><td>${row.donor}</td><td>${row.eligible}</td><td>${row.warnings ? `<span class="badge orange">${row.warnings}</span>` : '<span class="badge green">0</span>'}</td><td>${row.trainees.length ? esc(row.trainees.join(', ')) : '-'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function showStaffSummary(staffId){
    const person = staffById(staffId);
    const assignments = monthAssignments();
    const own = assignments.filter(slot => normId(slot.staff_id) === normId(staffId)).sort((a,b) => normDate(a.duty_date).localeCompare(normDate(b.duty_date)));
    const eligibleCodes = (st()?.positionEligibility || []).filter(row => normId(row?.staff_id) === normId(staffId) && bool(row.is_eligible)).map(row => String(row.position_code || '')).filter(Boolean).sort((a,b)=>a.localeCompare(b,'th'));
    const html = `<h2>รายละเอียดเวรของ ${esc(staffName(person))}</h2><p class="hint">${esc(st()?.monthKey || '')} • คลิก “แก้ไข” เพื่อเปิด Candidate Debug Mode</p><div class="notice soft-notice compact"><b>สิทธิ์ที่ทำได้ ${eligibleCodes.length} รายการ:</b> ${eligibleCodes.length ? esc(eligibleCodes.join(', ')) : 'ยังไม่ได้กำหนดสิทธิ์'}</div>${own.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>สถานะ</th><th></th></tr></thead><tbody>${own.map(slot => {
      const result = evaluateCandidateV271(person,slot,assignments);
      return `<tr><td>${esc(normDate(slot.duty_date))}</td><td>${esc(dutyLabel(slot.duty_code))}</td><td>${result.hardErrors.length?`<span class="badge red">บล็อก ${result.hardErrors.length}</span>`:result.warnings.length?`<span class="badge orange">เตือน ${result.warnings.length}</span>`:'<span class="badge green">ผ่าน</span>'}</td><td><button class="tiny-btn" type="button" data-v271-edit-summary-slot="${esc(slotId(slot))}">แก้ไข</button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีเวรในเดือนนี้</div>'}`;
    showModal(html);
  }

  /* ------------------------------------------------------------------
     Wrappers loaded after V270
     ------------------------------------------------------------------ */
  try {
    const previousLoad = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
    if (previousLoad && !previousLoad.__v271TrainingLoad) {
      const wrapped = async function loadAllDataV271(){
        const result = await previousLoad.apply(this,arguments);
        await loadTrainingAssignments({ force:true });
        return result;
      };
      wrapped.__v271TrainingLoad = true;
      assignGlobal('loadAllData',wrapped);
    }
  } catch (_) {}

  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v271TrainingRange) {
      const wrapped = function buildMonthlyPositionDraftV271(){
        const draft = previousBuild.apply(this,arguments);
        if (draft && Array.isArray(draft.rows)) {
          draft.rows = pairTrainingRows(draft.rows);
          draft.trainingPairingV271 = true;
        }
        return draft;
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('buildMonthlyPositionDraft',wrapped);
    }
  } catch (_) {}

  try {
    const previousMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
    if (previousMatrix && !previousMatrix.__v271TrainingRange) {
      const wrapped = function renderMonthPositionMatrixV271(rows,dates){
        const paired = pairTrainingRows(Array.isArray(rows)?rows:[]);
        let html = String(previousMatrix.call(this,paired,dates) || '');
        const ids = new Set(trainingRows().filter(row => row.trainee_staff_id && (dates || []).some(date => activeTrainingOn(row,date))).map(row => normId(row.trainee_staff_id)));
        ids.forEach(id => {
          const name = esc(staffName(id)).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          html = html.replace(new RegExp(`(<div class="matrix-staff-name"><b>${name}<\\/b><small>)(.*?)(<\\/small>)`), '$1$2 • ผู้ฝึก (ไม่นับ Slot)$3');
        });
        return html;
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('renderMonthPositionMatrix',wrapped);
    }
  } catch (_) {}

  try {
    const previousDaily = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (previousDaily && !previousDaily.__v271TrainingRange) {
      const wrapped = function renderPositionsPageV271(){
        const stateRef = st();
        const date = normDate(document.getElementById('positionDateInput')?.value || stateRef?.positionDate || '');
        const oldRows = stateRef?.positions;
        const activeIds = new Set(trainingForDate(date).map(row => normId(row.trainee_staff_id)).filter(Boolean));
        if (stateRef && Array.isArray(oldRows)) stateRef.positions = oldRows.filter(row => normDate(row?.work_date) !== date || !activeIds.has(normId(row?.staff_id)));
        try {
          let html = String(previousDaily.apply(this,arguments) || '');
          html += dailyTrainingSummary(date,Array.isArray(oldRows)?oldRows:[]);
          return html;
        } finally { if (stateRef) stateRef.positions = oldRows; }
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('renderPositionsPage',wrapped);
    }
  } catch (_) {}

  try {
    const previousSavePositions = window.savePositions || (typeof savePositions === 'function' ? savePositions : null);
    if (previousSavePositions && !previousSavePositions.__v271TrainingRange) {
      const wrapped = async function savePositionsV271(){
        const date = document.getElementById('positionDateInput')?.value || st()?.positionDate;
        const result = await previousSavePositions.apply(this,arguments);
        try {
          await syncTrainingPairsForDate(date);
          await loadAllData();
          renderPage();
        } catch (error) { toast(`บันทึกตำแหน่งหลักแล้ว แต่ซิงก์ผู้ฝึกไม่สำเร็จ: ${friendly(error)}`, 'error'); }
        return result;
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('savePositions',wrapped);
    }
  } catch (_) {}

  try {
    const previousScheduler = window.renderSchedulerPage || (typeof renderSchedulerPage === 'function' ? renderSchedulerPage : null);
    if (previousScheduler && !previousScheduler.__v271DetailedSummary) {
      const wrapped = function renderSchedulerPageV271(){
        let html = String(previousScheduler.apply(this,arguments) || '');
        if (!html.includes('v271-detailed-summary')) html = html.replace(/<\/div>\s*$/, `${detailedRosterSummaryHtml()}</div>`);
        return html;
      };
      wrapped.__v271DetailedSummary = true;
      assignGlobal('renderSchedulerPage',wrapped);
    }
  } catch (_) {}

  assignGlobal('autoAssignRoster',autoAssignRosterV271);
  assignGlobal('canStaffWorkSlot',canStaffWorkSlotV271);
  if (window.cnmiV266) {
    window.cnmiV266.evaluateRosterCandidateV266 = evaluateCandidateV271;
    window.cnmiV266.filterEligibleStaffBeforeAutoAssignV266 = filterCandidatesV271;
    window.cnmiV266.isRestrictedDutyV271 = code => RESTRICTED.has(String(code || '').trim());
  }

  try {
    const previousRender = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRender && !previousRender.__v271Decorated) {
      const wrapped = function renderPageV271(){
        const result = previousRender.apply(this,arguments);
        setTimeout(decoratePermissionAutosave,40);
        setTimeout(decorateTrainingManagement,50);
        setTimeout(decoratePermissionAutosave,140);
        setTimeout(decorateTrainingManagement,150);
        return result;
      };
      wrapped.__v271Decorated = true;
      assignGlobal('renderPage',wrapped);
    }
  } catch (_) {}

  /* ------------------------------------------------------------------
     Event interception
     ------------------------------------------------------------------ */
  window.addEventListener('change',function(event){
    const permission = event.target?.closest?.('input[data-eligibility]');
    if (permission) {
      const previous = !permission.checked;
      permission.closest('.position-check')?.classList.toggle('checked',permission.checked);
      setPermissionLocal(permission.dataset.staffId,permission.dataset.positionCode,permission.checked);
      schedulePermissionSave(permission,previous);
      return;
    }
    if (event.target?.id === 'v271CandidateSelect') updateCandidateModalSelection();
  },true);

  window.addEventListener('drop',function(event){
    const slotEl = event.target?.closest?.('[data-drop-slot]');
    if (!slotEl) return;
    const target = monthAssignments().find(row => slotId(row) === String(slotEl.dataset.dropSlot || ''));
    if (!target) return;
    const sourceSlotId = event.dataTransfer?.getData('sourceSlotId');
    if (sourceSlotId) {
      const source = monthAssignments().find(row => slotId(row) === String(sourceSlotId));
      if (!source || source.is_locked || target.is_locked) return;
      const test = monthAssignments().map(row => ({ ...row }));
      const src = test.find(row => slotId(row) === String(sourceSlotId));
      const dst = test.find(row => slotId(row) === String(slotEl.dataset.dropSlot || ''));
      if (!src || !dst) return;
      const a = src.staff_id || null, b = dst.staff_id || null;
      src.staff_id = b; dst.staff_id = a;
      const checks = [];
      if (a) checks.push(evaluateCandidateV271(staffById(a),dst,test));
      if (b) checks.push(evaluateCandidateV271(staffById(b),src,test));
      const hard = checks.flatMap(result => result.hardErrors || []);
      const warnings = checks.flatMap(result => result.warnings || []);
      if (hard.length || warnings.length) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
        toast(hard.length ? `สลับไม่ได้: ${hard.map(item=>item.message).join(' • ')}` : 'การสลับนี้มีคำเตือน กรุณาใช้ปุ่ม “เลือกคน” และ Force Assign ทีละช่องเพื่อเก็บ Audit Log', hard.length ? 'error' : undefined);
      }
      return;
    }
    const staffId = event.dataTransfer?.getData('staffId');
    if (!staffId) return;
    const result = evaluateCandidateV271(staffById(staffId),target,monthAssignments());
    if (result.hardErrors.length) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      toast(`จัดไม่ได้: ${result.hardErrors.map(item=>item.message).join(' • ')}`,'error');
      return;
    }
    if (result.warnings.length) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      showCandidateModal(target,staffId);
      toast('รายการนี้มีคำเตือน กรุณาตรวจสอบเหตุผลและใช้ Force Assign');
    }
  },true);

  window.addEventListener('click',function(event){
    const retryStatus = event.target?.closest?.('.v271-permission-save-state[data-status="error"]');
    if (retryStatus) {
      event.preventDefault(); event.stopPropagation();
      const input = retryStatus.closest('.position-check')?.querySelector('input[data-eligibility]');
      if (input) {
        const key = permissionKey(input.dataset.staffId,input.dataset.positionCode);
        const previous = permissionConfirmed.get(key) ?? !!input.checked;
        const desired = permissionFailedDesired.has(key) ? permissionFailedDesired.get(key) : !!input.checked;
        input.checked = !!desired;
        input.closest('.position-check')?.classList.toggle('checked',!!desired);
        setPermissionLocal(input.dataset.staffId,input.dataset.positionCode,!!desired);
        schedulePermissionSave(input,previous);
      }
      return;
    }
    const editRoster = event.target?.closest?.('[data-edit-roster-slot-v213]');
    if (editRoster) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      const slot = monthAssignments().find(row => slotId(row) === String(editRoster.dataset.editRosterSlotV213 || ''));
      showCandidateModal(slot);
      return;
    }
    const savePermissions = event.target?.closest?.('[data-save-position-eligibility]');
    if (savePermissions) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveAllVisiblePermissions();
      return;
    }
    const editTraining = event.target?.closest?.('[data-v271-edit-training]');
    if (editTraining) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      st().editingTrainingIdV271 = editTraining.dataset.v271EditTraining;
      decorateTrainingManagementForce();
      return;
    }
    const deactivate = event.target?.closest?.('[data-v271-deactivate-training]');
    if (deactivate) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      deactivateTraining(deactivate.dataset.v271DeactivateTraining);
      return;
    }
    if (event.target?.closest?.('[data-v271-cancel-training-edit]')) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      st().editingTrainingIdV271 = null;
      decorateTrainingManagementForce();
      return;
    }
    const summary = event.target?.closest?.('[data-v271-summary-staff]');
    if (summary) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      showStaffSummary(summary.dataset.v271SummaryStaff);
      return;
    }
    const editSummary = event.target?.closest?.('[data-v271-edit-summary-slot]');
    if (editSummary) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      try { closeModal(); } catch (_) {}
      const slot = monthAssignments().find(row => slotId(row) === String(editSummary.dataset.v271EditSummarySlot || ''));
      setTimeout(() => showCandidateModal(slot),20);
    }
  },true);

  window.addEventListener('submit',function(event){
    if (event.target?.id === 'v271RosterCandidateForm') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      submitCandidateForm(event);
      return;
    }
    if (event.target?.id === 'v271TrainingForm') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveTrainingForm(event.target);
    }
  },true);

  const style = document.createElement('style');
  style.id = 'cnmi-v271-style';
  style.textContent = `
    .v271-permission-save-state{display:block;margin-top:4px;font-style:normal;font-size:10px;font-weight:600}
    .v271-permission-save-state[data-status="saving"]{color:#1d4ed8}.v271-permission-save-state[data-status="saved"]{color:#15803d}.v271-permission-save-state[data-status="error"]{color:#b91c1c;cursor:pointer}
    .v271-autosave-badge{margin-left:auto}.v271-candidate-diagnostics{display:grid;gap:4px;margin-top:4px}
    .v271-diagnostic{padding:6px 8px;border-radius:8px;font-size:12px}.v271-diagnostic.hard{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.v271-diagnostic.warning{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.v271-diagnostic.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
    .v271-debug-list{border:1px solid #dbeafe;border-radius:10px;padding:8px}.v271-debug-list summary{cursor:pointer;font-weight:700}.v271-debug-rows{display:grid;gap:7px;margin-top:8px;max-height:320px;overflow:auto}.v271-debug-row{padding:8px;border:1px solid #e5e7eb;border-radius:10px}.v271-debug-row.hard{opacity:.78}.v271-candidate-actions{display:flex;gap:8px;flex-wrap:wrap}.warn-btn{border:0;border-radius:10px;padding:10px 14px;background:#f59e0b;color:#fff;font-weight:700;cursor:pointer}
    .v271-training-layout{grid-template-columns:minmax(330px,.9fr) minmax(520px,1.2fr)}.v271-training-body code{background:#eff6ff;border-radius:6px;padding:2px 5px;color:#1d4ed8}.v271-training-table{min-width:760px}.full-span{grid-column:1/-1}
    .v271-training-chips{display:flex;gap:8px;flex-wrap:wrap}.v271-training-chip{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px}.v271-training-chip small{color:#475569}
    .v271-detailed-summary{margin-top:14px}.v271-detailed-summary table{min-width:1150px}.v271-detailed-summary th,.v271-detailed-summary td{text-align:center}.v271-detailed-summary th:first-child,.v271-detailed-summary td:first-child{text-align:left}.link-btn{background:none;border:0;padding:0;color:#0369a1;cursor:pointer;font:inherit;text-decoration:underline}
    @media(max-width:900px){.v271-training-layout{grid-template-columns:1fr}.v271-autosave-badge{width:100%;margin-left:0}.v271-candidate-actions>*{width:100%}}
  `;
  document.head.appendChild(style);

  try {
    const observer = new MutationObserver(() => {
      decoratePermissionAutosave();
      decorateTrainingManagement();
    });
    observer.observe(document.body,{ childList:true,subtree:true });
  } catch (_) {}

  const stateRef = st();
  if (stateRef && !Array.isArray(stateRef.trainingAssignmentsV271)) stateRef.trainingAssignmentsV271 = [];
  window.cnmiV271 = {
    usesDateRangeMentorship:true,
    excludeFromDaySlot,
    trainingForDate,
    isTrainingPersonOnDate,
    pairTrainingRows,
    syncTrainingPairsForDate,
    loadTrainingAssignments,
    evaluateCandidateV271,
    filterCandidatesV271,
    autoAssignRosterV271,
    showCandidateModal,
    decoratePermissionAutosave,
    decorateTrainingManagement,
    persistPermissionRow,
    writeOverrideAudit
  };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v271-semi-manual-assistant-hardening.js", error); }
;

/* Original source: patch-v272-weekly-inline-training.js */
try {
/* CNMI Staff Planner V272 - Weekly Inline Mentor Assignment
   - Admin assigns new staff / Intern mentors directly in the monthly daytime-position table.
   - One assignment covers Monday-Friday of the selected week.
   - Trainees inherit the mentor's daytime position and never consume a main Slot.
   - A missing/unavailable mentor can be replaced for one specific day.
   - The former mentor page is history/edit-only by default.
*/
(function(){
  'use strict';
  const VERSION = 'V272_WEEKLY_INLINE_TRAINING';
  if (window.__CNMI_V272_WEEKLY_INLINE_TRAINING__) return;
  window.__CNMI_V272_WEEKLY_INLINE_TRAINING__ = true;

  const TABLE = 'staff_training_assignments';
  const RPC = 'replace_staff_training_range_v272';
  const expandedStaff = new Set();
  let saving = false;

  function st(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function db(){ try { return sb || window.sb || null; } catch (_) { return window.sb || null; } }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function toast(message,tone){
    try { showToast(message,tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function assignGlobal(name,value){
    try { window[name] = value; } catch (_) {}
    try { (0,eval)(`${name}=window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return String(st()?.profile?.role || '').toLowerCase() === 'admin'; }
  }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return st()?.profile?.id || null; }
  }
  function normId(value){ return String(value == null ? '' : value); }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0,10); }
  }
  function validDate(value){ return /^\d{4}-\d{2}-\d{2}$/.test(normDate(value)); }
  function addDays(value,amount){
    const d = new Date(`${normDate(value)}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + Number(amount || 0));
    return d.toISOString().slice(0,10);
  }
  function weekBounds(value){
    const d = new Date(`${normDate(value)}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return { start:'', end:'' };
    const day = d.getUTCDay();
    const back = day === 0 ? 6 : day - 1;
    const start = addDays(normDate(value),-back);
    return { start, end:addDays(start,4) };
  }
  function dateLabel(value){
    const d = new Date(`${normDate(value)}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return normDate(value);
    return d.toLocaleDateString('th-TH',{ day:'numeric', month:'short' });
  }
  function trainingRows(){ return Array.isArray(st()?.trainingAssignmentsV271) ? st().trainingAssignmentsV271 : []; }
  function activeOn(row,date){
    const d = normDate(date);
    return !!row && row.active !== false && validDate(d) && normDate(row.start_date) <= d && d <= normDate(row.end_date);
  }
  function identityMatches(row,staffId,traineeName){
    const sid = normId(staffId);
    if (sid) return normId(row?.trainee_staff_id) === sid;
    const name = String(traineeName || '').trim().toLowerCase();
    return !row?.trainee_staff_id && String(row?.trainee_name || '').trim().toLowerCase() === name;
  }
  function assignmentsForIdentity(staffId,traineeName){ return trainingRows().filter(row => identityMatches(row,staffId,traineeName)); }
  function assignmentForDate(staffId,traineeName,date){ return assignmentsForIdentity(staffId,traineeName).find(row => activeOn(row,date)) || null; }
  function isTrainingPersonOnDate(staffId,date){ return !!normId(staffId) && !!assignmentForDate(staffId,'',date); }
  function trainingName(row){
    if (row?.trainee_staff_id) return staffName(row.trainee_staff_id);
    return row?.trainee_name || '-';
  }
  function typeLabel(type){ return type === 'intern' ? 'Intern' : 'น้องใหม่'; }
  function staffById(id){ return (st()?.staff || []).find(person => normId(person?.id) === normId(id)) || null; }
  function staffName(personOrId){
    const person = typeof personOrId === 'object' ? personOrId : staffById(personOrId);
    return person ? (person.nickname || person.full_name || person.email || '-') : '-';
  }
  function activeStaff(){
    const rows = (st()?.staff || []).filter(person => person && person.is_active !== false && person.active !== false);
    try { return orderedStaff(rows); } catch (_) { return rows; }
  }
  function knownTrainee(person,dates){
    if (!person?.id) return false;
    const sid = normId(person.id);
    if (expandedStaff.has(sid)) return true;
    if (person.is_trainee === true || person.is_intern === true) return true;
    if (/น้องใหม่|เด็กฝึกงาน|intern|trainee|probation/i.test(String(person.position_training_status || person.training_status || ''))) return true;
    return assignmentsForIdentity(sid,'').some(row => (dates || []).some(date => activeOn(row,date)));
  }
  function mentorAvailable(mentorId,date){
    const person = staffById(mentorId);
    if (!person) return false;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(person,normDate(date),'day_position');
      if (result) return !!result.available;
    } catch (_) {}
    try { return !window.cnmiV265?.unavailableRecord?.(mentorId,normDate(date)); }
    catch (_) { return true; }
  }
  function traineeAvailable(staffId,date){
    if (!staffId) return true;
    const person = staffById(staffId);
    if (!person) return true;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(person,normDate(date),'day_position');
      return !result || !!result.available;
    } catch (_) { return true; }
  }
  function noPositionDay(date){
    try { return !!isNoPositionDay(normDate(date)); }
    catch (_) {
      try { return !!isWeekend(normDate(date)) || !!isHolidayDate(normDate(date)); }
      catch (_) { return false; }
    }
  }
  function hasOutingSafe(date){ try { return !!hasOuting(normDate(date)); } catch (_) { return false; } }
  function codeOf(row){ return String(row?.position_code || row?.code || '').trim(); }
  function monthWeeks(dates){
    const map = new Map();
    (dates || []).forEach(date => {
      const b = weekBounds(date);
      if (!b.start) return;
      if (!map.has(b.start)) map.set(b.start,{ start:b.start,end:b.end,dates:[] });
      map.get(b.start).dates.push(normDate(date));
    });
    return Array.from(map.values()).sort((a,b) => a.start.localeCompare(b.start)).map((row,index) => ({ ...row,index:index+1 }));
  }
  function dominantWeekAssignment(staffId,traineeName,week){
    const weekdays = Array.from({length:5},(_,i) => addDays(week.start,i));
    const rows = weekdays.map(date => assignmentForDate(staffId,traineeName,date)).filter(Boolean);
    if (!rows.length) return { row:null,mixed:false };
    const groups = new Map();
    rows.forEach(row => {
      const key = `${row.trainee_type || 'new_staff'}|${normId(row.mentor_staff_id)}`;
      const entry = groups.get(key) || { row,count:0 };
      entry.count += 1;
      groups.set(key,entry);
    });
    const sorted = Array.from(groups.values()).sort((a,b) => b.count-a.count);
    return { row:sorted[0]?.row || rows[0],mixed:groups.size>1 };
  }
  function weekControlHtml(staffId,traineeName,week){
    const current = dominantWeekAssignment(staffId,traineeName,week);
    const row = current.row;
    const type = row?.trainee_type || '';
    const mentorId = normId(row?.mentor_staff_id);
    const mentors = activeStaff().filter(person => normId(person.id) !== normId(staffId));
    const identityAttrs = staffId
      ? `data-trainee-staff-id="${esc(staffId)}"`
      : `data-trainee-name="${esc(traineeName)}"`;
    return `<div class="v272-week-card ${row?'active':''}" data-v272-week-card>
      <div class="v272-week-title"><b>สัปดาห์ ${week.index}</b><small>${esc(dateLabel(week.start))}–${esc(dateLabel(week.end))}</small></div>
      <select data-v272-training-type aria-label="ประเภทผู้ฝึก">
        <option value="" ${!type?'selected':''}>ไม่เป็นผู้ฝึก</option>
        <option value="new_staff" ${type==='new_staff'?'selected':''}>น้องใหม่</option>
        <option value="intern" ${type==='intern'?'selected':''}>Intern</option>
      </select>
      <select data-v272-week-mentor aria-label="พี่เลี้ยง" ${!type?'disabled':''}>
        <option value="">เลือกพี่เลี้ยง</option>
        ${mentors.map(person => `<option value="${esc(person.id)}" ${mentorId===normId(person.id)?'selected':''}>${esc(staffName(person))}</option>`).join('')}
      </select>
      ${current.mixed?'<small class="v272-mixed-note">มีพี่เลี้ยงแทนบางวัน</small>':''}
      <button type="button" class="tiny-btn" data-v272-save-week ${identityAttrs} data-week-start="${esc(week.start)}" data-week-end="${esc(week.end)}">บันทึกสัปดาห์</button>
      <small class="v272-save-state" aria-live="polite"></small>
    </div>`;
  }
  function mentorSummaryForPerson(person,dates){
    const names = new Set();
    trainingRows().forEach(row => {
      if (normId(row.mentor_staff_id) !== normId(person?.id)) return;
      if ((dates || []).some(date => activeOn(row,date))) names.add(trainingName(row));
    });
    return Array.from(names);
  }
  function mentorControlCell(person,dates){
    const sid = normId(person?.id);
    const weeks = monthWeeks(dates);
    if (knownTrainee(person,dates)) {
      return `<td class="v272-mentor-week-cell"><div class="v272-week-controls">${weeks.map(week => weekControlHtml(sid,'',week)).join('')}</div></td>`;
    }
    const mentees = mentorSummaryForPerson(person,dates);
    return `<td class="v272-mentor-week-cell v272-regular-staff-cell">
      ${mentees.length?`<div class="v272-mentor-of"><b>เป็นพี่เลี้ยงให้</b><small>${esc(mentees.join(', '))}</small></div>`:''}
      ${isAdminSafe()?`<button type="button" class="tiny-btn ghost" data-v272-expand-training="${esc(sid)}">กำหนดเป็นน้องใหม่/Intern</button>`:'-'}
    </td>`;
  }
  function externalControlCell(name,dates){
    return `<td class="v272-mentor-week-cell"><div class="v272-week-controls">${monthWeeks(dates).map(week => weekControlHtml('',name,week)).join('')}</div></td>`;
  }
  function operationalRows(rows){
    return (Array.isArray(rows)?rows:[]).filter(row => !isTrainingPersonOnDate(row?.staff_id,row?.work_date));
  }
  function mentorRowForDate(rows,mentorId,date){
    return (rows || []).find(row => normId(row?.staff_id) === normId(mentorId) && normDate(row?.work_date) === normDate(date) && codeOf(row) && codeOf(row) !== 'รอตรวจสอบ') || null;
  }
  function substituteOptions(rows,date,assignment){
    const seen = new Set();
    return (rows || []).filter(row => normDate(row?.work_date) === normDate(date) && codeOf(row) && codeOf(row) !== 'รอตรวจสอบ')
      .map(row => staffById(row.staff_id)).filter(Boolean)
      .filter(person => {
        const sid = normId(person.id);
        if (!sid || seen.has(sid) || sid === normId(assignment?.trainee_staff_id) || isTrainingPersonOnDate(sid,date) || !mentorAvailable(sid,date)) return false;
        seen.add(sid); return true;
      });
  }
  function followCellHtml(assignment,date,rows){
    const traineeId = normId(assignment?.trainee_staff_id);
    if (traineeId && !traineeAvailable(traineeId,date)) {
      return `<div class="v272-follow-status unavailable"><b>${esc(typeLabel(assignment.trainee_type))}</b><span>ผู้ฝึกลา/ไม่พร้อมทำงาน</span><small>ไม่นับ Slot</small></div>`;
    }
    const mentorId = normId(assignment?.mentor_staff_id);
    const mentorRow = mentorRowForDate(rows,mentorId,date);
    const okay = !!mentorRow && mentorAvailable(mentorId,date);
    if (okay) {
      return `<div class="v272-follow-status"><span>ติดตาม: <b>${esc(staffName(mentorId))}</b></span><strong>${esc(codeOf(mentorRow))}</strong><small>${esc(typeLabel(assignment.trainee_type))} · ไม่นับ Slot</small></div>`;
    }
    const options = substituteOptions(rows,date,assignment);
    const identityAttrs = traineeId
      ? `data-trainee-staff-id="${esc(traineeId)}"`
      : `data-trainee-name="${esc(assignment?.trainee_name || '')}"`;
    return `<div class="v272-follow-status warning"><b>กรุณาเลือกพี่เลี้ยงแทน</b><small>${esc(staffName(mentorId))} ลา/ไม่มีตำแหน่งวันนี้</small>
      ${isAdminSafe()?`<select data-v272-day-mentor><option value="">เลือกคนที่มีตำแหน่งวันนี้</option>${options.map(person => `<option value="${esc(person.id)}">${esc(staffName(person))} · ${esc(codeOf(mentorRowForDate(rows,person.id,date)))}</option>`).join('')}</select><button type="button" class="tiny-btn warn" data-v272-save-day-mentor ${identityAttrs} data-date="${esc(normDate(date))}" data-trainee-type="${esc(assignment?.trainee_type || 'new_staff')}">บันทึกเฉพาะวันนี้</button>`:''}
      <small>ไม่นับ Slot</small></div>`;
  }
  function externalAssignmentsForDates(dates){
    const map = new Map();
    trainingRows().forEach(row => {
      if (row.trainee_staff_id || !row.trainee_name) return;
      if (!(dates || []).some(date => activeOn(row,date))) return;
      const key = String(row.trainee_name).trim().toLowerCase();
      if (!map.has(key)) map.set(key,String(row.trainee_name).trim());
    });
    return Array.from(map.values());
  }
  function buildExternalRow(name,dates,rows){
    const tds = (dates || []).map(date => {
      if (noPositionDay(date)) return `<td class="matrix-cell no-position-day"><span>WEEKEND/HOLIDAY</span></td>`;
      const assignment = assignmentForDate('',name,date);
      return assignment
        ? `<td class="matrix-cell v272-training-follow-cell">${followCellHtml(assignment,date,rows)}</td>`
        : `<td class="matrix-cell v272-training-empty-cell"><span>ยังไม่กำหนดพี่เลี้ยง</span></td>`;
    }).join('');
    return `<tr class="v272-external-training-row"><td class="sticky-col staff-col staff-color-cell v272-external-name"><div class="matrix-staff-name"><b>${esc(name)}</b><small>Intern/ผู้ฝึกภายนอก</small></div></td><td class="sticky-col summary-col summary-action-cell"><span class="badge orange">ไม่นับ Slot</span></td>${externalControlCell(name,dates)}${tds}</tr>`;
  }
  function correctCountRows(root,dates,rows){
    const countCells = root.querySelectorAll('thead tr.count-role-row th.count-role-cell');
    (dates || []).forEach((date,index) => {
      const cell = countCells[index];
      if (!cell || noPositionDay(date)) return;
      let baseList = [];
      try {
        baseList = hasOutingSafe(date)
          ? (window.cnmiV265?.actualAvailableStaff?.(date) || [])
          : (window.cnmiV233?.weeklyAvailableStaff?.(date) || window.cnmiV265?.actualAvailableStaff?.(date) || []);
      } catch (_) {}
      const available = baseList.filter(person => !isTrainingPersonOnDate(person?.id,date)).length;
      let slots = 0;
      try { slots = (window.cnmiV265?.expectedTemplatesV265?.(date) || []).length; } catch (_) {}
      if (!slots) {
        const m = String(cell.textContent || '').match(/\/(\d+)/);
        slots = Number(m?.[1] || 0);
      }
      const assigned = new Set((rows || []).filter(row => normDate(row?.work_date) === normDate(date) && codeOf(row) && codeOf(row) !== 'รอตรวจสอบ').map(row => normId(row.staff_id))).size;
      const target = Math.min(available || slots,slots || available);
      cell.classList.toggle('complete',assigned >= target);
      cell.classList.toggle('has-missing',assigned < target);
      cell.innerHTML = `<b>${esc(available)}/${esc(slots)} คน</b>`;
      cell.title = `เจ้าหน้าที่หลักที่ทำงานจริง ${available} คน • ผู้ฝึกไม่นับ Slot`;
    });
  }
  function decorateMatrixHtml(html,dates,rows){
    if (typeof document === 'undefined') return html;
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const root = template.content;
    const table = root.querySelector('.month-position-matrix table');
    if (!table) return html;

    const headRows = table.querySelectorAll('thead tr');
    headRows.forEach((tr,index) => {
      const th = document.createElement('th');
      th.className = `v272-mentor-week-head ${index ? 'v272-secondary-head' : ''}`;
      th.textContent = index === 0 ? 'พี่เลี้ยงรายสัปดาห์' : (index === 1 ? 'ผู้ฝึกไม่นับ Slot' : '-');
      tr.insertBefore(th,tr.children[2] || null);
    });

    const operational = operationalRows(rows);
    const bodyRows = Array.from(table.querySelectorAll('tbody > tr'));
    bodyRows.forEach(tr => {
      const idButton = tr.querySelector('[data-month-position-stat]');
      const sid = normId(idButton?.dataset?.monthPositionStat);
      const person = staffById(sid);
      if (!sid || !person) return;
      const mentorCellTemplate = document.createElement('template');
      mentorCellTemplate.innerHTML = mentorControlCell(person,dates);
      tr.insertBefore(mentorCellTemplate.content.firstElementChild,tr.children[2] || null);
      (dates || []).forEach((date,dateIndex) => {
        if (noPositionDay(date)) return;
        const assignment = assignmentForDate(sid,'',date);
        if (!assignment) return;
        const td = tr.children[3 + dateIndex];
        if (!td) return;
        td.className = 'matrix-cell v272-training-follow-cell';
        td.innerHTML = followCellHtml(assignment,date,operational);
      });
      const nameSmall = tr.querySelector('.matrix-staff-name small');
      if (nameSmall && knownTrainee(person,dates)) {
        const types = new Set(assignmentsForIdentity(sid,'').filter(row => (dates || []).some(date => activeOn(row,date))).map(row => typeLabel(row.trainee_type)));
        nameSmall.textContent = `${person.staff_type || ''}${types.size ? ` • ${Array.from(types).join('/')}` : ' • ผู้ฝึก'} • ไม่นับ Slot`;
      }
    });

    const tbody = table.querySelector('tbody');
    externalAssignmentsForDates(dates).forEach(name => tbody?.insertAdjacentHTML('beforeend',buildExternalRow(name,dates,operational)));
    correctCountRows(root,dates,operational);

    const legend = root.querySelector('.matrix-legend') || root.querySelector('.monthly-matrix-wrap');
    if (legend && !root.querySelector('[data-v272-add-external-training]')) {
      const action = document.createElement('div');
      action.className = 'v272-training-toolbar';
      action.innerHTML = `<span><b>น้องใหม่/Intern:</b> กำหนดพี่เลี้ยงในคอลัมน์ “พี่เลี้ยงรายสัปดาห์” แล้วระบบจะใช้วันจันทร์–ศุกร์อัตโนมัติ</span>${isAdminSafe()?'<button type="button" class="tiny-btn" data-v272-add-external-training>เพิ่ม Intern/ผู้ฝึกภายนอก</button>':''}`;
      legend.insertAdjacentElement('afterend',action);
    }
    return template.innerHTML;
  }
  async function replaceRange({ traineeStaffId=null,traineeName=null,traineeType='new_staff',startDate,endDate,mentorStaffId=null,note=null }){
    if (!isAdminSafe()) throw new Error('เฉพาะ Admin เท่านั้น');
    if (!db()) throw new Error('ไม่พบ Supabase client');
    if (!validDate(startDate) || !validDate(endDate) || normDate(endDate) < normDate(startDate)) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    if (!traineeStaffId && !String(traineeName || '').trim()) throw new Error('ไม่พบผู้ฝึก');
    if (mentorStaffId && normId(mentorStaffId) === normId(traineeStaffId)) throw new Error('ผู้ฝึกกับพี่เลี้ยงต้องเป็นคนละคน');
    const result = await db().rpc(RPC,{
      p_trainee_staff_id:traineeStaffId || null,
      p_trainee_name:String(traineeName || '').trim() || null,
      p_trainee_type:traineeType || 'new_staff',
      p_start_date:normDate(startDate),
      p_end_date:normDate(endDate),
      p_mentor_staff_id:mentorStaffId || null,
      p_note:note || null,
      p_actor_id:currentStaff()
    });
    if (result.error) {
      if (/function|schema cache|replace_staff_training_range_v272/i.test(friendly(result.error))) {
        throw new Error(`กรุณารันไฟล์ supabase_v272_weekly_inline_training.sql ก่อนใช้งาน (${friendly(result.error)})`);
      }
      throw result.error;
    }
    // RPC ลบ daily_positions เดิมของผู้ฝึกในช่วงที่แก้ภายใน Transaction เดียวแล้ว
    // ฝั่งหน้าเว็บล้าง State ซ้ำเพื่อไม่ให้แถวเก่าค้างจนกว่าจะ Refresh
    if (traineeStaffId) {
      const stateRef = st();
      if (stateRef && Array.isArray(stateRef.positions)) {
        stateRef.positions = stateRef.positions.filter(row => !(
          normId(row?.staff_id) === normId(traineeStaffId)
          && normDate(row?.work_date) >= normDate(startDate)
          && normDate(row?.work_date) <= normDate(endDate)
        ));
      }
    }
    await window.cnmiV271?.loadTrainingAssignments?.({ force:true });
    cleanDraftTrainingRows();
    return result.data;
  }
  function cleanDraftTrainingRows(){
    const stateRef = st();
    if (stateRef?.monthPositionDraft?.rows) stateRef.monthPositionDraft.rows = operationalRows(stateRef.monthPositionDraft.rows);
  }
  function saveState(button,text,tone){
    const el = button?.closest?.('[data-v272-week-card]')?.querySelector('.v272-save-state') || button?.parentElement?.querySelector?.('.v272-save-state');
    if (el) { el.textContent = text || ''; el.dataset.tone = tone || ''; }
  }
  async function saveWeek(button){
    if (saving) return;
    const card = button.closest('[data-v272-week-card]');
    const type = String(card?.querySelector('[data-v272-training-type]')?.value || '');
    const mentor = String(card?.querySelector('[data-v272-week-mentor]')?.value || '');
    const staffId = normId(button.dataset.traineeStaffId) || null;
    const name = String(button.dataset.traineeName || '').trim() || null;
    if (type && !mentor) return toast('กรุณาเลือกพี่เลี้ยงของสัปดาห์นี้','error');
    saving = true;
    button.disabled = true;
    saveState(button,'กำลังบันทึก…','saving');
    try {
      await replaceRange({ traineeStaffId:staffId,traineeName:name,traineeType:type || 'new_staff',startDate:button.dataset.weekStart,endDate:button.dataset.weekEnd,mentorStaffId:type?mentor:null,note:'กำหนดจากตารางตำแหน่งกลางวัน V272' });
      saveState(button,'บันทึกแล้ว','saved');
      toast(type ? `กำหนด${typeLabel(type)}ติดตาม ${staffName(mentor)} วันจันทร์–ศุกร์แล้ว` : 'ยกเลิกสถานะผู้ฝึกของสัปดาห์นี้แล้ว');
      setTimeout(() => { try { renderPage(); } catch (_) {} },80);
    } catch (error) {
      console.error(`${VERSION}: weekly mentor save failed`,error);
      saveState(button,'บันทึกไม่สำเร็จ','error');
      toast(friendly(error),'error');
    } finally { saving=false; button.disabled=false; }
  }
  async function saveDayOverride(button){
    if (saving) return;
    const wrap = button.closest('.v272-follow-status');
    const mentor = String(wrap?.querySelector('[data-v272-day-mentor]')?.value || '');
    if (!mentor) return toast('กรุณาเลือกพี่เลี้ยงแทนวันนี้','error');
    saving = true; button.disabled = true;
    try {
      await replaceRange({
        traineeStaffId:normId(button.dataset.traineeStaffId) || null,
        traineeName:String(button.dataset.traineeName || '').trim() || null,
        traineeType:button.dataset.traineeType || 'new_staff',
        startDate:button.dataset.date,endDate:button.dataset.date,
        mentorStaffId:mentor,note:'พี่เลี้ยงแทนเฉพาะวันจากตารางตำแหน่งกลางวัน V272'
      });
      toast(`กำหนด ${staffName(mentor)} เป็นพี่เลี้ยงแทนวันที่ ${dateLabel(button.dataset.date)} แล้ว`);
      setTimeout(() => { try { renderPage(); } catch (_) {} },80);
    } catch (error) { toast(friendly(error),'error'); }
    finally { saving=false; button.disabled=false; }
  }
  function externalModal(){
    const dates = (() => {
      const key = String(st()?.positionMonthKey || st()?.monthKey || new Date().toISOString().slice(0,7)).slice(0,7);
      const [y,m] = key.split('-').map(Number);
      const count = new Date(y,m,0).getDate();
      return Array.from({length:count},(_,i) => `${key}-${String(i+1).padStart(2,'0')}`);
    })();
    const weeks = monthWeeks(dates);
    const mentors = activeStaff();
    const html = `<div class="modal-card v272-external-modal"><div class="modal-head"><div><h3>เพิ่ม Intern/ผู้ฝึกภายนอก</h3><p class="hint">ระบบสร้างแถวในตารางและกำหนดพี่เลี้ยงวันจันทร์–ศุกร์ของสัปดาห์ที่เลือก</p></div><button type="button" class="icon-btn" data-close-modal>×</button></div><form id="v272ExternalTrainingForm" class="form-grid">
      <label>ชื่อผู้ฝึก<input name="trainee_name" required placeholder="เช่น นักศึกษา A"></label>
      <label>ประเภท<select name="trainee_type"><option value="intern">Intern (เด็กฝึกงาน)</option><option value="new_staff">น้องใหม่</option></select></label>
      <label>สัปดาห์<select name="week_start">${weeks.map(week => `<option value="${esc(week.start)}" data-week-end="${esc(week.end)}">สัปดาห์ ${week.index}: ${esc(dateLabel(week.start))}–${esc(dateLabel(week.end))}</option>`).join('')}</select></label>
      <label>พี่เลี้ยง<select name="mentor_staff_id" required><option value="">เลือกพี่เลี้ยง</option>${mentors.map(person => `<option value="${esc(person.id)}">${esc(staffName(person))}</option>`).join('')}</select></label>
      <div class="actions full-span"><button class="primary-btn" type="submit">เพิ่มในตารางสัปดาห์นี้</button></div>
    </form></div>`;
    try { showModal(html); } catch (_) {}
  }
  async function submitExternal(form){
    const fd = new FormData(form);
    const select = form.querySelector('[name="week_start"]');
    const option = select?.selectedOptions?.[0];
    try {
      await replaceRange({ traineeName:String(fd.get('trainee_name') || '').trim(),traineeType:String(fd.get('trainee_type') || 'intern'),startDate:String(fd.get('week_start') || ''),endDate:String(option?.dataset?.weekEnd || ''),mentorStaffId:String(fd.get('mentor_staff_id') || ''),note:'เพิ่มผู้ฝึกภายนอกจากตารางตำแหน่งกลางวัน V272' });
      try { closeModal(); } catch (_) {}
      toast('เพิ่มผู้ฝึกภายนอกและกำหนดพี่เลี้ยงแล้ว');
      setTimeout(() => { try { renderPage(); } catch (_) {} },80);
    } catch (error) { toast(friendly(error),'error'); }
  }
  function decorateHistoryTab(){
    const tab = document.querySelector('[data-v270-position-tab="mentors"]');
    if (tab) {
      const text = tab.querySelector('b,strong') || tab;
      if (!String(text.textContent || '').includes('ประวัติ')) text.textContent = 'ประวัติพี่เลี้ยง–ผู้ฝึก';
    }
    const body = document.querySelector('.v271-training-body');
    if (!body) return;
    body.classList.add('v272-history-mode');
    body.classList.toggle('v272-editing-history',!!st()?.editingTrainingIdV271);
    if (!body.querySelector('.v272-history-notice')) body.insertAdjacentHTML('afterbegin','<div class="notice v272-history-notice"><b>กำหนดงานจริงที่เมนู “ตารางตำแหน่งกลางวัน”</b><br>หน้านี้ใช้ดูประวัติ ยกเลิก หรือแก้ไขข้อมูลย้อนหลังเท่านั้น</div>');
    const title = body.querySelector('.v271-training-layout > .card:nth-child(2) h3');
    if (title && title.textContent !== 'ประวัติพี่เลี้ยง–น้องใหม่ / Intern') title.textContent = 'ประวัติพี่เลี้ยง–น้องใหม่ / Intern';
  }

  /* Render monthly table without persisted/injected trainee rows, then add inherited cells and weekly controls. */
  try {
    const previousMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
    if (previousMatrix && !previousMatrix.__v272InlineTraining) {
      const wrapped = function renderMonthPositionMatrixV272(rows,dates){
        const assignments = st()?.trainingAssignmentsV271;
        const cleanRows = operationalRows(rows);
        let html = '';
        try {
          if (st()) st().trainingAssignmentsV271 = [];
          html = String(previousMatrix.call(this,cleanRows,dates) || '');
        } finally { if (st()) st().trainingAssignmentsV271 = assignments || []; }
        return decorateMatrixHtml(html,Array.isArray(dates)?dates:[],cleanRows);
      };
      wrapped.__v272InlineTraining = true;
      assignGlobal('renderMonthPositionMatrix',wrapped);
    }
  } catch (error) { console.warn(`${VERSION}: matrix wrapper skipped`,error); }

  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v272NoTrainingRows) {
      const wrapped = function buildMonthlyPositionDraftV272(){
        const draft = previousBuild.apply(this,arguments);
        if (draft?.rows) {
          draft.rows = operationalRows(draft.rows);
          draft.trainingRowsRenderedOnlyV272 = true;
        }
        return draft;
      };
      wrapped.__v272NoTrainingRows = true;
      assignGlobal('buildMonthlyPositionDraft',wrapped);
    }
  } catch (_) {}

  try {
    const previousSave = window.saveMonthlyPositions || (typeof saveMonthlyPositions === 'function' ? saveMonthlyPositions : null);
    if (previousSave && !previousSave.__v272NoTrainingRows) {
      const wrapped = async function saveMonthlyPositionsV272(){
        cleanDraftTrainingRows();
        return previousSave.apply(this,arguments);
      };
      wrapped.__v272NoTrainingRows = true;
      assignGlobal('saveMonthlyPositions',wrapped);
    }
  } catch (_) {}

  try {
    const previousRender = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRender && !previousRender.__v272Decorated) {
      const wrapped = function renderPageV272(){
        const result = previousRender.apply(this,arguments);
        setTimeout(decorateHistoryTab,80);
        return result;
      };
      wrapped.__v272Decorated = true;
      assignGlobal('renderPage',wrapped);
    }
  } catch (_) {}

  document.addEventListener('change',function(event){
    const type = event.target?.closest?.('[data-v272-training-type]');
    if (type) {
      const card = type.closest('[data-v272-week-card]');
      const mentor = card?.querySelector('[data-v272-week-mentor]');
      if (mentor) { mentor.disabled = !type.value; if (!type.value) mentor.value=''; }
    }
  },true);

  document.addEventListener('click',function(event){
    const expand = event.target?.closest?.('[data-v272-expand-training]');
    if (expand) {
      event.preventDefault(); event.stopPropagation();
      expandedStaff.add(normId(expand.dataset.v272ExpandTraining));
      try { renderPage(); } catch (_) {}
      return;
    }
    const saveWeekButton = event.target?.closest?.('[data-v272-save-week]');
    if (saveWeekButton) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveWeek(saveWeekButton); return;
    }
    const saveDayButton = event.target?.closest?.('[data-v272-save-day-mentor]');
    if (saveDayButton) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveDayOverride(saveDayButton); return;
    }
    if (event.target?.closest?.('[data-v272-add-external-training]')) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      externalModal();
    }
  },true);

  document.addEventListener('submit',function(event){
    if (event.target?.id !== 'v272ExternalTrainingForm') return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    submitExternal(event.target);
  },true);

  const style = document.createElement('style');
  style.id = 'cnmi-v272-style';
  style.textContent = `
    .v272-mentor-week-head{min-width:300px;max-width:300px;background:#eff6ff!important;color:#1e3a8a!important}.v272-secondary-head{font-size:10px!important}
    .v272-mentor-week-cell{min-width:300px;max-width:300px;padding:5px!important;background:#f8fbff!important;vertical-align:top!important}
    .v272-week-controls{display:flex;gap:6px;overflow-x:auto;padding-bottom:3px;scrollbar-width:thin}.v272-week-card{flex:0 0 178px;display:grid;gap:4px;padding:6px;border:1px solid #cbd5e1;border-radius:10px;background:#fff}.v272-week-card.active{border-color:#60a5fa;background:#eff6ff}.v272-week-title{display:flex;justify-content:space-between;gap:4px;align-items:center}.v272-week-title small{font-size:9px;color:#64748b}.v272-week-card select{height:28px;min-height:28px;font-size:10px;padding:3px 22px 3px 6px}.v272-week-card .tiny-btn{padding:4px 6px;font-size:10px}.v272-save-state{min-height:12px;font-size:9px}.v272-save-state[data-tone="saved"]{color:#15803d}.v272-save-state[data-tone="error"]{color:#b91c1c}.v272-save-state[data-tone="saving"]{color:#1d4ed8}.v272-mixed-note{font-size:9px;color:#b45309;font-weight:700}
    .v272-regular-staff-cell{vertical-align:middle!important;text-align:center}.v272-mentor-of{display:flex;flex-direction:column;gap:2px;margin-bottom:5px;padding:5px;border-radius:8px;background:#ecfdf5;color:#166534}.v272-mentor-of small{font-size:10px}.v272-regular-staff-cell .ghost{opacity:.72}
    .v272-training-follow-cell{background:#f0f9ff!important;border-color:#7dd3fc!important;min-width:118px}.v272-follow-status{display:flex;flex-direction:column;gap:2px;align-items:center;text-align:center;font-size:10px}.v272-follow-status strong{font-size:12px;color:#075985}.v272-follow-status small{font-size:9px;color:#475569}.v272-follow-status.warning{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:5px;color:#9a3412}.v272-follow-status.warning select{width:100%;min-height:28px;font-size:10px}.v272-follow-status.unavailable{background:#fef2f2;color:#991b1b;border-radius:8px;padding:5px}.v272-follow-status .warn{background:#f59e0b;color:#fff}.v272-training-empty-cell{background:#f8fafc!important;color:#94a3b8;font-size:10px;text-align:center}
    .v272-training-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;margin:6px 0;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px}.v272-external-name{background:#fde68a!important;color:#78350f!important}.v272-external-modal{width:min(760px,94vw)}
    .v272-history-notice{margin-bottom:10px}.v272-history-mode:not(.v272-editing-history) .v271-training-layout>.card:first-child{display:none}.v272-history-mode:not(.v272-editing-history) .v271-training-layout{grid-template-columns:1fr!important}
    @media(max-width:900px){.v272-mentor-week-head,.v272-mentor-week-cell{min-width:240px;max-width:240px}.v272-week-card{flex-basis:165px}.v272-training-toolbar{align-items:stretch;flex-direction:column}.v272-training-toolbar button{width:100%}}
  `;
  document.head.appendChild(style);

  try {
    const observer = new MutationObserver(() => decorateHistoryTab());
    observer.observe(document.body,{childList:true,subtree:true});
  } catch (_) {}

  window.cnmiV272 = { weekBounds,monthWeeks,replaceRange,assignmentForDate,isTrainingPersonOnDate,operationalRows,decorateMatrixHtml };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v272-weekly-inline-training.js", error); }
;
