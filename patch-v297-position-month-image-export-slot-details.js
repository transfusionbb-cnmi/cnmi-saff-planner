/* CNMI Staff Planner V384
   Beautiful monthly position image export
   - keeps staff name + summary as the first two columns of the SAME table
   - preserves each staff member's color bar
   - forces date columns into chronological order (1 -> last day)
   - removes sticky/scroll UI only inside the hidden export layout
   - exports the full month and the position-description table
*/
(function(){
  'use strict';
  const VERSION='V384_POSITION_MONTH_BEAUTIFUL_EXPORT';
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
    const add=(code,date)=>{
      code=String(code||'').trim();date=normDate(date);
      if(!code||!date.startsWith(key))return;
      if(!map.has(code))map.set(code,new Set());
      map.get(code).add(date);
    };
    (S()?.positions||[]).forEach(r=>add(r?.position_code,r?.work_date));
    document.querySelectorAll('.v275-position-wrap [data-v275-position-cell]').forEach(cell=>add(cell.querySelector('[data-v275-position-select]')?.value,cell.dataset.date));
    return map;
  }
  function descriptionMarkup(key){
    const used=usedPositionMap(key);
    const rows=[...used.entries()]
      .map(([code,dates])=>({...positionDetail(code,key),dates:[...dates]}))
      .sort((a,b)=>a.code.localeCompare(b.code,'th'));
    return `<section class="v297-position-description-card" data-v297-position-descriptions>
      <div class="section-title"><div><h3>คำอธิบายตำแหน่งที่ใช้ในตาราง</h3><p class="hint">แสดงรายละเอียดตำแหน่งที่มีการใช้งานในเดือนนี้</p></div></div>
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

  function parseDayNumber(cell){
    const text=String(cell?.innerText||cell?.textContent||'').trim();
    const match=text.match(/^(\d{1,2})/);
    const day=match?Number(match[1]):NaN;
    return Number.isInteger(day)&&day>=1&&day<=31?day:null;
  }
  function reorderDateColumns(table,key){
    const expected=daysInMonth(key);
    const rows=Array.from(table.rows||[]);
    if(!rows.length)return false;
    const header=rows.reduce((best,row)=>row.cells.length>best.cells.length?row:best,rows[0]);
    const headerCells=Array.from(header.cells||[]);
    if(headerCells.length<expected+2)return false;

    const dayIndex=new Map();
    headerCells.forEach((cell,index)=>{
      if(index<2)return;
      const day=parseDayNumber(cell);
      if(day&&!dayIndex.has(day))dayIndex.set(day,index);
    });
    if(dayIndex.size<expected)return false;

    rows.forEach(row=>{
      const cells=Array.from(row.cells||[]);
      if(cells.length<expected+2)return;
      const ordered=[cells[0],cells[1]];
      for(let day=1;day<=expected;day++)ordered.push(cells[dayIndex.get(day)]);
      ordered.filter(Boolean).forEach(cell=>row.appendChild(cell));
    });
    return true;
  }
  function replaceControls(table){
    table.querySelectorAll('select').forEach(select=>{
      const span=document.createElement('span');
      span.className='v297-export-position-text';
      span.textContent=select.value||'';
      select.replaceWith(span);
    });
    table.querySelectorAll('input').forEach(input=>{
      const span=document.createElement('span');
      span.className='v297-export-input-text';
      span.textContent=input.value||'-';
      input.replaceWith(span);
    });
    table.querySelectorAll('button.v275-info,[data-v275-status]').forEach(node=>node.remove());
    table.querySelectorAll('button').forEach(button=>{
      const span=document.createElement('span');
      span.className=button.className;
      span.textContent=button.textContent;
      button.replaceWith(span);
    });
  }
  function normalizeExportTable(table,key){
    reorderDateColumns(table,key);
    replaceControls(table);

    table.setAttribute('dir','ltr');
    table.style.setProperty('direction','ltr','important');
    table.querySelectorAll('thead,tbody,tr,th,td').forEach(node=>node.style.setProperty('direction','ltr','important'));

    table.querySelectorAll('.v275-sticky-name').forEach(cell=>{
      cell.classList.remove('v275-sticky-name');
      cell.classList.add('v384-export-name-cell');
    });
    table.querySelectorAll('.v275-sticky-summary').forEach(cell=>{
      cell.classList.remove('v275-sticky-summary');
      cell.classList.add('v384-export-summary-cell');
    });

    table.querySelectorAll('[style]').forEach(node=>{
      node.style.setProperty('position','static','important');
      node.style.setProperty('left','auto','important');
      node.style.setProperty('right','auto','important');
      node.style.setProperty('top','auto','important');
      node.style.setProperty('bottom','auto','important');
      node.style.setProperty('z-index','auto','important');
      node.style.setProperty('transform','none','important');
    });
    table.querySelectorAll('th,td').forEach(cell=>{
      cell.style.setProperty('position','static','important');
      cell.style.setProperty('left','auto','important');
      cell.style.setProperty('right','auto','important');
      cell.style.setProperty('z-index','auto','important');
      cell.style.setProperty('transform','none','important');
    });
  }
  function buildExportNode(){
    const key=activeKey();
    const live=document.querySelector('.v275-position-wrap .v275-position-table');
    if(!live)throw new Error('ไม่พบตารางตำแหน่งกลางวันรายเดือน');

    const sandbox=document.createElement('div');
    sandbox.dataset.v297ExportSandbox='1';
    sandbox.style.cssText='position:fixed;left:-100000px;top:0;z-index:-1;background:#f6f9fc;padding:24px;width:max-content;max-width:none;overflow:visible;';

    const sheet=document.createElement('div');
    sheet.className='v297-export-sheet';
    sheet.innerHTML=brandHeader(key);

    const tableWrap=document.createElement('div');
    tableWrap.className='v297-export-table-wrap';
    const table=live.cloneNode(true);
    normalizeExportTable(table,key);
    tableWrap.appendChild(table);
    sheet.appendChild(tableWrap);

    const descriptions=document.createElement('div');
    descriptions.innerHTML=descriptionMarkup(key);
    sheet.appendChild(descriptions.firstElementChild);

    sandbox.appendChild(sheet);
    document.body.appendChild(sandbox);
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
    if(colCount<expected+2){
      throw new Error(`ตารางเดือนนี้สร้างได้เพียง ${Math.max(0,colCount-2)} วัน จาก ${expected} วัน กรุณารีเฟรชแล้ว Export ใหม่`);
    }

    const nameWidth=112;
    const summaryWidth=170;
    const dayWidth=58;
    Array.from(table.rows||[]).forEach(row=>{
      Array.from(row.cells||[]).forEach((cell,index)=>{
        const px=index===0?nameWidth:(index===1?summaryWidth:dayWidth);
        cell.style.setProperty('width',`${px}px`,'important');
        cell.style.setProperty('min-width',`${px}px`,'important');
        cell.style.setProperty('max-width',`${px}px`,'important');
        cell.style.setProperty('box-sizing','border-box','important');
      });
    });

    const tableWidth=nameWidth+summaryWidth+(expected*dayWidth)+2;
    table.style.setProperty('width',`${tableWidth}px`,'important');
    table.style.setProperty('min-width',`${tableWidth}px`,'important');
    table.style.setProperty('max-width',`${tableWidth}px`,'important');
    table.style.setProperty('table-layout','fixed','important');

    target.querySelectorAll('.v297-export-table-wrap,.v297-position-description-card,.v297-position-description-wrap,.v297-position-description-table').forEach(el=>{
      el.style.setProperty('width',`${tableWidth}px`,'important');
      el.style.setProperty('min-width',`${tableWidth}px`,'important');
      el.style.setProperty('max-width',`${tableWidth}px`,'important');
      el.style.setProperty('overflow','visible','important');
      el.style.setProperty('box-sizing','border-box','important');
    });
    target.style.setProperty('width',`${tableWidth}px`,'important');
    target.style.setProperty('min-width',`${tableWidth}px`,'important');
    target.style.setProperty('max-width',`${tableWidth}px`,'important');

    const brand=target.querySelector('.v297-export-brand-header');
    if(brand){
      brand.style.setProperty('width',`${tableWidth}px`,'important');
      brand.style.setProperty('min-width',`${tableWidth}px`,'important');
      brand.style.setProperty('max-width',`${tableWidth}px`,'important');
      brand.style.setProperty('box-sizing','border-box','important');
    }
    await nextFrames();
    return {
      tableWidth,
      captureWidth:Math.max(tableWidth+4,target.scrollWidth,target.offsetWidth),
      captureHeight:Math.max(target.scrollHeight,target.offsetHeight,900)
    };
  }
  async function exportPositionMonthImage(){
    let sandbox=null;
    try{
      if(typeof window.html2canvas!=='function')throw new Error('ไม่พบไลบรารี html2canvas');
      const built=buildExportNode();
      sandbox=built.sandbox;
      const layout=await settleExportLayout(built.target,built.key);
      const width=Math.ceil(layout.captureWidth);
      const height=Math.ceil(layout.captureHeight);

      const canvas=await window.html2canvas(built.target,{
        backgroundColor:'#ffffff',
        scale:2,
        useCORS:true,
        logging:false,
        width,
        height,
        windowWidth:Math.max(width,1600),
        windowHeight:Math.max(height,900),
        scrollX:0,
        scrollY:0,
        onclone:doc=>{
          try{
            const cloned=doc.querySelector('.v297-export-sheet');
            if(!cloned)return;
            cloned.style.setProperty('width',`${layout.tableWidth}px`,'important');
            cloned.style.setProperty('min-width',`${layout.tableWidth}px`,'important');
            cloned.style.setProperty('max-width',`${layout.tableWidth}px`,'important');
            cloned.querySelectorAll('.v297-export-table-wrap,.v297-position-description-card,.v297-position-description-wrap,.v297-position-description-table,.v297-export-brand-header,table').forEach(el=>{
              el.style.setProperty('width',`${layout.tableWidth}px`,'important');
              el.style.setProperty('min-width',`${layout.tableWidth}px`,'important');
              el.style.setProperty('max-width',`${layout.tableWidth}px`,'important');
              el.style.setProperty('overflow','visible','important');
            });
          }catch(_){/* noop */}
        }
      });

      const link=document.createElement('a');
      link.href=canvas.toDataURL('image/png');
      link.download=safeFileName(built.key);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('Export ตารางตำแหน่งทั้งเดือนเรียบร้อยแล้ว');
    }catch(error){
      console.error(VERSION,error);
      toast(error?.message||'Export รูปภาพไม่สำเร็จ','error');
    }finally{
      sandbox?.remove();
      document.querySelector('[data-v297-export-sandbox="1"]')?.remove();
    }
  }
  function enhance(){
    const st=S();
    if(!['positionMonth','positionMonthView'].includes(st?.page))return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(!page||!wrap)return;

    const toolbar=page.querySelector('.card .toolbar');
    if(toolbar&&!toolbar.querySelector('[data-v297-export-position-image]')){
      const button=document.createElement('button');
      button.type='button';
      button.className='ghost-btn';
      button.dataset.v297ExportPositionImage='1';
      button.textContent='Export เป็นรูปภาพ (Download Image)';
      toolbar.appendChild(button);
    }

    const key=activeKey();
    const current=page.querySelector('[data-v297-position-descriptions]');
    const holder=document.createElement('div');
    holder.innerHTML=descriptionMarkup(key);
    const next=holder.firstElementChild;
    if(current)current.replaceWith(next);else wrap.insertAdjacentElement('afterend',next);
  }
  let queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});}

  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('[data-v297-export-position-image]');
    if(!btn)return;
    e.preventDefault();
    e.stopPropagation();
    exportPositionMonthImage();
  },true);
  document.addEventListener('change',e=>{if(e.target?.closest?.('.v275-position-wrap'))setTimeout(queue,500);},true);
  const observer=new MutationObserver(mutations=>{
    if(mutations.some(m=>[...m.addedNodes].some(n=>n?.nodeType===1&&(n.matches?.('.v275-page,.v275-position-wrap')||n.querySelector?.('.v275-page,.v275-position-wrap')))))queue();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  window.exportPositionMonthImageV297=exportPositionMonthImage;
  const style=document.createElement('style');
  style.id='v297-position-image-style';
  style.textContent=`
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

    .v297-export-table-wrap{overflow:visible;width:max-content;max-width:none;background:#fff;border:1px solid #dce6f1;border-radius:20px;padding:8px;box-shadow:0 8px 20px rgba(15,23,42,.04)}
    .v297-export-table-wrap table{width:max-content!important;max-width:none!important;table-layout:fixed!important;border-collapse:separate!important;border-spacing:0!important;direction:ltr!important}
    .v297-export-table-wrap thead,.v297-export-table-wrap tbody,.v297-export-table-wrap tr,.v297-export-table-wrap th,.v297-export-table-wrap td{direction:ltr!important}
    .v297-export-table-wrap th,.v297-export-table-wrap td{position:static!important;left:auto!important;right:auto!important;z-index:auto!important;transform:none!important;box-sizing:border-box!important}
    .v297-export-table-wrap th{background:#f4f8fd!important;color:#253a55!important;font-weight:800!important}
    .v297-export-table-wrap td{background:#fff}
    .v297-export-table-wrap .v275-meta-day.off{background:#e9eef5!important;color:#64748b!important}
    .v297-export-table-wrap .v275-count-row th,.v297-export-table-wrap .v275-count-row td{background:#fffaf0!important}

    .v297-export-table-wrap .v384-export-name-cell{background:var(--staff-bg,#f8fafc)!important;color:var(--staff-fg,#0f172a)!important;text-align:left!important;border-right:2px solid rgba(148,163,184,.45)!important;padding:5px 7px!important;vertical-align:middle!important}
    .v297-export-table-wrap .v384-export-name-cell b{display:block!important;font-size:10px!important;line-height:1.15!important;padding:0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .v297-export-table-wrap .v384-export-name-cell small{display:block!important;font-size:7px!important;line-height:1.1!important;margin-top:2px!important;white-space:normal!important}
    .v297-export-table-wrap .v384-export-summary-cell{background:#fbfdff!important;color:#26384f!important;text-align:left!important;padding:5px 7px!important;box-shadow:none!important;vertical-align:middle!important}
    .v297-export-table-wrap .v384-export-summary-cell b{font-size:8px!important;line-height:1.2!important}
    .v297-export-table-wrap .v384-export-summary-cell span,.v297-export-table-wrap .v384-export-summary-cell small{font-size:6.8px!important;line-height:1.15!important;color:#64748b!important}

    .v297-export-position-text{display:inline-block;padding:3px 6px;border-radius:999px;background:#edf5ff;color:#2563eb;font-weight:700;white-space:nowrap}
    .v297-export-input-text{font-weight:800}

    .v297-export-sheet .v297-position-description-card{width:100%;box-sizing:border-box}
    .v297-export-sheet .v297-position-description-wrap{overflow:visible!important;max-height:none!important}
    .v297-export-sheet .v297-position-description-table{width:100%;min-width:0}
  `;
  document.head.appendChild(style);
  queue();
  console.info(`${VERSION} loaded`);
})();
