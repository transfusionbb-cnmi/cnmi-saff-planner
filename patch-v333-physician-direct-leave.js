/* CNMI Staff Planner V333
   Physician direct leave workflow
   - A profile whose staff_type is แพทย์ (or role contains physician/doctor) may submit own leave normally.
   - The physician may cancel their own active leave/no-duty record immediately without Admin approval.
   - Cancellation preserves the record by setting status = cancelled.
   - No popup/modal functions are replaced and no additional data query is added.
*/
(function () {
  'use strict';

  const VERSION = 'V333_PHYSICIAN_DIRECT_LEAVE';

  function appState() {
    try { return typeof state !== 'undefined' ? state : (window.state || {}); }
    catch (_) { return window.state || {}; }
  }

  function currentId() {
    try { return typeof currentStaffId === 'function' ? currentStaffId() : appState()?.profile?.id || null; }
    catch (_) { return appState()?.profile?.id || null; }
  }

  function currentProfile() {
    const st = appState();
    const id = currentId();
    return st?.profile || (Array.isArray(st?.staff) ? st.staff.find(row => String(row?.id) === String(id)) : null) || {};
  }

  function isPhysicianProfile(profile) {
    const type = String(profile?.staff_type || profile?.position || profile?.job_title || '').trim();
    const role = String(profile?.role || profile?.app_role || '').trim();
    return /แพทย์|physician|doctor/i.test(`${type} ${role}`);
  }

  function isCurrentPhysician() {
    return isPhysicianProfile(currentProfile());
  }

  function ownRow(row) {
    return String(row?.staff_id || '') === String(currentId() || '');
  }

  function finalInactive(row) {
    try {
      const fn = window.isLeaveFinalInactive || (typeof isLeaveFinalInactive === 'function' ? isLeaveFinalInactive : null);
      if (typeof fn === 'function') return !!fn(row);
    } catch (_) {}
    return ['cancelled', 'canceled', 'rejected', 'inactive'].includes(String(row?.status || '').trim().toLowerCase());
  }

  function esc(value) {
    try {
      const fn = window.escapeHtml || (typeof escapeHtml === 'function' ? escapeHtml : null);
      if (typeof fn === 'function') return fn(value);
    } catch (_) {}
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function toast(message) {
    try {
      const fn = window.showToast || (typeof showToast === 'function' ? showToast : null);
      if (typeof fn === 'function') return fn(message);
    } catch (_) {}
    console.info(`[${VERSION}] ${message}`);
  }

  async function confirmAction(message, title) {
    try {
      const fn = window.confirmDialog || (typeof confirmDialog === 'function' ? confirmDialog : null);
      if (typeof fn === 'function') return !!(await fn(message, title));
    } catch (_) {}
    return window.confirm(message);
  }

  function friendly(error) {
    try {
      const fn = window.friendlyDbError || (typeof friendlyDbError === 'function' ? friendlyDbError : null);
      if (typeof fn === 'function') return fn(error);
    } catch (_) {}
    return error?.message || error?.details || error?.hint || 'บันทึกไม่สำเร็จ';
  }

  function busy(value, text) {
    try {
      const fn = window.setBusy || (typeof setBusy === 'function' ? setBusy : null);
      if (typeof fn === 'function') fn(value, text);
    } catch (_) {}
  }

  function rerender() {
    try {
      const fn = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
      if (typeof fn === 'function') fn();
    } catch (error) {
      console.warn(`[${VERSION}] renderPage failed`, error);
    }
  }

  async function physicianCancelOwnLeave(id) {
    if (!isCurrentPhysician()) return toast('สิทธิ์ยกเลิกทันทีใช้สำหรับแพทย์เท่านั้น');

    const st = appState();
    const row = (Array.isArray(st?.leaves) ? st.leaves : []).find(item => String(item?.id) === String(id));
    if (!row) return toast('ไม่พบรายการลา กรุณารีเฟรชหน้าแล้วลองใหม่');
    if (!ownRow(row)) return toast('ยกเลิกได้เฉพาะรายการลาของตนเอง');
    if (finalInactive(row)) return toast('รายการนี้ถูกยกเลิกแล้ว');

    const noun = String(row?.type || '') === 'ไม่รับเวร' ? 'รายการไม่รับเวร' : 'รายการลา';
    const ok = await confirmAction(
      `ยืนยันยกเลิก${noun}นี้ทันที? ระบบจะเก็บประวัติรายการไว้และเปลี่ยนสถานะเป็น “ยกเลิกแล้ว” โดยไม่ต้องรอ Admin`,
      `ยกเลิก${noun}`
    );
    if (!ok) return;

    const client = (() => {
      try { return typeof sb !== 'undefined' ? sb : window.sb; }
      catch (_) { return window.sb; }
    })();
    if (!client?.from) return toast('ระบบฐานข้อมูลยังโหลดไม่สมบูรณ์ กรุณารีเฟรชหน้า');

    busy(true, 'กำลังยกเลิกรายการ');
    const patch = { status: 'cancelled', updated_by: currentId() };
    const { error } = await client
      .from('leave_requests')
      .update(patch)
      .eq('id', id)
      .eq('staff_id', currentId());
    busy(false);

    if (error) return toast(friendly(error));

    // Update the already-loaded row locally. This avoids an extra Supabase query/egress.
    Object.assign(row, patch);
    try { if (String(st?.editingLeaveId || '') === String(id)) st.editingLeaveId = null; } catch (_) {}
    rerender();
    toast(`${noun}ถูกยกเลิกแล้ว ไม่ต้องรอ Admin`);
  }

  const previousRenderLeaveActions = (() => {
    try { return window.renderLeaveActions || (typeof renderLeaveActions === 'function' ? renderLeaveActions : null); }
    catch (_) { return window.renderLeaveActions || null; }
  })();

  if (typeof previousRenderLeaveActions === 'function') {
    const patchedRenderLeaveActions = function renderLeaveActionsV333(row) {
      if (!isCurrentPhysician() || !ownRow(row)) return previousRenderLeaveActions(row);
      if (finalInactive(row)) return '<span class="muted">ยกเลิกแล้ว</span>';

      let editButton = '';
      try {
        const fn = window.canEditOwn || (typeof canEditOwn === 'function' ? canEditOwn : null);
        if (typeof fn === 'function' && fn(row)) {
          editButton = `<button class="tiny-btn" data-edit-leave="${esc(row?.id)}">แก้ไข</button>`;
        }
      } catch (_) {}

      const label = String(row?.type || '') === 'ไม่รับเวร' ? 'ยกเลิกไม่รับเวรทันที' : 'ยกเลิกวันลาทันที';
      return `${editButton}<button class="tiny-btn danger" type="button" data-v333-physician-cancel-leave="${esc(row?.id)}">${label}</button>`;
    };

    window.renderLeaveActions = patchedRenderLeaveActions;
    try { renderLeaveActions = patchedRenderLeaveActions; } catch (_) {}
  }

  const previousRenderLeavePage = (() => {
    try { return window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null); }
    catch (_) { return window.renderLeavePage || null; }
  })();

  if (typeof previousRenderLeavePage === 'function') {
    const patchedRenderLeavePage = function renderLeavePageV333() {
      let html = previousRenderLeavePage();
      if (!isCurrentPhysician() || typeof html !== 'string' || html.includes('data-v333-physician-leave-notice')) return html;
      const notice = '<div class="notice soft-notice wide" data-v333-physician-leave-notice><b>สิทธิ์แพทย์:</b> บันทึกรายการลาได้ตามปกติและยกเลิกรายการของตนเองได้ทันที โดยไม่ต้องส่งคำขอให้ Admin อนุมัติ</div>';
      html = html.replace(/(<form[^>]*id=["']leaveForm["'][^>]*>)/i, `$1${notice}`);
      return html;
    };
    window.renderLeavePage = patchedRenderLeavePage;
    try { renderLeavePage = patchedRenderLeavePage; } catch (_) {}
  }

  document.addEventListener('click', function (event) {
    const button = event.target?.closest?.('[data-v333-physician-cancel-leave]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    const id = button.getAttribute('data-v333-physician-cancel-leave');
    if (!id || button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    Promise.resolve(physicianCancelOwnLeave(id)).finally(() => {
      if (button.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
  }, true);

  window.isCurrentPhysicianV333 = isCurrentPhysician;
  window.physicianCancelOwnLeaveV333 = physicianCancelOwnLeave;
  console.info(`[${VERSION}] loaded`);
})();
