/* CNMI Staff Planner V286
   1) Daily daytime-position page: stable route, correct page heading, and safe date changes
      for Staff / Incharge / Admin on desktop and mobile.
   2) Staff monthly daytime-position page: compact row height on mobile/desktop.
   3) New-staff trainee rows use the staff member's own color; external Intern rows remain neutral.
   No Supabase schema, Slot, mentor, roster, or balance calculation is changed.
*/
(function(){
  'use strict';
  const VERSION='V286_DAILY_POSITION_STABLE_ROUTE_STAFF_MONTH_COMPACT';
  if(window.__CNMI_V286_DAILY_POSITION_STABLE_ROUTE_STAFF_MONTH_COMPACT__) return;
  window.__CNMI_V286_DAILY_POSITION_STABLE_ROUTE_STAFF_MONTH_COMPACT__=true;

  let dailyRenderQueued=false;
  let dailyRendering=false;
  let dailyActionBusy=false;
  let decorateQueued=false;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function isDaily(){return String(S()?.page||'')==='positions';}
  function isStaffMonth(){return String(S()?.page||'')==='positionMonthView';}
  function assignGlobal(name,value){
    try{window[name]=value;}catch(_){}
    try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){}
  }
  function esc(value){
    try{return escapeHtml(String(value??''));}
    catch(_){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function setDailyHeading(){
    if(!isDaily()) return;
    const title=document.getElementById('pageTitle');
    const subtitle=document.getElementById('pageSubtitle');
    if(title) title.textContent='ตารางตำแหน่งกลางวัน รายวัน';
    if(subtitle){subtitle.textContent='ดูหรือปรับตำแหน่งประจำวัน';subtitle.removeAttribute('aria-hidden');}
    try{
      const item=(window.NAV_ITEMS||NAV_ITEMS||[]).find(x=>x.id==='positions');
      if(item){item.title='ตารางตำแหน่งกลางวัน รายวัน';item.subtitle='ดูหรือปรับตำแหน่งประจำวัน';}
    }catch(_){}
  }
  function removeInvisibleBlockers(){
    if(!isDaily()) return;
    try{
      const modal=document.getElementById('modal');
      if(modal?.classList.contains('hidden')){
        modal.setAttribute('aria-hidden','true');
        modal.style.setProperty('display','none','important');
        modal.style.setProperty('pointer-events','none','important');
        document.body.classList.remove('modal-open');
      }
      document.querySelectorAll('.loading-overlay,.busy-overlay,.screen-overlay,.route-guard-overlay').forEach(node=>{
        if(node.classList.contains('hidden')||node.getAttribute('aria-hidden')==='true'||getComputedStyle(node).display==='none'){
          node.style.setProperty('pointer-events','none','important');
        }
      });
      const root=document.getElementById('pageContent');
      const app=document.getElementById('appView');
      [root,app].forEach(node=>{if(node){node.removeAttribute('inert');node.style.pointerEvents='auto';}});
      document.body.classList.remove('is-busy','route-loading','dragging');
    }catch(error){console.warn(`${VERSION}: blocker cleanup skipped`,error);}
  }
  function currentDailyRenderer(){
    try{
      const fn=window.renderPositionsPage||(typeof renderPositionsPage==='function'?renderPositionsPage:null);
      return typeof fn==='function'?fn:null;
    }catch(_){return typeof window.renderPositionsPage==='function'?window.renderPositionsPage:null;}
  }
  function renderDailyDirect(){
    if(!isDaily()||dailyRendering) return;
    dailyRendering=true;
    try{
      const input=document.getElementById('positionDateInput');
      if(input&&S()?.positionDate) input.value=S().positionDate;
      try{if(typeof renderNav==='function')renderNav();else window.renderNav?.();}catch(_){}
      setDailyHeading();
      const root=document.getElementById('pageContent');
      const renderer=currentDailyRenderer();
      if(root&&renderer){
        const html=renderer();
        root.innerHTML=String(html??'');
      }
      setDailyHeading();
      removeInvisibleBlockers();
    }catch(error){
      console.error(`${VERSION}: daily direct render failed`,error);
      const root=document.getElementById('pageContent');
      if(root) root.innerHTML=`<div class="card"><div class="notice error-notice">โหลดตารางตำแหน่งกลางวัน รายวันไม่สำเร็จ: ${esc(error?.message||error)}</div></div>`;
    }finally{
      dailyRendering=false;
      requestAnimationFrame(()=>{setDailyHeading();removeInvisibleBlockers();});
    }
  }
  function queueDailyRender(){
    if(dailyRenderQueued) return;
    dailyRenderQueued=true;
    setTimeout(()=>{
      dailyRenderQueued=false;
      if(isDaily()) renderDailyDirect();
    },0);
  }

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
      const p=staff.find(x=>id(x?.id)===id(item?.trainee_staff_id));
      const name=p?displayName(p):String(item?.trainee_name||'').trim();
      return norm(name)===key;
    });
    if(row?.trainee_staff_id){
      const p=staff.find(x=>id(x?.id)===id(row.trainee_staff_id));
      if(p)return p;
    }
    return staff.find(p=>[displayName(p),p?.alias,p?.nickname,p?.nick_name,p?.full_name,p?.name].some(v=>norm(v)===key))||null;
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

  /* Final route entry: bypass the long legacy render chain only for the daily position page. */
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRender&&!previousRender.__v286DailyStableRoute){
    const wrapped=function renderPageV286(){
      if(isDaily()){
        renderDailyDirect();
        return;
      }
      const result=previousRender.apply(this,arguments);
      if(isStaffMonth())setTimeout(queueDecorate,0);
      return result;
    };
    wrapped.__v286DailyStableRoute=true;
    assignGlobal('renderPage',wrapped);
  }

  /* One safe date-change path. It runs after the native picker event completes. */
  window.addEventListener('change',event=>{
    if(!isDaily()||event.target?.id!=='positionDateInput')return;
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
    const value=String(event.target.value||'').slice(0,10);
    if(!value)return;
    const st=S();
    if(st)st.positionDate=value;
    try{event.target.blur();}catch(_){}
    queueDailyRender();
  },true);

  /* Prevent duplicated legacy click listeners from firing daily actions more than once. */
  window.addEventListener('click',event=>{
    if(!isDaily())return;
    const target=event.target;
    const menu=target?.closest?.('#mobileMenuBtn');
    if(menu){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      document.getElementById('sidebar')?.classList.toggle('open');
      document.body.classList.toggle('sidebar-open');
      return;
    }
    const nav=target?.closest?.('[data-page]');
    if(nav){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      const next=String(nav.dataset.page||'dashboard');
      if(S())S().page=next;
      document.getElementById('sidebar')?.classList.remove('open');
      document.body.classList.remove('sidebar-open','modal-open');
      setTimeout(()=>window.renderPage?.(),0);
      return;
    }
    const action=target?.closest?.('[data-save-incharge],[data-save-positions],[data-publish-positions]');
    if(!action)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
    if(dailyActionBusy)return;
    const fnName=action.matches('[data-save-incharge]')?'saveIncharge':action.matches('[data-publish-positions]')?'publishPositionsForDay':'savePositions';
    let fn=null;
    try{fn=window[fnName]||(0,eval)(fnName);}catch(_){}
    if(typeof fn!=='function')return;
    dailyActionBusy=true;
    Promise.resolve(fn()).catch(error=>console.error(`${VERSION}: ${fnName}`,error)).finally(()=>{
      dailyActionBusy=false;
      if(isDaily())queueDailyRender();
    });
  },true);

  const style=document.createElement('style');
  style.id='v286-daily-position-stable-route-staff-month-compact-style';
  style.textContent=`
    #modal.hidden,.modal.hidden{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}

    /* Staff monthly position table: same compact vertical rhythm as Admin. */
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
    const observer=new MutationObserver(()=>{
      if(isDaily()){
        setDailyHeading();
        removeInvisibleBlockers();
      }
      if(isStaffMonth())queueDecorate();
    });
    observer.observe(root,{childList:true,subtree:true});
    window.__CNMI_V286_OBSERVER__=observer;
  }catch(_){}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{if(isDaily())renderDailyDirect();if(isStaffMonth())decorateStaffMonth();},80);
  });
  setTimeout(()=>{if(isDaily())renderDailyDirect();if(isStaffMonth())decorateStaffMonth();},0);
  setTimeout(()=>{if(isDaily()){setDailyHeading();removeInvisibleBlockers();}if(isStaffMonth())decorateStaffMonth();},400);

  window.cnmiV286={renderDailyDirect,setDailyHeading,decorateStaffMonth,applyStaffMonthTraineeColors};
  console.info(`${VERSION} loaded`);
})();
