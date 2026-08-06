/* CNMI Staff Planner V410
 * Training is integrated into the existing activity form.  There is no second
 * "add training activity" page and no new-staff form in this version.
 */
(function () {
  'use strict';
  if (window.__CNMI_V396_TRAINING_INTEGRATED__) return;
  window.__CNMI_V396_TRAINING_INTEGRATED__ = true;

  const S = () => window.state || state;
  const DB = () => window.sb || sb;
  const esc = v => typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const idEq = (a,b) => String(a || '') === String(b || '');
  const staffOf = id => (S().staff || []).find(x => idEq(x.id,id)) || {};
  const staffName = id => { const x = staffOf(id); return x.nickname || x.full_name || x.email || '-'; };
  const dateKey = v => {
    const raw = String(v || '').trim();
    if (!raw) return '';
    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (m) {
      let year = Number(m[3]);
      if (year > 2400) year -= 543;
      return `${year}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw.slice(0,10);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dateLabel = v => v ? (typeof formatThaiDate === 'function' ? formatThaiDate(v) : v) : '-';
  const dateTimeLabel = v => v ? (typeof formatThaiDateTime === 'function' ? formatThaiDateTime(v) : v) : '-';
  const actor = () => typeof currentStaffId === 'function' ? currentStaffId() : S().profile?.id;
  const isManager = () => (typeof isAdmin === 'function' && isAdmin()) || S().profile?.staff_type === 'แพทย์' || ['doctor','physician'].includes(String(S().profile?.role || '').toLowerCase());
  const TABLE = 'activity_training_records_v396';

  function trainingRows() { return Array.isArray(S().trainingRecords) ? S().trainingRecords.filter(x => x.is_included !== false && x.form_type === 'existing') : []; }
  function activity(id) { return (S().activities || []).find(x => idEq(x.id,id)); }
  function rowItems() { return trainingRows().map(r => ({ record:r, activity:activity(r.activity_id) })).filter(x => x.activity); }
  function status(r) { return r.result_text || r.application_text || r.certificate_path ? 'กรอกข้อมูลแล้ว' : 'รอกรอกข้อมูล'; }
  function employment(id) { const x=staffOf(id); return x.employment_start_date || x.start_date || ''; }
  const ORGANIZER_MARKER_RE = /\[\[FM-CNHR-002-ORGANIZER:([^\]]*)\]\]\s*/i;
  const BATCH_MARKER_RE = /\[\[FM-CNHR-002-BATCH:([^\]]*)\]\]\s*/i;
  function decodeMarker(note,re) {
    const match=String(note||'').match(re);
    if(!match)return '';
    try{return decodeURIComponent(match[1]||'').trim();}catch(_){return String(match[1]||'').trim();}
  }
  function organizerFromNote(note) { return decodeMarker(note,ORGANIZER_MARKER_RE); }
  function batchFromNote(note) { return decodeMarker(note,BATCH_MARKER_RE); }
  function cleanActivityNote(note) { return String(note||'').replace(ORGANIZER_MARKER_RE,'').replace(BATCH_MARKER_RE,'').trim(); }
  function noteWithTrainingMeta(note,organizer,batch) {
    const clean=cleanActivityNote(note),parts=[];
    const organizerValue=String(organizer||'').trim(),batchValue=String(batch||'').trim();
    if(organizerValue)parts.push(`[[FM-CNHR-002-ORGANIZER:${encodeURIComponent(organizerValue)}]]`);
    if(batchValue)parts.push(`[[FM-CNHR-002-BATCH:${encodeURIComponent(batchValue)}]]`);
    return `${parts.join('')}${clean?(parts.length?'\n':'')+clean:''}`;
  }
  function activityOrganizerValue(a) { return String(a?.organizer||a?.organizer_name||a?.provider||organizerFromNote(a?.note)||'').trim(); }
  function activityBatchValue(a) { return String(a?.training_batch||a?.batch||a?.generation||a?.cohort||batchFromNote(a?.note)||'').trim(); }
  function isMissingOrganizerColumn(error) {
    const text=String(error?.message||error||'');
    return /PGRST204/i.test(text)||(/organizer/i.test(text)&&/(column|schema cache|does not exist)/i.test(text));
  }
  window.cnmiCleanActivityNote=cleanActivityNote;
  window.cnmiActivityOrganizer=activityOrganizerValue;
  window.cnmiActivityTrainingBatch=activityBatchValue;

  async function loadTraining() {
    if (!S().profile || !DB()) return;
    const res = await DB().from(TABLE).select('*').order('updated_at', {ascending:false});
    if (res.error) { S().trainingRecords=[]; S().trainingSchemaError=res.error.message || String(res.error); return; }
    S().trainingRecords=res.data || [];
    S().trainingSchemaError='';

    // V400 intentionally does not preload every activity. The training page,
    // however, must resolve every activity referenced by a training record;
    // otherwise rowItems() drops the record and date filters appear empty.
    const known = new Set((S().activities || []).map(x => String(x.id)));
    const missingIds = [...new Set(S().trainingRecords.map(x => x.activity_id).filter(Boolean).map(String))]
      .filter(id => !known.has(id));
    if (!missingIds.length) return;

    const fetched = [];
    for (let i=0; i<missingIds.length; i+=100) {
      const q = await DB().from('activity_events').select('*').in('id', missingIds.slice(i,i+100));
      if (q.error) { S().trainingActivityLoadError=q.error.message || String(q.error); break; }
      fetched.push(...(q.data || []));
    }
    if (fetched.length) {
      const merged = new Map((S().activities || []).map(x => [String(x.id), x]));
      fetched.forEach(x => merged.set(String(x.id), x));
      S().activities = [...merged.values()];
    }
  }
  const oldLoad = window.loadAllData || (typeof loadAllData === 'function' && loadAllData);
  if (oldLoad) {
    window.loadAllData = async function () { const r=await oldLoad.apply(this,arguments); await loadTraining(); return r; };
    try { (0,eval)('loadAllData=window.loadAllData'); } catch (_) {}
  }

  function participantChecks(selected) {
    const ids = new Set((selected || []).map(String));
    const rows = typeof orderedStaff === 'function' ? orderedStaff((S().staff||[]).filter(x=>x.is_active!==false)) : (S().staff||[]);
    return `<div class="v396-participants">${rows.map(p=>`<label class="v396-participant"><input type="checkbox" name="participant_ids" value="${esc(p.id)}" ${ids.has(String(p.id))?'checked':''}><span><b>${esc(p.nickname||p.full_name||'-')}</b><small>${esc(p.full_name||'')}</small></span></label>`).join('')}</div>`;
  }

  const oldActivities = window.renderActivitiesPage || renderActivitiesPage;
  function renderActivitiesV396() {
    const rows=S().activities||[];
    const editing=S().editingActivityId ? rows.find(x=>idEq(x.id,S().editingActivityId)) : null;
    const included = editing?.training_form_existing === true || editing?.include_fm_cnhr_002 === true;
    const table = typeof renderActivityTable === 'function' ? renderActivityTable(rows) : '';
    return `<div class="grid grid-2"><div class="card"><div class="section-title"><h3>${editing?'แก้ไขกิจกรรม':'เพิ่มกิจกรรมหน่วยงาน'}</h3>${editing?'<button class="ghost-btn" data-cancel-edit-activity>ยกเลิกแก้ไข</button>':''}</div>
      <form id="activityForm" class="form-grid">
        <label class="wide">รายละเอียดกิจกรรม <input name="title" value="${esc(editing?.title||'')}" placeholder="เช่น ประชุมทีม / อบรม / ออกหน่วย" required></label>
        <div class="wide v405-training-meta-grid">
          <label class="v396-training-check"><input type="checkbox" name="include_fm_cnhr_002" ${included?'checked':''}> <span>เก็บเป็นประวัติอบรม FM-CNHR-002 <small>ติ๊กเมื่อ ต้องการนำกิจกรรมนี้เข้าประวัติการอบรมของผู้เข้าร่วม</small></span></label>
          <label class="v405-training-field v405-organizer-field ${included?'v405-required':''}">หน่วยงานผู้จัด <span class="v405-required-mark">*</span><input name="organizer" value="${esc(activityOrganizerValue(editing))}" placeholder="เช่น สภากาชาดไทย / บริษัทผู้จัด / หน่วยงานภายใน" ${included?'required':''}><small class="hint">แสดงในคอลัมน์ “หน่วยงานผู้จัด”</small></label>
          <label class="v405-training-field v408-batch-field ${included?'v405-required':''}">รุ่น <span class="v405-required-mark">*</span><input name="training_batch" value="${esc(activityBatchValue(editing)||(included?'-':''))}" placeholder="เช่น รุ่นที่ 18 หรือ -" ${included?'required':''}><small class="hint">หากไม่มีรุ่น ให้ใส่เครื่องหมาย -</small></label>
        </div>
        <label>ประเภท <select name="event_type" required>${(typeof ACTIVITY_TYPES!=='undefined'?ACTIVITY_TYPES:['ประชุม','อบรม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE','อื่นๆ']).map(t=>`<option ${editing?.event_type===t?'selected':''}>${t}</option>`).join('')}</select></label>
        <label>สถานที่ <input name="location" list="activityLocationList" value="${esc(editing?.location||'')}" required></label><datalist id="activityLocationList">${(typeof ACTIVITY_LOCATIONS!=='undefined'?ACTIVITY_LOCATIONS:[]).map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist>
        <label>วันที่เริ่ม <input name="start_date" type="date" value="${esc(editing?.start_date||todayStr())}" required></label><label>วันที่สิ้นสุด <input name="end_date" type="date" value="${esc(editing?.end_date||todayStr())}" required></label>
        <label>เวลาเริ่ม <input name="start_time" type="time" value="${esc(editing?.start_time||'')}" required></label><label>เวลาสิ้นสุด <input name="end_time" type="time" value="${esc(editing?.end_time||'')}" required></label>
        <label>ผู้รับผิดชอบ <select name="owner_id" required><option value="">เลือกผู้รับผิดชอบ</option>${staffOptions(editing?.owner_id||actor())}</select></label><label>เอกสารแนบ <input name="file" type="file"></label>
        <div class="wide"><div class="field-label">ผู้เข้าร่วม</div>${participantChecks(asArray(editing?.participant_ids))}</div>
        <label class="wide">หมายเหตุเพิ่มเติม <textarea name="note">${esc(cleanActivityNote(editing?.note||''))}</textarea></label><button class="primary-btn wide" type="submit">${editing?'บันทึกการแก้ไข':'บันทึกกิจกรรม'}</button>
      </form></div><div class="card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3></div>${table}</div></div>`;
  }
  window.renderActivitiesPage=renderActivitiesV396; try{(0,eval)('renderActivitiesPage=window.renderActivitiesPage');}catch(_){ }

  async function saveActivityV396(form) {
    const fd=new FormData(form), participants=[...form.querySelectorAll('[name="participant_ids"]:checked')].map(x=>x.value);
    const include=form.querySelector('[name="include_fm_cnhr_002"]')?.checked===true;
    const organizer=String(fd.get('organizer')||'').trim(),trainingBatch=String(fd.get('training_batch')||'').trim(),cleanNote=cleanActivityNote(fd.get('note'));
    const storedNote=include?noteWithTrainingMeta(cleanNote,'',trainingBatch):cleanNote;
    const row={title:String(fd.get('title')||'').trim(),event_type:fd.get('event_type'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),start_time:fd.get('start_time')||null,end_time:fd.get('end_time')||null,location:String(fd.get('location')||'').trim(),organizer:include?organizer:null,note:storedNote,owner_id:fd.get('owner_id')||actor(),participant_ids:participants,include_fm_cnhr_002:include,training_form_existing:include,updated_by:actor()};
    const required=[['title','รายละเอียดกิจกรรม'],['event_type','ประเภท'],['location','สถานที่'],['start_date','วันที่เริ่ม'],['end_date','วันที่สิ้นสุด'],['start_time','เวลาเริ่ม'],['end_time','เวลาสิ้นสุด'],['owner_id','ผู้รับผิดชอบ']].filter(([k])=>!row[k]).map(([,v])=>v);
    if(include&&!organizer)required.push('หน่วยงานผู้จัด');
    if(include&&!trainingBatch)required.push('รุ่น (หากไม่มีให้ใส่ -)');
    if(row.event_type==='ออกหน่วย'&&!participants.length) required.push('ผู้เข้าร่วมสำหรับออกหน่วย');
    if(required.length)return showToast('กรุณากรอก/เลือกให้ครบ: '+required.join(', '));
    if(row.end_date<row.start_date)return showToast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    if(row.start_date===row.end_date&&row.end_time<=row.start_time)return showToast('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม');
    try{
      const file=fd.get('file'); if(file?.size&&typeof uploadFile==='function') row.attachment_path=await uploadFile(file,'activities');
      const id=S().editingActivityId;
      const persist=payload=>id?DB().from('activity_events').update(payload).eq('id',id).select('*').single():DB().from('activity_events').insert({...payload,created_by:actor()}).select('*').single();
      let res=await persist(row);
      if(res.error&&isMissingOrganizerColumn(res.error)){
        const compatibleRow={...row,note:noteWithTrainingMeta(cleanNote,include?organizer:'',include?trainingBatch:'')};
        delete compatibleRow.organizer;
        res=await persist(compatibleRow);
      }
      if(res.error)throw res.error;
      const activityId=res.data?.id||id;
      const old=await DB().from(TABLE).select('*').eq('activity_id',activityId);
      if(old.error&&!/does not exist|relation/i.test(old.error.message||''))throw old.error;
      const oldRows=old.data||[];
      if(include){
        const desired=participants.map(staff_id=>{const prev=oldRows.find(x=>idEq(x.staff_id,staff_id)&&x.form_type==='existing');return {...(prev?.id?{id:prev.id}:{}),activity_id:activityId,staff_id,form_type:'existing',is_included:true,employment_start_date_snapshot:prev?.employment_start_date_snapshot||employment(staff_id)||null,updated_by:actor()};});
        if(desired.length){const up=await DB().from(TABLE).upsert(desired,{onConflict:'activity_id,staff_id,form_type'});if(up.error)throw up.error;}
        for(const oldRow of oldRows.filter(x=>x.form_type==='existing'&&!participants.map(String).includes(String(x.staff_id)))) await DB().from(TABLE).update({is_included:false,updated_by:actor()}).eq('id',oldRow.id);
      }else for(const oldRow of oldRows.filter(x=>x.form_type==='existing')) await DB().from(TABLE).update({is_included:false,updated_by:actor()}).eq('id',oldRow.id);
      S().editingActivityId=null; await loadAllData(); renderPage(); showToast(include?'บันทึกกิจกรรมและนำเข้า FM-CNHR-002 แล้ว':'บันทึกกิจกรรมแล้ว');
    }catch(e){showToast(e?.message||String(e));}
  }

  function trainingFormNotice(){return S().trainingSchemaError?`<div class="notice warning">ระบบอบรมยังไม่พร้อมใช้งาน กรุณารัน SQL <code>supabase_v396_training_integrated.sql</code> ก่อน</div>`:'';}
  function recordForm(item){const r=item.record,a=item.activity;return `<article class="card v396-record"><div class="section-title"><div><h3>${esc(a.title)}</h3><p class="hint">${dateLabel(a.start_date)}${dateKey(a.end_date)!==dateKey(a.start_date)?' – '+dateLabel(a.end_date):''} · ${esc(a.location||'-')}</p></div>${badge(status(r),status(r)==='กรอกข้อมูลแล้ว'?'green':'orange')}</div><p class="hint">แบบฟอร์ม FM-CNHR-002 · รุ่น: ${esc(activityBatchValue(a)||'-')} · หน่วยงานผู้จัด: ${esc(activityOrganizerValue(a)||a.location||'-')} · วันเริ่มงาน: ${dateLabel(r.employment_start_date_snapshot||employment(r.staff_id))}</p><form data-v396-record="${esc(r.id)}"><label>ผล/สิ่งที่ได้รับ<textarea name="result_text" rows="4">${esc(r.result_text||'')}</textarea></label><label>การนำความรู้ไปใช้<textarea name="application_text" rows="4">${esc(r.application_text||'')}</textarea></label><label>Certificate <input type="file" name="certificate" accept=".pdf,image/*"></label><small class="hint">ไม่บังคับแนบ Certificate</small><div class="actions"><button class="primary-btn" type="submit">บันทึกข้อมูล</button></div></form></article>`;}
  function myTrainingStatus(){const s=S();return Object.prototype.hasOwnProperty.call(s,'v402MyStatus')?String(s.v402MyStatus||''):'รอกรอกข้อมูล';}
  function currentGregorianYear(){return new Date().getFullYear();}
  function selectedTrainingYear(){
    const s=S();
    const direct=Number(s.v407TrainingYear);
    if(Number.isInteger(direct)&&direct>=2000&&direct<=2200)return direct;
    const fromYear=Number(String(s.v396MyFrom||'').slice(0,4));
    if(Number.isInteger(fromYear)&&fromYear>=2000&&fromYear<=2200)return fromYear;
    return currentGregorianYear();
  }
  function applyTrainingYearRange(year){
    const y=Number(year)||currentGregorianYear(),s=S();
    s.v407TrainingYear=String(y);
    s.v396MyFrom=`${y}-01-01`;
    s.v396MyTo=`${y}-12-31`;
    return {year:y,from:s.v396MyFrom,to:s.v396MyTo};
  }
  function trainingYearOptions(){
    const years=new Set([currentGregorianYear()-2,currentGregorianYear()-1,currentGregorianYear(),currentGregorianYear()+1]);
    rowItems().forEach(x=>{const y=Number(dateKey(x.activity?.start_date).slice(0,4));if(Number.isInteger(y)&&y>=2000&&y<=2200)years.add(y);});
    return [...years].sort((a,b)=>b-a);
  }
  function myTrainingAnnualRows(){
    const range=applyTrainingYearRange(selectedTrainingYear());
    return rowItems().filter(x=>{if(!idEq(x.record.staff_id,actor()))return false;const start=dateKey(x.activity.start_date),end=dateKey(x.activity.end_date)||start;return end>=range.from&&start<=range.to;}).sort((a,b)=>dateKey(a.activity.start_date).localeCompare(dateKey(b.activity.start_date)));
  }
  function myTrainingFilters(rows){
    const s=S(),selected=myTrainingStatus(),year=selectedTrainingYear(),annualRows=myTrainingAnnualRows(),certificateCount=annualRows.filter(x=>x.record.certificate_path).length,canExport=annualRows.length>0;
    applyTrainingYearRange(year);
    return `<div class="toolbar compact-filter v396-filters v402-my-training-filters v407-year-filter"><label>สถานะข้อมูล <select id="v402MyStatus"><option value="รอกรอกข้อมูล" ${selected==='รอกรอกข้อมูล'?'selected':''}>รอกรอกข้อมูล</option><option value="กรอกข้อมูลแล้ว" ${selected==='กรอกข้อมูลแล้ว'?'selected':''}>กรอกข้อมูลแล้ว</option><option value="" ${selected===''?'selected':''}>ทั้งหมด</option></select></label><label>ปีแบบฟอร์ม <select id="v407TrainingYear">${trainingYearOptions().map(y=>`<option value="${y}" ${y===year?'selected':''}>พ.ศ. ${y+543}</option>`).join('')}</select><small class="hint">ครอบคลุม 1 ม.ค. – 31 ธ.ค. ${year+543}</small></label><div class="v402-export-wrap"><button class="primary-btn" type="button" data-v402-my-export ${canExport?'':'disabled'}>Export PDF ชุดอบรมประจำปี</button><small class="hint">${annualRows.length?`รวมตาราง ${annualRows.length} รายการ และ Certificate ${certificateCount} ไฟล์`:'ไม่พบรายการสำหรับส่งออกในปีนี้'}</small></div></div>`;
  }
  function myTrainingRows(){
    const selected=myTrainingStatus();
    return myTrainingAnnualRows().filter(x=>!selected||status(x.record)===selected);
  }
  function renderMyTraining(){if(!S().profile)return noPermission();const rows=myTrainingRows(),year=selectedTrainingYear();return `<div class="card"><div class="section-title"><div><h3>รายการอบรมของฉัน</h3><p class="hint">เลือกสถานะและปี พ.ศ. ระบบจะยึดรอบประจำปี 1 มกราคม–31 ธันวาคม สำหรับ FM-CNHR-002</p></div></div>${trainingFormNotice()}${myTrainingFilters(rows)}${rows.length?`<div class="v396-record-list">${rows.map(recordForm).join('')}</div>`:empty(`ไม่พบรายการอบรมในปี ${year+543} ตามตัวกรอง`)}</div>`;}
  function filters(){const s=S();return `<div class="toolbar compact-filter v396-filters"><label>จากวันที่ <input type="date" id="v396From" value="${esc(s.v396From||'')}"></label><label>ถึงวันที่ <input type="date" id="v396To" value="${esc(s.v396To||'')}"></label><label>บุคลากร <select id="v396Staff"><option value="">ทุกคน</option>${(S().staff||[]).filter(x=>x.is_active!==false).map(x=>`<option value="${esc(x.id)}" ${idEq(s.v396Staff,x.id)?'selected':''}>${esc(staffName(x.id))}</option>`).join('')}</select></label><label>สถานะข้อมูล <select id="v396Status"><option value="">ทุกสถานะ</option><option value="กรอกข้อมูลแล้ว" ${s.v396Status==='กรอกข้อมูลแล้ว'?'selected':''}>กรอกข้อมูลแล้ว</option><option value="รอกรอกข้อมูล" ${s.v396Status==='รอกรอกข้อมูล'?'selected':''}>รอกรอกข้อมูล</option></select></label></div>`;}
  function filtered(){const s=S();return rowItems().filter(x=>{const start=dateKey(x.activity.start_date),end=dateKey(x.activity.end_date)||start;return(!s.v396From||end>=s.v396From)&&(!s.v396To||start<=s.v396To)&&(!s.v396Staff||idEq(x.record.staff_id,s.v396Staff))&&(!s.v396Status||status(x.record)===s.v396Status);}).sort((a,b)=>dateKey(b.activity.start_date).localeCompare(dateKey(a.activity.start_date)));}
  function renderTrainingAdmin(){if(!isManager())return noPermission();const rows=filtered();return `<div class="card"><div class="section-title"><div><h3>ตรวจสอบอบรมของเจ้าหน้าที่</h3><p class="hint">กรองตามบุคลากร ช่วงวันที่ และสถานะข้อมูลได้</p></div><button class="ghost-btn" type="button" data-v396-admin-export>Export PDF</button></div>${trainingFormNotice()}${filters()}${rows.length?`<div class="table-wrap"><table><thead><tr><th>บุคลากร</th><th>กิจกรรม</th><th>วันที่/สถานที่</th><th>แบบฟอร์ม</th><th>สถานะ</th><th>อัปเดตล่าสุด</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(staffName(x.record.staff_id))}</td><td>${esc(x.activity.title)}</td><td>${dateLabel(x.activity.start_date)}<br>${esc(x.activity.location||'-')}</td><td>FM-CNHR-002</td><td>${badge(status(x.record),status(x.record)==='กรอกข้อมูลแล้ว'?'green':'orange')}</td><td>${dateTimeLabel(x.record.updated_at||x.record.created_at)}</td></tr>`).join('')}</tbody></table></div>`:empty('ไม่พบข้อมูลตามตัวกรอง')}</div>`;}

  function printDoc(items){const body=items.map(x=>`<article class="v396-print-record"><h1>FM-CNHR-002 บุคลากรเดิม</h1><p><b>บุคลากร:</b> ${esc(staffName(x.record.staff_id))}<br><b>วันเริ่มงาน:</b> ${esc(dateLabel(x.record.employment_start_date_snapshot||employment(x.record.staff_id)))}<br><b>กิจกรรม:</b> ${esc(x.activity.title)}<br><b>วันที่:</b> ${esc(dateLabel(x.activity.start_date))} · ${esc(x.activity.location||'-')}</p><h3>ผล/สิ่งที่ได้รับ</h3><div class="v396-print-box">${esc(x.record.result_text||'-')}</div><h3>การนำความรู้ไปใช้</h3><div class="v396-print-box">${esc(x.record.application_text||'-')}</div><p>Certificate: ${x.record.certificate_path?'แนบแล้ว':'ไม่ได้แนบ (ไม่บังคับ)'}</p></article>`).join('');const w=window.open('','_blank');if(!w)return showToast('กรุณาอนุญาต Pop-up เพื่อ Export PDF');w.document.write(`<html><head><meta charset="utf-8"><title>FM-CNHR-002</title><style>@page{size:A4;margin:14mm}body{font-family:"TH Sarabun New",Sarabun,Tahoma,sans-serif;color:#17324d;font-size:16pt;line-height:1.15}.v396-print-record{page-break-after:always}.v396-print-record:last-child{page-break-after:auto}.v396-print-box{border:1px solid #ccd8e2;padding:12px;min-height:70px;white-space:pre-wrap;margin-bottom:14px}</style></head><body>${body}</body></html>`);w.document.close();setTimeout(()=>{w.focus();w.print();},250);}

  function dayDiff(start,end){const a=new Date(`${dateKey(start)}T00:00:00`),b=new Date(`${dateKey(end||start)}T00:00:00`);return Number.isFinite(a.getTime())&&Number.isFinite(b.getTime())?Math.max(1,Math.round((b-a)/86400000)+1):1;}
  function durationLabel(a){const start=dateKey(a?.start_date),end=dateKey(a?.end_date)||start;if(start===end){const sh=String(a?.start_time||''),eh=String(a?.end_time||'');if(/^\d{2}:\d{2}/.test(sh)&&/^\d{2}:\d{2}/.test(eh)){const [h1,m1]=sh.split(':').map(Number),[h2,m2]=eh.split(':').map(Number),mins=(h2*60+m2)-(h1*60+m1);if(mins>0)return mins<=300?'0.5 วัน':'1 วัน';}if(a?.duration_label)return String(a.duration_label);return '1 วัน';}return `${dayDiff(start,end)} วัน`;}
  function thaiYear(date){const d=new Date(`${dateKey(date)}T00:00:00`);return Number.isFinite(d.getTime())?d.getFullYear()+543:'';}
  function thaiDateLong(date){
    const key=dateKey(date);if(!key)return '-';
    const d=new Date(`${key}T00:00:00`);if(!Number.isFinite(d.getTime()))return dateLabel(date);
    try{return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'long',year:'numeric'}).format(d);}catch(_){return dateLabel(date);}
  }
  function annualFormTitle(year){return `แบบบันทึกการอบรมประจำปี ${Number(year)+543}`;}
  function organizerText(a){return activityOrganizerValue(a)||a?.location||'-';}
  function chunkRows(items,size){const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out.length?out:[[]];}
  function normalizedPersonText(value){return String(value||'').replace(/\s+/g,'').replace(/^(นาย|นางสาว|นาง|พญ\.|นพ\.|แพทย์หญิง|แพทย์ชาย)/,'');}
  function isParichatProfile(profile){
    const name=normalizedPersonText(profile?.full_name||'');
    const code=String(profile?.employee_code||profile?.personnel_code||'').trim();
    return name.includes('ปาริฉัตรอินทร์เกลี้ยง')||code==='020305';
  }
  function headDisplayName(head){
    const raw=String(head?.full_name||'ปาริฉัตร อินทร์เกลี้ยง').trim();
    return /^(นาย|นางสาว|นาง|พญ\.|นพ\.|แพทย์หญิง|แพทย์ชาย)/.test(raw)?raw:`นางสาว ${raw}`;
  }
  function annualFormStyles(){return `@page{size:A4 portrait;margin:5mm 5mm 6mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:"TH Sarabun New",Sarabun,Tahoma,sans-serif;color:#111;font-size:16pt;font-weight:400;line-height:1}.fm-page{width:200mm;height:283.5mm;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto auto;overflow:hidden;padding-bottom:1mm;break-after:page;page-break-after:always;background:#fff}.fm-page:last-child{break-after:auto;page-break-after:auto}table{width:100%;border-collapse:collapse}.fm-header td,.fm-person td,.fm-training th,.fm-training td{border:0.3pt solid #111}.fm-header td{padding:1.2mm 2mm;font-size:16pt;font-weight:700;line-height:1}.header-label{display:inline-block;min-width:43mm;font-weight:700}.logo-cell{width:27mm;text-align:center;padding:1mm!important}.fm-logo{display:block;width:23mm;height:23mm;object-fit:contain;margin:auto}.fm-person{margin-top:1mm;table-layout:fixed}.fm-person td{width:50%;padding:1.7mm 3mm;font-size:16pt;font-weight:700;line-height:1}.fm-field{display:grid;grid-template-columns:29mm 3mm minmax(0,1fr);align-items:end;gap:1mm}.fm-field b{white-space:nowrap;font-weight:700}.fm-fill-line{display:block;text-align:center;border-bottom:0.3pt solid #111;min-height:6mm;line-height:6mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}.fm-training{margin-top:2mm;table-layout:fixed;height:100%}.fm-training thead{display:table-header-group}.fm-training tr{break-inside:avoid;page-break-inside:avoid}.fm-training th{padding:1.2mm .6mm;font-size:16pt;font-weight:700;line-height:1;text-align:center;vertical-align:middle}.fm-training td{height:7.7mm;padding:.8mm 1.4mm;vertical-align:top;font-size:16pt;font-weight:400;line-height:1}.fm-training th:nth-child(1){width:4%}.fm-training th:nth-child(2){width:35%}.fm-training th:nth-child(3){width:5%}.fm-training th:nth-child(4){width:24%}.fm-training th:nth-child(5){width:11%}.fm-training th:nth-child(6){width:11%}.fm-training th:nth-child(7){width:10%}.center{text-align:center}.blank td{height:7.7mm}.signatures{border:0.75pt solid #111;border-top:0;display:grid;grid-template-columns:1fr 1fr;gap:12mm;padding:6mm 10mm 4mm;text-align:center;font-size:16pt;font-weight:400;line-height:1.15;min-height:35mm}.signature-box{align-self:center}.signature-dots{display:inline-block;width:55mm;border-bottom:0.6pt dotted #111;transform:translateY(-1.5mm)}.signature-name{display:inline-block;min-height:6mm;margin-top:2mm}.blank-signature-name{visibility:hidden}.fm-footer{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:4mm;padding:.7mm .5mm 0;font-size:9pt;font-weight:400;line-height:1}.page-number{justify-self:center;white-space:nowrap}.form-code{justify-self:end;white-space:nowrap}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`; }
  function annualFormDocument(items){
    const range=applyTrainingYearRange(selectedTrainingYear()),year=range.year;
    if(!items.length)return null;
    const profile=staffOf(actor()),personName=profile.full_name||profile.nickname||'-',employeeCode=profile.employee_code||profile.personnel_code||'-',position=profile.position||profile.staff_type||'-',startWork=employment(actor());
    const head=(S().staff||[]).find(x=>normalizedPersonText(x.full_name).includes('ปาริฉัตรอินทร์เกลี้ยง'))||{};
    const supervisorName=isParichatProfile(profile)?'':headDisplayName(head);
    const logoUrl=new URL('fm-cnhr-002-logo.png',window.location.href).href,pages=chunkRows(items,20),title=annualFormTitle(year);
    const sections=pages.map((page,pageIndex)=>{
      const offset=pageIndex*20,blank=Math.max(0,20-page.length);
      const rows=page.map((x,i)=>`<tr><td class="center">${offset+i+1}</td><td>${esc(x.activity.title||'-')}</td><td class="center">${esc(activityBatchValue(x.activity)||'-')}</td><td>${esc(organizerText(x.activity))}</td><td class="center">${esc(dateLabel(x.activity.start_date))}</td><td class="center">${esc(dateLabel(x.activity.end_date||x.activity.start_date))}</td><td class="center">${esc(durationLabel(x.activity))}</td></tr>`).join('')+Array.from({length:blank},()=>'<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
      const supervisorLine=supervisorName?`(${esc(supervisorName)})`:'&nbsp;';
      return `<section class="fm-page"><table class="fm-header"><tr><td class="logo-cell" rowspan="3"><img class="fm-logo" src="${esc(logoUrl)}" alt="ตรามหาวิทยาลัยมหิดล"></td><td><span class="header-label">ชื่อแบบฟอร์ม :</span><b>${esc(title)}</b></td></tr><tr><td><span class="header-label">ฝ่าย/งาน/หน่วย :</span><b>งานพยาธิ นิติเวช และบริการโลหิต</b></td></tr><tr><td>โรงพยาบาลรามาธิบดีจักรีนฤบดินทร์ คณะแพทยศาสตร์โรงพยาบาลรามาธิบดี มหาวิทยาลัยมหิดล</td></tr></table><table class="fm-person"><tr><td><div class="fm-field"><b>ชื่อ สกุล</b><b>:</b><span class="fm-fill-line">${esc(personName)}</span></div></td><td><div class="fm-field"><b>รหัสบุคคล</b><b>:</b><span class="fm-fill-line">${esc(employeeCode)}</span></div></td></tr><tr><td><div class="fm-field"><b>ตำแหน่ง</b><b>:</b><span class="fm-fill-line">${esc(position)}</span></div></td><td><div class="fm-field"><b>วันเริ่มงาน</b><b>:</b><span class="fm-fill-line">${esc(thaiDateLong(startWork))}</span></div></td></tr></table><table class="fm-training"><thead><tr><th>ที่</th><th>หลักสูตร/เรื่อง</th><th>รุ่น</th><th>หน่วยงานผู้จัด</th><th>วันที่เริ่มต้น</th><th>วันที่สิ้นสุด</th><th>ระยะเวลา</th></tr></thead><tbody>${rows}</tbody></table><div class="signatures"><div class="signature-box">ลงชื่อ <span class="signature-dots"></span><br><span class="signature-name">(${esc(personName)})</span><br>บุคลากรผู้รับการฝึกอบรม</div><div class="signature-box">ลงชื่อ <span class="signature-dots"></span><br><span class="signature-name ${supervisorName?'':'blank-signature-name'}">${supervisorLine}</span><br>หัวหน้าหน่วย/หัวหน้างาน</div></div><div class="fm-footer"><span></span><span class="page-number">หน้าที่ ${pageIndex+1} ของ ${pages.length} หน้า</span><span class="form-code">FM-CNHR-002 Rev.00&nbsp;&nbsp; วันบังคับใช้ 1 ตุลาคม 2561</span></div></section>`;
    }).join('');
    return {year,personName,sections,styles:annualFormStyles(),pageCount:pages.length};
  }
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  async function waitForFrameAssets(doc){
    const imageTasks=[...doc.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=img.onerror=()=>resolve();}));
    await Promise.race([Promise.all(imageTasks),wait(3500)]);
    if(doc.fonts?.ready)await Promise.race([doc.fonts.ready,wait(2500)]);
    await wait(120);
  }
  async function createAnnualFrame(bundle){
    const frame=document.createElement('iframe');
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;background:#fff;';
    document.body.appendChild(frame);
    const doc=frame.contentDocument;
    doc.open();
    doc.write(`<html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${bundle.styles}</style></head><body>${bundle.sections}</body></html>`);
    doc.close();
    await waitForFrameAssets(doc);
    return frame;
  }
  function dataUrlBytes(dataUrl){
    const base64=String(dataUrl||'').split(',')[1]||'',binary=atob(base64),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }
  function canvasPngBytes(canvas){return dataUrlBytes(canvas.toDataURL('image/png',1));}
  function safeDownloadName(value){return String(value||'เอกสาร').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();}
  function fitBox(width,height,maxWidth,maxHeight){const scale=Math.min(maxWidth/Math.max(width,1),maxHeight/Math.max(height,1));return {width:width*scale,height:height*scale};}
  function wrapCanvasText(ctx,text,maxWidth){
    const words=String(text||'').split(/\s+/).filter(Boolean),lines=[];let line='';
    for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width<=maxWidth||!line)line=test;else{lines.push(line);line=word;}}
    if(line)lines.push(line);return lines.slice(0,2);
  }
  async function certificateHeaderImage(pdfDoc,item,index,total){
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=190;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#222';ctx.lineWidth=2;ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);
    ctx.fillStyle='#111';ctx.textBaseline='top';ctx.font='700 44px "TH Sarabun New",Sarabun,Tahoma,sans-serif';ctx.fillText(`เอกสารแนบลำดับที่ ${index} จาก ${total}`,40,22);
    ctx.font='600 36px "TH Sarabun New",Sarabun,Tahoma,sans-serif';const lines=wrapCanvasText(ctx,item.activity.title||'-',canvas.width-80);lines.forEach((line,i)=>ctx.fillText(line,40,78+i*39));
    ctx.font='400 28px "TH Sarabun New",Sarabun,Tahoma,sans-serif';ctx.textAlign='right';ctx.fillText(`${dateLabel(item.activity.start_date)}${dateKey(item.activity.end_date)!==dateKey(item.activity.start_date)?' – '+dateLabel(item.activity.end_date):''}`,canvas.width-40,28);ctx.textAlign='left';
    return pdfDoc.embedPng(canvasPngBytes(canvas));
  }
  async function downloadCertificate(record){
    const path=String(record?.certificate_path||'').trim();if(!path)throw new Error('ไม่พบที่อยู่ไฟล์ Certificate');
    if(/^https?:\/\//i.test(path)){const res=await fetch(path,{credentials:'include'});if(!res.ok)throw new Error(`ดาวน์โหลด Certificate ไม่สำเร็จ (${res.status})`);return res.blob();}
    const cleanPath=path.replace(/^staff-files\//,'').replace(/^\/+/,''),res=await DB().storage.from('staff-files').download(cleanPath);
    if(res.error)throw res.error;return res.data;
  }
  function certificateKind(record,blob){
    const mime=String(record?.certificate_mime_type||blob?.type||'').toLowerCase(),name=String(record?.certificate_name||record?.certificate_path||'').toLowerCase();
    if(mime.includes('pdf')||name.endsWith('.pdf'))return 'pdf';
    if(mime.startsWith('image/')||/\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name))return 'image';
    return 'unknown';
  }
  async function blobToPngEmbed(pdfDoc,blob){
    const url=URL.createObjectURL(blob);try{
      const img=new Image();img.decoding='async';
      const loaded=new Promise((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('เปิดไฟล์รูป Certificate ไม่สำเร็จ'));});
      img.src=url;if(typeof img.decode==='function')await img.decode().catch(()=>loaded);else await loaded;
      const sourceWidth=img.naturalWidth||img.width,sourceHeight=img.naturalHeight||img.height,maxSide=3000,scale=Math.min(1,maxSide/Math.max(sourceWidth,sourceHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sourceWidth*scale));canvas.height=Math.max(1,Math.round(sourceHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return pdfDoc.embedPng(canvasPngBytes(canvas));
    }finally{URL.revokeObjectURL(url);}
  }
  async function appendCertificatePdf(pdfDoc,blob,item,index,total){
    const bytes=new Uint8Array(await blob.arrayBuffer()),source=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false}),sourcePages=source.getPages(),indices=sourcePages.map((_,i)=>i),embedded=await pdfDoc.embedPdf(bytes,indices),header=await certificateHeaderImage(pdfDoc,item,index,total);
    const A4W=595.28,A4H=841.89,margin=28,headerH=68,gap=10,maxW=A4W-margin*2,maxH=A4H-margin*2-headerH-gap;
    embedded.forEach((embeddedPage,i)=>{const page=pdfDoc.addPage([A4W,A4H]),size=sourcePages[i].getSize(),fit=fitBox(size.width,size.height,maxW,maxH);page.drawImage(header,{x:margin,y:A4H-margin-headerH,width:maxW,height:headerH});page.drawPage(embeddedPage,{x:(A4W-fit.width)/2,y:margin+(maxH-fit.height)/2,width:fit.width,height:fit.height});});
  }
  async function appendCertificateImage(pdfDoc,blob,item,index,total){
    const image=await blobToPngEmbed(pdfDoc,blob),header=await certificateHeaderImage(pdfDoc,item,index,total),A4W=595.28,A4H=841.89,margin=28,headerH=68,gap=10,maxW=A4W-margin*2,maxH=A4H-margin*2-headerH-gap,fit=fitBox(image.width,image.height,maxW,maxH),page=pdfDoc.addPage([A4W,A4H]);
    page.drawImage(header,{x:margin,y:A4H-margin-headerH,width:maxW,height:headerH});page.drawImage(image,{x:(A4W-fit.width)/2,y:margin+(maxH-fit.height)/2,width:fit.width,height:fit.height});
  }
  async function exportMyAnnualTrainingPackage(items,button){
    const bundle=annualFormDocument(items);if(!bundle)return showToast(`ไม่พบรายการอบรมในปี ${selectedTrainingYear()+543}`);
    if(!window.PDFLib?.PDFDocument||typeof window.html2canvas!=='function')return showToast('ยังโหลดระบบสร้าง PDF ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    const originalText=button?.textContent||'',certificates=items.filter(x=>x.record.certificate_path),errors=[];let frame;
    try{
      if(button){button.disabled=true;button.textContent='กำลังสร้างตาราง PDF…';}
      const pdfDoc=await PDFLib.PDFDocument.create();frame=await createAnnualFrame(bundle);const pages=[...frame.contentDocument.querySelectorAll('.fm-page')];if(!pages.length)throw new Error('ไม่พบหน้าตาราง FM-CNHR-002 สำหรับสร้าง PDF');const MM=72/25.4,A4W=210*MM,A4H=297*MM,marginX=5*MM,top=5*MM,maxW=200*MM,maxH=286*MM;
      for(let i=0;i<pages.length;i++){
        if(button)button.textContent=`กำลังสร้างตาราง PDF ${i+1}/${pages.length}`;
        const canvas=await window.html2canvas(pages[i],{scale:3,backgroundColor:'#fff',useCORS:true,logging:false,scrollX:0,scrollY:0,width:pages[i].scrollWidth,height:pages[i].scrollHeight,windowWidth:pages[i].scrollWidth,windowHeight:pages[i].scrollHeight});
        const image=await pdfDoc.embedPng(canvasPngBytes(canvas)),fit=fitBox(image.width,image.height,maxW,maxH),page=pdfDoc.addPage([A4W,A4H]);page.drawImage(image,{x:marginX,y:A4H-top-fit.height,width:fit.width,height:fit.height});
      }
      for(let i=0;i<certificates.length;i++){
        const item=certificates[i];if(button)button.textContent=`กำลังแนบ Certificate ${i+1}/${certificates.length}`;
        try{const blob=await downloadCertificate(item.record),kind=certificateKind(item.record,blob);if(kind==='pdf')await appendCertificatePdf(pdfDoc,blob,item,i+1,certificates.length);else if(kind==='image')await appendCertificateImage(pdfDoc,blob,item,i+1,certificates.length);else throw new Error('ชนิดไฟล์ไม่รองรับ');}catch(error){errors.push(`${item.activity.title||'Certificate'}: ${error?.message||String(error)}`);}
      }
      if(button)button.textContent='กำลังบันทึกไฟล์ PDF…';const bytes=await pdfDoc.save(),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeDownloadName(`FM-CNHR-002_${bundle.personName}_${bundle.year+543}_พร้อม-Certificate.pdf`);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
      if(errors.length){console.warn('V410 certificate merge skipped',errors);showToast(`สร้าง PDF แล้ว แต่แนบ Certificate ไม่สำเร็จ ${errors.length} ไฟล์`);}else showToast(`สร้าง PDF ชุดอบรมแล้ว • แนบ Certificate ${certificates.length} ไฟล์`);
    }catch(error){console.error('V410 annual training PDF',error);showToast(`สร้าง PDF ไม่สำเร็จ: ${error?.message||String(error)}`);}finally{frame?.remove();if(button){button.disabled=false;button.textContent=originalText||'Export PDF ชุดอบรมประจำปี';}}
  }
  const V411_PAGE_W=595.32,V411_PAGE_H=841.92,V411_BLACK=window.PDFLib?.rgb?PDFLib.rgb(0,0,0):undefined;
  const V411_FONT_REGULAR_URL='https://cdn.jsdelivr.net/npm/font-th-sarabun-new@1.0.0/fonts/THSarabunNew-webfont.ttf';
  const V411_FONT_BOLD_URL='https://cdn.jsdelivr.net/npm/font-th-sarabun-new@1.0.0/fonts/THSarabunNew_bold-webfont.ttf';
  function v411Y(top){return V411_PAGE_H-top;}
  function v411Line(page,x1,top1,x2,top2,thickness=.48){page.drawLine({start:{x:x1,y:v411Y(top1)},end:{x:x2,y:v411Y(top2)},thickness,color:V411_BLACK});}
  function v411Rect(page,x,top,width,height,thickness=.48){page.drawRectangle({x,y:V411_PAGE_H-top-height,width,height,borderWidth:thickness,borderColor:V411_BLACK});}
  function v411TextHeight(font,size){try{return font.heightAtSize(size);}catch(_){return size*1.1;}}
  function v411TopText(page,text,x,top,size,font,options={}){
    const value=String(text??''),height=v411TextHeight(font,size),y=V411_PAGE_H-top-height+(options.adjustY??1.2);
    page.drawText(value,{x,y,size,font,color:V411_BLACK,opacity:1});
    return font.widthOfTextAtSize(value,size);
  }
  function v411FitSize(font,text,size,maxWidth,minSize=8){let out=size;while(out>minSize&&font.widthOfTextAtSize(String(text||''),out)>maxWidth)out-=.25;return out;}
  function v411CenteredTopText(page,text,x0,x1,top,size,font,options={}){
    const fitted=v411FitSize(font,text,size,(x1-x0)-(options.padding??2),options.minSize??8),width=font.widthOfTextAtSize(String(text??''),fitted);
    return v411TopText(page,text,x0+Math.max(0,((x1-x0)-width)/2),top,fitted,font,options);
  }
  function v411SegmentText(text){
    const value=String(text??'').replace(/\r/g,'');
    if(typeof Intl!=='undefined'&&Intl.Segmenter){try{return [...new Intl.Segmenter('th',{granularity:'word'}).segment(value)].map(x=>x.segment);}catch(_){}}
    return value.split(/(\s+)/).filter(Boolean);
  }
  function v411BreakToken(font,token,size,maxWidth){
    const parts=[];let line='';
    for(const ch of [...String(token||'')]){const next=line+ch;if(line&&font.widthOfTextAtSize(next,size)>maxWidth){parts.push(line);line=ch;}else line=next;}
    if(line)parts.push(line);return parts;
  }
  function v411Wrap(font,text,size,maxWidth,maxLines=3){
    const output=[];
    for(const paragraph of String(text??'').replace(/\r/g,'').split('\n')){
      const tokens=v411SegmentText(paragraph);let line='';
      for(const token of tokens){
        const candidate=line+token;
        if(!line||font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue;}
        output.push(line.trimEnd());line='';
        if(output.length>=maxLines)break;
        if(font.widthOfTextAtSize(token,size)<=maxWidth)line=token.trimStart();
        else{
          const pieces=v411BreakToken(font,token,size,maxWidth);
          while(pieces.length&&output.length<maxLines-1)output.push(pieces.shift());
          line=pieces.join('');
        }
      }
      if(output.length>=maxLines)break;
      if(line||!tokens.length)output.push(line.trim());
      if(output.length>=maxLines)break;
    }
    const lines=output.filter((x,i)=>x||i===0).slice(0,maxLines);
    if(output.length>maxLines&&lines.length){let last=lines[lines.length-1].replace(/\s+$/,'');while(last&&font.widthOfTextAtSize(last+'…',size)>maxWidth)last=last.slice(0,-1);lines[lines.length-1]=last+'…';}
    return lines.length?lines:['-'];
  }
  async function v411FetchBytes(url,label){const res=await fetch(url,{cache:'force-cache'});if(!res.ok)throw new Error(`โหลด${label}ไม่สำเร็จ (${res.status})`);return new Uint8Array(await res.arrayBuffer());}
  async function v411RawAssets(){
    if(!window.__V411_FM_ASSET_BYTES__)window.__V411_FM_ASSET_BYTES__=Promise.all([
      v411FetchBytes(V411_FONT_REGULAR_URL,'ฟอนต์ TH Sarabun New'),
      v411FetchBytes(V411_FONT_BOLD_URL,'ฟอนต์ TH Sarabun New ตัวหนา'),
      v411FetchBytes(new URL('fm-cnhr-002-logo.png',window.location.href).href,'ตราแบบฟอร์ม')
    ]);
    return window.__V411_FM_ASSET_BYTES__;
  }
  async function v411EnsureFontkit(){
    if(window.fontkit)return window.fontkit;
    if(!window.__V411_FONTKIT_PROMISE__)window.__V411_FONTKIT_PROMISE__=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';script.async=true;
      script.onload=()=>window.fontkit?resolve(window.fontkit):reject(new Error('โหลดระบบฟอนต์ PDF แล้วแต่ไม่พบ fontkit'));
      script.onerror=()=>reject(new Error('โหลดระบบฟอนต์ PDF ไม่สำเร็จ'));document.head.appendChild(script);
    });
    return window.__V411_FONTKIT_PROMISE__;
  }
  async function v411PdfAssets(pdfDoc){
    const loadedFontkit=await v411EnsureFontkit();
    pdfDoc.registerFontkit(loadedFontkit);
    const [regularBytes,boldBytes,logoBytes]=await v411RawAssets();
    const regular=await pdfDoc.embedFont(regularBytes,{subset:true}),bold=await pdfDoc.embedFont(boldBytes,{subset:true}),logo=await pdfDoc.embedPng(logoBytes);
    return {regular,bold,logo};
  }
  function v411RowLayout(item,font){
    const size=14.04,lineHeight=19.2;
    const title=v411Wrap(font,item?.activity?.title||'-',size,197,3),batch=v411Wrap(font,activityBatchValue(item?.activity)||'-',size,22,3),organizer=v411Wrap(font,organizerText(item?.activity),size,126,3);
    const lines=Math.max(title.length,batch.length,organizer.length,1);
    return {item,title,batch,organizer,height:lineHeight*lines,lineHeight};
  }
  function v411Paginate(items,font){
    const available=715.42-161.9,pages=[];let rows=[],used=0;
    for(const item of items){const row=v411RowLayout(item,font);if(rows.length&&used+row.height>available+.01){pages.push(rows);rows=[];used=0;}rows.push(row);used+=row.height;}
    if(rows.length||!pages.length)pages.push(rows);return pages;
  }
  function v411DrawHeader(page,bundle,assets){
    const {bold,logo}=assets;
    v411Rect(page,8.52,8.52,581.52,65.88,.48);v411Line(page,8.52,30.48,590.04,30.48,.48);v411Line(page,8.52,52.32,590.04,52.32,.48);v411Line(page,65.904,8.52,65.904,74.4,.48);
    const rawLogo=logo.scale(1),logoScale=Math.min(47/rawLogo.width,56/rawLogo.height),logoFit=logo.scale(logoScale);page.drawImage(logo,{x:13.8+(47-logoFit.width)/2,y:V411_PAGE_H-12.2-logoFit.height,width:logoFit.width,height:logoFit.height});
    v411TopText(page,'ชื่อแบบฟอร์ม :',71.18,9.45,15.96,bold);v411TopText(page,annualFormTitle(bundle.year),166.94,9.45,15.96,bold);
    v411TopText(page,'ฝ่าย/งาน/หน่วย :',71.18,31.29,15.96,bold);v411TopText(page,'งานพยาธิ นิติเวช และบริการโลหิต',166.94,31.29,15.96,bold);
    v411TopText(page,'โรงพยาบาลรามาธิบดีจักรีนฤบดินทร์ คณะแพทยศาสตร์โรงพยาบาลรามาธิบดี มหาวิทยาลัยมหิดล',71.18,53.01,15.96,bold);
  }
  function v411DrawPerson(page,data,assets){
    const {bold}=assets,x0=8.5,x1=588.25,mid=299.9,top=75.77,height=54;
    v411Rect(page,x0,top,x1-x0,height,.48);v411Line(page,mid,top,mid,top+height,.48);v411Line(page,x0,102.77,x1,102.77,.48);
    v411TopText(page,'ชื่อ สกุล',15.84,81.85,15.96,bold);v411TopText(page,':',80.8,81.85,15.96,bold);v411Line(page,87.25,94.6,293.5,94.6,.5);
    v411TopText(page,'ตำแหน่ง',15.84,102.85,15.96,bold);v411TopText(page,':',80.8,102.85,15.96,bold);v411Line(page,87.25,115.6,293.5,115.6,.5);
    v411TopText(page,'รหัสบุคคล',312.0,81.85,15.96,bold);v411TopText(page,':',375.9,81.85,15.96,bold);v411Line(page,431.5,93.92,567.25,93.92,.5);
    v411TopText(page,'วันเริ่มงาน',312.0,102.85,15.96,bold);v411TopText(page,':',375.9,102.85,15.96,bold);v411Line(page,431.5,114.47,567.25,114.47,.5);
    v411CenteredTopText(page,data.personName,87.25,293.5,80.63,15.96,bold,{padding:2,minSize:11});
    v411CenteredTopText(page,data.position,87.25,293.5,99.47,15.96,bold,{padding:2,minSize:11});
    v411CenteredTopText(page,data.employeeCode,431.5,567.25,79.07,15.96,bold,{padding:2,minSize:11});
    v411CenteredTopText(page,thaiDateLong(data.startWork),431.5,567.25,100.07,15.96,bold,{padding:2,minSize:10});
  }
  function v411DrawTable(page,rows,offset,assets){
    const {regular,bold}=assets,x=[8.76,29.76,235.37,263.69,398.95,462.82,531.82,586.68],tableTop=139.7,headerBottom=161.9,bodyBottom=715.42;
    for(const xpos of x)v411Line(page,xpos,tableTop,xpos,bodyBottom,.48);
    v411Line(page,x[0],tableTop,x[x.length-1],tableTop,.48);v411Line(page,x[0],headerBottom,x[x.length-1],headerBottom,.48);
    const heads=['ที่','หลักสูตร/เรื่อง','รุ่น','หน่วยงานผู้จัด','วันที่เริ่มต้น','วันที่สิ้นสุด','ระยะเวลา'];
    heads.forEach((label,i)=>v411CenteredTopText(page,label,x[i],x[i+1],140.63,15.96,bold,{padding:2,minSize:12}));
    let rowTop=headerBottom;
    rows.forEach((row,rowIndex)=>{
      const item=row.item,a=item.activity,lineTop=rowTop+1.0;
      v411CenteredTopText(page,String(offset+rowIndex+1),x[0],x[1],lineTop,14.04,regular,{padding:1,minSize:10});
      row.title.forEach((line,i)=>v411TopText(page,line,x[1]+5.4,lineTop+i*row.lineHeight,14.04,regular));
      row.batch.forEach((line,i)=>v411CenteredTopText(page,line,x[2],x[3],lineTop+i*row.lineHeight,14.04,regular,{padding:1,minSize:9}));
      row.organizer.forEach((line,i)=>v411TopText(page,line,x[3]+5.1,lineTop+i*row.lineHeight,14.04,regular));
      v411CenteredTopText(page,dateLabel(a.start_date),x[4],x[5],lineTop,14.04,regular,{padding:2,minSize:10});
      v411CenteredTopText(page,dateLabel(a.end_date||a.start_date),x[5],x[6],lineTop,14.04,regular,{padding:2,minSize:10});
      v411CenteredTopText(page,durationLabel(a),x[6],x[7],lineTop,14.04,regular,{padding:2,minSize:10});
      rowTop+=row.height;v411Line(page,x[0],rowTop,x[x.length-1],rowTop,.48);
    });
    while(rowTop+19.2<bodyBottom-.1){rowTop+=19.2;v411Line(page,x[0],rowTop,x[x.length-1],rowTop,.48);}
    if(Math.abs(rowTop-bodyBottom)>.1)v411Line(page,x[0],bodyBottom,x[x.length-1],bodyBottom,.48);
  }
  function v411DrawSignature(page,data,pageIndex,pageCount,assets){
    const {regular}=assets,leftX0=8.25,leftX1=295.9,rightX0=295.9,rightX1=583.5;
    v411Rect(page,8.25,730.9,575.25,92.59,1);
    v411TopText(page,'ลงชื่อ ................................................................',15.96,745.75,15.96,regular);
    v411TopText(page,'ลงชื่อ ...............................................................',330.0,745.75,15.96,regular);
    v411CenteredTopText(page,`(${data.personName})`,leftX0,leftX1,767.11,15.96,regular,{padding:4,minSize:11});
    if(data.supervisorName)v411CenteredTopText(page,`(${data.supervisorName})`,rightX0,rightX1,767.11,15.96,regular,{padding:4,minSize:11});
    v411CenteredTopText(page,'บุคลากรผู้รับการฝึกอบรม',leftX0,leftX1,788.49,15.96,regular,{padding:4,minSize:11});
    v411CenteredTopText(page,'หัวหน้าหน่วย/หัวหน้างาน',rightX0,rightX1,788.49,15.96,regular,{padding:4,minSize:11});
    v411CenteredTopText(page,`หน้าที่ ${pageIndex+1} ของ ${pageCount} หน้า`,245,350,824.48,9,regular,{padding:0,minSize:8});
    const footer='FM-CNHR-002 Rev.00  วันบังคับใช้ 1 ตุลาคม 2561',w=regular.widthOfTextAtSize(footer,9);v411TopText(page,footer,588.86-w,821.84,9,regular,{adjustY:.8});
  }
  async function v411DrawAnnualPages(pdfDoc,items,bundle,assets){
    const profile=staffOf(actor()),head=(S().staff||[]).find(x=>normalizedPersonText(x.full_name).includes('ปาริฉัตรอินทร์เกลี้ยง'))||{};
    const data={personName:profile.full_name||profile.nickname||'-',employeeCode:profile.employee_code||profile.personnel_code||'-',position:profile.position||profile.staff_type||'-',startWork:employment(actor()),supervisorName:isParichatProfile(profile)?'':headDisplayName(head)};
    const pages=v411Paginate(items,assets.regular);let offset=0;
    pages.forEach((rows,pageIndex)=>{const page=pdfDoc.addPage([V411_PAGE_W,V411_PAGE_H]);v411DrawHeader(page,bundle,assets);v411DrawPerson(page,data,assets);v411DrawTable(page,rows,offset,assets);v411DrawSignature(page,data,pageIndex,pages.length,assets);offset+=rows.length;});
    return pages.length;
  }
  async function exportMyAnnualTrainingPackageV411(items,button){
    const bundle=annualFormDocument(items);if(!bundle)return showToast(`ไม่พบรายการอบรมในปี ${selectedTrainingYear()+543}`);
    if(!window.PDFLib?.PDFDocument)return showToast('ยังโหลดระบบสร้าง PDF ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    const originalText=button?.textContent||'',certificates=items.filter(x=>x.record.certificate_path),errors=[];
    try{
      if(button){button.disabled=true;button.textContent='กำลังโหลดฟอนต์และสร้างแบบฟอร์ม…';}
      const pdfDoc=await PDFLib.PDFDocument.create(),assets=await v411PdfAssets(pdfDoc);
      await v411DrawAnnualPages(pdfDoc,items,bundle,assets);
      for(let i=0;i<certificates.length;i++){
        const item=certificates[i];if(button)button.textContent=`กำลังแนบ Certificate ${i+1}/${certificates.length}`;
        try{const blob=await downloadCertificate(item.record),kind=certificateKind(item.record,blob);if(kind==='pdf')await appendCertificatePdf(pdfDoc,blob,item,i+1,certificates.length);else if(kind==='image')await appendCertificateImage(pdfDoc,blob,item,i+1,certificates.length);else throw new Error('ชนิดไฟล์ไม่รองรับ');}catch(error){errors.push(`${item.activity.title||'Certificate'}: ${error?.message||String(error)}`);}
      }
      if(button)button.textContent='กำลังบันทึกไฟล์ PDF…';
      const bytes=await pdfDoc.save(),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeDownloadName(`FM-CNHR-002_${bundle.personName}_${bundle.year+543}_พร้อม-Certificate.pdf`);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
      if(errors.length){console.warn('V411 certificate merge skipped',errors);showToast(`สร้าง PDF แล้ว แต่แนบ Certificate ไม่สำเร็จ ${errors.length} ไฟล์`);}else showToast(`สร้าง PDF ชุดอบรมแล้ว • แนบ Certificate ${certificates.length} ไฟล์`);
    }catch(error){console.error('V411 annual training vector PDF',error);showToast(`สร้าง PDF ไม่สำเร็จ: ${error?.message||String(error)}`);}finally{if(button){button.disabled=false;button.textContent=originalText||'Export PDF ชุดอบรมประจำปี';}}
  }

  function printMyAnnualForm(items,button){return exportMyAnnualTrainingPackageV411(items,button);}


  function renderPageV396(){const p=S().page;if(p==='myTraining'||p==='trainingAdmin'){const item=NAV_ITEMS.find(x=>x.id===p);$('pageTitle').textContent=item.title;$('pageSubtitle').textContent=item.subtitle;renderNav();$('pageContent').innerHTML=p==='myTraining'?renderMyTraining():renderTrainingAdmin();return;}return oldRenderPage.apply(this,arguments);}
  const oldRenderPage=window.renderPage||renderPage;window.renderPage=renderPageV396;try{(0,eval)('renderPage=window.renderPage');}catch(_){ }
  NAV_ITEMS.splice(NAV_ITEMS.findIndex(x=>x.id==='activities')+1,0,{id:'myTraining',icon:'🎓',title:'รายการอบรมของฉัน',subtitle:'กรอกผลการอบรมและ Export FM-CNHR-002',group:'staff'});NAV_ITEMS.push({id:'trainingAdmin',icon:'🧾',title:'ตรวจสอบอบรมของเจ้าหน้าที่',subtitle:'Admin/แพทย์กรองและ Export ประวัติอบรม',group:'admin'});
  const oldNav=window.renderNav||renderNav;window.renderNav=function(){oldNav.apply(this,arguments);if(isManager()&&!document.querySelector('[data-page="trainingAdmin"]')){const nav=document.getElementById('mainNav');if(nav)nav.insertAdjacentHTML('beforeend','<div class="nav-section v396-doctor-nav"><div class="nav-section-title"><span>เมนู Admin/แพทย์</span><small>ตรวจสอบข้อมูลอบรม</small></div><button class="nav-btn" data-page="trainingAdmin"><span class="nav-emoji">🧾</span><span>ตรวจสอบอบรมของเจ้าหน้าที่</span></button></div>');}};try{(0,eval)('renderNav=window.renderNav');}catch(_){ }

  async function saveRecord(form){const r=trainingRows().find(x=>idEq(x.id,form.dataset.v396Record));if(!r||(!idEq(r.staff_id,actor())&&!isManager()))return showToast('ไม่มีสิทธิ์แก้ไขรายการนี้');const fd=new FormData(form),patch={result_text:String(fd.get('result_text')||'').trim()||null,application_text:String(fd.get('application_text')||'').trim()||null,updated_by:actor()};try{const file=fd.get('certificate');if(file?.size){const safe=String(file.name||'certificate').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`training-certificates/${r.staff_id}/${r.id}_${Date.now()}_${safe}`;const up=await DB().storage.from('staff-files').upload(path,file,{upsert:false});if(up.error)throw up.error;patch.certificate_path=path;patch.certificate_name=file.name;patch.certificate_mime_type=file.type||null;}const res=await DB().from(TABLE).update(patch).eq('id',r.id);if(res.error)throw res.error;await loadTraining();renderPage();showToast('บันทึกข้อมูลอบรมแล้ว');}catch(e){showToast(e?.message||String(e));}}
  document.addEventListener('submit',e=>{if(e.target?.id==='activityForm'){e.preventDefault();e.stopImmediatePropagation();saveActivityV396(e.target);}else if(e.target?.matches?.('[data-v396-record]')){e.preventDefault();e.stopImmediatePropagation();saveRecord(e.target);}else if(e.target?.id==='newStaffForm'){const date=e.target.querySelector('[name="employment_start_date"]')?.value||'';if(date){e.preventDefault();e.stopImmediatePropagation();const fd=new FormData(e.target);(async()=>{const row={nickname:fd.get('nickname'),full_name:fd.get('full_name'),email:String(fd.get('email')||'').trim().toLowerCase(),employee_code:fd.get('employee_code')||null,phone:fd.get('phone')||null,login_name:fd.get('login_name')||null,staff_color:fd.get('staff_color')||'#e8f3ff',staff_type:fd.get('staff_type')||null,position:fd.get('position')||null,role:fd.get('role')||'staff',is_active:true,roster_enabled:true,daily_position_enabled:false,position_training_status:'น้องใหม่ / ยังไม่จัดอัตโนมัติ',employment_start_date:date};const q=await DB().from('staff_profiles').insert(row);if(q.error)return showToast(q.error.message);await loadAllData();renderPage();showToast('เพิ่มผู้ใช้งานพร้อมวันเริ่มงานแล้ว');})();}}},true);
  document.addEventListener('change',e=>{if(e.target?.name==='include_fm_cnhr_002'){const wrap=e.target.closest('.v405-training-meta-grid'),required=e.target.checked===true;wrap?.querySelectorAll('.v405-training-field').forEach(field=>{field.classList.toggle('v405-required',required);const input=field.querySelector('input');if(input){input.required=required;input.setAttribute('aria-required',required?'true':'false');}});const batchInput=wrap?.querySelector('input[name="training_batch"]');if(required&&batchInput&&!String(batchInput.value||'').trim())batchInput.value='-';return;}if(e.target?.id==='v407TrainingYear'){applyTrainingYearRange(e.target.value);renderPage();return;}const m={v402MyStatus:'v402MyStatus',v396MyFrom:'v396MyFrom',v396MyTo:'v396MyTo',v396From:'v396From',v396To:'v396To',v396Staff:'v396Staff',v396Status:'v396Status'};if(m[e.target?.id]){S()[m[e.target.id]]=e.target.value||'';renderPage();}},true);
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-v402-my-export')){e.preventDefault();e.stopImmediatePropagation();printMyAnnualForm(myTrainingAnnualRows(),b);}else if(b.hasAttribute('data-v396-admin-export')){e.preventDefault();e.stopImmediatePropagation();printDoc(filtered());}},true);
  // staff_profiles ในฐานข้อมูลจริงไม่มี updated_by จึงห้ามส่งฟิลด์นี้ไปตอน Active/ข้อมูลผู้ใช้งาน
  document.addEventListener('click',e=>{const b=e.target.closest('button[data-save-staff-users]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();(async()=>{const card=document.querySelector('[data-staff-row]'),id=S().usersStaffId;if(!card||!id)return;const get=k=>card.querySelector(`[data-field="${k}"]`)?.value;const patch={nickname:get('nickname'),full_name:get('full_name'),email:get('email'),employee_code:get('employee_code'),phone:get('phone'),login_name:get('login_name')||null,staff_color:get('staff_color'),staff_type:get('staff_type'),position:get('position'),role:get('role'),is_active:get('is_active')==='true',roster_enabled:get('roster_enabled')!=='false',daily_position_enabled:get('daily_position_enabled')!=='false',is_long_term_leave:get('is_long_term_leave')==='true',position_training_status:get('position_training_status'),employment_start_date:get('employment_start_date')||null};const q=await DB().from('staff_profiles').update(patch).eq('id',id);if(q.error)return showToast(q.error.message);await loadAllData();renderPage();showToast('บันทึกข้อมูลผู้ใช้งานและวันเริ่มงานแล้ว');})();},true);

  const oldProfile=window.renderMyProfilePage||renderMyProfilePage;window.renderMyProfilePage=function(){const html=oldProfile.apply(this,arguments);return html.replace('</div>','<div class="card"><h3>วันเริ่มงาน</h3><p>'+esc(employment(actor())||'ยังไม่ระบุ')+'</p><span class="hint">ข้อมูลนี้ใช้เป็นข้อมูลตั้งต้นในแบบฟอร์ม FM-CNHR-002</span></div></div>');};try{(0,eval)('renderMyProfilePage=window.renderMyProfilePage');}catch(_){ }
  const oldUsers=window.renderUsersPage||renderUsersPage;window.renderUsersPage=function(){let html=oldUsers.apply(this,arguments);html=html.replace('<label>Email <input data-field="email"','<label>วันเริ่มงาน <input type="date" data-field="employment_start_date" value="'+esc(staffOf(S().usersStaffId).employment_start_date||'')+'"></label><label>Email <input data-field="email"');html=html.replace('<label>ชื่อเล่น <input name="nickname"','<label>วันเริ่มงาน <input name="employment_start_date" type="date"></label><label>ชื่อเล่น <input name="nickname"');return html;};try{(0,eval)('renderUsersPage=window.renderUsersPage');}catch(_){ }
  const oldLeaveBadge=window.leaveCellBadge||leaveCellBadge;window.leaveCellBadge=function(l){const text=leaveDisplayType(l),period=String(l?.leave_period||'เต็มวัน');return `<span class="mini-status ${leaveCellClass(text)}">${esc(text)}${period!=='เต็มวัน'?`<small class="v396-halfday">${esc(period.replace(/\\s*\\d{2}:\\d{2}-\\d{2}:\\d{2}/,'').trim())}</small>`:''}</span>`;};try{(0,eval)('leaveCellBadge=window.leaveCellBadge');}catch(_){ }
  const oldEventText=window.eventText||eventText;window.eventText=function(type){return oldEventText(type);};
  const style=document.createElement('style');style.textContent='.v396-participants{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:240px;overflow:auto}.v396-participant{display:flex;gap:8px;padding:8px;border:1px solid #d9e4ed;border-radius:10px;background:#fff}.v396-participant input{width:auto}.v396-participant span{display:grid}.v396-participant small{color:#68798a}.v405-training-meta-grid{display:grid;grid-template-columns:minmax(260px,1.15fr) minmax(220px,1fr) minmax(170px,.72fr);gap:12px;align-items:stretch}.v396-training-check{display:flex;gap:9px;align-items:flex-start;padding:12px;border:1px solid #9bc8e2;border-radius:12px;background:#f2faff;font-weight:700;margin:0}.v396-training-check input{width:auto;margin-top:4px}.v396-training-check small{display:block;font-weight:400;color:#587087}.v405-training-field{display:grid;align-content:start;gap:5px;padding:10px 12px;border:1px solid #d9e4ed;border-radius:12px;background:#fff;margin:0}.v405-training-field input{margin-top:0}.v405-required-mark{display:none;color:#c93b52}.v405-training-field.v405-required{border-color:#75bce6;background:#f8fcff}.v405-training-field.v405-required .v405-required-mark{display:inline}.v396-record-list{display:grid;gap:14px;margin-top:14px}.v396-record textarea{width:100%;resize:vertical}.v396-filters{align-items:end}.v401-my-training-filters{grid-template-columns:repeat(2,minmax(180px,260px));justify-content:start}.v402-my-training-filters{display:grid;grid-template-columns:minmax(170px,220px) minmax(190px,240px) minmax(260px,1fr);align-items:end;gap:12px}.v402-export-wrap{display:grid;gap:5px;align-content:end}.v402-export-wrap button{width:100%}.v402-export-wrap button:disabled{opacity:.5;cursor:not-allowed}.v396-halfday{display:block;font-size:10px;font-weight:700}@media(max-width:900px){.v405-training-meta-grid{grid-template-columns:1fr}.v402-my-training-filters{grid-template-columns:1fr 1fr}.v402-export-wrap{grid-column:1/-1}}@media(max-width:700px){.v396-participants{grid-template-columns:1fr}.v396-filters{display:grid;grid-template-columns:1fr 1fr}.v396-filters label:last-child{grid-column:1/-1}.v401-my-training-filters label:last-child{grid-column:auto}.v402-my-training-filters label:last-of-type{grid-column:auto}.v407-year-filter .v402-export-wrap{grid-column:1/-1}}@media(max-width:460px){.v401-my-training-filters,.v402-my-training-filters{grid-template-columns:1fr}.v401-my-training-filters label:last-child,.v402-my-training-filters label:last-of-type,.v402-export-wrap{grid-column:1/-1}}';document.head.appendChild(style);
  loadTraining();
})();
