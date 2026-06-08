/* CNMI Duty Hub v101 patch-only
   Scope: trade wording/rate modes, GPS off, dashboard fiscal-year summary,
   leave fiscal-year list, schedule month-color view, and monthly-position matrix fix.
   No SQL. Does not touch roster auto-assign or position auto-assign logic.
*/
(function(){
  'use strict';
  const PATCH = 'v101-trade-gps-dashboard-fiscal-calendar-position';

  function safe(fn, fallback){ try { return fn(); } catch(err){ console.warn('[CNMI]', PATCH, err); return fallback; } }
  function S(){ return safe(() => state, null); }
  function esc(v){ return safe(() => escapeHtml(v), String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))); }
  function dparse(s){ return safe(() => parseDate(String(s).slice(0,10)), new Date(String(s).slice(0,10) + 'T00:00:00')); }
  function dinput(d){ return safe(() => toDateInput(d), `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function monthRange(key){ return safe(() => getMonthRange(key), (() => { const [y,m] = String(key).split('-').map(Number); return { y, m, start:`${y}-${pad2(m)}-01`, end:dinput(new Date(y, m, 0)) }; })()); }
  function thaiDate(s){ return safe(() => formatThaiDate(s), String(s || '-')); }
  function currentStaff(){ return safe(() => currentStaffId(), null); }
  function admin(){ return !!safe(() => isAdmin(), false); }
  function render(){ return safe(() => renderPage(), null); }
  function toast(msg){ return safe(() => showToast(msg), alert(msg)); }
  function close(){ return safe(() => closeModal(), null); }
  function staff(id){ return (S()?.staff || []).find(x => String(x.id) === String(id)); }
  function nick(id){ return safe(() => staffNick(id), staff(id)?.nickname || staff(id)?.full_name || '-'); }
  function pill(id, opts){ return safe(() => staffPill(id, opts), `<span>${esc(nick(id))}</span>`); }
  function sColor(idOrStaff){ return safe(() => staffColor(idOrStaff), '#e8f3ff'); }
  function tColor(bg){ return safe(() => textColorFor(bg), '#203245'); }
  function ordered(list){ return safe(() => orderedStaff(list), [...(list || [])]); }
  function badgeX(text, cls){ return safe(() => badge(text, cls), `<span class="badge ${cls || ''}">${esc(text)}</span>`); }
  function emptyX(text){ return safe(() => empty(text), `<div class="empty-state">${esc(text)}</div>`); }
  function arr(v){ return safe(() => asArray(v), Array.isArray(v) ? v : []); }
  function isWeekendX(date){ return !!safe(() => isWeekend(date), [0,6].includes(dparse(date).getDay())); }
  function isHolidayX(date){ return !!safe(() => isHolidayDate(date), false); }
  function holidayNameX(date){ return safe(() => holidayName(date), 'วันหยุดราชการ'); }
  function dutyLabel(code){ return safe(() => DUTY_LABEL[code] || code, code); }
  function allowedCodes(date){ return safe(() => allowedDutyCodesForDate(date), safe(() => DUTY_COLUMNS, [])); }
  function dutyCols(){ return safe(() => DUTY_COLUMNS, []); }
  function overlaps(row, date){ return safe(() => overlapsDate(row, date), row?.start_date <= date && row?.end_date >= date && row?.status !== 'cancelled'); }
  function activeRosterStaff(){ return ordered((S()?.staff || []).filter(st => safe(() => isRosterEnabled(st), st?.is_active))); }
  function activePositionStaff(rows){
    const all = (S()?.staff || []);
    return ordered(all.filter(st => safe(() => isDailyPositionEnabled(st), st?.is_active) || (rows || []).some(r => String(r.staff_id) === String(st.id))));
  }

  function fiscalInfo(dateLike){
    const d = dateLike ? dparse(dateLike) : new Date();
    const y = d.getFullYear();
    const fyCE = d.getMonth() >= 9 ? y + 1 : y; // Oct-Dec belongs to next fiscal year
    return { fyCE, fyBE: fyCE + 543, start:`${fyCE-1}-10-01`, end:`${fyCE}-09-30` };
  }
  function fiscalFromBE(be){
    const fyCE = Number(be) - 543;
    return { fyCE, fyBE:Number(be), start:`${fyCE-1}-10-01`, end:`${fyCE}-09-30` };
  }
  function rowOverlapsRange(row, start, end){
    const a = String(row?.start_date || '').slice(0,10);
    const b = String(row?.end_date || a).slice(0,10);
    return a <= end && b >= start;
  }
  function fiscalOptionsFromLeaves(){
    const set = new Set([fiscalInfo().fyBE, fiscalInfo().fyBE - 1, fiscalInfo().fyBE + 1]);
    (S()?.leaves || []).forEach(r => {
      if (r.start_date) set.add(fiscalInfo(r.start_date).fyBE);
      if (r.end_date) set.add(fiscalInfo(r.end_date).fyBE);
    });
    return [...set].sort((a,b) => b-a);
  }
  function currentLeaveFiscalBE(){
    const st = S();
    if (!st) return fiscalInfo().fyBE;
    if (!st.leaveFiscalYearBE) st.leaveFiscalYearBE = fiscalInfo().fyBE;
    return st.leaveFiscalYearBE;
  }

  // ---------- labels ----------
  function patchLabels(){
    safe(() => {
      const item = NAV_ITEMS.find(x => x.id === 'tradeRequests');
      if (item) {
        item.title = 'คำขอแลก/ขายเวร';
        item.subtitle = 'รอฉันยืนยัน / รอ Admin อนุมัติ';
      }
    }, null);
  }
  patchLabels();

  try {
    window.niceRoleRateLabel = niceRoleRateLabel = function(value){
      return ({
        mt: 'ขายเวรเบิกเรท MT',
        kerk: 'ขายเวรเบิกเรท เคิก',
        custom: 'ตกลงกันเอง / โอนกันเอง',
        receiver: 'ตามเรทคนรับเวร',
        owner: 'ตามเรทเจ้าของเวรเดิม'
      }[String(value || '')] || value || '-');
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'niceRoleRateLabel', err); }

  try {
    window.selfPaidTradeNotice = selfPaidTradeNotice = function(){
      return `<div class="notice soft-notice wide"><b>กรณีตกลงกันเอง / โอนกันเอง</b><br>ระบบจะไม่เปลี่ยนเจ้าของเวรในตารางหลัก และ OT/HR ยังเป็นชื่อเจ้าของเวรเดิมตามเรทเดิม แต่จะเก็บหลักฐานว่ามีคนมาทำแทนจริง</div>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'selfPaidTradeNotice', err); }

  try {
    const oldTableLabel = typeof tableLabel === 'function' ? tableLabel : null;
    if (oldTableLabel) {
      window.tableLabel = tableLabel = function(table){
        if (table === 'roster_trade_requests') return 'คำขอแลก/ขายเวร';
        return oldTableLabel.call(this, table);
      };
    }
  } catch(err) { console.warn('[CNMI]', PATCH, 'tableLabel', err); }

  // ---------- trade ----------
  try {
    window.renderTradeButton = renderTradeButton = function(slot){
      if (!safe(() => canRequestTrade(slot), false)) return '';
      return `<button class="tiny-btn trade-btn" data-trade-duty="${esc(slot.id)}">แลก/ขาย</button>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderTradeButton', err); }

  try {
    window.showTradeModal = showTradeModal = function(assignmentId){
      const slot = safe(() => getAssignmentsForMonth(state.monthKey).find(a => a.id === assignmentId), null);
      if (!slot) return toast('ไม่พบเวรนี้ กรุณารีเฟรชหน้า');
      const possibleReceiver = ordered((S()?.staff || []).filter(st => safe(() => isRosterEnabled(st), st?.is_active) && String(st.id) !== String(slot.staff_id)));
      const myAmount = safe(() => dutyMetrics(slot, slot.staff_id).pay, 0);
      const otherDutyOptions = safe(() => getAssignmentsForMonth(state.monthKey), [])
        .filter(a => a.staff_id && String(a.staff_id) !== String(slot.staff_id))
        .map(a => `<option data-owner="${esc(a.staff_id)}" value="${esc(a.id)}">${esc(nick(a.staff_id))} — ${thaiDate(a.duty_date)} ${esc(dutyLabel(a.duty_code))}</option>`)
        .join('');
      safe(() => showModal(`<h2>ขอแลก/ขายเวร</h2>
        <p class="hint">${thaiDate(slot.duty_date)} ${esc(dutyLabel(slot.duty_code))} • เจ้าของเวรเดิม ${pill(slot.staff_id)} • มูลค่าเวรเดิมประมาณ ${Number(myAmount || 0).toLocaleString()} บาท</p>
        <form id="dutyTradeForm" class="form-grid">
          <input type="hidden" name="from_assignment_id" value="${esc(slot.id)}">
          <label>ประเภท <select name="trade_type" id="tradeTypeSelect"><option value="ขายเวร">ขายเวร</option><option value="แลกเวร">แลกเวร</option></select></label>
          <label>คนที่จะรับ/คู่แลก <select name="receiver_id" id="tradeReceiverSelect" required><option value="">เลือกคน</option>${possibleReceiver.map(st => `<option value="${esc(st.id)}">${esc(st.nickname || st.full_name)} (${esc(st.staff_type || '-')})</option>`).join('')}</select></label>
          <label class="wide trade-swap-only" id="tradeSwapWrap" style="display:none">กรณีแลกเวรเท่านั้น: เลือกเวรของคู่แลก <select name="to_assignment_id" id="tradeSwapSelect"><option value="">เลือกเวรของคู่แลก</option>${otherDutyOptions}</select><span class="hint">ขายเวรไม่ต้องเลือกเวรคู่แลก ระบบใช้เวรที่กดมาให้อัตโนมัติ</span></label>
          <label id="tradeRateWrap" class="wide">รูปแบบขายเวร <select name="rate_mode" id="tradeRateModeSelect"><option value="mt">ขายเวรเบิกเรท MT</option><option value="kerk">ขายเวรเบิกเรท เคิก</option><option value="custom">ตกลงกันเอง / โอนกันเอง</option></select><span class="hint">ตกลงกันเอง = ไม่เปลี่ยนเจ้าของเวรในตารางหลัก และ OT/HR ยังเป็นชื่อเจ้าของเวรเดิม</span></label>
          <input name="custom_amount" type="hidden" value="0">
          ${safe(() => selfPaidTradeNotice(), '')}
          <label class="wide">รายละเอียดข้อตกลง <textarea name="note" placeholder="เช่น เบิกผ่าน HR เรท MT / เบิกผ่าน HR เรทเคิก / โอนกันเองแล้ว"></textarea></label>
          <button class="primary-btn wide" type="submit">ส่งคำขอให้อีกฝ่ายยืนยัน</button>
        </form>`), null);
      safe(() => updateTradeSwapVisibility(), null);
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'showTradeModal', err); }

  try {
    window.updateTradeSwapVisibility = updateTradeSwapVisibility = function(){
      const type = document.getElementById('tradeTypeSelect')?.value || '';
      const swapWrap = document.getElementById('tradeSwapWrap');
      const rateWrap = document.getElementById('tradeRateWrap');
      const customNotice = document.querySelector('#dutyTradeForm .notice');
      if (swapWrap) swapWrap.style.display = type === 'แลกเวร' ? '' : 'none';
      if (rateWrap) rateWrap.style.display = type === 'ขายเวร' ? '' : 'none';
      if (customNotice) customNotice.style.display = type === 'ขายเวร' ? '' : 'none';
      if (type !== 'แลกเวร') {
        const sel = document.getElementById('tradeSwapSelect');
        if (sel) sel.value = '';
      }
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'updateTradeSwapVisibility', err); }

  try {
    window.saveTradeRequest = saveTradeRequest = async function(form){
      const fd = new FormData(form);
      const fromId = fd.get('from_assignment_id');
      const receiverId = fd.get('receiver_id');
      const from = safe(() => getAssignmentsForMonth(state.monthKey).find(a => a.id === fromId), null);
      const to = fd.get('to_assignment_id') ? safe(() => getAssignmentsForMonth(state.monthKey).find(a => a.id === fd.get('to_assignment_id')), null) : null;
      if (!from || !receiverId) return toast('กรุณาเลือกผู้รับ/คู่แลกให้ครบ');
      const tradeType = fd.get('trade_type') === 'แลกเวร' ? 'แลกเวร' : 'ขายเวร';
      if (tradeType === 'แลกเวร' && !to) return toast('ถ้าเลือกแลกเวร กรุณาเลือกเวรของคู่แลกด้วย');
      const rateMode = tradeType === 'แลกเวร' ? 'mt' : (fd.get('rate_mode') || 'mt');
      const amountFrom = tradeType === 'แลกเวร' ? 0 : (rateMode === 'custom' ? 0 : safe(() => tradeRateAmount(from, receiverId, rateMode), 0));
      const amountTo = tradeType === 'แลกเวร' ? 0 : (to ? safe(() => dutyMetrics(to, from.staff_id).pay, 0) : 0);
      const row = {
        requester_id: currentStaff(), receiver_id: receiverId, from_assignment_id: fromId, to_assignment_id: to?.id || null,
        trade_type: tradeType, rate_mode: rateMode, amount_from: amountFrom, amount_to: amountTo, amount_diff: amountFrom - amountTo,
        status: 'pending', note: fd.get('note') || null, created_by: currentStaff(), updated_by: currentStaff()
      };
      const res = await sb.from('roster_trade_requests').insert(row);
      if (res.error) return toast(safe(() => friendlyDbError(res.error), res.error.message));
      close(); await safe(() => loadAllData(), null); render(); toast('ส่งคำขอแล้ว รออีกฝ่ายกดยืนยัน');
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'saveTradeRequest', err); }

  try {
    window.renderDutyTradePanel = renderDutyTradePanel = function(assignments){
      const monthRows = (S()?.tradeRequests || []).filter(r => {
        const a = (assignments || []).find(x => x.id === r.from_assignment_id || x.id === r.to_assignment_id);
        return a || String(r.created_at || '').startsWith(S()?.monthKey || '');
      });
      const staffFilter = S()?.tradeFilterStaff || '';
      const visible = monthRows.filter(r => !staffFilter || r.requester_id === staffFilter || r.receiver_id === staffFilter);
      if (!visible.length) return `<div class="trade-panel"><h3>คำขอแลก/ขายเวร</h3>${emptyX('ยังไม่มีคำขอแลก/ขายเวรในเดือนนี้')}</div>`;
      return `<div class="trade-panel"><h3>คำขอแลก/ขายเวร</h3><div class="table-wrap desktop-table"><table><thead><tr><th>ผู้ขอ</th><th>ผู้รับ/คู่แลก</th><th>รายการ</th><th>เงินโดยประมาณ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${visible.map(r => safe(() => renderTradeRow(r, assignments), '')).join('')}</tbody></table></div>${safe(() => renderTradeCards(visible, assignments), '')}</div>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderDutyTradePanel', err); }

  try {
    window.renderTradeRequestsPage = renderTradeRequestsPage = function(){
      const assignments = safe(() => getAssignmentsForMonth(state.monthKey), []);
      const staffFilter = S()?.tradeFilterStaff || '';
      const related = S()?.tradeRequests || [];
      const pendingMine = related.filter(r => r.status === 'pending' && r.receiver_id === currentStaff()).length;
      const waitingAdmin = related.filter(r => r.status === 'confirmed').length;
      return `<div class="card"><div class="toolbar compact-filter"><label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(S()?.monthKey || '')}"></label><label>คน <select id="tradeFilterStaff"><option value="">ทุกคน</option>${ordered(S()?.staff || []).map(st => `<option value="${esc(st.id)}" ${staffFilter===st.id?'selected':''}>${esc(st.nickname || st.full_name)}</option>`).join('')}</select></label>${badgeX(`รอฉันยืนยัน ${pendingMine}`, pendingMine ? 'orange' : 'black')}${badgeX(`รอ Admin ${waitingAdmin}`, waitingAdmin ? 'blue' : 'black')}</div><div class="notice soft-notice">ทุกคำขอแลก/ขายเวรต้องผ่านขั้นตอน ผู้รับยืนยัน → Admin อนุมัติ/บันทึก</div>${safe(() => renderDutyTradePanel(assignments), '')}</div>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderTradeRequestsPage', err); }

  try {
    const oldRenderTradeRow = typeof renderTradeRow === 'function' ? renderTradeRow : null;
    window.renderTradeRow = renderTradeRow = function(r, assignments){
      const from = (assignments || []).find(a => a.id === r.from_assignment_id) || {};
      const to = (assignments || []).find(a => a.id === r.to_assignment_id) || null;
      const receiverActions = r.status === 'pending' && r.receiver_id === currentStaff();
      const adminActions = r.status === 'confirmed' && admin();
      const amountText = r.trade_type === 'แลกเวร' ? 'ไม่มีเงิน / แลกเวร' : `${Number(r.amount_from || 0).toLocaleString()} บ.${r.amount_diff ? `<br><span class="muted">ส่วนต่าง ${Number(r.amount_diff).toLocaleString()} บ.</span>` : ''}`;
      return `<tr><td>${pill(r.requester_id)}</td><td>${pill(r.receiver_id)}</td><td>${esc(r.trade_type || '-')} • ${esc(safe(() => niceRoleRateLabel(r.rate_mode), r.rate_mode || '-'))}<br><span class="muted">${thaiDate(from.duty_date)} ${esc(dutyLabel(from.duty_code || ''))}${to ? ` ↔ ${thaiDate(to.duty_date)} ${esc(dutyLabel(to.duty_code || ''))}` : ''}</span></td><td>${amountText}</td><td>${badgeX(safe(() => tradeStatusLabel(r.status, r), r.status || '-'), r.status==='confirmed'?'green':r.status==='rejected'?'red':r.status==='completed'?'blue':'orange')}</td><td>${receiverActions ? `<button class="tiny-btn" data-trade-status="${esc(r.id)}|confirmed">ยืนยัน</button><button class="tiny-btn danger" data-trade-status="${esc(r.id)}|rejected">ปฏิเสธ</button>` : adminActions ? `<button class="tiny-btn" data-trade-apply="${esc(r.id)}">${safe(() => isSelfPaidTrade(r), false) ? 'Admin รับทราบข้อตกลง' : 'Admin บันทึกเปลี่ยนเวร'}</button>` : '-'}</td></tr>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderTradeRow', err); }

  // ---------- GPS off ----------
  try {
    window.getGps = getGps = function(){ return Promise.resolve({ ok:true, lat:null, lng:null, accuracy:null, gps_disabled:true }); };
    window.isInsideGeofence = isInsideGeofence = function(){ return true; };
    window.showGpsHelp = showGpsHelp = function(message){ toast(message || 'ปิดการตรวจ GPS แล้ว'); };
  } catch(err) { console.warn('[CNMI]', PATCH, 'gps helpers', err); }

  try {
    window.checkIn = checkIn = async function(){
      const proxyOptions = safe(() => selfPaidDutyProxyOptions(todayStr()), []);
      let staffIdToLog = currentStaff();
      let proxyText = '';
      const hasMyDuty = (S()?.rosterAssignments || []).some(x => x.duty_date === safe(() => todayStr(), dinput(new Date())) && x.staff_id === currentStaff());
      if (!hasMyDuty && proxyOptions.length) {
        const pick = proxyOptions[0];
        staffIdToLog = pick.assignment.staff_id;
        proxyText = ` | ลงชื่อแทนโดย ${nick(currentStaff())} จากข้อตกลงตกลงกันเอง/โอนกันเอง request:${pick.request.id}`;
      }
      const row = { staff_id: staffIdToLog, duty_date: safe(() => todayStr(), dinput(new Date())), check_in_at: new Date().toISOString(), lat: null, lng: null, accuracy: null, device: (navigator.userAgent + proxyText).slice(0,250) };
      const res = await sb.from('attendance_logs').insert(row);
      if (res.error) return toast(res.error.message);
      await safe(() => loadAllData(), null); render(); toast(proxyText ? 'ยืนยันวันอยู่เวรแทนเจ้าของเวรเดิมแล้ว' : 'ยืนยันวันอยู่เวรแล้ว');
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'checkIn', err); }

  try {
    window.saveOtRequest = saveOtRequest = async function(form){
      const fd = new FormData(form);
      const row = { staff_id: currentStaff(), work_date: fd.get('work_date'), end_time: fd.get('end_time'), reason: fd.get('reason'), note: fd.get('note'), status: 'รออนุมัติ', check_out_at: new Date().toISOString(), lat: null, lng: null, accuracy: null, device: navigator.userAgent.slice(0, 250) };
      const res = await sb.from('ot_requests').insert(row);
      if (res.error) return toast(res.error.message);
      await safe(() => loadAllData(), null); render(); toast('ส่งคำขอ OT เพิ่มแล้ว');
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'saveOtRequest', err); }

  // ---------- Dashboard ----------
  function renderDashboardList(htmlRows){ return `<div class="week-list cnmi-v101-list">${htmlRows.join('')}</div>`; }
  function activityParticipantsText(a){
    const names = arr(a.participant_ids).map(id => nick(id)).filter(Boolean).join(', ');
    return names ? `ผู้เข้าร่วม: ${names}` : 'ยังไม่มีรายชื่อผู้เข้าร่วม';
  }
  try {
    window.renderDashboard = renderDashboard = function(){
      const d = safe(() => todayStr(), dinput(new Date()));
      const fy = fiscalInfo(d);
      const leavesToday = (S()?.leaves || []).filter(x => overlaps(x, d) && x.type !== 'ไม่รับเวร');
      const noDutyToday = (S()?.leaves || []).filter(x => overlaps(x, d) && x.type === 'ไม่รับเวร');
      const actToday = (S()?.activities || []).filter(x => safe(() => dateInRange(d, x.start_date, x.end_date), x.start_date <= d && x.end_date >= d));
      const trainings = actToday.filter(x => x.event_type === 'อบรม');
      const meetings = actToday.filter(x => x.event_type === 'ประชุม');
      const todayDuties = safe(() => sortDashboardDuties((S()?.rosterAssignments || []).filter(x => x.duty_date === d), d), (S()?.rosterAssignments || []).filter(x => x.duty_date === d));
      const leaveThisFiscal = (S()?.leaves || []).filter(x => x.type !== 'ไม่รับเวร' && x.status !== 'cancelled' && rowOverlapsRange(x, fy.start, fy.end));
      const thisMonth = safe(() => monthKey(new Date()), d.slice(0,7));
      const holidayDutyCount = (S()?.rosterAssignments || []).filter(x => x.duty_date?.startsWith(thisMonth) && isWeekendX(x.duty_date) && x.staff_id).length;
      const leaveRows = [...leavesToday, ...noDutyToday].map(x => `<div class="timeline-item cnmi-v101-leave-row ${esc(safe(() => leaveBadgeClass(x.type), ''))}">${pill(x.staff_id)} ${badgeX(x.type, safe(() => leaveBadgeClass(x.type), 'black'))}<span class="muted">${esc(x.note || x.admin_record_reason || '')}</span></div>`);
      const actRows = actToday.map(x => `<div class="timeline-item cnmi-v101-activity-row"><b>${esc(x.title || '-')}</b> ${badgeX(x.event_type || '-', safe(() => activityClass(x.event_type), 'black'))}<br><span class="muted">${esc(activityParticipantsText(x))}</span>${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}</div>`);
      return `
        <div class="grid grid-4">
          ${safe(() => statCard('คนลาวันนี้', leavesToday.length), '')}
          ${safe(() => statCard('คนอบรมวันนี้', trainings.length), '')}
          ${safe(() => statCard('คนไม่รับเวรวันนี้', noDutyToday.length), '')}
          ${safe(() => statCard('กิจกรรมวันนี้', actToday.length), '')}
          ${safe(() => statCard('ประชุมวันนี้', meetings.length), '')}
          ${safe(() => statCard('เจ้าหน้าที่ทั้งหมด', (S()?.staff || []).filter(x => x.is_active).length), '')}
        </div>
        <div class="grid grid-2">
          <div class="card">
            <div class="section-title"><h3>เวรวันนี้</h3><span>${thaiDate(d)}</span></div>
            ${todayDuties.length ? `<div class="table-wrap"><table><thead><tr><th>เวร</th><th>ผู้รับผิดชอบ</th></tr></thead><tbody>${todayDuties.map(r => `<tr><td>${esc(dutyLabel(r.duty_code))}</td><td>${pill(r.staff_id)}</td></tr>`).join('')}</tbody></table></div>` : emptyX('ยังไม่มีตารางเวรวันนี้')}
          </div>
          <div class="card">
            <div class="section-title"><h3>สถิติ</h3><button class="soft-btn" data-page="schedule">ดูตารางเวร</button></div>
            <div class="grid grid-2">
              ${safe(() => statCard(`คนลาปีงบ ${fy.fyBE}`, leaveThisFiscal.length), '')}
              ${safe(() => statCard('เวรวันหยุดเดือนนี้', holidayDutyCount), '')}
            </div>
          </div>
          <div class="card">
            <div class="section-title"><h3>ลา / ไม่รับเวรวันนี้</h3></div>
            ${leaveRows.length ? renderDashboardList(leaveRows) : emptyX('วันนี้ไม่มีรายการลา/ไม่รับเวร')}
          </div>
          <div class="card">
            <div class="section-title"><h3>กิจกรรมวันนี้</h3></div>
            ${actRows.length ? renderDashboardList(actRows) : emptyX('วันนี้ไม่มีกิจกรรม')}
          </div>
        </div>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderDashboard', err); }

  // ---------- Leave fiscal-year page ----------
  try {
    window.renderLeavePage = renderLeavePage = function(){
      const fyBE = currentLeaveFiscalBE();
      const fy = fiscalFromBE(fyBE);
      const allRows = (S()?.leaves || []).filter(x => (admin() || x.staff_id === currentStaff()) && rowOverlapsRange(x, fy.start, fy.end));
      const editing = S()?.editingLeaveId ? (S()?.leaves || []).find(x => x.id === S().editingLeaveId) : null;
      const selectedStaff = editing?.staff_id || currentStaff();
      const selectedPhone = editing?.contact_phone || safe(() => staffPhone(selectedStaff), '');
      const fyOptions = fiscalOptionsFromLeaves().map(y => `<option value="${y}" ${Number(y)===Number(fyBE)?'selected':''}>ปีงบ ${y}</option>`).join('');
      return `
        <div class="grid grid-2">
          <div class="card">
            <div class="section-title"><h3>${editing ? 'แก้ไขรายการ' : 'แจ้งลา / ไม่รับเวร'}</h3>${editing ? '<button class="ghost-btn" data-cancel-edit-leave>ยกเลิกแก้ไข</button>' : ''}</div>
            <form id="leaveForm" class="form-grid">
              ${admin() ? `<label class="wide">บันทึกให้เจ้าหน้าที่ <select name="staff_id" id="leaveStaffSelect" required>${safe(() => staffOptions(selectedStaff), '')}</select><span class="hint">Admin เพิ่ม/แก้ไข/ยกเลิกแทน staff ได้ รวมถึงลาย้อนหลัง กรณีเจ้าหน้าที่ไม่สะดวกบันทึกเอง</span></label>` : ''}
              <label>ประเภท <select name="type" required>${safe(() => LEAVE_TYPES, ['ลาพักร้อน','ลากิจ','ลาป่วย','ลาคลอด','ไม่รับเวร','อื่นๆ']).map(t => `<option ${editing?.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
              <label>วันที่เริ่ม <input name="start_date" type="date" value="${esc(editing?.start_date || safe(() => todayStr(), dinput(new Date())))}" required></label>
              <label>วันที่สิ้นสุด <input name="end_date" type="date" value="${esc(editing?.end_date || safe(() => todayStr(), dinput(new Date())))}" required></label>
              <label>ช่วงเวลา <select name="leave_period">${['เต็มวัน','ครึ่งเช้า 08:00-12:30','ครึ่งบ่าย 11:30-16:00'].map(v => `<option value="${esc(v)}" ${(editing?.leave_period || 'เต็มวัน')===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
              <label>เบอร์ติดต่อระหว่างลา <input name="contact_phone" id="leaveContactPhone" value="${esc(selectedPhone || '')}" placeholder="ระบบเติมจากข้อมูลเจ้าหน้าที่ให้อัตโนมัติ"></label>
              <label>แนบไฟล์ (ถ้ามี) <input name="file" type="file"><span class="hint">ไม่บังคับแนบไฟล์ ถ้ามีเอกสารค่อยแนบได้</span></label>
              ${admin() ? `<label class="wide">เหตุผลที่ Admin บันทึกแทน / ย้อนหลัง <textarea name="admin_record_reason" placeholder="เช่น น้องไม่สะดวกเข้าระบบ / บันทึกย้อนหลังตามใบลา / แจ้งทางโทรศัพท์">${esc(editing?.admin_record_reason || '')}</textarea></label>` : ''}
              <label class="wide">หมายเหตุ <textarea name="note" placeholder="ระบุรายละเอียดเพิ่มเติม">${esc(editing?.note || '')}</textarea></label>
              <div class="notice soft-notice wide">ถ้าวันที่ขอลามีการประกาศตารางตำแหน่งรายวันแล้ว ระบบยังบันทึกได้ แต่จะแจ้งเตือนให้ติดต่ออินชาร์จหรือหัวหน้า เพื่อให้ปรับตำแหน่งหน้างานทันที</div>
              <button class="primary-btn wide" type="submit">${editing ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</button>
            </form>
          </div>
          <div class="card">
            <div class="section-title"><h3>รายการของ${admin() ? 'ทุกคน' : 'ฉัน'}</h3>${badgeX(`${allRows.length} รายการ`, allRows.length ? 'blue' : 'black')}</div>
            <div class="toolbar compact-filter"><label>ปีงบประมาณ <select id="leaveFiscalYearSelect">${fyOptions}</select></label><span class="hint">${thaiDate(fy.start)} - ${thaiDate(fy.end)}</span></div>
            ${safe(() => renderLeaveTable(allRows), emptyX('ยังไม่มีรายการ'))}
          </div>
        </div>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderLeavePage', err); }

  document.addEventListener('change', function(e){
    if (e.target && e.target.id === 'leaveFiscalYearSelect') {
      if (S()) S().leaveFiscalYearBE = Number(e.target.value) || fiscalInfo().fyBE;
      render();
    }
    if (e.target && e.target.id === 'tradeTypeSelect') safe(() => updateTradeSwapVisibility(), null);
  }, true);

  // ---------- Schedule all-month color view ----------
  function scheduleTabV101(value, label){
    return `<button class="${S()?.scheduleMobileView===value?'primary-btn':'ghost-btn'}" data-schedule-mobile-view="${esc(value)}">${esc(label)}</button>`;
  }
  function scheduleAllMonthCalendar(assignments){
    const key = S()?.monthKey || safe(() => monthKey(new Date()), dinput(new Date()).slice(0,7));
    const { y, m } = monthRange(key);
    const first = new Date(y, m-1, 1);
    const startOffset = first.getDay();
    const last = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= last; day++) cells.push(`${y}-${pad2(m)}-${pad2(day)}`);
    while (cells.length % 7) cells.push(null);
    return `<div class="cnmi-v101-duty-calendar"><div class="cnmi-v101-cal-note">ตารางทั้งเดือนแบบสีเจ้าหน้าที่: เห็นเฉพาะว่าใครอยู่เวรวันไหน</div><div class="cnmi-v101-weekdays">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x => `<b>${x}</b>`).join('')}</div><div class="cnmi-v101-cal-grid">${cells.map(date => {
      if (!date) return '<div class="cnmi-v101-cal-cell muted-cell"></div>';
      const day = Number(date.slice(8,10));
      const entries = (assignments || []).filter(a => a.duty_date === date && a.staff_id).sort((a,b) => dutyCols().indexOf(a.duty_code) - dutyCols().indexOf(b.duty_code));
      const cls = isHolidayX(date) ? 'holiday-cell' : isWeekendX(date) ? 'weekend-cell' : '';
      return `<div class="cnmi-v101-cal-cell ${cls}"><div class="cnmi-v101-daynum">${day}${isHolidayX(date) ? `<span>${esc(holidayNameX(date))}</span>` : ''}</div>${entries.map(a => { const bg = sColor(a.staff_id); return `<div class="cnmi-v101-duty-bar" style="background:${bg};color:${tColor(bg)}"><b>${esc(dutyLabel(a.duty_code))}</b> ${esc(nick(a.staff_id))}</div>`; }).join('')}</div>`;
    }).join('')}</div></div>`;
  }
  try {
    window.renderMonthlySchedulePage = renderMonthlySchedulePage = function(){
      const assignments = safe(() => getAssignmentsForMonth(state.monthKey), []);
      const isCalendar = S()?.scheduleMobileView === 'calendarAll';
      return `<div class="card schedule-page-card">
        <div class="toolbar no-print">
          <label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(S()?.monthKey || '')}"></label>
          <button class="ghost-btn" data-export-schedule-excel>Export Excel</button>
          <button class="ghost-btn" data-print-page>Export PDF / พิมพ์</button>
          <button class="soft-btn" data-show-fairness>กดชื่อคนเพื่อดูสถิติ หรือดูสมดุลเวร</button>
        </div>
        <div class="mobile-schedule-tabs no-print schedule-view-tabs">
          ${scheduleTabV101('day', 'ดูตามวัน')}
          ${scheduleTabV101('person', 'ดูตามคน')}
          ${scheduleTabV101('ot', 'สรุป OT')}
          ${scheduleTabV101('table', 'ตาราง')}
          ${scheduleTabV101('calendarAll', 'ตารางทั้งเดือน')}
        </div>
        <h3 class="print-only">ตารางเวรประจำเดือน ${esc(S()?.monthKey || '')}</h3>
        ${safe(() => renderScheduleSummary(assignments), '')}${isCalendar ? scheduleAllMonthCalendar(assignments) : safe(() => renderReadOnlySchedule(assignments), emptyX('ยังไม่มีตารางเวรของเดือนนี้'))}${safe(() => renderDutyTradePanel(assignments), '')}
      </div>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderMonthlySchedulePage', err); }
  try {
    const oldMobileScheduleView = typeof renderMobileScheduleView === 'function' ? renderMobileScheduleView : null;
    window.renderMobileScheduleView = renderMobileScheduleView = function(assignments){
      if (S()?.scheduleMobileView === 'calendarAll') return scheduleAllMonthCalendar(assignments);
      return oldMobileScheduleView ? oldMobileScheduleView(assignments) : '';
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderMobileScheduleView', err); }

  // ---------- Monthly position matrix fix (v100 returned div instead of td; v101 returns td) ----------
  function isTrueLeaveOn(staffId, date){
    return (S()?.leaves || []).some(l => String(l.staff_id) === String(staffId) && l.status !== 'cancelled' && String(l.type || '').startsWith('ลา') && l.type !== 'ไม่รับเวร' && rowOverlapsRange(l, date, date));
  }
  function outingParticipant(staffId, date){
    if (typeof window.cnmiV100IsOutingParticipant === 'function') return !!window.cnmiV100IsOutingParticipant(staffId, date);
    const ids = new Set();
    (S()?.activities || []).filter(a => String(a.event_type || '') === 'ออกหน่วย' && rowOverlapsRange(a, date, date)).forEach(a => arr(a.participant_ids).forEach(id => ids.add(String(id))));
    return ids.has(String(staffId));
  }
  function templatesForStaffDate(staffId, date){
    if (typeof window.cnmiV100PositionTemplatesFor === 'function') return window.cnmiV100PositionTemplatesFor(staffId, date) || [];
    return outingParticipant(staffId, date) ? safe(() => OUTING_POSITIONS, []) : safe(() => DEFAULT_POSITIONS, []);
  }
  function baseCode(code){ return safe(() => positionBaseCode(code), String(code || '').replace(/\s+#\d+$/,'').trim()); }
  function posLabel(code){ return safe(() => positionLabelForCell(code), String(code || '')); }
  try {
    window.renderMonthPositionCell = renderMonthPositionCell = function(st, date, cellRows, canEdit=false){
      if (safe(() => isNoPositionDay(date), isWeekendX(date) || isHolidayX(date))) return `<td class="matrix-cell no-position-day"><span>${isHolidayX(date) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
      if (isTrueLeaveOn(st.id, date)) return `<td class="matrix-cell leave-cell"><span>ลา</span><div class="cell-note">ไม่ต้องจัดตำแหน่ง</div></td>`;
      const isOut = outingParticipant(st.id, date);
      const list = templatesForStaffDate(st.id, date);
      const rows = (cellRows || []).filter(r => r && !/รอตรวจสอบ|ไม่พบตำแหน่ง/.test(`${r.position_code || ''} ${r.zone || ''} ${r.job_desc || ''}`));
      const row = rows[0] || null;
      const current = row?.position_code || row?.code || '';
      const cls = `${isOut ? 'outing-cell' : ''} ${!current ? 'needs-review-cell' : ''}`.trim();
      if (canEdit) {
        const opts = [`<option value="">เลือกตำแหน่ง</option>`].concat(list.map(t => {
          const code = t.code || t.position_code || '';
          return `<option value="${esc(code)}" ${baseCode(current) === baseCode(code) ? 'selected' : ''}>${esc(posLabel(code))}</option>`;
        })).join('');
        return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(date)}|${esc(st.id)}">${opts}</select>${isOut ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
      }
      return `<td class="matrix-cell ${cls}"><span>${current ? esc(posLabel(current)) : 'เลือกตำแหน่ง'}</span>${isOut ? '<div class="cell-note">ออกหน่วย</div>' : ''}</td>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderMonthPositionCell', err); }

  try {
    window.renderMonthPositionMatrix = renderMonthPositionMatrix = function(rows, dates){
      if (!rows.length) return emptyX('ยังไม่มีแผนรายเดือน กด “สร้างแผนทั้งเดือน” ก่อน');
      const byCell = {};
      (rows || []).forEach((r, idx) => {
        if (!r.staff_id || !r.work_date) return;
        const key = `${r.staff_id}|${r.work_date}`;
        byCell[key] = byCell[key] || [];
        byCell[key].push({ ...r, _idx: idx });
      });
      const canEdit = admin() && S()?.page === 'positionMonth';
      const displayStaff = activePositionStaff(rows);
      return `<div class="monthly-matrix-wrap cnmi-v101-position-wrap">
        <div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> ออกหน่วย <span class="legend-box leave"></span> ลา ${canEdit ? '<span class="hint">Admin เลือกตำแหน่งในช่องได้ แล้วกดบันทึกแผนทั้งเดือน</span>' : ''}</div>
        <div class="table-wrap month-position-matrix"><table><thead><tr><th class="sticky-col staff-col">เจ้าหน้าที่</th>${(dates || []).map(date => { const d = dparse(date); const cls = isHolidayX(date) ? 'holiday-head' : isWeekendX(date) ? 'weekend-head' : outingParticipant('__none__', date) ? 'outing-head' : ''; return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`; }).join('')}</tr></thead><tbody>
          ${displayStaff.map(st => `<tr><td class="sticky-col staff-col staff-color-cell" style="background:${sColor(st)};color:${tColor(sColor(st))}"><button class="staff-summary-trigger" data-month-position-stat="${esc(st.id)}" type="button" title="ดูสรุปตำแหน่งรายเดือนของ ${esc(st.nickname || st.full_name)}"><b>${esc(st.nickname || st.full_name)}</b><br><small>${esc(st.staff_type || '')}</small><span>ดูสรุป</span></button></td>${(dates || []).map(date => safe(() => renderMonthPositionCell(st, date, byCell[`${st.id}|${date}`] || [], canEdit), '<td></td>')).join('')}</tr>`).join('')}
        </tbody></table></div>
      </div>`;
    };
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderMonthPositionMatrix', err); }

  // ---------- OT page text cleanup ----------
  try {
    const oldRenderOtPage = typeof renderOtPage === 'function' ? renderOtPage : null;
    if (oldRenderOtPage) {
      window.renderOtPage = renderOtPage = function(){
        return oldRenderOtPage.call(this)
          .replace(/<p class="hint gps-help compact">[\s\S]*?<\/p>/g, '<p class="hint compact">ระบบปิดการตรวจ GPS แล้ว</p>')
          .replace(/ใช้ GPS เพื่อตรวจว่าอยู่ในพื้นที่โรงพยาบาลก่อนยืนยัน/g, 'ระบบปิดการตรวจ GPS แล้ว');
      };
    }
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderOtPage', err); }

  function injectStyle(){
    if (document.getElementById('cnmi-v101-style')) return;
    const style = document.createElement('style');
    style.id = 'cnmi-v101-style';
    style.textContent = `
      .schedule-view-tabs{display:flex!important;flex-wrap:wrap;gap:8px;margin:10px 0 14px;}
      .cnmi-v101-list .timeline-item{display:block;border-radius:14px;padding:10px 12px;margin-bottom:8px;background:#f8fafc;border:1px solid #e5edf5;}
      .cnmi-v101-leave-row.green{background:#e9f8df}.cnmi-v101-leave-row.purple{background:#f0e5ff}.cnmi-v101-leave-row.yellow{background:#fff5cf}.cnmi-v101-leave-row.black{background:#eef2f6}.cnmi-v101-leave-row.blue{background:#e5f3ff}
      .cnmi-v101-activity-row .badge{margin-left:6px;}
      .cnmi-v101-duty-calendar{width:100%;overflow:auto;border:1px solid #e4edf6;border-radius:18px;background:#fff;padding:12px;}
      .cnmi-v101-cal-note{font-size:13px;color:#64748b;margin:0 0 10px;}
      .cnmi-v101-weekdays,.cnmi-v101-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(125px,1fr));gap:6px;min-width:880px;}
      .cnmi-v101-weekdays b{text-align:center;color:#475569;padding:8px 0;}
      .cnmi-v101-cal-cell{min-height:126px;border:1px solid #dbe7f2;border-radius:14px;background:#fff;padding:8px;overflow:hidden;}
      .cnmi-v101-cal-cell.weekend-cell,.cnmi-v101-cal-cell.holiday-cell{background:#fffaf0;}
      .cnmi-v101-cal-cell.muted-cell{background:#f8fafc;opacity:.55;}
      .cnmi-v101-daynum{font-weight:800;color:#203245;margin-bottom:6px;display:flex;gap:6px;align-items:center;justify-content:space-between;}
      .cnmi-v101-daynum span{font-size:10px;font-weight:600;color:#8a6d00;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cnmi-v101-duty-bar{border-radius:7px;padding:4px 6px;margin:4px 0;font-size:12px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);}
      .cnmi-v101-position-wrap .month-position-matrix{max-height:72vh;overflow:auto;border:1px solid #dbe7f2;border-radius:16px;}
      .cnmi-v101-position-wrap .month-position-matrix table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;table-layout:fixed;}
      .cnmi-v101-position-wrap .month-position-matrix th,.cnmi-v101-position-wrap .month-position-matrix td{min-width:125px;max-width:150px;padding:8px;border-bottom:1px solid #e4edf6;border-right:1px solid #eef4fa;text-align:center;vertical-align:middle;white-space:normal;}
      .cnmi-v101-position-wrap .month-position-matrix .staff-col{min-width:170px;max-width:190px;text-align:left;position:sticky;left:0;z-index:4;}
      .cnmi-v101-position-wrap .month-position-matrix thead th{position:sticky;top:0;background:#f8fbff;z-index:3;}
      .cnmi-v101-position-wrap .month-position-matrix thead .staff-col{z-index:5;background:#f8fbff;}
      .cnmi-v101-position-wrap .matrix-cell.no-position-day{background:#d8dee5;color:#475569;font-weight:800;}
      .cnmi-v101-position-wrap .matrix-cell.leave-cell{background:#fff7d8;color:#795b00;font-weight:800;}
      .cnmi-v101-position-wrap .matrix-cell.outing-cell{background:#fff0f4;color:#9f1239;font-weight:800;}
      .cnmi-v101-position-wrap .matrix-cell.needs-review-cell{background:#fff7d8;}
      .cnmi-v101-position-wrap .month-position-select{width:100%;min-width:105px;border-radius:12px;padding:8px;border:1px solid #dbe7f2;background:#fff;font-weight:700;}
      .cnmi-v101-position-wrap .cell-note{font-size:11px;margin-top:5px;color:#64748b;font-weight:700;}
      @media(max-width:820px){.cnmi-v101-duty-calendar{padding:8px}.cnmi-v101-weekdays,.cnmi-v101-cal-grid{grid-template-columns:repeat(7,96px);min-width:672px}.cnmi-v101-cal-cell{min-height:105px;padding:6px}.cnmi-v101-duty-bar{font-size:10px;padding:3px 5px}.cnmi-v101-position-wrap .month-position-matrix th,.cnmi-v101-position-wrap .month-position-matrix td{min-width:105px;max-width:120px;font-size:12px}.cnmi-v101-position-wrap .month-position-matrix .staff-col{min-width:135px;max-width:145px}}
    `;
    document.head.appendChild(style);
  }

  try {
    const oldRenderPage = typeof renderPage === 'function' ? renderPage : null;
    if (oldRenderPage && !oldRenderPage.__v101Patch) {
      const patchedRenderPage = function(...args){
        patchLabels();
        injectStyle();
        const result = oldRenderPage.apply(this, args);
        return result;
      };
      patchedRenderPage.__v101Patch = true;
      window.renderPage = renderPage = patchedRenderPage;
    }
  } catch(err) { console.warn('[CNMI]', PATCH, 'renderPage', err); }

  injectStyle();
  console.info('[CNMI]', PATCH, 'loaded');
})();
