/* CNMI Staff Planner V374
   Scope: daytime position monthly pages only.
   1) Marks every date column that has an "ออกหน่วย" activity with a red background.
   2) Restores Admin dropdown display from the saved daily_positions row after page navigation/rerender.
   No SQL/schema, Slot target, permission, leave, OT or calculation change.
*/
(function(){
  'use strict';
  const VERSION='V374_OUTING_COLUMN_AND_POSITION_DISPLAY_RESTORE';
  if(window.__CNMI_V374_OUTING_COLUMN_AND_POSITION_DISPLAY_RESTORE__)return;
  window.__CNMI_V374_OUTING_COLUMN_AND_POSITION_DISPLAY_RESTORE__=true;

  let queued=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function page(){return text(S()?.page);}
  function targetPage(){return page()==='positionMonth'||page()==='positionMonthView';}
  function adminPage(){return page()==='positionMonth';}
  function normDate(v){
    try{if(typeof window.normalizeDateKey==='function')return text(window.normalizeDateKey(v)).slice(0,10);}catch(_){}
    return text(v).slice(0,10);
  }
  function normId(v){return text(v);}
  function normCode(v){return text(v).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');}
  function validMonth(v){const key=text(v).slice(0,7);return /^\d{4}-\d{2}$/.test(key)?key:'';}
  function selectedMonth(){
    const input=document.getElementById(page()==='positionMonth'?'positionMonthInput':'positionMonthViewInput');
    return validMonth(input?.value)||validMonth(page()==='positionMonth'?S()?.positionMonthKey:S()?.positionMonthViewKey)||validMonth(S()?.monthKey)||validMonth(new Date().toISOString());
  }
  function monthDates(key){
    const month=validMonth(key);if(!month)return[];
    const [year,no]=month.split('-').map(Number),last=new Date(year,no,0).getDate();
    return Array.from({length:last},(_,index)=>`${month}-${String(index+1).padStart(2,'0')}`);
  }
  function dateInRange(date,start,end){
    const d=normDate(date),s=normDate(start),e=normDate(end||start);
    return !!d&&!!s&&s<=d&&d<=(e||s);
  }
  function outingActivities(date){
    return (Array.isArray(S()?.activities)?S().activities:[]).filter(row=>text(row?.event_type)==='ออกหน่วย'&&dateInRange(date,row?.start_date,row?.end_date));
  }

  function clearOutingDecorations(table){
    table.querySelectorAll('.v374-outing-day').forEach(node=>node.classList.remove('v374-outing-day'));
    table.querySelectorAll('[data-v374-outing-date]').forEach(node=>{
      delete node.dataset.v374OutingDate;
      delete node.dataset.v374OutingTitle;
      if(node.dataset.v374OriginalTitle!==undefined){
        node.title=node.dataset.v374OriginalTitle;
        delete node.dataset.v374OriginalTitle;
      }
    });
    table.querySelectorAll('.v374-outing-label').forEach(node=>node.remove());
  }

  function markOutingColumns(table){
    if(!table)return;
    const headRow=table.tHead?.rows?.[0];
    if(!headRow)return;
    const dates=monthDates(selectedMonth());
    if(!dates.length)return;
    clearOutingDecorations(table);
    dates.forEach((date,dateIndex)=>{
      const activities=outingActivities(date);
      if(!activities.length)return;
      const columnIndex=dateIndex+2; // เจ้าหน้าที่ + สรุปตำแหน่ง
      const title=activities.map(row=>text(row?.title)).filter(Boolean).join(' / ')||'ออกหน่วย';
      Array.from(table.rows||[]).forEach(row=>{
        const cell=row.cells?.[columnIndex];
        if(cell)cell.classList.add('v374-outing-day');
      });
      const head=headRow.cells?.[columnIndex];
      if(head){
        head.dataset.v374OutingDate=date;
        head.dataset.v374OutingTitle=title;
        if(head.dataset.v374OriginalTitle===undefined)head.dataset.v374OriginalTitle=head.title||'';
        head.title=`ออกหน่วย${title&&title!=='ออกหน่วย'?`: ${title}`:''}`;
        if(!head.querySelector('.v374-outing-label')){
          const label=document.createElement('span');
          label.className='v374-outing-label';
          label.textContent='ออกหน่วย';
          head.appendChild(label);
        }
      }
    });
  }

  function rowTimestamp(row){
    const raw=row?.updated_at||row?.modified_at||row?.created_at||'';
    const value=Date.parse(raw);return Number.isFinite(value)?value:0;
  }
  function savedPositionMap(){
    const key=selectedMonth(),map=new Map();
    (Array.isArray(S()?.positions)?S().positions:[]).forEach((row,index)=>{
      const date=normDate(row?.work_date),staffId=normId(row?.staff_id),code=text(row?.position_code||row?.code);
      if(!date.startsWith(key)||!staffId||!code)return;
      const cellKey=`${date}|${staffId}`,previous=map.get(cellKey);
      const candidate={row,code,index,time:rowTimestamp(row)};
      if(!previous||candidate.time>previous.time||(candidate.time===previous.time&&candidate.index>previous.index))map.set(cellKey,candidate);
    });
    return map;
  }
  function matchingOption(select,code){
    const exact=Array.from(select?.options||[]).find(option=>text(option.value)===text(code));
    if(exact)return exact;
    const key=normCode(code);
    return Array.from(select?.options||[]).find(option=>key&&normCode(option.value)===key)||null;
  }
  function ensureOption(select,code){
    let option=matchingOption(select,code);
    if(option)return option;
    option=document.createElement('option');
    option.value=code;
    option.textContent=code;
    option.dataset.v374RestoredOption='1';
    select.appendChild(option);
    return option;
  }
  function interacting(select){return Number(select?.dataset?.v374InteractingUntil||0)>Date.now()||document.activeElement===select;}
  function syncInfoButton(cell,code){
    if(!cell||!code)return;
    let button=cell.querySelector('[data-v275-job]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='v275-info';
      button.textContent='i';
      const select=cell.querySelector('[data-v275-position-select]');
      select?.insertAdjacentElement('afterend',button);
    }
    button.dataset.v275Job=code;
  }
  function restoreSavedDropdowns(root=document){
    if(!adminPage())return;
    const saved=savedPositionMap();
    root.querySelectorAll?.('.v275-position-wrap [data-v275-position-cell]')?.forEach(cell=>{
      const select=cell.querySelector('[data-v275-position-select]');
      if(!select||interacting(select))return;
      const date=normDate(cell.dataset.date),staffId=normId(cell.dataset.staffId);
      const found=saved.get(`${date}|${staffId}`);
      if(!found)return;
      const current=text(select.value);
      const savedCode=text(found.code);
      if(current&&normCode(current)===normCode(savedCode))return;
      /* Only repair an empty/missing display. Never overwrite a user's visible pending choice. */
      if(current)return;
      const option=ensureOption(select,savedCode);
      select.value=option.value;
      option.selected=true;
      cell.dataset.v374RestoredCode=savedCode;
      syncInfoButton(cell,savedCode);
    });
  }

  function enhance(root=document){
    if(!targetPage())return;
    root.querySelectorAll?.('.v275-position-table')?.forEach(markOutingColumns);
    restoreSavedDropdowns(root);
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance(document);});
  }
  function markInteraction(target,duration=6000){
    const select=target?.closest?.('.v275-position-wrap [data-v275-position-select]');
    if(select)select.dataset.v374InteractingUntil=String(Date.now()+duration);
  }

  window.addEventListener('pointerdown',event=>markInteraction(event.target),true);
  window.addEventListener('focusin',event=>markInteraction(event.target),true);
  window.addEventListener('change',event=>{
    markInteraction(event.target,8000);
    setTimeout(queue,8500);
  },true);

  const style=document.createElement('style');
  style.id='v374-outing-column-and-position-display-style';
  style.textContent=`
    .v275-position-table th.v374-outing-day{background:#fecdd3!important;color:#9f1239!important;box-shadow:inset 0 -3px 0 #e11d48}
    .v275-position-table td.v374-outing-day{background:#fff1f2!important}
    .v275-position-table .v374-outing-day .v275-position-cell select,
    .v275-position-table .v374-outing-day .v275-mentor-cell select{background:#fff7f8!important;border-color:#fda4af!important}
    .v275-position-table .v374-outing-day .v275-slot-control{background:#fff7f8;border-radius:7px;padding:1px 2px}
    .v374-outing-label{display:block;margin-top:1px;color:#be123c;font-size:7px;font-weight:900;line-height:1.05;white-space:nowrap}
    .v275-position-table th.v374-outing-day.v373-compact-offday,
    .v275-position-table td.v374-outing-day.v373-compact-offday{background:#ffe4e6!important}
    @media(max-width:820px){.v374-outing-label{font-size:6px}}
  `;
  document.head.appendChild(style);

  const install=()=>{
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v374Observer){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v374Observer=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);
  document.addEventListener('click',()=>setTimeout(queue,0),true);

  window.cnmiV374={version:VERSION,enhance,markOutingColumns,restoreSavedDropdowns};
  console.info(`[${VERSION}] loaded`);
})();
