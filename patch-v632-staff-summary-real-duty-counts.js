/* V632: Staff PDF acknowledgement is the only monthly summary; detail includes real-shift counts. */
(()=>{'use strict';if(window.__CNMI_V632__)return;window.__CNMI_V632__=true;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('th-TH',{maximumFractionDigits:2});
const fmtMoney=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const S=()=>window.state||((typeof state!=='undefined')?state:{});
const DB=()=>{try{return (typeof sb!=='undefined'&&sb?.rpc?sb:null)||window.sb||window.supabaseClient||null}catch(_){return window.sb||null}};
const nowMonth=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||S().otMenuMonthV369||S().otMoneyMonthV241||S().monthKey||new Date().toISOString().slice(0,7);
const sid=()=>{try{return String(currentStaffId()||'')}catch(_){return String(S().profile?.staff_id||'')}};
const notify=t=>{try{showToast(t)}catch(_){alert(t)}};
let key='', stamp=0,busy=false, seq=0;
function screen(){if(S().page!=='ot')return '';const section=String(S().otMenuV369||'');return section==='staff-summary'||section==='staff-details'?section:''}
function host(){return document.querySelector('.v369-ot-content')}
function visiblePanel(panel,kind){if(!panel)return;panel.dataset.v632Screen=kind; if(kind==='staff-summary'){
  Array.from(panel.children).forEach(child=>{if(!child.classList.contains('v632-summary'))child.classList.add('v632-suppressed')});
 }else{Array.from(panel.children).forEach(child=>child.classList.remove('v632-suppressed'))}}
function reviewMarkup(records,failed,revision,revisionError,preview,previewError){
 const r=records[0]||null;
 // Published revisions, NOT drafts, are authoritative for staff acceptance. Original Snapshot is never edited.
 if(revision&&revision.id){
   const original=r&&r.snapshot_money!=null?Number(r.snapshot_money):null;
   const specials=Array.isArray(revision.specials)?revision.specials:[];
   const specialTotal=Math.round(specials.reduce((sum,x)=>sum+Number(x.amount||0),0)*100)/100;
   const final=Number(revision.amount);
   const core=final-specialTotal;
   const baseAdjustment=original===null?null:Math.round((core-original)*100)/100;
   if(!Number.isFinite(final)||final<0)return '<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="v632-error">ยอดฉบับล่าสุดมีรูปแบบไม่ถูกต้อง กรุณาแจ้ง Admin</p>';
   const items=specials.map(x=>`<div class="v641-special-line"><span>${esc(x.title||'เบิกพิเศษ')}<small>${esc(x.reason||'')}</small></span><b>+${fmtMoney(x.amount)} บาท</b></div>`).join('');
   const status=revision.status||'';
   const message=status==='confirmed'?'ยืนยันยอดฉบับนี้แล้ว':status==='disputed'?'แจ้งยอดไม่ตรงแล้ว — รอ Admin ตรวจสอบ':'ฉบับแก้ไขล่าสุด — รอเจ้าหน้าที่ยืนยัน';
   return `<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="v632-hint">เดือน ${esc(revision.month)} • ฉบับแก้ไข ${esc(revision.revision_no)} • Admin บันทึกยอดสำหรับส่ง HR (ยังไม่ได้หมายความว่าได้รับเงินแล้ว)</p>
   <section class="v632-review v641-review" data-v641-revision="${esc(revision.id)}" data-v641-final="${esc(final)}">
     <div class="v632-values v641-values">
       <div><small>ยอดจากระบบ Export (ไม่รวมเบิกพิเศษ)</small><strong>${original===null?'ตรวจสอบไม่ได้':fmtMoney(original)+' ฿'}</strong></div>
       <div class="v641-final"><small>ยอดรวมที่ Admin เสนอส่งเบิก HR (รวมเบิกพิเศษ)</small><strong>${fmtMoney(final)} ฿</strong></div>
     </div>
     <div class="v641-breakdown">
       ${original!==null?`<div><span>ยอด Export ต้นฉบับ</span><b>${fmtMoney(original)} บาท</b></div>`:''}
       ${baseAdjustment!==null&&Math.abs(baseAdjustment)>=.01?`<div><span>ปรับยอดเบิกหลักตามการตรวจสอบ</span><b>${baseAdjustment>=0?'+':''}${fmtMoney(baseAdjustment)} บาท</b></div>`:''}
       <div><span>เบิกพิเศษเพิ่มเติม (ไม่รวมในไฟล์ Export ต้นฉบับ)</span><b class="v641-positive">+${fmtMoney(specialTotal)} บาท</b></div>
       <div class="v641-total"><strong>ยอดรวมฉบับล่าสุด</strong><strong>${fmtMoney(final)} บาท</strong></div>
     </div>
     ${items?`<details class="v641-details"><summary>ดูรายละเอียดเบิกพิเศษ ${specials.length} รายการ</summary>${items}</details>`:''}
     ${original===null?`<p class="v632-hint">หมายเหตุ: โหลด Snapshot ไม่สำเร็จ จึงไม่แสดงยอด Export ต้นฉบับ (${esc(failed||'ไม่พบข้อมูล')})</p>`:''}
     <p class="v632-status">สถานะ: ${message}</p>
     ${status==='confirmed'?'<p class="v641-confirmed">บันทึกการยืนยันฉบับนี้แล้ว</p>':`<label>ยอดที่ฉันตรวจนับ (บาท)<input data-v632-amount type="number" min="0" step="0.01" inputmode="decimal" value="${esc(revision.counted_money??final)}"></label><label>หมายเหตุหากยอดไม่ตรง<input data-v632-note placeholder="บอกวันที่ OT หรือเหตุผลที่ไม่ตรง" value="${esc(revision.note||'')}"></label><div class="v632-actions"><button type="button" data-v641-submit="confirmed">✓ ยืนยันยอดถูกต้อง</button><button type="button" data-v641-submit="disputed">ยอดไม่ตรง / ให้ Admin ตรวจสอบ</button></div>`}
   </section>`;
 }
 // A saved draft can be displayed read-only, but never confirmed until the Admin explicitly publishes it.
 if(preview&&preview.is_draft===true){
   const base=Number(preview.snapshot_money);
   const amount=Number(preview.amount);
   const specials=Array.isArray(preview.specials)?preview.specials:[];
   const extra=Math.round(specials.reduce((a,x)=>a+Number(x.amount||0),0)*100)/100;
   const net=amount-extra;
   const correction=Math.round((net-base)*100)/100;
   if(!Number.isFinite(base)||!Number.isFinite(amount)||!Number.isFinite(extra))return '<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="v632-error">ข้อมูลร่างไม่ถูกต้อง กรุณาแจ้ง Admin</p>';
   const items=specials.map(x=>`<div class="v641-special-line"><span>${esc(x.title||'เบิกพิเศษ')}<small>${esc(x.reason||'')}</small></span><b>+${fmtMoney(x.amount)} บาท</b></div>`).join('');
   return `<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3>
     <p class="v642-draft-warning"><b>ร่างยอดเบิกที่ Admin บันทึกแล้ว — ยังไม่เปิดให้ยืนยัน</b><span>ตรวจดูตัวเลขได้ แต่ต้องรอ Admin กด “สร้างฉบับแก้ไขและเปิดให้ Staff ยืนยัน” ก่อน</span></p>
     <section class="v632-review v641-review v642-draft-preview">
       <div class="v632-values v641-values"><div><small>ยอดจากระบบ Export (ไม่รวมเบิกพิเศษ)</small><strong>${fmtMoney(base)} ฿</strong></div><div class="v641-final"><small>ยอดรวมร่างเบิก HR (รวมเบิกพิเศษ)</small><strong>${fmtMoney(amount)} ฿</strong></div></div>
       <div class="v641-breakdown"><div><span>ยอด Export ต้นฉบับ</span><b>${fmtMoney(base)} บาท</b></div>
       ${Math.abs(correction)>=.01?`<div><span>ปรับยอดเบิกหลัก</span><b>${correction>0?'+':''}${fmtMoney(correction)} บาท</b></div>`:''}
       <div><span>เบิกพิเศษ (นอก Export)</span><b class="v641-positive">+${fmtMoney(extra)} บาท</b></div>
       <div class="v641-total"><strong>ยอดรวมร่างที่ Admin บันทึก</strong><strong>${fmtMoney(amount)} บาท</strong></div></div>
       ${items?`<details class="v641-details" open><summary>รายการเบิกพิเศษ ${specials.length} รายการ</summary>${items}</details>`:''}
       <p class="v632-status">สถานะ: รอ Admin เปิดให้ยืนยัน (ไม่ถือว่ายืนยันยอดแล้ว)</p>
     </section>`;
 }
 if(revisionError||previewError){const cause=revisionError||previewError;return `<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="v632-error"><b>ยังตรวจสอบยอดรวมล่าสุดไม่ได้ — ไม่เปิดให้ยืนยันยอดเดิม</b><span class="v642-error-text">${esc(cause)}</span><span>กรุณาตรวจ SQL V637/V642 และการเชื่อมต่อ Supabase ก่อน</span></p>`;}
 if(failed)return `<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="v632-error"><b>ยังไม่สามารถเปิดให้ยืนยันยอดได้</b> — ระบบอ่านข้อมูลยอดเบิกที่ Admin บันทึกไม่สำเร็จ: ${esc(failed)}<br>กรุณาตรวจการเชื่อมต่อ Supabase และสิทธิ์การอ่านข้อมูล</p>`;
 return `<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="v632-hint">ยอดจาก Export ต้นฉบับ • รายการเบิกพิเศษในหน้าจัดการยอด HR จะแสดงให้เจ้าหน้าที่หลัง Admin สร้างฉบับแก้ไขเท่านั้น</p>`+
 (!records.length?'<div class="v632-wait">ยังไม่มียอดเบิกที่ Admin บันทึกและเปิดให้ยืนยัน สำหรับเดือนนี้</div>':records.map(row=>`<section class="v632-review" data-v632-batch="${esc(row.batch_id)}" data-v632-pdf="${esc(row.pdf_money??'')}"><div class="v632-values"><div><small>ยอดจากระบบ Export (ไม่รวมเบิกพิเศษ)</small><strong>${fmtMoney(row.snapshot_money)} ฿</strong></div><div><small>ยอดที่ Admin บันทึกตามเอกสารเดิม</small><strong>${row.pdf_money==null?'ยังไม่บันทึก':fmtMoney(row.pdf_money)+' ฿'}</strong></div></div><p class="v632-status">${row.confirmation_status==='confirmed'?'ยืนยันยอดแล้ว':row.confirmation_status==='disputed'?'แจ้งยอดไม่ตรง — รอ Admin ตรวจสอบ':row.confirmation_status==='reconfirm'?'ยอดถูกแก้ไขแล้ว — โปรดยืนยันใหม่':'รอตรวจสอบและยืนยันยอด'}</p><label>ยอดที่ฉันตรวจนับ (บาท)<input data-v632-amount type="number" min="0" step="0.01" inputmode="decimal" value="${esc(row.confirmation_status==='reconfirm'?(row.pdf_money??''):(row.staff_counted_money??row.pdf_money??''))}"></label><label>หมายเหตุหากยอดไม่ตรง<input data-v632-note placeholder="บอกวันที่ OT หรือเหตุผลที่ไม่ตรง" value="${esc(row.confirmation_note||'')}"></label><div class="v632-actions"><button type="button" data-v632-submit="confirmed" ${row.pdf_money==null?'disabled':''}>✓ ยืนยันยอดถูกต้อง</button><button type="button" data-v632-submit="disputed" ${row.pdf_money==null?'disabled':''}>ยอดไม่ตรง / ให้ Admin ตรวจสอบ</button></div></section>`).join(''));
}
async function renderSummary(panel,month,force){let card=panel.querySelector('.v632-summary');if(!card){card=document.createElement('section');card.className='card v632-summary';panel.prepend(card)}if(card.parentElement!==panel)panel.prepend(card);visiblePanel(panel,'staff-summary');if(!card.dataset.v636Ready){card.innerHTML='<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="v632-hint">กำลังตรวจยอดที่ Admin บันทึกสำหรับเดือนนี้…</p>';card.dataset.v636Ready='1';}
 const db=DB();if(!db?.rpc){card.innerHTML=reviewMarkup([],'ระบบยังไม่พร้อมเชื่อมต่อ Supabase');return}
 const token=++seq;
 // Published revision wins; draft preview is read-only and cannot be confirmed.
 const [base,latest,previewResult]=await Promise.allSettled([
   db.rpc('get_my_hr_pdf_reviews_v630',{p_month:month}),
   db.rpc('my_hr_revision_v637',{p_month:month}),
   db.rpc('my_hr_draft_preview_v642',{p_month:month})
 ]);
 if(token!==seq||!card.isConnected||screen()!=='staff-summary'||nowMonth()!==month)return;
 const baseResult=base.status==='fulfilled'?base.value:null;
 const latestResult=latest.status==='fulfilled'?latest.value:null;
 const baseError=base.status==='rejected'?base.reason?.message:baseResult?.error?.message;
 const revisionError=latest.status==='rejected'?latest.reason?.message:latestResult?.error?.message;
 const revision=revisionError?null:latestResult?.data;
 const previewReply=previewResult.status==='fulfilled'?previewResult.value:null;
 const previewError=previewResult.status==='rejected'?previewResult.reason?.message:previewReply?.error?.message;
 const preview=previewError?null:previewReply?.data;
 // Never silently confirm a legacy value if the revision/preview state cannot be checked.
 card.innerHTML=reviewMarkup(Array.isArray(baseResult?.data)?baseResult.data:[],baseError,revision,revisionError,preview,previewError);
 visiblePanel(panel,'staff-summary');
}
function normdate(x){return String(x||'').slice(0,10)}
function getAssignments(m){try{return getAssignmentsForMonth(m)||[]}catch(_){return (S().rosterAssignments||[]).filter(x=>normdate(x.duty_date).startsWith(m))}}
function staffMetrics(m){const person=sid();if(!person)return null;const assignments=getAssignments(m).filter(x=>String(x.staff_id||'')===person);
 // One assigned duty record equals one duty occurrence, not hours/8; exclude CH4 blood processing here.
 const approved=(S().otRequests||[]).filter(x=>String(x.staff_id||'')===person&&normdate(x.work_date).startsWith(m)&&['approved','อนุมัติ','อนุมัติแล้ว'].includes(String(x.status||'')));
 const description=x=>[x.reason,x.note,x.duty_code,x.ot_type,x.details].join(' ');
 const shifts=new Set(approved.filter(x=>/อยู่เวร|ชบด|ช3a|ช3b|เวรช|เวร ช|เวรหลัก/i.test(description(x))&&!/ปั่นเลือด|ประชุม|กิจกรรม/i.test(description(x))).map(x=>`${normdate(x.work_date)}|${x.start_time||''}|${x.end_time||''}|${x.duty_code||''}`));
 const spin=new Set(approved.filter(x=>/ปั่นเลือด|ช4|ch4/i.test(description(x))).map(x=>normdate(x.work_date)).filter(Boolean));
 let baseline=null,current=null;try{const tool=window.cnmiV340BaselineColumns?._test;const list=(S().staff||[]);const groups=tool?.correctedData?.(list,getAssignments(m),m)?.groups||[];const row=groups.flatMap(g=>g.rows||[]).find(x=>String(x.person?.id||'')===person);if(row){baseline=Number(row.fixed?.baselineUnits);current=Number(row.current?.units)}}catch(_){/* do not invent when historic balance is not ready */}
 return {duty:shifts.size,spin:spin.size,baseline:Number.isFinite(baseline)?baseline:null,current:Number.isFinite(current)?current:null};}
function statsHtml(m){const x=staffMetrics(m);if(!x)return '<p>ยังไม่พบรหัสเจ้าหน้าที่ที่เข้าสู่ระบบ</p>';const cell=(label,val,unit)=>`<div><small>${label}</small><strong>${val==null?'กำลังโหลด':esc(val)} <em>${unit}</em></strong></div>`;return `<h3>ภาพรวมการอยู่เวรของฉัน</h3><div class="v632-values v632-metrics">${cell('เวรตั้งต้น (หน่วยเวร)',x.baseline,'หน่วย')}${cell('หน่วยเวรปัจจุบัน',x.current,'หน่วย')}${cell('อยู่เวรจริง',x.duty,'ครั้ง')}${cell('ปั่นเลือดจริง',x.spin,'วัน')}</div><p class="v632-hint">อยู่เวรนับรายการ OT ที่อนุมัติแยกตามวันและช่วงเวลา (16 หรือ 24 ชั่วโมง = 1 ครั้งเท่ากัน) • ปั่นเลือดนับวันจากรายการ OT ที่อนุมัติ ไม่ซ้ำวัน • หน่วยเวรใช้ตัวคำนวณสมดุลเดิม</p>`}
function renderDetails(panel,m){visiblePanel(panel,'staff-details');let section=panel.querySelector('.v632-stats');if(!section){section=document.createElement('section');section.className='card v632-stats';panel.prepend(section)}section.innerHTML=statsHtml(m);window.cnmiV643Detail?.refresh?.(panel,m)}
async function tick(force=false){const kind=screen(),panel=host();if(!kind||!panel)return;const m=nowMonth(),signature=kind+'|'+m;if(busy||(!force&&signature===key&&Date.now()-stamp<14000))return;key=signature;stamp=Date.now();busy=true;try{if(kind==='staff-summary')await renderSummary(panel,m,force);else renderDetails(panel,m)}catch(e){console.warn('[v632]',e)}finally{busy=false}}
document.addEventListener('click',async e=>{const btn=e.target.closest('[data-v641-submit]');if(!btn)return;
 const box=btn.closest('[data-v641-revision]');if(!box)return;
 const raw=box.querySelector('[data-v632-amount]').value.trim(),amount=Number(raw),status=btn.dataset.v641Submit,expected=Number(box.dataset.v641Final),comment=box.querySelector('[data-v632-note]').value.trim();
 if(!raw||!Number.isFinite(amount)||amount<0)return notify('กรุณาระบุยอดที่ตรวจนับ');
 if(status==='confirmed'&&Math.abs(amount-expected)>.009)return notify('ยอดที่ตรวจไม่ตรงกับยอดรวมล่าสุด กรุณาเลือกยอดไม่ตรง');
 if(status==='disputed'&&comment.length<5)return notify('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร');
 btn.disabled=true;
 try{const db=DB();if(!db?.rpc)throw new Error('ยังเชื่อมต่อ Supabase ไม่สำเร็จ');const {error}=await db.rpc('confirm_my_hr_revision_v637',{p_revision:box.dataset.v641Revision,p_amount:amount,p_status:status,p_note:comment});if(error)throw error;
 notify(status==='confirmed'?'ยืนยันยอดรวมฉบับล่าสุดสำเร็จ':'ส่งเรื่องยอดไม่ตรงให้ Admin ตรวจสอบแล้ว');key='';await tick(true);
 }catch(err){notify('บันทึกไม่สำเร็จ: '+(err.message||err))}finally{btn.disabled=false}
},true);
document.addEventListener('click',async e=>{const btn=e.target.closest('[data-v632-submit]');if(!btn)return;const box=btn.closest('[data-v632-batch]');if(!box)return;const raw=box.querySelector('[data-v632-amount]').value.trim(),amount=Number(raw),status=btn.dataset.v632Submit,pdf=Number(box.dataset.v632Pdf);if(!raw||!Number.isFinite(amount)||amount<0)return notify('กรุณาระบุจำนวนเงินที่ตรวจนับก่อนกดยืนยัน');if(status==='confirmed'&&Math.abs(amount-pdf)>.009)return notify('จำนวนเงินที่ตรวจไม่ตรง ยอดที่ Admin บันทึก กรุณาใช้ปุ่มยอดไม่ตรง');btn.disabled=true;try{const db=DB();if(!db?.rpc)throw new Error('ยังเชื่อมต่อ Supabase ไม่สำเร็จ');const {error}=await db.rpc('confirm_my_hr_pdf_v630',{p_batch:box.dataset.v632Batch,p_counted_money:amount,p_status:status,p_note:box.querySelector('[data-v632-note]').value});if(error)throw error;notify('บันทึกผลตรวจสอบแล้ว');key='';await tick(true)}catch(err){notify('ไม่สำเร็จ: '+err.message)}finally{btn.disabled=false}});
/* v635: stop polling *//* v636: no forced refresh after every button click (would overwrite user inputs). */window.addEventListener('hashchange',()=>{key='';setTimeout(()=>tick(true),100)});
/* v636: scheduler handles startup and route changes; no polling interval. */document.addEventListener('change',e=>{if(e.target.matches?.('[type=month],#otMoneyMonthV241,#otSourceMonthV241')){key='';setTimeout(()=>tick(true),100)}});
window.cnmiV632Summary={refresh:()=>{key='';return tick(true)},mount:()=>tick(false)};
})();