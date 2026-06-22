/* CNMI Staff Planner V286 compatibility layer, revised for V287
   - Keeps Staff monthly daytime-position compact styling and trainee colors.
   - Removes the V286 daily-page route/date capture handlers because they could
     render stale state before the selected date was read from Supabase.
   - V287 owns the daily-page heading, route and authoritative date loading.
*/
(function(){
  'use strict';
  const VERSION='V286_STAFF_MONTH_COMPACT_COMPAT_V287';
  if(window.__CNMI_V286_DAILY_POSITION_STABLE_ROUTE_STAFF_MONTH_COMPACT__) return;
  window.__CNMI_V286_DAILY_POSITION_STABLE_ROUTE_STAFF_MONTH_COMPACT__=true;

  let decorateQueued=false;
  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function isStaffMonth(){return String(S()?.page||'')==='positionMonthView';}
  function norm(value){return String(value??'').trim().toLowerCase();}
  function id(value){return String(value??'').trim();}
  function displayName(person){
    if(!person)return'';
    try{if(typeof staffName==='function')return String(staffName(person)||'').trim();}catch(_){}
    return String(person.alias||person.nickname||person.nick_name||person.display_name||person.full_name||person.name||'').trim();
  }
  function colorOf(person){
    try{if(typeof staffColorSafe==='function')return staffColorSafe(person);}catch(_){}
    try{if(typeof staffColor==='function')return staffColor(person);}catch(_){}
    return person?.color||person?.staff_color||person?.theme_color||'#fff7ed';
  }
  function contrast(color){
    try{if(typeof textColorSafe==='function')return textColorSafe(color);}catch(_){}
    try{if(typeof textColorFor==='function')return textColorFor(color);}catch(_){}
    const raw=String(color||'').replace('#','');
    if(!/^[0-9a-f]{6}$/i.test(raw))return'#0f172a';
    const r=parseInt(raw.slice(0,2),16),g=parseInt(raw.slice(2,4),16),b=parseInt(raw.slice(4,6),16);
    return((r*299+g*587+b*114)/1000)>155?'#0f172a':'#fff';
  }
  function findTraineeStaff(label){
    const st=S();
    const staff=Array.isArray(st?.staff)?st.staff:[];
    const directory=Array.isArray(st?.traineeDirectoryV273)?st.traineeDirectoryV273:[];
    const key=norm(label);
    const row=directory.find(item=>{
      if(norm(item?.trainee_type||item?.type).includes('intern'))return false;
      const person=staff.find(x=>id(x?.id)===id(item?.trainee_staff_id));
      const name=person?displayName(person):String(item?.trainee_name||'').trim();
      return norm(name)===key;
    });
    if(row?.trainee_staff_id){
      const person=staff.find(x=>id(x?.id)===id(row.trainee_staff_id));
      if(person)return person;
    }
    return staff.find(person=>[displayName(person),person?.alias,person?.nickname,person?.nick_name,person?.full_name,person?.name].some(value=>norm(value)===key))||null;
  }
  function applyStaffMonthTraineeColors(){
    if(!isStaffMonth())return;
    document.querySelectorAll('.v286-staff-position-page .v275-trainee-row .v275-sticky-name.trainee-name').forEach(cell=>{
      const type=norm(cell.querySelector('small')?.textContent);
      if(type.includes('intern')){
        cell.style.removeProperty('--staff-bg');
        cell.style.removeProperty('--staff-fg');
        cell.style.removeProperty('background');
        cell.style.removeProperty('color');
        cell.dataset.v286TraineeColor='intern';
        return;
      }
      const label=String(cell.querySelector('b')?.textContent||'').trim();
      const person=findTraineeStaff(label);
      if(!person)return;
      const bg=colorOf(person),fg=contrast(bg),sig=`${id(person.id)}|${bg}|${fg}`;
      if(cell.dataset.v286TraineeColor===sig)return;
      cell.style.setProperty('--staff-bg',bg);
      cell.style.setProperty('--staff-fg',fg);
      cell.style.setProperty('background',bg,'important');
      cell.style.setProperty('color',fg,'important');
      cell.dataset.v286TraineeColor=sig;
      cell.title=`${label} · น้องใหม่`;
    });
  }
  function decorateStaffMonth(){
    if(!isStaffMonth())return;
    const page=document.querySelector('.v275-page');
    const wrap=page?.querySelector('.v275-position-wrap');
    if(page)page.classList.add('v286-staff-position-page');
    if(wrap)wrap.classList.add('v286-staff-position-wrap');
    applyStaffMonthTraineeColors();
  }
  function queueDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    requestAnimationFrame(()=>{decorateQueued=false;decorateStaffMonth();});
  }

  const style=document.createElement('style');
  style.id='v286-daily-position-stable-route-staff-month-compact-style';
  style.textContent=`
    #modal.hidden,.modal.hidden{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
    .v286-staff-position-page .v286-staff-position-wrap{max-height:68vh!important;overflow:auto!important;overscroll-behavior:contain!important;scrollbar-gutter:stable both-edges}
    .v286-staff-position-page .v275-position-table{font-size:8px!important;line-height:1!important}
    .v286-staff-position-page .v275-position-table th,
    .v286-staff-position-page .v275-position-table td{padding:1px 2px!important}
    .v286-staff-position-page .v275-position-table tbody tr:not(.v275-count-row)>th,
    .v286-staff-position-page .v275-position-table tbody tr:not(.v275-count-row)>td,
    .v286-staff-position-page .v275-position-day{height:29px!important;min-height:29px!important;max-height:29px!important}
    .v286-staff-position-page .v275-count-row>th,
    .v286-staff-position-page .v275-count-row>td{height:28px!important;min-height:28px!important;max-height:28px!important}
    .v286-staff-position-page .v275-sticky-name b{font-size:8.5px!important;line-height:1!important;padding:0 2px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .v286-staff-position-page .v275-sticky-name small{font-size:6.5px!important;line-height:1!important;margin-top:1px!important}
    .v286-staff-position-page .v275-summary-cell{gap:0!important}
    .v286-staff-position-page .v275-summary-cell>b{font-size:7.5px!important;line-height:1!important;white-space:nowrap!important}
    .v286-staff-position-page .v275-summary-cell span,
    .v286-staff-position-page .v275-summary-cell small{font-size:6.5px!important;line-height:1!important}
    .v286-staff-position-page .v275-date-head b{font-size:8px!important;line-height:1!important}
    .v286-staff-position-page .v275-date-head small{font-size:6.5px!important;line-height:1!important}
    .v286-staff-position-page .v275-date-head em{font-size:5.8px!important;line-height:1!important}
    .v286-staff-position-page .v275-position-pill{font-size:7px!important;line-height:1!important;padding:2px 4px!important;white-space:nowrap!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .v286-staff-position-page .v275-position-day.leave .mini-status{font-size:6.5px!important;line-height:1!important;padding:1px 4px!important}
    .v286-staff-position-page .v275-position-day.trainee>b{font-size:6.8px!important;line-height:1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .v286-staff-position-page .v275-position-day.trainee>small{font-size:6px!important;line-height:1!important}
    .v286-staff-position-page .v275-trainee-summary{font-size:6.5px!important;line-height:1!important;gap:0!important}
    .v286-staff-position-page .v275-trainee-row .trainee-name[data-v286-trainee-color]:not([data-v286-trainee-color="intern"]){border-top:1px solid rgba(255,255,255,.45)!important}
    @media(max-width:820px){
      .v286-staff-position-page .v286-staff-position-wrap{max-height:66vh!important}
      .v286-staff-position-page .v275-position-table tbody tr:not(.v275-count-row)>th,
      .v286-staff-position-page .v275-position-table tbody tr:not(.v275-count-row)>td,
      .v286-staff-position-page .v275-position-day{height:27px!important;min-height:27px!important;max-height:27px!important}
      .v286-staff-position-page .v275-position-table th,
      .v286-staff-position-page .v275-position-table td{padding:1px!important}
    }
  `;
  document.head.appendChild(style);

  try{
    const root=document.getElementById('pageContent')||document.body;
    const observer=new MutationObserver(()=>{if(isStaffMonth())queueDecorate();});
    observer.observe(root,{childList:true,subtree:true});
    window.__CNMI_V286_OBSERVER__=observer;
  }catch(_){}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(decorateStaffMonth,80));
  setTimeout(decorateStaffMonth,0);
  setTimeout(decorateStaffMonth,400);

  window.cnmiV286={decorateStaffMonth,applyStaffMonthTraineeColors};
  console.info(`${VERSION} loaded`);
})();
