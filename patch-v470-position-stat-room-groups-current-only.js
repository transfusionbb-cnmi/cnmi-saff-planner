/* CNMI Staff Planner V470
   Current-position statistics grouped by real work room.
   - Statistics detail tables show only the current normal-day Slot codes.
   - Current positions are ordered by room and share the same soft background.
   - Adds a room legend: Specimen & Issue / Blood Bank / Component Prep / Donor Room.
   - Old/retired position columns remain in historical data, but are hidden from the current-position statistics.
   - Position Management displays the derived room/group name without changing the stored zone values.
   - No Supabase schema/data changes.
*/
(function(){
  'use strict';
  const VERSION='V470_POSITION_STAT_ROOM_GROUPS_CURRENT_ONLY';
  if(window.__CNMI_V470_POSITION_STAT_ROOM_GROUPS_CURRENT_ONLY__) return;
  window.__CNMI_V470_POSITION_STAT_ROOM_GROUPS_CURRENT_ONLY__=true;

  let queued=false;
  let loadingRequested=false;

  function S(){ try{return state||window.state||{};}catch(_){return window.state||{};} }
  function norm(v){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g,''); }
  function page(){ return String(S()?.page||''); }
  function admin(){ try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';} }

  const GROUPS=[
    {id:'specimen-issue', label:'Specimen & Issue', thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank', label:'Blood Bank', thai:'งานตรวจ Donor / งาน Immunohematology และเคสยาก'},
    {id:'component-prep', label:'Component Prep', thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room', label:'Donor Room', thai:'ห้องบริจาคโลหิต'},
    {id:'other', label:'อื่นๆ', thai:'ตำแหน่งปัจจุบันที่ยังไม่ได้จัดกลุ่ม'}
  ];
  const groupById=id=>GROUPS.find(g=>g.id===id)||GROUPS[GROUPS.length-1];

  function roomGroup(code){
    const raw=String(code||'').trim();
    const k=norm(raw);
    if(!raw) return 'other';
    if(/^dr-/i.test(raw)) return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2') return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4') return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport') return 'specimen-issue';
    if(/^bb-/i.test(raw)) return 'specimen-issue';
    return 'other';
  }

  function baseSlotCount(){
    try{
      const n=Number(window.cnmiV231?.getBaseSlotCount231?.());
      if(Number.isFinite(n)&&n>0) return Math.round(n);
    }catch(_){}
    const fromState=Number(S()?.baseSlotCountV231||0);
    return Number.isFinite(fromState)&&fromState>0?Math.round(fromState):13;
  }

  function currentSlotRows(){
    const n=baseSlotCount();
    try{
      const cfg=window.cnmiV224?.currentConfigs?.();
      const rows=cfg?.day?.[n]||cfg?.day?.[String(n)]||[];
      if(Array.isArray(rows)&&rows.length) return rows;
    }catch(_){}
    try{
      const masters=(S()?.positionMasters||[]).filter(r=>r&&r.is_active!==false&&!r.deleted_at&&!String(r.code||'').startsWith('__CNMI_SLOT_TEMPLATE')&&r.is_outing!==true&&String(r.zone||'')!=='ออกหน่วย');
      if(masters.length) return masters.sort((a,b)=>Number(a.sort_order||999)-Number(b.sort_order||999));
    }catch(_){}
    return [];
  }

  function currentCodes(){
    const seen=new Set();
    return currentSlotRows().map(r=>String(r?.code||r?.position_code||'').trim()).filter(c=>c&&!seen.has(c)&&seen.add(c));
  }

  function orderedCurrentCodes(){
    const codes=currentCodes();
    const rank=new Map(GROUPS.map((g,i)=>[g.id,i]));
    return codes.map((code,index)=>({code,index,group:roomGroup(code)})).sort((a,b)=>(rank.get(a.group)??99)-(rank.get(b.group)??99)||a.index-b.index).map(x=>x.code);
  }

  function textNumber(cell){
    const raw=String(cell?.textContent||'').replace(/,/g,'').trim();
    const n=Number(raw);
    return Number.isFinite(n)?n:0;
  }

  function addLegend(card,codes){
    if(!card) return;
    let legend=card.querySelector('.v470-room-legend');
    if(!legend){
      legend=document.createElement('div');
      legend.className='v470-room-legend';
      const title=card.querySelector('.section-title');
      if(title) title.insertAdjacentElement('afterend',legend);
      else card.prepend(legend);
    }
    const used=[...new Set(codes.map(roomGroup))];
    const signature=used.map(id=>`${id}:${codes.filter(c=>roomGroup(c)===id).length}`).join('|');
    if(legend.dataset.v470Signature===signature) return;
    legend.dataset.v470Signature=signature;
    legend.innerHTML=used.map(id=>{
      const g=groupById(id);
      const count=codes.filter(c=>roomGroup(c)===id).length;
      return `<span class="v470-room-chip" data-v470-group="${g.id}" title="${g.thai}"><b>${g.label}</b><small>${count} ตำแหน่ง</small></span>`;
    }).join('');
  }

  function updateCardCopy(card,isLifetime){
    const title=card?.querySelector('.section-title h3');
    const hint=card?.querySelector('.section-title .hint');
    if(title) title.textContent=isLifetime?'ตารางที่ 4 — ตำแหน่งสะสมทั้งหมด':'ตารางที่ 2 — ตำแหน่งประจำเดือนนี้';
    if(hint) hint.textContent=isLifetime?'เฉพาะตำแหน่งปัจจุบัน · เรียงตามห้อง · ตำแหน่งเก่าที่เลิกใช้ยังเก็บประวัติไว้แต่ไม่แสดง':'เฉพาะตำแหน่งปัจจุบัน · เรียงตามห้อง';
  }

  function rebuildDetailTable(table,codes,isLifetime){
    if(!table||!codes.length) return;
    const headRow=table.tHead?.rows?.[0];
    const body=table.tBodies?.[0];
    if(!headRow||!body) return;

    const headerCells=Array.from(headRow.cells||[]);
    if(headerCells.length<3) return;
    const indexByCode=new Map();
    headerCells.forEach((cell,index)=>{
      if(index===0||index===headerCells.length-1) return;
      indexByCode.set(String(cell.textContent||'').trim(),index);
    });
    const available=codes.filter(code=>indexByCode.has(code));
    if(!available.length) return;
    const signature=available.join('¦');
    if(table.dataset.v470Signature===signature){
      addLegend(table.closest('.v278-position-stat-card'),available);
      return;
    }

    const sourceHeader=headerCells.map(cell=>cell.cloneNode(true));
    const sourceRows=Array.from(body.rows||[]).map(row=>Array.from(row.cells||[]).map(cell=>cell.cloneNode(true)));
    const oldLast=headerCells.length-1;

    headRow.innerHTML='';
    const first=sourceHeader[0];
    first.textContent='เจ้าหน้าที่';
    headRow.appendChild(first);
    available.forEach(code=>{
      const idx=indexByCode.get(code);
      const cell=sourceHeader[idx];
      cell.classList.remove('v373-stat-color');
      delete cell.dataset.v373StatGroup;
      const group=roomGroup(code);
      cell.dataset.v470Group=group;
      cell.dataset.v470Code=code;
      cell.title=`${code} · ${groupById(group).label}`;
      headRow.appendChild(cell);
    });
    const totalHead=sourceHeader[oldLast];
    totalHead.textContent='รวม';
    totalHead.title='รวมเฉพาะตำแหน่งปัจจุบันที่แสดง';
    headRow.appendChild(totalHead);

    Array.from(body.rows||[]).forEach((row,rowIndex)=>{
      const src=sourceRows[rowIndex]||[];
      row.innerHTML='';
      if(src[0]) row.appendChild(src[0]);
      let total=0;
      available.forEach(code=>{
        const idx=indexByCode.get(code);
        const cell=src[idx]||document.createElement('td');
        cell.classList.remove('v373-stat-color');
        delete cell.dataset.v373StatGroup;
        const value=textNumber(cell);
        total+=value;
        const group=roomGroup(code);
        cell.dataset.v470Group=group;
        cell.dataset.v470Code=code;
        cell.classList.toggle('v470-never',value===0);
        if(value===0) cell.title='ยังไม่เคยอยู่ตำแหน่งนี้';
        row.appendChild(cell);
      });
      const totalCell=src[oldLast]||document.createElement('td');
      totalCell.innerHTML=`<b>${total}</b>`;
      totalCell.title='รวมเฉพาะตำแหน่งปัจจุบันที่แสดง';
      row.appendChild(totalCell);
    });

    table.dataset.v470Signature=signature;
    const card=table.closest('.v278-position-stat-card');
    addLegend(card,available);
    updateCardCopy(card,isLifetime);
  }

  function enhanceStats(){
    if(page()!=='positionMonth'||!admin()) return;
    const codes=orderedCurrentCodes();
    if(!codes.length){ requestConfigs(); return; }
    const tables=Array.from(document.querySelectorAll('.v278-position-detail-table'));
    tables.forEach((table,index)=>rebuildDetailTable(table,codes,index===1));
  }

  function decoratePositionManagement(){
    if(page()!=='positionManagement'||!admin()) return;
    document.querySelectorAll('.v224-slot-table').forEach(table=>{
      const head=table.tHead?.rows?.[0];
      if(head?.cells?.[2] && head.cells[2].textContent!=='ห้อง/กลุ่มงาน') head.cells[2].textContent='ห้อง/กลุ่มงาน';
      Array.from(table.tBodies?.[0]?.rows||[]).forEach(row=>{
        const code=String(row.cells?.[1]?.querySelector('b')?.textContent||row.cells?.[1]?.textContent||'').trim();
        const zoneCell=row.cells?.[2];
        if(!code||!zoneCell) return;
        const systemZone=zoneCell.dataset.v470SystemZone||String(zoneCell.textContent||'').trim();
        zoneCell.dataset.v470SystemZone=systemZone;
        const group=roomGroup(code),g=groupById(group);
        if(zoneCell.dataset.v470Decorated===group && zoneCell.querySelector('.v470-zone-pill')) return;
        zoneCell.dataset.v470Decorated=group;
        zoneCell.innerHTML=`<span class="v470-zone-pill" data-v470-group="${group}" title="${g.thai} · ค่าโซนระบบเดิม: ${systemZone}">${g.label}</span>`;
      });
      const wrap=table.closest('.v224-slot-crud-card');
      if(wrap&&!wrap.querySelector('.v470-room-note')){
        const note=document.createElement('div');
        note.className='notice soft-notice compact v470-room-note';
        note.innerHTML='<b>ชื่อห้องที่ใช้จัดกลุ่ม:</b> Specimen &amp; Issue · Blood Bank · Component Prep · Donor Room <span class="muted">(เปลี่ยนเฉพาะการแสดงผล/สถิติ ไม่เปลี่ยน Code และค่าโซนเดิมในฐานข้อมูล)</span>';
        const tableWrap=table.closest('.table-wrap');
        tableWrap?.insertAdjacentElement('beforebegin',note);
      }
    });

    const form=document.getElementById('slotTemplateFormV224');
    if(form&&!form.querySelector('.v470-modal-room-note')){
      const codeInput=form.querySelector('[name="code"]');
      const zoneSelect=form.querySelector('[name="zone"]');
      if(zoneSelect){
        const note=document.createElement('span');
        note.className='hint v470-modal-room-note';
        const refresh=()=>{
          const code=String(codeInput?.value||'').trim();
          const g=groupById(roomGroup(code));
          note.textContent=code?`ห้องที่แสดงในสถิติ: ${g.label}`:'ชื่อห้องในสถิติจะอิงจาก Code ตำแหน่งอัตโนมัติ';
        };
        zoneSelect.parentElement?.appendChild(note);
        codeInput?.addEventListener('input',refresh);
        refresh();
      }
    }
  }

  function requestConfigs(){
    if(loadingRequested) return;
    const fn=window.cnmiV224?.loadDbConfigs;
    if(typeof fn!=='function') return;
    loadingRequested=true;
    try{
      const p=fn(false);
      if(p&&typeof p.then==='function') p.finally(()=>{loadingRequested=false;queue();});
      else loadingRequested=false;
    }catch(_){ loadingRequested=false; }
  }

  function enhance(){
    enhanceStats();
    decoratePositionManagement();
  }
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance();});
  }

  const style=document.createElement('style');
  style.id='v470-position-stat-room-groups-current-only-style';
  style.textContent=`
    .v470-room-legend{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px}
    .v470-room-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #d8e2ec;border-radius:9px;padding:5px 8px;color:#274157;line-height:1}
    .v470-room-chip b{font-size:9px}.v470-room-chip small{font-size:7px;color:#64748b}
    .v470-room-chip[data-v470-group="specimen-issue"],.v470-zone-pill[data-v470-group="specimen-issue"]{background:#e8f2ff;border-color:#bfdbfe}
    .v470-room-chip[data-v470-group="blood-bank"],.v470-zone-pill[data-v470-group="blood-bank"]{background:#fff3d9;border-color:#fde68a}
    .v470-room-chip[data-v470-group="component-prep"],.v470-zone-pill[data-v470-group="component-prep"]{background:#f2eaff;border-color:#ddd6fe}
    .v470-room-chip[data-v470-group="donor-room"],.v470-zone-pill[data-v470-group="donor-room"]{background:#e8f8ee;border-color:#bbf7d0}
    .v470-room-chip[data-v470-group="other"],.v470-zone-pill[data-v470-group="other"]{background:#f8fafc;border-color:#cbd5e1}

    .v278-position-detail-table [data-v470-group="specimen-issue"]{background:#eef6ff!important}
    .v278-position-detail-table [data-v470-group="blood-bank"]{background:#fff8e8!important}
    .v278-position-detail-table [data-v470-group="component-prep"]{background:#f7f0ff!important}
    .v278-position-detail-table [data-v470-group="donor-room"]{background:#eefaf2!important}
    .v278-position-detail-table [data-v470-group="other"]{background:#f8fafc!important}
    .v278-position-detail-table thead [data-v470-group]{font-weight:850!important;color:#223b50!important;border-top:3px solid transparent!important}
    .v278-position-detail-table thead [data-v470-group="specimen-issue"]{border-top-color:#60a5fa!important}
    .v278-position-detail-table thead [data-v470-group="blood-bank"]{border-top-color:#f59e0b!important}
    .v278-position-detail-table thead [data-v470-group="component-prep"]{border-top-color:#8b5cf6!important}
    .v278-position-detail-table thead [data-v470-group="donor-room"]{border-top-color:#22c55e!important}
    .v278-position-detail-table td.v470-never{color:#b42318!important;font-weight:850!important;box-shadow:inset 0 0 0 1px rgba(180,35,24,.14)}

    .v470-zone-pill{display:inline-flex;align-items:center;border:1px solid #d8e2ec;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;color:#274157;white-space:nowrap}
    .v470-room-note{margin:6px 0!important}
    .v470-modal-room-note{display:block;margin-top:4px}

    @media(max-width:820px){
      .v470-room-chip{padding:4px 6px}.v470-room-chip b{font-size:8px}.v470-room-chip small{font-size:6.5px}
      .v470-zone-pill{font-size:9px;padding:3px 6px}
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>{requestConfigs();queue();},{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{requestConfigs();queue();},300);

  window.cnmiV470={version:VERSION,roomGroup,currentCodes,orderedCurrentCodes,enhance};
  console.info(`[${VERSION}] loaded`);
})();
