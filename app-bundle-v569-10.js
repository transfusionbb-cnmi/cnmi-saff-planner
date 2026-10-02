
/* Original source: patch-v526-sidebar-navigation-hotfix.js */
try {
/* CNMI Staff Planner V526 — Sidebar Navigation Hotfix
 * Prevents V517 busy feedback from treating sidebar tree navigation as action buttons.
 * Also clears any stale busy UI inside #mainNav and marks tree buttons as navigation-safe.
 * UI/navigation only. No business-rule or DB changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V526_NAV_HOTFIX__) return;
  window.__CNMI_V526_NAV_HOTFIX__=true;
  const VERSION='V526_SIDEBAR_NAVIGATION_HOTFIX';

  function markNavigation(root=document){
    const nav=root?.id==='mainNav'?root:document.getElementById('mainNav');
    if(!nav) return;
    nav.querySelectorAll('button[data-v523-submenu-toggle],button[data-v523-ot-item],button[data-v524-tree-toggle],button[data-v524-child-key],button[data-v528-extra-toggle],button[data-v528-extra-mode]').forEach(btn=>{
      /* Empty data-page keeps V517 from treating it as an action; base handler ignores empty value. */
      if(!btn.hasAttribute('data-page')) btn.setAttribute('data-page','');
      btn.classList.remove('v517-action-busy');
      btn.removeAttribute('aria-busy');
      if(btn.dataset.v517OriginalHtml!=null){
        btn.innerHTML=btn.dataset.v517OriginalHtml;
        delete btn.dataset.v517OriginalHtml;
      }
      delete btn.dataset.v517Busy;
    });
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){
      if(chip.classList.contains('v528-version-chip')||chip.classList.contains('v527-version-chip')) return;
      chip.textContent='v526';
      chip.title='Sidebar navigation hotfix';
      chip.classList.add('v526-version-chip');
    }
  }

  let queued=false;
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      markNavigation();
      decorateVersion();
    });
  }

  function start(){
    markNavigation();
    decorateVersion();
    const nav=document.getElementById('mainNav');
    if(nav){
      new MutationObserver(muts=>{
        for(const m of muts){
          if(m.addedNodes?.length || m.type==='attributes'){queue();break;}
        }
      }).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-busy']});
    }
    window.addEventListener('pageshow',queue);
    window.addEventListener('hashchange',queue);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  window.cnmiV526={version:VERSION,apply:queue};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v526-sidebar-navigation-hotfix.js", error); }
;

/* Original source: patch-v527-ot-adjustment-ledger.js */
try {
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
      const rows=todo.map(id=>({staff_id:id,work_date:date,end_time:'00:00',reason:'ประชุม / กิจกรรมร่วม',note:`${marker} | [OT_RATE_TYPE=${rateTypeFor(id)}] | จำนวนเวลา OT: ${hours} ชั่วโมง | กิจกรรม: ${title}${note?` | ${note}`:''}`.slice(0,900),status:'อนุมัติ',device:`${VERSION} admin group activity`.slice(0,250)}));
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

} catch (error) { console.error("[v569] patch-v527-ot-adjustment-ledger.js", error); }
;

/* Original source: patch-v528-ot-sidebar-subtree-leave-status.js */
try {
/* CNMI Staff Planner V528 — OT Sidebar Subtree + Leave Status
 * - Replaces V527's page tabs with a nested Sidebar Tree under "ขอ OT เพิ่มแทนเจ้าหน้าที่".
 * - Adds 3 sub-items: real OT / shortfall-overclaim / meeting-activity OT.
 * - Meeting/activity participant cards show both roster duty and leave period (morning/afternoon/full day).
 * - Leave/duty statuses are informational only; Admin may still select the person.
 * UI/navigation + leave context only. No schema/business-rule changes beyond V527.
 */
(function(){
  'use strict';
  if(window.__CNMI_V528_OT_SIDEBAR_SUBTREE__) return;
  window.__CNMI_V528_OT_SIDEBAR_SUBTREE__=true;
  const VERSION='V528_OT_SIDEBAR_SUBTREE_LEAVE_STATUS';
  const MODE_KEY='cnmi-v528-admin-extra-mode';
  const BRANCH_KEY='cnmi-v528-admin-extra-open';
  const leaveCache=new Map();

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{return window.sb||(typeof sb!=='undefined'?sb:null);}catch(_){return null;}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ssGet(k,d=''){try{return sessionStorage.getItem(k)||d;}catch(_){return d;}}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){}}
  function activeMode(){
    const raw=String(S().v527ExtraMode||ssGet(MODE_KEY,'work'));
    return ['work','adjustment','activity'].includes(raw)?raw:'work';
  }
  function setMode(mode){
    const m=['work','adjustment','activity'].includes(mode)?mode:'work';
    S().v527ExtraMode=m;ssSet(MODE_KEY,m);ssSet(BRANCH_KEY,'1');
  }
  function svg(kind){
    const a='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      real:`<svg ${a}><path d="M12 3v18M3 12h18"></path></svg>`,
      adjust:`<svg ${a}><path d="M4 7h16M7 4v6M4 17h16M17 14v6"></path></svg>`,
      activity:`<svg ${a}><path d="M4 20v-2a4 4 0 0 1 4-4h3"></path><circle cx="9" cy="7" r="3"></circle><path d="M15 8h5M17.5 5.5v5"></path><path d="M15 16h5"></path></svg>`
    };
    return map[kind]||map.real;
  }
  const MODES=[
    ['work','ขอ OT เพิ่มแทนเจ้าหน้าที่ตามจริง','real'],
    ['adjustment','ตกเบิก / ลดเบิกเกิน','adjust'],
    ['activity','ขอ OT สำหรับประชุม / กิจกรรมร่วม','activity']
  ];

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    if(window.__CNMI_V529_OT_ADJUSTMENT_VISIBILITY__) return;
    const chip=document.querySelector('.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){
      if(chip.textContent!=='v528') chip.textContent='v528';
      chip.title='OT Sidebar Subtree + Leave Status';
      chip.classList.add('v528-version-chip');
    }
  }

  function subtreeHtml(){
    const mode=activeMode();
    return `<div class="v528-extra-tree" data-v528-extra-tree>
      <button type="button" class="v523-subitem v528-extra-parent ${S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'?'active-parent':''}" data-v528-extra-toggle aria-expanded="true" data-page="">
        <span class="v523-branch-icon">${svg('real')}</span><span class="v528-extra-parent-label">ขอ OT เพิ่มแทนเจ้าหน้าที่</span><span class="v528-extra-caret" aria-hidden="true">›</span>
      </button>
      <div class="v528-extra-submenu open" data-v528-extra-submenu aria-hidden="false">
        ${MODES.map(([id,label,kind])=>`<button type="button" class="v528-extra-item ${S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'&&mode===id?'active':''}" data-v528-extra-mode="${id}" data-page="" aria-current="${S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'&&mode===id?'page':'false'}"><span class="v528-extra-icon">${svg(kind)}</span><span>${esc(label)}</span></button>`).join('')}
      </div>
    </div>`;
  }

  function installSubtree(){
    if(!isAdminSafe()) return;
    const otTree=document.querySelector('.v523-nav-tree');
    if(!otTree) return;
    const sub=otTree.querySelector('.v523-nav-submenu');
    if(!sub) return;
    let branch=sub.querySelector('[data-v528-extra-tree]');
    if(!branch){
      const old=sub.querySelector('[data-v523-ot-item="admin-extra"]');
      if(!old) return;
      const wrap=document.createElement('div');
      wrap.innerHTML=subtreeHtml();
      branch=wrap.firstElementChild;
      old.replaceWith(branch);
    }
    refreshSubtree(branch);
  }

  function refreshSubtree(branch=document.querySelector('[data-v528-extra-tree]')){
    if(!branch) return;
    const isPage=S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra';
    const parent=branch.querySelector('[data-v528-extra-toggle]');
    const submenu=branch.querySelector('[data-v528-extra-submenu]');
    const open=isPage||ssGet(BRANCH_KEY,'1')==='1';
    parent?.classList.toggle('active-parent',isPage);
    parent?.setAttribute('aria-expanded',open?'true':'false');
    submenu?.classList.toggle('open',open);
    submenu?.setAttribute('aria-hidden',open?'false':'true');
    const mode=activeMode();
    branch.querySelectorAll('[data-v528-extra-mode]').forEach(btn=>{
      const yes=isPage&&btn.dataset.v528ExtraMode===mode;
      btn.classList.toggle('active',yes);
      btn.setAttribute('aria-current',yes?'page':'false');
    });
  }

  function normalizePeriod(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(/ครึ่งเช้า|เช้า|morning/.test(raw)) return 'ครึ่งเช้า';
    if(/ครึ่งบ่าย|บ่าย|afternoon/.test(raw)) return 'ครึ่งบ่าย';
    return 'เต็มวัน';
  }
  function leaveType(row){
    const raw=String(row?.type||row?.leave_type||'ลา').trim();
    if(!raw||raw==='ไม่รับเวร') return 'ลา';
    return raw;
  }
  function leaveActive(row){
    const st=String(row?.status||'').toLowerCase();
    if(/reject|rejected|cancel|cancelled|ไม่อนุมัติ|ยกเลิก/.test(st)) return false;
    const t=String(row?.type||row?.leave_type||'');
    return t!=='ไม่รับเวร';
  }

  async function fetchLeaves(date){
    const d=String(date||'').slice(0,10);if(!d)return [];
    if(leaveCache.has(d)) return leaveCache.get(d);
    let rows=[];
    try{
      const db=DB();
      if(db?.from){
        const {data,error}=await db.from('leave_requests').select('staff_id,type,leave_period,start_date,end_date,status').lte('start_date',d).gte('end_date',d);
        if(error) throw error;
        rows=(data||[]).filter(leaveActive);
      }
    }catch(err){
      rows=(S().leaves||[]).filter(r=>{
        const a=String(r.start_date||'').slice(0,10),b=String(r.end_date||r.start_date||'').slice(0,10);
        return leaveActive(r)&&a&&b&&d>=a&&d<=b;
      });
    }
    leaveCache.set(d,rows);return rows;
  }

  async function decorateParticipantLeaves(){
    const form=document.getElementById('v527ActivityForm');
    const grid=document.getElementById('v527ParticipantGrid');
    if(!form||!grid) return;
    const date=String(form.querySelector('[name="work_date"]')?.value||'').slice(0,10);
    if(!date) return;
    const leaves=await fetchLeaves(date);
    if(!document.body.contains(grid)) return;
    const byStaff=new Map();
    for(const r of leaves){
      const id=String(r.staff_id||'');if(!id)continue;
      if(!byStaff.has(id))byStaff.set(id,[]);
      byStaff.get(id).push(r);
    }
    grid.querySelectorAll('[data-v527-person]').forEach(card=>{
      const id=String(card.querySelector('input[name="participants"]')?.value||'');
      const small=card.querySelector('.v527-person-main small');if(!small)return;
      const list=byStaff.get(id)||[];
      const desired=[...new Set(list.map(r=>`${leaveType(r)} • ${normalizePeriod(r)}`))];
      const existing=[...small.querySelectorAll('.v528-leave-chip')].map(x=>String(x.textContent||'').trim());
      const same=desired.length===existing.length&&desired.every((x,i)=>x===existing[i]);
      if(!same){
        small.querySelectorAll('.v528-leave-chip').forEach(x=>x.remove());
        /* V527 may have rendered a leave chip without period; replace only leave-related chips. */
        small.querySelectorAll('.v527-status-chip').forEach(x=>{if(/ลา/.test(String(x.textContent||''))&&!/อยู่เวร/.test(String(x.textContent||'')))x.remove();});
        if(desired.length){
          if(small.classList.contains('muted')){small.classList.remove('muted');small.textContent='';}
          small.querySelectorAll('.muted').forEach(x=>x.remove());
          for(const label of desired){
            const span=document.createElement('span');span.className='v527-status-chip v528-leave-chip';span.textContent=label;small.appendChild(span);
          }
        }
      }
      /* If no duty and no leave, keep compact neutral text without rewriting it repeatedly. */
      if(!desired.length&&!small.querySelector('.v527-status-chip')&&!String(small.textContent||'').trim()){
        small.className='muted';small.textContent='ไม่มีเวร/ลาในวันนี้';
      }
    });
  }

  function hidePageTabs(){
    document.querySelectorAll('.v527-mode-card').forEach(el=>el.classList.add('v528-hidden-mode-tabs'));
  }

  function apply(){
    decorateVersion();
    installSubtree();
    refreshSubtree();
    hidePageTabs();
    if(S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'&&activeMode()==='activity') decorateParticipantLeaves();
  }

  /* Restore the last selected admin-extra mode before the first OT render. */
  if(isAdminSafe() && !S().v527ExtraMode) S().v527ExtraMode=ssGet(MODE_KEY,'work');

  document.addEventListener('click',function(e){
    const toggle=e.target?.closest?.('[data-v528-extra-toggle]');
    if(toggle){
      e.preventDefault();e.stopPropagation();
      const branch=toggle.closest('[data-v528-extra-tree]');
      const submenu=branch?.querySelector('[data-v528-extra-submenu]');
      const open=toggle.getAttribute('aria-expanded')!=='true';
      toggle.setAttribute('aria-expanded',open?'true':'false');
      submenu?.classList.toggle('open',open);submenu?.setAttribute('aria-hidden',open?'false':'true');ssSet(BRANCH_KEY,open?'1':'0');
      return;
    }
    const otherOtItem=e.target?.closest?.('[data-v523-ot-item]');
    if(otherOtItem && String(otherOtItem.dataset.v523OtItem||'')!=='admin-extra'){
      ssSet(BRANCH_KEY,'0');
      const branch=document.querySelector('[data-v528-extra-tree]');
      const parent=branch?.querySelector('[data-v528-extra-toggle]');
      const submenu=branch?.querySelector('[data-v528-extra-submenu]');
      parent?.setAttribute('aria-expanded','false');
      submenu?.classList.remove('open');
      submenu?.setAttribute('aria-hidden','true');
    }
    const item=e.target?.closest?.('[data-v528-extra-mode]');
    if(item){
      e.preventDefault();e.stopPropagation();
      const mode=String(item.dataset.v528ExtraMode||'work');setMode(mode);
      S().page='ot';S().otMenuV369='admin-extra';S().otGroupV522='ot';
      try{sessionStorage.setItem('cnmi-v523-ot-open','1');sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');}catch(_){}
      try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:'ot'}}));}catch(_){}
      const sidebar=document.getElementById('sidebar');
      if(sidebar&&window.matchMedia('(max-width:820px)').matches){sidebar.classList.remove('open');document.body.classList.remove('sidebar-open');}
      try{renderPage();}catch(_){try{window.renderPage?.();}catch(__){}}
      return;
    }
  },true);

  document.addEventListener('change',function(e){
    if(e.target?.closest?.('#v527ActivityForm')&&e.target.name==='work_date'){
      const d=String(e.target.value||'').slice(0,10);if(d)leaveCache.delete(d);
      setTimeout(decorateParticipantLeaves,80);
    }
  },true);

  let queued=false;
  function queue(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  function start(){
    apply();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(ms=>{for(const m of ms){if(m.addedNodes?.length){queue();break;}}}).observe(nav,{childList:true,subtree:true});
    const content=document.getElementById('pageContent');
    if(content)new MutationObserver(ms=>{for(const m of ms){if(m.addedNodes?.length){queue();break;}}}).observe(content,{childList:true,subtree:true});
    const chip=document.querySelector('.sidebar-foot');
    if(chip)new MutationObserver(()=>decorateVersion()).observe(chip,{childList:true,subtree:true,characterData:true});
    window.addEventListener('hashchange',queue);window.addEventListener('pageshow',queue);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV528={version:VERSION,apply,decorateParticipantLeaves};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v528-ot-sidebar-subtree-leave-status.js", error); }
;

/* Original source: patch-v529-ot-adjustment-visibility.js */
try {
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
  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
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

} catch (error) { console.error("[v569] patch-v529-ot-adjustment-visibility.js", error); }
;

/* Original source: patch-v532-export-snapshot-preflight-lock.js */
try {
/* CNMI Staff Planner V532 — Export Guard + Locked Snapshot
 * 1) Pre-export validation: Staff_Total = HR_OT = copy per employee.
 * 2) Freeze immutable batch snapshot in Supabase at export time.
 * 3) Direct rollback of exported batches is disabled; corrections use OT Adjustment Ledger.
 * No OT calculation/rate/carry formula changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V532_EXPORT_GUARD__) return;
  window.__CNMI_V532_EXPORT_GUARD__=true;
  const VERSION='V532_EXPORT_SNAPSHOT_PREFLIGHT_LOCK';

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{return window.sb||(typeof sb!=='undefined'?sb:null);}catch(_){return null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function round2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  function round4(v){return Math.round((Number(v||0)+Number.EPSILON)*10000)/10000;}
  function staffId(){try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||null;}catch(_){return S()?.profile?.id||null;}}
  function staffName(id){const p=(S().staff||[]).find(x=>String(x.id)===String(id))||{};return p.nickname||p.full_name||p.name||id||'-';}
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console.info(msg);}}
  function stable(value){
    if(Array.isArray(value)) return value.map(stable);
    if(value&&typeof value==='object') return Object.keys(value).sort().reduce((o,k)=>{o[k]=stable(value[k]);return o;},{});
    return value;
  }
  async function sha256(value){
    const text=JSON.stringify(stable(value));
    try{
      const data=new TextEncoder().encode(text),digest=await crypto.subtle.digest('SHA-256',data);
      return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(_){
      let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return `fnv-${(h>>>0).toString(16)}`;
    }
  }
  function sheetRows(wb,name){
    try{const ws=wb?.Sheets?.[name];return ws&&window.XLSX?XLSX.utils.sheet_to_json(ws,{defval:null,raw:true}):[];}catch(_){return [];}
  }
  function countBy(rows,key){
    const map=new Map();
    for(const r of rows||[]){const v=String(r?.[key]??'').trim();if(!v)continue;map.set(v,(map.get(v)||0)+1);}return map;
  }
  function closeEnough(a,b,tol=0.01){return Math.abs(Number(a||0)-Number(b||0))<=tol;}

  function preflightReport(ctx){
    const totals=Array.isArray(ctx?.totals)?ctx.totals:[];
    const allocation=ctx?.allocation||{rows:[]};
    const wb=ctx?.workbook;
    const hrRows=sheetRows(wb,'HR_OT');
    const copyRows=sheetRows(wb,'copy');
    const staffRows=sheetRows(wb,'Staff_Total');
    const hrByCode=countBy(hrRows,'no');
    const copyByCode=countBy(copyRows,'no');
    const allocByStaff=new Map();
    (allocation.rows||[]).forEach(r=>{const id=String(r.staff_id||'');if(id)allocByStaff.set(id,(allocByStaff.get(id)||0)+1);});
    const staffByCode=new Map((staffRows||[]).filter(r=>r?.['รหัสพนักงาน']).map(r=>[String(r['รหัสพนักงาน']).trim(),r]));
    const details=[],errors=[],warnings=[];
    let expectedRows=0,totalClaimed=0,totalMoney=0;
    for(const t of totals){
      const sid=String(t.staff_id||''),code=String(t.employeeCode||'').trim(),expected=Math.max(0,Number(t.claimedUnits||0));
      const alloc=Number(allocByStaff.get(sid)||0),hr=Number(hrByCode.get(code)||0),copy=Number(copyByCode.get(code)||0),staffRow=staffByCode.get(code)||null;
      const staffUnits=staffRow?Number(staffRow['จำนวนเวร 8 ชม.']||0):NaN;
      const staffClaimed=staffRow?Number(staffRow['เบิก HR รอบนี้']||0):NaN;
      const staffMoney=staffRow?Number(staffRow['ยอดเงินที่เบิก HR รอบนี้']||staffRow['คำนวณเป็นเงิน']||0):NaN;
      const expectedMoney=round2(Number(t.claimed||0)*Number(t.baseRate||0));
      expectedRows+=expected;totalClaimed+=Number(t.claimed||0);totalMoney+=Number(t.money||expectedMoney||0);
      const row={staff_id:sid,name:staffName(sid),employee_code:code,expected_units:expected,allocation_rows:alloc,hr_ot_rows:hr,copy_rows:copy,staff_total_units:Number.isFinite(staffUnits)?staffUnits:null,claimed_hours:Number(t.claimed||0),staff_total_claimed:Number.isFinite(staffClaimed)?staffClaimed:null,money:Number(t.money||0),staff_total_money:Number.isFinite(staffMoney)?staffMoney:null,carry_in:Number(t.carryIn||0),carry_out:Number(t.carry||0),adjustment_units:Number(t.adjustmentUnits||0)};
      details.push(row);
      if(!code) errors.push(`${row.name}: ไม่มีรหัสพนักงาน`);
      if(expected!==alloc) errors.push(`${row.name}: Summary ${expected} เวร แต่ allocation ${alloc} เวร`);
      if(expected!==hr) errors.push(`${row.name}: Summary ${expected} เวร แต่ HR_OT ${hr} แถว`);
      if(expected!==copy) errors.push(`${row.name}: Summary ${expected} เวร แต่ copy ${copy} แถว`);
      if(staffRow&&Number.isFinite(staffUnits)&&expected!==staffUnits) errors.push(`${row.name}: Staff_Total ${staffUnits} เวร ไม่ตรง Summary ${expected}`);
      if(staffRow&&Number.isFinite(staffClaimed)&&!closeEnough(staffClaimed,Number(t.claimed||0))) errors.push(`${row.name}: Staff_Total ${staffClaimed} ชม. ไม่ตรงเบิก ${Number(t.claimed||0)} ชม.`);
      if(staffRow&&Number.isFinite(staffMoney)&&!closeEnough(staffMoney,Number(t.money||expectedMoney))) errors.push(`${row.name}: เงิน Staff_Total ${staffMoney} ไม่ตรง ${Number(t.money||expectedMoney)}`);
      if(Number(t.unallocatedUnits||0)>0) warnings.push(`${row.name}: มี ${Number(t.unallocatedUnits)} เวรที่จัด dummy ไม่ได้และถูกทบต่อ`);
    }
    if(hrRows.length!==expectedRows) errors.push(`HR_OT รวม ${hrRows.length} แถว แต่ Summary รวม ${expectedRows} เวร`);
    if(copyRows.length!==expectedRows) errors.push(`copy รวม ${copyRows.length} แถว แต่ Summary รวม ${expectedRows} เวร`);
    const knownCodes=new Set(totals.map(t=>String(t.employeeCode||'').trim()).filter(Boolean));
    for(const [code,n] of hrByCode){if(!knownCodes.has(code))errors.push(`HR_OT มีรหัส ${code} จำนวน ${n} แถวที่ไม่อยู่ใน Staff_Total รอบนี้`);}
    for(const [code,n] of copyByCode){if(!knownCodes.has(code))errors.push(`copy มีรหัส ${code} จำนวน ${n} แถวที่ไม่อยู่ใน Staff_Total รอบนี้`);}
    return {ok:errors.length===0,errors,warnings,details,hr_row_count:hrRows.length,copy_row_count:copyRows.length,expected_row_count:expectedRows,total_claimed_hours:round4(totalClaimed),total_money:round2(totalMoney)};
  }

  function snapshotPayload(ctx,report){
    const d=ctx?.data||{};
    return {
      version:VERSION,
      batch_id:ctx.batchId,
      filename:ctx.filename,
      source:d.source||ctx.source||{},
      cycle:d.cycle||ctx.cycle||{},
      generated_at:new Date().toISOString(),
      preflight:{ok:report.ok,warnings:report.warnings,hr_row_count:report.hr_row_count,copy_row_count:report.copy_row_count,expected_row_count:report.expected_row_count,total_claimed_hours:report.total_claimed_hours,total_money:report.total_money},
      staff:report.details,
      source_ot_ids:(d.rows||[]).map(r=>String(r.id||'')).filter(Boolean),
      adjustment_ids:(d.adjustments||[]).map(r=>String(r.id||'')).filter(Boolean)
    };
  }

  async function upsertSnapshot(ctx,report,status='prepared',extra={}){
    const db=DB();if(!db?.from) throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const payload=snapshotPayload(ctx,report),hash=await sha256(payload),source=ctx?.data?.source||ctx?.source||{},cycle=ctx?.data?.cycle||ctx?.cycle||{};
    const row={batch_id:ctx.batchId,source_month:String(source.month||'').slice(0,7),source_start:source.start,source_end:source.end,dummy_start:cycle.start,dummy_end:cycle.end,filename:ctx.filename,snapshot_hash:hash,staff_count:report.details.length,hr_row_count:report.hr_row_count,total_claimed_hours:report.total_claimed_hours,total_money:report.total_money,status,snapshot:payload,exported_by:staffId(),updated_at:new Date().toISOString(),...extra};
    const {error}=await db.from('ot_export_snapshots').upsert(row,{onConflict:'batch_id'});
    if(error){
      const msg=String(error.message||error);
      if(/ot_export_snapshots|42P01|does not exist|schema cache/i.test(msg)) throw new Error('ยังไม่ได้ติดตั้ง V532 กรุณารัน SQL_V532_OT_EXPORT_SNAPSHOT_GUARD.sql ใน Supabase ก่อน Export');
      throw error;
    }
    return {row,payload,hash};
  }

  async function preExport(ctx){
    const report=preflightReport(ctx);
    if(!report.ok){
      const first=report.errors.slice(0,8).join('\n• ');
      throw new Error(`V532 หยุด Export เพราะยอดไม่ตรงกัน\n• ${first}${report.errors.length>8?`\n• และอีก ${report.errors.length-8} จุด`:''}`);
    }
    if(report.warnings.length){
      const msg=`Pre-Export ผ่าน แต่มีข้อควรตรวจสอบ:\n• ${report.warnings.join('\n• ')}\n\nต้องการ Export ต่อหรือไม่?`;
      const ok=typeof confirmDialog==='function'?await confirmDialog(msg,'V532 Pre-Export Check'):window.confirm(msg);
      if(!ok) throw new Error('ยกเลิก Export เพื่อกลับไปตรวจสอบข้อมูล');
    }
    await upsertSnapshot(ctx,report,'prepared');
    window.__CNMI_V532_LAST_EXPORT__={ctx,report};
    return report;
  }
  async function postExport(ctx){
    const memo=window.__CNMI_V532_LAST_EXPORT__;
    const report=memo?.ctx?.batchId===ctx.batchId?memo.report:preflightReport(ctx);
    await upsertSnapshot(ctx,report,'locked',{exported_at:new Date().toISOString()});
    window.__CNMI_V532_LAST_EXPORT__=null;
    toast(`🔒 Batch ${ctx.batchId} ถูกล็อก Snapshot แล้ว • ${report.hr_row_count} เวร • ${report.total_money.toLocaleString('th-TH',{maximumFractionDigits:2})} บาท`);
  }
  async function exportFailed(ctx,err){
    try{
      const memo=window.__CNMI_V532_LAST_EXPORT__,report=memo?.report||preflightReport(ctx);
      await upsertSnapshot(ctx,report,'failed',{revision_note:String(err?.message||err||'Export failed').slice(0,500)});
    }catch(_){ }
    window.__CNMI_V532_LAST_EXPORT__=null;
  }

  function goAdjustment(){
    const s=S();s.page='ot';s.otMenuV369='admin-extra';s.v527ExtraMode='adjustment';s.otGroupV522='ot';
    try{sessionStorage.setItem('cnmi-v528-admin-extra-mode','adjustment');sessionStorage.setItem('cnmi-v528-admin-extra-open','1');sessionStorage.setItem('cnmi-v523-ot-open','1');sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');}catch(_){ }
    try{renderPage();}catch(_){try{window.renderPage?.();}catch(__){} }
  }
  async function handleLegacyRevert(ids){
    const msg='Batch ที่เคย Export ถูกล็อกเพื่อป้องกันยอดย้อนหลังเปลี่ยนค่ะ\n\nถ้าต้องแก้ยอด ให้สร้าง “ตกเบิก / ลดเบิกเกิน” เป็น Revision แทน โดยไม่แก้ OT/Carry ของ Batch เดิม';
    if(typeof confirmDialog==='function') await confirmDialog(msg,'🔒 Batch Locked'); else window.alert(msg);
    goAdjustment();
    return false;
  }

  async function viewSnapshot(batchId){
    const db=DB();if(!db?.from)return toast('ไม่พบการเชื่อมต่อ Supabase','error');
    const {data,error}=await db.from('ot_export_snapshots').select('*').eq('batch_id',batchId).maybeSingle();
    if(error){const msg=String(error.message||error);if(/ot_export_snapshots|42P01|does not exist|schema cache/i.test(msg))return toast('กรุณารัน SQL V532 ก่อนใช้งาน Snapshot','error');return toast(msg,'error');}
    if(!data)return toast('Batch นี้เป็นข้อมูลเก่าก่อน V532 จึงยังไม่มี Snapshot ที่ล็อก','error');
    const staff=Array.isArray(data.snapshot?.staff)?data.snapshot.staff:[];
    const rows=staff.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.employee_code)}</td><td>${esc(r.claimed_hours)}</td><td>${esc(r.expected_units)}</td><td>${Number(r.money||0).toLocaleString('th-TH',{maximumFractionDigits:2})}</td><td>${esc(r.carry_in)} → ${esc(r.carry_out)}</td></tr>`).join('');
    const html=`<div class="v532-snapshot-modal"><h3>🔒 Snapshot Batch ${esc(batchId)}</h3><p class="hint">${esc(data.filename)}<br>Checksum: <code>${esc(data.snapshot_hash)}</code></p><div class="table-wrap"><table><thead><tr><th>คน</th><th>รหัส</th><th>เบิก HR ชม.</th><th>เวร 8 ชม.</th><th>เงิน</th><th>ทบเข้า → ทบออก</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    if(typeof showModal==='function')return showModal(html);
    const w=window.open('','_blank','width=980,height=720');if(w){w.document.write(`<meta charset="utf-8"><title>Snapshot ${esc(batchId)}</title>${html}`);w.document.close();}
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip&&chip.textContent!=='v532'){chip.textContent='v532';chip.title='Export Guard + Locked Snapshot';chip.classList.add('v532-version-chip');}
  }

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(previousRenderOtPage&&!previousRenderOtPage.__v532Wrapped){
    const wrapped=function renderOtPageV532(){
      let html=String(previousRenderOtPage.apply(this,arguments)||'');
      html=html.replace(/ตีกลับเฉพาะชื่อนี้/g,'สร้างรายการปรับยอด').replace(/ตีกลับรายการนี้/g,'สร้างรายการปรับยอด');
      html=html.replace(/data-v318-revert-selected-batch=/g,'data-v532-adjust-batch=').replace(/data-v318-revert-row=/g,'data-v532-adjust-row=');
      html=html.replace(/<button class="danger-btn" type="button" data-v318-revert-whole-batch="([^"]+)">ตีกลับทั้ง Batch<\/button>/g,'<button class="ghost-btn" type="button" data-v532-view-snapshot="$1">🔒 ดู Snapshot ที่ล็อก</button>');
      html=html.replace(/รายการที่ Export แล้วจะมาอยู่หน้านี้ และสามารถตีกลับเป็น Pending ได้/g,'รายการที่ Export แล้วถูกล็อกเป็นหลักฐาน • หากต้องแก้ให้ใช้ ตกเบิก / ลดเบิกเกิน เป็น Revision');
      html=html.replace(/ปุ่มตีกลับจะรีเซ็ตเป็น Pending เพื่อ Export ใหม่ได้/g,'Batch ถูกล็อก • ไม่แก้ Carry/OT ย้อนหลัง • ใช้ Adjustment เป็น Revision');
      if(/data-export-hr-v318/.test(html)&&!html.includes('v532-export-guard-note')){
        html=html.replace(/(<button[^>]+data-export-hr-v318[^>]*>[^<]*<\/button>)/,`$1<div class="notice compact v532-export-guard-note"><b>V532 Pre-Export Guard</b> • ก่อนดาวน์โหลด ระบบจะตรวจรายคนว่า Staff_Total = HR_OT = copy และจะบันทึก Snapshot แบบล็อกอัตโนมัติ ถ้าไม่ตรงแม้แต่คนเดียวจะไม่ Export</div>`);
      }
      return html;
    };
    wrapped.__v532Wrapped=true;
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage&&!previousRenderPage.__v532VersionWrapped){
    const wrappedPage=function renderPageV532(){const out=previousRenderPage.apply(this,arguments);setTimeout(decorateVersion,0);return out;};
    wrappedPage.__v532VersionWrapped=true;
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  document.addEventListener('click',function(e){
    const view=e.target?.closest?.('[data-v532-view-snapshot]');if(view){e.preventDefault();e.stopPropagation();viewSnapshot(view.dataset.v532ViewSnapshot);return;}
    const adj=e.target?.closest?.('[data-v532-adjust-row],[data-v532-adjust-batch]');if(adj){e.preventDefault();e.stopPropagation();goAdjustment();return;}
  },true);

  function start(){decorateVersion();window.addEventListener('pageshow',decorateVersion);window.addEventListener('hashchange',()=>setTimeout(decorateVersion,50));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV532ExportGuard={version:VERSION,preflightReport,preExport,postExport,exportFailed,lockedHistory:true,handleLegacyRevert,viewSnapshot,goAdjustment};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v532-export-snapshot-preflight-lock.js", error); }
;

/* Original source: patch-v533-hr-pdf-reconciliation.js */
try {
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

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;const chip=document.querySelector('.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');if(chip&&chip.textContent!=='v533'){chip.textContent='v533';chip.title='HR PDF Reconciliation + Adjustment-aware Export Preview';chip.classList.add('v533-version-chip');}}

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

} catch (error) { console.error("[v569] patch-v533-hr-pdf-reconciliation.js", error); }
;

/* Original source: patch-v534-manual-hr-pdf-check.js */
try {
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

} catch (error) { console.error("[v569] patch-v534-manual-hr-pdf-check.js", error); }
;

/* Original source: patch-v535-roster-admin-compact-staff-density.js */
try {
/* CNMI Staff Planner V535 — Admin roster compact density like Staff view
 * UI-only patch. No roster/business logic changes.
 * - Admin monthly roster uses the same compact day-cell density as Staff view.
 * - Keep sticky staff name, drag/drop and tap assignment behavior.
 * - Remove-button is visually quiet on desktop and appears on hover/focus.
 */
(function(){
  'use strict';
  if(window.__CNMI_V535_ROSTER_COMPACT__) return;
  window.__CNMI_V535_ROSTER_COMPACT__=true;
  const VERSION='V535_ROSTER_ADMIN_COMPACT_STAFF_DENSITY';

  function injectStyle(){
    if(document.getElementById('v535-roster-compact-style')) return;
    const s=document.createElement('style');
    s.id='v535-roster-compact-style';
    s.textContent=`
      /* V535: make Admin roster matrix visually match Staff monthly roster density */
      .v275-roster-wrap{
        border-radius:10px!important;
        max-height:72vh!important;
        scrollbar-gutter:stable;
      }
      .v275-roster-table{
        width:max-content!important;
        min-width:max-content!important;
        table-layout:fixed!important;
        font-size:9px!important;
      }
      .v275-roster-table th:not(.v275-roster-name),
      .v275-roster-table td{
        width:52px!important;
        min-width:52px!important;
        max-width:52px!important;
        padding:2px!important;
        box-sizing:border-box!important;
      }
      .v275-roster-table thead th{
        height:34px!important;
        min-height:34px!important;
        padding:2px 1px!important;
        line-height:1.05!important;
      }
      .v275-roster-name{
        width:68px!important;
        min-width:68px!important;
        max-width:68px!important;
        padding:2px 4px!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }
      .v275-roster-name b{
        font-size:9px!important;
        line-height:1.05!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      .v275-roster-date b{font-size:9.5px!important;line-height:1!important}
      .v275-roster-date small{font-size:7px!important;line-height:1!important;margin-top:1px!important}
      .v275-roster-date em{
        font-size:6.5px!important;
        line-height:1!important;
        max-width:48px!important;
        margin:1px auto 0!important;
      }
      .v275-roster-day{
        height:32px!important;
        min-height:32px!important;
        padding:1px!important;
      }
      .v275-roster-drop{
        min-height:28px!important;
        height:100%!important;
        padding:0!important;
        gap:1px!important;
        border-radius:4px!important;
      }
      .v275-duty-list{
        gap:1px!important;
        flex-wrap:wrap!important;
        align-items:center!important;
        justify-content:center!important;
        line-height:1!important;
      }
      .v275-duty-pill{
        max-width:48px!important;
        min-height:14px!important;
        padding:2px 4px!important;
        gap:1px!important;
        font-size:8px!important;
        line-height:1!important;
        border-radius:999px!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
        box-sizing:border-box!important;
      }
      .v275-duty-pill>b{
        min-width:0!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      .v275-roster-drop .mini-status,
      .v275-roster-drop .v432-compact-leave,
      .v275-roster-drop .v438-compact-no-duty{
        max-width:48px!important;
        min-height:0!important;
        padding:1px 3px!important;
        margin:0 auto!important;
        font-size:7.5px!important;
        line-height:1!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      /* Desktop: keep delete affordance available but do not let × dominate every cell */
      @media (hover:hover) and (pointer:fine){
        .v275-duty-pill button[data-v275-remove-duty]{
          width:0!important;
          height:12px!important;
          min-width:0!important;
          opacity:0!important;
          overflow:hidden!important;
          padding:0!important;
          transition:opacity .12s ease,width .12s ease!important;
        }
        .v275-duty-pill:hover button[data-v275-remove-duty],
        .v275-duty-pill:focus-within button[data-v275-remove-duty]{
          width:12px!important;
          min-width:12px!important;
          opacity:1!important;
        }
      }
      /* Touch: keep a small delete target because hover is unavailable */
      @media (hover:none), (pointer:coarse){
        .v275-roster-table th:not(.v275-roster-name),
        .v275-roster-table td{width:48px!important;min-width:48px!important;max-width:48px!important}
        .v275-roster-name{width:64px!important;min-width:64px!important;max-width:64px!important}
        .v275-duty-pill{max-width:44px!important;font-size:7.5px!important;padding:2px 3px!important}
        .v275-duty-pill button[data-v275-remove-duty]{width:11px!important;height:11px!important;min-width:11px!important;font-size:8px!important;line-height:10px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function compactDutyLabels(){
    document.querySelectorAll('.v275-roster-wrap .v275-duty-pill[data-v275-existing-duty]').forEach(pill=>{
      const code=String(pill.dataset.v275ExistingDuty||'').trim();
      const label=pill.querySelector('b');
      if(!code||!label) return;
      try{
        if(typeof window.dutyDisplayLabel==='function') label.textContent=window.dutyDisplayLabel(code);
        else if(typeof dutyDisplayLabel==='function') label.textContent=dutyDisplayLabel(code);
        else label.textContent=code;
      }catch(_){ label.textContent=code; }
      pill.title=code;
    });
  }

  function updateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip&&chip.textContent!=='v535'){
      chip.textContent='v535';
      chip.title='Admin roster compact like Staff view';
      chip.classList.add('v535-version-chip');
    }
  }

  function decorate(){
    injectStyle();
    compactDutyLabels();
    updateVersion();
  }

  const previous=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previous&&!previous.__v535Wrapped){
    const wrapped=function(){
      const out=previous.apply(this,arguments);
      setTimeout(decorate,0);
      setTimeout(decorate,180);
      return out;
    };
    wrapped.__v535Wrapped=true;
    try{window.renderPage=wrapped;renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(decorate,0),{once:true});
  setTimeout(decorate,160);
  window.cnmiV535={version:VERSION,decorate};
  console.info(`[${VERSION}] compact Admin roster loaded`);
})();

} catch (error) { console.error("[v569] patch-v535-roster-admin-compact-staff-density.js", error); }
;

/* Original source: patch-v540-submenu-deep-link-routing.js */
try {
/* CNMI Staff Planner V540 — Submenu Deep-link Routing
 * Gives every Sidebar submenu a stable URL while keeping V515 base routing intact.
 * Same-page subviews use ?section=... (and ?mode=... for nested OT request modes).
 * Existing submenu pages that already have their own route keep that route.
 * Browser Back/Forward and Refresh restore the selected submenu.
 * Navigation/UI only. No DB/schema/business-rule changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V540_SUBMENU_DEEP_LINK_ROUTING__) return;
  window.__CNMI_V540_SUBMENU_DEEP_LINK_ROUTING__=true;
  const VERSION='V540_SUBMENU_DEEP_LINK_ROUTING';

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function text(v){return String(v==null?'':v).trim();}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){}}
  function validMonth(v){return /^\d{4}-\d{2}$/.test(text(v));}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){try{return !!window.isAdmin?.();}catch(__){return false;}}}

  const OT_ADMIN_SECTION_TO_ID={
    'confirm-duty':'admin-duty',
    'request-extra':'admin-extra',
    'staff-tracking':'tracking',
    'approval':'approve',
    'monthly-summary':'summary',
    'staff-detail':'admin-details',
    'hr-export':'export',
    'export-history':'history'
  };
  const OT_STAFF_SECTION_TO_ID={
    'my-duty':'staff-track',
    'confirm-duty':'staff-confirm',
    'request-extra':'staff-extra',
    'my-ot':'staff-list',
    'claim-detail':'staff-details',
    'monthly-summary':'staff-summary'
  };
  const OT_ADMIN_ID_TO_SECTION=Object.fromEntries(Object.entries(OT_ADMIN_SECTION_TO_ID).map(([k,v])=>[v,k]));
  const OT_STAFF_ID_TO_SECTION=Object.fromEntries(Object.entries(OT_STAFF_SECTION_TO_ID).map(([k,v])=>[v,k]));

  const BASE_DEFAULTS={
    leave:'form',
    profile:'profile',
    activities:'create',
    intern:'add',
    'physician-consult':'daytime',
    users:'manage',
    ot:null
  };

  const TITLE_BY_URL={
    'leave:form':'บันทึกลา / ไม่รับเวร',
    'leave:history':'ประวัติการลา',
    'profile:profile':'ข้อมูลและขอแก้ไข',
    'profile:requests':'คำขอล่าสุดของฉัน',
    'activities:create':'เพิ่มกิจกรรม',
    'activities:search':'ค้นหากิจกรรม',
    'intern:add':'เพิ่มรายชื่อผู้ฝึก',
    'intern:mentor':'กำหนดช่วงพี่เลี้ยง',
    'intern:registry':'ทะเบียนผู้ฝึก',
    'intern:history':'ประวัติพี่เลี้ยง',
    'physician-consult:daytime':'แพทย์ Consult ในเวลา',
    'physician-consult:oncall':'แพทย์ Consult นอกเวลา / วันหยุด',
    'physician-consult:override':'แก้ตารางแพทย์เฉพาะวัน',
    'physician-consult:list':'รายการตารางแพทย์',
    'users:manage':'จัดการเจ้าหน้าที่',
    'users:add':'เพิ่มผู้ใช้งานใหม่',
    'ot:confirm-duty':'ยืนยันเวร',
    'ot:request-extra':'ขอ OT เพิ่ม',
    'ot:staff-tracking':'ติดตามเจ้าหน้าที่',
    'ot:approval':'อนุมัติ OT',
    'ot:monthly-summary':'สรุป OT รายเดือน',
    'ot:staff-detail':'รายละเอียด OT เจ้าหน้าที่',
    'ot:hr-export':'Export HR',
    'ot:export-history':'ประวัติ Export',
    'ot:my-duty':'ติดตามเวรของฉัน',
    'ot:my-ot':'รายการ OT ของฉัน',
    'ot:claim-detail':'รายละเอียดเบิก'
  };

  function parseHash(){
    const raw=String(location.hash||'');
    const h=raw.replace(/^#\/?/,'');
    const q=h.indexOf('?');
    const route=decodeURIComponent((q>=0?h.slice(0,q):h)||'dashboard');
    const params=new URLSearchParams(q>=0?h.slice(q+1):'');
    return {route,params};
  }

  function setLeaveView(v){
    const next=['form','history'].includes(v)?v:'form';
    S().v524LeaveView=next;ssSet('cnmi-v524-leave-view',next);
  }
  function setProfileView(v){
    const next=['profile','requests'].includes(v)?v:'profile';
    S().v524ProfileView=next;ssSet('cnmi-v524-profile-view',next);
  }
  function setActivityView(v){
    const next=['create','search'].includes(v)?v:'create';
    S().v524ActivityView=next;ssSet('cnmi-v524-activity-view',next);
  }
  function setInternView(v){
    const next=['add','mentor','registry','history'].includes(v)?v:'add';
    S().v524InternView=next;ssSet('cnmi-v524-intern-view',next);
  }
  function setPhysicianView(v){
    const next=['daytime','oncall','override','list'].includes(v)?v:'daytime';
    S().v524PhysicianView=next;ssSet('cnmi-v524-physician-view',next);
  }
  function setUsersView(v){
    const next=['manage','add'].includes(v)?v:'manage';
    S().v524UsersView=next;ssSet('cnmi-v524-users-view',next);
  }
  function otGroupFor(id){
    if(['admin-duty','tracking','staff-track','staff-confirm'].includes(id)) return 'duty';
    if(['admin-extra','approve','staff-extra','staff-list'].includes(id)) return 'ot';
    return 'report';
  }
  function setOtView(section,mode,month){
    const admin=isAdminSafe();
    const map=admin?OT_ADMIN_SECTION_TO_ID:OT_STAFF_SECTION_TO_ID;
    const fallback=admin?'admin-duty':'staff-track';
    const id=map[section]||fallback;
    S().otMenuV369=id;
    S().otGroupV522=otGroupFor(id);
    if(id==='admin-extra'&&admin){
      const m=['work','adjustment','activity'].includes(mode)?mode:'work';
      S().v527ExtraMode=m;ssSet('cnmi-v528-admin-extra-mode',m);ssSet('cnmi-v528-admin-extra-open','1');
    }
    if(validMonth(month)){
      S().otMenuMonthV369=month;
      S().otMoneyMonthV241=month;
      S().otSourceMonthV241=month;
      S().myDutyMonthFilter=month;
    }
  }

  function applyFromUrl(){
    const {route,params}=parseHash();
    const section=text(params.get('section'));
    if(route==='leave') setLeaveView(section||BASE_DEFAULTS.leave);
    else if(route==='profile') setProfileView(section||BASE_DEFAULTS.profile);
    else if(route==='activities') setActivityView(section||BASE_DEFAULTS.activities);
    else if(route==='intern') setInternView(section||BASE_DEFAULTS.intern);
    else if(route==='physician-consult') setPhysicianView(section||BASE_DEFAULTS['physician-consult']);
    else if(route==='users') setUsersView(section||BASE_DEFAULTS.users);
    else if(route==='ot') setOtView(section,text(params.get('mode')),text(params.get('month')));
  }

  function currentOtMonth(){
    const st=S();
    const raw=st.otMenuMonthV369||st.otSourceMonthV241||st.otMoneyMonthV241||st.myDutyMonthFilter||'';
    return validMonth(raw)?String(raw).slice(0,7):'';
  }
  function currentSection(page){
    const st=S();
    if(page==='leave') return st.editingLeaveId?'form':(['form','history'].includes(st.v524LeaveView)?st.v524LeaveView:'form');
    if(page==='myProfile') return ['profile','requests'].includes(st.v524ProfileView)?st.v524ProfileView:'profile';
    if(page==='activities') return st.editingActivityId?'create':(['create','search'].includes(st.v524ActivityView)?st.v524ActivityView:'create');
    if(page==='internManagement') return ['add','mentor','registry','history'].includes(st.v524InternView)?st.v524InternView:'add';
    if(page==='physicianConsult') return ['daytime','oncall','override','list'].includes(st.v524PhysicianView)?st.v524PhysicianView:'daytime';
    if(page==='users') return ['manage','add'].includes(st.v524UsersView)?st.v524UsersView:'manage';
    if(page==='ot'){
      const id=text(st.otMenuV369)||(isAdminSafe()?'admin-duty':'staff-track');
      const map=isAdminSafe()?OT_ADMIN_ID_TO_SECTION:OT_STAFF_ID_TO_SECTION;
      return map[id]||(isAdminSafe()?'confirm-duty':'my-duty');
    }
    return '';
  }

  function baseHashFor(page){
    try{if(window.cnmiV515?.hashFor)return window.cnmiV515.hashFor(page);}catch(_){ }
    const fallback={
      leave:'leave',myProfile:'profile',activities:'activities',internManagement:'intern',
      physicianConsult:'physician-consult',users:'users',ot:'ot'
    };
    return `#/${fallback[page]||page||'dashboard'}`;
  }

  function canonicalHash(){
    const st=S(),page=text(st.page)||'dashboard';
    let base=baseHashFor(page);
    const q=base.indexOf('?');
    const route=q>=0?base.slice(0,q):base;
    const params=new URLSearchParams(q>=0?base.slice(q+1):'');
    const section=currentSection(page);
    if(section) params.set('section',section); else params.delete('section');
    if(page==='ot'){
      const month=currentOtMonth();if(month)params.set('month',month);else params.delete('month');
      if(text(st.otMenuV369)==='admin-extra'&&isAdminSafe()){
        const mode=['work','adjustment','activity'].includes(text(st.v527ExtraMode))?text(st.v527ExtraMode):'work';
        params.set('mode',mode);
      }else params.delete('mode');
    }else{
      params.delete('mode');
    }
    const qs=params.toString();
    return `${route}${qs?`?${qs}`:''}`;
  }

  let pendingPush=false;
  let pendingPreviousHash='';
  function markSubmenuNavigation(e){
    const t=e.target?.closest?.('[data-v523-ot-item],[data-v524-child-key],[data-v528-extra-mode]');
    if(!t) return;
    pendingPush=true;
    pendingPreviousHash=String(location.hash||'');
  }
  document.addEventListener('click',markSubmenuNavigation,true);

  function setCanonicalUrl({push=false}={}){
    const target=canonicalHash();
    const current=String(location.hash||'');
    if(current===target) return;
    try{
      if(push){
        /* V515's render wrapper may replace the current submenu URL with the base page
           just before we run. Restore the previous submenu entry first so Back works. */
        if(pendingPreviousHash&&pendingPreviousHash!==target&&current!==pendingPreviousHash){
          history.replaceState({cnmiV540:true},'',pendingPreviousHash);
        }
        if(String(location.hash||'')!==target) history.pushState({cnmiV540:true},'',target);
      }else{
        history.replaceState({cnmiV540:true},'',target);
      }
    }catch(_){
      location.hash=target;
    }
  }

  function titleForCurrent(){
    const {route,params}=parseHash();
    const section=text(params.get('section'));
    const label=TITLE_BY_URL[`${route}:${section}`];
    if(label) document.title=`${label} | Staff Planner`;
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v539-version-chip,.v535-version-chip,.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip) return;
    chip.textContent='v540';
    chip.title='Submenu Deep-link Routing';
    chip.classList.add('v540-version-chip');
  }

  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'&&!previousRender.__v540Wrapped){
    const wrapped=function(){
      const out=previousRender.apply(this,arguments);
      const doPush=pendingPush;
      pendingPush=false;
      try{setCanonicalUrl({push:doPush});}catch(_){ }
      pendingPreviousHash='';
      try{titleForCurrent();decorateVersion();}catch(_){ }
      setTimeout(()=>{try{setCanonicalUrl({push:false});titleForCurrent();decorateVersion();}catch(_){ }},0);
      return out;
    };
    wrapped.__v540Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  function onHistoryNavigation(){
    pendingPush=false;pendingPreviousHash='';
    applyFromUrl();
    /* V515 applies page + loads data a few ms later. Re-apply section state after it. */
    setTimeout(()=>{applyFromUrl();try{if(S().profile&&typeof renderPage==='function')renderPage();}catch(_){ }},12);
  }
  window.addEventListener('hashchange',onHistoryNavigation);
  window.addEventListener('popstate',onHistoryNavigation);

  document.addEventListener('change',function(e){
    if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='otSourceMonthV241'){
      setTimeout(()=>setCanonicalUrl({push:false}),0);
    }
  },true);

  function start(){
    applyFromUrl();
    setTimeout(()=>{try{setCanonicalUrl({push:false});titleForCurrent();decorateVersion();}catch(_){ }},0);
    setTimeout(()=>{try{applyFromUrl();setCanonicalUrl({push:false});decorateVersion();}catch(_){ }},180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pageshow',()=>setTimeout(start,0));

  window.cnmiV540={version:VERSION,applyFromUrl,canonicalHash,setCanonicalUrl};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v540-submenu-deep-link-routing.js", error); }
;

/* Original source: patch-v541-exact-action-deep-link-routing.js */
try {
/* CNMI Staff Planner V541 — Exact Action Deep-link Routing
 * Fixes shortcut/navigation actions that previously knew only the parent page,
 * causing grouped pages (especially OT) to open their first/default submenu.
 *
 * Main fixes:
 * - Dashboard Admin pending: OT pending -> OT approval (not confirm-duty).
 * - Dashboard Admin pending: leave cancellation -> leave history.
 * - Donor helper "go to OT" -> request-extra.
 * - Direct URL / Refresh / Back-Forward re-apply exact submenu BEFORE render,
 *   including admin-only OT sections even if V540 parsed the route before profile restore.
 *
 * Navigation/UI only. No database/schema/business-rule changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V541_EXACT_ACTION_DEEP_LINK_ROUTING__) return;
  window.__CNMI_V541_EXACT_ACTION_DEEP_LINK_ROUTING__=true;
  const VERSION='V541_EXACT_ACTION_DEEP_LINK_ROUTING';

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function text(v){return String(v==null?'':v).trim();}
  function validMonth(v){return /^\d{4}-\d{2}$/.test(text(v));}
  function monthEnd(key){const m=/^(\d{4})-(\d{2})$/.exec(text(key));if(!m)return'';return `${key}-${String(new Date(Number(m[1]),Number(m[2]),0).getDate()).padStart(2,'0')}`;}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){} }

  function actualAdmin(){
    try{if(typeof window.isActualAdminV167==='function')return !!window.isActualAdminV167();}catch(_){}
    const st=S(),role=text(st?.profile?.role).toLowerCase();
    return role==='admin';
  }
  function adminMode(){
    try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return actualAdmin();}
  }
  function forceAdminMode(){
    const st=S();if(!actualAdmin())return false;
    try{
      const id=st?.session?.user?.id||st?.profile?.user_id||st?.profile?.id||st?.profile?.email||'guest';
      st.viewAsMode='admin';
      localStorage.setItem(`cnmi_view_as_mode_${id}`,'admin');
    }catch(_){ }
    return true;
  }

  function parseHash(){
    const raw=String(location.hash||'');
    const h=raw.replace(/^#\/?/,'');
    const q=h.indexOf('?');
    const route=decodeURIComponent((q>=0?h.slice(0,q):h)||'dashboard');
    return {route,params:new URLSearchParams(q>=0?h.slice(q+1):'')};
  }

  function setOpenTree(id){
    try{
      const legacy=id==='ot'?'ot':`v524:${id}`;
      if(window.cnmiV542SidebarOwner?.setOpenTree){window.cnmiV542SidebarOwner.setOpenTree(legacy);return;}
      sessionStorage.setItem('cnmi-sidebar-tree-open-id',legacy);
      sessionStorage.setItem('cnmi-v536-sidebar-open-tree',legacy);
    }catch(_){ }
  }

  function setSimpleSubview(route,section){
    const st=S();
    if(route==='leave'){
      const v=['form','history'].includes(section)?section:'form';
      st.v524LeaveView=v;ssSet('cnmi-v524-leave-view',v);setOpenTree('leave');return true;
    }
    if(route==='profile'){
      const v=['profile','requests'].includes(section)?section:'profile';
      st.v524ProfileView=v;ssSet('cnmi-v524-profile-view',v);setOpenTree('profile');return true;
    }
    if(route==='activities'){
      const v=['create','search'].includes(section)?section:'create';
      st.v524ActivityView=v;ssSet('cnmi-v524-activity-view',v);setOpenTree('activities');return true;
    }
    if(route==='intern'){
      const v=['add','mentor','registry','history'].includes(section)?section:'add';
      st.v524InternView=v;ssSet('cnmi-v524-intern-view',v);setOpenTree('positions-admin');return true;
    }
    if(route==='physician-consult'){
      const v=['daytime','oncall','override','list'].includes(section)?section:'daytime';
      st.v524PhysicianView=v;ssSet('cnmi-v524-physician-view',v);setOpenTree('physician');return true;
    }
    if(route==='users'){
      const v=['manage','add'].includes(section)?section:'manage';
      st.v524UsersView=v;ssSet('cnmi-v524-users-view',v);setOpenTree('users');return true;
    }
    return false;
  }

  const ADMIN_OT={
    'confirm-duty':'admin-duty',
    'request-extra':'admin-extra',
    'staff-tracking':'tracking',
    'approval':'approve',
    'monthly-summary':'summary',
    'staff-detail':'admin-details',
    'hr-export':'export',
    'export-history':'history'
  };
  const STAFF_OT={
    'my-duty':'staff-track',
    'confirm-duty':'staff-confirm',
    'request-extra':'staff-extra',
    'my-ot':'staff-list',
    'claim-detail':'staff-details',
    'monthly-summary':'staff-summary'
  };
  const ADMIN_ONLY_SECTIONS=new Set(['staff-tracking','approval','staff-detail','hr-export','export-history']);
  const STAFF_ONLY_SECTIONS=new Set(['my-duty','my-ot','claim-detail']);

  function setOtSection(section,{month='',mode='',forceAdmin=false}={}){
    const st=S();
    const hasProfile=!!st?.profile;
    if(forceAdmin)forceAdminMode();

    let useAdmin=false;
    if(ADMIN_ONLY_SECTIONS.has(section)){
      if(hasProfile&&!actualAdmin()) return false;
      useAdmin=true;
      if(actualAdmin())forceAdminMode();
    }else if(STAFF_ONLY_SECTIONS.has(section)){
      useAdmin=false;
    }else{
      useAdmin=adminMode();
    }

    const id=(useAdmin?ADMIN_OT:STAFF_OT)[section] || (useAdmin?'admin-duty':'staff-track');
    st.otMenuV369=id;
    st.otGroupV522=(['admin-duty','tracking','staff-track','staff-confirm'].includes(id)?'duty':(['admin-extra','approve','staff-extra','staff-list'].includes(id)?'ot':'report'));
    setOpenTree('ot');

    if(id==='admin-extra'){
      const m=['work','adjustment','activity'].includes(mode)?mode:'work';
      st.v527ExtraMode=m;ssSet('cnmi-v528-admin-extra-mode',m);ssSet('cnmi-v528-admin-extra-open','1');
    }
    if(validMonth(month)){
      st.otMenuMonthV369=month;st.otMoneyMonthV241=month;st.otSourceMonthV241=month;st.myDutyMonthFilter=month;
      if(id==='approve'){
        st.otApprovalStatusFilter='รออนุมัติ';
        st.otApprovalStartDate=`${month}-01`;
        st.otApprovalEndDate=monthEnd(month);
      }
    }
    return true;
  }

  function applyExactHashState(){
    const {route,params}=parseHash();
    const section=text(params.get('section'));
    if(route==='ot'){
      if(section)setOtSection(section,{month:text(params.get('month')),mode:text(params.get('mode'))});
      return;
    }
    if(section)setSimpleSubview(route,section);
  }

  function exactOtHash(section,{month='',mode=''}={}){
    const p=new URLSearchParams();p.set('section',section);
    if(validMonth(month))p.set('month',month);
    if(mode)p.set('mode',mode);
    return `#/ot?${p.toString()}`;
  }

  function pushExactHash(hash){
    try{if(String(location.hash||'')!==hash)history.pushState({cnmiV541:true},'',hash);}catch(_){location.hash=hash;}
  }

  /* Window capture runs before V515/V460 document capture handlers. This means
     the exact subview is already selected when their normal navigation/render runs. */
  window.addEventListener('click',function(e){
    const target=e.target;

    const pending=target?.closest?.('[data-v460-open-page]');
    if(pending){
      const page=text(pending.getAttribute('data-v460-open-page'));
      const month=text(pending.getAttribute('data-v460-open-month'));
      if(page==='ot'){
        forceAdminMode();
        setOtSection('approval',{month,forceAdmin:true});
      }else if(page==='leave'){
        const st=S();st.v524LeaveView='history';ssSet('cnmi-v524-leave-view','history');setOpenTree('leave');
      }else if(page==='hr'){
        forceAdminMode();
      }else if(page==='profileRequests'||page==='donorHelpers'||page==='tradeRequests'){
        forceAdminMode();
      }
      return;
    }

    /* Donor-helper shortcuts explicitly say "ไปส่วนขอ OT". Open request-extra,
       not the first OT submenu. */
    const donorOt=target?.closest?.('[data-v327-go-ot],.donor-helper-ot-note [data-page="ot"]');
    if(donorOt){
      const st=S();const month=text(st.donorHelperMonthV327||st.donorHelperMonthV324||'');
      const admin=adminMode();
      setOtSection('request-extra',{month,mode:'work'});
      if(donorOt.hasAttribute('data-v327-go-ot')){
        pushExactHash(exactOtHash('request-extra',{month,mode:admin?'work':''}));
      }
      return;
    }
  },true);

  /* Re-apply exact URL intent before every render. V540 could parse an admin OT
     route before the restored profile/role existed, which made it choose a staff/default
     submenu. This pre-render pass makes direct links deterministic. */
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'&&!previousRender.__v541Wrapped){
    const wrapped=function renderPageV541(){
      try{applyExactHashState();}catch(_){ }
      const out=previousRender.apply(this,arguments);
      setTimeout(()=>{try{decorateVersion();}catch(_){ }},0);
      return out;
    };
    wrapped.__v541Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  function onHistory(){try{applyExactHashState();}catch(_){ }}
  window.addEventListener('hashchange',onHistory,true);
  window.addEventListener('popstate',onHistory,true);

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v540-version-chip,.v539-version-chip,.v535-version-chip,.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip)return;chip.textContent='v541';chip.title='Exact action deep-link routing';chip.classList.add('v541-version-chip');
  }

  function start(){
    try{applyExactHashState();}catch(_){ }
    setTimeout(()=>{try{applyExactHashState();decorateVersion();}catch(_){ }},0);
    setTimeout(()=>{try{applyExactHashState();decorateVersion();}catch(_){ }},180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pageshow',()=>setTimeout(start,0));

  window.cnmiV541={version:VERSION,applyExactHashState,setOtSection};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v541-exact-action-deep-link-routing.js", error); }
;

/* Original source: patch-v551-mobile-ui-clarity-safe.js */
try {
/* CNMI Staff Planner V551 — Mobile UI clarity, UI-only safe patch
   Scope only:
   1) restore staff colors in dashboard split-duty rows
   2) compact partial-trade labels in monthly roster
   3) keep those labels inside their own day cell
   4) normalize RACE phase typography on mobile
   5) make My Training open with a useful year automatically and show year before status
   No auth / PWA / service worker / roster / leave / OT / RACE assignment logic changes.
*/
(function(){
  'use strict';
  const VERSION='V551_MOBILE_UI_CLARITY_SAFE';
  if(window.__CNMI_V551_MOBILE_UI_CLARITY_SAFE__) return;
  window.__CNMI_V551_MOBILE_UI_CLARITY_SAFE__=true;

  function S(){ try{return window.state || state || {};}catch(_){return window.state||{};} }
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    catch(_){return String(v??'');}
  }
  function actorId(){
    try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||'';}
    catch(_){return S()?.profile?.id||'';}
  }
  function idEq(a,b){return String(a||'')===String(b||'');}
  function yearOf(value){
    const m=String(value||'').match(/^(\d{4})-/);
    if(m){const y=Number(m[1]);return Number.isInteger(y)?y:0;}
    const d=new Date(value||'');return Number.isFinite(d.getTime())?d.getFullYear():0;
  }
  function bestTrainingYear(){
    const s=S(),actor=actorId(),acts=Array.isArray(s.activities)?s.activities:[],records=Array.isArray(s.trainingRecords)?s.trainingRecords:[];
    const activityById=new Map(acts.map(a=>[String(a?.id||''),a]));
    const years=[];
    records.forEach(r=>{
      if(!r || r.is_included===false || r.form_type!=='existing' || !idEq(r.staff_id,actor)) return;
      const a=activityById.get(String(r.activity_id||''));
      const y=yearOf(a?.start_date);if(y>=2000&&y<=2200) years.push(y);
    });
    const current=new Date().getFullYear();
    if(years.includes(current)) return current;
    if(years.length) return Math.max(...years);
    return current;
  }
  function ensureTrainingYear(){
    const s=S();
    if(String(s?.page||'')!=='myTraining') return false;
    const y=Number(s.v407TrainingYear||0);
    if(Number.isInteger(y)&&y>=2000&&y<=2200) return false;
    const picked=bestTrainingYear();
    s.v407TrainingYear=String(picked);
    s.v396MyFrom=`${picked}-01-01`;
    s.v396MyTo=`${picked}-12-31`;
    if(!['รอกรอกข้อมูล','กรอกข้อมูลแล้ว','all'].includes(String(s.v402MyStatus||''))) s.v402MyStatus='รอกรอกข้อมูล';
    s.v417MyTrainingPage=1;
    return true;
  }

  function staffByVisibleName(name){
    const key=String(name||'').trim();if(!key)return null;
    const staff=Array.isArray(S()?.staff)?S().staff:[];
    return staff.find(x=>String(x?.nickname||'').trim()===key) || staff.find(x=>String(x?.full_name||'').trim()===key) || null;
  }
  function colorFor(st){
    try{return typeof staffColor==='function'?staffColor(st):st?.staff_color||st?.color||'#e8f3ff';}
    catch(_){return st?.staff_color||st?.color||'#e8f3ff';}
  }
  function textFor(bg){
    try{return typeof textColorFor==='function'?textColorFor(bg):'#203245';}
    catch(_){return '#203245';}
  }

  function fixDashboardSplitColors(root=document){
    root.querySelectorAll?.('.v548-duty-summary-line .staff-color-pill').forEach(pill=>{
      const st=staffByVisibleName(pill.textContent);if(!st)return;
      const bg=colorFor(st),fg=textFor(bg);
      pill.style.setProperty('--staff-bg',bg);
      pill.style.setProperty('--staff-fg',fg);
      pill.style.setProperty('background',bg,'important');
      pill.style.setProperty('background-color',bg,'important');
      pill.style.setProperty('color',fg,'important');
      pill.style.setProperty('border-color','rgba(31,50,69,.14)','important');
      pill.classList.add('v551-restored-staff-color');
    });
  }

  function compactReceivedText(full){
    const text=String(full||'').replace(/\s+/g,' ').trim();
    const m=text.match(/รับช่วง\s*(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
    if(m){
      let start=Number(m[1])*60+Number(m[2]),end=Number(m[3])*60+Number(m[4]);
      if(end<=start)end+=1440;
      const hours=Math.round((end-start)/60*100)/100;
      const h=Number.isInteger(hours)?String(hours):String(hours).replace(/\.0+$/,'');
      return `รับ ${h}ชม.`;
    }
    if(/^รับช่วง\s+/.test(text)) return text.replace(/^รับช่วง\s+/,'รับ ');
    return text;
  }
  function compactRosterHtml(html){
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      tpl.content.querySelectorAll('.clean-schedule-grid .clean-shift-pill.v217-received').forEach(btn=>{
        const full=String(btn.textContent||'').trim();if(!full)return;
        const short=compactReceivedText(full);
        btn.dataset.v551FullTradeLabel=full;
        btn.setAttribute('title',full);
        btn.setAttribute('aria-label',full);
        btn.textContent=short;
        btn.classList.add('v551-trade-compact');
      });
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] roster compact skipped`,err);return html;}
  }

  const previousGrid=window.renderGridView || (typeof renderGridView==='function'?renderGridView:null);
  if(typeof previousGrid==='function'){
    const wrappedGrid=function renderGridViewV551(){return compactRosterHtml(previousGrid.apply(this,arguments));};
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  function decorateTraining(root=document){
    if(String(S()?.page||'')!=='myTraining')return;
    const filters=root.querySelector?.('.v417-my-training-filters');
    if(filters){
      const year=filters.querySelector('#v407TrainingYear')?.closest('label');
      const status=filters.querySelector('#v402MyStatus')?.closest('label');
      const exp=filters.querySelector('.v402-export-wrap');
      if(year){year.classList.add('v551-training-year');year.style.order='1';}
      if(status){status.classList.add('v551-training-status');status.style.order='2';}
      if(exp){exp.classList.add('v551-training-export');exp.style.order='3';}
    }
    const card=root.querySelector?.('.v416-training-page');
    const hint=card?.querySelector('.section-title .hint');
    if(hint && hint.textContent!=='ระบบเลือกปีล่าสุดที่มีข้อมูลให้แล้ว • เปลี่ยนปีหรือสถานะได้ตามต้องการ') hint.textContent='ระบบเลือกปีล่าสุดที่มีข้อมูลให้แล้ว • เปลี่ยนปีหรือสถานะได้ตามต้องการ';
    card?.querySelectorAll?.('.v416-selection-prompt').forEach(box=>{
      if(S().v407TrainingYear) box.remove();
    });
  }

  function setVersion551(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      if(chip.textContent!=='v551') chip.textContent='v551';
      if(chip.title!=='Mobile UI clarity + training flow polish (V551)') chip.title='Mobile UI clarity + training flow polish (V551)';
    });
  }
  function applyUi(root=document){
    fixDashboardSplitColors(root);
    decorateTraining(root);
    setVersion551(root);
  }
  let queued=false;
  function queueUi(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;applyUi(document);});
  }

  const previousRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'){
    let retry=false;
    const wrappedPage=function renderPageV551(){
      let result=previousRenderPage.apply(this,arguments);
      if(!retry && String(S()?.page||'')==='myTraining' && ensureTrainingYear()){
        retry=true;
        try{result=previousRenderPage.apply(this,arguments);}finally{retry=false;}
      }
      queueUi();
      return result;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v551-mobile-ui-clarity-safe';
  style.textContent=`
    /* 1 — keep person colors visible in dashboard split-duty rows */
    .v548-duty-summary-line .staff-color-pill.v551-restored-staff-color{
      background:var(--staff-bg)!important;color:var(--staff-fg)!important;
      border-color:rgba(31,50,69,.14)!important;box-shadow:none!important
    }

    /* 2/3 — compact receive-part chips; never spill into the next day */
    .clean-schedule-grid td{min-width:0}
    .clean-schedule-grid .clean-cell-stack{max-width:100%;min-width:0;overflow:hidden}
    .clean-schedule-grid .clean-shift-pill.v551-trade-compact{
      display:inline-flex!important;align-items:center!important;justify-content:center!important;
      width:auto!important;max-width:100%!important;min-width:0!important;
      padding:2px 5px!important;margin:0 auto!important;border-radius:999px!important;
      font-size:10px!important;line-height:1.1!important;font-weight:850!important;
      white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
      box-sizing:border-box!important
    }

    /* 4 — RACE hierarchy: title only slightly larger than explanation */
    .v497-phase-tabs b{font-size:12px!important;line-height:1.2!important;font-weight:850!important}
    .v497-phase-tabs small{font-size:9.5px!important;line-height:1.35!important;font-weight:500!important;color:#73879a!important}
    @media(max-width:820px){
      .v497-phase-tabs b{font-size:12.5px!important}
      .v497-phase-tabs small{font-size:10.5px!important;line-height:1.35!important}
      .v497-phase-tabs button{padding:9px 10px!important}
      .clean-schedule-grid .clean-shift-pill.v551-trade-compact{font-size:9.5px!important;padding:2px 4px!important}
    }

    /* 5 — training: year first, then status, then export */
    .v417-my-training-filters{align-items:end!important}
    .v417-my-training-filters .v551-training-year{order:1}
    .v417-my-training-filters .v551-training-status{order:2}
    .v417-my-training-filters .v551-training-export{order:3}
    @media(max-width:820px){
      .v417-my-training-filters{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
      .v417-my-training-filters>label,.v417-my-training-filters>.v402-export-wrap{width:100%!important;min-width:0!important}
      .v417-my-training-filters select,.v417-my-training-filters button{width:100%!important}
    }
  `;
  document.head.appendChild(style);

  const start=()=>{
    applyUi(document);
    const root=document.getElementById('pageContent')||document.body;
    if(window.MutationObserver&&root){
      const obs=new MutationObserver(()=>queueUi());
      obs.observe(root,{childList:true,subtree:true});
      window.__CNMI_V551_UI_OBSERVER__=obs;
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v551-mobile-ui-clarity-safe.js", error); }
;

/* Original source: patch-v552-admin-leave-date-filter-sequence-continuity.js */
try {
/* CNMI Staff Planner V552 — Admin leave date filter + continuous leave sequence
   Scope:
   1) Admin leave history: add one-day overlap filter (วันที่ลา)
   2) Leave sequence: rank only active roster staff so visible roster ranks never skip
   UI/read-only calculation patch. No Auth/PWA/SW/Supabase schema/write changes.
*/
(function(){
  'use strict';
  const VERSION='V552_ADMIN_LEAVE_DATE_FILTER_SEQUENCE_CONTINUITY';
  if(window.__CNMI_V552_ADMIN_LEAVE_DATE_FILTER_SEQUENCE_CONTINUITY__) return;
  window.__CNMI_V552_ADMIN_LEAVE_DATE_FILTER_SEQUENCE_CONTINUITY__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function normDate(v){
    try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function overlaps(row,date){
    const d=normDate(date),a=normDate(row?.start_date),b=normDate(row?.end_date||row?.start_date);
    return !!d&&!!a&&!!b&&a<=d&&b>=d;
  }
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    catch(_){return String(v??'');}
  }

  /* ---------- 1. Admin date filter ---------- */
  const previousLeaveTable=window.renderLeaveTable||(typeof renderLeaveTable==='function'?renderLeaveTable:null);
  if(typeof previousLeaveTable==='function'){
    const wrappedTable=function renderLeaveTableV552(rows){
      let adjusted=Array.isArray(rows)?rows:[];
      const date=normDate(S()?.leaveFilterDateV552);
      if(isAdminSafe()&&date) adjusted=adjusted.filter(row=>overlaps(row,date));
      return previousLeaveTable.call(this,adjusted);
    };
    try{window.renderLeaveTable=renderLeaveTable=wrappedTable;}catch(_){window.renderLeaveTable=wrappedTable;}
  }

  function dateFilterHtml(){
    const value=normDate(S()?.leaveFilterDateV552);
    return `<label class="v552-leave-date-filter">วันที่ลา
      <span class="v552-date-input-row">
        <input type="date" id="leaveFilterDateV552" value="${esc(value)}" aria-label="กรองตามวันที่ลา">
        ${value?'<button type="button" class="tiny-btn v552-clear-date" data-v552-clear-leave-date title="ล้างตัวกรองวันที่">ล้าง</button>':''}
      </span>
    </label>`;
  }

  function injectDateFilter(html){
    let out=String(html||'');
    if(!isAdminSafe()||!out.includes('leave-filter-bar')) return out;
    if(!out.includes('id="leaveFilterDateV552"')){
      out=out.replace(
        /(<div class="leave-filter-bar compact-filter">)([\s\S]*?)(<\/div>)/i,
        (m,open,body,close)=>`${open}${body}${dateFilterHtml()}${close}`
      );
    }
    const date=normDate(S()?.leaveFilterDateV552);
    if(date&&!out.includes('data-v552-date-filter-note')){
      let thai=date;
      try{thai=typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){}
      const note=`<div class="v552-date-filter-note" data-v552-date-filter-note>กำลังแสดงรายการที่มีวันลาคร่อม <b>${esc(thai)}</b></div>`;
      out=out.replace(/(<div class="leave-filter-bar compact-filter">[\s\S]*?<\/div>)/i,`$1${note}`);
    }
    return out;
  }

  const previousLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof previousLeavePage==='function'){
    const wrappedPage=function renderLeavePageV552(){return injectDateFilter(previousLeavePage.apply(this,arguments));};
    try{window.renderLeavePage=renderLeavePage=wrappedPage;}catch(_){window.renderLeavePage=wrappedPage;}
  }

  document.addEventListener('change',function(e){
    const t=e.target;
    if(!t||t.id!=='leaveFilterDateV552') return;
    const s=S();s.leaveFilterDateV552=normDate(t.value);
    try{if(typeof renderPage==='function')renderPage();}catch(err){console.warn(`[${VERSION}] date filter render failed`,err);}
  },true);
  document.addEventListener('click',function(e){
    const btn=e.target?.closest?.('[data-v552-clear-leave-date]');
    if(!btn)return;
    e.preventDefault();
    const s=S();s.leaveFilterDateV552='';
    try{if(typeof renderPage==='function')renderPage();}catch(err){console.warn(`[${VERSION}] clear date render failed`,err);}
  },true);

  /* ---------- 2. Continuous leave sequence for operational roster ---------- */
  function effective(row){
    try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/cancel|delete|inactive|ยกเลิก/i.test(String(row?.status||''));}
    catch(_){return true;}
  }
  function actualLeave(row){
    if(!row||!effective(row))return false;
    let type='';
    try{type=typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){type=String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    return !!type&&type!=='ไม่รับเวร';
  }
  function rosterEligibleStaff(staffId){
    const list=Array.isArray(S()?.staff)?S().staff:[];
    const st=list.find(x=>String(x?.id||'')===String(staffId||''));
    if(!st)return false;
    try{return typeof isRosterEnabled==='function'?!!isRosterEnabled(st):st?.is_active!==false&&String(st?.staff_type||'')!=='แพทย์';}
    catch(_){return st?.is_active!==false&&String(st?.staff_type||'')!=='แพทย์';}
  }
  function submittedMs(row){
    try{
      const old=window.cnmiLeaveSequenceV431?.leaveSubmittedMs;
      if(typeof old==='function'){
        const n=Number(old(row));if(Number.isFinite(n))return n;
      }
    }catch(_){}
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt,row?.updated_at]){
      const n=Date.parse(String(v||''));if(Number.isFinite(n))return n;
    }
    return Number.POSITIVE_INFINITY;
  }
  function staffOrder(id){
    const list=Array.isArray(S()?.staff)?S().staff:[];
    const i=list.findIndex(x=>String(x?.id||'')===String(id||''));return i<0?99999:i;
  }
  function sequenceForDate(date){
    const d=normDate(date);if(!d)return [];
    const perStaff=new Map();
    (Array.isArray(S()?.leaves)?S().leaves:[]).forEach(row=>{
      if(!actualLeave(row)||!overlaps(row,d)||!rosterEligibleStaff(row?.staff_id))return;
      const sid=String(row?.staff_id||'');if(!sid)return;
      const prev=perStaff.get(sid);
      if(!prev||submittedMs(row)<submittedMs(prev))perStaff.set(sid,row);
    });
    const rows=[...perStaff.values()].sort((a,b)=>{
      const ta=submittedMs(a),tb=submittedMs(b);if(ta!==tb)return ta-tb;
      const oa=staffOrder(a?.staff_id),ob=staffOrder(b?.staff_id);if(oa!==ob)return oa-ob;
      return String(a?.id||'').localeCompare(String(b?.id||''),'th');
    });
    return rows.map((row,i)=>({row,rank:i+1,staff_id:String(row?.staff_id||''),submitted_ms:submittedMs(row)}));
  }
  function rankFor(row,date){
    if(!actualLeave(row)||!rosterEligibleStaff(row?.staff_id))return null;
    const sid=String(row?.staff_id||'');
    return sequenceForDate(date).find(x=>x.staff_id===sid)?.rank||null;
  }

  if(window.cnmiLeaveSequenceV431){
    window.cnmiLeaveSequenceV431.leaveSequenceForDate=sequenceForDate;
    window.cnmiLeaveSequenceV431.rankFor=rankFor;
  }

  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      chip.textContent='v552';
      chip.title='Admin leave date filter + continuous leave sequence (V552)';
    });
  }
  let queued=false;
  function queueVersion(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;setVersion(document);});}
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'){
    const wrappedRenderPage=function renderPageV552(){const r=previousRenderPage.apply(this,arguments);queueVersion();return r;};
    try{window.renderPage=renderPage=wrappedRenderPage;}catch(_){window.renderPage=wrappedRenderPage;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v552-admin-leave-date-sequence';
  style.textContent=`
    .v552-date-input-row{display:flex;align-items:center;gap:6px;min-width:0}
    .v552-date-input-row input{min-width:0;flex:1}
    .v552-clear-date{flex:0 0 auto;white-space:nowrap}
    .v552-date-filter-note{margin:-2px 0 10px;padding:7px 10px;border:1px solid #cfe6f8;background:#f3f9fe;border-radius:10px;color:#55758f;font-size:.82rem;font-weight:650}
    @media(max-width:820px){
      .leave-filter-bar.compact-filter .v552-leave-date-filter{grid-column:1/-1}
      .v552-date-filter-note{font-size:.78rem;margin-top:-1px}
    }
  `;
  document.head.appendChild(style);

  setVersion(document);
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v552-admin-leave-date-filter-sequence-continuity.js", error); }
;

/* Original source: patch-v553-late-leave-calendar-month-rule.js */
try {
/* CNMI Staff Planner V553 — Late leave calendar-month rule
   User rule:
   - Leave submitted BEFORE the leave month starts = normal leave, even if the roster is already published.
   - Leave submitted ON/AFTER day 1 of that leave month = "ลานอกตาราง".
   Examples:
     submit 21 Sep for 1 Oct  => normal leave
     submit 1 Oct for 5 Oct   => late leave / ลานอกตาราง
   Uses Asia/Bangkok for submission-date comparison. No schema / SQL / write changes.
*/
(function(){
  'use strict';
  const VERSION='V553_LATE_LEAVE_CALENDAR_MONTH_RULE';
  if(window.__CNMI_V553_LATE_LEAVE_CALENDAR_MONTH_RULE__) return;
  window.__CNMI_V553_LATE_LEAVE_CALENDAR_MONTH_RULE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function normDate(v){
    try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function effective(row){
    try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(String(row?.status||''));}
    catch(_){return true;}
  }
  function leaveType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function actualLeave(row){
    const type=leaveType(row);
    return !!row&&effective(row)&&!!type&&type!=='ไม่รับเวร';
  }
  function submissionRaw(row){
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt,row?.updated_at]){
      if(v!=null&&String(v).trim()) return v;
    }
    return '';
  }
  function bangkokDateKey(value){
    if(value==null||String(value).trim()==='')return '';
    const raw=String(value).trim();
    // Plain date is already an unambiguous calendar date.
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=new Date(raw);
    if(Number.isNaN(d.getTime()))return normDate(raw);
    try{
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
      const get=t=>parts.find(p=>p.type===t)?.value||'';
      const y=get('year'),m=get('month'),day=get('day');
      if(y&&m&&day)return `${y}-${m}-${day}`;
    }catch(_){ }
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function submissionDateKey(row){return bangkokDateKey(submissionRaw(row));}
  function monthStart(date){const d=normDate(date);return /^\d{4}-\d{2}-\d{2}$/.test(d)?`${d.slice(0,7)}-01`:'';}

  function isLateLeaveForDate(row,date){
    if(!actualLeave(row))return false;
    const start=monthStart(date),submitted=submissionDateKey(row);
    if(!start||!submitted)return false;
    // Main V553 rule: request reaches the system during (or after) the leave month.
    return submitted>=start;
  }
  function isLateLeave(row){
    if(!actualLeave(row))return false;
    const first=normDate(row?.start_date||row?.date);
    return !!first&&isLateLeaveForDate(row,first);
  }

  // Keep the established public helper name so all later UI patches automatically
  // use the corrected rule (Dashboard, position shortage, leave history, etc.).
  const lateApi=window.cnmiLateLeaveV430||{};
  lateApi.isLateLeaveForDate=isLateLeaveForDate;
  lateApi.isLateLeave=isLateLeave;
  lateApi.submissionDateKey=submissionDateKey;
  lateApi.rule='calendar-month-start-v553';
  window.cnmiLateLeaveV430=lateApi;
  window.cnmiLateLeaveV553={isLateLeaveForDate,isLateLeave,submissionDateKey,monthStart};

  function scheduleDates(month){
    try{return typeof scheduleMonthDates==='function'?scheduleMonthDates(month):[];}catch(_){return [];}
  }
  function activeLeave(staffId,date){
    try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}
  }
  function rosterStaff(staffList){
    return (staffList||[]).filter(st=>{try{return typeof isRosterEnabled==='function'?!!isRosterEnabled(st):true;}catch(_){return true;}});
  }

  /* Monthly roster: V430's old wrapper may already have stamped a roster-publish-based
     badge. Remove it from the table, then rebuild badges strictly from the V553 rule. */
  const previousGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof previousGrid==='function'){
    const wrappedGrid=function renderGridViewV553(staffList,assignments,key){
      let html=String(previousGrid.apply(this,arguments)||'');
      const month=String(key||S()?.monthKey||'').slice(0,7),dates=scheduleDates(month);
      if(!dates.length)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const table=tpl.content.querySelector('table.clean-schedule-grid,table#scheduleTable');
        if(!table)return html;
        table.querySelectorAll('.v430-late-leave-badge').forEach(n=>n.remove());
        table.querySelectorAll('.v430-late-leave-cell').forEach(n=>n.classList.remove('v430-late-leave-cell'));
        const bodyRows=[...table.querySelectorAll('tbody tr')],displayStaff=rosterStaff(staffList);
        bodyRows.forEach((tr,rowIndex)=>{
          const st=displayStaff[rowIndex];if(!st)return;
          const dateCells=[...tr.children].slice(-dates.length);
          dates.forEach((date,i)=>{
            const cell=dateCells[i],leave=cell?activeLeave(st.id,date):null;
            if(!cell||!leave||!isLateLeaveForDate(leave,date))return;
            const stack=cell.querySelector('.clean-cell-stack')||cell;
            if(!stack.querySelector('.v553-late-leave-badge'))stack.insertAdjacentHTML('beforeend','<span class="v430-late-leave-badge v553-late-leave-badge">ลานอกตาราง</span>');
            cell.classList.add('v430-late-leave-cell','v553-late-leave-cell');
          });
        });
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn(`[${VERSION}] roster decoration skipped`,err);}
      return html;
    };
    wrappedGrid.__v553Wrapped=true;
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  /* Calendar: remove any V430 suffix made by the old publication-date rule, then
     re-apply the marker with V553. This keeps both month cells and the day popup correct. */
  function stripLateText(title){
    return String(title||'')
      .replace(/\s*(?:·|•|—|-)\s*ลานอกตาราง\b/gi,'')
      .replace(/\s{2,}/g,' ')
      .trim();
  }
  const previousCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof previousCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV553(){
      const rows=previousCollect.apply(this,arguments)||[];
      return rows.map(e=>{
        if(!e?.raw||!actualLeave(e.raw))return e;
        const late=isLateLeaveForDate(e.raw,e.date),base=stripLateText(e.title);
        return {...e,title:late?`${base} · ลานอกตาราง`:base,lateLeaveV430:late,lateLeaveV553:late};
      });
    };
    wrappedCollect.__v553Wrapped=true;
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  /* Dashboard: downstream V511 reads cnmiLateLeaveV430 dynamically, so item-level
     badges are already rebuilt correctly. Only remove V430's old aggregate summary,
     which was calculated with the obsolete roster-publish rule. */
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrappedDashboard=function renderDashboardV553(){
      let html=String(previousDashboard.apply(this,arguments)||'');
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        tpl.content.querySelectorAll('.v430-late-summary').forEach(n=>n.remove());
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(_){ }
      return html;
    };
    wrappedDashboard.__v553Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      chip.textContent='v553';
      chip.title='Late leave = submitted during the leave month (V553)';
    });
  }
  let versionQueued=false;
  function queueVersion(){if(versionQueued)return;versionQueued=true;requestAnimationFrame(()=>{versionQueued=false;setVersion(document);});}
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'){
    const wrappedRenderPage=function renderPageV553(){const out=previousRenderPage.apply(this,arguments);queueVersion();return out;};
    try{window.renderPage=renderPage=wrappedRenderPage;}catch(_){window.renderPage=wrappedRenderPage;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v553-late-leave-calendar-month-rule';
  style.textContent=`
    .v553-late-leave-badge{font-weight:900}
    .v553-late-leave-cell{box-shadow:inset 0 0 0 1px rgba(245,158,11,.32)}
  `;
  document.head.appendChild(style);
  setVersion(document);
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v553-late-leave-calendar-month-rule.js", error); }
;

/* Original source: patch-v555-trade-freeze-hotfix.js */
try {
/* CNMI Staff Planner v555
   Trade request clarity + duplicate guard + personalized filters
   - Staff default: own name + pending receiver confirmation
   - Admin mode default: all people + waiting Admin
   - Show pending/admin status directly beside roster duty and block repeat selling
   - Fresh server-side open-request check before insert
   - Requester can cancel an open request
*/
(function(){
  'use strict';
  const VERSION='v555';
  const STATUS={
    pending:'pending',
    confirmed:'confirmed',
    completed:'completed',
    rejected:'rejected',
    cancelled:'cancelled'
  };
  const OPEN_STATUS=new Set([STATUS.pending,STATUS.confirmed]);

  function S(){ try{return state;}catch(_){return null;} }
  function esc(v){
    try{return escapeHtml(v==null?'':String(v));}
    catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function me(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.id||'');}}
  function adminMode(){try{return !!isAdmin();}catch(_){return false;}}
  function staffName(id){
    const st=(S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''));
    return st?.nickname||st?.full_name||st?.email||String(id||'');
  }
  function toast(msg){
    try{ if(typeof showToast==='function')showToast(msg); else window.alert(msg); }
    catch(_){ console.info(msg); }
  }
  function statusText(status){
    const s=String(status||'').toLowerCase();
    if(s===STATUS.pending)return '⏳ รอผู้รับเวรยืนยัน';
    if(s===STATUS.confirmed)return '🕒 รอ Admin';
    if(s===STATUS.completed)return '✓ ขายเวรสำเร็จ';
    if(s===STATUS.rejected)return '✕ ถูกปฏิเสธ';
    if(s==='cancelled'||s==='canceled')return 'ยกเลิกคำขอ';
    return status||'-';
  }
  function statusTone(status){
    const s=String(status||'').toLowerCase();
    if(s===STATUS.confirmed)return 'blue';
    if(s===STATUS.completed)return 'green';
    if(s===STATUS.rejected||s==='cancelled'||s==='canceled')return 'red';
    return 'orange';
  }
  function getModeKey(){return `${me()}|${adminMode()?'admin':'staff'}`;}
  function ensureDefaults(){
    const st=S(); if(!st)return;
    const key=getModeKey();
    if(st.v554TradeDefaultsKey!==key){
      st.v554TradeDefaultsKey=key;
      st.tradeFilterStatus=adminMode()?STATUS.confirmed:STATUS.pending;
      st.tradeFilterStaff=adminMode()?'':me();
    }
    if(!['',STATUS.pending,STATUS.confirmed,STATUS.completed,STATUS.rejected,'cancelled'].includes(String(st.tradeFilterStatus||''))){
      st.tradeFilterStatus=adminMode()?STATUS.confirmed:STATUS.pending;
    }
  }
  function assignmentFor(row,assignments=[]){
    try{return tradeAssignmentForDisplay(row,assignments);}catch(_){
      const id=String(row?.from_assignment_id||'');
      return (assignments||[]).find(a=>String(a?.id||'')===id)||(S()?.rosterAssignments||[]).find(a=>String(a?.id||'')===id)||null;
    }
  }
  function rowsForMonth(assignments=[]){
    const st=S(); if(!st)return [];
    return (st.tradeRequests||[]).filter(r=>{
      const a=assignmentFor(r,assignments);
      let d='';
      try{d=normalizeDateKey(a?.duty_date||'');}catch(_){d=String(a?.duty_date||'').slice(0,10);}
      return d.startsWith(String(st.monthKey||''));
    });
  }
  function filterRows(rows){
    const st=S(); if(!st)return rows||[];
    const person=String(st.tradeFilterStaff||'');
    const status=String(st.tradeFilterStatus||'');
    const current=me();
    return (rows||[])
      .filter(r=>!person||String(r?.requester_id||'')===person||String(r?.receiver_id||'')===person)
      .filter(r=>!status||String(r?.status||'').toLowerCase()===status)
      .slice()
      .sort((a,b)=>{
        const ai=(String(a?.requester_id||'')===current||String(a?.receiver_id||'')===current)?0:1;
        const bi=(String(b?.requester_id||'')===current||String(b?.receiver_id||'')===current)?0:1;
        if(ai!==bi)return ai-bi;
        const order={pending:0,confirmed:1,completed:2,rejected:3,cancelled:4,canceled:4};
        const as=order[String(a?.status||'').toLowerCase()]??9;
        const bs=order[String(b?.status||'').toLowerCase()]??9;
        if(as!==bs)return as-bs;
        return String(b?.created_at||'').localeCompare(String(a?.created_at||''));
      });
  }
  function staffOptions(){
    const st=S(); if(!st)return '';
    const id=me();
    let list=[];
    try{list=orderedStaff(st.staff||[]);}catch(_){list=(st.staff||[]).slice();}
    const own=list.find(x=>String(x?.id||'')===id);
    const others=list.filter(x=>String(x?.id||'')!==id);
    if(adminMode()){
      return `<option value="">ทุกคน</option>${list.map(x=>`<option value="${esc(x.id)}" ${String(st.tradeFilterStaff||'')===String(x.id)?'selected':''}>${esc(x.nickname||x.full_name||x.email||x.id)}</option>`).join('')}`;
    }
    const ownOpt=own?`<option value="${esc(own.id)}" ${String(st.tradeFilterStaff||'')===String(own.id)?'selected':''}>${esc(own.nickname||own.full_name||own.email||own.id)}</option>`:'';
    const allOpt=`<option value="" ${!st.tradeFilterStaff?'selected':''}>ทุกคน</option>`;
    return `${ownOpt}${allOpt}${others.map(x=>`<option value="${esc(x.id)}" ${String(st.tradeFilterStaff||'')===String(x.id)?'selected':''}>${esc(x.nickname||x.full_name||x.email||x.id)}</option>`).join('')}`;
  }
  function statusOptions(){
    const st=S(); const selected=String(st?.tradeFilterStatus||'');
    const opts=[
      [STATUS.pending,'⏳ รอผู้รับเวรยืนยัน'],
      [STATUS.confirmed,'🕒 รอ Admin'],
      [STATUS.completed,'✓ ขายเวรสำเร็จ'],
      [STATUS.rejected,'✕ ถูกปฏิเสธ'],
      ['cancelled','ยกเลิกคำขอ'],
      ['','ทุกสถานะ']
    ];
    return opts.map(([v,label])=>`<option value="${v}" ${selected===v?'selected':''}>${label}</option>`).join('');
  }
  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{if(chip.textContent!=='v555') chip.textContent='v555';});
  }
  function openRequestForAssignment(assignmentId){
    const id=String(assignmentId||'');
    return (S()?.tradeRequests||[])
      .filter(r=>String(r?.from_assignment_id||'')===id&&OPEN_STATUS.has(String(r?.status||'').toLowerCase()))
      .sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||'')))[0]||null;
  }
  function openStatusButton(row){
    const status=String(row?.status||'').toLowerCase();
    const label=status===STATUS.confirmed?'🕒 รอ Admin':'⏳ กำลังขาย';
    return `<button type="button" class="tiny-btn v554-trade-lock ${status===STATUS.confirmed?'is-admin-wait':'is-receiver-wait'}" data-v554-open-trades="${esc(status)}" title="${esc(statusText(status))}">${label}</button>`;
  }

  // Status wording used everywhere on trade rows/cards.
  window.tradeStatusLabel=function tradeStatusLabelV554(status,row=null){return statusText(status);};
  try{tradeStatusLabel=window.tradeStatusLabel;}catch(_){ }

  // Replace trade button with a visible locked status while an open request exists.
  const previousTradeButton=window.renderTradeButton||(typeof renderTradeButton==='function'?renderTradeButton:null);
  window.renderTradeButton=function renderTradeButtonV554(slot){
    if(!slot?.id||!slot?.staff_id)return '';
    const active=openRequestForAssignment(slot.id);
    if(active)return openStatusButton(active);
    if(previousTradeButton)return previousTradeButton(slot);
    try{if(!(String(slot.staff_id)===me()||adminMode()))return '';}catch(_){return '';}
    return `<button class="tiny-btn trade-btn" data-trade-duty="${esc(slot.id)}">ขายเวร</button>`;
  };
  try{renderTradeButton=window.renderTradeButton;}catch(_){ }

  // Grid view uses the duty pill itself as the sell action, so decorate/lock it too.
  const previousGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof previousGrid==='function'){
    window.renderGridView=function renderGridViewV554(){
      const html=previousGrid.apply(this,arguments);
      try{
        const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
        tpl.content.querySelectorAll('[data-trade-duty]').forEach(btn=>{
          const id=String(btn.getAttribute('data-trade-duty')||'');
          const active=openRequestForAssignment(id); if(!active)return;
          btn.removeAttribute('data-trade-duty');
          btn.setAttribute('data-staff-stat',String((S()?.rosterAssignments||[]).find(a=>String(a?.id||'')===id)?.staff_id||''));
          btn.classList.add('v554-duty-has-open-trade');
          const wrap=btn.parentElement;
          if(wrap&&!wrap.querySelector('.v554-grid-trade-status')){
            const badge=document.createElement('button');
            badge.type='button';badge.className='v554-grid-trade-status';
            badge.setAttribute('data-v554-open-trades',String(active.status||'pending'));
            badge.textContent=String(active.status)==='confirmed'?'🕒 รอ Admin':'⏳ กำลังขาย';
            wrap.appendChild(badge);
          }
        });
        const box=document.createElement('div');box.appendChild(tpl.content.cloneNode(true));return box.innerHTML;
      }catch(err){console.warn(`${VERSION} grid decoration skipped`,err);return html;}
    };
    try{renderGridView=window.renderGridView;}catch(_){ }
  }

  // Action buttons: receiver confirms/rejects, requester can cancel before completion.
  window.renderTradeActionButtons=function renderTradeActionButtonsV554(r){
    const actions=[]; const status=String(r?.status||'').toLowerCase(); const current=me();
    if(status===STATUS.pending&&String(r?.receiver_id||'')===current){
      actions.push(`<button class="tiny-btn" data-trade-status="${esc(r.id)}|confirmed">ยืนยัน</button>`);
      actions.push(`<button class="tiny-btn danger" data-trade-status="${esc(r.id)}|rejected">ปฏิเสธ</button>`);
    }
    if(OPEN_STATUS.has(status)&&String(r?.requester_id||'')===current){
      actions.push(`<button class="tiny-btn danger v554-cancel-trade" data-v554-trade-cancel="${esc(r.id)}">ยกเลิกคำขอ</button>`);
    }
    if(adminMode()){
      if(OPEN_STATUS.has(status)){
        const label=status===STATUS.pending?'Admin Override':'Admin บันทึกขายเวร';
        actions.push(`<button class="tiny-btn" data-trade-apply="${esc(r.id)}">${label}</button>`);
      }
      if(status!==STATUS.completed)actions.push(`<button class="tiny-btn" data-trade-edit="${esc(r.id)}">แก้ไข</button>`);
      actions.push(`<button class="tiny-btn danger" data-trade-delete="${esc(r.id)}">ลบ</button>`);
    }
    return actions.length?actions.join(' '):'<span class="muted">ไม่มีรายการที่ต้องกดตอนนี้</span>';
  };
  try{renderTradeActionButtons=window.renderTradeActionButtons;}catch(_){ }

  window.renderTradeCards=function renderTradeCardsV554(rows,assignments){
    return `<div class="mobile-cards trade-mobile-cards">${(rows||[]).map(r=>{
      const from=assignmentFor(r,assignments)||{};
      return `<div class="mobile-card"><div class="section-title"><h3>ขายเวร</h3>${badge(statusText(r.status),statusTone(r.status))}</div><div><b>ผู้ขายเวร:</b> ${staffPill(r.requester_id)}<br><b>ผู้รับเวร:</b> ${staffPill(r.receiver_id)}</div><div><b>วันที่ / เวร:</b> ${tradeDutyDisplay(r,assignments)}</div><div><b>เงินโดยประมาณ:</b> ${tradePaymentDisplay(r,from,null)}</div><div class="actions">${renderTradeActionButtons(r)}</div></div>`;
    }).join('')}</div>`;
  };
  try{renderTradeCards=window.renderTradeCards;}catch(_){ }

  window.renderTradeRow=function renderTradeRowV554(r,assignments){
    const from=assignmentFor(r,assignments)||{};
    return `<tr><td>${staffPill(r.requester_id)}</td><td>${staffPill(r.receiver_id)}</td><td>ขายเวร • ${esc(niceRoleRateLabel(r.rate_mode))}<br><span class="muted">${tradeDutyDisplay(r,assignments)}</span></td><td>${tradePaymentDisplay(r,from,null)}</td><td>${badge(statusText(r.status),statusTone(r.status))}</td><td>${renderTradeActionButtons(r)}</td></tr>`;
  };
  try{renderTradeRow=window.renderTradeRow;}catch(_){ }

  // Trade list with status + person filters.
  window.renderDutyTradePanel=function renderDutyTradePanelV554(assignments){
    ensureDefaults();
    const visible=filterRows(rowsForMonth(assignments||[]));
    if(!visible.length){
      return `<div class="trade-panel"><h3>คำขอขายเวร</h3>${typeof empty==='function'?empty('ไม่พบคำขอตามตัวกรองนี้'):'<div class="muted">ไม่พบคำขอตามตัวกรองนี้</div>'}</div>`;
    }
    return `<div class="trade-panel"><h3>คำขอขายเวร</h3><div class="table-wrap desktop-table"><table><thead><tr><th>ผู้ขายเวร</th><th>ผู้รับเวร</th><th>รายการ</th><th>เงินโดยประมาณ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${visible.map(r=>renderTradeRow(r,assignments)).join('')}</tbody></table></div>${renderTradeCards(visible,assignments)}</div>`;
  };
  try{renderDutyTradePanel=window.renderDutyTradePanel;}catch(_){ }

  window.renderTradeRequestsPage=function renderTradeRequestsPageV554(){
    ensureDefaults();
    const st=S();
    let assignments=[];try{assignments=getAssignmentsForMonth(st.monthKey);}catch(_){assignments=st.rosterAssignments||[];}
    const monthRows=rowsForMonth(assignments);
    const pending=monthRows.filter(r=>String(r?.status||'').toLowerCase()===STATUS.pending).length;
    const confirmed=monthRows.filter(r=>String(r?.status||'').toLowerCase()===STATUS.confirmed).length;
    const hint=adminMode()?'ตั้งต้นแสดงรายการที่รอ Admin ของทุกคน':'ตั้งต้นแสดงรายการของคุณที่รอผู้รับเวรยืนยัน • เลือก “ทุกคน” ได้เมื่อต้องการดูรายการอื่น';
    return `<div class="card v554-trade-page">
      <div class="toolbar compact-filter v554-trade-filters">
        <label>เดือน <input type="month" id="scheduleMonthInput" value="${esc(st.monthKey)}"></label>
        <label>คน <select id="tradeFilterStaff">${staffOptions()}</select></label>
        <label>สถานะ <select id="tradeFilterStatus">${statusOptions()}</select></label>
        ${typeof badge==='function'?badge(`⏳ รอผู้รับเวรยืนยัน ${pending}`,pending?'orange':'black'):`<span>${pending}</span>`}
        ${typeof badge==='function'?badge(`🕒 รอ Admin ${confirmed}`,confirmed?'blue':'black'):`<span>${confirmed}</span>`}
      </div>
      <div class="notice soft-notice v554-trade-hint">${esc(hint)}</div>
      ${renderDutyTradePanel(assignments)}
    </div>`;
  };
  try{renderTradeRequestsPage=window.renderTradeRequestsPage;}catch(_){ }

  function mergeTradeRows(rows){
    const st=S(); if(!st)return;
    const map=new Map((st.tradeRequests||[]).map(r=>[String(r?.id||''),r]));
    (rows||[]).forEach(r=>{if(r?.id)map.set(String(r.id),r);});
    st.tradeRequests=Array.from(map.values());
  }
  async function fetchAssignmentTrades(fromId){
    try{
      if(typeof sb==='undefined'||!sb||!fromId)return [];
      const res=await sb.from('roster_trade_requests').select('*').eq('from_assignment_id',fromId).order('created_at',{ascending:false}).limit(25);
      if(res?.error)throw res.error;
      mergeTradeRows(res?.data||[]);return res?.data||[];
    }catch(err){console.warn(`${VERSION} trade refresh failed`,err);return [];}
  }
  async function freshOpenRequests(fromId,excludeId=''){
    try{
      if(typeof sb==='undefined'||!sb||!fromId)return [];
      let q=sb.from('roster_trade_requests').select('*').eq('from_assignment_id',fromId).in('status',[STATUS.pending,STATUS.confirmed]).order('created_at',{ascending:false}).limit(25);
      const res=await q;
      if(res?.error)throw res.error;
      const rows=(res?.data||[]).filter(r=>String(r?.id||'')!==String(excludeId||''));
      mergeTradeRows(res?.data||[]);return rows;
    }catch(err){console.warn(`${VERSION} duplicate precheck failed`,err);return [];}
  }
  function showExistingRequest(row){
    const msg=statusText(row?.status||STATUS.pending);
    try{
      if(typeof showModal==='function'){
        showModal(`<h2>เวรนี้มีคำขอขายอยู่แล้ว</h2><p class="v554-existing-msg">${esc(msg)}</p><p class="hint">ระบบไม่สร้างคำขอซ้ำให้ เวรเดียวกันจะมีคำขอที่ยังไม่จบได้ครั้งละ 1 รายการ</p><div class="actions"><button type="button" class="primary-btn" data-v554-open-trades="${esc(row?.status||STATUS.pending)}">ดูคำขอ</button><button type="button" class="ghost-btn" data-app-alert-ok>ปิด</button></div>`);
        return;
      }
    }catch(_){ }
    toast(`เวรนี้มีคำขอขายอยู่แล้ว — ${msg}`);
  }

  // Fresh duplicate check before insert + immediate status refresh after save.
  const previousSave=window.saveTradeRequest||(typeof saveTradeRequest==='function'?saveTradeRequest:null);
  if(typeof previousSave==='function'){
    window.saveTradeRequest=async function saveTradeRequestV554(form){
      if(!form||form.dataset.v554Saving==='1')return;
      const fd=new FormData(form);
      const requestId=String(fd.get('trade_request_id')||'');
      const fromId=String(fd.get('from_assignment_id')||'');
      if(!requestId&&fromId){
        const open=await freshOpenRequests(fromId,'');
        if(open.length){
          showExistingRequest(open[0]);
          try{renderPage();}catch(_){ }
          return;
        }
      }
      form.dataset.v554Saving='1';
      const submit=form.querySelector('button[type="submit"]');
      const oldText=submit?.textContent||'';
      if(submit){submit.disabled=true;submit.textContent='กำลังส่งคำขอ...';}
      try{
        await previousSave(form);
        if(fromId)await fetchAssignmentTrades(fromId);
        try{renderPage();}catch(_){ }
      }finally{
        form.dataset.v554Saving='0';
        if(submit&&document.body.contains(submit)){submit.disabled=false;submit.textContent=oldText;}
      }
    };
    try{saveTradeRequest=window.saveTradeRequest;}catch(_){ }
  }

  // Make receiver action update immediately even if page cache is still warm.
  window.updateTradeStatus=async function updateTradeStatusV554(id,status){
    try{
      const patch={status,updated_by:me(),confirmed_at:status===STATUS.confirmed?new Date().toISOString():null};
      const res=await sb.from('roster_trade_requests').update(patch).eq('id',id).select('*').single();
      if(res?.error){toast(typeof friendlyDbError==='function'?friendlyDbError(res.error):String(res.error.message||res.error));return;}
      mergeTradeRows(res?.data?[res.data]:[]);
      try{renderPage();}catch(_){ }
      toast(status===STATUS.confirmed?'ยืนยันแล้ว — รายการย้ายไป 🕒 รอ Admin':'ปฏิเสธคำขอแล้ว');
    }catch(err){toast(err?.message||'อัปเดตสถานะไม่สำเร็จ');}
  };
  try{updateTradeStatus=window.updateTradeStatus;}catch(_){ }

  // After Admin applies a request, refresh that row so status changes immediately.
  const previousApply=window.applyTradeRequest||(typeof applyTradeRequest==='function'?applyTradeRequest:null);
  if(typeof previousApply==='function'){
    window.applyTradeRequest=async function applyTradeRequestV554(id){
      const row=(S()?.tradeRequests||[]).find(r=>String(r?.id||'')===String(id||''));
      const fromId=String(row?.from_assignment_id||'');
      await previousApply(id);
      if(fromId)await fetchAssignmentTrades(fromId);
      try{renderPage();}catch(_){ }
    };
    try{applyTradeRequest=window.applyTradeRequest;}catch(_){ }
  }

  async function cancelTrade(id){
    const st=S(); const row=(st?.tradeRequests||[]).find(r=>String(r?.id||'')===String(id||''));
    if(!row)return toast('ไม่พบคำขอขายเวรนี้');
    if(String(row.requester_id||'')!==me()&&!adminMode())return toast('ยกเลิกได้เฉพาะคำขอของตัวเอง');
    if(!OPEN_STATUS.has(String(row.status||'').toLowerCase()))return toast('รายการนี้ไม่อยู่ในสถานะที่ยกเลิกได้แล้ว');
    let ok=true;
    try{if(typeof confirmDialog==='function')ok=await confirmDialog('ยกเลิกคำขอขายเวรนี้ใช่ไหม?','ยกเลิกคำขอ');else ok=window.confirm('ยกเลิกคำขอขายเวรนี้ใช่ไหม?');}catch(_){ok=window.confirm('ยกเลิกคำขอขายเวรนี้ใช่ไหม?');}
    if(!ok)return;
    try{
      const res=await sb.from('roster_trade_requests').update({status:STATUS.cancelled,updated_by:me()}).eq('id',id).select('*').single();
      if(res?.error){toast(typeof friendlyDbError==='function'?friendlyDbError(res.error):String(res.error.message||res.error));return;}
      mergeTradeRows(res?.data?[res.data]:[]);
      try{renderPage();}catch(_){ }
      toast('ยกเลิกคำขอขายเวรแล้ว');
    }catch(err){toast(err?.message||'ยกเลิกคำขอไม่สำเร็จ');}
  }
  function goTradePage(status=''){
    const st=S(); if(!st)return;
    st.page='tradeRequests';
    st.tradeFilterStatus=String(status||st.tradeFilterStatus||'');
    if(!adminMode()&&!st.tradeFilterStaff)st.tradeFilterStaff=me();
    try{if(typeof closeModal==='function')closeModal();}catch(_){ }
    try{
      if(window.cnmiV515?.navigate){window.cnmiV515.navigate('tradeRequests',{month:st.monthKey});return;}
    }catch(_){ }
    try{location.hash=`#/trade?month=${encodeURIComponent(st.monthKey||'')}`;}catch(_){ }
    try{renderPage();}catch(_){ }
  }

  document.addEventListener('change',function(e){
    if(e.target?.id==='tradeFilterStatus'){
      const st=S();if(!st)return;
      st.tradeFilterStatus=String(e.target.value||'');
      try{renderPage();}catch(_){ }
    }
  },true);
  document.addEventListener('click',function(e){
    const cancel=e.target?.closest?.('[data-v554-trade-cancel]');
    if(cancel){e.preventDefault();e.stopImmediatePropagation();cancelTrade(cancel.getAttribute('data-v554-trade-cancel'));return;}
    const open=e.target?.closest?.('[data-v554-open-trades]');
    if(open){e.preventDefault();e.stopImmediatePropagation();goTradePage(open.getAttribute('data-v554-open-trades')||'');return;}
  },true);

  // Version + small UI polish.
  const style=document.createElement('style');
  style.id='cnmi-v554-trade-status-guard-filter';
  style.textContent=`
    .v554-trade-filters{align-items:end;gap:10px;flex-wrap:wrap}
    .v554-trade-filters label{min-width:180px}
    .v554-trade-filters select{min-width:180px}
    .v554-trade-hint{margin-top:8px}
    .v554-trade-lock{cursor:pointer;font-weight:800;white-space:nowrap}
    .v554-trade-lock.is-receiver-wait{background:#fff7e6;border-color:#f3c66d;color:#91600c}
    .v554-trade-lock.is-admin-wait{background:#eef7ff;border-color:#a9d4f5;color:#2a6e9d}
    .v554-grid-trade-status{border:0;border-radius:999px;padding:2px 6px;font-size:10px;font-weight:850;line-height:1.25;cursor:pointer;background:#fff3d6;color:#8a5a00;white-space:nowrap}
    .v554-duty-has-open-trade{cursor:default}
    .v554-existing-msg{font-weight:850;margin:6px 0}
    @media(max-width:760px){
      .v554-trade-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .v554-trade-filters label{min-width:0}
      .v554-trade-filters label:first-child{grid-column:1/-1}
      .v554-trade-filters select,.v554-trade-filters input{min-width:0;width:100%}
      .v554-trade-hint{font-size:.78rem}
      .v554-grid-trade-status{font-size:9px;padding:2px 5px}
    }
  `;
  document.head.appendChild(style);
  setVersion(document);
  // v555 freeze hotfix: never rewrite the whole version chip on every DOM mutation.
  // The v554 observer could trigger itself repeatedly because setVersion() changed
  // textContent while observing childList on the entire document.
  const observer=new MutationObserver((mutations)=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes||[]){
        if(!node||node.nodeType!==1)continue;
        if(node.matches?.('.v520-version-chip')){
          if(node.textContent!=='v555')node.textContent='v555';
        }
        node.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
          if(chip.textContent!=='v555')chip.textContent='v555';
        });
      }
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  console.info(`${VERSION} trade status guard/filter + freeze hotfix loaded`);
})();

} catch (error) { console.error("[v569] patch-v555-trade-freeze-hotfix.js", error); }
;

/* Original source: patch-v557-activity-note-mobile-fix.js */
try {
/* CNMI Staff Planner V557 — Activity note mobile visibility fix
   Fixes the "รายละเอียดเพิ่มเติม" activity field disappearing on mobile.
   Root cause: V521 may add .v521-hide-label-on-mobile to a wrapping <label>;
   that class hid the whole label, including its textarea.
   No database/schema/business-rule changes.
*/
(function(){
  'use strict';
  if(window.__CNMI_V557_ACTIVITY_NOTE_MOBILE_FIX__) return;
  window.__CNMI_V557_ACTIVITY_NOTE_MOBILE_FIX__=true;
  const VERSION='v558';

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:null) || {};}
    catch(_){return window.state||{};}
  }
  function esc(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function editingNote(){
    try{
      const s=S();
      const id=s?.editingActivityId;
      const row=(s?.activities||[]).find(x=>String(x?.id||'')===String(id||''));
      let note=String(row?.note||'');
      if(typeof window.cnmiCleanActivityNote==='function') note=window.cnmiCleanActivityNote(note);
      return note;
    }catch(_){return '';}
  }

  function repairActivityNote(root=document){
    const scope=root?.querySelectorAll?root:document;
    const forms=[];
    if(scope.matches?.('#activityForm')) forms.push(scope);
    scope.querySelectorAll?.('#activityForm').forEach(f=>forms.push(f));
    forms.forEach(form=>{
      let textarea=form.querySelector('textarea[name="note"]');
      const section=form.querySelector('.v518-detail-section');
      const grid=section?.querySelector('.v518-section-grid');

      // Defensive recovery: if another UI patch dropped the note field, restore it.
      if(!textarea && grid){
        const label=document.createElement('label');
        label.className='wide v557-activity-note-field';
        label.innerHTML=`หมายเหตุ / รายละเอียดเพิ่มเติม<textarea name="note" rows="4" placeholder="ใส่รายละเอียดเพิ่มเติม หรือลิงก์ที่เกี่ยวข้อง">${esc(editingNote())}</textarea>`;
        grid.appendChild(label);
        textarea=label.querySelector('textarea');
      }
      if(!textarea) return;

      const label=textarea.closest('label');
      if(label) label.classList.add('v557-activity-note-field');
      if(!textarea.placeholder || /^(หมายเหตุเพิ่มเติม|รายละเอียดเพิ่มเติม)$/i.test(textarea.placeholder.trim())){
        textarea.placeholder='ใส่รายละเอียดเพิ่มเติม หรือลิงก์ที่เกี่ยวข้อง';
      }
      textarea.setAttribute('aria-label','หมายเหตุ / รายละเอียดเพิ่มเติม');
    });
  }

  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      if(chip.textContent!=='v558') chip.textContent='v558';
      chip.title='CNMI Staff Planner v558';
    });
  }

  const style=document.createElement('style');
  style.id='cnmi-v557-activity-note-mobile-fix-style';
  style.textContent=`
    /* V521 hides repeated labels. A wrapping label must stay visible because it owns the control. */
    body.v521-ui-clarity #activityForm .v518-detail-section label.v521-hide-label-on-mobile,
    body.v521-ui-clarity #activityForm .v518-detail-section .v557-activity-note-field{
      display:grid!important;
      gap:6px!important;
    }
    #activityForm .v518-detail-section .v557-activity-note-field{
      grid-column:1/-1!important;
      min-width:0!important;
      font-size:13px!important;
      color:#29475c!important;
    }
    #activityForm .v518-detail-section textarea[name="note"]{
      display:block!important;
      width:100%!important;
      min-height:96px!important;
      box-sizing:border-box!important;
      resize:vertical!important;
      opacity:1!important;
      visibility:visible!important;
    }
    @media(max-width:760px){
      #activityForm .v518-detail-section textarea[name="note"]{
        min-height:104px!important;
        font-size:16px!important; /* prevents iOS input zoom */
        line-height:1.45!important;
      }
    }
  `;
  document.head.appendChild(style);

  function apply(root=document){repairActivityNote(root);setVersion(root);}
  let queued=false;
  function queue(root=document){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply(root);});
  }

  const start=()=>{
    apply(document);
    const target=document.getElementById('pageContent')||document.body;
    if(target){
      const observer=new MutationObserver(mutations=>{
        for(const m of mutations){
          if(m.addedNodes?.length){queue(target);break;}
        }
      });
      observer.observe(target,{childList:true,subtree:true});
    }
    window.addEventListener('hashchange',()=>queue(document));
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  console.info(`[${VERSION}] activity note mobile visibility fix loaded`);
})();

} catch (error) { console.error("[v569] patch-v557-activity-note-mobile-fix.js", error); }
;

/* Original source: patch-v559-navigation-performance.js */
try {
/* CNMI Staff Planner V559 — smooth navigation + render performance
 * Goals:
 * - One menu tap should feel immediate on desktop and mobile.
 * - Avoid rebuilding the whole sidebar on every page render when role/menu structure did not change.
 * - Avoid duplicate post-load renders on cached route data (paired with V550 update).
 * - Keep URL/deep-link behavior and all business logic unchanged.
 * No SQL / schema changes.
 */
(function(){
  'use strict';
  const VERSION='V559_NAVIGATION_PERFORMANCE';
  if(window.__CNMI_V559_NAVIGATION_PERFORMANCE__) return;
  window.__CNMI_V559_NAVIGATION_PERFORMANCE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v);}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function actualAdmin(){try{return typeof isActualAdmin==='function'?isActualAdmin():String(S()?.profile?.role||'').toLowerCase()==='admin';}catch(_){return false;}}

  /* ---------- lightweight state stamp (object identity, not deep serialization) ---------- */
  const ids=new WeakMap();let idSeq=0;
  function oid(v){
    if(!v||((typeof v!=='object')&&(typeof v!=='function'))) return txt(v);
    let id=ids.get(v);if(!id){id=++idSeq;ids.set(v,id);}return `@${id}`;
  }
  function stateStamp(){
    const st=S();if(!st)return '';
    const out=[];
    for(const key of Object.keys(st).sort()){
      const v=st[key];
      if(v instanceof Date){out.push(`${key}:${v.getTime()}`);continue;}
      const type=typeof v;
      if(v&&type==='object'){out.push(`${key}:${oid(v)}`);continue;}
      if(type==='string'||type==='number'||type==='boolean'||v==null) out.push(`${key}:${txt(v)}`);
    }
    return out.join('|');
  }

  /* ---------- visible response on tap ---------- */
  let transitionTimer=0;
  function finishTransition(){
    clearTimeout(transitionTimer);
    document.documentElement.classList.remove('v559-route-busy');
    document.querySelectorAll('.v559-nav-pressed').forEach(el=>el.classList.remove('v559-nav-pressed'));
  }
  function beginTransition(node){
    clearTimeout(transitionTimer);
    document.documentElement.classList.add('v559-route-busy');
    document.querySelectorAll('.v559-nav-pressed').forEach(el=>el.classList.remove('v559-nav-pressed'));
    node?.classList?.add('v559-nav-pressed');
    transitionTimer=setTimeout(finishTransition,1800);
  }
  function paintActive(page){
    const p=txt(page);
    document.querySelectorAll('#mainNav .nav-btn[data-page]').forEach(btn=>btn.classList.toggle('active',txt(btn.dataset.page)===p));
  }
  function closeMobileSidebar(){
    try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }
  }

  const style=document.createElement('style');
  style.id='cnmi-v559-navigation-performance';
  style.textContent=`
    #mainNav .nav-btn,.v523-subitem,.v524-subitem{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    #mainNav .nav-btn.v559-nav-pressed,.v523-subitem.v559-nav-pressed,.v524-subitem.v559-nav-pressed{
      transform:translateY(0)!important;filter:brightness(.96);outline:2px solid rgba(52,152,219,.18);outline-offset:-2px
    }
    html.v559-route-busy::before{content:"";position:fixed;z-index:99998;left:0;top:0;height:3px;width:34%;border-radius:0 999px 999px 0;background:#49aee8;animation:v559RouteProgress .7s ease-in-out infinite alternate;pointer-events:none}
    @keyframes v559RouteProgress{from{transform:translateX(-15%);opacity:.68}to{transform:translateX(210%);opacity:1}}
    @media(prefers-reduced-motion:reduce){html.v559-route-busy::before{animation:none;width:100%;opacity:.7}}
  `;
  document.head.appendChild(style);

  document.addEventListener('pointerdown',function(e){
    const nav=e.target?.closest?.('#mainNav .nav-btn[data-page],#mainNav [data-v523-ot-item],#mainNav [data-v524-child-key]');
    if(!nav)return;
    nav.classList.add('v559-nav-pressed');
  },{capture:true,passive:true});
  document.addEventListener('click',function(e){
    const nav=e.target?.closest?.('#mainNav .nav-btn[data-page],#mainNav [data-v523-ot-item],#mainNav [data-v524-child-key]');
    if(!nav)return;
    beginTransition(nav);
    const p=nav.getAttribute('data-page');if(p)paintActive(p);
    /* V523 OT children historically render immediately but do not run the route loader.
       Refresh in the background and repaint only if state objects actually changed. */
    if(nav.hasAttribute('data-v523-ot-item')){
      const before=stateStamp();
      Promise.resolve().then(async()=>{
        try{await window.cnmiV316?.loadPageData?.('ot',{force:false});}catch(_){ }
        if(txt(S()?.page)==='ot'&&stateStamp()!==before){try{if(typeof renderPage==='function')renderPage();}catch(_){ }}
        else finishTransition();
      });
    }
  },true);

  /* ---------- do not rebuild the complete sidebar for every page render ---------- */
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  const fullRenderNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);
  let navContext='';
  let navEverBuilt=false;
  let afterRenderQueued=false;

  function contextSignature(){
    const st=S(),p=st?.profile||{};
    let mode='';try{mode=typeof getViewAsMode==='function'?getViewAsMode():txt(st?.viewAsMode);}catch(_){mode=txt(st?.viewAsMode);}
    return [p.id,p.user_id,p.nickname,p.full_name,p.position,p.role,p.staff_type,actualAdmin(),isAdminSafe(),mode].map(txt).join('|');
  }
  function fastRenderNav(){
    paintActive(S()?.page||'dashboard');
    /* User mini/menu structure is intentionally preserved. It is rebuilt automatically
       when profile/role/view-mode changes because contextSignature changes. */
  }
  function afterRender(){
    if(afterRenderQueued)return;afterRenderQueued=true;
    requestAnimationFrame(()=>{
      afterRenderQueued=false;
      finishTransition();
      try{window.cnmiV542SidebarOwner?.sync?.();}catch(_){ }
      try{
        document.querySelectorAll('.v520-version-chip').forEach(chip=>{
          chip.textContent='v559';chip.title='Smooth navigation + performance (V559)';
        });
      }catch(_){ }
    });
  }

  if(typeof previousRenderPage==='function'){
    const wrapped=function renderPageV559(){
      const nav=document.getElementById('mainNav');
      const ctx=contextSignature();
      const canFast=!!(navEverBuilt&&nav&&nav.children.length&&ctx===navContext&&typeof fullRenderNav==='function');
      let result;
      if(canFast){
        let savedWindow=window.renderNav;
        let savedBinding=null;
        try{savedBinding=(typeof renderNav==='function'?renderNav:null);}catch(_){ }
        try{
          window.renderNav=fastRenderNav;
          try{renderNav=fastRenderNav;}catch(_){ }
          result=previousRenderPage.apply(this,arguments);
        }finally{
          window.renderNav=savedWindow||fullRenderNav;
          try{renderNav=savedBinding||savedWindow||fullRenderNav;}catch(_){ }
        }
      }else{
        result=previousRenderPage.apply(this,arguments);
        navEverBuilt=!!document.getElementById('mainNav')?.children?.length;
        navContext=ctx;
      }
      paintActive(S()?.page||'dashboard');
      afterRender();
      return result;
    };
    wrapped.__v559Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  /* ---------- V515 submenu navigation: same immediate-render / conditional-refresh model ---------- */
  function applyParams(page,params={}){
    const st=S();if(!st)return;
    const month=txt(params.month),date=txt(params.date),staff=txt(params.staff);
    if(/^\d{4}-\d{2}$/.test(month)){
      if(page==='hr')st.hrFilterMonth=month;
      else if(page==='hrSummary')st.hrSummaryFilterMonth=month;
      else if(page==='positionMonth')st.positionMonthKey=month;
      else if(page==='positionMonthView')st.positionMonthViewKey=month;
      else if(['schedule','scheduler','tradeRequests'].includes(page))st.monthKey=month;
      else if(page==='physicianConsult'){st.physicianConsultMonthV452=month;st.monthKey=month;}
    }
    if(/^\d{4}-\d{2}-\d{2}$/.test(date)){
      if(page==='dashboard')st.dashboardDateV443=date;
      else if(page==='positions')st.positionDate=date;
      else if(page==='audit')st.auditDate=date;
      else if(page==='calendar'){const d=new Date(`${date}T12:00:00`);if(!Number.isNaN(d.getTime()))st.calendarDate=d;}
    }
    if(page==='hr'&&staff)st.hrFilterStaff=staff;
    if(page==='hrSummary'&&staff)st.hrSummaryFilterStaff=staff;
  }

  if(window.cnmiV515?.navigate){
    const oldNavigate=window.cnmiV515.navigate.bind(window.cnmiV515);
    window.cnmiV515.navigate=async function navigateV559(page,params={}){
      const p=txt(page)||'dashboard';
      const st=S();
      try{window.cnmiV515.setUrl?.(p,{push:true,override:params});}catch(_){ }
      if(st){st.page=p;applyParams(p,params);}
      closeMobileSidebar();
      beginTransition(document.querySelector(`#mainNav [data-page="${CSS.escape(p)}"]`));
      try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      const before=stateStamp();
      try{
        if(window.cnmiV316?.loadPageData)await window.cnmiV316.loadPageData(p,{force:false});
        else return oldNavigate(page,params);
        if(['hr','hrSummary'].includes(p))await window.cnmiV515.syncSafeHr?.(true,{render:false});
      }catch(err){console.warn(`[${VERSION}] navigate load`,p,err);}
      if(txt(S()?.page)===p&&stateStamp()!==before){
        try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      }else finishTransition();
    };
  }

  /* Manual refresh must really be fresh even with the route cache. */
  document.addEventListener('click',function(e){
    if(!e.target?.closest?.('#reloadBtn'))return;
    try{window.cnmiV316?.clearCache?.();}catch(_){ }
  },true);

  /* If an old route request finishes after the user already changed page, V550/V515
     already guard the final render. This hook only clears stale visual feedback. */
  window.addEventListener('pageshow',()=>setTimeout(finishTransition,80));
  window.addEventListener('error',finishTransition);
  window.addEventListener('unhandledrejection',finishTransition);

  function start(){
    navEverBuilt=!!document.getElementById('mainNav')?.children?.length;
    navContext=contextSignature();
    try{document.querySelectorAll('.v520-version-chip').forEach(chip=>{chip.textContent='v559';chip.title='Smooth navigation + performance (V559)';});}catch(_){ }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV559={version:VERSION,stateStamp,finishTransition};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v559-navigation-performance.js", error); }
;

/* Original source: patch-v560-single-navigation-dispatcher.js */
try {
/* CNMI Staff Planner V560 — Single Navigation Dispatcher
 * Fixes the remaining "click menu -> old page freezes briefly -> new page appears" feeling.
 *
 * Root cause:
 * - Several legacy document-capture navigation handlers still wait for Supabase refreshes
 *   before the first render (especially position/admin routes).
 * - V559 improved render cost, but those earlier capture handlers still owned the click.
 *
 * V560 owns sidebar navigation at WINDOW capture level (before document capture handlers),
 * paints immediate feedback, yields one frame so the browser can paint, renders cached state,
 * and refreshes route data in the background. Rapid taps invalidate older refresh results.
 *
 * UI/navigation/performance only. No schema or business-rule changes.
 */
(function(){
  'use strict';
  const VERSION='V560_SINGLE_NAVIGATION_DISPATCHER';
  if(window.__CNMI_V560_SINGLE_NAVIGATION_DISPATCHER__) return;
  window.__CNMI_V560_SINGLE_NAVIGATION_DISPATCHER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function closeSidebar(){
    try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }
  }
  function titleFor(page){
    try{
      const list=(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]);
      return txt(list.find(x=>txt(x?.id)===page)?.title)||'กำลังเปิดหน้า';
    }catch(_){return 'กำลังเปิดหน้า';}
  }
  function subtitleFor(page){
    try{
      const list=(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]);
      return txt(list.find(x=>txt(x?.id)===page)?.subtitle)||'';
    }catch(_){return '';}
  }
  function currentStamp(){
    try{return window.cnmiV559?.stateStamp?.()||'';}catch(_){return '';}
  }
  function nextPaint(){
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }
  function setBusy(on,node){
    try{
      document.documentElement.classList.toggle('v560-route-busy',!!on);
      document.querySelectorAll('.v560-nav-active').forEach(el=>el.classList.remove('v560-nav-active'));
      if(on&&node?.classList)node.classList.add('v560-nav-active');
    }catch(_){ }
  }
  function paintShell(page){
    const title=titleFor(page),sub=subtitleFor(page);
    try{const el=document.getElementById('pageTitle');if(el)el.textContent=title;}catch(_){ }
    try{const el=document.getElementById('pageSubtitle');if(el)el.textContent=sub;}catch(_){ }
    try{
      const content=document.getElementById('pageContent');
      if(!content)return;
      content.innerHTML=`<div class="v560-route-shell" role="status" aria-live="polite">
        <div class="v560-route-shell-head"><span class="v560-route-spinner" aria-hidden="true"></span><strong>${title.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</strong></div>
        <div class="v560-route-shell-lines"><i></i><i></i><i></i></div>
      </div>`;
    }catch(_){ }
  }
  function setUrl(page){
    try{window.cnmiV515?.setUrl?.(page,{push:true});}catch(_){ }
  }
  function openTree(id){
    try{window.cnmiV542SidebarOwner?.setOpenTree?.(id);}catch(_){ }
  }
  function collapsePlain(page){
    try{window.cnmiV542SidebarOwner?.collapsePlain?.(page);}catch(_){ }
  }

  const CHILDREN={
    'leave:leave-form':{page:'leave',stateKey:'v524LeaveView',session:'cnmi-v524-leave-view',view:'form'},
    'leave:leave-history':{page:'leave',stateKey:'v524LeaveView',session:'cnmi-v524-leave-view',view:'history'},
    'profile:profile-main':{page:'myProfile',stateKey:'v524ProfileView',session:'cnmi-v524-profile-view',view:'profile'},
    'profile:profile-history':{page:'myProfile',stateKey:'v524ProfileView',session:'cnmi-v524-profile-view',view:'requests'},
    'activities:activity-create':{page:'activities',stateKey:'v524ActivityView',session:'cnmi-v524-activity-view',view:'create'},
    'activities:activity-search':{page:'activities',stateKey:'v524ActivityView',session:'cnmi-v524-activity-view',view:'search'},
    'activities:my-training':{page:'myTraining'},
    'roster:roster-view':{page:'schedule'},
    'roster:roster-trade':{page:'tradeRequests'},
    'positions-staff:positions-day':{page:'positions'},
    'positions-staff:positions-month':{page:'positionMonthView'},
    'hr:hr-pending':{page:'hr'},
    'hr:hr-done':{page:'hrSummary'},
    'positions-admin:position-plan':{page:'positionMonth'},
    'positions-admin:position-master':{page:'positionManagement'},
    'positions-admin:intern-add':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'add'},
    'positions-admin:intern-mentor':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'mentor'},
    'positions-admin:intern-list':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'registry'},
    'positions-admin:intern-history':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'history'},
    'physician:physician-daytime':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'daytime'},
    'physician:physician-oncall':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'oncall'},
    'physician:physician-override':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'override'},
    'physician:physician-list':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'list'},
    'users:users-manage':{page:'users',stateKey:'v524UsersView',session:'cnmi-v524-users-view',view:'manage'},
    'users:users-add':{page:'users',stateKey:'v524UsersView',session:'cnmi-v524-users-view',view:'add'},
    'profile-requests:profile-pending':{page:'profileRequests'},
    'profile-requests:profile-history':{page:'profileRequestSummary'}
  };
  function applyChild(tree,key){
    const cfg=CHILDREN[`${tree}:${key}`];
    if(!cfg)return null;
    if(cfg.stateKey){
      S()[cfg.stateKey]=cfg.view;
      try{sessionStorage.setItem(cfg.session,cfg.view);}catch(_){ }
    }
    openTree(`v524:${tree}`);
    return cfg.page;
  }
  function otGroup(id){
    if(admin()){
      if(['admin-duty','tracking'].includes(id))return 'duty';
      if(['admin-extra','approve'].includes(id))return 'ot';
      return 'report';
    }
    if(['staff-track','staff-confirm'].includes(id))return 'duty';
    if(['staff-extra','staff-list'].includes(id))return 'ot';
    return 'summary';
  }
  function applyOt(id){
    const allowed=admin()
      ? new Set(['admin-duty','admin-extra','tracking','approve','summary','admin-details','export','history'])
      : new Set(['staff-track','staff-confirm','staff-extra','staff-list','staff-details','staff-summary']);
    if(!allowed.has(id))return null;
    const st=S();st.otMenuV369=id;st.otGroupV522=otGroup(id);st.page='ot';
    try{sessionStorage.setItem('cnmi-v523-ot-open','1');}catch(_){ }
    openTree('ot');
    return 'ot';
  }
  function setExactOtUrl(){
    const st=S();
    const adminMap={
      'admin-duty':'confirm-duty','admin-extra':'request-extra','tracking':'staff-tracking',
      'approve':'approval','summary':'monthly-summary','admin-details':'staff-detail',
      'export':'hr-export','history':'export-history'
    };
    const staffMap={
      'staff-track':'my-duty','staff-confirm':'confirm-duty','staff-extra':'request-extra',
      'staff-list':'my-ot','staff-details':'claim-detail','staff-summary':'monthly-summary'
    };
    const section=(admin()?adminMap:staffMap)[txt(st.otMenuV369)];
    if(!section)return false;
    const params=new URLSearchParams();params.set('section',section);
    const month=txt(st.otMenuMonthV369||st.otSourceMonthV241||st.otMoneyMonthV241||st.myDutyMonthFilter||'');
    if(/^\d{4}-\d{2}$/.test(month))params.set('month',month);
    if(admin()&&txt(st.otMenuV369)==='admin-extra'){
      const mode=['work','adjustment','activity'].includes(txt(st.v527ExtraMode))?txt(st.v527ExtraMode):'work';
      params.set('mode',mode);
    }
    const target=`#/ot?${params.toString()}`;
    try{
      if(String(location.hash||'')!==target)history.pushState({cnmiV571:true},'',target);
    }catch(_){location.hash=target;}
    return true;
  }

  let navSeq=0;
  let finishTimer=0;
  async function navigate(page,node,{sameSubview=false}={}){
    const p=txt(page);if(!p)return;
    const st=S();if(!st?.profile)return;
    const seq=++navSeq;
    clearTimeout(finishTimer);
    setBusy(true,node);
    closeSidebar();

    const samePage=txt(st.page)===p;
    st.page=p;
    // V571: OT submenu must update its exact ?section= URL BEFORE renderPage().
    // V541 re-applies URL state before every render; leaving the old section in the URL
    // caused every submenu click to snap back to the previous screen (usually confirm-duty).
    if(!(p==='ot'&&sameSubview&&setExactOtUrl()))setUrl(p);
    paintShell(p);

    // Critical: give Chrome/Safari one real paint before any legacy-heavy render/data work.
    await nextPaint();
    if(seq!==navSeq||txt(S().page)!==p)return;

    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(err){console.warn(`[${VERSION}] first render`,p,err);}
    requestAnimationFrame(()=>requestAnimationFrame(decorate));

    // If this is only a same-page subview switch, there is usually nothing new to fetch.
    if(samePage&&sameSubview){
      finishTimer=setTimeout(()=>setBusy(false),40);
      return;
    }

    const before=currentStamp();
    try{
      if(window.cnmiV316?.loadPageData){
        await window.cnmiV316.loadPageData(p,{force:false});
      }
      if(['hr','hrSummary'].includes(p)){
        try{await window.cnmiV515?.syncSafeHr?.(true,{render:false});}catch(_){ }
      }
    }catch(err){console.warn(`[${VERSION}] background load`,p,err);}
    if(seq!==navSeq||txt(S().page)!==p)return;

    const after=currentStamp();
    if(after!==before){
      // Yield once more before the fresh-data render so long tables don't monopolize the click frame.
      await nextPaint();
      if(seq!==navSeq||txt(S().page)!==p)return;
      try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(err){console.warn(`[${VERSION}] fresh render`,p,err);}
      requestAnimationFrame(()=>requestAnimationFrame(decorate));
    }
    finishTimer=setTimeout(()=>setBusy(false),40);
  }

  function stop(e){
    try{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}catch(_){ }
  }

  // WINDOW capture runs before all legacy DOCUMENT-capture handlers.
  // This is the key difference from V559 and removes the remaining await-before-render freezes.
  window.addEventListener('click',function(e){
    const target=e.target;
    const navRoot=target?.closest?.('#mainNav');
    if(!navRoot)return;

    // Leave tree expand/collapse controls to the existing sidebar owner; they are local DOM-only actions.
    if(target.closest('[data-v523-submenu-toggle],[data-v524-tree-toggle],[data-v528-extra-toggle],[data-v528-extra-mode]'))return;

    const ot=target.closest('[data-v523-ot-item]');
    if(ot){
      const id=txt(ot.dataset.v523OtItem);const page=applyOt(id);if(!page)return;
      stop(e);void navigate(page,ot,{sameSubview:true});return;
    }

    const child=target.closest('[data-v524-child-key]');
    if(child){
      const tree=txt(child.dataset.v524TreeItem),key=txt(child.dataset.v524ChildKey);
      const beforePage=txt(S().page),page=applyChild(tree,key);if(!page)return;
      stop(e);void navigate(page,child,{sameSubview:beforePage===page});return;
    }

    const plain=target.closest('.nav-btn[data-page]');
    if(plain&&!plain.closest('.v523-nav-tree,.v524-nav-tree')){
      const page=txt(plain.dataset.page);if(!page)return;
      // Scheduler already has an earlier window-capture fast-path (V211). Keep that proven path.
      if(page==='scheduler')return;
      stop(e);collapsePlain(page);void navigate(page,plain,{sameSubview:false});return;
    }
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v560-navigation-dispatcher-style';
  style.textContent=`
    html.v560-route-busy{cursor:progress}
    html.v560-route-busy::after{content:"";position:fixed;z-index:99999;left:0;top:0;height:3px;width:100%;background:linear-gradient(90deg,#49aee8 0 36%,#9bd9bf 58%,transparent 82%);background-size:220% 100%;animation:v560bar .65s linear infinite;pointer-events:none}
    @keyframes v560bar{from{background-position:100% 0}to{background-position:-100% 0}}
    #mainNav .v560-nav-active{filter:brightness(.94)!important;outline:2px solid rgba(42,145,210,.22)!important;outline-offset:-2px}
    .v560-route-shell{margin:14px 0;padding:22px;border:1px solid #dbe8f2;border-radius:16px;background:#fff;min-height:180px}
    .v560-route-shell-head{display:flex;align-items:center;gap:10px;color:#23445a;font-size:1rem}
    .v560-route-spinner{width:18px;height:18px;border-radius:50%;border:2px solid #cfe7f7;border-top-color:#49aee8;animation:v560spin .7s linear infinite}
    @keyframes v560spin{to{transform:rotate(360deg)}}
    .v560-route-shell-lines{display:grid;gap:12px;margin-top:22px}.v560-route-shell-lines i{height:14px;border-radius:999px;background:#edf5fa;display:block}.v560-route-shell-lines i:nth-child(1){width:72%}.v560-route-shell-lines i:nth-child(2){width:92%}.v560-route-shell-lines i:nth-child(3){width:58%}
    @media(max-width:820px){.v560-route-shell{margin:8px 0;padding:18px;min-height:150px}}
    @media(prefers-reduced-motion:reduce){html.v560-route-busy::after,.v560-route-spinner{animation:none}}
  `;
  document.head.appendChild(style);

  // V560 owns the visible version chip. Do not touch the service worker version.
  function decorate(){
    try{document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{chip.textContent='v562';chip.title='Realtime manpower availability by leave + activity time (V562)';});}catch(_){ }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
  window.addEventListener('pageshow',()=>{decorate();setBusy(false);});
  window.addEventListener('error',()=>setBusy(false));
  window.addEventListener('unhandledrejection',()=>setBusy(false));

  window.cnmiV560={version:VERSION,navigate};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v560-single-navigation-dispatcher.js", error); }
;

/* Original source: patch-v562-dashboard-realtime-availability.js */
try {
/* CNMI Staff Planner V562
 * Realtime dashboard availability from leave + blocking activities.
 * - Weekday manpower uses exact activity time windows (08:00-16:00), not whole-day subtraction.
 * - Multiple overlapping activities for the same person are merged for counting, so no double subtraction.
 * - Shows minimum available staff in morning / afternoon and a compact time-line drilldown.
 * - Physician Consult shows all overlapping meeting/training/outing windows and exact-time minimum readiness.
 * - Display-only: no Supabase schema/write changes and no extra network requests.
 */
(function(){
  'use strict';
  const VERSION='V562_DASHBOARD_REALTIME_AVAILABILITY';
  if(window.__CNMI_V562_DASHBOARD_REALTIME_AVAILABILITY__)return;
  window.__CNMI_V562_DASHBOARD_REALTIME_AVAILABILITY__=true;

  const WORK_START=8*60, MIDDAY=12*60, WORK_END=16*60;
  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(S()?.dashboardDateV443)||normDate(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  }
  function isOffDay(date){
    try{return !!window.cnmiDashboardHolidayManpowerV440?.isOffDay?.(date);}catch(_){return false;}
  }
  function staffById(id){return (S()?.staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
  function nick(id){const p=staffById(id);return txt(p?.nickname||p?.full_name||p?.email||'-');}
  function isPhysician(p){
    if(!p)return false;
    try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(_){ }
    const t=`${txt(p?.staff_type)} ${txt(p?.role)} ${txt(p?.position)} ${txt(p?.job_title)}`;
    if(/นักเทคนิคการแพทย์|เทคนิคการแพทย์/i.test(t))return false;
    return /แพทย์|physician|doctor/i.test(t);
  }
  function groupOf(p){
    if(isPhysician(p))return 'แพทย์';
    const t=`${txt(p?.staff_type)} ${txt(p?.role)} ${txt(p?.position)} ${txt(p?.job_title)}`;
    return txt(p?.staff_type)==='เคิก'||/clerk|ธุรการ/i.test(t)?'เคิก':'MT';
  }
  function activeOn(p,date){
    if(!p||p.is_active===false||p.active===false)return false;
    try{if(window.cnmiStaffLifecycleV462?.employmentOn&&!window.cnmiStaffLifecycleV462.employmentOn(p,date))return false;}catch(_){ }
    return true;
  }
  function activeStaff(date,{physicians=false}={}){
    return (S()?.staff||[]).filter(p=>activeOn(p,date)&&(physicians?isPhysician(p):!isPhysician(p)));
  }
  function effectiveLeave(row){
    try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}
    catch(_){return !/(cancel|delete|inactive|ยกเลิก)/i.test(txt(row?.status));}
  }
  function leaveType(row){return txt(row?.type||row?.leave_type).split(':::')[0].trim();}
  function actualLeave(row){return !!row&&effectiveLeave(row)&&!!leaveType(row)&&leaveType(row)!=='ไม่รับเวร';}
  function inRange(date,row){
    const a=normDate(row?.start_date),b=normDate(row?.end_date||row?.start_date);
    return !!date&&(!a||date>=a)&&(!b||date<=b);
  }
  function leaveKind(row){
    const r=txt(row?.leave_period||row?.period||'เต็มวัน').toLowerCase();
    if(/ครึ่งเช้า|morning/.test(r))return 'morning';
    if(/ครึ่งบ่าย|afternoon/.test(r))return 'afternoon';
    return 'full';
  }
  function minute(v){const m=txt(v).match(/^(\d{1,2}):(\d{2})/);if(!m)return null;const h=Number(m[1]),n=Number(m[2]);return Number.isFinite(h)&&Number.isFinite(n)?h*60+n:null;}
  function timeText(m){m=Math.max(0,Math.floor(Number(m)||0));const h=Math.floor((m%1440)/60),n=m%60;return `${String(h).padStart(2,'0')}:${String(n).padStart(2,'0')}`;}
  function parseIds(v){
    if(Array.isArray(v))return v.filter(Boolean).map(String);
    const s=txt(v);if(!s)return [];
    try{const x=JSON.parse(s);if(Array.isArray(x))return x.filter(Boolean).map(String);}catch(_){ }
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  function clearlyInUnit(a){
    const location=txt(a?.location);if(!location)return false;
    return /เวชศาสตร์บริการโลหิต|ห้องบริจาคโลหิต|คลังเลือด|blood\s*bank|donor\s*room|cnmi\s*blood/i.test(location);
  }
  function blockingActivity(a){
    try{if(window.cnmiPhysicianActivityV512?.blockingActivity)return !!window.cnmiPhysicianActivityV512.blockingActivity(a);}catch(_){ }
    const type=txt(a?.event_type),words=`${txt(a?.title)} ${txt(a?.note)} ${txt(a?.location)}`;
    if(['อบรม','ประชุม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE'].includes(type))return true;
    if(/ติดสอน|สอน|สัมมนา|conference|training|teaching|ไปประชุม|ไปราชการ|นอกสถานที่|ออกหน่วย/i.test(words))return true;
    if(type==='อื่นๆ'&&txt(a?.location)&&!clearlyInUnit(a))return true;
    return false;
  }
  function rawActivityInterval(a){
    let s=minute(a?.start_time),e=minute(a?.end_time);
    if(s==null&&e==null)return [WORK_START,WORK_END];
    if(s==null)s=0;if(e==null)e=1440;
    if(e<=s)e+=1440;
    return [s,e];
  }
  function overlapInterval(a,b){return Math.max(a[0],b[0])<Math.min(a[1],b[1]);}
  function clippedInterval(a,b){const s=Math.max(a[0],b[0]),e=Math.min(a[1],b[1]);return s<e?[s,e]:null;}
  function leaveInterval(row){
    const k=leaveKind(row);
    if(k==='morning')return [WORK_START,MIDDAY];
    if(k==='afternoon')return [MIDDAY,WORK_END];
    return [WORK_START,WORK_END];
  }
  function activityLabel(a){return txt(a?.event_type)||'กิจกรรม';}
  function blockLabel(b){return b.kind==='leave'?b.label:`${b.label}`;}

  let renderCtx=null;
  function makeContext(date){
    const leavesById=new Map(),activitiesById=new Map(),relevantActivities=[];
    (S()?.leaves||[]).forEach(r=>{
      if(!actualLeave(r)||!inRange(date,r)||!r?.staff_id)return;
      const id=String(r.staff_id);if(!leavesById.has(id))leavesById.set(id,[]);leavesById.get(id).push(r);
    });
    (S()?.activities||[]).forEach(a=>{
      if(!a||!inRange(date,a)||!blockingActivity(a))return;
      relevantActivities.push(a);
      parseIds(a?.participant_ids).forEach(id=>{id=String(id);if(!activitiesById.has(id))activitiesById.set(id,[]);activitiesById.get(id).push(a);});
    });
    return {date,leavesById,activitiesById,relevantActivities};
  }

  function personBlocks(id,date,period=[WORK_START,WORK_END]){
    const sid=String(id||''),out=[],ctx=renderCtx&&renderCtx.date===date?renderCtx:null;
    const leaves=ctx?(ctx.leavesById.get(sid)||[]):(S()?.leaves||[]).filter(r=>String(r?.staff_id||'')===sid&&actualLeave(r)&&inRange(date,r));
    leaves.forEach(r=>{
      const x=clippedInterval(leaveInterval(r),period);if(x)out.push({start:x[0],end:x[1],kind:'leave',label:leaveType(r)||'ลา',title:leaveType(r)||'ลา'});
    });
    const activities=ctx?(ctx.activitiesById.get(sid)||[]):(S()?.activities||[]).filter(a=>a&&inRange(date,a)&&blockingActivity(a)&&parseIds(a?.participant_ids).includes(sid));
    activities.forEach(a=>{
      const x=clippedInterval(rawActivityInterval(a),period);if(x)out.push({start:x[0],end:x[1],kind:'activity',label:activityLabel(a),title:txt(a?.title),raw:a});
    });
    return out.sort((a,b)=>a.start-b.start||a.end-b.end);
  }
  function mergeIntervals(blocks){
    const arr=(blocks||[]).map(b=>[b.start,b.end]).filter(x=>x[0]<x[1]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const out=[];arr.forEach(x=>{const last=out[out.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push(x.slice());});return out;
  }
  function personBlockedAt(blocks,minutePoint){return blocks.some(b=>b.start<=minutePoint&&minutePoint<b.end);}
  function reasonAt(blocks,minutePoint){
    const hits=blocks.filter(b=>b.start<=minutePoint&&minutePoint<b.end);
    const uniq=[];hits.forEach(b=>{const x=blockLabel(b);if(x&&!uniq.includes(x))uniq.push(x);});return uniq.join('+')||'ไม่พร้อม';
  }
  function buildTimeline(staff,date,start,end){
    const blocksById=new Map();
    staff.forEach(p=>blocksById.set(String(p.id),personBlocks(p.id,date,[start,end])));
    const points=new Set([start,end]);blocksById.forEach(bs=>bs.forEach(b=>{points.add(Math.max(start,b.start));points.add(Math.min(end,b.end));}));
    const p=[...points].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b),segments=[];
    for(let i=0;i<p.length-1;i++){
      const a=p[i],b=p[i+1];if(a>=b)continue;const mid=(a+b)/2,absent=[],blocked=[];
      const groupTotal={MT:0,'เคิก':0},groupBlocked={MT:0,'เคิก':0};
      staff.forEach(st=>{
        const bs=blocksById.get(String(st.id))||[];
        const leave=bs.find(x=>x.kind==='leave'&&x.start<=mid&&mid<x.end);
        if(leave){absent.push({id:String(st.id),name:nick(st.id),reason:leave.label});return;}
        const g=groupOf(st);if(g==='MT'||g==='เคิก')groupTotal[g]++;
        const acts=bs.filter(x=>x.kind==='activity'&&x.start<=mid&&mid<x.end);
        if(acts.length){blocked.push({id:String(st.id),name:nick(st.id),group:g,reason:[...new Set(acts.map(x=>x.label))].join('+')});if(g==='MT'||g==='เคิก')groupBlocked[g]++;}
      });
      const total=staff.length-absent.length,available=total-blocked.length;
      const groupAvailable={MT:groupTotal.MT-groupBlocked.MT,'เคิก':groupTotal['เคิก']-groupBlocked['เคิก']};
      const key=absent.map(x=>x.id).sort().join('|')+'/'+blocked.map(x=>x.id+':'+x.reason).sort().join('|');
      const last=segments[segments.length-1];
      if(last&&last.blockedKey===key)last.end=b;
      else segments.push({start:a,end:b,total,available,absent,blocked,blockedKey:key,groupAvailable,groupTotal});
    }
    if(!segments.length)segments.push({start,end,total:staff.length,available:staff.length,absent:[],blocked:[],blockedKey:'',groupAvailable:{MT:staff.filter(x=>groupOf(x)==='MT').length,'เคิก':staff.filter(x=>groupOf(x)==='เคิก').length},groupTotal:{MT:staff.filter(x=>groupOf(x)==='MT').length,'เคิก':staff.filter(x=>groupOf(x)==='เคิก').length}});
    return {staff,blocksById,segments};
  }
  function minSummary(timeline){
    const seg=timeline.segments;
    const minAvailable=Math.min(...seg.map(x=>x.available));
    const total=Math.min(...seg.filter(x=>x.available===minAvailable).map(x=>x.total));
    const minGroups={MT:Math.min(...seg.map(x=>x.groupAvailable.MT)),'เคิก':Math.min(...seg.map(x=>x.groupAvailable['เคิก']))};
    const totalGroups={MT:Math.min(...seg.filter(x=>x.groupAvailable.MT===minGroups.MT).map(x=>x.groupTotal.MT)),'เคิก':Math.min(...seg.filter(x=>x.groupAvailable['เคิก']===minGroups['เคิก']).map(x=>x.groupTotal['เคิก']))};
    return {minAvailable,total,totalGroups,minGroups};
  }
  function impactSummary(staff,date){
    const byType=new Map(),staffIds=new Set(staff.map(p=>String(p.id)));
    const activities=(renderCtx&&renderCtx.date===date)?renderCtx.relevantActivities:(S()?.activities||[]).filter(a=>a&&inRange(date,a)&&blockingActivity(a));
    activities.forEach(a=>{
      const ids=parseIds(a?.participant_ids),type=activityLabel(a);if(!byType.has(type))byType.set(type,new Set());
      const set=byType.get(type),interval=rawActivityInterval(a);ids.forEach(id=>{if(staffIds.has(String(id))){const ls=(renderCtx?.leavesById.get(String(id))||[]).map(leaveInterval);const relevant=clippedInterval(interval,[WORK_START,WORK_END]);if(relevant&&(!ls.length||[relevant[0],...ls.flat()].filter(t=>t>=relevant[0]&&t<relevant[1]).some(t=>!ls.some(l=>l[0]<=t&&t<l[1]))))set.add(String(id));}});
    });
    return [...byType.entries()].map(([type,set])=>({type,count:set.size})).filter(x=>x.count>0);
  }
  function periodBlockPeople(tl){const ids=new Set();tl.segments.forEach(s=>s.blocked.forEach(x=>ids.add(x.id)));return ids.size;}
  function renderTimelineRows(full,total){
    return full.segments.map(s=>{
      const people=s.blocked.length?s.blocked.map(x=>`<span>${esc(x.name)} <small>${esc(x.reason)}</small></span>`).join(''):'<em>ไม่มีคนติดประชุม/กิจกรรม</em>';
      return `<div class="v562-time-row"><b>${timeText(s.start)}–${timeText(s.end)}</b><strong class="${s.available<total?'is-low':''}">พร้อม ${s.available}/${s.total}</strong><div>${people}</div></div>`;
    }).join('');
  }
  function manpowerCard(date){
    const staff=activeStaff(date,{physicians:false});
    const morningTL=buildTimeline(staff,date,WORK_START,MIDDAY),afternoonTL=buildTimeline(staff,date,MIDDAY,WORK_END),fullTL=buildTimeline(staff,date,WORK_START,WORK_END);
    const am=minSummary(morningTL),pm=minSummary(afternoonTL),impacts=impactSummary(staff,date);
    const activityPills=impacts.length?impacts.map(x=>`<span>${esc(x.type)} <b>${x.count}</b></span>`).join(''):'<span class="muted">ไม่มีกิจกรรมที่หักกำลังคน</span>';
    const lowSegments=fullTL.segments.filter(s=>s.available<s.total).length;
    return `<div class="card v433-manpower-card v562-manpower-card" data-v433-manpower data-v562-manpower>
      <div class="v562-title-row"><div class="v433-manpower-title">กำลังคนพร้อมปฏิบัติงาน <small>หักลา + กิจกรรมตามเวลาจริง</small></div><span class="v562-live-pill">08:00–16:00</span></div>
      <div class="v433-period-totals v562-period-totals">
        <div><span>เช้า</span><strong>${am.minAvailable}</strong><small>/${am.total} ต่ำสุด</small></div>
        <div class="v433-divider" aria-hidden="true"></div>
        <div><span>บ่าย</span><strong>${pm.minAvailable}</strong><small>/${pm.total} ต่ำสุด</small></div>
      </div>
      <div class="v433-type-breakdown v562-type-breakdown">
        <div class="v433-type-line"><b>เช้า</b><span>MT <strong>${am.minGroups.MT}</strong>/${am.totalGroups.MT}</span><span>เคิก <strong>${am.minGroups['เคิก']}</strong>/${am.totalGroups['เคิก']}</span>${periodBlockPeople(morningTL)?`<span class="v562-impact">ไม่พร้อม ${periodBlockPeople(morningTL)} คน</span>`:''}</div>
        <div class="v433-type-line"><b>บ่าย</b><span>MT <strong>${pm.minGroups.MT}</strong>/${pm.totalGroups.MT}</span><span>เคิก <strong>${pm.minGroups['เคิก']}</strong>/${pm.totalGroups['เคิก']}</span>${periodBlockPeople(afternoonTL)?`<span class="v562-impact">ไม่พร้อม ${periodBlockPeople(afternoonTL)} คน</span>`:''}</div>
      </div>
      <div class="v562-activity-impact">${activityPills}</div>
      <details class="v562-time-details" ${lowSegments?'':'data-no-impact'}><summary>ดูตามช่วงเวลา</summary><div class="v562-time-list">${renderTimelineRows(fullTL,staff.length)}</div></details>
      <div class="v433-manpower-note">ผู้ลาถูกตัดออกจากฐานในช่วงที่ลา · ประชุม/อบรมหักเฉพาะคนที่ยังปฏิบัติงาน · แพทย์ดูสถานะตามเวลาจริงที่ Consult</div>
    </div>`;
  }

  function assignmentModel(date){
    try{
      const m=window.cnmiPhysicianConsultV452?.baseForDate?.(date);if(!m)return null;
      if(m.weekday)return {weekday:true,rows:[
        {id:m.donor,time:'08:00–16:00',site:'Donor',interval:[WORK_START,WORK_END]},
        {id:m.bb,time:'08:00–16:00',site:'Blood Bank',interval:[WORK_START,WORK_END]},
        {id:m.combined,time:'16:00–08:00',site:'Donor & BB',interval:[WORK_END,WORK_END+16*60]}
      ]};
      return {weekday:false,rows:[{id:m.combined,time:'ตลอดวัน',site:'Donor & BB',interval:[0,1440]}]};
    }catch(_){return null;}
  }
  function physicianBlocks(id,date,period){
    if(!id)return [];
    const base=personBlocks(id,date,[Math.max(0,period[0]),Math.min(1440,period[1])]);
    // Full-day physician leave also blocks an overnight Consult assignment, matching V510 behavior.
    if(period[1]>1440){
      const hasFull=(S()?.leaves||[]).some(r=>String(r?.staff_id||'')===String(id)&&actualLeave(r)&&inRange(date,r)&&leaveKind(r)==='full');
      if(hasFull)base.push({start:period[0],end:period[1],kind:'leave',label:'ลาเต็มวัน',title:'ลาเต็มวัน'});
    }
    return base.sort((a,b)=>a.start-b.start||a.end-b.end);
  }
  function compactReasonBlocks(blocks){
    const out=[];
    blocks.forEach(b=>{
      const label=b.kind==='leave'?b.label:activityLabel(b.raw||{})||b.label;
      const text=(b.kind==='leave'&&/เต็มวัน/.test(label))?label:`${label} ${timeText(b.start)}–${timeText(b.end)}`;
      if(!out.includes(text))out.push(text);
    });
    return out;
  }
  function minReadyForAssignments(rows,start,end,date){
    const activeRows=rows.filter(r=>r.id&&overlapInterval(r.interval,[start,end]));
    if(!activeRows.length)return {min:0,total:0};
    const points=new Set([start,end]);
    const blocks=new Map();
    activeRows.forEach((r,i)=>{
      const bs=physicianBlocks(r.id,date,r.interval).filter(b=>overlapInterval([b.start,b.end],[start,end]));blocks.set(i,bs);
      bs.forEach(b=>{points.add(Math.max(start,b.start));points.add(Math.min(end,b.end));});
      points.add(Math.max(start,r.interval[0]));points.add(Math.min(end,r.interval[1]));
    });
    const p=[...points].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b);let min=Infinity,maxTotal=0;
    for(let j=0;j<p.length-1;j++){
      const a=p[j],b=p[j+1];if(a>=b)continue;const mid=(a+b)/2;
      let total=0,ready=0;activeRows.forEach((r,i)=>{if(r.interval[0]<=mid&&mid<r.interval[1]){total++;if(!personBlockedAt(blocks.get(i)||[],mid))ready++;}});
      if(total){maxTotal=Math.max(maxTotal,total);min=Math.min(min,ready);}
    }
    if(min===Infinity)min=activeRows.length;
    return {min,total:maxTotal||activeRows.length};
  }
  function decoratePhysicianCard(root,date){
    const card=root.querySelector?.('[data-v452-physician-card]');if(!card)return;
    const model=assignmentModel(date);if(!model)return;

    const desktopRows=[...card.querySelectorAll('.v452-dashboard-table tbody tr')];
    const mobileRows=[...card.querySelectorAll('.v456-mobile-consult-row')];
    model.rows.forEach((r,i)=>{
      if(!r.id)return;const blocks=physicianBlocks(r.id,date,r.interval),reasons=compactReasonBlocks(blocks),name=nick(r.id);
      if(!reasons.length)return;
      const status=`<span class="v562-physician-busy"><b>${esc(name)}</b><small>${reasons.map(esc).join(' · ')}</small></span>`;
      const dcell=desktopRows[i]?.children?.[2];if(dcell)dcell.innerHTML=status;
      const mcell=mobileRows[i]?.querySelector?.('.v456-mobile-consult-doctor');if(mcell){const label=mcell.querySelector('.v456-mobile-doctor-label');mcell.innerHTML='';if(label)mcell.appendChild(label);mcell.insertAdjacentHTML('beforeend',status);}
    });

    const meta=card.querySelector('.v452-card-meta');
    if(meta){
      const badge=meta.querySelector('.v452-ready');
      if(model.weekday){
        const day=minReadyForAssignments(model.rows,WORK_START,WORK_END,date);
        const night=minReadyForAssignments(model.rows,WORK_END,WORK_END+16*60,date);
        if(badge){badge.textContent=`กลางวันต่ำสุด ${day.min}/${day.total}`;badge.classList.toggle('is-complete',day.min===day.total);badge.classList.toggle('v562-has-gap',day.min<day.total);}
        let nb=meta.querySelector('.v562-night-ready');if(!nb){nb=document.createElement('span');nb.className='v562-night-ready';badge?.insertAdjacentElement('afterend',nb);}
        nb.textContent=`นอกเวลา ${night.min}/${night.total}`;nb.classList.toggle('is-complete',night.min===night.total);
      }else{
        const all=minReadyForAssignments(model.rows,0,1440,date);
        if(badge){badge.textContent=`พร้อมต่ำสุด ${all.min}/${all.total}`;badge.classList.toggle('is-complete',all.min===all.total);badge.classList.toggle('v562-has-gap',all.min<all.total);}
      }
    }
    if(!card.querySelector('.v562-physician-note'))card.insertAdjacentHTML('beforeend','<div class="v562-physician-note">ประชุม/อบรม/ออกหน่วยหักเฉพาะช่วงเวลาจริง · หลายกิจกรรมของแพทย์คนเดียวแสดงครบทุกช่วง</div>');
  }

  function decorate(html){
    if(typeof html!=='string'||!html)return html;
    const date=selectedDate();renderCtx=makeContext(date);
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      if(!isOffDay(date)){
        const old=tpl.content.querySelector('[data-v433-manpower]');
        if(old){const box=document.createElement('template');box.innerHTML=manpowerCard(date).trim();old.replaceWith(box.content.firstElementChild);}
      }
      decoratePhysicianCard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decorate`,err);return html;}
    finally{renderCtx=null;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV562(){return decorate(String(previousDashboard.apply(this,arguments)||''));};
    wrapped.__v562Wrapped=true;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');style.id='cnmi-v562-style';style.textContent=`
    .v562-manpower-card{gap:9px!important}.v562-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.v562-live-pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#edf7ff;border:1px solid #cfe8f8;color:#38749a;font-size:9px;font-weight:900;white-space:nowrap}
    .v562-period-totals small{white-space:nowrap}.v562-type-breakdown .v433-type-line{align-items:center}.v562-impact{display:inline-flex;padding:2px 6px;border-radius:999px;background:#fff3e5;color:#a65e16;font-weight:850}
    .v562-activity-impact{display:flex;gap:5px;flex-wrap:wrap}.v562-activity-impact>span{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:999px;background:#fff7e9;border:1px solid #ffe0ad;color:#8d651e;font-size:9px;font-weight:800}.v562-activity-impact>span.muted{background:#f6f8fa;border-color:#e7edf2;color:#8a99a6}.v562-activity-impact b{color:#6f4b0d}
    .v562-time-details{border-top:1px dashed #dce7ef;padding-top:7px}.v562-time-details summary{cursor:pointer;color:#2d79a8;font-size:10px;font-weight:900;list-style:none}.v562-time-details summary::-webkit-details-marker{display:none}.v562-time-details summary::before{content:'▸';display:inline-block;margin-right:5px;transition:transform .15s}.v562-time-details[open] summary::before{transform:rotate(90deg)}.v562-time-list{display:grid;gap:5px;margin-top:7px}.v562-time-row{display:grid;grid-template-columns:86px 94px minmax(0,1fr);align-items:start;gap:7px;padding:6px 7px;border-radius:9px;background:#f8fbfd;font-size:9px;color:#657b8d}.v562-time-row>b{color:#324e66}.v562-time-row>strong{color:#2b7caa}.v562-time-row>strong.is-low{color:#b05f16}.v562-time-row>div{display:flex;gap:4px;flex-wrap:wrap}.v562-time-row span{display:inline-flex;gap:3px;padding:2px 5px;border-radius:999px;background:#fff2e2;color:#8c5d18;font-weight:800}.v562-time-row span small{font-size:8px;color:#a77936}.v562-time-row em{font-style:normal;color:#8da0af}
    .v562-physician-busy{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;max-width:100%;padding:6px 9px;border-radius:12px;background:#fff6e7;border:1px solid #ffd89a;color:#8f5e14;line-height:1.25}.v562-physician-busy b{font-size:11px}.v562-physician-busy small{font-size:9px;color:#a46d18;white-space:normal}.v562-night-ready{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eef6fc;border:1px solid #d6e7f3;color:#55758c;font-size:9px;font-weight:900}.v562-night-ready.is-complete{background:#eef9f2;border-color:#ccebd7;color:#3f7b57}.v452-ready.v562-has-gap{background:#fff7e7!important;border-color:#ffd99a!important;color:#956111!important}.v562-physician-note{margin-top:8px;font-size:9px;line-height:1.35;color:#8a9cab}
    @media(max-width:820px){
      .v562-title-row{align-items:flex-start}.v562-live-pill{font-size:10px;padding:5px 8px}.v562-activity-impact>span{font-size:10px;padding:5px 8px}.v562-time-details summary{font-size:12px}.v562-time-row{grid-template-columns:88px 98px minmax(0,1fr);font-size:10px;padding:7px 8px}.v562-time-row span small{font-size:9px}.v562-physician-busy{padding:7px 11px}.v562-physician-busy b{font-size:14px}.v562-physician-busy small{font-size:11px}.v562-night-ready{font-size:10px;padding:5px 8px}.v562-physician-note{font-size:10px}
    }
    @media(max-width:520px){
      .v562-title-row{display:grid;grid-template-columns:1fr auto}.v562-manpower-card .v433-manpower-title small{display:block;margin:3px 0 0}.v562-time-row{grid-template-columns:78px 1fr}.v562-time-row>div{grid-column:1/-1;padding-left:0}.v562-time-row>strong{text-align:right}.v562-activity-impact{gap:4px}
    }
  `;document.head.appendChild(style);

  function versionChip(){try{document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{chip.textContent='v568';chip.title='Realtime manpower availability by leave + activity time (V562)';});}catch(_){ }}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',versionChip,{once:true});else versionChip();
  window.addEventListener('pageshow',versionChip);
  window.cnmiAvailabilityV562={version:VERSION,personBlocks,buildTimeline,manpowerCard,blockingActivity};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v562-dashboard-realtime-availability.js", error); }
;

/* Original source: patch-v568-release-notices.js */
try {
/* In-app release notes, per signed-in user. Remote manifest also alerts open older tabs. */
(()=>{
  'use strict';
  const RUNNING_VERSION=572;
  const bundled={version:'572',title:'อัปเดต Staff Planner v572',changes:[
    'แก้เมนูย่อย ลงชื่ออยู่เวร / ขอ OT เพิ่ม ให้กดเข้าแต่ละหน้าได้ตามปกติ',
    'เพิ่มการตั้ง / รีเซ็ตรหัสชั่วคราวโดย Admin ผ่าน Supabase Edge Function โดยไม่ส่งอีเมล',
    'ป้องกันบันทึกการลาซ้ำซ้อนกับรายการเดิม และแจ้งเตือนเป็น Pop-up กลางแอพ'
  ]};
  let checking=false, showing=false, lastFetch=0, pending=null;
  function signedIn(){return !!(typeof state!=='undefined'&&state.profile&&document.getElementById('appView')&&!document.getElementById('appView').classList.contains('hidden'));}
  function identity(){return String(state.session?.user?.id||state.profile?.user_id||state.profile?.id||'').trim();}
  function safe(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function show(info){
    if(showing||!signedIn()||!identity())return;
    const version=String(info.version||'');
    if(!/^\d+$/.test(version)||!Array.isArray(info.changes)||!info.changes.length)return;
    const key=`cnmi-release-seen:${identity()}`;
    try{if(Number(localStorage.getItem(key)||0)>=Number(version))return;}catch(_){}
    // Leave an existing task dialog undisturbed; check again shortly.
    if(document.getElementById('modal')&&!document.getElementById('modal').classList.contains('hidden'))return;
    showing=true;
    const overlay=document.createElement('div');overlay.className='v568-release-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','มีอะไรใหม่ในแอพ');
    const newer=Number(version)>RUNNING_VERSION;
    overlay.innerHTML=`<div class="v568-release-card"><span class="v568-release-tag">มีอะไรใหม่</span><h2>${safe(info.title||`อัปเดต Staff Planner v${version}`)}</h2><ul>${info.changes.slice(0,12).map(x=>`<li>${safe(x)}</li>`).join('')}</ul><div class="v568-release-actions"><button type="button" data-release-close>รับทราบ</button>${newer?'<button type="button" data-release-reload>รีโหลดเพื่อใช้เวอร์ชันใหม่</button>':''}</div></div>`;
    const style=document.getElementById('v568-release-style');
    if(!style){const s=document.createElement('style');s.id='v568-release-style';s.textContent='.v568-release-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(16,35,55,.58);display:grid;place-items:center;padding:18px}.v568-release-card{box-sizing:border-box;background:white;border-radius:22px;padding:25px;width:min(520px,100%);box-shadow:0 18px 55px #18314d55;color:#17344f;font-family:inherit}.v568-release-tag{display:inline-block;border-radius:99px;padding:5px 12px;background:#e5f4ff;color:#17699b;font-weight:700}.v568-release-card h2{margin:14px 0}.v568-release-card ul{padding-left:24px;line-height:1.7}.v568-release-card li{margin:8px 0}.v568-release-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px}.v568-release-actions button{border:1px solid #b8d4e8;border-radius:11px;background:#e7f5ff;padding:10px 16px;color:#145582;font:inherit;font-weight:700;cursor:pointer}.v568-release-actions [data-release-reload]{background:#66b8e3;color:white;border-color:#66b8e3}';document.head.appendChild(s);}
    function dismiss(reload){try{localStorage.setItem(key,version);}catch(_){}overlay.remove();showing=false;if(reload)location.reload();}
    overlay.querySelector('[data-release-close]').addEventListener('click',()=>dismiss(false));
    overlay.querySelector('[data-release-reload]')?.addEventListener('click',()=>dismiss(true));
    document.body.appendChild(overlay);
    overlay.querySelector('button')?.focus();
  }
  async function check(){
    if(checking||showing||!signedIn())return;
    if(pending){show(pending);if(showing)return;}
    if(Date.now()-lastFetch<300000)return;
    checking=true;
    lastFetch=Date.now();
    try{
      const response=await fetch(`release-notes.json?t=${Date.now()}`,{cache:'no-store'});
      pending=response.ok?await response.json():bundled;
    }catch(_){pending=bundled;}finally{checking=false;show(pending);}
  }
  // Login can complete after scripts load; the interval also observes a restored session.
  setInterval(check,3000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastFetch=0;check();}});
  window.addEventListener('focus',()=>{lastFetch=0;check();});
})();

} catch (error) { console.error("[v569] patch-v568-release-notices.js", error); }
;

/* Original source: patch-v569-centered-feedback.js */
try {
/* Informational browser alerts use the same centered, accessible app surface.
   Confirmation workflows keep their asynchronous confirmDialog implementation. */
(() => {
  'use strict';
  if (window.__CNMI_V569_CENTERED_FEEDBACK__) return;
  window.__CNMI_V569_CENTERED_FEEDBACK__ = true;

  const messages = [];
  let visible = false;
  let previousFocus = null;

  function present() {
    if (visible || !messages.length || !document.body) return;
    visible = true;
    previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.id = 'cnmiAlertV569';
    backdrop.className = 'cnmi-alert-backdrop-v569';
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'cnmiAlertTitleV569');
    backdrop.setAttribute('aria-describedby', 'cnmiAlertMessageV569');
    const card = document.createElement('div');
    card.className = 'cnmi-alert-card-v569';
    const title = document.createElement('h2');
    title.id = 'cnmiAlertTitleV569';
    title.textContent = 'แจ้งเตือน';
    const message = document.createElement('p');
    message.id = 'cnmiAlertMessageV569';
    message.textContent = messages.shift();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'รับทราบ';
    button.className = 'primary-btn';
    function dismiss() {
      backdrop.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      visible = false;
      if (!messages.length && previousFocus?.isConnected) previousFocus.focus();
      present();
    }
    function onKeydown(event) {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        dismiss();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        button.focus();
      }
    }
    button.addEventListener('click', dismiss, {once:true});
    backdrop.addEventListener('keydown', onKeydown);
    card.append(title, message, button);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    button.focus();
  }

  window.alert = function centeredAppAlert(value) {
    messages.push(String(value === undefined ? '' : value));
    if (document.body) present();
    else document.addEventListener('DOMContentLoaded', present, {once:true});
  };
})();

} catch (error) { console.error("[v569] patch-v569-centered-feedback.js", error); }
;
