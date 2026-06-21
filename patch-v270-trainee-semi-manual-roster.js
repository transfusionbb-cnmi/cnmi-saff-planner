/* V270 Trainee/Mentor + Daytime Slot Guard + Semi-Manual Roster
   - Adds a mentor/trainee tab under Position Management.
   - Trainees do not consume daytime Slot headcount.
   - A trainee follows the mentor's daytime position as an extra person.
   - Auto Assign creates suggestions only; it never overwrites actual names.
   - Locked roster slots are immutable anchors.
*/
(function(){
  'use strict';
  const VERSION = 'V270_TRAINEE_SEMI_MANUAL_ROSTER';
  if (window.__CNMI_V270_TRAINEE_SEMI_MANUAL_ROSTER__) return;
  window.__CNMI_V270_TRAINEE_SEMI_MANUAL_ROSTER__ = true;

  const MENTOR_TAB_KEY = 'cnmi_position_management_mentor_tab_v270';
  const SUGGESTION_FIELD = '_suggested_staff_id_v270';
  const SUGGESTION_REASON = '_suggestion_reason_v270';

  function appState(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function db(){ try { return sb || window.sb || null; } catch (_) { return window.sb || null; } }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function assignGlobal(name, value){
    window[name] = value;
    try {
      if (name === 'autoAssignRoster') autoAssignRoster = value;
      else if (name === 'renderSchedulerPage') renderSchedulerPage = value;
      else if (name === 'renderMonthPositionMatrix') renderMonthPositionMatrix = value;
      else if (name === 'renderPositionsPage') renderPositionsPage = value;
      else if (name === 'buildMonthlyPositionDraft') buildMonthlyPositionDraft = value;
      else if (name === 'savePositions') savePositions = value;
      else if (name === 'renderPage') renderPage = value;
    } catch (_) {}
  }
  function currentStaffIdSafe(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return appState()?.profile?.role === 'admin'; }
  }
  function ordered(rows){
    try { return orderedStaff(rows || []); }
    catch (_) { return (rows || []).slice().sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function activeStaff(){ return ordered((appState()?.staff || []).filter(person => person && person.is_active !== false)); }
  function activeMT(){ return activeStaff().filter(person => String(person.staff_type || '').toUpperCase() === 'MT'); }
  function isTrainee(person){
    if (!person) return false;
    if (person.is_trainee === true) return true;
    if (person.is_trainee === false) return false;
    return /น้องใหม่|trainee|probation/i.test(String(person.position_training_status || ''));
  }
  function mentorId(person){ return String(person?.mentor_staff_id || person?.mentor_id || ''); }
  function staffById(id){ return (appState()?.staff || []).find(person => String(person?.id || '') === String(id || '')) || null; }
  function regexEscape(value){ return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function staffName(personOrId){
    const person = typeof personOrId === 'object' ? personOrId : staffById(personOrId);
    return person ? (person.nickname || person.full_name || person.email || '-') : '-';
  }
  function traineeRows(){ return activeMT().filter(isTrainee); }
  function mentorPairs(){
    return traineeRows().map(trainee => ({ trainee, mentor:staffById(mentorId(trainee)) })).filter(pair => pair.mentor);
  }
  function schemaReady(){
    const rows = appState()?.staff || [];
    return rows.some(person => Object.prototype.hasOwnProperty.call(person, 'is_trainee') || Object.prototype.hasOwnProperty.call(person, 'mentor_staff_id'));
  }
  function isDayPositionAvailable(person, date){
    if (!person || !date) return false;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(person, date, 'day_position');
      if (result) return !!result.available;
    } catch (_) {}
    try {
      const row = window.cnmiV265?.unavailableRecord?.(person.id, date);
      return !row;
    } catch (_) { return true; }
  }
  function sanitizePositionRow(source, trainee, date){
    return {
      work_date:String(date || source?.work_date || '').slice(0,10),
      position_code:source?.position_code || source?.code || '',
      zone:source?.zone || '',
      break_time:source?.break_time || '-',
      main_rule:source?.main_rule || '',
      job_desc:source?.job_desc || '',
      staff_id:trainee.id,
      updated_by:currentStaffIdSafe()
    };
  }
  function pairTraineesWithMentors(rows){
    const source = Array.isArray(rows) ? rows : [];
    const trainees = traineeRows();
    if (!trainees.length) return source.slice();
    const traineeIds = new Set(trainees.map(person => String(person.id)));
    const base = source.filter(row => !traineeIds.has(String(row?.staff_id || '')));
    const byStaffDate = new Map();
    base.forEach(row => {
      const sid = String(row?.staff_id || '');
      const date = String(row?.work_date || '').slice(0,10);
      const code = String(row?.position_code || row?.code || '').trim();
      if (sid && date && code) byStaffDate.set(`${sid}|${date}`, row);
    });
    const dates = Array.from(new Set(base.map(row => String(row?.work_date || '').slice(0,10)).filter(Boolean)));
    const extra = [];
    trainees.forEach(trainee => {
      const mid = mentorId(trainee);
      if (!mid || mid === String(trainee.id)) return;
      dates.forEach(date => {
        if (!isDayPositionAvailable(trainee, date)) return;
        const mentorRow = byStaffDate.get(`${mid}|${date}`);
        if (!mentorRow) return;
        const paired = sanitizePositionRow(mentorRow, trainee, date);
        if (paired.position_code) extra.push(paired);
      });
    });
    return base.concat(extra);
  }
  function withTraineesExcludedFromSlotCount(callback){
    const trainees = traineeRows();
    const snapshots = trainees.map(person => ({
      person,
      daily_position_enabled:person.daily_position_enabled,
      position_training_status:person.position_training_status
    }));
    trainees.forEach(person => { person.daily_position_enabled = false; });
    try { return callback(); }
    finally {
      snapshots.forEach(item => {
        if (item.daily_position_enabled === undefined) delete item.person.daily_position_enabled;
        else item.person.daily_position_enabled = item.daily_position_enabled;
        item.person.position_training_status = item.position_training_status;
      });
    }
  }

  /* ------------------------------------------------------------------
     Position Management: mentor/trainee tab
     ------------------------------------------------------------------ */
  function mentorTabActive(){
    const st = appState();
    if (st?.positionManagementSubtabV270 === 'mentors') return true;
    try { return localStorage.getItem(MENTOR_TAB_KEY) === 'mentors'; }
    catch (_) { return false; }
  }
  function setMentorTab(active){
    const st = appState();
    if (st) st.positionManagementSubtabV270 = active ? 'mentors' : '';
    try { active ? localStorage.setItem(MENTOR_TAB_KEY, 'mentors') : localStorage.removeItem(MENTOR_TAB_KEY); } catch (_) {}
  }
  function selectedTrainee(){
    const rows = activeMT();
    const st = appState();
    let id = String(st?.selectedTraineeV270 || '');
    if (!rows.some(person => String(person.id) === id)) id = String((rows.find(isTrainee) || rows[0] || {}).id || '');
    if (st) st.selectedTraineeV270 = id;
    return rows.find(person => String(person.id) === id) || null;
  }
  function mentorshipBodyHtml(){
    if (!isAdminSafe()) return '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>';
    const mtRows = activeMT();
    if (!mtRows.length) return '<div class="card">ยังไม่มีเจ้าหน้าที่ MT ที่เปิดใช้งาน</div>';
    const trainee = selectedTrainee();
    const mentors = mtRows.filter(person => String(person.id) !== String(trainee?.id || '') && !isTrainee(person));
    const selectedMentor = mentorId(trainee);
    const pairs = traineeRows();
    const warning = schemaReady() ? '' : `<div class="notice error-notice"><b>ต้องรัน SQL ครั้งเดียวก่อนใช้งาน:</b> เปิด Supabase SQL Editor แล้วรันไฟล์ <code>supabase_v270_trainee_mentor.sql</code></div>`;
    return `<div class="v270-mentor-tab-body">
      ${warning}
      <div class="grid v270-mentor-layout">
        <div class="card">
          <div class="section-title"><div><h3>จับคู่พี่เลี้ยง–น้องใหม่</h3><p class="hint">เลือกน้องใหม่ MT และพี่เลี้ยง MT เมื่อบันทึก ระบบจะติด Flag <code>is_trainee=true</code></p></div></div>
          <div class="form-grid">
            <label>น้องใหม่ (MT)
              <select data-v270-trainee-select>${mtRows.map(person => `<option value="${esc(person.id)}" ${String(person.id)===String(trainee?.id||'')?'selected':''}>${esc(staffName(person))}${isTrainee(person)?' • น้องใหม่':''}</option>`).join('')}</select>
            </label>
            <label>พี่เลี้ยง (MT)
              <select data-v270-mentor-select><option value="">เลือกพี่เลี้ยง</option>${mentors.map(person => `<option value="${esc(person.id)}" ${String(person.id)===selectedMentor?'selected':''}>${esc(staffName(person))}</option>`).join('')}</select>
            </label>
            <button class="primary-btn" type="button" data-v270-save-mentor ${!trainee?'disabled':''}>บันทึกการจับคู่</button>
            ${trainee && isTrainee(trainee) ? `<button class="ghost-btn danger" type="button" data-v270-remove-trainee="${esc(trainee.id)}">ยกเลิกสถานะน้องใหม่</button>` : ''}
          </div>
          <div class="notice soft-notice compact"><b>กฎ Slot:</b> น้องใหม่ยังแสดงในตารางตำแหน่งและตามตำแหน่งของพี่เลี้ยง แต่จะไม่นับเป็นจำนวนคนสำหรับเลือกชุด Slot</div>
        </div>
        <div class="card">
          <div class="section-title"><h3>รายการที่จับคู่แล้ว</h3><span class="badge blue">${pairs.length} คน</span></div>
          ${pairs.length ? `<div class="table-wrap"><table><thead><tr><th>น้องใหม่</th><th>พี่เลี้ยง</th><th>การนับ Slot</th><th></th></tr></thead><tbody>${pairs.map(person => `<tr><td><b>${esc(staffName(person))}</b></td><td>${esc(staffName(mentorId(person)))}</td><td><span class="badge orange">ไม่นับ Slot</span></td><td><button class="tiny-btn danger" type="button" data-v270-remove-trainee="${esc(person.id)}">ยกเลิก</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีน้องใหม่ที่จับคู่พี่เลี้ยง</div>'}
        </div>
      </div>
    </div>`;
  }
  function decoratePositionManagement(){
    const st = appState();
    if (st?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    const page = root?.querySelector('.v244-position-management-page');
    const tabs = page?.querySelector('.v244-position-tabs');
    if (!page || !tabs) return;
    if (!tabs.querySelector('[data-v270-position-tab="mentors"]')) {
      tabs.insertAdjacentHTML('beforeend', `<button type="button" class="v244-position-tab" data-v270-position-tab="mentors"><b>พี่เลี้ยง–น้องใหม่</b><small>จับคู่ MT และป้องกันยอด Slot เพี้ยน</small></button>`);
    }
    const mentorButton = tabs.querySelector('[data-v270-position-tab="mentors"]');
    if (!mentorTabActive()) {
      mentorButton?.classList.remove('active');
      return;
    }
    tabs.querySelectorAll('.v244-position-tab').forEach(button => button.classList.remove('active'));
    mentorButton?.classList.add('active');
    if (page.querySelector(':scope > .v270-mentor-tab-body')) return;
    while (page.children.length > 1) page.removeChild(page.lastElementChild);
    page.insertAdjacentHTML('beforeend', mentorshipBodyHtml());
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'จัดการตำแหน่ง';
  }
  async function saveMentorPair(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const traineeId = String(document.querySelector('[data-v270-trainee-select]')?.value || '');
    const selectedMentorId = String(document.querySelector('[data-v270-mentor-select]')?.value || '');
    if (!traineeId) return toast('กรุณาเลือกน้องใหม่', 'error');
    if (!selectedMentorId) return toast('กรุณาเลือกพี่เลี้ยง', 'error');
    if (traineeId === selectedMentorId) return toast('น้องใหม่และพี่เลี้ยงต้องเป็นคนละคน', 'error');
    const client = db();
    if (!client) return toast('ไม่พบ Supabase client', 'error');
    try {
      const result = await client.from('staff_profiles').update({
        is_trainee:true,
        mentor_staff_id:selectedMentorId
      }).eq('id', traineeId).select('*').maybeSingle();
      if (result.error) throw result.error;
      const st = appState();
      const local = (st?.staff || []).find(person => String(person.id) === traineeId);
      if (local) Object.assign(local, result.data || { is_trainee:true, mentor_staff_id:selectedMentorId });
      try { await loadAllData(); } catch (_) {}
      setMentorTab(true);
      try { renderPage(); } catch (_) {}
      setTimeout(decoratePositionManagement, 60);
      toast('บันทึกพี่เลี้ยง–น้องใหม่แล้ว และน้องใหม่จะไม่ถูกนับใน Slot');
    } catch (error) {
      const message = friendly(error);
      const missingColumn = /is_trainee|mentor_staff_id|column/i.test(message);
      toast(missingColumn ? `ยังไม่ได้รัน supabase_v270_trainee_mentor.sql: ${message}` : `บันทึกไม่สำเร็จ: ${message}`, 'error');
    }
  }
  async function removeTrainee(id){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const client = db();
    if (!client) return toast('ไม่พบ Supabase client', 'error');
    try {
      const result = await client.from('staff_profiles').update({ is_trainee:false, mentor_staff_id:null }).eq('id', id).select('*').maybeSingle();
      if (result.error) throw result.error;
      try { await loadAllData(); } catch (_) {}
      setMentorTab(true);
      try { renderPage(); } catch (_) {}
      setTimeout(decoratePositionManagement, 60);
      toast('ยกเลิกสถานะน้องใหม่แล้ว ระบบจะกลับมานับใน Slot ตามปกติ');
    } catch (error) { toast(`ยกเลิกไม่สำเร็จ: ${friendly(error)}`, 'error'); }
  }

  window.addEventListener('click', function(event){
    const existingTab = event.target?.closest?.('[data-v244-position-tab]');
    if (existingTab) setMentorTab(false);

    const mentorTab = event.target?.closest?.('[data-v270-position-tab="mentors"]');
    if (mentorTab) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      setMentorTab(true);
      const st = appState();
      if (st) st.page = 'positionManagement';
      try { renderPage(); } catch (_) {}
      setTimeout(decoratePositionManagement, 40);
      return;
    }
    if (event.target?.closest?.('[data-v270-save-mentor]')) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      saveMentorPair();
      return;
    }
    const remove = event.target?.closest?.('[data-v270-remove-trainee]');
    if (remove) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      removeTrainee(remove.getAttribute('data-v270-remove-trainee'));
    }
  }, true);
  window.addEventListener('change', function(event){
    const select = event.target?.closest?.('[data-v270-trainee-select]');
    if (!select) return;
    event.preventDefault(); event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    const st = appState();
    if (st) st.selectedTraineeV270 = select.value;
    setMentorTab(true);
    document.querySelector('.v270-mentor-tab-body')?.remove();
    decoratePositionManagement();
  }, true);

  /* ------------------------------------------------------------------
     Daytime position Slot count and pairing
     ------------------------------------------------------------------ */
  try {
    if (window.cnmiV265) {
      const oldActual = window.cnmiV265.actualAvailableStaff;
      const oldWeekly = window.cnmiV265.weeklySlotStaffV265;
      if (typeof oldActual === 'function') window.cnmiV265.actualAvailableStaff = date => oldActual(date).filter(person => !isTrainee(person));
      if (typeof oldWeekly === 'function') window.cnmiV265.weeklySlotStaffV265 = date => oldWeekly(date).filter(person => !isTrainee(person));
      window.cnmiV265.weeklySlotHeadcountV265 = date => (window.cnmiV265.weeklySlotStaffV265?.(date) || []).length;
    }
  } catch (_) {}

  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v270TraineePairing) {
      const wrappedBuild = function buildMonthlyPositionDraftV270(){
        const draft = withTraineesExcludedFromSlotCount(() => previousBuild.apply(this, arguments));
        if (draft && Array.isArray(draft.rows)) {
          draft.rows = pairTraineesWithMentors(draft.rows);
          draft.traineePairingV270 = true;
        }
        return draft;
      };
      wrappedBuild.__v270TraineePairing = true;
      assignGlobal('buildMonthlyPositionDraft', wrappedBuild);
    }
  } catch (error) { console.warn(`${VERSION}: build wrapper skipped`, error); }

  try {
    const previousMonthMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
    if (previousMonthMatrix && !previousMonthMatrix.__v270TraineeCount) {
      const wrappedMatrix = function renderMonthPositionMatrixV270(rows, dates){
        const pairedRows = pairTraineesWithMentors(Array.isArray(rows) ? rows : []);
        let html = withTraineesExcludedFromSlotCount(() => String(previousMonthMatrix.call(this, pairedRows, dates) || ''));
        traineeRows().forEach(person => {
          const name = regexEscape(esc(staffName(person)));
          html = html.replace(new RegExp(`(<div class="matrix-staff-name"><b>${name}<\\/b><small>)(.*?)(<\\/small>)`), `$1$2 • น้องใหม่ (ไม่นับ Slot)$3`);
        });
        return html;
      };
      wrappedMatrix.__v270TraineeCount = true;
      assignGlobal('renderMonthPositionMatrix', wrappedMatrix);
    }
  } catch (error) { console.warn(`${VERSION}: month matrix wrapper skipped`, error); }

  try {
    const previousDailyRender = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (previousDailyRender && !previousDailyRender.__v270TraineeCount) {
      const wrappedDaily = function renderPositionsPageV270(){
        const st = appState();
        const oldPositions = st?.positions;
        if (st && Array.isArray(oldPositions)) st.positions = oldPositions.filter(row => !isTrainee(staffById(row?.staff_id)));
        try {
          let html = withTraineesExcludedFromSlotCount(() => String(previousDailyRender.apply(this, arguments) || ''));
          const pairs = mentorPairs();
          if (pairs.length) {
            const summary = `<div class="card v270-daily-trainee-summary"><div class="section-title"><h3>พี่เลี้ยง–น้องใหม่วันนี้</h3><span class="badge orange">น้องใหม่ไม่นับ Slot</span></div><div class="chip-line">${pairs.map(pair => `<span class="badge blue">${esc(staffName(pair.trainee))} → ${esc(staffName(pair.mentor))}</span>`).join('')}</div></div>`;
            html += summary;
          }
          return html;
        } finally { if (st) st.positions = oldPositions; }
      };
      wrappedDaily.__v270TraineeCount = true;
      assignGlobal('renderPositionsPage', wrappedDaily);
    }
  } catch (error) { console.warn(`${VERSION}: daily render wrapper skipped`, error); }

  async function syncTraineePairsForDate(date){
    const client = db();
    const d = String(date || '').slice(0,10);
    if (!client || !d || !traineeRows().length) return;
    const read = await client.from('daily_positions').select('*').eq('work_date', d);
    if (read.error) throw read.error;
    const rows = read.data || [];
    const traineeIds = traineeRows().map(person => person.id);
    if (traineeIds.length) {
      const del = await client.from('daily_positions').delete().eq('work_date', d).in('staff_id', traineeIds);
      if (del.error) throw del.error;
    }
    const paired = pairTraineesWithMentors(rows).filter(row => traineeIds.map(String).includes(String(row.staff_id)));
    if (paired.length) {
      const ins = await client.from('daily_positions').insert(paired);
      if (ins.error) throw ins.error;
    }
  }
  try {
    const previousSavePositions = window.savePositions || (typeof savePositions === 'function' ? savePositions : null);
    if (previousSavePositions && !previousSavePositions.__v270TraineePairing) {
      const wrappedSave = async function savePositionsV270(){
        const date = document.getElementById('positionDateInput')?.value || appState()?.positionDate;
        const result = await previousSavePositions.apply(this, arguments);
        try {
          await syncTraineePairsForDate(date);
          try { await loadAllData(); } catch (_) {}
          try { renderPage(); } catch (_) {}
        } catch (error) { toast(`บันทึกตำแหน่งหลักแล้ว แต่ซิงก์น้องใหม่ไม่สำเร็จ: ${friendly(error)}`, 'error'); }
        return result;
      };
      wrappedSave.__v270TraineePairing = true;
      assignGlobal('savePositions', wrappedSave);
    }
  } catch (error) { console.warn(`${VERSION}: daily save wrapper skipped`, error); }

  /* ------------------------------------------------------------------
     Semi-manual roster suggestions
     ------------------------------------------------------------------ */
  function rosterAssignments(){
    const st = appState();
    if (st?.rosterDraft?.monthKey === st?.monthKey && Array.isArray(st.rosterDraft.assignments)) return st.rosterDraft.assignments;
    try { return getAssignmentsForMonth(st?.monthKey) || []; }
    catch (_) { return st?.rosterAssignments || []; }
  }
  function rosterSlotId(slot){ return String(slot?.id || slot?._temp_id || `${slot?.duty_date || ''}|${slot?.duty_code || ''}`); }
  function rosterStaff(){
    const rows = activeStaff().filter(person => {
      try { return isRosterEnabled(person); }
      catch (_) { return person.roster_enabled !== false; }
    });
    return rows;
  }
  function dutyFamily(code){
    const text = String(code || '');
    if (text.startsWith('ชบด')) return 'ชบด';
    if (text.startsWith('ช4')) return 'ช4';
    if (text.startsWith('ช3')) return 'ช3';
    if (text.startsWith('ช9')) return 'ช9';
    return text;
  }
  function suggestionCounts(assignments){
    const out = {};
    (assignments || []).forEach(slot => {
      const sid = String(slot?.staff_id || '');
      if (!sid) return;
      const row = out[sid] ||= { total:0, weekend:0, byCode:{}, byFamily:{} };
      row.total++;
      const code = String(slot.duty_code || '');
      row.byCode[code] = (row.byCode[code] || 0) + 1;
      const family = dutyFamily(code);
      row.byFamily[family] = (row.byFamily[family] || 0) + 1;
      try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) row.weekend++; } catch (_) {}
    });
    return out;
  }
  function evaluateCandidate(person, slot, assignments){
    try {
      const result = window.cnmiV266?.evaluateRosterCandidateV266?.(person, slot, assignments, { checkSameDay:true, checkAdjacent:true });
      if (result) return result;
    } catch (_) {}
    try { return { ok:!!canStaffWorkSlot(person.id, slot, assignments), reason:'ไม่ผ่านเงื่อนไขเวร' }; }
    catch (_) { return { ok:true, reason:'' }; }
  }
  function candidatesFor(slot, assignments){
    try {
      const stages = window.cnmiV266?.filterEligibleStaffBeforeAutoAssignV266?.(slot, assignments);
      if (stages?.candidates) return { candidates:stages.candidates, stages };
    } catch (_) {}
    const candidates = rosterStaff().filter(person => evaluateCandidate(person, slot, assignments).ok);
    return { candidates, stages:null };
  }
  function vacancyReason(stages){
    if (!stages) return 'ไม่พบผู้ที่ผ่านเงื่อนไข';
    if (!stages.statusEligible?.length) return 'ทุกคนติดลา/ไม่รับเวร/ปิดใช้งาน';
    if (!stages.permissionEligible?.length) return 'ไม่มีผู้มีสิทธิ์ทำเวรนี้';
    if (!stages.sameDayEligible?.length) return 'ทุกคนมีเวรอื่นในวันเดียวกัน';
    if (!stages.adjacentEligible?.length) return 'ติดกฎ ชบด ห้ามวันต่อเนื่อง';
    return 'ไม่พบผู้ที่ผ่านเงื่อนไขทั้งหมด';
  }
  function lockedBalanceImpact(assignments){
    const locked = (assignments || []).filter(slot => slot.is_locked && slot.staff_id);
    if (!locked.length) return false;
    const totals = rosterStaff().map(person => (assignments || []).filter(slot => String(slot.staff_id || '') === String(person.id)).length);
    if (!totals.length) return false;
    return Math.max(...totals) - Math.min(...totals) > 1;
  }
  function autoAssignRosterV270(){
    const st = appState();
    if (!st) return;
    if (!st.rosterDraft || st.rosterDraft.monthKey !== st.monthKey) {
      st.rosterDraft = { monthKey:st.monthKey, assignments:generateEmptyAssignments(st.monthKey) };
    }
    const assignments = st.rosterDraft.assignments || [];
    assignments.forEach(slot => { delete slot[SUGGESTION_FIELD]; delete slot[SUGGESTION_REASON]; });
    const working = assignments.map(slot => ({ ...slot }));
    const counts = suggestionCounts(working);
    const diagnostics = { suggested:0, vacant:0, lockedInvalid:[], existingInvalid:[], details:[], lockedImpact:false };

    working.forEach((slot, index) => {
      const original = assignments[index];
      if (slot.staff_id) {
        const person = staffById(slot.staff_id);
        const check = evaluateCandidate(person, slot, working);
        if (!check.ok) {
          const detail = { slot:original, person, reason:check.reason || 'ไม่ผ่านเงื่อนไข' };
          if (slot.is_locked) diagnostics.lockedInvalid.push(detail);
          else diagnostics.existingInvalid.push(detail);
        }
        return;
      }
      if (slot.is_locked) return;
      const result = candidatesFor(slot, working);
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      result.candidates.sort((a,b) => {
        const ca = counts[String(a.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const cb = counts[String(b.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const order = String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th');
        return ((ca.byCode[code] || 0) - (cb.byCode[code] || 0))
          || ((ca.byFamily[family] || 0) - (cb.byFamily[family] || 0))
          || (ca.weekend - cb.weekend)
          || (ca.total - cb.total)
          || order;
      });
      const chosen = result.candidates[0] || null;
      if (!chosen) {
        const reason = vacancyReason(result.stages);
        original[SUGGESTION_REASON] = reason;
        diagnostics.vacant++;
        diagnostics.details.push({ slot:original, reason });
        return;
      }
      original[SUGGESTION_FIELD] = chosen.id;
      original[SUGGESTION_REASON] = '';
      slot.staff_id = chosen.id; // working copy only, used to validate later suggestions
      const row = counts[String(chosen.id)] ||= { total:0, weekend:0, byCode:{}, byFamily:{} };
      row.total++;
      row.byCode[code] = (row.byCode[code] || 0) + 1;
      row.byFamily[family] = (row.byFamily[family] || 0) + 1;
      try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) row.weekend++; } catch (_) {}
      diagnostics.suggested++;
    });
    diagnostics.lockedImpact = lockedBalanceImpact(working);
    st.__lastAutoAssignDiagnosticsV270 = diagnostics;
    st.rosterDraft = { monthKey:st.monthKey, assignments };
    const parts = [`คำแนะนำ ${diagnostics.suggested} ช่อง`];
    if (diagnostics.vacant) parts.push(`ยังว่าง ${diagnostics.vacant} ช่อง`);
    if (diagnostics.existingInvalid.length) parts.push(`ชื่อเดิมที่ควรตรวจ ${diagnostics.existingInvalid.length} ช่อง`);
    if (diagnostics.lockedInvalid.length || diagnostics.lockedImpact) parts.push('มีตำแหน่งที่ล็อกไว้ส่งผลกระทบต่อความสมดุล');
    toast(`สร้างคำแนะนำแล้ว: ${parts.join(' • ')} — ยังไม่ได้เปลี่ยนชื่อจริง`);
    try { console.info(`${VERSION} suggestion diagnostics`, diagnostics); } catch (_) {}
  }
  assignGlobal('autoAssignRoster', autoAssignRosterV270);

  function findRosterSlot(id){ return rosterAssignments().find(slot => rosterSlotId(slot) === String(id || '')) || null; }
  function applySuggestion(id){
    const slot = findRosterSlot(id);
    if (!slot) return toast('ไม่พบช่องเวร', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่ ระบบจะไม่แตะต้อง', 'error');
    if (slot.staff_id) return toast('ช่องนี้มีชื่อจริงอยู่แล้ว', 'error');
    const suggested = slot[SUGGESTION_FIELD];
    if (!suggested) return toast('ช่องนี้ไม่มีคำแนะนำ', 'error');
    const check = evaluateCandidate(staffById(suggested), slot, rosterAssignments());
    if (!check.ok) return toast(`คำแนะนำนี้ใช้ไม่ได้แล้ว: ${check.reason || 'เงื่อนไขเปลี่ยน'}`, 'error');
    slot.staff_id = suggested;
    delete slot[SUGGESTION_FIELD];
    delete slot[SUGGESTION_REASON];
    try { renderPage(); } catch (_) {}
  }
  function applyAllSuggestions(){
    const assignments = rosterAssignments();
    let applied = 0, skipped = 0;
    assignments.forEach(slot => {
      const suggested = slot[SUGGESTION_FIELD];
      if (!suggested) return;
      if (slot.is_locked || slot.staff_id) { skipped++; return; }
      const check = evaluateCandidate(staffById(suggested), slot, assignments);
      if (!check.ok) { skipped++; return; }
      slot.staff_id = suggested;
      delete slot[SUGGESTION_FIELD];
      delete slot[SUGGESTION_REASON];
      applied++;
    });
    try { renderPage(); } catch (_) {}
    toast(`ใช้คำแนะนำแล้ว ${applied} ช่อง${skipped ? ` • ข้าม ${skipped} ช่องที่ล็อก/เงื่อนไขเปลี่ยน` : ''}`);
  }
  function clearSuggestions(){
    rosterAssignments().forEach(slot => { delete slot[SUGGESTION_FIELD]; delete slot[SUGGESTION_REASON]; });
    const st = appState(); if (st) st.__lastAutoAssignDiagnosticsV270 = null;
    try { renderPage(); } catch (_) {}
    toast('ล้างคำแนะนำแล้ว โดยไม่เปลี่ยนชื่อจริง');
  }

  function rosterStatisticsHtml(){
    const assignments = rosterAssignments();
    const rows = rosterStaff().map(person => {
      const actual = assignments.filter(slot => String(slot.staff_id || '') === String(person.id));
      const suggested = assignments.filter(slot => String(slot[SUGGESTION_FIELD] || '') === String(person.id));
      const locked = actual.filter(slot => slot.is_locked).length;
      let weekend = 0;
      actual.forEach(slot => { try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) weekend++; } catch (_) {} });
      return { person, actual:actual.length, suggested:suggested.length, locked, weekend };
    });
    const diag = appState()?.__lastAutoAssignDiagnosticsV270;
    const warning = diag && (diag.lockedInvalid?.length || diag.lockedImpact)
      ? '<div class="notice warn-notice"><b>มีตำแหน่งที่ล็อกไว้ส่งผลกระทบต่อความสมดุล</b> ระบบคงชื่อเดิมไว้และจะไม่แก้เอง กรุณาตรวจสอบในฐานะ Admin</div>'
      : '';
    return `<div class="card v270-roster-stat-card"><div class="section-title"><div><h3>สถิติสรุปรายเดือน</h3><p class="hint">ใช้ช่วยตัดสินใจแบบ Semi-Manual ชื่อจริงจะเปลี่ยนเมื่อ Admin เลือกหรือกดใช้คำแนะนำเท่านั้น</p></div><span class="badge blue">${esc(appState()?.monthKey || '')}</span></div>${warning}<div class="table-wrap"><table><thead><tr><th>เจ้าหน้าที่</th><th>เวรจริง</th><th>คำแนะนำ</th><th>วันหยุด</th><th>ล็อก</th></tr></thead><tbody>${rows.map(row => `<tr><td><b>${esc(staffName(row.person))}</b></td><td>${row.actual}</td><td>${row.suggested}</td><td>${row.weekend}</td><td>${row.locked}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  try {
    const previousScheduler = window.renderSchedulerPage || (typeof renderSchedulerPage === 'function' ? renderSchedulerPage : null);
    if (previousScheduler && !previousScheduler.__v270SemiManual) {
      const wrappedScheduler = function renderSchedulerPageV270(){
        let html = String(previousScheduler.apply(this, arguments) || '');
        html = html.replace(/data-auto-assign>สร้างร่าง Auto Assign<\/button>/g, 'data-auto-assign>สร้างคำแนะนำ Auto Assign</button><button class="primary-btn" type="button" data-v270-apply-all-suggestions>ใช้คำแนะนำทั้งหมด</button><button class="ghost-btn" type="button" data-v270-clear-suggestions>ล้างคำแนะนำ</button>');
        html = html.replace('Auto Assign จะช่วยเกลี่ยเวรตามกติกาและไม่แตะช่องที่ล็อกไว้', 'Auto Assign จะแสดงคำแนะนำเท่านั้น ไม่เขียนทับชื่อจริง และไม่แตะช่องที่ล็อกไว้');
        html = html.replace(/<\/div>\s*$/, `${rosterStatisticsHtml()}</div>`);
        return html;
      };
      wrappedScheduler.__v270SemiManual = true;
      assignGlobal('renderSchedulerPage', wrappedScheduler);
    }
  } catch (error) { console.warn(`${VERSION}: scheduler wrapper skipped`, error); }

  function decorateRosterSuggestions(){
    const st = appState();
    if (st?.page !== 'scheduler') return;
    const assignments = rosterAssignments();
    assignments.forEach(slot => {
      const id = rosterSlotId(slot);
      const suggested = slot[SUGGESTION_FIELD];
      const reason = slot[SUGGESTION_REASON];
      const containers = Array.from(document.querySelectorAll(`[data-drop-slot="${CSS.escape(id)}"]`));
      document.querySelectorAll(`[data-edit-roster-slot-v213="${CSS.escape(id)}"]`).forEach(button => {
        const card = button.closest('.mobile-roster-slot');
        if (card && !containers.includes(card)) containers.push(card);
      });
      containers.forEach(container => {
        const existing = container.querySelector('.v270-slot-suggestion');
        if (slot.is_locked || slot.staff_id || (!suggested && !reason)) {
          if (existing) existing.remove();
          return;
        }
        const signature = suggested ? `suggest:${suggested}` : `reason:${reason}`;
        if (existing?.dataset?.v270Signature === signature) return;
        if (existing) existing.remove();
        if (suggested) {
          const box = document.createElement('div');
          box.className = 'v270-slot-suggestion';
          box.dataset.v270Signature = signature;
          box.innerHTML = `<span><b>แนะนำ:</b> ${esc(staffName(suggested))}</span><button type="button" class="tiny-btn" data-v270-accept-suggestion="${esc(id)}">ใช้คำแนะนำ</button>`;
          container.appendChild(box);
        } else if (reason) {
          const box = document.createElement('div');
          box.className = 'v270-slot-suggestion v270-no-suggestion';
          box.dataset.v270Signature = signature;
          box.textContent = `ยังแนะนำไม่ได้: ${reason}`;
          container.appendChild(box);
        }
      });
    });
  }

  window.addEventListener('click', function(event){
    const one = event.target?.closest?.('[data-v270-accept-suggestion]');
    if (one) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      applySuggestion(one.getAttribute('data-v270-accept-suggestion'));
      return;
    }
    if (event.target?.closest?.('[data-v270-apply-all-suggestions]')) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      applyAllSuggestions();
      return;
    }
    if (event.target?.closest?.('[data-v270-clear-suggestions]')) {
      event.preventDefault(); event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      clearSuggestions();
    }
  }, true);

  /* Final render hook: add the third tab and suggestion decorations after older patches finish. */
  try {
    const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRenderPage && !previousRenderPage.__v270FinalRender) {
      const wrappedRenderPage = function renderPageV270(){
        const result = previousRenderPage.apply(this, arguments);
        setTimeout(decoratePositionManagement, 45);
        setTimeout(decorateRosterSuggestions, 45);
        setTimeout(decoratePositionManagement, 140);
        setTimeout(decorateRosterSuggestions, 140);
        return result;
      };
      wrappedRenderPage.__v270FinalRender = true;
      assignGlobal('renderPage', wrappedRenderPage);
    }
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v270-style';
  style.textContent = `
    .v270-mentor-layout{grid-template-columns:minmax(320px,.9fr) minmax(420px,1.1fr)}
    .v270-mentor-tab-body code{background:#eff6ff;border-radius:7px;padding:2px 6px;color:#1d4ed8}
    .v270-daily-trainee-summary{margin-top:14px}
    .v270-slot-suggestion{margin-top:7px;padding:7px 8px;border:1px dashed #60a5fa;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:11px;display:flex;gap:7px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    .v270-slot-suggestion.v270-no-suggestion{border-color:#fdba74;background:#fff7ed;color:#9a3412;display:block}
    .v270-roster-stat-card{margin-top:14px}
    .v270-roster-stat-card table{min-width:560px}
    .v270-roster-stat-card th,.v270-roster-stat-card td{text-align:center}
    .v270-roster-stat-card th:first-child,.v270-roster-stat-card td:first-child{text-align:left}
    @media(max-width:900px){.v270-mentor-layout{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  try {
    const observer = new MutationObserver(() => {
      decoratePositionManagement();
      decorateRosterSuggestions();
    });
    observer.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  window.cnmiV270 = {
    isTrainee,
    mentorPairs,
    pairTraineesWithMentors,
    decoratePositionManagement,
    decorateRosterSuggestions,
    autoAssignRosterV270,
    applySuggestion,
    applyAllSuggestions,
    clearSuggestions,
    syncTraineePairsForDate
  };
  console.info(`${VERSION} loaded`);
})();
