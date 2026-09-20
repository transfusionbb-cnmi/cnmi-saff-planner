/* CNMI Staff Planner V534 — Simple HR claim view + manual PDF check
 * Goal: make the HR export flow obvious and low-risk.
 * 1) Staff sees one primary number: "ยอดที่จะส่ง HR รอบนี้" (normal OT + adjustment).
 * 2) Admin keeps the V532 pre-export guard, but the flow is labeled as clear steps.
 * 3) PDF is checked manually by a person. The app does NOT parse/OCR the PDF.
 * 4) PDF upload is optional evidence. Admin clicks "ตรง" per person or types the actual PDF amount.
 */
(function(){
  'use strict';
  if(window.__CNMI_V534_MANUAL_HR_PDF_CHECK__) return;
  window.__CNMI_V534_MANUAL_HR_PDF_CHECK__=true;
  const VERSION='V534_MANUAL_HR_PDF_CHECK';
  let renderTimer=0, rendering=false;

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{return window.sb||(typeof sb!=='undefined'?sb:null);}catch(_){return null;}}
  function isAdmin(){try{return typeof window.isAdmin==='function'&&window.isAdmin();}catch(_){try{return typeof isAdmin==='function'&&isAdmin();}catch(__){return false;}}}
  function currentId(){try{return String((typeof currentStaffId==='function'&&currentStaffId())||S()?.profile?.staff_id||S()?.profile?.id||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');}}
  function pad(n){return String(n).padStart(2,'0');}
  function monthKey(v){const s=String(v||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(s))return s;const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
  function selectedMonth(){return monthKey(S()?.otMenuMonthV369||S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.monthKey);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function round2(v){const n=Number(v||0);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:0;}
  function round4(v){const n=Number(v||0);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*10000)/10000:0;}
  function fmt(v,d=2){const n=round4(v);return Number.isInteger(n)?String(n):n.toFixed(d).replace(/0+$/,'').replace(/\.$/,'');}
  function money(v){const n=round2(v);return n.toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2});}
  function signedMoney(v){const n=round2(v);return `${n>0?'+':n<0?'-':''}${money(Math.abs(n))} บ.`;}
  function signedHours(v){const n=round4(v);return `${n>0?'+':n<0?'-':''}${fmt(Math.abs(n))}`;}
  function person(id){return (S().staff||[]).find(p=>String(p.id)===String(id))||{};}
  function nick(id){const p=person(id);return String(p.nickname||p.full_name||p.name||p.email||id||'-');}
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console.info(msg);}}
  function busy(on,text){try{setBusy(on,text);}catch(_){} }

  function versionChip(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const selectors=['.v533-version-chip','.v532-version-chip','.v531-version-chip','.v530-version-chip','.v529-version-chip','.v528-version-chip','.v527-version-chip','.v526-version-chip','.v525-version-chip','.v524-version-chip','.v523-version-chip','.v522-version-chip','.v521-version-chip','.v520-version-chip'];
    const chip=document.querySelector(selectors.join(','));
    if(chip&&chip.textContent!=='v534'){
      chip.textContent='v534';
      chip.title='Simple HR Claim + Manual PDF Check';
      chip.classList.add('v534-version-chip');
    }
  }

  async function ownLockedSnapshot(month){
    if(isAdmin()) return null;
    const db=DB(); if(!db?.rpc) return null;
    try{
      const {data,error}=await db.rpc('get_my_ot_export_snapshot_v533',{p_month:monthKey(month)});
      if(error) return null;
      return Array.isArray(data)&&data.length?data[0]:null;
    }catch(_){return null;}
  }

  function myClaimHtml(r,locked){
    if(!r) return '<div class="empty">ยังไม่มี OT ที่รอส่ง HR ในเดือนนี้</div>';
    const adjustClass=r.adjust_amount<0?'v534-neg':'v534-pos';
    let lockedHtml='';
    if(locked){
      const diff=round2(Number(r.final_money||0)-Number(locked.money||0));
      lockedHtml=`<div class="v534-locked"><span>🔒 รอบนี้เคย Export แล้ว</span><b>${fmt(locked.claimed_hours)} ชม. • ${money(locked.money)} บ.</b>${Math.abs(diff)>0.01?`<small>ยอดคำนวณปัจจุบันต่างจาก Snapshot ${signedMoney(diff)} — ให้ยึด Snapshot ที่ Export จริง</small>`:''}</div>`;
    }
    return `
      <div class="v534-my-claim-grid">
        <div class="v534-mini"><span>OT ปกติ</span><b>${fmt(r.regular_claimed)} ชม.</b><small>${money(r.regular_money)} บ.</small></div>
        <div class="v534-mini ${adjustClass}"><span>ปรับย้อนหลัง</span><b>${signedHours(r.adjust_hours)} ชม.</b><small>${signedMoney(r.adjust_amount)}</small></div>
        <div class="v534-primary"><span>ยอดที่จะส่ง HR รอบนี้</span><b>${fmt(r.final_claimed)} ชม.</b><strong>${money(r.final_money)} บาท</strong></div>
        <div class="v534-mini"><span>ทบไปรอบหน้า</span><b>${fmt(r.final_carry)} ชม.</b><small>ไม่รวมรายการปรับย้อนหลัง</small></div>
      </div>
      ${lockedHtml}
      <details class="v534-calc-detail"><summary>ดูรายละเอียดการคำนวณ</summary><div>OT เดือนนี้ + ทบเดิม = ${fmt(r.regular_available)} ชม. • เบิกปกติ ${fmt(r.regular_claimed)} ชม. • รายการปรับ ${signedHours(r.adjust_hours)} ชม. • ยอดส่ง HR ${fmt(r.final_claimed)} ชม.</div></details>`;
  }

  function adminClaimHtml(rows){
    if(!rows?.length) return '<div class="empty">ยังไม่มีรายการที่รอ Export ในเดือนนี้</div>';
    return `<div class="table-wrap v534-admin-claim-wrap"><table class="v534-admin-claim"><thead><tr><th>คน</th><th>OT ปกติ</th><th>ปรับย้อนหลัง</th><th>ยอดส่ง HR</th><th>เงินที่จะส่ง HR</th><th>ทบหน้า</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(nick(r.staff_id))}</b></td><td>${fmt(r.regular_claimed)} ชม.</td><td class="${r.adjust_amount<0?'v534-neg':'v534-pos'}">${signedHours(r.adjust_hours)} ชม.<small>${signedMoney(r.adjust_amount)}</small></td><td><b>${fmt(r.final_claimed)} ชม.</b></td><td><b>${money(r.final_money)} บ.</b></td><td>${fmt(r.final_carry)} ชม.</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderClaimCard(force=false){
    if(!window.cnmiV533?.claimPreview) return;
    const menu=String(S().otMenuV369||'');
    if(!['staff-summary','staff-details','export'].includes(menu)) return;
    if(menu==='export'&&!isAdmin()) return;
    const content=document.querySelector('.v369-ot-content'); if(!content) return;
    try{
      const month=selectedMonth();
      const rows=await window.cnmiV533.claimPreview(month,force);
      if(!document.body.contains(content)) return;
      const old=document.getElementById('v533ClaimPreviewCard');
      let card=document.getElementById('v534SimpleClaimCard');
      if(!card){card=document.createElement('section');card.id='v534SimpleClaimCard';card.className='card v534-simple-claim';}
      if(menu==='export'){
        card.innerHTML=`<div class="section-title"><div><h3>1. ตรวจยอดที่จะส่ง HR</h3><p class="hint">ตัวเลขนี้รวม OT ปกติ + ตกเบิก/ลดเบิกเกินแล้ว • ใช้ยอดนี้เป็นหลักก่อนกด Export Excel</p></div></div>${adminClaimHtml(rows)}`;
      }else{
        const mine=rows.find(r=>String(r.staff_id)===currentId());
        const locked=await ownLockedSnapshot(month);
        card.innerHTML=`<div class="section-title"><div><h3>ยอดที่จะส่ง HR รอบนี้</h3><p class="hint">ดูยอดสุดท้ายตรงนี้ได้เลย • รายละเอียด OT ปกติอยู่ด้านล่าง</p></div></div>${myClaimHtml(mine,locked)}`;
      }
      if(old){old.replaceWith(card);}else if(!card.isConnected){content.prepend(card);}
      simplifyLegacy(menu,content);
    }catch(err){console.warn('[V534] claim card failed',err);}
  }

  function simplifyLegacy(menu,content){
    if(menu==='staff-summary'){
      content.classList.add('v534-simple-staff-summary');
      let details=document.getElementById('v534LegacyOtDetails');
      if(!details){
        details=document.createElement('details');details.id='v534LegacyOtDetails';details.className='card v534-legacy-details';
        details.innerHTML='<summary>ดูรายละเอียด OT ปกติ / Carry</summary><div class="v534-legacy-body"></div>';
        const body=details.querySelector('.v534-legacy-body');
        [...content.children].filter(x=>x.id!=='v534SimpleClaimCard'&&x.id!=='v534LegacyOtDetails').forEach(x=>body.appendChild(x));
        content.appendChild(details);
      }
    }
    if(menu==='staff-details'){
      content.classList.add('v534-staff-details');
    }
    if(menu==='export'){
      const btn=content.querySelector('[data-export-hr-v318],[data-export-hr-v241]');
      if(btn) btn.textContent='2. Export Excel HR เดือนนี้';
      const heading=[...content.querySelectorAll('h3,h4')].find(x=>/Export HR|กระจายยอดเดือนจริง/i.test(x.textContent||''));
      if(heading&&!/^2\./.test(heading.textContent||'')) heading.textContent=`2. ${String(heading.textContent||'Export Excel HR').replace(/^Export HR\s*[—-]?\s*/,'Export Excel HR — ')}`;
    }
  }

  function expectedFromRow(tr){
    const cell=tr?.querySelector('[data-v534-expected]')||tr?.children?.[1];
    const raw=cell?.dataset?.v534Expected||cell?.textContent||'0';
    return Number(String(raw).replace(/[^0-9.-]/g,''))||0;
  }

  function addManualRowControls(box){
    const table=box.querySelector('.v533-pdf-table'); if(!table) return;
    const head=table.querySelector('thead tr');
    if(head&&!head.querySelector('[data-v534-status-head]')){
      const th=document.createElement('th');th.dataset.v534StatusHead='1';th.textContent='ตรวจ';head.appendChild(th);
    }
    table.querySelectorAll('tbody tr').forEach(tr=>{
      const inp=tr.querySelector('[data-v533-pdf-amount]'); if(!inp) return;
      const expectedCell=tr.children?.[1];
      if(expectedCell){expectedCell.dataset.v534Expected=String(expectedFromRow(tr));expectedCell.setAttribute('data-v534-expected','1');}
      if(!tr.querySelector('[data-v534-row-status]')){
        const td=document.createElement('td');td.dataset.v534RowStatus='1';td.innerHTML='<button type="button" class="tiny-btn v534-match-btn" data-v534-mark-match>ตรง</button><span class="v534-row-result" data-v534-row-result>ยังไม่ตรวจ</span>';tr.appendChild(td);
      }
      updateRowResult(tr);
    });
  }

  function updateRowResult(tr){
    const inp=tr?.querySelector('[data-v533-pdf-amount]'),out=tr?.querySelector('[data-v534-row-result]');if(!inp||!out)return;
    if(inp.value===''){out.textContent='ยังไม่ตรวจ';out.className='v534-row-result is-pending';return;}
    const expected=expectedFromRow(tr),actual=round2(inp.value),diff=round2(actual-expected);
    if(Math.abs(diff)<=0.01){out.textContent='✓ ตรง';out.className='v534-row-result is-ok';}
    else if(diff<0){out.textContent=`ขาด ${money(Math.abs(diff))}`;out.className='v534-row-result is-bad';}
    else {out.textContent=`เกิน ${money(diff)}`;out.className='v534-row-result is-warn';}
  }

  function collectManual(box){
    const staff=[...box.querySelectorAll('tbody tr')].map(tr=>{
      const inp=tr.querySelector('[data-v533-pdf-amount]'); if(!inp) return null;
      return {staff_id:inp.dataset.staffId||'',employee_code:inp.dataset.code||'',name:inp.dataset.name||'',expected_money:round2(expectedFromRow(tr)),pdf_money:inp.value===''?null:round2(inp.value)};
    }).filter(Boolean);
    const extras=[...box.querySelectorAll('[data-v533-extra-row]')].map(row=>({name:String(row.querySelector('[data-v533-extra-name]')?.value||'').trim(),amount:round2(row.querySelector('[data-v533-extra-amount]')?.value||0)})).filter(x=>x.name||Math.abs(x.amount)>0.001);
    const incomplete=staff.filter(x=>x.pdf_money==null);
    const mismatches=staff.filter(x=>x.pdf_money!=null&&Math.abs(round2(x.pdf_money-x.expected_money))>0.01);
    const staffPdfTotal=round2(staff.reduce((s,x)=>s+Number(x.pdf_money||0),0));
    const expectedTotal=round2(staff.reduce((s,x)=>s+Number(x.expected_money||0),0));
    const extrasTotal=round2(extras.reduce((s,x)=>s+Number(x.amount||0),0));
    return {staff,extras,incomplete,mismatches,staffPdfTotal,expectedTotal,extrasTotal};
  }

  function updateManualSummary(box){
    if(!box)return;addManualRowControls(box);
    box.querySelectorAll('tbody tr').forEach(updateRowResult);
    const d=collectManual(box);
    let summary=box.querySelector('[data-v534-manual-summary]');
    if(!summary){summary=document.createElement('div');summary.dataset.v534ManualSummary='1';summary.className='v534-manual-summary';const actions=box.querySelector('.actions');if(actions)actions.before(summary);else box.appendChild(summary);}
    const checked=d.staff.length-d.incomplete.length,ok=checked-d.mismatches.length;
    summary.innerHTML=`<span>ตรวจแล้ว <b>${checked}/${d.staff.length}</b></span><span class="v534-ok">ตรง <b>${ok}</b></span><span class="${d.mismatches.length?'v534-neg':''}">ไม่ตรง <b>${d.mismatches.length}</b></span><span>ยังไม่ตรวจ <b>${d.incomplete.length}</b></span>`;
    const confirm=box.querySelector('[data-v534-confirm-review]');
    if(confirm){confirm.disabled=!!d.incomplete.length||!!d.mismatches.length;confirm.title=confirm.disabled?'ต้องตรวจยอดทุกคนและให้ตรงก่อนยืนยัน':'';}
  }

  function simplifyPdfReview(){
    const root=document.getElementById('v533PdfReviewCard'); if(!root) return;
    const head=root.querySelector('.v533-pdf-head');
    if(head){
      const h=head.querySelector('h3');if(h)h.textContent='3. ตรวจยอด PDF ด้วยมือก่อนส่ง HR';
      const p=head.querySelector('.hint');if(p)p.textContent='เปิด PDF ที่ได้จาก Macro แล้วบวกยอดของแต่ละคน • กด “ตรง” หรือกรอกยอดจริง ระบบจะคำนวณส่วนต่างให้';
    }
    root.querySelectorAll('.v533-pdf-batch').forEach(box=>{
      const notice=box.querySelector('.soft-notice');if(notice)notice.innerHTML='<b>ไม่ใช้ OCR / ไม่อ่าน PDF อัตโนมัติ</b> — คนตรวจเป็นผู้ดู PDF จริง ระบบทำหน้าที่บันทึกยอดและจับส่วนต่าง';
      const fileLabel=box.querySelector('.v533-file-label');if(fileLabel){const textNode=[...fileLabel.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(textNode)textNode.textContent='📎 แนบ PDF เป็นหลักฐาน (ไม่บังคับ) ';}
      const reviewActions=box.querySelector('.v533-review-actions');if(reviewActions){reviewActions.innerHTML='<button type="button" class="ghost-btn" data-v533-fill-snapshot>ตั้งทุกคนเป็น “ตรง”</button><span>ใช้เมื่อเช็ก PDF แล้วตรงทั้งหมด หรือกด “ตรง” ทีละคนก็ได้</span>';}
      const table=box.querySelector('.v533-pdf-table');if(table){
        const hs=table.querySelectorAll('thead th');if(hs[1])hs[1].textContent='ระบบควรส่ง HR';if(hs[2])hs[2].textContent='ยอดใน PDF จริง';if(hs[3])hs[3].textContent='ส่วนต่าง';
      }
      const extraBox=box.querySelector('.v533-extra-box');if(extraBox&&!extraBox.closest('details')){
        const d=document.createElement('details');d.className='v534-optional-details';d.innerHTML='<summary>รายการนอกหน่วย / พิเศษ (ถ้ามี)</summary>';extraBox.replaceWith(d);d.appendChild(extraBox);
      }
      const meta=box.querySelector('.v533-review-meta');if(meta&&!meta.closest('details')){
        const d=document.createElement('details');d.className='v534-optional-details';d.innerHTML='<summary>ข้อมูลเพิ่มเติม / ยอดรวม PDF (ไม่บังคับ)</summary>';meta.replaceWith(d);d.appendChild(meta);
      }
      const oldConfirm=box.querySelector('[data-v533-confirm-review]');
      if(oldConfirm){oldConfirm.removeAttribute('data-v533-confirm-review');oldConfirm.setAttribute('data-v534-confirm-review','');oldConfirm.textContent='✓ ยืนยันยอดตรงและส่ง HR แล้ว';oldConfirm.disabled=false;}
      const save=box.querySelector('[data-v533-save-review]');if(save)save.textContent='บันทึกที่ตรวจไว้';
      addManualRowControls(box);updateManualSummary(box);
    });
  }

  async function ensureReview(batch,month,expected){
    const db=DB();if(!db?.from) throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const payload={batch_id:batch,source_month:monthKey(month),expected_total:round2(expected||0),status:'awaiting_pdf',updated_at:new Date().toISOString()};
    const {error}=await db.from('ot_export_pdf_reviews').upsert(payload,{onConflict:'batch_id',ignoreDuplicates:true});if(error)throw error;
  }

  async function confirmManual(box){
    const batch=String(box?.dataset?.v533Batch||'');if(!batch)return;
    const d=collectManual(box);
    if(d.incomplete.length)return toast(`ยังมี ${d.incomplete.length} คนที่ยังไม่ได้ตรวจ PDF`,'error');
    if(d.mismatches.length){
      const names=d.mismatches.slice(0,5).map(x=>x.name||x.employee_code||'').filter(Boolean).join(', ');
      return toast(`ยังยืนยันไม่ได้: ยอดไม่ตรง ${d.mismatches.length} คน${names?` (${names})`:''}`,'error');
    }
    busy(true,'กำลังยืนยันผลตรวจ HR');
    try{
      const db=DB();
      const snapRows=await window.cnmiV533?.loadSnapshots?.(selectedMonth(),true)||[];
      const snap=snapRows.find(x=>String(x.batch_id)===batch);
      if(!snap)throw new Error('ไม่พบ Snapshot ของ Batch นี้');
      if(!snap.pdf_review)await ensureReview(batch,snap.source_month,snap.total_money);
      const notes=String(box.querySelector('[data-v533-review-note]')?.value||'').trim();
      const now=new Date().toISOString();
      const payload={staff_amounts:d.staff,extras:d.extras,staff_pdf_total:d.staffPdfTotal,extras_total:d.extrasTotal,diff_total:null,status:'sent',notes:notes||'ตรวจยอด PDF ด้วยมือ: ยอดเจ้าหน้าที่ในหน่วยตรง Snapshot',reviewed_by:currentId(),reviewed_at:now,confirmed_by:currentId(),confirmed_at:now,updated_at:now};
      const {error}=await db.from('ot_export_pdf_reviews').update(payload).eq('batch_id',batch);if(error)throw error;
      toast('✓ ยืนยันแล้ว: ยอดใน PDF ของเจ้าหน้าที่ในหน่วยตรงกับระบบ');
      try{await window.cnmiV533?.render?.();}catch(_){}
      schedule(true,250);
    }catch(err){toast(err?.message||'ยืนยันผลตรวจไม่สำเร็จ','error');}
    finally{busy(false);}
  }

  function decorate(){
    if(rendering||S().page!=='ot')return;rendering=true;
    Promise.resolve().then(()=>renderClaimCard(false)).then(()=>{simplifyPdfReview();versionChip();}).catch(err=>console.warn('[V534] decorate failed',err)).finally(()=>{rendering=false;});
  }
  function schedule(force=false,delay=100){clearTimeout(renderTimer);renderTimer=setTimeout(async()=>{if(force&&window.cnmiV533?.render){try{await window.cnmiV533.render();}catch(_){}}decorate();setTimeout(()=>{simplifyPdfReview();versionChip();},260);},delay);}

  document.addEventListener('click',e=>{
    const match=e.target?.closest?.('[data-v534-mark-match]');
    if(match){e.preventDefault();const tr=match.closest('tr'),inp=tr?.querySelector('[data-v533-pdf-amount]');if(inp){inp.value=String(round2(expectedFromRow(tr)));inp.dispatchEvent(new Event('input',{bubbles:true}));updateRowResult(tr);updateManualSummary(tr.closest('[data-v533-batch]'));}return;}
    const confirm=e.target?.closest?.('[data-v534-confirm-review]');if(confirm){e.preventDefault();confirmManual(confirm.closest('[data-v533-batch]'));return;}
    if(e.target?.closest?.('[data-v533-fill-snapshot]'))setTimeout(()=>{const box=e.target.closest('[data-v533-batch]');if(box)updateManualSummary(box);},20);
    if(e.target?.closest?.('[data-v369-ot-menu],[data-v523-ot-item],[data-export-hr-v318],[data-export-hr-v241]'))schedule(false,180);
  },true);
  document.addEventListener('input',e=>{if(e.target?.matches?.('[data-v533-pdf-amount]')){const tr=e.target.closest('tr');updateRowResult(tr);updateManualSummary(e.target.closest('[data-v533-batch]'));}},true);
  document.addEventListener('change',e=>{if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='otSourceMonthV241')schedule(true,200);},true);

  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage&&!previousRenderPage.__v534Wrapped){
    const wrapped=function(){const out=previousRenderPage.apply(this,arguments);schedule(false,140);setTimeout(()=>schedule(false,0),500);return out;};wrapped.__v534Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  function start(){versionChip();schedule(false,80);setTimeout(()=>schedule(false,0),700);window.addEventListener('pageshow',()=>schedule(false,120));window.addEventListener('hashchange',()=>schedule(false,160));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV534={version:VERSION,render:()=>schedule(true,0)};
  console.info(`[${VERSION}] loaded`);
})();
