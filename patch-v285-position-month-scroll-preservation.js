/* CNMI Staff Planner V285
   Preserve Admin monthly daytime-position scroll after autosave/rerender.
   Scope: positionMonth page only. No data, Slot, mentor, roster, or Supabase logic changes.
*/
(function(){
  'use strict';
  const VERSION='V285_POSITION_MONTH_SCROLL_PRESERVATION';
  if(window.__CNMI_V285_POSITION_MONTH_SCROLL_PRESERVATION__) return;
  window.__CNMI_V285_POSITION_MONTH_SCROLL_PRESERVATION__=true;

  let saved=null;
  let generation=0;
  let restoring=false;
  let scheduledGeneration=-1;
  let observer=null;
  let ignoreScrollUntil=0;

  function S(){
    try{return state||window.state||null;}
    catch(_){return window.state||null;}
  }
  function isAdminSafe(){
    try{return !!isAdmin();}
    catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isTargetPage(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}
  function monthKey(){
    return String(S()?.positionMonthKey||S()?.monthKey||'').slice(0,7);
  }
  function scroller(){
    return document.querySelector('.v275-position-wrap');
  }
  function assignGlobal(name,value){
    try{window[name]=value;}catch(_){}
    try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){}
  }
  function clearSaved(){
    saved=null;
    generation+=1;
    scheduledGeneration=-1;
  }
  function capture(reason){
    if(!isTargetPage()) return null;
    const wrap=scroller();
    const current={
      page:'positionMonth',
      key:monthKey(),
      windowX:window.scrollX||window.pageXOffset||0,
      windowY:window.scrollY||window.pageYOffset||0,
      left:wrap?.scrollLeft||0,
      top:wrap?.scrollTop||0,
      reason:String(reason||''),
      at:Date.now()
    };
    saved=current;
    generation+=1;
    scheduledGeneration=-1;
    return current;
  }
  function valid(snapshot=saved){
    return !!snapshot&&isTargetPage()&&snapshot.page==='positionMonth'&&snapshot.key===monthKey();
  }
  function restoreOnce(expectedGeneration){
    if(expectedGeneration!==generation||!valid()) return;
    const wrap=scroller();
    if(!wrap) return;
    restoring=true;
    ignoreScrollUntil=Date.now()+120;
    try{
      const maxLeft=Math.max(0,wrap.scrollWidth-wrap.clientWidth);
      const maxTop=Math.max(0,wrap.scrollHeight-wrap.clientHeight);
      wrap.scrollLeft=Math.max(0,Math.min(saved.left,maxLeft));
      wrap.scrollTop=Math.max(0,Math.min(saved.top,maxTop));
      window.scrollTo(saved.windowX,saved.windowY);
    }catch(error){
      console.warn(`${VERSION}: restore skipped`,error);
    }
    requestAnimationFrame(()=>{restoring=false;});
  }
  function scheduleRestore(){
    if(!valid()) return;
    const expectedGeneration=generation;
    if(scheduledGeneration===expectedGeneration) return;
    scheduledGeneration=expectedGeneration;
    [0,16,45,90,160,280,450,750,1200,1900,3000].forEach(delay=>{
      setTimeout(()=>restoreOnce(expectedGeneration),delay);
    });
  }
  function isMatrixControl(target){
    return !!target?.closest?.(
      '.v275-position-wrap [data-v275-position-select],'+
      '.v275-position-wrap [data-v275-mentor-select],'+
      '.v275-position-wrap [data-v275-slot],'+
      '.v275-position-wrap [data-v275-position-cell],'+
      '.v275-position-wrap [data-v275-mentor-cell]'
    );
  }

  /* Capture before older save handlers replace the table DOM. */
  ['pointerdown','focusin','input','change','drop'].forEach(type=>{
    window.addEventListener(type,event=>{
      if(!isTargetPage()) return;
      const target=event.target;
      if(target?.id==='positionMonthInput'){
        clearSaved();
        return;
      }
      if(isMatrixControl(target)){
        capture(type);
        if(type==='change'||type==='input'||type==='drop') scheduleRestore();
      }
    },true);
  });

  /* A real user scroll becomes the new position and cancels older delayed restores. */
  document.addEventListener('scroll',event=>{
    if(restoring||Date.now()<ignoreScrollUntil||!isTargetPage()) return;
    const target=event.target;
    if(target===scroller()) capture('table-scroll');
  },true);
  window.addEventListener('scroll',()=>{
    if(restoring||Date.now()<ignoreScrollUntil||!valid()) return;
    saved.windowX=window.scrollX||window.pageXOffset||0;
    saved.windowY=window.scrollY||window.pageYOffset||0;
    generation+=1;
    scheduledGeneration=-1;
  },{passive:true});

  /* Navigation and month changes intentionally start at their own position. */
  window.addEventListener('click',event=>{
    const nav=event.target?.closest?.('[data-page]');
    if(nav&&String(nav.dataset.page||'')!=='positionMonth') clearSaved();
  },true);
  window.addEventListener('change',event=>{
    if(event.target?.id==='positionMonthInput') clearSaved();
  },true);

  /* Wrap the final render entry point so any autosave rerender restores the same viewport. */
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRender&&!previousRender.__v285PositionScrollPreservation){
    const wrapped=function renderPageV285(){
      const beforeTarget=isTargetPage();
      if(beforeTarget){
        /* Keep the latest user position, even when a background load triggers the render. */
        capture('before-render');
      }
      const beforeKey=saved?.key||'';
      const result=previousRender.apply(this,arguments);
      if(beforeTarget&&isTargetPage()&&beforeKey===monthKey()) scheduleRestore();
      return result;
    };
    wrapped.__v285PositionScrollPreservation=true;
    assignGlobal('renderPage',wrapped);
  }

  /* Some older patches mutate the matrix after render; re-apply until the DOM settles. */
  function connectObserver(){
    const root=document.getElementById('pageContent')||document.body;
    if(!root) return;
    observer?.disconnect?.();
    observer=new MutationObserver(mutations=>{
      if(!valid()) return;
      if(!mutations.some(m=>m.type==='childList'&&(m.addedNodes.length||m.removedNodes.length))) return;
      scheduleRestore();
    });
    observer.observe(root,{childList:true,subtree:true});
  }
  connectObserver();
  document.addEventListener('DOMContentLoaded',connectObserver,{once:true});

  console.info(`${VERSION} loaded`);
})();
