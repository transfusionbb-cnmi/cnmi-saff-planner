/* CNMI Staff Planner v555
   Trade request clarity + duplicate guard + personalized filters
   - Staff default: own name + pending receiver confirmation
   - Admin mode default: all people + waiting Admin
   - Show pending/admin status directly beside roster duty and block repeat selling
   - Fresh server-side open-request check before insert
   - Requester can cancel an open request
*/
(function(){
  'use strict';
  const VERSION='v555';
  const STATUS={
    pending:'pending',
    confirmed:'confirmed',
    completed:'completed',
    rejected:'rejected',
    cancelled:'cancelled'
  };
  const OPEN_STATUS=new Set([STATUS.pending,STATUS.confirmed]);

  function S(){ try{return state;}catch(_){return null;} }
  function esc(v){
    try{return escapeHtml(v==null?'':String(v));}
    catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function me(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.id||'');}}
  function adminMode(){try{return !!isAdmin();}catch(_){return false;}}
  function staffName(id){
    const st=(S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''));
    return st?.nickname||st?.full_name||st?.email||String(id||'');
  }
  function toast(msg){
    try{ if(typeof showToast==='function')showToast(msg); else window.alert(msg); }
    catch(_){ console.info(msg); }
  }
  function statusText(status){
    const s=String(status||'').toLowerCase();
    if(s===STATUS.pending)return '⏳ รอผู้รับเวรยืนยัน';
    if(s===STATUS.confirmed)return '🕒 รอ Admin';
    if(s===STATUS.completed)return '✓ ขายเวรสำเร็จ';
    if(s===STATUS.rejected)return '✕ ถูกปฏิเสธ';
    if(s==='cancelled'||s==='canceled')return 'ยกเลิกคำขอ';
    return status||'-';
  }
  function statusTone(status){
    const s=String(status||'').toLowerCase();
    if(s===STATUS.confirmed)return 'blue';
    if(s===STATUS.completed)return 'green';
    if(s===STATUS.rejected||s==='cancelled'||s==='canceled')return 'red';
    return 'orange';
  }
  function getModeKey(){return `${me()}|${adminMode()?'admin':'staff'}`;}
  function ensureDefaults(){
    const st=S(); if(!st)return;
    const key=getModeKey();
    if(st.v554TradeDefaultsKey!==key){
      st.v554TradeDefaultsKey=key;
      st.tradeFilterStatus=adminMode()?STATUS.confirmed:STATUS.pending;
      st.tradeFilterStaff=adminMode()?'':me();
    }
    if(!['',STATUS.pending,STATUS.confirmed,STATUS.completed,STATUS.rejected,'cancelled'].includes(String(st.tradeFilterStatus||''))){
      st.tradeFilterStatus=adminMode()?STATUS.confirmed:STATUS.pending;
    }
  }
  function assignmentFor(row,assignments=[]){
    try{return tradeAssignmentForDisplay(row,assignments);}catch(_){
      const id=String(row?.from_assignment_id||'');
      return (assignments||[]).find(a=>String(a?.id||'')===id)||(S()?.rosterAssignments||[]).find(a=>String(a?.id||'')===id)||null;
    }
  }
  function rowsForMonth(assignments=[]){
    const st=S(); if(!st)return [];
    return (st.tradeRequests||[]).filter(r=>{
      const a=assignmentFor(r,assignments);
      let d='';
      try{d=normalizeDateKey(a?.duty_date||'');}catch(_){d=String(a?.duty_date||'').slice(0,10);}
      return d.startsWith(String(st.monthKey||''));
    });
  }
  function filterRows(rows){
    const st=S(); if(!st)return rows||[];
    const person=String(st.tradeFilterStaff||'');
    const status=String(st.tradeFilterStatus||'');
    const current=me();
    return (rows||[])
      .filter(r=>!person||String(r?.requester_id||'')===person||String(r?.receiver_id||'')===person)
      .filter(r=>!status||String(r?.status||'').toLowerCase()===status)
      .slice()
      .sort((a,b)=>{
        const ai=(String(a?.requester_id||'')===current||String(a?.receiver_id||'')===current)?0:1;
        const bi=(String(b?.requester_id||'')===current||String(b?.receiver_id||'')===current)?0:1;
        if(ai!==bi)return ai-bi;
        const order={pending:0,confirmed:1,completed:2,rejected:3,cancelled:4,canceled:4};
        const as=order[String(a?.status||'').toLowerCase()]??9;
        const bs=order[String(b?.status||'').toLowerCase()]??9;
        if(as!==bs)return as-bs;
        return String(b?.created_at||'').localeCompare(String(a?.created_at||''));
      });
  }
  function staffOptions(){
    const st=S(); if(!st)return '';
    const id=me();
    let list=[];
    try{list=orderedStaff(st.staff||[]);}catch(_){list=(st.staff||[]).slice();}
    const own=list.find(x=>String(x?.id||'')===id);
    const others=list.filter(x=>String(x?.id||'')!==id);
    if(adminMode()){
      return `<option value="">ทุกคน</option>${list.map(x=>`<option value="${esc(x.id)}" ${String(st.tradeFilterStaff||'')===String(x.id)?'selected':''}>${esc(x.nickname||x.full_name||x.email||x.id)}</option>`).join('')}`;
    }
    const ownOpt=own?`<option value="${esc(own.id)}" ${String(st.tradeFilterStaff||'')===String(own.id)?'selected':''}>${esc(own.nickname||own.full_name||own.email||own.id)}</option>`:'';
    const allOpt=`<option value="" ${!st.tradeFilterStaff?'selected':''}>ทุกคน</option>`;
    return `${ownOpt}${allOpt}${others.map(x=>`<option value="${esc(x.id)}" ${String(st.tradeFilterStaff||'')===String(x.id)?'selected':''}>${esc(x.nickname||x.full_name||x.email||x.id)}</option>`).join('')}`;
  }
  function statusOptions(){
    const st=S(); const selected=String(st?.tradeFilterStatus||'');
    const opts=[
      [STATUS.pending,'⏳ รอผู้รับเวรยืนยัน'],
      [STATUS.confirmed,'🕒 รอ Admin'],
      [STATUS.completed,'✓ ขายเวรสำเร็จ'],
      [STATUS.rejected,'✕ ถูกปฏิเสธ'],
      ['cancelled','ยกเลิกคำขอ'],
      ['','ทุกสถานะ']
    ];
    return opts.map(([v,label])=>`<option value="${v}" ${selected===v?'selected':''}>${label}</option>`).join('');
  }
  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{if(chip.textContent!=='v555') chip.textContent='v555';});
  }
  function openRequestForAssignment(assignmentId){
    const id=String(assignmentId||'');
    return (S()?.tradeRequests||[])
      .filter(r=>String(r?.from_assignment_id||'')===id&&OPEN_STATUS.has(String(r?.status||'').toLowerCase()))
      .sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||'')))[0]||null;
  }
  function openStatusButton(row){
    const status=String(row?.status||'').toLowerCase();
    const label=status===STATUS.confirmed?'🕒 รอ Admin':'⏳ กำลังขาย';
    return `<button type="button" class="tiny-btn v554-trade-lock ${status===STATUS.confirmed?'is-admin-wait':'is-receiver-wait'}" data-v554-open-trades="${esc(status)}" title="${esc(statusText(status))}">${label}</button>`;
  }

  // Status wording used everywhere on trade rows/cards.
  window.tradeStatusLabel=function tradeStatusLabelV554(status,row=null){return statusText(status);};
  try{tradeStatusLabel=window.tradeStatusLabel;}catch(_){ }

  // Replace trade button with a visible locked status while an open request exists.
  const previousTradeButton=window.renderTradeButton||(typeof renderTradeButton==='function'?renderTradeButton:null);
  window.renderTradeButton=function renderTradeButtonV554(slot){
    if(!slot?.id||!slot?.staff_id)return '';
    const active=openRequestForAssignment(slot.id);
    if(active)return openStatusButton(active);
    if(previousTradeButton)return previousTradeButton(slot);
    try{if(!(String(slot.staff_id)===me()||adminMode()))return '';}catch(_){return '';}
    return `<button class="tiny-btn trade-btn" data-trade-duty="${esc(slot.id)}">ขายเวร</button>`;
  };
  try{renderTradeButton=window.renderTradeButton;}catch(_){ }

  // Grid view uses the duty pill itself as the sell action, so decorate/lock it too.
  const previousGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof previousGrid==='function'){
    window.renderGridView=function renderGridViewV554(){
      const html=previousGrid.apply(this,arguments);
      try{
        const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
        tpl.content.querySelectorAll('[data-trade-duty]').forEach(btn=>{
          const id=String(btn.getAttribute('data-trade-duty')||'');
          const active=openRequestForAssignment(id); if(!active)return;
          btn.removeAttribute('data-trade-duty');
          btn.setAttribute('data-staff-stat',String((S()?.rosterAssignments||[]).find(a=>String(a?.id||'')===id)?.staff_id||''));
          btn.classList.add('v554-duty-has-open-trade');
          const wrap=btn.parentElement;
          if(wrap&&!wrap.querySelector('.v554-grid-trade-status')){
            const badge=document.createElement('button');
            badge.type='button';badge.className='v554-grid-trade-status';
            badge.setAttribute('data-v554-open-trades',String(active.status||'pending'));
            badge.textContent=String(active.status)==='confirmed'?'🕒 รอ Admin':'⏳ กำลังขาย';
            wrap.appendChild(badge);
          }
        });
        const box=document.createElement('div');box.appendChild(tpl.content.cloneNode(true));return box.innerHTML;
      }catch(err){console.warn(`${VERSION} grid decoration skipped`,err);return html;}
    };
    try{renderGridView=window.renderGridView;}catch(_){ }
  }

  // Action buttons: receiver confirms/rejects, requester can cancel before completion.
  window.renderTradeActionButtons=function renderTradeActionButtonsV554(r){
    const actions=[]; const status=String(r?.status||'').toLowerCase(); const current=me();
    if(status===STATUS.pending&&String(r?.receiver_id||'')===current){
      actions.push(`<button class="tiny-btn" data-trade-status="${esc(r.id)}|confirmed">ยืนยัน</button>`);
      actions.push(`<button class="tiny-btn danger" data-trade-status="${esc(r.id)}|rejected">ปฏิเสธ</button>`);
    }
    if(OPEN_STATUS.has(status)&&String(r?.requester_id||'')===current){
      actions.push(`<button class="tiny-btn danger v554-cancel-trade" data-v554-trade-cancel="${esc(r.id)}">ยกเลิกคำขอ</button>`);
    }
    if(adminMode()){
      if(OPEN_STATUS.has(status)){
        const label=status===STATUS.pending?'Admin Override':'Admin บันทึกขายเวร';
        actions.push(`<button class="tiny-btn" data-trade-apply="${esc(r.id)}">${label}</button>`);
      }
      if(status!==STATUS.completed)actions.push(`<button class="tiny-btn" data-trade-edit="${esc(r.id)}">แก้ไข</button>`);
      actions.push(`<button class="tiny-btn danger" data-trade-delete="${esc(r.id)}">ลบ</button>`);
    }
    return actions.length?actions.join(' '):'<span class="muted">ไม่มีรายการที่ต้องกดตอนนี้</span>';
  };
  try{renderTradeActionButtons=window.renderTradeActionButtons;}catch(_){ }

  window.renderTradeCards=function renderTradeCardsV554(rows,assignments){
    return `<div class="mobile-cards trade-mobile-cards">${(rows||[]).map(r=>{
      const from=assignmentFor(r,assignments)||{};
      return `<div class="mobile-card"><div class="section-title"><h3>ขายเวร</h3>${badge(statusText(r.status),statusTone(r.status))}</div><div><b>ผู้ขายเวร:</b> ${staffPill(r.requester_id)}<br><b>ผู้รับเวร:</b> ${staffPill(r.receiver_id)}</div><div><b>วันที่ / เวร:</b> ${tradeDutyDisplay(r,assignments)}</div><div><b>เงินโดยประมาณ:</b> ${tradePaymentDisplay(r,from,null)}</div><div class="actions">${renderTradeActionButtons(r)}</div></div>`;
    }).join('')}</div>`;
  };
  try{renderTradeCards=window.renderTradeCards;}catch(_){ }

  window.renderTradeRow=function renderTradeRowV554(r,assignments){
    const from=assignmentFor(r,assignments)||{};
    return `<tr><td>${staffPill(r.requester_id)}</td><td>${staffPill(r.receiver_id)}</td><td>ขายเวร • ${esc(niceRoleRateLabel(r.rate_mode))}<br><span class="muted">${tradeDutyDisplay(r,assignments)}</span></td><td>${tradePaymentDisplay(r,from,null)}</td><td>${badge(statusText(r.status),statusTone(r.status))}</td><td>${renderTradeActionButtons(r)}</td></tr>`;
  };
  try{renderTradeRow=window.renderTradeRow;}catch(_){ }

  // Trade list with status + person filters.
  window.renderDutyTradePanel=function renderDutyTradePanelV554(assignments){
    ensureDefaults();
    const visible=filterRows(rowsForMonth(assignments||[]));
    if(!visible.length){
      return `<div class="trade-panel"><h3>คำขอขายเวร</h3>${typeof empty==='function'?empty('ไม่พบคำขอตามตัวกรองนี้'):'<div class="muted">ไม่พบคำขอตามตัวกรองนี้</div>'}</div>`;
    }
    return `<div class="trade-panel"><h3>คำขอขายเวร</h3><div class="table-wrap desktop-table"><table><thead><tr><th>ผู้ขายเวร</th><th>ผู้รับเวร</th><th>รายการ</th><th>เงินโดยประมาณ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${visible.map(r=>renderTradeRow(r,assignments)).join('')}</tbody></table></div>${renderTradeCards(visible,assignments)}</div>`;
  };
  try{renderDutyTradePanel=window.renderDutyTradePanel;}catch(_){ }

  window.renderTradeRequestsPage=function renderTradeRequestsPageV554(){
    ensureDefaults();
    const st=S();
    let assignments=[];try{assignments=getAssignmentsForMonth(st.monthKey);}catch(_){assignments=st.rosterAssignments||[];}
    const monthRows=rowsForMonth(assignments);
    const pending=monthRows.filter(r=>String(r?.status||'').toLowerCase()===STATUS.pending).length;
    const confirmed=monthRows.filter(r=>String(r?.status||'').toLowerCase()===STATUS.confirmed).length;
    const hint=adminMode()?'ตั้งต้นแสดงรายการที่รอ Admin ของทุกคน':'ตั้งต้นแสดงรายการของคุณที่รอผู้รับเวรยืนยัน • เลือก “ทุกคน” ได้เมื่อต้องการดูรายการอื่น';
    return `<div class="card v554-trade-page">
      <div class="toolbar compact-filter v554-trade-filters">
        <label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(st.monthKey)}"></label>
        <label>คน <select id="tradeFilterStaff">${staffOptions()}</select></label>
        <label>สถานะ <select id="tradeFilterStatus">${statusOptions()}</select></label>
        ${typeof badge==='function'?badge(`⏳ รอผู้รับเวรยืนยัน ${pending}`,pending?'orange':'black'):`<span>${pending}</span>`}
        ${typeof badge==='function'?badge(`🕒 รอ Admin ${confirmed}`,confirmed?'blue':'black'):`<span>${confirmed}</span>`}
      </div>
      <div class="notice soft-notice v554-trade-hint">${esc(hint)}</div>
      ${renderDutyTradePanel(assignments)}
    </div>`;
  };
  try{renderTradeRequestsPage=window.renderTradeRequestsPage;}catch(_){ }

  function mergeTradeRows(rows){
    const st=S(); if(!st)return;
    const map=new Map((st.tradeRequests||[]).map(r=>[String(r?.id||''),r]));
    (rows||[]).forEach(r=>{if(r?.id)map.set(String(r.id),r);});
    st.tradeRequests=Array.from(map.values());
  }
  async function fetchAssignmentTrades(fromId){
    try{
      if(typeof sb==='undefined'||!sb||!fromId)return [];
      const res=await sb.from('roster_trade_requests').select('*').eq('from_assignment_id',fromId).order('created_at',{ascending:false}).limit(25);
      if(res?.error)throw res.error;
      mergeTradeRows(res?.data||[]);return res?.data||[];
    }catch(err){console.warn(`${VERSION} trade refresh failed`,err);return [];}
  }
  async function freshOpenRequests(fromId,excludeId=''){
    try{
      if(typeof sb==='undefined'||!sb||!fromId)return [];
      let q=sb.from('roster_trade_requests').select('*').eq('from_assignment_id',fromId).in('status',[STATUS.pending,STATUS.confirmed]).order('created_at',{ascending:false}).limit(25);
      const res=await q;
      if(res?.error)throw res.error;
      const rows=(res?.data||[]).filter(r=>String(r?.id||'')!==String(excludeId||''));
      mergeTradeRows(res?.data||[]);return rows;
    }catch(err){console.warn(`${VERSION} duplicate precheck failed`,err);return [];}
  }
  function showExistingRequest(row){
    const msg=statusText(row?.status||STATUS.pending);
    try{
      if(typeof showModal==='function'){
        showModal(`<h2>เวรนี้มีคำขอขายอยู่แล้ว</h2><p class="v554-existing-msg">${esc(msg)}</p><p class="hint">ระบบไม่สร้างคำขอซ้ำให้ เวรเดียวกันจะมีคำขอที่ยังไม่จบได้ครั้งละ 1 รายการ</p><div class="actions"><button type="button" class="primary-btn" data-v554-open-trades="${esc(row?.status||STATUS.pending)}">ดูคำขอ</button><button type="button" class="ghost-btn" data-app-alert-ok>ปิด</button></div>`);
        return;
      }
    }catch(_){ }
    toast(`เวรนี้มีคำขอขายอยู่แล้ว — ${msg}`);
  }

  // Fresh duplicate check before insert + immediate status refresh after save.
  const previousSave=window.saveTradeRequest||(typeof saveTradeRequest==='function'?saveTradeRequest:null);
  if(typeof previousSave==='function'){
    window.saveTradeRequest=async function saveTradeRequestV554(form){
      if(!form||form.dataset.v554Saving==='1')return;
      const fd=new FormData(form);
      const requestId=String(fd.get('trade_request_id')||'');
      const fromId=String(fd.get('from_assignment_id')||'');
      if(!requestId&&fromId){
        const open=await freshOpenRequests(fromId,'');
        if(open.length){
          showExistingRequest(open[0]);
          try{renderPage();}catch(_){ }
          return;
        }
      }
      form.dataset.v554Saving='1';
      const submit=form.querySelector('button[type="submit"]');
      const oldText=submit?.textContent||'';
      if(submit){submit.disabled=true;submit.textContent='กำลังส่งคำขอ...';}
      try{
        await previousSave(form);
        if(fromId)await fetchAssignmentTrades(fromId);
        try{renderPage();}catch(_){ }
      }finally{
        form.dataset.v554Saving='0';
        if(submit&&document.body.contains(submit)){submit.disabled=false;submit.textContent=oldText;}
      }
    };
    try{saveTradeRequest=window.saveTradeRequest;}catch(_){ }
  }

  // Make receiver action update immediately even if page cache is still warm.
  window.updateTradeStatus=async function updateTradeStatusV554(id,status){
    try{
      const patch={status,updated_by:me(),confirmed_at:status===STATUS.confirmed?new Date().toISOString():null};
      const res=await sb.from('roster_trade_requests').update(patch).eq('id',id).select('*').single();
      if(res?.error){toast(typeof friendlyDbError==='function'?friendlyDbError(res.error):String(res.error.message||res.error));return;}
      mergeTradeRows(res?.data?[res.data]:[]);
      try{renderPage();}catch(_){ }
      toast(status===STATUS.confirmed?'ยืนยันแล้ว — รายการย้ายไป 🕒 รอ Admin':'ปฏิเสธคำขอแล้ว');
    }catch(err){toast(err?.message||'อัปเดตสถานะไม่สำเร็จ');}
  };
  try{updateTradeStatus=window.updateTradeStatus;}catch(_){ }

  // After Admin applies a request, refresh that row so status changes immediately.
  const previousApply=window.applyTradeRequest||(typeof applyTradeRequest==='function'?applyTradeRequest:null);
  if(typeof previousApply==='function'){
    window.applyTradeRequest=async function applyTradeRequestV554(id){
      const row=(S()?.tradeRequests||[]).find(r=>String(r?.id||'')===String(id||''));
      const fromId=String(row?.from_assignment_id||'');
      await previousApply(id);
      if(fromId)await fetchAssignmentTrades(fromId);
      try{renderPage();}catch(_){ }
    };
    try{applyTradeRequest=window.applyTradeRequest;}catch(_){ }
  }

  async function cancelTrade(id){
    const st=S(); const row=(st?.tradeRequests||[]).find(r=>String(r?.id||'')===String(id||''));
    if(!row)return toast('ไม่พบคำขอขายเวรนี้');
    if(String(row.requester_id||'')!==me()&&!adminMode())return toast('ยกเลิกได้เฉพาะคำขอของตัวเอง');
    if(!OPEN_STATUS.has(String(row.status||'').toLowerCase()))return toast('รายการนี้ไม่อยู่ในสถานะที่ยกเลิกได้แล้ว');
    let ok=true;
    try{if(typeof confirmDialog==='function')ok=await confirmDialog('ยกเลิกคำขอขายเวรนี้ใช่ไหม?','ยกเลิกคำขอ');else ok=window.confirm('ยกเลิกคำขอขายเวรนี้ใช่ไหม?');}catch(_){ok=window.confirm('ยกเลิกคำขอขายเวรนี้ใช่ไหม?');}
    if(!ok)return;
    try{
      const res=await sb.from('roster_trade_requests').update({status:STATUS.cancelled,updated_by:me()}).eq('id',id).select('*').single();
      if(res?.error){toast(typeof friendlyDbError==='function'?friendlyDbError(res.error):String(res.error.message||res.error));return;}
      mergeTradeRows(res?.data?[res.data]:[]);
      try{renderPage();}catch(_){ }
      toast('ยกเลิกคำขอขายเวรแล้ว');
    }catch(err){toast(err?.message||'ยกเลิกคำขอไม่สำเร็จ');}
  }
  function goTradePage(status=''){
    const st=S(); if(!st)return;
    st.page='tradeRequests';
    st.tradeFilterStatus=String(status||st.tradeFilterStatus||'');
    if(!adminMode()&&!st.tradeFilterStaff)st.tradeFilterStaff=me();
    try{if(typeof closeModal==='function')closeModal();}catch(_){ }
    try{
      if(window.cnmiV515?.navigate){window.cnmiV515.navigate('tradeRequests',{month:st.monthKey});return;}
    }catch(_){ }
    try{location.hash=`#/trade?month=${encodeURIComponent(st.monthKey||'')}`;}catch(_){ }
    try{renderPage();}catch(_){ }
  }

  document.addEventListener('change',function(e){
    if(e.target?.id==='tradeFilterStatus'){
      const st=S();if(!st)return;
      st.tradeFilterStatus=String(e.target.value||'');
      try{renderPage();}catch(_){ }
    }
  },true);
  document.addEventListener('click',function(e){
    const cancel=e.target?.closest?.('[data-v554-trade-cancel]');
    if(cancel){e.preventDefault();e.stopImmediatePropagation();cancelTrade(cancel.getAttribute('data-v554-trade-cancel'));return;}
    const open=e.target?.closest?.('[data-v554-open-trades]');
    if(open){e.preventDefault();e.stopImmediatePropagation();goTradePage(open.getAttribute('data-v554-open-trades')||'');return;}
  },true);

  // Version + small UI polish.
  const style=document.createElement('style');
  style.id='cnmi-v554-trade-status-guard-filter';
  style.textContent=`
    .v554-trade-filters{align-items:end;gap:10px;flex-wrap:wrap}
    .v554-trade-filters label{min-width:180px}
    .v554-trade-filters select{min-width:180px}
    .v554-trade-hint{margin-top:8px}
    .v554-trade-lock{cursor:pointer;font-weight:800;white-space:nowrap}
    .v554-trade-lock.is-receiver-wait{background:#fff7e6;border-color:#f3c66d;color:#91600c}
    .v554-trade-lock.is-admin-wait{background:#eef7ff;border-color:#a9d4f5;color:#2a6e9d}
    .v554-grid-trade-status{border:0;border-radius:999px;padding:2px 6px;font-size:10px;font-weight:850;line-height:1.25;cursor:pointer;background:#fff3d6;color:#8a5a00;white-space:nowrap}
    .v554-duty-has-open-trade{cursor:default}
    .v554-existing-msg{font-weight:850;margin:6px 0}
    @media(max-width:760px){
      .v554-trade-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .v554-trade-filters label{min-width:0}
      .v554-trade-filters label:first-child{grid-column:1/-1}
      .v554-trade-filters select,.v554-trade-filters input{min-width:0;width:100%}
      .v554-trade-hint{font-size:.78rem}
      .v554-grid-trade-status{font-size:9px;padding:2px 5px}
    }
  `;
  document.head.appendChild(style);
  setVersion(document);
  // v555 freeze hotfix: never rewrite the whole version chip on every DOM mutation.
  // The v554 observer could trigger itself repeatedly because setVersion() changed
  // textContent while observing childList on the entire document.
  const observer=new MutationObserver((mutations)=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes||[]){
        if(!node||node.nodeType!==1)continue;
        if(node.matches?.('.v520-version-chip')){
          if(node.textContent!=='v555')node.textContent='v555';
        }
        node.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
          if(chip.textContent!=='v555')chip.textContent='v555';
        });
      }
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  console.info(`${VERSION} trade status guard/filter + freeze hotfix loaded`);
})();
