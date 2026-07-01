/* CNMI Staff Planner V318 — automatic carry + year/month history + balanced HR dummy
   - Automatically brings the previous closing carry into the next source month.
   - Stores a compact carry snapshot inside claim_batch_id; no new Supabase table or SQL.
   - Legacy V317 carry is reconstructed from the immediately preceding exported month.
   - Balances total dummy staff per date first, then balances each time slot.
   - Export history stays blank until staff, year, and month are selected separately.
*/
(function(){
  'use strict';
  const VERSION='V318_HR_CARRY_YEAR_BALANCED_DUMMY';
  if(window.__CNMI_V318_HR_CARRY_YEAR_BALANCED_DUMMY__)return;
  window.__CNMI_V318_HR_CARRY_YEAR_BALANCED_DUMMY__=true;

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  const historyCache=new Map();
  const HISTORY_TTL=60*1000;
  const CARRY_META_PREFIX='V318CF:';
  const carrySnapshotCache=new Map();

  function st(){try{return state;}catch(_){return window.state||{};}}
  function db(){try{return sb;}catch(_){return window.sb||null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function pad2(n){return String(n).padStart(2,'0');}
  function round2(v){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
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
  async function queryExportData(month){
    const client=db();if(!client)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const source=monthRange(month),cycle=cycleRange(month),holidayStart=source.start<cycle.start?source.start:cycle.start,holidayEnd=source.end>cycle.end?source.end:cycle.end;
    const queries=[
      client.from('ot_requests').select('*').gte('work_date',source.start).lte('work_date',source.end).order('work_date',{ascending:true}),
      client.from('leave_requests').select('*').gte('end_date',cycle.start).lte('start_date',cycle.end).order('start_date',{ascending:true}),
      client.from('public_holidays').select('*').gte('holiday_date',holidayStart).lte('holiday_date',holidayEnd).order('holiday_date',{ascending:true}),
      client.from('roster_assignments').select('*').gte('duty_date',source.start).lte('duty_date',source.end).order('duty_date',{ascending:true}),
      client.from('monthly_incharges').select('*').eq('month_key',source.month).limit(10)
    ];
    const [ot,leaves,holidays,roster,incharges]=await Promise.all(queries);
    for(const r of [ot,leaves,holidays,roster,incharges])if(r?.error)throw r.error;
    const app=st();
    app.otRequests=mergeRows(app.otRequests,ot.data||[],x=>String(x.id||`${x.staff_id}|${x.work_date}|${x.created_at||''}`));
    app.leaves=mergeRows(app.leaves,leaves.data||[],x=>String(x.id||`${x.staff_id}|${x.start_date}|${x.end_date}`));
    app.holidays=mergeRows(app.holidays,holidays.data||[],x=>dateKey(x.holiday_date||x.date));
    app.rosterAssignments=mergeRows(app.rosterAssignments,roster.data||[],x=>String(x.id||`${x.staff_id}|${x.duty_date}|${x.duty_code}`));
    app.incharges=mergeRows(app.incharges,incharges.data||[],x=>String(x.id||x.month_key));
    return {source,cycle,rows:(ot.data||[]).filter(r=>approved(r)&&claimStatus(r)==='pending'),leaves:leaves.data||[],holidays:holidays.data||[]};
  }

  function encodeUtf8Base64(value){
    try{return btoa(unescape(encodeURIComponent(String(value||'')))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
    catch(_){return '';}
  }
  function decodeUtf8Base64(value){
    try{const raw=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),pad=raw+'='.repeat((4-raw.length%4)%4);return decodeURIComponent(escape(atob(pad)));}
    catch(_){return '';}
  }
  function carryEntries(map){return [...(map instanceof Map?map.entries():Object.entries(map||{}))].map(([id,v])=>[String(id),round2(v)]).filter(x=>x[0]&&Math.abs(x[1])>0.004);}
  function carryMap(entries){const out=new Map();(entries||[]).forEach(x=>{const id=String(x?.[0]||''),v=round2(x?.[1]);if(id&&v>0)out.set(id,v);});return out;}
  function buildCarryMeta(batch,month,opening,totals){
    const payload={v:318,b:String(batch||''),m:monthKey(month),o:carryEntries(opening),c:totals.map(t=>[String(t.staff_id),round2(t.carry)]).filter(x=>x[1]>0.004)};
    return `${batch}|${CARRY_META_PREFIX}${encodeUtf8Base64(JSON.stringify(payload))}`;
  }
  function parseCarryMeta(value){
    const raw=String(value||''),i=raw.indexOf(CARRY_META_PREFIX);if(i<0)return null;
    try{const obj=JSON.parse(decodeUtf8Base64(raw.slice(i+CARRY_META_PREFIX.length)));return obj&&Number(obj.v)>=318?obj:null;}catch(_){return null;}
  }
  function localCarryKey(month){return `cnmi_hr_carry_v318_${monthKey(month)}`;}
  function saveLocalCarry(month,meta){try{localStorage.setItem(localCarryKey(month),JSON.stringify(meta));}catch(_){} }
  function readLocalCarry(month){try{const v=JSON.parse(localStorage.getItem(localCarryKey(month))||'null');return v&&v.m===monthKey(month)?v:null;}catch(_){return null;} }
  function clearCarryLocal(){try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i)||'';if(k.startsWith('cnmi_hr_carry_v318_'))localStorage.removeItem(k);}}catch(_){}carrySnapshotCache.clear();}

  async function queryCarrySnapshot(month){
    const key=monthKey(month),cached=carrySnapshotCache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
    const local=readLocalCarry(key);
    try{
      const r=monthRange(key),res=await db().from('ot_requests').select('claim_batch_id,export_batch_id,batch_id,exported_at,claimed_at,work_date').gte('work_date',r.start).lte('work_date',r.end).eq('claim_status','exported').order('exported_at',{ascending:false}).limit(200);
      if(res.error)throw res.error;
      for(const row of (res.data||[])){const meta=parseCarryMeta(row.claim_batch_id);if(meta&&meta.m===key){const value={map:carryMap(meta.c),sourceMonth:key,mode:'snapshot',meta};carrySnapshotCache.set(key,{value,expires:Date.now()+HISTORY_TTL});return value;}}
    }catch(err){console.warn(`[${VERSION}] carry snapshot query fallback`,err);}
    if(local){const value={map:carryMap(local.c),sourceMonth:key,mode:'local',meta:local};carrySnapshotCache.set(key,{value,expires:Date.now()+HISTORY_TTL});return value;}
    carrySnapshotCache.set(key,{value:null,expires:Date.now()+HISTORY_TTL});return null;
  }

  async function reconstructLegacyCarry(month){
    const key=monthKey(month),client=db(),r=monthRange(key);
    const [ot,roster,holidays]=await Promise.all([
      client.from('ot_requests').select('*').gte('work_date',r.start).lte('work_date',r.end).order('work_date',{ascending:true}),
      client.from('roster_assignments').select('*').gte('duty_date',r.start).lte('duty_date',r.end).order('duty_date',{ascending:true}),
      client.from('public_holidays').select('*').gte('holiday_date',r.start).lte('holiday_date',r.end).order('holiday_date',{ascending:true})
    ]);
    for(const x of [ot,roster,holidays])if(x?.error)throw x.error;
    const app=st();
    app.rosterAssignments=mergeRows(app.rosterAssignments,roster.data||[],x=>String(x.id||`${x.staff_id}|${x.duty_date}|${x.duty_code}`));
    app.holidays=mergeRows(app.holidays,holidays.data||[],x=>dateKey(x.holiday_date||x.date));
    const rows=(ot.data||[]).filter(x=>approved(x)&&claimStatus(x)==='exported'),totals=buildTotals(rows,new Map(),null);
    const map=new Map();totals.forEach(t=>{const v=round2(Number(t.total||0)-Math.floor((Number(t.total||0)+1e-7)/8)*8);if(v>0.004)map.set(String(t.staff_id),v);});
    return {map,sourceMonth:key,mode:'legacy-v317'};
  }

  async function loadOpeningCarry(month){
    const key=monthKey(month);
    const same=await queryCarrySnapshot(key);if(same)return same;
    const prev=previousMonth(key),snapshot=await queryCarrySnapshot(prev);if(snapshot)return snapshot;
    try{return await reconstructLegacyCarry(prev);}catch(err){console.warn(`[${VERSION}] legacy carry reconstruction failed`,err);return {map:new Map(),sourceMonth:prev,mode:'none'};}
  }

  function buildTotals(rows,openingCarry=new Map(),openingSourceMonth=null){
    const map=new Map();
    for(const [rawId,rawCarry] of (openingCarry instanceof Map?openingCarry.entries():Object.entries(openingCarry||{}))){
      const id=String(rawId||''),carry=round2(rawCarry);if(!id||carry<=0.004)continue;
      map.set(id,{staff_id:id,actual:0,currentTotal:0,openingCarry:carry,openingSourceMonth,total:carry,actualMoney:0,rows:[],baseType:baseType(id),baseRate:baseRate(id),employeeCode:employeeCode(id)});
    }
    (rows||[]).forEach(row=>{
      const n=normalize(row);if(Number(n.hrHours||0)<=0)return;
      const id=String(row.staff_id||'');
      if(!map.has(id))map.set(id,{staff_id:id,actual:0,currentTotal:0,openingCarry:0,openingSourceMonth,total:0,actualMoney:0,rows:[],baseType:baseType(id),baseRate:baseRate(id),employeeCode:employeeCode(id)});
      const t=map.get(id);t.actual=round2(t.actual+Number(n.actualHours||0));t.currentTotal=round2(t.currentTotal+Number(n.hrHours||0));t.total=round2(Number(t.openingCarry||0)+t.currentTotal);t.actualMoney=round2(t.actualMoney+Number(n.actualMoney||0));t.rows.push({row,n});
    });
    return [...map.values()].filter(t=>Number(t.total||0)>0.004).sort((a,b)=>staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th'));
  }
  function allowedSlots(date,holidays){return (weekend(date)||publicHoliday(date,holidays))?[0,8,16]:[0,16];}
  function slotTimes(slot){if(slot===8)return {start:'08:00',end:'16:00',startValue:8/24,endValue:16/24};if(slot===16)return {start:'16:00',end:'00:00',startValue:16/24,endValue:0};return {start:'00:00',end:'08:00',startValue:0,endValue:8/24};}
  function allocate(totals,cycle,leaves,holidays){
    const dates=datesBetween(cycle.start,cycle.end),occupancy=new Map(),dateOccupancy=new Map(dates.map(d=>[d,0])),rows=[],leaveSkipped=[];
    const dailyCount=new Map(),staffSlotUsed=new Set(),remaining=new Map();
    totals.forEach(t=>{t.desiredUnits=Math.max(0,Math.floor((Number(t.total||0)+1e-7)/8));remaining.set(String(t.staff_id),t.desiredUnits);});
    const order=totals.slice().sort((a,b)=>Number(b.desiredUnits||0)-Number(a.desiredUnits||0)||staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th'));
    const orderIndex=new Map(order.map((t,i)=>[String(t.staff_id),i]));
    let left=[...remaining.values()].reduce((s,x)=>s+Number(x||0),0),cursor=0,guard=0;
    while(left>0&&guard++<10000){
      let progressed=false;
      for(let step=0;step<order.length;step++){
        const t=order[(cursor+step)%Math.max(1,order.length)],sid=String(t.staff_id),remain=Number(remaining.get(sid)||0);if(remain<=0)continue;
        const candidates=[];
        dates.forEach((date,di)=>{
          if(hasLeave(sid,date,leaves)){if(!leaveSkipped.some(x=>x.staff_id===sid&&x.date===date))leaveSkipped.push({staff_id:sid,date,reason:'วันลาในรอบ HR'});return;}
          const dayKey=`${sid}|${date}`,staffDay=Number(dailyCount.get(dayKey)||0);if(staffDay>=2)return;
          const slots=allowedSlots(date,holidays).filter(slot=>!staffSlotUsed.has(`${sid}|${date}|${slot}`)&&(occupancy.get(`${date}|${slot}`)||0)<6);if(!slots.length)return;
          const minSlotLoad=Math.min(...slots.map(slot=>Number(occupancy.get(`${date}|${slot}`)||0)));
          const offset=(Number(orderIndex.get(sid)||0)*2)%Math.max(1,dates.length),cyclic=(di-offset+dates.length)%dates.length;
          candidates.push({date,staffDay,dateLoad:Number(dateOccupancy.get(date)||0),minSlotLoad,cyclic,slots});
        });
        if(!candidates.length)continue;
        candidates.sort((a,b)=>a.dateLoad-b.dateLoad||a.staffDay-b.staffDay||a.minSlotLoad-b.minSlotLoad||a.cyclic-b.cyclic||a.date.localeCompare(b.date));
        const chosen=candidates[0],slot=chosen.slots.slice().sort((a,b)=>(occupancy.get(`${chosen.date}|${a}`)||0)-(occupancy.get(`${chosen.date}|${b}`)||0)||a-b)[0];
        const key=`${chosen.date}|${slot}`,dayKey=`${sid}|${chosen.date}`,times=slotTimes(slot),holidayType=(weekend(chosen.date)||publicHoliday(chosen.date,holidays));
        rows.push({staff_id:sid,date:chosen.date,slot,...times,type:holidayType?2:1,claimCode:holidayType?claimCodes(sid).holiday:claimCodes(sid).normal,employeeCode:t.employeeCode,name:staffNickSafe(sid),fullName:staffFullName(sid)});
        occupancy.set(key,Number(occupancy.get(key)||0)+1);dateOccupancy.set(chosen.date,Number(dateOccupancy.get(chosen.date)||0)+1);dailyCount.set(dayKey,Number(dailyCount.get(dayKey)||0)+1);staffSlotUsed.add(`${sid}|${chosen.date}|${slot}`);remaining.set(sid,remain-1);left--;progressed=true;
      }
      cursor=(cursor+1)%Math.max(1,order.length);if(!progressed)break;
    }
    totals.forEach(t=>{
      const mine=rows.filter(x=>String(x.staff_id)===String(t.staff_id));t.claimedUnits=mine.length;t.claimed=round2(t.claimedUnits*8);t.carry=round2(Number(t.total||0)-t.claimed);t.unallocatedUnits=Math.max(0,Number(t.desiredUnits||0)-t.claimedUnits);t.normalHours=mine.filter(x=>x.type===1).length*8;t.holidayHours=mine.filter(x=>x.type===2).length*8;t.money=round2(t.claimed*t.baseRate);
    });
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot||staffNickSafe(a.staff_id).localeCompare(staffNickSafe(b.staff_id),'th'));
    const loads=dates.map(d=>Number(dateOccupancy.get(d)||0)),minDateLoad=loads.length?Math.min(...loads):0,maxDateLoad=loads.length?Math.max(...loads):0;
    return {rows,occupancy,dateOccupancy,dates,leaveSkipped,minDateLoad,maxDateLoad,loadDifference:maxDateLoad-minDateLoad};
  }

  function sourceRowsForSheet(totals,month,cycle){
    const out=[];
    totals.forEach(t=>{
      if(Number(t.openingCarry||0)>0.004)out.push({'รหัสพนักงาน':t.employeeCode,'ชื่อ':staffFullName(t.staff_id),'ชื่อเล่น':staffNickSafe(t.staff_id),'วันที่ OT จริง':'','เดือนเบิกจริง':month,'รอบ HR dummy':`${cycle.start} ถึง ${cycle.end}`,'เหตุผล':`ยอดทบยกมาจาก ${t.openingSourceMonth||'เดือนก่อน'}`,'หมายเหตุ':'ระบบนำมารวมให้อัตโนมัติ','ประเภทเวร':'Carry Forward','ชั่วโมงจริง':0,'เรทงานจริง (บาท/ชม.)':t.baseRate,'ฐาน HR (บาท/ชม.)':t.baseRate,'ชั่วโมงเทียบ HR':round2(t.openingCarry),'เงินตามงานจริง':0,'การแปลงเรท':'ยอดทบเดือนก่อน','claim_status ก่อน Export':'carry'});
      t.rows.forEach(({row,n})=>{
        const segments=Array.isArray(n.segments)?n.segments:[],rates=[...new Set(segments.map(x=>Number(x.appliedRate||0)).filter(Boolean))].join('/');
        out.push({'รหัสพนักงาน':t.employeeCode,'ชื่อ':staffFullName(t.staff_id),'ชื่อเล่น':staffNickSafe(t.staff_id),'วันที่ OT จริง':dateKey(row.work_date),'เดือนเบิกจริง':month,'รอบ HR dummy':`${cycle.start} ถึง ${cycle.end}`,'เหตุผล':String(row.reason||''),'หมายเหตุ':String(row.note||''),'ประเภทเวร':n.shiftType||'-','ชั่วโมงจริง':round2(n.actualHours),'เรทงานจริง (บาท/ชม.)':rates||t.baseRate,'ฐาน HR (บาท/ชม.)':t.baseRate,'ชั่วโมงเทียบ HR':round2(n.hrHours),'เงินตามงานจริง':round2(n.actualMoney),'การแปลงเรท':n.tangMtConversion?'อริภัศ/แตง: งาน MT แปลงเป็นฐานเคิก 90':'ตามกลุ่มเจ้าหน้าที่','claim_status ก่อน Export':String(row.claim_status||'pending')});
      });
    });
    return out;
  }
  function staffSummaryRows(totals){return totals.map(t=>({'รหัสพนักงาน':t.employeeCode,'ชื่อ':staffFullName(t.staff_id),'ชื่อเล่น':staffNickSafe(t.staff_id),'กลุ่ม HR':t.baseType,'ฐาน HR':t.baseRate,'ชั่วโมงจริงเดือนนี้':t.actual,'ยอดทบยกมา':t.openingCarry||0,'ชั่วโมงเทียบ HR เดือนนี้':t.currentTotal||0,'โอทีทั้งหมด':t.total,'เบิกจริง':t.claimed,'ทบเดือนหน้า(ชม.)':t.carry,'จำนวนเวร 8 ชม.':t.claimedUnits,'เวรที่จัดไม่ได้เพราะลา/ความจุ':t.unallocatedUnits,'คำนวณเป็นเงิน':t.money}));}
  function holidayDayList(cycle,holidays){return datesBetween(cycle.start,cycle.end).filter(d=>weekend(d)||publicHoliday(d,holidays)).map(d=>String(Number(d.slice(-2))).padStart(2,'0')).join(',');}

  function makeOtExtraSheet(sourceRows,totals,source,cycle){
    const rows=[
      [`สรุป OT เดือน ${source.month} / HR dummy ${cycle.start} ถึง ${cycle.end}`],
      ['ชื่อ','ยอดทบยกมา (ชม.)','OT เดือนนี้เทียบ HR (ชม.)','โอทีทั้งหมด (ชม.)','เบิกจริง (ชม.)','ทบเดือนหน้า (ชม.)','ฐาน HR','คำนวณเป็นเงิน','หมายเหตุ'],
      ...totals.map(t=>[staffFullName(t.staff_id),t.openingCarry||0,t.currentTotal||0,t.total,t.claimed,t.carry,t.baseRate,t.money,isTang(t.staff_id)?'อริภัศ/แตง: งานปั่นเลือด/งาน MT คิดเรท MT แล้วหารฐานเคิก 90':'']),
      [],
      ['รายละเอียดต้นทาง'],
      ['ชื่อ','วันที่ OT','เหตุผล','ประเภทเวร','ชั่วโมงจริง','เรทงานจริง','ฐาน HR','ชั่วโมงเทียบ HR','เงินตามงานจริง','หมายเหตุการแปลง'],
      ...sourceRows.map(r=>[r['ชื่อ'],r['วันที่ OT จริง'],r['เหตุผล'],r['ประเภทเวร'],r['ชั่วโมงจริง'],r['เรทงานจริง (บาท/ชม.)'],r['ฐาน HR (บาท/ชม.)'],r['ชั่วโมงเทียบ HR'],r['เงินตามงานจริง'],r['การแปลงเรท']])
    ];
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:34},{wch:18},{wch:22},{wch:18},{wch:15},{wch:18},{wch:12},{wch:16},{wch:52},{wch:42}];return ws;
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
  function makeBalanceSheet(allocation,cycle){
    const rows=[[`ตรวจสมดุล Dummy ${cycle.start} ถึง ${cycle.end}`],[`จำนวนต่อวันต่ำสุด ${allocation.minDateLoad} คน / สูงสุด ${allocation.maxDateLoad} คน / ต่างกัน ${allocation.loadDifference} คน`],[],['วันที่','วัน','รวมคน','00:00-08:00','08:00-16:00','16:00-00:00']];
    (allocation.dates||[]).forEach(date=>rows.push([date,thaiWeekday(date),Number(allocation.dateOccupancy.get(date)||0),Number(allocation.occupancy.get(`${date}|0`)||0),Number(allocation.occupancy.get(`${date}|8`)||0),Number(allocation.occupancy.get(`${date}|16`)||0)]));
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:16},{wch:14},{wch:12},{wch:16},{wch:16},{wch:16}];ws['!autofilter']={ref:`A4:F${Math.max(4,rows.length)}`};return ws;
  }
  function makeJsonSheet(rows,headers,widths){const ws=XLSX.utils.json_to_sheet(rows,{header:headers});ws['!cols']=(widths||headers.map(()=>16)).map(w=>({wch:w}));ws['!autofilter']={ref:`A1:${XLSX.utils.encode_col(headers.length-1)}${Math.max(1,rows.length+1)}`};return ws;}
  function batchId(){const d=new Date();return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;}
  async function markExported(ids,id,carryMetaValue){if(!ids.length)return;const now=new Date().toISOString(),actor=currentStaffIdSafe(),payload={claim_status:'exported',export_batch_id:id,exported_by:actor,exported_at:now,batch_id:id,export_date:now,claim_batch_id:carryMetaValue||id,claimed_at:now,claimed_by:actor};const res=await db().from('ot_requests').update(payload).in('id',ids);if(res.error)throw res.error;}

  async function exportV318(){
    if(!admin())return toast('เฉพาะ Admin เท่านั้น','error');
    if(typeof XLSX==='undefined')return toast('ไม่พบไลบรารี Excel','error');
    const month=monthKey(st().otSourceMonthV241||st().otMoneyMonthV241||st().monthKey);
    busy(true,'กำลังนำยอดทบมารวมและจัด HR dummy ให้สมดุล');
    try{
      const data=await queryExportData(month),opening=await loadOpeningCarry(month);
      if(!data.rows.length&&![...(opening.map||new Map()).values()].some(v=>Number(v)>=8))throw new Error('ยังไม่มีรายการ OT ที่อนุมัติและรอ Export ในเดือนนี้');
      const totals=buildTotals(data.rows,opening.map,opening.sourceMonth);if(!totals.length)throw new Error('ไม่พบชั่วโมง OT ที่ใช้คำนวณได้');
      const missing=totals.filter(t=>!t.employeeCode).map(t=>staffNickSafe(t.staff_id));if(missing.length)throw new Error(`ยังไม่มีรหัสพนักงานของ: ${missing.join(', ')} กรุณาใส่ในข้อมูลเจ้าหน้าที่ก่อน Export`);
      const allocation=allocate(totals,data.cycle,data.leaves,data.holidays),sourceSheetRows=sourceRowsForSheet(totals,data.source.month,data.cycle),summaryRows=staffSummaryRows(totals);
      const leaveRows=allocation.leaveSkipped.map(x=>({'รหัสพนักงาน':employeeCode(x.staff_id),'ชื่อ':staffFullName(x.staff_id),'วันที่ลาในรอบ HR':x.date,'หมายเหตุ':'ระบบไม่สร้าง dummy shift ในวันนี้'}));
      const carryRows=totals.filter(t=>Number(t.carry)>0).map(t=>({'รหัสพนักงาน':t.employeeCode,'ชื่อ':staffFullName(t.staff_id),'เดือนต้นทาง':data.source.month,'ยอดทบยกมา':t.openingCarry||0,'OT เดือนนี้เทียบ HR':t.currentTotal||0,'โอทีทั้งหมด':t.total,'เบิกจริง':t.claimed,'ทบเดือนหน้า(ชม.)':t.carry,'หมายเหตุ':'ระบบจะนำยอดนี้ไปรวมอัตโนมัติในรอบถัดไป'}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,makeOtExtraSheet(sourceSheetRows,totals,data.source,data.cycle),'OT เสริม');
      XLSX.utils.book_append_sheet(wb,makeScheduleSheet(allocation,totals,data.cycle),'ตาราง');
      XLSX.utils.book_append_sheet(wb,makeCopySheet(allocation,data.cycle,data.holidays),'copy');
      XLSX.utils.book_append_sheet(wb,makeTimeSheet(),'time');
      XLSX.utils.book_append_sheet(wb,makeNameSheet(totals,allocation),'name');
      XLSX.utils.book_append_sheet(wb,makeHrSheet(allocation),'HR_OT');
      XLSX.utils.book_append_sheet(wb,makeBalanceSheet(allocation,data.cycle),'Dummy_Balance');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(sourceSheetRows,Object.keys(sourceSheetRows[0]||{}),[14,30,14,14,12,24,34,42,14,12,16,12,16,16,44,20]),'Source_OT_1_to_End');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(summaryRows,Object.keys(summaryRows[0]||{}),[14,30,14,12,10,16,14,20,14,12,18,14,18,16]),'Staff_Total');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(carryRows,Object.keys(carryRows[0]||{'รหัสพนักงาน':'','ชื่อ':'','เดือนต้นทาง':'','ยอดทบยกมา':'','OT เดือนนี้เทียบ HR':'','โอทีทั้งหมด':'','เบิกจริง':'','ทบเดือนหน้า(ชม.)':'','หมายเหตุ':''}),[14,30,12,14,20,14,12,18,54]),'Carry_Forward');
      XLSX.utils.book_append_sheet(wb,makeJsonSheet(leaveRows,Object.keys(leaveRows[0]||{'รหัสพนักงาน':'','ชื่อ':'','วันที่ลาในรอบ HR':'','หมายเหตุ':''}),[14,30,18,42]),'Leave_Skipped');
      const id=batchId(),metaText=buildCarryMeta(id,data.source.month,opening.map,totals),meta=parseCarryMeta(metaText),filename=`HR_OT_V318_${id}_source_${data.source.start}_to_${data.source.end}_dummy_${data.cycle.start}_to_${data.cycle.end}.xlsx`;
      XLSX.writeFile(wb,filename);
      await markExported([...new Set(data.rows.map(r=>r.id).filter(Boolean))],id,metaText);
      if(meta)saveLocalCarry(data.source.month,meta);carrySnapshotCache.clear();
      try{window.cnmiV316?.clearCache?.();await window.cnmiV316?.loadPageData?.('ot',{force:true});}catch(_){ }
      st().otSubtabV241='summary';try{renderPage();}catch(_){ }
      const totalOpening=round2(totals.reduce((s,x)=>s+Number(x.openingCarry||0),0)),totalCarry=round2(totals.reduce((s,x)=>s+Number(x.carry||0),0));
      toast(`Export สำเร็จ • ยอดทบยกมา ${hours(totalOpening)} ชม. • ทบเดือนหน้า ${hours(totalCarry)} ชม. • จำนวนคนต่อวัน ${allocation.minDateLoad}-${allocation.maxDateLoad} คน • Batch ${id}`);
    }catch(err){console.error(`[${VERSION}] export failed`,err);toast(String(err?.message||err||'Export ไม่สำเร็จ'),'error');}
    finally{busy(false);}
  }

  function historyYears(){const now=new Date().getFullYear(),selected=Number(st().hrHistoryYearV318||0),set=new Set();for(let y=now+1;y>=now-6;y--)set.add(y);if(selected)set.add(selected);return [...set].sort((a,b)=>b-a);}
  function historyMonthNumbers(){return Array.from({length:12},(_,i)=>({value:pad2(i+1),label:new Date(2020,i,1).toLocaleDateString('th-TH',{month:'long'})}));}
  function activeStaff(){return (st().staff||[]).filter(s=>s.is_active!==false&&s.active!==false&&!/แพทย์|physician/i.test(String(s.staff_type||s.role||''))).sort((a,b)=>String(a.nickname||a.full_name||'').localeCompare(String(b.nickname||b.full_name||''),'th'));}
  function selectedHistoryMonth(){const y=String(st().hrHistoryYearV318||''),m=String(st().hrHistoryMonthNoV318||'');return /^\d{4}$/.test(y)&&/^\d{2}$/.test(m)?`${y}-${m}`:'';}
  function historyKey(staffId,month){return `${staffId}|${month}`;}
  async function loadHistory(force=false){
    const staffId=String(st().hrHistoryStaffV318||''),month=selectedHistoryMonth();if(!staffId||!month)return;
    const key=historyKey(staffId,month),saved=historyCache.get(key);if(!force&&saved&&saved.expires>Date.now()){st().hrHistoryRowsV318=saved.rows;st().hrHistoryLoadingV318=false;return;}
    st().hrHistoryLoadingV318=true;try{renderPage();}catch(_){ }
    try{const r=monthRange(month),res=await db().from('ot_requests').select('*').eq('staff_id',staffId).gte('work_date',r.start).lte('work_date',r.end).order('work_date',{ascending:false});if(res.error)throw res.error;const rows=(res.data||[]).filter(x=>approved(x)&&claimStatus(x)==='exported');historyCache.set(key,{rows,expires:Date.now()+HISTORY_TTL});st().hrHistoryRowsV318=rows;}
    catch(err){console.error(`[${VERSION}] history load failed`,err);st().hrHistoryRowsV318=[];toast(`โหลดประวัติ Export ไม่สำเร็จ: ${err?.message||err}`,'error');}
    finally{st().hrHistoryLoadingV318=false;try{renderPage();}catch(_){ }}
  }
  function groupHistory(rows){const map=new Map();(rows||[]).forEach(row=>{const id=rowBatch(row);if(!map.has(id))map.set(id,{rows:[],actual:0,hr:0,money:0,at:'',by:''});const g=map.get(id),n=normalize(row);g.rows.push(row);g.actual=round2(g.actual+Number(n.actualHours||0));g.hr=round2(g.hr+Number(n.hrHours||0));g.money=round2(g.money+Number(n.hrHours||0)*baseRate(row.staff_id));const at=rowExportedAt(row);if(at&&(!g.at||String(at)>String(g.at)))g.at=at;if(row.exported_by||row.claimed_by)g.by=row.exported_by||row.claimed_by;});return [...map.entries()].sort((a,b)=>String(b[1].at||b[0]).localeCompare(String(a[1].at||a[0])));}
  function historyHtml(){
    if(!admin())return '<div class="card"><div class="empty">เฉพาะ Admin เท่านั้น</div></div>';
    const selectedStaff=String(st().hrHistoryStaffV318||''),selectedYear=String(st().hrHistoryYearV318||''),selectedMonthNo=String(st().hrHistoryMonthNoV318||''),selectedMonth=selectedHistoryMonth();
    const filters=`<div class="card"><div class="section-title"><div><h3>ประวัติ Export HR</h3><p class="hint">ระบบจะยังไม่ดึงตารางจนกว่าจะเลือกชื่อเจ้าหน้าที่ ปี และเดือนครบ</p></div></div><div class="toolbar compact-filter"><label>เจ้าหน้าที่ <select id="hrHistoryStaffV318"><option value="">กรุณาเลือกชื่อ</option>${activeStaff().map(s=>`<option value="${esc(s.id)}" ${String(s.id)===selectedStaff?'selected':''}>${esc(s.nickname||s.full_name||'-')}</option>`).join('')}</select></label><label>ปี <select id="hrHistoryYearV318"><option value="">กรุณาเลือกปี</option>${historyYears().map(y=>`<option value="${y}" ${String(y)===selectedYear?'selected':''}>พ.ศ. ${y+543}</option>`).join('')}</select></label><label>เดือน <select id="hrHistoryMonthNoV318"><option value="">กรุณาเลือกเดือน</option>${historyMonthNumbers().map(m=>`<option value="${m.value}" ${m.value===selectedMonthNo?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label></div></div>`;
    if(!selectedStaff||!selectedMonth)return `${filters}<div class="card"><div class="empty">กรุณาเลือกชื่อเจ้าหน้าที่ ปี และเดือนก่อน ระบบจึงจะโหลดประวัติ Export</div></div>`;
    if(st().hrHistoryLoadingV318)return `${filters}<div class="card"><div class="empty">กำลังโหลดเฉพาะ ${esc(staffNickSafe(selectedStaff))} เดือน ${esc(selectedMonthNo)}/${esc(selectedYear)}…</div></div>`;
    const rows=st().hrHistoryRowsV318||[],groups=groupHistory(rows);if(!groups.length)return `${filters}<div class="card"><div class="empty">ไม่พบรายการ Exported ของ ${esc(staffNickSafe(selectedStaff))} ในปีและเดือนที่เลือก</div></div>`;
    return `${filters}${groups.map(([id,g])=>`<div class="card v241-export-batch"><div class="section-title"><div><h3>Batch ${esc(id)}</h3><p class="hint">${g.rows.length} รายการ • ${hours(g.hr)} ชั่วโมงเบิก HR • ${esc(money(g.money))} • Export เมื่อ ${esc(fmtDateTime(g.at))}${g.by?` • โดย ${esc(staffNickSafe(g.by))}`:''}</p></div><div class="actions"><button class="tiny-btn danger" type="button" data-v318-revert-selected-batch="${esc(id)}">ตีกลับเฉพาะชื่อนี้</button><button class="danger-btn" type="button" data-v318-revert-whole-batch="${esc(id)}">ตีกลับทั้ง Batch</button></div></div><div class="table-wrap"><table><thead><tr><th>วันที่ OT</th><th>เจ้าหน้าที่</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${g.rows.map(row=>{const n=normalize(row);return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${staffPillSafe(row.staff_id)}</td><td>${hours(n.actualHours,1)}</td><td><b>${hours(n.hrHours)}</b></td><td>${esc(row.reason||'-')}</td><td><span class="badge green">Exported</span></td><td><button class="tiny-btn danger" type="button" data-v318-revert-row="${esc(row.id)}">ตีกลับรายการนี้</button></td></tr>`;}).join('')}</tbody></table></div></div>`).join('')}`;
  }
  function replaceContent(base,html){
    try{const tpl=document.createElement('template');tpl.innerHTML=String(base||'');const content=tpl.content.querySelector('.v241-ot-content');if(content)content.innerHTML=html;const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;}catch(_){return base;}
  }
  if(previousRenderOtPage){
    const wrapped=function renderOtPageV318(){let base=String(previousRenderOtPage.apply(this,arguments)||'');const active=st().otSubtabV241||'mine';if(active==='history')return replaceContent(base,historyHtml());if(active==='export')base=base.replace(/data-export-hr-v241/g,'data-export-hr-v318').replace('นำ OT จริงของเดือน 1-สิ้นเดือน ไปกระจายเป็น HR dummy ในรอบ 16-15','นำยอดทบเดือนก่อนมารวมอัตโนมัติ แล้วจัด Dummy แบบสมดุลรายวันและเบิกเป็นชุดละ 8 ชม.');return base;};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  async function resetHistoryRows(ids){
    ids=[...new Set((ids||[]).filter(Boolean))];if(!ids.length)return toast('ไม่พบรายการที่ต้องตีกลับ','error');
    const ok=typeof confirmDialog==='function'?await confirmDialog(`ต้องการตีกลับ ${ids.length} รายการเป็น Pending ใช่ไหม? ยอดทบจะคำนวณใหม่เมื่อ Export ครั้งถัดไป`,'ยืนยันตีกลับ Export'):window.confirm(`ต้องการตีกลับ ${ids.length} รายการเป็น Pending ใช่ไหม?`);if(!ok)return;
    busy(true,'กำลังตีกลับ Export');
    try{const payload={claim_status:'pending',export_batch_id:null,exported_by:null,exported_at:null,batch_id:null,export_date:null,claim_batch_id:null,claimed_at:null,claimed_by:null},res=await db().from('ot_requests').update(payload).in('id',ids);if(res.error)throw res.error;historyCache.delete(historyKey(st().hrHistoryStaffV318,selectedHistoryMonth()));clearCarryLocal();await loadHistory(true);toast(`ตีกลับเป็น Pending แล้ว ${ids.length} รายการ`);}catch(err){toast(`ตีกลับไม่สำเร็จ: ${err?.message||err}`,'error');}finally{busy(false);}
  }

  document.addEventListener('click',async e=>{
    const exportBtn=e.target?.closest?.('[data-export-hr-v318]');if(exportBtn){e.preventDefault();e.stopPropagation();await exportV318();return;}
    const row=e.target?.closest?.('[data-v318-revert-row]');if(row){e.preventDefault();e.stopPropagation();await resetHistoryRows([row.getAttribute('data-v318-revert-row')]);return;}
    const selectedBatch=e.target?.closest?.('[data-v318-revert-selected-batch]');if(selectedBatch){e.preventDefault();e.stopPropagation();const id=selectedBatch.getAttribute('data-v318-revert-selected-batch'),ids=(st().hrHistoryRowsV318||[]).filter(x=>String(rowBatch(x))===String(id)).map(x=>x.id);await resetHistoryRows(ids);return;}
    const wholeBatch=e.target?.closest?.('[data-v318-revert-whole-batch]');if(wholeBatch){
      e.preventDefault();e.stopPropagation();const id=wholeBatch.getAttribute('data-v318-revert-whole-batch');busy(true,'กำลังค้นหารายการทั้ง Batch');
      try{let res=await db().from('ot_requests').select('id').eq('export_batch_id',id);if(res.error)throw res.error;if(!(res.data||[]).length){res=await db().from('ot_requests').select('id').eq('batch_id',id);if(res.error)throw res.error;}busy(false);await resetHistoryRows((res.data||[]).map(x=>x.id));}
      catch(err){busy(false);toast(`ค้นหา Batch ไม่สำเร็จ: ${err?.message||err}`,'error');}
    }
  },true);

  document.addEventListener('change',async e=>{
    const id=e.target?.id||'';
    if(id==='hrHistoryStaffV318'||id==='hrHistoryYearV318'||id==='hrHistoryMonthNoV318'){
      if(id==='hrHistoryStaffV318')st().hrHistoryStaffV318=String(e.target.value||'');
      if(id==='hrHistoryYearV318')st().hrHistoryYearV318=String(e.target.value||'');
      if(id==='hrHistoryMonthNoV318')st().hrHistoryMonthNoV318=String(e.target.value||'');
      st().hrHistoryRowsV318=[];try{renderPage();}catch(_){ }
      if(st().hrHistoryStaffV318&&selectedHistoryMonth())await loadHistory(false);return;
    }
    if(id==='otMoneyMonthV241'||id==='otSourceMonthV241'){const value=monthKey(e.target.value);st().otMoneyMonthV241=value;st().otSourceMonthV241=value;try{await window.cnmiV316?.loadPageData?.('ot',{force:false});renderPage();}catch(_){ }}
  },true);

  window.cnmiV318={version:VERSION,exportHr:exportV318,loadHistory,clearHistoryCache(){historyCache.clear();},clearCarryCache:clearCarryLocal,allocate,buildTotals,buildCarryMeta,parseCarryMeta};
  console.info(`[${VERSION}] loaded`);
})();
