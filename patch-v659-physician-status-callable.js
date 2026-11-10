/* CNMI Staff Planner v659 — Keep physician Consult contact available during activities or leave.
 * Only changes the contact control on Dashboard > แพทย์ Consult.
 * Readiness, duty assignments, leave/activity data and on-call rules stay unchanged.
 */
(() => {
  'use strict';
  const VERSION = 'V659_PHYSICIAN_STATUS_CALLABLE';
  if (window.__CNMI_V659_PHYSICIAN_STATUS_CALLABLE__) return;
  window.__CNMI_V659_PHYSICIAN_STATUS_CALLABLE__ = true;

  const text = value => String(value == null ? '' : value).trim();
  const stateSafe = () => { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } };
  const dateOnly = value => { const d = text(value).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; };
  function selectedDate() {
    try {
      const d = dateOnly(window.cnmiDashboardDateV443?.selectedDate?.()) || dateOnly(stateSafe().dashboardDateV443);
      if (d) return d;
      if (typeof todayStr === 'function') return dateOnly(todayStr());
    } catch (_) { /* use local date */ }
    const now = new Date(), pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  function assignments(date) {
    let m = null;
    try { m = window.cnmiPhysicianConsultV452?.baseForDate?.(date); } catch (_) { /* no schedule loaded */ }
    if (!m) return [];
    return m.weekday ? [
      { id: m.donor, site: 'Donor', time: '08:00–16:00' },
      { id: m.bb, site: 'Blood Bank', time: '08:00–16:00' },
      { id: m.combined, site: 'Donor & BB', time: '16:00–08:00' }
    ] : [{ id: m.combined, site: 'Donor & BB', time: '24 ชม.' }];
  }
  function rowSite(row) {
    if (row.classList.contains('v456-mobile-consult-row'))
      return text(row.querySelector('.v456-mobile-consult-site')?.textContent);
    return text(row.querySelector('td:nth-child(2)')?.textContent);
  }
  function rowTime(row) {
    if (row.classList.contains('v456-mobile-consult-row'))
      return text(row.querySelector('.v456-mobile-consult-time')?.textContent);
    return text(row.querySelector('td:first-child')?.textContent);
  }
  function slotFor(row, index, rows, slots) {
    const site = rowSite(row).toLowerCase();
    const time = rowTime(row);
    if (slots.length === 1) return slots[0];
    if (/donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)/i.test(site) || /16:?00\s*[–-]\s*08:?00|24\s*ชม/i.test(time)) return slots.find(s => s.site === 'Donor & BB') || null;
    if (/blood\s*bank|คลังเลือด/i.test(site)) return slots.find(s => s.site === 'Blood Bank') || null;
    if (/\bdonor\b|ห้องบริจาค/i.test(site)) return slots.find(s => s.site === 'Donor') || null;
    // Fallback only if the displayed table still has the exact number of duty rows.
    return rows.length === slots.length ? slots[index] : null;
  }
  function contactButton(badge, slot, mobile) {
    if (!slot?.id) return;
    if (badge.matches('button[data-v455-doctor-id]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${badge.className} v455-doctor-contact-btn v659-consult-status-call${mobile ? ' v456-mobile-doctor-button' : ''}`;
    button.setAttribute('data-v455-doctor-id', String(slot.id));
    button.setAttribute('data-v455-site', slot.site);
    button.setAttribute('data-v455-time', slot.time);
    button.setAttribute('data-v659-status-call', '1');
    const label = text(badge.textContent);
    button.setAttribute('aria-label', `${label} ดูเบอร์โทรและโทรหาแพทย์`);
    button.title = 'แตะเพื่อดูเบอร์โทรแพทย์ (โทรได้แม้ติดกิจกรรมหรือลา)';
    const caption = document.createElement('span');
    caption.className = 'v659-consult-status-label';
    caption.textContent = label;
    const hint = document.createElement('span');
    hint.className = 'v659-consult-call-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = '☎ โทร';
    button.append(caption, hint);
    badge.replaceWith(button);
  }
  function makeCallable(root, date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return;
    const slots = assignments(date);
    if (!slots.length) return;
    const rowsDesktop = Array.from(card.querySelectorAll('.v452-dashboard-table tbody tr'));
    const rowsMobile = Array.from(card.querySelectorAll('.v456-mobile-consult-row'));
    for (const rows of [rowsDesktop, rowsMobile]) {
      rows.forEach((row, index) => {
        const slot = slotFor(row, index, rows, slots);
        if (!slot?.id) return; // Never invent a doctor contact for an unassigned shift.
        const isMobile = row.classList.contains('v456-mobile-consult-row');
        // Keep all availability and activity classes/text; change only span -> button.
        row.querySelectorAll('span.v512-consult-activity, span.v510-consult-leave').forEach(badge => contactButton(badge, slot, isMobile));
      });
    }
  }
  function decorate(html) {
    if (typeof html !== 'string' || !html.includes('data-v452-physician-card')) return html;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      makeCallable(template.content, selectedDate());
      const holder = document.createElement('div');
      holder.appendChild(template.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] could not decorate dashboard`, err);
      return html;
    }
  }
  const prior = (() => { try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); } catch (_) { return window.renderDashboard || null; } })();
  if (typeof prior === 'function' && !prior.__v659CallableWrapped) {
    const wrapped = function renderDashboardV659() { return decorate(prior.apply(this, arguments)); };
    wrapped.__v659CallableWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }

  const style = document.createElement('style');
  style.id = 'cnmi-v659-consult-contact-style';
  style.textContent = `
    .v659-consult-status-call{appearance:none;-webkit-appearance:none;cursor:pointer;font-family:inherit;max-width:100%;gap:6px;flex-wrap:wrap;text-align:left;touch-action:manipulation;transition:filter .12s ease}
    .v659-consult-status-call:hover{filter:brightness(.96)}
    .v659-consult-status-call:focus-visible{outline:2px solid #1672ad;outline-offset:3px}
    .v659-consult-status-call .v659-consult-status-label{min-width:0;white-space:normal}
    .v659-consult-status-call .v659-consult-call-hint{font-size:.82em;white-space:nowrap;padding:1px 6px;border-radius:999px;border:1px solid currentColor;opacity:.95}
    @media(max-width:760px){.v659-consult-status-call{min-height:44px;padding:10px 12px}}
  `;
  document.head.appendChild(style);
  window.cnmiPhysicianContactV659 = { version: VERSION, makeCallable, decorate, assignments };
  console.info(`${VERSION} loaded`);
})();
