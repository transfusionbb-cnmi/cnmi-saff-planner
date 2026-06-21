/* CNMI Staff Planner V279
   Admin monthly roster: add "ดูคู่เวร" column and a four-section co-duty popup.
   This patch is read-only. It does not change roster assignments, balances, validators, or database data.
*/
(function(){
  'use strict';

  const VERSION = 'V279_DUTY_PAIR_SUMMARY';
  if (window.__CNMI_V279_DUTY_PAIR_SUMMARY__) return;
  window.__CNMI_V279_DUTY_PAIR_SUMMARY__ = true;

  function S(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[char]));
    }
  }
  function normId(value){ return String(value == null ? '' : value); }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0,10); }
  }
  function safeMonthKey(value){
    return /^\d{4}-\d{2}$/.test(String(value || ''))
      ? String(value)
      : new Date().toISOString().slice(0,7);
  }
  function explicitFalse(value){
    return value === false || ['false','0','no','off','ปิด'].includes(String(value ?? '').trim().toLowerCase());
  }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return String(S()?.profile?.role || '').trim().toLowerCase() === 'admin'; }
  }
  function staffName(personOrId){
    const person = typeof personOrId === 'object'
      ? personOrId
      : (S()?.staff || []).find(row => normId(row?.id) === normId(personOrId));
    return person ? (person.nickname || person.full_name || person.email || '-') : '-';
  }
  function isRosterEnabled(person){
    if (!person) return false;
    const active = Object.prototype.hasOwnProperty.call(person,'is_active') ? person.is_active : person.active;
    if (active == null || explicitFalse(active)) return false;
    if (String(person.staff_type || '').trim() === 'แพทย์') return false;
    if (person.maternity_status) return false;
    const value = person.roster_enabled
      ?? person.duty_enabled
      ?? person.can_roster
      ?? person.is_roster_enabled
      ?? person.schedule_enabled
      ?? person.is_schedule_enabled
      ?? person['สถานะจัดเวร'];
    return !explicitFalse(value);
  }
  function ordered(rows){
    try { return orderedStaff(rows); }
    catch (_) { return rows.slice().sort((a,b) => staffName(a).localeCompare(staffName(b),'th')); }
  }
  function rosterStaff(){ return ordered((S()?.staff || []).filter(isRosterEnabled)); }
  function groupLabel(person){ return String(person?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT'; }

  function currentMonthAssignments(monthKey){
    const key = safeMonthKey(monthKey);
    try {
      const rows = getAssignmentsForMonth(key);
      if (Array.isArray(rows)) return rows.filter(row => row?.staff_id && normDate(row?.duty_date).startsWith(key));
    } catch (_) {}

    const draft = S()?.rosterDraft;
    const source = draft?.monthKey === key && Array.isArray(draft.assignments)
      ? draft.assignments
      : (S()?.rosterAssignments || []);
    return source.filter(row => row?.staff_id && normDate(row?.duty_date).startsWith(key));
  }

  const PAIR_GROUPS = [
    {
      key:'chbd',
      title:'คู่เวร ชบด1-2-3',
      matches: code => ['ชบด1','ชบด2','ชบด3'].includes(String(code || '').trim())
    },
    {
      key:'ch3',
      title:'คู่เวร ช3A-ช3B',
      matches: code => ['ช3A','ช3B'].includes(String(code || '').trim())
    },
    {
      key:'ch4',
      title:'คู่เวร ช4',
      matches: code => String(code || '').trim().startsWith('ช4')
    },
    {
      key:'all',
      title:'คู่เวรภาพรวม',
      matches: code => !!String(code || '').trim()
    }
  ];

  function dateSetFor(rows, staffId, matcher){
    const result = new Set();
    (rows || []).forEach(row => {
      if (normId(row?.staff_id) !== normId(staffId)) return;
      if (!matcher(row?.duty_code)) return;
      const date = normDate(row?.duty_date);
      if (date) result.add(date);
    });
    return result;
  }
  function intersectCount(left,right){
    if (!left?.size || !right?.size) return 0;
    let small = left, large = right;
    if (left.size > right.size) { small = right; large = left; }
    let total = 0;
    small.forEach(value => { if (large.has(value)) total += 1; });
    return total;
  }

  function pairStats(staffId, monthKey, rows){
    const assignments = Array.isArray(rows) ? rows : currentMonthAssignments(monthKey);
    const people = rosterStaff().filter(person => normId(person.id) !== normId(staffId));
    const result = {};

    PAIR_GROUPS.forEach(group => {
      const ownDates = dateSetFor(assignments, staffId, group.matches);
      result[group.key] = people.map(person => ({
        person,
        days: intersectCount(ownDates, dateSetFor(assignments, person.id, group.matches))
      })).sort((a,b) => b.days - a.days || staffName(a.person).localeCompare(staffName(b.person),'th'));
    });
    return result;
  }

  function pairColumnHtml(group, rows){
    const list = rows || [];
    return `<section class="v279-pair-section">
      <div class="v279-pair-section-head">
        <h3>${esc(group.title)}</h3>
      </div>
      <div class="v279-pair-list">
        ${list.length ? list.map(item => `<div class="v279-pair-row">
          <span>${esc(staffName(item.person))}</span>
          <b class="${item.days > 0 ? 'has-days' : 'no-days'}">${item.days} วัน</b>
        </div>`).join('') : '<div class="v279-pair-empty">ไม่มีเจ้าหน้าที่ในกลุ่มนี้</div>'}
      </div>
    </section>`;
  }

  function showDutyPairPopup(staffId, monthKey){
    const person = (S()?.staff || []).find(row => normId(row?.id) === normId(staffId));
    if (!person) return;
    const key = safeMonthKey(monthKey || S()?.monthKey);
    const stats = pairStats(staffId,key);
    const body = `<div class="v279-pair-popup">
      <div class="v279-pair-title">
        <div>
          <h2>ดูคู่เวรของ ${esc(staffName(person))}</h2>
          <p>จำนวนวันที่อยู่เวรวันเดียวกันในเดือน ${esc(key)}</p>
        </div>
      </div>
      <div class="v279-pair-grid">
        ${PAIR_GROUPS.map(group => pairColumnHtml(group,stats[group.key])).join('')}
      </div>
    </div>`;

    try { showModal(body,{large:true}); }
    catch (_) {
      const modal = document.getElementById('modal');
      const modalBody = document.getElementById('modalBody');
      if (modal && modalBody) {
        modalBody.innerHTML = body;
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
      }
    }
  }

  function matchPersonFromRow(row, groupPeople, usedIds){
    const cellText = String(row?.cells?.[0]?.textContent || '').trim();
    const exact = groupPeople.find(person => !usedIds.has(normId(person.id)) && staffName(person) === cellText);
    if (exact) return exact;
    const contained = groupPeople.find(person => !usedIds.has(normId(person.id)) && cellText.includes(staffName(person)));
    if (contained) return contained;
    return groupPeople.find(person => !usedIds.has(normId(person.id))) || null;
  }

  function enhanceBalanceHtml(html, monthKey){
    if (!isAdminSafe() || S()?.page !== 'scheduler' || typeof html !== 'string' || !html.includes('v278-balance-table')) return html;

    const holder = document.createElement('div');
    holder.innerHTML = html;
    const sections = holder.querySelectorAll('.balance-group-section');
    const people = rosterStaff();
    const key = safeMonthKey(monthKey || S()?.monthKey);

    sections.forEach(section => {
      const table = section.querySelector('table.v278-balance-table');
      if (!table || table.dataset.v279PairReady === '1') return;
      const labelText = String(section.querySelector('.balance-group-title h3')?.textContent || '');
      const label = labelText.includes('เคิก') ? 'เคิก' : 'MT';
      const groupPeople = people.filter(person => groupLabel(person) === label);
      const headerRow = table.tHead?.rows?.[0];
      if (!headerRow) return;
      const headers = Array.from(headerRow.cells);
      const statusIndex = headers.findIndex(cell => String(cell.textContent || '').trim() === 'สถานะ');
      if (statusIndex < 0) return;

      const th = document.createElement('th');
      th.textContent = 'ดูคู่เวร';
      th.className = 'v279-pair-column';
      headerRow.insertBefore(th,headerRow.cells[statusIndex]);

      const usedIds = new Set();
      Array.from(table.tBodies?.[0]?.rows || []).forEach(row => {
        const person = matchPersonFromRow(row,groupPeople,usedIds);
        if (person) usedIds.add(normId(person.id));
        const td = document.createElement('td');
        td.className = 'v279-pair-column';
        td.innerHTML = person
          ? `<button type="button" class="tiny-btn soft v279-pair-button" data-v279-duty-pair="${esc(person.id)}" data-v279-month="${esc(key)}">ดูคู่เวร</button>`
          : '-';
        row.insertBefore(td,row.cells[statusIndex]);
      });
      table.dataset.v279PairReady = '1';
    });

    return holder.innerHTML;
  }

  const previousBalance = window.renderBalanceDashboard || (typeof renderBalanceDashboard === 'function' ? renderBalanceDashboard : null);
  if (previousBalance) {
    const enhanced = function renderBalanceDashboardV279(staffList,assignments,key){
      const html = previousBalance.apply(this,arguments);
      return enhanceBalanceHtml(html,key);
    };
    window.renderBalanceDashboard = enhanced;
    try { renderBalanceDashboard = enhanced; } catch (_) {}
  }

  document.addEventListener('click',event => {
    const button = event.target?.closest?.('[data-v279-duty-pair]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    showDutyPairPopup(button.dataset.v279DutyPair,button.dataset.v279Month);
  },true);

  const style = document.createElement('style');
  style.id = 'v279-duty-pair-style';
  style.textContent = `
    .v279-pair-column{min-width:82px;text-align:center!important}
    .v279-pair-button{white-space:nowrap;font-weight:800}
    .v279-pair-popup{display:grid;gap:14px;min-width:0}
    .v279-pair-title h2{margin:0 0 4px;font-size:22px}
    .v279-pair-title p{margin:0;color:#64748b}
    .v279-pair-grid{display:grid;grid-template-columns:repeat(4,minmax(190px,1fr));gap:12px;align-items:start}
    .v279-pair-section{border:1px solid #dbe4ef;border-radius:14px;background:#fff;overflow:hidden;min-width:0}
    .v279-pair-section-head{padding:11px 12px;background:#f7fafc;border-bottom:1px solid #e5eaf1}
    .v279-pair-section-head h3{margin:0;font-size:14px;color:#18324a}
    .v279-pair-list{max-height:430px;overflow:auto;overscroll-behavior:contain}
    .v279-pair-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border-bottom:1px solid #eef2f7;font-size:13px}
    .v279-pair-row:last-child{border-bottom:0}
    .v279-pair-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .v279-pair-row b{flex:0 0 auto;min-width:48px;text-align:center;border-radius:999px;padding:3px 7px}
    .v279-pair-row b.has-days{background:#dff5e9;color:#137047}
    .v279-pair-row b.no-days{background:#f1f5f9;color:#64748b}
    .v279-pair-empty{padding:18px 12px;color:#64748b;text-align:center}
    @media(max-width:960px){.v279-pair-grid{grid-template-columns:repeat(2,minmax(180px,1fr))}}
    @media(max-width:560px){.v279-pair-grid{grid-template-columns:1fr}.v279-pair-list{max-height:260px}}
  `;
  document.head.appendChild(style);

  window.cnmiV279 = {
    pairStats,
    showDutyPairPopup,
    enhanceBalanceHtml
  };

  console.info(`${VERSION} loaded`);
})();
