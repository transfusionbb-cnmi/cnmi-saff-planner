/* CNMI Staff Planner v660 — On-call Consult counts as staffed/ready when a physician is assigned.
 * Applies only to the Dashboard physician Consult readiness numerator.
 * In-hours Donor and Blood Bank still deduct overlapping leave and blocking activities.
 * On-call 16:00–08:00 (or 24h on holidays) counts when assigned, regardless of
 * leave/activity status. Contact buttons and status labels remain untouched.
 * No changes to stored schedules, leave, activity, authentication, or database.
 */
(() => {
  'use strict';
  const VERSION = 'V660_PHYSICIAN_ONCALL_READINESS';
  if (window.__CNMI_V660_PHYSICIAN_ONCALL_READINESS__) return;
  window.__CNMI_V660_PHYSICIAN_ONCALL_READINESS__ = true;

  const text = value => String(value == null ? '' : value).trim();
  const normDate = value => {
    const d = text(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  };
  const safeState = () => {
    try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; }
    catch (_) { return window.state || {}; }
  };
  function selectedDate() {
    try {
      const date = normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(safeState().dashboardDateV443);
      if (date) return date;
      if (typeof todayStr === 'function') return normDate(todayStr());
    } catch (_) { /* fall back to local day */ }
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function assignedSlots(date) {
    let schedule = null;
    try { schedule = window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { /* schedule not available yet */ }
    if (!schedule) return [];
    const oncall = { id: schedule.combined || null, time: schedule.weekday ? '16:00–08:00' : '24 ชม.', oncall: true };
    if (!schedule.weekday) return [oncall];
    return [
      { id: schedule.donor || null, time: '08:00–16:00', oncall: false },
      { id: schedule.bb || null, time: '08:00–16:00', oncall: false },
      oncall
    ];
  }
  function hasActivity(id, date, time) {
    try { return !!window.cnmiPhysicianActivityV512?.physicianActivities?.(id, date, time)?.length; }
    catch (_) { return false; }
  }
  function hasLeave(id, date, time) {
    try { return !!window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(id, date, time); }
    catch (_) { return false; }
  }
  function calculate(date) {
    const slots = assignedSlots(date);
    let ready = 0, daytimeLeave = false, activity = false;
    slots.forEach(slot => {
      if (!slot.id) return; // No scheduled doctor: never add a ready physician.
      // Show the activity status, but never deduct an assigned on-call duty.
      const blockedActivity = hasActivity(slot.id, date, slot.time);
      if (blockedActivity) activity = true;
      if (slot.oncall) { ready += 1; return; }
      const blockedLeave = hasLeave(slot.id, date, slot.time);
      if (blockedLeave) daytimeLeave = true;
      if (!blockedLeave && !blockedActivity) ready += 1;
    });
    return { ready, total: slots.length, daytimeLeave, activity };
  }
  function apply(root, date) {
    const badge = root.querySelector?.('[data-v452-physician-card] .v452-ready');
    if (!badge) return false;
    const count = calculate(date);
    if (!count.total) return false;
    badge.textContent = `พร้อม ${count.ready}/${count.total}`;
    badge.classList.toggle('is-complete', count.ready === count.total);
    badge.classList.toggle('v510-has-leave', count.daytimeLeave);
    badge.classList.toggle('v512-has-activity', count.activity);
    badge.setAttribute('title', 'นับแพทย์เวรนอกเวลาเมื่อมีผู้รับผิดชอบ แม้มีสถานะประชุม อบรม หรือลา');
    return true;
  }
  function decorate(html) {
    if (typeof html !== 'string' || !html.includes('data-v452-physician-card')) return html;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!apply(template.content, selectedDate())) return html;
      const holder = document.createElement('div');
      holder.appendChild(template.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] readiness display was not changed`, err);
      return html;
    }
  }
  const prior = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof prior === 'function' && !prior.__v660ReadinessWrapped) {
    const wrapped = function renderDashboardV660() { return decorate(prior.apply(this, arguments)); };
    wrapped.__v660ReadinessWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }
  window.cnmiPhysicianReadinessV660 = { version: VERSION, selectedDate, assignedSlots, calculate, apply, decorate };
  console.info(`${VERSION} loaded`);
})();
