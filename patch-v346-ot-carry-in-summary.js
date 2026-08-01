/* CNMI Staff Planner V346 — show OT carry-in clearly in monthly summary
   - Reuses the V318 carry snapshot; no new table, SQL, or background preload.
   - Loads carry only while the monthly summary/export table is visible.
   - Makes the HR calculation auditable: current + carry-in = available,
     then whole 8-hour claims + carry-out.
*/
(function(){
  'use strict';
  const VERSION='V346_OT_CARRY_IN_SUMMARY';
  if(window.__CNMI_V346_OT_CARRY_IN_SUMMARY__)return;
  window.__CNMI_V346_OT_CARRY_IN_SUMMARY__=true;

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  let hydrationToken=0;

  function st(){try{return state;}catch(_){return window.state||{};}}
  function esc(v){
    try{return escapeHtml(v==null?'':String(v));}
    catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function monthKey(){
    const raw=String(st().otSourceMonthV241||st().otMoneyMonthV241||st().monthKey||'').slice(0,7);
    if(/^\d{4}-\d{2}$/.test(raw))return raw;
    const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function round2(v){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
  function fmt(v){const n=round2(v);return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');}
  function readNumber(cell){
    const raw=String(cell?.textContent||'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    return raw?round2(raw[0]):0;
  }
  function thaiMonth(key){
    const names=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const [y,m]=String(key||'').split('-').map(Number);
    return y&&m?`${names[m-1]} ${y+543}`:'รอบก่อน';
  }
  function cell(value,cls,title){return `<td class="${cls}"${title?` title="${esc(title)}"`:''}><b>${esc(fmt(value))}</b></td>`;}

  function prepareTable(table){
    if(!table||table.dataset.v346Prepared==='1')return;
    const headers=Array.from(table.querySelectorAll('thead th'));
    if(headers.length<8)return;
    const hrIndex=headers.findIndex(th=>(th.textContent||'').trim()==='ชั่วโมงเบิก HR');
    const carryOutIndex=headers.findIndex(th=>(th.textContent||'').includes('OT ทบไปรอบหน้า'));
    if(hrIndex<0||carryOutIndex<0)return;
    headers[hrIndex].textContent='OT เดือนนี้เทียบ HR';
    headers[hrIndex].title='ชั่วโมง OT ของเดือนนี้หลังแปลงตามฐาน HR ยังไม่รวมยอดทบจากรอบก่อน';
    headers[carryOutIndex].insertAdjacentHTML('beforebegin','<th class="v346-carry-in-head">OT ทบมาจากรอบก่อน</th><th class="v346-available-head">รวมพร้อมเบิก HR</th><th class="v346-claimed-head">เบิก HR รอบนี้</th>');
    Array.from(table.querySelectorAll('tbody tr')).forEach(row=>{
      const cells=row.children;
      if(!cells[hrIndex]||!cells[carryOutIndex])return;
      row.dataset.v346CurrentHr=String(readNumber(cells[hrIndex]));
      cells[carryOutIndex].insertAdjacentHTML('beforebegin',cell(0,'v346-carry-in','กำลังตรวจสอบยอดทบจากรอบก่อน')+cell(readNumber(cells[hrIndex]),'v346-available','OT เดือนนี้ + ยอดทบจากรอบก่อน')+cell(Math.floor((readNumber(cells[hrIndex])+1e-7)/8)*8,'v346-claimed','เบิกเป็นชุดละ 8 ชั่วโมง'));
    });
    table.dataset.v346Prepared='1';
  }

  function prepareVisibleTables(){
    document.querySelectorAll('.v241-real-month-section .v241-ot-summary-table table, .v241-hr-export-section .v241-ot-summary-table table').forEach(prepareTable);
  }
  function updateRows(carryMap){
    document.querySelectorAll('table[data-v346-prepared="1"] tbody tr').forEach(row=>{
      const staffId=row.querySelector('[data-v234-show-staff]')?.getAttribute('data-v234-show-staff')||'';
      const info=carryMap instanceof Map?carryMap.get(String(staffId)):null;
      const carryIn=round2(info?.amount||0),current=round2(row.dataset.v346CurrentHr||0),available=round2(current+carryIn);
      const claimed=Math.floor((available+1e-7)/8)*8,carryOut=round2(Math.max(0,available-claimed));
      const carryCell=row.querySelector('.v346-carry-in'),availableCell=row.querySelector('.v346-available'),claimedCell=row.querySelector('.v346-claimed');
      if(carryCell){carryCell.innerHTML=`<b>${esc(fmt(carryIn))}</b>${carryIn>0?`<small>${esc(thaiMonth(info?.sourceMonth))}</small>`:''}`;carryCell.title=carryIn>0?`ยอดทบจาก ${thaiMonth(info?.sourceMonth)}`:'ไม่มียอดทบจากรอบก่อน';}
      if(availableCell){availableCell.innerHTML=`<b>${esc(fmt(available))}</b>`;availableCell.title=`${fmt(current)} + ${fmt(carryIn)} = ${fmt(available)} ชั่วโมง`;}
      if(claimedCell){claimedCell.innerHTML=`<b>${esc(fmt(claimed))}</b>`;claimedCell.title=`เบิกได้ ${Math.floor((available+1e-7)/8)} ชุด × 8 ชั่วโมง`;}
      const allCells=Array.from(row.children),carryOutHeader=Array.from(row.closest('table').querySelectorAll('thead th')).findIndex(th=>(th.textContent||'').includes('OT ทบไปรอบหน้า'));
      if(carryOutHeader>=0&&allCells[carryOutHeader]){allCells[carryOutHeader].innerHTML=`<b>${esc(fmt(carryOut))}</b>`;allCells[carryOutHeader].title=`${fmt(available)} − ${fmt(claimed)} = ${fmt(carryOut)} ชั่วโมง`;}
    });
  }
  function showLoadError(){
    document.querySelectorAll('.v346-carry-in').forEach(td=>{td.innerHTML='<span class="badge orange">โหลดไม่ได้</span>';td.title='ยังอ่านยอดทบจากรอบก่อนไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่';});
  }
  async function hydrate(){
    const token=++hydrationToken;
    await new Promise(resolve=>setTimeout(resolve,0));
    if(token!==hydrationToken)return;
    prepareVisibleTables();
    if(!document.querySelector('table[data-v346-prepared="1"]'))return;
    try{
      const api=window.cnmiV318;
      if(!api||typeof api.queryCarryInSummary!=='function')throw new Error('ไม่พบตัวอ่านยอดทบ V318');
      const map=await api.queryCarryInSummary(monthKey());
      if(token!==hydrationToken)return;
      updateRows(map);
    }catch(err){console.error(`[${VERSION}] carry-in hydration failed`,err);if(token===hydrationToken)showLoadError();}
  }

  if(previousRenderOtPage){
    const wrapped=function renderOtPageV346(){const html=previousRenderOtPage.apply(this,arguments);const active=st().otSubtabV241||'mine';if(active==='summary'||active==='export')hydrate();return html;};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }
  document.addEventListener('change',e=>{if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='otSourceMonthV241')setTimeout(hydrate,20);},true);
  document.addEventListener('click',e=>{const tab=e.target?.closest?.('[data-ot-subtab-v241]');if(tab&&['summary','export'].includes(tab.getAttribute('data-ot-subtab-v241')))setTimeout(hydrate,20);},true);

  const style=document.createElement('style');
  style.textContent='.v346-carry-in,.v346-available,.v346-claimed{white-space:nowrap}.v346-carry-in{background:#fff8e8}.v346-available{background:#eef8ff}.v346-claimed{background:#effbf4}.v346-carry-in small{display:block;margin-top:2px;color:#8a5a00;font-size:11px;font-weight:500}.v346-carry-in-head{background:#fff3d6!important}.v346-available-head{background:#e5f5ff!important}.v346-claimed-head{background:#e7f8ee!important}';
  document.head.appendChild(style);
  window.cnmiV346={version:VERSION,hydrate};
  console.info(`[${VERSION}] loaded`);
})();
