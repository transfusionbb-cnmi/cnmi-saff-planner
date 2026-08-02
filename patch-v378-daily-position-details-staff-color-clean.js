/* CNMI Staff Planner V378
   Daily daytime position display fixes only:
   1) Removes the confusing "เกินจากชุด Slot วันนี้" marker while keeping the saved row.
   2) Restores each staff member's configured color on daily-position names.
   3) Shows the full duty description inside every mobile/PWA position card.
   4) Shows the full duty description in the desktop table instead of an ellipsis.
   No Supabase/schema/OT/monthly Slot calculation changes.
*/
(function(){
  'use strict';
  const VERSION='V378_DAILY_POSITION_DETAILS_STAFF_COLOR_CLEAN';
  if(window.__CNMI_V378_DAILY_POSITION_DETAILS_STAFF_COLOR_CLEAN__)return;
  window.__CNMI_V378_DAILY_POSITION_DETAILS_STAFF_COLOR_CLEAN__=true;

  let queued=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function esc(v){
    try{if(typeof escapeHtml==='function')return escapeHtml(v==null?'':String(v));}catch(_){}
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function page(){return text(S()?.page);}
  function rows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return [];
  }
  function codeOf(row){return text(row?.position_code||row?.code);}
  function plannedId(row){return text(row?._planned_staff_id||row?.staff_id);}
  function personById(id){return (S()?.staff||[]).find(person=>text(person?.id)===text(id))||null;}
  function personName(id){
    const p=personById(id);
    return text(p?.nickname||p?.nick_name||p?.display_name||p?.full_name||p?.email)||'ว่าง';
  }
  function colorOf(id){
    const p=personById(id);
    try{if(typeof staffColor==='function')return staffColor(p||id)||'#e8f3ff';}catch(_){}
    try{if(typeof window.staffColor==='function')return window.staffColor(p||id)||'#e8f3ff';}catch(_){}
    return text(p?.color||p?.staff_color)||'#e8f3ff';
  }
  function foreground(bg){
    try{if(typeof textColorFor==='function')return textColorFor(bg);}catch(_){}
    try{if(typeof window.textColorFor==='function')return window.textColorFor(bg);}catch(_){}
    const hex=text(bg).replace('#','');
    if(!/^[0-9a-f]{6}$/i.test(hex))return'#203245';
    const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
    return((r*299+g*587+b*114)/1000)>145?'#203245':'#ffffff';
  }
  function useful(v){const s=text(v);return !!s&&!['-','--','—'].includes(s)&&!/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);}
  function positionMaster(code){
    const key=text(code).replace(/\s+/g,'').toLowerCase();
    for(const list of [S()?.positionMasters,S()?.dailyPositionMasters,S()?.positions]){
      if(!Array.isArray(list))continue;
      const found=list.find(item=>text(item?.code||item?.position_code).replace(/\s+/g,'').toLowerCase()===key);
      if(found)return found;
    }
    try{if(typeof positionByCode==='function')return positionByCode(code)||{};}catch(_){}
    try{if(typeof window.positionByCode==='function')return window.positionByCode(code)||{};}catch(_){}
    return{};
  }
  function detailOf(row,holder){
    const select=holder?.querySelector?.('select[data-position-row]');
    const code=codeOf(row)||text(select?.dataset?.positionCode)||text(holder?.querySelector?.('h2,h3,h4')?.textContent);
    const master=positionMaster(code);
    const direct=[row?.job_desc,row?.description,select?.dataset?.positionJob,master?.job_desc,master?.description]
      .map(text).find(useful);
    if(direct)return direct;
    try{
      const enriched=window.cnmiV372?.enrich?.({...master,...row},code);
      const fromPatch=text(enriched?.job_desc||enriched?.description);
      if(useful(fromPatch))return fromPatch;
    }catch(_){}
    return `ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${code||'ที่ได้รับมอบหมาย'}`;
  }

  function removeExtraSlotMarker(root){
    root.querySelectorAll?.('.badge,span,small')?.forEach(node=>{
      if(/^เกินจากชุด\s*Slot\s*วันนี้$/i.test(text(node.textContent)))node.remove();
    });
    root.querySelectorAll?.('.v225-extra-plan-row')?.forEach(node=>node.classList.remove('v225-extra-plan-row'));
  }

  function applyNameColor(holder,staffId){
    if(!holder)return;
    if(!staffId){
      holder.classList.remove('v378-has-staff-color');
      holder.style.removeProperty('--v378-staff-bg');
      holder.style.removeProperty('--v378-staff-fg');
      holder.removeAttribute('data-v378-staff-name');
      return;
    }
    const bg=colorOf(staffId),fg=foreground(bg);
    holder.classList.add('v378-has-staff-color');
    holder.style.setProperty('--v378-staff-bg',bg);
    holder.style.setProperty('--v378-staff-fg',fg);
    holder.dataset.v378StaffName=personName(staffId);
    holder.title=text(personById(staffId)?.full_name||personName(staffId));
  }

  function enhanceCards(area,data){
    const cards=Array.from(area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
    cards.forEach((card,index)=>{
      const row=data[index]||{};
      const pid=plannedId(row);
      applyNameColor(card.querySelector('.v322-baseline-box'),pid);

      const job=detailOf(row,card);
      let detail=card.querySelector(':scope > .v378-position-duty-card');
      if(!detail){
        detail=document.createElement('section');
        detail.className='v378-position-duty-card';
      }
      const nextHtml=`<span class="v378-position-duty-label">หน้าที่วันนี้</span><p>${esc(job)}</p>`;
      if(detail.innerHTML!==nextHtml)detail.innerHTML=nextHtml;

      const baseline=card.querySelector(':scope > .v322-baseline-box');
      const label=card.querySelector(':scope > label');
      const actions=card.querySelector(':scope > .actions');
      const anchor=label||actions;
      if(baseline){
        if(baseline.nextElementSibling!==detail)baseline.insertAdjacentElement('afterend',detail);
      }else if(anchor){
        if(detail.nextElementSibling!==anchor)card.insertBefore(detail,anchor);
      }else if(detail.parentElement!==card){
        card.appendChild(detail);
      }

    });
  }

  function enhanceTable(area,data){
    const tableRows=Array.from(area.querySelectorAll('.v225-daily-position-table tbody tr'));
    tableRows.forEach((tr,index)=>{
      const row=data[index]||{};
      const pid=plannedId(row);
      applyNameColor(tr.querySelector('.v322-desktop-baseline')||tr.children?.[3],pid);

      const job=detailOf(row,tr);
      const cell=tr.lastElementChild;
      if(!cell)return;
      cell.classList.add('v378-full-job-cell');
      let full=cell.querySelector(':scope > .v378-job-text');
      const legacy=cell.querySelector(':scope > .v225-job-short,:scope > .v219-job-short');
      if(!full&&legacy){
        full=legacy;
        full.classList.remove('v225-job-short','v219-job-short','muted','v265-description-hidden');
        full.classList.add('v378-job-text');
        full.style.removeProperty('display');
      }
      if(!full){
        full=document.createElement('span');
        full.className='v378-job-text';
        cell.appendChild(full);
      }
      if(text(full.textContent)!==job)full.textContent=job;
      full.title=job;
    });
  }

  function enhance(root=document){
    if(page()!=='positions')return;
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page')||document.querySelector('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    const data=rows();
    removeExtraSlotMarker(area);
    enhanceCards(area,data);
    enhanceTable(area,data);
    area.dataset.v378DailyPositionDisplay='1';
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance(document);});
  }

  const style=document.createElement('style');
  style.id='v378-daily-position-details-staff-color-style';
  style.textContent=`
    .v225-extra-plan-row td{background:inherit!important}
    .v322-baseline-box.v378-has-staff-color .v322-baseline-name,
    .v322-desktop-baseline.v378-has-staff-color b{
      display:inline-flex!important;align-items:center!important;justify-content:center!important;
      width:max-content!important;max-width:100%!important;min-width:42px!important;
      padding:6px 12px!important;border-radius:999px!important;
      background:var(--v378-staff-bg,#e8f3ff)!important;color:var(--v378-staff-fg,#203245)!important;
      border:1px solid rgba(31,50,69,.14)!important;font-weight:900!important;line-height:1.15!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.55)!important;
    }
    .position-mobile-card.v225-position-card > .v296-position-duty-preview,
    .position-mobile-card.v225-position-card > .v311-position-duty-preview,
    .position-mobile-card.v225-position-card > .v323-position-duty-preview{display:none!important}
    .v378-position-duty-card{
      display:block!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;
      padding:13px 14px!important;border:1px solid #d7e7f7!important;border-radius:15px!important;
      background:#f8fbff!important;color:#263b52!important;
    }
    .v378-position-duty-label{display:block;margin-bottom:5px;color:#2563eb;font-size:13px;font-weight:900}
    .v378-position-duty-card p{margin:0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.6!important;overflow-wrap:anywhere!important}
    .v225-daily-position-table td.v378-full-job-cell{min-width:360px!important;max-width:560px!important;white-space:normal!important;vertical-align:top!important}
    .v225-daily-position-table .v378-job-text{
      display:block!important;max-width:none!important;margin-top:6px!important;
      white-space:normal!important;overflow:visible!important;text-overflow:clip!important;
      line-height:1.55!important;color:#52657a!important;overflow-wrap:anywhere!important;
    }
    @media(max-width:760px){
      .position-mobile-card.v225-position-card{
        grid-template-areas:"head" "meta" "plan" "duty" "edit" "compare" "action"!important;
      }
      .position-mobile-card.v225-position-card > .v378-position-duty-card{grid-area:duty!important}
      .v322-baseline-box.v378-has-staff-color .v322-baseline-name{font-size:17px!important}
    }
  `;
  document.head.appendChild(style);

  const install=()=>{
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v378DailyPositionObserver){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v378DailyPositionObserver=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);
  document.addEventListener('change',event=>{if(event.target?.closest?.('#positionDateInput,select[data-position-row]'))setTimeout(queue,0);},true);

  window.cnmiV378={version:VERSION,enhance,detailOf,removeExtraSlotMarker};
  console.info(`[${VERSION}] loaded`);
})();
