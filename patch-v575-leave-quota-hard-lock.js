/* CNMI Staff Planner — V575
   Leave / no-duty manpower quota hard lock (agreement 30 Apr 2026 / 30 เม.ย. 2569)
   Rules:
   - MT: planned absence <= 2 persons/day; same-day emergency sick/personal leave <= 2 additional persons/day; total <= 4/day.
   - Clerk group = เฟื่อง, แก๊ส, แตง: planned absence <= 1 person/day; same-day emergency sick/personal leave <= 1 additional person/day; total <= 2/day.
   - Emergency means the request is submitted on the actual leave date in Bangkok time AND type is ลาป่วย or ลากิจ.
   - Counts unique staff per day, not number of rows. Existing historical/future excess is surfaced for Admin review; no automatic deletion.
   - DB trigger SQL in this release is the authoritative race-condition guard; this client guard provides immediate UX.
*/
(() => {
  'use strict';
  if (window.__CNMI_V575_LEAVE_QUOTA_HARD_LOCK__) return;
  window.__CNMI_V575_LEAVE_QUOTA_HARD_LOCK__ = true;

  const VERSION = 'V575';
  const AGREEMENT = '30 เมษายน 2569';
  const CLERK_NICKS = new Set(['เฟื่อง','แก๊ส','แตง']);
  const LIMITS = {
    MT: { planned:2, emergency:2, total:4, label:'MT' },
    CLERK: { planned:1, emergency:1, total:2, label:'Clerk (เฟื่อง / แก๊ส / แตง)' }
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
  function emergencyEligibleType(v){ const t=typeBase(v); return t==='ลาป่วย' || t==='ลากิจ'; }
  function submittedDate(row){ return bangkokDateFromInstant(row?.created_at||row?.submitted_at||row?.requested_at||''); }
  function isEmergencyRow(row,date){ return emergencyEligibleType(row) && submittedDate(row)===date; }
  function rowTouches(row,date){ const s=dateKey(row?.start_date), e=dateKey(row?.end_date||row?.start_date); return !!s&&!!e&&s<=date&&date<=e; }

  function analyzeDay(rows,date,group, synthetic=null){
    const candidates=(rows||[]).filter(r=>r&&!inactive(r)&&staffGroup(r.staff_id)===group&&rowTouches(r,date));
    if (synthetic && staffGroup(synthetic.staff_id)===group && rowTouches(synthetic,date)) candidates.push(synthetic);
    const byStaff=new Map();
    for(const r of candidates){
      const id=String(r.staff_id||''); if(!id) continue;
      let rec=byStaff.get(id); if(!rec){rec={staffId:id,planned:false,emergency:false,rows:[]};byStaff.set(id,rec);}
      rec.rows.push(r);
      if(isEmergencyRow(r,date)) rec.emergency=true; else rec.planned=true;
    }
    const planned=[...byStaff.values()].filter(x=>x.planned);
    // If the same person already occupies a planned slot, a same-day sick/personal row for that same person does not consume another emergency headcount slot.
    const emergency=[...byStaff.values()].filter(x=>x.emergency&&!x.planned);
    const total=[...byStaff.values()];
    return {planned,emergency,total,limits:LIMITS[group]};
  }
  function firstTimestampFor(rec,date,kind){
    const rows=(rec?.rows||[]).filter(r => kind==='planned' ? !isEmergencyRow(r,date) : isEmergencyRow(r,date));
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

  function plannedPopup(group,date,a){
    const l=LIMITS[group];
    return `ไม่สามารถบันทึกได้\n\nวันที่ ${thaiDate(date)} กลุ่ม ${l.label} มีผู้ลา/ไม่รับเวรที่วางแผนล่วงหน้าครบ ${l.planned} คนแล้ว\nผู้ใช้โควตา: ${names(a.planned)}\n\nตามข้อตกลงของหน่วยงาน วันที่ ${AGREEMENT}\nรายการที่ยื่นล่วงหน้าจะไม่สามารถใช้โควตาฉุกเฉินได้ กรุณาเลือกวันอื่นหรือติดต่อหัวหน้าหน่วยค่ะ`;
  }
  function emergencyPopup(group,date,a){
    const l=LIMITS[group];
    return `ไม่สามารถบันทึกได้\n\nวันที่ ${thaiDate(date)} กลุ่ม ${l.label} ใช้โควตาฉุกเฉินวันจริงครบ ${l.emergency} คนแล้ว\nผู้ใช้โควตาฉุกเฉิน: ${names(a.emergency)}\n\nโควตาฉุกเฉินใช้ได้เฉพาะ “ลาป่วย/ลากิจ” ที่บันทึกในวันนั้นจริงเท่านั้น ตามข้อตกลงวันที่ ${AGREEMENT}\nกรุณาติดต่อหัวหน้าหน่วยค่ะ`;
  }
  function totalPopup(group,date,a){
    const l=LIMITS[group];
    return `ไม่สามารถบันทึกได้\n\nวันที่ ${thaiDate(date)} กลุ่ม ${l.label} มีผู้ขาดรวมครบจำนวนสูงสุด ${l.total} คนแล้ว\nผู้ขาดทั้งหมด: ${names(a.total)}\n\nตามข้อตกลงของหน่วยงาน วันที่ ${AGREEMENT}\nกรุณาติดต่อหัวหน้าหน่วยค่ะ`;
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
      const before=analyzeDay(filtered,date,group,null);
      const after=analyzeDay(filtered,date,group,synthetic);
      const candidateEmergency=emergencyEligibleType(type)&&submitDate===date;
      if(after.total.length>after.limits.total) return {message:totalPopup(group,date,before),date,kind:'total'};
      if(candidateEmergency){
        if(after.emergency.length>after.limits.emergency) return {message:emergencyPopup(group,date,before),date,kind:'emergency'};
      }else{
        if(after.planned.length>after.limits.planned) return {message:plannedPopup(group,date,before),date,kind:'planned'};
      }
    }
    return null;
  }

  function installSaveGuard(){
    let base=null; try{base=window.saveLeave||(typeof saveLeave==='function'?saveLeave:null);}catch(_){base=window.saveLeave||null;}
    if(typeof base!=='function'||base.__v575LeaveQuotaGuard) return false;
    const wrapped=async function saveLeaveV575(form){
      try{
        const conflict=await quotaConflict(form);
        if(conflict){ showCentered(conflict.message); return; }
      }catch(error){ console.error(`[${VERSION}] quota pre-check failed`,error); }
      return base.apply(this,arguments);
    };
    wrapped.__v575LeaveQuotaGuard=true;
    try{window.saveLeave=wrapped;saveLeave=wrapped;}catch(_){window.saveLeave=wrapped;}
    return true;
  }

  function ruleNoticeHtml(){
    return `<div class="notice soft-notice wide v575-quota-notice" data-v575-quota-notice>
      <b>โควตาลา / ไม่รับเวร — ตามข้อตกลง ${AGREEMENT}</b><br>
      <span>MT: ล่วงหน้าไม่เกิน <b>2 คน/วัน</b> + ฉุกเฉินวันจริง (เฉพาะลาป่วย/ลากิจ) อีกไม่เกิน <b>2 คน</b> — รวมสูงสุด <b>4 คน/วัน</b></span><br>
      <span>Clerk (เฟื่อง/แก๊ส/แตง): ล่วงหน้าไม่เกิน <b>1 คน/วัน</b> + ฉุกเฉินวันจริงอีกไม่เกิน <b>1 คน</b> — รวมสูงสุด <b>2 คน/วัน</b></span><br>
      <span class="hint">ลาป่วย/ลากิจที่ยื่นก่อนวันลา จะนับเป็นโควตาล่วงหน้า ไม่ใช่โควตาฉุกเฉิน</span>
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
        const a=analyzeDay(active,date,group);
        const l=a.limits;
        const planned=a.planned.slice().sort((x,y)=>firstTimestampFor(x,date,'planned')-firstTimestampFor(y,date,'planned'));
        const emergency=a.emergency.slice().sort((x,y)=>firstTimestampFor(x,date,'emergency')-firstTimestampFor(y,date,'emergency'));
        planned.slice(l.planned).forEach(rec=>mark(rec,date,`เกินโควตาล่วงหน้า ${l.planned} คน`));
        emergency.slice(l.emergency).forEach(rec=>mark(rec,date,`เกินโควตาฉุกเฉิน ${l.emergency} คน`));
        // Total cap: order planned first by original submission, then true emergency.
        const totalOrdered=[...planned,...emergency].filter((x,i,arr)=>arr.findIndex(y=>y.staffId===x.staffId)===i);
        totalOrdered.slice(l.total).forEach(rec=>mark(rec,date,`เกินจำนวนขาดสูงสุด ${l.total} คน`));
      }
    }
    return [...flags.values()].sort((a,b)=>(dateKey(a.row.start_date)||'').localeCompare(dateKey(b.row.start_date)||'') || (Date.parse(a.row.created_at||'')||0)-(Date.parse(b.row.created_at||'')||0));
  }

  function adminReviewHtml(){
    if(!isAdminSafe()) return '';
    const flags=excessRecords(S().leaves||[]);
    if(!flags.length) return `<div class="v575-review-card v575-review-ok"><b>✓ ตรวจโควตาแล้ว</b><span>ยังไม่พบรายการลา/ไม่รับเวรที่เกินเกณฑ์ในข้อมูลที่โหลดอยู่</span></div>`;
    return `<div class="v575-review-card" data-v575-review-card>
      <div class="v575-review-head"><div><b>⚠ รายการเดิมเกินโควตา — รอ Admin พิจารณา</b><span>พบ ${flags.length} รายการ ระบบไม่ลบอัตโนมัติ ให้ Admin ตรวจแล้วลบรายการที่ไม่อนุมัติ</span></div></div>
      <div class="v575-review-list">${flags.map(f=>{
        const r=f.row, ds=[...f.dates].sort(), dateText=ds.length===1?thaiDate(ds[0]):`${thaiDate(ds[0])} – ${thaiDate(ds[ds.length-1])}`;
        return `<div class="v575-review-row"><div class="v575-review-main"><b>${esc(staffNickSafe(r.staff_id))}</b><span>${esc(typeBase(r))} • ${esc(dateText)}</span><small>${esc([...f.reasons].join(' / '))}</small></div><button type="button" class="tiny-btn danger" data-delete-leave="${esc(r.id)}">ลบรายการ</button></div>`;
      }).join('')}</div>
      <div class="hint">หากเป็นกรณีที่ Admin อนุโลมให้คงไว้ สามารถปล่อยรายการไว้ได้ แต่ระบบจะแสดงคำเตือนเพื่อให้เห็นว่าเกินเกณฑ์มาตรฐาน</div>
    </div>`;
  }

  function patchRenderLeave(){
    let base=null; try{base=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);}catch(_){base=window.renderLeavePage||null;}
    if(typeof base!=='function'||base.__v575QuotaUi) return false;
    const wrapped=function renderLeavePageV575(){
      let html=String(base.apply(this,arguments)||'');
      if(!html.includes('id="leaveForm"')) return html;
      if(!html.includes('data-v575-quota-notice')) html=html.replace(/(<form[^>]*id=["']leaveForm["'][^>]*>)/i,`$1${ruleNoticeHtml()}`);
      if(isAdminSafe()&&!html.includes('data-v575-review-card')) html=adminReviewHtml()+html;
      return html;
    };
    wrapped.__v575QuotaUi=true;
    try{window.renderLeavePage=wrapped;renderLeavePage=wrapped;}catch(_){window.renderLeavePage=wrapped;}
    return true;
  }

  function patchFriendlyDbError(){
    let base=null; try{base=window.friendlyDbError||(typeof friendlyDbError==='function'?friendlyDbError:null);}catch(_){base=window.friendlyDbError||null;}
    if(typeof base!=='function'||base.__v575QuotaError) return false;
    const wrapped=function friendlyDbErrorV575(error){
      const msg=txt(error?.message||error);
      if(msg.includes('[CNMI_LEAVE_QUOTA]')) return msg.replace(/^.*\[CNMI_LEAVE_QUOTA\]\s*/,'').replace(/\s*Where:.*$/s,'').trim();
      return base.apply(this,arguments);
    };
    wrapped.__v575QuotaError=true;
    try{window.friendlyDbError=wrapped;friendlyDbError=wrapped;}catch(_){window.friendlyDbError=wrapped;}
    return true;
  }

  function addStyles(){
    if(document.getElementById('cnmi-v575-leave-quota-style')) return;
    const st=document.createElement('style'); st.id='cnmi-v575-leave-quota-style';
    st.textContent=`
      .v575-quota-notice{line-height:1.55!important;border-color:#f6c66b!important;background:#fffaf0!important;color:#654516!important}
      .v575-review-card{margin:0 0 14px;padding:14px;border:1px solid #f1b94c;border-radius:16px;background:#fffaf0;box-shadow:0 4px 14px rgba(15,23,42,.04)}
      .v575-review-card.v575-review-ok{display:flex;gap:9px;align-items:center;border-color:#b9e6cf;background:#f2fbf6;color:#176b45}.v575-review-card.v575-review-ok span{font-size:12px;color:#557066}
      .v575-review-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.v575-review-head b{display:block;font-size:16px;color:#8a4b08}.v575-review-head span{display:block;margin-top:3px;font-size:12px;color:#7c6652}
      .v575-review-list{display:grid;gap:8px;margin:8px 0 10px}.v575-review-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 11px;border:1px solid #f3d59c;border-radius:12px;background:#fff}
      .v575-review-main{min-width:0;display:grid;gap:2px}.v575-review-main b{font-size:14px;color:#283b4c}.v575-review-main span{font-size:12px;color:#4d6171}.v575-review-main small{font-size:11px;color:#b45309;font-weight:700}
      @media(max-width:820px){.v575-review-row{align-items:flex-start;flex-direction:column}.v575-review-row .tiny-btn{width:100%;min-height:40px}.v575-review-head b{font-size:15px}.v575-quota-notice{font-size:13px}}
    `;
    document.head.appendChild(st);
  }

  function versionChip(){
    try{document.querySelectorAll('.v520-version-chip,.v542-version-chip,.v524-version-chip').forEach(chip=>{chip.textContent='v575';chip.title='V575: leave/no-duty daily manpower quota hard lock';});}catch(_){}
  }

  let tries=0; const timer=setInterval(()=>{tries++; const a=installSaveGuard(),b=patchRenderLeave(),c=patchFriendlyDbError(); if((a&&b&&c)||tries>100) clearInterval(timer);},50);
  installSaveGuard(); patchRenderLeave(); patchFriendlyDbError(); addStyles(); versionChip();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{addStyles();versionChip();},{once:true});
  window.addEventListener('pageshow',versionChip);

  window.cnmiV575LeaveQuota={version:VERSION,agreement:AGREEMENT,LIMITS,staffGroup,isEmergencyRow,analyzeDay,excessRecords,quotaConflict};
  console.info(`[${VERSION}] leave/no-duty quota hard lock loaded`);
})();
