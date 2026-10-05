/* CNMI Staff Planner V597 — Physician Quota Exclusion Safe Startup
 * Purpose:
 *   - Physicians are NOT part of Staff leave / no-duty quota or display sequence.
 *   - Keep V576/V578 quota numbers exactly unchanged.
 *   - Preserve physician leave for Physician Consult / RACE availability only.
 */
(() => {
  'use strict';
  const VERSION = 'V597_PHYSICIAN_QUOTA_EXCLUSION_SAFE_STARTUP';
  if (window.__CNMI_V597_PHYSICIAN_QUOTA_EXCLUSION_SAFE_STARTUP__) return;
  window.__CNMI_V597_PHYSICIAN_QUOTA_EXCLUSION_SAFE_STARTUP__ = true;

  const txt = v => String(v ?? '').trim();
  const S = () => {
    try { return (typeof state !== 'undefined' && state) ? state : (window.state || {}); }
    catch (_) { return window.state || {}; }
  };
  const normDate = v => {
    const s = txt(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  };

  function staffObj(id){
    return (Array.isArray(S()?.staff) ? S().staff : []).find(x => String(x?.id || '') === String(id || '')) || null;
  }

  function isPhysicianProfile(p){
    if (!p) return false;
    try {
      const helper = window.cnmiPersonTypeV516?.isPhysician;
      if (typeof helper === 'function') return !!helper(p);
    } catch (_) {}

    const staffType = txt(p.staff_type).toLowerCase();
    const role = txt(p.role).toLowerCase();
    const roleType = txt(p.role_type).toLowerCase();
    const positionType = txt(p.position_type).toLowerCase();
    const appRole = txt(p.app_role).toLowerCase();
    const position = txt(p.position).toLowerCase();
    const jobTitle = txt(p.job_title).toLowerCase();

    // Exact Staff Planner master type is authoritative when present.
    if (staffType === 'แพทย์' || staffType === 'physician' || staffType === 'doctor') return true;

    // Do not misclassify "นักเทคนิคการแพทย์" as a physician.
    const mtText = [staffType, roleType, positionType, position, jobTitle].some(v =>
      /นักเทคนิคการแพทย์|เทคนิคการแพทย์|medical\s*technologist|^mt$/i.test(v)
    );
    if (mtText) return false;

    const vals = [role, roleType, positionType, appRole, position, jobTitle];
    return vals.some(v =>
      v === 'แพทย์' || v === 'หมอ' || v === 'physician' || v === 'doctor' ||
      /(^|[\s/()\-])(physician|doctor)([\s/()\-]|$)/i.test(v) ||
      /^แพทย์(?:$|[\s/()\-]|เวช|ประจำ|ผู้|เฉพาะ|consult)/i.test(v)
    );
  }

  function rosterEligibleStaff(staffId){
    const st = staffObj(staffId);
    if (!st || isPhysicianProfile(st)) return false;
    try {
      if (typeof isRosterEnabled === 'function') return !!isRosterEnabled(st);
    } catch (_) {}
    return st?.is_active !== false;
  }

  function pendingCancellation(row){
    try {
      const fn = window.cnmiV594?.pendingCancellation;
      if (typeof fn === 'function') return !!fn(row);
    } catch (_) {}
    if (!row) return false;
    if (row.cancellation_requested === true) return true;
    const raw = txt(row?.status || row?.approval_status).toLowerCase();
    return /pending.*cancel|cancel.*pending|รอ.*ยกเลิก|ยกเลิก.*รอ/.test(raw);
  }

  function finalInactive(row){
    try {
      const fn = window.cnmiV594?.finalInactive;
      if (typeof fn === 'function') return !!fn(row);
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

  function sequenceForDate(date,wantNoDuty){
    const d = normDate(date);
    if (!d) return [];
    const perStaff = new Map();
    const leaves = Array.isArray(S()?.leaves) ? S().leaves : [];
    for (const row of leaves) {
      if (!effective(row) || !overlaps(row,d)) continue;
      const sid = String(row?.staff_id || '');
      if (!sid || !rosterEligibleStaff(sid)) continue;
      const isNoDuty = rowType(row) === 'ไม่รับเวร';
      if (isNoDuty !== !!wantNoDuty) continue;
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

  const leaveSequenceForDate = date => sequenceForDate(date,false);
  const noDutySequenceForDate = date => sequenceForDate(date,true);
  function rankFromSequence(row,date,wantNoDuty){
    if (!effective(row) || !rosterEligibleStaff(row?.staff_id)) return null;
    const isNoDuty = rowType(row) === 'ไม่รับเวร';
    if (isNoDuty !== !!wantNoDuty) return null;
    const sid = String(row?.staff_id || '');
    if (!sid) return null;
    return sequenceForDate(date,wantNoDuty).find(x => x.staff_id === sid)?.rank || null;
  }

  function installRankingOverride(){
    if (window.cnmiLeaveSequenceV431) {
      window.cnmiLeaveSequenceV431.leaveSequenceForDate = leaveSequenceForDate;
      window.cnmiLeaveSequenceV431.rankFor = (row,date) => rankFromSequence(row,date,false);
    }
    if (window.cnmiNoDutySequenceV436) {
      window.cnmiNoDutySequenceV436.sequenceForDate = noDutySequenceForDate;
      window.cnmiNoDutySequenceV436.rankFor = (row,date) => rankFromSequence(row,date,true);
    }
    if (window.cnmiV594) {
      window.cnmiV594.leaveSequenceForDate = leaveSequenceForDate;
      window.cnmiV594.noDutySequenceForDate = noDutySequenceForDate;
      window.cnmiV594.leaveRankFor = (row,date) => rankFromSequence(row,date,false);
      window.cnmiV594.noDutyRankFor = (row,date) => rankFromSequence(row,date,true);
    }
  }

  function addRuleNote(){
    document.querySelectorAll('[data-v576-quota-notice]').forEach(box => {
      if (box.querySelector('[data-v595-physician-quota-note]')) return;
      const line = document.createElement('div');
      line.setAttribute('data-v595-physician-quota-note','1');
      line.className = 'hint v595-physician-quota-note';
      line.innerHTML = '<b>แพทย์:</b> แยกจากโควตาเจ้าหน้าที่ทั้งหมด — ไม่นับในโควตา “ลา/ไม่รับเวร” และไม่กินเลขลำดับของ MT/เคิก';
      box.appendChild(line);
    });
  }

  function markVersion(){
    document.querySelectorAll('.v520-version-chip,.v531-version-chip,.v532-version-chip,.v542-version-chip,[class*="version-chip"]').forEach(chip => {
      if (!chip || !/^v\d+/i.test(txt(chip.textContent))) return;
      if (txt(chip.textContent).toLowerCase() !== 'v597') chip.textContent = 'v597';
      const title = 'V597: safe startup + physicians excluded from Staff leave/no-duty quota and sequence';
      if (chip.title !== title) chip.title = title;
    });
  }

  function refreshV597(){
    installRankingOverride();
    addRuleNote();
    markVersion();
  }

  // IMPORTANT: V595 used a whole-document MutationObserver and then wrote textContent
  // inside its own callback. On mobile that could create a self-triggering mutation loop
  // and starve the auth/session startup, leaving the app frozen on the legacy login shell.
  // V597 intentionally uses only bounded retries + route/page events.
  refreshV597();
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    refreshV597();
    if (tries >= 24) clearInterval(timer);
  }, 150);

  window.addEventListener('pageshow', refreshV597);
  window.addEventListener('hashchange', () => setTimeout(refreshV597, 120));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(refreshV597, 60);
  });

  window.cnmiV595 = {
    version: VERSION,
    isPhysicianProfile,
    rosterEligibleStaff,
    leaveSequenceForDate,
    noDutySequenceForDate,
    leaveRankFor: (row,date) => rankFromSequence(row,date,false),
    noDutyRankFor: (row,date) => rankFromSequence(row,date,true)
  };
  window.cnmiV597 = window.cnmiV595;
  console.info(`[${VERSION}] loaded — safe startup; physicians excluded; quota numbers unchanged`);
})();
