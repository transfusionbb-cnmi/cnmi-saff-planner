/* CNMI Staff Planner v679 — visible daytime physician contact after dashboard render.
 * Display-only; no changes to physician assignments, leave/activity status,
 * on-call rules, phone storage, permissions, or database.
 * Adds an independent phone button rather than changing leave/activity badges.
 */
(() => {
  'use strict';
  if (window.__CNMI_V679_PHYSICIAN_DAYTIME_CALL_VISIBLE__) return;
  window.__CNMI_V679_PHYSICIAN_DAYTIME_CALL_VISIBLE__ = true;
  const VERSION = 'V679_PHYSICIAN_DAYTIME_CALL_VISIBLE';
  const string = v => String(v == null ? '' : v).trim();
  const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(string(v).slice(0,10)) ? string(v).slice(0,10) : '';
  function S() { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } }
  function date() {
    try {
      return validDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || validDate(S().dashboardDateV443)
        || validDate(new URLSearchParams(string(location.hash).split('?')[1] || '').get('date'))
        || validDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) { return validDate(S().dashboardDateV443); }
  }
  function modelFor(day) { try { return window.cnmiPhysicianConsultV452?.baseForDate?.(day) || null; } catch (_) { return null; } }
  function person(id) { return (S().staff || []).find(p => string(p?.id) === string(id)) || null; }
  // Compare the name in the visible badge with the actual physician assignment.
  // Never attach a phone control to a row showing a different / stale physician.
  function compactName(v) {
    return string(v).replace(/(?:นายแพทย์|แพทย์หญิง|นางสาว|คุณ|นาย|นาง|หมอ|พญ\.?|นพ\.?|ดร\.?)/gi, '').replace(/[\s.·•()\[\]\-]/g, '').toLowerCase();
  }
  function nameMatches(holder, p, expectedId) {
    if (!p) return false;
    const assigned = holder.querySelector('[data-v455-doctor-id],[data-v601-doctor-id]');
    if (assigned && (assigned.getAttribute('data-v455-doctor-id') || assigned.getAttribute('data-v601-doctor-id')) === string(expectedId)) return true;
    const label = compactName(holder.textContent);
    const aliases = [p.nickname,p.full_name].map(compactName).filter(n => n.length >= 2);
    return aliases.some(n => label.includes(n));
  }
  function rowSlot(row, model, mobile) {
    if (!model?.weekday) return null;
    const site = string((mobile ? row.querySelector('.v456-mobile-consult-site') : row.querySelector('td:nth-child(2)'))?.textContent).toLowerCase();
    const time = string((mobile ? row.querySelector('.v456-mobile-consult-time') : row.querySelector('td:first-child'))?.textContent);
    if (/16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน|นอกเวลา/i.test(time)) return null;
    if (!/08:?00\s*[–-]\s*16:?00/i.test(time)) return null;
    if (/blood\s*bank|คลังเลือด/i.test(site)) return {id:model.bb,site:'Blood Bank',time:'08:00–16:00'};
    if (/^donor$|ห้องบริจาค/i.test(site)) return {id:model.donor,site:'Donor',time:'08:00–16:00'};
    return null;
  }
  function addPhoneToRow(row,model,mobile) {
    const slot = rowSlot(row,model,mobile);
    if (!slot?.id) return false;
    const holder = mobile ? row.querySelector('.v456-mobile-consult-doctor') : row.querySelector('td:nth-child(3)');
    if (!holder || holder.querySelector('[data-v679-physician-call],[data-v601-oncall-contact],.v452-not-set')) return false;
    const badge = holder.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill,[data-v455-doctor-id]');
    if (!badge || /ยังไม่กำหนด/.test(holder.textContent)) return false;
    if (badge.matches('button,a') && /☎|โทร/.test(badge.textContent)) return false;
    const p = person(slot.id);
    if (!nameMatches(holder,p,slot.id)) return false;
    // A distinct button stays visible even when the name must retain the amber
    // activity/leave status. It reuses the existing V455 contact popup handler.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v679-physician-call';
    button.setAttribute('data-v679-physician-call','1');
    button.setAttribute('data-v455-doctor-id',string(slot.id));
    button.setAttribute('data-v455-site',slot.site);
    button.setAttribute('data-v455-time',slot.time);
    button.textContent = '☎ โทร';
    button.setAttribute('aria-label',`ดูเบอร์โทร ${string(p.nickname || p.full_name || 'แพทย์')} เวลา ${slot.time}`);
    button.title = 'แตะเพื่อดูเบอร์โทรแพทย์';
    holder.appendChild(button);
    return true;
  }
  function decorate(root = document) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return 0;
    const day = date(), model = modelFor(day);
    if (!model?.weekday) return 0;
    let count = 0;
    for (const row of card.querySelectorAll('.v452-dashboard-table tbody tr')) count += Number(addPhoneToRow(row,model,false));
    for (const row of card.querySelectorAll('.v456-mobile-consult-row')) count += Number(addPhoneToRow(row,model,true));
    return count;
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(cb,0);
    frame(() => {
      scheduled = false;
      try {
        if (S().page === 'dashboard' || document.querySelector('[data-v452-physician-card]')) decorate(document);
      } catch (err) { console.warn(`[${VERSION}] render hook`, err); }
    });
  }
  const priorPage = (() => { try { return window.renderPage || (typeof renderPage === 'function' ? renderPage : null); } catch (_) { return window.renderPage || null; } })();
  if (typeof priorPage === 'function' && !priorPage.__cnmiV679Wrapped) {
    const wrapped = function renderPageV679() {
      const result = priorPage.apply(this,arguments);
      schedule();
      return result;
    };
    wrapped.__cnmiV679Wrapped = true;
    try { window.renderPage = renderPage = wrapped; } catch (_) { window.renderPage = wrapped; }
  }
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('hashchange',schedule);
  // Re-apply once when returning from an inactive tab; no repeating timer and no
  // full-page MutationObserver (those could slow a large dashboard).
  document.addEventListener('visibilitychange',() => { if (!document.hidden) schedule(); });
  const css = document.createElement('style');
  css.id = 'v679-physician-phone-css';
  css.textContent = `
    .v679-physician-call{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin:3px 0 3px 6px;padding:5px 9px;min-height:30px;border:1px solid #d7a85b;border-radius:999px;background:#fff5e6;color:#875012;font:inherit;font-size:11px;font-weight:850;line-height:1.2;white-space:nowrap;cursor:pointer;touch-action:manipulation}
    .v679-physician-call:hover{background:#ffe9c5;border-color:#b9802c}
    .v679-physician-call:focus-visible{outline:2px solid #176eae;outline-offset:2px}
    @media(max-width:760px){.v679-physician-call{min-height:42px;padding:8px 12px;font-size:13px}}
  `;
  document.head.appendChild(css);
  window.cnmiPhysicianCallV679 = { version:VERSION,decorate,date,rowSlot,nameMatches,schedule };
  console.info(`[${VERSION}] visible daytime contact control installed`);
})();
