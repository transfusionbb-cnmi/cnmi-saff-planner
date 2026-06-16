/* =========================
   V244 Personal Position Permissions Tab
   - Remove "สิทธิ์ตำแหน่งรายวัน" from the Admin sidebar.
   - Keep the existing eligibility data/table; move the UI under "จัดการตำแหน่ง" as a tab named "สิทธิ์เฉพาะบุคคล".
   - Slot Master remains the main rule source; personal permissions are only per-person overrides/exceptions.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V244_PERSONAL_POSITION_PERMISSIONS_TAB';
  if (window.__CNMI_V244_PERSONAL_POSITION_PERMISSIONS_TAB__) return;
  window.__CNMI_V244_PERSONAL_POSITION_PERMISSIONS_TAB__ = true;

  const TAB_STATE_KEY = 'cnmi_position_management_subtab_v244';

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function adminSafe(){
    try { return !!isAdmin(); } catch (_) { return !!(state && state.profile && state.profile.role === 'admin'); }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function navItems(){
    try { if (Array.isArray(NAV_ITEMS)) return NAV_ITEMS; } catch (_) {}
    try { if (Array.isArray(window.NAV_ITEMS)) return window.NAV_ITEMS; } catch (_) {}
    return [];
  }
  function removeEligibilityNav(){
    const items = navItems();
    if (!items.length) return;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i] && items[i].id === 'eligibility') items.splice(i, 1);
    }
    let pm = items.find(x => x && x.id === 'positionManagement');
    if (!pm) {
      const usersIdx = items.findIndex(x => x && x.id === 'users');
      const entry = { id:'positionManagement', icon:'🧭', title:'จัดการตำแหน่ง', subtitle:'เพิ่ม/แก้ไข Slot และกำหนดสิทธิ์เฉพาะบุคคล', group:'admin' };
      if (usersIdx >= 0) items.splice(usersIdx + 1, 0, entry); else items.push(entry);
      pm = entry;
    }
    pm.title = 'จัดการตำแหน่ง';
    pm.subtitle = 'เพิ่ม/แก้ไข Slot และกำหนดสิทธิ์เฉพาะบุคคล';
  }
  function normalizeTab(raw){
    const text = String(raw || '').trim();
    return text === 'permissions' ? 'permissions' : 'slots';
  }
  function currentTab(){
    const fromState = state && state.positionManagementSubtabV244;
    if (fromState) return normalizeTab(fromState);
    try { return normalizeTab(localStorage.getItem(TAB_STATE_KEY)); } catch (_) { return 'slots'; }
  }
  function setTab(tab){
    const val = normalizeTab(tab);
    if (state) state.positionManagementSubtabV244 = val;
    try { localStorage.setItem(TAB_STATE_KEY, val); } catch (_) {}
    return val;
  }
  function setHeader(){
    try {
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = 'จัดการตำแหน่ง';
      if (subtitle) subtitle.textContent = 'เพิ่ม/แก้ไข Slot และกำหนดสิทธิ์เฉพาะบุคคล';
    } catch (_) {}
  }
  function tabBar(){
    const active = currentTab();
    const tab = (id, label, hint) => `<button type="button" class="v244-position-tab ${active===id?'active':''}" data-v244-position-tab="${esc(id)}"><b>${esc(label)}</b><small>${esc(hint)}</small></button>`;
    return `<div class="card v244-position-tabs-card">
      <div class="section-title"><div><h3>จัดการตำแหน่ง</h3><p class="hint">ให้ Slot Master เป็นกฎหลัก ส่วนสิทธิ์เฉพาะบุคคลใช้เป็นข้อยกเว้นรายคนเท่านั้น</p></div></div>
      <div class="v244-position-tabs">${tab('slots','ชุด Slot ตำแหน่งกลางวัน','เพิ่ม / แก้ไข / ลบ / เรียง Slot')}${tab('permissions','สิทธิ์เฉพาะบุคคล','กำหนดคนที่ทำบางตำแหน่งได้จริง')}</div>
    </div>`;
  }
  function normalizeEligibilityHtml(html){
    let out = String(html || '');
    out = out.replace(/สิทธิ์ตำแหน่งรายวัน/g, 'สิทธิ์เฉพาะบุคคล');
    out = out.replace(/บันทึกสิทธิ์ตำแหน่ง/g, 'บันทึกสิทธิ์เฉพาะบุคคล');
    out = out.replace(/กำหนดว่าแต่ละคนขึ้นตำแหน่งไหนได้/g, 'กำหนดข้อยกเว้นรายคนจาก Slot Master');
    out = out.replace(/ติ๊กเฉพาะตำแหน่งที่ขึ้นงานได้จริง ระบบ Auto Assign จะใช้ข้อมูลนี้เป็นตัวกรองหลัก/g, 'ค่าเริ่มต้นอิงจาก Slot Master และผู้ปฏิบัติหลัก หน้านี้ใช้เฉพาะกรณีที่ต้องกำหนดสิทธิ์รายคนเพิ่มเติม');
    out = out.replace(/ข้อมูลตำแหน่งมาจากหน้า “จัดการตำแหน่ง” แบบ Dynamic/g, 'ข้อมูลตำแหน่งมาจาก Slot Master ในหน้า “จัดการตำแหน่ง”');
    return out;
  }
  function slotBodyHtml(){
    const root = document.getElementById('pageContent');
    if (root && window.cnmiV224 && typeof window.cnmiV224.renderPositionManagementV224 === 'function') {
      try {
        window.cnmiV224.renderPositionManagementV224();
        const html = root.innerHTML || '';
        root.innerHTML = '';
        return html || `<div class="card">ยังไม่พบหน้าจัดการ Slot</div>`;
      } catch (err) {
        console.warn(`${VERSION}: capture slot page failed`, err);
      }
    }
    return `<div class="card"><h3>ชุด Slot ตำแหน่งกลางวัน</h3><p class="hint">ยังโหลดหน้าจัดการ Slot ไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง</p></div>`;
  }
  function permissionBodyHtml(){
    if (!adminSafe()) {
      try { return noPermission(); } catch (_) { return '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>'; }
    }
    let html = '';
    try { html = typeof renderEligibilityPage === 'function' ? renderEligibilityPage() : ''; }
    catch (err) { html = `<div class="card error-notice">โหลดสิทธิ์เฉพาะบุคคลไม่สำเร็จ: ${esc(err && (err.message || err))}</div>`; }
    if (!html) html = `<div class="card">ยังไม่พบข้อมูลสิทธิ์เฉพาะบุคคล</div>`;
    return `<div class="v244-permission-tab-body">${normalizeEligibilityHtml(html)}</div>`;
  }
  function renderTabbedPositionManagement(){
    try {
      if (!state || state.page !== 'positionManagement') return;
      const root = document.getElementById('pageContent');
      if (!root) return;
      removeEligibilityNav();
      setHeader();
      const active = currentTab();
      const body = active === 'permissions' ? permissionBodyHtml() : slotBodyHtml();
      root.innerHTML = `<div class="v244-position-management-page">${tabBar()}${body}</div>`;
      // Let older helper patches re-inject their controls (Slot หลัก, รายละเอียดล่าสุด V240) into the wrapped Slot tab.
      setTimeout(() => { try { if (state.page === 'positionManagement' && currentTab() === 'slots') document.body.dispatchEvent(new Event('cnmi-v244-slot-tab-rendered')); } catch (_) {} }, 0);
    } catch (err) {
      console.error(`${VERSION}: render failed`, err);
    }
  }

  async function savePositionEligibilityV244(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const checks = Array.from(document.querySelectorAll('[data-eligibility]'));
    const rowMap = new Map();
    checks.forEach(cb => {
      const staffId = cb.dataset.staffId;
      const positionCode = cb.dataset.positionCode;
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
    if (error) {
      let msg = error.message || String(error);
      try { msg = friendlyDbError(error); } catch (_) {}
      return toast(msg, 'error');
    }
    try { await loadAllData(); } catch (_) {}
    if (state) { state.page = 'positionManagement'; state.positionManagementSubtabV244 = 'permissions'; }
    try { renderPage(); } catch (_) { renderTabbedPositionManagement(); }
    toast('บันทึกสิทธิ์เฉพาะบุคคลแล้ว');
  }

  function installSaveOverride(){
    try { window.savePositionEligibility = savePositionEligibility = savePositionEligibilityV244; }
    catch (_) { window.savePositionEligibility = savePositionEligibilityV244; }
  }

  removeEligibilityNav();
  installSaveOverride();

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage && !previousRenderPage.__v244PositionPermissionTabWrapped) {
    const wrapped = function renderPageV244(){
      removeEligibilityNav();
      if (state && state.page === 'eligibility') {
        state.page = 'positionManagement';
        setTab('permissions');
      }
      const out = previousRenderPage.apply(this, arguments);
      if (state && state.page === 'positionManagement') {
        setTimeout(renderTabbedPositionManagement, 35);
        setTimeout(renderTabbedPositionManagement, 120);
      }
      return out;
    };
    wrapped.__v244PositionPermissionTabWrapped = true;
    window.renderPage = renderPage = wrapped;
  }

  document.addEventListener('click', function(e){
    const tab = e.target && e.target.closest && e.target.closest('[data-v244-position-tab]');
    if (tab) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (state) state.page = 'positionManagement';
      setTab(tab.getAttribute('data-v244-position-tab'));
      try { renderPage(); } catch (_) { renderTabbedPositionManagement(); }
      return;
    }
    const oldEligibilityNav = e.target && e.target.closest && e.target.closest('[data-page="eligibility"]');
    if (oldEligibilityNav) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (state) state.page = 'positionManagement';
      setTab('permissions');
      try { renderPage(); } catch (_) { renderTabbedPositionManagement(); }
      return;
    }
  }, true);

  document.addEventListener('change', function(e){
    if (e.target && e.target.id === 'eligibilityStaffSelect' && state && state.page === 'positionManagement') {
      state.eligibilityStaffId = e.target.value;
      setTab('permissions');
      setTimeout(renderTabbedPositionManagement, 0);
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v244-position-management-page{display:block}
    .v244-position-tabs-card{margin-bottom:14px}
    .v244-position-tabs{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}
    .v244-position-tab{border:1px solid #dbeafe;background:#f8fbff;border-radius:18px;padding:12px 16px;min-width:220px;text-align:left;cursor:pointer;box-shadow:0 8px 20px rgba(15,23,42,.04)}
    .v244-position-tab b{display:block;color:#0f172a;font-size:14px;margin-bottom:3px}
    .v244-position-tab small{display:block;color:#64748b;font-size:12px;line-height:1.35}
    .v244-position-tab.active{background:#e0f2fe;border-color:#7dd3fc;box-shadow:0 10px 24px rgba(14,165,233,.14)}
    .v244-position-tab.active b{color:#075985}
    .v244-permission-tab-body .eligibility-page{margin-top:0}
    .v244-permission-tab-body .eligibility-position-panel .section-title h3{color:#0f172a}
    @media(max-width:760px){.v244-position-tab{width:100%;min-width:0}.v244-position-tabs-card .section-title{align-items:flex-start}}
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    try {
      removeEligibilityNav();
      if (typeof renderNav === 'function') renderNav();
      if (state && state.page === 'positionManagement') renderTabbedPositionManagement();
      if (state && state.page === 'eligibility') { state.page = 'positionManagement'; setTab('permissions'); renderPage(); }
    } catch (err) { console.warn(`${VERSION}: initial refresh skipped`, err); }
  }, 180);

  window.cnmiV244PositionPermissions = { renderTabbedPositionManagement, setTab, currentTab, removeEligibilityNav };
  console.info(`${VERSION} loaded`);
})();
