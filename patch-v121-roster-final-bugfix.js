/* V121 final roster bugfix
   - 2 ช4 slots: ช4-MT/แตง 1 + ช4-MT/แตง 2
   - keep duty eligibility ticks after save
   - holiday role mode: MT / MT / เคิก or MT / MT / MT
   - desktop schedule tabs: table / day / person only
   - mobile day calendar cards + compact mobile Excel roster
*/
(function(){
  if (window.__CNMI_V121_ROSTER_FINAL_BUGFIX__) return;
  window.__CNMI_V121_ROSTER_FINAL_BUGFIX__ = true;

  const MARKER = ':::DUTY_RULES:';
  const DUTY_CODES = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  const DUTY_ORDER = new Map(DUTY_CODES.map((c,i)=>[c,i]));
  const WEEKDAYS = [
    {key:'sun', label:'อาทิตย์', js:0},
    {key:'mon', label:'จันทร์', js:1},
    {key:'tue', label:'อังคาร', js:2},
    {key:'wed', label:'พุธ', js:3},
    {key:'thu', label:'พฤหัสบดี', js:4},
    {key:'fri', label:'ศุกร์', js:5},
    {key:'sat', label:'เสาร์', js:6}
  ];

  const esc = (v) => {
    try { if (typeof escapeHtml === 'function') return escapeHtml(v); } catch(e) {}
    return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  };
  const $id = (id) => document.getElementById(id);
  const padSafe = (n) => { try { return pad(n); } catch(e) { return String(n).padStart(2,'0'); } };
  const parseSafe = (d) => { try { return parseDate(d); } catch(e) { return new Date(`${d}T00:00:00`); } };
  const currentStaffSafe = () => { try { return currentStaffId(); } catch(e) { return state?.profile?.id || null; } };
  const monthKeySafe = () => state.monthKey || (typeof monthKey === 'function' ? monthKey(new Date()) : new Date().toISOString().slice(0,7));
  const monthRangeSafe = (key) => {
    try { return getMonthRange(key); } catch(e) {
      const [y,m] = String(key).split('-').map(Number);
      return {y,m,start:`${y}-${padSafe(m)}-01`,end:`${y}-${padSafe(m)}-${padSafe(new Date(y,m,0).getDate())}`};
    }
  };
  const isWeekendSafe = (date) => { try { return isWeekend(date); } catch(e) { return [0,6].includes(parseSafe(date).getDay()); } };
  const isHolidaySafe = (date) => { try { return isHolidayDate(date); } catch(e) { return (state.holidays || []).some(h => h.holiday_date === date); } };
  const dateThai = (date) => { try { return formatThaiDate(date); } catch(e) { return date; } };
  const staffById = (id) => (state.staff || []).find(s => String(s.id) === String(id));
  const staffName = (id) => {
    const s = staffById(id);
    return s?.nickname || s?.full_name || '-';
  };
  const staffList = () => {
    const base = (state.staff || []).filter(s => {
      try { return isRosterEnabled(s); } catch(e) { return true; }
    });
    try { return orderedStaff(base); } catch(e) { return base; }
  };
  const colorOf = (staffOrId) => {
    const s = typeof staffOrId === 'object' ? staffOrId : staffById(staffOrId);
    let bg = '#dbeafe';
    let fg = '#0f172a';
    try { bg = staffColor(s || staffOrId); fg = textColorFor(bg); } catch(e) {}
    return { bg, fg, css:`background:${bg};color:${fg};--staff-bg:${bg};--staff-fg:${fg}` };
  };
  const staffPillSafe = (id) => {
    try { return staffPill(id); } catch(e) {}
    const cs = colorOf(id);
    return `<span class="staff-chip" style="${cs.css}">${esc(staffName(id))}</span>`;
  };

  function normalizeDutyV121(code='') {
    const c = String(code || '').trim();
    if (!c) return '';
    if (c === 'ช9-MT') return 'ช9-MT/แตง';
    if (c === 'ช4A' || c === 'ช4-MT/แตง1' || c === 'ช4-MT/แตง-1' || c === 'ช4-1' || c === 'ช4-MT/แตง 1') return 'ช4-MT/แตง 1';
    if (c === 'ช4B' || c === 'ช4-MT/แตง2' || c === 'ช4-MT/แตง-2' || c === 'ช4-2' || c === 'ช4-MT/แตง 2') return 'ช4-MT/แตง 2';
    // legacy single ช4 is treated as slot 1; slot 2 is added automatically by ensureMonthSlotsV121()
    if (c === 'ช4' || c === 'ช4-MT/แตง') return 'ช4-MT/แตง 1';
    return c;
  }
  function staffDutyLabelV121(code='') {
    const c = normalizeDutyV121(code);
    if (c.startsWith('ช4')) return 'ช4';
    if (c.startsWith('ช9')) return 'ช9';
    return c;
  }
  function adminDutyLabelV121(code='') { return normalizeDutyV121(code); }
  function dutySortV121(a,b) {
    return (DUTY_ORDER.get(normalizeDutyV121(a)) ?? 99) - (DUTY_ORDER.get(normalizeDutyV121(b)) ?? 99) || String(a).localeCompare(String(b));
  }

  try {
    DUTY_LABEL['ช4-MT/แตง 1'] = 'ช4';
    DUTY_LABEL['ช4-MT/แตง 2'] = 'ช4';
    DUTY_LABEL['ช4-MT/แตง'] = 'ช4';
    DUTY_LABEL['ช9-MT/แตง'] = 'ช9';
  } catch(e) {}

  function cleanHolidayTitleV121(title='') {
    const text = String(title || '');
    const idx = text.indexOf(MARKER);
    return (idx >= 0 ? text.slice(0, idx) : text).trim() || 'วันหยุดราชการ';
  }
  function decodeHolidayV121(title='') {
    const text = String(title || '');
    const start = text.indexOf(MARKER);
    if (start < 0) return null;
    const raw = text.slice(start + MARKER.length).split(':::')[0];
    try { return JSON.parse(decodeURIComponent(escape(atob(raw)))); }
    catch(e) { try { return JSON.parse(atob(raw)); } catch(_) { return null; } }
  }
  function encodeHolidayV121(title, duties, roleMode) {
    const allowed = new Set((duties || []).map(normalizeDutyV121));
    const json = JSON.stringify({
      duties: DUTY_CODES.reduce((acc, c) => { acc[c] = allowed.has(c); return acc; }, {}),
      roleMode: roleMode === 'MT_MT_MT' ? 'MT_MT_MT' : 'MT_MT_KERK'
    });
    let encoded = '';
    try { encoded = btoa(unescape(encodeURIComponent(json))); } catch(e) { encoded = btoa(json); }
    return `${String(title || '').trim()} ${MARKER}${encoded}:::`.trim();
  }
  function holidayRowV121(date) { return (state.holidays || []).find(h => h.holiday_date === date); }
  function holidayCfgV121(date) { return decodeHolidayV121(holidayRowV121(date)?.title || '') || null; }
  function holidayRoleModeV121(date) { return holidayCfgV121(date)?.roleMode || 'MT_MT_KERK'; }
  function holidayAllowedV121(date) {
    const cfg = holidayCfgV121(date);
    if (!cfg?.duties) return ['ชบด1','ชบด2','ชบด3'];
    const duties = cfg.duties || {};
    const out = [];
    DUTY_CODES.forEach(code => {
      const legacyCh4 = code.startsWith('ช4') && duties['ช4-MT/แตง'];
      const legacyCh9 = code === 'ช9-MT/แตง' && duties['ช9-MT'];
      if (duties[code] || legacyCh4 || legacyCh9) out.push(code);
    });
    return out.length ? out : ['ชบด1','ชบด2','ชบด3'];
  }
  function dayKeyV121(date) { return ['sun','mon','tue','wed','thu','fri','sat'][parseSafe(date).getDay()]; }
  function defaultCodesForDayKeyV121(key) {
    if (key === 'sat' || key === 'sun') return ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง'];
    return ['ชบด1','ชบด2','ชบด3','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  }
  function defaultCodesForDateV121(date) {
    if (isHolidaySafe(date)) return holidayAllowedV121(date).map(normalizeDutyV121);
    return defaultCodesForDayKeyV121(dayKeyV121(date));
  }
  function roleForDutyV121(code, date=null) {
    const c = normalizeDutyV121(code);
    if (c === 'ช9-เคิก') return 'เคิก';
    if (c === 'ช9-MT/แตง' || c.startsWith('ช4')) return 'MT_OR_TANG';
    if (c === 'ชบด3' && date && isHolidaySafe(date)) return holidayRoleModeV121(date) === 'MT_MT_MT' ? 'MT' : 'เคิก';
    if (c === 'ชบด3') return 'MT_OR_KERK';
    return 'MT';
  }
  function eligibilityCodeV121(day, code) { return `DUTY_RULE:${day}:${normalizeDutyV121(code)}`; }
  function legacyEligibilityCodesV121(day, code) {
    const c = normalizeDutyV121(code);
    const arr = [eligibilityCodeV121(day,c)];
    if (c.startsWith('ช4')) arr.push(`DUTY_RULE:${day}:ช4-MT/แตง`);
    if (c === 'ช9-MT/แตง') arr.push(`DUTY_RULE:${day}:ช9-MT`);
    return arr;
  }
  function eligibilityRowsV121(staffId) {
    return (state.positionEligibility || []).filter(r => String(r.staff_id) === String(staffId) && String(r.position_code || '').startsWith('DUTY_RULE:'));
  }
  function eligibilityMemoryKeyV121(staffId, day, code) { return `${staffId}|${day}|${normalizeDutyV121(code)}`; }
  function readEligibilityV121(staffId, day, code) {
    const c = normalizeDutyV121(code);
    const memory = state.__v121EligibilityMemory || {};
    const mk = eligibilityMemoryKeyV121(staffId, day, c);
    if (Object.prototype.hasOwnProperty.call(memory, mk)) return !!memory[mk];
    const rows = eligibilityRowsV121(staffId);
    const exact = rows.find(r => r.position_code === eligibilityCodeV121(day, c));
    if (exact) return !!exact.is_eligible;
    const legacyCodes = legacyEligibilityCodesV121(day, c).slice(1);
    const legacy = rows.find(r => legacyCodes.includes(r.position_code));
    if (legacy) return !!legacy.is_eligible;
    return defaultCodesForDayKeyV121(day).includes(c);
  }
  function staffEligibleForDutyV121(staff, date, dutyCode) {
    if (!staff) return false;
    try { if (!isRosterEnabled(staff)) return false; } catch(e) {}
    const rows = eligibilityRowsV121(staff.id);
    if (!rows.length && !state.__v121EligibilityMemory) {
      try { return supportsRequiredRole(staff, roleForDutyV121(dutyCode, date)); } catch(e) { return true; }
    }
    return readEligibilityV121(staff.id, dayKeyV121(date), dutyCode);
  }
  function normalizeAssignmentV121(a) {
    if (!a) return a;
    const code = normalizeDutyV121(a.duty_code);
    return { ...a, duty_code: code, required_role: roleForDutyV121(code, a.duty_date), _v121_normalized_from: a.duty_code };
  }
  function tempIdV121(date, code) {
    try { return uid(); } catch(e) { return `tmp-v121-${date}-${code}-${Math.random().toString(16).slice(2)}`; }
  }
  function ensureMonthSlotsV121(rows, key) {
    const range = monthRangeSafe(key);
    const last = new Date(range.y, range.m, 0).getDate();
    const byKey = new Map();
    (rows || []).map(normalizeAssignmentV121).forEach(row => {
      if (!row?.duty_date || !row?.duty_code) return;
      const k = `${row.duty_date}|${row.duty_code}`;
      const old = byKey.get(k);
      if (!old || (!old.staff_id && row.staff_id) || (!old.id && row.id)) byKey.set(k, row);
    });
    for (let d=1; d<=last; d++) {
      const date = `${range.y}-${padSafe(range.m)}-${padSafe(d)}`;
      defaultCodesForDateV121(date).forEach(code => {
        const c = normalizeDutyV121(code);
        const k = `${date}|${c}`;
        if (!byKey.has(k)) byKey.set(k, { _temp_id:tempIdV121(date,c), duty_date:date, duty_code:c, required_role:roleForDutyV121(c,date), staff_id:null, is_locked:false });
      });
    }
    return Array.from(byKey.values()).sort((a,b) => String(a.duty_date).localeCompare(String(b.duty_date)) || dutySortV121(a.duty_code,b.duty_code));
  }
  function assignmentIdV121(a) { return String(a?.id || a?._temp_id || `${a?.duty_date}|${a?.duty_code}|${a?.staff_id || ''}`); }

  window.supportsRequiredRole = supportsRequiredRole = function supportsRequiredRoleV121(staff, required) {
    if (!required || required === 'ANY') return true;
    if (required === 'MT_OR_TANG') return staff?.staff_type === 'MT' || staff?.nickname === 'แตง';
    if (required === 'MT_OR_KERK') return staff?.staff_type === 'MT' || staff?.staff_type === 'เคิก';
    return staff?.staff_type === required;
  };
  window.dutyStaffTypeForRate = dutyStaffTypeForRate = function dutyStaffTypeForRateV121(staffId, dutyCode='') {
    const s = staffById(staffId);
    const code = normalizeDutyV121(dutyCode);
    if (!s) return 'MT';
    if ((code === 'ช9-MT/แตง' || code.startsWith('ช4')) && s.nickname === 'แตง') return 'MT';
    return s.staff_type === 'เคิก' ? 'เคิก' : 'MT';
  };
  window.dutyHoursForCode = dutyHoursForCode = function dutyHoursForCodeV121(date, dutyCode='') {
    const c = normalizeDutyV121(dutyCode);
    if (c.startsWith('ช4')) return 0;
    if (c.startsWith('ช9')) return 8;
    if (c === 'ช3A' || c === 'ช3B') return 8;
    if (['ชบด1','ชบด2','ชบด3'].includes(c)) return (isWeekendSafe(date) || isHolidaySafe(date)) ? 24 : 16;
    return (isWeekendSafe(date) || isHolidaySafe(date)) ? 24 : 16;
  };
  window.dutyUnitsForCode = dutyUnitsForCode = function dutyUnitsForCodeV121(date, dutyCode='') {
    const c = normalizeDutyV121(dutyCode);
    if (c.startsWith('ช4')) return 0;
    if (c === 'ช3A' || c === 'ช3B') return 1;
    return dutyHoursForCode(date,c) / 8;
  };
  window.dutyMetrics = dutyMetrics = function dutyMetricsV121(a, staffIdOverride=null) {
    const date = a?.duty_date || a;
    const code = normalizeDutyV121(a?.duty_code || '');
    const staffId = staffIdOverride || a?.staff_id || null;
    const hours = dutyHoursForCode(date, code);
    const rate = staffId && typeof dutyRatePerHour === 'function' ? dutyRatePerHour(staffId, date, code) : 0;
    return { hours, rate, pay: hours * rate, units: dutyUnitsForCode(date, code), code, publicHoliday: isHolidaySafe(date), weekend: isWeekendSafe(date) };
  };
  window.dutyRuleForDate = dutyRuleForDate = function dutyRuleForDateV121(date) {
    return defaultCodesForDateV121(date).map(code => ({ code:normalizeDutyV121(code), role:roleForDutyV121(code,date) }));
  };
  window.allowedDutyCodesForDate = allowedDutyCodesForDate = function allowedDutyCodesForDateV121(date) {
    return dutyRuleForDate(date).map(x => x.code);
  };
  window.generateEmptyAssignments = generateEmptyAssignments = function generateEmptyAssignmentsV121(key) {
    return ensureMonthSlotsV121([], key);
  };
  window.getAssignmentsForMonth = getAssignmentsForMonth = function getAssignmentsForMonthV121(key) {
    if (state.rosterDraft?.monthKey === key) {
      state.rosterDraft.assignments = ensureMonthSlotsV121(state.rosterDraft.assignments || [], key);
      return state.rosterDraft.assignments;
    }
    const range = monthRangeSafe(key);
    const rows = (state.rosterAssignments || []).filter(x => x.duty_date >= range.start && x.duty_date <= range.end);
    return ensureMonthSlotsV121(rows, key);
  };
  window.canStaffWorkSlot = canStaffWorkSlot = function canStaffWorkSlotV121(staffId, slot, assignments=getAssignmentsForMonth(monthKeySafe())) {
    const s = staffById(staffId);
    const normalized = normalizeAssignmentV121(slot);
    if (!s) return false;
    try { if (!isRosterEnabled(s)) return false; } catch(e) {}
    if (!supportsRequiredRole(s, normalized.required_role || roleForDutyV121(normalized.duty_code, normalized.duty_date))) return false;
    if (!staffEligibleForDutyV121(s, normalized.duty_date, normalized.duty_code)) return false;
    try { if ((state.leaves || []).some(l => String(l.staff_id) === String(staffId) && overlapsDate(l, normalized.duty_date))) return false; } catch(e) {}
    try { if (hasSameDayDuty(staffId, normalized.duty_date, assignments, normalized)) return false; } catch(e) {}
    try { if (hasAdjacentDuty(staffId, normalized.duty_date, assignments, normalized)) return false; } catch(e) {}
    return true;
  };

  function renderDutyEligibilityPageV121() {
    if (typeof isAdmin === 'function' && !isAdmin()) return noPermission();
    const active = staffList();
    if (!active.length) return typeof empty === 'function' ? empty('ยังไม่มีเจ้าหน้าที่ที่เปิดสิทธิ์จัดเวร') : '<div>ยังไม่มีเจ้าหน้าที่</div>';
    if (!state.dutyEligibilityStaffId || !active.some(s => String(s.id) === String(state.dutyEligibilityStaffId))) state.dutyEligibilityStaffId = active[0].id;
    const selected = active.find(s => String(s.id) === String(state.dutyEligibilityStaffId)) || active[0];
    const hasRows = eligibilityRowsV121(selected.id).length > 0;
    const cs = colorOf(selected);
    const rows = WEEKDAYS.map(w => `<tr><th>${esc(w.label)}</th>${DUTY_CODES.map(code => {
      const checked = readEligibilityV121(selected.id, w.key, code);
      return `<td><label class="switch-check"><input type="checkbox" data-duty-eligibility-v121 data-staff-id="${esc(selected.id)}" data-day-key="${esc(w.key)}" data-duty-code="${esc(code)}" ${checked ? 'checked' : ''}><span></span></label></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="grid duty-eligibility-page-v121">
      <div class="card eligibility-staff-panel">
        <div class="section-title"><h3>เลือกเจ้าหน้าที่</h3></div>
        <label>เจ้าหน้าที่
          <select id="dutyEligibilityStaffSelectV121">${active.map(s => `<option value="${esc(s.id)}" ${String(selected.id) === String(s.id) ? 'selected' : ''}>${esc(s.nickname || s.full_name)} (${esc(s.staff_type || '-')})</option>`).join('')}</select>
        </label>
        <div class="selected-staff-card" style="${cs.css}"><b>${esc(selected.nickname || selected.full_name)}</b><br><span>${esc(selected.staff_type || selected.position || '')}</span></div>
        <div class="notice soft-notice">ใช้กับเวรเท่านั้น ไม่เกี่ยวกับตำแหน่งกลางวัน 08.00–16.00 น.</div>
      </div>
      <div class="card duty-eligibility-matrix-card">
        <div class="section-title"><div><h3>สิทธิ์เวรตามวันของ ${esc(selected.nickname || selected.full_name)}</h3><p class="hint">ช4-MT/แตง แยกเป็น 2 ช่อง เพื่อจัดได้วันละ 2 คน แต่หน้าของ staff จะแสดงเป็น “ช4” เท่านั้น</p></div><button class="primary-btn" type="button" data-save-duty-eligibility-v121>บันทึกสิทธิ์เวร</button></div>
        ${!hasRows ? '<div class="notice soft-notice">ยังไม่เคยตั้งสิทธิ์เวรของคนนี้ ระบบแสดงค่าเริ่มต้นให้ก่อน กดบันทึกเพื่อเริ่มใช้ตารางนี้</div>' : ''}
        <div class="table-wrap duty-eligibility-wrap"><table class="duty-eligibility-table v121-duty-table"><thead><tr><th>วัน</th>${DUTY_CODES.map(c => `<th>${esc(adminDutyLabelV121(c))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      </div>
    </div>`;
  }
  async function saveDutyEligibilityV121() {
    if (typeof isAdmin === 'function' && !isAdmin()) return showToast('เฉพาะ Admin เท่านั้น');
    const checks = Array.from(document.querySelectorAll('[data-duty-eligibility-v121]'));
    if (!checks.length) return showToast('ไม่มีข้อมูลสิทธิ์เวรให้บันทึก');
    const rows = checks.map(cb => ({
      staff_id: cb.dataset.staffId,
      position_code: eligibilityCodeV121(cb.dataset.dayKey, cb.dataset.dutyCode),
      is_eligible: !!cb.checked,
      updated_by: currentStaffSafe()
    }));
    const { error } = await sb.from('daily_position_eligibility').upsert(rows, { onConflict:'staff_id,position_code' });
    if (error) return showToast(typeof friendlyDbError === 'function' ? friendlyDbError(error) : error.message);
    const targetStaff = rows[0].staff_id;
    const rowCodes = new Set(rows.map(r => r.position_code));
    state.__v121EligibilityMemory = state.__v121EligibilityMemory || {};
    checks.forEach(cb => { state.__v121EligibilityMemory[eligibilityMemoryKeyV121(cb.dataset.staffId, cb.dataset.dayKey, cb.dataset.dutyCode)] = !!cb.checked; });
    state.positionEligibility = (state.positionEligibility || []).filter(r => !(String(r.staff_id) === String(targetStaff) && rowCodes.has(r.position_code))).concat(rows);
    state.rosterDraft = null;
    renderPage();
    showToast('บันทึกสิทธิ์เวรตามวันแล้ว');
  }

  function renderHolidayRulesPageV121() {
    if (typeof isAdmin === 'function' && !isAdmin()) return noPermission();
    const key = state.holidayRuleMonthKey || monthKeySafe();
    const list = (state.holidays || []).filter(h => String(h.holiday_date || '').startsWith(key)).sort((a,b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));
    const editing = state.editHolidayRuleDate ? holidayRowV121(state.editHolidayRuleDate) : null;
    const editDate = editing?.holiday_date || `${key}-01`;
    const cfg = editing ? holidayCfgV121(editing.holiday_date) : null;
    const allowed = editing ? holidayAllowedV121(editing.holiday_date) : ['ชบด1','ชบด2','ชบด3'];
    const mode = cfg?.roleMode || 'MT_MT_KERK';
    return `<div class="grid grid-2 holiday-rules-page-v121">
      <div class="card">
        <div class="section-title"><h3>${editing ? 'แก้ไขวันหยุดนักขัตฤกษ์' : 'เพิ่มวันหยุดนักขัตฤกษ์'}</h3>${editing ? '<button class="ghost-btn" type="button" data-cancel-edit-holiday-v121>ยกเลิกแก้ไข</button>' : ''}</div>
        <form id="holidayRulesFormV121" class="form-grid compact-form">
          <label>วันที่ <input name="holiday_date" type="date" value="${esc(editDate)}" ${editing ? 'readonly' : ''} required></label>
          <label>ชื่อวันหยุด <input name="title" value="${esc(cleanHolidayTitleV121(editing?.title || ''))}" placeholder="เช่น วันเฉลิมฯ" required></label>
          <label class="wide">รูปแบบคนอยู่เวรนักขัต
            <select name="holiday_role_mode">
              <option value="MT_MT_KERK" ${mode === 'MT_MT_KERK' ? 'selected' : ''}>MT / MT / เคิก</option>
              <option value="MT_MT_MT" ${mode === 'MT_MT_MT' ? 'selected' : ''}>MT / MT / MT</option>
            </select>
          </label>
          <div class="wide duty-checkbox-grid"><div class="field-label">เวรที่เปิดในวันนี้</div>${DUTY_CODES.map(code => `<label class="check-pill"><input type="checkbox" name="holiday_duties" value="${esc(code)}" ${allowed.includes(code) ? 'checked' : ''}> <span>${esc(adminDutyLabelV121(code))}</span></label>`).join('')}</div>
          <button class="primary-btn wide" type="submit">บันทึกวันหยุดและกฎเวร</button>
        </form>
        <div class="notice soft-notice">รูปแบบนี้คุม ชบด1 / ชบด2 / ชบด3 ของวันนักขัต เช่น MT / MT / เคิก หรือ MT / MT / MT ส่วนเวรที่เปิดในวันนั้นยังเลือกได้ตามเดิม</div>
      </div>
      <div class="card">
        <div class="section-title"><h3>รายการวันหยุด ${esc(key)}</h3></div>
        <div class="toolbar compact-filter"><label>เดือน <input type="month" id="holidayRuleMonthInputV121" value="${esc(key)}"></label></div>
        ${list.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th>รูปแบบ</th><th>เวรที่เปิด</th><th>จัดการ</th></tr></thead><tbody>${list.map(h => `<tr><td>${dateThai(h.holiday_date)}</td><td>${esc(cleanHolidayTitleV121(h.title))}</td><td>${holidayRoleModeV121(h.holiday_date) === 'MT_MT_MT' ? 'MT / MT / MT' : 'MT / MT / เคิก'}</td><td>${holidayAllowedV121(h.holiday_date).map(c => typeof badge === 'function' ? badge(adminDutyLabelV121(c),'blue') : `<span>${esc(adminDutyLabelV121(c))}</span>`).join(' ') || '-'}</td><td><button class="tiny-btn" type="button" data-edit-holiday-v121="${esc(h.holiday_date)}">แก้ไข</button><button class="tiny-btn danger" type="button" data-delete-holiday-v121="${esc(h.holiday_date)}">ลบ</button></td></tr>`).join('')}</tbody></table></div>` : (typeof empty === 'function' ? empty('ยังไม่มีวันหยุดในเดือนนี้') : '<div>ยังไม่มีวันหยุดในเดือนนี้</div>')}
      </div>
    </div>`;
  }
  async function saveHolidayRulesV121(form) {
    if (typeof isAdmin === 'function' && !isAdmin()) return showToast('เฉพาะ Admin เท่านั้น');
    const fd = new FormData(form);
    const date = String(fd.get('holiday_date') || '');
    const title = String(fd.get('title') || '').trim();
    const roleMode = String(fd.get('holiday_role_mode') || 'MT_MT_KERK');
    const duties = Array.from(form.querySelectorAll('input[name="holiday_duties"]:checked')).map(x => normalizeDutyV121(x.value));
    if (!date || !title) return showToast('กรุณาระบุวันที่และชื่อวันหยุด');
    const row = { holiday_date:date, title:encodeHolidayV121(title, duties, roleMode), updated_by:currentStaffSafe() };
    const { error } = await sb.from('public_holidays').upsert(row, { onConflict:'holiday_date' });
    if (error) return showToast(typeof friendlyDbError === 'function' ? friendlyDbError(error) : error.message);
    state.holidays = (state.holidays || []).filter(h => h.holiday_date !== date).concat(row).sort((a,b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));
    state.editHolidayRuleDate = '';
    state.rosterDraft = null;
    renderPage();
    showToast('บันทึกวันหยุดและกฎเวรแล้ว');
  }
  async function deleteHolidayV121(date) {
    if (typeof confirmDialog === 'function') {
      const ok = await confirmDialog(`ลบวันหยุด ${dateThai(date)} หรือไม่?`, 'ยืนยันลบวันหยุด');
      if (!ok) return;
    }
    const { error } = await sb.from('public_holidays').delete().eq('holiday_date', date);
    if (error) return showToast(typeof friendlyDbError === 'function' ? friendlyDbError(error) : error.message);
    state.holidays = (state.holidays || []).filter(h => h.holiday_date !== date);
    state.editHolidayRuleDate = '';
    state.rosterDraft = null;
    renderPage();
    showToast('ลบวันหยุดแล้ว');
  }

  function monthAssignmentsV121(includeEmpty=false) {
    const rows = getAssignmentsForMonth(monthKeySafe()).map(normalizeAssignmentV121);
    return includeEmpty ? rows : rows.filter(a => a.staff_id);
  }
  function dutiesByDateV121(assignments, date, includeEmpty=false) {
    return (assignments || []).filter(a => String(a.duty_date) === String(date) && (includeEmpty || a.staff_id)).sort((a,b) => dutySortV121(a.duty_code,b.duty_code));
  }
  function dutiesByStaffV121(assignments, staffId) {
    return (assignments || []).filter(a => String(a.staff_id) === String(staffId)).sort((a,b) => String(a.duty_date).localeCompare(String(b.duty_date)) || dutySortV121(a.duty_code,b.duty_code));
  }
  function tradeButtonV121(a) {
    if (!a?.staff_id) return '';
    return `<button type="button" class="tiny-btn" data-v121-trade="${esc(assignmentIdV121(a))}">ซื้อ/แลก</button>`;
  }
  function showDayDetailV121(date) {
    const rows = dutiesByDateV121(monthAssignmentsV121(true), date, true);
    const body = rows.map(a => `<tr><td>${esc(staffDutyLabelV121(a.duty_code))}</td><td>${a.staff_id ? staffPillSafe(a.staff_id) : '<span class="muted">ยังไม่จัด</span>'}</td><td>${tradeButtonV121(a) || '-'}</td></tr>`).join('') || '<tr><td colspan="3">ไม่มีเวร</td></tr>';
    showModal(`<h2>${esc(dateThai(date))}</h2><div class="table-wrap"><table><thead><tr><th>เวร</th><th>เจ้าหน้าที่</th><th>ซื้อ/แลก</th></tr></thead><tbody>${body}</tbody></table></div>`);
  }
  function showPersonDetailV121(staffId) {
    const assignments = monthAssignmentsV121(false);
    const rows = dutiesByStaffV121(assignments, staffId);
    let stats = {}; try { stats = calcFairness(assignments); } catch(e) {}
    const s = stats[staffId] || {};
    const body = rows.map(a => { const dm = dutyMetrics(a, a.staff_id); return `<tr><td>${dateThai(a.duty_date)}</td><td>${esc(staffDutyLabelV121(a.duty_code))}</td><td>${Number(dm.hours || 0).toFixed(0)} ชม.</td><td>${Number(dm.pay || 0).toLocaleString()} บ.</td><td>${tradeButtonV121(a) || '-'}</td></tr>`; }).join('') || '<tr><td colspan="5">ไม่มีเวรเดือนนี้</td></tr>';
    showModal(`<h2>${staffPillSafe(staffId)}</h2><div class="metric-grid roster-person-popup-metrics"><div><b>${Number(s.hours || 0).toFixed(1)}</b><span>ชม.รวม</span></div><div><b>${Number(s.pay || 0).toLocaleString()}</b><span>เงินประมาณ</span></div><div><b>${Number(s.units || 0).toFixed(1)}</b><span>หน่วยเวร</span></div><div><b>${rows.length}</b><span>รวมเวร</span></div></div><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>ชม.</th><th>เงิน</th><th>ซื้อ/แลก</th></tr></thead><tbody>${body}</tbody></table></div>`);
  }
  function renderScheduleToolbarV121() {
    return `<div class="toolbar no-print schedule-toolbar-v121"><label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(monthKeySafe())}"></label><button type="button" class="ghost-btn" data-export-schedule-excel>Export Excel</button><button type="button" class="ghost-btn" data-print-page>Export PDF / พิมพ์</button></div>`;
  }
  function renderTabV121(view, label, target) {
    const cur = target === 'desktop' ? (state.scheduleDesktopViewV121 || 'table') : (state.scheduleMobileViewV121 || 'day');
    const attr = target === 'desktop' ? 'data-v121-desktop-tab' : 'data-v121-mobile-tab';
    return `<button type="button" class="${cur === view ? 'primary-btn' : 'ghost-btn'}" ${attr}="${view}">${esc(label)}</button>`;
  }
  function renderExcelV121(assignments) {
    let html = '';
    try { html = renderSchedulePersonMatrix(assignments); }
    catch(e) { try { html = renderReadOnlySchedule(assignments); } catch(_) { html = '<div class="empty-state">ไม่พบตารางเวร</div>'; } }
    return `<div class="v121-excel-view">${html}</div>`;
  }
  function renderDesktopDayV121(assignments) {
    const range = monthRangeSafe(monthKeySafe());
    const last = new Date(range.y, range.m, 0).getDate();
    const cards = Array.from({length:last}, (_,i) => i+1).map(d => {
      const date = `${range.y}-${padSafe(range.m)}-${padSafe(d)}`;
      const rows = dutiesByDateV121(assignments, date);
      const holiday = isHolidaySafe(date);
      const off = holiday || isWeekendSafe(date);
      return `<button type="button" class="v121-date-card ${off ? 'weekend' : ''}" data-v121-day="${date}"><div class="v121-date-head"><b>${d}</b><span>${parseSafe(date).toLocaleDateString('th-TH', {weekday:'short'})}</span>${holiday ? `<em>${esc(typeof holidayName === 'function' ? holidayName(date) : 'วันหยุด')}</em>` : ''}</div><div class="v121-duty-lines">${rows.map(a => { const cs = colorOf(a.staff_id); return `<span class="v121-duty-bar" style="${cs.css}">${esc(staffDutyLabelV121(a.duty_code))} ${esc(staffName(a.staff_id))}</span>`; }).join('') || '<small class="muted">ไม่มีเวร</small>'}</div></button>`;
    }).join('');
    return `<div class="v121-desktop-day-list">${cards}</div>`;
  }
  function renderPersonsV121(assignments) {
    return `<div class="v121-person-grid">${staffList().map(s => {
      const rows = dutiesByStaffV121(assignments, s.id);
      const cs = colorOf(s);
      return `<button type="button" class="v121-person-card" data-v121-person="${esc(s.id)}"><span class="staff-chip" style="${cs.css}">${esc(s.nickname || s.full_name || '-')}</span><b>${rows.length} เวร</b><div>${rows.slice(0,6).map(a => `<small>${esc(dateThai(a.duty_date))} ${esc(staffDutyLabelV121(a.duty_code))}</small>`).join('') || '<small class="muted">ไม่มีเวรเดือนนี้</small>'}</div></button>`;
    }).join('')}</div>`;
  }
  function renderMobileDayV121(assignments) {
    const range = monthRangeSafe(monthKeySafe());
    const last = new Date(range.y, range.m, 0).getDate();
    const firstDow = new Date(range.y, range.m - 1, 1).getDay();
    const cells = [];
    for (let i=0; i<firstDow; i++) cells.push({blank:true});
    for (let d=1; d<=last; d++) cells.push({day:d, date:`${range.y}-${padSafe(range.m)}-${padSafe(d)}`});
    while (cells.length % 7) cells.push({blank:true});
    return `<p class="hint mobile-day-hint">กดวันที่เพื่อดูรายการเวร และปุ่มซื้อ/แลก</p><div class="v121-mobile-cal"><div class="v121-week-head"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div><div class="v121-mobile-cal-grid">${cells.map(c => {
      if (c.blank) return '<button type="button" class="v121-mobile-day empty" disabled></button>';
      const rows = dutiesByDateV121(assignments, c.date);
      const shown = rows.slice(0,3);
      const hidden = rows.length - shown.length;
      const off = isWeekendSafe(c.date) || isHolidaySafe(c.date);
      return `<button type="button" class="v121-mobile-day ${off ? 'weekend' : ''}" data-v121-day="${c.date}"><div class="v121-mobile-day-num"><b>${c.day}</b></div>${shown.map(a => { const cs = colorOf(a.staff_id); return `<span class="v121-duty-bar" style="${cs.css}">${esc(staffDutyLabelV121(a.duty_code))} ${esc(staffName(a.staff_id))}</span>`; }).join('')}${hidden > 0 ? `<span class="v121-more">+${hidden}</span>` : ''}</button>`;
    }).join('')}</div></div>`;
  }
  function daysOffV121(staffId, assignments) {
    const range = monthRangeSafe(monthKeySafe());
    const last = new Date(range.y, range.m, 0).getDate();
    const set = new Set();
    for (let d=1; d<=last; d++) {
      const date = `${range.y}-${padSafe(range.m)}-${padSafe(d)}`;
      const has = assignments.some(a => String(a.staff_id) === String(staffId) && a.duty_date === date);
      if ((isWeekendSafe(date) || isHolidaySafe(date)) && !has) set.add(date);
    }
    (state.leaves || []).forEach(l => {
      if (String(l.staff_id) !== String(staffId) || String(l.type) !== 'ไม่รับเวร') return;
      try { datesBetween(l.start_date, l.end_date).forEach(date => { if (isWeekendSafe(date)) set.add(date); }); } catch(e) {}
    });
    return set.size;
  }
  function renderOtCardsV121(assignments) {
    let stats = {}; try { stats = calcFairness(assignments); } catch(e) {}
    return `<div class="v121-ot-cards">${staffList().map(s => {
      const rows = dutiesByStaffV121(assignments, s.id);
      const r = stats[s.id] || {};
      const cs = colorOf(s);
      const count = (fn) => rows.filter(fn).length;
      return `<button type="button" class="v121-ot-card" data-v121-person="${esc(s.id)}"><span class="staff-chip" style="${cs.css}">${esc(s.nickname || s.full_name || '-')}</span><div class="v121-ot-grid"><span>ชั่วโมงเวร/OT</span><b>${Number(r.hours || 0).toFixed(1)}</b><span>เงินประมาณ</span><b>${Number(r.pay || 0).toLocaleString()}</b><span>จำนวนเวร</span><b>${rows.length}</b><span>วันที่ได้หยุด</span><b>${daysOffV121(s.id, assignments)}</b><span>ชบด1</span><b>${count(a => a.duty_code === 'ชบด1')}</b><span>ชบด2</span><b>${count(a => a.duty_code === 'ชบด2')}</b><span>ชบด3</span><b>${count(a => a.duty_code === 'ชบด3')}</b><span>ช9</span><b>${count(a => String(a.duty_code || '').startsWith('ช9'))}</b><span>ช3A</span><b>${count(a => a.duty_code === 'ช3A')}</b><span>ช3B</span><b>${count(a => a.duty_code === 'ช3B')}</b><span>ช4</span><b>${count(a => String(a.duty_code || '').startsWith('ช4'))}</b></div></button>`;
    }).join('')}</div>`;
  }
  function renderMonthlySchedulePageV121() {
    if (!state.scheduleDesktopViewV121) state.scheduleDesktopViewV121 = 'table';
    if (!state.scheduleMobileViewV121) state.scheduleMobileViewV121 = 'day';
    const assignments = monthAssignmentsV121(false);
    const desktopView = state.scheduleDesktopViewV121;
    const mobileView = state.scheduleMobileViewV121;
    return `<div class="card schedule-page-v121">${renderScheduleToolbarV121()}
      <section class="v121-desktop-only"><div class="v121-tabs no-print">${renderTabV121('table','ตารางทั้งเดือน','desktop')}${renderTabV121('day','ดูตามวัน','desktop')}${renderTabV121('person','ดูตามคน','desktop')}</div><div class="v121-view">${desktopView === 'day' ? renderDesktopDayV121(assignments) : desktopView === 'person' ? renderPersonsV121(assignments) : renderExcelV121(assignments)}</div></section>
      <section class="v121-mobile-only"><div class="v121-tabs v121-mobile-tabs no-print">${renderTabV121('day','ดูตามวัน','mobile')}${renderTabV121('person','ดูตามคน','mobile')}${renderTabV121('ot','สรุป OT','mobile')}${renderTabV121('table','ตาราง','mobile')}</div><div class="v121-view">${mobileView === 'person' ? renderPersonsV121(assignments) : mobileView === 'ot' ? renderOtCardsV121(assignments) : mobileView === 'table' ? renderExcelV121(assignments) : renderMobileDayV121(assignments)}</div></section>
    </div>`;
  }
  window.renderMonthlySchedulePage = renderMonthlySchedulePage = renderMonthlySchedulePageV121;

  const prevRenderPageV121 = window.renderPage || renderPage;
  window.renderPage = renderPage = function renderPageV121() {
    if (state.page === 'schedule') {
      const item = (typeof NAV_ITEMS !== 'undefined' ? NAV_ITEMS : []).find(x => x.id === 'schedule') || {};
      if ($id('pageTitle')) $id('pageTitle').textContent = item.title || 'ตารางเวรประจำเดือน';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = item.subtitle || 'ดูรายเดือน Export Excel / PDF / Print';
      try { renderNav(); } catch(e) {}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderMonthlySchedulePageV121();
      return;
    }
    if (state.page === 'dutyEligibilityV107') {
      if ($id('pageTitle')) $id('pageTitle').textContent = 'สิทธิ์เวรตามวัน';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = 'เลือกเจ้าหน้าที่ แล้วติ๊กว่าแต่ละวันอยู่เวรอะไรได้';
      try { renderNav(); } catch(e) {}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderDutyEligibilityPageV121();
      return;
    }
    if (state.page === 'holidayRulesV107') {
      if ($id('pageTitle')) $id('pageTitle').textContent = 'ตั้งค่าเวรวันนักขัตฤกษ์';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = 'เพิ่มวันหยุดและเลือกเวรที่เปิดรายวัน';
      try { renderNav(); } catch(e) {}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderHolidayRulesPageV121();
      return;
    }
    return prevRenderPageV121();
  };

  document.addEventListener('click', async function(e) {
    const trade = e.target.closest?.('[data-v121-trade]');
    if (trade) {
      e.preventDefault(); e.stopImmediatePropagation();
      const a = monthAssignmentsV121(false).find(x => assignmentIdV121(x) === String(trade.dataset.v121Trade));
      if (a && typeof showTradeRequestModal === 'function') showTradeRequestModal(a);
      else if (a && typeof showTradeModal === 'function' && a.id) showTradeModal(a.id);
      else if (a) showModal(`<h2>ซื้อ/แลกเวร</h2><p>${staffPillSafe(a.staff_id)} • ${dateThai(a.duty_date)} • ${staffDutyLabelV121(a.duty_code)}</p><button class="primary-btn" data-page="tradeRequests">ไปหน้าคำขอแลก/ขายเวร</button>`);
      return;
    }
    const t = e.target.closest?.('[data-v121-desktop-tab],[data-v121-mobile-tab],[data-v121-day],[data-v121-person],[data-save-duty-eligibility-v121],[data-edit-holiday-v121],[data-delete-holiday-v121],[data-cancel-edit-holiday-v121]');
    if (!t) return;
    if (t.dataset.v121DesktopTab) { e.preventDefault(); e.stopImmediatePropagation(); state.scheduleDesktopViewV121 = t.dataset.v121DesktopTab; renderPage(); return; }
    if (t.dataset.v121MobileTab) { e.preventDefault(); e.stopImmediatePropagation(); state.scheduleMobileViewV121 = t.dataset.v121MobileTab; renderPage(); return; }
    if (t.dataset.v121Day) { e.preventDefault(); e.stopImmediatePropagation(); showDayDetailV121(t.dataset.v121Day); return; }
    if (t.dataset.v121Person) { e.preventDefault(); e.stopImmediatePropagation(); showPersonDetailV121(t.dataset.v121Person); return; }
    if (t.hasAttribute('data-save-duty-eligibility-v121')) { e.preventDefault(); e.stopImmediatePropagation(); await saveDutyEligibilityV121(); return; }
    if (t.dataset.editHolidayV121) { e.preventDefault(); e.stopImmediatePropagation(); state.editHolidayRuleDate = t.dataset.editHolidayV121; renderPage(); return; }
    if (t.dataset.deleteHolidayV121) { e.preventDefault(); e.stopImmediatePropagation(); await deleteHolidayV121(t.dataset.deleteHolidayV121); return; }
    if (t.hasAttribute('data-cancel-edit-holiday-v121')) { e.preventDefault(); e.stopImmediatePropagation(); state.editHolidayRuleDate = ''; renderPage(); return; }
  }, true);
  document.addEventListener('change', function(e) {
    if (e.target.id === 'dutyEligibilityStaffSelectV121') { e.preventDefault(); e.stopImmediatePropagation(); state.dutyEligibilityStaffId = e.target.value; renderPage(); return; }
    if (e.target.id === 'holidayRuleMonthInputV121') { e.preventDefault(); e.stopImmediatePropagation(); state.holidayRuleMonthKey = e.target.value; state.editHolidayRuleDate = ''; renderPage(); return; }
  }, true);
  document.addEventListener('submit', async function(e) {
    if (e.target.id === 'holidayRulesFormV121') { e.preventDefault(); e.stopImmediatePropagation(); await saveHolidayRulesV121(e.target); }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .schedule-page-v121 .v121-mobile-only{display:none}.schedule-page-v121 .v121-desktop-only{display:block}.schedule-page-v121 .v121-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 16px}.schedule-page-v121 .v121-view{margin-top:8px}.v121-desktop-day-list{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:12px}.v121-date-card{border:1px solid #dbe7f3;border-radius:16px;background:#fff;min-height:136px;padding:10px;text-align:left;cursor:pointer}.v121-date-card.weekend{background:#fff9e8}.v121-date-head{display:flex;gap:6px;align-items:baseline;margin-bottom:8px}.v121-date-head b{font-size:18px}.v121-date-head span,.v121-date-head em{color:#64748b;font-style:normal}.v121-duty-bar{display:block;border-radius:8px;margin:4px 0;padding:5px 8px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v121-person-grid,.v121-ot-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.v121-person-card,.v121-ot-card{border:1px solid #dbe7f3;border-radius:16px;background:#fff;padding:12px;text-align:left;cursor:pointer}.v121-person-card small{display:block;margin:3px 0;color:#334155}.v121-ot-grid{display:grid;grid-template-columns:1fr auto;gap:6px 10px}.v121-ot-grid span{color:#64748b}.v121-week-head{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;text-align:center;color:#64748b;font-weight:700;margin:8px 0}.v121-mobile-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:7px}.v121-mobile-day{border:1px solid #dbe7f3;border-radius:14px;min-height:108px;background:#fff;padding:7px;text-align:left;overflow:hidden;cursor:pointer}.v121-mobile-day.weekend{background:#fff9e8}.v121-mobile-day.empty{background:#f8fafc;opacity:.55;cursor:default}.v121-mobile-day-num{display:flex;align-items:baseline;margin-bottom:4px}.v121-mobile-day-num b{font-size:18px}.v121-more{display:block;color:#64748b;font-weight:800}.duty-eligibility-page-v121{grid-template-columns:280px minmax(0,1fr)}.v121-duty-table th{white-space:nowrap}.holiday-rules-page-v121 .check-pill{min-width:130px}
    @media(max-width:820px){.schedule-page-v121 .v121-desktop-only{display:none!important}.schedule-page-v121 .v121-mobile-only{display:block!important}.schedule-page-v121 .v121-mobile-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.schedule-page-v121 .v121-mobile-tabs button{border-radius:16px;padding:12px 4px;font-size:15px;white-space:nowrap}.schedule-page-v121 .v121-week-head{gap:5px;font-size:14px}.schedule-page-v121 .v121-mobile-cal-grid{gap:6px}.schedule-page-v121 .v121-mobile-day{min-height:96px;border-radius:13px;padding:6px}.schedule-page-v121 .v121-duty-bar{font-size:11px;padding:3px 5px;margin:3px 0;border-radius:7px}.schedule-page-v121 .v121-excel-view h3,.schedule-page-v121 .excel-roster-section-v107 h3{font-size:20px!important;margin:10px 0 8px!important}.schedule-page-v121 .excel-roster-section-v107 .hint{display:none!important}.schedule-page-v121 .excel-roster-wrap-v107,.schedule-page-v121 .excel-roster-wrap-v109,.schedule-page-v121 .excel-roster-wrap-v110,.schedule-page-v121 .excel-roster-wrap-v111,.schedule-page-v121 .excel-roster-wrap-v112,.schedule-page-v121 .excel-roster-wrap-v113,.schedule-page-v121 .mobile-schedule-matrix-wrap{max-height:none!important;overflow:auto!important}.schedule-page-v121 .excel-roster-table-v107 th:first-child,.schedule-page-v121 .excel-roster-table-v107 td:first-child,.schedule-page-v121 .schedule-person-matrix th:first-child,.schedule-page-v121 .schedule-person-matrix td:first-child{min-width:78px!important;width:78px!important;max-width:78px!important}.schedule-page-v121 .excel-roster-table-v107 th,.schedule-page-v121 .excel-roster-table-v107 td,.schedule-page-v121 .schedule-person-matrix th,.schedule-page-v121 .schedule-person-matrix td{height:20px!important;min-height:20px!important;padding:1px 2px!important;font-size:8.8px!important;line-height:1!important}.schedule-page-v121 .excel-roster-table-v107 thead th,.schedule-page-v121 .schedule-person-matrix thead th{height:24px!important;min-height:24px!important}.schedule-page-v121 .excel-roster-table-v107 .staff-name-cell b,.schedule-page-v121 .schedule-person-matrix th:first-child{font-size:9.2px!important;line-height:1!important}.schedule-page-v121 .excel-roster-table-v107 .staff-name-cell small,.schedule-page-v121 .schedule-person-matrix small{display:none!important}.schedule-page-v121 .excel-roster-table-v107 .excel-duty-cell-btn,.schedule-page-v121 .schedule-person-matrix .trade-btn{font-size:8.8px!important;line-height:1!important;padding:0!important;min-height:17px!important}.schedule-page-v121 .v121-person-grid,.schedule-page-v121 .v121-ot-cards{grid-template-columns:1fr}.duty-eligibility-page-v121,.holiday-rules-page-v121{grid-template-columns:1fr!important}.v121-duty-table{font-size:12px}}
  `;
  document.head.appendChild(style);
})();
