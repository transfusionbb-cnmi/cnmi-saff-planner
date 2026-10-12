/* V607: Staff read-only physician roster; reuses V452 model and RLS. */
(()=>{'use strict';
if(window.__CNMI_V607_DOCTOR_ROSTER__)return;window.__CNMI_V607_DOCTOR_ROSTER__=true;
const PAGE='doctorRosterStaff';
const api=()=>window.cnmiPhysicianConsultV452;
const stateSafe=()=>{try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return window.state||{};}};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=x=>String(x).padStart(2,'0');
const currentMonth=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.year}-${o.month}`;};
let month=currentMonth(),mode='all',loading=false;
function doctors(id){if(!id)return 'ยังไม่กำหนด';const p=(stateSafe().staff||[]).find(x=>String(x.id)===String(id));return p?(p.nickname||p.full_name||p.name||p.email||'แพทย์'):'ไม่พบชื่อแพทย์';}
function dateThai(s){const d=new Date(s+'T12:00:00');return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function dayThai(s){return new Date(s+'T12:00:00').toLocaleDateString('th-TH',{weekday:'short'});}
function dates(key){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key))return [];const [y,m]=key.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${key}-${pad(i+1)}`);}
function td(id){return id?`<strong>${esc(doctors(id))}</strong>`:'<span class="v607-empty">ยังไม่กำหนด</span>';}
function schedule(){const a=api();if(!a)return '<div class="card">ไม่พบโมดูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</div>';
 if(a.cache?.unavailable)return '<div class="card">ยังไม่เปิดใช้งานฐานข้อมูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</div>';
 if(!a.cache?.loaded){if(!loading){loading=true;Promise.resolve(a.ensureLoaded()).finally(()=>{loading=false;if(stateSafe().page===PAGE)paint();});}return '<div class="card">กำลังโหลดตารางเวรแพทย์…</div>';}
 const rows=dates(month).map(d=>({d,m:a.baseForDate(d)}));
 const daytime=mode!=='off'?`<section class="card v607-section"><h3>ในเวลา 08:00–16:00</h3><p class="muted">เฉพาะวันทำการ · ห้อง Donor และห้อง Blood Bank</p><div class="v607-scroll"><table><thead><tr><th>วันที่</th><th>Donor</th><th>Blood Bank</th></tr></thead><tbody>${rows.filter(x=>x.m.weekday).map(x=>`<tr><td>${esc(dateThai(x.d))} <small>${esc(dayThai(x.d))}</small></td><td>${td(x.m.donor)}</td><td>${td(x.m.bb)}</td></tr>`).join('')||'<tr><td colspan="3">ไม่มีวันทำการในเดือนนี้</td></tr>'}</tbody></table></div></section>`:'';
 const off=mode!=='day'?`<section class="card v607-section"><h3>นอกเวลา / วันหยุด</h3><p class="muted">วันทำการ 16:00–08:00 วันถัดไป · วันหยุดดูแลตลอดวัน · Donor & Blood Bank</p><div class="v607-scroll"><table><thead><tr><th>วันที่</th><th>ช่วงเวลา</th><th>แพทย์ผู้รับผิดชอบ</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(dateThai(x.d))} <small>${esc(dayThai(x.d))}</small></td><td>${x.m.weekday?'16:00–08:00':'ตลอดวัน (วันหยุด)'}</td><td>${td(x.m.combined)}</td></tr>`).join('')}</tbody></table></div></section>`:'';
 return daytime+off;
}
function markup(){return `<div class="v607-roster"><div class="card v607-toolbar"><div><h3>ตารางเวรแพทย์ประจำเดือน</h3><p class="muted">Staff ทุกคนดูได้ · ข้อมูลจากตารางแพทย์ Consult · อ่านอย่างเดียว</p></div><div class="v607-filters"><label>เลือกเดือน <input id="v607-month" type="month" value="${esc(month)}"></label><label>แสดง <select id="v607-mode"><option value="all" ${mode==='all'?'selected':''}>ทั้งหมด</option><option value="day" ${mode==='day'?'selected':''}>ในเวลา</option><option value="off" ${mode==='off'?'selected':''}>นอกเวลา</option></select></label><button type="button" class="ghost-btn" id="v607-refresh">รีเฟรช</button></div></div><div id="v607-table">${schedule()}</div></div>`;}
function paint(){if(stateSafe().page!==PAGE)return;const slot=document.getElementById('v607-table');if(slot)slot.innerHTML=schedule();}
function render(){if(stateSafe().page!==PAGE)return false;document.getElementById('pageTitle').textContent='ตารางเวรแพทย์';document.getElementById('pageSubtitle').textContent='ดูเวรแพทย์ในเวลาและนอกเวลา';document.getElementById('pageContent').innerHTML=markup();return true;}
// V610: Standalone staff physician tab is retired; the roster is embedded in the monthly staff roster.
// Keep PAGE render compatibility for bookmarked links, but never create a sidebar item.
try{if(typeof NAV_ITEMS!=='undefined'){
  for(let i=NAV_ITEMS.length-1;i>=0;i--){if(NAV_ITEMS[i]?.id===PAGE)NAV_ITEMS.splice(i,1);}
}}catch(e){console.warn('[V610] menu cleanup',e);}
const original=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(typeof original==='function'){const wrapped=function(){if(render())return;return original.apply(this,arguments);};try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}}
document.addEventListener('change',e=>{if(stateSafe().page!==PAGE)return;if(e.target?.id==='v607-month'){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){month=e.target.value;paint();}}if(e.target?.id==='v607-mode'){mode=e.target.value;paint();}});
document.addEventListener('click',e=>{if(e.target?.id!=='v607-refresh'||stateSafe().page!==PAGE)return;e.preventDefault();const a=api();if(!a)return;a.cache.loaded=false;paint();});
window.cnmiDoctorRosterV607={render,paint};
})();
