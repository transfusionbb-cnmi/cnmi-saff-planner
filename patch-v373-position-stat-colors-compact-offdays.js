/* CNMI Staff Planner V373
   Scope: daytime position monthly pages only.
   - Adds grouped background colors to Admin position statistics columns.
   - Makes Saturday, Sunday and public-holiday columns narrower in monthly matrices.
   - No data, Slot target, leave, permission, save, Supabase or calculation changes.
*/
(function(){
  'use strict';
  const VERSION='V373_POSITION_STAT_COLORS_COMPACT_OFFDAYS';
  if(window.__CNMI_V373_POSITION_STAT_COLORS_COMPACT_OFFDAYS__)return;
  window.__CNMI_V373_POSITION_STAT_COLORS_COMPACT_OFFDAYS__=true;

  let queued=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function page(){return String(S()?.page||'');}
  function targetPage(){return page()==='positionMonth'||page()==='positionMonthView';}
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');}

  function colorGroup(code){
    const key=norm(code);
    if(key==='bbreport'||key==='bbapprove')return'report-approve';
    if(key==='bbmanual1'||key==='bbmanual2')return'manual-12';
    if(key==='bbmanual3'||key==='bbmanual4')return'manual-34';
    if(key==='drregister'||key==='drsupport')return'register-support';
    if(key==='drfingerinterview1'||key==='drfingerinterview2')return'finger-interview';
    if(key==='drmain1'||key==='drmain2')return'dr-main';
    return''; // BB-Support and unspecified positions remain white.
  }

  function decoratePositionStatTable(table){
    if(!table)return;
    const heads=Array.from(table.querySelectorAll('thead tr:first-child > th'));
    if(!heads.length)return;
    heads.forEach((head,index)=>{
      if(index===0||index===heads.length-1)return;
      const group=colorGroup(head.textContent);
      if(!group)return;
      head.classList.add('v373-stat-color');
      head.dataset.v373StatGroup=group;
      Array.from(table.tBodies||[]).forEach(body=>{
        Array.from(body.rows||[]).forEach(row=>{
          const cell=row.cells?.[index];
          if(!cell)return;
          cell.classList.add('v373-stat-color');
          cell.dataset.v373StatGroup=group;
        });
      });
    });
  }

  function decorateStats(root=document){
    root.querySelectorAll?.('.v278-position-detail-table')?.forEach(decoratePositionStatTable);
  }

  function compactOffdayColumns(table){
    if(!table)return;
    const firstHeadRow=table.tHead?.rows?.[0];
    if(!firstHeadRow)return;
    const offIndexes=[];
    Array.from(firstHeadRow.cells||[]).forEach((head,index)=>{
      if(!head.classList.contains('v275-date-head'))return;
      if(!head.classList.contains('off')&&!head.classList.contains('holiday'))return;
      offIndexes.push(index);
      head.classList.add('v373-compact-offday');
      const holidayName=head.querySelector('em')?.textContent?.trim();
      if(holidayName&&!head.title)head.title=holidayName;
    });
    if(!offIndexes.length)return;
    Array.from(table.rows||[]).forEach(row=>{
      offIndexes.forEach(index=>{
        const cell=row.cells?.[index];
        if(cell)cell.classList.add('v373-compact-offday');
      });
    });
  }

  function compactMonthlyOffdays(root=document){
    root.querySelectorAll?.('.v275-position-table')?.forEach(compactOffdayColumns);
  }

  function enhance(root=document){
    if(!targetPage())return;
    decorateStats(root);
    compactMonthlyOffdays(root);
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance(document);});
  }

  const style=document.createElement('style');
  style.id='v373-position-stat-colors-compact-offdays-style';
  style.textContent=`
    /* Admin statistics: same work group = same soft background. */
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="report-approve"]{background:#e8f2ff!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="manual-12"]{background:#fff3d9!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="manual-34"]{background:#f2eaff!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="register-support"]{background:#e8f8ee!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="finger-interview"]{background:#ffeaf1!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="dr-main"]{background:#e7f8fb!important}
    .v278-position-detail-table thead .v373-stat-color{font-weight:850;color:#223b50}

    /* Weekend / holiday monthly columns are intentionally compact. */
    .v275-position-table th.v373-compact-offday,
    .v275-position-table td.v373-compact-offday{
      min-width:42px!important;
      width:42px!important;
      max-width:42px!important;
      padding-left:2px!important;
      padding-right:2px!important;
      white-space:normal!important;
      overflow:hidden;
      text-align:center;
    }
    .v275-position-table th.v373-compact-offday em{display:none!important}
    .v275-position-table th.v373-compact-offday b{font-size:10px}
    .v275-position-table th.v373-compact-offday small{font-size:7px}
    .v275-position-table td.v373-compact-offday span,
    .v275-position-table td.v373-compact-offday b{font-size:7px;line-height:1.05;overflow-wrap:anywhere}

    @media(max-width:820px){
      .v275-position-table th.v373-compact-offday,
      .v275-position-table td.v373-compact-offday{
        min-width:34px!important;
        width:34px!important;
        max-width:34px!important;
        padding-left:1px!important;
        padding-right:1px!important;
      }
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',queue,{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  queue();

  window.cnmiV373={version:VERSION,enhance,colorGroup};
  console.info(`[${VERSION}] loaded`);
})();
