/* CNMI Staff Planner V371/V527 — balanced HR dummy allocation + automatic carry forward + adjustment ledger
   - Uses V317 manual-style HR workbook and 8-hour dummy allocation as the base.
   - Automatically adds the latest carry-out to the next source month before allocation.
   - Stores an exact carry snapshot inside the existing claim_batch_id field; no new SQL/table.
   - Migrates the first carry from a V317 batch by deriving the latest exported month remainder.
   - Export history stays blank until staff, year, and month are all selected.
*/
(function(){
  'use strict';
  const VERSION='V371_BALANCED_HR_DUMMY_ALLOCATION';
  if(window.__CNMI_V371_BALANCED_HR_DUMMY_ALLOCATION__)return;
  window.__CNMI_V371_BALANCED_HR_DUMMY_ALLOCATION__=true;

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  const historyCache=new Map();
  const carryCache=new Map();
  const summaryCarryCache=new Map();
  const HISTORY_TTL=60*1000;
  const CARRY_TTL=5*60*1000;
  const CARRY_MARKER_PREFIX='V318CARRY';

  function st(){try{return state;}catch(_){return window.state||{};}}
  function db(){try{return sb;}catch(_){return window.sb||null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function pad2(n){return String(n).padStart(2,'0');}
  function round2(v){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
  function round4(v){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*10000)/10000:0;}
  function esc(v){
    try{return escapeHtml(v==null?'':String(v));}
    catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console.info(msg);}}
  function busy(on,text){try{setBusy(on,text);}catch(_){}}
  function currentStaffIdSafe(){try{return currentStaffId();}catch(_){return st()?.profile?.id||'';}}
  function dateKey(v){
    if(v instanceof Date&&!Number.isNaN(v.getTime()))return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
    try{return String(normalizeDateKey(v)||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function currentMonth(){const d=new Date();return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;}
  function monthKey(v){const k=String(v||'').slice(0,7);return /^\d{4}-\d{2}$/.test(k)?k:currentMonth();}
  function monthRange(v){const key=monthKey(v),[y,m]=key.split('-').map(Number),last=new Date(y,m,0).getDate();return {month:key,start:`${key}-01`,end:`${key}-${pad2(last)}`};}
  const HR_LOCK_STORAGE_PREFIX='cnmi.staffplanner.hrLockedDatesV604.';
  function hrLockedDates(month){
    const key=monthKey(month),stateMap=st().hrLockedDatesV604ByMonth||{};
    if(Array.isArray(stateMap[key]))return [...new Set(stateMap[key].map(dateKey).filter(Boolean))].sort();
    let dates=[];try{dates=JSON.parse(localStorage.getItem(HR_LOCK_STORAGE_PREFIX+key)||'[]');}catch(_){dates=[];}
    dates=[...new Set((Array.isArray(dates)?dates:[]).map(dateKey).filter(Boolean))].sort();
    st().hrLockedDatesV604ByMonth={...stateMap,[key]:dates};return dates;
  }
  function saveHrLockedDates(month,dates){
    const key=monthKey(month),cycle=cycleRange(key),clean=[...new Set((dates||[]).map(dateKey).filter(d=>d>=cycle.start&&d<=cycle.end))].sort();
    st().hrLockedDatesV604ByMonth={...(st().hrLockedDatesV604ByMonth||{}),[key]:clean};
    try{localStorage.setItem(HR_LOCK_STORAGE_PREFIX+key,JSON.stringify(clean));}catch(_){ }
    return clean;
  }
  /* V664: plan is local to the source month and this browser, matching the
     existing HR-dummy locked-date setting. Old V604 dates remain readable. */
  const HR_DATE_PLAN_V664='cnmi.staffplanner.hrDatePlanV664.';
  function cleanPlanDates(month,dates){
    const cycle=cycleRange(month);
    return [...new Set((Array.isArray(dates)?dates:[]).map(dateKey).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>=cycle.start&&d<=cycle.end))].sort();
  }
  function hrDatePlan(month){
    const key=monthKey(month),cached=st().hrDatePlanV664ByMonth||{};
    if(cached[key])return {...cached[key],dates:[...(cached[key].dates||[])]};
    let saved=null;try{saved=JSON.parse(localStorage.getItem(HR_DATE_PLAN_V664+key)||'null');}catch(_){ }
    const legacy=hrLockedDates(key);
    const dates=cleanPlanDates(key,Array.isArray(saved?.dates)?saved.dates:legacy);
    const mode=saved?.mode==='quota'?'quota':'all';
    const quota=Math.max(1,Math.min(31,Math.floor(Number(saved?.quota||1))||1));
    const plan={dates,mode,quota};
    st().hrDatePlanV664ByMonth={...cached,[key]:plan};
    return {...plan,dates:[...dates]};
  }
  function saveHrDatePlan(month,policy){
    const key=monthKey(month),dates=cleanPlanDates(key,policy?.dates);
    const plan={dates,mode:policy?.mode==='all'?'all':'quota',quota:Math.max(1,Math.min(31,Math.floor(Number(policy?.quota||1))||1))};
    st().hrDatePlanV664ByMonth={...(st().hrDatePlanV664ByMonth||{}),[key]:plan};
    saveHrLockedDates(key,dates); /* keep V604 API in sync, without changing OT rows */
    try{localStorage.setItem(HR_DATE_PLAN_V664+key,JSON.stringify(plan));}catch(_){ }
    st().hrDatePreviewV664=null;
    return plan;
  }
  function hrDatePlanFromForm(month){
    const current=hrDatePlan(month),mode=String(document.getElementById('hrDateModeV664')?.value||current.mode),raw=Number(document.getElementById('hrDateQuotaV664')?.value||current.quota);
    return {...current,mode:mode==='all'?'all':'quota',quota:Number.isInteger(raw)?raw:0};
  }
  function hrDatePlanError(plan){
    if(!plan.dates.length)return 'กรุณาเพิ่มวันที่พิเศษก่อน';
    if(plan.mode==='quota'&&(!Number.isInteger(Number(plan.quota))||plan.quota<1||plan.quota>plan.dates.length))return `จำนวนวันต่อคนต้องอยู่ระหว่าง 1–${plan.dates.length} วัน`;
    return '';
  }
  function hrLockedDatePanel(month){
    const key=monthKey(month),cycle=cycleRange(key),plan=hrDatePlan(key),dates=plan.dates;
    const tags=dates.length?dates.map(d=>`<span class="badge blue" style="display:inline-flex;align-items:center;gap:6px;margin:2px 4px 2px 0">${esc(fmtDate(d))}<button type="button" class="tiny-btn" style="padding:1px 6px" data-v604-remove-lock-date="${esc(d)}" title="เอาวันนี้ออก">×</button></span>`).join(''):'<span class="muted">ยังไม่ได้เลือกวันพิเศษ — ใช้การเฉลี่ยตามปกติ</span>';
    const p=st().hrDatePreviewV664,preview=p&&p.month===key&&p.signature===JSON.stringify(plan)?p:null;
    const previewHtml=preview?`<div class="notice compact" style="margin-top:12px"><b>ตัวอย่างก่อน Export</b> • ${esc(preview.summary)}${preview.warnings?.length?`<div style="color:#b45309;margin-top:6px">${preview.warnings.map(esc).join('<br>')}</div>`:''}<details style="margin-top:8px" open><summary>ตรวจยอดทบและชั่วโมงเบิก HR ก่อน Export (${(preview.carries||[]).length} คน)</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>เจ้าหน้าที่</th><th>ทบจากเดือน</th><th>ยอดทบ (ชม.)</th><th>OT เดือนนี้ (ชม.)</th><th>เบิก HR (ชม.)</th><th>ยอดเงิน (บาท)</th></tr></thead><tbody>${(preview.carries||[]).map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.sourceMonth||'-')}</td><td><b>${esc(hours(r.opening))}</b></td><td>${esc(hours(r.current))}</td><td>${esc(hours(r.claimed))}</td><td>${esc(money(r.money))}</td></tr>`).join('')}</tbody></table></div><p class="hint">แหล่งยอดทบ: บัญชี OT ต่อเนื่องเดียวกับหน้าเว็บ (V368) • อ่านข้อมูลสดก่อน Export</p></details><details style="margin-top:8px"><summary>ดูรายชื่อและจำนวนในแต่ละวัน</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>วันที่ HR dummy</th><th>รายชื่อ</th><th>จำนวน</th></tr></thead><tbody>${(preview.days||[]).map(r=>`<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.names.join(', ')||'-')}</td><td>${r.names.length}</td></tr>`).join('')}</tbody></table></div></details><details style="margin-top:8px"><summary>ดูจำนวนวันต่อเจ้าหน้าที่แต่ละคน</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>เจ้าหน้าที่</th><th>จำนวนวันที่มีชื่อ</th></tr></thead><tbody>${(preview.staffCounts||[]).map(r=>`<tr><td>${esc(r.name)}</td><td>${r.count}</td></tr>`).join('')}</tbody></table></div></details></div>`:'';
    return `<div class="card" data-v604-lock-panel data-v664-distribution-panel style="margin-bottom:12px"><div class="section-title"><div><h3>กระจายชื่อช่วงวันพิเศษใน HR dummy</h3><p class="hint">เลือกวันในรอบ ${esc(cycle.start)} ถึง ${esc(cycle.end)} • ใช้หน่วย OT 8 ชม. ที่มีอยู่เท่านั้น ไม่เพิ่มชั่วโมงหรือยอดเงินเบิกจริง</p></div></div>
      <div class="toolbar compact-filter" style="align-items:end;gap:10px;flex-wrap:wrap">
       <label>จากวันที่ <input type="date" id="hrDateFromV664" min="${esc(cycle.start)}" max="${esc(cycle.end)}" value="${esc(dates[0]||cycle.start)}"></label>
       <label>ถึงวันที่ <input type="date" id="hrDateToV664" min="${esc(cycle.start)}" max="${esc(cycle.end)}" value="${esc(dates[dates.length-1]||cycle.start)}"></label>
       <button type="button" class="ghost-btn" data-v664-add-date-range>+ เพิ่มช่วงวัน</button>
       <label>หรือเลือกวันเดี่ยว <input id="hrLockDateV604" type="date" min="${esc(cycle.start)}" max="${esc(cycle.end)}"></label>
       <button type="button" class="ghost-btn" data-v604-add-lock-date>+ เพิ่มวัน</button>
      </div>
      <div style="margin-top:8px">${tags} ${dates.length?'<button type="button" class="tiny-btn" data-v664-clear-dates>ล้างวันที่เลือก</button>':''}</div>
      <div class="toolbar compact-filter" style="align-items:end;gap:10px;flex-wrap:wrap;margin-top:12px">
       <label>เงื่อนไขรายชื่อ <select id="hrDateModeV664"><option value="quota" ${plan.mode==='quota'?'selected':''}>แต่ละคนมีชื่อจำนวนวันที่กำหนด</option><option value="all" ${plan.mode==='all'?'selected':''}>ทุกคนมีชื่อทุกวันที่เลือก (แบบเดิม)</option></select></label>
       <label>วันที่มีชื่อต่อคน <input type="number" id="hrDateQuotaV664" min="1" max="${Math.max(1,dates.length)}" step="1" value="${esc(plan.quota)}" ${plan.mode==='all'?'disabled':''} style="max-width:110px"></label>
       <button type="button" class="ghost-btn" data-v664-save-date-plan>บันทึกเงื่อนไข</button>
       <button type="button" class="primary-btn" data-v664-preview-dummy ${dates.length?'':'disabled'}>ดูตัวอย่างก่อน Export</button>
      </div>
      <p class="hint" style="margin-top:8px">ตัวอย่าง: 13 คน เลือก 3 วัน กำหนดคนละ 2 วัน → 26 รายชื่อ แบ่งใกล้เคียงกัน (เช่น 9/9/8) คนหนึ่งไม่ซ้ำวัน • ระบบเคารพวันลาและความจุสูงสุด 6 คนต่อช่วงเวลา</p>
      <p class="hint">"ทุกคน" หมายถึงเจ้าหน้าที่ที่มีหน่วย OT พร้อมเบิกจริง ระบบไม่สร้าง OT เพิ่มให้คนที่ชั่วโมงไม่พอ หากจัดตามเงื่อนไขไม่ได้จะหยุด Export พร้อมแจ้งเหตุผล การตั้งค่านี้บันทึกในเบราว์เซอร์ที่ใช้ Export</p>
      ${previewHtml}</div>`;
  }

  function nextMonth(v){const [y,m]=monthKey(v).split('-').map(Number),d=new Date(y,m,1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;}
  function previousMonth(v){const [y,m]=monthKey(v).split('-').map(Number),d=new Date(y,m-2,1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;}
  function cycleRange(v){const key=monthKey(v);return {start:`${key}-16`,end:`${nextMonth(key)}-15`};}
  function addDays(key,n){const d=new Date(`${dateKey(key)}T12:00:00`);d.setDate(d.getDate()+Number(n||0));return dateKey(d);}
  function datesBetween(start,end){const out=[];let d=dateKey(start),guard=0;while(d&&d<=end&&guard++<100){out.push(d);d=addDays(d,1);}return out;}
  function fmtDate(v){try{return formatThaiDate(dateKey(v));}catch(_){return dateKey(v)||'-';}}
  function fmtDateTime(v){try{return v?new Date(v).toLocaleString('th-TH'):'-';}catch(_){return String(v||'-');}}
  function hours(v,digits=2){const n=round2(v);if(Math.abs(n)<0.005)return '0';return Number.isInteger(n)?String(n):n.toFixed(digits).replace(/0+$/,'').replace(/\.$/,'');}
  function money(v){const n=round2(v);return `${n.toLocaleString('th-TH',{maximumFractionDigits:2})} บ.`;}
  function staffRecord(id){return (st().staff||[]).find(x=>String(x.id)===String(id))||null;}
  function staffNickSafe(id){const s=staffRecord(id)||{};return s.nickname||s.full_name||s.name||s.email||String(id||'-');}
  function staffFullName(id){const s=staffRecord(id)||{};return s.full_name||s.name||s.nickname||s.email||String(id||'-');}
  function staffPillSafe(id){try{return staffPill(id);}catch(_){return `<span class="staff-pill">${esc(staffNickSafe(id))}</span>`;}}
  function baseType(id){const s=staffRecord(id)||{};return /เคิก|clerk/i.test(String(s.staff_type||s.type||''))?'เคิก':'MT';}
  function baseRate(id){return baseType(id)==='เคิก'?90:130;}
  function claimCodes(id){return baseType(id)==='เคิก'?{normal:'00000076',holiday:'00000077',premium:'00000076',special:'00000328'}:{normal:'00000074',holiday:'00000075',premium:'00000076',special:'00000328'};}
  function employeeCode(id){const s=staffRecord(id)||{},raw=String(s.employee_code||s.emp_code||s.code||'').replace(/\D/g,'');return raw?raw.padStart(7,'0'):'';}
  function isTang(id){const s=staffRecord(id)||{},raw=`${s.nickname||''} ${s.full_name||''}`;return /(^|\s)แตง($|\s)|อริภัศ/.test(raw);}
  function isPumpingText(row){return /ปั่นเลือด|ห้อง\s*donor|blood\s*spin/i.test(`${row?.reason||''} ${row?.note||''}`);}
  function publicHoliday(date,holidayRows){
    const d=dateKey(date);
    if(Array.isArray(holidayRows))return holidayRows.some(h=>dateKey(h.holiday_date||h.date)===d);
    try{return !!isHolidayDate(d);}catch(_){return false;}
  }
  function weekend(date){const d=new Date(`${dateKey(date)}T12:00:00`),day=d.getDay();return day===0||day===6;}
  function thaiWeekday(date){return ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'][new Date(`${dateKey(date)}T12:00:00`).getDay()];}
  function approved(row){const s=String(row?.status||'').trim().toLowerCase();return ['อนุมัติ','approved','approve'].includes(s);}
  function claimStatus(row){const s=String(row?.claim_status||'pending').trim().toLowerCase();return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s)?'exported':'pending';}
  function rowBatch(row){return row?.export_batch_id||row?.batch_id||row?.claim_batch_id||'ไม่พบ Batch ID';}
  function rowExportedAt(row){return row?.exported_at||row?.export_date||row?.claimed_at||'';}
  function encodeCarryMarker(sourceMonth,carry){return `${CARRY_MARKER_PREFIX}|${monthKey(sourceMonth)}|${hours(carry)}`;}
  function parseCarryMarker(row){
    const raw=String(row?.claim_batch_id||'').trim();
    const m=raw.match(/^V318CARRY\|(\d{4}-\d{2})\|(-?\d+(?:\.\d+)?)$/);
    if(!m)return null;
    const amount=round2(m[2]);
    return {month:m[1],amount:Math.max(0,amount),at:String(rowExportedAt(row)||'')};
  }

  /* Tang must use clerk HR code/base even when the actual task is paid at MT rate. */
  const v190=window.v190HrRateNormalization;
  const originalBreakdown=v190?.otNormalizationBreakdown190;
  if(v190&&typeof originalBreakdown==='function'&&!originalBreakdown.__v318TangBase){
    const wrapped=function otNormalizationBreakdownV318(row){
      const n=originalBreakdown.call(this,row)||{};
      if(!isTang(row?.staff_id))return n;
      const actual=round2(n.actualHours||0);
      if(actual<=0)return n;
      const isHoliday=publicHoliday(row?.work_date);
      let segments=Array.isArray(n.segments)&&n.segments.length?n.segments.map(x=>({...x})):[];
      const forceMt=isPumpingText(row);
      if(!segments.length)segments=[{actualHours:actual,rateType:forceMt?'MT':'เคิก',shiftType:n.shiftType||'-',isHoliday}];
      let actualSum=0,hrSum=0;
      segments=segments.map(seg=>{
        const segActual=round2(seg.actualHours||0);
        const mtWork=forceMt||String(seg.rateType||'').toUpperCase()==='MT'||['ช3A','ช3B','ช4','ช4A','ช4B'].includes(String(seg.shiftType||''));
        const workRate=mtWork?(isHoliday?160:130):(isHoliday?120:90);
        const hr=round2(segActual*workRate/90);
        actualSum=round2(actualSum+segActual);hrSum=round2(hrSum+hr);
        return {...seg,actualHours:segActual,hrHours:hr,sourceRateType:mtWork?'MT':'เคิก',rateType:'เคิก',normalRate:90,holidayRate:90,appliedRate:workRate,workRate,isHoliday,multiplier:round2(workRate/90)};
      });
      if(Math.abs(actualSum-actual)>0.11){
        const workRate=forceMt?(isHoliday?160:130):(isHoliday?120:90);
        segments=[{actualHours:actual,hrHours:round2(actual*workRate/90),sourceRateType:forceMt?'MT':'เคิก',rateType:'เคิก',normalRate:90,holidayRate:90,appliedRate:workRate,workRate,isHoliday,multiplier:round2(workRate/90),shiftType:n.shiftType||'-'}];
        hrSum=segments[0].hrHours;
      }
      return {...n,actualHours:actual,hrHours:round2(hrSum),segments,rateType:'เคิก',isHoliday,hrBaseRate:90,tangMtConversion:segments.some(x=>x.sourceRateType==='MT')};
    };
    wrapped.__v318TangBase=true;
    v190.otNormalizationBreakdown190=wrapped;
  }

  function normalize(row){
    try{
      const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if(n&&Number.isFinite(Number(n.hrHours))){
        const base=baseRate(row?.staff_id);
        const segments=Array.isArray(n.segments)?n.segments:[];
        const actualMoney=round2(segments.length?segments.reduce((sum,x)=>sum+Number(x.actualHours||0)*Number(x.appliedRate||base),0):Number(n.hrHours||0)*base);
        return {...n,actualHours:round2(n.actualHours),hrHours:round2(n.hrHours),baseRate:base,actualMoney};
      }
    }catch(_){ }
    let actual=0;try{actual=round2(calcOtHours(row)||0);}catch(_){actual=round2(row?.manual_hours||row?.requested_hours||row?.hours||0);}
    return {actualHours:actual,hrHours:actual,baseRate:baseRate(row?.staff_id),actualMoney:round2(actual*baseRate(row?.staff_id)),segments:[],shiftType:'-',rateType:baseType(row?.staff_id),isHoliday:publicHoliday(row?.work_date)};
  }

  function leaveEffective(l){
    const type=String(l?.type||l?.leave_type||'').trim();
    if(!type||type==='ไม่รับเวร')return false;
    const status=String(l?.status||'').trim().toLowerCase();
    return !/reject|cancelled|canceled|ไม่อนุมัติ|ยกเลิก/.test(status);
  }
  function hasLeave(staffId,date,leaves){
    const d=dateKey(date);
    return (leaves||[]).some(l=>String(l.staff_id)===String(staffId)&&leaveEffective(l)&&d>=dateKey(l.start_date||l.leave_date||l.date)&&d<=dateKey(l.end_date||l.start_date||l.leave_date||l.date));
  }
  function mergeRows(current,incoming,keyFn){
    const map=new Map();(current||[]).forEach(x=>map.set(keyFn(x),x));(incoming||[]).forEach(x=>map.set(keyFn(x),x));return [...map.values()];
  }
  async function queryCarryIn(month,force=false){
    const source=monthRange(month),key=source.month,saved=carryCache.get(key);
    if(!force&&saved&&saved.expires>Date.now())return saved.map;
    const client=db();if(!client)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    /* Runs only when Admin presses Export. It does not preload with the OT page. */
    const res=await client.from('ot_requests').select('*').lt('work_date',source.start).order('work_date',{ascending:false}).limit(5000);
    if(res.error)throw res.error;
    const exported=(res.data||[]).filter(row=>approved(row));
    const latestRowsByStaff=new Map(),markersByStaff=new Map();
    exported.forEach(row=>{
      const staffId=String(row.staff_id||''),mk=String(row.work_date||'').slice(0,7);
      if(!staffId||!/^[0-9]{4}-[0-9]{2}$/.test(mk)||mk>=source.month)return;
      const g=latestRowsByStaff.get(staffId);
      if(!g||mk>g.month)latestRowsByStaff.set(staffId,{month:mk,rows:[row]});
      else if(mk===g.month)g.rows.push(row);
      const marker=parseCarryMarker(row);
      if(marker&&marker.month<source.month){
        if(!markersByStaff.has(staffId))markersByStaff.set(staffId,[]);
        markersByStaff.get(staffId).push({...marker,rowId:row.id||''});
      }
    });
    markersByStaff.forEach(list=>list.sort((a,b)=>a.month.localeCompare(b.month)||a.at.localeCompare(b.at)));
    const out=new Map(),staffIds=new Set([...latestRowsByStaff.keys(),...markersByStaff.keys()]);
    staffIds.forEach(staffId=>{
      const latest=latestRowsByStaff.get(staffId),markers=markersByStaff.get(staffId)||[];
      const marker=markers[markers.length-1];
      /* A carry marker saved for the immediately previous month is the final
         carry-out shown by that month.  Pass it forward unchanged.  Do not
         reconstruct it from OT rows because that can turn (for example) June's
         displayed 5.14 into an unrelated 7.6 when July is opened. */
      if(latest&&latest.month===previousMonth(source.month)){
        const current=round2(latest.rows.reduce((sum,row)=>sum+Number(normalize(row).hrHours||0),0));
        /* Match the carry-out shown on the immediately previous month's
           summary.  An older marker is not an input here: adding it again is
           what changed June 5.14 into July 7.6. */
        const claimed=Math.floor((current+1e-7)/8)*8,amount=round2(Math.max(0,current-claimed));
        out.set(staffId,{amount,sourceMonth:latest.month,source:'previous-month-live-summary',anchorRowId:latest.rows[0]?.id||marker?.rowId||''});return;
      }
      const directMarker=[...markers].reverse().find(x=>x.month===previousMonth(source.month));
      if(directMarker){
        out.set(staffId,{amount:round2(directMarker.amount),sourceMonth:directMarker.month,source:'direct-previous-month-carry-fallback',anchorRowId:directMarker.rowId||''});return;
      }
      if(marker&&(!latest||marker.month>=latest.month)){
        out.set(staffId,{amount:round2(marker.amount),sourceMonth:marker.month,source:'saved-v318',anchorRowId:marker.rowId||''});return;
      }
      if(!latest)return;
      const total=round2(latest.rows.reduce((sum,row)=>sum+Number(normalize(row).hrHours||0),0));
      const claimed=Math.floor((total+1e-7)/8)*8,amount=round2(Math.max(0,total-claimed));
      out.set(staffId,{amount,sourceMonth:latest.month,source:'derived-v317',anchorRowId:latest.rows[0]?.id||''});
    });
    carryCache.set(key,{map:out,expires:Date.now()+CARRY_TTL});
    return out;
  }
  async function queryCarryInSummary(month,force=false){
    const source=monthRange(month),key=source.month,saved=summaryCarryCache.get(key),full=carryCache.get(key);
    if(!force&&full&&full.expires>Date.now())return full.map;
    if(!force&&saved&&saved.expires>Date.now())return saved.map;
    const client=db();if(!client)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    /* Summary mode keeps egress low: marker rows contain the saved V318 carry.
       Only the immediately previous month is read as a lightweight V317 fallback. */
    const prev=monthRange(previousMonth(source.month));
    const [markers,previousRows]=await Promise.all([
      client.from('ot_requests').select('id,staff_id,work_date,claim_batch_id,exported_at,export_date,claimed_at').lt('work_date',source.start).like('claim_batch_id',`${CARRY_MARKER_PREFIX}|%`).order('work_date',{ascending:false}).limit(1000),
      client.from('ot_requests').select('*').gte('work_date',prev.start).lte('work_date',prev.end).order('work_date',{ascending:false})
    ]);
    if(markers.error)throw markers.error;if(previousRows.error)throw previousRows.error;
    const markersByStaff=new Map();
    (markers.data||[]).forEach(row=>{const staffId=String(row.staff_id||''),marker=parseCarryMarker(row);if(!staffId||!marker||marker.month>=source.month)return;if(!markersByStaff.has(staffId))markersByStaff.set(staffId,[]);markersByStaff.get(staffId).push({...marker,rowId:row.id||''});});
    markersByStaff.forEach(list=>list.sort((a,b)=>a.month.localeCompare(b.month)||a.at.localeCompare(b.at)));
    const fallbackByStaff=new Map();
    /* The previous month's live approved rows are the source of truth.  A saved
       marker can become stale when Admin edits a rate/hours after HR export. */
    (previousRows.data||[]).filter(row=>approved(row)).forEach(row=>{const staffId=String(row.staff_id||'');if(!staffId)return;if(!fallbackByStaff.has(staffId))fallbackByStaff.set(staffId,[]);fallbackByStaff.get(staffId).push(row);});
    const out=new Map();
    new Set([...markersByStaff.keys(),...fallbackByStaff.keys()]).forEach(staffId=>{
      const markerList=markersByStaff.get(staffId)||[],marker=markerList[markerList.length-1],rows=fallbackByStaff.get(staffId)||[];
      if(rows.length){const current=round2(rows.reduce((sum,row)=>sum+Number(normalize(row).hrHours||0),0)),claimed=Math.floor((current+1e-7)/8)*8;out.set(staffId,{amount:round2(Math.max(0,current-claimed)),sourceMonth:prev.month,source:'previous-month-live-summary',anchorRowId:rows[0]?.id||marker?.rowId||''});return;}
      const directMarker=[...markerList].reverse().find(x=>x.month===prev.month);
      if(directMarker){out.set(staffId,{amount:round2(directMarker.amount),sourceMonth:directMarker.month,source:'direct-previous-month-carry-fallback',anchorRowId:directMarker.rowId||''});return;}
      if(marker)out.set(staffId,{amount:round2(marker.amount),sourceMonth:marker.month,source:'saved-v318',anchorRowId:marker.rowId||''});
    });
    summaryCarryCache.set(key,{map:out,expires:Date.now()+CARRY_TTL});
    return out;
  }
  /* v666: Excel Export and the special-date preview must use the same live,
     cumulative June-2026 ledger as the Staff/Admin on-screen carry-in.
     The legacy lexical queryCarryIn() above is deliberately NOT called here:
     later v368 replaces the public API, not that closed-over function. */
  async function queryCarryInForHrExport(month){
    const read=window.cnmiV318?.queryCarryInSummary;
    if(typeof read!=='function'||read.__v368!==true){
      throw new Error('ยังอ่านยอดทบที่ตรงกับหน้าเว็บไม่ได้ (V368) กรุณารีเฟรชและตรวจยอดทบก่อน Export — ระบบไม่ใช้สูตรยอดทบเก่าแทน');
    }
    const carry=await read(month,true); // force fresh Supabase data; no stale in-memory carry
    if(!(carry instanceof Map))throw new Error('ยอดทบจากระบบหลักไม่อยู่ในรูปแบบที่ถูกต้อง จึงหยุด Export เพื่อป้องกันยอดเงินคลาดเคลื่อน');
    for(const [staffId,info] of carry){
      const n=Number(info?.amount);
      if(!String(staffId||'')||!Number.isFinite(n)||n< -0.001||n>=8.001){
        throw new Error('ตรวจพบยอดทบผิดรูปแบบสำหรับเจ้าหน้าที่บางราย กรุณาตรวจรายงาน OT ก่อน Export');
      }
    }
    return carry;
  }

  async function queryExportData(month){
    const client=db();if(!client)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const source=monthRange(month),cycle=cycleRange(month),holidayStart=source.start<cycle.start?source.start:cycle.start,holidayEnd=source.end>cycle.end?source.end:cycle.end;
    const queries=[
      client.from('ot_requests').select('*').gte('work_date',source.start).lte('work_date',source.end).order('work_date',{ascending:true}),
      client.from('leave_requests').select('*').gte('end_date',cycle.start).lte('start_date',cycle.end).order('start_date',{ascending:true}),
      client.from('public_holidays').select('*').gte('holiday_date',holidayStart).lte('holiday_date',holidayEnd).order('holiday_date',{ascending:true}),
      client.from('roster_assignments').select('*').gte('duty_date',source.start).lte('duty_date',source.end).order('duty_date',{ascending:true}),
      client.from('monthly_incharges').select('*').eq('month_key',source.month).limit(10),
      client.from('ot_adjustments').select('*').eq('apply_month',source.month).eq('status','pending').order('created_at',{ascending:true})
    ];
    const [ot,leaves,holidays,roster,incharges,adjustments]=await Promise.all(queries);
    for(const r of [ot,leaves,holidays,roster,incharges,adjustments])if(r?.error)throw r.error;
    const app=st();
    app.otRequests=mergeRows(app.otRequests,ot.data||[],x=>String(x.id||`${x.staff_id}|${x.work_date}|${x.created_at||''}`));
    app.leaves=mergeRows(app.leaves,leaves.data||[],x=>String(x.id||`${x.staff_id}|${x.start_date}|${x.end_date}`));
    app.holidays=mergeRows(app.holidays,holidays.data||[],x=>dateKey(x.holiday_date||x.date));
    app.rosterAssignments=mergeRows(app.rosterAssignments,roster.data||[],x=>String(x.id||`${x.staff_id}|${x.duty_date}|${x.duty_code}`));
    app.incharges=mergeRows(app.incharges,incharges.data||[],x=>String(x.id||x.month_key));
    return {source,cycle,rows:(ot.data||[]).filter(r=>approved(r)&&claimStatus(r)==='pending'),leaves:leaves.data||[],holidays:holidays.data||[],adjustments:adjustments.data||[]};
  }

  function applyAdjustmentUnits(totals,adjustments){
    const map=new Map((totals||[]).map(t=>[String(t.staff_id),t]));
    (adjustments||[]).forEach(adj=>{
      const sid=String(adj.staff_id||'');if(!sid)return;
      let t=map.get(sid);
      if(!t){
        t={staff_id:sid,actual:0,total:0,currentTotal:0,carryIn:0,carrySourceMonth:'',actualMoney:0,rows:[],baseType:baseType(sid),baseRate:baseRate(sid),employeeCode:employeeCode(sid)};
        map.set(sid,t);
      }
      if(t.regularAvailable==null)t.regularAvailable=round2(t.total||0);
      if(!Array.isArray(t.adjustments))t.adjustments=[];
      const units=round4(Number(adj.hr_unit_delta||0));
      const amount=round2(Number(adj.amount_delta||0));
      t.adjustmentUnits=(t.adjustmentUnits||0)+units;
      t.adjustmentAmount=round2((t.adjustmentAmount||0)+amount);
      t.adjustments.push(adj);
    });
    map.forEach(t=>{
      if(t.regularAvailable==null)t.regularAvailable=round2(t.total||0);
      const adjusted=round2(Number(t.regularAvailable||0)+Number(t.adjustmentUnits||0)*8);
      if(adjusted < -0.001) throw new Error(`ยอดลด OT ของ ${staffNickSafe(t.staff_id)} มากกว่ายอดที่มีในรอบนี้ กรุณาลดยอดทีละรอบ`);
      t.total=Math.max(0,adjusted);
    });
    return [...map.values()].filter(t=>Number(t.total||0)>0||Number(t.adjustmentAmount||0)!==0).sort((a,b)=>staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th'));
  }

  function buildTotals(rows){
    const map=new Map();
    (rows||[]).forEach(row=>{
      const n=normalize(row);if(Number(n.hrHours||0)<=0)return;
      const id=String(row.staff_id||'');
      if(!map.has(id))map.set(id,{staff_id:id,actual:0,total:0,actualMoney:0,rows:[],baseType:baseType(id),baseRate:baseRate(id),employeeCode:employeeCode(id)});
      const t=map.get(id);t.actual=round2(t.actual+Number(n.actualHours||0));t.total=round2(t.total+Number(n.hrHours||0));t.actualMoney=round2(t.actualMoney+Number(n.actualMoney||0));t.rows.push({row,n});
    });
    return [...map.values()].sort((a,b)=>staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th'));
  }
  function applyCarryIn(totals,carryMap){
    const map=new Map();
    (totals||[]).forEach(t=>{t.currentTotal=round2(t.total);t.carryIn=0;t.carrySourceMonth='';map.set(String(t.staff_id),t);});
    (carryMap instanceof Map?carryMap:new Map()).forEach((info,staffId)=>{
      const amount=round2(info?.amount||0);let t=map.get(String(staffId));
      if(!t&&amount>0){
        t={staff_id:String(staffId),actual:0,total:0,currentTotal:0,carryIn:0,carrySourceMonth:'',actualMoney:0,rows:[],baseType:baseType(staffId),baseRate:baseRate(staffId),employeeCode:employeeCode(staffId)};
        map.set(String(staffId),t);
      }
      if(!t)return;
      t.carryIn=amount;t.carrySourceMonth=String(info?.sourceMonth||'');t.carrySource=String(info?.source||'');t.carryAnchorRowId=String(info?.anchorRowId||'');
    });
    map.forEach(t=>{t.currentTotal=round2(t.currentTotal==null?t.total:t.currentTotal);t.total=round2(t.currentTotal+Number(t.carryIn||0));});
    return [...map.values()].filter(t=>Number(t.total||0)>0).sort((a,b)=>staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th'));
  }
  function allowedSlots(date,holidays){return (weekend(date)||publicHoliday(date,holidays))?[0,8,16]:[0,16];}
  function slotTimes(slot){if(slot===8)return {start:'08:00',end:'16:00',startValue:8/24,endValue:16/24};if(slot===16)return {start:'16:00',end:'00:00',startValue:16/24,endValue:0};return {start:'00:00',end:'08:00',startValue:0,endValue:8/24};}
  function allocate(totals,cycle,leaves,holidays,lockedDates=[]){
    const dates=datesBetween(cycle.start,cycle.end);
    const dateCount=Math.max(1,dates.length);
    const totalUnits=(totals||[]).reduce((sum,t)=>sum+Math.max(0,Math.floor((Number(t.total||0)+1e-7)/8)),0);
    const occupancy=new Map(),dateOccupancy=new Map(),rows=[],leaveSkipped=[];
    const compareScore=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const av=Number(a[i]||0),bv=Number(b[i]||0);if(av<bv)return -1;if(av>bv)return 1;}return 0;};

    /*
      Build exact date targets before assigning any person.
      Normal weekdays have 2 slots; Saturday/Sunday/public holidays have 3 slots.
      Targets are proportional to slot capacity, so normal dates differ by at most 1
      and holiday-type dates differ by at most 1 whenever leave constraints allow.
    */
    const dateInfos=dates.map((date,index)=>{
      const slots=allowedSlots(date,holidays);
      return {date,index,slots,weight:slots.length,target:0,slotTargets:new Map()};
    });
    const totalWeight=Math.max(1,dateInfos.reduce((sum,x)=>sum+x.weight,0));
    let baseAllocated=0;
    dateInfos.forEach(info=>{
      const ideal=totalUnits*info.weight/totalWeight;
      info.ideal=ideal;
      info.fraction=ideal-Math.floor(ideal);
      info.target=Math.floor(ideal);
      baseAllocated+=info.target;
    });
    let extra=Math.max(0,totalUnits-baseAllocated);
    const spreadStep=dateCount>1?(dateCount%2===0?dateCount-1:Math.max(1,dateCount-2)):1;
    dateInfos.slice().sort((a,b)=>b.fraction-a.fraction||((a.index*spreadStep)%dateCount)-((b.index*spreadStep)%dateCount)||a.index-b.index).slice(0,extra).forEach(info=>{info.target++;});

    dateInfos.forEach(info=>{
      const count=info.slots.length,base=Math.floor(info.target/count),remainder=info.target%count,start=info.index%count;
      info.slots.forEach(slot=>info.slotTargets.set(slot,base));
      for(let i=0;i<remainder;i++){
        const slot=info.slots[(start+i)%count];
        info.slotTargets.set(slot,(info.slotTargets.get(slot)||0)+1);
      }
    });

    const dateInfoMap=new Map(dateInfos.map(x=>[x.date,x]));
    const cells=[];
    dateInfos.forEach(info=>info.slots.forEach(slot=>cells.push({date:info.date,dateIndex:info.index,slot,target:info.slotTargets.get(slot)||0,assigned:0})));
    const byStaffDay=new Map();
    const staffDaySlots=(staffId,date)=>{
      const key=`${staffId}|${date}`;
      if(!byStaffDay.has(key))byStaffDay.set(key,new Set());
      return byStaffDay.get(key);
    };
    const addRow=(t,cell)=>{
      const info=dateInfoMap.get(cell.date),times=slotTimes(cell.slot),holidayType=(weekend(cell.date)||publicHoliday(cell.date,holidays));
      rows.push({staff_id:t.staff_id,date:cell.date,slot:cell.slot,...times,type:holidayType?2:1,claimCode:holidayType?claimCodes(t.staff_id).holiday:claimCodes(t.staff_id).normal,employeeCode:t.employeeCode,name:staffNickSafe(t.staff_id),fullName:staffFullName(t.staff_id)});
      cell.assigned++;
      occupancy.set(`${cell.date}|${cell.slot}`,cell.assigned);
      dateOccupancy.set(cell.date,(dateOccupancy.get(cell.date)||0)+1);
      staffDaySlots(t.staff_id,cell.date).add(cell.slot);
    };

    /* Record every leave date in the HR cycle once, independently from allocation order. */
    (totals||[]).forEach(t=>dates.forEach(date=>{if(hasLeave(t.staff_id,date,leaves))leaveSkipped.push({staff_id:t.staff_id,date,reason:'วันลาในรอบ HR'});}));

    const remaining=new Map(),desiredMap=new Map(),assignedMap=new Map();
    (totals||[]).forEach(t=>{
      const desired=Math.max(0,Math.floor((Number(t.total||0)+1e-7)/8));
      t.desiredUnits=desired;
      remaining.set(String(t.staff_id),desired);
      desiredMap.set(String(t.staff_id),desired);
      assignedMap.set(String(t.staff_id),0);
    });
    const staffBase=(totals||[]).slice().sort((a,b)=>{
      const leaveA=dates.reduce((n,d)=>n+(hasLeave(a.staff_id,d,leaves)?1:0),0),leaveB=dates.reduce((n,d)=>n+(hasLeave(b.staff_id,d,leaves)?1:0),0);
      return leaveB-leaveA||Number(b.desiredUnits||0)-Number(a.desiredUnits||0)||staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th');
    });
    const remainingTotal=()=>[...remaining.values()].reduce((sum,n)=>sum+Number(n||0),0);

    /* V664: reserve existing HR 8-hour units, never manufacture units.
       quota: each eligible staff appears on N DISTINCT selected dates.
       all: old V604 requirement (one appearance on every selected date,
       excluding actual leave days); both reserve only one slot per staff/day.
       Block the ordinary pass from adding a third name on selected dates. */
    const policy=Array.isArray(lockedDates)?{mode:'all',quota:lockedDates.length,dates:lockedDates}:lockedDates||{};
    const locked=[...new Set((policy.dates||[]).map(dateKey).filter(d=>dateInfoMap.has(d)))].sort();
    const lockMode=policy.mode==='quota'?'quota':'all';
    const lockQuota=lockMode==='quota'?Math.floor(Number(policy.quota||0)):locked.length;
    const selectedDateSet=new Set(locked),lockReport=[];
    if(locked.length&&lockMode==='quota'&&(lockQuota<1||lockQuota>locked.length)){
      lockReport.push({date:locked[0],staff_id:'',status:'insufficient',message:`จำนวนวันต่อคนต้องอยู่ระหว่าง 1–${locked.length} วัน`});
    }else if(locked.length){
      const bySelectedDate=new Map(locked.map(d=>[d,cells.filter(c=>c.date===d)]));
      const constrained=staffBase.slice().sort((a,b)=>{
        const aDays=locked.filter(d=>!hasLeave(a.staff_id,d,leaves)).length;
        const bDays=locked.filter(d=>!hasLeave(b.staff_id,d,leaves)).length;
        return aDays-bDays||Number(a.desiredUnits||0)-Number(b.desiredUnits||0)||staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th');
      });
      /* Legacy all-dates rules keep existing leave exemption. In quota mode,
         days lost to leave must be made up on other selected days. */
      const required=new Map();
      constrained.forEach(t=>{
        const id=String(t.staff_id),available=locked.filter(d=>!hasLeave(id,d,leaves));
        const need=lockMode==='quota'?lockQuota:available.length;
        required.set(id,need);
        if(need>(desiredMap.get(id)||0))lockReport.push({date:locked[0],staff_id:id,status:'insufficient',message:`มี OT พร้อมเบิก ${desiredMap.get(id)||0} หน่วย แต่ต้องมีชื่อ ${need} วัน`});
        else if(available.length<need)lockReport.push({date:locked[0],staff_id:id,status:'insufficient',message:`วันที่เลือกที่ไม่ตรงกับวันลาเหลือ ${available.length} วัน แต่กำหนด ${need} วัน`});
        locked.filter(d=>hasLeave(id,d,leaves)).forEach(d=>lockReport.push({date:d,staff_id:id,status:'leave',message:'เว้นวันลาของเจ้าหน้าที่'}));
      });
      const countFor=(id)=>locked.reduce((sum,d)=>sum+(staffDaySlots(id,d).size>0?1:0),0);
      const maxNeed=Math.max(0,...required.values());
      for(let round=0;round<maxNeed;round++){
        for(const t of constrained){
          const id=String(t.staff_id),want=required.get(id)||0,left=remaining.get(id)||0;
          if(countFor(id)>=want||left<=0)continue;
          const candidates=[];
          locked.forEach((date,di)=>{
            if(hasLeave(id,date,leaves)||staffDaySlots(id,date).size>0)return;
            const dayUsed=dateOccupancy.get(date)||0;
            const eligible=bySelectedDate.get(date)||[];
            eligible.filter(c=>c.assigned<6).forEach(cell=>{
              candidates.push({cell,score:[dayUsed,cell.assigned,((di+constrained.indexOf(t)+round)%Math.max(1,locked.length)),cell.slot]});
            });
          });
          if(!candidates.length)continue;
          candidates.sort((a,b)=>compareScore(a.score,b.score));
          addRow(t,candidates[0].cell);
          remaining.set(id,left-1);assignedMap.set(id,(assignedMap.get(id)||0)+1);
          lockReport.push({date:candidates[0].cell.date,staff_id:id,status:'locked',message:'มีชื่อในวันพิเศษตามโควตา'});
        }
      }
      constrained.forEach(t=>{
        const id=String(t.staff_id),have=countFor(id),want=required.get(id)||0;
        if(have<want&&!lockReport.some(x=>String(x.staff_id)===id&&x.status==='insufficient')){
          lockReport.push({date:locked[0],staff_id:id,status:'capacity',message:`จัดได้ ${have}/${want} วัน อาจมีวันลาหรือช่วงเวลาเต็ม (สูงสุด 6 คนต่อช่วง)`});
        }
      });
    }

    /* Round-robin staff allocation prevents early staff from filling the first dates. */
    let round=0,progress=true;
    while(remainingTotal()>0&&progress&&round<100){
      progress=false;
      const order=staffBase.slice().sort((a,b)=>{
        const aid=String(a.staff_id),bid=String(b.staff_id),ar=(remaining.get(aid)||0)/Math.max(1,desiredMap.get(aid)||1),br=(remaining.get(bid)||0)/Math.max(1,desiredMap.get(bid)||1);
        return br-ar||(remaining.get(bid)||0)-(remaining.get(aid)||0)||staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th');
      });
      order.forEach((t,staffIndex)=>{
        const staffId=String(t.staff_id),left=remaining.get(staffId)||0;
        if(left<=0)return;
        const candidates=[];
        cells.forEach(cell=>{
          if(selectedDateSet.has(cell.date))return; /* keep per-person special-date quota exact */
          if(cell.assigned>=cell.target)return;
          if(hasLeave(t.staff_id,cell.date,leaves))return;
          const used=staffDaySlots(t.staff_id,cell.date);
          if(used.has(cell.slot)||used.size>=2)return;
          const info=dateInfoMap.get(cell.date),dateUsed=dateOccupancy.get(cell.date)||0;
          const rotation=(cell.dateIndex-((staffIndex*3+round)%dateCount)+dateCount)%dateCount;
          candidates.push({cell,score:[used.size,cell.assigned/Math.max(1,cell.target),dateUsed/Math.max(1,info.target),cell.assigned,dateUsed,rotation,cell.slot]});
        });
        if(!candidates.length)return;
        candidates.sort((a,b)=>compareScore(a.score,b.score));
        addRow(t,candidates[0].cell);
        remaining.set(staffId,left-1);
        assignedMap.set(staffId,(assignedMap.get(staffId)||0)+1);
        progress=true;
      });
      round++;
    }

    /* Rare fallback for heavy leave overlap: keep max 6 people/slot and choose the least-overflowing date/slot. */
    let overflowRound=0;
    while(remainingTotal()>0&&overflowRound++<100){
      let moved=false;
      for(const t of staffBase){
        const staffId=String(t.staff_id),left=remaining.get(staffId)||0;
        if(left<=0)continue;
        const candidates=[];
        cells.forEach(cell=>{
          if(selectedDateSet.has(cell.date))return;
          if(cell.assigned>=6||hasLeave(t.staff_id,cell.date,leaves))return;
          const used=staffDaySlots(t.staff_id,cell.date);
          if(used.has(cell.slot)||used.size>=2)return;
          const info=dateInfoMap.get(cell.date),dateUsed=dateOccupancy.get(cell.date)||0;
          const slotCounts=info.slots.map(slot=>occupancy.get(`${cell.date}|${slot}`)||0),after=slotCounts.map((n,i)=>info.slots[i]===cell.slot?n+1:n);
          const spread=Math.max(...after)-Math.min(...after);
          const slotOverflow=Math.max(0,cell.assigned+1-cell.target),dateOverflow=Math.max(0,dateUsed+1-info.target);
          candidates.push({cell,score:[slotOverflow,dateOverflow,spread,used.size,cell.assigned,dateUsed,cell.dateIndex,cell.slot]});
        });
        if(!candidates.length)continue;
        candidates.sort((a,b)=>compareScore(a.score,b.score));
        addRow(t,candidates[0].cell);
        remaining.set(staffId,left-1);
        assignedMap.set(staffId,(assignedMap.get(staffId)||0)+1);
        moved=true;
      }
      if(!moved)break;
    }

    (totals||[]).forEach(t=>{
      const desired=Number(t.desiredUnits||0),claimed=Number(assignedMap.get(String(t.staff_id))||0),unallocated=Math.max(0,desired-claimed);
      t.claimedUnits=claimed;t.claimed=round2(claimed*8);t.carry=round2(Number(t.total||0)-t.claimed);t.unallocatedUnits=unallocated;
      const mine=rows.filter(x=>String(x.staff_id)===String(t.staff_id));t.normalHours=mine.filter(x=>x.type===1).length*8;t.holidayHours=mine.filter(x=>x.type===2).length*8;t.money=round2(t.claimed*t.baseRate);
    });
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot||staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th'));

    const balanceRows=dateInfos.map(info=>{
      const slots={};info.slots.forEach(slot=>{slots[slot]=occupancy.get(`${info.date}|${slot}`)||0;});
      const values=Object.values(slots),spread=values.length?Math.max(...values)-Math.min(...values):0;
      return {date:info.date,target:info.target,total:dateOccupancy.get(info.date)||0,slots,spread,type:(weekend(info.date)||publicHoliday(info.date,holidays))?'holiday':'weekday'};
    });
    return {rows,occupancy,dateOccupancy,leaveSkipped,balanceRows,lockedDates:locked,lockMode,lockQuota,lockReport};
  }

  function sourceRowsForSheet(totals,month,cycle){
    const out=[];
    totals.forEach(t=>t.rows.forEach(({row,n})=>{
      const segments=Array.isArray(n.segments)?n.segments:[];
      const rates=[...new Set(segments.map(x=>Number(x.appliedRate||0)).filter(Boolean))].join('/');
      out.push({
        'รหัสพนักงาน':t.employeeCode,'ชื่อ':staffFullName(t.staff_id),'ชื่อเล่น':staffNickSafe(t.staff_id),'วันที่ OT จริง':dateKey(row.work_date),'เดือนเบิกจริง':month,
        'รอบ HR dummy':`${cycle.start} ถึง ${cycle.end}`,'เหตุผล':String(row.reason||''),'หมายเหตุ':String(row.note||''),'ประเภทเวร':n.shiftType||'-',
        'ชั่วโมงจริง':round2(n.actualHours),'เรทงานจริง (บาท/ชม.)':rates||t.baseRate,'ฐาน HR (บาท/ชม.)':t.baseRate,'ชั่วโมงเทียบ HR':round2(n.hrHours),
        'เงินตามงานจริง':round2(n.actualMoney),'การแปลงเรท':n.tangMtConversion?'อริภัศ/แตง: งาน MT แปลงเป็นฐานเคิก 90':'ตามกลุ่มเจ้าหน้าที่','claim_status ก่อน Export':String(row.claim_status||'pending')
      });
    }));
    return out;
  }
  function staffSummaryRows(totals){return totals.map(t=>({'รหัสพนักงาน':t.employeeCode,'ชื่อ':staffFullName(t.staff_id),'ชื่อเล่น':staffNickSafe(t.staff_id),'กลุ่ม HR':t.baseType,'ฐาน HR':t.baseRate,'ชั่วโมงจริงรวม':t.actual,'OT เดือนนี้เทียบ HR':t.currentTotal,'ยอดทบยกมา(ชม.)':t.carryIn,'เดือนยอดทบยกมา':t.carrySourceMonth||'','รวมก่อนปรับย้อนหลัง':t.regularAvailable==null?t.total:t.regularAvailable,'ปรับย้อนหลังหน่วย HR 8ชม.':Number(t.adjustmentUnits||0),'ปรับย้อนหลัง(บาท)':Number(t.adjustmentAmount||0),'โอทีทั้งหมดหลังปรับ':t.total,'เบิก HR รอบนี้':t.claimed,'ทบเดือนหน้า(ชม.)':t.carry,'จำนวนเวร 8 ชม.':t.claimedUnits,'เวรที่จัดไม่ได้เพราะลา/ความจุ':t.unallocatedUnits,'ยอดเงินที่เบิก HR รอบนี้':t.money}));}
  function holidayDayList(cycle,holidays){return datesBetween(cycle.start,cycle.end).filter(d=>weekend(d)||publicHoliday(d,holidays)).map(d=>String(Number(d.slice(-2))).padStart(2,'0')).join(',');}

  function makeOtExtraSheet(sourceRows,totals,source,cycle){
    const rows=[
      [`สรุป OT เดือน ${source.month} / HR dummy ${cycle.start} ถึง ${cycle.end}`],
      ['ชื่อ','OT เดือนนี้เทียบ HR','ยอดทบยกมา','เดือนยอดทบ','รวมก่อนปรับย้อนหลัง','ปรับย้อนหลัง (เวร 8ชม.)','ยอดหลังปรับ','เบิก HR รอบนี้','ทบเดือนหน้า','ฐาน HR','ยอดเงินที่เบิก HR รอบนี้','หมายเหตุ'],
      ...totals.map(t=>[staffFullName(t.staff_id),t.currentTotal,t.carryIn,t.carrySourceMonth||'',t.regularAvailable==null?t.total:t.regularAvailable,Number(t.adjustmentUnits||0),t.total,t.claimed,t.carry,t.baseRate,t.money,[Number(t.carryIn||0)>0?'รวมยอดทบจากเดือนก่อนอัตโนมัติ':'',Number(t.adjustmentUnits||0)!==0?`V527 ปรับย้อนหลัง ${Number(t.adjustmentUnits)>0?'+':''}${Number(t.adjustmentUnits)} เวร`:'' ,isTang(t.staff_id)?'อริภัศ/แตง: งานปั่นเลือด/งาน MT คิดเรท MT แล้วหารฐานเคิก 90':''].filter(Boolean).join(' • ')]),
      [],
      ['รายละเอียดต้นทางเดือนปัจจุบัน'],
      ['ชื่อ','วันที่ OT','เหตุผล','ประเภทเวร','ชั่วโมงจริง','เรทงานจริง','ฐาน HR','ชั่วโมงเทียบ HR','เงินตามงานจริง','หมายเหตุการแปลง'],
      ...sourceRows.map(r=>[r['ชื่อ'],r['วันที่ OT จริง'],r['เหตุผล'],r['ประเภทเวร'],r['ชั่วโมงจริง'],r['เรทงานจริง (บาท/ชม.)'],r['ฐาน HR (บาท/ชม.)'],r['ชั่วโมงเทียบ HR'],r['เงินตามงานจริง'],r['การแปลงเรท']])
    ];
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:34},{wch:18},{wch:15},{wch:15},{wch:20},{wch:20},{wch:18},{wch:16},{wch:18},{wch:12},{wch:22},{wch:60}];return ws;
  }
  function makeScheduleSheet(allocation,totals,cycle){
    const start=new Date(`${cycle.start}T12:00:00`),first=new Date(start);first.setDate(first.getDate()-first.getDay());
    const end=new Date(`${cycle.end}T12:00:00`),last=new Date(end);last.setDate(last.getDate()+(6-last.getDay()));
    const weeks=Math.ceil((last-first)/(7*86400000))+1,cols=31,data=[];
    const row1=Array(cols).fill(null),row2=Array(cols).fill(null);row1[0]=null;row2[0]=null;
    for(let day=0;day<7;day++){const c=1+day*3;row1[c]=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'][day];row2[c]=0;row2[c+1]=8;row2[c+2]=16;}
    const summaryHeaders=['ชื่อ','จำนวน','วันหยุดพิเศษ','คิดเงิน (บาท)','คิดเงิน (บาท) + วันที่ 13-15','โอทีทั้งหมด','เบิกจริง','ทบเดือนหน้า(ชม.)'];summaryHeaders.forEach((h,i)=>row1[23+i]=h);
    data.push(row1,row2);
    const byCell=new Map();allocation.rows.forEach(x=>{const k=`${x.date}|${x.slot}`;if(!byCell.has(k))byCell.set(k,[]);byCell.get(k).push(x.name);});
    for(let w=0;w<weeks;w++){
      const dateRow=Array(cols).fill(null);dateRow[0]='วันที่';
      const nameRows=Array.from({length:6},(_,i)=>{const r=Array(cols).fill(null);r[0]=String.fromCharCode(65+i);return r;});
      for(let day=0;day<7;day++){
        const d=new Date(first);d.setDate(first.getDate()+w*7+day);const key=dateKey(d),c=1+day*3;
        if(key>=cycle.start&&key<=cycle.end){dateRow[c]=String(Number(key.slice(-2))).padStart(2,'0');for(const slot of [0,8,16]){const names=byCell.get(`${key}|${slot}`)||[],slotCol=c+(slot===0?0:slot===8?1:2);for(let i=0;i<Math.min(6,names.length);i++)nameRows[i][slotCol]=names[i];}}
      }
      const block=[dateRow,...nameRows];
      block.forEach((r,bi)=>{
        const summaryIndex=(data.length+bi)-1;
        if(summaryIndex>=0&&summaryIndex<totals.length){const t=totals[summaryIndex];r[23]=staffNickSafe(t.staff_id);r[24]=t.claimedUnits;r[25]=t.holidayHours/8;r[26]=t.money;r[27]=t.money;r[28]=t.total;r[29]=t.claimed;r[30]=t.carry;}
      });
      data.push(...block);
    }
    /* Fill any summary rows that exceed the calendar block. */
    while(data.length<totals.length+2)data.push(Array(cols).fill(null));
    totals.forEach((t,i)=>{const r=data[i+2]||(data[i+2]=Array(cols).fill(null));r[23]=staffNickSafe(t.staff_id);r[24]=t.claimedUnits;r[25]=t.holidayHours/8;r[26]=t.money;r[27]=t.money;r[28]=t.total;r[29]=t.claimed;r[30]=t.carry;});
    const ws=XLSX.utils.aoa_to_sheet(data);ws['!cols']=[{wch:7},...Array.from({length:21},()=>({wch:13})),{wch:2},{wch:20},{wch:10},{wch:14},{wch:16},{wch:22},{wch:14},{wch:12},{wch:18}];return ws;
  }
  function makeCopySheet(allocation,cycle,holidays){
    const holidayList=holidayDayList(cycle,holidays);
    const rows=[['name','time','วันที่','1 = ธรรมดา\n2 = วันหยุด\n3 = พรีเมียม\n4 = อื่นๆ1\n5 = อื่นๆ2','copy ใส่ macro HR >>>','key no','no','วันที่','เวลาเข้า','เวลาออก','วันที่เต็ม (ตรวจสอบ)','วันหยุด>',holidayList]];
    allocation.rows.forEach(x=>rows.push([x.name,x.slot,Number(x.date.slice(-2)),x.type,'',x.claimCode,x.employeeCode,Number(x.date.slice(-2)),x.startValue,x.endValue,x.date,'','']));
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:22},{wch:8},{wch:8},{wch:18},{wch:24},{wch:12},{wch:12},{wch:8},{wch:12},{wch:12},{wch:14},{wch:12},{wch:45}];
    for(let r=2;r<=rows.length;r++){
      for(const col of ['F','G'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='s';ws[`${col}${r}`].z='@';}
      for(const col of ['I','J'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='n';ws[`${col}${r}`].z='h:mm';}
    }
    ws['!autofilter']={ref:`A1:M${Math.max(1,rows.length)}`};return ws;
  }
  function makeTimeSheet(){const ws=XLSX.utils.aoa_to_sheet([[null,'เข้า','ออก'],[0,0,8/24],[8,8/24,16/24],[16,16/24,0]]);for(let r=2;r<=4;r++)for(const col of ['B','C']){ws[`${col}${r}`].t='n';ws[`${col}${r}`].z='h:mm';}ws['!cols']=[{wch:8},{wch:12},{wch:12}];return ws;}
  function makeNameSheet(totals,allocation){
    const rows=[['ชื่อ','รหัสพนักงาน','รหัสเบิกธรรมดา','รหัสเบิกวันหยุด','รหัสเบิกพรีเมียม','วันหยุดพิเศษ','อื่นๆ2','รวม(บาท)','ชั่วโมงธรรมดา','ชั่วโมงวันหยุด','จำนวนธรรมดา','จำนวนวันหยุด','เรทงานจริงวันปกติ','เรทงานจริงนักขัต','หมายเหตุ']];
    totals.forEach(t=>{const c=claimCodes(t.staff_id),mtTang=isTang(t.staff_id);rows.push([staffNickSafe(t.staff_id),t.employeeCode,c.normal,c.holiday,c.premium,c.special,'',t.money,t.baseRate,t.baseRate,t.normalHours,t.holidayHours,mtTang?130:t.baseRate,mtTang?160:(t.baseType==='เคิก'?120:160),mtTang?'อริภัศ/แตง: ปั่นเลือด/งาน MT ใช้ 130 หรือ 160 แล้วแปลงกลับฐานเคิก 90':'']);});
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:22},{wch:14},{wch:17},{wch:17},{wch:17},{wch:15},{wch:12},{wch:14},{wch:15},{wch:15},{wch:15},{wch:15},{wch:18},{wch:18},{wch:55}];
    for(let r=2;r<=rows.length;r++)for(const col of ['B','C','D','E','F'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='s';ws[`${col}${r}`].z='@';}
    return ws;
  }
  function makeHrSheet(allocation){
    const rows=[['key no','no','วันที่','เวลาเข้า','เวลาออก'],...allocation.rows.map(x=>[x.claimCode,x.employeeCode,Number(x.date.slice(-2)),x.startValue,x.endValue])];
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:14},{wch:14},{wch:10},{wch:12},{wch:12}];
    for(let r=2;r<=rows.length;r++){for(const col of ['A','B'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='s';ws[`${col}${r}`].z='@';}for(const col of ['D','E'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='n';ws[`${col}${r}`].z='h:mm';}}
    return ws;
  }
  function balanceCheckRows(allocation){
    return (allocation?.balanceRows||[]).map(x=>({
      'วันที่ HR dummy':x.date,'วัน':thaiWeekday(x.date),'ประเภทวัน':x.type==='holiday'?'เสาร์/อาทิตย์/นักขัต':'วันธรรมดา',
      'เป้าหมายจำนวนเวร':x.target,'จำนวนเวรจริง':x.total,'00:00-08:00':Number(x.slots?.[0]||0),'08:00-16:00':Number(x.slots?.[8]||0),'16:00-00:00':Number(x.slots?.[16]||0),
      'ส่วนต่างช่วงเวลาสูงสุด':x.spread,'ตรวจสอบ':x.spread<=1?'ผ่าน':'ควรตรวจสอบ'
    }));
  }
  function makeJsonSheet(rows,headers,widths){const ws=XLSX.utils.json_to_sheet(rows,{header:headers});ws['!cols']=(widths||headers.map(()=>16)).map(w=>({wch:w}));ws['!autofilter']={ref:`A1:${XLSX.utils.encode_col(headers.length-1)}${Math.max(1,rows.length+1)}`};return ws;}
  function batchId(){const d=new Date();return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;}
  async function markExported(rows,id,totals,sourceMonth){
    const grouped=new Map();(rows||[]).forEach(row=>{const staffId=String(row.staff_id||'');if(!row.id||!staffId)return;if(!grouped.has(staffId))grouped.set(staffId,[]);grouped.get(staffId).push(row.id);});
    if(!grouped.size)return;
    const now=new Date().toISOString(),actor=currentStaffIdSafe(),byStaff=new Map((totals||[]).map(t=>[String(t.staff_id),t]));
    for(const [staffId,ids] of grouped){
      const t=byStaff.get(staffId),payload={claim_status:'exported',export_batch_id:id,exported_by:actor,exported_at:now,batch_id:id,export_date:now,claim_batch_id:encodeCarryMarker(sourceMonth,t?.carry||0),claimed_at:now,claimed_by:actor};
      const res=await db().from('ot_requests').update(payload).in('id',ids);if(res.error)throw res.error;
    }
    /* A staff member can have carry-in but no new OT row this month. Move that person's
       snapshot forward on the latest exported source row so the carry is not duplicated. */
    for(const t of (totals||[])){
      const staffId=String(t.staff_id||'');if(grouped.has(staffId)||!t.carryAnchorRowId)continue;
      const res=await db().from('ot_requests').update({claim_batch_id:encodeCarryMarker(sourceMonth,t.carry||0),claimed_at:now,claimed_by:actor}).eq('id',t.carryAnchorRowId);
      if(res.error)throw res.error;
    }
    carryCache.clear();summaryCarryCache.clear();
  }

  /* Read-only preview. Does not create an Export Batch or alter Supabase. */
  async function previewHrDatePlanV664(){
    if(!admin())return toast('เฉพาะ Admin เท่านั้น','error');
    const month=monthKey(st().otSourceMonthV241||st().otMoneyMonthV241||st().monthKey),plan=hrDatePlan(month),error=hrDatePlanError(plan);
    if(error)return toast(error,'error');
    busy(true,'กำลังคำนวณตัวอย่างการกระจายชื่อ (ไม่ Export)');
    try{
      const data=await queryExportData(month),carry=await queryCarryInForHrExport(month);
      const totals=applyAdjustmentUnits(applyCarryIn(buildTotals(data.rows),carry),data.adjustments||[]);
      if(!totals.length)throw new Error('ไม่พบเจ้าหน้าที่ที่มีหน่วย HR พร้อมเบิก');
      const allocation=allocate(totals,data.cycle,data.leaves,data.holidays,plan);
      const errors=allocation.lockReport.filter(x=>x.status==='insufficient'||x.status==='capacity');
      const extra=totals.filter(t=>t.unallocatedUnits>0);
      const days=plan.dates.map(d=>({date:d,names:allocation.rows.filter(x=>x.date===d).map(x=>staffNickSafe(x.staff_id)).sort((a,b)=>a.localeCompare(b,'th'))}));
      const staffCounts=totals.map(t=>({name:staffNickSafe(t.staff_id),count:allocation.rows.filter(x=>String(x.staff_id)===String(t.staff_id)&&plan.dates.includes(x.date)).length}));
      const warnings=[...errors.slice(0,5).map(x=>`${staffNickSafe(x.staff_id)}: ${x.message}`),...extra.slice(0,3).map(x=>`${staffNickSafe(x.staff_id)} มี ${x.unallocatedUnits} หน่วยที่จัดต่อไม่ได้`)];
      const summary=`${totals.length} คนที่มี OT พร้อมเบิก • ${plan.dates.length} วันที่เลือก • ${allocation.rows.filter(x=>plan.dates.includes(x.date)).length} รายชื่อ • ${plan.mode==='all'?'ทุกคนทุกวันที่ไม่ลา':`คนละ ${plan.quota} วัน`} • ${warnings.length?'ยังจัดไม่ครบ ห้าม Export':'จัดครบ'}`;
      const carries=totals.map(t=>({name:staffNickSafe(t.staff_id),sourceMonth:t.carrySourceMonth||'',opening:round2(t.carryIn),current:round2(t.currentTotal),claimed:round2(t.claimed),money:round2(t.money)})).sort((a,b)=>a.name.localeCompare(b.name,'th'));
      st().hrDatePreviewV664={month,signature:JSON.stringify(plan),summary,days,staffCounts,carries,warnings};
      try{renderPage();}catch(_){ }
      toast(warnings.length?'ตัวอย่างยังจัดไม่ครบ ตรวจคำเตือนก่อน Export':'ตัวอย่างจัดชื่อครบแล้ว ตรวจตารางด้านล่างได้',warnings.length?'error':undefined);
    }catch(e){st().hrDatePreviewV664=null;toast(`ดูตัวอย่างไม่สำเร็จ: ${e?.message||e}`,'error');}
    finally{busy(false);}
  }

  async function exportV318(){
    if(!admin())return toast('เฉพาะ Admin เท่านั้น','error');
    if(typeof XLSX==='undefined')return toast('ไม่พบไลบรารี Excel','error');
    const month=monthKey(st().otSourceMonthV241||st().otMoneyMonthV241||st().monthKey);
    busy(true,'กำลังอ่านยอดทบเดือนก่อนและจัด HR dummy แบบไฟล์ Manual');
    try{
      const data=await queryExportData(month);if(!data.rows.length&&!(data.adjustments||[]).some(x=>Number(x.hr_unit_delta||0)!==0))throw new Error('ยังไม่มีรายการ OT หรือรายการปรับยอดที่ใช้ Export ในเดือนนี้');
      const carryInMap=await queryCarryInForHrExport(data.source.month);
      const regularTotals=applyCarryIn(buildTotals(data.rows),carryInMap);
      const totals=applyAdjustmentUnits(regularTotals,data.adjustments||[]);if(!totals.length)throw new Error('ไม่พบชั่วโมง OT ที่ใช้คำนวณได้');
      const missing=totals.filter(t=>!t.employeeCode).map(t=>staffNickSafe(t.staff_id));if(missing.length)throw new Error(`ยังไม่มีรหัสพนักงานของ: ${missing.join(', ')} กรุณาใส่ในข้อมูลเจ้าหน้าที่ก่อน Export`);
      const datePlan=hrDatePlan(data.source.month),lockedDates=datePlan.dates;
      if(lockedDates.length){const planError=hrDatePlanError(datePlan);if(planError)throw new Error(planError);}
      const allocation=allocate(totals,data.cycle,data.leaves,data.holidays,datePlan),sourceSheetRows=sourceRowsForSheet(totals,data.source.month,data.cycle),summaryRows=staffSummaryRows(totals);
      const lockFailures=(allocation.lockReport||[]).filter(x=>x.status==='insufficient'||x.status==='capacity');
      if(lockFailures.length){const detail=lockFailures.slice(0,8).map(x=>`${staffNickSafe(x.staff_id)} ${x.date}: ${x.message}`).join(' • ');throw new Error(`จัดชื่อวันพิเศษไม่ครบ: ${detail}${lockFailures.length>8?` • และอีก ${lockFailures.length-8} รายการ`:''}`);}
      if(lockedDates.length&&totals.some(t=>t.unallocatedUnits>0)){
        const missing=totals.filter(t=>t.unallocatedUnits>0).slice(0,8).map(t=>`${staffNickSafe(t.staff_id)} ${t.unallocatedUnits} หน่วย`).join(' • ');
        throw new Error(`วันพิเศษทำให้กระจายเวรที่เหลือไม่ครบ: ${missing} — กรุณาลดจำนวนวันพิเศษหรือเปลี่ยนช่วงวัน`);
      }
      const leaveRows=allocation.leaveSkipped.map(x=>({'รหัสพนักงาน':employeeCode(x.staff_id),'ชื่อ':staffFullName(x.staff_id),'วันที่ลาในรอบ HR':x.date,'หมายเหตุ':'ระบบไม่สร้าง dummy shift ในวันนี้'}));
      const carryRows=totals.map(t=>({'รหัสพนักงาน':t.employeeCode,'ชื่อ':staffFullName(t.staff_id),'เดือน OT ปัจจุบัน':data.source.month,'เดือนยอดทบยกมา':t.carrySourceMonth||'','ยอดทบยกมา(ชม.)':t.carryIn,'OT เดือนนี้เทียบ HR':t.currentTotal,'รวมก่อนปรับย้อนหลัง':t.regularAvailable==null?t.total:t.regularAvailable,'ปรับย้อนหลังหน่วย HR 8ชม.':Number(t.adjustmentUnits||0),'โอทีทั้งหมดหลังปรับ':t.total,'เบิก HR รอบนี้':t.claimed,'ทบเดือนหน้า(ชม.)':t.carry,'หมายเหตุ':'V530: รายการปรับย้อนหลังแยกจาก OT จริง; หน่วย HR รองรับทศนิยมและรวมยอดก่อนตัดเป็นชุด 8 ชม.'}));
      const adjustmentRows=(data.adjustments||[]).map(a=>({'รหัสพนักงาน':employeeCode(a.staff_id),'ชื่อ':staffFullName(a.staff_id),'ประเภท':a.adjustment_type==='overclaim'?'ลด OT เบิกเกิน':'OT ตกเบิกย้อนหลัง','เดือนต้นทาง':a.source_month,'เดือนที่นำมาปรับ':a.apply_month,'ยอดเงินปรับ':Number(a.amount_delta||0),'หน่วย HR 8 ชม.':Number(a.hr_unit_delta||0),'ฐาน HR':Number(a.base_rate||baseRate(a.staff_id)),'เหตุผล':a.reason||'','รายละเอียด':a.note||'','สถานะก่อน Export':a.status||'pending'}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,makeOtExtraSheet(sourceSheetRows,totals,data.source,data.cycle),'OT เสริม');
      XLSX.utils.book_append_sheet(wb,makeScheduleSheet(allocation,totals,data.cycle),'ตาราง');
      XLSX.utils.book_append_sheet(wb,makeCopySheet(allocation,data.cycle,data.holidays),'copy');
      XLSX.utils.book_append_sheet(wb,makeTimeSheet(),'time');
      XLSX.utils.book_append_sheet(wb,makeNameSheet(totals,allocation),'name');
      XLSX.utils.book_append_sheet(wb,makeHrSheet(allocation),'HR_OT');
      const balanceRows=balanceCheckRows(allocation);
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(balanceRows,Object.keys(balanceRows[0]||{'วันที่ HR dummy':'','วัน':'','ประเภทวัน':'','เป้าหมายจำนวนเวร':'','จำนวนเวรจริง':'','00:00-08:00':'','08:00-16:00':'','16:00-00:00':'','ส่วนต่างช่วงเวลาสูงสุด':'','ตรวจสอบ':''}),[16,12,22,18,16,16,16,16,22,18]),'Dummy_Balance_Check');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(sourceSheetRows,Object.keys(sourceSheetRows[0]||{}),[14,30,14,14,12,24,34,42,14,12,16,12,16,16,44,20]),'Source_OT_1_to_End');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(summaryRows,Object.keys(summaryRows[0]||{}),[14,30,14,12,10,16,16,16,22,18,18,18,20,16,18,14,18,18]),'Staff_Total');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(adjustmentRows,Object.keys(adjustmentRows[0]||{'รหัสพนักงาน':'','ชื่อ':'','ประเภท':'','เดือนต้นทาง':'','เดือนที่นำมาปรับ':'','ยอดเงินปรับ':'','หน่วย HR 8 ชม.':'','ฐาน HR':'','เหตุผล':'','รายละเอียด':'','สถานะก่อน Export':''}),[14,30,22,14,16,16,18,12,24,46,18]),'OT_Adjustments');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(carryRows,Object.keys(carryRows[0]||{'รหัสพนักงาน':'','ชื่อ':'','เดือน OT ปัจจุบัน':'','เดือนยอดทบยกมา':'','ยอดทบยกมา(ชม.)':'','OT เดือนนี้เทียบ HR':'','รวมก่อนปรับย้อนหลัง':'','ปรับย้อนหลังหน่วย HR 8ชม.':'','โอทีทั้งหมดหลังปรับ':'','เบิก HR รอบนี้':'','ทบเดือนหน้า(ชม.)':'','หมายเหตุ':''}),[14,30,16,16,18,18,20,22,20,16,18,62]),'Carry_Forward');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(leaveRows,Object.keys(leaveRows[0]||{'รหัสพนักงาน':'','ชื่อ':'','วันที่ลาในรอบ HR':'','หมายเหตุ':''}),[14,30,18,42]),'Leave_Skipped');
      if(lockedDates.length){const lockRows=(allocation.lockReport||[]).map(x=>({'วันที่ล็อก':x.date,'รหัสพนักงาน':employeeCode(x.staff_id),'ชื่อ':staffFullName(x.staff_id),'สถานะ':x.status==='locked'?'มีชื่อแล้ว':x.status==='leave'?'ยกเว้น-วันลา':x.status,'หมายเหตุ':x.message||''}));XLSX.utils.book_append_sheet(wb,makeJsonSheet(lockRows,Object.keys(lockRows[0]||{'วันที่ล็อก':'','รหัสพนักงาน':'','ชื่อ':'','สถานะ':'','หมายเหตุ':''}),[16,14,30,18,46]),'Locked_Date_Check');}
      const id=batchId(),filename=`HR_OT_V318_${id}_source_${data.source.start}_to_${data.source.end}_dummy_${data.cycle.start}_to_${data.cycle.end}.xlsx`;
      const v532ctx={batchId:id,filename,month:data.source.month,source:data.source,cycle:data.cycle,totals,allocation,data,workbook:wb,summaryRows,adjustmentRows,sourceSheetRows,carryRows};
      if(window.cnmiV532ExportGuard?.preExport)await window.cnmiV532ExportGuard.preExport(v532ctx);
      XLSX.writeFile(wb,filename);
      await markExported(data.rows,id,totals,data.source.month);
      const adjustmentIds=(data.adjustments||[]).filter(a=>a.id&&Number(a.hr_unit_delta||0)!==0).map(a=>a.id);
      if(adjustmentIds.length){const ar=await db().from('ot_adjustments').update({status:'exported',export_batch_id:id,exported_at:new Date().toISOString(),updated_at:new Date().toISOString()}).in('id',adjustmentIds);if(ar.error)throw ar.error;}
      if(window.cnmiV532ExportGuard?.postExport)await window.cnmiV532ExportGuard.postExport(v532ctx);
      try{window.cnmiV527AdjustmentLedger?.refresh?.();}catch(_){ }
      try{window.cnmiV316?.clearCache?.();await window.cnmiV316?.loadPageData?.('ot',{force:true});}catch(_){ }
      st().otSubtabV241='summary';try{renderPage();}catch(_){ }
      const totalCarryIn=round2(totals.reduce((s,x)=>s+Number(x.carryIn||0),0)),totalCarry=round2(totals.reduce((s,x)=>s+Number(x.carry||0),0)),adjustUnits=totals.reduce((s,x)=>s+Number(x.adjustmentUnits||0),0);
      toast(`Export สำเร็จ ${allocation.rows.length} เวร 8 ชม. • ปรับย้อนหลัง ${adjustUnits>=0?'+':''}${adjustUnits} เวร • ยกมา ${hours(totalCarryIn)} ชม. • ทบเดือนหน้า ${hours(totalCarry)} ชม. • Batch ${id}`);
    }catch(err){console.error(`[${VERSION}] export failed`,err);try{if(window.cnmiV532ExportGuard?.exportFailed)await window.cnmiV532ExportGuard.exportFailed(window.__CNMI_V532_LAST_EXPORT__?.ctx||null,err);}catch(_){ }toast(String(err?.message||err||'Export ไม่สำเร็จ'),'error');}
    finally{busy(false);}
  }

  function historyYears(){const now=new Date().getFullYear(),out=[];for(let y=now+1;y>=now-6;y--)out.push({value:String(y),label:String(y+543)});return out;}
  function historyMonthOptions(){return ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'].map((label,i)=>({value:pad2(i+1),label}));}
  function selectedHistoryMonth(){const year=String(st().hrHistoryYearV318||''),monthNo=String(st().hrHistoryMonthNumberV318||'');return /^\d{4}$/.test(year)&&/^\d{2}$/.test(monthNo)?`${year}-${monthNo}`:'';}
  function activeStaff(){return (st().staff||[]).filter(s=>s.is_active!==false&&s.active!==false&&!(window.cnmiPersonTypeV516?.isPhysician?.(s)??/^(แพทย์|physician|doctor)$/i.test(String(s.staff_type||s.role||'').trim()))).sort((a,b)=>String(a.nickname||a.full_name||'').localeCompare(String(b.nickname||b.full_name||''),'th'));}
  function historyKey(staffId,year,monthNo){return `${staffId}|${year}|${monthNo}`;}
  async function loadHistory(force=false){
    const staffId=String(st().hrHistoryStaffV318||''),year=String(st().hrHistoryYearV318||''),monthNo=String(st().hrHistoryMonthNumberV318||''),month=selectedHistoryMonth();if(!staffId||!month)return;
    const key=historyKey(staffId,year,monthNo),saved=historyCache.get(key);if(!force&&saved&&saved.expires>Date.now()){st().hrHistoryRowsV318=saved.rows;st().hrHistoryLoadingV318=false;return;}
    st().hrHistoryLoadingV318=true;try{renderPage();}catch(_){ }
    try{
      const r=monthRange(month),res=await db().from('ot_requests').select('*').eq('staff_id',staffId).gte('work_date',r.start).lte('work_date',r.end).order('work_date',{ascending:false});
      if(res.error)throw res.error;const rows=(res.data||[]).filter(x=>approved(x)&&claimStatus(x)==='exported');historyCache.set(key,{rows,expires:Date.now()+HISTORY_TTL});st().hrHistoryRowsV318=rows;
    }catch(err){console.error(`[${VERSION}] history load failed`,err);st().hrHistoryRowsV318=[];toast(`โหลดประวัติ Export ไม่สำเร็จ: ${err?.message||err}`,'error');}
    finally{st().hrHistoryLoadingV318=false;try{renderPage();}catch(_){ }}
  }
  function groupHistory(rows){const map=new Map();(rows||[]).forEach(row=>{const id=rowBatch(row);if(!map.has(id))map.set(id,{rows:[],actual:0,hr:0,money:0,at:'',by:''});const g=map.get(id),n=normalize(row);g.rows.push(row);g.actual=round2(g.actual+Number(n.actualHours||0));g.hr=round2(g.hr+Number(n.hrHours||0));g.money=round2(g.money+Number(n.hrHours||0)*baseRate(row.staff_id));const at=rowExportedAt(row);if(at&&(!g.at||String(at)>String(g.at)))g.at=at;if(row.exported_by||row.claimed_by)g.by=row.exported_by||row.claimed_by;});return [...map.entries()].sort((a,b)=>String(b[1].at||b[0]).localeCompare(String(a[1].at||a[0])));}
  function historyHtml(){
    if(!admin())return '<div class="card"><div class="empty">เฉพาะ Admin เท่านั้น</div></div>';
    const selectedStaff=String(st().hrHistoryStaffV318||''),selectedYear=String(st().hrHistoryYearV318||''),selectedMonthNo=String(st().hrHistoryMonthNumberV318||''),selectedMonth=selectedHistoryMonth();
    const filters=`<div class="card"><div class="section-title"><div><h3>ประวัติ Export HR</h3><p class="hint">ระบบจะยังไม่ดึงตารางจนกว่าจะเลือกชื่อเจ้าหน้าที่ ปี และเดือนครบ</p></div></div><div class="toolbar compact-filter"><label>เจ้าหน้าที่ <select id="hrHistoryStaffV318"><option value="">กรุณาเลือกชื่อ</option>${activeStaff().map(s=>`<option value="${esc(s.id)}" ${String(s.id)===selectedStaff?'selected':''}>${esc(s.nickname||s.full_name||'-')}</option>`).join('')}</select></label><label>ปี พ.ศ. <select id="hrHistoryYearV318"><option value="">กรุณาเลือกปี</option>${historyYears().map(y=>`<option value="${y.value}" ${y.value===selectedYear?'selected':''}>${esc(y.label)}</option>`).join('')}</select></label><label>เดือน <select id="hrHistoryMonthNumberV318"><option value="">กรุณาเลือกเดือน</option>${historyMonthOptions().map(m=>`<option value="${m.value}" ${m.value===selectedMonthNo?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label></div></div>`;
    if(!selectedStaff||!selectedYear||!selectedMonthNo)return `${filters}<div class="card"><div class="empty">กรุณาเลือกชื่อเจ้าหน้าที่ ปี และเดือนก่อน ระบบจึงจะโหลดประวัติ Export</div></div>`;
    if(st().hrHistoryLoadingV318)return `${filters}<div class="card"><div class="empty">กำลังโหลดเฉพาะ ${esc(staffNickSafe(selectedStaff))} เดือน ${esc(selectedMonthNo)}/${esc(selectedYear)}…</div></div>`;
    const rows=st().hrHistoryRowsV318||[],groups=groupHistory(rows);if(!groups.length)return `${filters}<div class="card"><div class="empty">ไม่พบรายการ Exported ของ ${esc(staffNickSafe(selectedStaff))} ในเดือนและปีที่เลือก</div></div>`;
    return `${filters}${groups.map(([id,g])=>`<div class="card v241-export-batch"><div class="section-title"><div><h3>Batch ${esc(id)}</h3><p class="hint">${g.rows.length} รายการ • ${hours(g.hr)} ชั่วโมงเบิก HR • ${esc(money(g.money))} • Export เมื่อ ${esc(fmtDateTime(g.at))}${g.by?` • โดย ${esc(staffNickSafe(g.by))}`:''}</p></div><div class="actions"><button class="tiny-btn danger" type="button" data-v318-revert-selected-batch="${esc(id)}">ตีกลับเฉพาะชื่อนี้</button><button class="danger-btn" type="button" data-v318-revert-whole-batch="${esc(id)}">ตีกลับทั้ง Batch</button></div></div><div class="table-wrap"><table><thead><tr><th>วันที่ OT</th><th>เจ้าหน้าที่</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${g.rows.map(row=>{const n=normalize(row);return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${staffPillSafe(row.staff_id)}</td><td>${hours(n.actualHours,1)}</td><td><b>${hours(n.hrHours)}</b></td><td>${esc(row.reason||'-')}</td><td><span class="badge green">Exported</span></td><td><button class="tiny-btn danger" type="button" data-v318-revert-row="${esc(row.id)}">ตีกลับรายการนี้</button></td></tr>`;}).join('')}</tbody></table></div></div>`).join('')}`;
  }
  function replaceContent(base,html){
    try{const tpl=document.createElement('template');tpl.innerHTML=String(base||'');const content=tpl.content.querySelector('.v241-ot-content');if(content)content.innerHTML=html;const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;}catch(_){return base;}
  }
  if(previousRenderOtPage){
    const wrapped=function renderOtPageV318(){let base=String(previousRenderOtPage.apply(this,arguments)||'');const active=st().otSubtabV241||'mine';if(active==='history')return replaceContent(base,historyHtml());if(active==='export'){
      base=base.replace(/data-export-hr-v241/g,'data-export-hr-v318').replace('นำ OT จริงของเดือน 1-สิ้นเดือน ไปกระจายเป็น HR dummy ในรอบ 16-15','สร้างไฟล์แบบ Manual: รวมยอดทบเดือนก่อนอัตโนมัติ เบิกชุดละ 8 ชม. และส่งเศษต่อเดือนหน้า');
      const panel=hrLockedDatePanel(monthKey(st().otSourceMonthV241||st().otMoneyMonthV241||st().monthKey));
      /* V664: insert a full-width card AFTER the export title/actions, not
         inside its flex header (V604's old inline placement was cramped). */
      const buttonAt=base.indexOf('data-export-hr-v318');
      const buttonEnd=buttonAt>=0?base.indexOf('</button>',buttonAt):-1;
      const headerEnd=buttonEnd>=0?base.indexOf('</div>',buttonEnd):-1;
      if(headerEnd>=0)base=base.slice(0,headerEnd+6)+panel+base.slice(headerEnd+6);
      else base=base.replace(/(<button[^>]*data-export-hr-v318[^>]*>)/i,panel+'$1');
    }return base;};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  async function resetHistoryRows(ids){
    ids=[...new Set((ids||[]).filter(Boolean))];if(!ids.length)return toast('ไม่พบรายการที่ต้องตีกลับ','error');
    if(window.cnmiV532ExportGuard?.lockedHistory)return window.cnmiV532ExportGuard.handleLegacyRevert(ids);
    const ok=typeof confirmDialog==='function'?await confirmDialog(`ต้องการตีกลับ ${ids.length} รายการเป็น Pending ใช่ไหม?`,'ยืนยันตีกลับ Export'):window.confirm(`ต้องการตีกลับ ${ids.length} รายการเป็น Pending ใช่ไหม?`);if(!ok)return;
    busy(true,'กำลังตีกลับ Export');
    try{const payload={claim_status:'pending',export_batch_id:null,exported_by:null,exported_at:null,batch_id:null,export_date:null,claim_batch_id:null,claimed_at:null,claimed_by:null},res=await db().from('ot_requests').update(payload).in('id',ids);if(res.error)throw res.error;historyCache.delete(historyKey(st().hrHistoryStaffV318,st().hrHistoryYearV318,st().hrHistoryMonthNumberV318));carryCache.clear();summaryCarryCache.clear();await loadHistory(true);toast(`ตีกลับเป็น Pending แล้ว ${ids.length} รายการ`);}catch(err){toast(`ตีกลับไม่สำเร็จ: ${err?.message||err}`,'error');}finally{busy(false);}
  }

  document.addEventListener('click',async e=>{
    const month=monthKey(st().otSourceMonthV241||st().otMoneyMonthV241||st().monthKey),cycle=cycleRange(month);
    const addRange=e.target?.closest?.('[data-v664-add-date-range]');if(addRange){
      e.preventDefault();e.stopPropagation();
      const start=dateKey(document.getElementById('hrDateFromV664')?.value),end=dateKey(document.getElementById('hrDateToV664')?.value);
      if(!start||!end||start>end||start<cycle.start||end>cycle.end)return toast('กรุณาเลือกช่วงวันที่ในรอบ HR ให้ถูกต้อง','error');
      const next=hrDatePlanFromForm(month),range=datesBetween(start,end);
      saveHrDatePlan(month,{...next,dates:[...next.dates,...range]});try{renderPage();}catch(_){ }toast(`เพิ่มช่วง ${fmtDate(start)}–${fmtDate(end)} แล้ว`);return;
    }
    const addLock=e.target?.closest?.('[data-v604-add-lock-date]');if(addLock){e.preventDefault();e.stopPropagation();const input=document.getElementById('hrLockDateV604'),date=dateKey(input?.value);if(!date)return toast('กรุณาเลือกวันที่พิเศษ','error');if(date<cycle.start||date>cycle.end)return toast(`วันที่ต้องอยู่ในรอบ HR ${cycle.start} ถึง ${cycle.end}`,'error');const next=hrDatePlanFromForm(month);saveHrDatePlan(month,{...next,dates:[...next.dates,date]});try{renderPage();}catch(_){ }toast(`เพิ่มวันที่ ${fmtDate(date)} แล้ว`);return;}
    const removeLock=e.target?.closest?.('[data-v604-remove-lock-date]');if(removeLock){e.preventDefault();e.stopPropagation();const date=dateKey(removeLock.getAttribute('data-v604-remove-lock-date')),next=hrDatePlanFromForm(month);saveHrDatePlan(month,{...next,dates:next.dates.filter(d=>d!==date)});try{renderPage();}catch(_){ }return;}
    const clearDates=e.target?.closest?.('[data-v664-clear-dates]');if(clearDates){e.preventDefault();e.stopPropagation();saveHrDatePlan(month,{dates:[],mode:'quota',quota:1});try{renderPage();}catch(_){ }toast('ล้างวันพิเศษของเดือนนี้แล้ว');return;}
    const savePlan=e.target?.closest?.('[data-v664-save-date-plan]');if(savePlan){e.preventDefault();e.stopPropagation();const next=hrDatePlanFromForm(month);if(next.dates.length){const err=hrDatePlanError(next);if(err)return toast(err,'error');}saveHrDatePlan(month,next);try{renderPage();}catch(_){ }toast('บันทึกเงื่อนไขวันพิเศษแล้ว');return;}
    const previewBtn=e.target?.closest?.('[data-v664-preview-dummy]');if(previewBtn){e.preventDefault();e.stopPropagation();const next=hrDatePlanFromForm(month),err=hrDatePlanError(next);if(err)return toast(err,'error');saveHrDatePlan(month,next);await previewHrDatePlanV664();return;}

    const exportBtn=e.target?.closest?.('[data-export-hr-v318]');if(exportBtn){e.preventDefault();e.stopPropagation();await exportV318();return;}
    const row=e.target?.closest?.('[data-v318-revert-row]');if(row){e.preventDefault();e.stopPropagation();await resetHistoryRows([row.getAttribute('data-v318-revert-row')]);return;}
    const selectedBatch=e.target?.closest?.('[data-v318-revert-selected-batch]');if(selectedBatch){e.preventDefault();e.stopPropagation();const id=selectedBatch.getAttribute('data-v318-revert-selected-batch'),ids=(st().hrHistoryRowsV318||[]).filter(x=>String(rowBatch(x))===String(id)).map(x=>x.id);await resetHistoryRows(ids);return;}
    const wholeBatch=e.target?.closest?.('[data-v318-revert-whole-batch]');if(wholeBatch){
      e.preventDefault();e.stopPropagation();const id=wholeBatch.getAttribute('data-v318-revert-whole-batch');
      busy(true,'กำลังค้นหารายการทั้ง Batch');
      try{
        let res=await db().from('ot_requests').select('id').eq('export_batch_id',id);
        if(res.error)throw res.error;
        if(!(res.data||[]).length){res=await db().from('ot_requests').select('id').eq('batch_id',id);if(res.error)throw res.error;}
        if(!(res.data||[]).length){res=await db().from('ot_requests').select('id').eq('claim_batch_id',id);if(res.error)throw res.error;}
        busy(false);await resetHistoryRows((res.data||[]).map(x=>x.id));
      }catch(err){busy(false);toast(`ค้นหา Batch ไม่สำเร็จ: ${err?.message||err}`,'error');}
    }
  },true);

  document.addEventListener('change',async e=>{
    const id=e.target?.id||'';
    if(id==='hrDateModeV664'){const q=document.getElementById('hrDateQuotaV664');if(q)q.disabled=String(e.target.value)==='all';return;}
    if(id==='hrHistoryStaffV318'||id==='hrHistoryYearV318'||id==='hrHistoryMonthNumberV318'){
      if(id==='hrHistoryStaffV318')st().hrHistoryStaffV318=String(e.target.value||'');
      if(id==='hrHistoryYearV318')st().hrHistoryYearV318=String(e.target.value||'');
      if(id==='hrHistoryMonthNumberV318')st().hrHistoryMonthNumberV318=String(e.target.value||'');
      st().hrHistoryRowsV318=[];try{renderPage();}catch(_){ }
      if(st().hrHistoryStaffV318&&st().hrHistoryYearV318&&st().hrHistoryMonthNumberV318)await loadHistory(false);
      return;
    }
    if(id==='otMoneyMonthV241'||id==='otSourceMonthV241'){
      const value=monthKey(e.target.value);st().otMoneyMonthV241=value;st().otSourceMonthV241=value;
      try{await window.cnmiV316?.loadPageData?.('ot',{force:false});renderPage();}catch(_){ }
    }
  },true);

  window.cnmiV318={version:VERSION,exportHr:exportV318,loadHistory,queryCarryIn,queryCarryInSummary,getLockedDates:(month)=>hrDatePlan(month).dates,setLockedDates:(month,dates)=>saveHrDatePlan(month,{dates,mode:'all',quota:1}),getDatePlan:hrDatePlan,setDatePlan:saveHrDatePlan,previewDatePlan:previewHrDatePlanV664,clearHistoryCache(){historyCache.clear();},clearCarryCache(){carryCache.clear();summaryCarryCache.clear();},_test:{encodeCarryMarker,parseCarryMarker,applyCarryIn,selectedHistoryMonth,allocate,hrDatePlan,saveHrDatePlan,cleanPlanDates,queryCarryInForHrExport}};
  console.info(`[${VERSION}] loaded`);
})();
