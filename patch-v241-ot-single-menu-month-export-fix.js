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
