/* V616: synchronize physician mode, preserve real admin privileges, and physician-only navigation. */
(()=>{'use strict';
if(window.__CNMI_V616_MODE__)return;window.__CNMI_V616_MODE__=true;
const KEY='cnmi-v612-physician-mode';
const S=()=>window.state||{};
const realAdmin=()=>{try{return !!window.isActualAdminV167?.();}catch(_){return false;}};
const actualDoctor=()=>{const p=S().profile;if(!p)return false;try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(_){}return [p.staff_type,p.position,p.role].some(v=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(v||'').trim()));};
const selected=()=>realAdmin()&&sessionStorage.getItem(KEY)==='1';
const clear=()=>{try{sessionStorage.removeItem(KEY);}catch(_){}};
const allowedTrees=new Set(['leave','profile','activities','roster','positions-staff','physician']);
const allowedPages=new Set(['dashboard','calendar','leave','myProfile','activities','myTraining','schedule','tradeRequests','doctorRosterStaff','positionMonthView','positions','physicianConsult','auditLogs']);
function sync(){
 const isDocMode=selected(),doctor=actualDoctor()&&!realAdmin();
 if(!realAdmin()&&!doctor){clear();}
 const nav=document.getElementById('mainNav');
 document.body.classList.toggle('v616-physician-mode',isDocMode||doctor);
 document.body.classList.toggle('v614-physician-mode',isDocMode);
 if(nav){
  for(const node of nav.querySelectorAll('.v524-nav-tree')){
    const id=node.getAttribute('data-v524-tree');
    node.classList.toggle('v614-nav-hidden',isDocMode&&!allowedTrees.has(id));
    if(doctor&&id==='roster') node.classList.remove('v614-nav-hidden');
  }
  for(const node of nav.querySelectorAll('.nav-btn[data-page]')){
    const pg=node.dataset.page;
    node.classList.toggle('v614-nav-hidden',isDocMode&&!allowedPages.has(pg));
    if((doctor||isDocMode)&&pg==='ot')node.classList.add('v614-nav-hidden');
  }
  for(const node of nav.querySelectorAll('.v524-subitem')){
    const tree=node.closest('.v524-nav-tree')?.dataset.v524Tree;
    const key=node.dataset.v524ChildKey||'';
    node.classList.toggle('v616-nav-hidden',(doctor||isDocMode)&&((tree==='roster'&&key==='roster-trade')));
  }
  for(const section of nav.querySelectorAll('.nav-section')){
    const title=section.querySelector('.nav-section-title');
    if(title&&isDocMode){if(!title.dataset.v616Title)title.dataset.v616Title=title.textContent||'';if(section.querySelector('[data-v524-tree="physician"]'))title.textContent='เมนูแพทย์';}
    if(title&&!isDocMode&&title.dataset.v616Title){title.textContent=title.dataset.v616Title;delete title.dataset.v616Title;}
    const visible=[...section.querySelectorAll('.nav-btn[data-page],.v524-nav-tree')].filter(x=>!x.closest('.v524-nav-tree')&&!x.classList.contains('v614-nav-hidden'));
    section.classList.toggle('v614-nav-hidden',isDocMode&&visible.length===0);
  }
 }
 const badge=document.querySelector('.view-as-badge');if(badge){const mode=window.getViewAsModeV167?.();const label=isDocMode?'Physician mode':mode==='admin'?'Admin mode':'Staff mode';badge.textContent=label;badge.classList.toggle('staff',!isDocMode&&mode==='staff');badge.classList.toggle('admin',isDocMode||mode==='admin');}
 const physOpt=document.querySelector('[data-v612-physician]');if(physOpt)physOpt.classList.toggle('active',isDocMode);
 for(const opt of document.querySelectorAll('[data-view-as-mode]'))opt.classList.toggle('active',!isDocMode&&opt.dataset.viewAsMode===window.getViewAsModeV167?.());
}
const css=document.createElement('style');css.textContent='.v616-nav-hidden{display:none!important}';document.head.append(css);
const oldSet=window.setViewAsModeV167;
if(typeof oldSet==='function'){
 const wrapped=async function(next){if(!(next==='admin'&&selected()))clear();document.body.classList.remove('v614-physician-mode');try{return await oldSet.apply(this,arguments);}finally{try{window.renderNav?.();}catch(_){}sync();requestAnimationFrame(sync);}};
 window.setViewAsMode=window.setViewAsModeV167=wrapped;
}
const oldNav=window.renderNav;
if(typeof oldNav==='function'){
 const wrapped=function(){const out=oldNav.apply(this,arguments);sync();requestAnimationFrame(sync);return out;};
 try{window.renderNav=renderNav=wrapped;}catch(_){window.renderNav=wrapped;}
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-v612-physician]')){requestAnimationFrame(()=>{window.renderNav?.();sync();});}if(e.target.closest?.('[data-view-as-mode]')){clear();requestAnimationFrame(sync);}},false);
document.addEventListener('cnmi:force-clear-view-mode',()=>{clear();sync();});
let queued=false;const nav=document.getElementById('mainNav');if(nav)new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sync();});}).observe(nav,{childList:true,subtree:true});
sync();
})();
