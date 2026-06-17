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
