/* =========================
   V223 monthly position auto plan + source-template only position management
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V223_MONTH_PLAN_SOURCE_TEMPLATE_ONLY';
  if (window.__CNMI_V223_MONTH_PLAN_SOURCE_TEMPLATE_ONLY__) return;
  window.__CNMI_V223_MONTH_PLAN_SOURCE_TEMPLATE_ONLY__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const norm = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } };
  const pad2 = (n) => String(n).padStart(2, '0');
  const toast = (msg, tone) => { try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } };
  const adminOk = () => { try { return isAdmin(); } catch (_) { return false; } };
  const currentId = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } };
  const todayKey = () => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } };
  const monthNow = () => { try { return monthKey(new Date()); } catch (_) { return todayKey().slice(0,7); } };
  function rangeOfMonth(key){
    try { const r = getMonthRange(key); return { y:r.y, m:r.m, last:r.last || new Date(r.y, r.m, 0).getDate() }; }
    catch (_) { const [yy,mm] = String(key || monthNow()).split('-').map(Number); const y = yy || new Date().getFullYear(); const m = mm || (new Date().getMonth()+1); return { y, m, last:new Date(y, m, 0).getDate() }; }
  }
  function monthKeyFromUi(){
    const input = document.getElementById('positionMonthInput');
    return String(input?.value || state?.positionMonthKey || state?.monthKey || monthNow()).slice(0,7);
  }
  function isNoPosition(date){
    try { return !!isNoPositionDay(date); } catch (_) {}
    try { return (typeof isWeekend === 'function' && isWeekend(date)) || (typeof isHolidayDate === 'function' && isHolidayDate(date)); } catch (_) {}
    const d = new Date(`${date}T00:00:00`);
    return d.getDay() === 0 || d.getDay() === 6;
  }
  function activePositionStaff(date){
    try {
      if (typeof dailyWorkingStaff === 'function') {
        const list = dailyWorkingStaff(date) || [];
        if (list.length) return list;
      }
    } catch (_) {}
    let rows = Array.isArray(state?.staff) ? state.staff.slice() : [];
    rows = rows.filter(st => {
      try { return isDailyPositionEnabled(st) && !isActiveLeaveOn(st.id, date); }
      catch (_) { return st?.id && st?.is_active !== false && st?.active !== false; }
    });
    try { return orderedStaff(rows); } catch (_) { return rows.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function normalSlotsForDate(date){
    try {
      const api = window.cnmiDayPositionSlotsV218;
      if (api?.daySlotsForDate218) {
        const list = api.daySlotsForDate218(date) || [];
        if (list.length) return list.map(p => ({ ...p }));
      }
    } catch (_) {}
    try {
      const list = positionTemplateForDate(date) || [];
      if (list.length) return list.filter(p => String(p?.zone || '') !== 'ออกหน่วย').map(p => ({ ...p }));
    } catch (_) {}
    const fallback = Array.isArray(window.ALL_POSITION_TEMPLATES) ? window.ALL_POSITION_TEMPLATES : (typeof ALL_POSITION_TEMPLATES !== 'undefined' ? ALL_POSITION_TEMPLATES : []);
    return fallback.filter(p => p && p.code && String(p.zone || '') !== 'ออกหน่วย').map(p => ({ ...p }));
  }
  function outingSlotsForDate(date){
    try {
      if (window.cnmiPositionCatalogV182?.outingPositions182) return (window.cnmiPositionCatalogV182.outingPositions182() || []).map(p => ({ ...p }));
    } catch (_) {}
    try { return (OUTING_POSITIONS || []).map(p => ({ ...p, is_outing:true })); } catch (_) { return []; }
  }
  function hasOutingSafe(date){ try { return !!hasOuting(date); } catch (_) { return false; } }
  function outingIds(date){ try { return new Set(outingParticipants(date) || []); } catch (_) { return new Set(); } }
  function baseCode(code){ try { return positionBaseCode(code); } catch (_) { return String(code || '').replace(/\s+#\d+$/, '').trim(); } }
  function zoneGroup(pos){
    const z = String(pos?.zone || '').trim();
    if (z === 'Blood Bank' || z === 'Manual') return 'BB/Manual';
    if (z === 'Donor Room') return 'Donor Room';
    if (z === 'ออกหน่วย') return 'Outing';
    return z || 'Other';
  }
  function isQc(pos){
    const c = baseCode(pos?.code || pos?.position_code || '');
    return /^BB-Report/.test(c) || c === 'DR-Processing' || c === 'DR-Preparation';
  }
  function loadWeight(pos){
    try { return Number(positionLoadWeight(pos)) || 1; } catch (_) {}
    const c = baseCode(pos?.code || '');
    if (/^BB-Report/.test(c) || c === 'DR-Processing') return 1.35;
    if (/^BB-Manual/.test(c) || c === 'BB-Approve') return 1.2;
    return 1;
  }
  function fiscalStart(date){
    const d = new Date(`${norm(date)}T00:00:00`);
    const y = Number.isFinite(d.getTime()) ? d.getFullYear() : new Date().getFullYear();
    const m = Number.isFinite(d.getTime()) ? d.getMonth() : new Date().getMonth();
    return `${m >= 9 ? y : y - 1}-10-01`;
  }
  function historicalStats(staffId, date){
    const start = fiscalStart(date);
    const end = norm(date);
    const out = { group:{}, qc:0, code:{} };
    (state.positions || []).forEach(r => {
      const d = norm(r?.work_date);
      if (!d || d < start || d >= end || String(r?.staff_id || '') !== String(staffId || '')) return;
      const pos = { code:r?.position_code || r?.code, position_code:r?.position_code, zone:r?.zone };
      const g = zoneGroup(pos);
      const c = baseCode(pos.code || '');
      out.group[g] = (out.group[g] || 0) + 1;
      out.code[c] = (out.code[c] || 0) + 1;
      if (isQc(pos)) out.qc += 1;
    });
    return out;
  }
  function initCount(staffId){ return { total:0, load:0, group:{}, code:{}, qc:0 }; }
  function addCount(counts, staffId, pos){
    if (!staffId || !pos) return;
    const c = counts[staffId] || (counts[staffId] = initCount(staffId));
    const g = zoneGroup(pos); const code = baseCode(pos.code || pos.position_code || '');
    c.total += 1;
    c.load += loadWeight(pos);
    c.group[g] = (c.group[g] || 0) + 1;
    c.code[code] = (c.code[code] || 0) + 1;
    if (isQc(pos)) c.qc += 1;
  }
  function basicRuleOk(staff, pos){
    const rule = String(pos?.main_rule || '').toLowerCase();
    const nick = String(staff?.nickname || '').trim();
    const type = String(staff?.staff_type || '').trim();
    const isMt = type === 'MT' || /mt/i.test(type);
    const isClerk = type === 'เคิก' || /clerk/i.test(type) || /ธุรการ/.test(type);
    if (/mt/.test(rule) && /เท่านั้น/.test(rule) && nick !== 'แตง') return isMt;
    if ((/clerk/.test(rule) || /เคิก/.test(rule)) && /แตง/.test(rule) && !/mt/.test(rule)) return isClerk || nick === 'แตง';
    if (/mt/.test(rule) && /แตง/.test(rule)) return isMt || nick === 'แตง';
    return true;
  }
  function eligible(staff, pos, date, strict=true){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff) || isActiveLeaveOn(staff.id, date)) return false; } catch (_) {}
    if (strict) {
      try { if (typeof positionCandidateOk === 'function') return !!positionCandidateOk(staff, pos, date); } catch (_) {}
      try { if (!positionRuleOk(staff, pos?.main_rule)) return false; } catch (_) { if (!basicRuleOk(staff, pos)) return false; }
      try { return positionEligible(staff, pos?.eligibility_code || pos?.code); } catch (_) { return true; }
    }
    return basicRuleOk(staff, pos);
  }
  function scoreStaff(staff, pos, counts, rows, date){
    const id = staff.id;
    const c = counts[id] || initCount(id);
    const hist = historicalStats(id, date);
    const g = zoneGroup(pos);
    const code = baseCode(pos.code || '');
    let score = 0;
    score += c.load * 70;
    score += c.total * 25;
    score += (c.group[g] || 0) * 95;
    score += (hist.group[g] || 0) * 12;
    score += (c.code[code] || 0) * 180;
    score += (hist.code[code] || 0) * 20;
    if (isQc(pos)) score += (c.qc || 0) * 220 + (hist.qc || 0) * 55;
    try { score += (Number(monthPositionCandidateScore(staff, pos, counts, rows, date, {})) || 0) * 0.15; } catch (_) {}
    return score;
  }
  function chooseStaff(pos, date, pool, used, counts, rows){
    let candidates = pool.filter(st => !used.has(String(st.id)) && eligible(st, pos, date, true));
    if (!candidates.length) candidates = pool.filter(st => !used.has(String(st.id)) && eligible(st, pos, date, false));
    candidates.sort((a,b) => scoreStaff(a, pos, counts, rows, date) - scoreStaff(b, pos, counts, rows, date) || (typeof compareStaffOrder === 'function' ? compareStaffOrder(a,b) : String(a.nickname || '').localeCompare(String(b.nickname || ''), 'th')));
    return candidates[0] || null;
  }
  function makeRow(date, staff, pos){
    try {
      if (typeof rowForStaffPosition === 'function') {
        const r = rowForStaffPosition(staff, date, pos, {});
        if (r?.staff_id && r?.position_code) return r;
      }
    } catch (_) {}
    return {
      work_date: date,
      position_code: pos.code,
      zone: pos.zone || '',
      break_time: pos.break_time || '-',
      main_rule: pos.main_rule || '',
      job_desc: pos.job_desc || '',
      staff_id: staff.id,
      updated_by: currentId()
    };
  }
  function blankRowsForMonth(key){
    const { y, m, last } = rangeOfMonth(key);
    const rows = [];
    for (let day=1; day<=last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (isNoPosition(date)) continue;
      activePositionStaff(date).forEach(st => rows.push({ work_date:date, position_code:'', code:'', zone:'', break_time:'', main_rule:'', job_desc:'', staff_id:st.id, updated_by:currentId(), _blankTableV223:true }));
    }
    return { monthKey:key, rows, blankTable:true };
  }
  function buildAutoPlan(key){
    const { y, m, last } = rangeOfMonth(key);
    const rows = [];
    const counts = {};
    for (let day=1; day<=last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (isNoPosition(date)) continue;
      const working = activePositionStaff(date);
      if (!working.length) continue;
      const used = new Set();
      let slots = [];
      let pools = [{ slots:null, pool:working }];
      if (hasOutingSafe(date)) {
        const outIds = outingIds(date);
        const outingPool = working.filter(st => outIds.has(st.id));
        const roomPool = working.filter(st => !outIds.has(st.id));
        const roomSlots = normalSlotsForDate(date).filter(p => ['Blood Bank','Manual'].includes(String(p.zone || '')));
        const outingSlots = outingSlotsForDate(date);
        pools = [
          { slots:outingSlots, pool:outingPool },
          { slots:roomSlots, pool:roomPool }
        ];
      } else {
        slots = normalSlotsForDate(date);
        pools = [{ slots, pool:working }];
      }
      pools.forEach(group => {
        (group.slots || []).forEach(pos => {
          const st = chooseStaff(pos, date, group.pool || [], used, counts, rows);
          if (!st) return;
          used.add(String(st.id));
          rows.push(makeRow(date, st, pos));
          addCount(counts, st.id, pos);
        });
      });
    }
    return { monthKey:key, rows, autoPlanV223:true };
  }
  async function confirmReplace(action){
    const key = monthKeyFromUi();
    const hasRealDraft = state?.monthPositionDraft?.monthKey === key && (state.monthPositionDraft.rows || []).some(r => r?.position_code);
    if (!hasRealDraft) return true;
    try { if (typeof confirmDialog === 'function') return await confirmDialog(`มีร่างที่ยังไม่ได้บันทึก ต้องการ${action}และแทนที่ร่างเดิมหรือไม่?`, 'ยืนยันแทนที่ร่าง'); } catch (_) {}
    return window.confirm(`มีร่างที่ยังไม่ได้บันทึก ต้องการ${action}และแทนที่ร่างเดิมหรือไม่?`);
  }
  async function createBlank(){
    if (!adminOk()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (!(await confirmReplace('สร้างตารางที่ไม่มีตำแหน่ง'))) return;
    const key = monthKeyFromUi();
    state.positionMonthKey = key;
    state.monthPositionDraft = blankRowsForMonth(key);
    renderPage();
    toast('สร้างตารางที่ไม่มีตำแหน่งแล้ว เลือกตำแหน่งเองแล้วกดบันทึก/ประกาศ');
  }
  async function generateAuto(){
    if (!adminOk()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (!(await confirmReplace('สร้างแผนทั้งเดือน'))) return;
    const key = monthKeyFromUi();
    let draft;
    try { draft = buildAutoPlan(key); } catch (err) { console.error(`${VERSION}: auto build failed`, err); return toast('สร้างแผนอัตโนมัติไม่สำเร็จ: ' + (err?.message || String(err)), 'error'); }
    state.positionMonthKey = key;
    state.monthPositionDraft = draft;
    renderPage();
    const real = (draft.rows || []).filter(r => r?.position_code && r?.staff_id).length;
    if (!real) return toast('ยังสร้างแผนอัตโนมัติไม่ได้ เพราะไม่พบ Slot หรือเจ้าหน้าที่ที่เข้าเงื่อนไข', 'error');
    toast(`สร้างแผนทั้งเดือนแล้ว ${real} รายการ ตรวจทานก่อนบันทึก/ประกาศ`);
  }

  // override global builder too, so Save does not fall back to blank when no draft exists.
  window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV223(key){
    return buildAutoPlan(String(key || monthKeyFromUi()).slice(0,7));
  };

  window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV223(){
    if (!adminOk()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>';
    const key = state.positionMonthKey || state.monthKey || monthNow();
    const r = rangeOfMonth(key);
    const dates = Array.from({ length:r.last }, (_,i) => `${r.y}-${pad2(r.m)}-${pad2(i+1)}`);
    const rows = state.monthPositionDraft?.monthKey === key ? (state.monthPositionDraft.rows || []) : (state.positions || []).filter(x => String(x.work_date || '').startsWith(key));
    const savedCount = (state.positions || []).filter(x => String(x.work_date || '').startsWith(key)).length;
    const workingDays = dates.filter(d => !isNoPosition(d)).length;
    const matrix = typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix(rows, dates) : '';
    return `<div class="card monthly-position-page v223-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3></div></div>
      <div class="v223-month-toolbar">
        <label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label>
        <button class="ghost-btn" type="button" data-v223-create-blank-month>สร้างตารางที่ไม่มีตำแหน่ง</button>
        <button class="soft-btn" type="button" data-v223-generate-month-plan>สร้างแผนทั้งเดือน</button>
        <button class="primary-btn" type="button" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button>
        <button class="ghost-btn danger" type="button" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button>
        <button class="ghost-btn" type="button" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button>
        <button class="soft-btn" type="button" data-position-month-overview-v169>ดูภาพรวมจัดตำแหน่ง</button>
        <button class="soft-btn qc-rotation-btn" type="button" data-qc-rotation-v169>ติดตามการหมุนเวียน QC</button>
        <span class="v223-mini-badges">${(typeof badge === 'function' ? badge(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black') : `<span>${savedCount}</span>`)} ${(typeof badge === 'function' ? badge(`วันทำงาน ${workingDays} วัน`, 'blue') : `<span>${workingDays}</span>`)}</span>
      </div>${matrix}</div>`;
  };

  function collapsePositionManagementToTemplate(){
    if (state?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    const slot = root?.querySelector?.('.v221-slot-manager-card');
    if (!slot) return;
    const h3 = slot.querySelector('h3');
    if (h3) h3.textContent = 'Template Slot ตามจำนวนคน (ต้นทางเดียว)';
    const hint = slot.querySelector('.section-title .hint');
    if (hint) hint.textContent = 'แก้รายละเอียด Slot จากส่วนนี้ แล้วกดอัปเดตฐานข้อมูลจากชุด 10-14 ทั้งหมด ตารางรายวัน/รายเดือนจะใช้ข้อมูลชุดเดียวกัน';
    const page = slot.parentElement || root;
    Array.from(page.children).forEach(ch => {
      if (ch === slot) return;
      ch.classList.add('v223-hide-position-master');
      ch.setAttribute('aria-hidden', 'true');
    });
  }
  const prevRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (prevRenderPage) {
    window.renderPage = renderPage = function renderPageV223(){
      const out = prevRenderPage.apply(this, arguments);
      setTimeout(collapsePositionManagementToTemplate, 0);
      return out;
    };
  }

  document.addEventListener('click', function(e){
    const blank = e.target?.closest?.('[data-v223-create-blank-month]');
    const gen = e.target?.closest?.('[data-v223-generate-month-plan]');
    if (!blank && !gen) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (blank) createBlank();
    else generateAuto();
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v223-hide-position-master{display:none!important}
    .v223-month-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:8px 0 12px}
    .v223-month-toolbar label{min-width:170px}.v223-month-toolbar button{white-space:nowrap}.v223-mini-badges{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .v223-monthly-position-page .notice,.v223-monthly-position-page .v218-slot-note,.v223-monthly-position-page .v174-save-mode-note,.v223-monthly-position-page .matrix-legend,.v223-monthly-position-page .month-position-summary-hint{display:none!important}
    @media(max-width:760px){.v223-month-toolbar>*{width:100%}.v223-month-toolbar button{width:100%}.v223-mini-badges{width:100%}}
  `;
  document.head.appendChild(style);

  setTimeout(collapsePositionManagementToTemplate, 100);
  window.cnmiV223 = { buildAutoPlan, blankRowsForMonth, generateAuto, createBlank };
  console.info(`${VERSION} loaded`);
})();
