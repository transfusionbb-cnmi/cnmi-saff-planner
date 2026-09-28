
/* Original source: patch-v484-hr-confirm-workflow.js */
try {
/* CNMI Staff Planner V484
 * HR confirmation workflow cleanup.
 *
 * Workflow:
 *   1) Staff records leave in Staff Planner.
 *   2) Staff submits leave in HC iService and presses "ลาในระบบแล้ว".
 *   3) Only then does the leave become an Admin pending task.
 *   4) Admin verifies in HC iService and presses "ตรวจสอบ HR แล้ว".
 *   5) If Admin cannot find it, press "ไม่พบใน HR"; hr_reported_date is
 *      cleared so the Staff reminder returns and asks the staff to fix/reconfirm.
 *
 * No schema change. Requires the existing V481 RPC/view already installed.
 */
(function(){
  'use strict';
  const VERSION='V484_HR_CONFIRM_WORKFLOW';
  const LEAVE_URL='https://www3.ra.mahidol.ac.th/leaveRama/';
  if(window.__CNMI_V484_HR_CONFIRM_WORKFLOW__)return;
  window.__CNMI_V484_HR_CONFIRM_WORKFLOW__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.sb||window.supabaseClient||null;}
  function text(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(text(v)):text(v);}catch(_){return text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function actualAdmin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return text(S()?.profile?.role).toLowerCase()==='admin';}}
  function currentId(){try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||null;}catch(_){return S()?.profile?.id||null;}}
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):true;}catch(_){return true;}}
  function typeOf(row){try{return typeof leaveDisplayType==='function'?text(leaveDisplayType(row)):text(row?.type||row?.leave_type).split(':::')[0];}catch(_){return text(row?.type||row?.leave_type).split(':::')[0];}}
  function periodOf(row){
    const raw=text(row?.leave_period||row?.period||'เต็มวัน');
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw;
  }
  function thaiDate(v){try{return typeof formatThaiDate==='function'?formatThaiDate(v):text(v);}catch(_){return text(v);}}
  function thaiDateTime(v){try{return typeof formatThaiDateTime==='function'?formatThaiDateTime(v):text(v);}catch(_){return text(v);}}
  function rangeOf(row){const a=text(row?.start_date).slice(0,10),b=text(row?.end_date||row?.start_date).slice(0,10);if(!a)return'-';return b&&b!==a?`${thaiDate(a)} – ${thaiDate(b)}`:thaiDate(a);}
  function staffNameSafe(id){try{return typeof staffName==='function'?staffName(id):(typeof staffNick==='function'?staffNick(id):id);}catch(_){return text(id)||'-';}}
  function staffNickSafe(id){try{return typeof staffNick==='function'?staffNick(id):staffNameSafe(id);}catch(_){return staffNameSafe(id);}}
  function reasonOf(row){try{return typeof leaveReasonText==='function'?text(leaveReasonText(row)):text(row?.reason);}catch(_){return text(row?.reason);}}
  function hrFor(row){return (S().hrChecks||[]).find(h=>String(h?.leave_request_id||'')===String(row?.id||''))||null;}
  function isChecked(row){return text(hrFor(row)?.status)==='ตรวจสอบแล้ว';}
  function isReported(row){const h=hrFor(row);return !!h?.hr_reported_date&&text(h?.status)!=='ตรวจสอบแล้ว';}
  function isRetry(row){const h=hrFor(row);return !!h&&!h.hr_reported_date&&text(h.status)==='รอเอกสาร';}
  function realLeave(row){return !!row&&effective(row)&&typeOf(row)!=='ไม่รับเวร';}
  function monthMatch(row,month){if(!month)return true;return text(row?.start_date).startsWith(month)||text(row?.end_date).startsWith(month);}

  function rowsForPage(){
    const staffFilter=text(S().hrFilterStaff||'');
    const monthFilter=text(S().hrFilterMonth||S().monthKey||'');
    return (S().leaves||[])
      .filter(r=>realLeave(r)&&!isChecked(r))
      .filter(r=>!staffFilter||String(r.staff_id)===String(staffFilter))
      .filter(r=>monthMatch(r,monthFilter))
      .sort((a,b)=>{
        const ar=isReported(a)?0:1,br=isReported(b)?0:1;
        if(ar!==br)return ar-br;
        return text(a.start_date).localeCompare(text(b.start_date))||text(a.created_at).localeCompare(text(b.created_at));
      });
  }
  function allAdminActionRows(){
    return (S().leaves||[])
      .filter(r=>realLeave(r)&&!isChecked(r)&&isReported(r))
      .sort((a,b)=>text(a.start_date).localeCompare(text(b.start_date)));
  }

  function staffConfirmHtml(row){
    const h=hrFor(row);
    if(h?.hr_reported_date){
      const time=h?.checked_at?`<small>ยืนยัน ${esc(thaiDateTime(h.checked_at))}</small>`:`<small>ยืนยันวันที่ ${esc(thaiDate(h.hr_reported_date))}</small>`;
      return `<div class="v484-confirm-state is-reported"><span>✓ น้องแจ้งแล้ว</span>${time}</div>`;
    }
    if(isRetry(row))return `<div class="v484-confirm-state is-retry"><span>⚠ ต้องยืนยันใหม่</span><small>Admin ตรวจไม่พบใน HC iService</small></div>`;
    return `<div class="v484-confirm-state is-waiting"><span>ยังไม่แจ้ง</span><small>รอน้องกด “ลาในระบบแล้ว”</small></div>`;
  }
  function hrStatusHtml(row){
    const h=hrFor(row);
    if(h?.hr_reported_date)return `<span class="v484-status is-pending">รอตรวจสอบ HR</span>`;
    if(isRetry(row))return `<span class="v484-status is-retry">ไม่พบใน HR • รอน้องแก้ไข</span>`;
    return `<span class="v484-status is-staff">รอน้องดำเนินการ</span>`;
  }
  function actionHtml(row){
    if(!isReported(row))return `<span class="v484-no-action">— รอน้องยืนยัน —</span>`;
    return `<div class="v484-actions">
      <button type="button" class="v484-verify-btn" data-v484-hr-verify="${esc(row.id)}">✓ ตรวจสอบ HR แล้ว</button>
      <button type="button" class="v484-notfound-btn" data-v484-hr-notfound="${esc(row.id)}">ไม่พบใน HR</button>
    </div>`;
  }
  function leaveHtml(row){
    const t=typeOf(row),p=periodOf(row),reason=reasonOf(row);
    return `<div class="v484-leave-info"><b>${esc(t)}</b><span class="v484-period">${esc(p)}</span><small>${esc(rangeOf(row))}</small>${reason?`<small>เหตุผล: ${esc(reason)}</small>`:''}</div>`;
  }

  function copySummaryText(rows){
    const action=rows.filter(isReported),waiting=rows.filter(r=>!isReported(r));
    const out=[];
    out.push('สรุปสถานะลาใน HC iService','');
    if(action.length){
      out.push(`น้องแจ้งแล้ว รอตรวจ HR ${action.length} รายการ`);
      action.forEach(r=>out.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} ${periodOf(r)} — ${rangeOf(r)}`));
      out.push('');
    }
    if(waiting.length){
      out.push(`รอน้องดำเนินการ ${waiting.length} รายการ`);
      waiting.forEach(r=>out.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} ${periodOf(r)} — ${rangeOf(r)}${isRetry(r)?' — Admin ตรวจไม่พบ กรุณายืนยันใหม่':''}`));
    }
    return out.join('\n').trim();
  }

  function renderHrPageV484(){
    if(!actualAdmin()){
      try{return typeof noPermission==='function'?noPermission():'';}catch(_){return'';}
    }
    const rows=rowsForPage();
    const actionCount=rows.filter(isReported).length;
    const waitingCount=rows.length-actionCount;
    const staffFilter=text(S().hrFilterStaff||'');
    const monthFilter=text(S().hrFilterMonth||S().monthKey||'');
    const staffOptions=(()=>{try{return typeof orderedStaff==='function'?orderedStaff(S().staff||[]):S().staff||[];}catch(_){return S().staff||[];}})();

    const tableRows=rows.map(r=>`<tr class="${isReported(r)?'v484-row-action':'v484-row-waiting'}">
      <td><b>${esc(staffNameSafe(r.staff_id))}</b></td>
      <td>${leaveHtml(r)}</td>
      <td>${staffConfirmHtml(r)}</td>
      <td>${hrStatusHtml(r)}</td>
      <td>${actionHtml(r)}</td>
    </tr>`).join('');
    const cards=rows.map(r=>`<div class="mobile-card v484-hr-card ${isReported(r)?'is-action':'is-waiting'}">
      <div class="section-title"><h3>${esc(staffNickSafe(r.staff_id))}</h3>${hrStatusHtml(r)}</div>
      ${leaveHtml(r)}
      <div class="v484-mobile-line"><b>น้องยืนยัน:</b>${staffConfirmHtml(r)}</div>
      <div class="v484-mobile-action">${actionHtml(r)}</div>
    </div>`).join('');

    return `<div class="card v484-hr-page">
      <div class="section-title v484-title"><div><h3>ตรวจสอบ HR</h3><p class="muted">น้องกด “ลาในระบบแล้ว” ก่อน รายการจึงจะเป็นงานรอตรวจของ Admin</p></div><a class="v484-open-hc" href="${LEAVE_URL}" target="_blank" rel="noopener noreferrer external">เปิด HC iService ↗</a></div>
      <div class="toolbar compact-filter">
        <label>คน <select id="hrFilterStaff"><option value="">ทุกคน</option>${staffOptions.map(s=>`<option value="${esc(s.id)}" ${String(staffFilter)===String(s.id)?'selected':''}>${esc(s.nickname||s.full_name)}</option>`).join('')}</select></label>
        <label>เดือน <input type="month" id="hrFilterMonth" value="${esc(monthFilter)}"></label>
        <button type="button" class="ghost-btn v484-copy" data-v484-copy-summary>คัดลอกสรุปส่ง LINE</button>
      </div>
      <div class="v484-summary-strip">
        <div class="v484-summary-box is-action"><b>${actionCount}</b><span>น้องแจ้งแล้ว • รอตรวจ HR</span></div>
        <div class="v484-summary-box is-waiting"><b>${waitingCount}</b><span>รอน้องดำเนินการ</span></div>
      </div>
      <div class="v484-workflow-note"><b>วิธีใช้:</b> เปิด HC iService จากหน้านี้ → ตรวจรายการของน้อง → ถ้าพบกด “ตรวจสอบ HR แล้ว” • ถ้าไม่พบกด “ไม่พบใน HR” ระบบจะกลับไปเตือนน้องให้อีกครั้ง</div>
      ${rows.length?`<div class="table-wrap desktop-table v484-table"><table><thead><tr><th>เจ้าหน้าที่</th><th>การลา</th><th>น้องยืนยัน</th><th>สถานะ HR</th><th>จัดการ</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="mobile-cards v484-mobile-cards">${cards}</div>`:(typeof empty==='function'?empty('ไม่มีรายการลาตามตัวกรองนี้'):'<div class="empty">ไม่มีรายการลาตามตัวกรองนี้</div>')}
    </div>`;
  }

  try{window.renderHrPage=renderHrPage=renderHrPageV484;}catch(_){window.renderHrPage=renderHrPageV484;}

  /* V460 dashboard Admin center asks V437 for HR pending rows at runtime.
     Return ONLY rows Staff already confirmed in HC iService. */
  try{
    if(window.cnmiHrSummaryV437){
      window.cnmiHrSummaryV437.pendingRows=allAdminActionRows;
      window.cnmiHrSummaryV437.pendingStatus=function(row){
        const h=hrFor(row);
        if(h?.hr_reported_date)return {key:'waiting',label:'น้องแจ้งแล้ว · รอตรวจสอบ HR',tone:'orange',h};
        if(isRetry(row))return {key:'action',label:'ไม่พบใน HR · รอน้องยืนยันใหม่',tone:'red',h};
        return {key:'action',label:'รอน้องดำเนินการ',tone:'gray',h};
      };
    }
    if(window.cnmiV460?.pendingCache){
      window.cnmiV460.pendingCache.status='idle';
      window.cnmiV460.pendingCache.categories=[];
      window.cnmiV460.pendingCache.loadedAt=0;
    }
  }catch(err){console.warn(`[${VERSION}] pending center API`,err);}

  function confirmSafe(message,title){
    try{if(typeof confirmDialog==='function')return Promise.resolve(confirmDialog(message,title)).then(Boolean);}catch(_){ }
    return Promise.resolve(window.confirm(message));
  }
  async function refreshAfterAdminAction(message){
    try{if(typeof loadAllData==='function')await loadAllData();}catch(err){console.warn(`[${VERSION}] loadAllData`,err);}
    try{
      if(window.cnmiV460?.pendingCache){window.cnmiV460.pendingCache.status='idle';window.cnmiV460.pendingCache.loadedAt=0;}
      if(window.cnmiV460?.loadAdminPending)await window.cnmiV460.loadAdminPending(true);
    }catch(err){console.warn(`[${VERSION}] refresh pending`,err);}
    try{if(typeof renderPage==='function')renderPage();}catch(_){ }
    try{if(typeof showToast==='function')showToast(message);}catch(_){ }
  }
  async function verifyHr(leaveId,button){
    if(!actualAdmin())return;
    const leave=(S().leaves||[]).find(r=>String(r?.id||'')===String(leaveId||''));
    const h=leave?hrFor(leave):null;
    if(!leave||!h)return typeof showToast==='function'&&showToast('ไม่พบข้อมูล HR ของรายการนี้');
    if(!h.hr_reported_date)return typeof showToast==='function'&&showToast('น้องยังไม่ได้กด “ลาในระบบแล้ว”');
    const ok=await confirmSafe(`ยืนยันว่าตรวจพบรายการ ${typeOf(leave)} ของ ${staffNickSafe(leave.staff_id)} (${rangeOf(leave)}) ใน HC iService แล้ว?`,'ตรวจสอบ HR แล้ว');
    if(!ok)return;
    const db=DB();if(!db)return;
    const old=button?.textContent;try{if(button){button.disabled=true;button.textContent='กำลังบันทึก…';}}catch(_){ }
    try{
      const q=await db.from('hr_checks').update({status:'ตรวจสอบแล้ว',checked_by:currentId(),checked_at:new Date().toISOString()}).eq('leave_request_id',leave.id).neq('status','ตรวจสอบแล้ว');
      if(q?.error)throw q.error;
      await refreshAfterAdminAction('ตรวจสอบ HR แล้ว');
    }catch(err){console.warn(`[${VERSION}] verify`,err);if(typeof showToast==='function')showToast(text(err?.message||err||'บันทึกไม่สำเร็จ'));}
    finally{try{if(button){button.disabled=false;button.textContent=old||'✓ ตรวจสอบ HR แล้ว';}}catch(_){ }}
  }
  async function markNotFound(leaveId,button){
    if(!actualAdmin())return;
    const leave=(S().leaves||[]).find(r=>String(r?.id||'')===String(leaveId||''));
    const h=leave?hrFor(leave):null;
    if(!leave||!h)return typeof showToast==='function'&&showToast('ไม่พบข้อมูล HR ของรายการนี้');
    const ok=await confirmSafe(`ตรวจไม่พบรายการ ${typeOf(leave)} ของ ${staffNickSafe(leave.staff_id)} (${rangeOf(leave)}) ใน HC iService ใช่หรือไม่?\n\nระบบจะกลับไปเตือนน้องให้ตรวจสอบและกด “ลาในระบบแล้ว” ใหม่`,'ไม่พบใน HR');
    if(!ok)return;
    const db=DB();if(!db)return;
    const old=button?.textContent;try{if(button){button.disabled=true;button.textContent='กำลังบันทึก…';}}catch(_){ }
    try{
      const q=await db.from('hr_checks').update({
        status:'รอเอกสาร',
        hr_reported_date:null,
        checked_by:currentId(),
        checked_at:new Date().toISOString(),
        note:'Admin ตรวจไม่พบใน HC iService กรุณาตรวจสอบ/บันทึกลาในระบบ และกด “ลาในระบบแล้ว” ใหม่'
      }).eq('leave_request_id',leave.id).neq('status','ตรวจสอบแล้ว');
      if(q?.error)throw q.error;
      await refreshAfterAdminAction('ส่งกลับให้น้องตรวจสอบ HC iService ใหม่แล้ว');
    }catch(err){console.warn(`[${VERSION}] not found`,err);if(typeof showToast==='function')showToast(text(err?.message||err||'บันทึกไม่สำเร็จ'));}
    finally{try{if(button){button.disabled=false;button.textContent=old||'ไม่พบใน HR';}}catch(_){ }}
  }

  async function copyText(value){
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value);return;}
    const ta=document.createElement('textarea');ta.value=value;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  }

  document.addEventListener('click',async e=>{
    const verify=e.target?.closest?.('[data-v484-hr-verify]');
    if(verify){e.preventDefault();e.stopPropagation();await verifyHr(verify.getAttribute('data-v484-hr-verify'),verify);return;}
    const nf=e.target?.closest?.('[data-v484-hr-notfound]');
    if(nf){e.preventDefault();e.stopPropagation();await markNotFound(nf.getAttribute('data-v484-hr-notfound'),nf);return;}
    const cp=e.target?.closest?.('[data-v484-copy-summary]');
    if(cp){e.preventDefault();e.stopPropagation();try{await copyText(copySummaryText(rowsForPage()));if(typeof showToast==='function')showToast('คัดลอกสรุปแล้ว');}catch(_){if(typeof showToast==='function')showToast('คัดลอกไม่สำเร็จ');}}
  },true);

  /* If Admin previously pressed "ไม่พบใน HR", V481 naturally makes the Staff
     reminder visible again because hr_reported_date is null. Add an explicit
     reason so Staff knows why it came back. */
  function decorateRetryReminder(root=document){
    if(actualAdmin())return;
    root.querySelectorAll?.('[data-v481-mark-hr]').forEach(btn=>{
      const leaveId=btn.getAttribute('data-v481-mark-hr');
      const leave=(S().leaves||[]).find(r=>String(r?.id||'')===String(leaveId||''));
      if(!leave||!isRetry(leave))return;
      const item=btn.closest('.v481-reminder-item');if(!item||item.querySelector('[data-v484-retry-note], .v481-month-status.is-retry'))return;
      const main=item.querySelector('.v481-reminder-main');
      if(main)main.insertAdjacentHTML('beforeend','<div class="v484-staff-retry" data-v484-retry-note><b>⚠ Admin ตรวจไม่พบใน HC iService</b><span>กรุณาตรวจสอบ/บันทึกลาในระบบให้เรียบร้อย แล้วกด “ลาในระบบแล้ว” อีกครั้ง</span></div>');
    });
  }
  const mo=new MutationObserver(()=>decorateRetryReminder(document));
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  setTimeout(()=>decorateRetryReminder(document),100);
  setTimeout(()=>decorateRetryReminder(document),500);

  const style=document.createElement('style');
  style.id='cnmi-v484-style';
  style.textContent=`
    .v484-title{align-items:flex-start}.v484-title>div{min-width:0}.v484-title p{margin:4px 0 0;font-size:12px}
    .v484-open-hc{display:inline-flex;align-items:center;justify-content:center;padding:9px 12px;border:1px solid #bfe3f8;border-radius:10px;background:#eaf7ff;color:#1675ad;text-decoration:none;font-size:11px;font-weight:900;white-space:nowrap}
    .v484-summary-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.v484-summary-box{display:flex;align-items:baseline;gap:8px;padding:11px 13px;border:1px solid #dce7ef;border-radius:13px;background:#fbfdff}.v484-summary-box b{font-size:24px;color:#2d78aa}.v484-summary-box span{font-size:12px;font-weight:800;color:#566f84}.v484-summary-box.is-action{border-color:#f0d29f;background:#fffaf1}.v484-summary-box.is-action b{color:#b56a0c}.v484-summary-box.is-waiting{background:#f8fafc}
    .v484-workflow-note{margin:0 0 12px;padding:9px 11px;border-radius:10px;background:#f4f8fb;color:#526b7f;font-size:11px;line-height:1.5}.v484-workflow-note b{color:#2f526b}
    .v484-table table{min-width:920px}.v484-table th,.v484-table td{vertical-align:middle}.v484-row-action{background:#fffdf8}.v484-row-waiting{background:#fcfdfe}
    .v484-leave-info{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.v484-leave-info>b{color:#344f64}.v484-leave-info small{display:block;width:100%;color:#75899a;font-size:10px;line-height:1.35}.v484-period{display:inline-flex;padding:3px 7px;border-radius:999px;background:#eaf3ff;color:#275f94;border:1px solid #cfe3f7;font-size:9px;font-weight:900}
    .v484-confirm-state{display:grid;gap:3px}.v484-confirm-state>span,.v484-status{display:inline-flex;width:max-content;max-width:100%;align-items:center;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:900;line-height:1.25}.v484-confirm-state small{font-size:9px;color:#7a8d9d}.v484-confirm-state.is-reported>span{background:#eaf8ef;color:#197348}.v484-confirm-state.is-waiting>span{background:#f1f4f6;color:#647482}.v484-confirm-state.is-retry>span{background:#fff2ed;color:#b34a2d}.v484-status.is-pending{background:#fff4df;color:#9b5c05}.v484-status.is-staff{background:#f1f4f6;color:#647482}.v484-status.is-retry{background:#fff0ef;color:#b13a33}
    .v484-actions{display:flex;gap:6px;flex-wrap:wrap}.v484-actions button{appearance:none;border-radius:9px;padding:7px 9px;font:inherit;font-size:10px;font-weight:900;cursor:pointer}.v484-verify-btn{border:1px solid #9fd7b7;background:#eaf8ef;color:#197348}.v484-notfound-btn{border:1px solid #f1c1bd;background:#fff5f4;color:#b13c34}.v484-actions button:disabled{opacity:.55;cursor:wait}.v484-no-action{color:#8a99a5;font-size:10px;font-weight:700}.v484-copy{margin-left:auto}
    .v484-mobile-cards{display:none}.v484-mobile-line{display:grid;gap:5px}.v484-mobile-line>b{color:#536a7d}.v484-mobile-action{padding-top:4px}.v484-hr-card.is-action{border-color:#f0d29f;background:#fffdf9}.v484-staff-retry{display:grid;gap:2px;margin-top:3px;padding:7px 9px;border:1px solid #ffc9c3;border-radius:9px;background:#fff3f1}.v484-staff-retry b{color:#ae3d32;font-size:10px}.v484-staff-retry span{color:#8f554f;font-size:9px;line-height:1.4}
    @media(max-width:820px){
      .v484-title{gap:9px}.v484-title h3{font-size:19px}.v484-title p{font-size:11px;line-height:1.4}.v484-open-hc{padding:8px 9px;font-size:10px}
      .v484-summary-strip{gap:7px}.v484-summary-box{padding:9px 10px;display:grid;gap:2px}.v484-summary-box b{font-size:22px}.v484-summary-box span{font-size:10px;line-height:1.3}
      .v484-workflow-note{font-size:10px}.v484-table{display:none!important}.v484-mobile-cards{display:grid!important;gap:9px}.v484-hr-card{gap:9px}.v484-hr-card .section-title{align-items:center}.v484-hr-card .section-title h3{font-size:17px}.v484-leave-info>b{font-size:13px}.v484-leave-info small{font-size:11px}.v484-period{font-size:10px}.v484-confirm-state>span,.v484-status{font-size:10px}.v484-confirm-state small{font-size:10px}.v484-actions{display:grid;grid-template-columns:1fr 1fr}.v484-actions button{font-size:11px;padding:9px 8px}.v484-no-action{display:block;text-align:center;padding:8px;font-size:11px}.v484-copy{margin-left:0;width:100%}.v484-staff-retry b{font-size:11px}.v484-staff-retry span{font-size:10px}
    }
  `;
  document.head.appendChild(style);

  window.cnmiHrWorkflowV484={version:VERSION,rowsForPage,allAdminActionRows,isReported,isRetry};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v484-hr-confirm-workflow.js", error); }
;

/* Original source: patch-v487-activity-multi-attachments.js */
try {
/* CNMI Staff Planner V487
 * Activity attachments UX
 * - View activity attachments from activity search cards and Dashboard activity cards.
 * - Supports legacy single attachment_path and V487 multi-file JSON values.
 * - No schema change: multi-file metadata is stored in the existing attachment_path text field.
 */
(function(){
  'use strict';
  if(window.__CNMI_V487_ACTIVITY_MULTI_ATTACHMENTS__) return;
  window.__CNMI_V487_ACTIVITY_MULTI_ATTACHMENTS__=true;

  const S=()=>window.state||state;
  const DB=()=>window.sb||sb;
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function fallbackParse(value){
    if(!value) return [];
    if(Array.isArray(value)) return value.map(normalize).filter(Boolean);
    if(typeof value==='object'){const one=normalize(value);return one?[one]:[];}
    const raw=String(value||'').trim();
    if(!raw) return [];
    if(/^[\[{]/.test(raw)){
      try{const parsed=JSON.parse(raw),list=Array.isArray(parsed)?parsed:[parsed];return list.map(normalize).filter(Boolean);}catch(_){}
    }
    const one=normalize(raw);return one?[one]:[];
  }
  function normalize(item,index=0){
    if(!item) return null;
    if(typeof item==='string') return {path:item,name:nameFromPath(item,index),mime:''};
    const path=String(item.path||item.attachment_path||item.url||'').trim();
    if(!path) return null;
    return {path,name:String(item.name||item.file_name||nameFromPath(path,index)).trim(),mime:String(item.mime||item.type||'').trim()};
  }
  function nameFromPath(path,index=0){
    const raw=String(path||'').split('?')[0].split('/').pop()||'';
    const clean=raw.replace(/^\d+_/,'').replace(/_+/g,' ').trim();
    return clean&&/[A-Za-z0-9ก-๙]/.test(clean)?clean:`ไฟล์แนบ ${index+1}`;
  }
  function parse(value){
    try{return window.cnmiActivityAttachmentsV487?.parse?window.cnmiActivityAttachmentsV487.parse(value):fallbackParse(value);}catch(_){return fallbackParse(value);}
  }
  function activityById(id){return (S().activities||[]).find(row=>String(row.id)===String(id));}

  async function openAttachment(activityId,index){
    const row=activityById(activityId);
    if(!row) throw new Error('ไม่พบกิจกรรมนี้ กรุณารีเฟรชแล้วลองอีกครั้ง');
    const files=parse(row.attachment_path),file=files[Number(index)];
    if(!file?.path) throw new Error('ไม่พบไฟล์แนบนี้');
    const path=String(file.path).trim();
    if(/^https?:\/\//i.test(path)){window.open(path,'_blank','noopener,noreferrer');return;}

    // Open a blank tab synchronously so iPhone/iPad/Safari does not block the popup after await.
    const preview=window.open('about:blank','_blank');
    try{
      if(preview){preview.document.title='กำลังเปิดไฟล์แนบ…';preview.document.body.innerHTML='<div style="font:16px system-ui;padding:24px">กำลังเปิดไฟล์แนบ…</div>';}
      const clean=path.replace(/^staff-files\//,'').replace(/^\/+/, '');
      const res=await DB().storage.from('staff-files').download(clean);
      if(res.error) throw res.error;
      const url=URL.createObjectURL(res.data);
      if(preview){preview.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),120000);}
      else{
        const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click();setTimeout(()=>URL.revokeObjectURL(url),120000);
      }
    }catch(err){
      try{preview?.close();}catch(_){}
      throw err;
    }
  }

  function buttonsFor(row,compact=false){
    const files=parse(row?.attachment_path);
    if(!files.length) return '';
    return `<div class="v487-dashboard-files ${compact?'is-compact':''}">${files.map((file,index)=>`<button type="button" class="tiny-btn v487-view-file-btn" data-v487-open-activity-file="${esc(row.id)}:${index}" title="${esc(file.name||`ไฟล์แนบ ${index+1}`)}">📎 ${compact?`ไฟล์ ${index+1}`:`${esc(file.name||`ดูไฟล์ ${index+1}`)}`}</button>`).join('')}</div>`;
  }

  function decorateDashboard(){
    document.querySelectorAll('.v397-activity-item').forEach(item=>{
      if(item.querySelector('.v487-dashboard-files')) return;
      const title=String(item.querySelector('b')?.textContent||'').trim();
      if(!title) return;
      const rows=(S().activities||[]).filter(row=>String(row.title||'').trim()===title && parse(row.attachment_path).length);
      if(!rows.length) return;
      // Usually one visible activity corresponds to one row. If titles repeat, show unique files from the first matching row.
      const html=buttonsFor(rows[0],true);
      if(html) item.insertAdjacentHTML('beforeend',html);
    });
  }

  function decorateForm(){
    const input=document.querySelector('#activityForm input[name="file"]');
    if(!input) return;
    input.multiple=true;
    const label=input.closest('label');
    if(label&&!label.querySelector('.v487-upload-hint')){
      const hint=document.createElement('small');hint.className='hint v487-upload-hint';hint.textContent='เลือกพร้อมกันได้หลายไฟล์ และกลับมาแก้ไขเพื่อเพิ่มไฟล์ภายหลังได้';label.appendChild(hint);
    }
  }

  function decorate(){decorateForm();decorateDashboard();}

  document.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-v487-open-activity-file]');
    if(!btn) return;
    e.preventDefault();e.stopPropagation();
    const raw=String(btn.getAttribute('data-v487-open-activity-file')||'');
    const cut=raw.lastIndexOf(':');
    if(cut<0) return;
    const activityId=raw.slice(0,cut),index=Number(raw.slice(cut+1));
    btn.disabled=true;
    const oldText=btn.textContent;
    btn.textContent='กำลังเปิด…';
    try{await openAttachment(activityId,index);}catch(err){if(typeof showToast==='function')showToast('เปิดไฟล์แนบไม่สำเร็จ: '+(err?.message||String(err)));}
    finally{btn.disabled=false;btn.textContent=oldText;}
  },true);

  let queued=false;
  const queue=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});};
  const observer=new MutationObserver(queue);
  function start(){decorate();observer.observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  const style=document.createElement('style');
  style.textContent=`
    .v487-attachment-field{display:block}.v487-existing-files{margin-top:8px;padding:9px;border:1px solid #dbe8f4;border-radius:12px;background:#f8fbfe}.v487-existing-title{font-weight:800;margin-bottom:6px;color:#445d73}.v487-existing-file{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 0;border-top:1px dashed #e1eaf1}.v487-existing-file:first-of-type{border-top:0}.v487-file-name{min-width:0;flex:1;overflow-wrap:anywhere;color:#4b6074;font-size:.84rem}.v487-keep-file{display:flex!important;align-items:center;gap:5px!important;font-size:.78rem!important;color:#5c6f82!important}.v487-keep-file input{width:auto!important;min-height:0!important}.v487-upload-hint{display:block;margin-top:5px;line-height:1.35}.v487-file-buttons,.v487-dashboard-files{display:flex;gap:6px;flex-wrap:wrap}.v487-view-file-btn{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v487-dashboard-files{margin-top:7px}.v487-dashboard-files.is-compact .v487-view-file-btn{font-size:12px;padding:5px 8px}.v487-activity-files b{font-weight:400}
    @media(max-width:760px){.v487-existing-file{align-items:flex-start}.v487-file-name{flex-basis:100%;order:3}.v487-view-file-btn{max-width:100%}.v487-dashboard-files.is-compact .v487-view-file-btn{min-height:34px}}
  `;
  document.head.appendChild(style);
  console.info('[V487_ACTIVITY_MULTI_ATTACHMENTS] loaded');
})();

} catch (error) { console.error("[v569] patch-v487-activity-multi-attachments.js", error); }
;

/* Original source: patch-v488-training-position-shortage.js */
try {
/* CNMI Staff Planner V488
 * Full-day training -> show position shortage for daytime staff and physician consult.
 * No database/schema changes.
 */
(function () {
  'use strict';

  const VERSION = 'V488';
  const FULL_DAY_MINUTES = 360; // 6 hours: includes common 09:00-16:00 training days.
  const POSITION_CODES_RE = /\b(?:BB|DR)-[A-Za-z0-9+& -]+/i;

  function norm(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function parseParticipantIds(v) {
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return [];
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch (_) {}
      return s.split(',').map(x => x.trim()).filter(Boolean);
    }
    return [];
  }

  function minutes(t) {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function durationMinutes(start, end) {
    const a = minutes(start), b0 = minutes(end);
    if (a == null || b0 == null) return 0;
    let b = b0;
    if (b <= a) b += 24 * 60;
    return b - a;
  }

  function isFullDayTraining(a) {
    if (!a || norm(a.event_type) !== 'อบรม') return false;
    const dur = durationMinutes(a.start_time, a.end_time);
    if (dur >= FULL_DAY_MINUTES) return true;
    const st = minutes(a.start_time), en = minutes(a.end_time);
    return st != null && en != null && st <= 9 * 60 && en >= 15 * 60 + 30;
  }

  function inDateRange(date, start, end) {
    const d = String(date || '');
    return !!d && (!start || d >= String(start)) && (!end || d <= String(end));
  }

  const THAI_MONTHS = {
    'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
    'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12
  };
  function pad2(n) { return String(n).padStart(2, '0'); }

  function parseThaiDateText(s) {
    const m = norm(s).match(/(\d{1,2})\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+(\d{4})/);
    if (!m) return '';
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return `${y}-${pad2(THAI_MONTHS[m[2]])}-${pad2(Number(m[1]))}`;
  }

  function dashboardDate() {
    try {
      const keys = ['dashboardDate', 'dashboardSelectedDate', 'selectedDashboardDate', 'dashboardDateKey', 'selectedDate'];
      for (const k of keys) {
        const v = (typeof state !== 'undefined' && state) ? state[k] : null;
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        if (v instanceof Date && !Number.isNaN(v.getTime())) {
          return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
        }
      }
    } catch (_) {}

    const root = document.getElementById('pageContent');
    if (root) {
      const dateInputs = Array.from(root.querySelectorAll('input[type="date"]'));
      for (const input of dateInputs) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(input.value || '')) return input.value;
      }
    }
    const title = document.getElementById('pageTitle');
    const parsedTitle = parseThaiDateText(title ? title.textContent : '');
    if (parsedTitle) return parsedTitle;
    const parsedRoot = parseThaiDateText(root ? root.textContent : '');
    if (parsedRoot) return parsedRoot;

    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  }

  function exactTextElements(root, text) {
    if (!root || !text) return [];
    const out = [];
    const all = root.querySelectorAll('span,button,b,strong,small,p,div,td');
    for (const el of all) {
      if (norm(el.textContent) === text) out.push(el);
    }
    return out;
  }

  function findSectionRoot(root, headingText) {
    if (!root) return null;
    const heads = Array.from(root.querySelectorAll('h1,h2,h3,h4,b,strong,div'))
      .filter(el => norm(el.textContent) === headingText || norm(el.textContent).startsWith(headingText));
    for (const h of heads) {
      let n = h;
      while (n && n !== root) {
        if (n.classList && n.classList.contains('card')) return n;
        n = n.parentElement;
      }
    }
    return null;
  }

  function closestPositionCard(nameEl, root) {
    let n = nameEl;
    while (n && n !== root) {
      const t = norm(n.textContent);
      if (POSITION_CODES_RE.test(t) && t.length < 420) return n;
      n = n.parentElement;
    }
    return null;
  }

  function closestConsultCard(nameEl, root) {
    let n = nameEl;
    while (n && n !== root) {
      const t = norm(n.textContent);
      if (/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/.test(t) && /(Donor|Blood Bank|Donor\s*&\s*BB)/i.test(t) && t.length < 500) return n;
      n = n.parentElement;
    }
    return null;
  }

  function addStatus(card, training, doctorMode) {
    if (!card || card.querySelector(':scope > .v488-training-shortage')) return;
    if (/ลาทั้งวัน|ลาครึ่ง|ตำแหน่งขาด|ขาดช่วง/.test(norm(card.textContent))) return;

    card.classList.add('v488-training-missing-card');
    const row = document.createElement('div');
    row.className = 'v488-training-shortage';
    const title = norm(training && training.title);
    row.innerHTML = `<span class="badge blue v488-training-badge" title="${escapeAttr(title || 'อบรมทั้งวัน')}">🎓 อบรมทั้งวัน</span><span class="badge red v488-missing-badge">⚠ ${doctorMode ? 'Consult ขาด' : 'ตำแหน่งขาด'}</span>`;
    card.appendChild(row);
  }

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function trainingOverlapsConsult(training, card) {
    const m = norm(card.textContent).match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
    if (!m) return true;
    const ts = minutes(training.start_time), te0 = minutes(training.end_time);
    let cs = minutes(m[1]), ce = minutes(m[2]);
    if (ts == null || te0 == null || cs == null || ce == null) return true;
    let te = te0;
    if (te <= ts) te += 1440;
    if (ce <= cs) ce += 1440;
    // Compare daytime interval and, if consult crosses midnight, its same-day portion.
    return Math.max(ts, cs) < Math.min(te, ce);
  }

  function restorePrevious() {
    document.querySelectorAll('.v488-training-shortage').forEach(el => el.remove());
    document.querySelectorAll('.v488-training-missing-card').forEach(el => el.classList.remove('v488-training-missing-card'));
    document.querySelectorAll('[data-v488-original-text]').forEach(el => {
      el.textContent = el.dataset.v488OriginalText;
      delete el.dataset.v488OriginalText;
    });
    document.querySelectorAll('.v488-summary-training').forEach(el => el.remove());
  }

  function leafWithRegex(root, re) {
    if (!root) return null;
    const els = Array.from(root.querySelectorAll('span,small,b,strong,div'));
    return els.find(el => el.children.length === 0 && re.test(norm(el.textContent))) || null;
  }

  function decrementReadyText(root, count, regex) {
    if (!root || !count) return;
    const el = leafWithRegex(root, regex);
    if (!el) return;
    const text = norm(el.textContent);
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return;
    if (!el.dataset.v488OriginalText) el.dataset.v488OriginalText = el.textContent;
    const ready = Math.max(0, Number(m[1]) - count);
    el.textContent = text.replace(/\d+\s*\/\s*\d+/, `${ready}/${m[2]}`);
  }

  function nearestReadyGroup(card, sectionRoot) {
    let n = card && card.parentElement;
    while (n && n !== sectionRoot) {
      if (/พร้อม\s*\d+\s*\/\s*\d+/.test(norm(n.textContent))) return n;
      n = n.parentElement;
    }
    return null;
  }

  function findStaffById(id) {
    try {
      return (state.staff || []).find(s => String(s.id) === String(id));
    } catch (_) { return null; }
  }

  function staffLabel(st) {
    return norm(st && (st.nickname || st.full_name));
  }

  function decorate() {
    const root = document.getElementById('pageContent');
    if (!root) return;
    const pageTitle = norm(document.getElementById('pageTitle')?.textContent);
    if (!pageTitle.includes('ภาพรวม')) return;

    restorePrevious();

    const date = dashboardDate();
    let activities = [];
    try { activities = Array.isArray(state.activities) ? state.activities : []; } catch (_) {}
    const trainings = activities.filter(a => inDateRange(date, a.start_date, a.end_date) && isFullDayTraining(a));
    if (!trainings.length) return;

    const participantMap = new Map(); // staff id -> first matching training
    for (const a of trainings) {
      for (const id of parseParticipantIds(a.participant_ids)) {
        if (!participantMap.has(String(id))) participantMap.set(String(id), a);
      }
    }
    if (!participantMap.size) return;

    const signature = date + '|' + Array.from(participantMap.entries())
      .map(([id, a]) => `${id}:${a.id || a.title || ''}:${a.start_time || ''}-${a.end_time || ''}`)
      .sort().join('|');
    const hasDecoration = !!root.querySelector('.v488-training-shortage, .v488-summary-training');
    if (root.dataset.v488TrainingSignature === signature && hasDecoration) return;
    root.dataset.v488TrainingSignature = signature;

    const posRoot = findSectionRoot(root, 'ตำแหน่งกลางวัน');
    const consultRoot = findSectionRoot(root, 'แพทย์ Consult');

    let positionMissing = 0;
    const groupCounts = new Map();
    const positionMarkedStaff = new Set();

    if (posRoot) {
      for (const [id, training] of participantMap.entries()) {
        const st = findStaffById(id);
        const label = staffLabel(st);
        if (!label) continue;
        const matches = exactTextElements(posRoot, label);
        for (const el of matches) {
          const card = closestPositionCard(el, posRoot);
          if (!card) continue;
          if (card.querySelector('.v488-training-shortage')) continue;
          addStatus(card, training, false);
          if (!card.querySelector('.v488-training-shortage')) continue;
          positionMissing += 1;
          positionMarkedStaff.add(id);
          const group = nearestReadyGroup(card, posRoot);
          if (group) groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
          break;
        }
      }

      groupCounts.forEach((count, group) => decrementReadyText(group, count, /พร้อม\s*\d+\s*\/\s*\d+/));
      decrementReadyText(posRoot, positionMarkedStaff.size, /พร้อมปฏิบัติงาน\s*\d+\s*\/\s*\d+/);

      if (positionMarkedStaff.size) {
        const readyEl = leafWithRegex(posRoot, /พร้อมปฏิบัติงาน\s*\d+\s*\/\s*\d+/);
        const holder = readyEl && readyEl.parentElement;
        if (holder && !holder.querySelector('.v488-summary-training')) {
          const chip = document.createElement('span');
          chip.className = 'badge blue v488-summary-training';
          chip.textContent = `อบรม ${positionMarkedStaff.size}`;
          holder.appendChild(chip);
        }
      }
    }

    let consultMissing = 0;
    if (consultRoot) {
      const markedCards = new Set();
      for (const [id, training] of participantMap.entries()) {
        const st = findStaffById(id);
        const label = staffLabel(st);
        if (!label) continue;
        const matches = exactTextElements(consultRoot, label);
        for (const el of matches) {
          const card = closestConsultCard(el, consultRoot);
          if (!card || markedCards.has(card) || !trainingOverlapsConsult(training, card)) continue;
          addStatus(card, training, true);
          if (card.querySelector('.v488-training-shortage')) {
            markedCards.add(card);
            consultMissing += 1;
          }
        }
      }
      decrementReadyText(consultRoot, consultMissing, /พร้อม\s*\d+\s*\/\s*\d+/);
    }
  }

  function installStyle() {
    if (document.getElementById('v488-style')) return;
    const style = document.createElement('style');
    style.id = 'v488-style';
    style.textContent = `
      .v488-training-missing-card{box-shadow:inset 0 0 0 2px rgba(239,68,68,.16);background:linear-gradient(0deg,rgba(255,247,247,.88),rgba(255,255,255,.98))!important}
      .v488-training-shortage{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px}
      .v488-training-shortage .badge{font-weight:700}
      .v488-summary-training{margin-left:6px}
      @media(max-width:820px){.v488-training-shortage{gap:5px;margin-top:6px}.v488-training-shortage .badge{font-size:12px;padding:5px 8px}}
    `;
    document.head.appendChild(style);
  }

  installStyle();

  let queued = false;
  function scheduleDecorate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      try { decorate(); } catch (err) { console.warn(VERSION, err); }
    });
  }

  try {
    if (typeof renderPage === 'function') {
      const baseRenderPage = renderPage;
      renderPage = function (...args) {
        const out = baseRenderPage.apply(this, args);
        scheduleDecorate();
        setTimeout(scheduleDecorate, 80);
        return out;
      };
    }
  } catch (_) {}

  const observeTarget = document.getElementById('pageContent') || document.body;
  if (observeTarget && window.MutationObserver) {
    const mo = new MutationObserver(() => scheduleDecorate());
    mo.observe(observeTarget, { childList: true, subtree: true });
  }
  setTimeout(scheduleDecorate, 150);
})();

} catch (error) { console.error("[v569] patch-v488-training-position-shortage.js", error); }
;

/* Original source: patch-v492-admin-pending-manual-authoritative.js */
try {
/* CNMI Staff Planner V492
 * Admin pending panel — authoritative manual refresh.
 *
 * Why this patch exists:
 * - Older V460 builds could auto-load/carry old HR pending rows into Dashboard.
 * - HR rows that still say "ยังไม่ลง HR" are Staff work, not Admin work.
 *
 * V492 uses a NEW patch filename so browser/PWA caches cannot silently keep an old
 * implementation of patch-v460. It also suppresses V460's automatic idle-load and
 * replaces the Dashboard panel with a V492-owned manual panel.
 *
 * Admin HR pending = only hr_checks rows with hr_reported_date present and status
 * not checked/cancelled. No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V492_ADMIN_PENDING_MANUAL_AUTHORITATIVE';
  if(window.__CNMI_V492_ADMIN_PENDING_MANUAL_AUTHORITATIVE__)return;
  window.__CNMI_V492_ADMIN_PENDING_MANUAL_AUTHORITATIVE__=true;

  const store={status:'idle',error:'',categories:[],loadedAt:0,promise:null};

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function monthOf(v){return norm(v).slice(0,7);}
  function actualAdmin(){try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function onDashboard(){return String(S()?.page||'')==='dashboard';}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function thaiDate(v){try{return typeof formatThaiDate==='function'?formatThaiDate(v):v;}catch(_){return v;}}
  function safeRows(res){return !res?.error&&Array.isArray(res?.data)?res.data:[];}

  function suppressLegacyAutoLoad(){
    try{
      const legacy=window.cnmiV460?.pendingCache;
      if(legacy&&legacy.status==='idle') legacy.status='v492-manual-idle';
    }catch(_){ }
  }

  async function freshHrCategory(db){
    /* V514: Read the same safe HR status source used by the Staff HC iService card.
       After V479, public.hr_checks remains private by design; querying it directly here
       can return zero rows under RLS even though hr_check_status_public correctly shows
       "ลาในระบบแล้ว / รอ Admin".  Admin pending only needs these three safe fields. */
    const hrRes=await db.from('hr_check_status_public')
      .select('leave_request_id,status,hr_reported_date')
      .limit(1000);
    if(hrRes?.error)throw hrRes.error;
    const hrRows=safeRows(hrRes);

    const pending=hrRows.filter(h=>{
      const status=String(h?.status||'').trim();
      const reported=String(h?.hr_reported_date||'').trim();
      return !!reported && status!=='ตรวจสอบแล้ว' && status!=='ยกเลิก' && status!=='cancelled';
    });
    if(!pending.length)return null;

    const ids=[...new Set(pending.map(h=>String(h?.leave_request_id||'')).filter(Boolean))];
    const leaves=[];
    for(let i=0;i<ids.length;i+=80){
      const q=await db.from('leave_requests').select('*').in('id',ids.slice(i,i+80));
      if(q?.error)throw q.error;
      leaves.push(...(q.data||[]));
    }
    const lmap=new Map(leaves.map(r=>[String(r?.id||''),r]));
    const items=pending.map(h=>{
      const r=lmap.get(String(h?.leave_request_id||''));
      if(!r)return null;
      /* Physician leave is self-managed and must never enter Admin HR work. */
      try{if(window.cnmiPhysicianLeaveV504?.isPhysicianId?.(r.staff_id))return null;}catch(_){ }
      const type=String(r.type||r.leave_type||'ลา').split(':::')[0].trim()||'ลา';
      const period=String(r.period||r.leave_period||'').trim();
      const date=norm(r.start_date);
      return {
        id:r.id,page:'hr',month:monthOf(date),date,
        title:staffName(r.staff_id),
        detail:`${type}${period?` · ${period}`:''}${date?` · ${thaiDate(date)}`:''} · น้องแจ้งแล้ว · รอตรวจสอบ HR`
      };
    }).filter(Boolean);
    return items.length?{key:'hr',label:'ตรวจ HR',tone:'gray',items}:null;
  }

  async function loadFresh(){
    if(!actualAdmin())return [];
    if(store.status==='loading')return store.promise||[];
    const db=DB();
    if(!db){store.status='error';store.error='เชื่อมต่อ Supabase ไม่สำเร็จ';rerender();return[];}
    store.status='loading';store.error='';store.categories=[];rerender();
    const p=(async()=>{
      try{
        // Reuse legacy loader for non-HR categories only. Even if an older cached V460
        // is present, its HR category is discarded below and rebuilt from fresh DB rows.
        let base=[];
        try{
          if(window.cnmiV460?.loadAdminPending){
            const result=await window.cnmiV460.loadAdminPending(true);
            if(Array.isArray(result))base=result;
          }
        }catch(err){console.warn('[V492] legacy non-HR loader',err);}
        base=(base||[]).filter(c=>c&&c.key!=='hr');
        const hr=await freshHrCategory(db);
        store.categories=[...base,...(hr?[hr]:[])].filter(c=>Array.isArray(c.items)&&c.items.length);
        store.status='loaded';store.loadedAt=Date.now();
        // Keep legacy cache from becoming the visual source again.
        try{
          const legacy=window.cnmiV460?.pendingCache;
          if(legacy){legacy.status='v492-manual-idle';legacy.categories=[];legacy.loadedAt=0;}
        }catch(_){ }
        return store.categories;
      }catch(err){
        store.status='error';store.error=String(err?.message||err||'โหลดรายการไม่สำเร็จ');
        console.warn('[V492] manual pending refresh',err);return[];
      }finally{store.promise=null;rerender();}
    })();
    store.promise=p;return p;
  }

  function panelHtml(){
    if(!actualAdmin())return'';
    if(store.status==='idle')return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ยังไม่ได้โหลดรายการล่าสุด • กด ↻ เมื่อต้องการตรวจจาก Supabase</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total is-loading">—</span><button type="button" class="v460-refresh-icon" data-v492-refresh title="ตรวจรายการล่าสุด">↻</button></div></div></section>`;
    if(store.status==='loading')return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>กำลังตรวจรายการล่าสุดจาก Supabase…</p></div><span class="v460-admin-total is-loading">…</span></div></section>`;
    if(store.status==='error')return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p class="v460-admin-error">${esc(store.error)}</p></div><button type="button" class="ghost-btn" data-v492-refresh>ลองใหม่</button></div></section>`;
    const cats=store.categories||[],total=cats.reduce((n,c)=>n+(c.items?.length||0),0);
    if(!total)return `<section class="card v460-admin-pending v492-admin-pending is-clear" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ตรวจล่าสุดแล้ว • ไม่มีรายการค้างของ Admin</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total is-clear">0</span><button type="button" class="v460-refresh-icon" data-v492-refresh title="ตรวจใหม่">↻</button></div></div></section>`;
    return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending>
      <div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ข้อมูลจากการกด ↻ ล่าสุด • รายการ HR นับเฉพาะน้องที่กด “ลาในระบบแล้ว”</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total">${total}</span><button type="button" class="v460-refresh-icon" data-v492-refresh title="ตรวจใหม่">↻</button></div></div>
      <div class="v460-admin-categories">${cats.map(c=>`<div class="v460-admin-category tone-${esc(c.tone||'blue')}"><div class="v460-admin-category-head"><b>${esc(c.label||'รายการ')}</b><span>${c.items.length}</span></div><div class="v460-admin-items">${c.items.slice(0,6).map(item=>`<button type="button" class="v460-admin-item" data-v460-open-page="${esc(item.page||'dashboard')}" data-v460-open-month="${esc(item.month||'')}" data-v460-open-date="${esc(item.date||'')}"><span><b>${esc(item.title||'-')}</b><small>${esc(item.detail||'')}</small></span><em>เปิด ›</em></button>`).join('')}${c.items.length>6?`<div class="v460-admin-more">และอีก ${c.items.length-6} รายการ</div>`:''}</div></div>`).join('')}</div>
    </section>`;
  }

  function replacePanelInHtml(html){
    try{
      if(!actualAdmin())return html;
      suppressLegacyAutoLoad();
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');const root=tpl.content;
      root.querySelectorAll('[data-v460-admin-pending],[data-v492-admin-pending]').forEach(el=>el.remove());
      const t=document.createElement('template');t.innerHTML=panelHtml().trim();
      const panel=t.content.firstElementChild;
      if(panel){
        const nav=root.querySelector('[data-v443-dashboard-date-nav]');
        if(nav)nav.insertAdjacentElement('afterend',panel); else root.insertBefore(panel,root.firstChild);
      }
      const out=document.createElement('div');out.appendChild(root.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn('[V492] replace panel html',err);return html;}
  }

  const previous=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previous==='function'){
    const wrapped=function renderDashboardV492(){
      suppressLegacyAutoLoad();
      return replacePanelInHtml(previous.apply(this,arguments));
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function rerender(){
    try{if(onDashboard()&&typeof renderPage==='function')renderPage();}catch(_){ }
  }

  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('[data-v492-refresh]');
    if(!b)return;
    e.preventDefault();e.stopPropagation();loadFresh();
  },true);

  // If any legacy patch redraws its panel after V492, replace it immediately.
  const mo=new MutationObserver(()=>{
    if(!actualAdmin()||!onDashboard())return;
    const root=document.getElementById('pageContent')||document.body;
    const legacy=root.querySelector('[data-v460-admin-pending]:not(.v492-admin-pending)');
    if(!legacy)return;
    const t=document.createElement('template');t.innerHTML=panelHtml().trim();
    if(t.content.firstElementChild)legacy.replaceWith(t.content.firstElementChild);
  });
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }

  // Start every new page load in manual/idle mode. Do not display a previous snapshot.
  store.status='idle';store.categories=[];store.loadedAt=0;suppressLegacyAutoLoad();
  window.cnmiV492={version:VERSION,store,loadFresh,reset(){store.status='idle';store.categories=[];store.error='';store.loadedAt=0;rerender();}};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v492-admin-pending-manual-authoritative.js", error); }
;

/* Original source: patch-v493-admin-pending-effective-mode.js */
try {
/* CNMI Staff Planner V493
 * Admin pending visibility follows EFFECTIVE UI MODE, not the account's stored role.
 *
 * Problem fixed:
 * - A real Admin account can switch to "Staff mode" for normal staff use.
 * - V492 intentionally used actualAdmin() to own the pending panel, which caused
 *   "รอดำเนินการ Admin" to reappear even while the UI was in Staff mode.
 *
 * V493 rule:
 * - Admin mode  => Admin pending panel may be shown and manually refreshed.
 * - Staff mode  => Admin pending panel is removed and manual refresh is blocked.
 * - Non-admin   => Admin pending panel is never shown.
 *
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V493_ADMIN_PENDING_EFFECTIVE_MODE';
  if(window.__CNMI_V493_ADMIN_PENDING_EFFECTIVE_MODE__)return;
  window.__CNMI_V493_ADMIN_PENDING_EFFECTIVE_MODE__=true;

  function effectiveAdmin(){
    try{
      if(typeof window.isAdmin==='function') return !!window.isAdmin();
      if(typeof isAdmin==='function') return !!isAdmin();
    }catch(_){ }
    try{
      const actual=typeof window.isActualAdminV167==='function' ? !!window.isActualAdminV167() : String((window.state||state)?.profile?.role||'').toLowerCase()==='admin';
      const mode=typeof window.getViewAsModeV167==='function' ? String(window.getViewAsModeV167()||'').toLowerCase() : String((window.state||state)?.viewAsMode||'').toLowerCase();
      return actual && mode==='admin';
    }catch(_){return false;}
  }

  function stripAdminPending(root){
    if(effectiveAdmin())return;
    try{
      (root||document).querySelectorAll('[data-v460-admin-pending],[data-v492-admin-pending]').forEach(el=>el.remove());
    }catch(_){ }
  }

  function stripFromHtml(html){
    if(effectiveAdmin())return html;
    try{
      const t=document.createElement('template');
      t.innerHTML=String(html||'');
      t.content.querySelectorAll('[data-v460-admin-pending],[data-v492-admin-pending]').forEach(el=>el.remove());
      const out=document.createElement('div');
      out.appendChild(t.content.cloneNode(true));
      return out.innerHTML;
    }catch(_){return html;}
  }

  // V493 loads after V492, so this is the final dashboard visibility guard.
  const previous=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previous==='function'){
    const wrapped=function renderDashboardV493(){
      return stripFromHtml(previous.apply(this,arguments));
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // Block V492's manual Supabase refresh while the same Admin account is viewing as Staff.
  try{
    const api=window.cnmiV492;
    if(api?.loadFresh && !api.__v493EffectiveModeWrapped){
      const original=api.loadFresh.bind(api);
      api.loadFresh=async function(){
        if(!effectiveAdmin()){
          try{
            if(api.store){
              api.store.status='idle'; api.store.categories=[]; api.store.error=''; api.store.loadedAt=0; api.store.promise=null;
            }
          }catch(_){ }
          stripAdminPending(document);
          return [];
        }
        return original.apply(api,arguments);
      };
      api.__v493EffectiveModeWrapped=true;
    }
  }catch(_){ }

  // Remove a panel immediately if an older patch redraws it after a role-mode switch.
  const enforce=()=>stripAdminPending(document.getElementById('pageContent')||document);
  const mo=new MutationObserver(()=>enforce());
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  document.addEventListener('click',()=>setTimeout(enforce,0),true);
  window.addEventListener('pageshow',()=>setTimeout(enforce,0));
  window.addEventListener('focus',()=>setTimeout(enforce,0));
  setTimeout(enforce,0);
  setTimeout(enforce,150);

  window.cnmiV493={version:VERSION,effectiveAdmin,enforce};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v493-admin-pending-effective-mode.js", error); }
;

/* Original source: patch-v494-donor-app-events.js */
try {
/* CNMI Staff Planner v494 — synchronized CNMI Donor App activities */
(function(){
  'use strict';
  const VERSION='v494-donor-app-events';
  const DONOR_URL='https://donor.cnmiblood.com/';

  function esc(v){
    if(typeof escapeHtml==='function') return escapeHtml(String(v??''));
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function thaiDate(v){ return typeof formatThaiDate==='function' ? formatThaiDate(v) : String(v||''); }
  function timeText(v){ return String(v||'').slice(0,5); }
  function sourceLabel(type){ return ({platelet:'นัดเกล็ดเลือด',group:'หมู่คณะเลือดแดง',mobile:'ออกหน่วยนอกสถานที่'}[type]||'CNMI Donor'); }
  function sourceClass(type){ return ['platelet','group','mobile'].includes(type)?type:''; }
  function eventNote(r){
    const bits=[];
    if(r.contact_name) bits.push('ผู้ติดต่อ: '+r.contact_name);
    if(r.contact_phone) bits.push('โทร: '+r.contact_phone);
    if(r.detail) bits.push(r.detail);
    if(r.status) bits.push('สถานะ: '+r.status);
    return bits.join(' · ');
  }
  function activeRows(){ return (state.donorAppEvents||[]).filter(r=>r&&r.is_active!==false); }

  async function loadDonorAppEventsV494(){
    if(!state.profile || !sb) return;
    const now=new Date();
    const start=toDateInput(new Date(now.getFullYear(),now.getMonth()-2,1));
    const end=toDateInput(new Date(now.getFullYear(),now.getMonth()+4,0));
    const {data,error}=await sb.from('donor_app_events')
      .select('id,source_system,source_type,source_id,title,event_date,start_time,end_time,location,contact_name,contact_phone,contact_email,status,detail,source_url,is_active,updated_at')
      .gte('event_date',start).lte('event_date',end)
      .eq('is_active',true)
      .order('event_date',{ascending:true})
      .order('start_time',{ascending:true,nullsFirst:false});
    if(error){
      state.donorAppEvents=[];
      if(!/does not exist|relation|schema cache/i.test(String(error.message||''))) console.warn('['+VERSION+']',error.message||error);
      return;
    }
    state.donorAppEvents=Array.isArray(data)?data:[];
  }

  if(!Array.isArray(state.donorAppEvents)) state.donorAppEvents=[];

  const prevLoad=typeof loadAllData==='function'?loadAllData:null;
  if(prevLoad){
    const wrapped=async function loadAllDataV494(){ await prevLoad.apply(this,arguments); await loadDonorAppEventsV494(); };
    window.loadAllData=wrapped; try{(0,eval)('loadAllData=window.loadAllData');}catch(_){}
  }

  const prevCollect=typeof collectCalendarEvents==='function'?collectCalendarEvents:null;
  if(prevCollect){
    const wrapped=function collectCalendarEventsV494(){
      const events=prevCollect.apply(this,arguments)||[];
      activeRows().forEach(r=>{
        const raw={
          ...r,
          event_type:sourceLabel(r.source_type),
          note:eventNote(r),
          participant_ids:[],
          __donor_sync:true
        };
        const type=r.source_type==='mobile'?'outing':'activity';
        events.push({date:r.event_date,type,title:r.title,raw,donorSync:true});
      });
      return events;
    };
    window.collectCalendarEvents=wrapped; try{(0,eval)('collectCalendarEvents=window.collectCalendarEvents');}catch(_){}
  }

  const prevColor=typeof calendarEventColor==='function'?calendarEventColor:null;
  if(prevColor){
    const wrapped=function calendarEventColorV494(e){
      if(e?.raw?.__donor_sync){
        if(e.raw.source_type==='platelet') return '#fff0f2';
        if(e.raw.source_type==='group') return '#edf8f2';
        if(e.raw.source_type==='mobile') return '#edf6fa';
      }
      return prevColor.apply(this,arguments);
    };
    window.calendarEventColor=wrapped; try{(0,eval)('calendarEventColor=window.calendarEventColor');}catch(_){}
  }

  function rowsHtml(rows){
    if(!rows.length) return '<div class="donor-sync-empty">ยังไม่มีนัดหรือกิจกรรมจาก CNMI Donor App ในช่วงวันที่ที่โหลด</div>';
    return '<div class="donor-sync-list">'+rows.map(r=>{
      const phone=r.contact_phone?'<a href="tel:'+esc(r.contact_phone)+'">☎ '+esc(r.contact_phone)+'</a>':'';
      const email=r.contact_email?'<a href="mailto:'+encodeURIComponent(String(r.contact_email))+'">✉ '+esc(r.contact_email)+'</a>':'';
      const when=thaiDate(r.event_date)+(r.start_time?' · '+esc(timeText(r.start_time))+' น.':'');
      const url=esc(r.source_url||DONOR_URL);
      return '<article class="donor-sync-item"><div class="donor-sync-item-main"><div class="donor-sync-item-title"><span class="donor-sync-type '+sourceClass(r.source_type)+'">'+esc(sourceLabel(r.source_type))+'</span><b>'+esc(r.title)+'</b></div><div class="donor-sync-meta"><span>📅 '+esc(when)+'</span>'+(r.location?'<span>📍 '+esc(r.location)+'</span>':'')+(r.contact_name?'<span>👤 '+esc(r.contact_name)+'</span>':'')+phone+email+(r.status?'<span>สถานะ: '+esc(r.status)+'</span>':'')+'</div>'+(r.detail?'<div class="muted" style="margin-top:6px">'+esc(r.detail)+'</div>':'')+'</div><a class="tiny-btn donor-sync-open" href="'+url+'" target="_blank" rel="noopener">เปิด Donor App</a></article>';
    }).join('')+'</div>';
  }

  function syncedCard(rows,title,subtitle){
    return '<div class="card donor-sync-card"><div class="donor-sync-head"><div><h3>'+esc(title)+'</h3><p class="hint">'+esc(subtitle)+'</p></div><span class="donor-sync-badge">↻ เชื่อมจาก CNMI Donor</span></div>'+rowsHtml(rows)+'</div>';
  }

  const prevActivities=typeof renderActivitiesPage==='function'?renderActivitiesPage:null;
  if(prevActivities){
    const wrapped=function renderActivitiesPageV494(){
      const base=String(prevActivities.apply(this,arguments)||'');
      const rows=activeRows().slice().sort((a,b)=>String(a.event_date||'').localeCompare(String(b.event_date||''))||String(a.start_time||'').localeCompare(String(b.start_time||'')));
      return base+syncedCard(rows,'กิจกรรมจาก CNMI Donor App','นัดเกล็ดเลือดจะเข้าอัตโนมัติทันที ส่วนหมู่คณะและออกหน่วยจะแสดงเมื่อยืนยันแล้ว · แก้ไขต้นทางที่ Donor App');
    };
    window.renderActivitiesPage=wrapped; try{(0,eval)('renderActivitiesPage=window.renderActivitiesPage');}catch(_){}
  }

  const prevDashboard=typeof renderDashboard==='function'?renderDashboard:null;
  if(prevDashboard){
    const wrapped=function renderDashboardV494(){
      const base=String(prevDashboard.apply(this,arguments)||'');
      let d='';
      try{ d=typeof selectedDashboardDate==='function'?selectedDashboardDate():todayStr(); }catch(_){ d=todayStr(); }
      const rows=activeRows().filter(r=>String(r.event_date)===String(d));
      if(!rows.length) return base;
      return base+syncedCard(rows,'นัด/กิจกรรมจาก Donor App วันนี้','ข้อมูลสำหรับเตรียมงานและติดต่อผู้บริจาค/ผู้ประสานงาน');
    };
    window.renderDashboard=wrapped; try{(0,eval)('renderDashboard=window.renderDashboard');}catch(_){}
  }

  // Initial page load can start before the final patch is parsed. Backfill once a profile exists.
  let tries=0;
  const timer=setInterval(async()=>{
    tries++;
    if(state.profile&&sb){
      clearInterval(timer);
      await loadDonorAppEventsV494();
      try{ if(typeof renderPage==='function') renderPage(); }catch(_){}
    } else if(tries>20) clearInterval(timer);
  },500);

  window.loadDonorAppEventsV494=loadDonorAppEventsV494;
  console.info('['+VERSION+'] ready');
})();

} catch (error) { console.error("[v569] patch-v494-donor-app-events.js", error); }
;

/* Original source: patch-v495-donor-dashboard-selected-date.js */
try {
/* CNMI Staff Planner v495 — show Donor App events on selected-date dashboard */
(function(){
  'use strict';
  const VERSION='v495-donor-dashboard-selected-date';

  function esc(v){
    if(typeof escapeHtml==='function') return escapeHtml(String(v??''));
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function dateSelected(){
    try{
      const v=window.cnmiDashboardDateV443?.selectedDate?.();
      if(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))) return String(v);
    }catch(_){}
    try{
      const v=state?.dashboardDateV443;
      if(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))) return String(v);
    }catch(_){}
    try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}
  }
  function thaiDate(v){ try{return formatThaiDate(v);}catch(_){return String(v||'');} }
  function timeText(v){ return String(v||'').slice(0,5); }
  function sourceLabel(t){return ({platelet:'นัดเกล็ดเลือด',group:'หมู่คณะเลือดแดง',mobile:'ออกหน่วยนอกสถานที่'}[t]||'CNMI Donor');}
  function sourceClass(t){return ['platelet','group','mobile'].includes(t)?t:'';}

  function rowsForSelectedDate(){
    const d=dateSelected();
    const rows=Array.isArray(state?.donorAppEvents)?state.donorAppEvents:[];
    return rows.filter(r=>r&&r.is_active!==false&&String(r.event_date||'')===d)
      .slice().sort((a,b)=>String(a.start_time||'99:99').localeCompare(String(b.start_time||'99:99'))||String(a.title||'').localeCompare(String(b.title||'')));
  }

  function cardHtml(rows,date){
    if(!rows.length) return '';
    const items=rows.map(r=>{
      const phone=r.contact_phone?'<a href="tel:'+esc(r.contact_phone)+'">☎ '+esc(r.contact_phone)+'</a>':'';
      const email=r.contact_email?'<a href="mailto:'+encodeURIComponent(String(r.contact_email))+'">✉ '+esc(r.contact_email)+'</a>':'';
      const time=r.start_time?'<span>🕘 '+esc(timeText(r.start_time))+' น.</span>':'';
      const location=r.location?'<span>📍 '+esc(r.location)+'</span>':'';
      const contact=r.contact_name?'<span>👤 '+esc(r.contact_name)+'</span>':'';
      const status=r.status?'<span>สถานะ: '+esc(r.status)+'</span>':'';
      const url=esc(r.source_url||'https://donor.cnmiblood.com/');
      return '<article class="donor-sync-item v495-dashboard-item">'+
        '<div class="donor-sync-item-main">'+
          '<div class="donor-sync-item-title"><span class="donor-sync-type '+sourceClass(r.source_type)+'">'+esc(sourceLabel(r.source_type))+'</span><b>'+esc(r.title||sourceLabel(r.source_type))+'</b></div>'+
          '<div class="donor-sync-meta">'+time+location+contact+phone+email+status+'</div>'+
          (r.detail?'<div class="muted" style="margin-top:6px">'+esc(r.detail)+'</div>':'')+
        '</div>'+
        '<a class="tiny-btn donor-sync-open" href="'+url+'" target="_blank" rel="noopener">ดูใน Donor App</a>'+
      '</article>';
    }).join('');
    return '<section class="card donor-sync-card v495-donor-dashboard" data-v495-donor-dashboard="1">'+
      '<div class="donor-sync-head"><div><h3>นัด/กิจกรรมจาก Donor App</h3><p class="hint">'+esc(thaiDate(date))+' · แสดงตามวันที่ที่เลือกด้านบน</p></div><span class="donor-sync-badge">↻ CNMI Donor</span></div>'+
      '<div class="donor-sync-list">'+items+'</div></section>';
  }

  function injectDashboard(){
    try{
      if(state?.page!=='dashboard') return;
      const root=document.getElementById('pageContent');
      if(!root) return;
      root.querySelectorAll('[data-v495-donor-dashboard]').forEach(el=>el.remove());
      // v494 used today's date fallback on some installations. Remove only that old dashboard card.
      root.querySelectorAll('.donor-sync-card').forEach(card=>{
        const h=card.querySelector('h3');
        if(h && /นัด\/กิจกรรมจาก Donor App วันนี้/.test(h.textContent||'')) card.remove();
      });
      const date=dateSelected();
      const rows=rowsForSelectedDate();
      const html=cardHtml(rows,date);
      if(html) root.insertAdjacentHTML('beforeend',html);
    }catch(err){console.warn('['+VERSION+'] inject',err);}
  }

  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrapped=function renderPageV495(){
      const result=oldRenderPage.apply(this,arguments);
      setTimeout(injectDashboard,0);
      return result;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  document.addEventListener('click',function(e){
    if(e.target?.closest?.('[data-v443-date-prev],[data-v443-date-next],[data-v443-date-today]')) setTimeout(injectDashboard,80);
  },true);
  document.addEventListener('change',function(e){
    if(e.target?.closest?.('[data-v443-date-input]')) setTimeout(injectDashboard,80);
  },true);

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(state?.profile){ injectDashboard(); if(Array.isArray(state?.donorAppEvents)&&state.donorAppEvents.length) clearInterval(timer); }
    if(tries>30) clearInterval(timer);
  },500);

  window.injectDonorDashboardV495=injectDashboard;
  console.info('['+VERSION+'] ready');
})();

} catch (error) { console.error("[v569] patch-v495-donor-dashboard-selected-date.js", error); }
;

/* Original source: patch-v496-blood-qc-weekly-owner-bridge.js */
try {
/* CNMI Staff Planner V496 - Blood QC weekly owner read-only bridge marker */
(() => {
  'use strict';
  window.CNMI_BLOOD_QC_BRIDGE = Object.freeze({
    version: '496',
    rpc: 'bloodqc_weekly_position_assignments',
    positions: ['BB-Report', 'BB-Manual 3'],
    mode: 'read-only'
  });
})();

} catch (error) { console.error("[v569] patch-v496-blood-qc-weekly-owner-bridge.js", error); }
;

/* Original source: patch-v549-race-effective-duty-final.js */
try {
/* CNMI Staff Planner V549
 * Code 01 / RACE daily board bridge.
 * - Weekday daytime: derive RACE from actual daily-position assignments.
 * - Weekday evening: derive from ChBD + Ch4 while Ch4 is still on site.
 * - Night / after Ch4: derive from ChBD only.
 * - Weekend donor-open period: Ch3A=Donor Main, Ch3B=Finger/Interview, Ch9=Register.
 * - Weekend helpers who are not official roster assignments are intentionally excluded.
 * - Daytime emergency team leader: Parichat when present; fallback to BB-Approve, then first available assigned staff.
 * - Off-hours emergency team leader: ChBD1, then ChBD2/3 fallback.
 * - V501: one person can appear in only one R/A/C/E role per phase.
 * - Off-hours with only ChBD1-3: no fixed Rescue; Alarm and Control are separate people; Evacuate is a whole-team action when ordered.
 * - Weekday daytime: the two scheduled consult physicians are assigned to Rescue when present; full-day leave/training/off-site physicians are excluded.
 * - Daytime Control targets four distinct operators: 2 Blood Bank + 2 Component Prep/Manual, with zone-local fallbacks.
 * - Donor evacuation note: actively donating / needing staff assistance = yellow group; after needle removal and able to walk independently = green group.
 * - Extinguisher quick guide is shown persistently instead of the copy-roster action.
 * - V502: half-day leave never holds a fixed R/A/C role: a full-day Evacuate candidate covers that role for the whole day; the half-day person becomes Evacuate only while on site.
 * - V502: dashboard exception box is intentionally limited to leave information; routine staffing/target hints are not repeated there.
 * - V503: donor evacuation guidance is split into three short lines for easier scanning on desktop and mobile.
 * - V505: tapping an internal nickname shows the staff member's full name.
 * - V505: each phase includes an accountability roster for the emergency team leader to check and report to the Command Center.
 * - V505: weekend donor-room helpers remain outside automatic R/A/C/E assignment, but are INCLUDED in evacuation/accountability headcount and roster.
 * - V505: donor evacuation wording follows the hospital rule supplied by the unit: yellow wristband = needs staff assistance; no invented green-wristband meaning.
 * - V508: RACE nickname pills are display-only; full names are available in the expandable accountability roster.
 * - V508: removed the redundant footer disclaimer under the RACE card.
 * - V546: RACE off-hour roles follow completed partial duty sales by the actual sold time window.
 * - V546: when a partial sale changes staff inside one RACE phase, the phase is split only at the handoff time so the board never shows seller and receiver as if both cover the whole phase.
 * - V546: whole-shift sales continue to follow roster_assignments, while pending/confirmed (not yet Admin-completed) sales do not change RACE.
 * - V547: RACE consumes the shared effectiveEntriesForStaffDate source used by the duty table.
 * - V548: recover completed trade links by SELL_DATE / SELL_DUTY snapshot when a roster row was re-created and its assignment id changed.
 * - V548: startup/PWA/mobile recovery files are intentionally untouched.
 * Display-only; no Supabase schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V549_RACE_EFFECTIVE_DUTY_FINAL';
  if(window.__CNMI_V549_RACE_EFFECTIVE_DUTY_FINAL__) return;
  window.__CNMI_V549_RACE_EFFECTIVE_DUTY_FINAL__=true;

  const ROLE_META={
    R:{title:'Rescue',thai:'ช่วยผู้บริจาค / ผู้ที่อยู่ในอันตราย'},
    A:{title:'Alarm',thai:'แจ้งเหตุ · ครอบคลุมด้านหน้าและด้านหลัง'},
    C:{title:'Control',thai:'ควบคุมพื้นที่ / ระงับเหตุขั้นต้น'},
    E:{title:'Evacuate',thai:'อพยพ / ตรวจผู้ตกค้าง'}
  };
  const ROLE_ORDER=['R','A','C','E'];
  const phaseStore=window.__CNMI_V548_RACE_PHASES__||(window.__CNMI_V548_RACE_PHASES__={});

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return escapeHtml(txt(v));}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){return txt(v).slice(0,10);}
  function selectedDate(){
    try{const d=window.cnmiDashboardDateV443?.selectedDate?.();if(/^\d{4}-\d{2}-\d{2}$/.test(txt(d)))return txt(d);}catch(_){ }
    try{const d=S().dashboardDateV443;if(/^\d{4}-\d{2}-\d{2}$/.test(txt(d)))return txt(d);}catch(_){ }
    try{return normDate(todayStr());}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function thaiDate(date){try{return formatThaiDate(date);}catch(_){return date;}}
  function isWeekendDate(date){try{return !!isWeekend(date);}catch(_){const d=new Date(`${date}T12:00:00`);return d.getDay()===0||d.getDay()===6;}}
  function isHoliday(date){try{return !!isHolidayDate(date);}catch(_){return false;}}
  function staffById(id){return (S().staff||[]).find(s=>String(s?.id)===String(id))||null;}
  function staffName(id){const s=staffById(id);return txt(s?.nickname||s?.full_name)||'-';}
  function staffFullName(id){
    const s=staffById(id)||{};
    const full=txt(s.full_name||s.name||[s.first_name,s.last_name].filter(Boolean).join(' '));
    return full||staffName(id);
  }
  function staffHtml(id,extra=''){
    if(!id)return '<span class="v497-empty-person">ยังไม่มีผู้รับผิดชอบ</span>';
    let html='';
    try{html=staffPill(id);}catch(_){html=`<span class="v497-person-fallback">${esc(staffName(id))}</span>`;}
    return `<span class="v497-person">${html}${extra?`<small>${esc(extra)}</small>`:''}</span>`;
  }
  function isParichat(st){
    const n=txt(st?.nickname).toLowerCase();
    const f=txt(st?.full_name).replace(/\s+/g,'');
    return n==='มัส'||n==='mus'||f.includes('ปาริฉัตร');
  }
  function normalizeCode(v){return txt(v).toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');}
  function positionCode(row){return txt(row?.position_code||row?.code);}
  function positionRole(code){
    const k=normalizeCode(code);
    if(/^drmain(?:1|2)?$/.test(k)||k.startsWith('drmain')) return 'R';
    if(k.startsWith('drregister')||k.startsWith('drregistration')||k.startsWith('bbsupport')) return 'A';
    if(k.startsWith('bbstockissue')||k.startsWith('bbmanual4')) return 'C';
    if(k.startsWith('bbapprove')||k.startsWith('bbreport')||k.startsWith('bbmanual1')||k.startsWith('bbmanual2')||k.startsWith('bbmanual3')||k.startsWith('drfinger')||k.startsWith('drsupport')) return 'E';
    return '';
  }
  function positionZone(code){
    const k=normalizeCode(code);
    if(k.startsWith('dr')) return 'front';
    return 'back';
  }
  function positionArea(code){
    const k=normalizeCode(code);
    if(k.startsWith('dr'))return 'front';
    if(k.startsWith('bbmanual'))return 'manual';
    return 'bloodbank';
  }
  function codeLabel(row){
    const c=positionCode(row);
    try{return txt(positionLabelForCell(c)||c);}catch(_){return c;}
  }
  function rowsForDate(date){
    try{if(window.cnmiDashboardPositionsV434?.rowsFor)return window.cnmiDashboardPositionsV434.rowsFor(date)||[];}catch(_){ }
    return (S().positions||[]).filter(r=>normDate(r?.work_date)===date&&positionCode(r));
  }
  function parseIds(v){
    if(Array.isArray(v))return v.filter(Boolean).map(String);
    const s=txt(v);if(!s)return [];
    try{const a=JSON.parse(s);if(Array.isArray(a))return a.filter(Boolean).map(String);}catch(_){ }
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  function minutes(v){const m=txt(v).match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;}
  function fullDayActivity(a){
    const t=txt(a?.event_type);
    if(!['อบรม','ประชุม','ออกหน่วย'].includes(t))return false;
    const a0=minutes(a?.start_time),b0=minutes(a?.end_time);
    if(a0==null||b0==null)return t==='ออกหน่วย';
    let b=b0;if(b<=a0)b+=1440;
    return (b-a0)>=360 || (a0<=540&&b0>=930);
  }
  function inRange(date,a){return (!a?.start_date||date>=normDate(a.start_date))&&(!a?.end_date||date<=normDate(a.end_date));}
  function effectiveLeave(l){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(l):txt(l?.status).toLowerCase()!=='cancelled';}catch(_){return true;}}
  function overlapsLeave(l,date){try{return typeof overlapsDate==='function'?!!overlapsDate(l,date):normDate(l?.start_date)<=date&&normDate(l?.end_date||l?.start_date)>=date;}catch(_){return false;}}
  function leavePeriod(l){
    const p=txt(l?.leave_period||l?.period||'เต็มวัน').toLowerCase();
    if(p.includes('ครึ่งเช้า')||p.includes('morning'))return 'morning';
    if(p.includes('ครึ่งบ่าย')||p.includes('afternoon'))return 'afternoon';
    return 'full';
  }
  function unavailableDay(date){
    const full=new Set(),partial=new Map(),reasons=new Map(),leaveInfo=new Map();
    (S().leaves||[]).forEach(l=>{
      if(!effectiveLeave(l)||!overlapsLeave(l,date))return;
      const type=txt(l?.type||l?.leave_type).split(':::')[0].trim();
      if(!type||type==='ไม่รับเวร')return;
      const id=String(l?.staff_id||'');if(!id)return;
      const p=leavePeriod(l);
      if(p==='full'){
        full.add(id);reasons.set(id,type||'ลา');leaveInfo.set(id,{period:'full',type:type||'ลา'});
      }else{
        partial.set(id,p);leaveInfo.set(id,{period:p,type:type||'ลา'});
      }
    });
    (S().activities||[]).forEach(a=>{
      if(!inRange(date,a)||!fullDayActivity(a))return;
      parseIds(a?.participant_ids).forEach(id=>{full.add(String(id));reasons.set(String(id),txt(a?.event_type)||'กิจกรรม');});
    });
    return {full,partial,reasons,leaveInfo};
  }
  function uniquePeople(list){
    const seen=new Set();return (list||[]).filter(x=>{const id=String(x?.staff_id||x?.id||'');if(!id||seen.has(id))return false;seen.add(id);return true;});
  }
  function helperRowsForDate(date){
    try{
      const api=window.cnmiDashboardHolidayManpowerV440;
      if(!api?.offDayManpower)return {loaded:false,loading:false,error:'',rows:[],total:0};
      const h=api.offDayManpower(date)?.helpers||{};
      return {loaded:!!h.loaded,loading:!!h.loading,error:txt(h.error),rows:Array.isArray(h.rows)?h.rows:[],total:Number(h.total||0)};
    }catch(_){return {loaded:false,loading:false,error:'',rows:[],total:0};}
  }
  function helperReportPerson(row){
    if(row?.internal_staff_id){
      const sid=String(row.internal_staff_id);
      return {kind:'staff',staff_id:sid,note:`คนมาช่วย${txt(row?.unit_name)?` · ${txt(row.unit_name)}`:''}`,helper:true};
    }
    return {kind:'helper',helper_name:txt(row?.helper_name)||'ผู้มาช่วย',unit_name:txt(row?.unit_name)||'นอกหน่วย',phone:txt(row?.phone),note:'คนมาช่วย',helper:true};
  }
  function reportKey(p){
    if(p?.kind==='staff'||p?.staff_id)return `staff:${String(p.staff_id||'')}`;
    return `helper:${txt(p?.helper_name).toLowerCase()}|${txt(p?.unit_name).toLowerCase()}|${txt(p?.phone).replace(/\D/g,'')}`;
  }
  function uniqueReportPeople(list){
    const map=new Map();
    (list||[]).forEach(p=>{const k=reportKey(p);if(k&&!map.has(k))map.set(k,p);});
    return [...map.values()];
  }
  function reportStaffPerson(id,note=''){return {kind:'staff',staff_id:String(id),note:txt(note)};}
  function emptyRoles(){return {R:[],A:[],C:[],E:[]};}
  function addRole(roles,role,person){if(role&&person?.staff_id&&!roles[role].some(x=>String(x.staff_id)===String(person.staff_id)))roles[role].push(person);}
  function removeLeaderFromRoles(roles,leaderId){
    if(!leaderId)return;
    ROLE_ORDER.forEach(role=>{roles[role]=roles[role].filter(p=>String(p?.staff_id)!==String(leaderId));});
  }
  function roleOfStaff(roles,staffId){
    const sid=String(staffId||'');
    if(!sid)return '';
    return ROLE_ORDER.find(r=>(roles[r]||[]).some(p=>String(p?.staff_id)===sid))||'';
  }
  function addExclusiveRole(roles,role,person){
    if(!role||!person?.staff_id)return false;
    const current=roleOfStaff(roles,person.staff_id);
    if(current)return current===role;
    addRole(roles,role,person);
    return true;
  }
  function physicianDaytimePeople(date,unavailable,warnings,pushLeaveWarning){
    const api=window.cnmiPhysicianConsultV452;
    if(!api?.baseForDate)return [];
    let model=null;
    try{model=api.baseForDate(date);}catch(_){return [];}
    if(!model?.weekday)return [];
    const slots=[['donor','แพทย์ Consult · Donor'],['bb','แพทย์ Consult · Blood Bank']];
    const seen=new Set(),out=[];
    slots.forEach(([key,label])=>{
      const sid=String(model?.[key]||'');
      if(!sid)return;
      if(unavailable.full.has(sid)){
        const li=unavailable.leaveInfo?.get(sid);
        if(li&&pushLeaveWarning)pushLeaveWarning(sid,`${staffName(sid)} ลาทั้งวัน`);
        return;
      }
      const p=unavailable.partial.get(sid)||'';
      if(p&&pushLeaveWarning){
        const present=p==='morning'?'บ่าย':'เช้า';
        pushLeaveWarning(sid,`${staffName(sid)} ลาครึ่ง${p==='morning'?'เช้า':'บ่าย'} · ช่วง${present}เป็น Evacuate`);
      }
      if(seen.has(sid))return;
      seen.add(sid);
      out.push({staff_id:sid,label,slot:key,partial:p});
    });
    return out;
  }

  function daytimePlan(date){
    const unavailable=unavailableDay(date);
    const roles=emptyRoles(),warnings=[];
    const warningIds=new Set();
    const pushLeaveWarning=(sid,msg)=>{const key=String(sid||'')+'|'+String(msg||'');if(!warningIds.has(key)){warningIds.add(key);warnings.push(msg);}};
    const allRows=rowsForDate(date).filter(r=>positionRole(positionCode(r)));
    const availableRows=[];
    const seenStaff=new Set();
    allRows.forEach(row=>{
      const sid=String(row?.staff_id||'');
      if(!sid)return;
      if(unavailable.full.has(sid)){
        if(unavailable.leaveInfo?.has(sid))pushLeaveWarning(sid,`${staffName(sid)} ลาทั้งวัน`);
        return;
      }
      const p=unavailable.partial.get(sid)||'';
      const item={row,staff_id:sid,label:codeLabel(row),partial:p,zone:positionZone(positionCode(row)),area:positionArea(positionCode(row))};
      availableRows.push(item);
      seenStaff.add(sid);
      if(p){
        const present=p==='morning'?'บ่าย':'เช้า';
        pushLeaveWarning(sid,`${staffName(sid)} ลาครึ่ง${p==='morning'?'เช้า':'บ่าย'} · ช่วง${present}เป็น Evacuate`);
      }
    });

    // ผู้ลาครึ่งวันไม่ถือ fixed R/A/C หรือหัวหน้าทีมทั้งวัน เพื่อไม่ต้องเปลี่ยนบอร์ดตอนเที่ยง
    const fullDayRows=availableRows.filter(x=>!x.partial);
    const parichat=(S().staff||[]).find(isParichat);
    let leaderId='';let leaderNote='';
    if(parichat&&fullDayRows.some(x=>String(x.staff_id)===String(parichat.id))){leaderId=String(parichat.id);leaderNote='หัวหน้าหน่วย · อยู่หน้างาน';}
    if(!leaderId){
      const approve=fullDayRows.find(x=>normalizeCode(positionCode(x.row)).startsWith('bbapprove'));
      if(approve){leaderId=String(approve.staff_id);leaderNote='ผู้แทนหัวหน้าทีม · BB-Approve';}
    }
    if(!leaderId&&fullDayRows[0]){leaderId=String(fullDayRows[0].staff_id);leaderNote='ผู้แทนหัวหน้าทีม';}

    const pool=fullDayRows.filter(x=>String(x.staff_id)!==String(leaderId));
    const partialPool=availableRows.filter(x=>x.partial&&String(x.staff_id)!==String(leaderId));
    const used=new Set();
    const rowBy=(codes)=>{
      for(const c of codes){
        const hit=pool.find(x=>normalizeCode(positionCode(x.row)).startsWith(c)&&!used.has(String(x.staff_id)));
        if(hit)return hit;
      }
      return null;
    };
    const fallbackByArea=(areas)=>{
      const wanted=Array.isArray(areas)?areas:[areas];
      return pool.find(x=>!used.has(String(x.staff_id))&&wanted.includes(x.area))||null;
    };
    const fallbackAny=()=>pool.find(x=>!used.has(String(x.staff_id)))||null;
    const take=(role,item,secondary='')=>{
      if(!item||used.has(String(item.staff_id)))return false;
      const p={staff_id:String(item.staff_id),label:item.label,secondary:secondary||item.label};
      addRole(roles,role,p);used.add(String(item.staff_id));return true;
    };
    const takeSlot=(role,item,area,normalText,replacementText)=>{
      if(item)return take(role,item,normalText||item.label);
      const fb=fallbackByArea(area)||fallbackAny();
      return fb?take(role,fb,replacementText||`${fb.label} · ผู้แทน`):false;
    };

    // R — Rescue: DR-Main ที่อยู่เต็มวันเป็นหลัก; ถ้าลาครึ่งวัน ดึงคนที่เดิมจะเป็น E ในโซนหน้าแทนทั้งวัน
    let r1=rowBy(['drmain1']);
    takeSlot('R',r1,'front',r1?'DR-Main 1 · จุดเจาะเก็บ':'',r1?'':null);
    if(!r1&&roles.R.length){roles.R[roles.R.length-1].secondary=`${roles.R[roles.R.length-1].label} · แทน Rescue จุดเจาะเก็บ 1`;}
    let r2=rowBy(['drmain2']);
    takeSlot('R',r2,'front',r2?'DR-Main 2 · จุดเจาะเก็บ':'',r2?'':null);
    if(!r2&&roles.R.length){const last=roles.R[roles.R.length-1];if(!String(last.secondary).includes('จุดเจาะเก็บ 1'))last.secondary=`${last.label} · แทน Rescue จุดเจาะเก็บ 2`;}

    // A — Alarm: ด้านหน้า + ด้านหลัง คนละคน; ถ้าคนหลักลาครึ่งวันใช้คน E ใกล้เคียงแทนทั้งวัน
    let alarmFront=rowBy(['drregister','drregistration']);
    if(!alarmFront)alarmFront=rowBy(['drfinger','drsupport']);
    takeSlot('A',alarmFront,'front',alarmFront?`${alarmFront.label} · ด้านหน้า`:'',`${(fallbackByArea('front')||{}).label||'ผู้แทน'} · แทน Alarm ด้านหน้า`);
    let alarmBack=rowBy(['bbsupport']);
    if(!alarmBack)alarmBack=rowBy(['bbreport','bbapprove','bbstockissue']);
    takeSlot('A',alarmBack,['bloodbank','manual'],alarmBack?`${alarmBack.label} · ด้านหลัง`:'',`${(fallbackByArea(['bloodbank','manual'])||{}).label||'ผู้แทน'} · แทน Alarm ด้านหลัง`);

    // C — Control เป้าหมาย 4 คน: Blood Bank 2 + Component Prep/Manual 2
    let c1=rowBy(['bbstockissue']);
    if(!c1)c1=rowBy(['bbreport','bbapprove']);
    takeSlot('C',c1,'bloodbank',c1?`${c1.label} · Blood Bank 1`:'',`${(fallbackByArea('bloodbank')||{}).label||'ผู้แทน'} · แทน Control Blood Bank 1`);
    let c2=rowBy(['bbreport']);
    if(!c2)c2=rowBy(['bbstockissue','bbapprove']);
    takeSlot('C',c2,'bloodbank',c2?`${c2.label} · Blood Bank 2`:'',`${(fallbackByArea('bloodbank')||{}).label||'ผู้แทน'} · แทน Control Blood Bank 2`);
    let c3=rowBy(['bbmanual3']);
    if(!c3)c3=rowBy(['bbmanual2','bbmanual1','bbmanual4']);
    takeSlot('C',c3,'manual',c3?`${c3.label} · Component Prep 1`:'',`${(fallbackByArea('manual')||{}).label||'ผู้แทน'} · แทน Control Component Prep 1`);
    let c4=rowBy(['bbmanual4']);
    if(!c4)c4=rowBy(['bbmanual2','bbmanual1','bbmanual3']);
    takeSlot('C',c4,'manual',c4?`${c4.label} · Component Prep 2`:'',`${(fallbackByArea('manual')||{}).label||'ผู้แทน'} · แทน Control Component Prep 2`);

    // แพทย์ Consult: อยู่เต็มวันช่วย Rescue; ลาครึ่งวันจะอยู่ E เฉพาะช่วงที่มาปฏิบัติงาน
    const doctors=physicianDaytimePeople(date,unavailable,warnings,pushLeaveWarning);
    doctors.filter(p=>!p.partial).forEach(p=>{
      if(String(p.staff_id)===String(leaderId)||used.has(String(p.staff_id)))return;
      addRole(roles,'R',{staff_id:String(p.staff_id),label:p.label,secondary:`${p.label} · ช่วย Rescue`});
      used.add(String(p.staff_id));
    });

    // E — คนที่เหลือ + ผู้ลาครึ่งวันในช่วงที่อยู่หน้างาน
    pool.forEach(item=>{
      if(used.has(String(item.staff_id)))return;
      take('E',item,`${item.label} · อพยพ/ตรวจผู้ตกค้าง`);
    });
    partialPool.forEach(item=>{
      if(used.has(String(item.staff_id)))return;
      const present=item.partial==='morning'?'บ่าย':'เช้า';
      addRole(roles,'E',{staff_id:String(item.staff_id),label:item.label,secondary:`${item.label} · Evacuate เฉพาะช่วง${present}`});
      used.add(String(item.staff_id));
    });
    doctors.filter(p=>p.partial).forEach(p=>{
      if(String(p.staff_id)===String(leaderId)||used.has(String(p.staff_id)))return;
      const present=p.partial==='morning'?'บ่าย':'เช้า';
      addRole(roles,'E',{staff_id:String(p.staff_id),label:p.label,secondary:`${p.label} · Evacuate เฉพาะช่วง${present}`});
      used.add(String(p.staff_id));
    });

    const teamIds=uniquePeople([...availableRows.map(x=>({staff_id:x.staff_id})),...doctors.map(x=>({staff_id:x.staff_id}))]);
    const reportPeople=uniqueReportPeople([
      ...availableRows.map(x=>reportStaffPerson(x.staff_id,x.partial?`อยู่หน้างานเฉพาะช่วง${x.partial==='morning'?'บ่าย':'เช้า'}`:x.label)),
      ...doctors.map(x=>reportStaffPerson(x.staff_id,x.partial?`แพทย์ Consult · อยู่หน้างานเฉพาะช่วง${x.partial==='morning'?'บ่าย':'เช้า'}`:x.label))
    ]);
    return {id:'day',label:'กลางวัน',sub:'อิงตำแหน่งกลางวันจริง',leaderId,leaderNote,roles,roleNotes:{},roleTips:{R:'การอพยพผู้บริจาค\nสายเหลือง — ต้องมีเจ้าหน้าที่ช่วยดูแล / ช่วยอพยพ\nเดินได้เอง — หลังถอดเข็ม อาการปกติ ให้เจ้าหน้าที่นำทางไปจุดรวมพล'},warnings,teamCount:teamIds.length,reportPeople,reportCountText:String(reportPeople.length),reportRosterNote:'หัวหน้าทีมตรวจนับคนจริง ณ เวลาที่เกิดเหตุ และรายงานศูนย์อำนวยการ',note:'ลาครึ่งวัน: ใช้ผู้ปฏิบัติจาก Evacuate แทน R/A/C เดิมตลอดวัน เพื่อไม่ต้องเปลี่ยนบอร์ดกลางวัน; ผู้ลาครึ่งวันอยู่ Evacuate เฉพาะช่วงที่มาปฏิบัติงาน'};
  }

  function dutyCode(a){return txt(a?.duty_code);}
  function rawDutyRows(date){return (S().rosterAssignments||[]).filter(a=>normDate(a?.duty_date)===date&&a?.staff_id);}
  function intervalOverlap(a,b){return Number(a?.[0])<Number(b?.[1])-0.01&&Number(b?.[0])<Number(a?.[1])-0.01;}
  function subtractIntervalList(pieces,cut){
    return (pieces||[]).flatMap(([s,e])=>{
      const cs=Number(cut?.[0]),ce=Number(cut?.[1]);
      if(!Number.isFinite(cs)||!Number.isFinite(ce)||ce<=s||cs>=e)return [[s,e]];
      const out=[];if(cs>s)out.push([s,Math.min(cs,e)]);if(ce<e)out.push([Math.max(ce,s),e]);
      return out.filter(x=>x[1]>x[0]+0.01);
    });
  }
  function tradeApi(){return window.cnmiTradeSegmentsV549||window.cnmiTradeSegmentsV217||null;}
  function assignmentWindowSafe(a){
    try{const w=tradeApi()?.assignmentWindow?.(a);if(Number.isFinite(Number(w?.start))&&Number.isFinite(Number(w?.end))&&Number(w.end)>Number(w.start))return {start:Number(w.start),end:Number(w.end)};}catch(_){ }
    const code=dutyCode(a),off=isWeekendDate(normDate(a?.duty_date))||isHoliday(normDate(a?.duty_date));
    if(/^ชบด[123]$/.test(code))return off?{start:480,end:1920}:{start:960,end:1920};
    if(['ช3A','ช3B','ช9','ช9-เคิก','ช9-MT'].includes(code))return {start:480,end:960};
    if(['ช4','ช4A','ช4B'].includes(code))return {start:960,end:1440};
    return {start:480,end:960};
  }
  function tradeSnapshot(note,key){
    const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i'));
    if(!m?.[1])return '';
    try{return decodeURIComponent(m[1]);}catch(_){return m[1];}
  }
  function tradeMatchesAssignment(r,a){
    if(!r||!a)return false;
    if(String(r?.from_assignment_id||'')===String(a?.id||''))return true;
    const snapDate=normDate(tradeSnapshot(r?.note,'SELL_DATE'));
    const snapDuty=txt(tradeSnapshot(r?.note,'SELL_DUTY'));
    return !!snapDate && snapDate===normDate(a?.duty_date)
      && !!snapDuty && snapDuty===dutyCode(a)
      && String(r?.requester_id||'')===String(a?.staff_id||'');
  }
  function completedTradeRowsForDate(date){
    const raw=rawDutyRows(date);
    return (S().tradeRequests||[]).filter(r=>String(r?.status||'').toLowerCase()==='completed').filter(r=>raw.some(a=>tradeMatchesAssignment(r,a)));
  }
  function allEffectiveStaffIds(date){
    // V549: do not try to infer the receiver list before asking the shared resolver.
    // Iterate every known staff member plus all roster/trade participants; the resolver
    // itself returns entries only for people who actually work this date. This removes
    // the last possible split-brain path between the monthly roster and RACE.
    const ids=new Set();
    (S().staff||[]).forEach(p=>{if(p?.id)ids.add(String(p.id));});
    rawDutyRows(date).forEach(a=>{if(a?.staff_id)ids.add(String(a.staff_id));});
    (S().tradeRequests||[]).forEach(r=>{
      if(String(r?.status||'').toLowerCase()!=='completed')return;
      if(r?.requester_id)ids.add(String(r.requester_id));
      if(r?.receiver_id)ids.add(String(r.receiver_id));
    });
    return [...ids];
  }
  function ownerRemainIntervals(entry,a){
    const w=assignmentWindowSafe(a);let pieces=[[w.start,w.end]];
    const cuts=(entry?.trades||[]).flatMap(x=>x?.intervals||x?.spec?.intervals||[]);
    cuts.forEach(c=>{pieces=subtractIntervalList(pieces,[Number(c?.[0]),Number(c?.[1])]);});
    return pieces;
  }
  function effectiveEntryIntervals(entry,a){
    if(entry?.kind==='receiver-part'&&Array.isArray(entry?.spec?.intervals)&&entry.spec.intervals.length){
      return entry.spec.intervals.map(x=>[Number(x?.[0]),Number(x?.[1])]).filter(x=>Number.isFinite(x[0])&&Number.isFinite(x[1])&&x[1]>x[0]+0.01);
    }
    if(entry?.kind==='owner-remain')return ownerRemainIntervals(entry,a);
    const w=assignmentWindowSafe(a);return [[w.start,w.end]];
  }
  function effectiveDutySegments(date){
    const api=tradeApi(),raw=rawDutyRows(date);
    if(!api?.effectiveEntriesForStaffDate){
      return raw.map(a=>{const w=assignmentWindowSafe(a);return {...a,_effective_kind:'owner',_effective_start:w.start,_effective_end:w.end};});
    }
    const rows=[];
    allEffectiveStaffIds(date).forEach(staffId=>{
      let entries=[];
      try{entries=api.effectiveEntriesForStaffDate(staffId,date,raw)||[];}catch(_){entries=[];}
      entries.forEach(entry=>{
        const a=entry?.assignment;if(!a||!dutyCode(a))return;
        effectiveEntryIntervals(entry,a).forEach(([s,e])=>{
          rows.push({...a,staff_id:String(staffId),_effective_kind:entry.kind||'owner',_effective_start:Number(s),_effective_end:Number(e),_effective_trade_request_id:String(entry?.request?.id||''),_effective_time_label:txt(entry?.timeLabel)});
        });
      });
    });
    // Safety fallback: if the shared effective source unexpectedly returns nothing, never blank the RACE board.
    if(!rows.length&&raw.length)return raw.map(a=>{const w=assignmentWindowSafe(a);return {...a,_effective_kind:'owner',_effective_start:w.start,_effective_end:w.end};});
    const seen=new Set();
    return rows.filter(a=>{
      const key=[String(a.staff_id||''),String(a.id||''),dutyCode(a),Number(a._effective_start),Number(a._effective_end),String(a._effective_kind||'')].join('|');
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function effectiveDutyRows(date,windowSpec=null){
    const rows=effectiveDutySegments(date);
    const filtered=windowSpec?rows.filter(a=>intervalOverlap([Number(a._effective_start),Number(a._effective_end)],[Number(windowSpec.start),Number(windowSpec.end)])):rows;
    const seen=new Set();
    return filtered.filter(a=>{
      const key=`${String(a.staff_id||'')}|${dutyCode(a)}`;
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function tradeBoundaries(date,start,end){
    const out=new Set();
    effectiveDutySegments(date).forEach(a=>{
      const s=Number(a?._effective_start),e=Number(a?._effective_end);
      if(s>start+0.01&&s<end-0.01)out.add(s);
      if(e>start+0.01&&e<end-0.01)out.add(e);
    });
    return [...out].sort((a,b)=>a-b);
  }
  function clockText(abs){let n=Math.round(Number(abs||0));n=((n%1440)+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
  function intervalText(start,end){const plus=Number(end)>1440&&clockText(end)<=clockText(start);return `${clockText(start)}–${clockText(end)}${plus?' (+1 วัน)':''}`;}
  function findDuty(rows,codes){return rows.find(a=>codes.includes(dutyCode(a)))||null;}
  function tradeStatusSuffix(a){return a?._effective_kind==='receiver-part'?' · รับช่วงขายเวร':a?._effective_kind==='owner-remain'?' · ช่วงที่เหลือ':'';}
  function dutyPerson(a,extra=''){
    if(!a)return null;
    const suffix=tradeStatusSuffix(a),base=extra||'';
    return {staff_id:String(a.staff_id),label:(window.DUTY_LABEL?.[dutyCode(a)]||((typeof DUTY_LABEL!=='undefined'&&DUTY_LABEL[dutyCode(a)])||dutyCode(a))),secondary:`${base}${suffix}`.trim()};
  }
  function dutyLeader(rows){
    const a=findDuty(rows,['ชบด1'])||findDuty(rows,['ชบด2'])||findDuty(rows,['ชบด3'])||rows[0];
    return a?{id:String(a.staff_id),note:`หัวหน้าทีมจาก ${dutyCode(a)}${tradeStatusSuffix(a)}`}: {id:'',note:''};
  }
  function dutyPlan(date,kind,windowSpec=null){
    const all=effectiveDutyRows(date,windowSpec);
    const chbd=all.filter(a=>['ชบด1','ชบด2','ชบด3'].includes(dutyCode(a)));
    const ch4=all.filter(a=>['ช4','ช4A','ช4B'].includes(dutyCode(a)));
    const donor=all.filter(a=>['ช3A','ช3B','ช9','ช9-เคิก','ช9-MT'].includes(dutyCode(a)));
    let included=[],label='',sub='',note='';
    if(kind==='weekend-donor'){
      included=[...chbd,...donor];label='ช่วงเปิดห้องบริจาค';sub='เสาร์–อาทิตย์ · เฉพาะเวรหลักใน Staff Planner';
      note='ผู้มาช่วยที่ไม่ได้อยู่ในเวรหลักของหน่วยจะไม่ถูกดึงเข้า RACE อัตโนมัติ';
    }else if(kind==='evening'){
      included=[...chbd,...ch4];label='ช่วงเย็น';sub=ch4.length?'ชบด + ช4 (ระหว่างผู้ปฏิบัติ ช4 ยังอยู่)':'ชบด';
      note=ch4.length?'เมื่อผู้ปฏิบัติ ช4 กลับ ให้ใช้แผน “กลางคืน” ต่อ':'ไม่มี ช4 ในตารางวันนี้';
    }else if(kind==='holiday'){
      included=[...chbd];label='วันหยุด / 24 ชม.';sub='อิง ชบด1–3';note='ไม่มีตำแหน่งกลางวันแบบวันราชการ';
    }else{
      included=[...chbd];label='กลางคืน';sub='หลังห้องบริจาค/ช4 ปิด · อิง ชบด1–3';note='ช่วงนี้ไม่มีผู้บริจาคตามการทำงานปกติของหน่วย';
    }
    if(windowSpec?.label)label=windowSpec.label;
    if(windowSpec?.sub)sub=windowSpec.sub;
    if(windowSpec?.tradeSplit)note=[note,`ช่วง ${intervalText(windowSpec.start,windowSpec.end)} ปรับตามผู้ปฏิบัติงานจริงหลังขายเวร`].filter(Boolean).join(' · ');
    included=uniquePeople(included.map(a=>({staff_id:String(a.staff_id),assignment:a}))).map(x=>x.assignment);
    const roles=emptyRoles(),roleNotes={},roleTips={},warnings=[];
    const leader=dutyLeader(included);
    const working=included.filter(a=>String(a?.staff_id)!==String(leader.id));
    const get=(code)=>working.filter(a=>dutyCode(a)===code);
    const claim=(role,a,extra='')=>{
      if(!a)return false;
      const p=dutyPerson(a,extra);
      return addExclusiveRole(roles,role,p);
    };
    const claimMany=(role,arr,extra='')=>(arr||[]).forEach(a=>claim(role,a,extra));
    const firstUnassigned=(codes=[])=>{
      for(const code of codes){
        const a=get(code).find(x=>!roleOfStaff(roles,x.staff_id));
        if(a)return a;
      }
      return working.find(x=>!roleOfStaff(roles,x.staff_id))||null;
    };

    if(kind==='weekend-donor'){
      roleTips.R='การอพยพผู้บริจาค\nสายเหลือง — ต้องมีเจ้าหน้าที่ช่วยดูแล / ช่วยอพยพ\nเดินได้เอง — หลังถอดเข็ม อาการปกติ ให้เจ้าหน้าที่นำทางไปจุดรวมพล';
      // Donor open: ช3A อยู่จุดเจาะเก็บ = Rescue, ช9/Register = Alarm, ช3B/Finger = Evacuate
      claimMany('R',get('ช3A'));
      const alarm=firstUnassigned(['ช9','ช9-เคิก','ช9-MT','ชบด2','ชบด3']);
      if(alarm)claim('A',alarm,'Alarm ประจำกะ');
      claimMany('E',get('ช3B'));
      // เจ้าหน้าที่คลังเลือดที่เหลือรับ Control โดยไม่ซ้ำกับ role อื่น
      [...get('ชบด2'),...get('ชบด3')].forEach(a=>{if(!roleOfStaff(roles,a.staff_id))claim('C',a,'Control ประจำกะ');});
      if(!roles.R.length){const a=firstUnassigned(['ช3B','ช9','ช9-เคิก','ช9-MT','ชบด2','ชบด3']);if(a)claim('R',a,'สำรอง Rescue');}
      if(!roles.E.length){const a=firstUnassigned(['ช3B','ช9','ช9-เคิก','ช9-MT','ช3A','ชบด3','ชบด2']);if(a)claim('E',a,'สำรอง Evacuate');}
      if(!roles.C.length){const a=firstUnassigned(['ชบด3','ชบด2']);if(a)claim('C',a,'สำรอง Control');}
    }else if(kind==='evening'){
      // หลังห้องบริจาคปิด ไม่มีผู้บริจาค: ไม่กำหนด Rescue ประจำ
      roleNotes.R='ไม่กำหนดผู้รับผิดชอบประจำช่วงนี้ · หากพบผู้ที่อยู่ในอันตราย ให้ผู้พบเหตุ Rescue ตามหลัก RACE';
      const alarm=firstUnassigned(['ชบด2','ชบด3']);
      if(alarm)claim('A',alarm,'Alarm ประจำกะ');
      const control=firstUnassigned(['ชบด3','ชบด2']);
      if(control)claim('C',control,'Control ประจำกะ');
      claimMany('E',[...get('ช4'),...get('ช4A'),...get('ช4B')],'Evacuate ประจำช่วงเย็น');
      if(!roles.E.length)roleNotes.E='ทุกคนเมื่อมีคำสั่งอพยพ';
    }else{
      // กลางคืน/วันหยุดที่ไม่มี Donor: ชบด1 เป็นหัวหน้าทีม, ชบด2 Alarm, ชบด3 Control
      // Rescue ไม่ตั้งคนประจำ และ Evacuate เป็นการปฏิบัติของทั้งทีมเมื่อมีคำสั่ง
      roleNotes.R='ไม่กำหนดผู้รับผิดชอบประจำช่วงนี้ · ไม่มีผู้บริจาคตามการทำงานปกติ';
      roleNotes.E='ทุกคนเมื่อมีคำสั่งอพยพ · หัวหน้าทีมตรวจสอบความครบถ้วน';
      const alarm=firstUnassigned(['ชบด2','ชบด3']);
      if(alarm)claim('A',alarm,'Alarm ประจำกะ');
      const control=firstUnassigned(['ชบด3','ชบด2']);
      if(control)claim('C',control,'Control ประจำกะ');
    }

    const helperInfo=kind==='weekend-donor'?helperRowsForDate(date):{loaded:true,loading:false,error:'',rows:[],total:0};
    const reportPeople=uniqueReportPeople([
      ...included.map(a=>reportStaffPerson(a.staff_id,`${window.DUTY_LABEL?.[dutyCode(a)]||dutyCode(a)}${tradeStatusSuffix(a)}`)),
      ...(kind==='weekend-donor'?helperInfo.rows.map(helperReportPerson):[])
    ]);
    if(kind==='weekend-donor'){
      note='คนมาช่วยไม่ถูกจัด R/A/C/E อัตโนมัติ แต่ต้องรวมในการตรวจนับอพยพและรายงานศูนย์อำนวยการ';
    }

    removeLeaderFromRoles(roles,leader.id);
    ROLE_ORDER.forEach(r=>{if(!roles[r].length&&!roleNotes[r])warnings.push(`${ROLE_META[r].title} ยังไม่มีผู้รับผิดชอบในเวรนี้ (ไม่จัดชื่อซ้ำข้าม R/A/C/E)`);});
    if(!included.length)warnings.push('ยังไม่มีรายชื่อเวรที่ใช้สร้าง RACE ในช่วงนี้');
    if(included.length===1&&leader.id)warnings.push('เวรนี้มีเพียงหัวหน้าทีมฉุกเฉิน 1 คน จึงยังไม่มีผู้ปฏิบัติ R/A/C/E');
    const leaderRule='หัวหน้าทีมฉุกเฉินแยกจาก R/A/C/E และผู้ปฏิบัติ 1 คนไม่ซ้ำหลายบทบาท';
    const reportCountText=(kind==='weekend-donor'&&!helperInfo.loaded)?`${included.length}+…`:String(reportPeople.length);
    return {id:windowSpec?.id||kind,label,sub,leaderId:leader.id,leaderNote:leader.note,roles,roleNotes,roleTips,warnings,teamCount:included.length,reportPeople,reportCountText,reportRosterNote:kind==='weekend-donor'?(helperInfo.loaded?'รวมคนมาช่วยในยอดตรวจนับ/รายงานศูนย์อำนวยการ แม้ไม่ถูกจัด RACE':(helperInfo.error?'ต้องตรวจรายชื่อคนมาช่วยหน้างานเพิ่ม':'กำลังตรวจรายชื่อคนมาช่วย…')):'หัวหน้าทีมตรวจนับคนจริง ณ เวลาที่เกิดเหตุ และรายงานศูนย์อำนวยการ',note:[note,leaderRule].filter(Boolean).join(' · ')};
  }

  function splitDutyPlans(date,kind,start,end,baseLabel,baseSub){
    const internal=tradeBoundaries(date,start,end);
    if(!internal.length)return [dutyPlan(date,kind,{start,end,id:kind,label:baseLabel,sub:baseSub,tradeSplit:false})];
    const bounds=[start,...internal,end].sort((a,b)=>a-b);
    const plans=[];
    for(let i=0;i<bounds.length-1;i++){
      const s=bounds[i],e=bounds[i+1];if(e<=s+0.01)continue;
      plans.push(dutyPlan(date,kind,{start:s,end:e,id:`${kind}-${Math.round(s)}-${Math.round(e)}`,label:intervalText(s,e),sub:`${baseLabel} · ${baseSub} · หลังขายเวร`,tradeSplit:true}));
    }
    return plans;
  }

  function buildPlans(date){
    const weekend=isWeekendDate(date),holiday=isHoliday(date),rows=rawDutyRows(date);
    const hasDonor=rows.some(a=>['ช3A','ช3B','ช9','ช9-เคิก','ช9-MT'].includes(dutyCode(a)));
    const hasCh4=rows.some(a=>['ช4','ช4A','ช4B'].includes(dutyCode(a)));
    if(weekend&&hasDonor){
      return [
        ...splitDutyPlans(date,'weekend-donor',480,960,'ช่วงเปิดห้องบริจาค','เสาร์–อาทิตย์ · เวรจริง 08:00–16:00'),
        ...splitDutyPlans(date,'night',960,1920,'กลางคืน','หลังห้องบริจาคปิด · เวรจริง 16:00–08:00 (+1 วัน)')
      ];
    }
    if(weekend||holiday){
      return splitDutyPlans(date,'holiday',480,1920,'วันหยุด / 24 ชม.','อิง ชบด1–3 และผู้ปฏิบัติงานจริงหลังขายเวร');
    }
    const plans=[daytimePlan(date)];
    if(hasCh4)plans.push(...splitDutyPlans(date,'evening',960,1440,'ช่วงเย็น','ชบด + ช4 · 16:00–24:00'));
    const nightStart=hasCh4?1440:960;
    plans.push(...splitDutyPlans(date,'night',nightStart,1920,'กลางคืน',hasCh4?'หลัง ช4 ปิด · ชบด 00:00–08:00':'ชบด 16:00–08:00 (+1 วัน)'));
    return plans;
  }

  function roleHtml(role,people,note='',tip=''){
    const m=ROLE_META[role];
    const body=people.length?people.map(p=>staffHtml(p.staff_id,p.secondary||p.label)).join(''):(note?`<span class="v500-role-policy">${esc(note)}</span>`:'<span class="v497-empty-person">ยังไม่มีผู้รับผิดชอบ</span>');
    return `<section class="v497-role v497-role-${role}">
      <div class="v497-role-head"><span class="v497-letter">${role}</span><div><b>${m.title}</b><small>${m.thai}</small></div><em>${people.length}</em></div>
      <div class="v497-role-people">${body}</div>
      ${tip?`<div class="v501-role-tip">${esc(tip)}</div>`:''}
    </section>`;
  }
  function reportRosterHtml(plan){
    const list=uniqueReportPeople(plan?.reportPeople||[]);
    if(!list.length)return '';
    const roleRank={R:1,A:2,C:3,E:4};
    const sorted=[...list].sort((a,b)=>{
      const aid=(a.kind==='staff'||a.staff_id)?String(a.staff_id||''):'';
      const bid=(b.kind==='staff'||b.staff_id)?String(b.staff_id||''):'';
      if(aid&&String(plan.leaderId||'')===aid)return -1;
      if(bid&&String(plan.leaderId||'')===bid)return 1;
      if(a.helper&&!b.helper)return 1;if(b.helper&&!a.helper)return -1;
      const ar=aid?roleRank[roleOfStaff(plan.roles,aid)]||9:10,br=bid?roleRank[roleOfStaff(plan.roles,bid)]||9:10;
      return ar-br;
    });
    const rows=sorted.map(p=>{
      if(p.kind==='staff'||p.staff_id){
        const id=String(p.staff_id||''),nick=staffName(id),full=staffFullName(id);
        const role=String(plan.leaderId||'')===id?'หัวหน้าทีมฉุกเฉิน':(roleOfStaff(plan.roles,id)?`${roleOfStaff(plan.roles,id)} · ${ROLE_META[roleOfStaff(plan.roles,id)].title}`:'เจ้าหน้าที่ในพื้นที่');
        return `<div class="v505-report-person"><div class="v505-report-person-main"><b>${esc(full)}</b><span>${esc(nick&&nick!==full?`(${nick}) · ${role}`:role)}</span></div>${p.note?`<small>${esc(p.note)}</small>`:''}</div>`;
      }
      return `<div class="v505-report-person v505-report-helper"><div><b>${esc(p.helper_name||'ผู้มาช่วย')}</b><span>คนมาช่วย · ${esc(p.unit_name||'นอกหน่วย')}</span></div><small>รวมในรายชื่ออพยพ/รายงานศูนย์อำนวยการ</small></div>`;
    }).join('');
    return `<details class="v505-accountability"><summary><span><b>รายชื่อที่ต้องตรวจนับ / รายงานศูนย์อำนวยการ</b><small>${esc(plan.reportRosterNote||'ตรวจนับคนจริง ณ เวลาที่เกิดเหตุ')}</small></span><strong>${esc(plan.reportCountText||String(list.length))}</strong></summary><div class="v505-report-list">${rows}</div></details>`;
  }

  function planHtml(plan,date){
    return `<div class="v497-plan" data-v497-plan="${esc(plan.id)}">
      <div class="v497-leader-row"><div><span>หัวหน้าทีมฉุกเฉิน</span>${plan.leaderId?staffHtml(plan.leaderId,plan.leaderNote):'<b class="v497-no-leader">ยังไม่มีผู้รับผิดชอบ</b>'}</div><div class="v497-team-count"><strong>${esc(plan.reportCountText||String(plan.teamCount||0))}</strong><span>คนต้องตรวจนับ</span></div></div>
      <div class="v497-role-grid">${ROLE_ORDER.map(r=>roleHtml(r,plan.roles[r]||[],plan.roleNotes?.[r]||'',plan.roleTips?.[r]||'')).join('')}</div>
      ${reportRosterHtml(plan)}
      ${plan.warnings?.length?`<div class="v497-warnings"><b>การลาวันนี้</b>${plan.warnings.map(w=>`<span>• ${esc(w)}</span>`).join('')}</div>`:''}
      <div class="v497-plan-note">${esc(plan.note||'')}</div>
      <div class="v497-actions"><button type="button" class="soft-btn" data-v497-race-info>ดูหลัก RACE ของ รพ.</button><div class="v501-ext-guide"><b>ถังดับเพลิง</b><span>ดึงสายฉีด → ปลดสลัก → กดคันบีบ → ส่ายปลายสายไปที่ฐานไฟ</span></div></div>
    </div>`;
  }
  function cardHtml(date){
    const plans=buildPlans(date);if(!plans.length)return '';
    let phase=phaseStore[date];if(!plans.some(p=>p.id===phase))phase=plans[0].id;phaseStore[date]=phase;
    const active=plans.find(p=>p.id===phase)||plans[0];
    return `<div class="card v497-race-card" data-v497-race-card data-v497-date="${esc(date)}">
      <div class="section-title v497-title"><div><h3>Code 01 · RACE ประจำวัน</h3><span class="hint">${esc(thaiDate(date))} · สร้างจากคนที่อยู่หน้างานใน Staff Planner</span></div><span class="v497-auto-badge">AUTO</span></div>
      <div class="v497-phase-tabs">${plans.map(p=>`<button type="button" class="${p.id===phase?'active':''}" data-v497-phase="${esc(p.id)}" data-v497-date="${esc(date)}"><b>${esc(p.label)}</b><small>${esc(p.sub)}</small></button>`).join('')}</div>
      ${planHtml(active,date)}
    </div>`;
  }

  function decorateDutySummary(root,date){
    try{
      const groups=new Map();
      effectiveDutySegments(date).forEach(a=>{
        const code=dutyCode(a);if(!code)return;
        if(!groups.has(code))groups.set(code,[]);
        groups.get(code).push(a);
      });
      const changed=[...groups.entries()].filter(([,rows])=>rows.some(a=>String(a?._effective_kind||'owner')!=='owner'));
      if(!changed.length)return;
      const cards=[...root.querySelectorAll('.card')];
      const dutyCard=cards.find(c=>/^(เวรวันนี้|เวร)$/.test(txt(c.querySelector('.section-title h3')?.textContent)));
      if(!dutyCard)return;
      const tableRows=[...dutyCard.querySelectorAll('tbody tr')];
      changed.forEach(([code,rows])=>{
        const label=txt(window.DUTY_LABEL?.[code]||((typeof DUTY_LABEL!=='undefined'&&DUTY_LABEL?.[code])||code));
        const tr=tableRows.find(r=>txt(r.querySelector('td:first-child')?.textContent)===label);
        const cell=tr?.querySelector('td:nth-child(2)');if(!cell)return;
        const parts=rows.slice().sort((a,b)=>Number(a._effective_start)-Number(b._effective_start)).map(a=>{
          const time=intervalText(Number(a._effective_start),Number(a._effective_end));
          let pill='';
          try{pill=staffPill(a.staff_id);}catch(_){pill=`<b>${esc(staffName(a.staff_id))}</b>`;}
          return `<div class="v548-duty-summary-line"><span>${esc(time)}</span>${pill}</div>`;
        });
        cell.innerHTML=`<div class="v548-duty-summary-split">${parts.join('')}</div>`;
      });
    }catch(err){console.warn(`[${VERSION}] duty summary decoration skipped`,err);}
  }

  function decorateHtml(html){
    try{
      const date=selectedDate();const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decorateDutySummary(tpl.content,date);
      if(tpl.content.querySelector('[data-v497-race-card]')){
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
      }
      const t=document.createElement('template');t.innerHTML=cardHtml(date).trim();const card=t.content.firstElementChild;if(!card)return html;
      const pos=tpl.content.querySelector('[data-v434-daytime-positions]');
      const details=tpl.content.querySelector('.v401-dashboard-details');
      if(pos&&pos.parentNode)pos.insertAdjacentElement('afterend',card);
      else if(details&&details.parentNode)details.parentNode.insertBefore(card,details);
      else return html;
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decoration skipped`,err);return html;}
  }

  const previous=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previous==='function'){
    const wrapped=function renderDashboardV505(){return decorateHtml(previous.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function currentPlan(date,id){return buildPlans(date).find(p=>p.id===id)||buildPlans(date)[0];}
  function showRaceInfo(){
    const body=`<div class="v497-info"><p class="hint">ใช้คำและหลักตามบอร์ด Code 01 ของโรงพยาบาล</p>
      <div><b>R — Rescue</b><span>ช่วยเหลือผู้ป่วย/ผู้ที่อยู่ในพื้นที่เสี่ยง คัดกรองตามแผน และพาไปยังจุดปลอดภัยของหน่วยงาน<br><strong>ผู้บริจาค:</strong> สายเหลือง = ต้องมีเจ้าหน้าที่ช่วยดูแล/ช่วยอพยพ; ผู้ที่ถอดเข็มแล้ว อาการปกติ และเดินได้เอง ให้เจ้าหน้าที่นำทางไปจุดรวมพล</span></div>
      <div><b>A — Alarm</b><span>ดึงสัญญาณแจ้งเตือน แจ้งเพื่อนร่วมงาน/พื้นที่ใกล้เคียง และโทรแจ้งเหตุฉุกเฉิน (ภายใน 6888 · 02-839-6888)</span></div>
      <div><b>C — Control</b><span>ควบคุมพื้นที่ ปิดแหล่งเสี่ยงตามแผน และระงับเหตุขั้นต้นด้วยถังดับเพลิงเมื่อทำได้อย่างปลอดภัย<br><strong>ถังดับเพลิง:</strong> ดึงสายฉีด → ปลดสลัก → กดคันบีบ → ส่ายปลายสายไปที่ฐานไฟ</span></div>
      <div><b>E — Evacuate</b><span>นำทางอพยพไปจุดรวมพล เคลื่อนย้ายสิ่งจำเป็น รวบรวมรายชื่อ และตรวจสอบผู้ตกค้าง</span></div>
      <p class="v497-info-note">หัวหน้าทีมฉุกเฉินคุมภาพรวมและไม่ถือ R/A/C/E ซ้ำ ผู้ปฏิบัติแต่ละคนมี RACE หลักเพียง 1 บทบาท ส่วนช่วงกลางคืน Rescue/Evacuate อาจกำหนดเป็นการปฏิบัติตามสถานการณ์แทนการใส่ชื่อซ้ำ</p></div>`;
    try{showModal(`<h2>Code 01 · RACE</h2>${body}`);}catch(_){alert('RACE: Rescue · Alarm · Control · Evacuate');}
  }

  document.addEventListener('click',e=>{
    const phase=e.target.closest?.('[data-v497-phase]');
    if(phase){
      const date=phase.dataset.v497Date||selectedDate();phaseStore[date]=phase.dataset.v497Phase;
      try{if(String(S().page||'')==='dashboard'&&typeof renderPage==='function')renderPage();}catch(_){ }
      return;
    }
    if(e.target.closest?.('[data-v497-race-info]'))showRaceInfo();
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v497-race-code01-daily-board';
  style.textContent=`
    .v497-race-card{margin-bottom:14px;border:1px solid #e4eaf0;background:linear-gradient(180deg,#fff,#fbfdff)}
    .v497-title{align-items:flex-start;gap:10px;margin-bottom:10px}.v497-title h3{margin:0 0 2px;font-size:18px}.v497-title .hint{font-size:11px}
    .v497-auto-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eef6ff;border:1px solid #cfe3f8;color:#3973a8;font-size:9px;font-weight:900;letter-spacing:.05em}
    .v497-phase-tabs{display:flex;gap:7px;overflow:auto;padding:1px 1px 8px;scrollbar-width:thin}.v497-phase-tabs button{min-width:150px;max-width:230px;border:1px solid #dde7f0;background:#fff;border-radius:11px;padding:8px 10px;text-align:left;color:#51697f;cursor:pointer}.v497-phase-tabs button.active{border-color:#7dc5f4;background:#eef8ff;box-shadow:inset 0 0 0 1px rgba(57,143,202,.08)}.v497-phase-tabs b{display:block;font-size:11px;color:#294963}.v497-phase-tabs small{display:block;font-size:8.5px;line-height:1.25;margin-top:2px;color:#8193a5}
    .v497-plan{display:grid;gap:9px}.v497-leader-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #dce8d9;border-radius:11px;background:#f8fff7}.v497-leader-row>div:first-child{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.v497-leader-row>div:first-child>span:first-child{font-size:10px;font-weight:850;color:#5f7659}.v497-person{display:inline-flex;align-items:center;gap:5px;min-width:0}.v497-person .staff-color-pill{font-size:10px!important;padding:4px 7px!important}.v497-person small{font-size:8px;color:#75889a;line-height:1.15}.v497-person-fallback{font-size:10px;font-weight:850;color:#2d4b64}.v497-no-leader{font-size:10px;color:#b45309}.v497-team-count{display:flex;align-items:baseline;gap:4px;white-space:nowrap}.v497-team-count strong{font-size:20px;line-height:1;color:#2b6f9e}.v497-team-count span{font-size:8px;color:#8293a4}
    .v497-role-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.v497-role{min-width:0;border:1px solid #e3e9ef;border-radius:11px;padding:8px;background:#fff}.v497-role-R{border-top:3px solid #60a5fa;background:#f8fbff}.v497-role-A{border-top:3px solid #f29aa5;background:#fff9fa}.v497-role-C{border-top:3px solid #7ac79a;background:#f9fefa}.v497-role-E{border-top:3px solid #e9b26b;background:#fffaf3}.v497-role-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:6px}.v497-letter{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#f0f4f7;font-size:11px;font-weight:950;color:#263e54}.v497-role-head b{display:block;font-size:11px;color:#2e485f}.v497-role-head small{display:block;font-size:7.5px;line-height:1.15;color:#8696a5;margin-top:1px}.v497-role-head em{font-style:normal;font-size:8px;font-weight:900;color:#8393a2;background:#f1f5f8;padding:2px 5px;border-radius:999px}.v497-role-people{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.v497-role-people .v497-person{display:flex;flex:1 1 100%;justify-content:flex-start}.v497-role-people .v497-person small{margin-left:auto;text-align:right;max-width:58%;overflow-wrap:anywhere}.v500-role-policy{display:block;font-size:8.5px;line-height:1.35;color:#657b8e;background:#f4f7fa;border:1px dashed #cfdae4;border-radius:8px;padding:6px 7px}.v497-empty-person{font-size:9px;color:#a66a20;background:#fff4df;border:1px solid #f6d6a7;border-radius:8px;padding:4px 6px}
    .v497-warnings{display:grid;gap:3px;padding:8px 10px;border:1px solid #f3d4a4;border-radius:10px;background:#fffaf2;color:#8a5a19}.v497-warnings b{font-size:9px}.v497-warnings span{font-size:8px;line-height:1.3}.v497-plan-note{font-size:8.5px;line-height:1.35;color:#8191a0}.v497-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}.v497-actions .soft-btn{font-size:9px!important;padding:6px 8px!important}.v501-ext-guide{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 10px;border:1px solid #f1c77a;border-radius:10px;background:#fff9ed;color:#76511d;font-size:9px;line-height:1.35}.v501-ext-guide b{white-space:nowrap;color:#9a5b00}.v501-ext-guide span{font-weight:700}.v501-role-tip{margin-top:7px;padding:6px 8px;border-radius:8px;background:#fff8df;border:1px solid #f3df96;color:#715b20;font-size:8px;line-height:1.5;white-space:pre-line}
    .v505-accountability{border:1px solid #d5e4ef;border-radius:11px;background:#f8fcff;overflow:hidden}.v505-accountability summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;cursor:pointer}.v505-accountability summary::-webkit-details-marker{display:none}.v505-accountability summary span{display:grid;gap:1px}.v505-accountability summary b{font-size:10px;color:#315a76}.v505-accountability summary small{font-size:8px;line-height:1.25;color:#7b8fa0}.v505-accountability summary strong{display:grid;place-items:center;min-width:31px;height:31px;padding:0 7px;border-radius:999px;background:#e5f4ff;color:#236b98;font-size:14px}.v505-report-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0 9px 9px}.v505-report-person{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:7px 8px;border:1px solid #e2eaf0;border-radius:9px;background:#fff;min-width:0}.v505-report-person-main{display:grid;gap:1px;min-width:0}.v505-report-person b{font-size:10px;color:#263f54;overflow-wrap:anywhere}.v505-report-person span{font-size:8px;color:#6f8394;line-height:1.25}.v505-report-person>small{font-size:7.5px;color:#8797a5;text-align:right;max-width:45%;line-height:1.25}.v505-report-helper{border-color:#bfe2d1;background:#f7fffb}.v505-report-helper>div{display:grid;gap:1px}
    .v497-info{display:grid;gap:8px}.v497-info>div{display:grid;gap:2px;padding:9px 10px;border:1px solid #e3eaf0;border-radius:10px;background:#fbfdff}.v497-info b{font-size:13px;color:#2e4b64}.v497-info span{font-size:12px;line-height:1.45;color:#5c7184}.v497-info-note{font-size:11px;color:#6c7e8f;background:#f6f8fa;padding:8px 10px;border-radius:9px}
    @media(max-width:1050px){.v497-role-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:820px){.v497-title h3{font-size:17px}.v497-title .hint{font-size:10px}.v497-phase-tabs button{min-width:135px;padding:8px}.v497-role-grid{grid-template-columns:1fr 1fr;gap:7px}.v497-role{padding:9px}.v497-role-head b{font-size:12px}.v497-role-head small{font-size:8px}.v497-role-people .staff-color-pill{font-size:11px!important}.v497-leader-row{align-items:flex-start}.v497-team-count strong{font-size:22px}.v497-actions{justify-content:stretch}.v497-actions .soft-btn{flex:0 0 auto;min-height:36px;font-size:10px!important}.v501-ext-guide{flex:1 1 100%;font-size:9.5px}.v497-warnings span{font-size:9px}.v497-plan-note{font-size:9px}}
    @media(max-width:430px){.v505-report-list{grid-template-columns:1fr}.v505-accountability summary b{font-size:11px}.v505-accountability summary small{font-size:9px}.v497-role-grid{grid-template-columns:1fr}.v497-role-people .v497-person{flex:0 1 auto}.v497-role-people .v497-person small{max-width:none;margin-left:0}.v497-leader-row{display:grid;grid-template-columns:1fr auto}.v497-phase-tabs button{min-width:125px}.v497-title{margin-bottom:8px}}
    .v548-duty-summary-split{display:grid;gap:5px}.v548-duty-summary-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.v548-duty-summary-line>span{font-size:11px;font-weight:800;color:#50677d;background:#f3f7fa;border-radius:999px;padding:2px 7px}
  `;
  document.head.appendChild(style);

  window.cnmiV549Race={version:VERSION,buildPlans,daytimePlan,dutyPlan,positionRole,selectedDate,reportRosterHtml,effectiveDutyRows,tradeBoundaries,rawDutyRows,effectiveDutySegments,completedTradeRowsForDate,tradeMatchesAssignment};
  window.cnmiV505Race=window.cnmiV549Race;
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v549-race-effective-duty-final.js", error); }
;

/* Original source: patch-v504-physician-self-managed-leave.js */
try {
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

} catch (error) { console.error("[v569] patch-v504-physician-self-managed-leave.js", error); }
;

/* Original source: patch-v506-offday-hide-activity-dashboard.js */
try {
/* CNMI Staff Planner V506
 * Weekend / public-holiday Dashboard cleanup.
 * - Hide the "กิจกรรมวันนี้ / กิจกรรม" summary/detail card on Saturday, Sunday and public holidays.
 * - Keep weekday Dashboard unchanged.
 * - Let the holiday manpower card use the freed width when applicable.
 * - Display-only; no SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V506_OFFDAY_HIDE_ACTIVITY_DASHBOARD';
  if(window.__CNMI_V506_OFFDAY_HIDE_ACTIVITY_DASHBOARD__)return;
  window.__CNMI_V506_OFFDAY_HIDE_ACTIVITY_DASHBOARD__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(todayStr());}
    catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function isWeekendSafe(date){
    try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}
    catch(_){return false;}
  }
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function isOffDay(date){
    try{
      const api=window.cnmiDashboardHolidayManpowerV440;
      if(api&&typeof api.isOffDay==='function')return !!api.isOffDay(date);
    }catch(_){ }
    return isWeekendSafe(date)||isHolidaySafe(date);
  }
  function text(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim();}
  function isActivityStat(card){
    const label=text(card?.querySelector?.('.label'));
    return label==='กิจกรรมวันนี้'||label==='กิจกรรม'||label.includes('กิจกรรมวันนี้');
  }
  function isActivityCard(card){
    const title=text(card?.querySelector?.('.section-title h3')||card?.querySelector?.('h3'));
    return title==='กิจกรรมวันนี้'||title==='กิจกรรม'||title.includes('กิจกรรมวันนี้');
  }
  function cleanOffday(html){
    const date=selectedDate();
    if(!isOffDay(date))return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'');
      let removed=false;

      tpl.content.querySelectorAll('.v401-dashboard-stats').forEach(stats=>{
        [...stats.querySelectorAll(':scope > .stat-card')].forEach(card=>{
          if(isActivityStat(card)){card.remove();removed=true;}
        });
        stats.classList.add('v506-offday-no-activity');
      });

      [...tpl.content.querySelectorAll('.card')].forEach(card=>{
        if(isActivityCard(card)){card.remove();removed=true;}
      });

      // Defensive cleanup for legacy activity card class if the title was changed by another patch.
      tpl.content.querySelectorAll('.v401-dashboard-activity-card').forEach(card=>{card.remove();removed=true;});

      if(removed){
        tpl.content.querySelectorAll('.v401-dashboard-stats').forEach(stats=>stats.classList.add('v506-offday-no-activity'));
      }

      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){
      console.warn('[V506] off-day activity cleanup fallback',err);
      return html;
    }
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV506(){return cleanOffday(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v506-offday-hide-activity-dashboard';
  style.textContent=`
    .v401-dashboard-stats.v506-offday-no-activity>[data-v440-holiday-manpower],
    .v401-dashboard-stats.v506-offday-no-activity>[data-v433-manpower]{grid-column:1/-1!important}
  `;
  document.head.appendChild(style);

  window.cnmiV506={version:VERSION,isOffDay,selectedDate,cleanOffday};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v506-offday-hide-activity-dashboard.js", error); }
;

/* Original source: patch-v510-physician-dashboard-consult-sync.js */
try {
/* CNMI Staff Planner V510
 * Physician dashboard separation + Consult leave sync
 *
 * Goals
 * 1) Physician leave is self-managed and must not appear in Staff leave/no-duty dashboard lists.
 * 2) General Staff manpower summary is MT/Clerk only; physician availability belongs to Consult.
 * 3) Physician Consult must respect active physician leave on the selected Dashboard date.
 *    - Full-day leave: assigned physician is shown as unavailable and readiness decreases.
 *    - Half-day leave: daytime/24h Consult is shown as partially unavailable and readiness decreases.
 *    - 16:00-08:00 Consult is not blocked by a daytime half-day leave.
 * 4) No schema / SQL changes.
 */
(function(){
  'use strict';
  const VERSION='V510_PHYSICIAN_DASHBOARD_CONSULT_SYNC';
  if(window.__CNMI_V510_PHYSICIAN_DASHBOARD_CONSULT_SYNC__)return;
  window.__CNMI_V510_PHYSICIAN_DASHBOARD_CONSULT_SYNC__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S()?.dashboardDateV443)||normDate(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function profileText(p){return `${txt(p?.staff_type)} ${txt(p?.role)} ${txt(p?.position)} ${txt(p?.job_title)}`;}
  function isPhysicianProfile(p){if(!p)return false;if(window.cnmiPersonTypeV516?.isPhysician)return window.cnmiPersonTypeV516.isPhysician(p);const type=txt(p?.staff_type);if(/นักเทคนิคการแพทย์|เทคนิคการแพทย์/i.test(profileText(p)))return false;return /^(แพทย์|physician|doctor)$/i.test(type);}
  function staffById(id){return (S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
  function isPhysicianId(id){
    try{if(window.cnmiPhysicianLeaveV504?.isPhysicianId)return !!window.cnmiPhysicianLeaveV504.isPhysicianId(id);}catch(_){}
    return isPhysicianProfile(staffById(id));
  }
  function nick(id){const p=staffById(id);return txt(p?.nickname||p?.full_name||p?.email||'แพทย์');}
  function activeStaffOnly(date){return (S()?.staff||[]).filter(p=>{if(!p||p.is_active===false||p.active===false||isPhysicianProfile(p))return false;try{if(window.cnmiStaffLifecycleV462?.employmentOn&&!window.cnmiStaffLifecycleV462.employmentOn(p,date))return false;}catch(_){}return true;});}
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}catch(_){return !/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}}
  function overlaps(row,date){
    try{return typeof overlapsDate==='function'?!!overlapsDate(row,date):normDate(row?.start_date)<=date&&normDate(row?.end_date||row?.start_date)>=date;}
    catch(_){return false;}
  }
  function leaveType(row){return txt(row?.type||row?.leave_type).split(':::')[0].trim();}
  function actualLeave(row){return !!row&&effective(row)&&leaveType(row)&&leaveType(row)!=='ไม่รับเวร';}
  function periodKind(row){
    const raw=txt(row?.leave_period||row?.period||'เต็มวัน').toLowerCase();
    if(/ครึ่งเช้า|เช้า|morning/.test(raw))return 'morning';
    if(/ครึ่งบ่าย|บ่าย|afternoon/.test(raw))return 'afternoon';
    return 'full';
  }
  function physicianLeaves(id,date){return (S()?.leaves||[]).filter(r=>String(r?.staff_id||'')===String(id||'')&&actualLeave(r)&&overlaps(r,date));}
  function leaveStatusForTime(id,date,time){
    const rows=physicianLeaves(id,date);if(!rows.length)return null;
    const kinds=new Set(rows.map(periodKind));
    if(kinds.has('full')||(kinds.has('morning')&&kinds.has('afternoon')))return {kind:'full',label:'ลาเต็มวัน'};
    const t=txt(time);
    const daytime=/08:?00.*16:?00|กลางวัน/i.test(t);
    const allDay=/24\s*ชม|ตลอดวัน|ทั้งวัน/i.test(t);
    const overnight=/16:?00.*08:?00|กลางคืน|นอกเวลา/i.test(t);
    if(overnight&&!allDay)return null;
    if(daytime||allDay){
      if(kinds.has('morning'))return {kind:'partial',label:'ลาครึ่งเช้า'};
      if(kinds.has('afternoon'))return {kind:'partial',label:'ลาครึ่งบ่าย'};
    }
    return null;
  }
  function physicianNames(){
    const set=new Set();
    (S()?.staff||[]).filter(isPhysicianProfile).forEach(p=>[p?.nickname,p?.full_name,p?.email].map(txt).filter(Boolean).forEach(x=>set.add(x)));
    return set;
  }

  function staffOnlyManpower(date){
    const staff=activeStaffOnly(date),byId=new Set(staff.map(p=>String(p.id)));
    const absentMorning=new Set(),absentAfternoon=new Set();
    (S()?.leaves||[]).forEach(r=>{
      const sid=String(r?.staff_id||'');if(!sid||!byId.has(sid)||!actualLeave(r)||!overlaps(r,date))return;
      const k=periodKind(r);if(k==='full'||k==='morning')absentMorning.add(sid);if(k==='full'||k==='afternoon')absentAfternoon.add(sid);
    });
    const group=p=>{const text=profileText(p);return txt(p?.staff_type)==='เคิก'||/clerk|ธุรการ/i.test(text)?'เคิก':'MT';};
    const total={MT:0,'เคิก':0},morning={MT:0,'เคิก':0},afternoon={MT:0,'เคิก':0};
    staff.forEach(p=>{const sid=String(p.id),g=group(p);total[g]++;if(!absentMorning.has(sid))morning[g]++;if(!absentAfternoon.has(sid))afternoon[g]++;});
    const sum=x=>(x.MT||0)+(x['เคิก']||0);
    return {total,morning,afternoon,morningCount:sum(morning),afternoonCount:sum(afternoon)};
  }

  function cleanLeaveCard(root,date){
    const names=physicianNames();
    const cards=[...root.querySelectorAll?.('.card')||[]];
    const card=cards.find(c=>/ลา\s*\/\s*ไม่รับเวร|ลา\s*\/\s*ไม่รับเวรวันนี้/.test(txt(c.querySelector('h3')?.textContent)));
    if(card){
      card.querySelectorAll('.v397-today-item').forEach(item=>{const n=txt(item.querySelector('b')?.textContent);if(names.has(n))item.remove();});
      card.querySelectorAll('.v460-no-duty-row').forEach(item=>{const n=txt(item.querySelector('.v460-no-duty-name')?.textContent);if(names.has(n))item.remove();});
      const list=card.querySelector('.v397-today-list');
      if(list&&list.querySelectorAll('.v397-today-item').length===0){list.remove();if(!card.querySelector('.empty-state'))card.insertAdjacentHTML('beforeend','<div class="empty-state">วันนี้ไม่มีรายการลา/ไม่รับเวร</div>');}
    }
    const staffLeaveCount=(S()?.leaves||[]).filter(r=>actualLeave(r)&&overlaps(r,date)&&!isPhysicianId(r?.staff_id)).length;
    root.querySelectorAll('.stat-card').forEach(c=>{const label=txt(c.querySelector('.label')?.textContent);if(/^คนลา(?:วันนี้)?$/.test(label)){const num=c.querySelector('.num');if(num)num.textContent=String(staffLeaveCount);}});
  }

  function cleanManpower(root,date){
    const m=staffOnlyManpower(date),card=root.querySelector?.('[data-v433-manpower],.v433-manpower-card');
    if(card){
      const totals=[...card.querySelectorAll('.v433-period-totals>div:not(.v433-divider)')];
      if(totals[0]?.querySelector('strong'))totals[0].querySelector('strong').textContent=String(m.morningCount);
      if(totals[1]?.querySelector('strong'))totals[1].querySelector('strong').textContent=String(m.afternoonCount);
      card.querySelectorAll('.v433-type-line').forEach(line=>{
        const label=txt(line.querySelector('b')?.textContent)||'ช่วง';
        const src=/เช้า/.test(label)?m.morning:m.afternoon;
        line.innerHTML=`<b>${esc(label)}</b><span>MT <strong>${src.MT||0}</strong>/${m.total.MT||0}</span><span>เคิก <strong>${src['เคิก']||0}</strong>/${m.total['เคิก']||0}</span>`;
      });
      const note=card.querySelector('.v433-manpower-note');if(note)note.textContent='เต็มวันหักทั้งวัน · ครึ่งวันหักเฉพาะช่วง · แพทย์ดูสถานะที่ Consult';
    }
    root.querySelectorAll('.v460-offday-detail>div').forEach(row=>{
      const b=txt(row.querySelector('b')?.textContent);if(b!=='เวร')return;const span=row.querySelector('span');if(!span)return;
      span.textContent=txt(span.textContent).replace(/\s*[•·]\s*แพทย์\s*\d+/g,'').replace(/แพทย์\s*\d+\s*[•·]?\s*/g,'').trim();
    });
  }

  function consultAssignments(date){
    try{
      const api=window.cnmiPhysicianConsultV452,m=api?.baseForDate?.(date);if(!m)return [];
      if(m.weekday)return [
        {id:m.donor,time:'08:00–16:00',site:'Donor'},
        {id:m.bb,time:'08:00–16:00',site:'Blood Bank'},
        {id:m.combined,time:'16:00–08:00',site:'Donor & BB'}
      ];
      return [{id:m.combined,time:'24 ชม.',site:'Donor & BB'}];
    }catch(_){return [];}
  }
  function syncConsult(root,date){
    const card=root.querySelector?.('[data-v452-physician-card]');if(!card)return;
    const assignments=consultAssignments(date);if(!assignments.length)return;
    let unavailable=0;
    assignments.forEach(a=>{if(a?.id&&leaveStatusForTime(a.id,date,a.time))unavailable++;});
    card.querySelectorAll('[data-v455-doctor-id]').forEach(el=>{
      const id=el.getAttribute('data-v455-doctor-id'),time=el.getAttribute('data-v455-time')||'';
      const st=leaveStatusForTime(id,date,time);if(!st)return;
      const replacement=document.createElement('span');replacement.className=`v510-consult-leave ${st.kind==='full'?'is-full':'is-partial'}`;
      replacement.setAttribute('data-v510-physician-leave',st.kind);replacement.textContent=`${nick(id)} · ${st.label}`;replacement.title='แพทย์บันทึกลางานใน Staff Planner';el.replaceWith(replacement);
    });
    const ready=assignments.filter(a=>a?.id&&!leaveStatusForTime(a.id,date,a.time)).length,total=assignments.length;
    const badge=card.querySelector('.v452-ready');if(badge){badge.textContent=`พร้อม ${ready}/${total}`;badge.classList.toggle('is-complete',ready===total);badge.classList.toggle('v510-has-leave',unavailable>0);}
  }

  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;const date=selectedDate();
      cleanLeaveCard(tpl.content,date);cleanManpower(tpl.content,date);syncConsult(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] decorate`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV510(){return decorate(previousDashboard.apply(this,arguments));};
    wrapped.__v510Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v510-style';style.textContent=`
    .v510-consult-leave{display:inline-flex;align-items:center;min-height:30px;padding:5px 9px;border-radius:999px;font-weight:850;font-size:11px;line-height:1.2}
    .v510-consult-leave.is-full{background:#fff0ef;border:1px solid #ffc9c5;color:#a33b35}
    .v510-consult-leave.is-partial{background:#fff7e7;border:1px solid #ffd99a;color:#956111}
    .v452-ready.v510-has-leave{background:#fff7e7!important;border-color:#ffd99a!important;color:#956111!important}
    @media(max-width:760px){.v510-consult-leave{font-size:13px;min-height:36px;padding:7px 11px;white-space:normal}}
  `;document.head.appendChild(style);

  window.cnmiPhysicianDashboardV510={version:VERSION,decorate,leaveStatusForTime,staffOnlyManpower};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v510-physician-dashboard-consult-sync.js", error); }
;

/* Original source: patch-v511-leave-list-physician-hr-split.js */
try {
/* CNMI Staff Planner V511
 * Restore Dashboard leave/no-duty list after V510 physician separation.
 * - All operational absences remain visible, including physician leave.
 * - Physician leave is self-managed: no HR status / HR workflow badge.
 * - Staff leave keeps HR status exactly as before.
 * - General manpower remains MT/Clerk only; Consult remains physician-aware.
 * Display/workflow split only; no schema / SQL changes.
 */
(function(){
  'use strict';
  const VERSION='V511_LEAVE_LIST_PHYSICIAN_HR_SPLIT';
  if(window.__CNMI_V511_LEAVE_LIST_PHYSICIAN_HR_SPLIT__)return;
  window.__CNMI_V511_LEAVE_LIST_PHYSICIAN_HR_SPLIT__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S()?.dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}catch(_){return true;}}
  function overlaps(row,date){try{return typeof overlapsDate==='function'?!!overlapsDate(row,date):norm(row?.start_date)<=date&&norm(row?.end_date||row?.start_date)>=date;}catch(_){return false;}}
  function rowType(row){return txt(row?.type||row?.leave_type).split(':::')[0].trim();}
  function isNoDuty(row){return rowType(row)==='ไม่รับเวร';}
  function isLeave(row){return !!row&&effective(row)&&!!rowType(row)&&!isNoDuty(row);}
  function isVisible(row,date){return !!row&&effective(row)&&!!rowType(row)&&overlaps(row,date);}
  function isPhysicianId(id){
    try{if(window.cnmiPhysicianLeaveV504?.isPhysicianId)return !!window.cnmiPhysicianLeaveV504.isPhysicianId(id);}catch(_){}
    const p=(S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''));
    if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);
    const type=txt(p?.staff_type);return !!p&&/^(แพทย์|physician|doctor)$/i.test(type);
  }
  function nick(id){try{return typeof staffNick==='function'?txt(staffNick(id)):txt((S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''))?.nickname||id);}catch(_){return txt(id)||'-';}}
  function periodLabel(row){
    const raw=txt(row?.leave_period||row?.period||'เต็มวัน');
    if(!raw||raw==='เต็มวัน'||raw==='ทั้งวัน')return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw;
  }
  function displayType(row){
    if(isNoDuty(row))return 'ไม่รับเวร';
    try{return typeof leaveDisplayType==='function'?txt(leaveDisplayType(row)):(rowType(row)||'ลา');}catch(_){return rowType(row)||'ลา';}
  }
  function badgeHtml(label,row){
    try{
      const cls=isNoDuty(row)?'gray':(typeof leaveBadgeClass==='function'?leaveBadgeClass(label):'blue');
      if(typeof badge==='function')return badge(label,cls);
    }catch(_){}
    return `<span class="badge">${esc(label)}</span>`;
  }
  function reason(row){
    try{return typeof leaveReasonText==='function'?txt(leaveReasonText(row)):txt(row?.reason||row?.note);}catch(_){return txt(row?.reason||row?.note);}
  }
  function dateLabel(row){
    const f=v=>{try{return typeof formatThaiDate==='function'?formatThaiDate(v):txt(v);}catch(_){return txt(v);}};
    const a=norm(row?.start_date),b=norm(row?.end_date||row?.start_date);
    return a===b?f(a):`${f(a)}–${f(b)}`;
  }
  function rankLeave(row,date){try{return Number(window.cnmiLeaveSequenceV431?.rankFor?.(row,date))||null;}catch(_){return null;}}
  function rankNoDuty(row,date){try{return Number(window.cnmiNoDutySequenceV436?.rankFor?.(row,date))||null;}catch(_){return null;}}
  function submittedMs(row){
    try{if(isNoDuty(row)&&window.cnmiNoDutySequenceV436?.submittedMs)return Number(window.cnmiNoDutySequenceV436.submittedMs(row));}catch(_){}
    try{if(window.cnmiLeaveSequenceV431?.leaveSubmittedMs)return Number(window.cnmiLeaveSequenceV431.leaveSubmittedMs(row));}catch(_){}
    const n=Date.parse(String(row?.created_at||row?.submitted_at||row?.updated_at||''));return Number.isFinite(n)?n:Number.POSITIVE_INFINITY;
  }
  function hrMeta(row){
    if(!isLeave(row)||isPhysicianId(row?.staff_id))return null;
    const id=String(row?.id||'');
    const h=(S()?.hrChecks||[]).find(x=>String(x?.leave_request_id||'')===id)||null;
    const status=txt(h?.status);
    if(status==='ตรวจสอบแล้ว')return {label:'✓ ตรวจสอบ HR แล้ว',cls:'is-done'};
    if(status==='รอเอกสาร')return {label:'รอเอกสาร HR',cls:'is-waiting'};
    if(status==='ยกเลิก')return {label:'HR ยกเลิก',cls:'is-muted'};
    if(h?.hr_reported_date)return {label:'รอตรวจสอบ HR',cls:'is-pending'};
    return {label:'ยังไม่ลง HR',cls:'is-not-reported'};
  }
  function hrHtml(row){const m=hrMeta(row);return m?` <span class="v445-hr-pill v453-hr-pill v511-dashboard-hr-pill ${m.cls}">${esc(m.label)}</span>`:'';}
  function lateHtml(row,date){
    if(!isLeave(row)||isPhysicianId(row?.staff_id))return '';
    try{return window.cnmiLateLeaveV430?.isLateLeaveForDate?.(row,date)?' <span class="v430-late-leave-badge">ลานอกตาราง</span>':'';}catch(_){return '';}
  }
  function sequenceHtml(row,date){
    if(isNoDuty(row)){
      const r=rankNoDuty(row,date);return r?` <button type="button" class="v436-no-duty-rank-badge" data-v436-no-duty-rank="${r}" data-v436-date="${esc(date)}" data-v436-staff="${esc(row?.staff_id)}" title="แตะดูเวลาที่บันทึกครั้งแรก">ลำดับไม่รับเวร ${r}</button>`:'';
    }
    const r=rankLeave(row,date);return r?` <span class="v431-leave-rank-badge">ลำดับลา ${r}</span>`:'';
  }
  function itemHtml(row,date){
    const physician=isPhysicianId(row?.staff_id);
    const label=displayType(row);
    const cls=(function(){try{return !physician&&window.cnmiLateLeaveV430?.isLateLeaveForDate?.(row,date)?' v430-late-today-item':'';}catch(_){return '';}})();
    const note=reason(row);
    return `<div class="v397-today-item${cls}" data-v511-staff="${esc(row?.staff_id)}" data-v511-physician="${physician?'1':'0'}"><div><b>${esc(nick(row?.staff_id))}</b>${sequenceHtml(row,date)} ${badgeHtml(label,row)}${hrHtml(row)}${lateHtml(row,date)}</div><div class="v397-detail-line">ช่วงเวลา: <span class="v397-period">${esc(periodLabel(row))}</span> · วันที่: ${esc(dateLabel(row))}</div>${note?`<div class="v397-detail-note">เหตุผล: ${esc(note)}</div>`:''}</div>`;
  }

  function rowsFor(date){
    const rows=(S()?.leaves||[]).filter(r=>isVisible(r,date));
    const leaves=rows.filter(isLeave).sort((a,b)=>{
      const ra=rankLeave(a,date)||99999,rb=rankLeave(b,date)||99999;if(ra!==rb)return ra-rb;
      return submittedMs(a)-submittedMs(b);
    });
    const noDuty=rows.filter(isNoDuty).sort((a,b)=>{
      const ra=rankNoDuty(a,date)||99999,rb=rankNoDuty(b,date)||99999;if(ra!==rb)return ra-rb;
      return submittedMs(a)-submittedMs(b);
    });
    return [...leaves,...noDuty];
  }

  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    const date=selectedDate();
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      const cards=[...tpl.content.querySelectorAll('.card')];
      const card=cards.find(c=>/ลา\s*\/\s*ไม่รับเวร/.test(txt(c.querySelector('h3')?.textContent)));
      if(!card)return html;
      const rows=rowsFor(date);
      card.querySelectorAll('.v397-today-list,.empty-state,.v431-rank-help,.v436-rank-help').forEach(n=>n.remove());
      const title=card.querySelector('.section-title');
      const help=document.createElement('div');help.className='v431-rank-help v436-rank-help';help.textContent='ลำดับลาและลำดับไม่รับเวร แยกกัน เรียงตามเวลาที่บันทึกครั้งแรก';
      if(title)title.insertAdjacentElement('afterend',help);
      if(rows.length){
        const list=document.createElement('div');list.className='v397-today-list v511-leave-list';list.innerHTML=rows.map(r=>itemHtml(r,date)).join('');
        help.insertAdjacentElement('afterend',list);
      }else{
        const empty=document.createElement('div');empty.className='empty-state';empty.textContent=date===norm(typeof todayStr==='function'?todayStr():'')?'วันนี้ไม่มีรายการลา/ไม่รับเวร':'ไม่มีรายการลา/ไม่รับเวรในวันที่เลือก';
        help.insertAdjacentElement('afterend',empty);
      }
      // Leave statistic = all real leave records, including physician leave; no-duty is separate.
      const leaveCount=rows.filter(isLeave).length;
      tpl.content.querySelectorAll('.stat-card').forEach(c=>{const label=txt(c.querySelector('.label')?.textContent);if(/^คนลา(?:วันนี้)?$/.test(label)){const num=c.querySelector('.num');if(num)num.textContent=String(leaveCount);}});
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard leave restore`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV511(){return decorate(String(previousDashboard.apply(this,arguments)||''));};
    wrapped.__v511Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v511-style';style.textContent=`
    .v511-leave-list [data-v511-physician="1"] .v445-hr-pill,.v511-leave-list [data-v511-physician="1"] .v453-hr-pill,.v511-leave-list [data-v511-physician="1"] .v454-hr-pill{display:none!important}
  `;document.head.appendChild(style);

  window.cnmiDashboardLeaveV511={version:VERSION,decorate,rowsFor,isPhysicianId};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v511-leave-list-physician-hr-split.js", error); }
;

/* Original source: patch-v512-physician-activity-consult-sync.js */
try {
/* CNMI Staff Planner V512
 * Physician Consult activity availability sync
 *
 * - Physician leave remains handled by V510/V511.
 * - Activities involving a physician can make that physician unavailable for Consult
 *   only for the overlapping time window.
 * - Clear in-unit "other" activities do not automatically block Consult.
 * - External/teaching/training/meeting/outing activities do block Consult.
 * - No database/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V512_PHYSICIAN_ACTIVITY_CONSULT_SYNC';
  if(window.__CNMI_V512_PHYSICIAN_ACTIVITY_CONSULT_SYNC__)return;
  window.__CNMI_V512_PHYSICIAN_ACTIVITY_CONSULT_SYNC__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S()?.dashboardDateV443)||normDate(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function staffById(id){return (S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
  function nick(id){const p=staffById(id);return txt(p?.nickname||p?.full_name||p?.email||'แพทย์');}
  function parseIds(v){
    if(Array.isArray(v))return v.filter(Boolean).map(String);
    const s=txt(v);if(!s)return [];
    try{const x=JSON.parse(s);if(Array.isArray(x))return x.filter(Boolean).map(String);}catch(_){ }
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  function inDateRange(date,a){
    const s=normDate(a?.start_date),e=normDate(a?.end_date||a?.start_date);
    return (!s||date>=s)&&(!e||date<=e);
  }
  function minute(v){const m=txt(v).match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;}
  function interval(start,end){
    let a=minute(start),b=minute(end);
    if(a==null&&b==null)return null;
    if(a==null)a=0;if(b==null)b=1440;
    if(b<=a)b+=1440;
    return [a,b];
  }
  function consultInterval(time){
    const s=txt(time);
    if(/24\s*ชม|ตลอดวัน|ทั้งวัน/i.test(s))return [0,1440];
    const m=s.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    if(!m)return [0,1440];
    let a=Number(m[1])*60+Number(m[2]),b=Number(m[3])*60+Number(m[4]);
    if(b<=a)b+=1440;
    return [a,b];
  }
  function overlapsInterval(a,b){return Math.max(a[0],b[0])<Math.min(a[1],b[1]);}
  function timeLabel(a){
    const s=txt(a?.start_time).slice(0,5),e=txt(a?.end_time).slice(0,5);
    if(s&&e)return `${s}–${e}`;
    if(s)return `ตั้งแต่ ${s}`;
    return 'ทั้งวัน';
  }
  function activityLabel(a){
    const type=txt(a?.event_type)||'กิจกรรม';
    if(type==='อื่นๆ')return `ติดกิจกรรม ${timeLabel(a)}`;
    return `${type} ${timeLabel(a)}`;
  }
  function clearlyInUnit(a){
    const location=txt(a?.location);
    if(!location)return false;
    return /เวชศาสตร์บริการโลหิต|ห้องบริจาคโลหิต|คลังเลือด|blood\s*bank|donor\s*room|cnmi\s*blood/i.test(location);
  }
  function blockingActivity(a){
    const type=txt(a?.event_type);
    const words=`${txt(a?.title)} ${txt(a?.note)} ${txt(a?.location)}`;
    if(['อบรม','ประชุม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE'].includes(type))return true;
    if(/ติดสอน|สอน|สัมมนา|conference|training|teaching|ไปประชุม|ไปราชการ|นอกสถานที่|ออกหน่วย/i.test(words))return true;
    // "อื่นๆ" ที่ระบุสถานที่นอกหน่วยชัดเจน ถือว่าแพทย์ไม่อยู่จุด Consult
    if(type==='อื่นๆ'&&txt(a?.location)&&!clearlyInUnit(a))return true;
    return false;
  }
  function physicianActivities(id,date,time){
    const ci=consultInterval(time);
    return (S()?.activities||[]).filter(a=>{
      if(!a||!inDateRange(date,a)||!parseIds(a?.participant_ids).includes(String(id||''))||!blockingActivity(a))return false;
      const ai=interval(a?.start_time,a?.end_time)||[0,1440];
      return overlapsInterval(ai,ci);
    }).sort((a,b)=>(minute(a?.start_time)??0)-(minute(b?.start_time)??0));
  }
  function leaveStatus(id,date,time){
    try{return window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(id,date,time)||null;}catch(_){return null;}
  }
  function combinedStatus(id,date,time){
    const leave=leaveStatus(id,date,time);if(leave)return {source:'leave',...leave};
    const acts=physicianActivities(id,date,time);if(!acts.length)return null;
    const a=acts[0];return {source:'activity',kind:'activity',label:activityLabel(a),title:txt(a?.title),activity:a};
  }
  function consultAssignments(date){
    try{
      const api=window.cnmiPhysicianConsultV452,m=api?.baseForDate?.(date);if(!m)return [];
      if(m.weekday)return [
        {id:m.donor,time:'08:00–16:00',site:'Donor'},
        {id:m.bb,time:'08:00–16:00',site:'Blood Bank'},
        {id:m.combined,time:'16:00–08:00',site:'Donor & BB'}
      ];
      return [{id:m.combined,time:'24 ชม.',site:'Donor & BB'}];
    }catch(_){return [];}
  }
  function syncConsult(root,date){
    const card=root.querySelector?.('[data-v452-physician-card]');if(!card)return;
    const assignments=consultAssignments(date);if(!assignments.length)return;

    card.querySelectorAll('[data-v455-doctor-id]').forEach(el=>{
      const id=el.getAttribute('data-v455-doctor-id'),time=el.getAttribute('data-v455-time')||'';
      if(!id||leaveStatus(id,date,time))return; // V510 already renders physician leave.
      const acts=physicianActivities(id,date,time);if(!acts.length)return;
      const a=acts[0];
      const replacement=document.createElement('span');
      replacement.className='v512-consult-activity';
      replacement.setAttribute('data-v512-physician-activity','1');
      replacement.textContent=`${nick(id)} · ${activityLabel(a)}`;
      replacement.title=txt(a?.title)||'แพทย์มีกิจกรรมทับช่วง Consult';
      el.replaceWith(replacement);
    });

    const total=assignments.length;
    const ready=assignments.filter(a=>a?.id&&!combinedStatus(a.id,date,a.time)).length;
    const badge=card.querySelector('.v452-ready');
    if(badge){
      badge.textContent=`พร้อม ${ready}/${total}`;
      badge.classList.toggle('is-complete',ready===total);
      badge.classList.toggle('v510-has-leave',ready<total);
      badge.classList.toggle('v512-has-activity',assignments.some(a=>a?.id&&physicianActivities(a.id,date,a.time).length));
    }
  }
  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      syncConsult(tpl.content,selectedDate());
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] decorate`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV512(){return decorate(previousDashboard.apply(this,arguments));};
    wrapped.__v512Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v512-style';style.textContent=`
    .v512-consult-activity{display:inline-flex;align-items:center;min-height:30px;padding:5px 9px;border-radius:999px;font-weight:850;font-size:11px;line-height:1.2;background:#fff7e7;border:1px solid #ffd99a;color:#956111}
    .v452-ready.v512-has-activity{background:#fff7e7!important;border-color:#ffd99a!important;color:#956111!important}
    @media(max-width:760px){.v512-consult-activity{font-size:13px;min-height:36px;padding:7px 11px;white-space:normal}}
  `;document.head.appendChild(style);

  window.cnmiPhysicianActivityV512={version:VERSION,physicianActivities,blockingActivity,combinedStatus};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v512-physician-activity-consult-sync.js", error); }
;

/* Original source: patch-v513-leave-sequence-tap-repair.js */
try {
/* CNMI Staff Planner V513
 * Repair Dashboard leave-sequence tap after V511 rebuilt the leave list.
 * - "ลำดับลา n" in Dashboard is tappable again.
 * - Opens the existing V447 detail popup (leave date + original submission date/time).
 * - "ลำดับไม่รับเวร" keeps its existing V436 interaction.
 * Display-only; no schema / SQL changes.
 */
(function(){
  'use strict';
  const VERSION='V513_LEAVE_SEQUENCE_TAP_REPAIR';
  if(window.__CNMI_V513_LEAVE_SEQUENCE_TAP_REPAIR__)return;
  window.__CNMI_V513_LEAVE_SEQUENCE_TAP_REPAIR__=true;

  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(window.cnmiLeaveSequenceDetailV447?.selectedDashboardDate?.())||norm(window.state?.dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){try{return norm(typeof todayStr==='function'?todayStr():'');}catch(__){return '';}}
  }
  function detailsApi(){return window.cnmiLeaveSequenceDetailV447||null;}
  function leaveTarget(node){return node?.closest?.('.v511-leave-list .v431-leave-rank-badge:not([data-v447-leave-rank])')||null;}
  function activate(target){
    if(!target)return false;
    const item=target.closest('.v397-today-item');
    const staffId=String(item?.dataset?.v511Staff||'');
    const m=String(target.textContent||'').match(/(\d+)/);
    const rank=m?Number(m[1]):null;
    const date=selectedDate();
    const api=detailsApi();
    if(!api?.showLeaveRankDetail||!date||(!staffId&&!rank))return false;
    api.showLeaveRankDetail(date,staffId,rank);
    return true;
  }

  document.addEventListener('click',event=>{
    const target=leaveTarget(event.target);if(!target)return;
    event.preventDefault();event.stopPropagation();
    activate(target);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const target=leaveTarget(event.target);if(!target)return;
    event.preventDefault();event.stopPropagation();
    activate(target);
  },true);

  function decorate(root=document){
    try{
      root.querySelectorAll?.('.v511-leave-list .v431-leave-rank-badge:not([data-v447-leave-rank])').forEach(el=>{
        el.setAttribute('role','button');el.setAttribute('tabindex','0');
        el.setAttribute('title','แตะดูวันที่ลาและเวลาที่บันทึกคำลาครั้งแรก');
        el.classList.add('v513-leave-rank-clickable');
      });
    }catch(_){ }
  }
  const observer=new MutationObserver(list=>{for(const m of list){for(const n of m.addedNodes||[]){if(n?.nodeType===1)decorate(n);}}});
  try{observer.observe(document.documentElement,{subtree:true,childList:true});}catch(_){ }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>decorate(document),{once:true});else decorate(document);

  const style=document.createElement('style');style.id='cnmi-v513-style';style.textContent=`
    .v511-leave-list .v431-leave-rank-badge.v513-leave-rank-clickable{cursor:pointer;touch-action:manipulation}
    .v511-leave-list .v431-leave-rank-badge.v513-leave-rank-clickable:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(47,145,200,.18)}
  `;document.head.appendChild(style);

  window.cnmiLeaveTapRepairV513={version:VERSION,activate,decorate};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v513-leave-sequence-tap-repair.js", error); }
;

/* Original source: patch-v515-hash-routing-hr-deeplink.js */
try {
/* CNMI Staff Planner V515
 * URL hash routing + HR deep-link/safe-status sync.
 *
 * Goals:
 * - Every app page has a readable URL (#/dashboard, #/hr-check?month=2026-09, ...).
 * - Browser Back/Forward and Refresh reopen the same page/filter instead of always looking like the root app.
 * - Admin HR page refreshes public.hr_check_status_public before rendering pending status,
 *   so a Staff "ลาในระบบแล้ว" confirmation is visible even when public.hr_checks is protected by RLS.
 * - No schema change / no SQL required.
 */
(function(){
  'use strict';
  const VERSION='V515_HASH_ROUTING_HR_DEEPLINK';
  if(window.__CNMI_V515_HASH_ROUTING_HR_DEEPLINK__) return;
  window.__CNMI_V515_HASH_ROUTING_HR_DEEPLINK__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.sb||window.supabaseClient||null;}
  function text(v){return String(v==null?'':v).trim();}
  function validMonth(v){return /^\d{4}-\d{2}$/.test(text(v));}
  function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(text(v));}
  function authHash(raw){return /(?:^|[#&?])(access_token|refresh_token|token_hash|code|type)=(?:[^&]*)/i.test(String(raw||'')) && /(access_token|refresh_token|token_hash|type=(?:recovery|password_recovery|invite)|(?:^|[?&#])code=)/i.test(String(raw||''));}

  const PAGE_TO_ROUTE={
    dashboard:'dashboard', calendar:'calendar', leave:'leave', myProfile:'profile',
    activities:'activities', myTraining:'training', trainingAdmin:'training-admin',
    schedule:'roster', tradeRequests:'trade', positionMonthView:'positions/month',
    positions:'positions/day', ot:'ot', audit:'audit', hr:'hr-check', hrSummary:'hr-summary',
    scheduler:'roster-admin', positionMonth:'positions/month-admin', positionManagement:'positions/manage',
    profileRequests:'profile-requests', profileRequestSummary:'profile-requests/history', users:'users',
    eligibility:'eligibility', internManagement:'intern', claimHistory:'ot/claims',
    physicianConsult:'physician-consult', donorHelpers:'donor-helpers', holidayRulesV107:'holiday-rules',
    dutyEligibilityV107:'duty-eligibility', accountSettings:'account'
  };
  const ROUTE_TO_PAGE=Object.fromEntries(Object.entries(PAGE_TO_ROUTE).map(([p,r])=>[r,p]));

  function navIds(){
    try{return new Set((typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]).map(x=>text(x?.id)).filter(Boolean));}
    catch(_){return new Set(Object.keys(PAGE_TO_ROUTE));}
  }
  function knownPage(page){return !!page&&(navIds().has(page)||Object.prototype.hasOwnProperty.call(PAGE_TO_ROUTE,page));}
  function routeForPage(page){return PAGE_TO_ROUTE[page]||text(page||'dashboard').replace(/^\/+|\/+$/g,'')||'dashboard';}
  function pageForRoute(route){
    const clean=text(route).replace(/^\/+|\/+$/g,'');
    const mapped=ROUTE_TO_PAGE[clean];
    if(mapped)return mapped;
    // Fallback allows future pages to deep-link using their internal page id.
    if(knownPage(clean))return clean;
    return 'dashboard';
  }
  function parseHash(){
    const raw=String(location.hash||'');
    if(!raw||raw==='#'||authHash(raw))return null;
    const h=raw.replace(/^#\/?/,'');
    const q=h.indexOf('?');
    const route=decodeURIComponent((q>=0?h.slice(0,q):h)||'dashboard');
    const params=new URLSearchParams(q>=0?h.slice(q+1):'');
    return {page:pageForRoute(route),route,params};
  }

  function selectedDashboardDate(){
    const st=S();
    try{
      const d=window.cnmiDashboardDateV443?.selectedDate?.();
      if(validDate(d))return d;
    }catch(_){ }
    return validDate(st.dashboardDateV443)?st.dashboardDateV443:'';
  }
  function monthForPage(page){
    const st=S();
    if(page==='hr')return validMonth(st.hrFilterMonth)?st.hrFilterMonth:(validMonth(st.monthKey)?st.monthKey:'');
    if(page==='hrSummary')return validMonth(st.hrSummaryFilterMonth)?st.hrSummaryFilterMonth:(validMonth(st.monthKey)?st.monthKey:'');
    if(page==='positionMonth')return validMonth(st.positionMonthKey)?st.positionMonthKey:'';
    if(page==='positionMonthView')return validMonth(st.positionMonthViewKey)?st.positionMonthViewKey:'';
    if(['schedule','scheduler','tradeRequests'].includes(page))return validMonth(st.monthKey)?st.monthKey:'';
    if(page==='physicianConsult')return validMonth(st.physicianConsultMonthV452)?st.physicianConsultMonthV452:(validMonth(st.monthKey)?st.monthKey:'');
    return '';
  }
  function paramsFromState(page,override={}){
    const st=S(),p=new URLSearchParams();
    const month=validMonth(override.month)?override.month:monthForPage(page);
    const date=validDate(override.date)?override.date:'';
    if(month)p.set('month',month);
    if(page==='dashboard'){
      const d=date||selectedDashboardDate(); if(validDate(d))p.set('date',d);
    }else if(page==='positions'){
      const d=date||(validDate(st.positionDate)?st.positionDate:''); if(validDate(d))p.set('date',d);
    }else if(page==='audit'){
      const d=date||(validDate(st.auditDate)?st.auditDate:''); if(validDate(d))p.set('date',d);
    }else if(page==='calendar'){
      try{
        const cd=st.calendarDate instanceof Date&&!Number.isNaN(st.calendarDate.getTime())?st.calendarDate:null;
        if(cd){const d=[cd.getFullYear(),String(cd.getMonth()+1).padStart(2,'0'),String(cd.getDate()).padStart(2,'0')].join('-');p.set('date',d);}
      }catch(_){ }
      if(st.calendarView)p.set('view',text(st.calendarView));
    }
    if(page==='hr'&&text(st.hrFilterStaff))p.set('staff',text(st.hrFilterStaff));
    if(page==='hrSummary'&&text(st.hrSummaryFilterStaff))p.set('staff',text(st.hrSummaryFilterStaff));
    return p;
  }
  function hashFor(page,override={}){
    const route=routeForPage(page),p=paramsFromState(page,override),qs=p.toString();
    return `#/${route}${qs?`?${qs}`:''}`;
  }
  function setUrl(page,{push=false,override={}}={}){
    if(authHash(location.hash))return;
    const target=hashFor(page,override);
    if(location.hash===target)return;
    try{
      if(push)history.pushState({cnmiPage:page},'',target);
      else history.replaceState({cnmiPage:page},'',target);
    }catch(_){
      if(push)location.hash=target; else location.replace(target);
    }
  }

  function applyParams(page,params){
    const st=S(); if(!st)return;
    const month=text(params.get('month')),date=text(params.get('date')),staff=text(params.get('staff')),view=text(params.get('view'));
    if(validMonth(month)){
      if(page==='hr')st.hrFilterMonth=month;
      else if(page==='hrSummary')st.hrSummaryFilterMonth=month;
      else if(page==='positionMonth')st.positionMonthKey=month;
      else if(page==='positionMonthView')st.positionMonthViewKey=month;
      else if(['schedule','scheduler','tradeRequests'].includes(page))st.monthKey=month;
      else if(page==='physicianConsult'){st.physicianConsultMonthV452=month;st.monthKey=month;}
    }
    if(validDate(date)){
      if(page==='dashboard')st.dashboardDateV443=date;
      else if(page==='positions')st.positionDate=date;
      else if(page==='audit')st.auditDate=date;
      else if(page==='calendar'){
        const d=new Date(`${date}T12:00:00`); if(!Number.isNaN(d.getTime()))st.calendarDate=d;
      }
    }
    if(page==='calendar'&&['month','week','day'].includes(view))st.calendarView=view;
    if(page==='hr'&&staff)st.hrFilterStaff=staff;
    if(page==='hrSummary'&&staff)st.hrSummaryFilterStaff=staff;
  }

  let hrPromise=null,hrLoadedAt=0,hrSignature='';
  function hrSig(rows){return (rows||[]).map(r=>`${r?.leave_request_id||''}|${r?.status||''}|${r?.hr_reported_date||''}`).sort().join('~');}
  async function syncSafeHr(force=false,{render=true}={}){
    const st=S(),db=DB();
    if(!st?.profile||!db)return st?.hrChecks||[];
    if(hrPromise)return hrPromise;
    if(!force&&Date.now()-hrLoadedAt<5000&&hrSig(st.hrChecks||[])===hrSignature)return st.hrChecks||[];
    hrPromise=(async()=>{
      try{
        const q=await db.from('hr_check_status_public').select('leave_request_id,status,hr_reported_date').limit(2000);
        if(q?.error)throw q.error;
        const safe=Array.isArray(q?.data)?q.data:[];
        const oldMap=new Map((st.hrChecks||[]).map(r=>[String(r?.leave_request_id||''),r]));
        const merged=safe.map(r=>({...oldMap.get(String(r?.leave_request_id||'')),...r}));
        const sig=hrSig(merged),changed=sig!==hrSignature||hrSig(st.hrChecks||[])!==sig;
        st.hrChecks=merged;hrSignature=sig;hrLoadedAt=Date.now();
        if(changed&&render&&['hr','hrSummary','leave','calendar'].includes(text(st.page))){
          setTimeout(()=>{try{if(typeof renderPage==='function')renderPage();}catch(_){ }},0);
        }
        return merged;
      }catch(err){
        console.warn(`[${VERSION}] safe HR sync failed`,err);
        return st.hrChecks||[];
      }finally{hrPromise=null;}
    })();
    return hrPromise;
  }

  let routeApplyToken=0;
  async function loadRoutePage(page,{force=false}={}){
    const token=++routeApplyToken,st=S();
    if(!st?.profile)return;
    try{
      if(window.cnmiV316?.loadPageData)await window.cnmiV316.loadPageData(page,{force});
      else if(typeof loadAllData==='function')await loadAllData({force});
    }catch(err){console.warn(`[${VERSION}] route load`,page,err);}
    if(['hr','hrSummary'].includes(page))await syncSafeHr(true,{render:false});
    if(token!==routeApplyToken||text(S().page)!==page)return;
    try{if(typeof renderPage==='function')renderPage();}catch(_){ }
  }
  async function applyLocationRoute({load=true}={}){
    const parsed=parseHash();if(!parsed)return;
    const st=S();if(!st)return;
    st.page=parsed.page;applyParams(parsed.page,parsed.params);
    try{if(typeof renderPage==='function'&&st.profile)renderPage();}catch(_){ }
    if(load&&st.profile)await loadRoutePage(parsed.page,{force:false});
  }

  // Parse early so the route-aware loader enters the correct page on first login/session restore.
  try{applyLocationRoute({load:false});}catch(_){ }

  // Update URL before legacy handlers process menu clicks. We don't prevent the click.
  document.addEventListener('click',e=>{
    const nav=e.target?.closest?.('[data-page]');
    if(nav){
      const page=text(nav.getAttribute('data-page'));
      if(page){setUrl(page,{push:true});return;}
    }
    const pending=e.target?.closest?.('[data-v460-open-page]');
    if(pending){
      const page=text(pending.getAttribute('data-v460-open-page'))||'dashboard';
      const month=text(pending.getAttribute('data-v460-open-month'));
      const date=text(pending.getAttribute('data-v460-open-date'));
      setUrl(page,{push:true,override:{month,date}});
    }
  },true);

  // Keep URL aligned with programmatic navigation and filters.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV515(){
      const out=previousRender.apply(this,arguments);
      const st=S(),page=text(st?.page)||'dashboard';
      try{setUrl(page,{push:false});}catch(_){ }
      try{
        const item=(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]).find(x=>text(x?.id)===page);
        if(item?.title)document.title=`${item.title} | Staff Planner`;
      }catch(_){ }
      if(['hr','hrSummary'].includes(page)){
        // V316 can still receive zero hr_checks rows because that private table is RLS protected.
        // Always refresh the safe projection after its render so the HR page converges to the real status.
        setTimeout(()=>syncSafeHr(false,{render:true}),0);
      }
      return out;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  let popTimer=null;
  function scheduleRouteFromHistory(){
    clearTimeout(popTimer);popTimer=setTimeout(()=>applyLocationRoute({load:true}),20);
  }
  window.addEventListener('popstate',scheduleRouteFromHistory);
  window.addEventListener('hashchange',scheduleRouteFromHistory);

  // HR filters change the deep-link in place. Other page filters are synchronized by renderPage.
  document.addEventListener('change',e=>{
    const id=text(e.target?.id);
    if(['hrFilterMonth','hrFilterStaff','hrSummaryFilterMonth','hrSummaryFilterStaff','auditDateInput','positionDateInput','positionMonthInput','positionMonthViewInput','rosterMonthInput','scheduleMonthInput'].includes(id)){
      setTimeout(()=>{try{setUrl(text(S().page)||'dashboard',{push:false});}catch(_){ }},0);
    }
  },true);

  window.cnmiV515={
    version:VERSION,
    parseHash,hashFor,setUrl,applyLocationRoute,syncSafeHr,
    navigate(page,params={}){
      const p=knownPage(page)?page:pageForRoute(page);
      setUrl(p,{push:true,override:params});
      const st=S();st.page=p;
      const fake=new URLSearchParams();if(params.month)fake.set('month',params.month);if(params.date)fake.set('date',params.date);if(params.staff)fake.set('staff',params.staff);
      applyParams(p,fake);try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      return loadRoutePage(p,{force:false});
    }
  };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v515-hash-routing-hr-deeplink.js", error); }
;

/* Original source: patch-v519-activity-page-freeze-fix.js */
try {
/* CNMI Staff Planner V519 — Activity page freeze fix + V518 activity UX
   Scope:
   - "ผู้รับผิดชอบ" -> "ผู้บันทึก" for activity UI; recorder comes from the original creator/login and is read-only.
   - At least 1 participant is required for every activity.
   - Activity form is split into compact sections and made mobile-safe.
   - Participant search / select all / clear / selected chips.
   - Dashboard activity cards show recorder + created time and sort by created_at DESC.
   - No database/schema changes.
*/
(function(){
  'use strict';
  if (window.__CNMI_V519_ACTIVITY_RECORDER_UI__) return;
  window.__CNMI_V519_ACTIVITY_RECORDER_UI__ = true;

  const VERSION = 'V519_ACTIVITY_PAGE_FREEZE_FIX';
  const S = () => window.state || state;
  const esc = v => typeof escapeHtml === 'function'
    ? escapeHtml(v == null ? '' : String(v))
    : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentId = () => {
    try { return typeof currentStaffId === 'function' ? currentStaffId() : ''; }
    catch (_) { return ''; }
  };
  const nick = id => {
    try { return typeof staffNick === 'function' ? (staffNick(id) || '-') : '-'; }
    catch (_) { return '-'; }
  };
  const dateKey = v => String(v || '').slice(0,10);
  const activityInDate = (row,date) => {
    const d=dateKey(date), s=dateKey(row?.start_date), e=dateKey(row?.end_date || row?.start_date);
    return Boolean(d && s && e && d >= s && d <= e);
  };
  const selectedDate = () => {
    try { return dateKey(window.cnmiDashboardDateV443?.selectedDate?.()) || dateKey(S()?.dashboardDateV443) || dateKey(todayStr()); }
    catch (_) { return dateKey(S()?.dashboardDateV443) || new Date().toISOString().slice(0,10); }
  };
  const cleanNote = note => {
    try { if (typeof window.cnmiCleanActivityNote === 'function') return window.cnmiCleanActivityNote(note); }
    catch (_) {}
    return String(note || '')
      .replace(/\[\[FM-CNHR-002-ORGANIZER:[^\]]*\]\]\s*/ig,'')
      .replace(/\[\[FM-CNHR-002-BATCH:[^\]]*\]\]\s*/ig,'')
      .trim();
  };
  const fmtCreated = value => {
    if (!value) return '-';
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return '-';
    try {
      const date = new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'}).format(dt);
      const time = new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(dt);
      return `${date} เวลา ${time} น.`;
    } catch (_) { return String(value); }
  };
  const timeText = row => {
    const s=String(row?.start_time||'').slice(0,5), e=String(row?.end_time||'').slice(0,5);
    return s&&e ? `${s}–${e} น.` : (s ? `${s} น.` : 'ไม่ระบุเวลา');
  };

  function makeSection(title, subtitle, cls=''){
    const section=document.createElement('section');
    section.className=`v518-form-section ${cls}`.trim();
    section.innerHTML=`<div class="v518-section-head"><h4>${esc(title)}</h4>${subtitle?`<span>${esc(subtitle)}</span>`:''}</div><div class="v518-section-grid"></div>`;
    return section;
  }
  function fieldByName(form,name){ return form.querySelector(`[name="${name}"]`)?.closest('label') || null; }
  function participantWrap(form){
    return Array.from(form.children).find(el=>{
      const lab=el.querySelector?.('.field-label');
      return lab && String(lab.textContent||'').trim()==='ผู้เข้าร่วม';
    }) || form.querySelector('.v396-participants')?.parentElement || null;
  }
  function activityEditingRow(){
    const id=S()?.editingActivityId;
    if (!id) return null;
    return (S()?.activities||[]).find(x=>String(x.id)===String(id)) || null;
  }

  function enhanceParticipantMarkup(wrap){
    if(!wrap) return;
    wrap.classList.add('v518-participant-wrap');
    const label=wrap.querySelector('.field-label');
    if(label){
      label.innerHTML='ผู้เข้าร่วม <span class="v518-required">*</span>';
      label.insertAdjacentHTML('afterend',`<div class="v518-participant-tools">
        <input type="search" id="v518ParticipantSearch" placeholder="ค้นหาชื่อผู้เข้าร่วม" autocomplete="off">
        <button type="button" class="ghost-btn v518-tool-btn" data-v518-select-all>เลือกทั้งหมด</button>
        <button type="button" class="ghost-btn v518-tool-btn" data-v518-clear-all>ล้างทั้งหมด</button>
        <span class="v518-selected-count">เลือกแล้ว 0 คน</span>
      </div><div class="v518-selected-chips" aria-live="polite"></div>`);
    }
    wrap.querySelectorAll('.v396-participant').forEach(item=>{
      const name=String(item.querySelector('b')?.textContent||item.textContent||'').trim();
      const full=String(item.querySelector('small')?.textContent||'').trim();
      item.dataset.v518Search=`${name} ${full}`.toLowerCase();
    });
    syncParticipantState(wrap);
  }

  function syncParticipantState(scope=document){
    const wrap=scope.matches?.('.v518-participant-wrap') ? scope : scope.querySelector?.('.v518-participant-wrap');
    if(!wrap) return;
    const checks=[...wrap.querySelectorAll('input[name="participant_ids"]')];
    const checked=checks.filter(x=>x.checked);
    checks.forEach((x,i)=>{
      x.required = checked.length===0 && i===0;
      try { x.setCustomValidity(checked.length===0 && i===0 ? 'กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน' : ''); } catch(_) {}
    });
    const count=wrap.querySelector('.v518-selected-count');
    if(count) count.textContent=`เลือกแล้ว ${checked.length} คน`;
    const chips=wrap.querySelector('.v518-selected-chips');
    if(chips){
      chips.innerHTML=checked.length ? checked.map(input=>{
        const item=input.closest('.v396-participant');
        const name=String(item?.querySelector('b')?.textContent||nick(input.value)||'-').trim();
        return `<button type="button" class="v518-chip" data-v518-chip-remove="${esc(input.value)}">${esc(name)} <span aria-hidden="true">×</span></button>`;
      }).join('') : '<span class="v518-no-selection">ยังไม่ได้เลือกผู้เข้าร่วม</span>';
    }
  }

  function enhanceActivityListRecorder(root){
    const rows=[...(S()?.activityListRowsV398||[]), ...(S()?.activities||[])];
    const byId=new Map(rows.filter(Boolean).map(r=>[String(r.id),r]));
    root.querySelectorAll('.activity-row-card').forEach(card=>{
      const id=card.getAttribute('data-v487-activity-id')||'';
      const row=byId.get(String(id));
      const detail=[...card.querySelectorAll('.activity-row-detail')].find(x=>String(x.querySelector('span')?.textContent||'').trim()==='ผู้รับผิดชอบ');
      if(detail){
        const span=detail.querySelector('span'), b=detail.querySelector('b');
        if(span) span.textContent='ผู้บันทึก';
        if(b && row) b.textContent=nick(row.created_by || row.owner_id);
      }
    });
  }

  function redesignActivityForm(html){
    if(!html || typeof document==='undefined') return html;
    const tpl=document.createElement('template');
    tpl.innerHTML=String(html);
    const form=tpl.content.querySelector('#activityForm');
    if(!form) return html;
    form.classList.add('v518-activity-form');
    form.closest('.card')?.classList.add('v518-activity-entry-card');

    const editing=activityEditingRow();
    const recorderId=editing?.created_by || editing?.owner_id || currentId();
    const ownerValue=editing?.owner_id || editing?.created_by || currentId();
    const ownerSelect=form.querySelector('select[name="owner_id"]');
    if(ownerSelect){
      const oldLabel=ownerSelect.closest('label');
      if(oldLabel){
        const replacement=document.createElement('label');
        replacement.className='v518-recorder-field';
        replacement.innerHTML=`ผู้บันทึก<div class="v518-readonly-person"><span>${esc(nick(recorderId))}</span><small>${editing?'ผู้สร้างรายการเดิม':'ดึงจากผู้ที่ล็อกอินอัตโนมัติ'}</small></div><input type="hidden" name="owner_id" value="${esc(ownerValue)}">`;
        oldLabel.replaceWith(replacement);
      }
    }

    const basic=makeSection('ข้อมูลหลัก','กรอกเฉพาะข้อมูลที่ใช้ดูงานจริง','v518-basic-section');
    const basicGrid=basic.querySelector('.v518-section-grid');
    ['title','event_type','location','start_date','end_date','start_time','end_time'].forEach(name=>{
      const el=fieldByName(form,name); if(el) basicGrid.appendChild(el);
    });
    const dl=form.querySelector('#activityLocationList'); if(dl) basicGrid.appendChild(dl);

    const people=makeSection('ผู้เกี่ยวข้อง','ผู้เข้าร่วมอย่างน้อย 1 คน','v518-people-section');
    const peopleGrid=people.querySelector('.v518-section-grid');
    const recorder=form.querySelector('.v518-recorder-field'); if(recorder) peopleGrid.appendChild(recorder);
    const pWrap=participantWrap(form); if(pWrap){peopleGrid.appendChild(pWrap);enhanceParticipantMarkup(pWrap);}

    const optional=makeSection('ตัวเลือกเพิ่มเติม','ใช้เมื่อเกี่ยวข้องกับประวัติอบรมหรือไฟล์แนบ','v518-optional-section');
    const optionalGrid=optional.querySelector('.v518-section-grid');
    const training=form.querySelector('.v405-training-meta-grid');
    if(training){
      const trainingHint=training.querySelector('.v396-training-check small'); if(trainingHint) trainingHint.textContent='ใช้เมื่อกิจกรรมนี้ต้องเข้าประวัติอบรม';
      const orgHint=training.querySelector('.v405-organizer-field small'); if(orgHint) orgHint.remove();
      const batchHint=training.querySelector('.v408-batch-field small'); if(batchHint) batchHint.textContent='ไม่มีรุ่นให้ใส่ -';
      optionalGrid.appendChild(training);
    }
    const file=fieldByName(form,'file');
    if(file){
      file.querySelectorAll('small.hint,.v487-upload-hint').forEach((x,i)=>{ if(i===0) x.textContent='แนบได้หลายไฟล์'; else x.remove(); });
      optionalGrid.appendChild(file);
    }

    const detail=makeSection('รายละเอียดเพิ่มเติม','','v518-detail-section');
    const detailGrid=detail.querySelector('.v518-section-grid');
    const note=fieldByName(form,'note'); if(note) detailGrid.appendChild(note);

    const submit=form.querySelector('button[type="submit"]');
    const actions=document.createElement('div'); actions.className='v518-form-actions';
    if(!editing){
      const reset=document.createElement('button'); reset.type='button'; reset.className='ghost-btn'; reset.setAttribute('data-v518-reset-activity',''); reset.textContent='ล้างฟอร์ม'; actions.appendChild(reset);
    }
    if(submit){ submit.classList.remove('wide'); actions.appendChild(submit); }

    // Any remaining meaningful nodes (defensive compatibility) stay in the optional section.
    [...form.children].forEach(node=>{
      if([basic,people,optional,detail,actions].includes(node)) return;
      if(node.tagName==='DATALIST') return;
      optionalGrid.appendChild(node);
    });
    form.append(basic,people,optional,detail,actions);

    enhanceActivityListRecorder(tpl.content);
    return tpl.innerHTML;
  }

  const previousActivities=window.renderActivitiesPage || (typeof renderActivitiesPage==='function'?renderActivitiesPage:null);
  if(previousActivities){
    const wrapped=function renderActivitiesPageV518(){ return redesignActivityForm(previousActivities.apply(this,arguments)); };
    try { window.renderActivitiesPage=renderActivitiesPage=wrapped; } catch(_) { window.renderActivitiesPage=wrapped; }
  }

  function dashboardActivityHtml(row){
    const ids=Array.isArray(row?.participant_ids)?row.participant_ids:[];
    const names=ids.map(nick).filter(x=>x&&x!=='-');
    const recorder=nick(row?.created_by || row?.owner_id);
    const note=cleanNote(row?.note);
    const created=fmtCreated(row?.created_at);
    const type=row?.event_type||'อื่นๆ';
    let typeBadge='';
    try { typeBadge=typeof badge==='function' ? badge(type,typeof activityClass==='function'?activityClass(type):'blue') : `<span class="badge">${esc(type)}</span>`; }
    catch(_) { typeBadge=`<span class="badge">${esc(type)}</span>`; }
    return `<article class="v397-activity-item v518-dashboard-activity" data-v518-activity-id="${esc(row?.id||'')}">
      <div class="v518-activity-head"><div class="v518-activity-title"><b>${esc(row?.title||'-')}</b>${typeBadge}</div><span class="v518-created-rank">บันทึกล่าสุดก่อน</span></div>
      <div class="v518-activity-info"><span><strong>เวลา</strong>${esc(timeText(row))}</span><span><strong>สถานที่</strong>${esc(row?.location||'ไม่ระบุ')}</span></div>
      <div class="v397-detail-line"><strong>ผู้เข้าร่วม:</strong> ${esc(names.length?names.join(', '):'-')}</div>
      ${note?`<div class="v518-note-wrap"><div class="v397-detail-note v518-note-clamp">หมายเหตุ: ${esc(note)}</div><button type="button" class="v518-note-more" data-v518-note-toggle>ดูเพิ่มเติม</button></div>`:''}
      <div class="v518-activity-meta"><span><strong>ผู้บันทึก:</strong> ${esc(recorder)}</span><span><strong>บันทึกเมื่อ:</strong> ${esc(created)}</span></div>
    </article>`;
  }

  function decorateDashboard(html){
    if(!html || typeof document==='undefined') return html;
    const tpl=document.createElement('template'); tpl.innerHTML=String(html);
    let card=tpl.content.querySelector('.v401-dashboard-activity-card');
    if(!card){
      card=[...tpl.content.querySelectorAll('.card')].find(x=>/กิจกรรม/.test(String(x.querySelector('h3')?.textContent||''))) || null;
    }
    // V506 intentionally removes this card on weekends/public holidays; preserve that behavior.
    if(!card) return html;
    const date=selectedDate();
    const activities=(S()?.activities||[]).filter(x=>activityInDate(x,date)).sort((a,b)=>{
      const bt=Date.parse(b?.created_at||'')||0, at=Date.parse(a?.created_at||'')||0;
      if(bt!==at) return bt-at;
      return String(b?.id||'').localeCompare(String(a?.id||''));
    });
    const head=card.querySelector('.section-title');
    if(head){
      const h3=head.querySelector('h3'); if(h3) h3.textContent='กิจกรรมวันนี้';
      const hint=head.querySelector('.hint,span'); if(hint) hint.textContent='รายการที่บันทึกล่าสุดอยู่ด้านบน';
    }
    [...card.children].forEach(child=>{if(!child.classList?.contains('section-title')) child.remove();});
    const body=document.createElement('div');
    body.className='v397-today-list v518-dashboard-activity-list';
    if(activities.length) body.innerHTML=activities.map(dashboardActivityHtml).join('');
    else {
      try { body.innerHTML=typeof empty==='function'?empty('วันนี้ไม่มีกิจกรรม'):'<div class="empty">วันนี้ไม่มีกิจกรรม</div>'; }
      catch(_) { body.innerHTML='<div class="empty">วันนี้ไม่มีกิจกรรม</div>'; }
    }
    card.appendChild(body);
    return tpl.innerHTML;
  }

  const previousDashboard=window.renderDashboard || (typeof renderDashboard==='function'?renderDashboard:null);
  if(previousDashboard){
    const wrapped=function renderDashboardV518(){ return decorateDashboard(previousDashboard.apply(this,arguments)); };
    try { window.renderDashboard=renderDashboard=wrapped; } catch(_) { window.renderDashboard=wrapped; }
  }

  function showParticipantWarning(form){
    try { if(typeof showToast==='function') showToast('กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน',{tone:'error'}); } catch(_) {}
    const search=form.querySelector('#v518ParticipantSearch');
    if(search){ search.focus(); search.scrollIntoView({behavior:'smooth',block:'center'}); }
  }

  document.addEventListener('click',e=>{
    const selectAll=e.target.closest('[data-v518-select-all]');
    if(selectAll){
      const wrap=selectAll.closest('.v518-participant-wrap');
      wrap?.querySelectorAll('input[name="participant_ids"]').forEach(x=>{x.checked=true;});
      syncParticipantState(wrap); return;
    }
    const clear=e.target.closest('[data-v518-clear-all]');
    if(clear){
      const wrap=clear.closest('.v518-participant-wrap');
      wrap?.querySelectorAll('input[name="participant_ids"]').forEach(x=>{x.checked=false;});
      syncParticipantState(wrap); return;
    }
    const chip=e.target.closest('[data-v518-chip-remove]');
    if(chip){
      const wrap=chip.closest('.v518-participant-wrap');
      const id=chip.getAttribute('data-v518-chip-remove');
      const input=[...wrap.querySelectorAll('input[name="participant_ids"]')].find(x=>String(x.value)===String(id));
      if(input) input.checked=false;
      syncParticipantState(wrap); return;
    }
    const reset=e.target.closest('[data-v518-reset-activity]');
    if(reset){
      const form=reset.closest('#activityForm'); if(!form) return;
      form.reset();
      const today=(()=>{try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}})();
      const sd=form.querySelector('[name="start_date"]'), ed=form.querySelector('[name="end_date"]');
      if(sd) sd.value=today; if(ed) ed.value=today;
      form.querySelectorAll('input[name="participant_ids"]').forEach(x=>x.checked=false);
      const owner=form.querySelector('input[name="owner_id"]'); if(owner) owner.value=currentId();
      const include=form.querySelector('[name="include_fm_cnhr_002"]'); if(include){include.checked=false;include.dispatchEvent(new Event('change',{bubbles:true}));}
      syncParticipantState(form); return;
    }
    const noteToggle=e.target.closest('[data-v518-note-toggle]');
    if(noteToggle){
      const wrap=noteToggle.closest('.v518-note-wrap'), note=wrap?.querySelector('.v518-note-clamp');
      if(!note) return;
      const expanded=note.classList.toggle('is-expanded');
      noteToggle.textContent=expanded?'ย่อข้อความ':'ดูเพิ่มเติม'; return;
    }
    const submit=e.target.closest('#activityForm button[type="submit"]');
    if(submit){
      const form=submit.closest('#activityForm');
      const checked=form?.querySelectorAll('input[name="participant_ids"]:checked').length||0;
      if(!checked){ e.preventDefault(); e.stopImmediatePropagation(); showParticipantWarning(form); syncParticipantState(form); }
    }
  },true);

  document.addEventListener('input',e=>{
    if(e.target?.id!=='v518ParticipantSearch') return;
    const wrap=e.target.closest('.v518-participant-wrap');
    const q=String(e.target.value||'').trim().toLowerCase();
    wrap?.querySelectorAll('.v396-participant').forEach(item=>{item.hidden=Boolean(q && !String(item.dataset.v518Search||'').includes(q));});
  },true);

  document.addEventListener('change',e=>{
    if(e.target?.name==='participant_ids') syncParticipantState(e.target.closest('.v518-participant-wrap'));
  },true);

  // V519: observe only newly inserted page/card nodes.
  // Do NOT react to mutations created by syncParticipantState itself; V518 did that
  // and caused an endless observer -> chips.innerHTML -> observer loop.
  const observer=new MutationObserver(mutations=>{
    let hasActivityForm=false;
    let hasActivityNote=false;
    for(const mutation of mutations){
      for(const node of mutation.addedNodes || []){
        if(node?.nodeType!==1) continue;
        if(node.matches?.('#activityForm') || node.querySelector?.('#activityForm')) hasActivityForm=true;
        if(node.matches?.('.v518-note-wrap') || node.querySelector?.('.v518-note-wrap')) hasActivityNote=true;
        if(hasActivityForm && hasActivityNote) break;
      }
      if(hasActivityForm && hasActivityNote) break;
    }
    if(!hasActivityForm && !hasActivityNote) return;
    requestAnimationFrame(()=>{
      if(hasActivityForm){
        const form=document.querySelector('#activityForm');
        if(form) syncParticipantState(form);
      }
      if(hasActivityNote){
        document.querySelectorAll('.v518-note-wrap').forEach(wrap=>{
          const note=wrap.querySelector('.v518-note-clamp'), btn=wrap.querySelector('[data-v518-note-toggle]');
          if(!note||!btn) return;
          btn.hidden = note.scrollHeight <= note.clientHeight + 2 && !note.classList.contains('is-expanded');
        });
      }
    });
  });
  const startObserver=()=>observer.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startObserver,{once:true}); else startObserver();

  const style=document.createElement('style');
  style.id='cnmi-v518-activity-ui-style';
  style.textContent=`
    .v518-activity-entry-card{overflow:hidden}.v518-activity-form{display:block!important;min-width:0}.v518-form-section{margin:0 0 12px;padding:12px;border:1px solid #dbe7ef;border-radius:14px;background:#fff;min-width:0}.v518-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}.v518-section-head h4{margin:0;color:#23445d;font-size:.98rem}.v518-section-head span{color:#718698;font-size:.76rem;text-align:right}.v518-section-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0}.v518-section-grid>label,.v518-section-grid>div{min-width:0}.v518-section-grid .wide,.v518-participant-wrap,.v405-training-meta-grid,.v487-attachment-field{grid-column:1/-1}.v518-activity-form input,.v518-activity-form select,.v518-activity-form textarea{width:100%;max-width:100%;box-sizing:border-box}.v518-recorder-field{display:grid;gap:5px}.v518-readonly-person{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:42px;padding:8px 10px;border:1px solid #d9e4ed;border-radius:10px;background:#f7fafc;color:#24465f}.v518-readonly-person span{font-weight:800}.v518-readonly-person small{color:#738899;font-weight:400}.v518-required{color:#c63e52}.v518-participant-tools{display:grid;grid-template-columns:minmax(180px,1fr) auto auto auto;gap:7px;align-items:center;margin:7px 0}.v518-tool-btn{min-height:38px!important;padding:7px 10px!important;white-space:nowrap}.v518-selected-count{font-size:.78rem;font-weight:800;color:#47677f;white-space:nowrap}.v518-selected-chips{display:flex;gap:6px;flex-wrap:wrap;min-height:30px;margin:4px 0 8px}.v518-chip{border:1px solid #bcd9e9;background:#f0f9fe;color:#255675;border-radius:999px;padding:4px 9px;font:700 .78rem/1.2 inherit;cursor:pointer}.v518-no-selection{font-size:.78rem;color:#8093a2;padding:4px 0}.v518-participant-wrap .v396-participants{max-height:220px}.v518-participant-wrap .v396-participant[hidden]{display:none!important}.v518-optional-section .v405-training-meta-grid{grid-template-columns:minmax(220px,1.1fr) minmax(190px,1fr) minmax(150px,.72fr);gap:9px}.v518-optional-section .v396-training-check,.v518-optional-section .v405-training-field{padding:9px 10px}.v518-detail-section textarea{min-height:82px}.v518-form-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}.v518-form-actions button{min-width:126px}.v518-dashboard-activity-list{gap:10px}.v518-dashboard-activity{padding:12px 13px!important}.v518-activity-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.v518-activity-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}.v518-created-rank{font-size:.68rem;color:#7b8e9d;white-space:nowrap}.v518-activity-info{display:grid;grid-template-columns:minmax(120px,.6fr) minmax(160px,1fr);gap:8px;margin-top:8px}.v518-activity-info span{display:grid;gap:1px;padding:7px 8px;border-radius:9px;background:#f6fafc;color:#415b6f;font-size:.82rem;min-width:0}.v518-activity-info strong{font-size:.7rem;color:#708596}.v518-activity-meta{display:flex;gap:10px 18px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed #dbe6ed;color:#63798a;font-size:.76rem}.v518-note-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.v518-note-clamp.is-expanded{display:block;overflow:visible}.v518-note-more{display:block;margin:3px 0 0;padding:0;border:0;background:transparent;color:#277cae;font:700 .76rem/1.3 inherit;cursor:pointer}.v518-note-more[hidden]{display:none!important}
    @media(max-width:900px){.v518-optional-section .v405-training-meta-grid{grid-template-columns:1fr}.v518-participant-tools{grid-template-columns:minmax(0,1fr) auto auto}.v518-selected-count{grid-column:1/-1}}
    @media(max-width:760px){.v397-activities-layout{grid-template-columns:1fr!important}.v518-activity-entry-card{padding:12px!important}.v518-form-section{padding:10px;margin-bottom:10px;border-radius:12px}.v518-section-head{align-items:flex-start;flex-direction:column;gap:2px}.v518-section-head span{text-align:left}.v518-section-grid{grid-template-columns:1fr}.v518-section-grid .wide,.v518-participant-wrap,.v405-training-meta-grid,.v487-attachment-field{grid-column:auto}.v518-participant-tools{grid-template-columns:1fr 1fr}.v518-participant-tools input{grid-column:1/-1}.v518-selected-count{grid-column:1/-1}.v518-readonly-person{align-items:flex-start;flex-direction:column}.v518-form-actions{display:grid;grid-template-columns:1fr 1fr;position:sticky;bottom:max(0px,env(safe-area-inset-bottom));z-index:5;padding:8px 0 2px;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 28%)}.v518-form-actions button:only-child{grid-column:1/-1}.v518-form-actions button{width:100%;min-width:0}.v518-activity-head{display:block}.v518-created-rank{display:none}.v518-activity-info{grid-template-columns:1fr 1fr}.v518-dashboard-activity{overflow:hidden}.v518-activity-meta{display:grid;gap:4px}.activity-filter-grid,.activity-filter-search{min-width:0!important}.activity-list-card,.v397-all-activities{min-width:0;overflow:hidden}}
    @media(max-width:460px){.v518-activity-info{grid-template-columns:1fr}.v518-participant-tools{grid-template-columns:1fr 1fr}.v518-tool-btn{font-size:.78rem}.v518-activity-form .v396-participant{padding:7px}.v518-form-actions{gap:6px}.v518-form-actions button{font-size:.86rem}}
  `;
  document.head.appendChild(style);
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v519-activity-page-freeze-fix.js", error); }
;

/* Original source: patch-v542-single-sidebar-deeplink-controller.js */
try {
/* CNMI Staff Planner V542 — Single Sidebar + Deep-link State Controller
 * One authoritative owner for:
 *   1) top-level sidebar accordion state,
 *   2) cnmi-sidebar-tree-open-id compatibility state,
 *   3) the visible app version chip.
 * Legacy V523/V524 still build the menu DOM; legacy business/UI patches remain intact.
 * V531/V539 state controllers are no longer loaded to avoid competing observers.
 */
(function(){
  'use strict';
  if(window.__CNMI_V542_SINGLE_SIDEBAR_CONTROLLER__) return;
  window.__CNMI_V542_SINGLE_SIDEBAR_CONTROLLER__=true;
  window.__CNMI_V542_NAV_OWNER__=true;
  window.__CNMI_V542_VERSION_OWNER__=true;

  const VERSION='V550_RACE_TRADE_STATE_STABILITY';
  const LEGACY_OPEN='cnmi-sidebar-tree-open-id';
  const OWNER_OPEN='cnmi-v542-sidebar-open-tree';
  const OLD_STICKY='cnmi-v536-sidebar-open-tree';
  const MANUAL_CLOSED='cnmi-v542-sidebar-manual-closed-tree';
  const EXTRA_OPEN='cnmi-v528-admin-extra-open';
  let openTree='';
  let manualClosed='';
  let lastRouteTree='';
  let syncQueued=false;

  function ssGet(k,d=''){try{const v=sessionStorage.getItem(k);return v==null?d:String(v);}catch(_){return d;}}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){} }
  function ssDel(k){try{sessionStorage.removeItem(k);}catch(_){} }
  function normalize(id){
    const x=String(id||'').trim();
    if(!x) return '';
    if(x==='ot'||x.startsWith('v524:')) return x;
    if(x.startsWith('plain:')) return '';
    return `v524:${x}`;
  }
  function persist(){
    if(openTree){ssSet(OWNER_OPEN,openTree);ssSet(LEGACY_OPEN,openTree);ssSet(OLD_STICKY,openTree);}
    else{ssDel(OWNER_OPEN);ssDel(LEGACY_OPEN);ssDel(OLD_STICKY);}
    if(manualClosed)ssSet(MANUAL_CLOSED,manualClosed);else ssDel(MANUAL_CLOSED);
  }
  function getOpenTree(){return openTree;}
  function setOpenTree(id,opts={}){
    const next=normalize(id);
    openTree=next;
    if(next) manualClosed='';
    else if(opts.manualTree) manualClosed=normalize(opts.manualTree);
    else if(opts.clearManual) manualClosed='';
    persist();
    queueSync();
    return openTree;
  }
  function setManualClosed(id){
    openTree='';manualClosed=normalize(id);persist();queueSync();
  }
  function closeNestedOt(){
    ssSet('cnmi-v523-ot-open','0');
    ssSet(EXTRA_OPEN,'0');
    const branch=document.querySelector('[data-v528-extra-tree]');
    branch?.querySelector('[data-v528-extra-toggle]')?.setAttribute('aria-expanded','false');
    const extra=branch?.querySelector('[data-v528-extra-submenu]');
    extra?.classList.remove('open');extra?.setAttribute('aria-hidden','true');
  }
  function collapsePlain(page=''){
    openTree='';manualClosed='';persist();closeNestedOt();
    try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:`plain:${page||''}`,owner:'v542'}}));}catch(_){}
    queueSync();
  }

  const ROUTE_TREE=new Map([
    ['ot','ot'],
    ['leave','v524:leave'],['profile','v524:profile'],
    ['activities','v524:activities'],['training','v524:activities'],
    ['roster','v524:roster'],['trade','v524:roster'],
    ['positions/day','v524:positions-staff'],['positions/month','v524:positions-staff'],
    ['hr-check','v524:hr'],['hr-summary','v524:hr'],
    ['positions/month-admin','v524:positions-admin'],['positions/manage','v524:positions-admin'],['intern','v524:positions-admin'],
    ['physician-consult','v524:physician'],['users','v524:users'],
    ['profile-requests','v524:profile-requests'],['profile-requests/history','v524:profile-requests']
  ]);
  function routeName(){
    const raw=String(location.hash||'').replace(/^#\/?/,'');
    const q=raw.indexOf('?');
    try{return decodeURIComponent(q>=0?raw.slice(0,q):raw)||'dashboard';}catch(_){return (q>=0?raw.slice(0,q):raw)||'dashboard';}
  }
  function routeTree(){return ROUTE_TREE.get(routeName())||'';}
  function adoptRoute({initial=false,history=false}={}){
    const nextTree=routeTree();
    if(!nextTree){
      if(openTree) collapsePlain(routeName());
      lastRouteTree='';
      return;
    }
    const routeChanged=nextTree!==lastRouteTree;
    if(initial || history || routeChanged){
      if(manualClosed!==nextTree) setOpenTree(nextTree);
    }
    lastRouteTree=nextTree;
  }

  function syncDom(){
    syncQueued=false;
    document.querySelectorAll('.v523-nav-tree').forEach(tree=>{
      const open=openTree==='ot';
      tree.querySelector('.v523-nav-parent')?.setAttribute('aria-expanded',open?'true':'false');
      const sub=tree.querySelector('.v523-nav-submenu');
      sub?.classList.toggle('open',open);sub?.setAttribute('aria-hidden',open?'false':'true');
      ssSet('cnmi-v523-ot-open',open?'1':'0');
      if(!open) closeNestedOt();
    });
    document.querySelectorAll('.v524-nav-tree').forEach(tree=>{
      const id=`v524:${String(tree.dataset.v524Tree||'')}`;
      const open=openTree===id;
      tree.querySelector('.v524-nav-parent')?.setAttribute('aria-expanded',open?'true':'false');
      const sub=tree.querySelector('.v524-nav-submenu');
      sub?.classList.toggle('open',open);sub?.setAttribute('aria-hidden',open?'false':'true');
      ssSet(`cnmi-v524-tree-${String(tree.dataset.v524Tree||'')}-open`,open?'1':'0');
    });
  }
  function queueSync(){
    if(syncQueued)return;syncQueued=true;
    requestAnimationFrame(syncDom);
  }

  function decorateVersion(){
    const foot=document.querySelector('.sidebar-foot');
    if(!foot)return;
    let chip=foot.querySelector('[class*="version-chip"]');
    if(!chip){
      chip=document.createElement('div');chip.className='v520-version-chip v542-version-chip';foot.prepend(chip);
    }
    if(chip.textContent!=='v568')chip.textContent='v568';
    if(chip.title!=='RACE uses completed trade state that remains stable across async route refreshes (V550)')chip.title='RACE uses completed trade state that remains stable across async route refreshes (V550)';
    chip.classList.add('v542-version-chip');
  }

  /* Registered before legacy V523/V524 click handlers because this file is loaded first. */
  document.addEventListener('click',function(e){
    const target=e.target;
    const otToggle=target?.closest?.('[data-v523-submenu-toggle]');
    if(otToggle){
      const willOpen=otToggle.getAttribute('aria-expanded')!=='true';
      if(willOpen)setOpenTree('ot');else setManualClosed('ot');
      return;
    }
    const treeToggle=target?.closest?.('[data-v524-tree-toggle]');
    if(treeToggle){
      const id=`v524:${String(treeToggle.dataset.v524TreeToggle||'')}`;
      const willOpen=treeToggle.getAttribute('aria-expanded')!=='true';
      if(willOpen)setOpenTree(id);else setManualClosed(id);
      return;
    }
    const nested=target?.closest?.('[data-v528-extra-mode],[data-v528-extra-toggle]');
    if(nested){setOpenTree('ot');return;}
    const otItem=target?.closest?.('[data-v523-ot-item]');
    if(otItem){setOpenTree('ot');return;}
    const treeItem=target?.closest?.('[data-v524-child-key]');
    if(treeItem){setOpenTree(`v524:${String(treeItem.dataset.v524TreeItem||'')}`);return;}
    const plain=target?.closest?.('#mainNav .nav-btn[data-page]');
    if(plain && !plain.closest('.v523-nav-tree,.v524-nav-tree')){
      collapsePlain(String(plain.dataset.page||''));
    }
  },true);

  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    if(e?.detail?.owner==='v542')return;
    const id=String(e?.detail?.id||'');
    if(id.startsWith('plain:')){collapsePlain(id.slice(6));return;}
    const next=normalize(id);if(next)setOpenTree(next);
  });

  function onHistory(){adoptRoute({history:true});queueSync();decorateVersion();}
  window.addEventListener('hashchange',onHistory,true);
  window.addEventListener('popstate',onHistory,true);
  window.addEventListener('pageshow',()=>{adoptRoute({history:true});queueSync();decorateVersion();});

  function start(){
    openTree=normalize(ssGet(OWNER_OPEN,ssGet(LEGACY_OPEN,ssGet(OLD_STICKY,''))));
    manualClosed=normalize(ssGet(MANUAL_CLOSED,''));
    lastRouteTree=routeTree();
    if(lastRouteTree){
      if(!openTree && manualClosed!==lastRouteTree) openTree=lastRouteTree;
    }else{
      openTree='';manualClosed='';
    }
    persist();queueSync();decorateVersion();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(()=>queueSync()).observe(nav,{childList:true,subtree:true});
    const sidebar=document.getElementById('sidebar');
    if(sidebar)new MutationObserver(muts=>{
      if(muts.some(m=>m.addedNodes?.length)){queueSync();decorateVersion();}
    }).observe(sidebar,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV542SidebarOwner={version:VERSION,getOpenTree,setOpenTree,collapsePlain,sync:queueSync,decorateVersion,routeTree};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v542-single-sidebar-deeplink-controller.js", error); }
;

/* Original source: patch-v520-whole-app-ui-refresh.js */
try {
/* CNMI Staff Planner V520 — Whole App UI/UX Refresh
   UI only. Keeps formal names/data intact; operational pickers can display nickname-first. */
(function(){
  'use strict';
  if(window.__CNMI_V520_UI_REFRESH__) return;
  window.__CNMI_V520_UI_REFRESH__=true;
  const VERSION='V520_WHOLE_APP_UI_REFRESH';

  function stateSafe(){
    try{return window.state || (typeof state!=='undefined'?state:null);}catch(_){return null;}
  }
  function pageName(){return String(stateSafe()?.page||'').trim();}

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const foot=document.querySelector('.sidebar-foot');
    if(!foot || foot.querySelector('.v520-version-chip')) return;
    const el=document.createElement('span');
    el.className='v520-version-chip';
    el.textContent='v520';
    el.title='Whole App UI/UX Refresh';
    const user=foot.querySelector('.user-mini');
    if(user?.nextSibling) foot.insertBefore(el,user.nextSibling); else foot.prepend(el);
  }

  function compactActivityPeople(root=document){
    root.querySelectorAll?.('.v396-participant').forEach(item=>{
      const nick=String(item.querySelector('b')?.textContent||'').trim();
      const full=String(item.querySelector('small')?.textContent||'').trim();
      if(full){
        item.dataset.v520FullName=full;
        item.title=full;
        item.setAttribute('aria-label',nick && nick!==full ? `${nick} — ${full}` : full);
      }
    });
  }

  function exposeFullNamesAccessibly(root=document){
    root.querySelectorAll?.('.staff-color-pill[title]').forEach(el=>{
      if(!el.getAttribute('aria-label')) el.setAttribute('aria-label',el.getAttribute('title')||String(el.textContent||'').trim());
    });
  }

  function apply(root=document){
    document.body.classList.add('v520-ui-refresh');
    document.body.dataset.cnmiPage=pageName();
    decorateVersion();
    compactActivityPeople(root);
    exposeFullNamesAccessibly(root);
  }

  function queue(root=document){
    if(queue.pending) return;
    queue.pending=true;
    requestAnimationFrame(()=>{queue.pending=false;apply(root);});
  }
  queue.pending=false;

  const previousRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage){
    const wrapped=function renderPageV520(){
      const result=previousRenderPage.apply(this,arguments);
      queue(document);
      return result;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  const start=()=>{
    apply(document);
    const content=document.getElementById('pageContent');
    if(content){
      const observer=new MutationObserver(mutations=>{
        let changed=false;
        for(const m of mutations){ if((m.addedNodes||[]).length){changed=true;break;} }
        if(changed) queue(content);
      });
      observer.observe(content,{childList:true,subtree:true});
    }
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  window.cnmiV520={version:VERSION,apply};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v520-whole-app-ui-refresh.js", error); }
;

/* Original source: patch-v521-mobile-ui-clarity-polish.js */
try {
/* CNMI Staff Planner V521 — Mobile UI clarity polish
   Improves mobile-first readability, trims repeated helper text, and uses placeholders
   for simple text-entry fields where appropriate. No business logic / DB changes. */
(function(){
  'use strict';
  if(window.__CNMI_V521_UI_CLARITY__) return;
  window.__CNMI_V521_UI_CLARITY__=true;
  const VERSION='V521_MOBILE_UI_CLARITY_POLISH';

  function stateSafe(){
    try{return window.state || (typeof state!=='undefined'?state:null);}catch(_){return null;}
  }
  function pageName(){return String(stateSafe()?.page||'').trim();}
  function routeName(){
    const hash=String(location.hash||'');
    const m=hash.match(/^#\/([^?]+)/);
    return m?m[1].trim():'';
  }
  function norm(str){return String(str||'').replace(/[\s*：:]+/g,'').trim();}
  function cleanLabelText(str){
    return String(str||'')
      .replace(/\s*\*+\s*$/,'')
      .replace(/\(ถ้ามี\)/g,'')
      .replace(/\(ถ้ามี\)\s*$/,'')
      .replace(/\s+/g,' ')
      .trim();
  }
  function setDatasets(){
    document.body.classList.add('v521-ui-clarity');
    document.body.dataset.cnmiPage=pageName();
    document.body.dataset.cnmiRoute=routeName();
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const foot=document.querySelector('.sidebar-foot');
    if(!foot) return;
    const chip=foot.querySelector('.v520-version-chip, .v521-version-chip');
    if(chip){
      chip.classList.add('v521-version-chip');
      chip.textContent='v521';
      chip.title='Mobile UI clarity polish';
      return;
    }
    const el=document.createElement('span');
    el.className='v520-version-chip v521-version-chip';
    el.textContent='v521';
    el.title='Mobile UI clarity polish';
    foot.prepend(el);
  }

  function findRelatedLabel(input){
    if(!input) return null;
    const wrapped=input.closest('label');
    if(wrapped && !wrapped.classList.contains('v521-ignore-label')){
      const clone=wrapped.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button').forEach(n=>n.remove());
      const txt=cleanLabelText(clone.textContent||'');
      if(txt && txt.length<=40) return {node:wrapped,text:txt};
    }
    let probe=input.previousElementSibling;
    while(probe){
      const txt=cleanLabelText(probe.textContent||'');
      if(txt && txt.length<=40 && /^(LABEL|DIV|SPAN|P|H4|H5|STRONG)$/i.test(probe.tagName)) return {node:probe,text:txt};
      if(txt) break;
      probe=probe.previousElementSibling;
    }
    const field=input.closest('.field,.form-field,.grid-item,.v518-section-grid>div,.card>div,.toolbar>div');
    if(field){
      const candidate=field.querySelector('label,.field-label,strong,h4,h5');
      if(candidate && candidate!==input){
        const txt=cleanLabelText(candidate.textContent||'');
        if(txt && txt.length<=40) return {node:candidate,text:txt};
      }
    }
    return null;
  }

  function applyPlaceholders(root=document){
    root.querySelectorAll('input[type="text"],input[type="search"],input[type="tel"],input[type="url"],input[type="email"],textarea').forEach(input=>{
      const rel=findRelatedLabel(input);
      if(rel && (!input.placeholder || !input.placeholder.trim())){
        input.placeholder=rel.text;
      }
      if(rel && input.placeholder && norm(input.placeholder)===norm(rel.text)){
        rel.node.classList.add('v521-hide-label-on-mobile');
        input.classList.add('v521-placeholder-driven');
      }
    });
  }

  function compactHelpers(root=document){
    const selectors=['.hint','.muted','small','p'];
    root.querySelectorAll(selectors.join(',')).forEach(el=>{
      if(el.classList.contains('v521-skip-helper')) return;
      const text=String(el.textContent||'').replace(/\s+/g,' ').trim();
      if(!text) return;
      if(text.length>=48 && !el.closest('table,thead,tbody,.modal,.nav-btn,.topbar')){
        el.classList.add('v521-helper-compact');
      }
      if(/เลือกพร้อมกันได้หลายไฟล์/i.test(text)){
        el.textContent='แนบได้หลายไฟล์ และเพิ่มภายหลังได้';
        el.classList.add('v521-helper-short');
      }else if(/ไม่บังคับแนบไฟล์/i.test(text)){
        el.textContent='ไม่บังคับแนบไฟล์';
        el.classList.add('v521-helper-short');
      }else if(/ลิงก์ที่บันทึกจะแสดงเป็นข้อความกดได้/i.test(text)){
        el.textContent='ลิงก์ที่บันทึกสามารถกดเปิดได้';
        el.classList.add('v521-helper-short');
      }
    });
  }

  function decorateButtons(root=document){
    root.querySelectorAll('button,.primary-btn,.ghost-btn,.soft-btn').forEach(btn=>{
      const text=String(btn.textContent||'').replace(/\s+/g,' ').trim();
      if(!text || btn.dataset.v521Decorated) return;
      btn.dataset.v521Decorated='1';
      if(/^ค้นหา$/.test(text)) btn.dataset.v521Icon='search';
      else if(/บันทึก/.test(text)) btn.dataset.v521Icon='save';
      else if(/ล้าง/.test(text)) btn.dataset.v521Icon='clear';
      else if(/รีเฟรช/.test(text)) btn.dataset.v521Icon='refresh';
      else if(/ติดตั้งแอป/.test(text)) btn.dataset.v521Icon='download';
    });
  }

  function markDenseCards(root=document){
    root.querySelectorAll('.card').forEach(card=>{
      const text=String(card.textContent||'').replace(/\s+/g,' ').trim();
      if(text.length>500) card.classList.add('v521-dense-card');
    });
  }

  function apply(root=document){
    setDatasets();
    decorateVersion();
    applyPlaceholders(root);
    compactHelpers(root);
    decorateButtons(root);
    markDenseCards(root);
  }

  let pending=false;
  function queue(root=document){
    if(pending) return;
    pending=true;
    requestAnimationFrame(()=>{
      pending=false;
      apply(root);
    });
  }

  const previousRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage && !previousRenderPage.__v521Wrapped){
    const wrapped=function renderPageV521(){
      const result=previousRenderPage.apply(this,arguments);
      queue(document);
      return result;
    };
    wrapped.__v521Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  const start=()=>{
    apply(document);
    const content=document.getElementById('pageContent');
    if(content){
      const observer=new MutationObserver(mutations=>{
        let changed=false;
        for(const m of mutations){
          if((m.addedNodes && m.addedNodes.length) || m.type==='attributes'){changed=true;break;}
        }
        if(changed) queue(content);
      });
      observer.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    }
    window.addEventListener('hashchange',()=>queue(document));
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  window.cnmiV521={version:VERSION,apply};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v521-mobile-ui-clarity-polish.js", error); }
;

/* Original source: patch-v522-ot-submenu-mobile-navigation.js */
try {
/* CNMI Staff Planner V522 — OT Submenu Mobile Navigation
   Presentation/navigation only. Re-groups the existing V369 OT menu into 3 logical groups
   without changing the existing OT/HR calculation, approval, export, or data flow. */
(function(){
  'use strict';
  if(window.__CNMI_V522_OT_SUBMENU__) return;
  window.__CNMI_V522_OT_SUBMENU__=true;
  const VERSION='V522_OT_SUBMENU_MOBILE_NAVIGATION';

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return {};}
  }
  function isAdminSafe(){
    try{return typeof isAdmin==='function' && isAdmin();}catch(_){return false;}
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const STAFF_GROUPS=[
    {id:'duty',title:'เวร',desc:'ติดตาม · ยืนยัน',icon:'clock',items:[
      {id:'staff-track',label:'ติดตามเวร'},
      {id:'staff-confirm',label:'ยืนยันวันอยู่เวร'}
    ]},
    {id:'ot',title:'OT',desc:'ขอเพิ่ม · รายการ',icon:'ot',items:[
      {id:'staff-extra',label:'ขอ OT เพิ่ม'},
      {id:'staff-list',label:'รายการ OT ของฉัน'}
    ]},
    {id:'summary',title:'สรุป',desc:'รายละเอียด · รายเดือน',icon:'chart',items:[
      {id:'staff-details',label:'รายละเอียดเบิก'},
      {id:'staff-summary',label:'สรุปรายเดือน'}
    ]}
  ];

  const ADMIN_GROUPS=[
    {id:'duty',title:'เวรเจ้าหน้าที่',desc:'ยืนยัน · ติดตาม',icon:'clock',items:[
      {id:'admin-duty',label:'ยืนยันวันอยู่เวร'},
      {id:'tracking',label:'ติดตามเจ้าหน้าที่'}
    ]},
    {id:'ot',title:'จัดการ OT',desc:'ขอเพิ่ม · อนุมัติ',icon:'ot',items:[
      {id:'admin-extra',label:'ขอ OT เพิ่ม'},
      {id:'approve',label:'อนุมัติ OT'}
    ]},
    {id:'report',title:'รายงาน / HR',desc:'สรุป · Export',icon:'chart',items:[
      {id:'summary',label:'สรุป OT'},
      {id:'admin-details',label:'รายละเอียดเจ้าหน้าที่'},
      {id:'export',label:'Export HR'},
      {id:'history',label:'ประวัติ Export'}
    ]}
  ];

  function groups(){return isAdminSafe()?ADMIN_GROUPS:STAFF_GROUPS;}
  function groupForItem(itemId){return groups().find(g=>g.items.some(i=>i.id===itemId))||groups()[0];}
  function validGroup(id){return groups().some(g=>g.id===id);}

  function iconSvg(kind){
    const common='width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if(kind==='clock') return `<svg ${common}><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5l3.5 2"></path></svg>`;
    if(kind==='ot') return `<svg ${common}><path d="M7 3.5v17M17 3.5v17"></path><path d="M19.5 7.5H10.5a3 3 0 0 0 0 6h3a3 3 0 0 1 0 6H4.5"></path></svg>`;
    return `<svg ${common}><path d="M4 19V10"></path><path d="M10 19V5"></path><path d="M16 19v-8"></path><path d="M22 19V3"></path></svg>`;
  }

  function groupTabsHtml(selected){
    return `<div class="v522-group-tabs" role="tablist" aria-label="กลุ่มเมนูเวรและ OT">${groups().map(g=>`<button type="button" class="v522-group-btn ${g.id===selected?'active':''}" data-v522-ot-group="${esc(g.id)}" role="tab" aria-selected="${g.id===selected?'true':'false'}"><span class="v522-group-icon">${iconSvg(g.icon)}</span><span class="v522-group-copy"><b>${esc(g.title)}</b><small>${esc(g.desc)}</small></span></button>`).join('')}</div>`;
  }

  function submenuHtml(group,activeItem){
    return `<div class="v522-submenu" role="tablist" aria-label="เมนูย่อย ${esc(group.title)}">${group.items.map(i=>`<button type="button" class="v522-submenu-btn ${i.id===activeItem?'active':''}" data-v369-ot-menu="${esc(i.id)}" role="tab" aria-selected="${i.id===activeItem?'true':'false'}">${esc(i.label)}</button>`).join('')}</div>`;
  }

  function activeItemFromMenu(menu){
    return String(menu.querySelector('.v369-menu-btn.active,[data-v369-ot-menu][aria-selected="true"]')?.getAttribute('data-v369-ot-menu') || S()?.otMenuV369 || '');
  }

  function updateTopCopy(page){
    const head=page.querySelector('.v369-ot-menu-head');
    if(!head) return;
    const h=head.querySelector('h3');
    if(h) h.textContent=isAdminSafe()?'เวร / OT / HR':'เวร / OT ของฉัน';
    const hint=head.querySelector('.hint');
    if(hint){
      hint.textContent=isAdminSafe()?'เลือกเดือน แล้วเลือกกลุ่มงาน':'เลือกเดือน แล้วเลือกสิ่งที่ต้องการทำ';
      hint.classList.add('v522-top-hint');
    }
    const month=head.querySelector('.v369-month-label');
    if(month){
      for(const node of month.childNodes){
        if(node.nodeType===Node.TEXT_NODE && String(node.nodeValue||'').trim()){
          node.nodeValue='เดือน ';
          break;
        }
      }
    }
  }

  function renderGroupedMenu(page,forcedGroup){
    if(!page) return;
    const menu=page.querySelector('.v369-menu-grid');
    if(!menu) return;
    if(menu.dataset.v522Grouped==='1' && !forcedGroup){
      updateTopCopy(page);
      return;
    }
    const activeItem=activeItemFromMenu(menu);
    const activeGroup=groupForItem(activeItem);
    const stored=String(forcedGroup || S()?.otGroupV522 || '');
    const selected=validGroup(stored)?stored:activeGroup.id;
    const selectedGroup=groups().find(g=>g.id===selected)||activeGroup;
    S().otGroupV522=selectedGroup.id;

    menu.classList.add('v522-grouped-menu');
    menu.dataset.v522Grouped='1';
    menu.innerHTML=groupTabsHtml(selectedGroup.id)+submenuHtml(selectedGroup,activeItem);

    const content=page.querySelector('.v369-ot-content');
    const browsingDifferent=selectedGroup.id!==activeGroup.id;
    if(content){
      content.classList.toggle('v522-await-submenu',browsingDifferent);
      let chooser=page.querySelector('.v522-submenu-chooser');
      if(browsingDifferent){
        if(!chooser){
          chooser=document.createElement('div');
          chooser.className='v522-submenu-chooser';
          content.parentNode.insertBefore(chooser,content);
        }
        chooser.innerHTML=`<span class="v522-chooser-icon">${iconSvg(selectedGroup.icon)}</span><span><b>${esc(selectedGroup.title)}</b><small>เลือกเมนูย่อยด้านบนเพื่อเปิดรายการ</small></span>`;
      }else if(chooser){
        chooser.remove();
      }
    }
    updateTopCopy(page);
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v522';chip.title='OT submenu mobile navigation';chip.classList.add('v522-version-chip');}
  }

  function apply(root=document){
    decorateVersion();
    const page=(root.matches?.('.v369-ot-page')?root:root.querySelector?.('.v369-ot-page')) || document.querySelector('.v369-ot-page');
    if(page) renderGroupedMenu(page);
  }

  document.addEventListener('click',function(e){
    const groupBtn=e.target?.closest?.('[data-v522-ot-group]');
    if(groupBtn){
      e.preventDefault();
      e.stopPropagation();
      const id=String(groupBtn.getAttribute('data-v522-ot-group')||'');
      if(!validGroup(id)) return;
      S().otGroupV522=id;
      const page=groupBtn.closest('.v369-ot-page');
      renderGroupedMenu(page,id);
      const submenu=page?.querySelector('.v522-submenu');
      if(submenu && window.matchMedia('(max-width:760px)').matches){
        requestAnimationFrame(()=>submenu.scrollIntoView({block:'nearest',behavior:'smooth'}));
      }
      return;
    }
    const sub=e.target?.closest?.('[data-v369-ot-menu]');
    if(sub){
      const item=String(sub.getAttribute('data-v369-ot-menu')||'');
      const g=groupForItem(item);
      if(g) S().otGroupV522=g.id;
    }
  },true);

  let queued=false;
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply(document);});
  }

  const start=()=>{
    apply(document);
    const target=document.getElementById('pageContent')||document.body;
    const observer=new MutationObserver(mutations=>{
      for(const m of mutations){
        if(m.addedNodes?.length){queue();break;}
      }
    });
    observer.observe(target,{childList:true,subtree:true});
    window.addEventListener('hashchange',queue);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  window.cnmiV522={version:VERSION,apply,renderGroupedMenu};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v522-ot-submenu-mobile-navigation.js", error); }
;

/* Original source: patch-v523-sidebar-tree-submenu.js */
try {
/* CNMI Staff Planner V523 — Sidebar Tree Submenu
   Moves OT navigation out of page cards into the sidebar tree. UI/navigation only. */
(function(){
  'use strict';
  if(window.__CNMI_V523_SIDEBAR_SUBMENU__) return;
  window.__CNMI_V523_SIDEBAR_SUBMENU__=true;
  const VERSION='V523_SIDEBAR_TREE_SUBMENU';
  const SIDEBAR_OPEN_KEY='cnmi-sidebar-tree-open-id';
  function getOpenTree(){try{if(window.cnmiV542SidebarOwner?.getOpenTree)return window.cnmiV542SidebarOwner.getOpenTree();return sessionStorage.getItem(SIDEBAR_OPEN_KEY)||'';}catch(_){return '';} }
  function setOpenTree(id){try{if(window.cnmiV542SidebarOwner?.setOpenTree){window.cnmiV542SidebarOwner.setOpenTree(id);return;}if(id)sessionStorage.setItem(SIDEBAR_OPEN_KEY,id);else sessionStorage.removeItem(SIDEBAR_OPEN_KEY);}catch(_){} }
  function announceOpenTree(id){setOpenTree(id);try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id}}));}catch(_){} }

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return {};}
  }
  function isAdminSafe(){
    try{return typeof isAdmin==='function' && isAdmin();}catch(_){return false;}
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  const STAFF_ITEMS=[
    ['staff-track','ติดตามเวรของฉัน','track'],
    ['staff-confirm','ยืนยันวันอยู่เวร','confirm'],
    ['staff-extra','ขอ OT เพิ่ม / ปั่นเลือด','plus'],
    ['staff-list','รายการ OT ของฉัน','list'],
    ['staff-details','รายละเอียดเบิก','detail'],
    ['staff-summary','สรุปรายเดือน','summary']
  ];
  const ADMIN_ITEMS=[
    ['admin-duty','ยืนยันเวรแทนเจ้าหน้าที่','confirm'],
    ['admin-extra','ขอ OT เพิ่มแทนเจ้าหน้าที่','plus'],
    ['tracking','ติดตามเจ้าหน้าที่','track'],
    ['approve','อนุมัติ OT','approve'],
    ['summary','สรุป OT รายเดือน','summary'],
    ['admin-details','รายละเอียด OT เจ้าหน้าที่','detail'],
    ['export','Export HR','export'],
    ['history','ประวัติ Export','history']
  ];
  function items(){return isAdminSafe()?ADMIN_ITEMS:STAFF_ITEMS;}
  function validItem(id){return items().some(([x])=>x===id);}
  function defaultItem(){return isAdminSafe()?'admin-duty':'staff-track';}
  function activeItem(){
    const current=String(S()?.otMenuV369||'');
    return validItem(current)?current:defaultItem();
  }
  function groupFor(id){
    if(isAdminSafe()){
      if(['admin-duty','tracking'].includes(id)) return 'duty';
      if(['admin-extra','approve'].includes(id)) return 'ot';
      return 'report';
    }
    if(['staff-track','staff-confirm'].includes(id)) return 'duty';
    if(['staff-extra','staff-list'].includes(id)) return 'ot';
    return 'summary';
  }
  function icon(kind){
    const attrs='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      track:`<svg ${attrs}><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>`,
      confirm:`<svg ${attrs}><path d="M5 12.5 9.2 17 19 7"></path></svg>`,
      plus:`<svg ${attrs}><path d="M12 5v14M5 12h14"></path></svg>`,
      list:`<svg ${attrs}><path d="M9 6h10M9 12h10M9 18h10"></path><path d="M5 6h.01M5 12h.01M5 18h.01"></path></svg>`,
      detail:`<svg ${attrs}><rect x="4" y="3.5" width="16" height="17" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg>`,
      summary:`<svg ${attrs}><path d="M5 19V10M12 19V5M19 19v-7"></path></svg>`,
      approve:`<svg ${attrs}><circle cx="12" cy="12" r="8"></circle><path d="M8.5 12.2 11 14.7 15.8 9.8"></path></svg>`,
      export:`<svg ${attrs}><path d="M12 3v11"></path><path d="m8 10 4 4 4-4"></path><path d="M5 18h14"></path></svg>`,
      history:`<svg ${attrs}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"></path><path d="M4 4v4.5h4.5"></path><path d="M12 8v4l2.5 1.5"></path></svg>`
    };
    return map[kind]||map.list;
  }

  function submenuHtml(open){
    const active=activeItem();
    return `<div class="v523-nav-submenu ${open?'open':''}" data-v523-submenu aria-hidden="${open?'false':'true'}">
      ${items().map(([id,label,kind])=>`<button type="button" class="v523-subitem ${id===active && S().page==='ot'?'active':''}" data-v523-ot-item="${esc(id)}" aria-current="${id===active && S().page==='ot'?'page':'false'}"><span class="v523-branch-icon">${icon(kind)}</span><span>${esc(label)}</span></button>`).join('')}
    </div>`;
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v523';chip.title='Sidebar tree submenu';chip.classList.add('v523-version-chip');}
  }

  function installTree(){
    decorateVersion();
    const nav=document.getElementById('mainNav');
    if(!nav) return;
    const otBtn=nav.querySelector('.nav-btn[data-page="ot"]');
    if(!otBtn) return;
    if(otBtn.closest('.v523-nav-tree')){
      refreshTree();
      return;
    }
    const wasOpen = S().page==='ot' || getOpenTree()==='ot';
    const tree=document.createElement('div');
    tree.className='v523-nav-tree';
    tree.dataset.v523Tree='ot';
    tree.innerHTML=`<button type="button" class="nav-btn v523-nav-parent ${S().page==='ot'?'active':''}" data-v523-submenu-toggle="ot" aria-expanded="${wasOpen?'true':'false'}">
      <span class="nav-emoji">⏱️</span><span class="v523-parent-label">ลงชื่ออยู่เวร / ขอ OT เพิ่ม</span><span class="v523-caret" aria-hidden="true">›</span>
    </button>${submenuHtml(wasOpen)}`;
    otBtn.replaceWith(tree);
  }

  function refreshTree(){
    const tree=document.querySelector('.v523-nav-tree');
    if(!tree) return;
    const parent=tree.querySelector('.v523-nav-parent');
    const sub=tree.querySelector('.v523-nav-submenu');
    const openId=getOpenTree();
    const shouldOpen = window.__CNMI_V542_NAV_OWNER__ ? openId==='ot' : (openId ? openId==='ot' : S().page==='ot');
    if(parent){
      parent.classList.toggle('active',S().page==='ot');
      parent.setAttribute('aria-expanded',shouldOpen?'true':'false');
    }
    if(sub){
      sub.classList.toggle('open',shouldOpen);
      sub.setAttribute('aria-hidden',shouldOpen?'false':'true');
      sub.querySelectorAll('[data-v523-ot-item]').forEach(btn=>{
        const active=S().page==='ot' && btn.dataset.v523OtItem===activeItem();
        btn.classList.toggle('active',active);
        btn.setAttribute('aria-current',active?'page':'false');
      });
    }
  }

  function compactOtTopCard(){
    const page=document.querySelector('.v369-ot-page');
    if(!page) return;
    page.classList.add('v523-sidebar-driven');
    const top=page.querySelector('.v369-ot-menu-card');
    if(top) top.classList.add('v523-month-only-card');
    const selected=activeItem();
    const g=groupFor(selected);
    S().otGroupV522=g;
  }

  function apply(){
    if(!window.__CNMI_V542_NAV_OWNER__ && S().page==='ot' && !getOpenTree()) announceOpenTree('ot');
    installTree();
    refreshTree();
    compactOtTopCard();
  }

  const oldRenderNav=window.renderNav || (typeof renderNav==='function'?renderNav:null);
  if(oldRenderNav && !oldRenderNav.__v523Wrapped){
    const wrapped=function renderNavV523(){
      const result=oldRenderNav.apply(this,arguments);
      requestAnimationFrame(apply);
      return result;
    };
    wrapped.__v523Wrapped=true;
    try{window.renderNav=renderNav=wrapped;}catch(_){window.renderNav=wrapped;}
  }

  document.addEventListener('click',function(e){
    const toggle=e.target?.closest?.('[data-v523-submenu-toggle]');
    if(toggle){
      e.preventDefault();
      e.stopPropagation();
      const tree=toggle.closest('.v523-nav-tree');
      const sub=tree?.querySelector('.v523-nav-submenu');
      const open=toggle.getAttribute('aria-expanded')!=='true';
      toggle.setAttribute('aria-expanded',open?'true':'false');
      sub?.classList.toggle('open',open);
      sub?.setAttribute('aria-hidden',open?'false':'true');
      sessionStorage.setItem('cnmi-v523-ot-open',open?'1':'0');
      if(open) announceOpenTree('ot');
      else if(getOpenTree()==='ot') setOpenTree('');
      return;
    }
    const item=e.target?.closest?.('[data-v523-ot-item]');
    if(item){
      e.preventDefault();
      e.stopPropagation();
      const id=String(item.dataset.v523OtItem||'');
      if(!validItem(id)) return;
      S().otMenuV369=id;
      S().otGroupV522=groupFor(id);
      S().page='ot';
      sessionStorage.setItem('cnmi-v523-ot-open','1');
      announceOpenTree('ot');
      const sidebar=document.getElementById('sidebar');
      if(sidebar && window.matchMedia('(max-width:820px)').matches){
        sidebar.classList.remove('open');
        document.body.classList.remove('sidebar-open');
      }
      try{renderPage();}catch(_){try{window.renderPage?.();}catch(__){}}
      return;
    }
  },true);


  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    const id=String(e?.detail?.id||'');
    if(id==='ot') return;
    const tree=document.querySelector('.v523-nav-tree');
    const parent=tree?.querySelector('.v523-nav-parent');
    const sub=tree?.querySelector('.v523-nav-submenu');
    parent?.setAttribute('aria-expanded','false');
    sub?.classList.remove('open');
    sub?.setAttribute('aria-hidden','true');
    try{sessionStorage.setItem('cnmi-v523-ot-open','0');}catch(_){}
  });

  let queued=false;
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  const start=()=>{
    apply();
    const nav=document.getElementById('mainNav');
    if(nav){
      new MutationObserver(muts=>{
        for(const m of muts){if(m.addedNodes?.length){queue();break;}}
      }).observe(nav,{childList:true,subtree:true});
    }
    const content=document.getElementById('pageContent');
    if(content){
      new MutationObserver(muts=>{
        for(const m of muts){if(m.addedNodes?.length){queue();break;}}
      }).observe(content,{childList:true,subtree:true});
    }
    window.addEventListener('hashchange',queue);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  window.cnmiV523={version:VERSION,apply,installTree};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v523-sidebar-tree-submenu.js", error); }
;

/* Original source: patch-v524-unified-sidebar-tree-navigation.js */
try {
/* CNMI Staff Planner V524 — Unified Sidebar Tree Navigation
 * Extends the V523 sidebar-tree pattern across the app where a screen is really
 * a collection of separate tasks/pages. Filters and data-view controls remain in-page.
 * UI/navigation only. No DB/schema/business-rule changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V524_UNIFIED_TREE_NAV__) return;
  window.__CNMI_V524_UNIFIED_TREE_NAV__=true;
  const VERSION='V524_UNIFIED_SIDEBAR_TREE_NAVIGATION';
  const SIDEBAR_OPEN_KEY='cnmi-sidebar-tree-open-id';
  function getOpenTree(){try{if(window.cnmiV542SidebarOwner?.getOpenTree)return window.cnmiV542SidebarOwner.getOpenTree();return sessionStorage.getItem(SIDEBAR_OPEN_KEY)||'';}catch(_){return '';} }
  function setOpenTree(id){try{if(window.cnmiV542SidebarOwner?.setOpenTree){window.cnmiV542SidebarOwner.setOpenTree(id);return;}if(id)sessionStorage.setItem(SIDEBAR_OPEN_KEY,id);else sessionStorage.removeItem(SIDEBAR_OPEN_KEY);}catch(_){} }
  function announceOpenTree(id){setOpenTree(id);try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id}}));}catch(_){} }

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return window.state||{};}
  }
  function isAdminSafe(){
    try{return typeof isAdmin==='function' && isAdmin();}catch(_){return false;}
  }
  function isPhysicianSafe(){
    const s=S(),p=s?.profile||(s?.staff||[]).find(x=>String(x.id)===String(typeof currentStaffId==='function'?currentStaffId():''));
    if(!p)return false;
    try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(_){ }
    return [p.staff_type,p.position,p.role].some(v=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(v||'').trim()));
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function page(){return String(S()?.page||'');}
  function ssGet(key,fallback=''){
    try{return sessionStorage.getItem(key)||fallback;}catch(_){return fallback;}
  }
  function ssSet(key,value){try{sessionStorage.setItem(key,String(value));}catch(_){}}
  function closeMobileSidebar(){
    if(!window.matchMedia('(max-width:820px)').matches) return;
    const sidebar=document.getElementById('sidebar');
    sidebar?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }
  function icon(kind){
    const attrs='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      add:`<svg ${attrs}><path d="M12 5v14M5 12h14"></path></svg>`,
      search:`<svg ${attrs}><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>`,
      history:`<svg ${attrs}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"></path><path d="M4 4v4.5h4.5"></path><path d="M12 8v4l2.5 1.5"></path></svg>`,
      list:`<svg ${attrs}><path d="M9 6h10M9 12h10M9 18h10"></path><path d="M5 6h.01M5 12h.01M5 18h.01"></path></svg>`,
      calendar:`<svg ${attrs}><rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4M16 3v4M4 9h16"></path></svg>`,
      trade:`<svg ${attrs}><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5"></path><path d="M17 7v4M7 17v-4"></path></svg>`,
      day:`<svg ${attrs}><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 9h8M8 13h4"></path></svg>`,
      month:`<svg ${attrs}><rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M7 3v4M17 3v4M3.5 9h17M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"></path></svg>`,
      check:`<svg ${attrs}><path d="M5 12.5 9.2 17 19 7"></path></svg>`,
      pending:`<svg ${attrs}><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>`,
      person:`<svg ${attrs}><circle cx="12" cy="8" r="3"></circle><path d="M5.5 19c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5"></path></svg>`,
      settings:`<svg ${attrs}><circle cx="12" cy="12" r="3"></circle><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6a8 8 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A8 8 0 0 0 10.4 18l.3 2.6h4L15 18a8 8 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5c.1-.4.1-.7.1-1.2Z"></path></svg>`,
      trainee:`<svg ${attrs}><path d="m3 9 9-5 9 5-9 5-9-5Z"></path><path d="M7 12.5V17c3 2 7 2 10 0v-4.5"></path></svg>`
    };
    return map[kind]||map.list;
  }

  function currentLeaveView(){
    if(S()?.editingLeaveId) return 'form';
    return String(S()?.v524LeaveView||ssGet('cnmi-v524-leave-view','form')||'form');
  }
  function currentActivityView(){
    if(S()?.editingActivityId) return 'create';
    return String(S()?.v524ActivityView||ssGet('cnmi-v524-activity-view','create')||'create');
  }
  function currentInternView(){
    return String(S()?.v524InternView||ssGet('cnmi-v524-intern-view','add')||'add');
  }
  function currentProfileView(){
    return String(S()?.v524ProfileView||ssGet('cnmi-v524-profile-view','profile')||'profile');
  }
  function currentUsersView(){
    return String(S()?.v524UsersView||ssGet('cnmi-v524-users-view','manage')||'manage');
  }
  function currentPhysicianView(){
    return String(S()?.v524PhysicianView||ssGet('cnmi-v524-physician-view','daytime')||'daytime');
  }

  function defs(){
    const admin=isAdminSafe();
    return [
      {
        id:'leave', anchor:'leave', members:['leave'], label:'ลา / ไม่รับเวร', emoji:'🌿',
        active:()=>page()==='leave',
        children:[
          {key:'leave-form',label:'บันทึกลา / ไม่รับเวร',kind:'add',page:'leave',viewKey:'leave',view:'form'},
          {key:'leave-history',label:admin?'รายการลาของทุกคน':'ประวัติการลาของฉัน',kind:'history',page:'leave',viewKey:'leave',view:'history'}
        ]
      },
      {
        id:'profile', anchor:'myProfile', members:['myProfile'], label:'ข้อมูลส่วนตัว', emoji:'👤',
        active:()=>page()==='myProfile',
        children:[
          {key:'profile-main',label:'ข้อมูลและขอแก้ไข',kind:'person',page:'myProfile',viewKey:'profile',view:'profile'},
          {key:'profile-history',label:'คำขอล่าสุดของฉัน',kind:'history',page:'myProfile',viewKey:'profile',view:'requests'}
        ]
      },
      {
        id:'activities', anchor:'activities', members:['activities','myTraining'], label:'กิจกรรม / อบรม', emoji:'🗂️',
        active:()=>['activities','myTraining'].includes(page()),
        children:[
          {key:'activity-create',label:'เพิ่มกิจกรรม',kind:'add',page:'activities',viewKey:'activity',view:'create'},
          {key:'activity-search',label:'ค้นหากิจกรรม',kind:'search',page:'activities',viewKey:'activity',view:'search'},
          {key:'my-training',label:'รายการอบรมของฉัน',kind:'list',page:'myTraining',requiresNav:'myTraining'}
        ]
      },
      {
        id:'roster', anchor:'schedule', members:['schedule','tradeRequests'], label:'ตารางเวร', emoji:'📋',
        active:()=>['schedule','tradeRequests'].includes(page()),
        children:[
          {key:'roster-view',label:'ตารางเวรประจำเดือน',kind:'calendar',page:'schedule',requiresNav:'schedule'},
          {key:'roster-trade',label:'คำขอขายเวร',kind:'trade',page:'tradeRequests',requiresNav:'tradeRequests'}
        ]
      },
      {
        id:'positions-staff', anchor:'positionMonthView', members:['positionMonthView','positions'], label:'ตำแหน่งกลางวัน', emoji:'🧪',
        active:()=>['positionMonthView','positions'].includes(page()),
        children:[
          {key:'positions-day',label:'รายวัน',kind:'day',page:'positions',requiresNav:'positions'},
          {key:'positions-month',label:'รายเดือน',kind:'month',page:'positionMonthView',requiresNav:'positionMonthView'}
        ]
      },
      {
        id:'hr', anchor:'hr', members:['hr','hrSummary'], label:'ตรวจสอบ HR', emoji:'🧾', adminOnly:true,
        active:()=>['hr','hrSummary'].includes(page()),
        children:[
          {key:'hr-pending',label:'รอตรวจสอบ',kind:'pending',page:'hr',requiresNav:'hr'},
          {key:'hr-done',label:'ตรวจสอบแล้ว',kind:'check',page:'hrSummary',requiresNav:'hrSummary'}
        ]
      },
      {
        id:'positions-admin', anchor:'positionMonth', members:['positionMonth','positionManagement','internManagement'], label:'ตำแหน่ง / Intern', emoji:'🧩', adminOnly:true,
        active:()=>['positionMonth','positionManagement','internManagement'].includes(page()),
        children:[
          {key:'position-plan',label:'จัดตำแหน่งรายเดือน',kind:'month',page:'positionMonth',requiresNav:'positionMonth'},
          {key:'position-master',label:'จัดการตำแหน่งหลัก',kind:'settings',page:'positionManagement',requiresNav:'positionManagement'},
          {key:'intern-add',label:'เพิ่มรายชื่อผู้ฝึก',kind:'add',page:'internManagement',viewKey:'intern',view:'add',requiresNav:'internManagement'},
          {key:'intern-mentor',label:'กำหนดช่วงพี่เลี้ยง',kind:'person',page:'internManagement',viewKey:'intern',view:'mentor',requiresNav:'internManagement'},
          {key:'intern-list',label:'ทะเบียนผู้ฝึก',kind:'trainee',page:'internManagement',viewKey:'intern',view:'registry',requiresNav:'internManagement'},
          {key:'intern-history',label:'ประวัติพี่เลี้ยง',kind:'history',page:'internManagement',viewKey:'intern',view:'history',requiresNav:'internManagement'}
        ]
      },
      {
        id:'physician', anchor:'physicianConsult', members:['physicianConsult'], label:'ตารางแพทย์ Consult', emoji:'🩺', adminOnly:!isPhysicianSafe(),
        active:()=>page()==='physicianConsult',
        children:[
          {key:'physician-daytime',label:'ในเวลา จ.–ศ.',kind:'calendar',page:'physicianConsult',viewKey:'physician',view:'daytime'},
          {key:'physician-oncall',label:'นอกเวลา / วันหยุด',kind:'pending',page:'physicianConsult',viewKey:'physician',view:'oncall'},
          {key:'physician-override',label:'แก้เฉพาะวัน',kind:'settings',page:'physicianConsult',viewKey:'physician',view:'override'},
          {key:'physician-list',label:'รายการที่บันทึก',kind:'list',page:'physicianConsult',viewKey:'physician',view:'list'}
        ]
      },
      {
        id:'users', anchor:'users', members:['users'], label:'ผู้ใช้งานและสิทธิ์', emoji:'👥', adminOnly:true,
        active:()=>page()==='users',
        children:[
          {key:'users-manage',label:'จัดการเจ้าหน้าที่',kind:'person',page:'users',viewKey:'users',view:'manage'},
          {key:'users-add',label:'เพิ่มผู้ใช้งานใหม่',kind:'add',page:'users',viewKey:'users',view:'add'}
        ]
      },
      {
        id:'profile-requests', anchor:'profileRequests', members:['profileRequests','profileRequestSummary'], label:'แก้ไขข้อมูล Staff', emoji:'📝', adminOnly:true,
        active:()=>['profileRequests','profileRequestSummary'].includes(page()),
        children:[
          {key:'profile-pending',label:'คำขอรออนุมัติ',kind:'pending',page:'profileRequests',requiresNav:'profileRequests'},
          {key:'profile-history',label:'ประวัติคำขอ',kind:'history',page:'profileRequestSummary',requiresNav:'profileRequestSummary'}
        ]
      }
    ].filter(d=>!d.adminOnly||admin);
  }

  function navHas(id){return !!document.querySelector(`#mainNav .nav-btn[data-page="${CSS.escape(id)}"]`);}
  function childAvailable(child){return !child.requiresNav || navHas(child.requiresNav);}
  function activeChild(def,child){
    if(page()!==child.page) return false;
    if(child.viewKey==='leave') return currentLeaveView()===child.view;
    if(child.viewKey==='activity') return currentActivityView()===child.view;
    if(child.viewKey==='intern') return currentInternView()===child.view;
    if(child.viewKey==='profile') return currentProfileView()===child.view;
    if(child.viewKey==='users') return currentUsersView()===child.view;
    if(child.viewKey==='physician') return currentPhysicianView()===child.view;
    return true;
  }
  function openKey(id){return `cnmi-v524-tree-${id}-open`;}
  function shouldOpen(def){
    const openId=getOpenTree();
    if(window.__CNMI_V542_NAV_OWNER__) return openId===`v524:${def.id}`;
    if(openId) return openId===`v524:${def.id}`;
    const activeDef=defs().find(d=>!!d.active?.());
    return !!activeDef && activeDef.id===def.id;
  }

  function treeHtml(def,children){
    const open=shouldOpen(def);
    return `<button type="button" class="nav-btn v524-nav-parent ${def.active?.()?'active':''}" data-v524-tree-toggle="${esc(def.id)}" aria-expanded="${open?'true':'false'}">
      <span class="nav-emoji">${def.emoji}</span><span class="v524-parent-label">${esc(def.label)}</span><span class="v524-caret" aria-hidden="true">›</span>
    </button>
    <div class="v524-nav-submenu ${open?'open':''}" data-v524-tree-submenu="${esc(def.id)}" aria-hidden="${open?'false':'true'}">
      ${children.map(c=>`<button type="button" class="v524-subitem ${activeChild(def,c)?'active':''}" data-v524-tree-item="${esc(def.id)}" data-v524-child-key="${esc(c.key)}" aria-current="${activeChild(def,c)?'page':'false'}"><span class="v524-branch-icon">${icon(c.kind)}</span><span>${esc(c.label)}</span></button>`).join('')}
    </div>`;
  }

  function installTree(def){
    const nav=document.getElementById('mainNav');
    if(!nav) return;
    let existing=nav.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(def.id)}"]`);
    if(existing){refreshTree(def,existing);return;}
    const buttons=def.members.map(id=>nav.querySelector(`.nav-btn[data-page="${CSS.escape(id)}"]`)).filter(Boolean);
    const anchor=nav.querySelector(`.nav-btn[data-page="${CSS.escape(def.anchor)}"]`)||buttons[0];
    const children=def.children.filter(childAvailable);
    if(!anchor || children.length<2) return;
    const tree=document.createElement('div');
    tree.className='v524-nav-tree';
    tree.dataset.v524Tree=def.id;
    tree.innerHTML=treeHtml(def,children);
    anchor.replaceWith(tree);
    buttons.filter(b=>b!==anchor).forEach(b=>b.remove());
  }

  function refreshTree(def,tree){
    const parent=tree.querySelector('.v524-nav-parent');
    const sub=tree.querySelector('.v524-nav-submenu');
    const open=shouldOpen(def);
    parent?.classList.toggle('active',!!def.active?.());
    parent?.setAttribute('aria-expanded',open?'true':'false');
    sub?.classList.toggle('open',open);
    sub?.setAttribute('aria-hidden',open?'false':'true');
    sub?.querySelectorAll('[data-v524-child-key]').forEach(btn=>{
      const c=def.children.find(x=>x.key===btn.dataset.v524ChildKey);
      const active=!!c&&activeChild(def,c);
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-current',active?'page':'false');
    });
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v524';chip.title='Unified sidebar tree navigation';chip.classList.add('v524-version-chip');}
  }

  function applyLeaveSubview(){
    if(page()!=='leave') return;
    const form=document.getElementById('leaveForm');
    const formCard=form?.closest('.card');
    const listCard=document.querySelector('#pageContent .leave-list-card');
    if(!formCard||!listCard) return;
    const grid=formCard.parentElement;
    if(!grid) return;
    const view=currentLeaveView();
    S().v524LeaveView=view;
    grid.classList.add('v524-single-view-layout','v524-leave-layout');
    formCard.classList.add('v524-leave-form-panel');
    listCard.classList.add('v524-leave-history-panel');
    formCard.classList.toggle('v524-panel-hidden',view!=='form');
    listCard.classList.toggle('v524-panel-hidden',view!=='history');
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='history'?(isAdminSafe()?'รายการลาและไม่รับเวรของทุกคน':'ประวัติลาและไม่รับเวรของฉัน'):'บันทึกหรือแก้ไขรายการลา / ไม่รับเวร';
  }

  function applyActivitySubview(){
    if(page()!=='activities') return;
    const form=document.getElementById('activityForm');
    const formCard=form?.closest('.card');
    const layout=formCard?.parentElement?.classList?.contains('v397-activities-layout')?formCard.parentElement:document.querySelector('#pageContent .v397-activities-layout');
    const listCard=layout?.querySelector('.activity-list-card,.v397-all-activities');
    if(!layout||!formCard||!listCard||formCard===listCard) return;
    const view=currentActivityView();
    S().v524ActivityView=view;
    layout.classList.add('v524-single-view-layout','v524-activity-layout');
    formCard.classList.add('v524-activity-create-panel');
    listCard.classList.add('v524-activity-search-panel');
    formCard.classList.toggle('v524-panel-hidden',view!=='create');
    listCard.classList.toggle('v524-panel-hidden',view!=='search');
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='search'?'ค้นหา ดู และแก้ไขกิจกรรมย้อนหลัง':'เพิ่มหรือแก้ไขกิจกรรมหน่วยงาน';
  }

  function applyProfileSubview(){
    if(page()!=='myProfile') return;
    const form=document.getElementById('profileChangeForm');
    const main=form?.closest('.card');
    const root=main?.parentElement;
    if(!root||!main) return;
    const cards=[...root.children].filter(el=>el.classList?.contains('card'));
    const requests=cards.find(card=>card!==main && /คำขอล่าสุดของฉัน/.test(String(card.textContent||'')));
    if(!requests) return;
    const view=currentProfileView();S().v524ProfileView=view;
    root.classList.add('v524-single-view-layout','v524-profile-layout');
    main.classList.add('v524-profile-main-panel');requests.classList.add('v524-profile-requests-panel');
    main.classList.toggle('v524-panel-hidden',view!=='profile');
    requests.classList.toggle('v524-panel-hidden',view!=='requests');
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='requests'?'ติดตามคำขอแก้ไขข้อมูลของฉัน':'ดูข้อมูลและส่งคำขอแก้ไข';
  }

  function applyUsersSubview(){
    if(page()!=='users') return;
    const root=document.querySelector('#pageContent .users-page-v49');
    if(!root) return;
    const addPanel=root.querySelector('.v479-new-user-panel');
    const managePanels=[...root.children].filter(el=>el.classList?.contains('card') && el!==addPanel);
    if(!addPanel||!managePanels.length) return;
    const view=currentUsersView();S().v524UsersView=view;
    root.classList.add('v524-users-layout');
    managePanels.forEach(el=>el.classList.toggle('v524-panel-hidden',view!=='manage'));
    addPanel.classList.toggle('v524-panel-hidden',view!=='add');
    if(view==='add'){
      const details=addPanel.querySelector('details.add-user-details');if(details) details.open=true;
    }
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='add'?'สร้างบัญชีเจ้าหน้าที่ใหม่':'แก้ไขข้อมูล สิทธิ์ และสถานะเจ้าหน้าที่';
  }

  function applyPhysicianSubview(){
    if(page()!=='physicianConsult') return;
    const root=document.querySelector('#pageContent .v452-admin-page');
    if(!root) return;
    const view=currentPhysicianView();S().v524PhysicianView=view;
    root.classList.add('v524-physician-single-view');
    const day=root.querySelector('#v452DaytimeForm');
    const oncall=root.querySelector('#v452OncallForm');
    const override=root.querySelector('#v452OverrideForm');
    const list=[...root.querySelectorAll(':scope > .card')].find(card=>/รายการที่บันทึกแล้ว/.test(String(card.textContent||'')));
    const panels={daytime:day,oncall,override,list};
    Object.entries(panels).forEach(([key,el])=>el?.classList.toggle('v524-panel-hidden',key!==view));
    const formGrid=root.querySelector('.v452-form-grid');
    if(formGrid){
      formGrid.classList.add('v524-physician-grid');
      formGrid.classList.toggle('v524-grid-hidden',!['daytime','oncall'].includes(view));
    }
    const intro=root.querySelector('.v452-intro');
    if(intro) intro.classList.add('v524-physician-intro');
    const subtitle=document.getElementById('pageSubtitle');
    const labels={daytime:'กำหนดแพทย์ในเวลา จ.–ศ.',oncall:'กำหนดแพทย์นอกเวลา / วันหยุด',override:'แก้ตารางแพทย์เฉพาะวัน',list:'รายการตารางแพทย์ที่บันทึกแล้ว'};
    if(subtitle) subtitle.textContent=labels[view]||'ตารางแพทย์ Consult';
  }

  function applyInternSubview(){
    if(page()!=='internManagement') return;
    const root=document.querySelector('#pageContent .v273-intern-page');
    if(!root) return;
    const view=currentInternView();
    S().v524InternView=view;
    root.classList.add('v524-intern-single-view');
    const cards=[...root.querySelectorAll('.card')];
    const map=[];
    cards.forEach(card=>{
      let key='';
      if(card.querySelector('#v273TraineeDirectoryForm')) key='add';
      else if(card.querySelector('#v273TrainingRangeForm')) key='mentor';
      else {
        const title=String(card.querySelector('h2,h3')?.textContent||'').trim();
        if(/ทะเบียนน้องใหม่|ทะเบียน.*Intern|ทะเบียนผู้ฝึก/i.test(title)) key='registry';
        else if(/ประวัติช่วงพี่เลี้ยง|ประวัติ.*พี่เลี้ยง/i.test(title)) key='history';
      }
      if(key){card.dataset.v524InternPanel=key;map.push([card,key]);}
    });
    map.forEach(([card,key])=>card.classList.toggle('v524-panel-hidden',key!==view));
    [...root.querySelectorAll('.grid.grid-2')].forEach(grid=>{
      const relevant=[...grid.children].filter(el=>el.matches?.('[data-v524-intern-panel]'));
      if(!relevant.length) return;
      const hasActive=relevant.some(el=>!el.classList.contains('v524-panel-hidden'));
      grid.classList.add('v524-intern-grid');
      grid.classList.toggle('v524-grid-hidden',!hasActive);
    });
    const subtitle=document.getElementById('pageSubtitle');
    const labels={add:'เพิ่มรายชื่อผู้ฝึก',mentor:'กำหนดช่วงพี่เลี้ยง',registry:'ทะเบียนน้องใหม่ / Intern',history:'ประวัติช่วงพี่เลี้ยง'};
    if(subtitle) subtitle.textContent=labels[view]||'จัดการน้องใหม่ / Intern';
  }

  function applyPanels(){
    applyLeaveSubview();
    applyProfileSubview();
    applyActivitySubview();
    applyInternSubview();
    applyUsersSubview();
    applyPhysicianSubview();
  }

  function apply(){
    decorateVersion();
    const activeDef=defs().find(d=>!!d.active?.());
    if(!window.__CNMI_V542_NAV_OWNER__ && activeDef && !getOpenTree()) announceOpenTree(`v524:${activeDef.id}`);
    defs().forEach(installTree);
    defs().forEach(def=>{
      const tree=document.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(def.id)}"]`);
      if(tree) refreshTree(def,tree);
    });
    applyPanels();
  }

  function setSubview(child){
    if(child.viewKey==='leave'){
      S().v524LeaveView=child.view;ssSet('cnmi-v524-leave-view',child.view);
    }else if(child.viewKey==='activity'){
      S().v524ActivityView=child.view;ssSet('cnmi-v524-activity-view',child.view);
    }else if(child.viewKey==='intern'){
      S().v524InternView=child.view;ssSet('cnmi-v524-intern-view',child.view);
    }else if(child.viewKey==='profile'){
      S().v524ProfileView=child.view;ssSet('cnmi-v524-profile-view',child.view);
    }else if(child.viewKey==='users'){
      S().v524UsersView=child.view;ssSet('cnmi-v524-users-view',child.view);
    }else if(child.viewKey==='physician'){
      S().v524PhysicianView=child.view;ssSet('cnmi-v524-physician-view',child.view);
    }
  }
  function navigateChild(def,child){
    setSubview(child);
    ssSet(openKey(def.id),'1');
    announceOpenTree(`v524:${def.id}`);
    closeMobileSidebar();
    const same=page()===child.page;
    if(same){
      try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){window.renderPage?.();}
      return;
    }
    try{
      if(window.cnmiV515?.navigate){window.cnmiV515.navigate(child.page);return;}
    }catch(_){ }
    S().page=child.page;
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){window.renderPage?.();}
  }

  document.addEventListener('click',function(e){
    const toggle=e.target?.closest?.('[data-v524-tree-toggle]');
    if(toggle){
      e.preventDefault();e.stopPropagation();
      const id=String(toggle.dataset.v524TreeToggle||'');
      const tree=toggle.closest('.v524-nav-tree');
      const sub=tree?.querySelector('.v524-nav-submenu');
      const open=toggle.getAttribute('aria-expanded')!=='true';
      toggle.setAttribute('aria-expanded',open?'true':'false');
      sub?.classList.toggle('open',open);
      sub?.setAttribute('aria-hidden',open?'false':'true');
      ssSet(openKey(id),open?'1':'0');
      if(open) announceOpenTree(`v524:${id}`);
      else if(getOpenTree()===`v524:${id}`) setOpenTree('');
      return;
    }
    const item=e.target?.closest?.('[data-v524-child-key]');
    if(item){
      e.preventDefault();e.stopPropagation();
      const def=defs().find(d=>d.id===item.dataset.v524TreeItem);
      const child=def?.children.find(c=>c.key===item.dataset.v524ChildKey);
      if(def&&child) navigateChild(def,child);
    }
  },true);


  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    const openId=String(e?.detail?.id||'');
    defs().forEach(def=>{
      const own=`v524:${def.id}`;
      if(openId===own) return;
      const tree=document.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(def.id)}"]`);
      const parent=tree?.querySelector('.v524-nav-parent');
      const sub=tree?.querySelector('.v524-nav-submenu');
      parent?.setAttribute('aria-expanded','false');
      sub?.classList.remove('open');
      sub?.setAttribute('aria-hidden','true');
      ssSet(openKey(def.id),'0');
    });
  });

  const oldRenderNav=window.renderNav || (typeof renderNav==='function'?renderNav:null);
  if(oldRenderNav && !oldRenderNav.__v524Wrapped){
    const wrapped=function renderNavV524(){
      const out=oldRenderNav.apply(this,arguments);
      requestAnimationFrame(apply);
      return out;
    };
    wrapped.__v524Wrapped=true;
    try{window.renderNav=renderNav=wrapped;}catch(_){window.renderNav=wrapped;}
  }

  const oldRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(oldRenderPage && !oldRenderPage.__v524Wrapped){
    const wrapped=function renderPageV524(){
      const out=oldRenderPage.apply(this,arguments);
      requestAnimationFrame(apply);
      return out;
    };
    wrapped.__v524Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  let queued=false;
  function queue(){
    if(queued) return;queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  const start=()=>{
    apply();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(muts=>{for(const m of muts){if(m.addedNodes?.length){queue();break;}}}).observe(nav,{childList:true,subtree:true});
    const content=document.getElementById('pageContent');
    if(content)new MutationObserver(muts=>{for(const m of muts){if(m.addedNodes?.length){queue();break;}}}).observe(content,{childList:true,subtree:true});
    window.addEventListener('hashchange',queue);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV524={version:VERSION,apply};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v524-unified-sidebar-tree-navigation.js", error); }
;

/* Original source: patch-v525-ot-payday-tracker.js */
try {
/* CNMI Staff Planner V525 — OT Payday Tracker
 * Admin sets the actual salary/payday for each source OT month.
 * All authenticated staff can read it in monthly OT summary.
 * Requires SQL_V525_OT_PAYDAY_SETTINGS.sql once.
 */
(function(){
  'use strict';
  if(window.__CNMI_V525_OT_PAYDAY__) return;
  window.__CNMI_V525_OT_PAYDAY__=true;
  const VERSION='V525_OT_PAYDAY_TRACKER';
  let loadToken=0;
  const cache=new Map();

  function S(){try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.supabaseClient||window.sbClient||window.sb||null;}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function monthKey(){
    const raw=S()?.otMenuMonthV369||S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.myDutyMonthFilter||S()?.monthKey||new Date().toISOString().slice(0,7);
    return /^\d{4}-\d{2}$/.test(String(raw).slice(0,7))?String(raw).slice(0,7):new Date().toISOString().slice(0,7);
  }
  function activeSummary(){
    if(String(S()?.page||'')!=='ot') return false;
    const a=String(S()?.otMenuV369||'');
    return a==='summary'||a==='staff-summary';
  }
  function thaiDate(dateStr,full=false){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr||''))) return '-';
    try{
      const d=new Date(`${dateStr}T12:00:00+07:00`);
      return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:full?'long':'short',year:'numeric'}).format(d);
    }catch(_){return dateStr;}
  }
  function thaiMonthFromDate(dateStr){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr||''))) return '-';
    try{
      const d=new Date(`${dateStr}T12:00:00+07:00`);
      return new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric'}).format(d);
    }catch(_){return dateStr.slice(0,7);}
  }
  function thaiSourceMonth(key){
    if(!/^\d{4}-\d{2}$/.test(String(key||''))) return key||'-';
    try{
      const d=new Date(`${key}-01T12:00:00+07:00`);
      return new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric'}).format(d);
    }catch(_){return key;}
  }
  function calendarSvg(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"></path></svg>';}

  function panelHtml(){
    const key=monthKey();
    return `<div class="v525-payday-panel" id="v525PaydayPanel" data-v525-month="${esc(key)}">
      <div class="v525-payday-loading"><span class="v525-payday-icon">${calendarSvg()}</span><div><b>วันเงินเดือนเข้า</b><small>กำลังโหลดข้อมูลของ OT เดือน ${esc(thaiSourceMonth(key))}…</small></div></div>
    </div>`;
  }

  function injectPanel(html){
    if(!activeSummary() || String(html||'').includes('id="v525PaydayPanel"')) return html;
    const tpl=document.createElement('template');
    tpl.innerHTML=String(html||'');
    const content=tpl.content;
    const target=content.querySelector('.v241-real-month-section') || content.querySelector('.v369-ot-content .card') || content.querySelector('.v369-ot-content');
    if(!target) return html;
    const wrap=document.createElement('template');
    wrap.innerHTML=panelHtml();
    const node=wrap.content.firstElementChild;
    if(target.classList?.contains('v241-real-month-section')) target.prepend(node);
    else if(target.classList?.contains('card')){
      const sectionTitle=target.querySelector('.section-title');
      if(sectionTitle?.nextSibling) target.insertBefore(node,sectionTitle.nextSibling); else target.prepend(node);
    } else target.prepend(node);
    const holder=document.createElement('div'); holder.appendChild(content.cloneNode(true)); return holder.innerHTML;
  }

  const previousRenderOtPage=window.renderOtPage || (typeof renderOtPage==='function'?renderOtPage:null);
  if(previousRenderOtPage && !previousRenderOtPage.__v525Wrapped){
    const wrapped=function renderOtPageV525(){return injectPanel(String(previousRenderOtPage.apply(this,arguments)||''));};
    wrapped.__v525Wrapped=true;
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  function renderLoaded(panel,row){
    const key=String(panel.dataset.v525Month||monthKey());
    const pay=row?.pay_date||'';
    const admin=isAdminSafe();
    if(pay){
      panel.innerHTML=`<div class="v525-payday-main"><span class="v525-payday-icon">${calendarSvg()}</span><div class="v525-payday-copy"><span class="v525-eyebrow">OT เดือน ${esc(thaiSourceMonth(key))}</span><strong>เงินเข้า ${esc(thaiDate(pay))}</strong><span>เช็กสลิปเดือน <b>${esc(thaiMonthFromDate(pay))}</b></span></div></div>
        ${admin?`<div class="v525-payday-admin"><label><span>แก้วันเงินเข้า</span><input type="date" id="v525PayDateInput" value="${esc(pay)}"></label><button type="button" class="ghost-btn v525-save-payday" data-v525-save-payday>บันทึก</button></div>`:''}`;
    }else{
      panel.innerHTML=`<div class="v525-payday-main"><span class="v525-payday-icon">${calendarSvg()}</span><div class="v525-payday-copy"><span class="v525-eyebrow">OT เดือน ${esc(thaiSourceMonth(key))}</span><strong>ยังไม่ได้กำหนดวันเงินเดือนเข้า</strong><span>${admin?'เลือกวันที่แล้วกดบันทึก':'รอ Admin กำหนดวันเงินเดือนเข้า'}</span></div></div>
        ${admin?`<div class="v525-payday-admin"><label><span>วันเงินเข้า</span><input type="date" id="v525PayDateInput" value=""></label><button type="button" class="primary-btn v525-save-payday" data-v525-save-payday>บันทึก</button></div>`:''}`;
    }
    panel.dataset.v525Hydrated='1';
  }

  function renderError(panel,error){
    const missing=String(error?.code||'')==='42P01'||/ot_payday_settings|does not exist|schema cache/i.test(String(error?.message||''));
    panel.innerHTML=`<div class="v525-payday-main is-warning"><span class="v525-payday-icon">${calendarSvg()}</span><div class="v525-payday-copy"><strong>${missing?'ยังไม่ได้ติดตั้งข้อมูลวันเงินเดือน V525':'โหลดวันเงินเดือนไม่สำเร็จ'}</strong><span>${missing?(isAdminSafe()?'รัน SQL_V525_OT_PAYDAY_SETTINGS.sql ใน Supabase 1 ครั้ง':'กรุณาแจ้ง Admin ให้ติดตั้ง V525'):'ลองรีเฟรชอีกครั้ง'}</span></div></div>`;
    panel.dataset.v525Hydrated='error';
  }

  async function fetchMonth(key,force=false){
    if(!force&&cache.has(key)) return cache.get(key);
    const db=DB(); if(!db?.from) throw new Error('Supabase client unavailable');
    const {data,error}=await db.from('ot_payday_settings').select('source_month,pay_date,updated_at,updated_by').eq('source_month',key).maybeSingle();
    if(error) throw error;
    const row=data||null; cache.set(key,row); return row;
  }

  async function hydrate(force=false){
    const panel=document.getElementById('v525PaydayPanel');
    if(!panel||!activeSummary()) return;
    const key=String(panel.dataset.v525Month||monthKey());
    const token=++loadToken;
    if(!force&&panel.dataset.v525Hydrated==='1') return;
    try{
      const row=await fetchMonth(key,force);
      if(token!==loadToken||!document.body.contains(panel)) return;
      renderLoaded(panel,row);
    }catch(err){if(token===loadToken&&document.body.contains(panel)) renderError(panel,err);}
  }

  async function savePayday(button){
    if(!isAdminSafe()) return;
    const panel=button.closest('#v525PaydayPanel'); if(!panel) return;
    const key=String(panel.dataset.v525Month||monthKey());
    const input=panel.querySelector('#v525PayDateInput');
    const pay=String(input?.value||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(pay)){
      try{showToast('กรุณาเลือกวันเงินเดือนเข้า');}catch(_){alert('กรุณาเลือกวันเงินเดือนเข้า');}
      input?.focus(); return;
    }
    const db=DB(); if(!db?.from) return renderError(panel,new Error('Supabase client unavailable'));
    button.disabled=true; button.textContent='กำลังบันทึก…';
    const payload={source_month:key,pay_date:pay,updated_at:new Date().toISOString()};
    const pid=S()?.profile?.id; if(pid) payload.updated_by=pid;
    const {error}=await db.from('ot_payday_settings').upsert(payload,{onConflict:'source_month'});
    if(error){button.disabled=false; renderError(panel,error); return;}
    cache.set(key,{...payload});
    renderLoaded(panel,payload);
    try{showToast(`บันทึกวันเงินเข้า ${thaiDate(pay)} แล้ว`);}catch(_){}
  }

  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('[data-v525-save-payday]');
    if(btn){e.preventDefault();e.stopPropagation();savePayday(btn);}
  },true);

  document.addEventListener('change',e=>{
    if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='otSourceMonthV241'){
      setTimeout(()=>hydrate(true),100);
    }
  },true);

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v525';chip.title='OT payday tracker';chip.classList.add('v525-version-chip');}
  }
  let queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateVersion();hydrate(false);});}
  function start(){
    decorateVersion(); hydrate(false);
    const content=document.getElementById('pageContent');
    if(content)new MutationObserver(muts=>{for(const m of muts){if(m.addedNodes?.length){queue();break;}}}).observe(content,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV525={version:VERSION,hydrate,fetchMonth};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v525-ot-payday-tracker.js", error); }
;
