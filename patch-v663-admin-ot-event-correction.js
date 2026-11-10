/* Staff Planner v663 — controlled OT correction; requires separately installed SQL v663.
   No automatic cancellation. All changes require Admin, batch reopen, event preview and confirmation.
   Avoids reloading OT tables or running expensive background polling. */
(()=>{'use strict';
 if(window.__CNMI_V663_OT_CORRECTION__)return;window.__CNMI_V663_OT_CORRECTION__=true;
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const S=()=>{try{return window.state||(typeof state!=='undefined'?state:{})}catch(_){return window.state||{}}};
 const db=()=>{try{return window.sb||(typeof sb!=='undefined'?sb:null)}catch(_){return window.sb||null}};
 const admin=()=>{try{return typeof window.isAdmin==='function'?!!window.isAdmin():S()?.profile?.role==='admin'}catch(_){return false}};
 const section=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('section')||'';
 const active=()=>location.hash.startsWith('#/ot?')&&section()==='hr-claims';
 const month=()=>{const raw=new URLSearchParams(location.hash.split('?')[1]||'').get('month')||S().otMenuMonthV369||'';return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)?raw:new Date().toISOString().slice(0,7)};
 const n=v=>Number(v||0).toLocaleString('th-TH');
 const two=v=>Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:2});
 let loadedMonth='',groups=[],selected=null,reviewActive=false,busy=false,mountTimer=0,watcherHost=null,staffMonth='',staffCheckAt=0,staffHold=false,staffBusy=false;
 async function rpc(name,args){const c=db();if(!c?.rpc)throw Error('ยังไม่ได้เชื่อมต่อ Supabase');const r=await c.rpc(name,args);if(r.error)throw r.error;return r.data;}
 function status(message,type=''){const e=$('#v663Status');if(e){e.textContent=message;e.dataset.type=type}}
 function showMain(){const e=$('#v663AdminPanel');if(e){e.open=true;e.scrollIntoView({block:'nearest',behavior:'smooth'})}}
 function adminHTML(m){return `<summary>แก้ OT ซ้ำเป็นชุด • เปิดรอบตรวจสอบก่อน Export ใหม่ <span class="v663-small">(Admin)</span></summary>
 <div class="v663-content">
 <p><b>เดือน ${esc(m)}</b> • ยกเลิกตาม Event ID ที่ตรวจพบจริง ไม่ลบ OT ทุกคนทั้งวัน และไม่แก้ตารางเวร</p>
 <div class="v663-warn">ลำดับที่ปลอดภัย: <b>เปิดรอบตรวจ → ตีกลับ Export ทุก Batch ด้วย v662 → เลือกยกเลิก Event ที่ซ้ำ → ตรวจยอดทบ → Export ใหม่ → ประกาศ HR ฉบับใหม่ → ปิดรอบตรวจ</b></div>
 <section id="v663OpenBox"><label>เหตุผลเปิดรอบตรวจแก้ <textarea id="v663OpenReason" rows="2" placeholder="พบ OT กิจกรรมวันที่ 1 และ 15 ต.ค. ซ้ำ และต้อง Export ใหม่"></textarea></label>
 <button type="button" data-v663="open">1. เปิดรอบตรวจแก้และพักการยืนยันยอดเดิม</button></section>
 <div class="v663-tools"><button type="button" data-v663="reopen">2. ไปที่เครื่องมือตีกลับ Export v662</button>
 <button type="button" data-v663="refresh">3. ตรวจกลุ่มกิจกรรม OT เดือนนี้</button></div>
 <div id="v663Overview" aria-live="polite">กด “ตรวจกลุ่มกิจกรรม OT” เพื่อดูข้อมูลก่อนยกเลิก</div>
 <div id="v663Action" hidden>
 <h4 id="v663SelectedTitle">ยกเลิกกิจกรรม</h4>
 <p>การยกเลิกจะเปลี่ยนสถานะ OT ในกลุ่มนี้เป็น “ไม่อนุมัติ” และบันทึกสำเนาก่อนแก้ครบทุกแถว ไม่ลบรายการจริง</p>
 <label>เหตุผลยกเลิกกลุ่มกิจกรรม <textarea id="v663CancelReason" rows="2" placeholder="เช่น บันทึกประชุมซ้ำกับกิจกรรมเดิมของวันที่เดียวกัน"></textarea></label>
 <label>พิมพ์ <code id="v663Expected"></code> เพื่อยืนยัน <input id="v663Typed" autocomplete="off" spellcheck="false"></label>
 <button type="button" data-v663="cancel" class="v663-danger">ยืนยันยกเลิกเฉพาะ Event ID นี้</button>
 </div>
 <section class="v663-finish"><h4>4. ปิดรอบแก้ไขและเปิดให้ Staff ยืนยันฉบับใหม่</h4>
 <p>ใช้หลังจาก Export HR ใหม่ครบทั้งเดือนและประกาศฉบับแก้ไขของ Batch ใหม่แล้วเท่านั้น ฐานข้อมูลจะตรวจสองเงื่อนไขนี้ซ้ำ</p>
 <label>Batch ID ของ Export ใหม่ <input id="v663Batch" placeholder="เช่น 20261110-xxxxxx" autocomplete="off"></label>
 <label>พิมพ์ <code>FINISH ${esc(m)} &lt;Batch ID&gt;</code> <input id="v663FinishTyped" autocomplete="off" spellcheck="false" placeholder="FINISH ${esc(m)} ..."></label>
 <button type="button" data-v663="finish">ปิดรอบแก้ไขและปลดล็อกการยืนยัน</button>
 </section><div class="v663-status" id="v663Status">ยังไม่มีการเปลี่ยนข้อมูล Supabase</div>
 </div>`}
 function mountAdmin(){if(!admin()||!active())return;const host=$('#v637Admin');if(!host||host.hidden)return;const m=month();let panel=host.querySelector('#v663AdminPanel');if(panel&&m===loadedMonth)return;
  if(panel)panel.remove();loadedMonth=m;selected=null;groups=[];reviewActive=false;
  panel=document.createElement('details');panel.id='v663AdminPanel';panel.className='v663-panel';panel.innerHTML=adminHTML(m);
  const v662=host.querySelector('#v662ReopenPanel');if(v662)v662.insertAdjacentElement('afterend',panel);else host.prepend(panel);
 }
 function flagGroup(g){if(g.work_date==='2026-10-01'&&g.event_id==='179is4e')return 'ควรตรวจ: สร้างย้อนหลัง 9 พ.ย.';
  if(g.work_date==='2026-10-15'&&g.event_id==='oocbtq')return 'ควรตรวจ: สร้างย้อนหลัง 9 พ.ย.';
  return '';
 }
 function renderGroups(data){groups=Array.isArray(data?.groups)?data.groups:[];reviewActive=!!data?.under_review;
  const place=$('#v663Overview');if(!place)return;
  const old=$('#v663OpenBox');if(old)old.hidden=reviewActive;
  const total=groups.reduce((s,g)=>s+Number(g.row_count||0),0);
  place.innerHTML=`<div class="v663-result"><b>${reviewActive?'รอบตรวจแก้เปิดอยู่ — หยุดการยืนยันยอดเดิม':'ยังไม่ได้เปิดรอบตรวจแก้'}</b><span>พบ ${n(groups.length)} กลุ่มกิจกรรม รวม ${n(total)} รายการ</span></div>`+
   (groups.length?`<div class="v663-tablewrap"><table><thead><tr><th>วันที่</th><th>Event ID / รายละเอียด</th><th>คน</th><th>ชั่วโมงในรายการ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>`+
    groups.map(g=>{const can=!!g.can_cancel;const flag=flagGroup(g);return `<tr><td>${esc(g.work_date)}</td><td><b>${esc(g.event_id)}</b>${flag?`<div class="v663-flag">${esc(flag)}</div>`:''}</td><td>${n(g.staff_count)}</td><td>${two(g.listed_hours)}</td><td>${Number(g.exported_count)>0?`<span class="v663-chip">Export อยู่ ${n(g.exported_count)}</span>`:Number(g.approved_count)===Number(g.row_count)?'<span class="v663-chip good">รอตรวจ</span>':'<span class="v663-chip">แก้ไขแล้ว/ไม่พร้อม</span>'}</td><td><button type="button" data-v663-select="${esc(g.event_id)}" ${can?'':'disabled'}>${can?'เลือกกลุ่มนี้':'ยังยกเลิกไม่ได้'}</button></td></tr>`}).join('')+`</tbody></table></div>`:'<p>ไม่พบกลุ่มกิจกรรมที่มี Event ID ในเดือนนี้</p>')+
   `<p class="v663-hint">ถ้าขึ้น Export อยู่ ให้เปิดรอบตรวจแล้วตีกลับทั้งเดือนด้วย v662 ก่อน • กลุ่มที่อนุมัติแล้วทั้งหมดและยังไม่ Export จึงจะยกเลิกได้</p>`;
  if(!reviewActive)status('ต้องกดเปิดรอบตรวจแก้ก่อนทำรายการ');else status('อยู่ระหว่างตรวจแก้ • การยืนยันยอด HR ฉบับเดิมถูกพักไว้','warning');
 }
 async function refresh(){if(busy)return;busy=true;status('กำลังอ่านรายการกิจกรรมจาก Supabase…');
  try{const m=month(),data=await rpc('admin_list_ot_event_groups_v663',{p_month:m});selected=null;const b=$('#v663Action');if(b)b.hidden=true;renderGroups(data)}
  catch(e){status('ตรวจไม่ได้: '+String(e.message||e)+' • ตรวจว่าติดตั้ง SQL v663 ใน Supabase แล้ว','error')}
  finally{busy=false}
 }
 async function openReview(){if(busy)return;const m=month(),reason=String($('#v663OpenReason')?.value||'').trim();if(reason.length<12)return status('กรุณาใส่เหตุผลเปิดรอบอย่างน้อย 12 ตัวอักษร','error');
  if(!confirm(`เริ่มตรวจแก้เดือน ${m} และพักการยืนยันยอด HR ฉบับเดิม?\n\nยังไม่ลบหรือแก้ OT รายการใด`))return;
  busy=true;try{await rpc('admin_begin_ot_hr_correction_v663',{p_month:m,p_reason:reason});await refreshUnsafe();status('เปิดรอบตรวจแก้แล้ว • ต่อไปใช้ v662 ตีกลับ Batch ก่อนเลือกยกเลิก','ok')}
  catch(e){status('เปิดรอบไม่สำเร็จ: '+String(e.message||e),'error')}finally{busy=false}
 }
 async function refreshUnsafe(){const data=await rpc('admin_list_ot_event_groups_v663',{p_month:month()});renderGroups(data)}
 function choose(eventId){const g=groups.find(x=>x.event_id===eventId&&x.can_cancel);if(!g)return status('กลุ่มนี้ยังยกเลิกไม่ได้ ต้องตรวจสถานะก่อน','error');selected={...g,month:month()};
  const text=`CANCEL ${selected.month} ${g.event_id}`;$('#v663SelectedTitle').textContent=`ยกเลิก Event ${g.event_id} (${g.work_date}) — ${n(g.row_count)} รายการ`;
  $('#v663Expected').textContent=text;$('#v663Typed').value='';$('#v663CancelReason').value='';$('#v663Action').hidden=false;$('#v663Action').scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async function cancelEvent(){if(busy||!selected)return status('เลือกกลุ่มกิจกรรมก่อน','error');if(selected.month!==month())return status('เดือนเปลี่ยนแล้ว กรุณาตรวจรายการใหม่','error');
  const reason=String($('#v663CancelReason')?.value||'').trim(),typed=String($('#v663Typed')?.value||'').trim(),expected=`CANCEL ${month()} ${selected.event_id}`;
  if(reason.length<12)return status('กรุณาใส่เหตุผลยกเลิกอย่างน้อย 12 ตัวอักษร','error');if(typed!==expected)return status('พิมพ์คำยืนยันไม่ตรง: '+expected,'error');
  if(!confirm(`ยืนยันยกเลิกเฉพาะ Event ${selected.event_id} วันที่ ${selected.work_date} จำนวน ${selected.row_count} รายการ?\nรายการเดิมจะถูกเก็บใน Audit แต่ไม่ถูกนำไปคำนวณ OT อีก`))return;
  busy=true;try{const d=await rpc('admin_cancel_ot_event_v663',{p_month:month(),p_event_id:selected.event_id,p_expected_count:Number(selected.row_count),p_fingerprint:selected.fingerprint,p_reason:reason,p_confirmation:typed});
   selected=null;await refreshUnsafe();const a=$('#v663Action');if(a)a.hidden=true;status(`ยกเลิกสำเร็จ ${n(d.cancelled_rows)} รายการ • Audit #${d.audit_id} • ต้องตรวจยอดทบและ Export ใหม่`,'ok');
   try{window.cnmiV318?.clearHistoryCache?.();window.cnmiV318?.clearCarryCache?.();window.cnmiV637?.refresh?.()}catch(_){ }
  }catch(e){status('ไม่ยกเลิก: '+String(e.message||e)+' • ข้อมูลจะไม่ถูกเปลี่ยนบางส่วนถ้า RPC ไม่สำเร็จ','error')}
  finally{busy=false}
 }
 async function finish(){if(busy)return;const m=month(),batch=String($('#v663Batch')?.value||'').trim(),typed=String($('#v663FinishTyped')?.value||'').trim();
  if(!/^[0-9A-Za-z_-]{6,80}$/.test(batch))return status('กรุณาใส่ Batch ID จาก Export ฉบับใหม่','error');if(typed!==`FINISH ${m} ${batch}`)return status('พิมพ์คำยืนยันปิดรอบไม่ตรง','error');
  if(!confirm('ยืนยันว่า Export HR ใหม่ทั้งเดือน ตรวจยอดทบ และประกาศยอดฉบับใหม่แล้ว?\nเมื่อปิดรอบ Staff จะกลับมากดยืนยันได้'))return;
  busy=true;try{await rpc('admin_finish_ot_hr_correction_v663',{p_month:m,p_batch:batch,p_confirmation:typed});await refreshUnsafe();status('ปิดรอบตรวจแก้สำเร็จ • ยืนยันฉบับใหม่ได้แล้ว','ok')}
  catch(e){status('ปิดรอบไม่ได้: '+String(e.message||e),'error')}finally{busy=false}
 }
 // Original v532 buttons change JS state only, so the hash router restores Export History.
 // Intercept at window capture, then run the actual sidebar sub-menu action instead.
 window.addEventListener('click',e=>{const b=e.target?.closest?.('[data-v532-adjust-row],[data-v532-adjust-batch]');if(!b||!admin())return;
  e.preventDefault();e.stopImmediatePropagation();
  const sub=$('[data-v528-extra-mode="adjustment"]');if(sub){sub.click();return}
  const s=S();s.page='ot';s.otMenuV369='admin-extra';s.v527ExtraMode='adjustment';s.otGroupV522='ot';
  try{sessionStorage.setItem('cnmi-v528-admin-extra-mode','adjustment')}catch(_){ }
  try{location.hash='#/ot?section=admin-extra&month='+encodeURIComponent(month());window.renderPage?.()}catch(_){ }
 },true);
 document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-v663],[data-v663-select]');if(!b)return;
  e.preventDefault();e.stopPropagation();if(b.disabled)return;
  if(b.dataset.v663Select){choose(b.dataset.v663Select);return}
  const action=b.dataset.v663;if(action==='refresh')void refresh();else if(action==='open')void openReview();else if(action==='cancel')void cancelEvent();else if(action==='finish')void finish();
  else if(action==='reopen'){const p=$('#v662ReopenPanel');if(p){p.open=true;p.scrollIntoView({block:'start',behavior:'smooth'});status('ใช้เครื่องมือ v662 กด “ตรวจสอบ Batch เดือนนี้” และยืนยันตีกลับก่อนกลับมาเลือก Event','warning')}else status('ไม่พบเครื่องมือ v662 • ต้องติดตั้ง v662 ให้ครบ','error')}
 },true);
 async function staffReview(){const s=S(),eligible=s.page==='ot'&&s.otMenuV369==='staff-summary';if(!eligible)return;const m=month(),now=Date.now();
  if(staffBusy||(m===staffMonth&&now-staffCheckAt<12000))return;staffBusy=true;
  try{staffHold=!!await rpc('ot_hr_month_is_under_review_v663',{p_month:m});staffMonth=m;staffCheckAt=Date.now()}
  catch(_){staffHold=false;staffMonth=m;staffCheckAt=Date.now()}finally{staffBusy=false}
  updateStaffHold();
 }
 function updateStaffHold(){const card=$('#v637Staff');if(!card)return;const h=card.querySelector('#v663StaffHold');if(!staffHold){if(h)h.remove();return}
  if(!h){const note=document.createElement('div');note.id='v663StaffHold';note.className='v663-staff-hold';note.textContent='ยอด HR ฉบับนี้อยู่ระหว่างตรวจแก้ไขโดย Admin — ยังไม่ต้องกดยืนยัน กรุณารอประกาศฉบับใหม่';card.prepend(note)}
  card.querySelectorAll('[data-v637-confirm],[data-v637-dispute]').forEach(b=>{b.disabled=true;b.title='พักการยืนยันระหว่างตรวจแก้ OT'});
 }
 // Client-side guard enhances UX; the SQL trigger is the real safety enforcement.
 window.addEventListener('click',e=>{if(!staffHold)return;const b=e.target?.closest?.('[data-v637-confirm],[data-v637-dispute]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();updateStaffHold()},true);
 function observe(){const host=$('#pageContent');if(!host||watcherHost===host)return;watcherHost=host;
  new MutationObserver(ms=>{if(!ms.some(m=>m.addedNodes?.length))return;
   if(active()&&admin()&&!$('#v663AdminPanel'))schedule();
   if(staffHold&&S().otMenuV369==='staff-summary'&&$('#v637Staff')&&!$('#v663StaffHold'))updateStaffHold();
  }).observe(host,{subtree:true,childList:true});
 }
 function schedule(){clearTimeout(mountTimer);mountTimer=setTimeout(()=>{observe();mountAdmin();if(S().page==='ot'&&S().otMenuV369==='staff-summary')void staffReview()},180)}
 function init(){schedule();setTimeout(schedule,700);setTimeout(schedule,1500)}
 window.addEventListener('hashchange',()=>{loadedMonth='';staffMonth='';staffHold=false;schedule();setTimeout(schedule,450);setTimeout(schedule,1100)});
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-v369-ot-menu],[data-v528-extra-mode],[data-v523-ot-item]'))setTimeout(schedule,380)},false);
 document.addEventListener('change',e=>{if(e.target.matches?.('input[type="month"]')){loadedMonth='';staffMonth='';setTimeout(schedule,420)}},true);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.cnmiV663={refresh:()=>{loadedMonth='';staffMonth='';schedule()}};
})();
