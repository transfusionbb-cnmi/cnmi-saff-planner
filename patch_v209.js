/* =========================================================
   V209 ช4 / งานปั่นเลือด confirmation flow
   - ช4 ไม่สร้าง OT/HR 8 ชม. อัตโนมัติ
   - Staff ปิดรายการค้างได้ด้วย “ทำ ช4 เอง” หรือ “มีคนอยู่แทน / ไม่เบิก”
   - คนที่อยู่แทนต้องกรอก OT เพิ่มตามเวลาจริงเอง
   ========================================================= */
(function(){
  'use strict';
  const VERSION_V209 = 'V209_CH4_COVER_CONFIRMATION_NO_AUTO_OT';
  const CH4_CONFIRM_TABLE_V209 = 'shift_confirmations';

  const previousLoadAllDataV209 = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
  const previousRenderOtPageV209 = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  const previousCalcOtHoursV209 = window.calcOtHours || (typeof calcOtHours === 'function' ? calcOtHours : null);

  function esc209(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function norm209(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0,10); }
  }
  function today209(){
    try { return todayStr(); }
    catch (_) { return new Date().toISOString().slice(0,10); }
  }
  function month209(d=today209()){
    try { return monthKey(new Date(`${d}T00:00:00`)); }
    catch (_) { return String(d || today209()).slice(0,7); }
  }
  function label209(code){
    return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL?.[code]) || code || '-';
  }
  function currentSid209(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  }
  function badge209(text, cls){
    try { return badge(text, cls || statusClass209(text)); }
    catch (_) { return `<span class="badge ${esc209(cls || statusClass209(text))}">${esc209(text)}</span>`; }
  }
  function statusClass209(text){
    if (/ทำเองแล้ว|อยู่แทนแล้ว|ยืนยันแล้ว|อนุมัติแล้ว/.test(String(text))) return 'green';
    if (/ไม่อนุมัติ|ตีกลับ|ส่งกลับ/.test(String(text))) return 'red';
    if (/รอ|ยังไม่|ต้อง/.test(String(text))) return 'orange';
    return 'black';
  }
  function isCh4209(code){
    const c = String(code || '').trim();
    return c === 'ช4' || c === 'ช4A' || c === 'ช4B' || c === 'ช4-MT';
  }
  function isCh3Manual209(code){
    const c = String(code || '').trim();
    return c === 'ช3A' || c === 'ช3B';
  }
  function isAutoCheckInDuty209(code){
    return !!String(code || '').trim() && !isCh4209(code) && !isCh3Manual209(code);
  }
  function activeStaff209(){
    const list = Array.isArray(state.staff) ? state.staff.filter(s => {
      const activeOk = Object.prototype.hasOwnProperty.call(s, 'active') ? (s.active === true || String(s.active).toLowerCase() === 'true') : (s.is_active !== false && String(s.is_active).toLowerCase() !== 'false');
      const scheduleOk = Object.prototype.hasOwnProperty.call(s, 'schedule') ? (s.schedule === true || String(s.schedule).toLowerCase() === 'true') : true;
      const role = String(s.role || s.position || '').toLowerCase();
      return activeOk && scheduleOk && !role.includes('physician') && !String(s.staff_type || '').includes('แพทย์');
    }) : [];
    try { return orderedStaff(list); }
    catch (_) { return list.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function staffOptions209(selectedId='', excludeId=''){
    return activeStaff209()
      .filter(s => String(s.id) !== String(excludeId || ''))
      .map(s => `<option value="${esc209(s.id)}" ${String(s.id)===String(selectedId)?'selected':''}>${esc209(s.nickname || s.full_name || s.email || s.id)}</option>`)
      .join('');
  }
  function ch4AssignmentsFor209(staffId, date){
    const d = norm209(date);
    return (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && norm209(a?.duty_date) === d && isCh4209(a?.duty_code))
      .sort((a,b) => String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'));
  }
  function dutiesOn209(staffId, date){
    const d = norm209(date);
    return (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && norm209(a?.duty_date) === d)
      .sort((a,b) => {
        try { return dutySortIndex(a?.duty_code) - dutySortIndex(b?.duty_code); }
        catch (_) { return String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'); }
      });
  }
  function assignmentKey209(a){
    return [a?.id || '', norm209(a?.duty_date), a?.staff_id || '', a?.duty_code || ''].map(x => String(x || '').replace(/\|/g, '')).join('|');
  }
  function findCh4Assignment209(key){
    const parts = String(key || '').split('|');
    const [id, date, staffId, dutyCode] = parts;
    return (state.rosterAssignments || []).find(a => {
      if (!isCh4209(a?.duty_code)) return false;
      if (id && String(a?.id || '') === id) return true;
      return norm209(a?.duty_date) === date && String(a?.staff_id || '') === staffId && String(a?.duty_code || '') === dutyCode;
    }) || null;
  }
  function confirmRows209(){ return Array.isArray(state.shiftConfirmations) ? state.shiftConfirmations : []; }
  function confirmationFor209(a){
    const date = norm209(a?.duty_date || a?.work_date);
    const owner = String(a?.staff_id || a?.owner_staff_id || '');
    const code = String(a?.duty_code || a?.shift_type || '');
    const aid = String(a?.id || a?.roster_assignment_id || '');
    return confirmRows209()
      .slice()
      .sort((x,y) => String(y?.updated_at || y?.confirmed_at || y?.covered_at || '').localeCompare(String(x?.updated_at || x?.confirmed_at || x?.covered_at || '')))
      .find(r => {
        const rDate = norm209(r?.work_date || r?.duty_date);
        const rOwner = String(r?.owner_staff_id || r?.staff_id || '');
        const rCode = String(r?.duty_code || r?.shift_type || '');
        const rAid = String(r?.roster_assignment_id || '');
        if (aid && rAid && rAid === aid) return true;
        return rDate === date && rOwner === owner && (rCode === code || (isCh4209(rCode) && isCh4209(code)));
      }) || null;
  }
  function ch4StatusText209(a){
    const rec = confirmationFor209(a);
    const st = String(rec?.status || '').trim();
    if (st === 'completed_self' || st === 'confirmed_self') return 'ทำเองแล้ว';
    if (st === 'covered_by_other') return `มีคนอยู่แทนแล้ว: ${staffNick(rec?.covered_by_staff_id)}`;
    return 'ยังไม่ยืนยัน';
  }
  function ch4Closed209(a){
    const st = String(confirmationFor209(a)?.status || '').trim();
    return st === 'completed_self' || st === 'confirmed_self' || st === 'covered_by_other';
  }
  function hasAttendance209(staffId, date){
    const d = norm209(date);
    return (state.attendance || []).some(a => String(a?.staff_id || '') === String(staffId || '') && norm209(a?.duty_date) === d);
  }
  function isAttendanceReason209(row){ return String(row?.reason || '').includes('ยืนยันอยู่เวร'); }
  function attendanceOtRows209(staffId, date){
    const d = norm209(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && norm209(r?.work_date) === d && isAttendanceReason209(r));
  }
  function extraOtRows209(staffId, date){
    const d = norm209(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && norm209(r?.work_date) === d && !isAttendanceReason209(r));
  }
  function firstLatest209(rows){
    return (rows || []).slice().sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null;
  }
  function attendanceStatusText209(staffId, date){
    const ot = firstLatest209(attendanceOtRows209(staffId, date));
    if (ot) {
      const s = String(ot.status || '').trim();
      if (s === 'อนุมัติ') return 'อนุมัติแล้ว';
      if (s === 'ไม่อนุมัติ') return 'ไม่อนุมัติ';
      if (s === 'ส่งกลับแก้ไข') return 'ส่งกลับแก้ไข';
      return 'ยืนยันแล้ว / รออนุมัติ';
    }
    if (hasAttendance209(staffId, date)) return 'ยืนยันแล้ว';
    return 'ยังไม่ได้ยืนยัน';
  }
  function manualStatusText209(staffId, date){
    const ot = firstLatest209(extraOtRows209(staffId, date));
    if (!ot) return 'ต้องบันทึกเวลาจริง';
    const s = String(ot.status || '').trim();
    if (s === 'อนุมัติ') return 'อนุมัติแล้ว';
    if (s === 'ไม่อนุมัติ') return 'ไม่อนุมัติ';
    if (s === 'ส่งกลับแก้ไข') return 'ส่งกลับแก้ไข';
    return 'รอ Admin เทียบ LIS';
  }
  function timeOfExtraOt209(staffId, date){
    const ot = firstLatest209(extraOtRows209(staffId, date));
    const start = String(ot?.start_time || '').trim() || `${pad(otStartHourForDate(norm209(date)))}:00`;
    const end = String(ot?.end_time || '').trim() || 'เวลาจริงที่บันทึก';
    return `${esc209(start)} - ${esc209(end)}`;
  }
  function dutyTimeText209(a){
    const code = String(a?.duty_code || '').trim();
    if (isCh4209(code)) return 'ช4 / งานปั่นเลือด — ไม่คิด 8 ชม. อัตโนมัติ';
    if (isCh3Manual209(code)) return timeOfExtraOt209(a.staff_id, a.duty_date);
    if (code === 'ชบด1' || code === 'ชบด2' || code === 'ชบด3') return '08:00 - 08:00';
    let h = 0;
    try { h = Number(dutyMetrics(a)?.hours || 0); } catch (_) {}
    return h ? `ตามตารางเวร (${h.toFixed(0)} ชม.)` : 'ตามตารางเวร';
  }
  function rowStatusForDuty209(a){
    const code = String(a?.duty_code || '').trim();
    if (isCh4209(code)) return ch4StatusText209(a);
    if (isCh3Manual209(code)) return manualStatusText209(a.staff_id, a.duty_date);
    return attendanceStatusText209(a.staff_id, a.duty_date);
  }
  function statusHintForDuty209(a){
    const code = String(a?.duty_code || '').trim();
    if (isCh4209(code)) return 'ช4 ใช้ปุ่มทำเอง/มีคนอยู่แทน เพื่อปิดรายการค้าง และไม่สร้าง OT 8 ชม. อัตโนมัติ';
    if (isCh3Manual209(code)) return 'ช3A / ช3B ต้องบันทึกเวลาจริงก่อน แล้วรอ Admin เทียบ LIS';
    return 'เวรหลัก กดปุ่มยืนยันอยู่เวรเมื่อมาปฏิบัติงานจริง';
  }
  function explicitHours209(row){
    const raw = `${row?.note || ''} ${row?.reason || ''}`;
    const patterns = [
      /HR_HOURS\s*=\s*(\d+(?:\.\d+)?)/i,
      /จำนวนเวลา\s*OT\s*[:=]?\s*(\d+(?:\.\d+)?)\s*ชั่วโมง/i,
      /จำนวนเวลา\s*(\d+(?:\.\d+)?)\s*ชั่วโมง/i,
      /ชั่วโมงที่ต้องการเบิก\s*[:=]?\s*(\d+(?:\.\d+)?)/i
    ];
    for (const p of patterns) {
      const m = raw.match(p);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 0) return n;
      }
    }
    const fields = [row?.manual_hours, row?.requested_hours, row?.hours];
    for (const f of fields) {
      const n = Number(f);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  async function loadCh4Confirmations209(){
    if (!state?.profile || !sb) return;
    const start = (() => {
      try { const d = new Date(); d.setMonth(d.getMonth() - 2); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-01`; }
      catch (_) { return `${month209()}-01`; }
    })();
    const end = (() => {
      try { const d = new Date(); d.setMonth(d.getMonth() + 14); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-31`; }
      catch (_) { return `${Number(month209().slice(0,4))+1}-12-31`; }
    })();
    try {
      const res = await sb.from(CH4_CONFIRM_TABLE_V209).select('*').gte('work_date', start).lte('work_date', end).order('work_date', { ascending:false });
      if (res.error) throw res.error;
      state.shiftConfirmations = res.data || [];
      state.shiftConfirmationReadyV209 = true;
    } catch (err) {
      state.shiftConfirmations = [];
      state.shiftConfirmationReadyV209 = false;
      console.warn(`${VERSION_V209}: ${CH4_CONFIRM_TABLE_V209} not available; run supabase_v209_ch4_shift_confirmations.sql`, err);
    }
  }
  if (previousLoadAllDataV209) {
    window.loadAllData = loadAllData = async function loadAllDataV209(){
      await previousLoadAllDataV209.apply(this, arguments);
      await loadCh4Confirmations209();
    };
  }

  function ch4DbNotice209(){
    if (state.shiftConfirmationReadyV209 !== false) return '';
    return `<div class="notice error-notice compact"><b>ยังไม่ได้เปิดตารางบันทึกสถานะ ช4</b><br>ให้ Admin รันไฟล์ <code>supabase_v209_ch4_shift_confirmations.sql</code> ใน Supabase SQL Editor ก่อนใช้ปุ่ม “ทำ ช4 เอง / มีคนอยู่แทน”</div>`;
  }
  function renderCh4ActionButtons209(a){
    if (ch4Closed209(a)) return `<button class="ghost-btn" type="button" disabled>ปิดรายการแล้ว</button>`;
    const key = esc209(assignmentKey209(a));
    return `<div class="actions ch4-actions"><button class="primary-btn" type="button" data-ch4-self="${key}">ทำ ช4 เอง</button><button class="ghost-btn" type="button" data-ch4-cover="${key}">มีคนอยู่แทน / ไม่เบิก</button></div>`;
  }
  function renderCh4TodayCard209(ch4Duties){
    if (!ch4Duties.length) return '';
    return `<div class="notice soft-notice compact ch4-duty-today-box"><b>ช4 / งานปั่นเลือด</b><br><span class="muted">ช4 ไม่สร้าง OT 8 ชม. อัตโนมัติ ถ้าจะเบิกให้กรอกเวลาจริงในส่วนที่ 2</span>${ch4DbNotice209()}<div class="ch4-duty-list">${ch4Duties.map(a => {
      const st = ch4StatusText209(a);
      return `<div class="ch4-duty-item"><div><b>${esc209(label209(a.duty_code))}</b> <span class="muted">${esc209(norm209(a.duty_date))}</span><br>${badge209(st, statusClass209(st))}</div>${renderCh4ActionButtons209(a)}</div>`;
    }).join('')}</div></div>`;
  }
  function renderTodayDutyCard209(){
    const sid = currentSid209();
    const today = today209();
    const duties = dutiesOn209(sid, today);
    const ch4Duties = duties.filter(a => isCh4209(a?.duty_code));
    const ch3ManualDuties = duties.filter(a => isCh3Manual209(a?.duty_code));
    const autoDuties = duties.filter(a => isAutoCheckInDuty209(a?.duty_code));
    const proxyOptions = (typeof selfPaidDutyProxyOptions === 'function' ? selfPaidDutyProxyOptions(today) : []) || [];
    const autoProxyOptions = proxyOptions.filter(x => isAutoCheckInDuty209(x?.assignment?.duty_code));
    const statusText = autoDuties.length ? attendanceStatusText209(sid, today) : (ch3ManualDuties.length ? 'ต้องบันทึกเวลาจริง' : (ch4Duties.length ? 'มีเฉพาะ ช4' : 'ไม่มีเวรที่ต้องยืนยัน'));
    const already = /ยืนยันแล้ว|อนุมัติแล้ว|รออนุมัติ/.test(statusText);
    const canCheckIn = (autoDuties.length > 0 || autoProxyOptions.length > 0) && !already;
    const nonCh4Labels = duties.filter(a => !isCh4209(a?.duty_code)).map(a => label209(a?.duty_code));
    const proxyBox = proxyOptions.length ? `<div class="notice soft-notice compact"><b>วันนี้มีรายการขายเวรแบบกำหนดจำนวนเงินเองที่คุณเป็นคนมาทำแทน</b><br>${proxyOptions.map(x => `ลงชื่อแทนเวรของ ${staffPill(x.assignment.staff_id)} • ${esc209(label209(x.assignment.duty_code))}`).join('<br>')}</div>` : '';
    const manualNotice = ch3ManualDuties.length ? `<div class="notice soft-notice compact"><b>หมายเหตุ:</b> ${esc209(ch3ManualDuties.map(a => label209(a.duty_code)).join(', '))} จะไม่คิด OT อัตโนมัติ ให้กรอกเวลาจริงในฟอร์ม “ขอ OT เพิ่ม / เวรปั่นเลือด” แล้วรอ Admin เทียบ LIS</div>` : '';
    const emptyMessage = !duties.length && !proxyOptions.length ? `<div class="my-duty-empty"><b>วันนี้คุณไม่มีเวรที่ต้องยืนยัน</b><span class="muted">ถ้ามีการอยู่ต่อ/ปั่นเลือดจริง ให้ใช้ฟอร์มขอ OT เพิ่มด้านขวา</span></div>` : '';
    const dutyDetail = (autoDuties.length || ch3ManualDuties.length) ? `<div class="my-duty-detail">
      <div><span class="muted">วันนี้คุณมีเวร</span><b>${esc209(nonCh4Labels.join(' / '))}</b></div>
      <div><span class="muted">เวลา</span><b>${esc209(autoDuties.length ? dutyTimeText209(autoDuties[0]) : dutyTimeText209(ch3ManualDuties[0]))}</b></div>
      <div><span class="muted">สถานะ</span>${badge209(statusText, statusClass209(statusText))}</div>
    </div>` : '';
    return `<div class="card ot-card my-duty-today-card v209-my-duty-card">
      <div class="section-title"><div><h3>ส่วนที่ 1 เวรของฉันวันนี้</h3><p class="hint">ชบด/ช9 ใช้ปุ่มยืนยันเวร ส่วน ช4 ใช้ปุ่มแยกด้านล่าง</p></div></div>
      ${emptyMessage}${dutyDetail}${manualNotice}${renderCh4TodayCard209(ch4Duties)}${proxyBox}
      <button class="primary-btn" data-check-in ${canCheckIn ? '' : 'disabled'}>${already ? 'ลงชื่ออยู่เวรวันนี้แล้ว' : (autoDuties.length || autoProxyOptions.length ? 'ยืนยันอยู่เวร' : 'ไม่มีเวรหลักที่ต้องแตะยืนยัน')}</button>
      <p class="hint gps-help compact">ระบบยกเลิกการตรวจตำแหน่งแล้ว บันทึกได้ทันที • ช4 ไม่สร้าง OT อัตโนมัติ</p>
    </div>`;
  }
  function renderMyMonthDuties209(){
    const sid = currentSid209();
    const key = state.myDutyMonthFilter || state.monthKey || month209();
    const assignments = (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(sid || '') && norm209(a?.duty_date).startsWith(key))
      .sort((a,b) => norm209(a?.duty_date).localeCompare(norm209(b?.duty_date)) || String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'));
    const rows = assignments.map(a => {
      const st = rowStatusForDuty209(a);
      return `<tr><td>${formatThaiDate(norm209(a.duty_date))}</td><td><b>${esc209(label209(a.duty_code))}</b></td><td>${esc209(dutyTimeText209(a))}</td><td>${badge209(st, statusClass209(st))}<br><span class="muted">${esc209(statusHintForDuty209(a))}</span></td></tr>`;
    }).join('');
    const cards = assignments.map(a => {
      const st = rowStatusForDuty209(a);
      return `<div class="mobile-card my-duty-month-card"><div class="mobile-day-head"><b>${formatThaiDate(norm209(a.duty_date))}</b>${badge209(st, statusClass209(st))}</div><div><b>เวร:</b> ${esc209(label209(a.duty_code))}</div><div><b>เวลา:</b> ${esc209(dutyTimeText209(a))}</div><span class="muted">${esc209(statusHintForDuty209(a))}</span></div>`;
    }).join('');
    return `<div class="card wide-card my-duty-month-section" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>เวรของฉันเดือนนี้</h3><p class="hint">ช4 แสดงสถานะทำเอง/มีคนอยู่แทน และไม่ผูกกับ OT 8 ชม. อัตโนมัติ</p></div><label class="no-print my-duty-month-filter">เดือน <input type="month" id="myDutyMonthFilter" value="${esc209(key)}"></label></div>
      ${assignments.length ? `<div class="table-wrap my-duty-month-table"><table><thead><tr><th>วันที่</th><th>เวร</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mobile-cards my-duty-month-cards">${cards}</div>` : empty('ยังไม่มีเวรของฉันในเดือนนี้')}
    </div>`;
  }
  function renderAdminCh4StatusCard209(){
    if (!(typeof isAdmin === 'function' && isAdmin())) return '';
    const key = state.ch4AdminMonthFilter || state.monthKey || month209();
    const ch4Rows = (state.rosterAssignments || [])
      .filter(a => norm209(a?.duty_date).startsWith(key) && isCh4209(a?.duty_code))
      .sort((a,b) => norm209(a?.duty_date).localeCompare(norm209(b?.duty_date)) || staffNick(a?.staff_id).localeCompare(staffNick(b?.staff_id), 'th'));
    const body = ch4Rows.length ? ch4Rows.map(a => {
      const rec = confirmationFor209(a);
      const st = ch4StatusText209(a);
      const note = rec?.covered_note || rec?.note || '';
      return `<tr><td>${formatThaiDate(norm209(a.duty_date))}</td><td>${staffPill(a.staff_id)}</td><td><b>${esc209(label209(a.duty_code))}</b></td><td>${badge209(st, statusClass209(st))}</td><td>${rec?.covered_by_staff_id ? staffPill(rec.covered_by_staff_id) : '-'}</td><td>${esc209(note || '-')}</td></tr>`;
    }).join('') : `<tr><td colspan="6">ไม่มีรายการ ช4 ในเดือนนี้</td></tr>`;
    return `<div class="card wide-card v209-admin-ch4-card" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>สถานะ ช4 / งานปั่นเลือด</h3><p class="hint">Admin ใช้ดูว่า ช4 ยังไม่ยืนยัน / ทำเองแล้ว / มีคนอยู่แทนแล้ว โดยไม่สร้าง OT 8 ชม. อัตโนมัติ</p></div><label>เดือน <input id="ch4AdminMonthFilter" type="month" value="${esc209(key)}"></label></div>
      ${ch4DbNotice209()}
      <div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เจ้าของ ช4</th><th>เวร</th><th>สถานะ</th><th>คนอยู่แทน</th><th>หมายเหตุ</th></tr></thead><tbody>${body}</tbody></table></div>
    </div>`;
  }

  window.calcOtHours = calcOtHours = function calcOtHoursV209(row){
    try {
      if (isAttendanceReason209(row)) {
        const explicit = explicitHours209(row);
        if (explicit !== null) return Math.round(Number(explicit) * 100) / 100;
        const workDate = norm209(row?.work_date);
        const duties = dutiesOn209(row?.staff_id, workDate);
        const auto = duties.filter(a => isAutoCheckInDuty209(a?.duty_code));
        if (!auto.length && duties.some(a => isCh4209(a?.duty_code))) return 0;
      }
    } catch (err) { console.warn(`${VERSION_V209} calc guard fallback`, err); }
    return previousCalcOtHoursV209 ? previousCalcOtHoursV209(row) : 0;
  };

  window.renderOtPage = renderOtPage = function renderOtPageV209(){
    if (typeof isAdmin === 'function' && isAdmin()) {
      const base = previousRenderOtPageV209 ? previousRenderOtPageV209.apply(this, arguments) : '';
      return `${base}${renderAdminCh4StatusCard209()}`;
    }
    const today = today209();
    const mine = (state.otRequests || []).filter(x => String(x?.staff_id || '') === String(currentSid209() || ''));
    return `<div class="grid grid-2 ot-page v206-ot-page v209-ot-page">
      ${renderTodayDutyCard209()}
      <div class="card ot-card">
        <h3>ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด</h3>
        <p class="hint compact">ใช้สำหรับคนที่ทำ ช4 แทน/ปั่นเลือดจริง โดยกรอกเวลาเริ่ม-สิ้นสุดจริงเท่านั้น ไม่ผูกกับ 8 ชั่วโมงอัตโนมัติ</p>
        <form id="otForm" class="form-grid">
          <label>วันที่ <input name="work_date" type="date" value="${esc209(today)}" required></label>
          <label>ตั้งแต่เวลา (Start time) <input name="start_time" type="time" value="${pad(otStartHourForDate(today))}:00" required></label>
          <label>ถึงเวลา (End time) <input name="end_time" type="time" required></label>
          <label>เหตุผล <select name="reason">${(OT_REASONS || []).map(r => `<option value="${esc209(r)}">${esc209(r)}</option>`).join('')}</select></label>
          <label class="wide">รายละเอียด <input name="note" placeholder="เช่น อยู่แทน ช4 ของ... / ปั่นเลือดถึง 18:20 / รอเทียบ LIS"></label>
          <button class="primary-btn wide" type="submit">ยืนยันขอ OT เพิ่ม</button>
        </form>
      </div>
      ${renderMyMonthDuties209()}
      <div class="card wide-card" style="grid-column:1/-1;">
        <div class="section-title"><h3>รายการ OT ของฉัน</h3></div>
        ${renderOtTable(mine)}
      </div>
      <div class="card" style="grid-column:1/-1;">
        <h3>ส่วนที่ 4 สรุป OT รายเดือน</h3><p class="hint">สรุปเฉพาะรายการที่อนุมัติแล้วและยังไม่เบิก</p>${renderOtSummary()}
      </div>
    </div>`;
  };

  async function saveCh4Confirmation209(assignment, status, coveredByStaffId='', note=''){
    if (!assignment) return showToast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า', { tone:'error' });
    if (!state.shiftConfirmationReadyV209) return showToast('ยังไม่ได้รัน SQL สำหรับตารางบันทึกสถานะ ช4: supabase_v209_ch4_shift_confirmations.sql', { tone:'error' });
    const now = new Date().toISOString();
    const coveredBy = coveredByStaffId || null;
    const coveredName = coveredBy ? staffNick(coveredBy) : null;
    const payload = {
      roster_assignment_id: assignment.id || null,
      shift_type: 'ช4',
      duty_code: assignment.duty_code || 'ช4',
      work_date: norm209(assignment.duty_date),
      owner_staff_id: assignment.staff_id,
      status,
      covered_by_staff_id: coveredBy,
      covered_by_name: coveredName,
      covered_note: note || null,
      note: note || null,
      confirmed_at: now,
      covered_at: status === 'covered_by_other' ? now : null,
      updated_by: currentSid209()
    };
    const attempts = [
      { ...payload },
      (() => { const p = { ...payload }; delete p.covered_by_name; return p; })(),
      (() => { const p = { ...payload }; delete p.roster_assignment_id; delete p.covered_by_name; return p; })()
    ];
    let lastErr = null;
    for (const p of attempts) {
      try {
        const res = await sb.from(CH4_CONFIRM_TABLE_V209).upsert(p, { onConflict:'work_date,owner_staff_id,duty_code' }).select('*').maybeSingle();
        if (!res.error) return res.data || p;
        lastErr = res.error;
        if (!/column|schema|cache|constraint|conflict/i.test(String(res.error?.message || ''))) break;
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('บันทึกสถานะ ช4 ไม่สำเร็จ');
  }
  async function confirmCh4Self209(key){
    const assignment = findCh4Assignment209(key);
    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog('บันทึกว่าคุณทำ ช4 เองใช่ไหม? ระบบจะไม่สร้าง OT 8 ชม. อัตโนมัติ หากต้องการเบิกให้กรอกเวลาจริงในส่วนที่ 2', 'ยืนยันทำ ช4 เอง')
      : window.confirm('บันทึกว่าคุณทำ ช4 เองใช่ไหม?');
    if (!ok) return;
    setBusy(true, 'กำลังบันทึกสถานะ ช4');
    try {
      await saveCh4Confirmation209(assignment, 'completed_self', '', 'ทำ ช4 เอง');
      await loadAllData(); renderPage();
      showToast('บันทึกว่าทำ ช4 เองแล้ว หากต้องการเบิก OT ให้กรอกเวลาจริงในส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด');
    } catch (err) {
      console.error(`${VERSION_V209} confirm self failed`, err);
      showToast(friendlyDbError ? friendlyDbError(err) : (err?.message || 'บันทึกสถานะ ช4 ไม่สำเร็จ'), { tone:'error' });
    } finally { setBusy(false); }
  }
  function showCh4CoverModal209(key){
    const assignment = findCh4Assignment209(key);
    if (!assignment) return showToast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า', { tone:'error' });
    const html = `<div class="v209-ch4-cover-modal"><h2>มีคนอยู่แทน / ไม่เบิก</h2>
      <p class="hint">รายการนี้จะปิดค้างของเจ้าของ ช4 แต่จะไม่สร้าง OT ให้ใคร คนที่อยู่แทนต้องกรอก OT เพิ่มตามเวลาจริงเอง</p>
      <form id="ch4CoverFormV209" class="form-grid">
        <input type="hidden" name="assignment_key" value="${esc209(key)}">
        <label>เจ้าของ ช4 <input value="${esc209(staffNick(assignment.staff_id))}" disabled></label>
        <label>วันที่ <input value="${esc209(norm209(assignment.duty_date))}" disabled></label>
        <label class="wide">ผู้ที่อยู่แทน <select name="covered_by_staff_id" required><option value="">เลือกคนที่อยู่แทน</option>${staffOptions209('', assignment.staff_id)}</select></label>
        <label class="wide">หมายเหตุ <textarea name="covered_note" rows="3" placeholder="เช่น ปั่นเลือดแทน / อยู่แทนช่วงเย็น"></textarea></label>
        <div class="actions wide"><button class="ghost-btn" type="button" data-close-modal>ยกเลิก</button><button class="primary-btn" type="submit">บันทึกว่ามีคนอยู่แทน</button></div>
      </form></div>`;
    showModal(html, { small:true });
  }
  async function saveCh4CoverForm209(form){
    const fd = new FormData(form);
    const key = String(fd.get('assignment_key') || '');
    const assignment = findCh4Assignment209(key);
    const coveredBy = String(fd.get('covered_by_staff_id') || '').trim();
    const note = String(fd.get('covered_note') || '').trim();
    if (!assignment) return showToast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า', { tone:'error' });
    if (!coveredBy) return showToast('กรุณาเลือกผู้ที่อยู่แทน', { tone:'error' });
    setBusy(true, 'กำลังบันทึกคนอยู่แทน');
    try {
      await saveCh4Confirmation209(assignment, 'covered_by_other', coveredBy, note || `มีคนอยู่แทน: ${staffNick(coveredBy)}`);
      closeModal();
      await loadAllData(); renderPage();
      showToast(`ปิดรายการ ช4 แล้ว: ${staffNick(coveredBy)} อยู่แทน / ไม่สร้าง OT อัตโนมัติ`);
    } catch (err) {
      console.error(`${VERSION_V209} cover failed`, err);
      showToast(friendlyDbError ? friendlyDbError(err) : (err?.message || 'บันทึกคนอยู่แทนไม่สำเร็จ'), { tone:'error' });
    } finally { setBusy(false); }
  }

  document.addEventListener('click', function(e){
    const selfBtn = e.target?.closest?.('[data-ch4-self]');
    if (selfBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      confirmCh4Self209(selfBtn.getAttribute('data-ch4-self'));
      return;
    }
    const coverBtn = e.target?.closest?.('[data-ch4-cover]');
    if (coverBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      showCh4CoverModal209(coverBtn.getAttribute('data-ch4-cover'));
      return;
    }
    if (e.target?.closest?.('[data-close-modal]')) {
      e.preventDefault();
      closeModal();
    }
  }, true);

  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'ch4CoverFormV209') return;
    e.preventDefault(); e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    saveCh4CoverForm209(e.target);
  }, true);

  document.addEventListener('change', function(e){
    if (e.target?.id === 'ch4AdminMonthFilter') {
      state.ch4AdminMonthFilter = e.target.value || month209();
      renderPage();
    }
  }, true);

  window.v209Ch4Tools = { isCh4209, ch4StatusText209, confirmationFor209, saveCh4Confirmation209 };
  console.info(`[${VERSION_V209}] loaded`);
})();
