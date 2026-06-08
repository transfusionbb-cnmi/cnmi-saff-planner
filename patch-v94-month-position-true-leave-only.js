/* CNMI Duty Hub v94 - Monthly position true leave only
   Patch-only. Load after v89+.
   Purpose:
   - In จัดตำแหน่งรายเดือน, block only real leave types (ลา...).
   - ไม่รับเวร is NOT a reason to hide/select-block daily positions.
   - Outing note shows only on actual outing-position cells, not every staff cell on an outing day.
*/
(function(){
  'use strict';
  const PATCH = 'v94-month-position-true-leave-only';

  function S(){ try { return (typeof state !== 'undefined') ? state : null; } catch(e){ return null; } }
  function safe(fn, fallback){ try { return fn(); } catch(e){ console.warn('[CNMI]', PATCH, e); return fallback; } }
  function esc(v){ return safe(() => escapeHtml(v), String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))); }

  function isTrueLeaveType(type){
    const t = String(type || '').trim();
    // Only true leave should block monthly/daily position assignment.
    // Important: ไม่รับเวร means no OT/duty, but the person can still work daytime positions.
    return t.startsWith('ลา') && t !== 'ไม่รับเวร';
  }

  function overlaps(l, date){
    return safe(() => overlapsDate(l, date), String(l?.start_date || '') <= date && String(l?.end_date || '') >= date);
  }

  function isTrueLeaveOn(staffId, date){
    const st = S();
    return !!(st?.leaves || []).some(l => l.staff_id === staffId && l.status !== 'cancelled' && isTrueLeaveType(l.type) && overlaps(l, date));
  }

  function isOutingRow(row){
    if (!row) return false;
    const zone = String(row.zone || '').trim();
    const code = String(row.position_code || row.code || '').trim();
    if (zone.includes('ออกหน่วย')) return true;
    if (/^DR-|^BB-/.test(code) && zone.includes('Donor')) return true;
    return false;
  }

  // Keep daily/monthly position candidate logic aligned: only true leave blocks position work.
  if (typeof positionCandidateOk === 'function') {
    const oldRuleOk = safe(() => positionRuleOk, null);
    const oldEligible = safe(() => positionEligible, null);
    const oldEnabled = safe(() => isDailyPositionEnabled, null);
    window.positionCandidateOk = positionCandidateOk = function(staff, positionRow, date){
      date = date || safe(() => todayStr(), new Date().toISOString().slice(0,10));
      if (!staff) return false;
      const eligibilityKey = positionRow?.eligibility_code || positionRow?.code || positionRow?.position_code;
      return safe(() => oldEnabled ? oldEnabled(staff) : (!!staff?.is_active), !!staff?.is_active)
        && !isTrueLeaveOn(staff.id, date)
        && safe(() => oldRuleOk ? oldRuleOk(staff, positionRow?.main_rule) : true, true)
        && safe(() => oldEligible ? oldEligible(staff, eligibilityKey) : true, true);
    };
  }

  if (typeof dailyWorkingStaff === 'function') {
    window.dailyWorkingStaff = dailyWorkingStaff = function(date){
      return safe(() => orderedStaff((S()?.staff || []).filter(st => isDailyPositionEnabled(st) && !isTrueLeaveOn(st.id, date))), []);
    };
  }

  if (typeof workingPositionStaffIdsForDate === 'function') {
    window.workingPositionStaffIdsForDate = workingPositionStaffIdsForDate = function(date){
      return safe(() => orderedStaff((S()?.staff || []).filter(st => isDailyPositionEnabled(st) && !isTrueLeaveOn(st.id, date))).map(s => s.id), []);
    };
  }

  // Recalculate monthly position summaries using only true leave as excluded days.
  if (typeof buildMonthPositionSummary === 'function') {
    window.buildMonthPositionSummary = buildMonthPositionSummary = function(rows, dates){
      const dateSet = new Set(dates || []);
      const summary = {};
      (rows || []).forEach(r => {
        if (!r.staff_id || !r.work_date || (dateSet.size && !dateSet.has(r.work_date))) return;
        if (safe(() => isNoPositionDay(r.work_date), false)) return;
        if (isTrueLeaveOn(r.staff_id, r.work_date)) return;
        const st = (S()?.staff || []).find(s => s.id === r.staff_id);
        if (!st || !safe(() => isDailyPositionEnabled(st), !!st?.is_active)) return;
        summary[r.staff_id] = summary[r.staff_id] || { zones:{}, positions:{}, dates:new Set(), rows:[] };
        const zone = r.zone || 'ไม่ระบุห้อง';
        const code = r.position_code || 'ไม่ระบุตำแหน่ง';
        summary[r.staff_id].zones[zone] = (summary[r.staff_id].zones[zone] || 0) + 1;
        summary[r.staff_id].positions[code] = (summary[r.staff_id].positions[code] || 0) + 1;
        summary[r.staff_id].dates.add(r.work_date);
        summary[r.staff_id].rows.push(r);
      });
      return summary;
    };
  }

  // Override cell render so no-duty is selectable and outing note is not stamped on everyone.
  if (typeof renderMonthPositionCell === 'function') {
    window.renderMonthPositionCell = renderMonthPositionCell = function(staff, date, cellRows, canEdit=false){
      const noDay = safe(() => isNoPositionDay(date), false);
      const leave = isTrueLeaveOn(staff.id, date);
      if (noDay) return `<td class="matrix-cell no-position-day"><span>${safe(() => isHolidayDate(date), false) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;

      const row = (cellRows || [])[0] || null;
      const cleanCodes = (cellRows || []).map(r => safe(() => positionLabelForCell(r.position_code || r.code), r.position_code || r.code));
      const rowOuting = (cellRows || []).some(isOutingRow);
      const cls = `${rowOuting ? 'outing-cell' : ''} ${leave ? 'leave-cell' : ''} ${!cleanCodes.length && !leave ? 'needs-review-cell' : ''}`.trim();

      if (canEdit && !leave) {
        const current = row?.position_code || '';
        const options = safe(() => ALL_POSITION_TEMPLATES.map(t => `<option value="${esc(t.code)}" ${current===t.code?'selected':''}>${esc(positionLabelForCell(t.code))}</option>`).join(''), '');
        return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(date)}|${esc(staff.id)}"><option value="">รอตรวจสอบ</option>${options}</select>${rowOuting ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
      }

      const text = cleanCodes.length ? cleanCodes.join('<br>') : (leave ? 'ลา' : 'รอตรวจสอบ');
      const leaveMark = leave ? '<div class="cell-note">ไม่ต้องจัดตำแหน่ง</div>' : '';
      const outingMark = rowOuting ? '<div class="cell-note">ออกหน่วย</div>' : '';
      return `<td class="matrix-cell ${cls}"><span>${text}</span>${leaveMark}${outingMark}</td>`;
    };
  }

  // Improve modal wording so it does not say leave/no-duty together.
  if (typeof showMonthPositionStaffSummary === 'function') {
    const oldShow = showMonthPositionStaffSummary;
    window.showMonthPositionStaffSummary = showMonthPositionStaffSummary = function(staffId){
      // Let existing modal render first, then adjust wording after DOM is available.
      const out = oldShow.apply(this, arguments);
      setTimeout(() => {
        document.querySelectorAll('.modal, .modal-content, .dialog, body').forEach(root => {
          if (!root || !root.innerHTML) return;
          root.innerHTML = root.innerHTML.replaceAll('วันที่ลา/ไม่รับเวร', 'วันที่ลา').replaceAll('หักวันที่ลา/ไม่รับเวรแล้ว', 'หักวันที่ลาแล้ว');
        });
      }, 0);
      return out;
    };
  }

  function injectStyle(){
    if (document.getElementById('cnmi-v94-style')) return;
    const style = document.createElement('style');
    style.id = 'cnmi-v94-style';
    style.textContent = `
      .month-position-matrix .outing-cell:not(.leave-cell) { background: #fff5f7; }
      .month-position-matrix .leave-cell { background: #fff8d9; }
      .month-position-matrix .cell-note { font-size: 11px; opacity: .75; margin-top: 3px; }
    `;
    document.head.appendChild(style);
  }

  const oldRenderPage = safe(() => renderPage, null);
  if (typeof oldRenderPage === 'function' && !oldRenderPage.__v94MonthPositionPatched) {
    const patched = function(){
      const out = oldRenderPage.apply(this, arguments);
      injectStyle();
      return out;
    };
    patched.__v94MonthPositionPatched = true;
    window.renderPage = renderPage = patched;
  }

  document.addEventListener('DOMContentLoaded', injectStyle);
  setTimeout(injectStyle, 300);
  console.log('[CNMI]', PATCH, 'loaded');
})();
