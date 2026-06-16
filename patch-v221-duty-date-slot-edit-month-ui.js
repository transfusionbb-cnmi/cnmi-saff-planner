/* =========================
   V221 Retroactive duty confirmation + editable slot templates + cleaner monthly position UI
   - Staff can choose the duty date in OT section 1 and confirm past duties.
   - Main duty time display/save: weekday ชบด = 16:00-08:00, weekend/holiday ชบด = 08:00-08:00.
   - Admin can edit slot template details directly from Position Management.
   - Monthly Position page top tools are compacted into a cleaner command bar.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V221_DUTY_DATE_SLOT_EDIT_MONTH_UI';
  if (window.__CNMI_V221_DUTY_DATE_SLOT_EDIT_MONTH_UI__) return;
  window.__CNMI_V221_DUTY_DATE_SLOT_EDIT_MONTH_UI__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const norm = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } };
  const today = () => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } };
  const toast = (msg, tone) => { try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } };
  const friendly = (err) => { try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } };
  const sid = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || ''; } };
  const admin = () => { try { return isAdmin(); } catch (_) { return false; } };
  const b = (text, cls='blue') => { try { return badge(text, cls); } catch (_) { return `<span class="badge ${esc(cls)}">${esc(text)}</span>`; } };
  const staffName = (id) => { try { return staffNick(id); } catch (_) { return String(id || '-'); } };
  const dutyName = (code) => { try { return (DUTY_LABEL && DUTY_LABEL[code]) || code || '-'; } catch (_) { return code || '-'; } };
  const thDate = (d) => { try { return formatThaiDate(d); } catch (_) { return d || '-'; } };
  const deepClone = (x) => JSON.parse(JSON.stringify(x || {}));
  function addDays(date, n){
    const d = new Date(`${norm(date)}T00:00:00`);
    if (!Number.isFinite(d.getTime())) return norm(date);
    d.setDate(d.getDate() + Number(n || 0));
    try { return toDateInput(d); } catch (_) { return d.toISOString().slice(0,10); }
  }
  function isWeekendHoliday(date){
    try { return isWeekend(date) || isHolidayDate(date); }
    catch (_) { const day = new Date(`${norm(date)}T00:00:00`).getDay(); return day === 0 || day === 6; }
  }
  function isManualDuty(code){
    const c = String(code || '').trim();
    return c === 'ช4' || c === 'ช4A' || c === 'ช4B' || c === 'ช3A' || c === 'ช3B';
  }
  function isAutoDuty(code){ return !!String(code || '').trim() && !isManualDuty(code); }
  function dutiesOn(staffId, date){
    const d = norm(date);
    return (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date) === d)
      .sort((a,b) => {
        try { return dutySortIndex(a?.duty_code) - dutySortIndex(b?.duty_code); }
        catch (_) { return String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'); }
      });
  }
  function attendanceRows(staffId, date){
    const d = norm(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date) === d);
  }
  function isAttendanceOt(row){
    const t = `${row?.reason || ''} ${row?.note || ''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่ 1|V220_OT_APPROVAL|V219_OT_REPAIR|V221_DUTY_DATE/i.test(t);
  }
  function attendanceOtRows(staffId, date){
    const d = norm(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && norm(r?.work_date) === d && isAttendanceOt(r));
  }
  function latest(rows){ return (rows || []).slice().sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null; }
  function statusText(row){
    const raw = String(row?.status || '').trim();
    const low = raw.toLowerCase();
    if (!raw || raw === 'รออนุมัติ' || low === 'pending') return 'รอ Admin อนุมัติ';
    if (raw === 'อนุมัติ' || low === 'approved') return 'อนุมัติแล้ว';
    if (raw === 'ไม่อนุมัติ' || low === 'rejected') return 'ไม่อนุมัติ';
    if (raw === 'ส่งกลับแก้ไข' || /return|edit/i.test(raw)) return 'ส่งกลับแก้ไข';
    return raw;
  }
  function statusCls(text){
    const t = String(text || '');
    if (/อนุมัติแล้ว/.test(t)) return 'green';
    if (/ไม่อนุมัติ|ส่งกลับ/.test(t)) return 'orange';
    if (/รอ Admin|รออนุมัติ|ยืนยันแล้ว/.test(t)) return 'orange';
    return 'black';
  }
  function autoDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isAutoDuty(x?.duty_code)); }
  function manualDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isManualDuty(x?.duty_code)); }
  function hasChbd(duties){ return (duties || []).some(x => /^ชบด/.test(String(x?.duty_code || ''))); }
  function shiftWindowForDuties(date, duties){
    const d = norm(date);
    const list = duties || [];
    if (hasChbd(list)) {
      const holiday = isWeekendHoliday(d);
      return { start_time: holiday ? '08:00' : '16:00', end_date: addDays(d, 1), end_time: '08:00', hours: holiday ? 24 : 16, label: holiday ? '08:00 - 08:00 (+1 วัน)' : '16:00 - 08:00 (+1 วัน)' };
    }
    // ช9 or other 8-hour automatic duty.
    return { start_time: '08:00', end_date: d, end_time: '16:00', hours: 8, label: '08:00 - 16:00' };
  }
  function shiftWindowForStaffDate(staffId, date){ return shiftWindowForDuties(date, autoDuties(staffId, date)); }
  function autoNote(staffId, date, source){
    const duties = autoDuties(staffId, date);
    const labels = duties.map(a => dutyName(a.duty_code)).filter(Boolean).join(', ');
    const win = shiftWindowForDuties(date, duties);
    return [`จำนวนเวลา OT: ${win.hours} ชั่วโมง`, `สร้างจากส่วนที่ 1 ยืนยันอยู่เวร${labels ? ` | เวรที่คิดอัตโนมัติ: ${labels}` : ''}`, `เวลาเวร ${win.label}`, source || VERSION].filter(Boolean).join(' | ').slice(0, 900);
  }
  async function insertAttendanceOt(staffId, date, source){
    const d = norm(date);
    const existing = latest(attendanceOtRows(staffId, d));
    if (existing) return existing;
    const duties = autoDuties(staffId, d);
    if (!duties.length) throw new Error('วันนี้ไม่มีเวรหลักที่สร้าง OT อัตโนมัติได้');
    const win = shiftWindowForDuties(d, duties);
    const payload = {
      staff_id: staffId,
      work_date: d,
      start_time: win.start_time,
      end_date: win.end_date,
      end_time: win.end_time,
      reason: 'ยืนยันอยู่เวรตามตาราง',
      note: autoNote(staffId, d, source),
      status: 'รออนุมัติ',
      lat: null,
      lng: null,
      accuracy: null,
      device: `${navigator.userAgent || 'browser'} | ${VERSION}`.slice(0,250)
    };
    const attempts = [
      { ...payload },
      (() => { const p = { ...payload }; delete p.lat; delete p.lng; delete p.accuracy; return p; })(),
      (() => { const p = { ...payload }; delete p.end_date; return p; })(),
      (() => { const p = { ...payload }; delete p.start_time; delete p.end_date; return p; })()
    ];
    let lastError = null;
    for (const p of attempts) {
      const res = await sb.from('ot_requests').insert(p).select('*').maybeSingle();
      if (!res.error) {
        const row = res.data || p;
        try { state.otRequests = [row, ...(state.otRequests || [])]; } catch (_) {}
        return row;
      }
      lastError = res.error;
      if (!/column|schema|cache|start_time|end_date|lat|lng|accuracy/i.test(String(res.error?.message || ''))) break;
    }
    throw lastError || new Error('สร้างรายการ OT ไม่สำเร็จ');
  }
  async function confirmDutyForDate(date){
    const staffId = sid();
    const d = norm(date || state.myDutyDateV221 || today());
    if (!staffId) return toast('ไม่พบข้อมูลผู้ใช้งาน', 'error');
    if (!d) return toast('กรุณาเลือกวันที่อยู่เวร', 'error');
    if (d > today()) return toast('ยังไม่ถึงวันอยู่เวรนี้ จึงยังไม่ให้ยืนยันล่วงหน้า', 'error');
    const auto = autoDuties(staffId, d);
    const manual = manualDuties(staffId, d);
    if (!auto.length) {
      if (manual.length) return toast('วันนี้เป็น ช4/ช3A/ช3B ให้กรอกเวลาจริงในส่วนที่ 2 แล้วรอ Admin เทียบ LIS', 'error');
      return toast('วันที่เลือกไม่มีเวรหลักที่ต้องยืนยัน', 'error');
    }
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกยืนยันอยู่เวร'); } catch (_) {}
    try {
      const att = attendanceRows(staffId, d);
      const ot = attendanceOtRows(staffId, d);
      if (!att.length) {
        let pos = { ok:true, lat:null, lng:null, accuracy:null };
        try { if (typeof getGps === 'function') pos = await getGps(); } catch (_) {}
        if (pos && pos.ok === false && typeof showGpsHelp === 'function') return showGpsHelp(pos.message);
        const attendancePayload = { staff_id: staffId, duty_date: d, check_in_at: new Date().toISOString(), lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.accuracy ?? null, device: `${navigator.userAgent || 'browser'} | ${VERSION}`.slice(0,250) };
        const ares = await sb.from('attendance_logs').insert(attendancePayload).select('*').maybeSingle();
        if (ares.error && !/duplicate|unique/i.test(String(ares.error.message || ''))) throw ares.error;
        if (!ares.error && ares.data) state.attendance = [ares.data, ...(state.attendance || [])];
      }
      if (!ot.length) await insertAttendanceOt(staffId, d, 'Staff ยืนยันจากวันที่ที่เลือก');
      await loadAllData();
      state.myDutyDateV221 = d;
      if (state.page === 'ot') renderPage();
      toast(d === today() ? 'ส่งรายการให้ Admin อนุมัติแล้ว' : `ส่งรายการย้อนหลังวันที่ ${thDate(d)} ให้ Admin อนุมัติแล้ว`);
    } catch (err) {
      console.error(`${VERSION}: confirm duty failed`, err);
      toast('บันทึกยืนยันอยู่เวรไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }

  // Make old data display with the correct ชบด time window, and repair pending rows in DB when possible.
  function correctedOtRow(row){
    if (!row || !isAttendanceOt(row)) return row;
    const d = norm(row.work_date);
    const duties = autoDuties(row.staff_id, d);
    if (!duties.length) return row;
    const win = shiftWindowForDuties(d, duties);
    const out = { ...row, start_time: win.start_time, end_date: win.end_date, end_time: win.end_time };
    const note = String(out.note || '');
    if (!/จำนวนเวลา\s*OT/i.test(note)) out.note = autoNote(row.staff_id, d, 'ปรับเวลาแสดงผล V221');
    return out;
  }
  function normalizeOtStateRows(){
    let changed = false;
    state.otRequests = (state.otRequests || []).map(r => {
      const fixed = correctedOtRow(r);
      if (fixed !== r) changed = true;
      return fixed;
    });
    return changed;
  }
  let normalizeTimer = null;
  function schedulePendingOtDbNormalize(){
    if (normalizeTimer) clearTimeout(normalizeTimer);
    normalizeTimer = setTimeout(async () => {
      if (state?.page !== 'ot' || !sb) return;
      const rows = (state.otRequests || []).filter(r => {
        if (!r?.id || !isAttendanceOt(r)) return false;
        const st = String(r.status || '').trim().toLowerCase();
        if (!['รออนุมัติ','pending',''].includes(st)) return false;
        const fixed = correctedOtRow(r);
        return fixed.start_time !== r.start_time || norm(fixed.end_date) !== norm(r.end_date) || fixed.end_time !== r.end_time || (!/V221_DUTY_DATE/i.test(String(r.note || '')) && !/จำนวนเวลา\s*OT/i.test(String(r.note || '')));
      });
      for (const r of rows.slice(0, 30)) {
        try {
          const fixed = correctedOtRow(r);
          const payload = { start_time:fixed.start_time, end_date:fixed.end_date, end_time:fixed.end_time, note:fixed.note, device:`${r.device || ''} | normalized ${VERSION}`.slice(0,250) };
          const res = await sb.from('ot_requests').update(payload).eq('id', r.id);
          if (res.error) console.warn(`${VERSION}: normalize OT failed`, res.error);
        } catch (err) { console.warn(`${VERSION}: normalize OT failed`, err); }
      }
    }, 700);
  }

  // Override checkIn so any old button still uses the selected date logic.
  const previousCheckIn = window.checkIn || (typeof checkIn === 'function' ? checkIn : null);
  window.checkIn = checkIn = async function checkInV221(){
    return confirmDutyForDate(state.myDutyDateV221 || today());
  };

  function renderMyDutyCard(){
    const staffId = sid();
    const d = norm(state.myDutyDateV221 || today());
    const duties = dutiesOn(staffId, d);
    const auto = duties.filter(x => isAutoDuty(x?.duty_code));
    const manual = duties.filter(x => isManualDuty(x?.duty_code));
    const att = attendanceRows(staffId, d);
    const ot = attendanceOtRows(staffId, d);
    const latestOt = latest(ot);
    const win = auto.length ? shiftWindowForDuties(d, auto) : null;
    let status = 'ยังไม่ได้ยืนยัน';
    if (latestOt) status = statusText(latestOt);
    else if (att.length && auto.length) status = 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT';
    else if (!auto.length && manual.length) status = 'ต้องกรอกเวลาจริง';
    else if (!duties.length) status = 'ไม่มีเวรที่ต้องยืนยัน';
    const dutyNames = duties.length ? duties.map(a => dutyName(a.duty_code)).join(' / ') : '-';
    const timeText = auto.length ? win.label : (manual.length ? 'กรอกเวลาจริงในส่วนที่ 2' : '-');
    const missingOt = att.length && !ot.length && auto.length;
    const canCheck = auto.length && !latestOt && d <= today();
    return `<div class="card ot-card my-duty-today-card v221-ot-card">
      <div class="section-title"><div><h3>ส่วนที่ 1 เวรของฉันตามวันที่เลือก</h3><p class="hint">ใช้ยืนยันเวรหลัก ชบด/ช9 ได้ทั้งวันนี้และย้อนหลัง กรณีลืมกดวันก่อน</p></div></div>
      <label class="wide v221-duty-date-label">เลือกวันที่อยู่เวร <input id="myDutyDateV221" type="date" value="${esc(d)}" max="${esc(today())}"></label>
      <div class="my-duty-detail v221-duty-detail">
        <div><span class="muted">เวร</span><b>${esc(dutyNames)}</b></div>
        <div><span class="muted">เวลา</span><b>${esc(timeText)}</b></div>
        <div><span class="muted">สถานะ</span>${b(status, statusCls(status))}</div>
      </div>
      ${missingOt ? '<div class="notice error-notice compact"><b>พบรายการค้าง</b><br>ลงชื่อแล้ว แต่ยังไม่มีรายการ OT รออนุมัติ กดปุ่มด้านล่างเพื่อสร้างรายการให้ใหม่</div>' : ''}
      ${manual.length ? '<div class="notice soft-notice compact">ช4/ช3A/ช3B ไม่สร้าง 8 ชม. อัตโนมัติ ให้กรอกเวลาเริ่ม-สิ้นสุดจริงในส่วนที่ 2</div>' : ''}
      ${!duties.length ? '<div class="my-duty-empty"><b>วันที่เลือกไม่มีเวรที่ต้องยืนยัน</b><span class="muted">ถ้าอยู่ต่อจริง ใช้ส่วนที่ 2 เพื่อขอ OT เพิ่ม</span></div>' : ''}
      <div class="actions v221-ot-actions">
        <button class="primary-btn" type="button" data-check-in-selected-v221="${esc(d)}" ${canCheck ? '' : 'disabled'}>${latestOt ? 'รอ/บันทึกแล้ว' : (canCheck ? 'ส่งให้ Admin อนุมัติ' : 'ไม่ต้องยืนยันเวรหลัก')}</button>
      </div>
    </div>`;
  }
  function renderMyMonthDuties(){
    const staffId = sid();
    const key = state.myDutyMonthFilter || state.monthKey || today().slice(0,7);
    const rows = (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date).startsWith(key))
      .sort((a,b) => norm(a?.duty_date).localeCompare(norm(b?.duty_date)) || String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'));
    const body = rows.map(a => {
      const d = norm(a.duty_date);
      const auto = isAutoDuty(a.duty_code);
      const ot = latest(attendanceOtRows(staffId, d));
      const att = attendanceRows(staffId, d).length;
      const st = ot ? statusText(ot) : (att && auto ? 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT' : (auto ? 'ยังไม่ได้ยืนยัน' : 'บันทึกเวลาจริงถ้าจะเบิก'));
      const time = auto ? shiftWindowForDuties(d, [a]).label : 'เวลาจริง';
      const hint = auto ? 'เวรหลัก: ต้องมีรายการรอ Admin อนุมัติ' : 'ช4/ช3A/ช3B: ไม่คิด 8 ชม. อัตโนมัติ';
      return `<tr><td>${thDate(d)}</td><td><b>${esc(dutyName(a.duty_code))}</b></td><td>${esc(time)}</td><td>${b(st, statusCls(st))}<br><span class="muted">${esc(hint)}</span></td></tr>`;
    }).join('');
    return `<div class="card wide-card v221-my-month-card" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>เวรของฉันเดือนนี้</h3><p class="hint">เลือกวันที่ในส่วนที่ 1 เพื่อกดยืนยันย้อนหลังได้</p></div><label>เดือน <input id="myDutyMonthFilter" type="month" value="${esc(key)}"></label></div>
      <div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody>${body || '<tr><td colspan="4">ยังไม่มีเวรเดือนนี้</td></tr>'}</tbody></table></div>
    </div>`;
  }

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  window.renderOtPage = renderOtPage = function renderOtPageV221(){
    try { normalizeOtStateRows(); } catch (err) { console.warn(`${VERSION}: normalize state skipped`, err); }
    schedulePendingOtDbNormalize();
    if (admin()) return previousRenderOtPage ? previousRenderOtPage.apply(this, arguments) : '';
    const d = norm(state.myDutyDateV221 || today());
    const mine = (state.otRequests || []).filter(x => String(x?.staff_id || '') === String(sid() || ''));
    return `<div class="grid grid-2 ot-page v221-ot-page">
      ${renderMyDutyCard()}
      <div class="card ot-card v221-ot-card">
        <h3>ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด</h3>
        <p class="hint compact">ใช้เมื่ออยู่ต่อจริง/ปั่นเลือดจริง กรอกเวลาเริ่ม-สิ้นสุด แล้วรอ Admin เทียบ LIS</p>
        <form id="otForm" class="form-grid">
          <label>วันที่ <input name="work_date" type="date" value="${esc(d)}" required></label>
          <label>เริ่มเวลา <input name="start_time" type="time" value="16:00" required></label>
          <label>ถึงเวลา <input name="end_time" type="time" required></label>
          <label>เหตุผล <select name="reason">${(window.OT_REASONS || (typeof OT_REASONS !== 'undefined' ? OT_REASONS : ['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','อื่นๆ'])).map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label>
          <label class="wide">รายละเอียด <input name="note" placeholder="เช่น ปั่นเลือดถึง 18:20 / อยู่แทน ช4 ของ..."></label>
          <button class="primary-btn wide" type="submit">ส่งให้ Admin อนุมัติ</button>
        </form>
      </div>
      ${renderMyMonthDuties()}
      <div class="card wide-card" style="grid-column:1/-1;"><div class="section-title"><h3>รายการ OT ของฉัน</h3></div>${typeof renderOtTable === 'function' ? renderOtTable(mine.map(correctedOtRow)) : ''}</div>
      <div class="card" style="grid-column:1/-1;"><h3>ส่วนที่ 4 สรุป OT รายเดือน</h3><p class="hint">สรุปเฉพาะรายการที่อนุมัติแล้วและยังไม่เบิก</p>${typeof renderOtSummary === 'function' ? renderOtSummary() : ''}</div>
    </div>`;
  };

  // ----- Editable slot templates in Position Management -----
  const LS_KEY = 'cnmi_day_slot_template_overrides_v221';
  function readOverrides(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function writeOverrides(obj){ try { localStorage.setItem(LS_KEY, JSON.stringify(obj || {})); } catch (_) {} }
  function baseSlotSets(){
    const src = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS || null;
    return deepClone(src || {});
  }
  function dbMasterByCode(){
    const map = new Map();
    (state.positionMasters || []).forEach(p => {
      const code = String(p?.code || '').trim();
      if (!code) return;
      const isOuting = p?.is_outing === true || String(p?.zone || '') === 'ออกหน่วย';
      if (isOuting) return;
      map.set(code, p);
    });
    return map;
  }
  function effectiveSlotSets(){
    const sets = baseSlotSets();
    const db = dbMasterByCode();
    Object.keys(sets).forEach(n => {
      sets[n] = (sets[n] || []).map((row, idx) => {
        const code = String(row.code || '').trim();
        const m = db.get(code);
        let out = { ...row };
        if (m) out = { ...out, zone:m.zone || out.zone, main_rule:m.main_rule || out.main_rule, break_time:m.break_time || out.break_time, job_desc:m.job_desc || out.job_desc, eligibility_code:m.eligibility_code || out.eligibility_code || code };
        const ov = readOverrides()[`${n}:${idx}`];
        if (ov && String(ov.code || code) === code) out = { ...out, ...ov };
        return out;
      });
    });
    return sets;
  }
  function applyEffectiveSlotSets(){
    try {
      const sets = effectiveSlotSets();
      const target = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218;
      if (target) {
        Object.keys(sets).forEach(k => { target[k] = sets[k]; });
      }
    } catch (err) { console.warn(`${VERSION}: apply slot sets skipped`, err); }
  }
  function allUniqueSlotRows(){
    const map = new Map();
    const sets = effectiveSlotSets();
    [8,9,10,11,12,13,14].forEach(n => (sets[n] || []).forEach(p => { if (!map.has(p.code)) map.set(p.code, { ...p }); }));
    return Array.from(map.values()).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999) || String(a.code).localeCompare(String(b.code), 'th'));
  }
  function slotManagerHtml(){
    const sets = effectiveSlotSets();
    const selected = Number(state.daySlotPreviewSet221 || state.daySlotPreviewSet220 || 10);
    const rows = sets[selected] || sets[10] || [];
    const buttons = [8,9,10,11,12,13,14].map(n => `<button type="button" class="${selected===n?'primary-btn':'ghost-btn'}" data-slot-set-preview-v221="${n}">${n} คน</button>`).join('');
    const tableRows = rows.map((p, idx) => `<tr><td>${idx + 1}</td><td>${esc(p.zone || '-')}</td><td><b>${esc(p.code)}</b></td><td>${esc(p.main_rule || '-')}</td><td>${esc(p.break_time || '-')}</td><td>${esc(p.job_desc || '-')}</td><td><button class="tiny-btn" type="button" data-edit-slot-template-v221="${selected}:${idx}">แก้ไข</button></td></tr>`).join('');
    return `<div class="card wide-card v221-slot-manager-card">
      <div class="section-title"><div><h3>ชุด Slot ตำแหน่งกลางวัน 8-14 คน</h3><p class="hint">เลือกชุดตามจำนวนคนทำงานจริง และแก้รายละเอียดหน้าที่ได้จากตรงนี้</p></div><div class="actions"><button type="button" class="ghost-btn" data-refresh-slot-template-v221>รีเฟรชรายละเอียด</button><button type="button" class="soft-btn" data-seed-all-slots-v221>อัปเดตฐานข้อมูลจากชุด 8-14 ทั้งหมด</button></div></div>
      <div class="v221-slot-tabs">${buttons}</div>
      <div class="notice soft-notice compact"><b>ชุดที่เลือก:</b> ${selected} คน / ${rows.length} ตำแหน่ง — ถ้าแก้ไขรายละเอียด ระบบจะบันทึกลงฐานข้อมูลตำแหน่งและใช้กับตารางรายวัน/รายเดือนรอบถัดไป</div>
      <div class="table-wrap compact-table v221-slot-detail-table"><table><thead><tr><th>#</th><th>โซน</th><th>ตำแหน่ง</th><th>ผู้ปฏิบัติหลัก</th><th>เวลาพัก</th><th>รายละเอียดหน้าที่ประจำตำแหน่ง</th><th>จัดการ</th></tr></thead><tbody>${tableRows}</tbody></table></div>
    </div>`;
  }
  function injectSlotManager(){
    if (state?.page !== 'positionManagement') return;
    applyEffectiveSlotSets();
    const root = document.getElementById('pageContent');
    if (!root) return;
    root.querySelectorAll('.v220-slot-manager-card,.v218-position-slot-tools,.v221-slot-manager-card').forEach(el => el.remove());
    const tmp = document.createElement('div');
    tmp.innerHTML = slotManagerHtml();
    const page = root.querySelector('.position-management-page') || root;
    page.prepend(tmp.firstElementChild);
  }
  function openSlotEdit(setNo, idx){
    const sets = effectiveSlotSets();
    const row = (sets[setNo] || [])[idx];
    if (!row) return toast('ไม่พบ Slot นี้', 'error');
    showModal(`<div class="v221-slot-edit-modal"><h2>แก้ไขรายละเอียด Slot</h2><p class="hint">${setNo} คน • ${esc(row.code)}</p>
      <form id="slotTemplateEditFormV221" class="form-grid compact-form" action="javascript:void(0)">
        <input type="hidden" name="set_no" value="${esc(setNo)}"><input type="hidden" name="idx" value="${esc(idx)}"><input type="hidden" name="code" value="${esc(row.code)}">
        <label>ตำแหน่ง <input value="${esc(row.code)}" disabled></label>
        <label>โซน <input name="zone" value="${esc(row.zone || '')}" required></label>
        <label>ผู้ปฏิบัติหลัก <input name="main_rule" value="${esc(row.main_rule || '')}" required></label>
        <label>เวลาพัก <input name="break_time" value="${esc(row.break_time || '')}" placeholder="เช่น 11:00 / 12:00" required></label>
        <label class="wide">รายละเอียดหน้าที่ <textarea name="job_desc" rows="5" required>${esc(row.job_desc || '')}</textarea></label>
        <div class="actions wide modal-form-actions"><button type="button" class="ghost-btn" onclick="closeModal()">ยกเลิก</button><button type="button" class="primary-btn" data-save-slot-template-v221>บันทึก Slot นี้</button></div>
      </form></div>`, { large:true });
  }
  async function saveSlotTemplate(form){
    const fd = new FormData(form);
    const setNo = String(fd.get('set_no') || '').trim();
    const idx = Number(fd.get('idx'));
    const code = String(fd.get('code') || '').trim();
    if (!code || !setNo || !Number.isFinite(idx)) return toast('ข้อมูล Slot ไม่ครบ', 'error');
    const row = { code, zone:String(fd.get('zone') || '').trim(), main_rule:String(fd.get('main_rule') || '').trim(), break_time:String(fd.get('break_time') || '').trim(), job_desc:String(fd.get('job_desc') || '').trim() };
    if (!row.zone || !row.main_rule || !row.break_time || !row.job_desc) return toast('กรุณากรอกข้อมูลให้ครบ', 'error');
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึก Slot'); } catch (_) {}
    try {
      const overrides = readOverrides();
      overrides[`${setNo}:${idx}`] = { ...row };
      writeOverrides(overrides);
      // Save code-level detail to Supabase master so it follows account/database, not just this browser.
      if (sb && admin()) {
        const existingRes = await sb.from('daily_position_masters').select('*').eq('code', code).limit(1);
        if (existingRes.error) throw existingRes.error;
        const found = (existingRes.data || []).find(x => x?.is_outing !== true && String(x?.zone || '') !== 'ออกหน่วย') || (existingRes.data || [])[0];
        const sets = effectiveSlotSets();
        const base = ((sets[setNo] || [])[idx] || {});
        const payload = { code, zone:row.zone, is_outing:false, break_time:row.break_time, main_rule:row.main_rule, job_desc:row.job_desc, eligibility_code:base.eligibility_code || code, sort_order:base.sort_order || idx + 1, is_active:true, deleted_at:null, updated_by:sid() };
        const res = found?.id
          ? await sb.from('daily_position_masters').update(payload).eq('id', found.id)
          : await sb.from('daily_position_masters').insert({ ...payload, created_by:sid() });
        if (res.error) throw res.error;
        if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true });
        else if (typeof loadAllData === 'function') await loadAllData();
      }
      applyEffectiveSlotSets();
      try { closeModal(); } catch (_) {}
      if (state.page === 'positionManagement') renderPage();
      toast('บันทึกรายละเอียด Slot แล้ว');
    } catch (err) {
      console.error(`${VERSION}: save slot failed`, err);
      toast('บันทึก Slot ไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  async function seedAllSlots(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const ok = await (typeof confirmDialog === 'function' ? confirmDialog('อัปเดต daily_position_masters ด้วยชุด Slot 8-14 ทั้งหมดใช่ไหม?', 'ยืนยันอัปเดต Slot กลางวัน') : Promise.resolve(window.confirm('อัปเดต Slot 8-14 ทั้งหมด?')));
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังอัปเดตชุด Slot 8-14'); } catch (_) {}
    try {
      const desired = allUniqueSlotRows();
      const desiredCodes = new Set(desired.map(p => String(p.code || '').trim()).filter(Boolean));
      const existingRes = await sb.from('daily_position_masters').select('*');
      if (existingRes.error) throw existingRes.error;
      const existing = existingRes.data || [];
      const isOuting = (row) => row?.is_outing === true || String(row?.zone || '') === 'ออกหน่วย' || String(row?.eligibility_code || '').startsWith('OUTING:');
      for (const row of existing) {
        const code = String(row?.code || '').trim();
        if (!isOuting(row) && code && !desiredCodes.has(code) && row.is_active !== false) {
          const r = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
          if (r.error) throw r.error;
        }
      }
      for (const p of desired) {
        const payload = { code:p.code, zone:p.zone, is_outing:false, break_time:p.break_time || '-', main_rule:p.main_rule || null, job_desc:p.job_desc || null, sort_order:p.sort_order || 999, eligibility_code:p.eligibility_code || p.code, is_active:true, deleted_at:null, updated_by:sid() };
        const found = existing.find(x => String(x?.code || '').trim() === String(p.code || '').trim() && !isOuting(x));
        const res = found?.id ? await sb.from('daily_position_masters').update(payload).eq('id', found.id) : await sb.from('daily_position_masters').insert({ ...payload, created_by:sid() });
        if (res.error) throw res.error;
      }
      if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true });
      else if (typeof loadAllData === 'function') await loadAllData();
      applyEffectiveSlotSets();
      renderPage();
      toast('อัปเดตฐานข้อมูลชุด Slot 8-14 ทั้งหมดแล้ว');
    } catch (err) {
      console.error(`${VERSION}: seed slots failed`, err);
      toast('อัปเดต Slot ไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }

  // ----- Cleaner Monthly Position top UI -----
  function polishMonthPositionPage(){
    if (state?.page !== 'positionMonth') return;
    const card = document.querySelector('.monthly-position-page');
    if (!card || card.dataset.v221Polished === '1') return;
    card.dataset.v221Polished = '1';
    const toolbar = card.querySelector(':scope > .toolbar');
    if (!toolbar) return;
    const shell = document.createElement('div');
    shell.className = 'v221-month-command-shell';
    const primary = document.createElement('div');
    primary.className = 'v221-month-primary-actions';
    const details = document.createElement('details');
    details.className = 'v221-month-more-tools';
    details.innerHTML = '<summary>ตัวเลือกเพิ่มเติม / คำอธิบาย</summary><div class="v221-month-more-body"></div>';
    const moreBody = details.querySelector('.v221-month-more-body');
    Array.from(toolbar.children).forEach(el => {
      const text = (el.textContent || '').trim();
      const html = el.outerHTML || '';
      const primaryHit = el.matches?.('label') || /สร้างตารางเปล่า|สร้างแผนทั้งเดือน|บันทึกแผนทั้งเดือน|มีข้อมูล|วันทำงาน|คัดลอกตำแหน่งทั้งสัปดาห์/.test(text) || /data-create-blank-month-positions|data-generate-month-positions|data-save-month-positions|weekly|copy/i.test(html);
      (primaryHit ? primary : moreBody).appendChild(el);
    });
    // Move verbose notices near the top into the details panel.
    Array.from(card.querySelectorAll(':scope > .notice, :scope > .v218-slot-note')).forEach(n => moreBody.appendChild(n));
    shell.appendChild(primary);
    shell.appendChild(details);
    toolbar.replaceWith(shell);
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV221(){
      const ret = previousRenderPage.apply(this, arguments);
      setTimeout(() => {
        try { applyEffectiveSlotSets(); } catch (_) {}
        try { injectSlotManager(); } catch (err) { console.warn(`${VERSION}: slot manager inject failed`, err); }
        try { polishMonthPositionPage(); } catch (err) { console.warn(`${VERSION}: month UI polish failed`, err); }
      }, 0);
      return ret;
    };
  }

  document.addEventListener('change', function(e){
    const dateInput = e.target?.closest?.('#myDutyDateV221');
    if (dateInput) {
      state.myDutyDateV221 = norm(dateInput.value) || today();
      if (state.page === 'ot') renderPage();
      return;
    }
  }, true);

  document.addEventListener('click', function(e){
    const check = e.target?.closest?.('[data-check-in-selected-v221]');
    if (check) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      confirmDutyForDate(check.getAttribute('data-check-in-selected-v221') || state.myDutyDateV221 || today());
      return;
    }
    const tab = e.target?.closest?.('[data-slot-set-preview-v221]');
    if (tab) {
      e.preventDefault(); e.stopPropagation();
      state.daySlotPreviewSet221 = Number(tab.getAttribute('data-slot-set-preview-v221')) || 10;
      injectSlotManager();
      return;
    }
    const edit = e.target?.closest?.('[data-edit-slot-template-v221]');
    if (edit) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const [setNo, idx] = String(edit.getAttribute('data-edit-slot-template-v221') || '').split(':');
      openSlotEdit(setNo, Number(idx));
      return;
    }
    const save = e.target?.closest?.('[data-save-slot-template-v221]');
    if (save) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const form = save.closest('form');
      if (form) saveSlotTemplate(form);
      return;
    }
    const seed = e.target?.closest?.('[data-seed-all-slots-v221]');
    if (seed) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      seedAllSlots();
      return;
    }
    const ref = e.target?.closest?.('[data-refresh-slot-template-v221]');
    if (ref) {
      e.preventDefault(); e.stopPropagation();
      (async () => { try { if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true }); applyEffectiveSlotSets(); injectSlotManager(); toast('รีเฟรชรายละเอียด Slot แล้ว'); } catch (err) { toast('รีเฟรชไม่สำเร็จ: ' + friendly(err), 'error'); } })();
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v221-duty-date-label{display:block;margin-bottom:10px}.v221-ot-card .notice{margin-top:10px}.v221-duty-detail{margin-top:8px}.v221-duty-detail b{white-space:normal}
    .v221-slot-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}.v221-slot-detail-table table td:nth-child(6){min-width:420px;line-height:1.5;white-space:normal}.v221-slot-detail-table table td:nth-child(3){min-width:150px}.v221-slot-manager-card{margin-bottom:14px}.v221-slot-edit-modal textarea{min-height:130px}
    .v221-month-command-shell{background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:10px 0 12px}.v221-month-primary-actions{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.v221-month-primary-actions label{min-width:170px}.v221-month-primary-actions button{white-space:nowrap}.v221-month-more-tools{margin-top:10px}.v221-month-more-tools>summary{cursor:pointer;color:#2563eb;font-weight:700}.v221-month-more-body{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.v221-month-more-body .notice{width:100%;margin:4px 0}.monthly-position-page[data-v221-polished="1"]>.toolbar{display:none!important}
    @media(max-width:760px){.v221-slot-detail-table table td:nth-child(6){min-width:280px}.v221-month-primary-actions>*{width:100%}.v221-month-primary-actions button{width:100%}}
  `;
  document.head.appendChild(style);

  // Initial application for current page.
  setTimeout(() => { try { applyEffectiveSlotSets(); injectSlotManager(); polishMonthPositionPage(); } catch (_) {} }, 50);
  window.cnmiV221DutyOt = { confirmDutyForDate, insertAttendanceOt, correctedOtRow, shiftWindowForStaffDate };
  console.info(`${VERSION} loaded`);
})();
