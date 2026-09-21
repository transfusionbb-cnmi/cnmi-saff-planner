/* CNMI Staff Planner V551 — Mobile UI clarity, UI-only safe patch
   Scope only:
   1) restore staff colors in dashboard split-duty rows
   2) compact partial-trade labels in monthly roster
   3) keep those labels inside their own day cell
   4) normalize RACE phase typography on mobile
   5) make My Training open with a useful year automatically and show year before status
   No auth / PWA / service worker / roster / leave / OT / RACE assignment logic changes.
*/
(function(){
  'use strict';
  const VERSION='V551_MOBILE_UI_CLARITY_SAFE';
  if(window.__CNMI_V551_MOBILE_UI_CLARITY_SAFE__) return;
  window.__CNMI_V551_MOBILE_UI_CLARITY_SAFE__=true;

  function S(){ try{return window.state || state || {};}catch(_){return window.state||{};} }
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    catch(_){return String(v??'');}
  }
  function actorId(){
    try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||'';}
    catch(_){return S()?.profile?.id||'';}
  }
  function idEq(a,b){return String(a||'')===String(b||'');}
  function yearOf(value){
    const m=String(value||'').match(/^(\d{4})-/);
    if(m){const y=Number(m[1]);return Number.isInteger(y)?y:0;}
    const d=new Date(value||'');return Number.isFinite(d.getTime())?d.getFullYear():0;
  }
  function bestTrainingYear(){
    const s=S(),actor=actorId(),acts=Array.isArray(s.activities)?s.activities:[],records=Array.isArray(s.trainingRecords)?s.trainingRecords:[];
    const activityById=new Map(acts.map(a=>[String(a?.id||''),a]));
    const years=[];
    records.forEach(r=>{
      if(!r || r.is_included===false || r.form_type!=='existing' || !idEq(r.staff_id,actor)) return;
      const a=activityById.get(String(r.activity_id||''));
      const y=yearOf(a?.start_date);if(y>=2000&&y<=2200) years.push(y);
    });
    const current=new Date().getFullYear();
    if(years.includes(current)) return current;
    if(years.length) return Math.max(...years);
    return current;
  }
  function ensureTrainingYear(){
    const s=S();
    if(String(s?.page||'')!=='myTraining') return false;
    const y=Number(s.v407TrainingYear||0);
    if(Number.isInteger(y)&&y>=2000&&y<=2200) return false;
    const picked=bestTrainingYear();
    s.v407TrainingYear=String(picked);
    s.v396MyFrom=`${picked}-01-01`;
    s.v396MyTo=`${picked}-12-31`;
    if(!['รอกรอกข้อมูล','กรอกข้อมูลแล้ว','all'].includes(String(s.v402MyStatus||''))) s.v402MyStatus='รอกรอกข้อมูล';
    s.v417MyTrainingPage=1;
    return true;
  }

  function staffByVisibleName(name){
    const key=String(name||'').trim();if(!key)return null;
    const staff=Array.isArray(S()?.staff)?S().staff:[];
    return staff.find(x=>String(x?.nickname||'').trim()===key) || staff.find(x=>String(x?.full_name||'').trim()===key) || null;
  }
  function colorFor(st){
    try{return typeof staffColor==='function'?staffColor(st):st?.staff_color||st?.color||'#e8f3ff';}
    catch(_){return st?.staff_color||st?.color||'#e8f3ff';}
  }
  function textFor(bg){
    try{return typeof textColorFor==='function'?textColorFor(bg):'#203245';}
    catch(_){return '#203245';}
  }

  function fixDashboardSplitColors(root=document){
    root.querySelectorAll?.('.v548-duty-summary-line .staff-color-pill').forEach(pill=>{
      const st=staffByVisibleName(pill.textContent);if(!st)return;
      const bg=colorFor(st),fg=textFor(bg);
      pill.style.setProperty('--staff-bg',bg);
      pill.style.setProperty('--staff-fg',fg);
      pill.style.setProperty('background',bg,'important');
      pill.style.setProperty('background-color',bg,'important');
      pill.style.setProperty('color',fg,'important');
      pill.style.setProperty('border-color','rgba(31,50,69,.14)','important');
      pill.classList.add('v551-restored-staff-color');
    });
  }

  function compactReceivedText(full){
    const text=String(full||'').replace(/\s+/g,' ').trim();
    const m=text.match(/รับช่วง\s*(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
    if(m){
      let start=Number(m[1])*60+Number(m[2]),end=Number(m[3])*60+Number(m[4]);
      if(end<=start)end+=1440;
      const hours=Math.round((end-start)/60*100)/100;
      const h=Number.isInteger(hours)?String(hours):String(hours).replace(/\.0+$/,'');
      return `รับ ${h}ชม.`;
    }
    if(/^รับช่วง\s+/.test(text)) return text.replace(/^รับช่วง\s+/,'รับ ');
    return text;
  }
  function compactRosterHtml(html){
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      tpl.content.querySelectorAll('.clean-schedule-grid .clean-shift-pill.v217-received').forEach(btn=>{
        const full=String(btn.textContent||'').trim();if(!full)return;
        const short=compactReceivedText(full);
        btn.dataset.v551FullTradeLabel=full;
        btn.setAttribute('title',full);
        btn.setAttribute('aria-label',full);
        btn.textContent=short;
        btn.classList.add('v551-trade-compact');
      });
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] roster compact skipped`,err);return html;}
  }

  const previousGrid=window.renderGridView || (typeof renderGridView==='function'?renderGridView:null);
  if(typeof previousGrid==='function'){
    const wrappedGrid=function renderGridViewV551(){return compactRosterHtml(previousGrid.apply(this,arguments));};
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  function decorateTraining(root=document){
    if(String(S()?.page||'')!=='myTraining')return;
    const filters=root.querySelector?.('.v417-my-training-filters');
    if(filters){
      const year=filters.querySelector('#v407TrainingYear')?.closest('label');
      const status=filters.querySelector('#v402MyStatus')?.closest('label');
      const exp=filters.querySelector('.v402-export-wrap');
      if(year){year.classList.add('v551-training-year');year.style.order='1';}
      if(status){status.classList.add('v551-training-status');status.style.order='2';}
      if(exp){exp.classList.add('v551-training-export');exp.style.order='3';}
    }
    const card=root.querySelector?.('.v416-training-page');
    const hint=card?.querySelector('.section-title .hint');
    if(hint && hint.textContent!=='ระบบเลือกปีล่าสุดที่มีข้อมูลให้แล้ว • เปลี่ยนปีหรือสถานะได้ตามต้องการ') hint.textContent='ระบบเลือกปีล่าสุดที่มีข้อมูลให้แล้ว • เปลี่ยนปีหรือสถานะได้ตามต้องการ';
    card?.querySelectorAll?.('.v416-selection-prompt').forEach(box=>{
      if(S().v407TrainingYear) box.remove();
    });
  }

  function setVersion551(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      if(chip.textContent!=='v551') chip.textContent='v551';
      if(chip.title!=='Mobile UI clarity + training flow polish (V551)') chip.title='Mobile UI clarity + training flow polish (V551)';
    });
  }
  function applyUi(root=document){
    fixDashboardSplitColors(root);
    decorateTraining(root);
    setVersion551(root);
  }
  let queued=false;
  function queueUi(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;applyUi(document);});
  }

  const previousRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'){
    let retry=false;
    const wrappedPage=function renderPageV551(){
      let result=previousRenderPage.apply(this,arguments);
      if(!retry && String(S()?.page||'')==='myTraining' && ensureTrainingYear()){
        retry=true;
        try{result=previousRenderPage.apply(this,arguments);}finally{retry=false;}
      }
      queueUi();
      return result;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v551-mobile-ui-clarity-safe';
  style.textContent=`
    /* 1 — keep person colors visible in dashboard split-duty rows */
    .v548-duty-summary-line .staff-color-pill.v551-restored-staff-color{
      background:var(--staff-bg)!important;color:var(--staff-fg)!important;
      border-color:rgba(31,50,69,.14)!important;box-shadow:none!important
    }

    /* 2/3 — compact receive-part chips; never spill into the next day */
    .clean-schedule-grid td{min-width:0}
    .clean-schedule-grid .clean-cell-stack{max-width:100%;min-width:0;overflow:hidden}
    .clean-schedule-grid .clean-shift-pill.v551-trade-compact{
      display:inline-flex!important;align-items:center!important;justify-content:center!important;
      width:auto!important;max-width:100%!important;min-width:0!important;
      padding:2px 5px!important;margin:0 auto!important;border-radius:999px!important;
      font-size:10px!important;line-height:1.1!important;font-weight:850!important;
      white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
      box-sizing:border-box!important
    }

    /* 4 — RACE hierarchy: title only slightly larger than explanation */
    .v497-phase-tabs b{font-size:12px!important;line-height:1.2!important;font-weight:850!important}
    .v497-phase-tabs small{font-size:9.5px!important;line-height:1.35!important;font-weight:500!important;color:#73879a!important}
    @media(max-width:820px){
      .v497-phase-tabs b{font-size:12.5px!important}
      .v497-phase-tabs small{font-size:10.5px!important;line-height:1.35!important}
      .v497-phase-tabs button{padding:9px 10px!important}
      .clean-schedule-grid .clean-shift-pill.v551-trade-compact{font-size:9.5px!important;padding:2px 4px!important}
    }

    /* 5 — training: year first, then status, then export */
    .v417-my-training-filters{align-items:end!important}
    .v417-my-training-filters .v551-training-year{order:1}
    .v417-my-training-filters .v551-training-status{order:2}
    .v417-my-training-filters .v551-training-export{order:3}
    @media(max-width:820px){
      .v417-my-training-filters{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
      .v417-my-training-filters>label,.v417-my-training-filters>.v402-export-wrap{width:100%!important;min-width:0!important}
      .v417-my-training-filters select,.v417-my-training-filters button{width:100%!important}
    }
  `;
  document.head.appendChild(style);

  const start=()=>{
    applyUi(document);
    const root=document.getElementById('pageContent')||document.body;
    if(window.MutationObserver&&root){
      const obs=new MutationObserver(()=>queueUi());
      obs.observe(root,{childList:true,subtree:true});
      window.__CNMI_V551_UI_OBSERVER__=obs;
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info(`[${VERSION}] loaded`);
})();
