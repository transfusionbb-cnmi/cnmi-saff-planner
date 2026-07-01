/* CNMI Staff Planner V314
   Targeted fixes only:
   - Calendar details popup (paired with early preload router)
   - Admin extra-OT uses an explicit actual work date, not HR-cycle start
   - Admin OT edit popup is forced visible and remains editable
   - CH4 cover / no-claim actions use the current shift_confirmations table directly
*/
(function(){
  'use strict';
  const VERSION='V314_ADMIN_OT_CALENDAR_CH4_FIX';
  if(window.__CNMI_V314_ADMIN_OT_CALENDAR_CH4_FIX__) return;
  window.__CNMI_V314_ADMIN_OT_CALENDAR_CH4_FIX__=true;

  function S(){try{return window.state||state||null;}catch(_){return window.state||null;}}
  function esc(value){
    try{
      const fn=window.escapeHtml || (typeof escapeHtml==='function'?escapeHtml:null);
      if(typeof fn==='function') return fn(value==null?'':String(value));
    }catch(_){ }
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normDate(value){
    try{
      const fn=window.normalizeDateKey || (typeof normalizeDateKey==='function'?normalizeDateKey:null);
      if(typeof fn==='function') return String(fn(value)||'').slice(0,10);
    }catch(_){ }
    return String(value||'').slice(0,10);
  }
  function today(){
    try{
      const fn=window.todayStr || (typeof todayStr==='function'?todayStr:null);
      if(typeof fn==='function') return fn();
    }catch(_){ }
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function isAdminSafe(){
    try{
      const fn=window.isAdmin || (typeof isAdmin==='function'?isAdmin:null);
      if(typeof fn==='function') return !!fn();
    }catch(_){ }
    return String(S()?.role||S()?.currentRole||'').toLowerCase()==='admin';
  }
  function currentStaff(){
    try{
      const fn=window.currentStaffId || (typeof currentStaffId==='function'?currentStaffId:null);
      if(typeof fn==='function') return String(fn()||'');
    }catch(_){ }
    return String(S()?.profile?.id||S()?.profile?.staff_id||'');
  }
  function staffName(id){
    try{
      const fn=window.staffNick || (typeof staffNick==='function'?staffNick:null);
      if(typeof fn==='function') return fn(id);
    }catch(_){ }
    const row=(S()?.staff||[]).find(item=>String(item?.id)===String(id))||{};
    return row.nickname||row.full_name||row.email||id||'-';
  }
  function activeStaff(){
    const rows=(S()?.staff||[]).filter(row=>{
      const active=Object.prototype.hasOwnProperty.call(row,'active') ? (row.active===true||String(row.active).toLowerCase()==='true') : (row.is_active!==false&&String(row.is_active).toLowerCase()!=='false');
      const schedule=Object.prototype.hasOwnProperty.call(row,'schedule') ? (row.schedule===true||String(row.schedule).toLowerCase()==='true') : true;
      return active&&schedule;
    });
    try{
      const fn=window.orderedStaff || (typeof orderedStaff==='function'?orderedStaff:null);
      if(typeof fn==='function') return fn(rows);
    }catch(_){ }
    return rows.slice().sort((a,b)=>String(a.nickname||a.full_name||'').localeCompare(String(b.nickname||b.full_name||''),'th'));
  }
  function staffOptions(selected='',exclude=''){
    return `<option value="">เลือกชื่อ</option>`+activeStaff().filter(row=>String(row.id)!==String(exclude||'')).map(row=>`<option value="${esc(row.id)}" ${String(row.id)===String(selected)?'selected':''}>${esc(row.nickname||row.full_name||row.email||row.id)}</option>`).join('');
  }
  function modal(html,opts={}){
    const pre=window.__cnmiV314Preload;
    if(pre?.showModalDom) return pre.showModalDom(html,opts);
    try{
      const fn=window.showModal || (typeof showModal==='function'?showModal:null);
      if(typeof fn==='function') fn(html,opts);
    }catch(_){ }
    const root=document.getElementById('modal');
    const body=document.getElementById('modalBody');
    if(!root||!body) return false;
    if(!String(body.innerHTML||'').trim()) body.innerHTML=html;
    root.classList.remove('hidden','modal-closing');
    root.classList.add('modal-ready');
    root.classList.toggle('modal-sm',!!opts.small);
    root.classList.toggle('modal-lg',!!opts.large);
    document.body.classList.add('modal-open');
    return true;
  }
  function toast(message,tone='error'){
    try{
      const fn=window.showToast || (typeof showToast==='function'?showToast:null);
      if(typeof fn==='function') return fn(message,{tone});
    }catch(_){ }
    modal(`<div class="app-alert ${tone}"><div class="app-alert-icon">${tone==='error'?'!':'✓'}</div><h2>${tone==='error'?'แจ้งเตือน':'สำเร็จ'}</h2><p>${esc(message)}</p><div class="confirm-actions"><button class="primary-btn" type="button" data-app-alert-ok>ตกลง</button></div></div>`,{small:true});
  }
  function busy(on,text='กำลังบันทึก'){
    try{
      const fn=window.setBusy || (typeof setBusy==='function'?setBusy:null);
      if(typeof fn==='function') fn(on,text);
    }catch(_){ }
  }
  async function refresh(){
    try{
      const load=window.loadAllData || (typeof loadAllData==='function'?loadAllData:null);
      if(typeof load==='function') await load();
    }catch(error){console.warn(`[${VERSION}] refresh load`,error);}
    try{
      const render=window.renderPage || (typeof renderPage==='function'?renderPage:null);
      if(typeof render==='function') render();
    }catch(error){console.warn(`[${VERSION}] refresh render`,error);}
  }
  function close(){
    try{
      const fn=window.closeModal || (typeof closeModal==='function'?closeModal:null);
      if(typeof fn==='function') return fn();
    }catch(_){ }
    const root=document.getElementById('modal');
    if(root) root.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
  async function confirmSafe(message,title='ยืนยันการทำรายการ'){
    try{
      const fn=window.confirmDialog || (typeof confirmDialog==='function'?confirmDialog:null);
      if(typeof fn==='function') return await fn(message,title);
    }catch(_){ }
    return window.confirm(message);
  }

  function enhanceAdminOtFormHtml(html){
    if(!isAdminSafe() || !String(html||'').includes('data-admin-simple="1"')) return String(html||'');
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'');
      const form=tpl.content.querySelector('#otForm[data-admin-simple="1"]');
      if(!form) return String(html||'');
      if(!form.querySelector('[name="work_date"]')){
        const label=document.createElement('label');
        label.className='v314-admin-ot-date';
        label.innerHTML=`วันที่ทำ OT จริง <input name="work_date" type="date" value="${esc(S()?.adminOtWorkDateV314||today())}" required><span class="hint">ใช้วันที่ทำ OT จริง ไม่ใช่วันเริ่มรอบเบิก HR</span>`;
        const hours=form.querySelector('[name="requested_hours"]')?.closest('label');
        if(hours) form.insertBefore(label,hours);
        else form.prepend(label);
      }
      if(!form.querySelector('[name="note"]')){
        const reason=form.querySelector('[name="reason"]')?.closest('label');
        const note=document.createElement('label');
        note.className='wide v314-admin-ot-note';
        note.innerHTML='<span>รายละเอียด/หมายเหตุ</span><textarea name="note" rows="2" placeholder="เช่น ประชุมหน่วยย่อย / อยู่แทน ช4 / ปรับยอดเบิก"></textarea>';
        if(reason) reason.insertAdjacentElement('afterend',note); else form.appendChild(note);
      }
      return tpl.innerHTML;
    }catch(error){
      console.warn(`[${VERSION}] form enhancement fallback`,error);
      return String(html||'');
    }
  }

  const previousRenderOtPage=window.renderOtPage || (typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof previousRenderOtPage==='function' && !previousRenderOtPage.__v314){
    const wrapped=function renderOtPageV314(){
      return enhanceAdminOtFormHtml(previousRenderOtPage.apply(this,arguments));
    };
    wrapped.__v314=true;
    window.renderOtPage=wrapped;
    try{renderOtPage=wrapped;}catch(_){ }
  }

  async function safeGps(){
    try{
      const fn=window.getGps || (typeof getGps==='function'?getGps:null);
      if(typeof fn==='function'){
        const result=await fn();
        return result&&typeof result==='object'?result:{};
      }
    }catch(_){ }
    return {};
  }
  async function saveAdminExtraOt(form){
    if(!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น');
    const fd=new FormData(form);
    const staffId=String(fd.get('staff_id')||'').trim();
    const workDate=normDate(fd.get('work_date'));
    const hours=Number(fd.get('requested_hours'));
    const reason=String(fd.get('reason')||'').trim();
    const extra=String(fd.get('note')||'').trim();
    if(!staffId) return toast('กรุณาเลือกเจ้าหน้าที่');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return toast('กรุณาระบุวันที่ทำ OT จริง');
    if(!Number.isFinite(hours)||hours<=0) return toast('กรุณาระบุชั่วโมงที่ต้องการเบิกให้ถูกต้อง');
    if(!reason) return toast('กรุณาระบุเหตุผล');
    const st=S();
    if(st) st.adminOtWorkDateV314=workDate;
    const pos=await safeGps();
    const note=[`จำนวนเวลา OT: ${hours} ชั่วโมง`,extra].filter(Boolean).join(' | ');
    const payload={
      staff_id:staffId,
      work_date:workDate,
      start_time:'00:00',
      end_date:workDate,
      end_time:'00:00',
      reason,
      note,
      status:'รออนุมัติ',
      lat:pos?.lat??null,
      lng:pos?.lng??null,
      accuracy:pos?.accuracy??null,
      device:`${navigator.userAgent} | ${VERSION} admin extra OT`.slice(0,250)
    };
    busy(true,'กำลังบันทึก OT เพิ่ม');
    try{
      if(!window.sb && typeof sb==='undefined') throw new Error('ยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ');
      const client=window.sb || sb;
      let result=await client.from('ot_requests').insert(payload);
      if(result.error){
        const fallback={...payload};
        delete fallback.end_date;
        delete fallback.start_time;
        result=await client.from('ot_requests').insert(fallback);
      }
      if(result.error) throw result.error;
      await refresh();
      toast(`บันทึก OT เพิ่มของ ${staffName(staffId)} วันที่ ${workDate} แล้ว`,'success');
    }catch(error){
      console.error(`[${VERSION}] save admin extra OT`,error);
      toast(error?.message||'บันทึก OT เพิ่มไม่สำเร็จ');
    }finally{busy(false);}
  }

  const previousSaveOtRequest=window.saveOtRequest || (typeof saveOtRequest==='function'?saveOtRequest:null);
  const saveWrapped=async function saveOtRequestV314(form){
    if(isAdminSafe() && form?.matches?.('#otForm[data-admin-simple="1"]')) return saveAdminExtraOt(form);
    if(typeof previousSaveOtRequest==='function') return previousSaveOtRequest(form);
  };
  window.saveOtRequest=saveWrapped;
  try{saveOtRequest=saveWrapped;}catch(_){ }

  function forceModal(){
    const root=document.getElementById('modal');
    const body=document.getElementById('modalBody');
    if(!root||!body||!String(body.innerHTML||'').trim()) return;
    root.classList.remove('hidden','modal-closing');
    root.classList.add('modal-ready');
    document.body.classList.add('modal-open');
    const card=root.querySelector('.modal-card');
    if(card) card.scrollTop=0;
  }
  function openEditOt(id){
    const row=(S()?.otRequests||[]).find(item=>String(item?.id)===String(id));
    if(!row) return toast('ไม่พบรายการ OT นี้ กรุณารีเฟรชหน้า');
    try{
      const fn=window.openEditOtModal || window.openEditModal;
      if(typeof fn!=='function') throw new Error('ไม่พบฟังก์ชันแก้ไข OT');
      fn(id);
      requestAnimationFrame(forceModal);
      setTimeout(forceModal,60);
    }catch(error){
      console.error(`[${VERSION}] open edit OT`,error);
      toast('เปิดหน้าต่างแก้ไข OT ไม่สำเร็จ');
    }
  }

  function assignmentFromKey(key){
    const [id,date,staffId,dutyCode]=String(key||'').split('|');
    return (S()?.rosterAssignments||[]).find(row=>{
      if(id&&String(row?.id||'')===id) return true;
      return normDate(row?.duty_date)===date&&String(row?.staff_id||'')===staffId&&String(row?.duty_code||'')===dutyCode;
    })||null;
  }
  function tableMissingMessage(error){
    const msg=String(error?.message||error||'');
    return /shift_confirmations|relation .* does not exist|schema cache|42P01|PGRST205/i.test(msg);
  }
  async function upsertCh4(assignment,status,coveredBy='',note=''){
    if(!assignment) throw new Error('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า');
    const client=window.sb || (typeof sb!=='undefined'?sb:null);
    if(!client) throw new Error('ยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    const now=new Date().toISOString();
    const base={
      roster_assignment_id:assignment.id||null,
      shift_type:'ช4',
      duty_code:assignment.duty_code||'ช4',
      work_date:normDate(assignment.duty_date),
      owner_staff_id:assignment.staff_id,
      status,
      covered_by_staff_id:coveredBy||null,
      covered_by_name:coveredBy?staffName(coveredBy):null,
      covered_note:note||null,
      note:note||null,
      confirmed_at:now,
      covered_at:status==='covered_by_other'?now:null,
      updated_by:currentStaff(),
      created_by:currentStaff()
    };
    const attempts=[
      {...base},
      (()=>{const p={...base};delete p.covered_by_name;return p;})(),
      (()=>{const p={...base};delete p.roster_assignment_id;delete p.covered_by_name;return p;})(),
      (()=>{const p={...base};delete p.roster_assignment_id;delete p.covered_by_name;delete p.created_by;return p;})()
    ];
    let last=null;
    for(const payload of attempts){
      const result=await client.from('shift_confirmations').upsert(payload,{onConflict:'work_date,owner_staff_id,duty_code'}).select('*').maybeSingle();
      if(!result.error) return result.data||payload;
      last=result.error;
      if(!/column|schema|cache|constraint|conflict|status/i.test(String(result.error?.message||''))) break;
    }
    const lastMessage=String(last?.message||last||'');
    if(tableMissingMessage(last) || /no_claim|status_check|no unique|no unique or exclusion|42P10|23514/i.test(lastMessage)){
      const err=new Error('ฐานข้อมูลสถานะ ช4 ยังไม่พร้อมสำหรับปุ่มนี้ กรุณา Run ไฟล์ supabase_v314_ch4_status_repair.sql ใน Supabase SQL Editor หนึ่งครั้ง');
      err.code='V314_CH4_SQL_REQUIRED';
      throw err;
    }
    throw last||new Error('บันทึกสถานะ ช4 ไม่สำเร็จ');
  }
  function coverModal(key){
    const assignment=assignmentFromKey(key);
    if(!assignment) return toast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า');
    modal(`<div class="v314-ch4-cover-modal"><h2>มีคนอยู่แทน</h2><p class="hint">บันทึกผู้ที่ทำ ช4 แทนเจ้าของเดิม โดยไม่สร้าง OT อัตโนมัติ ผู้ที่อยู่แทนต้องบันทึก OT ตามเวลาจริงแยกต่างหาก</p><form id="ch4CoverFormV314" class="form-grid"><input type="hidden" name="assignment_key" value="${esc(key)}"><label>เจ้าของ ช4 <input value="${esc(staffName(assignment.staff_id))}" disabled></label><label>วันที่ <input value="${esc(normDate(assignment.duty_date))}" disabled></label><label class="wide">ผู้ที่อยู่แทน <select name="covered_by_staff_id" required>${staffOptions('',assignment.staff_id)}</select></label><label class="wide">หมายเหตุ <textarea name="covered_note" rows="3" placeholder="เช่น ปั่นเลือดแทน / อยู่แทนช่วงเย็น"></textarea></label><div class="actions wide"><button class="ghost-btn" type="button" data-close-modal>ยกเลิก</button><button class="primary-btn" type="submit">บันทึกผู้ที่อยู่แทน</button></div></form></div>`,{small:true});
  }
  async function saveCover(form){
    const fd=new FormData(form);
    const assignment=assignmentFromKey(String(fd.get('assignment_key')||''));
    const coveredBy=String(fd.get('covered_by_staff_id')||'').trim();
    const note=String(fd.get('covered_note')||'').trim();
    if(!coveredBy) return toast('กรุณาเลือกผู้ที่อยู่แทน');
    busy(true,'กำลังบันทึกผู้ที่อยู่แทน');
    try{
      await upsertCh4(assignment,'covered_by_other',coveredBy,note||`มีคนอยู่แทน: ${staffName(coveredBy)}`);
      close();
      await refresh();
      toast(`บันทึกแล้ว: ${staffName(coveredBy)} อยู่แทน`,'success');
    }catch(error){
      console.error(`[${VERSION}] save cover`,error);
      toast(error?.message||'บันทึกผู้ที่อยู่แทนไม่สำเร็จ');
    }finally{busy(false);}
  }
  async function runCh4Action(type,key){
    const assignment=assignmentFromKey(key);
    if(!assignment) return toast('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า');
    if(type==='cover') return coverModal(key);
    const isSelf=type==='self';
    const message=isSelf
      ? 'บันทึกว่าทำ ช4 เองใช่ไหม? หากต้องการเบิก OT ต้องบันทึกเวลาจริงแยกต่างหาก'
      : 'บันทึกเป็น “ไม่เบิก / ไม่มีปั่นเลือด” ใช่ไหม? รายการนี้จะไม่เข้า OT และไม่เข้า Export HR';
    const ok=await confirmSafe(message,isSelf?'ยืนยันทำ ช4 เอง':'ยืนยันไม่เบิก');
    if(!ok) return;
    busy(true,'กำลังบันทึกสถานะ ช4');
    try{
      await upsertCh4(assignment,isSelf?'completed_self':'no_claim','',isSelf?'ทำ ช4 เอง':'ไม่เบิก/ไม่มีปั่นเลือด');
      await refresh();
      toast(isSelf?'บันทึกสถานะ ทำ ช4 เอง แล้ว':'บันทึกสถานะ ไม่เบิก/ไม่มีปั่นเลือด แล้ว','success');
    }catch(error){
      console.error(`[${VERSION}] CH4 status`,error);
      toast(error?.message||'บันทึกสถานะ ช4 ไม่สำเร็จ');
    }finally{busy(false);}
  }

  document.addEventListener('change',event=>{
    const input=event.target?.closest?.('#otForm[data-admin-simple="1"] [name="work_date"]');
    if(!input) return;
    const st=S();
    if(st) st.adminOtWorkDateV314=normDate(input.value)||today();
  },true);
  document.addEventListener('submit',event=>{
    if(event.target?.id!=='ch4CoverFormV314') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void saveCover(event.target);
  },true);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-close-modal]')){
      event.preventDefault();
      close();
    }
  },true);

  const style=document.createElement('style');
  style.id='v314-admin-ot-calendar-ch4-style';
  style.textContent=`
    #otForm[data-admin-simple="1"] .v314-admin-ot-date .hint{display:block;margin-top:5px;color:#64748b;font-size:12px}
    .v314-calendar-modal h2{margin:0 0 14px}
    .v314-ch4-cover-modal h2{margin:0 0 8px}
    [data-edit-ot]:not([disabled]),[data-v234-ch4-self],[data-v234-ch4-cover],[data-v234-ch4-no-claim]{touch-action:manipulation}
  `;
  document.head.appendChild(style);

  window.cnmiV314={openEditOt,runCh4Action,saveAdminExtraOt,upsertCh4};
  console.info(`[${VERSION}] loaded`);
})();
