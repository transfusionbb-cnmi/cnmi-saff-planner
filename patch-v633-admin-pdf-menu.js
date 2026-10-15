/* v633: Admin-only menu for PDF entry, special claims and correction; reuses tested V533/V631 forms. */
(()=>{'use strict';if(window.__CNMI_V633__)return;window.__CNMI_V633__=true;
const S=()=>window.state||{};const currentMonth=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||S().otMenuMonthV369||new Date().toISOString().slice(0,7);
const active=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('pdf-entry')==='1';
const admin=()=>{try{return window.isAdmin?.()===true&&S().page==='ot'&&S().otMenuV369==='export'}catch(_){return false}};
const go=(on,month)=>{location.hash='#/ot?section=hr-export&month='+encodeURIComponent(month||currentMonth())+(on?'&pdf-entry=1':'')};
function nav(){const candidates=[...document.querySelectorAll('a,button')].filter(e=>!e.classList.contains('v633-sidebar-link')&&e.textContent?.trim()==='Export HR');const original=candidates.find(e=>e.closest('aside,nav,[class*="sidebar"],[class*="side-nav"]'))||candidates[0];if(!original)return;const holder=original.closest('li')||original;const parent=holder.parentElement;if(!parent)return;let item=parent.querySelector(':scope > .v633-sidebar-link');if(!item){item=document.createElement('button');item.type='button';item.className='v633-sidebar-link';item.innerHTML='📄 กรอกยอด PDF / เบิกพิเศษ';holder.insertAdjacentElement('afterend',item)}item.hidden=!admin();item.setAttribute('aria-current',admin()&&active()?'page':'false');}
function focus(){const host=document.querySelector('.v369-ot-content');if(!host)return;const should=admin()&&active();host.classList.toggle('v633-focused',should);let view=host.querySelector('#v633PdfFocus');if(!should){if(view){[...view.querySelectorAll(':scope > #v533PdfReviewCard,:scope > #v631AdminPdfCorrection')].forEach(el=>host.appendChild(el));view.remove()}return}
if(!view){view=document.createElement('section');view.id='v633PdfFocus';host.prepend(view);view.innerHTML='<div class="v633-header"><h2>กรอกยอด PDF / เบิกพิเศษ</h2><p>กรอกยอดส่งเบิกจริงรายบุคคล และรายการเบิกพิเศษที่รวมอยู่ใน PDF ของรอบนี้</p><p>ส่วนต่างที่เป็นเบิกพิเศษไม่ถือเป็น OT ตกเบิกของเดือนถัดไปโดยอัตโนมัติ</p><div class="v633-tools"><label>เดือน <input id="v633Month" type="month"></label><button type="button" data-v633-return>กลับไป Export HR</button></div></div>'}
const input=view.querySelector('#v633Month');if(input&&document.activeElement!==input)input.value=currentMonth();
for(const id of ['v533PdfReviewCard','v631AdminPdfCorrection']){const el=host.querySelector(':scope > #'+id);if(el)view.appendChild(el)}
if(!view.querySelector('#v533PdfReviewCard')){let wait=view.querySelector('.v633-wait');if(!wait){wait=document.createElement('p');wait.className='v633-wait';wait.textContent='กำลังโหลดข้อมูล PDF ของรอบที่เลือก…';view.appendChild(wait)}}else view.querySelector('.v633-wait')?.remove();}
function tick(){nav();focus()}
document.addEventListener('click',e=>{if(e.target.closest('.v633-sidebar-link')){e.preventDefault();go(true);return}if(e.target.closest('[data-v633-return]')){e.preventDefault();go(false)}});
document.addEventListener('change',e=>{if(e.target.id==='v633Month'&&/^\d{4}-\d{2}$/.test(e.target.value))go(true,e.target.value)});
window.addEventListener('hashchange',()=>setTimeout(tick,150));setInterval(tick,1100);setTimeout(tick,500);
})();
