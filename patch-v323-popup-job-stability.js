/* CNMI Staff Planner — V323
   PWA popup + daily job-description stability guard.
   - Keeps the daily job description visible together with V322 baseline comparison.
   - Provides a fallback popup route when an older interaction patch is unavailable.
   - Uses data already loaded in the page; no Supabase read/write is added.
*/
(function cnmiV323PopupJobStability(){
  'use strict';
  const VERSION='V323_POPUP_JOB_STABILITY';
  if(window.__CNMI_V323_POPUP_JOB_STABILITY__) return;
  window.__CNMI_V323_POPUP_JOB_STABILITY__=true;

  let queued=false;
  let lastFallbackKey='';
  let lastFallbackAt=0;

  function stateSafe(){
    try{if(typeof state!=='undefined'&&state)return state;}catch(_){}
    return window.state||{};
  }
  function text(value){return String(value==null?'':value).trim();}
  function esc(value){
    return text(value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
  function rows(){
    return window.__CNMI_V226_DAILY_POSITION_ROWS__
      || window.__CNMI_V225_DAILY_POSITION_ROWS__
      || [];
  }
  function positionCode(row,card){
    return text(row?.position_code||row?.code||card?.querySelector?.('select[data-position-code]')?.dataset?.positionCode);
  }
  function positionMaster(code){
    const st=stateSafe();
    for(const list of [st.positionMasters,st.dailyPositionMasters,st.positions]){
      if(!Array.isArray(list))continue;
      const found=list.find(item=>text(item?.code||item?.position_code)===text(code));
      if(found)return found;
    }
    try{if(typeof window.positionByCode==='function')return window.positionByCode(code)||{};}catch(_){}
    try{
      const list=window.DEFAULT_DAILY_POSITIONS||[];
      return (Array.isArray(list)?list:[]).find(item=>text(item?.code)===text(code))||{};
    }catch(_){return {};}
  }
  function jobText(row,card){
    const select=card?.querySelector?.('select[data-position-row],select[data-position-job]');
    const direct=text(row?.job_desc||row?.description||select?.dataset?.positionJob);
    if(direct)return direct;
    const master=positionMaster(positionCode(row,card));
    return text(master?.job_desc||master?.description)||'ยังไม่ได้ระบุรายละเอียดหน้าที่';
  }
  function ensureDailyJobDescriptions(){
    const root=document.getElementById('pageContent');
    const page=root?.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!page)return;
    try{
      if(window.cnmiV311?.keepDailyDutyText){
        window.cnmiV311.keepDailyDutyText(document);
        return;
      }
    }catch(error){console.warn(`[${VERSION}] V311 daily detail fallback`,error);}

    const data=rows();
    const cards=Array.from(page.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
    cards.forEach((card,index)=>{
      const job=jobText(data[index]||{},card);
      let preview=card.querySelector(':scope > .v311-position-duty-preview');
      if(!preview){
        preview=document.createElement('div');
        preview.className='v311-position-duty-preview v323-position-duty-preview';
      }
      const html=`<b>หน้าที่:</b><span>${esc(job)}</span>`;
      if(preview.innerHTML!==html)preview.innerHTML=html;
      const anchor=card.querySelector(':scope > .v322-baseline-box,:scope > label,:scope > .actions');
      if(anchor&&preview.nextElementSibling!==anchor)card.insertBefore(preview,anchor);
      else if(!anchor&&preview.parentElement!==card)card.appendChild(preview);
    });
  }
  function modalVisible(){
    const modal=document.getElementById('modal');
    return !!(modal&&!modal.classList.contains('hidden'));
  }
  function forceModal(html){
    const modal=document.getElementById('modal');
    const body=document.getElementById('modalBody');
    if(!modal||!body)return false;
    if(typeof html==='string')body.innerHTML=html;
    modal.classList.remove('hidden','modal-closing');
    modal.classList.add('modal-ready');
    document.body.classList.add('modal-open');
    return true;
  }
  function showModalSafe(html){
    try{
      if(typeof window.showModal==='function')window.showModal(html);
      else forceModal(html);
    }catch(_){forceModal(html);}
    requestAnimationFrame(()=>forceModal(null));
  }
  function thaiDate(date){
    try{if(typeof window.formatThaiDate==='function')return window.formatThaiDate(date);}catch(_){}
    return date;
  }
  function calendarPopup(date){
    try{if(window.cnmiV311?.openCalendar)return window.cnmiV311.openCalendar(date);}catch(_){}
    let all=[];
    try{if(typeof window.collectCalendarEvents==='function')all=window.collectCalendarEvents()||[];}catch(_){}
    const key=text(date).slice(0,10);
    const found=(Array.isArray(all)?all:[]).filter(item=>text(item?.date).slice(0,10)===key);
    const items=found.length?found.map(item=>`<div class="calendar-modal-row"><b>${esc(item?.title||'-')}</b></div>`).join(''):'<div class="empty-state">ไม่มีรายการในวันนี้</div>';
    showModalSafe(`<div class="v311-calendar-modal"><h2>${esc(thaiDate(key))}</h2><div class="calendar-modal-list">${items}</div></div>`);
  }
  function resolvePositionCode(node){
    const direct=text(node?.dataset?.v275Job||node?.dataset?.v273JobCode);
    if(direct)return direct;
    const card=node?.closest?.('.v225-position-card,.v219-position-card,.position-mobile-card');
    const fromCard=text(card?.querySelector?.('select[data-position-code]')?.dataset?.positionCode||card?.querySelector?.('h3')?.textContent);
    if(fromCard)return fromCard.replace(/\s+/g,' ').trim();
    const index=Number(node?.dataset?.v225PositionDetail||node?.dataset?.v226PositionDetail||node?.dataset?.positionDetailV219||node?.dataset?.v296PositionDetail);
    const row=Number.isInteger(index)?rows()[index]:null;
    return text(row?.position_code||row?.code);
  }
  function positionPopup(node){
    const code=resolvePositionCode(node);
    if(!code)return;
    try{
      if(window.cnmiV311?.openPosition){
        const proxy=document.createElement('button');
        proxy.setAttribute('data-v275-job',code);
        return window.cnmiV311.openPosition(proxy);
      }
    }catch(_){}
    const row=positionMaster(code)||{};
    showModalSafe(`<div class="v311-position-modal"><h2>${esc(code)}</h2><div class="v311-position-meta"><span><small>โซน</small><b>${esc(row?.zone||'-')}</b></span><span><small>เวลาพัก</small><b>${esc(row?.break_time||'-')}</b></span></div><div class="v311-position-box"><h3>ผู้ปฏิบัติหลัก / เงื่อนไข</h3><p>${esc(row?.main_rule||'-')}</p></div><div class="v311-position-box"><h3>รายละเอียดหน้าที่</h3><p>${esc(row?.job_desc||row?.description||'ยังไม่ได้ระบุรายละเอียดหน้าที่')}</p></div></div>`);
  }
  function tradePopup(node){
    try{if(window.cnmiV311?.openTrade)return window.cnmiV311.openTrade(node);}catch(_){}
    const id=text(node?.dataset?.tradeDuty);
    if(!id)return;
    try{
      if(typeof window.showTradeModal==='function'){
        window.showTradeModal(id);
        requestAnimationFrame(()=>forceModal(null));
      }
    }catch(error){console.warn(`[${VERSION}] trade popup fallback failed`,error);}
  }
  function actionFor(target){
    if(target?.nodeType===3)target=target.parentElement;
    if(!target?.closest)return null;
    const calendar=target.closest('[data-day-detail]');
    if(calendar)return {type:'calendar',node:calendar,key:`calendar:${text(calendar.dataset.dayDetail)}`};
    const position=target.closest('[data-v275-job],[data-v273-job-code],[data-v225-position-detail],[data-v226-position-detail],[data-position-detail-v219],[data-v296-position-detail]');
    if(position)return {type:'position',node:position,key:`position:${resolvePositionCode(position)}`};
    const trade=target.closest('[data-trade-duty],#scheduleTable .clean-shift-pill,.clean-schedule-grid .clean-shift-pill');
    if(trade)return {type:'trade',node:trade,key:`trade:${text(trade.dataset.tradeDuty||trade.textContent)}`};
    return null;
  }
  function fallbackAction(action){
    if(!action)return;
    const recent=window.__CNMI_LAST_POPUP_ACTION__;
    if(recent&&recent.key===action.key&&Date.now()-Number(recent.at||0)<900)return;
    if(modalVisible())return;
    const now=Date.now();
    if(action.key===lastFallbackKey&&now-lastFallbackAt<900)return;
    lastFallbackKey=action.key;
    lastFallbackAt=now;
    if(action.type==='calendar')calendarPopup(action.node.dataset.dayDetail);
    else if(action.type==='position')positionPopup(action.node);
    else if(action.type==='trade')tradePopup(action.node);
  }
  function delayedFallback(event){
    const action=actionFor(event.target);
    if(!action)return;
    setTimeout(()=>fallbackAction(action),0);
  }
  function queueEnhance(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      ensureDailyJobDescriptions();
    });
  }
  function injectStyle(){
    if(document.getElementById('v323-popup-job-stability-style'))return;
    const style=document.createElement('style');
    style.id='v323-popup-job-stability-style';
    style.textContent=`
      .modal:not(.hidden){z-index:100000!important}
      .v311-position-duty-preview,.v323-position-duty-preview{
        display:block!important;width:100%!important;min-width:0!important;
        box-sizing:border-box!important;position:relative!important;z-index:1!important
      }
      @media(max-width:760px){
        .position-mobile-card.v225-position-card{
          grid-template-areas:
            "head"
            "meta"
            "duty"
            "plan"
            "edit"
            "compare"
            "action"!important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  function install(){
    injectStyle();
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v323JobObserver){
      const observer=new MutationObserver(queueEnhance);
      observer.observe(root,{childList:true,subtree:true});
      root.__v323JobObserver=observer;
    }
    document.addEventListener('click',delayedFallback,true);
    document.addEventListener('pointerup',event=>{
      if(event.pointerType==='mouse')return;
      delayedFallback(event);
    },true);
    window.addEventListener('pageshow',queueEnhance);
    queueEnhance();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  window.cnmiV323={ensureDailyJobDescriptions,calendarPopup,positionPopup,tradePopup};
  console.info(`[${VERSION}] loaded; DOM-only, no extra Supabase traffic`);
})();
