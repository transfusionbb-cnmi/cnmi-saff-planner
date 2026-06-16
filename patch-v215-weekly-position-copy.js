/* V215: Weekly Position Copy
   - Adds Admin-only "คัดลอกตำแหน่งทั้งสัปดาห์" controls to monthly and daily position pages.
   - Copies from the selected source date to Mon-Fri of the same week in local draft only.
   - Protects weekend/holiday, leave, outing participants, and existing cells unless override is checked.
*/
(function(){
  'use strict';
  const VERSION = 'V215_WEEKLY_POSITION_COPY';
  if (window.__CNMI_V215_WEEKLY_POSITION_COPY__) return;
  window.__CNMI_V215_WEEKLY_POSITION_COPY__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const toast = (msg, tone) => {
    try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else window.alert(msg); }
    catch (_) { console.info(msg); }
  };
  const normDate = (v) => {
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parse = (date) => {
    try { return parseDate(normDate(date)); }
    catch (_) { return new Date(`${normDate(date)}T00:00:00`); }
  };
  const copyRows = (rows) => {
    try { return structuredClone(rows || []); }
    catch (_) { return JSON.parse(JSON.stringify(rows || [])); }
  };
  const currentId = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } };
  const isAdminSafe = () => { try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } };

  function sameMonth(date, key){ return normDate(date).startsWith(String(key || '').slice(0, 7)); }
  function monthKeyOfDate(date){ return normDate(date).slice(0, 7); }
  function isNoPosition(date){
    const d = normDate(date);
    try { if (typeof isNoPositionDay === 'function' && isNoPositionDay(d)) return true; } catch (_) {}
    try { if (typeof isWeekend === 'function' && isWeekend(d)) return true; } catch (_) {}
    try { if (typeof isHolidayDate === 'function' && isHolidayDate(d)) return true; } catch (_) {}
    return false;
  }
  function weekMonFriDates(sourceDate){
    const base = parse(sourceDate);
    const day = base.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return ymd(d);
    });
  }
  function firstWorkdayOfMonth(key){
    try {
      const { y, m, last } = getMonthRange(key);
      for (let day = 1; day <= last; day += 1) {
        const d = `${y}-${pad2(m)}-${pad2(day)}`;
        if (!isNoPosition(d)) return d;
      }
    } catch (_) {}
    return `${key}-01`;
  }
  function defaultSourceDateForMonth(key){
    const current = normDate(state.positionWeekSourceDateV215 || '');
    if (current && sameMonth(current, key)) return current;
    const today = (typeof todayStr === 'function' ? todayStr() : ymd(new Date()));
    if (sameMonth(today, key) && !isNoPosition(today)) return today;
    return firstWorkdayOfMonth(key);
  }
  function realLeaveOn(staffId, date){
    try {
      const row = activeLeaveRecordOn(staffId, normDate(date));
      if (!row) return null;
      try { if (typeof isNoDutyLeaveType === 'function' && isNoDutyLeaveType(row)) return null; } catch (_) {}
      return row;
    } catch (_) { return null; }
  }
  function staffHasOuting(staffId, date){
    const d = normDate(date);
    try { if (typeof hasOuting === 'function' && !hasOuting(d)) return false; } catch (_) {}
    try {
      if (typeof outingParticipants === 'function') {
        const ids = outingParticipants(d) || [];
        return ids.map(String).includes(String(staffId || ''));
      }
    } catch (_) {}
    return false;
  }
  function codeOf(row){
    const raw = String(row?.position_code || row?.code || '').trim();
    if (!raw) return '';
    try { return positionBaseCode(raw) || raw; } catch (_) { return raw.replace(/\s+#\d+$/, '').trim(); }
  }
  function isBlankCode(code){
    const raw = String(code || '').trim();
    if (!raw) return true;
    try { return positionBaseCode(raw) === 'รอตรวจสอบ'; } catch (_) { return raw === 'รอตรวจสอบ'; }
  }
  function rowHasRealPosition(row){ return !!row?.staff_id && !isBlankCode(row?.position_code || row?.code); }
  function monthRowsForKey(key){
    const draft = state.monthPositionDraft;
    if (draft?.monthKey === key && Array.isArray(draft.rows)) return copyRows(draft.rows);
    return copyRows((state.positions || []).filter(r => normDate(r?.work_date).startsWith(key)));
  }
  function ensureDraft(key){
    let rows = monthRowsForKey(key);
    rows = mergeVisibleMonthSelections(rows, key);
    state.monthPositionDraft = { monthKey: key, rows };
    return state.monthPositionDraft.rows;
  }
  function mergeVisibleMonthSelections(rows, key){
    const selects = Array.from(document.querySelectorAll('[data-month-position-edit]'));
    if (!selects.length) return rows;
    let next = copyRows(rows || []);
    selects.forEach(sel => {
      const [dateRaw, staffIdRaw] = String(sel.dataset.monthPositionEdit || '').split('|');
      const d = normDate(dateRaw);
      const staffId = String(staffIdRaw || '').trim();
      if (!d || !sameMonth(d, key) || !staffId) return;
      next = next.filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === staffId));
      const code = String(sel.value || '').trim();
      if (code) next.push(makeCopiedRow(d, { staff_id: staffId, position_code: code }, d, false));
    });
    return next;
  }
  function visibleDailyRows(sourceDate){
    const currentDate = normDate(document.getElementById('positionDateInput')?.value || state.positionDate || '');
    if (currentDate !== normDate(sourceDate)) return [];
    const selects = Array.from(document.querySelectorAll('[data-position-row]'));
    const seen = new Set();
    const rows = [];
    selects.forEach(sel => {
      const key = String(sel.dataset.positionRow || `${sel.dataset.positionCode}|${sel.dataset.positionZone}|${sel.dataset.positionBreak}`);
      if (seen.has(key)) return;
      seen.add(key);
      const staffId = String(sel.value || '').trim();
      if (!staffId) return;
      rows.push({
        work_date: normDate(sourceDate),
        position_code: sel.dataset.positionCode || 'รอตรวจสอบ',
        code: sel.dataset.positionCode || 'รอตรวจสอบ',
        zone: sel.dataset.positionZone || '',
        break_time: sel.dataset.positionBreak || '-',
        main_rule: sel.dataset.positionRule || '',
        job_desc: sel.dataset.positionJob || '',
        staff_id: staffId,
        updated_by: currentId()
      });
    });
    return rows;
  }
  function sourceRowsForDate(rows, sourceDate){
    const sourceKey = normDate(sourceDate);
    const byStaff = new Map();
    (rows || []).forEach(r => {
      if (normDate(r?.work_date) !== sourceKey || !r?.staff_id || !rowHasRealPosition(r)) return;
      if (!byStaff.has(String(r.staff_id))) byStaff.set(String(r.staff_id), { ...r, work_date: sourceKey });
    });
    const daily = visibleDailyRows(sourceKey);
    daily.forEach(r => {
      if (!r.staff_id || !rowHasRealPosition(r)) return;
      byStaff.set(String(r.staff_id), r);
    });
    return Array.from(byStaff.values());
  }
  function makeCopiedRow(targetDate, sourceRow, sourceDate, copied=true){
    const code = String(sourceRow?.position_code || sourceRow?.code || '').trim();
    const base = (() => {
      try { return positionTemplateByCode(code, targetDate) || positionTemplateByCode(code, sourceDate) || {}; }
      catch (_) { return {}; }
    })();
    return {
      work_date: normDate(targetDate),
      position_code: code,
      zone: sourceRow?.zone || base.zone || 'รอตรวจสอบ',
      break_time: sourceRow?.break_time || base.break_time || '-',
      main_rule: sourceRow?.main_rule || base.main_rule || '',
      job_desc: sourceRow?.job_desc || base.job_desc || '',
      staff_id: sourceRow?.staff_id,
      updated_by: currentId(),
      _weekCopiedV215: !!copied,
      _copySourceDateV215: normDate(sourceDate)
    };
  }
  function protectSourceDateInDraft(rows, sourceDate, sourceRows){
    let next = copyRows(rows || []);
    (sourceRows || []).forEach(src => {
      const sid = String(src.staff_id || '');
      if (!sid) return;
      next = next.filter(r => !(normDate(r?.work_date) === normDate(sourceDate) && String(r?.staff_id || '') === sid));
      next.push(makeCopiedRow(sourceDate, src, sourceDate, false));
    });
    return next;
  }
  function rowKeyCell(row){ return `${String(row?.staff_id || '')}|${normDate(row?.work_date)}`; }
  function hasExistingCell(rows, staffId, date){
    return (rows || []).some(r => String(r?.staff_id || '') === String(staffId || '') && normDate(r?.work_date) === normDate(date) && rowHasRealPosition(r));
  }
  function codeAlreadyUsedByOther(rows, staffId, date, code){
    const c = codeOf({ position_code: code });
    return (rows || []).some(r => String(r?.staff_id || '') !== String(staffId || '') && normDate(r?.work_date) === normDate(date) && codeOf(r) === c && rowHasRealPosition(r));
  }
  function replaceCell(rows, staffId, date, newRow){
    const d = normDate(date);
    const sid = String(staffId || '');
    return (rows || []).filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === sid)).concat(newRow);
  }
  function applyWeeklyCopyToRows(rows, sourceDate, sourceRows, options){
    const sourceKey = normDate(sourceDate);
    const key = monthKeyOfDate(sourceKey);
    const override = !!options?.override;
    let next = protectSourceDateInDraft(rows, sourceKey, sourceRows);
    const copiedCells = new Set();
    const stats = { changed:0, skippedWeekendHoliday:0, skippedLeave:0, skippedOuting:0, skippedExisting:0, skippedDuplicate:0, skippedOutsideMonth:0, protectedSource:0 };
    const targets = weekMonFriDates(sourceKey).filter(d => d !== sourceKey);

    targets.forEach(targetDate => {
      if (!sameMonth(targetDate, key)) { stats.skippedOutsideMonth += Math.max(sourceRows.length, 1); return; }
      if (isNoPosition(targetDate)) { stats.skippedWeekendHoliday += Math.max(sourceRows.length, 1); return; }
      (sourceRows || []).forEach(src => {
        const staffId = String(src.staff_id || '');
        const code = String(src.position_code || src.code || '').trim();
        if (!staffId || isBlankCode(code)) return;
        if (realLeaveOn(staffId, targetDate)) { stats.skippedLeave += 1; return; }
        if (staffHasOuting(staffId, targetDate)) { stats.skippedOuting += 1; return; }
        const existing = hasExistingCell(next, staffId, targetDate);
        if (!override && existing) { stats.skippedExisting += 1; return; }
        if (!override && codeAlreadyUsedByOther(next, staffId, targetDate, code)) { stats.skippedDuplicate += 1; return; }
        const newRow = makeCopiedRow(targetDate, src, sourceKey, true);
        next = replaceCell(next, staffId, targetDate, newRow);
        copiedCells.add(`${staffId}|${normDate(targetDate)}`);
        stats.changed += 1;
      });
    });
    return { rows: next, copiedCells, stats, targets };
  }
  async function confirmCopy(sourceDate, override){
    const msg = `ต้องการคัดลอกตำแหน่งจากวันนี้ไปทั้งสัปดาห์หรือไม่?\n\nวันต้นแบบ: ${normDate(sourceDate)}\nช่วงเป้าหมาย: จันทร์-ศุกร์ในสัปดาห์เดียวกัน\nโหมด: ${override ? 'ทับข้อมูลเดิมที่ไม่ติดเงื่อนไขป้องกัน' : 'คัดลอกเฉพาะช่องว่าง'}`;
    try {
      if (typeof confirmDialog === 'function') return await confirmDialog(msg, 'ยืนยันคัดลอกตำแหน่งทั้งสัปดาห์');
    } catch (_) {}
    return window.confirm(msg);
  }
  function copySummaryText(stats, sourceRowsCount){
    const parts = [`คัดลอก ${stats.changed} ช่อง`];
    if (stats.skippedExisting) parts.push(`คงช่องเดิม ${stats.skippedExisting}`);
    if (stats.skippedLeave) parts.push(`ข้ามวันลา ${stats.skippedLeave}`);
    if (stats.skippedOuting) parts.push(`ข้ามออกหน่วย ${stats.skippedOuting}`);
    if (stats.skippedDuplicate) parts.push(`ข้ามตำแหน่งที่มีคนถืออยู่ ${stats.skippedDuplicate}`);
    if (stats.skippedWeekendHoliday) parts.push(`ข้าม WEEKEND/HOLIDAY`);
    if (stats.skippedOutsideMonth) parts.push(`ข้ามวันที่นอกเดือนนี้`);
    if (!sourceRowsCount) parts.push('ไม่พบข้อมูลวันต้นแบบ');
    return parts.join(' • ');
  }
  async function copyWeekPositions(sourceDateRaw, options={}){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้นที่คัดลอกตำแหน่งทั้งสัปดาห์ได้', 'error');
    const sourceDate = normDate(sourceDateRaw || '');
    if (!sourceDate) return toast('กรุณาเลือกวันต้นแบบก่อน', 'error');
    if (isNoPosition(sourceDate)) return toast('วันต้นแบบเป็น WEEKEND/HOLIDAY จึงคัดลอกตำแหน่งไม่ได้', 'error');
    const key = monthKeyOfDate(sourceDate);
    const ok = await confirmCopy(sourceDate, !!options.override);
    if (!ok) return;
    let rows = ensureDraft(key);
    const sourceRows = sourceRowsForDate(rows, sourceDate);
    if (!sourceRows.length) return toast('ยังไม่พบตำแหน่งของวันต้นแบบ ให้เลือก/สร้างแผนของวันนั้นก่อน', 'error');
    const result = applyWeeklyCopyToRows(rows, sourceDate, sourceRows, options);
    state.monthPositionDraft = { monthKey: key, rows: result.rows };
    state.positionMonthKey = key;
    state.positionWeekSourceDateV215 = sourceDate;
    state.weeklyCopiedPositionCellsV215 = result.copiedCells;
    const rerender = () => { if (typeof renderPage === 'function') renderPage(); };
    try {
      if (typeof withPreservedTableScrollV168 === 'function') withPreservedTableScrollV168(rerender);
      else rerender();
    } catch (_) { rerender(); }
    setTimeout(highlightCopiedCells, 40);
    toast(`คัดลอกตำแหน่งทั้งสัปดาห์แล้ว กรุณาตรวจสอบก่อนบันทึก (${copySummaryText(result.stats, sourceRows.length)})`, result.stats.changed ? undefined : 'error');
  }

  function monthCopyControlsHtml(key){
    const source = defaultSourceDateForMonth(key);
    state.positionWeekSourceDateV215 = source;
    const checked = state.positionWeekOverrideV215 ? 'checked' : '';
    return `<label class="week-copy-source-v215">วันต้นแบบ <input type="date" id="positionWeekSourceDateV215" value="${esc(source)}"></label>
      <label class="week-copy-checkbox-v215"><input type="checkbox" id="positionWeekOverrideV215" ${checked}> ทับข้อมูลเดิม</label>
      <button class="soft-btn week-copy-btn-v215" type="button" data-copy-week-positions-v215="month">คัดลอกตำแหน่งทั้งสัปดาห์</button>`;
  }
  function dailyCopyControlsHtml(){
    const checked = state.positionWeekDailyOverrideV215 ? 'checked' : '';
    return `<label class="week-copy-checkbox-v215"><input type="checkbox" id="positionWeekDailyOverrideV215" ${checked}> ทับข้อมูลเดิม</label>
      <button class="soft-btn week-copy-btn-v215" type="button" data-copy-week-positions-v215="daily">คัดลอกตำแหน่งทั้งสัปดาห์</button>`;
  }
  function injectAfterButton(html, attr, insertHtml){
    const re = new RegExp(`(<button[^>]*${attr}[^>]*>[\\s\\S]*?<\\/button>)`);
    if (re.test(html)) return html.replace(re, `$1${insertHtml}`);
    return html.replace(/(<div class="toolbar">)/, `$1${insertHtml}`);
  }

  const oldRenderPositionMonthPage = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage) {
    window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV215(){
      let html = String(oldRenderPositionMonthPage.apply(this, arguments) || '');
      if (!isAdminSafe() || html.includes('data-copy-week-positions-v215="month"')) return html;
      const key = state.positionMonthKey || state.monthKey || monthKeyOfDate(typeof todayStr === 'function' ? todayStr() : ymd(new Date()));
      html = injectAfterButton(html, 'data-save-month-positions', monthCopyControlsHtml(key));
      return html.replace('Admin เลือกตำแหน่งในช่องได้ แล้วกดบันทึกแผนทั้งเดือน', 'Admin เลือกตำแหน่งในช่องได้ / คัดลอกทั้งสัปดาห์ได้ แล้วกดบันทึกแผนทั้งเดือน');
    };
  }

  const oldRenderPositionsPage = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
  if (oldRenderPositionsPage) {
    window.renderPositionsPage = renderPositionsPage = function renderPositionsPageV215(){
      let html = String(oldRenderPositionsPage.apply(this, arguments) || '');
      if (!isAdminSafe() || html.includes('data-copy-week-positions-v215="daily"')) return html;
      const date = normDate(state.positionDate || (typeof todayStr === 'function' ? todayStr() : ymd(new Date())));
      if (isNoPosition(date)) return html;
      return injectAfterButton(html, 'data-save-positions', dailyCopyControlsHtml());
    };
  }

  function highlightCopiedCells(){
    try {
      const set = state.weeklyCopiedPositionCellsV215;
      if (!set || !set.size) return;
      document.querySelectorAll('[data-month-position-edit]').forEach(sel => {
        const [dateRaw, staffIdRaw] = String(sel.dataset.monthPositionEdit || '').split('|');
        const key = `${String(staffIdRaw || '')}|${normDate(dateRaw)}`;
        if (set.has(key)) {
          const td = sel.closest('td');
          if (td) td.classList.add('week-copy-cell-v215');
        }
      });
    } catch (err) { console.warn(`${VERSION}: highlight failed`, err); }
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV215(){
      const result = previousRenderPage.apply(this, arguments);
      setTimeout(highlightCopiedCells, 20);
      return result;
    };
  }

  document.addEventListener('change', function(e){
    if (e.target?.id === 'positionWeekSourceDateV215') state.positionWeekSourceDateV215 = e.target.value || '';
    if (e.target?.id === 'positionWeekOverrideV215') state.positionWeekOverrideV215 = !!e.target.checked;
    if (e.target?.id === 'positionWeekDailyOverrideV215') state.positionWeekDailyOverrideV215 = !!e.target.checked;
  }, true);

  document.addEventListener('click', async function(e){
    const btn = e.target?.closest?.('[data-copy-week-positions-v215]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const mode = btn.getAttribute('data-copy-week-positions-v215');
    const source = mode === 'daily'
      ? (document.getElementById('positionDateInput')?.value || state.positionDate || (typeof todayStr === 'function' ? todayStr() : ''))
      : (document.getElementById('positionWeekSourceDateV215')?.value || state.positionWeekSourceDateV215 || '');
    const override = mode === 'daily'
      ? !!document.getElementById('positionWeekDailyOverrideV215')?.checked
      : !!document.getElementById('positionWeekOverrideV215')?.checked;
    await copyWeekPositions(source, { override, mode });
  }, true);

  window.copyWeekPositionsV215 = copyWeekPositions;
  console.info(`${VERSION} loaded`);
})();
