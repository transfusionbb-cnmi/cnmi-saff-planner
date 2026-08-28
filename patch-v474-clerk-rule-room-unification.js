/* CNMI Staff Planner V474
 * Clerk-aware daytime position rules + unified real-room display.
 *
 * Goals
 * 1) Treat staff_type = เคิก / Clerk / ธุรการ as Clerk consistently.
 * 2) Understand generic rules such as:
 *      - Clerk
 *      - MT / Clerk
 *      - MT / Clerk ที่ผ่านการฝึก
 *    without relying on a person's nickname.
 * 3) For Clerk positions that explicitly say "ผ่านการฝึก", require an explicit
 *    per-person eligibility record before auto/manual candidate filtering accepts them.
 * 4) Show the same 4 real-room groups on Position Management:
 *      Specimen & Issue / Blood Bank / Component Prep / Donor Room
 *    while keeping the stored legacy zone value unchanged for backward compatibility.
 *
 * No Supabase schema changes.
 */
(function(){
  'use strict';
  const VERSION='V474_CLERK_RULE_ROOM_UNIFICATION';
  if(window.__CNMI_V474_CLERK_RULE_ROOM_UNIFICATION__) return;
  window.__CNMI_V474_CLERK_RULE_ROOM_UNIFICATION__=true;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function norm(v){return txt(v).toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');}
  function currentPage(){return txt(S()?.page);}
  function isAdminMode(){
    try{return !!isAdmin();}catch(_){return txt(S()?.profile?.role).toLowerCase()==='admin';}
  }

  function staffType(staff){return txt(staff?.staff_type||staff?.type||staff?.staffType);}
  function isClerk(staff){
    const t=staffType(staff).toLowerCase();
    return t==='เคิก'||t==='clerk'||t.includes('clerk')||t.includes('ธุรการ')||t.includes('เสมียน');
  }
  function isMT(staff){
    const t=staffType(staff).toLowerCase();
    return t==='mt'||/(^|[^a-z])mt([^a-z]|$)/i.test(staffType(staff))||t.includes('นักเทคนิคการแพทย์');
  }

  function hasClerkToken(rule){
    const r=txt(rule).toLowerCase();
    return r.includes('clerk')||r.includes('เคิก')||r.includes('ธุรการ')||r.includes('เสมียน');
  }
  function hasMTToken(rule){
    const r=txt(rule);
    return /(^|[^A-Za-z])MT([^A-Za-z]|$)/i.test(r)||r.includes('นักเทคนิคการแพทย์');
  }

  const previousRuleOk=window.positionRuleOk||(typeof positionRuleOk==='function'?positionRuleOk:null);
  function ruleOk474(staff,rule){
    if(!staff) return false;
    const raw=txt(rule);
    if(!raw) return previousRuleOk?!!previousRuleOk(staff,rule):true;
    const mt=hasMTToken(raw);
    const clerk=hasClerkToken(raw);

    // Generic modern rules use profession, not nickname.
    if(mt&&clerk) return isMT(staff)||isClerk(staff);
    if(clerk&&!mt) return isClerk(staff);

    // Keep explicit MT-only semantics deterministic.
    if(mt&&(/เท่านั้น/.test(raw)||/only/i.test(raw))) return isMT(staff);

    // Preserve legacy special-name rules and any other established behavior.
    return previousRuleOk?!!previousRuleOk(staff,rule):true;
  }
  try{window.positionRuleOk=positionRuleOk=ruleOk474;}catch(_){window.positionRuleOk=ruleOk474;}

  function eligibilityKey(row){return txt(row?.eligibility_code||row?.code||row?.position_code);}
  function explicitEligibility(staff,key){
    const sid=txt(staff?.id); const k=txt(key);
    if(!sid||!k) return null;
    const rec=(S()?.positionEligibility||[]).find(x=>txt(x?.staff_id)===sid&&txt(x?.position_code)===k);
    return rec?!!rec.is_eligible:null;
  }

  const previousCandidateOk=window.positionCandidateOk||(typeof positionCandidateOk==='function'?positionCandidateOk:null);
  function candidateOk474(staff,row,date){
    if(previousCandidateOk&&!previousCandidateOk(staff,row,date)) return false;
    const rule=txt(row?.main_rule);
    // "ผ่านการฝึก" is meaningful for Clerk: do not assume every Clerk is trained.
    if(isClerk(staff)&&/ผ่านการฝึก/.test(rule)){
      const explicit=explicitEligibility(staff,eligibilityKey(row));
      return explicit===true;
    }
    return true;
  }
  try{window.positionCandidateOk=positionCandidateOk=candidateOk474;}catch(_){window.positionCandidateOk=candidateOk474;}

  const GROUPS=[
    {id:'specimen-issue',label:'Specimen & Issue',thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank',label:'Blood Bank',thai:'ตรวจ Donor / Immunohematology และเคสยาก'},
    {id:'component-prep',label:'Component Prep',thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room',label:'Donor Room',thai:'ห้องบริจาคโลหิต'},
    {id:'other',label:'อื่นๆ',thai:'ตำแหน่งอื่น'}
  ];
  function groupInfo(id){return GROUPS.find(g=>g.id===id)||GROUPS[GROUPS.length-1];}
  function roomGroup(code){
    const raw=txt(code),k=norm(raw);
    if(!raw) return 'other';
    if(/^dr-/i.test(raw)) return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2') return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4') return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport') return 'specimen-issue';
    return 'other';
  }

  // Publish a single authoritative helper for later patches/debugging.
  window.cnmiRoomGroupV474={version:VERSION,roomGroup,groups:GROUPS.slice(),isClerk,isMT,ruleOk:ruleOk474};
  try{if(window.cnmiV470) window.cnmiV470.roomGroup=roomGroup;}catch(_){ }
  try{if(window.cnmiV471) window.cnmiV471.roomGroup=roomGroup;}catch(_){ }

  function headerIndex(table,label){
    const row=table?.tHead?.rows?.[0]||table?.rows?.[0];
    if(!row) return -1;
    return Array.from(row.cells||[]).findIndex(c=>txt(c.textContent)===label||txt(c.textContent).includes(label));
  }
  function codeFromCell(cell){
    if(!cell) return '';
    return txt(cell.querySelector('b')?.textContent||cell.firstElementChild?.textContent||cell.textContent).split('\n')[0];
  }

  function decorateManagementTable(table){
    if(!table) return;
    const codeIdx=headerIndex(table,'ตำแหน่ง');
    let zoneIdx=headerIndex(table,'ห้อง/กลุ่มงาน');
    if(zoneIdx<0) zoneIdx=headerIndex(table,'โซน');
    const ruleIdx=headerIndex(table,'ผู้ปฏิบัติหลัก');
    if(codeIdx<0||zoneIdx<0||ruleIdx<0) return;

    const head=table.tHead?.rows?.[0]||table.rows?.[0];
    if(head?.cells?.[zoneIdx]) head.cells[zoneIdx].textContent='ห้อง/กลุ่มงาน';

    const bodies=table.tBodies?.length?Array.from(table.tBodies):[];
    bodies.forEach(body=>Array.from(body.rows||[]).forEach(row=>{
      const code=codeFromCell(row.cells?.[codeIdx]);
      const cell=row.cells?.[zoneIdx];
      if(!code||!cell) return;
      if(!cell.dataset.v474LegacyZone) cell.dataset.v474LegacyZone=txt(cell.textContent);
      const id=roomGroup(code),g=groupInfo(id);
      cell.dataset.v474Group=id;
      cell.innerHTML=`<span class="v474-room-pill" data-v474-group="${id}" title="${g.thai} · ค่าโซนเดิม: ${cell.dataset.v474LegacyZone||'-'}">${g.label}</span>`;
    }));
  }

  function decoratePositionManagement(){
    if(currentPage()!=='positionManagement'||!isAdminMode()) return;
    const root=document.getElementById('pageContent')||document;
    root.querySelectorAll('table').forEach(decorateManagementTable);

    // Replace/refresh the explanatory line so it matches the actual display.
    root.querySelectorAll('.v470-room-note').forEach(n=>{
      n.innerHTML='<b>ห้อง/กลุ่มงานที่ใช้:</b> Specimen &amp; Issue · Blood Bank · Component Prep · Donor Room <span class="muted">(แสดงตาม Code ตำแหน่ง โดยยังคงค่าโซนเดิมในฐานข้อมูลเพื่อไม่กระทบระบบเก่า)</span>';
    });
  }

  function decorateRuleHints(){
    if(currentPage()!=='positionManagement'||!isAdminMode()) return;
    const root=document.getElementById('pageContent')||document;
    const notes=root.querySelectorAll('.v474-rule-note');
    if(notes.length) return;
    const card=root.querySelector('.v224-slot-crud-card');
    if(!card) return;
    const note=document.createElement('div');
    note.className='notice soft-notice compact v474-rule-note';
    note.innerHTML='<b>การตีความผู้ปฏิบัติหลัก:</b> Clerk = เจ้าหน้าที่ประเภทเคิกทุกคน • MT / Clerk = ทำได้ทั้ง MT และเคิก • ถ้ามีคำว่า “ผ่านการฝึก” เคิกต้องถูกเปิดสิทธิ์เฉพาะบุคคลของตำแหน่งนั้นก่อน';
    const roomNote=card.querySelector('.v470-room-note');
    if(roomNote) roomNote.insertAdjacentElement('afterend',note);
    else card.querySelector('.table-wrap')?.insertAdjacentElement('beforebegin',note);
  }

  let queued=false;
  function queue(){
    if(queued) return; queued=true;
    requestAnimationFrame(()=>{queued=false;decoratePositionManagement();decorateRuleHints();});
  }
  document.addEventListener('DOMContentLoaded',queue,{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(queue,250);
  setTimeout(queue,900);

  const style=document.createElement('style');
  style.id='cnmi-v474-clerk-room-unification-style';
  style.textContent=`
    .v474-room-pill{display:inline-flex;align-items:center;min-height:24px;padding:4px 9px;border-radius:999px;border:1px solid #d8e2ec;font-size:10px;font-weight:850;white-space:nowrap;color:#274157}
    .v474-room-pill[data-v474-group="specimen-issue"]{background:#e8f2ff;border-color:#bfdbfe}
    .v474-room-pill[data-v474-group="blood-bank"]{background:#fff3d9;border-color:#fde68a}
    .v474-room-pill[data-v474-group="component-prep"]{background:#f2eaff;border-color:#ddd6fe}
    .v474-room-pill[data-v474-group="donor-room"]{background:#e8f8ee;border-color:#bbf7d0}
    .v474-room-pill[data-v474-group="other"]{background:#f8fafc;border-color:#cbd5e1}
    .v474-rule-note{margin:6px 0!important;border-color:#bae6fd!important;background:#f0f9ff!important;color:#0c4a6e!important}
    @media(max-width:820px){.v474-room-pill{font-size:9px;padding:3px 7px}}
  `;
  document.head.appendChild(style);

  console.info(`[${VERSION}] loaded`);
})();
