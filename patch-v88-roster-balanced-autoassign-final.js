/* CNMI Duty Hub V88: corrected roster auto assign balance
   Patch-only. Load after v86/v85. Recommended: remove/comment v87 because v87 made the adjacency rule too strict in some paths.
   Goals:
   1) Monthly positions: block only true leave (ลา...), not ไม่รับเวร.
   2) Roster: only ชบด1/ชบด2/ชบด3 are group A and cannot be adjacent to group A.
      Group A can be adjacent to group B (ช4/ช3A/ช3B/ช9). Group B can be adjacent to group B.
   3) Auto Assign and "ปรับสมดุลช่องว่างทั้งเดือน" use balanced scoring by duty columns, special days, total duties, hours and estimated pay.
   4) After July 2026, previous-month carryover is used automatically as a soft penalty/bonus.
*/
(function(){
  const PATCH = 'v88-roster-balanced-autoassign-final';
  function safe(fn, fallback){ try { return fn(); } catch(e) { console.warn('[CNMI]', PATCH, e); return fallback; } }
  function S(){ return (typeof state !== 'undefined') ? state : null; }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function esc(v){ return safe(() => escapeHtml(v), String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))); }
  function parseD(d){ return safe(() => parseDate(d), new Date(String(d || '').slice(0,10))); }
  function dateInput(d){ return safe(() => toDateInput(d), `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`); }
  function toast(msg){ return safe(() => showToast(msg), console.log(msg)); }
  function render(){ return safe(() => renderPage(), null); }
  function staffById(id){ return S()?.staff?.find(s => s.id === id) || null; }
  function staffOrd(st){ return safe(() => staffOrderIndex(st), 9999); }
  function compareStaff(a,b){ return safe(() => compareStaffOrder(a,b), staffOrd(a)-staffOrd(b)); }
  function ordered(list){ return safe(() => orderedStaff(list), [...(list||[])].sort(compareStaff)); }
  function monthRange(key){ return safe(() => getMonthRange(key), (() => { const [y,m] = String(key || '').split('-').map(Number); return { y, m, start:`${y}-${pad2(m)}-01`, end:`${y}-${pad2(m)}-${pad2(new Date(y,m,0).getDate())}`}; })()); }
  function slotId(slot){ return slot?.id || slot?._temp_id || `${slot?.duty_date}|${slot?.duty_code}`; }
  function isAdminX(){ return !!safe(() => isAdmin(), false); }
  function isRosterStaff(st){ return !!safe(() => isRosterEnabled(st), !!st?.is_active); }
  function roleOk(st, role){ return !!safe(() => supportsRequiredRole(st, role), true); }
  function sameDayDuty(staffId, date, assignments, excludeSlot){
    const ex = excludeSlot ? slotId(excludeSlot) : null;
    const draft = (assignments || []).some(a => a.staff_id === staffId && a.duty_date === date && (!ex || slotId(a) !== ex));
    const saved = (S()?.rosterAssignments || []).some(a => a.staff_id === staffId && a.duty_date === date && (!ex || slotId(a) !== ex));
    return draft || saved;
  }

  const GROUP_A = new Set(['ชบด1','ชบด2','ชบด3']);
  function isGroupA(code){ return GROUP_A.has(String(code || '')); }
  function dutyBucket(code){
    code = String(code || '');
    if (code === 'ชบด1' || code === 'ชบด2' || code === 'ชบด3') return code;
    if (code === 'ช4A' || code === 'ช4B') return 'ช4';
    if (code === 'ช3A') return 'ช3A';
    if (code === 'ช3B') return 'ช3B';
    if (code === 'ช9-เคิก' || code === 'ช9-MT' || code === 'ช9') return 'ช9';
    return code || '-';
  }
  function dayBucket(date){
    if (safe(() => isHolidayDate(date), false) || safe(() => isWeekend(date), false)) return 'วันหยุด/นักขัต';
    const dow = parseD(date).getDay();
    if (dow === 1) return 'จันทร์';
    if (dow === 5) return 'ศุกร์';
    return 'วันธรรมดา';
  }
  function hasGroupAOnDate(staffId, date, assignments, excludeSlot){
    const ex = excludeSlot ? slotId(excludeSlot) : null;
    const draft = (assignments || []).some(a => a.staff_id === staffId && a.duty_date === date && isGroupA(a.duty_code) && (!ex || slotId(a) !== ex));
    const saved = (S()?.rosterAssignments || []).some(a => a.staff_id === staffId && a.duty_date === date && isGroupA(a.duty_code) && (!ex || slotId(a) !== ex));
    return draft || saved;
  }

  // IMPORTANT: only group A blocks group A adjacency. Group A can touch B; B can touch B.
  window.hasAdjacentDuty = hasAdjacentDuty = function(staffId, date, assignments = [], excludeSlot = null){
    if (excludeSlot && !isGroupA(excludeSlot.duty_code)) return false;
    const d = parseD(date);
    const prev = new Date(d); prev.setDate(d.getDate() - 1);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    return hasGroupAOnDate(staffId, dateInput(prev), assignments, excludeSlot)
        || hasGroupAOnDate(staffId, dateInput(next), assignments, excludeSlot);
  };

  function isRosterBlockedByLeaveOrNoDuty(staffId, date){
    return !!(S()?.leaves || []).some(l => l.staff_id === staffId && l.status !== 'cancelled' && safe(() => overlapsDate(l, date), String(l.start_date || '') <= date && String(l.end_date || '') >= date));
  }

  window.canStaffWorkSlot = canStaffWorkSlot = function(staffId, slot, assignments = safe(() => getAssignmentsForMonth(S()?.monthKey), [])){
    const st = staffById(staffId);
    if (!isRosterStaff(st)) return false;
    if (!roleOk(st, slot?.required_role)) return false;
    if (isRosterBlockedByLeaveOrNoDuty(staffId, slot?.duty_date)) return false;
    if (sameDayDuty(staffId, slot?.duty_date, assignments, slot)) return false;
    if (isGroupA(slot?.duty_code) && hasAdjacentDuty(staffId, slot?.duty_date, assignments, slot)) return false;
    return true;
  };

  // ---------- monthly positions: block true leave only, not no-duty ----------
  function isTrueLeaveType(type){
    const t = String(type || '').trim();
    return t.startsWith('ลา') && t !== 'ไม่รับเวร';
  }
  function isPositionBlockedByTrueLeave(staffId, date){
    return !!(S()?.leaves || []).some(l => l.staff_id === staffId && l.status !== 'cancelled' && isTrueLeaveType(l.type) && safe(() => overlapsDate(l, date), String(l.start_date || '') <= date && String(l.end_date || '') >= date));
  }
  window.cnmiV88IsPositionBlockedByTrueLeave = isPositionBlockedByTrueLeave;

  if (typeof positionCandidateOk === 'function') {
    window.positionCandidateOk = positionCandidateOk = function(staff, positionRow, date){
      date = date || safe(() => todayStr(), new Date().toISOString().slice(0,10));
      if (!staff) return false;
      const eligibilityKey = positionRow?.eligibility_code || positionRow?.code || positionRow?.position_code;
      return safe(() => isDailyPositionEnabled(staff), !!staff?.is_active)
        && !isPositionBlockedByTrueLeave(staff.id, date)
        && safe(() => positionRuleOk(staff, positionRow?.main_rule), true)
        && safe(() => positionEligible(staff, eligibilityKey), true);
    };
  }
  if (typeof dailyWorkingStaff === 'function') {
    window.dailyWorkingStaff = dailyWorkingStaff = function(date){
      const list = (S()?.staff || []).filter(st => safe(() => isDailyPositionEnabled(st), !!st?.is_active) && !isPositionBlockedByTrueLeave(st.id, date));
      return ordered(list);
    };
  }

  // ---------- fairness engine ----------
  function emptyStats(){ return { total:0, units:0, hours:0, pay:0, bucket:{}, day:{}, carry:0 }; }
  function metric(slot, staffId){ return safe(() => dutyMetrics(slot, staffId), { units:1, hours:0, pay:0 }); }
  function addToStats(stats, staffId, slot){
    if (!staffId || !slot) return;
    const r = stats[staffId] = stats[staffId] || emptyStats();
    const dm = metric(slot, staffId);
    const b = dutyBucket(slot.duty_code);
    const d = dayBucket(slot.duty_date);
    r.total += 1;
    r.units += Number(dm.units || 1);
    r.hours += Number(dm.hours || 0);
    r.pay += Number(dm.pay || 0);
    r.bucket[b] = (r.bucket[b] || 0) + 1;
    r.day[d] = (r.day[d] || 0) + 1;
  }
  function buildStats(assignments){
    const stats = {};
    (S()?.staff || []).filter(isRosterStaff).forEach(st => stats[st.id] = emptyStats());
    (assignments || []).forEach(a => { if (a.staff_id) addToStats(stats, a.staff_id, a); });
    return stats;
  }
  function prevMonthKey(key){
    const [y0,m0] = String(key || '').split('-').map(Number);
    let y = y0, m = m0 - 1;
    if (m < 1) { m = 12; y -= 1; }
    return `${y}-${pad2(m)}`;
  }
  function useCarryForKey(key){ return String(key || '') > '2026-07'; }
  function carryFromPreviousMonth(key){
    const out = {};
    if (!useCarryForKey(key)) return out;
    const prev = prevMonthKey(key);
    const rows = safe(() => getAssignmentsForMonth(prev), []).filter(a => a.staff_id);
    if (!rows.length) return out;
    const stats = buildStats(rows);
    const ids = Object.keys(stats).filter(id => isRosterStaff(staffById(id)));
    if (!ids.length) return out;
    const avgHours = ids.reduce((s,id)=>s+(stats[id].hours||0),0) / ids.length;
    const avgWeekend = ids.reduce((s,id)=>s+(stats[id].day?.['วันหยุด/นักขัต']||0),0) / ids.length;
    const avgTotal = ids.reduce((s,id)=>s+(stats[id].total||0),0) / ids.length;
    ids.forEach(id => {
      const r = stats[id] || emptyStats();
      // positive = worked more than average last month, so reduce chances this month.
      out[id] = ((r.hours || 0) - avgHours) * 2200
        + ((r.day?.['วันหยุด/นักขัต'] || 0) - avgWeekend) * 85000
        + ((r.total || 0) - avgTotal) * 25000;
    });
    return out;
  }
  function initializeStatsForMonth(assignments, key){
    const stats = buildStats(assignments);
    const carry = carryFromPreviousMonth(key || S()?.monthKey);
    Object.keys(carry).forEach(id => {
      stats[id] = stats[id] || emptyStats();
      stats[id].carry = carry[id] || 0;
    });
    return stats;
  }
  function scoreCandidate(staff, slot, stats){
    const r = stats[staff.id] || emptyStats();
    const b = dutyBucket(slot.duty_code);
    const d = dayBucket(slot.duty_date);
    const dm = metric(slot, staff.id);
    // Column balance first, then important day columns, then total/hours/pay. Carry applies only after Jul 2026.
    return ((r.bucket[b] || 0) * 1_000_000)
      + ((d === 'วันหยุด/นักขัต' ? (r.day[d] || 0) * 420_000 : 0))
      + ((d === 'จันทร์' || d === 'ศุกร์' ? (r.day[d] || 0) * 260_000 : 0))
      + ((r.total || 0) * 95_000)
      + (((r.hours || 0) + Number(dm.hours || 0) * 0.15) * 1_250)
      + (((r.pay || 0) + Number(dm.pay || 0) * 0.08) * 0.75)
      + (r.carry || 0)
      + (staffOrd(staff) * 0.01);
  }
  function candidatesFor(slot, assignments, stats){
    const list = ordered((S()?.staff || []).filter(st => canStaffWorkSlot(st.id, slot, assignments)));
    list.sort((a,b) => scoreCandidate(a, slot, stats) - scoreCandidate(b, slot, stats) || compareStaff(a,b));
    return list;
  }
  function slotPriority(slot){
    const d = dayBucket(slot.duty_date);
    const dutyRank = isGroupA(slot.duty_code) ? 0 : (dutyBucket(slot.duty_code) === 'ช9' ? 1 : dutyBucket(slot.duty_code) === 'ช4' ? 2 : 3);
    const dayRank = d === 'วันหยุด/นักขัต' ? 0 : d === 'ศุกร์' ? 1 : d === 'จันทร์' ? 2 : 3;
    return `${dayRank}${dutyRank}${slot.duty_date}${slot.duty_code}`;
  }
  function ensureDraft(){
    const st = S();
    if (!st) return [];
    if (!st.rosterDraft || st.rosterDraft.monthKey !== st.monthKey) {
      const existing = safe(() => getAssignmentsForMonth(st.monthKey), []);
      st.rosterDraft = { monthKey: st.monthKey, assignments: existing.length ? existing.map(a => ({...a})) : safe(() => generateEmptyAssignments(st.monthKey), []) };
    }
    return st.rosterDraft.assignments || [];
  }
  function fillSlots(slots, assignments, stats){
    let filled = 0;
    const failed = [];
    slots.forEach(slot => {
      const cands = candidatesFor(slot, assignments, stats);
      if (!cands.length) { failed.push(slot); return; }
      slot.staff_id = cands[0].id;
      addToStats(stats, cands[0].id, slot);
      filled++;
    });
    return { filled, failed };
  }

  window.autoAssignRoster = autoAssignRoster = function(){
    if (!isAdminX()) return toast('เฉพาะ Admin เท่านั้น');
    const assignments = ensureDraft();
    const targets = assignments
      .filter(a => !a.is_locked && !a.staff_id)
      .sort((a,b) => slotPriority(a).localeCompare(slotPriority(b)) || String(a.duty_date).localeCompare(String(b.duty_date)));
    const stats = initializeStatsForMonth(assignments, S()?.monthKey);
    const { filled, failed } = fillSlots(targets, assignments, stats);
    if (failed.length) toast(`Auto Assign แล้ว เติมได้ ${filled} ช่อง เหลือ ${failed.length} ช่องที่ยังติดเงื่อนไขลา/ไม่รับเวร/ประเภทเวร/ชบดติดกัน`);
    else toast(`Auto Assign แล้ว ${filled} ช่อง — ตรวจทานก่อนกดบันทึก`);
  };

  function rebalanceEmptyRosterMonth(){
    if (!isAdminX()) return toast('เฉพาะ Admin เท่านั้น');
    const assignments = ensureDraft();
    const targets = assignments
      .filter(a => !a.is_locked && !a.staff_id)
      .sort((a,b) => slotPriority(a).localeCompare(slotPriority(b)) || String(a.duty_date).localeCompare(String(b.duty_date)));
    if (!targets.length) return toast('ไม่มีช่องว่างให้ปรับสมดุลแล้ว');
    const stats = initializeStatsForMonth(assignments, S()?.monthKey);
    const { filled, failed } = fillSlots(targets, assignments, stats);
    render();
    if (failed.length) toast(`ปรับสมดุลแล้ว เติมได้ ${filled} ช่อง เหลือ ${failed.length} ช่องที่ยังติดเงื่อนไขจริง`);
    else toast(`ปรับสมดุลช่องว่างทั้งเดือนแล้ว ${filled} ช่อง — ตรวจทานก่อนกดบันทึก`);
  }
  window.cnmiV88RebalanceEmptyRosterMonth = rebalanceEmptyRosterMonth;

  function injectButton(){
    safe(() => document.querySelectorAll('[data-v87-rebalance-empty-month]').forEach(x => x.remove()), null);
    if (!S() || S().page !== 'scheduler') return;
    if (document.querySelector('[data-v88-rebalance-empty-month]')) return;
    const fairness = document.querySelector('[data-show-fairness]');
    const host = fairness?.parentElement || document.querySelector('.section-title');
    if (!host) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tiny-btn soft-btn';
    btn.dataset.v88RebalanceEmptyMonth = '1';
    btn.textContent = 'ปรับสมดุลช่องว่างทั้งเดือน';
    if (fairness) host.insertBefore(btn, fairness);
    else host.appendChild(btn);

    if (useCarryForKey(S().monthKey) && !document.querySelector('[data-v88-carry-note]')) {
      const note = document.createElement('span');
      note.dataset.v88CarryNote = '1';
      note.className = 'badge blue';
      note.textContent = 'ชดเชยเดือนก่อนอัตโนมัติ';
      host.appendChild(note);
    }
  }
  function injectStyle(){
    if (document.getElementById('cnmi-v88-style')) return;
    const style = document.createElement('style');
    style.id = 'cnmi-v88-style';
    style.textContent = `
      [data-v88-rebalance-empty-month] { margin-right: 8px; }
      [data-v88-carry-note] { margin-left: 8px; }
      @media (max-width: 820px) { [data-v88-rebalance-empty-month] { width: 100%; margin: 6px 0; } }
    `;
    document.head.appendChild(style);
  }
  const oldRenderPage = safe(() => renderPage, null);
  if (typeof oldRenderPage === 'function' && !oldRenderPage.__v88Patched) {
    const patched = function(){
      const out = oldRenderPage.apply(this, arguments);
      safe(() => { injectStyle(); injectButton(); }, null);
      return out;
    };
    patched.__v88Patched = true;
    window.renderPage = renderPage = patched;
  }
  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('[data-v88-rebalance-empty-month]');
    if (!btn) return;
    e.preventDefault();
    rebalanceEmptyRosterMonth();
  }, true);
  document.addEventListener('DOMContentLoaded', function(){ safe(() => { injectStyle(); injectButton(); }, null); });
  setTimeout(() => safe(() => { injectStyle(); injectButton(); }, null), 700);
  console.log('[CNMI]', PATCH, 'loaded');
})();
