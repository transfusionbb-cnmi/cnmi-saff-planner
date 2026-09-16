/* CNMI Staff Planner V504
 * Physician self-managed leave workflow.
 *
 * Policy:
 * - Physicians manage their own Staff Planner leave directly.
 * - No "ลาในระบบแล้ว" / sibling acknowledgement / Admin HR verification workflow.
 * - Physician can add, edit and remove own records immediately, including old dates.
 * - Removal is a soft delete (status=cancelled) so the audit trail is preserved.
 * - Physician leave still remains authoritative for Consult/RACE/shortage logic while active.
 * - Admin HR pages/pending center exclude physician leave.
 *
 * No schema change / no SQL required.
 */
(function(){
  'use strict';
  const VERSION='V504_PHYSICIAN_SELF_MANAGED_LEAVE';
  if(window.__CNMI_V504_PHYSICIAN_SELF_MANAGED_LEAVE__) return;
  window.__CNMI_V504_PHYSICIAN_SELF_MANAGED_LEAVE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.sb||window.supabaseClient||null;}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function currentId(){try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||null;}catch(_){return S()?.profile?.id||null;}}
  function currentProfile(){const id=currentId();return S()?.profile||(S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||{};}
  function isPhysicianProfile(p){if(window.cnmiPersonTypeV516?.isPhysician)return window.cnmiPersonTypeV516.isPhysician(p);const type=txt(p?.staff_type),role=txt(p?.role),pos=txt(p?.position),job=txt(p?.job_title);if(/นักเทคนิคการแพทย์|เทคนิคการแพทย์/i.test(`${type} ${pos} ${job}`))return false;return /^(แพทย์|physician|doctor)$/i.test(type)||/^(แพทย์|physician|doctor)$/i.test(role)||/^แพทย์(?:$|[\s/()\-]|เวช|ประจำ|ผู้|เฉพาะ)/i.test(pos)||/^แพทย์(?:$|[\s/()\-]|เวช|ประจำ|ผู้|เฉพาะ)/i.test(job);}
  function isCurrentPhysician(){return isPhysicianProfile(currentProfile());}
  function personById(id){return (S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
  function isPhysicianId(id){return isPhysicianProfile(personById(id));}
  function own(row){return String(row?.staff_id||'')===String(currentId()||'');}
  function inactive(row){try{return typeof isLeaveFinalInactive==='function'?!!isLeaveFinalInactive(row):/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}catch(_){return /(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}}
  function toast(msg){try{if(typeof showToast==='function')return showToast(msg);}catch(_){}console.info(`[${VERSION}] ${msg}`);}
  function friendly(err){try{return typeof friendlyDbError==='function'?friendlyDbError(err):txt(err?.message||err);}catch(_){return txt(err?.message||err)||'บันทึกไม่สำเร็จ';}}
  function rerender(){try{if(typeof renderPage==='function')renderPage();}catch(err){console.warn(`[${VERSION}] render`,err);}}
  function busy(v,msg){try{if(typeof setBusy==='function')setBusy(v,msg);}catch(_){} }
  async function confirmSafe(message,title){try{if(typeof confirmDialog==='function')return !!(await confirmDialog(message,title));}catch(_){}return window.confirm(message);}

  /* Physician may always edit their own active record. */
  const previousCanEdit=(()=>{try{return window.canEditOwn||(typeof canEditOwn==='function'?canEditOwn:null);}catch(_){return window.canEditOwn||null;}})();
  if(typeof previousCanEdit==='function'){
    const patched=function canEditOwnV504(row){if(isCurrentPhysician()&&own(row)&&!inactive(row))return true;return previousCanEdit.apply(this,arguments);};
    try{window.canEditOwn=canEditOwn=patched;}catch(_){window.canEditOwn=patched;}
  }

  /* Direct physician save: no roster cut-off, no backdate block, no HR workflow. */
  const previousSaveLeave=(()=>{try{return window.saveLeave||(typeof saveLeave==='function'?saveLeave:null);}catch(_){return window.saveLeave||null;}})();
  if(typeof previousSaveLeave==='function'){
    const patchedSave=async function saveLeaveV504(form){
      if(!isCurrentPhysician()) return previousSaveLeave.apply(this,arguments);
      const db=DB();if(!db)return toast('ระบบฐานข้อมูลยังโหลดไม่สมบูรณ์ กรุณารีเฟรชหน้า');
      const fd=new FormData(form);
      const start=txt(fd.get('start_date')),end=txt(fd.get('end_date'));
      if(!start||!end)return toast('กรุณาระบุวันที่ลา');
      if(end<start)return toast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
      const row={
        staff_id:currentId(),
        type:fd.get('type'),
        start_date:start,
        end_date:end,
        leave_period:fd.get('leave_period')||'เต็มวัน',
        note:fd.get('note'),
        contact_phone:fd.get('contact_phone'),
        updated_by:currentId(),
        status:'active'
      };
      const file=fd.get('file');
      try{if(file&&file.size&&typeof uploadFile==='function')row.attachment_path=await uploadFile(file,'leave');}
      catch(err){return toast('อัปโหลดไฟล์แนบไม่สำเร็จ: '+txt(err?.message||err));}
      const id=S()?.editingLeaveId||null;
      if(id){
        const existing=(S()?.leaves||[]).find(r=>String(r?.id||'')===String(id));
        if(!existing||!own(existing))return toast('แก้ไขได้เฉพาะรายการของตนเอง');
      }
      busy(true,'กำลังบันทึก');
      try{
        const res=id
          ? await db.from('leave_requests').update(row).eq('id',id).eq('staff_id',currentId())
          : await db.from('leave_requests').insert({...row,created_by:currentId()});
        if(res?.error)throw res.error;
        S().editingLeaveId=null;
        try{if(typeof loadAllData==='function')await loadAllData();}catch(err){console.warn(`[${VERSION}] reload`,err);}
        rerender();toast('บันทึกแล้ว • แพทย์จัดการรายการเอง ไม่ต้องตรวจ HR');
      }catch(err){toast(friendly(err));}
      finally{busy(false);}
    };
    try{window.saveLeave=saveLeave=patchedSave;}catch(_){window.saveLeave=patchedSave;}
  }

  async function removeOwn(id){
    if(!isCurrentPhysician())return;
    const row=(S()?.leaves||[]).find(r=>String(r?.id||'')===String(id||''));
    if(!row||!own(row))return toast('ลบได้เฉพาะรายการของตนเอง');
    if(inactive(row))return toast('รายการนี้ถูกลบแล้ว');
    const ok=await confirmSafe('ลบรายการนี้ออกจากตารางของแพทย์?','ลบรายการ');if(!ok)return;
    const db=DB();if(!db)return toast('ระบบฐานข้อมูลยังโหลดไม่สมบูรณ์ กรุณารีเฟรชหน้า');
    busy(true,'กำลังลบรายการ');
    try{
      const q=await db.from('leave_requests').update({status:'cancelled',updated_by:currentId()}).eq('id',id).eq('staff_id',currentId());
      if(q?.error)throw q.error;
      if(String(S()?.editingLeaveId||'')===String(id))S().editingLeaveId=null;
      try{if(typeof loadAllData==='function')await loadAllData();}catch(err){console.warn(`[${VERSION}] reload after remove`,err);}
      rerender();toast('ลบรายการแล้ว');
    }catch(err){toast(friendly(err));}
    finally{busy(false);}
  }

  /* Physician actions: edit / remove immediately. */
  const previousActions=(()=>{try{return window.renderLeaveActions||(typeof renderLeaveActions==='function'?renderLeaveActions:null);}catch(_){return window.renderLeaveActions||null;}})();
  if(typeof previousActions==='function'){
    const patched=function renderLeaveActionsV504(row){
      if(!isCurrentPhysician()||!own(row))return previousActions.apply(this,arguments);
      if(inactive(row))return '<span class="muted">ลบแล้ว</span>';
      return `<button class="tiny-btn" data-edit-leave="${esc(row?.id)}">แก้ไข</button><button class="tiny-btn danger" type="button" data-v504-physician-remove="${esc(row?.id)}">ลบ</button>`;
    };
    try{window.renderLeaveActions=renderLeaveActions=patched;}catch(_){window.renderLeaveActions=patched;}
  }

  /* Remove HC/HR instructions from physician's own leave form. */
  const previousLeavePage=(()=>{try{return window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);}catch(_){return window.renderLeavePage||null;}})();
  if(typeof previousLeavePage==='function'){
    const patched=function renderLeavePageV504(){
      let html=previousLeavePage.apply(this,arguments);
      if(!isCurrentPhysician()||typeof html!=='string')return html;
      try{
        const t=document.createElement('template');t.innerHTML=html;const form=t.content.querySelector('#leaveForm');
        if(form){
          form.querySelectorAll('[data-v333-physician-leave-notice],[data-v480-leave-form-note],[data-v481-leave-form-note],.v480-leave-form-note,.v481-leave-form-note').forEach(el=>el.remove());
          form.querySelectorAll('.notice.soft-notice.wide').forEach(el=>el.remove());
          const note=document.createElement('div');note.className='notice soft-notice wide v504-physician-note';note.setAttribute('data-v504-physician-note','');
          note.innerHTML='<b>สิทธิ์แพทย์:</b> บันทึก แก้ไข และลบรายการของตนเองได้ทันที • ไม่ต้องกด “ลาในระบบแล้ว” และไม่ต้องรอ Admin ตรวจ HR';
          form.insertBefore(note,form.firstChild);
        }
        return t.innerHTML;
      }catch(err){console.warn(`[${VERSION}] leave page decorate`,err);return html;}
    };
    try{window.renderLeavePage=renderLeavePage=patched;}catch(_){window.renderLeavePage=patched;}
  }

  /* Physicians do not get the Staff HC iService reminder card on Dashboard. */
  const previousDashboard=(()=>{try{return window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);}catch(_){return window.renderDashboard||null;}})();
  if(typeof previousDashboard==='function'){
    const patched=function renderDashboardV504(){
      const html=previousDashboard.apply(this,arguments);if(!isCurrentPhysician()||typeof html!=='string')return html;
      try{const t=document.createElement('template');t.innerHTML=html;t.content.querySelectorAll('[data-v481-staff-hr-reminder],[data-v480-leave-reminder]').forEach(el=>el.remove());return t.innerHTML;}
      catch(_){return html;}
    };
    try{window.renderDashboard=renderDashboard=patched;}catch(_){window.renderDashboard=patched;}
  }

  /* Admin HR page must contain staff only, never physician leave. */
  const previousHrPage=(()=>{try{return window.renderHrPage||(typeof renderHrPage==='function'?renderHrPage:null);}catch(_){return window.renderHrPage||null;}})();
  if(typeof previousHrPage==='function'){
    const patched=function renderHrPageV504(){
      const st=S(),oldLeaves=st.leaves,oldStaff=st.staff;
      try{
        st.leaves=(oldLeaves||[]).filter(r=>!isPhysicianId(r?.staff_id));
        st.staff=(oldStaff||[]).filter(p=>!isPhysicianProfile(p));
        return previousHrPage.apply(this,arguments);
      }finally{st.leaves=oldLeaves;st.staff=oldStaff;}
    };
    try{window.renderHrPage=renderHrPage=patched;}catch(_){window.renderHrPage=patched;}
  }

  /* Also exclude physicians from any legacy HR summary API. */
  try{
    if(window.cnmiHrSummaryV437?.pendingRows){
      const prev=window.cnmiHrSummaryV437.pendingRows;
      window.cnmiHrSummaryV437.pendingRows=function(){return (prev.apply(this,arguments)||[]).filter(r=>!isPhysicianId(r?.staff_id));};
    }
  }catch(err){console.warn(`[${VERSION}] HR summary patch`,err);}

  function physicianNames(){
    const set=new Set();(S()?.staff||[]).filter(isPhysicianProfile).forEach(p=>{[p?.nickname,p?.full_name,p?.email].map(txt).filter(Boolean).forEach(x=>set.add(x));});return set;
  }
  function sanitizeAdminPending(){
    try{
      const api=window.cnmiV492,store=api?.store;if(!store||!Array.isArray(store.categories))return false;
      const names=physicianNames();let changed=false;
      store.categories=store.categories.map(c=>{
        if(c?.key!=='hr'||!Array.isArray(c.items))return c;
        const items=c.items.filter(item=>!names.has(txt(item?.title)));
        if(items.length!==c.items.length)changed=true;
        return {...c,items};
      }).filter(c=>!Array.isArray(c?.items)||c.items.length>0);
      return changed;
    }catch(err){console.warn(`[${VERSION}] pending sanitize`,err);return false;}
  }
  let pendingRerender=false;
  const mo=new MutationObserver(()=>{
    if(pendingRerender)return;
    if(sanitizeAdminPending()){
      pendingRerender=true;
      setTimeout(()=>{pendingRerender=false;try{if(String(S()?.page||'')==='dashboard')rerender();}catch(_){}},0);
    }
  });
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){}
  setTimeout(()=>sanitizeAdminPending(),250);

  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('[data-v504-physician-remove]');if(!b)return;
    e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
    if(b.disabled)return;b.disabled=true;
    Promise.resolve(removeOwn(b.getAttribute('data-v504-physician-remove'))).finally(()=>{if(b.isConnected)b.disabled=false;});
  },true);

  const style=document.createElement('style');style.id='cnmi-v504-style';style.textContent=`
    .v504-physician-note{background:#eef8ff!important;border-color:#bee1f6!important;color:#365e77!important}
    .v504-physician-note b{color:#175f88}
  `;document.head.appendChild(style);

  window.cnmiPhysicianLeaveV504={version:VERSION,isCurrentPhysician,isPhysicianId,sanitizeAdminPending};
  console.info(`${VERSION} loaded`);
})();
