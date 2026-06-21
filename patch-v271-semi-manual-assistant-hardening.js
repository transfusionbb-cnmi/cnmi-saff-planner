/* CNMI Staff Planner V271 - Semi-Manual Assistant Hardening
   - Optimistic permission auto-save with per-checkbox server verification.
   - Date-range mentor/new-staff/intern records; Supabase remains source of truth.
   - Exact consecutive rule: only ชบด1/ชบด2/ชบด3 on adjacent dates.
   - Candidate diagnostics with Hard Error / Warning separation and Force Assign audit.
   - Auto Assign only creates safe suggestions and never overwrites actual assignments.
   - Detailed monthly summary for human review.
*/
(function(){
  'use strict';
  const VERSION = 'V271_SEMI_MANUAL_ASSISTANT_HARDENING';
  if (window.__CNMI_V271_SEMI_MANUAL_ASSISTANT_HARDENING__) return;
  window.__CNMI_V271_SEMI_MANUAL_ASSISTANT_HARDENING__ = true;

  const TRAINING_TABLE = 'staff_training_assignments';
  const OVERRIDE_TABLE = 'roster_manual_overrides';
  const RESTRICTED = new Set(['ชบด1','ชบด2','ชบด3']);
  const SUGGESTION_FIELD = '_suggested_staff_id_v270';
  const SUGGESTION_REASON = '_suggestion_reason_v270';
  const permissionTimers = new Map();
  const permissionGeneration = new Map();
  const permissionInFlight = new Map();
  const permissionConfirmed = new Map();
  const permissionFailedDesired = new Map();
  let trainingLoadInFlight = null;
  let trainingSchemaReady = null;
  let overrideSchemaReady = null;

  function st(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function client(){ try { return sb || window.sb || null; } catch (_) { return window.sb || null; } }
  function esc(value){
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function assignGlobal(name, value){
    try { window[name] = value; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return st()?.profile?.id || null; }
  }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return String(st()?.profile?.role || '').toLowerCase() === 'admin'; }
  }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0,10); }
  }
  function validDate(value){ return /^\d{4}-\d{2}-\d{2}$/.test(normDate(value)); }
  function normId(value){ return String(value == null ? '' : value); }
  function bool(value){ return value === true || String(value).toLowerCase() === 'true'; }
  function ordered(rows){
    try { return orderedStaff(rows || []); }
    catch (_) { return (rows || []).slice().sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function staffRows(){ return ordered((st()?.staff || []).filter(person => person && person.is_active !== false)); }
  function rosterRows(){
    return staffRows().filter(person => {
      try { return isRosterEnabled(person); }
      catch (_) { return person.roster_enabled !== false; }
    });
  }
  function staffById(id){ return (st()?.staff || []).find(person => normId(person?.id) === normId(id)) || null; }
  function staffName(personOrId){
    const person = typeof personOrId === 'object' ? personOrId : staffById(personOrId);
    return person ? (person.nickname || person.full_name || person.email || '-') : '-';
  }
  function slotId(slot){
    try { return String(getSlotId(slot)); }
    catch (_) { return String(slot?.id || slot?._temp_id || `${slot?.duty_date || ''}|${slot?.duty_code || ''}`); }
  }
  function sameSlot(a,b){
    const aid = normId(a?.id || a?._temp_id);
    const bid = normId(b?.id || b?._temp_id);
    if (aid && bid) return aid === bid;
    return normDate(a?.duty_date) === normDate(b?.duty_date) && String(a?.duty_code || '') === String(b?.duty_code || '');
  }
  function dayDiff(a,b){
    const aa = Date.parse(`${normDate(a)}T00:00:00Z`);
    const bb = Date.parse(`${normDate(b)}T00:00:00Z`);
    if (!Number.isFinite(aa) || !Number.isFinite(bb)) return NaN;
    return Math.round(Math.abs(aa - bb) / 86400000);
  }
  function dutyLabel(code){
    try { return DUTY_LABEL[code] || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function monthAssignments(){
    const stateRef = st();
    if (stateRef?.rosterDraft?.monthKey === stateRef?.monthKey && Array.isArray(stateRef.rosterDraft.assignments)) return stateRef.rosterDraft.assignments;
    try { return getAssignmentsForMonth(stateRef?.monthKey) || []; }
    catch (_) { return stateRef?.rosterAssignments || []; }
  }

  /* ------------------------------------------------------------------
     Date-range mentor / trainee / intern data
     ------------------------------------------------------------------ */
  function trainingRows(){ return Array.isArray(st()?.trainingAssignmentsV271) ? st().trainingAssignmentsV271 : []; }
  function trainingIdentity(row){ return row?.trainee_staff_id ? `staff:${row.trainee_staff_id}` : `name:${String(row?.trainee_name || '').trim().toLowerCase()}`; }
  function trainingName(row){ return row?.trainee_staff_id ? staffName(row.trainee_staff_id) : (row?.trainee_name || '-'); }
  function trainingTypeLabel(type){ return type === 'intern' ? 'Intern (เด็กฝึกงาน)' : 'น้องใหม่'; }
  function activeTrainingOn(row, date){
    const d = normDate(date);
    return !!row && row.active !== false && validDate(d) && normDate(row.start_date) <= d && d <= normDate(row.end_date);
  }
  function trainingForDate(date){ return trainingRows().filter(row => activeTrainingOn(row, date)); }
  function isTrainingPersonOnDate(staffId, date){
    const sid = normId(staffId);
    return !!sid && trainingForDate(date).some(row => normId(row.trainee_staff_id) === sid);
  }
  function trainingOverlapsMonth(row, monthKey){
    const key = String(monthKey || '').slice(0,7);
    if (!/^\d{4}-\d{2}$/.test(key)) return false;
    const start = `${key}-01`;
    const endDate = new Date(Date.UTC(Number(key.slice(0,4)), Number(key.slice(5,7)), 0));
    const end = endDate.toISOString().slice(0,10);
    return row.active !== false && normDate(row.start_date) <= end && normDate(row.end_date) >= start;
  }
  async function loadTrainingAssignments(options={}){
    if (trainingLoadInFlight && options.force !== true) return trainingLoadInFlight;
    const db = client();
    if (!db) return [];
    const request = (async () => {
      const result = await db.from(TRAINING_TABLE).select('*').order('start_date', { ascending:false }).order('created_at', { ascending:false });
      if (result.error) {
        trainingSchemaReady = false;
        if (!/does not exist|schema cache|relation/i.test(friendly(result.error))) console.warn(`${VERSION}: training load failed`, result.error);
        const stateRef = st();
        if (stateRef) stateRef.trainingAssignmentsV271 = [];
        return [];
      }
      trainingSchemaReady = true;
      const stateRef = st();
      if (stateRef) {
        stateRef.trainingAssignmentsV271 = result.data || [];
        stateRef.trainingAssignmentsLoadedAtV271 = new Date().toISOString();
      }
      return result.data || [];
    })();
    trainingLoadInFlight = request;
    try { return await request; }
    finally { if (trainingLoadInFlight === request) trainingLoadInFlight = null; }
  }

  function excludeFromDaySlot(person, date){ return !!person?.id && isTrainingPersonOnDate(person.id, date); }

  function cleanTrainingPositionRow(source, assignment, date){
    if (!assignment?.trainee_staff_id) return null;
    return {
      work_date:normDate(date || source?.work_date),
      position_code:source?.position_code || source?.code || '',
      zone:source?.zone || '',
      break_time:source?.break_time || '-',
      main_rule:source?.main_rule || '',
      job_desc:source?.job_desc || '',
      staff_id:assignment.trainee_staff_id,
      updated_by:currentStaff(),
      _training_pair_id_v271:assignment.id,
      _training_type_v271:assignment.trainee_type
    };
  }
  function traineeAvailable(assignment, date){
    if (!assignment?.trainee_staff_id) return true;
    try {
      const result = window.cnmiV266?.getStaffAvailabilityContextV266?.(staffById(assignment.trainee_staff_id), date, 'day_position');
      return !result || !!result.available;
    } catch (_) { return true; }
  }
  function pairTrainingRows(sourceRows){
    const source = Array.isArray(sourceRows) ? sourceRows : [];
    const base = source.filter(row => !isTrainingPersonOnDate(row?.staff_id, row?.work_date));
    const byStaffDate = new Map();
    base.forEach(row => {
      const sid = normId(row?.staff_id);
      const date = normDate(row?.work_date);
      const code = String(row?.position_code || row?.code || '').trim();
      if (sid && date && code && code !== 'รอตรวจสอบ') byStaffDate.set(`${sid}|${date}`, row);
    });
    const dates = Array.from(new Set(base.map(row => normDate(row?.work_date)).filter(validDate)));
    const extra = [];
    dates.forEach(date => {
      trainingForDate(date).forEach(assignment => {
        if (!assignment.trainee_staff_id || !traineeAvailable(assignment, date)) return;
        const mentorRow = byStaffDate.get(`${assignment.mentor_staff_id}|${date}`);
        if (!mentorRow) return;
        const paired = cleanTrainingPositionRow(mentorRow, assignment, date);
        if (paired?.position_code) extra.push(paired);
      });
    });
    return base.concat(extra);
  }
  async function syncTrainingPairsForDate(date){
    const d = normDate(date);
    const db = client();
    if (!db || !validDate(d) || trainingSchemaReady === false) return;
    const assignments = trainingForDate(d).filter(row => row.trainee_staff_id);
    const traineeIds = Array.from(new Set(assignments.map(row => row.trainee_staff_id).filter(Boolean)));
    if (!traineeIds.length) return;
    const read = await db.from('daily_positions').select('*').eq('work_date', d);
    if (read.error) throw read.error;
    const existing = read.data || [];
    const remove = await db.from('daily_positions').delete().eq('work_date', d).in('staff_id', traineeIds);
    if (remove.error) throw remove.error;
    const operational = existing.filter(row => !traineeIds.map(String).includes(String(row.staff_id)));
    const byStaff = new Map(operational.map(row => [normId(row.staff_id), row]));
    const payload = assignments.map(assignment => {
      const mentorRow = byStaff.get(normId(assignment.mentor_staff_id));
      if (!mentorRow || !traineeAvailable(assignment, d)) return null;
      const row = cleanTrainingPositionRow(mentorRow, assignment, d);
      if (!row) return null;
      delete row._training_pair_id_v271;
      delete row._training_type_v271;
      return row;
    }).filter(Boolean);
    if (payload.length) {
      const inserted = await db.from('daily_positions').insert(payload);
      if (inserted.error) throw inserted.error;
    }
  }

  /* ------------------------------------------------------------------
     Optimistic permission auto-save
     ------------------------------------------------------------------ */
  function permissionKey(staffId, code){ return `${normId(staffId)}|${String(code || '').trim()}`; }
  function permissionRow(staffId, code){
    return (st()?.positionEligibility || []).find(row => normId(row?.staff_id) === normId(staffId) && String(row?.position_code || '').trim() === String(code || '').trim()) || null;
  }
  function setPermissionLocal(staffId, code, value){
    const stateRef = st();
    if (!stateRef) return;
    const sid = normId(staffId);
    const pcode = String(code || '').trim();
    const others = (stateRef.positionEligibility || []).filter(row => !(normId(row?.staff_id) === sid && String(row?.position_code || '').trim() === pcode));
    stateRef.positionEligibility = others.concat([{ staff_id:sid, position_code:pcode, is_eligible:!!value, updated_by:currentStaff(), updated_at:new Date().toISOString() }]);
    stateRef.positionEligibilitySourceV271 = 'optimistic-ui';
    try { window.cnmiV258?.sessionValues?.set?.(permissionKey(sid,pcode), !!value); } catch (_) {}
  }
  function permissionStatusElement(input){
    const label = input?.closest?.('.position-check') || input?.parentElement;
    if (!label) return null;
    let el = label.querySelector('.v271-permission-save-state');
    if (!el) {
      el = document.createElement('small');
      el.className = 'v271-permission-save-state';
      const span = label.querySelector('span');
      (span || label).appendChild(el);
    }
    return el;
  }
  function setPermissionStatus(input, status, message){
    const el = permissionStatusElement(input);
    if (!el) return;
    el.dataset.status = status;
    el.textContent = message || (status === 'saving' ? 'กำลังบันทึก…' : status === 'saved' ? 'บันทึกแล้ว' : status === 'error' ? 'บันทึกไม่สำเร็จ' : 'พร้อม Auto-Save');
  }
  async function persistPermissionRow(payload){
    const api = window.cnmiV258;
    if (api?.persistRows) {
      await api.persistRows([payload]);
    } else {
      const db = client();
      if (!db) throw new Error('ไม่พบ Supabase client');
      const update = await db.from('daily_position_eligibility')
        .update({ is_eligible:payload.is_eligible, updated_by:payload.updated_by })
        .eq('staff_id', payload.staff_id).eq('position_code', payload.position_code).select('*');
      if (update.error) throw update.error;
      if (!(update.data || []).length) {
        const insert = await db.from('daily_position_eligibility').insert(payload).select('*');
        if (insert.error) throw insert.error;
      }
    }
    const verify = await client().from('daily_position_eligibility').select('*')
      .eq('staff_id', payload.staff_id).eq('position_code', payload.position_code);
    if (verify.error) throw verify.error;
    const rows = verify.data || [];
    if (!rows.length || rows.some(row => bool(row.is_eligible) !== !!payload.is_eligible)) throw new Error(`ตรวจสอบสิทธิ์ ${payload.position_code} หลังบันทึกไม่ผ่าน`);
    const stateRef = st();
    if (stateRef) {
      const others = (stateRef.positionEligibility || []).filter(row => !(normId(row?.staff_id) === normId(payload.staff_id) && String(row?.position_code || '') === payload.position_code));
      stateRef.positionEligibility = others.concat(rows);
      stateRef.positionEligibilitySourceV271 = 'supabase-verified';
      stateRef.positionEligibilityLoadedAtV271 = new Date().toISOString();
    }
    return rows;
  }
  function findPermissionInput(key){
    return Array.from(document.querySelectorAll('input[data-eligibility]')).find(input => permissionKey(input.dataset.staffId, input.dataset.positionCode) === key) || null;
  }
  function schedulePermissionSave(input, previousValue){
    const staffId = normId(input.dataset.staffId);
    const code = String(input.dataset.positionCode || '').trim();
    if (!staffId || !code) return;
    const key = permissionKey(staffId, code);
    const generation = (permissionGeneration.get(key) || 0) + 1;
    permissionGeneration.set(key, generation);
    if (permissionTimers.has(key)) clearTimeout(permissionTimers.get(key));
    setPermissionStatus(input, 'saving', 'รอบันทึก…');
    permissionTimers.set(key, setTimeout(() => {
      permissionTimers.delete(key);
      const run = async () => {
        const currentInput = findPermissionInput(key) || input;
        const desired = !!currentInput.checked;
        setPermissionStatus(currentInput, 'saving', 'กำลังบันทึก…');
        try {
          await persistPermissionRow({ staff_id:staffId, position_code:code, is_eligible:desired, updated_by:currentStaff() });
          permissionConfirmed.set(key, desired);
          permissionFailedDesired.delete(key);
          if (permissionGeneration.get(key) === generation) setPermissionStatus(findPermissionInput(key) || currentInput, 'saved', 'บันทึกแล้ว');
          else schedulePermissionSave(findPermissionInput(key) || currentInput, desired);
        } catch (error) {
          console.error(`${VERSION}: permission autosave failed`, error);
          if (permissionGeneration.get(key) === generation) {
            const latest = findPermissionInput(key) || currentInput;
            permissionFailedDesired.set(key, desired);
            const rollback = permissionConfirmed.has(key) ? permissionConfirmed.get(key) : !!previousValue;
            latest.checked = !!rollback;
            latest.closest('.position-check')?.classList.toggle('checked', !!rollback);
            setPermissionLocal(staffId, code, !!rollback);
            setPermissionStatus(latest, 'error', 'บันทึกไม่สำเร็จ • คลิกเพื่อลองใหม่');
            toast(`บันทึกสิทธิ์ ${code} ไม่สำเร็จ: ${friendly(error)}`, 'error');
          }
        }
      };
      const chain = (permissionInFlight.get(key) || Promise.resolve()).then(run, run);
      const tracked = chain.finally(() => { if (permissionInFlight.get(key) === tracked) permissionInFlight.delete(key); });
      permissionInFlight.set(key, tracked);
    }, 450));
  }
  async function saveAllVisiblePermissions(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const inputs = Array.from(document.querySelectorAll('.v247-eligibility-page input[data-eligibility], .v245-eligibility-page input[data-eligibility]'));
    if (!inputs.length) return toast('ไม่พบสิทธิ์ที่แสดงอยู่', 'error');
    inputs.forEach(input => setPermissionStatus(input, 'saving', 'กำลังตรวจสอบ…'));
    try {
      const rows = inputs.map(input => ({ staff_id:normId(input.dataset.staffId), position_code:String(input.dataset.positionCode || '').trim(), is_eligible:!!input.checked, updated_by:currentStaff() }));
      const staffIds = new Set(rows.map(row => row.staff_id));
      if (staffIds.size !== 1) throw new Error('หน้าจอมีข้อมูลมากกว่าหนึ่งคน');
      for (const row of rows) await persistPermissionRow(row);
      inputs.forEach(input => setPermissionStatus(input, 'saved', 'บันทึกแล้ว'));
      toast('บันทึกและตรวจสอบสิทธิ์ที่เห็นอยู่กับ Supabase แล้ว');
    } catch (error) {
      inputs.forEach(input => setPermissionStatus(input, 'error', 'ตรวจสอบไม่ผ่าน'));
      toast(`บันทึกสิทธิ์ไม่สำเร็จ: ${friendly(error)}`, 'error');
    }
  }
  function decoratePermissionAutosave(){
    if (st()?.page !== 'positionManagement') return;
    const panel = document.querySelector('.eligibility-position-panel');
    if (!panel) return;
    const button = panel.querySelector('[data-save-position-eligibility]');
    if (button) {
      button.textContent = 'บันทึกทั้งหมดตอนนี้';
      button.title = 'ปกติระบบ Auto-Save ให้ทีละรายการ ปุ่มนี้ใช้ตรวจสอบและบันทึกทั้งหมดที่เห็นอยู่ซ้ำอีกครั้ง';
    }
    const title = panel.querySelector('.section-title');
    if (title && !title.querySelector('.v271-autosave-badge')) title.insertAdjacentHTML('beforeend', '<span class="badge blue v271-autosave-badge">Auto-Save • Supabase</span>');
    panel.querySelectorAll('input[data-eligibility]').forEach(input => {
      const key = permissionKey(input.dataset.staffId,input.dataset.positionCode);
      if (!permissionConfirmed.has(key)) permissionConfirmed.set(key, !!input.checked);
      if (!permissionStatusElement(input)?.textContent) setPermissionStatus(input, 'idle', 'พร้อม Auto-Save');
    });
  }

  /* ------------------------------------------------------------------
     Hard Error / Warning candidate evaluation
     ------------------------------------------------------------------ */
  function roleMatches(person, requiredRole){
    try { return supportsRequiredRole(person, requiredRole); }
    catch (_) { return true; }
  }
  function permissionAllows(person, slot){
    try { return window.cnmiV266?.dutyPermissionAllowsV266?.(person, slot) !== false; }
    catch (_) { return true; }
  }
  function availability(person, slot){
    try { return window.cnmiV266?.getStaffAvailabilityContextV266?.(person, slot.duty_date, 'night_roster') || { available:true, reason:'พร้อมทำงาน' }; }
    catch (_) { return { available:true, reason:'พร้อมทำงาน' }; }
  }
  function sameDayConflict(person, slot, assignments){
    return (assignments || []).some(other => other && other.staff_id && normId(other.staff_id) === normId(person?.id) && normDate(other.duty_date) === normDate(slot?.duty_date) && !sameSlot(other, slot));
  }
  function exactAdjacentChbd(person, slot, assignments){
    const currentCode = String(slot?.duty_code || '').trim();
    if (!RESTRICTED.has(currentCode)) return null;
    return (assignments || []).find(other => other && other.staff_id && normId(other.staff_id) === normId(person?.id) && RESTRICTED.has(String(other.duty_code || '').trim()) && !sameSlot(other,slot) && dayDiff(other.duty_date, slot.duty_date) === 1) || null;
  }
  function quotaWarning(person, slot, assignments){
    const target = Number(person?.target_shifts ?? person?.targetShifts ?? person?.monthly_quota ?? 0);
    if (!(target > 0)) return null;
    const total = (assignments || []).filter(row => normId(row?.staff_id) === normId(person.id) && !sameSlot(row,slot)).length + 1;
    return total > target ? `Quota เกิน ${total-target} เวร (เป้าหมาย ${target})` : null;
  }
  function evaluateCandidateV271(person, slot, assignments){
    const hardErrors = [];
    const warnings = [];
    const info = [];
    if (!person?.id) hardErrors.push({ code:'STAFF_NOT_FOUND', message:'ไม่พบข้อมูลเจ้าหน้าที่' });
    if (!slot || !validDate(slot?.duty_date) || !String(slot?.duty_code || '').trim()) hardErrors.push({ code:'INVALID_SLOT', message:'วันที่หรือรหัสเวรไม่ถูกต้อง' });
    if (!person?.id || hardErrors.length) return { ok:false, hardErrors, warnings, info, stage:'hard', reason:hardErrors[0]?.message || 'ข้อมูลไม่ครบ' };
    let enabled = person.is_active !== false;
    try { enabled = !!isRosterEnabled(person); } catch (_) {}
    if (!enabled) hardErrors.push({ code:'ROSTER_DISABLED', message:'ปิดใช้งานการจัดเวร' });
    const available = availability(person,slot);
    if (!available.available) hardErrors.push({ code:available.noDuty ? 'NO_DUTY' : 'LEAVE_OR_UNAVAILABLE', message:available.reason || 'ลา/ไม่พร้อมทำเวร' });
    if (sameDayConflict(person, slot, assignments)) hardErrors.push({ code:'SAME_DAY_CONFLICT', message:'มีเวรอื่นในวันเดียวกัน' });
    if (!permissionAllows(person,slot)) warnings.push({ code:'PERMISSION_MISMATCH', message:'ไม่มีสิทธิ์ตามวัน/ประเภทเวร' });
    if (!roleMatches(person, slot?.required_role)) warnings.push({ code:'ROLE_MISMATCH', message:`ไม่ตรงกลุ่มผู้ปฏิบัติหลัก ${slot?.required_role || ''}`.trim() });
    const adjacent = exactAdjacentChbd(person,slot,assignments);
    if (adjacent) warnings.push({ code:'ADJACENT_CHBD', message:`ชบดติดวันข้างเคียง: ${normDate(adjacent.duty_date)} ${adjacent.duty_code}` });
    const quota = quotaWarning(person,slot,assignments);
    if (quota) warnings.push({ code:'QUOTA_EXCEEDED', message:quota });
    if (!hardErrors.length) info.push({ code:'AVAILABLE', message:'ไม่มีการลาและไม่มีเวรซ้ำวันเดียวกัน' });
    return {
      ok:hardErrors.length === 0,
      hardErrors,
      warnings,
      info,
      stage:hardErrors.length ? 'hard' : warnings.length ? 'warning' : 'ready',
      reason:hardErrors[0]?.message || warnings[0]?.message || 'พร้อมจัดเวร'
    };
  }
  function filterCandidatesV271(slot, assignments){
    const evaluations = rosterRows().map(person => ({ person, result:evaluateCandidateV271(person,slot,assignments) }));
    const candidates = evaluations.filter(item => item.result.ok).map(item => item.person);
    return {
      rosterStaff:rosterRows(),
      permissionEligible:evaluations.filter(item => !item.result.warnings.some(w => w.code === 'PERMISSION_MISMATCH')).map(item => item.person),
      statusEligible:evaluations.filter(item => !item.result.hardErrors.some(h => ['LEAVE_OR_UNAVAILABLE','NO_DUTY','ROSTER_DISABLED'].includes(h.code))).map(item => item.person),
      sameDayEligible:evaluations.filter(item => !item.result.hardErrors.some(h => h.code === 'SAME_DAY_CONFLICT')).map(item => item.person),
      candidates,
      evaluations
    };
  }
  function canStaffWorkSlotV271(staffId, slot, assignments){ return evaluateCandidateV271(staffById(staffId), slot, assignments || monthAssignments()).ok; }

  function diagnosticsHtml(result){
    const hard = result?.hardErrors || [];
    const warnings = result?.warnings || [];
    const info = result?.info || [];
    return `<div class="v271-candidate-diagnostics">
      ${hard.map(item => `<div class="v271-diagnostic hard"><b>บล็อก:</b> ${esc(item.message)}</div>`).join('')}
      ${warnings.map(item => `<div class="v271-diagnostic warning"><b>เตือน:</b> ${esc(item.message)}</div>`).join('')}
      ${!hard.length && !warnings.length ? `<div class="v271-diagnostic ok"><b>ผ่าน:</b> ${esc(info[0]?.message || 'พร้อมจัดเวร')}</div>` : ''}
    </div>`;
  }
  function candidateDialogState(slot, assignments){
    const items = rosterRows().map(person => ({ person, result:evaluateCandidateV271(person,slot,assignments) }));
    return { slot, assignments, items };
  }
  function showCandidateModal(slot, preferredStaffId){
    if (!slot) return toast('ไม่พบช่องเวร', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่ กรุณาปลดล็อกก่อน', 'error');
    const assignments = monthAssignments();
    const dialog = candidateDialogState(slot, assignments);
    st().__candidateDialogV271 = dialog;
    const options = dialog.items.map(item => {
      const hard = item.result.hardErrors.length;
      const warn = item.result.warnings.length;
      const suffix = hard ? `⛔ ${item.result.hardErrors[0].message}` : warn ? `⚠ ${warn} คำเตือน` : 'ผ่าน';
      return `<option value="${esc(item.person.id)}" ${normId(item.person.id)===normId(slot.staff_id)?'selected':''} ${hard?'disabled':''}>${esc(staffName(item.person))} — ${esc(suffix)}</option>`;
    }).join('');
    const preferred = normId(preferredStaffId || slot.staff_id);
    const selected = dialog.items.find(item => normId(item.person.id) === preferred && item.result.ok) || dialog.items.find(item => item.result.ok) || null;
    const selectedId = selected?.person?.id || '';
    const html = `<h2>เลือกคนลงเวร</h2>
      <p class="hint">${esc(normDate(slot.duty_date))} • ${esc(dutyLabel(slot.duty_code))} • ${esc(slot.required_role || '-')}</p>
      <form id="v271RosterCandidateForm" data-slot-id="${esc(slotId(slot))}" class="form-grid compact-form">
        <label>ผู้รับผิดชอบ
          <select name="staff_id" id="v271CandidateSelect"><option value="">ยังไม่จัด</option>${options}</select>
        </label>
        <div id="v271SelectedCandidateDiagnostics">${selected ? diagnosticsHtml(selected.result) : '<div class="v271-diagnostic ok">ปล่อยช่องว่างได้</div>'}</div>
        <details class="v271-debug-list" open><summary>เหตุผลของผู้สมัครแต่ละคน</summary>
          <div class="v271-debug-rows">${dialog.items.map(item => `<div class="v271-debug-row ${item.result.hardErrors.length?'hard':item.result.warnings.length?'warning':'ok'}"><b>${esc(staffName(item.person))}</b>${diagnosticsHtml(item.result)}</div>`).join('')}</div>
        </details>
        <label id="v271OverrideReasonWrap" class="${selected?.result?.warnings?.length ? '' : 'hidden'}">เหตุผลที่ Admin บังคับข้ามคำเตือน
          <textarea name="override_reason" rows="2" placeholder="ระบุเหตุผลสั้น ๆ เพื่อเก็บ Audit Log"></textarea>
        </label>
        <div class="actions v271-candidate-actions">
          <button class="primary-btn" type="submit" name="action" value="assign">ยืนยันจัดเวร</button>
          <button class="warn-btn ${selected?.result?.warnings?.length ? '' : 'hidden'}" type="submit" name="action" value="force" id="v271ForceAssignBtn">Force Assign</button>
          <button class="ghost-btn" type="submit" name="action" value="clear">ปล่อยว่าง</button>
        </div>
      </form>`;
    if (typeof showModal === 'function') showModal(html); else toast('ไม่สามารถเปิดหน้าต่างเลือกคนได้', 'error');
    const select = document.getElementById('v271CandidateSelect');
    if (select && selectedId) select.value = selectedId;
    updateCandidateModalSelection();
  }
  function updateCandidateModalSelection(){
    const dialog = st()?.__candidateDialogV271;
    const select = document.getElementById('v271CandidateSelect');
    if (!dialog || !select) return;
    const item = dialog.items.find(row => normId(row.person.id) === normId(select.value));
    const box = document.getElementById('v271SelectedCandidateDiagnostics');
    if (box) box.innerHTML = item ? diagnosticsHtml(item.result) : '<div class="v271-diagnostic ok">ปล่อยช่องว่างได้</div>';
    const hasWarnings = !!item?.result?.warnings?.length;
    document.getElementById('v271OverrideReasonWrap')?.classList.toggle('hidden', !hasWarnings);
    document.getElementById('v271ForceAssignBtn')?.classList.toggle('hidden', !hasWarnings);
  }
  async function writeOverrideAudit(slot, person, result, reason){
    const db = client();
    if (!db) throw new Error('ไม่พบ Supabase client');
    const payload = {
      roster_month_key:String(st()?.monthKey || normDate(slot.duty_date).slice(0,7)),
      duty_date:normDate(slot.duty_date),
      duty_code:String(slot.duty_code || ''),
      staff_id:person.id,
      warning_codes:(result.warnings || []).map(item => item.code),
      warning_details:result.warnings || [],
      override_reason:String(reason || '').trim(),
      actor_id:currentStaff()
    };
    const insert = await db.from(OVERRIDE_TABLE).insert(payload).select('*').maybeSingle();
    if (insert.error) {
      overrideSchemaReady = false;
      throw insert.error;
    }
    overrideSchemaReady = true;
    return insert.data;
  }
  async function submitCandidateForm(event){
    const form = event.target;
    const slot = monthAssignments().find(row => slotId(row) === String(form.dataset.slotId || ''));
    if (!slot) return toast('ไม่พบช่องเวร กรุณารีเฟรชหน้า', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่', 'error');
    const fd = new FormData(form);
    const action = event.submitter?.value || 'assign';
    if (action === 'clear') {
      slot.staff_id = null;
      delete slot._manual_override_v271;
      try { closeModal(); } catch (_) {}
      try { renderPage(); } catch (_) {}
      return toast('ปล่อยช่องนี้ว่างแล้ว กดบันทึกตารางเพื่อบันทึกจริง');
    }
    const staffId = normId(fd.get('staff_id'));
    const person = staffById(staffId);
    const result = evaluateCandidateV271(person,slot,monthAssignments());
    if (result.hardErrors.length) return toast(`จัดไม่ได้: ${result.hardErrors.map(item => item.message).join(' • ')}`, 'error');
    if (result.warnings.length && action !== 'force') return toast('คนนี้มีคำเตือน กรุณาตรวจสอบแล้วกด Force Assign', 'error');
    const reason = String(fd.get('override_reason') || '').trim();
    if (result.warnings.length && !reason) return toast('กรุณาระบุเหตุผลที่บังคับข้ามคำเตือน', 'error');
    if (result.warnings.length) {
      try {
        await writeOverrideAudit(slot,person,result,reason);
      } catch (error) {
        const message = friendly(error);
        if (/does not exist|schema cache|relation/i.test(message)) return toast('ยังไม่ได้รัน supabase_v271_semi_manual_assistant.sql จึงยังเก็บ Audit Log ไม่ได้', 'error');
        return toast(`บันทึก Audit Log ไม่สำเร็จ: ${message}`, 'error');
      }
      slot._manual_override_v271 = { warning_codes:result.warnings.map(item => item.code), warning_details:result.warnings, reason, actor_id:currentStaff(), at:new Date().toISOString() };
    } else delete slot._manual_override_v271;
    slot.staff_id = staffId;
    delete slot[SUGGESTION_FIELD];
    delete slot[SUGGESTION_REASON];
    try { closeModal(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(result.warnings.length ? 'Force Assign แล้ว และบันทึก Audit Log เรียบร้อย กดบันทึกตารางเพื่อบันทึกจริง' : 'แก้ไขช่องเวรแล้ว กดบันทึกตารางเพื่อบันทึกจริง');
  }

  /* ------------------------------------------------------------------
     Safe Auto Assign suggestions
     ------------------------------------------------------------------ */
  function dutyFamily(code){
    const value = String(code || '');
    if (value.startsWith('ชบด')) return 'ชบด';
    if (value.startsWith('ช4')) return 'ช4';
    if (value.startsWith('ช3')) return 'ช3';
    if (value.startsWith('ช9')) return 'ช9';
    return value;
  }
  function fairnessCounts(assignments){
    const out = {};
    (assignments || []).forEach(slot => {
      if (!slot?.staff_id) return;
      const sid = normId(slot.staff_id);
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
  function aggregateHardReasons(evaluations){
    const counts = new Map();
    evaluations.forEach(item => item.result.hardErrors.forEach(error => counts.set(error.message, (counts.get(error.message) || 0) + 1)));
    return Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).map(([message,count]) => `${message} ${count} คน`).join(' • ') || 'ไม่พบผู้สมัครที่ผ่าน Hard Validation';
  }
  function autoAssignRosterV271(){
    const stateRef = st();
    if (!stateRef) return;
    if (!stateRef.rosterDraft || stateRef.rosterDraft.monthKey !== stateRef.monthKey) {
      stateRef.rosterDraft = { monthKey:stateRef.monthKey, assignments:generateEmptyAssignments(stateRef.monthKey) };
    }
    const assignments = stateRef.rosterDraft.assignments || [];
    assignments.forEach(slot => { delete slot[SUGGESTION_FIELD]; delete slot[SUGGESTION_REASON]; });
    const working = assignments.map(slot => ({ ...slot }));
    const counts = fairnessCounts(working);
    const diagnostics = { suggested:0, vacant:0, warningOnly:0, details:[] };
    working.forEach((slot,index) => {
      const original = assignments[index];
      if (slot.staff_id || slot.is_locked) return;
      const evaluated = rosterRows().map(person => ({ person, result:evaluateCandidateV271(person,slot,working) }));
      const safe = evaluated.filter(item => item.result.ok && item.result.warnings.length === 0);
      safe.sort((a,b) => {
        const ca = counts[normId(a.person.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const cb = counts[normId(b.person.id)] || { total:0, weekend:0, byCode:{}, byFamily:{} };
        const code = String(slot.duty_code || '');
        const family = dutyFamily(code);
        return ((ca.byCode[code] || 0) - (cb.byCode[code] || 0))
          || ((ca.byFamily[family] || 0) - (cb.byFamily[family] || 0))
          || (ca.weekend - cb.weekend)
          || (ca.total - cb.total)
          || staffName(a.person).localeCompare(staffName(b.person),'th');
      });
      const chosen = safe[0] || null;
      if (!chosen) {
        const warningOnly = evaluated.filter(item => item.result.ok && item.result.warnings.length);
        const reason = warningOnly.length
          ? `มีผู้สมัคร ${warningOnly.length} คน แต่ต้อง Manual Override: ${warningOnly.slice(0,3).map(item => `${staffName(item.person)} (${item.result.warnings.map(w => w.message).join(', ')})`).join(' • ')}`
          : aggregateHardReasons(evaluated);
        original[SUGGESTION_REASON] = reason;
        diagnostics.vacant++;
        if (warningOnly.length) diagnostics.warningOnly++;
        diagnostics.details.push({ duty_date:slot.duty_date, duty_code:slot.duty_code, reason });
        return;
      }
      original[SUGGESTION_FIELD] = chosen.person.id;
      original[SUGGESTION_REASON] = '';
      slot.staff_id = chosen.person.id;
      const sid = normId(chosen.person.id);
      const row = counts[sid] ||= { total:0, weekend:0, byCode:{}, byFamily:{} };
      const code = String(slot.duty_code || '');
      const family = dutyFamily(code);
      row.total++;
      row.byCode[code] = (row.byCode[code] || 0) + 1;
      row.byFamily[family] = (row.byFamily[family] || 0) + 1;
      try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) row.weekend++; } catch (_) {}
      diagnostics.suggested++;
    });
    stateRef.__lastAutoAssignDiagnosticsV271 = diagnostics;
    stateRef.rosterDraft = { monthKey:stateRef.monthKey, assignments };
    try { renderPage(); } catch (_) {}
    toast(`สร้างคำแนะนำที่ผ่าน Hard Validation และไม่มี Warning แล้ว ${diagnostics.suggested} ช่อง${diagnostics.vacant ? ` • ต้องตรวจเอง ${diagnostics.vacant} ช่อง` : ''} — ยังไม่ได้เปลี่ยนชื่อจริง`);
    console.info(`${VERSION}: Auto Assign diagnostics`, diagnostics);
  }

  /* ------------------------------------------------------------------
     Mentor/date-range management UI
     ------------------------------------------------------------------ */
  function selectedTraining(){
    const id = normId(st()?.editingTrainingIdV271);
    return trainingRows().find(row => normId(row.id) === id) || null;
  }
  function trainingFormHtml(){
    const edit = selectedTraining();
    const staff = staffRows().filter(person => String(person.staff_type || '').toUpperCase() === 'MT');
    const traineeId = normId(edit?.trainee_staff_id);
    const mentorId = normId(edit?.mentor_staff_id);
    const today = (() => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } })();
    const defaultEnd = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+6); return d.toISOString().slice(0,10); })();
    const warning = trainingSchemaReady === false ? '<div class="notice error-notice"><b>ต้องรัน SQL ก่อน:</b> เปิด Supabase SQL Editor แล้วรัน <code>supabase_v271_semi_manual_assistant.sql</code></div>' : '';
    return `<div class="v270-mentor-tab-body v271-training-body">
      ${warning}
      <div class="grid v271-training-layout">
        <div class="card">
          <div class="section-title"><div><h3>${edit ? 'แก้ไขช่วงพี่เลี้ยง' : 'เพิ่มช่วงพี่เลี้ยง'}</h3><p class="hint">กำหนดเป็นช่วงวันที่ น้องใหม่/Intern จะตามตำแหน่งพี่เลี้ยงและไม่นับ Slot เฉพาะช่วงนี้</p></div></div>
          <form id="v271TrainingForm" data-training-id="${esc(edit?.id || '')}" class="form-grid">
            <label>ประเภทผู้ฝึก
              <select name="trainee_type"><option value="new_staff" ${edit?.trainee_type!=='intern'?'selected':''}>น้องใหม่</option><option value="intern" ${edit?.trainee_type==='intern'?'selected':''}>Intern (เด็กฝึกงาน)</option></select>
            </label>
            <label>ผู้ฝึกที่มีรายชื่อในระบบ
              <select name="trainee_staff_id"><option value="">ใช้ชื่อผู้ฝึกภายนอกด้านล่าง</option>${staff.map(person => `<option value="${esc(person.id)}" ${normId(person.id)===traineeId?'selected':''}>${esc(staffName(person))}</option>`).join('')}</select>
            </label>
            <label>ชื่อผู้ฝึกภายนอก / เด็กฝึกงาน
              <input name="trainee_name" value="${esc(edit?.trainee_name || '')}" placeholder="กรอกเมื่อไม่มีรายชื่อในระบบ">
            </label>
            <label>พี่เลี้ยง
              <select name="mentor_staff_id" required><option value="">เลือกพี่เลี้ยง</option>${staff.map(person => `<option value="${esc(person.id)}" ${normId(person.id)===mentorId?'selected':''}>${esc(staffName(person))}</option>`).join('')}</select>
            </label>
            <label>เริ่มวันที่ <input type="date" name="start_date" value="${esc(edit?.start_date || today)}" required></label>
            <label>สิ้นสุดวันที่ <input type="date" name="end_date" value="${esc(edit?.end_date || defaultEnd)}" required></label>
            <label class="full-span">หมายเหตุ <input name="note" value="${esc(edit?.note || '')}" placeholder="เช่น ฝึก Blood Bank สัปดาห์ที่ 1"></label>
            <div class="actions full-span"><button class="primary-btn" type="submit">${edit ? 'บันทึกการแก้ไข' : 'เพิ่มช่วงพี่เลี้ยง'}</button>${edit ? '<button class="ghost-btn" type="button" data-v271-cancel-training-edit>ยกเลิกแก้ไข</button>' : ''}</div>
          </form>
          <div class="notice soft-notice compact"><b>กฎ Slot:</b> ผู้ฝึกจะไม่ถูกนำไปเลือกชุด Slot และจะไม่เพิ่มจำนวนตำแหน่ง หากพี่เลี้ยงไม่มีตำแหน่ง ระบบแสดง “รอกำหนดพี่เลี้ยง/ตำแหน่ง”</div>
        </div>
        <div class="card">
          <div class="section-title"><h3>รายการตามช่วงวันที่</h3><span class="badge blue">${trainingRows().length} รายการ</span></div>
          ${trainingRows().length ? `<div class="table-wrap"><table class="v271-training-table"><thead><tr><th>ผู้ฝึก</th><th>ประเภท</th><th>พี่เลี้ยง</th><th>ช่วงวันที่</th><th>สถานะ</th><th></th></tr></thead><tbody>${trainingRows().map(row => {
            const nowActive = activeTrainingOn(row,today);
            return `<tr><td><b>${esc(trainingName(row))}</b>${row.note?`<br><small>${esc(row.note)}</small>`:''}</td><td>${esc(trainingTypeLabel(row.trainee_type))}</td><td>${esc(staffName(row.mentor_staff_id))}</td><td>${esc(normDate(row.start_date))}<br>ถึง ${esc(normDate(row.end_date))}</td><td>${row.active===false?'<span class="badge gray">ยกเลิก</span>':nowActive?'<span class="badge green">กำลังใช้งาน</span>':'<span class="badge blue">ตามช่วงวันที่</span>'}</td><td><div class="actions"><button class="tiny-btn" type="button" data-v271-edit-training="${esc(row.id)}">แก้ไข</button>${row.active!==false?`<button class="tiny-btn danger" type="button" data-v271-deactivate-training="${esc(row.id)}">ยกเลิก</button>`:''}</div></td></tr>`;
          }).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีช่วงพี่เลี้ยง</div>'}
        </div>
      </div>
    </div>`;
  }
  function mentorTabIsActive(){
    const button = document.querySelector('[data-v270-position-tab="mentors"]');
    return !!button?.classList.contains('active') || st()?.positionManagementSubtabV270 === 'mentors';
  }
  function decorateTrainingManagement(){
    if (st()?.page !== 'positionManagement') return;
    const tab = document.querySelector('[data-v270-position-tab="mentors"]');
    if (tab) tab.innerHTML = '<b>พี่เลี้ยง–น้องใหม่ / Intern</b><small>กำหนดช่วงวันที่และไม่นับ Slot</small>';
    if (!mentorTabIsActive()) return;
    const page = document.querySelector('.v244-position-management-page');
    if (!page) return;
    const old = page.querySelector(':scope > .v270-mentor-tab-body, :scope > .v271-training-body');
    if (old?.classList.contains('v271-training-body')) return;
    if (old) old.remove();
    page.insertAdjacentHTML('beforeend', trainingFormHtml());
  }
  async function saveTrainingForm(form){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const db = client();
    if (!db) return toast('ไม่พบ Supabase client', 'error');
    const fd = new FormData(form);
    const traineeStaffId = normId(fd.get('trainee_staff_id')) || null;
    const traineeName = String(fd.get('trainee_name') || '').trim() || null;
    const mentorStaffId = normId(fd.get('mentor_staff_id'));
    const startDate = normDate(fd.get('start_date'));
    const endDate = normDate(fd.get('end_date'));
    if (!traineeStaffId && !traineeName) return toast('กรุณาเลือกผู้ฝึกหรือกรอกชื่อผู้ฝึกภายนอก', 'error');
    if (!mentorStaffId) return toast('กรุณาเลือกพี่เลี้ยง', 'error');
    if (traineeStaffId && traineeStaffId === mentorStaffId) return toast('ผู้ฝึกและพี่เลี้ยงต้องเป็นคนละคน', 'error');
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return toast('ช่วงวันที่ไม่ถูกต้อง', 'error');
    const payload = {
      trainee_staff_id:traineeStaffId,
      trainee_name:traineeName,
      mentor_staff_id:mentorStaffId,
      trainee_type:String(fd.get('trainee_type') || 'new_staff'),
      start_date:startDate,
      end_date:endDate,
      active:true,
      note:String(fd.get('note') || '').trim() || null,
      updated_by:currentStaff(),
      updated_at:new Date().toISOString()
    };
    const id = normId(form.dataset.trainingId);
    const result = id
      ? await db.from(TRAINING_TABLE).update(payload).eq('id',id).select('*').maybeSingle()
      : await db.from(TRAINING_TABLE).insert({ ...payload, created_by:currentStaff() }).select('*').maybeSingle();
    if (result.error) return toast(`บันทึกช่วงพี่เลี้ยงไม่สำเร็จ: ${friendly(result.error)}`, 'error');
    trainingSchemaReady = true;
    st().editingTrainingIdV271 = null;
    await loadTrainingAssignments({ force:true });
    decorateTrainingManagementForce();
    toast('บันทึกช่วงพี่เลี้ยงแล้ว ผู้ฝึกจะตามตำแหน่งเฉพาะช่วงวันที่และไม่นับ Slot');
  }
  async function deactivateTraining(id){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const result = await client().from(TRAINING_TABLE).update({ active:false, updated_by:currentStaff(), updated_at:new Date().toISOString() }).eq('id',id);
    if (result.error) return toast(`ยกเลิกรายการไม่สำเร็จ: ${friendly(result.error)}`, 'error');
    await loadTrainingAssignments({ force:true });
    decorateTrainingManagementForce();
    toast('ยกเลิกช่วงพี่เลี้ยงแล้ว');
  }
  function decorateTrainingManagementForce(){
    const old = document.querySelector('.v271-training-body, .v270-mentor-tab-body');
    if (old) old.remove();
    decorateTrainingManagement();
  }

  /* ------------------------------------------------------------------
     Day/month position display and summary
     ------------------------------------------------------------------ */
  function trainingStatusForDate(assignment,date,rows){
    const mentorRow = (rows || []).find(row => normDate(row?.work_date) === normDate(date) && normId(row?.staff_id) === normId(assignment.mentor_staff_id));
    if (!mentorRow) return 'รอกำหนดพี่เลี้ยง/ตำแหน่ง';
    if (!traineeAvailable(assignment,date)) return 'ผู้ฝึกลา/ไม่พร้อมทำงาน';
    return mentorRow.position_code || mentorRow.code || 'รอกำหนดตำแหน่ง';
  }
  function dailyTrainingSummary(date,rows){
    const pairs = trainingForDate(date);
    if (!pairs.length) return '';
    return `<div class="card v271-daily-training-summary"><div class="section-title"><h3>พี่เลี้ยง–ผู้ฝึกวันนี้</h3><span class="badge orange">ผู้ฝึกไม่นับ Slot</span></div><div class="v271-training-chips">${pairs.map(pair => `<span class="v271-training-chip"><b>${esc(trainingName(pair))}</b> (${esc(trainingTypeLabel(pair.trainee_type))}) → ${esc(staffName(pair.mentor_staff_id))}<small>${esc(trainingStatusForDate(pair,date,rows))}</small></span>`).join('')}</div></div>`;
  }

  function positionCountsForMonth(person, monthKey){
    const rows = (st()?.positions || []).filter(row => normId(row?.staff_id) === normId(person.id) && normDate(row?.work_date).startsWith(monthKey) && !isTrainingPersonOnDate(person.id,row.work_date));
    return {
      bb:rows.filter(row => /blood bank|manual/i.test(String(row.zone || '')) || /^BB-/i.test(String(row.position_code || ''))).length,
      donor:rows.filter(row => /donor/i.test(String(row.zone || '')) || /^DR-/i.test(String(row.position_code || ''))).length
    };
  }
  function leaveDaysForMonth(person, monthKey){
    if (!person?.id || !/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return 0;
    const first = `${monthKey}-01`;
    const last = new Date(Date.UTC(Number(monthKey.slice(0,4)), Number(monthKey.slice(5,7)), 0)).toISOString().slice(0,10);
    const days = new Set();
    (st()?.leaves || []).forEach(row => {
      if (normId(row?.staff_id) !== normId(person.id)) return;
      try { if (typeof isLeaveEffective === 'function' && !isLeaveEffective(row)) return; } catch (_) {}
      try { if (typeof isNoDutyLeaveType === 'function' && isNoDutyLeaveType(row)) return; } catch (_) { if (String(row?.type || row?.leave_type || '').split(':::')[0].trim() === 'ไม่รับเวร') return; }
      const start = normDate(row?.start_date || row?.date || row?.work_date);
      const end = normDate(row?.end_date || row?.start_date || row?.date || row?.work_date);
      if (!validDate(start) || !validDate(end) || start > last || end < first) return;
      const from = new Date(`${start < first ? first : start}T00:00:00Z`);
      const to = new Date(`${end > last ? last : end}T00:00:00Z`);
      for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate()+1)) days.add(d.toISOString().slice(0,10));
    });
    return days.size;
  }
  function detailedRosterSummaryHtml(){
    const assignments = monthAssignments();
    const monthKey = String(st()?.monthKey || '');
    const rows = rosterRows().map(person => {
      const own = assignments.filter(slot => normId(slot?.staff_id) === normId(person.id));
      const count = prefix => own.filter(slot => String(slot.duty_code || '').startsWith(prefix)).length;
      const warnings = own.filter(slot => evaluateCandidateV271(person,slot,assignments).warnings.length > 0).length;
      const position = positionCountsForMonth(person,monthKey);
      const eligible = (st()?.positionEligibility || []).filter(row => normId(row?.staff_id) === normId(person.id) && bool(row.is_eligible)).length;
      const trainees = trainingRows().filter(row => normId(row.mentor_staff_id) === normId(person.id) && trainingOverlapsMonth(row,monthKey)).map(trainingName);
      let holiday = 0;
      own.forEach(slot => { try { if (isWeekend(slot.duty_date) || isHolidayDate(slot.duty_date)) holiday++; } catch (_) {} });
      return { person, own, chbd:count('ชบด'), ch4:count('ช4'), ch3a:own.filter(s=>s.duty_code==='ช3A').length, ch3b:own.filter(s=>s.duty_code==='ช3B').length, ch9:count('ช9'), holiday, leaveDays:leaveDaysForMonth(person,monthKey), warnings, bb:position.bb, donor:position.donor, eligible, trainees };
    });
    return `<div class="card v271-detailed-summary"><div class="section-title"><div><h3>ตารางสรุปเพื่อช่วยตัดสินใจ</h3><p class="hint">คลิกชื่อเพื่อดูเวรทั้งหมด สิทธิ์ที่ทำได้ และแก้ไขรายช่อง ระบบแสดงข้อมูลเพื่อให้ Admin ตัดสินใจเอง</p></div><span class="badge blue">${esc(monthKey)}</span></div><div class="table-wrap"><table><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>ชบด</th><th>ช4</th><th>ช3A</th><th>ช3B</th><th>ช9</th><th>เวรวันหยุด</th><th>วันลา</th><th>BB</th><th>Donor</th><th>สิทธิ์</th><th>Warning</th><th>ผู้ฝึกที่ติดตาม</th></tr></thead><tbody>${rows.map(row => `<tr><td><button type="button" class="link-btn" data-v271-summary-staff="${esc(row.person.id)}"><b>${esc(staffName(row.person))}</b></button></td><td>${row.own.length}</td><td>${row.chbd}</td><td>${row.ch4}</td><td>${row.ch3a}</td><td>${row.ch3b}</td><td>${row.ch9}</td><td>${row.holiday}</td><td>${row.leaveDays}</td><td>${row.bb}</td><td>${row.donor}</td><td>${row.eligible}</td><td>${row.warnings ? `<span class="badge orange">${row.warnings}</span>` : '<span class="badge green">0</span>'}</td><td>${row.trainees.length ? esc(row.trainees.join(', ')) : '-'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function showStaffSummary(staffId){
    const person = staffById(staffId);
    const assignments = monthAssignments();
    const own = assignments.filter(slot => normId(slot.staff_id) === normId(staffId)).sort((a,b) => normDate(a.duty_date).localeCompare(normDate(b.duty_date)));
    const eligibleCodes = (st()?.positionEligibility || []).filter(row => normId(row?.staff_id) === normId(staffId) && bool(row.is_eligible)).map(row => String(row.position_code || '')).filter(Boolean).sort((a,b)=>a.localeCompare(b,'th'));
    const html = `<h2>รายละเอียดเวรของ ${esc(staffName(person))}</h2><p class="hint">${esc(st()?.monthKey || '')} • คลิก “แก้ไข” เพื่อเปิด Candidate Debug Mode</p><div class="notice soft-notice compact"><b>สิทธิ์ที่ทำได้ ${eligibleCodes.length} รายการ:</b> ${eligibleCodes.length ? esc(eligibleCodes.join(', ')) : 'ยังไม่ได้กำหนดสิทธิ์'}</div>${own.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>สถานะ</th><th></th></tr></thead><tbody>${own.map(slot => {
      const result = evaluateCandidateV271(person,slot,assignments);
      return `<tr><td>${esc(normDate(slot.duty_date))}</td><td>${esc(dutyLabel(slot.duty_code))}</td><td>${result.hardErrors.length?`<span class="badge red">บล็อก ${result.hardErrors.length}</span>`:result.warnings.length?`<span class="badge orange">เตือน ${result.warnings.length}</span>`:'<span class="badge green">ผ่าน</span>'}</td><td><button class="tiny-btn" type="button" data-v271-edit-summary-slot="${esc(slotId(slot))}">แก้ไข</button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีเวรในเดือนนี้</div>'}`;
    showModal(html);
  }

  /* ------------------------------------------------------------------
     Wrappers loaded after V270
     ------------------------------------------------------------------ */
  try {
    const previousLoad = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
    if (previousLoad && !previousLoad.__v271TrainingLoad) {
      const wrapped = async function loadAllDataV271(){
        const result = await previousLoad.apply(this,arguments);
        await loadTrainingAssignments({ force:true });
        return result;
      };
      wrapped.__v271TrainingLoad = true;
      assignGlobal('loadAllData',wrapped);
    }
  } catch (_) {}

  try {
    const previousBuild = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);
    if (previousBuild && !previousBuild.__v271TrainingRange) {
      const wrapped = function buildMonthlyPositionDraftV271(){
        const draft = previousBuild.apply(this,arguments);
        if (draft && Array.isArray(draft.rows)) {
          draft.rows = pairTrainingRows(draft.rows);
          draft.trainingPairingV271 = true;
        }
        return draft;
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('buildMonthlyPositionDraft',wrapped);
    }
  } catch (_) {}

  try {
    const previousMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
    if (previousMatrix && !previousMatrix.__v271TrainingRange) {
      const wrapped = function renderMonthPositionMatrixV271(rows,dates){
        const paired = pairTrainingRows(Array.isArray(rows)?rows:[]);
        let html = String(previousMatrix.call(this,paired,dates) || '');
        const ids = new Set(trainingRows().filter(row => row.trainee_staff_id && (dates || []).some(date => activeTrainingOn(row,date))).map(row => normId(row.trainee_staff_id)));
        ids.forEach(id => {
          const name = esc(staffName(id)).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          html = html.replace(new RegExp(`(<div class="matrix-staff-name"><b>${name}<\\/b><small>)(.*?)(<\\/small>)`), '$1$2 • ผู้ฝึก (ไม่นับ Slot)$3');
        });
        return html;
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('renderMonthPositionMatrix',wrapped);
    }
  } catch (_) {}

  try {
    const previousDaily = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (previousDaily && !previousDaily.__v271TrainingRange) {
      const wrapped = function renderPositionsPageV271(){
        const stateRef = st();
        const date = normDate(document.getElementById('positionDateInput')?.value || stateRef?.positionDate || '');
        const oldRows = stateRef?.positions;
        const activeIds = new Set(trainingForDate(date).map(row => normId(row.trainee_staff_id)).filter(Boolean));
        if (stateRef && Array.isArray(oldRows)) stateRef.positions = oldRows.filter(row => normDate(row?.work_date) !== date || !activeIds.has(normId(row?.staff_id)));
        try {
          let html = String(previousDaily.apply(this,arguments) || '');
          html += dailyTrainingSummary(date,Array.isArray(oldRows)?oldRows:[]);
          return html;
        } finally { if (stateRef) stateRef.positions = oldRows; }
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('renderPositionsPage',wrapped);
    }
  } catch (_) {}

  try {
    const previousSavePositions = window.savePositions || (typeof savePositions === 'function' ? savePositions : null);
    if (previousSavePositions && !previousSavePositions.__v271TrainingRange) {
      const wrapped = async function savePositionsV271(){
        const date = document.getElementById('positionDateInput')?.value || st()?.positionDate;
        const result = await previousSavePositions.apply(this,arguments);
        try {
          await syncTrainingPairsForDate(date);
          await loadAllData();
          renderPage();
        } catch (error) { toast(`บันทึกตำแหน่งหลักแล้ว แต่ซิงก์ผู้ฝึกไม่สำเร็จ: ${friendly(error)}`, 'error'); }
        return result;
      };
      wrapped.__v271TrainingRange = true;
      assignGlobal('savePositions',wrapped);
    }
  } catch (_) {}

  try {
    const previousScheduler = window.renderSchedulerPage || (typeof renderSchedulerPage === 'function' ? renderSchedulerPage : null);
    if (previousScheduler && !previousScheduler.__v271DetailedSummary) {
      const wrapped = function renderSchedulerPageV271(){
        let html = String(previousScheduler.apply(this,arguments) || '');
        if (!html.includes('v271-detailed-summary')) html = html.replace(/<\/div>\s*$/, `${detailedRosterSummaryHtml()}</div>`);
        return html;
      };
      wrapped.__v271DetailedSummary = true;
      assignGlobal('renderSchedulerPage',wrapped);
    }
  } catch (_) {}

  assignGlobal('autoAssignRoster',autoAssignRosterV271);
  assignGlobal('canStaffWorkSlot',canStaffWorkSlotV271);
  if (window.cnmiV266) {
    window.cnmiV266.evaluateRosterCandidateV266 = evaluateCandidateV271;
    window.cnmiV266.filterEligibleStaffBeforeAutoAssignV266 = filterCandidatesV271;
    window.cnmiV266.isRestrictedDutyV271 = code => RESTRICTED.has(String(code || '').trim());
  }

  try {
    const previousRender = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
    if (previousRender && !previousRender.__v271Decorated) {
      const wrapped = function renderPageV271(){
        const result = previousRender.apply(this,arguments);
        setTimeout(decoratePermissionAutosave,40);
        setTimeout(decorateTrainingManagement,50);
        setTimeout(decoratePermissionAutosave,140);
        setTimeout(decorateTrainingManagement,150);
        return result;
      };
      wrapped.__v271Decorated = true;
      assignGlobal('renderPage',wrapped);
    }
  } catch (_) {}

  /* ------------------------------------------------------------------
     Event interception
     ------------------------------------------------------------------ */
  window.addEventListener('change',function(event){
    const permission = event.target?.closest?.('input[data-eligibility]');
    if (permission) {
      const previous = !permission.checked;
      permission.closest('.position-check')?.classList.toggle('checked',permission.checked);
      setPermissionLocal(permission.dataset.staffId,permission.dataset.positionCode,permission.checked);
      schedulePermissionSave(permission,previous);
      return;
    }
    if (event.target?.id === 'v271CandidateSelect') updateCandidateModalSelection();
  },true);

  window.addEventListener('drop',function(event){
    const slotEl = event.target?.closest?.('[data-drop-slot]');
    if (!slotEl) return;
    const target = monthAssignments().find(row => slotId(row) === String(slotEl.dataset.dropSlot || ''));
    if (!target) return;
    const sourceSlotId = event.dataTransfer?.getData('sourceSlotId');
    if (sourceSlotId) {
      const source = monthAssignments().find(row => slotId(row) === String(sourceSlotId));
      if (!source || source.is_locked || target.is_locked) return;
      const test = monthAssignments().map(row => ({ ...row }));
      const src = test.find(row => slotId(row) === String(sourceSlotId));
      const dst = test.find(row => slotId(row) === String(slotEl.dataset.dropSlot || ''));
      if (!src || !dst) return;
      const a = src.staff_id || null, b = dst.staff_id || null;
      src.staff_id = b; dst.staff_id = a;
      const checks = [];
      if (a) checks.push(evaluateCandidateV271(staffById(a),dst,test));
      if (b) checks.push(evaluateCandidateV271(staffById(b),src,test));
      const hard = checks.flatMap(result => result.hardErrors || []);
      const warnings = checks.flatMap(result => result.warnings || []);
      if (hard.length || warnings.length) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
        toast(hard.length ? `สลับไม่ได้: ${hard.map(item=>item.message).join(' • ')}` : 'การสลับนี้มีคำเตือน กรุณาใช้ปุ่ม “เลือกคน” และ Force Assign ทีละช่องเพื่อเก็บ Audit Log', hard.length ? 'error' : undefined);
      }
      return;
    }
    const staffId = event.dataTransfer?.getData('staffId');
    if (!staffId) return;
    const result = evaluateCandidateV271(staffById(staffId),target,monthAssignments());
    if (result.hardErrors.length) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      toast(`จัดไม่ได้: ${result.hardErrors.map(item=>item.message).join(' • ')}`,'error');
      return;
    }
    if (result.warnings.length) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      showCandidateModal(target,staffId);
      toast('รายการนี้มีคำเตือน กรุณาตรวจสอบเหตุผลและใช้ Force Assign');
    }
  },true);

  window.addEventListener('click',function(event){
    const retryStatus = event.target?.closest?.('.v271-permission-save-state[data-status="error"]');
    if (retryStatus) {
      event.preventDefault(); event.stopPropagation();
      const input = retryStatus.closest('.position-check')?.querySelector('input[data-eligibility]');
      if (input) {
        const key = permissionKey(input.dataset.staffId,input.dataset.positionCode);
        const previous = permissionConfirmed.get(key) ?? !!input.checked;
        const desired = permissionFailedDesired.has(key) ? permissionFailedDesired.get(key) : !!input.checked;
        input.checked = !!desired;
        input.closest('.position-check')?.classList.toggle('checked',!!desired);
        setPermissionLocal(input.dataset.staffId,input.dataset.positionCode,!!desired);
        schedulePermissionSave(input,previous);
      }
      return;
    }
    const editRoster = event.target?.closest?.('[data-edit-roster-slot-v213]');
    if (editRoster) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      const slot = monthAssignments().find(row => slotId(row) === String(editRoster.dataset.editRosterSlotV213 || ''));
      showCandidateModal(slot);
      return;
    }
    const savePermissions = event.target?.closest?.('[data-save-position-eligibility]');
    if (savePermissions) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveAllVisiblePermissions();
      return;
    }
    const editTraining = event.target?.closest?.('[data-v271-edit-training]');
    if (editTraining) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      st().editingTrainingIdV271 = editTraining.dataset.v271EditTraining;
      decorateTrainingManagementForce();
      return;
    }
    const deactivate = event.target?.closest?.('[data-v271-deactivate-training]');
    if (deactivate) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      deactivateTraining(deactivate.dataset.v271DeactivateTraining);
      return;
    }
    if (event.target?.closest?.('[data-v271-cancel-training-edit]')) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      st().editingTrainingIdV271 = null;
      decorateTrainingManagementForce();
      return;
    }
    const summary = event.target?.closest?.('[data-v271-summary-staff]');
    if (summary) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      showStaffSummary(summary.dataset.v271SummaryStaff);
      return;
    }
    const editSummary = event.target?.closest?.('[data-v271-edit-summary-slot]');
    if (editSummary) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      try { closeModal(); } catch (_) {}
      const slot = monthAssignments().find(row => slotId(row) === String(editSummary.dataset.v271EditSummarySlot || ''));
      setTimeout(() => showCandidateModal(slot),20);
    }
  },true);

  window.addEventListener('submit',function(event){
    if (event.target?.id === 'v271RosterCandidateForm') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      submitCandidateForm(event);
      return;
    }
    if (event.target?.id === 'v271TrainingForm') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveTrainingForm(event.target);
    }
  },true);

  const style = document.createElement('style');
  style.id = 'cnmi-v271-style';
  style.textContent = `
    .v271-permission-save-state{display:block;margin-top:4px;font-style:normal;font-size:10px;font-weight:600}
    .v271-permission-save-state[data-status="saving"]{color:#1d4ed8}.v271-permission-save-state[data-status="saved"]{color:#15803d}.v271-permission-save-state[data-status="error"]{color:#b91c1c;cursor:pointer}
    .v271-autosave-badge{margin-left:auto}.v271-candidate-diagnostics{display:grid;gap:4px;margin-top:4px}
    .v271-diagnostic{padding:6px 8px;border-radius:8px;font-size:12px}.v271-diagnostic.hard{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.v271-diagnostic.warning{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.v271-diagnostic.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
    .v271-debug-list{border:1px solid #dbeafe;border-radius:10px;padding:8px}.v271-debug-list summary{cursor:pointer;font-weight:700}.v271-debug-rows{display:grid;gap:7px;margin-top:8px;max-height:320px;overflow:auto}.v271-debug-row{padding:8px;border:1px solid #e5e7eb;border-radius:10px}.v271-debug-row.hard{opacity:.78}.v271-candidate-actions{display:flex;gap:8px;flex-wrap:wrap}.warn-btn{border:0;border-radius:10px;padding:10px 14px;background:#f59e0b;color:#fff;font-weight:700;cursor:pointer}
    .v271-training-layout{grid-template-columns:minmax(330px,.9fr) minmax(520px,1.2fr)}.v271-training-body code{background:#eff6ff;border-radius:6px;padding:2px 5px;color:#1d4ed8}.v271-training-table{min-width:760px}.full-span{grid-column:1/-1}
    .v271-training-chips{display:flex;gap:8px;flex-wrap:wrap}.v271-training-chip{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px}.v271-training-chip small{color:#475569}
    .v271-detailed-summary{margin-top:14px}.v271-detailed-summary table{min-width:1150px}.v271-detailed-summary th,.v271-detailed-summary td{text-align:center}.v271-detailed-summary th:first-child,.v271-detailed-summary td:first-child{text-align:left}.link-btn{background:none;border:0;padding:0;color:#0369a1;cursor:pointer;font:inherit;text-decoration:underline}
    @media(max-width:900px){.v271-training-layout{grid-template-columns:1fr}.v271-autosave-badge{width:100%;margin-left:0}.v271-candidate-actions>*{width:100%}}
  `;
  document.head.appendChild(style);

  try {
    const observer = new MutationObserver(() => {
      decoratePermissionAutosave();
      decorateTrainingManagement();
    });
    observer.observe(document.body,{ childList:true,subtree:true });
  } catch (_) {}

  const stateRef = st();
  if (stateRef && !Array.isArray(stateRef.trainingAssignmentsV271)) stateRef.trainingAssignmentsV271 = [];
  window.cnmiV271 = {
    usesDateRangeMentorship:true,
    excludeFromDaySlot,
    trainingForDate,
    isTrainingPersonOnDate,
    pairTrainingRows,
    syncTrainingPairsForDate,
    loadTrainingAssignments,
    evaluateCandidateV271,
    filterCandidatesV271,
    autoAssignRosterV271,
    showCandidateModal,
    decoratePermissionAutosave,
    decorateTrainingManagement,
    persistPermissionRow,
    writeOverrideAudit
  };
  console.info(`${VERSION} loaded`);
})();
