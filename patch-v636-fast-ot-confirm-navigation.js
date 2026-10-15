/* v636: event-driven mounting of staff summary, OT adjustment history, and Admin PDF entry. */
(()=>{'use strict';if(window.__CNMI_V636__)return;window.__CNMI_V636__=true;
let timeout=0,lastHost=null,lastView='';
function S(){try{return window.state||(typeof state!=='undefined'?state:{})}catch(_){return {}}}
function route(){return String(S().page||'')==='ot'?String(S().otMenuV369||''):''}
function trigger(){clearTimeout(timeout);timeout=setTimeout(()=>{
 const view=route(),host=document.querySelector('.v369-ot-content');if(!host)return;
 const sig=view+'|'+(new URLSearchParams((location.hash.split('?')[1]||'')).get('month')||S().otMenuMonthV369||'');
 if(host!==lastHost||sig!==lastView){lastHost=host;lastView=sig;
  if(view==='staff-summary'||view==='staff-details')window.cnmiV632Summary?.refresh?.();
  if(view==='staff-details'){window.cnmiV529AdjustmentVisibility?.refresh?.();window.cnmiV630History?.render?.()}
  if(view==='export'){window.cnmiV633PdfMenu?.refresh?.();window.cnmiV631AdminCorrections?.refresh?.()}
 }else{
  if(view==='staff-summary'&&!host.querySelector('.v632-summary'))window.cnmiV632Summary?.mount?.();
  if(view==='staff-details'&&!host.querySelector('#v630StaffPdfHistory'))window.cnmiV630History?.render?.();
 }
 },70)}
// Only one observer on the page root, no subtree observer: core replaces route section on navigation.
function init(){trigger();const content=document.getElementById('pageContent');if(content){new MutationObserver(changes=>{
 if(changes.some(x=>[...x.addedNodes].some(n=>n.nodeType===1&&((n.matches?.('.v369-ot-content,.v369-ot-page')||n.querySelector?.('.v369-ot-content'))))))trigger();
 }).observe(content,{childList:true,subtree:true})}}
window.addEventListener('hashchange',()=>{lastView='';trigger()});
document.addEventListener('click',e=>{if(e.target.closest?.('[data-v369-ot-menu],.v633-sidebar-link')){lastView='';trigger()}},true);
document.addEventListener('change',e=>{if(e.target.matches?.('input[type=month],#v633Month')){lastView='';trigger()}},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.cnmiV636={trigger};
})();