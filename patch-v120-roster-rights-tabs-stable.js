/* V120 stable fix: duty rights 2x ช4, holiday role mode, schedule tabs/views only. Keep OT/balance from v114 untouched. */
(function(){
  if (window.__CNMI_V120_ROSTER_RIGHTS_TABS_STABLE__) return;
  window.__CNMI_V120_ROSTER_RIGHTS_TABS_STABLE__ = true;

  const MARKER = ':::DUTY_RULES:';
  const CODES = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  const WEEKDAYS = [
    {key:'mon', label:'จันทร์', js:1},{key:'tue', label:'อังคาร', js:2},{key:'wed', label:'พุธ', js:3},{key:'thu', label:'พฤหัสบดี', js:4},{key:'fri', label:'ศุกร์', js:5},{key:'sat', label:'เสาร์', js:6},{key:'sun', label:'อาทิตย์', js:0}
  ];
  const esc = (v) => (typeof escapeHtml === 'function') ? escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const $id = (id) => document.getElementById(id);
  const safePad = (n) => (typeof pad === 'function' ? pad(n) : String(n).padStart(2,'0'));
  const parse = (d) => (typeof parseDate === 'function' ? parseDate(d) : new Date(d));
  const isMob = () => window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  const staffList = () => {
    try { return orderedStaff((state.staff || []).filter(s => typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : true)); }
    catch(e){ return state.staff || []; }
  };
  const staffById = (id) => (state.staff || []).find(s => String(s.id) === String(id));
  const staffName = (id) => {
    const s = staffById(id);
    return s?.nickname || s?.full_name || '-';
  };
  const staffPillSafe = (id, opts={}) => {
    try { return staffPill(id, opts); } catch(e) {}
    const s = staffById(id) || id;
    const bg = colorOf(id).bg, fg = colorOf(id).fg;
    return `<span class="staff-chip" style="background:${bg};color:${fg}">${esc(typeof s === 'object' ? (s.nickname || s.full_name || '-') : staffName(id))}</span>`;
  };
  const colorOf = (staffOrId) => {
    const s = typeof staffOrId === 'object' ? staffOrId : staffById(staffOrId);
    let bg = '#dbeafe', fg = '#0f172a';
    try { bg = staffColor(s || staffOrId); fg = textColorFor(bg); } catch(e) {}
    return {bg, fg, css:`background:${bg};color:${fg};--staff-bg:${bg};--staff-fg:${fg}`};
  };
  const dateThai = (d) => { try { return formatThaiDate(d); } catch(e) { return d; } };
  const shortDuty = (code) => {
    const c = normalizeDutyV120(code);
    if (c.startsWith('ช9')) return 'ช9';
    if (c.startsWith('ช4')) return 'ช4';
    return c;
  };
  const detailDuty = (code) => {
    const c = normalizeDutyV120(code);
    if (c.startsWith('ช4')) return 'ช4-MT/แตง';
    if (c.startsWith('ช9-MT')) return 'ช9-MT/แตง';
    return c;
  };
  function uidSafe(){ try { return uid(); } catch(e) { return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`; } }
  function normalizeDutyV120(code=''){
    const c = String(code || '').trim();
    if (c === 'ช4' || c === 'ช4A' || c === 'ช4B' || c === 'ช4-MT/แตง') return 'ช4-MT/แตง 1';
    if (['ช4-MT/แตง1','ช4-MT/แตง-1','ช4-1'].includes(c)) return 'ช4-MT/แตง 1';
    if (['ช4-MT/แตง2','ช4-MT/แตง-2','ช4-2'].includes(c)) return 'ช4-MT/แตง 2';
    if (c === 'ช9-MT') return 'ช9-MT/แตง';
    return c;
  }
  function roleForDuty(code, date=null){
    const c = normalizeDutyV120(code);
    if (c === 'ช9-เคิก') return 'เคิก';
    if (c === 'ช9-MT/แตง' || c.startsWith('ช4')) return 'MT_OR_TANG';
    if (c === 'ชบด3' && date && isHolidaySafe(date)) return holidayRoleMode(date) === 'MT_MT_MT' ? 'MT' : 'เคิก';
    if (c === 'ชบด3') return 'MT_OR_KERK';
    return 'MT';
  }
  function isWeekendSafe(date){ try { return isWeekend(date); } catch(e) { return [0,6].includes(parse(date).getDay()); } }
  function isHolidaySafe(date){ try { return isHolidayDate(date); } catch(e) { return (state.holidays||[]).some(h=>h.holiday_date===date); } }
  function cleanHolidayTitle(title=''){
    const t = String(title || '');
    const idx = t.indexOf(MARKER);
    return (idx >= 0 ? t.slice(0, idx) : t).trim() || 'วันหยุดราชการ';
  }
  function decodeHoliday(title=''){
    const t = String(title || '');
    const start = t.indexOf(MARKER);
    if (start < 0) return null;
    const raw = t.slice(start + MARKER.length).split(':::')[0];
    try { return JSON.parse(decodeURIComponent(escape(atob(raw)))); }
    catch(e){ try { return JSON.parse(atob(raw)); } catch(_) { return null; } }
  }
  function encodeHoliday(title, duties, roleMode){
    const json = JSON.stringify({
      duties: CODES.reduce((acc,c)=>{ acc[c] = duties.includes(c); return acc; }, {}),
      roleMode: roleMode || 'MT_MT_KERK'
    });
    let enc = '';
    try { enc = btoa(unescape(encodeURIComponent(json))); } catch(e) { enc = btoa(json); }
    return `${String(title || '').trim()} ${MARKER}${enc}:::`.trim();
  }
  function holidayCfg(date){
    const row = (state.holidays || []).find(h => h.holiday_date === date);
    return decodeHoliday(row?.title || '') || null;
  }
  function holidayAllowed(date){
    const cfg = holidayCfg(date);
    if (!cfg?.duties) return ['ชบด1','ชบด2','ชบด3'];
    const out = CODES.filter(c => cfg.duties[c] || (c.startsWith('ช4') && cfg.duties['ช4-MT/แตง']));
    return out;
  }
  function holidayRoleMode(date){ return holidayCfg(date)?.roleMode || 'MT_MT_KERK'; }
  function dayKey(date){ return ['sun','mon','tue','wed','thu','fri','sat'][parse(date).getDay()]; }
  function defaultCodesForDayKey(k){
    if (k === 'sat' || k === 'sun') return ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง'];
    return ['ชบด1','ชบด2','ชบด3','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  }
  function defaultCodesForDate(date){
    if (isHolidaySafe(date)) return holidayAllowed(date);
    return defaultCodesForDayKey(dayKey(date));
  }
  function eligCode(day, duty){ return `DUTY_RULE:${day}:${normalizeDutyV120(duty)}`; }
  function eligRows(staffId){
    return (state.positionEligibility || []).filter(r => String(r.staff_id) === String(staffId) && String(r.position_code || '').startsWith('DUTY_RULE:'));
  }
  function staffEligibleForDuty(staff, date, duty){
    if (!staff || (typeof isRosterEnabled === 'function' && !isRosterEnabled(staff))) return false;
    const code = normalizeDutyV120(duty);
    const rows = eligRows(staff.id);
    if (!rows.length) {
      try { return supportsRequiredRole(staff, roleForDuty(code, date)); } catch(e) { return true; }
    }
    const key = dayKey(date);
    let rec = rows.find(r => r.position_code === eligCode(key, code));
    if (!rec && code.startsWith('ช4')) rec = rows.find(r => r.position_code === `DUTY_RULE:${key}:ช4-MT/แตง`);
    return !!rec?.is_eligible;
  }
  function assignmentId(a){ return String(a?.id || a?._temp_id || `${a?.duty_date}|${a?.duty_code}|${a?.staff_id||''}`); }
  function normalizeAssignment(a){
    if (!a) return a;
    const code = normalizeDutyV120(a.duty_code);
    return {...a, duty_code: code, required_role: a.required_role || roleForDuty(code, a.duty_date)};
  }
  function monthRange(key){ return (typeof getMonthRange === 'function') ? getMonthRange(key) : (() => { const [y,m]=String(key).split('-').map(Number); return {y,m,start:`${y}-${safePad(m)}-01`,end:`${y}-${safePad(m)}-${safePad(new Date(y,m,0).getDate())}`}; })(); }
  function monthAssignments(){
    try { return getAssignmentsForMonth(state.monthKey || (typeof todayStr==='function'?todayStr().slice(0,7):'')).filter(a => a && a.staff_id).map(normalizeAssignment); }
    catch(e){
      const key = state.monthKey || '';
      return (state.rosterAssignments || []).filter(a => String(a.duty_date || '').slice(0,7) === key && a.staff_id).map(normalizeAssignment);
    }
  }

  // ---- Duty logic overrides required for 2 ช4 slots ----
  window.supportsRequiredRole = supportsRequiredRole = function(staff, required){
    if (!required || required === 'ANY') return true;
    if (required === 'MT_OR_TANG') return staff?.staff_type === 'MT' || staff?.nickname === 'แตง';
    if (required === 'MT_OR_KERK') return staff?.staff_type === 'MT' || staff?.staff_type === 'เคิก';
    return staff?.staff_type === required;
  };
  window.dutyStaffTypeForRate = dutyStaffTypeForRate = function(staffId, dutyCode=''){
    const s = staffById(staffId);
    const code = normalizeDutyV120(dutyCode);
    if (!s) return 'MT';
    if ((code === 'ช9-MT/แตง' || code.startsWith('ช4')) && s.nickname === 'แตง') return 'MT';
    return s.staff_type === 'เคิก' ? 'เคิก' : 'MT';
  };
  window.dutyHoursForCode = dutyHoursForCode = function(date, dutyCode=''){
    const c = normalizeDutyV120(dutyCode);
    if (c.startsWith('ช4')) return 0;
    if (c.startsWith('ช9')) return 8;
    if (c === 'ช3A' || c === 'ช3B') return 8;
    if (['ชบด1','ชบด2','ชบด3'].includes(c)) return (isWeekendSafe(date) || isHolidaySafe(date)) ? 24 : 16;
    return (isWeekendSafe(date) || isHolidaySafe(date)) ? 24 : 16;
  };
  window.dutyUnitsForCode = dutyUnitsForCode = function(date, dutyCode=''){
    const c = normalizeDutyV120(dutyCode);
    if (c.startsWith('ช4')) return 0;
    const h = dutyHoursForCode(date,c);
    if (c === 'ช3A' || c === 'ช3B') return 1;
    return h/8;
  };
  window.dutyMetrics = dutyMetrics = function(a, staffIdOverride=null){
    const date = a?.duty_date || a;
    const code = normalizeDutyV120(a?.duty_code || '');
    const staffId = staffIdOverride || a?.staff_id || null;
    const hours = dutyHoursForCode(date, code);
    const rate = staffId && typeof dutyRatePerHour === 'function' ? dutyRatePerHour(staffId, date, code) : 0;
    return {hours, rate, pay:hours*rate, units:dutyUnitsForCode(date,code), code, publicHoliday:isHolidaySafe(date), weekend:isWeekendSafe(date)};
  };
  window.dutyRuleForDate = dutyRuleForDate = function(date){ return defaultCodesForDate(date).map(code => ({code, role:roleForDuty(code,date)})); };
  window.allowedDutyCodesForDate = allowedDutyCodesForDate = function(date){ return dutyRuleForDate(date).map(x=>x.code); };
  window.generateEmptyAssignments = generateEmptyAssignments = function(key){
    const {y,m} = monthRange(key); const last = new Date(y,m,0).getDate(); const rows=[];
    for (let d=1; d<=last; d++) { const date = `${y}-${safePad(m)}-${safePad(d)}`; dutyRuleForDate(date).forEach(slot => rows.push({_temp_id:uidSafe(), duty_date:date, duty_code:slot.code, required_role:slot.role, staff_id:null, is_locked:false})); }
    return rows;
  };
  window.getAssignmentsForMonth = getAssignmentsForMonth = function(key){
    const normalizeRows = rows => (rows || []).map(normalizeAssignment).filter(x => {
      const allowed = allowedDutyCodesForDate(x.duty_date);
      return allowed.includes(x.duty_code) || ['ช4-MT/แตง 1','ช4-MT/แตง 2'].includes(x.duty_code);
    });
    if (state.rosterDraft?.monthKey === key) return normalizeRows(state.rosterDraft.assignments);
    const {start,end} = monthRange(key);
    return normalizeRows((state.rosterAssignments || []).filter(x => x.duty_date >= start && x.duty_date <= end));
  };
  window.canStaffWorkSlot = canStaffWorkSlot = function(staffId, slot, assignments=getAssignmentsForMonth(state.monthKey)){
    const s = staffById(staffId);
    const normalized = normalizeAssignment(slot);
    if (!s || (typeof isRosterEnabled === 'function' && !isRosterEnabled(s))) return false;
    if (!supportsRequiredRole(s, normalized.required_role || roleForDuty(normalized.duty_code, normalized.duty_date))) return false;
    if (!staffEligibleForDuty(s, normalized.duty_date, normalized.duty_code)) return false;
    try { if ((state.leaves || []).some(l => String(l.staff_id)===String(staffId) && overlapsDate(l, normalized.duty_date))) return false; } catch(e) {}
    try { if (hasSameDayDuty(staffId, normalized.duty_date, assignments, normalized)) return false; } catch(e) {}
    try { if (hasAdjacentDuty(staffId, normalized.duty_date, assignments, normalized)) return false; } catch(e) {}
    return true;
  };

  // ---- Admin: Duty eligibility page ----
  function renderDutyEligibilityPageV120(){
    if (typeof isAdmin === 'function' && !isAdmin()) return noPermission();
    const active = staffList();
    if (!active.length) return (typeof empty === 'function' ? empty('ยังไม่มีเจ้าหน้าที่ที่เปิดสิทธิ์จัดเวร') : '<div>ยังไม่มีเจ้าหน้าที่</div>');
    if (!state.dutyEligibilityStaffId || !active.some(s => String(s.id)===String(state.dutyEligibilityStaffId))) state.dutyEligibilityStaffId = active[0].id;
    const selected = active.find(s => String(s.id)===String(state.dutyEligibilityStaffId)) || active[0];
    const hasRows = eligRows(selected.id).length > 0;
    const dayRows = WEEKDAYS.map(w => `<tr><th>${esc(w.label)}</th>${CODES.map(code => {
      const rec = (state.positionEligibility || []).find(r => String(r.staff_id)===String(selected.id) && r.position_code === eligCode(w.key, code));
      const checked = rec ? !!rec.is_eligible : defaultCodesForDayKey(w.key).includes(code);
      return `<td><label class="switch-check"><input type="checkbox" data-duty-eligibility-v120 data-staff-id="${esc(selected.id)}" data-day-key="${esc(w.key)}" data-duty-code="${esc(code)}" ${checked?'checked':''}><span></span></label></td>`;
    }).join('')}</tr>`).join('');
    const cs = colorOf(selected);
    return `<div class="grid duty-eligibility-page-v120">
      <div class="card eligibility-staff-panel">
        <div class="section-title"><h3>เลือกเจ้าหน้าที่</h3></div>
        <label>เจ้าหน้าที่ <select id="dutyEligibilityStaffSelectV120">${active.map(s => `<option value="${esc(s.id)}" ${String(selected.id)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name)} (${esc(s.staff_type || '-')})</option>`).join('')}</select></label>
        <div class="selected-staff-card" style="${cs.css}"><b>${esc(selected.nickname || selected.full_name)}</b><br><span>${esc(selected.staff_type || selected.position || selected.role || '')}</span></div>
        <div class="notice soft-notice">หน้านี้ใช้กับเวรเท่านั้น ไม่เกี่ยวกับตำแหน่งกลางวัน 08.00-16.00 น.</div>
      </div>
      <div class="card duty-eligibility-matrix-card">
        <div class="section-title"><div><h3>สิทธิ์เวรตามวันของ ${esc(selected.nickname || selected.full_name)}</h3><p class="hint">ช4-MT/แตง มี 2 ตำแหน่งต่อวัน จึงมี 2 ช่องให้ติ๊กแยกกัน</p></div><button class="primary-btn" type="button" data-save-duty-eligibility-v120>บันทึกสิทธิ์เวร</button></div>
        ${!hasRows ? '<div class="notice soft-notice">ยังไม่เคยตั้งสิทธิ์เวรของคนนี้ ระบบแสดงค่าเริ่มต้นให้ก่อน กดบันทึกเพื่อเริ่มใช้ตารางนี้</div>' : ''}
        <div class="table-wrap duty-eligibility-wrap"><table class="duty-eligibility-table v120-duty-table"><thead><tr><th>วัน</th>${CODES.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${dayRows}</tbody></table></div>
      </div>
    </div>`;
  }
  async function saveDutyEligibilityV120(){
    if (typeof isAdmin === 'function' && !isAdmin()) return showToast('เฉพาะ Admin เท่านั้น');
    const checks = Array.from(document.querySelectorAll('[data-duty-eligibility-v120]'));
    const rows = checks.map(cb => ({staff_id:cb.dataset.staffId, position_code:eligCode(cb.dataset.dayKey, cb.dataset.dutyCode), is_eligible:!!cb.checked, updated_by: currentStaffId()}));
    if (!rows.length) return showToast('ไม่มีข้อมูลสิทธิ์เวรให้บันทึก');
    const {error} = await sb.from('daily_position_eligibility').upsert(rows, {onConflict:'staff_id,position_code'});
    if (error) return showToast(friendlyDbError(error));
    const targetStaff = rows[0].staff_id;
    const rowCodes = new Set(rows.map(r=>r.position_code));
    state.positionEligibility = (state.positionEligibility || []).filter(r => !(String(r.staff_id)===String(targetStaff) && rowCodes.has(r.position_code))).concat(rows);
    state.rosterDraft = null;
    try { await loadAllData(); } catch(e) {}
    // keep the just-saved values visible even if browser received stale cache from db
    state.positionEligibility = (state.positionEligibility || []).filter(r => !(String(r.staff_id)===String(targetStaff) && rowCodes.has(r.position_code))).concat(rows);
    renderPage(); showToast('บันทึกสิทธิ์เวรตามวันแล้ว');
  }

  // ---- Admin: Holiday rule page ----
  function renderHolidayRulesPageV120(){
    if (typeof isAdmin === 'function' && !isAdmin()) return noPermission();
    const key = state.holidayRuleMonthKey || state.monthKey || (typeof monthKey === 'function' ? monthKey(new Date()) : new Date().toISOString().slice(0,7));
    const rows = (state.holidays || []).filter(h => String(h.holiday_date || '').startsWith(key)).sort((a,b)=>String(a.holiday_date).localeCompare(String(b.holiday_date)));
    const editing = state.editHolidayRuleDate ? (state.holidays || []).find(h => h.holiday_date === state.editHolidayRuleDate) : null;
    const date = editing?.holiday_date || `${key}-01`;
    const cfg = editing ? holidayCfg(editing.holiday_date) : null;
    const allowed = editing ? holidayAllowed(editing.holiday_date) : ['ชบด1','ชบด2','ชบด3'];
    const mode = cfg?.roleMode || 'MT_MT_KERK';
    return `<div class="grid grid-2 holiday-rules-page-v120">
      <div class="card">
        <div class="section-title"><h3>${editing ? 'แก้ไขวันหยุดนักขัตฤกษ์' : 'เพิ่มวันหยุดนักขัตฤกษ์'}</h3>${editing ? '<button class="ghost-btn" type="button" data-cancel-edit-holiday-v120>ยกเลิกแก้ไข</button>' : ''}</div>
        <form id="holidayRulesFormV120" class="form-grid compact-form">
          <label>วันที่ <input name="holiday_date" type="date" value="${esc(date)}" ${editing?'readonly':''} required></label>
          <label>ชื่อวันหยุด <input name="title" value="${esc(cleanHolidayTitle(editing?.title || ''))}" placeholder="เช่น วันเฉลิมฯ" required></label>
          <label class="wide">รูปแบบคนอยู่เวรนักขัต
            <select name="holiday_role_mode"><option value="MT_MT_KERK" ${mode==='MT_MT_KERK'?'selected':''}>MT / MT / เคิก</option><option value="MT_MT_MT" ${mode==='MT_MT_MT'?'selected':''}>MT / MT / MT</option></select>
          </label>
          <div class="wide duty-checkbox-grid"><div class="field-label">เวรที่เปิดในวันนี้</div>${CODES.map(code => `<label class="check-pill"><input type="checkbox" name="holiday_duties" value="${esc(code)}" ${allowed.includes(code)?'checked':''}> <span>${esc(code)}</span></label>`).join('')}</div>
          <button class="primary-btn wide" type="submit">บันทึกวันหยุดและกฎเวร</button>
        </form>
        <div class="notice soft-notice">นักขัตแต่ละวันเลือกได้ว่า ชบด1/2/3 เป็น MT/MT/เคิก หรือ MT/MT/MT</div>
      </div>
      <div class="card"><div class="section-title"><h3>รายการวันหยุด ${esc(key)}</h3></div><div class="toolbar compact-filter"><label>เดือน <input type="month" id="holidayRuleMonthInputV120" value="${esc(key)}"></label></div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th>รูปแบบ</th><th>เวรที่เปิด</th><th>จัดการ</th></tr></thead><tbody>${rows.map(h => `<tr><td>${dateThai(h.holiday_date)}</td><td>${esc(cleanHolidayTitle(h.title))}</td><td>${holidayRoleMode(h.holiday_date)==='MT_MT_MT'?'MT/MT/MT':'MT/MT/เคิก'}</td><td>${holidayAllowed(h.holiday_date).map(c => (typeof badge==='function'?badge(detailDuty(c),'blue'):`<span>${esc(detailDuty(c))}</span>`)).join(' ') || '-'}</td><td><button class="tiny-btn" type="button" data-edit-holiday-v120="${esc(h.holiday_date)}">แก้ไข</button><button class="tiny-btn danger" type="button" data-delete-holiday-v120="${esc(h.holiday_date)}">ลบ</button></td></tr>`).join('')}</tbody></table></div>` : (typeof empty==='function'?empty('ยังไม่มีวันหยุดในเดือนนี้'):'<div>ยังไม่มีวันหยุดในเดือนนี้</div>')}
      </div>
    </div>`;
  }
  async function saveHolidayRulesV120(form){
    if (typeof isAdmin === 'function' && !isAdmin()) return showToast('เฉพาะ Admin เท่านั้น');
    const fd = new FormData(form); const date = fd.get('holiday_date'); const title = String(fd.get('title')||'').trim();
    const duties = Array.from(form.querySelectorAll('input[name="holiday_duties"]:checked')).map(x => normalizeDutyV120(x.value));
    const roleMode = String(fd.get('holiday_role_mode') || 'MT_MT_KERK');
    if (!date || !title) return showToast('กรุณาระบุวันที่และชื่อวันหยุด');
    const row = {holiday_date:date, title:encodeHoliday(title,duties,roleMode), updated_by:currentStaffId()};
    const {error} = await sb.from('public_holidays').upsert(row, {onConflict:'holiday_date'});
    if (error) return showToast(friendlyDbError(error));
    state.editHolidayRuleDate = ''; state.rosterDraft = null;
    try { await loadAllData(); } catch(e) {}
    renderPage(); showToast('บันทึกวันหยุดและกฎเวรแล้ว');
  }
  async function deleteHolidayV120(date){
    if (!(await confirmDialog(`ลบวันหยุด ${dateThai(date)} หรือไม่?`, 'ยืนยันลบวันหยุด'))) return;
    const {error} = await sb.from('public_holidays').delete().eq('holiday_date', date);
    if (error) return showToast(friendlyDbError(error));
    state.editHolidayRuleDate = ''; state.rosterDraft = null;
    try { await loadAllData(); } catch(e) {}
    renderPage(); showToast('ลบวันหยุดแล้ว');
  }

  // ---- Schedule views ----
  function dutiesByDate(assignments, date){ return (assignments || []).filter(a => String(a.duty_date) === String(date)).sort((a,b)=>String(a.duty_code||'').localeCompare(String(b.duty_code||''))); }
  function dutiesByStaff(assignments, staffId){ return (assignments || []).filter(a => String(a.staff_id) === String(staffId)).sort((a,b)=>String(a.duty_date||'').localeCompare(String(b.duty_date||'')) || String(a.duty_code||'').localeCompare(String(b.duty_code||''))); }
  function tradeBtn(a){ let ok=true; try{ ok = canRequestTrade(a); }catch(e){} return ok ? `<button type="button" class="tiny-btn" data-v120-trade="${esc(assignmentId(a))}">ซื้อ/แลก/ยก</button>` : ''; }
  function showDayDetail(date){
    const rows = dutiesByDate(monthAssignments(), date);
    showModal(`<h2>${esc(dateThai(date))}</h2><div class="table-wrap"><table><thead><tr><th>เวร</th><th>เจ้าหน้าที่</th><th>จัดการ</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(detailDuty(a.duty_code))}</td><td>${staffPillSafe(a.staff_id)}</td><td>${tradeBtn(a)||'-'}</td></tr>`).join('') || '<tr><td colspan="3">ไม่มีเวร</td></tr>'}</tbody></table></div>`);
  }
  function showPersonDetail(staffId){
    const rows = dutiesByStaff(monthAssignments(), staffId);
    let stats = {}; try { stats = calcFairness(monthAssignments()); } catch(e) {}
    const r = stats[staffId] || {};
    showModal(`<h2>${staffPillSafe(staffId)}</h2><div class="metric-grid roster-person-popup-metrics"><div><b>${Number(r.hours||0).toFixed(1)}</b><span>ชม.รวม</span></div><div><b>${Number(r.pay||0).toLocaleString()}</b><span>เงินประมาณ</span></div><div><b>${Number(r.units||0).toFixed(1)}</b><span>หน่วยเวร</span></div><div><b>${rows.length}</b><span>รวมเวร</span></div></div><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>ชม.</th><th>เงิน</th><th>จัดการ</th></tr></thead><tbody>${rows.map(a=>{ const dm=dutyMetrics(a,a.staff_id); return `<tr><td>${dateThai(a.duty_date)}</td><td>${esc(detailDuty(a.duty_code))}</td><td>${dm.hours} ชม.</td><td>${Number(dm.pay||0).toLocaleString()} บ.</td><td>${tradeBtn(a)||'-'}</td></tr>`; }).join('') || '<tr><td colspan="5">ไม่มีเวรเดือนนี้</td></tr>'}</tbody></table></div>`);
  }
  function renderToolbar(){
    return `<div class="toolbar no-print schedule-toolbar-v120"><label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(state.monthKey)}"></label><button type="button" class="ghost-btn" data-export-schedule-excel>Export Excel</button><button type="button" class="ghost-btn" data-print-page>Export PDF / พิมพ์</button><button type="button" class="soft-btn" data-show-fairness>กดชื่อคนเพื่อดูสถิติ หรือดูสมดุลเวร</button></div>`;
  }
  function renderTab(view,label,target){
    const cur = target === 'desktop' ? (state.scheduleDesktopViewV120 || 'table') : (state.scheduleMobileViewV120 || 'day');
    const attr = target === 'desktop' ? 'data-v120-desktop-tab' : 'data-v120-mobile-tab';
    return `<button type="button" class="${cur===view?'primary-btn':'ghost-btn'}" ${attr}="${view}">${esc(label)}</button>`;
  }
  function renderExcel(assignments){
    let html = '';
    try { html = renderSchedulePersonMatrix(assignments); } catch(e) { try { html = renderReadOnlySchedule(assignments); } catch(_) { html='<div class="empty-state">ไม่พบตารางเวร</div>'; } }
    return `<div class="v120-excel-view">${html}</div>`;
  }
  function renderDesktopDay(assignments){
    const {y,m} = monthRange(state.monthKey); const last = new Date(y,m,0).getDate();
    return `<div class="v120-desktop-day-list">${Array.from({length:last},(_,i)=>i+1).map(d=>{ const date=`${y}-${safePad(m)}-${safePad(d)}`; const rows=dutiesByDate(assignments,date); const off=isWeekendSafe(date)||isHolidaySafe(date); return `<button type="button" class="v120-date-card ${off?'weekend':''}" data-v120-day="${date}"><div class="v120-date-head"><b>${d}</b><span>${parse(date).toLocaleDateString('th-TH',{weekday:'short'})}</span>${isHolidaySafe(date)?`<em>${esc(typeof holidayName==='function'?holidayName(date):'วันหยุด')}</em>`:''}</div><div class="v120-duty-lines">${rows.map(a=>{ const cs=colorOf(a.staff_id); return `<span class="v120-duty-bar" data-v120-duty="${esc(assignmentId(a))}" style="${cs.css}">${esc(shortDuty(a.duty_code))} ${esc(staffName(a.staff_id))}</span>`; }).join('') || '<small class="muted">ไม่มีเวร</small>'}</div></button>`; }).join('')}</div>`;
  }
  function renderMobileDay(assignments){
    const {y,m} = monthRange(state.monthKey); const last = new Date(y,m,0).getDate();
    const firstDow = new Date(y,m-1,1).getDay(); const cells=[];
    for(let i=0;i<firstDow;i++) cells.push({blank:true});
    for(let d=1; d<=last; d++) cells.push({day:d,date:`${y}-${safePad(m)}-${safePad(d)}`});
    while(cells.length % 7) cells.push({blank:true});
    return `<p class="hint mobile-day-hint">ตารางย่อทั้งเดือน กดวันที่เพื่อดูเวรและปุ่มแลก/ขาย/ยก</p><div class="v120-mobile-cal"><div class="v120-week-head"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div><div class="v120-mobile-cal-grid">${cells.map(c=>{ if(c.blank) return '<button type="button" class="v120-mobile-day empty" disabled></button>'; const rows=dutiesByDate(assignments,c.date); const shown=rows.slice(0,4); const hidden=rows.length-shown.length; const off=isWeekendSafe(c.date)||isHolidaySafe(c.date); return `<button type="button" class="v120-mobile-day ${off?'weekend':''}" data-v120-day="${c.date}"><div class="v120-mobile-day-num"><b>${c.day}</b><span>${parse(c.date).toLocaleDateString('th-TH',{weekday:'short'})}</span></div>${shown.map(a=>{ const cs=colorOf(a.staff_id); return `<span class="v120-duty-bar" data-v120-duty="${esc(assignmentId(a))}" style="${cs.css}">${esc(shortDuty(a.duty_code))} ${esc(staffName(a.staff_id))}</span>`; }).join('')}${hidden>0?`<span class="v120-more">+${hidden}</span>`:''}</button>`; }).join('')}</div></div>`;
  }
  function renderPersons(assignments){
    return `<div class="v120-person-grid">${staffList().map(s=>{ const rows=dutiesByStaff(assignments,s.id); const cs=colorOf(s); return `<button type="button" class="v120-person-card" data-v120-person="${esc(s.id)}"><span class="staff-chip" style="${cs.css}">${esc(s.nickname||s.full_name||'-')}</span><b>${rows.length} เวร</b><div>${rows.slice(0,6).map(a=>`<small>${esc(dateThai(a.duty_date))} ${esc(shortDuty(a.duty_code))}</small>`).join('') || '<small class="muted">ไม่มีเวรเดือนนี้</small>'}</div></button>`; }).join('')}</div>`;
  }
  function daysOff(staffId, assignments){
    const {y,m}=monthRange(state.monthKey); const last=new Date(y,m,0).getDate(); const set=new Set();
    for(let d=1; d<=last; d++){ const date=`${y}-${safePad(m)}-${safePad(d)}`; const has=assignments.some(a=>String(a.staff_id)===String(staffId)&&a.duty_date===date); if((isWeekendSafe(date)||isHolidaySafe(date))&&!has) set.add(date); }
    (state.leaves||[]).forEach(l=>{ if(String(l.staff_id)!==String(staffId)||String(l.type)!=='ไม่รับเวร') return; try{ datesBetween(l.start_date,l.end_date).forEach(date=>{ if(isWeekendSafe(date)) set.add(date); }); }catch(e){} });
    return set.size;
  }
  function renderOtCards(assignments){
    let stats={}; try{ stats=calcFairness(assignments); }catch(e){}
    return `<div class="v120-ot-cards">${staffList().map(s=>{ const rows=dutiesByStaff(assignments,s.id); const r=stats[s.id]||{}; const cs=colorOf(s); const count=fn=>rows.filter(fn).length; return `<button type="button" class="v120-ot-card" data-v120-person="${esc(s.id)}"><span class="staff-chip" style="${cs.css}">${esc(s.nickname||s.full_name||'-')}</span><div class="v120-ot-grid"><span>ชั่วโมงเวร/OT</span><b>${Number(r.hours||0).toFixed(1)}</b><span>ชั่วโมงอินชาร์จ</span><b>0.0</b><span>รวม OT</span><b>${Number(r.hours||0).toFixed(1)}</b><span>เงินประมาณ</span><b>${Number(r.pay||0).toLocaleString()}</b><span>จำนวนเวร</span><b>${rows.length}</b><span>วันที่ได้หยุด</span><b>${daysOff(s.id,assignments)}</b><span>ชบด1</span><b>${count(a=>a.duty_code==='ชบด1')}</b><span>ชบด2</span><b>${count(a=>a.duty_code==='ชบด2')}</b><span>ชบด3</span><b>${count(a=>a.duty_code==='ชบด3')}</b><span>ช9</span><b>${count(a=>String(a.duty_code||'').startsWith('ช9'))}</b><span>ช3A</span><b>${count(a=>a.duty_code==='ช3A')}</b><span>ช3B</span><b>${count(a=>a.duty_code==='ช3B')}</b><span>ช4</span><b>${count(a=>String(a.duty_code||'').startsWith('ช4'))}</b></div></button>`; }).join('')}</div>`;
  }
  function renderMonthlySchedulePageV120(){
    if (!state.scheduleDesktopViewV120) state.scheduleDesktopViewV120 = 'table';
    if (!state.scheduleMobileViewV120) state.scheduleMobileViewV120 = 'day';
    const assignments = monthAssignments();
    const dview = state.scheduleDesktopViewV120;
    const mview = state.scheduleMobileViewV120;
    return `<div class="card schedule-page-v120">${renderToolbar()}<section class="v120-desktop-only"><div class="v120-tabs no-print">${renderTab('table','ตารางทั้งเดือน','desktop')}${renderTab('day','ดูตามวัน','desktop')}${renderTab('person','ดูตามคน','desktop')}</div><div class="v120-view">${dview==='day'?renderDesktopDay(assignments):dview==='person'?renderPersons(assignments):renderExcel(assignments)}</div></section><section class="v120-mobile-only"><div class="v120-tabs v120-mobile-tabs no-print">${renderTab('day','ดูตามวัน','mobile')}${renderTab('person','ดูตามคน','mobile')}${renderTab('ot','สรุป OT','mobile')}${renderTab('table','ตาราง','mobile')}</div><div class="v120-view">${mview==='person'?renderPersons(assignments):mview==='ot'?renderOtCards(assignments):mview==='table'?renderExcel(assignments):renderMobileDay(assignments)}</div></section></div>`;
  }
  window.renderMonthlySchedulePage = renderMonthlySchedulePage = renderMonthlySchedulePageV120;

  const prevRenderPage = window.renderPage || renderPage;
  window.renderPage = renderPage = function renderPageV120(){
    if (state.page === 'schedule') {
      const item = (NAV_ITEMS || []).find(x=>x.id==='schedule') || {};
      if ($id('pageTitle')) $id('pageTitle').textContent = item.title || 'ตารางเวรประจำเดือน';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = item.subtitle || 'ดูรายเดือน Export Excel / PDF / Print';
      try{ renderNav(); }catch(e){}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderMonthlySchedulePageV120();
      return;
    }
    if (state.page === 'dutyEligibilityV107') {
      if ($id('pageTitle')) $id('pageTitle').textContent = 'สิทธิ์เวรตามวัน';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = 'เลือกเจ้าหน้าที่ แล้วติ๊กว่าแต่ละวันอยู่เวรอะไรได้';
      try{ renderNav(); }catch(e){}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderDutyEligibilityPageV120();
      return;
    }
    if (state.page === 'holidayRulesV107') {
      if ($id('pageTitle')) $id('pageTitle').textContent = 'ตั้งค่าเวรวันนักขัตฤกษ์';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = 'เพิ่มวันหยุดและเลือกเวรที่เปิดรายวัน';
      try{ renderNav(); }catch(e){}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderHolidayRulesPageV120();
      return;
    }
    return prevRenderPage();
  };

  document.addEventListener('click', async function(e){
    const t = e.target.closest && e.target.closest('[data-v120-desktop-tab],[data-v120-mobile-tab],[data-v120-day],[data-v120-duty],[data-v120-person],[data-v120-trade],[data-save-duty-eligibility-v120],[data-edit-holiday-v120],[data-delete-holiday-v120],[data-cancel-edit-holiday-v120]');
    if (!t) return;
    if (t.dataset.v120DesktopTab) { e.preventDefault(); e.stopImmediatePropagation(); state.scheduleDesktopViewV120=t.dataset.v120DesktopTab; renderPage(); return; }
    if (t.dataset.v120MobileTab) { e.preventDefault(); e.stopImmediatePropagation(); state.scheduleMobileViewV120=t.dataset.v120MobileTab; renderPage(); return; }
    if (t.dataset.v120Day) { e.preventDefault(); e.stopImmediatePropagation(); showDayDetail(t.dataset.v120Day); return; }
    if (t.dataset.v120Duty) { e.preventDefault(); e.stopImmediatePropagation(); const a=monthAssignments().find(x=>assignmentId(x)===String(t.dataset.v120Duty)); if(a) showDayDetail(a.duty_date); return; }
    if (t.dataset.v120Person) { e.preventDefault(); e.stopImmediatePropagation(); showPersonDetail(t.dataset.v120Person); return; }
    if (t.dataset.v120Trade) { e.preventDefault(); e.stopImmediatePropagation(); const a=monthAssignments().find(x=>assignmentId(x)===String(t.dataset.v120Trade)); if(a && typeof showTradeRequestModal==='function') showTradeRequestModal(a); else if(a) showModal(`<h2>คำขอแลก/ขาย/ยกเวร</h2><p>${staffPillSafe(a.staff_id)} • ${dateThai(a.duty_date)} • ${detailDuty(a.duty_code)}</p><button class="primary-btn" data-page="tradeRequests">ไปหน้าคำขอแลก/ขายเวร</button>`); return; }
    if (t.hasAttribute('data-save-duty-eligibility-v120')) { e.preventDefault(); e.stopImmediatePropagation(); await saveDutyEligibilityV120(); return; }
    if (t.dataset.editHolidayV120) { e.preventDefault(); e.stopImmediatePropagation(); state.editHolidayRuleDate=t.dataset.editHolidayV120; renderPage(); return; }
    if (t.dataset.deleteHolidayV120) { e.preventDefault(); e.stopImmediatePropagation(); await deleteHolidayV120(t.dataset.deleteHolidayV120); return; }
    if (t.hasAttribute('data-cancel-edit-holiday-v120')) { e.preventDefault(); e.stopImmediatePropagation(); state.editHolidayRuleDate=''; renderPage(); return; }
  }, true);
  document.addEventListener('change', function(e){
    if (e.target.id === 'dutyEligibilityStaffSelectV120') { e.preventDefault(); e.stopImmediatePropagation(); state.dutyEligibilityStaffId = e.target.value; renderPage(); }
    if (e.target.id === 'holidayRuleMonthInputV120') { e.preventDefault(); e.stopImmediatePropagation(); state.holidayRuleMonthKey = e.target.value; state.editHolidayRuleDate=''; renderPage(); }
  }, true);
  document.addEventListener('submit', async function(e){
    if (e.target.id === 'holidayRulesFormV120') { e.preventDefault(); e.stopImmediatePropagation(); await saveHolidayRulesV120(e.target); }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .schedule-page-v120 .v120-mobile-only{display:none}.schedule-page-v120 .v120-desktop-only{display:block}.schedule-page-v120 .v120-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 16px}.schedule-page-v120 .v120-view{margin-top:8px}.v120-desktop-day-list{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:12px}.v120-date-card{border:1px solid #dbe7f3;border-radius:16px;background:#fff;min-height:140px;padding:10px;text-align:left;cursor:pointer}.v120-date-card.weekend{background:#fff9e8}.v120-date-head{display:flex;gap:6px;align-items:baseline;margin-bottom:8px}.v120-date-head b{font-size:18px}.v120-date-head span,.v120-date-head em{color:#64748b;font-style:normal}.v120-duty-bar{display:block;border-radius:8px;margin:4px 0;padding:5px 8px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v120-person-grid,.v120-ot-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.v120-person-card,.v120-ot-card{border:1px solid #dbe7f3;border-radius:16px;background:#fff;padding:12px;text-align:left;cursor:pointer}.v120-person-card small{display:block;margin:3px 0;color:#334155}.v120-ot-grid{display:grid;grid-template-columns:1fr auto;gap:6px 10px}.v120-ot-grid span{color:#64748b}.v120-week-head{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;text-align:center;color:#64748b;font-weight:700;margin:8px 0}.v120-mobile-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:7px}.v120-mobile-day{border:1px solid #dbe7f3;border-radius:14px;min-height:108px;background:#fff;padding:7px;text-align:left;overflow:hidden;cursor:pointer}.v120-mobile-day.weekend{background:#fff9e8}.v120-mobile-day.empty{background:#f8fafc;opacity:.55;cursor:default}.v120-mobile-day-num{display:flex;gap:4px;align-items:baseline;margin-bottom:4px}.v120-mobile-day-num b{font-size:18px}.v120-mobile-day-num span{color:#64748b}.v120-more{display:block;color:#64748b;font-weight:700}.duty-eligibility-page-v120{grid-template-columns:280px 1fr}.v120-duty-table th{white-space:nowrap}.holiday-rules-page-v120 .check-pill{min-width:130px}
    @media(max-width:820px){.schedule-page-v120 .v120-desktop-only{display:none!important}.schedule-page-v120 .v120-mobile-only{display:block!important}.schedule-page-v120 .v120-mobile-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.schedule-page-v120 .v120-mobile-tabs button{border-radius:16px;padding:12px 4px;font-size:16px;white-space:nowrap}.schedule-page-v120 .v120-week-head{gap:5px;font-size:14px}.schedule-page-v120 .v120-mobile-cal-grid{gap:6px}.schedule-page-v120 .v120-mobile-day{min-height:102px;border-radius:13px;padding:6px}.schedule-page-v120 .v120-duty-bar{font-size:12px;padding:3px 5px;margin:3px 0}.schedule-page-v120 .v120-excel-view h3,.schedule-page-v120 .excel-roster-section-v107 h3{font-size:22px!important;margin:14px 0 10px!important}.schedule-page-v120 .excel-roster-section-v107 .hint{display:none!important}.schedule-page-v120 .excel-roster-wrap-v107{max-height:none!important;overflow:auto!important}.schedule-page-v120 .excel-roster-table-v107 th:first-child,.schedule-page-v120 .excel-roster-table-v107 td:first-child{min-width:80px!important;width:80px!important;max-width:80px!important}.schedule-page-v120 .excel-roster-table-v107 th,.schedule-page-v120 .excel-roster-table-v107 td{height:23px!important;min-height:23px!important;padding:1px 2px!important;font-size:9.5px!important;line-height:1!important}.schedule-page-v120 .excel-roster-table-v107 .staff-name-cell b{font-size:10.5px!important;line-height:1!important}.schedule-page-v120 .excel-roster-table-v107 .staff-name-cell small{display:none!important}.schedule-page-v120 .excel-roster-table-v107 .excel-duty-cell-btn{font-size:9.5px!important;line-height:1!important;padding:0!important;min-height:20px!important}.schedule-page-v120 .v120-person-grid,.schedule-page-v120 .v120-ot-cards{grid-template-columns:1fr}.duty-eligibility-page-v120,.holiday-rules-page-v120{grid-template-columns:1fr!important}.v120-duty-table{font-size:12px}}
  `;
  document.head.appendChild(style);
})();
