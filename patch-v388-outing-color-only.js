/* CNMI Staff Planner V388
   Scope: monthly daytime-position display/export color only.
   - Restores the V386 baseline behavior.
   - Adds the red outing-day column color without changing hasOuting(), slots,
     position descriptions, saved positions, leave, OT, or Supabase data.
*/
(function(){
  'use strict';
  const VERSION='V388_OUTING_COLOR_ONLY';
  if(window.__CNMI_V388_OUTING_COLOR_ONLY__)return;
  window.__CNMI_V388_OUTING_COLOR_ONLY__=true;

  let queued=false;
  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function normDate(v){
    try{if(typeof normalizeDateKey==='function')return text(normalizeDateKey(v)).slice(0,10);}catch(_){/* noop */}
    return text(v).slice(0,10);
  }
  function validMonth(v){const key=text(v).slice(0,7);return /^\d{4}-\d{2}$/.test(key)?key:'';}
  function currentPage(){return text(S()?.page);}
  function isTargetPage(){return currentPage()==='positionMonth'||currentPage()==='positionMonthView';}
  function selectedMonth(){
    const input=document.getElementById(currentPage()==='positionMonth'?'positionMonthInput':'positionMonthViewInput');
    return validMonth(input?.value)||validMonth(currentPage()==='positionMonth'?S()?.positionMonthKey:S()?.positionMonthViewKey)||validMonth(S()?.monthKey);
  }
  function dateInRange(date,start,end){
    const d=normDate(date),s=normDate(start),e=normDate(end||start);
    return !!d&&!!s&&s<=d&&d<=(e||s);
  }
  function activitySaysOuting(date){
    return (Array.isArray(S()?.activities)?S().activities:[]).some(row=>
      text(row?.event_type)==='ออกหน่วย'&&dateInRange(date,row?.start_date||row?.date,row?.end_date||row?.start_date||row?.date)
    );
  }
  function cellHasPreparation(cell){
    const value=text(cell?.innerText||cell?.textContent).toLowerCase().replace(/\s+/g,'');
    return value.includes('dr-preparation')||value.includes('drpreparation');
  }
  function columnHasPreparation(table,columnIndex){
    return Array.from(table?.tBodies||[]).some(body=>Array.from(body.rows||[]).some(row=>cellHasPreparation(row.cells?.[columnIndex])));
  }
  function parseDay(cell){
    const match=text(cell?.innerText||cell?.textContent).match(/^(\d{1,2})/);
    const day=match?Number(match[1]):NaN;
    return Number.isInteger(day)&&day>=1&&day<=31?day:null;
  }
  function clearOwnMarks(table){
    table.querySelectorAll('.v388-outing-color-only').forEach(node=>node.classList.remove('v388-outing-color-only'));
    table.querySelectorAll('.v388-outing-label-only').forEach(node=>node.remove());
  }
  function markTable(table){
    if(!table)return;
    const key=selectedMonth();
    const head=table.tHead?.rows?.[0];
    if(!key||!head)return;
    clearOwnMarks(table);

    Array.from(head.cells||[]).forEach((headCell,columnIndex)=>{
      const day=parseDay(headCell);
      if(!day)return;
      const date=`${key}-${String(day).padStart(2,'0')}`;
      const outing=activitySaysOuting(date)||columnHasPreparation(table,columnIndex);
      if(!outing)return;

      Array.from(table.rows||[]).forEach(row=>row.cells?.[columnIndex]?.classList.add('v388-outing-color-only'));
      if(!headCell.querySelector('.v374-outing-label,.v388-outing-label-only')){
        const label=document.createElement('span');
        label.className='v388-outing-label-only';
        label.textContent='ออกหน่วย';
        headCell.appendChild(label);
      }
    });
  }
  function enhance(){
    if(!isTargetPage())return;
    document.querySelectorAll('.v275-position-table').forEach(table=>{
      if(table.closest('[data-v297-export-sandbox="1"]')) return;
      markTable(table);
    });
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{queued=false;enhance();}));
  }

  const style=document.createElement('style');
  style.id='v388-outing-color-only-style';
  style.textContent=`
    .v275-position-table th.v388-outing-color-only{background:#fecdd3!important;color:#9f1239!important;box-shadow:inset 0 -3px 0 #e11d48!important}
    .v275-position-table td.v388-outing-color-only{background:#fff1f2!important}
    .v275-position-table .v388-outing-color-only .v275-position-cell select,
    .v275-position-table .v388-outing-color-only .v275-mentor-cell select{background:#fff7f8!important;border-color:#fda4af!important}
    .v388-outing-label-only{display:block;margin-top:1px;color:#be123c;font-size:7px;font-weight:900;line-height:1.05;white-space:nowrap}
    @media(max-width:820px){.v388-outing-label-only{font-size:6px}}
  `;
  document.head.appendChild(style);

  const install=()=>{
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v388OutingColorObserver){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v388OutingColorObserver=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);
  document.addEventListener('change',event=>{if(event.target?.closest?.('.v275-page'))setTimeout(queue,120);},true);

  window.cnmiV388={version:VERSION,enhance,markTable};
  console.info(`[${VERSION}] loaded`);
})();
