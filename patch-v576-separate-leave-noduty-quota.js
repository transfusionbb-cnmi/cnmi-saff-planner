/* CNMI Staff Planner — V576
   Separate quota rules for "ลา" and "ไม่รับเวร" (agreement 30 Apr 2026 / 30 เม.ย. 2569)

   A) ไม่รับเวร (NO-DUTY) — separate from leave and does NOT mean daytime absence
      - MT: Mon–Fri <= 2 persons/day; Sat–Sun <= 3 persons/day
      - Clerk group = เฟื่อง, แก๊ส, แตง: <= 1 person/day on all days
      - Public-holiday blocking remains handled by the existing holiday guard.

   B) Actual leave (all types except ไม่รับเวร)
      - MT: planned leave <= 2 persons/day; same-day emergency sick/personal leave <= 2 additional persons/day; total actual leave <= 4/day
      - Clerk: planned leave <= 1 person/day; same-day emergency sick/personal leave <= 1 additional person/day; total actual leave <= 2/day
      - Emergency = ลาป่วย/ลากิจ submitted on the actual leave date in Asia/Bangkok.

   Counts unique staff per day. Existing excess rows are surfaced to Admin for review; no auto-delete.
*/
(() => {
  'use strict';
  if (window.__CNMI_V576_SEPARATE_QUOTA__) return;
  window.__CNMI_V576_SEPARATE_QUOTA__ = true;

  const VERSION = 'V576';
  const AGREEMENT = '30 เมษายน 2569';
  const CLERK_NICKS = new Set(['เฟื่อง','แก๊ส','แตง']);
  const LEAVE_LIMITS = {
    MT: { planned:2, emergency:2, total:4, label:'MT' },
    CLERK: { planned:1, emergency:1, total:2, label:'Clerk (เฟื่อง / แก๊ส / แตง)' }
  };
  const NODUTY_LIMITS = {
    MT: { weekday:2, weekend:3, label:'MT' },
    CLERK: { weekday:1, weekend:1, label:'Clerk (เฟื่อง / แก๊ส / แตง)' }
  };

  const S = () => { try { return (typeof state !== 'undefined' && state) ? state : (window.state || {}); } catch (_) { return window.state || {}; } };
  const txt = v => String(v ?? '').trim();
  const dateKey = v => txt(v).slice(0,10);
  const esc = v => { try { return typeof escapeHtml === 'function' ? escapeHtml(v) : txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); } catch (_) { return txt(v); } };
  const isAdminSafe = () => { try { return typeof isAdmin === 'function' ? !!isAdmin() : S()?.profile?.role === 'admin'; } catch (_) { return S()?.profile?.role === 'admin'; } };
  const currentStaffSafe = () => { try { return typeof currentStaffId === 'function' ? currentStaffId() : S()?.profile?.id; } catch (_) { return S()?.profile?.id; } };

  function bangkokDateFromInstant(value){
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return dateKey(value);
      const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
      const o = Object.fromEntries(parts.map(p=>[p.type,p.value]));
      return `${o.year}-${o.month}-${o.day}`;
    } catch (_) { return dateKey(value); }
  }
  function bangkokToday(){ return bangkokDateFromInstant(new Date()); }
  function dateRange(start,end){
    const out=[]; const a=dateKey(start), b=dateKey(end||start); if(!a||!b||b<a) return out;
    const d=new Date(`${a}T12:00:00+07:00`), last=new Date(`${b}T12:00:00+07:00`);
    while(d<=last){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); out.push(`${y}-${m}-${day}`); d.setDate(d.getDate()+1); }
    return out;
  }
  function isWeekendDate(date){
    try { if (typeof isWeekend === 'function') return !!isWeekend(date); } catch (_) {}
    const d = new Date(`${date}T12:00:00+07:00`); const n=d.getDay(); return n===0||n===6;
  }
  function thaiDate(d){
    try { return typeof formatThaiDate === 'function' ? formatThaiDate(d) : new Date(`${d}T12:00:00+07:00`).toLocaleDateString('th-TH',{dateStyle:'medium'}); }
    catch (_) { return d; }
  }
  function staffObj(id){ return (S().staff||[]).find(x=>String(x?.id||'')===String(id||'')); }
  function staffNickSafe(id){ const s=staffObj(id); return txt(s?.nickname||s?.full_name||s?.display_name)||'เจ้าหน้าที่'; }
  function staffGroup(id){
    const s=staffObj(id); if(!s) return null;
    const nick=txt(s.nickname||s.nick_name||s.full_name);
    const role=txt(s.role).toLowerCase(), type=txt(s.staff_type);
    if (role.includes('physician') || type.includes('แพทย์')) return null;
    if (CLERK_NICKS.has(nick)) return 'CLERK';
    return 'MT';
  }
  function inactive(row){
    try { if (typeof isLeaveFinalInactive === 'function') return !!isLeaveFinalInactive(row); } catch (_) {}
    const st=txt(row?.status).toLowerCase();
    return ['cancelled','canceled','deleted','inactive','void','rejected'].includes(st) || ['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(txt(row?.status));
  }
  function typeBase(rowOrType){ return txt(typeof rowOrType==='string'?rowOrType:(rowOrType?.type||rowOrType?.leave_type)).split(':::')[0].trim(); }
  function isNoDuty(rowOrType){ return typeBase(rowOrType)==='ไม่รับเวร'; }
  function isActualLeave(rowOrType){ const t=typeBase(rowOrType); return !!t && t!=='ไม่รับเวร'; }
  function emergencyEligibleType(v){ const t=typeBase(v); return t==='ลาป่วย' || t==='ลากิจ'; }
  function submittedDate(row){ return bangkokDateFromInstant(row?.created_at||row?.submitted_at||row?.requested_at||''); }
  function isEmergencyRow(row,date){ return isActualLeave(row) && emergencyEligibleType(row) && submittedDate(row)===date; }
  function rowTouches(row,date){ const s=dateKey(row?.start_date), e=dateKey(row?.end_date||row?.start_date); return !!s&&!!e&&s<=date&&date<=e; }

  function noDutyLimit(group,date){ const cfg=NODUTY_LIMITS[group]; return isWeekendDate(date)?cfg.weekend:cfg.weekday; }

  function analyzeNoDuty(rows,date,group,synthetic=null){
    const candidates=(rows||[]).filter(r=>r&&!inactive(r)&&isNoDuty(r)&&staffGroup(r.staff_id)===group&&rowTouches(r,date));
    if (synthetic && isNoDuty(synthetic) && staffGroup(synthetic.staff_id)===group && rowTouches(synthetic,date)) candidates.push(synthetic);
    const map=new Map();
    for(const r of candidates){ const id=String(r.staff_id||''); if(!id) continue; if(!map.has(id))map.set(id,{staffId:id,rows:[]}); map.get(id).rows.push(r); }
    return { people:[...map.values()], limit:noDutyLimit(group,date) };
  }

  function analyzeLeave(rows,date,group,synthetic=null){
    const candidates=(rows||[]).filter(r=>r&&!inactive(r)&&isActualLeave(r)&&staffGroup(r.staff_id)===group&&rowTouches(r,date));
    if (synthetic && isActualLeave(synthetic) && staffGroup(synthetic.staff_id)===group && rowTouches(synthetic,date)) candidates.push(synthetic);
    const byStaff=new Map();
    for(const r of candidates){
      const id=String(r.staff_id||''); if(!id) continue;
      let rec=byStaff.get(id); if(!rec){rec={staffId:id,planned:false,emergency:false,rows:[]};byStaff.set(id,rec);}
      rec.rows.push(r);
      if(isEmergencyRow(r,date)) rec.emergency=true; else rec.planned=true;
    }
    const planned=[...byStaff.values()].filter(x=>x.planned);
    const emergency=[...byStaff.values()].filter(x=>x.emergency&&!x.planned);
    const total=[...byStaff.values()];
    return {planned,emergency,total,limits:LEAVE_LIMITS[group]};
  }

  function firstTimestampFor(rec,date,kind){
    const rows=(rec?.rows||[]).filter(r => kind==='noduty' ? isNoDuty(r) : (kind==='planned' ? isActualLeave(r)&&!isEmergencyRow(r,date) : isEmergencyRow(r,date)));
    const t=rows.map(r=>Date.parse(r.created_at||'')||0).filter(Boolean).sort((a,b)=>a-b)[0];
    return t || Number.MAX_SAFE_INTEGER;
  }
  function names(list){ return list.map(x=>staffNickSafe(x.staffId)).filter(Boolean).join(', ') || '-'; }

  async function freshRows(start,end){
    const client=(()=>{ try { return (typeof sb !== 'undefined' && sb) ? sb : window.sb; } catch (_) { return window.sb; } })();
    if(!client?.from) return Array.isArray(S().leaves)?S().leaves:[];
    try{
      const q=await client.from('leave_requests')
        .select('id,staff_id,type,start_date,end_date,leave_period,status,cancellation_requested,created_at')
        .lte('start_date',end).gte('end_date',start).order('created_at',{ascending:true});
      if(!q?.error&&Array.isArray(q?.data)) return q.data;
      console.warn(`[${VERSION}] quota fresh query failed; fallback to loaded state`,q?.error);
    }catch(error){ console.warn(`[${VERSION}] quota fresh query exception; fallback to loaded state`,error); }
    return Array.isArray(S().leaves)?S().leaves:[];
  }

  function noDutyPopup(group,date,a){
    const l=NODUTY_LIMITS[group], limit=a.limit, dayText=isWeekendDate(date)?'เสาร์–อาทิตย์':'จันทร์–ศุกร์';
    return `ไม่สามารถบันทึก “ไม่รับเวร” ได้\n\nวันที่ ${thaiDate(date)} (${dayText}) กลุ่ม ${l.label} มีผู้ลงไม่รับเวรครบโควตา ${limit} คนแล้ว\nผู้ใช้โควตา: ${names(a.people)}\n\n“ไม่รับเวร” เป็นโควตาแยกจากวันลา ตามข้อตกลงของหน่วยงาน วันที่ ${AGREEMENT}\nกรุณาเลือกวันอื่นหรือติดต่อหัวหน้าหน่วยค่ะ`;
  }
  function plannedLeavePopup(group,date,a){
    const l=LEAVE_LIMITS[group];
    return `ไม่สามารถบันทึกวันลาได้\n\nวันที่ ${thaiDate(date)} กลุ่ม ${l.label} มีผู้ลาที่วางแผนล่วงหน้าครบ ${l.planned} คนแล้ว\nผู้ใช้โควตาล่วงหน้า: ${names(a.planned)}\n\nตามข้อตกลงของหน่วยงาน วันที่ ${AGREEMENT}\nลาป่วย/ลากิจที่ยื่นล่วงหน้าจะนับเป็น “ลาล่วงหน้า” ไม่ใช่โควตาฉุกเฉินค่ะ`;
  }
  function emergencyLeavePopup(group,date,a){
    const l=LEAVE_LIMITS[group];
    return `ไม่สามารถบันทึกวันลาได้\n\nวันที่ ${thaiDate(date)} กลุ่ม ${l.label} ใช้โควตาฉุกเฉินวันจริงครบ ${l.emergency} คนแล้ว\nผู้ใช้โควตาฉุกเฉิน: ${names(a.emergency)}\n\nโควตาฉุกเฉินใช้ได้เฉพาะ “ลาป่วย/ลากิจ” ที่บันทึกในวันนั้นจริง ตามข้อตกลงวันที่ ${AGREEMENT}\nกรุณาติดต่อหัวหน้าหน่วยค่ะ`;
  }
  function totalLeavePopup(group,date,a){
    const l=LEAVE_LIMITS[group];
    return `ไม่สามารถบันทึกวันลาได้\n\nวันที่ ${thaiDate(date)} กลุ่ม ${l.label} มีผู้ลารวมครบจำนวนสูงสุด ${l.total} คนแล้ว\nผู้ลาทั้งหมด: ${names(a.total)}\n\nหมายเหตุ: “ไม่รับเวร” ไม่นับเป็นการขาดงานและไม่รวมในจำนวนนี้\nตามข้อตกลงของหน่วยงาน วันที่ ${AGREEMENT}\nกรุณาติดต่อหัวหน้าหน่วยค่ะ`;
  }
  function showCentered(message){ try{ window.alert(message); }catch(_){ try{ if(typeof showToast==='function') showToast(message,{tone:'error'}); }catch(__){} } }

  async function quotaConflict(form){
    if(!form) return null;
    const fd=new FormData(form);
    const staffId=String(isAdminSafe()?(fd.get('staff_id')||currentStaffSafe()):currentStaffSafe()||'');
    const group=staffGroup(staffId); if(!group) return null;
    const start=dateKey(fd.get('start_date')), end=dateKey(fd.get('end_date')||start), type=txt(fd.get('type'));
    if(!start||!end||end<start||!type) return null;
    const rows=await freshRows(start,end);
    const editId=String(S().editingLeaveId||'');
    const filtered=rows.filter(r=>!editId||String(r.id||'')!==editId);
    const submitDate=bangkokToday();
    const synthetic={id:'__NEW__',staff_id:staffId,type,start_date:start,end_date:end,status:'active',created_at:`${submitDate}T12:00:00+07:00`};
    for(const date of dateRange(start,end)){
      if(isNoDuty(type)){
        const before=analyzeNoDuty(filtered,date,group,null);
        const after=analyzeNoDuty(filtered,date,group,synthetic);
        if(after.people.length>after.limit) return {message:noDutyPopup(group,date,before),date,kind:'noduty'};
        continue;
      }
      const before=analyzeLeave(filtered,date,group,null);
      const after=analyzeLeave(filtered,date,group,synthetic);
      const candidateEmergency=emergencyEligibleType(type)&&submitDate===date;
      if(after.total.length>after.limits.total) return {message:totalLeavePopup(group,date,before),date,kind:'leave-total'};
      if(candidateEmergency){
        if(after.emergency.length>after.limits.emergency) return {message:emergencyLeavePopup(group,date,before),date,kind:'leave-emergency'};
      }else{
        if(after.planned.length>after.limits.planned) return {message:plannedLeavePopup(group,date,before),date,kind:'leave-planned'};
      }
    }
    return null;
  }

  function installSaveGuard(){
    let base=null; try{base=window.saveLeave||(typeof saveLeave==='function'?saveLeave:null);}catch(_){base=window.saveLeave||null;}
    if(typeof base!=='function'||base.__v576SeparateQuotaGuard) return false;
    const wrapped=async function saveLeaveV576(form){
      try{
        const conflict=await quotaConflict(form);
        if(conflict){ showCentered(conflict.message); return; }
      }catch(error){ console.error(`[${VERSION}] quota pre-check failed`,error); }
      return base.apply(this,arguments);
    };
    wrapped.__v576SeparateQuotaGuard=true;
    try{window.saveLeave=wrapped;saveLeave=wrapped;}catch(_){window.saveLeave=wrapped;}
    return true;
  }

  function ruleNoticeHtml(){
    return `<div class="notice soft-notice wide v576-quota-notice" data-v576-quota-notice>
      <b>โควตา “ไม่รับเวร” และ “วันลา” แยกกัน — ตามข้อตกลง ${AGREEMENT}</b><br>
      <span><b>ไม่รับเวร:</b> MT จ.–ศ. ไม่เกิน <b>2 คน/วัน</b>, ส.–อา. ไม่เกิน <b>3 คน/วัน</b> · Clerk (เฟื่อง/แก๊ส/แตง) ไม่เกิน <b>1 คน/วัน</b></span><br>
      <span><b>วันลา:</b> MT ล่วงหน้าไม่เกิน <b>2 คน/วัน</b> + ฉุกเฉินวันจริง (เฉพาะลาป่วย/ลากิจ) อีกไม่เกิน <b>2 คน</b> — รวมผู้ลาสูงสุด <b>4 คน/วัน</b></span><br>
      <span>Clerk: ล่วงหน้าไม่เกิน <b>1 คน/วัน</b> + ฉุกเฉินวันจริงอีกไม่เกิน <b>1 คน</b> — รวมผู้ลาสูงสุด <b>2 คน/วัน</b></span><br>
      <span class="hint">“ไม่รับเวร” ไม่ใช่วันลาและไม่ถูกนำไปนับเป็นจำนวนผู้ขาดงาน</span>
    </div>`;
  }

  function excessRecords(rows){
    const active=(rows||[]).filter(r=>r&&!inactive(r)&&staffGroup(r.staff_id));
    const dates=[...new Set(active.flatMap(r=>dateRange(r.start_date,r.end_date)))].sort();
    const flags=new Map();
    const mark=(rec,date,reason)=>{
      for(const r of rec.rows||[]){
        if(!rowTouches(r,date)) continue;
        const key=String(r.id||`${r.staff_id}|${r.start_date}|${r.type}`);
        if(!flags.has(key)) flags.set(key,{row:r,dates:new Set(),reasons:new Set()});
        flags.get(key).dates.add(date); flags.get(key).reasons.add(reason);
      }
    };
    for(const date of dates){
      for(const group of ['MT','CLERK']){
        const nd=analyzeNoDuty(active,date,group);
        const orderedND=nd.people.slice().sort((x,y)=>firstTimestampFor(x,date,'noduty')-firstTimestampFor(y,date,'noduty'));
        orderedND.slice(nd.limit).forEach(rec=>mark(rec,date,`ไม่รับเวรเกินโควตา ${nd.limit} คน`));

        const a=analyzeLeave(active,date,group), l=a.limits;
        const planned=a.planned.slice().sort((x,y)=>firstTimestampFor(x,date,'planned')-firstTimestampFor(y,date,'planned'));
        const emergency=a.emergency.slice().sort((x,y)=>firstTimestampFor(x,date,'emergency')-firstTimestampFor(y,date,'emergency'));
        planned.slice(l.planned).forEach(rec=>mark(rec,date,`วันลาเกินโควตาล่วงหน้า ${l.planned} คน`));
        emergency.slice(l.emergency).forEach(rec=>mark(rec,date,`วันลาเกินโควตาฉุกเฉิน ${l.emergency} คน`));
        const totalOrdered=[...planned,...emergency].filter((x,i,arr)=>arr.findIndex(y=>y.staffId===x.staffId)===i);
        totalOrdered.slice(l.total).forEach(rec=>mark(rec,date,`ผู้ลารวมเกิน ${l.total} คน`));
      }
    }
    return [...flags.values()].sort((a,b)=>(dateKey(a.row.start_date)||'').localeCompare(dateKey(b.row.start_date)||'') || (Date.parse(a.row.created_at||'')||0)-(Date.parse(b.row.created_at||'')||0));
  }

  function adminReviewHtml(){
    if(!isAdminSafe()) return '';
    const flags=excessRecords(S().leaves||[]);
    if(!flags.length) return `<div class="v576-review-card v576-review-ok"><b>✓ ตรวจโควตาแล้ว</b><span>ยังไม่พบรายการวันลา/ไม่รับเวรที่เกินเกณฑ์ในข้อมูลที่โหลดอยู่</span></div>`;
    return `<div class="v576-review-card" data-v576-review-card>
      <div class="v576-review-head"><div><b>⚠ รายการเดิมเกินโควตา — รอ Admin พิจารณา</b><span>พบ ${flags.length} รายการ ระบบไม่ลบอัตโนมัติ ให้ Admin ตรวจแล้วลบรายการที่ไม่อนุมัติ</span></div></div>
      <div class="v576-review-list">${flags.map(f=>{
        const r=f.row, ds=[...f.dates].sort(), dateText=ds.length===1?thaiDate(ds[0]):`${thaiDate(ds[0])} – ${thaiDate(ds[ds.length-1])}`;
        return `<div class="v576-review-row"><div class="v576-review-main"><b>${esc(staffNickSafe(r.staff_id))}</b><span>${esc(typeBase(r))} • ${esc(dateText)}</span><small>${esc([...f.reasons].join(' / '))}</small></div><button type="button" class="tiny-btn danger" data-delete-leave="${esc(r.id)}">ลบรายการ</button></div>`;
      }).join('')}</div>
      <div class="hint">โควตา “ไม่รับเวร” และ “วันลา” ถูกตรวจแยกกัน รายการเดิมไม่ถูกลบอัตโนมัติ</div>
    </div>`;
  }

  function patchRenderLeave(){
    let base=null; try{base=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);}catch(_){base=window.renderLeavePage||null;}
    if(typeof base!=='function'||base.__v576QuotaUi) return false;
    const wrapped=function renderLeavePageV576(){
      let html=String(base.apply(this,arguments)||'');
      if(!html.includes('id="leaveForm"')) return html;
      if(!html.includes('data-v576-quota-notice')) html=html.replace(/(<form[^>]*id=["']leaveForm["'][^>]*>)/i,`$1${ruleNoticeHtml()}`);
      if(isAdminSafe()&&!html.includes('data-v576-review-card')) html=adminReviewHtml()+html;
      return html;
    };
    wrapped.__v576QuotaUi=true;
    try{window.renderLeavePage=wrapped;renderLeavePage=wrapped;}catch(_){window.renderLeavePage=wrapped;}
    return true;
  }

  function patchFriendlyDbError(){
    let base=null; try{base=window.friendlyDbError||(typeof friendlyDbError==='function'?friendlyDbError:null);}catch(_){base=window.friendlyDbError||null;}
    if(typeof base!=='function'||base.__v576QuotaError) return false;
    const wrapped=function friendlyDbErrorV576(error){
      const msg=txt(error?.message||error);
      if(msg.includes('[CNMI_QUOTA_V576]')) return msg.replace(/^.*\[CNMI_QUOTA_V576\]\s*/,'').replace(/\s*Where:.*$/s,'').trim();
      return base.apply(this,arguments);
    };
    wrapped.__v576QuotaError=true;
    try{window.friendlyDbError=wrapped;friendlyDbError=wrapped;}catch(_){window.friendlyDbError=wrapped;}
    return true;
  }

  function addStyles(){
    if(document.getElementById('cnmi-v576-separate-quota-style')) return;
    const st=document.createElement('style'); st.id='cnmi-v576-separate-quota-style';
    st.textContent=`
      .v576-quota-notice{line-height:1.55!important;border-color:#8cc7ef!important;background:#f3faff!important;color:#21465f!important}
      .v576-review-card{margin:0 0 14px;padding:14px;border:1px solid #f1b94c;border-radius:16px;background:#fffaf0;box-shadow:0 4px 14px rgba(15,23,42,.04)}
      .v576-review-card.v576-review-ok{display:flex;gap:9px;align-items:center;border-color:#b9e6cf;background:#f2fbf6;color:#176b45}.v576-review-card.v576-review-ok span{font-size:12px;color:#557066}
      .v576-review-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.v576-review-head b{display:block;font-size:16px;color:#8a4b08}.v576-review-head span{display:block;margin-top:3px;font-size:12px;color:#7c6652}
      .v576-review-list{display:grid;gap:8px;margin:8px 0 10px}.v576-review-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 11px;border:1px solid #f3d59c;border-radius:12px;background:#fff}
      .v576-review-main{min-width:0;display:grid;gap:2px}.v576-review-main b{font-size:14px;color:#283b4c}.v576-review-main span{font-size:12px;color:#4d6171}.v576-review-main small{font-size:11px;color:#b45309;font-weight:700}
      @media(max-width:820px){.v576-review-row{align-items:flex-start;flex-direction:column}.v576-review-row .tiny-btn{width:100%;min-height:40px}.v576-review-head b{font-size:15px}.v576-quota-notice{font-size:13px}}
    `;
    document.head.appendChild(st);
  }

  function versionChip(){
    try{document.querySelectorAll('.v520-version-chip,.v542-version-chip,.v524-version-chip').forEach(chip=>{chip.textContent='v576';chip.title='V576: separate leave and no-duty quotas';});}catch(_){}
  }

  let tries=0; const timer=setInterval(()=>{tries++; const a=installSaveGuard(),b=patchRenderLeave(),c=patchFriendlyDbError(); if((a&&b&&c)||tries>100) clearInterval(timer);},50);
  installSaveGuard(); patchRenderLeave(); patchFriendlyDbError(); addStyles(); versionChip();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{addStyles();versionChip();},{once:true});
  window.addEventListener('pageshow',versionChip);

  window.cnmiV576Quota={version:VERSION,agreement:AGREEMENT,LEAVE_LIMITS,NODUTY_LIMITS,staffGroup,isNoDuty,isActualLeave,analyzeNoDuty,analyzeLeave,excessRecords,quotaConflict};
  console.info(`[${VERSION}] separate leave / no-duty quota loaded`);
})();
