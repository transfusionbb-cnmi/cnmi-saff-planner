/* Staff Planner V645 — Outing dates: prevent newly requested staff leave.
   Existing leave records are preserved. Do not block the separate "ไม่รับเวร" request.
   SQL_V645_OUTING_LEAVE_LOCK.sql is the authoritative server-side guard. */
(() => {
  'use strict';
  if (window.__CNMI_V645_OUTING_LEAVE_LOCK__) return;
  window.__CNMI_V645_OUTING_LEAVE_LOCK__ = true;
  const VERSION = 'V645_OUTING_LEAVE_LOCK';
  const text = value => String(value ?? '').trim();
  const date = value => text(value).slice(0, 10);
  const appState = () => { try { return typeof state !== 'undefined' && state ? state : (window.state || {}); } catch (_) { return window.state || {}; } };
  const dbClient = () => { try { return typeof sb !== 'undefined' && sb ? sb : window.sb; } catch (_) { return window.sb; } };
  const isAdminMode = () => { try { return typeof isAdmin === 'function' ? !!isAdmin() : appState().profile?.role === 'admin'; } catch (_) { return appState().profile?.role === 'admin'; } };
  function thaiDate(key) { try { return typeof formatThaiDate === 'function' ? formatThaiDate(key) : key; } catch (_) { return key; } }
  function isPhysician() {
    const p = appState().profile || {};
    return /แพทย์/.test(text(p.staff_type)) || /physician|doctor/i.test(text(p.role));
  }
  function showBlocked(message) {
    try { window.alert(message); }
    catch (_) { try { if (typeof showToast === 'function') showToast(message); } catch (_) {} }
  }
  function existingLeave(id) { return (appState().leaves || []).find(row => text(row?.id) === text(id)) || null; }
  function remainsWithinExisting(form, current) {
    if (!current) return false;
    const fd = new FormData(form);
    const start = date(fd.get('start_date')), end = date(fd.get('end_date'));
    const newPeriod = text(fd.get('leave_period') || 'เต็มวัน');
    const oldPeriod = text(current.leave_period || 'เต็มวัน');
    const notExpandingPeriod = newPeriod === oldPeriod || (oldPeriod === 'เต็มวัน' && newPeriod.startsWith('ครึ่ง'));
    return start >= date(current.start_date) && end <= date(current.end_date || current.start_date) && notExpandingPeriod && text(fd.get('type')) === text(current.type);
  }
  async function affectedOutings(start, end) {
    const db = dbClient();
    if (!db?.from) throw new Error('ยังไม่สามารถเชื่อมต่อฐานข้อมูลเพื่อตรวจวันออกหน่วยได้');
    const result = await db.from('activity_events')
      .select('id,title,event_type,start_date,end_date')
      .eq('event_type', 'ออกหน่วย')
      .lte('start_date', end).gte('end_date', start)
      .order('start_date', { ascending: true }).limit(100);
    if (result.error) throw result.error;
    return (result.data || []).filter(item => date(item.start_date) <= end && date(item.end_date || item.start_date) >= start);
  }
  async function checkLeave(form) {
    if (!form || isAdminMode() || isPhysician()) return null;
    const fd = new FormData(form);
    const type = text(fd.get('type')).split(':::')[0].trim();
    if (!type || type === 'ไม่รับเวร') return null;
    const start = date(fd.get('start_date'));
    const end = date(fd.get('end_date') || start);
    if (!start || !end || end < start) return null;
    const id = text(appState().editingLeaveId);
    if (id && remainsWithinExisting(form, existingLeave(id))) return null;
    const outings = await affectedOutings(start, end);
    if (!outings.length) return null;
    const old = id ? existingLeave(id) : null;
    // A previously granted date remains valid when edited to a shorter range.
    const blocking = outings.find(event => {
      if (!old) return true;
      return !(start >= date(old.start_date) && end <= date(old.end_date || old.start_date));
    });
    if (!blocking) return null;
    const first = start > date(blocking.start_date) ? start : date(blocking.start_date);
    return `วันที่ ${thaiDate(first)} มีการกำหนดออกหน่วยรับบริจาคเลือดแล้ว\n\nไม่เปิดรับคำขอลาใหม่ในวันออกหน่วย\nคำขอลาที่บันทึกไว้ก่อนหน้านี้ยังคงเดิม\n\nหากมีเหตุจำเป็น เช่น ลาป่วยฉุกเฉิน กรุณาติดต่อหัวหน้าเพื่อบันทึกแทน`;
  }
  function install() {
    let base;
    try { base = window.saveLeave || (typeof saveLeave === 'function' ? saveLeave : null); }
    catch (_) { base = window.saveLeave; }
    if (typeof base !== 'function' || base.__v645OutingLock) return false;
    const wrapped = async function saveLeaveV645(form) {
      try {
        const error = await checkLeave(form);
        if (error) { showBlocked(error); return; }
      } catch (error) {
        // Fail closed: a stale calendar or unavailable network must not bypass the lock.
        showBlocked('ยังตรวจสอบวันออกหน่วยไม่ได้ จึงยังบันทึกคำขอลาใหม่ไม่ได้\nกรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง หรือแจ้งหัวหน้า\n\n' + text(error?.message));
        return;
      }
      return base.apply(this, arguments);
    };
    wrapped.__v645OutingLock = true;
    try { window.saveLeave = saveLeave = wrapped; } catch (_) { window.saveLeave = wrapped; }
    return true;
  }
  function installLeaveFormHint() {
    let base;
    try { base = window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null); }
    catch (_) { base = window.renderLeavePage; }
    if (typeof base !== 'function' || base.__v645OutingHint) return;
    const wrapped = function renderLeavePageV645() {
      const html = base.apply(this, arguments);
      if (typeof html !== 'string' || !html.includes('id="leaveForm"')) return html;
      const hint = '<div class="notice soft-notice wide" style="border-color:#efca83;background:#fff7e6"><b>วันออกหน่วยรับบริจาคเลือด:</b> หลังบันทึกวันออกหน่วยแล้ว เจ้าหน้าที่จะส่งคำขอลาใหม่ในวันนั้นไม่ได้ แต่รายการที่ลามาก่อนยังคงเดิม หากจำเป็นกรุณาติดต่อหัวหน้า</div>';
      return html.replace('<form id="leaveForm" class="form-grid">', '<form id="leaveForm" class="form-grid">' + hint);
    };
    wrapped.__v645OutingHint = true;
    try { window.renderLeavePage = renderLeavePage = wrapped; } catch (_) { window.renderLeavePage = wrapped; }
  }
  // App scripts load in defer order; do not poll or rerender the UI.
  install();
  installLeaveFormHint();
  window.cnmiV645OutingLeaveLock = { checkLeave, affectedOutings, remainsWithinExisting, install };
})();
