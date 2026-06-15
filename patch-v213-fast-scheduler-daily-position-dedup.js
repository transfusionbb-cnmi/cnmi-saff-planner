/* V213: Fast Scheduler Render + Daily Position Dedup
   - Scheduler: renders roster grid without prebuilding staff dropdowns in every duty slot.
     Staff selection is generated only when clicking "เลือกคน" for a slot.
   - Daily positions: removes duplicate daily position rows that have the same code/zone/break/rule/job,
     preferring the row that already has a staff assignment.
   - Daily position save: saves only deduped visible rows and refreshes just that date instead of full app reload.
*/
(function(){
  'use strict';
  const VERSION = 'V213_FAST_SCHEDULER_DAILY_POSITION_DEDUP';
  if (window.__CNMI_V213_FAST_SCHEDULER_DAILY_POSITION_DEDUP__) return;
  window.__CNMI_V213_FAST_SCHEDULER_DAILY_POSITION_DEDUP__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const toast = (msg, tone) => { try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else console.info(msg); } catch (_) { console.info(msg); } };
  const friendly = (err) => { try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } };
  const normDate = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0, 10); } };
  const slotId = (slot) => String((typeof getSlotId === 'function' ? getSlotId(slot) : (slot?.id || slot?._temp_id)) || '');
  const clone = (rows) => { try { return structuredClone(rows || []); } catch (_) { return JSON.parse(JSON.stringify(rows || [])); } };

  function safeRenderNav(){ try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} }
  function safeTitleFor(pageId, fallbackTitle, fallbackSubtitle){
    try {
      const item = (window.NAV_ITEMS || NAV_ITEMS || []).find(x => x.id === pageId) || {};
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = item.title || fallbackTitle || '';
      if (subtitle) subtitle.textContent = item.subtitle || fallbackSubtitle || '';
    } catch (_) {}
  }

  function rosterEnabledStaff(){
    const rows = (state.staff || []).filter(s => {
      try { return typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : s?.is_active !== false && s?.staff_type !== 'แพทย์'; }
      catch (_) { return s?.is_active !== false; }
    });
    try { return orderedStaff(rows); } catch (_) { return rows; }
  }
  function staffPillSafe(id){ try { return id ? staffPill(id) : '<span class="muted">ยังไม่จัด</span>'; } catch (_) { return id || '<span class="muted">ยังไม่จัด</span>'; } }
  function staffColorSafe(s){ try { return staffColor(s); } catch (_) { return s?.color || s?.staff_color || '#dbeafe'; } }
  function textColorSafe(bg){ try { return textColorFor(bg); } catch (_) { return '#0f172a'; } }
  function dutyLabel(code){ try { return DUTY_LABEL[code] || code || ''; } catch (_) { return code || ''; } }

  function currentRosterAssignments(){
    if (state.rosterDraft?.monthKey === state.monthKey && Array.isArray(state.rosterDraft.assignments)) return state.rosterDraft.assignments;
    try { return getAssignmentsForMonth(state.monthKey) || []; } catch (_) { return []; }
  }
  function ensureRosterDraft(){
    if (!state.rosterDraft || state.rosterDraft.monthKey !== state.monthKey || !Array.isArray(state.rosterDraft.assignments)) {
      state.rosterDraft = { monthKey: state.monthKey, assignments: clone(currentRosterAssignments()) };
    }
    return state.rosterDraft.assignments;
  }
  function findAssignmentById(id){
    return (ensureRosterDraft() || []).find(a => slotId(a) === String(id));
  }

  function fastRosterSlotHtml(slot){
    if (!slot) return '<td class="muted">-</td>';
    const id = slotId(slot);
    const disabled = slot.is_locked ? 'disabled' : '';
    return `<td><div class="roster-slot v213-fast-roster-slot ${slot.is_locked?'locked':''}" data-drop-slot="${esc(id)}">
      <div class="assigned-name">${staffPillSafe(slot.staff_id)}</div>
      <div class="slot-meta">${esc(slot.required_role || '-')} ${slot.is_locked?'• locked':''}</div>
      <div class="actions">
        <button class="tiny-btn" type="button" data-edit-roster-slot-v213="${esc(id)}" ${disabled}>เลือกคน</button>
        <button class="tiny-btn" type="button" data-clear-slot="${esc(id)}" ${disabled}>ล้าง</button>
        <button class="tiny-btn" type="button" data-toggle-lock-slot="${esc(id)}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button>
      </div>
    </div></td>`;
  }

  window.renderRosterGrid = renderRosterGrid = function renderRosterGridV213(assignments){
    const rows = assignments || [];
    if (!rows.length) {
      try { return empty('กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร'); }
      catch (_) { return '<div class="empty">กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร</div>'; }
    }
    const range = getMonthRange(state.monthKey);
    const y = range.y, m = range.m;
    const last = new Date(y, m, 0).getDate();
    const columns = (typeof DUTY_COLUMNS !== 'undefined' ? DUTY_COLUMNS : ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT']);
    const byCell = new Map();
    rows.forEach(a => byCell.set(`${normDate(a.duty_date)}|${a.duty_code}`, a));
    const desktop = `<div class="table-wrap roster-table-wrap v213-fast-roster-wrap"><table class="roster-table"><thead><tr><th>วันที่</th>${columns.map(c => `<th>${esc(dutyLabel(c))}</th>`).join('')}</tr></thead><tbody>
      ${Array.from({length:last}, (_,i)=>i+1).map(day => {
        const date = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dow = parseDate(date).toLocaleDateString('th-TH', { weekday:'short' });
        const allowed = new Set((typeof allowedDutyCodesForDate === 'function' ? allowedDutyCodesForDate(date) : columns));
        return `<tr><td><b>${day}</b><br><span class="muted">${esc(dow)}</span>${isHolidayDate(date) ? `<br><span class="badge yellow">${esc(holidayName(date))}</span>` : ''}</td>${columns.map(code => allowed.has(code) ? fastRosterSlotHtml(byCell.get(`${date}|${code}`)) : '<td class="muted">-</td>').join('')}</tr>`;
      }).join('')}
    </tbody></table></div>`;
    const mobile = `<div class="mobile-roster-cards v213-mobile-roster-cards">${Array.from({length:last}, (_,i)=>i+1).map(day => {
      const date = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dow = parseDate(date).toLocaleDateString('th-TH', { weekday:'short' });
      const allowed = (typeof allowedDutyCodesForDate === 'function' ? allowedDutyCodesForDate(date) : columns);
      const slots = allowed.map(code => byCell.get(`${date}|${code}`)).filter(Boolean);
      return `<div class="mobile-card roster-day-card"><div class="mobile-day-head"><b>${day}</b><span>${esc(dow)}</span>${isHolidayDate(date) ? `<span class="badge yellow">${esc(holidayName(date))}</span>` : ''}</div>${slots.map(slot => {
        const id = slotId(slot);
        return `<div class="mobile-roster-slot"><div><b>${esc(dutyLabel(slot.duty_code))}</b><br><span class="muted">${esc(slot.required_role || '-')} ${slot.is_locked?'• locked':''}</span><br>${staffPillSafe(slot.staff_id)}</div><div class="actions"><button class="tiny-btn" type="button" data-edit-roster-slot-v213="${esc(id)}" ${slot.is_locked?'disabled':''}>เลือกคน</button><button class="tiny-btn" type="button" data-clear-slot="${esc(id)}" ${slot.is_locked?'disabled':''}>ล้าง</button><button class="tiny-btn" type="button" data-toggle-lock-slot="${esc(id)}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button></div></div>`;
      }).join('')}</div>`;
    }).join('')}</div>`;
    return desktop + mobile + '<p class="hint v213-speed-note">โหมดเร็ว: ระบบไม่สร้าง dropdown เจ้าหน้าที่ทุกช่องพร้อมกัน จึงเปิดหน้าจัดตารางเวรได้ไวขึ้น หากต้องเปลี่ยนคนให้กด “เลือกคน” ในช่องนั้น หรือใช้ลากชื่อจากรายชื่อเจ้าหน้าที่</p>';
  };

  window.renderSchedulerPage = renderSchedulerPage = function renderSchedulerPageV213(){
    if (typeof isAdmin === 'function' && !isAdmin()) return (typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์</div>');
    const range = getMonthRange(state.monthKey);
    const y = range.y, m = range.m;
    const month = (state.rosterMonths || []).find(x => Number(x.year) === Number(y) && Number(x.month) === Number(m));
    const assignments = currentRosterAssignments().filter(a => { try { return assignmentBelongsToActiveStaff(a); } catch (_) { return true; } });
    const monthHolidays = (state.holidays || []).filter(h => String(h.holiday_date || '').startsWith(state.monthKey));
    const staff = rosterEnabledStaff();
    return `<div class="grid v213-scheduler-page">
      <div class="card">
        <div class="toolbar">
          <label>เดือน <input type="month" id="rosterMonthInput" value="${esc(state.monthKey)}"></label>
          <button class="ghost-btn" type="button" data-generate-roster>สร้างตารางเปล่า</button>
          <button class="soft-btn" type="button" data-auto-assign>สร้างร่าง Auto Assign</button>
          <button class="primary-btn" type="button" data-save-roster>บันทึก</button>
          <button class="ghost-btn danger" type="button" data-clear-roster-month>ล้างข้อมูลเดือนนี้</button>
          <button class="ghost-btn" type="button" data-restore-roster-month>ย้อนกลับข้อมูลล่าสุด</button>
          ${typeof badge === 'function' ? badge(month?.status || 'ยังไม่สร้าง', month?.status==='published'?'green':month?.status==='locked'?'red':'black') : `<span>${esc(month?.status || 'ยังไม่สร้าง')}</span>`}
        </div>
        <form id="holidayForm" class="form-grid compact-form">
          <label>เพิ่มวันหยุดราชการ <input name="holiday_date" type="date" value="${esc(state.monthKey)}-01" required></label>
          <label>ชื่อวันหยุด <input name="title" placeholder="เช่น วันเฉลิมฯ" required></label>
          <button class="soft-btn" type="submit">บันทึกวันหยุด</button>
        </form>
        <div class="hint">Auto Assign จะช่วยเกลี่ยเวรตามกติกาและไม่แตะช่องที่ล็อกไว้</div>
        ${monthHolidays.length ? `<div class="chip-line">${monthHolidays.map(h => `<span class="badge yellow">${formatThaiDate(h.holiday_date)} ${esc(String(h.title || h.name || h.holiday_name || 'วันหยุดราชการ').split(':::')[0].trim())}</span>`).join('')}</div>` : ''}
      </div>
      <div class="roster-board">
        <div class="card">
          <h3>รายชื่อเจ้าหน้าที่</h3>
          <p class="hint">ลากชื่อไปวางในช่องเวรได้เลย / คนที่ปิดจัดเวรจะไม่ถูก Auto Assign</p>
          <div class="staff-pool">
            ${staff.map(s => { const bg = staffColorSafe(s); return `<div class="staff-chip" style="--staff-bg:${esc(bg)};--staff-fg:${esc(textColorSafe(bg))}" draggable="true" data-drag-staff="${esc(s.id)}" data-staff-stat="${esc(s.id)}" title="กดเพื่อดูสถิติเวร"><span>${esc(s.nickname || s.full_name)}</span>${typeof badge === 'function' ? badge(s.staff_type || '-', s.staff_type==='MT'?'blue':'orange') : `<span>${esc(s.staff_type || '-')}</span>`}</div>`; }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="section-title"><h3>ตารางร่าง ${esc(state.monthKey)}</h3><button class="tiny-btn" type="button" data-show-fairness>ดูสมดุลเวร</button></div>
          ${window.renderRosterGrid(assignments)}
        </div>
      </div>
    </div>`;
  };

  function positionKey(row){
    const code = (typeof positionBaseCode === 'function' ? positionBaseCode(row?.position_code || row?.code || '') : String(row?.position_code || row?.code || '').trim());
    return [code, row?.zone || '', row?.break_time || '', row?.main_rule || '', row?.job_desc || ''].map(x => String(x || '').trim()).join('|');
  }
  function dedupeDailyPositionRows(rows){
    const out = [];
    const map = new Map();
    (rows || []).forEach((row, idx) => {
      if (!row) return;
      const key = positionKey(row) || `__row_${idx}`;
      if (!map.has(key)) { map.set(key, out.length); out.push(row); return; }
      const currentIndex = map.get(key);
      const current = out[currentIndex];
      const currentHasStaff = !!current?.staff_id;
      const rowHasStaff = !!row?.staff_id;
      // Prefer the row that already has a selected staff. If both have staff, keep the first to avoid duplicating one position.
      if (!currentHasStaff && rowHasStaff) out[currentIndex] = row;
    });
    try { return sortPositionRows(out); } catch (_) { return out; }
  }
  window.cnmiDeduplicateDailyPositionsV213 = dedupeDailyPositionRows;

  function staffOptionsForPosition(row, selectedId, date){
    let list = [];
    try {
      const base = positionTemplateByCode(row.position_code || row.code, date) || row;
      const checkRow = { ...base, ...row, code: row.position_code || row.code || base.code, position_code: row.position_code || row.code || base.code };
      list = (state.staff || []).filter(s => positionCandidateOk(s, checkRow, date));
      list = orderedStaff(list);
    } catch (_) { list = state.staff || []; }
    const selected = selectedId ? (state.staff || []).find(s => String(s.id) === String(selectedId)) : null;
    if (selected && !list.some(s => String(s.id) === String(selected.id))) list.unshift(selected);
    return list.map(s => `<option value="${esc(s.id)}" ${String(s.id) === String(selectedId || '') ? 'selected' : ''}>${esc(s.nickname || s.full_name || s.email || '-')}</option>`).join('');
  }

  window.renderPositionsPage = renderPositionsPage = function renderPositionsPageV213(){
    try {
      const date = state.positionDate || (typeof todayStr === 'function' ? todayStr() : '');
      const existing = (state.positions || []).filter(x => normDate(x.work_date) === date);
      const template = (typeof positionTemplateForDate === 'function' ? positionTemplateForDate(date) : []) || [];
      let rows = existing.length ? existing.map(r => {
        const base = positionTemplateByCode(r.position_code, date) || {};
        return { ...base, ...r, code: r.position_code, position_code: r.position_code || base.code };
      }) : template.map(p => ({ ...p, position_code:p.code, staff_id:null }));
      rows = dedupeDailyPositionRows(rows);
      const canManage = typeof canManagePositions === 'function' ? canManagePositions(date) : false;
      const key = date.slice(0, 7);
      const incharge = typeof currentInchargeForMonth === 'function' ? currentInchargeForMonth(key) : '';
      const dayStatus = (state.positionDayStatus || []).find(x => normDate(x.work_date) === date);
      const isPublished = dayStatus?.status === 'published';
      const noPosition = typeof isNoPositionDay === 'function' ? isNoPositionDay(date) : false;
      const rowHtml = rows.map((r,idx) => {
        const base = positionTemplateByCode(r.position_code || r.code, date) || r;
        const code = base.code || r.position_code || r.code || 'รอตรวจสอบ';
        const select = canManage ? `<select data-position-row="${idx}" data-position-code="${esc(code)}" data-position-zone="${esc(r.zone || base.zone || '')}" data-position-break="${esc(r.break_time || base.break_time || '')}" data-position-rule="${esc(r.main_rule || base.main_rule || '')}" data-position-job="${esc(r.job_desc || base.job_desc || '')}"><option value="">-</option>${staffOptionsForPosition(r, r.staff_id, date)}</select>` : staffPillSafe(r.staff_id);
        const label = typeof positionLabelForCell === 'function' ? positionLabelForCell(r.position_code || base.code) : (r.position_code || base.code || '');
        return `<tr><td>${esc(r.zone || base.zone || '')}</td><td><b>${esc(label)}</b></td><td>${esc(r.break_time || base.break_time || '')}</td><td>${select}</td><td>${esc(r.main_rule || base.main_rule || '')}</td><td>${esc(r.job_desc || base.job_desc || '')}</td></tr>`;
      }).join('');
      const cardHtml = rows.map((r,idx) => {
        const base = positionTemplateByCode(r.position_code || r.code, date) || r;
        const code = base.code || r.position_code || r.code || 'รอตรวจสอบ';
        const select = canManage ? `<select data-position-row="${idx}" data-position-code="${esc(code)}" data-position-zone="${esc(r.zone || base.zone || '')}" data-position-break="${esc(r.break_time || base.break_time || '')}" data-position-rule="${esc(r.main_rule || base.main_rule || '')}" data-position-job="${esc(r.job_desc || base.job_desc || '')}"><option value="">-</option>${staffOptionsForPosition(r, r.staff_id, date)}</select>` : staffPillSafe(r.staff_id);
        return `<div class="position-mobile-card"><div class="section-title"><h3>${esc(typeof positionLabelForCell === 'function' ? positionLabelForCell(r.position_code || base.code) : (r.position_code || base.code || ''))}</h3>${typeof badge === 'function' ? badge(r.zone || base.zone || '-', (r.zone || base.zone) === 'ออกหน่วย' ? 'red' : 'blue') : `<span>${esc(r.zone || base.zone || '-')}</span>`}</div><div class="muted">พัก ${esc(r.break_time || base.break_time || '-')} • ${esc(r.main_rule || base.main_rule || '')}</div><label>ผู้รับผิดชอบ ${select}</label><p>${esc(r.job_desc || base.job_desc || '')}</p></div>`;
      }).join('');
      const table = `<div class="table-wrap daily-position-table desktop-table v213-daily-position-table"><table><thead><tr><th>โซน</th><th>ตำแหน่ง</th><th>เวลาพัก</th><th>ผู้รับผิดชอบ</th><th>ผู้ปฏิบัติหลัก</th><th>หน้าที่โดยย่อ</th></tr></thead><tbody>${rowHtml}</tbody></table></div><div class="mobile-position-list">${cardHtml}</div>`;
      return `<div class="card v213-positions-page">
        <div class="toolbar">
          <label>วันที่ <input type="date" id="positionDateInput" value="${esc(date)}"></label>
          ${typeof isAdmin === 'function' && isAdmin() ? `<label>อินชาร์จประจำเดือน <select id="inchargeSelect"><option value="">ไม่ระบุ</option>${staffOptions(incharge)}</select></label><button class="soft-btn" type="button" data-save-incharge>บันทึกอินชาร์จ</button>` : `<span>${typeof badge === 'function' ? badge('อินชาร์จ: ' + staffNick(incharge), 'blue') : esc('อินชาร์จ: ' + incharge)}</span>`}
          ${canManage && !noPosition ? '<button class="primary-btn" type="button" data-save-positions>บันทึกตำแหน่งวันนี้</button>' : ''}
          ${isPublished ? '<span class="badge green">ประกาศแล้ว</span>' : '<span class="badge orange">ร่าง</span>'}
        </div>
        <div class="notice soft-notice">ตรวจตำแหน่งของวันนี้ให้ตรงกับคนลาและงานจริง แล้วกดบันทึกตำแหน่งวันนี้ หากมีคนลาหลังจากบันทึกแล้ว ให้ปรับหน้างานและบันทึกใหม่อีกครั้ง</div>
        ${noPosition ? `<div class="notice">วันนี้เป็น${isHolidayDate(date) ? 'วันหยุดราชการ' : 'วันเสาร์-อาทิตย์'} จึงไม่ต้องจัดตำแหน่งรายวัน</div>` : ''}
        ${!noPosition && hasOuting(date) ? `<div class="notice">วันนี้มีออกหน่วย: คนที่ถูกติ๊กในกิจกรรมจะถูกจัดลงชุดออกหน่วย ส่วนคนที่เหลือจะถูกเกลี่ยไปตำแหน่งห้อง Blood Bank</div>` : ''}
        ${noPosition ? (typeof empty === 'function' ? empty('ไม่มีตารางตำแหน่งรายวันสำหรับวันนี้') : '') : table}
      </div>`;
    } catch (err) {
      console.error(`${VERSION}: renderPositionsPage failed`, err);
      return `<div class="notice error-notice">โหลดตารางตำแหน่งรายวันไม่สำเร็จ: ${esc(err?.message || err)}</div>`;
    }
  };

  window.savePositions = savePositions = async function savePositionsV213(){
    const date = document.getElementById('positionDateInput')?.value || state.positionDate || (typeof todayStr === 'function' ? todayStr() : '');
    if (typeof canManagePositions === 'function' && !canManagePositions(date)) return toast('เฉพาะ Admin หรืออินชาร์จประจำเดือนนี้เท่านั้น', 'error');
    const selects = Array.from(document.querySelectorAll('[data-position-row]'));
    let rows = selects.map(sel => {
      const base = (typeof positionTemplateByCode === 'function' ? positionTemplateByCode(sel.dataset.positionCode, date) : {}) || {};
      const code = sel.dataset.positionCode || base.code || 'รอตรวจสอบ';
      return {
        work_date: date,
        position_code: code,
        zone: sel.dataset.positionZone || base.zone || 'รอตรวจสอบ',
        break_time: sel.dataset.positionBreak || base.break_time || '-',
        main_rule: sel.dataset.positionRule || base.main_rule || '',
        job_desc: sel.dataset.positionJob || base.job_desc || '',
        staff_id: sel.value || null,
        updated_by: typeof currentStaffId === 'function' ? currentStaffId() : null
      };
    }).filter(r => r.position_code);
    rows = dedupeDailyPositionRows(rows);
    try {
      if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกตำแหน่งวันนี้');
      const del = await sb.from('daily_positions').delete().eq('work_date', date);
      if (del.error) throw del.error;
      const ins = rows.length ? await sb.from('daily_positions').insert(rows).select('*') : { data:[], error:null };
      if (ins.error) throw ins.error;
      const statusRow = { work_date: date, month_key: date.slice(0,7), status: 'draft', updated_by: typeof currentStaffId === 'function' ? currentStaffId() : null };
      const st = await sb.from('daily_position_day_status').upsert(statusRow, { onConflict:'work_date' }).select('*').maybeSingle();
      if (st.error) throw st.error;
      state.positions = (state.positions || []).filter(r => normDate(r.work_date) !== date).concat(ins.data || rows);
      state.positionDayStatus = (state.positionDayStatus || []).filter(r => normDate(r.work_date) !== date).concat(st.data || statusRow);
      renderPage();
      toast('บันทึกตำแหน่งรายวันแล้ว');
      console.info(`${VERSION}: daily positions saved`, { date, rows: rows.length });
    } catch (err) {
      console.error(`${VERSION}: savePositions failed`, err);
      toast('บันทึกตำแหน่งรายวันไม่สำเร็จ: ' + friendly(err), 'error');
    } finally {
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  };

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = renderPage = function renderPageV213(){
    if (state?.page === 'scheduler') {
      safeTitleFor('scheduler', 'จัดตารางเวร', 'สร้างร่าง Auto Assign และบันทึกตาราง');
      safeRenderNav();
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = window.renderSchedulerPage();
      return;
    }
    if (state?.page === 'positions') {
      safeTitleFor('positions', 'ตารางตำแหน่งรายวัน', 'ดู/ปรับตำแหน่งประจำวันก่อนเริ่มงาน');
      safeRenderNav();
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = window.renderPositionsPage();
      return;
    }
    return previousRenderPage ? previousRenderPage.apply(this, arguments) : undefined;
  };

  window.addEventListener('click', function(e){
    const nav = e.target?.closest?.('[data-page="scheduler"]');
    if (!nav) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    try {
      state.page = 'scheduler';
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      renderPage();
      console.info(`${VERSION}: scheduler opened immediately, no blocking refresh`);
    } catch (err) {
      console.error(`${VERSION}: scheduler open failed`, err);
      toast('เปิดหน้าจัดตารางเวรไม่สำเร็จ: ' + friendly(err), 'error');
    }
  }, true);

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-edit-roster-slot-v213]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const id = btn.dataset.editRosterSlotV213;
    const assignments = ensureRosterDraft();
    const slot = assignments.find(a => slotId(a) === String(id));
    if (!slot) return toast('ไม่พบช่องเวรนี้ กรุณารีเฟรชหน้า', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่');
    let options = '';
    try { options = staffOptionList(slot.staff_id, st => canStaffWorkSlot(st.id, slot, assignments)); }
    catch (err) {
      console.warn(`${VERSION}: staff option build fallback`, err);
      options = rosterEnabledStaff().map(s => `<option value="${esc(s.id)}" ${String(s.id)===String(slot.staff_id||'')?'selected':''}>${esc(s.nickname || s.full_name || '-')} (${esc(s.staff_type || '-')})</option>`).join('');
    }
    const html = `<h2>เลือกคนลงเวร</h2><p class="hint">${esc(slot.duty_date)} • ${esc(dutyLabel(slot.duty_code))} • ${esc(slot.required_role || '-')}</p><form id="v213RosterSlotForm" data-slot-id="${esc(id)}" class="form-grid compact-form"><label>ผู้รับผิดชอบ <select name="staff_id"><option value="">ยังไม่จัด</option>${options}</select></label><button class="primary-btn" type="submit">บันทึกช่องนี้</button></form>`;
    if (typeof showModal === 'function') showModal(html); else toast('ไม่สามารถเปิด popup ได้', 'error');
  }, true);

  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'v213RosterSlotForm') return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const id = e.target.dataset.slotId;
    const slot = findAssignmentById(id);
    if (!slot) return toast('ไม่พบช่องเวรนี้ กรุณารีเฟรชหน้า', 'error');
    const fd = new FormData(e.target);
    const staffId = fd.get('staff_id') || null;
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่');
    if (staffId && !canStaffWorkSlot(staffId, slot, state.rosterDraft.assignments)) return toast('คนนี้ติดลา/ไม่รับเวร หรือสิทธิ์เวรตามวันไม่ตรงกับช่องนี้', 'error');
    slot.staff_id = staffId;
    try { if (typeof closeModal === 'function') closeModal(); } catch (_) {}
    renderPage();
    toast('แก้ไขช่องเวรแล้ว กดบันทึกเพื่อบันทึกจริง');
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v213-fast-roster-wrap .roster-slot{min-width:122px}
    .v213-fast-roster-slot .actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
    .v213-speed-note{margin-top:10px}
    .v213-daily-position-table table tbody tr td{vertical-align:middle}
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
