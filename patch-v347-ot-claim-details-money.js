/* =========================
   V349 OT Claim Details + Mixed-rate Claimed Money
   - Staff sees claim details for the signed-in staff account only.
   - Admin can open one person's OT details from the monthly summary.
   - Money is calculated from "เบิก HR รอบนี้" after carry-in, not raw monthly OT.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V349_OT_CLAIM_DETAILS_MIXED_RATE_MONEY';
  if (window.__CNMI_V349_OT_CLAIM_DETAILS_MIXED_RATE_MONEY__) return;
  window.__CNMI_V349_OT_CLAIM_DETAILS_MIXED_RATE_MONEY__ = true;

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  let detailHydrationToken = 0;
  let moneyRefreshQueued = false;

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function round2(v){
    const n = Number(v || 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  function hours(v, digits=2){
    const n = round2(v);
    if (Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');
  }
  function money(v){
    const n = round2(v);
    return `${n.toLocaleString('th-TH', { minimumFractionDigits:Number.isInteger(n) ? 0 : 2, maximumFractionDigits:2 })} บ.`;
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function fmtDate(v){
    const d = normDate(v);
    if (!d) return '-';
    try { return formatThaiDate(d); }
    catch (_) { return d; }
  }
  function isAdminSafe(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }
  function currentSid(){
    try { return String(currentStaffId() || ''); }
    catch (_) { return String(state?.profile?.staff_id || state?.profile?.id || ''); }
  }
  function staffRec(staffId){
    return (state?.staff || []).find(s => String(s?.id || '') === String(staffId || '')) || null;
  }
  function staffName(staffId){
    const s = staffRec(staffId) || {};
    try { return staffNick(staffId); }
    catch (_) { return s.nickname || s.full_name || s.name || staffId || '-'; }
  }
  function staffPillSafe(staffId){
    try { return staffPill(staffId); }
    catch (_) { return `<span class="staff-pill">${esc(staffName(staffId))}</span>`; }
  }
  function isTang(staffId){
    const s = staffRec(staffId) || {};
    return /(^|\s)แตง($|\s)/.test(`${s.nickname || ''} ${s.full_name || ''}`.trim()) || String(s.nickname || '').trim() === 'แตง';
  }
  function staffRateType(staffId){
    const s = staffRec(staffId) || {};
    const type = String(s.staff_type || s.type || '').trim();
    return type === 'เคิก' || isTang(staffId) ? 'เคิก' : 'MT';
  }
  function staffRate(staffId){ return staffRateType(staffId) === 'เคิก' ? 90 : 130; }
  function selectedMonth(forStaff=false){
    const raw = forStaff
      ? (state?.myDutyMonthFilter || state?.otMoneyMonthV241 || state?.otSourceMonthV241 || state?.monthKey)
      : (state?.otMoneyMonthV241 || state?.otSourceMonthV241 || state?.otMoneyMonthV238 || state?.monthKey);
    if (raw) return String(raw).slice(0, 7);
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function isApproved(row){
    const s = String(row?.status || '').trim().toLowerCase();
    return s === 'อนุมัติ' || s === 'อนุมัติแล้ว' || s === 'approved';
  }
  function claimStatus(row){
    const s = String(row?.claim_status || '').trim().toLowerCase();
    return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s) ? 'Exported' : 'Pending';
  }
  function statusBadge(row){
    const st = claimStatus(row);
    return `<span class="badge ${st === 'Exported' ? 'green' : 'orange'}">${st}</span>`;
  }
  function breakdown(row){
    try {
      const n = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if (n && Number.isFinite(Number(n.hrHours))) return n;
    } catch (_) {}
    let actual = 0;
    try { actual = Number(calcOtHours(row) || 0); }
    catch (_) { actual = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0); }
    return { actualHours:round2(actual), hrHours:round2(actual), isHoliday:false, shiftType:row?.duty_code || '-' };
  }
  function approvedDetails(staffId, month){
    const requested = String(staffId || '');
    const allowed = isAdminSafe() ? requested : currentSid();
    if (!allowed) return [];
    return (state?.otRequests || [])
      .filter(row => String(row?.staff_id || '') === allowed && normDate(row?.work_date).startsWith(String(month || '').slice(0, 7)) && isApproved(row))
      .sort((a,b) => normDate(a?.work_date).localeCompare(normDate(b?.work_date)) || String(a?.created_at || '').localeCompare(String(b?.created_at || '')));
  }
  function timeRange(row){
    const start = String(row?.start_time || '').slice(0, 5);
    const end = String(row?.end_time || '').slice(0, 5);
    const endDate = normDate(row?.end_date);
    const date = normDate(row?.work_date);
    if (!start && !end) return '-';
    const next = endDate && date && endDate !== date ? ` (${fmtDate(endDate)})` : '';
    return `${start || '-'}–${end || '-'}${next}`;
  }
  function rowTable(rows, showName=false){
    if (!rows.length) return '<div class="empty">ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้</div>';
    return `<div class="table-wrap v347-detail-table"><table><thead><tr>${showName ? '<th>ชื่อ</th>' : ''}<th>วันที่ OT</th><th>เวลา</th><th>เหตุผล / รายละเอียด</th><th>ชั่วโมงจริง</th><th>OT เดือนนี้เทียบ HR</th><th>สถานะ Export</th></tr></thead><tbody>${rows.map(row => {
      const n = breakdown(row);
      const note = String(row?.note || '').trim();
      return `<tr>${showName ? `<td>${staffPillSafe(row.staff_id)}</td>` : ''}<td>${esc(fmtDate(row.work_date))}</td><td>${esc(timeRange(row))}</td><td><b>${esc(row.reason || '-')}</b>${note ? `<br><span class="muted">${esc(note)}</span>` : ''}</td><td>${hours(n.actualHours, 1)}</td><td><b>${hours(n.hrHours, 2)}</b>${n.isHoliday ? '<br><span class="badge blue">นักขัตฤกษ์</span>' : ''}</td><td>${statusBadge(row)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function sumCurrentHr(rows){ return round2(rows.reduce((sum,row) => sum + Number(breakdown(row).hrHours || 0), 0)); }
  function rateSegmentsForRow(row){
    const n = breakdown(row);
    const trade = n?.tradeInfo;
    if (trade) {
      const rate = Number(trade.receiverNormalRate || (trade.receiverType === 'เคิก' ? 90 : 130));
      return [{ hours:round2(n.hrHours), rate, type:trade.receiverType || (rate === 90 ? 'เคิก' : 'MT'), duty:String(trade.assignment?.duty_code || row?.duty_code || '') }];
    }
    const source = Array.isArray(n?.segments) && n.segments.length ? n.segments : [n];
    const out = source.map(seg => {
      const type = String(seg?.rateType || n?.rateType || staffRateType(row?.staff_id)) === 'เคิก' ? 'เคิก' : 'MT';
      const rate = Number(seg?.normalRate || (type === 'เคิก' ? 90 : 130));
      return { hours:round2(seg?.hrHours == null ? n?.hrHours : seg.hrHours), rate, type, duty:String(seg?.shiftType || n?.shiftType || row?.duty_code || '') };
    }).filter(seg => seg.hours > 0 && seg.rate > 0);
    const sourceTotal = round2(out.reduce((sum,seg) => sum + seg.hours, 0));
    const targetTotal = round2(n?.hrHours || 0);
    if (out.length && Math.abs(sourceTotal - targetTotal) > 0.01) out[out.length - 1].hours = round2(Math.max(0, out[out.length - 1].hours + targetTotal - sourceTotal));
    return out;
  }
  function claimedMoneyBreakdown(staffId, rows, carryIn, claimedHours){
    const claimed = round2(Math.max(0, claimedHours || 0));
    const segments = [];
    const carry = round2(Math.max(0, carryIn || 0));
    if (carry > 0) segments.push({ hours:carry, rate:staffRate(staffId), type:staffRateType(staffId), duty:'ยอดทบจากรอบก่อน', carry:true });
    (rows || []).slice().sort((a,b) => normDate(a?.work_date).localeCompare(normDate(b?.work_date)) || String(a?.created_at || '').localeCompare(String(b?.created_at || ''))).forEach(row => {
      rateSegmentsForRow(row).forEach(seg => segments.push(seg));
    });
    let remaining = claimed;
    const buckets = new Map();
    segments.forEach(seg => {
      if (remaining <= 0) return;
      const used = round2(Math.min(Math.max(0, seg.hours || 0), remaining));
      if (used <= 0) return;
      remaining = round2(Math.max(0, remaining - used));
      const tangCh4 = isTang(staffId) && seg.type === 'MT' && /ช4/.test(seg.duty || '');
      const label = tangCh4 ? 'MT (เฉพาะ ช4)' : seg.type;
      const key = `${label}|${seg.rate}`;
      const current = buckets.get(key) || { label, rate:seg.rate, hours:0, amount:0 };
      current.hours = round2(current.hours + used);
      current.amount = round2(current.amount + used * seg.rate);
      buckets.set(key, current);
    });
    if (remaining > 0) {
      const rate = staffRate(staffId), label = staffRateType(staffId), key = `${label}|${rate}`;
      const current = buckets.get(key) || { label, rate, hours:0, amount:0 };
      current.hours = round2(current.hours + remaining);
      current.amount = round2(current.amount + remaining * rate);
      buckets.set(key, current);
      remaining = 0;
    }
    const items = Array.from(buckets.values());
    const amount = round2(items.reduce((sum,item) => sum + item.amount, 0));
    const formula = items.length ? items.map(item => `${item.label} ${hours(item.rate, 0)} บ./ชม. × ${hours(item.hours, 2)} ชม.`).join(' + ') : '-';
    return { amount, items, formula, claimed };
  }
  function summaryHtml(staffId, rows, carryInfo){
    const current = sumCurrentHr(rows);
    const carryIn = round2(carryInfo?.amount || 0);
    const available = round2(current + carryIn);
    const claimed = Math.floor((available + 1e-7) / 8) * 8;
    const carryOut = round2(Math.max(0, available - claimed));
    const pay = claimedMoneyBreakdown(staffId, rows, carryIn, claimed);
    return `<div class="v347-claim-equation">
      <div><span>OT เดือนนี้เทียบ HR</span><b>${hours(current, 2)} ชม.</b></div>
      <div><span>OT ทบมาจากรอบก่อน</span><b>${hours(carryIn, 2)} ชม.</b></div>
      <div><span>รวมพร้อมเบิก HR</span><b>${hours(available, 2)} ชม.</b></div>
      <div class="claimed"><span>เบิก HR รอบนี้</span><b>${hours(claimed, 2)} ชม.</b></div>
      <div><span>OT ทบไปรอบหน้า</span><b>${hours(carryOut, 2)} ชม.</b></div>
      <div class="money"><span>คำนวณเป็นเงินจากยอดเบิก</span><b>${money(pay.amount)}</b><small>${esc(pay.formula)}</small></div>
    </div>`;
  }
  async function carryFor(staffId, month){
    try {
      const api = window.cnmiV318;
      if (!api || typeof api.queryCarryInSummary !== 'function') return { amount:0, sourceMonth:'' };
      const map = await api.queryCarryInSummary(month);
      return map instanceof Map ? (map.get(String(staffId)) || { amount:0, sourceMonth:'' }) : { amount:0, sourceMonth:'' };
    } catch (err) {
      console.warn(`${VERSION}: carry-in unavailable`, err);
      return { amount:0, sourceMonth:'', unavailable:true };
    }
  }
  function staffDetailCard(){
    const sid = currentSid();
    const month = selectedMonth(true);
    const rows = approvedDetails(sid, month);
    return `<div class="card wide-card v347-my-claim-card" style="grid-column:1/-1;" data-v347-staff="${esc(sid)}" data-v347-month="${esc(month)}">
      <div class="section-title"><div><h3>รายละเอียด OT ที่นำมาคำนวณเบิกของฉัน</h3><p class="hint">แสดงเฉพาะข้อมูลของบัญชีที่กำลังล็อกอิน • เดือน ${esc(month)} • รายการที่อนุมัติแล้ว</p></div></div>
      <div class="v347-summary-slot"><div class="notice soft-notice compact">กำลังตรวจสอบยอดทบและยอดเบิก HR รอบนี้…</div></div>
      ${rowTable(rows)}
    </div>`;
  }
  async function hydrateOwnCard(){
    const token = ++detailHydrationToken;
    await new Promise(resolve => setTimeout(resolve, 0));
    const card = document.querySelector('.v347-my-claim-card');
    if (!card || token !== detailHydrationToken) return;
    const sid = currentSid();
    if (!sid || String(card.dataset.v347Staff || '') !== sid) { card.remove(); return; }
    const month = String(card.dataset.v347Month || selectedMonth(true)).slice(0, 7);
    const rows = approvedDetails(sid, month);
    const carry = await carryFor(sid, month);
    if (token !== detailHydrationToken || !document.body.contains(card)) return;
    const slot = card.querySelector('.v347-summary-slot');
    if (slot) slot.innerHTML = `${summaryHtml(sid, rows, carry)}${carry.unavailable ? '<div class="notice error-notice compact">ยังอ่านยอดทบจากรอบก่อนไม่สำเร็จ กรุณารีเฟรชอีกครั้ง</div>' : ''}`;
  }
  async function showAdminDetail(staffId){
    if (!isAdminSafe()) return;
    const sid = String(staffId || '');
    const month = selectedMonth(false);
    const rows = approvedDetails(sid, month);
    const carry = await carryFor(sid, month);
    const html = `<div class="v347-admin-detail"><div class="section-title"><div><h2>รายละเอียด OT ของ ${esc(staffName(sid))}</h2><p class="hint">เดือน ${esc(month)} • แสดงรายการที่อนุมัติแล้วของบุคคลนี้เท่านั้น</p></div></div>${summaryHtml(sid, rows, carry)}${rowTable(rows, false)}${carry.unavailable ? '<div class="notice error-notice compact">ยังอ่านยอดทบจากรอบก่อนไม่สำเร็จ กรุณาปิดแล้วเปิดรายละเอียดอีกครั้ง</div>' : ''}</div>`;
    try { showModal(html); }
    catch (_) {
      const body = document.getElementById('modalBody');
      const modal = document.getElementById('modal');
      if (body) body.innerHTML = html;
      if (modal) modal.classList.remove('hidden');
    }
  }
  function readCellNumber(cell){
    const m = String(cell?.textContent || '').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  }
  function updateClaimedMoney(){
    document.querySelectorAll('.v241-real-month-section .v241-ot-summary-table table[data-v346-prepared="1"], .v241-hr-export-section .v241-ot-summary-table table[data-v346-prepared="1"]').forEach(table => {
      const headers = Array.from(table.querySelectorAll('thead th'));
      const moneyIndex = headers.findIndex(th => String(th.textContent || '').includes('คำนวณเป็นเงิน'));
      const claimedIndex = headers.findIndex(th => String(th.textContent || '').includes('เบิก HR รอบนี้'));
      if (moneyIndex < 0 || claimedIndex < 0) return;
      let total = 0;
      Array.from(table.querySelectorAll('tbody tr')).forEach(row => {
        const staffButton = row.querySelector('[data-v347-show-staff],[data-v234-show-staff]');
        const sid = staffButton?.getAttribute('data-v347-show-staff') || staffButton?.getAttribute('data-v234-show-staff') || '';
        const claimed = readCellNumber(row.children[claimedIndex]);
        const carryIn = readCellNumber(row.querySelector('.v346-carry-in'));
        const month = selectedMonth(false);
        let detailRows = approvedDetails(sid, month);
        if (table.closest('.v241-hr-export-section')) detailRows = detailRows.filter(r => claimStatus(r) === 'Pending');
        const pay = claimedMoneyBreakdown(sid, detailRows, carryIn, claimed);
        const amount = pay.amount;
        total = round2(total + amount);
        const cell = row.children[moneyIndex];
        const signature = `${amount}|${claimed}|${pay.formula}`;
        if (cell && cell.dataset.v347ClaimedMoney !== signature) {
          cell.innerHTML = `<b>${money(amount)}</b><br><span class="muted">${esc(pay.formula)}</span>`;
          cell.title = `คิดจากเบิก HR รอบนี้ ${hours(claimed, 2)} ชั่วโมง: ${pay.formula}`;
          cell.dataset.v347ClaimedMoney = signature;
        }
      });
      if (table.closest('.v241-real-month-section')) {
        const card = table.closest('.v241-real-month-section')?.querySelector('.v241-money-cards .mini-stat.overdue');
        if (card) {
          const label = card.querySelector('span');
          const value = card.querySelector('b');
          if (label && label.textContent !== 'ยอดเงินเบิก HR รอบนี้') label.textContent = 'ยอดเงินเบิก HR รอบนี้';
          if (value && value.textContent !== money(total)) value.textContent = money(total);
        }
      }
    });
  }
  function queueMoneyRefresh(){
    if (moneyRefreshQueued) return;
    moneyRefreshQueued = true;
    requestAnimationFrame(() => {
      moneyRefreshQueued = false;
      updateClaimedMoney();
    });
  }

  if (previousRenderOtPage) {
    const wrapped = function renderOtPageV347(){
      let html = String(previousRenderOtPage.apply(this, arguments) || '');
      const active = state?.otSubtabV241 || 'mine';
      if (active === 'mine' && !isAdminSafe()) {
        setTimeout(hydrateOwnCard, 0);
        const card = staffDetailCard();
        return /<\/div>\s*<\/div>\s*$/.test(html)
          ? html.replace(/<\/div>\s*<\/div>\s*$/, `${card}</div></div>`)
          : html.replace(/<\/div>\s*$/, `${card}</div>`);
      }
      if (active === 'summary' || active === 'export') {
        html = html.replace(/data-v234-show-staff=/g, 'data-v347-show-staff=');
        [0, 80, 250, 700].forEach(ms => setTimeout(queueMoneyRefresh, ms));
      }
      return html;
    };
    try { window.renderOtPage = renderOtPage = wrapped; }
    catch (_) { window.renderOtPage = wrapped; }
  }

  document.addEventListener('click', function(e){
    const link = e.target?.closest?.('.v241-real-month-section [data-v347-show-staff]');
    if (!link || !isAdminSafe()) return;
    e.preventDefault();
    const sid = link.getAttribute('data-v347-show-staff') || '';
    if (sid) setTimeout(() => showAdminDetail(sid), 0);
  }, true);
  document.addEventListener('change', function(e){
    if (e.target?.id === 'myDutyMonthFilter') setTimeout(hydrateOwnCard, 0);
    if (['otMoneyMonthV241','otSourceMonthV241'].includes(e.target?.id)) [40, 180, 600].forEach(ms => setTimeout(queueMoneyRefresh, ms));
  }, true);

  const pageContent = document.getElementById('pageContent');
  if (pageContent && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.target?.closest?.('.v241-ot-summary-table') || Array.from(m.addedNodes || []).some(n => n.nodeType === 1 && (n.matches?.('.v241-ot-summary-table, .v346-claimed') || n.querySelector?.('.v241-ot-summary-table, .v346-claimed'))))) queueMoneyRefresh();
    });
    observer.observe(pageContent, { childList:true, subtree:true, characterData:true });
  }

  const style = document.createElement('style');
  style.textContent = '.v347-claim-equation{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px;margin:12px 0 16px}.v347-claim-equation>div{display:flex;flex-direction:column;gap:4px;padding:12px;border:1px solid #dbe7f3;border-radius:12px;background:#f8fbff}.v347-claim-equation span{color:#5f7184;font-size:12px}.v347-claim-equation b{font-size:18px}.v347-claim-equation .claimed{background:#effbf4;border-color:#ccebd8}.v347-claim-equation .money{background:#fff7ec;border-color:#f2dfc2}.v347-claim-equation small{color:#7a5a2b}.v347-detail-table th,.v347-detail-table td{vertical-align:top}.v347-admin-detail{min-width:min(100%,980px)}@media(max-width:760px){.v347-claim-equation{grid-template-columns:1fr 1fr}.v347-claim-equation .money{grid-column:1/-1}}';
  document.head.appendChild(style);

  window.cnmiV347 = { version:VERSION, approvedDetails, summaryHtml, updateClaimedMoney, showAdminDetail, claimedMoneyBreakdown, rateSegmentsForRow };
  console.info(`[${VERSION}] loaded`);
})();
