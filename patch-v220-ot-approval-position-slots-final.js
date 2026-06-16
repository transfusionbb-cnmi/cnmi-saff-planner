/* =========================
   V220 OT approval repair + Position slot details final
   - Load this file LAST in index.html.
   - Fixes cached app.js issue by cache-busting index and runs after external patches.
   - Creates missing pending OT rows when attendance_logs already exists.
   - Shows detailed daytime slot templates 10-14 people in Admin > จัดการตำแหน่ง.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V220_OT_APPROVAL_POSITION_SLOTS_FINAL';
  if (window.__CNMI_V220_OT_APPROVAL_POSITION_SLOTS_FINAL__) return;
  window.__CNMI_V220_OT_APPROVAL_POSITION_SLOTS_FINAL__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const normDate = (v) => {
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  };
  const today = () => {
    try { return todayStr(); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  };
  const toast = (msg, tone) => {
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  };
  const friendly = (err) => {
    try { return friendlyDbError(err); }
    catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); }
  };
  const currentSid = () => {
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  };
  const isAdminSafe = () => {
    try { return isAdmin(); }
    catch (_) { return false; }
  };
  const staffName = (id) => {
    try { return staffNick(id); }
    catch (_) { return String(id || '-'); }
  };
  const badgeHtml = (text, cls='blue') => {
    try { return badge(text, cls); }
    catch (_) { return `<span class="badge ${esc(cls)}">${esc(text)}</span>`; }
  };
  function addDays(date, n){
    const d = new Date(`${normDate(date)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return normDate(date);
    d.setDate(d.getDate() + Number(n || 0));
    try { return toDateInput(d); }
    catch (_) { return d.toISOString().slice(0,10); }
  }
  function dutyLabel(code){
    try { return (DUTY_LABEL && DUTY_LABEL[code]) || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function isManualDuty(code){
    const c = String(code || '').trim();
    return c === 'ช4' || c === 'ช4A' || c === 'ช4B' || c === 'ช3A' || c === 'ช3B';
  }
  function dutiesOn(staffId, date){
    const d = normDate(date);
    return (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && normDate(a?.duty_date) === d)
      .sort((a,b) => {
        try { return dutySortIndex(a?.duty_code) - dutySortIndex(b?.duty_code); }
        catch (_) { return String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'); }
      });
  }
  function hasAutoDuty(staffId, date){
    const list = dutiesOn(staffId, date);
    if (!list.length) return true; // attendance_logs is already a confirmation signal; keep legacy/admin cases visible.
    return list.some(a => !isManualDuty(a?.duty_code));
  }
  function isAttendanceOtReason(row){
    const text = `${row?.reason || ''} ${row?.note || ''}`;
    return /ยืนยันอยู่เวร|รับ OT|อยู่เวรตามตาราง|สร้างจากส่วนที่ 1/i.test(text);
  }
  function attendanceOtRows(staffId, date){
    const d = normDate(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && normDate(r?.work_date) === d && isAttendanceOtReason(r));
  }
  function attendanceRowsFor(staffId, date){
    const d = normDate(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && normDate(a?.duty_date) === d);
  }
  function findMissingAttendanceOtRows({ allInRange=false }={}){
    const start = normDate(state.otApprovalStartDate || `${today().slice(0,7)}-01`);
    const end = normDate(state.otApprovalEndDate || addDays(start, 40));
    const me = currentSid();
    const map = new Map();
    (state.attendance || []).forEach(a => {
      const staffId = a?.staff_id;
      const d = normDate(a?.duty_date);
      if (!staffId || !d) return;
      if (!isAdminSafe() && String(staffId) !== String(me)) return;
      if (isAdminSafe() && allInRange && start && d < start) return;
      if (isAdminSafe() && allInRange && end && d > end) return;
      if (!isAdminSafe() && d !== today()) return;
      if (attendanceOtRows(staffId, d).length) return;
      if (!hasAutoDuty(staffId, d)) return;
      map.set(`${staffId}|${d}`, { staffId, date:d, attendance:a });
    });
    return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date) || staffName(a.staffId).localeCompare(staffName(b.staffId), 'th'));
  }
  async function existsAttendanceOtInDb(staffId, date){
    try {
      const res = await sb.from('ot_requests')
        .select('id,status,reason,note,work_date,staff_id,created_at')
        .eq('staff_id', staffId)
        .eq('work_date', date)
        .ilike('reason', '%ยืนยันอยู่เวร%')
        .limit(1);
      if (!res.error && (res.data || []).length) return res.data[0];
    } catch (_) {}
    return null;
  }
  function otNoteFor(staffId, date, source){
    const duties = dutiesOn(staffId, date).filter(a => !isManualDuty(a?.duty_code));
    const labels = duties.map(a => dutyLabel(a.duty_code)).filter(Boolean).join(', ');
    let incharge = false;
    try { incharge = String(currentInchargeForMonth(date.slice(0,7))) === String(staffId); } catch (_) {}
    const base = incharge
      ? 'ระบบคิด OT อินชาร์จประจำเดือน 8 ชั่วโมงอัตโนมัติ'
      : `สร้างจากส่วนที่ 1 ยืนยันอยู่เวร${labels ? ` | เวรที่คิดอัตโนมัติ: ${labels}` : ''}`;
    return `${base} | ${source || 'ซ่อมจาก attendance_logs'} | ${VERSION}`.slice(0, 900);
  }
  async function insertMissingAttendanceOt(staffId, date, source){
    const d = normDate(date);
    if (!staffId || !d) throw new Error('ข้อมูลเจ้าหน้าที่หรือวันที่ไม่ครบ');
    const inState = attendanceOtRows(staffId, d)[0];
    if (inState) return inState;
    const inDb = await existsAttendanceOtInDb(staffId, d);
    if (inDb) return inDb;
    const base = {
      staff_id: staffId,
      work_date: d,
      start_time: '08:00',
      end_date: addDays(d, 1),
      end_time: '08:00',
      reason: 'ยืนยันอยู่เวรตามตาราง',
      note: otNoteFor(staffId, d, source),
      status: 'รออนุมัติ',
      lat: null,
      lng: null,
      accuracy: null,
      device: `${navigator.userAgent || 'browser'} | ${VERSION}`.slice(0, 250)
    };
    const attempts = [
      { ...base },
      (() => { const p = { ...base }; delete p.end_date; return p; })(),
      (() => { const p = { ...base }; delete p.start_time; delete p.end_date; return p; })(),
      (() => { const p = { ...base }; delete p.start_time; delete p.end_date; delete p.lat; delete p.lng; delete p.accuracy; return p; })()
    ];
    let lastError = null;
    for (const payload of attempts) {
      const res = await sb.from('ot_requests').insert(payload).select('*').maybeSingle();
      if (!res.error) {
        const row = res.data || payload;
        try { state.otRequests = [row, ...(state.otRequests || [])]; } catch (_) {}
        return row;
      }
      lastError = res.error;
      const msg = String(res.error?.message || '');
      if (!/column|schema|cache|start_time|end_date|lat|lng|accuracy/i.test(msg)) break;
    }
    throw lastError || new Error('สร้างรายการ OT ไม่สำเร็จ');
  }
  async function repairMissingAttendanceOt(rows, source){
    const targets = rows || findMissingAttendanceOtRows({ allInRange:isAdminSafe() });
    if (!targets.length) return { ok:0, fail:0 };
    let ok = 0; let fail = 0; const errors = [];
    for (const t of targets) {
      try { await insertMissingAttendanceOt(t.staffId, t.date, source); ok += 1; }
      catch (err) { fail += 1; errors.push(err); console.warn(`${VERSION}: repair failed`, t, err); }
    }
    return { ok, fail, errors };
  }
  let autoRepairTimer = null;
  let autoRepairRunning = false;
  function scheduleAutoRepair(){
    if (state?.page !== 'ot') return;
    if (autoRepairTimer) clearTimeout(autoRepairTimer);
    autoRepairTimer = setTimeout(async () => {
      if (autoRepairRunning || state?.page !== 'ot') return;
      const targets = findMissingAttendanceOtRows({ allInRange:isAdminSafe() });
      if (!targets.length) return;
      autoRepairRunning = true;
      try {
        const res = await repairMissingAttendanceOt(targets, 'ซ่อมอัตโนมัติเมื่อเปิดหน้า OT');
        if (res.ok) {
          await loadAllData();
          if (state.page === 'ot') renderPage();
          toast(`สร้างรายการ OT รอ Admin อนุมัติแล้ว ${res.ok} รายการ${res.fail ? ` / ไม่สำเร็จ ${res.fail}` : ''}`, res.fail ? 'error' : undefined);
        } else if (res.fail) {
          toast('ยังสร้างรายการ OT ไม่สำเร็จ: ' + friendly(res.errors?.[0]), 'error');
        }
      } finally {
        autoRepairRunning = false;
      }
    }, 250);
  }
  function repairPanelHtml(){
    const missing = findMissingAttendanceOtRows({ allInRange:isAdminSafe() });
    if (!missing.length) return '';
    const lines = missing.slice(0, 8).map(x => `${staffName(x.staffId)} • ${formatThaiDate ? formatThaiDate(x.date) : x.date}`).join('<br>');
    const more = missing.length > 8 ? `<br><span class="muted">และอีก ${missing.length - 8} รายการ</span>` : '';
    return `<div class="notice error-notice compact v220-ot-repair-panel" style="grid-column:1/-1;">
      <b>พบว่าแตะ/ลงชื่ออยู่เวรแล้ว แต่ยังไม่มีรายการ OT รออนุมัติ</b><br>
      ${lines}${more}
      <div class="actions"><button class="primary-btn" type="button" data-repair-attendance-ot-v220>สร้างรายการ OT รออนุมัติจาก Attendance</button></div>
    </div>`;
  }

  const previousFilteredOtRows = window.filteredOtRows || (typeof filteredOtRows === 'function' ? filteredOtRows : null);
  if (previousFilteredOtRows) {
    window.filteredOtRows = filteredOtRows = function filteredOtRowsV220(rows){
      const mapped = (Array.isArray(rows) ? rows : []).map(r => {
        const s = String(r?.status || '').trim().toLowerCase();
        if (s === 'pending') return { ...r, status:'รออนุมัติ' };
        if (s === 'approved') return { ...r, status:'อนุมัติ' };
        if (s === 'rejected') return { ...r, status:'ไม่อนุมัติ' };
        return r;
      });
      return previousFilteredOtRows(mapped);
    };
  }

  const previousCheckIn = window.checkIn || (typeof checkIn === 'function' ? checkIn : null);
  if (previousCheckIn) {
    window.checkIn = checkIn = async function checkInV220(){
      const staffId = currentSid();
      const d = today();
      if (attendanceRowsFor(staffId, d).length && !attendanceOtRows(staffId, d).length && hasAutoDuty(staffId, d)) {
        try {
          await insertMissingAttendanceOt(staffId, d, 'ซ่อมจากการกดปุ่มยืนยันซ้ำ');
          await loadAllData();
          renderPage();
          toast('สร้างรายการ OT รอ Admin อนุมัติแล้ว');
        } catch (err) { toast('สร้างรายการ OT ไม่สำเร็จ: ' + friendly(err), 'error'); }
        return;
      }
      await previousCheckIn.apply(this, arguments);
      // Legacy checkIn could save attendance but fail OT; verify immediately.
      try {
        await loadAllData();
        if (attendanceRowsFor(staffId, d).length && !attendanceOtRows(staffId, d).length && hasAutoDuty(staffId, d)) {
          await insertMissingAttendanceOt(staffId, d, 'ซ่อมทันทีหลังลงชื่ออยู่เวร');
          await loadAllData();
          renderPage();
          toast('ลงชื่อแล้ว และสร้างรายการ OT รอ Admin อนุมัติแล้ว');
        }
      } catch (err) { console.warn(`${VERSION}: post check-in repair skipped`, err); }
    };
  }

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  if (previousRenderOtPage) {
    window.renderOtPage = renderOtPage = function renderOtPageV220(){
      let html = String(previousRenderOtPage.apply(this, arguments) || '');
      const panel = repairPanelHtml();
      if (panel && !html.includes('v220-ot-repair-panel')) {
        if (html.includes('ส่วนที่ 3 อนุมัติ OT')) html = html.replace(/(<div class="card wide-card"[^>]*>\s*<div class="section-title"><h3>ส่วนที่ 3 อนุมัติ OT)/, panel + '$1');
        else html = html.replace(/(<div class="card wide-card"[^>]*>\s*<div class="section-title"><h3>รายการ OT ของฉัน)/, panel + '$1');
        if (!html.includes('v220-ot-repair-panel')) html = panel + html;
      }
      scheduleAutoRepair();
      return html;
    };
  }

  // ----- Position slot detail manager -----
  const SLOT_DETAIL_FALLBACK = {
    report1: 'รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ',
    report2: 'รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ',
    approve: 'รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน',
    manualAll: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด',
    manual1Wide: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam, รูดสาย, การปั่นแยกส่วนประกอบโลหิต',
    manual2Wide: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด, การปั่นแยกส่วนประกอบโลหิต',
    manual1: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag',
    manual2: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag',
    manual3: 'วัดค่า pH & Adam, การปั่นแยกส่วนประกอบโลหิต, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด',
    bbSupport: 'รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)',
    register: 'รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)',
    finger1: 'รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    finger2: 'รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    main: 'รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ',
    processingFull: 'นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค',
    processingShort: 'นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด',
    preparing: 'รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค'
  };
  function slotRow(code, zone, main_rule, break_time, job_desc, sort_order){
    return { code, zone, main_rule, break_time, job_desc, sort_order, is_outing:false, is_active:true, eligibility_code:code };
  }
  function fallbackSlotSets(){
    const MT_ONLY = 'MT เท่านั้น'; const MT_TANG = 'MT หรือ แตง'; const CLERK_TANG = 'Clerk หรือ แตง'; const D = SLOT_DETAIL_FALLBACK;
    return {
      10: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual','Manual',MT_ONLY,'12:00',D.manualAll,4), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,5), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,6), slotRow('DR-Finger+Interview','Donor Room',MT_TANG,'12:00',D.finger1,7), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,8), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,9), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,10)
      ],
      11: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1Wide,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2Wide,5), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,6), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,7), slotRow('DR-Finger+Interview','Donor Room',MT_TANG,'12:00',D.finger1,8), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,9), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,10), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,11)
      ],
      12: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1Wide,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2Wide,5), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,6), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,7), slotRow('DR-Finger+Interview 1','Donor Room',MT_TANG,'12:00',D.finger1,8), slotRow('DR-Finger+Interview 2','Donor Room',MT_TANG,'12:00',D.finger2,9), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,10), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,11), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,12)
      ],
      13: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2,5), slotRow('BB-Manual 3','Manual',MT_ONLY,'12:00',D.manual3,6), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,7), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,8), slotRow('DR-Finger+Interview 1','Donor Room',MT_TANG,'12:00',D.finger1,9), slotRow('DR-Finger+Interview 2','Donor Room',MT_TANG,'12:00',D.finger2,10), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,11), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,12), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,13)
      ],
      14: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2,5), slotRow('BB-Manual 3','Manual',MT_ONLY,'12:00',D.manual3,6), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,7), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,8), slotRow('DR-Finger+Interview 1','Donor Room',MT_TANG,'12:00',D.finger1,9), slotRow('DR-Finger+Interview 2','Donor Room',MT_TANG,'12:00',D.finger2,10), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,11), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,12), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingShort,13), slotRow('DR-Preparing','Donor Room',CLERK_TANG,'12:00',D.preparing,14)
      ]
    };
  }
  function slotSets(){
    return window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || fallbackSlotSets();
  }
  function allUniqueSlotRows(){
    const map = new Map();
    [8,9,10,11,12,13,14].forEach(n => (slotSets()[n] || []).forEach(p => {
      if (!map.has(p.code)) map.set(p.code, { ...p });
    }));
    return Array.from(map.values()).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999) || String(a.code).localeCompare(String(b.code), 'th'));
  }
  function slotDetailManagerHtml(){
    const sets = slotSets();
    const selected = Number(state.daySlotPreviewSet220 || 10);
    const rows = sets[selected] || sets[10] || [];
    const buttons = [8,9,10,11,12,13,14].map(n => `<button type="button" class="${selected===n?'primary-btn':'ghost-btn'}" data-slot-set-preview-v220="${n}">${n} คน</button>`).join('');
    const tableRows = rows.map((p, idx) => `<tr><td>${idx + 1}</td><td>${esc(p.zone || '-')}</td><td><b>${esc(p.code)}</b></td><td>${esc(p.main_rule || '-')}</td><td>${esc(p.break_time || '-')}</td><td>${esc(p.job_desc || '-')}</td></tr>`).join('');
    return `<div class="card wide-card v220-slot-manager-card">
      <div class="section-title"><div><h3>ชุด Slot ตำแหน่งกลางวัน 8-14 คน</h3><p class="hint">เลือกดูชุดตามจำนวนคนทำงานจริง รายละเอียดนี้ใช้เป็น Template ของตารางตำแหน่งรายวัน/รายเดือน</p></div><div class="actions"><button type="button" class="soft-btn" data-seed-all-slots-v220>อัปเดตฐานข้อมูลจากชุด 8-14 ทั้งหมด</button></div></div>
      <div class="v220-slot-tabs">${buttons}</div>
      <div class="notice soft-notice compact"><b>ชุดที่เลือก:</b> ${selected} คน / ${rows.length} ตำแหน่ง — ระบบรายวันจะเลือกชุดตามจำนวนเจ้าหน้าที่ที่มาทำงานจริงอัตโนมัติ</div>
      <div class="table-wrap compact-table v220-slot-detail-table"><table><thead><tr><th>#</th><th>โซน</th><th>ตำแหน่ง</th><th>ผู้ปฏิบัติหลัก</th><th>เวลาพัก</th><th>รายละเอียดหน้าที่ประจำตำแหน่ง</th></tr></thead><tbody>${tableRows}</tbody></table></div>
      <p class="hint">ตำแหน่งที่ซ้ำเชิงหน้าที่ เช่น DR-Main 1/2 หรือ BB-Manual 1/2 แยกชื่อเพื่อให้จัดคนในระบบไม่ทับช่องกัน</p>
    </div>`;
  }
  function injectSlotManager(){
    if (state?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    root.querySelectorAll('.v218-position-slot-tools').forEach(el => el.remove());
    const existing = root.querySelector('.v220-slot-manager-card');
    if (existing) existing.outerHTML = slotDetailManagerHtml();
    else {
      const wrap = document.createElement('div');
      wrap.innerHTML = slotDetailManagerHtml();
      const target = root.querySelector('.position-management-page');
      if (target) target.prepend(wrap.firstElementChild);
      else root.prepend(wrap.firstElementChild);
    }
  }
  async function seedAllSlotsToSupabase(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const ok = await (typeof confirmDialog === 'function'
      ? confirmDialog('อัปเดต daily_position_masters ด้วยชุด Slot 8-14 ทั้งหมด และปิดใช้งานตำแหน่งปกติเก่าที่ไม่อยู่ในชุดนี้ใช่ไหม?', 'ยืนยันอัปเดต Slot กลางวัน')
      : Promise.resolve(window.confirm('อัปเดตชุด Slot 8-14 ทั้งหมด?')));
    if (!ok) return;
    try { setBusy(true, 'กำลังอัปเดตชุด Slot 8-14'); } catch (_) {}
    try {
      const desired = allUniqueSlotRows();
      const desiredCodes = new Set(desired.map(p => String(p.code || '').trim()).filter(Boolean));
      const existingRes = await sb.from('daily_position_masters').select('*');
      if (existingRes.error) throw existingRes.error;
      const existing = existingRes.data || [];
      const isOuting = (row) => row?.is_outing === true || String(row?.zone || '').trim() === 'ออกหน่วย' || String(row?.eligibility_code || '').startsWith('OUTING:');
      for (const row of existing) {
        const code = String(row?.code || '').trim();
        if (!isOuting(row) && code && !desiredCodes.has(code) && row.is_active !== false) {
          const r = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:currentSid() }).eq('id', row.id);
          if (r.error) throw r.error;
        }
      }
      for (const p of desired) {
        const payload = {
          code:p.code,
          zone:p.zone,
          is_outing:false,
          break_time:p.break_time || '-',
          main_rule:p.main_rule || null,
          job_desc:p.job_desc || null,
          sort_order:p.sort_order || 999,
          eligibility_code:p.eligibility_code || p.code,
          is_active:true,
          deleted_at:null,
          updated_by:currentSid()
        };
        const found = existing.find(x => String(x?.code || '').trim() === String(p.code || '').trim() && !isOuting(x));
        const res = found?.id
          ? await sb.from('daily_position_masters').update(payload).eq('id', found.id)
          : await sb.from('daily_position_masters').insert({ ...payload, created_by:currentSid() });
        if (res.error) throw res.error;
      }
      if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true });
      else if (typeof loadAllData === 'function') await loadAllData();
      renderPage();
      toast('อัปเดตฐานข้อมูลชุด Slot 8-14 ทั้งหมดแล้ว');
    } catch (err) {
      console.error(`${VERSION}: seed slots failed`, err);
      toast('อัปเดต Slot ไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { setBusy(false); } catch (_) {} }
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV220(){
      const result = previousRenderPage.apply(this, arguments);
      setTimeout(() => {
        try { injectSlotManager(); } catch (err) { console.warn(`${VERSION}: inject slot manager failed`, err); }
        try { if (state?.page === 'ot') scheduleAutoRepair(); } catch (_) {}
      }, 0);
      return result;
    };
  }

  document.addEventListener('click', function(e){
    const repairBtn = e.target?.closest?.('[data-repair-attendance-ot-v220]');
    if (repairBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      (async () => {
        try { setBusy(true, 'กำลังสร้างรายการ OT รออนุมัติ'); } catch (_) {}
        try {
          const res = await repairMissingAttendanceOt(findMissingAttendanceOtRows({ allInRange:isAdminSafe() }), 'กดปุ่มซ่อม V220');
          await loadAllData(); renderPage();
          toast(`สร้างรายการ OT รออนุมัติแล้ว ${res.ok} รายการ${res.fail ? ` / ไม่สำเร็จ ${res.fail}` : ''}`, res.fail ? 'error' : undefined);
        } catch (err) { toast('สร้างรายการ OT ไม่สำเร็จ: ' + friendly(err), 'error'); }
        finally { try { setBusy(false); } catch (_) {} }
      })();
      return;
    }
    const tab = e.target?.closest?.('[data-slot-set-preview-v220]');
    if (tab) {
      e.preventDefault(); e.stopPropagation();
      state.daySlotPreviewSet220 = Number(tab.getAttribute('data-slot-set-preview-v220')) || 10;
      injectSlotManager();
      return;
    }
    const seed = e.target?.closest?.('[data-seed-all-slots-v220]');
    if (seed) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      seedAllSlotsToSupabase();
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v220-slot-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px;}
    .v220-slot-detail-table table td:nth-child(6){min-width:360px;line-height:1.55;white-space:normal;}
    .v220-slot-detail-table table td:nth-child(3){min-width:150px;}
    .v220-slot-manager-card{margin-bottom:14px;}
    .v220-ot-repair-panel .actions{margin-top:10px;}
  `;
  document.head.appendChild(style);

  window.cnmiV220OtRepair = { findMissingAttendanceOtRows, repairMissingAttendanceOt, insertMissingAttendanceOt };
  console.info(`${VERSION} loaded`);
})();
