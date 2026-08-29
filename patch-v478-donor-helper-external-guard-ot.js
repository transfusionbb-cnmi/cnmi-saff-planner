/* CNMI Staff Planner V478
   - External helper page is for non-CNMI staff only (DB guard is in SQL_V478...)
   - Admin can mark each external helper as self-claim or CNMI-claim OT.
   - CNMI claim supports manual rate, hours, claim month independent from work date,
     and bulk retrospective claims across multiple work months.
*/
(function(){
  'use strict';
  const VERSION='V478_DONOR_HELPER_EXTERNAL_GUARD_OT';
  const PAGE='donorHelpers';
  if(window.__CNMI_V478_DONOR_HELPER_EXTERNAL_GUARD_OT__)return;
  window.__CNMI_V478_DONOR_HELPER_EXTERNAL_GUARD_OT__=true;

  let otRows=[];
  let otLoaded=false;
  let otLoading=false;
  let selectedIds=new Set();
  let filterMode='all';
  let filterSearch='';
  let filterClaimMonth=currentMonth();

  function S(){try{return state;}catch(_){return window.state||{};}}
  function DB(){try{return sb;}catch(_){return window.sb||null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function toast(msg,tone){try{return showToast(msg,tone?{tone}:undefined);}catch(_){window.alert(msg);}}
  function currentMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function isoMonth(v){const s=String(v||'').slice(0,7);return /^\d{4}-\d{2}$/.test(s)?s:'';}
  function fmtMonth(v){const s=isoMonth(v);if(!s)return'-';const [y,m]=s.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'short',year:'numeric'});}
  function fmtDate(v){const s=String(v||'').slice(0,10);if(!s)return'-';try{if(typeof formatThaiDate==='function')return formatThaiDate(s);}catch(_){}const d=new Date(`${s}T12:00:00`);return Number.isNaN(d.getTime())?s:d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
  function slotLabel(r){return String(r?.slot_type)==='clerk'?'Clerk':`คนเจาะ ${Number(r?.slot_no||1)}`;}
  function money(v){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}):'0';}
  function statusText(v){return ({pending:'รอเบิก',submitted:'ส่งเบิกแล้ว',paid:'จ่ายแล้ว'})[String(v||'')]||'-';}
  function modeText(v){return ({cnmi:'หน่วยเบิกให้',self:'เบิกเอง'})[String(v||'')]||'ยังไม่กำหนด';}
  function modeClass(v){return v==='cnmi'?'blue':v==='self'?'green':'black';}
  function cssEsc(v){try{return CSS.escape(String(v||''));}catch(_){return String(v||'').replace(/[^a-zA-Z0-9_-]/g,'\\$&');}}
  function eligible(r){return !['cancelled','no_show'].includes(String(r?.status||''));}
  function claimMonthOf(r){return isoMonth(r?.ot_claim_month);}

  function ensureStyle(){
    if(document.getElementById('v478HelperOtStyle'))return;
    const st=document.createElement('style');st.id='v478HelperOtStyle';st.textContent=`
      .v478-helper-ot-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px}
      .v478-helper-ot-summary h3{margin:0 0 4px}.v478-helper-ot-summary p{margin:0;color:var(--muted,#64748b)}
      .v478-helper-ot-badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .v478-ot-modal{max-width:1100px}.v478-ot-toolbar{display:grid;grid-template-columns:1fr 180px 160px auto;gap:10px;align-items:end;margin:12px 0}
      .v478-ot-list{max-height:56vh;overflow:auto;border:1px solid #dbe6ef;border-radius:14px}
      .v478-ot-row{display:grid;grid-template-columns:38px 110px minmax(180px,1.4fr) 110px 145px minmax(180px,1fr);gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #e7eef5}
      .v478-ot-row:last-child{border-bottom:0}.v478-ot-row small{display:block;color:#718096;margin-top:2px}.v478-ot-row .v478-amount{text-align:right;font-weight:700}
      .v478-ot-row.disabled{opacity:.55}.v478-ot-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;justify-content:flex-end}
      .v478-ot-config-note{background:#f6f9fc;border:1px solid #dce8f2;border-radius:12px;padding:10px 12px;margin-bottom:10px}
      .v478-ot-inline-btn{margin-left:6px}
      @media(max-width:760px){.v478-ot-toolbar{grid-template-columns:1fr 1fr}.v478-ot-toolbar .wide-mobile{grid-column:1/-1}.v478-ot-row{grid-template-columns:34px 1fr 100px}.v478-ot-row>div:nth-child(4),.v478-ot-row>div:nth-child(6){grid-column:2/-1}.v478-ot-row>div:nth-child(5){grid-column:2}.v478-ot-list{max-height:62vh}}
    `;document.head.appendChild(st);
  }

  function summaryStats(){
    const active=otRows.filter(eligible);
    const unset=active.filter(r=>!r.ot_payment_mode).length;
    const self=active.filter(r=>r.ot_payment_mode==='self').length;
    const cnmiMonth=active.filter(r=>r.ot_payment_mode==='cnmi'&&claimMonthOf(r)===filterClaimMonth);
    const amount=cnmiMonth.reduce((s,r)=>s+Number(r.ot_amount||0),0);
    return {unset,self,cnmiCount:cnmiMonth.length,amount};
  }

  function renderSummary(){
    if(S()?.page!==PAGE||!admin())return;
    ensureStyle();
    const root=document.querySelector('.donor-helper-page-v327');if(!root)return;
    let node=document.getElementById('v478ExternalHelperOtSummary');
    if(!node){node=document.createElement('div');node.id='v478ExternalHelperOtSummary';node.className='card v478-helper-ot-summary';const toolbar=root.querySelector('.donor-helper-toolbar');if(toolbar?.nextSibling)root.insertBefore(node,toolbar.nextSibling);else root.appendChild(node);}
    if(otLoading&&!otLoaded){node.innerHTML='<div><h3>OT คนนอกหน่วย</h3><p>กำลังโหลด…</p></div>';return;}
    const x=summaryStats();
    node.innerHTML=`<div><h3>OT คนนอกหน่วย</h3><p>กำหนดเฉพาะรายที่หน่วยต้องเบิกให้ • เบิกย้อนหลังได้โดยเลือกเดือนเบิกแยกจากวันที่ทำงาน</p></div><div class="v478-helper-ot-badges"><span class="badge black">ยังไม่กำหนด ${x.unset}</span><span class="badge green">เบิกเอง ${x.self}</span><span class="badge blue">${esc(fmtMonth(filterClaimMonth))} ${x.cnmiCount} รายการ • ${esc(money(x.amount))} บ.</span><button class="primary-btn" type="button" data-v478-open-ot>จัดการ OT</button></div>`;
    decorateCurrentCards();
  }

  async function loadOt(force=false){
    if(!admin()||S()?.page!==PAGE)return;
    if(otLoading)return;
    if(otLoaded&&!force){renderSummary();return;}
    const db=DB();if(!db?.rpc)return;
    otLoading=true;renderSummary();
    try{
      const res=await db.rpc('get_donor_helper_external_ot_admin_v478',{p_from:null,p_to:null});
      if(res?.error)throw res.error;
      const data=typeof res.data==='string'?JSON.parse(res.data):res.data;
      otRows=Array.isArray(data?.rows)?data.rows:[];otLoaded=true;
    }catch(e){console.warn(`[${VERSION}] load`,e);toast(/does not exist|schema cache/i.test(String(e?.message||e))?'กรุณา Run SQL_V478_DONOR_HELPER_EXTERNAL_GUARD_OT.sql ก่อน':'โหลด OT คนนอกหน่วยไม่สำเร็จ','error');}
    finally{otLoading=false;renderSummary();}
  }

  function visibleRows(){
    const q=filterSearch.trim().toLocaleLowerCase('th-TH');
    return otRows.filter(r=>{
      if(!eligible(r))return false;
      if(filterMode==='unset'&&r.ot_payment_mode)return false;
      if(filterMode==='cnmi'&&r.ot_payment_mode!=='cnmi')return false;
      if(filterMode==='self'&&r.ot_payment_mode!=='self')return false;
      if(filterMode==='claimmonth'&&!(r.ot_payment_mode==='cnmi'&&claimMonthOf(r)===filterClaimMonth))return false;
      if(q&&!`${r.helper_name||''} ${r.unit_name||''} ${r.phone||''}`.toLocaleLowerCase('th-TH').includes(q))return false;
      return true;
    });
  }

  function rowHtml(r){
    const mode=String(r.ot_payment_mode||'');const cnmi=mode==='cnmi';
    return `<div class="v478-ot-row${eligible(r)?'':' disabled'}" data-v478-row="${esc(r.id)}"><div><input type="checkbox" data-v478-check="${esc(r.id)}" ${selectedIds.has(String(r.id))?'checked':''} ${eligible(r)?'':'disabled'}></div><div><b>${esc(fmtDate(r.work_date))}</b><small>${esc(slotLabel(r))}</small></div><div><b>${esc(r.helper_name||'-')}</b><small>${esc(r.unit_name||'-')}${r.phone?` • ${esc(r.phone)}`:''}</small></div><div><span class="badge ${modeClass(mode)}">${esc(modeText(mode))}</span></div><div>${cnmi?`<b>${esc(money(r.ot_rate))} บ./ชม.</b><small>${esc(money(r.ot_hours))} ชม. • ${esc(fmtMonth(r.ot_claim_month))} • ${esc(statusText(r.ot_claim_status))}</small>`:'<span class="muted">—</span>'}</div><div class="v478-amount">${cnmi?`${esc(money(r.ot_amount))} บ.`:'—'}<small>${r.ot_note?esc(r.ot_note):''}</small></div></div>`;
  }

  function modalHtml(){
    const rows=visibleRows();
    return `<div class="v478-ot-modal"><h2>จัดการ OT คนนอกหน่วย</h2><div class="v478-ot-config-note">วันทำงานยังคงเป็นวันที่มาช่วยจริง ส่วน <b>เดือนเบิก</b> เลือกแยกได้ จึงรวมงานย้อนหลังหลายเดือนไปเบิกในเดือนเดียวกันได้</div><div class="v478-ot-toolbar"><label class="wide-mobile">ค้นหาชื่อ/หน่วยงาน<input data-v478-search value="${esc(filterSearch)}" placeholder="พิมพ์ชื่อหรือหน่วยงาน"></label><label>แสดง<select data-v478-mode><option value="all"${filterMode==='all'?' selected':''}>ทั้งหมด</option><option value="unset"${filterMode==='unset'?' selected':''}>ยังไม่กำหนด</option><option value="cnmi"${filterMode==='cnmi'?' selected':''}>หน่วยเบิกให้</option><option value="self"${filterMode==='self'?' selected':''}>เบิกเอง</option><option value="claimmonth"${filterMode==='claimmonth'?' selected':''}>เดือนเบิกที่เลือก</option></select></label><label>เดือนเบิก<input type="month" data-v478-claim-filter value="${esc(filterClaimMonth)}"></label><button class="ghost-btn" type="button" data-v478-refresh-ot>รีเฟรช</button></div><div class="v478-ot-list">${rows.length?rows.map(rowHtml).join(''):'<div style="padding:24px;text-align:center;color:#718096">ไม่พบรายการตามตัวกรอง</div>'}</div><div class="v478-ot-actions"><button class="ghost-btn" type="button" data-v478-select-visible>เลือกทั้งหมดที่เห็น</button><button class="primary-btn" type="button" data-v478-configure ${selectedIds.size?'':'disabled'}>กำหนด OT ที่เลือก (${selectedIds.size})</button><button class="ghost-btn" type="button" data-v478-close>ปิด</button></div></div>`;
  }

  function showManage(){
    if(!admin())return;
    selectedIds.clear();
    try{showModal(modalHtml(),{large:true});}catch(_){return toast('เปิดหน้าจัดการ OT ไม่สำเร็จ','error');}
  }
  function rerenderModal(){const body=document.querySelector('#modalBody');if(body&&document.querySelector('[data-v478-mode]'))body.innerHTML=modalHtml();}

  function selectedRows(){return otRows.filter(r=>selectedIds.has(String(r.id)));}
  function configureHtml(ids){
    const rows=selectedRows();const first=rows[0]||{};const sameMode=rows.every(r=>String(r.ot_payment_mode||'')===String(first.ot_payment_mode||''));const mode=sameMode?String(first.ot_payment_mode||'cnmi'):'cnmi';
    const claim=claimMonthOf(first)||filterClaimMonth||currentMonth();const rate=Number(first.ot_rate||0)||'';const hrs=Number(first.ot_hours||8)||8;const stat=String(first.ot_claim_status||'pending');
    return `<div class="v478-ot-modal"><h2>กำหนด OT ${rows.length} รายการ</h2><p class="muted">${esc(rows.slice(0,4).map(r=>`${fmtDate(r.work_date)} ${r.helper_name}`).join(' • '))}${rows.length>4?` • +${rows.length-4} รายการ`:''}</p><form id="v478OtConfigForm" class="form-grid"><input type="hidden" name="ids" value="${esc(ids.join(','))}"><label class="wide">วิธีเบิก<select name="mode" data-v478-config-mode required><option value="cnmi"${mode==='cnmi'?' selected':''}>หน่วยเวชศาสตร์บริการโลหิตเบิกให้</option><option value="self"${mode==='self'?' selected':''}>ผู้มาช่วยเบิกเอง</option><option value="unset">ยังไม่กำหนด</option></select></label><label data-v478-cnmi-field>เรท OT (บาท/ชม.)<input name="rate" type="number" min="0.01" step="0.01" value="${esc(rate)}" placeholder="ใส่เรทเอง"></label><label data-v478-cnmi-field>ชั่วโมงต่อรายการ<input name="hours" type="number" min="0.25" max="24" step="0.25" value="${esc(hrs)}"></label><label data-v478-cnmi-field>นำไปเบิกเดือน<input name="claim_month" type="month" value="${esc(claim)}"></label><label data-v478-cnmi-field>สถานะ<select name="claim_status"><option value="pending"${stat==='pending'?' selected':''}>รอเบิก</option><option value="submitted"${stat==='submitted'?' selected':''}>ส่งเบิกแล้ว</option><option value="paid"${stat==='paid'?' selected':''}>จ่ายแล้ว</option></select></label><label class="wide">หมายเหตุ<input name="note" value="${esc(first.ot_note||'')}" placeholder="เช่น เบิกย้อนหลัง ก.ค.–ส.ค. ในรอบ ก.ย."></label><div class="wide v478-ot-actions"><button class="ghost-btn" type="button" data-v478-back>กลับ</button><button class="primary-btn" type="submit">บันทึก</button></div></form></div>`;
  }
  function toggleCnmiFields(){const mode=document.querySelector('[data-v478-config-mode]')?.value;document.querySelectorAll('[data-v478-cnmi-field]').forEach(el=>{el.style.display=mode==='cnmi'?'':'none';});}

  async function saveConfig(form){
    const fd=new FormData(form);const ids=String(fd.get('ids')||'').split(',').filter(Boolean);const mode=String(fd.get('mode')||'unset');const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
    try{
      const claim=String(fd.get('claim_month')||'');
      const args={p_signup_ids:ids,p_payment_mode:mode,p_rate:mode==='cnmi'?Number(fd.get('rate')):null,p_hours:mode==='cnmi'?Number(fd.get('hours')):null,p_claim_month:mode==='cnmi'&&claim?`${claim}-01`:null,p_claim_status:mode==='cnmi'?String(fd.get('claim_status')||'pending'):null,p_note:String(fd.get('note')||'').trim()||null};
      const res=await DB().rpc('admin_set_donor_helper_ot_v478',args);if(res?.error)throw res.error;
      await loadOt(true);selectedIds.clear();toast(`บันทึก OT ${Number(res.data||ids.length)} รายการแล้ว`);showManage();
    }catch(e){toast(String(e?.message||e).replace(/^.*?:\s*/,''),'error');if(button)button.disabled=false;}
  }

  function decorateCurrentCards(){
    if(!admin()||!otLoaded)return;
    otRows.forEach(r=>{
      const id=String(r.id||'');if(!id)return;
      const edit=document.querySelector(`[data-v327-edit="${cssEsc(id)}"]`);if(!edit)return;
      const parent=edit.parentElement;if(!parent||parent.querySelector(`[data-v478-ot-one="${cssEsc(id)}"]`))return;
      const btn=document.createElement('button');btn.type='button';btn.className='tiny-btn v478-ot-inline-btn';btn.setAttribute('data-v478-ot-one',id);btn.textContent=r.ot_payment_mode==='cnmi'?`OT ${money(r.ot_amount)} บ.`:r.ot_payment_mode==='self'?'OT เบิกเอง':'OT';parent.appendChild(btn);
    });
  }

  const prevRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  const wrapped=function(){const out=prevRender?prevRender.apply(this,arguments):undefined;setTimeout(()=>{if(S()?.page===PAGE&&admin()){renderSummary();loadOt(false);}},0);return out;};
  try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}

  document.addEventListener('click',e=>{
    const t=e.target?.closest?.('[data-v478-open-ot],[data-v478-refresh-ot],[data-v478-select-visible],[data-v478-configure],[data-v478-close],[data-v478-back],[data-v478-ot-one]');if(!t)return;
    e.preventDefault();e.stopPropagation();
    if(t.hasAttribute('data-v478-open-ot'))return showManage();
    if(t.hasAttribute('data-v478-refresh-ot'))return void loadOt(true).then(()=>rerenderModal());
    if(t.hasAttribute('data-v478-select-visible')){visibleRows().forEach(r=>selectedIds.add(String(r.id)));return rerenderModal();}
    if(t.hasAttribute('data-v478-configure')){const ids=[...selectedIds];if(!ids.length)return;try{showModal(configureHtml(ids),{large:true});setTimeout(toggleCnmiFields,0);}catch(_){toast('เปิดแบบฟอร์มไม่สำเร็จ','error');}return;}
    if(t.hasAttribute('data-v478-ot-one')){selectedIds=new Set([String(t.getAttribute('data-v478-ot-one'))]);try{showModal(configureHtml([...selectedIds]),{large:true});setTimeout(toggleCnmiFields,0);}catch(_){toast('เปิดแบบฟอร์มไม่สำเร็จ','error');}return;}
    if(t.hasAttribute('data-v478-back'))return showManage();
    if(t.hasAttribute('data-v478-close')){try{closeModal();}catch(_){}return;}
  },true);

  document.addEventListener('change',e=>{
    const t=e.target;
    if(t?.matches?.('[data-v478-check]')){const id=String(t.getAttribute('data-v478-check'));if(t.checked)selectedIds.add(id);else selectedIds.delete(id);return rerenderModal();}
    if(t?.matches?.('[data-v478-mode]')){filterMode=t.value||'all';selectedIds.clear();return rerenderModal();}
    if(t?.matches?.('[data-v478-claim-filter]')){filterClaimMonth=t.value||currentMonth();selectedIds.clear();renderSummary();return rerenderModal();}
    if(t?.matches?.('[data-v478-config-mode]'))return toggleCnmiFields();
  },true);
  document.addEventListener('input',e=>{const t=e.target;if(t?.matches?.('[data-v478-search]')){filterSearch=t.value||'';selectedIds.clear();clearTimeout(window.__v478SearchTimer);window.__v478SearchTimer=setTimeout(()=>{rerenderModal();const n=document.querySelector('[data-v478-search]');if(n){n.focus();try{n.setSelectionRange(n.value.length,n.value.length);}catch(_){}}},180);}},true);
  document.addEventListener('submit',e=>{if(e.target?.id!=='v478OtConfigForm')return;e.preventDefault();e.stopPropagation();void saveConfig(e.target);},true);

  console.info(`[${VERSION}] loaded`);
})();
