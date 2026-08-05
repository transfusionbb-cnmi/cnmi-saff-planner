/* V394: training workflow integrated into Activities. Loaded after the stable app. */
(function () {
  'use strict';
  const FORM_OLD = 'บุคลากรเดิม';
  const FORM_NEW = 'บุคลากรใหม่';
  const TRAINING_FORMS = [FORM_OLD, FORM_NEW];
  const st = () => state;
  const html = v => window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const staff = id => (st().staff || []).find(x => String(x.id) === String(id));
  const nick = id => staff(id)?.nickname || staff(id)?.full_name || '-';
  const isAdmin = () => !!window.isAdmin?.();
  const me = () => window.currentStaffId?.();
  const toast = m => window.showToast ? window.showToast(m) : alert(m);
  const escAttr = v => html(v).replace(/`/g, '&#96;');

  if (!Array.isArray(NAV_ITEMS)) return;
  function addNav(item, beforeId) {
    if (NAV_ITEMS.some(x => x.id === item.id)) return;
    const i = NAV_ITEMS.findIndex(x => x.id === beforeId);
    NAV_ITEMS.splice(i >= 0 ? i : NAV_ITEMS.length, 0, item);
  }
  addNav({ id:'myTraining', icon:'🎓', title:'การอบรมของฉัน', subtitle:'กรอกผลการอบรมและ Export PDF', group:'staff' }, 'schedule');
  addNav({ id:'trainingAdmin', icon:'📚', title:'ดูอบรมของบุคลากร', subtitle:'ดู กรอง และ Export แบบฟอร์มอบรม', group:'admin' }, 'users');

  st().trainingRecords = st().trainingRecords || [];
  st().trainingFilter = st().trainingFilter || { staff:'', from:'', to:'', form:'', year:'', status:'' };
  st().trainingEditId = null;

  const oldLoad = window.loadAllData;
  window.loadAllData = async function loadAllDataV394() {
    await oldLoad();
    if (!sb || !st().profile) return;
    let q = sb.from('training_records').select('*').order('training_date', { ascending:false });
    if (!isAdmin()) q = q.eq('staff_id', me());
    const r = await q;
    if (r.error) {
      if (r.error.code === '42P01' || /does not exist|relation/i.test(r.error.message || '')) {
        st().trainingRecords = [];
        console.warn('V394 training table not installed:', r.error.message);
      } else throw new Error('trainingRecords: ' + r.error.message);
    } else st().trainingRecords = r.data || [];
  };

  function selectedIds(row) { return Array.isArray(row?.participant_ids) ? row.participant_ids.map(String) : []; }
  function trainingFlags(row) {
    return {
      old: !!(row?.training_import_old || row?.training_form_old),
      fresh: !!(row?.training_import_new || row?.training_form_new)
    };
  }
  function renderTrainingChecks(row) {
    const f = trainingFlags(row);
    return `<fieldset class="training-import-box wide"><legend>นำเข้ากิจกรรมนี้เข้าแบบฟอร์ม</legend>
      <label class="check-row"><input type="checkbox" name="training_import_old" value="true" ${f.old?'checked':''}> นำเข้าแบบฟอร์ม FM-CNHR-002 บุคลากรเดิม</label>
      <label class="check-row"><input type="checkbox" name="training_import_new" value="true" ${f.fresh?'checked':''}> นำเข้าแบบฟอร์ม บุคลากรใหม่</label>
      <p class="hint">ติ๊กได้ 1 อันหรือทั้ง 2 อัน ถ้าติ๊กทั้ง 2 อัน ระบบใช้กิจกรรมและผู้เข้าร่วมชุดเดียวกัน แล้วแยกเป็นรายการในแต่ละแบบฟอร์มให้อัตโนมัติ</p>
    </fieldset>`;
  }
  function renderActivityWithTraining() {
    const rows = [...(st().activities || [])].sort((a,b) => String(b.start_date||'').localeCompare(String(a.start_date||'')));
    const editing = st().editingActivityId ? rows.find(x => String(x.id) === String(st().editingActivityId)) : null;
    const old = ACTIVITY_TYPES || ['ประชุม','อบรม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE','อื่นๆ'];
    const loc = ACTIVITY_LOCATIONS || [];
    const participants = ids => (st().staff || []).filter(x => x.is_active).map(s => `<label class="participant-check"><input type="checkbox" name="participant_ids" value="${escAttr(s.id)}" ${ids.includes(String(s.id))?'checked':''}><span>${html(s.nickname || s.full_name)}<small>${html(s.staff_type || '-')}</small></span></label>`).join('');
    const list = rows.length ? rows.map(r => {
      const f = trainingFlags(r);
      const forms = [f.old?'FM-CNHR-002 บุคลากรเดิม':'', f.fresh?'แบบฟอร์มบุคลากรใหม่':''].filter(Boolean).join(' + ');
      const people = selectedIds(r).map(nick).join(', ') || '-';
      const can = isAdmin() || String(r.created_by) === String(me()) || String(r.owner_id) === String(me());
      return `<div class="activity-row-card"><div class="activity-row-head"><div><b>${html(r.title)}</b><br><span class="badge ${window.activityClass?.(r.event_type)||''}">${html(r.event_type||'-')}</span>${forms?`<br><span class="badge blue">${html(forms)}</span>`:''}</div><span class="muted">${window.formatThaiDate?.(r.start_date)||r.start_date||'-'}</span></div>
        <div class="activity-row-detail"><span>เวลา</span><b>${html([r.start_time,r.end_time].filter(Boolean).join(' - ')||'-')}</b></div><div class="activity-row-detail"><span>สถานที่</span><b>${html(r.location||'-')}</b></div><div class="activity-row-detail"><span>ผู้เข้าร่วม</span><b>${html(people)}</b></div><div class="actions">${can?`<button class="tiny-btn" data-edit-activity="${escAttr(r.id)}">แก้ไข</button><button class="tiny-btn danger" data-delete-activity="${escAttr(r.id)}">ลบ</button>`:'<span class="muted">ดูอย่างเดียว</span>'}</div></div>`;
    }).join('') : '<div class="empty-state">ยังไม่มีกิจกรรม</div>';
    return `<div class="grid grid-2 activities-v394"><div class="card"><div class="section-title"><h3>${editing?'แก้ไขกิจกรรมหน่วยงาน':'เพิ่มกิจกรรมหน่วยงาน'}</h3>${editing?'<button class="ghost-btn" data-cancel-edit-activity>ยกเลิกแก้ไข</button>':''}</div>
      <form id="activityForm" class="form-grid"><label class="wide">รายละเอียดกิจกรรม <input name="title" value="${escAttr(editing?.title||'')}" placeholder="เช่น อบรมการช่วยฟื้นคืนชีพ" required></label>
      <label>ประเภท <select name="event_type" required>${old.map(x=>`<option ${editing?.event_type===x?'selected':''}>${html(x)}</option>`).join('')}</select></label><label>สถานที่ <input name="location" list="activityLocationList" value="${escAttr(editing?.location||'')}" required></label><datalist id="activityLocationList">${loc.map(x=>`<option value="${html(x)}"></option>`).join('')}</datalist>
      <label>วันที่เริ่ม <input name="start_date" type="date" value="${editing?.start_date||window.todayStr?.()||''}" required></label><label>วันที่สิ้นสุด <input name="end_date" type="date" value="${editing?.end_date||window.todayStr?.()||''}" required></label>
      <label>เวลาเริ่ม <input name="start_time" type="time" value="${editing?.start_time||''}" required></label><label>เวลาสิ้นสุด <input name="end_time" type="time" value="${editing?.end_time||''}" required></label>
      <label>ผู้รับผิดชอบ <select name="owner_id" required>${(st().staff||[]).filter(x=>x.is_active).map(x=>`<option value="${escAttr(x.id)}" ${String(editing?.owner_id||me())===String(x.id)?'selected':''}>${html(x.nickname||x.full_name)}</option>`).join('')}</select></label><label>เอกสารแนบ <input name="file" type="file"></label>
      ${renderTrainingChecks(editing)}<div class="wide"><div class="field-label">ผู้เข้าร่วม (เลือกได้หลายคน)</div><div class="participant-grid">${participants(selectedIds(editing))}</div></div>
      <label class="wide">หมายเหตุเพิ่มเติม <textarea name="note" placeholder="รายละเอียดเพิ่มเติม">${html(editing?.note||'')}</textarea></label><button class="primary-btn wide" type="submit">${editing?'บันทึกการแก้ไข':'บันทึกกิจกรรม'}</button></form></div>
      <div class="card activity-list-card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3></div><div class="activity-card-list">${list}</div></div></div>`;
  }
  window.renderActivitiesPage = renderActivityWithTraining;

  function formRows() { return (st().trainingRecords || []).map(r => ({...r, person:staff(r.staff_id), activity:(st().activities||[]).find(a=>String(a.id)===String(r.activity_id))})); }
  function hasTrainingForMe() { return (st().trainingRecords||[]).some(r => String(r.staff_id)===String(me())); }
  function statusOf(r) { return r.status || ((r.result_received || r.knowledge_applied || r.certificate_path || r.signature_data) ? 'กรอกข้อมูลบางส่วน' : 'รอกรอกข้อมูล'); }
  function trainingCard(r) {
    const a=r.activity||{}; const s=r.person||{}; const isNew=r.form_type===FORM_NEW;
    return `<div class="training-record-card"><div class="section-title"><div><h3>${html(a.title||r.title||'กิจกรรมอบรม')}</h3><span class="badge blue">${html(isNew?'แบบฟอร์มบุคลากรใหม่':'FM-CNHR-002 บุคลากรเดิม')}</span></div><span class="badge ${statusOf(r).includes('ครบ')?'green':'orange'}">${html(statusOf(r))}</span></div>
      <div class="training-meta"><span>วันที่อบรม</span><b>${html(window.formatThaiDate?.(r.training_date||a.start_date)||r.training_date||'-')}</b><span>สถานที่</span><b>${html(a.location||'-')}</b>${isNew?`<span>วันเริ่มงาน</span><b>${html(s.hire_date||'-')}</b>`:''}</div>
      <form class="training-record-form" data-training-id="${escAttr(r.id)}"><label>ผล/สิ่งที่ได้รับ<textarea name="result_received">${html(r.result_received||'')}</textarea></label><label>การนำความรู้ไปใช้<textarea name="knowledge_applied">${html(r.knowledge_applied||'')}</textarea></label><label>Certificate (ไม่บังคับ)<input type="file" name="certificate" accept="application/pdf,image/*"><small class="hint">${r.certificate_path?'มีไฟล์แนบแล้ว':'ไม่แนบก็สามารถบันทึกและ Export PDF ได้'}</small></label>
      ${isNew?signatureBox(r):''}<div class="actions"><button class="primary-btn" type="submit">บันทึกข้อมูล</button><button class="ghost-btn" type="button" data-training-pdf="${escAttr(r.id)}">Export PDF</button></div></form></div>`;
  }
  function signatureBox(r) { return `<div class="signature-wrap"><div class="field-label">ลายเซ็นผู้สอน/ผู้เชิญมาเทรน (เซ็นด้วยนิ้วหรือ Apple Pencil)</div><canvas class="signature-canvas" data-signature-canvas="${escAttr(r.id)}" width="900" height="260"></canvas><input type="text" name="trainer_name" value="${escAttr(r.trainer_name||'')}" placeholder="ชื่อผู้สอน/ผู้เชิญมาเทรน"><input type="hidden" name="signature_data" value="${escAttr(r.signature_data||'')}"><div class="actions"><button type="button" class="tiny-btn" data-clear-signature="${escAttr(r.id)}">ล้างลายเซ็น</button>${r.signed_at?`<span class="hint">บันทึกเมื่อ ${html(window.formatThaiDateTime?.(r.signed_at)||r.signed_at)}</span>`:''}</div></div>`; }
  function renderMyTraining() { const rows=formRows().filter(r=>String(r.staff_id)===String(me())); return `<div class="card"><div class="section-title"><div><h3>การอบรมของฉัน</h3><p class="hint">แสดงเฉพาะรายการที่ Admin นำชื่อของคุณเข้าแบบฟอร์มอบรม</p></div></div>${rows.length?`<div class="training-record-list">${rows.map(trainingCard).join('')}</div>`:'<div class="empty-state">ยังไม่มีรายการอบรมของคุณ</div>'}</div>`; }
  function renderTrainingAdmin() { if(!isAdmin()) return window.noPermission?.()||''; const f=st().trainingFilter||{}; let rows=formRows(); rows=rows.filter(r=>!f.staff||String(r.staff_id)===String(f.staff)).filter(r=>!f.form||r.form_type===f.form).filter(r=>!f.from||r.training_date>=f.from).filter(r=>!f.to||r.training_date<=f.to).filter(r=>!f.year||String(r.training_date||'').slice(0,4)===f.year).filter(r=>!f.status||statusOf(r)===f.status); const years=[...new Set(formRows().map(r=>String(r.training_date||'').slice(0,4)).filter(Boolean))].sort().reverse(); return `<div class="card training-admin-page"><div class="section-title"><div><h3>ดูอบรมของบุคลากร</h3><p class="hint">กรองข้อมูลแล้ว Export แยกตามประเภทแบบฟอร์มได้</p></div><div class="actions"><button class="ghost-btn" data-training-export="${FORM_OLD}">Export FM-CNHR-002 PDF</button><button class="ghost-btn" data-training-export="${FORM_NEW}">Export แบบฟอร์มบุคลากรใหม่ PDF</button></div></div>
    <div class="toolbar training-filters"><label>บุคลากร<select data-training-filter="staff"><option value="">ทุกคน</option>${(st().staff||[]).filter(x=>x.is_active).map(x=>`<option value="${escAttr(x.id)}" ${String(f.staff)===String(x.id)?'selected':''}>${html(x.nickname||x.full_name)}</option>`).join('')}</select></label><label>จากวันที่<input type="date" data-training-filter="from" value="${escAttr(f.from)}"></label><label>ถึงวันที่<input type="date" data-training-filter="to" value="${escAttr(f.to)}"></label><label>ประเภทแบบฟอร์ม<select data-training-filter="form"><option value="">ทุกประเภท</option>${TRAINING_FORMS.map(x=>`<option value="${html(x)}" ${f.form===x?'selected':''}>${html(x==='บุคลากรเดิม'?'FM-CNHR-002 บุคลากรเดิม':'แบบฟอร์มบุคลากรใหม่')}</option>`).join('')}</select></label><label>ปี<select data-training-filter="year"><option value="">ทุกปี</option>${years.map(x=>`<option ${f.year===x?'selected':''}>${x}</option>`).join('')}</select></label><label>สถานะ<select data-training-filter="status"><option value="">ทุกสถานะ</option><option ${f.status==='รอกรอกข้อมูล'?'selected':''}>รอกรอกข้อมูล</option><option ${f.status==='กรอกข้อมูลบางส่วน'?'selected':''}>กรอกข้อมูลบางส่วน</option><option ${f.status==='ครบถ้วน'?'selected':''}>ครบถ้วน</option></select></label></div>
    <div class="training-admin-table">${rows.length?`<table><thead><tr><th>บุคลากร</th><th>กิจกรรม</th><th>แบบฟอร์ม</th><th>วันที่อบรม</th><th>วันเริ่มงาน</th><th>สถานะ</th><th>Export</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${html(r.person?.nickname||r.person?.full_name||'-')}</td><td>${html(r.activity?.title||'-')}</td><td>${html(r.form_type==='บุคลากรเดิม'?'FM-CNHR-002 บุคลากรเดิม':'แบบฟอร์มบุคลากรใหม่')}</td><td>${html(r.training_date||'-')}</td><td>${html(r.person?.hire_date||'-')}</td><td>${html(statusOf(r))}</td><td><button class="tiny-btn" data-training-pdf="${escAttr(r.id)}">PDF</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">ไม่พบข้อมูลตามตัวกรอง</div>'}</div></div>`; }
  window.renderMyTraining = renderMyTraining; window.renderTrainingAdmin = renderTrainingAdmin;

  const oldRenderPage = window.renderPage;
  window.renderPage = function renderPageV394() { if(!st().profile) return oldRenderPage(); const item=NAV_ITEMS.find(x=>x.id===st().page)||NAV_ITEMS[0]; if(item){ $('pageTitle').textContent=item.title; $('pageSubtitle').textContent=item.subtitle; } window.renderNav(); const pages={ myTraining:renderMyTraining, trainingAdmin:renderTrainingAdmin }; if(pages[st().page]) $('pageContent').innerHTML=pages[st().page](); else oldRenderPage(); if(st().page==='myTraining') setTimeout(initSignatureCanvases,0); };

  const oldSaveActivity = window.saveActivity;
  window.saveActivity = async function saveActivityV394(form) {
    const fd=new FormData(form), participants=[...form.querySelectorAll('input[name="participant_ids"]:checked')].map(x=>x.value), old=fd.get('training_import_old')==='true', fresh=fd.get('training_import_new')==='true';
    if((old||fresh)&&!participants.length) return toast('กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน');
    if(fd.get('end_date')<fd.get('start_date')) return toast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    const row={title:String(fd.get('title')||'').trim(),event_type:fd.get('event_type'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),start_time:fd.get('start_time')||null,end_time:fd.get('end_time')||null,location:String(fd.get('location')||'').trim(),note:String(fd.get('note')||'').trim(),owner_id:fd.get('owner_id')||me(),participant_ids:participants,training_import_old:old,training_import_new:fresh,updated_by:me()};
    if(!row.title||!row.location||!row.start_date||!row.end_date||!row.start_time||!row.end_time) return toast('กรุณากรอกข้อมูลกิจกรรมให้ครบ');
    const id=st().editingActivityId; const res=id?await sb.from('activity_events').update(row).eq('id',id):await sb.from('activity_events').insert({...row,created_by:me()}).select().single(); if(res.error) return toast(res.error.message); const activityId=id||(res.data?.id); if(!activityId) return toast('บันทึกกิจกรรมแล้ว แต่ไม่พบรหัสกิจกรรม');
    const wanted=[]; participants.forEach(pid=>{if(old)wanted.push({activity_id:activityId,staff_id:pid,form_type:FORM_OLD,training_date:row.start_date,status:'รอกรอกข้อมูล',created_by:me()});if(fresh)wanted.push({activity_id:activityId,staff_id:pid,form_type:FORM_NEW,training_date:row.start_date,status:'รอกรอกข้อมูล',created_by:me()});});
    const oldRows=(st().trainingRecords||[]).filter(x=>String(x.activity_id)===String(activityId));
    const keep=new Set(wanted.map(x=>`${x.staff_id}|${x.form_type}`)); const remove=oldRows.filter(x=>!keep.has(`${x.staff_id}|${x.form_type}`));
    if(remove.length){const del=await sb.from('training_records').delete().in('id',remove.map(x=>x.id));if(del.error)return toast(del.error.message);}
    if(wanted.length){const up=await sb.from('training_records').upsert(wanted,{onConflict:'activity_id,staff_id,form_type'});if(up.error)return toast(up.error.message);}
    st().editingActivityId=null; await window.loadAllData(); window.renderPage(); toast('บันทึกกิจกรรมและรายการอบรมแล้ว');
  };

  async function saveTraining(form){ const id=form.dataset.trainingId,r=(st().trainingRecords||[]).find(x=>String(x.id)===String(id));if(!r)return toast('ไม่พบรายการอบรม');if(String(r.staff_id)!==String(me())&&!isAdmin())return toast('ไม่มีสิทธิ์แก้ไขรายการนี้');const fd=new FormData(form),patch={result_received:String(fd.get('result_received')||''),knowledge_applied:String(fd.get('knowledge_applied')||''),trainer_name:String(fd.get('trainer_name')||'').trim()||null,updated_by:me()};const sig=form.querySelector('[name="signature_data"]')?.value||'';if(r.form_type===FORM_NEW){patch.signature_data=sig||null;patch.signed_at=sig?new Date().toISOString():r.signed_at||null;}const file=fd.get('certificate');if(file?.size){const path=`training/${r.staff_id}/${r.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const u=await sb.storage.from('staff-files').upload(path,file,{upsert:false});if(u.error)return toast('แนบ Certificate ไม่สำเร็จ: '+u.error.message);patch.certificate_path=path;}patch.status=(patch.result_received||patch.knowledge_applied||patch.certificate_path||patch.signature_data)?'กรอกข้อมูลบางส่วน':'รอกรอกข้อมูล';if(patch.result_received&&patch.knowledge_applied&&(r.form_type===FORM_OLD||patch.signature_data))patch.status='ครบถ้วน';const u=await sb.from('training_records').update(patch).eq('id',id);if(u.error)return toast(u.error.message);await window.loadAllData();window.renderPage();toast('บันทึกข้อมูลอบรมแล้ว'); }
  window.saveTraining=saveTraining;

  function initSignatureCanvases(){document.querySelectorAll('[data-signature-canvas]').forEach(c=>{if(c.dataset.bound)return;c.dataset.bound='1';const r=(st().trainingRecords||[]).find(x=>String(x.id)===String(c.dataset.signatureCanvas));const ctx=c.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#153b63';if(r?.signature_data){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,c.width,c.height);im.src=r.signature_data;}let on=false,last=null;const point=e=>{const q=e.touches?.[0]||e;const b=c.getBoundingClientRect();return{x:(q.clientX-b.left)*c.width/b.width,y:(q.clientY-b.top)*c.height/b.height};};const start=e=>{e.preventDefault();on=true;last=point(e);};const move=e=>{if(!on)return;e.preventDefault();const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;c.closest('form').querySelector('[name="signature_data"]').value=c.toDataURL('image/png');};const end=()=>{on=false;};c.addEventListener('pointerdown',start);c.addEventListener('pointermove',move);c.addEventListener('pointerup',end);c.addEventListener('pointerleave',end);});}
  function printTraining(rows,title){const body=rows.map(r=>{const a=r.activity||{},p=r.person||{};return `<section class="pdf-record"><h2>${html(a.title||'-')}</h2><p><b>บุคลากร:</b> ${html(p.full_name||p.nickname||'-')} &nbsp; <b>แบบฟอร์ม:</b> ${html(r.form_type==='บุคลากรเดิม'?'FM-CNHR-002 บุคลากรเดิม':'แบบฟอร์มบุคลากรใหม่')}</p><p><b>วันที่อบรม:</b> ${html(r.training_date||'-')} &nbsp; <b>วันเริ่มงาน:</b> ${html(p.hire_date||'-')}</p><p><b>สถานที่:</b> ${html(a.location||'-')}</p><h3>ผล/สิ่งที่ได้รับ</h3><p class="line">${html(r.result_received||'-')}</p><h3>การนำความรู้ไปใช้</h3><p class="line">${html(r.knowledge_applied||'-')}</p>${r.form_type===FORM_NEW?`<h3>ผู้สอน/ผู้เชิญมาเทรน</h3><p>${html(r.trainer_name||'-')} ${r.signed_at?`(${html(window.formatThaiDateTime?.(r.signed_at)||r.signed_at)})`:''}</p>${r.signature_data?`<img class="sig" src="${r.signature_data}">`:''}`:''}<p class="footer">ระบบ Staff Planner • พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}</p></section>`}).join('');const w=window.open('','_blank');if(!w)return toast('เบราว์เซอร์บล็อกหน้าต่าง PDF กรุณาอนุญาต Pop-up');w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${html(title)}</title><style>body{font-family:Arial,sans-serif;color:#172b4d;padding:24px}.pdf-record{page-break-after:always;border:1px solid #bbb;padding:24px;min-height:90vh}h2{color:#174e7c}h3{margin-bottom:4px}.line{white-space:pre-wrap;min-height:55px;border-bottom:1px solid #999;padding:8px}.sig{max-width:420px;max-height:130px;border-bottom:1px solid #777}.footer{margin-top:40px;color:#777;font-size:11px}@media print{.pdf-record{border:0}}</style></head><body><h1>${html(title)}</h1>${body}</body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),350);}
  function exportOne(id){const r=formRows().find(x=>String(x.id)===String(id));if(r)printTraining([r],'แบบฟอร์มการอบรม');}
  function exportMany(formType){const f=st().trainingFilter||{};let rows=formRows().filter(r=>r.form_type===formType).filter(r=>!f.staff||String(r.staff_id)===String(f.staff)).filter(r=>!f.from||r.training_date>=f.from).filter(r=>!f.to||r.training_date<=f.to).filter(r=>!f.year||String(r.training_date||'').slice(0,4)===f.year).filter(r=>!f.status||statusOf(r)===f.status);if(!rows.length)return toast('ไม่พบข้อมูลสำหรับ Export');printTraining(rows,formType===FORM_OLD?'FM-CNHR-002 บุคลากรเดิม':'แบบฟอร์มบุคลากรใหม่');}
  const oldSubmit=window.handleSubmit,oldClick=window.handleClick,oldChange=window.handleChange;
  window.handleSubmit=async function(e){if(e.target.id==='activityForm') {e.preventDefault();return window.saveActivity(e.target);}if(e.target.classList.contains('training-record-form')){e.preventDefault();return saveTraining(e.target);}return oldSubmit(e);};
  window.handleChange=function(e){const t=e.target;if(t.dataset.trainingFilter){st().trainingFilter[t.dataset.trainingFilter]=t.value;window.renderPage();return;}return oldChange(e);};
  window.handleClick=async function(e){const t=e.target.closest('button,[data-page]');if(t?.dataset?.trainingPdf){return exportOne(t.dataset.trainingPdf);}if(t?.dataset?.trainingExport){return exportMany(t.dataset.trainingExport);}if(t?.dataset?.clearSignature){const c=document.querySelector(`[data-signature-canvas="${t.dataset.clearSignature}"]`),form=t.closest('form');if(c){c.getContext('2d').clearRect(0,0,c.width,c.height);form.querySelector('[name="signature_data"]').value='';}return;}return oldClick(e);};
  const oldUsers=window.renderUsersPage;
  window.renderUsersPage=function(){const out=oldUsers();if(!isAdmin())return out;const id=st().usersStaffId;const s=staff(id);if(!s)return out;return out.replace(/<label>สถานะตำแหน่งรายวัน/,`<label>วันเริ่มงาน <input type="date" data-field="hire_date" value="${escAttr(s.hire_date||'')}"></label><label>สถานะตำแหน่งรายวัน`);};
  const oldSaveUsers=window.saveStaffUsers;
  window.saveStaffUsers=async function(){const dates=[...document.querySelectorAll('[data-staff-row]')].map(row=>({id:row.dataset.staffRow,value:row.querySelector('[data-field="hire_date"]')?.value||null})).filter(x=>x.id);const result=await oldSaveUsers();for(const d of dates){const r=await sb.from('staff_profiles').update({hire_date:d.value||null}).eq('id',d.id);if(r.error)return toast(r.error.message);}await window.loadAllData();window.renderPage();toast('บันทึกข้อมูลผู้ใช้งานและวันเริ่มงานแล้ว');return result;};
  const oldProfile=window.renderMyProfilePage;
  window.renderMyProfilePage=function(){const p=st().profile||{};const base=oldProfile();return base.replace('</div>\n        <form id="profileChangeForm"',`<div class="profile-info-list"><div><span>วันเริ่มงาน</span><b>${html(p.hire_date||'-')}</b></div></div></div>\n        <form id="profileChangeForm"`);};
  const oldRenderNav=window.renderNav; window.renderNav=function(){const show=hasTrainingForMe()||isAdmin();const item=NAV_ITEMS.find(x=>x.id==='myTraining');if(item)item.hidden=!show;const hidden=NAV_ITEMS.filter(x=>x.hidden);hidden.forEach(x=>NAV_ITEMS.splice(NAV_ITEMS.indexOf(x),1));oldRenderNav();hidden.forEach(x=>{if(!NAV_ITEMS.some(y=>y.id===x.id)){const i=x.id==='myTraining'?NAV_ITEMS.findIndex(y=>y.id==='schedule'):NAV_ITEMS.length;NAV_ITEMS.splice(i>=0?i:NAV_ITEMS.length,0,x);}});};
  window.addEventListener('load',()=>setTimeout(initSignatureCanvases,300));
})();
