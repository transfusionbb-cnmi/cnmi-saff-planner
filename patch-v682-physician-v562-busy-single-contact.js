/* CNMI Staff Planner v682 — Fix v562 realtime busy badge (name + training status).
 * Replaces v681 control rather than loading another competing layer.
 * UI-only: normal, training/leave, on-call, weekday/holiday and mobile are all
 * ONE tappable physician/status pill (with phone icon), never name + phone button.
 * Reuses the existing V455 phone popup. No roster, availability, phone or SQL writes.
 * The visible badge MUST agree with the assigned profile; otherwise no action.
 * Runs after the older dashboard decorators and when the physician card changes.
 */
(() => {
  'use strict';
  if (window.__CNMI_V682_PHYSICIAN_SINGLE_CONTACT__) return;
  window.__CNMI_V682_PHYSICIAN_SINGLE_CONTACT__ = true;
  const VERSION = 'V682_PHYSICIAN_SINGLE_CONTACT';
  const text = v => String(v == null ? '' : v).trim();
  const normDate = v => /^\d{4}-\d{2}-\d{2}$/.test(text(v).slice(0,10)) ? text(v).slice(0,10) : '';
  function stateNow() { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } }
  function selectedDate() {
    try {
      // Hash is authoritative when the user clicks another day on Dashboard.
      const hashDay = normDate(new URLSearchParams(text(location.hash).split('?')[1] || '').get('date'));
      return hashDay || normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(stateNow().dashboardDateV443)
        || normDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) { return normDate(stateNow().dashboardDateV443); }
  }
  function assignedSlots() {
    const date = selectedDate();
    const model = date && window.cnmiPhysicianConsultV452?.baseForDate?.(date);
    if (!model) return [];
    const combined = {id:model.combined,site:'Donor & BB',time:model.weekday?'16:00–08:00':'24 ชม.'};
    return model.weekday ? [
      {id:model.donor,site:'Donor',time:'08:00–16:00'},
      {id:model.bb,site:'Blood Bank',time:'08:00–16:00'}, combined
    ] : [combined];
  }
  function staffById(id) {
    return (stateNow().staff || []).find(p => text(p?.id) === text(id)) || null;
  }
  function normalizedName(s) {
    return text(s).replace(/(?:นายแพทย์|แพทย์หญิง|นางสาว|คุณ|นาย|นาง|หมอ|พญ\.?|นพ\.?|ดร\.?)/gi,'')
      .replace(/[\s.·•()\[\]—–-]/g,'').toLowerCase();
  }
  function visibleLabel(el) {
    const copied = el.cloneNode(true);
    copied.querySelectorAll('.v659-consult-call-hint,.v661-consult-call-hint,.v678-call-hint,.v681-phone-hint,.v682-phone-hint,[data-v679-physician-call],[data-v680-physician-call]').forEach(x=>x.remove());
    return text(copied.textContent).replace(/(?:\s*[☎📞]\s*โทร\s*)+$/g,'').trim();
  }
  function matchesPhysician(label,p) {
    if (!p) return false;
    const visible = normalizedName(text(label).split('·')[0]);
    if (!visible || visible.length < 2) return false;
    const names = [p.nickname,p.full_name,p.name,p.email].map(normalizedName).filter(x=>x.length >= 2);
    return names.some(n=>visible === n || (visible.length >= 3 && n.endsWith(visible)));
  }
  function resolveSlot(row,slots,mobile) {
    const site = text((mobile?row.querySelector('.v456-mobile-consult-site'):row.querySelector('td:nth-child(2)'))?.textContent).toLowerCase();
    const time = text((mobile?row.querySelector('.v456-mobile-consult-time'):row.querySelector('td:first-child'))?.textContent);
    if (slots.length === 1) return /donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)|คลังเลือด|ตลอดวัน|24\s*ชม/i.test(site+' '+time) ? slots[0] : null;
    if (/16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน/i.test(time) && /donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)/i.test(site)) return slots[2];
    if (/08:?00\s*[–-]\s*16:?00/i.test(time)) {
      if (/^donor$|ห้องบริจาค/i.test(site)) return slots[0];
      if (/blood\s*bank|คลังเลือด/i.test(site)) return slots[1];
    }
    return null; // Never infer physician from unknown row or index.
  }
  const obsoleteButtons = '[data-v679-physician-call],[data-v680-physician-call]';
  const doctorBadges = '.v562-physician-busy,.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill,[data-v455-doctor-id],[data-v601-oncall-contact],.v456-mobile-not-set';
  function displayedDoctorName(el) {
    // v562 replaces Consult pills with a two-line busy badge, not v512.
    // Read the actual physician name from its <b>; activity descriptions
    // inside <small> must never be treated as part of the person's name.
    if (el.classList.contains('v562-physician-busy')) return text(el.querySelector('b')?.textContent);
    return visibleLabel(el).split('·')[0].trim();
  }
  function normalizeRow(row,slots,mobile) {
    const holder = mobile ? row.querySelector('.v456-mobile-consult-doctor') : row.querySelector('td:nth-child(3)');
    if (!holder) return 0;
    let changed = 0;
    // Remove previous v679/680 extra buttons. The physician pill itself is the button.
    holder.querySelectorAll(obsoleteButtons).forEach(el=>{el.remove();changed++;});
    const slot = resolveSlot(row,slots,mobile);
    if (!slot?.id) return changed;
    const person = staffById(slot.id);
    if (!person) return changed;
    const badges = [...holder.querySelectorAll(doctorBadges)].filter(el=>!el.closest(obsoleteButtons));
    const existing = badges.find(el=>!el.classList.contains('v452-not-set') || el.classList.contains('v456-mobile-not-set'));
    if (!existing) return changed;
    const label = visibleLabel(existing);
    if (/ยังไม่กำหนด/.test(label) || !matchesPhysician(displayedDoctorName(existing),person)) return changed;
    const id = text(slot.id);
    if (existing.matches('button[data-v682-contact-ready="1"]')
        && existing.getAttribute('data-v455-doctor-id') === id
        && existing.getAttribute('data-v455-site') === slot.site
        && existing.getAttribute('data-v455-time') === slot.time) return changed;

    // Use only one button for the displayed physician. Preserve leave/training
    // badge appearance and displayed text but remove extra nested 'โทร' controls.
    const button = document.createElement('button');
    button.type = 'button';
    const statusClass = existing.classList.contains('v562-physician-busy') ? 'v562-physician-busy'
      : existing.classList.contains('v512-consult-activity') ? 'v512-consult-activity'
      : existing.classList.contains('v510-consult-leave') ? 'v510-consult-leave' : 'v452-doctor-pill';
    button.className = `${statusClass} v455-doctor-contact-btn v682-single-contact${mobile?' v456-mobile-doctor-button':''}`;
    button.setAttribute('data-v682-contact-ready','1');
    button.setAttribute('data-v455-doctor-id',id);
    button.setAttribute('data-v455-site',slot.site);
    button.setAttribute('data-v455-time',slot.time);
    button.setAttribute('title',`${text(existing.getAttribute('title')) ? text(existing.getAttribute('title'))+' · ' : ''}แตะชื่อเพื่อดูเบอร์โทร`);
    button.setAttribute('aria-label',`${label} ดูเบอร์โทร`);
    if (existing.classList.contains('v562-physician-busy')) {
      // Preserve v562's two-line name and exact training/leave time.
      // In particular, do not flatten the <b>/<small> text to a single label.
      existing.childNodes.forEach(node => button.appendChild(node.cloneNode(true)));
    } else {
      const caption = document.createElement('span');
      caption.className = 'v682-doctor-name';
      caption.textContent = label;
      button.appendChild(caption);
    }
    const glyph = document.createElement('span');
    glyph.className = 'v682-phone-hint';
    glyph.textContent = '☎';
    glyph.setAttribute('aria-hidden','true');
    button.appendChild(glyph);
    existing.replaceWith(button);
    // Never leave another active contact next to the new, unified control.
    holder.querySelectorAll('[data-v455-doctor-id],[data-v601-oncall-contact]').forEach(el=>{
      if (el !== button && !button.contains(el)) {el.remove();changed++;}
    });
    return changed + 1;
  }
  let watchedCard = null, cardObserver = null, pending = false;
  function decorate() {
    // The older sidebar scripts keep displaying v568; show the deployed bundle
    // version so a user can confirm that the new fix actually reached the browser.
    document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{
      if (chip.textContent !== 'v682') { chip.textContent='v682'; chip.title='Staff Planner v682 · แพทย์ Consult โทรจากชื่อได้ทุกช่วงเวร'; }
    });
    const card = document.querySelector('#pageContent [data-v452-physician-card]');
    if (watchedCard !== card) {
      cardObserver?.disconnect();
      watchedCard = card;
      if (card && typeof MutationObserver === 'function') {
        cardObserver = new MutationObserver(schedule);
        cardObserver.observe(card,{childList:true,subtree:true,characterData:true});
      }
    }
    if (!card) return 0;
    const slots = assignedSlots();
    if (!slots.length) return 0;
    let changed = 0;
    card.querySelectorAll('.v452-dashboard-table tbody tr').forEach(row=>{ changed += normalizeRow(row,slots,false); });
    card.querySelectorAll('.v456-mobile-consult-row').forEach(row=>{ changed += normalizeRow(row,slots,true); });
    return changed;
  }
  function schedule() {
    if (pending) return;
    pending = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb=>setTimeout(cb,0))(()=>{
      pending = false;
      try {decorate();} catch (err) {console.warn(`[${VERSION}] decoration skipped`,err);}
    });
  }
  const root = document.getElementById('pageContent');
  if (root && typeof MutationObserver === 'function') {
    new MutationObserver(schedule).observe(root,{childList:true});
  }
  const priorPage = (()=>{ try {return window.renderPage || (typeof renderPage === 'function' ? renderPage : null);} catch (_) {return window.renderPage || null;} })();
  if (typeof priorPage === 'function') {
    const wrapped = function renderPageV682() {const result = priorPage.apply(this,arguments);schedule();return result;};
    try {window.renderPage = renderPage = wrapped;} catch (_) {window.renderPage = wrapped;}
  }
  window.addEventListener('hashchange',schedule);
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) schedule();});
  window.addEventListener('pageshow',schedule);
  const css = document.createElement('style');
  css.id = 'cnmi-v682-single-physician-contact-style';
  css.textContent = `
    .v682-single-contact{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;text-align:left;font:inherit;font-weight:850;cursor:pointer;max-width:100%;vertical-align:middle;touch-action:manipulation}
    .v682-single-contact .v682-doctor-name{white-space:normal;overflow-wrap:anywhere}
    .v682-single-contact .v682-phone-hint{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;border-radius:50%;border:1px solid currentColor;font-size:12px;line-height:1}
    .v682-single-contact:hover{filter:brightness(.96)}
    .v682-single-contact:focus-visible{outline:2px solid #1672ad;outline-offset:2px}
    @media(max-width:760px){.v682-single-contact{min-height:42px;padding:8px 11px;font-size:13px}}
    .v562-physician-busy.v682-single-contact{display:inline-grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:7px;row-gap:2px;align-items:center;justify-items:start;white-space:normal}
    .v562-physician-busy.v682-single-contact>b{grid-column:1;grid-row:1}
    .v562-physician-busy.v682-single-contact>small{grid-column:1;grid-row:2}
    .v562-physician-busy.v682-single-contact>.v682-phone-hint{grid-column:2;grid-row:1 / 3;align-self:center}
  `;
  document.head.appendChild(css);
  window.cnmiPhysicianSingleContactV682 = {version:VERSION,selectedDate,assignedSlots,resolveSlot,visibleLabel,matchesPhysician,normalizeRow,decorate,schedule};
  schedule();
})();
