/* v141 Admin Long-term Leave UI Force Render
   Purpose: ensure the controls are present in the actual Users/Admin form, not only behind logic.
   Scope: users page UI + reset button fallback only. Does not touch roster/OT calculation logic.
*/
(function(){
  'use strict';
  const esc = (v) => (typeof escapeHtml === 'function') ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function getStaff(staffId){
    return ((window.state && state.staff) || []).find(s => String(s.id) === String(staffId)) || null;
  }

  function ensureControls(){
    if (!window.state || state.page !== 'users') return;
    document.querySelectorAll('[data-staff-row]').forEach(card => {
      const staffId = card.getAttribute('data-staff-row');
      const st = getStaff(staffId) || {};
      const form = card.querySelector('.admin-user-form') || card;

      if (!form.querySelector('[data-field="is_long_term_leave"]')) {
        const rosterLabel = form.querySelector('[data-field="roster_enabled"]')?.closest('label');
        const label = document.createElement('label');
        label.className = 'long-leave-field v141-long-leave-field';
        label.innerHTML = `สถานะลาระยะยาว
          <select data-field="is_long_term_leave">
            <option value="false" ${st.is_long_term_leave === true ? '' : 'selected'}>ปิด / ใช้งานปกติ</option>
            <option value="true" ${st.is_long_term_leave === true ? 'selected' : ''}>เปิด / ลาระยะยาว</option>
          </select>
          <small class="v141-long-leave-inline-note">ใช้กับลาคลอด/ลาบวช/ลาดูใจ/ลาถือศีล หรือพักงานยาว</small>`;
        if (rosterLabel && rosterLabel.parentNode) rosterLabel.insertAdjacentElement('afterend', label);
        else form.appendChild(label);
      }

      if (!card.querySelector('[data-v140-reset-balance], [data-v141-reset-balance]')) {
        const action = document.createElement('div');
        action.className = 'long-leave-admin-actions v141-long-leave-actions';
        action.innerHTML = `
          <button type="button" class="soft-btn warning" data-v141-reset-balance="${esc(staffId)}">รีเซ็ตยอดสะสมเป็น 0</button>
          <span class="hint">ใช้ตอนกลับจากลาคลอด/ลาระยะยาว หรือรับพนักงานใหม่ เพื่อเริ่มยอดชดเชยใหม่ที่ 0</span>`;
        card.appendChild(action);
      }
    });
  }

  async function updateLongLeave(staffId, value){
    if (!window.sb) return showToast && showToast('ยังไม่ได้เชื่อม Supabase');
    try {
      if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกสถานะลาระยะยาว');
      const { error } = await sb.from('staff_profiles').update({ is_long_term_leave: !!value }).eq('id', staffId);
      if (error) throw error;
      const st = getStaff(staffId);
      if (st) st.is_long_term_leave = !!value;
      if (typeof showToast === 'function') showToast(value ? 'เปิดสถานะลาระยะยาวแล้ว' : 'ปิดสถานะลาระยะยาวแล้ว');
    } catch(err) {
      if (typeof showToast === 'function') showToast((err && err.message) || 'บันทึกสถานะลาระยะยาวไม่สำเร็จ');
    } finally {
      if (typeof setBusy === 'function') setBusy(false);
    }
  }

  async function resetBalance(staffId){
    if (!window.sb) return showToast && showToast('ยังไม่ได้เชื่อม Supabase');
    const st = getStaff(staffId) || {};
    const name = st.nickname || st.full_name || 'เจ้าหน้าที่นี้';
    if (!confirm(`ยืนยันรีเซ็ตยอดสะสมของ ${name} เป็น 0 ?`)) return;
    try {
      if (typeof setBusy === 'function') setBusy(true, 'กำลังรีเซ็ตยอดสะสม');
      const patch = { carry_over_balance: 0, overtime_balance: 0, ot_balance: 0, balance_reset_at: new Date().toISOString() };
      const { error } = await sb.from('staff_profiles').update(patch).eq('id', staffId);
      if (error) throw error;
      if (st) Object.assign(st, patch);
      if (typeof showToast === 'function') showToast('รีเซ็ตยอดสะสมเป็น 0 แล้ว');
      if (typeof loadAllData === 'function') await loadAllData();
      if (typeof renderPage === 'function') renderPage();
    } catch(err) {
      if (typeof showToast === 'function') showToast((err && err.message) || 'รีเซ็ตยอดสะสมไม่สำเร็จ');
    } finally {
      if (typeof setBusy === 'function') setBusy(false);
    }
  }

  const oldRender = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRender && !window.__v141WrappedRenderPage) {
    window.__v141WrappedRenderPage = true;
    window.renderPage = function renderPageV141(){
      const out = oldRender.apply(this, arguments);
      setTimeout(ensureControls, 0);
      setTimeout(ensureControls, 150);
      return out;
    };
    try { renderPage = window.renderPage; } catch(_) {}
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('[data-field="is_long_term_leave"]')) {
      const card = t.closest('[data-staff-row]');
      if (card) updateLongLeave(card.getAttribute('data-staff-row'), t.value === 'true');
    }
  }, true);

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-v141-reset-balance]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    resetBalance(btn.getAttribute('data-v141-reset-balance'));
  }, true);

  document.addEventListener('DOMContentLoaded', () => setTimeout(ensureControls, 250));
  setInterval(ensureControls, 1200);
})();
