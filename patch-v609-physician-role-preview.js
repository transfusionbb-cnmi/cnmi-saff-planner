/* V609: read-only physician role preview for actual administrators.
 * This is intentionally not impersonation, nor a change to Supabase permissions.
 */
(()=>{'use strict';
if(window.__CNMI_V609_PHYSICIAN_PREVIEW__)return;
window.__CNMI_V609_PHYSICIAN_PREVIEW__=true;
const PAGE='physicianRolePreview';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
function actualAdmin(){try{return !!window.isActualAdminV167?.();}catch(_){return false;}}
function physicianAPI(){return window.cnmiPhysicianConsultV452;}
function name(id){const p=(S().staff||[]).find(x=>String(x.id)===String(id));return p?.full_name||p?.nickname||'ยังไม่กำหนด';}
function thDate(d){return new Date(d+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function dateKey(){try{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`;}catch(_){return new Date().toISOString().slice(0,10);}}
function rows(){let a=physicianAPI();if(!a?.cache?.loaded){a?.ensureLoaded?.();return '<div class="v609-loading">กำลังโหลดตารางแพทย์…</div>';}
 let day=dateKey(),m=a.baseForDate?.(day)||{};
 return `<div class="v609-consult-rows"><div><span>08:00–16:00 · Donor</span><strong>${m.weekday?esc(name(m.donor)):'วันหยุด'}</strong></div><div><span>08:00–16:00 · Blood Bank</span><strong>${m.weekday?esc(name(m.bb)):'วันหยุด'}</strong></div><div><span>${m.weekday?'16:00–08:00':'24 ชั่วโมง'} · Donor & BB</span><strong>${esc(name(m.combined))}</strong></div></div>`;
}
function markup(){return `<section class="card v609-preview"><div class="v609-label">ตัวอย่างมุมมอง Role แพทย์ · ไม่ใช่การเข้าสู่ระบบแทนแพทย์</div><h2>หน้าใช้งานสำหรับแพทย์</h2><p>แสดงหมวดงานที่เกี่ยวข้องกับแพทย์ตามโครงสร้างปัจจุบัน และตัวอย่างตาราง Consult จากข้อมูลจริงโดยไม่เปิดให้แก้ไข</p><div class="v609-preview-grid"><div class="v609-panel"><h3>เมนูที่แพทย์ใช้</h3><div class="v609-nav-row">ภาพรวมวันนี้</div><div class="v609-nav-row">Calendar กลาง</div><div class="v609-nav-row">ตารางเวรแพทย์</div><div class="v609-nav-row">ลา / ไม่รับเวร (ตามสิทธิ์บัญชีแพทย์)</div><div class="v609-nav-row">ตารางแพทย์ Consult: ในเวลา / นอกเวลา / แก้เฉพาะวัน / รายการที่บันทึก</div><div class="v609-note">เมนูจริงอาจแตกต่างตามบัญชีและสิทธิ์ฐานข้อมูล โดยเฉพาะสิทธิ์แก้ไข</div></div><div class="v609-panel"><h3>แพทย์ Consult วันนี้</h3>${rows()}<div class="v609-note">มุมมองนี้อ่านข้อมูลอย่างเดียว การบันทึกตารางยังต้องใช้บัญชีที่ได้รับสิทธิ์จริง</div></div></div><button class="ghost-btn" type="button" data-v609-exit>กลับหน้าเดิม</button></section>`;}
let previousPage='dashboard';
const oldRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
if(typeof oldRender==='function'){
 const wrap=function(){if(S().page!==PAGE)return oldRender.apply(this,arguments);if(!actualAdmin()){S().page='dashboard';return oldRender.apply(this,arguments);}document.getElementById('pageTitle').textContent='Role แพทย์ (Preview)';const sub=document.getElementById('pageSubtitle');if(sub)sub.textContent='จำลองหน้าที่แพทย์เห็น โดยไม่เปลี่ยนสิทธิ์บัญชี';document.getElementById('pageContent').innerHTML=markup();};
 try{window.renderPage=renderPage=wrap;}catch(_){window.renderPage=wrap;}
}
const oldNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);
if(typeof oldNav==='function'){
 const wrap=function(){const out=oldNav.apply(this,arguments);try{if(actualAdmin()){const menu=document.querySelector('[data-view-as-menu]');if(menu&&!menu.querySelector('[data-v609-physician-preview]')){menu.insertAdjacentHTML('beforeend','<button type="button" class="view-as-option v609-mode" data-v609-physician-preview><b>🩺 Role แพทย์ (Preview)</b><small>ดูหน้าตาและเมนูที่เกี่ยวข้อง · ไม่เปลี่ยนสิทธิ์จริง</small></button>');}}}catch(_){}return out;};
 try{window.renderNav=renderNav=wrap;}catch(_){window.renderNav=wrap;}
}
document.addEventListener('click',e=>{
 const btn=e.target?.closest?.('[data-v609-physician-preview],[data-v609-exit]');if(!btn)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 if(btn.hasAttribute('data-v609-exit')){S().page=previousPage==='physicianRolePreview'?'dashboard':previousPage;}
 else if(actualAdmin()){previousPage=S().page;S().page=PAGE;document.querySelector('[data-view-as-menu]')?.classList.add('hidden');}
 try{window.renderPage?.();}catch(err){console.warn('[V609] physician preview',err);}
},true);
})();
