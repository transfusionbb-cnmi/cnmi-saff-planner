/* CNMI Duty Hub v96 - Position outing must be real outing with participants
   Patch-only. Load after v94/v95.
   Purpose:
   - จัดตำแหน่งรายเดือน/รายวัน: ใช้ template ออกหน่วย เฉพาะวันที่มีกิจกรรม 'ออกหน่วย' และมี participant_ids จริง
   - ไม่ให้กิจกรรมออกหน่วยที่ import มา/ไม่มีผู้เข้าร่วม ไปทำให้ทั้งวันกลายเป็นออกหน่วย
   - เพิ่มปุ่มล้างตำแหน่งออกหน่วยที่หลุดเข้ามาผิดวัน เฉพาะในร่างปัจจุบัน ไม่บันทึกจนกดบันทึกเอง
*/
(function(){
  'use strict';
  const PATCH = 'v96-position-outing-real-participants';

  function S(){ try { return typeof state !== 'undefined' ? state : null; } catch(e){ return null; } }
  function safe(fn, fallback){ try { return fn(); } catch(e){ console.warn('[CNMI]', PATCH, e); return fallback; } }
  function esc(v){ return safe(() => escapeHtml(v), String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))); }
  function arr(v){
    if (Array.isArray(v)) return v.filter(Boolean);
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || s === '[]') return [];
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch(e) {}
      return s.split(/[,,;\n|]+/).map(x => x.trim()).filter(Boolean);
    }
    return [];
  }
  function inRange(date, a){
    return safe(() => dateInRange(date, a.start_date, a.end_date), String(a?.start_date || '') <= date && String(a?.end_date || '') >= date);
  }
  function realOutingActivities(date){
    return (S()?.activities || []).filter(a => {
      if (String(a.event_type || '').trim() !== 'ออกหน่วย') return false;
      if (!inRange(date, a)) return false;
      return arr(a.participant_ids).length > 0;
    });
  }
  function hasRealOuting(date){ return realOutingActivities(date).length > 0; }
  function realOutingParticipants(date){
    const ids = new Set();
    realOutingActivities(date).forEach(a => arr(a.participant_ids).forEach(id => ids.add(id)));
    return [...ids];
  }
  function isOutingCode(code){
    const base = safe(() => positionBaseCode(code), String(code || '').replace(/\s+#\d+$/, '').trim());
    const list = safe(() => OUTING_POSITIONS || [], []);
    return list.some(p => p.code === base) || /^OUTING:/.test(base) || /^DR-/.test(base) || base === 'BB-Support';
  }
  function isOutingRow(row){
    const zone = String(row?.zone || '').trim();
    const code = String(row?.position_code || row?.code || '').trim();
    return zone.includes('ออกหน่วย') || isOutingCode(code);
  }

  // Expose for debugging in browser console if needed.
  window.cnmiHasRealOutingForPosition = hasRealOuting;
  window.cnmiRealOutingParticipantsForPosition = realOutingParticipants;

  // Override only the position outing decision. Calendar กลาง still shows activity_events normally.
  if (typeof hasOuting === 'function') {
    window.hasOuting = hasOuting = function(date){ return hasRealOuting(date); };
  }
  if (typeof outingParticipants === 'function') {
    window.outingParticipants = outingParticipants = function(date){ return realOutingParticipants(date); };
  }
  if (typeof positionTemplateForDate === 'function') {
    window.positionTemplateForDate = positionTemplateForDate = function(date){
      if (safe(() => isNoPositionDay(date), false)) return [];
      return hasRealOuting(date) ? safe(() => OUTING_POSITIONS, []) : safe(() => DEFAULT_POSITIONS, []);
    };
  }
  if (typeof positionTemplateByCode === 'function') {
    window.positionTemplateByCode = positionTemplateByCode = function(code, date){
      date = date || safe(() => todayStr(), new Date().toISOString().slice(0,10));
      const base = safe(() => positionBaseCode(code), String(code || '').replace(/\s+#\d+$/, '').trim());
      const first = hasRealOuting(date) ? [...safe(() => OUTING_POSITIONS, []), ...safe(() => DEFAULT_POSITIONS, [])] : [...safe(() => DEFAULT_POSITIONS, []), ...safe(() => OUTING_POSITIONS, [])];
      return first.find(p => p.code === base) || null;
    };
  }

  // If monthly draft has bad outing rows on non-real outing dates, keep them from being counted/displayed as outing.
  if (typeof renderMonthPositionCell === 'function') {
    const oldRenderCell = renderMonthPositionCell;
    window.renderMonthPositionCell = renderMonthPositionCell = function(staff, date, cellRows, canEdit){
      const real = hasRealOuting(date);
      const rows = (cellRows || []).filter(r => real || !isOutingRow(r));
      // If all rows were bad outing rows, render as blank/review cell instead of showing ออกหน่วย.
      if (!real && (cellRows || []).length && !rows.length) {
        if (safe(() => isNoPositionDay(date), false)) return `<td class="matrix-cell no-position-day"><span>${safe(() => isHolidayDate(date), false) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
        const leave = safe(() => isTrueLeaveOn ? isTrueLeaveOn(staff.id, date) : isActiveLeaveOn(staff.id, date), false);
        const cls = `${leave ? 'leave-cell' : 'needs-review-cell'}`.trim();
        if (canEdit && !leave) {
          const options = safe(() => DEFAULT_POSITIONS.map(t => `<option value="${esc(t.code)}">${esc(positionLabelForCell(t.code))}</option>`).join(''), '');
          return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(date)}|${esc(staff.id)}"><option value="">รอตรวจสอบ</option>${options}</select><div class="cell-note warning-note">ตำแหน่งออกหน่วยผิดวัน</div></td>`;
        }
        return `<td class="matrix-cell ${cls}"><span>${leave ? 'ลา' : 'รอตรวจสอบ'}</span>${leave ? '<div class="cell-note">ไม่ต้องจัดตำแหน่ง</div>' : '<div class="cell-note warning-note">ตำแหน่งออกหน่วยผิดวัน</div>'}</td>`;
      }
      return oldRenderCell.call(this, staff, date, rows, canEdit);
    };
  }

  function currentPositionMonthKey(){
    return safe(() => state.positionMonthKey || state.monthKey || new Date().toISOString().slice(0,7), new Date().toISOString().slice(0,7));
  }
  function ensureDraft(){
    if (typeof ensureMonthPositionDraftForEdit === 'function') ensureMonthPositionDraftForEdit();
    const st = S();
    const key = currentPositionMonthKey();
    if (!st.monthPositionDraft || st.monthPositionDraft.monthKey !== key) {
      st.monthPositionDraft = { monthKey: key, rows: (st.positions || []).filter(r => String(r.work_date || '').startsWith(key)).map(r => ({...r})) };
    }
    return st.monthPositionDraft;
  }
  function cleanFalseOutingRows(){
    if (!safe(() => isAdmin(), false)) return safe(() => showToast('เฉพาะ Admin เท่านั้น'), null);
    const draft = ensureDraft();
    const before = (draft.rows || []).length;
    draft.rows = (draft.rows || []).filter(r => {
      if (!r?.work_date) return true;
      if (hasRealOuting(r.work_date)) return true;
      return !isOutingRow(r);
    });
    const removed = before - draft.rows.length;
    safe(() => renderPage(), null);
    safe(() => showToast(removed ? `ล้างตำแหน่งออกหน่วยผิดวัน ${removed} ช่องแล้ว กดบันทึกแผนทั้งเดือนเพื่อบันทึกจริง` : 'ไม่พบตำแหน่งออกหน่วยผิดวันในร่างนี้'), null);
  }

  // Patch monthly build: after old builder runs, remove outing positions from non-real outing dates.
  if (typeof buildMonthlyPositionDraft === 'function') {
    const oldBuild = buildMonthlyPositionDraft;
    window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function(key){
      const draft = oldBuild.call(this, key);
      if (draft && Array.isArray(draft.rows)) {
        draft.rows = draft.rows.filter(r => !r?.work_date || hasRealOuting(r.work_date) || !isOutingRow(r));
      }
      return draft;
    };
  }

  // Add button to clean current draft/saved display without touching database until Save.
  function injectCleanButton(){
    if (!safe(() => isAdmin(), false)) return;
    if (safe(() => state.page, '') !== 'positionMonth') return;
    if (document.querySelector('[data-clean-false-outing-month]')) return;
    const toolbar = document.querySelector('.toolbar, .position-month-toolbar, .card .toolbar') || document.querySelector('.card');
    if (!toolbar) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost-btn';
    btn.setAttribute('data-clean-false-outing-month', '1');
    btn.textContent = 'ล้างออกหน่วยผิดวัน';
    toolbar.appendChild(btn);
  }

  document.addEventListener('click', function(e){
    const t = e.target.closest('[data-clean-false-outing-month]');
    if (!t) return;
    e.preventDefault();
    cleanFalseOutingRows();
  }, true);

  function injectStyle(){
    if (document.getElementById('cnmi-v96-style')) return;
    const style = document.createElement('style');
    style.id = 'cnmi-v96-style';
    style.textContent = `
      .month-position-matrix .warning-note { color:#b45309; font-weight:700; }
      [data-clean-false-outing-month] { margin-left: 8px; }
    `;
    document.head.appendChild(style);
  }

  const oldRenderPage = safe(() => renderPage, null);
  if (typeof oldRenderPage === 'function' && !oldRenderPage.__v96OutingPositionPatched) {
    const patched = function(){
      const out = oldRenderPage.apply(this, arguments);
      injectStyle();
      setTimeout(injectCleanButton, 0);
      return out;
    };
    patched.__v96OutingPositionPatched = true;
    window.renderPage = renderPage = patched;
  }

  document.addEventListener('DOMContentLoaded', () => { injectStyle(); setTimeout(injectCleanButton, 100); });
  setTimeout(() => { injectStyle(); injectCleanButton(); }, 500);
  console.log('[CNMI]', PATCH, 'loaded');
})();
