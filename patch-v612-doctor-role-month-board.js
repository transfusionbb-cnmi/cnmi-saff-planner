/* V612: functional Admin physician mode and dedicated read-only physician monthly board for all staff */
(()=>{'use strict';if(window.__CNMI_V612__)return;window.__CNMI_V612__=true;
const PAGE='doctorRosterStaff',KEY='cnmi-v612-physician-mode';
const S=()=>window.state||{};
const api=()=>window.cnmiPhysicianConsultV452;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const todayMonth=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date());const z=Object.fromEntries(p.map(a=>[a.type,a.value]));return z.year+'-'+z.month;};
let month=/^\d{4}-(0[1-9]|1[0-2])$/.test(S().monthKey||'')?S().monthKey:todayMonth(), loading=false;
const actualAdmin=()=>{try{return !!window.isActualAdminV167?.();}catch(_){return false;}};
let doctorMode=false;try{doctorMode=sessionStorage.getItem(KEY)==='1';}catch(_){ }
if(!doctorMode){try{sessionStorage.removeItem(KEY);}catch(_){}}
function dateRows(key){const [y,m]=key.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${key}-${pad(i+1)}`);}
function person(id){const p=(S().staff||[]).find(x=>String(x.id)===String(id||''));return p?(p.nickname||p.full_name||p.name||'แพทย์'):'ยังไม่กำหนด';}
function pill(id,type){return id?`<span class="v612-pill ${type}" title="${esc(person(id))}">${esc(person(id))}</span>`:'<span class="v612-unset">—</span>';}
function dayLabel(d){return new Date(d+'T12:00:00').toLocaleDateString('th-TH',{weekday:'short'});}
function fullDate(d){return new Date(d+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function board(){const a=api();if(!a)return '<div class="card">ไม่พบระบบตารางแพทย์</div>';
 if(a.cache?.unavailable)return '<div class="card">ไม่พบตารางแพทย์ในฐานข้อมูล กรุณาติดต่อ Admin</div>';
 if(!a.cache?.loaded){if(!loading){loading=true;Promise.resolve(a.ensureLoaded?.()).catch(()=>{}).finally(()=>{loading=false;if(S().page===PAGE)paint();});}return '<div class="card">กำลังโหลดข้อมูลเวรแพทย์…</div>';}
 const data=dateRows(month).map(d=>({d,m:a.baseForDate(d)}));
 const row=(name,desc,field,typ)=>`<tr><th class="v612-rowhead"><b>${name}</b><small>${desc}</small></th>${data.map(x=>`<td class="${x.m.weekday?'':'v612-holiday'}">${field!=='combined'&&!x.m.weekday?'<span class="v612-unset">หยุด</span>':pill(x.m[field],typ)}${field==='combined'?`<small>${x.m.weekday?'16–08':'24 ชม.'}</small>`:''}</td>`).join('')}</tr>`;
 const days=`<tr><th class="v612-rowhead">ห้อง / วันที่</th>${data.map(x=>`<th class="${x.m.weekday?'':'v612-holiday'}">${Number(x.d.slice(-2))}<small>${esc(dayLabel(x.d))}</small></th>`).join('')}</tr>`;
 const detail=data.map(x=>`<tr><td>${esc(fullDate(x.d))}</td><td>${x.m.weekday?pill(x.m.donor,'donor'):'หยุด'}</td><td>${x.m.weekday?pill(x.m.bb,'bb'):'หยุด'}</td><td>${pill(x.m.combined,'call')}</td><td>${x.m.weekday?'16:00–08:00':'24 ชั่วโมง'}</td></tr>`).join('');
 return `<section class="card v612-card"><div class="v612-heading"><div><h3>ตารางเวรแพทย์ประจำเดือน</h3><p class="hint">ในเวลา 08:00–16:00 · นอกเวลา 16:00–08:00 · วันหยุด 24 ชั่วโมง</p></div><span class="v612-readonly">ดูได้ทุก Staff · อ่านอย่างเดียว</span></div><div class="v612-gridscroll"><table class="v612-board"><thead>${days}</thead><tbody>${row('Donor','08:00–16:00','donor','donor')}${row('Blood Bank','08:00–16:00','bb','bb')}${row('นอกเวลา / วันหยุด','Donor & Blood Bank','combined','call')}</tbody></table></div><p class="v612-note">สีฟ้า = Donor · สีเขียว = Blood Bank · สีส้ม = นอกเวลา · ช่องพื้นเหลือง = วันหยุด</p><details class="v612-details"><summary>ดูรายการแบบรายวันทั้งเดือน</summary><div class="v612-detail-scroll"><table><thead><tr><th>วันที่</th><th>Donor ในเวลา</th><th>Blood Bank ในเวลา</th><th>นอกเวลา / วันหยุด</th><th>เวลารับผิดชอบ</th></tr></thead><tbody>${detail}</tbody></table></div></details></section>`;
}
function html(){return `<div class="v612-page"><div class="card v612-toolbar"><label>เลือกเดือน <input type="month" id="v612-month" value="${esc(month)}"></label><button class="ghost-btn" id="v612-refresh" type="button">รีเฟรชข้อมูลแพทย์</button></div><div id="v612-board-slot">${board()}</div></div>`;}
function paint(){const root=document.getElementById('v612-board-slot');if(root&&S().page===PAGE)root.innerHTML=board();}
function render(){if(S().page!==PAGE)return false;const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),root=document.getElementById('pageContent');if(title)title.textContent='ตารางเวร(แพทย์)ประจำเดือน';if(sub)sub.textContent='แพทย์ Consult ในเวลาและนอกเวลา';if(root)root.innerHTML=html();return true;}
const prev=window.renderPage||(typeof renderPage==='function'?renderPage:null);
if(typeof prev==='function'){const fn=function(){if(render())return;return prev.apply(this,arguments);};try{window.renderPage=renderPage=fn;}catch(_){window.renderPage=fn;}}
function refreshDoctorMode(){if(!actualAdmin())doctorMode=false;const menu=document.querySelector('[data-view-as-menu]');if(menu){menu.querySelectorAll('[data-v609-physician-preview]').forEach(x=>x.remove());if(actualAdmin()&&!menu.querySelector('[data-v612-physician]'))menu.insertAdjacentHTML('beforeend',`<button type="button" class="view-as-option" data-v612-physician><b>🩺 โหมดแพทย์</b><small>ใช้หน้าจัดการแพทย์ Consult ด้วยสิทธิ์ Admin จริง</small></button>`);}
 const badge=document.querySelector('.view-as-badge');if(badge)badge.textContent=(doctorMode&&actualAdmin())?'แพทย์ (Admin)':(window.getViewAsModeV167?.()==='admin'?'Admin mode':'Staff mode');
}
const previousNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);if(typeof previousNav==='function'){const fn=function(){const r=previousNav.apply(this,arguments);refreshDoctorMode();return r;};try{window.renderNav=renderNav=fn;}catch(_){window.renderNav=fn;}}
document.addEventListener('click',async e=>{const mode=e.target.closest?.('[data-v612-physician]');if(mode){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(!actualAdmin())return;doctorMode=true;try{sessionStorage.setItem(KEY,'1');}catch(_){};try{await window.setViewAsModeV167?.('admin');}catch(_){};S().page='physicianConsult';refreshDoctorMode();document.querySelector('[data-view-as-menu]')?.classList.add('hidden');window.renderPage?.();return;}
 const other=e.target.closest?.('[data-view-as-mode]');if(other&&doctorMode){doctorMode=false;try{sessionStorage.removeItem(KEY);}catch(_){};}
 const rf=e.target.closest?.('#v612-refresh');if(rf){e.preventDefault();const a=api();if(a){a.cache.loaded=false;paint();}return;}
},true);
document.addEventListener('change',e=>{if(e.target.id==='v612-month'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){month=e.target.value;paint();}},true);
refreshDoctorMode();window.cnmiV612={paint};
})();
