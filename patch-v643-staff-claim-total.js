/* V643: Staff claim DETAILS only. Show the authoritative HR total ahead of the live monthly calculation.
   No global polling, no mutation observer. Launched by the existing v632 route-aware renderer. */
(()=>{'use strict';if(window.__CNMI_V643__)return;window.__CNMI_V643__=true;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>Number(x);
const valid=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(number(x));
const fmt=x=>number(x).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2});
const baht=x=>fmt(x)+' บาท';
const DB=()=>{try{return (typeof sb!=='undefined'&&sb?.rpc?sb:null)||window.sb||window.supabaseClient||null}catch(_){return window.sb||null}};
const currentMonth=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||'';
const active=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('section')==='claim-detail';
const first=answer=>Array.isArray(answer)?answer[0]:null;
let token=0, lastPanel=null,lastMonth='',lastRequest=0;
const okResult=result=>result.status==='fulfilled'&&!result.value?.error;
function ensure(panel){let el=panel.querySelector('#v643HrTotal');if(!el){el=document.createElement('section');el.className='card v643-hr-total';el.id='v643HrTotal';panel.prepend(el)}else if(panel.firstElementChild!==el){panel.prepend(el)}return el}
function liveCore(panel){
  // Current monthly OT calculation is an independent figure; use it only when it reconciles to the actual ledger.
  const row=panel.querySelector('.v347-claim-equation .money b');
  const n=Number(String(row?.textContent||'').replace(/[^\d.-]/g,''));
  return row&&Number.isFinite(n)?n:null;
}
function draw(card,{base,total,extras,kind,revision,ledger,core,issue}){
 if(!valid(base)||!valid(total)||number(total)<0){card.innerHTML='<h3>ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</h3><p>ยังตรวจยอดต้นฉบับและยอดรวมไม่ได้ กรุณาตรวจที่หน้าสรุปรายเดือน</p>';return}
 const original=number(base),final=number(total),specials=Array.isArray(extras)?extras:[];
 const extra=specials.reduce((s,x)=>s+(valid(x.amount)?number(x.amount):0),0);
 const changedCore=Math.round((final-extra-original)*100)/100;
 const exported=Array.isArray(ledger)?ledger.filter(x=>String(x.apply_month)===(card.dataset.v643Month||'')&&String(x.status).toLowerCase()==='exported'):[];
 const adjustment=Math.round(exported.reduce((s,x)=>s+(valid(x.amount_delta)?number(x.amount_delta):0),0)*100)/100;
 const hasLedger=exported.length>0;
 const reconciled=hasLedger&&core!==null&&Math.abs(core+adjustment-original)<0.02;
 const status=kind==='draft'?'Admin บันทึกร่างแล้ว • รอเปิดให้เจ้าหน้าที่ยืนยัน':kind==='published'?`ฉบับแก้ไข ${esc(revision||'ล่าสุด')} • เปิดให้ตรวจสอบแล้ว`:'ยอด Export ต้นฉบับ • ยังไม่มีฉบับแก้ไข';
 const parts=[];
 if(reconciled){
   parts.push(`<div><span>ยอด OT เดือนนี้</span><b>${baht(core)}</b></div>`);
   parts.push(`<div><span>OT ตกเบิก / ปรับย้อนหลังที่รวมใน Export แล้ว</span><b>${adjustment>=0?'+':''}${baht(adjustment)}</b></div>`);
 }else if(hasLedger){
   parts.push(`<div><span>รายการปรับย้อนหลังที่มีสถานะรวมใน Export</span><b>${adjustment>=0?'+':''}${baht(adjustment)}</b></div>`);
   parts.push(`<p class="v643-disclaimer">ยอดจากรายการรายวันยังไม่ตรงกับยอด Export จึงไม่แยกเป็นยอด OT เดือนนี้โดยประมาณ กรุณาดูรายการด้านล่าง</p>`);
 }
 parts.push(`<div class="v643-original"><span>ยอด Export ต้นฉบับ (ไม่รวมเบิกพิเศษ)</span><b>${baht(original)}</b></div>`);
 if(Math.abs(changedCore)>=.01)parts.push(`<div><span>ปรับยอดเบิกหลักโดย Admin</span><b>${changedCore>=0?'+':''}${baht(changedCore)}</b></div>`);
 if(specials.length||Math.abs(extra)>=.01)parts.push(`<div><span>เบิกพิเศษนอก Export</span><b class="v643-plus">+${baht(extra)}</b></div>`);
 const list=specials.map(x=>`<div class="v643-special-item"><span>${esc(x.title||'เบิกพิเศษ')}<small>${esc(x.reason||'')}</small></span><b>+${valid(x.amount)?baht(x.amount):'ตรวจสอบยอด'}</b></div>`).join('');
 card.innerHTML=`<div class="v643-head">ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</div>
 <p class="v643-period">${esc(card.dataset.v643Month||'')} • ${status}</p>
 <div class="v643-total-box"><small>${kind==='draft'?'ยอดรวมร่าง (ยังยืนยันไม่ได้)':kind==='published'?'ยอดรวมฉบับล่าสุดที่ Admin เปิดให้ตรวจสอบ':'ยอด Export ต้นฉบับ'}</small>
 <strong class="v643-total-number">${baht(final)}</strong></div>
 <div class="v643-parts">${parts.join('')}</div>
 ${list?`<details class="v643-extras"><summary>ดูรายละเอียดเบิกพิเศษ ${specials.length} รายการ</summary>${list}</details>`:''}
 ${issue?`<p class="v643-disclaimer">${esc(issue)}</p>`:''}
 <p class="v643-footer">${kind==='draft'?'รอ Admin เปิดยอดก่อนกดยืนยัน':kind==='published'?'ยืนยันยอดหรือแจ้งยอดไม่ตรงได้ที่เมนู “สรุปรายเดือน”':'ยอดนี้คือยอดที่ Export แล้ว ไม่ได้หมายความว่าส่ง HR หรือได้รับเงินแล้ว'}</p>`;
 // Legacy post-export recalculation (often 0 baht) must not appear to be the HR amount.
 const older=card.parentElement?.querySelector('#v534SimpleClaimCard');if(older)older.classList.add('v643-secondary-claim');
}
async function refresh(panel,month){
 if(!active()||!panel?.isConnected||!month)return;
 const card=ensure(panel);card.dataset.v643Month=month;
 // One load per route entry, no time-based UI polling.
 if(lastPanel===panel&&lastMonth===month&&Date.now()-lastRequest<20000)return;
 lastPanel=panel;lastMonth=month;lastRequest=Date.now();const id=++token;
 card.innerHTML='<div class="v643-head">ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</div><p class="v643-wait">กำลังตรวจยอด Export และรายการเบิกพิเศษ…</p>';
 const client=DB();if(!client?.rpc){card.innerHTML='<h3>ยอด OT ที่เตรียมส่งเบิก HR</h3><p>ยังไม่สามารถเชื่อมต่อฐานข้อมูล กรุณาเปิดหน้าสรุปรายเดือนเพื่อตรวจยอด</p>';return}
 try{
  const [snapshot,pdf,published,draft,history]=await Promise.allSettled([
   client.rpc('get_my_ot_export_snapshot_v533',{p_month:month}),
   client.rpc('get_my_hr_pdf_reviews_v630',{p_month:month}),
   client.rpc('my_hr_revision_v637',{p_month:month}),
   client.rpc('my_hr_draft_preview_v642',{p_month:month}),
   client.rpc('get_my_ot_adjustment_history_v630')
  ]);
  if(id!==token||!card.isConnected||!active()||currentMonth()!==month)return;
  const s=okResult(snapshot)?first(snapshot.value.data):null;
  const p=okResult(pdf)?first(pdf.value.data):null;
  const pub=okResult(published)?published.value.data:null;
  const dr=okResult(draft)?draft.value.data:null;
  const base=valid(s?.money)?number(s.money):valid(p?.snapshot_money)?number(p.snapshot_money):valid(dr?.snapshot_money)?number(dr.snapshot_money):null;
  if(!valid(base)){
    card.innerHTML='<h3>ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</h3><p class="v643-disclaimer">ไม่พบยอด Export ที่ตรวจสอบได้ กรุณาดูยอดในหน้าสรุปรายเดือน</p>';return;
  }
  const kind=pub?.id?'published':dr?.is_draft?'draft':'original';
  const r=kind==='published'?pub:kind==='draft'?dr:null;
  const total=r?(valid(r.amount)?number(r.amount):NaN):number(base);
  if(!valid(total)||total<0){card.innerHTML='<h3>ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</h3><p>ยอดฉบับล่าสุดผิดรูปแบบ กรุณาแจ้ง Admin</p>';return}
  // A failed revision lookup could hide extra claims; do NOT mislabel Export as the final HR amount.
  if(kind==='original'&&(!okResult(published)||!okResult(draft))){card.innerHTML='<h3>ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</h3><p>อ่านสถานะเบิกพิเศษล่าสุดไม่สำเร็จ จึงยังไม่แสดงยอดรวม กรุณาตรวจที่หน้าสรุปรายเดือน</p>';return}
  if(card.parentElement?.firstElementChild!==card)card.parentElement.prepend(card);
  draw(card,{base,total,extras:r?.specials||[],kind,revision:r?.revision_no,
    ledger:okResult(history)?history.value.data:null,core:liveCore(panel),
    issue:!okResult(history)?'ยังไม่สามารถตรวจประวัติการปรับยอดย้อนหลังได้':''});
 }catch(err){if(card.isConnected)card.innerHTML='<h3>ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</h3><p>เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาตรวจยอดในหน้าสรุปรายเดือน</p>'}
}
window.cnmiV643Detail={refresh};
})();
