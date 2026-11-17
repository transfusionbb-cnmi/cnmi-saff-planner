/* CNMI Staff Planner v678 | ordered patch bundle, preserving patch isolation.
 * Original patch files retained for debugging and rollback.
 * Individual patch failures are isolated so later patches still initialize.
 */

/* ===== BEGIN patch-v570-admin-temp-password-edge.js ===== */
try {
/* V570 Admin temporary password reset via Supabase Edge Function
   - Replaces email reset/default-password actions with one "ตั้ง / รีเซ็ตรหัส" action.
   - Admin chooses a temporary password (>= 8 chars) and confirms it.
   - Calls Supabase Edge Function; service_role never exists in frontend.
   - Target profile is forced to choose a private password on next login.
   - Password values are never written to Audit Log.
*/
(function(){
  'use strict';
  const VERSION = 'V570_ADMIN_TEMP_PASSWORD_EDGE';
  const FN = 'admin-set-temp-password';

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }

  const prevUsers = window.renderUsersPage || (typeof renderUsersPage === 'function' ? renderUsersPage : null);
  if (prevUsers) {
    const wrapped = function renderUsersPageV570(){
      let html = String(prevUsers.apply(this, arguments) || '');
      html = html.replace(/<button\b[^>]*data-reset-user-email="[^"]*"[^>]*>[^<]*<\/button>/gi, '');
      html = html.replace(/<button\b[^>]*data-reset-default-password-staff="[^"]*"[^>]*>[^<]*<\/button>/gi, '');
      html = html.replace(/<div class="user-password-actions">/gi,
        '<div class="user-password-actions"><button class="tiny-btn v570-password-btn" data-v570-temp-password-staff="__V570_STAFF_ID__" type="button">ตั้ง / รีเซ็ตรหัส</button>');
      html = html.replace(/data-v570-temp-password-staff="__V570_STAFF_ID__"/g, function(){ return 'data-v570-temp-password-staff=""'; });
      // Fill each button from its surrounding card's data-staff-row after DOM render.
      return html;
    };
    try { window.renderUsersPage = renderUsersPage = wrapped; } catch (_) { window.renderUsersPage = wrapped; }
  }

  function hydrateButtons(root=document){
    root.querySelectorAll('.admin-user-card[data-staff-row]').forEach(card => {
      const btn = card.querySelector('[data-v570-temp-password-staff]');
      if (btn) btn.dataset.v570TempPasswordStaff = card.getAttribute('data-staff-row') || '';
      card.querySelectorAll('[data-reset-user-email],[data-reset-default-password-staff]').forEach(x => x.remove());
    });
  }

  function openResetModal(staffId){
    if (!(typeof isAdmin === 'function' && isAdmin())) return showToast('เฉพาะ Admin เท่านั้น', { tone:'error' });
    const staff = (state.staff || []).find(s => String(s.id) === String(staffId));
    if (!staff) return showToast('ไม่พบข้อมูลเจ้าหน้าที่', { tone:'error' });
    const name = staff.nickname || staff.full_name || staff.email || 'เจ้าหน้าที่';
    showModal(`<div class="v570-reset-box v573-reset-box">
      <h2>ตั้ง / รีเซ็ตรหัสชั่วคราว</h2>
      <p class="hint">${esc(name)}${staff.email ? ` • ${esc(staff.email)}` : ''}</p>
      <p class="v570-reset-note">Admin กำหนดรหัสชั่วคราวให้น้องใช้ Login ครั้งถัดไป หลัง Login ระบบจะบังคับให้น้องตั้งรหัสส่วนตัวใหม่ และ Admin จะไม่เห็นรหัสส่วนตัวนั้น</p>
      <form id="v570TempPasswordForm" data-staff-id="${esc(staff.id)}" class="v573-password-form">
        <label>รหัสชั่วคราว
          <div class="v570-password-row"><input id="v570TempPassword" name="temp_password" type="password" minlength="8" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร" required><button type="button" class="ghost-btn v570-eye" data-v570-toggle="#v570TempPassword">ดู</button></div>
        </label>
        <label>ยืนยันรหัสชั่วคราว
          <div class="v570-password-row"><input id="v570TempPassword2" name="temp_password2" type="password" minlength="8" autocomplete="new-password" placeholder="พิมพ์รหัสเดิมอีกครั้ง" required><button type="button" class="ghost-btn v570-eye" data-v570-toggle="#v570TempPassword2">ดู</button></div>
        </label>
        <div class="confirm-actions"><button type="button" class="ghost-btn" data-v570-cancel>ยกเลิก</button><button type="submit" class="primary-btn">ตั้ง / รีเซ็ตรหัส</button></div>
      </form>
      <p class="hint v573-audit-hint">Audit Log จะเก็บเฉพาะว่าใครรีเซ็ตบัญชีใครและเวลาใด — ไม่บันทึกรหัสผ่าน</p>
    </div>`, { className:'modal-v570-password modal-v573-password' });
    requestAnimationFrame(() => document.getElementById('v570TempPassword')?.focus());
  }

  async function submitReset(form){
    const fd = new FormData(form);
    const password = String(fd.get('temp_password') || '');
    const password2 = String(fd.get('temp_password2') || '');
    const staffId = String(form.dataset.staffId || '');
    if (password.length < 8) return showToast('รหัสชั่วคราวต้องอย่างน้อย 8 ตัวอักษร', { tone:'error' });
    if (password !== password2) return showToast('รหัสชั่วคราวทั้ง 2 ช่องไม่ตรงกัน', { tone:'error' });
    if (!staffId) return showToast('ไม่พบเจ้าหน้าที่', { tone:'error' });

    setBusy(true, 'กำลังตั้งรหัสชั่วคราว');
    try {
      const { data, error } = await sb.functions.invoke(FN, {
        body: { staff_id: staffId, temp_password: password }
      });
      if (error) {
        let detail = '';
        try {
          const payload = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
          detail = payload?.message || '';
        } catch (_) {}
        throw new Error(detail || error.message || 'Edge Function ทำรายการไม่สำเร็จ');
      }
      if (!data || data.ok === false) throw new Error(data?.message || 'ตั้ง/รีเซ็ตรหัสไม่สำเร็จ');
      closeModal();
      await loadAllData();
      renderPage();
      showToast(data.warning || 'ตั้งรหัสชั่วคราวแล้ว เจ้าหน้าที่จะถูกบังคับให้ตั้งรหัสส่วนตัวใหม่เมื่อ Login');
    } catch (err) {
      const msg = err?.context?.message || err?.message || 'ตั้ง/รีเซ็ตรหัสไม่สำเร็จ';
      showToast(msg, { tone:'error' });
    } finally { setBusy(false); }
  }

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-v570-temp-password-staff]');
    if (btn) { e.preventDefault(); e.stopPropagation(); openResetModal(btn.dataset.v570TempPasswordStaff); return; }
    const toggle = e.target?.closest?.('[data-v570-toggle]');
    if (toggle) {
      e.preventDefault();
      const input = document.querySelector(toggle.dataset.v570Toggle || '');
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'ดู' : 'ซ่อน';
      return;
    }
    if (e.target?.closest?.('[data-v570-cancel]')) { e.preventDefault(); closeModal(); }
  }, true);

  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'v570TempPasswordForm') return;
    e.preventDefault(); e.stopPropagation();
    submitReset(e.target);
  }, true);

  const observer = new MutationObserver(() => hydrateButtons(document));
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', () => hydrateButtons(document));
  setTimeout(() => hydrateButtons(document), 0);

  // Improve Audit Log wording for V570 entries without ever exposing a password.
  const oldActionLabel = window.auditActionLabel || (typeof auditActionLabel === 'function' ? auditActionLabel : null);
  if (oldActionLabel) {
    const nextActionLabel = function(a){
      if (a?.table_name === 'auth' && String(a?.action || '').toUpperCase() === 'ADMIN_PASSWORD_RESET') return 'Admin ตั้ง/รีเซ็ตรหัสชั่วคราว';
      return oldActionLabel(a);
    };
    try { window.auditActionLabel = auditActionLabel = nextActionLabel; } catch (_) { window.auditActionLabel = nextActionLabel; }
  }
  const oldSummary = window.auditSummary || (typeof auditSummary === 'function' ? auditSummary : null);
  if (oldSummary) {
    const nextSummary = function(a){
      if (a?.table_name === 'auth' && String(a?.action || '').toUpperCase() === 'ADMIN_PASSWORD_RESET') {
        const n = a.new_data || {};
        return `ตั้ง/รีเซ็ตรหัสชั่วคราวให้ ${n.target_name || n.target_email || 'เจ้าหน้าที่'}${n.at ? ' เมื่อ ' + formatThaiDateTime(n.at) : ''} (ไม่เก็บรหัสผ่าน)`;
      }
      return oldSummary(a);
    };
    try { window.auditSummary = auditSummary = nextSummary; } catch (_) { window.auditSummary = nextSummary; }
  }

  console.info(`${VERSION} loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v570-admin-temp-password-edge.js failed",__cnmiPatchError); }
/* ===== END patch-v570-admin-temp-password-edge.js ===== */

/* ===== BEGIN patch-v572-leave-overlap-guard.js ===== */
try {
/* CNMI Staff Planner — V572
   Prevent duplicate / overlapping leave requests for the same staff member.
   - Checks fresh Supabase data before save (not only local state).
   - Ignores cancelled/rejected/inactive rows and the row currently being edited.
   - Full-day conflicts with any period; AM conflicts with AM/full; PM conflicts with PM/full.
   - "ไม่รับเวร" is checked against "ไม่รับเวร" only, so a later real leave is not blocked by a preference row.
   - Uses the centered V569 alert surface; no password/secrets and no SQL changes.
*/
(() => {
  'use strict';
  if (window.__CNMI_V572_LEAVE_OVERLAP_GUARD__) return;
  window.__CNMI_V572_LEAVE_OVERLAP_GUARD__ = true;

  const VERSION = 'V572';

  function S(){ try { return (typeof state !== 'undefined' && state) ? state : (window.state || {}); } catch (_) { return window.state || {}; } }
  function txt(v){ return String(v ?? '').trim(); }
  function dateKey(v){ return txt(v).slice(0,10); }
  function isAdminSafe(){ try { return typeof isAdmin === 'function' ? !!isAdmin() : false; } catch (_) { return false; } }
  function currentStaffSafe(){ try { return typeof currentStaffId === 'function' ? currentStaffId() : S()?.profile?.id; } catch (_) { return S()?.profile?.id; } }
  function staffNameSafe(id){
    const p=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''));
    return txt(p?.nickname||p?.nick_name||p?.full_name||p?.display_name)||'เจ้าหน้าที่';
  }
  function displayType(row){
    const raw=txt(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();
    return raw==='ลาพักร้อน'?'ลาพักผ่อน':(raw||'ลา');
  }
  function finalInactive(row){
    try { if (typeof isLeaveFinalInactive === 'function') return !!isLeaveFinalInactive(row); } catch (_) {}
    const st=txt(row?.status).toLowerCase();
    return ['cancelled','canceled','deleted','inactive','void','rejected'].includes(st) || ['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(txt(row?.status));
  }
  function category(type){ return txt(type).split(':::')[0].trim()==='ไม่รับเวร' ? 'no-duty' : 'leave'; }
  function period(raw){
    const p=txt(raw||'เต็มวัน').toLowerCase();
    if (!p || /เต็มวัน|full/.test(p)) return 'full';
    if (/ครึ่งเช้า|ช่วงเช้า|เช้า|morning|\bam\b/.test(p)) return 'am';
    if (/ครึ่งบ่าย|ช่วงบ่าย|บ่าย|afternoon|\bpm\b/.test(p)) return 'pm';
    // Unknown/legacy periods are treated conservatively to avoid accidental duplicate leave.
    return 'full';
  }
  function periodsConflict(a,b){
    const x=period(a), y=period(b);
    return x==='full'||y==='full'||x===y;
  }
  function rangesOverlap(aStart,aEnd,bStart,bEnd){
    const as=dateKey(aStart), ae=dateKey(aEnd||aStart), bs=dateKey(bStart), be=dateKey(bEnd||bStart);
    return !!as&&!!ae&&!!bs&&!!be&&as<=be&&bs<=ae;
  }
  function thaiPeriod(raw){ const p=period(raw); return p==='am'?'ครึ่งเช้า':p==='pm'?'ครึ่งบ่าย':'เต็มวัน'; }
  function thaiDate(s){
    try { if (typeof formatThaiDate === 'function') return formatThaiDate(s); } catch (_) {}
    return dateKey(s)||'-';
  }
  function showCentered(message){
    try { window.alert(message); }
    catch (_) { try { if (typeof showToast === 'function') showToast(message,{tone:'error'}); } catch (_) {} }
  }

  async function freshRows(staffId,start,end){
    const client=(()=>{ try { return (typeof sb !== 'undefined' && sb) ? sb : window.sb; } catch (_) { return window.sb; } })();
    if (!client?.from) return Array.isArray(S().leaves)?S().leaves:[];
    try {
      const q=await client.from('leave_requests')
        .select('id,staff_id,type,start_date,end_date,leave_period,status,cancellation_requested,created_at')
        .eq('staff_id',staffId)
        .lte('start_date',end)
        .gte('end_date',start)
        .order('start_date',{ascending:true});
      if (!q?.error && Array.isArray(q?.data)) return q.data;
      console.warn(`[${VERSION}] fresh overlap query failed; using loaded state`,q?.error);
    } catch (error) { console.warn(`[${VERSION}] fresh overlap query exception; using loaded state`,error); }
    return Array.isArray(S().leaves)?S().leaves:[];
  }

  async function findConflict(form){
    if (!form) return null;
    const fd=new FormData(form);
    const staffId=String(isAdminSafe()?(fd.get('staff_id')||currentStaffSafe()):currentStaffSafe()||'');
    const type=txt(fd.get('type'));
    const start=dateKey(fd.get('start_date'));
    const end=dateKey(fd.get('end_date')||start);
    const leavePeriod=txt(fd.get('leave_period')||'เต็มวัน');
    if (!staffId||!type||!start||!end||end<start) return null;
    const editId=String(S().editingLeaveId||'');
    const wantedCategory=category(type);
    const rows=await freshRows(staffId,start,end);
    return rows.find(row => {
      if (!row || String(row.staff_id||'')!==staffId) return false;
      if (editId && String(row.id||'')===editId) return false;
      if (finalInactive(row)) return false;
      if (category(row.type)!==wantedCategory) return false;
      if (!rangesOverlap(start,end,row.start_date,row.end_date)) return false;
      return periodsConflict(leavePeriod,row.leave_period);
    }) || null;
  }

  function conflictMessage(form,row){
    const fd=new FormData(form);
    const staffId=String(isAdminSafe()?(fd.get('staff_id')||currentStaffSafe()):currentStaffSafe()||'');
    const name=staffNameSafe(staffId);
    const range=dateKey(row.start_date)===dateKey(row.end_date||row.start_date)
      ? thaiDate(row.start_date)
      : `${thaiDate(row.start_date)} – ${thaiDate(row.end_date)}`;
    return `พบรายการลาซ้ำซ้อน\n\n${name} มีรายการ “${displayType(row)}” อยู่แล้ว\nวันที่ ${range}\nช่วง ${thaiPeriod(row.leave_period)}\n\nระบบยังไม่บันทึกรายการใหม่ เพื่อป้องกันการลาซ้ำ กรุณาตรวจประวัติการลาก่อนค่ะ`;
  }

  function install(){
    let base=null;
    try { base=window.saveLeave||(typeof saveLeave==='function'?saveLeave:null); } catch (_) { base=window.saveLeave||null; }
    if (typeof base!=='function' || base.__v572LeaveOverlapGuard) return false;
    const wrapped=async function saveLeaveV572(form){
      try {
        const conflict=await findConflict(form);
        if (conflict){ showCentered(conflictMessage(form,conflict)); return; }
      } catch (error) {
        // Do not break leave saving if the pre-check itself encounters an unexpected client-side issue.
        console.error(`[${VERSION}] overlap pre-check failed`,error);
      }
      return base.apply(this,arguments);
    };
    wrapped.__v572LeaveOverlapGuard=true;
    try { window.saveLeave=wrapped; saveLeave=wrapped; } catch (_) { window.saveLeave=wrapped; }
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{ tries+=1; if(install()||tries>80) clearInterval(timer); },50);
  install();

  function versionChip(){
    try { document.querySelectorAll('.v520-version-chip,.v542-version-chip,.v524-version-chip').forEach(chip=>{ chip.textContent='v572'; chip.title='V572: OT submenu navigation + admin temporary password + duplicate leave guard'; }); } catch (_) {}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',versionChip,{once:true}); else versionChip();
  window.addEventListener('pageshow',versionChip);

  window.cnmiV572LeaveOverlapGuard={version:VERSION,findConflict,periodsConflict,rangesOverlap};
  console.info(`[${VERSION}] duplicate leave overlap guard loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v572-leave-overlap-guard.js failed",__cnmiPatchError); }
/* ===== END patch-v572-leave-overlap-guard.js ===== */

/* ===== BEGIN patch-v573-ot-admin-extra-navigation.js ===== */
try {
/* CNMI Staff Planner V573 — OT Admin Extra Submenu Navigation Hard Fix
 * Handles the three nested "ขอ OT เพิ่มแทนเจ้าหน้าที่" choices at WINDOW capture phase
 * before older document-level navigation handlers can restore a stale section.
 * Navigation only; no OT/HR calculation or database changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V573_OT_ADMIN_EXTRA_NAV__) return;
  window.__CNMI_V573_OT_ADMIN_EXTRA_NAV__=true;
  const VERSION='V573_OT_ADMIN_EXTRA_NAV';
  const VALID=new Set(['work','adjustment','activity']);
  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function month(){
    const s=S();
    const v=String(s.otMenuMonthV369||s.otSourceMonthV241||s.otMoneyMonthV241||'').slice(0,7);
    return /^\d{4}-\d{2}$/.test(v)?v:'';
  }
  function go(mode){
    if(!admin()||!VALID.has(mode)) return;
    const s=S();
    s.page='ot';
    s.otMenuV369='admin-extra';
    s.otGroupV522='ot';
    s.v527ExtraMode=mode;
    try{
      sessionStorage.setItem('cnmi-v528-admin-extra-mode',mode);
      sessionStorage.setItem('cnmi-v528-admin-extra-open','1');
      sessionStorage.setItem('cnmi-v523-ot-open','1');
      sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');
    }catch(_){ }
    const qs=new URLSearchParams();
    qs.set('section','request-extra');
    const m=month(); if(m) qs.set('month',m);
    qs.set('mode',mode);
    const target='#/ot?'+qs.toString();
    try{history.pushState({cnmiV573:true},'',target);}catch(_){location.hash=target;}
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){ }
    try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:'ot'}}));}catch(_){ }
    const sidebar=document.getElementById('sidebar');
    if(sidebar&&window.matchMedia('(max-width:820px)').matches){sidebar.classList.remove('open');document.body.classList.remove('sidebar-open');}
    setTimeout(()=>{
      try{
        if(String(location.hash||'')!==target) history.replaceState({cnmiV573:true},'',target);
        document.querySelectorAll('[data-v528-extra-mode]').forEach(b=>{
          const yes=b.dataset.v528ExtraMode===mode;
          b.classList.toggle('active',yes);b.setAttribute('aria-current',yes?'page':'false');
        });
      }catch(_){ }
    },0);
  }
  window.addEventListener('click',function(e){
    const btn=e.target?.closest?.('[data-v528-extra-mode]');
    if(!btn) return;
    const mode=String(btn.dataset.v528ExtraMode||'');
    if(!VALID.has(mode)||!admin()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    go(mode);
  },true);
  console.info('['+VERSION+'] loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v573-ot-admin-extra-navigation.js failed",__cnmiPatchError); }
/* ===== END patch-v573-ot-admin-extra-navigation.js ===== */

/* ===== BEGIN patch-v574-multi-trade-hr-normalization.js ===== */
try {
/* CNMI Staff Planner V574
   Fix combined OT rows that contain more than one purchased duty on the same day.
   Previous V356 logic selected only one completed trade, so a 24-hour combined row
   could use the money from only one purchased shift (e.g. 2,560 / 130 = 19.69 HR h).
   V574 aggregates every distinct completed trade represented by that OT row and
   sums each trade's own converted HR hours. No database schema change required.
*/
(function(){
  'use strict';
  const VERSION='V574_MULTI_TRADE_HR_NORMALIZATION';
  if(window.__CNMI_V574_MULTI_TRADE_HR_NORMALIZATION__) return;
  window.__CNMI_V574_MULTI_TRADE_HR_NORMALIZATION__=true;

  function S(){ try{return state;}catch(_){return window.state||{};} }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n)?Math.round(n*100)/100:0; }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function staffRec(id){ return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{}; }
  function isTang(id){ const s=staffRec(id); return String(s.nickname||'').trim()==='แตง'||/(^|\s)แตง($|\s)/.test(`${s.nickname||''} ${s.full_name||''}`.trim()); }
  function rateType(staffId,code){
    try{ const t=dutyStaffTypeForRate(staffId,code); if(t) return t==='เคิก'?'เคิก':'MT'; }catch(_){}
    const s=staffRec(staffId);
    if(isTang(staffId)&&['ช3A','ช3B','ช4','ช4A','ช4B'].includes(String(code||''))) return 'MT';
    return String(s.staff_type||s.type||'').trim()==='เคิก'?'เคิก':'MT';
  }
  function isHoliday(d){ try{return !!isHolidayDate(d);}catch(_){return false;} }
  function rateForType(type,date){ return type==='เคิก'?(isHoliday(date)?120:90):(isHoliday(date)?160:130); }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function assignmentById(id){ return (S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null; }
  function assignmentForTrade(trade){
    const real=assignmentById(trade?.from_assignment_id);
    if(real) return real;
    const date=marker(trade?.note,'SELL_DATE');
    const code=marker(trade?.note,'SELL_DUTY');
    if(!date||!code) return null;
    return {id:trade?.from_assignment_id||`note:${date}:${code}`,duty_date:date,duty_code:code,staff_id:trade?.requester_id||''};
  }
  function attendanceLike(row){ return /ยืนยัน(?:อยู่)?เวร|อยู่เวรตามตาราง|รับช่วง/i.test(`${row?.reason||''} ${row?.note||''}`); }
  function effectiveRow(row){
    if(!attendanceLike(row)) return row;
    try{ const fn=window.cnmiV221DutyOt?.correctedOtRow; return typeof fn==='function'?(fn(row)||row):row; }catch(_){ return row; }
  }
  function codeOf(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function sellHours(trade,a){
    const marker=Number(String(trade?.note||'').match(/\[SELL_HOURS=(\d+(?:\.\d+)?)\]/i)?.[1]||0);
    if(Number.isFinite(marker)&&marker>0) return marker;
    try{ const h=Number(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code)); if(h>0)return h; }catch(_){}
    try{ const h=Number(dutyHoursForCode(a?.duty_date,a?.duty_code)); if(h>0)return h; }catch(_){}
    return 0;
  }
  function paidType(trade,a){
    const mode=String(trade?.rate_mode||'receiver');
    if(mode==='mt') return 'MT';
    if(mode==='kerk') return 'เคิก';
    if(mode==='owner') return rateType(trade?.requester_id,codeOf(a));
    if(mode==='receiver') return rateType(trade?.receiver_id,codeOf(a));
    return 'กำหนดเอง';
  }
  function amountFor(trade,a,hours){
    const saved=Number(trade?.amount_from);
    const mode=String(trade?.rate_mode||'receiver');
    if(Number.isFinite(saved)&&(saved>0||mode==='custom')) return round2(Math.max(0,saved));
    const type=paidType(trade,a);
    if(type==='กำหนดเอง') return 0;
    return round2(hours*rateForType(type,a?.duty_date));
  }
  function completedTradesForRow(row){
    const sid=String(row?.staff_id||'');
    const date=normDate(row?.work_date);
    if(!sid||!date) return [];
    const out=[];
    const seen=new Set();
    (S().tradeRequests||[]).forEach(trade=>{
      if(String(trade?.status||'')!=='completed') return;
      if(String(trade?.receiver_id||'')!==sid) return;
      const a=assignmentForTrade(trade);
      if(!a||normDate(a?.duty_date)!==date) return;
      const key=String(trade?.id||`${trade?.from_assignment_id}|${trade?.receiver_id}|${trade?.requester_id}|${trade?.note||''}`);
      if(seen.has(key)) return;
      seen.add(key);
      const sold=round2(sellHours(trade,a));
      if(sold<=0) return;
      out.push({trade,assignment:a,soldHours:sold});
    });
    return out;
  }

  function install(){
    const api=window.v190HrRateNormalization;
    if(!api||typeof api.otNormalizationBreakdown190!=='function') return false;
    if(api.otNormalizationBreakdown190.__v574Wrapped) return true;
    const previous=api.otNormalizationBreakdown190;
    const wrapped=function(row){
      let base;
      const workRow=effectiveRow(row);
      try{ base=previous(workRow); }catch(err){ console.warn(`[${VERSION}] previous breakdown`,err); return previous(row); }
      try{
        const actual=round2(Number(base?.actualHours||0));
        if(actual<=0) return base;
        const matches=completedTradesForRow(workRow);
        if(matches.length<2) return base;

        const totalSold=round2(matches.reduce((s,x)=>s+x.soldHours,0));
        // Canonical attendance rows can be stale legacy rows (for example the DB row still says 8 h)
        // while the Staff view already represents multiple received segments in the same day.
        // Aggregate only when either hours already match OR the attendance text explicitly says รับช่วง.
        const receivedCombined=attendanceLike(workRow)&&/รับช่วง/i.test(`${workRow?.reason||''} ${workRow?.note||''}`)&&totalSold>actual+0.25;
        if(Math.abs(totalSold-actual)>0.25&&!receivedCombined) return base;
        const combinedActual=receivedCombined?totalSold:actual;

        const segments=[];
        let hrTotal=0, amountTotal=0;
        for(const item of matches){
          const {trade,assignment,soldHours}=item;
          const code=codeOf(assignment);
          const receiverType=rateType(trade.receiver_id,code);
          const receiverBase=receiverType==='เคิก'?90:130;
          const amount=amountFor(trade,assignment,soldHours);
          const claimHours=receiverBase>0?round2(amount/receiverBase):soldHours;
          hrTotal=round2(hrTotal+claimHours);
          amountTotal=round2(amountTotal+amount);
          segments.push({
            actualHours:soldHours,
            hrHours:claimHours,
            shiftType:code||'-',
            rateType:receiverType,
            sourceRateType:paidType(trade,assignment),
            normalRate:receiverBase,
            appliedRate:soldHours>0?round2(amount/soldHours):0,
            isHoliday:isHoliday(assignment?.duty_date),
            tradeId:trade?.id||'',
            assignmentId:assignment?.id||''
          });
        }

        return {
          ...base,
          actualHours:combinedActual,
          hrHours:hrTotal,
          segments,
          rateType:[...new Set(segments.map(s=>s.rateType))].join('/')||base?.rateType,
          isHoliday:segments.some(s=>s.isHoliday),
          tradeInfo:{
            aggregate:true,
            count:matches.length,
            actualHours:combinedActual,
            soldHours:totalSold,
            amount:amountTotal,
            claimHours:hrTotal,
            trades:matches.map((m,i)=>({
              trade:m.trade,
              assignment:m.assignment,
              soldHours:m.soldHours,
              amount:segments[i]?.appliedRate*m.soldHours,
              claimHours:segments[i]?.hrHours
            }))
          },
          isTradeRate:true,
          multiTrade:true
        };
      }catch(err){
        console.warn(`[${VERSION}] aggregate fallback`,err);
        return base;
      }
    };
    wrapped.__v574Wrapped=true;
    wrapped.__v574Previous=previous;
    api.otNormalizationBreakdown190=wrapped;
    window.v574MultiTradeHrNormalization={version:VERSION,completedTradesForRow};
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{ tries++; if(install()||tries>100)clearInterval(timer); },100);
  }
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v574-multi-trade-hr-normalization.js failed",__cnmiPatchError); }
/* ===== END patch-v574-multi-trade-hr-normalization.js ===== */

/* ===== BEGIN patch-v576-separate-leave-noduty-quota.js ===== */
try {
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
    if(!flags.length) return `<div class="v576-review-card v576-review-ok" data-v576-review-card><b>✓ ตรวจโควตาแล้ว</b><span>ยังไม่พบรายการวันลา/ไม่รับเวรที่เกินเกณฑ์ในข้อมูลที่โหลดอยู่</span></div>`;
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

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v576-separate-leave-noduty-quota.js failed",__cnmiPatchError); }
/* ===== END patch-v576-separate-leave-noduty-quota.js ===== */

/* ===== BEGIN patch-v577-ot-attendance-source-export-fix.js ===== */
try {
/* CNMI Staff Planner V577 — OT Attendance Source + Export Consistency Fix
 * Goal:
 * 1) Treat staff-confirmed attendance OT rows as the primary actual-work source.
 * 2) Ensure roster assignments + completed trade requests are loaded before HR normalization/export.
 * 3) Make OT detail / monthly summary / Export HR use the same trade-aware normalization source.
 * 4) Prevent an Export click from racing before trade data has arrived.
 * No database schema change required.
 */
(function(){
  'use strict';
  const VERSION='V605_HR_EXPORT_LOCK_UI_AND_PDF_DIFF_FIX';
  if(window.__CNMI_V577_OT_ATTENDANCE_SOURCE_EXPORT_FIX__) return;
  window.__CNMI_V577_OT_ATTENDANCE_SOURCE_EXPORT_FIX__=true;

  let loading=null;
  let loadedMonth='';
  let replayingExport=false;
  let warmTimer=null;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function toastSafe(msg,tone='info'){
    try{ if(typeof showToast==='function') return showToast(msg,{tone}); }catch(_){ }
    try{ if(typeof toast==='function') return toast(msg,tone); }catch(_){ }
    try{ console[tone==='error'?'error':'info'](msg); }catch(_){ }
  }
  function normMonth(raw){ const s=String(raw||'').slice(0,7); return /^\d{4}-\d{2}$/.test(s)?s:''; }
  function routeMonth(){
    const h=String(location.hash||'');
    try{ const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null; const m=normMonth(q?.get('month')); if(m)return m; }catch(_){ }
    const st=S();
    return normMonth(st.otSourceMonthV241)||normMonth(st.otMoneyMonthV241)||normMonth(st.otMenuMonthV369)||normMonth(st.monthKey)||new Date().toISOString().slice(0,7);
  }
  function monthEnd(m){ const [y,mo]=m.split('-').map(Number); return `${m}-${String(new Date(y,mo,0).getDate()).padStart(2,'0')}`; }
  function keyOf(x,fallback){ return String(x?.id||fallback?.(x)||''); }
  function mergeRows(current,incoming,fallback){
    const map=new Map();
    for(const x of (current||[])){ if(!x)continue; const k=keyOf(x,fallback); if(k)map.set(k,x); }
    for(const x of (incoming||[])){ if(!x)continue; const k=keyOf(x,fallback); if(k)map.set(k,x); }
    return [...map.values()];
  }
  async function selectCompletedTrades(db,assignmentIds){
    if(!assignmentIds.length) return [];
    const rows=[];
    for(let i=0;i<assignmentIds.length;i+=75){
      const ids=assignmentIds.slice(i,i+75);
      const r=await db.from('roster_trade_requests').select('*').in('from_assignment_id',ids).eq('status','completed');
      if(r?.error) throw r.error;
      rows.push(...(r?.data||[]));
    }
    return rows;
  }
  async function preloadOtReferenceData(month,{force=false}={}){
    month=normMonth(month)||routeMonth();
    if(!force && loadedMonth===month && Array.isArray(S().rosterAssignments) && Array.isArray(S().tradeRequests)) return {month,cached:true};
    if(loading) return loading;
    loading=(async()=>{
      const db=DB(); if(!db?.from) throw new Error('ไม่พบการเชื่อมต่อฐานข้อมูล');
      const start=`${month}-01`, end=monthEnd(month);
      const roster=await db.from('roster_assignments').select('*').gte('duty_date',start).lte('duty_date',end).order('duty_date');
      if(roster?.error) throw roster.error;
      const assignments=roster?.data||[];
      const trades=await selectCompletedTrades(db,assignments.map(x=>x.id).filter(Boolean));
      const st=S();
      st.rosterAssignments=mergeRows(st.rosterAssignments,assignments,x=>`${x.duty_date}|${x.duty_code}|${x.staff_id}`);
      st.tradeRequests=mergeRows(st.tradeRequests,trades,x=>`${x.from_assignment_id}|${x.requester_id}|${x.receiver_id}`);
      // Keep any helper cache used by rate-normalization patches in sync as well.
      try{ if(window.cnmiV348?.ensureHelpers) await window.cnmiV348.ensureHelpers(month,{force:true}); }catch(err){ console.warn(`[${VERSION}] helper preload`,err); }
      loadedMonth=month;
      return {month,assignments:assignments.length,trades:trades.length};
    })().finally(()=>{loading=null;});
    return loading;
  }

  function isOtPage(){ return String(location.hash||'').startsWith('#/ot'); }
  function isStaffDetailPage(){
    const h=String(location.hash||'');
    return h.startsWith('#/ot') && /(?:\?|&)section=staff-detail(?:&|$)/.test(h);
  }
  function rerender(){ try{ if(typeof renderPage==='function') return renderPage(); }catch(_){ } try{return window.renderPage?.();}catch(_){ } }
  function warm({force=false,render=true}={}){
    if(!isOtPage()) return;
    clearTimeout(warmTimer);
    warmTimer=setTimeout(async()=>{
      try{
        // Staff detail already hydrates itself. Re-rendering the whole page here causes
        // the loading card to be destroyed/recreated repeatedly and can look frozen.
        const detail=isStaffDetailPage();
        await preloadOtReferenceData(routeMonth(),{force: detail ? false : force});
        if(render && !detail) rerender();
      }catch(err){ console.warn(`[${VERSION}] warm preload`,err); }
    },80);
  }

  // Hard gate Export until trade/roster reference data are fully loaded.
  window.addEventListener('click',async function(e){
    const btn=e.target?.closest?.('[data-export-hr-v318],[data-export-hr-v241],[data-export-hr-v238],[data-export-hr-v234]');
    if(!btn||replayingExport) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if(btn.dataset.v577Busy==='1') return;
    btn.dataset.v577Busy='1';
    const oldText=btn.textContent, oldDisabled=btn.disabled;
    btn.disabled=true; btn.textContent='กำลังตรวจข้อมูลเวรจริงและขายเวร…';
    try{
      await preloadOtReferenceData(routeMonth(),{force:true});
      // Refresh calculations before the legacy exporter builds Staff_Total / HR_OT / copy.
      // IMPORTANT: renderPage() replaces the Export button node. Clicking the old detached
      // node does not bubble to the document-level V318 exporter, which made the page appear
      // to jump back without downloading anything. Re-acquire the live button after render.
      const selector = btn.matches?.('[data-export-hr-v318]') ? '[data-export-hr-v318]'
        : btn.matches?.('[data-export-hr-v241]') ? '[data-export-hr-v241]'
        : btn.matches?.('[data-export-hr-v238]') ? '[data-export-hr-v238]'
        : '[data-export-hr-v234]';
      const scrollX = window.scrollX, scrollY = window.scrollY;
      rerender();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const liveBtn=document.querySelector(selector) || document.querySelector('[data-export-hr-v318],[data-export-hr-v241],[data-export-hr-v238],[data-export-hr-v234]');
      if(!liveBtn) throw new Error('ไม่พบปุ่ม Export หลังรีเฟรชหน้า กรุณารีเฟรชหน้าเว็บแล้วลองใหม่');
      replayingExport=true;
      liveBtn.disabled=false; liveBtn.textContent=oldText;
      try{ window.scrollTo(scrollX,scrollY); }catch(_){ }
      liveBtn.click();
      setTimeout(()=>{replayingExport=false;},0);
    }catch(err){
      console.error(`[${VERSION}] export preload`,err);
      toastSafe(`Export ไม่สำเร็จ เพราะโหลดข้อมูลอ้างอิง OT ไม่ครบ: ${err?.message||err}`,'error');
    }finally{
      btn.dataset.v577Busy='0';
      if(btn.isConnected){ btn.disabled=oldDisabled; btn.textContent=oldText; }
    }
  },true);

  // When admin changes month/section inside OT, refresh the reference source once.
  window.addEventListener('hashchange',()=>warm({force:true,render:true}));
  window.addEventListener('pageshow',()=>warm({force:false,render:false}));
  setTimeout(()=>warm({force:false,render:true}),200);

  // Visible deployed version. Do not rely on older owner chips only.
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim()))return;
      x.textContent='v605';
      x.title='V605: ล็อกวันที่ในหน้า Export HR + แก้ส่วนต่าง PDF';
    });
  }
  setTimeout(markVersion,500);
  window.addEventListener('hashchange',()=>setTimeout(markVersion,250));

  window.cnmiV577={version:VERSION,preloadOtReferenceData,warm};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v577-ot-attendance-source-export-fix.js failed",__cnmiPatchError); }
/* ===== END patch-v577-ot-attendance-source-export-fix.js ===== */

/* ===== BEGIN patch-v578-long-weekend-noduty-quota.js ===== */
try {
/* CNMI Staff Planner V578 — Long Weekend No-Duty Quota
 * Adds the agreed MT no-duty rule on top of V576:
 * - Mon-Fri: <= 2 MT/day
 * - Sat-Sun: normally <= 3 MT/day
 * - If that calendar month contains 2 or more Long Weekend periods,
 *   Sat-Sun quota is reduced to <= 2 MT/day for the whole month.
 * - Clerk group (เฟื่อง / แก๊ส / แตง): unchanged <= 1/day.
 *
 * Long Weekend definition used by the app:
 * a continuous block of >= 3 off-days made from Saturday/Sunday and configured public holidays.
 */
(() => {
  'use strict';
  if (window.__CNMI_V578_LONG_WEEKEND_NODUTY__) return;
  window.__CNMI_V578_LONG_WEEKEND_NODUTY__ = true;

  const VERSION='V578';
  const AGREEMENT='30 เมษายน 2569';
  const CLERK_NICKS=new Set(['เฟื่อง','แก๊ส','แตง']);
  const txt=v=>String(v??'').trim();
  const dateKey=v=>txt(v).slice(0,10);
  const S=()=>{try{return (typeof state!=='undefined'&&state)?state:(window.state||{});}catch(_){return window.state||{};}};
  const DB=()=>{try{return (typeof sb!=='undefined'&&sb)?sb:window.sb;}catch(_){return window.sb;}};
  const currentStaffSafe=()=>{try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id;}catch(_){return S()?.profile?.id;}};
  const isAdminSafe=()=>{try{return typeof isAdmin==='function'?!!isAdmin():S()?.profile?.role==='admin';}catch(_){return S()?.profile?.role==='admin';}};

  function addDays(date,n){const d=new Date(`${dateKey(date)}T12:00:00+07:00`);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function monthBounds(date){const d=dateKey(date),m=d.slice(0,7),[y,mo]=m.split('-').map(Number);return {month:m,start:`${m}-01`,end:`${m}-${String(new Date(y,mo,0).getDate()).padStart(2,'0')}`};}
  function datesBetween(start,end){const out=[];let d=dateKey(start);const last=dateKey(end);while(d&&d<=last){out.push(d);d=addDays(d,1);}return out;}
  function weekend(date){try{if(typeof isWeekend==='function')return !!isWeekend(date);}catch(_){} const n=new Date(`${dateKey(date)}T12:00:00+07:00`).getDay();return n===0||n===6;}
  function holidayKey(row){return dateKey(row?.holiday_date||row?.date||row?.work_date||row?.day||row?.start_date||row);}
  function isHolidayFromRows(date,rows){const d=dateKey(date);return (rows||[]).some(r=>holidayKey(r)===d);}
  function holidayRowsSafe(){return Array.isArray(S().holidays)?S().holidays:[];}
  function thaiDate(d){try{return typeof formatThaiDate==='function'?formatThaiDate(d):new Date(`${d}T12:00:00+07:00`).toLocaleDateString('th-TH',{dateStyle:'medium'});}catch(_){return d;}}
  function staffObj(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''));}
  function staffNick(id){const s=staffObj(id);return txt(s?.nickname||s?.full_name||s?.display_name)||'เจ้าหน้าที่';}
  function staffGroup(id){const s=staffObj(id);if(!s)return null;const nick=txt(s.nickname||s.nick_name||s.full_name),role=txt(s.role).toLowerCase(),type=txt(s.staff_type);if(role.includes('physician')||type.includes('แพทย์'))return null;if(CLERK_NICKS.has(nick))return 'CLERK';return 'MT';}
  function inactive(row){try{if(typeof isLeaveFinalInactive==='function')return !!isLeaveFinalInactive(row);}catch(_){} const st=txt(row?.status).toLowerCase();return ['cancelled','canceled','deleted','inactive','void','rejected'].includes(st)||['ยกเลิกแล้ว','ลบทิ้ง','ไม่อนุมัติ'].includes(txt(row?.status));}
  function typeBase(rowOrType){return txt(typeof rowOrType==='string'?rowOrType:(rowOrType?.type||rowOrType?.leave_type)).split(':::')[0].trim();}
  function rowTouches(row,date){const s=dateKey(row?.start_date),e=dateKey(row?.end_date||row?.start_date);return !!s&&!!e&&s<=date&&date<=e;}

  function longWeekendCountForMonth(date,holidayRows=holidayRowsSafe()){
    const b=monthBounds(date), scanStart=addDays(b.start,-7), scanEnd=addDays(b.end,7);
    const days=datesBetween(scanStart,scanEnd);
    let runs=[],cur=[];
    const flush=()=>{if(cur.length){runs.push(cur);cur=[];}};
    for(const d of days){
      const off=weekend(d)||isHolidayFromRows(d,holidayRows);
      if(off)cur.push(d);else flush();
    }
    flush();
    return runs.filter(run=>run.length>=3 && run.some(d=>d>=b.start&&d<=b.end)).length;
  }
  function mtNoDutyLimit(date,holidayRows=holidayRowsSafe()){
    if(!weekend(date)) return 2;
    return longWeekendCountForMonth(date,holidayRows)>=2?2:3;
  }

  async function freshHolidayRowsForRange(start,end){
    const months=[...new Set(datesBetween(start,end).map(d=>d.slice(0,7)))];
    if(!months.length)return holidayRowsSafe();
    const first=monthBounds(`${months[0]}-01`),last=monthBounds(`${months[months.length-1]}-01`);
    const from=addDays(first.start,-7),to=addDays(last.end,7),db=DB();
    if(!db?.from)return holidayRowsSafe();
    try{
      const q=await db.from('public_holidays').select('*').gte('holiday_date',from).lte('holiday_date',to).order('holiday_date');
      if(!q?.error&&Array.isArray(q?.data)){
        const map=new Map();for(const r of [...holidayRowsSafe(),...q.data]){const k=holidayKey(r);if(k)map.set(k,r);}return [...map.values()];
      }
    }catch(err){console.warn('[V578] holiday query failed',err);}
    return holidayRowsSafe();
  }
  async function freshNoDutyRows(start,end){
    const db=DB();if(!db?.from)return Array.isArray(S().leaves)?S().leaves:[];
    try{
      const q=await db.from('leave_requests').select('id,staff_id,type,start_date,end_date,status,created_at').lte('start_date',end).gte('end_date',start).order('created_at',{ascending:true});
      if(!q?.error&&Array.isArray(q?.data))return q.data;
    }catch(err){console.warn('[V578] leave query failed',err);}
    return Array.isArray(S().leaves)?S().leaves:[];
  }
  function countNoDutyPeople(rows,date,group,excludeId=''){
    const ids=new Set();
    for(const r of rows||[]){
      if(!r||inactive(r)||typeBase(r)!=='ไม่รับเวร'||!rowTouches(r,date)||staffGroup(r.staff_id)!==group)continue;
      if(excludeId&&String(r.id||'')===String(excludeId))continue;
      if(r.staff_id)ids.add(String(r.staff_id));
    }
    return [...ids];
  }
  function showCentered(message){try{window.alert(message);}catch(_){try{if(typeof showToast==='function')showToast(message,{tone:'error'});}catch(__){}}}

  async function longWeekendConflict(form){
    if(!form)return null;
    const fd=new FormData(form),type=txt(fd.get('type'));
    if(typeBase(type)!=='ไม่รับเวร')return null;
    const staffId=String(isAdminSafe()?(fd.get('staff_id')||currentStaffSafe()):currentStaffSafe()||''),group=staffGroup(staffId);
    if(group!=='MT')return null;
    const start=dateKey(fd.get('start_date')),end=dateKey(fd.get('end_date')||start);if(!start||!end||end<start)return null;
    const [rows,holidays]=await Promise.all([freshNoDutyRows(start,end),freshHolidayRowsForRange(start,end)]),editId=String(S().editingLeaveId||'');
    for(const date of datesBetween(start,end)){
      if(!weekend(date))continue;
      const lw=longWeekendCountForMonth(date,holidays);if(lw<2)continue;
      const ids=countNoDutyPeople(rows,date,'MT',editId);
      const alreadySelf=ids.includes(staffId),after=alreadySelf?ids.length:ids.length+1;
      if(after>2){
        return `ไม่สามารถบันทึก “ไม่รับเวร” ได้\n\nวันที่ ${thaiDate(date)} เป็นวันเสาร์–อาทิตย์ และเดือน ${date.slice(0,7)} มี Long Weekend ${lw} ครั้ง\nกลุ่ม MT จึงรับ “ไม่รับเวร” ได้ไม่เกิน 2 คน/วัน\nผู้ใช้โควตาแล้ว: ${ids.map(staffNick).join(', ')||'-'}\n\nเกณฑ์นี้แยกจากโควตาวันลา ตามข้อตกลงของหน่วยงาน วันที่ ${AGREEMENT}`;
      }
    }
    return null;
  }

  function installSaveGuard(){
    let base=null;try{base=window.saveLeave||(typeof saveLeave==='function'?saveLeave:null);}catch(_){base=window.saveLeave||null;}
    if(typeof base!=='function'||base.__v578LongWeekendGuard)return false;
    const wrapped=async function saveLeaveV578(form){
      try{const msg=await longWeekendConflict(form);if(msg){showCentered(msg);return;}}catch(err){console.error('[V578] long-weekend pre-check failed',err);}
      return base.apply(this,arguments);
    };
    wrapped.__v578LongWeekendGuard=true;
    try{window.saveLeave=wrapped;saveLeave=wrapped;}catch(_){window.saveLeave=wrapped;}
    return true;
  }

  function patchRuleNotice(){
    const update=()=>{
      document.querySelectorAll('[data-v576-quota-notice]').forEach(el=>{
        if(el.dataset.v578LongWeekend==='1')return;
        const span=document.createElement('div');span.className='hint v578-long-weekend-note';
        span.innerHTML='<b>Long Weekend:</b> หากเดือนนั้นมี Long Weekend ตั้งแต่ <b>2 ครั้งขึ้นไป</b> โควตา “ไม่รับเวร” ของ MT ในวันเสาร์–อาทิตย์จะลดจาก <b>3 เหลือ 2 คน/วัน</b> (Long Weekend = วันหยุดต่อเนื่องอย่างน้อย 3 วัน จากเสาร์–อาทิตย์ร่วมกับวันหยุดราชการ)';
        el.appendChild(span);el.dataset.v578LongWeekend='1';
      });
    };
    update();
    const mo=new MutationObserver(()=>update());mo.observe(document.documentElement,{subtree:true,childList:true});
  }

  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{if(!x||!/^v\d+/i.test(String(x.textContent||'').trim()))return;x.textContent='v578';x.title='Long Weekend No-Duty Quota';});
  }

  let tries=0;const timer=setInterval(()=>{tries++;if(installSaveGuard()||tries>120)clearInterval(timer);},50);
  installSaveGuard();patchRuleNotice();markVersion();setTimeout(markVersion,800);
  window.addEventListener('hashchange',()=>setTimeout(markVersion,350));window.addEventListener('pageshow',()=>setTimeout(markVersion,250));
  window.cnmiV578={version:VERSION,longWeekendCountForMonth,mtNoDutyLimit,longWeekendConflict};
  console.info('[V578] Long Weekend no-duty quota loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v578-long-weekend-noduty-quota.js failed",__cnmiPatchError); }
/* ===== END patch-v578-long-weekend-noduty-quota.js ===== */

/* ===== BEGIN patch-v584-approved-tracking-source-of-truth.js ===== */
try {
/* CNMI Staff Planner V584/V587 — Approved OT canonical source
 * V587 correction:
 * - Never synthesize extra OT rows from trade requests.
 * - The real approved ot_requests row is the single canonical row shown to Staff/Admin.
 * - Admin staff-detail is the same staff perspective, only with a selectable staff id.
 * - Effective duty correction may be applied in memory for display/calculation only.
 * No database/schema/write change.
 */
(function(){
  'use strict';
  const VERSION='V587_APPROVED_OT_CANONICAL_SOURCE';
  if(window.__CNMI_V584_APPROVED_TRACKING_SOURCE_OF_TRUTH__) return;
  window.__CNMI_V584_APPROVED_TRACKING_SOURCE_OF_TRUTH__=true;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function monthFromRoute(){
    try{
      const h=String(location.hash||'');
      const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null;
      const m=String(q?.get('month')||'').slice(0,7);
      if(/^\d{4}-\d{2}$/.test(m)) return m;
    }catch(_){ }
    const st=S();
    for(const v of [st.otMenuMonthV369,st.otMoneyMonthV241,st.otSourceMonthV241,st.myDutyMonthFilter,st.monthKey]){
      const m=String(v||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(m)) return m;
    }
    return new Date().toISOString().slice(0,7);
  }
  function isSynthetic(row){
    return !!row?._v584Synthetic || /^v584-trade-/i.test(String(row?.id||'')) || /\[V584_TRACKING_SOURCE=approved\]/i.test(String(row?.note||''));
  }
  function stripSyntheticState(){
    const st=S();
    if(!Array.isArray(st.otRequests)) return 0;
    const before=st.otRequests.length;
    st.otRequests=st.otRequests.filter(r=>!isSynthetic(r));
    return before-st.otRequests.length;
  }
  function corrected(row){
    if(!row) return row;
    try{
      const fn=window.cnmiV221DutyOt?.correctedOtRow;
      if(typeof fn==='function') return fn(row)||row;
    }catch(_){ }
    return row;
  }
  function patchApprovedDetails(){
    const api=window.cnmiV347;
    if(!api||typeof api.approvedDetails!=='function') return false;
    if(api.approvedDetails.__v587Canonical) return true;
    let prev=api.approvedDetails;
    // If an older V584 wrapper is somehow present in a long-lived tab, unwrap it first.
    while(prev?.__v584Previous) prev=prev.__v584Previous;
    const wrapped=function(staffId,month){
      stripSyntheticState();
      const rows=prev.call(this,staffId,month)||[];
      return rows.filter(r=>!isSynthetic(r)).map(corrected);
    };
    wrapped.__v587Canonical=true;
    wrapped.__v587Previous=prev;
    api.approvedDetails=wrapped;
    return true;
  }
  async function preloadAndSync(){
    stripSyntheticState();
    patchApprovedDetails();
    try{ await window.cnmiV577?.preloadOtReferenceData?.(monthFromRoute(),{force:false}); }catch(err){ console.warn(`[${VERSION}] reference preload`,err); }
    stripSyntheticState();
    patchApprovedDetails();
    return {changed:false,count:0};
  }
  function sync(){
    const removed=stripSyntheticState();
    patchApprovedDetails();
    return {changed:removed>0,count:0,removed};
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim())) return;
      x.textContent='v587'; x.title='Staff/Admin OT parity + canonical real rows';
    });
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(patchApprovedDetails()||tries>100){ clearInterval(timer); preloadAndSync(); setTimeout(markVersion,250); }
  },80);
  window.addEventListener('hashchange',()=>{ stripSyntheticState(); setTimeout(preloadAndSync,60); setTimeout(markVersion,220); });
  window.addEventListener('pageshow',()=>{ stripSyntheticState(); setTimeout(preloadAndSync,100); setTimeout(markVersion,250); });

  window.cnmiV584={version:VERSION,sync,synthRows:()=>[],patchApprovedDetails,preloadAndSync,stripSyntheticState};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v584-approved-tracking-source-of-truth.js failed",__cnmiPatchError); }
/* ===== END patch-v584-approved-tracking-source-of-truth.js ===== */

/* ===== BEGIN patch-v585-ot-detail-performance.js ===== */
try {
/* CNMI Staff Planner V585 — OT Staff Detail Performance
 * - Keep holiday/public-holiday trade HR conversion unchanged (e.g. MT 160 -> HR base 130).
 * - Stop V577 from full-page rerendering the Staff Detail route after preload.
 * - Hydrate Staff Detail carry/trade/helper data in one parallel pass and query carry once.
 * No database/schema change.
 */
(function(){
  'use strict';
  const VERSION='V585_OT_DETAIL_PERFORMANCE';
  if(window.__CNMI_V585_OT_DETAIL_PERFORMANCE__) return;
  window.__CNMI_V585_OT_DETAIL_PERFORMANCE__=true;
  function mark(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim())) return;
      x.textContent='v585'; x.title='OT Staff Detail Performance';
    });
  }
  setTimeout(mark,400);
  window.addEventListener('hashchange',()=>setTimeout(mark,220));
  window.cnmiV585={version:VERSION};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v585-ot-detail-performance.js failed",__cnmiPatchError); }
/* ===== END patch-v585-ot-detail-performance.js ===== */

/* ===== BEGIN patch-v587-staff-admin-ot-parity.js ===== */
try {
/* CNMI Staff Planner V587 — Staff/Admin OT parity
 * 1) Admin selected staff sees the same canonical real OT rows as that staff account.
 * 2) Load completed received-trades directly by receiver as a fallback, so Staff and Admin
 *    have the same reference data even when roster preload/RLS differs.
 * 3) OT detail rows use the current global HR-normalization result (including V574 multi-trade),
 *    not the old single-trade closure captured by V356.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V587_STAFF_ADMIN_OT_PARITY';
  if(window.__CNMI_V587_STAFF_ADMIN_OT_PARITY__) return;
  window.__CNMI_V587_STAFF_ADMIN_OT_PARITY__=true;

  const loaded=new Set();
  const loading=new Map();
  let rerendering=false;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function monthKey(){
    try{ const h=String(location.hash||''); const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null; const m=String(q?.get('month')||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(m))return m; }catch(_){ }
    const st=S();
    for(const v of [st.otMoneyMonthV241,st.otSourceMonthV241,st.otMenuMonthV369,st.myDutyMonthFilter,st.monthKey]){const m=String(v||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(m))return m;}
    return new Date().toISOString().slice(0,7);
  }
  function selectedSid(){ return String(S()?.otDetailStaffV369||currentSid()||''); }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n)?Math.round(n*100)/100:0; }
  function hours(v){ const n=round2(v); return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,''); }
  function esc(v){ try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));} }
  function fmtDate(v){ const d=normDate(v); try{return formatThaiDate(d);}catch(_){return d||'-';} }
  function staffName(id){ try{return staffNick(id);}catch(_){const s=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{};return s.nickname||s.full_name||id||'-';} }
  function assignmentCode(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function dutyLabel(code){ try{return DUTY_LABEL?.[code]||code||'-';}catch(_){return code||'-';} }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function assignmentForTrade(trade){
    const real=(S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(trade?.from_assignment_id||''));
    if(real) return real;
    const date=marker(trade?.note,'SELL_DATE'),code=marker(trade?.note,'SELL_DUTY');
    return date&&code?{id:trade?.from_assignment_id||'',duty_date:date,duty_code:code,staff_id:trade?.requester_id||''}:null;
  }
  function mergeTrades(rows){
    const map=new Map();
    (S().tradeRequests||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}|${x?.requester_id}`);if(k)map.set(k,x);});
    (rows||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}|${x?.requester_id}`);if(k)map.set(k,x);});
    S().tradeRequests=[...map.values()];
  }
  async function ensureReceiverTrades(month,sid,{force=false}={}){
    month=String(month||monthKey()).slice(0,7); sid=String(sid||'');
    if(!sid) return {loaded:false,reason:'no-staff'};
    const key=`${month}|${sid}`;
    if(!force&&loaded.has(key)) return {loaded:true,cached:true};
    if(loading.has(key)) return loading.get(key);
    const task=(async()=>{
      const db=DB(); if(!db?.from) return {loaded:false,reason:'no-db'};
      // Receiver-only query is intentionally independent of roster-assignment preload.
      // RLS can therefore give a Staff account its own completed trade rows directly.
      const res=await db.from('roster_trade_requests').select('*').eq('receiver_id',sid).eq('status','completed').order('created_at',{ascending:false});
      if(res?.error) throw res.error;
      const rows=(res?.data||[]).filter(t=>{
        const a=assignmentForTrade(t); const d=normDate(a?.duty_date||marker(t?.note,'SELL_DATE'));
        return !d || d.startsWith(month);
      });
      mergeTrades(rows);
      loaded.add(key);
      return {loaded:true,count:rows.length,month,sid};
    })().catch(error=>{console.warn(`[${VERSION}] receiver trades`,error);return {loaded:false,error};}).finally(()=>loading.delete(key));
    loading.set(key,task); return task;
  }
  function globalBreakdown(row){
    let r=row;
    try{ const fn=window.cnmiV221DutyOt?.correctedOtRow; if(typeof fn==='function')r=fn(row)||row; }catch(_){ }
    try{
      const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(r);
      if(n&&Number.isFinite(Number(n.hrHours))) return n;
    }catch(err){ console.warn(`[${VERSION}] breakdown`,err); }
    let actual=0; try{actual=Number(calcOtHours(r)||0);}catch(_){actual=Number(r?.manual_hours||r?.requested_hours||r?.hours||0);}
    return {actualHours:round2(actual),hrHours:round2(actual),segments:[],tradeInfo:null,helperInfo:null};
  }
  function timeText(row){
    const st=String(row?.start_time||'').slice(0,5),en=String(row?.end_time||'').slice(0,5),d=normDate(row?.work_date),ed=normDate(row?.end_date);
    return `${st||'-'}–${en||'-'}${ed&&d&&ed!==d?` (${fmtDate(ed)})`:''}`;
  }
  function claimStatus(row){
    const s=String(row?.claim_status||'').trim().toLowerCase();
    return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s)?'<span class="badge green">Exported</span>':'<span class="badge orange">Pending</span>';
  }
  function tradeLines(n){
    const info=n?.tradeInfo;
    if(!info) return '';
    const list=Array.isArray(info.trades)&&info.trades.length?info.trades:null;
    if(!list){
      const a=info.assignment||{},t=info.trade||{};
      return `<div class="v587-trade-line"><span class="badge purple">OT จากการซื้อเวร</span> ซื้อจาก <b>${esc(staffName(t.requester_id))}</b> • ${esc(dutyLabel(assignmentCode(a)))} • ${hours(info.soldHours)} ชม. → <b>${hours(info.claimHours)} ชม. HR</b></div>`;
    }
    return `<div class="v587-trade-box"><div><span class="badge purple">รวม ${list.length} ช่วงซื้อเวร</span></div>${list.map(item=>{
      const a=item.assignment||{},t=item.trade||{};
      const amount=round2(item.amount||0);
      return `<div class="v587-trade-line">${esc(dutyLabel(assignmentCode(a)))} • ${hours(item.soldHours)} ชม. • ซื้อจาก ${esc(staffName(t.requester_id))}${amount>0?` • ${amount.toLocaleString('th-TH')} บ.`:''} → <b>${hours(item.claimHours)} ชม. HR</b></div>`;
    }).join('')}</div>`;
  }
  function detailRows(rows){
    const source=(rows||[]).filter(r=>!r?._v584Synthetic&&!/^v584-trade-/i.test(String(r?.id||'')));
    if(!source.length) return '<div class="empty">ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้</div>';
    const cards=source.map(row=>{
      const n=globalBreakdown(row);
      return `<article class="v348-ot-card v587-canonical-row"><div class="v348-card-head"><b>${esc(fmtDate(row.work_date))}</b>${claimStatus(row)}</div><div><b>${esc(row.reason||'-')}</b><div class="muted">${esc(timeText(row))}</div></div>${tradeLines(n)}<div class="v348-hour-pair"><span>ชั่วโมงจริง <b>${hours(n.actualHours)}</b></span><span>ชั่วโมงเบิก HR <b>${hours(n.hrHours)}</b></span></div></article>`;
    }).join('');
    const body=source.map(row=>{
      const n=globalBreakdown(row);
      return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${esc(timeText(row))}</td><td><b>${esc(row.reason||'-')}</b>${tradeLines(n)}</td><td><b>${hours(n.actualHours)}</b></td><td><b>${hours(n.hrHours)}</b></td><td>${claimStatus(row)}</td></tr>`;
    }).join('');
    return `<div class="v348-detail-rows v587-detail-rows"><div class="table-wrap v348-desktop-detail"><table><thead><tr><th>วันที่ OT</th><th>เวลา</th><th>เหตุผล / ที่มา</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table></div><div class="v348-mobile-detail">${cards}</div></div>`;
  }
  function install(){
    try{ window.cnmiV584?.stripSyntheticState?.(); }catch(_){ }
    if(window.cnmiV348) window.cnmiV348.detailRows=detailRows;
  }
  async function hydrateForCurrentView({force=false,rerender=true}={}){
    install();
    const month=monthKey(),sid=selectedSid();
    if(!sid) return;
    const result=await ensureReceiverTrades(month,sid,{force});
    install();
    if(!result?.loaded) return;
    if(admin()&&String(S()?.otMenuV369||'')==='admin-details'){
      try{ await window.cnmiV369?.hydrateAdminDetail?.(); }catch(_){ }
      return;
    }
    if(rerender&&!rerendering&&String(location.hash||'').startsWith('#/ot')){
      rerendering=true;
      try{ if(typeof renderPage==='function') renderPage(); else window.renderPage?.(); }catch(_){ }
      setTimeout(()=>{rerendering=false;install();},0);
    }
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim())) return;
      x.textContent='v587'; x.title='Staff/Admin OT parity';
    });
  }

  let tries=0;
  const timer=setInterval(()=>{tries++;install();if(window.cnmiV348&&window.v190HrRateNormalization||tries>100){clearInterval(timer);setTimeout(()=>hydrateForCurrentView({force:false,rerender:true}),120);setTimeout(markVersion,260);}},80);
  window.addEventListener('hashchange',()=>{setTimeout(()=>hydrateForCurrentView({force:false,rerender:true}),100);setTimeout(markVersion,240);});
  window.addEventListener('pageshow',()=>{setTimeout(()=>hydrateForCurrentView({force:false,rerender:true}),140);setTimeout(markVersion,260);});
  document.addEventListener('change',e=>{
    if(e.target?.id==='v369AdminDetailStaff'){
      const sid=String(e.target.value||'');
      if(sid) setTimeout(()=>ensureReceiverTrades(monthKey(),sid,{force:true}).then(()=>{install();return window.cnmiV369?.hydrateAdminDetail?.();}),60);
    }
    if(['otMoneyMonthV241','otSourceMonthV241','myDutyMonthFilter'].includes(e.target?.id)) setTimeout(()=>hydrateForCurrentView({force:true,rerender:true}),100);
  },true);

  const style=document.createElement('style');
  style.textContent='.v587-trade-box{margin-top:8px;padding:8px 10px;border:1px solid #e4dafb;border-radius:10px;background:#faf7ff}.v587-trade-line{margin-top:5px;font-size:12px;color:#52657a}.v587-trade-line b{color:#263a4d}.v587-canonical-row .v348-hour-pair{margin-top:10px}';
  document.head.appendChild(style);

  window.cnmiV587={version:VERSION,ensureReceiverTrades,detailRows,globalBreakdown,hydrateForCurrentView};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v587-staff-admin-ot-parity.js failed",__cnmiPatchError); }
/* ===== END patch-v587-staff-admin-ot-parity.js ===== */

/* ===== BEGIN patch-v588-approval-canonical-parity.js ===== */
try {
/* CNMI Staff Planner V588 — Approval canonical OT parity
 * Fix: the Approval OT table in V191 showed the legacy explicit/manual "actual hours"
 * while HR hours already came from the newer trade-aware normalization.  That could
 * show e.g. 8 actual / 29.54 HR even though the canonical Staff/Admin detail is
 * 24 actual / 29.54 HR for the same approved attendance row.
 *
 * V588 makes both Staff "รายการ OT ของฉัน" and Admin "อนุมัติ OT" render hours from
 * the exact same current normalization object.  No synthetic OT rows and no DB writes.
 */
(function(){
  'use strict';
  const VERSION='V588_APPROVAL_CANONICAL_OT_PARITY';
  if(window.__CNMI_V588_APPROVAL_CANONICAL_OT_PARITY__) return;
  window.__CNMI_V588_APPROVAL_CANONICAL_OT_PARITY__=true;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function esc(v){ try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));} }
  function fmtDate(v){ const d=normDate(v); try{return formatThaiDate(d);}catch(_){return d||'-';} }
  function round(v,d=2){ const n=Number(v||0); if(!Number.isFinite(n))return 0; const m=10**d; return Math.round(n*m)/m; }
  function hours(v,d=2){ const n=round(v,d); return Number.isInteger(n)?String(n):n.toFixed(d).replace(/0+$/,'').replace(/\.$/,''); }
  function staffName(id){ try{return staffNick(id);}catch(_){const s=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{};return s.nickname||s.full_name||id||'-';} }
  function dutyCode(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function dutyLabel(code){ try{return DUTY_LABEL?.[code]||code||'-';}catch(_){return code||'-';} }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function clock(v){ const m=String(v||'').match(/(\d{1,2}):(\d{2})/); return m?`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`:''; }
  function statusText(row){ return String(row?.status||'').trim(); }
  function claimStatus(row){
    const s=String(row?.claim_status||'').trim().toLowerCase();
    return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s)?'Claimed':'Pending';
  }
  function isClaimed(row){ return claimStatus(row)==='Claimed'; }
  function isApproved(row){ return statusText(row)==='อนุมัติ'; }
  function isRejected(row){ return ['ไม่อนุมัติ','ไม่อนุมัติแล้ว','rejected','reject','denied','not_approved','not approved'].includes(statusText(row).replace(/\s+/g,' ').toLowerCase()); }
  function corrected(row){
    try{ const fn=window.cnmiV221DutyOt?.correctedOtRow; return typeof fn==='function'?(fn(row)||row):row; }
    catch(_){ return row; }
  }
  function canonical(row){
    const work=corrected(row);
    try{
      const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(work);
      if(n&&Number.isFinite(Number(n.actualHours))&&Number.isFinite(Number(n.hrHours))) return n;
    }catch(err){ console.warn(`[${VERSION}] normalization`,err); }
    let actual=0;
    try{ actual=Number(calcOtHours(work)||0); }catch(_){ actual=Number(work?.manual_hours||work?.requested_hours||work?.hours||0); }
    return {actualHours:round(actual,2),hrHours:round(actual,2),segments:[],tradeInfo:null,helperInfo:null};
  }
  function reasonHtml(row){
    try{
      const h=window.v176OtReasonHelpers;
      if(h?.compactOtReasonText176){ const t=h.compactOtReasonText176(row); return `${esc(t.main||'-')}${t.detail?`<br><span class="muted">${esc(t.detail)}</span>`:''}`; }
    }catch(_){ }
    return `${esc(row?.reason||'-')}${row?.note?`<br><span class="muted">${esc(row.note)}</span>`:''}`;
  }
  function endDate(row){
    const col=normDate(row?.end_date); if(col)return col;
    const m=String(row?.note||'').match(/วันที่สิ้นสุด\s*(\d{4}-\d{2}-\d{2})/); return m?normDate(m[1]):normDate(row?.work_date);
  }
  function noteStart(row){ return String(row?.note||'').match(/เวลาเริ่ม\s*([0-2]?\d:[0-5]\d)/)?.[1]||''; }
  function baseTimeText(row){
    const d=normDate(row?.work_date),ed=endDate(row)||d;
    const st=clock(row?.start_time||noteStart(row)),en=clock(row?.end_time);
    const a=st?`${fmtDate(d)} ${esc(st)}`:fmtDate(d);
    const b=en?`${fmtDate(ed)} ${esc(en)}`:fmtDate(ed);
    return `${a}<br><span class="muted">ถึง ${b}</span>`;
  }
  const PART_TIME={
    full24:'08:00–08:00 (+1 วัน)', morning_afternoon:'08:00–00:00 (+1 วัน)', afternoon_night:'16:00–08:00 (+1 วัน)',
    night_morning:'00:00–08:00 (+1 วัน) + 08:00–16:00', morning:'08:00–16:00', afternoon:'16:00–00:00 (+1 วัน)', night:'00:00–08:00 (+1 วัน)'
  };
  function tradeWindow(item){
    const t=item?.trade||{},a=item?.assignment||{},note=String(t?.note||'');
    const st=clock(marker(note,'SELL_START')),en=clock(marker(note,'SELL_END'));
    if(st&&en) return `${st}–${en}${en<=st?' (+1 วัน)':''}`;
    const part=marker(note,'SELL_PART'); if(PART_TIME[part])return PART_TIME[part];
    const segs=marker(note,'SELL_SEGMENTS');
    if(segs){
      const s=segs.split(',').map(x=>x.trim()).filter(Boolean).join(',');
      const map={morning:'08:00–16:00',afternoon:'16:00–00:00 (+1 วัน)',night:'00:00–08:00 (+1 วัน)'};
      const arr=s.split(',').map(x=>map[x]).filter(Boolean); if(arr.length)return arr.join(' + ');
    }
    const sold=Number(item?.soldHours||0),code=dutyCode(a);
    if(sold===24)return '08:00–08:00 (+1 วัน)';
    if(sold===16&&/^ชบด[123]$/.test(code))return '16:00–08:00 (+1 วัน)';
    if(sold===8&&['ช3A','ช3B','ช9','ช9-MT','ช9-เคิก'].includes(code))return '08:00–16:00';
    return `${dutyLabel(code)} • ${hours(sold)} ชม.`;
  }
  function tradeItems(n){
    const info=n?.tradeInfo;
    if(!info)return [];
    if(Array.isArray(info.trades)&&info.trades.length) return info.trades;
    if(info.trade||info.assignment) return [{trade:info.trade,assignment:info.assignment,soldHours:info.soldHours,claimHours:info.claimHours,amount:info.amount}];
    return [];
  }
  function canonicalTimeText(row,n){
    const items=tradeItems(n);
    if(n?.multiTrade&&items.length>1){
      const labels=[...new Set(items.map(tradeWindow).filter(Boolean))];
      if(labels.length) return `<b>${esc(fmtDate(row?.work_date))}</b><br><span class="muted">${labels.map(esc).join(' + ')}</span>`;
    }
    return baseTimeText(row);
  }
  function sourceBreakdown(row,n){
    const items=tradeItems(n);
    if(!items.length)return '';
    const head=items.length>1?`รวม ${items.length} ช่วงที่ยืนยัน/รับเวร`:'OT จากการซื้อเวร';
    const lines=items.map(item=>{
      const t=item?.trade||{},a=item?.assignment||{};
      const who=staffName(t?.requester_id),windowText=tradeWindow(item),code=dutyLabel(dutyCode(a));
      const amount=Number(item?.amount||0),claim=Number(item?.claimHours||0),sold=Number(item?.soldHours||0);
      return `<div class="v588-source-line"><b>${esc(windowText)}</b> • ${esc(code)} • ${hours(sold)} ชม.${who&&who!=='-'?` • ซื้อจาก ${esc(who)}`:''}${amount>0?` • ${amount.toLocaleString('th-TH')} บ.`:''} → <b>${hours(claim)} ชม. HR</b></div>`;
    }).join('');
    return `<div class="v588-source-box"><span class="badge purple">${esc(head)}</span>${lines}</div>`;
  }
  function statusBadge(row){
    const s=statusText(row)||'-';
    let out='';
    try{ out=badge(s,s==='อนุมัติ'?'green':s==='ไม่อนุมัติ'?'red':s==='ส่งกลับแก้ไข'?'orange':'black'); }
    catch(_){ out=`<span class="badge">${esc(s)}</span>`; }
    return `${out}${isClaimed(row)?'<br><span class="badge yellow">Exported</span>':''}`;
  }
  function actionButtons(row){
    if(admin()){
      const disabled=isClaimed(row)?'disabled':'';
      const statuses=(()=>{ try{return Array.isArray(OT_STATUSES)?OT_STATUSES:['รออนุมัติ','อนุมัติ','ไม่อนุมัติ','ส่งกลับแก้ไข'];}catch(_){return ['รออนุมัติ','อนุมัติ','ไม่อนุมัติ','ส่งกลับแก้ไข'];} })();
      return `<div class="actions v191-ot-actions v588-ot-actions"><button class="tiny-btn icon-btn" type="button" data-edit-ot="${esc(row?.id)}" ${disabled} title="${isClaimed(row)?'รายการนี้ Export HR แล้ว ห้ามแก้ไข':'แก้ไขรายการ OT'}">✏️</button><button class="tiny-btn icon-btn danger" type="button" data-delete-ot-admin="${esc(row?.id)}" ${disabled} title="${isClaimed(row)?'รายการนี้ Export HR แล้ว ห้ามลบ':'ลบรายการ OT'}">🗑️</button>${statuses.filter(s=>s!=='รออนุมัติ').map(s=>`<button class="tiny-btn" type="button" data-ot-status="${esc(row?.id)}|${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    }
    const buttons=[];
    const owner=String(row?.staff_id||'')===currentSid();
    if(owner&&!isApproved(row)&&!isClaimed(row))buttons.push(`<button class="tiny-btn" type="button" data-edit-ot="${esc(row?.id)}">แก้ไข</button>`);
    if(owner&&isRejected(row))buttons.push(`<button class="tiny-btn danger" type="button" data-delete-rejected-ot="${esc(row?.id)}">ลบ</button>`);
    return buttons.length?`<div class="actions v191-ot-actions">${buttons.join('')}</div>`:'-';
  }
  function visibleRows(rows){
    const source=(Array.isArray(rows)?rows:(S().otRequests||[])).filter(r=>!r?._v584Synthetic&&!/^v584-trade-/i.test(String(r?.id||'')));
    const base=admin()?(typeof filteredOtRows==='function'?filteredOtRows(source):source):source.filter(r=>String(r?.staff_id||'')===currentSid());
    return base.slice().sort((a,b)=>normDate(b?.work_date).localeCompare(normDate(a?.work_date))||String(b?.created_at||'').localeCompare(String(a?.created_at||'')));
  }
  function hourInfo(row){
    const n=canonical(row),actual=Number(n?.actualHours||0),hr=Number(n?.hrHours||0),changed=Math.abs(hr-actual)>0.004;
    const label=n?.helperInfo?'แปลงตามเรทช่องที่ลงชื่อ':n?.tradeInfo?'แปลงตามเรทที่ซื้อ':'Normalize';
    const tone=n?.helperInfo?'blue':n?.tradeInfo?'purple':'yellow';
    return {n,actual,hr,changed,label,tone};
  }
  function render(rows){
    try{
      const visible=visibleRows(rows),filters=admin()&&typeof renderOtFilters==='function'?renderOtFilters():'';
      if(!visible.length){ try{return filters+empty(admin()?'ยังไม่มีรายการ OT ตามตัวกรองนี้':'ยังไม่มีรายการ OT ของฉัน');}catch(_){return filters+'<div class="empty">ยังไม่มีรายการ OT</div>'; } }
      const body=visible.map(row=>{
        const h=hourInfo(row),source=sourceBreakdown(row,h.n);
        return `<tr><td>${staffPill(row.staff_id)}</td><td>${canonicalTimeText(row,h.n)}</td><td>${reasonHtml(row)}${source}</td><td><b>${hours(h.actual,1)}</b></td><td><b>${hours(h.hr,2)}</b>${h.changed?`<br><span class="badge ${h.tone}">${h.label}</span>`:''}</td><td>${statusBadge(row)}</td><td>${actionButtons(row)}</td></tr>`;
      }).join('');
      const table=`<div class="table-wrap ot-desktop-table v190-ot-table v191-ot-table v588-canonical-approval"><table><thead><tr><th>ชื่อ</th><th>ช่วงเวลาทำงาน</th><th>เหตุผล / ที่มา</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${body}</tbody></table></div>`;
      const cards=`<div class="mobile-cards ot-mobile-cards v190-ot-cards v191-ot-cards v588-canonical-cards">${visible.map(row=>{ const h=hourInfo(row),acts=actionButtons(row); return `<div class="mobile-card"><div class="mobile-day-head">${staffPill(row.staff_id)}${statusBadge(row)}</div><div><b>ช่วงเวลาทำงาน</b><br>${canonicalTimeText(row,h.n)}</div><div><b>เหตุผล:</b> ${reasonHtml(row)}${sourceBreakdown(row,h.n)}</div><div><b>ชั่วโมงจริง:</b> ${hours(h.actual,1)}<br><b>ชั่วโมงเบิก HR:</b> ${hours(h.hr,2)}${h.changed?` <span class="badge ${h.tone}">${h.label}</span>`:''}</div>${acts!=='-'?acts:''}</div>`; }).join('')}</div>`;
      return filters+table+cards;
    }catch(err){ console.error(`[${VERSION}] render failed`,err); return '<div class="notice error-notice">แสดงรายการ OT ไม่สำเร็จ กรุณารีเฟรชอีกครั้ง</div>'; }
  }
  function install(){ window.renderOtTable=renderOtTable=render; return true; }
  function addStyle(){
    if(document.getElementById('v588CanonicalStyle'))return;
    const st=document.createElement('style'); st.id='v588CanonicalStyle'; st.textContent=`
      .v588-source-box{margin-top:6px;padding:7px 9px;border-radius:10px;background:#f7f4ff;font-size:12px;line-height:1.45}
      .v588-source-line{margin-top:4px;color:#40516a}.v588-source-line b{color:#20354d}
      @media(max-width:760px){.v588-source-box{font-size:12px}.v588-canonical-cards .mobile-card{overflow:hidden}}
    `; document.head.appendChild(st);
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{ if(!x||!/^v\d+/i.test(String(x.textContent||'').trim()))return; x.textContent='v588'; x.title='Approval canonical OT parity'; });
  }
  async function warm(){
    try{ await window.cnmiV577?.preloadOtReferenceData?.((()=>{try{const h=String(location.hash||'');const q=h.includes('?')?new URLSearchParams(h.split('?')[1]):null;return String(q?.get('month')||'').slice(0,7);}catch(_){return '';}})(),{force:false}); }catch(_){ }
    install();
    if(String(location.hash||'').startsWith('#/ot')){ try{ if(typeof renderPage==='function')renderPage(); }catch(_){ } }
  }

  addStyle(); install(); setTimeout(markVersion,180); setTimeout(warm,220);
  window.addEventListener('hashchange',()=>{setTimeout(()=>{install();markVersion();warm();},80);});
  window.addEventListener('pageshow',()=>{setTimeout(()=>{install();markVersion();},120);});
  window.cnmiV588={version:VERSION,render,canonical};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v588-approval-canonical-parity.js failed",__cnmiPatchError); }
/* ===== END patch-v588-approval-canonical-parity.js ===== */

/* ===== BEGIN patch-v589-trade-chain-net-hours-rate-override.js ===== */
try {
/* CNMI Staff Planner V589 — Trade-chain net hours + explicit OT rate override
 *
 * Fixes chained/partial trade OT calculation.
 * Example: A sells a 24h duty to B, then B sells 08:00–17:00 (9h) onward to C.
 * B actually remains 17:00–08:00 = 15h, so B must not keep the original 24h
 * purchase amount/hours in OT.  The current approved OT rate token
 * [OT_RATE_TYPE=MT|CLERK] is also honored as an Admin correction, even when the
 * original trade request was saved with the wrong sell rate.
 *
 * No DB writes / no SQL.  This wraps the final V588 normalization only.
 */
(function(){
  'use strict';
  const VERSION='V589_TRADE_CHAIN_NET_HOURS_RATE_OVERRIDE';
  if(window.__CNMI_V589_TRADE_CHAIN_NET_HOURS_RATE_OVERRIDE__) return;
  window.__CNMI_V589_TRADE_CHAIN_NET_HOURS_RATE_OVERRIDE__=true;

  const chainLoaded=new Set(),chainLoading=new Map();
  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function selectedSid(){ return String((admin()?S()?.otDetailStaffV369:'')||currentSid()||''); }
  function monthKey(){ try{const h=String(location.hash||'');const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null;const m=String(q?.get('month')||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(m))return m;}catch(_){ } return String(S()?.monthKey||new Date().toISOString().slice(0,7)).slice(0,7); }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n)?Math.round(n*100)/100:0; }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function decode(v){ try{return decodeURIComponent(String(v||''));}catch(_){return String(v||'');} }
  function clockMin(v){ const m=String(v||'').match(/(\d{1,2}):(\d{2})/); if(!m)return NaN; return Number(m[1])*60+Number(m[2]); }
  function clockText(min){ let n=Math.round(Number(min||0)); n=((n%1440)+1440)%1440; return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
  function holiday(date){ try{return !!isHolidayDate(normDate(date));}catch(_){ const d=new Date(`${normDate(date)}T12:00:00`); const day=d.getDay(); return day===0||day===6; } }
  function staffRec(id){ return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{}; }
  function hrBase(id){ const s=staffRec(id); return /เคิก|clerk/i.test(String(s?.staff_type||s?.type||''))?90:130; }
  function rateFor(type,date){ return type==='CLERK'?(holiday(date)?120:90):(holiday(date)?160:130); }
  function explicitRate(row){ const m=`${row?.note||''} ${row?.device||''}`.match(/\[OT_RATE_TYPE=(MT|CLERK)\]/i); return m?String(m[1]).toUpperCase():''; }
  function codeOf(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function assignmentById(id){ return (S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null; }
  function assignmentForTrade(t,fallback=null){
    const real=assignmentById(t?.from_assignment_id); if(real)return real;
    if(fallback)return fallback;
    const date=decode(marker(t?.note,'SELL_DATE')),code=decode(marker(t?.note,'SELL_DUTY'));
    return date&&code?{id:t?.from_assignment_id||'',duty_date:date,duty_code:code,staff_id:t?.requester_id||''}:null;
  }
  function fullHours(a){
    try{ const h=Number(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code)); if(h>0)return h; }catch(_){ }
    try{ const h=Number(dutyHoursForCode(a?.duty_date,a?.duty_code)); if(h>0)return h; }catch(_){ }
    const m=Number(marker(a?.note,'SELL_HOURS')); return m>0?m:8;
  }
  function assignmentWindow(a){
    const full=fullHours(a),code=codeOf(a);
    if(/^ชบด[123]$/.test(code)) return full>=24?{start:480,end:1920}:{start:960,end:1920};
    if(['ช3A','ช3B','ช9','ช9-MT','ช9-เคิก'].includes(code)) return {start:480,end:960};
    if(['ช4','ช4A','ช4B'].includes(code)&&full<=8.01) return {start:960,end:1440};
    if(full>=24)return {start:480,end:1920};
    if(full>=16)return {start:960,end:1920};
    return {start:480,end:480+Math.max(1,full)*60};
  }
  function resolveRange(st,en,a){
    const w=assignmentWindow(a),s0=clockMin(st),e0=clockMin(en); if(!Number.isFinite(s0)||!Number.isFinite(e0))return null;
    const starts=[s0,s0+1440,s0+2880].filter(x=>x>=w.start-0.01&&x<w.end-0.01); if(!starts.length)return null;
    const s=starts[0],ends=[e0,e0+1440,e0+2880].filter(x=>x>s+0.01&&x<=w.end+0.01); if(!ends.length)return null;
    return [s,ends[0]];
  }
  function partIntervals(part,a){
    const w=assignmentWindow(a),map={morning:[480,960],afternoon:[960,1440],night:[1440,1920]};
    const defs={full24:['morning','afternoon','night'],morning_afternoon:['morning','afternoon'],afternoon_night:['afternoon','night'],night_morning:['night','morning'],morning:['morning'],afternoon:['afternoon'],night:['night']};
    const names=defs[String(part||'').toLowerCase()]||[];
    return names.map(n=>map[n]).filter(Boolean).map(([s,e])=>[Math.max(s,w.start),Math.min(e,w.end)]).filter(([s,e])=>e>s+0.01);
  }
  function tradeIntervals(t,a,soldHint=0){
    const note=String(t?.note||''),st=marker(note,'SELL_START'),en=marker(note,'SELL_END');
    if(st&&en){ const r=resolveRange(st,en,a); if(r)return [r]; }
    const segRaw=marker(note,'SELL_SEGMENTS');
    if(segRaw&&segRaw!=='custom'){
      const w=assignmentWindow(a),map={morning:[480,960],afternoon:[960,1440],night:[1440,1920]};
      const arr=segRaw.split(',').map(x=>x.trim()).filter(Boolean).map(n=>map[n]).filter(Boolean).map(([s,e])=>[Math.max(s,w.start),Math.min(e,w.end)]).filter(([s,e])=>e>s+0.01);
      if(arr.length)return arr;
    }
    const part=marker(note,'SELL_PART');
    const p=partIntervals(part,a); if(p.length)return p;
    const sold=Number(marker(note,'SELL_HOURS')||soldHint||0),w=assignmentWindow(a),fh=(w.end-w.start)/60;
    if(sold>0&&Math.abs(sold-fh)<=0.11)return [[w.start,w.end]];
    return [];
  }
  function mergeIntervals(list){
    const rows=(list||[]).slice().sort((a,b)=>a[0]-b[0]); const out=[];
    rows.forEach(([s,e])=>{ if(!out.length||s>out[out.length-1][1]+0.01)out.push([s,e]); else out[out.length-1][1]=Math.max(out[out.length-1][1],e); });
    return out;
  }
  function intervalHours(list){ return round2(mergeIntervals(list).reduce((s,[a,b])=>s+Math.max(0,b-a)/60,0)); }
  function subtract(base,removed){
    let pieces=(base||[]).map(x=>[x[0],x[1]]);
    (removed||[]).slice().sort((a,b)=>a[0]-b[0]).forEach(([rs,re])=>{
      pieces=pieces.flatMap(([s,e])=>{
        if(re<=s||rs>=e)return [[s,e]];
        const out=[]; if(rs>s)out.push([s,Math.min(rs,e)]); if(re<e)out.push([Math.max(re,s),e]);
        return out.filter(([x,y])=>y>x+0.01);
      });
    });
    return pieces;
  }
  function sameSlot(parent,pa,child){
    if(String(parent?.from_assignment_id||'')&&String(parent?.from_assignment_id||'')===String(child?.from_assignment_id||''))return true;
    const pd=normDate(pa?.duty_date||decode(marker(parent?.note,'SELL_DATE'))),pc=codeOf(pa)||decode(marker(parent?.note,'SELL_DUTY'));
    const cd=normDate(decode(marker(child?.note,'SELL_DATE'))||assignmentById(child?.from_assignment_id)?.duty_date),cc=decode(marker(child?.note,'SELL_DUTY'))||codeOf(assignmentById(child?.from_assignment_id));
    return !!pd&&pd===cd&&!!pc&&pc===cc;
  }
  function downstream(parent,pa){
    const receiver=String(parent?.receiver_id||''); if(!receiver)return [];
    return (S().tradeRequests||[]).filter(t=>String(t?.status||'')==='completed'&&String(t?.id||'')!==String(parent?.id||'')&&String(t?.requester_id||'')===receiver&&sameSlot(parent,pa,t));
  }
  function cloneTradeWithNetWindow(t,intervals,netHours){
    const copy={...t};
    if((intervals||[]).length===1){
      const [s,e]=intervals[0]; let note=String(copy.note||'');
      note=note.replace(/\s*\[SELL_START=[^\]]+\]/ig,'').replace(/\s*\[SELL_END=[^\]]+\]/ig,'').replace(/\s*\[SELL_HOURS=[^\]]+\]/ig,'').trim();
      copy.note=`${note} [SELL_START=${clockText(s)}] [SELL_END=${clockText(e)}] [SELL_HOURS=${netHours}]`.trim();
    }
    return copy;
  }
  function effectiveItem(item){
    const t=item?.trade||{},a=assignmentForTrade(t,item?.assignment||null); if(!t?.receiver_id||!a)return {...item};
    const origHint=Number(item?.originalSoldHours||item?.soldHours||0),baseIntervals=tradeIntervals(t,a,origHint);
    const origHours=intervalHours(baseIntervals)||round2(origHint||Number(marker(t?.note,'SELL_HOURS'))||0);
    const children=downstream(t,a);
    let childIntervals=[]; let fallbackChildHours=0;
    children.forEach(c=>{ const ca=assignmentForTrade(c,a),ints=tradeIntervals(c,ca,Number(marker(c?.note,'SELL_HOURS'))||0); if(ints.length)childIntervals.push(...ints); else fallbackChildHours+=Number(marker(c?.note,'SELL_HOURS'))||0; });
    let remainIntervals=baseIntervals.length?mergeIntervals(subtract(baseIntervals,childIntervals)):[];
    let netHours=remainIntervals.length?intervalHours(remainIntervals):Math.max(0,round2(origHours-fallbackChildHours));
    if(baseIntervals.length&&fallbackChildHours>0)netHours=Math.max(0,round2(netHours-fallbackChildHours));
    if(!origHours&&Number(item?.soldHours||0)>0)netHours=round2(Number(item.soldHours||0));
    const resold=round2(Math.max(0,origHours-netHours));
    return {...item,trade:cloneTradeWithNetWindow(t,remainIntervals,netHours),assignment:a,originalSoldHours:origHours,soldHours:netHours,effectiveHours:netHours,resoldHours:resold,remainingIntervals:remainIntervals,downstreamTrades:children};
  }
  function originalAmount(item,info){
    const n=Number(item?.amount); if(Number.isFinite(n)&&n>=0)return n;
    const m=Number(info?.amount); if(Number.isFinite(m)&&m>=0)return m;
    const t=item?.trade||{}; const x=Number(t?.amount_from); return Number.isFinite(x)&&x>=0?x:0;
  }
  function normalizeItem(item,info,row,rateOverride){
    const eff=effectiveItem(item),sid=String((eff.trade||{}).receiver_id||row?.staff_id||''),base=hrBase(sid),date=eff.assignment?.duty_date||row?.work_date;
    const orig=Math.max(0,Number(eff.originalSoldHours||item?.soldHours||0)),net=Math.max(0,Number(eff.soldHours||0));
    let amount=0,claim=0,paidType=info?.paidType||'',paidRate=0;
    if(rateOverride){
      paidType=rateOverride==='CLERK'?'เคิก':'MT'; paidRate=rateFor(rateOverride,date); amount=round2(net*paidRate); claim=base>0?round2(amount/base):net;
    }else{
      const fullAmount=originalAmount(item,info);
      if(orig>0) amount=round2(fullAmount*(net/orig));
      else if(Number(info?.paidRate)>0) amount=round2(net*Number(info.paidRate));
      else amount=round2(fullAmount);
      paidRate=net>0?round2(amount/net):0; claim=base>0?round2(amount/base):net;
    }
    return {...eff,amount,claimHours:claim,receiverNormalRate:base,paidType,paidRate,rateOverride:rateOverride||'',netOfResale:eff.resoldHours>0.004};
  }
  function mergeTrades(rows){
    const map=new Map();
    (S().tradeRequests||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.requester_id}|${x?.receiver_id}`);if(k)map.set(k,x);});
    (rows||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.requester_id}|${x?.receiver_id}`);if(k)map.set(k,x);});
    S().tradeRequests=[...map.values()];
  }
  async function ensureOutgoingTrades(month,sid,{force=false}={}){
    month=String(month||monthKey()).slice(0,7); sid=String(sid||''); if(!sid)return {loaded:false,reason:'no-staff'};
    const key=`${month}|${sid}`; if(!force&&chainLoaded.has(key))return {loaded:true,cached:true}; if(chainLoading.has(key))return chainLoading.get(key);
    const task=(async()=>{
      const db=DB(); if(!db?.from)return {loaded:false,reason:'no-db'};
      const res=await db.from('roster_trade_requests').select('*').eq('requester_id',sid).eq('status','completed').order('created_at',{ascending:false});
      if(res?.error)throw res.error;
      const rows=(res?.data||[]).filter(t=>{
        const a=assignmentForTrade(t); const d=normDate(a?.duty_date||decode(marker(t?.note,'SELL_DATE'))); return !d||d.startsWith(month);
      });
      mergeTrades(rows); chainLoaded.add(key); return {loaded:true,count:rows.length};
    })().catch(error=>{console.warn(`[${VERSION}] outgoing trades`,error);return {loaded:false,error};}).finally(()=>chainLoading.delete(key));
    chainLoading.set(key,task); return task;
  }
  function install(){
    const api=window.v190HrRateNormalization; if(!api||typeof api.otNormalizationBreakdown190!=='function')return false;
    if(api.otNormalizationBreakdown190.__v589Wrapped)return true;
    const prev=api.otNormalizationBreakdown190;
    const wrapped=function(row){
      const n=prev.call(this,row)||{}; const info=n?.tradeInfo; if(!info)return n;
      try{
        const rawItems=Array.isArray(info.trades)&&info.trades.length?info.trades:[{trade:info.trade,assignment:info.assignment,soldHours:info.soldHours,amount:info.amount,claimHours:info.claimHours}];
        const override=explicitRate(row);
        const items=rawItems.map(it=>normalizeItem(it,info,row,override)).filter(it=>Number(it.soldHours||0)>0.004);
        if(!items.length)return {...n,actualHours:0,hrHours:0,segments:[],tradeInfo:{...info,trades:[],soldHours:0,actualHours:0,amount:0,claimHours:0,netOfResale:true},v589NetTrade:true};
        const actual=round2(items.reduce((s,x)=>s+Number(x.soldHours||0),0));
        const hr=round2(items.reduce((s,x)=>s+Number(x.claimHours||0),0));
        const amount=round2(items.reduce((s,x)=>s+Number(x.amount||0),0));
        const resold=round2(items.reduce((s,x)=>s+Number(x.resoldHours||0),0));
        const single=items.length===1?items[0]:null;
        const tradeInfo={...info,
          ...(single?{trade:single.trade,assignment:single.assignment,soldHours:single.soldHours,originalSoldHours:single.originalSoldHours,resoldHours:single.resoldHours,amount:single.amount,claimHours:single.claimHours,paidType:single.paidType,paidRate:single.paidRate,receiverNormalRate:single.receiverNormalRate,rateOverride:single.rateOverride,downstreamTrades:single.downstreamTrades}:{}),
          trades:items,actualHours:actual,soldHours:actual,amount,claimHours:hr,resoldHours:resold,netOfResale:resold>0.004,rateOverride:override||info?.rateOverride||''
        };
        const segments=items.map(x=>({actualHours:round2(x.soldHours),hrHours:round2(x.claimHours),shiftType:codeOf(x.assignment)||n.shiftType||'-',rateType:override?(override==='CLERK'?'เคิก':'MT'):(n.rateType||''),sourceRateType:x.paidType||'',normalRate:x.receiverNormalRate,appliedRate:x.paidRate,isHoliday:holiday(x.assignment?.duty_date||row?.work_date),tradeId:x.trade?.id||'',assignmentId:x.assignment?.id||'',resoldHours:x.resoldHours||0}));
        return {...n,actualHours:actual,hrHours:hr,segments,tradeInfo,isTradeRate:true,v589NetTrade:true,isExplicitRateV589:!!override,rateType:override?(override==='CLERK'?'เคิก':'MT'):(n.rateType||'')};
      }catch(err){ console.warn(`[${VERSION}] fallback`,err); return n; }
    };
    wrapped.__v589Wrapped=true; wrapped.__v589Previous=prev; api.otNormalizationBreakdown190=wrapped;
    return true;
  }
  async function hydrateAndRender({force=false}={}){
    const sid=selectedSid(),month=monthKey();
    try{ await window.cnmiV587?.ensureReceiverTrades?.(month,sid,{force}); }catch(_){ }
    try{ await ensureOutgoingTrades(month,sid,{force}); }catch(_){ }
    install();
    try{ if(String(location.hash||'').startsWith('#/ot')&&typeof renderPage==='function')renderPage(); }catch(_){ }
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{if(x&&/^v\d+/i.test(String(x.textContent||'').trim())){x.textContent='v589';x.title='Trade chain net hours + OT rate override';}});
  }
  let tries=0; const timer=setInterval(()=>{tries++;if(install()||tries>100){clearInterval(timer);setTimeout(()=>{markVersion();hydrateAndRender({force:false});},160);}},60);
  window.addEventListener('hashchange',()=>setTimeout(()=>{install();markVersion();hydrateAndRender({force:false});},100));
  window.addEventListener('pageshow',()=>setTimeout(()=>{install();markVersion();hydrateAndRender({force:false});},120));
  document.addEventListener('submit',e=>{if(e.target?.id==='otEditFormV191')setTimeout(()=>{install();hydrateAndRender({force:true});},500);},true);
  document.addEventListener('change',e=>{if(e.target?.id==='v369AdminDetailStaff')setTimeout(()=>hydrateAndRender({force:true}),80);},true);
  window.cnmiV589={version:VERSION,install,effectiveItem,explicitRate,ensureOutgoingTrades,hydrateAndRender};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v589-trade-chain-net-hours-rate-override.js failed",__cnmiPatchError); }
/* ===== END patch-v589-trade-chain-net-hours-rate-override.js ===== */

/* ===== BEGIN patch-v590-ot-rate-override-persistence.js ===== */
try {
/* CNMI Staff Planner V590 — Persist Admin OT rate override across attendance normalization
 *
 * Root cause fixed:
 * - Admin OT edit (V479/V191) stored [OT_RATE_TYPE=MT|CLERK] in note.
 * - Attendance correction (V221) rebuilds note for "ยืนยันอยู่เวรตามตาราง" rows and can
 *   overwrite that token before V589 calculates trade HR.
 * - Result: a row edited to MT could still use the original trade amount (e.g. 1,800 / 130 = 13.85)
 *   instead of the corrected MT holiday rate (15 x 160 / 130 = 18.46).
 *
 * V590 persists the selected Admin override in device as well as note. V221 preserves device
 * when it normalizes attendance rows, and V589 already reads the rate token from note + device.
 * No schema change / no SQL.
 */
(function(){
  'use strict';
  const VERSION='V590_OT_RATE_OVERRIDE_PERSISTENCE';
  if(window.__CNMI_V590_OT_RATE_OVERRIDE_PERSISTENCE__) return;
  window.__CNMI_V590_OT_RATE_OVERRIDE_PERSISTENCE__=true;

  const RATE_RE=/\[OT_RATE_TYPE=(MT|CLERK)\]/ig;
  const pending=new Map();
  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function cleanToken(v){ return String(v||'').replace(RATE_RE,'').replace(/\s*\|\s*\|\s*/g,' | ').replace(/^\s*\|\s*|\s*\|\s*$/g,'').trim(); }
  function stamp(v,rate){ const r=String(rate||'').toUpperCase()==='CLERK'?'CLERK':'MT'; const clean=cleanToken(v); return `[OT_RATE_TYPE=${r}]${clean?` | ${clean}`:''}`; }
  function formRate(form){ const el=form?.querySelector?.('[name="rate_type_v479"]'); return String(el?.value||'').toUpperCase()==='CLERK'?'CLERK':'MT'; }
  function formId(form){ return String(form?.querySelector?.('[name="id"]')?.value||'').trim(); }
  function stateRow(id){ return (S().otRequests||[]).find(r=>String(r?.id||'')===String(id||''))||null; }

  function stage(form){
    if(!form||form.id!=='otEditFormV191') return null;
    const id=formId(form); if(!id)return null;
    const rate=formRate(form);
    const note=form.querySelector('textarea[name="note"]');
    if(note) note.value=stamp(note.value,rate);
    pending.set(id,{rate,at:Date.now()});
    return {id,rate};
  }

  async function persist(id,rate,attempt=0){
    const db=DB(); if(!db?.from||!id)return false;
    try{
      // Wait until V191 has completed its own update/load cycle, then persist the rate in
      // a field V221 never rebuilds (device). Fetch fresh DB state so we do not overwrite
      // the edit audit text written by V191.
      const sel=await db.from('ot_requests').select('id,device,note').eq('id',id).maybeSingle();
      if(sel?.error) throw sel.error;
      const row=sel?.data||{};
      const device=stamp(row.device,rate).slice(0,250);
      const note=stamp(row.note,rate).slice(0,900);
      const upd=await db.from('ot_requests').update({device,note}).eq('id',id).select('id,device,note').maybeSingle();
      if(upd?.error) throw upd.error;
      const local=stateRow(id);
      if(local){ local.device=device; local.note=note; }
      pending.delete(id);
      // Reload once so Admin detail/approval/monthly summary all read the same persisted row.
      try{
        if(typeof loadAllData==='function') await loadAllData();
        if(String(location.hash||'').startsWith('#/ot')&&typeof renderPage==='function') renderPage();
      }catch(_){
        try{ window.cnmiV589?.hydrateAndRender?.({force:true}); }catch(__){}
      }
      return true;
    }catch(err){
      if(attempt<2){ setTimeout(()=>persist(id,rate,attempt+1),700*(attempt+1)); return false; }
      console.warn(`[${VERSION}] persist rate override failed`,err);
      return false;
    }
  }

  // Capture before V191's document-level click handler stops propagation.
  window.addEventListener('click',e=>{
    const btn=e.target?.closest?.('[data-save-ot-edit-v191]');
    if(!btn)return;
    const staged=stage(btn.closest('#otEditFormV191'));
    if(staged) setTimeout(()=>persist(staged.id,staged.rate,0),950);
  },true);
  window.addEventListener('submit',e=>{
    if(e.target?.id!=='otEditFormV191')return;
    const staged=stage(e.target);
    if(staged) setTimeout(()=>persist(staged.id,staged.rate,0),950);
  },true);

  // Preserve a saved token when callers use the public corrected-row helper. This fixes
  // display normalization immediately where that public API is used. The DB persistence
  // above is the authoritative safeguard for V221's internal/lexical normalizer.
  function wrapCorrected(){
    const api=window.cnmiV221DutyOt;
    if(!api||typeof api.correctedOtRow!=='function'||api.correctedOtRow.__v590Wrapped)return false;
    const prev=api.correctedOtRow;
    const wrapped=function(row){
      const out=prev.call(this,row)||row;
      const token=String(`${row?.device||''} ${row?.note||''}`).match(/\[OT_RATE_TYPE=(MT|CLERK)\]/i);
      if(token&&out){
        const rate=String(token[1]).toUpperCase();
        out.device=stamp(out.device||row?.device,rate).slice(0,250);
        out.note=stamp(out.note,rate).slice(0,900);
      }
      return out;
    };
    wrapped.__v590Wrapped=true; wrapped.__v590Previous=prev; api.correctedOtRow=wrapped; return true;
  }

  // If the just-saved row is normalized before the DB follow-up finishes, use the staged
  // override for this short window so the UI does not flash the old trade amount.
  function wrapNormalization(){
    const api=window.v190HrRateNormalization;
    if(!api||typeof api.otNormalizationBreakdown190!=='function'||api.otNormalizationBreakdown190.__v590Wrapped)return false;
    const prev=api.otNormalizationBreakdown190;
    const wrapped=function(row){
      const id=String(row?.id||''); const p=pending.get(id);
      if(!p)return prev.call(this,row);
      const clone={...row,device:stamp(row?.device,p.rate),note:stamp(row?.note,p.rate)};
      return prev.call(this,clone);
    };
    wrapped.__v590Wrapped=true; wrapped.__v590Previous=prev; api.otNormalizationBreakdown190=wrapped; return true;
  }

  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(x&&/^v\d+/i.test(String(x.textContent||'').trim())){x.textContent='v590';x.title='OT rate override persistence';}
    });
  }
  let tries=0; const timer=setInterval(()=>{
    tries++; const a=wrapCorrected(),b=wrapNormalization();
    if((a&&b)||tries>100){clearInterval(timer);setTimeout(markVersion,120);}
  },60);
  window.addEventListener('pageshow',()=>setTimeout(()=>{wrapCorrected();wrapNormalization();markVersion();},120));
  window.addEventListener('hashchange',()=>setTimeout(()=>{wrapCorrected();wrapNormalization();markVersion();},100));
  window.cnmiV590={version:VERSION,stage,persist,wrapCorrected,wrapNormalization};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v590-ot-rate-override-persistence.js failed",__cnmiPatchError); }
/* ===== END patch-v590-ot-rate-override-persistence.js ===== */

/* ===== BEGIN patch-v591-ot-rate-core-persistence.js ===== */
try {
/* CNMI Staff Planner V591 — OT rate override core persistence
 * Core fix lives in app-v545 V191 save + bundled V221 correctedOtRow.
 * This patch only exposes a tiny verifier and version marker.
 */
(function(){
  'use strict';
  const VERSION='V591_OT_RATE_CORE_PERSISTENCE';
  if(window.__CNMI_V591_OT_RATE_CORE_PERSISTENCE__) return;
  window.__CNMI_V591_OT_RATE_CORE_PERSISTENCE__=true;
  function rateToken(row){
    const m=String(`${row?.note||''} ${row?.device||''}`).match(/\[OT_RATE_TYPE=(MT|CLERK)\]/i);
    return m?String(m[1]).toUpperCase():'';
  }
  function mark(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(x&&/^v\d+/i.test(String(x.textContent||'').trim())){x.textContent='v591';x.title='OT rate override core persistence';}
    });
  }
  setTimeout(mark,120);
  window.addEventListener('pageshow',()=>setTimeout(mark,120));
  window.addEventListener('hashchange',()=>setTimeout(mark,100));
  window.cnmiV591={version:VERSION,rateToken};
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v591-ot-rate-core-persistence.js failed",__cnmiPatchError); }
/* ===== END patch-v591-ot-rate-core-persistence.js ===== */

/* ===== BEGIN patch-v592-flat-admin-extra-menu.js ===== */
try {
/* CNMI Staff Planner V592 — Flat Admin Extra OT Menu
 * Replaces the nested Admin "ขอ OT เพิ่มแทนเจ้าหน้าที่" branch with 3 direct menu items:
 *  1) ขอ OT เพิ่มแทนเจ้าหน้าที่ตามจริง
 *  2) แก้ไข OT ตกเบิก / ลดเบิกเกิน
 *  3) ขอ OT สำหรับประชุม / กิจกรรมร่วม
 * Navigation/UI only. Existing V527/V528/V573 OT logic remains unchanged.
 */
(function(){
  'use strict';
  if(window.__CNMI_V592_FLAT_ADMIN_EXTRA_MENU__) return;
  window.__CNMI_V592_FLAT_ADMIN_EXTRA_MENU__=true;
  const VERSION='V592_FLAT_ADMIN_EXTRA_MENU';
  let queued=false;

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function mode(){
    const s=S();
    const raw=String(s.v527ExtraMode||'');
    if(['work','adjustment','activity'].includes(raw)) return raw;
    try{
      const q=new URLSearchParams(String(location.hash||'').split('?')[1]||'');
      const m=String(q.get('mode')||'');
      if(['work','adjustment','activity'].includes(m)) return m;
      const saved=String(sessionStorage.getItem('cnmi-v528-admin-extra-mode')||'');
      return ['work','adjustment','activity'].includes(saved)?saved:'work';
    }catch(_){return 'work';}
  }
  function svg(kind){
    const a='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      work:`<svg ${a}><path d="M12 3v18M3 12h18"></path></svg>`,
      adjustment:`<svg ${a}><path d="M4 7h16M7 4v6M4 17h16M17 14v6"></path></svg>`,
      activity:`<svg ${a}><path d="M4 20v-2a4 4 0 0 1 4-4h3"></path><circle cx="9" cy="7" r="3"></circle><path d="M15 8h5M17.5 5.5v5"></path><path d="M15 16h5"></path></svg>`
    };
    return map[kind]||map.work;
  }
  const ITEMS=[
    ['work','ขอ OT เพิ่มแทนเจ้าหน้าที่ตามจริง'],
    ['adjustment','แก้ไข OT ตกเบิก / ลดเบิกเกิน'],
    ['activity','ขอ OT สำหรับประชุม / กิจกรรมร่วม']
  ];

  function makeButton(id,label){
    const b=document.createElement('button');
    b.type='button';
    b.className='v523-subitem v592-admin-extra-item';
    b.dataset.v528ExtraMode=id; // Keep V573's proven click/navigation handler.
    b.dataset.v592AdminExtra=id;
    b.innerHTML=`<span class="v523-branch-icon">${svg(id)}</span><span>${label}</span>`;
    return b;
  }

  function flatten(){
    if(!isAdminSafe()) return;
    const sub=document.querySelector('.v523-nav-tree .v523-nav-submenu');
    if(!sub) return;

    // V528 builds one nested branch. Replace that entire branch with 3 first-level buttons.
    const branch=sub.querySelector('[data-v528-extra-tree]');
    if(branch){
      const frag=document.createDocumentFragment();
      ITEMS.forEach(([id,label])=>frag.appendChild(makeButton(id,label)));
      branch.replaceWith(frag);
    } else if(!sub.querySelector('[data-v592-admin-extra]')){
      // Fallback for a fresh sidebar render before V528 has transformed admin-extra.
      const old=sub.querySelector('[data-v523-ot-item="admin-extra"]');
      if(old){
        const frag=document.createDocumentFragment();
        ITEMS.forEach(([id,label])=>frag.appendChild(makeButton(id,label)));
        old.replaceWith(frag);
      }
    }
    refreshActive();
  }

  function refreshActive(){
    const s=S();
    const active=s.page==='ot'&&String(s.otMenuV369||'')==='admin-extra';
    const current=mode();
    document.querySelectorAll('[data-v592-admin-extra]').forEach(btn=>{
      const yes=active&&String(btn.dataset.v592AdminExtra||'')===current;
      btn.classList.toggle('active',yes);
      btn.setAttribute('aria-current',yes?'page':'false');
    });
  }

  function versionChip(){
    try{
      document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{
        chip.textContent='v592';
        chip.title='Flat Admin Extra OT Menu (V592)';
      });
    }catch(_){}
  }

  function apply(){flatten();refreshActive();versionChip();}
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}

  function start(){
    apply();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(queue).observe(nav,{childList:true,subtree:true});
    window.addEventListener('hashchange',queue);
    window.addEventListener('pageshow',queue);
    document.addEventListener('click',function(e){
      if(e.target?.closest?.('[data-v592-admin-extra]')) setTimeout(queue,0);
    },true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  window.cnmiV592={version:VERSION,apply};
  console.info('['+VERSION+'] loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v592-flat-admin-extra-menu.js failed",__cnmiPatchError); }
/* ===== END patch-v592-flat-admin-extra-menu.js ===== */

/* ===== BEGIN patch-v593-admin-ot-zone-and-guard.js ===== */
try {
/* CNMI Staff Planner V593 — Admin OT Zone + Admin Mode Guard
 * - In effective Admin mode, moves the complete OT admin tree from Staff section to Admin section.
 * - Staff mode keeps the normal personal OT tree under Staff.
 * - Adds a persistent Admin mode banner with a one-click switch to Staff mode.
 * - Adds a blocking confirmation when an Admin OT form is about to create a record for the logged-in Admin themself.
 * - Repairs the 3 direct Admin-extra OT buttons independently of legacy nested-menu handlers.
 * UI/navigation safety only. No OT/HR calculation, approval, rate, export, or database logic changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V593_ADMIN_OT_ZONE_GUARD__) return;
  window.__CNMI_V593_ADMIN_OT_ZONE_GUARD__=true;
  const VERSION='V593_ADMIN_OT_ZONE_GUARD';
  const VALID_EXTRA=new Set(['work','adjustment','activity']);
  let queued=false;
  let guardForm=null;

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function actualAdmin(){
    try{if(typeof window.isActualAdminV167==='function')return !!window.isActualAdminV167();}catch(_){ }
    return String(S()?.profile?.role||'').toLowerCase()==='admin';
  }
  function adminMode(){try{return actualAdmin()&&typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function currentStaff(){
    try{if(typeof currentStaffId==='function')return String(currentStaffId()||'');}catch(_){ }
    const s=S();return String(s?.profile?.id||s?.profile?.staff_id||s?.session?.user?.id||'');
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function month(){
    const s=S();
    const v=String(s.otMenuMonthV369||s.otSourceMonthV241||s.otMoneyMonthV241||s.myDutyMonthFilter||'').slice(0,7);
    return /^\d{4}-\d{2}$/.test(v)?v:'';
  }

  function adminSection(){
    return [...document.querySelectorAll('#mainNav .nav-section')].find(sec=>/เมนู\s*Admin/i.test(String(sec.querySelector('.nav-section-title span')?.textContent||'')))||null;
  }
  function staffSection(){
    return [...document.querySelectorAll('#mainNav .nav-section')].find(sec=>/เมนู\s*Staff/i.test(String(sec.querySelector('.nav-section-title span')?.textContent||'')))||null;
  }

  function moveOtTree(){
    const tree=document.querySelector('#mainNav .v523-nav-tree');
    if(!tree)return;
    const parent=tree.querySelector('.v523-nav-parent');
    const label=parent?.querySelector('.v523-parent-label');
    if(adminMode()){
      const sec=adminSection();if(!sec)return;
      const title=sec.querySelector('.nav-section-title');
      if(tree.parentElement!==sec){ title?.insertAdjacentElement('afterend',tree); }
      if(label)label.textContent='จัดการ OT เจ้าหน้าที่';
      tree.classList.add('v593-admin-ot-tree');
      tree.classList.remove('v593-staff-ot-tree');
      parent?.setAttribute('title','งาน OT สำหรับ Admin: บันทึกแทน ตรวจสอบ อนุมัติ และ Export');
    }else{
      const sec=staffSection();if(!sec)return;
      const audit=[...sec.querySelectorAll('.nav-btn[data-page]')].find(b=>String(b.dataset.page)==='audit');
      if(tree.parentElement!==sec){
        if(audit) audit.insertAdjacentElement('beforebegin',tree); else sec.appendChild(tree);
      }
      if(label)label.textContent='ลงชื่ออยู่เวร / ขอ OT เพิ่ม';
      tree.classList.add('v593-staff-ot-tree');
      tree.classList.remove('v593-admin-ot-tree');
      parent?.setAttribute('title','OT ของฉัน');
    }
  }

  function ensureBanner(){
    const panel=document.querySelector('.main-panel');
    const topbar=document.querySelector('.main-panel .topbar');
    if(!panel||!topbar)return;
    let bar=document.getElementById('v593AdminModeBanner');
    if(!actualAdmin()){
      bar?.remove();document.documentElement.classList.remove('v593-admin-active');return;
    }
    if(!bar){
      bar=document.createElement('div');bar.id='v593AdminModeBanner';bar.className='v593-admin-mode-banner';
      bar.innerHTML=`<div class="v593-admin-mode-copy"><strong>🛡 Admin mode</strong><span>กำลังใช้งานสิทธิ์ผู้ดูแลระบบ • เมนู OT ในส่วน Admin เป็นการทำรายการแทนเจ้าหน้าที่</span></div><button type="button" class="v593-switch-staff" data-v593-switch-staff>สลับเป็น Staff mode</button>`;
      topbar.insertAdjacentElement('afterend',bar);
    }
    const on=adminMode();
    bar.hidden=!on;
    document.documentElement.classList.toggle('v593-admin-active',on);
  }

  function extraGo(mode){
    if(!adminMode()||!VALID_EXTRA.has(mode))return false;
    const s=S();
    s.page='ot';s.otMenuV369='admin-extra';s.otGroupV522='ot';s.v527ExtraMode=mode;
    try{
      sessionStorage.setItem('cnmi-v528-admin-extra-mode',mode);
      sessionStorage.setItem('cnmi-v528-admin-extra-open','1');
      sessionStorage.setItem('cnmi-v523-ot-open','1');
      sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');
    }catch(_){ }
    const qs=new URLSearchParams();qs.set('section','request-extra');const m=month();if(m)qs.set('month',m);qs.set('mode',mode);
    const target='#/ot?'+qs.toString();
    try{history.pushState({cnmiV593:true},'',target);}catch(_){location.hash=target;}
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){ }
    try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:'ot'}}));}catch(_){ }
    const sidebar=document.getElementById('sidebar');
    if(sidebar&&window.matchMedia('(max-width:820px)').matches){sidebar.classList.remove('open');document.body.classList.remove('sidebar-open');}
    setTimeout(apply,0);
    return true;
  }

  function selectedStaffForForm(form){
    if(!form)return'';
    const el=form.querySelector('select[name="staff_id"],input[name="staff_id"]');
    return String(el?.value||'');
  }
  function staffNameById(id){
    const s=S();const row=(s.staff||s.staffs||s.staffList||[]).find(x=>String(x.id||x.staff_id||'')===String(id));
    return String(row?.nickname||row?.display_name||row?.full_name||row?.name||s?.profile?.nickname||s?.profile?.full_name||'คุณ');
  }
  function isGuardedAdminOtForm(form){
    if(!adminMode()||!form||String(S().page||'')!=='ot')return false;
    if(!form.querySelector('[name="staff_id"]'))return false;
    return !!form.closest('.v369-ot-page,.v234-ot-page,.ot-page,#pageContent') && (
      form.id==='attendanceAdminFormV180' ||
      form.matches('[data-admin-simple="1"]') ||
      /^v527/i.test(form.id||'') ||
      !!form.closest('.v234-admin-card,.v527-admin-extra,.v527-mode-content')
    );
  }
  function showSelfGuard(form){
    guardForm=form;
    const who=staffNameById(currentStaff());
    const html=`<div class="v593-guard-dialog"><div class="v593-guard-icon">🛡</div><h2>กำลังทำรายการใน Admin mode</h2><p>รายการนี้เลือกชื่อ <b>${esc(who)}</b> ซึ่งเป็นบัญชีที่กำลังใช้งานอยู่</p><div class="v593-guard-note">ถ้าตั้งใจลงชื่ออยู่เวร/ขอ OT ของตัวเอง แนะนำให้สลับเป็น <b>Staff mode</b> ก่อน เพื่อไม่ให้สับสนว่าเป็นรายการที่ Admin บันทึกแทน</div><div class="confirm-actions v593-guard-actions"><button type="button" class="ghost-btn" data-v593-switch-staff>สลับเป็น Staff mode</button><button type="button" class="primary-btn" data-v593-self-continue>ยืนยัน ทำต่อใน Admin mode</button></div></div>`;
    try{if(typeof showModal==='function')showModal(html,{small:true});else window.showModal?.(html,{small:true});}catch(_){ }
  }
  async function switchStaff(){
    guardForm=null;
    try{if(typeof hideModal==='function')hideModal();else document.getElementById('modal')?.classList.add('hidden');}catch(_){ }
    try{
      if(typeof window.setViewAsModeV167==='function'){await window.setViewAsModeV167('staff');return;}
      if(typeof window.setViewAsMode==='function'){await window.setViewAsMode('staff');return;}
    }catch(_){ }
  }

  function versionChip(){
    try{document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{chip.textContent='v593';chip.title='Admin OT Zone + Admin Mode Guard (V593)';});}catch(_){ }
  }
  function apply(){moveOtTree();ensureBanner();versionChip();}
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}

  // Repair the three direct V592 Admin-extra items at WINDOW capture phase.
  window.addEventListener('click',function(e){
    const btn=e.target?.closest?.('[data-v592-admin-extra],[data-v528-extra-mode]');
    if(!btn)return;
    const mode=String(btn.dataset.v592AdminExtra||btn.dataset.v528ExtraMode||'');
    if(!VALID_EXTRA.has(mode)||!adminMode())return;
    e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
    extraGo(mode);
  },true);

  // Explicit Staff-mode switch in the persistent banner and safety dialog.
  window.addEventListener('click',function(e){
    const sw=e.target?.closest?.('[data-v593-switch-staff]');if(!sw)return;
    e.preventDefault();e.stopPropagation();void switchStaff();
  },true);

  // If Admin is about to submit an OT record for themself, stop and ask explicitly.
  window.addEventListener('submit',function(e){
    const form=e.target;if(!(form instanceof HTMLFormElement))return;
    if(form.dataset.v593GuardPass==='1'){delete form.dataset.v593GuardPass;return;}
    if(!isGuardedAdminOtForm(form))return;
    const selected=selectedStaffForForm(form),me=currentStaff();
    if(!selected||!me||selected!==me)return;
    e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
    showSelfGuard(form);
  },true);

  document.addEventListener('click',function(e){
    const go=e.target?.closest?.('[data-v593-self-continue]');if(!go)return;
    e.preventDefault();e.stopPropagation();
    const form=guardForm;guardForm=null;
    try{if(typeof hideModal==='function')hideModal();else document.getElementById('modal')?.classList.add('hidden');}catch(_){ }
    if(form&&document.body.contains(form)){
      form.dataset.v593GuardPass='1';
      if(typeof form.requestSubmit==='function')form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    }
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v593-admin-ot-zone-style';
  style.textContent=`
    .v593-admin-mode-banner{position:sticky;top:0;z-index:35;margin:0 14px 8px;padding:10px 12px;border:2px solid #f1a4b6;border-radius:14px;background:#fff4f7;box-shadow:0 4px 14px rgba(120,42,66,.10);display:flex;align-items:center;justify-content:space-between;gap:12px}
    .v593-admin-mode-banner[hidden]{display:none!important}.v593-admin-mode-copy{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap}.v593-admin-mode-copy strong{color:#a51d47;font-size:.96rem}.v593-admin-mode-copy span{color:#6c3142;font-size:.82rem}
    .v593-switch-staff{border:1px solid #7fc6a8;background:#effcf6;color:#176744;border-radius:999px;padding:8px 12px;font-weight:700;white-space:nowrap;cursor:pointer}
    #mainNav .v593-admin-ot-tree{margin:4px 0 8px;padding:3px 0 8px;border-bottom:1px dashed #d9e6ef}
    #mainNav .v593-admin-ot-tree>.v523-nav-parent{background:#fff7fa;border:1px solid #f0ced8}
    #mainNav .v593-admin-ot-tree>.v523-nav-parent .v523-parent-label{color:#733044;font-weight:700}
    .v593-guard-dialog{text-align:center}.v593-guard-icon{font-size:2rem;margin-bottom:4px}.v593-guard-dialog h2{margin:4px 0 10px;color:#7b2942}.v593-guard-dialog p{margin:0 0 10px}.v593-guard-note{text-align:left;background:#fff4f7;border:1px solid #f1ccd7;border-radius:12px;padding:10px 12px;color:#633443;line-height:1.55}.v593-guard-actions{margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    @media(max-width:820px){.v593-admin-mode-banner{margin:0 8px 8px;padding:9px 10px;align-items:flex-start}.v593-admin-mode-copy{display:block}.v593-admin-mode-copy strong,.v593-admin-mode-copy span{display:block}.v593-admin-mode-copy span{margin-top:2px}.v593-switch-staff{padding:7px 9px;font-size:.78rem}.v593-guard-actions>*{width:100%}}
  `;
  document.head.appendChild(style);

  function start(){
    apply();
    const nav=document.getElementById('mainNav');if(nav)new MutationObserver(queue).observe(nav,{childList:true,subtree:true});
    const mini=document.getElementById('userMini');if(mini)new MutationObserver(queue).observe(mini,{childList:true,subtree:true,characterData:true});
    window.addEventListener('hashchange',queue);window.addEventListener('pageshow',queue);
    document.addEventListener('click',e=>{if(e.target?.closest?.('[data-view-as-mode]'))setTimeout(queue,50);},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV593={version:VERSION,apply,extraGo};
  console.info('['+VERSION+'] loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v593-admin-ot-zone-and-guard.js failed",__cnmiPatchError); }
/* ===== END patch-v593-admin-ot-zone-and-guard.js ===== */

/* ===== BEGIN patch-v600-stable-post593-oncall.js ===== */
try {
/* CNMI Staff Planner V600 — Stable post-V593 physician on-call fix
 * Base: V593 (known stable login/startup)
 * Scope:
 *   - Do NOT touch auth, startup, service worker, quota numbers, OT, HR, or database.
 *   - Physician normal leave affects regular daytime Consult only.
 *   - Physician on-call 16:00–08:00 and weekend/public-holiday 24h remain active.
 *   - Real overlapping physician activities still make on-call unavailable.
 */
(() => {
  'use strict';
  const VERSION = 'V600_STABLE_POST593_ONCALL';
  if (window.__CNMI_V600_STABLE_POST593_ONCALL__) return;
  window.__CNMI_V600_STABLE_POST593_ONCALL__ = true;

  const text = (v) => String(v ?? '').trim();
  const esc = (v) => {
    try { return typeof escapeHtml === 'function' ? escapeHtml(text(v)) : text(v); }
    catch (_) { return text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const stateSafe = () => {
    try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; }
    catch (_) { return window.state || {}; }
  };
  const normDate = (v) => {
    const s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };
  const selectedDate = () => {
    try {
      return normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(stateSafe()?.dashboardDateV443)
        || normDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    }
  };
  const staffById = (id) => (stateSafe()?.staff || []).find(p => String(p?.id || '') === String(id || '')) || null;
  const nick = (id) => {
    const p = staffById(id);
    return text(p?.nickname || p?.full_name || p?.email || 'แพทย์');
  };

  function modelFor(date) {
    try { return window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { return null; }
  }
  function isOnCallTime(time) {
    const t = text(time);
    return /16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน|ทั้งวัน|นอกเวลา|กลางคืน/i.test(t);
  }
  function activities(id, date, time) {
    try { return window.cnmiPhysicianActivityV512?.physicianActivities?.(id, date, time) || []; }
    catch (_) { return []; }
  }
  function activityLabel(a) {
    const type = text(a?.event_type) || 'กิจกรรม';
    const s = text(a?.start_time).slice(0, 5);
    const e = text(a?.end_time).slice(0, 5);
    const period = s && e ? `${s}–${e}` : (s ? `ตั้งแต่ ${s}` : 'ทั้งวัน');
    return type === 'อื่นๆ' ? `ติดกิจกรรม ${period}` : `${type} ${period}`;
  }
  function doctorHtml(id, site, time, mobile) {
    if (!id) return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn${mobile ? ' v456-mobile-doctor-button' : ''}" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" aria-label="ดูเบอร์โทร ${esc(nick(id))}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(nick(id))}</button>`;
  }
  function activityHtml(id, a) {
    return `<span class="v512-consult-activity" data-v512-physician-activity="1" title="${esc(text(a?.title) || 'แพทย์มีกิจกรรมทับช่วง Consult')}">${esc(nick(id))} · ${esc(activityLabel(a))}</span>`;
  }
  function rowTime(row) {
    if (!row) return '';
    const mobile = row.querySelector?.('.v456-mobile-consult-time');
    if (mobile) return text(mobile.textContent);
    const first = row.querySelector?.('td');
    return text(first?.textContent);
  }
  function replacementNode(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '').trim();
    return tpl.content.firstElementChild || null;
  }

  function onCallAssignment(date) {
    const m = modelFor(date);
    if (!m) return null;
    if (m.weekday) return { id: m.combined || null, site: 'Donor & BB', time: '16:00–08:00' };
    return { id: m.combined || null, site: 'Donor & BB', time: '24 ชม.' };
  }

  function restoreOnCall(root, date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    const oncall = onCallAssignment(date);
    if (!card || !oncall) return;

    const acts = oncall.id ? activities(oncall.id, date, oncall.time) : [];
    card.querySelectorAll('tr,.v456-mobile-consult-row').forEach(row => {
      if (!isOnCallTime(rowTime(row))) return;
      row.querySelectorAll('.v510-consult-leave').forEach(badge => {
        const mobile = !!row.classList?.contains('v456-mobile-consult-row');
        const html = acts.length ? activityHtml(oncall.id, acts[0]) : doctorHtml(oncall.id, oncall.site, oncall.time, mobile);
        const node = replacementNode(html);
        if (node) badge.replaceWith(node);
      });
    });
  }

  function consultAssignments(date) {
    const m = modelFor(date);
    if (!m) return [];
    if (m.weekday) return [
      { id: m.donor || null, time: '08:00–16:00', oncall: false },
      { id: m.bb || null, time: '08:00–16:00', oncall: false },
      { id: m.combined || null, time: '16:00–08:00', oncall: true }
    ];
    return [{ id: m.combined || null, time: '24 ชม.', oncall: true }];
  }

  function recomputeReady(root, date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return;
    const list = consultAssignments(date);
    if (!list.length) return;

    let hasLeave = false;
    let hasActivity = false;
    let ready = 0;
    list.forEach(a => {
      if (!a.id) return;
      const acts = activities(a.id, date, a.time);
      if (acts.length) { hasActivity = true; return; }
      if (!a.oncall) {
        let leave = null;
        try { leave = window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(a.id, date, a.time) || null; }
        catch (_) { leave = null; }
        if (leave) { hasLeave = true; return; }
      }
      ready += 1;
    });

    const badge = card.querySelector('.v452-ready');
    if (badge) {
      badge.textContent = `พร้อม ${ready}/${list.length}`;
      badge.classList.toggle('is-complete', ready === list.length);
      badge.classList.toggle('v510-has-leave', hasLeave);
      badge.classList.toggle('v512-has-activity', hasActivity);
    }
  }

  // Consumers added after V510/V512 use this shared API. Make the rule explicit there too.
  try {
    const api = window.cnmiPhysicianDashboardV510;
    if (api?.leaveStatusForTime && !api.__v600OnCallWrapped) {
      const original = api.leaveStatusForTime.bind(api);
      api.leaveStatusForTime = function(id, date, time) {
        if (isOnCallTime(time)) return null;
        return original(id, date, time);
      };
      api.__v600OnCallWrapped = true;
    }
  } catch (err) {
    console.warn(`[${VERSION}] leave API patch skipped`, err);
  }

  function decorate(html) {
    if (typeof html !== 'string' || !html) return html;
    try {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      const date = selectedDate();
      restoreOnCall(tpl.content, date);
      recomputeReady(tpl.content, date);
      const holder = document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] dashboard decorate skipped`, err);
      return html;
    }
  }

  const previousDashboard = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof previousDashboard === 'function' && !previousDashboard.__v600OnCallWrapped) {
    const wrapped = function renderDashboardV600() {
      return decorate(previousDashboard.apply(this, arguments));
    };
    wrapped.__v600OnCallWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }

  window.cnmiV600 = { version: VERSION, isOnCallTime, onCallAssignment, decorate };
  console.info(`[${VERSION}] loaded — V593 startup/auth preserved`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v600-stable-post593-oncall.js failed",__cnmiPatchError); }
/* ===== END patch-v600-stable-post593-oncall.js ===== */

/* ===== BEGIN patch-v601-physician-oncall-contact-restore.js ===== */
try {
/* CNMI Staff Planner V601 — Physician on-call contact restore
 * Base: V600 stable rebuild from V593
 * Scope only:
 *   - Normal physician leave affects daytime Consult only.
 *   - On-call (16:00–08:00 / 24h weekend-holiday) ignores normal leave.
 *   - The assigned on-call physician is restored as a tappable/clickable contact button.
 *   - Real overlapping blocking activities still make that Consult slot unavailable.
 * No auth/startup/PWA/quota/OT/HR/database changes.
 */
(() => {
  'use strict';
  const VERSION = 'V601_PHYSICIAN_ONCALL_CONTACT_RESTORE';
  if (window.__CNMI_V601_PHYSICIAN_ONCALL_CONTACT_RESTORE__) return;
  window.__CNMI_V601_PHYSICIAN_ONCALL_CONTACT_RESTORE__ = true;

  const txt = (v) => String(v ?? '').trim();
  const esc = (v) => txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S = () => { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } };
  const normDate = (v) => { const s = txt(v).slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  const selectedDate = () => {
    try {
      return normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(S()?.dashboardDateV443)
        || normDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) {
      const d = new Date(), p = n => String(n).padStart(2,'0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    }
  };
  const person = (id) => (S()?.staff || []).find(p => String(p?.id || '') === String(id || '')) || null;
  const shortName = (id) => { const p = person(id); return txt(p?.nickname || p?.full_name || p?.email || 'แพทย์'); };

  function modelFor(date) {
    try { return window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { return null; }
  }
  function onCallAssignment(date) {
    const m = modelFor(date);
    if (!m) return null;
    return m.weekday
      ? { id: m.combined || null, site: 'Donor & BB', time: '16:00–08:00' }
      : { id: m.combined || null, site: 'Donor & BB', time: '24 ชม.' };
  }
  function isOnCallTime(v) {
    const s = txt(v);
    return /16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน|ทั้งวัน|นอกเวลา|กลางคืน/i.test(s);
  }
  function blockingActivities(id,date,time) {
    try { return window.cnmiPhysicianActivityV512?.physicianActivities?.(id,date,time) || []; }
    catch (_) { return []; }
  }
  function buttonHtml(a, mobile=false) {
    if (!a?.id) return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn${mobile?' v456-mobile-doctor-button':''}" data-v601-oncall-contact="1" data-v601-doctor-id="${esc(a.id)}" data-v601-site="${esc(a.site)}" data-v601-time="${esc(a.time)}" aria-label="ดูเบอร์โทร ${esc(shortName(a.id))}" title="แตะเพื่อดูเบอร์โทรแพทย์ On-call">${esc(shortName(a.id))}</button>`;
  }
  function activityHtml(a, activity) {
    const label = (() => {
      try {
        const type = txt(activity?.event_type) || 'กิจกรรม';
        const st = txt(activity?.start_time).slice(0,5), en = txt(activity?.end_time).slice(0,5);
        const period = st && en ? `${st}–${en}` : (st ? `ตั้งแต่ ${st}` : 'ทั้งวัน');
        return type === 'อื่นๆ' ? `ติดกิจกรรม ${period}` : `${type} ${period}`;
      } catch (_) { return 'ติดกิจกรรม'; }
    })();
    return `<span class="v512-consult-activity" data-v512-physician-activity="1" title="แพทย์มีกิจกรรมทับช่วง On-call">${esc(shortName(a.id))} · ${esc(label)}</span>`;
  }

  function replaceDesktop(card,a,blocked) {
    const rows = [...card.querySelectorAll('.v452-dashboard-table tbody tr')];
    rows.forEach(row => {
      const cells = [...row.children];
      if (cells.length < 3) return;
      const time = txt(cells[0]?.textContent);
      if (!isOnCallTime(time)) return;
      // Authoritative rule: the on-call assignment is independent of normal daytime leave.
      cells[2].innerHTML = blocked ? activityHtml(a, blocked) : buttonHtml(a, false);
    });
  }
  function replaceMobile(card,a,blocked) {
    card.querySelectorAll('.v456-mobile-consult-row').forEach(row => {
      const time = txt(row.querySelector('.v456-mobile-consult-time')?.textContent);
      if (!isOnCallTime(time)) return;
      const holder = row.querySelector('.v456-mobile-consult-doctor');
      if (!holder) return;
      const label = holder.querySelector('.v456-mobile-doctor-label')?.cloneNode(true);
      holder.innerHTML = '';
      if (label) holder.appendChild(label);
      const tpl = document.createElement('template');
      tpl.innerHTML = blocked ? activityHtml(a, blocked) : buttonHtml(a, true);
      if (tpl.content.firstElementChild) holder.appendChild(tpl.content.firstElementChild);
    });
  }
  function restoreOnCallContact(root,date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    const a = onCallAssignment(date);
    if (!card || !a) return;
    const acts = a.id ? blockingActivities(a.id,date,a.time) : [];
    const blocked = acts[0] || null;
    replaceDesktop(card,a,blocked);
    replaceMobile(card,a,blocked);

    // Keep readiness aligned with the visible rule: leave never removes on-call readiness.
    try {
      const m = modelFor(date);
      const assignments = !m ? [] : (m.weekday
        ? [
            {id:m.donor,time:'08:00–16:00',oncall:false},
            {id:m.bb,time:'08:00–16:00',oncall:false},
            {id:m.combined,time:'16:00–08:00',oncall:true}
          ]
        : [{id:m.combined,time:'24 ชม.',oncall:true}]);
      let ready = 0, hasLeave = false, hasActivity = false;
      assignments.forEach(x => {
        if (!x.id) return;
        const actsX = blockingActivities(x.id,date,x.time);
        if (actsX.length) { hasActivity = true; return; }
        if (!x.oncall) {
          let leave = null;
          try { leave = window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(x.id,date,x.time) || null; } catch (_) {}
          if (leave) { hasLeave = true; return; }
        }
        ready += 1;
      });
      const badge = card.querySelector('.v452-ready');
      if (badge && assignments.length) {
        badge.textContent = `พร้อม ${ready}/${assignments.length}`;
        badge.classList.toggle('is-complete', ready === assignments.length);
        badge.classList.toggle('v510-has-leave', hasLeave);
        badge.classList.toggle('v512-has-activity', hasActivity);
      }
    } catch (_) {}
  }

  function decorate(html) {
    if (typeof html !== 'string' || !html || !html.includes('data-v452-physician-card')) return html;
    try {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      restoreOnCallContact(tpl.content, selectedDate());
      const holder = document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] decorate skipped`, err);
      return html;
    }
  }

  const previousDashboard = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof previousDashboard === 'function' && !previousDashboard.__v601Wrapped) {
    const wrapped = function renderDashboardV601() { return decorate(previousDashboard.apply(this, arguments)); };
    wrapped.__v601Wrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; } catch (_) { window.renderDashboard = wrapped; }
  }

  // Dedicated click path for the restored on-call button. It deliberately does not depend
  // on the old leave badge DOM and therefore remains tappable after the V510/V512 decorators.
  document.addEventListener('click', (e) => {
    const b = e.target?.closest?.('[data-v601-oncall-contact]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const id = b.getAttribute('data-v601-doctor-id') || '';
    const site = b.getAttribute('data-v601-site') || 'Donor & BB';
    const time = b.getAttribute('data-v601-time') || '';
    try {
      if (window.cnmiPhysicianPhoneV455?.openDoctor) {
        window.cnmiPhysicianPhoneV455.openDoctor(id,site,time);
        return;
      }
    } catch (_) {}
    const p = person(id), raw = txt(p?.phone || p?.contact_phone);
    if (!raw) {
      try { if (typeof toast === 'function') toast('ยังไม่มีเบอร์โทรแพทย์ในข้อมูลผู้ใช้งาน'); } catch (_) {}
      return;
    }
    const digits = raw.replace(/[^\d+]/g,'');
    const html = `<div style="text-align:center"><h3>${esc(shortName(id))}</h3><p>${esc(raw)}</p><a class="primary-btn" href="tel:${esc(digits)}">☎ โทรออก</a></div>`;
    try { if (typeof showModal === 'function') showModal(html,{small:true}); }
    catch (_) { window.location.href = `tel:${digits}`; }
  }, true);

  window.cnmiV601 = {version:VERSION,restoreOnCallContact,onCallAssignment,isOnCallTime};
  console.info(`[${VERSION}] loaded — on-call leave independence + contact restored`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v601-physician-oncall-contact-restore.js failed",__cnmiPatchError); }
/* ===== END patch-v601-physician-oncall-contact-restore.js ===== */

/* ===== BEGIN patch-v602-hr-export-diagnostic-fallback.js ===== */
try {
/* CNMI Staff Planner V602 — HR Export Diagnostic + Snapshot-safe fallback
 * Base: V601
 * Scope:
 *   - Keep V532 per-person preflight guard intact.
 *   - Show a centered, readable error dialog when Export is blocked.
 *   - Snapshot-table/configuration failures no longer make the Excel button appear dead:
 *     if preflight itself passes, Excel may continue while a local fallback audit record is kept.
 *   - Never bypass a real Staff_Total / HR_OT / copy mismatch.
 */
(() => {
  'use strict';
  const VERSION = 'V602_HR_EXPORT_DIAGNOSTIC_FALLBACK';
  if (window.__CNMI_V602_HR_EXPORT_DIAGNOSTIC_FALLBACK__) return;
  window.__CNMI_V602_HR_EXPORT_DIAGNOSTIC_FALLBACK__ = true;

  const text = v => String(v ?? '').trim();
  const esc = v => text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = () => window.cnmiV532ExportGuard || null;
  const fallbackKey = batchId => `cnmi-v602-export-fallback:${text(batchId) || 'unknown'}`;

  function centeredDialog(title, message, tone='error') {
    const lines = text(message).split(/\n+/).map(s => s.replace(/^\s*[•-]\s*/, '').trim()).filter(Boolean);
    const list = lines.length > 1
      ? `<ul class="v602-export-list">${lines.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
      : `<p class="v602-export-message">${esc(lines[0] || message)}</p>`;
    const html = `<div class="v602-export-dialog ${tone === 'warn' ? 'is-warn' : 'is-error'}">
      <div class="v602-export-icon">${tone === 'warn' ? '!' : '×'}</div>
      <h3>${esc(title)}</h3>
      ${list}
      <p class="v602-export-help">${tone === 'warn'
        ? 'ไฟล์ Excel จะยังสร้างได้ เพราะการตรวจยอดผ่านแล้ว แต่ Snapshot บน Supabase ยังบันทึกไม่ได้ กรุณาให้ Admin ติดตั้ง/ตรวจ SQL V532 ภายหลัง'
        : 'ระบบยังไม่ Export เพื่อป้องกันยอด HR ผิด กรุณาแก้รายการที่แจ้ง แล้วกด Export ใหม่'}</p>
    </div>`;
    try {
      if (typeof showModal === 'function') { showModal(html); return; }
    } catch (_) {}
    const modal = document.getElementById('modal'), body = document.getElementById('modalBody');
    if (modal && body) {
      body.innerHTML = html;
      modal.classList.remove('hidden');
      return;
    }
    window.alert(`${title}\n\n${text(message)}`);
  }

  function snapshotProblem(err) {
    const s = text(err?.message || err);
    return /ot_export_snapshots|SQL_V532|V532.*SQL|42P01|42501|row[- ]level security|permission denied|schema cache|does not exist|relation .*snapshot|snapshot.*supabase/i.test(s);
  }

  function saveLocalFallback(ctx, report, phase, err) {
    try {
      const source = ctx?.data?.source || ctx?.source || {};
      const cycle = ctx?.data?.cycle || ctx?.cycle || {};
      const payload = {
        version: VERSION,
        saved_at: new Date().toISOString(),
        phase,
        batch_id: ctx?.batchId || null,
        filename: ctx?.filename || null,
        source,
        cycle,
        preflight: report ? {
          ok: !!report.ok,
          errors: report.errors || [],
          warnings: report.warnings || [],
          hr_row_count: report.hr_row_count,
          copy_row_count: report.copy_row_count,
          expected_row_count: report.expected_row_count,
          total_claimed_hours: report.total_claimed_hours,
          total_money: report.total_money,
          staff: report.details || []
        } : null,
        error: text(err?.message || err)
      };
      localStorage.setItem(fallbackKey(ctx?.batchId), JSON.stringify(payload));
      return true;
    } catch (_) { return false; }
  }

  function reportMessage(report) {
    const errors = Array.isArray(report?.errors) ? report.errors : [];
    if (!errors.length) return 'ไม่พบรายละเอียดจุดที่ไม่ตรง กรุณารีเฟรชหน้าแล้วลองใหม่';
    const shown = errors.slice(0, 12);
    if (errors.length > shown.length) shown.push(`และอีก ${errors.length - shown.length} จุด`);
    return shown.join('\n');
  }

  function install() {
    const guard = api();
    if (!guard || guard.__v602Wrapped) return false;
    guard.__v602Wrapped = true;

    const oldPre = guard.preExport;
    const oldPost = guard.postExport;
    const oldFailed = guard.exportFailed;

    guard.preExport = async function(ctx) {
      let report = null;
      try { report = typeof guard.preflightReport === 'function' ? guard.preflightReport(ctx) : null; } catch (_) {}

      if (report && !report.ok) {
        centeredDialog('Export HR ยังไม่ได้ — พบยอดไม่ตรง', reportMessage(report), 'error');
        const err = new Error(`V602 หยุด Export เพราะยอดไม่ตรงกัน\n${reportMessage(report)}`);
        err.cnmiV602Preflight = true;
        throw err;
      }

      try {
        const out = typeof oldPre === 'function' ? await oldPre.apply(this, arguments) : report;
        window.__CNMI_V602_FALLBACK_EXPORT__ = null;
        return out || report;
      } catch (err) {
        if (snapshotProblem(err) && report?.ok) {
          saveLocalFallback(ctx, report, 'prepared-local-fallback', err);
          window.__CNMI_V602_FALLBACK_EXPORT__ = { batchId: ctx?.batchId, ctx, report, error: text(err?.message || err) };
          centeredDialog('Snapshot Supabase ยังบันทึกไม่ได้', text(err?.message || err), 'warn');
          try { if (typeof showToast === 'function') showToast('ยอดตรวจผ่านแล้ว • ใช้ Local Audit ชั่วคราวและสร้าง Excel ต่อ', {tone:'warning'}); } catch (_) {}
          return report;
        }
        centeredDialog('Export HR ไม่สำเร็จ', text(err?.message || err || 'เกิดข้อผิดพลาดก่อนสร้างไฟล์'), 'error');
        throw err;
      }
    };

    guard.postExport = async function(ctx) {
      const fb = window.__CNMI_V602_FALLBACK_EXPORT__;
      if (fb && (!fb.batchId || fb.batchId === ctx?.batchId)) {
        saveLocalFallback(ctx, fb.report, 'exported-local-fallback', fb.error || 'Supabase snapshot unavailable');
        window.__CNMI_V602_FALLBACK_EXPORT__ = null;
        try { if (typeof showToast === 'function') showToast(`Export Excel สำเร็จ • Batch ${ctx?.batchId || '-'} • Snapshot เก็บ Local ชั่วคราว`, {tone:'warning'}); } catch (_) {}
        return fb.report;
      }
      try {
        return typeof oldPost === 'function' ? await oldPost.apply(this, arguments) : undefined;
      } catch (err) {
        let report = null;
        try { report = typeof guard.preflightReport === 'function' ? guard.preflightReport(ctx) : null; } catch (_) {}
        if (snapshotProblem(err) && report?.ok) {
          saveLocalFallback(ctx, report, 'exported-local-fallback', err);
          centeredDialog('Excel สร้างแล้ว แต่ Snapshot Supabase ยังบันทึกไม่ได้', text(err?.message || err), 'warn');
          return report;
        }
        throw err;
      }
    };

    guard.exportFailed = async function(ctx, err) {
      if (err?.cnmiV602Preflight) return;
      try { return typeof oldFailed === 'function' ? await oldFailed.apply(this, arguments) : undefined; }
      catch (_) { return undefined; }
    };

    console.info(`[${VERSION}] wrapped V532 export guard`);
    return true;
  }

  function decorateButton(root=document) {
    root.querySelectorAll?.('[data-export-hr-v318],[data-export-hr-v241]').forEach(btn => {
      if (btn.dataset.v602Decorated) return;
      btn.dataset.v602Decorated = '1';
      btn.title = 'ตรวจยอดก่อน แล้วสร้าง Excel HR';
    });
  }

  const css = document.createElement('style');
  css.textContent = `
    .v602-export-dialog{max-width:720px;margin:0 auto;padding:6px 4px 2px;text-align:left}
    .v602-export-dialog .v602-export-icon{width:46px;height:46px;border-radius:999px;display:grid;place-items:center;margin:0 auto 10px;font-size:30px;font-weight:900;line-height:1}
    .v602-export-dialog.is-error .v602-export-icon{background:#fee2e2;color:#b91c1c}
    .v602-export-dialog.is-warn .v602-export-icon{background:#fef3c7;color:#92400e}
    .v602-export-dialog h3{text-align:center;margin:0 0 12px;font-size:20px}
    .v602-export-list{margin:8px 0 12px;padding:12px 12px 12px 30px;border:1px solid #fecaca;border-radius:12px;background:#fff7f7;max-height:42vh;overflow:auto}
    .v602-export-dialog.is-warn .v602-export-list{border-color:#fde68a;background:#fffbeb}
    .v602-export-list li{margin:6px 0;line-height:1.5}
    .v602-export-message{padding:12px;border-radius:12px;background:#f8fafc;white-space:pre-wrap;line-height:1.55}
    .v602-export-help{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#eff6ff;color:#1e3a5f;font-size:13px;line-height:1.5}
  `;
  document.head.appendChild(css);

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (install() || tries > 80) clearInterval(timer);
    decorateButton();
  }, 125);

  const mo = new MutationObserver(() => decorateButton());
  if (document.documentElement) mo.observe(document.documentElement, {childList:true, subtree:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => decorateButton(), {once:true});
  else decorateButton();

  window.cnmiV602 = {version:VERSION, install, snapshotProblem};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v602-hr-export-diagnostic-fallback.js failed",__cnmiPatchError); }
/* ===== END patch-v602-hr-export-diagnostic-fallback.js ===== */

/* ===== BEGIN patch-v606-leave-quota-review-dedupe.js ===== */
try {
/* CNMI Staff Planner — V606
   Leave history quota review dedupe
   - Prevent repeated green "ตรวจโควตาแล้ว" cards when renderLeavePage is wrapped more than once.
   - Keep one canonical quota review card only.
*/
(() => {
  'use strict';
  if (window.__CNMI_V606_LEAVE_QUOTA_REVIEW_DEDUPE__) return;
  window.__CNMI_V606_LEAVE_QUOTA_REVIEW_DEDUPE__ = true;

  const VERSION = 'V606_LEAVE_QUOTA_REVIEW_DEDUPE';

  function dedupeHtml(html) {
    let out = String(html ?? '');
    const marker = 'data-v576-review-card';
    if (!out.includes(marker)) return out;

    let seen = false;
    out = out.replace(/<div class="v576-review-card(?: v576-review-ok)?" data-v576-review-card>[\s\S]*?<\/div>/g, (card) => {
      if (seen) return '';
      seen = true;
      return card;
    });
    return out;
  }

  function installRenderGuard() {
    let base = null;
    try { base = window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null); }
    catch (_) { base = window.renderLeavePage || null; }
    if (typeof base !== 'function' || base.__v606QuotaReviewDedupe) return false;

    const wrapped = function renderLeavePageV606() {
      return dedupeHtml(base.apply(this, arguments));
    };
    wrapped.__v606QuotaReviewDedupe = true;
    try { window.renderLeavePage = wrapped; renderLeavePage = wrapped; }
    catch (_) { window.renderLeavePage = wrapped; }
    return true;
  }

  function dedupeDom() {
    try {
      const cards = [...document.querySelectorAll('.v576-review-card[data-v576-review-card], .v576-review-card.v576-review-ok')];
      cards.slice(1).forEach(el => el.remove());
    } catch (_) {}
  }

  function versionChip() {
    try {
      document.querySelectorAll('.v520-version-chip,.v542-version-chip,.v524-version-chip').forEach(chip => {
        chip.textContent = 'v606';
        chip.title = 'V606: แก้การ์ดตรวจโควตาซ้ำในประวัติการลา';
      });
    } catch (_) {}
  }

  installRenderGuard();
  dedupeDom();
  versionChip();

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    installRenderGuard();
    dedupeDom();
    versionChip();
    if (tries >= 80) clearInterval(timer);
  }, 100);

  window.addEventListener('pageshow', () => { installRenderGuard(); dedupeDom(); versionChip(); });
  console.info(`[${VERSION}] loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v606-leave-quota-review-dedupe.js failed",__cnmiPatchError); }
/* ===== END patch-v606-leave-quota-review-dedupe.js ===== */

/* ===== BEGIN patch-v607-staff-physician-roster.js ===== */
try {
/* V607: Staff read-only physician roster; reuses V452 model and RLS. */
(()=>{'use strict';
if(window.__CNMI_V607_DOCTOR_ROSTER__)return;window.__CNMI_V607_DOCTOR_ROSTER__=true;
const PAGE='doctorRosterStaff';
const api=()=>window.cnmiPhysicianConsultV452;
const stateSafe=()=>{try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return window.state||{};}};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=x=>String(x).padStart(2,'0');
const currentMonth=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.year}-${o.month}`;};
let month=currentMonth(),mode='all',loading=false;
function doctors(id){if(!id)return 'ยังไม่กำหนด';const p=(stateSafe().staff||[]).find(x=>String(x.id)===String(id));return p?(p.nickname||p.full_name||p.name||p.email||'แพทย์'):'ไม่พบชื่อแพทย์';}
function dateThai(s){const d=new Date(s+'T12:00:00');return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function dayThai(s){return new Date(s+'T12:00:00').toLocaleDateString('th-TH',{weekday:'short'});}
function dates(key){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key))return [];const [y,m]=key.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${key}-${pad(i+1)}`);}
function td(id){return id?`<strong>${esc(doctors(id))}</strong>`:'<span class="v607-empty">ยังไม่กำหนด</span>';}
function schedule(){const a=api();if(!a)return '<div class="card">ไม่พบโมดูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</div>';
 if(a.cache?.unavailable)return '<div class="card">ยังไม่เปิดใช้งานฐานข้อมูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</div>';
 if(!a.cache?.loaded){if(!loading){loading=true;Promise.resolve(a.ensureLoaded()).finally(()=>{loading=false;if(stateSafe().page===PAGE)paint();});}return '<div class="card">กำลังโหลดตารางเวรแพทย์…</div>';}
 const rows=dates(month).map(d=>({d,m:a.baseForDate(d)}));
 const daytime=mode!=='off'?`<section class="card v607-section"><h3>ในเวลา 08:00–16:00</h3><p class="muted">เฉพาะวันทำการ · ห้อง Donor และห้อง Blood Bank</p><div class="v607-scroll"><table><thead><tr><th>วันที่</th><th>Donor</th><th>Blood Bank</th></tr></thead><tbody>${rows.filter(x=>x.m.weekday).map(x=>`<tr><td>${esc(dateThai(x.d))} <small>${esc(dayThai(x.d))}</small></td><td>${td(x.m.donor)}</td><td>${td(x.m.bb)}</td></tr>`).join('')||'<tr><td colspan="3">ไม่มีวันทำการในเดือนนี้</td></tr>'}</tbody></table></div></section>`:'';
 const off=mode!=='day'?`<section class="card v607-section"><h3>นอกเวลา / วันหยุด</h3><p class="muted">วันทำการ 16:00–08:00 วันถัดไป · วันหยุดดูแลตลอดวัน · Donor & Blood Bank</p><div class="v607-scroll"><table><thead><tr><th>วันที่</th><th>ช่วงเวลา</th><th>แพทย์ผู้รับผิดชอบ</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(dateThai(x.d))} <small>${esc(dayThai(x.d))}</small></td><td>${x.m.weekday?'16:00–08:00':'ตลอดวัน (วันหยุด)'}</td><td>${td(x.m.combined)}</td></tr>`).join('')}</tbody></table></div></section>`:'';
 return daytime+off;
}
function markup(){return `<div class="v607-roster"><div class="card v607-toolbar"><div><h3>ตารางเวรแพทย์ประจำเดือน</h3><p class="muted">Staff ทุกคนดูได้ · ข้อมูลจากตารางแพทย์ Consult · อ่านอย่างเดียว</p></div><div class="v607-filters"><label>เลือกเดือน <input id="v607-month" type="month" value="${esc(month)}"></label><label>แสดง <select id="v607-mode"><option value="all" ${mode==='all'?'selected':''}>ทั้งหมด</option><option value="day" ${mode==='day'?'selected':''}>ในเวลา</option><option value="off" ${mode==='off'?'selected':''}>นอกเวลา</option></select></label><button type="button" class="ghost-btn" id="v607-refresh">รีเฟรช</button></div></div><div id="v607-table">${schedule()}</div></div>`;}
function paint(){if(stateSafe().page!==PAGE)return;const slot=document.getElementById('v607-table');if(slot)slot.innerHTML=schedule();}
function render(){if(stateSafe().page!==PAGE)return false;document.getElementById('pageTitle').textContent='ตารางเวรแพทย์';document.getElementById('pageSubtitle').textContent='ดูเวรแพทย์ในเวลาและนอกเวลา';document.getElementById('pageContent').innerHTML=markup();return true;}
// V610: Standalone staff physician tab is retired; the roster is embedded in the monthly staff roster.
// Keep PAGE render compatibility for bookmarked links, but never create a sidebar item.
try{if(typeof NAV_ITEMS!=='undefined'){
  for(let i=NAV_ITEMS.length-1;i>=0;i--){if(NAV_ITEMS[i]?.id===PAGE)NAV_ITEMS.splice(i,1);}
}}catch(e){console.warn('[V610] menu cleanup',e);}
const original=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(typeof original==='function'){const wrapped=function(){if(render())return;return original.apply(this,arguments);};try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}}
document.addEventListener('change',e=>{if(stateSafe().page!==PAGE)return;if(e.target?.id==='v607-month'){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){month=e.target.value;paint();}}if(e.target?.id==='v607-mode'){mode=e.target.value;paint();}});
document.addEventListener('click',e=>{if(e.target?.id!=='v607-refresh'||stateSafe().page!==PAGE)return;e.preventDefault();const a=api();if(!a)return;a.cache.loaded=false;paint();});
window.cnmiDoctorRosterV607={render,paint};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v607-staff-physician-roster.js failed",__cnmiPatchError); }
/* ===== END patch-v607-staff-physician-roster.js ===== */

/* ===== BEGIN patch-v612-doctor-role-month-board.js ===== */
try {
/* V612: functional Admin physician mode and dedicated read-only physician monthly board for all staff */
(()=>{'use strict';if(window.__CNMI_V612__)return;window.__CNMI_V612__=true;
const PAGE='doctorRosterStaff',KEY='cnmi-v612-physician-mode';
const S=()=>window.state||{};
const api=()=>window.cnmiPhysicianConsultV452;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const todayMonth=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date());const z=Object.fromEntries(p.map(a=>[a.type,a.value]));return z.year+'-'+z.month;};
let month=/^\d{4}-(0[1-9]|1[0-2])$/.test(S().monthKey||'')?S().monthKey:todayMonth(), loading=false;
const actualAdmin=()=>{try{return !!window.isActualAdminV167?.();}catch(_){return false;}};
let doctorMode=false;try{doctorMode=sessionStorage.getItem(KEY)==='1';}catch(_){ }
if(!doctorMode){try{sessionStorage.removeItem(KEY);}catch(_){}}
function dateRows(key){const [y,m]=key.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${key}-${pad(i+1)}`);}
function person(id){const p=(S().staff||[]).find(x=>String(x.id)===String(id||''));return p?(p.nickname||p.full_name||p.name||'แพทย์'):'ยังไม่กำหนด';}
function pill(id,type){return id?`<span class="v612-pill ${type}" title="${esc(person(id))}">${esc(person(id))}</span>`:'<span class="v612-unset">—</span>';}
function dayLabel(d){return new Date(d+'T12:00:00').toLocaleDateString('th-TH',{weekday:'short'});}
function fullDate(d){return new Date(d+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function board(){const a=api();if(!a)return '<div class="card">ไม่พบระบบตารางแพทย์</div>';
 if(a.cache?.unavailable)return '<div class="card">ไม่พบตารางแพทย์ในฐานข้อมูล กรุณาติดต่อ Admin</div>';
 if(!a.cache?.loaded){if(!loading){loading=true;Promise.resolve(a.ensureLoaded?.()).catch(()=>{}).finally(()=>{loading=false;if(S().page===PAGE)paint();});}return '<div class="card">กำลังโหลดข้อมูลเวรแพทย์…</div>';}
 const data=dateRows(month).map(d=>({d,m:a.baseForDate(d)}));
 const row=(name,desc,field,typ)=>`<tr><th class="v612-rowhead"><b>${name}</b><small>${desc}</small></th>${data.map(x=>`<td class="${x.m.weekday?'':'v612-holiday'}">${field!=='combined'&&!x.m.weekday?'<span class="v612-unset">หยุด</span>':pill(x.m[field],typ)}${field==='combined'?`<small>${x.m.weekday?'16–08':'24 ชม.'}</small>`:''}</td>`).join('')}</tr>`;
 const days=`<tr><th class="v612-rowhead">ห้อง / วันที่</th>${data.map(x=>`<th class="${x.m.weekday?'':'v612-holiday'}">${Number(x.d.slice(-2))}<small>${esc(dayLabel(x.d))}</small></th>`).join('')}</tr>`;
 const detail=data.map(x=>`<tr><td>${esc(fullDate(x.d))}</td><td>${x.m.weekday?pill(x.m.donor,'donor'):'หยุด'}</td><td>${x.m.weekday?pill(x.m.bb,'bb'):'หยุด'}</td><td>${pill(x.m.combined,'call')}</td><td>${x.m.weekday?'16:00–08:00':'24 ชั่วโมง'}</td></tr>`).join('');
 return `<section class="card v612-card"><div class="v612-heading"><div><h3>ตารางเวรแพทย์ประจำเดือน</h3><p class="hint">ในเวลา 08:00–16:00 · นอกเวลา 16:00–08:00 · วันหยุด 24 ชั่วโมง</p></div><span class="v612-readonly">ดูได้ทุก Staff · อ่านอย่างเดียว</span></div><div class="v612-gridscroll"><table class="v612-board"><thead>${days}</thead><tbody>${row('Donor','08:00–16:00','donor','donor')}${row('Blood Bank','08:00–16:00','bb','bb')}${row('นอกเวลา / วันหยุด','Donor & Blood Bank','combined','call')}</tbody></table></div><p class="v612-note">สีฟ้า = Donor · สีเขียว = Blood Bank · สีส้ม = นอกเวลา · ช่องพื้นเหลือง = วันหยุด</p><details class="v612-details"><summary>ดูรายการแบบรายวันทั้งเดือน</summary><div class="v612-detail-scroll"><table><thead><tr><th>วันที่</th><th>Donor ในเวลา</th><th>Blood Bank ในเวลา</th><th>นอกเวลา / วันหยุด</th><th>เวลารับผิดชอบ</th></tr></thead><tbody>${detail}</tbody></table></div></details></section>`;
}
function html(){return `<div class="v612-page"><div class="card v612-toolbar"><label>เลือกเดือน <input type="month" id="v612-month" value="${esc(month)}"></label><button class="ghost-btn" id="v612-refresh" type="button">รีเฟรชข้อมูลแพทย์</button></div><div id="v612-board-slot">${board()}</div></div>`;}
function paint(){const root=document.getElementById('v612-board-slot');if(root&&S().page===PAGE)root.innerHTML=board();}
function render(){if(S().page!==PAGE)return false;const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),root=document.getElementById('pageContent');if(title)title.textContent='ตารางเวร(แพทย์)ประจำเดือน';if(sub)sub.textContent='แพทย์ Consult ในเวลาและนอกเวลา';if(root)root.innerHTML=html();return true;}
const prev=window.renderPage||(typeof renderPage==='function'?renderPage:null);
if(typeof prev==='function'){const fn=function(){if(render())return;return prev.apply(this,arguments);};try{window.renderPage=renderPage=fn;}catch(_){window.renderPage=fn;}}
function refreshDoctorMode(){if(!actualAdmin())doctorMode=false;const menu=document.querySelector('[data-view-as-menu]');if(menu){menu.querySelectorAll('[data-v609-physician-preview]').forEach(x=>x.remove());if(actualAdmin()&&!menu.querySelector('[data-v612-physician]'))menu.insertAdjacentHTML('beforeend',`<button type="button" class="view-as-option" data-v612-physician><b>🩺 โหมดแพทย์</b><small>ใช้หน้าจัดการแพทย์ Consult ด้วยสิทธิ์ Admin จริง</small></button>`);}
 const badge=document.querySelector('.view-as-badge');if(badge)badge.textContent=(doctorMode&&actualAdmin())?'แพทย์ (Admin)':(window.getViewAsModeV167?.()==='admin'?'Admin mode':'Staff mode');
}
const previousNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);if(typeof previousNav==='function'){const fn=function(){const r=previousNav.apply(this,arguments);refreshDoctorMode();return r;};try{window.renderNav=renderNav=fn;}catch(_){window.renderNav=fn;}}
document.addEventListener('click',async e=>{const mode=e.target.closest?.('[data-v612-physician]');if(mode){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(!actualAdmin())return;try{await window.setViewAsModeV167?.('admin');}catch(_){};doctorMode=true;try{sessionStorage.setItem(KEY,'1');}catch(_){};S().page='physicianConsult';refreshDoctorMode();document.querySelector('[data-view-as-menu]')?.classList.add('hidden');window.renderPage?.();return;}
 const other=e.target.closest?.('[data-view-as-mode]');if(other&&doctorMode){doctorMode=false;try{sessionStorage.removeItem(KEY);}catch(_){};}
 const rf=e.target.closest?.('#v612-refresh');if(rf){e.preventDefault();const a=api();if(a){a.cache.loaded=false;paint();}return;}
},true);
document.addEventListener('change',e=>{if(e.target.id==='v612-month'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){month=e.target.value;paint();}},true);
refreshDoctorMode();window.cnmiV612={paint};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v612-doctor-role-month-board.js failed",__cnmiPatchError); }
/* ===== END patch-v612-doctor-role-month-board.js ===== */

/* ===== BEGIN patch-v615-physician-roster-calendar-today.js ===== */
try {
/* V615: physician roster calendar + today's duty summary for easier staff/physician reading. */
(()=>{'use strict';
if(window.__CNMI_V615_PHYSICIAN_ROSTER_UI__)return;window.__CNMI_V615_PHYSICIAN_ROSTER_UI__=true;
const PAGE='doctorRosterStaff';
const S=()=>{try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return window.state||{};}};
const api=()=>window.cnmiPhysicianConsultV452;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const bangkokParts=(d=new Date())=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));
const todayKey=()=>{const p=bangkokParts();return `${p.year}-${p.month}-${p.day}`;};
const currentMonth=()=>todayKey().slice(0,7);
let month=(/^\d{4}-(0[1-9]|1[0-2])$/.test(S().monthKey||'')?S().monthKey:currentMonth());
let view='calendar',loading=false;
function staff(id){return (S().staff||[]).find(p=>String(p?.id||'')===String(id||''))||null;}
function nameOf(id){const p=staff(id);return p?(p.nickname||p.full_name||p.name||p.email||'แพทย์'):'ยังไม่กำหนด';}
function dateObj(k){return new Date(k+'T12:00:00');}
function dayShort(k){return dateObj(k).toLocaleDateString('th-TH',{weekday:'short'});}
function dateThai(k){return dateObj(k).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function monthThai(k){const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1,12).toLocaleDateString('th-TH',{month:'short',year:'numeric'});}
function monthLongThai(k){const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1,12).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}
function dates(k){const [y,m]=k.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${k}-${pad(i+1)}`);}
function shiftMonth(delta){const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+delta,1,12);month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;paint();}
function contactBtn(id,kind,extra=''){if(!id)return `<span class="v615-empty">ยังไม่กำหนด</span>`;return `<button type="button" class="v615-doctor v615-${kind}" data-v615-doctor="${esc(id)}" data-v615-site="${esc(kind==='donor'?'Donor':kind==='bb'?'Blood Bank':'Donor & Blood Bank')}" data-v615-time="${esc(extra|| (kind==='call'?'16:00–08:00':'08:00–16:00'))}" title="กดเพื่อดูข้อมูลติดต่อแพทย์">${esc(nameOf(id))}</button>`;}
function ensure(){const a=api();if(!a)return false;if(a.cache?.loaded)return true;if(!loading){loading=true;Promise.resolve(a.ensureLoaded?.()).catch(()=>{}).finally(()=>{loading=false;if(S().page===PAGE)paint();});}return false;}
function todayCard(){const a=api();if(!a?.cache?.loaded)return '';
 const d=todayKey(),m=a.baseForDate(d);if(!m)return '';
 const daytime=m.weekday?`<div class="v615-today-grid"><div class="v615-duty"><small>Donor · 08:00–16:00</small>${contactBtn(m.donor,'donor')}</div><div class="v615-duty"><small>Blood Bank · 08:00–16:00</small>${contactBtn(m.bb,'bb')}</div></div>`:'';
 const callTime=m.weekday?'16:00–08:00':'ตลอดวัน (วันหยุด)';
 return `<section class="card v615-today"><div class="v615-section-head"><div><h3>เวรแพทย์วันนี้</h3><p>${esc(dateThai(d))} · ${esc(dayShort(d))}</p></div><span class="v615-today-badge">วันนี้</span></div>${daytime}<div class="v615-duty v615-duty-call"><small>On-call · ${esc(callTime)}</small>${contactBtn(m.combined,'call',m.weekday?'16:00–08:00':'24 ชม.')}</div><p class="v615-contact-hint">กดชื่อแพทย์เพื่อดูข้อมูลติดต่อ</p></section>`;
}
function calendar(){const a=api();if(!a?.cache?.loaded)return '<section class="card v615-loading">กำลังโหลดตารางเวรแพทย์…</section>';
 const ds=dates(month),first=dateObj(ds[0]).getDay(),cells=[];for(let i=0;i<first;i++)cells.push('<div class="v615-day v615-blank" aria-hidden="true"></div>');
 for(const d of ds){const m=a.baseForDate(d),isToday=d===todayKey();const entries=[];
   if(m.weekday){entries.push(`<div class="v615-entry v615-entry-donor"><b>D</b>${contactBtn(m.donor,'donor')}</div>`);entries.push(`<div class="v615-entry v615-entry-bb"><b>B</b>${contactBtn(m.bb,'bb')}</div>`);}
   entries.push(`<div class="v615-entry v615-entry-call">${contactBtn(m.combined,'call',m.weekday?'16:00–08:00':'24 ชม.')}</div>`);
   cells.push(`<div class="v615-day${isToday?' is-today':''}${m.weekday?'':' is-off'}"><div class="v615-daynum"><span>${Number(d.slice(-2))}</span>${isToday?'<em>วันนี้</em>':''}</div>${entries.join('')}</div>`);
 }
 return `<div class="v615-weekdays"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div><div class="v615-calendar">${cells.join('')}</div>`;
}
function table(){const a=api();if(!a?.cache?.loaded)return '<section class="card v615-loading">กำลังโหลดตารางเวรแพทย์…</section>';
 const rows=dates(month).map(d=>{const m=a.baseForDate(d);return `<tr${d===todayKey()?' class="is-today"':''}><td><b>${esc(dateThai(d))}</b><small>${esc(dayShort(d))}</small></td><td>${m.weekday?contactBtn(m.donor,'donor'):'<span class="v615-offtext">วันหยุด</span>'}</td><td>${m.weekday?contactBtn(m.bb,'bb'):'<span class="v615-offtext">วันหยุด</span>'}</td><td>${contactBtn(m.combined,'call',m.weekday?'16:00–08:00':'24 ชม.')}<small>${m.weekday?'16:00–08:00':'ตลอดวัน'}</small></td></tr>`;}).join('');
 return `<div class="v615-table-scroll"><table class="v615-table"><thead><tr><th>วันที่</th><th>Donor<br><small>08:00–16:00</small></th><th>Blood Bank<br><small>08:00–16:00</small></th><th>On-call / วันหยุด</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function board(){if(!api())return '<section class="card">ไม่พบโมดูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</section>';if(api().cache?.unavailable)return '<section class="card">ยังไม่เปิดใช้งานฐานข้อมูลตารางแพทย์ กรุณาติดต่อผู้ดูแลระบบ</section>';if(!ensure())return '<section class="card v615-loading">กำลังโหลดตารางเวรแพทย์…</section>';
 return `<section class="card v615-roster-card"><div class="v615-head"><div><h3>ตารางเวรแพทย์</h3><p>${esc(monthLongThai(month))} · Donor / Blood Bank / On-call</p></div><span class="v615-readonly">อ่านอย่างเดียว</span></div><div class="v615-controls"><div class="v615-tabs" role="tablist"><button type="button" data-v615-view="calendar" class="${view==='calendar'?'active':''}">ปฏิทิน</button><button type="button" data-v615-view="table" class="${view==='table'?'active':''}">ตาราง</button></div><div class="v615-month-nav"><button type="button" class="v615-arrow" data-v615-month="-1" aria-label="เดือนก่อน">‹</button><button type="button" class="v615-month-label" data-v615-pick-month>${esc(monthThai(month))}</button><button type="button" class="v615-arrow" data-v615-month="1" aria-label="เดือนถัดไป">›</button><input type="month" id="v615-month-picker" value="${esc(month)}" aria-label="เลือกเดือน"></div></div><div class="v615-legend"><span><i class="donor"></i>Donor</span><span><i class="bb"></i>Blood Bank</span><span><i class="call"></i>On-call</span></div><div id="v615-view-slot">${view==='calendar'?calendar():table()}</div></section>`;
}
function markup(){return `<div class="v615-page">${todayCard()}<div id="v615-board-slot">${board()}</div></div>`;}
function paint(){if(S().page!==PAGE)return;const slot=document.getElementById('v615-board-slot');if(slot)slot.innerHTML=board();else{const root=document.getElementById('pageContent');if(root)root.innerHTML=markup();}}
function render(){if(S().page!==PAGE)return false;const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),root=document.getElementById('pageContent');if(title)title.textContent='ตารางเวรแพทย์';if(sub)sub.textContent='ดูว่าแต่ละวันต้องติดต่อแพทย์คนไหน';if(root)root.innerHTML=markup();return true;}
const prev=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(typeof prev==='function'){const fn=function(){if(render())return;return prev.apply(this,arguments);};try{window.renderPage=renderPage=fn;}catch(_){window.renderPage=fn;}}
document.addEventListener('click',e=>{if(S().page!==PAGE)return;
 const v=e.target.closest?.('[data-v615-view]');if(v){view=v.getAttribute('data-v615-view')==='table'?'table':'calendar';paint();return;}
 const nav=e.target.closest?.('[data-v615-month]');if(nav){shiftMonth(Number(nav.getAttribute('data-v615-month'))||0);return;}
 const pick=e.target.closest?.('[data-v615-pick-month]');if(pick){document.getElementById('v615-month-picker')?.showPicker?.();document.getElementById('v615-month-picker')?.click?.();return;}
 const doc=e.target.closest?.('[data-v615-doctor]');if(doc){e.preventDefault();e.stopPropagation();const id=doc.getAttribute('data-v615-doctor')||'',site=doc.getAttribute('data-v615-site')||'',time=doc.getAttribute('data-v615-time')||'';try{if(window.cnmiPhysicianPhoneV455?.openDoctor){window.cnmiPhysicianPhoneV455.openDoctor(id,site,time);return;}}catch(_){}const p=staff(id),raw=String(p?.phone||p?.contact_phone||'').trim();if(!raw){try{toast?.('ยังไม่มีเบอร์โทรแพทย์ในข้อมูลผู้ใช้งาน');}catch(_){}return;}const digits=raw.replace(/[^\d+]/g,'');try{showModal?.(`<div style="text-align:center"><h3>${esc(nameOf(id))}</h3><p>${esc(raw)}</p><a class="primary-btn" href="tel:${esc(digits)}">โทรออก</a></div>`,{small:true});}catch(_){location.href=`tel:${digits}`;}return;}
},true);
document.addEventListener('change',e=>{if(S().page!==PAGE||e.target?.id!=='v615-month-picker')return;if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){month=e.target.value;paint();}},true);
window.cnmiPhysicianRosterV615={render,paint};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v615-physician-roster-calendar-today.js failed",__cnmiPatchError); }
/* ===== END patch-v615-physician-roster-calendar-today.js ===== */

/* ===== BEGIN patch-v622-physician-mode-unified-navigation.js ===== */
try {
/* v622: unified physician navigation, replacing v617-v621 presentation overrides.
   This affects navigation presentation, not Supabase authorization/RLS. */
(()=>{'use strict';
if(window.__CNMI_V622_NAV__)return;window.__CNMI_V622_NAV__=true;
const KEY='cnmi-v612-physician-mode';
const s=()=>window.state||{};
const admin=()=>{try{return !!window.isActualAdminV167?.();}catch(e){return false;}};
const doctor=()=>{const p=s().profile;if(!p)return false;try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(e){}return [p.staff_type,p.position,p.role].some(v=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(v||'').trim()));};
const selected=()=>{try{return sessionStorage.getItem(KEY)==='1';}catch(e){return false;}};
const clear=()=>{try{sessionStorage.removeItem(KEY);}catch(e){}};
const physician=()=>admin()?selected():doctor();
const style=document.createElement('style');style.textContent=`
body.v622-physician-mode #mainNav .v622-hide {display:none!important}
body.v622-physician-mode .v622-admin-mode-banner {display:none!important}
`;document.head.append(style);
function apply(){
 const phys=physician(),nav=document.getElementById('mainNav');
 document.body.classList.toggle('v622-physician-mode',phys);
 document.body.classList.remove('v614-physician-mode','v616-physician-mode','v617-physician-mode');
 if(nav){
  // Clear all stale classes from older patches before applying one authoritative rule.
  nav.querySelectorAll('.v614-nav-hidden,.v616-nav-hidden,.v617-nav-hidden,.v619-admin-hidden,.v620-physician-ot-hidden,.v622-hide').forEach(el=>el.classList.remove('v614-nav-hidden','v616-nav-hidden','v617-nav-hidden','v619-admin-hidden','v620-physician-ot-hidden','v622-hide'));
  for(const section of nav.querySelectorAll('.nav-section')){
   const title=section.querySelector('.nav-section-title');
   const trees=[...section.querySelectorAll('.v524-nav-tree')];
   const isAdminSection=trees.some(t=>['physician','hr','positions-admin','users'].includes(t.dataset.v524Tree)) || /เมนู\s*Admin|เมนูผู้ดูแล/i.test(title?.textContent||'') || section.dataset.v622Admin==='1';
   if(isAdminSection)section.dataset.v622Admin='1';
   section.classList.remove('v622-hide');
   if(title){let label=title.querySelector('span');if(label){if(!label.dataset.v622Original)label.dataset.v622Original=label.textContent;label.textContent=phys&&isAdminSection?'เมนูแพทย์':label.dataset.v622Original;}}
   if(!phys)continue;
   if(isAdminSection){
    for(const tree of trees)if(tree.dataset.v524Tree!=='physician')tree.classList.add('v622-hide');
    for(const btn of section.querySelectorAll(':scope > .nav-btn[data-page]'))if(btn.dataset.page!=='physicianConsult')btn.classList.add('v622-hide');
    if(!section.querySelector('.v524-nav-tree[data-v524-tree="physician"],.nav-btn[data-page="physicianConsult"]'))section.classList.add('v622-hide');
   }
  }
  if(phys){
   for(const item of nav.querySelectorAll('.nav-btn[data-page],.v524-nav-tree')){
    const id=item.dataset.page||item.dataset.v524Tree||'';
    const txt=item.textContent||'';
    if(id==='ot'||id==='otSignup'||id==='otExtra'||/ลงชื่ออยู่เวร\s*\/\s*ขอ\s*OT\s*เพิ่ม/.test(txt)&&!item.classList.contains('nav-section'))item.classList.add('v622-hide');
   }
  }
 }
 const badge=document.querySelector('.view-as-badge');if(badge){const m=window.getViewAsModeV167?.();badge.textContent=phys?'Physician mode':m==='admin'?'Admin mode':'Staff mode';badge.classList.toggle('staff',!phys&&m!=='admin');badge.classList.toggle('admin',!phys&&m==='admin');}
 document.querySelector('[data-v612-physician]')?.classList.toggle('active',phys);
 // Dashboard may be in Admin mode internally, but show the user's selected mode consistently.
 for(const el of document.querySelectorAll('#pageContent .admin-mode-banner,#pageContent .v167-admin-mode-banner'))el.classList.toggle('v622-admin-mode-banner',phys);
}
let queued=false;function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}
const origNav=window.renderNav;if(typeof origNav==='function'){const wrapped=function(){const result=origNav.apply(this,arguments);queue();return result;};try{window.renderNav=renderNav=wrapped;}catch(e){window.renderNav=wrapped;}}
const origSet=window.setViewAsModeV167;if(typeof origSet==='function'){
 const wrapped=async function(mode){if(mode==='staff'||mode==='admin')clear();const result=await origSet.apply(this,arguments);window.renderNav?.();queue();return result;};window.setViewAsModeV167=window.setViewAsMode=wrapped;
}
document.addEventListener('click',e=>{
 if(e.target.closest?.('[data-view-as-mode]')){clear();queue();}
 if(e.target.closest?.('[data-v612-physician]')){requestAnimationFrame(()=>{window.renderNav?.();queue();});}
},false);
const nav=document.getElementById('mainNav');if(nav)new MutationObserver(ms=>{if(ms.some(m=>m.addedNodes.length||m.removedNodes.length))queue();}).observe(nav,{childList:true,subtree:true});
document.addEventListener('cnmi:force-clear-view-mode',()=>{clear();queue();});
apply();
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v622-physician-mode-unified-navigation.js failed",__cnmiPatchError); }
/* ===== END patch-v622-physician-mode-unified-navigation.js ===== */

/* ===== BEGIN patch-v624-physician-calendar-editor.js ===== */
try {
/* v624 physician calendar-first editing; reuse v452 persisted forms and schedule rules. */
(()=>{'use strict';if(window.__CNMI_V624__)return;window.__CNMI_V624__=true;
const api=()=>window.cnmiPhysicianConsultV452, st=()=>window.state||{}, esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0'), now=()=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:new Date().toISOString().slice(0,10)};
let month=/^\d{4}-\d{2}$/.test(new URLSearchParams(location.hash.split('?')[1]||'').get('month')||'')?new URLSearchParams(location.hash.split('?')[1]).get('month'):now().slice(0,7),chosen='',settings=false,loading=false;
const physician=()=>{const p=st().profile||{};try{if(window.cnmiPersonTypeV516?.isPhysician?.(p))return true;}catch(_){}return [p.staff_type,p.position,p.role].some(x=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(x||'')));};
const isPhysMode=()=>document.body.classList.contains('v622-physician-mode')||physician();
const name=id=>{const p=(st().staff||[]).find(x=>String(x.id)===String(id||''));return p?(p.nickname||p.full_name||p.name||p.email||'แพทย์'):'ยังไม่กำหนด';};
const options=(value)=>'<option value="">ใช้ตารางเดิม</option>'+((st().staff||[]).filter(p=>{try{return window.cnmiPersonTypeV516?.isPhysician?.(p)||[p.staff_type,p.position,p.role].some(x=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(x||'')));}catch(_){return false;}}).map(p=>`<option value="${esc(p.id)}" ${String(value||'')===String(p.id)?'selected':''}>${esc(p.full_name||p.nickname||p.name||p.email||'แพทย์')}</option>`).join(''));
const days=()=>{const [y,m]=month.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${month}-${pad(i+1)}`)};
const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
const heading=()=>new Date(month+'-01T12:00:00').toLocaleDateString('th-TH',{month:'long',year:'numeric'});
const pill=(id,k)=>`<span class="v624-pill v624-${k}">${esc(name(id))}</span>`;
function calendar(){const list=days(),offset=new Date(list[0]+'T12:00:00').getDay();return `<div class="v624-week">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<b>${x}</b>`).join('')}</div><div class="v624-calendar">${'<div class="v624-empty"></div>'.repeat(offset)}${list.map(d=>{const m=api().baseForDate(d);return `<button type="button" class="v624-day ${d===chosen?'selected':''} ${d===now()?'today':''}" data-v624-date="${d}" aria-label="แก้เวรวันที่ ${esc(fmt(d))}"><strong>${Number(d.slice(-2))}</strong>${m.weekday?`<span class="v624-duty donor">D ${esc(name(m.donor))}</span><span class="v624-duty bb">B ${esc(name(m.bb))}</span>`:''}<span class="v624-duty call">${m.weekday?'On-call':'วันหยุด'} ${esc(name(m.combined))}</span></button>`}).join('')}</div>`;}
function table(){return `<div class="v624-table-scroll"><table class="v624-table"><thead><tr><th>วันที่</th><th>Donor</th><th>Blood Bank</th><th>On-call / วันหยุด</th><th></th></tr></thead><tbody>${days().map(d=>{const m=api().baseForDate(d);return `<tr><td>${esc(fmt(d))}</td><td>${m.weekday?pill(m.donor,'donor'):'—'}</td><td>${m.weekday?pill(m.bb,'bb'):'—'}</td><td>${pill(m.combined,'call')}</td><td><button type="button" class="v624-edit" data-v624-date="${d}">แก้ไข</button></td></tr>`}).join('')}</tbody></table></div>`;}
function editor(){if(!chosen)return '';const m=api().baseForDate(chosen);return `<div class="v624-overlay" data-v624-dismiss><section class="v624-dialog" role="dialog" aria-modal="true" aria-label="จัดเวรแพทย์"><div class="v624-dialog-head"><div><h3>จัดเวรวันที่ ${esc(fmt(chosen))}</h3><p>เลือกเฉพาะช่องที่ต้องการเปลี่ยน ช่องที่เว้นว่างจะใช้ตารางเดิม</p></div><button type="button" data-v624-close aria-label="ปิด">×</button></div><form id="v452OverrideForm" class="v624-form"><input type="hidden" name="work_date" value="${chosen}"><label>Donor 08:00–16:00 <small>ปัจจุบัน: ${esc(name(m.donor))}</small><select name="donor_staff_id" ${!m.weekday?'disabled':''}>${options('')}</select></label><label>Blood Bank 08:00–16:00 <small>ปัจจุบัน: ${esc(name(m.bb))}</small><select name="bb_staff_id" ${!m.weekday?'disabled':''}>${options('')}</select></label><label>On-call / วันหยุด <small>ปัจจุบัน: ${esc(name(m.combined))}</small><select name="combined_staff_id">${options('')}</select></label><label>หมายเหตุ (ไม่บังคับ)<input name="note" placeholder="เช่น สลับเวร"></label><input type="hidden" name="version_label" value=""><div class="v624-actions"><button type="button" data-v624-close>ยกเลิก</button><button type="submit" class="primary-btn">บันทึกเวรวันนี้</button></div></form></section></div>`;}
function settingsArea(){if(!settings)return '';const temp=document.createElement('div');temp.innerHTML=api().renderAdminPage();const forms=[...temp.querySelectorAll('#v452DaytimeForm,#v452OncallForm')];return `<div class="v624-settings"><h3>ตั้งตารางหลายวัน / ทั้งเดือน</h3><p>ใช้เมื่อต้องการตั้งแพทย์ประจำเดือน หรือเวร On-call ต่อเนื่องหลายวัน</p><div class="v624-settings-forms">${forms.map(f=>f.outerHTML).join('')}</div></div>`;}
function render(){if(st().page!=='physicianConsult')return false;const root=document.getElementById('pageContent');if(!root)return false;document.getElementById('pageTitle').textContent='จัดตารางเวรแพทย์';const sub=document.getElementById('pageSubtitle');if(sub)sub.textContent='เลือกวันที่บนปฏิทินเพื่อจัดหรือสลับเวร';const a=api();if(!a){root.innerHTML='<div class="card">ไม่พบระบบตารางแพทย์</div>';return true;}if(a.cache?.unavailable){root.innerHTML=a.renderAdminPage();return true;}if(!a.cache?.loaded){root.innerHTML='<div class="card">กำลังโหลดตารางเวรแพทย์…</div>';if(!loading){loading=true;Promise.resolve(a.ensureLoaded()).finally(()=>{loading=false;if(st().page==='physicianConsult')render();});}return true;}
root.innerHTML=`<div class="v624-page"><section class="card v624-panel"><div class="v624-head"><div><h3>ปฏิทินเวรแพทย์</h3><p>กดวันที่เพื่อเลือกแพทย์ Donor, Blood Bank และ On-call</p></div><button type="button" class="v624-config" data-v624-settings>⚙ ตั้งตารางทั้งเดือน</button></div><div class="v624-nav"><button type="button" data-v624-shift="-1">‹</button><strong>${esc(heading())}</strong><button type="button" data-v624-shift="1">›</button><input type="month" value="${month}" id="v624-month" aria-label="เลือกเดือน"></div><div class="v624-legend">D Donor · B Blood Bank · On-call</div>${calendar()}</section>${settingsArea()}<section class="card v624-panel"><div class="v624-head"><h3>ตารางสรุปเวรแพทย์ · ${esc(heading())}</h3></div>${table()}</section>${editor()}</div>`;return true;}
const old=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(old){const wrapped=function(){if(render())return;return old.apply(this,arguments);};try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}}
document.addEventListener('click',e=>{if(st().page!=='physicianConsult')return;const day=e.target.closest('[data-v624-date]');if(day){chosen=day.dataset.v624Date;render();return;}const shift=e.target.closest('[data-v624-shift]');if(shift){const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+Number(shift.dataset.v624Shift),1);month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;chosen='';render();return;}if(e.target.closest('[data-v624-settings]')){settings=!settings;render();return;}if(e.target.closest('[data-v624-close]')||(e.target.hasAttribute('data-v624-dismiss'))){chosen='';render();}},false);
document.addEventListener('change',e=>{if(e.target?.id==='v624-month'&&/^\d{4}-\d{2}$/.test(e.target.value)){month=e.target.value;chosen='';render();}},false);
// Reinforce role-specific navigation even if a late legacy navigation patch restores OT entries.
function hideOt(){const nav=document.getElementById('mainNav');if(!nav)return;const phys=isPhysMode();nav.querySelectorAll('[data-page],.v524-nav-tree').forEach(el=>{const id=el.dataset.page||el.dataset.v524Tree||'';if(['ot','otSignup','otExtra','otAdmin'].includes(id)||/จัดการ\s*OT\s*เจ้าหน้าที่/i.test(el.textContent||'')&&el.matches('.nav-btn,.v524-nav-tree')){if(phys)el.style.setProperty('display','none','important');else el.style.removeProperty('display');}});}
const oldNav=window.renderNav;if(typeof oldNav==='function'){const wrapped=function(){const result=oldNav.apply(this,arguments);hideOt();return result;};try{window.renderNav=renderNav=wrapped;}catch(_){window.renderNav=wrapped;}}
document.addEventListener('click',()=>setTimeout(hideOt,0),true);hideOt();window.cnmiPhysicianCalendarV624={render};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v624-physician-calendar-editor.js failed",__cnmiPatchError); }
/* ===== END patch-v624-physician-calendar-editor.js ===== */

/* ===== BEGIN patch-v625-physician-staffstyle-roster.js ===== */
try {
/* v625 — Staff-style physician roster manager + same-duty swap workflow + remove today card. */
(()=>{'use strict';
if(window.__CNMI_V625_PHYSICIAN_STAFFSTYLE_ROSTER__)return;window.__CNMI_V625_PHYSICIAN_STAFFSTYLE_ROSTER__=true;
const PAGE='physicianConsult', TABLE='physician_consult_schedules';
const S=()=>{try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return window.state||{};}};
const api=()=>window.cnmiPhysicianConsultV452;
const client=()=>{try{return window.supabaseClient||(typeof sb!=='undefined'?sb:null);}catch(_){return window.supabaseClient||null;}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const bkkToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
const q=()=>new URLSearchParams((location.hash.split('?')[1]||''));
let month=/^\d{4}-\d{2}$/.test(q().get('month')||'')?q().get('month'):bkkToday().slice(0,7);
let view=['month','calendar','doctor'].includes(q().get('view'))?q().get('view'):'calendar', chosen='', focusDuty='', loading=false, advanced=false, swapMode=false, swapFirst=null, busy=false;
const holidayLoaded=new Set(),holidayPending=new Set();
const toastSafe=m=>{try{if(typeof toast==='function')return toast(m);}catch(_){}try{if(typeof showToast==='function')return showToast(m);}catch(_){}console.info('[v625]',m);};
const actor=()=>{try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||null;}catch(_){return S()?.profile?.id||null;}};
function isPhysician(p){if(!p||p.is_active===false||p.active===false)return false;try{if(window.cnmiPersonTypeV516?.isPhysician)return !!window.cnmiPersonTypeV516.isPhysician(p);}catch(_){}return [p.staff_type,p.position,p.role].some(v=>/^(แพทย์|หมอ|physician|doctor)/i.test(String(v||'').trim()));}
const physicians=()=> (S().staff||[]).filter(isPhysician).sort((a,b)=>String(a.nickname||a.full_name||'').localeCompare(String(b.nickname||b.full_name||''),'th'));
const person=id=>(S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;
const name=id=>{const p=person(id);return p?(p.nickname||p.full_name||p.name||p.email||'แพทย์'):'ยังไม่กำหนด';};
const fullName=id=>{const p=person(id);return p?(p.full_name||p.nickname||p.name||p.email||'แพทย์'):'ยังไม่กำหนด';};
const days=()=>{const [y,m]=month.split('-').map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${month}-${pad(i+1)}`);};
const dObj=d=>new Date(d+'T12:00:00');
const dayShort=d=>dObj(d).toLocaleDateString('th-TH',{weekday:'short'});
const dateThai=d=>dObj(d).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
const monthThai=()=>{const [y,m]=month.split('-').map(Number);return new Date(y,m-1,1,12).toLocaleDateString('th-TH',{month:'long',year:'numeric'});};
const dutyLabel=t=>t==='donor'?'Donor':t==='bb'?'Blood Bank':'On-call / วันหยุด';
const dutyField=t=>t==='donor'?'donor_staff_id':t==='bb'?'bb_staff_id':'combined_staff_id';
const effective=(model,t)=>t==='donor'?model.donor:t==='bb'?model.bb:model.combined;
function setHashMonth(){try{const p=q();p.set('month',month);p.set('view',view);history.replaceState(null,'',location.hash.split('?')[0]+'?'+p.toString());}catch(_){} }
function doctorOptions(value=''){return `<option value="">ไม่เปลี่ยน</option>${physicians().map(p=>`<option value="${esc(p.id)}" ${String(value||'')===String(p.id)?'selected':''}>${esc(p.full_name||p.nickname||p.name||p.email||'แพทย์')}</option>`).join('')}`;}
function ensure(){const a=api();if(!a)return false;if(a.cache?.loaded)return true;if(!loading){loading=true;Promise.resolve(a.ensureLoaded?.()).catch(()=>{}).finally(()=>{loading=false;if(S().page===PAGE)render();});}return false;}
function loadMonthHolidays(){
 const key=month;
 if(holidayLoaded.has(key)||holidayPending.has(key))return;
 const c=client();if(!c)return;
 holidayPending.add(key);
 const [y,m]=key.split('-').map(Number),end=`${key}-${pad(new Date(y,m,0).getDate())}`;
 Promise.resolve(c.from('public_holidays').select('*').gte('holiday_date',`${key}-01`).lte('holiday_date',end)).then(({data,error})=>{
  if(error)throw error;
  const st=S();if(!Array.isArray(st.holidays))st.holidays=[];
  const existing=st.holidays.filter(row=>!String(row?.holiday_date||row?.date||'').startsWith(key));
  st.holidays=[...existing,...(data||[])];
  holidayLoaded.add(key);
  if(st.page===PAGE&&month===key)render();
 }).catch(err=>{console.warn('[v628] โหลดวันหยุดเดือน',key,err);toastSafe('โหลดวันหยุดจากปฏิทินกลางไม่สำเร็จ กรุณากดรีเฟรช');}).finally(()=>holidayPending.delete(key));
}
function toolbar(){return `<section class="card v625-toolbar"><div class="v625-toolbar-top"><div><h3>ตารางเวรแพทย์</h3><p>จัดเวรแบบตารางเดียว คลิกช่องวันที่เพื่อแก้ไข หรือใช้ “สลับเวร” เพื่อแลกวันกัน</p></div><div class="v625-actions-top"><button type="button" class="v625-swap-toggle ${swapMode?'active':''}" data-v625-swap>${swapMode?'ยกเลิกสลับเวร':'⇄ สลับเวร'}</button><button type="button" data-v625-advanced>⚙ ตั้งค่าแบบช่วง/ทั้งเดือน</button></div></div><div class="v625-controls"><div class="v625-tabs" role="tablist"><button type="button" data-v625-view="calendar" class="${view==='calendar'?'active':''}">ปฏิทิน</button><button type="button" data-v625-view="doctor" class="${view==='doctor'?'active':''}">ดูตามแพทย์</button><button type="button" data-v625-view="month" class="${view==='month'?'active':''}">ตารางทั้งเดือน</button></div><div class="v625-monthnav"><button type="button" data-v625-shift="-1">‹</button><strong>${esc(monthThai())}</strong><button type="button" data-v625-shift="1">›</button><input type="month" id="v625-month" value="${esc(month)}" aria-label="เลือกเดือน"></div></div>${swapMode?`<div class="v625-swap-help">${swapFirst?`เลือกช่องที่ 2 ของ <b>${esc(dutyLabel(swapFirst.duty))}</b> เพื่อสลับกับ ${esc(dateThai(swapFirst.date))}`:'ขั้นที่ 1: คลิกเวรที่ต้องการแลก จากนั้นคลิกอีกวันที่ในแถวเดียวกัน'}</div>`:''}</section>`;}
function leaveOn(id,d){
 if(!id)return null;
 try{if(typeof activeLeaveRecordOn==='function')return activeLeaveRecordOn(id,d);}catch(_){}
 return (S().leaves||[]).find(r=>String(r?.staff_id)===String(id)&&String(r?.start_date||'').slice(0,10)<=d&&String(r?.end_date||'').slice(0,10)>=d&&!/(cancel|delete|inactive|reject|ยกเลิก|ไม่อนุมัติ)/i.test(String(r?.status||'')))||null;
}
function holidayTitle(d){try{if(typeof isHolidayDate==='function'&&isHolidayDate(d)){return typeof holidayName==='function'?String(holidayName(d)||'วันหยุดราชการ'):'วันหยุดราชการ';}}catch(_){}return '';}
function markLeave(id,d){return leaveOn(id,d)?'<small class="v627-leave">ลา · หาแพทย์แทน</small>':'';}
function decoratePhysicianSubmenu(){
 const candidates=[...document.querySelectorAll('a,button')];
 const saved=candidates.find(el=>(el.textContent||'').trim()==='รายการที่บันทึก' && el.closest('aside,[class*="sidebar"],#sidebar,[class*="nav"]'));
 if(!saved)return;
 const container=saved.closest('li')||saved.parentElement;
 if(!container||!container.parentElement)return;
 container.style.setProperty('display','none','important');
 // One navigation element per mode, with actual bookmarkable hash URLs.
 container.parentElement.querySelectorAll('[data-v627-menu-item]').forEach(el=>el.remove());
 const menus=[['calendar','ปฏิทิน'],['doctor','ดูตามแพทย์'],['month','ตารางทั้งเดือน']];
 menus.forEach(([mode,label])=>{
  const holder=document.createElement(container.tagName==='LI'?'li':'div');
  holder.setAttribute('data-v627-menu-item',mode);
  const link=document.createElement('a');link.setAttribute('href',`#/physician-consult?month=${month}&view=${mode}`);link.setAttribute('data-v627-nav',mode);
  link.textContent=label;link.className='v627-menu-link'+(view===mode?' active':'');
  holder.appendChild(link);container.parentElement.insertBefore(holder,container);
 });
}
function cell(d,m,t){if((t==='donor'||t==='bb')&&!m.weekday)return `<td class="v625-off" title="${esc(holidayTitle(d)||'วันหยุดสุดสัปดาห์')}"><span>${holidayTitle(d)?'นักขัตฤกษ์':'หยุด'}</span></td>`;const id=effective(m,t), selected=swapFirst&&swapFirst.date===d&&swapFirst.duty===t;const absent=leaveOn(id,d);return `<td><button type="button" class="v625-duty-cell v625-${t} ${selected?'selected':''} ${absent?'v627-absent':''}" data-v625-cell data-v625-date="${d}" data-v625-duty="${t}" title="${absent?'แพทย์ลาวันนี้ ต้องจัดคนแทน':swapMode?'เลือกเพื่อสลับเวร':'คลิกเพื่อแก้ไข'}"><span>${esc(id?name(id):'ยังไม่กำหนด')}</span>${markLeave(id,d)}${d===bkkToday()?'<em>วันนี้</em>':''}</button></td>`;}

function monthMatrix(){const a=api(),ds=days();const head=ds.map(d=>`<th class="${d===bkkToday()?'today':''}"><b>${Number(d.slice(-2))}</b><small>${esc(dayShort(d))}</small>${holidayTitle(d)?`<small class="v627-holiday" title="${esc(holidayTitle(d))}">หยุด</small>`:''}</th>`).join('');const row=(t,label,time)=>`<tr><th class="v625-rowhead"><b>${label}</b><small>${time}</small></th>${ds.map(d=>cell(d,a.baseForDate(d),t)).join('')}</tr>`;return `<section class="card v625-board"><div class="v625-board-head"><div><h3>${esc(monthThai())}</h3><p>คลิกชื่อแพทย์ในแต่ละช่องเพื่อแก้ไขได้ทันที</p></div><div class="v625-legend"><span class="donor">Donor</span><span class="bb">Blood Bank</span><span class="call">On-call</span></div></div><div class="v625-gridscroll"><table class="v625-matrix"><thead><tr><th class="v625-rowhead">หน้าที่ / วันที่</th>${head}</tr></thead><tbody>${row('donor','Donor','08:00–16:00')}${row('bb','Blood Bank','08:00–16:00')}${row('call','On-call / วันหยุด','16:00–08:00 / 24 ชม.')}</tbody></table></div><p class="v625-note">บนมือถือให้เลื่อนตารางซ้าย–ขวาได้ · การสลับเวรทำได้เฉพาะหน้าที่เดียวกัน เช่น Donor ↔ Donor</p></section>`;}
function calendar(){const a=api(),ds=days(),first=dObj(ds[0]).getDay();return `<section class="card v625-calendar-card"><div class="v625-week">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<b>${x}</b>`).join('')}</div><div class="v625-calendar">${'<div></div>'.repeat(first)}${ds.map(d=>{const m=a.baseForDate(d);return `<button type="button" class="v625-day ${holidayTitle(d)?'v627-holiday-day':''} ${d===bkkToday()?'today':''}" data-v625-date="${d}"><strong>${Number(d.slice(-2))}</strong>${holidayTitle(d)?`<span class="v627-holiday">${esc(holidayTitle(d))}</span>`:''}${m.weekday?`<span class="donor">D ${esc(name(m.donor))}${markLeave(m.donor,d)}</span><span class="bb">B ${esc(name(m.bb))}${markLeave(m.bb,d)}</span>`:''}<span class="call">${m.weekday?'On-call':'วันหยุด'} ${esc(name(m.combined))}${markLeave(m.combined,d)}</span></button>`;}).join('')}</div></section>`;}
function doctorView(){const a=api(),ds=days(),docs=physicians();const cards=docs.map(p=>{const items=[];for(const d of ds){const m=a.baseForDate(d);if(String(m.donor||'')===String(p.id))items.push({d,t:'Donor',leave:!!leaveOn(p.id,d)});if(String(m.bb||'')===String(p.id))items.push({d,t:'Blood Bank',leave:!!leaveOn(p.id,d)});if(String(m.combined||'')===String(p.id))items.push({d,t:m.weekday?'On-call':'วันหยุด',leave:!!leaveOn(p.id,d)});}return `<article class="v625-doctor-card"><div class="v625-doctor-head"><b>${esc(p.nickname||p.full_name||p.name||'แพทย์')}</b><span>${items.length} เวร</span></div><div class="v625-doctor-list">${items.length?items.map(x=>`<button type="button" data-v625-date="${x.d}"><span>${esc(dateThai(x.d))}</span><b>${esc(x.t)}${x.leave?' · ลา (ต้องหาแทน)':''}</b></button>`).join(''):'<p>ไม่มีเวรในเดือนนี้</p>'}</div></article>`;}).join('');return `<section class="card v625-doctors"><div class="v625-board-head"><div><h3>ดูตามแพทย์ · ${esc(monthThai())}</h3><p>ช่วยเช็กจำนวนวันและหาเวรที่จะแลกได้เร็วขึ้น</p></div></div><div class="v625-doctor-grid">${cards||'<p>ไม่พบรายชื่อแพทย์</p>'}</div></section>`;}
function editor(){if(!chosen)return '';const m=api().baseForDate(chosen);return `<div class="v625-overlay" data-v625-dismiss><section class="v625-dialog" role="dialog" aria-modal="true"><div class="v625-dialog-head"><div><h3>${esc(dateThai(chosen))}</h3><p>แก้เฉพาะช่องที่ต้องการ ส่วนช่องอื่นใช้ตารางเดิม</p></div><button type="button" data-v625-close aria-label="ปิด">×</button></div><form id="v452OverrideForm" class="v625-form"><input type="hidden" name="work_date" value="${esc(chosen)}"><label class="${focusDuty==='donor'?'focus':''}">Donor 08:00–16:00 <small>ปัจจุบัน: ${esc(name(m.donor))}</small><select name="donor_staff_id" ${!m.weekday?'disabled':''}>${doctorOptions()}</select></label><label class="${focusDuty==='bb'?'focus':''}">Blood Bank 08:00–16:00 <small>ปัจจุบัน: ${esc(name(m.bb))}</small><select name="bb_staff_id" ${!m.weekday?'disabled':''}>${doctorOptions()}</select></label><label class="${focusDuty==='call'?'focus':''}">On-call / วันหยุด <small>ปัจจุบัน: ${esc(name(m.combined))}</small><select name="combined_staff_id">${doctorOptions()}</select></label><label>หมายเหตุ <input name="note" placeholder="เช่น สลับเวร / แทนเวร"></label><input type="hidden" name="version_label" value=""><div class="v625-dialog-actions"><button type="button" data-v625-close>ยกเลิก</button><button type="submit" class="primary-btn">บันทึก</button></div></form></section></div>`;}
function advancedArea(){if(!advanced)return '';const holder=document.createElement('div');holder.innerHTML=api().renderAdminPage();const forms=[...holder.querySelectorAll('#v452DaytimeForm,#v452OncallForm')];return `<section class="card v625-advanced"><div class="v625-board-head"><div><h3>ตั้งค่าแบบช่วง / ทั้งเดือน</h3><p>ใช้เฉพาะตอนวางตารางตั้งต้นหลายวัน หลังจากนั้นแก้รายวันจากตารางด้านบนได้เลย</p></div><button type="button" data-v625-advanced>ปิด</button></div><div class="v625-advanced-grid">${forms.map(x=>x.outerHTML).join('')}</div></section>`;}
function removeTodayCard(){document.querySelectorAll('.v615-today').forEach(x=>x.remove());}
function hideLegacyPhysicianForms(){
 // Hide obsolete links only in the physician Consult subtree; keep the saved-records link.
 const names=new Set(['ในเวลา จ.–ศ.','ในเวลา จ.-ศ.','นอกเวลา / วันหยุด','แก้เฉพาะวัน']);
 document.querySelectorAll('a,button').forEach(el=>{
  if(!names.has((el.textContent||'').trim()))return;
  const href=el.getAttribute('href')||'';
  const tree=el.closest('[class*="sidebar"],[class*="nav"],aside,#sidebar');
  if(!tree && !href.includes('physician-consult'))return;
  el.style.setProperty('display','none','important');
 });
}

function render(){if(S().page!==PAGE)return false;const root=document.getElementById('pageContent');if(!root)return false;const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle');if(title)title.textContent='ตารางเวรแพทย์';if(sub)sub.textContent='จัดเวรและสลับเวรแบบตารางเดียว';const a=api();if(!a){root.innerHTML='<div class="card">ไม่พบระบบตารางแพทย์</div>';return true;}if(a.cache?.unavailable){root.innerHTML=a.renderAdminPage();return true;}if(!ensure()){root.innerHTML='<div class="card">กำลังโหลดตารางเวรแพทย์…</div>';return true;}loadMonthHolidays();if(!q().get('view'))setHashMonth();root.innerHTML=`<div class="v625-page">${toolbar()}${advancedArea()}${view==='calendar'?calendar():view==='doctor'?doctorView():monthMatrix()}${editor()}</div>`;removeTodayCard();hideLegacyPhysicianForms();decoratePhysicianSubmenu();return true;}
async function confirmSafe(msg,title='ยืนยันสลับเวร'){try{if(typeof confirmDialog==='function')return !!(await confirmDialog(msg,title));}catch(_){}return window.confirm(msg);}
async function saveOverrideField(date,duty,newId,note){const a=api(),c=client();if(!a||!c)throw new Error('ยังไม่เชื่อมต่อฐานข้อมูล');const m=a.baseForDate(date),o=m.override||null,field=dutyField(duty);const payload={schedule_type:'daily_override',start_date:date,end_date:date,is_active:true,donor_staff_id:o?.donor_staff_id||null,bb_staff_id:o?.bb_staff_id||null,combined_staff_id:o?.combined_staff_id||null,note:[o?.note,note].filter(Boolean).join(' · ')||null,version_label:o?.version_label||null,updated_by_staff_id:actor()||null};payload[field]=newId||null;let result;if(o?.id)result=await c.from(TABLE).update(payload).eq('id',o.id).select().single();else{payload.created_by_staff_id=actor()||null;result=await c.from(TABLE).insert(payload).select().single();}if(result.error)throw result.error;}
async function doSwap(second){if(busy)return;const first=swapFirst;if(!first||first.duty!==second.duty||first.date===second.date)return;const a=api(),m1=a.baseForDate(first.date),m2=a.baseForDate(second.date),id1=effective(m1,first.duty),id2=effective(m2,second.duty);if(!id1||!id2){toastSafe('สลับไม่ได้ เพราะมีอย่างน้อย 1 วันที่ยังไม่ได้กำหนดแพทย์');swapFirst=null;render();return;}const ok=await confirmSafe(`สลับ ${dutyLabel(first.duty)}\n${dateThai(first.date)}: ${name(id1)}\n↔\n${dateThai(second.date)}: ${name(id2)}`);if(!ok){swapFirst=null;render();return;}busy=true;try{await saveOverrideField(first.date,first.duty,id2,`สลับเวรกับ ${dateThai(second.date)}`);await saveOverrideField(second.date,second.duty,id1,`สลับเวรกับ ${dateThai(first.date)}`);await a.ensureLoaded(true);toastSafe('สลับเวรเรียบร้อยแล้ว');swapFirst=null;render();}catch(err){console.error('[v625] swap',err);toastSafe(`สลับเวรไม่สำเร็จ: ${err?.message||err}`);}finally{busy=false;}}
const previous=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(typeof previous==='function'){const wrapped=function(){if(render())return;return previous.apply(this,arguments);};try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}}
document.addEventListener('click',async e=>{removeTodayCard();if(S().page!==PAGE)return;const nav=e.target.closest?.('[data-v627-nav]');if(nav){e.preventDefault();view=nav.dataset.v627Nav;chosen='';focusDuty='';swapFirst=null;setHashMonth();render();return;}const tab=e.target.closest?.('[data-v625-view]');if(tab){view=tab.dataset.v625View;chosen='';focusDuty='';swapFirst=null;setHashMonth();render();return;}const sh=e.target.closest?.('[data-v625-shift]');if(sh){const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+Number(sh.dataset.v625Shift),1,12);month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;swapFirst=null;chosen='';setHashMonth();render();return;}if(e.target.closest?.('[data-v625-advanced]')){advanced=!advanced;render();return;}if(e.target.closest?.('[data-v625-swap]')){swapMode=!swapMode;swapFirst=null;chosen='';render();return;}const cell=e.target.closest?.('[data-v625-cell]');if(cell){const item={date:cell.dataset.v625Date,duty:cell.dataset.v625Duty};if(swapMode){if(!swapFirst){const m=api().baseForDate(item.date),id=effective(m,item.duty);if(!id){toastSafe('ช่องนี้ยังไม่ได้กำหนดแพทย์ จึงใช้เป็นต้นทางสลับเวรไม่ได้');return;}swapFirst=item;render();}else if(swapFirst.duty!==item.duty){toastSafe('เลือกอีกวันที่ในหน้าที่เดียวกัน เช่น Donor กับ Donor');}else if(swapFirst.date===item.date){swapFirst=null;render();}else await doSwap(item);return;}chosen=item.date;focusDuty=item.duty;render();return;}const day=e.target.closest?.('[data-v625-date]');if(day){chosen=day.dataset.v625Date;focusDuty='';render();return;}if(e.target.closest?.('[data-v625-close]')||e.target?.hasAttribute?.('data-v625-dismiss')){chosen='';focusDuty='';render();return;}},true);
document.addEventListener('change',e=>{if(S().page===PAGE&&e.target?.id==='v625-month'&&/^\d{4}-\d{2}$/.test(e.target.value)){month=e.target.value;swapFirst=null;chosen='';setHashMonth();render();}},true);
// Guarantee that the old redundant "เวรแพทย์วันนี้" card never returns on the read-only physician roster page.
// V678: the old document-wide subtree observer ran on EVERY page mutation,
// including large dashboard renders. Observe page swaps and sidebar changes only.
let legacyQueued=false;
function scheduleLegacyCleanup(){
 if(legacyQueued)return;
 legacyQueued=true;
 requestAnimationFrame(()=>{legacyQueued=false;removeTodayCard();hideLegacyPhysicianForms();});
}
const legacyContent=document.getElementById('pageContent');
if(legacyContent)new MutationObserver(muts=>{
 if(muts.some(m=>m.addedNodes.length||m.removedNodes.length))scheduleLegacyCleanup();
}).observe(legacyContent,{childList:true,subtree:false});
const legacyNav=document.getElementById('mainNav');
if(legacyNav)new MutationObserver(muts=>{
 if(muts.some(m=>m.addedNodes.length||m.removedNodes.length))scheduleLegacyCleanup();
}).observe(legacyNav,{childList:true,subtree:true});
removeTodayCard();hideLegacyPhysicianForms();
window.addEventListener('hashchange',()=>{if(S().page!==PAGE)return;const next=q().get('view');view=['month','calendar','doctor'].includes(next)?next:'calendar';const mo=q().get('month');if(/^\d{4}-\d{2}$/.test(mo||''))month=mo;chosen='';swapFirst=null;render();});
window.cnmiPhysicianRosterV625={render};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v625-physician-staffstyle-roster.js failed",__cnmiPatchError); }
/* ===== END patch-v625-physician-staffstyle-roster.js ===== */

/* ===== BEGIN patch-v630-staff-pdf-confirm-history.js ===== */
try {
/* V630: staff-owned post-export PDF check and permanent adjustment history (read-only). */
(()=>{'use strict';if(window.__CNMI_V630__)return;window.__CNMI_V630__=true;
const S=()=>window.state||{};const DB=()=>{try{return (typeof sb!=='undefined'&&sb?.rpc?sb:null)||window.sb||window.supabaseClient||null}catch(_){return window.sb||null}};const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>Number(x||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});const month=()=>String(S().otMenuMonthV369||S().otSourceMonthV241||S().otMoneyMonthV241||S().monthKey||new Date().toISOString().slice(0,7)).slice(0,7);
let working=false,signature='',lastLoad=0;
const notice=(s)=>{try{showToast(s);}catch(_){alert(s);}};
async function render(){
 if(working||S().page!=='ot'||String(S().otMenuV369||'')!=='staff-details')return;
 const host=document.querySelector('.v369-ot-content');if(!host)return;
 const key=month()+'|'+String(S().profile?.id||'');
 let card=host.querySelector('#v630StaffPdfHistory');
 if(!card){card=document.createElement('section');card.className='card v630-card';card.id='v630StaffPdfHistory';
 card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน (ทุกเดือน)</h3><p class="muted">กำลังโหลดประวัติ…</p>';host.append(card)}
 if(signature===key&&Date.now()-lastLoad<120000)return;
 const db=DB();if(!db?.rpc){card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน (ทุกเดือน)</h3><p class="muted">ยังเชื่อมต่อฐานข้อมูลไม่ได้ กรุณารีเฟรชหรือตรวจการตั้งค่า Supabase</p>';return}
 working=true;
 try{
  const {data,error}=await db.rpc('get_my_ot_adjustment_history_v630');
  if(error)throw error;if(!card.isConnected||S().otMenuV369!=='staff-details')return;
  const rows=Array.isArray(data)?data:[];
  card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน (ทุกเดือน)</h3><p class="muted">แสดงเดือนต้นทาง เดือนที่นำไปเบิก และสถานะ • ยอด OT ตกเบิกแยกจากยอดเดือนปัจจุบัน</p>'+
  (rows.length?'<div class="table-wrap"><table><thead><tr><th>รายการ</th><th>เดือนต้นทาง</th><th>นำไปเบิกเดือน</th><th>จำนวนเงิน</th><th>สถานะ</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+(r.adjustment_type==='overclaim'?'ลดเบิกเกิน':'OT ตกเบิกย้อนหลัง')+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</td><td>'+esc(r.source_month)+'</td><td>'+esc(r.apply_month)+'</td><td>'+(Number(r.amount_delta)>0?'+':'')+fmt(r.amount_delta)+' บาท</td><td>'+(r.status==='exported'?'รวมใน Export แล้ว':r.status==='pending'?'รอดำเนินการ':esc(r.status))+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">ไม่มีประวัติรายการปรับย้อนหลัง</p>');
  signature=key;lastLoad=Date.now();
 }catch(e){if(card.isConnected)card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน</h3><p class="muted">ไม่สามารถโหลดประวัติ: '+esc(e.message||e)+'</p>';}finally{working=false}
}
 window.cnmiV630History={render};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v630-staff-pdf-confirm-history.js failed",__cnmiPatchError); }
/* ===== END patch-v630-staff-pdf-confirm-history.js ===== */

/* ===== BEGIN patch-v631-admin-pdf-corrections.js ===== */
try {
/* v631 - Admin correction ledger on sent HR PDF batches. Never edits original PDF or snapshot. */
(()=>{'use strict';if(window.__CNMI_V631__)return;window.__CNMI_V631__=true;
const state=()=>window.state||{};const db=()=>{try{return (typeof sb!=='undefined'&&sb?.rpc?sb:null)||window.sb||window.supabaseClient||null}catch(_){return window.sb||null}};const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const isAdmin=()=>{try{return (typeof isAdmin==='function'&&isAdmin())||window.isAdmin?.()===true}catch(_){return false}};
let busy=false,last='',lastAt=0;
function getMonth(){const u=new URLSearchParams((location.hash.split('?')[1]||''));return u.get('month')||state().otMenuMonthV369||new Date().toISOString().slice(0,7)}
const notify=s=>{try{window.showToast(s)}catch(_){alert(s)}};
async function render(force=false){if(window.__CNMI_V638_ADMIN_SPLIT__)return;if(busy||state().page!=='ot'||!isAdmin()||String(state().otMenuV369||'')!=='export')return;
const host=document.querySelector('.v369-ot-content');if(!host||!db()?.rpc)return;
const m=getMonth();if(!force&&last===m&&Date.now()-lastAt<12000)return;busy=true;
try{const {data,error}=await db().rpc('admin_list_hr_pdf_v631',{p_month:m});if(error)throw error;if(!host.isConnected)return;
let box=host.querySelector('#v631AdminPdfCorrection');if(!box){box=document.createElement('section');box.id='v631AdminPdfCorrection';box.className='card v631-panel';host.prepend(box)}
const rows=Array.isArray(data)?data:[];
box.innerHTML=`<h3>ตรวจยอด PDF หลังส่ง HR — แก้ไขและติดตามการยืนยัน</h3><p class="muted">รอบ ${esc(m)} • เฉพาะ PDF ที่ยืนยันส่ง HR แล้ว • ยอดเดิมและ Snapshot ไม่ถูกแก้ • ช่องแก้ไขใช้เมื่อพบข้อผิดพลาดเท่านั้น</p>`+
(rows.length?`<div class="table-wrap"><table class="v631-table"><thead><tr><th>คน / Batch</th><th>ยอด PDF เดิม</th><th>ยอดปัจจุบัน</th><th>เจ้าหน้าที่ยืนยัน</th><th>แก้ยอด (บาท)</th><th>เหตุผล</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr data-v631-row data-batch="${esc(r.batch_id)}" data-staff="${esc(r.staff_id)}"><td><b>${esc(r.staff_name||r.employee_code)}</b><small>${esc(r.employee_code)} • ${esc(r.batch_id)}</small></td><td>${r.original_pdf_money==null?'—':fmt(r.original_pdf_money)}</td><td><b>${r.current_pdf_money==null?'—':fmt(r.current_pdf_money)}</b>${r.correction_count?`<small>แก้แล้ว ${Number(r.correction_count)} ครั้ง</small>`:''}</td><td><span class="v631-status">${r.confirmation_status==='confirmed'?'ยืนยันแล้ว':r.confirmation_status==='disputed'?'แจ้งยอดไม่ตรง':r.confirmation_status==='reconfirm'?'ต้องยืนยันใหม่':'รอยืนยัน'}</span>${r.confirmed_money==null?'':`<small>ยอดที่น้องนับ ${fmt(r.confirmed_money)}</small>`}</td><td><input data-v631-money type="number" min="0" step="0.01" value="${esc(r.current_pdf_money??'')}" aria-label="ยอด PDF แก้ไข"></td><td><input data-v631-reason placeholder="เหตุผลที่แก้ (อย่างน้อย 5 ตัวอักษร)" aria-label="เหตุผล"></td><td><button type="button" data-v631-save ${r.current_pdf_money==null?'disabled':''}>บันทึกแก้ไข</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">ยังไม่มีรอบ PDF ที่ยืนยันส่ง HR สำหรับเดือนนี้ กรุณาทำขั้นตอนตรวจ PDF เดิมก่อน</p>')+
'<p class="muted">ส่วนต่างจะสร้างรายการปรับย้อนหลังสถานะรอดำเนินการในรอบถัดไป (Admin ต้องตรวจสอบยอดที่ไฟล์ Export รอบถัดไปอีกครั้งก่อนส่ง HR) และเจ้าหน้าที่ต้องยืนยันยอดแก้ไขใหม่</p>';
last=m;lastAt=Date.now();}catch(e){const host2=document.querySelector('.v369-ot-content');if(host2&&!host2.querySelector('#v631AdminPdfCorrection')){const box=document.createElement('section');box.id='v631AdminPdfCorrection';box.className='card v631-panel';host2.prepend(box)}const box=host2?.querySelector('#v631AdminPdfCorrection');if(box)box.textContent='ระบบแก้ยอด PDF: กรุณาติดตั้ง SQL V631 ก่อนใช้งาน ('+String(e.message||e)+')';}finally{busy=false}}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-v631-save]');if(!b)return;const r=b.closest('[data-v631-row]'),input=r.querySelector('[data-v631-money]'),reason=r.querySelector('[data-v631-reason]').value.trim(),amount=Number(input.value);if(!input.value.trim()||!Number.isFinite(amount)||amount<0||Math.round(amount*100)!==amount*100)return notify('กรุณาระบุยอดเงินถูกต้องเป็นทศนิยมไม่เกิน 2 ตำแหน่ง');if(reason.length<5)return notify('กรุณากรอกเหตุผลอย่างน้อย 5 ตัวอักษร');if(!confirm(`แก้ยอด PDF ของเจ้าหน้าที่เป็น ${fmt(amount)} บาท และสร้างรายการปรับในรอบถัดไป?`))return;b.disabled=true;try{const {data,error}=await db().rpc('admin_correct_hr_pdf_v631',{p_batch:r.dataset.batch,p_staff:r.dataset.staff,p_new_money:amount,p_reason:reason});if(error)throw error;const result=data?.[0];notify('บันทึกยอดแก้ไขแล้ว • ยอดปรับ '+fmt(result?.adjustment_money)+' บาท รอบ '+(result?.adjustment_month||'ถัดไป'));last='';await render(true)}catch(err){notify('บันทึกไม่สำเร็จ: '+err.message)}finally{b.disabled=false}});
window.cnmiV631AdminCorrections={refresh:()=>{last='';return render(true)}};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v631-admin-pdf-corrections.js failed",__cnmiPatchError); }
/* ===== END patch-v631-admin-pdf-corrections.js ===== */

/* ===== BEGIN patch-v632-staff-summary-real-duty-counts.js ===== */
try {
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
function visiblePanel(panel,kind){if(!panel)return;panel.dataset.v632Screen=kind;panel.querySelector('.v632-summary')?.removeAttribute('hidden'); if(kind==='staff-summary'){
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
       <div><small>ยอดจากไฟล์ Export (Snapshot ก่อนแก้ไข)</small><strong>${original===null?'ตรวจสอบไม่ได้':fmtMoney(original)+' ฿'}</strong></div>
       <div class="v641-final"><small>ยอดรวมที่ Admin เสนอส่งเบิก HR (รวมเบิกพิเศษ)</small><strong>${fmtMoney(final)} ฿</strong></div>
     </div>
     <p class="v668-explainer">เปรียบเทียบยอดที่ระบบบันทึกตอน Export กับยอดที่ Admin กรอกเสนอส่ง HR • ตัวเลขทั้งสองอาจต่างกันได้หากมีฉบับแก้ไข</p>
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
       <div class="v632-values v641-values"><div><small>ยอดจากไฟล์ Export (Snapshot)</small><strong>${fmtMoney(base)} ฿</strong></div><div class="v641-final"><small>ยอดรวมร่างเบิก HR (รวมเบิกพิเศษ)</small><strong>${fmtMoney(amount)} ฿</strong></div></div>
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
 (!records.length?'<div class="v632-wait">ยังไม่มียอดเบิกที่ Admin บันทึกและเปิดให้ยืนยัน สำหรับเดือนนี้</div>':records.map(row=>`<section class="v632-review" data-v632-batch="${esc(row.batch_id)}" data-v632-pdf="${esc(row.pdf_money??'')}"><div class="v632-values"><div><small>ยอดจากไฟล์ Export (Snapshot)</small><strong>${fmtMoney(row.snapshot_money)} ฿</strong></div><div><small>ยอดที่ Admin บันทึกตามเอกสารเดิม</small><strong>${row.pdf_money==null?'ยังไม่บันทึก':fmtMoney(row.pdf_money)+' ฿'}</strong></div></div><p class="v632-status">${row.confirmation_status==='confirmed'?'ยืนยันยอดแล้ว':row.confirmation_status==='disputed'?'แจ้งยอดไม่ตรง — รอ Admin ตรวจสอบ':row.confirmation_status==='reconfirm'?'ยอดถูกแก้ไขแล้ว — โปรดยืนยันใหม่':'รอตรวจสอบและยืนยันยอด'}</p><label>ยอดที่ฉันตรวจนับ (บาท)<input data-v632-amount type="number" min="0" step="0.01" inputmode="decimal" value="${esc(row.confirmation_status==='reconfirm'?(row.pdf_money??''):(row.staff_counted_money??row.pdf_money??''))}"></label><label>หมายเหตุหากยอดไม่ตรง<input data-v632-note placeholder="บอกวันที่ OT หรือเหตุผลที่ไม่ตรง" value="${esc(row.confirmation_note||'')}"></label><div class="v632-actions"><button type="button" data-v632-submit="confirmed" ${row.pdf_money==null?'disabled':''}>✓ ยืนยันยอดถูกต้อง</button><button type="button" data-v632-submit="disputed" ${row.pdf_money==null?'disabled':''}>ยอดไม่ตรง / ให้ Admin ตรวจสอบ</button></div></section>`).join(''));
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
 let baseError=base.status==='rejected'?base.reason?.message:baseResult?.error?.message;
 const revisionError=latest.status==='rejected'?latest.reason?.message:latestResult?.error?.message;
 const revision=revisionError?null:latestResult?.data;
 const previewReply=previewResult.status==='fulfilled'?previewResult.value:null;
 const previewError=previewResult.status==='rejected'?previewResult.reason?.message:previewReply?.error?.message;
 const preview=previewError?null:previewReply?.data;
 // V668: A revision may be available even if the older PDF-review RPC has no Snapshot.
 // Query the authoritative locked export snapshot only in that missing case.
 // Never substitute today's recalculation or an Admin-entered amount for Snapshot.
 let reviewRows=Array.isArray(baseResult?.data)?baseResult.data:[];
 const hasLocked=reviewRows.some(row=>row?.snapshot_money!==null&&row?.snapshot_money!==undefined&&row?.snapshot_money!==''&&Number.isFinite(Number(row.snapshot_money)));
 if((revision?.id||preview?.is_draft)&&!hasLocked){
   try{
     const fallback=await db.rpc('get_my_ot_export_snapshot_v533',{p_month:month});
     const s=Array.isArray(fallback?.data)?fallback.data[0]:null;
     if(!fallback?.error&&s&&s.money!==null&&s.money!==undefined&&s.money!==''&&Number.isFinite(Number(s.money))){
       reviewRows=[{...reviewRows[0],snapshot_money:Number(s.money)}];
       baseError=null;
     }
   }catch(err){console.warn('[v668] locked HR snapshot fallback unavailable',err?.message||err)}
 }
 if(token!==seq||!card.isConnected||screen()!=='staff-summary'||nowMonth()!==month)return;
 // Never silently confirm a legacy value if revision/preview state cannot be checked.
 card.innerHTML=reviewMarkup(reviewRows,baseError,revision,revisionError,preview,previewError);
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
async function tick(force=false){const kind=screen(),panel=host();if(!kind){
 // V668: restore other OT screens when returning from Staff summary.
 if(panel){delete panel.dataset.v632Screen;Array.from(panel.children).forEach(child=>child.classList.remove('v632-suppressed'));panel.querySelector('.v632-summary')?.setAttribute('hidden','');}
 return;
 }if(!panel)return;const m=nowMonth(),signature=kind+'|'+m;if(busy||(!force&&signature===key&&Date.now()-stamp<14000))return;key=signature;stamp=Date.now();busy=true;try{if(kind==='staff-summary')await renderSummary(panel,m,force);else renderDetails(panel,m)}catch(e){console.warn('[v632]',e)}finally{busy=false}}
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
} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v632-staff-summary-real-duty-counts.js failed",__cnmiPatchError); }
/* ===== END patch-v632-staff-summary-real-duty-counts.js ===== */

/* ===== BEGIN patch-v634-ot-reconcile.js ===== */
try {

/* v634: independent, read-only explanation card; does not alter archived snapshots. */
(()=>{if(window.__CNMI_V634__)return;window.__CNMI_V634__=true;
const current=()=>{const s=window.state||{};return s.page==='ot' && s.otMenuV369==='staff-details'};
const fmt=n=>Number(n).toLocaleString('th-TH',{maximumFractionDigits:2});
function update(){if(!current())return;const host=document.querySelector('.v369-ot-content');if(!host)return;
const text=host.innerText||'';const a=text.match(/รอบนี้เคย Export แล้ว\s*([\d,.]+)\s*ชม\.\s*[•·]\s*([\d,.]+)\s*บ/);
const b=text.match(/คำนวณเป็นเงินจากยอดเบิก\s*([\d,.]+)\s*บ/);
const snap=a?Number(a[2].replace(/,/g,'')):NaN,base=b?Number(b[1].replace(/,/g,'')):NaN;
let c=host.querySelector('#v634Breakdown');if(!c){c=document.createElement('section');c.id='v634Breakdown';c.className='card v634-breakdown';host.prepend(c)}
if(!Number.isFinite(snap)||!Number.isFinite(base)){c.hidden=true;return}c.hidden=false;
const delta=Math.round((snap-base)*100)/100;
const html='<h3>ยอดที่ Export ไปแล้ว — แยกที่มา</h3><div class="v634-rows"><div><span>ยอด OT คำนวณเดือนนี้</span><b>'+fmt(base)+' บาท</b></div><div><span>ส่วนต่างจากยอด Export (ต้องตรวจรายการตกเบิก/ปรับยอด)</span><b>'+((delta>=0)?'+':'')+fmt(delta)+' บาท</b></div><div><strong>ยอด Snapshot ที่ Export แล้ว</strong><strong>'+fmt(snap)+' บาท</strong></div></div><p>ส่วนต่างเป็นเพียงผลต่างระหว่างยอดเดือนนี้กับ Snapshot ไม่ถือเป็นหลักฐานว่าเป็น OT ตกเบิกทั้งหมด กรุณาตรวจตารางประวัติปรับย้อนหลังด้านล่าง</p>';if(c.innerHTML!==html)c.innerHTML=html;
}
window.addEventListener('hashchange',()=>setTimeout(update,700));/* v635: stop polling */setTimeout(update,1300);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v634-ot-reconcile.js failed",__cnmiPatchError); }
/* ===== END patch-v634-ot-reconcile.js ===== */

/* ===== BEGIN patch-v636-fast-ot-confirm-navigation.js ===== */
try {
/* v636: event-driven mounting of staff summary, OT adjustment history, and Admin PDF entry. */
(()=>{'use strict';if(window.__CNMI_V636__)return;window.__CNMI_V636__=true;
let timeout=0,lastHost=null,lastView='';
function S(){try{return window.state||(typeof state!=='undefined'?state:{})}catch(_){return {}}}
function route(){return String(S().page||'')==='ot'?String(S().otMenuV369||''):''}
function trigger(){clearTimeout(timeout);timeout=setTimeout(()=>{
 const view=route(),host=document.querySelector('.v369-ot-content');if(!host)return;
 const sig=view+'|'+(new URLSearchParams((location.hash.split('?')[1]||'')).get('month')||S().otMenuMonthV369||'');
 if(host!==lastHost||sig!==lastView){lastHost=host;lastView=sig;
  if(view==='staff-summary'||view==='staff-details')window.cnmiV632Summary?.refresh?.();
  if(view==='staff-details'){window.cnmiV529AdjustmentVisibility?.refresh?.();window.cnmiV630History?.render?.()}
  if(view==='export'){window.cnmiV633PdfMenu?.refresh?.();window.cnmiV631AdminCorrections?.refresh?.()}
  window.cnmiV637?.refresh?.();
 }else{
  if(view==='staff-summary'&&!host.querySelector('.v632-summary'))window.cnmiV632Summary?.mount?.();
  if(view==='staff-details'&&!host.querySelector('#v630StaffPdfHistory'))window.cnmiV630History?.render?.();
 }
 },70)}
// Only one observer on the page root, no subtree observer: core replaces route section on navigation.
function init(){trigger();const content=document.getElementById('pageContent');if(content){new MutationObserver(changes=>{
 if(changes.some(x=>[...x.addedNodes].some(n=>n.nodeType===1&&((n.matches?.('.v369-ot-content,.v369-ot-page')||n.querySelector?.('.v369-ot-content'))))))trigger();
 }).observe(content,{childList:true,subtree:true})}}
window.addEventListener('hashchange',()=>{lastView='';trigger()});
document.addEventListener('click',e=>{if(e.target.closest?.('[data-v369-ot-menu],.v633-sidebar-link')){lastView='';trigger()}},true);
document.addEventListener('change',e=>{if(e.target.matches?.('input[type=month],#v633Month')){lastView='';trigger()}},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.cnmiV636={trigger};
})();
} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v636-fast-ot-confirm-navigation.js failed",__cnmiPatchError); }
/* ===== END patch-v636-fast-ot-confirm-navigation.js ===== */

/* ===== BEGIN patch-v637-hr-revision-workflow.js ===== */
try {
/* V637: independently versioned HR draft/revision, staff disputes and replacement Excel. */
(()=>{'use strict';if(window.__CNMI_V637__)return;window.__CNMI_V637__=true;
const state=()=>{try{return window.cnmiV639CoreState?.()||window.state||{}}catch(_){return window.state||{}}};
const db=()=>{try{return (typeof sb!=='undefined'&&sb?.rpc?sb:null)||window.sb||null}catch(_){return window.sb||null}};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const month=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||state().otMenuMonthV369||new Date().toISOString().slice(0,7);
const active=()=>{const h=location.hash||'';const q=new URLSearchParams(h.split('?')[1]||'');return h.startsWith('#/ot?')&&q.get('section')==='hr-claims';};
const isAdmin=()=>{try{const nav=document.getElementById('mainNav');return state().page==='ot'&&!!(window.isAdmin?.()||nav?.textContent?.includes('เมนู Admin'));}catch(_){return false}};
const note=t=>{try{window.showToast(t)}catch(_){alert(t)}};
let workspace=null,loaded='',busy=false,staffLoaded='',staffBusy=false;
const rpc=async(name,args)=>{const client=db();if(!client?.rpc)throw Error('ไม่มีการเชื่อมต่อ Supabase');const {data,error}=await client.rpc(name,args);if(error)throw error;return data};
const getHost=()=>document.querySelector('.v369-ot-content');
const fmtInput=(v)=>Number(v||0).toFixed(2);
const baseRows=w=>(w?.snapshot||[]).map(r=>({staff_id:String(r.staff_id),code:String(r.employee_code||''),name:String(r.name||r.employee_code||''),amount:Number(r.money||0)}));
const makeDraft=w=>w?.draft?{staff_rows:w.draft.staff_rows||[],special_rows:w.draft.special_rows||[]}:w?.revisions?.length?{staff_rows:w.revisions[0].staff_rows||[],special_rows:w.revisions[0].special_rows||[]}:{staff_rows:baseRows(w).map(r=>({staff_id:r.staff_id,amount:r.amount})),special_rows:[]};
let draft=null;
function nav(){} // v638 owns a single sidebar navigation item
function go(on){const s=state();s.hrClaimsModeV640=!!on;location.hash='#/ot?section='+(on?'hr-claims':'hr-export')+'&month='+encodeURIComponent(month())}
function adminSkeleton(){const host=getHost();if(!host)return null;host.classList.toggle('v637-admin-active',!!active());let panel=host.querySelector('#v637Admin');if(!panel){panel=document.createElement('section');panel.id='v637Admin';panel.className='card v637-panel';host.prepend(panel)}panel.hidden=!active();return panel}
function statusText(r){return r?.status==='confirmed'?'ยืนยันแล้ว':r?.status==='disputed'?'ทักท้วง':'รอยืนยันฉบับล่าสุด'}
function renderAdmin(){const p=adminSkeleton();if(!p||!active()||!workspace)return;const w=workspace,rows=baseRows(w),latest=w.revisions?.[0];if(w.no_batch){p.innerHTML='<h3>จัดการยอดเบิก HR / เบิกพิเศษ</h3><p>ไม่พบ Snapshot ที่ Export แล้วในเดือนนี้</p>';return}
const src=rows.map(r=>{const d=draft.staff_rows.find(x=>x.staff_id===r.staff_id)||{};const sp=draft.special_rows.filter(x=>x.staff_id===r.staff_id).reduce((n,x)=>n+Number(x.amount||0),0);const base=Number(d.amount||0)-sp;return `<tr data-v637-staff="${esc(r.staff_id)}"><td><b>${esc(r.name)}</b><small>${esc(r.code)}</small></td><td>${money(r.amount)}</td><td><input type="number" min="0" step="0.01" data-v637-base value="${fmtInput(base)}" aria-label="ยอดเบิกหลัก"></td><td>${money(sp)}</td><td><b data-v637-total>${money(d.amount)}</b></td><td data-v668-diff>${money(Number(d.amount||0)-r.amount)}</td></tr>`}).join('');
const sp=draft.special_rows.map((x,i)=>`<div class="v637-special" data-v637-special="${i}"><select data-v637-person>${rows.map(r=>`<option value="${esc(r.staff_id)}" ${r.staff_id===x.staff_id?'selected':''}>${esc(r.name)}</option>`).join('')}</select><input data-v637-title placeholder="ชื่อรายการ" value="${esc(x.title)}"><input data-v637-amount type="number" step="0.01" min="0" value="${fmtInput(x.amount)}"><input data-v637-reason placeholder="เหตุผล/หลักฐาน" value="${esc(x.reason)}"><button type="button" data-v637-delete>ลบ</button></div>`).join('');
const disputes=(w.disputes||[]).map(x=>`<tr><td>${esc(x.name||x.staff_id)}</td><td>${x.revision_no}</td><td>${money(x.counted_money)}</td><td>${esc(x.note||'')}</td></tr>`).join('');
const hist=(w.revisions||[]).map(r=>`<tr><td>ฉบับ ${r.revision_no}</td><td>${new Date(r.created_at).toLocaleString('th-TH')}</td><td>${esc(r.reason)}</td><td><button data-v637-download="${esc(r.id)}">ดาวน์โหลดสรุปฉบับนี้</button></td></tr>`).join('');
const workStatus=latest?`เปิดให้ Staff ยืนยันแล้ว: ฉบับ ${latest.revision_no} (หากมีแก้ไขใหม่ต้องประกาศใหม่)`:(w.draft?'บันทึกร่างแล้ว — Staff จะเห็นยอดร่าง แต่ยืนยันไม่ได้จนกว่า Admin เปิดยอด':'ยังไม่บันทึกร่าง / ยังไม่เปิดให้ Staff ยืนยัน');
const actions=`<div class="v642-publish-box" id="v642PublishActions"><h3>บันทึกและเปิดยอดให้ Staff ยืนยัน</h3><p class="v642-publish-status">${esc(workStatus)}</p><label>เหตุผลในการสร้างฉบับแก้ไข <input id="v637Reason" placeholder="เช่น เบิกพิเศษเพิ่มเติมก่อนส่ง HR" value=""></label><div class="v637-actions"><button data-v637-save type="button">1. บันทึกร่าง</button><button data-v637-publish type="button">2. สร้างฉบับแก้ไขและเปิดให้ Staff ยืนยัน</button></div><p class="muted">ถ้าเพิ่มเบิกพิเศษเพียงอย่างเดียว ให้บันทึกและประกาศยอดก่อน Staff จึงจะกดยืนยันได้ • การประกาศไม่ใช่การส่งไฟล์ HR</p></div>`;
p.innerHTML=`<div class="v637-head"><div><h2>จัดการยอดเบิก HR / เบิกพิเศษ</h2><p>เดือน ${esc(w.month)} • Batch ${esc(w.batch_id)} • ยังไม่ส่ง HR: ออกฉบับใหม่เพื่อใช้แทนฉบับเดิม</p></div><button data-v637-back>กลับ Export HR</button></div>
<div class="v637-note">เทียบ 2 ยอด: <b>Snapshot</b> คือยอดระบบจากไฟล์ Export ที่ล็อกไว้ • <b>ยอดเบิกหลัก</b> คือยอดที่ Admin กรอกเอง • คอลัมน์ผลต่างรวมเบิกพิเศษแล้ว และไม่มีการเปลี่ยน Snapshot เดิม</div>
${actions}
<h3>ยอดของเจ้าหน้าที่</h3><div class="table-wrap"><table class="v637-table"><thead><tr><th>เจ้าหน้าที่</th><th>Snapshot</th><th>ยอดเบิกหลัก (บาท)</th><th>พิเศษ (บาท)</th><th>ยอดรวมที่เสนอ</th><th>ผลต่างจาก Export</th></tr></thead><tbody>${src}</tbody></table></div>
<h3>รายการเบิกพิเศษ</h3><div id="v637Specials">${sp||'<p class="muted">ยังไม่มีรายการเบิกพิเศษ</p>'}</div><button type="button" data-v637-add>+ เพิ่มรายการเบิกพิเศษ</button>
<h3>รายการที่เจ้าหน้าที่แจ้งยอดไม่ตรง</h3>${disputes?`<div class="table-wrap"><table><thead><tr><th>คน</th><th>ฉบับ</th><th>ยอดที่ตรวจได้</th><th>เหตุผล</th></tr></thead><tbody>${disputes}</tbody></table></div>`:'<p class="muted">ยังไม่มีรายการทักท้วง</p>'}
<h3>ประวัติฉบับแก้ไข (ไม่ลบย้อนหลัง)</h3>${hist?`<div class="table-wrap"><table><thead><tr><th>เลขฉบับ</th><th>เวลา</th><th>เหตุผล</th><th>ไฟล์</th></tr></thead><tbody>${hist}</tbody></table></div>`:'<p class="muted">ยังไม่มีฉบับแก้ไข</p>'}
<label class="v637-option">ไฟล์ Excel ต้นฉบับจาก Export HR (ไม่บังคับ; ใช้ตรวจเทียบก่อนนำไปส่ง HR) <input type="file" id="v637OriginalExcel" accept=".xlsx,.xls"></label>
<p class="v637-note">ไฟล์ที่ดาวน์โหลดจากปุ่มด้านบนเป็น <b>รายงานยอด HR ฉบับแก้ไข</b> พร้อมยอดรายคนและเบิกพิเศษ ไม่ใช่การสร้างตารางลงเวลา HR_OT ใหม่ ดังนั้นต้องนำไปตรวจประกอบกับไฟล์ Export ต้นฉบับก่อนส่ง HR</p>`;
}
async function loadAdmin(force=false){if(!active()||!isAdmin()||busy)return;const m=month();if(!force&&loaded===m&&workspace){if(!document.getElementById('v637Admin')?.querySelector('[data-v637-staff]'))renderAdmin();return}busy=true;let p=adminSkeleton();if(p)p.innerHTML='<h3>จัดการยอดเบิก HR / เบิกพิเศษ</h3><p>กำลังโหลดข้อมูลรอบ Export…</p>';try{workspace=await rpc('admin_hr_workspace_v637',{p_month:m});draft=makeDraft(workspace);loaded=m;renderAdmin()}catch(e){if(p)p.innerHTML='<h3>จัดการยอดเบิก HR</h3><p class="v637-error">'+esc(e.message)+'</p><p>ตรวจว่าได้รัน SQL V637 ใน Supabase แล้ว</p>'}finally{busy=false}}
function readDraft(validate=true){if(!workspace||workspace.no_batch)return null;const staff_rows=[...document.querySelectorAll('#v637Admin [data-v637-staff]')].map(row=>({staff_id:row.dataset.v637Staff,amount:Number(row.querySelector('[data-v637-base]').value||0)}));const special_rows=[...document.querySelectorAll('#v637Admin [data-v637-special]')].map(row=>({staff_id:row.querySelector('[data-v637-person]').value,title:row.querySelector('[data-v637-title]').value.trim(),amount:Number(row.querySelector('[data-v637-amount]').value),reason:row.querySelector('[data-v637-reason]').value.trim()}));for(const r of staff_rows){r.amount=Math.round((r.amount+special_rows.filter(s=>s.staff_id===r.staff_id).reduce((n,s)=>n+s.amount,0))*100)/100}for(const r of staff_rows){if(!Number.isFinite(r.amount)||r.amount<0)throw Error('จำนวนเงินไม่ถูกต้อง')}if(validate)for(const s of special_rows){if(s.title.length<3||s.reason.length<5||!Number.isFinite(s.amount)||s.amount<0)throw Error('เบิกพิเศษต้องมีชื่อรายการ เหตุผล และจำนวนเงิน')}return {staff_rows,special_rows}}
async function saveDraft(){const d=readDraft();if(!d)return;await rpc('admin_save_hr_draft_v637',{p_batch:workspace.batch_id,p_staff_rows:d.staff_rows,p_special_rows:d.special_rows});draft=d;const message=document.querySelector('#v637Admin .v642-publish-status');if(message)message.textContent='บันทึกร่างแล้ว • Staff จะเห็นยอดร่าง (ยังไม่สามารถยืนยันได้)';note('บันทึกร่างสำเร็จ — ต้องสร้างฉบับแก้ไขเพื่อเปิดให้ Staff ยืนยัน')}
async function publish(){const reason=document.getElementById('v637Reason')?.value?.trim()||'';if(reason.length<8)throw Error('ระบุเหตุผลออกฉบับแก้ไขอย่างน้อย 8 ตัวอักษร');if(!confirm('สร้างฉบับแก้ไขใหม่ และให้เจ้าหน้าที่ยืนยันยอดฉบับใหม่?\nกรุณาตรวจไฟล์ Excel ก่อนส่ง HR'))return;await saveDraft();const revision=await rpc('admin_publish_hr_revision_v637',{p_batch:workspace.batch_id,p_reason:reason});note('สร้างฉบับ '+revision.revision_no+' สำเร็จ • เจ้าหน้าที่ต้องยืนยันใหม่');await loadAdmin(true);downloadRevision(revision)}
function downloadRevision(r){if(typeof XLSX==='undefined'){note('ไม่พบไลบรารีสร้าง Excel');return}const staff=baseRows(workspace);const special=r.special_rows||[];const all=(r.staff_rows||[]).map(x=>{const a=staff.find(s=>s.staff_id===x.staff_id)||{};return {'รหัสพนักงาน':a.code||'','ชื่อ':a.name||'','ยอด Snapshot (บาท)':Number(a.amount||0),'เบิกพิเศษ (บาท)':special.filter(s=>s.staff_id===x.staff_id).reduce((v,s)=>v+Number(s.amount||0),0),'ยอดแก้ไขสำหรับ HR (บาท)':Number(x.amount||0),'ส่วนต่าง (บาท)':Number(x.amount||0)-Number(a.amount||0)}});const wb=XLSX.utils.book_new();const sheet=(name,items)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(items.length?items:[{'ข้อมูล':'ไม่มีรายการ'}]),name);sheet('Staff_Total',all);sheet('Special_Claims',special.map(s=>({'รหัสพนักงาน':staff.find(x=>x.staff_id===s.staff_id)?.code||'','เจ้าหน้าที่':staff.find(x=>x.staff_id===s.staff_id)?.name||'','รายการ':s.title,'จำนวนเงิน':Number(s.amount),'เหตุผล':s.reason})));sheet('Revision_History',(workspace.revisions||[]).map(x=>({'ฉบับ':x.revision_no,'วันที่':x.created_at,'เหตุผล':x.reason})));sheet('Read_Me',[{'ประเภท':'รายงานยอดเบิก HR ฉบับแก้ไข','Batch':workspace.batch_id,'ฉบับ':r.revision_no,'ไฟล์ Export เดิม':workspace.original_file,'คำเตือน':'ตรวจเทียบไฟล์ Export ต้นฉบับก่อนส่ง HR; ไม่ได้สร้างตารางลงเวลาฉบับใหม่'}]);XLSX.writeFile(wb,`HR_Revision_${workspace.month}_R${r.revision_no}_REPLACE_BEFORE_SEND.xlsx`)}
async function loadStaff(force=false){if(state().page!=='ot'||state().otMenuV369!=='staff-summary'||staffBusy)return;const m=month();if(!force&&staffLoaded===m)return;staffBusy=true;try{const r=await rpc('my_hr_revision_v637',{p_month:m});const host=getHost();if(!host||state().otMenuV369!=='staff-summary')return;let card=host.querySelector('#v637Staff');if(!r){host.classList.remove('v637-has-revision');if(card)card.remove();staffLoaded=m;return}host.classList.add('v637-has-revision');if(!card){card=document.createElement('section');card.id='v637Staff';card.className='card v637-panel';host.prepend(card)}card.innerHTML=`<h3>ยอด OT ที่หน่วยงานส่งเบิกให้ฉัน</h3><p class="muted">ยอดที่ Admin กรอก • ฉบับแก้ไข ${r.revision_no} • เดือน ${esc(r.month)} • ยังไม่ได้หมายความว่าได้รับเงินแล้ว</p><div class="v637-amount"><span>ยอดส่งเบิกฉบับล่าสุด</span><b>${money(r.amount)} บาท</b></div>${(r.specials||[]).length?'<h4>เบิกพิเศษเพิ่มเติม</h4>'+r.specials.map(s=>`<p>${esc(s.title)} +${money(s.amount)} บาท — ${esc(s.reason)}</p>`).join(''):''}<p><b>สถานะ: ${statusText(r)}</b></p>${r.status==='confirmed'?'<p>ยืนยันยอดฉบับนี้แล้ว</p>':`<label>ยอดที่ตรวจได้ (บาท) <input id="v637StaffCount" type="number" min="0" step="0.01" value="${Number(r.counted_money??r.amount)}"></label><label>รายละเอียดที่ยอดไม่ตรง <input id="v637StaffNote" placeholder="วันที่ OT หรือเหตุผลที่ต้องตรวจสอบ" value="${esc(r.note||'')}"></label><div class="v637-actions"><button data-v637-confirm="${esc(r.id)}">ยืนยันยอดถูกต้อง</button><button data-v637-dispute="${esc(r.id)}">ยอดไม่ตรง / แจ้ง Admin</button></div>`}`;staffLoaded=m}catch(e){const h=getHost();if(h){let card=h.querySelector('#v637Staff');if(!card){card=document.createElement('section');card.id='v637Staff';h.prepend(card)}card.textContent='ข้อมูลฉบับแก้ไข: '+e.message}}finally{staffBusy=false}}
async function submitStaff(button,disputed){const p=button.dataset.v637Confirm||button.dataset.v637Dispute;const val=Number(document.getElementById('v637StaffCount')?.value),comment=document.getElementById('v637StaffNote')?.value.trim()||'';if(!Number.isFinite(val)||val<0)throw Error('กรุณากรอกยอดที่ตรวจได้');if(disputed&&comment.length<5)throw Error('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร');button.disabled=true;try{await rpc('confirm_my_hr_revision_v637',{p_revision:p,p_amount:val,p_status:disputed?'disputed':'confirmed',p_note:comment});note(disputed?'ส่งเรื่องให้ Admin ตรวจสอบแล้ว':'ยืนยันยอดฉบับล่าสุดสำเร็จ');staffLoaded='';await loadStaff(true)}finally{button.disabled=false}}
let next=0;function schedule(){clearTimeout(next);next=setTimeout(()=>{nav();const host=getHost();if(!host)return;if(active()&&isAdmin())loadAdmin();else{host.classList.remove('v637-admin-active');host.querySelector('#v637Admin')?.setAttribute('hidden','')}if(state().otMenuV369==='staff-summary'){host.classList.remove('v637-has-revision');host.querySelector('#v637Staff')?.remove()}else host.classList.remove('v637-has-revision')},140)}
document.addEventListener('click',async e=>{const b=e.target.closest('#v637Sidebar,[data-v637-back],[data-v637-add],[data-v637-delete],[data-v637-save],[data-v637-publish],[data-v637-download],[data-v637-confirm],[data-v637-dispute]');if(!b)return;if(b.id==='v637Sidebar'){e.preventDefault();go(true);schedule();return}if(b.hasAttribute('data-v637-back')){go(false);schedule();return}if(b.hasAttribute('data-v637-add')){const r=baseRows(workspace)[0];if(!r)return;const d=readDraft(false);d.special_rows.push({staff_id:r.staff_id,title:'',amount:0,reason:''});draft=d;renderAdmin();return}if(b.hasAttribute('data-v637-delete')){const idx=Number(b.closest('[data-v637-special]').dataset.v637Special);const d=readDraft(false);d.special_rows.splice(idx,1);draft=d;renderAdmin();return}try{if(b.hasAttribute('data-v637-save')){await saveDraft();return}if(b.hasAttribute('data-v637-publish')){b.disabled=true;await publish();return}if(b.hasAttribute('data-v637-download')){const r=workspace.revisions.find(x=>x.id===b.dataset.v637Download);if(r)downloadRevision(r);return}if(b.hasAttribute('data-v637-confirm')||b.hasAttribute('data-v637-dispute')){await submitStaff(b,b.hasAttribute('data-v637-dispute'));return}}catch(err){note(err.message||String(err))}finally{if(b.hasAttribute('data-v637-publish'))b.disabled=false}},true);
function recalcLive(){try{const d=readDraft(false);document.querySelectorAll('#v637Admin [data-v637-staff]').forEach(row=>{const id=row.dataset.v637Staff;const extra=d.special_rows.filter(x=>x.staff_id===id).reduce((sum,x)=>sum+Number(x.amount||0),0);const cells=row.querySelectorAll('td');if(cells[3])cells[3].textContent=money(extra);row.querySelector('[data-v637-total]').textContent=money(d.staff_rows.find(x=>x.staff_id===id)?.amount);const diff=row.querySelector('[data-v668-diff]');if(diff){const snap=Number(row.cells[1]?.textContent?.replace(/,/g,'')||0);diff.textContent=money(Number(d.staff_rows.find(x=>x.staff_id===id)?.amount||0)-snap)}})}catch(_){}}
document.addEventListener('input',e=>{if(e.target.closest('#v637Admin [data-v637-staff],#v637Admin [data-v637-special]'))recalcLive()});
document.addEventListener('change',e=>{if(e.target.closest('#v637Admin [data-v637-special]'))recalcLive()});
window.addEventListener('hashchange',()=>{loaded='';staffLoaded='';schedule()});document.addEventListener('change',e=>{if(e.target.matches('input[type=month]')){loaded='';staffLoaded='';schedule()}});
document.addEventListener('DOMContentLoaded',schedule,{once:true});if(document.readyState!=='loading')schedule();
window.cnmiV637={refresh:()=>{loaded='';staffLoaded='';schedule()}};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v637-hr-revision-workflow.js failed",__cnmiPatchError); }
/* ===== END patch-v637-hr-revision-workflow.js ===== */

/* ===== BEGIN patch-v638-admin-hr-navigation.js ===== */
try {
/* v638: deterministic Admin OT navigation: Export stays for Export; HR claims opens the versioned v637 workspace. */
(()=>{'use strict';if(window.__CNMI_V638_ADMIN_SPLIT__)return;window.__CNMI_V638_ADMIN_SPLIT__=true;
const S=()=>{try{return window.cnmiV639CoreState?.()||window.state||{}}catch(_){return window.state||{}}};
const params=()=>new URLSearchParams((location.hash.split('?')[1]||''));
const active=()=>params().get('section')==='hr-claims';
const mm=()=>params().get('month')||String(S().otMenuMonthV369||new Date().toISOString().slice(0,7)).slice(0,7);
const admin=()=>{const nav=document.getElementById('mainNav');return S().page==='ot'&&S().otMenuV369==='export'&&!!(window.isAdmin?.()||nav?.textContent?.includes('เมนู Admin'));};
let lastHost=null,sidebarTimer=0,pageTimer=0;
function openClaims(){const month=mm();S().hrClaimsModeV640=true;const target='#/ot?section=hr-claims&month='+encodeURIComponent(month);if(location.hash!==target)location.hash=target;else syncPage();setTimeout(()=>{window.cnmiV637?.refresh?.();syncPage()},130)}
function openExport(){S().hrClaimsModeV640=false;const url='#/ot?section=hr-export&month='+encodeURIComponent(mm());if(location.hash!==url)location.hash=url;else syncPage()}
function syncSidebar(){const nav=document.getElementById('mainNav');if(!nav)return;const exp=nav.querySelector('[data-v523-ot-item="export"]');if(!exp){document.getElementById('v638HrClaims')?.remove();return}
 let item=nav.querySelector('#v638HrClaims');if(!item){item=document.createElement('button');item.type='button';item.id='v638HrClaims';item.className='v523-subitem v638-hr-menu';item.setAttribute('data-v638-open','1');item.innerHTML='<span class="v523-branch-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 3h10l3 3v15H4V3zM8 11h8M8 15h5M8 19h5"/></svg></span><span>จัดการยอดเบิก HR / เบิกพิเศษ</span>';exp.insertAdjacentElement('afterend',item)}
 else if(item.previousElementSibling!==exp)exp.insertAdjacentElement('afterend',item);
 exp.classList.toggle('active',!active());exp.setAttribute('aria-current',active()?'false':'page');
 item.classList.toggle('v638-selected',active());item.setAttribute('aria-current',active()?'page':'false');
}
function syncPage(){const host=document.querySelector('.v369-ot-content');if(!host||!admin())return;const isWorkspace=active();host.classList.toggle('v638-admin-workspace',isWorkspace);host.classList.toggle('v638-admin-export',!isWorkspace);
 let n=host.querySelector(':scope > #v638Entry');if(isWorkspace){n?.remove();if(!host.querySelector('#v637Admin')){let panel=document.createElement('section');panel.id='v637Admin';panel.className='card v637-panel';panel.innerHTML='<h3>จัดการยอดเบิก HR / เบิกพิเศษ</h3><p>กำลังโหลดข้อมูลรอบ Export…</p>';host.prepend(panel);window.cnmiV637?.refresh?.()}return}
 if(!n){n=document.createElement('section');n.className='v638-entry';n.id='v638Entry';n.innerHTML='<div><strong>กรอกยอด HR / เบิกพิเศษ / แก้ไขยอดที่ทักท้วง</strong><small>กรอกยอดที่ Admin ส่งเบิกและสร้างฉบับแก้ไขในเมนูแยก ไม่ต้องเลื่อนในหน้า Export</small></div><button type="button" data-v638-open>เปิดหน้าจัดการยอด</button>';host.prepend(n)}
 host.querySelector('#v533PdfReviewCard')?.setAttribute('hidden','');host.querySelector('#v631AdminPdfCorrection')?.setAttribute('hidden','')}
function schedulePage(){clearTimeout(pageTimer);pageTimer=setTimeout(()=>{syncSidebar();syncPage()},150)}
function watch(){const nav=document.getElementById('mainNav');if(nav){new MutationObserver(muts=>{if(muts.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&n.id!=='v638HrClaims'&&!n.closest?.('#v638HrClaims')))){clearTimeout(sidebarTimer);sidebarTimer=setTimeout(syncSidebar,65)}}).observe(nav,{childList:true,subtree:true})}
 const content=document.getElementById('pageContent');if(content){new MutationObserver(muts=>{const h=document.querySelector('.v369-ot-content');if(h!==lastHost){lastHost=h;schedulePage()}}).observe(content,{childList:true,subtree:false});}}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v638-open]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openClaims()},true);
window.addEventListener('hashchange',schedulePage);
document.addEventListener('change',e=>{if(e.target.matches?.('input[type=month]'))schedulePage()},true);
function start(){syncSidebar();syncPage();watch();setTimeout(schedulePage,400)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.cnmiV638={open:openClaims,back:openExport,refresh:schedulePage};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v638-admin-hr-navigation.js failed",__cnmiPatchError); }
/* ===== END patch-v638-admin-hr-navigation.js ===== */

/* ===== BEGIN patch-v643-staff-claim-total.js ===== */
try {
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
  document.dispatchEvent(new CustomEvent('cnmi:v665-snapshot-ready'));
 }catch(err){if(card.isConnected)card.innerHTML='<h3>ยอด OT ที่หน่วยงานเตรียมส่งเบิกให้ฉัน</h3><p>เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาตรวจยอดในหน้าสรุปรายเดือน</p>'}
}
window.cnmiV643Detail={refresh};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v643-staff-claim-total.js failed",__cnmiPatchError); }
/* ===== END patch-v643-staff-claim-total.js ===== */

/* ===== BEGIN patch-v644-month-balance-continuity-speed.js ===== */
try {
/* Staff Planner v644 — roster-planning balance continuity and render cache.
 * Previous month's displayed *planned* cumulative duty/holiday balance is the
 * following month's opening balance. Completed trades are undone only for the
 * fairness baseline; they still affect the operational columns via v338.
 * This patch does not change OT claims, payroll, or confirmed sales.
 */
(function () {
  'use strict';
  const API = window.cnmiV336ContinuousBalance;
  const mod = API && API._test;
  if (!mod || typeof mod.buildBalanceData !== 'function' || window.__CNMI_V644_BALANCE__) return;
  window.__CNMI_V644_BALANCE__ = true;

  const original = mod.buildBalanceData;
  const cache = new Map();
  const MAX_CACHE = 5;
  let computations = 0;
  const norm = x => String(x == null ? '' : x);
  const date = v => {
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  };
  const monthOf = r => date(r?.duty_date).slice(0, 7);
  const monthEnd = key => `${key}-${String(new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate()).padStart(2,'0')}`;
  const prevMonth = key => { const d = new Date(+key.slice(0,4), +key.slice(5,7)-2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const fmtNum = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const resetAt = (person, field) => norm(person?.[field] || '').slice(0,7);
  const isLong = person => { try { return !!isLongTermLeaveStaff(person); } catch (_) { return !!person?.is_long_term_leave || !!person?.maternity_status; } };
  const groupOf = p => norm(p?.staff_type).trim() === 'เคิก' ? 'เคิก' : 'MT';
  const offDays = (id, key, rows) => { try { return fmtNum(calculateDaysOff(id,key,rows)); } catch (_) { return 0; } };
  const fairStats = rows => { try { return calcFairness(rows.filter(r => r?.staff_id)) || {}; } catch (_) { return {}; } };
  const uniqueCurrent = (historyRows, visibleRows, key) => {
    const result = (historyRows || []).filter(r => monthOf(r) !== key);
    const picked = Array.isArray(visibleRows) && visibleRows.some(r => monthOf(r) === key) ? visibleRows : (historyRows || []).filter(r => monthOf(r) === key);
    // Do not erase the current month's DB rows if its lazy page state has not loaded.
    return result.concat(picked.filter(r => r?.staff_id && monthOf(r) === key));
  };
  const staffKey = people => people.map(p => [p.id,p.staff_type,p.is_active,p.roster_enabled,p.balance_reset_at,p.holiday_balance_reset_at,p.is_long_term_leave,p.maternity_status].join('/')).join(';');
  const currentKey = (rows, key) => (rows || []).filter(r => monthOf(r) === key)
    .map(r => [r.id,r.staff_id,r.duty_code,date(r.duty_date)].join('/')).sort().join(';');
  const signature = (people, rows, key, history) => [key,history.loadedThrough,history.assignments?.length,history.trades?.length,
    history.assignments?.[0]?.id,history.assignments?.at(-1)?.id,
    staffKey(people),currentKey(rows,key),history.trades?.at(-1)?.updated_at].join('|');

  function calculateLedger(people, assignments, key, history) {
    const full = uniqueCurrent((history.assignments || []).filter(r => monthOf(r) <= key), assignments, key);
    const baseline = mod.reconstructBaseline(full, history.trades || []);
    const byMonth = new Map();
    const firstAssigned = new Map();
    baseline.forEach(row => {
      const month = monthOf(row), id = norm(row.staff_id);
      if (!id || !/^\d{4}-\d{2}$/.test(month) || month > key) return;
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(row);
      if (!firstAssigned.has(id) || firstAssigned.get(id) > month) firstAssigned.set(id,month);
    });
    // One stable monthly calculation irrespective of which month the UI is showing.
    // Never use a selected-month-only exception in the historical average.
    // Include months without any assignments: those still contribute actual days off.
    const sortedMonths=[];
    let start=[...byMonth.keys()].sort()[0] || key;
    for (let guard=0; start<=key && guard<240; guard++) {
      sortedMonths.push(start);
      const d=new Date(+start.slice(0,4),+start.slice(5,7),1);
      start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }
    const detail = new Map();
    for (const month of sortedMonths) {
      const rows = byMonth.get(month) || [], stat = fairStats(rows);
      const days = new Map(), average = {};
      for (const p of people) days.set(norm(p.id),offDays(p.id,month,rows));
      for (const label of ['MT','เคิก']) {
        const eligible = people.filter(p => groupOf(p) === label && !isLong(p) &&
          // Membership depends on first scheduled month, NEVER on the currently viewed month
          // or on a reset scheduled in the future.
          firstAssigned.has(norm(p.id)) && firstAssigned.get(norm(p.id)) <= month);
        const n = eligible.length;
        average[label] = {
          units:n ? eligible.reduce((acc,p) => acc+fmtNum(stat[norm(p.id)]?.units),0)/n : 0,
          days:n ? eligible.reduce((acc,p) => acc+fmtNum(days.get(norm(p.id))),0)/n : 0
        };
      }
      detail.set(month,{stat,days,average});
    }
    const fixed = new Map();
    for (const person of people) {
      const id = norm(person.id), label = groupOf(person),
        first = firstAssigned.get(id) || key, dutyReset = resetAt(person,'balance_reset_at'),
        holidayReset = resetAt(person,'holiday_balance_reset_at'),
        dutyStart = dutyReset && dutyReset > first ? dutyReset : first,
        holidayStart = holidayReset && holidayReset > first ? holidayReset : first;
      let dutyBalance=0,holidayBalance=0,carry=0,holidayCarry=0, gap=0,holidayGap=0;
      for (const month of sortedMonths) {
        if (month > key) break;
        const d=detail.get(month),avg=d.average[label] || {units:0,days:0};
        const validPublishedMonth = window.cnmiV648PublishedPlan?.isFairnessMonth?.(month) !== false;
        const eligibleMonth = validPublishedMonth && month >= first && !isLong(person);
        const dutyDelta = eligibleMonth ? fmtNum(d.stat[id]?.units)-avg.units : 0;
        const holidayDelta = eligibleMonth ? fmtNum(d.days.get(id))-avg.days : 0;
        if (month === dutyStart) dutyBalance = 0; // explicit Admin reset
        if (month === holidayStart) holidayBalance = 0;
        if (month === key) {
          carry = month >= dutyStart ? dutyBalance : 0;
          holidayCarry = month >= holidayStart ? holidayBalance : 0;
          gap = month >= dutyStart ? dutyDelta : 0;
          holidayGap = month >= holidayStart ? holidayDelta : 0;
        }
        if (month >= dutyStart) dutyBalance += dutyDelta;
        if (month >= holidayStart) holidayBalance += holidayDelta;
      }
      fixed.set(id,{carry,holidayCarry,gap,holidayGap,cumulative:carry+gap,holidayCumulative:holidayCarry+holidayGap});
    }
    return {fixed,detail,baseline,full};
  }

  function correctedBalance(staffList, assignments, key) {
    const history=mod.history;
    if (!history?.ready || history.loadedThrough < monthEnd(key)) return original.apply(this,arguments);
    let list=Array.isArray(staffList) && staffList.length ? staffList : [];
    if(!list.length) {
      try { list=state?.staff||window.state?.staff||[]; } catch(_) { list=window.state?.staff||[]; }
    }
    const stamp=signature(list,assignments,key,history);
    if (cache.has(stamp)) return cache.get(stamp);
    let data;
    try {
      // Construct the rows in one pass rather than running the old all-month
      // calculation first and then redoing the same historical work.
      const people=list.filter(p => p && norm(p.staff_type).trim() !== 'แพทย์');
      const ledger=calculateLedger(people,assignments,key,history);
      const now=ledger.detail.get(key) || {stat:{},days:new Map(),average:{}};
      const currentRows=ledger.full.filter(r => monthOf(r) === key);
      const actual=fairStats(currentRows);
      const plannedRows=ledger.baseline.filter(r => monthOf(r) === key);
      const groups=['MT','เคิก'].filter(label => people.some(p => groupOf(p) === label)).map(label => {
        const avg=now.average[label] || {units:0,days:0};
        const rows=people.filter(p => groupOf(p) === label).map(person => {
          const id=norm(person.id), excluded=isLong(person),
            f=ledger.fixed.get(id) || {carry:0,holidayCarry:0,gap:0,holidayGap:0,cumulative:0,holidayCumulative:0},
            c=actual[id] || {},
            own=plannedRows.filter(r => norm(r.staff_id) === id),
            count=fn => own.filter(fn).length,
            dutyReset=resetAt(person,'balance_reset_at'),
            holidayReset=resetAt(person,'holiday_balance_reset_at');
          let status='สมดุลสะสม',tone='green';
          if(excluded){status='ลาระยะยาว / ไม่คิดหนี้เวร';tone='black';}
          else if(dutyReset===key && Math.abs(f.cumulative)<=0.5){status='เริ่มนับเวรใหม่เดือนนี้';tone='blue';}
          else if(f.cumulative>0.5){status='เวรสะสมมากกว่าเฉลี่ย';tone='orange';}
          else if(f.cumulative< -0.5){status='เวรสะสมน้อยกว่าเฉลี่ย';tone='blue';}
          return {person,excluded,
            current:{total:fmtNum(c.total),units:fmtNum(c.units),hours:fmtNum(c.hours),pay:fmtNum(c.pay),days:excluded?0:offDays(id,key,currentRows)},
            fixed:{...f,dutyReset,holidayReset,status,tone,counts:{total:own.length,
              chbd1:count(r=>r.duty_code==='ชบด1'),chbd2:count(r=>r.duty_code==='ชบด2'),
              chbd3:count(r=>r.duty_code==='ชบด3'),ch3a:count(r=>r.duty_code==='ช3A'),
              ch3b:count(r=>r.duty_code==='ช3B'),ch4:count(r=>norm(r.duty_code).startsWith('ช4')),
              ch9:count(r=>norm(r.duty_code).startsWith('ช9'))}}
          };
        });
        return {label,average:avg.units,rows};
      });
      data={key,groups,startKey:[...ledger.detail.keys()][0]||key};
      computations++;
    } catch(error) {
      console.warn('[v644] Cannot build planned cumulative ledger; showing original calculation', error);
      return original.apply(this,arguments);
    }
    cache.set(stamp,data);
    if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
    return data;
  }
  mod.buildBalanceData=correctedBalance;
  const oldInvalidate=API.invalidate?.bind(API);
  if (oldInvalidate) API.invalidate=function(...args){cache.clear();return oldInvalidate(...args);};
  const oldEnsure=API.ensureHistory?.bind(API);
  if (oldEnsure) API.ensureHistory=function(key,...args){
    if(!mod.history.ready || (key && mod.history.loadedThrough < monthEnd(key))) cache.clear();
    return oldEnsure(key,...args);
  };
  window.cnmiV644Balance={version:'v644',clear:()=>cache.clear(),_test:{calculateLedger,prevMonth,getBuildCount:()=>computations}};
  console.info('[v644] Planned duty/holiday month continuity and memoized balance rendering enabled');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v644-month-balance-continuity-speed.js failed",__cnmiPatchError); }
/* ===== END patch-v644-month-balance-continuity-speed.js ===== */

/* ===== BEGIN patch-v645-outing-leave-lock.js ===== */
try {
/* Staff Planner V645 — Outing dates: prevent newly requested staff leave.
   Existing leave records are preserved. Do not block the separate "ไม่รับเวร" request.
   SQL_V645_OUTING_LEAVE_LOCK.sql is the authoritative server-side guard. */
(() => {
  'use strict';
  if (window.__CNMI_V645_OUTING_LEAVE_LOCK__) return;
  window.__CNMI_V645_OUTING_LEAVE_LOCK__ = true;
  const VERSION = 'V645_OUTING_LEAVE_LOCK';
  const text = value => String(value ?? '').trim();
  const date = value => text(value).slice(0, 10);
  const appState = () => { try { return typeof state !== 'undefined' && state ? state : (window.state || {}); } catch (_) { return window.state || {}; } };
  const dbClient = () => { try { return typeof sb !== 'undefined' && sb ? sb : window.sb; } catch (_) { return window.sb; } };
  const isAdminMode = () => { try { return typeof isAdmin === 'function' ? !!isAdmin() : appState().profile?.role === 'admin'; } catch (_) { return appState().profile?.role === 'admin'; } };
  function thaiDate(key) { try { return typeof formatThaiDate === 'function' ? formatThaiDate(key) : key; } catch (_) { return key; } }
  function isPhysician() {
    const p = appState().profile || {};
    return /แพทย์/.test(text(p.staff_type)) || /physician|doctor/i.test(text(p.role));
  }
  function showBlocked(message) {
    try { window.alert(message); }
    catch (_) { try { if (typeof showToast === 'function') showToast(message); } catch (_) {} }
  }
  function existingLeave(id) { return (appState().leaves || []).find(row => text(row?.id) === text(id)) || null; }
  function remainsWithinExisting(form, current) {
    if (!current) return false;
    const fd = new FormData(form);
    const start = date(fd.get('start_date')), end = date(fd.get('end_date'));
    const newPeriod = text(fd.get('leave_period') || 'เต็มวัน');
    const oldPeriod = text(current.leave_period || 'เต็มวัน');
    const notExpandingPeriod = newPeriod === oldPeriod || (oldPeriod === 'เต็มวัน' && newPeriod.startsWith('ครึ่ง'));
    return start >= date(current.start_date) && end <= date(current.end_date || current.start_date) && notExpandingPeriod && text(fd.get('type')) === text(current.type);
  }
  async function affectedOutings(start, end) {
    const db = dbClient();
    if (!db?.from) throw new Error('ยังไม่สามารถเชื่อมต่อฐานข้อมูลเพื่อตรวจวันออกหน่วยได้');
    const result = await db.from('activity_events')
      .select('id,title,event_type,start_date,end_date')
      .eq('event_type', 'ออกหน่วย')
      .lte('start_date', end).gte('end_date', start)
      .order('start_date', { ascending: true }).limit(100);
    if (result.error) throw result.error;
    return (result.data || []).filter(item => date(item.start_date) <= end && date(item.end_date || item.start_date) >= start);
  }
  async function checkLeave(form) {
    if (!form || isAdminMode() || isPhysician()) return null;
    const fd = new FormData(form);
    const type = text(fd.get('type')).split(':::')[0].trim();
    if (!type || type === 'ไม่รับเวร') return null;
    const start = date(fd.get('start_date'));
    const end = date(fd.get('end_date') || start);
    if (!start || !end || end < start) return null;
    const id = text(appState().editingLeaveId);
    if (id && remainsWithinExisting(form, existingLeave(id))) return null;
    const outings = await affectedOutings(start, end);
    if (!outings.length) return null;
    const old = id ? existingLeave(id) : null;
    // A previously granted date remains valid when edited to a shorter range.
    const blocking = outings.find(event => {
      if (!old) return true;
      return !(start >= date(old.start_date) && end <= date(old.end_date || old.start_date));
    });
    if (!blocking) return null;
    const first = start > date(blocking.start_date) ? start : date(blocking.start_date);
    return `วันที่ ${thaiDate(first)} มีการกำหนดออกหน่วยรับบริจาคเลือดแล้ว\n\nไม่เปิดรับคำขอลาใหม่ในวันออกหน่วย\nคำขอลาที่บันทึกไว้ก่อนหน้านี้ยังคงเดิม\n\nหากมีเหตุจำเป็น เช่น ลาป่วยฉุกเฉิน กรุณาติดต่อหัวหน้าเพื่อบันทึกแทน`;
  }
  function install() {
    let base;
    try { base = window.saveLeave || (typeof saveLeave === 'function' ? saveLeave : null); }
    catch (_) { base = window.saveLeave; }
    if (typeof base !== 'function' || base.__v645OutingLock) return false;
    const wrapped = async function saveLeaveV645(form) {
      try {
        const error = await checkLeave(form);
        if (error) { showBlocked(error); return; }
      } catch (error) {
        // Fail closed: a stale calendar or unavailable network must not bypass the lock.
        showBlocked('ยังตรวจสอบวันออกหน่วยไม่ได้ จึงยังบันทึกคำขอลาใหม่ไม่ได้\nกรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง หรือแจ้งหัวหน้า\n\n' + text(error?.message));
        return;
      }
      return base.apply(this, arguments);
    };
    wrapped.__v645OutingLock = true;
    try { window.saveLeave = saveLeave = wrapped; } catch (_) { window.saveLeave = wrapped; }
    return true;
  }
  function installLeaveFormHint() {
    let base;
    try { base = window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null); }
    catch (_) { base = window.renderLeavePage; }
    if (typeof base !== 'function' || base.__v645OutingHint) return;
    const wrapped = function renderLeavePageV645() {
      const html = base.apply(this, arguments);
      if (typeof html !== 'string' || !html.includes('id="leaveForm"')) return html;
      const hint = '<div class="notice soft-notice wide" style="border-color:#efca83;background:#fff7e6"><b>วันออกหน่วยรับบริจาคเลือด:</b> หลังบันทึกวันออกหน่วยแล้ว เจ้าหน้าที่จะส่งคำขอลาใหม่ในวันนั้นไม่ได้ แต่รายการที่ลามาก่อนยังคงเดิม หากจำเป็นกรุณาติดต่อหัวหน้า</div>';
      return html.replace('<form id="leaveForm" class="form-grid">', '<form id="leaveForm" class="form-grid">' + hint);
    };
    wrapped.__v645OutingHint = true;
    try { window.renderLeavePage = renderLeavePage = wrapped; } catch (_) { window.renderLeavePage = wrapped; }
  }
  // App scripts load in defer order; do not poll or rerender the UI.
  install();
  installLeaveFormHint();
  window.cnmiV645OutingLeaveLock = { checkLeave, affectedOutings, remainsWithinExisting, install };
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v645-outing-leave-lock.js failed",__cnmiPatchError); }
/* ===== END patch-v645-outing-leave-lock.js ===== */

/* ===== BEGIN patch-v647-integer-carryover-ledger.js ===== */
try {
/* Staff Planner v647 — whole-number roster fairness balances.
 * Maintain precise historical arithmetic; quantize cumulative and opening
 * balances at the reporting boundary, deriving the displayed monthly gap
 * as the difference. This avoids month-by-month rounding drift.
 * Does not change duty counts, fractional duty units, OT/payroll or trade data.
 */
(function () {
  'use strict';
  const api = window.cnmiV336ContinuousBalance;
  const mod = api && api._test;
  if (!mod || typeof mod.buildBalanceData !== 'function' || window.__CNMI_V647_INTEGER_BALANCE__) return;
  window.__CNMI_V647_INTEGER_BALANCE__ = true;
  const previous = mod.buildBalanceData;
  // Round positive and negative amounts symmetrically; -0.5 must become -1.
  function whole(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const result = Math.sign(number) * Math.floor(Math.abs(number) + 0.5 + 1e-9);
    return result || 0;
  }
  function integerFixed(f) {
    const carry = whole(f.carry), cumulative = whole(f.cumulative);
    const holidayCarry = whole(f.holidayCarry), holidayCumulative = whole(f.holidayCumulative);
    let status = f.status, tone = f.tone;
    if (!/ลาระยะยาว/.test(String(status || ''))) {
      if (/เริ่มนับเวรใหม่/.test(String(status || '')) && cumulative === 0) {
        status = 'เริ่มนับเวรใหม่เดือนนี้'; tone = 'blue';
      } else if (cumulative > 0) {
        status = 'เวรสะสมมากกว่าเฉลี่ย'; tone = 'orange';
      } else if (cumulative < 0) {
        status = 'เวรสะสมน้อยกว่าเฉลี่ย'; tone = 'blue';
      } else {
        status = 'สมดุลสะสม'; tone = 'green';
      }
    }
    return {
      ...f, status, tone,
      carry, cumulative, gap: cumulative - carry,
      holidayCarry, holidayCumulative, holidayGap: holidayCumulative - holidayCarry
    };
  }
  function integerBalance(staffList, assignments, key) {
    const data = previous.apply(this, arguments);
    // V644 caches the original data. NEVER mutate its raw floats or we lose
    // the precise month-to-month continuity when navigating between months.
    if (!data || !Array.isArray(data.groups)) return data;
    return {
      ...data,
      groups: data.groups.map(group => ({
        ...group,
        rows: (group.rows || []).map(row => ({...row, fixed: integerFixed(row.fixed || {})}))
      }))
    };
  }
  mod.buildBalanceData = integerBalance;
  window.cnmiV647IntegerBalance = {
    version: 'v647', whole,
    _test: {integerFixed, integerBalance}
  };
  console.info('[v647] Whole-number carryovers and cumulative balances enabled');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v647-integer-carryover-ledger.js failed",__cnmiPatchError); }
/* ===== END patch-v647-integer-carryover-ledger.js ===== */

/* ===== BEGIN patch-v648-published-plan-snapshots.js ===== */
try {
/* CNMI Staff Planner v650 — versioned monthly plans confirmed by Admin publication.
 * Requires roster_plan_snapshots SQL migration; never stores authoritative baselines
 * in localStorage. Existing published months without snapshots remain LEGACY estimates.
 * Trades/OT continue to use live roster_assignments; only fairness baselines use snapshots.
 */
(function () {
  'use strict';
  const API = window.cnmiV336ContinuousBalance;
  const mod = API && API._test;
  if (!mod || typeof mod.reconstructBaseline !== 'function' || window.__CNMI_V648_PUBLISHED_PLANS__) return;
  window.__CNMI_V648_PUBLISHED_PLANS__ = true;
  const previousReconstruct = mod.reconstructBaseline;
  const published = new Map();
  let loaded = false, loading = null, lastError = '';
  const norm = v => String(v == null ? '' : v);
  const month = v => norm(v).slice(0, 7);
  const S = () => { try { return state || window.state || {}; } catch (_) { return window.state || {}; } };
  const DB = () => { try { return sb || window.sb || null; } catch (_) { return window.sb || null; } };
  const isAdmin = () => norm(S()?.profile?.role).toLowerCase() === 'admin';
  function invalidate() {
    try { window.cnmiV644Balance?.clear?.(); } catch (_) {}
    try { API.invalidate?.(); } catch (_) {}
  }
  function alertUser(message) {
    try { (window.showToast || showToast)(message); }
    catch (_) { console.warn('[v648]', message); }
  }
  async function load(force = false) {
    if (loading) {
      if (!force) return loading;
      // A forced read after saving must never reuse an in-flight *older*
      // read; otherwise successful re-publication displays the old snapshot.
      await loading;
    }
    if (loaded && !force) return published;
    const db = DB();
    if (!db || !S()?.profile) return published;
    loading = (async () => {
      try {
        const found = new Map();
        // A month is a single row. Paging protects installations with >1000 months.
        for (let offset = 0; offset < 3000; offset += 500) {
          const res = await db.from('roster_plan_snapshots')
            .select('month_key,assignments,published_at').order('month_key').range(offset, offset + 499);
          if (res.error) throw res.error;
          const list = Array.isArray(res.data) ? res.data : [];
          list.forEach(row => {
            if (/^\d{4}-\d{2}$/.test(norm(row.month_key)) && Array.isArray(row.assignments)) {
              found.set(row.month_key, row);
            }
          });
          if (list.length < 500) break;
        }
        published.clear();
        for (const [k,v] of found) published.set(k,v);
        loaded = true;
        lastError = '';
        window.cnmiV644Balance?.clear?.();
        try { window.renderPage?.(); } catch (_) {}
      } catch (error) {
        lastError = norm(error?.message || error);
        console.warn('[v648] Published-plan snapshot load failed:', error);
        // No write, and no fabricated snapshot, when the SQL migration is missing.
      } finally { loading = null; }
      return published;
    })();
    return loading;
  }
  function planRows(row) {
    return (row?.assignments || []).filter(a => a && /^\d{4}-\d{2}-\d{2}$/.test(norm(a.duty_date)))
      .map(a => ({ id:a.id || null, duty_date:a.duty_date, duty_code:a.duty_code, staff_id:a.staff_id || null }));
  }
  // v652: Keep the holiday-calendar used for the published plan in the same
  // JSONB snapshot. Metadata rows intentionally have no duty_date: the
  // assignment ledger ignores them, so no SQL migration is required.
  const CALENDAR_KIND = 'cnmi_published_holiday_calendar_v652';
  function calendarFor(row) {
    const meta = (row?.assignments || []).find(x => x && x._cnmi_meta === CALENDAR_KIND);
    return Array.isArray(meta?.dates) ? new Set(meta.dates.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(norm(x)))) : null;
  }
  function isWeekendLocal(day) {
    const parts = norm(day).split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return false;
    const dayOfWeek = new Date(parts[0],parts[1]-1,parts[2],12).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  }
  function countDaysOff(staffId,key,rows,calendar) {
    const [y,m] = key.split('-').map(Number);
    const last = new Date(y,m,0).getDate();
    const hasShift = new Set((rows||[]).filter(a => norm(a?.staff_id) === norm(staffId)).map(a => norm(a?.duty_date).slice(0,10)));
    let days=0;
    for (let d=1; d<=last;d++) {
      const date=`${key}-${String(d).padStart(2,'0')}`;
      if ((isWeekendLocal(date)||calendar.has(date))&&!hasShift.has(date)) days++;
    }
    return days;
  }
  // Null for old snapshots: their holiday calendar was not preserved.
  function publishedDaysOff(staffId,key,rows) {
    const row=published.get(key), calendar=calendarFor(row);
    return !calendar ? null : countDaysOff(staffId,key,rows,calendar);
  }
  let lastPublication = null;
  function summarizeDaysOff(key,former,current) {
    const oldCal=calendarFor(former),newCal=calendarFor(current);
    if (!newCal) return null;
    const people=(S()?.staff||[]).filter(p => p && norm(p.staff_type).trim() !== 'แพทย์' && p.is_active !== false);
    let changed=0;
    for (const p of people) {
      const prev=oldCal ? countDaysOff(p.id,key,planRows(former),oldCal) : null;
      const next=countDaysOff(p.id,key,planRows(current),newCal);
      if (prev!==null && prev!==next) changed++;
    }
    return {month:key, holidayChangedCount:oldCal?changed:null, publishedAt:current?.published_at||null};
  }
  function isFairnessMonth(key) {
    if (published.has(key)) return true;
    const [y,m] = key.split('-').map(Number);
    const record = (S()?.rosterMonths || []).find(r => Number(r.year) === y && Number(r.month) === m);
    return !record || ['published','locked'].includes(norm(record.status)); // Legacy records remain estimates.
  }
  function baseline(assignments, trades) {
    const old = previousReconstruct.apply(this, arguments);
    if (!published.size) return old;
    const status = new Map((S()?.rosterMonths || []).map(r => [`${r.year}-${String(r.month).padStart(2,'0')}`, norm(r.status)]));
    const legacy = old.filter(a => !published.has(month(a.duty_date)) && !['draft','unpublished'].includes(status.get(month(a.duty_date))));
    for (const row of published.values()) legacy.push(...planRows(row));
    return legacy;
  }
  mod.reconstructBaseline = baseline;
  // V644 reads mod.reconstructBaseline at runtime, and V340 accesses this same function.
  // The original reconstructed plans serve as estimates only for pre-v648 months.
  async function takeSnapshot(key, options = {}) {
    const replace = options?.replace === true;
    const db = DB();
    if (!db || !isAdmin() || !/^\d{4}-\d{2}$/.test(key)) return false;
    await load();
    if (lastError) throw new Error('ยังไม่ได้ติดตั้ง SQL_v650_PUBLISHED_PLAN_SNAPSHOTS.sql ใน Supabase');
    if (published.has(key) && !replace) return true; // Do not overwrite by accident / trades.
    const y = Number(key.slice(0,4)), m = Number(key.slice(5,7));
    const last=`${key}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
    const [monthRes, assignedRes, holidayRes] = await Promise.all([
      db.from('roster_months').select('id,status').eq('year',y).eq('month',m).maybeSingle(),
      db.from('roster_assignments').select('id,duty_date,duty_code,staff_id')
        .gte('duty_date',`${key}-01`).lte('duty_date',last).order('duty_date'),
      db.from('public_holidays').select('holiday_date')
        .gte('holiday_date',`${key}-01`).lte('holiday_date',last)
    ]);
    if (monthRes.error) throw monthRes.error;
    if (assignedRes.error) throw assignedRes.error;
    if (holidayRes.error) throw new Error('อ่านวันหยุดราชการที่ใช้ประกาศไม่สำเร็จ: '+norm(holidayRes.error.message||holidayRes.error));
    if (!['published','locked'].includes(norm(monthRes.data?.status))) throw new Error('ตารางเดือนนี้ยังไม่ประกาศ');
    const rows = (assignedRes.data || []).filter(r => r.duty_date && r.duty_code).map(r => ({
      id:r.id, duty_date:r.duty_date, duty_code:r.duty_code, staff_id:r.staff_id || null
    }));
    if (!rows.length) throw new Error('ไม่พบข้อมูลตารางเวรหลังประกาศ จึงยังไม่บันทึกฐานของหัวหน้า');
    let planned = rows;
    // When Admin explicitly publishes a revised plan, undo completed whole
    // sales. A staff trade must never become the new planning baseline.
    if (replace || !published.has(key)) {
      const ids = rows.map(r => r.id).filter(Boolean);
      if (ids.length) {
        const tradeRes = await db.from('roster_trade_requests')
          .select('id,status,from_assignment_id,requester_id,receiver_id,note,updated_at,confirmed_at,created_at')
          .eq('status','completed').in('from_assignment_id',ids);
        if (tradeRes.error) throw tradeRes.error;
        // Rewind completed sales only while the current assignee is still
        // their receiver. If a manager manually assigned another person on
        // the same slot, honour that explicit new roster edit at re-publication.
        // Reverse chronological order supports chained completed whole sales.
        planned = rows.map(r => ({...r}));
        const trades = (tradeRes.data || []).slice().sort((a,b) =>
          norm(b.updated_at || b.confirmed_at || b.created_at)
            .localeCompare(norm(a.updated_at || a.confirmed_at || a.created_at)));
        for (const trade of trades) {
          const current = planned.find(r => norm(r.id) === norm(trade.from_assignment_id));
          if (!current || !trade.requester_id || !trade.receiver_id ||
              norm(current.staff_id) !== norm(trade.receiver_id)) continue;
          // v336 reconstructBaseline retains its existing whole-vs-partial
          // trade rules. Never rewind a sold partial shift into the plan.
          planned = previousReconstruct(planned, [trade]);
        }
      }
    }
    const oldSnapshot=published.get(key);
    const dates=[...new Set((holidayRes.data||[]).map(h=>norm(h?.holiday_date).slice(0,10))
      .filter(d=>d.startsWith(key+'-') && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
    const payload = {month_key:key, assignments:[...planned,{_cnmi_meta:CALENDAR_KIND,dates}]};
    if (replace) payload.published_at = new Date().toISOString();
    const {error} = await db.from('roster_plan_snapshots').upsert(payload,
      {onConflict:'month_key', ignoreDuplicates:!replace});
    if (error) throw error;
    await load(true);
    if (lastError) throw new Error('บันทึกฐานประกาศแล้ว แต่โหลดฉบับใหม่ไม่สำเร็จ: '+lastError);
    const saved=published.get(key);
    // A successful HTTP upsert alone does not prove that the value shown to
    // users is the published version. Verify the persisted roster and calendar.
    const sig = rows => JSON.stringify(rows.map(a=>[
      norm(a.id),norm(a.duty_date),norm(a.duty_code),norm(a.staff_id)
    ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const actualDates=calendarFor(saved);
    if (!saved || sig(planRows(saved)) !== sig(planned) ||
        !actualDates || JSON.stringify([...actualDates].sort()) !== JSON.stringify(dates) ||
        (replace && new Date(saved.published_at).getTime() !== new Date(payload.published_at).getTime())) {
      throw new Error('ตรวจสอบฐานประกาศล่าสุดไม่ผ่าน: ฐานข้อมูลยังส่งข้อมูลฉบับเดิม กรุณาลองประกาศใหม่');
    }
    lastPublication=summarizeDaysOff(key,oldSnapshot,saved);
    invalidate();
    return true;
  }
  // v651: The UI's successful save-and-publish handler triggers the replacement
  // immediately *after* its own DB writes finish. Avoid a window-level click
  // poller: the status is already 'published' on a revised publication, so a
  // status poll races the roster edits and incorrectly retains the first plan.
  // Display clear provenance labels without changing operational calculations.
  function renameHeaders(root = document) {
    root.querySelectorAll('.v340-baseline-columns thead th').forEach(th => {
      const names = {
        'เวรตั้งต้น':'เวรตามหัวหน้าประกาศ',
        'วันหยุดตั้งต้น':'วันหยุดตามหัวหน้าประกาศ',
        'ส่วนต่างเวรเดือนนี้':'ส่วนต่างเวรตามแผน',
        'เวรยกมา':'เวรคงค้างยกมา',
        'เวรสะสม':'เวรคงค้างสะสม',
        'วันหยุดยกมา':'วันหยุดคงค้างยกมา',
        'วันหยุดสะสม':'วันหยุดคงค้างสะสม',
        'วันหยุดปัจจุบัน':'วันหยุดตามตารางล่าสุด'
      };
      const old = th.textContent.trim();
      if (names[old]) th.textContent = names[old];
    });
  }
  const priorRender = window.renderBalanceDashboard;
  if (typeof priorRender === 'function') {
    const render = function(...args) {
      if (!loaded && !lastError) {
        load();
        return '<div class="notice soft-notice">กำลังโหลดแผนเวรที่หัวหน้าประกาศ…</div>';
      }
      const html = priorRender.apply(this,args);
      if (lastError && isAdmin()) return '<div class="notice danger-notice">ต้องติดตั้ง SQL ของ v650 เพื่อเก็บยอดตามแผนประกาศอย่างถาวร (ระบบยังแสดงยอดย้อนหลังแบบประมาณอยู่)</div>' + html;
      const key = norm(args[2] || S()?.monthKey).slice(0,7);
      if (!isFairnessMonth(key)) return '<div class="notice soft-notice">เดือนนี้ยังไม่กดบันทึกและประกาศ จึงยังไม่เพิ่มยอดสะสมตามแผนของหัวหน้า</div>' + html;
      if (isAdmin() && !published.has(key)) return '<div class="notice soft-notice">ยอดตามหัวหน้าจัดของเดือนนี้เป็นการประมาณย้อนหลัง เพราะยังไม่มีภาพบันทึก ณ วันที่ประกาศจริง</div>' + html;
      return html;
    };
    window.renderBalanceDashboard = render;
    try { renderBalanceDashboard = render; } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => renameHeaders()).observe(document.getElementById('pageContent') || document.body, {childList:true,subtree:true});
      load();
    }, {once:true});
  } else {
    new MutationObserver(() => renameHeaders()).observe(document.getElementById('pageContent') || document.body, {childList:true,subtree:true});
    load();
  }
  window.cnmiV648PublishedPlan = {
    load,takeSnapshot,baseline,isFairnessMonth,published,publishedDaysOff,
    get lastPublication() { return lastPublication; },
    _test:{planRows,baseline,calendarFor,countDaysOff}
  };
  console.info('[v648] Published plan snapshot ledger enabled');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v648-published-plan-snapshots.js failed",__cnmiPatchError); }
/* ===== END patch-v648-published-plan-snapshots.js ===== */

/* ===== BEGIN patch-v649-published-ledger-continuity-oct-holiday-reset.js ===== */
try {
/* CNMI Staff Planner v649 — published-plan ledger: month N ending = month N+1 opening.
 * No mutation of rosters, trades, payroll or staff records.
 * Management decision: 2026-10-01 starts a NEW HOLIDAY ledger for ALL staff;
 * DUTY ledger is unchanged. Historical published months without an immutable
 * snapshot remain estimates and must never silently become certified records.
 */
(function () {
  'use strict';
  const api = window.cnmiV336ContinuousBalance;
  const mod = api?._test;
  if (!mod || typeof mod.buildBalanceData !== 'function' || window.__CNMI_V649_PUBLISHED_LEDGER__) return;
  window.__CNMI_V649_PUBLISHED_LEDGER__ = true;
  const previous = mod.buildBalanceData;
  const HOLIDAY_START = '2026-10';
  const LEGACY_THROUGH = '2026-10';
  const norm = v => String(v == null ? '' : v);
  const month = v => norm(v).slice(0, 7);
  const numeric = v => Number.isFinite(+v) ? +v : 0;
  const whole = n => { const v = numeric(n); return Math.sign(v) * Math.floor(Math.abs(v) + 0.500000001) || 0; };
  // Median of the published-plan figures, not an arithmetic mean of the group.
  const median = values => {
    const sorted = values.map(numeric).sort((a,b) => a-b);
    const mid = Math.floor(sorted.length/2);
    return !sorted.length ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  };
  const groupOf = p => norm(p?.staff_type).trim() === 'เคิก' ? 'เคิก' : 'MT';
  const validMonth = key => /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  const stateOf = () => { try { return state || window.state || {}; } catch (_) { return window.state || {}; } };
  const publishedApi = () => window.cnmiV648PublishedPlan;
  const monthEnd = key => `${key}-${String(new Date(+key.slice(0,4), +key.slice(5,7), 0).getDate()).padStart(2,'0')}`;
  const nextMonth = key => { const d = new Date(+key.slice(0,4), +key.slice(5,7), 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const firstDate = (p, field) => month(p?.[field]);
  function isExcluded(person) {
    try { return !!isLongTermLeaveStaff(person); }
    catch (_) { return person?.is_long_term_leave === true || person?.maternity_status === true; }
  }
  function statusOf(key) {
    const rosterMonths = stateOf()?.rosterMonths || [];
    const [year, mon] = key.split('-').map(Number);
    const record = rosterMonths.find(r => +r.year === year && +r.month === mon);
    return record ? norm(record.status).toLowerCase() : '';
  }
  function isCreditedMonth(key) {
    const pub = publishedApi();
    if (pub?.published?.has(key)) return true;
    const status = statusOf(key);
    if (status && !['published','locked'].includes(status)) return false;
    // v648+ months without an immutable snapshot cannot be certified. Never
    // accrue from an unpublished month, even if its roster has assignments.
    return key <= LEGACY_THROUGH && (!status || status === 'published' || status === 'locked');
  }
  function completedBaseline(assignments, trades) {
    const pub = publishedApi();
    if (typeof pub?.baseline === 'function') return pub.baseline(assignments, trades);
    return mod.reconstructBaseline(assignments, trades);
  }
  function rosterHistoryFor(key, selected) {
    const h = mod.history || {};
    const saved = (h.assignments || []).filter(r => month(r?.duty_date) <= key);
    // Preserve DB rows if the visible month has not finished lazy loading.
    const hasSelected = (selected || []).some(r => month(r?.duty_date) === key);
    if (!hasSelected) return saved;
    const ids = new Map(saved.filter(r => month(r?.duty_date) !== key)
      .map(r => [norm(r?.id) || `${r?.duty_date}|${r?.duty_code}|${r?.staff_id}`,r]));
    (selected || []).filter(r => month(r?.duty_date) === key).forEach(r =>
      ids.set(norm(r?.id) || `${r?.duty_date}|${r?.duty_code}|${r?.staff_id}`,r));
    return [...ids.values()];
  }
  function getStats(rows) {
    try { return calcFairness((rows || []).filter(r => r?.staff_id)) || {}; }
    catch (_) { return {}; }
  }
  function offDays(id, key, rows) {
    try {
      const stored=publishedApi()?.publishedDaysOff?.(id,key,rows);
      return stored == null ? numeric(calculateDaysOff(id,key,rows)) : numeric(stored);
    } catch (_) { return 0; }
  }
  // Pure ledger builder: every month is computed from that month's published
  // baseline. Unpublished months contribute zero, while carrying forward
  // balances unchanged. Each MONTHLY delta is quantised once to whole units,
  // so displayed ending and next opening are literally identical integers.
  function ledger(people, assignments, trades, key, opts = {}) {
    const eligibleRows = completedBaseline(assignments, trades).filter(r =>
      r?.staff_id && validMonth(month(r.duty_date)) && month(r.duty_date) <= key);
    const grouped = new Map();
    const first = new Map();
    eligibleRows.forEach(r => {
      const k = month(r.duty_date), id = norm(r.staff_id);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(r);
      if (!first.has(id) || first.get(id) > k) first.set(id,k);
    });
    const credited = opts.isCreditedMonth || isCreditedMonth;
    const dayFn = opts.offDays || offDays;
    const statFn = opts.getStats || getStats;
    const starts = [...grouped.keys()].filter(k => credited(k)).sort();
    let cursor = starts[0] || key;
    const openings = new Map();
    people.forEach(p => openings.set(norm(p.id), {duty:0,holiday:0}));
    const results = new Map();
    for (let i = 0; i < 240 && cursor <= key; i++,cursor=nextMonth(cursor)) {
      const rows = credited(cursor) ? grouped.get(cursor) || [] : [];
      const active = !!rows.length && credited(cursor);
      const stats = active ? statFn(rows) : {};
      const perGroup = new Map();
      for (const label of ['MT','เคิก']) {
        // Historical membership is anchored to first planned assignment,
        // not to the month currently viewed or who buys/sells a shift.
        const team = active ? people.filter(p => groupOf(p) === label &&
          !isExcluded(p) && first.has(norm(p.id)) && first.get(norm(p.id)) <= cursor) : [];
        const dutyValues = team.map(p => numeric(stats[norm(p.id)]?.units));
        const holidayValues = team.map(p => dayFn(p.id,cursor,rows));
        perGroup.set(label,{units:median(dutyValues),days:median(holidayValues),
          team: new Set(team.map(p => norm(p.id)))});
      }
      const perPerson = new Map();
      for (const p of people) {
        const id = norm(p.id), average = perGroup.get(groupOf(p));
        const resetDuty = firstDate(p,'balance_reset_at');
        const resetHoliday = firstDate(p,'holiday_balance_reset_at');
        const holidayStart = resetHoliday > HOLIDAY_START ? resetHoliday : HOLIDAY_START;
        const starting = openings.get(id) || {duty:0,holiday:0};
        // A reset applies at the beginning of its target month, never after
        // counting that month's published schedule.
        const dutyCarry = resetDuty === cursor ? 0 : starting.duty;
        const holidayCarry = cursor === HOLIDAY_START || resetHoliday === cursor ? 0 : starting.holiday;
        const member = active && average.team.has(id) && !isExcluded(p);
        const dutyDelta = member && (!resetDuty || cursor >= resetDuty)
          ? whole(numeric(stats[id]?.units) - average.units) : 0;
        const holidayDelta = member && cursor >= holidayStart
          ? whole(dayFn(p.id,cursor,rows) - average.days) : 0;
        // Historic initial months before the group member's first roster
        // have no delta; never assign debt merely because a month has holidays.
        const duty = dutyCarry + dutyDelta;
        const holiday = holidayCarry + holidayDelta;
        openings.set(id,{duty,holiday});
        perPerson.set(id,{carry:dutyCarry,gap:dutyDelta,cumulative:duty,
          holidayCarry,holidayGap:holidayDelta,holidayCumulative:holiday});
      }
      results.set(cursor,{people:perPerson, averages:perGroup, active});
    }
    return results;
  }
  function corrected(staffList, assignments, key) {
    const original = previous.apply(this, arguments);
    if (!original?.groups?.length || !validMonth(key)) return original;
    const h = mod.history || {};
    if (!h.ready || h.loadedThrough < monthEnd(key)) return original;
    const people = original.groups.flatMap(g => g.rows.map(r => r.person)).filter(Boolean);
    if (!people.length) return original;
    const all = rosterHistoryFor(key,assignments);
    // Legacy trades are only used to reconstruct pre-v648 estimates; immutable
    // snapshots, when present, always replace those estimates.
    const result = ledger(people,all,h.trades || [],key).get(key);
    if (!result) return original;
    return {...original, groups:original.groups.map(group => ({
      ...group, average:result.averages.get(group.label)?.units ?? group.average,
      rows:group.rows.map(row => {
        const values = result.people.get(norm(row.person?.id));
        if (!values) return row;
        const resetDuty = firstDate(row.person,'balance_reset_at');
        const status = isExcluded(row.person) ? 'ลาระยะยาว / ไม่คิดหนี้เวร'
          : resetDuty === key && values.cumulative === 0 ? 'เริ่มนับเวรใหม่เดือนนี้'
          : values.cumulative > 0 ? 'เวรสะสมมากกว่าค่ากลาง'
          : values.cumulative < 0 ? 'เวรสะสมน้อยกว่าค่ากลาง' : 'สมดุลสะสม';
        const tone = isExcluded(row.person) ? 'black' : values.cumulative > 0 ? 'orange'
          : values.cumulative < 0 ? 'blue' : 'green';
        return {...row, fixed:{...row.fixed,...values,status,tone}};
      })
    }))};
  }
  mod.buildBalanceData = corrected;
  window.cnmiV649PublishedLedger = {
    version:'v649', HOLIDAY_START, isCreditedMonth, ledger,
    _test:{whole,median,ledger,rosterHistoryFor,isCreditedMonth}
  };
  // Explain the reset and legacy provenance without ever writing or re-publishing
  // a historical roster. In contrast with the per-person DB resets, this is
  // an explicit global fairness-ledger policy applied to everyone at once.
  const priorRender = window.renderBalanceDashboard;
  if (typeof priorRender === 'function') {
    const shown = function(...args) {
      let html = priorRender.apply(this,args);
      const key = month(args[2] || stateOf()?.monthKey);
      if (!validMonth(key)) return html;
      const note = [];
      if (key === HOLIDAY_START) note.push(
        'เริ่มนับยอดวันหยุดยกมาใหม่สำหรับทุกคนตั้งแต่ 1 ต.ค. 2569 = 0 วัน (ไม่กระทบยอดเวร)');
      if (key === nextMonth(HOLIDAY_START)) note.push(
        'ยอดยกมา พ.ย. ต้องเท่ากับยอดสะสม ต.ค. ของแต่ละคน (แยกเวร/วันหยุด และไม่รวมซื้อขาย)');
      if (!isCreditedMonth(key) && key > LEGACY_THROUGH) {
        // A draft (or a post-v648 published month missing its snapshot)
        // cannot truthfully claim an Admin-confirmed baseline. Do not turn
        // zeros/live assignments into a misleading "confirmed" duty plan.
        html = html.replace(/<td class="v340-baseline-cell"><b>[^<]*<\/b><\/td>/g,
          '<td class="v340-baseline-cell" title="ยังไม่มีข้อมูลแผน ณ วันประกาศ"><b>—</b></td>');
        const status = statusOf(key);
        note.push(['published','locked'].includes(status)
          ? 'ตารางนี้ประกาศแล้วแต่ไม่พบภาพแผน ณ วันที่ประกาศในฐานข้อมูล จึงยังไม่นำยอดเดือนนี้ไปคิดสะสม (ตรวจ SQL และสิทธิ์บันทึกก่อน)'
          : 'เดือนนี้ยังไม่กดบันทึกและประกาศ: ยอดยกมาแสดงตามเดือนก่อน แต่ยังไม่เพิ่มผลต่างของเดือนนี้');
      }
      return (note.length ? `<div class="notice soft-notice v649-ledger-note">${note.join(' • ')}</div>` : '') + html;
    };
    window.renderBalanceDashboard = shown;
    try { renderBalanceDashboard = shown; } catch (_) {}
  }
  console.info('[v649] Published monthly whole-number ledger with October holiday restart');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v649-published-ledger-continuity-oct-holiday-reset.js failed",__cnmiPatchError); }
/* ===== END patch-v649-published-ledger-continuity-oct-holiday-reset.js ===== */

/* ===== BEGIN patch-v650-published-median-trade-ledger.js ===== */
try {
/* CNMI Staff Planner v650: operational totals are separate from the published
 * planning ledger. Includes an explicit, administrator-confirmed plan revision.
 * No OT claim, staff pay, or shift-trade record is edited by this patch.
 */
(function () {
  'use strict';
  if (window.__CNMI_V650_PUBLISHED_MEDIAN_TRADE_LEDGER__) return;
  const partial = window.cnmiV338PartialTradeBalance?._test;
  const api = window.cnmiV648PublishedPlan;
  if (!partial || typeof partial.correctedData !== 'function' || !api) return;
  window.__CNMI_V650_PUBLISHED_MEDIAN_TRADE_LEDGER__ = true;
  const original = partial.correctedData;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const norm = v => String(v == null ? '' : v);
  const S = () => { try { return state || window.state || {}; } catch (_) { return window.state || {}; } };
  const month = value => norm(value).slice(0,7);
  const isAdmin = () => norm(S()?.profile?.role).toLowerCase() === 'admin';
  function changeCurrentOnly(staffList,assignments,key) {
    const data = original.apply(this,arguments);
    for (const group of data?.groups || []) for (const row of group.rows || []) {
      const current = row.current || {};
      // These four operational columns are based on the *effective* roster
      // after whole and partial sales (calculated by v338), never on a snapshot.
      const rate = norm(row.person?.staff_type).trim() === 'เคิก' ? 90 : 130;
      current.hours = Math.round(number(current.units) * 8 * 100) / 100;
      current.pay = Math.round(current.hours * rate * 100) / 100;
    }
    return data;
  }
  partial.correctedData = changeCurrentOnly;
  const previousRender = window.renderBalanceDashboard;
  if (typeof previousRender === 'function') {
    const render = function (...args) {
      const html = previousRender.apply(this,args);
      if (!isAdmin() || S()?.page !== 'scheduler') return html;
      const key = month(args[2] || S()?.monthKey);
      const [year, mon] = key.split('-').map(Number);
      const entry = (S()?.rosterMonths || []).find(r => Number(r.year) === year && Number(r.month) === mon);
      if (!['published','locked'].includes(norm(entry?.status).toLowerCase())) return html;
      const hasPlan = api.published?.has(key);
      const message = hasPlan
        ? 'ยอดตามหัวหน้าอ้างอิงประกาศล่าสุด • กด “บันทึกและประกาศ” เพื่อแทนประกาศเดิม • การซื้อขายเวรไม่เปลี่ยนยอดตามแผน'
        : 'เดือนนี้ยังไม่มีภาพแผนที่ยืนยันในฐานข้อมูล • หากเป็นประกาศเดิมให้ตรวจตารางก่อนยืนยันย้อนหลัง';
      return `<div class="notice soft-notice v650-published-plan-actions"><span>${message}</span>${hasPlan?'':` <button type="button" class="tiny-btn soft" data-v650-republish="${key}">ยืนยันตารางประกาศย้อนหลัง</button>`}</div>` + html;
    };
    window.renderBalanceDashboard = render;
    try { renderBalanceDashboard = render; } catch (_) {}
  }
  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-v650-republish]');
    if (!button || !isAdmin() || button.disabled) return;
    const key = norm(button.getAttribute('data-v650-republish'));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return;
    const sameMonth = (S()?.rosterMonths || []).some(r =>
      `${r.year}-${String(r.month).padStart(2,'0')}` === key &&
      ['published','locked'].includes(norm(r.status).toLowerCase()));
    if (!sameMonth) return;
    const confirmMessage = api.published?.has(key)
      ? `ยืนยันว่าหัวหน้าได้แก้และประกาศตารางเดือน ${key} ฉบับใหม่จริงหรือไม่?\n\nระบบจะใช้แผนใหม่นี้แทนฉบับเดิมสำหรับส่วนต่างและยอดสะสมตั้งแต่เดือนนี้ไป (การขายเวรยังไม่เปลี่ยนแผน)`
      : `ต้องตรวจเทียบตารางเดือน ${key} กับฉบับที่หัวหน้าประกาศจริงแล้วเท่านั้น\n\nยืนยันบันทึกภาพแผนที่กำลังแสดงอยู่ใช่หรือไม่?`;
    if (!window.confirm(confirmMessage)) return;
    button.disabled = true;
    try {
      if (!await api.takeSnapshot(key,{replace:true})) throw new Error('ไม่พบภาพแผนที่บันทึกแล้ว');
      try { window.showToast?.(`บันทึกแผนประกาศเดือน ${key} แล้ว ยอดสะสมใช้แผนล่าสุด`); } catch (_) {}
      try { window.renderPage?.(); } catch (_) {}
    } catch (error) {
      const msg = norm(error?.message || error);
      window.alert(`บันทึกแผนประกาศไม่สำเร็จ: ${msg}\nตรวจว่าติดตั้ง SQL v650 และเข้าสู่ระบบสิทธิ์ Admin แล้ว`);
    } finally { button.disabled = false; }
  },true);
  const style = document.createElement('style');
  style.textContent = '.v650-published-plan-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.v650-published-plan-actions .tiny-btn{white-space:normal}';
  document.head.appendChild(style);
  window.cnmiV650PublishedMedianLedger = {_test:{changeCurrentOnly}, version:'v650'};
  console.info('[v650] Published median ledger / operational hours and pay / manual plan revision');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v650-published-median-trade-ledger.js failed",__cnmiPatchError); }
/* ===== END patch-v650-published-median-trade-ledger.js ===== */

/* ===== BEGIN patch-v657-focused-four-fixes.js ===== */
try {
/* CNMI Staff Planner v657 — focused UI fixes on v652 working baseline.
 * 1. Donor appointments appear only for the applied, date-scoped activity search.
 * 2. New leave entries require an explicit leave type; instructions are collapsible.
 * 3. Activity create/search panels occupy the available width.
 * 4. Reload current Slot configurations when entering position pages, reconcile
 *    daily metadata/order, and flag legacy positions without deleting assignments.
 * No schema changes, destructive writes, or global startup/render function replacements.
 */
(function () {
  'use strict';
  if (window.__CNMI_V657_FOCUSED_FOUR_FIXES__) return;
  window.__CNMI_V657_FOCUSED_FOUR_FIXES__ = true;

  const PATCH = 'v657';
  const TYPES = { platelet:'นัดเกล็ดเลือด', group:'หมู่คณะเลือดแดง', mobile:'ออกหน่วยนอกสถานที่' };
  const DONOR_FIELDS = 'id,source_type,title,event_date,start_time,location,contact_name,contact_phone,detail,source_url,is_active';
  let lastDonorKey = '', donorStatus = '', donorRows = [], donorToken = 0;
  let scheduled = false, previousPositionRoute = '', positionRefreshBusy = false;
  let previousPositionArea = null, previousPositionDate = '';

  function stateSafe() {
    try { return typeof state !== 'undefined' && state ? state : (window.state || {}); }
    catch (_) { return window.state || {}; }
  }
  function dbSafe() { try { return typeof sb !== 'undefined' ? sb : window.sb; } catch (_) { return window.sb; } }
  function text(v) { return String(v == null ? '' : v); }
  function dateKey(v) { return text(v).slice(0,10); }
  function keyCode(v) { return text(v).replace(/\s+/g,'').toLowerCase(); }
  function esc(v) { return text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function page() { return text(stateSafe().page); }
  function root() { return document.getElementById('pageContent'); }
  function activeSearch() {
    const s = stateSafe();
    return page()==='activities' && !s.editingActivityId && text(s.v524ActivityView || 'create')==='search';
  }
  function appliedFilters() {
    const s = stateSafe();
    return {
      start:dateKey(s.activityFilterStart),end:dateKey(s.activityFilterEnd),
      type:text(s.activityFilterType),search:text(s.activityFilterSearch).trim()
    };
  }
  function queryDates(f) {
    // A single chosen day is an exact-date query (not an unbounded future range).
    if (f.start && f.end) return { start:f.start,end:f.end };
    const d=f.start || f.end; return { start:d,end:d };
  }
  function donorMatches(row,f) {
    if (!row || row.is_active === false) return false;
    const range=queryDates(f),d=dateKey(row.event_date);
    if (range.start && d < range.start) return false;
    if (range.end && d > range.end) return false;
    if (f.type && TYPES[row.source_type] !== f.type) return false;
    if (f.search && ![row.title,row.location,row.contact_name,row.detail].join(' ').toLocaleLowerCase('th').includes(f.search.toLocaleLowerCase('th'))) return false;
    return true;
  }
  function donorAllowed(f) { return !f.type || Object.values(TYPES).includes(f.type); }
  function donorKey(f) { return JSON.stringify([queryDates(f),f.type,f.search]); }
  function donorCard(f) {
    let message = donorStatus==='loading' ? 'กำลังค้นหานัดตามวันที่เลือก…'
      : donorStatus==='error' ? 'โหลดนัดไม่สำเร็จ ลองกดค้นหาใหม่อีกครั้ง'
      : donorStatus==='limit' ? 'พบรายการจำนวนมาก แนะนำให้ค้นหาเฉพาะวัน'
      : donorRows.length ? 'แสดงเฉพาะนัดตามวันที่ค้นหา' : 'ไม่พบนัดจาก Donor App ในวันที่เลือก';
    const items = donorRows.map(r=>{
      const url=text(r.source_url).startsWith('https://') ? r.source_url : 'https://donor.cnmiblood.com/';
      const meta=[dateKey(r.event_date),r.start_time?text(r.start_time).slice(0,5)+' น.':'',r.location,r.contact_name].filter(Boolean);
      return `<article class="v657-donor-item"><div class="v657-donor-main"><span class="v657-type">${esc(TYPES[r.source_type]||'Donor App')}</span><b>${esc(r.title||'นัดหมาย')}</b><small>${meta.map(esc).join(' · ')}</small></div><a class="tiny-btn" target="_blank" rel="noopener noreferrer" href="${esc(url)}">เปิด Donor App</a></article>`;
    }).join('');
    return `<div class="v657-donor-results"><div class="v657-donor-title"><b>นัดจาก Donor App</b><small>${esc(message)}</small></div>${items || (donorStatus==='loading'?'':`<p class="hint">${esc(message)}</p>`)}</div>`;
  }
  function updateDonorView() {
    const area=root(); if(!area || page()!=='activities') return;
    // v494 always appends an unfiltered multi-month list. Remove only that card;
    // leave calendar/day dashboard Donor events intact.
    area.querySelectorAll('.donor-sync-card:not(.v657-keep)').forEach(el=>el.remove());
    const box=area.querySelector('.activity-list-card,.v397-all-activities');
    if(!box) return;
    const select=box.querySelector('#activityFilterType');
    if(select){
      Object.values(TYPES).forEach(name=>{
        if(!Array.from(select.options).some(o=>o.value===name)){
          const option=document.createElement('option');option.value=name;option.textContent=name+' (Donor App)';select.appendChild(option);
        }
      });
      // Preserve the selected Donor type when the base renderer reconstructs its select.
      if(stateSafe().activityFilterAppliedV398 && text(stateSafe().activityFilterType) && select.value!==stateSafe().activityFilterType)
        select.value=stateSafe().activityFilterType;
    }
    const existing=box.querySelector('.v657-donor-results');
    const f=appliedFilters();
    if (!activeSearch() || stateSafe().activityFilterAppliedV398!==true || !(f.start||f.end) || !donorAllowed(f)) {
      existing?.remove(); return;
    }
    const key=donorKey(f);
    if(key !== lastDonorKey) loadDonor(f,key);
    const html=donorCard(f);
    if(existing) { if(existing.outerHTML!==html) existing.outerHTML=html; }
    else box.insertAdjacentHTML('beforeend',html);
  }
  async function loadDonor(f,key) {
    const token=++donorToken;
    lastDonorKey=key;donorStatus='loading';donorRows=[];
    const client=dbSafe();
    if(!client || !stateSafe().profile) { donorStatus='error';schedule();return; }
    const range=queryDates(f);
    if(range.start > range.end){donorStatus='error';schedule();return;}
    try {
      let q=client.from('donor_app_events').select(DONOR_FIELDS)
        .eq('is_active',true).gte('event_date',range.start).lte('event_date',range.end)
        .order('event_date',{ascending:true}).limit(500);
      const {data,error}=await q;
      if(error)throw error;
      if(token!==donorToken)return;
      const rows=Array.isArray(data)?data:[];
      donorRows=rows.filter(row=>donorMatches(row,f));
      donorStatus=rows.length>=500?'limit':'ready';
    }catch(err){
      if(token!==donorToken)return;
      donorRows=[];donorStatus='error';
      console.warn('['+PATCH+'] Donor date query:',err);
    }
    schedule();
  }
  function resetDonor() { donorToken++;lastDonorKey='';donorStatus='';donorRows=[]; }

  function updateLeave() {
    if(page()!=='leave')return;
    const form=root()?.querySelector('#leaveForm');if(!form)return;
    const select=form.querySelector('select[name="type"]');
    const editing=Boolean(stateSafe().editingLeaveId);
    if(select && !editing && !select.dataset.v657Initialized){
      let placeholder=Array.from(select.options).find(o=>o.value==='');
      if(!placeholder){placeholder=document.createElement('option');placeholder.value='';select.insertBefore(placeholder,select.firstChild);}
      placeholder.textContent='เลือกประเภท';placeholder.disabled=true;
      select.value='';select.required=true;select.dataset.v657Initialized='yes';
    }
    // Existing leave's saved type is never overwritten in edit mode.
    if(form.dataset.v657Compact)return;
    form.dataset.v657Compact='yes';
    const notes=Array.from(form.querySelectorAll('[data-v481-leave-form-note],.v481-leave-form-note'));
    if(notes.length){
      const details=document.createElement('details');details.className='v657-leave-help wide';
      const summary=document.createElement('summary');summary.textContent='ขั้นตอนลาออนไลน์และคำแนะนำ';
      details.appendChild(summary);notes[0].parentNode?.insertBefore(details,notes[0]);
      notes.forEach(note=>details.appendChild(note));
    }
    const quota=form.querySelector('[data-v576-quota-notice]');
    if(quota && !quota.closest('details')){
      const details=document.createElement('details');details.className='v657-leave-help wide';
      const summary=document.createElement('summary');summary.textContent='โควตาไม่รับเวร / วันลา (กดดูรายละเอียด)';
      details.appendChild(summary);quota.parentNode?.insertBefore(details,quota);details.appendChild(quota);
    }
    form.querySelectorAll('.notice.soft-notice.wide').forEach(node=>{
      if(node.closest('details'))return;
      if(/ถ้าวันที่ขอลามีการประกาศตารางตำแหน่งรายวันแล้ว/.test(node.textContent||'')){
        node.textContent='วันที่ประกาศตำแหน่งแล้ว: โปรดแจ้งหัวหน้า/อินชาร์จให้ปรับงาน';
        node.classList.add('v657-short-note');
      }
    });
    const admin=form.querySelector('#leaveStaffSelect')?.closest('label')?.querySelector('.hint');
    if(admin)admin.textContent='Admin บันทึกแทนเจ้าหน้าที่ได้';
  }

  function configuredRowsForDate(date) {
    try {return window.cnmiV381?.rowsForDate?.(date)||[];}catch(_) {return [];}
  }
  function formatPositionWarnings() {
    if(page()!=='positions' && page()!=='positionMonth' && page()!=='positionMonthView') return;
    const area=root();if(!area)return;
    const daily=page()==='positions';
    const card=daily?area.querySelector('.v225-positions-page,.v226-positions-page')
      :area.querySelector('.monthly-position-page,.v225-monthly-position-page');
    if(!card)return;
    let summary=card.querySelector('.v657-slot-check');
    if(!summary){ summary=document.createElement('div');summary.className='v657-slot-check';
      const bar=card.querySelector('.v225-position-toolbar,.v224-month-toolbar,.v225-month-toolbar,.section-title');
      if(bar)bar.insertAdjacentElement('afterend',summary);else card.prepend(summary);
    }
    if(daily){
      const date=dateKey(document.getElementById('positionDateInput')?.value||stateSafe().positionDate);
      const rows=window.__CNMI_V226_DAILY_POSITION_ROWS__ || window.__CNMI_V225_DAILY_POSITION_ROWS__ || [];
      const cfgRows=configuredRowsForDate(date);
      const expected=new Set(cfgRows.map(r=>keyCode(r.code||r.position_code)).filter(Boolean));
      const old=expected.size?rows.filter(r=>!expected.has(keyCode(r.position_code||r.code))):[];
      const missing=expected.size?cfgRows.filter(r=>!rows.some(x=>keyCode(x.position_code||x.code)===keyCode(r.code||r.position_code))):[];
      const count=window.cnmiV379?.targetForDate?.(date);
      const isOuting=!count && cfgRows.length>0;
      const title=cfgRows.length
        ? `${isOuting?'ชุด Slot วันออกหน่วย':`ชุด Slot ${count||cfgRows.length} คน`} · ตั้งค่าไว้ ${cfgRows.length} ตำแหน่ง`
        : 'ยังไม่พบชุด Slot สำหรับวันนี้ — ตรวจการตั้งค่า/วันที่/จำนวนคน';
      const warning=old.length || missing.length;
      const caution=warning?`<strong>แผนที่บันทึกเดิมไม่ตรง ${old.length} ตำแหน่ง${missing.length?` · ขาด ${missing.length} ตำแหน่ง`:''}</strong><small>รายการเดิมยังอยู่ ไม่ลบหรือเปลี่ยนผู้รับผิดชอบอัตโนมัติ กรุณาตรวจสอบก่อนบันทึก/ประกาศ</small>`
        : '<small>รายละเอียดตำแหน่งอ้างอิงจากชุด Slot ที่ตั้งค่า · แผนประกาศเดิมไม่ถูกแก้ไข</small>';
      const html=`<b>${esc(title)}</b>${caution}`;
      if(summary.innerHTML!==html)summary.innerHTML=html;
      summary.classList.toggle('v657-slot-warning',Boolean(warning));
    }else{
      const s=stateSafe();
      const month=dateKey(s.positionMonthKey||s.positionMonthViewKey||s.monthKey).slice(0,7);
      const settings=(s.manualDaySlotSettingsV273||[]).filter(x=>dateKey(x.work_date).slice(0,7)===month);
      const known=new Set(settings.map(x=>Number(x.target_slots)).filter(n=>n>=8&&n<=14));
      const cfg=window.cnmiV224?.currentConfigs?.()||{};
      const configured=[...known].flatMap(n=>cfg.day?.[n]||[]);
      const expected=new Set(configured.map(x=>keyCode(x.code||x.position_code)));
      const previous=(s.positions||[]).filter(x=>dateKey(x.work_date).slice(0,7)===month);
      // A month may legitimately use several sets: compare only days with an explicit setting.
      const old=previous.filter(x=>{
        const setting=settings.find(r=>dateKey(r.work_date)===dateKey(x.work_date));
        if(!setting)return false;
        const rows=cfg.day?.[Number(setting.target_slots)]||[];
        return rows.length && !rows.some(r=>keyCode(r.code||r.position_code)===keyCode(x.position_code||x.code));
      });
      const title=known.size ? `ตั้งค่า Slot ของเดือนนี้: ${[...known].sort((a,b)=>a-b).join(', ')} คน` : 'จำนวน Slot ของแต่ละวันใช้ตามตารางเดือน';
      const html=`<b>${esc(title)}</b>`+(old.length?`<strong>มี ${old.length} ตำแหน่งในแผนเดิมไม่ตรงกับชุด Slot ที่ตั้งไว้</strong><small>ระบบไม่เปลี่ยนแผนที่บันทึกไว้เอง หากต้องการใช้ชุดล่าสุด ให้ตรวจแล้วสร้างแผน/บันทึกใหม่</small>`:'<small>การแก้ชุด Slot ไม่ย้ายคนในแผนรายเดือนที่บันทึกแล้วอัตโนมัติ</small>');
      if(summary.innerHTML!==html)summary.innerHTML=html;
      summary.classList.toggle('v657-slot-warning',old.length>0);
    }
  }
  function refreshPositionRoute() {
    const route=page(),isPosition=['positions','positionMonth','positionMonthView'].includes(route);
    if(!isPosition){previousPositionRoute='';previousPositionArea=null;return;}
    if(previousPositionRoute===route)return;
    previousPositionRoute=route;
    if(positionRefreshBusy || typeof window.cnmiV224?.loadDbConfigs!=='function')return;
    positionRefreshBusy=true;
    Promise.resolve().then(()=>window.cnmiV224.loadDbConfigs(true)).then(()=>{
      window.cnmiV224?.applyConfigsToRuntime?.();
      if(page()===route){
        previousPositionArea=null;
        // Only one re-render per entry, after the asynchronous DB configuration reload.
        try {if(typeof window.renderPage==='function')window.renderPage();}catch(err){console.warn('['+PATCH+'] Slot render:',err);}
      }
    }).catch(err=>console.warn('['+PATCH+'] Slot refresh:',err))
      .finally(()=>{positionRefreshBusy=false;schedule();});
  }
  function updatePositions() {
    if(!['positions','positionMonth','positionMonthView'].includes(page()))return;
    const area=root()?.querySelector('.v225-positions-page,.v226-positions-page');
    const date=dateKey(document.getElementById('positionDateInput')?.value||stateSafe().positionDate);
    if(area && (area!==previousPositionArea || date!==previousPositionDate)){
      previousPositionArea=area;previousPositionDate=date;
      try {window.cnmiV379?.reorderDaily?.(document);}catch(err){console.warn('['+PATCH+'] Slot order:',err);}
      try {window.cnmiV381?.apply?.(document);}catch(err){console.warn('['+PATCH+'] Slot metadata:',err);}
    }
    formatPositionWarnings();
  }
  function sync() {
    scheduled=false;
    try{updateDonorView();}catch(err){console.warn('['+PATCH+'] Donor UI:',err);}
    try{updateLeave();}catch(err){console.warn('['+PATCH+'] Leave UI:',err);}
    try{refreshPositionRoute();updatePositions();}catch(err){console.warn('['+PATCH+'] Position UI:',err);}
  }
  function schedule() {
    if(scheduled)return;
    scheduled=true;
    (window.requestAnimationFrame||((cb)=>setTimeout(cb,16)))(sync);
  }
  function install(){
    const area=root();if(!area)return;
    // Only root child-list replacements trigger the observer; modifications made inside
    // cards by this patch do not trigger it (avoids MutationObserver feedback loops).
    new MutationObserver(schedule).observe(area,{childList:true,subtree:false});
    document.addEventListener('click',e=>{
      if(e.target?.closest?.('[data-activity-filter-reset]')){resetDonor();schedule();}
      if(e.target?.closest?.('[data-activity-filter-apply]')){
        resetDonor();setTimeout(schedule,0);
      }
      if(e.target?.closest?.('[data-page], [data-nav]'))setTimeout(schedule,0);
    },true);
    document.addEventListener('change',e=>{
      if(e.target?.matches?.('#positionDateInput,#positionMonthInput'))schedule();
    },true);
    window.addEventListener('pageshow',schedule);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  window.cnmiV657={version:PATCH,donorMatches,queryDates,resetDonor,sync};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v657-focused-four-fixes.js failed",__cnmiPatchError); }
/* ===== END patch-v657-focused-four-fixes.js ===== */

/* ===== BEGIN patch-v659-physician-status-callable.js ===== */
try {
/* CNMI Staff Planner v659 — Keep physician Consult contact available during activities or leave.
 * Only changes the contact control on Dashboard > แพทย์ Consult.
 * Readiness, duty assignments, leave/activity data and on-call rules stay unchanged.
 */
(() => {
  'use strict';
  const VERSION = 'V659_PHYSICIAN_STATUS_CALLABLE';
  if (window.__CNMI_V659_PHYSICIAN_STATUS_CALLABLE__) return;
  window.__CNMI_V659_PHYSICIAN_STATUS_CALLABLE__ = true;

  const text = value => String(value == null ? '' : value).trim();
  const stateSafe = () => { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } };
  const dateOnly = value => { const d = text(value).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; };
  function selectedDate() {
    try {
      const d = dateOnly(window.cnmiDashboardDateV443?.selectedDate?.()) || dateOnly(stateSafe().dashboardDateV443);
      if (d) return d;
      if (typeof todayStr === 'function') return dateOnly(todayStr());
    } catch (_) { /* use local date */ }
    const now = new Date(), pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  function assignments(date) {
    let m = null;
    try { m = window.cnmiPhysicianConsultV452?.baseForDate?.(date); } catch (_) { /* no schedule loaded */ }
    if (!m) return [];
    return m.weekday ? [
      { id: m.donor, site: 'Donor', time: '08:00–16:00' },
      { id: m.bb, site: 'Blood Bank', time: '08:00–16:00' },
      { id: m.combined, site: 'Donor & BB', time: '16:00–08:00' }
    ] : [{ id: m.combined, site: 'Donor & BB', time: '24 ชม.' }];
  }
  function rowSite(row) {
    if (row.classList.contains('v456-mobile-consult-row'))
      return text(row.querySelector('.v456-mobile-consult-site')?.textContent);
    return text(row.querySelector('td:nth-child(2)')?.textContent);
  }
  function rowTime(row) {
    if (row.classList.contains('v456-mobile-consult-row'))
      return text(row.querySelector('.v456-mobile-consult-time')?.textContent);
    return text(row.querySelector('td:first-child')?.textContent);
  }
  function slotFor(row, index, rows, slots) {
    const site = rowSite(row).toLowerCase();
    const time = rowTime(row);
    if (slots.length === 1) return slots[0];
    if (/donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)/i.test(site) || /16:?00\s*[–-]\s*08:?00|24\s*ชม/i.test(time)) return slots.find(s => s.site === 'Donor & BB') || null;
    if (/blood\s*bank|คลังเลือด/i.test(site)) return slots.find(s => s.site === 'Blood Bank') || null;
    if (/\bdonor\b|ห้องบริจาค/i.test(site)) return slots.find(s => s.site === 'Donor') || null;
    // Fallback only if the displayed table still has the exact number of duty rows.
    return rows.length === slots.length ? slots[index] : null;
  }
  function contactButton(badge, slot, mobile) {
    if (!slot?.id) return;
    if (badge.matches('button[data-v455-doctor-id]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${badge.className} v455-doctor-contact-btn v659-consult-status-call${mobile ? ' v456-mobile-doctor-button' : ''}`;
    button.setAttribute('data-v455-doctor-id', String(slot.id));
    button.setAttribute('data-v455-site', slot.site);
    button.setAttribute('data-v455-time', slot.time);
    button.setAttribute('data-v659-status-call', '1');
    const label = text(badge.textContent);
    button.setAttribute('aria-label', `${label} ดูเบอร์โทรและโทรหาแพทย์`);
    button.title = 'แตะเพื่อดูเบอร์โทรแพทย์ (โทรได้แม้ติดกิจกรรมหรือลา)';
    const caption = document.createElement('span');
    caption.className = 'v659-consult-status-label';
    caption.textContent = label;
    const hint = document.createElement('span');
    hint.className = 'v659-consult-call-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = '☎ โทร';
    button.append(caption, hint);
    badge.replaceWith(button);
  }
  function makeCallable(root, date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return;
    const slots = assignments(date);
    if (!slots.length) return;
    const rowsDesktop = Array.from(card.querySelectorAll('.v452-dashboard-table tbody tr'));
    const rowsMobile = Array.from(card.querySelectorAll('.v456-mobile-consult-row'));
    for (const rows of [rowsDesktop, rowsMobile]) {
      rows.forEach((row, index) => {
        const slot = slotFor(row, index, rows, slots);
        if (!slot?.id) return; // Never invent a doctor contact for an unassigned shift.
        const isMobile = row.classList.contains('v456-mobile-consult-row');
        // Keep all availability and activity classes/text; change only span -> button.
        row.querySelectorAll('span.v512-consult-activity, span.v510-consult-leave').forEach(badge => contactButton(badge, slot, isMobile));
      });
    }
  }
  function decorate(html) {
    if (typeof html !== 'string' || !html.includes('data-v452-physician-card')) return html;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      makeCallable(template.content, selectedDate());
      const holder = document.createElement('div');
      holder.appendChild(template.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] could not decorate dashboard`, err);
      return html;
    }
  }
  const prior = (() => { try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); } catch (_) { return window.renderDashboard || null; } })();
  if (typeof prior === 'function' && !prior.__v659CallableWrapped) {
    const wrapped = function renderDashboardV659() { return decorate(prior.apply(this, arguments)); };
    wrapped.__v659CallableWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }

  const style = document.createElement('style');
  style.id = 'cnmi-v659-consult-contact-style';
  style.textContent = `
    .v659-consult-status-call{appearance:none;-webkit-appearance:none;cursor:pointer;font-family:inherit;max-width:100%;gap:6px;flex-wrap:wrap;text-align:left;touch-action:manipulation;transition:filter .12s ease}
    .v659-consult-status-call:hover{filter:brightness(.96)}
    .v659-consult-status-call:focus-visible{outline:2px solid #1672ad;outline-offset:3px}
    .v659-consult-status-call .v659-consult-status-label{min-width:0;white-space:normal}
    .v659-consult-status-call .v659-consult-call-hint{font-size:.82em;white-space:nowrap;padding:1px 6px;border-radius:999px;border:1px solid currentColor;opacity:.95}
    @media(max-width:760px){.v659-consult-status-call{min-height:44px;padding:10px 12px}}
  `;
  document.head.appendChild(style);
  window.cnmiPhysicianContactV659 = { version: VERSION, makeCallable, decorate, assignments };
  console.info(`${VERSION} loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v659-physician-status-callable.js failed",__cnmiPatchError); }
/* ===== END patch-v659-physician-status-callable.js ===== */

/* ===== BEGIN patch-v660-physician-oncall-readiness.js ===== */
try {
/* CNMI Staff Planner v660 — On-call Consult counts as staffed/ready when a physician is assigned.
 * Applies only to the Dashboard physician Consult readiness numerator.
 * In-hours Donor and Blood Bank still deduct overlapping leave and blocking activities.
 * On-call 16:00–08:00 (or 24h on holidays) counts when assigned, regardless of
 * leave/activity status. Contact buttons and status labels remain untouched.
 * No changes to stored schedules, leave, activity, authentication, or database.
 */
(() => {
  'use strict';
  const VERSION = 'V660_PHYSICIAN_ONCALL_READINESS';
  if (window.__CNMI_V660_PHYSICIAN_ONCALL_READINESS__) return;
  window.__CNMI_V660_PHYSICIAN_ONCALL_READINESS__ = true;

  const text = value => String(value == null ? '' : value).trim();
  const normDate = value => {
    const d = text(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  };
  const safeState = () => {
    try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; }
    catch (_) { return window.state || {}; }
  };
  function selectedDate() {
    try {
      const date = normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(safeState().dashboardDateV443);
      if (date) return date;
      if (typeof todayStr === 'function') return normDate(todayStr());
    } catch (_) { /* fall back to local day */ }
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function assignedSlots(date) {
    let schedule = null;
    try { schedule = window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { /* schedule not available yet */ }
    if (!schedule) return [];
    const oncall = { id: schedule.combined || null, time: schedule.weekday ? '16:00–08:00' : '24 ชม.', oncall: true };
    if (!schedule.weekday) return [oncall];
    return [
      { id: schedule.donor || null, time: '08:00–16:00', oncall: false },
      { id: schedule.bb || null, time: '08:00–16:00', oncall: false },
      oncall
    ];
  }
  function hasActivity(id, date, time) {
    try { return !!window.cnmiPhysicianActivityV512?.physicianActivities?.(id, date, time)?.length; }
    catch (_) { return false; }
  }
  function hasLeave(id, date, time) {
    try { return !!window.cnmiPhysicianDashboardV510?.leaveStatusForTime?.(id, date, time); }
    catch (_) { return false; }
  }
  function calculate(date) {
    const slots = assignedSlots(date);
    let ready = 0, daytimeLeave = false, activity = false;
    slots.forEach(slot => {
      if (!slot.id) return; // No scheduled doctor: never add a ready physician.
      // Show the activity status, but never deduct an assigned on-call duty.
      const blockedActivity = hasActivity(slot.id, date, slot.time);
      if (blockedActivity) activity = true;
      if (slot.oncall) { ready += 1; return; }
      const blockedLeave = hasLeave(slot.id, date, slot.time);
      if (blockedLeave) daytimeLeave = true;
      if (!blockedLeave && !blockedActivity) ready += 1;
    });
    return { ready, total: slots.length, daytimeLeave, activity };
  }
  function apply(root, date) {
    const badge = root.querySelector?.('[data-v452-physician-card] .v452-ready');
    if (!badge) return false;
    const count = calculate(date);
    if (!count.total) return false;
    badge.textContent = `พร้อม ${count.ready}/${count.total}`;
    badge.classList.toggle('is-complete', count.ready === count.total);
    badge.classList.toggle('v510-has-leave', count.daytimeLeave);
    badge.classList.toggle('v512-has-activity', count.activity);
    badge.setAttribute('title', 'นับแพทย์เวรนอกเวลาเมื่อมีผู้รับผิดชอบ แม้มีสถานะประชุม อบรม หรือลา');
    return true;
  }
  function decorate(html) {
    if (typeof html !== 'string' || !html.includes('data-v452-physician-card')) return html;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!apply(template.content, selectedDate())) return html;
      const holder = document.createElement('div');
      holder.appendChild(template.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] readiness display was not changed`, err);
      return html;
    }
  }
  const prior = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof prior === 'function' && !prior.__v660ReadinessWrapped) {
    const wrapped = function renderDashboardV660() { return decorate(prior.apply(this, arguments)); };
    wrapped.__v660ReadinessWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }
  window.cnmiPhysicianReadinessV660 = { version: VERSION, selectedDate, assignedSlots, calculate, apply, decorate };
  console.info(`${VERSION} loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v660-physician-oncall-readiness.js failed",__cnmiPatchError); }
/* ===== END patch-v660-physician-oncall-readiness.js ===== */

/* ===== BEGIN patch-v661-physician-daytime-contact-all-statuses.js ===== */
try {
/* CNMI Staff Planner v661 — Physician Consult phone access in every duty slot.
 * Restores the existing V455 phone popup on daytime consultation rows that
 * older leave/activity decorators rendered as noninteractive text.
 * Preserves the exact displayed activity/leave label and V660 readiness rules.
 * No database, assignments, leave data, login or PWA changes.
 */
(() => {
  'use strict';
  const VERSION = 'V661_PHYSICIAN_DAYTIME_CONTACT_ALL_STATUSES';
  if (window.__CNMI_V661_PHYSICIAN_DAYTIME_CONTACT_ALL_STATUSES__) return;
  window.__CNMI_V661_PHYSICIAN_DAYTIME_CONTACT_ALL_STATUSES__ = true;

  const txt = v => String(v == null ? '' : v).trim();
  const normDate = v => /^\d{4}-\d{2}-\d{2}$/.test(txt(v).slice(0,10)) ? txt(v).slice(0,10) : '';
  const safeState = () => {
    try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; }
    catch (_) { return window.state || {}; }
  };
  function selectedDate() {
    try {
      const selected = normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(safeState().dashboardDateV443);
      if (selected) return selected;
      const q = new URLSearchParams(txt(window.location?.hash).split('?')[1] || '');
      const fromUrl = normDate(q.get('date'));
      if (fromUrl) return fromUrl;
      if (typeof todayStr === 'function') return normDate(todayStr());
    } catch (_) { /* use local date */ }
    const d = new Date(), p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function dutySlots(date) {
    let model = null;
    try { model = window.cnmiPhysicianConsultV452?.baseForDate?.(date) || null; }
    catch (_) { /* schedule not loaded */ }
    if (!model) return [];
    const combined = { id:model.combined || null, site:'Donor & BB', time:model.weekday ? '16:00–08:00' : '24 ชม.' };
    return model.weekday ? [
      { id:model.donor || null, site:'Donor', time:'08:00–16:00' },
      { id:model.bb || null, site:'Blood Bank', time:'08:00–16:00' },
      combined
    ] : [combined];
  }
  function isMobileRow(row) { return row.classList.contains('v456-mobile-consult-row'); }
  function rowSite(row) {
    return txt(isMobileRow(row) ? row.querySelector('.v456-mobile-consult-site')?.textContent
      : row.querySelector('td:nth-child(2)')?.textContent);
  }
  function rowTime(row) {
    return txt(isMobileRow(row) ? row.querySelector('.v456-mobile-consult-time')?.textContent
      : row.querySelector('td:first-child')?.textContent);
  }
  function slotFor(row,index,rows,slots) {
    const site = rowSite(row).toLowerCase(), time = rowTime(row);
    if (slots.length === 1) return slots[0];
    if (/donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)/i.test(site)
      || /16:?00\s*[–-]\s*08:?00|24\s*ชม/i.test(time))
      return slots.find(s => s.site === 'Donor & BB') || null;
    if (/blood\s*bank|คลังเลือด/i.test(site)) return slots.find(s => s.site === 'Blood Bank') || null;
    if (/\bdonor\b|ห้องบริจาค/i.test(site)) return slots.find(s => s.site === 'Donor') || null;
    // Index matching is only safe when the complete roster is present.
    return rows.length === slots.length ? slots[index] : null;
  }
  function contactControl(node,slot,isMobile) {
    if (!slot?.id || !node) return false;
    // V455 and V601 contact controls already work; never replace them.
    if (node.matches('[data-v455-doctor-id],[data-v601-oncall-contact]')) return false;
    if (node.querySelector('button,a[href^="tel:"]')) return false;
    if (node.classList.contains('v452-not-set') || /ยังไม่กำหนด/.test(txt(node.textContent))) return false;
    // A leave/activity badge can be a span or a div depending on renderer.
    const badge = node.matches('.v512-consult-activity,.v510-consult-leave');
    const plainPill = node.matches('.v452-doctor-pill');
    if (!badge && !plainPill) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${node.className} v455-doctor-contact-btn v661-consult-call${isMobile ? ' v456-mobile-doctor-button' : ''}`;
    button.setAttribute('data-v455-doctor-id',String(slot.id));
    button.setAttribute('data-v455-site',slot.site);
    button.setAttribute('data-v455-time',slot.time);
    button.setAttribute('data-v661-consult-call','1');
    // Retain visible name/meeting times and accessibility metadata.
    const label = txt(node.textContent);
    button.setAttribute('aria-label',`${label} ดูเบอร์โทรแพทย์`);
    button.title = `${txt(node.title) ? `${txt(node.title)} · ` : ''}แตะเพื่อดูเบอร์โทรแพทย์`;
    const caption = document.createElement('span');
    caption.className = 'v661-consult-label';
    caption.textContent = label;
    button.appendChild(caption);
    if (badge) {
      const hint = document.createElement('span');
      hint.className = 'v661-consult-call-hint';
      hint.setAttribute('aria-hidden','true');
      hint.textContent = '☎ โทร';
      button.appendChild(hint);
    }
    node.replaceWith(button);
    return true;
  }
  function fixRow(row,slot) {
    if (!slot?.id) return 0;
    const target = isMobileRow(row)
      ? row.querySelector('.v456-mobile-consult-doctor')
      : row.querySelector('td:nth-child(3)');
    if (!target) return 0;
    // Use only the displayed doctor's badge, never assign a contact to an empty duty.
    const missing = target.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill:not([data-v455-doctor-id]):not([data-v601-oncall-contact])');
    return contactControl(missing,slot,isMobileRow(row)) ? 1 : 0;
  }
  function makeCallable(root,date) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return 0;
    const slots = dutySlots(date);
    if (!slots.length) return 0;
    let changed = 0;
    for (const rows of [
      [...card.querySelectorAll('.v452-dashboard-table tbody tr')],
      [...card.querySelectorAll('.v456-mobile-consult-row')]
    ]) {
      rows.forEach((row,index) => { changed += fixRow(row,slotFor(row,index,rows,slots)); });
    }
    return changed;
  }
  function decorate(html) {
    if (typeof html !== 'string' || !html.includes('data-v452-physician-card')) return html;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!makeCallable(template.content,selectedDate())) return html;
      const holder = document.createElement('div');
      holder.appendChild(template.content.cloneNode(true));
      return holder.innerHTML;
    } catch (err) {
      console.warn(`[${VERSION}] dashboard phone contact not changed`,err);
      return html;
    }
  }
  const prior = (() => {
    try { return window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null); }
    catch (_) { return window.renderDashboard || null; }
  })();
  if (typeof prior === 'function' && !prior.__v661ContactWrapped) {
    const wrapped = function renderDashboardV661() { return decorate(prior.apply(this,arguments)); };
    wrapped.__v661ContactWrapped = true;
    try { window.renderDashboard = renderDashboard = wrapped; }
    catch (_) { window.renderDashboard = wrapped; }
  }
  const style = document.createElement('style');
  style.id = 'cnmi-v661-consult-contact-style';
  style.textContent = `
    .v661-consult-call{appearance:none;-webkit-appearance:none;cursor:pointer;font-family:inherit;text-align:left;max-width:100%;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;touch-action:manipulation}
    .v661-consult-call:hover{filter:brightness(.95)}
    .v661-consult-call:focus-visible{outline:2px solid #1672ad;outline-offset:3px}
    .v661-consult-call .v661-consult-label{white-space:normal;min-width:0}
    .v661-consult-call-hint{font-size:.82em;white-space:nowrap;padding:1px 6px;border-radius:999px;border:1px solid currentColor}
    @media(max-width:760px){.v661-consult-call{min-height:44px;padding:9px 11px}}
  `;
  document.head.appendChild(style);
  window.cnmiPhysicianContactV661 = {version:VERSION,selectedDate,dutySlots,makeCallable,decorate};
  console.info(`${VERSION} loaded`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v661-physician-daytime-contact-all-statuses.js failed",__cnmiPatchError); }
/* ===== END patch-v661-physician-daytime-contact-all-statuses.js ===== */

/* ===== BEGIN patch-v662-admin-reopen-ot-month.js ===== */
try {
/* Staff Planner v662 - audited one-transaction reopening of a source month's HR OT exports.
 * Does not mutate data by itself. Requires SQL_V662 admin RPC installed in Supabase.
 * The original locked snapshots are NEVER deleted or edited.
 */
(()=>{'use strict';
  if(window.__CNMI_V662_OT_REOPEN__)return;
  window.__CNMI_V662_OT_REOPEN__=true;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const db=()=>{try{return window.sb||(typeof sb!=='undefined'?sb:null)}catch(_){return window.sb||null}};
  const admin=()=>{try{return typeof window.isAdmin==='function'?!!window.isAdmin():window.state?.profile?.role==='admin'}catch(_){return false}};
  const active=()=>location.hash.startsWith('#/ot?')&&new URLSearchParams(location.hash.split('?')[1]||'').get('section')==='hr-claims';
  const month=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||window.state?.otMenuMonthV369||new Date().toISOString().slice(0,7);
  const num=v=>Number(v||0).toLocaleString('th-TH');
  const amt=v=>Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  let previousMonth='',lastPreview=null,busy=false,scheduleId=0,watcherHost=null;
  function status(text,kind=''){const el=$('#v662Status');if(el){el.textContent=text;el.className='v662-status '+kind}}
  async function rpc(name,args){const client=db();if(!client?.rpc)throw Error('ไม่ได้เชื่อมต่อ Supabase');const r=await client.rpc(name,args);if(r.error)throw r.error;return r.data}
  function renderPreview(r){
    const area=$('#v662Preview');if(!area)return;
    const rows=Array.isArray(r?.batches)?r.batches:[];
    const items=rows.map(b=>`<tr><td>${esc(b.batch_id)}</td><td>${num(b.rows)} เวร</td><td>${amt(b.money)} บาท</td><td>${esc(b.exported_at?new Date(b.exported_at).toLocaleString('th-TH'):'-')}</td></tr>`).join('');
    area.innerHTML=`<div class="v662-counts"><span><strong>${num(r.batch_count)}</strong> Batch ที่ล็อก</span><span><strong>${num(r.request_count)}</strong> คำขอ Exported</span><span><strong>${num(r.adjustment_count)}</strong> รายการปรับยอด</span></div>
      ${rows.length?`<div class="v662-scroll"><table><thead><tr><th>Batch เดิม</th><th>เวร HR</th><th>ยอด Snapshot</th><th>วันที่ Export</th></tr></thead><tbody>${items}</tbody></table></div>`:''}
      <div class="v662-state ${r.allowed?'v662-allowed':'v662-blocked'}">${r.allowed?'ผ่านเงื่อนไขเบื้องต้นสำหรับเปิดรอบแก้ไข':`ไม่อนุญาตให้ตีกลับ: ${esc(r.blocker||'ไม่ผ่านการตรวจสอบ')}`}</div>`;
    const controls=$('#v662Controls');if(controls)controls.hidden=!r.allowed;
  }
  async function preview(){if(busy)return;const m=month();if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))return status('รูปแบบเดือนผิด กรุณาเลือกเดือนให้ถูกต้อง','error');busy=true;
    const btn=$('#v662Check');if(btn)btn.disabled=true;status('กำลังตรวจสถานะ Export และความปลอดภัยของเดือน '+m+'…');
    try{const r=await rpc('admin_preview_ot_reopen_month_v662',{p_month:m});lastPreview=r;renderPreview(r);status('ตรวจข้อมูลเดือน '+m+' เสร็จแล้ว',r.allowed?'ok':'warning')}
    catch(e){lastPreview=null;const area=$('#v662Preview');if(area)area.innerHTML='';const ctl=$('#v662Controls');if(ctl)ctl.hidden=true;const hint=/admin_preview_ot_reopen_month_v662|PGRST202|does not exist|schema cache|function/i.test(String(e.message||''))?' ยังไม่ได้ติดตั้ง SQL v662 ใน Supabase จึงยังใช้ปุ่มนี้ไม่ได้':' ';status('ตรวจสอบไม่ได้: '+String(e.message||e)+hint,'error')}
    finally{busy=false;if(btn)btn.disabled=false}
  }
  async function reopen(){const p=lastPreview,m=month();if(busy||!p?.allowed||p.month!==m)return status('กรุณากดตรวจสอบ Batch ใหม่','error');
    const reason=String($('#v662Reason')?.value||'').trim(),typed=String($('#v662Typed')?.value||'').trim(),checked=$('#v662Attest')?.checked===true;
    if(reason.length<12)return status('กรุณาระบุเหตุผลอย่างน้อย 12 ตัวอักษร','error');
    if(typed!=='REOPEN '+m)return status('กรุณาพิมพ์ REOPEN '+m+' ให้ตรงทุกตัวอักษร','error');
    if(!checked)return status('กรุณายืนยันว่าไฟล์เดิมยังไม่ได้ส่ง HR และได้สำรองไฟล์แล้ว','error');
    if(!window.confirm(`ยืนยันคืนสถานะ Export ทั้งเดือน ${m} ทั้ง ${p.batch_count} Batch / ${p.request_count} คำขอ?\n\nSnapshot เดิมไม่ถูกลบ แต่ยอด Carry ของเดือนนี้และเดือนถัดไปต้องตรวจใหม่ก่อน Export`))return;
    busy=true;const b=$('#v662Reopen');if(b)b.disabled=true;
    status('กำลังทำธุรกรรมเปิดรอบแก้ไข โปรดอย่ากดซ้ำ…');
    try{
      const done=await rpc('admin_reopen_ot_export_month_v662',{
        p_month:m,p_reason:reason,p_expected_count:Number(p.request_count),
        p_expected_batches:Number(p.batch_count),p_confirmation:typed
      });
      lastPreview=null;const a=$('#v662Preview');if(a)a.innerHTML=`<div class="v662-state v662-allowed"><b>คืนสถานะสำเร็จ</b> • ${num(done.requests_reopened)} คำขอ, ${num(done.adjustments_reopened)} รายการปรับ • เลขประวัติ ${esc(done.audit_id)}<br>Snapshot เดิมถูกเก็บไว้ครบ</div>`;
      const c=$('#v662Controls');if(c)c.hidden=true;
      status('เปิดรอบแก้ไขเดือน '+m+' สำเร็จ ขั้นต่อไปตรวจคำขอ OT ที่ซ้ำ/ขาดก่อน Export ใหม่','ok');
      try{window.cnmiV318?.clearHistoryCache?.();window.cnmiV318?.clearCarryCache?.();window.cnmiV316?.clearCache?.();}catch(_){ }
      try{window.showToast?.('คืนสถานะ Export เดือน '+m+' แล้ว • ตรวจคำขอก่อน Export ใหม่');}catch(_){ }
    }catch(e){status('ไม่ได้เปิดรอบแก้ไข: '+String(e.message||e)+' • ระบบฐานข้อมูลจะย้อนธุรกรรมอัตโนมัติหากคำสั่งล้มเหลว','error')}
    finally{busy=false;if(b)b.disabled=false}
  }
  function mount(){if(!admin()||!active())return;const host=$('#v637Admin');if(!host||host.hidden)return;const m=month();
    let panel=host.querySelector('#v662ReopenPanel');
    if(panel&&m===previousMonth)return;
    if(panel)panel.remove();previousMonth=m;lastPreview=null;
    panel=document.createElement('details');panel.id='v662ReopenPanel';panel.className='v662-reopen';
    panel.innerHTML=`<summary>เปิดรอบแก้ไข OT / ตีกลับ Export ทั้งเดือน (เฉพาะ Admin)</summary>
      <div class="v662-body">
        <p><b>เดือนต้นทาง ${esc(m)}</b> — ตรวจทุก Batch ที่ Export ในเดือนนี้พร้อมกัน ไม่ใช่แค่รายการของคนที่เลือก</p>
        <p>ใช้กรณีไฟล์ HR ยังไม่ส่งและต้องตรวจ OT ซ้ำหรือขาด • Snapshot เดิมเก็บไว้ • ไม่ลบคำขอ • ไม่แก้สถานะอนุมัติเดิม</p>
        <button type="button" id="v662Check">1. ตรวจสอบ Batch เดือนนี้</button><div id="v662Preview"></div>
        <div id="v662Controls" hidden>
          <label>เหตุผลที่ต้องเปิดรอบแก้ไข (อย่างน้อย 12 ตัวอักษร)
          <textarea id="v662Reason" rows="2" placeholder="เช่น ตรวจพบรายการซ้ำและรายการ OT ที่ยังไม่ขอเบิกเดือนตุลาคม"></textarea></label>
          <label>พิมพ์ <b>REOPEN ${esc(m)}</b> เพื่อยืนยัน
          <input id="v662Typed" autocomplete="off" placeholder="REOPEN ${esc(m)}"></label>
          <label class="v662-check"><input id="v662Attest" type="checkbox"> ยืนยันว่าไฟล์เดิมยังไม่ได้ส่ง HR และได้สำรองไฟล์ Export แล้ว</label>
          <button type="button" id="v662Reopen" class="v662-danger">2. ตีกลับทุก Batch ของเดือน ${esc(m)}</button>
        </div>
        <div id="v662Status" class="v662-status">ระบบจะไม่แก้ข้อมูลใด ๆ จนกว่า Admin ยืนยันด้วยตัวเอง</div>
        <p class="v662-foot">หลังตีกลับ: ตรวจ OT ซ้ำ/ตกหล่น → ส่งกลับแก้ไขเฉพาะคำขอที่ผิด → อนุมัติใหม่ → ตรวจ Carry → Export HR ฉบับใหม่เพียงครั้งเดียว • ถ้ามีการยืนยันส่ง HR แล้ว ระบบจะปฏิเสธการตีกลับ</p>
      </div>`;
    host.insertBefore(panel,host.firstChild);
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('#v662Check,#v662Reopen');if(!b)return;e.preventDefault();e.stopPropagation();if(b.id==='v662Check')void preview();else void reopen()},true);
  function schedule(){clearTimeout(scheduleId);scheduleId=setTimeout(()=>{observe();mount()},180)}
  function observe(){const host=$('#pageContent');if(!host||host===watcherHost)return;watcherHost=host;
    const watcher=new MutationObserver(muts=>{
      if(!active()||!admin())return;
      if(muts.every(x=>x.target.closest?.('#v662ReopenPanel')))return;
      if(!$('#v662ReopenPanel'))schedule();
    });watcher.observe(host,{subtree:true,childList:true});
  }
  window.addEventListener('hashchange',()=>{previousMonth='';schedule();setTimeout(schedule,500);setTimeout(schedule,1100)});
  function init(){observe();schedule();setTimeout(schedule,850)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.cnmiV662={refresh:schedule};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v662-admin-reopen-ot-month.js failed",__cnmiPatchError); }
/* ===== END patch-v662-admin-reopen-ot-month.js ===== */

/* ===== BEGIN patch-v663-admin-ot-event-correction.js ===== */
try {
/* Staff Planner v663 — controlled OT correction; requires separately installed SQL v663.
   No automatic cancellation. All changes require Admin, batch reopen, event preview and confirmation.
   Avoids reloading OT tables or running expensive background polling. */
(()=>{'use strict';
 if(window.__CNMI_V663_OT_CORRECTION__)return;window.__CNMI_V663_OT_CORRECTION__=true;
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const S=()=>{try{return window.state||(typeof state!=='undefined'?state:{})}catch(_){return window.state||{}}};
 const db=()=>{try{return window.sb||(typeof sb!=='undefined'?sb:null)}catch(_){return window.sb||null}};
 const admin=()=>{try{return typeof window.isAdmin==='function'?!!window.isAdmin():S()?.profile?.role==='admin'}catch(_){return false}};
 const section=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('section')||'';
 const active=()=>location.hash.startsWith('#/ot?')&&section()==='hr-claims';
 const month=()=>{const raw=new URLSearchParams(location.hash.split('?')[1]||'').get('month')||S().otMenuMonthV369||'';return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)?raw:new Date().toISOString().slice(0,7)};
 const n=v=>Number(v||0).toLocaleString('th-TH');
 const two=v=>Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:2});
 let loadedMonth='',groups=[],selected=null,reviewActive=false,busy=false,mountTimer=0,watcherHost=null,staffMonth='',staffCheckAt=0,staffHold=false,staffBusy=false;
 async function rpc(name,args){const c=db();if(!c?.rpc)throw Error('ยังไม่ได้เชื่อมต่อ Supabase');const r=await c.rpc(name,args);if(r.error)throw r.error;return r.data;}
 function status(message,type=''){const e=$('#v663Status');if(e){e.textContent=message;e.dataset.type=type}}
 function showMain(){const e=$('#v663AdminPanel');if(e){e.open=true;e.scrollIntoView({block:'nearest',behavior:'smooth'})}}
 function adminHTML(m){return `<summary>แก้ OT ซ้ำเป็นชุด • เปิดรอบตรวจสอบก่อน Export ใหม่ <span class="v663-small">(Admin)</span></summary>
 <div class="v663-content">
 <p><b>เดือน ${esc(m)}</b> • ยกเลิกตาม Event ID ที่ตรวจพบจริง ไม่ลบ OT ทุกคนทั้งวัน และไม่แก้ตารางเวร</p>
 <div class="v663-warn">ลำดับที่ปลอดภัย: <b>เปิดรอบตรวจ → ตีกลับ Export ทุก Batch ด้วย v662 → เลือกยกเลิก Event ที่ซ้ำ → ตรวจยอดทบ → Export ใหม่ → ประกาศ HR ฉบับใหม่ → ปิดรอบตรวจ</b></div>
 <section id="v663OpenBox"><label>เหตุผลเปิดรอบตรวจแก้ <textarea id="v663OpenReason" rows="2" placeholder="พบ OT กิจกรรมวันที่ 1 และ 15 ต.ค. ซ้ำ และต้อง Export ใหม่"></textarea></label>
 <button type="button" data-v663="open">1. เปิดรอบตรวจแก้และพักการยืนยันยอดเดิม</button></section>
 <div class="v663-tools"><button type="button" data-v663="reopen">2. ไปที่เครื่องมือตีกลับ Export v662</button>
 <button type="button" data-v663="refresh">3. ตรวจกลุ่มกิจกรรม OT เดือนนี้</button></div>
 <div id="v663Overview" aria-live="polite">กด “ตรวจกลุ่มกิจกรรม OT” เพื่อดูข้อมูลก่อนยกเลิก</div>
 <div id="v663Action" hidden>
 <h4 id="v663SelectedTitle">ยกเลิกกิจกรรม</h4>
 <p>การยกเลิกจะเปลี่ยนสถานะ OT ในกลุ่มนี้เป็น “ไม่อนุมัติ” และบันทึกสำเนาก่อนแก้ครบทุกแถว ไม่ลบรายการจริง</p>
 <label>เหตุผลยกเลิกกลุ่มกิจกรรม <textarea id="v663CancelReason" rows="2" placeholder="เช่น บันทึกประชุมซ้ำกับกิจกรรมเดิมของวันที่เดียวกัน"></textarea></label>
 <label>พิมพ์ <code id="v663Expected"></code> เพื่อยืนยัน <input id="v663Typed" autocomplete="off" spellcheck="false"></label>
 <button type="button" data-v663="cancel" class="v663-danger">ยืนยันยกเลิกเฉพาะ Event ID นี้</button>
 </div>
 <section class="v663-finish"><h4>4. ปิดรอบแก้ไขและเปิดให้ Staff ยืนยันฉบับใหม่</h4>
 <p>ใช้หลังจาก Export HR ใหม่ครบทั้งเดือนและประกาศฉบับแก้ไขของ Batch ใหม่แล้วเท่านั้น ฐานข้อมูลจะตรวจสองเงื่อนไขนี้ซ้ำ</p>
 <label>Batch ID ของ Export ใหม่ <input id="v663Batch" placeholder="เช่น 20261110-xxxxxx" autocomplete="off"></label>
 <label>พิมพ์ <code>FINISH ${esc(m)} &lt;Batch ID&gt;</code> <input id="v663FinishTyped" autocomplete="off" spellcheck="false" placeholder="FINISH ${esc(m)} ..."></label>
 <button type="button" data-v663="finish">ปิดรอบแก้ไขและปลดล็อกการยืนยัน</button>
 </section><div class="v663-status" id="v663Status">ยังไม่มีการเปลี่ยนข้อมูล Supabase</div>
 </div>`}
 function mountAdmin(){if(!admin()||!active())return;const host=$('#v637Admin');if(!host||host.hidden)return;const m=month();let panel=host.querySelector('#v663AdminPanel');if(panel&&m===loadedMonth)return;
  if(panel)panel.remove();loadedMonth=m;selected=null;groups=[];reviewActive=false;
  panel=document.createElement('details');panel.id='v663AdminPanel';panel.className='v663-panel';panel.innerHTML=adminHTML(m);
  const v662=host.querySelector('#v662ReopenPanel');if(v662)v662.insertAdjacentElement('afterend',panel);else host.prepend(panel);
 }
 function flagGroup(g){if(g.work_date==='2026-10-01'&&g.event_id==='179is4e')return 'ควรตรวจ: สร้างย้อนหลัง 9 พ.ย.';
  if(g.work_date==='2026-10-15'&&g.event_id==='oocbtq')return 'ควรตรวจ: สร้างย้อนหลัง 9 พ.ย.';
  return '';
 }
 function renderGroups(data){groups=Array.isArray(data?.groups)?data.groups:[];reviewActive=!!data?.under_review;
  const place=$('#v663Overview');if(!place)return;
  const old=$('#v663OpenBox');if(old)old.hidden=reviewActive;
  const total=groups.reduce((s,g)=>s+Number(g.row_count||0),0);
  place.innerHTML=`<div class="v663-result"><b>${reviewActive?'รอบตรวจแก้เปิดอยู่ — หยุดการยืนยันยอดเดิม':'ยังไม่ได้เปิดรอบตรวจแก้'}</b><span>พบ ${n(groups.length)} กลุ่มกิจกรรม รวม ${n(total)} รายการ</span></div>`+
   (groups.length?`<div class="v663-tablewrap"><table><thead><tr><th>วันที่</th><th>Event ID / รายละเอียด</th><th>คน</th><th>ชั่วโมงในรายการ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>`+
    groups.map(g=>{const can=!!g.can_cancel;const flag=flagGroup(g);return `<tr><td>${esc(g.work_date)}</td><td><b>${esc(g.event_id)}</b>${flag?`<div class="v663-flag">${esc(flag)}</div>`:''}</td><td>${n(g.staff_count)}</td><td>${two(g.listed_hours)}</td><td>${Number(g.exported_count)>0?`<span class="v663-chip">Export อยู่ ${n(g.exported_count)}</span>`:Number(g.approved_count)===Number(g.row_count)?'<span class="v663-chip good">รอตรวจ</span>':'<span class="v663-chip">แก้ไขแล้ว/ไม่พร้อม</span>'}</td><td><button type="button" data-v663-select="${esc(g.event_id)}" ${can?'':'disabled'}>${can?'เลือกกลุ่มนี้':'ยังยกเลิกไม่ได้'}</button></td></tr>`}).join('')+`</tbody></table></div>`:'<p>ไม่พบกลุ่มกิจกรรมที่มี Event ID ในเดือนนี้</p>')+
   `<p class="v663-hint">ถ้าขึ้น Export อยู่ ให้เปิดรอบตรวจแล้วตีกลับทั้งเดือนด้วย v662 ก่อน • กลุ่มที่อนุมัติแล้วทั้งหมดและยังไม่ Export จึงจะยกเลิกได้</p>`;
  if(!reviewActive)status('ต้องกดเปิดรอบตรวจแก้ก่อนทำรายการ');else status('อยู่ระหว่างตรวจแก้ • การยืนยันยอด HR ฉบับเดิมถูกพักไว้','warning');
 }
 async function refresh(){if(busy)return;busy=true;status('กำลังอ่านรายการกิจกรรมจาก Supabase…');
  try{const m=month(),data=await rpc('admin_list_ot_event_groups_v663',{p_month:m});selected=null;const b=$('#v663Action');if(b)b.hidden=true;renderGroups(data)}
  catch(e){status('ตรวจไม่ได้: '+String(e.message||e)+' • ตรวจว่าติดตั้ง SQL v663 ใน Supabase แล้ว','error')}
  finally{busy=false}
 }
 async function openReview(){if(busy)return;const m=month(),reason=String($('#v663OpenReason')?.value||'').trim();if(reason.length<12)return status('กรุณาใส่เหตุผลเปิดรอบอย่างน้อย 12 ตัวอักษร','error');
  if(!confirm(`เริ่มตรวจแก้เดือน ${m} และพักการยืนยันยอด HR ฉบับเดิม?\n\nยังไม่ลบหรือแก้ OT รายการใด`))return;
  busy=true;try{await rpc('admin_begin_ot_hr_correction_v663',{p_month:m,p_reason:reason});await refreshUnsafe();status('เปิดรอบตรวจแก้แล้ว • ต่อไปใช้ v662 ตีกลับ Batch ก่อนเลือกยกเลิก','ok')}
  catch(e){status('เปิดรอบไม่สำเร็จ: '+String(e.message||e),'error')}finally{busy=false}
 }
 async function refreshUnsafe(){const data=await rpc('admin_list_ot_event_groups_v663',{p_month:month()});renderGroups(data)}
 function choose(eventId){const g=groups.find(x=>x.event_id===eventId&&x.can_cancel);if(!g)return status('กลุ่มนี้ยังยกเลิกไม่ได้ ต้องตรวจสถานะก่อน','error');selected={...g,month:month()};
  const text=`CANCEL ${selected.month} ${g.event_id}`;$('#v663SelectedTitle').textContent=`ยกเลิก Event ${g.event_id} (${g.work_date}) — ${n(g.row_count)} รายการ`;
  $('#v663Expected').textContent=text;$('#v663Typed').value='';$('#v663CancelReason').value='';$('#v663Action').hidden=false;$('#v663Action').scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async function cancelEvent(){if(busy||!selected)return status('เลือกกลุ่มกิจกรรมก่อน','error');if(selected.month!==month())return status('เดือนเปลี่ยนแล้ว กรุณาตรวจรายการใหม่','error');
  const reason=String($('#v663CancelReason')?.value||'').trim(),typed=String($('#v663Typed')?.value||'').trim(),expected=`CANCEL ${month()} ${selected.event_id}`;
  if(reason.length<12)return status('กรุณาใส่เหตุผลยกเลิกอย่างน้อย 12 ตัวอักษร','error');if(typed!==expected)return status('พิมพ์คำยืนยันไม่ตรง: '+expected,'error');
  if(!confirm(`ยืนยันยกเลิกเฉพาะ Event ${selected.event_id} วันที่ ${selected.work_date} จำนวน ${selected.row_count} รายการ?\nรายการเดิมจะถูกเก็บใน Audit แต่ไม่ถูกนำไปคำนวณ OT อีก`))return;
  busy=true;try{const d=await rpc('admin_cancel_ot_event_v663',{p_month:month(),p_event_id:selected.event_id,p_expected_count:Number(selected.row_count),p_fingerprint:selected.fingerprint,p_reason:reason,p_confirmation:typed});
   selected=null;await refreshUnsafe();const a=$('#v663Action');if(a)a.hidden=true;status(`ยกเลิกสำเร็จ ${n(d.cancelled_rows)} รายการ • Audit #${d.audit_id} • ต้องตรวจยอดทบและ Export ใหม่`,'ok');
   try{window.cnmiV318?.clearHistoryCache?.();window.cnmiV318?.clearCarryCache?.();window.cnmiV637?.refresh?.()}catch(_){ }
  }catch(e){status('ไม่ยกเลิก: '+String(e.message||e)+' • ข้อมูลจะไม่ถูกเปลี่ยนบางส่วนถ้า RPC ไม่สำเร็จ','error')}
  finally{busy=false}
 }
 async function finish(){if(busy)return;const m=month(),batch=String($('#v663Batch')?.value||'').trim(),typed=String($('#v663FinishTyped')?.value||'').trim();
  if(!/^[0-9A-Za-z_-]{6,80}$/.test(batch))return status('กรุณาใส่ Batch ID จาก Export ฉบับใหม่','error');if(typed!==`FINISH ${m} ${batch}`)return status('พิมพ์คำยืนยันปิดรอบไม่ตรง','error');
  if(!confirm('ยืนยันว่า Export HR ใหม่ทั้งเดือน ตรวจยอดทบ และประกาศยอดฉบับใหม่แล้ว?\nเมื่อปิดรอบ Staff จะกลับมากดยืนยันได้'))return;
  busy=true;try{await rpc('admin_finish_ot_hr_correction_v663',{p_month:m,p_batch:batch,p_confirmation:typed});await refreshUnsafe();status('ปิดรอบตรวจแก้สำเร็จ • ยืนยันฉบับใหม่ได้แล้ว','ok')}
  catch(e){status('ปิดรอบไม่ได้: '+String(e.message||e),'error')}finally{busy=false}
 }
 // Original v532 buttons change JS state only, so the hash router restores Export History.
 // Intercept at window capture, then run the actual sidebar sub-menu action instead.
 window.addEventListener('click',e=>{const b=e.target?.closest?.('[data-v532-adjust-row],[data-v532-adjust-batch]');if(!b||!admin())return;
  e.preventDefault();e.stopImmediatePropagation();
  const sub=$('[data-v528-extra-mode="adjustment"]');if(sub){sub.click();return}
  const s=S();s.page='ot';s.otMenuV369='admin-extra';s.v527ExtraMode='adjustment';s.otGroupV522='ot';
  try{sessionStorage.setItem('cnmi-v528-admin-extra-mode','adjustment')}catch(_){ }
  try{location.hash='#/ot?section=admin-extra&month='+encodeURIComponent(month());window.renderPage?.()}catch(_){ }
 },true);
 document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-v663],[data-v663-select]');if(!b)return;
  e.preventDefault();e.stopPropagation();if(b.disabled)return;
  if(b.dataset.v663Select){choose(b.dataset.v663Select);return}
  const action=b.dataset.v663;if(action==='refresh')void refresh();else if(action==='open')void openReview();else if(action==='cancel')void cancelEvent();else if(action==='finish')void finish();
  else if(action==='reopen'){const p=$('#v662ReopenPanel');if(p){p.open=true;p.scrollIntoView({block:'start',behavior:'smooth'});status('ใช้เครื่องมือ v662 กด “ตรวจสอบ Batch เดือนนี้” และยืนยันตีกลับก่อนกลับมาเลือก Event','warning')}else status('ไม่พบเครื่องมือ v662 • ต้องติดตั้ง v662 ให้ครบ','error')}
 },true);
 async function staffReview(){const s=S(),eligible=s.page==='ot'&&s.otMenuV369==='staff-summary';if(!eligible)return;const m=month(),now=Date.now();
  if(staffBusy||(m===staffMonth&&now-staffCheckAt<12000))return;staffBusy=true;
  try{staffHold=!!await rpc('ot_hr_month_is_under_review_v663',{p_month:m});staffMonth=m;staffCheckAt=Date.now()}
  catch(_){staffHold=false;staffMonth=m;staffCheckAt=Date.now()}finally{staffBusy=false}
  updateStaffHold();
 }
 function updateStaffHold(){const card=$('#v637Staff');if(!card)return;const h=card.querySelector('#v663StaffHold');if(!staffHold){if(h)h.remove();return}
  if(!h){const note=document.createElement('div');note.id='v663StaffHold';note.className='v663-staff-hold';note.textContent='ยอด HR ฉบับนี้อยู่ระหว่างตรวจแก้ไขโดย Admin — ยังไม่ต้องกดยืนยัน กรุณารอประกาศฉบับใหม่';card.prepend(note)}
  card.querySelectorAll('[data-v637-confirm],[data-v637-dispute]').forEach(b=>{b.disabled=true;b.title='พักการยืนยันระหว่างตรวจแก้ OT'});
 }
 // Client-side guard enhances UX; the SQL trigger is the real safety enforcement.
 window.addEventListener('click',e=>{if(!staffHold)return;const b=e.target?.closest?.('[data-v637-confirm],[data-v637-dispute]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();updateStaffHold()},true);
 function observe(){const host=$('#pageContent');if(!host||watcherHost===host)return;watcherHost=host;
  new MutationObserver(ms=>{if(!ms.some(m=>m.addedNodes?.length))return;
   if(active()&&admin()&&!$('#v663AdminPanel'))schedule();
   if(staffHold&&S().otMenuV369==='staff-summary'&&$('#v637Staff')&&!$('#v663StaffHold'))updateStaffHold();
  }).observe(host,{subtree:true,childList:true});
 }
 function schedule(){clearTimeout(mountTimer);mountTimer=setTimeout(()=>{observe();mountAdmin();if(S().page==='ot'&&S().otMenuV369==='staff-summary')void staffReview()},180)}
 function init(){schedule();setTimeout(schedule,700);setTimeout(schedule,1500)}
 window.addEventListener('hashchange',()=>{loadedMonth='';staffMonth='';staffHold=false;schedule();setTimeout(schedule,450);setTimeout(schedule,1100)});
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-v369-ot-menu],[data-v528-extra-mode],[data-v523-ot-item]'))setTimeout(schedule,380)},false);
 document.addEventListener('change',e=>{if(e.target.matches?.('input[type="month"]')){loadedMonth='';staffMonth='';setTimeout(schedule,420)}},true);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.cnmiV663={refresh:()=>{loadedMonth='';staffMonth='';schedule()}};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v663-admin-ot-event-correction.js failed",__cnmiPatchError); }
/* ===== END patch-v663-admin-ot-event-correction.js ===== */

/* ===== BEGIN patch-v665-hr-export-live-discrepancy.js ===== */
try {
/* Staff Planner v665: explain rather than conceal a discrepancy between
   the exported (locked) HR snapshot and recalculated current OT. This guard
   does not change either set of rows, carry-in, export status, or payroll. */
(()=>{'use strict';
if(window.__CNMI_V665_HR_RECONCILE__)return;
window.__CNMI_V665_HR_RECONCILE__=true;
const number=(value)=>{
  const x=Number(String(value==null?'':value).replace(/[^0-9.\-]/g,''));
  return Number.isFinite(x)?x:null;
};
const baht=n=>Number(n).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+' บาท';
function check(){
  const p=document.querySelector('#pageContent');
  const card=p?.querySelector('#v643HrTotal');
  const detail=p?.querySelector('.v347-my-claim-card');
  const existing=card?.querySelector('#v665-hr-discrepancy');
  const section=new URLSearchParams(location.hash.split('?')[1]||'').get('section');
  if(section!=='claim-detail'){existing?.remove();return;}
  if(!card){return;}
  // Partial rendering can temporarily remove the detail card: do not flicker the warning.
  // A new month always triggers a new comparison instead of carrying over the old one.
  const m=new URLSearchParams(location.hash.split('?')[1]||'').get('month')||'';
  if(existing&&existing.dataset.month!==m){existing.remove();}
  if(!detail)return;
  const snapshotNode=card.querySelector('.v643-original b');
  const currentNode=detail.querySelector('.v347-claim-equation .money b');
  const snapshot=snapshotNode?number(snapshotNode.textContent):null;
  const current=currentNode?number(currentNode.textContent):null;
  if(snapshot===null||current===null)return;
  const diff=Math.round((current-snapshot)*100)/100;
  if(Math.abs(diff)<0.01){existing?.remove();return;}
  const marker=String(snapshot)+'|'+String(current);
  if(existing?.isConnected&&existing?.dataset?.signature===marker)return;
  const box=existing||document.createElement('div');
  box.id='v665-hr-discrepancy';box.className='v665-hr-discrepancy';
  box.dataset.signature=marker;box.dataset.month=m;
  box.innerHTML='';
  const bold=document.createElement('strong');bold.textContent='ยอดจากรายการ OT ปัจจุบันยังไม่ตรงกับยอด Export';
  const line=document.createElement('div');line.textContent='Export ที่ล็อกไว้ '+baht(snapshot)+' • คำนวณสด '+baht(current)+' • ผลต่าง '+baht(Math.abs(diff));
  const hint=document.createElement('small');hint.textContent='ยังไม่ควรกดยืนยันยอด ให้ Admin ตรวจยอดทบและรายการต้นทางที่ใช้ Export ก่อน การแก้ยอดในระบบจะไม่แก้ไฟล์ Excel ที่ Export ไปแล้ว';
  box.append(bold,line,hint);
  card.appendChild(box);
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;check();});}
for(const ev of ['cnmi:v665-detail-ready','cnmi:v665-snapshot-ready'])document.addEventListener(ev,schedule);
window.addEventListener('hashchange',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.cnmiV665={version:'v665',check,_test:{number}};
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v665-hr-export-live-discrepancy.js failed",__cnmiPatchError); }
/* ===== END patch-v665-hr-export-live-discrepancy.js ===== */

/* ===== BEGIN patch-v667-employee-enddate-form-filter.js ===== */
try {
/* Staff Planner V667 | Employee end-date aware NEW-entry selection.
 * Does not remove historical leave, OT, published roster, snapshots, or staff profiles.
 * Keeps form options consistent with the employment period while allowing an existing
 * historical activity/leave record to retain an already saved participant.
 */
(function(){
  'use strict';
  if(window.__CNMI_V667_STAFF_ELIGIBILITY__)return;
  window.__CNMI_V667_STAFF_ELIGIBILITY__=true;
  const VERSION='V667_STAFF_END_DATE_SELECTION';
  const selectOriginal=new WeakMap();
  const falseValue=v=>v===false||v===0||/^(false|0|off|no)$/i.test(String(v??'').trim());
  const dateKey=v=>{const d=String(v||'').trim().slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:'';};
  const today=()=>{try{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const x=Object.fromEntries(p.map(z=>[z.type,z.value]));return `${x.year}-${x.month}-${x.day}`;}catch(_){return new Date().toISOString().slice(0,10);}};
  function stateSafe(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function staffRows(){return Array.isArray(stateSafe().staff)?stateSafe().staff:[];}
  function staffById(id){return staffRows().find(p=>String(p?.id||'')===String(id||''))||null;}
  function eligible(person,first,last){
    if(!person)return false;
    if(falseValue(person.is_active)||falseValue(person.active))return false;
    let start=dateKey(first)||today(),end=dateKey(last)||start;
    if(end<start) return false;
    const s=dateKey(person.employment_start_date),e=dateKey(person.employment_end_date);
    return (!s||start>=s)&&(!e||end<=e);
  }
  function formDates(form){
    const find=name=>dateKey(form.querySelector(`[name="${name}"]`)?.value);
    const first=find('start_date')||find('duty_date')||find('work_date')||today();
    const last=find('end_date')||first;
    return {first,last};
  }
  function isHistoricalEdit(form){
    const s=stateSafe();
    return (form.id==='activityForm'&&!!s.editingActivityId)||(form.id==='leaveForm'&&!!s.editingLeaveId);
  }
  function forms(root){
    const ids=['activityForm','leaveForm','attendanceAdminFormV180','otForm','v527ActivityForm'];
    return ids.map(id=>root.querySelector('#'+id)).filter(form=>form&&(
      form.id!=='otForm'||form.querySelector('select[name="staff_id"]')
    ));
  }
  function syncActivityCount(form){
    const wrap=form.querySelector('.v518-participant-wrap');if(!wrap)return;
    const checks=[...wrap.querySelectorAll('input[name="participant_ids"]')],picked=checks.filter(c=>c.checked&&!c.disabled);
    checks.forEach(x=>{x.required=false;try{x.setCustomValidity('');}catch(_){}});
    if(!picked.length){const first=checks.find(c=>!c.disabled);if(first)first.required=true;}
    const counter=wrap.querySelector('.v518-selected-count');if(counter)counter.textContent=`เลือกแล้ว ${picked.length} คน`;
    const chips=wrap.querySelector('.v518-selected-chips');
    if(chips){
      const names=picked.map(c=>({id:c.value,name:c.closest('label')?.querySelector('b')?.textContent||staffById(c.value)?.nickname||'-'}));
      const sig=names.map(x=>x.id).join('|');
      if(chips.dataset.v667Ids!==sig){
        chips.dataset.v667Ids=sig;
        if(!names.length){chips.innerHTML='<span class="v518-no-selection">ยังไม่ได้เลือกผู้เข้าร่วม</span>';}
        else{
          chips.replaceChildren(...names.map(x=>{const btn=document.createElement('button');btn.type='button';btn.className='v518-chip';btn.setAttribute('data-v518-chip-remove',x.id);btn.textContent=x.name+' ×';return btn;}));
        }
      }
    }
  }
  function updateCheckboxes(form,dates){
    let change=false;
    form.querySelectorAll('input[type="checkbox"][value]').forEach(check=>{
      const p=staffById(check.value);if(!p)return;
      const keepHistorical=isHistoricalEdit(form)&&check.checked;
      const ok=eligible(p,dates.first,dates.last)||keepHistorical;
      const label=check.closest('label')||check.parentElement;
      if(label){label.classList.toggle('v667-unavailable-staff',!ok);if(keepHistorical&&!eligible(p,dates.first,dates.last))label.title='รายชื่อในข้อมูลเดิม (พ้นสภาพแล้ว)';}
      if(!ok&&check.checked){check.checked=false;change=true;}
      if(check.disabled===ok)check.disabled=!ok;
    });
    if(form.id==='activityForm')syncActivityCount(form);
    if(form.id==='v527ActivityForm'){
      const el=form.querySelector('#v527SelectedCount');
      if(el)el.textContent=String(form.querySelectorAll('input[name="participants"]:checked:not(:disabled)').length);
    }
    return change;
  }
  function updateSelect(select,dates,edit){
    if(!selectOriginal.has(select))selectOriginal.set(select,[...select.options].map(o=>o.cloneNode(true)));
    const all=selectOriginal.get(select),value=select.value;
    const keep=all.filter(opt=>{
      const p=staffById(opt.value);
      return !p||eligible(p,dates.first,dates.last)||(edit&&opt.value===value);
    });
    if(!keep.some(o=>o.value==='')){const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='เลือกเจ้าหน้าที่';placeholder.disabled=true;keep.unshift(placeholder);}
    const desired=keep.map(o=>String(o.value)).join('|');
    const actual=[...select.options].map(o=>String(o.value)).join('|');
    if(actual===desired)return;
    select.replaceChildren(...keep.map(o=>o.cloneNode(true)));
    if(keep.some(o=>o.value===value))select.value=value;
    else select.value='';
  }
  function apply(){
    const root=document.getElementById('pageContent');if(!root)return;
    const page=String(stateSafe().page||'');
    if(page!=='activities'&&page!=='leave'&&page!=='ot'){
      if(page==='users')updateProfileWarning(root);
      return;
    }
    for(const form of forms(root)){
      const dates=formDates(form),edit=isHistoricalEdit(form);
      form.querySelectorAll('select[name="staff_id"],select[name="owner_id"]').forEach(sel=>updateSelect(sel,dates,edit));
      updateCheckboxes(form,dates);
    }
  }
  function updateProfileWarning(root){
    const row=root.querySelector('[data-staff-row]');if(!row)return;
    const end=dateKey(row.querySelector('[data-field="employment_end_date"]')?.value),active=row.querySelector('[data-field="is_active"]')?.value;
    let note=row.querySelector('.v667-profile-warning');
    if(end&&end<today()&&!falseValue(active)){
      if(!note){note=document.createElement('div');note.className='v667-profile-warning notice soft-notice';row.prepend(note);}
      note.textContent=`สิ้นสุดการใช้งาน ${end} แล้ว แต่ Active ยังเป็น true • เปลี่ยนเป็น false และบันทึกข้อมูล เพื่อปิดสถานะบัญชี (ประวัติย้อนหลังจะยังอยู่)`;
    }else note?.remove();
  }
  function validation(form){
    const d=formDates(form),invalid=[];
    form.querySelectorAll('select[name="staff_id"],select[name="owner_id"]').forEach(sel=>{
      const p=staffById(sel.value);
      if(p&&!eligible(p,d.first,d.last)&&!isHistoricalEdit(form))invalid.push(p.nickname||p.full_name||'เจ้าหน้าที่');
    });
    form.querySelectorAll('input[type="checkbox"][value]:checked').forEach(c=>{
      const p=staffById(c.value);
      if(p&&!eligible(p,d.first,d.last)&&!isHistoricalEdit(form))invalid.push(p.nickname||p.full_name||'เจ้าหน้าที่');
    });
    return [...new Set(invalid)];
  }
  function warn(message){try{if(typeof showToast==='function')return showToast(message,{tone:'error'});}catch(_){ }console.warn('['+VERSION+'] '+message);}
  // Run after normal render. No polling, no Supabase call, no global rewriting of staff rows.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV667(){const result=previousRender.apply(this,arguments);apply();return result;};
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }
  document.addEventListener('change',e=>{
    const t=e.target;if(!t)return;
    if(t.closest?.('[data-staff-row]')&&['is_active','employment_end_date'].includes(String(t.dataset.field||''))){updateProfileWarning(document.getElementById('pageContent'));return;}
    const form=t.closest?.('form');if(!form)return;
    if(!['activityForm','leaveForm','attendanceAdminFormV180','otForm','v527ActivityForm'].includes(form.id))return;
    if(['start_date','end_date','duty_date','work_date'].includes(t.name))apply();
  },true);
  document.addEventListener('click',e=>{
    const t=e.target;
    if(t?.closest?.('[data-v518-select-all],[data-v527-select-all],[data-v518-reset-activity]')){
      // Previous handlers run in capture phase; keep the selected pool clean.
      apply();
    }
  },true);
  window.addEventListener('submit',e=>{
    const form=e.target;if(!form||!['activityForm','leaveForm','attendanceAdminFormV180','otForm','v527ActivityForm'].includes(form.id))return;
    const invalid=validation(form);
    if(invalid.length){e.preventDefault();e.stopImmediatePropagation();warn('ไม่สามารถบันทึกให้บุคลากรที่พ้นสภาพ/ไม่อยู่ในช่วงการจ้างงาน: '+invalid.join(', '));}
  },true);
  const css=document.createElement('style');css.id='v667-end-date-form-style';css.textContent='.v667-unavailable-staff{display:none!important}.v667-profile-warning{margin:10px 0;padding:10px 14px;border:1px solid #ebc47d;border-radius:10px;background:#fff8e8;color:#825b16;font-weight:600}';document.head.appendChild(css);
  window.cnmiStaffEligibilityV667={eligible,apply,formDates,today};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  console.info('['+VERSION+'] date-aware create-form eligibility enabled');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v667-employee-enddate-form-filter.js failed",__cnmiPatchError); }
/* ===== END patch-v667-employee-enddate-form-filter.js ===== */

/* ===== BEGIN patch-v669-login-identifier-choice.js ===== */
try {
/* Staff Planner v669 — choose Mahidol email local-part or staff Username.
 * UI-only bridge to existing Login submit handling. No Supabase/auth/session rewrite.
 * Email mode shows @mahidol.ac.th visually and temporarily sends the full
 * email to the existing resolveLoginIdentifier handler on submit.
 */
(() => {
  'use strict';
  if (window.CNMI_V669_LOGIN_CHOICE) return;
  window.CNMI_V669_LOGIN_CHOICE = true;

  const DOMAIN = '@mahidol.ac.th';
  const KEY = 'cnmi-login-input-mode-v669';
  const form = document.getElementById('loginForm');
  const input = document.getElementById('loginEmail');
  if (!form || !input) return;

  let mode = 'email';
  let submitRestore = null;
  const $ = (selector, root = form) => root.querySelector(selector);
  const stripDomain = value => String(value || '').trim().replace(/@mahidol\.ac\.th$/i, '');
  const getStoredMode = () => {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  };
  const saveMode = value => {
    try { localStorage.setItem(KEY, value); } catch (_) {}
  };

  const label = input.closest('label');
  if (!label || !form.contains(label)) return;
  // The original input remains the login field used by every existing auth hook.
  // Keep it a text input, preserving autofill, password managers and submit handlers.
  const title = document.createElement('span');
  title.className = 'v669-account-title';
  title.textContent = 'บัญชีสำหรับเข้าสู่ระบบ';
  for (const node of Array.from(label.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }
  label.insertBefore(title, label.firstChild);
  label.classList.add('v669-identity-label');

  const switcher = document.createElement('div');
  switcher.className = 'v669-login-switch';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'เลือกเข้าสู่ระบบด้วย Username หรืออีเมล Mahidol');
  switcher.innerHTML =
    '<button class="v669-mode" data-v669-mode="email" type="button" aria-pressed="false">อีเมล Mahidol</button>' +
    '<button class="v669-mode" data-v669-mode="username" type="button" aria-pressed="false">Username</button>';
  form.insertBefore(switcher, label);

  const wrapper = document.createElement('span');
  wrapper.className = 'v669-input-wrap';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const suffix = document.createElement('span');
  suffix.className = 'v669-domain';
  suffix.textContent = DOMAIN;
  suffix.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(suffix);

  const hint = document.createElement('span');
  hint.className = 'v669-mode-hint';
  hint.id = 'v669-mode-hint';
  label.appendChild(hint);
  input.setAttribute('aria-describedby', hint.id);

  // Existing email is safely reduced to local-part in email mode; there is no
  // need to remember the person's identity or password in localStorage.
  function updateMode(next, { focus = false } = {}) {
    const previous = mode;
    mode = next === 'username' ? 'username' : 'email';
    saveMode(mode);
    if (submitRestore) { clearTimeout(submitRestore); submitRestore = null; }
    input.setCustomValidity('');
    if (mode === 'email') input.value = stripDomain(input.value);
    else if (previous === 'email') input.value = stripDomain(input.value);
    suffix.hidden = mode !== 'email';
    input.placeholder = mode === 'email' ? 'เช่น parichat.ink' : 'เช่น 0020305 หรือ gift123';
    input.setAttribute('inputmode', mode === 'email' ? 'email' : 'text');
    input.setAttribute('aria-label', mode === 'email' ? 'ชื่อหน้าอีเมล Mahidol' : 'Username');
    hint.textContent = mode === 'email'
      ? 'กรอกเพียงชื่อหน้า @ หรือวางอีเมล Mahidol เต็มก็ได้'
      : 'กรอก Username ที่ตั้งไว้ในระบบ ไม่ต้องใส่ @mahidol.ac.th';
    switcher.querySelectorAll('[data-v669-mode]').forEach(button => {
      const selected = button.dataset.v669Mode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (focus) input.focus();
  }

  switcher.addEventListener('click', event => {
    const button = event.target.closest('[data-v669-mode]');
    if (button) updateMode(button.dataset.v669Mode, { focus: true });
  });
  input.addEventListener('input', () => {
    if (mode === 'email' && /@mahidol\.ac\.th$/i.test(input.value.trim())) {
      input.value = stripDomain(input.value);
    }
  });
  input.addEventListener('change', () => {
    if (mode === 'email') input.value = stripDomain(input.value);
  });
  input.addEventListener('focus', () => {
    if (mode === 'email' && /@mahidol\.ac\.th$/i.test(input.value.trim())) {
      input.value = stripDomain(input.value);
    }
  });

  // Runs before form-level auth handlers, including any capture-phase handlers.
  // Do not prevent submission or intercept successful login.
  document.addEventListener('submit', event => {
    if (event.target !== form || mode !== 'email') return;
    const local = input.value.trim();
    if (!local) return; // Keep native required-field feedback.
    if (local.includes('@') && !/@mahidol\.ac\.th$/i.test(local)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.setCustomValidity('ใช้ได้เฉพาะอีเมล @mahidol.ac.th');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    input.value = /@mahidol\.ac\.th$/i.test(local) ? local : local + DOMAIN;
    if (submitRestore) clearTimeout(submitRestore);
    submitRestore = setTimeout(() => {
      if (mode === 'email') input.value = stripDomain(input.value);
      submitRestore = null;
    }, 0);
  }, true);
  input.addEventListener('input', () => input.setCustomValidity(''));

  // Browser autofill can occur after deferred scripts. Adapt when the field
  // contains a full Mahidol email without clearing an in-progress entry.
  const prefilled = input.value.trim();
  const saved = getStoredMode();
  updateMode(saved === 'username' && !/@/.test(prefilled) ? 'username' : 'email');
  console.info('[V669_LOGIN_IDENTIFIER_CHOICE] ready; auth pipeline unchanged');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v669-login-identifier-choice.js failed",__cnmiPatchError); }
/* ===== END patch-v669-login-identifier-choice.js ===== */

/* ===== BEGIN patch-v671-activity-sessions-freeze-fix.js ===== */
try {
/* CNMI Staff Planner V671 — fix frozen UI from V654 activity sessions.
 * Backward compatible with existing activity_events (no SQL migration).
 * Session details are versioned metadata in note, not a new DB field.
 * Only explicitly assigned participants are blocked during each session.
 */
(function(){
  'use strict';
  if(window.__CNMI_V654_ACTIVITY_SESSIONS__)return;
  window.__CNMI_V654_ACTIVITY_SESSIONS__=true;
  const MARKER=/\[\[CNMI-ACTIVITY-ROUNDS-V654:([^\]]*)\]\]/i;
  const ALL_MARKERS=/\[\[CNMI-ACTIVITY-ROUNDS-V654:[^\]]*\]\]\s*/gi;
  // Other UI components use the public cleaner to display activity notes.
  const previousClean=window.cnmiCleanActivityNote;
  window.cnmiCleanActivityNote=function(note){
    const clean=typeof previousClean==='function'?previousClean(note):safe(note);
    return String(clean||'').replace(ALL_MARKERS,'').trim();
  };
  const safe=v=>String(v??'');
  const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(safe(v).slice(0,10))?safe(v).slice(0,10):'';
  const hm=v=>/^\d{2}:\d{2}/.test(safe(v))?safe(v).slice(0,5):'';
  const minutes=v=>{const t=hm(v);if(!t)return null;const [h,m]=t.split(':').map(Number);return h<24&&m<60?h*60+m:null;};
  function stateNow(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function staff(){return (stateNow().staff||[]).filter(p=>p&&p.is_active!==false);}
  function normalizedSessions(row){
    if(!row?.note||!MARKER.test(safe(row.note)))return null;
    const m=safe(row.note).match(MARKER);
    try{
      const parsed=JSON.parse(decodeURIComponent(m[1]));
      if(!parsed||parsed.version!==1||!Array.isArray(parsed.sessions))return [];
      return parsed.sessions.slice(0,30).map(x=>({
        date:date(x.date),start:hm(x.start),end:hm(x.end),
        staff_ids:[...new Set((Array.isArray(x.staff_ids)?x.staff_ids:[]).map(String).filter(Boolean))]
      })).filter(x=>x.date&&minutes(x.start)!==null&&minutes(x.end)!==null&&minutes(x.end)>minutes(x.start));
    }catch(_){return [];}
  }
  function intervalsForPerson(a,id,selectedDate,fallback){
    const sessions=normalizedSessions(a);
    if(sessions===null)return fallback?[fallback]:[];
    return sessions.filter(s=>s.date===selectedDate&&s.staff_ids.includes(String(id)))
      .map(s=>[minutes(s.start),minutes(s.end)]);
  }
  function editingActivity(){
    const s=stateNow(),id=s.editingActivityId;
    return id?(s.activities||[]).find(x=>String(x.id)===String(id)):null;
  }
  function participantList(ids){
    const selected=new Set((ids||[]).map(String));
    return `<div class="v654-members">${staff().map(p=>{
      const name=safe(p.nickname||p.full_name||p.id);
      return `<label class="v654-member"><input type="checkbox" data-v654-member value="${esc(p.id)}" ${selected.has(String(p.id))?'checked':''}><span>${esc(name)}</span></label>`;
    }).join('')}</div>`;
  }
  function rowHtml(s,i){
    const d=s?.date||'',start=s?.start||'09:00',end=s?.end||'11:00';
    return `<article class="v654-round">
      <div class="v654-round-title"><strong>รอบที่ <span data-v654-round-number>${i+1}</span></strong><button type="button" class="ghost-btn" data-v654-remove>ลบรอบ</button></div>
      <div class="v654-time-grid"><label>วันที่ <input data-v654-date type="date" value="${esc(d)}"></label>
      <label>เริ่ม <input data-v654-start type="time" value="${esc(start)}"></label>
      <label>สิ้นสุด <input data-v654-end type="time" value="${esc(end)}"></label></div>
      <details class="v654-member-details" ${i===0?'open':''}><summary>ผู้เข้าร่วมรอบนี้ <b data-v654-count>0 คน</b></summary>${participantList(s?.staff_ids)}</details>
    </article>`;
  }
  function formRows(form){return [...form.querySelectorAll('.v654-round')];}
  function readRows(form){return formRows(form).map(el=>({
    date:date(el.querySelector('[data-v654-date]')?.value),
    start:hm(el.querySelector('[data-v654-start]')?.value),
    end:hm(el.querySelector('[data-v654-end]')?.value),
    staff_ids:[...el.querySelectorAll('[data-v654-member]:checked')].map(el=>String(el.value))
  }));}
  function isEnabled(form){return form?.querySelector('[data-v654-enabled]')?.checked===true;}
  function syncForm(form){
    const root=form?.querySelector('.v654-session-editor');if(!root)return;
    const active=isEnabled(form);root.classList.toggle('v654-active',active);
    root.querySelector('.v654-rounds-panel').hidden=!active;
    form.querySelector('.v518-participant-wrap')?.classList.toggle('v654-hidden-participants',active);
    const rows=readRows(form),names=[...new Set(rows.flatMap(x=>x.staff_ids))];
    const hint=root.querySelector('[data-v654-summary]');
    if(hint)hint.textContent=active?`${rows.length} รอบ • ผู้เข้าร่วมไม่ซ้ำ ${names.length} คน • ระบบคำนวณตามเวลาของแต่ละรอบ`:'ไม่แบ่งรอบ: ใช้รายชื่อและเวลาเดียวกันทั้งกิจกรรม';
    formRows(form).forEach((row,i)=>{
      const number=row.querySelector('[data-v654-round-number]');if(number)number.textContent=String(i+1);
      const count=row.querySelector('[data-v654-count]');if(count)count.textContent=`${row.querySelectorAll('[data-v654-member]:checked').length} คน`;
    });
    if(active){
      // Keep the legacy participants array in sync for FM-CNHR-002 and the activity list.
      form.querySelectorAll('input[name="participant_ids"]').forEach(input=>{
        input.checked=names.includes(String(input.value));input.required=false;input.setCustomValidity?.('');
      });
    }
  }
  function appendRound(form,s){
    const box=form?.querySelector('.v654-round-list');if(!box)return;
    const index=formRows(form).length;
    if(index>=20)return;
    box.insertAdjacentHTML('beforeend',rowHtml(s,index));syncForm(form);
  }
  function buildForm(html){
    if(typeof html!=='string'||!html||!html.includes('activityForm'))return html;
    const tpl=document.createElement('template');tpl.innerHTML=html;
    const form=tpl.content.querySelector('#activityForm');if(!form)return html;
    const originalNote=form.querySelector('textarea[name="note"]');
    if(originalNote)originalNote.textContent=safe(originalNote.value||originalNote.textContent).replace(ALL_MARKERS,'').trim();
    const existing=normalizedSessions(editingActivity());
    const section=document.createElement('section');section.className='v518-form-section v654-session-editor';
    section.innerHTML=`<div class="v518-section-head"><h4>เวลาเข้าร่วมกิจกรรม</h4><span>สำหรับอบรมหลายรอบหรือสลับคนทำงาน</span></div>
      <label class="v654-switch"><input type="checkbox" data-v654-enabled ${existing!==null?'checked':''}><span><b>แบ่งผู้เข้าร่วมเป็นรอบ</b><small>เลือกเวลาและรายชื่อแยกแต่ละรอบ เพื่อให้ Dashboard นับกำลังคนตามจริง</small></span></label>
      <p class="v654-summary" data-v654-summary></p>
      <div class="v654-rounds-panel" ${existing===null?'hidden':''}><div class="v654-round-list">${(existing||[]).map(rowHtml).join('')}</div>
      <button class="ghost-btn v654-add" type="button" data-v654-add>+ เพิ่มรอบ</button></div>`;
    const optional=form.querySelector('.v518-optional-section');
    if(optional)optional.before(section);else form.appendChild(section);
    const wrap=form.querySelector('.v518-participant-wrap');if(wrap&&existing!==null)wrap.classList.add('v654-hidden-participants');
    return tpl.innerHTML;
  }
  function prepare(form,note){
    const clean=safe(note).replace(ALL_MARKERS,'').trim();
    if(!isEnabled(form))return {note:clean,participants:null};
    const rows=readRows(form),startDate=date(form.querySelector('[name="start_date"]')?.value),endDate=date(form.querySelector('[name="end_date"]')?.value);
    const start=minutes(form.querySelector('[name="start_time"]')?.value),end=minutes(form.querySelector('[name="end_time"]')?.value);
    if(!rows.length)return {error:'กรุณาเพิ่มรอบกิจกรรมอย่างน้อย 1 รอบ'};
    if(rows.length>20)return {error:'รองรับไม่เกิน 20 รอบต่อกิจกรรม'};
    const union=new Set(),occupied=new Map();
    for(const [i,r] of rows.entries()){
      if(!r.date||r.date<startDate||r.date>endDate)return {error:`รอบที่ ${i+1}: วันที่ต้องอยู่ภายในช่วงกิจกรรม`};
      const a=minutes(r.start),b=minutes(r.end);
      if(a===null||b===null||b<=a)return {error:`รอบที่ ${i+1}: กรุณาระบุเวลาเริ่มและสิ้นสุดให้ถูกต้อง`};
      if((r.date===startDate&&start!==null&&a<start)||(r.date===endDate&&end!==null&&b>end))return {error:`รอบที่ ${i+1}: เวลาอยู่นอกช่วงกิจกรรมหลัก`};
      if(!r.staff_ids.length)return {error:`รอบที่ ${i+1}: กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน`};
      for(const id of r.staff_ids){
        union.add(id);const key=`${r.date}|${id}`;const seen=occupied.get(key)||[];
        if(seen.some(x=>a<x[1]&&b>x[0]))return {error:`รอบที่ ${i+1}: เจ้าหน้าที่คนเดียวกันมีรอบเวลาซ้อนกัน`};
        seen.push([a,b]);occupied.set(key,seen);
      }
    }
    const data={version:1,sessions:rows};
    const marker=`[[CNMI-ACTIVITY-ROUNDS-V654:${encodeURIComponent(JSON.stringify(data))}]]`;
    return {note:`${clean}${clean?'\n':''}${marker}`,participants:[...union]};
  }
  const prev=window.renderActivitiesPage||(typeof renderActivitiesPage==='function'?renderActivitiesPage:null);
  if(typeof prev==='function'){
    const wrapped=function renderActivitiesPageV654(){return buildForm(String(prev.apply(this,arguments)||''));};
    try{window.renderActivitiesPage=renderActivitiesPage=wrapped;}catch(_){window.renderActivitiesPage=wrapped;}
  }
  document.addEventListener('change',event=>{
    const el=event.target,form=el?.closest?.('#activityForm');if(!form||!form.querySelector('.v654-session-editor'))return;
    if(el.matches('[data-v654-enabled]')){
      if(el.checked&&!formRows(form).length){
        const selected=[...form.querySelectorAll('input[name="participant_ids"]:checked')].map(x=>x.value);
        appendRound(form,{date:date(form.querySelector('[name="start_date"]')?.value),start:hm(form.querySelector('[name="start_time"]')?.value)||'09:00',end:hm(form.querySelector('[name="end_time"]')?.value)||'11:00',staff_ids:selected});
      }
      syncForm(form);
    }else if(el.matches('[data-v654-member],[data-v654-date],[data-v654-start],[data-v654-end]'))syncForm(form);
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-v654-add],[data-v654-remove]');if(!el)return;
    const form=el.closest('#activityForm');if(!form)return;
    event.preventDefault();event.stopPropagation();
    if(el.matches('[data-v654-remove]'))el.closest('.v654-round')?.remove();
    else appendRound(form,{date:date(form.querySelector('[name="start_date"]')?.value),start:'13:00',end:'15:00',staff_ids:[]});
    syncForm(form);
  });
  // Capture before the legacy document-level submit handler. Avoid modifying the
  // production V652/V653 activity save code, so this patch is safe to overlay.
  window.addEventListener('submit',event=>{
    const form=event.target;if(form?.id!=='activityForm'||!form.querySelector('.v654-session-editor'))return;
    const textarea=form.querySelector('textarea[name="note"]');if(!textarea)return;
    const original=textarea.value;
    const draft=prepare(form,original);
    if(draft.error){
      event.preventDefault();event.stopImmediatePropagation();
      try{if(typeof showToast==='function')showToast(draft.error);else alert(draft.error);}catch(_){alert(draft.error);}
      return;
    }
    textarea.value=draft.note;
    if(Array.isArray(draft.participants)){
      const members=new Set(draft.participants.map(String));
      form.querySelectorAll('input[name="participant_ids"]').forEach(el=>{
        el.checked=members.has(String(el.value));el.required=false;el.setCustomValidity?.('');
      });
    }
    // The legacy handler reads FormData synchronously; restore the editor text
    // immediately afterwards, including after a failed network save.
    queueMicrotask(()=>{if(textarea.isConnected)textarea.value=original;});
  },true);

  // Recalculate only the dashboard manpower card against virtual per-session rows.
  // No changes to Supabase, activities stored in state, other dashboard widgets,
  // activity editing, or physician assignments are required.
  function dashboardDate(){
    try{return date(window.cnmiDashboardDateV443?.selectedDate?.())||date(stateNow().dashboardDateV443)||date(typeof todayStr==='function'?todayStr():'');}
    catch(_){return date(stateNow().dashboardDateV443)||new Date().toISOString().slice(0,10);}
  }
  function virtualActivities(rows,day){
    const out=[];
    for(const a of rows||[]){
      const sessions=normalizedSessions(a);
      if(sessions===null){out.push(a);continue;}
      sessions.forEach((r,i)=>{
        if(r.date!==day||!r.staff_ids.length)return;
        out.push({...a,id:`${a.id||''}::v654:${i}`,start_date:r.date,end_date:r.date,
          start_time:r.start,end_time:r.end,participant_ids:r.staff_ids,
          note:safe(a.note).replace(ALL_MARKERS,'').trim()});
      });
    }
    return out;
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV654(){
      const html=previousDashboard.apply(this,arguments);
      if(typeof html!=='string'||!html.includes('data-v562-manpower'))return html;
      const api=window.cnmiAvailabilityV562;
      if(!api?.manpowerCard)return html;
      const s=stateNow(),day=dashboardDate(),activities=s.activities;
      if(!Array.isArray(activities)||!activities.some(a=>normalizedSessions(a)!==null))return html;
      let newCard='';
      try{
        s.activities=virtualActivities(activities,day);
        newCard=api.manpowerCard(day).replace(/ไม่พร้อม (\d+) คน/g,'ติดกิจกรรมรวม $1 คน');
      }catch(err){console.warn('V654 manpower redraw',err);}
      finally{s.activities=activities;}
      if(!newCard)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const old=tpl.content.querySelector('[data-v562-manpower]');if(!old)return html;
        const replacement=document.createElement('template');replacement.innerHTML=newCard;
        old.replaceWith(replacement.content.firstElementChild);
        return tpl.innerHTML;
      }catch(err){console.warn('V654 manpower UI',err);return html;}
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // Initial member counts are hydrated without rebuilding the main form.
  function versionChip(){document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(el=>{if(el.textContent!=='v671')el.textContent='v671';if(el.title!=='v671 แก้หน้าแอปค้าง คงระบบกิจกรรมแบ่งรอบ')el.title='v671 แก้หน้าแอปค้าง คงระบบกิจกรรมแบ่งรอบ';});}
  // V671 freeze fix: observe only direct page swaps, not the entire app subtree.
  // V654 called versionChip() from a subtree MutationObserver. Updating the chip
  // changed the observed DOM and could enter a mutation feedback loop with
  // older version decorators, keeping the main thread busy indefinitely.
  const mo=new MutationObserver(mutations=>{
    for(const m of mutations)for(const node of m.addedNodes){
      if(node.nodeType!==1)continue;
      const form=node.matches?.('#activityForm')?node:node.querySelector?.('#activityForm');
      if(form?.querySelector('.v654-session-editor'))syncForm(form);
    }
  });
  function start(){
    const root=document.getElementById('pageContent')||document.getElementById('appView')||document.body;
    mo.observe(root,{childList:true,subtree:false});
    const form=document.querySelector('#activityForm');
    if(form)syncForm(form);
    // One-time update only. Never update the version chip from a DOM observer.
    versionChip();
  }
  window.addEventListener('pageshow',versionChip);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiActivitySessionsV654={version:'654',parse:normalizedSessions,prepare,intervalsForPerson,readRows,virtualActivities};
  const style=document.createElement('style');style.id='v654-activity-style';style.textContent=`
    .v654-session-editor{border:1px solid #cae3f7!important;background:#f8fcff!important;border-radius:15px;padding:14px!important}
    .v654-session-editor .v518-section-head{margin-bottom:10px!important}
    .v654-switch{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:11px;background:white;border:1px solid #d8eaf5;cursor:pointer}
    .v654-switch input{width:18px;height:18px;flex:none}.v654-switch span{display:grid;gap:2px}.v654-switch b{font-size:14px}.v654-switch small{font-size:12px;color:#60798d}
    .v654-summary{font-size:12px;color:#4e7993;margin:7px 2px 5px}.v654-hidden-participants{display:none!important}
    .v654-round-list{display:grid;gap:10px}.v654-round{border:1px solid #d4e7f5;background:#fff;border-radius:12px;padding:11px;min-width:0}
    .v654-round-title{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:10px}
    .v654-time-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:8px}.v654-time-grid label{font-size:12px;display:grid;gap:5px;min-width:0}
    .v654-time-grid input{width:100%;min-width:0;box-sizing:border-box}.v654-member-details{margin-top:11px;border-top:1px solid #e2edf4;padding-top:9px}
    .v654-member-details summary{font-size:13px;font-weight:700;cursor:pointer}.v654-member-details summary b{color:#1879b4;font-weight:600}
    .v654-members{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px;margin-top:8px}
    .v654-member{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #dce8ee;border-radius:9px;cursor:pointer;font-size:12px}
    .v654-member:has(input:checked){background:#e8f6ff;border-color:#82c8ee}.v654-member input{margin:0;flex:none}
    .v654-add{margin-top:10px}.v654-rounds-panel[hidden]{display:none!important}
    @media(max-width:600px){.v654-time-grid{grid-template-columns:1fr 1fr}.v654-time-grid label:first-child{grid-column:1/-1}.v654-members{grid-template-columns:repeat(2,minmax(0,1fr))}.v654-session-editor{padding:10px!important}}
  `;document.head.appendChild(style);
  console.info('[V671_ACTIVITY_SESSIONS_FREEZE_FIX] loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v671-activity-sessions-freeze-fix.js failed",__cnmiPatchError); }
/* ===== END patch-v671-activity-sessions-freeze-fix.js ===== */

/* ===== BEGIN patch-v672-activity-round-participants-ui.js ===== */
try {
/* CNMI Staff Planner v672: make each activity session's participant picker
   match the compact, readable participant picker at the top of the form.
   UI-only patch. v671 handles session data, saving, and manpower calculations.
*/
(function () {
  'use strict';
  if (window.__CNMI_V672_ROUND_MEMBERS_UI__) return;
  window.__CNMI_V672_ROUND_MEMBERS_UI__ = true;

  function formatMemberName(label) {
    const input = label.querySelector('input[data-v654-member]');
    if (!input) return;
    label.classList.add('v396-participant', 'v672-member-option');
    const span = label.querySelector('span');
    if (span && !span.querySelector('b')) {
      const name = span.textContent.trim();
      span.replaceChildren();
      const bold = document.createElement('b');
      bold.textContent = name;
      span.appendChild(bold);
    }
    // Keep the staff ID and name together for search; only the visual layout
    // changes, never checkbox values or the participant/session model.
    const appState = window.state || (typeof state !== 'undefined' ? state : null);
    const staff = Array.isArray(appState?.staff) ? appState.staff : [];
    const person = staff.find(p => String(p?.id) === String(input.value));
    const full = String(person?.full_name || '');
    const nickname = String(person?.nickname || span?.textContent || '');
    label.dataset.v672Search = `${nickname} ${full}`.toLocaleLowerCase();
    if (full) label.title = full;
  }

  function enhanceRound(round) {
    if (!round || round.dataset.v672Enhanced === '1') return;
    const members = round.querySelector('.v654-members');
    if (!members) return;
    round.dataset.v672Enhanced = '1';
    members.classList.add('v672-member-grid');
    members.querySelectorAll('.v654-member').forEach(formatMemberName);
    const toolbar = document.createElement('div');
    toolbar.className = 'v672-member-tools';
    toolbar.innerHTML = `
      <input type="search" data-v672-round-search aria-label="ค้นหาผู้เข้าร่วมในรอบนี้" placeholder="ค้นหาชื่อผู้เข้าร่วม" autocomplete="off">
      <button type="button" class="ghost-btn" data-v672-round-select>เลือกทั้งหมด</button>
      <button type="button" class="ghost-btn" data-v672-round-clear>ล้างทั้งหมด</button>`;
    members.before(toolbar);
  }

  function enhanceAll(scope) {
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll('.v654-round').forEach(enhanceRound);
  }

  // v671 creates the form from a string; decorate that string instead of
  // observing the live DOM (avoids the earlier MutationObserver freeze).
  const previous = window.renderActivitiesPage ||
    (typeof renderActivitiesPage === 'function' ? renderActivitiesPage : null);
  if (typeof previous === 'function') {
    const wrapped = function renderActivitiesPageV672() {
      const html = previous.apply(this, arguments);
      if (typeof html !== 'string' || !html.includes('v654-round')) return html;
      const template = document.createElement('template');
      template.innerHTML = html;
      enhanceAll(template.content);
      return template.innerHTML;
    };
    try { window.renderActivitiesPage = renderActivitiesPage = wrapped; }
    catch (_) { window.renderActivitiesPage = wrapped; }
  }

  function refreshCount(round) {
    if (!round) return;
    const selected = round.querySelectorAll('input[data-v654-member]:checked').length;
    const count = round.querySelector('[data-v654-count]');
    if (count) count.textContent = `${selected} คน`;
  }

  // Every round has its own search and bulk selection. Never modify people
  // selected in other rounds. 'เลือกทั้งหมด' always means the whole round.
  document.addEventListener('input', function (event) {
    if (!event.target?.matches?.('[data-v672-round-search]')) return;
    const round = event.target.closest('.v654-round');
    if (!round) return;
    const query = event.target.value.trim().toLocaleLowerCase();
    round.querySelectorAll('.v672-member-option').forEach(label => {
      label.hidden = !!query && !(label.dataset.v672Search || label.textContent.toLocaleLowerCase()).includes(query);
    });
  });

  document.addEventListener('click', function (event) {
    const button = event.target?.closest?.('[data-v672-round-select],[data-v672-round-clear]');
    if (!button) return;
    event.preventDefault();
    const round = button.closest('.v654-round');
    if (!round) return;
    const selected = button.hasAttribute('data-v672-round-select');
    const inputs = [...round.querySelectorAll('input[data-v654-member]')];
    inputs.forEach(input => { input.checked = selected; });
    // Trigger v671's existing count and legacy-participant synchronization.
    if (inputs[0]) inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    refreshCount(round);
  });

  // v671 inserts a round directly in the DOM when enabling sessions or
  // clicking + เพิ่มรอบ. Enhance it after v671's synchronous listener ends.
  document.addEventListener('click', function (event) {
    if (!event.target?.closest?.('[data-v654-add]')) return;
    const form = event.target.closest('#activityForm');
    if (form) queueMicrotask(() => enhanceAll(form));
  });
  document.addEventListener('change', function (event) {
    if (!event.target?.matches?.('[data-v654-enabled]')) return;
    const form = event.target.closest('#activityForm');
    if (form) queueMicrotask(() => enhanceAll(form));
  });

  function versionChipOnce() {
    document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(el => {
      if (el.textContent.trim() === 'v671') el.textContent = 'v672';
      if (el.title.includes('v671')) el.title = 'v672 เลือกผู้เข้าร่วมกิจกรรมแต่ละรอบอ่านง่าย';
    });
    enhanceAll(document);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', versionChipOnce, { once: true });
  else versionChipOnce();
  window.addEventListener('pageshow', versionChipOnce);

  const style = document.createElement('style');
  style.id = 'v672-round-members-style';
  style.textContent = `
    .v654-session-editor .v672-member-tools {display:grid;grid-template-columns:minmax(140px,1fr) auto auto;gap:7px;align-items:center;margin:9px 0 7px;}
    .v654-session-editor .v672-member-tools input[type="search"] {min-width:0;width:100%;height:38px;min-height:38px;padding:6px 10px;box-sizing:border-box;border:1px solid #cfe1ec;border-radius:9px;font-size:13px;}
    .v654-session-editor .v672-member-tools button {min-height:36px!important;padding:6px 10px!important;border:1px solid #d4e5ef;border-radius:9px;font-size:12px!important;white-space:nowrap;}
    .v654-session-editor .v654-members.v672-member-grid {display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:7px;max-height:220px;overflow-y:auto;overflow-x:hidden;padding:2px;margin-top:0;align-content:start;}
    .v654-session-editor .v654-member.v672-member-option {display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:auto!important;min-width:0!important;min-height:42px!important;margin:0!important;padding:7px 9px!important;box-sizing:border-box!important;border:1px solid #dce6ed;border-radius:10px;background:#fff;overflow:hidden;cursor:pointer;}
    .v654-session-editor .v654-member.v672-member-option[hidden] {display:none!important;}
    .v654-session-editor .v654-member.v672-member-option:has(input:checked) {background:#eef8fd;border-color:#85bedc;box-shadow:inset 0 0 0 1px rgba(93,174,224,.1);}
    .v654-session-editor .v654-member.v672-member-option input[type="checkbox"] {appearance:auto!important;display:block!important;position:static!important;width:18px!important;height:18px!important;min-width:18px!important;max-width:18px!important;min-height:18px!important;max-height:18px!important;flex:0 0 18px!important;padding:0!important;margin:0!important;transform:none!important;zoom:1!important;box-shadow:none!important;accent-color:#4d9fd0;}
    .v654-session-editor .v654-member.v672-member-option span {display:block!important;flex:1 1 auto;min-width:0!important;width:auto!important;margin:0!important;overflow:hidden;}
    .v654-session-editor .v654-member.v672-member-option b {display:block;font-size:13px;font-weight:700;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    @media(max-width:660px) {
      .v654-session-editor .v672-member-tools {grid-template-columns:repeat(2,minmax(0,1fr));}
      .v654-session-editor .v672-member-tools input[type="search"] {grid-column:1/-1;}
      .v654-session-editor .v654-members.v672-member-grid {grid-template-columns:repeat(2,minmax(0,1fr));max-height:230px;gap:6px;}
      .v654-session-editor .v654-member.v672-member-option {padding:7px!important;gap:6px!important;min-height:41px!important;}
      .v654-session-editor .v654-member.v672-member-option b {font-size:12px;}
    }
  `;
  document.head.appendChild(style);
  console.info('[V672_ACTIVITY_ROUND_PARTICIPANTS_UI] loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v672-activity-round-participants-ui.js failed",__cnmiPatchError); }
/* ===== END patch-v672-activity-round-participants-ui.js ===== */

/* ===== BEGIN patch-v674-audit-staff-mode-view.js ===== */
try {
/* CNMI v676 — Clear shift-sale audit timeline, discreet Staff view, keeps v674 RLS-backed mode isolation.
 * Requires SUPABASE_Run_Once_v673_Audit_Visibility.sql BEFORE deployment.
 * Never infer owner permissions from nickname, client-side role, or localStorage.
 */
(function () {
  'use strict';
  if (window.__CNMI_V674_AUDIT__) return;
  window.__CNMI_V674_AUDIT__ = true;

  const filters = { actor: '', action: '', mode: 'all', search: '' };
  let acl = { ready: false, is_owner: false, user: '', loading: false, error: '' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const S = () => (typeof state !== 'undefined' ? state : window.state);
  const clean = str => String(str ?? '').trim();
  // The owner's DB identity does not mean they are currently USING Admin mode.
  // Staff view must behave like any other staff account, including details and Excel.
  // Fail closed if the view-mode API is unavailable or inconsistent.
  function canViewAdminAudit() {
    if (!acl.ready || !acl.is_owner) return false;
    try {
      return typeof window.getViewAsModeV167 === 'function'
        && window.getViewAsModeV167() === 'admin'
        && typeof window.isAdmin === 'function'
        && window.isAdmin() === true;
    } catch (_) { return false; }
  }
  const modeOf = a => (a?.cnmi_actor_mode_v673 === 'admin' ? 'admin' : 'staff');
  const actionOf = a => String(a?.action || '').toUpperCase();
  const tableOf = a => String(a?.table_name || '');
  const date = value => { try { return formatThaiDateTime(value); } catch (_) { return clean(value); } };
  const prettyTable = a => { try { return tableLabel(tableOf(a)); } catch (_) { return tableOf(a) || 'ระบบ'; } };
  const labelAction = a => { try { return tradeEventLabel(a) || auditActionLabel(a); } catch (_) { return actionOf(a) || '-'; } };
  const actorName = a => {
    if (!a?.actor_id) return 'ระบบอัตโนมัติ';
    const person = (S()?.staff || []).find(x => String(x?.id) === String(a.actor_id));
    if (!person) return 'เจ้าหน้าที่ (ไม่พบข้อมูลบัญชี)';
    const nick = clean(person.nickname || person.full_name || 'เจ้าหน้าที่');
    const full = clean(person.full_name || '');
    return full && full !== nick ? nick + ' (' + full + ')' : nick;
  };
  const names = { staff_id:'เจ้าหน้าที่', requester_id:'ผู้ขายเวร', receiver_id:'ผู้รับเวร', created_by:'ผู้บันทึกคำขอ', confirmed_at:'เวลายืนยัน', updated_by:'ผู้แก้ไข', duty_date:'วันที่เวร', duty_code:'ประเภทเวร', work_date:'วันที่', start_date:'วันเริ่ม', end_date:'วันสิ้นสุด', start_time:'เวลาเริ่ม', end_time:'เวลาสิ้นสุด', title:'หัวข้อ', nickname:'ชื่อเล่น', full_name:'ชื่อจริง', status:'สถานะ', type:'ประเภท', note:'หมายเหตุ', reason:'เหตุผล', role:'สิทธิ์', position_code:'ตำแหน่ง', is_eligible:'มีสิทธิ์', is_active:'เปิดใช้งาน', staff_type:'ประเภทเจ้าหน้าที่', holiday_date:'วันหยุด', attendance_status:'สถานะการเข้าเวร', trade_type:'ประเภทการขายเวร', amount_to:'จำนวนเงิน', approval_status:'สถานะอนุมัติ' };
  // Never display arbitrary row columns / credentials from old_data and new_data.
  const allowedFields = Object.keys(names);
  const fmt = (key,val) => {
    if (val === undefined || val === null || val === '') return '—';
    if (typeof val === 'boolean') return val ? 'ใช่' : 'ไม่ใช่';
    if (key === 'confirmed_at') return date(val);
    if (key === 'status' && ['pending','confirmed','rejected','completed','cancelled'].includes(String(val))) return tradeStatus(val);
    if (key === 'staff_id' || key === 'requester_id' || key === 'receiver_id' || key === 'updated_by' || key === 'created_by') {
      try { const name = staffNick(val); if (name && name !== '-') return name; } catch (_) {}
      return 'เจ้าหน้าที่';
    }
    if (typeof val === 'object') return '[ข้อมูลหลายรายการ]';
    return String(val).slice(0,160);
  };
  function differences(a) {
    const old = a?.old_data && typeof a.old_data === 'object' ? a.old_data : {};
    const next = a?.new_data && typeof a.new_data === 'object' ? a.new_data : {};
    return allowedFields.filter(key => {
      if (!Object.prototype.hasOwnProperty.call(old,key) && !Object.prototype.hasOwnProperty.call(next,key)) return false;
      const before = old[key], after = next[key];
      if (before === undefined || after === undefined) return false;
      return JSON.stringify(before) !== JSON.stringify(after);
    }).slice(0,7).map(key => ({ field: names[key], before: fmt(key,old[key]), after: fmt(key,next[key]) }));
  }

  // Trade requests have several separate events. Distinguish request, acceptance and
  // final booking by the actual audit row created at each transition (not by
  // today's status, and never infer a confirmation actor from the seller field).
  const isTrade = a => tableOf(a) === 'roster_trade_requests';
  const tradeStatus = v => ({ pending:'รอผู้รับเวรยืนยัน', confirmed:'ยืนยันรับเวรแล้ว', rejected:'ปฏิเสธคำขอ', completed:'บันทึกเวรแล้ว', cancelled:'ยกเลิกคำขอ' })[String(v||'').toLowerCase()] || clean(v) || '—';
  function tradeEventKey(a) {
    if (!isTrade(a)) return actionOf(a);
    const operation = actionOf(a);
    const old = a?.old_data || {}, next = a?.new_data || {};
    if (operation === 'INSERT') return 'TRADE_REQUEST';
    if (operation === 'DELETE') return 'TRADE_DELETE';
    if (operation !== 'UPDATE') return operation;
    if (old.status !== next.status && next.status === 'confirmed') return 'TRADE_CONFIRM';
    if (old.status !== next.status && next.status === 'rejected') return 'TRADE_REJECT';
    if (old.status !== next.status && next.status === 'completed') return 'TRADE_COMPLETE';
    return 'TRADE_EDIT';
  }
  const tradeEventLabel = a => ({
    TRADE_REQUEST:'ส่งคำขอขายเวร',
    TRADE_CONFIRM: String(a?.actor_id || '') === String(a?.new_data?.receiver_id || '') ? 'ผู้รับเวรกดยืนยัน' : 'ยืนยันคำขอขายเวร',
    TRADE_REJECT:'ปฏิเสธคำขอขายเวร',
    TRADE_COMPLETE:'บันทึกขายเวรสำเร็จ',
    TRADE_EDIT:'แก้ไขคำขอขายเวร',
    TRADE_DELETE:'ลบคำขอขายเวร'
  })[tradeEventKey(a)] || '';
  function tradeSummary(a) {
    const n=a?.new_data || {}, o=a?.old_data || {};
    const seller=n.requester_id || o.requester_id;
    const receiver=n.receiver_id || o.receiver_id;
    const fromId=n.from_assignment_id || o.from_assignment_id;
    const duty=(S()?.rosterAssignments || []).find(x=>String(x?.id)===String(fromId));
    let dutyText='';
    if (duty?.duty_date) {
      let dateLabel=clean(duty.duty_date);
      try { dateLabel=formatThaiDate(duty.duty_date); } catch (_) {}
      let code=clean(duty.duty_code);
      try { code=DUTY_LABEL[code] || code; } catch (_) {}
      dutyText=` · เวร ${dateLabel}${code ? ' ('+code+')' : ''}`;
    }
    const action=tradeEventLabel(a);
    const fromName=fmt('requester_id',seller),toName=fmt('receiver_id',receiver);
    const change=(tradeEventKey(a)==='TRADE_CONFIRM' || tradeEventKey(a)==='TRADE_REJECT' || tradeEventKey(a)==='TRADE_COMPLETE')
      ? ` · ${tradeStatus(n.status || o.status)}` : '';
    return `${action}: ${fromName} → ${toName}${dutyText}${change}`;
  }

  function summary(a) {
    const operation = actionOf(a);
    const next = a?.new_data || {}, old = a?.old_data || {};
    if (isTrade(a)) return tradeSummary(a);
    if (tableOf(a) === 'auth') return labelAction(a) + ' ' + (next?.at ? date(next.at) : '');
    const identity = tableOf(a) === 'leave_requests' ? ' ('+fmt('staff_id',next.staff_id || old.staff_id)+')' : '';
    try {
      let text = clean(auditSummary(a));
      if (text && text !== prettyTable(a)) return text + identity;
    } catch (_) {}
    if (operation === 'INSERT') return 'เพิ่มรายการใหม่ใน ' + prettyTable(a) + identity;
    if (operation === 'DELETE') return 'ลบรายการใน ' + prettyTable(a) + identity;
    if (operation === 'UPDATE') return 'แก้ไขรายการใน ' + prettyTable(a) + identity;
    return labelAction(a) + ' — ' + prettyTable(a);
  }
  function rowsVisible() {
    if (!acl.ready) return [];
    let rows = Array.isArray(S()?.auditLogs) ? S().auditLogs : [];
    // Defense in depth: never present private/admin rows in Staff view, even
    // if a previously loaded owner session has both kinds cached in memory.
    const adminView = canViewAdminAudit();
    rows = rows.filter(a => (a?.cnmi_visibility_v673 === 'public' && modeOf(a) === 'staff')
      || (adminView && a?.cnmi_visibility_v673 === 'private'));
    const day = S()?.auditDate;
    if (day) rows = rows.filter(a => {
      try { return toDateInput(new Date(a.created_at)) === day; } catch (_) { return String(a.created_at||'').slice(0,10) === day; }
    });
    return rows;
  }
  function rowsFiltered() {
    return rowsVisible().filter(a => {
      if (filters.actor && String(a.actor_id || '') !== filters.actor) return false;
      if (filters.action && tradeEventKey(a) !== filters.action) return false;
      const visibleMode = canViewAdminAudit() ? filters.mode : 'staff';
      if (visibleMode !== 'all' && modeOf(a) !== visibleMode) return false;
      if (filters.search) {
        const haystack = [actorName(a),prettyTable(a),labelAction(a),summary(a), ...differences(a).map(d=>d.field+' '+d.before+' '+d.after)].join(' ').toLocaleLowerCase();
        if (!haystack.includes(filters.search.toLocaleLowerCase())) return false;
      }
      return true;
    });
  }
  async function loadAcl() {
    const st = S();
    const uid = clean(st?.session?.user?.id || '');
    if (!uid) return;
    if (acl.loading || (acl.user === uid && (acl.ready || acl.error))) return;
    acl = { ready:false,is_owner:false,user:uid,loading:true,error:'' };
    try {
      const client = typeof sb !== 'undefined' ? sb : window.sb;
      const result = await client?.rpc?.('cnmi_audit_access_v673');
      if (result?.error) throw result.error;
      if (result?.data?.ready !== true) throw new Error('ไม่สามารถยืนยันสิทธิ์ Audit Log จากฐานข้อมูล');
      // Require the new DB audit column, even if the RPC exists.
      const check = await client.from('audit_logs').select('id,cnmi_visibility_v673,cnmi_actor_mode_v673').limit(1);
      if (check?.error) throw check.error;
      acl = { ready:true,is_owner:result.data.is_owner === true,user:uid,loading:false,error:'' };
    } catch (err) {
      acl = { ready:false,is_owner:false,user:uid,loading:false,error:clean(err?.message || err) };
    }
    if (S()?.page === 'audit') {
      try { renderPage(); } catch (_) {}
    }
  }
  function checkAcl() {
    const uid = clean(S()?.session?.user?.id || '');
    if (uid && acl.user !== uid) acl = { ready:false,is_owner:false,user:'',loading:false,error:'' };
    if (uid && !acl.ready && !acl.loading && !acl.error) Promise.resolve().then(loadAcl);
    return acl.ready;
  }
  function modeTag(a) {
    if (!canViewAdminAudit()) return '';
    return modeOf(a) === 'admin' ? '<span class="v673-tag private">Admin · ส่วนตัว</span>' : '<span class="v673-tag staff">Staff</span>';
  }
  function diffHtml(a, compact) {
    const diff = differences(a);
    if (!diff.length) return `<span class="v673-muted">${esc(summary(a))}</span>`;
    const take = compact ? diff.slice(0,2) : diff;
    return `<div class="v673-diffs">${take.map(d => `<div><b>${esc(d.field)}:</b> <span class="v673-old">${esc(d.before)}</span> <span class="v673-arrow">→</span> <strong>${esc(d.after)}</strong></div>`).join('')}${compact && diff.length > 2 ? `<small class="v673-muted">และอีก ${diff.length-2} รายการ</small>` : ''}</div>`;
  }
  function rowHtml(a) {
    return `<tr><td><div class="v673-date">${esc(date(a.created_at))}</div></td>
      <td><strong class="v673-actor">${esc(actorName(a))}</strong>${canViewAdminAudit()?`<div>${modeTag(a)}</div>`:''}</td>
      <td><b>${esc(labelAction(a))}</b><div class="v673-muted">${esc(prettyTable(a))}</div></td>
      <td><div>${esc(summary(a))}</div>${diffHtml(a,true)}<button type="button" class="tiny-btn" data-audit-detail="${esc(a.id)}">รายละเอียด</button></td></tr>`;
  }
  function cardHtml(a) { return `<article class="v673-entry"><div class="v673-entry-head"><strong>${esc(actorName(a))}</strong>${modeTag(a)}</div>
    <div class="v673-muted">${esc(date(a.created_at))}</div>
    <div><b>${esc(labelAction(a))}</b> · ${esc(prettyTable(a))}</div>
    <div>${esc(summary(a))}</div>${diffHtml(a,true)}<button type="button" class="tiny-btn" data-audit-detail="${esc(a.id)}">รายละเอียด</button></article>`; }
  function renderNewAuditPage() {
    const ready = checkAcl();
    if (!ready) {
      return `<section class="card v673-audit-page"><h3>ประวัติการใช้งาน (Audit Log)</h3><div class="notice">${acl.error ? 'ยังไม่สามารถยืนยันสิทธิ์ได้ จึงไม่แสดงข้อมูล Audit Log เพื่อความปลอดภัย กรุณาติดตั้ง SQL ของ v673 ใน Supabase ก่อนเปิดใช้งาน' : 'กำลังตรวจสอบสิทธิ์การเข้าถึงข้อมูล Audit Log…'}</div>${acl.error ? `<p class="hint">${esc(acl.error)}</p><button type="button" class="ghost-btn" data-v673-retry>ลองตรวจสอบใหม่</button>` : ''}</section>`;
    }
    const adminView = canViewAdminAudit();
    // Don't carry an old Admin-only filter into Staff view (empty list bug).
    if (!adminView) filters.mode = 'all';
    const source = rowsVisible(), rows = rowsFiltered();
    const actors = [...new Map(source.filter(a=>a.actor_id).map(a=>[String(a.actor_id),actorName(a)])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'th'));
    const opts = (value,label,selected) => `<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(label)}</option>`;
    return `<div class="card v673-audit-page">
      <div class="section-title"><div><h3>ประวัติการใช้งาน · ใครทำอะไร</h3><p class="hint">แสดงผู้ทำ เวลา รายการที่เปลี่ยน และข้อมูลก่อน–หลังแบบอ่านง่าย</p></div><button type="button" class="ghost-btn" data-export-audit-excel>Export Excel</button></div>
      <div class="toolbar audit-toolbar v673-audit-toolbar">
        <label>วันที่ <input type="date" id="auditDateInput" value="${esc(S()?.auditDate || '')}"></label>
        <button type="button" class="soft-btn" data-audit-today>วันนี้</button><button type="button" class="ghost-btn" data-audit-all>แสดงทั้งหมด</button>
      </div>
      <div class="v673-filters">
        <label>ผู้ทำ<select data-v673-filter="actor">${opts('','ทุกคน',filters.actor)}${actors.map(([id,name])=>opts(id,name,filters.actor)).join('')}</select></label>
        <label>เหตุการณ์<select data-v673-filter="action">${opts('','ทุกเหตุการณ์',filters.action)}${[['LOGIN','เข้าสู่ระบบ'],['LOGOUT','ออกจากระบบ'],['TRADE_REQUEST','ส่งคำขอขายเวร'],['TRADE_CONFIRM','ยืนยันรับเวร'],['TRADE_REJECT','ปฏิเสธขายเวร'],['TRADE_COMPLETE','บันทึกขายเวร'],['TRADE_EDIT','แก้ไขคำขอขายเวร'],['TRADE_DELETE','ลบคำขอขายเวร'],['INSERT','เพิ่มข้อมูลอื่น'],['UPDATE','แก้ไขข้อมูลอื่น'],['DELETE','ลบข้อมูลอื่น']].map(v=>opts(v[0],v[1],filters.action)).join('')}</select></label>
        ${adminView ? `<label>โหมด<select data-v673-filter="mode">${opts('all','ทุกโหมด',filters.mode)}${opts('staff','Staff',filters.mode)}${opts('admin','Admin (ส่วนตัว)',filters.mode)}</select></label>` : ''}
        <label>ค้นหา<input type="search" data-v673-filter="search" value="${esc(filters.search)}" placeholder="ค้นหาชื่อ เมนู หรือสิ่งที่แก้"></label>
      </div>
      <div class="v673-results"><b>${rows.length}</b> รายการ${source.length > 250 ? ' · หน้าจออาจแสดงข้อมูลล่าสุดเพียงบางส่วน' : ''}</div>
      ${rows.length ? `<div class="v673-audit-table table-wrap"><table><thead><tr><th>วันเวลา</th><th>ใครเป็นผู้ทำ</th><th>ทำอะไร / เมนู</th><th>รายละเอียดสิ่งที่เปลี่ยน</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div><div class="v673-audit-cards">${rows.map(cardHtml).join('')}</div>` : '<div class="empty-state">ไม่มีประวัติตรงกับตัวกรองที่เลือก</div>'}
    </div>`;
  }
  function showNewDetail(id) {
    const a = rowsVisible().find(x => String(x.id) === String(id));
    if (!a || !acl.ready) return;
    const diff = differences(a);
    const body = `<h2>ประวัติการทำรายการ</h2>
      <div class="v673-detail-fields"><div><b>ผู้ทำ</b><p>${esc(actorName(a))}</p></div><div><b>วันเวลา</b><p>${esc(date(a.created_at))}</p></div>${canViewAdminAudit() ? `<div><b>โหมด</b><p>${modeTag(a)}</p></div>` : ''}<div><b>เหตุการณ์</b><p>${esc(labelAction(a))}</p></div><div><b>เมนู</b><p>${esc(prettyTable(a))}</p></div></div>
      <h3>ทำอะไรไปบ้าง</h3><p>${esc(summary(a))}</p>${diff.length ? `<h3>ข้อมูลที่เปลี่ยน</h3>${diffHtml(a,false)}` : '<p class="hint">รายการนี้ไม่มีค่าก่อน–หลังในช่องข้อมูลที่เปิดให้แสดง</p>'}
      ${canViewAdminAudit() && modeOf(a)==='admin' ? '<p class="hint">รายการ Admin นี้มองเห็นได้เฉพาะเจ้าของ Audit Log ใน Admin mode</p>' : ''}`;
    try { showModal(body,{ large:false }); } catch (_) {}
  }
  function exportNewExcel() {
    if (!acl.ready) return;
    const data = rowsFiltered().map(a => ({ 'วันเวลา':date(a.created_at),'ผู้ทำ':actorName(a),...(canViewAdminAudit()?{'โหมด':modeOf(a)==='admin'?'Admin (ส่วนตัว)':'Staff'}:{}),'การกระทำ':labelAction(a),'เมนู':prettyTable(a),'รายละเอียด':summary(a),'ค่าที่เปลี่ยน':differences(a).map(d=>`${d.field}: ${d.before} → ${d.after}`).join(' | ') }));
    if (!window.XLSX) return;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(data.length?data:[{'รายการ':'ไม่มีข้อมูล'}]),'Audit');
    XLSX.writeFile(book,`Audit_v676_${(typeof todayStr==='function' ? todayStr() : 'export')}.xlsx`);
  }

  try { window.renderAuditPage = renderAuditPage = renderNewAuditPage; } catch (_) { window.renderAuditPage = renderNewAuditPage; }
  try { window.showAuditDetail = showAuditDetail = showNewDetail; } catch (_) { window.showAuditDetail = showNewDetail; }
  try { window.exportAuditExcel = exportAuditExcel = exportNewExcel; } catch (_) { window.exportAuditExcel = exportNewExcel; }
  try { window.getFilteredAuditLogs = getFilteredAuditLogs = rowsFiltered; } catch (_) { window.getFilteredAuditLogs = rowsFiltered; }
  document.addEventListener('change',e => {
    const input = e.target?.closest?.('[data-v673-filter]');
    if (!input) return;
    const k=input.dataset.v673Filter;
    if (Object.prototype.hasOwnProperty.call(filters,k)) filters[k]=String(input.value||'');
    try { renderPage(); } catch (_) {}
  });
  document.addEventListener('input',e => {
    const input = e.target?.closest?.('[data-v673-filter="search"]');
    if (!input) return;
    filters.search=String(input.value||'');
    // Do not rebuild the whole app on each keypress (input focus and performance).
    const panel = input.closest('.v673-audit-page');
    const rows = rowsFiltered();
    const desktop = panel?.querySelector('.v673-audit-table tbody');
    const mobile = panel?.querySelector('.v673-audit-cards');
    if (desktop) desktop.innerHTML = rows.map(rowHtml).join('');
    if (mobile) mobile.innerHTML = rows.map(cardHtml).join('');
    const count=panel?.querySelector('.v673-results b'); if(count)count.textContent=rows.length;
  });
  document.addEventListener('click',e => {
    const retry=e.target?.closest?.('[data-v673-retry]');
    if (!retry) return;
    e.preventDefault(); e.stopPropagation();
    acl = {ready:false,is_owner:false,user:'',loading:false,error:''};
    try { renderPage(); } catch (_) {}
  },true);

  const style = document.createElement('style');
  style.id='cnmi-v673-audit-css';
  style.textContent = `
    .v673-audit-page{max-width:100%;overflow:hidden}
    .v673-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.v673-filters label{font-weight:600;font-size:.87rem;color:#35566d}.v673-filters select,.v673-filters input{display:block;width:100%;box-sizing:border-box;margin-top:5px;height:43px;border:1px solid #d5e2e8;border-radius:10px;padding:7px 10px;background:#fff;color:#18364e}
    .v673-results{font-size:.9rem;color:#5a7287;margin:10px 0}.v673-audit-table table{width:100%;table-layout:auto}.v673-audit-table th{white-space:nowrap}.v673-audit-table td{vertical-align:top;padding:12px 10px;line-height:1.6;min-width:100px}.v673-audit-table td:last-child{min-width:280px}.v673-date{white-space:nowrap;font-size:.88rem}.v673-actor{display:block;max-width:230px;overflow-wrap:anywhere}.v673-muted{color:#698093;font-size:.86rem}.v673-tag{display:inline-flex;font-size:.73rem;line-height:1.4;margin-top:5px;padding:3px 7px;border-radius:7px;white-space:nowrap}.v673-tag.staff{color:#15604e;background:#e2f7ee}.v673-tag.private{color:#934455;background:#fce9ef}
    .v673-diffs{margin:6px 0;display:grid;gap:3px;font-size:.86rem;line-height:1.55}.v673-diffs>div{overflow-wrap:anywhere}.v673-old{color:#8b5960;text-decoration:line-through;text-decoration-thickness:1px}.v673-arrow{color:#677e94;margin:0 4px}.v673-diffs strong{color:#16644c}.v673-audit-cards{display:none}.v673-detail-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 12px}.v673-detail-fields p{margin:2px 0 10px;overflow-wrap:anywhere}
    @media(max-width:1000px){.v673-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:820px){.v673-audit-table{display:none}.v673-audit-cards{display:grid;gap:10px}.v673-entry{border:1px solid #d8e8f2;border-radius:13px;padding:13px;display:grid;gap:7px;background:#fff}.v673-entry-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap}.v673-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.v673-audit-toolbar{display:flex;flex-wrap:wrap}.v673-detail-fields{grid-template-columns:1fr 1fr}}@media(max-width:480px){.v673-filters{grid-template-columns:1fr 1fr}.v673-filters label:last-child{grid-column:1/-1}}`;
  document.head.appendChild(style);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v674-audit-staff-mode-view.js failed",__cnmiPatchError); }
/* ===== END patch-v674-audit-staff-mode-view.js ===== */

/* ===== BEGIN patch-v675-activity-round-save-fm-days.js ===== */
try {
/* CNMI Staff Planner v675 — show saved session assignments in activity results
   and Dashboard. The actual save and FM day-count fixes are inside the existing
   patch-v396-training-integrated.js (updated in this release).
   No DOM MutationObserver and no database migration. */
(function(){
  'use strict';
  if(window.__CNMI_V675_ACTIVITY_ROUNDS_VISIBLE__)return;
  window.__CNMI_V675_ACTIVITY_ROUNDS_VISIBLE__=true;
  const safe=value=>String(value??'');
  const esc=value=>safe(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function stateNow(){return window.state||{};}
  function rowIndex(){
    const s=stateNow();
    const m=new Map();
    for(const row of [...(s.activities||[]),...(s.activityListRowsV398||[])])if(row?.id!=null)m.set(String(row.id),row);
    return m;
  }
  function staffName(id){
    const person=(stateNow().staff||[]).find(x=>String(x?.id)===String(id));
    return safe(person?.nickname||person?.full_name||id);
  }
  function sessions(row){
    try{return window.cnmiActivitySessionsV654?.parse?.(row)||null;}
    catch(err){console.warn('v675 session summary',err);return null;}
  }
  function markup(rows){
    const lines=rows.map((round,i)=>{
      const members=(round.staff_ids||[]).map(staffName).join(', ');
      const when=safe(round.start)+'–'+safe(round.end)+' น.';
      return `<div class="v675-round-line"><strong>รอบที่ ${i+1} · ${esc(when)}</strong><span>${esc(members||'-')}</span></div>`;
    }).join('');
    return `<section class="v675-round-summary" aria-label="รายละเอียดรอบกิจกรรมที่บันทึกแล้ว"><div class="v675-round-summary-head">แบ่ง ${rows.length} รอบ · ผู้เข้าร่วมตามเวลาจริง</div>${lines}</section>`;
  }
  function decorate(html,cardSelector,attribute,insertSelector){
    if(typeof html!=='string'||!html.includes(cardSelector.slice(1)))return html;
    const m=rowIndex();
    if(![...m.values()].some(row=>sessions(row)!==null))return html;
    const template=document.createElement('template');template.innerHTML=html;
    template.content.querySelectorAll(cardSelector).forEach(card=>{
      const row=m.get(safe(card.getAttribute(attribute)));
      const rounds=row&&sessions(row);
      if(!rounds?.length||card.querySelector('.v675-round-summary'))return;
      const anchor=card.querySelector(insertSelector);
      const slot=document.createElement('template');slot.innerHTML=markup(rounds);
      if(anchor)anchor.before(slot.content);else card.appendChild(slot.content);
    });
    return template.innerHTML;
  }
  const oldActivities=window.renderActivitiesPage||(typeof renderActivitiesPage==='function'?renderActivitiesPage:null);
  if(typeof oldActivities==='function'){
    const wrapped=function renderActivitiesPageV675(){
      return decorate(oldActivities.apply(this,arguments),'.activity-row-card','data-v487-activity-id','.actions');
    };
    try{window.renderActivitiesPage=renderActivitiesPage=wrapped;}
    catch(_){window.renderActivitiesPage=wrapped;}
  }
  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV675(){
      return decorate(oldDashboard.apply(this,arguments),'.v518-dashboard-activity','data-v518-activity-id','.v518-activity-meta');
    };
    try{window.renderDashboard=renderDashboard=wrapped;}
    catch(_){window.renderDashboard=wrapped;}
  }
  const style=document.createElement('style');
  style.id='v675-activity-round-summary-style';
  style.textContent=`
    .v675-round-summary{padding:9px 11px;margin:10px 0;border:1px solid #b6dff5;border-radius:10px;background:#f2faff;font-size:12px;color:#28465c}
    .v675-round-summary-head{font-weight:700;margin-bottom:5px;color:#126a9c}
    .v675-round-line{display:grid;grid-template-columns:minmax(125px,.46fr) minmax(0,1fr);gap:8px;padding:4px 0;border-top:1px solid #e1eef7;overflow-wrap:anywhere}
    .v675-round-line strong{font-weight:700}.v675-round-line span{min-width:0}
    @media(max-width:620px){.v675-round-line{grid-template-columns:1fr;gap:2px}}
  `;
  document.head.appendChild(style);
  console.info('[V675_ACTIVITY_ROUND_SAVE_FM_HALFDAY] loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v675-activity-round-save-fm-days.js failed",__cnmiPatchError); }
/* ===== END patch-v675-activity-round-save-fm-days.js ===== */

/* ===== BEGIN patch-v678-dashboard-rounds-physician-speed.js ===== */
try {
/* CNMI Staff Planner v678 — Dashboard round details + daytime physician contact.
 * Display-only. No activity writes, roster formulas, or database migration.
 * Must run AFTER the other dashboard decorators (v675 etc).
 * No MutationObservers or repeating timers.
 */
(() => {
  'use strict';
  if (window.__CNMI_V678_DASHBOARD_DETAILS__) return;
  window.__CNMI_V678_DASHBOARD_DETAILS__ = true;
  const str = value => String(value == null ? '' : value);
  const esc = value => str(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateNow = () => {try {return window.state || (typeof state !== 'undefined' ? state : {}) || {};} catch (_) {return window.state || {};}};
  const normDate = value => /^\d{4}-\d{2}-\d{2}$/.test(str(value).slice(0,10)) ? str(value).slice(0,10) : '';
  function dashboardDate() {
    try {
      return normDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || normDate(new URLSearchParams(str(location.hash).split('?')[1] || '').get('date'))
        || normDate(stateNow().dashboardDateV443)
        || normDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) {return normDate(stateNow().dashboardDateV443);}
  }
  function nameFor(id) {
    const row = (stateNow().staff || []).find(p => str(p?.id) === str(id));
    return str(row?.nickname || row?.full_name || row?.email || id);
  }
  // The V671 parser is authoritative; no attempt is made to manufacture rounds
  // from free-text notes or a combined participant list.
  function roundsFor(row) {
    if (!row || !str(row.note).includes('[[CNMI-ACTIVITY-ROUNDS-V654:')) return null;
    try {
      const rounds = window.cnmiActivitySessionsV654?.parse?.(row);
      return Array.isArray(rounds) ? rounds : null;
    } catch (_) {return null;}
  }
  function roundSummary(rounds) {
    if (!rounds?.length) return '';
    const uniquePeople = new Set(rounds.flatMap(r => r.staff_ids || []).map(str));
    return `<section class="v678-activity-rounds" aria-label="รายชื่อผู้เข้าอบรมแยกตามรอบ">
      <div class="v678-round-head">แบ่ง ${rounds.length} รอบ · ผู้เข้าร่วม ${uniquePeople.size} คน</div>
      ${rounds.map((r,i) => {
        const people = (r.staff_ids || []).map(nameFor);
        return `<div class="v678-round-row"><div class="v678-round-when"><strong>รอบที่ ${i+1}</strong><span>${esc(r.date||'')} · ${esc(r.start||'-')}–${esc(r.end||'-')} น.</span></div><div class="v678-round-people">${people.length?people.map(n=>`<span class="v678-person">${esc(n)}</span>`).join(''):'<span>ไม่ได้ระบุผู้เข้าร่วม</span>'}</div></div>`;
      }).join('')}
    </section>`;
  }
  function decorateRounds(root,selector,idAttribute,byId) {
    let changed = 0;
    root.querySelectorAll(selector).forEach(card => {
      const id = card.getAttribute(idAttribute);
      const row = byId.get(str(id));
      const rounds = roundsFor(row);
      if (!rounds?.length) {
        // Older records may contain manually typed 'รอบที่ 1 / รอบที่ 2'
        // without structured metadata. Show the complete note, but DO NOT
        // invent session allocations or alter manpower calculations.
        if (/รอบที่\s*\d+/i.test(str(row?.note)) && !str(row?.note).includes('[[CNMI-ACTIVITY-ROUNDS-V654:')) {
          const note = card.querySelector('.v518-note-wrap .v518-note-clamp');
          if (note) {
            note.classList.remove('v518-note-clamp');
            note.classList.add('v678-expanded-legacy-note');
            card.querySelector('.v518-note-more')?.remove();
            changed++;
          }
        }
        return;
      }
      const existing = card.querySelector('.v675-round-summary,.v678-activity-rounds');
      if (existing) existing.remove();
      const doc = document.createElement('template');
      doc.innerHTML = roundSummary(rounds);
      const fragment = doc.content;
      const anchor = card.querySelector('.v518-activity-meta,.actions');
      if (anchor) anchor.before(fragment); else card.append(fragment);
      // A union of participants is not their assigned attendance time.
      const aggregate = card.querySelector('.v397-detail-line');
      if (aggregate && /ผู้เข้าร่วม/.test(str(aggregate.textContent))) {
        aggregate.textContent = 'ผู้เข้าร่วม: แสดงรายชื่อแยกตามรอบด้านล่าง';
        aggregate.classList.add('v678-union-caption');
      }
      changed++;
    });
    return changed;
  }
  function slotsFor(date) {
    try {
      const m = window.cnmiPhysicianConsultV452?.baseForDate?.(date);
      if (!m) return [];
      if (!m.weekday) return [{id:m.combined,site:'Donor & BB',time:'24 ชม.'}];
      return [
        {id:m.donor,site:'Donor',time:'08:00–16:00'},
        {id:m.bb,site:'Blood Bank',time:'08:00–16:00'},
        {id:m.combined,site:'Donor & BB',time:'16:00–08:00'}
      ];
    } catch (_) {return [];}
  }
  function siteForRow(row, mobile) {
    const source = mobile ? row.querySelector('.v456-mobile-consult-site') : row.querySelector('td:nth-child(2)');
    return str(source?.textContent).toLowerCase().trim();
  }
  function timeForRow(row, mobile) {
    return str((mobile ? row.querySelector('.v456-mobile-consult-time') : row.querySelector('td:first-child'))?.textContent);
  }
  function resolveSlot(row,slots,mobile,index,length) {
    if (slots.length === 1) return slots[0];
    const site = siteForRow(row,mobile),time=timeForRow(row,mobile);
    if (/donor\s*(?:&|and|\+)\s*(?:bb|blood\s*bank)/i.test(site) || /16:?00\s*[–-]\s*08:?00|24\s*ชม/.test(time)) return slots.find(s=>s.site==='Donor & BB');
    if (/blood\s*bank|คลังเลือด/.test(site)) return slots.find(s=>s.site==='Blood Bank');
    if (/\bdonor\b|ห้องบริจาค/.test(site)) return slots.find(s=>s.site==='Donor');
    return length === slots.length ? slots[index] : null;
  }
  function makeCallable(root,date) {
    const card = root.querySelector('[data-v452-physician-card]');
    if (!card) return 0;
    const slots = slotsFor(date);
    if (!slots.length) return 0;
    let count = 0;
    for (const [selector,mobile] of [['.v452-dashboard-table tbody tr',false],['.v456-mobile-consult-row',true]]) {
      const rows = [...card.querySelectorAll(selector)];
      rows.forEach((row,i) => {
        const slot = resolveSlot(row,slots,mobile,i,rows.length);
        if (!slot?.id) return;
        const holder = mobile ? row.querySelector('.v456-mobile-consult-doctor') : row.querySelector('td:nth-child(3)');
        if (!holder || holder.querySelector('[data-v455-doctor-id],[data-v601-oncall-contact]')) return;
        const old = holder.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill');
        if (!old || old.matches('button,a') || /ยังไม่กำหนด/.test(str(old.textContent))) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${old.className} v455-doctor-contact-btn v678-doctor-call${mobile?' v456-mobile-doctor-button':''}`;
        button.setAttribute('data-v455-doctor-id',str(slot.id));
        button.setAttribute('data-v455-site',slot.site);
        button.setAttribute('data-v455-time',slot.time);
        button.setAttribute('aria-label',`${str(old.textContent).trim()} ดูเบอร์โทรและโทรหาแพทย์`);
        button.title = 'แตะเพื่อดูเบอร์โทรแพทย์';
        const label = document.createElement('span');label.textContent = str(old.textContent).trim();
        const hint = document.createElement('span');hint.className='v678-call-hint';hint.textContent='☎ โทร';hint.setAttribute('aria-hidden','true');
        button.append(label,hint);
        old.replaceWith(button);count++;
      });
    }
    return count;
  }
  const prev = window.renderDashboard || (typeof renderDashboard === 'function' ? renderDashboard : null);
  if (typeof prev === 'function') {
    const wrapped = function renderDashboardV678() {
      const html = prev.apply(this,arguments);
      if (typeof html !== 'string') return html;
      if (!html.includes('v518-dashboard-activity') && !html.includes('data-v452-physician-card')) return html;
      try {
        const s = stateNow();
        const rows = s.activities || [];
        const hasRounds = Array.isArray(rows) && rows.some(a=>roundsFor(a)?.length || /รอบที่\s*\d+/i.test(str(a?.note)));
        const tpl = document.createElement('template');tpl.innerHTML = html;
        let updated = 0;
        if (hasRounds) {
          const m = new Map([...(s.activityListRowsV398 || []),...rows].filter(r=>r?.id!=null).map(r=>[str(r.id),r]));
          updated += decorateRounds(tpl.content,'.v518-dashboard-activity','data-v518-activity-id',m);
        }
        updated += makeCallable(tpl.content,dashboardDate());
        return updated ? tpl.innerHTML : html;
      } catch (err) { console.warn('[v678] Dashboard decoration skipped',err);return html; }
    };
    try {window.renderDashboard = renderDashboard = wrapped;} catch (_) {window.renderDashboard = wrapped;}
  }
  const activityPrev = window.renderActivitiesPage || (typeof renderActivitiesPage === 'function' ? renderActivitiesPage : null);
  if (typeof activityPrev === 'function') {
    const wrapped = function renderActivitiesPageV678() {
      const html = activityPrev.apply(this,arguments);
      if (typeof html !== 'string' || !html.includes('activity-row-card')) return html;
      const rows = [...(stateNow().activityListRowsV398||[]),...(stateNow().activities||[])];
      if (!rows.some(r=>roundsFor(r)?.length)) return html;
      try {
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const m=new Map(rows.filter(r=>r?.id!=null).map(r=>[str(r.id),r]));
        return decorateRounds(tpl.content,'.activity-row-card','data-v487-activity-id',m)?tpl.innerHTML:html;
      } catch (err) {console.warn('[v678] Activity rounds decoration skipped',err);return html;}
    };
    try {window.renderActivitiesPage = renderActivitiesPage = wrapped;} catch (_) {window.renderActivitiesPage = wrapped;}
  }
  const css = document.createElement('style');css.id='v678-dashboard-details-css';
  css.textContent = `
    .v678-activity-rounds{margin:10px 0 8px;padding:9px 11px;border:1px solid #b9dcec;border-radius:11px;background:#f5fbff;color:#25465d;font-size:12px}
    .v678-round-head{font-weight:800;margin-bottom:7px;color:#156897}
    .v678-round-row{display:grid;grid-template-columns:minmax(130px,215px) minmax(0,1fr);gap:8px;padding:8px 0;border-top:1px solid #dcecf5}
    .v678-round-when{display:grid;align-content:start;gap:2px}.v678-round-when span{font-size:11px;color:#59788e}
    .v678-round-people{display:flex;flex-wrap:wrap;gap:5px;align-items:start}.v678-person{border:1px solid #c8e3ef;border-radius:8px;background:#fff;padding:3px 7px;font-weight:650;overflow-wrap:anywhere}
    .v678-union-caption{color:#58788f!important;font-size:12px!important}
    .v678-expanded-legacy-note{white-space:pre-wrap!important;display:block!important;overflow:visible!important;-webkit-line-clamp:unset!important}
    .v678-doctor-call{appearance:none!important;cursor:pointer!important;display:inline-flex!important;gap:6px;align-items:center;flex-wrap:wrap;font-family:inherit;text-align:left;max-width:100%;min-height:34px}
    .v678-call-hint{font-weight:800;border-radius:999px;border:1px solid currentColor;padding:2px 6px;white-space:nowrap;font-size:10px}
    .v678-doctor-call:focus-visible{outline:2px solid #1672ad;outline-offset:2px}
    /* Avoid giant empty statistic cards stretched to the manpower card's height. */
    .v401-dashboard-stats{align-items:start!important}
    @media(max-width:620px){.v678-round-row{grid-template-columns:1fr;gap:5px}.v678-activity-rounds{padding:8px}}
  `;
  document.head.appendChild(css);
  window.cnmiV678 = {roundsFor, roundSummary, makeCallable, dashboardDate};
  console.info('[CNMI v678] dashboard rounds, physician calls and compact stats loaded');
})();

} catch (__cnmiPatchError) { console.error("[CNMI v678] patch-v678-dashboard-rounds-physician-speed.js failed",__cnmiPatchError); }
/* ===== END patch-v678-dashboard-rounds-physician-speed.js ===== */

/* ===== BEGIN patch-v679-physician-daytime-call-visible-after-render.js ===== */
try {
/* CNMI Staff Planner v679 — visible daytime physician contact after dashboard render.
 * Display-only; no changes to physician assignments, leave/activity status,
 * on-call rules, phone storage, permissions, or database.
 * Adds an independent phone button rather than changing leave/activity badges.
 */
(() => {
  'use strict';
  if (window.__CNMI_V679_PHYSICIAN_DAYTIME_CALL_VISIBLE__) return;
  window.__CNMI_V679_PHYSICIAN_DAYTIME_CALL_VISIBLE__ = true;
  const VERSION = 'V679_PHYSICIAN_DAYTIME_CALL_VISIBLE';
  const string = v => String(v == null ? '' : v).trim();
  const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(string(v).slice(0,10)) ? string(v).slice(0,10) : '';
  function S() { try { return window.state || (typeof state !== 'undefined' ? state : {}) || {}; } catch (_) { return window.state || {}; } }
  function date() {
    try {
      return validDate(window.cnmiDashboardDateV443?.selectedDate?.())
        || validDate(S().dashboardDateV443)
        || validDate(new URLSearchParams(string(location.hash).split('?')[1] || '').get('date'))
        || validDate(typeof todayStr === 'function' ? todayStr() : '');
    } catch (_) { return validDate(S().dashboardDateV443); }
  }
  function modelFor(day) { try { return window.cnmiPhysicianConsultV452?.baseForDate?.(day) || null; } catch (_) { return null; } }
  function person(id) { return (S().staff || []).find(p => string(p?.id) === string(id)) || null; }
  // Compare the name in the visible badge with the actual physician assignment.
  // Never attach a phone control to a row showing a different / stale physician.
  function compactName(v) {
    return string(v).replace(/(?:นายแพทย์|แพทย์หญิง|นางสาว|คุณ|นาย|นาง|หมอ|พญ\.?|นพ\.?|ดร\.?)/gi, '').replace(/[\s.·•()\[\]\-]/g, '').toLowerCase();
  }
  function nameMatches(holder, p, expectedId) {
    if (!p) return false;
    const assigned = holder.querySelector('[data-v455-doctor-id],[data-v601-doctor-id]');
    if (assigned && (assigned.getAttribute('data-v455-doctor-id') || assigned.getAttribute('data-v601-doctor-id')) === string(expectedId)) return true;
    const label = compactName(holder.textContent);
    const aliases = [p.nickname,p.full_name].map(compactName).filter(n => n.length >= 2);
    return aliases.some(n => label.includes(n));
  }
  function rowSlot(row, model, mobile) {
    if (!model?.weekday) return null;
    const site = string((mobile ? row.querySelector('.v456-mobile-consult-site') : row.querySelector('td:nth-child(2)'))?.textContent).toLowerCase();
    const time = string((mobile ? row.querySelector('.v456-mobile-consult-time') : row.querySelector('td:first-child'))?.textContent);
    if (/16:?00\s*[–-]\s*08:?00|24\s*ชม|ตลอดวัน|นอกเวลา/i.test(time)) return null;
    if (!/08:?00\s*[–-]\s*16:?00/i.test(time)) return null;
    if (/blood\s*bank|คลังเลือด/i.test(site)) return {id:model.bb,site:'Blood Bank',time:'08:00–16:00'};
    if (/^donor$|ห้องบริจาค/i.test(site)) return {id:model.donor,site:'Donor',time:'08:00–16:00'};
    return null;
  }
  function addPhoneToRow(row,model,mobile) {
    const slot = rowSlot(row,model,mobile);
    if (!slot?.id) return false;
    const holder = mobile ? row.querySelector('.v456-mobile-consult-doctor') : row.querySelector('td:nth-child(3)');
    if (!holder || holder.querySelector('[data-v679-physician-call],[data-v601-oncall-contact],.v452-not-set')) return false;
    const badge = holder.querySelector('.v512-consult-activity,.v510-consult-leave,.v452-doctor-pill,[data-v455-doctor-id]');
    if (!badge || /ยังไม่กำหนด/.test(holder.textContent)) return false;
    if (badge.matches('button,a') && /☎|โทร/.test(badge.textContent)) return false;
    const p = person(slot.id);
    if (!nameMatches(holder,p,slot.id)) return false;
    // A distinct button stays visible even when the name must retain the amber
    // activity/leave status. It reuses the existing V455 contact popup handler.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v679-physician-call';
    button.setAttribute('data-v679-physician-call','1');
    button.setAttribute('data-v455-doctor-id',string(slot.id));
    button.setAttribute('data-v455-site',slot.site);
    button.setAttribute('data-v455-time',slot.time);
    button.textContent = '☎ โทร';
    button.setAttribute('aria-label',`ดูเบอร์โทร ${string(p.nickname || p.full_name || 'แพทย์')} เวลา ${slot.time}`);
    button.title = 'แตะเพื่อดูเบอร์โทรแพทย์';
    holder.appendChild(button);
    return true;
  }
  function decorate(root = document) {
    const card = root.querySelector?.('[data-v452-physician-card]');
    if (!card) return 0;
    const day = date(), model = modelFor(day);
    if (!model?.weekday) return 0;
    let count = 0;
    for (const row of card.querySelectorAll('.v452-dashboard-table tbody tr')) count += Number(addPhoneToRow(row,model,false));
    for (const row of card.querySelectorAll('.v456-mobile-consult-row')) count += Number(addPhoneToRow(row,model,true));
    return count;
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(cb,0);
    frame(() => {
      scheduled = false;
      try {
        if (S().page === 'dashboard' || document.querySelector('[data-v452-physician-card]')) decorate(document);
      } catch (err) { console.warn(`[${VERSION}] render hook`, err); }
    });
  }
  const priorPage = (() => { try { return window.renderPage || (typeof renderPage === 'function' ? renderPage : null); } catch (_) { return window.renderPage || null; } })();
  if (typeof priorPage === 'function' && !priorPage.__cnmiV679Wrapped) {
    const wrapped = function renderPageV679() {
      const result = priorPage.apply(this,arguments);
      schedule();
      return result;
    };
    wrapped.__cnmiV679Wrapped = true;
    try { window.renderPage = renderPage = wrapped; } catch (_) { window.renderPage = wrapped; }
  }
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('hashchange',schedule);
  // Re-apply once when returning from an inactive tab; no repeating timer and no
  // full-page MutationObserver (those could slow a large dashboard).
  document.addEventListener('visibilitychange',() => { if (!document.hidden) schedule(); });
  const css = document.createElement('style');
  css.id = 'v679-physician-phone-css';
  css.textContent = `
    .v679-physician-call{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin:3px 0 3px 6px;padding:5px 9px;min-height:30px;border:1px solid #d7a85b;border-radius:999px;background:#fff5e6;color:#875012;font:inherit;font-size:11px;font-weight:850;line-height:1.2;white-space:nowrap;cursor:pointer;touch-action:manipulation}
    .v679-physician-call:hover{background:#ffe9c5;border-color:#b9802c}
    .v679-physician-call:focus-visible{outline:2px solid #176eae;outline-offset:2px}
    @media(max-width:760px){.v679-physician-call{min-height:42px;padding:8px 12px;font-size:13px}}
  `;
  document.head.appendChild(css);
  window.cnmiPhysicianCallV679 = { version:VERSION,decorate,date,rowSlot,nameMatches,schedule };
  console.info(`[${VERSION}] visible daytime contact control installed`);
})();

} catch (__cnmiPatchError) { console.error("[CNMI v679] physician daytime call patch failed", __cnmiPatchError); }
/* ===== END patch-v679-physician-daytime-call-visible-after-render.js ===== */
