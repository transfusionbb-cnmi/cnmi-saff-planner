
/* Original source: patch-v225-weekly-rotation-position-plan.js */
try {
/* =========================
   V225 Weekly Rotation Position Plan
   - Monthly position plan uses weekly fixed assignment then rotates next week.
   - Monthly baseline ignores leave/unavailable; daily page is used to adjust real staff remaining.
   - Adds staff/slot count row, stronger sticky staff+summary columns, daily baseline comparison, and overview tabs.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V225_WEEKLY_ROTATION_POSITION_PLAN';
  if (window.__CNMI_V225_WEEKLY_ROTATION_POSITION_PLAN__) return;
  window.__CNMI_V225_WEEKLY_ROTATION_POSITION_PLAN__ = true;

  const DAY_SETS = [8,9,10,11,12,13,14];
  const ROOM_COLUMNS = ['Blood Bank','Donor Room','ออกหน่วย'];
  const FY_ROOM_COLUMNS = ['Blood Bank','Donor Room','ออกหน่วย'];
  const LS_DAILY_SLOT_KEY = 'cnmi_v225_daily_slot_set_by_date';

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(msg, tone){ try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } }
  function pad2(n){ try { return pad(n); } catch (_) { return String(n).padStart(2,'0'); } }
  function norm(v){ try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } }
  function today(){ try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } }
  function safeStaffId(v){ return String(v == null ? '' : v).trim(); }
  function staffName(st){ return st ? (st.nickname || st.full_name || st.email || '-') : '-'; }
  function badgeSafe(text, tone){ try { return badge(text, tone); } catch (_) { return `<span class="badge ${esc(tone || 'blue')}">${esc(text)}</span>`; } }
  function emptySafe(text){ try { return empty(text); } catch (_) { return `<div class="empty-state">${esc(text)}</div>`; } }
  function staffPillSafe(id){ try { return id ? staffPill(id) : '<span class="muted">-</span>'; } catch (_) { return id ? esc(id) : '<span class="muted">-</span>'; } }
  function thDay(date){ try { return parseDate(date).toLocaleDateString('th-TH', { weekday:'short' }); } catch (_) { return ''; } }
  function parseSafe(date){ try { return parseDate(norm(date)); } catch (_) { const [y,m,d] = norm(date).split('-').map(Number); return new Date(y || 2000, (m || 1) - 1, d || 1); } }
  function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function addDays(date, days){ const d = parseSafe(date); d.setDate(d.getDate() + Number(days || 0)); return dateKey(d); }
  function isWeekendSafe(date){ try { return isWeekend(norm(date)); } catch (_) { return parseSafe(date).getDay() === 0 || parseSafe(date).getDay() === 6; } }
  function isHolidaySafe(date){ try { return isHolidayDate(norm(date)); } catch (_) { return false; } }
  function isNoPosition(date){ try { return isNoPositionDay(norm(date)); } catch (_) { return isWeekendSafe(date) || isHolidaySafe(date); } }
  function hasOutingSafe(date){ try { return !!hasOuting(norm(date)); } catch (_) { return false; } }
  function outingIds(date){ try { return new Set((outingParticipants(norm(date)) || []).map(String)); } catch (_) { return new Set(); } }
  function compareStaffSafe(a,b){ try { return compareStaffOrder(a,b); } catch (_) { return String(staffName(a)).localeCompare(String(staffName(b)), 'th'); } }
  function orderStaff(rows){ try { return orderedStaff(rows || []); } catch (_) { return (rows || []).slice().sort(compareStaffSafe); } }
  function displayZone(z, code=''){ const raw = String(z || '').trim(); const c = String(code || '').trim(); if (raw === 'ออกหน่วย') return 'ออกหน่วย'; if (raw === 'Manual' || /^BB-Manual/i.test(c) || /manual/i.test(c)) return 'Blood Bank'; if (raw === 'Donor Room' || /^DR-/i.test(c)) return 'Donor Room'; if (raw === 'Blood Bank' || /^BB-/i.test(c)) return 'Blood Bank'; return raw || 'Blood Bank'; }
  function monthRange(key){
    try { const r = getMonthRange(key); return { y:r.y, m:r.m, last:r.last || new Date(r.y, r.m, 0).getDate(), start:r.start || `${r.y}-${pad2(r.m)}-01`, end:r.end || `${r.y}-${pad2(r.m)}-${pad2(r.last || new Date(r.y, r.m, 0).getDate())}` }; }
    catch (_) { const [yy,mm] = String(key || today().slice(0,7)).split('-').map(Number); const y = yy || new Date().getFullYear(); const m = mm || new Date().getMonth()+1; const last = new Date(y, m, 0).getDate(); return { y, m, last, start:`${y}-${pad2(m)}-01`, end:`${y}-${pad2(m)}-${pad2(last)}` }; }
  }
  function monthDates(key){ const r = monthRange(key); return Array.from({ length:r.last }, (_,i) => `${r.y}-${pad2(r.m)}-${pad2(i+1)}`); }
  function weekKey(date){
    const d = parseSafe(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return dateKey(d);
  }
  function weekIndexFromFiscal(date){
    const fs = fiscalStart(date);
    const a = parseSafe(fs); const b = parseSafe(date);
    const days = Math.floor((b.getTime() - a.getTime()) / 86400000);
    return Math.max(0, Math.floor(days / 7));
  }
  function fiscalStart(date){
    const d = parseSafe(date);
    const y = d.getFullYear();
    const m = d.getMonth();
    return `${m >= 9 ? y : y - 1}-10-01`;
  }
  function fiscalEnd(date){
    const s = fiscalStart(date);
    const y = Number(String(s).slice(0,4)) + 1;
    return `${y}-09-30`;
  }
  function staffForMonthlyTemplate(){
    const rows = (state.staff || []).filter(st => {
      try { return isDailyPositionEnabled(st); }
      catch (_) { return st?.id && st?.is_active !== false && st?.staff_type !== 'แพทย์'; }
    });
    return orderStaff(rows);
  }
  function workingStaffToday(date){
    try { return dailyWorkingStaff(norm(date)) || []; }
    catch (_) { return orderStaff((state.staff || []).filter(st => {
      try { return isDailyPositionEnabled(st) && !isActiveLeaveOn(st.id, norm(date)); }
      catch (__){ return st?.id && st?.is_active !== false; }
    })); }
  }
  function bucketForCount(n){
    const x = Math.max(8, Math.min(14, Number(n) || 14));
    return DAY_SETS.reduce((best, v) => Math.abs(v - x) < Math.abs(best - x) ? v : best, 14);
  }
  function configs(){
    try { return window.cnmiV224?.currentConfigs?.() || null; } catch (_) { return null; }
  }
  function sanitizeSlots(rows, isOuting){
    return (Array.isArray(rows) ? rows : []).map((r,i) => {
      const code = String(r?.code || r?.position_code || '').trim();
      if (!code) return null;
      const out = isOuting || r?.is_outing === true || String(r?.zone || '') === 'ออกหน่วย' || String(r?.eligibility_code || '').startsWith('OUTING:');
      return {
        ...r,
        code,
        position_code: code,
        zone: out ? 'ออกหน่วย' : displayZone(r?.zone, code),
        break_time: String(r?.break_time || '').trim() || (out ? 'ออกหน่วย' : '-'),
        main_rule: String(r?.main_rule || '').trim() || '',
        job_desc: String(r?.job_desc || r?.detail || '').trim() || '',
        eligibility_code: String(r?.eligibility_code || '').trim() || (out ? `OUTING:${code}` : code),
        sort_order: Number(r?.sort_order || r?.order || (i+1)) || (i+1),
        is_outing: out
      };
    }).filter(Boolean).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }
  function daySlotsForCount(count){
    const cfg = configs();
    const n = bucketForCount(count);
    let rows = cfg?.day?.[n] || cfg?.day?.[String(n)] || [];
    if (!rows.length) {
      try { rows = positionTemplateForDate(today()).filter(p => String(p?.zone || '') !== 'ออกหน่วย'); } catch (_) { rows = []; }
    }
    return sanitizeSlots(rows, false);
  }
  function daySlotsForDateByCount(date, count){
    if (hasOutingSafe(date)) return daySlotsForCount(count).filter(p => displayZone(p.zone, p.code) === 'Blood Bank');
    return daySlotsForCount(count);
  }
  function outingSlots(){
    const cfg = configs();
    const rows = cfg?.outing || [];
    if (rows.length) return sanitizeSlots(rows, true);
    try { return sanitizeSlots(positionTemplateForDate(today()).filter(p => String(p?.zone || '') === 'ออกหน่วย'), true); } catch (_) { return []; }
  }
  function allSlotTemplates(){
    const map = new Map();
    DAY_SETS.forEach(n => daySlotsForCount(n).forEach(p => { if (!map.has(p.code)) map.set(p.code, p); }));
    outingSlots().forEach(p => { if (!map.has(p.code)) map.set(p.code, p); });
    try { (ALL_POSITION_TEMPLATES || []).forEach(p => { if (p?.code && !map.has(p.code)) map.set(p.code, p); }); } catch (_) {}
    return Array.from(map.values());
  }
  function baseCode(code){ try { return positionBaseCode(code); } catch (_) { return String(code || '').replace(/\s+#\d+$/, '').trim(); } }
  function labelCode(code){ try { return positionLabelForCell(code); } catch (_) { return baseCode(code); } }
  function zoneOf(pos){
    const code = baseCode(pos?.code || pos?.position_code || '');
    let z = String(pos?.zone || '').trim();
    if (!z) { try { z = positionTemplateByCode(code)?.zone || ''; } catch (_) {} }
    return displayZone(z, code);
  }
  function roomOf(pos){ return zoneOf(pos); }
  function ruleOkNoLeave(staff, pos){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff)) return false; } catch (_) {}
    try { if (typeof positionRuleOk === 'function' && !positionRuleOk(staff, pos.main_rule || '')) return false; } catch (_) {}
    try { if (typeof positionEligible === 'function' && !positionEligible(staff, pos.eligibility_code || pos.code)) return false; } catch (_) {}
    return true;
  }
  function dailyEligible(staff, pos, date){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff) || isActiveLeaveOn(staff.id, norm(date))) return false; } catch (_) {}
    return ruleOkNoLeave(staff, pos);
  }
  function makeRow(date, staff, pos){
    const p = { ...pos, code:pos.code || pos.position_code, position_code:pos.code || pos.position_code };
    try { return rowForStaffPosition(staff, norm(date), p, {}); } catch (_) {}
    return {
      work_date:norm(date),
      position_code:p.code,
      zone:p.zone || zoneOf(p),
      break_time:p.break_time || '-',
      main_rule:p.main_rule || '',
      job_desc:p.job_desc || '',
      staff_id:staff?.id || null,
      updated_by:(typeof currentStaffId === 'function' ? currentStaffId() : null)
    };
  }
  function reviewPos(reason){ return { code:'รอตรวจสอบ', position_code:'รอตรวจสอบ', zone:'รอตรวจสอบ', break_time:'-', main_rule:'', job_desc:reason || 'จำนวนคนมากกว่าชุด Slot หรือสิทธิ์ไม่ตรงตำแหน่ง', eligibility_code:'รอตรวจสอบ' }; }
  function isRealCode(code){ const c = baseCode(code); return !!c && c !== 'รอตรวจสอบ'; }
  function loadWeight(pos){ try { return Number(positionLoadWeight(pos)) || 1; } catch (_) { return 1; } }
  function initStats(){ return { total:0, load:0, byCode:{}, byRoom:{}, lastCode:'', lastRoom:'' }; }
  function addStats(stats, staffId, pos){
    if (!staffId || !pos) return;
    const s = stats[staffId] || (stats[staffId] = initStats());
    const c = baseCode(pos.code || pos.position_code || '');
    const r = roomOf(pos);
    if (!isRealCode(c)) return;
    s.total += 1;
    s.load += loadWeight(pos);
    s.byCode[c] = (s.byCode[c] || 0) + 1;
    s.byRoom[r] = (s.byRoom[r] || 0) + 1;
    s.lastCode = c;
    s.lastRoom = r;
  }
  function priorFiscalStats(monthKey){
    const start = fiscalStart(`${monthKey}-01`);
    const monthStart = `${monthKey}-01`;
    const stats = {};
    (state.positions || []).forEach(r => {
      const d = norm(r?.work_date);
      if (!d || d < start || d >= monthStart) return;
      const sid = safeStaffId(r?.staff_id);
      const code = baseCode(r?.position_code || r?.code || '');
      if (!sid || !isRealCode(code)) return;
      addStats(stats, sid, { code, position_code:code, zone:r.zone });
    });
    return stats;
  }
  function lastMonthCodesByStaff(monthKey){
    const [yRaw,mRaw] = String(monthKey).split('-').map(Number);
    const d = new Date(yRaw || new Date().getFullYear(), (mRaw || 1) - 2, 1);
    const prev = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
    const out = {};
    (state.positions || []).forEach(r => {
      const dkey = norm(r?.work_date);
      if (!dkey.startsWith(prev)) return;
      const sid = safeStaffId(r?.staff_id);
      const c = baseCode(r?.position_code || r?.code || '');
      if (!sid || !isRealCode(c)) return;
      (out[sid] ||= new Set()).add(c);
    });
    return out;
  }
  function circularDistance(a,b,n){ if (!n) return 0; const d = Math.abs((a % n) - (b % n)); return Math.min(d, n - d); }
  function scorePositionForStaff(staff, pos, ctx){
    const sid = safeStaffId(staff?.id);
    const code = baseCode(pos.code || pos.position_code || '');
    const room = roomOf(pos);
    const hist = ctx.hist[sid] || initStats();
    const cur = ctx.cur[sid] || initStats();
    const lastMonth = ctx.lastMonth[sid] || new Set();
    const staffIndex = ctx.staffIndex.get(sid) || 0;
    const posIndex = ctx.posIndex.get(code) || 0;
    const desired = (staffIndex + ctx.fiscalWeekIndex) % Math.max(1, ctx.slots.length);
    let score = 0;
    score += (hist.byCode[code] || 0) * 900;
    score += (cur.byCode[code] || 0) * 1250;
    score += (hist.byRoom[room] || 0) * 170;
    score += (cur.byRoom[room] || 0) * 360;
    score += (hist.load || 0) * 12 + (cur.load || 0) * 35 + (hist.total || 0) * 8 + (cur.total || 0) * 18;
    if (lastMonth.has(code)) score += 1800;
    if (ctx.prevWeekCode[sid] === code) score += 2600;
    if (ctx.prevWeekRoom[sid] === room) score += 380;
    const requiredRooms = ['Blood Bank','Donor Room'];
    if (requiredRooms.includes(room) && !(cur.byRoom[room] || 0)) score -= 420;
    if (requiredRooms.includes(room) && !(hist.byRoom[room] || 0)) score -= 90;
    score += circularDistance(posIndex, desired, ctx.slots.length) * 6;
    return score;
  }
  function chooseWeeklyAssignments(staffList, slots, weekDates, ctx){
    const assignments = new Map();
    const usedCodes = new Set();
    const firstDate = weekDates[0] || `${ctx.monthKey}-01`;
    const eligibleCount = (st) => slots.filter(p => ruleOkNoLeave(st, p)).length || 99;
    const staffOrder = staffList.slice().sort((a,b) => eligibleCount(a) - eligibleCount(b) || compareStaffSafe(a,b));
    staffOrder.forEach(st => {
      const sid = safeStaffId(st.id);
      let candidates = slots.filter(p => !usedCodes.has(baseCode(p.code)) && ruleOkNoLeave(st, p));
      if (!candidates.length) candidates = slots.filter(p => !usedCodes.has(baseCode(p.code)));
      if (!candidates.length) candidates = slots.slice();
      candidates.sort((a,b) => scorePositionForStaff(st, a, ctx) - scorePositionForStaff(st, b, ctx) || String(a.code).localeCompare(String(b.code), 'th'));
      const chosen = candidates[0] || reviewPos('ไม่พบตำแหน่งที่ตรงสิทธิ์ในสัปดาห์นี้');
      assignments.set(sid, chosen);
      if (isRealCode(chosen.code)) usedCodes.add(baseCode(chosen.code));
      addStats(ctx.cur, sid, chosen);
      ctx.prevWeekCode[sid] = baseCode(chosen.code || '');
      ctx.prevWeekRoom[sid] = roomOf(chosen);
    });
    return assignments;
  }
  function groupedWorkWeeks(key){
    const groups = new Map();
    monthDates(key).forEach(date => {
      if (isNoPosition(date)) return;
      const wk = weekKey(date);
      if (!groups.has(wk)) groups.set(wk, []);
      groups.get(wk).push(date);
    });
    return Array.from(groups.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([key, dates]) => ({ key, dates }));
  }
  function buildWeeklyRotationPlan(key){
    const monthKey = String(key || (state.positionMonthKey || state.monthKey || today().slice(0,7))).slice(0,7);
    const staffList = staffForMonthlyTemplate();
    const rows = [];
    const slotCount = bucketForCount(staffList.length);
    const slots = daySlotsForCount(slotCount);
    const hist = priorFiscalStats(monthKey);
    const cur = {};
    const lastMonth = lastMonthCodesByStaff(monthKey);
    const staffIndex = new Map(staffList.map((s,i) => [safeStaffId(s.id), i]));
    const posIndex = new Map(slots.map((p,i) => [baseCode(p.code), i]));
    const prevWeekCode = {};
    const prevWeekRoom = {};
    groupedWorkWeeks(monthKey).forEach(week => {
      const ctx = { monthKey, hist, cur, lastMonth, staffIndex, posIndex, slots, fiscalWeekIndex:weekIndexFromFiscal(week.dates[0]), prevWeekCode, prevWeekRoom };
      const weekly = chooseWeeklyAssignments(staffList, slots, week.dates, ctx);
      week.dates.forEach(date => {
        staffList.forEach(st => {
          const pos = weekly.get(safeStaffId(st.id)) || reviewPos('ยังไม่จัดตำแหน่งตั้งต้น');
          rows.push(makeRow(date, st, pos));
        });
      });
    });
    return { monthKey, rows, autoPlanV225:true, weeklyRotation:true, slotSet:slotCount, ignoreLeave:true };
  }
  function blankMonthlyTemplate(key){
    const monthKey = String(key || (state.positionMonthKey || state.monthKey || today().slice(0,7))).slice(0,7);
    const staffList = staffForMonthlyTemplate();
    const rows = [];
    monthDates(monthKey).forEach(date => {
      if (isNoPosition(date)) return;
      staffList.forEach(st => rows.push({ work_date:date, position_code:'', code:'', zone:'', break_time:'', main_rule:'', job_desc:'', staff_id:st.id, updated_by:(typeof currentStaffId === 'function' ? currentStaffId() : null), _blankTableV225:true }));
    });
    return { monthKey, rows, blankTable:true, ignoreLeave:true };
  }

  // Override monthly draft builder after V224. This is the main requested logic.
  try {
    window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV225(key){ return buildWeeklyRotationPlan(key); };
  } catch (_) { window.buildMonthlyPositionDraft = function(key){ return buildWeeklyRotationPlan(key); }; }
  if (window.cnmiV224) {
    window.cnmiV224.buildAutoPlanV225 = buildWeeklyRotationPlan;
  }

  function rowsForMonthContext(key){
    if (state.monthPositionDraft?.monthKey === key && Array.isArray(state.monthPositionDraft.rows)) return state.monthPositionDraft.rows;
    return (state.positions || []).filter(r => norm(r?.work_date).startsWith(key));
  }
  function cellRowsByStaffDate(rows){
    const by = Object.create(null);
    const assigned = new Map();
    (rows || []).forEach((r,idx) => {
      const sid = safeStaffId(r?.staff_id);
      const d = norm(r?.work_date);
      if (!sid || !d) return;
      (by[`${sid}|${d}`] ||= []).push({ ...r, _idx:idx });
      const c = baseCode(r?.position_code || r?.code || '');
      if (isRealCode(c)) {
        if (!assigned.has(d)) assigned.set(d, new Set());
        assigned.get(d).add(c);
      }
    });
    return { by, assigned };
  }
  function expectedSlotsForMonthDate(date){
    const staffCount = staffForMonthlyTemplate().length;
    if (hasOutingSafe(date)) return [...daySlotsForDateByCount(date, staffCount), ...outingSlots()];
    return daySlotsForDateByCount(date, staffCount);
  }
  function countCell(date, assigned){
    const d = norm(date);
    if (isNoPosition(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const activeCount = staffForMonthlyTemplate().length;
    const actualCount = workingStaffToday(d).length;
    const slots = expectedSlotsForMonthDate(d);
    const assignedCount = assigned.get(d)?.size || 0;
    const diff = actualCount - slots.length;
    const diffText = diff === 0 ? 'พอดี' : (diff > 0 ? `เกิน ${diff}` : `ขาด ${Math.abs(diff)}`);
    return `<th class="count-role-cell ${diff<0?'has-missing':diff>0?'has-extra':'complete'}" title="ตั้งต้น ${activeCount} คน | เหลือจริง ${actualCount} คน | Slot ${slots.length}">
      <b>${actualCount}/${slots.length}</b><br><small>ตั้งต้น ${activeCount}</small><br><small>${esc(diffText)}</small>
    </th>`;
  }
  function missingCell(date, assigned){
    const d = norm(date);
    if (isNoPosition(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const set = assigned.get(d) || new Set();
    const missing = expectedSlotsForMonthDate(d).filter(p => !set.has(baseCode(p.code)));
    if (!missing.length) return `<th class="missing-role-cell complete">ครบ</th>`;
    return `<th class="missing-role-cell has-missing">${missing.slice(0,4).map(p => `<span>${esc(p.code)}</span>`).join('')}${missing.length>4?`<small>+${missing.length-4}</small>`:''}</th>`;
  }
  function monthOptions(date, current){
    const d = norm(date);
    const expected = expectedSlotsForMonthDate(d);
    const list = expected.length ? expected : allSlotTemplates();
    const map = new Map(list.map(p => [p.code, p]));
    if (current && !map.has(current)) {
      const found = allSlotTemplates().find(p => baseCode(p.code) === baseCode(current)) || { code:current, zone:'รอตรวจสอบ' };
      map.set(current, found);
    }
    return Array.from(map.values());
  }
  function renderMonthCellV225(staff, date, cellRows, canEdit){
    const d = norm(date);
    if (isNoPosition(d)) return `<td class="matrix-cell no-position-day ${isHolidaySafe(d) ? 'holiday-cell' : 'weekend-cell'}"><span>${isHolidaySafe(d) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
    const row = (cellRows || [])[0] || null;
    const cleanCodes = (cellRows || []).map(r => baseCode(r?.position_code || r?.code || '')).filter(isRealCode);
    const current = row?.position_code || '';
    const cls = `${hasOutingSafe(d) ? 'outing-cell' : ''} ${!cleanCodes.length ? 'needs-review-cell' : ''}`.trim();
    if (canEdit) {
      const options = monthOptions(d, current);
      return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(d)}|${esc(staff?.id || '')}"><option value="">รอตรวจสอบ</option>${options.map(t => `<option value="${esc(t.code)}" ${current===t.code?'selected':''}>${esc(labelCode(t.code))}</option>`).join('')}</select>${hasOutingSafe(d) ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    }
    const text = cleanCodes.length ? cleanCodes.map(labelCode).join(' / ') : 'รอตรวจสอบ';
    return `<td class="matrix-cell ${cls}"><span title="${esc(text)}">${esc(text)}</span>${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
  }
  window.renderMonthPositionMatrix = renderMonthPositionMatrix = function renderMonthPositionMatrixV225(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) ? dates : [];
    if (!rows.length) return emptySafe('ยังไม่มีแผนรายเดือน กด “สร้างตารางที่ไม่มีตำแหน่ง” หรือ “สร้างแผนทั้งเดือน” ก่อน');
    const { by, assigned } = cellRowsByStaffDate(rows);
    const rowStaffIds = new Set(rows.map(r => safeStaffId(r?.staff_id)).filter(Boolean));
    const displayStaff = orderStaff((state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s) || rowStaffIds.has(safeStaffId(s.id)); }
      catch (_) { return rowStaffIds.has(safeStaffId(s.id)) || s?.is_active !== false; }
    }));
    const canEdit = (() => { try { return isAdmin() && state.page === 'positionMonth'; } catch (_) { return false; } })();
    const heads = dates.map(date => { const d = parseSafe(date); const cls = isHolidaySafe(date) ? 'holiday-head' : isWeekendSafe(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${esc(thDay(date))}</span></th>`; }).join('');
    const countRow = dates.map(date => countCell(date, assigned)).join('');
    const missingRow = dates.map(date => missingCell(date, assigned)).join('');
    return `<div class="monthly-matrix-wrap v225-position-matrix">
      <div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="hint">แผนรายเดือนเป็น “ตำแหน่งตั้งต้นรายสัปดาห์” และไม่หักวันลา อินชาร์จปรับคนจริงในหน้ารายวัน</span></div>
      <div class="table-wrap month-position-matrix v225-month-position-matrix"><table><thead>
        <tr><th class="sticky-col staff-col v225-staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col v225-summary-col">สรุป</th>${heads}</tr>
        <tr class="count-role-row"><th class="sticky-col staff-col v225-staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col v225-summary-col count-role-head">เหลือจริง/Slot</th>${countRow}</tr>
        <tr class="missing-role-row"><th class="sticky-col staff-col v225-staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col v225-summary-col missing-role-head">ตำแหน่ง</th>${missingRow}</tr>
      </thead><tbody>${displayStaff.map(st => { const bg = (() => { try { return staffColor(st); } catch (_) { return '#dbeafe'; } })(); const fg = (() => { try { return textColorFor(bg); } catch (_) { return '#0f172a'; } })(); return `<tr><td class="sticky-col staff-col v225-staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(staffName(st))}</b><small>${esc(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col v225-summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCellV225(st, date, by[`${st.id}|${date}`] || [], canEdit)).join('')}</tr>`; }).join('')}</tbody></table></div>
    </div>`;
  };

  function renderMonthPositionPageV225(){
    try { if (!isAdmin()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>'; } catch (_) {}
    const key = state.positionMonthKey || state.monthKey || today().slice(0,7);
    const dates = monthDates(key);
    const rows = rowsForMonthContext(key);
    const savedCount = (state.positions || []).filter(x => norm(x?.work_date).startsWith(key)).length;
    const workingDays = dates.filter(d => !isNoPosition(d)).length;
    const staffCount = staffForMonthlyTemplate().length;
    const setNo = bucketForCount(staffCount);
    return `<div class="card monthly-position-page v225-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3><p class="hint">สร้างแผนตั้งต้นแบบรายสัปดาห์: คนเดิมอยู่ตำแหน่งเดิมทั้งสัปดาห์ และสัปดาห์ถัดไปหมุนไปตำแหน่งใหม่ โดยไม่หักวันลา</p></div></div>
      <div class="v224-month-toolbar v225-month-toolbar">
        <label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label>
        <button class="ghost-btn" type="button" data-v225-create-blank-month>สร้างตารางตั้งต้นเปล่า</button>
        <button class="soft-btn" type="button" data-v225-generate-month-plan>สร้างแผนรายสัปดาห์ทั้งเดือน</button>
        <button class="primary-btn" type="button" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button>
        <button class="ghost-btn danger" type="button" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button>
        <button class="ghost-btn" type="button" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button>
        <button class="soft-btn" type="button" data-position-month-overview-v225>ดูภาพรวมจัดตำแหน่ง</button>
        <button class="soft-btn qc-rotation-btn" type="button" data-qc-rotation-v169>ติดตามการหมุนเวียน QC</button>
        <span class="v224-mini-badges">${badgeSafe(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black')} ${badgeSafe(`วันทำงาน ${workingDays} วัน`, 'blue')} ${badgeSafe(`ตั้งต้น ${staffCount} คน → ชุด ${setNo} Slot`, 'blue')}</span>
      </div>${window.renderMonthPositionMatrix(rows, dates)}</div>`;
  }
  try { window.renderPositionMonthPage = renderPositionMonthPage = renderMonthPositionPageV225; } catch (_) { window.renderPositionMonthPage = renderMonthPositionPageV225; }

  async function generateMonthV225(){
    try { if (!isAdmin()) return toast('เฉพาะ Admin เท่านั้น', 'error'); } catch (_) {}
    const input = document.getElementById('positionMonthInput');
    const key = String(input?.value || state.positionMonthKey || state.monthKey || today().slice(0,7)).slice(0,7);
    try { await window.cnmiV224?.loadDbConfigs?.(false); } catch (_) {}
    state.positionMonthKey = key;
    state.monthPositionDraft = buildWeeklyRotationPlan(key);
    renderPage();
    toast('สร้างแผนทั้งเดือนแบบหมุนรายสัปดาห์แล้ว ตรวจทานก่อนบันทึก/ประกาศ');
  }
  async function blankMonthV225(){
    try { if (!isAdmin()) return toast('เฉพาะ Admin เท่านั้น', 'error'); } catch (_) {}
    const input = document.getElementById('positionMonthInput');
    const key = String(input?.value || state.positionMonthKey || state.monthKey || today().slice(0,7)).slice(0,7);
    state.positionMonthKey = key;
    state.monthPositionDraft = blankMonthlyTemplate(key);
    renderPage();
    toast('สร้างตารางที่ไม่มีตำแหน่งแล้ว');
  }

  function dailySlotStore(){ try { return JSON.parse(localStorage.getItem(LS_DAILY_SLOT_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function setDailySlotSet(date, setNo){ const data = dailySlotStore(); data[norm(date)] = Number(setNo) || bucketForCount(workingStaffToday(date).length); try { localStorage.setItem(LS_DAILY_SLOT_KEY, JSON.stringify(data)); } catch (_) {} }
  function dailySlotSet(date){ const data = dailySlotStore(); return Number(data[norm(date)] || bucketForCount(workingStaffToday(date).length)); }
  function combineDailyRows(date){
    const d = norm(date);
    const planRows = (() => { try { return sortPositionRows((state.positions || []).filter(x => norm(x.work_date) === d)); } catch (_) { return (state.positions || []).filter(x => norm(x.work_date) === d); } })();
    const planByCode = new Map();
    planRows.forEach(r => { const c = baseCode(r.position_code || r.code || ''); if (c && !planByCode.has(c)) planByCode.set(c, r); });
    const setNo = dailySlotSet(d);
    const baseSlots = hasOutingSafe(d) ? [...daySlotsForDateByCount(d, setNo), ...outingSlots()] : daySlotsForCount(setNo);
    const rows = baseSlots.map(p => {
      const plan = planByCode.get(baseCode(p.code));
      return { ...p, code:p.code, position_code:p.code, staff_id:plan?.staff_id || null, _planned_staff_id:plan?.staff_id || null, _planned_code:p.code, _source:'slot' };
    });
    planRows.forEach(r => {
      const c = baseCode(r.position_code || r.code || '');
      if (!c || rows.some(x => baseCode(x.position_code || x.code) === c)) return;
      const tpl = allSlotTemplates().find(p => baseCode(p.code) === c) || r;
      rows.push({ ...tpl, ...r, code:c, position_code:c, _planned_staff_id:r.staff_id || null, _source:'extra-plan' });
    });
    return rows;
  }
  function staffOptionsDaily(row, selectedId, date){
    const d = norm(date);
    let list = workingStaffToday(d).filter(st => dailyEligible(st, row, d));
    const selected = selectedId ? (state.staff || []).find(s => safeStaffId(s.id) === safeStaffId(selectedId)) : null;
    if (selected && !list.some(s => safeStaffId(s.id) === safeStaffId(selected.id))) list.unshift(selected);
    list = orderStaff(list);
    return list.map(s => {
      let note = '';
      try { if (isActiveLeaveOn(s.id, d)) note = ' ⚠ ลาวันนี้'; } catch (_) {}
      return `<option value="${esc(s.id)}" ${safeStaffId(s.id)===safeStaffId(selectedId)?'selected':''}>${esc(staffName(s))}${esc(note)}</option>`;
    }).join('');
  }
  function leaveTextForStaff(staffId, date){
    try {
      const row = activeLeaveRecordOn(staffId, norm(date));
      if (!row) return '';
      if (typeof leaveDisplayType === 'function') return leaveDisplayType(row);
      return String(row.type || row.leave_type || 'ลา');
    } catch (_) { return ''; }
  }
  function renderDailySelect(row, idx, date, layout){
    const code = row.position_code || row.code || 'รอตรวจสอบ';
    const zone = zoneOf(row);
    const breakTime = row.break_time || '-';
    const rule = row.main_rule || '';
    const job = row.job_desc || '';
    return `<select class="v225-position-select" data-position-row="${esc(idx)}" data-position-code="${esc(code)}" data-position-zone="${esc(zone)}" data-position-break="${esc(breakTime)}" data-position-rule="${esc(rule)}" data-position-job="${esc(job)}" data-position-layout-item="${esc(layout || '')}"><option value="">เลือกคน/ว่าง</option>${staffOptionsDaily({ ...row, code, position_code:code, zone, break_time:breakTime, main_rule:rule, job_desc:job }, row.staff_id, date)}</select>`;
  }
  function renderDailyComparePanel(date, rows){
    const d = norm(date);
    const working = workingStaffToday(d);
    const planStaffIds = new Set((state.positions || []).filter(r => norm(r.work_date) === d && r.staff_id).map(r => safeStaffId(r.staff_id)));
    const planCount = planStaffIds.size;
    const slotCount = rows.filter(r => r._source !== 'extra-plan').length;
    const diff = working.length - slotCount;
    const missingStaff = Array.from(planStaffIds).filter(id => !working.some(st => safeStaffId(st.id) === id));
    const setNo = dailySlotSet(d);
    const setOptions = DAY_SETS.map(n => `<option value="${n}" ${n===setNo?'selected':''}>${n} Slot</option>`).join('');
    return `<div class="v225-daily-compare-panel">
      <div class="v225-compare-cards">
        <div><b>${working.length}</b><span>คนเหลือจริงวันนี้</span></div>
        <div><b>${planCount}</b><span>คนในแผนตั้งต้น</span></div>
        <div><b>${slotCount}</b><span>Slot วันนี้</span></div>
        <div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':(diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`)}</b><span>เทียบคนจริงกับ Slot</span></div>
      </div>
      <div class="v225-daily-slot-toolbar"><label>ชุด Slot วันนี้ <select data-v225-daily-slot-set="${esc(d)}">${setOptions}</select></label><span class="hint">ระบบเลือกจากคนเหลือจริงให้อัตโนมัติ แต่ปรับเป็น 8-14 Slot ได้</span></div>
      ${missingStaff.length ? `<div class="notice compact warn-notice">คนในแผนตั้งต้นที่ไม่อยู่วันนี้: ${missingStaff.map(id => staffPillSafe(id)).join(' ')}</div>` : ''}
    </div>`;
  }
  function renderPositionsPageV225(){
    try {
      const date = norm(state.positionDate || today());
      const canManage = canManagePositions(date);
      const key = date.slice(0,7);
      const incharge = currentInchargeForMonth(key);
      const dayStatus = (state.positionDayStatus || []).find(x => norm(x.work_date) === date);
      const isPublished = dayStatus?.status === 'published';
      const noPosition = isNoPosition(date);
      const rows = noPosition ? [] : combineDailyRows(date);
      window.__CNMI_V225_DAILY_POSITION_ROWS__ = rows;
      const rowHtml = rows.map((r,idx) => {
        const code = r.position_code || r.code || 'รอตรวจสอบ';
        const label = labelCode(code);
        const zone = zoneOf(r);
        const breakTime = r.break_time || '-';
        const rule = r.main_rule || '-';
        const job = r.job_desc || '-';
        const planned = r._planned_staff_id ? `${staffPillSafe(r._planned_staff_id)}${leaveTextForStaff(r._planned_staff_id, date) ? `<div class="cell-note">${esc(leaveTextForStaff(r._planned_staff_id, date))}</div>` : ''}` : '<span class="muted">-</span>';
        const select = canManage ? renderDailySelect(r, idx, date, 'desktop') : staffPillSafe(r.staff_id);
        const extra = r._source === 'extra-plan' ? badgeSafe('เกินจากชุด Slot วันนี้', 'orange') : '';
        return `<tr class="${r._source === 'extra-plan' ? 'v225-extra-plan-row' : ''}"><td>${esc(zone)}${extra}</td><td><b>${esc(label)}</b></td><td>${esc(breakTime)}</td><td class="v225-plan-cell">${planned}</td><td>${select}</td><td>${esc(rule)}</td><td><button class="tiny-btn" type="button" data-v225-position-detail="${esc(idx)}">ดู</button><span class="muted v225-job-short">${esc(String(job).slice(0,70))}${String(job).length>70?'…':''}</span></td></tr>`;
      }).join('');
      const cardHtml = rows.map((r,idx) => {
        const code = r.position_code || r.code || 'รอตรวจสอบ';
        const zone = zoneOf(r);
        const breakTime = r.break_time || '-';
        const rule = r.main_rule || '-';
        const select = canManage ? renderDailySelect(r, idx, date, 'mobile') : staffPillSafe(r.staff_id);
        const planned = r._planned_staff_id ? staffPillSafe(r._planned_staff_id) : '<span class="muted">-</span>';
        return `<div class="position-mobile-card v225-position-card ${r._source === 'extra-plan' ? 'v225-extra-plan-row' : ''}"><div class="section-title"><h3>${esc(labelCode(code))}</h3>${badgeSafe(zone || '-', zone === 'ออกหน่วย' ? 'red' : 'blue')}</div><div class="muted">พัก ${esc(breakTime)} • ${esc(rule)}</div><div><b>แผนตั้งต้น:</b> ${planned}</div><label>ปรับวันนี้ ${select}</label><div class="actions"><button class="tiny-btn" type="button" data-v225-position-detail="${esc(idx)}">ดูรายละเอียดหน้าที่</button></div></div>`;
      }).join('');
      const table = `<div class="table-wrap daily-position-table desktop-table v225-daily-position-table" data-position-layout="desktop"><table><thead><tr><th>โซน</th><th>Slot วันนี้</th><th>พัก</th><th>แผนตั้งต้น</th><th>ปรับวันนี้</th><th>เงื่อนไข</th><th>รายละเอียด</th></tr></thead><tbody>${rowHtml}</tbody></table></div><div class="mobile-position-list v225-mobile-position-list" data-position-layout="mobile">${cardHtml}</div>`;
      return `<div class="card v225-positions-page">
        <div class="toolbar v225-position-toolbar">
          <label>วันที่ <input type="date" id="positionDateInput" value="${esc(date)}"></label>
          ${isAdmin() ? `<label>อินชาร์จ <select id="inchargeSelect"><option value="">ไม่ระบุ</option>${staffOptions(incharge)}</select></label><button class="soft-btn" type="button" data-save-incharge>บันทึกอินชาร์จ</button>` : `<span>${badgeSafe('อินชาร์จ: ' + staffNick(incharge), 'blue')}</span>`}
          ${canManage && !noPosition ? '<button class="primary-btn" type="button" data-save-positions>บันทึกตำแหน่งวันนี้</button><button class="soft-btn" type="button" data-publish-positions>ประกาศให้ Staff เห็น</button>' : ''}
          ${isPublished ? '<span class="badge green">ประกาศแล้ว</span>' : '<span class="badge orange">ร่าง</span>'}
        </div>
        <div class="notice soft-notice compact v225-position-note"><b>วิธีใช้:</b> ซ้ายคือแผนตั้งต้นจากรายเดือน ขวาคือคนที่อินชาร์จปรับสำหรับวันนี้ หลังหักลา/ไม่รับเวรแล้วค่อยกดบันทึก</div>
        ${noPosition ? `<div class="notice">วันนี้เป็น${isHolidaySafe(date) ? 'วันหยุดราชการ' : 'วันเสาร์-อาทิตย์'} จึงไม่ต้องจัดตำแหน่งรายวัน</div>` : ''}
        ${!noPosition ? renderDailyComparePanel(date, rows) : ''}
        ${!noPosition && hasOutingSafe(date) ? '<div class="notice compact">วันนี้มีออกหน่วย สามารถปรับชุด Slot วันนี้และคนหน้างานได้จากตารางด้านล่าง</div>' : ''}
        ${noPosition ? emptySafe('ไม่มีตารางตำแหน่งกลางวัน รายวันสำหรับวันนี้') : table}
      </div>`;
    } catch (err) {
      console.error(`${VERSION}: renderPositionsPage failed`, err);
      return `<div class="notice error-notice">โหลดตารางตำแหน่งกลางวัน รายวันไม่สำเร็จ: ${esc(err?.message || err)}</div>`;
    }
  }
  try { window.renderPositionsPage = renderPositionsPage = renderPositionsPageV225; } catch (_) { window.renderPositionsPage = renderPositionsPageV225; }

  function currentMonthOverviewContext(){
    const key = state.page === 'positionMonthView' ? (state.positionMonthViewKey || state.monthKey) : (state.positionMonthKey || state.monthKey || today().slice(0,7));
    const rows = rowsForMonthContext(key);
    return { key, rows, dates:monthDates(key) };
  }
  function buildStats(rows, dates){
    const dateSet = new Set(dates || []);
    const stats = new Map();
    const ensure = sid => {
      if (!stats.has(sid)) stats.set(sid, { zones:Object.fromEntries(ROOM_COLUMNS.map(z => [z,0])), positions:{}, total:0 });
      return stats.get(sid);
    };
    (rows || []).forEach(r => {
      const d = norm(r.work_date);
      const sid = safeStaffId(r.staff_id);
      const code = baseCode(r.position_code || r.code || '');
      if (!sid || !d || (dateSet.size && !dateSet.has(d)) || !isRealCode(code) || isNoPosition(d)) return;
      const st = ensure(sid);
      const z = zoneOf(r);
      if (st.zones[z] == null) st.zones[z] = 0;
      st.zones[z] += 1;
      st.positions[code] = (st.positions[code] || 0) + 1;
      st.total += 1;
    });
    return stats;
  }
  function positionColumns(rows){
    const map = new Map();
    allSlotTemplates().forEach(p => { if (p?.code && isRealCode(p.code)) map.set(baseCode(p.code), labelCode(p.code)); });
    (rows || []).forEach(r => { const c = baseCode(r.position_code || r.code || ''); if (isRealCode(c) && !map.has(c)) map.set(c, labelCode(c)); });
    return Array.from(map.keys());
  }
  function numberCell(n){ const x = Number(n || 0); return `<td class="num-cell ${x?'has-count':'zero-count'}">${x || ''}</td>`; }
  function renderZoneSummaryTable(stats, staffList){
    const body = staffList.map(st => { const s = stats.get(safeStaffId(st.id)) || { zones:{}, total:0 }; return `<tr><th class="sticky-name-col">${staffPillSafe(st.id)}</th>${ROOM_COLUMNS.map(z => numberCell(s.zones?.[z] || 0)).join('')}<td class="num-cell total-cell">${s.total || ''}</td></tr>`; }).join('');
    return `<div class="table-wrap v225-overview-table"><table><thead><tr><th class="sticky-name-col">ชื่อเจ้าหน้าที่</th>${ROOM_COLUMNS.map(z => `<th>${esc(z)}</th>`).join('')}<th>รวม</th></tr></thead><tbody>${body || `<tr><td colspan="${ROOM_COLUMNS.length+2}">ยังไม่มีข้อมูล</td></tr>`}</tbody></table></div>`;
  }
  function renderPositionSummaryTable(stats, staffList, positionCols){
    const body = staffList.map(st => { const s = stats.get(safeStaffId(st.id)) || { positions:{} }; return `<tr><th class="sticky-name-col">${staffPillSafe(st.id)}</th>${positionCols.map(c => numberCell(s.positions?.[c] || 0)).join('')}</tr>`; }).join('');
    return `<div class="table-wrap v225-overview-table"><table><thead><tr><th class="sticky-name-col">ชื่อเจ้าหน้าที่</th>${positionCols.map(c => `<th>${esc(labelCode(c))}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${positionCols.length+1}">ยังไม่มีข้อมูล</td></tr>`}</tbody></table></div>`;
  }
  function renderPositionOverviewModalV225(){
    const { key, rows, dates } = currentMonthOverviewContext();
    const monthStats = buildStats(rows, dates);
    const staffIds = new Set((rows || []).map(r => safeStaffId(r.staff_id)).filter(Boolean));
    const staffList = orderStaff((state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s) || staffIds.has(safeStaffId(s.id)); }
      catch (_) { return staffIds.has(safeStaffId(s.id)) || s?.is_active !== false; }
    }));
    const fyStart = fiscalStart(`${key}-01`);
    const fyEnd = fiscalEnd(`${key}-01`);
    const fyRows = [
      ...(state.positions || []).filter(r => { const d = norm(r.work_date); return d >= fyStart && d <= fyEnd && !norm(r.work_date).startsWith(key); }),
      ...(rows || [])
    ];
    const fyDates = [];
    for (let d = fyStart; d <= fyEnd; d = addDays(d, 1)) fyDates.push(d);
    const fyStats = buildStats(fyRows, fyDates);
    const monthPositionCols = positionColumns(rows);
    const fyPositionCols = positionColumns(fyRows);
    const totalAssigned = Array.from(monthStats.values()).reduce((sum, s) => sum + (s.total || 0), 0);
    const html = `<div class="v225-overview-modal">
      <div class="section-title"><div><h2>ภาพรวมจัดตำแหน่ง ${esc(key)}</h2><p class="hint">แยกเป็นแท็บเพื่อลดความแน่นของตาราง รายเดือนนับจากร่าง/ข้อมูลที่เห็นอยู่ ส่วนรายบุคคลสะสมตามปีงบประมาณ ${esc(fyStart)} ถึง ${esc(fyEnd)}</p></div>${badgeSafe(`รวม ${totalAssigned} ตำแหน่ง`, totalAssigned ? 'blue' : 'black')}</div>
      <div class="v225-tabbar"><button type="button" class="active" data-v225-overview-tab-btn="zone">สรุปแยกตามห้อง/โซน</button><button type="button" data-v225-overview-tab-btn="position">สรุปแยกตามตำแหน่ง รายบุคคล สะสมปีงบประมาณ</button></div>
      <section class="v225-overview-tab active" data-v225-overview-tab="zone"><div class="card-lite overview-block"><h4>สรุปรายเดือนตามห้อง/โซน</h4>${renderZoneSummaryTable(monthStats, staffList)}</div><div class="card-lite overview-block"><h4>สรุปรายเดือนตามตำแหน่ง</h4>${renderPositionSummaryTable(monthStats, staffList, monthPositionCols)}</div></section>
      <section class="v225-overview-tab" data-v225-overview-tab="position"><div class="card-lite overview-block"><h4>สะสมปีงบประมาณตามห้อง/โซน</h4>${renderZoneSummaryTable(fyStats, staffList)}</div><div class="card-lite overview-block"><h4>สะสมปีงบประมาณตามตำแหน่งรายบุคคล</h4>${renderPositionSummaryTable(fyStats, staffList, fyPositionCols)}</div></section>
    </div>`;
    showModal(html, { large:true });
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = renderPage = function renderPageV225(){
    if (state?.page === 'positionMonth') {
      try { if (typeof renderNav === 'function') renderNav(); } catch (_) {}
      try {
        const item = (window.NAV_ITEMS || NAV_ITEMS || []).find(x => x.id === 'positionMonth') || {};
        const title = document.getElementById('pageTitle'); const sub = document.getElementById('pageSubtitle');
        if (title) title.textContent = item.title || 'จัดตำแหน่งรายเดือน';
        if (sub) sub.textContent = item.subtitle || 'Admin วางแผนรายเดือนก่อนให้อินชาร์จปรับรายวัน';
      } catch (_) {}
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = window.renderPositionMonthPage();
      return;
    }
    if (state?.page === 'positions') {
      try { if (typeof renderNav === 'function') renderNav(); } catch (_) {}
      try {
        const item = (window.NAV_ITEMS || NAV_ITEMS || []).find(x => x.id === 'positions') || {};
        const title = document.getElementById('pageTitle'); const sub = document.getElementById('pageSubtitle');
        if (title) title.textContent = item.title || 'ตารางตำแหน่งกลางวัน รายวัน';
        if (sub) sub.textContent = item.subtitle || 'ดู/ปรับตำแหน่งประจำวันก่อนเริ่มงาน';
      } catch (_) {}
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = window.renderPositionsPage();
      return;
    }
    return previousRenderPage ? previousRenderPage.apply(this, arguments) : undefined;
  };

  document.addEventListener('click', function(e){
    const gen = e.target?.closest?.('[data-v225-generate-month-plan],[data-v224-generate-month-plan],[data-v223-generate-month-plan],[data-generate-month-positions]');
    if (gen) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); generateMonthV225(); return; }
    const blank = e.target?.closest?.('[data-v225-create-blank-month],[data-v224-create-blank-month],[data-v223-create-blank-month],[data-create-blank-month-positions]');
    if (blank) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); blankMonthV225(); return; }
    const overview = e.target?.closest?.('[data-position-month-overview-v225],[data-position-month-overview-v169]');
    if (overview && state?.page === 'positionMonth') { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); renderPositionOverviewModalV225(); return; }
    const detail = e.target?.closest?.('[data-v225-position-detail]');
    if (detail) {
      e.preventDefault(); e.stopPropagation();
      const idx = Number(detail.getAttribute('data-v225-position-detail'));
      const row = window.__CNMI_V225_DAILY_POSITION_ROWS__?.[idx];
      if (row) showModal(`<h2>${esc(labelCode(row.position_code || row.code))}</h2><p class="hint">${esc(zoneOf(row))} • พัก ${esc(row.break_time || '-')} • ${esc(row.main_rule || '-')}</p><div class="notice soft-notice">${esc(row.job_desc || '-')}</div>`, { large:false });
      return;
    }
  }, true);

  document.addEventListener('change', function(e){
    const slot = e.target?.closest?.('[data-v225-daily-slot-set]');
    if (slot) {
      const date = slot.getAttribute('data-v225-daily-slot-set') || state.positionDate || today();
      setDailySlotSet(date, Number(slot.value) || 10);
      renderPage();
      return;
    }
  }, true);

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-v225-overview-tab-btn]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const tab = btn.getAttribute('data-v225-overview-tab-btn');
    document.querySelectorAll('[data-v225-overview-tab-btn]').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('[data-v225-overview-tab]').forEach(sec => sec.classList.toggle('active', sec.getAttribute('data-v225-overview-tab') === tab));
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v225-monthly-position-page .month-position-summary-hint,.v225-monthly-position-page .matrix-legend .legend-box.leave{display:none!important}
    .v225-month-position-matrix{overflow:auto;max-width:100%;position:relative}.v225-month-position-matrix table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%}
    .v225-month-position-matrix .v225-staff-col{position:sticky!important;left:0!important;min-width:148px;max-width:148px;z-index:74!important;box-shadow:8px 0 18px rgba(15,35,52,.10)}
    .v225-month-position-matrix .v225-summary-col{position:sticky!important;left:148px!important;min-width:92px;max-width:92px;z-index:73!important;box-shadow:8px 0 18px rgba(15,35,52,.08)}
    .v225-month-position-matrix thead .v225-staff-col,.v225-month-position-matrix thead .v225-summary-col{z-index:92!important;background:#f6f9fc!important;top:0}
    .v225-month-position-matrix .count-role-row th,.v225-month-position-matrix .missing-role-row th{font-size:12px;line-height:1.25}.v225-month-position-matrix .count-role-cell b{font-size:13px}.v225-month-position-matrix .count-role-cell small{display:block;color:#64748b}.v225-month-position-matrix .has-missing{background:#fff7ed!important;color:#9a3412}.v225-month-position-matrix .has-extra{background:#eff6ff!important;color:#1d4ed8}.v225-month-position-matrix .complete{background:#ecfdf5!important;color:#047857}
    .v225-daily-compare-panel{border:1px solid #dbeafe;background:#f8fbff;border-radius:18px;padding:12px;margin:10px 0}.v225-compare-cards{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px}.v225-compare-cards>div{background:#fff;border:1px solid #e5eef8;border-radius:16px;padding:10px}.v225-compare-cards b{display:block;font-size:22px;color:#0f3b57}.v225-compare-cards span{font-size:12px;color:#64748b}.v225-compare-cards .warn{background:#fff7ed}.v225-compare-cards .ok{background:#ecfdf5}.v225-compare-cards .info{background:#eff6ff}.v225-daily-slot-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}.v225-daily-slot-toolbar label{min-width:180px}.v225-daily-position-table th,.v225-daily-position-table td{vertical-align:middle}.v225-plan-cell .cell-note{margin-top:3px;color:#b45309}.v225-extra-plan-row td{background:#fff7ed!important}.v225-job-short{display:block;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .v225-overview-modal .v225-tabbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v225-overview-modal .v225-tabbar button{border:1px solid #dbeafe;background:#fff;border-radius:999px;padding:8px 12px;font-weight:700;color:#23516f}.v225-overview-modal .v225-tabbar button.active{background:#7cc7ff;color:#08344f;border-color:#7cc7ff}.v225-overview-tab{display:none}.v225-overview-tab.active{display:block}.v225-overview-table{overflow:auto;max-height:58vh}.v225-overview-table table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%}.v225-overview-table .sticky-name-col{position:sticky;left:0;z-index:60;background:#fff;box-shadow:8px 0 18px rgba(15,35,52,.10)}.v225-overview-table thead .sticky-name-col{z-index:80;background:#f6f9fc}.v225-overview-table .num-cell{text-align:center}.v225-overview-table .has-count{background:#f0f9ff;font-weight:700}.v225-overview-table .zero-count{color:#cbd5e1}.v225-overview-table .total-cell{background:#e0f2fe;font-weight:800}
    @media(max-width:760px){.v225-compare-cards{grid-template-columns:repeat(2,minmax(120px,1fr))}.v225-month-position-matrix .v225-staff-col{min-width:118px;max-width:118px}.v225-month-position-matrix .v225-summary-col{left:118px!important;min-width:74px;max-width:74px}.v225-daily-slot-toolbar>*{width:100%}}
  `;
  document.head.appendChild(style);

  window.cnmiV225 = { buildWeeklyRotationPlan, renderPositionsPageV225, renderPositionOverviewModalV225, staffForMonthlyTemplate, daySlotsForCount };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v225-weekly-rotation-position-plan.js", error); }
;

/* Original source: patch-v227-manual-as-blood-bank-zone.js */
try {
/* =========================
   V227 Outing Template + Compact Month Position + Manual-as-Blood-Bank
   V308: Separate total staff present from staff counted toward Slot (trainee/Intern excluded).
   - Outing-date template can contain Outing / Blood Bank / Donor Room slots; Manual is counted/displayed as Blood Bank.
   - Outing days use the outing-date template only, not weekly rotation.
   - Outing slots are assigned from activity participants; non-outing slots are assigned from staff not joining the outing.
   - Monthly matrix rows are more compact and the summary sticky column has a solid white background.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V227_MANUAL_AS_BLOOD_BANK_ZONE';
  if (window.__CNMI_V227_MANUAL_AS_BLOOD_BANK_ZONE__) return;
  window.__CNMI_V227_MANUAL_AS_BLOOD_BANK_ZONE__ = true;

  const CFG_PREFIX = '__CNMI_SLOT_TEMPLATE_V224__';
  const LS_KEY = 'cnmi_slot_template_v224_cache';
  const DAY_SETS = [8,9,10,11,12,13,14];
  const ZONES = ['Blood Bank','Donor Room','ออกหน่วย'];
  const ROOM_COLUMNS = ['Blood Bank','Donor Room','ออกหน่วย'];
  const oldV224 = window.cnmiV224 ? { ...window.cnmiV224 } : {};

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function norm(v){ try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } }
  function pad2(n){ try { return pad(n); } catch (_) { return String(n).padStart(2,'0'); } }
  function today(){ try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } }
  function toast(msg, tone){ try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } }
  function friendly(err){ try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } }
  function admin(){ try { return isAdmin(); } catch (_) { return false; } }
  function sid(){ try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } }
  function safeStaffId(v){ return String(v == null ? '' : v).trim(); }
  function staffName(st){ return st ? (st.nickname || st.full_name || st.email || '-') : '-'; }
  function badgeSafe(text, tone){ try { return badge(text, tone); } catch (_) { return `<span class="badge ${esc(tone || 'blue')}">${esc(text)}</span>`; } }
  function emptySafe(text){ try { return empty(text); } catch (_) { return `<div class="empty-state">${esc(text)}</div>`; } }
  function staffPillSafe(id){ try { return id ? staffPill(id) : '<span class="muted">-</span>'; } catch (_) { return id ? esc(id) : '<span class="muted">-</span>'; } }
  function parseSafe(date){ try { return parseDate(norm(date)); } catch (_) { const [y,m,d] = norm(date).split('-').map(Number); return new Date(y || 2000, (m || 1) - 1, d || 1); } }
  function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function addDays(date, days){ const d = parseSafe(date); d.setDate(d.getDate() + Number(days || 0)); return dateKey(d); }
  function thDay(date){ try { return parseSafe(date).toLocaleDateString('th-TH', { weekday:'short' }); } catch (_) { return ''; } }
  function isWeekendSafe(date){ try { return isWeekend(norm(date)); } catch (_) { const d = parseSafe(date).getDay(); return d === 0 || d === 6; } }
  function isHolidaySafe(date){ try { return isHolidayDate(norm(date)); } catch (_) { return false; } }
  function isNoPosition(date){ try { return isNoPositionDay(norm(date)); } catch (_) { return isWeekendSafe(date) || isHolidaySafe(date); } }
  function hasOutingSafe(date){ try { return !!hasOuting(norm(date)); } catch (_) { return false; } }
  function outingIdSet(date){ try { return new Set((outingParticipants(norm(date)) || []).map(x => String(x))); } catch (_) { return new Set(); } }
  function compareStaffSafe(a,b){ try { return compareStaffOrder(a,b); } catch (_) { return String(staffName(a)).localeCompare(String(staffName(b)), 'th'); } }
  function orderStaff(rows){ try { return orderedStaff(rows || []); } catch (_) { return (rows || []).slice().sort(compareStaffSafe); } }
  function monthRange(key){
    try { const r = getMonthRange(key); return { y:r.y, m:r.m, last:r.last || new Date(r.y, r.m, 0).getDate(), start:r.start || `${r.y}-${pad2(r.m)}-01`, end:r.end || `${r.y}-${pad2(r.m)}-${pad2(r.last || new Date(r.y, r.m, 0).getDate())}` }; }
    catch (_) { const [yy,mm] = String(key || today().slice(0,7)).split('-').map(Number); const y = yy || new Date().getFullYear(); const m = mm || new Date().getMonth()+1; const last = new Date(y, m, 0).getDate(); return { y, m, last, start:`${y}-${pad2(m)}-01`, end:`${y}-${pad2(m)}-${pad2(last)}` }; }
  }
  function monthDates(key){ const r = monthRange(key); return Array.from({ length:r.last }, (_,i) => `${r.y}-${pad2(r.m)}-${pad2(i+1)}`); }
  function weekKey(date){ const d = parseSafe(date); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return dateKey(d); }
  function fiscalStart(date){ const d = parseSafe(date); const y = d.getFullYear(); return `${d.getMonth() >= 9 ? y : y - 1}-10-01`; }
  function fiscalEnd(date){ const y = Number(fiscalStart(date).slice(0,4)) + 1; return `${y}-09-30`; }
  function weekIndexFromFiscal(date){ const fs = parseSafe(fiscalStart(date)); const d = parseSafe(date); return Math.max(0, Math.floor((d.getTime() - fs.getTime()) / 86400000 / 7)); }
  function cfgKey(kind, n){ return kind === 'outing' ? `${CFG_PREFIX}:OUTING` : `${CFG_PREFIX}:DAY:${Number(n)}`; }
  function safeJson(v){ try { return JSON.parse(String(v || '')); } catch (_) { return null; } }
  function readLocal(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function writeLocal(configs){ try { localStorage.setItem(LS_KEY, JSON.stringify(configs || {})); } catch (_) {} }
  function clone(x){ try { return JSON.parse(JSON.stringify(x || null)); } catch (_) { return x; } }
  function stateSlot(){ if (!state.slotTemplateV224) state.slotTemplateV224 = { kind:'day', setNo:14, configs:null, loaded:false, loading:false }; return state.slotTemplateV224; }
  function displayZone(z, code=''){ const raw = String(z || '').trim(); const c = String(code || '').trim(); if (raw === 'ออกหน่วย') return 'ออกหน่วย'; if (raw === 'Manual' || /^BB-Manual/i.test(c) || /manual/i.test(c)) return 'Blood Bank'; if (raw === 'Donor Room' || /^DR-/i.test(c)) return 'Donor Room'; if (raw === 'Blood Bank' || /^BB-/i.test(c)) return 'Blood Bank'; return raw || 'Blood Bank'; }

  function fallbackOuting(){
    const base = [
      { code:'DR-Registration', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'ลงทะเบียน, คัดกรองความดัน ชีพจร อุณหภูมิ', sort_order:1 },
      { code:'DR-Preparation', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'มัส', job_desc:'เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน', sort_order:2 },
      { code:'DR-Finger 1', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด', sort_order:3 },
      { code:'DR-Finger 2', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด', sort_order:4 },
      { code:'DR-Main 1', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'เจาะเลือดตัวหลัก กลับมาปั่นเลือด', sort_order:5 },
      { code:'DR-Main', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'เจาะเลือดตัวหลัก กลับมาปั่นเลือด', sort_order:6 },
      { code:'DR-Support', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'แก๊ส / เฟื่อง', job_desc:'เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย', sort_order:7 }
    ];
    return sanitizeRows(base, 'outing');
  }
  function sanitizeRows(rows, kind){
    const isOutSet = kind === 'outing';
    return (Array.isArray(rows) ? rows : []).map((r, i) => {
      const code = String(r?.code || r?.position_code || '').trim();
      if (!code) return null;
      const rawZone = String(r?.zone || '').trim();
      const zone = isOutSet && rawZone === 'ออกหน่วย' ? 'ออกหน่วย' : displayZone(rawZone, code);
      const isOutingZone = zone === 'ออกหน่วย';
      return {
        ...r,
        code,
        position_code:code,
        zone,
        break_time:String(r?.break_time || '').trim() || (isOutingZone ? 'ออกหน่วย' : '-'),
        main_rule:String(r?.main_rule || '').trim() || '',
        job_desc:String(r?.job_desc || r?.detail || '').trim() || '',
        sort_order:Number(r?.sort_order || r?.order || (i + 1)) || (i + 1),
        eligibility_code:String(r?.eligibility_code || '').trim() || (isOutingZone ? `OUTING:${code}` : code),
        is_outing:isOutSet || r?.is_outing === true,
        is_active:r?.is_active === false ? false : true
      };
    }).filter(Boolean).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }
  function baseConfigs(){
    const out = { day:{}, outing:[] };
    let old = null;
    try { old = oldV224.currentConfigs?.(); } catch (_) {}
    DAY_SETS.forEach(n => {
      const rows = old?.day?.[n] || old?.day?.[String(n)] || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218?.[n] || [];
      out.day[n] = sanitizeRows(clone(rows) || [], 'day');
    });
    let outing = old?.outing || [];
    if (!outing.length) outing = fallbackOuting();
    out.outing = sanitizeRows(clone(outing) || [], 'outing');
    return out;
  }
  function mergeConfigs(base, extra){
    const out = clone(base || baseConfigs()) || { day:{}, outing:[] };
    if (extra?.day) DAY_SETS.forEach(n => { if (Array.isArray(extra.day[n]) || Array.isArray(extra.day[String(n)])) out.day[n] = sanitizeRows(extra.day[n] || extra.day[String(n)], 'day'); });
    if (Array.isArray(extra?.outing)) out.outing = sanitizeRows(extra.outing, 'outing');
    return out;
  }
  function currentConfigs226(){
    const st = stateSlot();
    if (st.configs) return st.configs;
    st.configs = mergeConfigs(baseConfigs(), readLocal());
    return st.configs;
  }
  async function loadConfigs226(force=false){
    const st = stateSlot();
    if (st.loading) return currentConfigs226();
    if (st.loaded && !force) return currentConfigs226();
    st.loading = true;
    let configs = mergeConfigs(baseConfigs(), readLocal());
    try {
      if (typeof sb !== 'undefined' && sb) {
        const res = await sb.from('daily_position_masters').select('code,job_desc').like('code', `${CFG_PREFIX}:%`);
        if (res.error) throw res.error;
        const db = {};
        (res.data || []).forEach(row => {
          const parsed = safeJson(row.job_desc);
          if (!Array.isArray(parsed)) return;
          const code = String(row.code || '');
          if (code.endsWith(':OUTING')) db.outing = sanitizeRows(parsed, 'outing');
          const m = code.match(/:DAY:(\d+)$/);
          if (m) { db.day = db.day || {}; db.day[Number(m[1])] = sanitizeRows(parsed, 'day'); }
        });
        configs = mergeConfigs(configs, db);
      }
    } catch (err) { console.warn(`${VERSION}: load config skipped`, err); }
    finally {
      st.configs = configs;
      st.loaded = true;
      st.loading = false;
      writeLocal(configs);
      applyConfigs226();
    }
    return configs;
  }
  function applyConfigs226(){
    const cfg = currentConfigs226();
    try {
      const target = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS;
      if (target) DAY_SETS.forEach(n => { target[n] = sanitizeRows(cfg.day[n] || [], 'day'); });
      if (window.cnmiDayPositionSlotsV218) {
        window.cnmiDayPositionSlotsV218.DAY_POSITION_SLOT_SETS_218 = target;
        window.cnmiDayPositionSlotsV218.outingSlotsV226 = () => outingTemplateSlots();
      }
    } catch (err) { console.warn(`${VERSION}: apply config failed`, err); }
  }
  async function saveConfigRows226(kinds){
    if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
    const cfg = currentConfigs226();
    const entries = [];
    if (!kinds || kinds.includes('day')) DAY_SETS.forEach(n => entries.push({ key:cfgKey('day', n), rows:sanitizeRows(cfg.day[n] || [], 'day') }));
    if (!kinds || kinds.includes('outing')) entries.push({ key:cfgKey('outing'), rows:sanitizeRows(cfg.outing || [], 'outing') });
    for (const ent of entries) {
      const payload = { code:ent.key, eligibility_code:null, zone:'SYSTEM', break_time:'-', main_rule:'SLOT_TEMPLATE_CONFIG', job_desc:JSON.stringify(ent.rows || []), is_outing:false, is_active:false, sort_order:99000, deleted_at:null, updated_by:sid() };
      const res = await sb.from('daily_position_masters').upsert(payload, { onConflict:'code,is_outing' });
      if (res.error) throw res.error;
    }
  }

  // Replace V224 exposed config helpers so V225/V226 read outing zones exactly as Admin configured.
  window.cnmiV224 = window.cnmiV224 || {};
  window.cnmiV224.currentConfigs = currentConfigs226;
  window.cnmiV224.loadDbConfigs = loadConfigs226;
  window.cnmiV224.applyConfigsToRuntime = applyConfigs226;

  function selectedKind(){ return stateSlot().kind || 'day'; }
  function selectedSet(){ return Number(stateSlot().setNo || 10); }
  function selectedRows(){ const cfg = currentConfigs226(); return selectedKind() === 'outing' ? (cfg.outing || []) : (cfg.day[selectedSet()] || []); }
  function setSelectedRows(rows){
    const cfg = currentConfigs226();
    if (selectedKind() === 'outing') cfg.outing = sanitizeRows(rows, 'outing');
    else cfg.day[selectedSet()] = sanitizeRows(rows, 'day');
    stateSlot().configs = cfg;
    writeLocal(cfg);
    applyConfigs226();
  }
  function reindex(rows){ return (rows || []).map((r,i) => ({ ...r, sort_order:i + 1 })); }

  function slotManagerHtml226(){
    const kind = selectedKind();
    const rows = selectedRows();
    const kindOptions = `<option value="day" ${kind==='day'?'selected':''}>วันทำงานปกติ 8-14 คน</option><option value="outing" ${kind==='outing'?'selected':''}>วันที่ออกหน่วย</option>`;
    const setOptions = DAY_SETS.map(n => `<option value="${n}" ${selectedSet()===n?'selected':''}>${n} คน</option>`).join('');
    const tableRows = rows.map((r,i) => `<tr>
      <td>${i+1}</td><td><b>${esc(r.code)}</b><br><span class="muted">${esc(r.eligibility_code || '')}</span></td><td>${esc(r.zone || '')}</td><td>${esc(r.main_rule || '')}</td><td>${esc(r.break_time || '')}</td><td class="v224-desc-cell">${esc(r.job_desc || '')}</td>
      <td class="v224-actions-cell"><button class="tiny-btn" type="button" data-v226-edit-slot="${i}">แก้ไข</button><button class="tiny-btn" type="button" data-v226-copy-slot="${i}">คัดลอก</button><button class="tiny-btn" type="button" data-v226-move-slot="${i}:-1" ${i===0?'disabled':''}>↑</button><button class="tiny-btn" type="button" data-v226-move-slot="${i}:1" ${i===rows.length-1?'disabled':''}>↓</button><button class="tiny-btn danger" type="button" data-v226-delete-slot="${i}">ลบ</button></td>
    </tr>`).join('');
    return `<div class="position-template-page v224-position-template-page v226-position-template-page">
      <div class="card wide-card v224-slot-crud-card"><div class="section-title"><div><h3>ชุด Slot ตำแหน่งกลางวัน</h3><p class="hint">จัดการ Slot ผ่านหน้าเว็บได้เลย: เพิ่ม / แก้ไข / ลบ / เรียงลำดับ แล้วบันทึกเป็นต้นทางเดียวของตารางรายวันและรายเดือน</p></div><div class="actions"><button class="ghost-btn" type="button" data-v226-refresh-config>รีเฟรชจากฐานข้อมูลล่าสุด</button><button class="primary-btn" type="button" data-v226-save-all>บันทึกทั้งหมดเป็นฐานตำแหน่งปัจจุบัน</button></div></div>
        <div class="v224-template-toolbar"><label>ประเภทวัน <select id="slotTemplateKindV226" data-v226-kind>${kindOptions}</select></label><label class="${kind==='outing'?'hidden':''}">จำนวนคน <select id="slotTemplateSetV226" data-v226-set>${setOptions}</select></label><button type="button" class="soft-btn" data-v226-add-slot>เพิ่ม Slot</button><button type="button" class="primary-btn" data-v226-save-current>บันทึกชุดนี้</button>${kind==='outing'?'<span class="badge orange">วันออกหน่วยใช้ชุดนี้เท่านั้น ไม่อิงรายสัปดาห์</span>':''}</div>
        ${kind==='outing'?'<div class="notice soft-notice compact"><b>วันที่ออกหน่วย:</b> สามารถเพิ่ม Slot โซน Blood Bank / Donor Room รวมในชุดนี้ได้เลย โดยงาน Manual ให้นับรวมเป็น Blood Bank ระบบจะจัดคนที่ติ๊กเข้าร่วมกิจกรรมลง Slot ออกหน่วย และจัดคนที่ไม่ได้ออกหน่วยลง Slot ห้องตามที่เพิ่มไว้</div>':''}
        <div class="section-title compact"><h4>ชุด Slot ${kind==='outing'?'วันที่ออกหน่วย':`${selectedSet()} คน`} • ${rows.length} Slot</h4></div>
        <div class="table-wrap compact-table v224-slot-table"><table><thead><tr><th>#</th><th>ตำแหน่ง</th><th>โซน</th><th>ผู้ปฏิบัติหลัก</th><th>เวลาพัก</th><th>รายละเอียดหน้าที่</th><th>จัดการ</th></tr></thead><tbody>${tableRows || `<tr><td colspan="7" class="muted">ยังไม่มี Slot ในชุดนี้ กด “เพิ่ม Slot” ได้เลย</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  }
  function renderPositionManagement226(){
    const root = document.getElementById('pageContent');
    if (!root || state?.page !== 'positionManagement') return;
    root.innerHTML = slotManagerHtml226();
  }
  function openSlotModal226(idx=null, copy=false){
    const rows = selectedRows();
    const editing = idx == null ? null : rows[Number(idx)];
    const isOut = selectedKind() === 'outing';
    const row = editing ? { ...editing, zone:displayZone(editing.zone, editing.code) } : { code:'', zone:isOut?'ออกหน่วย':'Blood Bank', break_time:isOut?'ออกหน่วย':'12:00', main_rule:'', job_desc:'', eligibility_code:'' };
    if (copy && row.code) row.code = `${row.code} copy`;
    const zoneOptions = ZONES.map(z => `<option value="${esc(z)}" ${row.zone===z?'selected':''}>${esc(z)}</option>`).join('');
    showModal(`<div class="v226-slot-modal"><h2>${editing && !copy ? 'แก้ไข Slot' : 'เพิ่ม Slot'}</h2><p class="hint">${isOut?'วันที่ออกหน่วย: เลือกโซนได้ทั้ง ออกหน่วย / Blood Bank / Donor Room โดย Manual ให้นับรวมเป็น Blood Bank':`${selectedSet()} คน`}</p>
      <form id="slotTemplateFormV226" class="form-grid compact-form" action="javascript:void(0)">
        <input type="hidden" name="idx" value="${idx == null || copy ? '' : esc(idx)}">
        <label>Code ตำแหน่ง <input name="code" value="${esc(row.code || '')}" required placeholder="เช่น BB-Report 1"></label>
        <label>โซน <select name="zone">${zoneOptions}</select></label>
        <label>ผู้ปฏิบัติหลัก <input name="main_rule" value="${esc(row.main_rule || '')}" required placeholder="เช่น MT เท่านั้น / Clerk หรือ แตง"></label>
        <label>เวลาพัก <input name="break_time" value="${esc(row.break_time || '')}" required placeholder="11:00 / 12:00 / ออกหน่วย"></label>
        <label class="wide">รายละเอียดหน้าที่ <textarea name="job_desc" rows="5" required>${esc(row.job_desc || '')}</textarea></label>
        <label class="wide">Eligibility Code <input name="eligibility_code" value="${esc(row.eligibility_code || '')}" placeholder="ปล่อยว่างได้: โซนออกหน่วยใช้ OUTING:Code / โซน BB ใช้ Code ปกติ"></label>
        <div class="actions wide modal-form-actions"><button type="button" class="ghost-btn" onclick="closeModal()">ยกเลิก</button><button type="button" class="primary-btn" data-v226-save-slot-modal>บันทึก Slot</button></div>
      </form></div>`, { large:true });
  }
  function saveSlotModal226(form){
    const fd = new FormData(form);
    const idxRaw = String(fd.get('idx') || '').trim();
    const idx = idxRaw === '' ? null : Number(idxRaw);
    const code = String(fd.get('code') || '').trim();
    const rawZone = String(fd.get('zone') || '').trim() || (selectedKind()==='outing' ? 'ออกหน่วย' : 'Blood Bank');
    const zone = displayZone(rawZone, code);
    const isOutingZone = zone === 'ออกหน่วย';
    const row = { code, zone, main_rule:String(fd.get('main_rule') || '').trim(), break_time:String(fd.get('break_time') || '').trim() || (isOutingZone ? 'ออกหน่วย' : '-'), job_desc:String(fd.get('job_desc') || '').trim(), eligibility_code:String(fd.get('eligibility_code') || '').trim() || (isOutingZone ? `OUTING:${code}` : code), is_outing:selectedKind()==='outing', is_active:true };
    if (!row.code || !row.main_rule || !row.job_desc) return toast('กรุณากรอก Code, ผู้ปฏิบัติหลัก และรายละเอียดหน้าที่ให้ครบ', 'error');
    const rows = selectedRows().slice();
    const dup = rows.some((r,i) => String(r.code || '').trim() === row.code && i !== idx);
    if (dup) return toast('Code นี้มีอยู่ในชุดนี้แล้ว ถ้าต้องการตำแหน่งซ้ำให้ใส่เลขต่อท้าย เช่น DR-Main 1 / DR-Main 2', 'error');
    if (idx == null || !rows[idx]) rows.push({ ...row, sort_order:rows.length + 1 });
    else rows[idx] = { ...rows[idx], ...row };
    setSelectedRows(reindex(rows));
    try { closeModal(); } catch (_) {}
    renderPositionManagement226();
    toast('แก้ไข Slot แล้ว อย่าลืมกด “บันทึกชุดนี้” หรือ “บันทึกทั้งหมดเป็นฐานตำแหน่ง”');
  }
  async function saveCurrent226(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกชุด Slot'); } catch (_) {}
    try { await saveConfigRows226([selectedKind()==='outing' ? 'outing' : 'day']); writeLocal(currentConfigs226()); applyConfigs226(); toast('บันทึกชุด Slot แล้ว'); }
    catch (err) { console.error(`${VERSION}: save current failed`, err); toast('บันทึกชุด Slot ไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  function isConfigRow(row){ return String(row?.code || '').startsWith(`${CFG_PREFIX}:`); }
  function isOutingMaster(row){ return row?.is_outing === true || String(row?.eligibility_code || '').startsWith('OUTING:'); }
  function uniqueDayRows(){
    const map = new Map(); const cfg = currentConfigs226();
    DAY_SETS.forEach(n => (cfg.day[n] || []).forEach(r => { const code = String(r.code || '').trim(); if (code && !map.has(code)) map.set(code, { ...r, is_outing:false }); }));
    return Array.from(map.values());
  }
  async function saveAll226(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const ok = await (typeof confirmDialog === 'function' ? confirmDialog('บันทึกชุด Slot ทั้งหมดเป็นต้นทาง และอัปเดตฐานตำแหน่งที่ระบบใช้จริง?', 'ยืนยันบันทึก Slot') : Promise.resolve(window.confirm('บันทึกชุด Slot ทั้งหมด?')));
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึก Slot ทั้งหมด'); } catch (_) {}
    try {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const cfg = currentConfigs226();
      await saveConfigRows226();
      const dayRows = uniqueDayRows();
      const outingRows = sanitizeRows(cfg.outing || [], 'outing');
      const dayCodes = new Set(dayRows.map(r => r.code));
      const outingCodes = new Set(outingRows.map(r => r.code));
      const existingRes = await sb.from('daily_position_masters').select('*');
      if (existingRes.error) throw existingRes.error;
      const existing = existingRes.data || [];
      for (const row of existing) {
        if (isConfigRow(row)) continue;
        const code = String(row?.code || '').trim();
        if (!code) continue;
        if (isOutingMaster(row)) {
          if (!outingCodes.has(code) && row.is_active !== false) {
            const res = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
            if (res.error) throw res.error;
          }
        } else if (!dayCodes.has(code) && row.is_active !== false) {
          const res = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
          if (res.error) throw res.error;
        }
      }
      const payloads = [
        ...dayRows.map((r,i) => ({ code:r.code, eligibility_code:r.eligibility_code || r.code, zone:r.zone || 'Blood Bank', break_time:r.break_time || '-', main_rule:r.main_rule || '', job_desc:r.job_desc || '', sort_order:Number(r.sort_order || i+1), is_outing:false, is_active:true, deleted_at:null, updated_by:sid() })),
        ...outingRows.map((r,i) => ({ code:r.code, eligibility_code:r.eligibility_code || (r.zone === 'ออกหน่วย' ? `OUTING:${r.code}` : r.code), zone:r.zone || 'ออกหน่วย', break_time:r.break_time || (r.zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'), main_rule:r.main_rule || '', job_desc:r.job_desc || '', sort_order:Number(r.sort_order || i+1), is_outing:true, is_active:true, deleted_at:null, updated_by:sid() }))
      ];
      for (const row of payloads) {
        const res = await sb.from('daily_position_masters').upsert(row, { onConflict:'code,is_outing' });
        if (res.error) throw res.error;
      }
      writeLocal(currentConfigs226()); applyConfigs226(); toast('บันทึกทั้งหมดเป็นฐานตำแหน่งแล้ว');
    } catch (err) { console.error(`${VERSION}: save all failed`, err); toast('บันทึกทั้งหมดไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }

  function staffForMonthlyTemplate(){
    const rows = (state.staff || []).filter(st => { try { return isDailyPositionEnabled(st); } catch (_) { return st?.id && st?.is_active !== false && st?.staff_type !== 'แพทย์'; } });
    return orderStaff(rows);
  }
  function workingStaffToday(date){
    try { return dailyWorkingStaff(norm(date)) || []; }
    catch (_) { return orderStaff((state.staff || []).filter(st => { try { return isDailyPositionEnabled(st) && !isActiveLeaveOn(st.id, norm(date)); } catch (__){ return st?.id && st?.is_active !== false; } })); }
  }
  function isTraineeExcludedFromSlot(person,date){
    const d=norm(date), id=safeStaffId(person?.id);
    if(!id) return false;
    try { if(window.cnmiV271?.excludeFromDaySlot?.(person,d)) return true; } catch (_) {}
    try { if(window.cnmiV271?.isTrainingPersonOnDate?.(id,d)) return true; } catch (_) {}
    try {
      const rows=Array.isArray(state?.trainingAssignmentsV271)?state.trainingAssignmentsV271:[];
      if(rows.some(row=>row?.active!==false&&safeStaffId(row?.trainee_staff_id)===id&&norm(row?.start_date)<=d&&d<=norm(row?.end_date))) return true;
    } catch (_) {}
    // รองรับข้อมูลน้องใหม่รูปแบบเดิมก่อน V271 กรณียังไม่มีข้อมูลช่วงวันที่โหลดเข้ามา
    try {
      const rows=Array.isArray(state?.trainingAssignmentsV271)?state.trainingAssignmentsV271:[];
      if(!rows.length && (person?.is_trainee===true || /น้องใหม่|trainee|intern|probation/i.test(String(person?.position_training_status||'')))) return true;
    } catch (_) {}
    return false;
  }
  function slotCountedWorkingStaffToday(date){
    const d=norm(date);
    return workingStaffToday(d).filter(person=>!isTraineeExcludedFromSlot(person,d));
  }
  function bucketForCount(n){ const x = Math.max(8, Math.min(14, Number(n) || 14)); return DAY_SETS.reduce((best, v) => Math.abs(v - x) < Math.abs(best - x) ? v : best, 14); }
  function daySlotsForCount(count){ const cfg = currentConfigs226(); const n = bucketForCount(count); return sanitizeRows(cfg.day[n] || cfg.day[String(n)] || [], 'day'); }
  function outingTemplateSlots(){ return sanitizeRows(currentConfigs226().outing || [], 'outing'); }
  function allSlotTemplates(){ const map = new Map(); DAY_SETS.forEach(n => daySlotsForCount(n).forEach(p => { if (!map.has(p.code)) map.set(p.code, p); })); outingTemplateSlots().forEach(p => { if (!map.has(`${p.code}|outing`)) map.set(`${p.code}|outing`, p); }); return Array.from(map.values()); }
  function baseCode(code){ try { return positionBaseCode(code); } catch (_) { return String(code || '').replace(/\s+#\d+$/, '').trim(); } }
  function labelCode(code){ try { return positionLabelForCell(code); } catch (_) { return baseCode(code); } }
  function zoneOf(pos){
    const code = baseCode(pos?.code || pos?.position_code || '');
    return displayZone(pos?.zone, code);
  }
  function isRealCode(code){ const c = baseCode(code); return !!c && c !== 'รอตรวจสอบ' && c !== '-'; }
  function loadWeight(pos){ try { return positionLoadWeight(baseCode(pos.code || pos.position_code)); } catch (_) { return zoneOf(pos)==='ออกหน่วย' ? 1.1 : /^BB-Manual/i.test(baseCode(pos?.code || pos?.position_code || '')) ? 1.15 : 1; } }
  function ruleOkNoLeave(staff, pos){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff)) return false; } catch (_) {}
    try { if (typeof positionRuleOk === 'function' && !positionRuleOk(staff, pos.main_rule || '')) return false; } catch (_) {}
    try { if (typeof positionEligible === 'function' && !positionEligible(staff, pos.eligibility_code || pos.code)) return false; } catch (_) {}
    return true;
  }
  function dailyEligible(staff, pos, date){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff) || isActiveLeaveOn(staff.id, norm(date))) return false; } catch (_) {}
    return ruleOkNoLeave(staff, pos);
  }
  function makeRow(date, staff, pos){
    const p = { ...pos, code:pos.code || pos.position_code, position_code:pos.code || pos.position_code };
    try { return rowForStaffPosition(staff, norm(date), p, {}); }
    catch (_) { return { work_date:norm(date), position_code:p.code, code:p.code, zone:p.zone || zoneOf(p), break_time:p.break_time || '-', main_rule:p.main_rule || '', job_desc:p.job_desc || '', staff_id:staff?.id || null, updated_by:sid() }; }
  }
  function reviewPos(msg){ return { code:'รอตรวจสอบ', position_code:'รอตรวจสอบ', zone:'รอตรวจสอบ', break_time:'-', main_rule:'', job_desc:msg || 'ต้องตรวจสอบ', eligibility_code:'รอตรวจสอบ' }; }
  function initStats(){ return { total:0, load:0, byCode:{}, byRoom:{}, lastCode:'', lastRoom:'' }; }
  function addStats(stats, staffId, pos){
    if (!staffId || !pos) return;
    const code = baseCode(pos.code || pos.position_code || ''); if (!isRealCode(code)) return;
    const s = stats[staffId] || (stats[staffId] = initStats()); const room = zoneOf(pos);
    s.total += 1; s.load += loadWeight(pos); s.byCode[code] = (s.byCode[code] || 0) + 1; s.byRoom[room] = (s.byRoom[room] || 0) + 1; s.lastCode = code; s.lastRoom = room;
  }
  function priorFiscalStats(monthKey){
    const start = fiscalStart(`${monthKey}-01`); const monthStart = `${monthKey}-01`; const stats = {};
    (state.positions || []).forEach(r => { const d = norm(r?.work_date); if (!d || d < start || d >= monthStart) return; const id = safeStaffId(r?.staff_id); const code = baseCode(r?.position_code || r?.code || ''); if (!id || !isRealCode(code)) return; addStats(stats, id, { code, zone:r.zone }); });
    return stats;
  }
  function lastMonthCodesByStaff(monthKey){
    const [yRaw,mRaw] = String(monthKey).split('-').map(Number); const d = new Date(yRaw || new Date().getFullYear(), (mRaw || 1) - 2, 1); const prev = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; const out = {};
    (state.positions || []).forEach(r => { const dk = norm(r?.work_date); if (!dk.startsWith(prev)) return; const id = safeStaffId(r?.staff_id); const c = baseCode(r?.position_code || r?.code || ''); if (!id || !isRealCode(c)) return; (out[id] ||= new Set()).add(c); });
    return out;
  }
  function circularDistance(a,b,n){ if (!n) return 0; const d = Math.abs((a % n) - (b % n)); return Math.min(d, n - d); }
  function scorePositionForStaff(staff, pos, ctx){
    const id = safeStaffId(staff?.id); const code = baseCode(pos.code || pos.position_code || ''); const room = zoneOf(pos); const hist = ctx.hist[id] || initStats(); const cur = ctx.cur[id] || initStats(); const lastMonth = ctx.lastMonth[id] || new Set(); const staffIndex = ctx.staffIndex.get(id) || 0; const posIndex = ctx.posIndex.get(code) || 0; const desired = (staffIndex + ctx.fiscalWeekIndex) % Math.max(1, ctx.slots.length);
    let score = 0;
    score += (hist.byCode[code] || 0) * 900 + (cur.byCode[code] || 0) * 1250;
    score += (hist.byRoom[room] || 0) * 170 + (cur.byRoom[room] || 0) * 360;
    score += (hist.load || 0) * 12 + (cur.load || 0) * 35 + (hist.total || 0) * 8 + (cur.total || 0) * 18;
    if (lastMonth.has(code)) score += 1800;
    if (ctx.prevWeekCode[id] === code) score += 2600;
    if (ctx.prevWeekRoom[id] === room) score += 380;
    if (['Blood Bank','Donor Room'].includes(room) && !(cur.byRoom[room] || 0)) score -= 420;
    score += circularDistance(posIndex, desired, ctx.slots.length) * 6;
    return score;
  }
  function chooseForSlot(slot, pool, used, ctx){
    const candidates = pool.filter(st => !used.has(safeStaffId(st.id)) && ruleOkNoLeave(st, slot));
    candidates.sort((a,b) => scorePositionForStaff(a, slot, ctx) - scorePositionForStaff(b, slot, ctx) || compareStaffSafe(a,b));
    return candidates[0] || null;
  }
  function chooseWeeklyAssignments(staffList, slots, weekDates, ctx){
    const assignments = new Map(); const usedCodes = new Set();
    const eligibleCount = st => slots.filter(p => ruleOkNoLeave(st, p)).length || 99;
    const staffOrder = staffList.slice().sort((a,b) => eligibleCount(a) - eligibleCount(b) || compareStaffSafe(a,b));
    staffOrder.forEach(st => {
      const id = safeStaffId(st.id);
      let candidates = slots.filter(p => !usedCodes.has(baseCode(p.code)) && ruleOkNoLeave(st, p));
      if (!candidates.length) candidates = slots.filter(p => !usedCodes.has(baseCode(p.code)));
      if (!candidates.length) candidates = slots.slice();
      candidates.sort((a,b) => scorePositionForStaff(st, a, ctx) - scorePositionForStaff(st, b, ctx) || String(a.code).localeCompare(String(b.code), 'th'));
      const chosen = candidates[0] || reviewPos('ไม่พบตำแหน่งที่ตรงสิทธิ์ในสัปดาห์นี้');
      assignments.set(id, chosen); if (isRealCode(chosen.code)) usedCodes.add(baseCode(chosen.code)); addStats(ctx.cur, id, chosen); ctx.prevWeekCode[id] = baseCode(chosen.code || ''); ctx.prevWeekRoom[id] = zoneOf(chosen);
    });
    return assignments;
  }
  function buildOutingRowsForDate(date, staffList, ctx){
    const slots = outingTemplateSlots(); const rows = []; const used = new Set(); const participants = outingIdSet(date);
    const outingPool = staffList.filter(st => participants.has(safeStaffId(st.id)));
    const roomPool = staffList.filter(st => !participants.has(safeStaffId(st.id)));
    slots.forEach(slot => {
      const z = zoneOf(slot); const pool = z === 'ออกหน่วย' ? outingPool : roomPool;
      const st = chooseForSlot(slot, pool, used, { ...ctx, slots });
      if (st) { used.add(safeStaffId(st.id)); rows.push(makeRow(date, st, slot)); addStats(ctx.cur, st.id, slot); ctx.prevWeekCode[safeStaffId(st.id)] = baseCode(slot.code); ctx.prevWeekRoom[safeStaffId(st.id)] = z; }
    });
    outingPool.filter(st => !used.has(safeStaffId(st.id))).forEach(st => rows.push(makeRow(date, st, reviewPos('คนเข้าร่วมออกหน่วยมากกว่า Slot ออกหน่วย'))));
    roomPool.filter(st => !used.has(safeStaffId(st.id))).forEach(st => rows.push(makeRow(date, st, reviewPos('คนอยู่ห้องมากกว่า Slot ห้องในชุดวันออกหน่วย'))));
    return rows;
  }
  function buildWeeklyRotationPlan226(key){
    const monthKey = String(key || (state.positionMonthKey || state.monthKey || today().slice(0,7))).slice(0,7);
    const staffList = staffForMonthlyTemplate(); const rows = []; const slotCount = bucketForCount(staffList.length); const normalSlots = daySlotsForCount(slotCount); const hist = priorFiscalStats(monthKey); const cur = {}; const lastMonth = lastMonthCodesByStaff(monthKey); const staffIndex = new Map(staffList.map((s,i) => [safeStaffId(s.id), i])); const posIndex = new Map(normalSlots.map((p,i) => [baseCode(p.code), i])); const prevWeekCode = {}; const prevWeekRoom = {}; let currentWeek = ''; let weekly = new Map();
    monthDates(monthKey).forEach(date => {
      if (isNoPosition(date)) return;
      const baseCtx = { monthKey, hist, cur, lastMonth, staffIndex, posIndex, slots:normalSlots, fiscalWeekIndex:weekIndexFromFiscal(date), prevWeekCode, prevWeekRoom };
      if (hasOutingSafe(date)) { rows.push(...buildOutingRowsForDate(date, staffList, baseCtx)); return; }
      const wk = weekKey(date);
      if (wk !== currentWeek) { currentWeek = wk; weekly = chooseWeeklyAssignments(staffList, normalSlots, [date], baseCtx); }
      staffList.forEach(st => { const pos = weekly.get(safeStaffId(st.id)) || reviewPos('ยังไม่จัดตำแหน่งตั้งต้น'); rows.push(makeRow(date, st, pos)); });
    });
    return { monthKey, rows, autoPlanV226:true, weeklyRotation:true, outingTemplateException:true, slotSet:slotCount, ignoreLeave:true };
  }
  function blankMonthlyTemplate226(key){
    const monthKey = String(key || (state.positionMonthKey || state.monthKey || today().slice(0,7))).slice(0,7); const staffList = staffForMonthlyTemplate(); const rows = [];
    monthDates(monthKey).forEach(date => { if (isNoPosition(date)) return; staffList.forEach(st => rows.push({ work_date:date, position_code:'', code:'', zone:'', break_time:'', main_rule:'', job_desc:'', staff_id:st.id, updated_by:sid(), _blankTableV226:true })); });
    return { monthKey, rows, blankTable:true, ignoreLeave:true };
  }
  try { window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV226(key){ return buildWeeklyRotationPlan226(key); }; } catch (_) { window.buildMonthlyPositionDraft = buildWeeklyRotationPlan226; }

  function rowsForMonthContext(key){ if (state.monthPositionDraft?.monthKey === key && Array.isArray(state.monthPositionDraft.rows)) return state.monthPositionDraft.rows; return (state.positions || []).filter(r => norm(r?.work_date).startsWith(key)); }
  function cellRowsByStaffDate(rows){
    const by = Object.create(null); const assigned = new Map();
    (rows || []).forEach((r,idx) => { const id = safeStaffId(r?.staff_id); const d = norm(r?.work_date); if (!id || !d) return; (by[`${id}|${d}`] ||= []).push({ ...r, _idx:idx }); const c = baseCode(r?.position_code || r?.code || ''); if (isRealCode(c)) { if (!assigned.has(d)) assigned.set(d, new Set()); assigned.get(d).add(c); } });
    return { by, assigned };
  }
  function expectedSlotsForMonthDate(date){ if (hasOutingSafe(date)) return outingTemplateSlots(); return daySlotsForCount(staffForMonthlyTemplate().length); }
  function countCell(date, assigned){
    const d = norm(date); if (isNoPosition(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const actual = hasOutingSafe(d) ? outingIdSet(d).size : slotCountedWorkingStaffToday(d).length; const slots = expectedSlotsForMonthDate(d); const diff = actual - slots.length; const text = diff === 0 ? 'พอดี' : (diff > 0 ? `เกิน ${diff}` : `ขาด ${Math.abs(diff)}`); const title = hasOutingSafe(d) ? `คนเข้าร่วมออกหน่วย ${actual} คน | Slot ออกหน่วย ${slots.length}` : `คนที่นับ Slot ${actual} คน | Slot ${slots.length}`;
    return `<th class="count-role-cell ${diff<0?'has-missing':diff>0?'has-extra':'complete'}" title="${esc(title)}"><b>${actual}/${slots.length}</b><br><small>${hasOutingSafe(d)?'ออกหน่วย':'วันนี้'}</small><br><small>${esc(text)}</small></th>`;
  }
  function missingCell(date, assigned){
    const d = norm(date); if (isNoPosition(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const set = assigned.get(d) || new Set(); const missing = expectedSlotsForMonthDate(d).filter(p => !set.has(baseCode(p.code)));
    if (!missing.length) return `<th class="missing-role-cell complete">ครบ</th>`;
    return `<th class="missing-role-cell has-missing">${missing.slice(0,3).map(p => `<span>${esc(p.code)}</span>`).join('')}${missing.length>3?`<small>+${missing.length-3}</small>`:''}</th>`;
  }
  function monthOptions(date, current){
    const expected = expectedSlotsForMonthDate(date); const map = new Map((expected.length ? expected : allSlotTemplates()).map(p => [p.code, p]));
    if (current && !map.has(current)) map.set(current, allSlotTemplates().find(p => baseCode(p.code) === baseCode(current)) || { code:current, zone:'รอตรวจสอบ' });
    return Array.from(map.values());
  }
  function renderMonthCell226(staff, date, cellRows, canEdit){
    const d = norm(date); if (isNoPosition(d)) return `<td class="matrix-cell no-position-day ${isHolidaySafe(d) ? 'holiday-cell' : 'weekend-cell'}"><span>${isHolidaySafe(d) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
    const row = (cellRows || [])[0] || null; const cleanCodes = (cellRows || []).map(r => baseCode(r?.position_code || r?.code || '')).filter(isRealCode); const current = row?.position_code || ''; const cls = `${hasOutingSafe(d) ? 'outing-cell' : ''} ${!cleanCodes.length ? 'needs-review-cell' : ''}`.trim();
    if (canEdit) { const options = monthOptions(d, current); return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(d)}|${esc(staff?.id || '')}"><option value="">รอตรวจสอบ</option>${options.map(t => `<option value="${esc(t.code)}" ${current===t.code?'selected':''}>${esc(labelCode(t.code))}</option>`).join('')}</select>${hasOutingSafe(d) ? '<div class="cell-note">ใช้ชุดออกหน่วย</div>' : ''}</td>`; }
    const text = cleanCodes.length ? cleanCodes.map(labelCode).join(' / ') : 'รอตรวจสอบ'; return `<td class="matrix-cell ${cls}"><span title="${esc(text)}">${esc(text)}</span>${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ใช้ชุดออกหน่วย</div>' : ''}</td>`;
  }
  window.renderMonthPositionMatrix = renderMonthPositionMatrix = function renderMonthPositionMatrixV226(rows, dates){
    rows = Array.isArray(rows) ? rows : []; dates = Array.isArray(dates) ? dates : [];
    if (!rows.length) return emptySafe('ยังไม่มีแผนรายเดือน กด “สร้างตารางตั้งต้นเปล่า” หรือ “สร้างแผนรายสัปดาห์ทั้งเดือน” ก่อน');
    const { by, assigned } = cellRowsByStaffDate(rows); const rowStaffIds = new Set(rows.map(r => safeStaffId(r?.staff_id)).filter(Boolean)); const displayStaff = orderStaff((state.staff || []).filter(s => { try { return isDailyPositionEnabled(s) || rowStaffIds.has(safeStaffId(s.id)); } catch (_) { return rowStaffIds.has(safeStaffId(s.id)) || s?.is_active !== false; } })); const canEdit = (() => { try { return admin() && state.page === 'positionMonth'; } catch (_) { return false; } })();
    const heads = dates.map(date => { const d = parseSafe(date); const cls = isHolidaySafe(date) ? 'holiday-head' : isWeekendSafe(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${esc(thDay(date))}</span>${hasOutingSafe(date)?'<br><small>ออกหน่วย</small>':''}</th>`; }).join('');
    return `<div class="monthly-matrix-wrap v225-position-matrix v226-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> วันออกหน่วย = ใช้ชุด Slot วันที่ออกหน่วยเท่านั้น <span class="hint">วันปกติหมุนรายสัปดาห์ ส่วนวันออกหน่วยไม่อิงรายสัปดาห์</span></div><div class="table-wrap month-position-matrix v225-month-position-matrix v226-month-position-matrix"><table><thead><tr><th class="sticky-col staff-col v225-staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col v225-summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col v225-staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col v225-summary-col count-role-head">คน/Slot</th>${dates.map(date => countCell(date, assigned)).join('')}</tr><tr class="missing-role-row"><th class="sticky-col staff-col v225-staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col v225-summary-col missing-role-head">ตำแหน่ง</th>${dates.map(date => missingCell(date, assigned)).join('')}</tr></thead><tbody>${displayStaff.map(st => { const bg = (() => { try { return staffColor(st); } catch (_) { return '#dbeafe'; } })(); const fg = (() => { try { return textColorFor(bg); } catch (_) { return '#0f172a'; } })(); return `<tr><td class="sticky-col staff-col v225-staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(staffName(st))}</b><small>${esc(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col v225-summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell226(st, date, by[`${st.id}|${date}`] || [], canEdit)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };
  function renderMonthPositionPage226(){
    try { if (!admin()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>'; } catch (_) {}
    const key = state.positionMonthKey || state.monthKey || today().slice(0,7); const dates = monthDates(key); const rows = rowsForMonthContext(key); const savedCount = (state.positions || []).filter(x => norm(x?.work_date).startsWith(key)).length; const workingDays = dates.filter(d => !isNoPosition(d)).length; const staffCount = staffForMonthlyTemplate().length; const setNo = bucketForCount(staffCount);
    return `<div class="card monthly-position-page v225-monthly-position-page v226-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3><p class="hint">วันปกติ = คงตำแหน่งรายสัปดาห์แล้วหมุนสัปดาห์ถัดไป • วันออกหน่วย = ใช้ชุด Slot วันที่ออกหน่วยและคนเข้าร่วมกิจกรรม</p></div></div><div class="v224-month-toolbar v225-month-toolbar"><label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label><button class="ghost-btn" type="button" data-v226-create-blank-month>สร้างตารางตั้งต้นเปล่า</button><button class="soft-btn" type="button" data-v226-generate-month-plan>สร้างแผนรายสัปดาห์ทั้งเดือน</button><button class="primary-btn" type="button" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button><button class="ghost-btn danger" type="button" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button><button class="ghost-btn" type="button" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button><button class="soft-btn" type="button" data-position-month-overview-v225>ดูภาพรวมจัดตำแหน่ง</button><span class="v224-mini-badges">${badgeSafe(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black')} ${badgeSafe(`วันทำงาน ${workingDays} วัน`, 'blue')} ${badgeSafe(`วันปกติชุด ${setNo} Slot`, 'blue')} ${badgeSafe(`ออกหน่วย ${outingTemplateSlots().length} Slot`, 'orange')}</span></div>${window.renderMonthPositionMatrix(rows, dates)}</div>`;
  }
  try { window.renderPositionMonthPage = renderPositionMonthPage = renderMonthPositionPage226; } catch (_) { window.renderPositionMonthPage = renderMonthPositionPage226; }
  async function generateMonth226(){
    try { if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error'); } catch (_) {}
    const input = document.getElementById('positionMonthInput'); const key = String(input?.value || state.positionMonthKey || state.monthKey || today().slice(0,7)).slice(0,7);
    await loadConfigs226(false); state.positionMonthKey = key; state.monthPositionDraft = buildWeeklyRotationPlan226(key); renderPage(); toast('สร้างแผนแล้ว: วันปกติหมุนรายสัปดาห์ / วันออกหน่วยใช้ชุดออกหน่วย');
  }
  function blankMonth226(){ const input = document.getElementById('positionMonthInput'); const key = String(input?.value || state.positionMonthKey || state.monthKey || today().slice(0,7)).slice(0,7); state.positionMonthKey = key; state.monthPositionDraft = blankMonthlyTemplate226(key); renderPage(); toast('สร้างตารางตั้งต้นเปล่าแล้ว'); }

  const LS_DAILY_SLOT_KEY = 'cnmi_v225_daily_slot_set_by_date';
  function dailySlotStore(){ try { return JSON.parse(localStorage.getItem(LS_DAILY_SLOT_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function setDailySlotSet(date, setNo){ const data = dailySlotStore(); data[norm(date)] = Number(setNo) || bucketForCount(slotCountedWorkingStaffToday(date).length); try { localStorage.setItem(LS_DAILY_SLOT_KEY, JSON.stringify(data)); } catch (_) {} }
  function dailySlotSet(date){ const data = dailySlotStore(); return Number(data[norm(date)] || bucketForCount(slotCountedWorkingStaffToday(date).length)); }
  function dailyBaseSlots(date){ return hasOutingSafe(date) ? outingTemplateSlots() : daySlotsForCount(dailySlotSet(date)); }
  function combineDailyRows226(date){
    const d = norm(date); const planRows = (() => { try { return sortPositionRows((state.positions || []).filter(x => norm(x.work_date) === d)); } catch (_) { return (state.positions || []).filter(x => norm(x.work_date) === d); } })(); const planByCode = new Map(); planRows.forEach(r => { const c = baseCode(r.position_code || r.code || ''); if (c && !planByCode.has(c)) planByCode.set(c, r); });
    const rows = dailyBaseSlots(d).map(p => { const plan = planByCode.get(baseCode(p.code)); return { ...p, code:p.code, position_code:p.code, staff_id:plan?.staff_id || null, _planned_staff_id:plan?.staff_id || null, _planned_code:p.code, _source:'slot' }; });
    planRows.forEach(r => { const c = baseCode(r.position_code || r.code || ''); if (!c || rows.some(x => baseCode(x.position_code || x.code) === c)) return; const tpl = allSlotTemplates().find(p => baseCode(p.code) === c) || r; rows.push({ ...tpl, ...r, code:c, position_code:c, _planned_staff_id:r.staff_id || null, _source:'extra-plan' }); });
    return rows;
  }
  function staffOptionsDaily226(row, selectedId, date){
    const d = norm(date); const participants = outingIdSet(d); let pool = workingStaffToday(d);
    if (hasOutingSafe(d)) { const z = zoneOf(row); pool = z === 'ออกหน่วย' ? pool.filter(st => participants.has(safeStaffId(st.id))) : pool.filter(st => !participants.has(safeStaffId(st.id))); }
    let list = pool.filter(st => dailyEligible(st, row, d)); const selected = selectedId ? (state.staff || []).find(s => safeStaffId(s.id) === safeStaffId(selectedId)) : null; if (selected && !list.some(s => safeStaffId(s.id) === safeStaffId(selected.id))) list.unshift(selected); list = orderStaff(list);
    return list.map(s => `<option value="${esc(s.id)}" ${safeStaffId(s.id)===safeStaffId(selectedId)?'selected':''}>${esc(staffName(s))}</option>`).join('');
  }
  function leaveTextForStaff(staffId, date){ try { const row = activeLeaveRecordOn(staffId, norm(date)); if (!row) return ''; if (typeof leaveDisplayType === 'function') return leaveDisplayType(row); return String(row.type || row.leave_type || 'ลา'); } catch (_) { return ''; } }
  function renderDailySelect226(row, idx, date, layout){ const code = row.position_code || row.code || 'รอตรวจสอบ'; const zone = zoneOf(row); const breakTime = row.break_time || '-'; const rule = row.main_rule || ''; const job = row.job_desc || ''; return `<select class="v225-position-select" data-position-row="${esc(idx)}" data-position-code="${esc(code)}" data-position-zone="${esc(zone)}" data-position-break="${esc(breakTime)}" data-position-rule="${esc(rule)}" data-position-job="${esc(job)}" data-position-layout-item="${esc(layout || '')}"><option value="">เลือกคน/ว่าง</option>${staffOptionsDaily226({ ...row, code, position_code:code, zone, break_time:breakTime, main_rule:rule, job_desc:job }, row.staff_id, date)}</select>`; }
  function renderDailyComparePanel226(date, rows){
    const d=norm(date);
    const working=workingStaffToday(d);
    const countedWorking=slotCountedWorkingStaffToday(d);
    const excludedCount=Math.max(0,working.length-countedWorking.length);
    const planStaffIds=new Set((state.positions||[]).filter(r=>norm(r.work_date)===d&&r.staff_id).map(r=>safeStaffId(r.staff_id)));
    const planCount=planStaffIds.size;
    const slotCount=rows.filter(r=>r._source!=='extra-plan').length;
    const participants=outingIdSet(d);
    const outing=hasOutingSafe(d);
    const compareCount=outing?participants.size:countedWorking.length;
    const diff=compareCount-slotCount;
    const missingStaff=Array.from(planStaffIds).filter(id=>!working.some(st=>safeStaffId(st.id)===id));
    const setNo=dailySlotSet(d);
    const setOptions=DAY_SETS.map(n=>`<option value="${n}" ${n===setNo?'selected':''}>${n} Slot</option>`).join('');
    if(outing){
      return `<div class="v225-daily-compare-panel v226-daily-compare-panel"><div class="v225-compare-cards"><div><b>${working.length}</b><span>คนเหลือจริงวันนี้</span></div><div><b>${participants.size}</b><span>คนเข้าร่วมออกหน่วย</span></div><div><b>${slotCount}</b><span>Slot ชุดออกหน่วย</span></div><div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':(diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`)}</b><span>เทียบคนเข้าร่วมกับ Slot</span></div></div><div class="notice soft-notice compact"><b>วันนี้เป็นวันออกหน่วย:</b> ใช้ชุด Slot วันที่ออกหน่วยเท่านั้น ไม่ใช้แผนหมุนรายสัปดาห์</div>${missingStaff.length?`<div class="notice compact warn-notice">คนในแผนตั้งต้นที่ไม่อยู่วันนี้: ${missingStaff.map(id=>staffPillSafe(id)).join(' ')}</div>`:''}</div>`;
    }
    return `<div class="v225-daily-compare-panel v226-daily-compare-panel v308-slot-count-panel"><div class="v225-compare-cards v308-five-cards"><div><b>${working.length}</b><span>คนอยู่จริงทั้งหมด</span></div><div><b>${countedWorking.length}</b><span>คนที่นับเป็น Slot</span></div><div><b>${planCount}</b><span>คนในแผนตั้งต้น</span></div><div><b>${slotCount}</b><span>Slot วันนี้</span></div><div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':(diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`)}</b><span>เทียบคนที่นับ Slot</span></div></div>${excludedCount?`<div class="notice soft-notice compact v308-trainee-note"><b>น้องใหม่/Intern ${excludedCount} คน:</b> แสดงเป็นคนที่อยู่จริง แต่ไม่นำมาคำนวณ Slot</div>`:''}<div class="v225-daily-slot-toolbar"><label>ชุด Slot วันนี้ <select data-v226-daily-slot-set="${esc(d)}">${setOptions}</select></label><span class="hint">ระบบเลือกจากจำนวนคนที่นับเป็น Slot โดยอัตโนมัติ และปรับเป็น 8-14 Slot ได้</span></div>${missingStaff.length?`<div class="notice compact warn-notice">คนในแผนตั้งต้นที่ไม่อยู่วันนี้: ${missingStaff.map(id=>staffPillSafe(id)).join(' ')}</div>`:''}</div>`;
  }
  function renderPositionsPage226(){
    try {
      const date = norm(state.positionDate || today()); const canManage = canManagePositions(date); const key = date.slice(0,7); const incharge = currentInchargeForMonth(key); const dayStatus = (state.positionDayStatus || []).find(x => norm(x.work_date) === date); const isPublished = dayStatus?.status === 'published'; const noPosition = isNoPosition(date); const rows = noPosition ? [] : combineDailyRows226(date); window.__CNMI_V226_DAILY_POSITION_ROWS__ = rows; window.__CNMI_V225_DAILY_POSITION_ROWS__ = rows;
      const rowHtml = rows.map((r,idx) => { const code = r.position_code || r.code || 'รอตรวจสอบ'; const label = labelCode(code); const zone = zoneOf(r); const breakTime = r.break_time || '-'; const rule = r.main_rule || '-'; const job = r.job_desc || '-'; const planned = r._planned_staff_id ? `${staffPillSafe(r._planned_staff_id)}${leaveTextForStaff(r._planned_staff_id, date) ? `<div class="cell-note">${esc(leaveTextForStaff(r._planned_staff_id, date))}</div>` : ''}` : '<span class="muted">-</span>'; const select = canManage ? renderDailySelect226(r, idx, date, 'desktop') : staffPillSafe(r.staff_id); const extra = r._source === 'extra-plan' ? badgeSafe('เกินจากชุด Slot วันนี้', 'orange') : ''; return `<tr class="${r._source === 'extra-plan' ? 'v225-extra-plan-row' : ''}"><td>${esc(zone)}${extra}</td><td><b>${esc(label)}</b></td><td>${esc(breakTime)}</td><td class="v225-plan-cell">${planned}</td><td>${select}</td><td>${esc(rule)}</td><td><button class="tiny-btn" type="button" data-v226-position-detail="${esc(idx)}">ดู</button><span class="muted v225-job-short">${esc(String(job).slice(0,70))}${String(job).length>70?'…':''}</span></td></tr>`; }).join('');
      const cardHtml = rows.map((r,idx) => { const code = r.position_code || r.code || 'รอตรวจสอบ'; const zone = zoneOf(r); const breakTime = r.break_time || '-'; const rule = r.main_rule || '-'; const select = canManage ? renderDailySelect226(r, idx, date, 'mobile') : staffPillSafe(r.staff_id); const planned = r._planned_staff_id ? staffPillSafe(r._planned_staff_id) : '<span class="muted">-</span>'; return `<div class="position-mobile-card v225-position-card ${r._source === 'extra-plan' ? 'v225-extra-plan-row' : ''}"><div class="section-title"><h3>${esc(labelCode(code))}</h3>${badgeSafe(zone || '-', zone === 'ออกหน่วย' ? 'red' : 'blue')}</div><div class="muted">พัก ${esc(breakTime)} • ${esc(rule)}</div><div><b>แผนตั้งต้น:</b> ${planned}</div><label>ปรับวันนี้ ${select}</label><div class="actions"><button class="tiny-btn" type="button" data-v226-position-detail="${esc(idx)}">ดูรายละเอียดหน้าที่</button></div></div>`; }).join('');
      const table = `<div class="table-wrap daily-position-table desktop-table v225-daily-position-table" data-position-layout="desktop"><table><thead><tr><th>โซน</th><th>Slot วันนี้</th><th>พัก</th><th>แผนตั้งต้น</th><th>ปรับวันนี้</th><th>เงื่อนไข</th><th>รายละเอียด</th></tr></thead><tbody>${rowHtml}</tbody></table></div><div class="mobile-position-list v225-mobile-position-list" data-position-layout="mobile">${cardHtml}</div>`;
      return `<div class="card v225-positions-page v226-positions-page"><div class="toolbar v225-position-toolbar"><label>วันที่ <input type="date" id="positionDateInput" value="${esc(date)}"></label>${admin() ? `<label>อินชาร์จ <select id="inchargeSelect"><option value="">ไม่ระบุ</option>${staffOptions(incharge)}</select></label><button class="soft-btn" type="button" data-save-incharge>บันทึกอินชาร์จ</button>` : `<span>${badgeSafe('อินชาร์จ: ' + staffNick(incharge), 'blue')}</span>`}${canManage && !noPosition ? '<button class="primary-btn" type="button" data-save-positions>บันทึกตำแหน่งวันนี้</button><button class="soft-btn" type="button" data-publish-positions>ประกาศให้ Staff เห็น</button>' : ''}${isPublished ? '<span class="badge green">ประกาศแล้ว</span>' : '<span class="badge orange">ร่าง</span>'}</div><div class="notice soft-notice compact v225-position-note"><b>วิธีใช้:</b> ซ้ายคือแผนตั้งต้นจากรายเดือน ขวาคือคนที่อินชาร์จปรับสำหรับวันนี้ หลังหักลา/ไม่รับเวรแล้วค่อยกดบันทึก</div>${noPosition ? `<div class="notice">วันนี้เป็น${isHolidaySafe(date) ? 'วันหยุดราชการ' : 'วันเสาร์-อาทิตย์'} จึงไม่ต้องจัดตำแหน่งรายวัน</div>` : ''}${!noPosition ? renderDailyComparePanel226(date, rows) : ''}${noPosition ? emptySafe('ไม่มีตารางตำแหน่งกลางวัน รายวันสำหรับวันนี้') : table}</div>`;
    } catch (err) { console.error(`${VERSION}: renderPositionsPage failed`, err); return `<div class="notice error-notice">โหลดตารางตำแหน่งกลางวัน รายวันไม่สำเร็จ: ${esc(err?.message || err)}</div>`; }
  }
  try { window.renderPositionsPage = renderPositionsPage = renderPositionsPage226; } catch (_) { window.renderPositionsPage = renderPositionsPage226; }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = renderPage = function renderPageV226(){
    if (state?.page === 'positionManagement') { try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} try { const item = (window.NAV_ITEMS || NAV_ITEMS || []).find(x => x.id === 'positionManagement') || {}; const title = document.getElementById('pageTitle'); const sub = document.getElementById('pageSubtitle'); if (title) title.textContent = item.title || 'จัดการตำแหน่ง'; if (sub) sub.textContent = item.subtitle || 'เพิ่ม/แก้ไข/ปิดใช้งานตำแหน่งรายวัน'; } catch (_) {} renderPositionManagement226(); setTimeout(() => loadConfigs226(false).then(() => { if (state?.page === 'positionManagement') renderPositionManagement226(); }), 10); return; }
    if (state?.page === 'positionMonth') { try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} const content = document.getElementById('pageContent'); if (content) content.innerHTML = renderMonthPositionPage226(); return; }
    if (state?.page === 'positions') { try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} const content = document.getElementById('pageContent'); if (content) content.innerHTML = renderPositionsPage226(); return; }
    return previousRenderPage ? previousRenderPage.apply(this, arguments) : undefined;
  };

  window.addEventListener('click', function(e){
    const add = e.target?.closest?.('[data-v226-add-slot]'); if (add) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); openSlotModal226(); return; }
    const edit = e.target?.closest?.('[data-v226-edit-slot]'); if (edit) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); openSlotModal226(Number(edit.getAttribute('data-v226-edit-slot'))); return; }
    const copy = e.target?.closest?.('[data-v226-copy-slot]'); if (copy) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); openSlotModal226(Number(copy.getAttribute('data-v226-copy-slot')), true); return; }
    const mv = e.target?.closest?.('[data-v226-move-slot]'); if (mv) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); const [iRaw,dRaw] = String(mv.getAttribute('data-v226-move-slot') || '').split(':'); const i = Number(iRaw), delta = Number(dRaw); const rows = selectedRows().slice(); const j = i + delta; if (rows[i] && rows[j]) { const tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp; setSelectedRows(reindex(rows)); renderPositionManagement226(); } return; }
    const del = e.target?.closest?.('[data-v226-delete-slot]'); if (del) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); (async () => { const idx = Number(del.getAttribute('data-v226-delete-slot')); const rows = selectedRows().slice(); const row = rows[idx]; if (!row) return; const ok = await (typeof confirmDialog === 'function' ? confirmDialog(`ลบ Slot ${row.code} ออกจากชุดนี้?`, 'ยืนยันลบ Slot') : Promise.resolve(window.confirm(`ลบ Slot ${row.code}?`))); if (!ok) return; rows.splice(idx,1); setSelectedRows(reindex(rows)); renderPositionManagement226(); toast('ลบ Slot ออกจากชุดนี้แล้ว อย่าลืมบันทึก'); })(); return; }
    const saveModal = e.target?.closest?.('[data-v226-save-slot-modal]'); if (saveModal) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); const form = saveModal.closest('form'); if (form) saveSlotModal226(form); return; }
    const saveCurrent = e.target?.closest?.('[data-v226-save-current]'); if (saveCurrent) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); saveCurrent226(); return; }
    const refresh = e.target?.closest?.('[data-v226-refresh-config]'); if (refresh) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); (async()=>{ await loadConfigs226(true); renderPositionManagement226(); toast('รีเฟรชจากฐานข้อมูลแล้ว'); })(); return; }
    const saveAll = e.target?.closest?.('[data-v226-save-all]'); if (saveAll) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); saveAll226(); return; }
    const gen = e.target?.closest?.('[data-v226-generate-month-plan],[data-v225-generate-month-plan],[data-v224-generate-month-plan],[data-v223-generate-month-plan],[data-generate-month-positions]'); if (gen) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); generateMonth226(); return; }
    const blank = e.target?.closest?.('[data-v226-create-blank-month],[data-v225-create-blank-month],[data-v224-create-blank-month],[data-v223-create-blank-month],[data-create-blank-month-positions]'); if (blank) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); blankMonth226(); return; }
    const detail = e.target?.closest?.('[data-v226-position-detail]'); if (detail) { e.preventDefault(); e.stopPropagation(); const idx = Number(detail.getAttribute('data-v226-position-detail')); const row = window.__CNMI_V226_DAILY_POSITION_ROWS__?.[idx]; if (row) showModal(`<h2>${esc(labelCode(row.position_code || row.code))}</h2><p class="hint">${esc(zoneOf(row))} • พัก ${esc(row.break_time || '-')} • ${esc(row.main_rule || '-')}</p><div class="notice soft-notice">${esc(row.job_desc || '-')}</div>`, { large:false }); return; }
  }, true);
  window.addEventListener('change', function(e){
    const kind = e.target?.closest?.('[data-v226-kind]'); if (kind) { stateSlot().kind = kind.value === 'outing' ? 'outing' : 'day'; renderPositionManagement226(); return; }
    const set = e.target?.closest?.('[data-v226-set]'); if (set) { stateSlot().setNo = Number(set.value) || 10; renderPositionManagement226(); return; }
    const slot = e.target?.closest?.('[data-v226-daily-slot-set]'); if (slot) { setDailySlotSet(slot.getAttribute('data-v226-daily-slot-set') || state.positionDate || today(), Number(slot.value) || 10); renderPage(); return; }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v226-position-matrix .v225-summary-col{background:#fff!important;color:#0f172a!important;opacity:1!important;background-clip:padding-box!important}
    .v226-position-matrix thead .v225-summary-col{background:#f8fafc!important}.v226-position-matrix tbody .v225-summary-col{background:#fff!important}.v226-position-matrix .summary-action-cell{box-shadow:8px 0 18px rgba(15,35,52,.08)!important}
    .v226-month-position-matrix table th,.v226-month-position-matrix table td{padding:4px 6px!important;line-height:1.15!important;vertical-align:middle!important}.v226-month-position-matrix tbody tr{height:42px!important}.v226-month-position-matrix .matrix-staff-name{min-height:34px!important;gap:0!important}.v226-month-position-matrix .matrix-staff-name b{font-size:13px!important}.v226-month-position-matrix .matrix-staff-name small{font-size:10px!important}.v226-month-position-matrix .month-position-select{min-height:32px!important;height:32px!important;padding:4px 24px 4px 8px!important;font-size:12px!important;border-radius:10px!important}.v226-month-position-matrix .cell-note{font-size:10px!important;margin-top:1px!important}.v226-month-position-matrix .date-head{font-size:11px!important}.v226-month-position-matrix .date-head b{font-size:12px!important}.v226-month-position-matrix .date-head small{font-size:10px!important;color:#b45309}.v226-month-position-matrix .count-role-cell,.v226-month-position-matrix .missing-role-cell{font-size:10px!important;line-height:1.15!important}.v226-month-position-matrix .count-role-cell b{font-size:12px!important}.v226-month-position-matrix .missing-role-cell span{display:block;font-size:10px;white-space:nowrap}.v226-month-position-matrix .compact-staff-summary{padding:4px 7px!important;font-size:11px!important}
    .v226-position-template-page .notice{margin:8px 0}.v226-slot-modal textarea{min-height:140px}.v226-daily-compare-panel .notice{margin-top:10px}
    .v308-five-cards{grid-template-columns:repeat(5,minmax(105px,1fr))!important}.v308-trainee-note{border-color:#fed7aa!important;background:#fff7ed!important;color:#9a3412!important}
    @media(max-width:980px){.v308-five-cards{grid-template-columns:repeat(3,minmax(105px,1fr))!important}}
    @media(max-width:760px){.v226-month-position-matrix tbody tr{height:38px!important}.v226-month-position-matrix table th,.v226-month-position-matrix table td{padding:3px 5px!important}.v226-month-position-matrix .v225-staff-col{min-width:112px!important;max-width:112px!important}.v226-month-position-matrix .v225-summary-col{left:112px!important;min-width:70px!important;max-width:70px!important}.v308-five-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  `;
  document.head.appendChild(style);

  setTimeout(() => { if (state?.page === 'positionManagement') loadConfigs226(false).then(() => { if (state?.page === 'positionManagement') renderPositionManagement226(); }); }, 160);
  window.cnmiV227 = { loadConfigs226, currentConfigs226, buildWeeklyRotationPlan226, renderPositionManagement226, renderPositionsPage226, outingTemplateSlots, displayZone, slotCountedWorkingStaffToday, isTraineeExcludedFromSlot };
  window.cnmiV226 = window.cnmiV227;
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v227-manual-as-blood-bank-zone.js", error); }
;

/* Original source: patch-v230-weekly-leave-aware-position-plan-final.js */
try {
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
    if (n <= 8) return 8;
    if (n >= 14) return 14;
    return Math.max(8, Math.min(14, Math.round(n)));
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
      [8,9,10,11,12,13,14].forEach(n => (sets[n] || []).forEach(p => { if (p?.code && !map.has(p.code)) map.set(p.code, normalizeTemplate228(p)); }));
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
      html = html.replace(/ระบบเลือกชุด 8, 9, 10, 11, 12, 13 หรือ 14 ตำแหน่งตามจำนวนเจ้าหน้าที่ที่มาทำงานจริงในแต่ละวัน[^<]*/g, 'ระบบเลือกชุด 8-14 ตามจำนวนคนประจำสัปดาห์: ลาเฉพาะบางวันยังคงตำแหน่งเดิม แต่ถ้าลาทั้งสัปดาห์จะลด Slot ของสัปดาห์นั้น');
      return html;
    };
  }

  console.info(`${VERSION_V228} loaded`);
})();

} catch (error) { console.error("[v569] patch-v230-weekly-leave-aware-position-plan-final.js", error); }
;

/* Original source: patch-v231-main-slot-weekly-leave-config.js */
try {
/* =========================
   V231 Main Slot Count + weekly leave-aware monthly position plan
   - Rename scheduler menu/header wording where monthly position page was shown as จัดตารางเวร.
   - Add Admin configuration for primary daytime slot count (8-14) on Position Management.
   - Monthly position auto plan uses: configured primary slot count - full-working-week leave count.
   - Single-day leave still keeps the weekly position, but shows the leave marker in the cell.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V231_MAIN_SLOT_WEEKLY_LEAVE_CONFIG';
  if (window.__CNMI_V231_MAIN_SLOT_WEEKLY_LEAVE_CONFIG__) return;
  window.__CNMI_V231_MAIN_SLOT_WEEKLY_LEAVE_CONFIG__ = true;

  const LS_KEY = 'cnmi_slot_base_count_v231';
  const CFG_KEY = '__CNMI_SLOT_BASE_COUNT_V231__';
  const SLOT_SET_LIST = [8, 9, 10, 11, 12, 13, 14];

  function esc231(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function normDate231(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function safeToast231(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function friendly231(err){
    try { return friendlyDbError(err); }
    catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); }
  }
  function currentStaff231(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || null; }
  }
  function clampSlot231(n){
    const x = Number(n || 0);
    if (!Number.isFinite(x)) return 14;
    return Math.max(8, Math.min(14, Math.round(x)));
  }
  function readLocalBase231(){
    try { return clampSlot231(localStorage.getItem(LS_KEY) || '14'); }
    catch (_) { return 14; }
  }
  function writeLocalBase231(n){
    try { localStorage.setItem(LS_KEY, String(clampSlot231(n))); } catch (_) {}
  }
  function getBaseSlotCount231(){
    if (!state) return readLocalBase231();
    const n = Number(state.baseSlotCountV231 || 0);
    if (Number.isFinite(n) && n >= 8 && n <= 14) return clampSlot231(n);
    const local = readLocalBase231();
    state.baseSlotCountV231 = local;
    return local;
  }
  function setBaseSlotCount231(n){
    const val = clampSlot231(n);
    if (state) state.baseSlotCountV231 = val;
    writeLocalBase231(val);
    return val;
  }
  function parseDbBase231(raw){
    if (raw == null) return null;
    const text = String(raw || '').trim();
    if (!text) return null;
    const direct = Number(text);
    if (Number.isFinite(direct) && direct >= 8 && direct <= 14) return clampSlot231(direct);
    try {
      const obj = JSON.parse(text);
      const n = Number(obj?.base_slot_count ?? obj?.baseSlotCount ?? obj?.slot_count ?? obj?.count);
      if (Number.isFinite(n) && n >= 8 && n <= 14) return clampSlot231(n);
    } catch (_) {}
    return null;
  }
  async function loadBaseSlotCount231(force=false){
    if (!state) return getBaseSlotCount231();
    if (state.baseSlotCountLoadedV231 && !force) return getBaseSlotCount231();
    state.baseSlotCountV231 = readLocalBase231();
    try {
      if (typeof sb !== 'undefined' && sb) {
        const res = await sb.from('daily_position_masters').select('job_desc,main_rule').eq('code', CFG_KEY).eq('is_outing', false).maybeSingle();
        if (res.error && res.error.code !== 'PGRST116') throw res.error;
        const fromDb = parseDbBase231(res.data?.job_desc) ?? parseDbBase231(res.data?.main_rule);
        if (fromDb) setBaseSlotCount231(fromDb);
      }
    } catch (err) {
      console.warn(`${VERSION}: base slot load skipped`, err);
    } finally {
      state.baseSlotCountLoadedV231 = true;
    }
    return getBaseSlotCount231();
  }
  async function saveBaseSlotCount231(n){
    const val = setBaseSlotCount231(n);
    if (!(typeof isAdmin === 'function' && isAdmin())) throw new Error('เฉพาะ Admin เท่านั้น');
    if (!(typeof sb !== 'undefined' && sb)) throw new Error('ไม่พบ Supabase client');
    const payload = {
      code: CFG_KEY,
      eligibility_code: null,
      zone: 'SYSTEM',
      break_time: '-',
      main_rule: 'MAIN_DAY_SLOT_COUNT',
      job_desc: JSON.stringify({ base_slot_count: val, updated_at: new Date().toISOString() }),
      is_outing: false,
      is_active: false,
      sort_order: 99010,
      deleted_at: null,
      updated_by: currentStaff231()
    };
    const res = await sb.from('daily_position_masters').upsert(payload, { onConflict: 'code,is_outing' });
    if (res.error) throw res.error;
    state.baseSlotCountLoadedV231 = true;
    return val;
  }

  function fixMenuLabels231(){
    try {
      if (Array.isArray(NAV_ITEMS)) {
        const sched = NAV_ITEMS.find(x => x.id === 'scheduler');
        if (sched) {
          sched.title = 'จัดตารางเวรประจำเดือน';
          sched.subtitle = 'สร้าง/ตรวจทานตารางเวรประจำเดือน';
        }
        const pm = NAV_ITEMS.find(x => x.id === 'positionMonth');
        if (pm) {
          pm.title = 'จัดตารางตำแหน่งกลางวัน รายเดือน';
          pm.subtitle = 'Admin วางแผนตำแหน่งรายเดือนก่อนประกาศให้ Staff เห็น';
        }
      }
    } catch (err) { console.warn(`${VERSION}: menu label fix skipped`, err); }
  }
  function fixTopbarTitle231(){
    try {
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      const content = document.getElementById('pageContent');
      const isMonthlyPosition = state?.page === 'positionMonth' || !!content?.querySelector?.('.monthly-position-page');

      if (state?.page === 'scheduler' && title) title.textContent = 'จัดตารางเวรประจำเดือน';
      if (state?.page === 'scheduler' && subtitle) subtitle.textContent = 'สร้าง/ตรวจทานตารางเวรประจำเดือน';
      if (isMonthlyPosition && title && title.textContent.trim() === 'จัดตารางเวร') title.textContent = 'จัดตารางตำแหน่งกลางวัน รายเดือน';
      if (state?.page === 'positionMonth' && title) title.textContent = 'จัดตารางตำแหน่งกลางวัน รายเดือน';
      if (state?.page === 'positionMonth' && subtitle) subtitle.textContent = 'สร้าง/ตรวจทานแผนตำแหน่งรายเดือน';
    } catch (_) {}
  }
  fixMenuLabels231();

  function badgeSafe231(text, tone){
    try { return badge(text, tone); }
    catch (_) { return `<span class="badge ${esc231(tone || '')}">${esc231(text)}</span>`; }
  }

  function injectBaseSlotConfig231(){
    try {
      if (!state || state.page !== 'positionManagement') return;
      const toolbar = document.querySelector('.v224-template-toolbar');
      if (!toolbar) return;
      const current = getBaseSlotCount231();
      const existing = document.getElementById('slotBaseCountV231');
      if (existing) { existing.value = String(current); return; }
      const options = SLOT_SET_LIST.map(n => `<option value="${n}" ${n===current?'selected':''}>${n} คน</option>`).join('');
      toolbar.insertAdjacentHTML('afterbegin', `<div class="v231-base-slot-box">
        <label>จำนวน Slot หลัก <select id="slotBaseCountV231" data-v231-base-slot>${options}</select></label>
        <button type="button" class="primary-btn" data-v231-save-base-slot>บันทึกจำนวนหลัก</button>
        <div class="hint">ใช้เป็นฐานของ Auto Assign รายเดือน: ถ้ามีคนลาทั้งสัปดาห์ ระบบจะลด Slot เฉพาะสัปดาห์นั้นอัตโนมัติ</div>
      </div>`);
    } catch (err) { console.warn(`${VERSION}: inject base slot failed`, err); }
  }

  // ----- Monthly position planning logic -----
  function normalizeZone231(zone){
    const z = String(zone || '').trim();
    return z === 'Manual' ? 'Blood Bank' : (z || 'Blood Bank');
  }
  function normalizeTemplate231(p){
    if (!p) return null;
    return { ...p, zone: normalizeZone231(p.zone) };
  }
  function cloneTemplates231(list){ return (list || []).map(p => normalizeTemplate231({ ...p })).filter(Boolean); }
  function slotBucket231(count){
    const n = Number(count || 0);
    if (n <= 8) return 8;
    if (n >= 14) return 14;
    return Math.max(8, Math.min(14, Math.round(n)));
  }
  function safeMonthNow231(){
    try { return monthKey(new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 7); }
  }
  function daySlotSets231(){ return window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || null; }
  function daySlotsForCount231(count){
    const sets = daySlotSets231();
    const bucket = slotBucket231(count);
    if (sets?.[bucket]) return cloneTemplates231(sets[bucket]);
    try {
      const list = (window.cnmiPositionCatalogV182?.normalPositions182?.() || []).filter(p => p.zone !== 'ออกหน่วย');
      return cloneTemplates231(list).slice(0, bucket);
    } catch (_) { return []; }
  }
  function allDaySlots231(){
    const sets = daySlotSets231();
    if (sets) {
      const map = new Map();
      SLOT_SET_LIST.forEach(n => (sets[n] || []).forEach(p => { if (p?.code && !map.has(p.code)) map.set(p.code, normalizeTemplate231(p)); }));
      return Array.from(map.values());
    }
    try { return cloneTemplates231(window.cnmiPositionCatalogV182?.normalPositions182?.() || []); } catch (_) { return []; }
  }
  function outingTemplates231(count){
    const bucket = slotBucket231(count || getBaseSlotCount231());
    const mark = (list, forceOuting=false) => cloneTemplates231(list).map(p => {
      const z = forceOuting ? 'ออกหน่วย' : normalizeZone231(p.zone || 'ออกหน่วย');
      return { ...p, zone:z, is_outing:(z === 'ออกหน่วย') || p.is_outing === true };
    });
    try {
      const fromV232 = window.cnmiDayPositionSlotsV218?.outingSlotsV232?.(bucket);
      if (Array.isArray(fromV232) && fromV232.length) return mark(fromV232, false);
    } catch (_) {}
    try {
      const outingFromV224 = window.cnmiDayPositionSlotsV218?.outingSlotsV224?.();
      if (Array.isArray(outingFromV224) && outingFromV224.length) return mark(outingFromV224, false);
    } catch (_) {}
    try {
      const fromCatalog = window.cnmiPositionCatalogV182?.outingPositions182?.();
      if (Array.isArray(fromCatalog) && fromCatalog.length) return mark(fromCatalog, true);
    } catch (_) {}
    try { return mark(OUTING_POSITIONS || [], true); } catch (_) { return []; }
  }
  function splitOutingTemplates231(date){
    const bucket = weekSlotCount231(date);
    const list = outingTemplates231(bucket);
    const hasRoomSlots = list.some(p => normalizeZone231(p.zone) !== 'ออกหน่วย');
    if (hasRoomSlots) {
      return {
        roomSlots:list.filter(p => normalizeZone231(p.zone) !== 'ออกหน่วย'),
        outingSlots:list.filter(p => normalizeZone231(p.zone) === 'ออกหน่วย'),
        full:list
      };
    }
    const roomSlots = daySlotsForCount231(bucket).filter(p => normalizeZone231(p.zone) === 'Blood Bank');
    return { roomSlots, outingSlots:list, full:[...roomSlots, ...list] };
  }
  function positionTemplateByCode231(code, date){
    const base = String(typeof positionBaseCode === 'function' ? positionBaseCode(code) : code || '').trim();
    if (!base) return null;
    const outingCount = date && hasOuting(normDate231(date)) ? weekSlotCount231(normDate231(date)) : 14;
    const list = [...daySlotsForCount231(14), ...allDaySlots231(), ...outingTemplates231(outingCount), ...outingTemplates231(12), ...outingTemplates231(13), ...outingTemplates231(14)];
    const found = list.find(p => p.code === base || p.eligibility_code === base);
    if (found) return normalizeTemplate231(found);
    try { return normalizeTemplate231(positionTemplateByCode(code, date)); } catch (_) { return null; }
  }
  function positionLoadWeight231(code){
    try { return positionLoadWeight(code); } catch (_) { return 1; }
  }
  function monthPositionScore231(staff, position, counts, rows, date){
    try { return monthPositionCandidateScore(staff, position, counts, rows, date); }
    catch (_) {
      const c = counts[String(staff?.id || '')] || { total:0, byCode:{}, byZone:{}, load:0 };
      const code = String(position?.code || position?.position_code || '');
      const zone = normalizeZone231(position?.zone || '');
      return ((c.byCode?.[code] || 0) * 120) + ((c.byZone?.[zone] || 0) * 35) + ((c.total || 0) * 18) + ((c.load || 0) * 12);
    }
  }
  function monthlyCandidateOk231(staff, position){
    if (!staff || !position) return false;
    try {
      const eligibilityKey = position.eligibility_code || position.code || position.position_code;
      return isDailyPositionEnabled(staff)
        && positionRuleOk(staff, position.main_rule)
        && positionEligible(staff, eligibilityKey);
    } catch (_) { return false; }
  }
  function leaveText231(row){
    try { return leaveDisplayType(row); }
    catch (_) { return String(row?.type || row?.leave_type || 'ลาอื่นๆ').split(':::')[0].trim(); }
  }
  function activeLeaveRow231(staffId, date){
    try { return activeLeaveRecordOn(staffId, date); }
    catch (_) { return null; }
  }
  function activeLeaveIndex231(dates){
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
  function monthDates231(key){
    const r = getMonthRange(key);
    const last = r.last || new Date(r.y, r.m, 0).getDate();
    return Array.from({ length:last }, (_, i) => `${r.y}-${pad(r.m)}-${pad(i + 1)}`);
  }
  function positionWorkDates231(key){ return monthDates231(key).filter(d => !isNoPositionDay(d)); }
  function weekWorkDateMap231(key){
    const map = new Map();
    positionWorkDates231(key).forEach(d => {
      const wk = weekKeyOf(d);
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(d);
    });
    return map;
  }
  function weekDatesForDate231(date){
    const key = String(normDate231(date)).slice(0, 7);
    const wk = weekKeyOf(date);
    return weekWorkDateMap231(key).get(wk) || [];
  }
  function isFullWeekUnavailable231(staffId, weekDates){
    const dates = (weekDates || []).filter(d => !isNoPositionDay(d));
    if (!dates.length) return false;
    return dates.every(d => !!activeLeaveRow231(staffId, d));
  }
  function positionEnabledStaff231(){
    return (state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s); }
      catch (_) { return s?.id && s?.is_active !== false && s?.active !== false; }
    });
  }
  function fullWeekUnavailableCount231(date){
    const weekDates = weekDatesForDate231(date);
    return positionEnabledStaff231().filter(s => {
      try { return isFullWeekUnavailable231(s.id, weekDates); } catch (_) { return false; }
    }).length;
  }
  function weeklyAvailableStaff231(date){
    const weekDates = weekDatesForDate231(date);
    return orderedStaff(positionEnabledStaff231().filter(s => {
      try { return !isFullWeekUnavailable231(s.id, weekDates); } catch (_) { return true; }
    }));
  }
  function weekSlotCount231(date){
    const base = getBaseSlotCount231();
    const fullOut = fullWeekUnavailableCount231(date);
    const available = weeklyAvailableStaff231(date).length;
    const desired = Math.max(8, base - fullOut);
    return slotBucket231(Math.min(desired, available || desired));
  }
  function expectedTemplatesForDate231(date){
    const d = normDate231(date);
    if (!d || isNoPositionDay(d)) return [];
    const weekSlotCount = weekSlotCount231(d);
    if (hasOuting(d)) {
      return splitOutingTemplates231(d).full;
    }
    return daySlotsForCount231(weekSlotCount);
  }
  function addCount231(counts, staffId, code, zone){
    if (!staffId || !code) return;
    const sid = String(staffId);
    const base = String(typeof positionBaseCode === 'function' ? positionBaseCode(code) : code || '').trim();
    const z = normalizeZone231(zone || positionTemplateByCode231(base)?.zone || 'Blood Bank');
    counts[sid] = counts[sid] || { total:0, byCode:{}, byZone:{}, load:0 };
    counts[sid].total += 1;
    counts[sid].byCode[base] = (counts[sid].byCode[base] || 0) + 1;
    counts[sid].byZone[z] = (counts[sid].byZone[z] || 0) + 1;
    counts[sid].load = (counts[sid].load || 0) + positionLoadWeight231(base);
  }
  function seedFiscalCounts231(key, counts){
    let start = `${key.slice(0,4)}-01-01`, end = `${key.slice(0,4)}-12-31`;
    try {
      const fy = fiscalYearCE(`${key}-01`);
      const range = fiscalYearRangeCE(fy);
      start = range.start; end = range.end;
    } catch (_) {}
    (state.positions || []).forEach(r => {
      const d = normDate231(r?.work_date);
      if (!d || d.startsWith(key) || d < start || d > end || isNoPositionDay(d)) return;
      if (!r?.staff_id || !r?.position_code || r.position_code === 'รอตรวจสอบ') return;
      addCount231(counts, r.staff_id, r.position_code, r.zone);
    });
  }
  function chooseForPosition231(position, date, pool, used, counts, rows){
    const candidates = (pool || []).filter(st => !used.has(String(st.id)) && monthlyCandidateOk231(st, position));
    candidates.sort((a,b) => monthPositionScore231(a, position, counts, rows, date) - monthPositionScore231(b, position, counts, rows, date) || compareStaffOrder(a,b));
    return candidates[0] || null;
  }
  function choosePositionForStaff231(staff, date, templates, counts, rows, preferBloodBank){
    const usable = (templates || []).filter(p => monthlyCandidateOk231(staff, p));
    if (!usable.length) return null;
    usable.sort((a,b) => {
      if (preferBloodBank) {
        const za = normalizeZone231(a.zone) === 'Blood Bank' ? 0 : 1;
        const zb = normalizeZone231(b.zone) === 'Blood Bank' ? 0 : 1;
        if (za !== zb) return za - zb;
      }
      return monthPositionScore231(staff, a, counts, rows, date) - monthPositionScore231(staff, b, counts, rows, date) || String(a.code || '').localeCompare(String(b.code || ''), 'th');
    });
    return usable[0];
  }
  function makeRow231(staff, date, position, serialMap){
    const p = normalizeTemplate231(position);
    const row = rowForStaffPosition(staff, date, p, serialMap);
    row.zone = normalizeZone231(row.zone || p.zone);
    return row;
  }
  function reviewRow231(staff, date, reason){
    const row = reviewRowForStaff(staff, date, reason);
    row.zone = 'รอตรวจสอบ';
    return row;
  }
  function addPlannedRow231(rows, counts, serialMap, staff, date, position){
    if (!staff || !position) return;
    const row = makeRow231(staff, date, position, serialMap);
    rows.push(row);
    addCount231(counts, staff.id, row.position_code, row.zone);
  }
  function buildNormalWeekAssignment231(weekDates, weekStaff, counts, rows, serialMap){
    const firstDate = weekDates[0];
    const templates = daySlotsForCount231(weekSlotCount231(firstDate));
    const used = new Set();
    const assignments = [];
    const unfilledTemplates = [];
    templates.forEach(p => {
      const st = chooseForPosition231(p, firstDate, weekStaff, used, counts, rows);
      if (st) { used.add(String(st.id)); assignments.push({ staff:st, position:p }); }
      else unfilledTemplates.push(p);
    });
    const remaining = weekStaff.filter(st => !used.has(String(st.id)));
    remaining.forEach(st => {
      const available = unfilledTemplates.filter(p => monthlyCandidateOk231(st, p));
      const p = choosePositionForStaff231(st, firstDate, available, counts, rows, false);
      if (p) {
        used.add(String(st.id));
        assignments.push({ staff:st, position:p });
        const idx = unfilledTemplates.findIndex(x => x.code === p.code);
        if (idx >= 0) unfilledTemplates.splice(idx, 1);
      } else {
        assignments.push({ staff:st, review:true, reason:'จำนวนคนมากกว่า Slot หลัก หรือสิทธิ์ไม่ตรงกับชุด Slot ของสัปดาห์นี้' });
      }
    });
    return assignments;
  }
  function addOutingDayRows231(date, weekStaff, rows, counts, serialMap){
    const used = new Set();
    const participantIds = new Set((typeof outingParticipants === 'function' ? outingParticipants(date) : []).map(String));
    const outingPool = weekStaff.filter(st => participantIds.has(String(st.id)));
    const roomPool = weekStaff.filter(st => !participantIds.has(String(st.id)));
    const split = splitOutingTemplates231(date);
    split.outingSlots.forEach(p => {
      const st = chooseForPosition231(p, date, outingPool, used, counts, rows);
      if (st) { used.add(String(st.id)); addPlannedRow231(rows, counts, serialMap, st, date, p); }
    });
    split.roomSlots.forEach(p => {
      const st = chooseForPosition231(p, date, roomPool, used, counts, rows);
      if (st) { used.add(String(st.id)); addPlannedRow231(rows, counts, serialMap, st, date, p); }
    });
    roomPool.filter(st => !used.has(String(st.id))).forEach(st => rows.push(reviewRow231(st, date, 'คนอยู่ห้องมากกว่า Slot Blood Bank ในวันออกหน่วย')));
    outingPool.filter(st => !used.has(String(st.id))).forEach(st => rows.push(reviewRow231(st, date, 'คนออกหน่วยมากกว่า Slot ออกหน่วย')));
  }

  window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV231(key){
    const selectedMonth = String(key || state.positionMonthKey || state.monthKey || safeMonthNow231()).slice(0, 7);
    const rows = [];
    const counts = {};
    const serialMap = {};
    seedFiscalCounts231(selectedMonth, counts);
    const weekMap = weekWorkDateMap231(selectedMonth);
    Array.from(weekMap.entries()).sort((a,b) => a[1][0].localeCompare(b[1][0])).forEach(([, weekDates]) => {
      const weekStaff = weeklyAvailableStaff231(weekDates[0]);
      if (!weekStaff.length) return;
      const normalDates = weekDates.filter(d => !hasOuting(d));
      const normalAssignments = normalDates.length ? buildNormalWeekAssignment231(normalDates, weekStaff, counts, rows, serialMap) : [];
      weekDates.forEach(date => {
        if (hasOuting(date)) {
          addOutingDayRows231(date, weekStaff, rows, counts, serialMap);
          return;
        }
        normalAssignments.forEach(item => {
          if (item.review) rows.push(reviewRow231(item.staff, date, item.reason));
          else addPlannedRow231(rows, counts, serialMap, item.staff, date, item.position);
        });
      });
    });
    return { monthKey:selectedMonth, rows, autoPlanV231:true, baseSlotCount:getBaseSlotCount231() };
  };

  window.monthPositionRoleOptionsForDate = monthPositionRoleOptionsForDate = function monthPositionRoleOptionsForDateV231(date, currentCode=''){
    const d = normDate231(date);
    if (!d || isNoPositionDay(d)) return [];
    let allowed = expectedTemplatesForDate231(d);
    const current = String(currentCode || '').trim();
    if (current && !allowed.some(p => p.code === current)) {
      const row = positionTemplateByCode231(current, d);
      if (row?.code) allowed.push(row);
    }
    const seen = new Set();
    return allowed.filter(p => p?.code && !seen.has(p.code) && seen.add(p.code));
  };

  window.makeMonthPositionRow = makeMonthPositionRow = function makeMonthPositionRowV231(date, staffId, code){
    const d = normDate231(date);
    const base = positionTemplateByCode231(code, d) || {};
    return { work_date:d, position_code:String(code || '').trim(), zone:normalizeZone231(base.zone || 'Blood Bank'), break_time:base.break_time || '-', main_rule:base.main_rule || '', job_desc:base.job_desc || '', staff_id:staffId, updated_by:currentStaff231() };
  };

  window.positionZoneForCode = positionZoneForCode = function positionZoneForCodeV231(code, fallback=''){
    return normalizeZone231(positionTemplateByCode231(code)?.zone || fallback || 'Blood Bank');
  };

  function renderCountCell231(date, assignedStaffByDate){
    const d = normDate231(date);
    if (isNoPositionDay(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const available = weeklyAvailableStaff231(d).length;
    const slots = expectedTemplatesForDate231(d).length;
    const assigned = assignedStaffByDate.get(d)?.size || 0;
    const fullWeekOut = fullWeekUnavailableCount231(d);
    const base = getBaseSlotCount231();
    const tone = assigned >= Math.min(available, slots) ? 'complete' : 'has-missing';
    const title = fullWeekOut ? `Slot หลัก ${base} คน และมีคนลาทั้งสัปดาห์ ${fullWeekOut} คน จึงลด Slot สัปดาห์นี้` : `Slot หลัก ${base} คน`;
    return `<th class="count-role-cell ${tone}" title="${esc231(title)}"><b>${esc231(available)}/${esc231(slots)}</b><br><small>คน/Slot • ฐาน ${esc231(base)}${fullWeekOut ? ` • ลด ${esc231(fullWeekOut)}` : ''}</small></th>`;
  }
  function renderMissingCell231(date, assignedByDate){
    const d = normDate231(date);
    if (isNoPositionDay(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const assigned = assignedByDate.get(d) || new Set();
    const expected = expectedTemplatesForDate231(d);
    const missing = expected.filter(p => !assigned.has(p.code));
    const bucket = weekSlotCount231(d);
    if (!missing.length) return `<th class="missing-role-cell complete">ครบ<br><small>ชุด ${bucket}</small></th>`;
    return `<th class="missing-role-cell has-missing" title="ชุด ${bucket} คน">${missing.map(p => `<span>${esc231(p.code)}</span>`).join('')}<small>ชุด ${bucket}</small></th>`;
  }
  function renderMonthCell231(staff, date, cellRows, canEdit, leaveIndex){
    const d = normDate231(date);
    if (isWeekend(d) || isHolidayDate(d)) return `<td class="matrix-cell no-position-day ${isHolidayDate(d) ? 'holiday-cell' : 'weekend-cell'}"><span>${isHolidayDate(d) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
    const leaveRow = leaveIndex.get(`${String(staff?.id || '')}|${d}`) || null;
    const leaveText = leaveRow ? leaveText231(leaveRow) : '';
    const hasLeave = !!leaveRow;
    const row = (cellRows || [])[0] || null;
    const cleanCodes = (cellRows || []).map(r => String(r?.position_code || r?.code || '').trim()).filter(Boolean).filter(c => c !== 'รอตรวจสอบ');
    const cls = `${hasOuting(d) ? 'outing-cell' : ''} ${hasLeave ? 'leave-cell ' + leaveCellClass(leaveText) : ''} ${!cleanCodes.length && !hasLeave ? 'needs-review-cell' : ''}`.trim();
    const leaveMark = hasLeave ? `<small class="leave-note-v228">${esc231(leaveText)}</small>` : '';
    if (canEdit) {
      const current = row?.position_code || '';
      const options = monthPositionRoleOptionsForDate(d, current);
      return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc231(d)}|${esc231(staff?.id || '')}"><option value="">${hasLeave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${options.map(t => `<option value="${esc231(t.code)}" ${current===t.code?'selected':''}>${esc231(t.code)}</option>`).join('')}</select>${leaveMark}${hasOuting(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    }
    const text = cleanCodes.length ? cleanCodes.join(' / ') : (hasLeave ? leaveText : '');
    const safeText = esc231(text);
    return `<td class="matrix-cell ${cls}">${safeText ? `<span title="${safeText}${hasLeave && cleanCodes.length ? ' • ' + esc231(leaveText) : ''}">${safeText}</span>` : ''}${leaveMark}${hasOuting(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
  }

  window.renderMonthPositionMatrix = renderMonthPositionMatrix = function renderMonthPositionMatrixV231(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) ? dates : [];
    if (!rows.length) return empty('ยังไม่มีแผนรายเดือน กด “สร้างตารางตั้งต้นเปล่า” หรือ “สร้างแผนรายสัปดาห์ทั้งเดือน” ก่อน');
    const byCell = Object.create(null);
    const assignedByDate = new Map();
    const assignedStaffByDate = new Map();
    rows.forEach((r, idx) => {
      const sid = String(r?.staff_id || '');
      const d = normDate231(r?.work_date);
      if (!sid || !d) return;
      const row = { ...r, zone:normalizeZone231(r.zone), _idx:idx };
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
    const leaveIndex = activeLeaveIndex231(dates);
    const heads = dates.map(date => {
      const d = parseDate(date);
      const cls = isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOuting(date) ? 'outing-head' : '';
      return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('');
    const countRow = dates.map(date => renderCountCell231(date, assignedStaffByDate)).join('');
    const missing = dates.map(date => renderMissingCell231(date, assignedByDate)).join('');
    return `<div class="monthly-matrix-wrap v182-position-matrix v218-position-matrix v228-position-matrix v231-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="legend-box leave"></span> Slot หลัก ${esc231(getBaseSlotCount231())} คน • คนลาเฉพาะบางวันยังคงตำแหน่งประจำสัปดาห์ / ถ้าลาทั้งสัปดาห์จะลด Slot สัปดาห์นั้น ${canEdit ? '<span class="hint">Admin เลือกตำแหน่งในช่องได้ แม้วันนั้นมีลา แล้วกดบันทึกแผนทั้งเดือน</span>' : ''}</div><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countRow}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missing}</tr></thead><tbody>${displayStaff.map(st => { const bg = staffColor(st); const fg = textColorFor(bg); return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc231(bg)};color:${esc231(fg)}"><div class="matrix-staff-name"><b>${esc231(st.nickname || st.full_name || '-')}</b><small>${esc231(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc231(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell231(st, date, byCell[`${st.id}|${date}`] || [], canEdit, leaveIndex)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };

  const oldRenderPositionMonthPage231 = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage231) {
    window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV231(){
      let html = String(oldRenderPositionMonthPage231.apply(this, arguments) || '');
      const base = getBaseSlotCount231();
      html = html.replace(/จัดตำแหน่งรายเดือน/g, 'จัดตารางตำแหน่งกลางวัน รายเดือน');
      html = html.replace(/สร้างแผนทั้งเดือน/g, 'สร้างแผนรายสัปดาห์ทั้งเดือน');
      html = html.replace(/วันปกติ(?:ชุด)?\s*\d+\s*Slot/g, `Slot หลัก ${base} คน`);
      if (!html.includes('v231-base-slot-badge')) {
        html = html.replace(/(<span class="v224-mini-badges">)/, `$1<span class="v231-base-slot-badge">${badgeSafe231(`Slot หลัก ${base} คน`, 'blue')}</span> `);
      }
      return html;
    };
  }

  const oldRenderPage231 = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage231) {
    window.renderPage = renderPage = function renderPageV231(){
      fixMenuLabels231();
      const out = oldRenderPage231.apply(this, arguments);
      setTimeout(() => { fixTopbarTitle231(); injectBaseSlotConfig231(); }, 0);
      setTimeout(() => { fixTopbarTitle231(); injectBaseSlotConfig231(); }, 80);
      return out;
    };
  }

  document.addEventListener('change', function(e){
    const sel = e.target?.closest?.('[data-v231-base-slot]');
    if (!sel) return;
    const val = setBaseSlotCount231(sel.value);
    try { window.cnmiV224?.applyConfigsToRuntime?.(); } catch (_) {}
    safeToast231(`ตั้งจำนวน Slot หลักในหน้านี้เป็น ${val} คนแล้ว กด “บันทึกจำนวนหลัก” เพื่อเก็บเป็นค่าถาวร`);
  }, true);

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-v231-save-base-slot]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const val = document.getElementById('slotBaseCountV231')?.value || getBaseSlotCount231();
    (async () => {
      try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกจำนวน Slot หลัก'); } catch (_) {}
      try {
        const saved = await saveBaseSlotCount231(val);
        safeToast231(`บันทึกจำนวน Slot หลัก ${saved} คนแล้ว`);
        injectBaseSlotConfig231();
      } catch (err) {
        console.error(`${VERSION}: save base slot failed`, err);
        safeToast231('บันทึกจำนวน Slot หลักไม่สำเร็จ: ' + friendly231(err), 'error');
      } finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
    })();
  }, true);

  const observerTarget231 = () => document.getElementById('pageContent');
  setTimeout(() => {
    const target = observerTarget231();
    if (target && window.MutationObserver) {
      const mo = new MutationObserver(() => { fixTopbarTitle231(); injectBaseSlotConfig231(); });
      mo.observe(target, { childList:true, subtree:false });
    }
    fixTopbarTitle231();
    injectBaseSlotConfig231();
  }, 250);

  setTimeout(async () => {
    await loadBaseSlotCount231(false);
    fixMenuLabels231();
    try { if (typeof renderNav === 'function') renderNav(); } catch (_) {}
    try {
      if (['positionManagement','positionMonth'].includes(String(state?.page || '')) && typeof renderPage === 'function') renderPage();
    } catch (_) {}
    fixTopbarTitle231();
    injectBaseSlotConfig231();
  }, 120);

  const style = document.createElement('style');
  style.textContent = `
    .v231-base-slot-box{display:flex;gap:10px;align-items:end;flex-wrap:wrap;width:100%;padding:10px 12px;margin:0 0 4px;background:#eef8ff;border:1px solid #bfdbfe;border-radius:16px}
    .v231-base-slot-box label{min-width:180px}.v231-base-slot-box .hint{flex:1 1 320px;margin:0;color:#64748b;font-size:12px;line-height:1.45}.v231-base-slot-badge{display:inline-flex;margin-right:4px}.v231-position-matrix .count-role-cell small,.v231-position-matrix .missing-role-cell small{display:block;font-size:10px;line-height:1.2;margin-top:2px;color:#64748b}
    @media(max-width:760px){.v231-base-slot-box>*{width:100%}.v231-base-slot-box button{width:100%}.v231-base-slot-box .hint{flex-basis:100%}}
  `;
  document.head.appendChild(style);

  window.cnmiV231 = { getBaseSlotCount231, setBaseSlotCount231, loadBaseSlotCount231, saveBaseSlotCount231, weekSlotCount231, weeklyAvailableStaff231, expectedTemplatesForDate231 };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v231-main-slot-weekly-leave-config.js", error); }
;

/* Original source: patch-v232-default-slot-templates.js */
try {
/* =========================
   V240 Default Slot Templates
   - Adds CNMI latest default slot templates for 8-14 normal staff sets.
   - Adds outing templates for 12/13/14 people.
   - Lets Admin restore/save all templates in one click instead of retyping after updates.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V240_DEFAULT_SLOT_TEMPLATES_OUTING_COUNT_FIX';
  if (window.__CNMI_V240_DEFAULT_SLOT_TEMPLATES__) return;
  window.__CNMI_V240_DEFAULT_SLOT_TEMPLATES__ = true;

  const CFG_PREFIX = '__CNMI_SLOT_TEMPLATE_V224__';
  const LS_KEY = 'cnmi_slot_template_v224_cache';
  const SEED_KEY = 'cnmi_slot_template_v240_seeded_once';
  const DAY_SETS = [8,9,10,11,12,13,14];
  const DEFAULT_CONFIGS_232 = {
  "day": {
    "8": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual",
        "position_code": "BB-Manual",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 3,
        "eligibility_code": "BB-Manual",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB  (เช้า-เย็น)",
        "sort_order": 4,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 6,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 7,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 8,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "9": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual",
        "position_code": "BB-Manual",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 3,
        "eligibility_code": "BB-Manual",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 4,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 6,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 7,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 8,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 9,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "10": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual",
        "position_code": "BB-Manual",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 4,
        "eligibility_code": "BB-Manual",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 7,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 8,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 9,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 10,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "11": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 8,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 9,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 10,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 11,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "12": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 8,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 9,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 10,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 11,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 12,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "13": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 3",
        "position_code": "BB-Manual 3",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "วัดค่า pH & Adam, การปั่นแยกส่วนประกอบโลหิต, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 6,
        "eligibility_code": "BB-Manual 3",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 8,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 9,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 10,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 11,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 12,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 13,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "14": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 3",
        "position_code": "BB-Manual 3",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "วัดค่า pH & Adam, การปั่นแยกส่วนประกอบโลหิต, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 6,
        "eligibility_code": "BB-Manual 3",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 8,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 9,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 10,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 11,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 12,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด",
        "sort_order": 13,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Preparing",
        "position_code": "DR-Preparing",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 14,
        "eligibility_code": "DR-Preparing",
        "is_outing": false,
        "is_active": true
      }
    ]
  },
  "outing": [
    {
      "code": "BB-Report 1",
      "position_code": "BB-Report 1",
      "zone": "Blood Bank",
      "main_rule": "MT เท่านั้น",
      "break_time": "11:00",
      "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
      "sort_order": 1,
      "eligibility_code": "OUTING:BB-Report 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Report 2",
      "position_code": "BB-Report 2",
      "zone": "Blood Bank",
      "main_rule": "MT เท่านั้น",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
      "sort_order": 2,
      "eligibility_code": "OUTING:BB-Report 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Approve",
      "position_code": "BB-Approve",
      "zone": "Blood Bank",
      "main_rule": "MT เท่านั้น",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
      "sort_order": 3,
      "eligibility_code": "OUTING:BB-Approve",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Manual 1",
      "position_code": "BB-Manual 1",
      "zone": "Manual",
      "main_rule": "MT เท่านั้น",
      "break_time": "11:00",
      "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
      "sort_order": 4,
      "eligibility_code": "OUTING:BB-Manual 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Manual 2",
      "position_code": "BB-Manual 2",
      "zone": "Manual",
      "main_rule": "MT เท่านั้น",
      "break_time": "11:00",
      "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
      "sort_order": 5,
      "eligibility_code": "OUTING:BB-Manual 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Support",
      "position_code": "BB-Support",
      "zone": "Blood Bank",
      "main_rule": "Clerk หรือ แตง",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
      "sort_order": 6,
      "eligibility_code": "OUTING:BB-Support",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Register",
      "position_code": "DR-Register",
      "zone": "ออกหน่วย",
      "main_rule": "Clerk หรือ แตง",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
      "sort_order": 7,
      "eligibility_code": "OUTING:DR-Register",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Preparation",
      "position_code": "DR-Preparation",
      "zone": "ออกหน่วย",
      "main_rule": "มัส",
      "break_time": "12:00",
      "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
      "sort_order": 8,
      "eligibility_code": "OUTING:DR-Preparation",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Finger+Interview 1",
      "position_code": "DR-Finger+Interview 1",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
      "sort_order": 9,
      "eligibility_code": "OUTING:DR-Finger+Interview 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Finger+Interview 2",
      "position_code": "DR-Finger+Interview 2",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
      "sort_order": 10,
      "eligibility_code": "OUTING:DR-Finger+Interview 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Main 1",
      "position_code": "DR-Main 1",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
      "sort_order": 11,
      "eligibility_code": "OUTING:DR-Main 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Main 2",
      "position_code": "DR-Main 2",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
      "sort_order": 12,
      "eligibility_code": "OUTING:DR-Main 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Main 3",
      "position_code": "DR-Main 3",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
      "sort_order": 13,
      "eligibility_code": "OUTING:DR-Main 3",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Support",
      "position_code": "DR-Support",
      "zone": "ออกหน่วย",
      "main_rule": "Clerk",
      "break_time": "12:00",
      "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
      "sort_order": 14,
      "eligibility_code": "OUTING:DR-Support",
      "is_outing": true,
      "is_active": true
    }
  ],
  "outing_by_count": {
    "12": [
      {
        "code": "BB-Report",
        "position_code": "BB-Report",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "OUTING:BB-Report",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "OUTING:BB-Approve",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
        "sort_order": 3,
        "eligibility_code": "OUTING:BB-Manual 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
        "sort_order": 4,
        "eligibility_code": "OUTING:BB-Manual 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "OUTING:BB-Support",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "OUTING:DR-Register",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Preparation",
        "position_code": "DR-Preparation",
        "zone": "ออกหน่วย",
        "main_rule": "มัส",
        "break_time": "12:00",
        "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
        "sort_order": 7,
        "eligibility_code": "OUTING:DR-Preparation",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 1",
        "position_code": "DR-Finger+Interview 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 8,
        "eligibility_code": "OUTING:DR-Finger+Interview 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 2",
        "position_code": "DR-Finger+Interview 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 9,
        "eligibility_code": "OUTING:DR-Finger+Interview 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 1",
        "position_code": "DR-Main 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 10,
        "eligibility_code": "OUTING:DR-Main 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 2",
        "position_code": "DR-Main 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 11,
        "eligibility_code": "OUTING:DR-Main 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Support",
        "position_code": "DR-Support",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk",
        "break_time": "12:00",
        "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
        "sort_order": 12,
        "eligibility_code": "OUTING:DR-Support",
        "is_outing": true,
        "is_active": true
      }
    ],
    "13": [
      {
        "code": "BB-Report",
        "position_code": "BB-Report",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "OUTING:BB-Report",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "OUTING:BB-Approve",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
        "sort_order": 3,
        "eligibility_code": "OUTING:BB-Manual 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
        "sort_order": 4,
        "eligibility_code": "OUTING:BB-Manual 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "OUTING:BB-Support",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "OUTING:DR-Register",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Preparation",
        "position_code": "DR-Preparation",
        "zone": "ออกหน่วย",
        "main_rule": "มัส",
        "break_time": "12:00",
        "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
        "sort_order": 7,
        "eligibility_code": "OUTING:DR-Preparation",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 1",
        "position_code": "DR-Finger+Interview 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 8,
        "eligibility_code": "OUTING:DR-Finger+Interview 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 2",
        "position_code": "DR-Finger+Interview 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 9,
        "eligibility_code": "OUTING:DR-Finger+Interview 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 1",
        "position_code": "DR-Main 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 10,
        "eligibility_code": "OUTING:DR-Main 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 2",
        "position_code": "DR-Main 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 11,
        "eligibility_code": "OUTING:DR-Main 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 3",
        "position_code": "DR-Main 3",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 12,
        "eligibility_code": "OUTING:DR-Main 3",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Support",
        "position_code": "DR-Support",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk",
        "break_time": "12:00",
        "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
        "sort_order": 13,
        "eligibility_code": "OUTING:DR-Support",
        "is_outing": true,
        "is_active": true
      }
    ],
    "14": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "OUTING:BB-Report 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "OUTING:BB-Report 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "OUTING:BB-Approve",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
        "sort_order": 4,
        "eligibility_code": "OUTING:BB-Manual 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
        "sort_order": 5,
        "eligibility_code": "OUTING:BB-Manual 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "OUTING:BB-Support",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "OUTING:DR-Register",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Preparation",
        "position_code": "DR-Preparation",
        "zone": "ออกหน่วย",
        "main_rule": "มัส",
        "break_time": "12:00",
        "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
        "sort_order": 8,
        "eligibility_code": "OUTING:DR-Preparation",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 1",
        "position_code": "DR-Finger+Interview 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 9,
        "eligibility_code": "OUTING:DR-Finger+Interview 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 2",
        "position_code": "DR-Finger+Interview 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 10,
        "eligibility_code": "OUTING:DR-Finger+Interview 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 1",
        "position_code": "DR-Main 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 11,
        "eligibility_code": "OUTING:DR-Main 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 2",
        "position_code": "DR-Main 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 12,
        "eligibility_code": "OUTING:DR-Main 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 3",
        "position_code": "DR-Main 3",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 13,
        "eligibility_code": "OUTING:DR-Main 3",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Support",
        "position_code": "DR-Support",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk",
        "break_time": "12:00",
        "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
        "sort_order": 14,
        "eligibility_code": "OUTING:DR-Support",
        "is_outing": true,
        "is_active": true
      }
    ]
  }
};

  function clone(x){ try { return JSON.parse(JSON.stringify(x || null)); } catch (_) { return x; } }
  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(msg, tone){ try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } }
  function friendly(err){ try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } }
  function currentStaffSafe(){ try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } }
  function cfgKey(kind, n){ return kind === 'outing' ? `${CFG_PREFIX}:OUTING` : `${CFG_PREFIX}:DAY:${Number(n)}`; }
  function normalizeRow(r, idx, isOutingSet){
    const code = String(r?.code || r?.position_code || '').trim();
    if (!code) return null;
    const zone = String(r?.zone || '').trim() || (isOutingSet ? 'ออกหน่วย' : 'Blood Bank');
    return {
      code,
      position_code:code,
      zone,
      main_rule:String(r?.main_rule || '').trim(),
      break_time:String(r?.break_time || '').trim() || '12:00',
      job_desc:String(r?.job_desc || r?.detail || '').trim(),
      sort_order:Number(r?.sort_order || idx + 1) || (idx + 1),
      eligibility_code:String(r?.eligibility_code || '').trim() || (zone === 'ออกหน่วย' ? `OUTING:${code}` : code),
      is_outing:!!isOutingSet || r?.is_outing === true,
      is_active:r?.is_active === false ? false : true
    };
  }
  function uniqueDaySlotCodes232(rows){
    const list = (rows || []).map(r => ({ ...r }));
    const totals = new Map();
    list.forEach(r => {
      const code = String(r?.code || r?.position_code || '').trim();
      if (code) totals.set(code, (totals.get(code) || 0) + 1);
    });
    const seen = new Map();
    return list.map(r => {
      const code = String(r?.code || r?.position_code || '').trim();
      if (!code || (totals.get(code) || 0) <= 1) return r;
      const no = (seen.get(code) || 0) + 1;
      seen.set(code, no);
      const uniqueCode = `${code} ${no}`;
      const currentEligibility = String(r?.eligibility_code || '').trim();
      return {
        ...r,
        code: uniqueCode,
        position_code: uniqueCode,
        eligibility_code: !currentEligibility || currentEligibility === code ? uniqueCode : currentEligibility,
        legacy_position_code: code
      };
    });
  }
  function normalizeConfig(configs){
    const src = configs || DEFAULT_CONFIGS_232;
    const out = { day:{}, outing:[], outing_by_count:{} };
    DAY_SETS.forEach(n => {
      const rows = (src.day?.[n] || src.day?.[String(n)] || []).map((r,i) => normalizeRow(r, i, false)).filter(Boolean);
      out.day[n] = uniqueDaySlotCodes232(rows);
    });
    out.outing = (src.outing || src.outing_by_count?.[14] || src.outing_by_count?.['14'] || []).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    out.outing_by_count[12] = (src.outing_by_count?.[12] || src.outing_by_count?.['12'] || out.outing).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    out.outing_by_count[13] = (src.outing_by_count?.[13] || src.outing_by_count?.['13'] || out.outing).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    out.outing_by_count[14] = (src.outing_by_count?.[14] || src.outing_by_count?.['14'] || out.outing).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    return out;
  }
  function defaultConfigs232(){ return normalizeConfig(clone(DEFAULT_CONFIGS_232)); }

  function v232SlotCodeSet(){
    const cfg = defaultConfigs232();
    const set = new Set();
    DAY_SETS.forEach(n => (cfg.day[n] || []).forEach(r => { if (r.code) set.add(String(r.code)); if (r.eligibility_code) set.add(String(r.eligibility_code)); }));
    (cfg.outing || []).forEach(r => { if (r.code) set.add(String(r.code)); if (r.eligibility_code) set.add(String(r.eligibility_code)); });
    Object.values(cfg.outing_by_count || {}).forEach(rows => (rows || []).forEach(r => { if (r.code) set.add(String(r.code)); if (r.eligibility_code) set.add(String(r.eligibility_code)); }));
    return set;
  }
  const V232_SLOT_CODE_SET = v232SlotCodeSet();
  const oldPositionEligible232 = window.positionEligible || (typeof positionEligible === 'function' ? positionEligible : null);
  const positionEligibleV232 = function positionEligibleV232(staff, positionCode){
    if (!staff || !positionCode) return false;
    const key = String(positionCode || '').trim();
    try {
      const rec = (state.positionEligibility || []).find(x => String(x.staff_id) === String(staff.id) && String(x.position_code) === key);
      if (rec) return !!rec.is_eligible;
      const hasAny = (state.positionEligibility || []).some(x => String(x.position_code) === key);
      if (!hasAny && V232_SLOT_CODE_SET.has(key)) return true;
    } catch (_) {}
    return oldPositionEligible232 ? oldPositionEligible232(staff, key) : true;
  };
  window.positionEligible = positionEligibleV232;
  try { positionEligible = positionEligibleV232; } catch (_) {}
  function slotState(){
    try {
      if (!window.state) return null;
      if (!state.slotTemplateV224) state.slotTemplateV224 = { kind:'day', setNo:14, configs:null, loaded:false, loading:false };
      return state.slotTemplateV224;
    } catch (_) { return null; }
  }
  function writeLocal232(configs){
    try { localStorage.setItem(LS_KEY, JSON.stringify(configs)); } catch (_) {}
    try { localStorage.setItem(SEED_KEY, new Date().toISOString()); } catch (_) {}
  }
  function applyRuntime232(configs){
    const cfg = normalizeConfig(configs || defaultConfigs232());
    try {
      const api = window.cnmiDayPositionSlotsV218 = window.cnmiDayPositionSlotsV218 || {};
      const target = api.DAY_POSITION_SLOT_SETS_218 || api.DAY_POSITION_SLOT_SETS || {};
      DAY_SETS.forEach(n => { target[n] = clone(cfg.day[n] || []); });
      api.DAY_POSITION_SLOT_SETS_218 = target;
      api.DAY_POSITION_SLOT_SETS = target;
      api.outingSlotsV232 = function(count){
        const raw = Number(count || 14);
        const n = raw <= 12 ? 12 : (raw <= 13 ? 13 : 14);
        return clone(cfg.outing_by_count?.[n] || cfg.outing_by_count?.[String(n)] || cfg.outing || []);
      };
      api.outingSlotsV224 = () => clone(cfg.outing || []);
      api.outingSlotsV226 = () => clone(cfg.outing || []);
    } catch (err) { console.warn(`${VERSION}: apply runtime failed`, err); }
    return cfg;
  }
  function installDefaults232(options){
    const cfg = defaultConfigs232();
    const st = slotState();
    if (st) { st.configs = clone(cfg); st.loaded = true; st.loading = false; }
    writeLocal232(cfg);
    applyRuntime232(cfg);
    if (!options?.silent) toast('โหลดรายละเอียดตำแหน่งล่าสุด V235 แล้ว');
    return cfg;
  }
  async function saveDefaults232(){
    const cfg = installDefaults232({ silent:true });
    if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
    const entries = [];
    DAY_SETS.forEach(n => entries.push({ key:cfgKey('day', n), rows:cfg.day[n] || [] }));
    entries.push({ key:cfgKey('outing'), rows:cfg.outing || [] });
    entries.push({ key:`${CFG_PREFIX}:OUTING:12`, rows:cfg.outing_by_count?.[12] || [] });
    entries.push({ key:`${CFG_PREFIX}:OUTING:13`, rows:cfg.outing_by_count?.[13] || [] });
    entries.push({ key:`${CFG_PREFIX}:OUTING:14`, rows:cfg.outing_by_count?.[14] || cfg.outing || [] });
    for (const ent of entries) {
      const payload = {
        code:ent.key,
        eligibility_code:null,
        zone:'SYSTEM',
        break_time:'-',
        main_rule:'SLOT_TEMPLATE_CONFIG',
        job_desc:JSON.stringify(ent.rows || []),
        is_outing:false,
        is_active:false,
        sort_order:99000,
        deleted_at:null,
        updated_by:currentStaffSafe()
      };
      const res = await sb.from('daily_position_masters').upsert(payload, { onConflict:'code,is_outing' });
      if (res.error) throw res.error;
    }
    try { await window.cnmiV224?.loadDbConfigs?.(true); } catch (_) {}
    installDefaults232({ silent:true });
    return cfg;
  }
  function shouldAutoSeed232(){
    // V260: ห้ามนำต้นแบบ V240 มาแทนฐานตำแหน่งปัจจุบันอัตโนมัติ
    // Supabase configuration rows are the source of truth after login.
    return false;
  }
  function injectButton232(){
    // V260: ซ่อนปุ่มคืนค่า V240 เพื่อป้องกันการกดทับฐานตำแหน่งปัจจุบันโดยไม่ตั้งใจ
    try {
      document.querySelectorAll('.v232-default-slot-actions').forEach(node => node.remove());
    } catch (_) {}
  }
  function renderAgain232(){
    try { if (state?.page === 'positionManagement' && typeof renderPage === 'function') renderPage(); } catch (_) {}
    setTimeout(injectButton232, 30);
  }

  document.addEventListener('click', function(e){
    const loadBtn = e.target?.closest?.('[data-v232-load-default-slots]');
    const saveBtn = e.target?.closest?.('[data-v232-save-default-slots]');
    if (!loadBtn && !saveBtn) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    (async()=>{
      try {
        if (saveBtn) {
          const ok = await confirmDialog('ยืนยันใช้รายละเอียดตำแหน่งล่าสุด V240 ตามไฟล์ที่มัสส่งมา และบันทึกทับฐาน Slot เดิมทั้งหมด?', 'ยืนยันบันทึก Slot');
          if (!ok) return;
          saveBtn.disabled = true;
          saveBtn.textContent = 'กำลังบันทึก...';
          await saveDefaults232();
          toast('บันทึกรายละเอียดตำแหน่งล่าสุด V240 ลงฐานข้อมูลแล้ว');
        } else {
          installDefaults232();
        }
        renderAgain232();
      } catch (err) {
        toast('ตั้งค่ารายละเอียดตำแหน่งล่าสุด V240 ไม่สำเร็จ: ' + friendly(err), 'error');
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'ใช้รายละเอียดล่าสุด V240 + บันทึก'; }
      }
    })();
  }, true);

  const oldRenderPage = window.renderPage;
  if (typeof oldRenderPage === 'function' && !oldRenderPage.__v232Wrapped) {
    window.renderPage = function renderPageV232Wrapped(){
      const ret = oldRenderPage.apply(this, arguments);
      setTimeout(injectButton232, 20);
      return ret;
    };
    window.renderPage.__v232Wrapped = true;
  }
  try {
    const mo = new MutationObserver(() => injectButton232());
    mo.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  const AUTO_SEED_232 = shouldAutoSeed232();
  if (AUTO_SEED_232) installDefaults232({ silent:true });
  // Older patches may asynchronously reload older template rows from Supabase/local cache shortly after page boot.
  // Re-apply the latest local defaults a few times on first V235 run so the user sees the latest baseline without retyping.
  setTimeout(() => { if (AUTO_SEED_232) installDefaults232({ silent:true }); injectButton232(); }, 80);
  setTimeout(() => { if (AUTO_SEED_232) installDefaults232({ silent:true }); injectButton232(); }, 260);
  setTimeout(() => { if (AUTO_SEED_232) installDefaults232({ silent:true }); injectButton232(); }, 700);
  setTimeout(injectButton232, 1000);

  window.cnmiV232 = { DEFAULT_CONFIGS_232, defaultConfigs232, installDefaults232, saveDefaults232, applyRuntime232 };
  window.cnmiV235 = window.cnmiV232;
})();

} catch (error) { console.error("[v569] patch-v232-default-slot-templates.js", error); }
;

/* Original source: patch-v233-full-week-leave-no-position.js */
try {
/* =========================
   V233 Full-week leave = no monthly position
   - If staff has leave covering every working day in that week, the monthly matrix shows only leave cells.
   - Full-week leave staff are removed from generated monthly position rows even if older saved rows still exist.
   - Single-day / partial-week leave keeps the weekly position and shows a leave marker as before.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V233_FULL_WEEK_LEAVE_NO_POSITION';
  if (window.__CNMI_V233_FULL_WEEK_LEAVE_NO_POSITION__) return;
  window.__CNMI_V233_FULL_WEEK_LEAVE_NO_POSITION__ = true;

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function monthNow(){
    try { return monthKey(new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 7); }
  }
  function parseDateSafe(v){
    try { return parseDate(v); }
    catch (_) { return new Date(String(v).slice(0,10) + 'T00:00:00'); }
  }
  function isNoPositionDaySafe(date){
    try { return isNoPositionDay(date); }
    catch (_) {
      try { return isWeekend(date) || isHolidayDate(date); }
      catch (__) { return false; }
    }
  }
  function hasOutingSafe(date){
    try { return hasOuting(date); } catch (_) { return false; }
  }
  function leaveText(row){
    try { return leaveDisplayType(row); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || 'ลา').split(':::')[0].trim(); }
  }
  function leaveClass(row){
    try { return leaveCellClass(leaveText(row)); } catch (_) { return 'leave-other'; }
  }
  function leaveEffective(row){
    try { return isLeaveEffective(row); }
    catch (_) {
      const stRaw = String(row?.status || row?.approval_status || 'active').trim();
      const st = stRaw.toLowerCase();
      if (['cancelled','canceled','deleted','inactive','void','rejected'].includes(st)) return false;
      if (['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(stRaw)) return false;
      return true;
    }
  }
  function dateInLeave(row, date){
    const d = normDate(date);
    try { return overlapsDate(row, d); }
    catch (_) {
      const s = normDate(row?.start_date || row?.date || row?.work_date);
      const e = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!s && !!e && s <= d && e >= d && leaveEffective(row);
    }
  }
  function activeLeaveRow(staffId, date){
    const sid = String(staffId || '');
    const d = normDate(date);
    if (!sid || !d) return null;
    try {
      const row = activeLeaveRecordOn(sid, d);
      if (row) return row;
    } catch (_) {}
    return (state.leaves || []).find(l => String(l?.staff_id || '') === sid && leaveEffective(l) && dateInLeave(l, d)) || null;
  }
  function monthDates(key){
    const k = String(key || monthNow()).slice(0, 7);
    try {
      const r = getMonthRange(k);
      const last = r.last || new Date(r.y, r.m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${r.y}-${pad(r.m)}-${pad(i + 1)}`);
    } catch (_) {
      const [y, m] = k.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${y}-${String(m).padStart(2,'0')}-${String(i + 1).padStart(2,'0')}`);
    }
  }
  function workDatesForMonth(key){ return monthDates(key).filter(d => !isNoPositionDaySafe(d)); }
  function weekKey(date){
    try { return weekKeyOf(date); }
    catch (_) {
      const d = parseDateSafe(date);
      const day = d.getDay() || 7;
      const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
      return mon.toISOString().slice(0,10);
    }
  }
  function weekWorkMap(key){
    const map = new Map();
    workDatesForMonth(key).forEach(d => {
      const wk = weekKey(d);
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(d);
    });
    return map;
  }
  function weekDatesForDate(date){
    const d = normDate(date);
    const key = d.slice(0, 7);
    return weekWorkMap(key).get(weekKey(d)) || [];
  }
  function fullWeekLeaveInfo(staffId, dateOrWeekDates){
    const dates = Array.isArray(dateOrWeekDates) ? dateOrWeekDates : weekDatesForDate(dateOrWeekDates);
    const workDates = (dates || []).filter(d => !isNoPositionDaySafe(d));
    if (!staffId || !workDates.length) return null;
    const rows = workDates.map(d => activeLeaveRow(staffId, d));
    if (!rows.every(Boolean)) return null;
    const labels = Array.from(new Set(rows.map(leaveText).filter(Boolean)));
    return { rows, label: labels.length ? labels.join(' / ') : 'ลา', dates: workDates };
  }
  function isFullWeekLeave(staffId, dateOrWeekDates){ return !!fullWeekLeaveInfo(staffId, dateOrWeekDates); }
  function positionEnabledStaff(){
    return (state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s); }
      catch (_) { return !!s?.id && s?.is_active !== false && s?.active !== false; }
    });
  }
  function fullWeekLeaveCount(date){
    const weekDates = weekDatesForDate(date);
    return positionEnabledStaff().filter(s => isFullWeekLeave(s.id, weekDates)).length;
  }
  function weeklyAvailableStaff(date){
    const weekDates = weekDatesForDate(date);
    const list = positionEnabledStaff().filter(s => !isFullWeekLeave(s.id, weekDates));
    try { return orderedStaff(list); } catch (_) { return list; }
  }
  function expectedTemplates(date){
    const d = normDate(date);
    if (!d || isNoPositionDaySafe(d)) return [];
    try {
      const list = window.cnmiV231?.expectedTemplatesForDate231?.(d);
      if (Array.isArray(list) && list.length) return list;
    } catch (_) {}
    try {
      const list = monthPositionRoleOptionsForDate(d, '');
      if (Array.isArray(list)) return list;
    } catch (_) {}
    return [];
  }
  function positionBase(code){
    try { return positionBaseCode(code); } catch (_) { return String(code || '').trim(); }
  }
  function canEditMonth(){
    try { return isAdmin() && state.page === 'positionMonth'; } catch (_) { return false; }
  }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function staffColorSafe(st){
    try { return staffColor(st); } catch (_) { return '#e0f2fe'; }
  }
  function textColorSafe(bg){
    try { return textColorFor(bg); } catch (_) { return '#0f172a'; }
  }
  function staffOrder(list){
    try { return orderedStaff(list); } catch (_) { return list; }
  }
  function monthPositionOptions(date, current){
    try { return monthPositionRoleOptionsForDate(date, current); }
    catch (_) { return expectedTemplates(date); }
  }
  function leaveIndex(dates){
    const out = new Map();
    positionEnabledStaff().forEach(st => {
      (dates || []).forEach(d => {
        const row = activeLeaveRow(st.id, d);
        if (row) out.set(`${String(st.id)}|${d}`, row);
      });
    });
    return out;
  }

  const oldBuildMonthlyPositionDraft = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
  if (oldBuildMonthlyPositionDraft) {
    const buildV233 = function buildMonthlyPositionDraftV233(key){
      const draft = oldBuildMonthlyPositionDraft.apply(this, arguments) || { monthKey:String(key || state.positionMonthKey || state.monthKey || monthNow()).slice(0,7), rows:[] };
      const rows = Array.isArray(draft.rows) ? draft.rows : [];
      draft.rows = rows.filter(r => {
        const d = normDate(r?.work_date);
        const sid = String(r?.staff_id || '');
        if (!d || !sid) return false;
        return !isFullWeekLeave(sid, d);
      });
      draft.autoPlanV233 = true;
      return draft;
    };
    window.buildMonthlyPositionDraft = buildV233;
    try { buildMonthlyPositionDraft = buildV233; } catch (_) {}
  }

  function renderCountCell(date, assignedStaffByDate){
    const d = normDate(date);
    if (isNoPositionDaySafe(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const available = weeklyAvailableStaff(d).length;
    const slots = expectedTemplates(d).length;
    const assigned = assignedStaffByDate.get(d)?.size || 0;
    const fullOut = fullWeekLeaveCount(d);
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    const target = Math.min(available || slots, slots || available);
    const tone = assigned >= target ? 'complete' : 'has-missing';
    const title = fullOut ? `Slot หลัก ${base} คน และมีคนลาทั้งสัปดาห์ ${fullOut} คน ระบบจะไม่จัดตำแหน่งให้คนลาทั้งสัปดาห์` : `Slot หลัก ${base} คน`;
    return `<th class="count-role-cell ${tone}" title="${esc(title)}"><b>${esc(available)}/${esc(slots)}</b><br><small>คน/Slot • ฐาน ${esc(base)}${fullOut ? ` • ลาทั้งสัปดาห์ ${esc(fullOut)}` : ''}</small></th>`;
  }
  function renderMissingCell(date, assignedByDate){
    const d = normDate(date);
    if (isNoPositionDaySafe(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const assigned = assignedByDate.get(d) || new Set();
    const expected = expectedTemplates(d);
    const missing = expected.filter(p => !assigned.has(String(p?.code || p?.position_code || '').trim()));
    if (!missing.length) return `<th class="missing-role-cell complete">ครบ<br><small>${esc(expected.length)} ตำแหน่ง</small></th>`;
    return `<th class="missing-role-cell has-missing"><b>${esc(missing.length)}</b><br><small>${missing.map(p => esc(p?.code || p?.position_code || '')).join(', ')}</small></th>`;
  }
  function renderMonthCell(staff, date, cellRows, canEdit, leaves){
    const d = normDate(date);
    if (isNoPositionDaySafe(d)) return `<td class="matrix-cell no-position-day"><span>${isHolidayDate(d) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
    const sid = String(staff?.id || '');
    const fullLeave = fullWeekLeaveInfo(sid, d);
    const leaveRow = leaves.get(`${sid}|${d}`) || activeLeaveRow(sid, d) || null;
    const hasLeave = !!leaveRow;
    const leaveLabel = fullLeave?.label || (leaveRow ? leaveText(leaveRow) : '');
    const fullLeaveClass = fullLeave ? `full-week-leave-cell ${leaveClass(leaveRow || fullLeave.rows?.[0])}` : '';
    if (fullLeave) {
      return `<td class="matrix-cell leave-cell ${fullLeaveClass}" title="${esc('ลาทั้งสัปดาห์: ' + leaveLabel)}"><span class="v233-full-week-leave-pill">${esc(leaveLabel || 'ลา')}</span><small class="leave-note-v233">ลาทั้งสัปดาห์ • ไม่จัดตำแหน่ง</small></td>`;
    }
    const row = (cellRows || [])[0] || null;
    const cleanCodes = (cellRows || []).map(r => String(r?.position_code || r?.code || '').trim()).filter(Boolean).filter(c => c !== 'รอตรวจสอบ');
    const cls = `${hasOutingSafe(d) ? 'outing-cell' : ''} ${hasLeave ? 'leave-cell ' + leaveClass(leaveRow) : ''} ${!cleanCodes.length && !hasLeave ? 'needs-review-cell' : ''}`.trim();
    const leaveMark = hasLeave ? `<small class="leave-note-v228">${esc(leaveLabel)}</small>` : '';
    if (canEdit) {
      const current = row?.position_code || '';
      const options = monthPositionOptions(d, current);
      return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(d)}|${esc(sid)}"><option value="">${hasLeave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${options.map(t => `<option value="${esc(t.code)}" ${current===t.code?'selected':''}>${esc(t.code)}</option>`).join('')}</select>${leaveMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    }
    // Avoid rendering the leave type twice when no position is assigned.
    const text = cleanCodes.length ? cleanCodes.join(' / ') : '';
    const safeText = esc(text);
    return `<td class="matrix-cell ${cls}">${safeText ? `<span title="${safeText}${hasLeave && cleanCodes.length ? ' • ' + esc(leaveLabel) : ''}">${safeText}</span>` : ''}${leaveMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
  }

  const renderV233 = function renderMonthPositionMatrixV233(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) && dates.length ? dates : monthDates(state.positionMonthKey || state.monthKey || monthNow());
    if (!rows.length) return emptySafe('ยังไม่มีแผนรายเดือน กด “สร้างตารางตั้งต้นเปล่า” หรือ “สร้างแผนรายสัปดาห์ทั้งเดือน” ก่อน');
    const byCell = Object.create(null);
    const assignedByDate = new Map();
    const assignedStaffByDate = new Map();
    rows.forEach((r, idx) => {
      const sid = String(r?.staff_id || '');
      const d = normDate(r?.work_date);
      if (!sid || !d) return;
      if (isFullWeekLeave(sid, d)) return; // stale saved positions must not appear/count during full-week leave
      const row = { ...r, zone:(r.zone || ''), _idx:idx };
      (byCell[`${sid}|${d}`] ||= []).push(row);
      const code = String(r?.position_code || r?.code || '').trim();
      if (code && code !== 'รอตรวจสอบ') {
        if (!assignedByDate.has(d)) assignedByDate.set(d, new Set());
        assignedByDate.get(d).add(positionBase(code));
        if (!assignedStaffByDate.has(d)) assignedStaffByDate.set(d, new Set());
        assignedStaffByDate.get(d).add(sid);
      }
    });
    const rowStaffIds = new Set(rows.map(r => String(r?.staff_id || '')).filter(Boolean));
    const displayStaff = staffOrder((state.staff || []).filter(s => {
      const sid = String(s?.id || '');
      if (!sid) return false;
      try { return isDailyPositionEnabled(s) || rowStaffIds.has(sid); }
      catch (_) { return rowStaffIds.has(sid) || s?.is_active !== false; }
    }));
    const canEdit = canEditMonth();
    const leaves = leaveIndex(dates);
    const heads = dates.map(date => {
      const d = parseDateSafe(date);
      const cls = (() => { try { return isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; } catch (_) { return ''; } })();
      return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('');
    const countRow = dates.map(date => renderCountCell(date, assignedStaffByDate)).join('');
    const missing = dates.map(date => renderMissingCell(date, assignedByDate)).join('');
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    return `<div class="monthly-matrix-wrap v182-position-matrix v218-position-matrix v228-position-matrix v231-position-matrix v233-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="legend-box leave"></span> Slot หลัก ${esc(base)} คน • คนลาเฉพาะบางวันยังคงตำแหน่งประจำสัปดาห์ / คนลาทั้งสัปดาห์จะแสดงเฉพาะลาและไม่ถูกจัดตำแหน่ง ${canEdit ? '<span class="hint">ถ้ามีข้อมูลเก่าค้าง ให้กดบันทึก/ประกาศอีกครั้ง ระบบจะลบตำแหน่งของคนลาทั้งสัปดาห์ออกให้</span>' : ''}</div><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countRow}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missing}</tr></thead><tbody>${displayStaff.map(st => { const bg = staffColorSafe(st); const fg = textColorSafe(bg); return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(st.nickname || st.full_name || '-')}</b><small>${esc(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell(st, date, byCell[`${st.id}|${date}`] || [], canEdit, leaves)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };
  window.renderMonthPositionMatrix = renderV233;
  try { renderMonthPositionMatrix = renderV233; } catch (_) {}

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage) {
    const renderPageV233 = function(){
      const out = oldRenderPage.apply(this, arguments);
      setTimeout(() => {
        try {
          if (state?.page === 'positionMonth' && document.querySelector('.v231-position-matrix:not(.v233-position-matrix)') && typeof window.renderPositionMonthPage === 'function') {
            const content = document.getElementById('pageContent');
            if (content) content.innerHTML = window.renderPositionMonthPage();
          }
        } catch (_) {}
      }, 0);
      return out;
    };
    window.renderPage = renderPageV233;
    try { renderPage = renderPageV233; } catch (_) {}
  }

  const style = document.createElement('style');
  style.textContent = `
    .v233-position-matrix .full-week-leave-cell{background:#fff1f2!important;border-color:#fecdd3!important;text-align:center;min-width:120px}
    .v233-full-week-leave-pill{display:inline-flex;align-items:center;justify-content:center;min-width:78px;padding:5px 10px;border-radius:999px;background:#ffe4e6;color:#9f1239;font-weight:700;font-size:12px;line-height:1.1}
    .v233-position-matrix .leave-note-v233{display:block;margin-top:4px;font-size:10px;line-height:1.15;color:#9f1239;white-space:normal}
    .v233-position-matrix .matrix-legend .hint{margin-left:8px;color:#64748b;font-size:12px}
  `;
  document.head.appendChild(style);

  window.cnmiV233 = { isFullWeekLeave, fullWeekLeaveInfo, weeklyAvailableStaff, fullWeekLeaveCount };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v233-full-week-leave-no-position.js", error); }
;

/* Original source: patch-v234-ot-admin-ch4-hr-cycle.js */
try {
/* =========================
   V236 OT Admin Tracking + CH4 Status + HR Cycle Export UX Fix
   - Admin can filter and follow duty confirmation / OT / CH4 status by staff and status.
   - CH4 supports: self, covered by other, no claim/no blood spinning.
   - HR Export separates all Pending from Ready-to-Export in selected 16-15 cycle.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V236_OT_ADMIN_CH4_HR_CYCLE_UX_FIX';
  if (window.__CNMI_V234_OT_ADMIN_CH4_HR_CYCLE__) return;
  window.__CNMI_V234_OT_ADMIN_CH4_HR_CYCLE__ = true;

  const CH4_TABLE = 'shift_confirmations';
  const DUTY_STATUS_OPTIONS = [
    ['','ทุกสถานะ'],
    ['ยังไม่ยืนยัน','ยังไม่ยืนยัน'],
    ['ยืนยันแล้ว','ยืนยันแล้ว'],
    ['ทำ ช4 เอง','ทำ ช4 เอง'],
    ['มีคนอยู่แทน','มีคนอยู่แทน'],
    ['ไม่เบิก','ไม่เบิก / ไม่มีปั่นเลือด'],
    ['รออนุมัติ','รออนุมัติ / ขอ OT แล้ว'],
    ['อนุมัติแล้ว','อนุมัติแล้ว'],
    ['ไม่อนุมัติ','ไม่อนุมัติ'],
    ['ส่งกลับแก้ไข','ส่งกลับแก้ไข']
  ];

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  const previousRenderOtSummary = window.renderOtSummary || (typeof renderOtSummary === 'function' ? renderOtSummary : null);

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function todayKey(){
    try { return todayStr(); }
    catch (_) { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  }
  function currentMonth(){
    try { return monthKey(new Date()); }
    catch (_) { return todayKey().slice(0, 7); }
  }
  function addDays(dateKey, n){
    const d = new Date(`${normDate(dateKey)}T00:00:00`);
    d.setDate(d.getDate() + Number(n || 0));
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function hrCycleRange(month){
    const key = String(month || state.hrExportMonthV234 || state.monthKey || currentMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    const start = `${y}-${pad2(m)}-16`;
    const endDate = new Date(y, m, 15); // JS month is 0-indexed; m = next month from selected month
    const end = `${endDate.getFullYear()}-${pad2(endDate.getMonth()+1)}-${pad2(endDate.getDate())}`;
    return { start, end, month:key };
  }
  function dateList(start, end){
    const out = [];
    let d = normDate(start);
    const stop = normDate(end);
    let guard = 0;
    while (d && d <= stop && guard++ < 80) { out.push(d); d = addDays(d, 1); }
    return out;
  }
  function fmtDate(dateKey){
    try { return formatThaiDate(normDate(dateKey)); }
    catch (_) { return normDate(dateKey) || '-'; }
  }
  function fmtDateTime(value){
    try { return value ? new Date(value).toLocaleString('th-TH') : '-'; }
    catch (_) { return value || '-'; }
  }
  function isAdminSafe(){ try { return !!isAdmin(); } catch (_) { return false; } }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  }
  function staffRecord(staffId){ return (state.staff || []).find(s => String(s.id) === String(staffId)) || null; }
  function staffName(staffId){
    try { return staffNick(staffId); }
    catch (_) { const s = staffRecord(staffId) || {}; return s.nickname || s.full_name || s.email || staffId || '-'; }
  }
  function staffPillSafe(staffId){
    try { return staffPill(staffId); }
    catch (_) { return `<span class="staff-pill">${esc(staffName(staffId))}</span>`; }
  }
  function badgeSafe(text, cls){
    try { return badge(text, cls || statusClass(text)); }
    catch (_) { return `<span class="badge ${esc(cls || statusClass(text))}">${esc(text)}</span>`; }
  }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function statusClass(text){
    const s = String(text || '');
    if (/อนุมัติแล้ว|ยืนยันแล้ว|ทำ ช4 เอง|มีคนอยู่แทน/.test(s)) return 'green';
    if (/ไม่อนุมัติ|ส่งกลับ|ตีกลับ/.test(s)) return 'red';
    if (/ยังไม่|รอ|ขอ OT|ต้อง/.test(s)) return 'orange';
    if (/ไม่เบิก|ไม่มีปั่น/.test(s)) return 'black';
    return 'blue';
  }
  function formatHours(v, digits=2){
    const n = Math.round(Number(v || 0) * Math.pow(10, digits)) / Math.pow(10, digits);
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');
  }
  function formatMoney(v){
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    return `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.`;
  }
  function dutyLabel(code){
    try { return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL?.[code]) || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function isAttendanceReason(row){ return String(row?.reason || '').includes('ยืนยันอยู่เวร'); }
  function isCh4(code){ return ['ช4','ช4A','ช4B','ช4-MT'].includes(String(code || '').trim()); }
  function isManualDuty(code){ return isCh4(code) || ['ช3A','ช3B'].includes(String(code || '').trim()); }
  function isAutoDuty(code){ return !!String(code || '').trim() && !isManualDuty(code); }
  function orderedStaffSafe(list){
    try { return orderedStaff(list || []); }
    catch (_) { return (list || []).slice().sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function activeStaff(){
    const list = (state.staff || []).filter(s => {
      const activeOk = Object.prototype.hasOwnProperty.call(s, 'active') ? (s.active === true || String(s.active).toLowerCase() === 'true') : (s.is_active !== false && String(s.is_active).toLowerCase() !== 'false');
      const scheduleOk = Object.prototype.hasOwnProperty.call(s, 'schedule') ? (s.schedule === true || String(s.schedule).toLowerCase() === 'true') : true;
      const role = String(s.role || s.position || '').toLowerCase();
      return activeOk && scheduleOk && !role.includes('physician') && !String(s.staff_type || '').includes('แพทย์');
    });
    return orderedStaffSafe(list);
  }
  function staffOptions(selected='', includeAll=false){
    const base = includeAll ? '<option value="">ทุกคน</option>' : '<option value="">เลือกชื่อ</option>';
    return base + activeStaff().map(s => `<option value="${esc(s.id)}" ${String(s.id)===String(selected || '')?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('');
  }
  function dutyOptions(selected=''){
    const codes = (typeof DUTY_COLUMNS !== 'undefined' && Array.isArray(DUTY_COLUMNS)) ? DUTY_COLUMNS : ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT'];
    return codes.map(code => `<option value="${esc(code)}" ${String(code)===String(selected)?'selected':''}>${esc(dutyLabel(code))}</option>`).join('');
  }
  function reasonOptions(){
    const rawReasons = window.OT_REASONS || (typeof OT_REASONS !== 'undefined' ? OT_REASONS : null);
    const reasons = Array.isArray(rawReasons) ? rawReasons : ['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','อื่นๆ'];
    return reasons.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  }
  function canViewCh4Month(staffId){
    if (isAdminSafe()) return true;
    const s = staffRecord(staffId) || {};
    const nick = String(s.nickname || s.full_name || '').trim();
    const type = String(s.staff_type || s.type || '').trim();
    try { if (typeof isTangStaff === 'function' && isTangStaff(staffId)) return true; } catch (_) {}
    return type !== 'เคิก' || /แตง/.test(nick);
  }
  function confirmationRows(){ return Array.isArray(state.shiftConfirmations) ? state.shiftConfirmations : []; }
  function assignmentKey(a){
    return [a?.id || '', normDate(a?.duty_date), a?.staff_id || '', a?.duty_code || ''].map(x => String(x || '').replace(/\|/g, '')).join('|');
  }
  function findAssignmentFromKey(key){
    const [id, date, staffId, dutyCode] = String(key || '').split('|');
    return (state.rosterAssignments || []).find(a => {
      if (id && String(a?.id || '') === id) return true;
      return normDate(a?.duty_date) === date && String(a?.staff_id || '') === staffId && String(a?.duty_code || '') === dutyCode;
    }) || null;
  }
  function confirmationFor(a){
    const date = normDate(a?.duty_date || a?.work_date);
    const owner = String(a?.staff_id || a?.owner_staff_id || '');
    const code = String(a?.duty_code || a?.shift_type || '');
    const aid = String(a?.id || a?.roster_assignment_id || '');
    return confirmationRows().slice().sort((x,y) => String(y?.updated_at || y?.confirmed_at || y?.covered_at || '').localeCompare(String(x?.updated_at || x?.confirmed_at || x?.covered_at || ''))).find(r => {
      const rDate = normDate(r?.work_date || r?.duty_date);
      const rOwner = String(r?.owner_staff_id || r?.staff_id || '');
      const rCode = String(r?.duty_code || r?.shift_type || '');
      const rAid = String(r?.roster_assignment_id || '');
      if (aid && rAid && rAid === aid) return true;
      return rDate === date && rOwner === owner && (rCode === code || (isCh4(rCode) && isCh4(code)));
    }) || null;
  }
  function attendanceRows(staffId, date){
    const d = normDate(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && normDate(a?.duty_date) === d);
  }
  function otRowsFor(staffId, date, mode='all'){
    const d = normDate(date);
    return (state.otRequests || []).filter(r => {
      if (String(r?.staff_id || '') !== String(staffId || '') || normDate(r?.work_date) !== d) return false;
      if (mode === 'attendance') return isAttendanceReason(r);
      if (mode === 'extra') return !isAttendanceReason(r);
      return true;
    }).sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  }
  function latest(rows){ return (rows || [])[0] || null; }
  function normalizeOtStatus(row){
    const s = String(row?.status || '').trim().toLowerCase();
    if (s === 'อนุมัติ' || s === 'approved') return 'อนุมัติแล้ว';
    if (s === 'ไม่อนุมัติ' || s === 'rejected') return 'ไม่อนุมัติ';
    if (s === 'ส่งกลับแก้ไข' || s === 'returned') return 'ส่งกลับแก้ไข';
    if (row) return 'รออนุมัติ';
    return '';
  }
  function cleanReasonText(text){
    return String(text || '')
      .replace(/\s*\|\s*V\d+[A-Z0-9_\-]*/gi, '')
      .replace(/\s*\|\s*/g, ' · ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function shortText(text, max=120){
    const t = cleanReasonText(text);
    return t.length > max ? `${t.slice(0, Math.max(0, max - 1))}…` : t;
  }
  function requestHours(row){
    if (!row) return 0;
    try {
      const n = normalizeHours(row);
      if (n && Number.isFinite(Number(n.actualHours)) && Number(n.actualHours) > 0) return Number(n.actualHours);
      if (n && Number.isFinite(Number(n.hrHours)) && Number(n.hrHours) > 0) return Number(n.hrHours);
    } catch (_) {}
    try {
      const h = Number(calcOtHours(row) || 0);
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    const raw = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0);
    return Number.isFinite(raw) ? raw : 0;
  }
  function otRowsRanked(staffId, date, mode='all'){
    const score = r => {
      const st = normalizeOtStatus(r);
      if (st === 'อนุมัติแล้ว') return 5;
      if (st === 'รออนุมัติ') return 4;
      if (st === 'ส่งกลับแก้ไข') return 3;
      if (st === 'ไม่อนุมัติ') return 2;
      return 1;
    };
    return otRowsFor(staffId, date, mode).slice().sort((a,b) => score(b) - score(a) || String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  }
  function anyOtStatus(staffId, date){
    const rows = otRowsRanked(staffId, date, 'all');
    if (!rows.length) return { text:'', category:'', row:null };
    const row = rows[0];
    const st = normalizeOtStatus(row);
    if (st === 'รออนุมัติ') return { text:'ยืนยันแล้ว / รออนุมัติ', category:'รออนุมัติ', row };
    return { text:st || 'ยืนยันแล้ว', category:st || 'ยืนยันแล้ว', row };
  }
  function confirmationRowsCoveredBy(staffId, date){
    const d = normDate(date);
    return confirmationRows().filter(r => {
      const st = String(r?.status || '').trim();
      return st === 'covered_by_other' && String(r?.covered_by_staff_id || '') === String(staffId || '') && normDate(r?.work_date || r?.duty_date) === d;
    }).sort((a,b) => staffName(a?.owner_staff_id || a?.staff_id).localeCompare(staffName(b?.owner_staff_id || b?.staff_id), 'th'));
  }
  function ownerAssignmentForConfirmation(rec){
    const d = normDate(rec?.work_date || rec?.duty_date);
    const owner = String(rec?.owner_staff_id || rec?.staff_id || '');
    const aid = String(rec?.roster_assignment_id || '');
    return (state.rosterAssignments || []).find(a => {
      if (aid && String(a?.id || '') === aid) return true;
      return normDate(a?.duty_date) === d && String(a?.staff_id || '') === owner && isCh4(a?.duty_code);
    }) || null;
  }
  function formatOtLine(row, prefix='OT'){
    if (!row) return '';
    const st = normalizeOtStatus(row) || 'รออนุมัติ';
    const h = requestHours(row);
    const reason = shortText(row.reason || row.note || '-', 140);
    const note = shortText(row.note || '', 100);
    return `<div class="v236-note-line"><span class="v236-note-status ${esc(statusClass(st))}">${esc(st)}</span><span><b>${esc(prefix)}</b>${h ? ` ${esc(formatHours(h, 2))} ชม.` : ''}${reason ? ` · ${esc(reason)}` : ''}${note && note !== reason ? `<br><span class="muted">${esc(note)}</span>` : ''}</span></div>`;
  }
  function buildDutyNoteCell(a, info, staffIdForCovered=''){
    const d = normDate(a?.duty_date || a?.work_date);
    const owner = String(staffIdForCovered || a?.staff_id || '');
    const lines = [];
    const rec = info?.rec || confirmationFor(a);
    if (rec) {
      if (String(rec.status || '') === 'covered_by_other') {
        lines.push(`<div class="v236-note-line"><span class="v236-note-status green">ช4</span><span>มีคนอยู่แทน: <b>${esc(staffName(rec.covered_by_staff_id))}</b>${rec.covered_note || rec.note ? ` · ${esc(shortText(rec.covered_note || rec.note, 120))}` : ''}</span></div>`);
      } else if (rec.note || rec.covered_note) {
        lines.push(`<div class="v236-note-line"><span class="v236-note-status blue">ช4</span><span>${esc(shortText(rec.note || rec.covered_note, 120))}</span></div>`);
      }
    }
    confirmationRowsCoveredBy(owner, d).forEach(c => {
      const fromId = c.owner_staff_id || c.staff_id;
      const ot = latest(otRowsRanked(owner, d, 'extra')) || latest(otRowsRanked(owner, d, 'all'));
      const h = ot ? requestHours(ot) : 0;
      lines.push(`<div class="v236-note-line"><span class="v236-note-status green">แทน</span><span>รับ ช4 แทน <b>${esc(staffName(fromId))}</b>${h ? ` · เบิก ${esc(formatHours(h, 2))} ชม.` : ''}</span></div>`);
    });
    const rows = otRowsRanked(owner, d, 'all');
    rows.slice(0, 3).forEach(r => lines.push(formatOtLine(r, isAttendanceReason(r) ? 'ยืนยันเวร' : 'OT')));
    if (rows.length > 3) lines.push(`<div class="v236-note-line muted">มีรายการ OT เพิ่มอีก ${rows.length - 3} รายการ</div>`);
    return `<div class="v236-note-cell">${lines.filter(Boolean).join('') || '<span class="muted">-</span>'}</div>`;
  }
  function extraOtStatus(staffId, date){
    const rows = otRowsFor(staffId, date, 'extra');
    if (!rows.length) return { text:'', category:'', row:null };
    if (rows.some(r => normalizeOtStatus(r) === 'อนุมัติแล้ว')) return { text:'อนุมัติแล้ว', category:'อนุมัติแล้ว', row:rows.find(r => normalizeOtStatus(r) === 'อนุมัติแล้ว') };
    const row = rows[0];
    const st = normalizeOtStatus(row);
    if (st === 'รออนุมัติ') return { text:'ขอ OT แล้ว / รออนุมัติ', category:'รออนุมัติ', row };
    return { text:st, category:st, row };
  }
  function ch4StatusInfo(a){
    const rec = confirmationFor(a);
    const st = String(rec?.status || '').trim();
    const date = normDate(a?.duty_date);
    const ownerExtra = extraOtStatus(a?.staff_id, date);
    const ownerAny = anyOtStatus(a?.staff_id, date);
    if (st === 'covered_by_other') {
      const by = rec?.covered_by_staff_id;
      const replOt = by ? (extraOtStatus(by, date).text ? extraOtStatus(by, date) : anyOtStatus(by, date)) : { text:'', category:'' };
      const otSuffix = replOt.text ? ` • ${replOt.text}` : '';
      return { text:`มีคนอยู่แทน: ${staffName(by)}${otSuffix}`, category:replOt.category || 'มีคนอยู่แทน', rec, extra:replOt };
    }
    if (st === 'no_claim' || st === 'no_blood' || st === 'no_ot' || st === 'cancelled') return { text:'ไม่เบิก/ไม่มีปั่นเลือด', category:'ไม่เบิก', rec, extra:ownerAny.text ? ownerAny : ownerExtra };
    if (st === 'completed_self' || st === 'confirmed_self') {
      const otInfo = ownerExtra.text ? ownerExtra : ownerAny;
      const otSuffix = otInfo.text ? ` • ${otInfo.text}` : '';
      return { text:`ทำ ช4 เอง${otSuffix}`, category:otInfo.category || 'ทำ ช4 เอง', rec, extra:otInfo };
    }
    if (ownerExtra.text) return { text:ownerExtra.text, category:ownerExtra.category, rec, extra:ownerExtra };
    if (ownerAny.text) return { text:ownerAny.text, category:ownerAny.category, rec, extra:ownerAny };
    return { text:'ยังไม่ยืนยัน', category:'ยังไม่ยืนยัน', rec, extra:ownerAny };
  }
  function dutyStatusInfo(a){
    const date = normDate(a?.duty_date);
    const code = String(a?.duty_code || '').trim();
    if (isCh4(code)) return ch4StatusInfo(a);
    if (['ช3A','ช3B'].includes(code)) {
      const allOt = anyOtStatus(a?.staff_id, date);
      if (allOt.text) return { text:allOt.text, category:allOt.category, rec:null, extra:{ row:allOt.row } };
      const extra = extraOtStatus(a?.staff_id, date);
      if (extra.text) return { text:extra.text, category:extra.category, rec:null, extra };
      if (attendanceRows(a?.staff_id, date).length > 0) return { text:'ยืนยันแล้ว', category:'ยืนยันแล้ว', rec:null, extra:null };
      return { text:'ยังไม่ยืนยัน / ยังไม่บันทึกเวลาจริง', category:'ยังไม่ยืนยัน', rec:null, extra:null };
    }
    const ot = latest(otRowsFor(a?.staff_id, date, 'attendance'));
    const att = attendanceRows(a?.staff_id, date).length > 0;
    if (ot) {
      const st = normalizeOtStatus(ot);
      if (st === 'รออนุมัติ') return { text:'ยืนยันแล้ว / รออนุมัติ', category:'รออนุมัติ', rec:null, extra:{row:ot} };
      return { text:st, category:st, rec:null, extra:{row:ot} };
    }
    if (att) return { text:'ยืนยันแล้ว', category:'ยืนยันแล้ว', rec:null, extra:null };
    return { text:'ยังไม่ยืนยัน', category:'ยังไม่ยืนยัน', rec:null, extra:null };
  }
  function statusMatches(info, filter){
    const f = String(filter || '').trim();
    if (!f) return true;
    const text = `${info?.text || ''} ${info?.category || ''}`;
    if (f === 'ไม่เบิก') return /ไม่เบิก|ไม่มีปั่น/.test(text);
    if (f === 'มีคนอยู่แทน') return /มีคนอยู่แทน/.test(text);
    if (f === 'รออนุมัติ') return /รออนุมัติ|ขอ OT/.test(text);
    return text.includes(f);
  }
  function assignmentRowsForMonth(month){
    const key = String(month || '').slice(0,7);
    const base = (state.rosterAssignments || []).filter(a => normDate(a?.duty_date).startsWith(key) && a?.staff_id);
    // V425: the Admin tracking page must use the same effective owner/segment
    // view as the monthly roster after a partial shift sale.  A completed
    // partial sale keeps the original roster row in Supabase, so reading only
    // rosterAssignments incorrectly shows the seller as owning the full shift.
    try {
      const fn = window.cnmiTradeSegmentsV217?.effectiveAssignmentsForStaffDate;
      if (typeof fn === 'function' && base.length) {
        const staffIds = new Set();
        base.forEach(a => { if (a?.staff_id) staffIds.add(String(a.staff_id)); });
        (state.tradeRequests || []).forEach(r => {
          if (String(r?.status || '') !== 'completed') return;
          if (r?.requester_id) staffIds.add(String(r.requester_id));
          if (r?.receiver_id) staffIds.add(String(r.receiver_id));
        });
        const dates = [...new Set(base.map(a => normDate(a?.duty_date)).filter(Boolean))].sort();
        const effective = [];
        dates.forEach(date => staffIds.forEach(staffId => {
          const rows = fn(staffId, date, state.rosterAssignments || []);
          if (Array.isArray(rows) && rows.length) effective.push(...rows);
        }));
        // Deduplicate defensively.  Effective rows may share the source
        // assignment id, but seller/receiver/kind/segments are distinct.
        const seen = new Set();
        const dedup = effective.filter(a => {
          const k = [a?.id || '', normDate(a?.duty_date), a?.staff_id || '', a?.duty_code || '', a?._effective_kind || '', (a?._effective_segments || []).join(','), a?._effective_trade_request_id || ''].join('|');
          if (seen.has(k)) return false;
          seen.add(k); return true;
        });
        if (dedup.length) return dedup.sort((a,b) => normDate(a?.duty_date).localeCompare(normDate(b?.duty_date)) || staffName(a?.staff_id).localeCompare(staffName(b?.staff_id), 'th'));
      }
    } catch (err) { console.warn('V425 effective Admin tracking fallback', err); }
    return base.sort((a,b) => normDate(a?.duty_date).localeCompare(normDate(b?.duty_date)) || staffName(a?.staff_id).localeCompare(staffName(b?.staff_id), 'th'));
  }
  function actionButtonsForCh4(a, options={}){
    if (!isCh4(a?.duty_code)) return '-';
    const readOnly = !!options.readOnly;
    const canEdit = !readOnly && (isAdminSafe() || String(a?.staff_id || '') === String(currentStaff() || ''));
    if (!canEdit) return '<span class="muted">ดูสถานะเท่านั้น</span>';
    const key = esc(assignmentKey(a));
    return `<div class="actions v234-ch4-actions"><button class="tiny-btn" type="button" data-v234-ch4-self="${key}">ทำ ช4 เอง</button><button class="tiny-btn" type="button" data-v234-ch4-cover="${key}">มีคนอยู่แทน</button><button class="tiny-btn danger" type="button" data-v234-ch4-no-claim="${key}">ไม่เบิก/ไม่มีปั่นเลือด</button></div>`;
  }
  function renderAdminTrackingCard(){
    const month = state.otAdminMonthFilterV234 || state.myDutyMonthFilter || state.monthKey || currentMonth();
    const staffFilter = state.otAdminStaffFilterV234 || '';
    const statusFilter = state.otAdminDutyStatusFilterV234 || '';
    const all = assignmentRowsForMonth(month).map(a => ({ a, info:dutyStatusInfo(a) }));
    const rows = all.filter(x => {
      if (!staffFilter) return statusMatches(x.info, statusFilter);
      const isOwner = String(x.a.staff_id) === String(staffFilter);
      const rec = isCh4(x.a.duty_code) ? confirmationFor(x.a) : null;
      const isCoverer = rec && String(rec.covered_by_staff_id || '') === String(staffFilter);
      return (isOwner || isCoverer) && statusMatches(x.info, statusFilter);
    });
    const counts = all.reduce((acc,x) => { const k = x.info.category || 'อื่น ๆ'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const body = rows.map(({a,info}) => {
      const d = normDate(a.duty_date);
      const isCh4Row = isCh4(a.duty_code);
      const rec = isCh4Row ? confirmationFor(a) : null;
      const isCoverForFilter = !!staffFilter && rec && String(rec.covered_by_staff_id || '') === String(staffFilter) && String(a.staff_id) !== String(staffFilter);
      const focusStaffId = isCoverForFilter ? staffFilter : a.staff_id;
      const nameCell = isCoverForFilter
        ? `<button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(staffFilter)}">${staffPillSafe(staffFilter)}</button><br><span class="muted">รับแทน ${esc(staffName(a.staff_id))}</span>`
        : `<button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(a.staff_id)}">${staffPillSafe(a.staff_id)}</button>`;
      return `<tr data-v234-duty-row="${esc(focusStaffId)}"><td>${fmtDate(d)}</td><td>${nameCell}</td><td><b>${esc(a?._effective_label || dutyLabel(a.duty_code))}</b>${a?._effective_kind === 'receiver-part' ? '<br><span class="muted">รับช่วงเวรที่ขายมา</span>' : (a?._effective_kind === 'owner-remain' ? '<br><span class="muted">ช่วงเวรที่เหลือหลังขาย</span>' : '')}${isCh4Row ? '<br><span class="muted">งานปั่นเลือด / ไม่คิด 8 ชม. อัตโนมัติ</span>' : ''}</td><td>${badgeSafe(info.text, statusClass(info.text))}</td><td>${buildDutyNoteCell(a, info, focusStaffId)}</td><td>${isCh4Row ? actionButtonsForCh4(a) : '<span class="muted">-</span>'}</td></tr>`;
    }).join('');
    const stat = ['ยังไม่ยืนยัน','ยืนยันแล้ว','รออนุมัติ','อนุมัติแล้ว','มีคนอยู่แทน','ไม่เบิก'].map(k => `<span class="badge ${statusClass(k)}">${esc(k)} ${Number(counts[k] || 0)}</span>`).join(' ');
    const activeHint = staffFilter ? `<span class="badge blue">กำลังดู: ${esc(staffName(staffFilter))}</span>` : '';
    return `<div id="v234AdminFollowCard" class="card wide-card v234-admin-follow-card" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>ติดตามการยืนยันเวร / ขอ OT / สถานะ ช4</h3><p class="hint">Admin ดูทุกคนได้ ใช้ตัวกรองเพื่อไล่คนที่ยังไม่กดหรือยังไม่ได้ขอ OT</p></div><div class="v234-statline">${activeHint}${stat}</div></div>
      <div class="toolbar compact-filter v234-admin-filters">
        <label>เดือน <input id="otAdminMonthFilterV234" type="month" value="${esc(month)}"></label>
        <label>เจ้าหน้าที่ <select id="otAdminStaffFilterV234">${staffOptions(staffFilter, true)}</select></label>
        <label>สถานะ <select id="otAdminDutyStatusFilterV234">${DUTY_STATUS_OPTIONS.map(([v,t]) => `<option value="${esc(v)}" ${String(v)===String(statusFilter)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
        <button class="ghost-btn" type="button" data-v234-clear-follow-filter>ล้างตัวกรอง</button>
      </div>
      <div class="table-wrap v234-follow-table"><table><thead><tr><th>วันที่</th><th>ชื่อ</th><th>เวร</th><th>สถานะ</th><th>หมายเหตุ/OT</th><th>จัดการ ช4</th></tr></thead><tbody>${body || '<tr><td colspan="6">ไม่พบรายการตามตัวกรองนี้</td></tr>'}</tbody></table></div>
    </div>`;
  }
  function renderStaffDutyDetail(staffId, month){
    if (!staffId) return '';
    const key = String(month || state.otAdminMonthFilterV234 || state.hrExportMonthV234 || state.monthKey || currentMonth()).slice(0,7);
    const rows = assignmentRowsForMonth(key).filter(a => String(a.staff_id) === String(staffId));
    const body = rows.map(a => {
      const d = normDate(a.duty_date);
      const info = dutyStatusInfo(a);
      return `<tr><td>${fmtDate(d)}</td><td><b>${esc(a?._effective_label || dutyLabel(a.duty_code))}</b>${a?._effective_kind === 'receiver-part' ? '<br><span class="muted">รับช่วงเวรที่ขายมา</span>' : (a?._effective_kind === 'owner-remain' ? '<br><span class="muted">ช่วงเวรที่เหลือหลังขาย</span>' : '')}</td><td>${badgeSafe(info.text, statusClass(info.text))}</td><td>${buildDutyNoteCell(a, info, staffId)}</td><td>${isCh4(a.duty_code) ? actionButtonsForCh4(a) : '-'}</td></tr>`;
    }).join('');
    return `<div id="v234StaffDutyDetail" class="v234-staff-detail"><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>สถานะ</th><th>หมายเหตุ/OT</th><th>จัดการ</th></tr></thead><tbody>${body || '<tr><td colspan="5">ไม่มีเวรในเดือนนี้</td></tr>'}</tbody></table></div></div>`;
  }

  function renderCh4SharedCard(){
    const staffId = currentStaff();
    if (!canViewCh4Month(staffId)) return '';
    const month = state.ch4MonthFilterV234 || state.myDutyMonthFilter || state.monthKey || currentMonth();
    const staffFilter = isAdminSafe() ? (state.ch4StaffFilterV234 || '') : '';
    const readOnly = !isAdminSafe();
    const ch4Rows = assignmentRowsForMonth(month).filter(a => isCh4(a.duty_code) && (!staffFilter || String(a.staff_id) === String(staffFilter)));
    const body = ch4Rows.map(a => {
      const info = ch4StatusInfo(a);
      const rec = info.rec || {};
      return `<tr><td>${fmtDate(a.duty_date)}</td><td>${staffPillSafe(a.staff_id)}</td><td><b>${esc(a?._effective_label || dutyLabel(a.duty_code))}</b>${a?._effective_kind === 'receiver-part' ? '<br><span class="muted">รับช่วงเวรที่ขายมา</span>' : (a?._effective_kind === 'owner-remain' ? '<br><span class="muted">ช่วงเวรที่เหลือหลังขาย</span>' : '')}</td><td>${badgeSafe(info.text, statusClass(info.text))}</td><td>${rec.covered_by_staff_id ? staffPillSafe(rec.covered_by_staff_id) : '-'}</td><td>${buildDutyNoteCell(a, info, a.staff_id)}</td><td>${actionButtonsForCh4(a, { readOnly })}</td></tr>`;
    }).join('');
    return `<div class="card wide-card v234-ch4-shared-card" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>สถานะ ช4 / งานปั่นเลือด รายเดือน</h3><p class="hint">${readOnly ? 'หน้านี้เป็นภาพรวมอ่านอย่างเดียว หากต้องบันทึก ช4 ให้ใช้การ์ดเวรของฉัน/รายการที่ระบบเปิดให้ดำเนินการโดยตรง' : 'Admin สามารถแก้สถานะ ช4 ได้จากหน้านี้'}</p></div></div>
      <div class="toolbar compact-filter"><label>เดือน <input id="ch4MonthFilterV234" type="month" value="${esc(month)}"></label>${isAdminSafe() ? `<label>เจ้าของ ช4 <select id="ch4StaffFilterV234">${staffOptions(staffFilter, true)}</select></label>` : ''}</div>
      ${state.shiftConfirmationReadyV209 === false ? '<div class="notice error-notice compact"><b>ยังไม่ได้เปิดตารางสถานะ ช4</b><br>ให้รัน SQL V209 และ V234 ใน Supabase ก่อนใช้ปุ่มบันทึกสถานะ</div>' : ''}
      <div class="table-wrap v236-ch4-month-table"><table><thead><tr><th>วันที่</th><th>เจ้าของ ช4</th><th>เวร</th><th>สถานะ</th><th>คนอยู่แทน</th><th>หมายเหตุ/OT</th><th>${readOnly ? 'การใช้งาน' : 'จัดการ'}</th></tr></thead><tbody>${body || '<tr><td colspan="7">ไม่มีรายการ ช4 ในเดือนนี้</td></tr>'}</tbody></table></div>
    </div>`;
  }

  function claimStatus(row){
    const raw = String(row?.claim_status || '').trim().toLowerCase();
    if (!raw) return 'pending';
    if (['claimed','exported','เบิกแล้ว','hr_exported'].includes(raw)) return 'exported';
    return 'pending';
  }
  function isApproved(row){ return String(row?.status || '').trim() === 'อนุมัติ'; }
  function isPending(row){ return isApproved(row) && claimStatus(row) === 'pending'; }
  function pendingRows(){ return (state.otRequests || []).filter(isPending); }
  function rowsInCycle(rows, month){
    const c = hrCycleRange(month);
    return (rows || []).filter(r => { const d = normDate(r?.work_date); return d && d >= c.start && d <= c.end; });
  }
  function readyExportRows(month){ return rowsInCycle(pendingRows(), month); }
  function outOfCyclePendingRows(month){
    const c = hrCycleRange(month);
    return pendingRows().filter(r => { const d = normDate(r?.work_date); return d && (d < c.start || d > c.end); });
  }
  function normalizeHours(row){
    try {
      const n = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if (n && Number.isFinite(Number(n.hrHours))) return n;
    } catch (_) {}
    let actual = 0;
    try { actual = Number(calcOtHours(row) || 0); } catch (_) { actual = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0); }
    return { actualHours:actual, hrHours:actual, isHoliday:false, rateType:staffRateType(row?.staff_id), shiftType:'-' };
  }
  function staffRateType(staffId){
    const s = staffRecord(staffId) || {};
    const type = String(s.staff_type || '').trim();
    if (type === 'เคิก') return 'เคิก';
    return 'MT';
  }
  function rateForType(type){ return String(type || 'MT') === 'เคิก' ? 90 : 130; }
  function carryHours(hrHours){
    const centi = Math.round(Number(hrHours || 0) * 100);
    if (!Number.isFinite(centi) || centi <= 0) return 0;
    return Math.round(((centi % 800) / 100) * 100) / 100;
  }
  function groupOtRows(rows){
    const map = {};
    (rows || []).forEach(r => {
      const n = normalizeHours(r);
      if (!Number.isFinite(Number(n.hrHours)) || Number(n.hrHours) <= 0) return;
      const id = r.staff_id || '-';
      const rateType = n.rateType || staffRateType(id);
      const rate = Number(n?.helperInfo?.workRate || rateForType(rateType));
      map[id] = map[id] || { staff_id:id, actual:0, hr:0, money:0, count:0, holiday:0, minDate:'', maxDate:'', rateType, rate, rateLabels:[] };
      const rateLabel = `${rateType} ${rate} บ./ชม.`;
      if (!map[id].rateLabels.includes(rateLabel)) map[id].rateLabels.push(rateLabel);
      if (map[id].rateType !== rateType || map[id].rate !== rate) map[id].rateType = 'หลายเรท';
      map[id].actual = Math.round((map[id].actual + Number(n.actualHours || 0)) * 100) / 100;
      map[id].hr = Math.round((map[id].hr + Number(n.hrHours || 0)) * 100) / 100;
      map[id].money = Math.round((map[id].money + Number(n.hrHours || 0) * rate) * 100) / 100;
      map[id].count += 1;
      if (n.isHoliday) map[id].holiday += 1;
      const d = normDate(r.work_date);
      if (d) { if (!map[id].minDate || d < map[id].minDate) map[id].minDate = d; if (!map[id].maxDate || d > map[id].maxDate) map[id].maxDate = d; }
    });
    Object.values(map).forEach(r => { r.carry = carryHours(r.hr); });
    return Object.values(map).sort((a,b) => staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
  }
  function summaryTable(title, rows, tone, emptyText){
    const grouped = groupOtRows(rows);
    if (!grouped.length) return `<div class="v234-summary-block"><h4>${esc(title)}</h4>${emptySafe(emptyText)}</div>`;
    return `<div class="v234-summary-block"><h4>${esc(title)}</h4><div class="table-wrap v234-ot-summary-table"><table id="${tone === 'ready' ? 'otSummaryTable' : 'otSummaryOutOfCycleTable'}"><thead><tr><th>ชื่อ</th><th>ชั่วโมงจริง Pending</th><th>ชั่วโมงเบิก HR</th><th>คำนวณเป็นเงิน</th><th>OT ทบไปรอบหน้า</th><th>จำนวนรายการ</th><th>รายการนักขัต</th><th>ช่วงวันที่ของรายการ</th><th>สถานะ</th></tr></thead><tbody>${grouped.map(r => `<tr><td><button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(r.staff_id)}">${staffPillSafe(r.staff_id)}</button></td><td>${formatHours(r.actual, 1)}</td><td><b>${formatHours(r.hr, 2)}</b></td><td><b>${formatMoney(r.money)}</b><br><span class="muted">${esc((r.rateLabels || []).join(' + ') || `${r.rateType} ${r.rate} บ./ชม.`)}</span></td><td><b>${formatHours(r.carry, 2)}</b></td><td>${r.count}</td><td>${r.holiday}</td><td>${esc(r.minDate ? `${fmtDate(r.minDate)} - ${fmtDate(r.maxDate || r.minDate)}` : '-')}</td><td>${badgeSafe(tone === 'ready' ? 'พร้อม Export' : 'Pending นอกรอบ / ตกค้าง', tone === 'ready' ? 'green' : 'orange')}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  window.renderOtSummary = renderOtSummary = function renderOtSummaryV234(){
    try {
      const month = state.hrExportMonthV234 || state.monthKey || currentMonth();
      const c = hrCycleRange(month);
      const allPending = pendingRows();
      const ready = readyExportRows(month);
      const outside = outOfCyclePendingRows(month);
      const cards = `<div class="v234-hr-cards"><div class="mini-stat"><span>Pending ทั้งหมด</span><b>${allPending.length}</b></div><div class="mini-stat ready"><span>พร้อม Export รอบนี้</span><b>${ready.length}</b></div><div class="mini-stat overdue"><span>Pending นอกรอบ / ตกค้าง</span><b>${outside.length}</b></div></div>`;
      return `<div class="v234-hr-summary">
        <div class="toolbar compact-filter v234-hr-filter"><label>รอบ Export HR <input id="hrExportMonthV234" type="month" value="${esc(month)}"></label><span class="badge blue">${esc(fmtDate(c.start))} - ${esc(fmtDate(c.end))}</span><span class="badge green">ในรอบนี้มี ${ready.length} รายการพร้อม Export</span></div>
        <p class="hint compact">Pending = อนุมัติแล้วและยังไม่เคย Export HR • พร้อม Export = Pending ที่วันที่ OT อยู่ในรอบ 16-15 ที่เลือกเท่านั้น</p>
        ${cards}
        ${summaryTable('รายการพร้อม Export ในรอบ HR ที่เลือก', ready, 'ready', 'ยังไม่มีรายการพร้อม Export ในรอบนี้')}
        ${summaryTable('Pending นอกรอบ / ตกค้าง — แสดงเพื่อให้ตามต่อ แต่ไม่รวมในไฟล์ Export รอบนี้', outside, 'outside', 'ไม่มี Pending นอกรอบ')}
      </div>`;
    } catch (err) {
      console.warn(`${VERSION}: renderOtSummary fallback`, err);
      return previousRenderOtSummary ? previousRenderOtSummary.apply(this, arguments) : emptySafe('แสดงสรุป OT ไม่สำเร็จ');
    }
  };

  function staffDisplay(staffId){
    const s = staffRecord(staffId) || {};
    return s.full_name || s.name || s.nickname || staffId || '-';
  }
  function employeeCode(staffId){
    const s = staffRecord(staffId) || {};
    const raw = String(s.employee_code || s.emp_code || s.code || '').replace(/\D/g, '');
    return raw ? raw.padStart(7, '0') : String(staffId || '').replace(/\D/g, '').padStart(7, '0').slice(-7);
  }
  function minutesToTime(totalMinutes){
    const total = Math.max(0, Math.round(Number(totalMinutes || 0)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${pad2(m)}`;
  }
  function staffHasLeave(staffId, date){
    const d = normDate(date);
    return (state.leaves || []).some(l => {
      if (String(l.staff_id) !== String(staffId)) return false;
      const type = String(l.type || l.leave_type || '').trim();
      if (!type || type === 'ไม่รับเวร') return false;
      const st = String(l.status || '').toLowerCase();
      let effective = !/reject|cancelled|canceled|ไม่อนุมัติ/.test(st);
      try { effective = isLeaveEffective(l); } catch (_) {}
      if (!effective) return false;
      const s = normDate(l.start_date || l.leave_date || l.date);
      const e = normDate(l.end_date || l.start_date || l.leave_date || l.date);
      return s && e && d >= s && d <= e;
    });
  }
  function allocateDummyRows(totals, month){
    const c = hrCycleRange(month);
    const dates = dateList(c.start, c.end);
    const rows = [];
    const problems = [];
    Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).forEach(([staffId, hours]) => {
      let remaining = Math.round(Number(hours || 0) * 60);
      let guard = 0;
      while (remaining > 0 && guard++ < 1000) {
        const used = new Set(rows.filter(r => String(r.staff_id) === String(staffId)).map(r => r.date));
        const date = dates.find(d => !used.has(d) && !staffHasLeave(staffId, d)) || dates.find(d => !used.has(d)) || dates[(guard - 1) % Math.max(1, dates.length)];
        if (!date) break;
        const chunk = Math.min(remaining, 16 * 60);
        rows.push({ staff_id:staffId, date, start:'0:00', end:minutesToTime(chunk), hours:Math.round((chunk / 60) * 100) / 100 });
        remaining -= chunk;
      }
      if (remaining > 0) problems.push(`${staffName(staffId)} เหลือ ${formatHours(remaining / 60, 2)} ชม.`);
    });
    if (problems.length) return { ok:false, message:`จัด Dummy Shift จากชั่วโมง HR ไม่ครบ: ${problems.join(', ')}` };
    rows.sort((a,b) => a.date.localeCompare(b.date) || staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th') || a.start.localeCompare(b.start));
    return { ok:true, rows, cycle:c };
  }
  function buildHrExport(month){
    const sourceRows = readyExportRows(month);
    const totals = {}, actualTotals = {};
    sourceRows.forEach(r => {
      const n = normalizeHours(r);
      if (!Number.isFinite(Number(n.hrHours)) || Number(n.hrHours) <= 0) return;
      totals[r.staff_id] = Math.round(((totals[r.staff_id] || 0) + Number(n.hrHours || 0)) * 100) / 100;
      actualTotals[r.staff_id] = Math.round(((actualTotals[r.staff_id] || 0) + Number(n.actualHours || 0)) * 100) / 100;
    });
    if (!Object.keys(totals).length) return { ok:false, message:'ยังไม่มีรายการพร้อม Export ในรอบ HR ที่เลือก' };
    const allocated = allocateDummyRows(totals, month);
    if (!allocated.ok) return allocated;
    const hrRows = allocated.rows.map(r => ({ no:employeeCode(r.staff_id), 'วันที่':Number(String(r.date).slice(-2)), 'เวลาเข้า':r.start, 'เวลาออก':r.end }));
    const summaryRows = sourceRows.map(r => {
      const n = normalizeHours(r);
      return { no:employeeCode(r.staff_id), 'ชื่อ':staffDisplay(r.staff_id), 'วันที่ OT':normDate(r.work_date), 'ประเภทเวร':n.shiftType || '-', 'กลุ่มเรท':n.rateType || staffRateType(r.staff_id), 'วันนักขัตฤกษ์':n.isHoliday ? 'ใช่' : 'ไม่ใช่', 'ชั่วโมงจริง':n.actualHours || 0, 'ชั่วโมงเบิก HR':n.hrHours || 0, 'เหตุผล':String(r.reason || ''), 'หมายเหตุ':String(r.note || '') };
    });
    const staffTotals = Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).map(([staffId, hr]) => ({ no:employeeCode(staffId), 'ชื่อ':staffDisplay(staffId), 'ชั่วโมงจริงรวม':actualTotals[staffId] || 0, 'ชั่วโมงเบิก HR รวม':hr }));
    return { ok:true, sourceRows, totals, actualTotals, allocated, hrRows, summaryRows, staffTotals };
  }
  function createBatchId(){
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  }
  async function markExported(ids, batchId){
    const now = new Date().toISOString();
    const actor = currentStaff();
    const attempts = [
      { claim_status:'exported', batch_id:batchId, export_date:now, claim_batch_id:batchId, claimed_at:now, claimed_by:actor },
      { claim_status:'exported', claim_batch_id:batchId, claimed_at:now, claimed_by:actor },
      { claim_status:'Claimed', claim_batch_id:batchId, claimed_at:now, claimed_by:actor }
    ];
    let lastErr = null;
    for (const payload of attempts) {
      const res = await sb.from('ot_requests').update(payload).in('id', ids);
      if (!res.error) return res;
      lastErr = res.error;
      if (!/claim_status|batch_id|export_date|schema cache|constraint|column/i.test(String(res.error?.message || ''))) break;
    }
    throw lastErr || new Error('อัปเดตสถานะ Export ไม่สำเร็จ');
  }
  async function exportHrV234(){
    if (!isAdminSafe()) return showToast('เฉพาะ Admin เท่านั้น', { tone:'error' });
    if (typeof XLSX === 'undefined') return showToast('ไม่พบไลบรารี XLSX สำหรับ Export Excel', { tone:'error' });
    const month = state.hrExportMonthV234 || state.monthKey || currentMonth();
    const result = buildHrExport(month);
    if (!result.ok) return showToast(result.message || 'ไม่พบรายการ Export', { tone:'error' });
    const ids = Array.from(new Set((result.sourceRows || []).map(r => r.id).filter(Boolean)));
    if (!ids.length) return showToast('ไม่พบ ID รายการ OT สำหรับล็อกการ Export ซ้ำ', { tone:'error' });
    const batchId = createBatchId();
    try { setBusy(true, 'กำลัง Export HR เฉพาะรายการพร้อม Export ในรอบที่เลือก'); } catch (_) {}
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.hrRows, { header:['no','วันที่','เวลาเข้า','เวลาออก'] });
      for (let r=2; r <= result.hrRows.length + 1; r++) { const cell = ws[`A${r}`]; if (cell) { cell.t = 's'; cell.z = '@'; } }
      ws['!cols'] = [{wch:12},{wch:8},{wch:12},{wch:12}];
      const summary = XLSX.utils.json_to_sheet(result.summaryRows, { header:['no','ชื่อ','วันที่ OT','ประเภทเวร','กลุ่มเรท','วันนักขัตฤกษ์','ชั่วโมงจริง','ชั่วโมงเบิก HR','เหตุผล','หมายเหตุ'] });
      summary['!cols'] = [{wch:12},{wch:18},{wch:12},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:32},{wch:42}];
      const total = XLSX.utils.json_to_sheet(result.staffTotals, { header:['no','ชื่อ','ชั่วโมงจริงรวม','ชั่วโมงเบิก HR รวม'] });
      const outsideRows = outOfCyclePendingRows(month).map(r => ({ 'วันที่ OT':normDate(r.work_date), 'ชื่อ':staffDisplay(r.staff_id), 'สถานะ':'Pending นอกรอบ / ตกค้าง', 'เหตุผล':String(r.reason || ''), 'หมายเหตุ':String(r.note || '') }));
      const outside = XLSX.utils.json_to_sheet(outsideRows, { header:['วันที่ OT','ชื่อ','สถานะ','เหตุผล','หมายเหตุ'] });
      XLSX.utils.book_append_sheet(wb, ws, 'HR_OT');
      XLSX.utils.book_append_sheet(wb, summary, 'Export_Summary');
      XLSX.utils.book_append_sheet(wb, total, 'Staff_Total');
      XLSX.utils.book_append_sheet(wb, outside, 'Pending_Out_Of_Cycle');
      const c = result.allocated.cycle;
      XLSX.writeFile(wb, `HR_OT_${batchId}_${c.start}_to_${c.end}.xlsx`);
      await markExported(ids, batchId);
      await loadAllData();
      renderPage();
      showToast(`Export HR สำเร็จ ${ids.length} รายการ / Batch ${batchId}`);
    } catch (err) {
      console.error(`${VERSION}: export failed`, err);
      const msg = String(err?.message || err || 'Export ไม่สำเร็จ');
      showToast(/claim_status|batch_id|export_date|constraint|schema cache/i.test(msg) ? 'Export ไฟล์ได้ แต่บันทึกสถานะไม่ได้: กรุณารัน supabase_v234_ot_admin_ch4_hr_cycle.sql แล้วลองใหม่ เพื่อกันการเบิกซ้ำ' : msg, { tone:'error' });
    } finally { try { setBusy(false); } catch (_) {} }
  }

  function renderAdminOtPage(){
    const today = todayKey();
    const tomorrow = addDays(today, 1);
    const rows = state.otRequests || [];
    const month = state.hrExportMonthV234 || state.monthKey || currentMonth();
    const c = hrCycleRange(month);
    const readyCount = readyExportRows(month).length;
    return `<div class="grid grid-2 ot-page v234-ot-page">
      ${renderAdminTrackingCard()}
      <div class="card ot-card v234-admin-card">
        <h3>ส่วนที่ 1 ยืนยันวันอยู่เวรแทนเจ้าหน้าที่</h3>
        <p class="muted">ใช้เฉพาะกรณี Admin ต้องบันทึกย้อนหลัง/บันทึกแทน เวร ช4 ไม่ควรสร้าง 8 ชม. อัตโนมัติ</p>
        <form id="attendanceAdminFormV180" class="form-grid compact-form attendance-form v234-admin-attendance-form">
          <label>เลือกชื่อเจ้าหน้าที่ <select name="staff_id" required>${staffOptions(currentStaff(), false)}</select></label>
          <label>เลือกประเภทเวร <select name="duty_code" required>${dutyOptions()}</select></label>
          <label>วันที่อยู่เวร <input name="duty_date" type="date" value="${esc(today)}" required></label>
          <label>เวลาเริ่มทำงาน <input name="start_time" type="time" value="08:00" required></label>
          <label>วันที่สิ้นสุด <input name="end_date" type="date" value="${esc(tomorrow)}" required></label>
          <label>เวลาสิ้นสุด <input name="end_time" type="time" value="08:00" required></label>
          <label>จำนวนเวลา OT (ชั่วโมง) <input name="manual_hours" class="v180-calculated-hours" type="number" min="0" max="48" step="0.5" value="24" readonly required></label>
          <label>หมายเหตุ Admin <input name="admin_note" placeholder="เช่น ลงย้อนหลังแทนน้อง"></label>
          <button class="primary-btn wide" type="submit">ยืนยันรับ OT / อยู่เวร</button>
        </form>
      </div>
      <div class="card ot-card v234-admin-card">
        <h3>ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด</h3>
        <p class="hint compact">ใช้บันทึกเวลาจริง/ยอดชั่วโมงที่ต้องการเบิก โดยยังต้องรอ Admin อนุมัติก่อนเข้า Pending</p>
        <form id="otForm" class="form-grid v181-admin-ot-extra-form" data-admin-simple="1">
          <label>เลือกชื่อเจ้าหน้าที่ <select name="staff_id" required>${staffOptions(currentStaff(), false)}</select></label>
          <label>ชั่วโมงที่ต้องการเบิก <input name="requested_hours" type="number" min="0.5" max="240" step="0.5" placeholder="เช่น 2 / 8 / 16" required></label>
          <label class="wide">เหตุผล <textarea name="reason" rows="3" placeholder="เช่น เวรปั่นเลือด / งานเร่งด่วน / ปรับยอดเบิก OT" required></textarea></label>
          <button class="primary-btn wide" type="submit">ยืนยันขอ OT เพิ่ม</button>
        </form>
      </div>
      <div class="card wide-card" style="grid-column:1/-1;">
        <div class="section-title"><h3>ส่วนที่ 3 อนุมัติ OT</h3><button class="ghost-btn" data-export-ot-excel>Export Excel สรุปเดือนนี้</button></div>
        ${typeof renderOtTable === 'function' ? renderOtTable(rows) : ''}
      </div>
      ${renderCh4SharedCard()}
      <div class="card" style="grid-column:1/-1;">
        <div class="section-title"><div><h3>ส่วนที่ 4 สรุป OT รายเดือน และ Export HR</h3><p class="hint">รอบ Export HR: ${esc(fmtDate(c.start))} - ${esc(fmtDate(c.end))} • ในรอบนี้มี ${readyCount} รายการพร้อม Export</p></div><div class="actions"><button class="ghost-btn" data-page="claimHistory">ประวัติการเบิก</button><button class="primary-btn" data-export-hr-v234>Export Excel สำหรับเบิกเงิน</button></div></div>
        ${renderOtSummary()}
      </div>
    </div>`;
  }

  window.renderOtPage = renderOtPage = function renderOtPageV234(){
    if (isAdminSafe()) return renderAdminOtPage();
    const base = previousRenderOtPage ? String(previousRenderOtPage.apply(this, arguments) || '') : '';
    const ch4 = renderCh4SharedCard();
    if (!ch4) return base;
    const marker = /(<div class="card" style="grid-column:1\/-1;">\s*<h3>ส่วนที่ 4 สรุป OT รายเดือน)/;
    return marker.test(base) ? base.replace(marker, ch4 + '$1') : `${base}${ch4}`;
  };

  async function saveCh4Status(assignment, status, coveredBy='', note=''){
    if (!assignment) return showToast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า', { tone:'error' });
    const saver = window.v209Ch4Tools?.saveCh4Confirmation209;
    if (typeof saver === 'function') return saver(assignment, status, coveredBy || '', note || '');
    const now = new Date().toISOString();
    const payload = { roster_assignment_id:assignment.id || null, shift_type:'ช4', duty_code:assignment.duty_code || 'ช4', work_date:normDate(assignment.duty_date), owner_staff_id:assignment.staff_id, status, covered_by_staff_id:coveredBy || null, covered_by_name:coveredBy ? staffName(coveredBy) : null, covered_note:note || null, note:note || null, confirmed_at:now, covered_at:status === 'covered_by_other' ? now : null, updated_by:currentStaff(), created_by:currentStaff() };
    const attempts = [{...payload}, (() => { const p = {...payload}; delete p.covered_by_name; return p; })(), (() => { const p = {...payload}; delete p.roster_assignment_id; delete p.covered_by_name; return p; })()];
    let lastErr = null;
    for (const p of attempts) {
      const res = await sb.from(CH4_TABLE).upsert(p, { onConflict:'work_date,owner_staff_id,duty_code' }).select('*').maybeSingle();
      if (!res.error) return res.data || p;
      lastErr = res.error;
      if (!/column|schema|cache|constraint|conflict/i.test(String(res.error?.message || ''))) break;
    }
    throw lastErr || new Error('บันทึกสถานะ ช4 ไม่สำเร็จ');
  }
  async function handleCh4Self(key){
    const assignment = findAssignmentFromKey(key);
    const ok = typeof confirmDialog === 'function' ? await confirmDialog('บันทึกว่าทำ ช4 เองใช่ไหม? หากต้องการเบิก ต้องส่ง OT ตามเวลาจริงแยกต่างหาก', 'ยืนยันทำ ช4 เอง') : window.confirm('บันทึกว่าทำ ช4 เองใช่ไหม?');
    if (!ok) return;
    try { setBusy(true, 'กำลังบันทึกสถานะ ช4'); await saveCh4Status(assignment, 'completed_self', '', 'ทำ ช4 เอง'); await loadAllData(); renderPage(); showToast('บันทึกสถานะ ทำ ช4 เอง แล้ว'); }
    catch (err) { showToast(String(err?.message || err || 'บันทึกสถานะ ช4 ไม่สำเร็จ'), { tone:'error' }); }
    finally { try { setBusy(false); } catch (_) {} }
  }
  async function handleCh4NoClaim(key){
    const assignment = findAssignmentFromKey(key);
    const ok = typeof confirmDialog === 'function' ? await confirmDialog('บันทึกเป็น “ไม่เบิก/ไม่มีปั่นเลือด” ใช่ไหม? รายการนี้จะไม่เข้า OT และไม่เข้า Export HR', 'ยืนยันไม่เบิก') : window.confirm('บันทึกไม่เบิก/ไม่มีปั่นเลือด?');
    if (!ok) return;
    try { setBusy(true, 'กำลังบันทึกสถานะ ช4'); await saveCh4Status(assignment, 'no_claim', '', 'ไม่เบิก/ไม่มีปั่นเลือด'); await loadAllData(); renderPage(); showToast('บันทึกสถานะ ไม่เบิก/ไม่มีปั่นเลือด แล้ว'); }
    catch (err) { showToast(/constraint|status/i.test(String(err?.message || '')) ? 'บันทึกไม่ได้เพราะฐานข้อมูลยังไม่รองรับสถานะ no_claim กรุณารัน supabase_v234_ot_admin_ch4_hr_cycle.sql ก่อน' : String(err?.message || err || 'บันทึกสถานะ ช4 ไม่สำเร็จ'), { tone:'error' }); }
    finally { try { setBusy(false); } catch (_) {} }
  }
  function showCoverModal(key){
    const assignment = findAssignmentFromKey(key);
    if (!assignment) return showToast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า', { tone:'error' });
    const html = `<div class="v234-ch4-cover-modal"><h2>มีคนอยู่แทน / ไม่เบิกอัตโนมัติ</h2><p class="hint">ใช้ปิดสถานะ ช4 ของเจ้าของเวร คนที่อยู่แทนต้องส่ง OT ตามเวลาจริงเองถ้าจะเบิก</p><form id="ch4CoverFormV234" class="form-grid"><input type="hidden" name="assignment_key" value="${esc(key)}"><label>เจ้าของ ช4 <input value="${esc(staffName(assignment.staff_id))}" disabled></label><label>วันที่ <input value="${esc(normDate(assignment.duty_date))}" disabled></label><label class="wide">ผู้ที่อยู่แทน <select name="covered_by_staff_id" required>${staffOptions('', false)}</select></label><label class="wide">หมายเหตุ <textarea name="covered_note" rows="3" placeholder="เช่น ปั่นเลือดแทน / อยู่แทนช่วงเย็น"></textarea></label><div class="actions wide"><button class="ghost-btn" type="button" data-close-modal>ยกเลิก</button><button class="primary-btn" type="submit">บันทึกว่ามีคนอยู่แทน</button></div></form></div>`;
    showModal(html, { small:true });
  }
  async function saveCoverForm(form){
    const fd = new FormData(form);
    const assignment = findAssignmentFromKey(String(fd.get('assignment_key') || ''));
    const coveredBy = String(fd.get('covered_by_staff_id') || '').trim();
    const note = String(fd.get('covered_note') || '').trim();
    if (!coveredBy) return showToast('กรุณาเลือกผู้ที่อยู่แทน', { tone:'error' });
    try { setBusy(true, 'กำลังบันทึกคนอยู่แทน'); await saveCh4Status(assignment, 'covered_by_other', coveredBy, note || `มีคนอยู่แทน: ${staffName(coveredBy)}`); closeModal(); await loadAllData(); renderPage(); showToast(`บันทึกแล้ว: ${staffName(coveredBy)} อยู่แทน`); }
    catch (err) { showToast(String(err?.message || err || 'บันทึกคนอยู่แทนไม่สำเร็จ'), { tone:'error' }); }
    finally { try { setBusy(false); } catch (_) {} }
  }

  document.addEventListener('change', function(e){
    const id = e.target?.id || '';
    if (id === 'otAdminMonthFilterV234') { state.otAdminMonthFilterV234 = e.target.value || currentMonth(); state.myDutyMonthFilter = state.otAdminMonthFilterV234; renderPage(); }
    if (id === 'otAdminStaffFilterV234') { state.otAdminStaffFilterV234 = e.target.value || ''; state.otAdminSelectedStaffV234 = e.target.value || ''; renderPage(); }
    if (id === 'otAdminDutyStatusFilterV234') { state.otAdminDutyStatusFilterV234 = e.target.value || ''; renderPage(); }
    if (id === 'hrExportMonthV234') { state.hrExportMonthV234 = e.target.value || currentMonth(); renderPage(); }
    if (id === 'ch4MonthFilterV234') { state.ch4MonthFilterV234 = e.target.value || currentMonth(); state.myDutyMonthFilter = state.ch4MonthFilterV234; renderPage(); }
    if (id === 'ch4StaffFilterV234') { state.ch4StaffFilterV234 = e.target.value || ''; renderPage(); }
  }, true);

  document.addEventListener('click', async function(e){
    const showStaff = e.target?.closest?.('[data-v234-show-staff]');
    if (showStaff) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const staffId = showStaff.getAttribute('data-v234-show-staff') || '';
      state.otAdminSelectedStaffV234 = '';
      state.otAdminStaffFilterV234 = staffId;
      const m = state.hrExportMonthV234 || state.otAdminMonthFilterV234 || state.monthKey || currentMonth();
      state.otAdminMonthFilterV234 = m;
      renderPage();
      setTimeout(() => { try { document.getElementById('v234AdminFollowCard')?.scrollIntoView({ behavior:'smooth', block:'start' }); } catch (_) {} }, 60);
      return;
    }
    if (e.target?.closest?.('[data-v234-close-staff-detail]')) { e.preventDefault(); state.otAdminSelectedStaffV234 = ''; renderPage(); return; }
    if (e.target?.closest?.('[data-v234-clear-follow-filter]')) { e.preventDefault(); state.otAdminStaffFilterV234 = ''; state.otAdminDutyStatusFilterV234 = ''; state.otAdminSelectedStaffV234 = ''; renderPage(); return; }
    const self = e.target?.closest?.('[data-v234-ch4-self]');
    if (self) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); await handleCh4Self(self.getAttribute('data-v234-ch4-self')); return; }
    const cover = e.target?.closest?.('[data-v234-ch4-cover]');
    if (cover) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); showCoverModal(cover.getAttribute('data-v234-ch4-cover')); return; }
    const noClaim = e.target?.closest?.('[data-v234-ch4-no-claim]');
    if (noClaim) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); await handleCh4NoClaim(noClaim.getAttribute('data-v234-ch4-no-claim')); return; }
    if (e.target?.closest?.('[data-export-hr-v234]')) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); await exportHrV234(); }
  }, true);

  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'ch4CoverFormV234') return;
    e.preventDefault(); e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    saveCoverForm(e.target);
  }, true);

  window.v234OtAdminCh4HrCycle = { hrCycleRange, readyExportRows, outOfCyclePendingRows, buildHrExport, exportHrV234, dutyStatusInfo, ch4StatusInfo, anyOtStatus };
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v234-ot-admin-ch4-hr-cycle.js", error); }
;

/* Original source: patch-v237-month-position-compact-week-swap.js */
try {
/* =========================
   V237 Monthly Position UX + Weekly Swap
   - Full-week leave cells show only leave type (ex: ลาคลอด), details stay in data/title.
   - Count row shows compact "13/13 คน" only; extra slot details stay in title.
   - Missing row treats reduced weekly slot target as complete when all required staff/unique slots are filled.
   - Editing one normal-day position swaps that position across the same work week, excluding outing columns.
   - Outing columns are edited only for that date.
   - Dropdown choices are capped to the effective Slot count; old out-of-slot value is preserved as hidden selected value.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V239_MONTH_POSITION_SLOT_COUNT_OUTING_INDEPENDENT';
  if (window.__CNMI_V237_MONTH_POSITION_COMPACT_WEEK_SWAP__) return;
  window.__CNMI_V237_MONTH_POSITION_COMPACT_WEEK_SWAP__ = true;

  const prevValueByCell = new Map();

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function parseSafe(date){
    try { return parseDate(normDate(date)); }
    catch (_) { return new Date(`${normDate(date)}T00:00:00`); }
  }
  function monthNow(){
    try { return monthKey(new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 7); }
  }
  function currentStaffSafe(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || null; }
  }
  function isAdminSafe(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function copyRows(rows){
    try { return structuredClone(rows || []); }
    catch (_) { return JSON.parse(JSON.stringify(rows || [])); }
  }
  function noPositionDay(date){
    const d = normDate(date);
    try { if (typeof isNoPositionDay === 'function') return !!isNoPositionDay(d); } catch (_) {}
    try { return !!isWeekend(d) || !!isHolidayDate(d); } catch (_) { return false; }
  }
  function holidayLabel(date){
    const d = normDate(date);
    try { return isHolidayDate(d) ? 'HOLIDAY' : 'WEEKEND'; } catch (_) { return 'WEEKEND'; }
  }
  function hasOutingSafe(date){ try { return !!hasOuting(normDate(date)); } catch (_) { return false; } }
  function sameMonth(date, key){ return normDate(date).startsWith(String(key || '').slice(0, 7)); }
  function codeOf(row){
    const raw = String(row?.position_code || row?.code || '').trim();
    if (!raw) return '';
    try { return positionBaseCode(raw) || raw; } catch (_) { return raw.replace(/\s+#\d+$/, '').trim(); }
  }
  function templateByCode(code, date){
    try { return positionTemplateByCode(code, date) || {}; } catch (_) { return {}; }
  }
  function makeRow(date, staffId, code){
    const d = normDate(date);
    const c = String(code || '').trim();
    try { return makeMonthPositionRow(d, staffId, c); }
    catch (_) {
      const base = templateByCode(c, d);
      return {
        work_date: d,
        position_code: c,
        zone: base.zone || 'รอตรวจสอบ',
        break_time: base.break_time || '-',
        main_rule: base.main_rule || '',
        job_desc: base.job_desc || '',
        staff_id: staffId,
        updated_by: currentStaffSafe()
      };
    }
  }
  function leaveText(row){
    try { return leaveDisplayType(row); }
    catch (_) { return String(row?.type || row?.leave_type || row?.reason_type || 'ลา').split(':::')[0].trim(); }
  }
  function leaveClass(row){
    try { return leaveCellClass(leaveText(row)); } catch (_) { return 'leave-other'; }
  }
  function leaveEffective(row){
    try { return typeof isLeaveEffective === 'function' ? isLeaveEffective(row) : true; }
    catch (_) {
      const raw = String(row?.status || row?.approval_status || 'active').trim();
      const st = raw.toLowerCase();
      if (['cancelled','canceled','deleted','inactive','void','rejected'].includes(st)) return false;
      if (['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw)) return false;
      return true;
    }
  }
  function dateInLeave(row, date){
    const d = normDate(date);
    try { return overlapsDate(row, d) && leaveEffective(row); }
    catch (_) {
      const s = normDate(row?.start_date || row?.date || row?.work_date);
      const e = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      return !!s && !!e && s <= d && e >= d && leaveEffective(row);
    }
  }
  function activeLeaveRow(staffId, date){
    const sid = String(staffId || '');
    const d = normDate(date);
    if (!sid || !d) return null;
    try {
      const row = activeLeaveRecordOn(sid, d);
      if (row) return row;
    } catch (_) {}
    return (state.leaves || []).find(l => String(l?.staff_id || '') === sid && dateInLeave(l, d)) || null;
  }
  function fullWeekLeaveInfo(staffId, date){
    try {
      if (window.cnmiV233?.fullWeekLeaveInfo) return window.cnmiV233.fullWeekLeaveInfo(staffId, date);
    } catch (_) {}
    const dates = weekWorkDates(date);
    if (!staffId || !dates.length) return null;
    const rows = dates.map(d => activeLeaveRow(staffId, d));
    if (!rows.every(Boolean)) return null;
    const labels = Array.from(new Set(rows.map(leaveText).filter(Boolean)));
    return { rows, label: labels.length ? labels.join(' / ') : 'ลา', dates };
  }
  function isFullWeekLeave(staffId, date){ return !!fullWeekLeaveInfo(staffId, date); }
  function monthDates(key){
    const k = String(key || monthNow()).slice(0, 7);
    try {
      const r = getMonthRange(k);
      const last = r.last || new Date(r.y, r.m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${r.y}-${pad(r.m)}-${pad(i + 1)}`);
    } catch (_) {
      const [y, m] = k.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return Array.from({ length:last }, (_, i) => `${y}-${pad2(m)}-${pad2(i + 1)}`);
    }
  }
  function weekKey(date){
    try { return weekKeyOf(date); }
    catch (_) {
      const d = parseSafe(date);
      const day = d.getDay() || 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - day + 1);
      return ymd(mon);
    }
  }
  function weekWorkDates(date){
    const d = normDate(date);
    const key = d.slice(0, 7);
    return monthDates(key).filter(x => !noPositionDay(x) && weekKey(x) === weekKey(d));
  }
  function mondayToFriday(date){
    const base = parseSafe(date);
    const day = base.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(base);
    mon.setDate(base.getDate() + diff);
    const key = normDate(date).slice(0, 7);
    return Array.from({ length:5 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return ymd(d);
    }).filter(d => sameMonth(d, key) && !noPositionDay(d));
  }
  function positionEnabledStaff(){
    return (state.staff || []).filter(s => {
      try { return isDailyPositionEnabled(s); }
      catch (_) { return !!s?.id && s?.is_active !== false && s?.active !== false; }
    });
  }
  function weeklyAvailableStaff(date){
    try {
      if (window.cnmiV233?.weeklyAvailableStaff) return window.cnmiV233.weeklyAvailableStaff(date) || [];
    } catch (_) {}
    try {
      if (window.cnmiV231?.weeklyAvailableStaff231) return window.cnmiV231.weeklyAvailableStaff231(date) || [];
    } catch (_) {}
    const list = positionEnabledStaff().filter(s => !isFullWeekLeave(s.id, date));
    try { return orderedStaff(list); } catch (_) { return list; }
  }
  function fullWeekLeaveCount(date){
    try { if (window.cnmiV233?.fullWeekLeaveCount) return window.cnmiV233.fullWeekLeaveCount(date) || 0; } catch (_) {}
    return positionEnabledStaff().filter(s => isFullWeekLeave(s.id, date)).length;
  }
  function optionCode(p){ return String(p?.code || p?.position_code || '').trim(); }
  function uniqueTemplates(list){
    const seen = new Set();
    return (list || []).filter(p => {
      const c = optionCode(p);
      if (!c || seen.has(c)) return false;
      seen.add(c);
      return true;
    });
  }
  function capTemplatesToEffectiveSlots(date, list){
    const d = normDate(date);
    const clean = uniqueTemplates(list);
    if (!clean.length || noPositionDay(d)) return clean;
    // When someone is unavailable for the whole working week, the effective Slot count is reduced.
    // The selectable list must follow the same number shown in the คน/Slot row, not the original 14-slot master list.
    const available = weeklyAvailableStaff(d).length;
    const target = available ? Math.min(available, clean.length) : clean.length;
    return clean.slice(0, target);
  }
  function expectedTemplates(date){
    const d = normDate(date);
    if (!d || noPositionDay(d)) return [];
    try {
      const list = window.cnmiV231?.expectedTemplatesForDate231?.(d);
      if (Array.isArray(list) && list.length) return capTemplatesToEffectiveSlots(d, list);
    } catch (_) {}
    try {
      const list = monthPositionRoleOptionsForDate(d, '');
      if (Array.isArray(list)) return capTemplatesToEffectiveSlots(d, list);
    } catch (_) {}
    return [];
  }
  function optionsForDate(date){
    // Visible options only. Do not append the current value here, otherwise a 13-slot week can show 14 choices.
    return expectedTemplates(date);
  }
  function codeAllowedOnDate(date, code){
    const c = String(code || '').trim();
    if (!c) return true;
    const list = expectedTemplates(date);
    if (!list.length) return true;
    return list.some(p => optionCode(p) === c);
  }
  function renderOptionsHtml(date, current){
    const c = String(current || '').trim();
    const options = optionsForDate(date);
    const hasCurrent = !!c && options.some(t => optionCode(t) === c);
    const hiddenCurrent = c && !hasCurrent ? `<option value="${esc(c)}" selected hidden>${esc(c)} (นอก Slot)</option>` : '';
    return hiddenCurrent + options.map(t => {
      const code = optionCode(t);
      return `<option value="${esc(code)}" ${c===code?'selected':''}>${esc(code)}</option>`;
    }).join('');
  }
  function canEditMonth(){ return isAdminSafe() && String(state?.page || '') === 'positionMonth'; }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function staffColorSafe(st){ try { return staffColor(st); } catch (_) { return '#e0f2fe'; } }
  function textColorSafe(bg){ try { return textColorFor(bg); } catch (_) { return '#0f172a'; } }
  function staffOrder(list){ try { return orderedStaff(list); } catch (_) { return list; } }
  function leaveIndex(dates){
    const out = new Map();
    positionEnabledStaff().forEach(st => {
      (dates || []).forEach(d => {
        const row = activeLeaveRow(st.id, d);
        if (row) out.set(`${String(st.id)}|${d}`, row);
      });
    });
    return out;
  }
  function renderCountCell(date, assignedStaffByDate){
    const d = normDate(date);
    if (noPositionDay(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const available = weeklyAvailableStaff(d).length;
    const slots = expectedTemplates(d).length;
    const assigned = assignedStaffByDate.get(d)?.size || 0;
    const fullOut = fullWeekLeaveCount(d);
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    const target = Math.min(available || slots, slots || available);
    const tone = assigned >= target ? 'complete' : 'has-missing';
    const title = fullOut ? `Slot หลัก ${base} คน • ลาทั้งสัปดาห์ ${fullOut} คน • ใช้ชุด ${slots} คน` : `Slot หลัก ${base} คน • ใช้ชุด ${slots} คน`;
    return `<th class="count-role-cell ${tone}" title="${esc(title)}"><b>${esc(available)}/${esc(slots)} คน</b></th>`;
  }
  function renderMissingCell(date, assignedByDate, assignedStaffByDate){
    const d = normDate(date);
    if (noPositionDay(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const assigned = assignedByDate.get(d) || new Set();
    const expected = expectedTemplates(d);
    const missing = expected.filter(p => !assigned.has(codeOf(p)));
    const available = weeklyAvailableStaff(d).length;
    const slots = expected.length;
    const target = Math.min(available || slots, slots || available);
    const assignedStaff = assignedStaffByDate.get(d)?.size || 0;
    if (!missing.length || (assignedStaff >= target && assigned.size >= target)) {
      return `<th class="missing-role-cell complete">ครบ</th>`;
    }
    return `<th class="missing-role-cell has-missing" title="ยังขาด: ${esc(missing.map(p => p?.code || p?.position_code || '').join(', '))}"><b>${esc(missing.length)}</b><br><small>${missing.map(p => esc(p?.code || p?.position_code || '')).join(', ')}</small></th>`;
  }
  function renderMonthCell(staff, date, cellRows, canEdit, leaves){
    const d = normDate(date);
    if (noPositionDay(d)) return `<td class="matrix-cell no-position-day"><span>${holidayLabel(d)}</span></td>`;
    const sid = String(staff?.id || '');
    const fullLeave = fullWeekLeaveInfo(sid, d);
    const leaveRow = leaves.get(`${sid}|${d}`) || activeLeaveRow(sid, d) || null;
    const hasLeave = !!leaveRow;
    const leaveLabel = fullLeave?.label || (leaveRow ? leaveText(leaveRow) : '');
    if (fullLeave) {
      const cls = `full-week-leave-cell ${leaveClass(leaveRow || fullLeave.rows?.[0])}`;
      return `<td class="matrix-cell leave-cell ${cls}" title="${esc('ลาทั้งสัปดาห์ / ไม่จัดตำแหน่ง: ' + leaveLabel)}"><span class="v237-full-week-leave-pill">${esc(leaveLabel || 'ลา')}</span></td>`;
    }
    const row = (cellRows || [])[0] || null;
    const cleanCodes = (cellRows || []).map(r => String(r?.position_code || r?.code || '').trim()).filter(Boolean).filter(c => c !== 'รอตรวจสอบ');
    const cls = `${hasOutingSafe(d) ? 'outing-cell' : ''} ${hasLeave ? 'leave-cell ' + leaveClass(leaveRow) : ''} ${!cleanCodes.length && !hasLeave ? 'needs-review-cell' : ''}`.trim();
    const leaveMark = hasLeave ? `<small class="leave-note-v228">${esc(leaveLabel)}</small>` : '';
    if (canEdit) {
      const current = row?.position_code || '';
      const outsideSlot = current && !codeAllowedOnDate(d, current);
      const outsideMark = outsideSlot ? '<div class="cell-note v239-outside-slot-note">นอก Slot ที่ใช้</div>' : '';
      return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(d)}|${esc(sid)}" data-v237-current="${esc(current)}"><option value="">${hasLeave ? 'เว้นตำแหน่ง' : 'รอตรวจสอบ'}</option>${renderOptionsHtml(d, current)}</select>${leaveMark}${outsideMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    }
    const text = cleanCodes.length ? cleanCodes.join(' / ') : (hasLeave ? leaveLabel : '');
    const safeText = esc(text);
    return `<td class="matrix-cell ${cls}">${safeText ? `<span title="${safeText}${hasLeave && cleanCodes.length ? ' • ' + esc(leaveLabel) : ''}">${safeText}</span>` : ''}${leaveMark}${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
  }

  const renderV237 = function renderMonthPositionMatrixV237(rows, dates){
    rows = Array.isArray(rows) ? rows : [];
    dates = Array.isArray(dates) && dates.length ? dates : monthDates(state.positionMonthKey || state.monthKey || monthNow());
    if (!rows.length) return emptySafe('ยังไม่มีแผนรายเดือน กด “สร้างตารางตั้งต้นเปล่า” หรือ “สร้างแผนรายสัปดาห์ทั้งเดือน” ก่อน');
    const byCell = Object.create(null);
    const assignedByDate = new Map();
    const assignedStaffByDate = new Map();
    rows.forEach((r, idx) => {
      const sid = String(r?.staff_id || '');
      const d = normDate(r?.work_date);
      if (!sid || !d) return;
      if (isFullWeekLeave(sid, d)) return;
      const row = { ...r, zone:(r.zone || ''), _idx:idx };
      (byCell[`${sid}|${d}`] ||= []).push(row);
      const code = codeOf(r);
      if (code && code !== 'รอตรวจสอบ') {
        if (!assignedByDate.has(d)) assignedByDate.set(d, new Set());
        assignedByDate.get(d).add(code);
        if (!assignedStaffByDate.has(d)) assignedStaffByDate.set(d, new Set());
        assignedStaffByDate.get(d).add(sid);
      }
    });
    const rowStaffIds = new Set(rows.map(r => String(r?.staff_id || '')).filter(Boolean));
    const displayStaff = staffOrder((state.staff || []).filter(s => {
      const sid = String(s?.id || '');
      if (!sid) return false;
      try { return isDailyPositionEnabled(s) || rowStaffIds.has(sid); }
      catch (_) { return rowStaffIds.has(sid) || s?.is_active !== false; }
    }));
    const canEdit = canEditMonth();
    const leaves = leaveIndex(dates);
    const heads = dates.map(date => {
      const d = parseSafe(date);
      const cls = (() => { try { return isHolidayDate(date) ? 'holiday-head' : isWeekend(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; } catch (_) { return ''; } })();
      return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('');
    const countRow = dates.map(date => renderCountCell(date, assignedStaffByDate)).join('');
    const missing = dates.map(date => renderMissingCell(date, assignedByDate, assignedStaffByDate)).join('');
    const base = (() => { try { return window.cnmiV231?.getBaseSlotCount231?.() || 14; } catch (_) { return 14; } })();
    return `<div class="monthly-matrix-wrap v182-position-matrix v218-position-matrix v228-position-matrix v231-position-matrix v233-position-matrix v237-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="legend-box leave"></span> Slot หลัก ${esc(base)} คน • ลาทั้งสัปดาห์แสดงเฉพาะประเภทลา ${canEdit ? '<span class="hint">วันปกติ: เลือก 1 ช่อง = สลับทั้งสัปดาห์โดยไม่แตะคอลัมน์ออกหน่วย • วันออกหน่วย: แก้เฉพาะวันนั้น แล้วกดบันทึกแผนทั้งเดือน</span>' : ''}</div><div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col count-role-head">คน/Slot</th>${countRow}</tr><tr class="missing-role-row"><th class="sticky-col staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col missing-role-head">ตำแหน่ง</th>${missing}</tr></thead><tbody>${displayStaff.map(st => { const bg = staffColorSafe(st); const fg = textColorSafe(bg); return `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(st.nickname || st.full_name || '-')}</b><small>${esc(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell(st, date, byCell[`${st.id}|${date}`] || [], canEdit, leaves)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };
  window.renderMonthPositionMatrix = renderV237;
  try { renderMonthPositionMatrix = renderV237; } catch (_) {}

  function baseRowsForMonth(key){
    if (state.monthPositionDraft?.monthKey === key && Array.isArray(state.monthPositionDraft.rows)) return copyRows(state.monthPositionDraft.rows);
    const saved = copyRows((state.positions || []).filter(r => normDate(r?.work_date).startsWith(key)));
    if (saved.length) return saved;
    try { return copyRows(buildMonthlyPositionDraft(key)?.rows || []); } catch (_) { return []; }
  }
  function mergeVisibleSelections(rows, key, skipEncoded){
    const selects = Array.from(document.querySelectorAll('[data-month-position-edit]'));
    if (!selects.length) return copyRows(rows || []);
    let next = copyRows(rows || []);
    selects.forEach(sel => {
      const encoded = String(sel.dataset.monthPositionEdit || '');
      if (skipEncoded && encoded === skipEncoded) return;
      const [dateRaw, staffRaw] = encoded.split('|');
      const d = normDate(dateRaw);
      const sid = String(staffRaw || '').trim();
      if (!d || !sid || !sameMonth(d, key)) return;
      next = next.filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === sid));
      const code = String(sel.value || '').trim();
      if (code) next.push(makeRow(d, sid, code));
    });
    return next;
  }
  function rowForStaffDate(rows, date, staffId){
    const d = normDate(date);
    const sid = String(staffId || '');
    return (rows || []).find(r => normDate(r?.work_date) === d && String(r?.staff_id || '') === sid && codeOf(r) && codeOf(r) !== 'รอตรวจสอบ') || null;
  }
  function ownerOfCode(rows, date, code, excludeStaffId){
    const d = normDate(date);
    const c = String(code || '').trim();
    const exclude = String(excludeStaffId || '');
    if (!c) return null;
    return (rows || []).find(r => normDate(r?.work_date) === d && String(r?.staff_id || '') !== exclude && codeOf(r) === c) || null;
  }
  function upsertCell(rows, date, staffId, code){
    const d = normDate(date);
    const sid = String(staffId || '');
    const c = String(code || '').trim();
    let next = (rows || []).filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === sid));
    if (c) next.push(makeRow(d, sid, c));
    return next;
  }
  function rerenderPreserve(){
    const fn = () => { try { renderPage(); } catch (_) {} };
    try { if (typeof withPreservedTableScrollV168 === 'function') return withPreservedTableScrollV168(fn); } catch (_) {}
    try {
      const wrap = document.querySelector('.month-position-matrix');
      const left = wrap?.scrollLeft || 0;
      const top = wrap?.scrollTop || 0;
      fn();
      setTimeout(() => { const w = document.querySelector('.month-position-matrix'); if (w) { w.scrollLeft = left; w.scrollTop = top; } highlightSwaps(); }, 0);
    } catch (_) { fn(); }
  }
  function highlightSwaps(){
    try {
      const set = state.weeklySwappedPositionCellsV237;
      if (!set || !set.size) return;
      document.querySelectorAll('[data-month-position-edit]').forEach(sel => {
        const [dateRaw, staffRaw] = String(sel.dataset.monthPositionEdit || '').split('|');
        const key = `${String(staffRaw || '')}|${normDate(dateRaw)}`;
        if (set.has(key)) sel.closest('td')?.classList.add('week-swap-cell-v237');
      });
    } catch (_) {}
  }

  const previousApply = window.applyMonthPositionEdit || (typeof applyMonthPositionEdit === 'function' ? applyMonthPositionEdit : null);
  function applyMonthPositionEditV237(value, encoded){
    if (!isAdminSafe()) return;
    const [sourceDateRaw, staffIdRaw] = String(encoded || '').split('|');
    const sourceDate = normDate(sourceDateRaw);
    const staffId = String(staffIdRaw || '').trim();
    const selectedCode = String(value || '').trim();
    if (!sourceDate || !staffId) return;
    const key = sourceDate.slice(0, 7);
    let rows = mergeVisibleSelections(baseRowsForMonth(key), key, `${sourceDate}|${staffId}`);
    const prevCode = String(prevValueByCell.get(`${sourceDate}|${staffId}`) || '').trim();
    const sourceIsOuting = hasOutingSafe(sourceDate);
    const targets = sourceIsOuting
      ? [sourceDate]
      : mondayToFriday(sourceDate).filter(d => !hasOutingSafe(d));
    const changedCells = new Set();
    let changed = 0;
    let swapped = 0;
    let skipped = 0;

    targets.forEach(d => {
      if (isFullWeekLeave(staffId, d)) { skipped += 1; return; }
      if (selectedCode && !codeAllowedOnDate(d, selectedCode)) { skipped += 1; return; }
      const oldRow = rowForStaffDate(rows, d, staffId);
      let oldCode = codeOf(oldRow);
      if (d === sourceDate && !oldCode) oldCode = prevCode;
      if (oldCode && !codeAllowedOnDate(d, oldCode)) oldCode = '';
      const owner = ownerOfCode(rows, d, selectedCode, staffId);
      if (!selectedCode && !oldCode) return;
      rows = upsertCell(rows, d, staffId, selectedCode);
      changedCells.add(`${staffId}|${d}`);
      if (owner && String(owner.staff_id || '') !== staffId) {
        rows = upsertCell(rows, d, owner.staff_id, oldCode);
        changedCells.add(`${String(owner.staff_id || '')}|${d}`);
        swapped += 1;
      }
      changed += 1;
    });

    state.monthPositionDraft = { monthKey:key, rows };
    state.positionMonthKey = key;
    state.weeklySwappedPositionCellsV237 = changedCells;
    rerenderPreserve();
    setTimeout(highlightSwaps, 40);
    if (!changed) return toast('ยังไม่ได้เปลี่ยนตำแหน่ง: วันนั้นอาจเป็นวันหยุด/ตำแหน่งไม่อยู่ในชุด Slot ที่ใช้จริง', 'error');
    const sourceStaff = (() => { try { return state.staff.find(s => String(s.id) === staffId)?.nickname || ''; } catch (_) { return ''; } })();
    const editScopeText = sourceIsOuting ? 'แก้ตำแหน่งวันออกหน่วยเฉพาะวันนี้แล้ว' : 'สลับตำแหน่งวันปกติทั้งสัปดาห์แล้ว (ไม่แตะคอลัมน์ออกหน่วย)';
    toast(`${editScopeText}${sourceStaff ? ` (${sourceStaff})` : ''}: เปลี่ยน ${changed} วัน${swapped ? ` • สลับคู่ ${swapped} ช่อง` : ''}${skipped ? ` • ข้าม ${skipped} วัน` : ''} — ตรวจทานแล้วกดบันทึกแผนทั้งเดือน`);
  }
  window.applyMonthPositionEdit = applyMonthPositionEditV237;
  try { applyMonthPositionEdit = applyMonthPositionEditV237; } catch (_) {}

  document.addEventListener('focusin', function(e){
    const sel = e.target?.closest?.('[data-month-position-edit]');
    if (!sel) return;
    prevValueByCell.set(String(sel.dataset.monthPositionEdit || ''), String(sel.value || ''));
  }, true);
  document.addEventListener('mousedown', function(e){
    const sel = e.target?.closest?.('[data-month-position-edit]');
    if (!sel) return;
    prevValueByCell.set(String(sel.dataset.monthPositionEdit || ''), String(sel.value || ''));
  }, true);

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV237(){
      const out = previousRenderPage.apply(this, arguments);
      setTimeout(highlightSwaps, 20);
      return out;
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .v237-position-matrix .count-role-cell b{white-space:nowrap;font-size:12px}
    .v237-position-matrix .count-role-cell small{display:none!important}
    .v237-position-matrix .missing-role-cell.complete{font-weight:800;color:#166534;background:#f0fdf4!important}
    .v237-position-matrix .missing-role-cell.has-missing small{display:block;max-width:94px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}
    .v237-position-matrix .full-week-leave-cell{background:#fff1f2!important;border-color:#fecdd3!important;text-align:center;min-width:110px}
    .v237-full-week-leave-pill{display:inline-flex;align-items:center;justify-content:center;min-width:76px;padding:5px 10px;border-radius:999px;background:#ffe4e6;color:#9f1239;font-weight:800;font-size:12px;line-height:1.1}
    .v237-position-matrix .week-swap-cell-v237{outline:2px solid #60a5fa;outline-offset:-2px;background:#eff6ff!important}
    .v237-position-matrix .matrix-legend .hint{margin-left:8px;color:#64748b;font-size:12px}
    .v237-position-matrix .v239-outside-slot-note{color:#b45309;font-weight:800}
  `;
  document.head.appendChild(style);

  window.cnmiV237 = { renderMonthPositionMatrixV237: renderV237, applyMonthPositionEditV237 };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v237-month-position-compact-week-swap.js", error); }
;

/* Original source: patch-v238-ot-summary-hr-export-logic.js */
try {
/* =========================
   V238 OT Monthly Summary + Strict HR Export Logic
   - Separate real monthly OT summary (1-end of month) from HR export cycle (16-15).
   - HR export uses only approved + pending + work_date in selected 16-15 cycle.
   - Export lock writes claim_status/export_batch_id/exported_by/exported_at.
   - Claim history supports rollback / cancel export with confirm dialog.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V238_OT_MONTHLY_SUMMARY_HR_EXPORT_LOGIC';
  if (window.__CNMI_V238_OT_SUMMARY_HR_EXPORT_LOGIC__) return;
  window.__CNMI_V238_OT_SUMMARY_HR_EXPORT_LOGIC__ = true;

  const previousRenderOtSummary = window.renderOtSummary || (typeof renderOtSummary === 'function' ? renderOtSummary : null);
  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function currentMonth(){
    try { return monthKey(new Date()); }
    catch (_) { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
  }
  function fmtDate(dateKey){
    try { return formatThaiDate(normDate(dateKey)); }
    catch (_) { return normDate(dateKey) || '-'; }
  }
  function fmtDateTime(v){
    try { return v ? new Date(v).toLocaleString('th-TH') : '-'; }
    catch (_) { return v || '-'; }
  }
  function isAdminSafe(){ try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } }
  function currentStaff(){ try { return currentStaffId(); } catch (_) { return state?.profile?.id || ''; } }
  function staffRecord(staffId){ return (state.staff || []).find(s => String(s.id) === String(staffId)) || null; }
  function staffName(staffId){
    try { return staffNick(staffId); }
    catch (_) { const s = staffRecord(staffId) || {}; return s.nickname || s.full_name || s.name || s.email || staffId || '-'; }
  }
  function staffPillSafe(staffId){
    try { return staffPill(staffId); }
    catch (_) { return `<span class="staff-pill">${esc(staffName(staffId))}</span>`; }
  }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function badgeSafe(text, cls){
    try { return badge(text, cls || 'blue'); }
    catch (_) { return `<span class="badge ${esc(cls || 'blue')}">${esc(text)}</span>`; }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function money(v){
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    return `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.`;
  }
  function hours(v, digits=2){
    const n = Math.round(Number(v || 0) * Math.pow(10, digits)) / Math.pow(10, digits);
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');
  }
  function firstDayOfMonth(month){
    const key = String(month || currentMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    return `${y}-${pad2(m)}-01`;
  }
  function lastDayOfMonth(month){
    const key = String(month || currentMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m, 0);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function monthRange(month){ return { month:String(month || currentMonth()).slice(0, 7), start:firstDayOfMonth(month), end:lastDayOfMonth(month) }; }
  function hrCycleRange(month){
    const key = String(month || state.hrExportMonthV238 || state.hrExportMonthV234 || state.monthKey || currentMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    const start = `${y}-${pad2(m)}-16`;
    const endDate = new Date(y, m, 15);
    return { month:key, start, end:`${endDate.getFullYear()}-${pad2(endDate.getMonth()+1)}-${pad2(endDate.getDate())}` };
  }
  function addDays(dateKey, n){
    const d = new Date(`${normDate(dateKey)}T00:00:00`);
    d.setDate(d.getDate() + Number(n || 0));
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function dateList(start, end){
    const out = [];
    let d = normDate(start);
    const stop = normDate(end);
    let guard = 0;
    while (d && d <= stop && guard++ < 90) { out.push(d); d = addDays(d, 1); }
    return out;
  }

  function isApproved(row){
    const s = String(row?.status || '').trim().toLowerCase();
    return s === 'อนุมัติ' || s === 'อนุมัติแล้ว' || s === 'approved';
  }
  function claimStatus(row){
    const raw = String(row?.claim_status || '').trim().toLowerCase();
    if (!raw || raw === 'pending' || raw === 'รอเบิก' || raw === 'รอ export') return 'pending';
    if (['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(raw)) return 'exported';
    return 'pending';
  }
  function approvedRows(){ return (state.otRequests || []).filter(isApproved); }
  function pendingRows(){ return approvedRows().filter(r => claimStatus(r) === 'pending'); }
  function exportedRows(){ return approvedRows().filter(r => claimStatus(r) === 'exported'); }
  function rowsWithin(rows, start, end){
    return (rows || []).filter(r => { const d = normDate(r?.work_date); return d && d >= start && d <= end; });
  }
  function monthlyApprovedRows(month){ const r = monthRange(month); return rowsWithin(approvedRows(), r.start, r.end); }
  function readyRows(month){ const c = hrCycleRange(month); return rowsWithin(pendingRows(), c.start, c.end); }
  function outsideRows(month){
    const c = hrCycleRange(month);
    return pendingRows().filter(r => { const d = normDate(r?.work_date); return d && (d < c.start || d > c.end); });
  }

  function staffRateType(staffId){
    const s = staffRecord(staffId) || {};
    const nick = String(s.nickname || s.full_name || '').trim();
    const type = String(s.staff_type || s.type || '').trim();
    if (type === 'เคิก' && !/แตง/.test(nick)) return 'เคิก';
    return 'MT';
  }
  function rateForType(type){ return String(type || 'MT') === 'เคิก' ? 90 : 130; }
  function normalizeHours(row){
    try {
      const n = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if (n && Number.isFinite(Number(n.hrHours))) return n;
    } catch (_) {}
    try {
      const h = Number(calcOtHours(row) || 0);
      return { actualHours:h, hrHours:h, isHoliday:false, rateType:staffRateType(row?.staff_id), shiftType:'-' };
    } catch (_) {}
    const raw = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0);
    return { actualHours:Number.isFinite(raw) ? raw : 0, hrHours:Number.isFinite(raw) ? raw : 0, isHoliday:false, rateType:staffRateType(row?.staff_id), shiftType:'-' };
  }
  function carryHours(hrHours){
    const centi = Math.round(Number(hrHours || 0) * 100);
    if (!Number.isFinite(centi) || centi <= 0) return 0;
    return Math.round(((centi % 800) / 100) * 100) / 100;
  }
  function groupRows(rows){
    const map = {};
    (rows || []).forEach(row => {
      const n = normalizeHours(row);
      const actual = Number(n.actualHours || 0);
      const hr = Number(n.hrHours || 0);
      if ((!Number.isFinite(actual) || actual <= 0) && (!Number.isFinite(hr) || hr <= 0)) return;
      const id = row.staff_id || '-';
      const rateType = n.rateType || staffRateType(id);
      const rate = rateForType(rateType);
      map[id] = map[id] || { staff_id:id, actual:0, hr:0, money:0, count:0, holiday:0, minDate:'', maxDate:'', rateType, rate, exported:0, pending:0 };
      map[id].actual = Math.round((map[id].actual + actual) * 100) / 100;
      map[id].hr = Math.round((map[id].hr + hr) * 100) / 100;
      map[id].money = Math.round((map[id].money + hr * rate) * 100) / 100;
      map[id].count += 1;
      if (n.isHoliday) map[id].holiday += 1;
      if (claimStatus(row) === 'exported') map[id].exported += 1; else map[id].pending += 1;
      const d = normDate(row.work_date);
      if (d) { if (!map[id].minDate || d < map[id].minDate) map[id].minDate = d; if (!map[id].maxDate || d > map[id].maxDate) map[id].maxDate = d; }
    });
    Object.values(map).forEach(r => { r.carry = carryHours(r.hr); });
    return Object.values(map).sort((a,b) => staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
  }
  function sumGrouped(grouped){
    return (grouped || []).reduce((acc, r) => {
      acc.actual += Number(r.actual || 0);
      acc.hr += Number(r.hr || 0);
      acc.money += Number(r.money || 0);
      acc.count += Number(r.count || 0);
      acc.holiday += Number(r.holiday || 0);
      return acc;
    }, { actual:0, hr:0, money:0, count:0, holiday:0 });
  }

  function groupTable(title, rows, tone, options={}){
    const grouped = groupRows(rows);
    if (!grouped.length) return `<div class="v238-summary-block"><h4>${esc(title)}</h4>${emptySafe(options.emptyText || 'ไม่มีรายการ')}</div>`;
    const showClaim = !!options.showClaim;
    const showStatus = !!options.showStatus;
    return `<div class="v238-summary-block"><h4>${esc(title)}</h4><div class="table-wrap v238-ot-summary-table"><table>
      <thead><tr><th>ชื่อ</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>คำนวณเป็นเงิน</th><th>OT ทบไปรอบหน้า</th><th>จำนวนรายการ</th><th>รายการนักขัต</th><th>ช่วงวันที่ของรายการ</th>${showClaim ? '<th>Export Status</th>' : ''}${showStatus ? '<th>สถานะ</th>' : ''}</tr></thead>
      <tbody>${grouped.map(r => `<tr><td><button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(r.staff_id)}">${staffPillSafe(r.staff_id)}</button></td><td>${hours(r.actual, 1)}</td><td><b>${hours(r.hr, 2)}</b></td><td><b>${money(r.money)}</b><br><span class="muted">${esc(r.rateType)} ${r.rate} บ./ชม.</span></td><td><b>${hours(r.carry, 2)}</b></td><td>${r.count}</td><td>${r.holiday}</td><td>${esc(r.minDate ? `${fmtDate(r.minDate)} - ${fmtDate(r.maxDate || r.minDate)}` : '-')}</td>${showClaim ? `<td><span class="badge green">Exported ${r.exported}</span> <span class="badge orange">Pending ${r.pending}</span></td>` : ''}${showStatus ? `<td>${badgeSafe(tone === 'ready' ? 'Ready for Export' : 'Pending นอกรอบ', tone === 'ready' ? 'green' : 'orange')}</td>` : ''}</tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  function renderRealMonthlySummary(){
    const month = state.otMoneyMonthV238 || state.monthKey || state.hrExportMonthV238 || state.hrExportMonthV234 || currentMonth();
    const r = monthRange(month);
    const rows = monthlyApprovedRows(month);
    const grouped = groupRows(rows);
    const total = sumGrouped(grouped);
    return `<section class="v238-real-month-section">
      <div class="section-title"><div><h4>1) สรุป OT รายเดือนจริงของหน่วยงาน</h4><p class="hint compact">ใช้ดูยอดเงินจริงของเดือนนั้นตามวันที่ทำ OT จริง ไม่ผูกกับรอบ Export HR</p></div></div>
      <div class="toolbar compact-filter v238-month-filter"><label>เดือนสรุปเงินจริง <input id="otMoneyMonthV238" type="month" value="${esc(r.month)}"></label><span class="badge blue">${esc(fmtDate(r.start))} - ${esc(fmtDate(r.end))}</span></div>
      <div class="v234-hr-cards v238-money-cards"><div class="mini-stat"><span>Approved ในเดือน</span><b>${total.count}</b></div><div class="mini-stat ready"><span>ชั่วโมงจริงรวม</span><b>${hours(total.actual, 1)}</b></div><div class="mini-stat overdue"><span>ยอดเงินคำนวณรวม</span><b>${esc(money(total.money))}</b></div></div>
      ${groupTable('ยอดเงินจริงรายเดือน 1-สิ้นเดือน (Approved ทั้ง Pending และ Exported)', rows, 'monthly', { emptyText:'ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้', showClaim:true })}
    </section>`;
  }

  function renderHrExportSummary(){
    const month = state.hrExportMonthV238 || state.hrExportMonthV234 || state.monthKey || currentMonth();
    const c = hrCycleRange(month);
    const allPending = pendingRows();
    const ready = readyRows(month);
    const outside = outsideRows(month);
    return `<section class="v238-hr-export-section">
      <div class="section-title"><div><h4>2) Export HR — ไฟล์ดัมมี่รอบ 16-15</h4><p class="hint compact">ใช้สร้างไฟล์ส่ง HR เท่านั้น ระบบจะดึงเฉพาะ Ready for Export ในรอบที่เลือก</p></div><button class="primary-btn" type="button" data-export-hr-v238>Export HR รอบนี้</button></div>
      <div class="toolbar compact-filter v234-hr-filter"><label>รอบ Export HR <input id="hrExportMonthV238" type="month" value="${esc(c.month)}"></label><span class="badge blue">${esc(fmtDate(c.start))} - ${esc(fmtDate(c.end))}</span><span class="badge green">Ready ${ready.length} รายการ</span></div>
      <p class="hint compact"><b>Rule:</b> Ready for Export = status approved + claim_status pending + วันที่ OT อยู่ในรอบ 16-15 ที่เลือกเท่านั้น • Pending นอกรอบแสดงไว้ให้ตามต่อ แต่ไม่เข้าไฟล์รอบนี้</p>
      <div class="v234-hr-cards"><div class="mini-stat"><span>Pending รวม</span><b>${allPending.length}</b></div><div class="mini-stat ready"><span>Ready for Export</span><b>${ready.length}</b></div><div class="mini-stat overdue"><span>Pending นอกรอบ</span><b>${outside.length}</b></div></div>
      ${groupTable('รายการ Ready for Export ในรอบ HR ที่เลือก', ready, 'ready', { emptyText:'ยังไม่มีรายการ Ready for Export ในรอบนี้', showStatus:true })}
      ${groupTable('Pending นอกรอบ / ตกค้าง — ไม่รวมในไฟล์ Export รอบนี้', outside, 'outside', { emptyText:'ไม่มี Pending นอกรอบ', showStatus:true })}
    </section>`;
  }

  window.renderOtSummary = renderOtSummary = function renderOtSummaryV238(){
    try {
      return `<div class="v238-ot-summary">
        <div class="notice compact v238-split-notice"><b>แยก Logic แล้ว:</b> สรุปเงินจริง = 1-สิ้นเดือน • Export HR = 16 ของเดือนที่เลือก ถึง 15 ของเดือนถัดไป</div>
        ${renderRealMonthlySummary()}
        <hr class="v238-separator">
        ${renderHrExportSummary()}
      </div>`;
    } catch (err) {
      console.warn(`${VERSION}: render summary fallback`, err);
      return previousRenderOtSummary ? previousRenderOtSummary.apply(this, arguments) : emptySafe('แสดงสรุป OT ไม่สำเร็จ');
    }
  };

  window.renderOtPage = renderOtPage = function renderOtPageV238(){
    const html = previousRenderOtPage ? String(previousRenderOtPage.apply(this, arguments) || '') : '';
    return html
      .replace(/<h3>ส่วนที่ 4 สรุป OT รายเดือน และ Export HR<\/h3><p class="hint">.*?<\/p>/s, '<h3>ส่วนที่ 4 สรุป OT รายเดือน และ Export HR</h3><p class="hint">สรุปเงินจริงใช้ช่วง 1-สิ้นเดือน ส่วน Export HR ใช้รอบ 16-15 และ Export เฉพาะรายการ Ready เท่านั้น</p>')
      .replace(/data-export-hr-v234/g, 'data-export-hr-v238')
      .replace(/Export Excel สำหรับเบิกเงิน/g, 'Export HR รอบ 16-15');
  };

  function staffDisplay(staffId){
    const s = staffRecord(staffId) || {};
    return s.full_name || s.name || s.nickname || staffId || '-';
  }
  function employeeCode(staffId){
    const s = staffRecord(staffId) || {};
    const raw = String(s.employee_code || s.emp_code || s.code || '').replace(/\D/g, '');
    return raw ? raw.padStart(7, '0') : String(staffId || '').replace(/\D/g, '').padStart(7, '0').slice(-7);
  }
  function minutesToTime(totalMinutes){
    const total = Math.max(0, Math.round(Number(totalMinutes || 0)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${pad2(m)}`;
  }
  function staffHasLeave(staffId, date){
    const d = normDate(date);
    return (state.leaves || []).some(l => {
      if (String(l.staff_id) !== String(staffId)) return false;
      const type = String(l.type || l.leave_type || '').trim();
      if (!type || type === 'ไม่รับเวร') return false;
      let effective = true;
      try { effective = typeof isLeaveEffective === 'function' ? isLeaveEffective(l) : true; }
      catch (_) { effective = !/reject|cancelled|canceled|ไม่อนุมัติ/.test(String(l.status || '').toLowerCase()); }
      if (!effective) return false;
      const s = normDate(l.start_date || l.leave_date || l.date);
      const e = normDate(l.end_date || l.start_date || l.leave_date || l.date);
      return s && e && d >= s && d <= e;
    });
  }
  function allocateDummyRows(totals, month){
    const c = hrCycleRange(month);
    const dates = dateList(c.start, c.end);
    const rows = [];
    const problems = [];
    Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).forEach(([staffId, hr]) => {
      let remaining = Math.round(Number(hr || 0) * 60);
      let guard = 0;
      while (remaining > 0 && guard++ < 1000) {
        const used = new Set(rows.filter(r => String(r.staff_id) === String(staffId)).map(r => r.date));
        const date = dates.find(d => !used.has(d) && !staffHasLeave(staffId, d)) || dates.find(d => !used.has(d)) || dates[(guard - 1) % Math.max(1, dates.length)];
        if (!date) break;
        const chunk = Math.min(remaining, 16 * 60);
        rows.push({ staff_id:staffId, date, start:'0:00', end:minutesToTime(chunk), hours:Math.round((chunk / 60) * 100) / 100 });
        remaining -= chunk;
      }
      if (remaining > 0) problems.push(`${staffName(staffId)} เหลือ ${hours(remaining / 60, 2)} ชม.`);
    });
    if (problems.length) return { ok:false, message:`จัด Dummy Shift ไม่ครบ: ${problems.join(', ')}` };
    rows.sort((a,b) => a.date.localeCompare(b.date) || staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
    return { ok:true, rows, cycle:c };
  }
  function buildHrExport(month){
    const sourceRows = readyRows(month);
    const totals = {}, actualTotals = {};
    sourceRows.forEach(r => {
      const n = normalizeHours(r);
      if (!Number.isFinite(Number(n.hrHours)) || Number(n.hrHours) <= 0) return;
      totals[r.staff_id] = Math.round(((totals[r.staff_id] || 0) + Number(n.hrHours || 0)) * 100) / 100;
      actualTotals[r.staff_id] = Math.round(((actualTotals[r.staff_id] || 0) + Number(n.actualHours || 0)) * 100) / 100;
    });
    if (!Object.keys(totals).length) return { ok:false, message:'ยังไม่มีรายการ Ready for Export ในรอบ HR ที่เลือก' };
    const allocated = allocateDummyRows(totals, month);
    if (!allocated.ok) return allocated;
    const hrRows = allocated.rows.map(r => ({ no:employeeCode(r.staff_id), 'วันที่':Number(String(r.date).slice(-2)), 'เวลาเข้า':r.start, 'เวลาออก':r.end }));
    const summaryRows = sourceRows.map(r => {
      const n = normalizeHours(r);
      return { no:employeeCode(r.staff_id), 'ชื่อ':staffDisplay(r.staff_id), 'วันที่ OT':normDate(r.work_date), 'ประเภทเวร':n.shiftType || '-', 'กลุ่มเรท':n.rateType || staffRateType(r.staff_id), 'วันนักขัตฤกษ์':n.isHoliday ? 'ใช่' : 'ไม่ใช่', 'ชั่วโมงจริง':n.actualHours || 0, 'ชั่วโมงเบิก HR':n.hrHours || 0, 'claim_status ก่อน Export':String(r.claim_status || 'Pending'), 'เหตุผล':String(r.reason || ''), 'หมายเหตุ':String(r.note || '') };
    });
    const staffTotals = Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).map(([staffId, hr]) => ({ no:employeeCode(staffId), 'ชื่อ':staffDisplay(staffId), 'ชั่วโมงจริงรวม':actualTotals[staffId] || 0, 'ชั่วโมงเบิก HR รวม':hr, 'จำนวนแถวดัมมี่ HR':allocated.rows.filter(x => String(x.staff_id) === String(staffId)).length }));
    return { ok:true, sourceRows, totals, actualTotals, allocated, hrRows, summaryRows, staffTotals };
  }
  function batchId(){
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  }
  function sqlErrorMessage(err){
    const msg = String(err?.message || err || '');
    if (/export_batch_id|exported_by|exported_at|claim_status|schema cache|column/i.test(msg)) return 'ฐานข้อมูลยังไม่มีคอลัมน์ Export V238 กรุณารันไฟล์ supabase_v238_ot_export_batch_fields.sql ใน Supabase SQL Editor ก่อนใช้ Export/ตีกลับ';
    return msg || 'อัปเดตสถานะ Export ไม่สำเร็จ';
  }
  async function markExported(ids, id){
    const now = new Date().toISOString();
    const actor = currentStaff();
    const payload = { claim_status:'exported', export_batch_id:id, exported_by:actor, exported_at:now, batch_id:id, export_date:now, claim_batch_id:id, claimed_at:now, claimed_by:actor };
    const res = await sb.from('ot_requests').update(payload).in('id', ids);
    if (res.error) throw new Error(sqlErrorMessage(res.error));
    return res;
  }
  async function exportHrV238(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (typeof XLSX === 'undefined') return toast('ไม่พบไลบรารี XLSX สำหรับ Export Excel', 'error');
    const month = state.hrExportMonthV238 || state.hrExportMonthV234 || state.monthKey || currentMonth();
    const result = buildHrExport(month);
    if (!result.ok) return toast(result.message || 'ไม่พบรายการ Export', 'error');
    const ids = Array.from(new Set((result.sourceRows || []).map(r => r.id).filter(Boolean)));
    if (!ids.length) return toast('ไม่พบ ID รายการ OT สำหรับล็อกการ Export ซ้ำ', 'error');
    const id = batchId();
    try { setBusy(true, 'กำลังสร้างไฟล์ HR และล็อกสถานะ Export'); } catch (_) {}
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.hrRows, { header:['no','วันที่','เวลาเข้า','เวลาออก'] });
      for (let r=2; r <= result.hrRows.length + 1; r++) { const cell = ws[`A${r}`]; if (cell) { cell.t = 's'; cell.z = '@'; } }
      ws['!cols'] = [{wch:12},{wch:8},{wch:12},{wch:12}];
      const summary = XLSX.utils.json_to_sheet(result.summaryRows, { header:['no','ชื่อ','วันที่ OT','ประเภทเวร','กลุ่มเรท','วันนักขัตฤกษ์','ชั่วโมงจริง','ชั่วโมงเบิก HR','claim_status ก่อน Export','เหตุผล','หมายเหตุ'] });
      summary['!cols'] = [{wch:12},{wch:18},{wch:12},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:18},{wch:32},{wch:42}];
      const total = XLSX.utils.json_to_sheet(result.staffTotals, { header:['no','ชื่อ','ชั่วโมงจริงรวม','ชั่วโมงเบิก HR รวม','จำนวนแถวดัมมี่ HR'] });
      const outside = XLSX.utils.json_to_sheet(outsideRows(month).map(r => ({ 'วันที่ OT':normDate(r.work_date), 'ชื่อ':staffDisplay(r.staff_id), 'สถานะ':'Pending นอกรอบ / ไม่เข้าไฟล์รอบนี้', 'เหตุผล':String(r.reason || ''), 'หมายเหตุ':String(r.note || '') })), { header:['วันที่ OT','ชื่อ','สถานะ','เหตุผล','หมายเหตุ'] });
      XLSX.utils.book_append_sheet(wb, ws, 'HR_OT');
      XLSX.utils.book_append_sheet(wb, summary, 'Export_Summary');
      XLSX.utils.book_append_sheet(wb, total, 'Staff_Total');
      XLSX.utils.book_append_sheet(wb, outside, 'Pending_Out_Of_Cycle');
      const c = result.allocated.cycle;
      XLSX.writeFile(wb, `HR_OT_${id}_${c.start}_to_${c.end}.xlsx`);
      await markExported(ids, id);
      await loadAllData();
      renderPage();
      toast(`Export HR สำเร็จ ${ids.length} รายการ / Batch ${id}`);
    } catch (err) {
      console.error(`${VERSION}: export failed`, err);
      toast(String(err?.message || err || 'Export ไม่สำเร็จ'), 'error');
    } finally { try { setBusy(false); } catch (_) {} }
  }

  function rowBatch(row){ return row?.export_batch_id || row?.batch_id || row?.claim_batch_id || 'ไม่พบ Batch ID'; }
  function rowExportedAt(row){ return row?.exported_at || row?.export_date || row?.claimed_at || ''; }
  function exportedBatches(){
    const groups = {};
    exportedRows().forEach(r => {
      const id = rowBatch(r);
      groups[id] = groups[id] || { rows:[], actual:0, hr:0, money:0, minDate:'', maxDate:'', exportedAt:'', exportedBy:'' };
      groups[id].rows.push(r);
      const n = normalizeHours(r);
      const rt = n.rateType || staffRateType(r.staff_id);
      const rate = rateForType(rt);
      groups[id].actual = Math.round((groups[id].actual + Number(n.actualHours || 0)) * 100) / 100;
      groups[id].hr = Math.round((groups[id].hr + Number(n.hrHours || 0)) * 100) / 100;
      groups[id].money = Math.round((groups[id].money + Number(n.hrHours || 0) * rate) * 100) / 100;
      const d = normDate(r.work_date);
      if (d) { if (!groups[id].minDate || d < groups[id].minDate) groups[id].minDate = d; if (!groups[id].maxDate || d > groups[id].maxDate) groups[id].maxDate = d; }
      const at = rowExportedAt(r);
      if (at && (!groups[id].exportedAt || String(at) > String(groups[id].exportedAt))) groups[id].exportedAt = at;
      if (r.exported_by || r.claimed_by) groups[id].exportedBy = r.exported_by || r.claimed_by;
    });
    return Object.entries(groups).sort((a,b) => String(b[1].exportedAt || b[0]).localeCompare(String(a[1].exportedAt || a[0])));
  }
  function renderClaimHistoryPageV238(){
    if (!isAdminSafe()) return emptySafe('เฉพาะ Admin เท่านั้น');
    const batches = exportedBatches();
    const total = batches.reduce((acc, [,g]) => { acc.count += g.rows.length; acc.hr += g.hr; acc.money += g.money; return acc; }, { count:0, hr:0, money:0 });
    if (!batches.length) return `<div class="card"><div class="section-title"><div><h3>ประวัติการเบิก OT / HR Export</h3><p class="hint">รายการที่ Export แล้วจะมาอยู่หน้านี้ และสามารถตีกลับเป็น Pending ได้</p></div><button class="ghost-btn" data-page="ot">กลับไปส่วนที่ 4</button></div>${emptySafe('ยังไม่มีรายการ Exported')}</div>`;
    return `<div class="grid grid-1 v181-claim-history v238-claim-history">
      <div class="card"><div class="section-title"><div><h3>ประวัติการเบิก OT / HR Export</h3><p class="hint">รวม ${total.count} รายการ • ${hours(total.hr, 2)} ชั่วโมงเบิก HR • ${esc(money(total.money))} • ปุ่มตีกลับจะรีเซ็ตเป็น Pending เพื่อ Export ใหม่ได้</p></div><button class="ghost-btn" data-page="ot">กลับไปส่วนที่ 4</button></div></div>
      ${batches.map(([id,g]) => {
        const rows = [...g.rows].sort((a,b) => String(b.work_date || '').localeCompare(String(a.work_date || '')) || staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
        return `<div class="card v181-claim-batch v238-claim-batch">
          <div class="section-title"><div><h3>Batch ${esc(id)}</h3><p class="hint">${rows.length} รายการ • ${hours(g.hr, 2)} ชั่วโมงเบิก HR • ${esc(money(g.money))} • วันที่ OT ${esc(g.minDate ? `${fmtDate(g.minDate)} - ${fmtDate(g.maxDate)}` : '-')} • Export เมื่อ ${esc(fmtDateTime(g.exportedAt))}${g.exportedBy ? ` • โดย ${esc(staffName(g.exportedBy))}` : ''}</p></div><button class="danger-btn" type="button" data-v238-revert-batch="${esc(id)}">ตีกลับ / ยกเลิก Export ทั้ง Batch</button></div>
          <div class="table-wrap"><table><thead><tr><th>วันที่ OT</th><th>เจ้าหน้าที่</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${rows.map(r => { const n = normalizeHours(r); return `<tr><td>${esc(fmtDate(normDate(r.work_date)))}</td><td>${staffPillSafe(r.staff_id)}</td><td>${hours(n.actualHours, 1)}</td><td><b>${hours(n.hrHours, 2)}</b></td><td>${esc(r.reason || '-')}</td><td>${badgeSafe('Exported', 'green')}</td><td><button class="tiny-btn danger" type="button" data-v238-revert-row="${esc(r.id)}">ตีกลับรายการนี้</button></td></tr>`; }).join('')}</tbody></table></div>
        </div>`;
      }).join('')}
    </div>`;
  }
  async function resetExportRows(ids){
    if (!ids.length) return toast('ไม่พบรายการที่ต้องตีกลับ', 'error');
    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog(`ต้องการตีกลับ / ยกเลิก Export ${ids.length} รายการกลับเป็น Pending ใช่ไหม?`, 'ยืนยันตีกลับ Export')
      : window.confirm(`ต้องการตีกลับ / ยกเลิก Export ${ids.length} รายการกลับเป็น Pending ใช่ไหม?`);
    if (!ok) return;
    try { setBusy(true, 'กำลังตีกลับ Export'); } catch (_) {}
    try {
      const payload = { claim_status:'pending', export_batch_id:null, exported_by:null, exported_at:null, batch_id:null, export_date:null, claim_batch_id:null, claimed_at:null, claimed_by:null };
      const res = await sb.from('ot_requests').update(payload).in('id', ids);
      if (res.error) throw new Error(sqlErrorMessage(res.error));
      await loadAllData();
      renderPage();
      toast(`ตีกลับเป็น Pending แล้ว ${ids.length} รายการ`);
    } catch (err) {
      toast(String(err?.message || err || 'ตีกลับ Export ไม่สำเร็จ'), 'error');
    } finally { try { setBusy(false); } catch (_) {} }
  }
  async function resetBatch(id){
    const ids = exportedRows().filter(r => String(rowBatch(r)) === String(id)).map(r => r.id).filter(Boolean);
    await resetExportRows(ids);
  }

  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV238(){
      if (state.page !== 'claimHistory') return previousRenderPage.apply(this, arguments);
      const item = (Array.isArray(NAV_ITEMS) && NAV_ITEMS.find(x => x.id === state.page)) || { title:'ประวัติการเบิก OT', subtitle:'Exported และตีกลับเป็น Pending' };
      const title = document.getElementById('pageTitle'); if (title) title.textContent = item.title;
      const subtitle = document.getElementById('pageSubtitle'); if (subtitle) subtitle.textContent = 'Exported และตีกลับเป็น Pending';
      try { renderNav(); } catch (_) {}
      const content = document.getElementById('pageContent'); if (content) content.innerHTML = renderClaimHistoryPageV238();
    };
  }

  document.addEventListener('change', function(e){
    const id = e.target?.id || '';
    if (id === 'otMoneyMonthV238') { state.otMoneyMonthV238 = e.target.value || currentMonth(); renderPage(); }
    if (id === 'hrExportMonthV238') { state.hrExportMonthV238 = e.target.value || currentMonth(); state.hrExportMonthV234 = state.hrExportMonthV238; renderPage(); }
  }, true);

  document.addEventListener('click', async function(e){
    const exportBtn = e.target?.closest?.('[data-export-hr-v238]');
    if (exportBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      await exportHrV238();
      return;
    }
    const rowBtn = e.target?.closest?.('[data-v238-revert-row]');
    if (rowBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      await resetExportRows([rowBtn.getAttribute('data-v238-revert-row')]);
      return;
    }
    const batchBtn = e.target?.closest?.('[data-v238-revert-batch]');
    if (batchBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      await resetBatch(batchBtn.getAttribute('data-v238-revert-batch'));
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v238-ot-summary{display:grid;gap:14px}
    .v238-split-notice{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}
    .v238-real-month-section,.v238-hr-export-section{display:grid;gap:10px}
    .v238-summary-block h4{margin:8px 0 8px;font-size:15px;color:#0f172a}
    .v238-separator{border:0;border-top:1px dashed #cbd5e1;width:100%;margin:4px 0}
    .v238-ot-summary-table th,.v238-ot-summary-table td{white-space:nowrap}
    .v238-ot-summary-table td:nth-child(4){min-width:130px}
    .v238-month-filter{gap:10px;align-items:end}
    .v238-money-cards .mini-stat.overdue b{font-size:1.15rem}
    .v238-claim-history .danger-btn{white-space:nowrap}
    @media (max-width:760px){.v238-month-filter label,.v234-hr-filter label{width:100%}.v238-hr-export-section .section-title{align-items:stretch}.v238-hr-export-section .section-title button{width:100%}}
  `;
  document.head.appendChild(style);

  window.cnmiV238OtExport = { monthRange, hrCycleRange, monthlyApprovedRows, readyRows, outsideRows, buildHrExport, exportHrV238, renderClaimHistoryPageV238, resetExportRows };
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v238-ot-summary-hr-export-logic.js", error); }
;

/* Original source: patch-v241-ot-single-menu-month-export-fix.js */
try {
/* =========================
   V241 OT Single Menu + Monthly Source HR Export Fix
   - รวม OT/HR Export ให้อยู่ในเมนูเดียวด้วย sub menu
   - ซ่อนเฉพาะเมนูซ้ำใน Sidebar: ประวัติการเบิก OT
   - คงเมนู ตรวจสอบ HR / สรุปตรวจสอบ HR แล้ว ไว้สำหรับ workflow ตรวจวันลาของ HR
   - Export HR ใช้ Source OT จากเดือนเบิกจริง 1-สิ้นเดือน ไม่ใช้รอบ 16-15 มากรอง OT จริง
   - รอบ 16-15 ใช้เป็นหน้าต่างวันที่สำหรับกระจาย HR dummy เท่านั้น
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V242_OT_SINGLE_MENU_KEEP_LEAVE_HR_MENUS';
  if (window.__CNMI_V242_OT_SINGLE_MENU_KEEP_LEAVE_HR_MENUS__) return;
  window.__CNMI_V242_OT_SINGLE_MENU_KEEP_LEAVE_HR_MENUS__ = true;

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function todayKey(){
    try { return todayStr(); }
    catch (_) { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  }
  function currentMonth(){
    try { return monthKey(new Date()); }
    catch (_) { return todayKey().slice(0, 7); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function fmtDate(dateKey){
    try { return formatThaiDate(normDate(dateKey)); }
    catch (_) { return normDate(dateKey) || '-'; }
  }
  function fmtDateTime(v){
    try { return v ? new Date(v).toLocaleString('th-TH') : '-'; }
    catch (_) { return v || '-'; }
  }
  function addDays(dateKey, n){
    const d = new Date(`${normDate(dateKey)}T00:00:00`);
    d.setDate(d.getDate() + Number(n || 0));
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function isAdminSafe(){ try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } }
  function currentStaff(){ try { return currentStaffId(); } catch (_) { return state?.profile?.id || ''; } }
  function staffRecord(staffId){ return (state.staff || []).find(s => String(s.id) === String(staffId)) || null; }
  function staffName(staffId){
    try { return staffNick(staffId); }
    catch (_) { const s = staffRecord(staffId) || {}; return s.nickname || s.full_name || s.name || s.email || staffId || '-'; }
  }
  function staffPillSafe(staffId){
    try { return staffPill(staffId); }
    catch (_) { return `<span class="staff-pill">${esc(staffName(staffId))}</span>`; }
  }
  function badgeSafe(text, cls){
    try { return badge(text, cls || 'blue'); }
    catch (_) { return `<span class="badge ${esc(cls || 'blue')}">${esc(text)}</span>`; }
  }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function money(v){
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    return `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.`;
  }
  function hours(v, digits=2){
    const n = Math.round(Number(v || 0) * Math.pow(10, digits)) / Math.pow(10, digits);
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');
  }
  function sourceMonth(){
    return String(state.otSourceMonthV241 || state.otMoneyMonthV241 || state.otMoneyMonthV238 || state.hrExportMonthV241 || state.hrExportMonthV238 || state.hrExportMonthV234 || state.monthKey || currentMonth()).slice(0, 7);
  }
  function firstDayOfMonth(month){
    const key = String(month || sourceMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    return `${y}-${pad2(m)}-01`;
  }
  function lastDayOfMonth(month){
    const key = String(month || sourceMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m, 0);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function monthRange(month){
    const key = String(month || sourceMonth()).slice(0, 7);
    return { month:key, start:firstDayOfMonth(key), end:lastDayOfMonth(key) };
  }
  function hrCycleRange(month){
    const key = String(month || sourceMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    const endDate = new Date(y, m, 15);
    return { month:key, start:`${y}-${pad2(m)}-16`, end:`${endDate.getFullYear()}-${pad2(endDate.getMonth()+1)}-${pad2(endDate.getDate())}` };
  }
  function dateList(start, end){
    const out = [];
    let d = normDate(start);
    const stop = normDate(end);
    let guard = 0;
    while (d && d <= stop && guard++ < 90) { out.push(d); d = addDays(d, 1); }
    return out;
  }

  function isApproved(row){
    const s = String(row?.status || '').trim().toLowerCase();
    return s === 'อนุมัติ' || s === 'อนุมัติแล้ว' || s === 'approved';
  }
  function claimStatus(row){
    const raw = String(row?.claim_status || '').trim().toLowerCase();
    if (!raw || raw === 'pending' || raw === 'รอเบิก' || raw === 'รอ export') return 'pending';
    if (['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(raw)) return 'exported';
    return 'pending';
  }
  function approvedRows(){ return (state.otRequests || []).filter(isApproved); }
  function rowsWithin(rows, start, end){
    return (rows || []).filter(r => { const d = normDate(r?.work_date); return d && d >= start && d <= end; });
  }
  function monthlyApprovedRows(month){ const r = monthRange(month); return rowsWithin(approvedRows(), r.start, r.end); }
  function monthlyPendingRows(month){ return monthlyApprovedRows(month).filter(r => claimStatus(r) === 'pending'); }
  function monthlyExportedRows(month){ return monthlyApprovedRows(month).filter(r => claimStatus(r) === 'exported'); }
  function exportedRows(){ return approvedRows().filter(r => claimStatus(r) === 'exported'); }

  function staffRateType(staffId){
    const s = staffRecord(staffId) || {};
    const nick = String(s.nickname || s.full_name || '').trim();
    const type = String(s.staff_type || s.type || '').trim();
    if (type === 'เคิก' && !/แตง/.test(nick)) return 'เคิก';
    return 'MT';
  }
  function rateForType(type){ return String(type || 'MT') === 'เคิก' ? 90 : 130; }
  function normalizeHours(row){
    try {
      const n = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if (n && Number.isFinite(Number(n.hrHours))) return n;
    } catch (_) {}
    try {
      const h = Number(calcOtHours(row) || 0);
      return { actualHours:h, hrHours:h, isHoliday:false, rateType:staffRateType(row?.staff_id), shiftType:'-' };
    } catch (_) {}
    const raw = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0);
    return { actualHours:Number.isFinite(raw) ? raw : 0, hrHours:Number.isFinite(raw) ? raw : 0, isHoliday:false, rateType:staffRateType(row?.staff_id), shiftType:'-' };
  }
  function carryHours(hrHours){
    const centi = Math.round(Number(hrHours || 0) * 100);
    if (!Number.isFinite(centi) || centi <= 0) return 0;
    return Math.round(((centi % 800) / 100) * 100) / 100;
  }
  function groupRows(rows){
    const map = {};
    (rows || []).forEach(row => {
      const n = normalizeHours(row);
      const actual = Number(n.actualHours || 0);
      const hr = Number(n.hrHours || 0);
      if ((!Number.isFinite(actual) || actual <= 0) && (!Number.isFinite(hr) || hr <= 0)) return;
      const id = row.staff_id || '-';
      const rateType = n.rateType || staffRateType(id);
      const rate = rateForType(rateType);
      map[id] = map[id] || { staff_id:id, actual:0, hr:0, money:0, count:0, holiday:0, minDate:'', maxDate:'', rateType, rate, exported:0, pending:0 };
      map[id].actual = Math.round((map[id].actual + actual) * 100) / 100;
      map[id].hr = Math.round((map[id].hr + hr) * 100) / 100;
      map[id].money = Math.round((map[id].money + hr * rate) * 100) / 100;
      map[id].count += 1;
      if (n.isHoliday) map[id].holiday += 1;
      if (claimStatus(row) === 'exported') map[id].exported += 1; else map[id].pending += 1;
      const d = normDate(row.work_date);
      if (d) { if (!map[id].minDate || d < map[id].minDate) map[id].minDate = d; if (!map[id].maxDate || d > map[id].maxDate) map[id].maxDate = d; }
    });
    Object.values(map).forEach(r => { r.carry = carryHours(r.hr); });
    return Object.values(map).sort((a,b) => staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
  }
  function sumGrouped(grouped){
    return (grouped || []).reduce((acc, r) => {
      acc.actual += Number(r.actual || 0);
      acc.hr += Number(r.hr || 0);
      acc.money += Number(r.money || 0);
      acc.count += Number(r.count || 0);
      acc.holiday += Number(r.holiday || 0);
      acc.exported += Number(r.exported || 0);
      acc.pending += Number(r.pending || 0);
      return acc;
    }, { actual:0, hr:0, money:0, count:0, holiday:0, exported:0, pending:0 });
  }
  function groupTable(title, rows, options={}){
    const grouped = groupRows(rows);
    if (!grouped.length) return `<div class="v241-summary-block"><h4>${esc(title)}</h4>${emptySafe(options.emptyText || 'ไม่มีรายการ')}</div>`;
    return `<div class="v241-summary-block"><h4>${esc(title)}</h4><div class="table-wrap v241-ot-summary-table"><table>
      <thead><tr><th>ชื่อ</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>คำนวณเป็นเงิน</th><th>OT ทบไปรอบหน้า</th><th>จำนวนรายการ</th><th>รายการนักขัต</th><th>ช่วงวันที่ของรายการ</th><th>Export Status</th></tr></thead>
      <tbody>${grouped.map(r => `<tr><td><button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(r.staff_id)}">${staffPillSafe(r.staff_id)}</button></td><td>${hours(r.actual, 1)}</td><td><b>${hours(r.hr, 2)}</b></td><td><b>${money(r.money)}</b><br><span class="muted">${esc(r.rateType)} ${r.rate} บ./ชม.</span></td><td><b>${hours(r.carry, 2)}</b></td><td>${r.count}</td><td>${r.holiday}</td><td>${esc(r.minDate ? `${fmtDate(r.minDate)} - ${fmtDate(r.maxDate || r.minDate)}` : '-')}</td><td><span class="badge green">Exported ${r.exported}</span> <span class="badge orange">Pending ${r.pending}</span></td></tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  function renderOtSummaryV241(){
    const month = sourceMonth();
    const r = monthRange(month);
    const c = hrCycleRange(month);
    const all = monthlyApprovedRows(month);
    const pending = monthlyPendingRows(month);
    const exported = monthlyExportedRows(month);
    const groupedAll = groupRows(all);
    const totalAll = sumGrouped(groupedAll);
    const totalPending = sumGrouped(groupRows(pending));
    const summaryText = 'ระบบจะนำยอด OT ที่อนุมัติแล้วจากเดือนเบิกจริง 1-สิ้นเดือน ไปกระจายเป็นเวร dummy สำหรับส่ง HR ในรอบ 16-15 โดยรอบ 16-15 ไม่ใช่ตัวกรองวันที่ OT จริง';
    return `<div class="v241-ot-summary">
      <div class="notice compact v241-logic-notice"><b>Logic ถูกต้อง:</b> 1-สิ้นเดือน = ใช้คิดเงินให้น้อง • 16-15 = ใช้เป็นวันที่ HR dummy เท่านั้น</div>
      <section class="v241-real-month-section">
        <div class="section-title"><div><h4>สรุป OT รายเดือนจริงของหน่วยงาน</h4><p class="hint compact">ใช้ดูยอดเงินจริงของเดือนที่เลือก โดยนับ Approved ทั้ง Pending และ Exported</p></div></div>
        <div class="toolbar compact-filter v241-month-filter"><label>เดือนเบิกจริง <input id="otMoneyMonthV241" type="month" value="${esc(r.month)}"></label><span class="badge blue">${esc(fmtDate(r.start))} - ${esc(fmtDate(r.end))}</span></div>
        <div class="v234-hr-cards v241-money-cards"><div class="mini-stat"><span>Approved ในเดือน</span><b>${totalAll.count}</b></div><div class="mini-stat ready"><span>ชั่วโมงจริงรวม</span><b>${hours(totalAll.actual, 1)}</b></div><div class="mini-stat overdue"><span>ยอดเงินคำนวณรวม</span><b>${esc(money(totalAll.money))}</b></div></div>
        ${groupTable('ยอดเงินจริงรายเดือน 1-สิ้นเดือน', all, { emptyText:'ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้' })}
      </section>
      ${isAdminSafe() ? `<hr class="v241-separator">
      <section class="v241-hr-export-section">
        <div class="section-title"><div><h4>Export HR — กระจายยอดเดือนจริงลง HR dummy รอบ 16-15</h4><p class="hint compact">${esc(summaryText)}</p></div><button class="primary-btn" type="button" data-export-hr-v241>Export HR เดือนนี้</button></div>
        <div class="toolbar compact-filter v241-hr-filter"><label>เดือนเบิกจริงที่จะส่ง HR <input id="otSourceMonthV241" type="month" value="${esc(r.month)}"></label><span class="badge blue">Source OT: ${esc(fmtDate(r.start))} - ${esc(fmtDate(r.end))}</span><span class="badge green">HR dummy: ${esc(fmtDate(c.start))} - ${esc(fmtDate(c.end))}</span></div>
        <div class="v234-hr-cards"><div class="mini-stat"><span>Ready จากเดือนนี้</span><b>${pending.length}</b></div><div class="mini-stat ready"><span>ชั่วโมงเบิก HR พร้อม Export</span><b>${hours(totalPending.hr, 2)}</b></div><div class="mini-stat overdue"><span>Exported แล้วในเดือนนี้</span><b>${exported.length}</b></div></div>
        ${groupTable('รายการ Ready for Export จากเดือนเบิกจริง 1-สิ้นเดือน', pending, { emptyText:'ยังไม่มีรายการ Approved Pending ในเดือนนี้' })}
      </section>` : ''}
    </div>`;
  }
  window.renderOtSummary = renderOtSummary = renderOtSummaryV241;

  function activeStaff(){
    const list = (state.staff || []).filter(s => {
      const activeOk = Object.prototype.hasOwnProperty.call(s, 'active') ? (s.active === true || String(s.active).toLowerCase() === 'true') : (s.is_active !== false && String(s.is_active).toLowerCase() !== 'false');
      const scheduleOk = Object.prototype.hasOwnProperty.call(s, 'schedule') ? (s.schedule === true || String(s.schedule).toLowerCase() === 'true') : true;
      const role = String(s.role || s.position || '').toLowerCase();
      return activeOk && scheduleOk && !role.includes('physician') && !String(s.staff_type || '').includes('แพทย์');
    });
    try { return orderedStaff(list); }
    catch (_) { return list.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function employeeCode(staffId){
    const s = staffRecord(staffId) || {};
    const raw = String(s.employee_code || s.emp_code || s.code || '').replace(/\D/g, '');
    return raw ? raw.padStart(7, '0') : String(staffId || '').replace(/\D/g, '').padStart(7, '0').slice(-7);
  }
  function staffDisplay(staffId){
    const s = staffRecord(staffId) || {};
    return s.full_name || s.name || s.nickname || staffId || '-';
  }
  function staffHasLeave(staffId, date){
    const d = normDate(date);
    return (state.leaves || []).some(l => {
      if (String(l.staff_id) !== String(staffId)) return false;
      const type = String(l.type || l.leave_type || '').trim();
      if (!type || type === 'ไม่รับเวร') return false;
      let effective = true;
      try { effective = typeof isLeaveEffective === 'function' ? isLeaveEffective(l) : true; }
      catch (_) { effective = !/reject|cancelled|canceled|ไม่อนุมัติ/.test(String(l.status || '').toLowerCase()); }
      if (!effective) return false;
      const s = normDate(l.start_date || l.leave_date || l.date);
      const e = normDate(l.end_date || l.start_date || l.leave_date || l.date);
      return s && e && d >= s && d <= e;
    });
  }
  function minutesToTime(totalMinutes){
    const total = Math.max(0, Math.round(Number(totalMinutes || 0)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${pad2(m)}`;
  }
  function allocateDummyRows(totals, month){
    const c = hrCycleRange(month);
    const dates = dateList(c.start, c.end);
    const rows = [];
    const problems = [];
    Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).forEach(([staffId, hr]) => {
      let remaining = Math.round(Number(hr || 0) * 60);
      const usableDates = dates.filter(d => !staffHasLeave(staffId, d));
      let dateIdx = 0;
      while (remaining > 0 && dateIdx < usableDates.length) {
        const date = usableDates[dateIdx++];
        const chunk = Math.min(remaining, 16 * 60);
        rows.push({ staff_id:staffId, date, start:'0:00', end:minutesToTime(chunk), hours:Math.round((chunk / 60) * 100) / 100 });
        remaining -= chunk;
      }
      if (remaining > 0) problems.push(`${staffName(staffId)} เหลือ ${hours(remaining / 60, 2)} ชม. เพราะวันในรอบ HR ที่ไม่ชนวันลาไม่พอ`);
    });
    if (problems.length) return { ok:false, message:`จัด Dummy Shift ไม่ครบ: ${problems.join(', ')}` };
    rows.sort((a,b) => a.date.localeCompare(b.date) || staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
    return { ok:true, rows, cycle:c };
  }
  function buildHrExport(month){
    const m = String(month || sourceMonth()).slice(0, 7);
    const r = monthRange(m);
    const c = hrCycleRange(m);
    const sourceRows = monthlyPendingRows(m);
    const totals = {}, actualTotals = {};
    sourceRows.forEach(row => {
      const n = normalizeHours(row);
      if (!Number.isFinite(Number(n.hrHours)) || Number(n.hrHours) <= 0) return;
      totals[row.staff_id] = Math.round(((totals[row.staff_id] || 0) + Number(n.hrHours || 0)) * 100) / 100;
      actualTotals[row.staff_id] = Math.round(((actualTotals[row.staff_id] || 0) + Number(n.actualHours || 0)) * 100) / 100;
    });
    if (!Object.keys(totals).length) return { ok:false, message:'ยังไม่มีรายการ Approved Pending ในเดือนเบิกจริงนี้' };
    const allocated = allocateDummyRows(totals, m);
    if (!allocated.ok) return allocated;
    const hrRows = allocated.rows.map(row => ({ no:employeeCode(row.staff_id), 'วันที่':Number(String(row.date).slice(-2)), 'เวลาเข้า':row.start, 'เวลาออก':row.end }));
    const summaryRows = sourceRows.map(row => {
      const n = normalizeHours(row);
      return { no:employeeCode(row.staff_id), 'ชื่อ':staffDisplay(row.staff_id), 'วันที่ OT จริง':normDate(row.work_date), 'เดือนเบิกจริง':m, 'รอบ HR dummy':`${c.start} ถึง ${c.end}`, 'ประเภทเวร':n.shiftType || '-', 'กลุ่มเรท':n.rateType || staffRateType(row.staff_id), 'วันนักขัตฤกษ์':n.isHoliday ? 'ใช่' : 'ไม่ใช่', 'ชั่วโมงจริง':n.actualHours || 0, 'ชั่วโมงเบิก HR':n.hrHours || 0, 'claim_status ก่อน Export':String(row.claim_status || 'Pending'), 'เหตุผล':String(row.reason || ''), 'หมายเหตุ':String(row.note || '') };
    });
    const staffTotals = Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).map(([staffId, hr]) => ({ no:employeeCode(staffId), 'ชื่อ':staffDisplay(staffId), 'ชั่วโมงจริงรวม':actualTotals[staffId] || 0, 'ชั่วโมงเบิก HR รวม':hr, 'จำนวนแถวดัมมี่ HR':allocated.rows.filter(x => String(x.staff_id) === String(staffId)).length }));
    const leaveSkipped = [];
    activeStaff().forEach(s => {
      dateList(c.start, c.end).forEach(d => { if (staffHasLeave(s.id, d)) leaveSkipped.push({ 'ชื่อ':staffDisplay(s.id), 'วันที่ลาในรอบ HR':d, 'หมายเหตุ':'ระบบห้ามสร้าง dummy shift ในวันนี้' }); });
    });
    return { ok:true, month:m, sourceRange:r, cycle:c, sourceRows, totals, actualTotals, allocated, hrRows, summaryRows, staffTotals, leaveSkipped };
  }
  function batchId(){
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  }
  function sqlErrorMessage(err){
    const msg = String(err?.message || err || '');
    if (/export_batch_id|exported_by|exported_at|claim_status|schema cache|column/i.test(msg)) return 'ฐานข้อมูลยังไม่มีคอลัมน์ Export/Claim History กรุณารันไฟล์ supabase_v238_ot_export_batch_fields.sql ใน Supabase SQL Editor ก่อนใช้ Export/ตีกลับ';
    return msg || 'อัปเดตสถานะ Export ไม่สำเร็จ';
  }
  async function markExported(ids, id){
    const now = new Date().toISOString();
    const actor = currentStaff();
    const payload = { claim_status:'exported', export_batch_id:id, exported_by:actor, exported_at:now, batch_id:id, export_date:now, claim_batch_id:id, claimed_at:now, claimed_by:actor };
    const res = await sb.from('ot_requests').update(payload).in('id', ids);
    if (res.error) throw new Error(sqlErrorMessage(res.error));
    return res;
  }
  async function exportHrV241(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (typeof XLSX === 'undefined') return toast('ไม่พบไลบรารี XLSX สำหรับ Export Excel', 'error');
    const m = sourceMonth();
    const result = buildHrExport(m);
    if (!result.ok) return toast(result.message || 'ไม่พบรายการ Export', 'error');
    const ids = Array.from(new Set((result.sourceRows || []).map(r => r.id).filter(Boolean)));
    if (!ids.length) return toast('ไม่พบ ID รายการ OT สำหรับล็อกการ Export ซ้ำ', 'error');
    const id = batchId();
    try { setBusy(true, 'กำลังสร้างไฟล์ HR จากเดือนเบิกจริง และล็อกสถานะ Export'); } catch (_) {}
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.hrRows, { header:['no','วันที่','เวลาเข้า','เวลาออก'] });
      for (let r=2; r <= result.hrRows.length + 1; r++) { const cell = ws[`A${r}`]; if (cell) { cell.t = 's'; cell.z = '@'; } }
      ws['!cols'] = [{wch:12},{wch:8},{wch:12},{wch:12}];
      const summary = XLSX.utils.json_to_sheet(result.summaryRows, { header:['no','ชื่อ','วันที่ OT จริง','เดือนเบิกจริง','รอบ HR dummy','ประเภทเวร','กลุ่มเรท','วันนักขัตฤกษ์','ชั่วโมงจริง','ชั่วโมงเบิก HR','claim_status ก่อน Export','เหตุผล','หมายเหตุ'] });
      summary['!cols'] = [{wch:12},{wch:18},{wch:14},{wch:12},{wch:24},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:18},{wch:32},{wch:42}];
      const total = XLSX.utils.json_to_sheet(result.staffTotals, { header:['no','ชื่อ','ชั่วโมงจริงรวม','ชั่วโมงเบิก HR รวม','จำนวนแถวดัมมี่ HR'] });
      const leave = XLSX.utils.json_to_sheet(result.leaveSkipped || [], { header:['ชื่อ','วันที่ลาในรอบ HR','หมายเหตุ'] });
      XLSX.utils.book_append_sheet(wb, ws, 'HR_OT');
      XLSX.utils.book_append_sheet(wb, summary, 'Source_OT_1_to_End');
      XLSX.utils.book_append_sheet(wb, total, 'Staff_Total');
      XLSX.utils.book_append_sheet(wb, leave, 'Leave_Skipped');
      XLSX.writeFile(wb, `HR_OT_${id}_source_${result.sourceRange.start}_to_${result.sourceRange.end}_dummy_${result.cycle.start}_to_${result.cycle.end}.xlsx`);
      await markExported(ids, id);
      await loadAllData();
      state.otSubtabV241 = 'summary';
      renderPage();
      toast(`Export HR สำเร็จ ${ids.length} รายการ / Batch ${id}`);
    } catch (err) {
      console.error(`${VERSION}: export failed`, err);
      toast(String(err?.message || err || 'Export ไม่สำเร็จ'), 'error');
    } finally { try { setBusy(false); } catch (_) {} }
  }

  function rowBatch(row){ return row?.export_batch_id || row?.batch_id || row?.claim_batch_id || 'ไม่พบ Batch ID'; }
  function rowExportedAt(row){ return row?.exported_at || row?.export_date || row?.claimed_at || ''; }
  function exportedBatches(){
    const groups = {};
    exportedRows().forEach(row => {
      const id = rowBatch(row);
      groups[id] = groups[id] || { rows:[], actual:0, hr:0, money:0, minDate:'', maxDate:'', exportedAt:'', exportedBy:'' };
      const g = groups[id];
      g.rows.push(row);
      const n = normalizeHours(row);
      const rt = n.rateType || staffRateType(row.staff_id);
      const rate = rateForType(rt);
      g.actual = Math.round((g.actual + Number(n.actualHours || 0)) * 100) / 100;
      g.hr = Math.round((g.hr + Number(n.hrHours || 0)) * 100) / 100;
      g.money = Math.round((g.money + Number(n.hrHours || 0) * rate) * 100) / 100;
      const d = normDate(row.work_date);
      if (d) { if (!g.minDate || d < g.minDate) g.minDate = d; if (!g.maxDate || d > g.maxDate) g.maxDate = d; }
      const at = rowExportedAt(row);
      if (at && (!g.exportedAt || String(at) > String(g.exportedAt))) g.exportedAt = at;
      if (row.exported_by || row.claimed_by) g.exportedBy = row.exported_by || row.claimed_by;
    });
    return Object.entries(groups).sort((a,b) => String(b[1].exportedAt || b[0]).localeCompare(String(a[1].exportedAt || a[0])));
  }
  function renderExportHistoryV241(){
    if (!isAdminSafe()) return emptySafe('เฉพาะ Admin เท่านั้น');
    const batches = exportedBatches();
    const total = batches.reduce((acc, [,g]) => { acc.count += g.rows.length; acc.hr += g.hr; acc.money += g.money; return acc; }, { count:0, hr:0, money:0 });
    if (!batches.length) return `<div class="card"><div class="section-title"><div><h3>ประวัติ Export HR</h3><p class="hint">รายการที่ Export แล้วจะมาอยู่หน้านี้ และสามารถตีกลับเป็น Pending ได้</p></div></div>${emptySafe('ยังไม่มีรายการ Exported')}</div>`;
    return `<div class="v241-export-history">
      <div class="card"><div class="section-title"><div><h3>ประวัติ Export HR</h3><p class="hint">รวม ${total.count} รายการ • ${hours(total.hr, 2)} ชั่วโมงเบิก HR • ${esc(money(total.money))} • ปุ่มตีกลับจะรีเซ็ตเป็น Pending เพื่อ Export ใหม่ได้</p></div></div></div>
      ${batches.map(([id,g]) => {
        const rows = [...g.rows].sort((a,b) => String(b.work_date || '').localeCompare(String(a.work_date || '')) || staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
        return `<div class="card v241-export-batch"><div class="section-title"><div><h3>Batch ${esc(id)}</h3><p class="hint">${rows.length} รายการ • ${hours(g.hr, 2)} ชั่วโมงเบิก HR • ${esc(money(g.money))} • วันที่ OT ${esc(g.minDate ? `${fmtDate(g.minDate)} - ${fmtDate(g.maxDate)}` : '-')} • Export เมื่อ ${esc(fmtDateTime(g.exportedAt))}${g.exportedBy ? ` • โดย ${esc(staffName(g.exportedBy))}` : ''}</p></div><button class="danger-btn" type="button" data-v241-revert-batch="${esc(id)}">ตีกลับ / ยกเลิก Export ทั้ง Batch</button></div>
          <div class="table-wrap"><table><thead><tr><th>วันที่ OT</th><th>เจ้าหน้าที่</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${rows.map(row => { const n = normalizeHours(row); return `<tr><td>${esc(fmtDate(normDate(row.work_date)))}</td><td>${staffPillSafe(row.staff_id)}</td><td>${hours(n.actualHours, 1)}</td><td><b>${hours(n.hrHours, 2)}</b></td><td>${esc(row.reason || '-')}</td><td>${badgeSafe('Exported', 'green')}</td><td><button class="tiny-btn danger" type="button" data-v241-revert-row="${esc(row.id)}">ตีกลับรายการนี้</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
      }).join('')}
    </div>`;
  }
  async function resetExportRows(ids){
    if (!ids.length) return toast('ไม่พบรายการที่ต้องตีกลับ', 'error');
    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog(`ต้องการตีกลับ / ยกเลิก Export ${ids.length} รายการกลับเป็น Pending ใช่ไหม?`, 'ยืนยันตีกลับ Export')
      : window.confirm(`ต้องการตีกลับ / ยกเลิก Export ${ids.length} รายการกลับเป็น Pending ใช่ไหม?`);
    if (!ok) return;
    try { setBusy(true, 'กำลังตีกลับ Export'); } catch (_) {}
    try {
      const payload = { claim_status:'pending', export_batch_id:null, exported_by:null, exported_at:null, batch_id:null, export_date:null, claim_batch_id:null, claimed_at:null, claimed_by:null };
      const res = await sb.from('ot_requests').update(payload).in('id', ids);
      if (res.error) throw new Error(sqlErrorMessage(res.error));
      await loadAllData();
      state.otSubtabV241 = 'history';
      renderPage();
      toast(`ตีกลับเป็น Pending แล้ว ${ids.length} รายการ`);
    } catch (err) { toast(String(err?.message || err || 'ตีกลับไม่สำเร็จ'), 'error'); }
    finally { try { setBusy(false); } catch (_) {} }
  }
  async function resetBatch(id){
    const ids = exportedRows().filter(r => String(rowBatch(r)) === String(id)).map(r => r.id).filter(Boolean);
    await resetExportRows(ids);
  }

  function removeDuplicateNavItems(){
    if (!Array.isArray(NAV_ITEMS)) return;
    const hiddenIds = new Set(['claimHistory']);
    for (let i = NAV_ITEMS.length - 1; i >= 0; i--) {
      if (hiddenIds.has(NAV_ITEMS[i]?.id)) NAV_ITEMS.splice(i, 1);
    }
  }
  removeDuplicateNavItems();

  function tabs(){
    const admin = isAdminSafe();
    const items = [
      ['mine','เวรของฉัน / ขอ OT'],
      ...(admin ? [['tracking','ติดตามเจ้าหน้าที่'], ['approve','อนุมัติ OT']] : []),
      ['summary','สรุป OT รายเดือน'],
      ...(admin ? [['export','Export HR'], ['history','ประวัติ Export']] : [])
    ];
    const active = state.otSubtabV241 || 'mine';
    return `<div class="v241-ot-tabs">${items.map(([id,label]) => `<button type="button" class="v241-ot-tab ${active===id?'active':''}" data-ot-subtab-v241="${esc(id)}">${esc(label)}</button>`).join('')}</div>`;
  }
  function templateFrom(html){
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    return tpl;
  }
  function outer(el){ return el ? el.outerHTML : ''; }
  function cardByText(tpl, text){
    return Array.from(tpl.content.querySelectorAll('.card')).find(el => (el.textContent || '').includes(text));
  }
  function renderSummaryPart(part){
    const tpl = templateFrom(renderOtSummaryV241());
    const notice = outer(tpl.content.querySelector('.v241-logic-notice'));
    if (part === 'export') return `${notice}${outer(tpl.content.querySelector('.v241-hr-export-section')) || emptySafe('ไม่พบส่วน Export HR')}`;
    return `${notice}${outer(tpl.content.querySelector('.v241-real-month-section')) || emptySafe('ไม่พบส่วนสรุป OT รายเดือน')}`;
  }

  function extractSections(baseHtml){
    const tpl = templateFrom(baseHtml);
    const isAdm = isAdminSafe();
    const section2Cards = Array.from(tpl.content.querySelectorAll('.card')).filter(el => (el.textContent || '').includes('ส่วนที่ 2 ขอ OT เพิ่ม'));
    return {
      tracking: outer(tpl.content.querySelector('#v234AdminFollowCard')),
      adminAttendance: outer(cardByText(tpl, 'ส่วนที่ 1 ยืนยันวันอยู่เวรแทนเจ้าหน้าที่')),
      staffToday: outer(tpl.content.querySelector('.my-duty-today-card')) || outer(cardByText(tpl, 'เวรของฉันตามวันที่เลือก')) || outer(cardByText(tpl, 'ส่วนที่ 1 เวรของฉัน')),
      extraOt: outer(isAdm ? section2Cards.find(el => (el.textContent || '').includes('เลือกชื่อเจ้าหน้าที่')) : section2Cards[0]),
      myMonth: outer(tpl.content.querySelector('.v219-my-month-card, .my-duty-month-section')),
      myList: outer(cardByText(tpl, 'รายการ OT ของฉัน')),
      approval: outer(cardByText(tpl, 'ส่วนที่ 3 อนุมัติ OT')),
      ch4: outer(tpl.content.querySelector('.v234-ch4-shared-card')),
      repair: outer(tpl.content.querySelector('.v219-ot-repair-panel'))
    };
  }
  function renderOtPageV241(){
    if (isAdminSafe() && state.otAdminDutyStatusFilterV234 == null && !state.__v241TrackingDefaulted) {
      state.otAdminDutyStatusFilterV234 = 'ยังไม่ยืนยัน';
      state.__v241TrackingDefaulted = true;
    }
    const base = previousRenderOtPage ? String(previousRenderOtPage.apply(this, arguments) || '') : '';
    const s = extractSections(base);
    const active = state.otSubtabV241 || 'mine';
    let content = '';
    if (active === 'tracking') content = s.tracking || emptySafe('ไม่พบส่วนติดตามเจ้าหน้าที่');
    else if (active === 'approve') content = `${s.repair || ''}${s.approval || emptySafe('ไม่พบส่วนอนุมัติ OT')}`;
    else if (active === 'summary') content = `<div class="card" style="grid-column:1/-1;"><div class="section-title"><div><h3>สรุป OT รายเดือน</h3><p class="hint">ยอดเงินจริงใช้เดือน 1-สิ้นเดือน แสดง Approved ทั้ง Pending และ Exported</p></div></div>${renderSummaryPart('monthly')}</div>`;
    else if (active === 'export') content = `<div class="card" style="grid-column:1/-1;"><div class="section-title"><div><h3>Export HR</h3><p class="hint">นำ OT จริงของเดือน 1-สิ้นเดือน ไปกระจายเป็น HR dummy ในรอบ 16-15</p></div></div>${renderSummaryPart('export')}</div>`;
    else if (active === 'history') content = renderExportHistoryV241();
    else {
      content = isAdminSafe()
        ? `${s.adminAttendance || ''}${s.extraOt || ''}${s.ch4 || ''}`
        : `${s.staffToday || ''}${s.extraOt || ''}${s.ch4 || ''}${s.myMonth || ''}${s.myList || ''}`;
      if (!content.trim()) content = base;
    }
    return `<div class="v241-ot-page"><div class="card v241-ot-menu-card"><div class="section-title"><div><h3>OT / HR Export</h3><p class="hint">ทุกขั้นตอนอยู่ในเมนูเดียว เลือกหัวข้อย่อยด้านล่าง</p></div></div>${tabs()}</div><div class="grid grid-2 ot-page v241-ot-content">${content}</div></div>`;
  }
  window.renderOtPage = renderOtPage = renderOtPageV241;

  window.renderPage = renderPage = function renderPageV241(){
    removeDuplicateNavItems();
    if (state.page === 'claimHistory') { state.page = 'ot'; state.otSubtabV241 = 'history'; }
    return previousRenderPage ? previousRenderPage.apply(this, arguments) : undefined;
  };

  document.addEventListener('click', async function(e){
    const tabBtn = e.target?.closest?.('[data-ot-subtab-v241]');
    if (tabBtn) {
      e.preventDefault();
      state.otSubtabV241 = tabBtn.getAttribute('data-ot-subtab-v241') || 'mine';
      renderPage();
      return;
    }
    const oldHistory = e.target?.closest?.('[data-page="claimHistory"]');
    if (oldHistory) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      state.page = 'ot';
      state.otSubtabV241 = 'history';
      renderPage();
      return;
    }
    const exportBtn = e.target?.closest?.('[data-export-hr-v241]');
    if (exportBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      await exportHrV241();
      return;
    }
    const rowBtn = e.target?.closest?.('[data-v241-revert-row]');
    if (rowBtn) {
      e.preventDefault();
      e.stopPropagation();
      await resetExportRows([rowBtn.getAttribute('data-v241-revert-row')]);
      return;
    }
    const batchBtn = e.target?.closest?.('[data-v241-revert-batch]');
    if (batchBtn) {
      e.preventDefault();
      e.stopPropagation();
      await resetBatch(batchBtn.getAttribute('data-v241-revert-batch'));
    }
  }, true);

  document.addEventListener('change', function(e){
    const id = e.target?.id || '';
    if (id === 'otMoneyMonthV241' || id === 'otSourceMonthV241') {
      const value = String(e.target.value || sourceMonth()).slice(0, 7);
      state.otMoneyMonthV241 = value;
      state.otSourceMonthV241 = value;
      state.otMoneyMonthV238 = value;
      state.hrExportMonthV238 = value;
      state.hrExportMonthV234 = value;
      renderPage();
    }
  }, true);

  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v241-ot-single-menu-month-export-fix.js", error); }
;

/* Original source: patch-v244-personal-position-permissions-tab.js */
try {
/* =========================
   V244 Personal Position Permissions Tab
   - Remove "สิทธิ์ตำแหน่งรายวัน" from the Admin sidebar.
   - Keep the existing eligibility data/table; move the UI under "จัดการตำแหน่ง" as a tab named "สิทธิ์เฉพาะบุคคล".
   - Slot Master remains the main rule source; personal permissions are only per-person overrides/exceptions.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V244_PERSONAL_POSITION_PERMISSIONS_TAB';
  if (window.__CNMI_V244_PERSONAL_POSITION_PERMISSIONS_TAB__) return;
  window.__CNMI_V244_PERSONAL_POSITION_PERMISSIONS_TAB__ = true;

  const TAB_STATE_KEY = 'cnmi_position_management_subtab_v244';

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function adminSafe(){
    try { return !!isAdmin(); } catch (_) { return !!(state && state.profile && state.profile.role === 'admin'); }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  }
  function navItems(){
    try { if (Array.isArray(NAV_ITEMS)) return NAV_ITEMS; } catch (_) {}
    try { if (Array.isArray(window.NAV_ITEMS)) return window.NAV_ITEMS; } catch (_) {}
    return [];
  }
  function removeEligibilityNav(){
    const items = navItems();
    if (!items.length) return;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i] && items[i].id === 'eligibility') items.splice(i, 1);
    }
    let pm = items.find(x => x && x.id === 'positionManagement');
    if (!pm) {
      const usersIdx = items.findIndex(x => x && x.id === 'users');
      const entry = { id:'positionManagement', icon:'🧭', title:'จัดการตำแหน่ง', subtitle:'เพิ่ม/แก้ไข Slot และกำหนดสิทธิ์เฉพาะบุคคล', group:'admin' };
      if (usersIdx >= 0) items.splice(usersIdx + 1, 0, entry); else items.push(entry);
      pm = entry;
    }
    pm.title = 'จัดการตำแหน่ง';
    pm.subtitle = 'เพิ่ม/แก้ไข Slot และกำหนดสิทธิ์เฉพาะบุคคล';
  }
  function normalizeTab(raw){
    const text = String(raw || '').trim();
    return text === 'permissions' ? 'permissions' : 'slots';
  }
  function currentTab(){
    const fromState = state && state.positionManagementSubtabV244;
    if (fromState) return normalizeTab(fromState);
    try { return normalizeTab(localStorage.getItem(TAB_STATE_KEY)); } catch (_) { return 'slots'; }
  }
  function setTab(tab){
    const val = normalizeTab(tab);
    if (state) state.positionManagementSubtabV244 = val;
    try { localStorage.setItem(TAB_STATE_KEY, val); } catch (_) {}
    return val;
  }
  function setHeader(){
    try {
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = 'จัดการตำแหน่ง';
      if (subtitle) subtitle.textContent = 'เพิ่ม/แก้ไข Slot และกำหนดสิทธิ์เฉพาะบุคคล';
    } catch (_) {}
  }
  function tabBar(){
    const active = currentTab();
    const tab = (id, label, hint) => `<button type="button" class="v244-position-tab ${active===id?'active':''}" data-v244-position-tab="${esc(id)}"><b>${esc(label)}</b><small>${esc(hint)}</small></button>`;
    return `<div class="card v244-position-tabs-card">
      <div class="section-title"><div><h3>จัดการตำแหน่ง</h3><p class="hint">ให้ Slot Master เป็นกฎหลัก ส่วนสิทธิ์เฉพาะบุคคลใช้เป็นข้อยกเว้นรายคนเท่านั้น</p></div></div>
      <div class="v244-position-tabs">${tab('slots','ชุด Slot ตำแหน่งกลางวัน','เพิ่ม / แก้ไข / ลบ / เรียง Slot')}${tab('permissions','สิทธิ์เฉพาะบุคคล','กำหนดคนที่ทำบางตำแหน่งได้จริง')}</div>
    </div>`;
  }
  function normalizeEligibilityHtml(html){
    let out = String(html || '');
    out = out.replace(/สิทธิ์ตำแหน่งรายวัน/g, 'สิทธิ์เฉพาะบุคคล');
    out = out.replace(/บันทึกสิทธิ์ตำแหน่ง/g, 'บันทึกสิทธิ์เฉพาะบุคคล');
    out = out.replace(/กำหนดว่าแต่ละคนขึ้นตำแหน่งไหนได้/g, 'กำหนดข้อยกเว้นรายคนจาก Slot Master');
    out = out.replace(/ติ๊กเฉพาะตำแหน่งที่ขึ้นงานได้จริง ระบบ Auto Assign จะใช้ข้อมูลนี้เป็นตัวกรองหลัก/g, 'ค่าเริ่มต้นอิงจาก Slot Master และผู้ปฏิบัติหลัก หน้านี้ใช้เฉพาะกรณีที่ต้องกำหนดสิทธิ์รายคนเพิ่มเติม');
    out = out.replace(/ข้อมูลตำแหน่งมาจากหน้า “จัดการตำแหน่ง” แบบ Dynamic/g, 'ข้อมูลตำแหน่งมาจาก Slot Master ในหน้า “จัดการตำแหน่ง”');
    return out;
  }
  function slotBodyHtml(){
    const root = document.getElementById('pageContent');
    if (root && window.cnmiV224 && typeof window.cnmiV224.renderPositionManagementV224 === 'function') {
      try {
        window.cnmiV224.renderPositionManagementV224();
        const html = root.innerHTML || '';
        root.innerHTML = '';
        return html || `<div class="card">ยังไม่พบหน้าจัดการ Slot</div>`;
      } catch (err) {
        console.warn(`${VERSION}: capture slot page failed`, err);
      }
    }
    return `<div class="card"><h3>ชุด Slot ตำแหน่งกลางวัน</h3><p class="hint">ยังโหลดหน้าจัดการ Slot ไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง</p></div>`;
  }
  function permissionBodyHtml(){
    if (!adminSafe()) {
      try { return noPermission(); } catch (_) { return '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>'; }
    }
    let html = '';
    try { html = typeof renderEligibilityPage === 'function' ? renderEligibilityPage() : ''; }
    catch (err) { html = `<div class="card error-notice">โหลดสิทธิ์เฉพาะบุคคลไม่สำเร็จ: ${esc(err && (err.message || err))}</div>`; }
    if (!html) html = `<div class="card">ยังไม่พบข้อมูลสิทธิ์เฉพาะบุคคล</div>`;
    return `<div class="v244-permission-tab-body">${normalizeEligibilityHtml(html)}</div>`;
  }
  function renderTabbedPositionManagement(){
    try {
      if (!state || state.page !== 'positionManagement') return;
      const root = document.getElementById('pageContent');
      if (!root) return;
      removeEligibilityNav();
      setHeader();
      const active = currentTab();
      const body = active === 'permissions' ? permissionBodyHtml() : slotBodyHtml();
      root.innerHTML = `<div class="v244-position-management-page">${tabBar()}${body}</div>`;
      // Let older helper patches re-inject their controls (Slot หลัก, รายละเอียดล่าสุด V240) into the wrapped Slot tab.
      setTimeout(() => { try { if (state.page === 'positionManagement' && currentTab() === 'slots') document.body.dispatchEvent(new Event('cnmi-v244-slot-tab-rendered')); } catch (_) {} }, 0);
    } catch (err) {
      console.error(`${VERSION}: render failed`, err);
    }
  }

  async function savePositionEligibilityV244(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const checks = Array.from(document.querySelectorAll('[data-eligibility]'));
    const rowMap = new Map();
    checks.forEach(cb => {
      const staffId = cb.dataset.staffId;
      const positionCode = cb.dataset.positionCode;
      if (!staffId || !positionCode) return;
      rowMap.set(`${staffId}|${positionCode}`, {
        staff_id: staffId,
        position_code: positionCode,
        is_eligible: !!cb.checked,
        updated_by: (typeof currentStaffId === 'function' ? currentStaffId() : state?.profile?.id || null)
      });
    });
    const rows = Array.from(rowMap.values());
    if (!rows.length) return toast('ไม่มีข้อมูลสิทธิ์เฉพาะบุคคลให้บันทึก');
    if (typeof sb === 'undefined' || !sb) return toast('ไม่พบ Supabase client', 'error');
    const { error } = await sb.from('daily_position_eligibility').upsert(rows, { onConflict: 'staff_id,position_code' });
    if (error) {
      let msg = error.message || String(error);
      try { msg = friendlyDbError(error); } catch (_) {}
      return toast(msg, 'error');
    }
    try { await loadAllData(); } catch (_) {}
    if (state) { state.page = 'positionManagement'; state.positionManagementSubtabV244 = 'permissions'; }
    try { renderPage(); } catch (_) { renderTabbedPositionManagement(); }
    toast('บันทึกสิทธิ์เฉพาะบุคคลแล้ว');
  }

  function installSaveOverride(){
    try { window.savePositionEligibility = savePositionEligibility = savePositionEligibilityV244; }
    catch (_) { window.savePositionEligibility = savePositionEligibilityV244; }
  }

  removeEligibilityNav();
  installSaveOverride();

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage && !previousRenderPage.__v244PositionPermissionTabWrapped) {
    const wrapped = function renderPageV244(){
      removeEligibilityNav();
      if (state && state.page === 'eligibility') {
        state.page = 'positionManagement';
        setTab('permissions');
      }
      const out = previousRenderPage.apply(this, arguments);
      if (state && state.page === 'positionManagement') {
        setTimeout(renderTabbedPositionManagement, 35);
        setTimeout(renderTabbedPositionManagement, 120);
      }
      return out;
    };
    wrapped.__v244PositionPermissionTabWrapped = true;
    window.renderPage = renderPage = wrapped;
  }

  document.addEventListener('click', function(e){
    const tab = e.target && e.target.closest && e.target.closest('[data-v244-position-tab]');
    if (tab) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (state) state.page = 'positionManagement';
      setTab(tab.getAttribute('data-v244-position-tab'));
      try { renderPage(); } catch (_) { renderTabbedPositionManagement(); }
      return;
    }
    const oldEligibilityNav = e.target && e.target.closest && e.target.closest('[data-page="eligibility"]');
    if (oldEligibilityNav) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (state) state.page = 'positionManagement';
      setTab('permissions');
      try { renderPage(); } catch (_) { renderTabbedPositionManagement(); }
      return;
    }
  }, true);

  document.addEventListener('change', function(e){
    if (e.target && e.target.id === 'eligibilityStaffSelect' && state && state.page === 'positionManagement') {
      state.eligibilityStaffId = e.target.value;
      setTab('permissions');
      setTimeout(renderTabbedPositionManagement, 0);
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v244-position-management-page{display:block}
    .v244-position-tabs-card{margin-bottom:14px}
    .v244-position-tabs{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}
    .v244-position-tab{border:1px solid #dbeafe;background:#f8fbff;border-radius:18px;padding:12px 16px;min-width:220px;text-align:left;cursor:pointer;box-shadow:0 8px 20px rgba(15,23,42,.04)}
    .v244-position-tab b{display:block;color:#0f172a;font-size:14px;margin-bottom:3px}
    .v244-position-tab small{display:block;color:#64748b;font-size:12px;line-height:1.35}
    .v244-position-tab.active{background:#e0f2fe;border-color:#7dd3fc;box-shadow:0 10px 24px rgba(14,165,233,.14)}
    .v244-position-tab.active b{color:#075985}
    .v244-permission-tab-body .eligibility-page{margin-top:0}
    .v244-permission-tab-body .eligibility-position-panel .section-title h3{color:#0f172a}
    @media(max-width:760px){.v244-position-tab{width:100%;min-width:0}.v244-position-tabs-card .section-title{align-items:flex-start}}
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    try {
      removeEligibilityNav();
      if (typeof renderNav === 'function') renderNav();
      if (state && state.page === 'positionManagement') renderTabbedPositionManagement();
      if (state && state.page === 'eligibility') { state.page = 'positionManagement'; setTab('permissions'); renderPage(); }
    } catch (err) { console.warn(`${VERSION}: initial refresh skipped`, err); }
  }, 180);

  window.cnmiV244PositionPermissions = { renderTabbedPositionManagement, setTab, currentTab, removeEligibilityNav };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v244-personal-position-permissions-tab.js", error); }
;
