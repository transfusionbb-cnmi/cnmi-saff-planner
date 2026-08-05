/* CNMI Staff Planner V396
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
  const dateKey = v => String(v || '').slice(0,10);
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

  async function loadTraining() {
    if (!S().profile || !DB()) return;
    const res = await DB().from(TABLE).select('*').order('updated_at', {ascending:false});
    if (res.error) { S().trainingRecords=[]; S().trainingSchemaError=res.error.message || String(res.error); return; }
    S().trainingRecords=res.data || []; S().trainingSchemaError='';
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
        <label class="wide v396-training-check"><input type="checkbox" name="include_fm_cnhr_002" ${included?'checked':''}> <span>นำเข้าแบบฟอร์ม FM-CNHR-002 <small>ติ๊กเมื่อ ต้องการเก็บกิจกรรมนี้เป็นประวัติการอบรมของผู้เข้าร่วม</small></span></label>
        <label>ประเภท <select name="event_type" required>${(typeof ACTIVITY_TYPES!=='undefined'?ACTIVITY_TYPES:['ประชุม','อบรม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE','อื่นๆ']).map(t=>`<option ${editing?.event_type===t?'selected':''}>${t}</option>`).join('')}</select></label>
        <label>สถานที่ <input name="location" list="activityLocationList" value="${esc(editing?.location||'')}" required></label><datalist id="activityLocationList">${(typeof ACTIVITY_LOCATIONS!=='undefined'?ACTIVITY_LOCATIONS:[]).map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist>
        <label>วันที่เริ่ม <input name="start_date" type="date" value="${esc(editing?.start_date||todayStr())}" required></label><label>วันที่สิ้นสุด <input name="end_date" type="date" value="${esc(editing?.end_date||todayStr())}" required></label>
        <label>เวลาเริ่ม <input name="start_time" type="time" value="${esc(editing?.start_time||'')}" required></label><label>เวลาสิ้นสุด <input name="end_time" type="time" value="${esc(editing?.end_time||'')}" required></label>
        <label>ผู้รับผิดชอบ <select name="owner_id" required><option value="">เลือกผู้รับผิดชอบ</option>${staffOptions(editing?.owner_id||actor())}</select></label><label>เอกสารแนบ <input name="file" type="file"></label>
        <div class="wide"><div class="field-label">ผู้เข้าร่วม</div>${participantChecks(asArray(editing?.participant_ids))}</div>
        <label class="wide">หมายเหตุเพิ่มเติม <textarea name="note">${esc(editing?.note||'')}</textarea></label><button class="primary-btn wide" type="submit">${editing?'บันทึกการแก้ไข':'บันทึกกิจกรรม'}</button>
      </form></div><div class="card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3></div>${table}</div></div>`;
  }
  window.renderActivitiesPage=renderActivitiesV396; try{(0,eval)('renderActivitiesPage=window.renderActivitiesPage');}catch(_){ }

  async function saveActivityV396(form) {
    const fd=new FormData(form), participants=[...form.querySelectorAll('[name="participant_ids"]:checked')].map(x=>x.value);
    const include=form.querySelector('[name="include_fm_cnhr_002"]')?.checked===true;
    const row={title:String(fd.get('title')||'').trim(),event_type:fd.get('event_type'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),start_time:fd.get('start_time')||null,end_time:fd.get('end_time')||null,location:String(fd.get('location')||'').trim(),note:String(fd.get('note')||'').trim(),owner_id:fd.get('owner_id')||actor(),participant_ids:participants,include_fm_cnhr_002:include,training_form_existing:include,updated_by:actor()};
    const required=[['title','รายละเอียดกิจกรรม'],['event_type','ประเภท'],['location','สถานที่'],['start_date','วันที่เริ่ม'],['end_date','วันที่สิ้นสุด'],['start_time','เวลาเริ่ม'],['end_time','เวลาสิ้นสุด'],['owner_id','ผู้รับผิดชอบ']].filter(([k])=>!row[k]).map(([,v])=>v);
    if(row.event_type==='ออกหน่วย'&&!participants.length) required.push('ผู้เข้าร่วมสำหรับออกหน่วย');
    if(required.length)return showToast('กรุณากรอก/เลือกให้ครบ: '+required.join(', '));
    if(row.end_date<row.start_date)return showToast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    if(row.start_date===row.end_date&&row.end_time<=row.start_time)return showToast('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม');
    try{
      const file=fd.get('file'); if(file?.size&&typeof uploadFile==='function') row.attachment_path=await uploadFile(file,'activities');
      const id=S().editingActivityId;
      const res=id?await DB().from('activity_events').update(row).eq('id',id).select('*').single():await DB().from('activity_events').insert({...row,created_by:actor()}).select('*').single();
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
  function recordForm(item){const r=item.record,a=item.activity;return `<article class="card v396-record"><div class="section-title"><div><h3>${esc(a.title)}</h3><p class="hint">${dateLabel(a.start_date)}${dateKey(a.end_date)!==dateKey(a.start_date)?' – '+dateLabel(a.end_date):''} · ${esc(a.location||'-')}</p></div>${badge(status(r),status(r)==='กรอกข้อมูลแล้ว'?'green':'orange')}</div><p class="hint">แบบฟอร์ม FM-CNHR-002 · วันเริ่มงาน: ${dateLabel(r.employment_start_date_snapshot||employment(r.staff_id))}</p><form data-v396-record="${esc(r.id)}"><label>ผล/สิ่งที่ได้รับ<textarea name="result_text" rows="4">${esc(r.result_text||'')}</textarea></label><label>การนำความรู้ไปใช้<textarea name="application_text" rows="4">${esc(r.application_text||'')}</textarea></label><label>Certificate <input type="file" name="certificate" accept=".pdf,image/*"></label><small class="hint">ไม่บังคับแนบ Certificate</small><div class="actions"><button class="primary-btn" type="submit">บันทึกข้อมูล</button><button class="ghost-btn" type="button" data-v396-export="${esc(r.id)}">Export PDF</button></div></form></article>`;}
  function renderMyTraining(){if(!S().profile)return noPermission();const rows=rowItems().filter(x=>idEq(x.record.staff_id,actor()));return `<div class="card"><div class="section-title"><div><h3>รายการอบรมของฉัน</h3><p class="hint">แสดงเฉพาะกิจกรรมที่ Admin ติ๊กนำเข้า FM-CNHR-002</p></div></div>${trainingFormNotice()}${rows.length?`<div class="v396-record-list">${rows.map(recordForm).join('')}</div>`:empty('ยังไม่มีรายการอบรมของคุณ')}</div>`;}
  function filters(){const s=S();return `<div class="toolbar compact-filter v396-filters"><label>จากวันที่ <input type="date" id="v396From" value="${esc(s.v396From||'')}"></label><label>ถึงวันที่ <input type="date" id="v396To" value="${esc(s.v396To||'')}"></label><label>ปี <select id="v396Year"><option value="">ทุกปี</option>${[...new Set(rowItems().map(x=>dateKey(x.activity.start_date).slice(0,4)).filter(Boolean))].sort().reverse().map(y=>`<option value="${y}" ${s.v396Year===y?'selected':''}>พ.ศ. ${Number(y)+543}</option>`).join('')}</select></label><label>บุคลากร <select id="v396Staff"><option value="">ทุกคน</option>${(S().staff||[]).filter(x=>x.is_active!==false).map(x=>`<option value="${esc(x.id)}" ${idEq(s.v396Staff,x.id)?'selected':''}>${esc(staffName(x.id))}</option>`).join('')}</select></label><label>สถานะข้อมูล <select id="v396Status"><option value="">ทุกสถานะ</option><option value="กรอกข้อมูลแล้ว" ${s.v396Status==='กรอกข้อมูลแล้ว'?'selected':''}>กรอกข้อมูลแล้ว</option><option value="รอกรอกข้อมูล" ${s.v396Status==='รอกรอกข้อมูล'?'selected':''}>รอกรอกข้อมูล</option></select></label></div>`;}
  function filtered(){const s=S();return rowItems().filter(x=>{const d=dateKey(x.activity.start_date);return(!s.v396From||d>=s.v396From)&&(!s.v396To||d<=s.v396To)&&(!s.v396Year||d.startsWith(s.v396Year))&&(!s.v396Staff||idEq(x.record.staff_id,s.v396Staff))&&(!s.v396Status||status(x.record)===s.v396Status);}).sort((a,b)=>dateKey(b.activity.start_date).localeCompare(dateKey(a.activity.start_date)));}
  function renderTrainingAdmin(){if(!isManager())return noPermission();const rows=filtered();return `<div class="card"><div class="section-title"><div><h3>ตรวจสอบอบรมของเจ้าหน้าที่</h3><p class="hint">กรองตามบุคลากร ช่วงวันที่ ปี และสถานะข้อมูลได้</p></div><button class="ghost-btn" type="button" data-v396-admin-export>Export PDF</button></div>${trainingFormNotice()}${filters()}${rows.length?`<div class="table-wrap"><table><thead><tr><th>บุคลากร</th><th>กิจกรรม</th><th>วันที่/สถานที่</th><th>แบบฟอร์ม</th><th>สถานะ</th><th>อัปเดตล่าสุด</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(staffName(x.record.staff_id))}</td><td>${esc(x.activity.title)}</td><td>${dateLabel(x.activity.start_date)}<br>${esc(x.activity.location||'-')}</td><td>FM-CNHR-002</td><td>${badge(status(x.record),status(x.record)==='กรอกข้อมูลแล้ว'?'green':'orange')}</td><td>${dateTimeLabel(x.record.updated_at||x.record.created_at)}</td></tr>`).join('')}</tbody></table></div>`:empty('ไม่พบข้อมูลตามตัวกรอง')}</div>`;}

  function printDoc(items){const body=items.map(x=>`<article class="v396-print-record"><h1>FM-CNHR-002 บุคลากรเดิม</h1><p><b>บุคลากร:</b> ${esc(staffName(x.record.staff_id))}<br><b>วันเริ่มงาน:</b> ${esc(dateLabel(x.record.employment_start_date_snapshot||employment(x.record.staff_id)))}<br><b>กิจกรรม:</b> ${esc(x.activity.title)}<br><b>วันที่:</b> ${esc(dateLabel(x.activity.start_date))} · ${esc(x.activity.location||'-')}</p><h3>ผล/สิ่งที่ได้รับ</h3><div class="v396-print-box">${esc(x.record.result_text||'-')}</div><h3>การนำความรู้ไปใช้</h3><div class="v396-print-box">${esc(x.record.application_text||'-')}</div><p>Certificate: ${x.record.certificate_path?'แนบแล้ว':'ไม่ได้แนบ (ไม่บังคับ)'}</p></article>`).join('');const w=window.open('','_blank');if(!w)return showToast('กรุณาอนุญาต Pop-up เพื่อ Export PDF');w.document.write(`<html><head><meta charset="utf-8"><title>FM-CNHR-002</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#17324d}.v396-print-record{page-break-after:always}.v396-print-record:last-child{page-break-after:auto}.v396-print-box{border:1px solid #ccd8e2;padding:12px;min-height:70px;white-space:pre-wrap;margin-bottom:14px}</style></head><body>${body}</body></html>`);w.document.close();setTimeout(()=>{w.focus();w.print();},250);}

  function renderPageV396(){const p=S().page;if(p==='myTraining'||p==='trainingAdmin'){const item=NAV_ITEMS.find(x=>x.id===p);$('pageTitle').textContent=item.title;$('pageSubtitle').textContent=item.subtitle;renderNav();$('pageContent').innerHTML=p==='myTraining'?renderMyTraining():renderTrainingAdmin();return;}return oldRenderPage.apply(this,arguments);}
  const oldRenderPage=window.renderPage||renderPage;window.renderPage=renderPageV396;try{(0,eval)('renderPage=window.renderPage');}catch(_){ }
  NAV_ITEMS.splice(NAV_ITEMS.findIndex(x=>x.id==='activities')+1,0,{id:'myTraining',icon:'🎓',title:'รายการอบรมของฉัน',subtitle:'กรอกผลการอบรมและ Export FM-CNHR-002',group:'staff'});NAV_ITEMS.push({id:'trainingAdmin',icon:'🧾',title:'ตรวจสอบอบรมของเจ้าหน้าที่',subtitle:'Admin/แพทย์กรองและ Export ประวัติอบรม',group:'admin'});
  const oldNav=window.renderNav||renderNav;window.renderNav=function(){oldNav.apply(this,arguments);if(isManager()&&!document.querySelector('[data-page="trainingAdmin"]')){const nav=document.getElementById('mainNav');if(nav)nav.insertAdjacentHTML('beforeend','<div class="nav-section v396-doctor-nav"><div class="nav-section-title"><span>เมนู Admin/แพทย์</span><small>ตรวจสอบข้อมูลอบรม</small></div><button class="nav-btn" data-page="trainingAdmin"><span class="nav-emoji">🧾</span><span>ตรวจสอบอบรมของเจ้าหน้าที่</span></button></div>');}};try{(0,eval)('renderNav=window.renderNav');}catch(_){ }

  async function saveRecord(form){const r=trainingRows().find(x=>idEq(x.id,form.dataset.v396Record));if(!r||(!idEq(r.staff_id,actor())&&!isManager()))return showToast('ไม่มีสิทธิ์แก้ไขรายการนี้');const fd=new FormData(form),patch={result_text:String(fd.get('result_text')||'').trim()||null,application_text:String(fd.get('application_text')||'').trim()||null,updated_by:actor()};try{const file=fd.get('certificate');if(file?.size){const safe=String(file.name||'certificate').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`training-certificates/${r.staff_id}/${r.id}_${Date.now()}_${safe}`;const up=await DB().storage.from('staff-files').upload(path,file,{upsert:false});if(up.error)throw up.error;patch.certificate_path=path;patch.certificate_name=file.name;patch.certificate_mime_type=file.type||null;}const res=await DB().from(TABLE).update(patch).eq('id',r.id);if(res.error)throw res.error;await loadTraining();renderPage();showToast('บันทึกข้อมูลอบรมแล้ว');}catch(e){showToast(e?.message||String(e));}}
  document.addEventListener('submit',e=>{if(e.target?.id==='activityForm'){e.preventDefault();e.stopImmediatePropagation();saveActivityV396(e.target);}else if(e.target?.matches?.('[data-v396-record]')){e.preventDefault();e.stopImmediatePropagation();saveRecord(e.target);}else if(e.target?.id==='newStaffForm'){const date=e.target.querySelector('[name="employment_start_date"]')?.value||'';if(date){e.preventDefault();e.stopImmediatePropagation();const fd=new FormData(e.target);(async()=>{const row={nickname:fd.get('nickname'),full_name:fd.get('full_name'),email:String(fd.get('email')||'').trim().toLowerCase(),employee_code:fd.get('employee_code')||null,phone:fd.get('phone')||null,login_name:fd.get('login_name')||null,staff_color:fd.get('staff_color')||'#e8f3ff',staff_type:fd.get('staff_type')||null,position:fd.get('position')||null,role:fd.get('role')||'staff',is_active:true,roster_enabled:true,daily_position_enabled:false,position_training_status:'น้องใหม่ / ยังไม่จัดอัตโนมัติ',employment_start_date:date};const q=await DB().from('staff_profiles').insert(row);if(q.error)return showToast(q.error.message);await loadAllData();renderPage();showToast('เพิ่มผู้ใช้งานพร้อมวันเริ่มงานแล้ว');})();}}},true);
  document.addEventListener('change',e=>{const m={v396From:'v396From',v396To:'v396To',v396Year:'v396Year',v396Staff:'v396Staff',v396Status:'v396Status'};if(m[e.target?.id]){S()[m[e.target.id]]=e.target.value||'';renderPage();}},true);
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.v396Export){e.preventDefault();e.stopImmediatePropagation();const x=rowItems().find(x=>idEq(x.record.id,b.dataset.v396Export));if(x)printDoc([x]);}else if(b.hasAttribute('data-v396-admin-export')){e.preventDefault();e.stopImmediatePropagation();printDoc(filtered());}},true);
  // staff_profiles ในฐานข้อมูลจริงไม่มี updated_by จึงห้ามส่งฟิลด์นี้ไปตอน Active/ข้อมูลผู้ใช้งาน
  document.addEventListener('click',e=>{const b=e.target.closest('button[data-save-staff-users]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();(async()=>{const card=document.querySelector('[data-staff-row]'),id=S().usersStaffId;if(!card||!id)return;const get=k=>card.querySelector(`[data-field="${k}"]`)?.value;const patch={nickname:get('nickname'),full_name:get('full_name'),email:get('email'),employee_code:get('employee_code'),phone:get('phone'),login_name:get('login_name')||null,staff_color:get('staff_color'),staff_type:get('staff_type'),position:get('position'),role:get('role'),is_active:get('is_active')==='true',roster_enabled:get('roster_enabled')!=='false',daily_position_enabled:get('daily_position_enabled')!=='false',is_long_term_leave:get('is_long_term_leave')==='true',position_training_status:get('position_training_status'),employment_start_date:get('employment_start_date')||null};const q=await DB().from('staff_profiles').update(patch).eq('id',id);if(q.error)return showToast(q.error.message);await loadAllData();renderPage();showToast('บันทึกข้อมูลผู้ใช้งานและวันเริ่มงานแล้ว');})();},true);

  const oldProfile=window.renderMyProfilePage||renderMyProfilePage;window.renderMyProfilePage=function(){const html=oldProfile.apply(this,arguments);return html.replace('</div>','<div class="card"><h3>วันเริ่มงาน</h3><p>'+esc(employment(actor())||'ยังไม่ระบุ')+'</p><span class="hint">ข้อมูลนี้ใช้เป็นข้อมูลตั้งต้นในแบบฟอร์ม FM-CNHR-002</span></div></div>');};try{(0,eval)('renderMyProfilePage=window.renderMyProfilePage');}catch(_){ }
  const oldUsers=window.renderUsersPage||renderUsersPage;window.renderUsersPage=function(){let html=oldUsers.apply(this,arguments);html=html.replace('<label>Email <input data-field="email"','<label>วันเริ่มงาน <input type="date" data-field="employment_start_date" value="'+esc(staffOf(S().usersStaffId).employment_start_date||'')+'"></label><label>Email <input data-field="email"');html=html.replace('<label>ชื่อเล่น <input name="nickname"','<label>วันเริ่มงาน <input name="employment_start_date" type="date"></label><label>ชื่อเล่น <input name="nickname"');return html;};try{(0,eval)('renderUsersPage=window.renderUsersPage');}catch(_){ }
  const oldLeaveBadge=window.leaveCellBadge||leaveCellBadge;window.leaveCellBadge=function(l){const text=leaveDisplayType(l),period=String(l?.leave_period||'เต็มวัน');return `<span class="mini-status ${leaveCellClass(text)}">${esc(text)}${period!=='เต็มวัน'?`<small class="v396-halfday">${esc(period.replace(/\\s*\\d{2}:\\d{2}-\\d{2}:\\d{2}/,'').trim())}</small>`:''}</span>`;};try{(0,eval)('leaveCellBadge=window.leaveCellBadge');}catch(_){ }
  const oldEventText=window.eventText||eventText;window.eventText=function(type){return oldEventText(type);};
  const style=document.createElement('style');style.textContent='.v396-participants{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:240px;overflow:auto}.v396-participant{display:flex;gap:8px;padding:8px;border:1px solid #d9e4ed;border-radius:10px;background:#fff}.v396-participant input{width:auto}.v396-participant span{display:grid}.v396-participant small{color:#68798a}.v396-training-check{display:flex;gap:9px;align-items:flex-start;padding:12px;border:1px solid #9bc8e2;border-radius:12px;background:#f2faff;font-weight:700}.v396-training-check input{width:auto;margin-top:4px}.v396-training-check small{display:block;font-weight:400;color:#587087}.v396-record-list{display:grid;gap:14px;margin-top:14px}.v396-record textarea{width:100%;resize:vertical}.v396-filters{align-items:end}.v396-halfday{display:block;font-size:10px;font-weight:700}@media(max-width:700px){.v396-participants{grid-template-columns:1fr}.v396-filters{display:grid;grid-template-columns:1fr 1fr}.v396-filters label:last-child{grid-column:1/-1}}';document.head.appendChild(style);
  loadTraining();
})();
