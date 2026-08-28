/* CNMI Staff Planner V473
   Live-sync Admin position statistics after monthly position saves.
   - No manual page refresh is required after assigning/clearing a daytime position.
   - Monthly statistics refresh immediately from the local saved state.
   - Lifetime statistics are updated optimistically from the month delta, then revalidated from Supabase after the user pauses.
   - Keeps V470 room grouping/current-position filtering and V281 tabs/zero-column behavior.
   - No schema/data migration.
*/
(function(){
  'use strict';
  const VERSION='V473_POSITION_STATS_LIVE_SYNC';
  if(window.__CNMI_V473_POSITION_STATS_LIVE_SYNC__) return;
  window.__CNMI_V473_POSITION_STATS_LIVE_SYNC__=true;

  let baseline=null;
  let syncTimer=null;
  let verifyTimer=null;
  let captureTimer=null;
  let verifying=false;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function admin(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function target(){return String(S()?.page||'')==='positionMonth'&&admin();}
  function monthKey(){return String(S()?.positionMonthKey||S()?.positionMonthViewKey||S()?.monthKey||'').slice(0,7);}
  function num(v){const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}
  function text(el){return String(el?.textContent||'').trim();}

  function cards(){
    const grid=document.querySelector('.v278-admin-position-stats .v278-stat-grid');
    if(!grid)return[];
    const rows=[...grid.querySelectorAll(':scope > .v278-position-stat-card')];
    return rows.sort((a,b)=>Number(a.dataset.v281StatIndex??rows.indexOf(a))-Number(b.dataset.v281StatIndex??rows.indexOf(b)));
  }

  function staffName(row){return text(row?.cells?.[0]);}
  function detailSnapshot(table){
    const out={codes:[],rows:new Map()};
    const head=table?.tHead?.rows?.[0];
    const body=table?.tBodies?.[0];
    if(!head||!body)return out;
    const heads=[...head.cells];
    out.codes=heads.slice(1,-1).map(cell=>String(cell.dataset.v470Code||text(cell)).trim()).filter(Boolean);
    [...body.rows].forEach(row=>{
      const name=staffName(row);if(!name)return;
      const values=new Map();
      out.codes.forEach((code,i)=>values.set(code,num(row.cells?.[i+1]?.textContent)));
      out.rows.set(name,{values,total:num(row.cells?.[row.cells.length-1]?.textContent)});
    });
    return out;
  }

  function zoneSnapshot(table){
    const out={keys:[],rows:new Map()};
    const head=table?.tHead?.rows?.[0];
    const body=table?.tBodies?.[0];
    if(!head||!body)return out;
    out.keys=[...head.cells].slice(1,-1).map(cell=>text(cell));
    [...body.rows].forEach(row=>{
      const name=staffName(row);if(!name)return;
      const values=new Map();
      out.keys.forEach((key,i)=>values.set(key,num(row.cells?.[i+1]?.textContent)));
      out.rows.set(name,{values,total:num(row.cells?.[row.cells.length-1]?.textContent)});
    });
    return out;
  }

  function lifetimeBadgeBase(){
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    const match=text(heading).match(/ข้อมูลสะสม\s*([\d,]+)\s*รายการ/);
    return match?num(match[1]):null;
  }

  function canCapture(){
    if(!target())return false;
    const list=cards();
    if(list.length<4)return false;
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    if(!heading)return false;
    const t=text(heading);
    return !t.includes('กำลังโหลดข้อมูลสะสม')&&!t.includes('โหลดสะสมไม่สำเร็จ');
  }

  function capture(force=false){
    if(!canCapture())return false;
    const key=monthKey();
    if(!force&&baseline?.key===key)return true;
    const list=cards();
    baseline={
      key,
      monthZone:zoneSnapshot(list[0]?.querySelector('.v278-zone-table')),
      monthDetail:detailSnapshot(list[1]?.querySelector('.v278-position-detail-table')),
      lifeZone:zoneSnapshot(list[2]?.querySelector('.v278-zone-table')),
      lifeDetail:detailSnapshot(list[3]?.querySelector('.v278-position-detail-table')),
      lifeRows:lifetimeBadgeBase()
    };
    decorateStatus('พร้อม · สถิติอัปเดตอัตโนมัติ');
    return true;
  }

  function cellForCode(table,code){
    const head=table?.tHead?.rows?.[0];if(!head)return-1;
    return [...head.cells].findIndex((cell,index)=>index>0&&index<head.cells.length-1&&String(cell.dataset.v470Code||text(cell)).trim()===code);
  }
  function rowByName(table,name){
    return [...(table?.tBodies?.[0]?.rows||[])].find(row=>staffName(row)===name)||null;
  }
  function setNumericCell(cell,value){
    if(!cell)return;
    const safe=Math.max(0,Math.round(Number(value)||0));
    cell.textContent=String(safe);
    if(cell.dataset.v470Group){
      cell.classList.toggle('v470-never',safe===0);
      cell.title=safe===0?'ยังไม่เคยอยู่ตำแหน่งนี้':'';
    }
  }
  function setTotalCell(cell,value){
    if(!cell)return;
    const safe=Math.max(0,Math.round(Number(value)||0));
    cell.innerHTML=`<b>${safe}</b>`;
  }

  function applyDetailDelta(lifeTable,currentMonth){
    if(!lifeTable||!baseline)return;
    const codes=[...lifeTable.tHead.rows[0].cells].slice(1,-1).map(cell=>String(cell.dataset.v470Code||text(cell)).trim());
    const names=new Set([...baseline.lifeDetail.rows.keys(),...baseline.monthDetail.rows.keys(),...currentMonth.rows.keys()]);
    names.forEach(name=>{
      const row=rowByName(lifeTable,name);if(!row)return;
      let total=0;
      codes.forEach(code=>{
        const baseLife=baseline.lifeDetail.rows.get(name)?.values?.get(code)||0;
        const baseMonth=baseline.monthDetail.rows.get(name)?.values?.get(code)||0;
        const current=currentMonth.rows.get(name)?.values?.get(code)||0;
        const value=Math.max(0,baseLife+current-baseMonth);
        total+=value;
        const index=cellForCode(lifeTable,code);
        if(index>0)setNumericCell(row.cells[index],value);
      });
      setTotalCell(row.cells[row.cells.length-1],total);
    });
    syncZeroColumns(lifeTable);
  }

  function applyZoneDelta(lifeTable,currentMonth){
    if(!lifeTable||!baseline)return;
    const head=[...lifeTable.tHead.rows[0].cells];
    const keys=head.slice(1,-1).map(cell=>text(cell));
    const names=new Set([...baseline.lifeZone.rows.keys(),...baseline.monthZone.rows.keys(),...currentMonth.rows.keys()]);
    names.forEach(name=>{
      const row=rowByName(lifeTable,name);if(!row)return;
      let total=0;
      keys.forEach((key,i)=>{
        const baseLife=baseline.lifeZone.rows.get(name)?.values?.get(key)||0;
        const baseMonth=baseline.monthZone.rows.get(name)?.values?.get(key)||0;
        const current=currentMonth.rows.get(name)?.values?.get(key)||0;
        const value=Math.max(0,baseLife+current-baseMonth);
        total+=value;
        setNumericCell(row.cells[i+1],value);
      });
      setTotalCell(row.cells[row.cells.length-1],total);
    });
  }

  function monthRowTotal(snapshot){
    let total=0;snapshot?.rows?.forEach(row=>{total+=Number(row.total||0);});return total;
  }
  function updateLifetimeBadge(currentMonthZone){
    if(!baseline||baseline.lifeRows==null)return;
    const delta=monthRowTotal(currentMonthZone)-monthRowTotal(baseline.monthZone);
    const value=Math.max(0,baseline.lifeRows+delta);
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    const badge=[...(heading?.querySelectorAll('.badge')||[])].find(el=>text(el).includes('ข้อมูลสะสม'));
    if(badge)badge.textContent=`ข้อมูลสะสม ${value} รายการ`;
  }

  function syncZeroColumns(table){
    if(!table?.tHead?.rows?.[0])return;
    const showAll=!!document.querySelector('[data-v281-show-zero]:checked');
    const count=table.tHead.rows[0].cells.length;
    for(let index=1;index<count-1;index++){
      const hasValue=[...(table.tBodies?.[0]?.rows||[])].some(row=>num(row.cells?.[index]?.textContent)!==0);
      [...table.rows].forEach(row=>row.cells?.[index]?.classList.toggle('v281-hidden-zero-column',!showAll&&!hasValue));
    }
  }

  function decorateStatus(message){
    const stats=document.querySelector('.v278-admin-position-stats');if(!stats)return;
    let status=stats.querySelector('[data-v473-live-status]');
    if(!status){
      status=document.createElement('span');
      status.dataset.v473LiveStatus='';
      status.className='v473-live-status';
      const heading=stats.querySelector('.v278-stats-heading');
      heading?.appendChild(status);
    }
    status.textContent=message||'สถิติอัปเดตอัตโนมัติ';
  }

  function optimisticSync(){
    if(!target())return;
    if(!baseline||baseline.key!==monthKey()){
      baseline=null;
      if(!capture(true)){scheduleCapture();return;}
    }
    decorateStatus('กำลังอัปเดตสถิติ…');
    try{window.cnmiV278?.refreshAdminPositionStats?.();}catch(err){console.warn(VERSION,'refresh month stats',err);}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{window.cnmiV470?.enhance?.();}catch(_){}
      const list=cards();if(list.length<4)return;
      const currentMonthZone=zoneSnapshot(list[0]?.querySelector('.v278-zone-table'));
      const currentMonthDetail=detailSnapshot(list[1]?.querySelector('.v278-position-detail-table'));
      applyZoneDelta(list[2]?.querySelector('.v278-zone-table'),currentMonthZone);
      applyDetailDelta(list[3]?.querySelector('.v278-position-detail-table'),currentMonthDetail);
      updateLifetimeBadge(currentMonthZone);
      decorateStatus('อัปเดตแล้ว · ไม่ต้องรีเฟรช');
    }));
    scheduleVerify();
  }

  function scheduleSync(delay=40){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(optimisticSync,delay);
  }
  function scheduleCapture(delay=120){
    clearTimeout(captureTimer);
    captureTimer=setTimeout(()=>{
      if(!target())return;
      if(!capture(true))scheduleCapture(250);
    },delay);
  }
  function scheduleVerify(){
    clearTimeout(verifyTimer);
    verifyTimer=setTimeout(async()=>{
      if(!target()||verifying)return;
      verifying=true;
      decorateStatus('กำลังตรวจยอดกับฐานข้อมูล…');
      try{
        await window.cnmiV278?.loadLifetimePositions?.(true);
        setTimeout(()=>{
          try{window.cnmiV470?.enhance?.();}catch(_){}
          baseline=null;
          capture(true);
          decorateStatus('อัปเดตแล้ว · ไม่ต้องรีเฟรช');
        },180);
      }catch(err){
        console.warn(VERSION,'lifetime revalidate',err);
        decorateStatus('อัปเดตจากหน้าจอแล้ว');
      }finally{verifying=false;}
    },1800);
  }

  const style=document.createElement('style');
  style.id='v473-position-stats-live-sync-style';
  style.textContent=`
    .v473-live-status{display:inline-flex;align-items:center;margin-left:8px;padding:3px 7px;border:1px solid #bbf7d0;border-radius:999px;background:#f0fdf4;color:#166534;font-size:8px;font-weight:800;white-space:nowrap}
    @media(max-width:820px){.v473-live-status{font-size:7px;padding:3px 6px;margin-left:4px}}
  `;
  document.head.appendChild(style);

  const root=document.getElementById('pageContent')||document.body;
  new MutationObserver(mutations=>{
    if(!target())return;
    let saved=false,statsChanged=false;
    for(const m of mutations){
      if(m.type==='attributes'&&m.attributeName==='data-v290-save-state'){
        const cell=m.target;
        if(cell?.dataset?.v290SaveState==='saved'&&cell.matches?.('[data-v275-position-cell]'))saved=true;
      }
      if(m.type==='childList'&&[...(m.addedNodes||[])].some(node=>node?.nodeType===1&&(node.matches?.('.v278-admin-position-stats')||node.querySelector?.('.v278-admin-position-stats'))))statsChanged=true;
    }
    if(saved)scheduleSync(30);
    else if(statsChanged&&!baseline)scheduleCapture(140);
  }).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-v290-save-state']});

  document.addEventListener('change',event=>{
    if(!target())return;
    if(event.target?.matches?.('[data-v281-show-zero]'))setTimeout(()=>{
      const list=cards();
      syncZeroColumns(list[1]?.querySelector('.v278-position-detail-table'));
      syncZeroColumns(list[3]?.querySelector('.v278-position-detail-table'));
    },0);
  },true);

  document.addEventListener('DOMContentLoaded',()=>scheduleCapture(250),{once:true});
  setTimeout(()=>scheduleCapture(300),0);

  window.cnmiV473={sync:optimisticSync,capture:()=>capture(true),version:VERSION};
  console.info(`${VERSION} loaded`);
})();
