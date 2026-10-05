/* CNMI Staff Planner V600 — Stable post-V593 physician on-call fix
 * Base: V593 (known stable login/startup)
 * Scope:
 *   - Do NOT touch auth, startup, service worker, quota numbers, OT, HR, or database.
 *   - Physician normal leave affects regular daytime Consult only.
 *   - Physician on-call 16:00–08:00 and weekend/public-holiday 24h remain active.
 *   - Real overlapping physician activities still make on-call unavailable.
 */
(() => {
  'use strict';
  const VERSION = 'V600_STABLE_POST593_ONCALL';
  if (window.__CNMI_V600_STABLE_POST593_ONCALL__) return;
  window.__CNMI_V600_STABLE_POST593_ONCALL__ = true;

  const text = (v) => String(v ?? '').trim();
  const esc = (v) => {
    try { return typeof escapeHtml === 'function' ? escapeHtml(text(v)) : text(v); }
    catch (_) { return text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const stateSafe = () => {
    try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; }
    catch (_) { return window.state || {}; }
  };
  const normDate = (v) => {
    const s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };
  const selectedDate = () => {
    try {
      return normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(stateSafe()?.dashboardDateV443)
        || normDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    }
  };
  const staffById = (id) => (stateSafe()?.staff || []).find(p => String(p?.id || '') === String(id || '')) || null;
  const nick = (id) => {
    const p = staffById(id);
    return text(p?.nickname || p?.full_name || p?.email || 'แพทย์');
  };

  function modelFor(date) {
    try { return window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { return null; }
  }
  function isOnCallTime(time) {
    const t = text(time);
    return /16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน|ทั้งวัน|นอกเวลา|กลางคืน/i.test(t);
  }
  function activities(id, date, time) {
    try { return window.cnmiPhysicianActivityV512?.physicianActivities?.(id, date, time) || []; }
    catch (_) { return []; }
  }
  function activityLabel(a) {
    const type = text(a?.event_type) || 'กิจกรรม';
    const s = text(a?.start_time).slice(0, 5);
    const e = text(a?.end_time).slice(0, 5);
    const period = s && e ? `${s}–${e}` : (s ? `ตั้งแต่ ${s}` : 'ทั้งวัน');
    return type === 'อื่นๆ' ? `ติดกิจกรรม ${period}` : `${type} ${period}`;
  }
  function doctorHtml(id, site, time, mobile) {
    if (!id) return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn${mobile ? ' v456-mobile-doctor-button' : ''}" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" aria-label="ดูเบอร์โทร ${esc(nick(id))}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(nick(id))}</button>`;
  }
  function activityHtml(id, a) {
    return `<span class="v512-consult-activity" data-v512-physician-activity="1" title="${esc(text(a?.title) || 'แพทย์มีกิจกรรมทับช่วง Consult')}">${esc(nick(id))} · ${esc(activityLabel(a))}</span>`;
  }
  function rowTime(row) {
    if (!row) return '';
    const mobile = row.querySelector?.('.v456-mobile-consult-time');
    if (mobile) return text(mobile.textContent);
    const first = row.querySelector?.('td');
    return text(first?.textContent);
  }
  function replacementNode(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '').trim();
    return tpl.content.firstElementChild || null;
  }

  function onCallAssignment(date) {
    const m = modelFor(date);
    if (!m) return null;
    if (m.weekday) return { id: m.combined || null, site: 'Donor & BB', time: '16:00–08:00' };
    return { id: m.combined || null, site: 'Donor & BB', time: '24 ชม.' };
  }

  function restoreOnCall(root, date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    const oncall = onCallAssignment(date);
    if (!card || !oncall) return;

    const acts = oncall.id ? activities(oncall.id, date, oncall.time) : [];
    card.querySelectorAll('tr,.v456-mobile-consult-row').forEach(row => {
      if (!isOnCallTime(rowTime(row))) return;
      row.querySelectorAll('.v510-consult-leave').forEach(badge => {
        const mobile = !!row.classList?.contains('v456-mobile-consult-row');
        const html = acts.length ? activityHtml(oncall.id, acts[0]) : doctorHtml(oncall.id, oncall.site, oncall.time, mobile);
        const node = replacementNode(html);
        if (node) badge.replaceWith(node);
      });
    });
  }

  function consultAssignments(date) {
    const m = modelFor(date);
    if (!m) return [];
    if (m.weekday) return [
      { id: m.donor || null, time: '08:00–16:00', oncall: false },
      { id: m.bb || null, time: '08:00–16:00', oncall: false },
      { id: m.combined || null, time: '16:00–08:00', oncall: true }
    ];
    return [{ id: m.combined || null, time: '24 ชม.', oncall: true }];
  }

  function recomputeReady(root, date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return;
    const list = consultAssignments(date);
    if (!list.length) return;

    let hasLeave = false;
    let hasActivity = false;
    let ready = 0;
    list.forEach(a => {
      if (!a.id) return;
      const acts = activities(a.id, date, a.time);
      if (acts.length) { hasActivity = true; return; }
      if (!a.oncall) {
        let leave = null;
        try { leave = window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(a.id, date, a.time) || null; }
        catch (_) { leave = null; }
        if (leave) { hasLeave = true; return; }
      }
      ready += 1;
    });

    const badge = card.querySelector('.v452-ready');
    if (badge) {
      badge.textContent = `พร้อม ${ready}/${list.length}`;
      badge.classList.toggle('is-complete', ready === list.length);
      badge.classList.toggle('v510-has-leave', hasLeave);
      badge.classList.toggle('v512-has-activity', hasActivity);
    }
  }

  // Consumers added after V510/V512 use this shared API. Make the rule explicit there too.
  try {
    const api = window.cnmiPhysicianDashboardV510;
    if (api?.leaveStatusForTime && !api.__v600OnCallWrapped) {
      const original = api.leaveStatusForTime.bind(api);
      api.leaveStatusForTime = function(id, date, time) {
        if (isOnCallTime(time)) return null;
        return original(id, date, time);
      };
      api.__v600OnCallWrapped = true;
    }
  } catch (err) {
    console.warn(`[${VERSION}] leave API patch skipped`, err);
  }

  function decorate(html) {
    if (typeof html !== 'string' || !html) return html;
    try {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      const date = selectedDate();
      restoreOnCall(tpl.content, date);
      recomputeReady(tpl.content, date);
      const holder = document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] dashboard decorate skipped`, err);
      return html;
    }
  }

  const previousDashboard = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof previousDashboard === 'function' && !previousDashboard.__v600OnCallWrapped) {
    const wrapped = function renderDashboardV600() {
      return decorate(previousDashboard.apply(this, arguments));
    };
    wrapped.__v600OnCallWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }

  window.cnmiV600 = { version: VERSION, isOnCallTime, onCallAssignment, decorate };
  console.info(`[${VERSION}] loaded — V593 startup/auth preserved`);
})();
