/* CNMI Staff Planner V594 — Cancel Renumber + Quota Release Guard
 * Purpose:
 *   - Final-cancelled / deleted / rejected leave & no-duty rows must disappear from the active sequence.
 *   - Remaining active rows are re-ranked continuously from 1 with no gaps.
 *   - Existing V576/V578 quota numbers are NOT changed.
 *   - Pending cancellation is still active until Admin approves it, so its slot is not released prematurely.
 *   - After a final cancellation action, force one UI rerender from the already-refreshed state.
 * No SQL/schema changes.
 */
(() => {
  'use strict';
  if (window.__CNMI_V594_CANCEL_RENUMBER_QUOTA_RELEASE__) return;
  window.__CNMI_V594_CANCEL_RENUMBER_QUOTA_RELEASE__ = true;

  const VERSION = 'V594_CANCEL_RENUMBER_QUOTA_RELEASE';
  const txt = v => String(v ?? '').trim();
  const S = () => { try { return (typeof state !== 'undefined' && state) ? state : (window.state || {}); } catch (_) { return window.state || {}; } };
  const normDate = v => {
    try { return typeof normalizeDateKey === 'function' ? String(normalizeDateKey(v) || '').slice(0,10) : txt(v).slice(0,10); }
    catch (_) { return txt(v).slice(0,10); }
  };

  function pendingCancellation(row){
    const stRaw = txt(row?.status || row?.approval_status);
    const st = stRaw.toLowerCase();
    return row?.cancellation_requested === true
      || st === 'รออนุมัติยกเลิก'
      || st === 'cancel_requested'
      || st === 'pending_cancel'
      || st === 'pending_cancellation';
  }

  function finalInactive(row){
    try {
      if (typeof isLeaveFinalInactive === 'function') return !!isLeaveFinalInactive(row);
    } catch (_) {}
    if (!row || pendingCancellation(row)) return false;
    const raw = txt(row?.status || row?.approval_status);
    const st = raw.toLowerCase();
    return ['cancelled','canceled','deleted','inactive','void','rejected'].includes(st)
      || ['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(raw);
  }

  function effective(row){ return !!row && !finalInactive(row); }
  function rowType(row){
    try {
      return typeof leaveDisplayType === 'function'
        ? txt(leaveDisplayType(row))
        : txt(row?.type || row?.leave_type).split(':::')[0].trim();
    } catch (_) { return txt(row?.type || row?.leave_type).split(':::')[0].trim(); }
  }
  function overlaps(row,date){
    const d = normDate(date), a = normDate(row?.start_date), b = normDate(row?.end_date || row?.start_date);
    return !!d && !!a && !!b && a <= d && d <= b;
  }
  function submittedMs(row){
    for (const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt,row?.updated_at]) {
      const n = Date.parse(String(v || ''));
      if (Number.isFinite(n)) return n;
    }
    return Number.POSITIVE_INFINITY;
  }
  function staffOrder(id){
    const list = Array.isArray(S()?.staff) ? S().staff : [];
    const i = list.findIndex(x => String(x?.id || '') === String(id || ''));
    return i < 0 ? 99999 : i;
  }
  function stableKey(row){ return `${txt(row?.id)}|${txt(row?.staff_id)}`; }

  function sequenceForDate(date, wantNoDuty){
    const d = normDate(date);
    if (!d) return [];
    const perStaff = new Map();
    const leaves = Array.isArray(S()?.leaves) ? S().leaves : [];
    for (const row of leaves) {
      if (!effective(row) || !overlaps(row,d)) continue;
      const isNoDuty = rowType(row) === 'ไม่รับเวร';
      if (isNoDuty !== !!wantNoDuty) continue;
      const sid = String(row?.staff_id || '');
      if (!sid) continue;
      const prev = perStaff.get(sid);
      if (!prev || submittedMs(row) < submittedMs(prev)) perStaff.set(sid,row);
    }
    const rows = [...perStaff.values()].sort((a,b) => {
      const ta = submittedMs(a), tb = submittedMs(b);
      if (ta !== tb) return ta - tb;
      const oa = staffOrder(a?.staff_id), ob = staffOrder(b?.staff_id);
      if (oa !== ob) return oa - ob;
      return stableKey(a).localeCompare(stableKey(b),'th');
    });
    return rows.map((row,i) => ({
      row,
      rank: i + 1,
      staff_id: String(row?.staff_id || ''),
      submitted_ms: submittedMs(row)
    }));
  }

  function leaveSequenceForDate(date){ return sequenceForDate(date,false); }
  function noDutySequenceForDate(date){ return sequenceForDate(date,true); }
  function rankFromSequence(row,date,wantNoDuty){
    if (!effective(row)) return null;
    const isNoDuty = rowType(row) === 'ไม่รับเวร';
    if (isNoDuty !== !!wantNoDuty) return null;
    const sid = String(row?.staff_id || '');
    if (!sid) return null;
    const hit = sequenceForDate(date,wantNoDuty).find(x => x.staff_id === sid);
    return hit?.rank || null;
  }

  // Replace the shared ranking APIs used by newer roster/calendar decorators.
  if (window.cnmiLeaveSequenceV431) {
    window.cnmiLeaveSequenceV431.leaveSequenceForDate = leaveSequenceForDate;
    window.cnmiLeaveSequenceV431.rankFor = (row,date) => rankFromSequence(row,date,false);
  }
  if (window.cnmiNoDutySequenceV436) {
    window.cnmiNoDutySequenceV436.sequenceForDate = noDutySequenceForDate;
    window.cnmiNoDutySequenceV436.rankFor = (row,date) => rankFromSequence(row,date,true);
  }

  // Final cancellation functions already refresh data. This adds only one cheap rerender
  // after they finish so visible sequence badges cannot remain stale on screen.
  function wrapFinalAction(name){
    let base = null;
    try { base = window[name] || (typeof globalThis[name] === 'function' ? globalThis[name] : null); } catch (_) { base = window[name] || null; }
    if (typeof base !== 'function' || base.__v594CancelRerender) return false;
    const wrapped = async function(){
      const result = await base.apply(this,arguments);
      try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
      return result;
    };
    wrapped.__v594CancelRerender = true;
    try { window[name] = wrapped; globalThis[name] = wrapped; } catch (_) { window[name] = wrapped; }
    try { eval(`${name}=wrapped`); } catch (_) {}
    return true;
  }

  function installActionWrappers(){
    const names = ['approveCancelLeave','cancelLeave','deleteLeave'];
    return names.map(wrapFinalAction).every(Boolean);
  }

  // Make the rule explicit in the existing quota notice without changing any numbers.
  function addQuotaReleaseNote(){
    document.querySelectorAll('[data-v576-quota-notice]').forEach(box => {
      if (box.querySelector('[data-v594-quota-release-note]')) return;
      const line = document.createElement('div');
      line.setAttribute('data-v594-quota-release-note','1');
      line.className = 'hint v594-quota-release-note';
      line.innerHTML = '<b>เมื่อยกเลิกสำเร็จ:</b> รายการที่สถานะยกเลิกแล้วจะไม่กินโควตา และลำดับที่เหลือจะเลื่อนขึ้นอัตโนมัติ · คำขอยกเลิกที่ยังรอ Admin ยังนับโควตาอยู่จนกว่าจะอนุมัติ';
      box.appendChild(line);
    });
  }

  function markVersion(){
    document.querySelectorAll('.v520-version-chip,.v531-version-chip,.v532-version-chip,.v542-version-chip,[class*="version-chip"]').forEach(chip => {
      const t = txt(chip?.textContent);
      if (!/^v\d+/i.test(t)) return;
      chip.textContent = 'v594';
      chip.title = 'V594: cancel renumber + quota release (quota numbers unchanged)';
    });
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    installActionWrappers();
    addQuotaReleaseNote();
    markVersion();
    if (tries > 80) clearInterval(timer);
  }, 75);

  installActionWrappers();
  addQuotaReleaseNote();
  markVersion();
  const mo = new MutationObserver(() => { addQuotaReleaseNote(); markVersion(); });
  mo.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('pageshow',() => { addQuotaReleaseNote(); markVersion(); });
  window.addEventListener('hashchange',() => setTimeout(() => { addQuotaReleaseNote(); markVersion(); },120));

  window.cnmiV594 = {
    version: VERSION,
    finalInactive,
    pendingCancellation,
    leaveSequenceForDate,
    noDutySequenceForDate,
    leaveRankFor: (row,date) => rankFromSequence(row,date,false),
    noDutyRankFor: (row,date) => rankFromSequence(row,date,true)
  };
  console.info(`[${VERSION}] loaded — quota numbers unchanged`);
})();
