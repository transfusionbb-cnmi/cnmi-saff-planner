/* =========================================================
   V208 Staff OT Summary + Scheduler/Daily Position Stability
   - Staff can see the OT monthly summary of all staff when RPC is installed.
   - Daily position page de-duplicates saved blank rows and saves only one layout.
   - Admin roster page renders one layout only to reduce freezing on slower PCs.
   ========================================================= */
(function(){
  'use strict';
  const VERSION_V208 = 'V208_OT_SUMMARY_ALL_SCHEDULER_POSITION_FIX';

  function esc208(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function isMobile208(){
    try { return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }
    catch (_) { return false; }
  }
  function round208(value, digits=2){
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    const m = Math.pow(10, digits);
    return Math.round(n * m) / m;
  }
  function formatHours208(value, digits=2){
    const n = round208(value, digits);
    if (Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');
  }
  function formatMoney208(value){
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    const rounded = round208(n, 2);
    return `${rounded.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 })} บ.`;
  }
  function normDate208(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function claimStatus208(row){
    const raw = row?.claim_status;
    if (raw == null || String(raw).trim() === '') return 'Pending';
    const s = String(raw).trim().toLowerCase();
    return (s === 'claimed' || s === 'เบิกแล้ว') ? 'Claimed' : 'Pending';
  }
  function isPendingApproved208(row){ return String(row?.status || '').trim() === 'อนุมัติ' && claimStatus208(row) === 'Pending'; }
  function staffRec208(staffId){
    try { return (state.staff || []).find(s => String(s.id) === String(staffId)); }
    catch (_) { return null; }
  }
  function staffType208(staffId, fallback){
    const s = staffRec208(staffId);
    const raw = String(fallback || s?.staff_type || '').trim();
    return raw === 'เคิก' ? 'เคิก' : 'MT';
  }
  function staffRate208(staffId, fallbackType){ return staffType208(staffId, fallbackType) === 'เคิก' ? 90 : 130; }
  function carry208(hrHours){
    const centi = Math.round(Number(hrHours || 0) * 100);
    if (!Number.isFinite(centi) || centi <= 0) return 0;
    return round208((centi % 800) / 100, 2);
  }
  function breakdown208(row){
    try {
      const n = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if (n && Number.isFinite(Number(n.hrHours))) return n;
    } catch (_) {}
    let actual = 0;
    try { actual = Number(calcOtHours(row) || 0); } catch (_) { actual = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0); }
    return { actualHours:round208(actual, 2), hrHours:round208(actual, 2), isHoliday:false };
  }
  function localOtSummaryRows208(){
    const map = {};
    (state.otRequests || []).filter(isPendingApproved208).forEach(r => {
      const n = breakdown208(r);
      if (!Number.isFinite(Number(n.actualHours)) || Number(n.actualHours) <= 0) return;
      const id = r.staff_id || '-';
      map[id] = map[id] || { staff_id:id, actual_hours:0, hr_hours:0, money:0, carry_hours:0, request_count:0, holiday_count:0, min_date:'', max_date:'', rate_type:staffType208(id), rate:staffRate208(id) };
      map[id].actual_hours = round208(map[id].actual_hours + Number(n.actualHours || 0), 2);
      map[id].hr_hours = round208(map[id].hr_hours + Number(n.hrHours || 0), 2);
      map[id].request_count += 1;
      if (n.isHoliday) map[id].holiday_count += 1;
      const d = normDate208(r.work_date);
      if (d) {
        if (!map[id].min_date || d < map[id].min_date) map[id].min_date = d;
        if (!map[id].max_date || d > map[id].max_date) map[id].max_date = d;
      }
    });
    Object.values(map).forEach(r => {
      r.rate_type = staffType208(r.staff_id, r.rate_type);
      r.rate = Number(r.rate || staffRate208(r.staff_id, r.rate_type));
      r.money = round208(Number(r.hr_hours || 0) * r.rate, 2);
      r.carry_hours = carry208(r.hr_hours);
    });
    return Object.values(map);
  }
  async function loadOtSummaryAll208(){
    if (!state?.profile || !sb) return;
    try {
      const res = await sb.rpc('get_ot_pending_summary_all_v208');
      if (res.error) throw res.error;
      state.otSummaryAllRowsV208 = Array.isArray(res.data) ? res.data : [];
      state.otSummaryAllRowsV208Source = 'rpc';
    } catch (err) {
      // Without the SQL patch, normal staff will only have their own OT rows due to RLS.
      state.otSummaryAllRowsV208 = localOtSummaryRows208();
      state.otSummaryAllRowsV208Source = 'local';
      console.warn(`${VERSION_V208}: RPC summary unavailable; using visible OT rows only`, err);
    }
  }

  const previousLoadAllDataV208 = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
  if (previousLoadAllDataV208) {
    window.loadAllData = loadAllData = async function loadAllDataV208(){
      await previousLoadAllDataV208.apply(this, arguments);
      await loadOtSummaryAll208();
    };
  }

  window.renderOtSummary = renderOtSummary = function renderOtSummaryV208(){
    const rows = (Array.isArray(state.otSummaryAllRowsV208) && state.otSummaryAllRowsV208.length)
      ? state.otSummaryAllRowsV208.slice()
      : localOtSummaryRows208();
    rows.forEach(r => {
      r.staff_id = r.staff_id || r.staffId || r.id || '-';
      r.actual_hours = round208(r.actual_hours ?? r.actual ?? 0, 2);
      r.hr_hours = round208(r.hr_hours ?? r.hr ?? 0, 2);
      r.rate_type = staffType208(r.staff_id, r.rate_type);
      r.rate = Number(r.rate || staffRate208(r.staff_id, r.rate_type));
      r.money = round208(r.money ?? (r.hr_hours * r.rate), 2);
      r.carry_hours = round208(r.carry_hours ?? r.carry ?? carry208(r.hr_hours), 2);
      r.request_count = Number(r.request_count ?? r.count ?? 0);
      r.holiday_count = Number(r.holiday_count ?? r.holidayCount ?? 0);
      r.min_date = normDate208(r.min_date || r.minDate || '');
      r.max_date = normDate208(r.max_date || r.maxDate || '');
    });
    rows.sort((a,b) => {
      try { return staffNick(a.staff_id).localeCompare(staffNick(b.staff_id), 'th'); }
      catch (_) { return String(a.staff_id).localeCompare(String(b.staff_id), 'th'); }
    });
    if (!rows.length) return empty('ยังไม่มี OT สถานะอนุมัติที่รอเบิก (Pending)');
    const sourceHint = state.otSummaryAllRowsV208Source === 'local' && !(typeof isAdmin === 'function' && isAdmin())
      ? '<div class="notice soft-notice compact">หมายเหตุ: ถ้ายังไม่รันไฟล์ SQL V208 บัญชี Staff อาจเห็นเฉพาะข้อมูลที่ RLS อนุญาต ให้รัน supabase_v208_staff_ot_summary_all.sql เพื่อเปิดสรุปของทุกคนแบบ Aggregate</div>'
      : '';
    return `${sourceHint}<div class="table-wrap v181-pending-summary v190-pending-summary v205-pending-summary v208-pending-summary"><table id="otSummaryTable"><thead><tr><th>ชื่อ</th><th>ชั่วโมงจริง Pending</th><th>ชั่วโมงเบิก HR</th><th>คำนวณเป็นเงิน</th><th>OT ทบไปรอบหน้า</th><th>จำนวนรายการ</th><th>รายการนักขัต</th><th>ช่วงวันที่ของรายการ</th><th>สถานะเบิก</th></tr></thead><tbody>${rows.map(r => `<tr><td>${staffPill(r.staff_id)}</td><td>${formatHours208(r.actual_hours, 1)}</td><td><b>${formatHours208(r.hr_hours, 2)}</b></td><td><b>${formatMoney208(r.money)}</b><br><span class="muted">${esc208(r.rate_type)} ${r.rate} บ./ชม.</span></td><td><b>${formatHours208(r.carry_hours, 2)}</b></td><td>${r.request_count}</td><td>${r.holiday_count}</td><td>${esc208(r.min_date ? `${formatThaiDate(r.min_date)} - ${formatThaiDate(r.max_date || r.min_date)}` : '-')}</td><td><span class="badge yellow">Pending</span></td></tr>`).join('')}</tbody></table></div>`;
  };

  // -------- Daily position de-dup + single-layout save --------
  function posBaseCode208(row, date){
    try { return positionBaseCode(row?.position_code || row?.code || ''); }
    catch (_) { return String(row?.position_code || row?.code || '').replace(/\s+#\d+$/, '').trim(); }
  }
  function posTemplate208(row, date){
    const code = posBaseCode208(row, date);
    try { return positionTemplateByCode(code, date) || row || {}; }
    catch (_) { return row || {}; }
  }
  function logicalPositionKey208(row, date){
    const base = posTemplate208(row, date);
    const code = posBaseCode208(row, date) || base.code || '';
    const zone = String(row?.zone || base.zone || '').trim();
    const br = String(row?.break_time || base.break_time || '').trim();
    return `${code}||${zone}||${br}`;
  }
  function normalizeDailyRows208(rows, date){
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row, idx) => {
      const k = logicalPositionKey208(row, date);
      if (!groups.has(k)) groups.set(k, { filled:[], blanks:[], firstIdx:idx });
      const g = groups.get(k);
      if (row?.staff_id) g.filled.push(row); else g.blanks.push(row);
    });
    const out = [];
    groups.forEach(g => {
      if (g.filled.length) {
        const seenStaff = new Set();
        g.filled.forEach(row => {
          const staffKey = String(row?.staff_id || '');
          if (staffKey && seenStaff.has(staffKey)) return;
          if (staffKey) seenStaff.add(staffKey);
          out.push(row);
        });
      }
      else if (g.blanks.length) out.push(g.blanks[0]);
    });
    try { return sortPositionRows(out); }
    catch (_) { return out; }
  }
  window.normalizeDailyPositionRows = normalizeDailyRows208;

  window.renderDailyPositionList = renderDailyPositionList = function renderDailyPositionListV208(rows, date, canManage){
    const cleanRows = normalizeDailyRows208(rows, date);
    const rowHtml = (r, idx, layout) => {
      const base = posTemplate208(r, date);
      const code = base.code || posBaseCode208(r, date) || r.position_code || 'รอตรวจสอบ';
      const label = positionLabelForCell(r.position_code || base.code || code);
      const zone = r.zone || base.zone || '';
      const breakTime = r.break_time || base.break_time || '';
      const rule = r.main_rule || base.main_rule || '';
      const job = r.job_desc || base.job_desc || '';
      const isDuplicateFilled = cleanRows.filter(x => logicalPositionKey208(x, date) === logicalPositionKey208(r, date)).length > 1;
      const slot = isDuplicateFilled ? `<br><small class="muted">คนที่ ${cleanRows.filter(x => logicalPositionKey208(x, date) === logicalPositionKey208(r, date)).indexOf(r) + 1}</small>` : '';
      const select = canManage
        ? `<select data-position-row="${idx}" data-position-code="${esc208(code)}" data-position-zone="${esc208(zone)}" data-position-break="${esc208(breakTime)}" data-position-rule="${esc208(rule)}" data-position-job="${esc208(job)}" data-position-layout-item="${layout}"><option value="">-</option>${staffOptionList(r.staff_id, s => posBaseCode208(r, date)==='รอตรวจสอบ' || positionCandidateOk(s, { ...base, code, position_code:code, main_rule:rule, eligibility_code:base.eligibility_code }, date))}</select>`
        : `${staffPill(r.staff_id)}`;
      if (layout === 'desktop') return `<tr><td>${esc208(zone)}</td><td><b>${esc208(label)}</b>${slot}</td><td>${esc208(breakTime)}</td><td>${select}</td><td>${esc208(rule)}</td><td>${esc208(job)}</td></tr>`;
      return `<div class="position-mobile-card"><div class="section-title"><h3>${esc208(label)}${slot.replace('<br>',' ')}</h3>${badge(zone || '-', zone === 'ออกหน่วย' ? 'red' : 'blue')}</div><div class="muted">พัก ${esc208(breakTime || '-')} • ${esc208(rule)}</div><label>ผู้รับผิดชอบ ${select}</label><p>${esc208(job)}</p></div>`;
    };
    const table = `<div class="table-wrap daily-position-table desktop-table" data-position-layout="desktop"><table><thead><tr><th>โซน</th><th>ตำแหน่ง</th><th>เวลาพัก</th><th>ผู้รับผิดชอบ</th><th>ผู้ปฏิบัติหลัก</th><th>หน้าที่โดยย่อ</th></tr></thead><tbody>${cleanRows.map((r,i) => rowHtml(r,i,'desktop')).join('')}</tbody></table></div>`;
    const cards = `<div class="mobile-position-list" data-position-layout="mobile">${cleanRows.map((r,i) => rowHtml(r,i,'mobile')).join('')}</div>`;
    return table + cards;
  };

  window.savePositions = savePositions = async function savePositionsV208(){
    const date = document.getElementById('positionDateInput')?.value || state.positionDate || todayStr();
    if (!canManagePositions(date)) return showToast('เฉพาะ Admin หรืออินชาร์จประจำเดือนนี้เท่านั้น');
    const preferred = isMobile208() ? 'mobile' : 'desktop';
    let selects = Array.from(document.querySelectorAll(`[data-position-layout="${preferred}"] [data-position-row]`));
    if (!selects.length) selects = Array.from(document.querySelectorAll('[data-position-row]'));
    const seen = new Set();
    selects = selects.filter(sel => {
      const k = sel.dataset.positionRow || `${sel.dataset.positionCode}|${sel.dataset.positionZone}|${sel.dataset.positionBreak}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const rowsRaw = selects.map(sel => {
      const code = sel.dataset.positionCode || 'รอตรวจสอบ';
      const base = positionTemplateByCode(code, date) || {};
      return {
        work_date: date,
        position_code: code,
        zone: sel.dataset.positionZone || base.zone || 'รอตรวจสอบ',
        break_time: sel.dataset.positionBreak || base.break_time || '-',
        main_rule: sel.dataset.positionRule || base.main_rule || '',
        job_desc: sel.dataset.positionJob || base.job_desc || '',
        staff_id: sel.value || null,
        updated_by: currentStaffId()
      };
    }).filter(r => r.position_code);
    const rows = normalizeDailyRows208(rowsRaw, date).map(r => ({
      work_date: r.work_date,
      position_code: r.position_code,
      zone: r.zone,
      break_time: r.break_time,
      main_rule: r.main_rule,
      job_desc: r.job_desc,
      staff_id: r.staff_id || null,
      updated_by: r.updated_by || currentStaffId()
    }));
    const del = await sb.from('daily_positions').delete().eq('work_date', date);
    if (del.error) return showToast(friendlyDbError(del.error));
    const ins = rows.length ? await sb.from('daily_positions').insert(rows) : { error:null };
    if (ins.error) return showToast(friendlyDbError(ins.error));
    await sb.from('daily_position_day_status').upsert({ work_date:date, month_key:date.slice(0,7), status:'draft', updated_by:currentStaffId() }, { onConflict:'work_date' });
    await loadAllData();
    renderPage();
    showToast('บันทึกตำแหน่งรายวันแล้ว และลบแถวว่างซ้ำออกแล้ว');
  };

  // -------- Roster grid: render only desktop OR mobile to reduce admin page freeze --------
  function rosterSlotId208(slot){
    try { if (typeof getSlotId === 'function') return getSlotId(slot); } catch (_) {}
    return slot?.id || slot?._temp_id || `${slot?.duty_date}|${slot?.duty_code}`;
  }
  const previousRenderRosterGridV208 = window.renderRosterGrid || (typeof renderRosterGrid === 'function' ? renderRosterGrid : null);
  window.renderRosterGrid = renderRosterGrid = function renderRosterGridV208(assignments){
    try {
      if (!assignments || !assignments.length) return empty('กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร');
      const { y, m } = getMonthRange(state.monthKey);
      const last = new Date(y, m, 0).getDate();
      if (isMobile208() && typeof renderRosterMobileGrid === 'function') return renderRosterMobileGrid(assignments, y, m, last);
      const dates = Array.from({length:last}, (_,i)=>`${y}-${pad(m)}-${pad(i+1)}`);
      return `<div class="table-wrap roster-table-wrap v208-roster-table-wrap"><table class="roster-table"><thead><tr><th>วันที่</th>${DUTY_COLUMNS.map(c => `<th>${esc208(DUTY_LABEL[c] || c)}</th>`).join('')}</tr></thead><tbody>${dates.map(date => {
        const day = Number(date.slice(8,10));
        const dow = parseDate(date).toLocaleDateString('th-TH', { weekday:'short' });
        return `<tr><td><b>${day}</b><br><span class="muted">${dow}</span>${isHolidayDate(date) ? `<br><span class="badge yellow">${esc208(holidayName(date))}</span>` : ''}</td>${DUTY_COLUMNS.map(code => {
          if (!allowedDutyCodesForDate(date).includes(code)) return '<td class="muted">-</td>';
          const slot = assignments.find(a => normDate208(a.duty_date) === date && a.duty_code === code);
          if (!slot) return '<td class="muted">-</td>';
          const id = rosterSlotId208(slot);
          const canDrag = slot.staff_id && !slot.is_locked && !(typeof isRosterDropBlocked === 'function' && isRosterDropBlocked(slot));
          return `<td><div class="roster-slot ${slot.is_locked?'locked':''} ${slot.staff_id?'has-staff':''}" data-drop-slot="${esc208(id)}" ${canDrag ? `draggable="true" data-drag-slot-source="${esc208(id)}"` : ''}>
            <div class="assigned-name">${slot.staff_id ? staffPill(slot.staff_id) : 'ยังไม่จัด'}</div>
            <div class="slot-meta">${esc208(slot.required_role)} ${slot.is_locked?'• locked':''}</div>
            <select class="mobile-roster-select" data-roster-slot-select="${esc208(id)}" ${slot.is_locked?'disabled':''}><option value="">ยังไม่จัด</option>${staffOptionList(slot.staff_id, st => canStaffWorkSlot(st.id, slot))}</select>
            <div class="actions"><button class="tiny-btn" type="button" data-clear-slot="${esc208(id)}">ล้าง</button><button class="tiny-btn" type="button" data-toggle-lock-slot="${esc208(id)}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button></div>
          </div></td>`;
        }).join('')}</tr>`;
      }).join('')}</tbody></table></div>`;
    } catch (err) {
      console.warn(`${VERSION_V208}: renderRosterGrid fallback`, err);
      return previousRenderRosterGridV208 ? previousRenderRosterGridV208(assignments) : empty('แสดงตารางเวรไม่สำเร็จ');
    }
  };

  const previousRenderSchedulerPageV208 = window.renderSchedulerPage || (typeof renderSchedulerPage === 'function' ? renderSchedulerPage : null);
  if (previousRenderSchedulerPageV208) {
    window.renderSchedulerPage = renderSchedulerPage = function renderSchedulerPageV208(){
      try { return previousRenderSchedulerPageV208.apply(this, arguments); }
      catch (err) {
        console.error(`${VERSION_V208}: scheduler failed`, err);
        return `<div class="card"><h3>จัดตารางเวร</h3>${empty('หน้า Admin โหลดไม่สำเร็จ กรุณากดรีเฟรชหรือเลือกเดือนใหม่')}</div>`;
      }
    };
  }

  console.info(`[${VERSION_V208}] loaded`);
})();
