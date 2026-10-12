/* V615: physician roster calendar + today's duty summary for easier staff/physician reading. */
(()=>{'use strict';
if(window.__CNMI_V615_PHYSICIAN_ROSTER_UI__)return;window.__CNMI_V615_PHYSICIAN_ROSTER_UI__=true;
const PAGE='doctorRosterStaff';
const S=()=>{try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return window.state||{};}};
const api=()=>window.cnmiPhysicianConsultV452;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const bangkokParts=(d=new Date())=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));
const todayKey=()=>{const p=bangkokParts();return `${p.year}-${p.month}-${p.day}`;};
const currentMonth=()=>todayKey().slice(0,7);
let month=(/^\d{4}-(0[1-9]|1[0-2])$/.test(S().monthKey||'')?S().monthKey:currentMonth());
let view='calendar',loading=false;
function staff(id){return (S().staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
function nameOf(id){const p=staff(id);return p?(p.nickname||p.full_name||p.name||p.email||'แพทย์'):'ยังไม่กำหนด';}
function dateObj(k){return new Date(k+'T12:00:00');}
function dayShort(k){return dateObj(k).toLocaleDateString('th-TH',{weekday:'short'});}
function dateThai(k){return dateObj(k).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function monthThai(k){const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1,12).toLocaleDateString('th-TH',{month:'short',year:'numeric'});}
function monthLongThai(k){const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1,12).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}
function dates(k){const [y,m]=k.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${k}-${pad(i+1)}`);}
function shiftMonth(delta){const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+delta,1,12);month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;paint();}
function contactBtn(id,kind,extra=''){if(!id)return `<span class="v615-empty">ยังไม่กำหนด</span>`;return `<button type="button" class="v615-doctor v615-${kind}" data-v615-doctor="${esc(id)}" data-v615-site="${esc(kind==='donor'?'Donor':kind==='bb'?'Blood Bank':'Donor & Blood Bank')}" data-v615-time="${esc(extra|| (kind==='call'?'16:00–08:00':'08:00–16:00'))}" title="กดเพื่อดูข้อมูลติดต่อแพทย์">${esc(nameOf(id))}</button>`;}
function ensure(){const a=api();if(!a)return false;if(a.cache?.loaded)return true;if(!loading){loading=true;Promise.resolve(a.ensureLoaded?.()).catch(()=>{}).finally(()=>{loading=false;if(S().page===PAGE)paint();});}return false;}
function todayCard(){const a=api();if(!a?.cache?.loaded)return '';
 const d=todayKey(),m=a.baseForDate(d);if(!m)return '';
 const daytime=m.weekday?`<div class="v615-today-grid"><div class="v615-duty"><small>Donor · 08:00–16:00</small>${contactBtn(m.donor,'donor')}</div><div class="v615-duty"><small>Blood Bank · 08:00–16:00</small>${contactBtn(m.bb,'bb')}</div></div>`:'';
 const callTime=m.weekday?'16:00–08:00':'ตลอดวัน (วันหยุด)';
 return `<section class="card v615-today"><div class="v615-section-head"><div><h3>เวรแพทย์วันนี้</h3><p>${esc(dateThai(d))} · ${esc(dayShort(d))}</p></div><span class="v615-today-badge">วันนี้</span></div>${daytime}<div class="v615-duty v615-duty-call"><small>On-call · ${esc(callTime)}</small>${contactBtn(m.combined,'call',m.weekday?'16:00–08:00':'24 ชม.')}</div><p class="v615-contact-hint">กดชื่อแพทย์เพื่อดูข้อมูลติดต่อ</p></section>`;
}
function calendar(){const a=api();if(!a?.cache?.loaded)return '<section class="card v615-loading">กำลังโหลดตารางเวรแพทย์…</section>';
 const ds=dates(month),first=dateObj(ds[0]).getDay(),cells=[];for(let i=0;i<first;i++)cells.push('<div class="v615-day v615-blank" aria-hidden="true"></div>');
 for(const d of ds){const m=a.baseForDate(d),isToday=d===todayKey();const entries=[];
   if(m.weekday){entries.push(`<div class="v615-entry v615-entry-donor"><b>D</b>${contactBtn(m.donor,'donor')}</div>`);entries.push(`<div class="v615-entry v615-entry-bb"><b>B</b>${contactBtn(m.bb,'bb')}</div>`);}
   entries.push(`<div class="v615-entry v615-entry-call">${contactBtn(m.combined,'call',m.weekday?'16:00–08:00':'24 ชม.')}</div>`);
   cells.push(`<div class="v615-day${isToday?' is-today':''}${m.weekday?'':' is-off'}"><div class="v615-daynum"><span>${Number(d.slice(-2))}</span>${isToday?'<em>วันนี้</em>':''}</div>${entries.join('')}</div>`);
 }
 return `<div class="v615-weekdays"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div><div class="v615-calendar">${cells.join('')}</div>`;
}
function table(){const a=api();if(!a?.cache?.loaded)return '<section class="card v615-loading">กำลังโหลดตารางเวรแพทย์…</section>';
 const rows=dates(month).map(d=>{const m=a.baseForDate(d);return `<tr${d===todayKey()?' class="is-today"':''}><td><b>${esc(dateThai(d))}</b><small>${esc(dayShort(d))}</small></td><td>${m.weekday?contactBtn(m.donor,'donor'):'<span class="v615-offtext">วันหยุด</span>'}</td><td>${m.weekday?contactBtn(m.bb,'bb'):'<span class="v615-offtext">วันหยุด</span>'}</td><td>${contactBtn(m.combined,'call',m.weekday?'16:00–08:00':'24 ชม.')}<small>${m.weekday?'16:00–08:00':'ตลอดวัน'}</small></td></tr>`;}).join('');
 return `<div class="v615-table-scroll"><table class="v615-table"><thead><tr><th>วันที่</th><th>Donor<br><small>08:00–16:00</small></th><th>Blood Bank<br><small>08:00–16:00</small></th><th>On-call / วันหยุด</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function board(){if(!api())return '<section class="card">ไม่พบโมดูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</section>';if(api().cache?.unavailable)return '<section class="card">ยังไม่เปิดใช้งานฐานข้อมูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</section>';if(!ensure())return '<section class="card v615-loading">กำลังโหลดตารางเวรแพทย์…</section>';
 return `<section class="card v615-roster-card"><div class="v615-head"><div><h3>ตารางเวรแพทย์</h3><p>${esc(monthLongThai(month))} · Donor / Blood Bank / On-call</p></div><span class="v615-readonly">อ่านอย่างเดียว</span></div><div class="v615-controls"><div class="v615-tabs" role="tablist"><button type="button" data-v615-view="calendar" class="${view==='calendar'?'active':''}">ปฏิทิน</button><button type="button" data-v615-view="table" class="${view==='table'?'active':''}">ตาราง</button></div><div class="v615-month-nav"><button type="button" class="v615-arrow" data-v615-month="-1" aria-label="เดือนก่อน">‹</button><button type="button" class="v615-month-label" data-v615-pick-month>${esc(monthThai(month))}</button><button type="button" class="v615-arrow" data-v615-month="1" aria-label="เดือนถัดไป">›</button><input type="month" id="v615-month-picker" value="${esc(month)}" aria-label="เลือกเดือน"></div></div><div class="v615-legend"><span><i class="donor"></i>Donor</span><span><i class="bb"></i>Blood Bank</span><span><i class="call"></i>On-call</span></div><div id="v615-view-slot">${view==='calendar'?calendar():table()}</div></section>`;
}
function markup(){return `<div class="v615-page">${todayCard()}<div id="v615-board-slot">${board()}</div></div>`;}
function paint(){if(S().page!==PAGE)return;const slot=document.getElementById('v615-board-slot');if(slot)slot.innerHTML=board();else{const root=document.getElementById('pageContent');if(root)root.innerHTML=markup();}}
function render(){if(S().page!==PAGE)return false;const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),root=document.getElementById('pageContent');if(title)title.textContent='ตารางเวรแพทย์';if(sub)sub.textContent='ดูว่าแต่ละวันต้องติดต่อแพทย์คนไหน';if(root)root.innerHTML=markup();return true;}
const prev=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(typeof prev==='function'){const fn=function(){if(render())return;return prev.apply(this,arguments);};try{window.renderPage=renderPage=fn;}catch(_){window.renderPage=fn;}}
document.addEventListener('click',e=>{if(S().page!==PAGE)return;
 const v=e.target.closest?.('[data-v615-view]');if(v){view=v.getAttribute('data-v615-view')==='table'?'table':'calendar';paint();return;}
 const nav=e.target.closest?.('[data-v615-month]');if(nav){shiftMonth(Number(nav.getAttribute('data-v615-month'))||0);return;}
 const pick=e.target.closest?.('[data-v615-pick-month]');if(pick){document.getElementById('v615-month-picker')?.showPicker?.();document.getElementById('v615-month-picker')?.click?.();return;}
 const doc=e.target.closest?.('[data-v615-doctor]');if(doc){e.preventDefault();e.stopPropagation();const id=doc.getAttribute('data-v615-doctor')||'',site=doc.getAttribute('data-v615-site')||'',time=doc.getAttribute('data-v615-time')||'';try{if(window.cnmiPhysicianPhoneV455?.openDoctor){window.cnmiPhysicianPhoneV455.openDoctor(id,site,time);return;}}catch(_){}const p=staff(id),raw=String(p?.phone||p?.contact_phone||'').trim();if(!raw){try{toast?.('ยังไม่มีเบอร์โทรแพทย์ในข้อมูลผู้ใช้งาน');}catch(_){}return;}const digits=raw.replace(/[^\d+]/g,'');try{showModal?.(`<div style="text-align:center"><h3>${esc(nameOf(id))}</h3><p>${esc(raw)}</p><a class="primary-btn" href="tel:${esc(digits)}">โทรออก</a></div>`,{small:true});}catch(_){location.href=`tel:${digits}`;}return;}
},true);
document.addEventListener('change',e=>{if(S().page!==PAGE||e.target?.id!=='v615-month-picker')return;if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){month=e.target.value;paint();}},true);
window.cnmiPhysicianRosterV615={render,paint};
})();
