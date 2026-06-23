/* CNMI Staff Planner V297
   Position-month image export + visible slot descriptions.
   Built as an additive patch on top of the complete V296 package.
*/
(function(){
  'use strict';
  const VERSION='V297_POSITION_MONTH_IMAGE_EXPORT_SLOT_DETAILS';
  if(window.__CNMI_V297_POSITION_MONTH_IMAGE_EXPORT_SLOT_DETAILS__)return;
  window.__CNMI_V297_POSITION_MONTH_IMAGE_EXPORT_SLOT_DETAILS__=true;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console[tone==='error'?'error':'log'](msg);}}
  function activeKey(){const st=S();return st?.page==='positionMonthView'?(st.positionMonthViewKey||st.monthKey):(st?.positionMonthKey||st?.monthKey)||new Date().toISOString().slice(0,7);}
  function thaiMonth(key){try{const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key;}}
  function safeFileName(key){return `position_schedule_${key}_ตารางทั้งเดือน.png`.replace(/[\/:*?"<>|]+/g,'-');}
  function positionMasters(){
    const st=S();
    const rows=[];
    (st?.positionMasters||[]).forEach(r=>rows.push(r));
    try{(window.cnmiV224?.currentMasters?.()||[]).forEach(r=>rows.push(r));}catch(_){}
    return rows;
  }
  function positionCode(row){return String(row?.code||row?.position_code||'').trim();}
  function positionDetail(code,key){
    const st=S();
    const master=positionMasters().find(r=>positionCode(r)===code);
    const saved=(st?.positions||[]).find(r=>String(r?.position_code||'').trim()===code&&normDate(r?.work_date).startsWith(key));
    let fallback={};
    try{fallback=(typeof positionByCode==='function'?positionByCode(code):null)||{};}catch(_){}
    const src={...fallback,...saved,...master};
    return {
      code,
      zone:src.zone||'-',
      break_time:src.break_time||'-',
      main_rule:src.main_rule||src.required_role||'-',
      job_desc:src.job_desc||src.description||'ยังไม่ได้ระบุรายละเอียดหน้าที่'
    };
  }
  function compactDays(values){
    const nums=[...new Set((values||[]).map(v=>Number(String(v).slice(-2))).filter(Number.isFinite))].sort((a,b)=>a-b);
    if(!nums.length)return '-';
    const out=[];let start=nums[0],prev=nums[0];
    for(let i=1;i<=nums.length;i++){
      const n=nums[i];
      if(n===prev+1){prev=n;continue;}
      out.push(start===prev?String(start):`${start}-${prev}`);
      start=n;prev=n;
    }
    return out.join(', ');
  }
  function usedPositionMap(key){
    const map=new Map();
    const add=(code,date)=>{code=String(code||'').trim();date=normDate(date);if(!code||!date.startsWith(key))return;if(!map.has(code))map.set(code,new Set());map.get(code).add(date);};
    (S()?.positions||[]).forEach(r=>add(r?.position_code,r?.work_date));
    document.querySelectorAll('.v275-position-wrap [data-v275-position-cell]').forEach(cell=>add(cell.querySelector('[data-v275-position-select]')?.value,cell.dataset.date));
    return map;
  }
  function descriptionMarkup(key){
    const used=usedPositionMap(key);
    const rows=[...used.entries()].map(([code,dates])=>({...positionDetail(code,key),dates:[...dates]})).sort((a,b)=>a.code.localeCompare(b.code,'th'));
    return `<section class="v297-position-description-card" data-v297-position-descriptions>
      <div class="section-title"><div><h3>คำอธิบายตำแหน่งที่ใช้ในตาราง</h3><p class="hint">แสดงรายละเอียดของ Slot และวันที่ที่มีตำแหน่งนั้นในเดือนนี้</p></div></div>
      ${rows.length?`<div class="table-wrap v297-position-description-wrap"><table class="v297-position-description-table"><thead><tr><th>ตำแหน่ง</th><th>วันที่ใช้</th><th>โซน</th><th>เวลาพัก</th><th>ผู้ปฏิบัติหลัก / เงื่อนไข</th><th>รายละเอียดหน้าที่</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.code)}</b></td><td>${esc(compactDays(r.dates))}</td><td>${esc(r.zone)}</td><td>${esc(r.break_time)}</td><td>${esc(r.main_rule)}</td><td class="v297-job-cell">${esc(r.job_desc)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">เดือนนี้ยังไม่มีตำแหน่งในตาราง</div>'}
    </section>`;
  }
  function brandHeader(key){return `<div class="v297-export-brand-header"><div class="v297-export-logo"><b>BB</b><small>CNMI</small></div><div><p>เวชศาสตร์บริการโลหิต</p><h2>ตารางตำแหน่งกลางวัน รายเดือน</h2><span>เดือน ${esc(thaiMonth(key))}</span></div></div>`;}
  function removeColumn(table,index){
    table.querySelectorAll('tr').forEach(tr=>{const cells=tr.children;if(cells[index])cells[index].remove();});
  }
  function normalizeExportTable(table){
    removeColumn(table,1); // Export แบบเดียวกับตารางเวร: ชื่อเจ้าหน้าที่ + วันที่ทั้งเดือน
    table.querySelectorAll('select').forEach(select=>{const span=document.createElement('span');span.className='v297-export-position-text';span.textContent=select.value||'';select.replaceWith(span);});
    table.querySelectorAll('input').forEach(input=>{const span=document.createElement('span');span.className='v297-export-input-text';span.textContent=input.value||'-';input.replaceWith(span);});
    table.querySelectorAll('button.v275-info,[data-v275-status]').forEach(node=>node.remove());
    table.querySelectorAll('button').forEach(button=>{const span=document.createElement('span');span.className=button.className;span.textContent=button.textContent;button.replaceWith(span);});
    table.querySelectorAll('[style]').forEach(node=>{node.style.position='static';node.style.left='auto';node.style.right='auto';node.style.zIndex='auto';});
    table.querySelectorAll('th,td').forEach(cell=>{cell.style.position='static';cell.style.left='auto';cell.style.zIndex='auto';});
  }
  function buildExportNode(){
    const key=activeKey();
    const live=document.querySelector('.v275-position-wrap .v275-position-table');
    if(!live)throw new Error('ไม่พบตารางตำแหน่งกลางวันรายเดือน');
    const sandbox=document.createElement('div');
    sandbox.dataset.v297ExportSandbox='1';
    sandbox.style.cssText='position:fixed;left:-100000px;top:0;z-index:-1;background:#fff;padding:24px;width:max-content;max-width:none;';
    const sheet=document.createElement('div');sheet.className='v297-export-sheet';sheet.innerHTML=brandHeader(key);
    const tableWrap=document.createElement('div');tableWrap.className='v297-export-table-wrap';
    const table=live.cloneNode(true);normalizeExportTable(table);tableWrap.appendChild(table);sheet.appendChild(tableWrap);
    const descriptions=document.createElement('div');descriptions.innerHTML=descriptionMarkup(key);sheet.appendChild(descriptions.firstElementChild);
    sandbox.appendChild(sheet);document.body.appendChild(sandbox);
    return {key,sandbox,target:sheet};
  }
  async function exportPositionMonthImage(){
    let sandbox=null;
    try{
      if(typeof window.html2canvas!=='function')throw new Error('ไม่พบไลบรารี html2canvas');
      const built=buildExportNode();sandbox=built.sandbox;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const target=built.target,width=Math.max(target.scrollWidth,target.offsetWidth,1400),height=Math.max(target.scrollHeight,target.offsetHeight,700);
      const canvas=await window.html2canvas(target,{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false,width,height,windowWidth:width,windowHeight:height,scrollX:0,scrollY:0});
      const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download=safeFileName(built.key);document.body.appendChild(link);link.click();link.remove();
      toast('Export ตารางตำแหน่งทั้งเดือนพร้อมคำอธิบายแล้ว');
    }catch(error){console.error(VERSION,error);toast(error?.message||'Export รูปภาพไม่สำเร็จ','error');}
    finally{sandbox?.remove();document.querySelector('[data-v297-export-sandbox="1"]')?.remove();}
  }
  function enhance(){
    const st=S();if(!['positionMonth','positionMonthView'].includes(st?.page))return;
    const page=document.querySelector('.v275-page');const wrap=page?.querySelector('.v275-position-wrap');if(!page||!wrap)return;
    const toolbar=page.querySelector('.card .toolbar');
    if(toolbar&&!toolbar.querySelector('[data-v297-export-position-image]')){
      const button=document.createElement('button');button.type='button';button.className='ghost-btn';button.dataset.v297ExportPositionImage='1';button.textContent='Export เป็นรูปภาพ (Download Image)';toolbar.appendChild(button);
    }
    const key=activeKey();
    const current=page.querySelector('[data-v297-position-descriptions]');
    const holder=document.createElement('div');holder.innerHTML=descriptionMarkup(key);const next=holder.firstElementChild;
    if(current)current.replaceWith(next);else wrap.insertAdjacentElement('afterend',next);
  }
  let queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});}
  document.addEventListener('click',e=>{const btn=e.target?.closest?.('[data-v297-export-position-image]');if(!btn)return;e.preventDefault();e.stopPropagation();exportPositionMonthImage();},true);
  document.addEventListener('change',e=>{if(e.target?.closest?.('.v275-position-wrap'))setTimeout(queue,500);},true);
  const observer=new MutationObserver(mutations=>{if(mutations.some(m=>[...m.addedNodes].some(n=>n?.nodeType===1&&(n.matches?.('.v275-page,.v275-position-wrap')||n.querySelector?.('.v275-page,.v275-position-wrap')))))queue();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.exportPositionMonthImageV297=exportPositionMonthImage;
  const style=document.createElement('style');style.id='v297-position-image-style';style.textContent=`
    .v297-position-description-card{margin-top:14px;padding:16px;border:1px solid var(--line,#dce6f1);border-radius:22px;background:#fff}
    .v297-position-description-card h3{margin:0}.v297-position-description-wrap{max-height:420px}.v297-position-description-table{min-width:1050px}.v297-position-description-table th,.v297-position-description-table td{vertical-align:top}.v297-job-cell{white-space:normal;min-width:320px;line-height:1.5}
    .v297-export-sheet{display:block;width:max-content;max-width:none;background:#fff;color:#203245;padding:0;margin:0;font-family:Sarabun,Kanit,sans-serif}
    .v297-export-brand-header{display:flex;align-items:center;gap:16px;margin:0 0 16px;padding:12px 16px;border:1px solid #d7e5f6;border-radius:20px;background:linear-gradient(180deg,#f8fbff,#fff)}
    .v297-export-logo{width:78px;height:78px;border-radius:50%;background:linear-gradient(135deg,#8fd0ff,#4aa3ff);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 8px 18px rgba(74,163,255,.22)}
    .v297-export-logo b{font-size:27px;line-height:1}.v297-export-logo small{font-size:10px;letter-spacing:1.2px;margin-top:5px;font-weight:800}.v297-export-brand-header p{margin:0;color:#2563eb;font-weight:800}.v297-export-brand-header h2{margin:2px 0;font-size:22px}.v297-export-brand-header span{color:#5b6b7f;font-weight:700}
    .v297-export-table-wrap{overflow:visible;width:max-content;max-width:none}.v297-export-table-wrap table{width:max-content!important;max-width:none!important;table-layout:auto!important;border-collapse:separate}.v297-export-table-wrap th,.v297-export-table-wrap td{position:static!important;left:auto!important;z-index:auto!important}
    .v297-export-position-text{display:inline-block;padding:2px 5px;border-radius:8px;background:#edf5ff;color:#2563eb;font-weight:700;white-space:nowrap}.v297-export-input-text{font-weight:800}.v297-export-sheet .v297-position-description-card{width:100%;box-sizing:border-box}.v297-export-sheet .v297-position-description-wrap{overflow:visible!important;max-height:none!important}.v297-export-sheet .v297-position-description-table{width:100%;min-width:0}
  `;document.head.appendChild(style);
  queue();
  console.info(`${VERSION} loaded`);
})();
