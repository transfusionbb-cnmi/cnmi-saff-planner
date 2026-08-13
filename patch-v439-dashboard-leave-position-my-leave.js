/* CNMI Staff Planner V439
 * - Dashboard: mark today's daytime position when assigned staff is on leave.
 * - Show leave period + HR verification state directly on affected position.
 * - Summary shows scheduled vs actually available full-day staff by zone/overall.
 * - Staff menu: "การลาของฉัน" with month filter and HR verification status.
 * Display-only; no schema/SQL changes.
 */
(function(){
  'use strict';
  const VERSION='V439_DASHBOARD_LEAVE_POSITION_MY_LEAVE';
  if(window.__CNMI_V439_DASHBOARD_LEAVE_POSITION_MY_LEAVE__) return;
  window.__CNMI_V439_DASHBOARD_LEAVE_POSITION_MY_LEAVE__=true;

  function S(){ try{return window.state||state||{};}catch(_){return window.state||{};} }
  function esc(v){ try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));} }
  function today(){ try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;} }
  function norm(v){return String(v||'').slice(0,10);}
  function inRange(date,row){
    try{return typeof dateInRange==='function'?dateInRange(date,row.start_date,row.end_date):(date>=norm(row.start_date)&&date<=norm(row.end_date));}
    catch(_){return date>=norm(row.start_date)&&date<=norm(row.end_date);}
  }
  function effective(row){ try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):!['ยกเลิก','cancelled','canceled'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;} }
  function isRealLeave(row){return row && String(row.type||'').trim()!=='ไม่รับเวร' && effective(row);}
  function leaveFor(staffId,date){
    return (S().leaves||[]).filter(r=>String(r.staff_id)===String(staffId)&&isRealLeave(r)&&inRange(date,r))
      .sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')))[0]||null;
  }
  function period(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim();
    if(/ครึ่งเช้า|08:00\s*-\s*12:30|เช้า/.test(raw))return {key:'am',label:'ครึ่งเช้า',short:'ลาครึ่งเช้า'};
    if(/ครึ่งบ่าย|11:30\s*-\s*16:00|บ่าย/.test(raw))return {key:'pm',label:'ครึ่งบ่าย',short:'ลาครึ่งบ่าย'};
    return {key:'full',label:'เต็มวัน',short:'ลาทั้งวัน'};
  }
  function leaveType(row){try{return typeof leaveDisplayType==='function'?leaveDisplayType(row):String(row?.type||'ลา');}catch(_){return String(row?.type||'ลา');}}
  function hrMeta(row){
    const h=(S().hrChecks||[]).find(x=>String(x.leave_request_id)===String(row?.id));
    if(h?.status==='ตรวจสอบแล้ว')return {checked:true,label:'✓ ตรวจ HR แล้ว'};
    if(h?.status==='รอเอกสาร')return {checked:false,label:'รอเอกสาร HR'};
    return {checked:false,label:'รอตรวจ HR'};
  }
  function nick(staffId){try{return staffNick(staffId);}catch(_){const x=(S().staff||[]).find(s=>String(s.id)===String(staffId));return x?.nickname||x?.full_name||'-';}}
  function thaiDate(d){try{return formatThaiDate(d);}catch(_){return d;}}
  function currentStaff(){try{return currentStaffId();}catch(_){return S().profile?.staff_id||S().profile?.id||'';}}
  function monthNow(){try{return monthKey(new Date());}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}}

  function decorateDashboard(html){
    try{
      const date=today();
      const api=window.cnmiDashboardPositionsV434;
      const rows=api?.rowsFor?api.rowsFor(date):[];
      if(!rows.length)return html;
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const card=tpl.content.querySelector('[data-v434-daytime-positions]');if(!card)return html;
      const items=[...card.querySelectorAll('.v434-position-item')];
      const used=new Set();
      items.forEach(item=>{
        const label=String(item.querySelector('.v434-position-code')?.textContent||'').trim();
        let idx=rows.findIndex((r,i)=>!used.has(i)&&String((typeof positionLabelForCell==='function'?positionLabelForCell(r.position_code||r.code):r.position_code||r.code)||'').trim()===label);
        if(idx<0)idx=rows.findIndex((r,i)=>!used.has(i)&&String(r.position_code||r.code||'').trim()===label);
        if(idx<0)return;used.add(idx);
        const row=rows[idx];if(!row?.staff_id)return;
        const leave=leaveFor(row.staff_id,date);if(!leave)return;
        const p=period(leave),hr=hrMeta(leave);
        item.classList.add('v439-on-leave',`v439-leave-${p.key}`);
        item.insertAdjacentHTML('beforeend',`<div class="v439-leave-info"><span class="v439-leave-pill">${esc(p.short)}</span><span class="v439-hr-pill ${hr.checked?'is-checked':'is-pending'}">${esc(hr.label)}</span><span class="v439-gap-pill">⚠ ${p.key==='full'?'ตำแหน่งขาด':`ขาดช่วง${p.key==='am'?'เช้า':'บ่าย'}`}</span></div>`);
      });
      // Zone counts: assigned / available for full day (any leave marks affected)
      [...card.querySelectorAll('.v434-zone-group')].forEach(group=>{
        const zone=String(group.querySelector('.v434-zone-head b')?.textContent||'').trim();
        const zoneRows=rows.filter(r=>String(api?.zoneOf?api.zoneOf(r):r.zone||'').trim()===zone);
        const assigned=zoneRows.filter(r=>r.staff_id).length;
        const available=zoneRows.filter(r=>r.staff_id&&!leaveFor(r.staff_id,date)).length;
        const affected=assigned-available;
        const count=group.querySelector('.v434-zone-head span');
        if(count)count.innerHTML=affected?`<span class="v439-zone-ready">พร้อม ${available}/${zoneRows.length}</span><small>จัด ${assigned}/${zoneRows.length}</small>`:`${assigned}/${zoneRows.length}`;
        if(affected)group.classList.add('v439-zone-affected');
      });
      const assigned=rows.filter(r=>r.staff_id).length;
      const available=rows.filter(r=>r.staff_id&&!leaveFor(r.staff_id,date)).length;
      const affected=assigned-available;
      const summary=card.querySelector('.v434-summary-badges');
      if(summary&&affected){
        summary.innerHTML=`<span class="v439-scheduled-badge">จัดครบ ${assigned}/${rows.length}</span><span class="v439-ready-badge">พร้อมปฏิบัติงาน ${available}/${rows.length}</span><span class="v439-leave-count">ลา ${affected}</span>`;
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decoration skipped`,err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV439(){return decorateDashboard(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // Add staff navigation item once.
  try{
    if(typeof NAV_ITEMS!=='undefined'&&!NAV_ITEMS.some(x=>x.id==='myLeave')){
      const leaveIndex=NAV_ITEMS.findIndex(x=>x.id==='leave');
      NAV_ITEMS.splice(leaveIndex>=0?leaveIndex+1:3,0,{id:'myLeave',icon:'🌱',title:'การลาของฉัน',subtitle:'ดูวันที่ลาและสถานะการตรวจ HR ของฉัน',group:'staff'});
    }
  }catch(err){console.warn(`[${VERSION}] nav item skipped`,err);}

  function myLeaveRows(month){
    const id=currentStaff();
    return (S().leaves||[]).filter(r=>String(r.staff_id)===String(id)&&isRealLeave(r))
      .filter(r=>!month||norm(r.start_date).startsWith(month)||norm(r.end_date).startsWith(month))
      .sort((a,b)=>norm(b.start_date).localeCompare(norm(a.start_date))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  }
  function rangeText(r){const a=norm(r.start_date),b=norm(r.end_date);return a===b?thaiDate(a):`${thaiDate(a)} – ${thaiDate(b)}`;}
  function outsideBadge(r){
    const v=r?.late_leave_after_roster===true||r?.is_late_leave===true||r?.outside_roster===true||String(r?.roster_leave_timing||'').toLowerCase()==='late';
    return v?'<span class="v439-outside-badge">ลานอกตาราง</span>':'';
  }
  function renderMyLeavePage(){
    const month=S().myLeaveMonth||monthNow();
    const rows=myLeaveRows(month);
    const checked=rows.filter(r=>hrMeta(r).checked).length;
    const pending=rows.length-checked;
    const cards=rows.map(r=>{const p=period(r),hr=hrMeta(r);return `<article class="v439-my-leave-card"><div class="v439-my-leave-head"><div><b>${esc(rangeText(r))}</b><div class="v439-my-leave-tags"><span class="v439-type-pill">${esc(leaveType(r))}</span><span class="v439-period-pill">${esc(p.label)}</span>${outsideBadge(r)}</div></div><span class="v439-hr-status ${hr.checked?'is-checked':'is-pending'}">${esc(hr.label)}</span></div>${r.note?`<div class="v439-my-leave-note">เหตุผล: ${esc(r.note)}</div>`:''}</article>`;}).join('');
    return `<div class="card v439-my-leave-page"><div class="section-title"><div><h3>การลาของฉัน</h3><span class="muted">เช็กย้อนหลังได้ว่าลาวันไหน และ Admin ตรวจ HR แล้วหรือยัง</span></div></div><div class="toolbar compact-filter"><label>เดือน <input type="month" id="v439MyLeaveMonth" value="${esc(month)}"></label></div><div class="v439-my-leave-summary"><span>รายการลา <b>${rows.length}</b></span><span class="ok">✓ ตรวจ HR แล้ว <b>${checked}</b></span>${pending?`<span class="pending">รอตรวจ HR <b>${pending}</b></span>`:''}</div>${rows.length?`<div class="v439-my-leave-list">${cards}</div>`:'<div class="empty-state">เดือนนี้ยังไม่มีรายการลา</div>'}<div class="v439-my-leave-help">สถานะ “✓ ตรวจ HR แล้ว” หมายถึง Admin ตรวจยืนยันรายการในระบบ HR แล้ว</div></div>`;
  }

  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV439(){
      if(S().page!=='myLeave')return oldRenderPage.apply(this,arguments);
      try{
        const item=(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:[]).find(x=>x.id==='myLeave')||{title:'การลาของฉัน',subtitle:'ดูวันที่ลาและสถานะการตรวจ HR ของฉัน'};
        const pt=document.getElementById('pageTitle'),ps=document.getElementById('pageSubtitle'),content=document.getElementById('pageContent');
        if(pt)pt.textContent=item.title;if(ps)ps.textContent=item.subtitle;
        if(typeof renderNav==='function')renderNav();
        if(content)content.innerHTML=renderMyLeavePage();
      }catch(err){console.error(`[${VERSION}] myLeave render failed`,err);return oldRenderPage.apply(this,arguments);}
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  document.addEventListener('change',e=>{
    if(e.target?.id!=='v439MyLeaveMonth')return;
    S().myLeaveMonth=e.target.value||monthNow();
    try{renderPage();}catch(_){window.renderPage?.();}
  });

  const style=document.createElement('style');style.id='cnmi-v439-leave-position-my-leave';style.textContent=`
    .v434-position-item.v439-on-leave{grid-template-columns:minmax(0,1fr) auto!important;grid-template-rows:auto auto;border-color:#ffc98d!important;background:#fffaf3!important;align-items:start}
    .v434-position-item.v439-on-leave.v439-leave-am,.v434-position-item.v439-on-leave.v439-leave-pm{background:#fffdf5!important;border-color:#f5d994!important}
    .v439-leave-info{grid-column:1/-1;display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:2px}
    .v439-leave-pill,.v439-hr-pill,.v439-gap-pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 6px;font-size:8px;font-weight:900;line-height:1.15;white-space:nowrap}
    .v439-leave-pill{background:#fff0e0;color:#a95800;border:1px solid #ffd19c}.v439-hr-pill.is-checked{background:#eaf8ef;color:#10733c}.v439-hr-pill.is-pending{background:#f2f4f7;color:#667085}.v439-gap-pill{background:#fff2f0;color:#b42318}
    .v439-scheduled-badge,.v439-ready-badge,.v439-leave-count{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;white-space:nowrap}.v439-scheduled-badge{background:#eaf8ef;color:#18723e;border:1px solid #bfe8cc}.v439-ready-badge{background:#fff7e8;color:#9b5b00;border:1px solid #f5d49c}.v439-leave-count{background:#fff0ed;color:#b42318;border:1px solid #ffd0c7}
    .v434-zone-group.v439-zone-affected{border-color:#ffd8a8;background:#fffdf9}.v439-zone-ready{color:#a15c00;font-weight:900}.v434-zone-head span small{display:block;color:#8999a9;font-size:8px;font-weight:750;text-align:right;margin-top:1px}
    .v439-my-leave-page{max-width:920px}.v439-my-leave-summary{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 14px}.v439-my-leave-summary>span{display:inline-flex;gap:5px;align-items:center;padding:6px 10px;border-radius:999px;background:#f1f5f9;color:#52677c;font-size:12px}.v439-my-leave-summary .ok{background:#eaf8ef;color:#15733e}.v439-my-leave-summary .pending{background:#fff7e8;color:#9a5b00}
    .v439-my-leave-list{display:grid;gap:9px}.v439-my-leave-card{border:1px solid #dfe8f0;border-radius:14px;background:#fff;padding:12px 13px}.v439-my-leave-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.v439-my-leave-head b{font-size:15px;color:#243a50}.v439-my-leave-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.v439-type-pill,.v439-period-pill,.v439-outside-badge,.v439-hr-status{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.v439-type-pill{background:#eef5fb;color:#315f86}.v439-period-pill{background:#eaf3ff;color:#275f94}.v439-outside-badge{background:#fff2e8;color:#b85b00}.v439-hr-status.is-checked{background:#eaf8ef;color:#15733e}.v439-hr-status.is-pending{background:#fff7e8;color:#9a5b00}.v439-my-leave-note{margin-top:9px;color:#617489;font-size:12px}.v439-my-leave-help{margin-top:14px;color:#718398;font-size:11px;line-height:1.5}
    @media(max-width:820px){.v439-leave-pill,.v439-hr-pill,.v439-gap-pill{font-size:9px;padding:3px 6px}.v439-scheduled-badge,.v439-ready-badge,.v439-leave-count{font-size:9px;padding:4px 7px}.v439-my-leave-head{display:grid;gap:8px}.v439-hr-status{width:max-content}.v439-my-leave-card{padding:13px}.v439-my-leave-head b{font-size:16px}}
  `;document.head.appendChild(style);

  window.cnmiLeavePositionV439={leaveFor,period,hrMeta,myLeaveRows,renderMyLeavePage};
  console.info(`${VERSION} loaded`);
})();
