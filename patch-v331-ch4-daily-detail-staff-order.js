/* CNMI Staff Planner V331
   1) Fix CH4 replacement selection/save for Admin and Staff.
   2) Put a duty-detail card directly under today's adjusted assignee.
   3) Sort MT staff by employee code, including trainees/new staff; Mus stays first.
   4) Inactive/resigned staff disappear naturally and remaining staff close ranks.
   Popup functions are not replaced or removed.
*/
(function(){
  'use strict';
  const VERSION='V331_CH4_DAILY_DETAIL_STAFF_ORDER';
  if(window.__CNMI_V331__) return;
  window.__CNMI_V331__=true;

  function st(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){
    try{if(typeof window.escapeHtml==='function')return window.escapeHtml(txt(v));}catch(_){}
    return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function normalizeDate(v){
    try{if(typeof window.normalizeDateKey==='function')return txt(window.normalizeDateKey(v)).slice(0,10);}catch(_){}
    return txt(v).slice(0,10);
  }
  function currentStaffId(){
    try{if(typeof window.currentStaffId==='function')return txt(window.currentStaffId());}catch(_){}
    const s=st(); return txt(s.profile?.staff_id||s.profile?.id);
  }
  function staffName(id){
    const row=(st().staff||[]).find(x=>txt(x?.id)===txt(id))||{};
    return txt(row.nickname||row.full_name||row.email||id||'-');
  }
  function isActive(row){
    const active=Object.prototype.hasOwnProperty.call(row||{},'active')
      ? (row.active===true||txt(row.active).toLowerCase()==='true')
      : (row?.is_active!==false&&txt(row?.is_active).toLowerCase()!=='false');
    const schedule=Object.prototype.hasOwnProperty.call(row||{},'schedule')
      ? (row.schedule===true||txt(row.schedule).toLowerCase()==='true') : true;
    return active&&schedule;
  }
  function employeeCode(row){return txt(row?.employee_code||row?.emp_code||row?.staff_code||row?.code);}
  function isMus(row){
    const nick=txt(row?.nickname).replace(/\s+/g,'');
    const full=txt(row?.full_name).replace(/\s+/g,'');
    return nick==='มัส'||full.includes('ปาริฉัตรอินทร์เกลี้ยง');
  }
  function isMt(row){
    const all=`${txt(row?.staff_type)} ${txt(row?.role)} ${txt(row?.position)} ${txt(row?.profession)}`.toLowerCase();
    return /(^|\s)mt($|\s)|นักเทคนิคการแพทย์|เทคนิคการแพทย์/.test(all);
  }
  function compareCode(a,b){
    const ac=employeeCode(a), bc=employeeCode(b);
    if(ac&&!bc)return -1; if(!ac&&bc)return 1;
    const c=ac.localeCompare(bc,'th',{numeric:true,sensitivity:'base'});
    if(c)return c;
    return staffName(a?.id).localeCompare(staffName(b?.id),'th',{numeric:true});
  }
  function compareV331(a,b){
    if(isMus(a)!==isMus(b))return isMus(a)?-1:1;
    if(isMt(a)!==isMt(b))return isMt(a)?-1:1;
    return compareCode(a,b);
  }
  function orderedV331(list){return [...(list||[])].sort(compareV331);}

  // Override only the shared ordering helper. New/trainee MT are deliberately not separated.
  window.orderedStaff=orderedV331;
  try{orderedStaff=orderedV331;}catch(_){}
  window.compareStaffOrder=compareV331;
  try{compareStaffOrder=compareV331;}catch(_){}

  function activeStaff(){return orderedV331((st().staff||[]).filter(isActive));}
  function assignmentFromKey(key){
    const parts=txt(key).split('|');
    const [id,date,staffId,dutyCode]=parts;
    return (st().rosterAssignments||[]).find(row=>{
      if(id&&txt(row?.id)===id)return true;
      return normalizeDate(row?.duty_date)===date&&txt(row?.staff_id)===staffId&&txt(row?.duty_code)===dutyCode;
    })||null;
  }
  function modal(html){
    try{if(typeof window.showModal==='function')window.showModal(html,{small:true});}catch(_){}
    const root=document.getElementById('modal'),body=document.getElementById('modalBody');
    if(!root||!body)return;
    if(!txt(body.innerHTML))body.innerHTML=html;
    root.classList.remove('hidden','modal-closing'); root.classList.add('modal-ready');
    document.body.classList.add('modal-open');
  }
  function toast(message,tone='error'){
    try{if(typeof window.showToast==='function')return window.showToast(message,{tone});}catch(_){}
    alert(message);
  }
  function closeModalSafe(){
    try{if(typeof window.closeModal==='function')return window.closeModal();}catch(_){}
    document.getElementById('modal')?.classList.add('hidden'); document.body.classList.remove('modal-open');
  }
  function coverModal(key){
    const assignment=assignmentFromKey(key);
    if(!assignment)return toast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า');
    const people=activeStaff().filter(x=>txt(x.id)!==txt(assignment.staff_id));
    const options='<option value="">เลือกผู้ที่อยู่แทน</option>'+people.map(x=>`<option value="${esc(x.id)}">${esc(staffName(x.id))}${employeeCode(x)?` — ${esc(employeeCode(x))}`:''}</option>`).join('');
    const chips=people.map(x=>`<button type="button" class="v331-cover-person" data-v331-cover-person="${esc(x.id)}">${esc(staffName(x.id))}</button>`).join('');
    modal(`<div class="v331-ch4-modal"><h2>เลือกผู้ที่อยู่แทน ช4</h2><p class="hint">เลือกจากรายชื่อหรือแตะปุ่มชื่อด้านล่าง แล้วกดบันทึก</p><form id="ch4CoverFormV331" class="form-grid"><input type="hidden" name="assignment_key" value="${esc(key)}"><label>เจ้าของ ช4 <input value="${esc(staffName(assignment.staff_id))}" disabled></label><label>วันที่ <input value="${esc(normalizeDate(assignment.duty_date))}" disabled></label><label class="wide">ผู้ที่อยู่แทน <select name="covered_by_staff_id" required>${options}</select></label><div class="wide v331-cover-grid">${chips||'<span class="muted">ไม่พบรายชื่อที่เลือกได้</span>'}</div><label class="wide">หมายเหตุ <textarea name="covered_note" rows="3" placeholder="เช่น ปั่นเลือดแทน / อยู่แทนช่วงเย็น"></textarea></label><div class="actions wide"><button class="ghost-btn" type="button" data-close-modal>ยกเลิก</button><button class="primary-btn" type="submit">บันทึกคนอยู่แทน</button></div></form></div>`);
  }
  async function saveCover(form){
    const fd=new FormData(form),assignment=assignmentFromKey(fd.get('assignment_key'));
    const coveredBy=txt(fd.get('covered_by_staff_id')),note=txt(fd.get('covered_note'));
    if(!assignment)return toast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า');
    if(!coveredBy)return toast('กรุณาเลือกผู้ที่อยู่แทน');
    const client=window.sb||(()=>{try{return sb;}catch(_){return null;}})();
    if(!client)return toast('ยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    const now=new Date().toISOString();
    const base={
      roster_assignment_id:assignment.id||null,shift_type:'ช4',duty_code:assignment.duty_code||'ช4',
      work_date:normalizeDate(assignment.duty_date),owner_staff_id:assignment.staff_id,status:'covered_by_other',
      covered_by_staff_id:coveredBy,covered_by_name:staffName(coveredBy),covered_note:note||`มีคนอยู่แทน: ${staffName(coveredBy)}`,
      note:note||`มีคนอยู่แทน: ${staffName(coveredBy)}`,confirmed_at:now,covered_at:now,
      updated_by:currentStaffId(),created_by:currentStaffId()
    };
    const variants=[base,(()=>{const p={...base};delete p.covered_by_name;return p;})(),(()=>{const p={...base};delete p.covered_by_name;delete p.roster_assignment_id;return p;})(),(()=>{const p={...base};delete p.covered_by_name;delete p.roster_assignment_id;delete p.created_by;return p;})()];
    let saved=null,lastError=null;
    try{if(typeof window.setBusy==='function')window.setBusy(true,'กำลังบันทึกคนอยู่แทน');}catch(_){}
    for(const payload of variants){
      const res=await client.from('shift_confirmations').upsert(payload,{onConflict:'work_date,owner_staff_id,duty_code'}).select('*').maybeSingle();
      if(!res.error){saved=res.data||payload;break;}
      lastError=res.error;
      if(!/column|schema|cache|constraint|conflict|unique/i.test(txt(res.error?.message)))break;
    }
    try{if(typeof window.setBusy==='function')window.setBusy(false);}catch(_){}
    if(!saved)return toast(txt(lastError?.message||lastError||'บันทึกคนอยู่แทนไม่สำเร็จ'));
    const s=st();
    if(!Array.isArray(s.shiftConfirmations))s.shiftConfirmations=[];
    s.shiftConfirmations=s.shiftConfirmations.filter(r=>!(normalizeDate(r?.work_date||r?.duty_date)===base.work_date&&txt(r?.owner_staff_id||r?.staff_id)===txt(base.owner_staff_id)&&txt(r?.duty_code||'ช4')===txt(base.duty_code)));
    s.shiftConfirmations.push(saved);
    closeModalSafe();
    try{if(typeof window.renderPage==='function')window.renderPage();}catch(_){}
    toast(`บันทึกแล้ว: ${staffName(coveredBy)} อยู่แทน`,'success');
  }

  function positionRows(){return window.__CNMI_V226_DAILY_POSITION_ROWS__||window.__CNMI_V225_DAILY_POSITION_ROWS__||[];}
  function masterFor(code){
    const s=st();
    for(const list of [s.positionMasters,s.dailyPositionMasters,s.positions,window.DEFAULT_DAILY_POSITIONS]){
      if(!Array.isArray(list))continue;
      const found=list.find(x=>txt(x?.code||x?.position_code)===txt(code)); if(found)return found;
    }
    try{if(typeof window.positionByCode==='function')return window.positionByCode(code)||{};}catch(_){}
    return {};
  }
  function detailText(row,card){
    const code=txt(row?.position_code||row?.code||card?.querySelector('[data-position-code]')?.dataset?.positionCode||card?.querySelector('h3')?.textContent);
    const master=masterFor(code);
    return txt(row?.job_desc||row?.description||master?.job_desc||master?.description)||'ยังไม่ได้ระบุรายละเอียดหน้าที่';
  }
  function enhanceDailyCards(){
    const page=document.querySelector('#pageContent .v225-positions-page,#pageContent .v226-positions-page'); if(!page)return;
    const rows=positionRows();
    const cards=[...page.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card')];
    cards.forEach((card,i)=>{
      let box=card.querySelector(':scope > .v331-duty-detail-card');
      if(!box){box=document.createElement('div');box.className='v331-duty-detail-card';}
      box.innerHTML=`<span>รายละเอียดตำแหน่ง</span><p>${esc(detailText(rows[i]||{},card))}</p>`;
      const adjustment=card.querySelector(':scope > label');
      const change=card.querySelector(':scope > .v322-change-status');
      const anchor=change||adjustment;
      if(anchor){if(box.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',box);}else card.appendChild(box);
    });
  }
  let queued=false;
  function queueEnhance(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhanceDailyCards();});}

  // Window capture runs before the older document capture handler, avoiding its stopImmediatePropagation path.
  window.addEventListener('click',event=>{
    const cover=event.target?.closest?.('[data-v234-ch4-cover]');
    if(cover){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();coverModal(cover.getAttribute('data-v234-ch4-cover'));return;}
    const person=event.target?.closest?.('[data-v331-cover-person]');
    if(person){event.preventDefault();const form=person.closest('form');const select=form?.querySelector('[name="covered_by_staff_id"]');if(select){select.value=person.dataset.v331CoverPerson;form.querySelectorAll('.v331-cover-person').forEach(b=>b.classList.toggle('selected',b===person));}return;}
  },true);
  window.addEventListener('submit',event=>{
    if(event.target?.id!=='ch4CoverFormV331')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void saveCover(event.target);
  },true);

  function install(){
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v331Observer){const ob=new MutationObserver(queueEnhance);ob.observe(root,{childList:true,subtree:true});root.__v331Observer=ob;}
    queueEnhance();
  }
  const style=document.createElement('style');style.id='v331-style';style.textContent=`
    .v331-cover-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px}
    .v331-cover-person{border:1px solid #cfe0ef;background:#fff;border-radius:14px;padding:10px 8px;font:inherit;color:#1979bd;cursor:pointer}
    .v331-cover-person.selected{background:#72bff0;color:#17334a;border-color:#72bff0;font-weight:700}
    .v331-duty-detail-card{display:block;width:100%;box-sizing:border-box;border:1px solid #cfe3f5;background:#f7fbff;border-radius:18px;padding:14px 16px;margin-top:10px}
    .v331-duty-detail-card>span{display:block;font-weight:800;color:#24577b;margin-bottom:5px}
    .v331-duty-detail-card>p{margin:0;white-space:pre-line;line-height:1.55;color:#526a82}
  `;document.head.appendChild(style);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.cnmiV331={orderedV331,coverModal,enhanceDailyCards};
  console.info(`[${VERSION}] loaded`);
})();
