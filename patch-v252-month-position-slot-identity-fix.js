/* =========================
   V252 Monthly Position Slot Identity Fix
   - Keep duplicate duties as separate slots (e.g. DR-Finger+Interview 1/2, DR-Main 1/2).
   - Migrate legacy unnumbered monthly rows in memory so 13 staff = 13 slots.
   - Preserve old personal-permission rows as fallback until Admin saves the new per-slot permissions.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V252_MONTH_POSITION_SLOT_IDENTITY_FIX';
  if (window.__CNMI_V252_MONTH_POSITION_SLOT_IDENTITY_FIX__) return;
  window.__CNMI_V252_MONTH_POSITION_SLOT_IDENTITY_FIX__ = true;

  const NUMBERED_FAMILIES = ['DR-Finger+Interview', 'DR-Main'];

  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function currentMonthKey(){
    const raw = state?.page === 'positionMonthView'
      ? (state.positionMonthViewKey || state.monthKey)
      : (state?.positionMonthKey || state?.monthKey);
    return String(raw || new Date().toISOString().slice(0, 7)).slice(0, 7);
  }
  function familyBase(code){
    const text = String(code || '').trim();
    for (const base of NUMBERED_FAMILIES) {
      if (text === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+$`).test(text)) return base;
    }
    return '';
  }
  function slotCode(row){ return String(row?.code || row?.position_code || '').trim(); }
  function cloneRow(row){ return row && typeof row === 'object' ? { ...row } : row; }

  function makeUniqueRuntimeRows(rows){
    const list = (rows || []).map(cloneRow).filter(Boolean);
    const totals = new Map();
    list.forEach(r => {
      const code = slotCode(r);
      if (code) totals.set(code, (totals.get(code) || 0) + 1);
    });
    const seen = new Map();
    return list.map(r => {
      const code = slotCode(r);
      if (!code || (totals.get(code) || 0) <= 1) return r;
      const no = (seen.get(code) || 0) + 1;
      seen.set(code, no);
      const uniqueCode = `${code} ${no}`;
      const eligibility = String(r.eligibility_code || '').trim();
      return {
        ...r,
        code: uniqueCode,
        position_code: uniqueCode,
        eligibility_code: !eligibility || eligibility === code ? uniqueCode : eligibility,
        legacy_position_code: code
      };
    });
  }

  function canonicalizeRuntimeSlotSets(){
    try {
      const api = window.cnmiDayPositionSlotsV218;
      const sets = api?.DAY_POSITION_SLOT_SETS_218 || api?.DAY_POSITION_SLOT_SETS;
      if (!sets) return;
      [8,9,10,11,12,13,14].forEach(n => {
        if (Array.isArray(sets[n])) sets[n] = makeUniqueRuntimeRows(sets[n]);
      });
      api.DAY_POSITION_SLOT_SETS_218 = sets;
      api.DAY_POSITION_SLOT_SETS = sets;
    } catch (err) {
      console.warn(`${VERSION}: runtime slot normalization skipped`, err);
    }
  }

  function expectedForDate(date){
    const d = normDate(date);
    if (!d) return [];
    try {
      const rows = window.cnmiV231?.expectedTemplatesForDate231?.(d);
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }

  function staffOrderIndex(){
    const map = new Map();
    let list = state?.staff || [];
    try { if (typeof orderedStaff === 'function') list = orderedStaff(list); } catch (_) {}
    list.forEach((s, i) => map.set(String(s?.id || ''), i));
    return map;
  }

  function normalizeLegacyRows(rows, monthKey){
    if (!Array.isArray(rows) || !rows.length) return rows || [];
    const order = staffOrderIndex();
    const byDate = new Map();
    rows.forEach((row, index) => {
      const d = normDate(row?.work_date);
      if (!d || (monthKey && !d.startsWith(monthKey))) return;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push({ row, index });
    });

    byDate.forEach((items, date) => {
      const expected = expectedForDate(date);
      if (!expected.length) return;
      NUMBERED_FAMILIES.forEach(base => {
        const variants = expected.map(slotCode).filter(code => familyBase(code) === base);
        if (variants.length <= 1) return;

        const familyRows = items.filter(item => familyBase(item.row?.position_code || item.row?.code) === base);
        if (!familyRows.length) return;
        familyRows.sort((a,b) => {
          const oa = order.get(String(a.row?.staff_id || '')) ?? 9999;
          const ob = order.get(String(b.row?.staff_id || '')) ?? 9999;
          return oa - ob || a.index - b.index;
        });

        const variantSet = new Set(variants);
        const used = new Set();
        familyRows.forEach(item => {
          const code = String(item.row?.position_code || item.row?.code || '').trim();
          if (variantSet.has(code)) used.add(code);
        });
        const available = variants.filter(code => !used.has(code));

        familyRows.forEach(item => {
          const current = String(item.row?.position_code || item.row?.code || '').trim();
          if (variantSet.has(current)) return;
          const next = available.shift();
          if (!next) return;
          item.row.position_code = next;
          if (Object.prototype.hasOwnProperty.call(item.row, 'code')) item.row.code = next;
          item.row._v252_legacy_slot_code = current;
        });
      });
    });
    return rows;
  }

  function normalizeStateMonthRows(){
    try {
      if (!window.state) return;
      const key = currentMonthKey();
      canonicalizeRuntimeSlotSets();
      if (Array.isArray(state.positions)) normalizeLegacyRows(state.positions, key);
      if (state.monthPositionDraft?.monthKey === key && Array.isArray(state.monthPositionDraft.rows)) {
        normalizeLegacyRows(state.monthPositionDraft.rows, key);
      }
    } catch (err) {
      console.warn(`${VERSION}: monthly row migration skipped`, err);
    }
  }

  const oldPositionEligible = window.positionEligible || (typeof positionEligible === 'function' ? positionEligible : null);
  function positionEligibleV252(staff, positionCode){
    if (!staff || !positionCode) return false;
    const key = String(positionCode || '').trim();
    try {
      const rows = state?.positionEligibility || [];
      const exact = rows.find(x => String(x?.staff_id) === String(staff.id) && String(x?.position_code) === key);
      if (exact) return !!exact.is_eligible;
      const base = familyBase(key);
      if (base && base !== key) {
        const legacy = rows.find(x => String(x?.staff_id) === String(staff.id) && String(x?.position_code) === base);
        if (legacy) return !!legacy.is_eligible;
      }
    } catch (_) {}
    return oldPositionEligible ? oldPositionEligible(staff, key) : true;
  }
  try { window.positionEligible = positionEligible = positionEligibleV252; }
  catch (_) { window.positionEligible = positionEligibleV252; }

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !oldRenderPage.__v252Wrapped) {
    const wrapped = function renderPageV252(){
      normalizeStateMonthRows();
      return oldRenderPage.apply(this, arguments);
    };
    wrapped.__v252Wrapped = true;
    window.renderPage = wrapped;
    try { renderPage = wrapped; } catch (_) {}
  }

  const oldRenderPositionMonthPage = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage && !oldRenderPositionMonthPage.__v252Wrapped) {
    const wrappedMonth = function renderPositionMonthPageV252(){
      normalizeStateMonthRows();
      return oldRenderPositionMonthPage.apply(this, arguments);
    };
    wrappedMonth.__v252Wrapped = true;
    window.renderPositionMonthPage = wrappedMonth;
    try { renderPositionMonthPage = wrappedMonth; } catch (_) {}
  }

  canonicalizeRuntimeSlotSets();
  normalizeStateMonthRows();
  [80, 260, 700, 1200].forEach(ms => setTimeout(() => {
    canonicalizeRuntimeSlotSets();
    normalizeStateMonthRows();
  }, ms));

  window.cnmiV252 = { canonicalizeRuntimeSlotSets, normalizeLegacyRows, normalizeStateMonthRows, familyBase };
  console.info(`${VERSION} loaded`);
})();
