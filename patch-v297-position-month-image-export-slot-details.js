
/* CNMI Staff Planner V383
   Position-month image export
   - moves staff names to a left legend so day 31 is never covered
   - keeps staff color bars in the exported image
   - exports full month grid + position descriptions
*/
(function(){
  'use strict';
  const VERSION='V383_POSITION_MONTH_EXPORT_LEFT_LEGEND_STAFF_COLORS';
  if(window.__CNMI_V297_POSITION_MONTH_IMAGE_EXPORT_SLOT_DETAILS__)return;
  window.__CNMI_V297_POSITION_MONTH_IMAGE_EXPORT_SLOT_DETAILS__=true;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console[tone==='error'?'error':'log'](msg);}}
  function activeKey(){const st=S();return st?.page==='positionMonthView'?(st.positionMonthViewKey||st.monthKey):(st?.positionMonthKey||st?.monthKey)||new Date().toISOString().slice(0,7);}
  function thaiMonth(key){try{const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key;}}
  function safeFileName(key){return `position_month_${key}_ตารางตำแหน่งกลางวัน.png`.replace(/[\/:*?"<>|]+/g,'-');}
  function daysInMonth(key){try{const [y,m]=String(key||'').split('-').map(Number);return y&&m?new Date(y,m,0).getDate():31;}catch(_){return 31;}}
  function nextFrames(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}

  function positionMasters(){
    const st=S();
    const rows=[];
    (st?.positionMasters||[]).forEach(r=>rows.push(r));
    try{(window.cnmiV224?.currentMasters?.()||[]).forEach(r=>rows.push(r));}catch(_){/* noop */}
    return rows;
  }
  function positionCode(row){return String(row?.code||row?.position_code||'').trim();}
  function positionDetail(code,key){
    const st=S();
    const master=positionMasters().find(r=>positionCode(r)===code);
    const saved=(st?.positions||[]).find(r=>String(r?.position_code||'').trim()===code&&normDate(r?.work_date).startsWith(key));
    let fallback={};
    try{fallback=(typeof positionByCode==='function'?positionByCode(code):null)||{};}catch(_){/* noop */}
    const src={...fallback,...saved,...master};
    return {code,zone:src.zone||'-',break_time:src.break_time||'-',main_rule:src.main_rule||src.required_role||'-',job_desc:src.job_desc||src.description||'ยังไม่ได้ระบุรายละเอียดหน้าที่'};
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
  function brandHeader(key){
    return `<div class="v297-export-brand-header">
      <div class="v297-export-logo" aria-hidden="true"><b>BB</b><small>CNMI</small></div>
      <div class="v297-export-brand-copy">
        <p>เวชศาสตร์บริการโลหิต</p>
        <h2>ตารางตำแหน่งกลางวัน รายเดือน</h2>
        <span>เดือน ${esc(thaiMonth(key))}</span>
      </div>
    </div>`;
  }
  function removeColumn(table,index){table.querySelectorAll('tr').forEach(tr=>{const cells=tr.children;if(cells[index])cells[index].remove();});}
  function plainText(node){return String(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();}
  function buildStaffLegendMarkup(liveTable){
    const rows=[...liveTable.querySelectorAll('tbody tr')].filter(row=>!row.classList.contains('v275-count-row'));
    const items=rows.map(row=>{
      const nameCell=row.querySelector('.v275-sticky-name');
      if(!nameCell)return null;
      const name=nameCell.querySelector('b')?.textContent?.trim()||plainText(nameCell)||'-';
      const sub=nameCell.querySelector('small')?.textContent?.trim()||'';
      const style=nameCell.getAttribute('style')||'';
      const summaryCell=row.querySelector('.v275-sticky-summary');
      let summary=plainText(summaryCell);
      summary=summary.replace(/^\s*สรุปวันนี้\s*/,'').trim();
      if(summary.length>54)summary=summary.slice(0,54)+'…';
      return {name,sub,style,summary};
    }).filter(Boolean);
    return `<aside class="v383-staff-legend"><div class="v383-staff-legend-title">เจ้าหน้าที่</div>${items.map(item=>`<div class="v383-staff-legend-item" style="${esc(item.style)}"><div class="v383-staff-legend-badge"><b>${esc(item.name)}</b>${item.sub?`<small>${esc(item.sub)}</small>`:''}</div>${item.summary?`<div class="v383-staff-legend-summary">${esc(item.summary)}</div>`:''}</div>`).join('')}</aside>`;
  }
  function normalizeExportTable(table){
    // Remove sticky name + summary columns from the main matrix.
    // The exported image will show them in a separate left legend instead.
    removeColumn(table,1);
    removeColumn(table,0);

    table.setAttribute('dir','ltr');
    table.style.setProperty('direction','ltr','important');
    table.querySelectorAll('select').forEach(select=>{const span=document.createElement('span');span.className='v297-export-position-text';span.textContent=select.value||'';select.replaceWith(span);});
    table.querySelectorAll('input').forEach(input=>{const span=document.createElement('span');span.className='v297-export-input-text';span.textContent=input.value||'-';input.replaceWith(span);});
    table.querySelectorAll('button.v275-info,[data-v275-status]').forEach(node=>node.remove());
    table.querySelectorAll('button').forEach(button=>{const span=document.createElement('span');span.className=button.className;span.textContent=button.textContent;button.replaceWith(span);});
    table.querySelectorAll('[style]').forEach(node=>{node.style.position='static';node.style.left='auto';node.style.right='auto';node.style.zIndex='auto';node.style.transform='none';});
    table.querySelectorAll('th,td').forEach(cell=>{cell.style.position='static';cell.style.left='auto';cell.style.right='auto';cell.style.zIndex='auto';cell.style.transform='none';});
  }
  function buildExportNode(){
    const key=activeKey();
    const live=document.querySelector('.v275-position-wrap .v275-position-table');
    if(!live)throw new Error('ไม่พบตารางตำแหน่งกลางวันรายเดือน');
    const sandbox=document.createElement('div');
    sandbox.dataset.v297ExportSandbox='1';
    sandbox.style.cssText='position:fixed;left:-100000px;top:0;z-index:-1;background:#f6f9fc;padding:24px;width:max-content;max-width:none;overflow:visible;';
    const sheet=document.createElement('div');sheet.className='v297-export-sheet';sheet.innerHTML=brandHeader(key);
    const main=document.createElement('div');main.className='v383-export-main';
    const legend=document.createElement('div');legend.className='v383-export-legend-wrap';legend.innerHTML=buildStaffLegendMarkup(live);main.appendChild(legend);
    const tableWrap=document.createElement('div');tableWrap.className='v297-export-table-wrap';
    const table=live.cloneNode(true);normalizeExportTable(table);tableWrap.appendChild(table);main.appendChild(tableWrap);
    sheet.appendChild(main);
    const descriptions=document.createElement('div');descriptions.innerHTML=descriptionMarkup(key);sheet.appendChild(descriptions.firstElementChild);
    sandbox.appendChild(sheet);document.body.appendChild(sandbox);
    return {key,sandbox,target:sheet};
  }
  function maxCellCount(table){return Math.max(0,...Array.from(table.rows||[]).map(row=>Array.from(row.cells||[]).length));}
  async function settleExportLayout(target,key){
    try{if(document.fonts?.ready)await document.fonts.ready;}catch(_){/* noop */}
    await nextFrames();
    const table=target.querySelector('.v297-export-table-wrap table');
    if(!table)throw new Error('ไม่พบตารางสำหรับ Export');
    const expected=daysInMonth(key);
    const colCount=maxCellCount(table);
    if(colCount<expected){
      throw new Error(`ตารางเดือนนี้สร้างได้เพียง ${colCount} วัน จาก ${expected} วัน กรุณารีเฟรชแล้ว Export ใหม่`);
    }
    const dayWidth=56;
    Array.from(table.rows||[]).forEach(row=>{
      Array.from(row.cells||[]).forEach((cell)=>{
        const px=dayWidth;
        cell.style.setProperty('width',`${px}px`,'important');
        cell.style.setProperty('min-width',`${px}px`,'important');
        cell.style.setProperty('max-width',`${px}px`,'important');
        cell.style.setProperty('box-sizing','border-box','important');
      });
    });
    const matrixWidth=(expected*dayWidth)+2;
    table.style.setProperty('width',`${matrixWidth}px`,'important');
    table.style.setProperty('min-width',`${matrixWidth}px`,'important');
    table.style.setProperty('max-width',`${matrixWidth}px`,'important');
    table.style.setProperty('table-layout','fixed','important');

    const legend=target.querySelector('.v383-staff-legend');
    const legendWidth=Math.max(150,Math.ceil(legend?.scrollWidth||legend?.getBoundingClientRect?.().width||150));
    const gap=14;
    const sheetWidth=legendWidth+gap+matrixWidth;

    target.querySelectorAll('.v297-export-table-wrap').forEach(el=>{
      el.style.setProperty('width',`${matrixWidth}px`,'important');
      el.style.setProperty('min-width',`${matrixWidth}px`,'important');
      el.style.setProperty('max-width',`${matrixWidth}px`,'important');
      el.style.setProperty('overflow','visible','important');
      el.style.setProperty('box-sizing','border-box','important');
    });
    target.querySelectorAll('.v383-export-main,.v297-position-description-card,.v297-position-description-wrap,.v297-position-description-table').forEach(el=>{
      el.style.setProperty('width',`${sheetWidth}px`,'important');
      el.style.setProperty('min-width',`${sheetWidth}px`,'important');
      el.style.setProperty('max-width',`${sheetWidth}px`,'important');
      el.style.setProperty('overflow','visible','important');
      el.style.setProperty('box-sizing','border-box','important');
    });
    target.style.setProperty('width',`${sheetWidth}px`,'important');
    target.style.setProperty('min-width',`${sheetWidth}px`,'important');
    target.style.setProperty('max-width',`${sheetWidth}px`,'important');
    const brand=target.querySelector('.v297-export-brand-header');
    if(brand){
      brand.style.setProperty('width',`${sheetWidth}px`,'important');
      brand.style.setProperty('min-width',`${sheetWidth}px`,'important');
      brand.style.setProperty('max-width',`${sheetWidth}px`,'important');
      brand.style.setProperty('box-sizing','border-box','important');
    }
    await nextFrames();
    return {matrixWidth,legendWidth,sheetWidth,captureWidth:Math.max(sheetWidth+4,target.scrollWidth,target.offsetWidth),captureHeight:Math.max(target.scrollHeight,target.offsetHeight,900)};
  }
  async function exportPositionMonthImage(){
    let sandbox=null;
    try{
      if(typeof window.html2canvas!=='function')throw new Error('ไม่พบไลบรารี html2canvas');
      const built=buildExportNode();sandbox=built.sandbox;
      const layout=await settleExportLayout(built.target,built.key);
      const width=Math.ceil(layout.captureWidth);
      const height=Math.ceil(layout.captureHeight);
      const canvas=await window.html2canvas(built.target,{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false,width,height,windowWidth:Math.max(width,1600),windowHeight:Math.max(height,900),scrollX:0,scrollY:0,onclone:doc=>{
        try{
          const cloned=doc.querySelector('.v297-export-sheet');
          if(!cloned)return;
          cloned.style.setProperty('width',`${layout.sheetWidth}px`,'important');
          cloned.style.setProperty('min-width',`${layout.sheetWidth}px`,'important');
          cloned.style.setProperty('max-width',`${layout.sheetWidth}px`,'important');
          cloned.querySelectorAll('.v383-export-main,.v297-export-table-wrap,.v297-position-description-card,.v297-position-description-wrap,.v297-position-description-table,.v297-export-brand-header,table').forEach(el=>{
            const widthPx=el.matches('.v297-export-table-wrap,table')?layout.matrixWidth:layout.sheetWidth;
            el.style.setProperty('width',`${widthPx}px`,'important');
            el.style.setProperty('min-width',`${widthPx}px`,'important');
            el.style.setProperty('max-width',`${widthPx}px`,'important');
            el.style.setProperty('overflow','visible','important');
          });
        }catch(_){/* noop */}
      }});
      const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download=safeFileName(built.key);document.body.appendChild(link);link.click();link.remove();
      toast('Export ตารางตำแหน่งทั้งเดือนพร้อมแถบชื่อเจ้าหน้าที่แล้ว');
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
    .v297-position-description-card{margin-top:16px;padding:18px;border:1px solid var(--line,#dce6f1);border-radius:22px;background:#fff;box-shadow:0 6px 18px rgba(15,23,42,.04)}
    .v297-position-description-card h3{margin:0}
    .v297-position-description-wrap{max-height:420px}
    .v297-position-description-table{min-width:1050px}
    .v297-position-description-table th,.v297-position-description-table td{vertical-align:top}
    .v297-job-cell{white-space:normal;min-width:320px;line-height:1.5}
    .v297-export-sheet{display:block;width:max-content;max-width:none;background:#ffffff;color:#203245;padding:0;margin:0;font-family:Sarabun,Kanit,sans-serif}
    .v297-export-brand-header{display:flex;align-items:center;gap:18px;margin:0 0 16px;padding:14px 18px;border:1px solid #d7e5f6;border-radius:22px;background:linear-gradient(180deg,#f8fbff,#ffffff);box-shadow:0 10px 24px rgba(37,99,235,.08)}
    .v297-export-logo{width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#8fd0ff,#4aa3ff);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 10px 22px rgba(74,163,255,.26)}
    .v297-export-logo b{font-size:27px;line-height:1}
    .v297-export-logo small{font-size:10px;letter-spacing:1.2px;margin-top:5px;font-weight:800}
    .v297-export-brand-copy p{margin:0;color:#2563eb;font-weight:800}
    .v297-export-brand-copy h2{margin:2px 0;font-size:22px}
    .v297-export-brand-copy span{color:#5b6b7f;font-weight:700}
    .v383-export-main{display:flex;align-items:flex-start;gap:14px}
    .v383-export-legend-wrap{flex:0 0 auto}
    .v383-staff-legend{padding:10px;border:1px solid #dce6f1;border-radius:20px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.04)}
    .v383-staff-legend-title{font-weight:800;font-size:14px;margin:2px 0 8px;color:#1e3a5f}
    .v383-staff-legend-item{display:flex;flex-direction:column;gap:3px;padding:5px 6px;border-radius:12px;background:#f8fbff;border:1px solid rgba(191,215,245,.65);margin-bottom:6px}
    .v383-staff-legend-badge{display:flex;flex-direction:column;gap:1px;padding:5px 8px;border-radius:999px;background:var(--staff-bg,#eaf2ff);color:var(--staff-fg,#17324d);font-weight:800}
    .v383-staff-legend-badge b{font-size:11px;line-height:1.1}
    .v383-staff-legend-badge small{font-size:8px;line-height:1.1;opacity:.88}
    .v383-staff-legend-summary{font-size:8px;line-height:1.25;color:#667085;padding:0 2px}
    .v297-export-table-wrap{overflow:visible;width:max-content;max-width:none;background:#fff;border:1px solid #dce6f1;border-radius:20px;padding:8px;box-shadow:0 8px 20px rgba(15,23,42,.04)}
    .v297-export-table-wrap table{width:max-content!important;max-width:none!important;table-layout:auto!important;border-collapse:separate;direction:ltr!important}
    .v297-export-table-wrap th,.v297-export-table-wrap td{position:static!important;left:auto!important;right:auto!important;z-index:auto!important;text-align:center!important}
    .v297-export-table-wrap th:first-child,.v297-export-table-wrap td:first-child{font-weight:800}
    .v297-export-position-text{display:inline-block;padding:3px 6px;border-radius:999px;background:#edf5ff;color:#2563eb;font-weight:700;white-space:nowrap}
    .v297-export-input-text{font-weight:800}
    .v297-export-sheet .v297-position-description-card{width:100%;box-sizing:border-box}
    .v297-export-sheet .v297-position-description-wrap{overflow:visible!important;max-height:none!important}
    .v297-export-sheet .v297-position-description-table{width:100%;min-width:0}
  `;document.head.appendChild(style);
  queue();
  console.info(`${VERSION} loaded`);
})();
