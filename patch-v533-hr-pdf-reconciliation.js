/* CNMI Staff Planner V533 — Adjustment-aware HR claim preview + HR PDF reconciliation
 * - Pending shortfall/overclaim adjustments are shown as part of the person's HR amount waiting to be exported.
 * - Does not convert an adjustment into real work hours and does not mix it into normal OT source rows.
 * - After Excel export, Admin uploads the actual HR PDF, enters/verifies per-person totals, and confirms before the batch is considered sent.
 * - Locked export snapshot remains the audit source of truth. Staff can read only their own locked snapshot through an RPC.
 */
(function(){
  'use strict';
  if(window.__CNMI_V533_HR_PDF_RECONCILIATION__) return;
  window.__CNMI_V533_HR_PDF_RECONCILIATION__=true;
  const VERSION='V533_HR_PDF_RECONCILIATION';
  const previewCache=new Map();
  const reviewCache=new Map();
  let renderTimer=0, rendering=false;

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{return window.sb||(typeof sb!=='undefined'?sb:null);}catch(_){return null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function sid(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function pad(n){return String(n).padStart(2,'0');}
  function monthKey(v){const s=String(v||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(s))return s;const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
  function selectedMonth(){return monthKey(S()?.otMenuMonthV369||S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.monthKey);}
  function rangeForMonth(month){const key=monthKey(month),[y,m]=key.split('-').map(Number),last=new Date(y,m,0).getDate();return {month:key,start:`${key}-01`,end:`${key}-${pad(last)}`};}
  function person(id){return (S().staff||[]).find(p=>String(p.id)===String(id))||{};}
  function nick(id){const p=person(id);return String(p.nickname||p.full_name||p.name||p.email||id||'-');}
  function full(id){const p=person(id);return String(p.full_name||p.name||p.nickname||p.email||id||'-');}
  function isClerk(id){const p=person(id);return /เคิก|clerk/i.test(String(p.staff_type||p.type||p.position||''));}
  function baseRate(id){return isClerk(id)?90:130;}
  function round2(v){const n=Number(v||0);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:0;}
  function round4(v){const n=Number(v||0);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*10000)/10000:0;}
  function fmt(v,d=2){const n=round4(v);return Number.isInteger(n)?String(n):n.toFixed(d).replace(/0+$/,'').replace(/\.$/,'');}
  function money(v){const n=round2(v);return n.toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2});}
  function signedMoney(v){const n=round2(v);return `${n>0?'+':n<0?'-':''}${money(Math.abs(n))} บ.`;}
  function signedHours(v){const n=round4(v);return `${n>0?'+':n<0?'-':''}${fmt(Math.abs(n))}`;}
  function thaiMonth(key){const ms=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];const [y,m]=monthKey(key).split('-').map(Number);return `${ms[m-1]} ${y+543}`;}
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console.info(msg);}}
  function busy(on,text){try{setBusy(on,text);}catch(_){} }
  function approved(row){const s=String(row?.status||'').trim().toLowerCase();return ['อนุมัติ','approved','approve'].includes(s);}
  function pending(row){const s=String(row?.claim_status||'pending').trim().toLowerCase();return !['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s);}
  function normalize(row){
    try{const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);if(n&&Number.isFinite(Number(n.hrHours)))return Number(n.hrHours||0);}catch(_){}
    try{return Number(calcOtHours(row)||0);}catch(_){return Number(row?.manual_hours||row?.requested_hours||row?.hours||0);}
  }
  function errorMissing(err,table){const s=String(err?.message||err||'');return new RegExp(`${table}|42P01|does not exist|schema cache`,'i').test(s);}

  async function claimPreview(month,force=false){
    const key=monthKey(month),cached=previewCache.get(key);if(!force&&cached&&cached.expires>Date.now())return cached.rows;
    const db=DB();if(!db?.from)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const r=rangeForMonth(key);
    const [otRes,adjRes,carryMap]=await Promise.all([
      db.from('ot_requests').select('*').gte('work_date',r.start).lte('work_date',r.end).order('work_date',{ascending:true}),
      db.from('ot_adjustments').select('*').eq('apply_month',key).eq('status','pending').order('created_at',{ascending:true}),
      window.cnmiV318?.queryCarryInSummary?.(key) || Promise.resolve(new Map())
    ]);
    if(otRes.error)throw otRes.error;if(adjRes.error)throw adjRes.error;
    const map=new Map();
    const ensure=id=>{const k=String(id||'');if(!k)return null;if(!map.has(k))map.set(k,{staff_id:k,current:0,carry_in:0,adjust_units:0,adjust_amount:0,adjustments:[]});return map.get(k);};
    (otRes.data||[]).filter(x=>approved(x)&&pending(x)).forEach(row=>{const t=ensure(row.staff_id);if(t)t.current=round2(t.current+normalize(row));});
    (carryMap instanceof Map?carryMap:new Map()).forEach((info,id)=>{const t=ensure(id);if(t)t.carry_in=round2(info?.amount||0);});
    (adjRes.data||[]).forEach(a=>{const t=ensure(a.staff_id);if(!t)return;t.adjust_units=round4(t.adjust_units+Number(a.hr_unit_delta||0));t.adjust_amount=round2(t.adjust_amount+Number(a.amount_delta||0));t.adjustments.push(a);});
    const rows=[...map.values()].map(t=>{
      const regularAvailable=round4(t.current+t.carry_in),regularClaimed=Math.floor((regularAvailable+1e-7)/8)*8,regularCarry=round4(Math.max(0,regularAvailable-regularClaimed));
      const adjustHours=round4(t.adjust_units*8),adjustedAvailable=round4(regularAvailable+adjustHours);
      const finalClaimed=Math.max(0,Math.floor((adjustedAvailable+1e-7)/8)*8),finalCarry=round4(Math.max(0,adjustedAvailable-finalClaimed)),rate=baseRate(t.staff_id);
      return {...t,regular_available:regularAvailable,regular_claimed:regularClaimed,regular_carry:regularCarry,adjust_hours:adjustHours,adjusted_available:adjustedAvailable,final_claimed:finalClaimed,final_carry:finalCarry,rate,regular_money:round2(regularClaimed*rate),final_money:round2(finalClaimed*rate),export_delta_hours:round4(finalClaimed-regularClaimed),export_delta_money:round2((finalClaimed-regularClaimed)*rate)};
    }).sort((a,b)=>nick(a.staff_id).localeCompare(nick(b.staff_id),'th'));
    previewCache.set(key,{rows,expires:Date.now()+20000});return rows;
  }

  function previewTable(rows,showAll=false){
    const use=showAll?rows:rows.filter(x=>String(x.staff_id)===sid());
    if(!use.length)return '<div class="empty">ยังไม่มี OT หรือรายการปรับยอดที่รอ Export ในเดือนนี้</div>';
    return `<div class="table-wrap v533-preview-wrap"><table class="v533-preview-table"><thead><tr>${showAll?'<th>คน</th>':''}<th>OT ปกติพร้อมเบิก</th><th>ปรับย้อนหลัง</th><th>รวมรอเบิก HR รอบนี้</th><th>เงินที่จะส่ง HR</th><th>ทบหลังปรับ</th></tr></thead><tbody>${use.map(r=>`<tr>${showAll?`<td><b>${esc(nick(r.staff_id))}</b></td>`:''}<td>${fmt(r.regular_claimed)} ชม.<small>${money(r.regular_money)} บ.</small></td><td class="${r.adjust_amount<0?'v533-neg':'v533-pos'}">${signedHours(r.adjust_hours)} ชม.<small>${signedMoney(r.adjust_amount)} • ${r.adjust_units>0?'+':''}${fmt(r.adjust_units)} เวร</small></td><td><b>${fmt(r.final_claimed)} ชม.</b><small>${r.export_delta_hours!==0?`ผลต่อ Export ${signedHours(r.export_delta_hours)} ชม.`:'ไม่เปลี่ยนจำนวนเวร HR รอบนี้'}</small></td><td><b>${money(r.final_money)} บ.</b><small>${r.export_delta_money!==0?`ผลต่อเงิน ${signedMoney(r.export_delta_money)}`:'ยอดเท่า OT ปกติ'}</small></td><td>${fmt(r.final_carry)} ชม.</td></tr>`).join('')}</tbody></table></div>`;
  }


  function decorateAdjustmentBadges(rows){
    const map=new Map((rows||[]).map(r=>[String(r.staff_id),r]));
    document.querySelectorAll('.v241-ot-summary-table table').forEach(table=>{
      const headers=[...table.querySelectorAll('thead th')];
      const statusIndex=headers.findIndex(th=>/Export Status/i.test(String(th.textContent||'')));
      if(statusIndex<0)return;
      [...table.querySelectorAll('tbody tr')].forEach((tr,idx)=>{
        const btn=tr.querySelector('[data-v347-show-staff],[data-v234-show-staff]');
        const id=String(btn?.getAttribute('data-v347-show-staff')||btn?.getAttribute('data-v234-show-staff')||(!admin()&&idx===0?sid():'')||'');
        const r=map.get(id),cell=tr.children[statusIndex];if(!r||!cell)return;
        cell.querySelectorAll('.v533-adjust-pending-badge').forEach(x=>x.remove());
        if(Math.abs(Number(r.adjust_units||0))>0.00005){
          const b=document.createElement('span');b.className=`badge blue v533-adjust-pending-badge ${r.adjust_units<0?'is-negative':''}`;b.textContent=`ปรับรอ Export ${r.adjust_units>0?'+':''}${fmt(r.adjust_units)} เวร`;b.title=`รายการปรับย้อนหลัง ${signedMoney(r.adjust_amount)} จะถูกรวมตอน Export เดือนนี้`;
          cell.appendChild(document.createElement('br'));cell.appendChild(b);
        }
      });
    });
  }

  async function ownLockedSnapshot(month){
    if(admin())return null;const db=DB();if(!db?.rpc)return null;
    const {data,error}=await db.rpc('get_my_ot_export_snapshot_v533',{p_month:monthKey(month)});
    if(error){if(errorMissing(error,'get_my_ot_export_snapshot_v533'))return null;throw error;}
    return Array.isArray(data)&&data.length?data[0]:null;
  }

  function makePreviewCard(rows,{showAll=false,locked=null}={}){
    const el=document.createElement('div');el.id='v533ClaimPreviewCard';el.className='card v533-claim-preview';
    const mine=!showAll?rows.find(r=>String(r.staff_id)===sid()):null;
    const note=showAll?'ยอดด้านล่างจำลองด้วยสูตรเดียวกับ Export: OT Pending + ยอดทบ + รายการตกเบิก/ลดเบิกเกิน แล้วจึงตัดเป็นชุด HR 8 ชั่วโมง':'รายการ “ตกเบิก/ลดเบิกเกิน” จะถูกนำมารวมในยอดรอเบิกของเดือนที่เลือก โดยไม่เพิ่มชั่วโมงทำงานจริงของเดือนนี้';
    let lockedHtml='';
    if(locked){
      const live=mine?round2(mine.final_money):null,diff=live==null?0:round2(live-Number(locked.money||0));
      lockedHtml=`<div class="v533-locked-own"><div><span>🔒 ยอดที่ Export จริงของรอบนี้</span><b>${fmt(locked.claimed_hours)} ชม. • ${money(locked.money)} บ.</b></div>${Math.abs(diff)>0.01?`<div class="v533-history-warning">หน้าคำนวณปัจจุบันต่างจาก Snapshot ${signedMoney(diff)} • สำหรับรอบที่ส่งแล้วให้ยึด Snapshot เป็นหลักฐาน</div>`:''}<small>Batch ${esc(locked.batch_id||'-')} • ${esc(locked.pdf_status||'รอตรวจ PDF')}</small></div>`;
    }
    el.innerHTML=`<div class="section-title"><div><h3>${showAll?'ยอดรอ Export หลังรวมรายการปรับ':'ยอด OT ที่รอเบิกของฉัน (รวมรายการปรับ)'}</h3><p class="hint">${esc(note)}</p></div></div>${previewTable(rows,showAll)}${lockedHtml}`;return el;
  }

  async function loadSnapshots(month,force=false){
    if(!admin())return [];
    const key=monthKey(month),cached=reviewCache.get(key);if(!force&&cached&&cached.expires>Date.now())return cached.rows;
    const db=DB();
    const snaps=await db.from('ot_export_snapshots').select('*').eq('source_month',key).order('exported_at',{ascending:false}).order('created_at',{ascending:false});
    if(snaps.error){if(errorMissing(snaps.error,'ot_export_snapshots'))throw new Error('ยังไม่ได้ติดตั้งระบบ Snapshot กรุณารัน SQL V533 CUMULATIVE ก่อน');throw snaps.error;}
    const batchIds=(snaps.data||[]).map(x=>x.batch_id).filter(Boolean);let reviews=[];
    if(batchIds.length){const rr=await db.from('ot_export_pdf_reviews').select('*').in('batch_id',batchIds);if(rr.error){if(!errorMissing(rr.error,'ot_export_pdf_reviews'))throw rr.error;}else reviews=rr.data||[];}
    const rmap=new Map(reviews.map(x=>[String(x.batch_id),x]));
    const rows=(snaps.data||[]).map(s=>({...s,pdf_review:rmap.get(String(s.batch_id))||null}));
    reviewCache.set(key,{rows,expires:Date.now()+15000});return rows;
  }

  function statusBadge(review){const st=String(review?.status||'awaiting_pdf');if(st==='sent')return '<span class="badge green">✓ ยืนยันส่ง HR แล้ว</span>';if(st==='verified')return '<span class="badge green">PDF ตรง</span>';if(st==='mismatch')return '<span class="badge red">ยอดไม่ตรง</span>';if(st==='uploaded')return '<span class="badge blue">อัป PDF แล้ว</span>';return '<span class="badge orange">รอตรวจ PDF</span>';}
  function reviewStaffMap(review){const arr=Array.isArray(review?.staff_amounts)?review.staff_amounts:[];return new Map(arr.map(x=>[String(x.staff_id||x.employee_code||''),x]));}
  function extras(review){return Array.isArray(review?.extras)?review.extras:[];}
  function batchReviewHtml(snap,index){
    const review=snap.pdf_review||{},staff=Array.isArray(snap.snapshot?.staff)?snap.snapshot.staff:[],map=reviewStaffMap(review),extra=extras(review),expected=Number(snap.total_money||snap.snapshot?.preflight?.total_money||0),pdfTotal=review.pdf_total==null?'':Number(review.pdf_total),open=index===0?' open':'';
    const rows=staff.map((r,i)=>{const key=String(r.staff_id||r.employee_code||i),saved=map.get(key)||{},v=saved.pdf_money==null?'':saved.pdf_money;return `<tr><td><b>${esc(r.name||'-')}</b><small>${esc(r.employee_code||'')}</small></td><td>${money(r.money||0)}</td><td><input type="number" step="0.01" data-v533-pdf-amount data-batch="${esc(snap.batch_id)}" data-staff-key="${esc(key)}" data-staff-id="${esc(r.staff_id||'')}" data-code="${esc(r.employee_code||'')}" data-name="${esc(r.name||'')}" value="${esc(v)}" placeholder="ยอดใน PDF"></td><td data-v533-diff-cell>${v===''?'-':signedMoney(round2(Number(v)-Number(r.money||0)))}</td></tr>`;}).join('');
    const extraRows=(extra.length?extra:[{name:'',amount:''}]).map(x=>`<div class="v533-extra-row"><input data-v533-extra-name placeholder="ชื่อคนนอกหน่วย / รายการพิเศษ" value="${esc(x.name||'')}"><input type="number" step="0.01" data-v533-extra-amount placeholder="จำนวนเงิน" value="${esc(x.amount==null?'':x.amount)}"><button type="button" class="tiny-btn danger" data-v533-remove-extra>ลบ</button></div>`).join('');
    const fileText=review.pdf_name?`${esc(review.pdf_name)} • ${(Number(review.pdf_size||0)/1024/1024).toFixed(2)} MB`:'ยังไม่ได้อัปโหลด PDF';
    return `<details class="card v533-pdf-batch" data-v533-batch="${esc(snap.batch_id)}"${open}><summary><span><b>Batch ${esc(snap.batch_id)}</b><small>${esc(snap.filename||'')} • Snapshot ${money(expected)} บ.</small></span>${statusBadge(review)}</summary>
      <div class="v533-pdf-body">
        <div class="v533-file-row"><label class="v533-file-label">📄 PDF HR ที่จะส่งจริง<input type="file" accept="application/pdf,.pdf" data-v533-pdf-file></label><button type="button" class="ghost-btn" data-v533-upload-pdf>อัปโหลด PDF</button>${review.pdf_path?'<button type="button" class="ghost-btn" data-v533-open-pdf>เปิด PDF ที่เก็บไว้</button>':''}<span class="muted">${fileText}</span></div>
        <div class="notice soft-notice compact">ระบบยังไม่อ่าน PDF อัตโนมัติ เพื่อป้องกันอ่านตารางผิด • ให้เทียบ PDF จริงแล้วกรอก/ยืนยันยอดรายคนก่อนส่ง HR</div>
        <div class="v533-review-actions"><button type="button" class="ghost-btn" data-v533-fill-snapshot>เติมยอด Snapshot เป็นค่าเริ่มต้น</button><span>จากนั้นตรวจ PDF และแก้เฉพาะช่องที่ไม่ตรง</span></div>
        <div class="table-wrap"><table class="v533-pdf-table"><thead><tr><th>คน</th><th>Snapshot</th><th>ยอดใน PDF</th><th>ต่าง</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="v533-extra-box"><div class="section-title"><div><h4>รายการนอกหน่วย / พิเศษใน PDF</h4><p class="hint">เช่น คนที่มัสเบิกให้ตามจริงแต่ไม่ได้อยู่ใน Staff Planner • ไม่ถือเป็นความผิดปกติของเจ้าหน้าที่ในหน่วย</p></div><button type="button" class="ghost-btn" data-v533-add-extra>+ เพิ่มรายการ</button></div><div data-v533-extra-list>${extraRows}</div></div>
        <div class="form-grid v533-review-meta"><label>ยอดรวมทั้ง PDF <input type="number" step="0.01" data-v533-pdf-total value="${esc(pdfTotal)}" placeholder="ใส่ยอดรวมหน้าสุดท้าย (ถ้ามี)"></label><label>หมายเหตุ <input data-v533-review-note value="${esc(review.notes||'')}" placeholder="เช่น ตรวจเทียบทุกหน้าแล้ว"></label></div>
        <div class="v533-reconcile-summary" data-v533-reconcile-summary></div>
        <div class="actions"><button type="button" class="primary-btn" data-v533-save-review>บันทึกผลตรวจ PDF</button><button type="button" class="primary-btn success" data-v533-confirm-review ${review.pdf_path?'':'disabled'}>✓ ยืนยัน PDF ตรงและส่ง HR แล้ว</button></div>
      </div></details>`;
  }

  async function renderPdfReviewCard(container,month){
    if(!admin()||!container)return;let card=document.getElementById('v533PdfReviewCard');
    if(!card){card=document.createElement('div');card.id='v533PdfReviewCard';card.className='v533-pdf-review-root';container.appendChild(card);}
    card.innerHTML='<div class="card"><div class="empty">กำลังโหลด Batch สำหรับตรวจ PDF…</div></div>';
    try{const rows=await loadSnapshots(month,false);if(!document.body.contains(card))return;card.innerHTML=`<div class="card v533-pdf-head"><div class="section-title"><div><h3>ตรวจ PDF HR ก่อนส่งจริง</h3><p class="hint">Excel Export → อัปโหลด PDF ที่จะส่ง → เทียบยอดรายคน → ยืนยันส่ง HR • Batch จะเก็บหลักฐานคู่กับ Snapshot</p></div></div></div>${rows.length?rows.map(batchReviewHtml).join(''):'<div class="card"><div class="empty">เดือนนี้ยังไม่มี Batch ที่ Export ด้วยระบบ Snapshot</div></div>'}`;rows.forEach(x=>updateReconcileUI(String(x.batch_id)));}
    catch(err){card.innerHTML=`<div class="card"><div class="notice error-notice"><b>โหลดระบบตรวจ PDF ไม่สำเร็จ</b><br>${esc(err?.message||err)}</div></div>`;}
  }

  function batchElFrom(target){return target?.closest?.('[data-v533-batch]')||null;}
  function expectedForInput(inp){const row=inp.closest('tr');const text=row?.children?.[1]?.textContent||'0';return Number(String(text).replace(/[^0-9.-]/g,''))||0;}
  function collectReview(batch){
    const box=document.querySelector(`[data-v533-batch="${CSS.escape(batch)}"]`);if(!box)throw new Error('ไม่พบ Batch บนหน้าจอ');
    const staff=[...box.querySelectorAll('[data-v533-pdf-amount]')].map(inp=>({staff_id:inp.dataset.staffId||'',employee_code:inp.dataset.code||'',name:inp.dataset.name||'',expected_money:expectedForInput(inp),pdf_money:inp.value===''?null:round2(inp.value)}));
    const ex=[...box.querySelectorAll('[data-v533-extra-row]')].map(row=>({name:String(row.querySelector('[data-v533-extra-name]')?.value||'').trim(),amount:round2(row.querySelector('[data-v533-extra-amount]')?.value||0)})).filter(x=>x.name||Math.abs(x.amount)>0.001);
    const pdfTotalRaw=box.querySelector('[data-v533-pdf-total]')?.value||'',pdf_total=pdfTotalRaw===''?null:round2(pdfTotalRaw),notes=String(box.querySelector('[data-v533-review-note]')?.value||'').trim();
    const expected_total=round2(staff.reduce((s,x)=>s+Number(x.expected_money||0),0)),staff_pdf_total=round2(staff.reduce((s,x)=>s+Number(x.pdf_money||0),0)),extras_total=round2(ex.reduce((s,x)=>s+Number(x.amount||0),0)),computed_total=round2(staff_pdf_total+extras_total),diff_total=pdf_total==null?null:round2(pdf_total-computed_total);
    const incomplete=staff.some(x=>x.pdf_money==null),mismatches=staff.filter(x=>x.pdf_money!=null&&Math.abs(round2(x.pdf_money-x.expected_money))>0.01);
    return {staff,extras:ex,pdf_total,notes,expected_total,staff_pdf_total,extras_total,computed_total,diff_total,incomplete,mismatches};
  }
  function updateReconcileUI(batch){
    const box=document.querySelector(`[data-v533-batch="${CSS.escape(batch)}"]`);if(!box)return;let d;try{d=collectReview(batch);}catch(_){return;}
    box.querySelectorAll('[data-v533-pdf-amount]').forEach(inp=>{const cell=inp.closest('tr')?.querySelector('[data-v533-diff-cell]');if(!cell)return;cell.textContent=inp.value===''?'-':signedMoney(round2(Number(inp.value)-expectedForInput(inp)));cell.className=Math.abs(round2(Number(inp.value)-expectedForInput(inp)))>0.01?'v533-neg':'v533-ok';});
    const s=box.querySelector('[data-v533-reconcile-summary]');if(s)s.innerHTML=`<span>Snapshot เจ้าหน้าที่ <b>${money(d.expected_total)}</b></span><span>PDF เจ้าหน้าที่ <b>${money(d.staff_pdf_total)}</b></span><span>พิเศษ/นอกหน่วย <b>${money(d.extras_total)}</b></span><span>รวมที่กรอก <b>${money(d.computed_total)}</b></span>${d.pdf_total!=null?`<span>ยอดรวม PDF <b>${money(d.pdf_total)}</b></span><span class="${Math.abs(d.diff_total||0)>0.01?'v533-neg':'v533-ok'}">ต่างจากยอดรวม <b>${signedMoney(d.diff_total||0)}</b></span>`:''}${d.incomplete?'<span class="v533-warn">ยังกรอกยอดรายคนไม่ครบ</span>':d.mismatches.length?`<span class="v533-neg">ไม่ตรง ${d.mismatches.length} คน</span>`:'<span class="v533-ok">✓ ยอดเจ้าหน้าที่ในหน่วยตรง Snapshot</span>'}`;
  }

  async function ensureReview(batchId,sourceMonth,expectedTotal){const db=DB();const payload={batch_id:batchId,source_month:monthKey(sourceMonth),expected_total:round2(expectedTotal||0),status:'awaiting_pdf',updated_at:new Date().toISOString()};const {error}=await db.from('ot_export_pdf_reviews').upsert(payload,{onConflict:'batch_id',ignoreDuplicates:true});if(error&&!errorMissing(error,'ot_export_pdf_reviews'))throw error;reviewCache.delete(monthKey(sourceMonth));}
  async function uploadPdf(box){
    const batch=box.dataset.v533Batch,file=box.querySelector('[data-v533-pdf-file]')?.files?.[0];if(!file)return toast('กรุณาเลือกไฟล์ PDF ก่อน','error');if(file.size>20*1024*1024)return toast('ไฟล์ PDF ต้องไม่เกิน 20 MB','error');if(file.type&&file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))return toast('กรุณาเลือกไฟล์ PDF','error');
    busy(true,'กำลังเก็บ PDF HR');try{const db=DB(),snap=(await loadSnapshots(selectedMonth(),true)).find(x=>String(x.batch_id)===String(batch));if(snap&&!snap.pdf_review)await ensureReview(batch,snap.source_month,snap.total_money);const safe=String(file.name||'hr.pdf').replace(/[^a-zA-Z0-9._-]/g,'_'),path=`ot-hr-pdf/${batch}/${Date.now()}_${safe}`;const up=await db.storage.from('staff-files').upload(path,file,{upsert:false,contentType:'application/pdf'});if(up.error)throw up.error;const {error}=await db.from('ot_export_pdf_reviews').update({pdf_path:path,pdf_name:file.name,pdf_size:file.size,pdf_mime_type:file.type||'application/pdf',pdf_uploaded_by:sid(),pdf_uploaded_at:new Date().toISOString(),status:'uploaded',updated_at:new Date().toISOString()}).eq('batch_id',batch);if(error)throw error;reviewCache.clear();toast('เก็บ PDF HR กับ Batch นี้แล้ว');await rerender(true);}catch(err){toast(err?.message||'อัปโหลด PDF ไม่สำเร็จ','error');}finally{busy(false);}
  }
  async function openPdf(box){const batch=box.dataset.v533Batch,rows=await loadSnapshots(selectedMonth(),true),review=rows.find(x=>String(x.batch_id)===String(batch))?.pdf_review;if(!review?.pdf_path)return toast('ยังไม่มี PDF ใน Batch นี้','error');busy(true,'กำลังเปิด PDF');try{const res=await DB().storage.from('staff-files').download(review.pdf_path);if(res.error)throw res.error;const url=URL.createObjectURL(res.data);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(err){toast(err?.message||'เปิด PDF ไม่สำเร็จ','error');}finally{busy(false);}}
  async function saveReview(box,confirmSent=false){
    const batch=box.dataset.v533Batch,d=collectReview(batch),rows=await loadSnapshots(selectedMonth(),true),snap=rows.find(x=>String(x.batch_id)===String(batch));if(!snap)return toast('ไม่พบ Snapshot ของ Batch นี้','error');if(!snap.pdf_review){await ensureReview(batch,snap.source_month,snap.total_money);reviewCache.clear();}const review=(await loadSnapshots(selectedMonth(),true)).find(x=>String(x.batch_id)===String(batch))?.pdf_review||{};
    if(confirmSent&&!review.pdf_path)return toast('ต้องอัปโหลด PDF HR ก่อนยืนยันส่ง','error');
    if(confirmSent&&d.incomplete)return toast('กรุณากรอกยอดใน PDF ของเจ้าหน้าที่ทุกคนก่อน','error');
    if(confirmSent&&d.mismatches.length)return toast(`ยังยืนยันไม่ได้: ยอด PDF ไม่ตรง Snapshot ${d.mismatches.length} คน`,'error');
    if(confirmSent&&d.pdf_total!=null&&Math.abs(Number(d.diff_total||0))>0.01)return toast('ยอดรวม PDF ไม่ตรงกับยอดรายคน + รายการพิเศษ','error');
    const status=confirmSent?'sent':(!d.incomplete&&d.mismatches.length===0&&(d.pdf_total==null||Math.abs(Number(d.diff_total||0))<=0.01)?'verified':'mismatch'),now=new Date().toISOString(),payload={staff_amounts:d.staff,extras:d.extras,pdf_total:d.pdf_total,staff_pdf_total:d.staff_pdf_total,extras_total:d.extras_total,diff_total:d.diff_total,notes:d.notes,status,reviewed_by:sid(),reviewed_at:now,updated_at:now};if(confirmSent){payload.confirmed_by=sid();payload.confirmed_at=now;}
    busy(true,confirmSent?'กำลังยืนยันส่ง HR':'กำลังบันทึกผลตรวจ PDF');try{const {error}=await DB().from('ot_export_pdf_reviews').update(payload).eq('batch_id',batch);if(error)throw error;reviewCache.clear();toast(confirmSent?'✓ ยืนยัน PDF ตรงและบันทึกว่าส่ง HR แล้ว':'บันทึกผลตรวจ PDF แล้ว');await rerender(true);}catch(err){toast(err?.message||'บันทึกไม่สำเร็จ','error');}finally{busy(false);}
  }

  function insertOrReplace(container,el,prepend=true){const old=document.getElementById(el.id);if(old){old.replaceWith(el);return;}prepend?container.prepend(el):container.append(el);}
  async function renderCurrent(force=false){
    if(rendering||S().page!=='ot')return;rendering=true;try{
      const menu=String(S().otMenuV369||''),month=selectedMonth(),content=document.querySelector('.v369-ot-content');if(!content)return;
      if(menu==='staff-summary'){
        const [rows,locked]=await Promise.all([claimPreview(month,force),ownLockedSnapshot(month)]);if(!document.body.contains(content))return;insertOrReplace(content,makePreviewCard(rows,{showAll:false,locked}),true);decorateAdjustmentBadges(rows);
      }
      if(admin()&&menu==='export'){
        const rows=await claimPreview(month,force);if(!document.body.contains(content))return;insertOrReplace(content,makePreviewCard(rows,{showAll:true}),true);decorateAdjustmentBadges(rows);await renderPdfReviewCard(content,month);
      }
    }catch(err){console.warn('[V533] render failed',err);}finally{rendering=false;}
  }
  function queue(force=false,delay=80){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderCurrent(force),delay);}
  async function rerender(force=false){previewCache.clear();reviewCache.clear();queue(force,10);}

  function decorateVersion(){const chip=document.querySelector('.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');if(chip&&chip.textContent!=='v533'){chip.textContent='v533';chip.title='HR PDF Reconciliation + Adjustment-aware Export Preview';chip.classList.add('v533-version-chip');}}

  // Extend V532 post-export: create an awaiting-PDF reconciliation record after the locked snapshot is created.
  function wrapV532(){const api=window.cnmiV532ExportGuard;if(!api||api.__v533Wrapped)return;const old=api.postExport;if(typeof old==='function'){api.postExport=async function(ctx){const out=await old.apply(this,arguments);try{const expected=(ctx?.totals||[]).reduce((s,t)=>s+Number(t.money||0),0);await ensureReview(ctx.batchId,ctx?.data?.source?.month||ctx?.source?.month||selectedMonth(),expected);}catch(err){console.warn('[V533] create PDF review placeholder failed',err);}setTimeout(()=>{try{S().otMenuV369='export';S().otSubtabV241='export';renderPage();}catch(_){queue(true,0);}},220);return out;};}api.__v533Wrapped=true;}

  document.addEventListener('input',e=>{if(e.target?.matches?.('[data-v533-pdf-amount],[data-v533-extra-name],[data-v533-extra-amount],[data-v533-pdf-total]')){const box=batchElFrom(e.target);if(box)updateReconcileUI(box.dataset.v533Batch);}},true);
  document.addEventListener('click',async e=>{
    const box=batchElFrom(e.target);
    if(e.target?.closest?.('[data-v533-fill-snapshot]')&&box){e.preventDefault();box.querySelectorAll('[data-v533-pdf-amount]').forEach(inp=>inp.value=String(expectedForInput(inp)));updateReconcileUI(box.dataset.v533Batch);return;}
    if(e.target?.closest?.('[data-v533-add-extra]')&&box){e.preventDefault();const list=box.querySelector('[data-v533-extra-list]');if(list){const row=document.createElement('div');row.className='v533-extra-row';row.innerHTML='<input data-v533-extra-name placeholder="ชื่อคนนอกหน่วย / รายการพิเศษ"><input type="number" step="0.01" data-v533-extra-amount placeholder="จำนวนเงิน"><button type="button" class="tiny-btn danger" data-v533-remove-extra>ลบ</button>';list.appendChild(row);}return;}
    if(e.target?.closest?.('[data-v533-remove-extra]')&&box){e.preventDefault();e.target.closest('.v533-extra-row')?.remove();updateReconcileUI(box.dataset.v533Batch);return;}
    if(e.target?.closest?.('[data-v533-upload-pdf]')&&box){e.preventDefault();await uploadPdf(box);return;}
    if(e.target?.closest?.('[data-v533-open-pdf]')&&box){e.preventDefault();await openPdf(box);return;}
    if(e.target?.closest?.('[data-v533-save-review]')&&box){e.preventDefault();await saveReview(box,false);return;}
    if(e.target?.closest?.('[data-v533-confirm-review]')&&box){e.preventDefault();await saveReview(box,true);return;}
    if(e.target?.closest?.('[data-v523-ot-item],[data-v369-ot-menu],[data-export-hr-v318]'))queue(false,150);
  },true);
  document.addEventListener('change',e=>{if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='otSourceMonthV241'){previewCache.clear();reviewCache.clear();queue(true,150);}},true);

  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage&&!previousRenderPage.__v533Wrapped){const wrapped=function(){const out=previousRenderPage.apply(this,arguments);setTimeout(()=>{decorateVersion();wrapV532();queue(false,20);},0);return out;};wrapped.__v533Wrapped=true;try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}}

  function start(){decorateVersion();wrapV532();queue(false,40);window.addEventListener('pageshow',()=>{decorateVersion();wrapV532();queue(false,80);});window.addEventListener('hashchange',()=>queue(false,80));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV533={version:VERSION,claimPreview,render:()=>rerender(true),loadSnapshots};
  console.info(`[${VERSION}] loaded`);
})();
