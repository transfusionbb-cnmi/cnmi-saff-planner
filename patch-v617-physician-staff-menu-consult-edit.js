/* V617 — Physician receives Staff navigation minus OT, plus editable Physician Consult.
   Presentation only: existing consult save checks and Supabase RLS remain authoritative. */
(()=>{'use strict';
if(window.__CNMI_V617_PHYSICIAN_MENU__)return;window.__CNMI_V617_PHYSICIAN_MENU__=true;
const KEY='cnmi-v612-physician-mode';
const S=()=>window.state||{};
const isAdmin=()=>{try{return !!window.isActualAdminV167?.();}catch(_){return false;}};
const isPhysician=()=>{const p=S().profile;if(!p)return false;try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(_){}return [p.staff_type,p.position,p.role].some(x=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(x||'').trim()));};
const preview=()=>{try{return isAdmin()&&sessionStorage.getItem(KEY)==='1';}catch(_){return false;}};
const clear=()=>{try{sessionStorage.removeItem(KEY);}catch(_){}};
const STAFF_TREES=new Set(['leave','profile','activities','roster','positions-staff','physician']);
const STAFF_PAGES=new Set(['dashboard','calendar','leave','myProfile','activities','myTraining','schedule','tradeRequests','doctorRosterStaff','positionMonthView','positions','physicianConsult','auditLogs','donorHelpers']);
function apply(){
 const p=preview(),doctor=isPhysician()&&!isAdmin(),phys=p||doctor;
 if(!isAdmin()&&!doctor)clear();
 document.body.classList.toggle('v617-physician-mode',phys);
 document.body.classList.toggle('v614-physician-mode',false);
 const nav=document.getElementById('mainNav');
 if(nav){
  for(const tree of nav.querySelectorAll('.v524-nav-tree')){
   const id=tree.dataset.v524Tree||'';
   // Admin's physician preview shows Staff menu trees plus Consult, but not other Admin tools.
   tree.classList.toggle('v614-nav-hidden',p&&!STAFF_TREES.has(id));
  }
  for(const item of nav.querySelectorAll('.nav-btn[data-page]')){
   const page=item.dataset.page||'';
   // Show the same Staff menu inventory (including all roster sub-pages) minus OT.
   const hide=(phys&&/^(ot|otRequests|otSignup|otExtra)$/i.test(page)) ||(p&&!STAFF_PAGES.has(page));
   item.classList.toggle('v614-nav-hidden',hide);
  }
  // V619: In Physician mode, hide EVERY Admin entry except Physician Consult.
  // Unlike V617, apply this to both actual physician accounts and Admin's physician preview.
  // Target only Admin sections so Staff menus remain exactly as they were.
  for(const section of nav.querySelectorAll('.nav-section')){
   const title=section.querySelector('.nav-section-title');
   const adminSection=!!section.querySelector('[data-v524-tree="physician"]') ||
     /เมนู\s*Admin|เมนูผู้ดูแล|Admin\s*menu/i.test(title?.textContent||'');
   if(!adminSection)continue;
   for(const child of section.querySelectorAll('.nav-btn[data-page],.v524-nav-tree')){
    if(child.closest('.v524-nav-tree')!==null && !child.classList.contains('v524-nav-tree'))continue;
    const consult=child.matches('[data-v524-tree="physician"]');
    child.classList.toggle('v619-admin-hidden',phys&&!consult);
    if(phys){child.classList.toggle('v614-nav-hidden',!consult);}
    else child.classList.remove('v619-admin-hidden');
   }
   if(title){
    const label=title.querySelector('span');
    if(label){if(!label.dataset.v619OldTitle)label.dataset.v619OldTitle=label.textContent;
      label.textContent=phys?'เมนูแพทย์':label.dataset.v619OldTitle;
    }
   }
  }
  // Unlike v616, do NOT hide trade request child. Only the OT sign-up/request menu is omitted.
  for(const sub of nav.querySelectorAll('.v524-subitem'))sub.classList.remove('v616-nav-hidden','v617-nav-hidden');
  for(const section of nav.querySelectorAll('.nav-section')){
   const head=section.querySelector('.nav-section-title');
   if(head){if(head.dataset.v614Original){head.textContent=head.dataset.v614Original;delete head.dataset.v614Original;}
    if(head.dataset.v616Title){head.textContent=head.dataset.v616Title;delete head.dataset.v616Title;}
    head.classList.remove('v614-nav-hidden');
   }
   const items=[...section.querySelectorAll('.nav-btn[data-page],.v524-nav-tree')].filter(x=>!x.closest('.v524-nav-tree'));
   section.classList.toggle('v614-nav-hidden',p&&!items.some(x=>!x.classList.contains('v614-nav-hidden')));
  }
 }
 const badge=document.querySelector('.view-as-badge');
 if(badge){const mode=window.getViewAsModeV167?.();badge.textContent=p?'Physician mode':mode==='admin'?'Admin mode':doctor?'Physician mode':'Staff mode';badge.classList.toggle('staff',!p&&mode==='staff');badge.classList.toggle('admin',p||mode==='admin');}
 document.querySelector('[data-v612-physician]')?.classList.toggle('active',p);
 for(const opt of document.querySelectorAll('[data-view-as-mode]'))opt.classList.toggle('active',!p&&opt.dataset.viewAsMode===window.getViewAsModeV167?.());
}
const style619=document.createElement('style');style619.textContent='.v619-admin-hidden{display:none!important}';document.head.append(style619);
const priorMode=window.setViewAsModeV167;
if(typeof priorMode==='function'){
 const modeFn=async function(next){if(!(next==='admin'&&preview()))clear();const result=await priorMode.apply(this,arguments);window.renderNav?.();apply();requestAnimationFrame(apply);return result;};
 window.setViewAsMode=window.setViewAsModeV167=modeFn;
}
const priorNav=window.renderNav;
if(typeof priorNav==='function'){
 const navFn=function(){const result=priorNav.apply(this,arguments);apply();requestAnimationFrame(apply);return result;};
 try{window.renderNav=renderNav=navFn;}catch(_){window.renderNav=navFn;}
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-view-as-mode]')){clear();requestAnimationFrame(()=>{window.renderNav?.();apply();});}else if(e.target.closest?.('[data-v612-physician]'))requestAnimationFrame(()=>{window.renderNav?.();apply();});},false);
let queued=false;const root=document.getElementById('mainNav');if(root)new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}).observe(root,{childList:true,subtree:true});
document.addEventListener('cnmi:force-clear-view-mode',()=>{clear();apply();});
apply();
})();
