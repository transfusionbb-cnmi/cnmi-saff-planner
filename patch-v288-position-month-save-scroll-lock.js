/* CNMI Staff Planner V288
   Admin monthly daytime-position scroll lock after autosave.
   - Keeps the same horizontal date and vertical staff row after position/mentor changes.
   - Survives delayed rerenders from Supabase and background loaders.
   - Real user scrolling becomes the new position; programmatic DOM replacement cannot reset it to day 1.
   - Month changes and navigation intentionally clear the saved viewport.
   No SQL or schema change is required.
*/
(function(){
  'use strict';
  const VERSION='V288_POSITION_MONTH_SAVE_SCROLL_LOCK';
  if(window.__CNMI_V288_POSITION_MONTH_SAVE_SCROLL_LOCK__)return;
  window.__CNMI_V288_POSITION_MONTH_SAVE_SCROLL_LOCK__=true;

  const LOCK_MS=8000;
  const RESTORE_DELAYS=[0,18,48,95,170,290,470,760,1220,1940,3060,4300,6100,7900];
  let snapshot=null;
  let serial=0;
  let applying=false;
  let userIntentUntil=0;
  let observer=null;
  let timers=[];

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function isAdminSafe(){
    try{return !!isAdmin();}
    catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isTarget(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}
  function monthKey(){return String(S()?.positionMonthKey||S()?.monthKey||'').slice(0,7);}
  function scroller(){return document.querySelector('.v275-position-wrap');}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function cssEscape(value){
    try{return CSS.escape(String(value??''));}
    catch(_){return String(value??'').replace(/["\\]/g,'\\$&');}
  }
  function cancelTimers(){timers.forEach(clearTimeout);timers=[];}
  function clear(reason){
    snapshot=null;
    serial+=1;
    cancelTimers();
    if(reason)console.info(`${VERSION}: viewport cleared`,reason);
  }
  function anchorFrom(target,wrap){
    const node=target?.closest?.('[data-v275-position-cell],[data-v275-mentor-cell],[data-v275-slot]');
    if(!node||!wrap?.contains(node))return null;
    const holder=node.matches('[data-v275-slot]')?node.closest('td,th'):node;
    const rect=(holder||node).getBoundingClientRect();
    const wrapRect=wrap.getBoundingClientRect();
    return{
      kind:node.hasAttribute('data-v275-position-cell')?'position':node.hasAttribute('data-v275-mentor-cell')?'mentor':'slot',
      date:String(node.dataset?.date||''),
      staffId:String(node.dataset?.staffId||''),
      identity:String(node.dataset?.identity||''),
      offsetX:rect.left-wrapRect.left,
      offsetY:rect.top-wrapRect.top
    };
  }
  function findAnchor(anchor){
    if(!anchor)return null;
    if(anchor.kind==='position'&&anchor.date&&anchor.staffId){
      return document.querySelector(`[data-v275-position-cell][data-date="${cssEscape(anchor.date)}"][data-staff-id="${cssEscape(anchor.staffId)}"]`);
    }
    if(anchor.kind==='mentor'&&anchor.date&&anchor.identity){
      return document.querySelector(`[data-v275-mentor-cell][data-date="${cssEscape(anchor.date)}"][data-identity="${cssEscape(anchor.identity)}"]`);
    }
    if(anchor.kind==='slot'&&anchor.date){
      return document.querySelector(`[data-v275-slot][data-date="${cssEscape(anchor.date)}"]`)?.closest('td,th')||null;
    }
    return null;
  }
  function capture(target,reason,{extend=true}={}){
    if(!isTarget())return null;
    const wrap=scroller();
    if(!wrap)return null;
    const previous=snapshot;
    const anchor=anchorFrom(target,wrap)||previous?.anchor||null;
    snapshot={
      month:monthKey(),
      left:Number(wrap.scrollLeft||0),
      top:Number(wrap.scrollTop||0),
      windowX:Number(window.scrollX||window.pageXOffset||0),
      windowY:Number(window.scrollY||window.pageYOffset||0),
      anchor,
      reason:String(reason||''),
      createdAt:previous?.createdAt||Date.now(),
      expiresAt:Date.now()+(extend?LOCK_MS:Math.max(600,Number(previous?.expiresAt||0)-Date.now()))
    };
    serial+=1;
    return snapshot;
  }
  function valid(snap=snapshot){
    return !!snap&&isTarget()&&snap.month===monthKey()&&Date.now()<=snap.expiresAt;
  }
  function restore(expectedSerial){
    if(expectedSerial!==serial||!valid())return false;
    const wrap=scroller();
    if(!wrap)return false;
    applying=true;
    try{
      const maxLeft=Math.max(0,wrap.scrollWidth-wrap.clientWidth);
      const maxTop=Math.max(0,wrap.scrollHeight-wrap.clientHeight);
      wrap.scrollLeft=clamp(Number(snapshot.left||0),0,maxLeft);
      wrap.scrollTop=clamp(Number(snapshot.top||0),0,maxTop);

      const anchor=findAnchor(snapshot.anchor);
      if(anchor&&wrap.contains(anchor)){
        const anchorRect=anchor.getBoundingClientRect();
        const wrapRect=wrap.getBoundingClientRect();
        const desiredX=Number(snapshot.anchor?.offsetX);
        const desiredY=Number(snapshot.anchor?.offsetY);
        if(Number.isFinite(desiredX)){
          const dx=(anchorRect.left-wrapRect.left)-desiredX;
          if(Math.abs(dx)>1)wrap.scrollLeft=clamp(wrap.scrollLeft+dx,0,Math.max(0,wrap.scrollWidth-wrap.clientWidth));
        }
        if(Number.isFinite(desiredY)){
          const dy=(anchorRect.top-wrapRect.top)-desiredY;
          if(Math.abs(dy)>2)wrap.scrollTop=clamp(wrap.scrollTop+dy,0,Math.max(0,wrap.scrollHeight-wrap.clientHeight));
        }
      }
      window.scrollTo(Number(snapshot.windowX||0),Number(snapshot.windowY||0));
    }catch(error){
      console.warn(`${VERSION}: viewport restore skipped`,error);
    }
    requestAnimationFrame(()=>{applying=false;});
    return true;
  }
  function scheduleRestore(){
    if(!valid())return;
    cancelTimers();
    const expectedSerial=serial;
    RESTORE_DELAYS.forEach(delay=>{
      timers.push(setTimeout(()=>restore(expectedSerial),delay));
    });
  }
  function beginControlLock(target,reason){
    if(!isTarget())return;
    if(!target?.closest?.('.v275-position-wrap [data-v275-position-select],.v275-position-wrap [data-v275-mentor-select],.v275-position-wrap [data-v275-slot],.v275-position-wrap [data-v275-position-cell],.v275-position-wrap [data-v275-mentor-cell]'))return;
    capture(target,reason);
    scheduleRestore();
  }
  function markUserScrollIntent(event){
    if(!isTarget())return;
    const wrap=scroller();
    if(!wrap)return;
    if(event?.target!==wrap&&!event?.target?.closest?.('.v275-position-wrap'))return;
    userIntentUntil=Date.now()+1400;
    requestAnimationFrame(()=>{
      if(!isTarget()||applying)return;
      capture(event.target,'user-scroll-intent');
    });
  }

  /* Capture before V275 queues the Supabase autosave. Window capture runs before document handlers. */
  ['pointerdown','focusin','input','change','drop'].forEach(type=>{
    window.addEventListener(type,event=>{
      if(event.target?.id==='positionMonthInput'){
        clear('month-change');
        return;
      }
      beginControlLock(event.target,type);
    },true);
  });

  /* A deliberate wheel/touch/scrollbar action updates the viewport that must be retained. */
  ['wheel','touchstart','touchmove'].forEach(type=>window.addEventListener(type,markUserScrollIntent,{capture:true,passive:true}));
  window.addEventListener('pointerdown',event=>{
    if(!isTarget())return;
    const wrap=scroller();
    if(!wrap||event.target!==wrap)return;
    userIntentUntil=Date.now()+1400;
  },true);
  document.addEventListener('scroll',event=>{
    if(applying||!isTarget()||Date.now()>userIntentUntil)return;
    const wrap=scroller();
    if(event.target!==wrap)return;
    capture(wrap,'trusted-user-scroll');
    scheduleRestore();
  },true);
  window.addEventListener('scroll',()=>{
    if(applying||!valid()||Date.now()>userIntentUntil)return;
    snapshot.windowX=Number(window.scrollX||window.pageXOffset||0);
    snapshot.windowY=Number(window.scrollY||window.pageYOffset||0);
  },{passive:true});

  /* Leaving this page intentionally discards the old date viewport. */
  window.addEventListener('click',event=>{
    const nav=event.target?.closest?.('[data-page]');
    if(nav&&String(nav.dataset.page||'')!=='positionMonth')clear('navigation');
  },true);

  /* Run after every save/background rerender. Repeated restores cover delayed Supabase loaders. */
  function connectObserver(){
    const root=document.getElementById('pageContent')||document.body;
    if(!root)return;
    observer?.disconnect?.();
    observer=new MutationObserver(mutations=>{
      if(!valid())return;
      const replaced=mutations.some(m=>m.type==='childList'&&(m.addedNodes.length||m.removedNodes.length));
      if(!replaced)return;
      scheduleRestore();
    });
    observer.observe(root,{childList:true,subtree:true});
  }
  connectObserver();
  document.addEventListener('DOMContentLoaded',connectObserver,{once:true});

  /* V288 is loaded last. This hook restores after the complete legacy render chain returns. */
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRender&&!previousRender.__v288PositionMonthScrollLock){
    const wrapped=function renderPageV288(){
      const beforeValid=valid();
      const expectedMonth=beforeValid?snapshot.month:'';
      const result=previousRender.apply(this,arguments);
      if(beforeValid&&isTarget()&&expectedMonth===monthKey())scheduleRestore();
      return result;
    };
    wrapped.__v288PositionMonthScrollLock=true;
    try{window.renderPage=wrapped;}catch(_){}
    try{(0,eval)('renderPage=window.renderPage');}catch(_){}
  }

  window.cnmiV288={captureViewport:capture,restoreViewport:()=>restore(serial),clearViewport:clear,getViewport:()=>snapshot};
  console.info(`${VERSION} loaded`);
})();
