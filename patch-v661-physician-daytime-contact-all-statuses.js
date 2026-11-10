/* CNMI Staff Planner v661 — Physician Consult phone access in every duty slot.
 * Restores the existing V455 phone popup on daytime consultation rows that
 * older leave/activity decorators rendered as noninteractive text.
 * Preserves the exact displayed activity/leave label and V660 readiness rules.
 * No database, assignments, leave data, login or PWA changes.
 */
(() => {
  'use strict';
  const VERSION = 'V661_PHYSICIAN_DAYTIME_CONTACT_ALL_STATUSES';
  if (window.__CNMI_V661_PHYSICIAN_DAYTIME_CONTACT_ALL_STATUSES__) return;
  window.__CNMI_V661_PHYSICIAN_DAYTIME_CONTACT_ALL_STATUSES__ = true;

  const txt = v => String(v == null ? '' : v).trim();
  const normDate = v => /^\d{4}-\d{2}-\d{2}$/.test(txt(v).slice(0,10)) ? txt(v).slice(0,10) : '';
  const safeState = () => {
    try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; }
    catch (_) { return window.state || {}; }
  };
  function selectedDate() {
    try {
      const selected = normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(safeState().dashboardDateV443);
      if (selected) return selected;
      const q = new URLSearchParams(txt(window.location?.hash).split('?')[1] || '');
      const fromUrl = normDate(q.get('date'));
      if (fromUrl) return fromUrl;
      if (typeof todayStr === 'function') return normDate(todayStr());
    } catch (_) { /* use local date */ }
    const d = new Date(), p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function dutySlots(date) {
    let model = null;
    try { model = window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { /* schedule not loaded */ }
    if (!model) return [];
    const combined = { id:model.combined || null, site:'Donor & BB', time:model.weekday ? '16:00–08:00' : '24 ชม.' };
    return model.weekday ? [
      { id:model.donor || null, site:'Donor', time:'08:00–16:00' },
      { id:model.bb || null, site:'Blood Bank', time:'08:00–16:00' },
      combined
    ] : [combined];
  }
  function isMobileRow(row) { return row.classList.contains('v456-mobile-consult-row'); }
  function rowSite(row) {
    return txt(isMobileRow(row) ? row.querySelector('.v456-mobile-consult-site')?.textContent
      : row.querySelector('td:nth-child(2)')?.textContent);
  }
  function rowTime(row) {
    return txt(isMobileRow(row) ? row.querySelector('.v456-mobile-consult-time')?.textContent
      : row.querySelector('td:first-child')?.textContent);
  }
  function slotFor(row,index,rows,slots) {
    const site = rowSite(row).toLowerCase(), time = rowTime(row);
    if (slots.length === 1) return slots[0];
    if (/donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)/i.test(site)
      || /16:?00\s*[–-]\s*08:?00|24\s*ชม/i.test(time))
      return slots.find(s => s.site === 'Donor & BB') || null;
    if (/blood\s*bank|คลังเลือด/i.test(site)) return slots.find(s => s.site === 'Blood Bank') || null;
    if (/\bdonor\b|ห้องบริจาค/i.test(site)) return slots.find(s => s.site === 'Donor') || null;
    // Index matching is only safe when the complete roster is present.
    return rows.length === slots.length ? slots[index] : null;
  }
  function contactControl(node,slot,isMobile) {
    if (!slot?.id || !node) return false;
    // V455 and V601 contact controls already work; never replace them.
    if (node.matches('[data-v455-doctor-id],[data-v601-oncall-contact]')) return false;
    if (node.querySelector('button,a[href^="tel:"]')) return false;
    if (node.classList.contains('v452-not-set') || /ยังไม่กำหนด/.test(txt(node.textContent))) return false;
    // A leave/activity badge can be a span or a div depending on renderer.
    const badge = node.matches('.v512-consult-activity,.v510-consult-leave');
    const plainPill = node.matches('.v452-doctor-pill');
    if (!badge && !plainPill) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${node.className} v455-doctor-contact-btn v661-consult-call${isMobile ? ' v456-mobile-doctor-button' : ''}`;
    button.setAttribute('data-v455-doctor-id',String(slot.id));
    button.setAttribute('data-v455-site',slot.site);
    button.setAttribute('data-v455-time',slot.time);
    button.setAttribute('data-v661-consult-call','1');
    // Retain visible name/meeting times and accessibility metadata.
    const label = txt(node.textContent);
    button.setAttribute('aria-label',`${label} ดูเบอร์โทรแพทย์`);
    button.title = `${txt(node.title) ? `${txt(node.title)} · ` : ''}แตะเพื่อดูเบอร์โทรแพทย์`;
    const caption = document.createElement('span');
    caption.className = 'v661-consult-label';
    caption.textContent = label;
    button.appendChild(caption);
    if (badge) {
      const hint = document.createElement('span');
      hint.className = 'v661-consult-call-hint';
      hint.setAttribute('aria-hidden','true');
      hint.textContent = '☎ โทร';
      button.appendChild(hint);
    }
    node.replaceWith(button);
    return true;
  }
  function fixRow(row,slot) {
    if (!slot?.id) return 0;
    const target = isMobileRow(row)
      ? row.querySelector('.v456-mobile-consult-doctor')
      : row.querySelector('td:nth-child(3)');
    if (!target) return 0;
    // Use only the displayed doctor's badge, never assign a contact to an empty duty.
    const missing = target.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill:not([data-v455-doctor-id]):not([data-v601-oncall-contact])');
    return contactControl(missing,slot,isMobileRow(row)) ? 1 : 0;
  }
  function makeCallable(root,date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return 0;
    const slots = dutySlots(date);
    if (!slots.length) return 0;
    let changed = 0;
    for (const rows of [
      [...card.querySelectorAll('.v452-dashboard-table tbody tr')],
      [...card.querySelectorAll('.v456-mobile-consult-row')]
    ]) {
      rows.forEach((row,index) => { changed += fixRow(row,slotFor(row,index,rows,slots)); });
    }
    return changed;
  }
  function decorate(html) {
    if (typeof html !== 'string' || !html.includes('data-v452-physician-card')) return html;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!makeCallable(template.content,selectedDate())) return html;
      const holder = document.createElement('div');
      holder.appendChild(template.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] dashboard phone contact not changed`,err);
      return html;
    }
  }
  const prior = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof prior === 'function' && !prior.__v661ContactWrapped) {
    const wrapped = function renderDashboardV661() { return decorate(prior.apply(this,arguments)); };
    wrapped.__v661ContactWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }
  const style = document.createElement('style');
  style.id = 'cnmi-v661-consult-contact-style';
  style.textContent = `
    .v661-consult-call{appearance:none;-webkit-appearance:none;cursor:pointer;font-family:inherit;text-align:left;max-width:100%;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;touch-action:manipulation}
    .v661-consult-call:hover{filter:brightness(.95)}
    .v661-consult-call:focus-visible{outline:2px solid #1672ad;outline-offset:3px}
    .v661-consult-call .v661-consult-label{white-space:normal;min-width:0}
    .v661-consult-call-hint{font-size:.82em;white-space:nowrap;padding:1px 6px;border-radius:999px;border:1px solid currentColor}
    @media(max-width:760px){.v661-consult-call{min-height:44px;padding:9px 11px}}
  `;
  document.head.appendChild(style);
  window.cnmiPhysicianContactV661 = {version:VERSION,selectedDate,dutySlots,makeCallable,decorate};
  console.info(`${VERSION} loaded`);
})();
