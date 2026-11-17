/* CNMI Staff Planner v680 — Physician Consult phone visibility after status render.
 * Scope: Dashboard > physician Consult, all assigned shifts, including leave/training.
 * Phone popup remains V455. Does not change physician availability, on-call rules,
 * roster assignments, permissions, phone records, or Supabase tables.
 * Performance: one shallow observer on #pageContent + one scoped observer on the
 * physician card. No global DOM scans, intervals, or network calls.
 */
(() => {
  'use strict';
  if (window.__CNMI_V680_PHYSICIAN_CONTACT_ALL_SLOTS__) return;
  window.__CNMI_V680_PHYSICIAN_CONTACT_ALL_SLOTS__ = true;
  const VERSION = 'V680_PHYSICIAN_CONTACT_ALL_SLOTS';
  const txt = v => String(v == null ? '' : v).trim();
  const normDate = v => /^\d{4}-\d{2}-\d{2}$/.test(txt(v).slice(0,10)) ? txt(v).slice(0,10) : '';
  function S() { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } }
  function selectedDate() {
    try { return normDate(window.cnmiDashboardDateV443?.selectedDate?.())
      || normDate(new URLSearchParams(txt(location.hash).split('?')[1] || '').get('date'))
      || normDate(S().dashboardDateV443)
      || normDate(typeof todayStr === 'function' ? todayStr() : ''); }
    catch (_) { return normDate(S().dashboardDateV443); }
  }
  function model() {
    const day = selectedDate();
    if (!day) return null;
    try { return window.cnmiPhysicianConsultV452?.baseForDate?.(day) || null; }
    catch (_) { return null; }
  }
  function staffFor(id) { return (S().staff || []).find(p => txt(p?.id) === txt(id)) || null; }
  function doctorName(p) { return txt(p?.nickname || p?.full_name || p?.email); }
  function normalizeName(s) {
    return txt(s).replace(/(?:นายแพทย์|แพทย์หญิง|นางสาว|คุณ|นาย|นาง|หมอ|พญ\.?|นพ\.?|ดร\.?)/gi, '')
      .replace(/[\s.·•()\[\]—–\-]/g, '').toLocaleLowerCase();
  }
  function matchesVisibleDoctor(holder, id) {
    const p = staffFor(id);
    if (!p) return false;
    const existingId = holder.querySelector('[data-v455-doctor-id],[data-v601-doctor-id]');
    if (existingId && txt(existingId.getAttribute('data-v455-doctor-id') || existingId.getAttribute('data-v601-doctor-id')) === txt(id)) return true;
    const badge = holder.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill');
    if (!badge) return false;
    // The status renderer writes "<nickname> · อบรม ...". Only compare the
    // name before the separator; do not accidentally match a name in a note.
    const actualName = normalizeName(txt(badge.textContent).split('·')[0]);
    const expected = [p.nickname,p.full_name,p.email].map(normalizeName).filter(x => x.length >= 2);
    return actualName.length >= 2 && expected.some(x => x === actualName || (x.length >= 3 && actualName.includes(x)) || (actualName.length >= 3 && x.includes(actualName)));
  }
  function slotForRow(row,m, mobile) {
    if (!m) return null;
    const site = txt((mobile ? row.querySelector('.v456-mobile-consult-site') : row.querySelector('td:nth-child(2)'))?.textContent).toLowerCase();
    const time = txt((mobile ? row.querySelector('.v456-mobile-consult-time') : row.querySelector('td:first-child'))?.textContent);
    const daytime = /08:?00\s*[–-]\s*16:?00/i.test(time);
    const night = /16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน|นอกเวลา/i.test(time);
    if (m.weekday && daytime && !night) {
      if (/blood\s*bank|คลังเลือด/i.test(site)) return {id:m.bb,site:'Blood Bank',time:'08:00–16:00'};
      if (/^donor$|ห้องบริจาค/i.test(site)) return {id:m.donor,site:'Donor',time:'08:00–16:00'};
    }
    if ((!m.weekday || night) && /donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)|คลังเลือด.*ห้องบริจาค/i.test(site)) {
      return {id:m.combined,site:'Donor & BB',time:m.weekday?'16:00–08:00':'24 ชม.'};
    }
    return null;
  }
  function addPhone(row,m,mobile) {
    const slot = slotForRow(row,m,mobile);
    if (!slot?.id) return false;
    const holder = mobile ? row.querySelector('.v456-mobile-consult-doctor') : row.querySelector('td:nth-child(3)');
    if (!holder || holder.querySelector('.v452-not-set,[data-v680-physician-call]')) return false;
    // Do not duplicate working V455/V601 phone controls or place a second action
    // over an existing clickable physician badge.
    if (holder.querySelector('[data-v455-doctor-id],[data-v601-oncall-contact],a[href^="tel:"]')) return false;
    if (!matchesVisibleDoctor(holder,slot.id)) return false;
    const badge = holder.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill');
    if (!badge || /ยังไม่กำหนด/.test(txt(badge.textContent))) return false;
    const p = staffFor(slot.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v680-physician-phone v455-doctor-contact-btn';
    button.setAttribute('data-v680-physician-call','1');
    button.setAttribute('data-v455-doctor-id',txt(slot.id));
    button.setAttribute('data-v455-site',slot.site);
    button.setAttribute('data-v455-time',slot.time);
    button.setAttribute('aria-label',`ดูเบอร์โทร ${doctorName(p)} ${slot.site} ${slot.time}`);
    button.title = 'แตะเพื่อดูเบอร์โทรแพทย์ (แม้กำลังอบรมหรือลา)';
    button.textContent = '☎ โทร';
    holder.appendChild(button);
    return true;
  }
  let observedCard = null;
  let cardObserver = null;
  function decorate() {
    const card = document.querySelector('#pageContent [data-v452-physician-card]');
    if (card !== observedCard) {
      cardObserver?.disconnect();
      observedCard = card;
      if (card && typeof MutationObserver === 'function') {
        cardObserver = new MutationObserver(() => schedule());
        cardObserver.observe(card,{childList:true,subtree:true});
      }
    }
    if (!card || (S().page && S().page !== 'dashboard')) return 0;
    const m = model();
    if (!m) return 0;
    let count = 0;
    card.querySelectorAll('.v452-dashboard-table tbody tr').forEach(row => { count += Number(addPhone(row,m,false)); });
    card.querySelectorAll('.v456-mobile-consult-row').forEach(row => { count += Number(addPhone(row,m,true)); });
    return count;
  }
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(cb,0))(() => {
      pending = false;
      try { decorate(); } catch (err) { console.warn(`[${VERSION}] decoration skipped`,err); }
    });
  }
  const content = document.getElementById('pageContent');
  if (content && typeof MutationObserver === 'function') {
    // Shallow: catches renderPage's pageContent.innerHTML swap, not every change
    // in large activity/position/RACE dashboards.
    const pageObserver = new MutationObserver(() => schedule());
    pageObserver.observe(content,{childList:true});
  }
  const priorPage = (() => { try { return window.renderPage || (typeof renderPage === 'function' ? renderPage : null); } catch (_) { return window.renderPage || null; } })();
  if (typeof priorPage === 'function' && !priorPage.__v680Wrapped) {
    const wrapped = function renderPageV680() { const result = priorPage.apply(this,arguments); schedule(); return result; };
    wrapped.__v680Wrapped = true;
    try { window.renderPage = renderPage = wrapped; } catch (_) { window.renderPage = wrapped; }
  }
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('hashchange',schedule);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) schedule(); });
  const style = document.createElement('style');
  style.id = 'cnmi-v680-physician-phone-style';
  style.textContent = `
    .v680-physician-phone{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin:3px 0 3px 6px;padding:5px 9px;min-height:30px;border:1px solid #d7a85b;border-radius:999px;background:#fff5e6;color:#875012;font:inherit;font-size:11px;font-weight:850;line-height:1.2;white-space:nowrap;cursor:pointer;touch-action:manipulation}
    .v680-physician-phone:hover{background:#ffe9c5;border-color:#b9802c}
    .v680-physician-phone:focus-visible{outline:2px solid #176eae;outline-offset:2px}
    @media(max-width:760px){.v680-physician-phone{min-height:42px;padding:8px 12px;font-size:13px}}
  `;
  document.head.appendChild(style);
  window.cnmiPhysicianContactV680 = {version:VERSION,selectedDate,slotForRow,matchesVisibleDoctor,decorate,schedule};
  console.info(`[${VERSION}] scoped DOM contact support installed`);
  schedule();
})();
