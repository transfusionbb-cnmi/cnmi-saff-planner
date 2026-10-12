/* V614: isolate visible physician navigation from Admin privileges. */
(()=>{'use strict';
if(window.__CNMI_V614_PHYSICIAN_MENU__)return;window.__CNMI_V614_PHYSICIAN_MENU__=true;
const KEY='cnmi-v612-physician-mode';
const isAdmin=()=>{try{return !!window.isActualAdminV167?.();}catch(_){return false;}};
const active=()=>{try{return isAdmin()&&sessionStorage.getItem(KEY)==='1';}catch(_){return false;}};
const allowed=new Set(['dashboard','calendar','leave','myProfile','activities','myTraining','physicianConsult','doctorRosterStaff']);
const allowedTree=new Set(['leave','profile','activities','physician']);
function apply(){
  const on=active();document.body.classList.toggle('v614-physician-mode',on);
  const nav=document.getElementById('mainNav');if(!nav)return;
  // Hide unrelated Staff/Admin menus without touching authorization or removing DOM nodes.
  for(const el of nav.querySelectorAll('.nav-btn[data-page]')){
    const pg=el.getAttribute('data-page'); el.classList.toggle('v614-nav-hidden',on&&!allowed.has(pg));
  }
  for(const el of nav.querySelectorAll('.v524-nav-tree')){
    el.classList.toggle('v614-nav-hidden',on&&!allowedTree.has(el.getAttribute('data-v524-tree')));
  }
  for(const el of nav.querySelectorAll('.nav-section')){
    const title=el.querySelector('.nav-section-title');
    if(title){if(on){if(!title.dataset.v614Original)title.dataset.v614Original=title.textContent||'';
      if(el.querySelector('.v524-nav-tree[data-v524-tree="physician"],.nav-btn[data-page="physicianConsult"]')){if(title.textContent!=='เมนูแพทย์')title.textContent='เมนูแพทย์';}
      else if(/admin/i.test(title.textContent||''))title.classList.add('v614-nav-hidden');
    }else{if(title.dataset.v614Original){title.textContent=title.dataset.v614Original;delete title.dataset.v614Original;}title.classList.remove('v614-nav-hidden');}}
    const viable=[...el.querySelectorAll('.nav-btn[data-page],.v524-nav-tree')].filter(node=>!node.classList.contains('v614-nav-hidden')&&!node.closest('.v524-nav-tree'));
    el.classList.toggle('v614-nav-hidden',on&&viable.length===0);
  }
  const badge=document.querySelector('.view-as-badge');if(badge&&on)badge.textContent='Physician mode';
  const physicianOption=document.querySelector('[data-v612-physician]');physicianOption?.classList.toggle('active',on);
}
const css=document.createElement('style');css.textContent='.v614-nav-hidden{display:none!important}';document.head.appendChild(css);
const oldNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);
if(typeof oldNav==='function'){
  const fn=function renderNavV614(){const ret=oldNav.apply(this,arguments);apply();queueMicrotask(apply);requestAnimationFrame(apply);return ret;};
  try{window.renderNav=renderNav=fn;}catch(_){window.renderNav=fn;}
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});};
const root=document.getElementById('mainNav');if(root){new MutationObserver(schedule).observe(root,{childList:true,subtree:true});}
document.addEventListener('click',e=>{
  if(e.target.closest?.('[data-v612-physician],[data-view-as-mode]')){
    requestAnimationFrame(()=>{apply();requestAnimationFrame(apply);});
  }
},false);
apply();
})();
