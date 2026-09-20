/* CNMI Staff Planner V527 — OT Adjustment Ledger + Group Activity OT
   - Separates real OT from historical shortfall/overclaim adjustments.
   - Adjustment rows do NOT count as real work hours and do NOT create normal carry-forward.
   - Whole 8-hour HR unit deltas are applied by the V318 exporter (patched in V527).
   - Group activity/meeting OT creates normal approved OT rows for selected staff and may overlap roster duties by design.
*/
(function(){
  'use strict';
  if(window.__CNMI_V527_OT_ADJUSTMENT_LEDGER__) return;
  window.__CNMI_V527_OT_ADJUSTMENT_LEDGER__=true;
  const VERSION='V527_OT_ADJUSTMENT_LEDGER';
  const cache=new Map();
  const TH_MONTHS=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{return window.sb||(typeof sb!=='undefined'?sb:null);}catch(_){return null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function staffId(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.id||'');}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function pad(n){return String(n).padStart(2,'0');}
  function today(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}}
  function monthKey(v){const s=String(v||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(s))return s;const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
  function selectedMonth(){return monthKey(S()?.otMenuMonthV369||S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.monthKey);}
  function thaiMonth(key){const [y,m]=monthKey(key).split('-').map(Number);return `${TH_MONTHS[m-1]} ${y+543}`;}
  function fmtMoney(v){const n=Number(v||0);return `${n.toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2})} บ.`;}
  function fmtHours(v){const n=Math.round(Number(v||0)*100)/100;return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');}
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console.info(msg);}}
  function busy(on,text){try{setBusy(on,text);}catch(_){} }
  function activeStaff(){return (S().staff||[]).filter(s=>s&&s.is_active!==false&&s.active!==false&&!(window.cnmiPersonTypeV516?.isPhysician?.(s)??/^(แพทย์|physician|doctor)$/i.test(String(s.staff_type||s.role||'')))).slice().sort((a,b)=>String(a.nickname||a.full_name||'').localeCompare(String(b.nickname||b.full_name||''),'th'));}
  function person(id){return (S().staff||[]).find(x=>String(x.id)===String(id))||{};}
  function nick(p){return String(p?.nickname||p?.full_name||p?.name||p?.email||'-');}
  function full(p){return String(p?.full_name||p?.name||p?.nickname||p?.email||'-');}
  function isClerk(p){return /เคิก|clerk/i.test(String(p?.staff_type||p?.type||p?.position||''));}
  function baseRateFor(id){return isClerk(person(id))?90:130;}
  function rateTypeFor(id){return isClerk(person(id))?'CLERK':'MT';}
  function round2(n){n=Number(n||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
  function round4(n){n=Number(n||0);return Number.isFinite(n)?Math.round(n*10000)/10000:0;}
  function fmtUnit(v){const n=Number(v||0);if(!Number.isFinite(n))return '0';const a=Math.abs(n);if(Math.abs(a-Math.round(a))<0.00005)return `${n<0?'-':''}${Math.round(a)}`;return `${n<0?'-':''}${a.toFixed(2)}`;}
  function eventHash(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
  function activeMode(){const m=String(S().v527ExtraMode||'work');return ['work','adjustment','activity'].includes(m)?m:'work';}
  function selectedStaffOption(selected=''){return `<option value="">เลือกชื่อ</option>${activeStaff().map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(selected)?'selected':''}>${esc(nick(p))}</option>`).join('')}`;}

  function modeTabs(){const mode=activeMode();return `<div class="card v527-mode-card"><div class="v527-mode-tabs" role="tablist" aria-label="ประเภทการบันทึก OT">
    <button type="button" class="v527-mode-btn ${mode==='work'?'active':''}" data-v527-mode="work">OT เพิ่มตามงานจริง</button>
    <button type="button" class="v527-mode-btn ${mode==='adjustment'?'active':''}" data-v527-mode="adjustment">ตกเบิก / ลดเบิกเกิน</button>
    <button type="button" class="v527-mode-btn ${mode==='activity'?'active':''}" data-v527-mode="activity">ประชุม / กิจกรรมร่วม</button>
  </div><p class="v527-mode-note">รายการปรับยอดย้อนหลังแยกจากชั่วโมงทำงานจริง ส่วนประชุม/กิจกรรมร่วมเป็น OT งานจริงและเลือกผู้เข้าร่วมเป็นรายคนได้</p></div>`;}

  function adjustmentCard(){
    const apply=selectedMonth();
    return `<div class="card v527-adjustment-card"><div class="section-title"><div><h3>ปรับยอด OT ย้อนหลัง</h3><p class="hint">ใช้เฉพาะยอดที่ตรวจสอบแล้วจากเอกสารเดิม • ไม่แก้ OT ต้นทาง • ไม่ปนกับยอดทบปกติ</p></div></div>
      <form id="v527AdjustmentForm" class="form-grid v527-form">
        <label>ประเภท <select name="adjustment_type" required><option value="shortfall">OT ตกเบิกย้อนหลัง (+)</option><option value="overclaim">ลด OT เบิกเกิน (-)</option></select></label>
        <label>เจ้าหน้าที่ <select name="staff_id" required>${selectedStaffOption()}</select></label>
        <label>เดือนต้นทาง <input type="month" name="source_month" value="${esc(apply)}" required></label>
        <label>นำมาปรับในเดือน <input type="month" name="apply_month" value="${esc(apply)}" required></label>
        <label>จำนวนเงินที่ต้องปรับ <input type="number" name="amount" min="0.01" step="0.01" placeholder="เช่น 5200" required></label>
        <label>จำนวนเวร HR 8 ชม. <input type="number" name="hr_units" min="0" step="0.01" placeholder="ระบบช่วยคำนวณ เช่น 0.12"></label>
        <div class="wide v527-adjust-preview" data-v527-adjust-preview>เลือกชื่อและใส่จำนวนเงิน ระบบจะช่วยเทียบเป็นหน่วย 8 ชั่วโมง</div>
        <label class="wide">รายละเอียด <input name="note" placeholder="เช่น เทียบ App กับ PDF รอบเดิมแล้วขาด 5,200 บาท"></label>
        <button type="submit" class="primary-btn wide">บันทึกรายการปรับยอด</button>
      </form>
      <div class="v527-ledger-slot" id="v527LedgerSlot"><div class="empty">กำลังโหลดรายการปรับยอด…</div></div>
    </div>`;
  }

  function staffStatus(id,date){
    const d=String(date||'').slice(0,10),bits=[];
    const roster=(S().rosterAssignments||[]).filter(r=>String(r.staff_id)===String(id)&&String(r.duty_date||'').slice(0,10)===d);
    if(roster.length)bits.push(`อยู่เวร ${[...new Set(roster.map(r=>r.duty_code).filter(Boolean))].join('/')}`);
    const leaves=(S().leaves||[]).filter(l=>{
      if(String(l.staff_id)!==String(id))return false;
      const st=String(l.status||'').toLowerCase();if(/reject|cancel|ไม่อนุมัติ|ยกเลิก/.test(st))return false;
      const t=String(l.type||l.leave_type||'');if(!t||t==='ไม่รับเวร')return false;
      const a=String(l.start_date||l.leave_date||'').slice(0,10),b=String(l.end_date||l.start_date||'').slice(0,10);return d>=a&&d<=b;
    });
    if(leaves.length)bits.push([...new Set(leaves.map(l=>`${l.type||l.leave_type}${l.period&&l.period!=='เต็มวัน'?` ${l.period}`:''}`))].join('/'));
    return bits;
  }
  function participantGrid(date){return `<div class="v527-participant-tools"><input type="search" id="v527ParticipantSearch" placeholder="ค้นหาชื่อผู้เข้าร่วม"><button type="button" class="ghost-btn" data-v527-select-all>เลือกทั้งหมด</button><button type="button" class="ghost-btn" data-v527-clear-all>ล้างทั้งหมด</button></div><div class="v527-participant-count">เลือกแล้ว <b id="v527SelectedCount">0</b> คน</div><div class="v527-participant-grid" id="v527ParticipantGrid">${activeStaff().map(p=>{const status=staffStatus(p.id,date);return `<label class="v527-person" data-v527-person data-name="${esc(`${nick(p)} ${full(p)}`.toLowerCase())}"><input type="checkbox" name="participants" value="${esc(p.id)}"><span class="v527-person-main"><b>${esc(nick(p))}</b>${status.length?`<small>${status.map(x=>`<span class="v527-status-chip">${esc(x)}</span>`).join('')}</small>`:'<small class="muted">ไม่มีสถานะพิเศษในวันนี้</small>'}</span></label>`;}).join('')}</div>`;}
  function activityCard(){const d=today();return `<div class="card v527-activity-card"><div class="section-title"><div><h3>ประชุม / กิจกรรมร่วม</h3><p class="hint">เลือกคนที่เข้าร่วมจริงเป็นรายคน • อยู่เวรอยู่แล้วก็เบิก OT กิจกรรมนี้ได้ • สถานะลา/เวรแสดงเพื่อประกอบการตัดสินใจเท่านั้น</p></div></div>
    <form id="v527ActivityForm" class="v527-form">
      <div class="form-grid"><label>วันที่ <input type="date" name="work_date" value="${esc(d)}" required></label><label>จำนวนชั่วโมง <input type="number" name="hours" min="0.5" max="24" step="0.5" placeholder="เช่น 2 / 6 / 8" required></label><label class="wide">ชื่อกิจกรรม / เหตุผล <input name="title" placeholder="เช่น ประชุมหน่วยย่อย" required></label><label class="wide">รายละเอียด <input name="note" placeholder="เช่น ประชุมวันที่ 2, 16 และ 23 ก.ย. 2569"></label></div>
      <h4 class="v527-participant-heading">ผู้เข้าร่วม</h4><div id="v527ParticipantArea">${participantGrid(d)}</div>
      <button type="submit" class="primary-btn wide v527-activity-save">บันทึก OT ให้ผู้ที่เลือก</button>
    </form></div>`;}

  function injectExtraModes(html){
    if(!admin()||S().page!=='ot'||String(S().otMenuV369||'')!=='admin-extra')return html;
    const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
    const content=tpl.content.querySelector('.v369-ot-content');if(!content)return html;
    const original=content.innerHTML,mode=activeMode();
    content.innerHTML=modeTabs()+`<div class="v527-work-panel ${mode==='work'?'':'v527-hidden'}">${original}</div>${mode==='adjustment'?adjustmentCard():''}${mode==='activity'?activityCard():''}`;
    const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
  }
  function injectSummary(html){
    if(S().page!=='ot'||!['summary','staff-summary'].includes(String(S().otMenuV369||'')))return html;
    const tpl=document.createElement('template');tpl.innerHTML=String(html||'');const content=tpl.content.querySelector('.v369-ot-content');if(!content||content.querySelector('#v527SummarySlot'))return html;
    const card=document.createElement('div');card.className='card v527-summary-card';card.id='v527SummarySlot';card.innerHTML='<div class="empty">กำลังโหลดรายการปรับยอดของเดือนนี้…</div>';content.prepend(card);
    const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
  }
  const prevRender=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(prevRender){const wrapped=function(){let html=String(prevRender.apply(this,arguments)||'');html=injectExtraModes(html);html=injectSummary(html);return html;};try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}}

  async function fetchAdjustments(month,force=false){
    const key=monthKey(month);if(!force&&cache.has(key))return cache.get(key);
    const db=DB();if(!db?.from)throw new Error('ไม่พบ Supabase');
    const {data,error}=await db.from('ot_adjustments').select('*').eq('apply_month',key).neq('status','void').order('created_at',{ascending:false});
    if(error)throw error;const rows=data||[];cache.set(key,rows);return rows;
  }
  function statusBadge(row){if(row.status==='exported')return '<span class="badge green">รวมใน Export แล้ว</span>';return '<span class="badge orange">รอ Export</span>';}
  function typeLabel(row){return row.adjustment_type==='overclaim'?'ลด OT เบิกเกิน':'OT ตกเบิกย้อนหลัง';}
  function signedUnits(row){return Number(row.hr_unit_delta||0);}
  function renderLedger(rows,forSummary=false){
    const own=admin()?rows:rows.filter(r=>String(r.staff_id)===staffId());
    if(!own.length)return `<div class="empty">ยังไม่มีรายการปรับยอดใน ${esc(thaiMonth(selectedMonth()))}</div>`;
    const add=own.filter(x=>Number(x.amount_delta)>0).reduce((s,x)=>s+Number(x.amount_delta||0),0),sub=Math.abs(own.filter(x=>Number(x.amount_delta)<0).reduce((s,x)=>s+Number(x.amount_delta||0),0)),net=round2(add-sub),unitNet=own.reduce((s,x)=>s+signedUnits(x),0);
    return `<div class="v527-ledger-summary"><span>เพิ่ม <b>+${fmtMoney(add)}</b></span><span>ลด <b>-${fmtMoney(sub)}</b></span><span>สุทธิ <b>${net>=0?'+':''}${fmtMoney(net)}</b></span><span>หน่วย HR สุทธิ <b>${unitNet>0?'+':''}${fmtUnit(unitNet)}</b> เวร</span></div><div class="table-wrap"><table class="v527-ledger-table"><thead><tr><th>คน</th><th>ประเภท</th><th>ต้นทาง</th><th>ยอดเงิน</th><th>HR 8 ชม.</th><th>สถานะ</th>${admin()&&!forSummary?'<th>จัดการ</th>':''}</tr></thead><tbody>${own.map(r=>{const p=person(r.staff_id),money=Number(r.amount_delta||0),u=signedUnits(r);return `<tr><td>${esc(nick(p))}</td><td>${esc(typeLabel(r))}</td><td>${esc(thaiMonth(r.source_month))}</td><td class="${money<0?'v527-negative':'v527-positive'}"><b>${money>0?'+':''}${fmtMoney(money)}</b></td><td>${u>0?'+':''}${fmtUnit(u)}</td><td>${statusBadge(r)}</td>${admin()&&!forSummary?`<td>${r.status==='pending'?`<button type="button" class="tiny-btn danger" data-v527-void="${esc(r.id)}">ยกเลิก</button>`:'-'}</td>`:''}</tr>`;}).join('')}</tbody></table></div>`;
  }
  async function hydrate(){
    const month=selectedMonth();
    for(const el of [document.getElementById('v527LedgerSlot'),document.getElementById('v527SummarySlot')].filter(Boolean)){
      try{
        const rows=await fetchAdjustments(month,false);if(!document.body.contains(el))continue;
        const sig=`${month}|${rows.map(r=>`${r.id}:${r.status}:${r.updated_at||r.exported_at||r.created_at||''}`).join(',')}|${el.id}`;
        if(el.dataset.v527Sig===sig)continue;
        const html=el.id==='v527SummarySlot'?`<div class="section-title"><div><h3>รายการปรับยอด OT รอบนี้</h3><p class="hint">แยกจาก OT งานจริง • หน่วย HR รองรับทศนิยม และระบบจะรวมยอดก่อนตัดเป็นชุด 8 ชม. ตอน Export</p></div></div>${renderLedger(rows,true)}`:`<div class="section-title"><div><h4>รายการปรับยอดใน ${esc(thaiMonth(month))}</h4></div></div>${renderLedger(rows,false)}`;
        el.innerHTML=html;el.dataset.v527Sig=sig;
      }catch(err){const missing=/ot_adjustments|42P01|does not exist|schema cache/i.test(String(err?.message||err));const sig=`error|${month}|${missing?'missing':'other'}`;if(el.dataset.v527Sig===sig)continue;el.innerHTML=`<div class="notice ${missing?'error-notice':'soft-notice'} compact"><b>${missing?'ยังไม่ได้ติดตั้ง V527':'โหลดรายการไม่สำเร็จ'}</b><br>${missing?'รัน SQL_V527_OT_ADJUSTMENT_LEDGER.sql ใน Supabase 1 ครั้ง':esc(err?.message||err)}</div>`;el.dataset.v527Sig=sig;}
    }
  }

  function syncAdjustmentPreview(form){if(!form)return;const fd=new FormData(form),sid=String(fd.get('staff_id')||''),amount=Number(fd.get('amount')||0),rate=baseRateFor(sid),rawUnits=amount>0&&rate>0?amount/(rate*8):0,storedUnits=round4(rawUnits),units=form.querySelector('[name="hr_units"]');if(units&&!units.dataset.edited){const value=amount>0?String(storedUnits):'';if(units.value!==value)units.value=value;}const p=form.querySelector('[data-v527-adjust-preview]');if(p){const html=sid&&amount>0?`ฐาน HR ของ <b>${esc(nick(person(sid)))}</b> = ${rate} บาท/ชม. • ${fmtMoney(amount)} ≈ <b>${fmtUnit(storedUnits)}</b> หน่วย HR 8 ชม. <span class="badge blue">เก็บทศนิยมตามยอดจริง</span>`:'เลือกชื่อและใส่จำนวนเงิน ระบบจะช่วยเทียบเป็นหน่วย HR 8 ชั่วโมง';if(p.innerHTML!==html)p.innerHTML=html;}}
  async function saveAdjustment(form){
    if(!admin())return;const fd=new FormData(form),type=String(fd.get('adjustment_type')||''),sid=String(fd.get('staff_id')||''),source=monthKey(fd.get('source_month')),apply=monthKey(fd.get('apply_month')),amountAbs=round2(Math.abs(Number(fd.get('amount')||0))),unitsAbs=Math.max(0,round4(Number(fd.get('hr_units')||0))),note=String(fd.get('note')||'').trim();if(!sid||!amountAbs)return toast('กรุณาเลือกเจ้าหน้าที่และใส่จำนวนเงิน','error');
    const sign=type==='overclaim'?-1:1,rate=baseRateFor(sid),payload={staff_id:sid,adjustment_type:type==='overclaim'?'overclaim':'shortfall',source_month:source,apply_month:apply,amount_delta:round2(sign*amountAbs),hr_unit_delta:sign*unitsAbs,base_rate:rate,reason:type==='overclaim'?'ลด OT เบิกเกินย้อนหลัง':'OT ตกเบิกย้อนหลัง',note,status:'pending',created_by:staffId(),updated_at:new Date().toISOString()};
    busy(true,'กำลังบันทึกรายการปรับยอด');try{const {error}=await DB().from('ot_adjustments').insert(payload);if(error)throw error;cache.delete(apply);toast(`บันทึก ${payload.reason} ของ ${nick(person(sid))} แล้ว`);form.reset();form.querySelector('[name="source_month"]').value=apply;form.querySelector('[name="apply_month"]').value=apply;syncAdjustmentPreview(form);await hydrate();}catch(err){toast(err?.message||'บันทึกไม่สำเร็จ','error');}finally{busy(false);}
  }
  async function voidAdjustment(id){if(!admin()||!id)return;busy(true,'กำลังยกเลิกรายการ');try{const {error}=await DB().from('ot_adjustments').update({status:'void',updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;cache.clear();toast('ยกเลิกรายการปรับยอดแล้ว');await hydrate();}catch(err){toast(err?.message||'ยกเลิกไม่สำเร็จ','error');}finally{busy(false);}}

  function updateCount(){const grid=document.getElementById('v527ParticipantGrid');const c=document.getElementById('v527SelectedCount');if(grid&&c){const v=String(grid.querySelectorAll('input[type="checkbox"]:checked').length);if(c.textContent!==v)c.textContent=v;}}
  function refreshParticipantStatuses(){const form=document.getElementById('v527ActivityForm');const area=document.getElementById('v527ParticipantArea');if(!form||!area)return;const date=form.querySelector('[name="work_date"]')?.value||today(),selected=new Set([...area.querySelectorAll('input:checked')].map(x=>String(x.value)));area.innerHTML=participantGrid(date);area.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=selected.has(String(x.value)));updateCount();}
  async function saveActivity(form){
    if(!admin())return;const fd=new FormData(form),date=String(fd.get('work_date')||'').slice(0,10),hours=Number(fd.get('hours')||0),title=String(fd.get('title')||'').trim(),note=String(fd.get('note')||'').trim(),ids=[...form.querySelectorAll('input[name="participants"]:checked')].map(x=>String(x.value));if(!date||!Number.isFinite(hours)||hours<=0||!title)return toast('กรุณาระบุวันที่ ชั่วโมง และชื่อกิจกรรม','error');if(!ids.length)return toast('กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน','error');
    const key=eventHash(`${date}|${hours}|${title.toLowerCase().replace(/\s+/g,' ')}`),marker=`[V527_EVENT=${key}]`,db=DB();busy(true,'กำลังบันทึก OT กิจกรรม');
    try{
      const {data:existing,error:qerr}=await db.from('ot_requests').select('id,staff_id,note').eq('work_date',date).eq('reason','ประชุม / กิจกรรมร่วม').in('staff_id',ids);if(qerr)throw qerr;
      const duplicated=new Set((existing||[]).filter(r=>String(r.note||'').includes(marker)).map(r=>String(r.staff_id))),todo=ids.filter(id=>!duplicated.has(id));
      if(!todo.length)throw new Error('รายการกิจกรรมนี้ถูกบันทึกให้ผู้ที่เลือกครบแล้ว ไม่มีการสร้างซ้ำ');
      const rows=todo.map(id=>({staff_id:id,work_date:date,start_time:'00:00',end_time:'00:00',reason:'ประชุม / กิจกรรมร่วม',note:`${marker} | [OT_RATE_TYPE=${rateTypeFor(id)}] | จำนวนเวลา OT: ${hours} ชั่วโมง | กิจกรรม: ${title}${note?` | ${note}`:''}`.slice(0,900),status:'อนุมัติ',device:`${VERSION} admin group activity`.slice(0,250)}));
      const {error}=await db.from('ot_requests').insert(rows);if(error)throw error;
      try{await window.cnmiV316?.loadPageData?.('ot',{force:true});}catch(_){}
      toast(`บันทึก OT กิจกรรม ${todo.length} คน${duplicated.size?` • ข้ามรายการซ้ำ ${duplicated.size} คน`:''}`);try{renderPage();}catch(_){}
    }catch(err){toast(err?.message||'บันทึกกิจกรรมไม่สำเร็จ','error');}finally{busy(false);}
  }

  document.addEventListener('click',e=>{
    const mode=e.target?.closest?.('[data-v527-mode]');if(mode){e.preventDefault();S().v527ExtraMode=mode.dataset.v527Mode;try{renderPage();}catch(_){}return;}
    const all=e.target?.closest?.('[data-v527-select-all]');if(all){e.preventDefault();document.querySelectorAll('#v527ParticipantGrid [data-v527-person]:not(.v527-filtered) input[type="checkbox"]').forEach(x=>x.checked=true);updateCount();return;}
    const clear=e.target?.closest?.('[data-v527-clear-all]');if(clear){e.preventDefault();document.querySelectorAll('#v527ParticipantGrid input[type="checkbox"]').forEach(x=>x.checked=false);updateCount();return;}
    const voidBtn=e.target?.closest?.('[data-v527-void]');if(voidBtn){e.preventDefault();voidAdjustment(voidBtn.dataset.v527Void);}
  },true);
  document.addEventListener('submit',e=>{if(e.target?.id==='v527AdjustmentForm'){e.preventDefault();e.stopPropagation();saveAdjustment(e.target);}if(e.target?.id==='v527ActivityForm'){e.preventDefault();e.stopPropagation();saveActivity(e.target);}},true);
  document.addEventListener('input',e=>{if(e.target?.closest?.('#v527AdjustmentForm')){if(e.target.name==='hr_units')e.target.dataset.edited='1';syncAdjustmentPreview(e.target.closest('form'));}if(e.target?.id==='v527ParticipantSearch'){const q=String(e.target.value||'').trim().toLowerCase();document.querySelectorAll('#v527ParticipantGrid [data-v527-person]').forEach(el=>{const hide=q&&!String(el.dataset.name||'').includes(q);el.classList.toggle('v527-filtered',hide);});}if(e.target?.matches?.('#v527ParticipantGrid input[type="checkbox"]'))updateCount();},true);
  document.addEventListener('change',e=>{if(e.target?.closest?.('#v527AdjustmentForm'))syncAdjustmentPreview(e.target.closest('form'));if(e.target?.closest?.('#v527ActivityForm')&&e.target.name==='work_date')refreshParticipantStatuses();if(e.target?.id==='otMoneyMonthV241'){cache.clear();setTimeout(hydrate,120);}},true);

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;const chip=document.querySelector('.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');if(chip){if(chip.textContent!=='v527')chip.textContent='v527';chip.title='OT Adjustment Ledger + Group Activity';chip.classList.add('v527-version-chip');}}
  let queued=false;function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateVersion();syncAdjustmentPreview(document.getElementById('v527AdjustmentForm'));updateCount();hydrate();});}
  function start(){decorateVersion();queue();const content=document.getElementById('pageContent');if(content)new MutationObserver(ms=>{for(const m of ms){if(m.addedNodes?.length){queue();break;}}}).observe(content,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV527AdjustmentLedger={version:VERSION,fetchAdjustments,refresh:async()=>{cache.clear();await hydrate();}};
  console.info(`[${VERSION}] loaded`);
})();
