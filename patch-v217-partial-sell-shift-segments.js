/* V217: Partial Sell Shift Segment Transfer
   - ปรับช่วงขายเวรเป็น เช้า/บ่าย/ดึก และช่วงรวม 16/24 ชม.
   - ถ้าขายครบชั่วโมงของช่องเวร ให้โอนเจ้าของเวรทั้งช่องตามเดิม
   - ถ้าขายเฉพาะบางช่วง ให้ไม่ย้ายเจ้าของเวรทั้งช่อง แต่ตารางอ่านผลแบบแยกช่วง: ผู้ขายเหลือเฉพาะช่วงที่ยังทำเอง และผู้รับเห็นช่วงที่รับแทน
*/
(function(){
  'use strict';
  const VERSION = 'V217_PARTIAL_SELL_SHIFT_SEGMENTS';
  if (window.__CNMI_V217_PARTIAL_SELL_SHIFT_SEGMENTS__) return;
  window.__CNMI_V217_PARTIAL_SELL_SHIFT_SEGMENTS__ = true;

  const PARTS = {
    full24: { label:'ขาย: เช้า-บ่าย-ดึก', short:'เช้า-บ่าย-ดึก', hours:24, segments:['morning','afternoon','night'] },
    morning_afternoon: { label:'ขาย: เช้า-บ่าย', short:'เช้า-บ่าย', hours:16, segments:['morning','afternoon'] },
    afternoon_night: { label:'ขาย: บ่าย-ดึก', short:'บ่าย-ดึก', hours:16, segments:['afternoon','night'] },
    night_morning: { label:'ขาย: ดึก-เช้า', short:'ดึก-เช้า', hours:16, segments:['night','morning'] },
    morning: { label:'ขาย: เช้า', short:'เช้า', hours:8, segments:['morning'] },
    afternoon: { label:'ขาย: บ่าย', short:'บ่าย', hours:8, segments:['afternoon'] },
    night: { label:'ขาย: ดึก', short:'ดึก', hours:8, segments:['night'] }
  };
  const SEGMENT_ORDER = ['morning','afternoon','night'];
  const SEGMENT_LABEL = { morning:'เช้า', afternoon:'บ่าย', night:'ดึก' };

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(msg, tone){
    try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else window.alert(msg); }
    catch (_) { console.info(msg); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function currentId(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  }
  function admin(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }
  function ordered(list){
    try { return orderedStaff(list || []); }
    catch (_) { return (list || []).slice().sort((a,b)=>String(a?.nickname || a?.full_name || '').localeCompare(String(b?.nickname || b?.full_name || ''), 'th')); }
  }
  function activeRosterStaff(){
    const rows = Array.isArray(state?.staff) ? state.staff : [];
    return ordered(rows.filter(st => {
      try { if (typeof isRosterEnabled === 'function') return isRosterEnabled(st); } catch (_) {}
      return st && st.id && st.is_active !== false && st.active !== false && st.schedule !== false;
    }));
  }
  function labelDuty(code){
    try { return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL?.[code]) || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function sortDuty(code){
    try { return dutySortIndex(code); }
    catch (_) {
      try { return (DUTY_COLUMNS || []).indexOf(code); } catch (_) { return 999; }
    }
  }
  function money(value){
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    const rounded = Math.round(n * 100) / 100;
    return `${rounded.toLocaleString('th-TH', { minimumFractionDigits:Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits:2 })} บ.`;
  }
  function hoursText(value){
    const n = Math.round(Number(value || 0) * 100) / 100;
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  }
  function monthDates(key){
    try { return scheduleMonthDates(key); }
    catch (_) {
      const [y, m] = String(key || state?.monthKey || '').split('-').map(Number);
      const yy = y || new Date().getFullYear();
      const mm = m || (new Date().getMonth() + 1);
      const last = new Date(yy, mm, 0).getDate();
      return Array.from({length:last}, (_,i)=>`${yy}-${String(mm).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
    }
  }
  function assignmentFullHours(a){
    if (!a) return 0;
    try {
      const h = Number(shiftPaymentHoursForCode(a.duty_date, a.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    try {
      const h = Number(dutyHoursForCode(a.duty_date, a.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    return 8;
  }
  function defaultPartFor(a){
    const full = assignmentFullHours(a);
    if (full >= 24) return 'full24';
    if (full >= 16) return 'afternoon_night';
    return 'morning';
  }
  function partFromNote(note, a=null){
    const raw = String(note || '').match(/\[SELL_PART=([a-z_]+)\]/i)?.[1]?.toLowerCase() || '';
    if (PARTS[raw]) return raw;
    if (raw === 'full') return defaultPartFor(a);
    if (raw === 'full24') return 'full24';
    return defaultPartFor(a);
  }
  function partHours(part, a){
    const full = assignmentFullHours(a);
    const key = PARTS[part] ? part : defaultPartFor(a);
    const h = Number(PARTS[key].hours || full || 0);
    return full > 0 ? Math.min(h, full) : h;
  }
  function coversWholeSlot(part, a){
    const full = assignmentFullHours(a);
    return partHours(part, a) >= (full - 0.01);
  }
  function partLabel(part, a){
    const key = PARTS[part] ? part : defaultPartFor(a);
    return `${PARTS[key].label} (${hoursText(partHours(key, a))} ชม.)`;
  }
  function allowedPartOptions(selected, a){
    const full = assignmentFullHours(a);
    const keys = full >= 24
      ? ['full24','morning_afternoon','afternoon_night','night_morning','morning','afternoon','night']
      : full >= 16
        ? ['morning_afternoon','afternoon_night','night_morning','morning','afternoon','night']
        : ['morning'];
    let sel = PARTS[selected] && keys.includes(selected) ? selected : keys[0];
    return keys.map(k => `<option value="${esc(k)}" ${k===sel?'selected':''}>${esc(partLabel(k, a))}</option>`).join('');
  }
  function stripMarkers(note){
    return String(note || '')
      .replace(/\s*\[SELL_PART=[a-z_]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_HOURS=\d+(?:\.\d+)?\]\s*/ig, ' ')
      .replace(/\s*\[SELL_SEGMENTS=[a-z_,]+\]\s*/ig, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function buildNote(part, a, note){
    const clean = stripMarkers(note);
    const cfg = PARTS[part] || PARTS[defaultPartFor(a)];
    const marker = `[SELL_PART=${part}] [SELL_HOURS=${hoursText(partHours(part, a))}] [SELL_SEGMENTS=${(cfg.segments || []).join(',')}]`;
    return clean ? `${marker} ${clean}` : marker;
  }
  function forcedRate(mode, date){
    try {
      if (mode === 'kerk') return dutyRateByType('เคิก', date);
      return dutyRateByType('MT', date);
    } catch (_) {
      const holiday = (() => { try { return isHolidayDate(date); } catch (_) { return false; } })();
      return mode === 'kerk' ? (holiday ? 120 : 90) : (holiday ? 160 : 130);
    }
  }
  function staffTypeFor(staffId, code){
    try { return dutyStaffTypeForRate(staffId, code) || 'MT'; }
    catch (_) {
      const st = (state?.staff || []).find(s => String(s.id) === String(staffId));
      return String(st?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT';
    }
  }
  function defaultRateMode(staffId, a){
    return staffTypeFor(staffId, a?.duty_code) === 'เคิก' ? 'kerk' : 'mt';
  }
  function niceRate(value){
    try { return niceRoleRateLabel(value); }
    catch (_) { return ({ mt:'ขายเรท MT', kerk:'ขายเรทเคิก', custom:'กำหนดจำนวนเงินเอง' }[value] || value || '-'); }
  }
  function calcPayment(a, sellerId, receiverId, rateMode='mt', part=defaultPartFor(a), customAmount=0){
    const h = partHours(part, a);
    const date = a?.duty_date || '';
    if (rateMode === 'custom') return { hours:h, adjustedHours:h, amount:Number(customAmount || 0), rate:0, sellerType:'-', receiverType:'-' };
    if (rateMode === 'kerk' || rateMode === 'mt') {
      const rate = forcedRate(rateMode, date);
      return { hours:h, adjustedHours:h, amount:Math.round(h * rate), rate, sellerType:rateMode === 'kerk' ? 'เคิก' : 'MT', receiverType:rateMode === 'kerk' ? 'เคิก' : 'MT' };
    }
    try {
      if (typeof calculateShiftPayment === 'function') {
        const base = calculateShiftPayment(a, sellerId, receiverId, 'ขายเวร', rateMode);
        const ratio = assignmentFullHours(a) ? h / assignmentFullHours(a) : 1;
        return { ...base, hours:h, adjustedHours:Math.round(Number(base.adjustedHours || h) * ratio * 100) / 100, amount:Math.round(Number(base.amount || 0) * ratio) };
      }
    } catch (_) {}
    const rate = forcedRate('mt', date);
    return { hours:h, adjustedHours:h, amount:Math.round(h * rate), rate, sellerType:'MT', receiverType:'MT' };
  }
  function rateOptions(selected){
    const legacy = (selected === 'receiver' || selected === 'owner') ? `<option value="${esc(selected)}" selected>รายการเดิม: ${esc(niceRate(selected))}</option>` : '';
    return `${legacy}<option value="mt" ${selected==='mt'?'selected':''}>ขายเรท MT</option><option value="kerk" ${selected==='kerk'?'selected':''}>ขายเรทเคิก</option><option value="custom" ${selected==='custom'?'selected':''}>กำหนดจำนวนเงินเอง / 0 บาทได้</option>`;
  }
  function findAssignment(id, list){
    const rows = list || state?.rosterAssignments || [];
    return rows.find(a => String(a?.id || '') === String(id || '')) || null;
  }
  function completedTradesForAssignment(a){
    if (!a?.id) return [];
    return (state?.tradeRequests || [])
      .filter(r => String(r?.status || '') === 'completed' && String(r?.from_assignment_id || '') === String(a.id))
      .map(r => ({ r, part:partFromNote(r?.note, a), hours:partHours(partFromNote(r?.note, a), a) }))
      .filter(x => !coversWholeSlot(x.part, a));
  }
  function activeTradePartsForAssignment(a, excludeRequestId=''){
    if (!a?.id) return [];
    return (state?.tradeRequests || [])
      .filter(r => String(r?.from_assignment_id || '') === String(a.id))
      .filter(r => String(r?.id || '') !== String(excludeRequestId || ''))
      .filter(r => !['rejected','completed_deleted','cancelled','canceled'].includes(String(r?.status || '').toLowerCase()))
      .map(r => ({ r, part:partFromNote(r?.note, a), hours:partHours(partFromNote(r?.note, a), a), segments:PARTS[partFromNote(r?.note, a)]?.segments || [] }))
      .filter(x => !coversWholeSlot(x.part, a));
  }
  function selectedPartConflicts(part, a, excludeRequestId=''){
    const existing = activeTradePartsForAssignment(a, excludeRequestId);
    if (!existing.length) return '';
    if (coversWholeSlot(part, a)) return 'ช่องนี้มีรายการขายบางช่วงอยู่แล้ว กรุณาเลือกขายเฉพาะช่วงที่ยังเหลือ ไม่ควรขายทั้งช่องซ้ำ';
    const segs = new Set(PARTS[part]?.segments || []);
    const hit = existing.find(x => (x.segments || []).some(s => segs.has(s)));
    if (hit) return `ช่วง ${PARTS[hit.part]?.short || hit.part} มีรายการขายอยู่แล้ว กรุณาเลือกช่วงอื่น`;
    return '';
  }
  function segmentLabel(segments){
    const unique = [];
    (segments || []).forEach(s => { if (!unique.includes(s)) unique.push(s); });
    const orderedSegs = SEGMENT_ORDER.filter(s => unique.includes(s));
    if (unique.includes('night') && unique.includes('morning') && !unique.includes('afternoon')) return 'ดึก-เช้า';
    return orderedSegs.map(s => SEGMENT_LABEL[s] || s).join('-') || '-';
  }
  function remainingLabelFor(a, trades){
    const full = assignmentFullHours(a);
    const soldHours = trades.reduce((sum, x) => sum + Number(x.hours || 0), 0);
    const remainHours = Math.max(0, full - soldHours);
    if (remainHours <= 0.01) return '';
    if (full >= 24) {
      const sold = new Set();
      trades.forEach(x => (PARTS[x.part]?.segments || []).forEach(s => sold.add(s)));
      const remainSeg = SEGMENT_ORDER.filter(s => !sold.has(s));
      return remainSeg.length === 3 ? labelDuty(a.duty_code) : segmentLabel(remainSeg);
    }
    return remainHours >= full ? labelDuty(a.duty_code) : `เหลือ ${hoursText(remainHours)} ชม.`;
  }
  function entryLabelForReceived(part, a){
    const cfg = PARTS[part] || PARTS[defaultPartFor(a)];
    return cfg.short || cfg.label || 'รับเวร';
  }
  function effectiveEntriesForStaffDate(staffId, date, assignments){
    const d = normDate(date);
    const rows = [];
    const sourceRows = (assignments || []).filter(a => normDate(a?.duty_date) === d && a?.staff_id);
    sourceRows.forEach(a => {
      const trades = completedTradesForAssignment(a);
      if (String(a.staff_id) === String(staffId)) {
        if (trades.length) {
          const label = remainingLabelFor(a, trades);
          if (label) rows.push({ kind:'owner-remain', assignment:a, label, sort:sortDuty(a.duty_code), className:'v217-remain' });
        } else {
          rows.push({ kind:'owner', assignment:a, label:labelDuty(a.duty_code), sort:sortDuty(a.duty_code), className:'' });
        }
      }
      trades.forEach(x => {
        if (String(x.r?.receiver_id || '') === String(staffId)) {
          rows.push({ kind:'receiver-part', assignment:a, request:x.r, label:entryLabelForReceived(x.part, a), sort:sortDuty(a.duty_code) + 0.1, className:'v217-received' });
        }
      });
    });
    return rows.sort((a,b) => (a.sort - b.sort) || String(a.label).localeCompare(String(b.label), 'th'));
  }
  function tradePartsInSlot(a){
    const trades = completedTradesForAssignment(a);
    if (!trades.length) return null;
    const remain = remainingLabelFor(a, trades);
    return { trades, remain };
  }
  function staffStatAttrs(staffId){ return `data-staff-stat="${esc(staffId)}" type="button"`; }
  function pillFor(staffId, attrs=''){
    try { return staffPill(staffId, { button:true, attrs }); }
    catch (_) { return `<button type="button" ${attrs}>${esc(staffId || '-')}</button>`; }
  }
  function tradeButtonSafe(a){
    try { return renderTradeButton(a); }
    catch (_) { return ''; }
  }

  window.tradePaymentDisplay = function tradePaymentDisplayV217(r, from, to=null){
    const a = from || findAssignment(r?.from_assignment_id) || {};
    const part = partFromNote(r?.note, a);
    const p = calcPayment(a, r?.requester_id, r?.receiver_id, r?.rate_mode || 'mt', part, r?.amount_from || 0);
    const amount = Number(r?.amount_from ?? p.amount ?? 0);
    let html = `${money(amount)}`;
    html += `<br><span class="muted">${esc(partLabel(part, a))} • ชม.เบิก ${hoursText(p.adjustedHours || p.hours)} • ${esc(niceRate(r?.rate_mode || 'mt'))}</span>`;
    if (String(r?.status || '') === 'completed' && !coversWholeSlot(part, a)) html += `<br><span class="badge blue">โอนเฉพาะช่วงในตาราง</span>`;
    if (to && Number(r?.amount_diff || 0)) html += `<br><span class="muted">ส่วนต่าง ${Number(r.amount_diff || 0).toLocaleString()} บ.</span>`;
    return html;
  };
  try { tradePaymentDisplay = window.tradePaymentDisplay; } catch (_) {}

  window.selfPaidTradeNotice = function selfPaidTradeNoticeV217(){
    return `<div class="notice soft-notice wide"><b>เลือกช่วงขายเวรได้</b><br>ถ้าขายครบชั่วโมงของช่องเวร ระบบจะโอนชื่อทั้งช่องให้ผู้รับเวรตามเดิม แต่ถ้าขายเฉพาะช่วง ระบบจะแสดงในตารางเฉพาะช่วงที่ขาย เช่น ผู้ขายเหลือ “บ่าย-ดึก” และผู้รับขึ้น “เช้า” โดยไม่ทำให้ช่องเวรหลักเพี้ยน</div>`;
  };
  try { selfPaidTradeNotice = window.selfPaidTradeNotice; } catch (_) {}

  window.showTradeModal = function showTradeModalV217(assignmentId, existingRequest=null){
    const sourceRows = (() => {
      try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; }
    })();
    const slot = findAssignment(assignmentId, sourceRows) || findAssignment(assignmentId, state?.rosterAssignments || []);
    if (!slot) return toast('ไม่พบเวรนี้ กรุณารีเฟรชหน้า', 'error');
    const editing = !!existingRequest?.id;
    const requesterValue = editing ? existingRequest.requester_id : (admin() ? '' : slot.staff_id);
    const receiverValue = editing ? existingRequest.receiver_id : '';
    const selectedPart = editing ? partFromNote(existingRequest.note, slot) : defaultPartFor(slot);
    const rateValue = editing ? (existingRequest.rate_mode || defaultRateMode(requesterValue || slot.staff_id, slot)) : defaultRateMode(slot.staff_id, slot);
    const customValue = editing && rateValue === 'custom' ? Number(existingRequest.amount_from || 0) : '';
    const staffRows = activeRosterStaff();
    const possibleRequester = staffRows;
    const possibleReceiver = staffRows.filter(s => String(s.id) !== String(slot.staff_id));
    const fullAmount = calcPayment(slot, slot.staff_id, slot.staff_id, defaultRateMode(slot.staff_id, slot), defaultPartFor(slot)).amount;
    const requesterControl = admin()
      ? `<label class="wide">ผู้ขายเวร <select name="requester_id" id="tradeRequesterSelect" required><option value="">เลือกผู้ขายเวร</option>${possibleRequester.map(s => `<option value="${esc(s.id)}" ${String(requesterValue)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)} (${esc(s.staff_type || '-')})</option>`).join('')}</select><span class="hint">ผู้ขายเวรต้องตรงกับเจ้าของเวรเดิมของช่องนี้</span></label>`
      : `<input type="hidden" name="requester_id" value="${esc(slot.staff_id)}">`;
    const body = `<h2>${editing ? 'แก้ไขคำขอขายเวร' : 'ขอขายเวร'}</h2>
      <p class="hint">${formatThaiDate(slot.duty_date)} ${esc(labelDuty(slot.duty_code))} • เจ้าของเวรเดิม ${staffPill(slot.staff_id)} • มูลค่าเต็มช่องประมาณ ${money(fullAmount)}</p>
      <form id="dutyTradeForm" class="form-grid" data-v217-trade-form="1" data-assignment-id="${esc(slot.id)}">
        <input type="hidden" name="from_assignment_id" value="${esc(slot.id)}">
        ${editing ? `<input type="hidden" name="trade_request_id" value="${esc(existingRequest.id)}">` : ''}
        ${requesterControl}
        <label>ประเภท <select name="trade_type" id="tradeTypeSelect"><option value="ขายเวร" selected>ขายเวร / เบิก OT ผ่าน HR</option></select><span class="hint">ระบบนี้ใช้รายการขายเวรเท่านั้น</span></label>
        <label>คนที่จะรับเวร <select name="receiver_id" id="tradeReceiverSelect" required><option value="">เลือกคน</option>${possibleReceiver.map(s => `<option value="${esc(s.id)}" ${String(receiverValue)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)} (${esc(s.staff_type || '-')})</option>`).join('')}</select></label>
        <label class="wide">ช่วงที่ขาย <select name="sell_part" id="tradeSellPartSelect">${allowedPartOptions(selectedPart, slot)}</select><span class="hint">ช3A / ช3B / ช9 และช่อง 8 ชม. จะใช้ตัวเลือก “ขาย: เช้า (8 ชม.)”</span></label>
        <label id="tradeRateWrap">คิดเรท <select name="rate_mode" id="tradeRateSelect">${rateOptions(rateValue)}</select><span class="hint">เลือกขายเรท MT หรือขายเรทเคิกโดยตรง</span></label>
        <label id="tradeCustomWrap">จำนวนเงินกำหนดเอง <input name="custom_amount" id="tradeCustomAmount" type="number" min="0" step="1" value="${esc(customValue)}" placeholder="เช่น 0 หรือ 1000"></label>
        <div class="notice soft-notice wide" id="tradeEstimateV217">กำลังคำนวณ...</div>
        ${window.selfPaidTradeNotice()}
        <label class="wide">รายละเอียดข้อตกลง <textarea name="note" placeholder="เช่น เบิกผ่าน HR / ไม่คิดเงินใส่ 0 บาท / หมายเหตุเพิ่มเติม">${esc(stripMarkers(existingRequest?.note || ''))}</textarea></label>
        <button class="primary-btn wide" type="submit">${editing ? 'บันทึกการแก้ไข' : 'ส่งคำขอให้อีกฝ่ายยืนยัน'}</button>
      </form>`;
    try { showModal(body, { large:true }); } catch (_) { document.body.insertAdjacentHTML('beforeend', body); }
    setTimeout(() => updateEstimate(document.getElementById('dutyTradeForm')), 20);
  };
  try { showTradeModal = window.showTradeModal; } catch (_) {}

  function updateEstimate(form){
    if (!form) return;
    const slotId = form.querySelector('[name="from_assignment_id"]')?.value || form.dataset.assignmentId;
    const sourceRows = (() => { try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    const slot = findAssignment(slotId, sourceRows) || findAssignment(slotId);
    if (!slot) return;
    const requesterId = (admin() ? form.querySelector('[name="requester_id"]')?.value : currentId()) || slot.staff_id;
    const receiverId = form.querySelector('[name="receiver_id"]')?.value || slot.staff_id;
    const part = form.querySelector('[name="sell_part"]')?.value || defaultPartFor(slot);
    const rateMode = form.querySelector('[name="rate_mode"]')?.value || defaultRateMode(requesterId, slot);
    const custom = Number(form.querySelector('[name="custom_amount"]')?.value || 0);
    const p = calcPayment(slot, requesterId, receiverId, rateMode, part, custom);
    const el = form.querySelector('#tradeEstimateV217') || form.querySelector('#tradeEstimateV205');
    const actionText = coversWholeSlot(part, slot) ? 'บันทึกแล้วจะโอนชื่อทั้งช่องให้ผู้รับเวร' : 'บันทึกแล้วจะโอนเฉพาะช่วงในตาราง ผู้ขายยังเหลือช่วงที่ไม่ได้ขาย';
    if (el) el.innerHTML = `<b>ประมาณการ:</b> ${esc(partLabel(part, slot))} • ${esc(niceRate(rateMode))} • ชั่วโมงเบิก ${hoursText(p.adjustedHours || p.hours)} ชม. • เงิน ${money(p.amount)}<br><span class="muted">${esc(actionText)}</span>`;
    const customWrap = form.querySelector('#tradeCustomWrap');
    if (customWrap) customWrap.style.display = rateMode === 'custom' ? '' : 'none';
  }

  window.saveTradeRequest = async function saveTradeRequestV217(form){
    const fd = new FormData(form);
    const requestId = fd.get('trade_request_id') || '';
    const fromId = fd.get('from_assignment_id');
    const sourceRows = (() => { try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    const from = findAssignment(fromId, sourceRows) || findAssignment(fromId);
    const requesterId = admin() ? fd.get('requester_id') : currentId();
    const receiverId = fd.get('receiver_id');
    if (!from || !receiverId) return toast('กรุณาเลือกผู้รับเวรให้ครบ', 'error');
    if (admin() && !requesterId) return toast('Admin ต้องเลือกผู้ขายเวรก่อนบันทึก', 'error');
    if (!admin() && String(from.staff_id) !== String(currentId())) return toast('ส่งคำขอได้เฉพาะเวรของตัวเอง', 'error');
    if (String(requesterId) !== String(from.staff_id)) return toast('ผู้ขายเวรต้องตรงกับเจ้าของเวรเดิมของช่องนี้', 'error');
    if (String(receiverId) === String(requesterId)) return toast('ผู้รับเวรต้องไม่ใช่คนเดียวกับผู้ขายเวร', 'error');
    const selected = fd.get('sell_part');
    const sellPart = PARTS[selected] ? String(selected) : defaultPartFor(from);
    const conflict = selectedPartConflicts(sellPart, from, requestId);
    if (conflict) return toast(conflict, 'error');
    const rateMode = fd.get('rate_mode') || defaultRateMode(requesterId, from);
    const custom = Number(fd.get('custom_amount') || 0);
    const p = calcPayment(from, requesterId, receiverId, rateMode, sellPart, custom);
    const amountFrom = rateMode === 'custom' ? custom : p.amount;
    const existing = requestId ? (state?.tradeRequests || []).find(x => String(x.id) === String(requestId)) : null;
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
      note: buildNote(sellPart, from, fd.get('note') || ''),
      updated_by: currentId()
    };
    let error;
    if (requestId) ({ error } = await sb.from('roster_trade_requests').update(row).eq('id', requestId));
    else ({ error } = await sb.from('roster_trade_requests').insert({ ...row, created_by: currentId() }));
    if (error) return toast(friendlyDbError(error), 'error');
    try { closeModal(); } catch (_) {}
    try { await loadAllData(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(requestId ? 'แก้ไขคำขอขายเวรแล้ว' : 'ส่งคำขอขายเวรแล้ว รออีกฝ่ายกดยืนยัน');
  };
  try { saveTradeRequest = window.saveTradeRequest; } catch (_) {}

  window.applyTradeRequest = async function applyTradeRequestV217(id){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const r = (state?.tradeRequests || []).find(x => String(x.id) === String(id));
    if (!r || !['pending','confirmed'].includes(String(r.status || ''))) return toast('คำขอนี้ยังไม่พร้อมให้บันทึก', 'error');
    const from = findAssignment(r.from_assignment_id);
    if (!from) return toast('ไม่พบเวรต้นทาง', 'error');
    const part = partFromNote(r.note, from);
    const isWhole = coversWholeSlot(part, from);
    const override = String(r.status || '') === 'pending';
    if (override) {
      let ok = false;
      try { ok = await confirmDialog('ยืนยันรายการนี้แบบ Admin Override โดยไม่รอคู่กรณีตอบรับ?', 'Admin Override'); }
      catch (_) { ok = window.confirm('ยืนยันรายการนี้แบบ Admin Override โดยไม่รอคู่กรณีตอบรับ?'); }
      if (!ok) return;
    }
    const completedPatch = { status:'completed', updated_by:currentId(), confirmed_at:r.confirmed_at || new Date().toISOString() };
    if (override) {
      try { completedPatch.note = adminOverrideNote(r.note); }
      catch (_) { completedPatch.note = `${r.note || ''} [ADMIN_OVERRIDE]`.trim(); }
    }
    if (isWhole) {
      const res = await sb.from('roster_assignments').update({ staff_id:r.receiver_id, updated_by:currentId() }).eq('id', from.id);
      if (res.error) return toast(friendlyDbError(res.error), 'error');
    }
    const { error } = await sb.from('roster_trade_requests').update({ ...completedPatch, trade_type:'ขายเวร', to_assignment_id:null, amount_to:0, amount_diff:0 }).eq('id', id);
    if (error) return toast(friendlyDbError(error), 'error');
    try { await loadAllData(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(isWhole ? (override ? 'Admin Override และบันทึกขายเวรแล้ว' : 'บันทึกขายเวรแล้ว') : 'บันทึกขายเวรเฉพาะช่วงแล้ว ตารางจะแสดงเฉพาะช่วงที่โอนให้ผู้รับเวร');
  };
  try { applyTradeRequest = window.applyTradeRequest; } catch (_) {}

  window.selfPaidDutyProxyOptions = function selfPaidDutyProxyOptionsV217(date=todayStr()){
    const d = normDate(date);
    const me = currentId();
    return (state?.tradeRequests || []).filter(r => String(r?.status || '') === 'completed' && String(r?.receiver_id || '') === String(me)).map(r => {
      const a = findAssignment(r.from_assignment_id);
      if (!a || normDate(a.duty_date) !== d) return null;
      const part = partFromNote(r.note, a);
      if (coversWholeSlot(part, a)) return null;
      return { request:r, assignment:{ ...a, staff_id:r.receiver_id, _original_staff_id:r.requester_id, _sell_part:part, _sell_label:entryLabelForReceived(part, a) } };
    }).filter(Boolean);
  };
  try { selfPaidDutyProxyOptions = window.selfPaidDutyProxyOptions; } catch (_) {}

  window.scheduleShiftButton = function scheduleShiftButtonV217(slot){
    if (!slot?.staff_id) return '';
    const split = tradePartsInSlot(slot);
    if (!split) return `<div class="schedule-person-cell">${pillFor(slot.staff_id, staffStatAttrs(slot.staff_id))}${tradeButtonSafe(slot)}</div>`;
    const lines = [];
    if (split.remain) lines.push(`<span class="v217-split-line v217-remain"><b>${esc(split.remain)}</b>${pillFor(slot.staff_id, staffStatAttrs(slot.staff_id))}</span>`);
    split.trades.forEach(x => {
      const label = entryLabelForReceived(x.part, slot);
      lines.push(`<span class="v217-split-line v217-received"><b>${esc(label)}</b>${pillFor(x.r.receiver_id, staffStatAttrs(x.r.receiver_id))}</span>`);
    });
    return `<div class="schedule-person-cell v217-split-cell">${lines.join('')}${tradeButtonSafe(slot)}</div>`;
  };
  try { scheduleShiftButton = window.scheduleShiftButton; } catch (_) {}

  const oldRenderCalendarCardView = window.renderCalendarCardView || (typeof renderCalendarCardView === 'function' ? renderCalendarCardView : null);
  window.renderCalendarCardView = function renderCalendarCardViewV217(staffList, assignments, key=state.monthKey){
    const dates = monthDates(key);
    const mobile = (() => { try { return isMobileView(); } catch (_) { return false; } })();
    const defaultDate = todayStr().startsWith(key) ? todayStr() : dates[0];
    const selectedDate = dates.includes(state.scheduleSelectedDate) ? state.scheduleSelectedDate : defaultDate;
    const visibleDates = mobile ? [selectedDate] : dates;
    const controls = mobile ? `<div class="single-day-control no-print"><label>เลือกวันที่ <input type="date" id="scheduleSelectedDate" min="${esc(dates[0])}" max="${esc(dates[dates.length-1])}" value="${esc(selectedDate)}"></label><button class="tiny-btn" data-schedule-today>วันนี้</button></div>` : '';
    return `${controls}<div class="clean-calendar-cards ${mobile ? 'single-day-cards' : ''}">${visibleDates.map(date => {
      const d = parseDate(date);
      const rows = (assignments || []).filter(a => normDate(a.duty_date) === date && a.staff_id).sort((a,b)=>sortDuty(a.duty_code)-sortDuty(b.duty_code));
      const dayOff = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
      return `<section class="clean-day-card ${dayOff ? 'is-offday' : ''}">
        <div class="clean-day-head"><b>${d.getDate()}</b><span>${d.toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short' })}</span>${(() => { try { return isHolidayDate(date) ? badge(holidayName(date), 'yellow') : ''; } catch (_) { return ''; } })()}</div>
        ${rows.length ? rows.map(a => `<div class="clean-day-line"><span>${esc(labelDuty(a.duty_code))}</span>${window.scheduleShiftButton(a)}</div>`).join('') : '<span class="muted">ไม่มีเวร</span>'}
      </section>`;
    }).join('')}</div>`;
  };
  try { renderCalendarCardView = window.renderCalendarCardView; } catch (_) { if (!oldRenderCalendarCardView) {} }

  window.renderPersonView = function renderPersonViewV217(staffList, assignments, key=state.monthKey){
    const selectedId = state.schedulePersonFilter || staffList?.[0]?.id || '';
    const selected = (staffList || []).find(st => String(st.id) === String(selectedId)) || staffList?.[0];
    const renderCard = (st) => {
      const rows = monthDates(key).flatMap(date => effectiveEntriesForStaffDate(st?.id, date, assignments));
      return `<section class="clean-person-card" style="--staff-bg:${staffColor(st)};--staff-fg:${textColorFor(staffColor(st))}">
        <button type="button" class="clean-person-head" data-staff-stat="${esc(st?.id)}"><b>${esc(st?.nickname || st?.full_name || '-')}</b><span>${rows.length} รายการ</span></button>
        ${rows.length ? rows.map(e => `<div class="clean-person-duty ${esc(e.className || '')}"><span>${formatThaiDate(e.assignment?.duty_date)}</span><b>${esc(e.label)}</b>${e.kind === 'owner' || e.kind === 'owner-remain' ? tradeButtonSafe(e.assignment) : '<span class="badge blue">รับช่วงขายเวร</span>'}</div>`).join('') : '<span class="muted">ไม่มีเวรเดือนนี้</span>'}
      </section>`;
    };
    return `<div class="person-filter-mobile no-print"><label>เลือกเจ้าหน้าที่ <select id="schedulePersonFilter">${(staffList || []).map(st => `<option value="${esc(st.id)}" ${String(selected?.id)===String(st.id)?'selected':''}>${esc(st.nickname || st.full_name || '-')}</option>`).join('')}</select></label></div>
    <div class="clean-person-mobile-result">${selected ? renderCard(selected) : empty('ไม่มีเจ้าหน้าที่')}</div>
    <div class="clean-person-list">${(staffList || []).map(renderCard).join('')}</div>`;
  };
  try { renderPersonView = window.renderPersonView; } catch (_) {}

  window.renderGridView = function renderGridViewV217(staffList, assignments, key=state.monthKey){
    const dates = monthDates(key);
    return `<div class="table-wrap clean-grid-wrap"><table id="scheduleTable" class="clean-schedule-grid"><thead><tr><th class="clean-sticky-col">เจ้าหน้าที่</th>${dates.map(date => {
      const d = parseDate(date);
      const off = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
      return `<th class="${off ? 'offday-col' : ''}">${d.getDate()}<br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('')}</tr></thead><tbody>${(staffList || []).map(st => {
      const bg = staffColor(st);
      const fg = textColorFor(bg);
      return `<tr><th class="clean-sticky-col clean-staff-cell" style="--staff-bg:${bg};--staff-fg:${fg}"><button type="button" data-staff-stat="${esc(st.id)}">${esc(st.nickname || st.full_name || '-')}</button></th>${dates.map(date => {
        const shifts = effectiveEntriesForStaffDate(st.id, date, assignments);
        const off = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
        const leave = (() => { try { return activeLeaveRecordOn(st.id, date); } catch (_) { return null; } })();
        const leaveCls = leave ? (() => { try { return leaveCellClass(leaveDisplayType(leave)); } catch (_) { return ''; } })() : '';
        const leaveBadge = leave ? (() => { try { return leaveCellBadge(leave); } catch (_) { return '<span class="badge yellow">ลา</span>'; } })() : '';
        const pills = shifts.map(e => {
          const attrs = (e.kind === 'owner' || e.kind === 'owner-remain') && (() => { try { return canRequestTrade(e.assignment); } catch (_) { return false; } })()
            ? `data-trade-duty="${esc(e.assignment.id)}"`
            : `data-staff-stat="${esc(st.id)}"`;
          return `<button type="button" class="clean-shift-pill ${esc(e.className || '')}" style="--staff-bg:${bg};--staff-fg:${fg}" ${attrs}>${esc(e.label)}</button>`;
        }).join('');
        return `<td class="${off ? 'offday-col' : ''} ${leaveCls}"><div class="clean-cell-stack">${leaveBadge}${pills || (off && !leave ? '<span class="muted">หยุด</span>' : '')}</div></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
  };
  try { renderGridView = window.renderGridView; } catch (_) {}

  window.renderReadOnlySchedule = function renderReadOnlyScheduleV217(assignments){
    const staffList = (() => { try { return scheduleStaffList(); } catch (_) { return activeRosterStaff(); } })();
    const rows = assignments || (() => { try { return scheduleAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    return window.renderGridView(staffList, rows, state.monthKey);
  };
  try { renderReadOnlySchedule = window.renderReadOnlySchedule; } catch (_) {}

  const oldShowStaffStats = window.showStaffStats || (typeof showStaffStats === 'function' ? showStaffStats : null);
  window.showStaffStats = function showStaffStatsV217(staffId){
    try {
      const assignments = (() => { try { return scheduleAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
      const rows = monthDates(state.monthKey).flatMap(date => effectiveEntriesForStaffDate(staffId, date, assignments));
      const detail = rows.map(e => `<tr><td>${formatThaiDate(e.assignment?.duty_date)}</td><td>${esc(e.label)}</td><td>${e.kind === 'receiver-part' ? 'รับช่วงขายเวร' : 'เจ้าของเวร/ช่วงคงเหลือ'}</td></tr>`).join('');
      showModal(`<h2>${staffPill(staffId)}</h2><p class="hint">ตารางนี้แสดงผลหลังหักรายการขายเวรเฉพาะช่วงแล้ว</p><div class="compact-detail-table"><table><thead><tr><th>วันที่</th><th>เวร/ช่วง</th><th>สถานะ</th></tr></thead><tbody>${detail || '<tr><td colspan="3">ยังไม่มีเวรในเดือนนี้</td></tr>'}</tbody></table></div>`);
    } catch (err) {
      if (oldShowStaffStats) return oldShowStaffStats.apply(this, arguments);
      console.warn(`${VERSION}: showStaffStats failed`, err);
    }
  };
  try { showStaffStats = window.showStaffStats; } catch (_) {}

  document.addEventListener('input', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v217-trade-form="1"]');
    if (!form) return;
    if (['sell_part','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateEstimate(form);
  }, true);
  document.addEventListener('change', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v217-trade-form="1"]');
    if (!form) return;
    if (['sell_part','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateEstimate(form);
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v217-split-cell{display:flex;flex-direction:column;gap:6px;align-items:stretch}.v217-split-line{display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid rgba(37,99,235,.18);border-radius:12px;padding:4px 6px;background:#fff}.v217-split-line>b{font-size:12px;white-space:nowrap}.v217-split-line.v217-received{background:#eef8ff;border-color:#bfe4ff}.v217-split-line.v217-remain{background:#fffdf4;border-color:#f7e6a1}.clean-shift-pill.v217-received{outline:2px solid rgba(14,165,233,.35);background:#e0f2fe!important;color:#075985!important}.clean-shift-pill.v217-remain{outline:2px solid rgba(234,179,8,.35)}.clean-person-duty.v217-received{background:#eef8ff;border-radius:12px;padding:6px 8px}.clean-person-duty.v217-remain{background:#fffdf4;border-radius:12px;padding:6px 8px}
  `;
  document.head.appendChild(style);

  window.cnmiTradeSegmentsV217 = { PARTS, partFromNote, partHours, coversWholeSlot, effectiveEntriesForStaffDate };
  console.info(`${VERSION} loaded`);
})();
