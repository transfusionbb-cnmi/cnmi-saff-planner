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
    if(!leave||!h?.id)return typeof showToast==='function'&&showToast('ไม่พบข้อมูล HR ของรายการนี้');
    if(!h.hr_reported_date)return typeof showToast==='function'&&showToast('น้องยังไม่ได้กด “ลาในระบบแล้ว”');
    const ok=await confirmSafe(`ยืนยันว่าตรวจพบรายการ ${typeOf(leave)} ของ ${staffNickSafe(leave.staff_id)} (${rangeOf(leave)}) ใน HC iService แล้ว?`,'ตรวจสอบ HR แล้ว');
    if(!ok)return;
    const db=DB();if(!db)return;
    const old=button?.textContent;try{if(button){button.disabled=true;button.textContent='กำลังบันทึก…';}}catch(_){ }
    try{
      const q=await db.from('hr_checks').update({status:'ตรวจสอบแล้ว',checked_by:currentId(),checked_at:new Date().toISOString()}).eq('id',h.id);
      if(q?.error)throw q.error;
      await refreshAfterAdminAction('ตรวจสอบ HR แล้ว');
    }catch(err){console.warn(`[${VERSION}] verify`,err);if(typeof showToast==='function')showToast(text(err?.message||err||'บันทึกไม่สำเร็จ'));}
    finally{try{if(button){button.disabled=false;button.textContent=old||'✓ ตรวจสอบ HR แล้ว';}}catch(_){ }}
  }
  async function markNotFound(leaveId,button){
    if(!actualAdmin())return;
    const leave=(S().leaves||[]).find(r=>String(r?.id||'')===String(leaveId||''));
    const h=leave?hrFor(leave):null;
    if(!leave||!h?.id)return typeof showToast==='function'&&showToast('ไม่พบข้อมูล HR ของรายการนี้');
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
      }).eq('id',h.id);
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
      const item=btn.closest('.v481-reminder-item');if(!item||item.querySelector('[data-v484-retry-note]'))return;
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
