/* CNMI Staff Planner V476
   Position statistics respect daily_position_start_date.
   - Rows before a staff member's "เริ่มเป็นตัวจริง/จัดตำแหน่งกลางวัน" date remain historical/training data.
   - Those pre-start rows do NOT count in monthly or cumulative Admin position statistics.
   - From the effective date onward, counts begin normally.
   - Does not delete or modify daily_positions rows in Supabase.
*/
(function(){
  'use strict';
  const VERSION='V476_POSITION_STATS_REGULAR_START_GATE';
  if(window.__CNMI_V476_POSITION_STATS_REGULAR_START_GATE__) return;
  window.__CNMI_V476_POSITION_STATS_REGULAR_START_GATE__=true;

  let timer=null;
  let running=false;
  let lifetimeRowsCache=null;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function normId(v){return String(v==null?'':v);}
  function page(){return String(S()?.page||'');}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function text(el){return String(el?.textContent||'').trim();}
  function num(v){const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}
  function monthKey(){const k=String(S()?.positionMonthKey||S()?.monthKey||new Date().toISOString().slice(0,7));return /^\d{4}-\d{2}$/.test(k)?k:new Date().toISOString().slice(0,7);}
  function personById(id){return (S()?.staff||[]).find(p=>normId(p?.id)===normId(id))||null;}
  function staffName(p){return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function startDate(p){return normDate(p?.daily_position_start_date||'');}
  function countable(row){
    if(!row?.position_code) return false;
    const d=normDate(row?.work_date),p=personById(row?.staff_id),start=startDate(p);
    if(!d) return false;
    return !start || d>=start;
  }
  function activeStaff(){
    return (S()?.staff||[]).filter(p=>{
      const raw=Object.prototype.hasOwnProperty.call(p||{},'is_active')?p.is_active:p?.active;
      const inactive=raw===false||['false','0','no','off','ปิด'].includes(String(raw??'').trim().toLowerCase());
      return !inactive&&String(p?.staff_type||'').trim()!=='แพทย์'&&!p?.maternity_status;
    });
  }
  function personByRow(row){
    const label=text(row?.cells?.[0]);
    if(!label)return null;
    return activeStaff().find(p=>{
      const names=[p?.nickname,p?.full_name,p?.email].filter(Boolean).map(x=>String(x).trim());
      return names.some(n=>label===n||label.startsWith(n+' ')||label.includes(n));
    })||null;
  }
  function roomBucket(row){
    const code=String(row?.position_code||'').trim().toUpperCase();
    const zone=String(row?.zone||'').trim().toLowerCase();
    if(zone.includes('ออกหน่วย')||row?.is_outing===true)return 'outing';
    if(code.startsWith('DR-'))return 'donor';
    if(code.startsWith('BB-'))return 'bb';
    if(zone.includes('donor')||zone.includes('บริจาค'))return 'donor';
    return 'bb';
  }
  function rowsForPerson(rows,p){return (rows||[]).filter(r=>normId(r?.staff_id)===normId(p?.id)&&countable(r));}
  function setCell(cell,value){
    if(!cell)return;
    const v=Math.max(0,Math.round(Number(value)||0));
    if(text(cell)!==String(v))cell.textContent=String(v);
    if(cell.dataset?.v470Group){
      cell.classList.toggle('v470-never',v===0);
      cell.title=v===0?'ยังไม่เคยอยู่ตำแหน่งนี้':'';
    }
  }
  function setTotal(cell,value){
    if(!cell)return;
    const v=Math.max(0,Math.round(Number(value)||0));
    if(num(cell.textContent)!==v)cell.innerHTML=`<b>${v}</b>`;
  }
  function decoratePersonCell(row,p){
    const cell=row?.cells?.[0],start=startDate(p);if(!cell)return;
    let badge=cell.querySelector('.v476-start-badge');
    const key=monthKey();
    if(start&&`${key}-01`<start){
      if(!badge){badge=document.createElement('small');badge.className='v476-start-badge';cell.appendChild(badge);}
      const [y,m,d]=start.split('-');
      badge.textContent=`เริ่มนับ ${Number(d)}/${Number(m)}/${Number(y)+543}`;
      cell.title='ช่วงก่อนวันเริ่มเป็นตัวจริงเป็นช่วงฝึก/พี่เลี้ยง จึงไม่นับสถิติตำแหน่ง';
    }else if(badge){badge.remove();cell.removeAttribute('title');}
  }
  function updateZoneTable(table,rows){
    if(!table?.tHead?.rows?.[0])return;
    [...(table.tBodies?.[0]?.rows||[])].forEach(row=>{
      const p=personByRow(row);if(!p)return;
      const own=rowsForPerson(rows,p),counts={bb:0,donor:0,outing:0};
      own.forEach(r=>counts[roomBucket(r)]++);
      const head=[...table.tHead.rows[0].cells].map(c=>text(c).toLowerCase());
      const idxBB=head.findIndex(x=>x==='bb');
      const idxDonor=head.findIndex(x=>x==='donor');
      const idxOut=head.findIndex(x=>x.includes('ออกหน่วย'));
      if(idxBB>0)setCell(row.cells[idxBB],counts.bb);
      if(idxDonor>0)setCell(row.cells[idxDonor],counts.donor);
      if(idxOut>0)setCell(row.cells[idxOut],counts.outing);
      setTotal(row.cells[row.cells.length-1],own.length);
      decoratePersonCell(row,p);
    });
  }
  function updateDetailTable(table,rows){
    if(!table?.tHead?.rows?.[0])return;
    const headers=[...table.tHead.rows[0].cells];
    const codes=headers.slice(1,-1).map(c=>String(c.dataset?.v470Code||text(c)).trim());
    [...(table.tBodies?.[0]?.rows||[])].forEach(row=>{
      const p=personByRow(row);if(!p)return;
      const own=rowsForPerson(rows,p),counts=new Map();
      own.forEach(r=>{const c=String(r?.position_code||'').trim();counts.set(c,(counts.get(c)||0)+1);});
      let total=0;
      codes.forEach((code,i)=>{const v=counts.get(code)||0;total+=v;setCell(row.cells[i+1],v);});
      setTotal(row.cells[row.cells.length-1],total);
      decoratePersonCell(row,p);
    });
  }
  function updateBadge(rows){
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    if(!heading)return;
    const badge=[...(heading.querySelectorAll('.badge')||[])].find(el=>text(el).includes('ข้อมูลสะสม'));
    if(!badge)return;
    const count=(rows||[]).filter(countable).length;
    badge.textContent=`ข้อมูลสะสม ${count.toLocaleString('th-TH')} รายการ`;
    badge.title='ไม่นับตำแหน่งที่เกิดก่อนวันเริ่มเป็นตัวจริง/จัดตำแหน่งกลางวันของเจ้าหน้าที่';
  }
  async function getLifetimeRows(){
    try{
      const rows=await window.cnmiV278?.loadLifetimePositions?.(false);
      if(Array.isArray(rows))lifetimeRowsCache=rows;
    }catch(e){console.warn(VERSION,'lifetime rows',e);}
    return lifetimeRowsCache||[];
  }
  async function apply(){
    if(running||page()!=='positionMonth'||!isAdminSafe())return;
    const stats=document.querySelector('.v278-admin-position-stats');if(!stats)return;
    running=true;
    try{
      const key=monthKey();
      let monthRows=(S()?.positions||[]).filter(r=>normDate(r?.work_date).startsWith(key));
      try{monthRows=window.cnmiV272?.operationalRows?.(monthRows)||monthRows;}catch(_){ }
      const lifeRows=await getLifetimeRows();
      const cards=[...stats.querySelectorAll('.v278-position-stat-card')];
      if(cards[0])updateZoneTable(cards[0].querySelector('.v278-zone-table'),monthRows);
      if(cards[1])updateDetailTable(cards[1].querySelector('.v278-position-detail-table'),monthRows);
      if(cards[2])updateZoneTable(cards[2].querySelector('.v278-zone-table'),lifeRows);
      if(cards[3])updateDetailTable(cards[3].querySelector('.v278-position-detail-table'),lifeRows);
      updateBadge(lifeRows);
      stats.dataset.v476Gated=key;
    }finally{running=false;}
  }
  function schedule(delay=60){clearTimeout(timer);timer=setTimeout(()=>apply(),delay);}

  function wrapApi(){
    const api=window.cnmiV278;if(!api||api.__v476Wrapped)return false;
    const oldRefresh=api.refreshAdminPositionStats;
    if(typeof oldRefresh==='function')api.refreshAdminPositionStats=function(){const r=oldRefresh.apply(this,arguments);schedule(40);return r;};
    const oldLoad=api.loadLifetimePositions;
    if(typeof oldLoad==='function')api.loadLifetimePositions=async function(){const r=await oldLoad.apply(this,arguments);if(Array.isArray(r))lifetimeRowsCache=r;schedule(30);return r;};
    api.__v476Wrapped=true;
    return true;
  }

  const style=document.createElement('style');
  style.id='v476-position-stats-regular-start-style';
  style.textContent=`
    .v476-start-badge{display:inline-flex;margin-left:5px;padding:2px 5px;border-radius:999px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:7px;font-weight:850;white-space:nowrap;vertical-align:middle}
    @media(max-width:820px){.v476-start-badge{font-size:6.5px;padding:2px 4px;margin-left:3px}}
  `;
  document.head.appendChild(style);

  const root=document.getElementById('pageContent')||document.body;
  new MutationObserver(muts=>{
    if(page()!=='positionMonth')return;
    const relevant=muts.some(m=>[...(m.addedNodes||[])].some(n=>n?.nodeType===1&&(n.matches?.('.v278-admin-position-stats')||n.querySelector?.('.v278-admin-position-stats'))));
    if(relevant)schedule(80);
  }).observe(root,{subtree:true,childList:true});

  document.addEventListener('change',e=>{
    if(e.target?.matches?.('[data-v275-position-select],#positionMonthInput'))schedule(120);
  },true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(80);});

  let tries=0;const hook=setInterval(()=>{tries++;if(wrapApi()||tries>40){clearInterval(hook);schedule(120);}},100);
  window.addEventListener('load',()=>{wrapApi();schedule(160);},{once:true});
  setTimeout(()=>{wrapApi();schedule(160);},0);

  window.cnmiV476={version:VERSION,apply,countable,startDate};
  console.info(`${VERSION} loaded`);
})();
