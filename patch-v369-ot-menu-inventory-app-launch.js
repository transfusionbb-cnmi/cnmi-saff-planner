/* CNMI Staff Planner V369
   - Reorganizes OT / HR Export into role-specific, single-purpose menu buttons.
   - Adds one authoritative month selector at the top and removes repeated month selectors inside subtabs.
   - Adds an admin staff-detail tab that always starts with no staff selected.
   - Opens Inventory by direct same-window navigation so the operating system can hand the URL to an installed app when supported.
*/
(function(){
  'use strict';
  const VERSION = 'V369_OT_MENU_INVENTORY_APP_LAUNCH';
  if (window.__CNMI_V369_OT_MENU_INVENTORY_APP_LAUNCH__) return;
  window.__CNMI_V369_OT_MENU_INVENTORY_APP_LAUNCH__ = true;

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  let adminDetailToken = 0;
  let monthRenderTimer = 0;

  function S(){ try { return state; } catch (_) { return window.state || {}; } }
  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function admin(){ try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } }
  function currentMonth(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function selectedMonth(){
    const raw = S()?.otMenuMonthV369 || S()?.otSourceMonthV241 || S()?.otMoneyMonthV241 || S()?.myDutyMonthFilter || S()?.monthKey || currentMonth();
    return /^\d{4}-\d{2}$/.test(String(raw).slice(0,7)) ? String(raw).slice(0,7) : currentMonth();
  }
  function currentStaffIdSafe(){
    try { return String(currentStaffId() || ''); }
    catch (_) { return String(S()?.profile?.staff_id || S()?.profile?.id || ''); }
  }
  function activeStaff(){
    return (S()?.staff || [])
      .filter(person => person && person.is_active !== false && person.active !== false && !/แพทย์|physician/i.test(String(person.staff_type || person.role || '')))
      .slice()
      .sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th'));
  }
  function staffName(person){ return String(person?.nickname || person?.full_name || person?.name || person?.email || '-'); }
  function fmtDate(v){
    try { return formatThaiDate(normalizeDateKey(v)); }
    catch (_) { return String(v || '').slice(0,10) || '-'; }
  }
  function fmtTime(row){
    const start = String(row?.start_time || '').slice(0,5) || '-';
    const end = String(row?.end_time || '').slice(0,5) || '-';
    const work = String(row?.work_date || '').slice(0,10);
    const endDate = String(row?.end_date || '').slice(0,10);
    return `${start}–${end}${endDate && endDate !== work ? ` (${fmtDate(endDate)})` : ''}`;
  }
  function detailRowsFallback(rows){
    if (!rows.length) return '<div class="empty">ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้</div>';
    const breakdown = row => {
      try {
        const value = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
        if (value) return value;
      } catch (_) {}
      let actual = 0;
      try { actual = Number(calcOtHours(row) || 0); }
      catch (_) { actual = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0); }
      return { actualHours:actual, hrHours:actual };
    };
    const hours = v => {
      const n = Math.round(Number(v || 0) * 100) / 100;
      return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
    };
    return `<div class="table-wrap"><table><thead><tr><th>วันที่ OT</th><th>เวลา</th><th>เหตุผล / รายละเอียด</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th></tr></thead><tbody>${rows.map(row => {
      const n = breakdown(row);
      const exported = ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(String(row?.claim_status || '').toLowerCase());
      return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${esc(fmtTime(row))}</td><td><b>${esc(row.reason || '-')}</b>${row.note ? `<br><span class="muted">${esc(row.note)}</span>` : ''}</td><td>${hours(n.actualHours)}</td><td><b>${hours(n.hrHours)}</b></td><td><span class="badge ${exported ? 'green' : 'orange'}">${exported ? 'Exported' : 'Pending'}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  const ADMIN_ITEMS = [
    ['admin-duty', '1. ยืนยันวันอยู่เวรแทนเจ้าหน้าที่'],
    ['admin-extra', '2. ขอ OT เพิ่ม / เวรปั่นเลือดแทนเจ้าหน้าที่'],
    ['tracking', '3. ติดตามเจ้าหน้าที่'],
    ['approve', '4. อนุมัติ OT'],
    ['summary', '5. สรุป OT รายเดือน'],
    ['admin-details', '6. รายละเอียด OT ของเจ้าหน้าที่'],
    ['export', '7. Export HR'],
    ['history', '8. ประวัติ Export']
  ];
  const STAFF_ITEMS = [
    ['staff-track', '1. ติดตามเวรของฉัน'],
    ['staff-confirm', '2. ยืนยันวันอยู่เวรของฉัน / เลือกวันที่'],
    ['staff-extra', '3. ขอ OT เพิ่ม / เวรปั่นเลือด'],
    ['staff-list', '4. รายการ OT ของฉัน'],
    ['staff-details', '5. รายละเอียด OT ที่นำมาคำนวณเบิกของฉัน'],
    ['staff-summary', '6. สรุป OT รายเดือนของฉัน']
  ];

  function validItem(id, isAdmin){ return (isAdmin ? ADMIN_ITEMS : STAFF_ITEMS).some(item => item[0] === id); }
  function initialItem(isAdmin){
    const saved = String(S()?.otMenuV369 || '');
    if (validItem(saved, isAdmin)) return saved;
    const legacy = String(S()?.otSubtabV241 || 'mine');
    if (isAdmin) return ({tracking:'tracking', approve:'approve', summary:'summary', export:'export', history:'history'})[legacy] || 'admin-duty';
    return legacy === 'summary' ? 'staff-summary' : 'staff-track';
  }
  function legacyItem(id, isAdmin){
    if (isAdmin) {
      if (id === 'tracking' || id === 'approve' || id === 'summary' || id === 'export' || id === 'history') return id;
      if (id === 'admin-details') return 'summary';
      return 'mine';
    }
    return id === 'staff-summary' ? 'summary' : 'mine';
  }
  function setMonthState(month){
    const value = /^\d{4}-\d{2}$/.test(String(month || '').slice(0,7)) ? String(month).slice(0,7) : currentMonth();
    const st = S();
    st.otMenuMonthV369 = value;
    st.otMoneyMonthV241 = value;
    st.otSourceMonthV241 = value;
    st.otMoneyMonthV238 = value;
    st.hrExportMonthV238 = value;
    st.hrExportMonthV234 = value;
    st.myDutyMonthFilter = value;
    st.otAdminMonthFilterV234 = value;
    st.ch4MonthFilterV234 = value;
    st.hrHistoryYearV318 = value.slice(0,4);
    st.hrHistoryMonthNumberV318 = value.slice(5,7);
  }

  function template(html){
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    return tpl;
  }
  function outer(el){ return el ? el.outerHTML : ''; }
  function contentInner(html){
    const tpl = template(html);
    const content = tpl.content.querySelector('.v241-ot-content');
    return content ? content.innerHTML : String(html || '');
  }
  function cardByHeading(tpl, text){
    return Array.from(tpl.content.querySelectorAll('.card')).find(card => {
      const heading = card.querySelector('h2,h3,h4');
      return heading && String(heading.textContent || '').includes(text);
    }) || null;
  }
  function extractMineSections(html, isAdmin){
    const tpl = template(html);
    const extraCards = Array.from(tpl.content.querySelectorAll('.card')).filter(card => String(card.textContent || '').includes('ส่วนที่ 2 ขอ OT เพิ่ม'));
    return {
      tracking: outer(tpl.content.querySelector('#v234AdminFollowCard')),
      adminDuty: outer(cardByHeading(tpl, 'ส่วนที่ 1 ยืนยันวันอยู่เวรแทนเจ้าหน้าที่')),
      adminExtra: outer(isAdmin ? extraCards.find(card => String(card.textContent || '').includes('เลือกชื่อเจ้าหน้าที่')) : null),
      staffToday: outer(tpl.content.querySelector('.my-duty-today-card')) || outer(cardByHeading(tpl, 'เวรของฉันตามวันที่เลือก')) || outer(cardByHeading(tpl, 'ส่วนที่ 1 เวรของฉัน')),
      staffExtra: outer(!isAdmin ? extraCards[0] : null),
      staffMonth: outer(tpl.content.querySelector('.v219-my-month-card, .my-duty-month-section')) || outer(cardByHeading(tpl, 'เวรของฉันเดือนนี้')),
      staffList: outer(cardByHeading(tpl, 'รายการ OT ของฉัน')),
      staffDetails: outer(tpl.content.querySelector('.v347-my-claim-card')),
      ch4: outer(tpl.content.querySelector('.v234-ch4-shared-card')),
      repair: outer(tpl.content.querySelector('.v219-ot-repair-panel')),
      approval: outer(cardByHeading(tpl, 'ส่วนที่ 3 อนุมัติ OT'))
    };
  }
  function stripRepeatedMonthControls(html){
    const tpl = template(html);
    const ids = ['otMoneyMonthV241','otSourceMonthV241','myDutyMonthFilter','otAdminMonthFilterV234','ch4MonthFilterV234','hrHistoryYearV318','hrHistoryMonthNumberV318'];
    ids.forEach(id => {
      Array.from(tpl.content.querySelectorAll(`#${id}`)).forEach(control => {
        const holder = control.closest('.v241-month-filter,.my-duty-month-filter,label');
        if (holder) holder.remove(); else control.remove();
      });
    });
    Array.from(tpl.content.querySelectorAll('.toolbar.compact-filter')).forEach(toolbar => {
      if (!toolbar.querySelector('input,select,button')) toolbar.remove();
    });
    const holder = document.createElement('div');
    holder.appendChild(tpl.content.cloneNode(true));
    return holder.innerHTML;
  }
  function renameFirstHeading(html, title){
    const tpl = template(html);
    const heading = tpl.content.querySelector('h2,h3,h4');
    if (heading) heading.textContent = title;
    const holder = document.createElement('div');
    holder.appendChild(tpl.content.cloneNode(true));
    return holder.innerHTML;
  }
  function cleanHistory(html){
    const tpl = template(stripRepeatedMonthControls(html));
    Array.from(tpl.content.querySelectorAll('.hint,.empty')).forEach(el => {
      const text = String(el.textContent || '');
      if (text.includes('เลือกชื่อเจ้าหน้าที่ ปี และเดือนครบ')) el.textContent = 'เลือกชื่อเจ้าหน้าที่ก่อน ระบบจะใช้เดือนที่เลือกด้านบน';
      if (text.includes('เลือกชื่อเจ้าหน้าที่ ปี และเดือนก่อน')) el.textContent = 'กรุณาเลือกชื่อเจ้าหน้าที่ก่อน ระบบจึงจะโหลดประวัติ Export ของเดือนที่เลือกด้านบน';
    });
    const holder = document.createElement('div');
    holder.appendChild(tpl.content.cloneNode(true));
    return holder.innerHTML;
  }
  function emptyCard(text){ return `<div class="card wide-card" style="grid-column:1/-1"><div class="empty">${esc(text)}</div></div>`; }

  function menuHtml(active, isAdmin){
    const items = isAdmin ? ADMIN_ITEMS : STAFF_ITEMS;
    return `<div class="v369-menu-grid ${isAdmin ? 'is-admin' : 'is-staff'}" role="tablist" aria-label="เมนู OT">${items.map(([id,label]) => `<button type="button" role="tab" aria-selected="${active === id ? 'true' : 'false'}" class="v369-menu-btn ${active === id ? 'active' : ''}" data-v369-ot-menu="${esc(id)}">${esc(label)}</button>`).join('')}</div>`;
  }
  function topCard(active, isAdmin){
    const month = selectedMonth();
    return `<div class="card v369-ot-menu-card"><div class="v369-ot-menu-head"><div><h3>OT / HR Export</h3><p class="hint">เลือกเดือนหนึ่งครั้ง แล้วเลือกหัวข้อที่ต้องการทำงาน</p></div><label class="v369-month-label">เดือนที่ต้องการดู <input id="otMoneyMonthV241" type="month" value="${esc(month)}" aria-label="เลือกเดือน OT"></label></div>${menuHtml(active,isAdmin)}</div>`;
  }

  function adminDetailContent(){
    const month = selectedMonth();
    const selected = String(S()?.otDetailStaffV369 || '');
    const options = activeStaff().map(person => `<option value="${esc(person.id)}" ${String(person.id) === selected ? 'selected' : ''}>${esc(staffName(person))}</option>`).join('');
    const body = !selected
      ? '<div class="empty v369-detail-empty">กรุณาเลือกชื่อเจ้าหน้าที่ก่อนทุกครั้ง เพื่อดูรายละเอียด OT ของเดือนที่เลือกด้านบน</div>'
      : `<div class="v369-admin-detail-body" data-v369-detail-staff="${esc(selected)}" data-v369-detail-month="${esc(month)}"><div class="v369-detail-summary"><div class="notice soft-notice compact">กำลังตรวจสอบยอดทบและยอดเบิก HR…</div></div><div class="v369-detail-rows"><div class="empty">กำลังโหลดรายละเอียด OT…</div></div></div>`;
    return `<div class="card wide-card v369-admin-detail-card" style="grid-column:1/-1"><div class="section-title"><div><h3>รายละเอียด OT ของเจ้าหน้าที่</h3><p class="hint">แสดงเฉพาะรายการที่อนุมัติแล้วในเดือน ${esc(month)} และต้องเลือกชื่อใหม่เมื่อเข้าหัวข้อนี้</p></div></div><label class="v369-staff-picker">เลือกชื่อเจ้าหน้าที่ <select id="v369AdminDetailStaff"><option value="">กรุณาเลือกชื่อ</option>${options}</select></label>${body}</div>`;
  }

  async function hydrateAdminDetail(){
    const root = document.querySelector('.v369-admin-detail-body');
    if (!root) return;
    const sid = String(root.dataset.v369DetailStaff || '');
    const month = String(root.dataset.v369DetailMonth || selectedMonth()).slice(0,7);
    if (!sid) return;
    const token = ++adminDetailToken;
    const renderRows = () => {
      if (token !== adminDetailToken || !document.body.contains(root)) return [];
      const rows = window.cnmiV347?.approvedDetails?.(sid, month) || [];
      const rowsSlot = root.querySelector('.v369-detail-rows');
      if (rowsSlot) rowsSlot.innerHTML = window.cnmiV348?.detailRows ? window.cnmiV348.detailRows(rows) : detailRowsFallback(rows);
      return rows;
    };
    let rows = renderRows();
    try {
      const map = await window.cnmiV318?.queryCarryInSummary?.(month);
      if (token !== adminDetailToken || !document.body.contains(root)) return;
      const carry = map instanceof Map ? (map.get(sid) || {amount:0,sourceMonth:''}) : {amount:0,sourceMonth:''};
      const slot = root.querySelector('.v369-detail-summary');
      if (slot && window.cnmiV347?.summaryHtml) slot.innerHTML = window.cnmiV347.summaryHtml(sid, rows, carry);
    } catch (_) {
      const slot = root.querySelector('.v369-detail-summary');
      if (slot) slot.innerHTML = '<div class="notice error-notice compact">ยังอ่านยอดทบจากรอบก่อนไม่สำเร็จ กรุณาลองใหม่</div>';
    }
    try {
      await Promise.all([
        window.cnmiV348?.ensureTrades?.(month, sid),
        window.cnmiV348?.ensureHelpers?.(month)
      ]);
      if (token !== adminDetailToken || !document.body.contains(root)) return;
      rows = renderRows();
      const map = await window.cnmiV318?.queryCarryInSummary?.(month);
      const carry = map instanceof Map ? (map.get(sid) || {amount:0,sourceMonth:''}) : {amount:0,sourceMonth:''};
      const slot = root.querySelector('.v369-detail-summary');
      if (slot && window.cnmiV347?.summaryHtml) slot.innerHTML = window.cnmiV347.summaryHtml(sid, rows, carry);
    } catch (_) {}
  }

  function renderOtPageV369(){
    const isAdmin = admin();
    const active = initialItem(isAdmin);
    S().otMenuV369 = active;
    setMonthState(selectedMonth());
    S().otSubtabV241 = legacyItem(active, isAdmin);
    if (S().otSubtabV241 === 'history') {
      S().hrHistoryYearV318 = selectedMonth().slice(0,4);
      S().hrHistoryMonthNumberV318 = selectedMonth().slice(5,7);
    }

    const base = previousRenderOtPage ? String(previousRenderOtPage.apply(this, arguments) || '') : '';
    let content = '';

    if (isAdmin) {
      if (active === 'admin-duty' || active === 'admin-extra') {
        const sections = extractMineSections(base, true);
        if (active === 'admin-duty') content = `${renameFirstHeading(sections.adminDuty, 'ยืนยันวันอยู่เวรแทนเจ้าหน้าที่')}${sections.ch4 || ''}`;
        else content = renameFirstHeading(sections.adminExtra, 'ขอ OT เพิ่ม / เวรปั่นเลือดแทนเจ้าหน้าที่');
      } else if (active === 'tracking') {
        const sections = extractMineSections(base, true);
        content = sections.tracking || contentInner(base);
      } else if (active === 'approve') {
        const sections = extractMineSections(base, true);
        content = `${sections.repair || ''}${renameFirstHeading(sections.approval, 'อนุมัติ OT')}`;
      } else if (active === 'summary') {
        content = contentInner(base);
      } else if (active === 'admin-details') {
        content = adminDetailContent();
        setTimeout(hydrateAdminDetail, 0);
      } else if (active === 'export') {
        content = contentInner(base);
      } else if (active === 'history') {
        content = cleanHistory(contentInner(base));
      }
    } else {
      if (active === 'staff-summary') {
        content = renameFirstHeading(contentInner(base), 'สรุป OT รายเดือนของฉัน');
      } else {
        const sections = extractMineSections(base, false);
        if (active === 'staff-track') content = renameFirstHeading(sections.staffMonth, 'ติดตามเวรของฉัน');
        if (active === 'staff-confirm') content = `${renameFirstHeading(sections.staffToday, 'ยืนยันวันอยู่เวรของฉัน')}${sections.ch4 || ''}`;
        if (active === 'staff-extra') content = renameFirstHeading(sections.staffExtra, 'ขอ OT เพิ่ม / เวรปั่นเลือด');
        if (active === 'staff-list') content = sections.staffList;
        if (active === 'staff-details') content = sections.staffDetails;
      }
    }

    content = stripRepeatedMonthControls(content);
    if (!String(content || '').trim()) content = emptyCard('ไม่พบข้อมูลของหัวข้อนี้ กรุณารีเฟรชหนึ่งครั้ง');
    return `<div class="v369-ot-page">${topCard(active,isAdmin)}<div class="grid grid-2 ot-page v369-ot-content">${content}</div></div>`;
  }

  if (previousRenderOtPage) {
    try { window.renderOtPage = renderOtPage = renderOtPageV369; }
    catch (_) { window.renderOtPage = renderOtPageV369; }
  }

  document.addEventListener('click', function(e){
    const menu = e.target?.closest?.('[data-v369-ot-menu]');
    if (menu) {
      e.preventDefault();
      const id = String(menu.getAttribute('data-v369-ot-menu') || '');
      const isAdmin = admin();
      if (!validItem(id, isAdmin)) return;
      S().otMenuV369 = id;
      S().otSubtabV241 = legacyItem(id, isAdmin);
      if (id === 'admin-details') S().otDetailStaffV369 = '';
      try { renderPage(); } catch (_) {}
      return;
    }

    const inventory = e.target?.closest?.('.inventory-app-link');
    if (inventory) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const url = inventory.getAttribute('href') || 'https://inventory.cnmiblood.com/';
      inventory.setAttribute('aria-busy','true');
      const small = inventory.querySelector('small');
      if (small) small.textContent = 'กำลังเปิดแอพ Inventory…';
      window.location.assign(url);
    }
  }, true);

  document.addEventListener('change', async function(e){
    if (e.target?.id === 'otMoneyMonthV241') {
      const value = String(e.target.value || currentMonth()).slice(0,7);
      setMonthState(value);
      S().otDetailStaffV369 = '';
      clearTimeout(monthRenderTimer);
      monthRenderTimer = setTimeout(() => { try { renderPage(); } catch (_) {} }, 60);
      if (S().otMenuV369 === 'history' && S().hrHistoryStaffV318) {
        try { await window.cnmiV318?.loadHistory?.(true); } catch (_) {}
      }
      return;
    }
    if (e.target?.id === 'v369AdminDetailStaff') {
      S().otDetailStaffV369 = String(e.target.value || '');
      try { renderPage(); } catch (_) {}
    }
  }, true);

  function prepareInventoryLink(){
    const link = document.querySelector('.inventory-app-link');
    if (!link) return;
    link.removeAttribute('target');
    link.setAttribute('rel','external noopener');
    link.setAttribute('data-open-installed-app','inventory');
    const small = link.querySelector('small');
    if (small) small.textContent = 'เปิดแอพที่ติดตั้งไว้';
  }
  prepareInventoryLink();
  document.addEventListener('DOMContentLoaded', prepareInventoryLink, { once:true });

  const style = document.createElement('style');
  style.textContent = `
    .v369-ot-page{display:grid;gap:14px}.v369-ot-menu-card{display:grid;gap:14px}.v369-ot-menu-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}.v369-ot-menu-head h3{margin:0}.v369-month-label{display:grid;gap:6px;font-weight:800;color:#314b62;min-width:210px}.v369-month-label input{width:100%}
    .v369-menu-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.v369-menu-grid.is-staff{grid-template-columns:repeat(3,minmax(0,1fr))}.v369-menu-btn{min-height:56px;border:1px solid #d6e4f0;border-radius:14px;background:#fff;color:#29455d;padding:11px 12px;font:inherit;font-weight:850;line-height:1.28;text-align:left;cursor:pointer;white-space:normal}.v369-menu-btn:hover{border-color:#82c9f3;background:#f7fcff}.v369-menu-btn.active{background:#72c2f1;border-color:#72c2f1;color:#17384f;box-shadow:0 6px 16px rgba(72,154,204,.18)}
    .v369-ot-content{align-items:start}.v369-ot-content>.card,.v369-ot-content>.v219-ot-repair-panel{grid-column:1/-1}.v369-staff-picker{display:grid;gap:7px;max-width:520px;font-weight:800;margin:8px 0 14px}.v369-detail-empty{margin-top:8px}.v369-admin-detail-body{display:grid;gap:14px}.v369-admin-detail-card .v348-mobile-detail{margin-top:4px}
    .inventory-app-link[aria-busy="true"]{opacity:.78;pointer-events:none}
    @media(max-width:1120px){.v369-menu-grid,.v369-menu-grid.is-staff{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:680px){.v369-ot-menu-head{align-items:stretch}.v369-month-label{min-width:0;width:100%}.v369-menu-grid,.v369-menu-grid.is-staff{grid-template-columns:1fr}.v369-menu-btn{min-height:52px;text-align:center}.v369-ot-content{display:block}.v369-ot-content>*+*{margin-top:12px}}
  `;
  document.head.appendChild(style);

  window.cnmiV369 = { version:VERSION, setMonthState, hydrateAdminDetail };
  console.info(`[${VERSION}] loaded`);
})();
