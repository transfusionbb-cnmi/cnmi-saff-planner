/* =========================
   V231 Main Slot Count + weekly leave-aware monthly position plan
   - Rename scheduler menu/header wording where monthly position page was shown as จัดตารางเวร.
   - Add Admin configuration for primary daytime slot count (10-14) on Position Management.
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
  const SLOT_SET_LIST = [10, 11, 12, 13, 14];

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
    return Math.max(10, Math.min(14, Math.round(x)));
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
    if (Number.isFinite(n) && n >= 10 && n <= 14) return clampSlot231(n);
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
    if (Number.isFinite(direct) && direct >= 10 && direct <= 14) return clampSlot231(direct);
    try {
      const obj = JSON.parse(text);
      const n = Number(obj?.base_slot_count ?? obj?.baseSlotCount ?? obj?.slot_count ?? obj?.count);
      if (Number.isFinite(n) && n >= 10 && n <= 14) return clampSlot231(n);
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
          sched.title = 'จัดตารางตำแหน่งรายเดือน';
          sched.subtitle = 'สร้าง/ตรวจทานแผนตำแหน่งรายเดือน';
        }
        const pm = NAV_ITEMS.find(x => x.id === 'positionMonth');
        if (pm) {
          pm.title = 'จัดตารางตำแหน่งรายเดือน';
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
      if (isMonthlyPosition && title && title.textContent.trim() === 'จัดตารางเวร') title.textContent = 'จัดตารางตำแหน่งรายเดือน';
      if (state?.page === 'positionMonth' && title) title.textContent = 'จัดตารางตำแหน่งรายเดือน';
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
    if (n <= 10) return 10;
    if (n >= 14) return 14;
    return Math.max(10, Math.min(14, Math.round(n)));
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
    const list = [...daySlotsForCount231(14), ...allDaySlots231(), ...outingTemplates231(outingCount), ...outingTemplates231(13), ...outingTemplates231(14)];
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
    const desired = Math.max(10, base - fullOut);
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
      html = html.replace(/จัดตำแหน่งรายเดือน/g, 'จัดตารางตำแหน่งรายเดือน');
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
