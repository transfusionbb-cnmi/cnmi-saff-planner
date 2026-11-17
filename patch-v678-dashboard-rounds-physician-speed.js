/* CNMI Staff Planner v678 — Dashboard round details + daytime physician contact.
 * Display-only. No activity writes, roster formulas, or database migration.
 * Must run AFTER the other dashboard decorators (v675 etc).
 * No MutationObservers or repeating timers.
 */
(() => {
  'use strict';
  if (window.__CNMI_V678_DASHBOARD_DETAILS__) return;
  window.__CNMI_V678_DASHBOARD_DETAILS__ = true;
  const str = value => String(value == null ? '' : value);
  const esc = value => str(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateNow = () => {try {return window.state || (typeof state !== 'undefined' ? state : {}) || {};} catch (_) {return window.state || {};}};
  const normDate = value => /^\d{4}-\d{2}-\d{2}$/.test(str(value).slice(0,10)) ? str(value).slice(0,10) : '';
  function dashboardDate() {
    try {
      return normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(new URLSearchParams(str(location.hash).split('?')[1] || '').get('date'))
        || normDate(stateNow().dashboardDateV443)
        || normDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) {return normDate(stateNow().dashboardDateV443);}
  }
  function nameFor(id) {
    const row = (stateNow().staff || []).find(p => str(p?.id) === str(id));
    return str(row?.nickname || row?.full_name || row?.email || id);
  }
  // The V671 parser is authoritative; no attempt is made to manufacture rounds
  // from free-text notes or a combined participant list.
  function roundsFor(row) {
    if (!row || !str(row.note).includes('[[CNMI-ACTIVITY-ROUNDS-V654:')) return null;
    try {
      const rounds = window.cnmiActivitySessionsV654?.parse?.(row);
      return Array.isArray(rounds) ? rounds : null;
    } catch (_) {return null;}
  }
  function roundSummary(rounds) {
    if (!rounds?.length) return '';
    const uniquePeople = new Set(rounds.flatMap(r => r.staff_ids || []).map(str));
    return `<section class="v678-activity-rounds" aria-label="รายชื่อผู้เข้าอบรมแยกตามรอบ">
      <div class="v678-round-head">แบ่ง ${rounds.length} รอบ · ผู้เข้าร่วม ${uniquePeople.size} คน</div>
      ${rounds.map((r,i) => {
        const people = (r.staff_ids || []).map(nameFor);
        return `<div class="v678-round-row"><div class="v678-round-when"><strong>รอบที่ ${i+1}</strong><span>${esc(r.date||'')} · ${esc(r.start||'-')}–${esc(r.end||'-')} น.</span></div><div class="v678-round-people">${people.length?people.map(n=>`<span class="v678-person">${esc(n)}</span>`).join(''):'<span>ไม่ได้ระบุผู้เข้าร่วม</span>'}</div></div>`;
      }).join('')}
    </section>`;
  }
  function decorateRounds(root,selector,idAttribute,byId) {
    let changed = 0;
    root.querySelectorAll(selector).forEach(card => {
      const id = card.getAttribute(idAttribute);
      const row = byId.get(str(id));
      const rounds = roundsFor(row);
      if (!rounds?.length) {
        // Older records may contain manually typed 'รอบที่ 1 / รอบที่ 2'
        // without structured metadata. Show the complete note, but DO NOT
        // invent session allocations or alter manpower calculations.
        if (/รอบที่\s*\d+/i.test(str(row?.note)) && !str(row?.note).includes('[[CNMI-ACTIVITY-ROUNDS-V654:')) {
          const note = card.querySelector('.v518-note-wrap .v518-note-clamp');
          if (note) {
            note.classList.remove('v518-note-clamp');
            note.classList.add('v678-expanded-legacy-note');
            card.querySelector('.v518-note-more')?.remove();
            changed++;
          }
        }
        return;
      }
      const existing = card.querySelector('.v675-round-summary,.v678-activity-rounds');
      if (existing) existing.remove();
      const doc = document.createElement('template');
      doc.innerHTML = roundSummary(rounds);
      const fragment = doc.content;
      const anchor = card.querySelector('.v518-activity-meta,.actions');
      if (anchor) anchor.before(fragment); else card.append(fragment);
      // A union of participants is not their assigned attendance time.
      const aggregate = card.querySelector('.v397-detail-line');
      if (aggregate && /ผู้เข้าร่วม/.test(str(aggregate.textContent))) {
        aggregate.textContent = 'ผู้เข้าร่วม: แสดงรายชื่อแยกตามรอบด้านล่าง';
        aggregate.classList.add('v678-union-caption');
      }
      changed++;
    });
    return changed;
  }
  function slotsFor(date) {
    try {
      const m = window.cnmiPhysicianConsultV452?.baseForDate?.(date);
      if (!m) return [];
      if (!m.weekday) return [{id:m.combined,site:'Donor & BB',time:'24 ชม.'}];
      return [
        {id:m.donor,site:'Donor',time:'08:00–16:00'},
        {id:m.bb,site:'Blood Bank',time:'08:00–16:00'},
        {id:m.combined,site:'Donor & BB',time:'16:00–08:00'}
      ];
    } catch (_) {return [];}
  }
  function siteForRow(row, mobile) {
    const source = mobile ? row.querySelector('.v456-mobile-consult-site') : row.querySelector('td:nth-child(2)');
    return str(source?.textContent).toLowerCase().trim();
  }
  function timeForRow(row, mobile) {
    return str((mobile ? row.querySelector('.v456-mobile-consult-time') : row.querySelector('td:first-child'))?.textContent);
  }
  function resolveSlot(row,slots,mobile,index,length) {
    if (slots.length === 1) return slots[0];
    const site = siteForRow(row,mobile),time=timeForRow(row,mobile);
    if (/donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)/i.test(site) || /16:?00\s*[–-]\s*08:?00|24\s*ชม/.test(time)) return slots.find(s=>s.site==='Donor & BB');
    if (/blood\s*bank|คลังเลือด/.test(site)) return slots.find(s=>s.site==='Blood Bank');
    if (/\bdonor\b|ห้องบริจาค/.test(site)) return slots.find(s=>s.site==='Donor');
    return length === slots.length ? slots[index] : null;
  }
  function makeCallable(root,date) {
    const card = root.querySelector('[data-v452-physician-card]');
    if (!card) return 0;
    const slots = slotsFor(date);
    if (!slots.length) return 0;
    let count = 0;
    for (const [selector,mobile] of [['.v452-dashboard-table tbody tr',false],['.v456-mobile-consult-row',true]]) {
      const rows = [...card.querySelectorAll(selector)];
      rows.forEach((row,i) => {
        const slot = resolveSlot(row,slots,mobile,i,rows.length);
        if (!slot?.id) return;
        const holder = mobile ? row.querySelector('.v456-mobile-consult-doctor') : row.querySelector('td:nth-child(3)');
        if (!holder || holder.querySelector('[data-v455-doctor-id],[data-v601-oncall-contact]')) return;
        const old = holder.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill');
        if (!old || old.matches('button,a') || /ยังไม่กำหนด/.test(str(old.textContent))) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${old.className} v455-doctor-contact-btn v678-doctor-call${mobile?' v456-mobile-doctor-button':''}`;
        button.setAttribute('data-v455-doctor-id',str(slot.id));
        button.setAttribute('data-v455-site',slot.site);
        button.setAttribute('data-v455-time',slot.time);
        button.setAttribute('aria-label',`${str(old.textContent).trim()} ดูเบอร์โทรและโทรหาแพทย์`);
        button.title = 'แตะเพื่อดูเบอร์โทรแพทย์';
        const label = document.createElement('span');label.textContent = str(old.textContent).trim();
        const hint = document.createElement('span');hint.className='v678-call-hint';hint.textContent='☎ โทร';hint.setAttribute('aria-hidden','true');
        button.append(label,hint);
        old.replaceWith(button);count++;
      });
    }
    return count;
  }
  const prev = window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null);
  if (typeof prev === 'function') {
    const wrapped = function renderDashboardV678() {
      const html = prev.apply(this,arguments);
      if (typeof html !== 'string') return html;
      if (!html.includes('v518-dashboard-activity') && !html.includes('data-v452-physician-card')) return html;
      try {
        const s = stateNow();
        const rows = s.activities || [];
        const hasRounds = Array.isArray(rows) && rows.some(a=>roundsFor(a)?.length || /รอบที่\s*\d+/i.test(str(a?.note)));
        const tpl = document.createElement('template');tpl.innerHTML = html;
        let updated = 0;
        if (hasRounds) {
          const m = new Map([...(s.activityListRowsV398 || []),...rows].filter(r=>r?.id!=null).map(r=>[str(r.id),r]));
          updated += decorateRounds(tpl.content,'.v518-dashboard-activity','data-v518-activity-id',m);
        }
        updated += makeCallable(tpl.content,dashboardDate());
        return updated ? tpl.innerHTML : html;
      } catch (err) { console.warn('[v678] Dashboard decoration skipped',err);return html; }
    };
    try {window.renderDashboard = renderDashboard = wrapped;} catch (_) {window.renderDashboard = wrapped;}
  }
  const activityPrev = window.renderActivitiesPage || (typeof renderActivitiesPage === 'function' ? renderActivitiesPage : null);
  if (typeof activityPrev === 'function') {
    const wrapped = function renderActivitiesPageV678() {
      const html = activityPrev.apply(this,arguments);
      if (typeof html !== 'string' || !html.includes('activity-row-card')) return html;
      const rows = [...(stateNow().activityListRowsV398||[]),...(stateNow().activities||[])];
      if (!rows.some(r=>roundsFor(r)?.length)) return html;
      try {
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const m=new Map(rows.filter(r=>r?.id!=null).map(r=>[str(r.id),r]));
        return decorateRounds(tpl.content,'.activity-row-card','data-v487-activity-id',m)?tpl.innerHTML:html;
      } catch (err) {console.warn('[v678] Activity rounds decoration skipped',err);return html;}
    };
    try {window.renderActivitiesPage = renderActivitiesPage = wrapped;} catch (_) {window.renderActivitiesPage = wrapped;}
  }
  const css = document.createElement('style');css.id='v678-dashboard-details-css';
  css.textContent = `
    .v678-activity-rounds{margin:10px 0 8px;padding:9px 11px;border:1px solid #b9dcec;border-radius:11px;background:#f5fbff;color:#25465d;font-size:12px}
    .v678-round-head{font-weight:800;margin-bottom:7px;color:#156897}
    .v678-round-row{display:grid;grid-template-columns:minmax(130px,215px) minmax(0,1fr);gap:8px;padding:8px 0;border-top:1px solid #dcecf5}
    .v678-round-when{display:grid;align-content:start;gap:2px}.v678-round-when span{font-size:11px;color:#59788e}
    .v678-round-people{display:flex;flex-wrap:wrap;gap:5px;align-items:start}.v678-person{border:1px solid #c8e3ef;border-radius:8px;background:#fff;padding:3px 7px;font-weight:650;overflow-wrap:anywhere}
    .v678-union-caption{color:#58788f!important;font-size:12px!important}
    .v678-expanded-legacy-note{white-space:pre-wrap!important;display:block!important;overflow:visible!important;-webkit-line-clamp:unset!important}
    .v678-doctor-call{appearance:none!important;cursor:pointer!important;display:inline-flex!important;gap:6px;align-items:center;flex-wrap:wrap;font-family:inherit;text-align:left;max-width:100%;min-height:34px}
    .v678-call-hint{font-weight:800;border-radius:999px;border:1px solid currentColor;padding:2px 6px;white-space:nowrap;font-size:10px}
    .v678-doctor-call:focus-visible{outline:2px solid #1672ad;outline-offset:2px}
    /* Avoid giant empty statistic cards stretched to the manpower card's height. */
    .v401-dashboard-stats{align-items:start!important}
    @media(max-width:620px){.v678-round-row{grid-template-columns:1fr;gap:5px}.v678-activity-rounds{padding:8px}}
  `;
  document.head.appendChild(css);
  window.cnmiV678 = {roundsFor, roundSummary, makeCallable, dashboardDate};
  console.info('[CNMI v678] dashboard rounds, physician calls and compact stats loaded');
})();
