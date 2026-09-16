/* CNMI Staff Planner V513
 * Repair Dashboard leave-sequence tap after V511 rebuilt the leave list.
 * - "ลำดับลา n" in Dashboard is tappable again.
 * - Opens the existing V447 detail popup (leave date + original submission date/time).
 * - "ลำดับไม่รับเวร" keeps its existing V436 interaction.
 * Display-only; no schema / SQL changes.
 */
(function(){
  'use strict';
  const VERSION='V513_LEAVE_SEQUENCE_TAP_REPAIR';
  if(window.__CNMI_V513_LEAVE_SEQUENCE_TAP_REPAIR__)return;
  window.__CNMI_V513_LEAVE_SEQUENCE_TAP_REPAIR__=true;

  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(window.cnmiLeaveSequenceDetailV447?.selectedDashboardDate?.())||norm(window.state?.dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){try{return norm(typeof todayStr==='function'?todayStr():'');}catch(__){return '';}}
  }
  function detailsApi(){return window.cnmiLeaveSequenceDetailV447||null;}
  function leaveTarget(node){return node?.closest?.('.v511-leave-list .v431-leave-rank-badge:not([data-v447-leave-rank])')||null;}
  function activate(target){
    if(!target)return false;
    const item=target.closest('.v397-today-item');
    const staffId=String(item?.dataset?.v511Staff||'');
    const m=String(target.textContent||'').match(/(\d+)/);
    const rank=m?Number(m[1]):null;
    const date=selectedDate();
    const api=detailsApi();
    if(!api?.showLeaveRankDetail||!date||(!staffId&&!rank))return false;
    api.showLeaveRankDetail(date,staffId,rank);
    return true;
  }

  document.addEventListener('click',event=>{
    const target=leaveTarget(event.target);if(!target)return;
    event.preventDefault();event.stopPropagation();
    activate(target);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const target=leaveTarget(event.target);if(!target)return;
    event.preventDefault();event.stopPropagation();
    activate(target);
  },true);

  function decorate(root=document){
    try{
      root.querySelectorAll?.('.v511-leave-list .v431-leave-rank-badge:not([data-v447-leave-rank])').forEach(el=>{
        el.setAttribute('role','button');el.setAttribute('tabindex','0');
        el.setAttribute('title','แตะดูวันที่ลาและเวลาที่บันทึกคำลาครั้งแรก');
        el.classList.add('v513-leave-rank-clickable');
      });
    }catch(_){ }
  }
  const observer=new MutationObserver(list=>{for(const m of list){for(const n of m.addedNodes||[]){if(n?.nodeType===1)decorate(n);}}});
  try{observer.observe(document.documentElement,{subtree:true,childList:true});}catch(_){ }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>decorate(document),{once:true});else decorate(document);

  const style=document.createElement('style');style.id='cnmi-v513-style';style.textContent=`
    .v511-leave-list .v431-leave-rank-badge.v513-leave-rank-clickable{cursor:pointer;touch-action:manipulation}
    .v511-leave-list .v431-leave-rank-badge.v513-leave-rank-clickable:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(47,145,200,.18)}
  `;document.head.appendChild(style);

  window.cnmiLeaveTapRepairV513={version:VERSION,activate,decorate};
  console.info(`${VERSION} loaded`);
})();
