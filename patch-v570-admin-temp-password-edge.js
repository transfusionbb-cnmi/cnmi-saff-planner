/* V570 Admin temporary password reset via Supabase Edge Function
   - Replaces email reset/default-password actions with one "ตั้ง / รีเซ็ตรหัส" action.
   - Admin chooses a temporary password (>= 8 chars) and confirms it.
   - Calls Supabase Edge Function; service_role never exists in frontend.
   - Target profile is forced to choose a private password on next login.
   - Password values are never written to Audit Log.
*/
(function(){
  'use strict';
  const VERSION = 'V570_ADMIN_TEMP_PASSWORD_EDGE';
  const FN = 'admin-set-temp-password';

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }

  const prevUsers = window.renderUsersPage || (typeof renderUsersPage === 'function' ? renderUsersPage : null);
  if (prevUsers) {
    const wrapped = function renderUsersPageV570(){
      let html = String(prevUsers.apply(this, arguments) || '');
      html = html.replace(/<button\b[^>]*data-reset-user-email="[^"]*"[^>]*>[^<]*<\/button>/gi, '');
      html = html.replace(/<button\b[^>]*data-reset-default-password-staff="[^"]*"[^>]*>[^<]*<\/button>/gi, '');
      html = html.replace(/<div class="user-password-actions">/gi,
        '<div class="user-password-actions"><button class="tiny-btn v570-password-btn" data-v570-temp-password-staff="__V570_STAFF_ID__" type="button">ตั้ง / รีเซ็ตรหัส</button>');
      html = html.replace(/data-v570-temp-password-staff="__V570_STAFF_ID__"/g, function(){ return 'data-v570-temp-password-staff=""'; });
      // Fill each button from its surrounding card's data-staff-row after DOM render.
      return html;
    };
    try { window.renderUsersPage = renderUsersPage = wrapped; } catch (_) { window.renderUsersPage = wrapped; }
  }

  function hydrateButtons(root=document){
    root.querySelectorAll('.admin-user-card[data-staff-row]').forEach(card => {
      const btn = card.querySelector('[data-v570-temp-password-staff]');
      if (btn) btn.dataset.v570TempPasswordStaff = card.getAttribute('data-staff-row') || '';
      card.querySelectorAll('[data-reset-user-email],[data-reset-default-password-staff]').forEach(x => x.remove());
    });
  }

  function openResetModal(staffId){
    if (!(typeof isAdmin === 'function' && isAdmin())) return showToast('เฉพาะ Admin เท่านั้น', { tone:'error' });
    const staff = (state.staff || []).find(s => String(s.id) === String(staffId));
    if (!staff) return showToast('ไม่พบข้อมูลเจ้าหน้าที่', { tone:'error' });
    const name = staff.nickname || staff.full_name || staff.email || 'เจ้าหน้าที่';
    showModal(`<div class="v570-reset-box v573-reset-box">
      <h2>ตั้ง / รีเซ็ตรหัสชั่วคราว</h2>
      <p class="hint">${esc(name)}${staff.email ? ` • ${esc(staff.email)}` : ''}</p>
      <p class="v570-reset-note">Admin กำหนดรหัสชั่วคราวให้น้องใช้ Login ครั้งถัดไป หลัง Login ระบบจะบังคับให้น้องตั้งรหัสส่วนตัวใหม่ และ Admin จะไม่เห็นรหัสส่วนตัวนั้น</p>
      <form id="v570TempPasswordForm" data-staff-id="${esc(staff.id)}" class="v573-password-form">
        <label>รหัสชั่วคราว
          <div class="v570-password-row"><input id="v570TempPassword" name="temp_password" type="password" minlength="8" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร" required><button type="button" class="ghost-btn v570-eye" data-v570-toggle="#v570TempPassword">ดู</button></div>
        </label>
        <label>ยืนยันรหัสชั่วคราว
          <div class="v570-password-row"><input id="v570TempPassword2" name="temp_password2" type="password" minlength="8" autocomplete="new-password" placeholder="พิมพ์รหัสเดิมอีกครั้ง" required><button type="button" class="ghost-btn v570-eye" data-v570-toggle="#v570TempPassword2">ดู</button></div>
        </label>
        <div class="confirm-actions"><button type="button" class="ghost-btn" data-v570-cancel>ยกเลิก</button><button type="submit" class="primary-btn">ตั้ง / รีเซ็ตรหัส</button></div>
      </form>
      <p class="hint v573-audit-hint">Audit Log จะเก็บเฉพาะว่าใครรีเซ็ตบัญชีใครและเวลาใด — ไม่บันทึกรหัสผ่าน</p>
    </div>`, { className:'modal-v570-password modal-v573-password' });
    requestAnimationFrame(() => document.getElementById('v570TempPassword')?.focus());
  }

  async function submitReset(form){
    const fd = new FormData(form);
    const password = String(fd.get('temp_password') || '');
    const password2 = String(fd.get('temp_password2') || '');
    const staffId = String(form.dataset.staffId || '');
    if (password.length < 8) return showToast('รหัสชั่วคราวต้องอย่างน้อย 8 ตัวอักษร', { tone:'error' });
    if (password !== password2) return showToast('รหัสชั่วคราวทั้ง 2 ช่องไม่ตรงกัน', { tone:'error' });
    if (!staffId) return showToast('ไม่พบเจ้าหน้าที่', { tone:'error' });

    setBusy(true, 'กำลังตั้งรหัสชั่วคราว');
    try {
      const { data, error } = await sb.functions.invoke(FN, {
        body: { staff_id: staffId, temp_password: password }
      });
      if (error) {
        let detail = '';
        try {
          const payload = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
          detail = payload?.message || '';
        } catch (_) {}
        throw new Error(detail || error.message || 'Edge Function ทำรายการไม่สำเร็จ');
      }
      if (!data || data.ok === false) throw new Error(data?.message || 'ตั้ง/รีเซ็ตรหัสไม่สำเร็จ');
      closeModal();
      await loadAllData();
      renderPage();
      showToast(data.warning || 'ตั้งรหัสชั่วคราวแล้ว เจ้าหน้าที่จะถูกบังคับให้ตั้งรหัสส่วนตัวใหม่เมื่อ Login');
    } catch (err) {
      const msg = err?.context?.message || err?.message || 'ตั้ง/รีเซ็ตรหัสไม่สำเร็จ';
      showToast(msg, { tone:'error' });
    } finally { setBusy(false); }
  }

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-v570-temp-password-staff]');
    if (btn) { e.preventDefault(); e.stopPropagation(); openResetModal(btn.dataset.v570TempPasswordStaff); return; }
    const toggle = e.target?.closest?.('[data-v570-toggle]');
    if (toggle) {
      e.preventDefault();
      const input = document.querySelector(toggle.dataset.v570Toggle || '');
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'ดู' : 'ซ่อน';
      return;
    }
    if (e.target?.closest?.('[data-v570-cancel]')) { e.preventDefault(); closeModal(); }
  }, true);

  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'v570TempPasswordForm') return;
    e.preventDefault(); e.stopPropagation();
    submitReset(e.target);
  }, true);

  const observer = new MutationObserver(() => hydrateButtons(document));
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', () => hydrateButtons(document));
  setTimeout(() => hydrateButtons(document), 0);

  // Improve Audit Log wording for V570 entries without ever exposing a password.
  const oldActionLabel = window.auditActionLabel || (typeof auditActionLabel === 'function' ? auditActionLabel : null);
  if (oldActionLabel) {
    const nextActionLabel = function(a){
      if (a?.table_name === 'auth' && String(a?.action || '').toUpperCase() === 'ADMIN_PASSWORD_RESET') return 'Admin ตั้ง/รีเซ็ตรหัสชั่วคราว';
      return oldActionLabel(a);
    };
    try { window.auditActionLabel = auditActionLabel = nextActionLabel; } catch (_) { window.auditActionLabel = nextActionLabel; }
  }
  const oldSummary = window.auditSummary || (typeof auditSummary === 'function' ? auditSummary : null);
  if (oldSummary) {
    const nextSummary = function(a){
      if (a?.table_name === 'auth' && String(a?.action || '').toUpperCase() === 'ADMIN_PASSWORD_RESET') {
        const n = a.new_data || {};
        return `ตั้ง/รีเซ็ตรหัสชั่วคราวให้ ${n.target_name || n.target_email || 'เจ้าหน้าที่'}${n.at ? ' เมื่อ ' + formatThaiDateTime(n.at) : ''} (ไม่เก็บรหัสผ่าน)`;
      }
      return oldSummary(a);
    };
    try { window.auditSummary = auditSummary = nextSummary; } catch (_) { window.auditSummary = nextSummary; }
  }

  console.info(`${VERSION} loaded`);
})();
