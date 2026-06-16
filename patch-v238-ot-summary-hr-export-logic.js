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
