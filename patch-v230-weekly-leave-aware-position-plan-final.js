/* =========================
   V230 Final loader: weekly leave-aware position plan
   - Monthly plan ignores single-day leave for slot size: staff still keeps weekly position.
   - If a staff is absent for the whole working week, reduce that week from 14 to 13/12/etc.
   - Leave cells still show the assigned position plus a leave marker.
   ========================= */
(function(){
  'use strict';
  const VERSION_V228 = 'V230_WEEKLY_LEAVE_AWARE_POSITION_PLAN_FINAL';
  if (window.__CNMI_V230_WEEKLY_LEAVE_AWARE_POSITION_PLAN_FINAL__) return;
  window.__CNMI_V230_WEEKLY_LEAVE_AWARE_POSITION_PLAN_FINAL__ = true;

  function esc228(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function normDate228(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function normalizeZone228(zone){
    const z = String(zone || '').trim();
    return z === 'Manual' ? 'Blood Bank' : (z || 'Blood Bank');
  }
  function normalizeTemplate228(p){
    if (!p) return null;
    return { ...p, zone: normalizeZone228(p.zone) };
  }
  function cloneTemplates228(list){ return (list || []).map(p => normalizeTemplate228({ ...p })).filter(Boolean); }
  function slotBucket228(count){
    const n = Number(count || 0);
    if (n <= 10) return 10;
    if (n >= 14) return 14;
    return Math.max(10, Math.min(14, Math.round(n)));
  }
  function daySlotSets228(){ return window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || null; }
  function daySlotsForCount228(count){
    const sets = daySlotSets228();
    const bucket = slotBucket228(count);
    if (sets?.[bucket]) return cloneTemplates228(sets[bucket]);
    try {
      const list = (window.cnmiPositionCatalogV182?.normalPositions182?.() || []).filter(p => p.zone !== 'ออกหน่วย');
      return cloneTemplates228(list).slice(0, bucket);
    } catch (_) { return []; }
  }
  function allDaySlots228(){
    const sets = daySlotSets228();
    if (sets) {
      const map = new Map();
      [10,11,12,13,14].forEach(n => (sets[n] || []).forEach(p => { if (p?.code && !map.has(p.code)) map.set(p.code, normalizeTemplate228(p)); }));
      return Array.from(map.values());
    }
    try { return cloneTemplates228(window.cnmiPositionCatalogV182?.normalPositions182?.() || []); } catch (_) { return []; }
  }
  function outingTemplates228(){
    try {
      const fromCatalog = window.cnmiPositionCatalogV182?.outingPositions182?.();
      if (Array.isArray(fromCatalog) && fromCatalog.length) return cloneTemplates228(fromCatalog).map(p => ({ ...p, zone:'ออกหน่วย', is_outing:true }));
    } catch (_) {}
    try { return cloneTemplates228(OUTING_POSITIONS || []).map(p => ({ ...p, zone:'ออกหน่วย', is_outing:true })); } catch (_) { return []; }
  }
  function positionTemplateByCode228(code, date){
    const base = String(typeof positionBaseCode === 'function' ? positionBaseCode(code) : code || '').trim();
    if (!base) return null;
    const list = [...daySlotsForCount228(14), ...allDaySlots228(), ...outingTemplates228()];
    const found = list.find(p => p.code === base || p.eligibility_code === base);
    if (found) return normalizeTemplate228(found);
    try { return normalizeTemplate228(positionTemplateByCode(code, date)); } catch (_) { return null; }
  }
  function positionLoadWeight228(code){
    try { return positionLoadWeight(code); } catch (_) { return 1; }
  }
  function monthPositionScore228(staff, position, counts, rows, date){
    try { return monthPositionCandidateScore(staff, position, counts, rows, date); }
    catch (_) {
      const c = counts[String(staff?.id || '')] || { total:0, byCode:{}, byZone:{}, load:0 };
      const code = String(position?.code || position?.position_code || '');
      const zone = normalizeZone228(position?.zone || '');
      return ((c.byCode?.[code] || 0) * 120) + ((c.byZone?.[zone] || 0) * 35) + ((c.total || 0) * 18) + ((c.load || 0) * 12);
    }
  }
  function monthlyCandidateOk228(staff, position){
    if (!staff || !position) return false;
    try {
      const eligibilityKey = position.eligibility_code || position.code || position.position_code;
      return isDailyPositionEnabled(staff)
        && positionRuleOk(staff, position.main_rule)
        && positionEligible(staff, eligibilityKey);
    } catch (_) { return false; }
  }
  function leaveText228(row){
    try { return leaveDisplayType(row); }
    catch (_) { return String(row?.type || row?.leave_type || 'ลาอื่นๆ').split(':::')[0].trim(); }
  }
  function activeLeaveRow228(staffId, date){
    try { return activeLeaveRecordOn(staffId, date); }
    catch (_) { return null; }
  }
  function activeLeaveIndex228(dates){
    const out = new Map();
    (state.leaves || []).forEach(l => {
      const sid = String(l?.staff_id || '');
      if (!sid) return;
      try { if (typeof isLeaveEffective === 'function' && !isLeaveEffective(l)) return; } catch (_) {}
      (dates || []).forEach(d => {
        try { if (overlapsDate(l, d) && !out.has(`${sid}|${d}`)) out.set(`${sid}|${d}`, l); } catch (_) {}
      });
    });
    return out;
  }
  function monthDates228(key){
    const { y, m, last } = getMonthRange(key);
    return Array.from({ length:last }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
  }
  function positionWorkDates228(key){ return monthDates228(key).filter(d => !isNoPositionDay(d)); }
  function weekWorkDateMap228(key){
    const map = new Map();
    positionWorkDates228(key).forEach(d => {
      const wk = weekKeyOf(d);
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(d);
    });
    return map;
  }
  function weekDatesForDate228(date){
    const key = String(normDate228(date)).slice(0, 7);
    const wk = weekKeyOf(date);
    return weekWorkDateMap228(key).get(wk) || [];
  }
  function isFullWeekUnavailable228(staffId, weekDates){
    const dates = (weekDates || []).filter(d => !isNoPositionDay(d));
    if (!dates.length) return false;
    return dates.every(d => !!activeLeaveRow228(staffId, d));
  }
  function weeklyAvailableStaff228(date){
    const weekDates = weekDatesForDate228(date);
    return orderedStaff((state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s) && !isFullWeekUnavailable228(s.id, weekDates); }
      catch (_) { return false; }
    }));
  }
  function expectedTemplatesForDate228(date){
    const d = normDate228(date);
    if (!d || isNoPositionDay(d)) return [];
    const weekStaffCount = weeklyAvailableStaff228(d).length;
    if (hasOuting(d)) {
      const roomSlots = daySlotsForCount228(weekStaffCount).filter(p => normalizeZone228(p.zone) === 'Blood Bank');
      return [...roomSlots, ...outingTemplates228()];
    }
    return daySlotsForCount228(weekStaffCount);
  }
  function addCount228(counts, staffId, code, zone){
    if (!staffId || !code) return;
    const sid = String(staffId);
    const base = String(typeof positionBaseCode === 'function' ? positionBaseCode(code) : code || '').trim();
    const z = normalizeZone228(zone || positionTemplateByCode228(base)?.zone || 'Blood Bank');
    counts[sid] = counts[sid] || { total:0, byCode:{}, byZone:{}, load:0 };
    counts[sid].total += 1;
    counts[sid].byCode[base] = (counts[sid].byCode[base] || 0) + 1;
    counts[sid].byZone[z] = (counts[sid].byZone[z] || 0) + 1;
    counts[sid].load = (counts[sid].load || 0) + positionLoadWeight228(base);
  }
  function seedFiscalCounts228(key, counts){
    let start = `${key.slice(0,4)}-01-01`, end = `${key.slice(0,4)}-12-31`;
    try {
      const fy = fiscalYearCE(`${key}-01`);
      const range = fiscalYearRangeCE(fy);
      start = range.start; end = range.end;
    } catch (_) {}
    (state.positions || []).forEach(r => {
      const d = normDate228(r?.work_date);
      if (!d || d.startsWith(key) || d < start || d > end || isNoPositionDay(d)) return;
      if (!r?.staff_id || !r?.position_code || r.position_code === 'รอตรวจสอบ') return;
      addCount228(counts, r.staff_id, r.position_code, r.zone);
    });
  }
  function chooseForPosition228(position, date, pool, used, counts, rows){
    const candidates = (pool || []).filter(st => !used.has(String(st.id)) && monthlyCandidateOk228(st, position));
    candidates.sort((a,b) => monthPositionScore228(a, position, counts, rows, date) - monthPositionScore228(b, position, counts, rows, date) || compareStaffOrder(a,b));
    return candidates[0] || null;
  }
  function choosePositionForStaff228(staff, date, templates, counts, rows, preferBloodBank){
    const usable = (templates || []).filter(p => monthlyCandidateOk228(staff, p));
    if (!usable.length) return null;
    usable.sort((a,b) => {
      if (preferBloodBank) {
        const za = normalizeZone228(a.zone) === 'Blood Bank' ? 0 : 1;
        const zb = normalizeZone228(b.zone) === 'Blood Bank' ? 0 : 1;
        if (za !== zb) return za - zb;
      }
      return monthPositionScore228(staff, a, counts, rows, date) - monthPositionScore228(staff, b, counts, rows, date) || String(a.code || '').localeCompare(String(b.code || ''), 'th');
    });
    return usable[0];
  }
  function makeRow228(staff, date, position, serialMap){
    const p = normalizeTemplate228(position);
    const row = rowForStaffPosition(staff, date, p, serialMap);
    row.zone = normalizeZone228(row.zone || p.zone);
    return row;
  }
  function reviewRow228(staff, date, reason){
    const row = reviewRowForStaff(staff, date, reason);
    row.zone = 'รอตรวจสอบ';
    return row;
  }
  function addPlannedRow228(rows, counts, serialMap, staff, date, position){
    if (!staff || !position) return;
    const row = makeRow228(staff, date, position, serialMap);
    rows.push(row);
    addCount228(counts, staff.id, row.position_code, row.zone);
  }
  function buildNormalWeekAssignment228(weekDates, weekStaff, counts, rows, serialMap){
    const firstDate = weekDates[0];
    const templates = daySlotsForCount228(weekStaff.length);
    const used = new Set();
    const assignments = [];
    const unfilledTemplates = [];
    templates.forEach(p => {
      const st = chooseForPosition228(p, firstDate, weekStaff, used, counts, rows);
      if (st) { used.add(String(st.id)); assignments.push({ staff:st, position:p }); }
      else unfilledTemplates.push(p);
    });
    const remaining = weekStaff.filter(st => !used.has(String(st.id)));
    remaining.forEach(st => {
      const available = unfilledTemplates.filter(p => monthlyCandidateOk228(st, p));
      const p = choosePositionForStaff228(st, firstDate, available, counts, rows, false);
      if (p) {
        used.add(String(st.id));
        assignments.push({ staff:st, position:p });
        const idx = unfilledTemplates.findIndex(x => x.code === p.code);
        if (idx >= 0) unfilledTemplates.splice(idx, 1);
      } else {
        assignments.push({ staff:st, review:true, reason:'จำนวนคนมากกว่าหรือสิทธิ์ไม่ตรงกับชุด Slot ของสัปดาห์นี้' });
      }
    });
    return assignments;
  }
  function addOutingDayRows228(date, weekStaff, rows, counts, serialMap){
    const used = new Set();
    const participantIds = new Set((typeof outingParticipants === 'function' ? outingParticipants(date) : []).map(String));
    const outingPool = weekStaff.filter(st => participantIds.has(String(st.id)));
    const roomPool = weekStaff.filter(st => !participantIds.has(String(st.id)));
    outingTemplates228().forEach(p => {
      const st = chooseForPosition228(p, date, outingPool, used, counts, rows);
      if (st) { used.add(String(st.id)); addPlannedRow228(rows, counts, serialMap, st, date, p); }
    });
    const roomSlots = daySlotsForCount228(weekStaff.length).filter(p => normalizeZone228(p.zone) === 'Blood Bank');
    roomSlots.forEach(p => {
      const st = chooseForPosition228(p, date, roomPool, used, counts, rows);
      if (st) { used.add(String(st.id)); addPlannedRow228(rows, counts, serialMap, st, date, p); }
    });
    roomPool.filter(st => !used.has(String(st.id))).forEach(st => rows.push(reviewRow228(st, date, 'คนอยู่ห้องมากกว่าช่อง Blood Bank ในวันออกหน่วย')));
    outingPool.filter(st => !used.has(String(st.id))).forEach(st => rows.push(reviewRow228(st, date, 'คนออกหน่วยมากกว่าช่องออกหน่วย')));
  }

  window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV228(key){
    const monthKey = key || state.positionMonthKey || state.monthKey || monthKey(new Date());
    const rows = [];
    const counts = {};
    const serialMap = {};
    seedFiscalCounts228(monthKey, counts);
    const weekMap = weekWorkDateMap228(monthKey);
    Array.from(weekMap.entries()).sort((a,b) => a[1][0].localeCompare(b[1][0])).forEach(([wk, weekDates]) => {
      const weekStaff = orderedStaff((state.staff || []).filter(s => {
        try { return isDailyPositionEnabled(s) && !isFullWeekUnavailable228(s.id, weekDates); }
        catch (_) { return false; }
      }));
      if (!weekStaff.length) return;
      const normalDates = weekDates.filter(d => !hasOuting(d));
      const normalAssignments = normalDates.length ? buildNormalWeekAssignment228(normalDates, weekStaff, counts, rows, serialMap) : [];
      weekDates.forEach(date => {
        if (hasOuting(date)) {
          addOutingDayRows228(date, weekStaff, rows, counts, serialMap);
          return;
        }
        normalAssignments.forEach(item => {
          if (item.review) rows.push(reviewRow228(item.staff, date, item.reason));
          else addPlannedRow228(rows, counts, serialMap, item.staff, date, item.position);
        });
      });
    });
    return { monthKey, rows };
  };

  window.monthPositionRoleOptionsForDate = monthPositionRoleOptionsForDate = function monthPositionRoleOptionsForDateV228(date, currentCode=''){
    const d = normDate228(date);
    if (!d || isNoPositionDay(d)) return [];
    let allowed = hasOuting(d) ? expectedTemplatesForDate228(d) : daySlotsForCount228(weeklyAvailableStaff228(d).length);
    const current = String(currentCode || '').trim();
    if (current && !allowed.some(p => p.code === current)) {
      const row = positionTemplateByCode228(current, d);
      if (row?.code) allowed.push(row);
    }
    const seen = new Set();
    return allowed.filter(p => p?.code && !seen.has(p.code) && seen.add(p.code));
  };

  window.makeMonthPositionRow = makeMonthPositionRow = function makeMonthPositionRowV228(date, staffId, code){
    const d = normDate228(date);
    const base = positionTemplateByCode228(code, d) || {};
    return { work_date:d, position_code:String(code || '').trim(), zone:normalizeZone228(base.zone || 'Blood Bank'), break_time:base.break_time || '-', main_rule:base.main_rule || '', job_desc:base.job_desc || '', staff_id:staffId, updated_by:currentStaffId() };
  };

  window.positionZoneForCode = positionZoneForCode = function positionZoneForCodeV228(code, fallback=''){
    return normalizeZone228(positionTemplateByCode228(code)?.zone || fallback || 'Blood Bank');
  };

  function renderCountCell228(date, assignedStaffByDate){
    const d = normDate228(date);
    if (isNoPositionDay(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const available = weeklyAvailableStaff228(d).length;
    const slots = expectedTemplatesForDate228(d).length;
    const assigned = assignedStaffByDate.get(d)?.size || 0;
    const fullWeekOut = Math.max(0, (state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s) && isFullWeekUnavailable228(s.id, weekDatesForDate228(d)); } catch (_) { return false; }
    }).length);
    const tone = assigned >= Math.min(available, slots) ? 'complete' : 'has-missing';
    const title = fullWeekOut ? `มีคนลาทั้งสัปดาห์ ${fullWeekOut} คน จึงลด Slot สัปดาห์นี้` : 'คนลาเฉพาะบางวันยังคงตำแหน่งประจำสัปดาห์';
    return `<th class="count-role-cell ${tone}" title="${esc228(title)}"><b>${esc228(available)}/${esc228(slots)}</b><br><small>คน/Slot${fullWeekOut ? ` • ลด ${esc228(fullWeekOut)}` : ''}</small></th>`;
  }
  function renderMissingCell228(date, assignedByDate){
    const d = normDate228(date);
    if (isNoPositionDay(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const assigned = assignedByDate.get(d) || new Set();
    const expected = expectedTemplatesForDate228(d);
    const missing = expected.filter(p => !assigned.has(p.code));
    const bucket = slotBucket228(weeklyAvailableStaff228(d).length);
    if (!missing.length) return `<th class="missing-role-cell complete">ครบ<br><small>ชุด ${bucket}</small></th>`;
    return `<th class="missing-role-cell has-missing" title="ชุด ${bucket} คน">${missing.map(p => `<span>${esc228(p.code)}</span>`).join('')}<small>ชุด ${bucket}</small></th>`;
  }
  function renderMonthCell228(staff, date, cellRows, canEdit, leaveIndex){
    const d = normDate228(date);
    if (isWeekend(d) || isHolidayDate(d)) return `<td class="matrix-cell no-position-day ${isHolidayDate(d) ? 'holiday-cell' : 'weekend-cell'}"><span>${isHolidayDate(d) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
    const leaveRow = leaveIndex.get(`${String(staff?.id || '')}|${d}`) || null;
    const leaveText = leaveRow ? leaveText228(leaveRow) : '';
    const hasLeave = !!leaveRow;
    const row = (cellRows || [])[0] || null;
    const cleanCodes = (cellRows || []).map(r => String(r?.position_code || r?.code || '').trim()).filter(Boolean).filter(c => c !== 'รอตรวจสอบ');
    const cls = `${hasOuting(d) ? 'outing-cell' : ''} ${hasLeave ? 'leave-cell ' + leaveCellClass(leaveText) : ''} ${!cleanCodes.length && !hasLeave ? 'needs-review-cell' : ''}`.trim();
    const leaveMark = hasLeave ? `<small class="leave-note-v228">${esc228(leaveText)}</small>` : '';
    if (canEdit) {
      const current = row?.position_code || '';
      const options = monthPositionRoleOptionsForDate(d, current);
      return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc228(d)}|${esc228(staff?.id || '')}"><option value="">${hasLeave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${options.map(t => `<option value="${esc228(t.code)}" ${current===t.code?'selected':''}>${esc228(t.code)}</option>`).join('')}</select>${leaveMark}${hasOuting(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    }
    const text = cleanCodes.length ? cleanCodes.join(' / ') : (hasLeave ? leaveText : '');
    const safeText = esc228(text);
    return `<td class="matrix-cell ${cls}">${safeText ? `<span title="${safeText}${hasLeave && cleanCodes.length ? ' • ' + esc228(leaveText) : ''}">${safeText}</span>` : ''}${leaveMark}${hasOuting(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
  }

  window.renderMonthPositionMatrix = renderMonthPositionMatrix = function renderMonthPositionMatrixV228(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) ? dates : [];
    if (!rows.length) return empty('ยังไม่มีแผนรายเดือน กด “สร้างตารางเปล่า” หรือ “สร้างแผนรายสัปดาห์ทั้งเดือน” ก่อน');
    const byCell = Object.create(null);
    const assignedByDate = new Map();
    const assignedStaffByDate = new Map();
    rows.forEach((r, idx) => {
      const sid = String(r?.staff_id || '');
      const d = normDate228(r?.work_date);
      if (!sid || !d) return;
      const row = { ...r, zone:normalizeZone228(r.zone), _idx:idx };
      (byCell[`${sid}|${d}`] ||= []).push(row);
      const code = String(r?.position_code || r?.code || '').trim();
      if (code && code !== 'รอตรวจสอบ') {
        if (!assignedByDate.has(d)) assignedByDate.set(d, new Set());
        assignedByDate.get(d).add(code);
        if (!assignedStaffByDate.has(d)) assignedStaffByDate.set(d, new Set());
        assignedStaffByDate.get(d).add(sid);
      }
    });
    const rowStaffIds = new Set(rows.map(r => String(r?.staff_id || '')).filter(Boolean));
    const displayStaff = orderedStaff((state.staff || []).filter(s => isDailyPositionEnabled(s) || rowStaffIds.has(String(s.id))));
    const canEdit = isAdmin() && state.page === 'positionMonth';
    const leaveIndex = activeLeaveIndex228(dates);
    const heads = dates.map(date => {
      const d = parseDate(date);
      const cls = isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOuting(date) ? 'outing-head' : '';
      return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('');
    const countRow = dates.map(date => renderCountCell228(date, assignedStaffByDate)).join('');
    const missing = dates.map(date => renderMissingCell228(date, assignedByDate)).join('');
    return `<div class="monthly-matrix-wrap v182-position-matrix v218-position-matrix v228-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="legend-box leave"></span> คนลาเฉพาะบางวันยังคงตำแหน่งประจำสัปดาห์ / ถ้าลาทั้งสัปดาห์จะลด Slot สัปดาห์นั้น ${canEdit ? '<span class="hint">Admin เลือกตำแหน่งในช่องได้ แม้วันนั้นมีลา แล้วกดบันทึกแผนทั้งเดือน</span>' : ''}</div><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countRow}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missing}</tr></thead><tbody>${displayStaff.map(st => { const bg = staffColor(st); const fg = textColorFor(bg); return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc228(bg)};color:${esc228(fg)}"><div class="matrix-staff-name"><b>${esc228(st.nickname || st.full_name || '-')}</b><small>${esc228(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc228(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell228(st, date, byCell[`${st.id}|${date}`] || [], canEdit, leaveIndex)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };

  const oldRenderPositionMonthPage228 = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage228) {
    window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV228(){
      let html = String(oldRenderPositionMonthPage228.apply(this, arguments) || '');
      html = html.replace(/สร้างแผนทั้งเดือน/g, 'สร้างแผนรายสัปดาห์ทั้งเดือน');
      html = html.replace(/ระบบเลือกชุด 10, 11, 12, 13 หรือ 14 ตำแหน่งตามจำนวนเจ้าหน้าที่ที่มาทำงานจริงในแต่ละวัน[^<]*/g, 'ระบบเลือกชุด 10-14 ตามจำนวนคนประจำสัปดาห์: ลาเฉพาะบางวันยังคงตำแหน่งเดิม แต่ถ้าลาทั้งสัปดาห์จะลด Slot ของสัปดาห์นั้น');
      return html;
    };
  }

  console.info(`${VERSION_V228} loaded`);
})();
