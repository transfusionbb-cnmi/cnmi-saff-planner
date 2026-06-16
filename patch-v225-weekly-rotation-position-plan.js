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
        ${noPosition ? emptySafe('ไม่มีตารางตำแหน่งรายวันสำหรับวันนี้') : table}
      </div>`;
    } catch (err) {
      console.error(`${VERSION}: renderPositionsPage failed`, err);
      return `<div class="notice error-notice">โหลดตารางตำแหน่งรายวันไม่สำเร็จ: ${esc(err?.message || err)}</div>`;
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
        if (title) title.textContent = item.title || 'ตารางตำแหน่งรายวัน';
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
