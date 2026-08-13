/* CNMI Staff Planner V440
 * Fix follow-up for V439.
 * 1) Leave history: "ลานอกตาราง" is rendered once on the exact leave row/card only.
 * 2) Dashboard daytime positions: mark the exact affected position card; do not tint the whole Blood Bank/Donor Room group.
 * 3) Ensure "การลาของฉัน" is visible in Staff navigation after V439 is loaded.
 * Display-only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V440_LEAVE_DASHBOARD_HISTORY_FIX';
  if(window.__CNMI_V440_LEAVE_DASHBOARD_HISTORY_FIX__)return;
  window.__CNMI_V440_LEAVE_DASHBOARD_HISTORY_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function currentStaff(){try{return currentStaffId();}catch(_){return S().profile?.staff_id||S().profile?.id||'';}}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function leaveType(row){try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||''):String(row?.type||row?.leave_type||'').split(':::')[0].trim();}catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}}

  /* ---------------- Leave history exact badge ---------------- */
  function fiscalRange(fy){const n=Number(fy);return {start:`${n-1}-10-01`,end:`${n}-09-30`};}
  function overlapsFiscal(row,fy){
    if(!fy)return true;
    const {start,end}=fiscalRange(fy),a=norm(row?.start_date),b=norm(row?.end_date||row?.start_date);
    return !!a&&!!b&&b>=start&&a<=end;
  }
  function visibleLeaveRows(){
    const me=currentStaff();
    const base=(S().leaves||[]).filter(r=>admin()||String(r?.staff_id)===String(me));
    const type=S().leaveFilterType||'';
    const fy=S().leaveFilterFiscalYear||'';
    const staffId=S().leaveFilterStaff||'';
    return base.filter(r=>{
      if(type&&leaveType(r)!==type)return false;
      if(fy&&!overlapsFiscal(r,fy))return false;
      if(staffId&&String(r?.staff_id)!==String(staffId))return false;
      return true;
    });
  }
  function isLate(row){
    try{return !!window.cnmiLateLeaveV430?.isLateLeave?.(row);}catch(_){return false;}
  }
  function exactLateBadges(html){
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const card=tpl.content.querySelector('.leave-list-card');
      if(!card)return html;
      // V430 historically matched by nickname, so one person with many late-leave rows
      // could append the same badge repeatedly to the first row. Clear those render-only badges first.
      card.querySelectorAll('.v430-late-leave-badge').forEach(x=>x.remove());
      const rows=visibleLeaveRows();
      const trs=[...card.querySelectorAll('.leave-desktop-table tbody tr')];
      const cards=[...card.querySelectorAll('.mobile-cards .mobile-card')];
      rows.forEach((row,i)=>{
        if(!isLate(row))return;
        const td=trs[i]?.children?.[0];
        if(td&&!td.querySelector('.v430-late-leave-badge'))td.insertAdjacentHTML('beforeend',' <span class="v430-late-leave-badge">ลานอกตาราง</span>');
        const head=cards[i]?.querySelector('.section-title');
        if(head&&!head.querySelector('.v430-late-leave-badge'))head.insertAdjacentHTML('beforeend','<span class="v430-late-leave-badge">ลานอกตาราง</span>');
      });
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] exact leave-history badge skipped`,err);return html;}
  }
  const oldLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof oldLeavePage==='function'){
    const wrappedLeave=function renderLeavePageV440(){return exactLateBadges(oldLeavePage.apply(this,arguments));};
    try{window.renderLeavePage=renderLeavePage=wrappedLeave;}catch(_){window.renderLeavePage=wrappedLeave;}
  }

  /* ---------------- Dashboard exact affected position ---------------- */
  function leaveFor(staffId,date){
    try{if(window.cnmiLeavePositionV439?.leaveFor)return window.cnmiLeavePositionV439.leaveFor(staffId,date);}catch(_){ }
    return null;
  }
  function periodMeta(row){
    try{if(window.cnmiLeavePositionV439?.period)return window.cnmiLeavePositionV439.period(row);}catch(_){ }
    const raw=String(row?.leave_period||'เต็มวัน');
    if(/เช้า/.test(raw))return {key:'am',short:'ลาครึ่งเช้า'};
    if(/บ่าย/.test(raw))return {key:'pm',short:'ลาครึ่งบ่าย'};
    return {key:'full',short:'ลาทั้งวัน'};
  }
  function hrMeta(row){
    try{if(window.cnmiLeavePositionV439?.hrMeta)return window.cnmiLeavePositionV439.hrMeta(row);}catch(_){ }
    const h=(S().hrChecks||[]).find(x=>String(x?.leave_request_id)===String(row?.id));
    return h?.status==='ตรวจสอบแล้ว'?{checked:true,label:'✓ ตรวจ HR แล้ว'}:{checked:false,label:'รอตรวจ HR'};
  }
  function today(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function rebuildDashboard(html){
    try{
      const api=window.cnmiDashboardPositionsV434;
      if(!api?.rowsFor||!api?.groupRows)return html;
      const date=today(),rows=api.rowsFor(date)||[];
      if(!rows.length)return html;
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const root=tpl.content.querySelector('[data-v434-daytime-positions]');if(!root)return html;

      // Undo V439 render-only decoration, then rebuild from the exact V434 group/item order.
      root.querySelectorAll('.v439-leave-info').forEach(x=>x.remove());
      root.querySelectorAll('.v434-position-item').forEach(x=>x.classList.remove('v439-on-leave','v439-leave-am','v439-leave-pm','v439-leave-full'));
      root.querySelectorAll('.v434-zone-group').forEach(x=>x.classList.remove('v439-zone-affected'));

      const dataGroups=api.groupRows(rows)||[];
      const domGroups=[...root.querySelectorAll('.v434-zone-group')];
      domGroups.forEach((groupEl,gi)=>{
        const zoneLabel=String(groupEl.querySelector('.v434-zone-head b')?.textContent||'').trim();
        let pair=dataGroups[gi];
        if(!pair||String(pair[0]||'').trim()!==zoneLabel)pair=dataGroups.find(p=>String(p?.[0]||'').trim()===zoneLabel)||pair;
        const zoneRows=pair?.[1]||[];
        const items=[...groupEl.querySelectorAll('.v434-position-item')];
        zoneRows.forEach((row,i)=>{
          const item=items[i];if(!item||!row?.staff_id)return;
          const leave=leaveFor(row.staff_id,date);if(!leave)return;
          const p=periodMeta(leave),hr=hrMeta(leave);
          item.classList.add('v439-on-leave',`v439-leave-${p.key}`);
          item.insertAdjacentHTML('beforeend',`<div class="v439-leave-info"><span class="v439-leave-pill">${esc(p.short)}</span><span class="v439-hr-pill ${hr.checked?'is-checked':'is-pending'}">${esc(hr.label)}</span><span class="v439-gap-pill">⚠ ${p.key==='full'?'ตำแหน่งขาด':`ขาดช่วง${p.key==='am'?'เช้า':'บ่าย'}`}</span></div>`);
        });
        const assigned=zoneRows.filter(r=>r?.staff_id).length;
        const affected=zoneRows.filter(r=>r?.staff_id&&leaveFor(r.staff_id,date)).length;
        const available=Math.max(0,assigned-affected);
        const count=groupEl.querySelector('.v434-zone-head span');
        if(count)count.innerHTML=affected?`<span class="v439-zone-ready">พร้อม ${available}/${zoneRows.length}</span><small>จัด ${assigned}/${zoneRows.length}</small>`:`${assigned}/${zoneRows.length}`;
      });

      const assignedRows=rows.filter(r=>r?.staff_id);
      const affectedRows=assignedRows.filter(r=>leaveFor(r.staff_id,date));
      const available=Math.max(0,assignedRows.length-affectedRows.length);
      const leavePeople=new Set(affectedRows.map(r=>String(r.staff_id))).size;
      const summary=root.querySelector('.v434-summary-badges');
      if(summary&&affectedRows.length){
        summary.innerHTML=`<span class="v439-scheduled-badge">จัดครบ ${assignedRows.length}/${rows.length}</span><span class="v439-ready-badge">พร้อมปฏิบัติงาน ${available}/${rows.length}</span><span class="v439-leave-count">ลา ${leavePeople}</span>`;
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard exact-position fix skipped`,err);return html;}
  }
  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV440(){return rebuildDashboard(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  /* ---------------- Ensure My Leave navigation is actually rendered ---------------- */
  function navList(){try{return typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS;}catch(_){return window.NAV_ITEMS;}}
  function ensureMyLeaveItem(){
    const list=navList();if(!Array.isArray(list))return false;
    if(!list.some(x=>x?.id==='myLeave')){
      const i=list.findIndex(x=>x?.id==='leave');
      list.splice(i>=0?i+1:3,0,{id:'myLeave',icon:'🌱',title:'การลาของฉัน',subtitle:'ดูวันที่ลาและสถานะการตรวจ HR ของฉัน',group:'staff'});
    }
    return true;
  }
  ensureMyLeaveItem();
  const oldRenderNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);
  if(typeof oldRenderNav==='function'){
    const wrappedNav=function renderNavV440(){ensureMyLeaveItem();return oldRenderNav.apply(this,arguments);};
    try{window.renderNav=renderNav=wrappedNav;}catch(_){window.renderNav=wrappedNav;}
  }
  // V439 was loaded after the first menu paint, so repaint once when a profile already exists.
  setTimeout(()=>{try{if(S().profile){ensureMyLeaveItem();(window.renderNav||renderNav)?.();}}catch(_){ }},0);

  const style=document.createElement('style');style.id='cnmi-v440-leave-dashboard-history-fix';style.textContent=`
    /* Only the affected position card gets a warning treatment; whole work areas stay neutral. */
    .v434-zone-group.v439-zone-affected,.v434-zone-group{border-color:#e2ebf3!important;background:#fbfdff!important}
    .v434-position-item.v439-on-leave{border-color:#f5b76f!important;background:#fffaf3!important;box-shadow:inset 3px 0 0 #f5b76f}
    .v434-position-item.v439-on-leave.v439-leave-am,.v434-position-item.v439-on-leave.v439-leave-pm{border-color:#edc96f!important;background:#fffdf5!important;box-shadow:inset 3px 0 0 #edc96f}
    .leave-list-card td>.v430-late-leave-badge{margin-left:5px}
    .leave-list-card .mobile-card>.section-title>.v430-late-leave-badge{margin-left:auto}
    @media(max-width:820px){
      .v434-position-item.v439-on-leave{grid-template-columns:1fr!important;grid-template-rows:auto!important}
      .v439-leave-info{margin-top:1px;gap:4px}
    }
  `;document.head.appendChild(style);

  window.cnmiV440={visibleLeaveRows,exactLateBadges,rebuildDashboard,ensureMyLeaveItem};
  console.info(`${VERSION} loaded`);
})();
