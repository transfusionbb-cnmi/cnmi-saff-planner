/*
 * CNMI Staff Planner V393 - Training Forms
 *
 * This is an isolated feature patch. It does not replace the existing
 * staff_training_assignments module used by the daytime-position planner.
 * The matching Supabase migration is supabase_v393_training_forms.sql.
 */
(function () {
  'use strict';

  const VERSION = 'V393_TRAINING_FORMS';
  if (window.__CNMI_V393_TRAINING_FORMS__) return;
  window.__CNMI_V393_TRAINING_FORMS__ = true;

  function appState() {
    try { return state || window.state || {}; } catch (_) { return window.state || {}; }
  }

  function db() {
    try { return sb || window.sb || null; } catch (_) { return window.sb || null; }
  }

  function esc(value) {
    try { return escapeHtml(value == null ? '' : String(value)); }
    catch (_) {
      return String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[c]));
    }
  }

  function idEq(a, b) { return String(a || '') === String(b || ''); }

  function actorId() {
    const s = appState();
    try { return currentStaffId(); } catch (_) { return s.profile?.id || null; }
  }

  function today() {
    try { return todayStr(); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  }

  function dateKey(value) {
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }

  function dateLabel(value) {
    if (!value) return '-';
    try { return formatThaiDate(value); }
    catch (_) { return dateKey(value) || '-'; }
  }

  function dateTimeLabel(value) {
    if (!value) return '-';
    try { return formatThaiDateTime(value); }
    catch (_) { return String(value); }
  }

  function staffRows() {
    const s = appState();
    const rows = Array.isArray(s.staff) ? s.staff.slice() : [];
    const active = rows.filter(person => person && person.is_active !== false);
    try { return orderedStaff(active); } catch (_) { return active; }
  }

  function staffName(personOrId) {
    const s = appState();
    const person = typeof personOrId === 'object'
      ? personOrId
      : (s.staff || []).find(row => idEq(row.id, personOrId));
    if (!person) return '-';
    return person.nickname || person.full_name || person.email || '-';
  }

  function staffFullName(personOrId) {
    const s = appState();
    const person = typeof personOrId === 'object'
      ? personOrId
      : (s.staff || []).find(row => idEq(row.id, personOrId));
    return person?.full_name || staffName(person) || '-';
  }

  function staffDate(personOrId) {
    const s = appState();
    const person = typeof personOrId === 'object'
      ? personOrId
      : (s.staff || []).find(row => idEq(row.id, personOrId));
    if (!person) return '';
    return dateKey(
      person.employment_start_date
      || person.start_date
      || person.join_date
      || person.date_of_joining
      || person.hire_date
      || person.start_work_date
      || ''
    );
  }

  function isTrainingManager() {
    const s = appState();
    const p = s.profile || {};
    const role = String(p.role || '').toLowerCase();
    const type = String(p.staff_type || '').trim();
    return role === 'admin'
      || role === 'doctor'
      || role === 'physician'
      || /doctor|physician/.test(role)
      || type === 'แพทย์';
  }

  function trainingActivities() {
    const s = appState();
    return Array.isArray(s.trainingActivities) ? s.trainingActivities : [];
  }

  function trainingRecords() {
    const s = appState();
    return Array.isArray(s.trainingRecords) ? s.trainingRecords : [];
  }

  function activityById(id) {
    return trainingActivities().find(row => idEq(row.id, id)) || null;
  }

  function recordActivity(record) {
    return activityById(record?.activity_id);
  }

  function formTypeLabel(type) {
    return type === 'new_staff'
      ? 'แบบฟอร์มบุคลากรใหม่'
      : 'FM-CNHR-002 บุคลากรเดิม';
  }

  function recordStatus(record) {
    const hasResult = String(record?.result_text || '').trim();
    const hasApplication = String(record?.application_text || '').trim();
    const hasCertificate = !!String(record?.certificate_path || '').trim();
    const hasSignature = !!String(record?.signature_data || '').trim();
    if (record?.form_type === 'new_staff' && hasResult && hasApplication && hasSignature) return 'ครบถ้วน';
    if (hasResult || hasApplication || hasCertificate || hasSignature) return 'กรอกบางส่วน';
    return 'ยังไม่กรอก';
  }

  function statusClass(status) {
    return status === 'ครบถ้วน' ? 'green' : status === 'กรอกบางส่วน' ? 'orange' : 'black';
  }

  function statusOptions(selected) {
    return ['ยังไม่กรอก', 'กรอกบางส่วน', 'ครบถ้วน']
      .map(value => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(value)}</option>`)
      .join('');
  }

  function includedTrainingRows() {
    return trainingRecords()
      .filter(record => record?.is_included !== false)
      .map(record => ({ record, activity: recordActivity(record) }))
      .filter(item => item.activity);
  }

  function activityOverlaps(activity, from, to) {
    const start = dateKey(activity?.start_date);
    const end = dateKey(activity?.end_date);
    if (!start || !end) return false;
    if (from && end < from) return false;
    if (to && start > to) return false;
    return true;
  }

  function yearOverlaps(activity, year) {
    if (!year) return true;
    const start = Number(String(activity?.start_date || '').slice(0, 4));
    const end = Number(String(activity?.end_date || '').slice(0, 4));
    return Number.isFinite(start) && Number.isFinite(end) && start <= Number(year) && Number(year) <= end;
  }

  function ensureFilterState() {
    const s = appState();
    if (s.trainingEditingActivityId === undefined) s.trainingEditingActivityId = null;
    if (s.trainingAdminFrom === undefined) s.trainingAdminFrom = '';
    if (s.trainingAdminTo === undefined) s.trainingAdminTo = '';
    if (s.trainingAdminYear === undefined) s.trainingAdminYear = '';
    if (s.trainingAdminStaff === undefined) s.trainingAdminStaff = '';
    if (s.trainingAdminFormType === undefined) s.trainingAdminFormType = '';
    if (s.trainingAdminStatus === undefined) s.trainingAdminStatus = '';
    if (s.trainingSchemaError === undefined) s.trainingSchemaError = '';
  }

  function filteredTrainingRows(options = {}) {
    ensureFilterState();
    const s = appState();
    const from = options.from !== undefined ? options.from : s.trainingAdminFrom;
    const to = options.to !== undefined ? options.to : s.trainingAdminTo;
    const year = options.year !== undefined ? options.year : s.trainingAdminYear;
    const staff = options.staff !== undefined ? options.staff : s.trainingAdminStaff;
    const formType = options.formType !== undefined ? options.formType : s.trainingAdminFormType;
    const status = options.status !== undefined ? options.status : s.trainingAdminStatus;
    const ownOnly = options.ownOnly === true;
    const me = actorId();
    return includedTrainingRows()
      .filter(item => !ownOnly || idEq(item.record.staff_id, me))
      .filter(item => !staff || idEq(item.record.staff_id, staff))
      .filter(item => !formType || item.record.form_type === formType)
      .filter(item => !status || recordStatus(item.record) === status)
      .filter(item => activityOverlaps(item.activity, from, to))
      .filter(item => yearOverlaps(item.activity, year))
      .sort((a, b) => dateKey(b.activity.start_date).localeCompare(dateKey(a.activity.start_date))
        || staffName(a.record.staff_id).localeCompare(staffName(b.record.staff_id), 'th'));
  }

  function trainingSchemaNotice() {
    const s = appState();
    if (!s.trainingSchemaError) return '';
    return `<div class="notice warning v393-training-schema-warning">
      <b>ระบบอบรมยังไม่พร้อมใช้งาน</b><br>
      กรุณาให้ผู้ดูแลระบบรันไฟล์ <code>supabase_v393_training_forms.sql</code> ใน Supabase ก่อน แล้วกดรีเฟรช
    </div>`;
  }

  function participantIdsForActivity(activityId) {
    return Array.from(new Set(trainingRecords()
      .filter(record => idEq(record.activity_id, activityId) && record.is_included !== false)
      .map(record => String(record.staff_id))));
  }

  function participantChecks(selectedIds) {
    const selected = new Set((selectedIds || []).map(String));
    const rows = staffRows();
    if (!rows.length) return '<div class="empty-state">ยังไม่มีรายชื่อเจ้าหน้าที่ที่ใช้งานอยู่</div>';
    return `<div class="v393-participant-grid">${rows.map(person => {
      const id = String(person.id);
      return `<label class="v393-participant-check ${selected.has(id) ? 'selected' : ''}">
        <input type="checkbox" name="training_participant_ids" value="${esc(id)}" ${selected.has(id) ? 'checked' : ''}>
        <span><b>${esc(staffName(person))}</b><small>${esc(person.staff_type || person.position || '-')} · วันเริ่มงาน ${esc(staffDate(person) ? dateLabel(staffDate(person)) : 'ยังไม่ระบุ')}</small></span>
      </label>`;
    }).join('')}</div>`;
  }

  function trainingActivityForm() {
    const s = appState();
    const editing = s.trainingEditingActivityId ? activityById(s.trainingEditingActivityId) : null;
    const selectedIds = editing ? participantIdsForActivity(editing.id) : [];
    const existing = !!editing?.include_existing_form;
    const newStaff = !!editing?.include_new_staff_form;
    return `<div class="card v393-training-form-card">
      <div class="section-title">
        <div><h3>${editing ? 'แก้ไขกิจกรรมอบรม' : 'เพิ่มกิจกรรมอบรม'}</h3>
        <p class="hint">เลือกแบบฟอร์มแยกกันได้ และเลือกผู้เข้าร่วมหลายคนในกิจกรรมเดียว</p></div>
        ${editing ? '<button class="ghost-btn" type="button" data-training-cancel-activity>ยกเลิกแก้ไข</button>' : ''}
      </div>
      <form id="trainingActivityForm" class="form-grid compact-form">
        <label class="wide">หัวข้อ/ชื่อกิจกรรมอบรม <input name="title" value="${esc(editing?.title || '')}" placeholder="เช่น การอบรมการช่วยฟื้นคืนชีพ" required></label>
        <label>วันที่เริ่ม <input name="start_date" type="date" value="${esc(editing?.start_date || today())}" required></label>
        <label>วันที่สิ้นสุด <input name="end_date" type="date" value="${esc(editing?.end_date || today())}" required></label>
        <label>สถานที่ <input name="location" value="${esc(editing?.location || '')}" placeholder="เช่น ห้องประชุม 3D" required></label>
        <label>ชื่อผู้สอน/วิทยากร <input name="instructor_name" value="${esc(editing?.instructor_name || '')}" placeholder="ใช้เป็นค่าเริ่มต้นในแบบฟอร์มบุคลากรใหม่"></label>
        <label class="wide">หมายเหตุ <textarea name="note" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)">${esc(editing?.note || '')}</textarea></label>
        <fieldset class="wide v393-form-choice"><legend>นำเข้ากิจกรรมนี้เข้าแบบฟอร์ม</legend>
          <label class="v393-form-check"><input type="checkbox" name="include_existing_form" ${existing ? 'checked' : ''}><span>นำเข้าแบบฟอร์ม FM-CNHR-002 บุคลากรเดิม</span></label>
          <label class="v393-form-check"><input type="checkbox" name="include_new_staff_form" ${newStaff ? 'checked' : ''}><span>นำเข้าแบบฟอร์มบุคลากรใหม่</span></label>
          <small class="hint">ติ๊กได้ 1 อันหรือทั้ง 2 อัน ถ้าติ๊กทั้ง 2 อัน ระบบใช้กิจกรรมและข้อมูลผู้เข้าร่วมรายการเดียวกัน โดยแยกแบบฟอร์มให้อัตโนมัติ</small>
        </fieldset>
        <div class="wide"><div class="field-label">ผู้เข้าร่วม (เลือกได้หลายคน)</div>${participantChecks(selectedIds)}</div>
        <button class="primary-btn wide" type="submit">${editing ? 'บันทึกการแก้ไขกิจกรรมอบรม' : 'บันทึกกิจกรรมอบรม'}</button>
      </form>
    </div>`;
  }

  function trainingActivityList() {
    const rows = trainingActivities().slice().sort((a, b) => dateKey(b.start_date).localeCompare(dateKey(a.start_date)));
    if (!rows.length) return emptyTraining('ยังไม่มีกิจกรรมอบรม');
    return `<div class="v393-training-activity-list">${rows.map(activity => {
      const count = participantIdsForActivity(activity.id).length;
      const forms = [activity.include_existing_form ? 'FM-CNHR-002' : '', activity.include_new_staff_form ? 'บุคลากรใหม่' : ''].filter(Boolean).join(' + ');
      return `<div class="v393-training-activity-row">
        <div><b>${esc(activity.title)}</b><div class="muted">${dateLabel(activity.start_date)}${dateKey(activity.end_date) !== dateKey(activity.start_date) ? ` – ${dateLabel(activity.end_date)}` : ''} · ${esc(activity.location || '-')}</div></div>
        <div class="v393-training-activity-meta"><span class="badge blue">${esc(forms || 'ไม่ระบุแบบฟอร์ม')}</span><span class="badge black">${count} คน</span></div>
        <div class="actions"><button class="tiny-btn" type="button" data-training-edit-activity="${esc(activity.id)}">แก้ไข</button><button class="tiny-btn danger" type="button" data-training-delete-activity="${esc(activity.id)}">ลบ</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  function emptyTraining(message) {
    return `<div class="empty-state v393-empty">${esc(message)}</div>`;
  }

  function trainingManagerSection() {
    if (!isTrainingManager()) return '';
    const s = appState();
    if (s.trainingSchemaError) return trainingSchemaNotice();
    return `<div class="v393-training-manager-grid">${trainingActivityForm()}<div class="card v393-training-activity-card"><div class="section-title"><div><h3>กิจกรรมอบรมที่สร้างไว้</h3><p class="hint">แก้ไขผู้เข้าร่วมและประเภทแบบฟอร์มได้ โดยข้อมูลผลการอบรมเดิมจะไม่ถูกลบ</p></div></div>${trainingActivityList()}</div></div>`;
  }

  function recordCertificateLabel(record) {
    if (!record?.certificate_path) return '<span class="muted">ยังไม่ได้แนบ Certificate (ไม่บังคับ)</span>';
    return `<span class="badge green">แนบแล้ว: ${esc(record.certificate_name || 'Certificate')}</span>`;
  }

  function trainingRecordForm(item) {
    const record = item.record;
    const activity = item.activity;
    const isNewStaff = record.form_type === 'new_staff';
    const sigId = `trainingSignature_${String(record.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return `<article class="card v393-training-record-card" data-training-record-card="${esc(record.id)}">
      <div class="v393-record-head"><div><h3>${esc(activity.title)}</h3><div class="muted">${dateLabel(activity.start_date)}${dateKey(activity.end_date) !== dateKey(activity.start_date) ? ` – ${dateLabel(activity.end_date)}` : ''} · ${esc(activity.location || '-')}</div></div><div>${badge(formTypeLabel(record.form_type), record.form_type === 'new_staff' ? 'purple' : 'blue')} ${badge(recordStatus(record), statusClass(recordStatus(record)))}</div></div>
      <div class="v393-record-summary"><span><b>วันเริ่มงาน</b><br>${esc(record.employment_start_date_snapshot ? dateLabel(record.employment_start_date_snapshot) : 'ยังไม่ระบุ')}</span><span><b>ผู้สอน/วิทยากร</b><br>${esc(record.instructor_name || activity.instructor_name || '-')}</span><span><b>แก้ไขล่าสุด</b><br>${esc(dateTimeLabel(record.updated_at || record.created_at))}</span></div>
      <form class="v393-training-record-form" data-training-record-form="${esc(record.id)}">
        <label>ผล/สิ่งที่ได้รับ <textarea name="result_text" rows="4" placeholder="สรุปผลหรือสิ่งที่ได้รับจากการอบรม">${esc(record.result_text || '')}</textarea></label>
        <label>การนำความรู้ไปใช้ <textarea name="application_text" rows="4" placeholder="ระบุว่าจะนำความรู้ไปใช้กับงานอย่างไร">${esc(record.application_text || '')}</textarea></label>
        <label>แนบ Certificate <input name="certificate" type="file" accept=".pdf,image/*,.doc,.docx"></label>
        <div class="v393-certificate-state">${recordCertificateLabel(record)}</div>
        ${isNewStaff ? `<div class="v393-signature-box">
          <label>ชื่อผู้สอน/ผู้ลงชื่อ <input name="instructor_name" value="${esc(record.instructor_name || activity.instructor_name || '')}" placeholder="กรอกชื่อผู้สอนก่อนบันทึกลายเซ็น"></label>
          <div class="field-label">ลายเซ็นออนไลน์ (Apple Pencil หรือนิ้วบน iPad ได้)</div>
          <canvas id="${esc(sigId)}" class="v393-signature-canvas" data-training-signature="${esc(record.id)}" aria-label="ช่องลายเซ็น"></canvas>
          <div class="v393-signature-actions"><button type="button" class="ghost-btn" data-training-clear-signature="${esc(record.id)}">ล้างลายเซ็น</button>${record.signature_at ? `<span class="hint">บันทึกเมื่อ ${esc(dateTimeLabel(record.signature_at))}</span>` : '<span class="hint">ยังไม่มีลายเซ็น</span>'}</div>
        </div>` : ''}
        <div class="actions v393-record-actions"><button class="primary-btn" type="submit">บันทึกข้อมูล</button><button class="ghost-btn" type="button" data-training-export-record="${esc(record.id)}">Export PDF</button></div>
      </form>
    </article>`;
  }

  function trainingStaffSection() {
    if (appState().trainingSchemaError) return trainingSchemaNotice();
    const rows = filteredTrainingRows({ ownOnly: true, from: '', to: '', year: '', staff: '', formType: '', status: '' });
    return `<div class="card v393-training-staff-card"><div class="section-title"><div><h3>รายการอบรมของฉัน</h3><p class="hint">แสดงเฉพาะรายการที่มีชื่อคุณเป็นผู้เข้าร่วม Certificate ไม่บังคับ และยัง Export PDF ได้แม้ไม่ได้แนบไฟล์</p></div></div>${rows.length ? `<div class="v393-training-record-list">${rows.map(trainingRecordForm).join('')}</div>` : emptyTraining('ยังไม่มีรายการอบรมของคุณ')}</div>`;
  }

  function trainingYears() {
    const values = new Set();
    trainingActivities().forEach(activity => {
      const start = Number(String(activity.start_date || '').slice(0, 4));
      const end = Number(String(activity.end_date || '').slice(0, 4));
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      for (let year = start; year <= end && year < start + 10; year += 1) values.add(year);
    });
    values.add(new Date().getFullYear());
    return Array.from(values).sort((a, b) => b - a);
  }

  function trainingFilterBar() {
    const s = appState();
    const yearOptions = trainingYears().map(year => `<option value="${year}" ${String(s.trainingAdminYear) === String(year) ? 'selected' : ''}>พ.ศ. ${year + 543}</option>`).join('');
    return `<div class="toolbar compact-filter v393-training-filters">
      <label>จากวันที่ <input type="date" id="trainingAdminFrom" value="${esc(s.trainingAdminFrom || '')}"></label>
      <label>ถึงวันที่ <input type="date" id="trainingAdminTo" value="${esc(s.trainingAdminTo || '')}"></label>
      <label>ปี <select id="trainingAdminYear"><option value="">ทุกปี</option>${yearOptions}</select></label>
      <label>บุคลากร <select id="trainingAdminStaff"><option value="">ทุกคน</option>${staffRows().map(person => `<option value="${esc(person.id)}" ${idEq(s.trainingAdminStaff, person.id) ? 'selected' : ''}>${esc(staffName(person))}</option>`).join('')}</select></label>
      <label>ประเภทแบบฟอร์ม <select id="trainingAdminFormType"><option value="">ทุกประเภท</option><option value="existing" ${s.trainingAdminFormType === 'existing' ? 'selected' : ''}>FM-CNHR-002 บุคลากรเดิม</option><option value="new_staff" ${s.trainingAdminFormType === 'new_staff' ? 'selected' : ''}>บุคลากรใหม่</option></select></label>
      <label>สถานะข้อมูล <select id="trainingAdminStatus"><option value="">ทุกสถานะ</option>${statusOptions(s.trainingAdminStatus)}</select></label>
    </div>`;
  }

  function trainingExportStaffPicker() {
    return `<details class="v393-training-export-staff"><summary>เลือกรายชื่อสำหรับ Export (ไม่เลือก = ทุกคน)</summary><div class="v393-export-staff-actions"><button class="tiny-btn" type="button" data-training-select-all="on">เลือกทั้งหมด</button><button class="tiny-btn" type="button" data-training-select-all="off">ล้างการเลือก</button></div><div class="v393-export-staff-grid">${staffRows().map(person => `<label><input type="checkbox" data-training-export-staff="${esc(person.id)}"><span>${esc(staffName(person))}</span></label>`).join('')}</div></details>`;
  }

  function trainingAdminRowsTable(rows) {
    if (!rows.length) return emptyTraining('ไม่พบข้อมูลตามตัวกรอง');
    return `<div class="table-wrap v393-training-table-wrap"><table class="v393-training-table"><thead><tr><th>บุคลากร</th><th>กิจกรรม</th><th>วันที่</th><th>ประเภทแบบฟอร์ม</th><th>สถานะ</th><th>อัปเดตล่าสุด</th></tr></thead><tbody>${rows.map(item => {
      const record = item.record;
      const activity = item.activity;
      return `<tr><td><b>${esc(staffName(record.staff_id))}</b><br><small>${esc(staffFullName(record.staff_id))}</small></td><td><b>${esc(activity.title)}</b><br><small>${esc(activity.location || '-')}</small></td><td>${esc(dateLabel(activity.start_date))}${dateKey(activity.end_date) !== dateKey(activity.start_date) ? `<br>ถึง ${esc(dateLabel(activity.end_date))}` : ''}</td><td>${badge(formTypeLabel(record.form_type), record.form_type === 'new_staff' ? 'purple' : 'blue')}</td><td>${badge(recordStatus(record), statusClass(recordStatus(record)))}</td><td>${esc(dateTimeLabel(record.updated_at || record.created_at))}</td></tr>`;
    }).join('')}</tbody></table></div><div class="mobile-cards v393-training-admin-cards">${rows.map(item => {
      const record = item.record;
      const activity = item.activity;
      return `<div class="mobile-card"><div class="section-title"><h3>${esc(staffName(record.staff_id))}</h3>${badge(recordStatus(record), statusClass(recordStatus(record)))}</div><div><b>กิจกรรม:</b> ${esc(activity.title)}</div><div><b>วันที่:</b> ${esc(dateLabel(activity.start_date))} – ${esc(dateLabel(activity.end_date))}</div><div><b>แบบฟอร์ม:</b> ${esc(formTypeLabel(record.form_type))}</div><div><b>วันเริ่มงาน:</b> ${esc(record.employment_start_date_snapshot ? dateLabel(record.employment_start_date_snapshot) : 'ยังไม่ระบุ')}</div></div>`;
    }).join('')}</div>`;
  }

  function trainingAdminSection() {
    if (!isTrainingManager()) return '';
    if (appState().trainingSchemaError) return '';
    const rows = filteredTrainingRows();
    return `<div class="card v393-training-admin-card"><div class="section-title"><div><h3>ภาพรวมข้อมูลอบรม</h3><p class="hint">Admin/แพทย์ดูข้อมูลรวมและกรองตามคน ช่วงวันที่ ประเภทแบบฟอร์ม ปี และสถานะข้อมูลได้</p></div><div class="actions"><button class="ghost-btn" type="button" data-training-export-admin="existing">Export FM-CNHR-002 PDF</button><button class="ghost-btn" type="button" data-training-export-admin="new_staff">Export แบบฟอร์มบุคลากรใหม่ PDF</button></div></div>${trainingFilterBar()}${trainingExportStaffPicker()}${trainingAdminRowsTable(rows)}</div>`;
  }

  function emptyBaseActivities() {
    try { return typeof renderActivitiesPage === 'function' ? renderActivitiesPage() : ''; }
    catch (_) { return ''; }
  }

  const previousRenderActivities = window.renderActivitiesPage || (typeof renderActivitiesPage === 'function' ? renderActivitiesPage : null);
  if (previousRenderActivities) {
    const renderActivitiesV393 = function renderActivitiesPageV393() {
      ensureFilterState();
      let html = String(previousRenderActivities.apply(this, arguments) || '');
      const training = `<section class="v393-training-section"><div class="section-title v393-training-title"><div><h2>อบรมบุคลากร / FM-CNHR-002</h2><p class="hint">การ์ดนี้แยกจากกิจกรรมทั่วไป เพื่อเก็บผลการอบรมของแต่ละบุคลากรและ Export แบบฟอร์มได้ตรงประเภท</p></div></div>${trainingManagerSection()}${trainingStaffSection()}${trainingAdminSection()}</section>`;
      return html + training;
    };
    window.renderActivitiesPage = renderActivitiesV393;
    try { (0, eval)('renderActivitiesPage = window.renderActivitiesPage'); } catch (_) {}
  }

  function augmentProfileHtml(html) {
    const p = appState().profile || {};
    const value = staffDate(p);
    const item = `<div><span>วันเริ่มงาน</span><b>${esc(value ? dateLabel(value) : 'ยังไม่ระบุ')}</b></div>`;
    if (String(html).includes('วันเริ่มงาน')) return html;
    let result = String(html).replace(/(<div><span>ชื่อผู้ใช้<\/span><b>[\s\S]*?<\/b><\/div>)/, `$1${item}`);
    if (result === String(html)) result = String(html).replace(/(<div><span>Email<\/span><b>[\s\S]*?<\/b><\/div>)/, `$1${item}`);
    return result;
  }

  const previousRenderProfile = window.renderMyProfilePage || (typeof renderMyProfilePage === 'function' ? renderMyProfilePage : null);
  if (previousRenderProfile) {
    const renderProfileV393 = function renderMyProfilePageV393() {
      return augmentProfileHtml(previousRenderProfile.apply(this, arguments));
    };
    window.renderMyProfilePage = renderProfileV393;
    try { (0, eval)('renderMyProfilePage = window.renderMyProfilePage'); } catch (_) {}
  }

  function augmentUsersHtml(html) {
    let occurrence = 0;
    return String(html).replace(/<label>รหัสพนักงาน\s*<input data-field="employee_code"[^>]*><\/label>/g, match => {
      const value = occurrence === 0 ? staffDate(appState().staff?.find(row => idEq(row.id, appState().usersStaffId))) : '';
      occurrence += 1;
      return `${match}<label>วันเริ่มงาน <input type="date" data-field="employment_start_date" value="${esc(value)}"><small class="hint">ใช้เป็นวันเริ่มงานในแบบฟอร์มอบรม</small></label>`;
    }).replace(/<label>รหัสพนักงาน\s*<input name="employee_code"[^>]*><\/label>/g, match => `${match}<label>วันเริ่มงาน <input type="date" name="employment_start_date"><small class="hint">ถ้ามีข้อมูลจาก Excel ให้ระบุวันเริ่มงาน</small></label>`);
  }

  const previousRenderUsers = window.renderUsersPage || (typeof renderUsersPage === 'function' ? renderUsersPage : null);
  if (previousRenderUsers) {
    const renderUsersV393 = function renderUsersPageV393() {
      return augmentUsersHtml(previousRenderUsers.apply(this, arguments));
    };
    window.renderUsersPage = renderUsersV393;
    try { (0, eval)('renderUsersPage = window.renderUsersPage'); } catch (_) {}
  }

  function userField(row, field, fallback) {
    const el = row.querySelector(`[data-field="${field}"]`);
    return el ? el.value : fallback;
  }

  async function saveStaffUsersV393() {
    if (!isTrainingManager() || !appState().profile || String(appState().profile.role || '').toLowerCase() !== 'admin') {
      return showToast('เฉพาะ Admin เท่านั้น', { tone: 'error' });
    }
    const rowsById = new Map();
    Array.from(document.querySelectorAll('[data-staff-row]')).forEach(row => {
      const id = row.dataset.staffRow;
      if (!id || rowsById.has(id)) return;
      const original = (appState().staff || []).find(person => idEq(person.id, id)) || {};
      const valueOr = (field, fallback = '') => {
        const value = userField(row, field, undefined);
        return value === undefined ? fallback : value;
      };
      rowsById.set(id, {
        id,
        nickname: valueOr('nickname', original.nickname || '') || null,
        full_name: valueOr('full_name', original.full_name || '') || null,
        email: valueOr('email', original.email || '') || null,
        employee_code: valueOr('employee_code', original.employee_code || '') || null,
        phone: valueOr('phone', original.phone || '') || null,
        login_name: valueOr('login_name', original.login_name || '') || null,
        staff_color: valueOr('staff_color', original.staff_color || '#e8f3ff') || null,
        staff_type: valueOr('staff_type', original.staff_type || '') || null,
        position: valueOr('position', original.position || '') || null,
        role: valueOr('role', original.role || 'staff') || 'staff',
        is_active: valueOr('is_active', original.is_active ? 'true' : 'false') === 'true',
        maternity_status: valueOr('maternity_status', original.maternity_status ? 'true' : 'false') === 'true',
        is_long_term_leave: valueOr('is_long_term_leave', original.is_long_term_leave ? 'true' : 'false') === 'true',
        roster_enabled: valueOr('roster_enabled', original.roster_enabled === false ? 'false' : 'true') !== 'false',
        daily_position_enabled: valueOr('daily_position_enabled', original.daily_position_enabled === false ? 'false' : 'true') !== 'false',
        position_training_status: valueOr('position_training_status', original.position_training_status || 'ใช้งานปกติ') || 'ใช้งานปกติ',
        employment_start_date: valueOr('employment_start_date', staffDate(original)) || null
      });
    });
    const rows = Array.from(rowsById.values());
    if (!rows.length) return showToast('ไม่พบข้อมูลผู้ใช้งานให้บันทึก', { tone: 'error' });
    let result = await db().from('staff_profiles').upsert(rows, { onConflict: 'id' });
    let compatibilityMessage = '';
    if (result.error && /employment_start_date|column/i.test(String(result.error.message || ''))) {
      const fallback = rows.map(({ employment_start_date, ...rest }) => rest);
      result = await db().from('staff_profiles').upsert(fallback, { onConflict: 'id' });
      compatibilityMessage = 'ข้อมูลอื่นบันทึกแล้ว แต่วันเริ่มงานยังไม่ถูกบันทึก กรุณารัน SQL V393 ก่อน';
    }
    if (result.error) return showToast(friendlyTrainingError(result.error), { tone: 'error' });
    await loadAllData();
    renderPage();
    showToast(compatibilityMessage || 'บันทึกข้อมูลผู้ใช้งานและวันเริ่มงานแล้ว');
  }

  const previousSaveStaffUsers = window.saveStaffUsers || (typeof saveStaffUsers === 'function' ? saveStaffUsers : null);
  if (previousSaveStaffUsers) {
    window.saveStaffUsers = saveStaffUsersV393;
    try { (0, eval)('saveStaffUsers = window.saveStaffUsers'); } catch (_) {}
  }

  function friendlyTrainingError(error) {
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || String(error || 'เกิดข้อผิดพลาด'); }
  }

  const previousSaveNewStaff = window.saveNewStaff || (typeof saveNewStaff === 'function' ? saveNewStaff : null);
  if (previousSaveNewStaff) {
    const saveNewStaffV393 = async function (form) {
      const email = String(form.querySelector('[name="email"]')?.value || '').trim().toLowerCase();
      const startDate = String(form.querySelector('[name="employment_start_date"]')?.value || '').trim();
      await previousSaveNewStaff.apply(this, arguments);
      if (!email || !startDate || !db()) return;
      try {
        const found = await db().from('staff_profiles').select('id').eq('email', email).maybeSingle();
        if (found.error || !found.data?.id) return;
        const updated = await db().from('staff_profiles').update({ employment_start_date: startDate }).eq('id', found.data.id);
        if (updated.error) {
          if (/employment_start_date|column/i.test(String(updated.error.message || ''))) {
            return showToast('เพิ่มผู้ใช้งานแล้ว แต่วันเริ่มงานยังไม่ถูกบันทึก กรุณารัน SQL V393 ก่อน', { tone: 'error' });
          }
          return showToast(friendlyTrainingError(updated.error), { tone: 'error' });
        }
        await loadAllData();
        renderPage();
        showToast('บันทึกวันเริ่มงานของผู้ใช้งานใหม่แล้ว');
      } catch (error) {
        console.warn(`${VERSION}: employment date update skipped`, error);
      }
    };
    window.saveNewStaff = saveNewStaffV393;
    try { (0, eval)('saveNewStaff = window.saveNewStaff'); } catch (_) {}
  }

  async function loadTrainingData() {
    const s = appState();
    const client = db();
    if (!s.profile || !client) return;
    try {
      const [activities, records] = await Promise.all([
        client.from('training_activities').select('*').order('start_date', { ascending: false }),
        client.from('training_records').select('*').order('updated_at', { ascending: false })
      ]);
      if (activities.error) throw activities.error;
      if (records.error) throw records.error;
      s.trainingActivities = activities.data || [];
      s.trainingRecords = records.data || [];
      s.trainingSchemaError = '';
    } catch (error) {
      s.trainingActivities = [];
      s.trainingRecords = [];
      s.trainingSchemaError = String(error?.message || error || 'training schema unavailable');
      console.warn(`${VERSION}: training data unavailable`, error);
    }
  }

  const previousLoadAllData = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
  if (previousLoadAllData) {
    const loadAllDataV393 = async function () {
      const result = await previousLoadAllData.apply(this, arguments);
      await loadTrainingData();
      // The base loader renders before this module finishes its own queries.
      // Render once more so the first page load shows live training data.
      try { renderPage(); } catch (_) {}
      return result;
    };
    window.loadAllData = loadAllDataV393;
    try { (0, eval)('loadAllData = window.loadAllData'); } catch (_) {}
  }

  async function saveTrainingActivity(form) {
    if (!isTrainingManager()) return showToast('เฉพาะ Admin/แพทย์ที่ได้รับสิทธิ์เท่านั้น', { tone: 'error' });
    const client = db();
    if (!client) return showToast('ไม่พบ Supabase client', { tone: 'error' });
    const fd = new FormData(form);
    const participantIds = Array.from(form.querySelectorAll('input[name="training_participant_ids"]:checked')).map(input => input.value);
    const includeExisting = form.querySelector('[name="include_existing_form"]')?.checked === true;
    const includeNewStaff = form.querySelector('[name="include_new_staff_form"]')?.checked === true;
    const row = {
      title: String(fd.get('title') || '').trim(),
      start_date: String(fd.get('start_date') || '').trim(),
      end_date: String(fd.get('end_date') || '').trim(),
      location: String(fd.get('location') || '').trim(),
      instructor_name: String(fd.get('instructor_name') || '').trim() || null,
      note: String(fd.get('note') || '').trim() || null,
      include_existing_form: includeExisting,
      include_new_staff_form: includeNewStaff,
      updated_by: actorId()
    };
    const missing = [];
    if (!row.title) missing.push('หัวข้อกิจกรรม');
    if (!row.start_date) missing.push('วันที่เริ่ม');
    if (!row.end_date) missing.push('วันที่สิ้นสุด');
    if (!row.location) missing.push('สถานที่');
    if (!includeExisting && !includeNewStaff) missing.push('ประเภทแบบฟอร์มอย่างน้อย 1 แบบ');
    if (!participantIds.length) missing.push('ผู้เข้าร่วมอย่างน้อย 1 คน');
    if (missing.length) return showToast('กรุณากรอก/เลือกให้ครบ: ' + missing.join(', '), { tone: 'error' });
    if (row.end_date < row.start_date) return showToast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม', { tone: 'error' });

    let activityId = appState().trainingEditingActivityId || null;
    let savedActivity;
    try {
      if (activityId) {
        const updated = await client.from('training_activities').update(row).eq('id', activityId).select('*').single();
        if (updated.error) throw updated.error;
        savedActivity = updated.data;
      } else {
        const inserted = await client.from('training_activities').insert({ ...row, created_by: actorId() }).select('*').single();
        if (inserted.error) throw inserted.error;
        savedActivity = inserted.data;
        activityId = savedActivity.id;
      }

      const oldRowsResult = await client.from('training_records').select('*').eq('activity_id', activityId);
      if (oldRowsResult.error) throw oldRowsResult.error;
      const oldRows = oldRowsResult.data || [];
      const desired = [];
      const formTypes = [];
      if (includeExisting) formTypes.push('existing');
      if (includeNewStaff) formTypes.push('new_staff');
      participantIds.forEach(staffId => {
        formTypes.forEach(formType => {
          const old = oldRows.find(record => idEq(record.staff_id, staffId) && record.form_type === formType);
          const person = (appState().staff || []).find(staff => idEq(staff.id, staffId));
          desired.push({
            ...(old?.id ? { id: old.id } : {}),
            activity_id: activityId,
            staff_id: staffId,
            form_type: formType,
            is_included: true,
            employment_start_date_snapshot: old?.employment_start_date_snapshot || staffDate(person) || null,
            instructor_name: old?.instructor_name || savedActivity.instructor_name || null,
            updated_by: actorId()
          });
        });
      });
      const upserted = await client.from('training_records').upsert(desired, { onConflict: 'activity_id,staff_id,form_type' });
      if (upserted.error) throw upserted.error;
      const desiredKeys = new Set(desired.map(record => `${record.staff_id}|${record.form_type}`));
      for (const old of oldRows) {
        if (!desiredKeys.has(`${old.staff_id}|${old.form_type}`) && old.is_included !== false) {
          const hidden = await client.from('training_records').update({ is_included: false, updated_by: actorId() }).eq('id', old.id);
          if (hidden.error) throw hidden.error;
        }
      }
      appState().trainingEditingActivityId = null;
      await loadTrainingData();
      renderPage();
      showToast(activityId ? 'แก้ไขกิจกรรมอบรมแล้ว' : 'บันทึกกิจกรรมอบรมแล้ว');
    } catch (error) {
      showToast(friendlyTrainingError(error), { tone: 'error' });
    }
  }

  async function deleteTrainingActivity(id) {
    if (!isTrainingManager()) return showToast('เฉพาะ Admin/แพทย์ที่ได้รับสิทธิ์เท่านั้น', { tone: 'error' });
    if (typeof confirmDialog === 'function' && !(await confirmDialog('ลบกิจกรรมอบรมนี้และรายการแบบฟอร์มที่เชื่อมโยงทั้งหมด?', 'ยืนยันลบกิจกรรมอบรม'))) return;
    const result = await db().from('training_activities').delete().eq('id', id);
    if (result.error) return showToast(friendlyTrainingError(result.error), { tone: 'error' });
    appState().trainingEditingActivityId = null;
    await loadTrainingData();
    renderPage();
    showToast('ลบกิจกรรมอบรมแล้ว');
  }

  async function uploadTrainingCertificate(file, recordId) {
    if (!file) return null;
    const client = db();
    const safeName = String(file.name || 'certificate').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `training-certificates/${actorId()}/${recordId}_${Date.now()}_${safeName}`;
    const result = await client.storage.from('staff-files').upload(path, file, { upsert: false });
    if (result.error) throw result.error;
    return { path, name: file.name || safeName, mime: file.type || null };
  }

  function clearSignature(recordId) {
    const canvas = document.querySelector(`[data-training-signature="${esc(recordId)}"]`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.cleared = '1';
    canvas.dataset.dirty = '1';
  }

  function initSignatureCanvas(canvas) {
    if (!canvas || canvas.dataset.v393Ready === '1') return;
    canvas.dataset.v393Ready = '1';
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.max(260, canvas.getBoundingClientRect().width || 420);
    const cssHeight = 180;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#17324d';
    let drawing = false;
    let last = null;
    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    canvas.addEventListener('pointerdown', event => {
      event.preventDefault();
      drawing = true;
      last = point(event);
      canvas.dataset.dirty = '1';
      canvas.dataset.cleared = '0';
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', event => {
      if (!drawing) return;
      event.preventDefault();
      const next = point(event);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      last = next;
    });
    const stop = event => {
      if (!drawing) return;
      drawing = false;
      last = null;
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', event => { if (event.buttons === 0) stop(event); });
    const record = trainingRecords().find(row => idEq(row.id, canvas.dataset.trainingSignature));
    if (record?.signature_data) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, cssWidth, cssHeight);
        canvas.dataset.dirty = '0';
        canvas.dataset.cleared = '0';
      };
      image.src = record.signature_data;
    }
  }

  function initSignatureCanvases() {
    document.querySelectorAll('[data-training-signature]').forEach(initSignatureCanvas);
  }

  async function saveTrainingRecord(form) {
    const recordId = form.dataset.trainingRecordForm;
    const record = trainingRecords().find(row => idEq(row.id, recordId));
    const activity = recordActivity(record);
    if (!record || !activity) return showToast('ไม่พบรายการอบรมนี้', { tone: 'error' });
    if (!idEq(record.staff_id, actorId()) && !isTrainingManager()) return showToast('ไม่มีสิทธิ์แก้ไขรายการนี้', { tone: 'error' });
    const fd = new FormData(form);
    const patch = {
      result_text: String(fd.get('result_text') || '').trim() || null,
      application_text: String(fd.get('application_text') || '').trim() || null,
      updated_by: actorId()
    };
    if (record.form_type === 'new_staff') {
      patch.instructor_name = String(fd.get('instructor_name') || '').trim() || null;
      const canvas = form.querySelector('[data-training-signature]');
      let signature = record.signature_data || null;
      if (canvas?.dataset.cleared === '1') signature = null;
      if (canvas?.dataset.dirty === '1' && canvas?.dataset.cleared !== '1') signature = canvas.toDataURL('image/png');
      if (signature && !patch.instructor_name) return showToast('กรุณากรอกชื่อผู้สอน/ผู้ลงชื่อก่อนบันทึกลายเซ็น', { tone: 'error' });
      patch.signature_data = signature;
      patch.signature_at = signature
        ? ((canvas?.dataset.dirty === '1' || !record.signature_at) ? new Date().toISOString() : record.signature_at)
        : null;
    }
    const file = fd.get('certificate');
    try {
      if (file && file.size) {
        const uploaded = await uploadTrainingCertificate(file, record.id);
        patch.certificate_path = uploaded.path;
        patch.certificate_name = uploaded.name;
        patch.certificate_mime_type = uploaded.mime;
      }
      const result = await db().from('training_records').update(patch).eq('id', record.id).eq('staff_id', record.staff_id);
      if (result.error) throw result.error;
      await loadTrainingData();
      renderPage();
      showToast('บันทึกข้อมูลอบรมแล้ว');
    } catch (error) {
      showToast(friendlyTrainingError(error), { tone: 'error' });
    }
  }

  function printShell(title, body) {
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Sarabun,Arial,sans-serif;color:#172b3d;font-size:14px;line-height:1.5}h1{font-size:22px;margin:0 0 6px}h2{font-size:18px;margin:0 0 8px}h3{font-size:16px;margin:0 0 5px}.muted{color:#657789}.head{border-bottom:2px solid #1c80b8;padding-bottom:10px;margin-bottom:14px}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0 14px}.meta>div{border:1px solid #d6e1ea;border-radius:8px;padding:7px}.label{display:block;color:#66798b;font-size:12px}.box{border:1px solid #d6e1ea;border-radius:8px;padding:10px;margin:10px 0;white-space:pre-wrap;min-height:55px}.signature{max-width:360px;max-height:150px;border:1px solid #d6e1ea;display:block;background:#fff}.record{break-inside:avoid;page-break-after:always;padding-bottom:14px;margin-bottom:14px}.record:last-child{page-break-after:auto}.pill{display:inline-block;border-radius:999px;background:#e6f3ff;padding:3px 9px;font-size:12px}.cert{margin-top:8px}.sign-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.small{font-size:12px}
    </style></head><body>${body}</body></html>`;
  }

  function openPrintWindow(title) {
    const popup = window.open('', '_blank');
    if (!popup) {
      showToast('เบราว์เซอร์บล็อกหน้าต่าง Export กรุณาอนุญาต Pop-up ของเว็บไซต์นี้', { tone: 'error' });
      return null;
    }
    popup.document.open();
    popup.document.write(printShell(title, '<p>กำลังจัดทำเอกสาร...</p>'));
    popup.document.close();
    return popup;
  }

  function recordPrintBody(item, title, certificateUrl) {
    const record = item.record;
    const activity = item.activity;
    const cert = record.certificate_path
      ? `<div class="cert"><b>Certificate:</b> ${esc(record.certificate_name || 'แนบไฟล์แล้ว')}${certificateUrl ? ` · <a href="${esc(certificateUrl)}">เปิดไฟล์แนบ</a>` : ''}</div>`
      : '<div class="cert"><b>Certificate:</b> ไม่ได้แนบ (ไม่บังคับ)</div>';
    const signature = record.signature_data
      ? `<div class="sign-row"><div><span class="label">ลายเซ็นผู้สอน</span><img class="signature" src="${esc(record.signature_data)}"></div><div><span class="label">ชื่อผู้สอน/ผู้ลงชื่อ</span><b>${esc(record.instructor_name || activity.instructor_name || '-')}</b><br><span class="small">วันที่–เวลา ${esc(dateTimeLabel(record.signature_at))}</span></div></div>`
      : '';
    return `<article class="record"><div class="head"><h1>${esc(title)}</h1><div class="muted">ระบบ Staff Planner | หน่วยเวชศาสตร์บริการโลหิต</div></div><div class="meta"><div><span class="label">บุคลากร</span><b>${esc(staffName(record.staff_id))}</b><br><span class="small">${esc(staffFullName(record.staff_id))}</span></div><div><span class="label">วันเริ่มงาน</span><b>${esc(record.employment_start_date_snapshot ? dateLabel(record.employment_start_date_snapshot) : 'ยังไม่ระบุ')}</b></div><div><span class="label">กิจกรรม</span><b>${esc(activity.title)}</b></div><div><span class="label">วันที่/สถานที่</span><b>${esc(dateLabel(activity.start_date))}${dateKey(activity.end_date) !== dateKey(activity.start_date) ? ` – ${esc(dateLabel(activity.end_date))}` : ''}</b><br>${esc(activity.location || '-')}</div></div><div class="box"><b>ผล/สิ่งที่ได้รับ</b>\n${esc(record.result_text || '-')}</div><div class="box"><b>การนำความรู้ไปใช้</b>\n${esc(record.application_text || '-')}</div>${cert}${signature}<div class="small muted" style="margin-top:12px">สถานะข้อมูล: ${esc(recordStatus(record))} · บันทึกล่าสุด ${esc(dateTimeLabel(record.updated_at || record.created_at))}</div></article>`;
  }

  async function certificateUrl(path) {
    if (!path || !db()) return '';
    try {
      const result = await db().storage.from('staff-files').createSignedUrl(path, 600);
      return result.data?.signedUrl || '';
    } catch (_) { return ''; }
  }

  async function exportTrainingRecord(recordId) {
    const item = includedTrainingRows().find(row => idEq(row.record.id, recordId));
    if (!item) return showToast('ไม่พบรายการอบรมสำหรับ Export', { tone: 'error' });
    const title = formTypeLabel(item.record.form_type);
    const popup = openPrintWindow(title);
    if (!popup) return;
    const url = await certificateUrl(item.record.certificate_path);
    if (popup.closed) return;
    popup.document.body.innerHTML = recordPrintBody(item, title, url);
    setTimeout(() => { try { popup.focus(); popup.print(); } catch (_) {} }, 250);
  }

  function selectedExportStaffIds() {
    return Array.from(document.querySelectorAll('[data-training-export-staff]:checked')).map(input => input.dataset.trainingExportStaff).filter(Boolean);
  }

  async function exportTrainingAdminPdf(formType) {
    if (!isTrainingManager()) return showToast('เฉพาะ Admin/แพทย์ที่ได้รับสิทธิ์เท่านั้น', { tone: 'error' });
    const s = appState();
    const selected = selectedExportStaffIds();
    const rows = filteredTrainingRows({
      formType,
      staff: selected.length === 1 ? selected[0] : '',
      status: '',
      from: s.trainingAdminFrom || '',
      to: s.trainingAdminTo || '',
      year: s.trainingAdminYear || ''
    }).filter(item => !selected.length || selected.includes(String(item.record.staff_id)));
    if (!rows.length) return showToast('ไม่พบข้อมูลสำหรับ Export ตามตัวกรอง', { tone: 'error' });
    const title = formTypeLabel(formType);
    const popup = openPrintWindow(title);
    if (!popup) return;
    const blocks = rows.map(item => recordPrintBody(item, title, '')).join('');
    if (popup.closed) return;
    popup.document.body.innerHTML = `<h1>${esc(title)}</h1><p class="muted">ช่วงวันที่ ${esc(s.trainingAdminFrom ? dateLabel(s.trainingAdminFrom) : 'ทั้งหมด')} – ${esc(s.trainingAdminTo ? dateLabel(s.trainingAdminTo) : 'ทั้งหมด')} · จำนวน ${rows.length} รายการ</p>${blocks}`;
    setTimeout(() => { try { popup.focus(); popup.print(); } catch (_) {} }, 350);
  }

  function setTrainingFilter(id, value) {
    const s = appState();
    const map = {
      trainingAdminFrom: 'trainingAdminFrom',
      trainingAdminTo: 'trainingAdminTo',
      trainingAdminYear: 'trainingAdminYear',
      trainingAdminStaff: 'trainingAdminStaff',
      trainingAdminFormType: 'trainingAdminFormType',
      trainingAdminStatus: 'trainingAdminStatus'
    };
    if (map[id]) s[map[id]] = value || '';
  }

  function installStyles() {
    if (document.getElementById('v393TrainingStyles')) return;
    const style = document.createElement('style');
    style.id = 'v393TrainingStyles';
    style.textContent = `
      .v393-training-section{display:grid;gap:16px;margin-top:22px}.v393-training-title{margin-top:4px}.v393-training-title h2{margin:0;color:#15547c}.v393-training-manager-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:16px}.v393-training-form-card,.v393-training-activity-card,.v393-training-staff-card,.v393-training-admin-card{min-width:0}.v393-form-choice{border:1px solid var(--line,#d9e4ed);border-radius:14px;padding:12px 14px;margin:0}.v393-form-choice legend{font-weight:800;padding:0 5px}.v393-form-check{display:flex;align-items:flex-start;gap:9px;padding:8px 0;font-weight:800}.v393-form-check input,.v393-participant-check input{width:auto;margin-top:3px}.v393-form-check span{line-height:1.35}.v393-participant-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:280px;overflow:auto;padding:2px}.v393-participant-check{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line,#d9e4ed);border-radius:12px;padding:9px;background:#fff;cursor:pointer}.v393-participant-check.selected{background:#eff8ff;border-color:#7dbfe6}.v393-participant-check span{display:grid;gap:2px}.v393-participant-check small{font-weight:400;color:var(--muted,#68798a);line-height:1.3}.v393-training-activity-list{display:grid;gap:9px}.v393-training-activity-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;border:1px solid var(--line,#d9e4ed);border-radius:13px;padding:10px 12px}.v393-training-activity-meta{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.v393-training-record-list{display:grid;gap:16px}.v393-training-record-card{border:1px solid #d9e5ed;box-shadow:0 6px 20px rgba(30,70,100,.06)}.v393-record-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid var(--line,#d9e4ed);padding-bottom:10px}.v393-record-head h3{margin:0 0 3px}.v393-record-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0;color:#334d63}.v393-record-summary>span{background:#f5f9fc;border-radius:10px;padding:8px 10px;font-size:13px}.v393-training-record-form{display:grid;gap:11px}.v393-training-record-form textarea{min-height:90px;resize:vertical}.v393-certificate-state{min-height:24px}.v393-signature-box{display:grid;gap:8px;border:1px dashed #8db1c8;border-radius:14px;padding:12px;background:#f7fbfe}.v393-signature-canvas{display:block;width:100%;height:180px;background:#fff;border:1px solid #b7ccd9;border-radius:10px;touch-action:none;cursor:crosshair}.v393-signature-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.v393-record-actions{justify-content:flex-end}.v393-training-filters{align-items:flex-end;margin:8px 0 12px}.v393-training-admin-card .section-title{align-items:flex-start}.v393-training-table-wrap{max-height:65vh}.v393-training-table th,.v393-training-table td{vertical-align:top}.v393-training-admin-cards{display:none}.v393-training-export-staff{border:1px solid var(--line,#d9e4ed);border-radius:12px;padding:8px 12px;margin-bottom:12px}.v393-export-staff-actions{display:flex;gap:8px;margin:8px 0}.v393-export-staff-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.v393-export-staff-grid label{display:flex;gap:6px;align-items:center}.v393-export-staff-grid input{width:auto}.v393-training-schema-warning{margin-top:8px}.v393-empty{padding:22px}.v393-training-manager-grid .hint{line-height:1.4}@media(max-width:980px){.v393-training-manager-grid{grid-template-columns:1fr}.v393-export-staff-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){.v393-participant-grid{grid-template-columns:1fr}.v393-record-head{display:grid}.v393-record-summary{grid-template-columns:1fr}.v393-training-filters{display:grid;grid-template-columns:1fr 1fr}.v393-training-filters label:last-child{grid-column:1/-1}.v393-training-table-wrap{display:none}.v393-training-admin-cards{display:grid}.v393-training-activity-row{grid-template-columns:1fr}.v393-training-activity-meta{justify-content:flex-start}.v393-export-staff-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v393-record-actions{justify-content:stretch}.v393-record-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    const renderPageV393 = function () {
      const result = previousRenderPage.apply(this, arguments);
      setTimeout(initSignatureCanvases, 0);
      return result;
    };
    window.renderPage = renderPageV393;
    try { (0, eval)('renderPage = window.renderPage'); } catch (_) {}
  }

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form?.id === 'trainingActivityForm') {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      await saveTrainingActivity(form);
      return;
    }
    if (form?.matches?.('[data-training-record-form]')) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      await saveTrainingRecord(form);
    }
  }, true);

  document.addEventListener('change', event => {
    const target = event.target;
    if (!target?.id || !/^trainingAdmin/.test(target.id)) return;
    setTrainingFilter(target.id, target.value);
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    renderPage();
  }, true);

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    };
    if (button.hasAttribute('data-training-cancel-activity')) {
      stop();
      appState().trainingEditingActivityId = null;
      renderPage();
      return;
    }
    if (button.dataset.trainingEditActivity) {
      stop();
      appState().trainingEditingActivityId = button.dataset.trainingEditActivity;
      renderPage();
      return;
    }
    if (button.dataset.trainingDeleteActivity) {
      stop();
      await deleteTrainingActivity(button.dataset.trainingDeleteActivity);
      return;
    }
    if (button.dataset.trainingClearSignature) {
      stop();
      clearSignature(button.dataset.trainingClearSignature);
      return;
    }
    if (button.dataset.trainingExportRecord) {
      stop();
      await exportTrainingRecord(button.dataset.trainingExportRecord);
      return;
    }
    if (button.dataset.trainingExportAdmin) {
      stop();
      await exportTrainingAdminPdf(button.dataset.trainingExportAdmin);
      return;
    }
    if (button.dataset.trainingSelectAll) {
      stop();
      document.querySelectorAll('[data-training-export-staff]').forEach(input => {
        input.checked = button.dataset.trainingSelectAll === 'on';
      });
    }
  }, true);

  installStyles();
  ensureFilterState();
  document.addEventListener('DOMContentLoaded', () => setTimeout(initSignatureCanvases, 0));
  console.info(`${VERSION} loaded`);
})();
