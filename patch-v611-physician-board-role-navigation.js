/* V611: doctor board anchors to actual schedule capture area; physician mode navigable preview */
(()=>{'use strict';if(window.__CNMI_V611__)return;window.__CNMI_V611__=true;
const S=()=>window.state||{};const A=()=>window.cnmiPhysicianConsultV452;
const board=()=>document.querySelector('#pageContent [data-v608-physician-month]');
let scheduled=false, fetching=false;
function place(){const root=document.getElementById('pageContent');if(!root||!['schedule','roster'].includes(String(S().page||'')))return;
const schedule=root.querySelector('.schedule-page-card');const capture=schedule?.querySelector('#scheduleCaptureArea');if(!capture)return;
let node=board();const a=A();
if(a&&!a.cache?.loaded&&!a.cache?.loading&&!fetching){fetching=true;Promise.resolve(a.ensureLoaded?.()).finally(()=>{fetching=false;try{if(['schedule','roster'].includes(String(S().page||'')))window.renderPage?.();}catch(_){}refresh();});}
if(!node){const legacy=window.cnmiDoctorRosterV607;let html='';try{html=legacy?.boardMarkup?.()||'';}catch(_){} // V608 provides the visual board via its rendering hook.
if(!html){try{const renderer=window.cnmiPhysicianBoardV611?.render;html=renderer?.(S().monthKey)||'';}catch(_){}}
if(!html)return;const tpl=document.createElement('template');tpl.innerHTML=html;node=tpl.content.firstElementChild;if(!node)return;}
if(node.previousElementSibling!==capture)schedule.insertBefore(node,capture.nextSibling);
}
function refresh(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;try{place();}catch(e){console.warn('[V611] board',e);}});}
const observer=new MutationObserver(refresh);observer.observe(document.getElementById('appView')||document.body,{childList:true,subtree:true});
const prev=window.renderPage||(typeof renderPage==='function'?renderPage:null);
if(typeof prev==='function'){const wrapped=function(){const r=prev.apply(this,arguments);refresh();return r;};try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}}
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-v611-open]');if(!btn)return;
e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const target=btn.getAttribute('data-v611-open');if(!target)return;
S().page=target;try{window.renderPage?.();}catch(_){};
},true);
refresh();
})();
