/* =========================
   V236 OT Admin Tracking + CH4 Status + HR Cycle Export UX Fix
   - Admin can filter and follow duty confirmation / OT / CH4 status by staff and status.
   - CH4 supports: self, covered by other, no claim/no blood spinning.
   - HR Export separates all Pending from Ready-to-Export in selected 16-15 cycle.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V236_OT_ADMIN_CH4_HR_CYCLE_UX_FIX';
  if (window.__CNMI_V234_OT_ADMIN_CH4_HR_CYCLE__) return;
  window.__CNMI_V234_OT_ADMIN_CH4_HR_CYCLE__ = true;

  const CH4_TABLE = 'shift_confirmations';
  const DUTY_STATUS_OPTIONS = [
    ['','ทุกสถานะ'],
    ['ยังไม่ยืนยัน','ยังไม่ยืนยัน'],
    ['ยืนยันแล้ว','ยืนยันแล้ว'],
    ['ทำ ช4 เอง','ทำ ช4 เอง'],
    ['มีคนอยู่แทน','มีคนอยู่แทน'],
    ['ไม่เบิก','ไม่เบิก / ไม่มีปั่นเลือด'],
    ['รออนุมัติ','รออนุมัติ / ขอ OT แล้ว'],
    ['อนุมัติแล้ว','อนุมัติแล้ว'],
    ['ไม่อนุมัติ','ไม่อนุมัติ'],
    ['ส่งกลับแก้ไข','ส่งกลับแก้ไข']
  ];

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  const previousRenderOtSummary = window.renderOtSummary || (typeof renderOtSummary === 'function' ? renderOtSummary : null);

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function todayKey(){
    try { return todayStr(); }
    catch (_) { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  }
  function currentMonth(){
    try { return monthKey(new Date()); }
    catch (_) { return todayKey().slice(0, 7); }
  }
  function addDays(dateKey, n){
    const d = new Date(`${normDate(dateKey)}T00:00:00`);
    d.setDate(d.getDate() + Number(n || 0));
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function hrCycleRange(month){
    const key = String(month || state.hrExportMonthV234 || state.monthKey || currentMonth()).slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    const start = `${y}-${pad2(m)}-16`;
    const endDate = new Date(y, m, 15); // JS month is 0-indexed; m = next month from selected month
    const end = `${endDate.getFullYear()}-${pad2(endDate.getMonth()+1)}-${pad2(endDate.getDate())}`;
    return { start, end, month:key };
  }
  function dateList(start, end){
    const out = [];
    let d = normDate(start);
    const stop = normDate(end);
    let guard = 0;
    while (d && d <= stop && guard++ < 80) { out.push(d); d = addDays(d, 1); }
    return out;
  }
  function fmtDate(dateKey){
    try { return formatThaiDate(normDate(dateKey)); }
    catch (_) { return normDate(dateKey) || '-'; }
  }
  function fmtDateTime(value){
    try { return value ? new Date(value).toLocaleString('th-TH') : '-'; }
    catch (_) { return value || '-'; }
  }
  function isAdminSafe(){ try { return !!isAdmin(); } catch (_) { return false; } }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  }
  function staffRecord(staffId){ return (state.staff || []).find(s => String(s.id) === String(staffId)) || null; }
  function staffName(staffId){
    try { return staffNick(staffId); }
    catch (_) { const s = staffRecord(staffId) || {}; return s.nickname || s.full_name || s.email || staffId || '-'; }
  }
  function staffPillSafe(staffId){
    try { return staffPill(staffId); }
    catch (_) { return `<span class="staff-pill">${esc(staffName(staffId))}</span>`; }
  }
  function badgeSafe(text, cls){
    try { return badge(text, cls || statusClass(text)); }
    catch (_) { return `<span class="badge ${esc(cls || statusClass(text))}">${esc(text)}</span>`; }
  }
  function emptySafe(text){
    try { return empty(text); }
    catch (_) { return `<div class="empty">${esc(text)}</div>`; }
  }
  function statusClass(text){
    const s = String(text || '');
    if (/อนุมัติแล้ว|ยืนยันแล้ว|ทำ ช4 เอง|มีคนอยู่แทน/.test(s)) return 'green';
    if (/ไม่อนุมัติ|ส่งกลับ|ตีกลับ/.test(s)) return 'red';
    if (/ยังไม่|รอ|ขอ OT|ต้อง/.test(s)) return 'orange';
    if (/ไม่เบิก|ไม่มีปั่น/.test(s)) return 'black';
    return 'blue';
  }
  function formatHours(v, digits=2){
    const n = Math.round(Number(v || 0) * Math.pow(10, digits)) / Math.pow(10, digits);
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');
  }
  function formatMoney(v){
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    return `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.`;
  }
  function dutyLabel(code){
    try { return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL?.[code]) || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function isAttendanceReason(row){ return String(row?.reason || '').includes('ยืนยันอยู่เวร'); }
  function isCh4(code){ return ['ช4','ช4A','ช4B','ช4-MT'].includes(String(code || '').trim()); }
  function isManualDuty(code){ return isCh4(code) || ['ช3A','ช3B'].includes(String(code || '').trim()); }
  function isAutoDuty(code){ return !!String(code || '').trim() && !isManualDuty(code); }
  function orderedStaffSafe(list){
    try { return orderedStaff(list || []); }
    catch (_) { return (list || []).slice().sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function activeStaff(){
    const list = (state.staff || []).filter(s => {
      const activeOk = Object.prototype.hasOwnProperty.call(s, 'active') ? (s.active === true || String(s.active).toLowerCase() === 'true') : (s.is_active !== false && String(s.is_active).toLowerCase() !== 'false');
      const scheduleOk = Object.prototype.hasOwnProperty.call(s, 'schedule') ? (s.schedule === true || String(s.schedule).toLowerCase() === 'true') : true;
      const role = String(s.role || s.position || '').toLowerCase();
      return activeOk && scheduleOk && !role.includes('physician') && !String(s.staff_type || '').includes('แพทย์');
    });
    return orderedStaffSafe(list);
  }
  function staffOptions(selected='', includeAll=false){
    const base = includeAll ? '<option value="">ทุกคน</option>' : '<option value="">เลือกชื่อ</option>';
    return base + activeStaff().map(s => `<option value="${esc(s.id)}" ${String(s.id)===String(selected || '')?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('');
  }
  function dutyOptions(selected=''){
    const codes = (typeof DUTY_COLUMNS !== 'undefined' && Array.isArray(DUTY_COLUMNS)) ? DUTY_COLUMNS : ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT'];
    return codes.map(code => `<option value="${esc(code)}" ${String(code)===String(selected)?'selected':''}>${esc(dutyLabel(code))}</option>`).join('');
  }
  function reasonOptions(){
    const rawReasons = window.OT_REASONS || (typeof OT_REASONS !== 'undefined' ? OT_REASONS : null);
    const reasons = Array.isArray(rawReasons) ? rawReasons : ['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','อื่นๆ'];
    return reasons.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  }
  function canViewCh4Month(staffId){
    if (isAdminSafe()) return true;
    const s = staffRecord(staffId) || {};
    const nick = String(s.nickname || s.full_name || '').trim();
    const type = String(s.staff_type || s.type || '').trim();
    try { if (typeof isTangStaff === 'function' && isTangStaff(staffId)) return true; } catch (_) {}
    return type !== 'เคิก' || /แตง/.test(nick);
  }
  function confirmationRows(){ return Array.isArray(state.shiftConfirmations) ? state.shiftConfirmations : []; }
  function assignmentKey(a){
    return [a?.id || '', normDate(a?.duty_date), a?.staff_id || '', a?.duty_code || ''].map(x => String(x || '').replace(/\|/g, '')).join('|');
  }
  function findAssignmentFromKey(key){
    const [id, date, staffId, dutyCode] = String(key || '').split('|');
    return (state.rosterAssignments || []).find(a => {
      if (id && String(a?.id || '') === id) return true;
      return normDate(a?.duty_date) === date && String(a?.staff_id || '') === staffId && String(a?.duty_code || '') === dutyCode;
    }) || null;
  }
  function confirmationFor(a){
    const date = normDate(a?.duty_date || a?.work_date);
    const owner = String(a?.staff_id || a?.owner_staff_id || '');
    const code = String(a?.duty_code || a?.shift_type || '');
    const aid = String(a?.id || a?.roster_assignment_id || '');
    return confirmationRows().slice().sort((x,y) => String(y?.updated_at || y?.confirmed_at || y?.covered_at || '').localeCompare(String(x?.updated_at || x?.confirmed_at || x?.covered_at || ''))).find(r => {
      const rDate = normDate(r?.work_date || r?.duty_date);
      const rOwner = String(r?.owner_staff_id || r?.staff_id || '');
      const rCode = String(r?.duty_code || r?.shift_type || '');
      const rAid = String(r?.roster_assignment_id || '');
      if (aid && rAid && rAid === aid) return true;
      return rDate === date && rOwner === owner && (rCode === code || (isCh4(rCode) && isCh4(code)));
    }) || null;
  }
  function attendanceRows(staffId, date){
    const d = normDate(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && normDate(a?.duty_date) === d);
  }
  function otRowsFor(staffId, date, mode='all'){
    const d = normDate(date);
    return (state.otRequests || []).filter(r => {
      if (String(r?.staff_id || '') !== String(staffId || '') || normDate(r?.work_date) !== d) return false;
      if (mode === 'attendance') return isAttendanceReason(r);
      if (mode === 'extra') return !isAttendanceReason(r);
      return true;
    }).sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  }
  function latest(rows){ return (rows || [])[0] || null; }
  function normalizeOtStatus(row){
    const s = String(row?.status || '').trim().toLowerCase();
    if (s === 'อนุมัติ' || s === 'approved') return 'อนุมัติแล้ว';
    if (s === 'ไม่อนุมัติ' || s === 'rejected') return 'ไม่อนุมัติ';
    if (s === 'ส่งกลับแก้ไข' || s === 'returned') return 'ส่งกลับแก้ไข';
    if (row) return 'รออนุมัติ';
    return '';
  }
  function cleanReasonText(text){
    return String(text || '')
      .replace(/\s*\|\s*V\d+[A-Z0-9_\-]*/gi, '')
      .replace(/\s*\|\s*/g, ' · ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function shortText(text, max=120){
    const t = cleanReasonText(text);
    return t.length > max ? `${t.slice(0, Math.max(0, max - 1))}…` : t;
  }
  function requestHours(row){
    if (!row) return 0;
    try {
      const n = normalizeHours(row);
      if (n && Number.isFinite(Number(n.actualHours)) && Number(n.actualHours) > 0) return Number(n.actualHours);
      if (n && Number.isFinite(Number(n.hrHours)) && Number(n.hrHours) > 0) return Number(n.hrHours);
    } catch (_) {}
    try {
      const h = Number(calcOtHours(row) || 0);
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    const raw = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0);
    return Number.isFinite(raw) ? raw : 0;
  }
  function otRowsRanked(staffId, date, mode='all'){
    const score = r => {
      const st = normalizeOtStatus(r);
      if (st === 'อนุมัติแล้ว') return 5;
      if (st === 'รออนุมัติ') return 4;
      if (st === 'ส่งกลับแก้ไข') return 3;
      if (st === 'ไม่อนุมัติ') return 2;
      return 1;
    };
    return otRowsFor(staffId, date, mode).slice().sort((a,b) => score(b) - score(a) || String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  }
  function anyOtStatus(staffId, date){
    const rows = otRowsRanked(staffId, date, 'all');
    if (!rows.length) return { text:'', category:'', row:null };
    const row = rows[0];
    const st = normalizeOtStatus(row);
    if (st === 'รออนุมัติ') return { text:'ยืนยันแล้ว / รออนุมัติ', category:'รออนุมัติ', row };
    return { text:st || 'ยืนยันแล้ว', category:st || 'ยืนยันแล้ว', row };
  }
  function confirmationRowsCoveredBy(staffId, date){
    const d = normDate(date);
    return confirmationRows().filter(r => {
      const st = String(r?.status || '').trim();
      return st === 'covered_by_other' && String(r?.covered_by_staff_id || '') === String(staffId || '') && normDate(r?.work_date || r?.duty_date) === d;
    }).sort((a,b) => staffName(a?.owner_staff_id || a?.staff_id).localeCompare(staffName(b?.owner_staff_id || b?.staff_id), 'th'));
  }
  function ownerAssignmentForConfirmation(rec){
    const d = normDate(rec?.work_date || rec?.duty_date);
    const owner = String(rec?.owner_staff_id || rec?.staff_id || '');
    const aid = String(rec?.roster_assignment_id || '');
    return (state.rosterAssignments || []).find(a => {
      if (aid && String(a?.id || '') === aid) return true;
      return normDate(a?.duty_date) === d && String(a?.staff_id || '') === owner && isCh4(a?.duty_code);
    }) || null;
  }
  function formatOtLine(row, prefix='OT'){
    if (!row) return '';
    const st = normalizeOtStatus(row) || 'รออนุมัติ';
    const h = requestHours(row);
    const reason = shortText(row.reason || row.note || '-', 140);
    const note = shortText(row.note || '', 100);
    return `<div class="v236-note-line"><span class="v236-note-status ${esc(statusClass(st))}">${esc(st)}</span><span><b>${esc(prefix)}</b>${h ? ` ${esc(formatHours(h, 2))} ชม.` : ''}${reason ? ` · ${esc(reason)}` : ''}${note && note !== reason ? `<br><span class="muted">${esc(note)}</span>` : ''}</span></div>`;
  }
  function buildDutyNoteCell(a, info, staffIdForCovered=''){
    const d = normDate(a?.duty_date || a?.work_date);
    const owner = String(staffIdForCovered || a?.staff_id || '');
    const lines = [];
    const rec = info?.rec || confirmationFor(a);
    if (rec) {
      if (String(rec.status || '') === 'covered_by_other') {
        lines.push(`<div class="v236-note-line"><span class="v236-note-status green">ช4</span><span>มีคนอยู่แทน: <b>${esc(staffName(rec.covered_by_staff_id))}</b>${rec.covered_note || rec.note ? ` · ${esc(shortText(rec.covered_note || rec.note, 120))}` : ''}</span></div>`);
      } else if (rec.note || rec.covered_note) {
        lines.push(`<div class="v236-note-line"><span class="v236-note-status blue">ช4</span><span>${esc(shortText(rec.note || rec.covered_note, 120))}</span></div>`);
      }
    }
    confirmationRowsCoveredBy(owner, d).forEach(c => {
      const fromId = c.owner_staff_id || c.staff_id;
      const ot = latest(otRowsRanked(owner, d, 'extra')) || latest(otRowsRanked(owner, d, 'all'));
      const h = ot ? requestHours(ot) : 0;
      lines.push(`<div class="v236-note-line"><span class="v236-note-status green">แทน</span><span>รับ ช4 แทน <b>${esc(staffName(fromId))}</b>${h ? ` · เบิก ${esc(formatHours(h, 2))} ชม.` : ''}</span></div>`);
    });
    const rows = otRowsRanked(owner, d, 'all');
    rows.slice(0, 3).forEach(r => lines.push(formatOtLine(r, isAttendanceReason(r) ? 'ยืนยันเวร' : 'OT')));
    if (rows.length > 3) lines.push(`<div class="v236-note-line muted">มีรายการ OT เพิ่มอีก ${rows.length - 3} รายการ</div>`);
    return `<div class="v236-note-cell">${lines.filter(Boolean).join('') || '<span class="muted">-</span>'}</div>`;
  }
  function extraOtStatus(staffId, date){
    const rows = otRowsFor(staffId, date, 'extra');
    if (!rows.length) return { text:'', category:'', row:null };
    if (rows.some(r => normalizeOtStatus(r) === 'อนุมัติแล้ว')) return { text:'อนุมัติแล้ว', category:'อนุมัติแล้ว', row:rows.find(r => normalizeOtStatus(r) === 'อนุมัติแล้ว') };
    const row = rows[0];
    const st = normalizeOtStatus(row);
    if (st === 'รออนุมัติ') return { text:'ขอ OT แล้ว / รออนุมัติ', category:'รออนุมัติ', row };
    return { text:st, category:st, row };
  }
  function ch4StatusInfo(a){
    const rec = confirmationFor(a);
    const st = String(rec?.status || '').trim();
    const date = normDate(a?.duty_date);
    const ownerExtra = extraOtStatus(a?.staff_id, date);
    const ownerAny = anyOtStatus(a?.staff_id, date);
    if (st === 'covered_by_other') {
      const by = rec?.covered_by_staff_id;
      const replOt = by ? (extraOtStatus(by, date).text ? extraOtStatus(by, date) : anyOtStatus(by, date)) : { text:'', category:'' };
      const otSuffix = replOt.text ? ` • ${replOt.text}` : '';
      return { text:`มีคนอยู่แทน: ${staffName(by)}${otSuffix}`, category:replOt.category || 'มีคนอยู่แทน', rec, extra:replOt };
    }
    if (st === 'no_claim' || st === 'no_blood' || st === 'no_ot' || st === 'cancelled') return { text:'ไม่เบิก/ไม่มีปั่นเลือด', category:'ไม่เบิก', rec, extra:ownerAny.text ? ownerAny : ownerExtra };
    if (st === 'completed_self' || st === 'confirmed_self') {
      const otInfo = ownerExtra.text ? ownerExtra : ownerAny;
      const otSuffix = otInfo.text ? ` • ${otInfo.text}` : '';
      return { text:`ทำ ช4 เอง${otSuffix}`, category:otInfo.category || 'ทำ ช4 เอง', rec, extra:otInfo };
    }
    if (ownerExtra.text) return { text:ownerExtra.text, category:ownerExtra.category, rec, extra:ownerExtra };
    if (ownerAny.text) return { text:ownerAny.text, category:ownerAny.category, rec, extra:ownerAny };
    return { text:'ยังไม่ยืนยัน', category:'ยังไม่ยืนยัน', rec, extra:ownerAny };
  }
  function dutyStatusInfo(a){
    const date = normDate(a?.duty_date);
    const code = String(a?.duty_code || '').trim();
    if (isCh4(code)) return ch4StatusInfo(a);
    if (['ช3A','ช3B'].includes(code)) {
      const allOt = anyOtStatus(a?.staff_id, date);
      if (allOt.text) return { text:allOt.text, category:allOt.category, rec:null, extra:{ row:allOt.row } };
      const extra = extraOtStatus(a?.staff_id, date);
      if (extra.text) return { text:extra.text, category:extra.category, rec:null, extra };
      if (attendanceRows(a?.staff_id, date).length > 0) return { text:'ยืนยันแล้ว', category:'ยืนยันแล้ว', rec:null, extra:null };
      return { text:'ยังไม่ยืนยัน / ยังไม่บันทึกเวลาจริง', category:'ยังไม่ยืนยัน', rec:null, extra:null };
    }
    const ot = latest(otRowsFor(a?.staff_id, date, 'attendance'));
    const att = attendanceRows(a?.staff_id, date).length > 0;
    if (ot) {
      const st = normalizeOtStatus(ot);
      if (st === 'รออนุมัติ') return { text:'ยืนยันแล้ว / รออนุมัติ', category:'รออนุมัติ', rec:null, extra:{row:ot} };
      return { text:st, category:st, rec:null, extra:{row:ot} };
    }
    if (att) return { text:'ยืนยันแล้ว', category:'ยืนยันแล้ว', rec:null, extra:null };
    return { text:'ยังไม่ยืนยัน', category:'ยังไม่ยืนยัน', rec:null, extra:null };
  }
  function statusMatches(info, filter){
    const f = String(filter || '').trim();
    if (!f) return true;
    const text = `${info?.text || ''} ${info?.category || ''}`;
    if (f === 'ไม่เบิก') return /ไม่เบิก|ไม่มีปั่น/.test(text);
    if (f === 'มีคนอยู่แทน') return /มีคนอยู่แทน/.test(text);
    if (f === 'รออนุมัติ') return /รออนุมัติ|ขอ OT/.test(text);
    return text.includes(f);
  }
  function assignmentRowsForMonth(month){
    const key = String(month || '').slice(0,7);
    return (state.rosterAssignments || []).filter(a => normDate(a?.duty_date).startsWith(key) && a?.staff_id).sort((a,b) => normDate(a?.duty_date).localeCompare(normDate(b?.duty_date)) || staffName(a?.staff_id).localeCompare(staffName(b?.staff_id), 'th'));
  }
  function actionButtonsForCh4(a, options={}){
    if (!isCh4(a?.duty_code)) return '-';
    const readOnly = !!options.readOnly;
    const canEdit = !readOnly && (isAdminSafe() || String(a?.staff_id || '') === String(currentStaff() || ''));
    if (!canEdit) return '<span class="muted">ดูสถานะเท่านั้น</span>';
    const key = esc(assignmentKey(a));
    return `<div class="actions v234-ch4-actions"><button class="tiny-btn" type="button" data-v234-ch4-self="${key}">ทำ ช4 เอง</button><button class="tiny-btn" type="button" data-v234-ch4-cover="${key}">มีคนอยู่แทน</button><button class="tiny-btn danger" type="button" data-v234-ch4-no-claim="${key}">ไม่เบิก/ไม่มีปั่นเลือด</button></div>`;
  }
  function renderAdminTrackingCard(){
    const month = state.otAdminMonthFilterV234 || state.myDutyMonthFilter || state.monthKey || currentMonth();
    const staffFilter = state.otAdminStaffFilterV234 || '';
    const statusFilter = state.otAdminDutyStatusFilterV234 || '';
    const all = assignmentRowsForMonth(month).map(a => ({ a, info:dutyStatusInfo(a) }));
    const rows = all.filter(x => {
      if (!staffFilter) return statusMatches(x.info, statusFilter);
      const isOwner = String(x.a.staff_id) === String(staffFilter);
      const rec = isCh4(x.a.duty_code) ? confirmationFor(x.a) : null;
      const isCoverer = rec && String(rec.covered_by_staff_id || '') === String(staffFilter);
      return (isOwner || isCoverer) && statusMatches(x.info, statusFilter);
    });
    const counts = all.reduce((acc,x) => { const k = x.info.category || 'อื่น ๆ'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const body = rows.map(({a,info}) => {
      const d = normDate(a.duty_date);
      const isCh4Row = isCh4(a.duty_code);
      const rec = isCh4Row ? confirmationFor(a) : null;
      const isCoverForFilter = !!staffFilter && rec && String(rec.covered_by_staff_id || '') === String(staffFilter) && String(a.staff_id) !== String(staffFilter);
      const focusStaffId = isCoverForFilter ? staffFilter : a.staff_id;
      const nameCell = isCoverForFilter
        ? `<button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(staffFilter)}">${staffPillSafe(staffFilter)}</button><br><span class="muted">รับแทน ${esc(staffName(a.staff_id))}</span>`
        : `<button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(a.staff_id)}">${staffPillSafe(a.staff_id)}</button>`;
      return `<tr data-v234-duty-row="${esc(focusStaffId)}"><td>${fmtDate(d)}</td><td>${nameCell}</td><td><b>${esc(dutyLabel(a.duty_code))}</b>${isCh4Row ? '<br><span class="muted">งานปั่นเลือด / ไม่คิด 8 ชม. อัตโนมัติ</span>' : ''}</td><td>${badgeSafe(info.text, statusClass(info.text))}</td><td>${buildDutyNoteCell(a, info, focusStaffId)}</td><td>${isCh4Row ? actionButtonsForCh4(a) : '<span class="muted">-</span>'}</td></tr>`;
    }).join('');
    const stat = ['ยังไม่ยืนยัน','ยืนยันแล้ว','รออนุมัติ','อนุมัติแล้ว','มีคนอยู่แทน','ไม่เบิก'].map(k => `<span class="badge ${statusClass(k)}">${esc(k)} ${Number(counts[k] || 0)}</span>`).join(' ');
    const activeHint = staffFilter ? `<span class="badge blue">กำลังดู: ${esc(staffName(staffFilter))}</span>` : '';
    return `<div id="v234AdminFollowCard" class="card wide-card v234-admin-follow-card" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>ติดตามการยืนยันเวร / ขอ OT / สถานะ ช4</h3><p class="hint">Admin ดูทุกคนได้ ใช้ตัวกรองเพื่อไล่คนที่ยังไม่กดหรือยังไม่ได้ขอ OT</p></div><div class="v234-statline">${activeHint}${stat}</div></div>
      <div class="toolbar compact-filter v234-admin-filters">
        <label>เดือน <input id="otAdminMonthFilterV234" type="month" value="${esc(month)}"></label>
        <label>เจ้าหน้าที่ <select id="otAdminStaffFilterV234">${staffOptions(staffFilter, true)}</select></label>
        <label>สถานะ <select id="otAdminDutyStatusFilterV234">${DUTY_STATUS_OPTIONS.map(([v,t]) => `<option value="${esc(v)}" ${String(v)===String(statusFilter)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
        <button class="ghost-btn" type="button" data-v234-clear-follow-filter>ล้างตัวกรอง</button>
      </div>
      <div class="table-wrap v234-follow-table"><table><thead><tr><th>วันที่</th><th>ชื่อ</th><th>เวร</th><th>สถานะ</th><th>หมายเหตุ/OT</th><th>จัดการ ช4</th></tr></thead><tbody>${body || '<tr><td colspan="6">ไม่พบรายการตามตัวกรองนี้</td></tr>'}</tbody></table></div>
    </div>`;
  }
  function renderStaffDutyDetail(staffId, month){
    if (!staffId) return '';
    const key = String(month || state.otAdminMonthFilterV234 || state.hrExportMonthV234 || state.monthKey || currentMonth()).slice(0,7);
    const rows = assignmentRowsForMonth(key).filter(a => String(a.staff_id) === String(staffId));
    const body = rows.map(a => {
      const d = normDate(a.duty_date);
      const info = dutyStatusInfo(a);
      return `<tr><td>${fmtDate(d)}</td><td><b>${esc(dutyLabel(a.duty_code))}</b></td><td>${badgeSafe(info.text, statusClass(info.text))}</td><td>${buildDutyNoteCell(a, info, staffId)}</td><td>${isCh4(a.duty_code) ? actionButtonsForCh4(a) : '-'}</td></tr>`;
    }).join('');
    return `<div id="v234StaffDutyDetail" class="v234-staff-detail"><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>สถานะ</th><th>หมายเหตุ/OT</th><th>จัดการ</th></tr></thead><tbody>${body || '<tr><td colspan="5">ไม่มีเวรในเดือนนี้</td></tr>'}</tbody></table></div></div>`;
  }

  function renderCh4SharedCard(){
    const staffId = currentStaff();
    if (!canViewCh4Month(staffId)) return '';
    const month = state.ch4MonthFilterV234 || state.myDutyMonthFilter || state.monthKey || currentMonth();
    const staffFilter = isAdminSafe() ? (state.ch4StaffFilterV234 || '') : '';
    const readOnly = !isAdminSafe();
    const ch4Rows = assignmentRowsForMonth(month).filter(a => isCh4(a.duty_code) && (!staffFilter || String(a.staff_id) === String(staffFilter)));
    const body = ch4Rows.map(a => {
      const info = ch4StatusInfo(a);
      const rec = info.rec || {};
      return `<tr><td>${fmtDate(a.duty_date)}</td><td>${staffPillSafe(a.staff_id)}</td><td><b>${esc(dutyLabel(a.duty_code))}</b></td><td>${badgeSafe(info.text, statusClass(info.text))}</td><td>${rec.covered_by_staff_id ? staffPillSafe(rec.covered_by_staff_id) : '-'}</td><td>${buildDutyNoteCell(a, info, a.staff_id)}</td><td>${actionButtonsForCh4(a, { readOnly })}</td></tr>`;
    }).join('');
    return `<div class="card wide-card v234-ch4-shared-card" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>สถานะ ช4 / งานปั่นเลือด รายเดือน</h3><p class="hint">${readOnly ? 'หน้านี้เป็นภาพรวมอ่านอย่างเดียว หากต้องบันทึก ช4 ให้ใช้การ์ดเวรของฉัน/รายการที่ระบบเปิดให้ดำเนินการโดยตรง' : 'Admin สามารถแก้สถานะ ช4 ได้จากหน้านี้'}</p></div></div>
      <div class="toolbar compact-filter"><label>เดือน <input id="ch4MonthFilterV234" type="month" value="${esc(month)}"></label>${isAdminSafe() ? `<label>เจ้าของ ช4 <select id="ch4StaffFilterV234">${staffOptions(staffFilter, true)}</select></label>` : ''}</div>
      ${state.shiftConfirmationReadyV209 === false ? '<div class="notice error-notice compact"><b>ยังไม่ได้เปิดตารางสถานะ ช4</b><br>ให้รัน SQL V209 และ V234 ใน Supabase ก่อนใช้ปุ่มบันทึกสถานะ</div>' : ''}
      <div class="table-wrap v236-ch4-month-table"><table><thead><tr><th>วันที่</th><th>เจ้าของ ช4</th><th>เวร</th><th>สถานะ</th><th>คนอยู่แทน</th><th>หมายเหตุ/OT</th><th>${readOnly ? 'การใช้งาน' : 'จัดการ'}</th></tr></thead><tbody>${body || '<tr><td colspan="7">ไม่มีรายการ ช4 ในเดือนนี้</td></tr>'}</tbody></table></div>
    </div>`;
  }

  function claimStatus(row){
    const raw = String(row?.claim_status || '').trim().toLowerCase();
    if (!raw) return 'pending';
    if (['claimed','exported','เบิกแล้ว','hr_exported'].includes(raw)) return 'exported';
    return 'pending';
  }
  function isApproved(row){ return String(row?.status || '').trim() === 'อนุมัติ'; }
  function isPending(row){ return isApproved(row) && claimStatus(row) === 'pending'; }
  function pendingRows(){ return (state.otRequests || []).filter(isPending); }
  function rowsInCycle(rows, month){
    const c = hrCycleRange(month);
    return (rows || []).filter(r => { const d = normDate(r?.work_date); return d && d >= c.start && d <= c.end; });
  }
  function readyExportRows(month){ return rowsInCycle(pendingRows(), month); }
  function outOfCyclePendingRows(month){
    const c = hrCycleRange(month);
    return pendingRows().filter(r => { const d = normDate(r?.work_date); return d && (d < c.start || d > c.end); });
  }
  function normalizeHours(row){
    try {
      const n = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if (n && Number.isFinite(Number(n.hrHours))) return n;
    } catch (_) {}
    let actual = 0;
    try { actual = Number(calcOtHours(row) || 0); } catch (_) { actual = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0); }
    return { actualHours:actual, hrHours:actual, isHoliday:false, rateType:staffRateType(row?.staff_id), shiftType:'-' };
  }
  function staffRateType(staffId){
    const s = staffRecord(staffId) || {};
    const type = String(s.staff_type || '').trim();
    if (type === 'เคิก') return 'เคิก';
    return 'MT';
  }
  function rateForType(type){ return String(type || 'MT') === 'เคิก' ? 90 : 130; }
  function carryHours(hrHours){
    const centi = Math.round(Number(hrHours || 0) * 100);
    if (!Number.isFinite(centi) || centi <= 0) return 0;
    return Math.round(((centi % 800) / 100) * 100) / 100;
  }
  function groupOtRows(rows){
    const map = {};
    (rows || []).forEach(r => {
      const n = normalizeHours(r);
      if (!Number.isFinite(Number(n.hrHours)) || Number(n.hrHours) <= 0) return;
      const id = r.staff_id || '-';
      const rateType = n.rateType || staffRateType(id);
      const rate = rateForType(rateType);
      map[id] = map[id] || { staff_id:id, actual:0, hr:0, money:0, count:0, holiday:0, minDate:'', maxDate:'', rateType, rate };
      map[id].actual = Math.round((map[id].actual + Number(n.actualHours || 0)) * 100) / 100;
      map[id].hr = Math.round((map[id].hr + Number(n.hrHours || 0)) * 100) / 100;
      map[id].money = Math.round((map[id].money + Number(n.hrHours || 0) * rate) * 100) / 100;
      map[id].count += 1;
      if (n.isHoliday) map[id].holiday += 1;
      const d = normDate(r.work_date);
      if (d) { if (!map[id].minDate || d < map[id].minDate) map[id].minDate = d; if (!map[id].maxDate || d > map[id].maxDate) map[id].maxDate = d; }
    });
    Object.values(map).forEach(r => { r.carry = carryHours(r.hr); });
    return Object.values(map).sort((a,b) => staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th'));
  }
  function summaryTable(title, rows, tone, emptyText){
    const grouped = groupOtRows(rows);
    if (!grouped.length) return `<div class="v234-summary-block"><h4>${esc(title)}</h4>${emptySafe(emptyText)}</div>`;
    return `<div class="v234-summary-block"><h4>${esc(title)}</h4><div class="table-wrap v234-ot-summary-table"><table id="${tone === 'ready' ? 'otSummaryTable' : 'otSummaryOutOfCycleTable'}"><thead><tr><th>ชื่อ</th><th>ชั่วโมงจริง Pending</th><th>ชั่วโมงเบิก HR</th><th>คำนวณเป็นเงิน</th><th>OT ทบไปรอบหน้า</th><th>จำนวนรายการ</th><th>รายการนักขัต</th><th>ช่วงวันที่ของรายการ</th><th>สถานะ</th></tr></thead><tbody>${grouped.map(r => `<tr><td><button class="link-btn v234-staff-link" type="button" data-v234-show-staff="${esc(r.staff_id)}">${staffPillSafe(r.staff_id)}</button></td><td>${formatHours(r.actual, 1)}</td><td><b>${formatHours(r.hr, 2)}</b></td><td><b>${formatMoney(r.money)}</b><br><span class="muted">${esc(r.rateType)} ${r.rate} บ./ชม.</span></td><td><b>${formatHours(r.carry, 2)}</b></td><td>${r.count}</td><td>${r.holiday}</td><td>${esc(r.minDate ? `${fmtDate(r.minDate)} - ${fmtDate(r.maxDate || r.minDate)}` : '-')}</td><td>${badgeSafe(tone === 'ready' ? 'พร้อม Export' : 'Pending นอกรอบ / ตกค้าง', tone === 'ready' ? 'green' : 'orange')}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  window.renderOtSummary = renderOtSummary = function renderOtSummaryV234(){
    try {
      const month = state.hrExportMonthV234 || state.monthKey || currentMonth();
      const c = hrCycleRange(month);
      const allPending = pendingRows();
      const ready = readyExportRows(month);
      const outside = outOfCyclePendingRows(month);
      const cards = `<div class="v234-hr-cards"><div class="mini-stat"><span>Pending ทั้งหมด</span><b>${allPending.length}</b></div><div class="mini-stat ready"><span>พร้อม Export รอบนี้</span><b>${ready.length}</b></div><div class="mini-stat overdue"><span>Pending นอกรอบ / ตกค้าง</span><b>${outside.length}</b></div></div>`;
      return `<div class="v234-hr-summary">
        <div class="toolbar compact-filter v234-hr-filter"><label>รอบ Export HR <input id="hrExportMonthV234" type="month" value="${esc(month)}"></label><span class="badge blue">${esc(fmtDate(c.start))} - ${esc(fmtDate(c.end))}</span><span class="badge green">ในรอบนี้มี ${ready.length} รายการพร้อม Export</span></div>
        <p class="hint compact">Pending = อนุมัติแล้วและยังไม่เคย Export HR • พร้อม Export = Pending ที่วันที่ OT อยู่ในรอบ 16-15 ที่เลือกเท่านั้น</p>
        ${cards}
        ${summaryTable('รายการพร้อม Export ในรอบ HR ที่เลือก', ready, 'ready', 'ยังไม่มีรายการพร้อม Export ในรอบนี้')}
        ${summaryTable('Pending นอกรอบ / ตกค้าง — แสดงเพื่อให้ตามต่อ แต่ไม่รวมในไฟล์ Export รอบนี้', outside, 'outside', 'ไม่มี Pending นอกรอบ')}
      </div>`;
    } catch (err) {
      console.warn(`${VERSION}: renderOtSummary fallback`, err);
      return previousRenderOtSummary ? previousRenderOtSummary.apply(this, arguments) : emptySafe('แสดงสรุป OT ไม่สำเร็จ');
    }
  };

  function staffDisplay(staffId){
    const s = staffRecord(staffId) || {};
    return s.full_name || s.name || s.nickname || staffId || '-';
  }
  function employeeCode(staffId){
    const s = staffRecord(staffId) || {};
    const raw = String(s.employee_code || s.emp_code || s.code || '').replace(/\D/g, '');
    return raw ? raw.padStart(7, '0') : String(staffId || '').replace(/\D/g, '').padStart(7, '0').slice(-7);
  }
  function minutesToTime(totalMinutes){
    const total = Math.max(0, Math.round(Number(totalMinutes || 0)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${pad2(m)}`;
  }
  function staffHasLeave(staffId, date){
    const d = normDate(date);
    return (state.leaves || []).some(l => {
      if (String(l.staff_id) !== String(staffId)) return false;
      const type = String(l.type || l.leave_type || '').trim();
      if (!type || type === 'ไม่รับเวร') return false;
      const st = String(l.status || '').toLowerCase();
      let effective = !/reject|cancelled|canceled|ไม่อนุมัติ/.test(st);
      try { effective = isLeaveEffective(l); } catch (_) {}
      if (!effective) return false;
      const s = normDate(l.start_date || l.leave_date || l.date);
      const e = normDate(l.end_date || l.start_date || l.leave_date || l.date);
      return s && e && d >= s && d <= e;
    });
  }
  function allocateDummyRows(totals, month){
    const c = hrCycleRange(month);
    const dates = dateList(c.start, c.end);
    const rows = [];
    const problems = [];
    Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).forEach(([staffId, hours]) => {
      let remaining = Math.round(Number(hours || 0) * 60);
      let guard = 0;
      while (remaining > 0 && guard++ < 1000) {
        const used = new Set(rows.filter(r => String(r.staff_id) === String(staffId)).map(r => r.date));
        const date = dates.find(d => !used.has(d) && !staffHasLeave(staffId, d)) || dates.find(d => !used.has(d)) || dates[(guard - 1) % Math.max(1, dates.length)];
        if (!date) break;
        const chunk = Math.min(remaining, 16 * 60);
        rows.push({ staff_id:staffId, date, start:'0:00', end:minutesToTime(chunk), hours:Math.round((chunk / 60) * 100) / 100 });
        remaining -= chunk;
      }
      if (remaining > 0) problems.push(`${staffName(staffId)} เหลือ ${formatHours(remaining / 60, 2)} ชม.`);
    });
    if (problems.length) return { ok:false, message:`จัด Dummy Shift จากชั่วโมง HR ไม่ครบ: ${problems.join(', ')}` };
    rows.sort((a,b) => a.date.localeCompare(b.date) || staffName(a.staff_id).localeCompare(staffName(b.staff_id), 'th') || a.start.localeCompare(b.start));
    return { ok:true, rows, cycle:c };
  }
  function buildHrExport(month){
    const sourceRows = readyExportRows(month);
    const totals = {}, actualTotals = {};
    sourceRows.forEach(r => {
      const n = normalizeHours(r);
      if (!Number.isFinite(Number(n.hrHours)) || Number(n.hrHours) <= 0) return;
      totals[r.staff_id] = Math.round(((totals[r.staff_id] || 0) + Number(n.hrHours || 0)) * 100) / 100;
      actualTotals[r.staff_id] = Math.round(((actualTotals[r.staff_id] || 0) + Number(n.actualHours || 0)) * 100) / 100;
    });
    if (!Object.keys(totals).length) return { ok:false, message:'ยังไม่มีรายการพร้อม Export ในรอบ HR ที่เลือก' };
    const allocated = allocateDummyRows(totals, month);
    if (!allocated.ok) return allocated;
    const hrRows = allocated.rows.map(r => ({ no:employeeCode(r.staff_id), 'วันที่':Number(String(r.date).slice(-2)), 'เวลาเข้า':r.start, 'เวลาออก':r.end }));
    const summaryRows = sourceRows.map(r => {
      const n = normalizeHours(r);
      return { no:employeeCode(r.staff_id), 'ชื่อ':staffDisplay(r.staff_id), 'วันที่ OT':normDate(r.work_date), 'ประเภทเวร':n.shiftType || '-', 'กลุ่มเรท':n.rateType || staffRateType(r.staff_id), 'วันนักขัตฤกษ์':n.isHoliday ? 'ใช่' : 'ไม่ใช่', 'ชั่วโมงจริง':n.actualHours || 0, 'ชั่วโมงเบิก HR':n.hrHours || 0, 'เหตุผล':String(r.reason || ''), 'หมายเหตุ':String(r.note || '') };
    });
    const staffTotals = Object.entries(totals).sort((a,b) => staffName(a[0]).localeCompare(staffName(b[0]), 'th')).map(([staffId, hr]) => ({ no:employeeCode(staffId), 'ชื่อ':staffDisplay(staffId), 'ชั่วโมงจริงรวม':actualTotals[staffId] || 0, 'ชั่วโมงเบิก HR รวม':hr }));
    return { ok:true, sourceRows, totals, actualTotals, allocated, hrRows, summaryRows, staffTotals };
  }
  function createBatchId(){
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  }
  async function markExported(ids, batchId){
    const now = new Date().toISOString();
    const actor = currentStaff();
    const attempts = [
      { claim_status:'exported', batch_id:batchId, export_date:now, claim_batch_id:batchId, claimed_at:now, claimed_by:actor },
      { claim_status:'exported', claim_batch_id:batchId, claimed_at:now, claimed_by:actor },
      { claim_status:'Claimed', claim_batch_id:batchId, claimed_at:now, claimed_by:actor }
    ];
    let lastErr = null;
    for (const payload of attempts) {
      const res = await sb.from('ot_requests').update(payload).in('id', ids);
      if (!res.error) return res;
      lastErr = res.error;
      if (!/claim_status|batch_id|export_date|schema cache|constraint|column/i.test(String(res.error?.message || ''))) break;
    }
    throw lastErr || new Error('อัปเดตสถานะ Export ไม่สำเร็จ');
  }
  async function exportHrV234(){
    if (!isAdminSafe()) return showToast('เฉพาะ Admin เท่านั้น', { tone:'error' });
    if (typeof XLSX === 'undefined') return showToast('ไม่พบไลบรารี XLSX สำหรับ Export Excel', { tone:'error' });
    const month = state.hrExportMonthV234 || state.monthKey || currentMonth();
    const result = buildHrExport(month);
    if (!result.ok) return showToast(result.message || 'ไม่พบรายการ Export', { tone:'error' });
    const ids = Array.from(new Set((result.sourceRows || []).map(r => r.id).filter(Boolean)));
    if (!ids.length) return showToast('ไม่พบ ID รายการ OT สำหรับล็อกการ Export ซ้ำ', { tone:'error' });
    const batchId = createBatchId();
    try { setBusy(true, 'กำลัง Export HR เฉพาะรายการพร้อม Export ในรอบที่เลือก'); } catch (_) {}
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.hrRows, { header:['no','วันที่','เวลาเข้า','เวลาออก'] });
      for (let r=2; r <= result.hrRows.length + 1; r++) { const cell = ws[`A${r}`]; if (cell) { cell.t = 's'; cell.z = '@'; } }
      ws['!cols'] = [{wch:12},{wch:8},{wch:12},{wch:12}];
      const summary = XLSX.utils.json_to_sheet(result.summaryRows, { header:['no','ชื่อ','วันที่ OT','ประเภทเวร','กลุ่มเรท','วันนักขัตฤกษ์','ชั่วโมงจริง','ชั่วโมงเบิก HR','เหตุผล','หมายเหตุ'] });
      summary['!cols'] = [{wch:12},{wch:18},{wch:12},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:32},{wch:42}];
      const total = XLSX.utils.json_to_sheet(result.staffTotals, { header:['no','ชื่อ','ชั่วโมงจริงรวม','ชั่วโมงเบิก HR รวม'] });
      const outsideRows = outOfCyclePendingRows(month).map(r => ({ 'วันที่ OT':normDate(r.work_date), 'ชื่อ':staffDisplay(r.staff_id), 'สถานะ':'Pending นอกรอบ / ตกค้าง', 'เหตุผล':String(r.reason || ''), 'หมายเหตุ':String(r.note || '') }));
      const outside = XLSX.utils.json_to_sheet(outsideRows, { header:['วันที่ OT','ชื่อ','สถานะ','เหตุผล','หมายเหตุ'] });
      XLSX.utils.book_append_sheet(wb, ws, 'HR_OT');
      XLSX.utils.book_append_sheet(wb, summary, 'Export_Summary');
      XLSX.utils.book_append_sheet(wb, total, 'Staff_Total');
      XLSX.utils.book_append_sheet(wb, outside, 'Pending_Out_Of_Cycle');
      const c = result.allocated.cycle;
      XLSX.writeFile(wb, `HR_OT_${batchId}_${c.start}_to_${c.end}.xlsx`);
      await markExported(ids, batchId);
      await loadAllData();
      renderPage();
      showToast(`Export HR สำเร็จ ${ids.length} รายการ / Batch ${batchId}`);
    } catch (err) {
      console.error(`${VERSION}: export failed`, err);
      const msg = String(err?.message || err || 'Export ไม่สำเร็จ');
      showToast(/claim_status|batch_id|export_date|constraint|schema cache/i.test(msg) ? 'Export ไฟล์ได้ แต่บันทึกสถานะไม่ได้: กรุณารัน supabase_v234_ot_admin_ch4_hr_cycle.sql แล้วลองใหม่ เพื่อกันการเบิกซ้ำ' : msg, { tone:'error' });
    } finally { try { setBusy(false); } catch (_) {} }
  }

  function renderAdminOtPage(){
    const today = todayKey();
    const tomorrow = addDays(today, 1);
    const rows = state.otRequests || [];
    const month = state.hrExportMonthV234 || state.monthKey || currentMonth();
    const c = hrCycleRange(month);
    const readyCount = readyExportRows(month).length;
    return `<div class="grid grid-2 ot-page v234-ot-page">
      ${renderAdminTrackingCard()}
      <div class="card ot-card v234-admin-card">
        <h3>ส่วนที่ 1 ยืนยันวันอยู่เวรแทนเจ้าหน้าที่</h3>
        <p class="muted">ใช้เฉพาะกรณี Admin ต้องบันทึกย้อนหลัง/บันทึกแทน เวร ช4 ไม่ควรสร้าง 8 ชม. อัตโนมัติ</p>
        <form id="attendanceAdminFormV180" class="form-grid compact-form attendance-form v234-admin-attendance-form">
          <label>เลือกชื่อเจ้าหน้าที่ <select name="staff_id" required>${staffOptions(currentStaff(), false)}</select></label>
          <label>เลือกประเภทเวร <select name="duty_code" required>${dutyOptions()}</select></label>
          <label>วันที่อยู่เวร <input name="duty_date" type="date" value="${esc(today)}" required></label>
          <label>เวลาเริ่มทำงาน <input name="start_time" type="time" value="08:00" required></label>
          <label>วันที่สิ้นสุด <input name="end_date" type="date" value="${esc(tomorrow)}" required></label>
          <label>เวลาสิ้นสุด <input name="end_time" type="time" value="08:00" required></label>
          <label>จำนวนเวลา OT (ชั่วโมง) <input name="manual_hours" class="v180-calculated-hours" type="number" min="0" max="48" step="0.5" value="24" readonly required></label>
          <label>หมายเหตุ Admin <input name="admin_note" placeholder="เช่น ลงย้อนหลังแทนน้อง"></label>
          <button class="primary-btn wide" type="submit">ยืนยันรับ OT / อยู่เวร</button>
        </form>
      </div>
      <div class="card ot-card v234-admin-card">
        <h3>ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด</h3>
        <p class="hint compact">ใช้บันทึกเวลาจริง/ยอดชั่วโมงที่ต้องการเบิก โดยยังต้องรอ Admin อนุมัติก่อนเข้า Pending</p>
        <form id="otForm" class="form-grid v181-admin-ot-extra-form" data-admin-simple="1">
          <label>เลือกชื่อเจ้าหน้าที่ <select name="staff_id" required>${staffOptions(currentStaff(), false)}</select></label>
          <label>ชั่วโมงที่ต้องการเบิก <input name="requested_hours" type="number" min="0.5" max="240" step="0.5" placeholder="เช่น 2 / 8 / 16" required></label>
          <label class="wide">เหตุผล <textarea name="reason" rows="3" placeholder="เช่น เวรปั่นเลือด / งานเร่งด่วน / ปรับยอดเบิก OT" required></textarea></label>
          <button class="primary-btn wide" type="submit">ยืนยันขอ OT เพิ่ม</button>
        </form>
      </div>
      <div class="card wide-card" style="grid-column:1/-1;">
        <div class="section-title"><h3>ส่วนที่ 3 อนุมัติ OT</h3><button class="ghost-btn" data-export-ot-excel>Export Excel สรุปเดือนนี้</button></div>
        ${typeof renderOtTable === 'function' ? renderOtTable(rows) : ''}
      </div>
      ${renderCh4SharedCard()}
      <div class="card" style="grid-column:1/-1;">
        <div class="section-title"><div><h3>ส่วนที่ 4 สรุป OT รายเดือน และ Export HR</h3><p class="hint">รอบ Export HR: ${esc(fmtDate(c.start))} - ${esc(fmtDate(c.end))} • ในรอบนี้มี ${readyCount} รายการพร้อม Export</p></div><div class="actions"><button class="ghost-btn" data-page="claimHistory">ประวัติการเบิก</button><button class="primary-btn" data-export-hr-v234>Export Excel สำหรับเบิกเงิน</button></div></div>
        ${renderOtSummary()}
      </div>
    </div>`;
  }

  window.renderOtPage = renderOtPage = function renderOtPageV234(){
    if (isAdminSafe()) return renderAdminOtPage();
    const base = previousRenderOtPage ? String(previousRenderOtPage.apply(this, arguments) || '') : '';
    const ch4 = renderCh4SharedCard();
    if (!ch4) return base;
    const marker = /(<div class="card" style="grid-column:1\/-1;">\s*<h3>ส่วนที่ 4 สรุป OT รายเดือน)/;
    return marker.test(base) ? base.replace(marker, ch4 + '$1') : `${base}${ch4}`;
  };

  async function saveCh4Status(assignment, status, coveredBy='', note=''){
    if (!assignment) return showToast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า', { tone:'error' });
    const saver = window.v209Ch4Tools?.saveCh4Confirmation209;
    if (typeof saver === 'function') return saver(assignment, status, coveredBy || '', note || '');
    const now = new Date().toISOString();
    const payload = { roster_assignment_id:assignment.id || null, shift_type:'ช4', duty_code:assignment.duty_code || 'ช4', work_date:normDate(assignment.duty_date), owner_staff_id:assignment.staff_id, status, covered_by_staff_id:coveredBy || null, covered_by_name:coveredBy ? staffName(coveredBy) : null, covered_note:note || null, note:note || null, confirmed_at:now, covered_at:status === 'covered_by_other' ? now : null, updated_by:currentStaff(), created_by:currentStaff() };
    const attempts = [{...payload}, (() => { const p = {...payload}; delete p.covered_by_name; return p; })(), (() => { const p = {...payload}; delete p.roster_assignment_id; delete p.covered_by_name; return p; })()];
    let lastErr = null;
    for (const p of attempts) {
      const res = await sb.from(CH4_TABLE).upsert(p, { onConflict:'work_date,owner_staff_id,duty_code' }).select('*').maybeSingle();
      if (!res.error) return res.data || p;
      lastErr = res.error;
      if (!/column|schema|cache|constraint|conflict/i.test(String(res.error?.message || ''))) break;
    }
    throw lastErr || new Error('บันทึกสถานะ ช4 ไม่สำเร็จ');
  }
  async function handleCh4Self(key){
    const assignment = findAssignmentFromKey(key);
    const ok = typeof confirmDialog === 'function' ? await confirmDialog('บันทึกว่าทำ ช4 เองใช่ไหม? หากต้องการเบิก ต้องส่ง OT ตามเวลาจริงแยกต่างหาก', 'ยืนยันทำ ช4 เอง') : window.confirm('บันทึกว่าทำ ช4 เองใช่ไหม?');
    if (!ok) return;
    try { setBusy(true, 'กำลังบันทึกสถานะ ช4'); await saveCh4Status(assignment, 'completed_self', '', 'ทำ ช4 เอง'); await loadAllData(); renderPage(); showToast('บันทึกสถานะ ทำ ช4 เอง แล้ว'); }
    catch (err) { showToast(String(err?.message || err || 'บันทึกสถานะ ช4 ไม่สำเร็จ'), { tone:'error' }); }
    finally { try { setBusy(false); } catch (_) {} }
  }
  async function handleCh4NoClaim(key){
    const assignment = findAssignmentFromKey(key);
    const ok = typeof confirmDialog === 'function' ? await confirmDialog('บันทึกเป็น “ไม่เบิก/ไม่มีปั่นเลือด” ใช่ไหม? รายการนี้จะไม่เข้า OT และไม่เข้า Export HR', 'ยืนยันไม่เบิก') : window.confirm('บันทึกไม่เบิก/ไม่มีปั่นเลือด?');
    if (!ok) return;
    try { setBusy(true, 'กำลังบันทึกสถานะ ช4'); await saveCh4Status(assignment, 'no_claim', '', 'ไม่เบิก/ไม่มีปั่นเลือด'); await loadAllData(); renderPage(); showToast('บันทึกสถานะ ไม่เบิก/ไม่มีปั่นเลือด แล้ว'); }
    catch (err) { showToast(/constraint|status/i.test(String(err?.message || '')) ? 'บันทึกไม่ได้เพราะฐานข้อมูลยังไม่รองรับสถานะ no_claim กรุณารัน supabase_v234_ot_admin_ch4_hr_cycle.sql ก่อน' : String(err?.message || err || 'บันทึกสถานะ ช4 ไม่สำเร็จ'), { tone:'error' }); }
    finally { try { setBusy(false); } catch (_) {} }
  }
  function showCoverModal(key){
    const assignment = findAssignmentFromKey(key);
    if (!assignment) return showToast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า', { tone:'error' });
    const html = `<div class="v234-ch4-cover-modal"><h2>มีคนอยู่แทน / ไม่เบิกอัตโนมัติ</h2><p class="hint">ใช้ปิดสถานะ ช4 ของเจ้าของเวร คนที่อยู่แทนต้องส่ง OT ตามเวลาจริงเองถ้าจะเบิก</p><form id="ch4CoverFormV234" class="form-grid"><input type="hidden" name="assignment_key" value="${esc(key)}"><label>เจ้าของ ช4 <input value="${esc(staffName(assignment.staff_id))}" disabled></label><label>วันที่ <input value="${esc(normDate(assignment.duty_date))}" disabled></label><label class="wide">ผู้ที่อยู่แทน <select name="covered_by_staff_id" required>${staffOptions('', false)}</select></label><label class="wide">หมายเหตุ <textarea name="covered_note" rows="3" placeholder="เช่น ปั่นเลือดแทน / อยู่แทนช่วงเย็น"></textarea></label><div class="actions wide"><button class="ghost-btn" type="button" data-close-modal>ยกเลิก</button><button class="primary-btn" type="submit">บันทึกว่ามีคนอยู่แทน</button></div></form></div>`;
    showModal(html, { small:true });
  }
  async function saveCoverForm(form){
    const fd = new FormData(form);
    const assignment = findAssignmentFromKey(String(fd.get('assignment_key') || ''));
    const coveredBy = String(fd.get('covered_by_staff_id') || '').trim();
    const note = String(fd.get('covered_note') || '').trim();
    if (!coveredBy) return showToast('กรุณาเลือกผู้ที่อยู่แทน', { tone:'error' });
    try { setBusy(true, 'กำลังบันทึกคนอยู่แทน'); await saveCh4Status(assignment, 'covered_by_other', coveredBy, note || `มีคนอยู่แทน: ${staffName(coveredBy)}`); closeModal(); await loadAllData(); renderPage(); showToast(`บันทึกแล้ว: ${staffName(coveredBy)} อยู่แทน`); }
    catch (err) { showToast(String(err?.message || err || 'บันทึกคนอยู่แทนไม่สำเร็จ'), { tone:'error' }); }
    finally { try { setBusy(false); } catch (_) {} }
  }

  document.addEventListener('change', function(e){
    const id = e.target?.id || '';
    if (id === 'otAdminMonthFilterV234') { state.otAdminMonthFilterV234 = e.target.value || currentMonth(); state.myDutyMonthFilter = state.otAdminMonthFilterV234; renderPage(); }
    if (id === 'otAdminStaffFilterV234') { state.otAdminStaffFilterV234 = e.target.value || ''; state.otAdminSelectedStaffV234 = e.target.value || ''; renderPage(); }
    if (id === 'otAdminDutyStatusFilterV234') { state.otAdminDutyStatusFilterV234 = e.target.value || ''; renderPage(); }
    if (id === 'hrExportMonthV234') { state.hrExportMonthV234 = e.target.value || currentMonth(); renderPage(); }
    if (id === 'ch4MonthFilterV234') { state.ch4MonthFilterV234 = e.target.value || currentMonth(); state.myDutyMonthFilter = state.ch4MonthFilterV234; renderPage(); }
    if (id === 'ch4StaffFilterV234') { state.ch4StaffFilterV234 = e.target.value || ''; renderPage(); }
  }, true);

  document.addEventListener('click', async function(e){
    const showStaff = e.target?.closest?.('[data-v234-show-staff]');
    if (showStaff) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const staffId = showStaff.getAttribute('data-v234-show-staff') || '';
      state.otAdminSelectedStaffV234 = '';
      state.otAdminStaffFilterV234 = staffId;
      const m = state.hrExportMonthV234 || state.otAdminMonthFilterV234 || state.monthKey || currentMonth();
      state.otAdminMonthFilterV234 = m;
      renderPage();
      setTimeout(() => { try { document.getElementById('v234AdminFollowCard')?.scrollIntoView({ behavior:'smooth', block:'start' }); } catch (_) {} }, 60);
      return;
    }
    if (e.target?.closest?.('[data-v234-close-staff-detail]')) { e.preventDefault(); state.otAdminSelectedStaffV234 = ''; renderPage(); return; }
    if (e.target?.closest?.('[data-v234-clear-follow-filter]')) { e.preventDefault(); state.otAdminStaffFilterV234 = ''; state.otAdminDutyStatusFilterV234 = ''; state.otAdminSelectedStaffV234 = ''; renderPage(); return; }
    const self = e.target?.closest?.('[data-v234-ch4-self]');
    if (self) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); await handleCh4Self(self.getAttribute('data-v234-ch4-self')); return; }
    const cover = e.target?.closest?.('[data-v234-ch4-cover]');
    if (cover) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); showCoverModal(cover.getAttribute('data-v234-ch4-cover')); return; }
    const noClaim = e.target?.closest?.('[data-v234-ch4-no-claim]');
    if (noClaim) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); await handleCh4NoClaim(noClaim.getAttribute('data-v234-ch4-no-claim')); return; }
    if (e.target?.closest?.('[data-export-hr-v234]')) { e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); await exportHrV234(); }
  }, true);

  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'ch4CoverFormV234') return;
    e.preventDefault(); e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    saveCoverForm(e.target);
  }, true);

  window.v234OtAdminCh4HrCycle = { hrCycleRange, readyExportRows, outOfCyclePendingRows, buildHrExport, exportHrV234, dutyStatusInfo, ch4StatusInfo, anyOtStatus };
  console.info(`[${VERSION}] loaded`);
})();
