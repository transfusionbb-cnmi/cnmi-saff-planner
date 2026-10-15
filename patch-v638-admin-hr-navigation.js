/* v638: deterministic Admin OT navigation: Export stays for Export; HR claims opens the versioned v637 workspace. */
(()=>{'use strict';if(window.__CNMI_V638_ADMIN_SPLIT__)return;window.__CNMI_V638_ADMIN_SPLIT__=true;
const S=()=>{try{return window.cnmiV639CoreState?.()||window.state||{}}catch(_){return window.state||{}}};
const params=()=>new URLSearchParams((location.hash.split('?')[1]||''));
const active=()=>params().get('section')==='hr-claims';
const mm=()=>params().get('month')||String(S().otMenuMonthV369||new Date().toISOString().slice(0,7)).slice(0,7);
const admin=()=>{const nav=document.getElementById('mainNav');return S().page==='ot'&&S().otMenuV369==='export'&&!!(window.isAdmin?.()||nav?.textContent?.includes('เมนู Admin'));};
let lastHost=null,sidebarTimer=0,pageTimer=0;
function openClaims(){const month=mm();S().hrClaimsModeV640=true;const target='#/ot?section=hr-claims&month='+encodeURIComponent(month);if(location.hash!==target)location.hash=target;else syncPage();setTimeout(()=>{window.cnmiV637?.refresh?.();syncPage()},130)}
function openExport(){S().hrClaimsModeV640=false;const url='#/ot?section=hr-export&month='+encodeURIComponent(mm());if(location.hash!==url)location.hash=url;else syncPage()}
function syncSidebar(){const nav=document.getElementById('mainNav');if(!nav)return;const exp=nav.querySelector('[data-v523-ot-item="export"]');if(!exp){document.getElementById('v638HrClaims')?.remove();return}
 let item=nav.querySelector('#v638HrClaims');if(!item){item=document.createElement('button');item.type='button';item.id='v638HrClaims';item.className='v523-subitem v638-hr-menu';item.setAttribute('data-v638-open','1');item.innerHTML='<span class="v523-branch-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 3h10l3 3v15H4V3zM8 11h8M8 15h5M8 19h5"/></svg></span><span>จัดการยอดเบิก HR / เบิกพิเศษ</span>';exp.insertAdjacentElement('afterend',item)}
 else if(item.previousElementSibling!==exp)exp.insertAdjacentElement('afterend',item);
 exp.classList.toggle('active',!active());exp.setAttribute('aria-current',active()?'false':'page');
 item.classList.toggle('v638-selected',active());item.setAttribute('aria-current',active()?'page':'false');
}
function syncPage(){const host=document.querySelector('.v369-ot-content');if(!host||!admin())return;const isWorkspace=active();host.classList.toggle('v638-admin-workspace',isWorkspace);host.classList.toggle('v638-admin-export',!isWorkspace);
 let n=host.querySelector(':scope > #v638Entry');if(isWorkspace){n?.remove();if(!host.querySelector('#v637Admin')){let panel=document.createElement('section');panel.id='v637Admin';panel.className='card v637-panel';panel.innerHTML='<h3>จัดการยอดเบิก HR / เบิกพิเศษ</h3><p>กำลังโหลดข้อมูลรอบ Export…</p>';host.prepend(panel);window.cnmiV637?.refresh?.()}return}
 if(!n){n=document.createElement('section');n.className='v638-entry';n.id='v638Entry';n.innerHTML='<div><strong>กรอกยอด HR / เบิกพิเศษ / แก้ไขยอดที่ทักท้วง</strong><small>กรอกยอดที่ Admin ส่งเบิกและสร้างฉบับแก้ไขในเมนูแยก ไม่ต้องเลื่อนในหน้า Export</small></div><button type="button" data-v638-open>เปิดหน้าจัดการยอด</button>';host.prepend(n)}
 host.querySelector('#v533PdfReviewCard')?.setAttribute('hidden','');host.querySelector('#v631AdminPdfCorrection')?.setAttribute('hidden','')}
function schedulePage(){clearTimeout(pageTimer);pageTimer=setTimeout(()=>{syncSidebar();syncPage()},150)}
function watch(){const nav=document.getElementById('mainNav');if(nav){new MutationObserver(muts=>{if(muts.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&n.id!=='v638HrClaims'&&!n.closest?.('#v638HrClaims')))){clearTimeout(sidebarTimer);sidebarTimer=setTimeout(syncSidebar,65)}}).observe(nav,{childList:true,subtree:true})}
 const content=document.getElementById('pageContent');if(content){new MutationObserver(muts=>{const h=document.querySelector('.v369-ot-content');if(h!==lastHost){lastHost=h;schedulePage()}}).observe(content,{childList:true,subtree:false});}}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v638-open]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openClaims()},true);
window.addEventListener('hashchange',schedulePage);
document.addEventListener('change',e=>{if(e.target.matches?.('input[type=month]'))schedulePage()},true);
function start(){syncSidebar();syncPage();watch();setTimeout(schedulePage,400)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.cnmiV638={open:openClaims,back:openExport,refresh:schedulePage};
})();
