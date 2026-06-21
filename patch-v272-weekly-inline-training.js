/* CNMI Staff Planner V272 - Weekly Inline Mentor Assignment
   - Admin assigns new staff / Intern mentors directly in the monthly daytime-position table.
   - One assignment covers Monday-Friday of the selected week.
   - Trainees inherit the mentor's daytime position and never consume a main Slot.
   - A missing/unavailable mentor can be replaced for one specific day.
   - The former mentor page is history/edit-only by default.
*/
(function(){
  'use strict';
  const VERSION = 'V272_WEEKLY_INLINE_TRAINING';
  if (window.__CNMI_V272_WEEKLY_INLINE_TRAINING__) return;
  window.__CNMI_V272_WEEKLY_INLINE_TRAINING__ = true;

  const TABLE = 'staff_training_assignments';
  const RPC = 'replace_staff_training_range_v272';
  const expandedStaff = new Set();
  let saving = false;

  function st(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function db(){ try { return sb || window.sb || null; } catch (_) { return window.sb || null; } }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function toast(message,tone){
    try { showToast(message,tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function assignGlobal(name,value){
    try { window[name] = value; } catch (_) {}
    try { (0,eval)(`${name}=window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return String(st()?.profile?.role || '').toLowerCase() === 'admin'; }
  }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return st()?.profile?.id || null; }
  }
  function normId(value){ return String(value == null ? '' : value); }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0,10); }
  }
  function validDate(value){ return /^\d{4}-\d{2}-\d{2}$/.test(normDate(value)); }
  function addDays(value,amount){
    const d = new Date(`${normDate(value)}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + Number(amount || 0));
    return d.toISOString().slice(0,10);
  }
  function weekBounds(value){
    const d = new Date(`${normDate(value)}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return { start:'', end:'' };
    const day = d.getUTCDay();
    const back = day === 0 ? 6 : day - 1;
    const start = addDays(normDate(value),-back);
    return { start, end:addDays(start,4) };
  }
  function dateLabel(value){
    const d = new Date(`${normDate(value)}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return normDate(value);
    return d.toLocaleDateString('th-TH',{ day:'numeric', month:'short' });
  }
  function trainingRows(){ return Array.isArray(st()?.trainingAssignmentsV271) ? st().trainingAssignmentsV271 : []; }
  function activeOn(row,date){
    const d = normDate(date);
    return !!row && row.active !== false && validDate(d) && normDate(row.start_date) <= d && d <= normDate(row.end_date);
  }
  function identityMatches(row,staffId,traineeName){
    const sid = normId(staffId);
    if (sid) return normId(row?.trainee_staff_id) === sid;
    const name = String(traineeName || '').trim().toLowerCase();
    return !row?.trainee_staff_id && String(row?.trainee_name || '').trim().toLowerCase() === name;
  }
  function assignmentsForIdentity(staffId,traineeName){ return trainingRows().filter(row => identityMatches(row,staffId,traineeName)); }
  function assignmentForDate(staffId,traineeName,date){ return assignmentsForIdentity(staffId,traineeName).find(row => activeOn(row,date)) || null; }
  function isTrainingPersonOnDate(staffId,date){ return !!normId(staffId) && !!assignmentForDate(staffId,'',date); }
  function trainingName(row){
    if (row?.trainee_staff_id) return staffName(row.trainee_staff_id);
    return row?.trainee_name || '-';
  }
  function typeLabel(type){ return type === 'intern' ? 'Intern' : 'น้องใหม่'; }
  function staffById(id){ return (st()?.staff || []).find(person => normId(person?.id) === normId(id)) || null; }
  function staffName(personOrId){
    const person = typeof personOrId === 'object' ? personOrId : staffById(personOrId);
    return person ? (person.nickname || person.full_name || person.email || '-') : '-';
  }
  function activeStaff(){
    const rows = (st()?.staff || []).filter(person => person && person.is_active !== false && person.active !== false);
    try { return orderedStaff(rows); } catch (_) { return rows; }
  }
  function knownTrainee(person,dates){
    if (!person?.id) return false;
    const sid = normId(person.id);
    if (expandedStaff.has(sid)) return true;
    if (person.is_trainee === true || person.is_intern === true) return true;
    if (/น้องใหม่|เด็กฝึกงาน|intern|trainee|probation/i.test(String(person.position_training_status || person.training_status || ''))) return true;
    return assignmentsForIdentity(sid,'').some(row => (dates || []).some(date => activeOn(row,date)));
  }
  function mentorAvailable(mentorId,date){
    const person = staffById(mentorId);
    if (!person) return false;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(person,normDate(date),'day_position');
      if (result) return !!result.available;
    } catch (_) {}
    try { return !window.cnmiV265?.unavailableRecord?.(mentorId,normDate(date)); }
    catch (_) { return true; }
  }
  function traineeAvailable(staffId,date){
    if (!staffId) return true;
    const person = staffById(staffId);
    if (!person) return true;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(person,normDate(date),'day_position');
      return !result || !!result.available;
    } catch (_) { return true; }
  }
  function noPositionDay(date){
    try { return !!isNoPositionDay(normDate(date)); }
    catch (_) {
      try { return !!isWeekend(normDate(date)) || !!isHolidayDate(normDate(date)); }
      catch (_) { return false; }
    }
  }
  function hasOutingSafe(date){ try { return !!hasOuting(normDate(date)); } catch (_) { return false; } }
  function codeOf(row){ return String(row?.position_code || row?.code || '').trim(); }
  function monthWeeks(dates){
    const map = new Map();
    (dates || []).forEach(date => {
      const b = weekBounds(date);
      if (!b.start) return;
      if (!map.has(b.start)) map.set(b.start,{ start:b.start,end:b.end,dates:[] });
      map.get(b.start).dates.push(normDate(date));
    });
    return Array.from(map.values()).sort((a,b) => a.start.localeCompare(b.start)).map((row,index) => ({ ...row,index:index+1 }));
  }
  function dominantWeekAssignment(staffId,traineeName,week){
    const weekdays = Array.from({length:5},(_,i) => addDays(week.start,i));
    const rows = weekdays.map(date => assignmentForDate(staffId,traineeName,date)).filter(Boolean);
    if (!rows.length) return { row:null,mixed:false };
    const groups = new Map();
    rows.forEach(row => {
      const key = `${row.trainee_type || 'new_staff'}|${normId(row.mentor_staff_id)}`;
      const entry = groups.get(key) || { row,count:0 };
      entry.count += 1;
      groups.set(key,entry);
    });
    const sorted = Array.from(groups.values()).sort((a,b) => b.count-a.count);
    return { row:sorted[0]?.row || rows[0],mixed:groups.size>1 };
  }
  function weekControlHtml(staffId,traineeName,week){
    const current = dominantWeekAssignment(staffId,traineeName,week);
    const row = current.row;
    const type = row?.trainee_type || '';
    const mentorId = normId(row?.mentor_staff_id);
    const mentors = activeStaff().filter(person => normId(person.id) !== normId(staffId));
    const identityAttrs = staffId
      ? `data-trainee-staff-id="${esc(staffId)}"`
      : `data-trainee-name="${esc(traineeName)}"`;
    return `<div class="v272-week-card ${row?'active':''}" data-v272-week-card>
      <div class="v272-week-title"><b>สัปดาห์ ${week.index}</b><small>${esc(dateLabel(week.start))}–${esc(dateLabel(week.end))}</small></div>
      <select data-v272-training-type aria-label="ประเภทผู้ฝึก">
        <option value="" ${!type?'selected':''}>ไม่เป็นผู้ฝึก</option>
        <option value="new_staff" ${type==='new_staff'?'selected':''}>น้องใหม่</option>
        <option value="intern" ${type==='intern'?'selected':''}>Intern</option>
      </select>
      <select data-v272-week-mentor aria-label="พี่เลี้ยง" ${!type?'disabled':''}>
        <option value="">เลือกพี่เลี้ยง</option>
        ${mentors.map(person => `<option value="${esc(person.id)}" ${mentorId===normId(person.id)?'selected':''}>${esc(staffName(person))}</option>`).join('')}
      </select>
      ${current.mixed?'<small class="v272-mixed-note">มีพี่เลี้ยงแทนบางวัน</small>':''}
      <button type="button" class="tiny-btn" data-v272-save-week ${identityAttrs} data-week-start="${esc(week.start)}" data-week-end="${esc(week.end)}">บันทึกสัปดาห์</button>
      <small class="v272-save-state" aria-live="polite"></small>
    </div>`;
  }
  function mentorSummaryForPerson(person,dates){
    const names = new Set();
    trainingRows().forEach(row => {
      if (normId(row.mentor_staff_id) !== normId(person?.id)) return;
      if ((dates || []).some(date => activeOn(row,date))) names.add(trainingName(row));
    });
    return Array.from(names);
  }
  function mentorControlCell(person,dates){
    const sid = normId(person?.id);
    const weeks = monthWeeks(dates);
    if (knownTrainee(person,dates)) {
      return `<td class="v272-mentor-week-cell"><div class="v272-week-controls">${weeks.map(week => weekControlHtml(sid,'',week)).join('')}</div></td>`;
    }
    const mentees = mentorSummaryForPerson(person,dates);
    return `<td class="v272-mentor-week-cell v272-regular-staff-cell">
      ${mentees.length?`<div class="v272-mentor-of"><b>เป็นพี่เลี้ยงให้</b><small>${esc(mentees.join(', '))}</small></div>`:''}
      ${isAdminSafe()?`<button type="button" class="tiny-btn ghost" data-v272-expand-training="${esc(sid)}">กำหนดเป็นน้องใหม่/Intern</button>`:'-'}
    </td>`;
  }
  function externalControlCell(name,dates){
    return `<td class="v272-mentor-week-cell"><div class="v272-week-controls">${monthWeeks(dates).map(week => weekControlHtml('',name,week)).join('')}</div></td>`;
  }
  function operationalRows(rows){
    return (Array.isArray(rows)?rows:[]).filter(row => !isTrainingPersonOnDate(row?.staff_id,row?.work_date));
  }
  function mentorRowForDate(rows,mentorId,date){
    return (rows || []).find(row => normId(row?.staff_id) === normId(mentorId) && normDate(row?.work_date) === normDate(date) && codeOf(row) && codeOf(row) !== 'รอตรวจสอบ') || null;
  }
  function substituteOptions(rows,date,assignment){
    const seen = new Set();
    return (rows || []).filter(row => normDate(row?.work_date) === normDate(date) && codeOf(row) && codeOf(row) !== 'รอตรวจสอบ')
      .map(row => staffById(row.staff_id)).filter(Boolean)
      .filter(person => {
        const sid = normId(person.id);
        if (!sid || seen.has(sid) || sid === normId(assignment?.trainee_staff_id) || isTrainingPersonOnDate(sid,date) || !mentorAvailable(sid,date)) return false;
        seen.add(sid); return true;
      });
  }
  function followCellHtml(assignment,date,rows){
    const traineeId = normId(assignment?.trainee_staff_id);
    if (traineeId && !traineeAvailable(traineeId,date)) {
      return `<div class="v272-follow-status unavailable"><b>${esc(typeLabel(assignment.trainee_type))}</b><span>ผู้ฝึกลา/ไม่พร้อมทำงาน</span><small>ไม่นับ Slot</small></div>`;
    }
    const mentorId = normId(assignment?.mentor_staff_id);
    const mentorRow = mentorRowForDate(rows,mentorId,date);
    const okay = !!mentorRow && mentorAvailable(mentorId,date);
    if (okay) {
      return `<div class="v272-follow-status"><span>ติดตาม: <b>${esc(staffName(mentorId))}</b></span><strong>${esc(codeOf(mentorRow))}</strong><small>${esc(typeLabel(assignment.trainee_type))} · ไม่นับ Slot</small></div>`;
    }
    const options = substituteOptions(rows,date,assignment);
    const identityAttrs = traineeId
      ? `data-trainee-staff-id="${esc(traineeId)}"`
      : `data-trainee-name="${esc(assignment?.trainee_name || '')}"`;
    return `<div class="v272-follow-status warning"><b>กรุณาเลือกพี่เลี้ยงแทน</b><small>${esc(staffName(mentorId))} ลา/ไม่มีตำแหน่งวันนี้</small>
      ${isAdminSafe()?`<select data-v272-day-mentor><option value="">เลือกคนที่มีตำแหน่งวันนี้</option>${options.map(person => `<option value="${esc(person.id)}">${esc(staffName(person))} · ${esc(codeOf(mentorRowForDate(rows,person.id,date)))}</option>`).join('')}</select><button type="button" class="tiny-btn warn" data-v272-save-day-mentor ${identityAttrs} data-date="${esc(normDate(date))}" data-trainee-type="${esc(assignment?.trainee_type || 'new_staff')}">บันทึกเฉพาะวันนี้</button>`:''}
      <small>ไม่นับ Slot</small></div>`;
  }
  function externalAssignmentsForDates(dates){
    const map = new Map();
    trainingRows().forEach(row => {
      if (row.trainee_staff_id || !row.trainee_name) return;
      if (!(dates || []).some(date => activeOn(row,date))) return;
      const key = String(row.trainee_name).trim().toLowerCase();
      if (!map.has(key)) map.set(key,String(row.trainee_name).trim());
    });
    return Array.from(map.values());
  }
  function buildExternalRow(name,dates,rows){
    const tds = (dates || []).map(date => {
      if (noPositionDay(date)) return `<td class="matrix-cell no-position-day"><span>WEEKEND/HOLIDAY</span></td>`;
      const assignment = assignmentForDate('',name,date);
      return assignment
        ? `<td class="matrix-cell v272-training-follow-cell">${followCellHtml(assignment,date,rows)}</td>`
        : `<td class="matrix-cell v272-training-empty-cell"><span>ยังไม่กำหนดพี่เลี้ยง</span></td>`;
    }).join('');
    return `<tr class="v272-external-training-row"><td class="sticky-col staff-col staff-color-cell v272-external-name"><div class="matrix-staff-name"><b>${esc(name)}</b><small>Intern/ผู้ฝึกภายนอก</small></div></td><td class="sticky-col summary-col summary-action-cell"><span class="badge orange">ไม่นับ Slot</span></td>${externalControlCell(name,dates)}${tds}</tr>`;
  }
  function correctCountRows(root,dates,rows){
    const countCells = root.querySelectorAll('thead tr.count-role-row th.count-role-cell');
    (dates || []).forEach((date,index) => {
      const cell = countCells[index];
      if (!cell || noPositionDay(date)) return;
      let baseList = [];
      try {
        baseList = hasOutingSafe(date)
          ? (window.cnmiV265?.actualAvailableStaff?.(date) || [])
          : (window.cnmiV233?.weeklyAvailableStaff?.(date) || window.cnmiV265?.actualAvailableStaff?.(date) || []);
      } catch (_) {}
      const available = baseList.filter(person => !isTrainingPersonOnDate(person?.id,date)).length;
      let slots = 0;
      try { slots = (window.cnmiV265?.expectedTemplatesV265?.(date) || []).length; } catch (_) {}
      if (!slots) {
        const m = String(cell.textContent || '').match(/\/(\d+)/);
        slots = Number(m?.[1] || 0);
      }
      const assigned = new Set((rows || []).filter(row => normDate(row?.work_date) === normDate(date) && codeOf(row) && codeOf(row) !== 'รอตรวจสอบ').map(row => normId(row.staff_id))).size;
      const target = Math.min(available || slots,slots || available);
      cell.classList.toggle('complete',assigned >= target);
      cell.classList.toggle('has-missing',assigned < target);
      cell.innerHTML = `<b>${esc(available)}/${esc(slots)} คน</b>`;
      cell.title = `เจ้าหน้าที่หลักที่ทำงานจริง ${available} คน • ผู้ฝึกไม่นับ Slot`;
    });
  }
  function decorateMatrixHtml(html,dates,rows){
    if (typeof document === 'undefined') return html;
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const root = template.content;
    const table = root.querySelector('.month-position-matrix table');
    if (!table) return html;

    const headRows = table.querySelectorAll('thead tr');
    headRows.forEach((tr,index) => {
      const th = document.createElement('th');
      th.className = `v272-mentor-week-head ${index ? 'v272-secondary-head' : ''}`;
      th.textContent = index === 0 ? 'พี่เลี้ยงรายสัปดาห์' : (index === 1 ? 'ผู้ฝึกไม่นับ Slot' : '-');
      tr.insertBefore(th,tr.children[2] || null);
    });

    const operational = operationalRows(rows);
    const bodyRows = Array.from(table.querySelectorAll('tbody > tr'));
    bodyRows.forEach(tr => {
      const idButton = tr.querySelector('[data-month-position-stat]');
      const sid = normId(idButton?.dataset?.monthPositionStat);
      const person = staffById(sid);
      if (!sid || !person) return;
      const mentorCellTemplate = document.createElement('template');
      mentorCellTemplate.innerHTML = mentorControlCell(person,dates);
      tr.insertBefore(mentorCellTemplate.content.firstElementChild,tr.children[2] || null);
      (dates || []).forEach((date,dateIndex) => {
        if (noPositionDay(date)) return;
        const assignment = assignmentForDate(sid,'',date);
        if (!assignment) return;
        const td = tr.children[3 + dateIndex];
        if (!td) return;
        td.className = 'matrix-cell v272-training-follow-cell';
        td.innerHTML = followCellHtml(assignment,date,operational);
      });
      const nameSmall = tr.querySelector('.matrix-staff-name small');
      if (nameSmall && knownTrainee(person,dates)) {
        const types = new Set(assignmentsForIdentity(sid,'').filter(row => (dates || []).some(date => activeOn(row,date))).map(row => typeLabel(row.trainee_type)));
        nameSmall.textContent = `${person.staff_type || ''}${types.size ? ` • ${Array.from(types).join('/')}` : ' • ผู้ฝึก'} • ไม่นับ Slot`;
      }
    });

    const tbody = table.querySelector('tbody');
    externalAssignmentsForDates(dates).forEach(name => tbody?.insertAdjacentHTML('beforeend',buildExternalRow(name,dates,operational)));
    correctCountRows(root,dates,operational);

    const legend = root.querySelector('.matrix-legend') || root.querySelector('.monthly-matrix-wrap');
    if (legend && !root.querySelector('[data-v272-add-external-training]')) {
      const action = document.createElement('div');
      action.className = 'v272-training-toolbar';
      action.innerHTML = `<span><b>น้องใหม่/Intern:</b> กำหนดพี่เลี้ยงในคอลัมน์ “พี่เลี้ยงรายสัปดาห์” แล้วระบบจะใช้วันจันทร์–ศุกร์อัตโนมัติ</span>${isAdminSafe()?'<button type="button" class="tiny-btn" data-v272-add-external-training>เพิ่ม Intern/ผู้ฝึกภายนอก</button>':''}`;
      legend.insertAdjacentElement('afterend',action);
    }
    return template.innerHTML;
  }
  async function replaceRange({ traineeStaffId=null,traineeName=null,traineeType='new_staff',startDate,endDate,mentorStaffId=null,note=null }){
    if (!isAdminSafe()) throw new Error('เฉพาะ Admin เท่านั้น');
    if (!db()) throw new Error('ไม่พบ Supabase client');
    if (!validDate(startDate) || !validDate(endDate) || normDate(endDate) < normDate(startDate)) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    if (!traineeStaffId && !String(traineeName || '').trim()) throw new Error('ไม่พบผู้ฝึก');
    if (mentorStaffId && normId(mentorStaffId) === normId(traineeStaffId)) throw new Error('ผู้ฝึกกับพี่เลี้ยงต้องเป็นคนละคน');
    const result = await db().rpc(RPC,{
      p_trainee_staff_id:traineeStaffId || null,
      p_trainee_name:String(traineeName || '').trim() || null,
      p_trainee_type:traineeType || 'new_staff',
      p_start_date:normDate(startDate),
      p_end_date:normDate(endDate),
      p_mentor_staff_id:mentorStaffId || null,
      p_note:note || null,
      p_actor_id:currentStaff()
    });
    if (result.error) {
      if (/function|schema cache|replace_staff_training_range_v272/i.test(friendly(result.error))) {
        throw new Error(`กรุณารันไฟล์ supabase_v272_weekly_inline_training.sql ก่อนใช้งาน (${friendly(result.error)})`);
      }
      throw result.error;
    }
    // RPC ลบ daily_positions เดิมของผู้ฝึกในช่วงที่แก้ภายใน Transaction เดียวแล้ว
    // ฝั่งหน้าเว็บล้าง State ซ้ำเพื่อไม่ให้แถวเก่าค้างจนกว่าจะ Refresh
    if (traineeStaffId) {
      const stateRef = st();
      if (stateRef && Array.isArray(stateRef.positions)) {
        stateRef.positions = stateRef.positions.filter(row => !(
          normId(row?.staff_id) === normId(traineeStaffId)
          && normDate(row?.work_date) >= normDate(startDate)
          && normDate(row?.work_date) <= normDate(endDate)
        ));
      }
    }
    await window.cnmiV271?.loadTrainingAssignments?.({ force:true });
    cleanDraftTrainingRows();
    return result.data;
  }
  function cleanDraftTrainingRows(){
    const stateRef = st();
    if (stateRef?.monthPositionDraft?.rows) stateRef.monthPositionDraft.rows = operationalRows(stateRef.monthPositionDraft.rows);
  }
  function saveState(button,text,tone){
    const el = button?.closest?.('[data-v272-week-card]')?.querySelector('.v272-save-state') || button?.parentElement?.querySelector?.('.v272-save-state');
    if (el) { el.textContent = text || ''; el.dataset.tone = tone || ''; }
  }
  async function saveWeek(button){
    if (saving) return;
    const card = button.closest('[data-v272-week-card]');
    const type = String(card?.querySelector('[data-v272-training-type]')?.value || '');
    const mentor = String(card?.querySelector('[data-v272-week-mentor]')?.value || '');
    const staffId = normId(button.dataset.traineeStaffId) || null;
    const name = String(button.dataset.traineeName || '').trim() || null;
    if (type && !mentor) return toast('กรุณาเลือกพี่เลี้ยงของสัปดาห์นี้','error');
    saving = true;
    button.disabled = true;
    saveState(button,'กำลังบันทึก…','saving');
    try {
      await replaceRange({ traineeStaffId:staffId,traineeName:name,traineeType:type || 'new_staff',startDate:button.dataset.weekStart,endDate:button.dataset.weekEnd,mentorStaffId:type?mentor:null,note:'กำหนดจากตารางตำแหน่งกลางวัน V272' });
      saveState(button,'บันทึกแล้ว','saved');
      toast(type ? `กำหนด${typeLabel(type)}ติดตาม ${staffName(mentor)} วันจันทร์–ศุกร์แล้ว` : 'ยกเลิกสถานะผู้ฝึกของสัปดาห์นี้แล้ว');
      setTimeout(() => { try { renderPage(); } catch (_) {} },80);
    } catch (error) {
      console.error(`${VERSION}: weekly mentor save failed`,error);
      saveState(button,'บันทึกไม่สำเร็จ','error');
      toast(friendly(error),'error');
    } finally { saving=false; button.disabled=false; }
  }
  async function saveDayOverride(button){
    if (saving) return;
    const wrap = button.closest('.v272-follow-status');
    const mentor = String(wrap?.querySelector('[data-v272-day-mentor]')?.value || '');
    if (!mentor) return toast('กรุณาเลือกพี่เลี้ยงแทนวันนี้','error');
    saving = true; button.disabled = true;
    try {
      await replaceRange({
        traineeStaffId:normId(button.dataset.traineeStaffId) || null,
        traineeName:String(button.dataset.traineeName || '').trim() || null,
        traineeType:button.dataset.traineeType || 'new_staff',
        startDate:button.dataset.date,endDate:button.dataset.date,
        mentorStaffId:mentor,note:'พี่เลี้ยงแทนเฉพาะวันจากตารางตำแหน่งกลางวัน V272'
      });
      toast(`กำหนด ${staffName(mentor)} เป็นพี่เลี้ยงแทนวันที่ ${dateLabel(button.dataset.date)} แล้ว`);
      setTimeout(() => { try { renderPage(); } catch (_) {} },80);
    } catch (error) { toast(friendly(error),'error'); }
    finally { saving=false; button.disabled=false; }
  }
  function externalModal(){
    const dates = (() => {
      const key = String(st()?.positionMonthKey || st()?.monthKey || new Date().toISOString().slice(0,7)).slice(0,7);
      const [y,m] = key.split('-').map(Number);
      const count = new Date(y,m,0).getDate();
      return Array.from({length:count},(_,i) => `${key}-${String(i+1).padStart(2,'0')}`);
    })();
    const weeks = monthWeeks(dates);
    const mentors = activeStaff();
    const html = `<div class="modal-card v272-external-modal"><div class="modal-head"><div><h3>เพิ่ม Intern/ผู้ฝึกภายนอก</h3><p class="hint">ระบบสร้างแถวในตารางและกำหนดพี่เลี้ยงวันจันทร์–ศุกร์ของสัปดาห์ที่เลือก</p></div><button type="button" class="icon-btn" data-close-modal>×</button></div><form id="v272ExternalTrainingForm" class="form-grid">
      <label>ชื่อผู้ฝึก<input name="trainee_name" required placeholder="เช่น นักศึกษา A"></label>
      <label>ประเภท<select name="trainee_type"><option value="intern">Intern (เด็กฝึกงาน)</option><option value="new_staff">น้องใหม่</option></select></label>
      <label>สัปดาห์<select name="week_start">${weeks.map(week => `<option value="${esc(week.start)}" data-week-end="${esc(week.end)}">สัปดาห์ ${week.index}: ${esc(dateLabel(week.start))}–${esc(dateLabel(week.end))}</option>`).join('')}</select></label>
      <label>พี่เลี้ยง<select name="mentor_staff_id" required><option value="">เลือกพี่เลี้ยง</option>${mentors.map(person => `<option value="${esc(person.id)}">${esc(staffName(person))}</option>`).join('')}</select></label>
      <div class="actions full-span"><button class="primary-btn" type="submit">เพิ่มในตารางสัปดาห์นี้</button></div>
    </form></div>`;
    try { showModal(html); } catch (_) {}
  }
  async function submitExternal(form){
    const fd = new FormData(form);
    const select = form.querySelector('[name="week_start"]');
    const option = select?.selectedOptions?.[0];
    try {
      await replaceRange({ traineeName:String(fd.get('trainee_name') || '').trim(),traineeType:String(fd.get('trainee_type') || 'intern'),startDate:String(fd.get('week_start') || ''),endDate:String(option?.dataset?.weekEnd || ''),mentorStaffId:String(fd.get('mentor_staff_id') || ''),note:'เพิ่มผู้ฝึกภายนอกจากตารางตำแหน่งกลางวัน V272' });
      try { closeModal(); } catch (_) {}
      toast('เพิ่มผู้ฝึกภายนอกและกำหนดพี่เลี้ยงแล้ว');
      setTimeout(() => { try { renderPage(); } catch (_) {} },80);
    } catch (error) { toast(friendly(error),'error'); }
  }
  function decorateHistoryTab(){
    const tab = document.querySelector('[data-v270-position-tab="mentors"]');
    if (tab) {
      const text = tab.querySelector('b,strong') || tab;
      if (!String(text.textContent || '').includes('ประวัติ')) text.textContent = 'ประวัติพี่เลี้ยง–ผู้ฝึก';
    }
    const body = document.querySelector('.v271-training-body');
    if (!body) return;
    body.classList.add('v272-history-mode');
    body.classList.toggle('v272-editing-history',!!st()?.editingTrainingIdV271);
    if (!body.querySelector('.v272-history-notice')) body.insertAdjacentHTML('afterbegin','<div class="notice v272-history-notice"><b>กำหนดงานจริงที่เมนู “ตารางตำแหน่งกลางวัน”</b><br>หน้านี้ใช้ดูประวัติ ยกเลิก หรือแก้ไขข้อมูลย้อนหลังเท่านั้น</div>');
    const title = body.querySelector('.v271-training-layout > .card:nth-child(2) h3');
    if (title) title.textContent = 'ประวัติพี่เลี้ยง–น้องใหม่ / Intern';
  }

  /* Render monthly table without persisted/injected trainee rows, then add inherited cells and weekly controls. */
  try {
    const previousMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
    if (previousMatrix && !previousMatrix.__v272InlineTraining) {
      const wrapped = function renderMonthPositionMatrixV272(rows,dates){
        const assignments = st()?.trainingAssignmentsV271;
        const cleanRows = operationalRows(rows);
        let html = '';
        try {
          if (st()) st().trainingAssignmentsV271 = [];
          html = String(previousMatrix.call(this,cleanRows,dates) || '');
        } finally { if (st()) st().trainingAssignmentsV271 = assignments || []; }
        return decorateMatrixHtml(html,Array.isArray(dates)?dates:[],cleanRows);
      };
      wrapped.__v272InlineTraining = true;
      assignGlobal('renderMonthPositionMatrix',wrapped);
    }
  } catch (error) { console.warn(`${VERSION}: matrix wrapper skipped`,error); }

  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v272NoTrainingRows) {
      const wrapped = function buildMonthlyPositionDraftV272(){
        const draft = previousBuild.apply(this,arguments);
        if (draft?.rows) {
          draft.rows = operationalRows(draft.rows);
          draft.trainingRowsRenderedOnlyV272 = true;
        }
        return draft;
      };
      wrapped.__v272NoTrainingRows = true;
      assignGlobal('buildMonthlyPositionDraft',wrapped);
    }
  } catch (_) {}

  try {
    const previousSave = window.saveMonthlyPositions || (typeof saveMonthlyPositions === 'function' ? saveMonthlyPositions : null);
    if (previousSave && !previousSave.__v272NoTrainingRows) {
      const wrapped = async function saveMonthlyPositionsV272(){
        cleanDraftTrainingRows();
        return previousSave.apply(this,arguments);
      };
      wrapped.__v272NoTrainingRows = true;
      assignGlobal('saveMonthlyPositions',wrapped);
    }
  } catch (_) {}

  try {
    const previousRender = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRender && !previousRender.__v272Decorated) {
      const wrapped = function renderPageV272(){
        const result = previousRender.apply(this,arguments);
        setTimeout(decorateHistoryTab,80);
        return result;
      };
      wrapped.__v272Decorated = true;
      assignGlobal('renderPage',wrapped);
    }
  } catch (_) {}

  document.addEventListener('change',function(event){
    const type = event.target?.closest?.('[data-v272-training-type]');
    if (type) {
      const card = type.closest('[data-v272-week-card]');
      const mentor = card?.querySelector('[data-v272-week-mentor]');
      if (mentor) { mentor.disabled = !type.value; if (!type.value) mentor.value=''; }
    }
  },true);

  document.addEventListener('click',function(event){
    const expand = event.target?.closest?.('[data-v272-expand-training]');
    if (expand) {
      event.preventDefault(); event.stopPropagation();
      expandedStaff.add(normId(expand.dataset.v272ExpandTraining));
      try { renderPage(); } catch (_) {}
      return;
    }
    const saveWeekButton = event.target?.closest?.('[data-v272-save-week]');
    if (saveWeekButton) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveWeek(saveWeekButton); return;
    }
    const saveDayButton = event.target?.closest?.('[data-v272-save-day-mentor]');
    if (saveDayButton) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveDayOverride(saveDayButton); return;
    }
    if (event.target?.closest?.('[data-v272-add-external-training]')) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      externalModal();
    }
  },true);

  document.addEventListener('submit',function(event){
    if (event.target?.id !== 'v272ExternalTrainingForm') return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    submitExternal(event.target);
  },true);

  const style = document.createElement('style');
  style.id = 'cnmi-v272-style';
  style.textContent = `
    .v272-mentor-week-head{min-width:300px;max-width:300px;background:#eff6ff!important;color:#1e3a8a!important}.v272-secondary-head{font-size:10px!important}
    .v272-mentor-week-cell{min-width:300px;max-width:300px;padding:5px!important;background:#f8fbff!important;vertical-align:top!important}
    .v272-week-controls{display:flex;gap:6px;overflow-x:auto;padding-bottom:3px;scrollbar-width:thin}.v272-week-card{flex:0 0 178px;display:grid;gap:4px;padding:6px;border:1px solid #cbd5e1;border-radius:10px;background:#fff}.v272-week-card.active{border-color:#60a5fa;background:#eff6ff}.v272-week-title{display:flex;justify-content:space-between;gap:4px;align-items:center}.v272-week-title small{font-size:9px;color:#64748b}.v272-week-card select{height:28px;min-height:28px;font-size:10px;padding:3px 22px 3px 6px}.v272-week-card .tiny-btn{padding:4px 6px;font-size:10px}.v272-save-state{min-height:12px;font-size:9px}.v272-save-state[data-tone="saved"]{color:#15803d}.v272-save-state[data-tone="error"]{color:#b91c1c}.v272-save-state[data-tone="saving"]{color:#1d4ed8}.v272-mixed-note{font-size:9px;color:#b45309;font-weight:700}
    .v272-regular-staff-cell{vertical-align:middle!important;text-align:center}.v272-mentor-of{display:flex;flex-direction:column;gap:2px;margin-bottom:5px;padding:5px;border-radius:8px;background:#ecfdf5;color:#166534}.v272-mentor-of small{font-size:10px}.v272-regular-staff-cell .ghost{opacity:.72}
    .v272-training-follow-cell{background:#f0f9ff!important;border-color:#7dd3fc!important;min-width:118px}.v272-follow-status{display:flex;flex-direction:column;gap:2px;align-items:center;text-align:center;font-size:10px}.v272-follow-status strong{font-size:12px;color:#075985}.v272-follow-status small{font-size:9px;color:#475569}.v272-follow-status.warning{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:5px;color:#9a3412}.v272-follow-status.warning select{width:100%;min-height:28px;font-size:10px}.v272-follow-status.unavailable{background:#fef2f2;color:#991b1b;border-radius:8px;padding:5px}.v272-follow-status .warn{background:#f59e0b;color:#fff}.v272-training-empty-cell{background:#f8fafc!important;color:#94a3b8;font-size:10px;text-align:center}
    .v272-training-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;margin:6px 0;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px}.v272-external-name{background:#fde68a!important;color:#78350f!important}.v272-external-modal{width:min(760px,94vw)}
    .v272-history-notice{margin-bottom:10px}.v272-history-mode:not(.v272-editing-history) .v271-training-layout>.card:first-child{display:none}.v272-history-mode:not(.v272-editing-history) .v271-training-layout{grid-template-columns:1fr!important}
    @media(max-width:900px){.v272-mentor-week-head,.v272-mentor-week-cell{min-width:240px;max-width:240px}.v272-week-card{flex-basis:165px}.v272-training-toolbar{align-items:stretch;flex-direction:column}.v272-training-toolbar button{width:100%}}
  `;
  document.head.appendChild(style);

  try {
    const observer = new MutationObserver(() => decorateHistoryTab());
    observer.observe(document.body,{childList:true,subtree:true});
  } catch (_) {}

  window.cnmiV272 = { weekBounds,monthWeeks,replaceRange,assignmentForDate,isTrainingPersonOnDate,operationalRows,decorateMatrixHtml };
  console.info(`${VERSION} loaded`);
})();
