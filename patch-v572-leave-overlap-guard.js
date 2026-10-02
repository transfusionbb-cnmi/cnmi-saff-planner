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
