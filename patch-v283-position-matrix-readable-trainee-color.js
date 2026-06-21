/* CNMI Staff Planner V283
   Targeted Admin monthly daytime-position UI adjustment only.
   - Restore readable date-cell width while keeping rows compact.
   - Keep scrolling inside the existing table container.
   - New staff trainees use their own staff color in the first column.
   - Intern rows keep the trainee/intern neutral orange style.
   No save, slot, mentor, statistics, or Supabase logic is changed.
*/
(function(){
  'use strict';
  const VERSION='V283_POSITION_MATRIX_READABLE_TRAINEE_COLOR';
  if(window.__CNMI_V283_POSITION_MATRIX_READABLE_TRAINEE_COLOR__) return;
  window.__CNMI_V283_POSITION_MATRIX_READABLE_TRAINEE_COLOR__=true;

  let queued=false;

  function S(){
    try{return state||window.state||null;}catch(_){return window.state||null;}
  }
  function isAdminSafe(){
    try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isTargetPage(){return S()?.page==='positionMonth'&&isAdminSafe();}
  function norm(value){return String(value??'').trim().toLowerCase();}
  function id(value){return String(value??'').trim();}
  function displayName(person){
    if(!person) return '';
    try{if(typeof staffName==='function') return String(staffName(person)||'').trim();}catch(_){}
    return String(person.alias||person.nickname||person.nick_name||person.display_name||person.full_name||person.name||'').trim();
  }
  function staffColor(person){
    try{if(typeof staffColorSafe==='function') return staffColorSafe(person);}catch(_){}
    return person?.color||person?.staff_color||person?.theme_color||'#fff7ed';
  }
  function contrast(color){
    try{if(typeof textColorSafe==='function') return textColorSafe(color);}catch(_){}
    const raw=String(color||'').replace('#','');
    if(!/^[0-9a-f]{6}$/i.test(raw)) return '#0f172a';
    const r=parseInt(raw.slice(0,2),16),g=parseInt(raw.slice(2,4),16),b=parseInt(raw.slice(4,6),16);
    return ((r*299+g*587+b*114)/1000)>155?'#0f172a':'#ffffff';
  }

  function findNewStaff(label){
    const st=S();
    const staff=Array.isArray(st?.staff)?st.staff:[];
    const directory=Array.isArray(st?.traineeDirectoryV273)?st.traineeDirectoryV273:[];
    const labelKey=norm(label);
    const directoryRow=directory.find(row=>{
      const type=norm(row?.trainee_type||row?.type);
      if(type==='intern') return false;
      const rowStaff=staff.find(p=>id(p?.id)===id(row?.trainee_staff_id));
      const rowLabel=rowStaff?displayName(rowStaff):String(row?.trainee_name||'').trim();
      return norm(rowLabel)===labelKey;
    });
    if(directoryRow?.trainee_staff_id){
      const byId=staff.find(p=>id(p?.id)===id(directoryRow.trainee_staff_id));
      if(byId) return byId;
    }
    return staff.find(person=>{
      const candidates=[displayName(person),person?.alias,person?.nickname,person?.nick_name,person?.full_name,person?.name];
      return candidates.some(value=>norm(value)===labelKey);
    })||null;
  }

  function applyTraineeColors(){
    if(!isTargetPage()) return;
    document.querySelectorAll('.v275-trainee-row .v275-sticky-name.trainee-name').forEach(cell=>{
      const typeText=norm(cell.querySelector('small')?.textContent);
      if(typeText.includes('intern')){
        if(cell.dataset.v283ColorApplied!=='intern'){
          cell.style.removeProperty('background');
          cell.style.removeProperty('color');
          cell.dataset.v283ColorApplied='intern';
        }
        return;
      }
      const label=String(cell.querySelector('b')?.textContent||'').trim();
      const person=findNewStaff(label);
      if(!person) return;
      const bg=staffColor(person);
      const fg=contrast(bg);
      const signature=`${id(person.id)}|${bg}|${fg}`;
      if(cell.dataset.v283ColorApplied===signature) return;
      cell.style.setProperty('--staff-bg',bg);
      cell.style.setProperty('--staff-fg',fg);
      cell.style.setProperty('background',bg,'important');
      cell.style.setProperty('color',fg,'important');
      cell.dataset.v283ColorApplied=signature;
      cell.title=`${label} · น้องใหม่`;
    });
  }

  function addReadableTitles(){
    if(!isTargetPage()) return;
    document.querySelectorAll('.v281-admin-position-page .v275-position-cell select, .v281-admin-position-page .v275-mentor-cell select').forEach(select=>{
      const text=String(select.options?.[select.selectedIndex]?.text||select.value||'').trim();
      if(text) select.title=text;
    });
  }

  function enhance(){
    if(!isTargetPage()) return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(page&&wrap){
      page.classList.add('v283-readable-position-page');
      wrap.classList.add('v283-readable-position-wrap');
    }
    applyTraineeColors();
    addReadableTitles();
  }
  function queueEnhance(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance();});
  }

  document.addEventListener('change',event=>{
    if(event.target?.matches?.('.v275-position-cell select, .v275-mentor-cell select')) queueEnhance();
  },true);

  const style=document.createElement('style');
  style.id='v283-position-matrix-readable-trainee-color-style';
  style.textContent=`
    /* Readable width + compact height. Overrides V281 only on Admin monthly position page. */
    .v283-readable-position-page .v283-readable-position-wrap{
      --v276-position-name-width:78px!important;
      width:100%!important;
      max-width:100%!important;
      overflow:auto!important;
      overscroll-behavior:contain!important;
      scrollbar-gutter:stable both-edges;
    }
    .v283-readable-position-page .v275-position-table{
      font-size:8px!important;
      line-height:1!important;
    }
    .v283-readable-position-page .v275-position-table th,
    .v283-readable-position-page .v275-position-table td{
      min-width:76px!important;
      width:76px!important;
      max-width:76px!important;
      padding:1px 2px!important;
    }
    .v283-readable-position-page .v275-position-table tr>:nth-child(1){
      width:78px!important;min-width:78px!important;max-width:78px!important;
    }
    .v283-readable-position-page .v275-position-table tr>:nth-child(2){
      left:78px!important;
      width:92px!important;min-width:92px!important;max-width:92px!important;
    }
    .v283-readable-position-page .v275-position-table tbody tr:not(.v275-count-row)>th,
    .v283-readable-position-page .v275-position-table tbody tr:not(.v275-count-row)>td,
    .v283-readable-position-page .v275-position-day{
      height:27px!important;min-height:27px!important;max-height:27px!important;
    }
    .v283-readable-position-page .v275-count-row>th,
    .v283-readable-position-page .v275-count-row>td{
      height:28px!important;min-height:28px!important;max-height:28px!important;
    }
    .v283-readable-position-page .v275-position-cell{
      display:block!important;
      position:relative!important;
      width:100%!important;
      height:23px!important;
      min-height:23px!important;
    }
    .v283-readable-position-page .v275-position-cell select,
    .v283-readable-position-page .v275-mentor-cell select{
      display:block!important;
      width:100%!important;
      min-width:0!important;
      height:23px!important;
      min-height:23px!important;
      padding:0 17px 0 5px!important;
      border-radius:5px!important;
      font-size:8px!important;
      line-height:21px!important;
      text-overflow:ellipsis!important;
    }
    .v283-readable-position-page .v275-info{
      right:2px!important;top:4px!important;
      width:12px!important;height:12px!important;min-width:12px!important;
      font-size:6px!important;line-height:12px!important;
    }
    .v283-readable-position-page .v275-sticky-name b{
      font-size:8.5px!important;line-height:1!important;padding:0 2px!important;
      white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
    }
    .v283-readable-position-page .v275-sticky-name small{
      font-size:6.5px!important;line-height:1!important;margin-top:1px!important;
    }
    .v283-readable-position-page .v275-summary-cell>b{
      font-size:7.5px!important;line-height:1!important;white-space:nowrap!important;
    }
    .v283-readable-position-page .v275-date-head b{font-size:8px!important;line-height:1!important}
    .v283-readable-position-page .v275-date-head small{font-size:6.5px!important;line-height:1!important}
    .v283-readable-position-page .v275-date-head em{
      max-width:72px!important;font-size:5.8px!important;line-height:1!important;
    }
    .v283-readable-position-page .v275-count-row input[data-v275-slot]{
      width:26px!important;height:20px!important;min-height:20px!important;
      padding:0 2px!important;font-size:8px!important;
    }
    .v283-readable-position-page .v275-position-day.leave .badge,
    .v283-readable-position-page .v275-position-day.leave span{
      font-size:6.5px!important;padding:1px 4px!important;line-height:1!important;
    }
    .v283-readable-position-page .v275-mentor-cell{
      height:25px!important;min-height:25px!important;gap:0!important;overflow:hidden!important;
    }
    .v283-readable-position-page .v275-mentor-cell span,
    .v283-readable-position-page .v275-mentor-cell small{
      font-size:5.8px!important;line-height:1!important;white-space:nowrap!important;
      overflow:hidden!important;text-overflow:ellipsis!important;
    }
    /* New staff keeps their personal staff color. Intern remains orange. */
    .v283-readable-position-page .v275-trainee-row .trainee-name[data-v283-color-applied]:not([data-v283-color-applied="intern"]){
      border-top:1px solid rgba(255,255,255,.45)!important;
    }

    @media(max-width:820px){
      .v283-readable-position-page .v283-readable-position-wrap{--v276-position-name-width:70px!important}
      .v283-readable-position-page .v275-position-table th,
      .v283-readable-position-page .v275-position-table td{
        min-width:68px!important;width:68px!important;max-width:68px!important;
      }
      .v283-readable-position-page .v275-position-table tr>:nth-child(1){
        width:70px!important;min-width:70px!important;max-width:70px!important;
      }
      .v283-readable-position-page .v275-position-table tr>:nth-child(2){
        left:70px!important;width:86px!important;min-width:86px!important;max-width:86px!important;
      }
      .v283-readable-position-page .v275-position-cell select,
      .v283-readable-position-page .v275-mentor-cell select{font-size:7.5px!important}
    }
  `;
  document.head.appendChild(style);

  const root=document.getElementById('pageContent')||document.documentElement;
  const observer=new MutationObserver(queueEnhance);
  observer.observe(root,{subtree:true,childList:true});
  window.addEventListener('resize',queueEnhance,{passive:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,80));
  setTimeout(enhance,0);
  setTimeout(enhance,180);
  setTimeout(enhance,600);

  window.cnmiV283={enhance,applyTraineeColors};
  console.info(`${VERSION} loaded`);
})();
