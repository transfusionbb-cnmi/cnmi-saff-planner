
/* =========================================================
   V205 OT Summary Money + Carry Forward + Partial Sell Shift
   - สรุป OT รายเดือน: เพิ่มเงินที่ได้รับ + OT ทบไปรอบหน้า
   - คำขอขายเวร: เลือกขายเฉพาะช่วง เช้า/บ่าย/ดึก/บ่ายดึก/ดึกเช้า ได้
   - ลดความสับสน Cross-rate: เลือกขายเรท MT / เคิก / กำหนดเอง เป็นหลัก
   ========================================================= */
(function(){
  'use strict';
  const VERSION_V205 = 'V205_OT_MONEY_CARRY_PARTIAL_TRADE';

  const TRADE_PARTS_V205 = {
    full: { label:'ขายทั้งเวร', short:'ทั้งเวร', hours:null },
    morning: { label:'ขายแค่เช้า', short:'เช้า', hours:8 },
    afternoon: { label:'ขายแค่บ่าย', short:'บ่าย', hours:8 },
    night: { label:'ขายแค่ดึก', short:'ดึก', hours:8 },
    afternoon_night: { label:'ขายแค่บ่ายดึก', short:'บ่ายดึก', hours:16 },
    night_morning: { label:'ขายแค่ดึกเช้า', short:'ดึกเช้า', hours:16 }
  };

  function esc205(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function round205(value, digits=2){
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    const m = Math.pow(10, digits);
    return Math.round(n * m) / m;
  }
  function formatHours205(value, digits=2){
    const n = round205(value, digits);
    if (Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');
  }
  function formatMoney205(value){
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    const rounded = Math.round(n * 100) / 100;
    return `${rounded.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 })} บ.`;
  }
  function normalizeDate205(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function staffRecord205(staffId){
    try {
      return (state.staff || []).find(s => String(s.id) === String(staffId) || String(s.nickname || '').trim() === String(staffId).trim() || String(s.full_name || '').trim() === String(staffId).trim()) || null;
    } catch (_) { return null; }
  }
  function staffBaseType205(staffId){
    const s = staffRecord205(staffId);
    return String(s?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT';
  }
  function staffBaseRate205(staffId){ return staffBaseType205(staffId) === 'เคิก' ? 90 : 130; }
  function otCarry205(hrHours){
    const centiHours = Math.round(Number(hrHours || 0) * 100);
    if (!Number.isFinite(centiHours) || centiHours <= 0) return 0;
    return round205((centiHours % 800) / 100, 2);
  }
  function claimStatus205(row){
    const raw = row?.claim_status;
    if (raw == null || String(raw).trim() === '') return 'Pending';
    const s = String(raw).trim().toLowerCase();
    return (s === 'claimed' || s === 'เบิกแล้ว') ? 'Claimed' : 'Pending';
  }
  function isPendingApproved205(row){ return String(row?.status || '').trim() === 'อนุมัติ' && claimStatus205(row) === 'Pending'; }
  function otBreakdown205(row){
    try {
      const n = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if (n && Number.isFinite(Number(n.hrHours))) return n;
    } catch (_) {}
    let actual = 0;
    try { actual = Number(calcOtHours(row) || 0); } catch (_) { actual = Number(row?.manual_hours || row?.hours || 0); }
    return { actualHours:round205(actual, 2), hrHours:round205(actual, 2), isHoliday:false };
  }

  window.renderOtSummary = renderOtSummary = function renderOtSummaryV205(){
    const approved = (state.otRequests || []).filter(isPendingApproved205);
    const map = {};
    approved.forEach(r => {
      const n = otBreakdown205(r);
      if (!Number.isFinite(Number(n.actualHours)) || Number(n.actualHours) <= 0) return;
      const id = r.staff_id || '-';
      map[id] = map[id] || { actual:0, hr:0, money:0, carry:0, count:0, minDate:'', maxDate:'', holidayCount:0, rate:staffBaseRate205(id), rateType:staffBaseType205(id) };
      map[id].actual = round205(map[id].actual + Number(n.actualHours || 0), 2);
      map[id].hr = round205(map[id].hr + Number(n.hrHours || 0), 2);
      map[id].count += 1;
      if (n.isHoliday) map[id].holidayCount += 1;
      const d = normalizeDate205(r.work_date);
      if (d) {
        if (!map[id].minDate || d < map[id].minDate) map[id].minDate = d;
        if (!map[id].maxDate || d > map[id].maxDate) map[id].maxDate = d;
      }
    });
    Object.keys(map).forEach(id => {
      map[id].money = round205(map[id].hr * map[id].rate, 2);
      map[id].carry = otCarry205(map[id].hr);
    });
    const rows = Object.entries(map).sort((a,b) => {
      try { return staffNick(a[0]).localeCompare(staffNick(b[0]), 'th'); }
      catch (_) { return String(a[0]).localeCompare(String(b[0]), 'th'); }
    });
    if (!rows.length) return empty('ยังไม่มี OT สถานะอนุมัติที่รอเบิก (Pending)');
    return `<div class="table-wrap v181-pending-summary v190-pending-summary v205-pending-summary"><table id="otSummaryTable"><thead><tr><th>ชื่อ</th><th>ชั่วโมงจริง Pending</th><th>ชั่วโมงเบิก HR</th><th>คำนวณเป็นเงิน</th><th>OT ทบไปรอบหน้า</th><th>จำนวนรายการ</th><th>รายการนักขัต</th><th>ช่วงวันที่ของรายการ</th><th>สถานะเบิก</th></tr></thead><tbody>${rows.map(([id,r]) => `<tr><td>${staffPill(id)}</td><td>${formatHours205(r.actual, 1)}</td><td><b>${formatHours205(r.hr, 2)}</b></td><td><b>${formatMoney205(r.money)}</b><br><span class="muted">${esc205(r.rateType)} ${r.rate} บ./ชม.</span></td><td><b>${formatHours205(r.carry, 2)}</b></td><td>${r.count}</td><td>${r.holidayCount}</td><td>${esc205(r.minDate ? `${formatThaiDate(r.minDate)} - ${formatThaiDate(r.maxDate)}` : '-')}</td><td><span class="badge yellow">Pending</span></td></tr>`).join('')}</tbody></table></div>`;
  };

  const previousNiceRoleRateLabelV205 = window.niceRoleRateLabel || (typeof niceRoleRateLabel === 'function' ? niceRoleRateLabel : null);
  window.niceRoleRateLabel = niceRoleRateLabel = function niceRoleRateLabelV205(value){
    return ({ mt:'ขายเรท MT', kerk:'ขายเรทเคิก', custom:'กำหนดจำนวนเงินเอง', receiver:'อัตโนมัติเดิม', owner:'ตามเรทเจ้าของเวรเดิม' }[value] || (previousNiceRoleRateLabelV205 ? previousNiceRoleRateLabelV205(value) : value) || '-');
  };

  window.selfPaidTradeNotice = selfPaidTradeNotice = function selfPaidTradeNoticeV205(){
    return `<div class="notice soft-notice wide"><b>เลือกช่วงขายเวรได้</b><br>ถ้าเลือก “ขายทั้งเวร” เมื่อ Admin บันทึก ระบบจะโอนเวรทั้งช่องให้ผู้รับเวรเหมือนเดิม แต่ถ้าเลือกขายเฉพาะช่วง เช่น เช้า/บ่าย/ดึก ระบบจะบันทึกเป็นรายการขายเฉพาะช่วงและไม่ย้ายเจ้าของเวรทั้งช่อง เพื่อไม่ให้ตารางเวรหลักเพี้ยน</div>`;
  };

  function assignmentFullHours205(assignment){
    if (!assignment) return 0;
    try {
      const h = Number(shiftPaymentHoursForCode(assignment.duty_date, assignment.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    try {
      const h = Number(dutyHoursForCode(assignment.duty_date, assignment.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    return 0;
  }
  function tradePartFromNote205(note){
    const m = String(note || '').match(/\[SELL_PART=([a-z_]+)\]/i);
    const key = m ? String(m[1]).toLowerCase() : 'full';
    return TRADE_PARTS_V205[key] ? key : 'full';
  }
  function tradePartHours205(part, assignment){
    const full = assignmentFullHours205(assignment);
    const cfg = TRADE_PARTS_V205[part] || TRADE_PARTS_V205.full;
    if (part === 'full') return full || 0;
    const requested = Number(cfg.hours || 0);
    return full > 0 ? Math.min(requested, full) : requested;
  }
  function tradePartLabel205(part, assignment){
    const key = TRADE_PARTS_V205[part] ? part : 'full';
    return `${TRADE_PARTS_V205[key].label} (${formatHours205(tradePartHours205(key, assignment), 1)} ชม.)`;
  }
  function stripTradeMarkers205(note){
    return String(note || '')
      .replace(/\s*\[SELL_PART=[a-z_]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_HOURS=\d+(?:\.\d+)?\]\s*/ig, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function buildTradeNote205(part, assignment, note){
    const clean = stripTradeMarkers205(note);
    const marker = `[SELL_PART=${part}] [SELL_HOURS=${formatHours205(tradePartHours205(part, assignment), 2)}]`;
    return clean ? `${marker} ${clean}` : marker;
  }
  function defaultRateMode205(sellerId, assignment){
    let type = 'MT';
    try { type = dutyStaffTypeForRate(sellerId, assignment?.duty_code || '') || staffBaseType205(sellerId); }
    catch (_) { type = staffBaseType205(sellerId); }
    return type === 'เคิก' ? 'kerk' : 'mt';
  }
  function forcedRate205(mode, date){
    try {
      if (mode === 'kerk') return dutyRateByType('เคิก', date);
      return dutyRateByType('MT', date);
    } catch (_) {
      const holiday = typeof isHolidayDate === 'function' ? isHolidayDate(date) : false;
      if (mode === 'kerk') return holiday ? 120 : 90;
      return holiday ? 160 : 130;
    }
  }
  const previousCalculateShiftPaymentV205 = window.calculateShiftPayment || (typeof calculateShiftPayment === 'function' ? calculateShiftPayment : null);
  function calculateTradePaymentV205(assignment, sellerStaffId, receiverStaffId, rateMode='mt', part='full', customAmount=0){
    const hours = tradePartHours205(part, assignment);
    const date = assignment?.duty_date || '';
    if (rateMode === 'custom') return { hours, adjustedHours:hours, rate:0, amount:Number(customAmount || 0), rateLabel:'กำหนดเอง', sellerType:'-', receiverType:'-', isCrossRate:false };
    if (rateMode === 'mt' || rateMode === 'kerk') {
      const rate = forcedRate205(rateMode, date);
      return { hours, adjustedHours:hours, rate, amount:Math.round(hours * rate), rateLabel:rateMode === 'kerk' ? 'เคิก' : 'MT', sellerType:rateMode === 'kerk' ? 'เคิก' : 'MT', receiverType:rateMode === 'kerk' ? 'เคิก' : 'MT', isCrossRate:false };
    }
    if (previousCalculateShiftPaymentV205) {
      const fullHours = assignmentFullHours205(assignment) || hours || 1;
      const base = previousCalculateShiftPaymentV205(assignment, sellerStaffId, receiverStaffId, 'ขายเวร', rateMode);
      const ratio = fullHours ? (hours / fullHours) : 1;
      return { ...base, hours, adjustedHours:round205(Number(base.adjustedHours || hours) * ratio, 2), amount:Math.round(Number(base.amount || 0) * ratio), rateLabel:niceRoleRateLabel(rateMode) };
    }
    const rate = forcedRate205('mt', date);
    return { hours, adjustedHours:hours, rate, amount:Math.round(hours * rate), rateLabel:'MT', sellerType:'MT', receiverType:'MT', isCrossRate:false };
  }

  window.tradePaymentDisplay = tradePaymentDisplay = function tradePaymentDisplayV205(r, from, to=null){
    const part = tradePartFromNote205(r?.note);
    const p = calculateTradePaymentV205(from, r?.requester_id, r?.receiver_id, r?.rate_mode || 'mt', part, r?.amount_from || 0);
    const amount = Number(r?.amount_from ?? p.amount ?? 0);
    let html = `${formatMoney205(amount)}`;
    html += `<br><span class="muted">${esc205(tradePartLabel205(part, from))} • ชม.เบิก ${formatHours205(p.adjustedHours || p.hours, 2)} • ${esc205(niceRoleRateLabel(r?.rate_mode || 'mt'))}</span>`;
    if (to && Number(r?.amount_diff || 0)) html += `<br><span class="muted">ส่วนต่าง ${Number(r.amount_diff || 0).toLocaleString()} บ.</span>`;
    return html;
  };

  function tradePartOptions205(selected, assignment){
    return Object.entries(TRADE_PARTS_V205).map(([key, cfg]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${esc205(cfg.label)} (${formatHours205(tradePartHours205(key, assignment), 1)} ชม.)</option>`).join('');
  }
  function tradeRateOptions205(selected){
    const legacy = (selected === 'receiver' || selected === 'owner') ? `<option value="${esc205(selected)}" selected>รายการเดิม: ${esc205(niceRoleRateLabel(selected))}</option>` : '';
    return `${legacy}<option value="mt" ${selected==='mt'?'selected':''}>ขายเรท MT</option><option value="kerk" ${selected==='kerk'?'selected':''}>ขายเรทเคิก</option><option value="custom" ${selected==='custom'?'selected':''}>กำหนดจำนวนเงินเอง / 0 บาทได้</option>`;
  }

  window.showTradeModal = showTradeModal = function showTradeModalV205(assignmentId, existingRequest=null){
    const slot = getAssignmentsForMonth(state.monthKey).find(a => a.id === assignmentId) || state.rosterAssignments.find(a => a.id === assignmentId);
    if (!slot) return showToast('ไม่พบเวรนี้ กรุณารีเฟรชหน้า');
    const editing = !!existingRequest?.id;
    const possibleRequester = orderedStaff(state.staff.filter(s => isRosterEnabled(s)));
    const possibleReceiver = orderedStaff(state.staff.filter(s => isRosterEnabled(s) && s.id !== slot.staff_id));
    const requesterValue = editing ? existingRequest.requester_id : '';
    const receiverValue = editing ? existingRequest.receiver_id : '';
    const partValue = editing ? tradePartFromNote205(existingRequest.note) : 'full';
    const rateValue = editing ? (existingRequest.rate_mode || defaultRateMode205(slot.staff_id, slot)) : defaultRateMode205(slot.staff_id, slot);
    const customValue = editing && rateValue === 'custom' ? Number(existingRequest.amount_from || 0) : '';
    const fullAmount = calculateTradePaymentV205(slot, slot.staff_id, slot.staff_id, defaultRateMode205(slot.staff_id, slot), 'full').amount;
    const requesterControl = isAdmin()
      ? `<label class="wide">ผู้ขายเวร <select name="requester_id" id="tradeRequesterSelect" required><option value="">เลือกผู้ขายเวร</option>${possibleRequester.map(s => `<option value="${esc205(s.id)}" ${String(requesterValue)===String(s.id)?'selected':''}>${esc205(s.nickname || s.full_name)} (${esc205(s.staff_type || '-')})</option>`).join('')}</select><span class="hint">Admin ต้องเลือกผู้ขายเวรเองทุกครั้ง และผู้ขายเวรต้องตรงกับเจ้าของเวรเดิม</span></label>`
      : `<input type="hidden" name="requester_id" value="${esc205(slot.staff_id)}">`;
    showModal(`<h2>${editing ? 'แก้ไขคำขอขายเวร' : 'ขอขายเวร'}</h2><p class="hint">${formatThaiDate(slot.duty_date)} ${esc205(DUTY_LABEL[slot.duty_code] || slot.duty_code)} • เจ้าของเวรเดิม ${staffPill(slot.staff_id)} • มูลค่าเต็มเวรประมาณ ${formatMoney205(fullAmount)}</p>
      <form id="dutyTradeForm" class="form-grid" data-v205-trade-form="1" data-assignment-id="${esc205(slot.id)}">
        <input type="hidden" name="from_assignment_id" value="${esc205(slot.id)}">
        ${editing ? `<input type="hidden" name="trade_request_id" value="${esc205(existingRequest.id)}">` : ''}
        ${requesterControl}
        <label>ประเภท <select name="trade_type" id="tradeTypeSelect"><option value="ขายเวร" selected>ขายเวร / เบิก OT ผ่าน HR</option></select><span class="hint">ระบบนี้ใช้รายการขายเวรเท่านั้น</span></label>
        <label>คนที่จะรับเวร <select name="receiver_id" id="tradeReceiverSelect" required><option value="">เลือกคน</option>${possibleReceiver.map(s => `<option value="${esc205(s.id)}" ${String(receiverValue)===String(s.id)?'selected':''}>${esc205(s.nickname || s.full_name)} (${esc205(s.staff_type || '-')})</option>`).join('')}</select></label>
        <label class="wide">ช่วงที่ขาย <select name="sell_part" id="tradeSellPartSelect">${tradePartOptions205(partValue, slot)}</select><span class="hint">ขายเฉพาะช่วงจะไม่โอนเวรทั้งช่องในตารางหลัก เพื่อป้องกันตารางเพี้ยน</span></label>
        <label id="tradeRateWrap">คิดเรท <select name="rate_mode" id="tradeRateSelect">${tradeRateOptions205(rateValue)}</select><span class="hint">เลือกขายเรท MT หรือขายเรทเคิกโดยตรง แทน Cross-rate อัตโนมัติ</span></label>
        <label id="tradeCustomWrap">จำนวนเงินกำหนดเอง <input name="custom_amount" id="tradeCustomAmount" type="number" min="0" step="1" value="${esc205(customValue)}" placeholder="เช่น 0 หรือ 1000"></label>
        <div class="notice soft-notice wide" id="tradeEstimateV205">กำลังคำนวณ...</div>
        ${selfPaidTradeNotice()}
        <label class="wide">รายละเอียดข้อตกลง <textarea name="note" placeholder="เช่น เบิกผ่าน HR / ไม่คิดเงินใส่ 0 บาท / หมายเหตุเพิ่มเติม">${esc205(stripTradeMarkers205(existingRequest?.note || ''))}</textarea></label>
        <button class="primary-btn wide" type="submit">${editing ? 'บันทึกการแก้ไข' : 'ส่งคำขอให้อีกฝ่ายยืนยัน'}</button>
      </form>`, { large:true });
    setTimeout(() => updateTradeEstimateV205(document.getElementById('dutyTradeForm')), 20);
  };

  function updateTradeEstimateV205(form){
    if (!form) return;
    const slotId = form.querySelector('[name="from_assignment_id"]')?.value || form.dataset.assignmentId;
    const slot = getAssignmentsForMonth(state.monthKey).find(a => String(a.id) === String(slotId)) || state.rosterAssignments.find(a => String(a.id) === String(slotId));
    const receiverId = form.querySelector('[name="receiver_id"]')?.value || slot?.staff_id;
    const requesterId = (isAdmin() ? form.querySelector('[name="requester_id"]')?.value : currentStaffId()) || slot?.staff_id;
    const part = form.querySelector('[name="sell_part"]')?.value || 'full';
    const rateMode = form.querySelector('[name="rate_mode"]')?.value || defaultRateMode205(requesterId, slot);
    const custom = Number(form.querySelector('[name="custom_amount"]')?.value || 0);
    const p = calculateTradePaymentV205(slot, requesterId, receiverId, rateMode, part, custom);
    const el = form.querySelector('#tradeEstimateV205');
    if (el) el.innerHTML = `<b>ประมาณการ:</b> ${esc205(tradePartLabel205(part, slot))} • ${esc205(niceRoleRateLabel(rateMode))} • ชั่วโมงเบิก ${formatHours205(p.adjustedHours || p.hours, 2)} ชม. • เงิน ${formatMoney205(p.amount)}`;
    const customWrap = form.querySelector('#tradeCustomWrap');
    if (customWrap) customWrap.style.display = rateMode === 'custom' ? '' : 'none';
  }

  window.saveTradeRequest = saveTradeRequest = async function saveTradeRequestV205(form){
    const fd = new FormData(form);
    const requestId = fd.get('trade_request_id') || '';
    const fromId = fd.get('from_assignment_id');
    const requesterId = isAdmin() ? fd.get('requester_id') : currentStaffId();
    const receiverId = fd.get('receiver_id');
    const from = getAssignmentsForMonth(state.monthKey).find(a => String(a.id) === String(fromId)) || state.rosterAssignments.find(a => String(a.id) === String(fromId));
    if (!from || !receiverId) return showToast('กรุณาเลือกผู้รับเวรให้ครบ');
    if (isAdmin() && !requesterId) return showToast('Admin ต้องเลือกผู้ขายเวรจาก Dropdown ก่อนบันทึก');
    if (!isAdmin() && String(from.staff_id) !== String(currentStaffId())) return showToast('ส่งคำขอได้เฉพาะเวรของตัวเอง');
    if (String(requesterId) !== String(from.staff_id)) return showToast('ผู้ขายเวรต้องตรงกับเจ้าของเวรเดิมของช่องนี้');
    if (String(receiverId) === String(requesterId)) return showToast('ผู้รับเวรต้องไม่ใช่คนเดียวกับผู้ขายเวร');
    const sellPart = TRADE_PARTS_V205[fd.get('sell_part')] ? String(fd.get('sell_part')) : 'full';
    const rateMode = fd.get('rate_mode') || defaultRateMode205(requesterId, from);
    const custom = Number(fd.get('custom_amount') || 0);
    const p = calculateTradePaymentV205(from, requesterId, receiverId, rateMode, sellPart, custom);
    const amountFrom = rateMode === 'custom' ? custom : p.amount;
    const existing = requestId ? state.tradeRequests.find(x => String(x.id) === String(requestId)) : null;
    const row = {
      requester_id: requesterId,
      receiver_id: receiverId,
      from_assignment_id: fromId,
      to_assignment_id: null,
      trade_type: 'ขายเวร',
      rate_mode: rateMode,
      amount_from: amountFrom,
      amount_to: 0,
      amount_diff: 0,
      status: existing?.status || 'pending',
      note: buildTradeNote205(sellPart, from, fd.get('note') || ''),
      updated_by: currentStaffId()
    };
    let error;
    if (requestId) ({ error } = await sb.from('roster_trade_requests').update(row).eq('id', requestId));
    else ({ error } = await sb.from('roster_trade_requests').insert({ ...row, created_by: currentStaffId() }));
    if (error) return showToast(friendlyDbError(error));
    closeModal();
    await loadAllData();
    renderPage();
    showToast(requestId ? 'แก้ไขคำขอขายเวรแล้ว' : 'ส่งคำขอขายเวรแล้ว รออีกฝ่ายกดยืนยัน');
  };

  window.applyTradeRequest = applyTradeRequest = async function applyTradeRequestV205(id){
    if (!isAdmin()) return showToast('เฉพาะ Admin เท่านั้น');
    const r = state.tradeRequests.find(x => String(x.id) === String(id));
    if (!r || !['pending','confirmed'].includes(r.status)) return showToast('คำขอนี้ยังไม่พร้อมให้บันทึก');
    const from = state.rosterAssignments.find(a => String(a.id) === String(r.from_assignment_id));
    if (!from) return showToast('ไม่พบเวรต้นทาง');
    const sellPart = tradePartFromNote205(r.note);
    const partial = sellPart !== 'full';
    const override = r.status === 'pending';
    if (override && !(await confirmDialog('ยืนยันรายการนี้แบบ Admin Override โดยไม่รอคู่กรณีตอบรับ?', 'Admin Override'))) return;
    const completedPatch = { status:'completed', updated_by:currentStaffId(), confirmed_at:r.confirmed_at || new Date().toISOString() };
    if (override) completedPatch.note = adminOverrideNote(r.note);
    if (!partial) {
      const res = await sb.from('roster_assignments').update({ staff_id:r.receiver_id, updated_by:currentStaffId() }).eq('id', from.id);
      if (res.error) return showToast(friendlyDbError(res.error));
    }
    const { error } = await sb.from('roster_trade_requests').update({ ...completedPatch, trade_type:'ขายเวร', to_assignment_id:null, amount_to:0, amount_diff:0 }).eq('id', id);
    if (error) return showToast(friendlyDbError(error));
    await loadAllData();
    renderPage();
    showToast(partial ? 'บันทึกขายเวรเฉพาะช่วงแล้ว โดยไม่ย้ายเจ้าของเวรทั้งช่อง' : (override ? 'Admin Override และบันทึกขายเวรแล้ว' : 'บันทึกขายเวรแล้ว'));
  };

  document.addEventListener('input', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v205-trade-form="1"]');
    if (!form) return;
    if (['sell_part','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateTradeEstimateV205(form);
  }, true);
  document.addEventListener('change', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v205-trade-form="1"]');
    if (!form) return;
    if (['sell_part','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateTradeEstimateV205(form);
  }, true);

  window.v205OtMoneyAndPartialTrade = {
    staffBaseRate205,
    otCarry205,
    tradePartFromNote205,
    tradePartHours205,
    calculateTradePaymentV205,
    stripTradeMarkers205
  };
  console.info(`[${VERSION_V205}] loaded`);
})();
