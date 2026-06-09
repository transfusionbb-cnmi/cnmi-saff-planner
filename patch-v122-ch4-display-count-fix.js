/* CNMI Staff Planner Patch V122
   Scope: schedule display/count only
   - Show ช4-MT/แตง 1 and ช4-MT/แตง 2 as ช4 on monthly schedule screens/popups
   - Count both ช4 slots as ช4 in schedule summaries/staff stats
   - Keep backend duty_code split unchanged
*/
(function patchV122Ch4DisplayCountFix(){
  if (window.__CNMI_V122_CH4_DISPLAY_COUNT_FIX__) return;
  window.__CNMI_V122_CH4_DISPLAY_COUNT_FIX__ = true;

  const esc = (v) => {
    try { if (typeof escapeHtml === 'function') return escapeHtml(v); } catch (_) {}
    return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  };

  function normalizeDutyV122(code='') {
    const c = String(code || '').trim();
    if (!c) return '';
    if (c === 'ช9-MT') return 'ช9-MT/แตง';
    if (c === 'ช4A' || c === 'ช4-MT/แตง1' || c === 'ช4-MT/แตง-1' || c === 'ช4-1' || c === 'ช4-MT/แตง 1') return 'ช4-MT/แตง 1';
    if (c === 'ช4B' || c === 'ช4-MT/แตง2' || c === 'ช4-MT/แตง-2' || c === 'ช4-2' || c === 'ช4-MT/แตง 2') return 'ช4-MT/แตง 2';
    if (c === 'ช4' || c === 'ช4-MT/แตง') return 'ช4-MT/แตง 1';
    return c;
  }

  function isCh4V122(code='') {
    return normalizeDutyV122(code).startsWith('ช4');
  }

  function displayDutyV122(code='') {
    const c = normalizeDutyV122(code);
    if (c.startsWith('ช4')) return 'ช4';
    if (c.startsWith('ช9')) return 'ช9';
    return c;
  }

  function compactCh4HtmlV122(html='') {
    return String(html)
      .replace(/ช4-MT\/แตง\s*1/g, 'ช4')
      .replace(/ช4-MT\/แตง\s*2/g, 'ช4')
      .replace(/ช4-MT\/แตง/g, 'ช4')
      .replace(/ช4A/g, 'ช4')
      .replace(/ช4B/g, 'ช4');
  }

  try {
    if (typeof DUTY_LABEL !== 'undefined') {
      DUTY_LABEL['ช4A'] = 'ช4';
      DUTY_LABEL['ช4B'] = 'ช4';
      DUTY_LABEL['ช4-MT/แตง'] = 'ช4';
      DUTY_LABEL['ช4-MT/แตง 1'] = 'ช4';
      DUTY_LABEL['ช4-MT/แตง 2'] = 'ช4';
    }
  } catch (_) {}

  // Monthly Excel table display only: do not change assignment objects/back-end codes.
  const previousRenderSchedulePersonMatrix = window.renderSchedulePersonMatrix || (typeof renderSchedulePersonMatrix === 'function' ? renderSchedulePersonMatrix : null);
  if (previousRenderSchedulePersonMatrix) {
    window.renderSchedulePersonMatrix = renderSchedulePersonMatrix = function renderSchedulePersonMatrixV122(assignments) {
      return compactCh4HtmlV122(previousRenderSchedulePersonMatrix(assignments));
    };
  }

  // Fix summary counters that depend on calcFairness. Convert ช4 1/2 to the legacy display code only while calculating summary.
  const previousCalcFairness = window.calcFairness || (typeof calcFairness === 'function' ? calcFairness : null);
  if (previousCalcFairness) {
    window.calcFairness = calcFairness = function calcFairnessV122(assignments) {
      const displayCalcRows = (assignments || []).map(a => isCh4V122(a?.duty_code) ? { ...a, duty_code:'ช4-MT/แตง' } : a);
      return previousCalcFairness(displayCalcRows);
    };
  }

  // Old staff-stat popup can still be opened from staff chips/table cells; make ช4 display/count stable there too.
  if (typeof showStaffStats === 'function') {
    window.showStaffStats = showStaffStats = function showStaffStatsV122(staffId) {
      const rows = (typeof getAssignmentsForMonth === 'function' ? getAssignmentsForMonth(state.monthKey) : [])
        .filter(x => String(x.staff_id) === String(staffId));
      const stats = (typeof calcFairness === 'function' ? calcFairness(rows) : {})[staffId] || {};
      const countCode = (code) => rows.filter(a => normalizeDutyV122(a.duty_code) === normalizeDutyV122(code)).length;
      const countGroup = (fn) => rows.filter(fn).length;
      const detail = rows.slice().sort((a,b) => String(a.duty_date).localeCompare(String(b.duty_date))).map(a => {
        const dm = typeof dutyMetrics === 'function' ? dutyMetrics(a) : { hours:0 };
        const dateText = typeof formatThaiDate === 'function' ? formatThaiDate(a.duty_date) : a.duty_date;
        return `<tr><td>${esc(dateText)}</td><td>${esc(displayDutyV122(a.duty_code))}</td><td>${Number(dm.hours || 0).toFixed(0)} ชม.</td></tr>`;
      }).join('');
      const ch4Count = countGroup(a => isCh4V122(a.duty_code));
      const ch9Count = countGroup(a => normalizeDutyV122(a.duty_code).startsWith('ช9'));
      const ch3Count = countGroup(a => ['ช3A','ช3B'].includes(normalizeDutyV122(a.duty_code)));
      const person = typeof staffPill === 'function' ? staffPill(staffId) : esc(staffId);
      showModal(`<h2>${person}</h2><div class="grid grid-2 modal-stat-grid">${statCard('เวรรวม', stats.total || 0)}${statCard('ชม.รวม', Number(stats.hours || 0).toFixed(1))}${statCard('เงินประมาณ', Number(stats.pay || 0).toLocaleString())}${statCard('วันหยุด', stats.weekend || 0)}${statCard('ชบด1', countCode('ชบด1'))}${statCard('ชบด2', countCode('ชบด2'))}${statCard('ชบด3', countCode('ชบด3'))}${statCard('ช3A/ช3B', ch3Count)}${statCard('ช4', ch4Count)}${statCard('ช9', ch9Count)}</div><div class="compact-detail-table"><table><thead><tr><th>วันที่</th><th>เวร</th><th>ชม.ตั้งต้น</th></tr></thead><tbody>${detail || '<tr><td colspan="3">ยังไม่มีเวรในเดือนนี้</td></tr>'}</tbody></table></div>`);
    };
  }
})();
