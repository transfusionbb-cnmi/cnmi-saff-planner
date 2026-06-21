/* CNMI Staff Planner V281
   Admin monthly daytime-position usability only.
   - Compact person x date matrix to show more staff/days at once.
   - Keep all existing position save, slot, trainee and Supabase logic unchanged.
   - Organize the four Admin statistics tables as one-tab-at-a-time views.
   - Hide all-zero position columns by default, with a view toggle.
*/
(function(){
  'use strict';
  const VERSION='V281_POSITION_ADMIN_COMPACT_STATS_TABS';
  if(window.__CNMI_V281_POSITION_ADMIN_COMPACT_STATS_TABS__) return;
  window.__CNMI_V281_POSITION_ADMIN_COMPACT_STATS_TABS__=true;

  let queued=false;
  let relaxed=false;
  let activeStat=0;
  let showZeroColumns=false;

  function S(){
    try{return state||window.state||null;}catch(_){return window.state||null;}
  }
  function isAdminSafe(){
    try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isTargetPage(){return S()?.page==='positionMonth'&&isAdminSafe();}

  function addDensityControl(page){
    if(!page||page.querySelector('[data-v281-density]')) return;
    const toolbar=page.querySelector('.toolbar');
    if(!toolbar) return;
    const button=document.createElement('button');
    button.type='button';
    button.className='ghost-btn v281-density-btn';
    button.dataset.v281Density='1';
    toolbar.appendChild(button);
  }

  function applyMatrixMode(){
    if(!isTargetPage()) return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(!page||!wrap) return;
    page.classList.add('v281-admin-position-page');
    wrap.classList.add('v281-compact-position-wrap');
    page.classList.toggle('v281-relaxed',relaxed);
    addDensityControl(page);
    const button=page.querySelector('[data-v281-density]');
    if(button){
      button.textContent=relaxed?'มุมมองกะทัดรัด':'ขยายช่องตาราง';
      button.title=relaxed?'ลดขนาดแถวและคอลัมน์':'ขยายช่องชั่วคราวเพื่ออ่านข้อความยาว';
    }
  }

  function setColumnVisible(table,index,visible){
    if(!table||index<0) return;
    Array.from(table.rows||[]).forEach(row=>{
      const cell=row.cells?.[index];
      if(cell) cell.classList.toggle('v281-hidden-zero-column',!visible);
    });
  }

  function applyZeroColumnFilter(section){
    const table=section?.querySelector('.v278-position-detail-table');
    if(!table) return;
    const header=table.tHead?.rows?.[0];
    if(!header) return;
    const columnCount=header.cells.length;
    for(let index=1;index<columnCount-1;index++){
      let hasValue=false;
      Array.from(table.tBodies?.[0]?.rows||[]).forEach(row=>{
        const raw=String(row.cells?.[index]?.textContent||'').replace(/,/g,'').trim();
        const value=Number(raw);
        if(Number.isFinite(value)&&value!==0) hasValue=true;
      });
      setColumnVisible(table,index,showZeroColumns||hasValue);
    }
  }

  function statTabLabel(index){
    return [
      ['ห้อง · เดือนนี้','BB / Donor / ออกหน่วย'],
      ['ตำแหน่ง · เดือนนี้','เฉพาะตำแหน่งที่มีข้อมูล'],
      ['ห้อง · สะสม','ข้อมูลทั้งหมด'],
      ['ตำแหน่ง · สะสม','ข้อมูลทั้งหมด']
    ][index]||[`ตาราง ${index+1}`,''];
  }

  function buildStatsControls(stats,sections){
    let controls=stats.querySelector('.v281-stat-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='v281-stat-controls';
      const heading=stats.querySelector('.v278-stats-heading');
      heading?.insertAdjacentElement('afterend',controls);
    }
    controls.innerHTML=`<div class="v281-stat-tabs" role="tablist" aria-label="เลือกสถิติตำแหน่ง">
      ${sections.map((_,index)=>{const [title,sub]=statTabLabel(index);return `<button type="button" role="tab" data-v281-stat-tab="${index}" class="${index===activeStat?'active':''}" aria-selected="${index===activeStat?'true':'false'}"><b>${title}</b><small>${sub}</small></button>`;}).join('')}
    </div>
    <label class="v281-zero-toggle" ${activeStat===1||activeStat===3?'':'hidden'}>
      <input type="checkbox" data-v281-show-zero ${showZeroColumns?'checked':''}>
      <span>แสดงตำแหน่งที่เป็น 0 ทุกคอลัมน์</span>
    </label>`;
  }

  function applyStatsView(){
    if(!isTargetPage()) return;
    const stats=document.querySelector('.v278-admin-position-stats');
    const grid=stats?.querySelector('.v278-stat-grid');
    if(!stats||!grid) return;
    stats.classList.add('v281-organized-stats');
    const sections=Array.from(grid.querySelectorAll(':scope > .v278-position-stat-card'));
    if(!sections.length) return;
    if(activeStat>=sections.length) activeStat=0;
    buildStatsControls(stats,sections);
    sections.forEach((section,index)=>{
      section.dataset.v281StatIndex=String(index);
      section.hidden=index!==activeStat;
      section.classList.toggle('v281-active-stat',index===activeStat);
      if(index===1||index===3) applyZeroColumnFilter(section);
      const scroll=section.querySelector('.v278-stat-scroll');
      if(scroll) scroll.setAttribute('tabindex','0');
    });
  }

  function enhance(){
    applyMatrixMode();
    applyStatsView();
  }
  function queueEnhance(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance();});
  }

  document.addEventListener('click',event=>{
    const density=event.target?.closest?.('[data-v281-density]');
    if(density){
      event.preventDefault();
      relaxed=!relaxed;
      applyMatrixMode();
      return;
    }
    const tab=event.target?.closest?.('[data-v281-stat-tab]');
    if(tab){
      event.preventDefault();
      activeStat=Math.max(0,Number(tab.dataset.v281StatTab)||0);
      applyStatsView();
    }
  },true);

  document.addEventListener('change',event=>{
    if(!event.target?.matches?.('[data-v281-show-zero]')) return;
    showZeroColumns=!!event.target.checked;
    applyStatsView();
  },true);

  const style=document.createElement('style');
  style.id='v281-position-admin-compact-stats-style';
  style.textContent=`
    /* ---------- Compact Admin person x date matrix ---------- */
    .v281-admin-position-page .v275-position-pool{
      flex-wrap:nowrap!important;
      overflow-x:auto!important;
      overflow-y:hidden!important;
      padding:4px 6px!important;
      gap:4px!important;
      min-height:34px!important;
      scrollbar-width:thin;
    }
    .v281-admin-position-page .v275-position-pool>b{flex:0 0 auto;font-size:9px!important}
    .v281-admin-position-page .v275-position-pool span{
      flex:0 0 auto!important;
      padding:3px 6px!important;
      font-size:7.5px!important;
      line-height:1.15!important;
    }
    .v281-admin-position-page .soft-notice{
      margin-top:6px!important;
      padding:6px 10px!important;
      font-size:9px!important;
      line-height:1.25!important;
    }
    .v281-admin-position-page .v281-compact-position-wrap{
      --v276-position-name-width:70px!important;
      width:100%!important;
      max-width:100%!important;
      max-height:max(500px,calc(100vh - 245px))!important;
      overflow:auto!important;
      scrollbar-width:thin;
    }
    .v281-admin-position-page .v275-position-table{
      font-size:7.5px!important;
      line-height:1.05!important;
    }
    .v281-admin-position-page .v275-position-table th,
    .v281-admin-position-page .v275-position-table td{
      padding:1px!important;
      min-width:54px!important;
      width:54px!important;
      max-width:54px!important;
    }
    .v281-admin-position-page .v275-position-table tr>:nth-child(1){
      width:70px!important;min-width:70px!important;max-width:70px!important;
    }
    .v281-admin-position-page .v275-position-table tr>:nth-child(2){
      left:70px!important;
      width:86px!important;min-width:86px!important;max-width:86px!important;
    }
    .v281-admin-position-page .v275-sticky-name b{font-size:8px!important;padding:1px!important;line-height:1.05!important}
    .v281-admin-position-page .v275-sticky-name small{font-size:6.5px!important;line-height:1!important}
    .v281-admin-position-page .v275-summary-cell{padding:0 2px!important}
    .v281-admin-position-page .v275-summary-cell>b{font-size:7.5px!important;line-height:1.05!important}
    .v281-admin-position-page .v275-date-head b{font-size:8px!important;line-height:1!important}
    .v281-admin-position-page .v275-date-head small{font-size:6.5px!important;line-height:1!important}
    .v281-admin-position-page .v275-date-head em{
      max-width:52px!important;font-size:5.8px!important;line-height:1!important;
    }
    .v281-admin-position-page .v275-position-table tbody tr:not(.v275-count-row)>th,
    .v281-admin-position-page .v275-position-table tbody tr:not(.v275-count-row)>td,
    .v281-admin-position-page .v275-position-day{
      height:29px!important;min-height:29px!important;max-height:29px!important;
    }
    .v281-admin-position-page .v275-count-row>th,
    .v281-admin-position-page .v275-count-row>td{height:31px!important;min-height:31px!important}
    .v281-admin-position-page .v275-count-row input[data-v275-slot]{
      width:25px!important;height:23px!important;padding:1px!important;font-size:8px!important;border-radius:5px!important;
    }
    .v281-admin-position-page .v275-position-cell{
      display:block!important;position:relative!important;width:100%!important;min-width:0!important;
    }
    .v281-admin-position-page .v275-position-cell select,
    .v281-admin-position-page .v275-mentor-cell select{
      display:block!important;width:100%!important;min-width:0!important;height:25px!important;
      padding:1px 14px 1px 2px!important;border-radius:5px!important;font-size:7px!important;
      line-height:1!important;text-overflow:ellipsis!important;
    }
    .v281-admin-position-page .v275-info{
      position:absolute!important;right:1px!important;top:1px!important;width:13px!important;height:13px!important;
      min-width:13px!important;padding:0!important;border-radius:4px!important;font-size:6px!important;line-height:13px!important;
    }
    .v281-admin-position-page .v275-position-day.leave .badge,
    .v281-admin-position-page .v275-position-day.leave span{
      font-size:6.5px!important;padding:2px 4px!important;line-height:1!important;
    }
    .v281-admin-position-page .v275-mentor-cell{gap:0!important;line-height:1!important}
    .v281-admin-position-page .v275-mentor-cell span,
    .v281-admin-position-page .v275-mentor-cell small{font-size:5.8px!important;line-height:1!important}
    .v281-density-btn{white-space:nowrap}

    /* Optional expanded view; no data or save logic changes. */
    .v281-admin-position-page.v281-relaxed .v275-position-table{font-size:9px!important}
    .v281-admin-position-page.v281-relaxed .v275-position-table th,
    .v281-admin-position-page.v281-relaxed .v275-position-table td{min-width:72px!important;width:72px!important;max-width:72px!important;padding:2px!important}
    .v281-admin-position-page.v281-relaxed .v275-position-table tr>:nth-child(1){width:84px!important;min-width:84px!important;max-width:84px!important}
    .v281-admin-position-page.v281-relaxed .v275-position-table tr>:nth-child(2){left:84px!important;width:110px!important;min-width:110px!important;max-width:110px!important}
    .v281-admin-position-page.v281-relaxed .v275-position-table tbody tr:not(.v275-count-row)>th,
    .v281-admin-position-page.v281-relaxed .v275-position-table tbody tr:not(.v275-count-row)>td,
    .v281-admin-position-page.v281-relaxed .v275-position-day{height:38px!important;min-height:38px!important;max-height:38px!important}
    .v281-admin-position-page.v281-relaxed .v275-position-cell select,
    .v281-admin-position-page.v281-relaxed .v275-mentor-cell select{height:31px!important;font-size:8.5px!important}

    /* ---------- Four statistics tables, organized as tabs ---------- */
    .v281-organized-stats{display:grid!important;gap:8px!important;min-width:0!important}
    .v281-organized-stats .v278-stats-heading{margin:0!important;padding:2px 0!important}
    .v281-organized-stats .v278-stats-heading h2{font-size:17px!important;margin:0!important}
    .v281-organized-stats .v278-stats-heading .hint{font-size:9px!important;margin:2px 0 0!important}
    .v281-stat-controls{
      display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;
      padding:7px;border:1px solid #dbeafe;border-radius:12px;background:#f8fbff;
    }
    .v281-stat-tabs{display:flex;gap:5px;flex-wrap:wrap;min-width:0}
    .v281-stat-tabs button{
      border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:9px;padding:5px 9px;
      display:grid;gap:1px;text-align:left;cursor:pointer;min-width:126px;
    }
    .v281-stat-tabs button b{font-size:10px;line-height:1.15}
    .v281-stat-tabs button small{font-size:7.5px;color:#64748b;line-height:1.1}
    .v281-stat-tabs button.active{background:#dbeafe;border-color:#60a5fa;color:#1d4ed8;box-shadow:0 0 0 1px rgba(37,99,235,.08)}
    .v281-zero-toggle{display:flex;align-items:center;gap:5px;font-size:9px;color:#475569;white-space:nowrap}
    .v281-zero-toggle[hidden]{display:none!important}
    .v281-zero-toggle input{width:15px;height:15px}
    .v281-organized-stats .v278-stat-grid{display:block!important;min-width:0!important}
    .v281-organized-stats .v278-position-stat-card{padding:10px!important;border-radius:12px!important}
    .v281-organized-stats .v278-position-stat-card[hidden]{display:none!important}
    .v281-organized-stats .v278-position-stat-card .section-title{margin-bottom:5px!important}
    .v281-organized-stats .v278-position-stat-card h3{font-size:13px!important;margin:0!important}
    .v281-organized-stats .v278-position-stat-card .hint{font-size:8px!important;margin:1px 0 0!important}
    .v281-organized-stats .v278-stat-scroll{
      max-height:min(58vh,560px)!important;overflow:auto!important;border:1px solid #e5eaf1;border-radius:8px;
      scrollbar-width:thin;
    }
    .v281-organized-stats .v278-stat-table{font-size:8px!important;line-height:1.05!important}
    .v281-organized-stats .v278-stat-table th,
    .v281-organized-stats .v278-stat-table td{padding:3px 5px!important;height:24px!important}
    .v281-organized-stats .v278-stat-table th{font-size:7.5px!important}
    .v281-organized-stats .v278-staff-pill{padding:2px 6px!important;font-size:8px!important}
    .v281-hidden-zero-column{display:none!important}

    @media(max-width:820px){
      .v281-admin-position-page .v281-compact-position-wrap{
        --v276-position-name-width:62px!important;
        max-height:max(430px,calc(100vh - 205px))!important;
      }
      .v281-admin-position-page .v275-position-table tr>:nth-child(1){width:62px!important;min-width:62px!important;max-width:62px!important}
      .v281-admin-position-page .v275-position-table tr>:nth-child(2){left:62px!important;width:78px!important;min-width:78px!important;max-width:78px!important}
      .v281-admin-position-page .v275-position-table th,
      .v281-admin-position-page .v275-position-table td{min-width:50px!important;width:50px!important;max-width:50px!important}
      .v281-admin-position-page .v275-position-cell select,
      .v281-admin-position-page .v275-mentor-cell select{font-size:6.5px!important;height:24px!important}
      .v281-stat-tabs{display:grid;grid-template-columns:1fr 1fr;width:100%}
      .v281-stat-tabs button{min-width:0;padding:5px 7px}
      .v281-zero-toggle{width:100%}
      .v281-organized-stats .v278-stat-scroll{max-height:52vh!important}
    }
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queueEnhance);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('resize',queueEnhance,{passive:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,80));
  setTimeout(enhance,0);
  setTimeout(enhance,180);
  setTimeout(enhance,600);

  window.cnmiV281={enhance,applyMatrixMode,applyStatsView};
  console.info(`${VERSION} loaded`);
})();
