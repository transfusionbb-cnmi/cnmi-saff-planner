/* CNMI Duty Hub V89: roster preset + Excel-style fairness
   Patch-only. Load after v86/v88 and keep this file last.
   Main points:
   - Add admin menu: ตั้งต้นเวร (pre-lock lottery/preset duties before Auto Assign)
   - Fairness summary matches Excel columns
   - Pay = hours × rate; normal MT 130 / เคิก 90; weekend or public holiday MT 160 / เคิก 120
   - Day off = all weekend/public-holiday dates in month - unique weekend/public-holiday dates worked
   - Auto Assign: only ชบด1/ชบด2/ชบด3 cannot be adjacent to another ชบด; ชบด can touch ช4/ช3A/ช3B/ช9
*/
(function(){
  const PATCH = 'v89-roster-preset-excel-fairness';
  const GROUP_A = new Set(['ชบด1','ชบด2','ชบด3']);

  function safe(fn, fallback){ try { return fn(); } catch(e) { console.warn('[CNMI]', PATCH, e); return fallback; } }
  function S(){ return (typeof state !== 'undefined') ? state : null; }
  function $id(id){ return document.getElementById(id); }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function esc(v){ return safe(() => escapeHtml(v), String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))); }
  function parseD(d){ return safe(() => parseDate(d), new Date(String(d || '').slice(0,10))); }
  function dateInput(d){ return safe(() => toDateInput(d), `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`); }
  function toast(msg){ return safe(() => showToast(msg), console.log(msg)); }
  function render(){ return safe(() => renderPage(), null); }
  function staffById(id){ return S()?.staff?.find(s => String(s.id) === String(id)) || null; }
  function staffOrd(st){ return safe(() => staffOrderIndex(st), 9999); }
  function compareStaff(a,b){ return safe(() => compareStaffOrder(a,b), staffOrd(a)-staffOrd(b)); }
  function ordered(list){ return safe(() => orderedStaff(list), [...(list||[])].sort(compareStaff)); }
  function isAdminX(){ return !!safe(() => isAdmin(), false); }
  function isRosterStaff(st){ return !!safe(() => isRosterEnabled(st), !!(st?.is_active && st?.staff_type !== 'แพทย์')); }
  function roleOk(st, role){ return !!safe(() => supportsRequiredRole(st, role), true); }
  function monthRange(key){
    return safe(() => getMonthRange(key), (() => {
      const [y,m] = String(key || '').split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return { y, m, start:`${y}-${pad2(m)}-01`, end:`${y}-${pad2(m)}-${pad2(last)}` };
    })());
  }
  function slotId(slot){ return slot?.id || slot?._temp_id || `${slot?.duty_date}|${slot?.duty_code}`; }
  function isWeekendOrHoliday(date){ return !!(safe(() => isWeekend(date), false) || safe(() => isHolidayDate(date), false)); }
  function dutyCodeLabel(code){ return safe(() => DUTY_LABEL[code] || code, code || ''); }
  function isGroupA(code){ return GROUP_A.has(String(code || '')); }
  function dutyBucket(code){
    code = String(code || '');
    if (code === 'ชบด1' || code === 'ชบด2' || code === 'ชบด3') return code;
    if (code === 'ช4A' || code === 'ช4B' || code === 'ช4') return 'ช4';
    if (code === 'ช3A') return 'ช3A';
    if (code === 'ช3B') return 'ช3B';
    if (code === 'ช9-เคิก' || code === 'ช9-MT' || code === 'ช9') return 'ช9';
    return code || '-';
  }
  function dayBucket(date){
    if (isWeekendOrHoliday(date)) return 'วันหยุด/นักขัต';
    const dow = parseD(date).getDay();
    if (dow === 1) return 'จันทร์';
    if (dow === 5) return 'ศุกร์';
    return 'วันทำงานราชการ';
  }
  function allHolidayDatesForMonth(key){
    const { y, m } = monthRange(key);
    const last = new Date(y, m, 0).getDate();
    const out = [];
    for (let day=1; day<=last; day++) {
      const d = `${y}-${pad2(m)}-${pad2(day)}`;
      if (isWeekendOrHoliday(d)) out.push(d);
    }
    return out;
  }
  function staffTypeForRate(staffId, dutyCode=''){
    const st = staffById(staffId);
    if (!st) return 'MT';
    if (['ช4A','ช4B','ช4'].includes(String(dutyCode || '')) && st.nickname === 'แตง') return 'MT';
    return st.staff_type === 'เคิก' ? 'เคิก' : 'MT';
  }
  function rateFor(staffId, date, dutyCode=''){
    const type = staffTypeForRate(staffId, dutyCode);
    const special = isWeekendOrHoliday(date);
    if (type === 'เคิก') return special ? 120 : 90;
    return special ? 160 : 130;
  }
  function hoursFor(date, dutyCode=''){
    const code = String(dutyCode || '');
    if (code === 'ช9-เคิก' || code === 'ช9-MT' || code === 'ช9') return 8;
    if (code === 'ช3A' || code === 'ช3B') return 8;
    if (code === 'ช4A' || code === 'ช4B' || code === 'ช4') return 0;
    if (isGroupA(code)) return isWeekendOrHoliday(date) ? 24 : 16;
    return isWeekendOrHoliday(date) ? 24 : 16;
  }
  function unitsFor(date, dutyCode=''){
    const h = hoursFor(date, dutyCode);
    const code = String(dutyCode || '');
    if (code === 'ช3A' || code === 'ช3B') return 1;
    if (code === 'ช4A' || code === 'ช4B' || code === 'ช4') return 0;
    return h / 8;
  }
  function metric(slot, staffIdOverride=null){
    const date = slot?.duty_date || slot;
    const code = slot?.duty_code || '';
    const staffId = staffIdOverride || slot?.staff_id || null;
    const hours = hoursFor(date, code);
    const rate = staffId ? rateFor(staffId, date, code) : 0;
    return { hours, rate, pay: hours * rate, units: unitsFor(date, code), code, publicHoliday: safe(() => isHolidayDate(date), false), weekend: safe(() => isWeekend(date), false) };
  }

  // Override global duty calculation so summaries, trade amounts, and related views use the same rate rule.
  window.dutyStaffTypeForRate = dutyStaffTypeForRate = staffTypeForRate;
  window.dutyRatePerHour = dutyRatePerHour = rateFor;
  window.dutyHoursForCode = dutyHoursForCode = hoursFor;
  window.dutyUnitsForCode = dutyUnitsForCode = unitsFor;
  window.dutyMetrics = dutyMetrics = metric;
  window.dutyHours = dutyHours = function(date, dutyCode=''){ return hoursFor(date, dutyCode); };
  window.dutyAmount = dutyAmount = function(staffId, date, dutyCode=''){ return hoursFor(date, dutyCode) * rateFor(staffId, date, dutyCode); };
  window.dutyRateByType = dutyRateByType = function(type, date){
    const special = isWeekendOrHoliday(date);
    return type === 'เคิก' ? (special ? 120 : 90) : (special ? 160 : 130);
  };

  function sameDayDuty(staffId, date, assignments, excludeSlot){
    const ex = excludeSlot ? slotId(excludeSlot) : null;
    const draft = (assignments || []).some(a => a.staff_id === staffId && a.duty_date === date && (!ex || slotId(a) !== ex));
    const saved = (S()?.rosterAssignments || []).some(a => a.staff_id === staffId && a.duty_date === date && (!ex || slotId(a) !== ex));
    return draft || saved;
  }
  function hasGroupAOnDate(staffId, date, assignments, excludeSlot){
    const ex = excludeSlot ? slotId(excludeSlot) : null;
    const draft = (assignments || []).some(a => a.staff_id === staffId && a.duty_date === date && isGroupA(a.duty_code) && (!ex || slotId(a) !== ex));
    const saved = (S()?.rosterAssignments || []).some(a => a.staff_id === staffId && a.duty_date === date && isGroupA(a.duty_code) && (!ex || slotId(a) !== ex));
    return draft || saved;
  }
  function isRosterBlocked(staffId, date){
    return !!(S()?.leaves || []).some(l => l.staff_id === staffId && l.status !== 'cancelled' && safe(() => overlapsDate(l, date), String(l.start_date || '') <= date && String(l.end_date || '') >= date));
  }
  window.hasAdjacentDuty = hasAdjacentDuty = function(staffId, date, assignments = [], excludeSlot = null){
    // Only A against A is prohibited. B duties never create consecutive-duty blocks.
    if (excludeSlot && !isGroupA(excludeSlot.duty_code)) return false;
    const d = parseD(date);
    const prev = new Date(d); prev.setDate(d.getDate() - 1);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    return hasGroupAOnDate(staffId, dateInput(prev), assignments, excludeSlot)
        || hasGroupAOnDate(staffId, dateInput(next), assignments, excludeSlot);
  };
  window.canStaffWorkSlot = canStaffWorkSlot = function(staffId, slot, assignments = safe(() => getAssignmentsForMonth(S()?.monthKey), [])){
    const st = staffById(staffId);
    if (!isRosterStaff(st)) return false;
    if (!roleOk(st, slot?.required_role)) return false;
    if (isRosterBlocked(staffId, slot?.duty_date)) return false;
    if (sameDayDuty(staffId, slot?.duty_date, assignments, slot)) return false;
    if (isGroupA(slot?.duty_code) && hasAdjacentDuty(staffId, slot?.duty_date, assignments, slot)) return false;
    return true;
  };

  // Monthly position assignment: block only true leave; ไม่รับเวร is allowed for positions.
  function isTrueLeaveType(type){
    const t = String(type || '').trim();
    return t.startsWith('ลา') && t !== 'ไม่รับเวร';
  }
  function positionBlockedByLeave(staffId, date){
    return !!(S()?.leaves || []).some(l => l.staff_id === staffId && l.status !== 'cancelled' && isTrueLeaveType(l.type) && safe(() => overlapsDate(l, date), String(l.start_date || '') <= date && String(l.end_date || '') >= date));
  }
  if (typeof positionCandidateOk === 'function') {
    window.positionCandidateOk = positionCandidateOk = function(staff, positionRow, date){
      date = date || safe(() => todayStr(), new Date().toISOString().slice(0,10));
      if (!staff) return false;
      const eligibilityKey = positionRow?.eligibility_code || positionRow?.code || positionRow?.position_code;
      return safe(() => isDailyPositionEnabled(staff), !!staff?.is_active)
        && !positionBlockedByLeave(staff.id, date)
        && safe(() => positionRuleOk(staff, positionRow?.main_rule), true)
        && safe(() => positionEligible(staff, eligibilityKey), true);
    };
  }
  if (typeof dailyWorkingStaff === 'function') {
    window.dailyWorkingStaff = dailyWorkingStaff = function(date){
      return ordered((S()?.staff || []).filter(st => safe(() => isDailyPositionEnabled(st), !!st?.is_active) && !positionBlockedByLeave(st.id, date)));
    };
  }

  // ---------- Excel-style fairness ----------
  function emptyStats(){
    return {
      total:0, units:0, hours:0, pay:0,
      chbd:0, ch9:0, ch3A:0, ch3B:0, ch3:0, ch4:0,
      bb:0, donor:0, weekend:0, weekday:0, holidayWorkedDates:new Set(),
      offDays:0, mon:0, fri:0, bucket:{}, day:{}, carry:0
    };
  }
  function addToStats(stats, staffId, slot){
    if (!staffId || !slot) return;
    const r = stats[staffId] = stats[staffId] || emptyStats();
    const dm = metric(slot, staffId);
    const code = String(slot.duty_code || '');
    const b = dutyBucket(code);
    const d = dayBucket(slot.duty_date);
    r.total += 1;
    r.units += Number(dm.units || 0);
    r.hours += Number(dm.hours || 0);
    r.pay += Number(dm.pay || 0);
    r.bucket[b] = (r.bucket[b] || 0) + 1;
    r.day[d] = (r.day[d] || 0) + 1;
    if (isGroupA(code)) { r.chbd += 1; r.bb += 1; }
    if (code === 'ช9-เคิก' || code === 'ช9-MT' || code === 'ช9') { r.ch9 += 1; r.donor += 1; }
    if (code === 'ช3A') { r.ch3A += 1; r.ch3 += 1; r.donor += 1; }
    if (code === 'ช3B') { r.ch3B += 1; r.ch3 += 1; r.donor += 1; }
    if (code === 'ช4A' || code === 'ช4B' || code === 'ช4') r.ch4 += 1;
    if (isWeekendOrHoliday(slot.duty_date)) { r.weekend += 1; r.holidayWorkedDates.add(slot.duty_date); }
    else r.weekday += 1;
    const dow = parseD(slot.duty_date).getDay();
    if (dow === 1) r.mon += 1;
    if (dow === 5) r.fri += 1;
  }
  function finalizeStats(stats, key){
    const totalHolidayDates = allHolidayDatesForMonth(key || S()?.monthKey).length;
    Object.values(stats).forEach(r => {
      const workedHolidayDays = r.holidayWorkedDates instanceof Set ? r.holidayWorkedDates.size : 0;
      r.offDays = Math.max(0, totalHolidayDates - workedHolidayDays);
      r.holidayWorkedDateCount = workedHolidayDays;
    });
    return stats;
  }
  function buildStats(assignments, key){
    const stats = {};
    (S()?.staff || []).filter(isRosterStaff).forEach(st => stats[st.id] = emptyStats());
    (assignments || []).forEach(a => { if (a.staff_id) addToStats(stats, a.staff_id, a); });
    return finalizeStats(stats, key);
  }
  window.calcFairness = calcFairness = function(assignments){
    return buildStats(assignments || [], S()?.monthKey);
  };

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
    const stats = buildStats(rows, prev);
    const ids = Object.keys(stats).filter(id => isRosterStaff(staffById(id)));
    if (!ids.length) return out;
    const avgHours = ids.reduce((s,id)=>s+(stats[id].hours||0),0) / ids.length;
    const avgOff = ids.reduce((s,id)=>s+(stats[id].offDays||0),0) / ids.length;
    const avgPay = ids.reduce((s,id)=>s+(stats[id].pay||0),0) / ids.length;
    ids.forEach(id => {
      const r = stats[id] || emptyStats();
      // worked more / got fewer days off last month => reduce chances this month. got more days off => slightly increase chance.
      out[id] = ((r.hours || 0) - avgHours) * 1800
        + ((avgOff - (r.offDays || 0)) * 90000)
        + ((r.pay || 0) - avgPay) * 0.55;
    });
    return out;
  }
  function initializeStats(assignments, key){
    const stats = buildStats(assignments, key);
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
    return ((r.bucket[b] || 0) * 1_000_000)
      + ((d === 'วันหยุด/นักขัต' ? (r.weekend || 0) * 430_000 : 0))
      + ((d === 'จันทร์' ? (r.mon || 0) * 260_000 : 0))
      + ((d === 'ศุกร์' ? (r.fri || 0) * 260_000 : 0))
      + ((r.units || 0) * 160_000)
      + ((r.hours || 0) * 1_500)
      + ((r.pay || 0) * 0.65)
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
    const b = dutyBucket(slot.duty_code);
    const dutyRank = isGroupA(slot.duty_code) ? 0 : (b === 'ช9' ? 1 : b === 'ช4' ? 2 : 3);
    const dayRank = d === 'วันหยุด/นักขัต' ? 0 : d === 'ศุกร์' ? 1 : d === 'จันทร์' ? 2 : 3;
    return `${dayRank}${dutyRank}${slot.duty_date}${slot.duty_code}`;
  }
  function ensureDraft(useEmptyIfNoExisting=true){
    const st = S();
    if (!st) return [];
    if (!st.rosterDraft || st.rosterDraft.monthKey !== st.monthKey) {
      const existing = safe(() => getAssignmentsForMonth(st.monthKey), []);
      const base = existing.length ? existing.map(a => ({...a})) : (useEmptyIfNoExisting ? safe(() => generateEmptyAssignments(st.monthKey), []) : []);
      st.rosterDraft = { monthKey: st.monthKey, assignments: base };
    }
    return st.rosterDraft.assignments || [];
  }
  function fillTargets(targets, assignments, stats){
    let filled = 0;
    const failed = [];
    targets.forEach(slot => {
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
    const assignments = ensureDraft(true);
    const targets = assignments.filter(a => !a.is_locked && !a.staff_id).sort((a,b) => slotPriority(a).localeCompare(slotPriority(b)));
    const stats = initializeStats(assignments, S()?.monthKey);
    const { filled, failed } = fillTargets(targets, assignments, stats);
    if (failed.length) toast(`Auto Assign แล้ว เติมได้ ${filled} ช่อง เหลือ ${failed.length} ช่องที่ติดเงื่อนไขจริง`);
    else toast(`Auto Assign แล้ว ${filled} ช่อง — ตรวจทานก่อนกดบันทึก`);
  };
  function rebalanceEmptyMonth(){
    if (!isAdminX()) return toast('เฉพาะ Admin เท่านั้น');
    const assignments = ensureDraft(true);
    const targets = assignments.filter(a => !a.is_locked && !a.staff_id).sort((a,b) => slotPriority(a).localeCompare(slotPriority(b)));
    if (!targets.length) return toast('ไม่มีช่องว่างให้ปรับสมดุลแล้ว');
    const stats = initializeStats(assignments, S()?.monthKey);
    const { filled, failed } = fillTargets(targets, assignments, stats);
    render();
    if (failed.length) toast(`ปรับสมดุลแล้ว เติมได้ ${filled} ช่อง เหลือ ${failed.length} ช่อง`);
    else toast(`ปรับสมดุลช่องว่างทั้งเดือนแล้ว ${filled} ช่อง — ตรวจทานก่อนกดบันทึก`);
  }
  window.cnmiV89RebalanceEmptyMonth = rebalanceEmptyMonth;

  window.showFairness = showFairness = function(){
    const assignments = safe(() => getAssignmentsForMonth(S()?.monthKey), []).filter(x => x.staff_id);
    const stats = buildStats(assignments, S()?.monthKey);
    const active = ordered((S()?.staff || []).filter(isRosterStaff));
    const hours = active.map(s => stats[s.id]?.hours || 0);
    const pays = active.map(s => stats[s.id]?.pay || 0);
    const off = active.map(s => stats[s.id]?.offDays || 0);
    const diff = hours.length ? Math.max(...hours) - Math.min(...hours) : 0;
    const payDiff = pays.length ? Math.max(...pays) - Math.min(...pays) : 0;
    const offDiff = off.length ? Math.max(...off) - Math.min(...off) : 0;
    showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(S()?.monthKey || '')}</h2>
      <p class="hint">สรุปตามสูตร Excel: วันหยุด = วัน ส.-อ./นักขัตฯ ทั้งเดือน - วันที่มีเวรในวันหยุด | เงิน = ชั่วโมง × rate ตาม MT/เคิก และวันทำงาน/วันหยุด</p>
      <p class="hint">ส่วนต่างชั่วโมง ${diff.toFixed(1)} ชม. • ส่วนต่างเงิน ${payDiff.toLocaleString()} บาท • ส่วนต่างวันหยุด ${offDiff} วัน</p>
      <div class="table-wrap"><table><thead><tr>
        <th>ชื่อ</th><th>ชม.รวม</th><th>เงินประมาณ</th><th>เวรวัน ส.-อ./นักขัตฯ</th><th>เวรวันทำงานราชการ</th><th>เวรห้อง BB</th><th>เวรห้อง Donor</th><th>จำนวนวันที่ได้หยุด</th><th>รวมเวร</th>
      </tr></thead><tbody>
        ${active.map(s => { const r = stats[s.id] || emptyStats(); return `<tr>
          <td>${safe(() => staffPill(s), esc(s.nickname || s.full_name || '-'))}</td>
          <td>${(r.hours||0).toFixed(1)}</td>
          <td>${Math.round(r.pay||0).toLocaleString()}</td>
          <td>${r.weekend||0}</td>
          <td>${r.weekday||0}</td>
          <td>${r.bb||0}</td>
          <td>${r.donor||0}</td>
          <td>${r.offDays||0}</td>
          <td>${(r.units||0).toFixed(0)}</td>
        </tr>`; }).join('')}
      </tbody></table></div>`);
  };
  window.showStaffStats = showStaffStats = function(staffId){
    const assignments = safe(() => getAssignmentsForMonth(S()?.monthKey), []).filter(x => x.staff_id === staffId);
    const s = (buildStats(assignments, S()?.monthKey)[staffId]) || emptyStats();
    const detail = assignments.slice().sort((a,b)=>String(a.duty_date).localeCompare(String(b.duty_date))).map(a => `<tr><td>${safe(() => formatThaiDate(a.duty_date), esc(a.duty_date))}</td><td>${esc(dutyCodeLabel(a.duty_code))}</td><td>${metric(a).hours.toFixed(0)} ชม.</td><td>${metric(a).pay.toLocaleString()} บ.</td></tr>`).join('');
    showModal(`<h2>${safe(() => staffPill(staffId), esc(staffId))}</h2><div class="grid grid-2 modal-stat-grid">
      ${safe(() => statCard('ชม.รวม', (s.hours||0).toFixed(1)), '')}
      ${safe(() => statCard('เงินประมาณ', Math.round(s.pay||0).toLocaleString()), '')}
      ${safe(() => statCard('เวรวัน ส.-อ./นักขัตฯ', s.weekend||0), '')}
      ${safe(() => statCard('เวรวันทำงานราชการ', s.weekday||0), '')}
      ${safe(() => statCard('เวรห้อง BB', s.bb||0), '')}
      ${safe(() => statCard('เวรห้อง Donor', s.donor||0), '')}
      ${safe(() => statCard('จำนวนวันที่ได้หยุด', s.offDays||0), '')}
      ${safe(() => statCard('รวมเวร', (s.units||0).toFixed(0)), '')}
    </div><div class="compact-detail-table"><table><thead><tr><th>วันที่</th><th>เวร</th><th>ชม.</th><th>เงิน</th></tr></thead><tbody>${detail || '<tr><td colspan="4">ยังไม่มีเวรในเดือนนี้</td></tr>'}</tbody></table></div>`);
  };
  window.renderScheduleSummary = renderScheduleSummary = function(assignments){
    const stats = buildStats((assignments || []).filter(x => x.staff_id), S()?.monthKey);
    const active = ordered((S()?.staff || []).filter(isRosterStaff));
    if (!active.length) return '';
    return `<div class="schedule-summary desktop-schedule-summary">${active.map(s => { const r = stats[s.id] || emptyStats(); return `<div class="summary-chip" style="--staff-bg:${safe(() => staffColor(s), '#e8f2ff')};--staff-fg:${safe(() => textColorFor(staffColor(s)), '#172033')}"><b>${esc(s.nickname || s.full_name)}</b><span>${(r.units||0).toFixed(0)} เวร • ${(r.hours||0).toFixed(0)} ชม. • ${Math.round(r.pay||0).toLocaleString()} บ.</span></div>`; }).join('')}</div>`;
  };

  // ---------- preset page ----------
  function ensurePresetNav(){
    if (typeof NAV_ITEMS === 'undefined') return;
    for (let i = NAV_ITEMS.length - 1; i >= 0; i--) {
      if (NAV_ITEMS[i]?.id === 'rosterPreset') NAV_ITEMS.splice(i, 1);
    }
    const idx = NAV_ITEMS.findIndex(x => x.id === 'scheduler');
    NAV_ITEMS.splice(idx >= 0 ? idx : NAV_ITEMS.length, 0, { id:'rosterPreset', icon:'🧷', title:'ตั้งต้นเวร', subtitle:'ใส่เวรจับฉลาก/เวรกำหนดไว้ก่อน แล้วล็อกก่อน Auto Assign', group:'admin' });
  }
  function renderRosterPresetPage(){
    if (!isAdminX()) return safe(() => noPermission(), '<div class="card">ไม่มีสิทธิ์</div>');
    ensureDraft(true);
    const { y, m } = monthRange(S()?.monthKey);
    const monthHolidays = (S()?.holidays || []).filter(h => String(h.holiday_date || '').startsWith(S()?.monthKey));
    return `<div class="grid">
      <div class="card">
        <div class="section-title"><div><h3>สร้างตารางรอจัดเวร</h3><p class="hint">ใส่เวรที่จับฉลากหรือกำหนดไว้ล่วงหน้า แล้วล็อกไว้ก่อนให้ระบบ Auto Assign ช่องที่เหลือ</p></div></div>
        <div class="toolbar">
          <label>เดือน <input type="month" id="rosterMonthInput" value="${esc(S()?.monthKey || '')}"></label>
          <button class="soft-btn" data-generate-roster>สร้างตารางเปล่า</button>
          <button class="ghost-btn" data-v89-lock-filled>ล็อกช่องที่มีชื่อ</button>
          <button class="primary-btn" data-v89-save-preset>บันทึกตั้งต้น</button>
          <button class="ghost-btn" data-v89-goto-scheduler>ไปจัดตารางเวร</button>
        </div>
        ${monthHolidays.length ? `<div class="chip-line">${monthHolidays.map(h => `<span class="badge yellow">${safe(() => formatThaiDate(h.holiday_date), esc(h.holiday_date))} ${esc(h.title)}</span>`).join('')}</div>` : ''}
        <div class="notice soft-notice">หลังบันทึกตั้งต้น ช่องที่มีชื่อจะถูกล็อกไว้ Auto Assign จะไม่เปลี่ยนช่องนั้น</div>
      </div>
      <div class="roster-board">
        <div class="card">
          <h3>รายชื่อเจ้าหน้าที่</h3>
          <p class="hint">ลากชื่อไปวางในช่อง หรือเลือกจาก dropdown แล้วกด “ล็อกช่องที่มีชื่อ”</p>
          <div class="staff-pool">${ordered((S()?.staff || []).filter(isRosterStaff)).map(s => `<div class="staff-chip" style="--staff-bg:${safe(() => staffColor(s), '#e8f2ff')};--staff-fg:${safe(() => textColorFor(staffColor(s)), '#172033')}" draggable="true" data-drag-staff="${esc(s.id)}" data-staff-stat="${esc(s.id)}"><span>${esc(s.nickname || s.full_name)}</span><span>${safe(() => badge(s.staff_type || '-', s.staff_type==='MT'?'blue':'orange'), esc(s.staff_type || '-'))}</span></div>`).join('')}</div>
        </div>
        <div class="card">
          <div class="section-title"><h3>ตารางตั้งต้น ${y}-${pad2(m)}</h3><button class="tiny-btn" data-show-fairness>ดูสมดุลเวร</button></div>
          ${safe(() => renderRosterGrid(S()?.rosterDraft?.assignments || []), '<div class="empty">สร้างตารางเปล่าเพื่อเริ่ม</div>')}
        </div>
      </div>
    </div>`;
  }
  async function savePreset(){
    if (!isAdminX()) return toast('เฉพาะ Admin เท่านั้น');
    const assignments = ensureDraft(true);
    let locked = 0;
    assignments.forEach(a => { if (a.staff_id) { a.is_locked = true; locked++; } });
    if (!locked) return toast('ยังไม่มีช่องที่ใส่ชื่อไว้');
    await safe(() => saveRosterDraft('draft'), null);
    toast(`บันทึกตั้งต้นแล้ว ล็อกไว้ ${locked} ช่อง`);
  }
  function lockFilled(){
    const assignments = ensureDraft(true);
    let locked = 0;
    assignments.forEach(a => { if (a.staff_id) { a.is_locked = true; locked++; } });
    render();
    toast(`ล็อกช่องที่มีชื่อแล้ว ${locked} ช่อง`);
  }

  // patch renderPage so new nav works without editing app.js
  ensurePresetNav();
  const oldRenderPage = safe(() => renderPage, null);
  if (typeof oldRenderPage === 'function' && !oldRenderPage.__v89Patched) {
    const patched = function(){
      ensurePresetNav();
      if (S()?.page === 'rosterPreset') {
        const item = NAV_ITEMS.find(x => x.id === 'rosterPreset');
        if ($id('pageTitle')) $id('pageTitle').textContent = item?.title || 'ตั้งต้นเวร';
        if ($id('pageSubtitle')) $id('pageSubtitle').textContent = item?.subtitle || '';
        safe(() => renderNav(), null);
        if ($id('pageContent')) $id('pageContent').innerHTML = renderRosterPresetPage();
        injectUi();
        return;
      }
      const out = oldRenderPage.apply(this, arguments);
      injectUi();
      return out;
    };
    patched.__v89Patched = true;
    window.renderPage = renderPage = patched;
  }

  function injectUi(){
    injectStyle();
    // remove previous balance buttons from v87/v88 to avoid confusing duplicate logic
    safe(() => document.querySelectorAll('[data-v87-rebalance-empty-month],[data-v88-rebalance-empty-month]').forEach(x => x.remove()), null);
    if (!S() || S().page !== 'scheduler') return;
    if (document.querySelector('[data-v89-rebalance-empty-month]')) return;
    const fairness = document.querySelector('[data-show-fairness]');
    const host = fairness?.parentElement || document.querySelector('.section-title');
    if (!host) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tiny-btn soft-btn';
    btn.dataset.v89RebalanceEmptyMonth = '1';
    btn.textContent = 'ปรับสมดุลช่องว่างทั้งเดือน';
    if (fairness) host.insertBefore(btn, fairness);
    else host.appendChild(btn);
    if (useCarryForKey(S()?.monthKey) && !document.querySelector('[data-v89-carry-note]')) {
      const note = document.createElement('span');
      note.dataset.v89CarryNote = '1';
      note.className = 'badge blue';
      note.textContent = 'ชดเชยเดือนก่อนอัตโนมัติ';
      host.appendChild(note);
    }
  }
  function injectStyle(){
    if (document.getElementById('cnmi-v89-style')) return;
    const style = document.createElement('style');
    style.id = 'cnmi-v89-style';
    style.textContent = `
      [data-v89-rebalance-empty-month], [data-v89-save-preset], [data-v89-lock-filled], [data-v89-goto-scheduler] { margin-right: 8px; }
      [data-v89-carry-note] { margin-left: 8px; }
      .nav-btn[data-page="rosterPreset"] .nav-emoji { filter: saturate(1.1); }
      @media (max-width: 820px) {
        [data-v89-rebalance-empty-month], [data-v89-save-preset], [data-v89-lock-filled], [data-v89-goto-scheduler] { width: 100%; margin: 6px 0; }
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', function(e){
    const rebalance = e.target.closest && e.target.closest('[data-v89-rebalance-empty-month]');
    if (rebalance) { e.preventDefault(); e.stopPropagation(); rebalanceEmptyMonth(); return; }
    const save = e.target.closest && e.target.closest('[data-v89-save-preset]');
    if (save) { e.preventDefault(); e.stopPropagation(); savePreset(); return; }
    const lock = e.target.closest && e.target.closest('[data-v89-lock-filled]');
    if (lock) { e.preventDefault(); e.stopPropagation(); lockFilled(); return; }
    const go = e.target.closest && e.target.closest('[data-v89-goto-scheduler]');
    if (go) { e.preventDefault(); e.stopPropagation(); S().page = 'scheduler'; render(); return; }
  }, true);

  document.addEventListener('DOMContentLoaded', function(){ safe(() => { ensurePresetNav(); injectUi(); }, null); });
  setTimeout(() => safe(() => { ensurePresetNav(); injectUi(); }, null), 700);
  console.log('[CNMI]', PATCH, 'loaded');
})();
