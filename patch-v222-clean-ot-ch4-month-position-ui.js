/* =========================
   V222 clean OT wording + Ch4 cover on selected date + clean monthly position toolbar
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V222_CLEAN_OT_CH4_MONTH_POSITION_UI';
  if (window.__CNMI_V222_CLEAN_OT_CH4_MONTH_POSITION_UI__) return;
  window.__CNMI_V222_CLEAN_OT_CH4_MONTH_POSITION_UI__ = true;

  const CH4_TABLE = 'shift_confirmations';
  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const norm = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } };
  const today = () => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } };
  const toast = (msg, tone) => { try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } };
  const friendly = (err) => { try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } };
  const sid = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || ''; } };
  const isAdminMode = () => { try { return isAdmin(); } catch (_) { return false; } };
  const thDate = (d) => { try { return formatThaiDate(d); } catch (_) { return d || '-'; } };
  const staffName = (id) => { try { return staffNick(id); } catch (_) { return String(id || '-'); } };
  const label = (code) => { try { return (DUTY_LABEL && DUTY_LABEL[code]) || code || '-'; } catch (_) { return code || '-'; } };
  const b = (text, cls='blue') => { try { return badge(text, cls); } catch (_) { return `<span class="badge ${esc(cls)}">${esc(text)}</span>`; } };
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
  function isCh4(code){ const c = String(code || '').trim(); return c === 'ช4' || c === 'ช4A' || c === 'ช4B' || c === 'ช4-MT'; }
  function isCh3Composite(code){ const c = String(code || '').trim(); return c === 'ช3A' || c === 'ช3B'; }
  function isManualDuty(code){ const c = String(code || '').trim(); return isCh4(c); }
  // V251: ช3A/ช3B ยืนยันเวรหลัก 8 ชม. เหมือน ช9 ส่วน ช4 เป็นเวลาส่วนเพิ่มตามจริง
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
  function autoDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isAutoDuty(x?.duty_code)); }
  function manualDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isManualDuty(x?.duty_code)); }
  function ch4Duties(staffId, date){ return dutiesOn(staffId, date).filter(x => isCh4(x?.duty_code)); }
  function attendanceRows(staffId, date){
    const d = norm(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date) === d);
  }
  function isAttendanceOt(row){
    const t = `${row?.reason || ''} ${row?.note || ''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|V220_OT_APPROVAL|V221_DUTY_DATE|V222_CLEAN_OT/i.test(t);
  }
  function attendanceOtRows(staffId, date){
    const d = norm(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && norm(r?.work_date) === d && isAttendanceOt(r));
  }
  function latest(rows){ return (rows || []).slice().sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null; }
  function hasChbd(duties){ return (duties || []).some(x => /^ชบด/.test(String(x?.duty_code || ''))); }
  function shiftWindowForDuties(date, duties){
    const d = norm(date);
    const list = duties || [];
    if (hasChbd(list)) {
      const hol = isWeekendHoliday(d);
      return { start_time: hol ? '08:00' : '16:00', end_date:addDays(d, 1), end_time:'08:00', hours:hol ? 24 : 16, label:hol ? '08:00 - 08:00 (+1 วัน)' : '16:00 - 08:00 (+1 วัน)' };
    }
    return { start_time:'08:00', end_date:d, end_time:'16:00', hours:8, label:'08:00 - 16:00' };
  }
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
    if (/อนุมัติแล้ว|ทำเองแล้ว|อยู่แทนแล้ว/.test(t)) return 'green';
    if (/ไม่อนุมัติ|ส่งกลับ/.test(t)) return 'red';
    if (/รอ|ยังไม่|ต้อง/.test(t)) return 'orange';
    return 'black';
  }

  // ---------- 1) Clean OT reason wording for display ----------
  function noteTokens(note){ return String(note || '').split('|').map(x => x.trim()).filter(Boolean); }
  function cleanTechTokens(text){
    return String(text || '')
      .replace(/V\d{3}[_A-Z0-9-]*/g, '')
      .replace(/ปรับเวลาแสดงผล\s*V\d+/g, '')
      .replace(/ซ่อมอัตโนมัติเมื่อเปิดหน้า\s*OT/gi, '')
      .replace(/สร้างจากส่วนที่\s*1\s*/gi, '')
      .replace(/จำนวนเวลา\s*OT\s*:?\s*\d+(?:\.\d+)?\s*ชั่วโมง?/gi, '')
      .replace(/เวรที่คิดอัตโนมัติ\s*:\s*[^|]+/gi, '')
      .replace(/เวลาเวร\s*[^|]+/gi, '')
      .replace(/ประเภทเวร\s*:\s*-/gi, '')
      .replace(/หมายเหตุ\s*:\s*/gi, '')
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/^\|+|\|+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function dutyFromOtRow(row){
    const text = `${row?.note || ''} | ${row?.reason || ''}`;
    let m = text.match(/เวรที่คิดอัตโนมัติ\s*:\s*([^|]+)/i);
    if (m && m[1].trim()) return m[1].trim();
    m = text.match(/ประเภทเวร\s*:?\s*([^|]+)/i);
    if (m && m[1].trim() && m[1].trim() !== '-') return m[1].trim();
    const auto = autoDuties(row?.staff_id, row?.work_date).map(a => label(a?.duty_code)).filter(Boolean).join(', ');
    return auto || '';
  }
  function cleanNonAttendanceDetail(note){
    return noteTokens(note).map(cleanTechTokens).filter(Boolean).join(' | ');
  }
  function compactOtReasonTextV222(row){
    if (!isAttendanceOt(row)) {
      const main = String(row?.reason || '').trim() || '-';
      const detail = cleanNonAttendanceDetail(row?.note);
      return { main, detail };
    }
    const duty = dutyFromOtRow(row);
    return { main:'ยืนยันอยู่เวรตามตาราง', detail:duty ? `เวร ${duty}` : '' };
  }
  window.v176OtReasonHelpers = window.v176OtReasonHelpers || {};
  window.v176OtReasonHelpers.compactOtReasonText176 = compactOtReasonTextV222;
  window.v222CompactOtReasonText = compactOtReasonTextV222;

  // ---------- 2) Ch4 cover/self confirmation on selected date ----------
  function activeStaffOptions(selectedId='', excludeId=''){
    const list = (state.staff || []).filter(s => {
      const activeOk = Object.prototype.hasOwnProperty.call(s, 'active') ? (s.active === true || String(s.active).toLowerCase() === 'true') : (s.is_active !== false && String(s.is_active).toLowerCase() !== 'false');
      const role = String(s.role || s.position || '').toLowerCase();
      return activeOk && !role.includes('physician') && !String(s.staff_type || '').includes('แพทย์') && String(s.id) !== String(excludeId || '');
    });
    let ordered = list;
    try { ordered = orderedStaff(list); } catch (_) { ordered = list.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
    return ordered.map(s => `<option value="${esc(s.id)}" ${String(s.id)===String(selectedId)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('');
  }
  function ch4Key(a){ return [a?.id || '', norm(a?.duty_date), a?.staff_id || '', a?.duty_code || 'ช4'].map(x => String(x || '').replace(/\|/g, '')).join('|'); }
  function findAssignmentByKey(key){
    const [id, date, staffId, dutyCode] = String(key || '').split('|');
    return (state.rosterAssignments || []).find(a => {
      if (!isCh4(a?.duty_code)) return false;
      if (id && String(a?.id || '') === id) return true;
      return norm(a?.duty_date) === date && String(a?.staff_id || '') === staffId && String(a?.duty_code || '') === dutyCode;
    }) || null;
  }
  function ch4ConfirmRows(){ return Array.isArray(state.shiftConfirmations) ? state.shiftConfirmations : []; }
  function ch4ConfirmationFor(a){
    const date = norm(a?.duty_date || a?.work_date);
    const owner = String(a?.staff_id || a?.owner_staff_id || '');
    const code = String(a?.duty_code || a?.shift_type || '');
    const aid = String(a?.id || a?.roster_assignment_id || '');
    return ch4ConfirmRows().slice().sort((x,y) => String(y?.updated_at || y?.confirmed_at || y?.covered_at || '').localeCompare(String(x?.updated_at || x?.confirmed_at || x?.covered_at || ''))).find(r => {
      const rDate = norm(r?.work_date || r?.duty_date);
      const rOwner = String(r?.owner_staff_id || r?.staff_id || '');
      const rCode = String(r?.duty_code || r?.shift_type || '');
      const rAid = String(r?.roster_assignment_id || '');
      if (aid && rAid && rAid === aid) return true;
      return rDate === date && rOwner === owner && (rCode === code || (isCh4(rCode) && isCh4(code)));
    }) || null;
  }
  function ch4Status(a){
    const rec = ch4ConfirmationFor(a);
    const st = String(rec?.status || '').trim();
    if (st === 'completed_self' || st === 'confirmed_self') return 'ทำเองแล้ว';
    if (st === 'covered_by_other') return `มีคนอยู่แทนแล้ว: ${staffName(rec?.covered_by_staff_id)}`;
    return 'ยังไม่ยืนยัน';
  }
  function ch4Closed(a){
    const st = String(ch4ConfirmationFor(a)?.status || '').trim();
    return st === 'completed_self' || st === 'confirmed_self' || st === 'covered_by_other';
  }
  async function saveCh4Confirmation(assignment, status, coveredByStaffId='', note=''){
    if (!assignment) throw new Error('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า');
    if (state.shiftConfirmationReadyV209 === false) throw new Error('ยังไม่ได้เปิดตาราง shift_confirmations');
    const now = new Date().toISOString();
    const payload = {
      roster_assignment_id: assignment.id || null,
      shift_type: 'ช4',
      duty_code: assignment.duty_code || 'ช4',
      work_date: norm(assignment.duty_date),
      owner_staff_id: assignment.staff_id,
      status,
      covered_by_staff_id: coveredByStaffId || null,
      covered_by_name: coveredByStaffId ? staffName(coveredByStaffId) : null,
      covered_note: note || null,
      note: note || null,
      confirmed_at: now,
      covered_at: status === 'covered_by_other' ? now : null,
      updated_by: sid()
    };
    const attempts = [
      { ...payload },
      (() => { const p = { ...payload }; delete p.covered_by_name; return p; })(),
      (() => { const p = { ...payload }; delete p.roster_assignment_id; delete p.covered_by_name; return p; })()
    ];
    let lastErr = null;
    for (const p of attempts) {
      const res = await sb.from(CH4_TABLE).upsert(p, { onConflict:'work_date,owner_staff_id,duty_code' }).select('*').maybeSingle();
      if (!res.error) return res.data || p;
      lastErr = res.error;
      if (!/column|schema|cache|constraint|conflict/i.test(String(res.error?.message || ''))) break;
    }
    throw lastErr || new Error('บันทึกสถานะ ช4 ไม่สำเร็จ');
  }
  async function confirmCh4Self(key){
    const a = findAssignmentByKey(key);
    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog('บันทึกว่าทำ ช4 เอง และไม่สร้าง OT 8 ชั่วโมงอัตโนมัติ ใช่ไหม?', 'ยืนยันทำ ช4 เอง')
      : window.confirm('บันทึกว่าทำ ช4 เองใช่ไหม?');
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกสถานะ ช4'); } catch (_) {}
    try {
      await saveCh4Confirmation(a, 'completed_self', '', 'ทำ ช4 เอง');
      await loadAllData(); renderPage();
      toast('บันทึก ช4 เองแล้ว ถ้าจะเบิก OT ให้กรอกเวลาจริงในส่วนที่ 2');
    } catch (err) { toast('บันทึก ช4 ไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  async function confirmCh4Cover(key, coveredBy){
    const a = findAssignmentByKey(key);
    if (!coveredBy) return toast('กรุณาเลือกคนอยู่แทนก่อน', 'error');
    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog(`บันทึกว่า ${staffName(coveredBy)} อยู่แทน ช4 ใช่ไหม? คนอยู่แทนต้องไปกรอก OT จริงในส่วนที่ 2 เอง`, 'ยืนยันคนอยู่แทน')
      : window.confirm(`บันทึกว่า ${staffName(coveredBy)} อยู่แทน ช4 ใช่ไหม?`);
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกคนอยู่แทน'); } catch (_) {}
    try {
      await saveCh4Confirmation(a, 'covered_by_other', coveredBy, `มีคนอยู่แทน: ${staffName(coveredBy)}`);
      await loadAllData(); renderPage();
      toast(`บันทึกคนอยู่แทนแล้ว ให้ ${staffName(coveredBy)} ไปกรอก OT จริงในส่วนที่ 2`);
    } catch (err) { toast('บันทึกคนอยู่แทนไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  function renderCh4Actions(a){
    const key = ch4Key(a);
    if (state.shiftConfirmationReadyV209 === false) return `<div class="notice error-notice compact">ยังไม่ได้เปิดตารางบันทึกสถานะ ช4</div>`;
    if (ch4Closed(a)) return `<button class="ghost-btn" type="button" disabled>ปิดรายการแล้ว</button>`;
    return `<div class="v222-ch4-action-row">
      <button class="primary-btn" type="button" data-ch4-self-v222="${esc(key)}">ทำ ช4 เอง</button>
      <label class="v222-cover-select">คนอยู่แทน <select data-ch4-cover-select-v222="${esc(key)}"><option value="">เลือกคนอยู่แทน</option>${activeStaffOptions('', a.staff_id)}</select></label>
      <button class="ghost-btn" type="button" data-ch4-cover-v222="${esc(key)}">บันทึกคนอยู่แทน / ไม่เบิก</button>
    </div>`;
  }
  function renderCh4Box(rows){
    if (!rows.length) return '';
    return `<div class="notice soft-notice compact v222-ch4-box"><b>ช4 / งานปั่นเลือด</b><div class="muted">เลือก “ทำเอง” หรือเลือกคนอยู่แทนก่อนบันทึก คนอยู่แทนค่อยกรอก OT จริงในส่วนที่ 2</div>${rows.map(a => `<div class="v222-ch4-item"><div><b>${esc(label(a.duty_code))}</b> ${b(ch4Status(a), statusCls(ch4Status(a)))}</div>${renderCh4Actions(a)}</div>`).join('')}</div>`;
  }
  function renderDutyCardV222(){
    const staffId = sid();
    const d = norm(state.myDutyDateV221 || today());
    const duties = dutiesOn(staffId, d);
    const auto = duties.filter(x => isAutoDuty(x?.duty_code));
    const manual = duties.filter(x => isManualDuty(x?.duty_code));
    const ch3 = duties.filter(x => isCh3Composite(x?.duty_code));
    const c4 = duties.filter(x => isCh4(x?.duty_code));
    const att = attendanceRows(staffId, d);
    const ot = attendanceOtRows(staffId, d);
    const latestOt = latest(ot);
    const win = auto.length ? shiftWindowForDuties(d, auto) : null;
    let status = 'ยังไม่ได้ยืนยัน';
    if (latestOt) status = statusText(latestOt);
    else if (att.length && auto.length) status = 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT';
    else if (!auto.length && manual.length) status = 'ต้องกรอกเวลาจริง/เลือกสถานะ';
    else if (!duties.length) status = 'ไม่มีเวรที่ต้องยืนยัน';
    const dutyNames = duties.length ? duties.map(a => label(a.duty_code)).join(' / ') : '-';
    const timeText = auto.length ? (ch3.length ? `${win.label} (เวรหลัก 8 ชม.)` : win.label) : (manual.length ? 'เวลาจริงในส่วนที่ 2' : '-');
    const canCheck = auto.length && !latestOt && d <= today();
    return `<div class="card ot-card my-duty-today-card v222-ot-card">
      <div class="section-title"><div><h3>ส่วนที่ 1 เวรของฉันตามวันที่เลือก</h3><p class="hint">เลือกย้อนหลังได้ กรณีลืมกดยืนยันเวร • ช3A/ช3B ยืนยันเวรหลัก 8 ชม. ได้เหมือน ช9</p></div></div>
      <label class="wide v222-duty-date-label">เลือกวันที่อยู่เวร <input id="myDutyDateV221" type="date" value="${esc(d)}" max="${esc(today())}"></label>
      <div class="my-duty-detail v222-duty-detail"><div><span class="muted">เวร</span><b>${esc(dutyNames)}</b></div><div><span class="muted">เวลา</span><b>${esc(timeText)}</b></div><div><span class="muted">สถานะ</span>${b(status, statusCls(status))}</div></div>
      ${ch3.length ? '<div class="notice soft-notice compact v251-ch3-composite-note"><b>ช3A/ช3B = ช9 + ช4</b><br>กด “ยืนยันเวรหลัก 8 ชม.” ด้านล่างก่อน ส่วนเวลาปั่นเลือด/อยู่ต่อของ ช4 ให้กรอกเพิ่มในส่วนที่ 2 ตามเวลาจริง</div>' : ''}
      ${renderCh4Box(c4)}
      ${!duties.length ? '<div class="my-duty-empty"><b>วันที่เลือกไม่มีเวรที่ต้องยืนยัน</b><span class="muted">ถ้าอยู่ต่อจริง ใช้ส่วนที่ 2 เพื่อขอ OT เพิ่ม</span></div>' : ''}
      <div class="actions v222-ot-actions"><button class="primary-btn" type="button" data-check-in-selected-v221="${esc(d)}" ${canCheck ? '' : 'disabled'}>${latestOt ? 'รอ/บันทึกแล้ว' : (canCheck ? (ch3.length ? 'ยืนยันเวรหลัก 8 ชม.' : 'ส่งให้ Admin อนุมัติ') : 'ไม่ต้องยืนยันเวรหลัก')}</button></div>
    </div>`;
  }
  function renderMyMonthDutiesV222(){
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
      const st = isCh4(a.duty_code) ? ch4Status(a) : (ot ? statusText(ot) : (att && auto ? 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT' : (auto ? 'ยังไม่ได้ยืนยัน' : 'บันทึกเวลาจริงถ้าจะเบิก')));
      const time = auto ? (isCh3Composite(a.duty_code) ? `${shiftWindowForDuties(d, [a]).label} + ช4 ตามเวลาจริง` : shiftWindowForDuties(d, [a]).label) : 'เวลาจริง';
      return `<tr><td>${thDate(d)}</td><td><b>${esc(label(a.duty_code))}</b></td><td>${esc(time)}</td><td>${b(st, statusCls(st))}</td></tr>`;
    }).join('');
    return `<div class="card wide-card v222-my-month-card" style="grid-column:1/-1;"><div class="section-title"><div><h3>เวรของฉันเดือนนี้</h3></div><label>เดือน <input id="myDutyMonthFilter" type="month" value="${esc(key)}"></label></div><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody>${body || '<tr><td colspan="4">ยังไม่มีเวรเดือนนี้</td></tr>'}</tbody></table></div></div>`;
  }
  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  window.renderOtPage = renderOtPage = function renderOtPageV222(){
    if (isAdminMode()) return previousRenderOtPage ? previousRenderOtPage.apply(this, arguments) : '';
    const d = norm(state.myDutyDateV221 || today());
    const mine = (state.otRequests || []).filter(x => String(x?.staff_id || '') === String(sid() || ''));
    const corrected = (r) => window.cnmiV221DutyOt?.correctedOtRow ? window.cnmiV221DutyOt.correctedOtRow(r) : r;
    return `<div class="grid grid-2 ot-page v222-ot-page">
      ${renderDutyCardV222()}
      <div class="card ot-card v222-ot-card"><h3>ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด</h3><p class="hint compact">ใช้เมื่ออยู่ต่อจริง/ปั่นเลือดจริง กรอกเวลาเริ่ม-สิ้นสุด แล้วรอ Admin เทียบ LIS</p><form id="otForm" class="form-grid"><label>วันที่ <input name="work_date" type="date" value="${esc(d)}" required></label><label>เริ่มเวลา <input name="start_time" type="time" value="16:00" required></label><label>ถึงเวลา <input name="end_time" type="time" required></label><label>เหตุผล <select name="reason">${(window.OT_REASONS || (typeof OT_REASONS !== 'undefined' ? OT_REASONS : ['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','อื่นๆ'])).map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label><label class="wide">รายละเอียด <input name="note" placeholder="เช่น อยู่แทน ช4 ของ... / ปั่นเลือดถึง 18:20 / รอเทียบ LIS"></label><button class="primary-btn wide" type="submit">ส่งให้ Admin อนุมัติ</button></form></div>
      ${renderMyMonthDutiesV222()}
      <div class="card wide-card" style="grid-column:1/-1;"><div class="section-title"><h3>รายการ OT ของฉัน</h3></div>${typeof renderOtTable === 'function' ? renderOtTable(mine.map(corrected)) : ''}</div>
      <div class="card" style="grid-column:1/-1;"><h3>ส่วนที่ 4 สรุป OT รายเดือน</h3>${typeof renderOtSummary === 'function' ? renderOtSummary() : ''}</div>
    </div>`;
  };

  // ---------- 3) Position management explanation / link source and actual master ----------
  function polishPositionManagement(){
    if (state?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    const slot = root.querySelector('.v221-slot-manager-card');
    if (slot && !slot.dataset.v222Labeled) {
      slot.dataset.v222Labeled = '1';
      const h3 = slot.querySelector('h3');
      if (h3) h3.textContent = 'Template Slot ตามจำนวนคน (ต้นทาง)';
      const hint = slot.querySelector('.hint');
      if (hint) hint.textContent = 'แก้รายละเอียดที่นี่ แล้วกดอัปเดตฐานข้อมูล เพื่อให้ตารางรายวัน/รายเดือนใช้ข้อมูลเดียวกัน';
    }
    const list = Array.from(root.querySelectorAll('h3')).find(x => /รายการตำแหน่งทั้งหมด/.test(x.textContent || ''));
    if (list && !list.dataset.v222Renamed) {
      list.dataset.v222Renamed = '1';
      list.textContent = 'ฐานตำแหน่งจริงที่ระบบใช้ (เชื่อมจาก Template)';
    }
  }

  // ---------- 4) Cleaner monthly position toolbar + better balancing weights ----------
  const previousPositionLoadWeight = window.positionLoadWeight || (typeof positionLoadWeight === 'function' ? positionLoadWeight : null);
  window.positionLoadWeight = positionLoadWeight = function positionLoadWeightV222(positionOrCode){
    const raw = typeof positionOrCode === 'string' ? positionOrCode : (positionOrCode?.code || positionOrCode?.position_code || '');
    const code = String(raw || '').replace(/\s+#\d+$/, '').trim();
    if (/^BB-Report/.test(code) || code === 'DR-Processing') return 1.35;
    if (/^BB-Manual/.test(code) || code === 'BB-Approve') return 1.20;
    if (/^DR-Main/.test(code)) return 1.10;
    if (/^DR-Finger/.test(code)) return 1.00;
    if (/Register|Support|Preparing/.test(code)) return 0.90;
    return previousPositionLoadWeight ? previousPositionLoadWeight(positionOrCode) : 1;
  };
  function zoneGroup(position){
    const z = String(position?.zone || '').trim();
    if (z === 'Blood Bank' || z === 'Manual') return 'BB/Manual';
    if (z === 'Donor Room') return 'Donor';
    if (z === 'ออกหน่วย') return 'Outing';
    return z || 'Other';
  }
  function isQcPosition(position){
    const c = String(position?.code || position?.position_code || '').replace(/\s+#\d+$/, '').trim();
    return /^BB-Report/.test(c) || c === 'DR-Processing' || c === 'DR-Preparation';
  }
  function fiscalStartFor(date){
    const d = new Date(`${norm(date) || today()}T00:00:00`);
    const y = d.getFullYear();
    const startYear = d.getMonth() >= 9 ? y : y - 1;
    return `${startYear}-10-01`;
  }
  function historicalPositionStats(staffId, date){
    const d = norm(date);
    const start = fiscalStartFor(d);
    const out = { group:{}, qc:0 };
    (state.positions || []).forEach(r => {
      const wd = norm(r?.work_date);
      if (!wd || wd < start || wd >= d || String(r?.staff_id || '') !== String(staffId || '')) return;
      const pos = { code:r?.position_code || r?.code, position_code:r?.position_code, zone:r?.zone };
      const g = zoneGroup(pos);
      out.group[g] = (out.group[g] || 0) + 1;
      if (isQcPosition(pos)) out.qc += 1;
    });
    return out;
  }
  const previousScore = window.monthPositionCandidateScore || (typeof monthPositionCandidateScore === 'function' ? monthPositionCandidateScore : null);
  window.monthPositionCandidateScore = monthPositionCandidateScore = function monthPositionCandidateScoreV222(staff, position, counts, rows, date, options={}){
    const base = previousScore ? Number(previousScore(staff, position, counts, rows, date, options)) || 0 : 0;
    const c = counts?.[staff.id] || { byCode:{}, byZone:{}, total:0, load:0 };
    const g = zoneGroup(position);
    const currentGroupCount = g === 'BB/Manual'
      ? Number(c.byZone?.['Blood Bank'] || 0) + Number(c.byZone?.['Manual'] || 0)
      : Number(c.byZone?.[position?.zone] || 0);
    const hist = historicalPositionStats(staff.id, date);
    const histGroup = hist.group[g] || 0;
    const qcPenalty = isQcPosition(position) ? ((hist.qc || 0) * 90 + (c.byCode?.[position?.code] || 0) * 130) : 0;
    const groupPenalty = (currentGroupCount * 46) + (histGroup * 10);
    return base + groupPenalty + qcPenalty;
  };
  window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV222(){
    if (!isAdminMode()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>';
    const key = state.positionMonthKey || state.monthKey || today().slice(0,7);
    const range = getMonthRange(key);
    const y = range.y, m = range.m, last = range.last || new Date(y, m, 0).getDate();
    const dates = Array.from({length:last}, (_,i)=>`${y}-${pad(m)}-${pad(i+1)}`);
    const rows = state.monthPositionDraft?.monthKey === key ? state.monthPositionDraft.rows : (state.positions || []).filter(x => String(x.work_date || '').startsWith(key));
    const savedCount = (state.positions || []).filter(x => String(x.work_date || '').startsWith(key)).length;
    const workingDays = dates.filter(d => !isNoPositionDay(d)).length;
    const summary = typeof renderMonthPositionSummaryHint === 'function' ? renderMonthPositionSummaryHint(rows, dates) : '';
    const matrix = typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix(rows, dates) : '';
    return `<div class="card monthly-position-page v222-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3></div></div>
      <div class="v222-month-toolbar">
        <label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label>
        <button class="ghost-btn" data-create-blank-month-positions>สร้างตารางที่ไม่มีตำแหน่ง</button>
        <button class="soft-btn" data-generate-month-positions>สร้างแผนทั้งเดือน</button>
        <button class="primary-btn" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button>
        <button class="ghost-btn danger" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button>
        <button class="ghost-btn" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button>
        <button class="soft-btn" data-position-month-overview-v169>ดูภาพรวมจัดตำแหน่ง</button>
        <button class="soft-btn qc-rotation-btn" data-qc-rotation-v169>ติดตามการหมุนเวียน QC</button>
        <span class="v222-mini-badges">${b(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black')} ${b(`วันทำงาน ${workingDays} วัน`, 'blue')}</span>
      </div>
      ${summary}${matrix}
    </div>`;
  };

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV222(){
      const ret = previousRenderPage.apply(this, arguments);
      setTimeout(() => { try { polishPositionManagement(); } catch (err) { console.warn(`${VERSION}: polish position management failed`, err); } }, 0);
      return ret;
    };
  }

  document.addEventListener('click', function(e){
    const self = e.target?.closest?.('[data-ch4-self-v222]');
    if (self) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); confirmCh4Self(self.getAttribute('data-ch4-self-v222')); return; }
    const cover = e.target?.closest?.('[data-ch4-cover-v222]');
    if (cover) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const key = cover.getAttribute('data-ch4-cover-v222');
      const select = document.querySelector(`select[data-ch4-cover-select-v222="${CSS.escape(key)}"]`);
      confirmCh4Cover(key, select?.value || '');
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v222-ch4-box{margin-top:12px}.v222-ch4-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #dbeafe}.v222-ch4-action-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.v222-cover-select{min-width:240px}.v222-cover-select select{min-width:180px}.v222-duty-date-label{display:block;margin-bottom:10px}.v222-duty-detail b{white-space:normal}
    .v222-month-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:8px 0 12px}.v222-month-toolbar label{min-width:170px}.v222-month-toolbar button{white-space:nowrap}.v222-mini-badges{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.v222-monthly-position-page .notice,.v222-monthly-position-page .v218-slot-note,.v222-monthly-position-page .v174-save-mode-note,.v222-monthly-position-page .matrix-legend{display:none!important}.v222-monthly-position-page .month-position-summary-hint{display:none!important}
    .v222-ot-page .ot-desktop-table td:nth-child(3){line-height:1.4}.v222-ot-page .muted{font-size:12px}
    @media(max-width:760px){.v222-ch4-item{display:block}.v222-ch4-action-row>*{width:100%}.v222-month-toolbar>*{width:100%}.v222-month-toolbar button{width:100%}.v222-mini-badges{width:100%}}
  `;
  document.head.appendChild(style);

  setTimeout(() => { try { polishPositionManagement(); } catch (_) {} }, 50);
  window.cnmiV222 = { compactOtReasonTextV222, confirmCh4Self, confirmCh4Cover };
  console.info(`${VERSION} loaded`);
})();
