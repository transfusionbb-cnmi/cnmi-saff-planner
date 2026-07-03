/* CNMI Staff Planner — V322
   Daily-position baseline comparison for Admin / Incharge.
   - Restores the visible monthly-plan name on mobile cards.
   - Shows a live "baseline -> today" comparison while dropdowns are changed.
   - Uses rows and staff already loaded on the daily page.
   - No Supabase query, insert, update, schema, Carry, OT, roster, or formula change.
*/
(function cnmiV322DailyBaselineCompare(){
  'use strict';
  const VERSION='V322_DAILY_BASELINE_COMPARE';
  if(window.__CNMI_V322_DAILY_BASELINE_COMPARE__) return;
  window.__CNMI_V322_DAILY_BASELINE_COMPARE__=true;

  let queued=false;
  let enhancing=false;

  function appState(){
    try{if(typeof state!=='undefined'&&state)return state;}catch(_){}
    return window.state||{};
  }
  function text(value){return String(value==null?'':value).trim();}
  function id(value){return String(value==null?'':value);}
  function esc(value){
    return text(value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
  function rows(){
    return window.__CNMI_V226_DAILY_POSITION_ROWS__
      || window.__CNMI_V225_DAILY_POSITION_ROWS__
      || [];
  }
  function staffList(){
    const list=appState()?.staff;
    return Array.isArray(list)?list:[];
  }
  function staffById(staffId){
    const key=id(staffId);
    return staffList().find(person=>id(person?.id)===key)||null;
  }
  function staffName(staffId){
    if(!staffId)return 'ว่าง';
    const person=staffById(staffId);
    return text(person?.nickname||person?.nick_name||person?.display_name||person?.full_name||person?.email)||'ไม่พบชื่อ';
  }
  function isTrainee(staffId){
    const person=staffById(staffId);
    if(!person)return false;
    if(person.is_trainee===true)return true;
    const status=text(person.position_training_status||person.training_status||person.staff_status);
    return /น้องใหม่|ผู้ฝึก|intern|trainee/i.test(status);
  }
  function activeLeave(staffId,date){
    if(!staffId||!date)return null;
    try{if(typeof activeLeaveRecordOn==='function')return activeLeaveRecordOn(staffId,date)||null;}catch(_){}
    try{if(typeof window.activeLeaveRecordOn==='function')return window.activeLeaveRecordOn(staffId,date)||null;}catch(_){}
    return null;
  }
  function leaveType(row){
    try{if(typeof leaveDisplayType==='function')return text(leaveDisplayType(row));}catch(_){}
    try{if(typeof window.leaveDisplayType==='function')return text(window.leaveDisplayType(row));}catch(_){}
    return text(row?.type||row?.leave_type||row?.reason_type||'ลาอื่นๆ').split(':::')[0].trim();
  }
  function leaveBadgeText(row){
    if(!row)return '';
    return leaveType(row)==='ไม่รับเวร'?'ไม่รับเวรวันนี้':'ลาวันนี้';
  }
  function currentDate(){
    return text(document.getElementById('positionDateInput')?.value||appState()?.positionDate).slice(0,10);
  }
  function codeOf(row){
    return text(row?.position_code||row?.code)||'ตำแหน่ง';
  }
  function plannedId(row){
    return id(row?._planned_staff_id||'');
  }
  function currentId(row,index,root){
    const mobile=root.querySelector(`select[data-position-row="${index}"][data-position-layout-item="mobile"]`);
    const any=mobile||root.querySelector(`select[data-position-row="${index}"]`);
    return any?id(any.value):id(row?.staff_id||'');
  }
  function badgeText(staffId,date){
    const notes=[];
    if(isTrainee(staffId))notes.push('น้องใหม่/ผู้ฝึก • ไม่นับ Slot');
    const leave=activeLeave(staffId,date);
    const leaveNote=leaveBadgeText(leave);
    if(leaveNote)notes.push(leaveNote);
    return notes.join(' • ');
  }
  function makeBaselineBox(row,date){
    const box=document.createElement('div');
    box.className='v322-baseline-box';
    const pid=plannedId(row);
    const note=badgeText(pid,date);
    box.innerHTML=`
      <span class="v322-baseline-label">ตั้งต้นจาก Admin</span>
      <strong class="v322-baseline-name">${esc(staffName(pid))}</strong>
      ${note?`<span class="v322-baseline-note">${esc(note)}</span>`:''}
    `;
    return box;
  }
  function findPlanNode(card){
    return Array.from(card.children||[]).find(node=>{
      if(!(node instanceof HTMLElement))return false;
      if(node.classList.contains('section-title')||node.classList.contains('v311-position-duty-preview')||node.classList.contains('v296-position-duty-preview'))return false;
      return /แผนตั้งต้น|ตั้งต้นจาก Admin/.test(text(node.textContent));
    })||null;
  }
  function ensureCardBaseline(card,row,date){
    let box=card.querySelector(':scope > .v322-baseline-box');
    const old=findPlanNode(card);
    if(!box){
      box=makeBaselineBox(row,date);
      if(old)old.replaceWith(box);
      else{
        const duty=card.querySelector(':scope > .v311-position-duty-preview,:scope > .v296-position-duty-preview');
        const label=card.querySelector(':scope > label');
        if(duty)card.insertBefore(box,duty);
        else if(label)card.insertBefore(box,label);
        else card.appendChild(box);
      }
    }else{
      const fresh=makeBaselineBox(row,date);
      if(box.innerHTML!==fresh.innerHTML)box.innerHTML=fresh.innerHTML;
      if(old&&old!==box)old.remove();
    }
  }
  function statusMessage(plan,current){
    const from=staffName(plan);
    const to=staffName(current);
    if(plan===current){
      return {tone:'same',html:`วันนี้: <b>ใช้ตามแผนตั้งต้น (${esc(to)})</b>`};
    }
    if(plan&&!current){
      return {tone:'changed',html:`ปรับวันนี้: <b>${esc(from)} → ว่าง</b>`};
    }
    if(!plan&&current){
      return {tone:'changed',html:`ปรับวันนี้: <b>ว่าง → ${esc(to)}</b>`};
    }
    return {tone:'changed',html:`ปรับวันนี้: <b>${esc(from)} → ${esc(to)}</b>`};
  }
  function ensureCardStatus(card,row,index,root){
    const plan=plannedId(row);
    const current=currentId(row,index,root);
    const message=statusMessage(plan,current);
    let node=card.querySelector(':scope > .v322-change-status');
    if(!node){
      node=document.createElement('div');
      node.className='v322-change-status';
      const label=card.querySelector(':scope > label');
      if(label)label.insertAdjacentElement('afterend',node);
      else card.appendChild(node);
    }
    node.classList.toggle('is-changed',message.tone==='changed');
    if(node.innerHTML!==message.html)node.innerHTML=message.html;
  }
  function enhanceDesktop(root,date){
    const data=rows();
    const tableRows=Array.from(root.querySelectorAll('.v225-daily-position-table tbody tr'));
    tableRows.forEach((tr,index)=>{
      const row=data[index]||{};
      const cell=tr.querySelector('.v225-plan-cell')||tr.children?.[3];
      if(!cell)return;
      cell.classList.add('v322-desktop-baseline');
      const pid=plannedId(row);
      const note=badgeText(pid,date);
      const html=`<span class="v322-desktop-label">ตั้งต้นจาก Admin</span><b>${esc(staffName(pid))}</b>${note?`<small>${esc(note)}</small>`:''}`;
      if(cell.innerHTML!==html)cell.innerHTML=html;
    });
    const head=Array.from(root.querySelectorAll('.v225-daily-position-table thead th'));
    if(head[3]&&head[3].textContent!=='ตั้งต้นจาก Admin')head[3].textContent='ตั้งต้นจาก Admin';
  }
  function ensureSummary(root){
    let panel=root.querySelector('.v322-daily-change-summary');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.className='v322-daily-change-summary';
    panel.innerHTML='<h3>เทียบแผนตั้งต้นกับการปรับวันนี้</h3><div class="v322-summary-body"></div>';
    const mobileList=root.querySelector('.v225-mobile-position-list');
    const desktopTable=root.querySelector('.v225-daily-position-table');
    const anchor=desktopTable||mobileList;
    if(anchor)anchor.insertAdjacentElement('beforebegin',panel);
    else root.appendChild(panel);
    return panel;
  }
  function updateSummary(root){
    const data=rows();
    const changes=[];
    data.forEach((row,index)=>{
      const plan=plannedId(row);
      const current=currentId(row,index,root);
      if(plan===current)return;
      changes.push({
        code:codeOf(row),
        from:staffName(plan),
        to:staffName(current)
      });
    });
    const panel=ensureSummary(root);
    const body=panel.querySelector('.v322-summary-body');
    if(!body)return;
    const html=changes.length
      ? `<div class="v322-summary-count">มีการปรับ ${changes.length} ตำแหน่ง</div><div class="v322-summary-list">${changes.map(item=>`<div><b>${esc(item.code)}</b><span>${esc(item.from)} → ${esc(item.to)}</span></div>`).join('')}</div>`
      : '<div class="v322-summary-empty">ยังไม่มีการปรับจากแผนตั้งต้นของ Admin</div>';
    if(body.innerHTML!==html)body.innerHTML=html;
  }
  function syncTwinSelect(source,root){
    const row=source?.dataset?.positionRow;
    if(row==null)return;
    root.querySelectorAll(`select[data-position-row="${CSS.escape(String(row))}"]`).forEach(select=>{
      if(select===source)return;
      if(Array.from(select.options||[]).some(option=>id(option.value)===id(source.value))){
        select.value=source.value;
      }
    });
  }
  function enhance(){
    if(enhancing)return;
    const root=document.getElementById('pageContent');
    if(!root||String(appState()?.page||'')!=='positions')return;
    const page=root.querySelector('.v225-positions-page,.v226-positions-page');
    if(!page)return;
    enhancing=true;
    try{
      const data=rows();
      const date=currentDate();
      const cards=Array.from(page.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
      cards.forEach((card,index)=>{
        const row=data[index]||{};
        ensureCardBaseline(card,row,date);
        ensureCardStatus(card,row,index,page);
      });
      enhanceDesktop(page,date);
      updateSummary(page);
      page.dataset.v322BaselineCompare='1';
    }finally{
      enhancing=false;
    }
  }
  function queueEnhance(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      enhance();
    });
  }
  function injectStyle(){
    if(document.getElementById('v322-daily-baseline-compare-style'))return;
    const style=document.createElement('style');
    style.id='v322-daily-baseline-compare-style';
    style.textContent=`
      .v322-baseline-box{
        display:flex!important;
        flex-direction:column!important;
        gap:4px!important;
        width:100%!important;
        min-width:0!important;
        padding:12px 14px!important;
        border:1px solid #bfdbfe!important;
        border-radius:16px!important;
        background:#eff6ff!important;
        color:#1e3a5f!important;
        box-sizing:border-box!important;
        position:relative!important;
        z-index:2!important;
      }
      .v322-baseline-label{font-size:13px;font-weight:700;color:#64748b}
      .v322-baseline-name{font-size:17px;color:#0f3d68;line-height:1.25}
      .v322-baseline-note{font-size:12px;font-weight:700;color:#b45309}
      .v322-change-status{
        display:block!important;
        width:100%!important;
        min-width:0!important;
        padding:9px 12px!important;
        border-radius:12px!important;
        background:#f8fafc!important;
        border:1px solid #e2e8f0!important;
        color:#475569!important;
        box-sizing:border-box!important;
        font-size:13px!important;
      }
      .v322-change-status.is-changed{
        background:#fff7ed!important;
        border-color:#fdba74!important;
        color:#9a3412!important;
      }
      .v322-daily-change-summary{
        margin:14px 0!important;
        padding:14px!important;
        border:1px solid #bfdbfe!important;
        border-radius:18px!important;
        background:#fff!important;
      }
      .v322-daily-change-summary h3{margin:0 0 10px;font-size:17px}
      .v322-summary-empty{color:#64748b}
      .v322-summary-count{font-weight:800;color:#9a3412;margin-bottom:8px}
      .v322-summary-list{display:grid;gap:7px}
      .v322-summary-list>div{
        display:flex;justify-content:space-between;gap:12px;
        padding:8px 10px;border-radius:10px;background:#fff7ed;
        border:1px solid #fed7aa
      }
      .v322-summary-list span{text-align:right;color:#9a3412}
      .v322-desktop-baseline{min-width:150px}
      .v322-desktop-baseline .v322-desktop-label{display:block;font-size:11px;color:#64748b}
      .v322-desktop-baseline b{display:block;margin-top:2px}
      .v322-desktop-baseline small{display:block;margin-top:3px;color:#b45309}

      @media(max-width:760px){
        .position-mobile-card.v225-position-card{
          grid-template-columns:minmax(0,1fr)!important;
          grid-template-areas:
            "head"
            "meta"
            "plan"
            "duty"
            "edit"
            "compare"
            "action"!important;
        }
        .position-mobile-card.v225-position-card > .v322-baseline-box{
          grid-area:plan!important;
          display:flex!important;
        }
        .position-mobile-card.v225-position-card > .v311-position-duty-preview,
        .position-mobile-card.v225-position-card > .v296-position-duty-preview{
          grid-area:duty!important;
          width:100%!important;
          min-width:0!important;
          position:relative!important;
          z-index:1!important;
        }
        .position-mobile-card.v225-position-card > label{
          grid-area:edit!important;
        }
        .position-mobile-card.v225-position-card > .v322-change-status{
          grid-area:compare!important;
        }
        .position-mobile-card.v225-position-card > .actions{
          grid-area:action!important;
        }
        .v322-summary-list>div{flex-direction:column;gap:3px}
        .v322-summary-list span{text-align:left}
      }
    `;
    document.head.appendChild(style);
  }

  injectStyle();

  document.addEventListener('change',event=>{
    const select=event.target?.closest?.('select[data-position-row]');
    if(!select)return;
    const root=document.querySelector('.v225-positions-page,.v226-positions-page');
    if(!root)return;
    syncTwinSelect(select,root);
    queueEnhance();
  },true);

  const install=()=>{
    injectStyle();
    const root=document.getElementById('pageContent');
    if(root&&!root.__v322Observer){
      const observer=new MutationObserver(queueEnhance);
      observer.observe(root,{childList:true,subtree:true});
      root.__v322Observer=observer;
    }
    queueEnhance();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  window.cnmiV322={enhance,queueEnhance,staffName};
  console.info(`${VERSION}: baseline comparison enabled without extra Supabase reads`);
})();