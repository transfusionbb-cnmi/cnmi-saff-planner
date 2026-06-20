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
