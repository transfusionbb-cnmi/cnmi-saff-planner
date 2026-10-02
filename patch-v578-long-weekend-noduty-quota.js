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
