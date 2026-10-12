/* v622: unified physician navigation, replacing v617-v621 presentation overrides.
   This affects navigation presentation, not Supabase authorization/RLS. */
(()=>{'use strict';
if(window.__CNMI_V622_NAV__)return;window.__CNMI_V622_NAV__=true;
const KEY='cnmi-v612-physician-mode';
const s=()=>window.state||{};
const admin=()=>{try{return !!window.isActualAdminV167?.();}catch(e){return false;}};
const doctor=()=>{const p=s().profile;if(!p)return false;try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(e){}return [p.staff_type,p.position,p.role].some(v=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(v||'').trim()));};
const selected=()=>{try{return sessionStorage.getItem(KEY)==='1';}catch(e){return false;}};
const clear=()=>{try{sessionStorage.removeItem(KEY);}catch(e){}};
const physician=()=>admin()?selected():doctor();
const style=document.createElement('style');style.textContent=`
body.v622-physician-mode #mainNav .v622-hide {display:none!important}
body.v622-physician-mode .v622-admin-mode-banner {display:none!important}
`;document.head.append(style);
function apply(){
 const phys=physician(),nav=document.getElementById('mainNav');
 document.body.classList.toggle('v622-physician-mode',phys);
 document.body.classList.remove('v614-physician-mode','v616-physician-mode','v617-physician-mode');
 if(nav){
  // Clear all stale classes from older patches before applying one authoritative rule.
  nav.querySelectorAll('.v614-nav-hidden,.v616-nav-hidden,.v617-nav-hidden,.v619-admin-hidden,.v620-physician-ot-hidden,.v622-hide').forEach(el=>el.classList.remove('v614-nav-hidden','v616-nav-hidden','v617-nav-hidden','v619-admin-hidden','v620-physician-ot-hidden','v622-hide'));
  for(const section of nav.querySelectorAll('.nav-section')){
   const title=section.querySelector('.nav-section-title');
   const trees=[...section.querySelectorAll('.v524-nav-tree')];
   const isAdminSection=trees.some(t=>['physician','hr','positions-admin','users'].includes(t.dataset.v524Tree)) || /เมนู\s*Admin|เมนูผู้ดูแล/i.test(title?.textContent||'') || section.dataset.v622Admin==='1';
   if(isAdminSection)section.dataset.v622Admin='1';
   section.classList.remove('v622-hide');
   if(title){let label=title.querySelector('span');if(label){if(!label.dataset.v622Original)label.dataset.v622Original=label.textContent;label.textContent=phys&&isAdminSection?'เมนูแพทย์':label.dataset.v622Original;}}
   if(!phys)continue;
   if(isAdminSection){
    for(const tree of trees)if(tree.dataset.v524Tree!=='physician')tree.classList.add('v622-hide');
    for(const btn of section.querySelectorAll(':scope > .nav-btn[data-page]'))if(btn.dataset.page!=='physicianConsult')btn.classList.add('v622-hide');
    if(!section.querySelector('.v524-nav-tree[data-v524-tree="physician"],.nav-btn[data-page="physicianConsult"]'))section.classList.add('v622-hide');
   }
  }
  if(phys){
   for(const item of nav.querySelectorAll('.nav-btn[data-page],.v524-nav-tree')){
    const id=item.dataset.page||item.dataset.v524Tree||'';
    const txt=item.textContent||'';
    if(id==='ot'||id==='otSignup'||id==='otExtra'||/ลงชื่ออยู่เวร\s*\/\s*ขอ\s*OT\s*เพิ่ม/.test(txt)&&!item.classList.contains('nav-section'))item.classList.add('v622-hide');
   }
  }
 }
 const badge=document.querySelector('.view-as-badge');if(badge){const m=window.getViewAsModeV167?.();badge.textContent=phys?'Physician mode':m==='admin'?'Admin mode':'Staff mode';badge.classList.toggle('staff',!phys&&m!=='admin');badge.classList.toggle('admin',!phys&&m==='admin');}
 document.querySelector('[data-v612-physician]')?.classList.toggle('active',phys);
 // Dashboard may be in Admin mode internally, but show the user's selected mode consistently.
 for(const el of document.querySelectorAll('#pageContent .admin-mode-banner,#pageContent .v167-admin-mode-banner'))el.classList.toggle('v622-admin-mode-banner',phys);
}
let queued=false;function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}
const origNav=window.renderNav;if(typeof origNav==='function'){const wrapped=function(){const result=origNav.apply(this,arguments);queue();return result;};try{window.renderNav=renderNav=wrapped;}catch(e){window.renderNav=wrapped;}}
const origSet=window.setViewAsModeV167;if(typeof origSet==='function'){
 const wrapped=async function(mode){if(mode==='staff'||mode==='admin')clear();const result=await origSet.apply(this,arguments);window.renderNav?.();queue();return result;};window.setViewAsModeV167=window.setViewAsMode=wrapped;
}
document.addEventListener('click',e=>{
 if(e.target.closest?.('[data-view-as-mode]')){clear();queue();}
 if(e.target.closest?.('[data-v612-physician]')){requestAnimationFrame(()=>{window.renderNav?.();queue();});}
},false);
const nav=document.getElementById('mainNav');if(nav)new MutationObserver(ms=>{if(ms.some(m=>m.addedNodes.length||m.removedNodes.length))queue();}).observe(nav,{childList:true,subtree:true});
document.addEventListener('cnmi:force-clear-view-mode',()=>{clear();queue();});
apply();
})();
