/* CNMI Staff Planner V601 — Physician on-call contact restore
 * Base: V600 stable rebuild from V593
 * Scope only:
 *   - Normal physician leave affects daytime Consult only.
 *   - On-call (16:00–08:00 / 24h weekend-holiday) ignores normal leave.
 *   - The assigned on-call physician is restored as a tappable/clickable contact button.
 *   - Real overlapping blocking activities still make that Consult slot unavailable.
 * No auth/startup/PWA/quota/OT/HR/database changes.
 */
(() => {
  'use strict';
  const VERSION = 'V601_PHYSICIAN_ONCALL_CONTACT_RESTORE';
  if (window.__CNMI_V601_PHYSICIAN_ONCALL_CONTACT_RESTORE__) return;
  window.__CNMI_V601_PHYSICIAN_ONCALL_CONTACT_RESTORE__ = true;

  const txt = (v) => String(v ?? '').trim();
  const esc = (v) => txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S = () => { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } };
  const normDate = (v) => { const s = txt(v).slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  const selectedDate = () => {
    try {
      return normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(S()?.dashboardDateV443)
        || normDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) {
      const d = new Date(), p = n => String(n).padStart(2,'0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    }
  };
  const person = (id) => (S()?.staff || []).find(p => String(p?.id || '') === String(id || '')) || null;
  const shortName = (id) => { const p = person(id); return txt(p?.nickname || p?.full_name || p?.email || 'แพทย์'); };

  function modelFor(date) {
    try { return window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { return null; }
  }
  function onCallAssignment(date) {
    const m = modelFor(date);
    if (!m) return null;
    return m.weekday
      ? { id: m.combined || null, site: 'Donor & BB', time: '16:00–08:00' }
      : { id: m.combined || null, site: 'Donor & BB', time: '24 ชม.' };
  }
  function isOnCallTime(v) {
    const s = txt(v);
    return /16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน|ทั้งวัน|นอกเวลา|กลางคืน/i.test(s);
  }
  function blockingActivities(id,date,time) {
    try { return window.cnmiPhysicianActivityV512?.physicianActivities?.(id,date,time) || []; }
    catch (_) { return []; }
  }
  function buttonHtml(a, mobile=false) {
    if (!a?.id) return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn${mobile?' v456-mobile-doctor-button':''}" data-v601-oncall-contact="1" data-v601-doctor-id="${esc(a.id)}" data-v601-site="${esc(a.site)}" data-v601-time="${esc(a.time)}" aria-label="ดูเบอร์โทร ${esc(shortName(a.id))}" title="แตะเพื่อดูเบอร์โทรแพทย์ On-call">${esc(shortName(a.id))}</button>`;
  }
  function activityHtml(a, activity) {
    const label = (() => {
      try {
        const type = txt(activity?.event_type) || 'กิจกรรม';
        const st = txt(activity?.start_time).slice(0,5), en = txt(activity?.end_time).slice(0,5);
        const period = st && en ? `${st}–${en}` : (st ? `ตั้งแต่ ${st}` : 'ทั้งวัน');
        return type === 'อื่นๆ' ? `ติดกิจกรรม ${period}` : `${type} ${period}`;
      } catch (_) { return 'ติดกิจกรรม'; }
    })();
    return `<span class="v512-consult-activity" data-v512-physician-activity="1" title="แพทย์มีกิจกรรมทับช่วง On-call">${esc(shortName(a.id))} · ${esc(label)}</span>`;
  }

  function replaceDesktop(card,a,blocked) {
    const rows = [...card.querySelectorAll('.v452-dashboard-table tbody tr')];
    rows.forEach(row => {
      const cells = [...row.children];
      if (cells.length < 3) return;
      const time = txt(cells[0]?.textContent);
      if (!isOnCallTime(time)) return;
      // Authoritative rule: the on-call assignment is independent of normal daytime leave.
      cells[2].innerHTML = blocked ? activityHtml(a, blocked) : buttonHtml(a, false);
    });
  }
  function replaceMobile(card,a,blocked) {
    card.querySelectorAll('.v456-mobile-consult-row').forEach(row => {
      const time = txt(row.querySelector('.v456-mobile-consult-time')?.textContent);
      if (!isOnCallTime(time)) return;
      const holder = row.querySelector('.v456-mobile-consult-doctor');
      if (!holder) return;
      const label = holder.querySelector('.v456-mobile-doctor-label')?.cloneNode(true);
      holder.innerHTML = '';
      if (label) holder.appendChild(label);
      const tpl = document.createElement('template');
      tpl.innerHTML = blocked ? activityHtml(a, blocked) : buttonHtml(a, true);
      if (tpl.content.firstElementChild) holder.appendChild(tpl.content.firstElementChild);
    });
  }
  function restoreOnCallContact(root,date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    const a = onCallAssignment(date);
    if (!card || !a) return;
    const acts = a.id ? blockingActivities(a.id,date,a.time) : [];
    const blocked = acts[0] || null;
    replaceDesktop(card,a,blocked);
    replaceMobile(card,a,blocked);

    // Keep readiness aligned with the visible rule: leave never removes on-call readiness.
    try {
      const m = modelFor(date);
      const assignments = !m ? [] : (m.weekday
        ? [
            {id:m.donor,time:'08:00–16:00',oncall:false},
            {id:m.bb,time:'08:00–16:00',oncall:false},
            {id:m.combined,time:'16:00–08:00',oncall:true}
          ]
        : [{id:m.combined,time:'24 ชม.',oncall:true}]);
      let ready = 0, hasLeave = false, hasActivity = false;
      assignments.forEach(x => {
        if (!x.id) return;
        const actsX = blockingActivities(x.id,date,x.time);
        if (actsX.length) { hasActivity = true; return; }
        if (!x.oncall) {
          let leave = null;
          try { leave = window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(x.id,date,x.time) || null; } catch (_) {}
          if (leave) { hasLeave = true; return; }
        }
        ready += 1;
      });
      const badge = card.querySelector('.v452-ready');
      if (badge && assignments.length) {
        badge.textContent = `พร้อม ${ready}/${assignments.length}`;
        badge.classList.toggle('is-complete', ready === assignments.length);
        badge.classList.toggle('v510-has-leave', hasLeave);
        badge.classList.toggle('v512-has-activity', hasActivity);
      }
    } catch (_) {}
  }

  function decorate(html) {
    if (typeof html !== 'string' || !html || !html.includes('data-v452-physician-card')) return html;
    try {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      restoreOnCallContact(tpl.content, selectedDate());
      const holder = document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] decorate skipped`, err);
      return html;
    }
  }

  const previousDashboard = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof previousDashboard === 'function' && !previousDashboard.__v601Wrapped) {
    const wrapped = function renderDashboardV601() { return decorate(previousDashboard.apply(this, arguments)); };
    wrapped.__v601Wrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; } catch (_) { window.renderDashboard = wrapped; }
  }

  // Dedicated click path for the restored on-call button. It deliberately does not depend
  // on the old leave badge DOM and therefore remains tappable after the V510/V512 decorators.
  document.addEventListener('click', (e) => {
    const b = e.target?.closest?.('[data-v601-oncall-contact]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const id = b.getAttribute('data-v601-doctor-id') || '';
    const site = b.getAttribute('data-v601-site') || 'Donor & BB';
    const time = b.getAttribute('data-v601-time') || '';
    try {
      if (window.cnmiPhysicianPhoneV455?.openDoctor) {
        window.cnmiPhysicianPhoneV455.openDoctor(id,site,time);
        return;
      }
    } catch (_) {}
    const p = person(id), raw = txt(p?.phone || p?.contact_phone);
    if (!raw) {
      try { if (typeof toast === 'function') toast('ยังไม่มีเบอร์โทรแพทย์ในข้อมูลผู้ใช้งาน'); } catch (_) {}
      return;
    }
    const digits = raw.replace(/[^\d+]/g,'');
    const html = `<div style="text-align:center"><h3>${esc(shortName(id))}</h3><p>${esc(raw)}</p><a class="primary-btn" href="tel:${esc(digits)}">☎ โทรออก</a></div>`;
    try { if (typeof showModal === 'function') showModal(html,{small:true}); }
    catch (_) { window.location.href = `tel:${digits}`; }
  }, true);

  window.cnmiV601 = {version:VERSION,restoreOnCallContact,onCallAssignment,isOnCallTime};
  console.info(`[${VERSION}] loaded — on-call leave independence + contact restored`);
})();
