/* CNMI Staff Planner V529 — OT adjustment visibility
   - Staff can see their own shortfall/overclaim adjustments in OT detail/summary.
   - Admin can see all adjustments for the selected month directly on Export HR.
   - Admin detail shows adjustments of the selected staff member.
   - Uses existing V527 ot_adjustments table/RLS. No new SQL required.
*/
(function(){
  'use strict';
  if(window.__CNMI_V529_OT_ADJUSTMENT_VISIBILITY__) return;
  window.__CNMI_V529_OT_ADJUSTMENT_VISIBILITY__=true;
  const VERSION='V529_OT_ADJUSTMENT_VISIBILITY';
  const TH=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  let busy=false;
  let lastKey='';
  let rerenderTimer=0;

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function currentStaff(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.id||'');}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function monthKey(v){const s=String(v||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(s))return s;const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function selectedMonth(){return monthKey(S()?.otMenuMonthV369||S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.monthKey);}
  function thaiMonth(v){const [y,m]=monthKey(v).split('-').map(Number);return `${TH[m-1]} ${y+543}`;}
  function person(id){return (S().staff||[]).find(p=>String(p.id)===String(id))||{};}
  function nick(id){const p=person(id);return String(p.nickname||p.full_name||p.name||p.email||'-');}
  function fmtMoney(v){const n=Number(v||0);return `${Math.abs(n).toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2})} บ.`;}
  function typeLabel(r){return r.adjustment_type==='overclaim'?'ลด OT เบิกเกิน':'OT ตกเบิกย้อนหลัง';}
  function statusLabel(r){if(r.status==='exported')return '<span class="v529-status exported">รวมใน Export แล้ว</span>';return '<span class="v529-status pending">รอ Export</span>';}
  function signMoney(r){const n=Number(r.amount_delta||0);return `${n>=0?'+':'-'}${fmtMoney(n)}`;}
  function fmtUnit(v){const n=Number(v||0);if(!Number.isFinite(n))return '0';const a=Math.abs(n);if(Math.abs(a-Math.round(a))<0.00005)return `${n<0?'-':''}${Math.round(a)}`;return `${n<0?'-':''}${a.toFixed(2)}`;}
  function units(r){const n=Number(r.hr_unit_delta||0);return `${n>0?'+':''}${fmtUnit(n)}`;}
  function rowsSummary(rows){
    const plus=rows.filter(r=>Number(r.amount_delta)>0).reduce((s,r)=>s+Number(r.amount_delta||0),0);
    const minus=Math.abs(rows.filter(r=>Number(r.amount_delta)<0).reduce((s,r)=>s+Number(r.amount_delta||0),0));
    const net=plus-minus;
    const u=rows.reduce((s,r)=>s+Number(r.hr_unit_delta||0),0);
    return `<div class="v529-summary-chips"><span>เพิ่ม <b class="v529-plus">+${fmtMoney(plus)}</b></span><span>ลด <b class="v529-minus">-${fmtMoney(minus)}</b></span><span>สุทธิ <b class="${net<0?'v529-minus':'v529-plus'}">${net>=0?'+':'-'}${fmtMoney(net)}</b></span><span>HR 8 ชม.สุทธิ <b>${u>0?'+':''}${fmtUnit(u)} เวร</b></span></div>`;
  }
  function ownRows(rows,sid){return rows.filter(r=>String(r.staff_id)===String(sid));}
  function table(rows,{showName=false,compact=false}={}){
    if(!rows.length)return '<div class="empty v529-empty">ไม่มีรายการปรับยอดในเดือนนี้</div>';
    return `<div class="table-wrap v529-wrap"><table class="v529-table ${compact?'compact':''}"><thead><tr>${showName?'<th>คน</th>':''}<th>รายการ</th><th>เดือนต้นทาง</th><th>ยอดปรับ</th><th>HR 8 ชม.</th><th>สถานะ</th></tr></thead><tbody>${rows.map(r=>`<tr>${showName?`<td><b>${esc(nick(r.staff_id))}</b></td>`:''}<td>${esc(typeLabel(r))}${r.note?`<small>${esc(r.note)}</small>`:''}</td><td>${esc(thaiMonth(r.source_month))}</td><td><b class="${Number(r.amount_delta)<0?'v529-minus':'v529-plus'}">${esc(signMoney(r))}</b></td><td>${esc(units(r))}</td><td>${statusLabel(r)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function fetchRows(month){
    if(window.cnmiV527AdjustmentLedger?.fetchAdjustments){return await window.cnmiV527AdjustmentLedger.fetchAdjustments(month,false);}
    const db=window.sb||(typeof sb!=='undefined'?sb:null);if(!db)return [];
    const {data,error}=await db.from('ot_adjustments').select('*').eq('apply_month',month).neq('status','void').order('created_at',{ascending:false});
    if(error)throw error;return data||[];
  }
  function makeCard(id,title,subtitle,html,cls=''){
    const el=document.createElement('div');el.id=id;el.className=`card v529-adjust-card ${cls}`;el.innerHTML=`<div class="section-title"><div><h3>${esc(title)}</h3><p class="hint">${esc(subtitle)}</p></div></div>${html}`;return el;
  }
  function insertTop(container,card){
    if(!container||!card)return;
    const old=document.getElementById(card.id);
    if(old){if(old.innerHTML!==card.innerHTML)old.innerHTML=card.innerHTML;return old;}
    container.insertBefore(card,container.firstChild);return card;
  }
  function insertAfter(anchor,card){
    if(!anchor||!card)return;
    const old=document.getElementById(card.id);
    if(old){if(old.innerHTML!==card.innerHTML)old.innerHTML=card.innerHTML;return old;}
    anchor.parentNode.insertBefore(card,anchor.nextSibling);return card;
  }
  async function render(){
    if(busy||S().page!=='ot')return;
    busy=true;
    try{
      const menu=String(S().otMenuV369||'');
      const month=selectedMonth();
      const rows=await fetchRows(month);
      // Staff: own detail page.
      if(!admin()&&menu==='staff-details'){
        const mine=ownRows(rows,currentStaff());
        const content=document.querySelector('.v369-ot-content');
        if(content){
          const card=makeCard('v529StaffDetailAdjustments','รายการปรับยอดของฉัน',`รายการ + / - ที่นำมาปรับใน ${thaiMonth(month)} แยกจาก OT งานจริง`,rowsSummary(mine)+table(mine,{compact:true}),'v529-staff-card');
          insertTop(content,card);
        }
      }
      // Staff summary already has V527 summary card; make wording explicit if present.
      if(!admin()&&menu==='staff-summary'){
        const slot=document.getElementById('v527SummarySlot');
        if(slot){slot.classList.add('v529-staff-visible');const hint=slot.querySelector('.section-title .hint');if(hint)hint.textContent='รายการ + / - ของคุณในรอบนี้ แยกจาก OT งานจริง • สถานะ “รวมใน Export แล้ว” หมายถึงถูกนำเข้าไฟล์ HR แล้ว';}
      }
      // Admin selected staff detail.
      if(admin()&&menu==='admin-details'){
        const sid=String(S().otDetailStaffV369||'');
        const root=document.querySelector('.v369-admin-detail-body');
        if(sid&&root){
          const mine=ownRows(rows,sid);
          const anchor=root.querySelector('.v369-detail-summary')||root.firstElementChild;
          const card=makeCard('v529AdminStaffAdjustments',`รายการปรับยอดของ ${nick(sid)}`,`นำมาปรับใน ${thaiMonth(month)} • แยกจากชั่วโมง OT จริง`,rowsSummary(mine)+table(mine,{compact:true}),'v529-admin-staff-card');
          if(anchor)insertAfter(anchor,card);else root.prepend(card);
        }
      }
      // Admin Export: visibility before/after export.
      if(admin()&&menu==='export'){
        const content=document.querySelector('.v369-ot-content');
        if(content){
          const card=makeCard('v529ExportAdjustmentCard','รายการปรับยอดที่เกี่ยวข้องกับ Export รอบนี้',`ตรวจสอบก่อนส่ง HR • “รอ Export” จะถูกนำไปปรับเมื่อกด Export • “รวมใน Export แล้ว” คือถูกใช้ไปแล้ว`,rowsSummary(rows)+table(rows,{showName:true}),'v529-export-card');
          insertTop(content,card);
        }
      }
    }catch(err){
      console.warn('[V529] render adjustment visibility failed',err);
    }finally{busy=false;}
  }
  function decorateVersion(){
    const chip=document.querySelector('.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v529';chip.title='OT adjustment visibility for Staff + Export';chip.classList.add('v529-version-chip');}
  }
  function queue(delay=30){clearTimeout(rerenderTimer);rerenderTimer=setTimeout(()=>{decorateVersion();render();},delay);}
  document.addEventListener('change',e=>{
    if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='v369AdminDetailStaff')queue(120);
  },true);
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('[data-v523-ot-item],[data-v369-ot-menu],[data-export-hr-v318],[data-export-hr-v241]')){
      queue(140);if(e.target?.closest?.('[data-export-hr-v318],[data-export-hr-v241]')){setTimeout(()=>{window.cnmiV527AdjustmentLedger?.refresh?.().finally(()=>queue(50));},2500);}
    }
  },true);
  function start(){decorateVersion();queue(50);const content=document.getElementById('pageContent');if(content)new MutationObserver(ms=>{if(ms.some(m=>m.addedNodes?.length))queue(60);}).observe(content,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV529AdjustmentVisibility={version:VERSION,refresh:()=>queue(0)};
  console.info(`[${VERSION}] loaded`);
})();
