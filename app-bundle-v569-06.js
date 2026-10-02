
/* Original source: patch-v348-ot-trade-rate-tabs-popup.js */
try {
/* CNMI Staff Planner V356
   - Makes purchased-duty OT auditable: seller, date, duty, sold rate, money and HR-hour formula.
   - Uses the saved trade amount as the source of truth for cross-rate HR normalization.
   - Staff gets two nearby tabs instead of a long claim-details card at the bottom.
   - Admin detail modal is wide on desktop and card-based on mobile.
   - Trade rows are loaded only for roster assignments in the selected OT month.
   - Weekend donor-helper OT uses the signed slot rate: phlebotomist = MT, Clerk = clerk.
   - Tang signing the MT donor-helper slot is paid as MT, the same exception as Tang's ช4 duty.
*/
(function(){
  'use strict';
  const VERSION = 'V356_DONOR_HELPER_SLOT_RATE_AUTHORITATIVE';
  const HELPER_REASON_RE = /มาช่วย\s*งาน\s*เสาร์\s*[–—-]?\s*อาทิตย์|มาช่วย.*เสาร์.*อาทิตย์|ช่วยห้องบริจาคโลหิต|donor\s*helper/i;
  const HELPER_MARKER_RE = /\[DONOR_HELPER_SLOT=(clerk|phlebotomist):(\d+)\]/i;
  if (window.__CNMI_V356_DONOR_HELPER_SLOT_RATE_AUTHORITATIVE__) return;
  window.__CNMI_V356_DONOR_HELPER_SLOT_RATE_AUTHORITATIVE__ = true;

  const tradeLoads = new Map();
  const helperLoads = new Map();
  const helperRowsByMonth = new Map();
  const refreshedTradeScopes = new Set();
  let staffInnerTab = 'list';
  let lastAdminStaffId = '';
  let refreshQueued = false;
  let arranging = false;

  function S(){ try { return state; } catch (_) { return window.state || {}; } }
  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n) ? Math.round(n*100)/100 : 0; }
  function hours(v){ const n=round2(v); return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,''); }
  function baht(v){
    const n=round2(v);
    return `${n.toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2})} บ.`;
  }
  function normDate(v){ try { return normalizeDateKey(v); } catch (_) { return String(v||'').slice(0,10); } }
  function fmtDate(v){ const d=normDate(v); if(!d)return '-'; try{return formatThaiDate(d);}catch(_){return d;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function staffRecord(id){ return (S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''))||null; }
  function normalizedPersonName(value){
    return String(value||'')
      .replace(/^\s*(?:นาย|นางสาว|นาง|น\.?\s*ส\.?|นส\.?|ดร\.?|พญ\.?|นพ\.?)\s*/i,'')
      .replace(/[()（）]/g,' ')
      .replace(/[.,/\\_-]+/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .toLocaleLowerCase('th-TH');
  }
  function compactPersonName(value){ return normalizedPersonName(value).replace(/\s+/g,''); }
  function legacyHelperMatchesStaff(item,staffId){
    if(item?.internal_staff_id)return false;
    const person=staffRecord(staffId)||{};
    const helperName=normalizedPersonName(item?.helper_name);
    if(!helperName)return false;
    const fullNames=[person.full_name,person.name,person.display_name]
      .map(normalizedPersonName).filter(Boolean);
    if(fullNames.includes(helperName))return true;
    if(fullNames.map(compactPersonName).includes(compactPersonName(helperName)))return true;
    const nickname=normalizedPersonName(person.nickname);
    return !!nickname&&helperName===nickname;
  }
  function staffName(id){
    try{return staffNick(id);}catch(_){const s=staffRecord(id)||{};return s.nickname||s.full_name||s.name||id||'-';}
  }
  function isTangStaff(id){
    const s=staffRecord(id)||{};
    return /(^|\s)แตง($|\s)/.test(`${s.nickname||''} ${s.full_name||''}`.trim())||String(s.nickname||'').trim()==='แตง';
  }
  function staffPillSafe(id){ try{return staffPill(id);}catch(_){return `<span class="staff-pill">${esc(staffName(id))}</span>`;} }
  function selectedMonth(){
    const raw=String(S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.myDutyMonthFilter||S()?.monthKey||'').slice(0,7);
    if(/^\d{4}-\d{2}$/.test(raw))return raw;
    const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function assignmentById(id){ return (S()?.rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null; }
  function assignmentCode(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function dutyLabel(code){ try{return DUTY_LABEL?.[code]||code||'-';}catch(_){return code||'-';} }
  function isHoliday(date){ try{return !!isHolidayDate(date);}catch(_){return false;} }
  function rateTypeFor(staffId,dutyCode){
    try{const t=dutyStaffTypeForRate(staffId,dutyCode);if(t)return t==='เคิก'?'เคิก':'MT';}catch(_){}
    const s=staffRecord(staffId)||{};
    if(isTangStaff(staffId)&&['ช3A','ช3B','ช4','ช4A','ช4B'].includes(String(dutyCode||'')))return 'MT';
    return String(s.staff_type||s.type||'').trim()==='เคิก'?'เคิก':'MT';
  }
  function normalRateFor(staffId,dutyCode){ return rateTypeFor(staffId,dutyCode)==='เคิก'?90:130; }
  function rateForType(type,date){ return type==='เคิก'?(isHoliday(date)?120:90):(isHoliday(date)?160:130); }
  function baseRateTypeFor(staffId){
    const s=staffRecord(staffId)||{};
    if(isTangStaff(staffId))return 'เคิก';
    return String(s.staff_type||s.type||'').trim()==='เคิก'?'เคิก':'MT';
  }
  function parsePayload(data){
    if(!data)return{};
    if(typeof data==='string'){try{return JSON.parse(data)||{};}catch(_){return{};}}
    return data;
  }
  function cachedHelperRows(month){ return helperRowsByMonth.get(String(month||'').slice(0,7))||[]; }
  async function ensureHelpers(month,options={}){
    const key=String(month||selectedMonth()).slice(0,7);
    if(!options.force&&helperRowsByMonth.has(key))return {loaded:true,count:(helperRowsByMonth.get(key)||[]).length,cached:true};
    if(options.force)helperLoads.delete(key);
    if(helperLoads.has(key))return helperLoads.get(key);
    let db=null;try{db=sb;}catch(_){db=window.sb||null;}
    if(!db?.rpc)return {loaded:false,reason:'no-db'};
    const task=(async()=>{
      const result=await db.rpc('get_donor_helper_month_internal_v327',{p_month:key});
      if(result?.error)throw result.error;
      const payload=parsePayload(result?.data);
      const rows=Array.isArray(payload?.rows)?payload.rows:[];
      helperRowsByMonth.set(key,rows);
      return {loaded:true,count:rows.length,month:key};
    })().catch(error=>{
      console.warn(`[${VERSION}] donor-helper load`,error);
      helperLoads.delete(key);
      return {loaded:false,error};
    });
    helperLoads.set(key,task);
    return task;
  }
  function isHelperOtRow(row){
    return HELPER_REASON_RE.test(`${row?.reason||''} ${row?.note||''}`);
  }
  function helperMarker(row){
    const match=`${row?.device||''} ${row?.note||''}`.match(HELPER_MARKER_RE);
    if(!match)return null;
    return {slot_type:String(match[1]).toLowerCase(),slot_no:Number(match[2]||1),id:'saved-with-ot'};
  }
  function helperSignupForStaffDate(staffId,date){
    const sid=String(staffId||''),day=normDate(date),month=day.slice(0,7);
    if(!sid||!day)return null;
    const eligible=cachedHelperRows(month).filter(item=>{
      const status=String(item?.status||'confirmed');
      return normDate(item?.work_date)===day&&!['cancelled','no_show'].includes(status);
    });
    const exact=eligible.find(item=>String(item?.internal_staff_id||'')===sid);
    if(exact)return exact;
    const legacy=eligible.filter(item=>legacyHelperMatchesStaff(item,sid));
    return legacy.length===1?legacy[0]:null;
  }
  function helperSignupForOtRow(row){
    if(!isHelperOtRow(row))return null;
    return helperMarker(row)||helperSignupForStaffDate(row?.staff_id,row?.work_date);
  }
  function helperClaimInfo(row,base){
    const signup=helperSignupForOtRow(row);
    if(!signup)return null;
    const actual=round2(base?.actualHours||0);
    if(actual<=0)return null;
    const slotType=String(signup.slot_type||'').toLowerCase();
    const workType=slotType==='clerk'?'เคิก':'MT';
    const tangMtException=isTangStaff(row?.staff_id)&&slotType!=='clerk';
    // ช่องที่ลงชื่อเป็นแหล่งข้อมูลหลักทั้ง "กลุ่มเรท" และจำนวนชั่วโมงเบิก HR
    // Clerk = เคิก, คนเจาะ = MT โดยไม่แปลงกลับเป็นเรทประจำตัวของผู้มาช่วย
    const workRate=rateForType(workType,row?.work_date);
    const receiverType=workType;
    const receiverNormalRate=workRate;
    const claimHours=actual;
    const slotLabel=slotType==='clerk'?'Clerk':`MT / คนเจาะ ${Number(signup.slot_no||1)}`;
    return {signup,actualHours:actual,slotType,slotLabel,workType,workRate,receiverType,receiverNormalRate,claimHours,tangMtException,isHoliday:isHoliday(row?.work_date)};
  }
  function sellHours(trade,a){
    const marker=Number(String(trade?.note||'').match(/\[SELL_HOURS=(\d+(?:\.\d+)?)\]/i)?.[1]||0);
    if(Number.isFinite(marker)&&marker>0)return marker;
    try{const h=Number(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return h;}catch(_){}
    try{const h=Number(dutyHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return h;}catch(_){}
    return 0;
  }
  function cleanTradeNote(note){
    return String(note||'').replace(/\s*\[SELL_PART=[a-z_]+\]\s*/ig,' ').replace(/\s*\[SELL_HOURS=\d+(?:\.\d+)?\]\s*/ig,' ').replace(/\s*\[SELL_SEGMENTS=[^\]]+\]\s*/ig,' ').replace(/\s*\[SELL_START=\d{1,2}:\d{2}\]\s*/ig,' ').replace(/\s*\[SELL_END=\d{1,2}:\d{2}\]\s*/ig,' ').replace(/\s*\[SELL_DATE=[^\]]+\]\s*/ig,' ').replace(/\s*\[SELL_DUTY=[^\]]+\]\s*/ig,' ').replace(/\s{2,}/g,' ').trim();
  }
  function soldRateType(trade,a){
    const mode=String(trade?.rate_mode||'receiver');
    if(mode==='mt')return 'MT';
    if(mode==='kerk')return 'เคิก';
    if(mode==='owner')return rateTypeFor(trade?.requester_id,assignmentCode(a));
    if(mode==='receiver')return rateTypeFor(trade?.receiver_id,assignmentCode(a));
    return 'กำหนดเอง';
  }

  function completedTrades(){ return (S()?.tradeRequests||[]).filter(t=>String(t?.status||'')==='completed'&&t?.from_assignment_id&&t?.receiver_id); }
  function tradeForOtRow(row,base){
    const sid=String(row?.staff_id||'');
    const date=normDate(row?.work_date);
    if(!sid||!date)return null;
    const actual=Number(base?.actualHours||0);
    const explicit=String(row?.duty_code||row?.shift_type||row?.shift_code||row?.ot_type||'').trim();
    const text=`${row?.reason||''} ${row?.note||''}`;
    let best=null,bestScore=-1;
    completedTrades().forEach(trade=>{
      if(String(trade.receiver_id)!==sid)return;
      const a=assignmentById(trade.from_assignment_id);
      if(!a||normDate(a.duty_date)!==date)return;
      const code=assignmentCode(a),sold=sellHours(trade,a);
      let score=1;
      if(String(row?.assignment_id||row?.roster_assignment_id||'')===String(a.id))score+=100;
      if(explicit&&explicit===code)score+=20;
      if(code&&text.includes(code))score+=12;
      if(actual>0&&sold>0&&Math.abs(actual-sold)<=0.11)score+=10;
      if(/ยืนยันอยู่เวรตามตาราง|ยืนยันอยู่เวร/.test(text))score+=4;
      if(score>bestScore){bestScore=score;best={trade,assignment:a,soldHours:sold};}
    });
    return bestScore>=5?best:null;
  }

  function tradeClaimInfo(row,base){
    const found=tradeForOtRow(row,base);
    if(!found)return null;
    const {trade,assignment}=found;
    const actual=round2(base?.actualHours||found.soldHours||0);
    const soldHoursValue=round2(found.soldHours||actual);
    const receiverType=rateTypeFor(trade.receiver_id,assignmentCode(assignment));
    const receiverNormalRate=normalRateFor(trade.receiver_id,assignmentCode(assignment));
    const mode=String(trade.rate_mode||'receiver');
    const paidType=soldRateType(trade,assignment);
    // V580: saved amount_from is audit history only for normal MT/Clerk/owner/receiver trades.
    // Recalculate from the actual purchased hours and the rate that applies on the duty date.
    // Only an explicit custom-price trade may keep the saved amount as authoritative.
    let amount=0;
    let paidRate=0;
    if(mode==='custom'){
      amount=round2(Math.max(0,Number(trade.amount_from)||0));
      paidRate=soldHoursValue>0?round2(amount/soldHoursValue):0;
    }else{
      paidRate=paidType==='กำหนดเอง'?0:rateForType(paidType,assignment.duty_date);
      amount=round2(Math.max(0,soldHoursValue*paidRate));
    }
    const claimHours=receiverNormalRate>0?round2(amount/receiverNormalRate):0;
    return {
      trade,assignment,actualHours:actual,soldHours:soldHoursValue,amount,paidRate,paidType,
      receiverType,receiverNormalRate,claimHours,mode,note:cleanTradeNote(trade.note)
    };
  }

  const normalizeApi=window.v190HrRateNormalization;
  const originalBreakdown=normalizeApi?.otNormalizationBreakdown190;
  function breakdown(row){
    let base;
    try{base=originalBreakdown?originalBreakdown(row):null;}catch(_){}
    if(!base){
      let actual=0;try{actual=Number(calcOtHours(row)||0);}catch(_){actual=Number(row?.manual_hours||row?.hours||0);}
      base={actualHours:round2(actual),hrHours:round2(actual),segments:[],shiftType:row?.duty_code||'-',rateType:rateTypeFor(row?.staff_id,row?.duty_code),isHoliday:isHoliday(row?.work_date)};
    }
    const info=tradeClaimInfo(row,base);
    if(info)return {...base,hrHours:info.claimHours,rateType:info.receiverType,tradeInfo:info,isTradeRate:true};
    const helper=helperClaimInfo(row,base);
    if(!helper)return base;
    const segment={
      actualHours:helper.actualHours,hrHours:helper.claimHours,
      rateType:helper.receiverType,sourceRateType:helper.workType,
      normalRate:helper.receiverNormalRate,appliedRate:helper.workRate,workRate:helper.workRate,
      shiftType:`มาช่วยเสาร์–อาทิตย์ • ${helper.slotLabel}`,isHoliday:helper.isHoliday,
      multiplier:helper.receiverNormalRate?round2(helper.workRate/helper.receiverNormalRate):1,
      helperInfo:helper
    };
    return {...base,actualHours:helper.actualHours,hrHours:helper.claimHours,segments:[segment],shiftType:segment.shiftType,rateType:helper.receiverType,isHoliday:helper.isHoliday,helperInfo:helper,isDonorHelperRate:true};
  }
  if(normalizeApi&&originalBreakdown)normalizeApi.otNormalizationBreakdown190=breakdown;

  function mergeTrades(rows){
    const map=new Map((S()?.tradeRequests||[]).map(x=>[String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}`),x]));
    (rows||[]).forEach(x=>map.set(String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}`),x));
    S().tradeRequests=Array.from(map.values());
  }
  async function ensureTrades(month,staffId){
    const scope=admin()?'admin':String(staffId||currentSid());
    const key=`${month}|${scope}`;
    if(tradeLoads.has(key))return tradeLoads.get(key);
    const assignments=(S()?.rosterAssignments||[]).filter(a=>normDate(a?.duty_date).startsWith(month)&&a?.id);
    if(!assignments.length)return {loaded:false,reason:'no-roster'};
    let db=null;try{db=sb;}catch(_){db=window.sb||null;}
    if(!db?.from)return {loaded:false,reason:'no-db'};
    const task=(async()=>{
      const rows=[];
      const ids=assignments.map(a=>a.id);
      for(let i=0;i<ids.length;i+=50){
        let q=db.from('roster_trade_requests').select('*').in('from_assignment_id',ids.slice(i,i+50)).eq('status','completed');
        if(!admin()&&scope)q=q.eq('receiver_id',scope);
        const res=await q;
        if(res?.error)throw res.error;
        rows.push(...(res?.data||[]));
      }
      mergeTrades(rows);
      return {loaded:true,count:rows.length};
    })().catch(error=>{console.warn(`[${VERSION}] trade load`,error);tradeLoads.delete(key);return {loaded:false,error};});
    tradeLoads.set(key,task);
    return task;
  }

  function tradeExplain(info){
    if(!info)return '<span class="badge blue">OT ปกติ / OT เพิ่ม</span>';
    const a=info.assignment||{},t=info.trade||{};
    const rateText=info.paidType==='กำหนดเอง'?`กำหนดเอง ${baht(info.amount)}`:`${info.paidType} ${hours(info.paidRate)} บ./ชม.`;
    const formula=info.amount===0
      ? 'รายการนี้บันทึกมูลค่า 0 บาท จึงไม่นำชั่วโมงจากการซื้อเวรนี้ไปเบิก HR'
      : `${baht(info.amount)} ÷ เรทเบิกประจำของผู้รับ ${info.receiverType} ${hours(info.receiverNormalRate)} บ./ชม. = ${hours(info.claimHours)} ชม.`;
    return `<div class="v348-trade-box">
      <div class="v348-trade-head"><span class="badge purple">OT จากการซื้อเวร</span><b>ซื้อจาก ${staffPillSafe(t.requester_id)}</b></div>
      <div class="v348-trade-grid"><span><small>วันที่ / เวร</small><b>${esc(fmtDate(a.duty_date))} • ${esc(dutyLabel(assignmentCode(a)))}</b></span><span><small>ช่วงที่ซื้อ</small><b>${hours(info.soldHours)} ชม.</b></span><span><small>เรทที่ซื้อ</small><b>${esc(rateText)}</b></span><span><small>มูลค่าที่บันทึก</small><b>${esc(baht(info.amount))}</b></span></div>
      <div class="v348-formula"><b>วิธีแปลงเป็นชั่วโมงเบิก HR:</b> ${esc(formula)}</div>
      ${info.note?`<div class="muted">หมายเหตุการซื้อขาย: ${esc(info.note)}</div>`:''}
    </div>`;
  }
  function helperExplain(info){
    if(!info)return '';
    const holiday=info.isHoliday?'วันนักขัตฤกษ์':'วันปกติ';
    const formula=`${hours(info.actualHours)} ชม. × เรท${info.workType} ${hours(info.workRate)} บ./ชม. = ${baht(info.actualHours*info.workRate)} • เบิก HR ${hours(info.claimHours)} ชม. ที่เรท${info.workType}`;
    return `<div class="v350-helper-box">
      <div class="v350-helper-head"><span class="badge blue">OT มาช่วยเสาร์–อาทิตย์</span><b>คิดเรทตามช่องที่ลงชื่อ</b>${info.tangMtException?'<span class="badge green">แตงลงช่อง MT = เรท MT เช่นเดียวกับ ช4</span>':''}</div>
      <div class="v350-helper-grid"><span><small>ตำแหน่งที่ลงชื่อ</small><b>${esc(info.slotLabel)}</b></span><span><small>เรทของช่อง (${esc(holiday)})</small><b>${esc(info.workType)} ${hours(info.workRate)} บ./ชม.</b></span><span><small>กลุ่มเรทที่ส่ง HR</small><b>${esc(info.receiverType)} ${hours(info.receiverNormalRate)} บ./ชม.</b></span><span><small>ชั่วโมงจริง / เบิก HR</small><b>${hours(info.actualHours)} / ${hours(info.claimHours)} ชม.</b></span></div>
      <div class="v350-helper-formula"><b>วิธีคำนวณ:</b> ${esc(formula)}</div>
    </div>`;
  }
  function claimStatus(row){
    const s=String(row?.claim_status||'').toLowerCase();
    return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s)?'<span class="badge green">Exported</span>':'<span class="badge orange">Pending</span>';
  }
  function timeText(row){
    const start=String(row?.start_time||'').slice(0,5),end=String(row?.end_time||'').slice(0,5);
    const endDate=normDate(row?.end_date),date=normDate(row?.work_date);
    return `${start||'-'}–${end||'-'}${endDate&&endDate!==date?` (${fmtDate(endDate)})`:''}`;
  }
  function detailRows(rows){
    if(!rows.length)return '<div class="empty">ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้</div>';
    const body=rows.map(row=>{
      const n=breakdown(row),info=n.tradeInfo,helper=n.helperInfo;
      return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${esc(timeText(row))}</td><td><b>${esc(row.reason||'-')}</b>${row.note?`<br><span class="muted">${esc(row.note)}</span>`:''}${tradeExplain(info)}${helperExplain(helper)}</td><td><b>${hours(n.actualHours)}</b></td><td><b>${hours(n.hrHours)}</b>${info?'<br><span class="badge purple">แปลงตามเรทที่ซื้อ</span>':helper?'<br><span class="badge blue">แปลงตามเรทช่องที่ลงชื่อ</span>':''}</td><td>${claimStatus(row)}</td></tr>`;
    }).join('');
    const cards=rows.map(row=>{
      const n=breakdown(row),info=n.tradeInfo,helper=n.helperInfo;
      return `<article class="v348-ot-card"><div class="v348-card-head"><b>${esc(fmtDate(row.work_date))}</b>${claimStatus(row)}</div><div><b>${esc(row.reason||'-')}</b><div class="muted">${esc(timeText(row))}${row.note?` • ${esc(row.note)}`:''}</div></div>${tradeExplain(info)}${helperExplain(helper)}<div class="v348-hour-pair"><span>ชั่วโมงจริง <b>${hours(n.actualHours)}</b></span><span>ชั่วโมงเบิก HR <b>${hours(n.hrHours)}</b></span></div></article>`;
    }).join('');
    return `<div class="v348-detail-rows"><div class="table-wrap v348-desktop-detail"><table><thead><tr><th>วันที่ OT</th><th>เวลา</th><th>เหตุผล / ที่มา / สูตรเรท</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table></div><div class="v348-mobile-detail">${cards}</div></div>`;
  }

  function updateDetailRoot(root,sid,month){
    if(!root||!sid)return;
    const rows=window.cnmiV347?.approvedDetails?.(sid,month)||[];
    const old=root.querySelector('.v347-detail-table,.v348-detail-rows');
    if(old)old.outerHTML=detailRows(rows);
    if(root.classList.contains('v347-admin-detail')){
      const modal=document.getElementById('modal');
      modal?.classList.add('modal-lg','v348-ot-detail-modal');
      let note=root.querySelector('.v348-admin-note');
      if(!note){
        note=document.createElement('div');note.className='notice soft-notice compact v348-admin-note';
        note.innerHTML='<b>อ่านตามลำดับ:</b> ดูยอดรวมด้านบน แล้วตรวจแต่ละรายการด้านล่าง โดยรายการซื้อเวรจะแสดงผู้ขาย เรท มูลค่า และสูตรแปลงชั่วโมงครบ';
        root.querySelector('.v347-claim-equation')?.before(note);
      }
    }
    const slot=root.querySelector('.v347-summary-slot');
    if(slot&&window.cnmiV347?.summaryHtml){
      const api=window.cnmiV318;
      Promise.resolve(api?.queryCarryInSummary?.(month)).then(map=>{
        const carry=map instanceof Map?(map.get(String(sid))||{amount:0,sourceMonth:''}):{amount:0,sourceMonth:''};
        if(document.body.contains(root))slot.innerHTML=window.cnmiV347.summaryHtml(sid,rows,carry);
      }).catch(()=>{});
    }
  }

  async function refreshDetail(root,sid,month){
    updateDetailRoot(root,sid,month);
    const [trades,helpers]=await Promise.all([ensureTrades(month,sid),ensureHelpers(month)]);
    if((trades?.loaded||helpers?.loaded)&&document.body.contains(root))updateDetailRoot(root,sid,month);
  }
  function findMyListCard(){
    return Array.from(document.querySelectorAll('#pageContent .card')).find(card=>{
      const h=card.querySelector('h3');return h&&h.textContent.trim()==='รายการ OT ของฉัน'&&!card.classList.contains('v347-my-claim-card');
    })||null;
  }
  function applyStaffTab(){
    const list=document.querySelector('.v348-staff-list-card');
    const detail=document.querySelector('.v348-staff-detail-card');
    const tabs=document.querySelector('.v348-staff-tabs');
    if(!list||!detail||!tabs)return;
    const showDetail=staffInnerTab==='detail';
    list.classList.toggle('v348-hidden',showDetail);
    detail.classList.toggle('v348-hidden',!showDetail);
    tabs.querySelectorAll('[data-v348-staff-tab]').forEach(btn=>{
      const active=btn.dataset.v348StaffTab===staffInnerTab;
      btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false');
    });
  }
  function arrangeStaff(){
    if(arranging||admin())return;
    const detail=document.querySelector('#pageContent .v347-my-claim-card');
    const list=findMyListCard();
    if(!detail||!list)return;
    arranging=true;
    try{
      let tabs=document.querySelector('#pageContent .v348-staff-tabs');
      if(!tabs){
        tabs=document.createElement('div');tabs.className='v348-staff-tabs';tabs.setAttribute('role','tablist');
        tabs.innerHTML='<button type="button" class="active" role="tab" aria-selected="true" data-v348-staff-tab="list">รายการ OT ของฉัน</button><button type="button" role="tab" aria-selected="false" data-v348-staff-tab="detail">รายละเอียด OT ที่นำมาคำนวณเบิกของฉัน</button>';
        list.before(tabs);
      }
      list.classList.add('v348-staff-list-card');detail.classList.add('v348-staff-detail-card');
      if(tabs.nextElementSibling!==detail)tabs.after(detail);
      if(detail.nextElementSibling!==list)detail.after(list);
      applyStaffTab();
      refreshDetail(detail,currentSid(),String(detail.dataset.v347Month||selectedMonth()).slice(0,7));
    }finally{arranging=false;}
  }

  function queueFullRefresh(){
    if(refreshQueued)return;refreshQueued=true;
    setTimeout(async()=>{
      refreshQueued=false;
      if(String(S()?.page||'')!=='ot')return;
      const month=selectedMonth(),scope=admin()?'admin':currentSid(),key=`${month}|${scope}`;
      if(refreshedTradeScopes.has(key))return;
      // โหลดเฉพาะเดือนที่ผู้ใช้กำลังดูใหม่จากฐานข้อมูลจริงหนึ่งครั้ง
      // ไม่ใช้ payload ว่างเดิม และไม่ดึงเดือนก่อนหน้า/เดือนถัดไป
      const [trades,helpers]=await Promise.all([ensureTrades(month,currentSid()),ensureHelpers(month,{force:true})]);
      if((trades?.loaded||helpers?.loaded)&&typeof renderPage==='function'){
        refreshedTradeScopes.add(key);
        renderPage();
      }
    },80);
  }
  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(previousRenderOtPage){
    const wrapped=function renderOtPageV348(){const html=previousRenderOtPage.apply(this,arguments);queueFullRefresh();setTimeout(arrangeStaff,0);return html;};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  const previousSaveOtRequest=window.saveOtRequest||(typeof saveOtRequest==='function'?saveOtRequest:null);
  const saveOtRequestV355=async function(form){
    const fd=new FormData(form);
    const reason=String(fd.get('reason')||'').trim();
    if(!HELPER_REASON_RE.test(reason)||form?.dataset?.adminSimple==='1'){
      return typeof previousSaveOtRequest==='function'?previousSaveOtRequest(form):undefined;
    }
    const staffId=currentSid(),workDate=normDate(fd.get('work_date'));
    if(!staffId||!workDate)return showToast('กรุณาระบุวันที่มาช่วยงานให้ถูกต้อง',{tone:'error'});
    const loaded=await ensureHelpers(workDate.slice(0,7),{force:true});
    if(!loaded?.loaded)return showToast('โหลดข้อมูลช่องลงชื่อมาช่วยงานไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่',{tone:'error'});
    const signup=helperSignupForStaffDate(staffId,workDate);
    if(!signup){
      return showToast('ไม่พบชื่อของคุณในช่อง Clerk หรือคนเจาะของวันที่เลือก กรุณาลงชื่อหน้าคนมาช่วยห้องบริจาคโลหิตก่อน แล้วจึงขอ OT',{tone:'error'});
    }
    let pos={ok:true,lat:null,lng:null,accuracy:null};
    try{if(typeof getGps==='function')pos=await getGps();}catch(_){}
    if(pos&&!pos.ok)return typeof showGpsHelp==='function'?showGpsHelp(pos.message):showToast(pos.message||'บันทึกไม่ได้',{tone:'error'});
    const startTime=String(fd.get('start_time')||'').trim();
    const note=String(fd.get('note')||'').trim();
    const marker=`[DONOR_HELPER_SLOT=${String(signup.slot_type||'').toLowerCase()}:${Number(signup.slot_no||1)}]`;
    const payload={
      staff_id:staffId,work_date:workDate,start_time:startTime,end_time:fd.get('end_time'),reason,note,
      status:'รออนุมัติ',lat:pos?.lat??null,lng:pos?.lng??null,accuracy:pos?.accuracy??null,
      device:`${marker} | ${navigator.userAgent}`.slice(0,250)
    };
    let result=await sb.from('ot_requests').insert(payload);
    if(result.error&&/start_time|column|schema/i.test(result.error.message||'')){
      const fallback={...payload,note:`เวลาเริ่ม ${startTime}${note?' | '+note:''}`};
      delete fallback.start_time;
      result=await sb.from('ot_requests').insert(fallback);
    }
    if(result.error)return showToast(result.error.message||'บันทึกคำขอ OT ไม่สำเร็จ',{tone:'error'});
    await loadAllData();
    if(typeof renderPage==='function')renderPage();
    showToast(`ส่งคำขอ OT เพิ่มแล้ว • ระบบผูกกับช่อง ${signup.slot_type==='clerk'?'Clerk':`คนเจาะ ${Number(signup.slot_no||1)}`}`);
  };
  window.saveOtRequest=saveOtRequestV355;
  try{saveOtRequest=saveOtRequestV355;}catch(_){}

  document.addEventListener('click',e=>{
    const tab=e.target?.closest?.('[data-v348-staff-tab]');
    if(tab){staffInnerTab=tab.dataset.v348StaffTab==='detail'?'detail':'list';applyStaffTab();return;}
    const adminLink=e.target?.closest?.('.v241-real-month-section [data-v347-show-staff]');
    if(adminLink&&admin())lastAdminStaffId=String(adminLink.getAttribute('data-v347-show-staff')||'');
  },true);

  const observer=new MutationObserver(mutations=>{
    if(arranging)return;
    if(mutations.some(m=>Array.from(m.addedNodes||[]).some(n=>n.nodeType===1&&(n.matches?.('.v347-my-claim-card,.v347-admin-detail')||n.querySelector?.('.v347-my-claim-card,.v347-admin-detail'))))){
      setTimeout(()=>{
        arrangeStaff();
        const root=document.querySelector('#modalBody .v347-admin-detail');
        if(root&&lastAdminStaffId)refreshDetail(root,lastAdminStaffId,selectedMonth());
      },0);
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  const style=document.createElement('style');
  style.textContent=`
    .v348-staff-tabs{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 -4px;padding:8px;border:1px solid #dbe7f3;border-radius:16px;background:#f8fbff}
    .v348-staff-tabs button{border:1px solid #d5e4f2;border-radius:999px;background:#fff;color:#314b62;padding:10px 16px;font-weight:800;cursor:pointer}
    .v348-staff-tabs button.active{background:#75c5f4;border-color:#75c5f4;color:#17364e;box-shadow:0 5px 14px rgba(63,152,207,.2)}
    .v348-hidden{display:none!important}.v348-staff-detail-card,.v348-staff-list-card{grid-column:1/-1}
    .v348-trade-box{margin-top:8px;padding:10px;border:1px solid #dfd4f5;border-radius:12px;background:#faf7ff;display:grid;gap:8px;min-width:310px}
    .v348-trade-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.v348-trade-head .staff-pill{vertical-align:middle}
    .v348-trade-grid{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:6px}.v348-trade-grid span{display:grid;gap:2px;padding:7px 8px;border-radius:9px;background:#fff}.v348-trade-grid small{color:#6d7180}.v348-formula{padding:8px 10px;border-radius:9px;background:#f0e9ff;color:#4c3475;line-height:1.5}
    .v350-helper-box{margin-top:8px;padding:10px;border:1px solid #c9e3f4;border-radius:12px;background:#f4fbff;display:grid;gap:8px;min-width:310px}.v350-helper-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.v350-helper-grid{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:6px}.v350-helper-grid span{display:grid;gap:2px;padding:7px 8px;border-radius:9px;background:#fff}.v350-helper-grid small{color:#5e7488}.v350-helper-formula{padding:8px 10px;border-radius:9px;background:#e6f5ff;color:#245573;line-height:1.5}
    .v348-desktop-detail table{min-width:900px}.v348-desktop-detail th,.v348-desktop-detail td{vertical-align:top}.v348-desktop-detail th:nth-child(3){min-width:390px}
    .v348-mobile-detail{display:none}.v348-ot-card{border:1px solid #dbe7f3;border-radius:16px;padding:12px;background:#fff;display:grid;gap:10px}.v348-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.v348-hour-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v348-hour-pair span{padding:9px;border-radius:10px;background:#f3f8fc;display:flex;justify-content:space-between;gap:8px}
    .v348-ot-detail-modal .modal-card{width:min(1180px,calc(100vw - 32px))!important;max-height:92vh!important}.v348-admin-detail{min-width:0!important}.v348-admin-detail>.section-title{padding-right:46px}.v348-admin-note{margin:8px 0 12px}
    @media(max-width:900px){
      .v348-desktop-detail{display:none}.v348-mobile-detail{display:grid;gap:10px}.v348-trade-box,.v350-helper-box{min-width:0}.v348-trade-grid,.v350-helper-grid{grid-template-columns:1fr 1fr}.v348-ot-detail-modal .modal-card{width:min(96vw,100%)!important;padding:16px!important}.v347-claim-equation{grid-template-columns:1fr 1fr!important}.v347-claim-equation .money{grid-column:1/-1}
    }
    @media(max-width:560px){.v348-staff-tabs{display:grid;grid-template-columns:1fr}.v348-staff-tabs button{white-space:normal}.v348-trade-grid,.v350-helper-grid,.v348-hour-pair{grid-template-columns:1fr}.v347-claim-equation{grid-template-columns:1fr!important}.v347-claim-equation .money{grid-column:auto}.v348-trade-box,.v350-helper-box{font-size:13px}}
  `;
  document.head.appendChild(style);

  window.cnmiV348={version:VERSION,breakdown,tradeForOtRow,tradeClaimInfo,helperSignupForOtRow,helperSignupForStaffDate,helperClaimInfo,ensureTrades,ensureHelpers,detailRows,arrangeStaff};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v348-ot-trade-rate-tabs-popup.js", error); }
;

/* Original source: patch-v357-extra-ot-explicit-rate-form.js */
try {
/* V357: explicit rate selector for Staff/Admin extra OT forms */
(function(){
  'use strict';
  if(window.__CNMI_V357_EXTRA_OT_RATE_FORM__) return;
  window.__CNMI_V357_EXTRA_OT_RATE_FORM__=true;
  const RATE_RE=/\[OT_RATE_TYPE=(MT|CLERK)\]/i;
  const esc=v=>{try{return escapeHtml(String(v??''));}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}};
  const today=()=>{try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}};
  const admin=()=>{try{return !!isAdmin();}catch(_){return false;}};
  const holiday=date=>{try{return !!isHolidayDate(date);}catch(_){return false;}};
  function rateOptions(selected='MT'){
    return `<option value="MT" ${selected==='MT'?'selected':''}>MT (130 บาท / นักขัตฤกษ์ 160 บาท)</option><option value="CLERK" ${selected==='CLERK'?'selected':''}>Clerk/เคิก (90 บาท / นักขัตฤกษ์ 120 บาท)</option>`;
  }
  function reasonOptions(){
    let rows=[];try{rows=window.OT_REASONS||(typeof OT_REASONS!=='undefined'?OT_REASONS:[]);}catch(_){}
    if(!Array.isArray(rows)||!rows.length)rows=['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','มาช่วยงานเสาร์-อาทิตย์','อื่นๆ'];
    return rows.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  function staffOptions(){
    const current=(()=>{try{return currentStaffId();}catch(_){return '';}})();
    try{
      const rows=(state.staff||[]).filter(s=>s.active!==false&&s.is_active!==false);
      return `<option value="">เลือกชื่อ</option>`+rows.map(s=>`<option value="${esc(s.id)}" ${String(s.id)===String(current)?'selected':''}>${esc(s.nickname||s.full_name||s.email||s.id)}</option>`).join('');
    }catch(_){return '<option value="">เลือกชื่อ</option>';}
  }
  function formHtml(isAdmin){
    if(isAdmin)return `<form id="otForm" class="form-grid v181-admin-ot-extra-form v357-extra-ot-form" data-admin-simple="1">
      <label>เลือกชื่อเจ้าหน้าที่ <select name="staff_id" required>${staffOptions()}</select></label>
      <label>วันที่ <input name="work_date" type="date" value="${esc(today())}" required></label>
      <label>เหตุผล <select name="reason" required>${reasonOptions()}</select></label>
      <label>ชั่วโมงที่ต้องการเบิก <input name="requested_hours" type="number" min="0.5" max="240" step="0.5" placeholder="เช่น 2 / 8 / 16" required></label>
      <label>เรทที่จะเบิก <select name="rate_type" required>${rateOptions()}</select></label>
      <label>รายละเอียด <input name="note" placeholder="ระบุรายละเอียดเพิ่มเติม"></label>
      <button class="primary-btn wide" type="submit">ยืนยันขอ OT เพิ่ม</button>
    </form>`;
    return `<form id="otForm" class="form-grid v357-extra-ot-form">
      <label>วันที่ <input name="work_date" type="date" value="${esc(today())}" required></label>
      <label>เหตุผล <select name="reason" required>${reasonOptions()}</select></label>
      <label>เริ่มเวลา <input name="start_time" type="time" value="16:00" required></label>
      <label>ถึงเวลา <input name="end_time" type="time" required></label>
      <label>เรทที่จะเบิก <select name="rate_type" required>${rateOptions()}</select></label>
      <label>รายละเอียด <input name="note" placeholder="เช่น อยู่แทน ช4 / ปั่นเลือดถึงเวลา..."></label>
      <button class="primary-btn wide" type="submit">ส่งให้ Admin อนุมัติ</button>
    </form>`;
  }
  function enhance(html){
    if(!html||!String(html).includes('ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด'))return html;
    const doc=document.createElement('template');doc.innerHTML=String(html);
    const forms=Array.from(doc.content.querySelectorAll('#otForm')).filter(f=>f.closest('.card')?.textContent?.includes('ส่วนที่ 2 ขอ OT เพิ่ม'));
    forms.forEach(f=>f.replaceWith(document.createRange().createContextualFragment(formHtml(admin()))));
    return doc.innerHTML;
  }
  const prevRender=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof prevRender==='function'){
    const wrapped=function(){return enhance(prevRender.apply(this,arguments));};
    window.renderOtPage=wrapped;try{renderOtPage=wrapped;}catch(_){}
  }
  const prevSave=window.saveOtRequest||(typeof saveOtRequest==='function'?saveOtRequest:null);
  if(typeof prevSave==='function'){
    const wrappedSave=async function(form){
      if(!form?.classList?.contains('v357-extra-ot-form'))return prevSave(form);
      const rate=String(new FormData(form).get('rate_type')||'MT').toUpperCase()==='CLERK'?'CLERK':'MT';
      const note=form.querySelector('[name="note"]');
      if(note){const clean=String(note.value||'').replace(RATE_RE,'').trim();note.value=`[OT_RATE_TYPE=${rate}]${clean?' | '+clean:''}`;}
      return prevSave(form);
    };
    window.saveOtRequest=wrappedSave;try{saveOtRequest=wrappedSave;}catch(_){}
  }
  const api=window.v190HrRateNormalization,prevBreakdown=api?.otNormalizationBreakdown190;
  if(api&&typeof prevBreakdown==='function')api.otNormalizationBreakdown190=function(row){
    const base=prevBreakdown(row);const raw=`${row?.note||''} ${row?.device||''}`;const m=raw.match(RATE_RE);
    if(!m)return base;
    const type=m[1].toUpperCase()==='CLERK'?'เคิก':'MT';
    const appliedRate=type==='เคิก'?(holiday(row?.work_date)?120:90):(holiday(row?.work_date)?160:130);
    const helperInfo=base?.helperInfo?{...base.helperInfo,receiverType:type,workType:type,receiverNormalRate:type==='เคิก'?90:130,workRate:appliedRate,appliedRate}:base?.helperInfo;
    return {...base,rateType:type,helperInfo,segments:(base?.segments||[]).map(s=>({...s,rateType:type,sourceRateType:type,normalRate:type==='เคิก'?90:130,appliedRate,workRate:appliedRate,helperInfo:helperInfo||s.helperInfo})),isExplicitRateV357:true};
  };
  const style=document.createElement('style');style.textContent='.v357-extra-ot-form label{min-width:0}.v357-extra-ot-form select,.v357-extra-ot-form input{width:100%}';document.head.appendChild(style);
})();

} catch (error) { console.error("[v569] patch-v357-extra-ot-explicit-rate-form.js", error); }
;

/* Original source: patch-v359-carry-source-mobile-staff.js */
try {
/* CNMI Staff Planner V359 — authoritative previous-month carry + compact Staff mobile OT */
(function(){
  'use strict';
  if(window.__CNMI_V359_CARRY_SOURCE_MOBILE_STAFF__)return;
  window.__CNMI_V359_CARRY_SOURCE_MOBILE_STAFF__=true;
  const style=document.createElement('style');
  style.textContent=`
    @media(max-width:560px){
      .v347-my-claim-card{padding:14px 12px!important;border-radius:16px!important}
      .v347-my-claim-card .section-title{margin-bottom:6px!important}
      .v347-my-claim-card .section-title h3{font-size:18px!important;line-height:1.35!important;margin:0!important}
      .v347-my-claim-card .section-title .hint{display:none!important}
      .v347-my-claim-card .v347-claim-equation{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 12px!important}
      .v347-my-claim-card .v347-claim-equation>div{min-width:0!important;padding:10px!important;border-radius:10px!important;gap:2px!important}
      .v347-my-claim-card .v347-claim-equation span{font-size:11px!important;line-height:1.3!important}
      .v347-my-claim-card .v347-claim-equation b{font-size:18px!important;line-height:1.25!important}
      .v347-my-claim-card .v347-claim-equation .money{grid-column:1/-1!important}
      .v347-my-claim-card .v347-claim-equation .money small{font-size:11px!important;line-height:1.35!important}
      .v347-my-claim-card .v348-mobile-detail{gap:8px!important}
      .v347-my-claim-card .v348-mobile-detail>div{padding:10px!important;border-radius:10px!important}
      .v348-staff-tabs{grid-template-columns:1fr 1fr!important;gap:6px!important}
      .v348-staff-tabs button{padding:9px 7px!important;font-size:12px!important;line-height:1.25!important}
    }`;
  document.head.appendChild(style);
})();

} catch (error) { console.error("[v569] patch-v359-carry-source-mobile-staff.js", error); }
;

/* Original source: patch-v360-carry-rate-mobile-summary-fix.js */
try {
/* CNMI Staff Planner V360 — one rate calculation for monthly carry + readable Staff mobile summary */
(function(){
  'use strict';
  if(window.__CNMI_V360_CARRY_RATE_MOBILE_SUMMARY__)return;
  window.__CNMI_V360_CARRY_RATE_MOBILE_SUMMARY__=true;

  const RATE_RE=/\[OT_RATE_TYPE=(MT|CLERK)\]/i;
  const round2=v=>Math.round((Number(v)||0)*100)/100;
  const isAdminSafe=()=>{try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}};
  const isHoliday=date=>{try{return !!isHolidayDate(date);}catch(_){return false;}};
  function employeeBaseRate(staffId){
    try{
      const s=(state.staff||[]).find(x=>String(x.id)===String(staffId))||{};
      return /เคิก|clerk/i.test(String(s.staff_type||s.type||''))?90:130;
    }catch(_){return 130;}
  }

  /* V357 changed the displayed rate but retained the earlier hrHours value.
     Rebuild hrHours from actual hours × selected work rate ÷ employee HR base,
     so the selected month and the following month's carry use one equation. */
  const api=window.v190HrRateNormalization;
  const previous=api?.otNormalizationBreakdown190;
  if(api&&typeof previous==='function'&&!previous.__v360ExactRate){
    const exact=function(row){
      const n=previous.call(this,row)||{};
      const raw=`${row?.note||''} ${row?.device||''}`;
      const match=raw.match(RATE_RE);
      if(!match)return n;
      const workType=match[1].toUpperCase()==='CLERK'?'เคิก':'MT';
      const workRate=workType==='เคิก'?(isHoliday(row?.work_date)?120:90):(isHoliday(row?.work_date)?160:130);
      const hrBase=employeeBaseRate(row?.staff_id);
      const actual=round2(n.actualHours??row?.manual_hours??row?.requested_hours??row?.hours??0);
      const hrHours=round2(actual*workRate/hrBase);
      const segment={actualHours:actual,hrHours,rateType:workType,sourceRateType:workType,normalRate:workType==='เคิก'?90:130,appliedRate:workRate,workRate,isHoliday:isHoliday(row?.work_date),shiftType:n.shiftType||'-'};
      return {...n,actualHours:actual,hrHours,hrBaseRate:hrBase,rateType:workType,segments:[segment],isExplicitRateV357:true,isExactRateV360:true};
    };
    exact.__v360ExactRate=true;
    api.otNormalizationBreakdown190=exact;
  }

  function markView(){
    document.body.classList.toggle('v360-staff-ot-view',!isAdminSafe());
  }
  const priorRender=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof priorRender==='function'){
    const wrapped=function(){const html=priorRender.apply(this,arguments);setTimeout(markView,0);return html;};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }
  document.addEventListener('change',e=>{if(e.target?.id==='otMoneyMonthV241')setTimeout(()=>{markView();window.cnmiV318?.clearCarryCache?.();window.cnmiV346?.hydrate?.();},30);},true);
  markView();

  const style=document.createElement('style');
  style.textContent=`
    @media(max-width:700px){
      body.v360-staff-ot-view .v241-money-cards{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}
      body.v360-staff-ot-view .v241-money-cards .mini-stat{min-width:0!important;padding:10px!important}
      body.v360-staff-ot-view .v241-money-cards .mini-stat:last-child{grid-column:1/-1!important}
      body.v360-staff-ot-view .v241-ot-summary-table{overflow:visible!important;border:0!important;background:transparent!important}
      body.v360-staff-ot-view .v241-ot-summary-table table{display:block!important;min-width:0!important;width:100%!important}
      body.v360-staff-ot-view .v241-ot-summary-table thead{display:none!important}
      body.v360-staff-ot-view .v241-ot-summary-table tbody{display:grid!important;gap:10px!important}
      body.v360-staff-ot-view .v241-ot-summary-table tr{display:grid!important;grid-template-columns:1fr 1fr!important;gap:0!important;border:1px solid #dbe5ef!important;border-radius:16px!important;overflow:hidden!important;background:#fff!important;box-shadow:0 5px 14px rgba(31,50,72,.05)!important}
      body.v360-staff-ot-view .v241-ot-summary-table td{display:block!important;min-width:0!important;padding:9px 10px!important;border:0!important;border-bottom:1px solid #edf2f7!important;font-size:14px!important;white-space:normal!important}
      body.v360-staff-ot-view .v241-ot-summary-table td:first-child{grid-column:1/-1!important;background:#f7fafc!important;padding:11px!important}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(n+9){display:none!important}
      body.v360-staff-ot-view .v241-ot-summary-table td:before{display:block;color:#6b7b8c;font-size:10px;font-weight:700;line-height:1.25;margin-bottom:3px}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(2):before{content:'ชั่วโมงจริง'}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(3):before{content:'OT เดือนนี้เทียบ HR'}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(4):before{content:'คำนวณเป็นเงิน'}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(5):before{content:'OT ทบมาจากรอบก่อน'}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(6):before{content:'รวมพร้อมเบิก HR'}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(7):before{content:'เบิก HR รอบนี้'}
      body.v360-staff-ot-view .v241-ot-summary-table td:nth-child(8):before{content:'OT ทบไปรอบหน้า'}
      body.v360-staff-ot-view .v241-real-month-section>.section-title .hint{display:none!important}
      body.v360-staff-ot-view .v241-month-filter{gap:7px!important}
    }`;
  document.head.appendChild(style);
})();

} catch (error) { console.error("[v569] patch-v360-carry-rate-mobile-summary-fix.js", error); }
;

/* Original source: patch-v366-continuous-ot-carry.js */
try {
/* CNMI Staff Planner V366 — continuous OT carry for summary and HR export
   Formula for every month:
   carry-in + current HR-equivalent OT = available
   carry-out = available - whole 8-hour claim blocks

   Migration anchor: June 2026 starts with zero carry-in, matching the approved
   June screen.  Every later month is calculated forward from live OT rows, so
   stale V318 snapshot markers cannot overwrite the continuous result. */
(function(){
  'use strict';
  if(window.__CNMI_V366_CONTINUOUS_OT_CARRY__)return;
  window.__CNMI_V366_CONTINUOUS_OT_CARRY__=true;

  const VERSION='V366_CONTINUOUS_OT_CARRY';
  const ANCHOR_MONTH='2026-06';
  const cache=new Map();
  const round2=v=>{const n=Number(v||0);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:0;};
  const pad2=n=>String(n).padStart(2,'0');
  const monthKey=v=>/^\d{4}-\d{2}$/.test(String(v||'').slice(0,7))?String(v).slice(0,7):'';
  const previousMonth=v=>{const [y,m]=monthKey(v).split('-').map(Number),d=new Date(y,m-2,1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;};
  const nextMonth=v=>{const [y,m]=monthKey(v).split('-').map(Number),d=new Date(y,m,1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;};
  const endOfMonth=v=>{const [y,m]=monthKey(v).split('-').map(Number);return `${v}-${pad2(new Date(y,m,0).getDate())}`;};
  const approved=row=>['อนุมัติ','approved','approve'].includes(String(row?.status||'').trim().toLowerCase());
  const db=()=>{try{return sb;}catch(_){return window.sb||null;}};
  const staffList=()=>{try{return state?.staff||[];}catch(_){return window.state?.staff||[];}};
  const baseRate=staffId=>{
    const s=staffList().find(x=>String(x.id)===String(staffId))||{};
    return /เคิก|clerk/i.test(String(s.staff_type||s.type||''))?90:130;
  };
  const hrHours=row=>{
    try{
      const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if(n&&Number.isFinite(Number(n.hrHours)))return round2(n.hrHours);
    }catch(_){}
    let actual=0;
    try{actual=round2(calcOtHours(row)||0);}catch(_){actual=round2(row?.manual_hours||row?.requested_hours||row?.hours||0);}
    const explicit=String(row?.requested_rate_type||row?.rate_type||row?.ot_rate_type||'').toUpperCase();
    const holiday=!!row?.is_holiday;
    const workRate=explicit==='MT'?(holiday?160:130):explicit==='CLERK'?(holiday?120:90):baseRate(row?.staff_id);
    return round2(actual*workRate/baseRate(row?.staff_id));
  };
  const info=(amount,sourceMonth,rowId='')=>({amount:round2(amount),sourceMonth,source:'v366-continuous-live',anchorRowId:rowId});

  async function continuousCarry(targetMonth,force=false){
    const target=monthKey(targetMonth),client=db();
    if(!target||!client)throw new Error('ไม่พบเดือนหรือการเชื่อมต่อข้อมูล');
    if(target<=ANCHOR_MONTH)return new Map();
    if(!force&&cache.has(target))return new Map(cache.get(target));

    const last=previousMonth(target);
    const res=await client.from('ot_requests').select('*')
      .gte('work_date',`${ANCHOR_MONTH}-01`).lte('work_date',endOfMonth(last))
      .order('work_date',{ascending:true});
    if(res.error)throw res.error;

    const monthly=new Map();
    (res.data||[]).filter(approved).forEach(row=>{
      const month=monthKey(row.work_date),id=String(row.staff_id||'');
      if(!month||!id)return;
      if(!monthly.has(month))monthly.set(month,new Map());
      const people=monthly.get(month),entry=people.get(id)||{hours:0,rowId:String(row.id||'')};
      entry.hours=round2(entry.hours+hrHours(row));
      if(!entry.rowId)entry.rowId=String(row.id||'');
      people.set(id,entry);
    });

    let carry=new Map(),month=ANCHOR_MONTH;
    while(month<=last){
      const current=monthly.get(month)||new Map();
      const ids=new Set([...carry.keys(),...current.keys()]);
      const next=new Map();
      ids.forEach(id=>{
        const carryIn=Number(carry.get(id)?.amount||0),entry=current.get(id)||{hours:0,rowId:carry.get(id)?.anchorRowId||''};
        const available=round2(carryIn+Number(entry.hours||0));
        const claimed=Math.floor((available+1e-7)/8)*8;
        const amount=round2(Math.max(0,available-claimed));
        next.set(id,info(amount,month,entry.rowId||carry.get(id)?.anchorRowId||''));
      });
      carry=next;
      month=nextMonth(month);
    }
    cache.set(target,new Map(carry));
    return carry;
  }

  function install(){
    const api=window.cnmiV318;
    if(!api||typeof api.queryCarryInSummary!=='function'||typeof api.queryCarryIn!=='function')return false;
    if(api.queryCarryInSummary.__v366&&api.queryCarryIn.__v366)return true;
    const oldSummary=api.queryCarryInSummary.bind(api),oldExport=api.queryCarryIn.bind(api);
    const wrap=fallback=>{
      const fn=async function(month,force){
        try{return await continuousCarry(month,!!force);}
        catch(err){console.warn('[V366] continuous carry failed; using saved fallback',err);return fallback(month,force);}
      };
      fn.__v366=true;return fn;
    };
    api.queryCarryInSummary=wrap(oldSummary);
    api.queryCarryIn=wrap(oldExport);
    const oldClear=typeof api.clearCarryCache==='function'?api.clearCarryCache.bind(api):null;
    api.clearCarryCache=function(){cache.clear();if(oldClear)oldClear();};
    api.version=VERSION;
    window.dispatchEvent(new CustomEvent('cnmi:v366-ready'));
    return true;
  }
  if(!install()){
    let tries=0;const timer=setInterval(()=>{if(install()||++tries>=100)clearInterval(timer);},50);
  }
})();

} catch (error) { console.error("[v569] patch-v366-continuous-ot-carry.js", error); }
;

/* Original source: patch-v368-authoritative-continuous-ot-carry.js */
try {
/* CNMI Staff Planner V368 — authoritative continuous OT carry
   Fixes the hidden dependency between V318/V364 carry logic and V348 rate sources.

   Formula for every month:
   carry-in + current HR-equivalent OT = available
   carry-out = available - whole 8-hour claim blocks

   June 2026 is the migration anchor with zero carry-in. Historical roster,
   completed trades, public holidays, and legacy donor-helper signups are loaded
   before normalizing prior-month OT rows, so the next month's carry-in exactly
   matches the previous month's visible carry-out. */
(function(){
  'use strict';
  if(window.__CNMI_V368_AUTHORITATIVE_CONTINUOUS_OT_CARRY__)return;
  window.__CNMI_V368_AUTHORITATIVE_CONTINUOUS_OT_CARRY__=true;

  const VERSION='V368_AUTHORITATIVE_CONTINUOUS_OT_CARRY';
  const ANCHOR_MONTH='2026-06';
  const HELPER_REASON_RE=/มาช่วย\s*งาน\s*เสาร์\s*[–—-]?\s*อาทิตย์|มาช่วย.*เสาร์.*อาทิตย์|ช่วยห้องบริจาคโลหิต|donor\s*helper/i;
  const HELPER_MARKER_RE=/\[DONOR_HELPER_SLOT=(clerk|phlebotomist):(\d+)\]/i;
  const cache=new Map();

  const round2=v=>{const n=Number(v||0);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:0;};
  const pad2=n=>String(n).padStart(2,'0');
  const monthKey=v=>/^\d{4}-\d{2}$/.test(String(v||'').slice(0,7))?String(v).slice(0,7):'';
  const previousMonth=v=>{const [y,m]=monthKey(v).split('-').map(Number),d=new Date(y,m-2,1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;};
  const nextMonth=v=>{const [y,m]=monthKey(v).split('-').map(Number),d=new Date(y,m,1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;};
  const endOfMonth=v=>{const [y,m]=monthKey(v).split('-').map(Number);return `${v}-${pad2(new Date(y,m,0).getDate())}`;};
  const approved=row=>['อนุมัติ','อนุมัติแล้ว','approved','approve'].includes(String(row?.status||'').trim().toLowerCase());
  const db=()=>{try{return sb;}catch(_){return window.sb||null;}};
  const S=()=>{try{return state;}catch(_){return window.state||{};}};

  function mergeRows(current,incoming,keyFn){
    const map=new Map();
    (current||[]).forEach(x=>map.set(keyFn(x),x));
    (incoming||[]).forEach(x=>map.set(keyFn(x),x));
    return Array.from(map.values());
  }
  function installHistoricalState(roster,holidays,trades){
    const s=S();
    s.rosterAssignments=mergeRows(s.rosterAssignments,roster,x=>String(x?.id||`${x?.staff_id||''}|${x?.duty_date||''}|${x?.duty_code||''}`));
    s.holidays=mergeRows(s.holidays,holidays,x=>String(x?.holiday_date||x?.date||''));
    s.tradeRequests=mergeRows(s.tradeRequests,trades,x=>String(x?.id||`${x?.from_assignment_id||''}|${x?.receiver_id||''}`));
  }
  function needsLegacyHelper(row){
    const text=`${row?.reason||''} ${row?.note||''}`;
    if(!HELPER_REASON_RE.test(text))return false;
    return !HELPER_MARKER_RE.test(`${row?.device||''} ${row?.note||''}`);
  }
  async function loadCompletedTrades(client,rosterRows){
    const ids=(rosterRows||[]).map(x=>x?.id).filter(Boolean);
    if(!ids.length)return [];
    const rows=[];
    for(let i=0;i<ids.length;i+=50){
      const res=await client.from('roster_trade_requests').select('*').in('from_assignment_id',ids.slice(i,i+50)).eq('status','completed');
      if(res.error)throw res.error;
      rows.push(...(res.data||[]));
    }
    return rows;
  }
  async function loadLegacyHelpers(months,force){
    const api=window.cnmiV348;
    if(!api||typeof api.ensureHelpers!=='function')return;
    for(const month of months){
      const result=await api.ensureHelpers(month,{force:!!force});
      if(result?.loaded===false&&result?.error)throw result.error;
    }
  }
  async function loadSourcesAndOt(lastMonth,force){
    const client=db();
    if(!client)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const start=`${ANCHOR_MONTH}-01`,end=endOfMonth(lastMonth);
    const [otRes,rosterRes,holidayRes]=await Promise.all([
      client.from('ot_requests').select('*').gte('work_date',start).lte('work_date',end).order('work_date',{ascending:true}),
      client.from('roster_assignments').select('*').gte('duty_date',start).lte('duty_date',end).order('duty_date',{ascending:true}),
      client.from('public_holidays').select('*').gte('holiday_date',start).lte('holiday_date',end).order('holiday_date',{ascending:true})
    ]);
    if(otRes.error)throw otRes.error;
    if(rosterRes.error)throw rosterRes.error;
    if(holidayRes.error)throw holidayRes.error;

    const otRows=(otRes.data||[]).filter(approved);
    const rosterRows=rosterRes.data||[];
    const holidayRows=holidayRes.data||[];
    const tradeRows=await loadCompletedTrades(client,rosterRows);
    installHistoricalState(rosterRows,holidayRows,tradeRows);

    const helperMonths=Array.from(new Set(otRows.filter(needsLegacyHelper).map(row=>monthKey(row?.work_date)).filter(Boolean))).sort();
    await loadLegacyHelpers(helperMonths,force);
    return otRows;
  }
  function hrHours(row){
    try{
      const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
      if(n&&Number.isFinite(Number(n.hrHours)))return round2(n.hrHours);
    }catch(err){console.warn('[V368] normalize row failed',row?.id||'',err);}
    let actual=0;
    try{actual=round2(calcOtHours(row)||0);}catch(_){actual=round2(row?.manual_hours||row?.requested_hours||row?.hours||0);}
    return actual;
  }
  function calculateFromRows(rows,targetMonth){
    const target=monthKey(targetMonth);
    if(!target||target<=ANCHOR_MONTH)return new Map();
    const last=previousMonth(target),monthly=new Map();
    (rows||[]).forEach(row=>{
      const month=monthKey(row?.work_date),id=String(row?.staff_id||'');
      if(!month||!id||month<ANCHOR_MONTH||month>last)return;
      if(!monthly.has(month))monthly.set(month,new Map());
      const people=monthly.get(month),entry=people.get(id)||{hours:0,rowId:String(row?.id||'')};
      entry.hours=round2(entry.hours+hrHours(row));
      if(!entry.rowId)entry.rowId=String(row?.id||'');
      people.set(id,entry);
    });

    let carry=new Map(),month=ANCHOR_MONTH;
    while(month<=last){
      const current=monthly.get(month)||new Map();
      const ids=new Set([...carry.keys(),...current.keys()]);
      const next=new Map();
      ids.forEach(id=>{
        const carryIn=Number(carry.get(id)?.amount||0);
        const entry=current.get(id)||{hours:0,rowId:carry.get(id)?.anchorRowId||''};
        const available=round2(carryIn+Number(entry.hours||0));
        const claimed=Math.floor((available+1e-7)/8)*8;
        const amount=round2(Math.max(0,available-claimed));
        next.set(id,{amount,sourceMonth:month,source:'v368-authoritative-live',anchorRowId:entry.rowId||carry.get(id)?.anchorRowId||''});
      });
      carry=next;
      month=nextMonth(month);
    }
    return carry;
  }
  async function authoritativeCarry(targetMonth,force=false){
    const target=monthKey(targetMonth);
    if(!target)throw new Error('ไม่พบเดือนที่ต้องการคำนวณ');
    if(target<=ANCHOR_MONTH)return new Map();
    if(!force&&cache.has(target))return new Map(cache.get(target));
    const rows=await loadSourcesAndOt(previousMonth(target),force);
    const result=calculateFromRows(rows,target);
    cache.set(target,new Map(result));
    return result;
  }

  function refreshVisibleSummary(){
    setTimeout(()=>{
      try{window.cnmiV346?.hydrate?.();}catch(err){console.warn('[V368] summary refresh failed',err);}
    },0);
  }
  function install(){
    const api=window.cnmiV318;
    if(!api||typeof api.queryCarryInSummary!=='function'||typeof api.queryCarryIn!=='function')return false;
    if(api.queryCarryInSummary?.__v368&&api.queryCarryIn?.__v368)return true;

    const query=async function(month,force){return authoritativeCarry(month,!!force);};
    query.__v368=true;
    api.queryCarryInSummary=query;
    api.queryCarryIn=query;

    const priorClear=typeof api.clearCarryCache==='function'?api.clearCarryCache.bind(api):null;
    api.clearCarryCache=function(){cache.clear();if(priorClear)priorClear();};
    api.version=VERSION;
    window.cnmiV368={version:VERSION,query:authoritativeCarry,clear(){cache.clear();},_test:{calculateFromRows}};
    window.dispatchEvent(new CustomEvent('cnmi:v368-ready'));
    refreshVisibleSummary();
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{if(install()||++tries>=120)clearInterval(timer);},50);
  }
})();

} catch (error) { console.error("[v569] patch-v368-authoritative-continuous-ot-carry.js", error); }
;

/* Original source: patch-v369-ot-menu-inventory-app-launch.js */
try {
/* CNMI Staff Planner V369
   - Reorganizes OT / HR Export into role-specific, single-purpose menu buttons.
   - Adds one authoritative month selector at the top and removes repeated month selectors inside subtabs.
   - Adds an admin staff-detail tab that always starts with no staff selected.
   - Opens Inventory by direct same-window navigation so the operating system can hand the URL to an installed app when supported.
*/
(function(){
  'use strict';
  const VERSION = 'V369_OT_MENU_INVENTORY_APP_LAUNCH';
  if (window.__CNMI_V369_OT_MENU_INVENTORY_APP_LAUNCH__) return;
  window.__CNMI_V369_OT_MENU_INVENTORY_APP_LAUNCH__ = true;

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  let adminDetailToken = 0;
  let monthRenderTimer = 0;

  function S(){ try { return state; } catch (_) { return window.state || {}; } }
  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function admin(){ try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } }
  function currentMonth(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function selectedMonth(){
    const raw = S()?.otMenuMonthV369 || S()?.otSourceMonthV241 || S()?.otMoneyMonthV241 || S()?.myDutyMonthFilter || S()?.monthKey || currentMonth();
    return /^\d{4}-\d{2}$/.test(String(raw).slice(0,7)) ? String(raw).slice(0,7) : currentMonth();
  }
  function currentStaffIdSafe(){
    try { return String(currentStaffId() || ''); }
    catch (_) { return String(S()?.profile?.staff_id || S()?.profile?.id || ''); }
  }
  function activeStaff(){
    return (S()?.staff || [])
      .filter(person => person && person.is_active !== false && person.active !== false && !(window.cnmiPersonTypeV516?.isPhysician?.(person) ?? /^(แพทย์|physician|doctor)$/i.test(String(person.staff_type || person.role || '').trim())))
      .slice()
      .sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th'));
  }
  function staffName(person){ return String(person?.nickname || person?.full_name || person?.name || person?.email || '-'); }
  function fmtDate(v){
    try { return formatThaiDate(normalizeDateKey(v)); }
    catch (_) { return String(v || '').slice(0,10) || '-'; }
  }
  function fmtTime(row){
    const start = String(row?.start_time || '').slice(0,5) || '-';
    const end = String(row?.end_time || '').slice(0,5) || '-';
    const work = String(row?.work_date || '').slice(0,10);
    const endDate = String(row?.end_date || '').slice(0,10);
    return `${start}–${end}${endDate && endDate !== work ? ` (${fmtDate(endDate)})` : ''}`;
  }
  function detailRowsFallback(rows){
    if (!rows.length) return '<div class="empty">ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้</div>';
    const breakdown = row => {
      try {
        const value = window.v190HrRateNormalization?.otNormalizationBreakdown190?.(row);
        if (value) return value;
      } catch (_) {}
      let actual = 0;
      try { actual = Number(calcOtHours(row) || 0); }
      catch (_) { actual = Number(row?.manual_hours || row?.requested_hours || row?.hours || 0); }
      return { actualHours:actual, hrHours:actual };
    };
    const hours = v => {
      const n = Math.round(Number(v || 0) * 100) / 100;
      return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
    };
    return `<div class="table-wrap"><table><thead><tr><th>วันที่ OT</th><th>เวลา</th><th>เหตุผล / รายละเอียด</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th></tr></thead><tbody>${rows.map(row => {
      const n = breakdown(row);
      const exported = ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(String(row?.claim_status || '').toLowerCase());
      return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${esc(fmtTime(row))}</td><td><b>${esc(row.reason || '-')}</b>${row.note ? `<br><span class="muted">${esc(row.note)}</span>` : ''}</td><td>${hours(n.actualHours)}</td><td><b>${hours(n.hrHours)}</b></td><td><span class="badge ${exported ? 'green' : 'orange'}">${exported ? 'Exported' : 'Pending'}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  const ADMIN_ITEMS = [
    ['admin-duty', '1. ยืนยันวันอยู่เวรแทนเจ้าหน้าที่'],
    ['admin-extra', '2. ขอ OT เพิ่ม / เวรปั่นเลือดแทนเจ้าหน้าที่'],
    ['tracking', '3. ติดตามเจ้าหน้าที่'],
    ['approve', '4. อนุมัติ OT'],
    ['summary', '5. สรุป OT รายเดือน'],
    ['admin-details', '6. รายละเอียด OT ของเจ้าหน้าที่'],
    ['export', '7. Export HR'],
    ['history', '8. ประวัติ Export']
  ];
  const STAFF_ITEMS = [
    ['staff-track', '1. ติดตามเวรของฉัน'],
    ['staff-confirm', '2. ยืนยันวันอยู่เวรของฉัน / เลือกวันที่'],
    ['staff-extra', '3. ขอ OT เพิ่ม / เวรปั่นเลือด'],
    ['staff-list', '4. รายการ OT ของฉัน'],
    ['staff-details', '5. รายละเอียด OT ที่นำมาคำนวณเบิกของฉัน'],
    ['staff-summary', '6. สรุป OT รายเดือนของฉัน']
  ];

  function validItem(id, isAdmin){ return (isAdmin ? ADMIN_ITEMS : STAFF_ITEMS).some(item => item[0] === id); }
  function initialItem(isAdmin){
    const saved = String(S()?.otMenuV369 || '');
    if (validItem(saved, isAdmin)) return saved;
    const legacy = String(S()?.otSubtabV241 || 'mine');
    if (isAdmin) return ({tracking:'tracking', approve:'approve', summary:'summary', export:'export', history:'history'})[legacy] || 'admin-duty';
    return legacy === 'summary' ? 'staff-summary' : 'staff-track';
  }
  function legacyItem(id, isAdmin){
    if (isAdmin) {
      if (id === 'tracking' || id === 'approve' || id === 'summary' || id === 'export' || id === 'history') return id;
      if (id === 'admin-details') return 'summary';
      return 'mine';
    }
    return id === 'staff-summary' ? 'summary' : 'mine';
  }
  function setMonthState(month){
    const value = /^\d{4}-\d{2}$/.test(String(month || '').slice(0,7)) ? String(month).slice(0,7) : currentMonth();
    const st = S();
    st.otMenuMonthV369 = value;
    st.otMoneyMonthV241 = value;
    st.otSourceMonthV241 = value;
    st.otMoneyMonthV238 = value;
    st.hrExportMonthV238 = value;
    st.hrExportMonthV234 = value;
    st.myDutyMonthFilter = value;
    st.otAdminMonthFilterV234 = value;
    st.ch4MonthFilterV234 = value;
    st.hrHistoryYearV318 = value.slice(0,4);
    st.hrHistoryMonthNumberV318 = value.slice(5,7);
  }

  function template(html){
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    return tpl;
  }
  function outer(el){ return el ? el.outerHTML : ''; }
  function contentInner(html){
    const tpl = template(html);
    const content = tpl.content.querySelector('.v241-ot-content');
    return content ? content.innerHTML : String(html || '');
  }
  function cardByHeading(tpl, text){
    return Array.from(tpl.content.querySelectorAll('.card')).find(card => {
      const heading = card.querySelector('h2,h3,h4');
      return heading && String(heading.textContent || '').includes(text);
    }) || null;
  }
  function extractMineSections(html, isAdmin){
    const tpl = template(html);
    const extraCards = Array.from(tpl.content.querySelectorAll('.card')).filter(card => String(card.textContent || '').includes('ส่วนที่ 2 ขอ OT เพิ่ม'));
    return {
      tracking: outer(tpl.content.querySelector('#v234AdminFollowCard')),
      adminDuty: outer(cardByHeading(tpl, 'ส่วนที่ 1 ยืนยันวันอยู่เวรแทนเจ้าหน้าที่')),
      adminExtra: outer(isAdmin ? extraCards.find(card => String(card.textContent || '').includes('เลือกชื่อเจ้าหน้าที่')) : null),
      staffToday: outer(tpl.content.querySelector('.my-duty-today-card')) || outer(cardByHeading(tpl, 'เวรของฉันตามวันที่เลือก')) || outer(cardByHeading(tpl, 'ส่วนที่ 1 เวรของฉัน')),
      staffExtra: outer(!isAdmin ? extraCards[0] : null),
      staffMonth: outer(tpl.content.querySelector('.v219-my-month-card, .my-duty-month-section')) || outer(cardByHeading(tpl, 'เวรของฉันเดือนนี้')),
      staffList: outer(cardByHeading(tpl, 'รายการ OT ของฉัน')),
      staffDetails: outer(tpl.content.querySelector('.v347-my-claim-card')),
      ch4: outer(tpl.content.querySelector('.v234-ch4-shared-card')),
      repair: outer(tpl.content.querySelector('.v219-ot-repair-panel')),
      approval: outer(cardByHeading(tpl, 'ส่วนที่ 3 อนุมัติ OT'))
    };
  }
  function stripRepeatedMonthControls(html){
    const tpl = template(html);
    const ids = ['otMoneyMonthV241','otSourceMonthV241','myDutyMonthFilter','otAdminMonthFilterV234','ch4MonthFilterV234','hrHistoryYearV318','hrHistoryMonthNumberV318'];
    ids.forEach(id => {
      Array.from(tpl.content.querySelectorAll(`#${id}`)).forEach(control => {
        const holder = control.closest('.v241-month-filter,.my-duty-month-filter,label');
        if (holder) holder.remove(); else control.remove();
      });
    });
    Array.from(tpl.content.querySelectorAll('.toolbar.compact-filter')).forEach(toolbar => {
      if (!toolbar.querySelector('input,select,button')) toolbar.remove();
    });
    const holder = document.createElement('div');
    holder.appendChild(tpl.content.cloneNode(true));
    return holder.innerHTML;
  }
  function renameFirstHeading(html, title){
    const tpl = template(html);
    const heading = tpl.content.querySelector('h2,h3,h4');
    if (heading) heading.textContent = title;
    const holder = document.createElement('div');
    holder.appendChild(tpl.content.cloneNode(true));
    return holder.innerHTML;
  }
  function cleanHistory(html){
    const tpl = template(stripRepeatedMonthControls(html));
    Array.from(tpl.content.querySelectorAll('.hint,.empty')).forEach(el => {
      const text = String(el.textContent || '');
      if (text.includes('เลือกชื่อเจ้าหน้าที่ ปี และเดือนครบ')) el.textContent = 'เลือกชื่อเจ้าหน้าที่ก่อน ระบบจะใช้เดือนที่เลือกด้านบน';
      if (text.includes('เลือกชื่อเจ้าหน้าที่ ปี และเดือนก่อน')) el.textContent = 'กรุณาเลือกชื่อเจ้าหน้าที่ก่อน ระบบจึงจะโหลดประวัติ Export ของเดือนที่เลือกด้านบน';
    });
    const holder = document.createElement('div');
    holder.appendChild(tpl.content.cloneNode(true));
    return holder.innerHTML;
  }
  function emptyCard(text){ return `<div class="card wide-card" style="grid-column:1/-1"><div class="empty">${esc(text)}</div></div>`; }

  function menuHtml(active, isAdmin){
    const items = isAdmin ? ADMIN_ITEMS : STAFF_ITEMS;
    return `<div class="v369-menu-grid ${isAdmin ? 'is-admin' : 'is-staff'}" role="tablist" aria-label="เมนู OT">${items.map(([id,label]) => `<button type="button" role="tab" aria-selected="${active === id ? 'true' : 'false'}" class="v369-menu-btn ${active === id ? 'active' : ''}" data-v369-ot-menu="${esc(id)}">${esc(label)}</button>`).join('')}</div>`;
  }
  function topCard(active, isAdmin){
    const month = selectedMonth();
    return `<div class="card v369-ot-menu-card"><div class="v369-ot-menu-head"><div><h3>OT / HR Export</h3><p class="hint">เลือกเดือนหนึ่งครั้ง แล้วเลือกหัวข้อที่ต้องการทำงาน</p></div><label class="v369-month-label">เดือนที่ต้องการดู <input id="otMoneyMonthV241" type="month" value="${esc(month)}" aria-label="เลือกเดือน OT"></label></div>${menuHtml(active,isAdmin)}</div>`;
  }

  function adminDetailContent(){
    const month = selectedMonth();
    const selected = String(S()?.otDetailStaffV369 || '');
    const options = activeStaff().map(person => `<option value="${esc(person.id)}" ${String(person.id) === selected ? 'selected' : ''}>${esc(staffName(person))}</option>`).join('');
    const body = !selected
      ? '<div class="empty v369-detail-empty">กรุณาเลือกชื่อเจ้าหน้าที่ก่อนทุกครั้ง เพื่อดูรายละเอียด OT ของเดือนที่เลือกด้านบน</div>'
      : `<div class="v369-admin-detail-body" data-v369-detail-staff="${esc(selected)}" data-v369-detail-month="${esc(month)}"><div class="v369-detail-summary"><div class="notice soft-notice compact">กำลังตรวจสอบยอดทบและยอดเบิก HR…</div></div><div class="v369-detail-rows"><div class="empty">กำลังโหลดรายละเอียด OT…</div></div></div>`;
    return `<div class="card wide-card v369-admin-detail-card" style="grid-column:1/-1"><div class="section-title"><div><h3>รายละเอียด OT ของเจ้าหน้าที่</h3><p class="hint">แสดงเฉพาะรายการที่อนุมัติแล้วในเดือน ${esc(month)} และต้องเลือกชื่อใหม่เมื่อเข้าหัวข้อนี้</p></div></div><label class="v369-staff-picker">เลือกชื่อเจ้าหน้าที่ <select id="v369AdminDetailStaff"><option value="">กรุณาเลือกชื่อ</option>${options}</select></label>${body}</div>`;
  }

  async function hydrateAdminDetail(){
    const root = document.querySelector('.v369-admin-detail-body');
    if (!root) return;
    const sid = String(root.dataset.v369DetailStaff || '');
    const month = String(root.dataset.v369DetailMonth || selectedMonth()).slice(0,7);
    if (!sid) return;
    const token = ++adminDetailToken;
    const renderRows = () => {
      if (token !== adminDetailToken || !document.body.contains(root)) return [];
      const rows = window.cnmiV347?.approvedDetails?.(sid, month) || [];
      const rowsSlot = root.querySelector('.v369-detail-rows');
      if (rowsSlot) rowsSlot.innerHTML = window.cnmiV348?.detailRows ? window.cnmiV348.detailRows(rows) : detailRowsFallback(rows);
      return rows;
    };
    let rows = renderRows();
    try {
      const map = await window.cnmiV318?.queryCarryInSummary?.(month);
      if (token !== adminDetailToken || !document.body.contains(root)) return;
      const carry = map instanceof Map ? (map.get(sid) || {amount:0,sourceMonth:''}) : {amount:0,sourceMonth:''};
      const slot = root.querySelector('.v369-detail-summary');
      if (slot && window.cnmiV347?.summaryHtml) slot.innerHTML = window.cnmiV347.summaryHtml(sid, rows, carry);
    } catch (_) {
      const slot = root.querySelector('.v369-detail-summary');
      if (slot) slot.innerHTML = '<div class="notice error-notice compact">ยังอ่านยอดทบจากรอบก่อนไม่สำเร็จ กรุณาลองใหม่</div>';
    }
    try {
      await Promise.all([
        window.cnmiV348?.ensureTrades?.(month, sid),
        window.cnmiV348?.ensureHelpers?.(month)
      ]);
      if (token !== adminDetailToken || !document.body.contains(root)) return;
      rows = renderRows();
      const map = await window.cnmiV318?.queryCarryInSummary?.(month);
      const carry = map instanceof Map ? (map.get(sid) || {amount:0,sourceMonth:''}) : {amount:0,sourceMonth:''};
      const slot = root.querySelector('.v369-detail-summary');
      if (slot && window.cnmiV347?.summaryHtml) slot.innerHTML = window.cnmiV347.summaryHtml(sid, rows, carry);
    } catch (_) {}
  }

  function renderOtPageV369(){
    const isAdmin = admin();
    const active = initialItem(isAdmin);
    S().otMenuV369 = active;
    setMonthState(selectedMonth());
    S().otSubtabV241 = legacyItem(active, isAdmin);
    if (S().otSubtabV241 === 'history') {
      S().hrHistoryYearV318 = selectedMonth().slice(0,4);
      S().hrHistoryMonthNumberV318 = selectedMonth().slice(5,7);
    }

    const base = previousRenderOtPage ? String(previousRenderOtPage.apply(this, arguments) || '') : '';
    let content = '';

    if (isAdmin) {
      if (active === 'admin-duty' || active === 'admin-extra') {
        const sections = extractMineSections(base, true);
        if (active === 'admin-duty') content = `${renameFirstHeading(sections.adminDuty, 'ยืนยันวันอยู่เวรแทนเจ้าหน้าที่')}${sections.ch4 || ''}`;
        else content = renameFirstHeading(sections.adminExtra, 'ขอ OT เพิ่ม / เวรปั่นเลือดแทนเจ้าหน้าที่');
      } else if (active === 'tracking') {
        const sections = extractMineSections(base, true);
        content = sections.tracking || contentInner(base);
      } else if (active === 'approve') {
        const sections = extractMineSections(base, true);
        content = `${sections.repair || ''}${renameFirstHeading(sections.approval, 'อนุมัติ OT')}`;
      } else if (active === 'summary') {
        content = contentInner(base);
      } else if (active === 'admin-details') {
        content = adminDetailContent();
        setTimeout(hydrateAdminDetail, 0);
      } else if (active === 'export') {
        content = contentInner(base);
      } else if (active === 'history') {
        content = cleanHistory(contentInner(base));
      }
    } else {
      if (active === 'staff-summary') {
        content = renameFirstHeading(contentInner(base), 'สรุป OT รายเดือนของฉัน');
      } else {
        const sections = extractMineSections(base, false);
        if (active === 'staff-track') content = renameFirstHeading(sections.staffMonth, 'ติดตามเวรของฉัน');
        if (active === 'staff-confirm') content = `${renameFirstHeading(sections.staffToday, 'ยืนยันวันอยู่เวรของฉัน')}${sections.ch4 || ''}`;
        if (active === 'staff-extra') content = renameFirstHeading(sections.staffExtra, 'ขอ OT เพิ่ม / เวรปั่นเลือด');
        if (active === 'staff-list') content = sections.staffList;
        if (active === 'staff-details') content = sections.staffDetails;
      }
    }

    content = stripRepeatedMonthControls(content);
    if (!String(content || '').trim()) content = emptyCard('ไม่พบข้อมูลของหัวข้อนี้ กรุณารีเฟรชหนึ่งครั้ง');
    return `<div class="v369-ot-page">${topCard(active,isAdmin)}<div class="grid grid-2 ot-page v369-ot-content">${content}</div></div>`;
  }

  if (previousRenderOtPage) {
    try { window.renderOtPage = renderOtPage = renderOtPageV369; }
    catch (_) { window.renderOtPage = renderOtPageV369; }
  }

  document.addEventListener('click', function(e){
    const menu = e.target?.closest?.('[data-v369-ot-menu]');
    if (menu) {
      e.preventDefault();
      const id = String(menu.getAttribute('data-v369-ot-menu') || '');
      const isAdmin = admin();
      if (!validItem(id, isAdmin)) return;
      S().otMenuV369 = id;
      S().otSubtabV241 = legacyItem(id, isAdmin);
      if (id === 'admin-details') S().otDetailStaffV369 = '';
      try { renderPage(); } catch (_) {}
      return;
    }

    const inventory = e.target?.closest?.('.inventory-app-link');
    if (inventory) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const url = inventory.getAttribute('href') || 'https://inventory.cnmiblood.com/';
      inventory.setAttribute('aria-busy','true');
      const small = inventory.querySelector('small');
      if (small) small.textContent = 'กำลังเปิดแอพ Inventory…';
      window.location.assign(url);
    }
  }, true);

  document.addEventListener('change', async function(e){
    if (e.target?.id === 'otMoneyMonthV241') {
      const value = String(e.target.value || currentMonth()).slice(0,7);
      setMonthState(value);
      S().otDetailStaffV369 = '';
      clearTimeout(monthRenderTimer);
      monthRenderTimer = setTimeout(() => { try { renderPage(); } catch (_) {} }, 60);
      if (S().otMenuV369 === 'history' && S().hrHistoryStaffV318) {
        try { await window.cnmiV318?.loadHistory?.(true); } catch (_) {}
      }
      return;
    }
    if (e.target?.id === 'v369AdminDetailStaff') {
      S().otDetailStaffV369 = String(e.target.value || '');
      try { renderPage(); } catch (_) {}
    }
  }, true);

  function prepareInventoryLink(){
    const link = document.querySelector('.inventory-app-link');
    if (!link) return;
    link.removeAttribute('target');
    link.setAttribute('rel','external noopener');
    link.setAttribute('data-open-installed-app','inventory');
    const small = link.querySelector('small');
    if (small) small.textContent = 'เปิดแอพที่ติดตั้งไว้';
  }
  prepareInventoryLink();
  document.addEventListener('DOMContentLoaded', prepareInventoryLink, { once:true });

  const style = document.createElement('style');
  style.textContent = `
    .v369-ot-page{display:grid;gap:14px}.v369-ot-menu-card{display:grid;gap:14px}.v369-ot-menu-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}.v369-ot-menu-head h3{margin:0}.v369-month-label{display:grid;gap:6px;font-weight:800;color:#314b62;min-width:210px}.v369-month-label input{width:100%}
    .v369-menu-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.v369-menu-grid.is-staff{grid-template-columns:repeat(3,minmax(0,1fr))}.v369-menu-btn{min-height:56px;border:1px solid #d6e4f0;border-radius:14px;background:#fff;color:#29455d;padding:11px 12px;font:inherit;font-weight:850;line-height:1.28;text-align:left;cursor:pointer;white-space:normal}.v369-menu-btn:hover{border-color:#82c9f3;background:#f7fcff}.v369-menu-btn.active{background:#72c2f1;border-color:#72c2f1;color:#17384f;box-shadow:0 6px 16px rgba(72,154,204,.18)}
    .v369-ot-content{align-items:start}.v369-ot-content>.card,.v369-ot-content>.v219-ot-repair-panel{grid-column:1/-1}.v369-staff-picker{display:grid;gap:7px;max-width:520px;font-weight:800;margin:8px 0 14px}.v369-detail-empty{margin-top:8px}.v369-admin-detail-body{display:grid;gap:14px}.v369-admin-detail-card .v348-mobile-detail{margin-top:4px}
    .inventory-app-link[aria-busy="true"]{opacity:.78;pointer-events:none}
    @media(max-width:1120px){.v369-menu-grid,.v369-menu-grid.is-staff{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:680px){.v369-ot-menu-head{align-items:stretch}.v369-month-label{min-width:0;width:100%}.v369-menu-grid,.v369-menu-grid.is-staff{grid-template-columns:1fr}.v369-menu-btn{min-height:52px;text-align:center}.v369-ot-content{display:block}.v369-ot-content>*+*{margin-top:12px}}
  `;
  document.head.appendChild(style);

  window.cnmiV369 = { version:VERSION, setMonthState, hydrateAdminDetail };
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v369-ot-menu-inventory-app-launch.js", error); }
;

/* Original source: patch-v370-ot-mobile-fit.js */
try {
/* CNMI Staff Planner V370
   - Fixes mobile overflow on OT / HR Export page for both staff and admin.
   - Makes the V369 top month selector and menu buttons fully fit small screens.
   - Ensures tables/cards scroll inside their own container instead of widening the whole page.
*/
(function(){
  'use strict';
  const VERSION = 'V370_OT_MOBILE_FIT';
  if (window.__CNMI_V370_OT_MOBILE_FIT__) return;
  window.__CNMI_V370_OT_MOBILE_FIT__ = true;

  const style = document.createElement('style');
  style.textContent = `
    .v369-ot-page, .v369-ot-page *, .v369-ot-page *::before, .v369-ot-page *::after{box-sizing:border-box}
    .v369-ot-page, .v369-ot-menu-card, .v369-ot-content, .v369-ot-content>.card, .v369-menu-grid, .v369-menu-btn, .v369-month-label, .v369-month-label input, .v369-month-label select{min-width:0;max-width:100%}
    .v369-ot-page{width:100%;overflow-x:hidden}
    .v369-ot-menu-card{overflow:hidden}
    .v369-ot-menu-head{align-items:stretch}
    .v369-ot-menu-head>div{min-width:0;flex:1 1 260px}
    .v369-month-label{flex:1 1 240px;width:100%}
    .v369-month-label input,.v369-month-label select{display:block;width:100%}
    .v369-menu-grid{width:100%}
    .v369-menu-btn{
      display:flex;
      align-items:center;
      justify-content:flex-start;
      width:100%;
      min-width:0;
      max-width:100%;
      overflow:hidden;
      white-space:normal !important;
      overflow-wrap:anywhere;
      word-break:break-word;
      word-wrap:break-word;
      text-wrap:pretty;
      text-align:left;
      hyphens:auto;
    }
    .v369-ot-page .table-wrap{max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
    .v369-ot-page .table-wrap>table{min-width:100%}
    .v369-ot-page .mobile-cards,.v369-ot-page .mobile-card,.v369-ot-page .actions,.v369-ot-page .notice,.v369-ot-page .empty{min-width:0;max-width:100%}
    .v369-ot-page .section-title,.v369-ot-page .mobile-day-head{min-width:0;flex-wrap:wrap}
    .v369-ot-page .section-title h2,.v369-ot-page .section-title h3,.v369-ot-page .section-title h4,.v369-ot-page .mobile-day-head b{min-width:0;overflow-wrap:anywhere;word-break:break-word}

    @media(max-width:760px){
      .v369-ot-page{gap:12px}
      .v369-ot-menu-card{padding:16px}
      .v369-ot-menu-head{gap:12px}
      .v369-month-label{gap:6px}
      .v369-month-label{font-size:14px}
      .v369-month-label input,.v369-month-label select{font-size:16px}
      .v369-menu-grid,.v369-menu-grid.is-staff,.v369-menu-grid.is-admin{grid-template-columns:1fr !important;gap:10px}
      .v369-menu-btn{
        min-height:54px;
        padding:14px 16px;
        font-size:clamp(18px,4.5vw,22px);
        line-height:1.22;
        justify-content:flex-start;
        text-align:left;
        border-radius:16px;
      }
      .v369-ot-content{display:block}
      .v369-ot-content>*+*{margin-top:12px}
    }

    @media(max-width:480px){
      .v369-ot-menu-card{padding:14px}
      .v369-menu-btn{font-size:17px;line-height:1.2;padding:13px 14px}
      .v369-ot-page .card{padding-left:14px;padding-right:14px}
    }
  `;
  document.head.appendChild(style);

  function healOtOverflow(root){
    const page = root || document.querySelector('.v369-ot-page');
    if (!page) return;
    page.querySelectorAll('.v369-menu-btn').forEach(btn => {
      btn.style.width = '100%';
      btn.style.maxWidth = '100%';
      btn.style.minWidth = '0';
    });
    page.querySelectorAll('.table-wrap').forEach(wrap => {
      wrap.style.maxWidth = '100%';
      wrap.style.overflowX = 'auto';
    });
  }

  const run = () => healOtOverflow();
  document.addEventListener('DOMContentLoaded', run, { once:true });
  document.addEventListener('click', function(){ setTimeout(run, 0); }, true);
  document.addEventListener('change', function(){ setTimeout(run, 0); }, true);
  const observer = new MutationObserver(() => {
    if (document.querySelector('.v369-ot-page')) healOtOverflow();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  window.cnmiV370 = { version: VERSION, healOtOverflow };
  console.info('[' + VERSION + '] loaded');
})();

} catch (error) { console.error("[v569] patch-v370-ot-mobile-fit.js", error); }
;

/* Original source: patch-v372-position-admin-authoritative-mobile-jump.js */
try {
/* CNMI Staff Planner V372 (corrected from V371)
   Scope:
   - Daily daytime positions: Admin is the only editor. Incharge/Staff see the saved Admin plan.
   - Daily Slot auto increase/decrease control is removed. Monthly Slot target inputs remain unchanged.
   - Prevents untouched Admin selections from being saved as blank.
   - Fills missing break time / role rule / job description.
   - On mobile monthly tables, tapping a position info/pill jumps to and opens its description below.
   - Removes only redundant explanatory blocks from position pages.
   No SQL/schema change.
*/
(function(){
  'use strict';
  const VERSION='V372_POSITION_ADMIN_AUTHORITATIVE_MOBILE_JUMP_CORRECTED';
  if(window.__CNMI_V372_POSITION_ADMIN_AUTHORITATIVE_MOBILE_JUMP_CORRECTED__)return;
  window.__CNMI_V372_POSITION_ADMIN_AUTHORITATIVE_MOBILE_JUMP_CORRECTED__=true;

  let queued=false;
  let lastJumpAt=0;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function page(){return txt(S()?.page);}
  function normDate(v){
    try{if(typeof window.normalizeDateKey==='function')return txt(window.normalizeDateKey(v)).slice(0,10);}catch(_){}
    return txt(v).slice(0,10);
  }
  function admin(){
    try{if(typeof window.isAdmin==='function')return !!window.isAdmin();}catch(_){}
    try{if(typeof isAdmin==='function')return !!isAdmin();}catch(_){}
    return txt(S()?.currentRole||S()?.role||S()?.profile?.role).toLowerCase()==='admin';
  }
  function assignGlobal(name,value){
    try{window[name]=value;}catch(_){}
    try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){}
  }
  function isMissing(v){
    const s=txt(v);
    return !s||s==='-'||s==='--'||s==='—'||/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);
  }
  function codeKey(v){return txt(v).replace(/\s+/g,' ').replace(/(\D)(\d+)$/,'$1 $2').trim();}
  function normCode(v){return codeKey(v).toLowerCase().replace(/\s+/g,'');}
  function staffName(id){
    const p=(S()?.staff||[]).find(x=>txt(x?.id)===txt(id))||{};
    return txt(p.nickname||p.full_name||p.email||id||'-');
  }
  function leaveText(staffId,date){
    if(!staffId||!date)return'';
    try{
      const row=typeof window.activeLeaveRecordOn==='function'?window.activeLeaveRecordOn(staffId,date):
        (typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null);
      if(!row)return'';
      if(typeof window.leaveDisplayType==='function')return txt(window.leaveDisplayType(row));
      if(typeof leaveDisplayType==='function')return txt(leaveDisplayType(row));
      return txt(row.type||row.leave_type||'ลา');
    }catch(_){return'';}
  }

  const DETAIL={
    report:'รับผิดชอบการออกผลตรวจ Routine, คล้องเลือด (Cross-match), พิมพ์รายงาน A4 และตรวจสอบงานที่เกี่ยวข้องให้ครบถ้วน',
    approve:'รับผิดชอบการอนุมัติผลในระบบ LIS, รับเลือดเข้า Stock, จ่ายเลือดทั้งกรณีปกติและเร่งด่วน และปลดเลือดตามขั้นตอน',
    manual12:'ตรวจผู้บริจาคโลหิตด้วยเครื่อง IH-500, ตรวจ Ab ID และรับผิดชอบงาน Manual ตามที่ได้รับมอบหมาย',
    manual34:'ปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, วัดค่า pH, วัดเม็ดเลือดขาว, QC ถุงเลือด, รูดสาย และงาน Manual ที่เกี่ยวข้อง',
    bbSupport:'รับแล็บ, เดินส่งเลือด, รับโทรศัพท์ประสานงาน, รับเลือดจากสภากาชาด และบันทึกอุณหภูมิห้อง BB/Manual',
    register:'ลงทะเบียนผู้บริจาค, คัดกรอง Vital signs และบันทึกอุณหภูมิห้อง Donor',
    finger1:'ซักประวัติผู้บริจาคในห้องสัมภาษณ์ 1 และเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    finger2:'ซักประวัติผู้บริจาคในห้องสัมภาษณ์ 2 และเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    main:'เจาะเลือดผู้บริจาค ดูแลผู้บริจาค และจัดการเคส Reaction ตามแนวทางของหน่วยงาน',
    drSupport:'ช่วยงานห้องบริจาคโลหิตตามหน้างาน เตรียมอุปกรณ์ ดูแลพื้นที่ รับ-ส่งสิ่งของ และสนับสนุนจุดบริการที่จำเป็น',
    processing:'นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, ประสานงาน QC ถุงเลือด และดูแลขั้นตอนหลังการเจาะ',
    preparing:'เตรียม Set อุปกรณ์เจาะเลือด เติมน้ำดื่ม/ขนม และดูแลความเรียบร้อยของเตียงบริจาค'
  };

  function fallback(code){
    const c=codeKey(code),n=normCode(c);
    if(/^bb-report/.test(n))return{zone:'Blood Bank',break_time:'11:00',main_rule:'MT เท่านั้น',job_desc:DETAIL.report};
    if(/^bb-approve/.test(n))return{zone:'Blood Bank',break_time:'12:00',main_rule:'MT เท่านั้น',job_desc:DETAIL.approve};
    if(/^bb-manual/.test(n)){
      const m=c.match(/(\d+)\s*$/),no=m?Number(m[1]):0;
      return{zone:'Blood Bank',break_time:no>=3?'12:00':'11:00',main_rule:'MT เท่านั้น',job_desc:no>=3?DETAIL.manual34:DETAIL.manual12};
    }
    if(/^bb-support/.test(n))return{zone:'Blood Bank',break_time:'11:00',main_rule:'Clerk หรือ แตง',job_desc:DETAIL.bbSupport};
    if(/^dr-register/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'Clerk หรือ แตง',job_desc:DETAIL.register};
    if(/^dr-finger\+?interview/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT หรือ แตง',job_desc:/2\s*$/.test(c)?DETAIL.finger2:DETAIL.finger1};
    if(/^dr-main/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT หรือ แตง',job_desc:DETAIL.main};
    if(/^dr-support/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT, Clerk หรือ แตง',job_desc:DETAIL.drSupport};
    if(/^dr-processing/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT เท่านั้น',job_desc:DETAIL.processing};
    if(/^dr-preparing/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'Clerk หรือ แตง',job_desc:DETAIL.preparing};
    if(/^bb-/.test(n))return{zone:'Blood Bank',break_time:'12:00',main_rule:'MT เท่านั้น',job_desc:`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c}`};
    if(/^dr-/.test(n))return{zone:'Donor Room',break_time:'12:00',main_rule:'MT หรือ แตง',job_desc:`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c}`};
    return{zone:'-',break_time:'12:00',main_rule:'ตามที่ได้รับมอบหมาย',job_desc:`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c||'นี้'}`};
  }
  function enrich(row,code){
    const src={...(row||{})};
    const c=codeKey(code||src.code||src.position_code);
    const fb=fallback(c);
    src.code=src.code||c;
    src.position_code=src.position_code||c;
    if(isMissing(src.zone))src.zone=fb.zone;
    if(isMissing(src.break_time))src.break_time=fb.break_time;
    if(isMissing(src.main_rule||src.required_role))src.main_rule=fb.main_rule;
    if(isMissing(src.job_desc||src.description))src.job_desc=fb.job_desc;
    return src;
  }

  function wrapPositionFunctions(){
    ['positionByCode','positionTemplateByCode'].forEach(name=>{
      const old=window[name]||(typeof globalThis[name]==='function'?globalThis[name]:null);
      if(typeof old!=='function'||old.__v372CorrectedEnriched)return;
      const next=function(){return enrich(old.apply(this,arguments)||{},arguments[0]);};
      next.__v372CorrectedEnriched=true;
      next.__v372Previous=old;
      assignGlobal(name,next);
    });
  }
  function makeAdminOnlyDaily(){
    const old=window.canManagePositions||(typeof canManagePositions==='function'?canManagePositions:null);
    if(typeof old!=='function'||old.__v372CorrectedAdminOnly)return;
    const next=function(){return admin();};
    next.__v372CorrectedAdminOnly=true;
    next.__v372Previous=old;
    assignGlobal('canManagePositions',next);
  }

  function dailyRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return[];
  }
  function plannedId(row){return txt(row?._planned_staff_id||row?.staff_id);}
  function savedRowsForDate(date){
    return(S()?.positions||[]).filter(row=>normDate(row?.work_date)===date&&codeKey(row?.position_code||row?.code));
  }

  /* The daily page must show the exact Admin-saved monthly/daily plan, not a Slot set recalculated from attendance. */
  function lockDailyToSavedPlan(root=document){
    if(page()!=='positions')return;
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    const date=normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate);
    if(!date)return;
    const saved=savedRowsForDate(date);
    if(!saved.length)return;
    const savedByCode=new Map(saved.map(row=>[normCode(row.position_code||row.code),enrich(row)]));
    const current=dailyRows();
    const kept=[],keepIndexes=[];
    current.forEach((row,index)=>{
      const authoritative=savedByCode.get(normCode(row?.position_code||row?.code));
      if(!authoritative)return;
      kept.push(enrich({...row,...authoritative,_planned_staff_id:authoritative.staff_id||null,_source:'slot'},authoritative.position_code||authoritative.code));
      keepIndexes.push(index);
    });
    if(!kept.length)return;
    window.__CNMI_V225_DAILY_POSITION_ROWS__=kept;
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))window.__CNMI_V226_DAILY_POSITION_ROWS__=kept;

    const keep=new Set(keepIndexes);
    const tableRows=Array.from(area.querySelectorAll('.v225-daily-position-table tbody tr'));
    const cards=Array.from(area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
    tableRows.forEach((row,index)=>{if(!keep.has(index))row.remove();});
    cards.forEach((card,index)=>{if(!keep.has(index))card.remove();});

    const remainingTable=Array.from(area.querySelectorAll('.v225-daily-position-table tbody tr'));
    const remainingCards=Array.from(area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
    [...remainingTable,...remainingCards].forEach((holder,index)=>{
      const localIndex=index>=remainingTable.length?index-remainingTable.length:index;
      holder.querySelectorAll('[data-position-row]').forEach(select=>{select.dataset.positionRow=String(localIndex);});
      holder.querySelectorAll('[data-v225-position-detail],[data-v226-position-detail],[data-v296-position-detail],[data-position-detail-v219]').forEach(button=>{
        ['v225PositionDetail','v226PositionDetail','v296PositionDetail','positionDetailV219'].forEach(key=>{if(key in button.dataset)button.dataset[key]=String(localIndex);});
      });
    });
    area.querySelectorAll('.v225-extra-plan-row').forEach(node=>node.classList.remove('v225-extra-plan-row'));
  }

  function enrichState(){
    const st=S();
    ['positionMasters','dailyPositionMasters'].forEach(key=>{if(Array.isArray(st?.[key]))st[key].forEach(row=>Object.assign(row,enrich(row)));});
    if(Array.isArray(st?.positions))st.positions.forEach(row=>Object.assign(row,enrich(row)));
    dailyRows().forEach(row=>Object.assign(row,enrich(row)));
  }
  function optionExists(select,value){return Array.from(select?.options||[]).some(o=>txt(o.value)===txt(value));}
  function setSelectValue(select,value){
    if(!select||!value)return;
    if(!optionExists(select,value)){
      const option=document.createElement('option');option.value=value;option.textContent=staffName(value);select.appendChild(option);
    }
    select.value=value;
  }

  /* Untouched Admin dropdowns keep the saved person, so Save cannot wipe the day to blank. */
  function fillAdminDefaults(root=document){
    if(!admin()||page()!=='positions')return;
    const rows=dailyRows();
    root.querySelectorAll?.('select[data-position-row]')?.forEach(select=>{
      const idx=Number(select.dataset.positionRow);
      const row=rows[Number.isFinite(idx)?idx:0]||{};
      const pid=plannedId(row);
      if(!txt(select.value)&&pid&&select.dataset.v372Touched!=='1')setSelectValue(select,pid);
      const detail=enrich(row,select.dataset.positionCode);
      select.dataset.positionZone=detail.zone;
      select.dataset.positionBreak=detail.break_time;
      select.dataset.positionRule=detail.main_rule;
      select.dataset.positionJob=detail.job_desc;
    });
    try{window.cnmiV322?.queueEnhance?.();}catch(_){}
  }

  function updateDailyDetails(root=document){
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    const rows=dailyRows();
    rows.forEach(row=>Object.assign(row,enrich(row)));
    area.querySelectorAll('.v225-daily-position-table tbody tr').forEach((tr,index)=>{
      const select=tr.querySelector('select[data-position-row]');
      const code=select?.dataset?.positionCode||txt(tr.children?.[1]?.textContent);
      const detail=enrich(rows[index]||{},code);
      if(tr.children?.[2])tr.children[2].textContent=detail.break_time;
      if(tr.children?.[5]&&(isMissing(tr.children[5].textContent)||tr.children[5].textContent!==detail.main_rule))tr.children[5].textContent=detail.main_rule;
      const short=tr.querySelector('.v225-job-short,.v219-job-short');
      if(short)short.textContent=detail.job_desc.length>90?`${detail.job_desc.slice(0,90)}…`:detail.job_desc;
    });
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card').forEach((card,index)=>{
      const code=txt(card.querySelector('h2,h3,h4')?.textContent)||rows[index]?.position_code;
      const detail=enrich(rows[index]||{},code);
      const meta=Array.from(card.children||[]).find(node=>node?.classList?.contains('muted')&&/^พัก/.test(txt(node.textContent)));
      if(meta)meta.textContent=`พัก ${detail.break_time} • ${detail.main_rule}`;
      const select=card.querySelector('select[data-position-row]');
      if(select){
        select.dataset.positionZone=detail.zone;
        select.dataset.positionBreak=detail.break_time;
        select.dataset.positionRule=detail.main_rule;
        select.dataset.positionJob=detail.job_desc;
      }
    });
  }

  function makeDailyReadOnly(root=document){
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    if(admin()){
      area.dataset.v372Readonly='0';
      fillAdminDefaults(area);
      return;
    }
    area.dataset.v372Readonly='1';
    area.querySelectorAll('[data-save-positions],[data-publish-positions],[data-v337-save-publish]').forEach(node=>node.remove());
    area.querySelectorAll('select[data-position-row]').forEach(select=>{select.disabled=true;select.tabIndex=-1;});
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card > label,.v225-mobile-position-list > .v225-position-card > label,.v322-change-status').forEach(node=>node.remove());
    area.querySelectorAll('.v322-baseline-label').forEach(node=>{node.textContent='ผู้รับผิดชอบ';});
    area.querySelectorAll('.v225-daily-position-table thead th').forEach((th,index)=>{if(index===3)th.textContent='ผู้รับผิดชอบ';});
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card').forEach((card,index)=>{
      const planned=Array.from(card.children||[]).find(node=>/แผนตั้งต้น/.test(txt(node.textContent)));
      if(planned){
        planned.innerHTML=planned.innerHTML.replace('แผนตั้งต้น:','ผู้รับผิดชอบ:');
        const row=dailyRows()[index]||{};
        const leave=leaveText(plannedId(row),normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate));
        if(leave&&!planned.querySelector('.v372-leave-note'))planned.insertAdjacentHTML('beforeend',`<div class="v372-leave-note">${leave}</div>`);
      }
    });
  }

  /* Daily only. Monthly inputs [data-v275-slot] are intentionally untouched. */
  function removeDailySlotAdjustment(root=document){
    if(page()!=='positions')return;
    root.querySelectorAll?.('.v225-daily-slot-toolbar,[data-v225-daily-slot-set]')?.forEach(node=>{
      const holder=node.closest?.('.v225-daily-slot-toolbar');(holder||node).remove();
    });
    root.querySelectorAll?.('.v225-daily-compare-panel')?.forEach(node=>node.remove());
  }
  function compactPositionPages(root=document){
    if(page()==='positions'){
      root.querySelectorAll?.('.v225-position-note,.v322-daily-change-summary')?.forEach(node=>node.remove());
      root.querySelectorAll?.('.notice.compact')?.forEach(node=>{
        if(/ปรับชุด Slot วันนี้|ระบบเลือกจากคนเหลือจริง|วิธีใช้/.test(txt(node.textContent)))node.remove();
      });
    }
    if(['positionMonth','positionMonthView'].includes(page())){
      root.querySelectorAll?.('.v297-position-description-card .section-title p,.v275-page>.card .section-title p.hint')?.forEach(node=>node.remove());
    }
  }

  function markDescriptionTable(root=document){
    root.querySelectorAll?.('[data-v297-position-descriptions] tbody tr')?.forEach(row=>{
      const code=codeKey(row.children?.[0]?.textContent);
      if(!code)return;
      const detail=enrich({},code);
      if(row.children?.[2]&&isMissing(row.children[2].textContent))row.children[2].textContent=detail.zone;
      if(row.children?.[3]&&isMissing(row.children[3].textContent))row.children[3].textContent=detail.break_time;
      if(row.children?.[4]&&isMissing(row.children[4].textContent))row.children[4].textContent=detail.main_rule;
      if(row.children?.[5]&&isMissing(row.children[5].textContent))row.children[5].textContent=detail.job_desc;
      row.dataset.v372DescriptionCode=normCode(code);
      row.setAttribute('tabindex','-1');
    });
  }
  function markMobileDescriptionCards(root=document){
    root.querySelectorAll?.('.v305-position-description-item')?.forEach(item=>{
      const code=codeKey(item.querySelector('.v305-position-code')?.textContent);
      if(!code)return;
      const detail=enrich({},code);
      item.dataset.v372DescriptionCode=normCode(code);
      const body=item.querySelector('.v305-position-description-body');
      const blocks=Array.from(body?.children||[]);
      const values=[detail.zone,detail.break_time,detail.main_rule,detail.job_desc];
      blocks.forEach((block,index)=>{
        const target=block.querySelector('b,p');
        if(target&&isMissing(target.textContent))target.textContent=values[index]||'-';
      });
    });
  }
  function mobile(){return window.matchMedia?.('(max-width: 900px), (pointer: coarse)')?.matches||window.innerWidth<=900;}
  function monthlyPositionButton(target){
    if(!mobile()||!['positionMonth','positionMonthView'].includes(page()))return null;
    if(target?.nodeType===3)target=target.parentElement;
    return target?.closest?.('[data-v275-job],[data-v273-job-code]')||null;
  }
  function descriptionTarget(code){
    markDescriptionTable(document);markMobileDescriptionCards(document);
    const key=normCode(code);
    const mobileItem=Array.from(document.querySelectorAll('.v305-position-description-item')).find(item=>item.dataset.v372DescriptionCode===key);
    if(mobileItem)return mobileItem;
    return Array.from(document.querySelectorAll('[data-v297-position-descriptions] tbody tr')).find(row=>row.dataset.v372DescriptionCode===key)||null;
  }
  function jumpToDescription(target,event){
    const button=monthlyPositionButton(target);
    if(!button)return false;
    const code=button.getAttribute('data-v275-job')||button.getAttribute('data-v273-job-code')||txt(button.textContent);
    const destination=descriptionTarget(code);
    if(!destination)return false;
    try{event?.preventDefault();event?.stopPropagation();event?.stopImmediatePropagation?.();}catch(_){}
    const now=Date.now();if(now-lastJumpAt<350)return true;lastJumpAt=now;
    if(destination.tagName==='DETAILS')destination.open=true;
    destination.classList.remove('v372-description-hit');
    destination.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
    requestAnimationFrame(()=>destination.classList.add('v372-description-hit'));
    setTimeout(()=>destination.classList.remove('v372-description-hit'),2200);
    return true;
  }

  function enhance(root=document){
    if(!['positions','positionMonth','positionMonthView'].includes(page()))return;
    wrapPositionFunctions();
    makeAdminOnlyDaily();
    enrichState();
    if(page()==='positions'){
      lockDailyToSavedPlan(root);
      updateDailyDetails(root);
      fillAdminDefaults(root);
      makeDailyReadOnly(root);
      removeDailySlotAdjustment(root);
    }
    compactPositionPages(root);
    markDescriptionTable(root);
    markMobileDescriptionCards(root);
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});}

  document.addEventListener('change',event=>{
    const select=event.target?.closest?.('select[data-position-row]');
    if(select){
      const row=txt(select.dataset.positionRow);
      document.querySelectorAll(`select[data-position-row="${CSS.escape(row)}"]`).forEach(twin=>{twin.dataset.v372Touched='1';});
      queue();
    }
  },true);

  /* Window capture runs before older document-capture save and modal handlers. */
  window.addEventListener('click',event=>{
    const save=event.target?.closest?.('[data-v337-save-publish],[data-save-positions],[data-publish-positions]');
    if(save&&page()==='positions')fillAdminDefaults(document);
    jumpToDescription(event.target,event);
  },true);

  const style=document.createElement('style');
  style.id='v372-position-admin-authoritative-style-corrected';
  style.textContent=`
    .v225-daily-slot-toolbar,[data-v225-daily-slot-set],.v225-daily-compare-panel{display:none!important}
    .v372-leave-note{margin-top:5px;color:#b45309;font-weight:800}
    .v225-positions-page[data-v372-readonly="1"] .v225-daily-position-table th:nth-child(5),
    .v225-positions-page[data-v372-readonly="1"] .v225-daily-position-table td:nth-child(5),
    .v226-positions-page[data-v372-readonly="1"] .v225-daily-position-table th:nth-child(5),
    .v226-positions-page[data-v372-readonly="1"] .v225-daily-position-table td:nth-child(5){display:none!important}
    .v225-positions-page[data-v372-readonly="1"] .v322-change-status,
    .v226-positions-page[data-v372-readonly="1"] .v322-change-status,
    .v225-positions-page[data-v372-readonly="1"] label:has(select[data-position-row]),
    .v226-positions-page[data-v372-readonly="1"] label:has(select[data-position-row]){display:none!important}
    [data-v297-position-descriptions] tbody tr.v372-description-hit>td{background:#fff3c4!important;box-shadow:inset 0 0 0 2px #f3b61f;transition:background .2s ease}
    .v305-position-description-item.v372-description-hit{box-shadow:0 0 0 3px #f3b61f,0 8px 20px rgba(15,23,42,.10)!important}
    @media(max-width:900px){[data-v275-job],[data-v273-job-code]{cursor:pointer;touch-action:manipulation}}
  `;
  document.head.appendChild(style);

  const install=()=>{
    wrapPositionFunctions();makeAdminOnlyDaily();
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v372CorrectedObserver){
      const observer=new MutationObserver(queue);observer.observe(root,{childList:true,subtree:true});root.__v372CorrectedObserver=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);

  window.cnmiV372={version:VERSION,enrich,fallback,fillAdminDefaults,enhance,jumpToDescription};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v372-position-admin-authoritative-mobile-jump.js", error); }
;

/* Original source: patch-v373-position-stat-colors-compact-offdays.js */
try {
/* CNMI Staff Planner V373
   Scope: daytime position monthly pages only.
   - Adds grouped background colors to Admin position statistics columns.
   - Makes Saturday, Sunday and public-holiday columns narrower in monthly matrices.
   - No data, Slot target, leave, permission, save, Supabase or calculation changes.
*/
(function(){
  'use strict';
  const VERSION='V373_POSITION_STAT_COLORS_COMPACT_OFFDAYS';
  if(window.__CNMI_V373_POSITION_STAT_COLORS_COMPACT_OFFDAYS__)return;
  window.__CNMI_V373_POSITION_STAT_COLORS_COMPACT_OFFDAYS__=true;

  let queued=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function page(){return String(S()?.page||'');}
  function targetPage(){return page()==='positionMonth'||page()==='positionMonthView';}
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');}

  function colorGroup(code){
    const key=norm(code);
    if(key==='bbreport'||key==='bbapprove')return'report-approve';
    if(key==='bbmanual1'||key==='bbmanual2')return'manual-12';
    if(key==='bbmanual3'||key==='bbmanual4')return'manual-34';
    if(key==='drregister'||key==='drsupport')return'register-support';
    if(key==='drfingerinterview1'||key==='drfingerinterview2')return'finger-interview';
    if(key==='drmain1'||key==='drmain2')return'dr-main';
    return''; // BB-Support and unspecified positions remain white.
  }

  function decoratePositionStatTable(table){
    if(!table)return;
    const heads=Array.from(table.querySelectorAll('thead tr:first-child > th'));
    if(!heads.length)return;
    heads.forEach((head,index)=>{
      if(index===0||index===heads.length-1)return;
      const group=colorGroup(head.textContent);
      if(!group)return;
      head.classList.add('v373-stat-color');
      head.dataset.v373StatGroup=group;
      Array.from(table.tBodies||[]).forEach(body=>{
        Array.from(body.rows||[]).forEach(row=>{
          const cell=row.cells?.[index];
          if(!cell)return;
          cell.classList.add('v373-stat-color');
          cell.dataset.v373StatGroup=group;
        });
      });
    });
  }

  function decorateStats(root=document){
    root.querySelectorAll?.('.v278-position-detail-table')?.forEach(decoratePositionStatTable);
  }

  function compactOffdayColumns(table){
    if(!table)return;
    const firstHeadRow=table.tHead?.rows?.[0];
    if(!firstHeadRow)return;
    const offIndexes=[];
    Array.from(firstHeadRow.cells||[]).forEach((head,index)=>{
      if(!head.classList.contains('v275-date-head'))return;
      if(!head.classList.contains('off')&&!head.classList.contains('holiday'))return;
      offIndexes.push(index);
      head.classList.add('v373-compact-offday');
      const holidayName=head.querySelector('em')?.textContent?.trim();
      if(holidayName&&!head.title)head.title=holidayName;
    });
    if(!offIndexes.length)return;
    Array.from(table.rows||[]).forEach(row=>{
      offIndexes.forEach(index=>{
        const cell=row.cells?.[index];
        if(cell)cell.classList.add('v373-compact-offday');
      });
    });
  }

  function compactMonthlyOffdays(root=document){
    root.querySelectorAll?.('.v275-position-table')?.forEach(compactOffdayColumns);
  }

  function enhance(root=document){
    if(!targetPage())return;
    decorateStats(root);
    compactMonthlyOffdays(root);
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance(document);});
  }

  const style=document.createElement('style');
  style.id='v373-position-stat-colors-compact-offdays-style';
  style.textContent=`
    /* Admin statistics: same work group = same soft background. */
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="report-approve"]{background:#e8f2ff!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="manual-12"]{background:#fff3d9!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="manual-34"]{background:#f2eaff!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="register-support"]{background:#e8f8ee!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="finger-interview"]{background:#ffeaf1!important}
    .v278-position-detail-table .v373-stat-color[data-v373-stat-group="dr-main"]{background:#e7f8fb!important}
    .v278-position-detail-table thead .v373-stat-color{font-weight:850;color:#223b50}

    /* Weekend / holiday monthly columns are intentionally compact. */
    .v275-position-table th.v373-compact-offday,
    .v275-position-table td.v373-compact-offday{
      min-width:42px!important;
      width:42px!important;
      max-width:42px!important;
      padding-left:2px!important;
      padding-right:2px!important;
      white-space:normal!important;
      overflow:hidden;
      text-align:center;
    }
    .v275-position-table th.v373-compact-offday em{display:none!important}
    .v275-position-table th.v373-compact-offday b{font-size:10px}
    .v275-position-table th.v373-compact-offday small{font-size:7px}
    .v275-position-table td.v373-compact-offday span,
    .v275-position-table td.v373-compact-offday b{font-size:7px;line-height:1.05;overflow-wrap:anywhere}

    @media(max-width:820px){
      .v275-position-table th.v373-compact-offday,
      .v275-position-table td.v373-compact-offday{
        min-width:34px!important;
        width:34px!important;
        max-width:34px!important;
        padding-left:1px!important;
        padding-right:1px!important;
      }
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',queue,{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  queue();

  window.cnmiV373={version:VERSION,enhance,colorGroup};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v373-position-stat-colors-compact-offdays.js", error); }
;

/* Original source: patch-v374-outing-column-and-position-display-restore.js */
try {
/* CNMI Staff Planner V374
   Scope: daytime position monthly pages only.
   1) Marks every date column that has an "ออกหน่วย" activity with a red background.
   2) Restores Admin dropdown display from the saved daily_positions row after page navigation/rerender.
   No SQL/schema, Slot target, permission, leave, OT or calculation change.
*/
(function(){
  'use strict';
  const VERSION='V374_OUTING_COLUMN_AND_POSITION_DISPLAY_RESTORE';
  if(window.__CNMI_V374_OUTING_COLUMN_AND_POSITION_DISPLAY_RESTORE__)return;
  window.__CNMI_V374_OUTING_COLUMN_AND_POSITION_DISPLAY_RESTORE__=true;

  let queued=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function page(){return text(S()?.page);}
  function targetPage(){return page()==='positionMonth'||page()==='positionMonthView';}
  function adminPage(){return page()==='positionMonth';}
  function normDate(v){
    try{if(typeof window.normalizeDateKey==='function')return text(window.normalizeDateKey(v)).slice(0,10);}catch(_){}
    return text(v).slice(0,10);
  }
  function normId(v){return text(v);}
  function normCode(v){return text(v).toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');}
  function validMonth(v){const key=text(v).slice(0,7);return /^\d{4}-\d{2}$/.test(key)?key:'';}
  function selectedMonth(){
    const input=document.getElementById(page()==='positionMonth'?'positionMonthInput':'positionMonthViewInput');
    return validMonth(input?.value)||validMonth(page()==='positionMonth'?S()?.positionMonthKey:S()?.positionMonthViewKey)||validMonth(S()?.monthKey)||validMonth(new Date().toISOString());
  }
  function monthDates(key){
    const month=validMonth(key);if(!month)return[];
    const [year,no]=month.split('-').map(Number),last=new Date(year,no,0).getDate();
    return Array.from({length:last},(_,index)=>`${month}-${String(index+1).padStart(2,'0')}`);
  }
  function dateInRange(date,start,end){
    const d=normDate(date),s=normDate(start),e=normDate(end||start);
    return !!d&&!!s&&s<=d&&d<=(e||s);
  }
  function outingActivities(date){
    return (Array.isArray(S()?.activities)?S().activities:[]).filter(row=>text(row?.event_type)==='ออกหน่วย'&&dateInRange(date,row?.start_date,row?.end_date));
  }

  function clearOutingDecorations(table){
    table.querySelectorAll('.v374-outing-day').forEach(node=>node.classList.remove('v374-outing-day'));
    table.querySelectorAll('[data-v374-outing-date]').forEach(node=>{
      delete node.dataset.v374OutingDate;
      delete node.dataset.v374OutingTitle;
      if(node.dataset.v374OriginalTitle!==undefined){
        node.title=node.dataset.v374OriginalTitle;
        delete node.dataset.v374OriginalTitle;
      }
    });
    table.querySelectorAll('.v374-outing-label').forEach(node=>node.remove());
  }

  function markOutingColumns(table){
    if(!table)return;
    const headRow=table.tHead?.rows?.[0];
    if(!headRow)return;
    const dates=monthDates(selectedMonth());
    if(!dates.length)return;
    clearOutingDecorations(table);
    dates.forEach((date,dateIndex)=>{
      const activities=outingActivities(date);
      if(!activities.length)return;
      const columnIndex=dateIndex+2; // เจ้าหน้าที่ + สรุปตำแหน่ง
      const title=activities.map(row=>text(row?.title)).filter(Boolean).join(' / ')||'ออกหน่วย';
      Array.from(table.rows||[]).forEach(row=>{
        const cell=row.cells?.[columnIndex];
        if(cell)cell.classList.add('v374-outing-day');
      });
      const head=headRow.cells?.[columnIndex];
      if(head){
        head.dataset.v374OutingDate=date;
        head.dataset.v374OutingTitle=title;
        if(head.dataset.v374OriginalTitle===undefined)head.dataset.v374OriginalTitle=head.title||'';
        head.title=`ออกหน่วย${title&&title!=='ออกหน่วย'?`: ${title}`:''}`;
        if(!head.querySelector('.v374-outing-label')){
          const label=document.createElement('span');
          label.className='v374-outing-label';
          label.textContent='ออกหน่วย';
          head.appendChild(label);
        }
      }
    });
  }

  function rowTimestamp(row){
    const raw=row?.updated_at||row?.modified_at||row?.created_at||'';
    const value=Date.parse(raw);return Number.isFinite(value)?value:0;
  }
  function savedPositionMap(){
    const key=selectedMonth(),map=new Map();
    (Array.isArray(S()?.positions)?S().positions:[]).forEach((row,index)=>{
      const date=normDate(row?.work_date),staffId=normId(row?.staff_id),code=text(row?.position_code||row?.code);
      if(!date.startsWith(key)||!staffId||!code)return;
      const cellKey=`${date}|${staffId}`,previous=map.get(cellKey);
      const candidate={row,code,index,time:rowTimestamp(row)};
      if(!previous||candidate.time>previous.time||(candidate.time===previous.time&&candidate.index>previous.index))map.set(cellKey,candidate);
    });
    return map;
  }
  function matchingOption(select,code){
    const exact=Array.from(select?.options||[]).find(option=>text(option.value)===text(code));
    if(exact)return exact;
    const key=normCode(code);
    return Array.from(select?.options||[]).find(option=>key&&normCode(option.value)===key)||null;
  }
  function ensureOption(select,code){
    let option=matchingOption(select,code);
    if(option)return option;
    option=document.createElement('option');
    option.value=code;
    option.textContent=code;
    option.dataset.v374RestoredOption='1';
    select.appendChild(option);
    return option;
  }
  function interacting(select){return Number(select?.dataset?.v374InteractingUntil||0)>Date.now()||document.activeElement===select;}
  function syncInfoButton(cell,code){
    if(!cell||!code)return;
    let button=cell.querySelector('[data-v275-job]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='v275-info';
      button.textContent='i';
      const select=cell.querySelector('[data-v275-position-select]');
      select?.insertAdjacentElement('afterend',button);
    }
    button.dataset.v275Job=code;
  }
  function restoreSavedDropdowns(root=document){
    if(!adminPage())return;
    const saved=savedPositionMap();
    root.querySelectorAll?.('.v275-position-wrap [data-v275-position-cell]')?.forEach(cell=>{
      const select=cell.querySelector('[data-v275-position-select]');
      if(!select||interacting(select))return;
      const date=normDate(cell.dataset.date),staffId=normId(cell.dataset.staffId);
      const found=saved.get(`${date}|${staffId}`);
      if(!found)return;
      const current=text(select.value);
      const savedCode=text(found.code);
      if(current&&normCode(current)===normCode(savedCode))return;
      /* Only repair an empty/missing display. Never overwrite a user's visible pending choice. */
      if(current)return;
      const option=ensureOption(select,savedCode);
      select.value=option.value;
      option.selected=true;
      cell.dataset.v374RestoredCode=savedCode;
      syncInfoButton(cell,savedCode);
    });
  }

  function enhance(root=document){
    if(!targetPage())return;
    root.querySelectorAll?.('.v275-position-table')?.forEach(markOutingColumns);
    restoreSavedDropdowns(root);
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance(document);});
  }
  function markInteraction(target,duration=6000){
    const select=target?.closest?.('.v275-position-wrap [data-v275-position-select]');
    if(select)select.dataset.v374InteractingUntil=String(Date.now()+duration);
  }

  window.addEventListener('pointerdown',event=>markInteraction(event.target),true);
  window.addEventListener('focusin',event=>markInteraction(event.target),true);
  window.addEventListener('change',event=>{
    markInteraction(event.target,8000);
    setTimeout(queue,8500);
  },true);

  const style=document.createElement('style');
  style.id='v374-outing-column-and-position-display-style';
  style.textContent=`
    .v275-position-table th.v374-outing-day{background:#fecdd3!important;color:#9f1239!important;box-shadow:inset 0 -3px 0 #e11d48}
    .v275-position-table td.v374-outing-day{background:#fff1f2!important}
    .v275-position-table .v374-outing-day .v275-position-cell select,
    .v275-position-table .v374-outing-day .v275-mentor-cell select{background:#fff7f8!important;border-color:#fda4af!important}
    .v275-position-table .v374-outing-day .v275-slot-control{background:#fff7f8;border-radius:7px;padding:1px 2px}
    .v374-outing-label{display:block;margin-top:1px;color:#be123c;font-size:7px;font-weight:900;line-height:1.05;white-space:nowrap}
    .v275-position-table th.v374-outing-day.v373-compact-offday,
    .v275-position-table td.v374-outing-day.v373-compact-offday{background:#ffe4e6!important}
    @media(max-width:820px){.v374-outing-label{font-size:6px}}
  `;
  document.head.appendChild(style);

  const install=()=>{
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v374Observer){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v374Observer=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);
  document.addEventListener('click',()=>setTimeout(queue,0),true);

  window.cnmiV374={version:VERSION,enhance,markOutingColumns,restoreSavedDropdowns};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v374-outing-column-and-position-display-restore.js", error); }
;

/* Original source: patch-v377-staff-duty-tracking-and-menu-number-fix.js */
try {
/* CNMI Staff Planner V377
   Staff OT fixes:
   1) Menu 1 always shows the staff member's duty list and whether OT was tapped/requested.
   2) Staff-facing explanations point to menu 3: ขอ OT เพิ่ม / เวรปั่นเลือด.
*/
(function(){
  'use strict';
  const VERSION='V377_STAFF_DUTY_TRACKING_AND_MENU_NUMBER_FIX';
  if(window.__CNMI_V377_STAFF_DUTY_TRACKING_AND_MENU_NUMBER_FIX__)return;
  window.__CNMI_V377_STAFF_DUTY_TRACKING_AND_MENU_NUMBER_FIX__=true;

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function sid(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');}}
  function dutyLabel(code){try{return (DUTY_LABEL&&DUTY_LABEL[code])||code||'-';}catch(_){return code||'-';}}
  function thaiDate(date){try{return formatThaiDate(norm(date));}catch(_){return norm(date)||'-';}}
  function thaiMonth(key){try{const [y,m]=String(key||'').split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key||'-';}}
  function selectedMonth(){
    const raw=S()?.otMenuMonthV369||S()?.myDutyMonthFilter||S()?.monthKey||new Date().toISOString().slice(0,7);
    return /^\d{4}-\d{2}$/.test(String(raw).slice(0,7))?String(raw).slice(0,7):new Date().toISOString().slice(0,7);
  }
  function latest(rows){return (rows||[]).slice().sort((a,b)=>String(b?.created_at||b?.updated_at||'').localeCompare(String(a?.created_at||a?.updated_at||'')))[0]||null;}
  function isAttendanceOt(row){
    const text=`${row?.reason||''} ${row?.note||''} ${row?.device||''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|V220_OT_APPROVAL|V219_OT_REPAIR|V221_DUTY_DATE/i.test(text);
  }
  function statusText(row){
    const raw=String(row?.status||'').trim();
    const low=raw.toLowerCase();
    if(!raw||raw==='รออนุมัติ'||low==='pending')return 'รอ Admin อนุมัติ';
    if(raw==='อนุมัติ'||low==='approved')return 'อนุมัติแล้ว';
    if(raw==='ไม่อนุมัติ'||low==='rejected')return 'ไม่อนุมัติ';
    if(raw==='ส่งกลับแก้ไข'||/return|edit/i.test(raw))return 'ส่งกลับแก้ไข';
    return raw;
  }
  function statusClass(text){
    const t=String(text||'');
    if(/อนุมัติแล้ว/.test(t))return 'green';
    if(/ไม่อนุมัติ|ส่งกลับ/.test(t))return 'red';
    if(/รอ Admin|รออนุมัติ|แตะแล้ว/.test(t))return 'orange';
    return 'black';
  }
  function statusBadge(text){
    try{return badge(text,statusClass(text));}
    catch(_){return `<span class="badge ${esc(statusClass(text))}">${esc(text)}</span>`;}
  }
  function isCh4(code){return /^ช4(?:A|B)?$/.test(String(code||'').trim());}
  function isCh3(code){return /^ช3[AB]$/.test(String(code||'').trim());}
  function weekendHoliday(date){
    try{return (typeof isWeekend==='function'&&isWeekend(date))||(typeof isHolidayDate==='function'&&isHolidayDate(date));}
    catch(_){const d=new Date(`${norm(date)}T00:00:00`).getDay();return d===0||d===6;}
  }
  function timeText(date,codes,duties=[]){
    const exactTimes=[...new Set((duties||[]).map(x=>String(x?._effective_time_label||'').trim()).filter(Boolean))];
    if(exactTimes.length)return exactTimes.join(' + ');
    const effective=(duties||[]).filter(x=>Array.isArray(x?._effective_segments)&&x._effective_segments.length&&Number(x?._effective_hours)>0&&!isCh4(x?.duty_code));
    if(effective.length){
      const order=['morning','afternoon','night'],set=new Set(),hours=Math.round(effective.reduce((sum,x)=>sum+Number(x._effective_hours||0),0)*100)/100;
      effective.forEach(x=>(x._effective_segments||[]).forEach(s=>set.add(s)));
      const key=order.filter(s=>set.has(s)).join(',');
      if(codes.some(isCh3))return '08:00 - 16:00 (เวรหลัก 8 ชม.) + เวลาปั่นเลือดตามจริง';
      if(key==='morning')return '08:00 - 16:00';
      if(key==='afternoon')return '16:00 - 00:00';
      if(key==='night')return '00:00 - 08:00';
      if(key==='morning,afternoon')return '08:00 - 00:00';
      if(key==='afternoon,night')return '16:00 - 08:00 (+1 วัน)';
      if(key==='morning,night')return `ดึก-เช้า • ${hours} ชม.`;
      if(key==='morning,afternoon,night')return '08:00 - 08:00 (+1 วัน)';
      return `${hours} ชม.`;
    }
    if(codes.some(c=>/^ชบด/.test(c)))return weekendHoliday(date)?'08:00 - 08:00 (+1 วัน)':'16:00 - 08:00 (+1 วัน)';
    if(codes.some(isCh3))return '08:00 - 16:00 (เวรหลัก 8 ชม.) + เวลาปั่นเลือดตามจริง';
    if(codes.every(isCh4))return 'กรอกเวลาทำจริงในข้อ 3';
    return '08:00 - 16:00 (เวรหลัก 8 ชม.)';
  }
  function groupedDuties(){
    const staffId=sid(),month=selectedMonth(),assignments=S()?.rosterAssignments||[];
    let rows=[],usedEffective=false;
    try{
      const fn=window.cnmiTradeSegmentsV217?.effectiveAssignmentsForStaffDate;
      if(typeof fn==='function'){
        usedEffective=true;
        const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate();
        for(let day=1;day<=last;day++){
          const date=`${month}-${String(day).padStart(2,'0')}`;
          rows.push(...(fn(staffId,date,assignments)||[]));
        }
      }
    }catch(_){rows=[];}
    if(!usedEffective)rows=assignments.filter(a=>String(a?.staff_id||'')===staffId&&norm(a?.duty_date).startsWith(month));
    rows.sort((a,b)=>norm(a?.duty_date).localeCompare(norm(b?.duty_date))||String(a?.duty_code||'').localeCompare(String(b?.duty_code||''),'th'));
    const map=new Map();
    rows.forEach(row=>{const date=norm(row?.duty_date);if(!map.has(date))map.set(date,[]);map.get(date).push(row);});
    return {month,entries:[...map.entries()]};
  }
  function attendanceFor(staffId,date){
    return (S()?.attendance||[]).filter(a=>String(a?.staff_id||'')===staffId&&norm(a?.duty_date)===date);
  }
  function otFor(staffId,date){
    return (S()?.otRequests||[]).filter(r=>String(r?.staff_id||'')===staffId&&norm(r?.work_date)===date);
  }
  function buildTrackingCard(){
    const staffId=sid();
    const {month,entries}=groupedDuties();
    const cards=entries.map(([date,duties])=>{
      const codes=duties.map(a=>String(a?.duty_code||'').trim()).filter(Boolean);
      const otRows=otFor(staffId,date);
      const mainRequest=latest(otRows.filter(isAttendanceOt));
      const extraRequest=latest(otRows.filter(r=>!isAttendanceOt(r)));
      const hasMain=codes.some(code=>!isCh4(code));
      const needsExtra=codes.some(code=>isCh4(code)||isCh3(code));
      const attendance=attendanceFor(staffId,date);
      const mainStatus=!hasMain?'ไม่มีเวรหลักที่ต้องแตะ':(mainRequest?statusText(mainRequest):(attendance.length?'แตะแล้ว แต่ยังไม่พบรายการ OT':'ยังไม่ได้แตะยืนยันเวร'));
      const extraStatus=extraRequest?statusText(extraRequest):'ยังไม่ได้ขอ OT เพิ่ม';
      return `<article class="v377-duty-card">
        <div class="v377-duty-head"><div><span class="v377-duty-date">${esc(thaiDate(date))}</span><div class="v377-duty-codes">${duties.map(a=>`<span>${esc(a?._effective_label||dutyLabel(a?.duty_code))}</span>`).join('')}</div></div><span class="v377-time">${esc(timeText(date,codes,duties))}</span></div>
        <div class="v377-status-list">
          ${hasMain?`<div class="v377-status-row"><span>เวรหลัก — แตะยืนยันแล้วหรือยัง</span>${statusBadge(mainStatus)}</div>`:''}
          ${needsExtra?`<div class="v377-status-row"><span>ข้อ 3 ขอ OT เพิ่ม / เวรปั่นเลือด</span>${statusBadge(extraStatus)}</div>`:''}
        </div>
        <div class="v377-actions">
          ${hasMain?`<button type="button" class="ghost-btn" data-v377-open-confirm="${esc(date)}">${mainRequest?'ดูข้อ 2 ยืนยันเวร':'ไปข้อ 2 ยืนยันเวร'}</button>`:''}
          ${needsExtra?`<button type="button" class="primary-btn" data-v377-open-extra="${esc(date)}">${extraRequest?'ดู/กรอกเพิ่มในข้อ 3':'ไปข้อ 3 ขอ OT เพิ่ม'}</button>`:''}
        </div>
      </article>`;
    }).join('');
    return `<section class="card wide-card v377-duty-tracking-card" style="grid-column:1/-1">
      <div class="section-title"><div><h3>เวรของฉัน — แตะขอ OT แล้วหรือยัง</h3><p class="hint">แสดงเวรของเดือน ${esc(thaiMonth(month))} พร้อมแยกสถานะ “เวรหลัก” และ “ข้อ 3 ขอ OT เพิ่ม / เวรปั่นเลือด” ให้เห็นชัดเจน</p></div></div>
      ${entries.length?`<div class="v377-duty-grid">${cards}</div>`:'<div class="empty">ยังไม่มีเวรของฉันในเดือนนี้</div>'}
    </section>`;
  }
  function replaceStaffExplanations(html){
    return String(html||'')
      .replace(/กรอกเพิ่มในส่วนที่\s*2\s*ตามเวลาจริง/g,'กรอกเพิ่มในข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด” ตามเวลาจริง')
      .replace(/กรอก OT จริงในส่วนที่\s*2/g,'กรอก OT จริงในข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”')
      .replace(/เวลาจริงในส่วนที่\s*2/g,'เวลาจริงในข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”')
      .replace(/ใช้ส่วนที่\s*2\s*เพื่อขอ OT เพิ่ม/g,'ใช้ข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”')
      .replace(/ฟอร์ม “ขอ OT เพิ่ม \/ เวรปั่นเลือด”/g,'ข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”');
  }
  function enhance(html){
    if(isAdminSafe())return html;
    const active=String(S()?.otMenuV369||'staff-track');
    let output=replaceStaffExplanations(html);
    if(active!=='staff-track')return output;
    const tpl=document.createElement('template');
    tpl.innerHTML=output;
    const content=tpl.content.querySelector('.v369-ot-content');
    if(content){
      content.innerHTML=buildTrackingCard();
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }
    return output;
  }

  if(typeof previousRenderOtPage==='function'){
    const wrapped=function renderOtPageV377(){return enhance(previousRenderOtPage.apply(this,arguments));};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  document.addEventListener('click',function(e){
    const confirm=e.target?.closest?.('[data-v377-open-confirm]');
    if(confirm){
      e.preventDefault();
      S().myDutyDateV221=String(confirm.getAttribute('data-v377-open-confirm')||'').slice(0,10);
      S().otMenuV369='staff-confirm';
      S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
      return;
    }
    const extra=e.target?.closest?.('[data-v377-open-extra]');
    if(extra){
      e.preventDefault();
      S().myDutyDateV221=String(extra.getAttribute('data-v377-open-extra')||'').slice(0,10);
      S().otMenuV369='staff-extra';
      S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
    }
  },true);

  const style=document.createElement('style');
  style.id='v377-staff-duty-tracking-style';
  style.textContent=`
    .v377-duty-tracking-card{display:grid;gap:14px}.v377-duty-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v377-duty-card{display:grid;gap:12px;padding:15px;border:1px solid #d8e6f3;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 5px 14px rgba(30,64,175,.05)}
    .v377-duty-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v377-duty-date{display:block;font-size:1.06rem;font-weight:900;color:#20384f}.v377-duty-codes{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.v377-duty-codes span{padding:4px 8px;border-radius:999px;background:#eaf4ff;color:#1769b0;font-weight:850}.v377-time{max-width:48%;color:#5b7085;font-weight:750;text-align:right;line-height:1.35}
    .v377-status-list{display:grid;gap:8px}.v377-status-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:13px;background:#f4f8fc}.v377-status-row>span:first-child{font-weight:800;color:#35536c}.v377-actions{display:flex;gap:8px;flex-wrap:wrap}.v377-actions button{flex:1 1 180px}
    @media(max-width:760px){.v377-duty-grid{grid-template-columns:1fr}.v377-duty-card{padding:14px}.v377-duty-head{display:grid}.v377-time{max-width:none;text-align:left}.v377-status-row{align-items:flex-start;flex-direction:column}.v377-actions{display:grid;grid-template-columns:1fr}.v377-actions button{width:100%}}
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v377-staff-duty-tracking-and-menu-number-fix.js", error); }
;

/* Original source: patch-v378-daily-position-details-staff-color-clean.js */
try {
/* CNMI Staff Planner V378
   Daily daytime position display fixes only:
   1) Removes the confusing "เกินจากชุด Slot วันนี้" marker while keeping the saved row.
   2) Restores each staff member's configured color on daily-position names.
   3) Shows the full duty description inside every mobile/PWA position card.
   4) Shows the full duty description in the desktop table instead of an ellipsis.
   No Supabase/schema/OT/monthly Slot calculation changes.
*/
(function(){
  'use strict';
  const VERSION='V378_DAILY_POSITION_DETAILS_STAFF_COLOR_CLEAN';
  if(window.__CNMI_V378_DAILY_POSITION_DETAILS_STAFF_COLOR_CLEAN__)return;
  window.__CNMI_V378_DAILY_POSITION_DETAILS_STAFF_COLOR_CLEAN__=true;

  let queued=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function esc(v){
    try{if(typeof escapeHtml==='function')return escapeHtml(v==null?'':String(v));}catch(_){}
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function page(){return text(S()?.page);}
  function rows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return [];
  }
  function codeOf(row){return text(row?.position_code||row?.code);}
  function plannedId(row){return text(row?._planned_staff_id||row?.staff_id);}
  function personById(id){return (S()?.staff||[]).find(person=>text(person?.id)===text(id))||null;}
  function personName(id){
    const p=personById(id);
    return text(p?.nickname||p?.nick_name||p?.display_name||p?.full_name||p?.email)||'ว่าง';
  }
  function colorOf(id){
    const p=personById(id);
    try{if(typeof staffColor==='function')return staffColor(p||id)||'#e8f3ff';}catch(_){}
    try{if(typeof window.staffColor==='function')return window.staffColor(p||id)||'#e8f3ff';}catch(_){}
    return text(p?.color||p?.staff_color)||'#e8f3ff';
  }
  function foreground(bg){
    try{if(typeof textColorFor==='function')return textColorFor(bg);}catch(_){}
    try{if(typeof window.textColorFor==='function')return window.textColorFor(bg);}catch(_){}
    const hex=text(bg).replace('#','');
    if(!/^[0-9a-f]{6}$/i.test(hex))return'#203245';
    const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
    return((r*299+g*587+b*114)/1000)>145?'#203245':'#ffffff';
  }
  function useful(v){const s=text(v);return !!s&&!['-','--','—'].includes(s)&&!/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);}
  function positionMaster(code){
    const key=text(code).replace(/\s+/g,'').toLowerCase();
    for(const list of [S()?.positionMasters,S()?.dailyPositionMasters,S()?.positions]){
      if(!Array.isArray(list))continue;
      const found=list.find(item=>text(item?.code||item?.position_code).replace(/\s+/g,'').toLowerCase()===key);
      if(found)return found;
    }
    try{if(typeof positionByCode==='function')return positionByCode(code)||{};}catch(_){}
    try{if(typeof window.positionByCode==='function')return window.positionByCode(code)||{};}catch(_){}
    return{};
  }
  function detailOf(row,holder){
    const select=holder?.querySelector?.('select[data-position-row]');
    const code=codeOf(row)||text(select?.dataset?.positionCode)||text(holder?.querySelector?.('h2,h3,h4')?.textContent);
    const master=positionMaster(code);
    const direct=[row?.job_desc,row?.description,select?.dataset?.positionJob,master?.job_desc,master?.description]
      .map(text).find(useful);
    if(direct)return direct;
    try{
      const enriched=window.cnmiV372?.enrich?.({...master,...row},code);
      const fromPatch=text(enriched?.job_desc||enriched?.description);
      if(useful(fromPatch))return fromPatch;
    }catch(_){}
    return `ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${code||'ที่ได้รับมอบหมาย'}`;
  }

  function removeExtraSlotMarker(root){
    root.querySelectorAll?.('.badge,span,small')?.forEach(node=>{
      if(/^เกินจากชุด\s*Slot\s*วันนี้$/i.test(text(node.textContent)))node.remove();
    });
    root.querySelectorAll?.('.v225-extra-plan-row')?.forEach(node=>node.classList.remove('v225-extra-plan-row'));
  }

  function applyNameColor(holder,staffId){
    if(!holder)return;
    if(!staffId){
      holder.classList.remove('v378-has-staff-color');
      holder.style.removeProperty('--v378-staff-bg');
      holder.style.removeProperty('--v378-staff-fg');
      holder.removeAttribute('data-v378-staff-name');
      return;
    }
    const bg=colorOf(staffId),fg=foreground(bg);
    holder.classList.add('v378-has-staff-color');
    holder.style.setProperty('--v378-staff-bg',bg);
    holder.style.setProperty('--v378-staff-fg',fg);
    holder.dataset.v378StaffName=personName(staffId);
    holder.title=text(personById(staffId)?.full_name||personName(staffId));
  }

  function enhanceCards(area,data){
    const cards=Array.from(area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card'));
    cards.forEach((card,index)=>{
      const row=data[index]||{};
      const pid=plannedId(row);
      applyNameColor(card.querySelector('.v322-baseline-box'),pid);

      const job=detailOf(row,card);
      let detail=card.querySelector(':scope > .v378-position-duty-card');
      if(!detail){
        detail=document.createElement('section');
        detail.className='v378-position-duty-card';
      }
      const nextHtml=`<span class="v378-position-duty-label">หน้าที่วันนี้</span><p>${esc(job)}</p>`;
      if(detail.innerHTML!==nextHtml)detail.innerHTML=nextHtml;

      const baseline=card.querySelector(':scope > .v322-baseline-box');
      const label=card.querySelector(':scope > label');
      const actions=card.querySelector(':scope > .actions');
      const anchor=label||actions;
      if(baseline){
        if(baseline.nextElementSibling!==detail)baseline.insertAdjacentElement('afterend',detail);
      }else if(anchor){
        if(detail.nextElementSibling!==anchor)card.insertBefore(detail,anchor);
      }else if(detail.parentElement!==card){
        card.appendChild(detail);
      }

    });
  }

  function enhanceTable(area,data){
    const tableRows=Array.from(area.querySelectorAll('.v225-daily-position-table tbody tr'));
    tableRows.forEach((tr,index)=>{
      const row=data[index]||{};
      const pid=plannedId(row);
      applyNameColor(tr.querySelector('.v322-desktop-baseline')||tr.children?.[3],pid);

      const job=detailOf(row,tr);
      const cell=tr.lastElementChild;
      if(!cell)return;
      cell.classList.add('v378-full-job-cell');
      let full=cell.querySelector(':scope > .v378-job-text');
      const legacy=cell.querySelector(':scope > .v225-job-short,:scope > .v219-job-short');
      if(!full&&legacy){
        full=legacy;
        full.classList.remove('v225-job-short','v219-job-short','muted','v265-description-hidden');
        full.classList.add('v378-job-text');
        full.style.removeProperty('display');
      }
      if(!full){
        full=document.createElement('span');
        full.className='v378-job-text';
        cell.appendChild(full);
      }
      if(text(full.textContent)!==job)full.textContent=job;
      full.title=job;
    });
  }

  function enhance(root=document){
    if(page()!=='positions')return;
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page')||document.querySelector('.v225-positions-page,.v226-positions-page');
    if(!area)return;
    const data=rows();
    removeExtraSlotMarker(area);
    enhanceCards(area,data);
    enhanceTable(area,data);
    area.dataset.v378DailyPositionDisplay='1';
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance(document);});
  }

  const style=document.createElement('style');
  style.id='v378-daily-position-details-staff-color-style';
  style.textContent=`
    .v225-extra-plan-row td{background:inherit!important}
    .v322-baseline-box.v378-has-staff-color .v322-baseline-name,
    .v322-desktop-baseline.v378-has-staff-color b{
      display:inline-flex!important;align-items:center!important;justify-content:center!important;
      width:max-content!important;max-width:100%!important;min-width:42px!important;
      padding:6px 12px!important;border-radius:999px!important;
      background:var(--v378-staff-bg,#e8f3ff)!important;color:var(--v378-staff-fg,#203245)!important;
      border:1px solid rgba(31,50,69,.14)!important;font-weight:900!important;line-height:1.15!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.55)!important;
    }
    .position-mobile-card.v225-position-card > .v296-position-duty-preview,
    .position-mobile-card.v225-position-card > .v311-position-duty-preview,
    .position-mobile-card.v225-position-card > .v323-position-duty-preview{display:none!important}
    .v378-position-duty-card{
      display:block!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;
      padding:13px 14px!important;border:1px solid #d7e7f7!important;border-radius:15px!important;
      background:#f8fbff!important;color:#263b52!important;
    }
    .v378-position-duty-label{display:block;margin-bottom:5px;color:#2563eb;font-size:13px;font-weight:900}
    .v378-position-duty-card p{margin:0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.6!important;overflow-wrap:anywhere!important}
    .v225-daily-position-table td.v378-full-job-cell{min-width:360px!important;max-width:560px!important;white-space:normal!important;vertical-align:top!important}
    .v225-daily-position-table .v378-job-text{
      display:block!important;max-width:none!important;margin-top:6px!important;
      white-space:normal!important;overflow:visible!important;text-overflow:clip!important;
      line-height:1.55!important;color:#52657a!important;overflow-wrap:anywhere!important;
    }
    @media(max-width:760px){
      .position-mobile-card.v225-position-card{
        grid-template-areas:"head" "meta" "plan" "duty" "edit" "compare" "action"!important;
      }
      .position-mobile-card.v225-position-card > .v378-position-duty-card{grid-area:duty!important}
      .v322-baseline-box.v378-has-staff-color .v322-baseline-name{font-size:17px!important}
    }
  `;
  document.head.appendChild(style);

  const install=()=>{
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v378DailyPositionObserver){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v378DailyPositionObserver=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);
  document.addEventListener('change',event=>{if(event.target?.closest?.('#positionDateInput,select[data-position-row]'))setTimeout(queue,0);},true);

  window.cnmiV378={version:VERSION,enhance,detailOf,removeExtraSlotMarker};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v378-daily-position-details-staff-color-clean.js", error); }
;

/* Original source: patch-v379-daily-position-configured-order.js */
try {
/* CNMI Staff Planner V379 — revised build
   Daily position order follows the Slot count explicitly selected in the monthly table.

   Source priority for a normal workday:
   1) manual_day_slot_settings.target_slots (the "Slot" value selected by Admin in the monthly table)
   2) infer from the Admin-saved positions for that date when the setting has not loaded yet

   The selected count is synchronized to the legacy daily Slot store before the daily page renders,
   so existing V225/V226 rendering uses the correct 8-14 Slot template and its exact order.
   Saved staff assignments, descriptions, colors, OT, leave, and Supabase rows are not modified.
*/
(function(){
  'use strict';

  const VERSION='V379_DAILY_POSITION_MONTH_SLOT_SOURCE_R2';
  const DAILY_SLOT_KEY='cnmi_v225_daily_slot_set_by_date';
  const VALID_SET_MIN=8;
  const VALID_SET_MAX=14;

  if(window.__CNMI_V379_DAILY_POSITION_MONTH_SLOT_SOURCE_R2__)return;
  window.__CNMI_V379_DAILY_POSITION_MONTH_SLOT_SOURCE_R2__=true;

  let queued=false;
  let reRendering=false;
  let reordering=false;
  const loadingMonths=new Set();

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function normDate(v){return text(v).slice(0,10);}
  function page(){return text(S()?.page);}
  function dateValue(){return normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate||'');}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function keyOf(value){return text(value).replace(/\s+/g,'').toLowerCase();}
  function validCode(value){
    const k=keyOf(value);
    return !!k && k!=='รอตรวจสอบ' && !k.startsWith('__cnmi_slot_template');
  }
  function finiteNumber(v){const n=Number(v);return Number.isFinite(n)?n:null;}

  function configs(){
    try{
      const cfg=window.cnmiV224?.currentConfigs?.();
      if(cfg)return cfg;
    }catch(_){ }
    const runtime=window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218||window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS||{};
    return {day:runtime,outing:[]};
  }
  function daySetEntries(){
    const day=configs()?.day||{};
    const out=[];
    for(let n=VALID_SET_MIN;n<=VALID_SET_MAX;n++){
      const rows=Array.isArray(day[n])?day[n]:(Array.isArray(day[String(n)])?day[String(n)]:[]);
      if(rows.length)out.push({count:n,rows});
    }
    return out;
  }
  function selectedSetRows(count){
    const found=daySetEntries().find(item=>item.count===Number(count));
    return found?.rows||[];
  }
  function isOutingDate(date){
    try{if(typeof hasOutingSafe==='function'&&hasOutingSafe(date))return true;}catch(_){ }
    const rows=(S()?.positions||[]).filter(row=>normDate(row?.work_date)===date);
    return rows.some(row=>row?.is_outing===true||text(row?.zone)==='ออกหน่วย'||text(row?.eligibility_code).startsWith('OUTING:'));
  }

  function explicitTarget(date){
    const row=(S()?.manualDaySlotSettingsV273||[]).find(item=>normDate(item?.work_date)===date);
    const target=finiteNumber(row?.target_slots);
    if(target===null)return null;
    const rounded=Math.round(target);
    return daySetEntries().some(item=>item.count===rounded)?rounded:null;
  }
  function savedPlanRows(date){
    return (S()?.positions||[]).filter(row=>normDate(row?.work_date)===date&&validCode(codeOf(row)));
  }
  function inferTarget(date){
    const plan=savedPlanRows(date);
    if(!plan.length)return null;
    const wanted=new Set(plan.map(row=>keyOf(codeOf(row))).filter(Boolean));
    const candidates=daySetEntries();
    if(!candidates.length)return null;

    /* First use the exact number of distinct Slot codes saved in the monthly table. */
    const exact=candidates.filter(item=>item.count===wanted.size).sort((a,b)=>{
      const overlapA=a.rows.reduce((sum,row)=>sum+(wanted.has(keyOf(codeOf(row)))?1:0),0);
      const overlapB=b.rows.reduce((sum,row)=>sum+(wanted.has(keyOf(codeOf(row)))?1:0),0);
      return overlapB-overlapA;
    })[0];
    if(exact)return exact.count;

    /* Fallback for legacy/duplicate rows: choose the set that covers the saved plan best. */
    let best=null;
    candidates.forEach(item=>{
      const set=new Set(item.rows.map(row=>keyOf(codeOf(row))).filter(Boolean));
      let overlap=0;
      wanted.forEach(code=>{if(set.has(code))overlap++;});
      const missing=wanted.size-overlap;
      const extra=Math.max(0,set.size-overlap);
      const complete=missing===0?1:0;
      const score=(complete*100000)+(overlap*1000)-(missing*500)-(extra*10)-Math.abs(item.count-wanted.size);
      if(!best||score>best.score)best={count:item.count,score};
    });
    return best?.count||null;
  }
  function targetForDate(date){
    if(!date||isOutingDate(date))return null;
    return explicitTarget(date)??inferTarget(date);
  }

  function readDailyStore(){try{return JSON.parse(localStorage.getItem(DAILY_SLOT_KEY)||'{}')||{};}catch(_){return{};}}
  function syncLegacyDailyStore(date,target){
    if(!date||!target)return false;
    const store=readDailyStore();
    if(Number(store[date])===Number(target))return false;
    store[date]=Number(target);
    try{localStorage.setItem(DAILY_SLOT_KEY,JSON.stringify(store));return true;}catch(_){return false;}
  }

  function loadMonthSetting(date){
    const month=normDate(date).slice(0,7);
    if(!month||loadingMonths.has(month)||typeof window.cnmiV273?.loadSlotSettings!=='function')return;
    loadingMonths.add(month);
    Promise.resolve(window.cnmiV273.loadSlotSettings(month,false)).then(()=>{
      loadingMonths.delete(month);
      const current=dateValue();
      if(page()!=='positions'||!current||current.slice(0,7)!==month)return;
      const target=targetForDate(current);
      if(syncLegacyDailyStore(current,target))requestDailyRender();
      else queue(0);
    }).catch(err=>{
      loadingMonths.delete(month);
      console.warn(`[${VERSION}] load Slot setting failed`,err);
    });
  }

  function syncBeforeRender(){
    if(page()!=='positions')return false;
    const date=dateValue()||normDate(S()?.positionDate);
    if(!date)return false;
    const changed=syncLegacyDailyStore(date,targetForDate(date));
    loadMonthSetting(date);
    return changed;
  }

  function requestDailyRender(){
    if(reRendering||page()!=='positions')return;
    const fn=window.renderPage||(typeof renderPage==='function'?renderPage:null);
    if(typeof fn!=='function')return;
    reRendering=true;
    try{fn();}catch(err){console.warn(`[${VERSION}] re-render failed`,err);}
    finally{reRendering=false;}
  }

  /* Ensure the correct monthly Slot count is present before legacy V225/V226 builds the daily rows. */
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRenderPage==='function'&&!previousRenderPage.__v379MonthSlotSourceR2){
    const wrapped=function renderPageV379MonthSlotSource(){
      try{syncBeforeRender();}catch(err){console.warn(`[${VERSION}] pre-render sync failed`,err);}
      return previousRenderPage.apply(this,arguments);
    };
    wrapped.__v379MonthSlotSourceR2=true;
    wrapped.__v379Previous=previousRenderPage;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  function dailyRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return[];
  }
  function masterRank(){
    const list=(S()?.positionMasters||S()?.dailyPositionMasters||[]).filter(row=>validCode(codeOf(row)))
      .map((row,index)=>({row,index,order:finiteNumber(row?.sort_order??row?.order)??99999}))
      .sort((a,b)=>a.order-b.order||a.index-b.index);
    const map=new Map();
    list.forEach((entry,index)=>{const key=keyOf(codeOf(entry.row));if(key&&!map.has(key))map.set(key,index+1);});
    return map;
  }
  function orderedEntries(rows,date){
    const target=targetForDate(date);
    const rank=new Map();
    selectedSetRows(target).forEach((row,index)=>{const key=keyOf(codeOf(row));if(key&&!rank.has(key))rank.set(key,index+1);});
    const masters=masterRank();
    return rows.map((row,index)=>({row,index,key:keyOf(codeOf(row))})).sort((a,b)=>{
      const ar=rank.get(a.key)??99999;
      const br=rank.get(b.key)??99999;
      if(ar!==br)return ar-br;
      const am=masters.get(a.key)??99999;
      const bm=masters.get(b.key)??99999;
      if(am!==bm)return am-bm;
      return a.index-b.index;
    });
  }
  function setIndexes(holder,index){
    holder.querySelectorAll?.('[data-position-row]').forEach(node=>node.setAttribute('data-position-row',String(index)));
    ['data-v225-position-detail','data-v226-position-detail','data-v296-position-detail','data-position-detail-v219'].forEach(attr=>{
      holder.querySelectorAll?.(`[${attr}]`).forEach(node=>node.setAttribute(attr,String(index)));
    });
  }
  function reorderDaily(root=document){
    if(reordering||page()!=='positions')return false;
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page')||document.querySelector('.v225-positions-page,.v226-positions-page');
    if(!area)return false;
    const date=dateValue();
    const rows=dailyRows();
    if(!date||!rows.length)return false;
    const entries=orderedEntries(rows,date);
    if(!entries.length)return false;

    const tableBody=area.querySelector('.v225-daily-position-table tbody');
    const cardList=area.querySelector('.v225-mobile-position-list');
    const tableNodes=tableBody?Array.from(tableBody.children):[];
    const cardNodes=cardList?Array.from(cardList.children).filter(node=>node.matches?.('.position-mobile-card,.v225-position-card')):[];
    if(tableNodes.length!==rows.length&&cardNodes.length!==rows.length)return false;

    const changed=entries.some((entry,index)=>entry.index!==index);
    reordering=true;
    try{
      const sorted=entries.map(entry=>entry.row);
      window.__CNMI_V225_DAILY_POSITION_ROWS__=sorted;
      if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))window.__CNMI_V226_DAILY_POSITION_ROWS__=sorted;
      window.__CNMI_V379_DAILY_POSITION_ROWS__=sorted;

      if(tableNodes.length===rows.length){
        if(changed)entries.forEach((entry,index)=>{const node=tableNodes[entry.index];if(node){tableBody.appendChild(node);setIndexes(node,index);}});
        else tableNodes.forEach((node,index)=>setIndexes(node,index));
      }
      if(cardNodes.length===rows.length){
        if(changed)entries.forEach((entry,index)=>{const node=cardNodes[entry.index];if(node){cardList.appendChild(node);setIndexes(node,index);}});
        else cardNodes.forEach((node,index)=>setIndexes(node,index));
      }
      area.dataset.v379MonthSlotCount=String(targetForDate(date)||'');
      area.dataset.v379MonthSlotSource=explicitTarget(date)!=null?'monthly-setting':'saved-plan';
      if(changed){try{window.cnmiV378?.enhance?.(document);}catch(_){ }}
      return changed;
    }finally{reordering=false;}
  }

  function apply(){
    if(page()!=='positions')return;
    const date=dateValue()||normDate(S()?.positionDate);
    if(!date)return;
    const changed=syncLegacyDailyStore(date,targetForDate(date));
    loadMonthSetting(date);
    if(changed){requestDailyRender();return;}
    reorderDaily(document);
  }
  function queue(delay=0){
    if(delay>0){setTimeout(()=>queue(0),delay);return;}
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  function install(){
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v379MonthSlotObserverR2){
      const observer=new MutationObserver(()=>queue(0));
      observer.observe(root,{childList:true,subtree:true});
      root.__v379MonthSlotObserverR2=observer;
    }
    [0,80,250,700,1500].forEach(queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',()=>[0,120,600].forEach(queue));
  document.addEventListener('change',event=>{
    if(event.target?.closest?.('#positionDateInput'))[0,80,300].forEach(queue);
  },true);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-nav="positions"],[data-page="positions"],button,a'))queue(120);
  },true);

  window.cnmiV379={
    version:VERSION,
    targetForDate,
    explicitTarget,
    inferTarget,
    syncBeforeRender,
    reorderDaily
  };
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v379-daily-position-configured-order.js", error); }
;

/* Original source: patch-v380-compact-ot-detail-text.js */
try {
/* CNMI Staff Planner V380
   - Makes OT reason/detail text concise without changing saved data.
   - Removes duplicated date/time/hour/system metadata from display only.
   - Keeps custom notes and collapses rate-calculation details behind a disclosure.
*/
(function(){
  'use strict';
  const VERSION='V380_COMPACT_OT_DETAIL_TEXT';
  if(window.__CNMI_V380_COMPACT_OT_DETAIL_TEXT__)return;
  window.__CNMI_V380_COMPACT_OT_DETAIL_TEXT__=true;

  function text(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function norm(v){return text(v).toLowerCase().replace(/[\s|:：•()\[\]{}.,/\\-]+/g,'');}
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    catch(_){return String(v==null?'':v);}
  }
  function tokens(value){return String(value||'').split('|').map(text).filter(Boolean);}
  function extractDuty(value){
    const raw=String(value||'');
    let m=raw.match(/เวรที่คิดอัตโนมัติ\s*[:：]\s*([^|]+)/i);
    if(m&&text(m[1]))return text(m[1]);
    m=raw.match(/ประเภทเวร\s*[:：]\s*([^|]+)/i);
    if(m&&text(m[1]))return text(m[1]);
    m=raw.match(/(?:อยู่เวร|เวร)\s*(ชบด\s*[123]|ช3A|ช3B|ช4|ช9)\b/i);
    return m?text(m[1]).replace(/\s+/g,''):'';
  }
  function isGeneratedToken(token){
    const t=text(token);
    return !t
      || /^จำนวนเวลา\s*OT\s*[:：]/i.test(t)
      || /^ชั่วโมงที่ต้องการเบิก\s*[:：]/i.test(t)
      || /^ชั่วโมงเบิก\s*[:：]/i.test(t)
      || /^จำนวนชั่วโมง\s*[:：]/i.test(t)
      || /^HR_HOURS\s*=/i.test(t)
      || /^สร้างจากส่วนที่\s*[12]/i.test(t)
      || /^เวรที่คิดอัตโนมัติ\s*[:：]/i.test(t)
      || /^ประเภทเวร\s*[:：]/i.test(t)
      || /^เวลาเวร\s+/i.test(t)
      || /^Staff\s*ยืนยันจากวันที่ที่เลือก/i.test(t)
      || /^ระบบคิด\s*OT\s*.*อัตโนมัติ/i.test(t)
      || /^รอบเบิก\s+/i.test(t)
      || /^วันที่(?:เริ่ม|สิ้นสุด|อยู่เวร)\s*/i.test(t)
      || /^เวลา(?:เริ่ม|สิ้นสุด)\s*[0-2]?\d:[0-5]\d/i.test(t)
      || /^\[OT_RATE_TYPE=(?:MT|CLERK)\]$/i.test(t)
      || /^\[DONOR_HELPER_SLOT=/i.test(t)
      || /^V\d+[_-]/i.test(t);
  }
  function cleanToken(token){
    let t=text(token)
      .replace(/^หมายเหตุ\s*[:：]\s*/i,'')
      .replace(/\[OT_RATE_TYPE=(?:MT|CLERK)\]/ig,'')
      .replace(/\[DONOR_HELPER_SLOT=[^\]]+\]/ig,'')
      .replace(/HR_HOURS\s*=\s*\d+(?:\.\d+)?/ig,'')
      .replace(/\s{2,}/g,' ')
      .replace(/^[•|,;:\-\s]+|[•|,;:\-\s]+$/g,'')
      .trim();
    return isGeneratedToken(t)?'':t;
  }
  function compactReason(reason,note){
    const rawReason=text(reason)||'-';
    const rawNote=String(note||'');
    const all=`${rawReason} | ${rawNote}`;
    const duty=extractDuty(all);
    const attendance=/ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|เวรที่คิดอัตโนมัติ|ประเภทเวร\s*[:：]/i.test(all);
    let main=rawReason
      .replace(/\s*\(ส่วนที่\s*1\)\s*/ig,' ')
      .replace(/^ยืนยันอยู่เวรโดย\s*Admin$/i,'อยู่เวรตามตาราง')
      .replace(/^ยืนยันอยู่เวรตามตาราง$/i,'อยู่เวรตามตาราง')
      .trim()||'-';
    if(attendance)main=duty?`อยู่เวร ${duty}`:'อยู่เวรตามตาราง';

    const seen=new Set();
    const details=[];
    tokens(rawNote).forEach(token=>{
      const cleaned=cleanToken(token);
      if(!cleaned)return;
      const key=norm(cleaned);
      if(!key||seen.has(key))return;
      const mainKey=norm(main),reasonKey=norm(rawReason);
      if(key===mainKey||key===reasonKey)return;
      if((mainKey.length>5&&key.includes(mainKey))||(key.length>5&&mainKey.includes(key)))return;
      seen.add(key);details.push(cleaned);
    });
    let detail=details.join(' • ');
    if(/^(อื่นๆ|อื่น ๆ|OT เพิ่ม|ขอ OT เพิ่ม)$/i.test(main)&&detail){main=detail;detail='';}
    return {main,detail};
  }

  // All existing OT tables call this helper dynamically, so replacing it shortens
  // both the desktop table and mobile cards without touching the database row.
  const helpers=window.v176OtReasonHelpers||{};
  helpers.compactOtReasonText176=function(row){return compactReason(row?.reason,row?.note);};
  window.v176OtReasonHelpers=helpers;

  function directChild(parent,selector){
    if(!parent)return null;
    return Array.from(parent.children||[]).find(el=>el.matches&&el.matches(selector))||null;
  }
  function compactReasonCell(cell){
    if(!cell||cell.dataset.v380Compact==='1')return;
    const bold=directChild(cell,'b,strong');
    const muted=directChild(cell,'.muted');
    if(!bold)return;
    const result=compactReason(bold.textContent,muted?.textContent||'');
    bold.textContent=result.main;
    bold.classList.add('v380-reason-main');
    if(muted){
      if(result.detail){muted.textContent=result.detail;muted.classList.add('v380-reason-detail');}
      else muted.remove();
    }else if(result.detail){
      const span=document.createElement('span');
      span.className='muted v380-reason-detail';
      span.textContent=result.detail;
      bold.insertAdjacentElement('afterend',span);
    }
    cell.dataset.v380Compact='1';
  }
  function compactTable(table){
    if(!table)return;
    const headers=Array.from(table.querySelectorAll('thead th'));
    const index=headers.findIndex(th=>/เหตุผล/.test(text(th.textContent)));
    if(index<0)return;
    Array.from(table.querySelectorAll('tbody tr')).forEach(row=>compactReasonCell(row.children?.[index]));
    table.classList.add('v380-compact-ot-table');
  }
  function compactMobileCard(card){
    if(!card||card.dataset.v380Compact==='1')return;
    const blocks=Array.from(card.children||[]);
    const reasonBlock=blocks.find(el=>{
      if(el.classList?.contains('v348-card-head')||el.classList?.contains('v348-hour-pair'))return false;
      return !!directChild(el,'b,strong');
    });
    if(!reasonBlock)return;
    const bold=directChild(reasonBlock,'b,strong');
    const muted=directChild(reasonBlock,'.muted');
    let note='';let timePart='';
    if(muted){
      const raw=text(muted.textContent);
      const split=raw.indexOf(' • ');
      if(split>=0){timePart=raw.slice(0,split);note=raw.slice(split+3);}else timePart=raw;
    }
    const result=compactReason(bold.textContent,note);
    bold.textContent=result.main;
    bold.classList.add('v380-reason-main');
    if(muted){
      muted.textContent=[timePart,result.detail].filter(Boolean).join(' • ');
      if(!muted.textContent)muted.remove();
      else muted.classList.add('v380-reason-detail');
    }
    card.dataset.v380Compact='1';
  }
  function collapseRateBox(box){
    if(!box||box.closest('details.v380-rate-details'))return;
    const details=document.createElement('details');
    details.className='v380-rate-details';
    const summary=document.createElement('summary');
    summary.textContent='ดูที่มาและสูตรเรท';
    box.parentNode.insertBefore(details,box);
    details.append(summary,box);
  }
  function compactRoot(root){
    const scope=root?.querySelectorAll?root:document;
    scope.querySelectorAll('table').forEach(compactTable);
    scope.querySelectorAll('.v348-ot-card').forEach(compactMobileCard);
    scope.querySelectorAll('.v348-trade-box,.v350-helper-box').forEach(collapseRateBox);
  }

  // V348 has an internal renderer. Wrap the public renderer for V369 and also
  // observe replacements made by the internal renderer.
  if(window.cnmiV348?.detailRows){
    const original=window.cnmiV348.detailRows;
    window.cnmiV348.detailRows=function(rows){
      const tpl=document.createElement('template');
      tpl.innerHTML=String(original.call(this,rows)||'');
      compactRoot(tpl.content);
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    };
  }

  let queued=false;
  function queueCompact(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;compactRoot(document);});
  }
  document.addEventListener('DOMContentLoaded',queueCompact,{once:true});
  const target=document.getElementById('pageContent')||document.body;
  if(target&&typeof MutationObserver==='function'){
    new MutationObserver(queueCompact).observe(target,{childList:true,subtree:true});
  }
  [0,120,500,1200].forEach(ms=>setTimeout(queueCompact,ms));

  const style=document.createElement('style');
  style.textContent=`
    .v380-compact-ot-table th,.v380-compact-ot-table td{vertical-align:top}
    .v380-compact-ot-table .v380-reason-main{line-height:1.35}
    .v380-reason-detail{display:block;margin-top:3px;line-height:1.4;color:#6a7c90}
    .v348-desktop-detail table{min-width:760px!important}
    .v348-desktop-detail th:nth-child(3){min-width:230px!important;width:34%!important}
    .v347-detail-table table{min-width:760px}
    .v380-rate-details{margin-top:7px;border:1px solid #d8e5f0;border-radius:10px;background:#f8fbfe;overflow:hidden}
    .v380-rate-details>summary{cursor:pointer;padding:8px 10px;font-weight:800;color:#2572a8;list-style:none}
    .v380-rate-details>summary::-webkit-details-marker{display:none}
    .v380-rate-details>summary:after{content:'⌄';float:right}
    .v380-rate-details[open]>summary:after{content:'⌃'}
    .v380-rate-details>.v348-trade-box,.v380-rate-details>.v350-helper-box{margin:0;border:0;border-top:1px solid #d8e5f0;border-radius:0;min-width:0}
    @media(max-width:900px){
      .v380-reason-detail{font-size:13px}
      .v348-ot-card{gap:8px}
      .v348-ot-card .v380-reason-main{font-size:16px}
    }
  `;
  document.head.appendChild(style);
  window.cnmiV380={version:VERSION,compactReason,compactRoot};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v380-compact-ot-detail-text.js", error); }
;

/* Original source: patch-v381-daily-position-slot-metadata-source.js */
try {
/* CNMI Staff Planner V381
   Daily position metadata must follow the currently configured Slot set.

   Fixes a mismatch where the daily page could show an old break time/detail saved
   inside daily_positions, while Position Management and the monthly legend already
   showed the latest Slot configuration.

   Scope:
   - Keeps the selected monthly Slot count/order from V379.
   - Keeps the saved staff assignment.
   - Uses zone, break time, main rule, and duty description from the current Slot
     configuration for the selected date.
   - Updates form datasets so the next Admin save writes the current metadata.
   - No SQL/schema change and no automatic database write.
*/
(function(){
  'use strict';

  const VERSION='V381_DAILY_POSITION_SLOT_METADATA_SOURCE';
  if(window.__CNMI_V381_DAILY_POSITION_SLOT_METADATA_SOURCE__)return;
  window.__CNMI_V381_DAILY_POSITION_SLOT_METADATA_SOURCE__=true;

  let queued=false;
  let applying=false;
  let loading=false;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function page(){return text(S()?.page);}
  function normDate(v){
    try{if(typeof window.normalizeDateKey==='function')return text(window.normalizeDateKey(v)).slice(0,10);}catch(_){ }
    return text(v).slice(0,10);
  }
  function dateValue(){return normDate(document.getElementById('positionDateInput')?.value||S()?.positionDate||'');}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function keyOf(v){return text(v).replace(/\s+/g,'').toLowerCase();}
  function useful(v){const s=text(v);return !!s&&!['-','--','—'].includes(s);}
  function isOutingDate(date){
    try{if(typeof window.hasOutingSafe==='function'&&window.hasOutingSafe(date))return true;}catch(_){ }
    try{if(typeof hasOutingSafe==='function'&&hasOutingSafe(date))return true;}catch(_){ }
    return (S()?.positions||[]).some(row=>normDate(row?.work_date)===date&&(row?.is_outing===true||text(row?.zone)==='ออกหน่วย'||text(row?.eligibility_code).startsWith('OUTING:')));
  }

  function targetForDate(date){
    try{
      const n=Number(window.cnmiV379?.targetForDate?.(date));
      if(Number.isFinite(n)&&n>0)return n;
    }catch(_){ }
    const row=(S()?.manualDaySlotSettingsV273||[]).find(item=>normDate(item?.work_date)===date);
    const n=Number(row?.target_slots);
    return Number.isFinite(n)&&n>0?Math.round(n):null;
  }

  function configs(){
    try{return window.cnmiV224?.currentConfigs?.()||null;}catch(_){return null;}
  }
  function rowsForDate(date){
    const cfg=configs();
    if(!cfg)return[];
    if(isOutingDate(date)){
      const n=targetForDate(date)||14;
      const bucket=n<=12?12:(n<=13?13:14);
      return Array.isArray(cfg?.outing_by_count?.[bucket])?cfg.outing_by_count[bucket]:(Array.isArray(cfg?.outing)?cfg.outing:[]);
    }
    const n=targetForDate(date);
    const rows=n!=null?(cfg?.day?.[n]||cfg?.day?.[String(n)]):null;
    return Array.isArray(rows)?rows:[];
  }
  function masterFor(code){
    const key=keyOf(code);
    for(const list of [S()?.positionMasters,S()?.dailyPositionMasters]){
      if(!Array.isArray(list))continue;
      const found=list.find(row=>keyOf(codeOf(row))===key&&row?.is_active!==false&&!row?.deleted_at);
      if(found)return found;
    }
    return null;
  }
  function templateFor(code,date){
    const key=keyOf(code);
    const configured=rowsForDate(date).find(row=>keyOf(codeOf(row))===key);
    return configured||masterFor(code)||null;
  }
  function metadataFor(row,date){
    const code=codeOf(row);
    const src=templateFor(code,date)||{};
    return {
      code,
      zone: useful(src?.zone)?text(src.zone):text(row?.zone),
      break_time: useful(src?.break_time)?text(src.break_time):text(row?.break_time||'-'),
      main_rule: useful(src?.main_rule||src?.required_role)?text(src.main_rule||src.required_role):text(row?.main_rule||row?.required_role||'-'),
      job_desc: useful(src?.job_desc||src?.description||src?.detail)?text(src.job_desc||src.description||src.detail):text(row?.job_desc||row?.description||'-')
    };
  }

  function dailyArrays(){
    const out=[];
    const add=list=>{if(Array.isArray(list)&&!out.includes(list))out.push(list);};
    add(window.__CNMI_V225_DAILY_POSITION_ROWS__);
    add(window.__CNMI_V226_DAILY_POSITION_ROWS__);
    add(window.__CNMI_V379_DAILY_POSITION_ROWS__);
    return out;
  }
  function syncRows(date){
    let changed=false;
    dailyArrays().forEach(list=>list.forEach(row=>{
      const meta=metadataFor(row,date);
      ['zone','break_time','main_rule','job_desc'].forEach(key=>{
        if(text(row?.[key])!==text(meta[key])){row[key]=meta[key];changed=true;}
      });
    }));
    return changed;
  }

  function updateSelect(select,meta){
    if(!select)return;
    if(text(select.dataset.positionZone)!==meta.zone)select.dataset.positionZone=meta.zone;
    if(text(select.dataset.positionBreak)!==meta.break_time)select.dataset.positionBreak=meta.break_time;
    if(text(select.dataset.positionRule)!==meta.main_rule)select.dataset.positionRule=meta.main_rule;
    if(text(select.dataset.positionJob)!==meta.job_desc)select.dataset.positionJob=meta.job_desc;
  }
  function updateTable(area,rows,date){
    area.querySelectorAll('.v225-daily-position-table tbody tr').forEach((tr,index)=>{
      const row=rows[index]||{};
      const select=tr.querySelector('select[data-position-row]');
      const code=codeOf(row)||text(select?.dataset?.positionCode)||text(tr.children?.[1]?.textContent);
      const meta=metadataFor({...row,position_code:code},date);
      if(tr.children?.[0]&&text(tr.children[0].textContent)!==meta.zone)tr.children[0].textContent=meta.zone;
      if(tr.children?.[2]&&text(tr.children[2].textContent)!==meta.break_time)tr.children[2].textContent=meta.break_time;
      if(tr.children?.[5]&&text(tr.children[5].textContent)!==meta.main_rule)tr.children[5].textContent=meta.main_rule;
      const job=tr.querySelector('.v378-job-text,.v225-job-short,.v219-job-short');
      if(job&&text(job.textContent)!==meta.job_desc)job.textContent=meta.job_desc;
      updateSelect(select,meta);
    });
  }
  function updateCards(area,rows,date){
    area.querySelectorAll('.v225-mobile-position-list > .position-mobile-card,.v225-mobile-position-list > .v225-position-card').forEach((card,index)=>{
      const row=rows[index]||{};
      const select=card.querySelector('select[data-position-row]');
      const code=codeOf(row)||text(select?.dataset?.positionCode)||text(card.querySelector('h2,h3,h4')?.textContent);
      const meta=metadataFor({...row,position_code:code},date);
      const metaNode=Array.from(card.children||[]).find(node=>node?.classList?.contains('muted')&&/^พัก/.test(text(node.textContent)));
      const nextMeta=`พัก ${meta.break_time} • ${meta.main_rule}`;
      if(metaNode&&text(metaNode.textContent)!==nextMeta)metaNode.textContent=nextMeta;
      const duty=card.querySelector('.v378-position-duty-card p');
      if(duty&&text(duty.textContent)!==meta.job_desc)duty.textContent=meta.job_desc;
      updateSelect(select,meta);
    });
  }

  function currentRows(){
    if(Array.isArray(window.__CNMI_V226_DAILY_POSITION_ROWS__))return window.__CNMI_V226_DAILY_POSITION_ROWS__;
    if(Array.isArray(window.__CNMI_V225_DAILY_POSITION_ROWS__))return window.__CNMI_V225_DAILY_POSITION_ROWS__;
    return[];
  }
  function apply(root=document){
    if(applying||page()!=='positions')return false;
    const date=dateValue();
    const area=root.querySelector?.('.v225-positions-page,.v226-positions-page')||document.querySelector('.v225-positions-page,.v226-positions-page');
    if(!date||!area)return false;
    applying=true;
    try{
      syncRows(date);
      const rows=currentRows();
      updateTable(area,rows,date);
      updateCards(area,rows,date);
      area.dataset.v381SlotMetadataSource='configured-slot';
      try{window.cnmiV378?.enhance?.(document);}catch(_){ }
      return true;
    }finally{applying=false;}
  }
  function queue(delay=0){
    if(delay>0){setTimeout(()=>queue(0),delay);return;}
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply(document);});
  }
  async function ensureConfigs(){
    if(loading||typeof window.cnmiV224?.loadDbConfigs!=='function')return;
    loading=true;
    try{await window.cnmiV224.loadDbConfigs(false);}catch(err){console.warn(`[${VERSION}] Slot config load skipped`,err);}
    finally{loading=false;[0,80,250].forEach(queue);}
  }
  function install(){
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v381SlotMetadataObserver){
      const observer=new MutationObserver(()=>queue(0));
      observer.observe(root,{childList:true,subtree:true});
      root.__v381SlotMetadataObserver=observer;
    }
    ensureConfigs();
    [0,100,350,900,1800].forEach(queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',()=>{ensureConfigs();[0,120,600].forEach(queue);});
  document.addEventListener('change',event=>{
    if(event.target?.closest?.('#positionDateInput,select[data-position-row]'))[0,80,250].forEach(queue);
  },true);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-nav="positions"],[data-page="positions"],button,a'))queue(120);
  },true);

  window.cnmiV381={version:VERSION,apply,templateFor,metadataFor,rowsForDate};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v381-daily-position-slot-metadata-source.js", error); }
;

/* Original source: patch-v388-outing-color-only.js */
try {
/* CNMI Staff Planner V388
   Scope: monthly daytime-position display/export color only.
   - Restores the V386 baseline behavior.
   - Adds the red outing-day column color without changing hasOuting(), slots,
     position descriptions, saved positions, leave, OT, or Supabase data.
*/
(function(){
  'use strict';
  const VERSION='V388_OUTING_COLOR_ONLY';
  if(window.__CNMI_V388_OUTING_COLOR_ONLY__)return;
  window.__CNMI_V388_OUTING_COLOR_ONLY__=true;

  let queued=false;
  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function text(v){return String(v==null?'':v).trim();}
  function normDate(v){
    try{if(typeof normalizeDateKey==='function')return text(normalizeDateKey(v)).slice(0,10);}catch(_){/* noop */}
    return text(v).slice(0,10);
  }
  function validMonth(v){const key=text(v).slice(0,7);return /^\d{4}-\d{2}$/.test(key)?key:'';}
  function currentPage(){return text(S()?.page);}
  function isTargetPage(){return currentPage()==='positionMonth'||currentPage()==='positionMonthView';}
  function selectedMonth(){
    const input=document.getElementById(currentPage()==='positionMonth'?'positionMonthInput':'positionMonthViewInput');
    return validMonth(input?.value)||validMonth(currentPage()==='positionMonth'?S()?.positionMonthKey:S()?.positionMonthViewKey)||validMonth(S()?.monthKey);
  }
  function dateInRange(date,start,end){
    const d=normDate(date),s=normDate(start),e=normDate(end||start);
    return !!d&&!!s&&s<=d&&d<=(e||s);
  }
  function activitySaysOuting(date){
    return (Array.isArray(S()?.activities)?S().activities:[]).some(row=>
      text(row?.event_type)==='ออกหน่วย'&&dateInRange(date,row?.start_date||row?.date,row?.end_date||row?.start_date||row?.date)
    );
  }
  function cellHasPreparation(cell){
    const value=text(cell?.innerText||cell?.textContent).toLowerCase().replace(/\s+/g,'');
    return value.includes('dr-preparation')||value.includes('drpreparation');
  }
  function columnHasPreparation(table,columnIndex){
    return Array.from(table?.tBodies||[]).some(body=>Array.from(body.rows||[]).some(row=>cellHasPreparation(row.cells?.[columnIndex])));
  }
  function parseDay(cell){
    const match=text(cell?.innerText||cell?.textContent).match(/^(\d{1,2})/);
    const day=match?Number(match[1]):NaN;
    return Number.isInteger(day)&&day>=1&&day<=31?day:null;
  }
  function clearOwnMarks(table){
    table.querySelectorAll('.v388-outing-color-only').forEach(node=>node.classList.remove('v388-outing-color-only'));
    table.querySelectorAll('.v388-outing-label-only').forEach(node=>node.remove());
  }
  function markTable(table){
    if(!table)return;
    const key=selectedMonth();
    const head=table.tHead?.rows?.[0];
    if(!key||!head)return;
    clearOwnMarks(table);

    Array.from(head.cells||[]).forEach((headCell,columnIndex)=>{
      const day=parseDay(headCell);
      if(!day)return;
      const date=`${key}-${String(day).padStart(2,'0')}`;
      const outing=activitySaysOuting(date)||columnHasPreparation(table,columnIndex);
      if(!outing)return;

      Array.from(table.rows||[]).forEach(row=>row.cells?.[columnIndex]?.classList.add('v388-outing-color-only'));
      if(!headCell.querySelector('.v374-outing-label,.v388-outing-label-only')){
        const label=document.createElement('span');
        label.className='v388-outing-label-only';
        label.textContent='ออกหน่วย';
        headCell.appendChild(label);
      }
    });
  }
  function enhance(){
    if(!isTargetPage())return;
    document.querySelectorAll('.v275-position-table').forEach(table=>{
      if(table.closest('[data-v297-export-sandbox="1"]')) return;
      markTable(table);
    });
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{queued=false;enhance();}));
  }

  const style=document.createElement('style');
  style.id='v388-outing-color-only-style';
  style.textContent=`
    .v275-position-table th.v388-outing-color-only{background:#fecdd3!important;color:#9f1239!important;box-shadow:inset 0 -3px 0 #e11d48!important}
    .v275-position-table td.v388-outing-color-only{background:#fff1f2!important}
    .v275-position-table .v388-outing-color-only .v275-position-cell select,
    .v275-position-table .v388-outing-color-only .v275-mentor-cell select{background:#fff7f8!important;border-color:#fda4af!important}
    .v388-outing-label-only{display:block;margin-top:1px;color:#be123c;font-size:7px;font-weight:900;line-height:1.05;white-space:nowrap}
    @media(max-width:820px){.v388-outing-label-only{font-size:6px}}
  `;
  document.head.appendChild(style);

  const install=()=>{
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v388OutingColorObserver){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v388OutingColorObserver=observer;
    }
    queue();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',queue);
  document.addEventListener('change',event=>{if(event.target?.closest?.('.v275-page'))setTimeout(queue,120);},true);

  window.cnmiV388={version:VERSION,enhance,markTable};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v388-outing-color-only.js", error); }
;

/* Original source: patch-v396-training-integrated.js */
try {
/* CNMI Staff Planner V426
 * Training is integrated into the existing activity form.  There is no second
 * "add training activity" page and no new-staff form in this version.
 */
(function () {
  'use strict';
  if (window.__CNMI_V396_TRAINING_INTEGRATED__) return;
  window.__CNMI_V396_TRAINING_INTEGRATED__ = true;

  const S = () => window.state || state;
  const DB = () => window.sb || sb;
  const esc = v => typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const idEq = (a,b) => String(a || '') === String(b || '');
  const staffOf = id => (S().staff || []).find(x => idEq(x.id,id)) || {};
  const staffName = id => { const x = staffOf(id); return x.nickname || x.full_name || x.email || '-'; };
  const dateKey = v => {
    const raw = String(v || '').trim();
    if (!raw) return '';
    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (m) {
      let year = Number(m[3]);
      if (year > 2400) year -= 543;
      return `${year}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw.slice(0,10);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dateLabel = v => v ? (typeof formatThaiDate === 'function' ? formatThaiDate(v) : v) : '-';
  const dateTimeLabel = v => v ? (typeof formatThaiDateTime === 'function' ? formatThaiDateTime(v) : v) : '-';
  const actor = () => typeof currentStaffId === 'function' ? currentStaffId() : S().profile?.id;
  const isManager = () => (typeof isAdmin === 'function' && isAdmin()) || S().profile?.staff_type === 'แพทย์' || ['doctor','physician'].includes(String(S().profile?.role || '').toLowerCase());
  const TABLE = 'activity_training_records_v396';

  function trainingRows() { return Array.isArray(S().trainingRecords) ? S().trainingRecords.filter(x => x.is_included !== false && x.form_type === 'existing') : []; }
  function activity(id) { return (S().activities || []).find(x => idEq(x.id,id)); }
  function rowItems() { return trainingRows().map(r => ({ record:r, activity:activity(r.activity_id) })).filter(x => x.activity); }
  function trainingRecordComplete(r) { return Boolean(String(r?.result_text||'').trim() && String(r?.application_text||'').trim()); }
  function status(r) { return trainingRecordComplete(r) ? 'กรอกข้อมูลแล้ว' : 'รอกรอกข้อมูล'; }
  function employment(id) { const x=staffOf(id); return x.employment_start_date || x.start_date || ''; }
  const ORGANIZER_MARKER_RE = /\[\[FM-CNHR-002-ORGANIZER:([^\]]*)\]\]\s*/i;
  const BATCH_MARKER_RE = /\[\[FM-CNHR-002-BATCH:([^\]]*)\]\]\s*/i;
  function decodeMarker(note,re) {
    const match=String(note||'').match(re);
    if(!match)return '';
    try{return decodeURIComponent(match[1]||'').trim();}catch(_){return String(match[1]||'').trim();}
  }
  function organizerFromNote(note) { return decodeMarker(note,ORGANIZER_MARKER_RE); }
  function batchFromNote(note) { return decodeMarker(note,BATCH_MARKER_RE); }
  function cleanActivityNote(note) { return String(note||'').replace(ORGANIZER_MARKER_RE,'').replace(BATCH_MARKER_RE,'').trim(); }
  function noteWithTrainingMeta(note,organizer,batch) {
    const clean=cleanActivityNote(note),parts=[];
    const organizerValue=String(organizer||'').trim(),batchValue=String(batch||'').trim();
    if(organizerValue)parts.push(`[[FM-CNHR-002-ORGANIZER:${encodeURIComponent(organizerValue)}]]`);
    if(batchValue)parts.push(`[[FM-CNHR-002-BATCH:${encodeURIComponent(batchValue)}]]`);
    return `${parts.join('')}${clean?(parts.length?'\n':'')+clean:''}`;
  }
  function activityOrganizerValue(a) { return String(a?.organizer||a?.organizer_name||a?.provider||organizerFromNote(a?.note)||'').trim(); }
  function activityBatchValue(a) { return String(a?.training_batch||a?.batch||a?.generation||a?.cohort||batchFromNote(a?.note)||'').trim(); }
  function isMissingOrganizerColumn(error) {
    const text=String(error?.message||error||'');
    return /PGRST204/i.test(text)||(/organizer/i.test(text)&&/(column|schema cache|does not exist)/i.test(text));
  }
  window.cnmiCleanActivityNote=cleanActivityNote;
  window.cnmiActivityOrganizer=activityOrganizerValue;
  window.cnmiActivityTrainingBatch=activityBatchValue;

  async function loadTraining() {
    if (!S().profile || !DB()) return;
    const res = await DB().from(TABLE).select('*').order('updated_at', {ascending:false});
    if (res.error) { S().trainingRecords=[]; S().trainingSchemaError=res.error.message || String(res.error); return; }
    S().trainingRecords=res.data || [];
    S().trainingSchemaError='';

    // V400 intentionally does not preload every activity. The training page,
    // however, must resolve every activity referenced by a training record;
    // otherwise rowItems() drops the record and date filters appear empty.
    const known = new Set((S().activities || []).map(x => String(x.id)));
    const missingIds = [...new Set(S().trainingRecords.map(x => x.activity_id).filter(Boolean).map(String))]
      .filter(id => !known.has(id));
    if (!missingIds.length) return;

    const fetched = [];
    for (let i=0; i<missingIds.length; i+=100) {
      const q = await DB().from('activity_events').select('*').in('id', missingIds.slice(i,i+100));
      if (q.error) { S().trainingActivityLoadError=q.error.message || String(q.error); break; }
      fetched.push(...(q.data || []));
    }
    if (fetched.length) {
      const merged = new Map((S().activities || []).map(x => [String(x.id), x]));
      fetched.forEach(x => merged.set(String(x.id), x));
      S().activities = [...merged.values()];
    }
  }
  const oldLoad = window.loadAllData || (typeof loadAllData === 'function' && loadAllData);
  if (oldLoad) {
    window.loadAllData = async function () { const r=await oldLoad.apply(this,arguments); await loadTraining(); return r; };
    try { (0,eval)('loadAllData=window.loadAllData'); } catch (_) {}
  }

  function participantChecks(selected) {
    const ids = new Set((selected || []).map(String));
    const rows = typeof orderedStaff === 'function' ? orderedStaff((S().staff||[]).filter(x=>x.is_active!==false)) : (S().staff||[]);
    return `<div class="v396-participants">${rows.map(p=>`<label class="v396-participant"><input type="checkbox" name="participant_ids" value="${esc(p.id)}" ${ids.has(String(p.id))?'checked':''}><span><b>${esc(p.nickname||p.full_name||'-')}</b><small>${esc(p.full_name||'')}</small></span></label>`).join('')}</div>`;
  }

  // V487: activity attachments support legacy single-path values and new multi-file JSON values.
  function activityAttachmentsV487(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item,index)=>normalizeActivityAttachmentV487(item,index)).filter(Boolean);
    if (typeof value === 'object') { const item=normalizeActivityAttachmentV487(value,0); return item?[item]:[]; }
    const raw=String(value||'').trim();
    if (!raw) return [];
    if (/^[\[{]/.test(raw)) {
      try {
        const parsed=JSON.parse(raw);
        const list=Array.isArray(parsed)?parsed:[parsed];
        return list.map((item,index)=>normalizeActivityAttachmentV487(item,index)).filter(Boolean);
      } catch (_) {}
    }
    const item=normalizeActivityAttachmentV487(raw,0);
    return item?[item]:[];
  }
  function normalizeActivityAttachmentV487(item,index) {
    if (!item) return null;
    if (typeof item === 'string') return {path:item,name:activityAttachmentNameV487(item,index),mime:''};
    const path=String(item.path||item.attachment_path||item.url||'').trim();
    if (!path) return null;
    return {path,name:String(item.name||item.file_name||activityAttachmentNameV487(path,index)).trim(),mime:String(item.mime||item.type||'').trim()};
  }
  function activityAttachmentNameV487(path,index) {
    const raw=String(path||'').split('?')[0].split('/').pop()||'';
    const clean=raw.replace(/^\d+_/, '').replace(/_+/g,' ').trim();
    return clean && /[A-Za-z0-9ก-๙]/.test(clean) ? clean : `ไฟล์แนบ ${Number(index||0)+1}`;
  }
  function encodeActivityAttachmentsV487(items) {
    const clean=(items||[]).map((item,index)=>normalizeActivityAttachmentV487(item,index)).filter(Boolean);
    return clean.length ? JSON.stringify(clean) : null;
  }
  function attachmentEditorV487(editing) {
    const files=activityAttachmentsV487(editing?.attachment_path);
    const existing=files.length ? `<div class="v487-existing-files"><div class="v487-existing-title">ไฟล์แนบเดิม ${files.length} ไฟล์</div>${files.map((file,index)=>`<div class="v487-existing-file"><button type="button" class="tiny-btn" data-v487-open-activity-file="${esc(editing?.id||'')}:${index}">ดูไฟล์ ${index+1}</button><span class="v487-file-name">${esc(file.name||`ไฟล์แนบ ${index+1}`)}</span><label class="v487-keep-file"><input type="checkbox" name="keep_activity_attachment" value="${index}" checked> เก็บไว้</label></div>`).join('')}</div>` : '';
    return `<label class="wide v487-attachment-field">เอกสารแนบ <input name="file" type="file" multiple><small class="hint">เลือกพร้อมกันได้หลายไฟล์ • ถ้าแก้ไขกิจกรรมภายหลัง สามารถเลือกไฟล์เพิ่มได้โดยไฟล์เดิมยังอยู่</small>${existing}</label>`;
  }
  window.cnmiActivityAttachmentsV487={parse:activityAttachmentsV487,encode:encodeActivityAttachmentsV487,name:activityAttachmentNameV487};

  const oldActivities = window.renderActivitiesPage || renderActivitiesPage;
  function renderActivitiesV396() {
    const rows=S().activities||[];
    const editing=S().editingActivityId ? rows.find(x=>idEq(x.id,S().editingActivityId)) : null;
    const included = editing?.training_form_existing === true || editing?.include_fm_cnhr_002 === true;
    const table = typeof renderActivityTable === 'function' ? renderActivityTable(rows) : '';
    return `<div class="grid grid-2"><div class="card"><div class="section-title"><h3>${editing?'แก้ไขกิจกรรม':'เพิ่มกิจกรรมหน่วยงาน'}</h3>${editing?'<button class="ghost-btn" data-cancel-edit-activity>ยกเลิกแก้ไข</button>':''}</div>
      <form id="activityForm" class="form-grid">
        <label class="wide">รายละเอียดกิจกรรม <input name="title" value="${esc(editing?.title||'')}" placeholder="เช่น ประชุมทีม / อบรม / ออกหน่วย" required></label>
        <div class="wide v405-training-meta-grid">
          <label class="v396-training-check"><input type="checkbox" name="include_fm_cnhr_002" ${included?'checked':''}> <span>เก็บเป็นประวัติอบรม FM-CNHR-002 <small>ติ๊กเมื่อ ต้องการนำกิจกรรมนี้เข้าประวัติการอบรมของผู้เข้าร่วม</small></span></label>
          <label class="v405-training-field v405-organizer-field ${included?'v405-required':''}">หน่วยงานผู้จัด <span class="v405-required-mark">*</span><input name="organizer" value="${esc(activityOrganizerValue(editing))}" placeholder="เช่น สภากาชาดไทย / บริษัทผู้จัด / หน่วยงานภายใน" ${included?'required':''}><small class="hint">แสดงในคอลัมน์ “หน่วยงานผู้จัด”</small></label>
          <label class="v405-training-field v408-batch-field ${included?'v405-required':''}">รุ่น <span class="v405-required-mark">*</span><input name="training_batch" value="${esc(activityBatchValue(editing)||(included?'-':''))}" placeholder="เช่น รุ่นที่ 18 หรือ -" ${included?'required':''}><small class="hint">หากไม่มีรุ่น ให้ใส่เครื่องหมาย -</small></label>
        </div>
        <label>ประเภท <select name="event_type" required>${(typeof ACTIVITY_TYPES!=='undefined'?ACTIVITY_TYPES:['ประชุม','อบรม','ออกหน่วย','ตรวจมาตรฐาน','ซ้อม CODE','อื่นๆ']).map(t=>`<option ${editing?.event_type===t?'selected':''}>${t}</option>`).join('')}</select></label>
        <label>สถานที่ <input name="location" list="activityLocationList" value="${esc(editing?.location||'')}" required></label><datalist id="activityLocationList">${(typeof ACTIVITY_LOCATIONS!=='undefined'?ACTIVITY_LOCATIONS:[]).map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist>
        <label>วันที่เริ่ม <input name="start_date" type="date" value="${esc(editing?.start_date||todayStr())}" required></label><label>วันที่สิ้นสุด <input name="end_date" type="date" value="${esc(editing?.end_date||todayStr())}" required></label>
        <label>เวลาเริ่ม <input name="start_time" type="time" value="${esc(editing?.start_time||'')}" required></label><label>เวลาสิ้นสุด <input name="end_time" type="time" value="${esc(editing?.end_time||'')}" required></label>
        <label>ผู้รับผิดชอบ <select name="owner_id" required><option value="">เลือกผู้รับผิดชอบ</option>${staffOptions(editing?.owner_id||actor())}</select></label>${attachmentEditorV487(editing)}
        <div class="wide"><div class="field-label">ผู้เข้าร่วม</div>${participantChecks(asArray(editing?.participant_ids))}</div>
        <label class="wide">หมายเหตุเพิ่มเติม <textarea name="note">${esc(cleanActivityNote(editing?.note||''))}</textarea></label><button class="primary-btn wide" type="submit">${editing?'บันทึกการแก้ไข':'บันทึกกิจกรรม'}</button>
      </form></div><div class="card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3></div>${table}</div></div>`;
  }
  window.renderActivitiesPage=renderActivitiesV396; try{(0,eval)('renderActivitiesPage=window.renderActivitiesPage');}catch(_){ }

  async function saveActivityV396(form) {
    const fd=new FormData(form), participants=[...form.querySelectorAll('[name="participant_ids"]:checked')].map(x=>x.value);
    const include=form.querySelector('[name="include_fm_cnhr_002"]')?.checked===true;
    const organizer=String(fd.get('organizer')||'').trim(),trainingBatch=String(fd.get('training_batch')||'').trim(),cleanNote=cleanActivityNote(fd.get('note'));
    const storedNote=include?noteWithTrainingMeta(cleanNote,'',trainingBatch):cleanNote;
    const row={title:String(fd.get('title')||'').trim(),event_type:fd.get('event_type'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),start_time:fd.get('start_time')||null,end_time:fd.get('end_time')||null,location:String(fd.get('location')||'').trim(),organizer:include?organizer:null,note:storedNote,owner_id:fd.get('owner_id')||actor(),participant_ids:participants,include_fm_cnhr_002:include,training_form_existing:include,updated_by:actor()};
    const required=[['title','รายละเอียดกิจกรรม'],['event_type','ประเภท'],['location','สถานที่'],['start_date','วันที่เริ่ม'],['end_date','วันที่สิ้นสุด'],['start_time','เวลาเริ่ม'],['end_time','เวลาสิ้นสุด'],['owner_id','ผู้รับผิดชอบ']].filter(([k])=>!row[k]).map(([,v])=>v);
    if(include&&!organizer)required.push('หน่วยงานผู้จัด');
    if(include&&!trainingBatch)required.push('รุ่น (หากไม่มีให้ใส่ -)');
    if(row.event_type==='ออกหน่วย'&&!participants.length) required.push('ผู้เข้าร่วมสำหรับออกหน่วย');
    if(required.length)return showToast('กรุณากรอก/เลือกให้ครบ: '+required.join(', '));
    if(row.end_date<row.start_date)return showToast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    if(row.start_date===row.end_date&&row.end_time<=row.start_time)return showToast('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม');
    try{
      const id=S().editingActivityId;
      const editing=id ? (S().activities||[]).find(x=>idEq(x.id,id)) : null;
      const existingFiles=activityAttachmentsV487(editing?.attachment_path);
      const keepIndexes=new Set([...form.querySelectorAll('[name="keep_activity_attachment"]:checked')].map(x=>Number(x.value)));
      const keptFiles=id ? existingFiles.filter((_,index)=>keepIndexes.has(index)) : [];
      const selectedFiles=[...form.querySelectorAll('input[name="file"]')].flatMap(input=>Array.from(input.files||[])).filter(file=>file&&file.size);
      const uploadedFiles=[];
      for (const file of selectedFiles) {
        if (typeof uploadFile!=='function') throw new Error('ระบบอัปโหลดไฟล์ยังไม่พร้อมใช้งาน');
        const path=await uploadFile(file,'activities');
        uploadedFiles.push({path,name:file.name||activityAttachmentNameV487(path,uploadedFiles.length),mime:file.type||''});
      }
      row.attachment_path=encodeActivityAttachmentsV487([...keptFiles,...uploadedFiles]);
      const removedFiles=id ? existingFiles.filter((_,index)=>!keepIndexes.has(index)) : [];
      const persist=payload=>id?DB().from('activity_events').update(payload).eq('id',id).select('*').single():DB().from('activity_events').insert({...payload,created_by:actor()}).select('*').single();
      let res=await persist(row);
      if(res.error&&isMissingOrganizerColumn(res.error)){
        const compatibleRow={...row,note:noteWithTrainingMeta(cleanNote,include?organizer:'',include?trainingBatch:'')};
        delete compatibleRow.organizer;
        res=await persist(compatibleRow);
      }
      if(res.error)throw res.error;
      if (removedFiles.length) {
        const paths=removedFiles.map(x=>String(x.path||'').replace(/^staff-files\//,'').replace(/^\/+/, '')).filter(Boolean);
        if (paths.length) DB().storage.from('staff-files').remove(paths).catch(()=>{});
      }
      const activityId=res.data?.id||id;
      const old=await DB().from(TABLE).select('*').eq('activity_id',activityId);
      if(old.error&&!/does not exist|relation/i.test(old.error.message||''))throw old.error;
      const oldRows=old.data||[];
      if(include){
        const desired=participants.map(staff_id=>{const prev=oldRows.find(x=>idEq(x.staff_id,staff_id)&&x.form_type==='existing');return {...(prev?.id?{id:prev.id}:{}),activity_id:activityId,staff_id,form_type:'existing',is_included:true,employment_start_date_snapshot:prev?.employment_start_date_snapshot||employment(staff_id)||null,updated_by:actor()};});
        if(desired.length){const up=await DB().from(TABLE).upsert(desired,{onConflict:'activity_id,staff_id,form_type'});if(up.error)throw up.error;}
        for(const oldRow of oldRows.filter(x=>x.form_type==='existing'&&!participants.map(String).includes(String(x.staff_id)))) await DB().from(TABLE).update({is_included:false,updated_by:actor()}).eq('id',oldRow.id);
      }else for(const oldRow of oldRows.filter(x=>x.form_type==='existing')) await DB().from(TABLE).update({is_included:false,updated_by:actor()}).eq('id',oldRow.id);
      S().editingActivityId=null; await loadAllData(); renderPage(); showToast(include?'บันทึกกิจกรรมและนำเข้า FM-CNHR-002 แล้ว':'บันทึกกิจกรรมแล้ว');
    }catch(e){showToast(e?.message||String(e));}
  }

  function trainingFormNotice(){return S().trainingSchemaError?`<div class="notice warning">ระบบอบรมยังไม่พร้อมใช้งาน กรุณารัน SQL <code>supabase_v396_training_integrated.sql</code> ก่อน</div>`:'';}
  function recordForm(item,index){
    const r=item.record,a=item.activity,currentStatus=status(r),pending=currentStatus==='รอกรอกข้อมูล';
    const dateText=`${dateLabel(a.start_date)}${dateKey(a.end_date)!==dateKey(a.start_date)?' – '+dateLabel(a.end_date):''}`;
    return `<article class="card v396-record v416-training-card ${pending?'v416-training-card-pending':'v416-training-card-complete'}">
      <div class="v416-record-head">
        <div class="v416-record-heading"><span class="v416-record-number">รายการที่ ${index+1}</span><h3>${esc(a.title)}</h3></div>
        <div class="v416-record-status">${badge(currentStatus,pending?'orange':'green')}</div>
      </div>
      <div class="v416-record-meta"><span><b>วันที่</b> ${esc(dateText)}</span><span><b>สถานที่</b> ${esc(a.location||'-')}</span><span><b>รุ่น</b> ${esc(activityBatchValue(a)||'-')}</span><span><b>หน่วยงานผู้จัด</b> ${esc(activityOrganizerValue(a)||a.location||'-')}</span></div>
      <form class="v416-record-form" data-v396-record="${esc(r.id)}">
        <div class="v416-record-form-grid">
          <label class="v416-answer-field"><span class="v416-field-title">ผล/สิ่งที่ได้รับ</span><small>สรุปความรู้ ประเด็นสำคัญ หรือสิ่งที่ได้จากกิจกรรม</small><textarea name="result_text" rows="5" placeholder="เช่น ได้ทบทวนหลักการ... / ได้เรียนรู้แนวทาง...">${esc(r.result_text||'')}</textarea></label>
          <label class="v416-answer-field"><span class="v416-field-title">การนำความรู้ไปใช้</span><small>ระบุว่าจะนำไปปรับใช้กับงานหรือพัฒนาหน่วยงานอย่างไร</small><textarea name="application_text" rows="5" placeholder="เช่น นำไปปรับขั้นตอน... / ถ่ายทอดให้ทีม...">${esc(r.application_text||'')}</textarea></label>
        </div>
        <div class="v416-record-bottom">
          <label class="v416-certificate-field"><span class="v416-field-title">Certificate <small>(ไม่บังคับ)</small></span><input type="file" name="certificate" accept=".pdf,image/*">${r.certificate_name?`<small class="v416-file-current">ไฟล์ปัจจุบัน: ${esc(r.certificate_name)}</small>`:'<small>รองรับ PDF หรือรูปภาพ</small>'}</label>
          <div class="v416-save-area"><small>${pending?'กรอก “ผล/สิ่งที่ได้รับ” และ “การนำความรู้ไปใช้” ให้ครบ จึงจะ Export PDF ประจำปีได้':'ข้อมูลรายการนี้ครบแล้ว • แก้ไขแล้วกดบันทึกได้ทันที'}</small><button class="primary-btn" type="submit">${pending?'บันทึกผลการอบรม':'บันทึกการแก้ไข'}</button></div>
        </div>
      </form>
    </article>`;
  }
  function myTrainingStatus(){return Object.prototype.hasOwnProperty.call(S(),'v402MyStatus')?String(S().v402MyStatus||''):'รอกรอกข้อมูล';}
  function currentGregorianYear(){return new Date().getFullYear();}
  function selectedTrainingYear(){
    const direct=Number(S().v407TrainingYear);
    return Number.isInteger(direct)&&direct>=2000&&direct<=2200?direct:0;
  }
  function applyTrainingYearRange(year){
    const y=Number(year),s=S();
    if(!Number.isInteger(y)||y<2000||y>2200){s.v407TrainingYear='';s.v396MyFrom='';s.v396MyTo='';return {year:0,from:'',to:''};}
    s.v407TrainingYear=String(y);s.v396MyFrom=`${y}-01-01`;s.v396MyTo=`${y}-12-31`;
    return {year:y,from:s.v396MyFrom,to:s.v396MyTo};
  }
  function trainingYearOptions(){
    const years=new Set([currentGregorianYear()-2,currentGregorianYear()-1,currentGregorianYear(),currentGregorianYear()+1]);
    rowItems().forEach(x=>{const y=Number(dateKey(x.activity?.start_date).slice(0,4));if(Number.isInteger(y)&&y>=2000&&y<=2200)years.add(y);});
    return [...years].sort((a,b)=>b-a);
  }
  function isMyTrainingFilterReady(){return ['รอกรอกข้อมูล','กรอกข้อมูลแล้ว','all'].includes(myTrainingStatus())&&selectedTrainingYear()>0;}
  function myTrainingAnnualRows(){
    if(!isMyTrainingFilterReady())return [];
    const range=applyTrainingYearRange(selectedTrainingYear());
    return rowItems().filter(x=>{if(!idEq(x.record.staff_id,actor()))return false;const start=dateKey(x.activity.start_date),end=dateKey(x.activity.end_date)||start;return end>=range.from&&start<=range.to;}).sort((a,b)=>dateKey(a.activity.start_date).localeCompare(dateKey(b.activity.start_date)));
  }
  function myTrainingFilters(){
    const selected=myTrainingStatus(),year=selectedTrainingYear(),ready=isMyTrainingFilterReady(),annualRows=ready?myTrainingAnnualRows():[],incomplete=annualRows.filter(x=>!trainingRecordComplete(x.record)),canExport=ready&&annualRows.length>0&&incomplete.length===0;
    const exportGate=!ready?'':!annualRows.length?'<small class="v439-export-gate v439-export-gate-warn">ยังไม่มีรายการอบรมในปีที่เลือก</small>':incomplete.length?`<small class="v439-export-gate v439-export-gate-warn">ยัง Export ไม่ได้ • กรุณากรอกให้ครบทั้งปี (ค้าง ${incomplete.length}/${annualRows.length} รายการ)</small>`:`<small class="v439-export-gate v439-export-gate-ok">กรอกครบ ${annualRows.length}/${annualRows.length} รายการ • พร้อม Export</small>`;
    return `<div class="toolbar compact-filter v396-filters v402-my-training-filters v407-year-filter v416-filter-gate v417-my-training-filters">
      <label><span class="v417-control-label">สถานะข้อมูล</span><select id="v402MyStatus"><option value="รอกรอกข้อมูล" ${selected==='รอกรอกข้อมูล'?'selected':''}>รอกรอกข้อมูล</option><option value="กรอกข้อมูลแล้ว" ${selected==='กรอกข้อมูลแล้ว'?'selected':''}>กรอกข้อมูลแล้ว</option><option value="all" ${selected==='all'?'selected':''}>ทั้งหมด</option></select></label>
      <label><span class="v417-control-label">ปีแบบฟอร์ม</span><select id="v407TrainingYear"><option value="" ${!year?'selected':''} disabled>เลือกปีแบบฟอร์ม</option>${trainingYearOptions().map(y=>`<option value="${y}" ${y===year?'selected':''}>พ.ศ. ${y+543}</option>`).join('')}</select></label>
      <div class="v402-export-wrap"><span class="v417-control-label">ส่งออกเอกสาร</span><button class="primary-btn" type="button" data-v402-my-export ${canExport?'':'disabled'}>Export PDF ชุดอบรมประจำปี</button>${exportGate}</div>
    </div>`;
  }
  function myTrainingRows(){
    if(!isMyTrainingFilterReady())return [];
    const selected=myTrainingStatus(),rows=myTrainingAnnualRows();
    return selected==='all'?rows:rows.filter(x=>status(x.record)===selected);
  }
  const MY_TRAINING_PAGE_SIZE=1;
  function myTrainingPage(){const page=Number(S().v417MyTrainingPage);return Number.isInteger(page)&&page>0?page:1;}
  function myTrainingPagination(totalRows,currentPage,totalPages){
    if(totalPages<=1)return '';
    return `<nav class="v417-training-pagination" aria-label="เปลี่ยนหน้ารายการอบรม"><button class="ghost-btn v417-page-btn" type="button" data-v417-my-page="${currentPage-1}" ${currentPage<=1?'disabled':''}>ก่อนหน้า</button><span>หน้า ${currentPage} / ${totalPages}</span><button class="ghost-btn v417-page-btn" type="button" data-v417-my-page="${currentPage+1}" ${currentPage>=totalPages?'disabled':''}>หน้าถัดไป</button></nav>`;
  }
  function trainingSelectionPrompt(text){return `<div class="v416-selection-prompt"><div class="v416-selection-icon">⌄</div><div><b>${esc(text)}</b><small>ระบบจะยังไม่เปิดรายการทั้งหมด เพื่อให้หน้าจออ่านง่ายและโหลดเฉพาะข้อมูลที่ต้องการ</small></div></div>`;}
  function renderMyTraining(){
    if(!S().profile)return noPermission();
    const ready=isMyTrainingFilterReady(),allRows=ready?myTrainingRows():[],year=selectedTrainingYear(),totalPages=Math.max(1,Math.ceil(allRows.length/MY_TRAINING_PAGE_SIZE)),currentPage=Math.min(myTrainingPage(),totalPages),start=(currentPage-1)*MY_TRAINING_PAGE_SIZE,rows=allRows.slice(start,start+MY_TRAINING_PAGE_SIZE);
    S().v417MyTrainingPage=currentPage;
    return `<div class="card v416-training-page"><div class="section-title"><div><h3>รายการอบรมของฉัน</h3><p class="hint">สถานะเริ่มต้นเป็น “รอกรอกข้อมูล” เลือกปีแบบฟอร์มเพื่อแสดงรายการ</p></div></div>${trainingFormNotice()}${myTrainingFilters()}${!ready?trainingSelectionPrompt('เลือก “ปีแบบฟอร์ม” ก่อน'):allRows.length?`<div class="v396-record-list">${rows.map((item,index)=>recordForm(item,start+index)).join('')}</div>${myTrainingPagination(allRows.length,currentPage,totalPages)}`:empty(`ไม่พบรายการอบรมในปี ${year+543} ตามตัวกรอง`)}</div>`;
  }
  function ensureAdminDateRange(){
    const s=S(),year=currentGregorianYear();
    if(!Object.prototype.hasOwnProperty.call(s,'v396From'))s.v396From=`${year}-01-01`;
    if(!Object.prototype.hasOwnProperty.call(s,'v396To'))s.v396To=`${year}-12-31`;
  }
  function adminFiltersReady(){const s=S();ensureAdminDateRange();return Boolean(s.v396From&&s.v396To&&s.v396Staff&&s.v396Status);}
  function filters(){
    const s=S();ensureAdminDateRange();
    return `<div class="toolbar compact-filter v396-filters v416-admin-training-filters">
      <label>จากวันที่ <input type="date" id="v396From" value="${esc(s.v396From||'')}"></label>
      <label>ถึงวันที่ <input type="date" id="v396To" value="${esc(s.v396To||'')}"></label>
      <label>บุคลากร <select id="v396Staff"><option value="" ${!s.v396Staff?'selected':''} disabled>เลือกบุคลากร</option><option value="all" ${s.v396Staff==='all'?'selected':''}>ทุกคน</option>${(S().staff||[]).filter(x=>x.is_active!==false).map(x=>`<option value="${esc(x.id)}" ${idEq(s.v396Staff,x.id)?'selected':''}>${esc(staffName(x.id))}</option>`).join('')}</select></label>
      <label>สถานะข้อมูล <select id="v396Status"><option value="" ${!s.v396Status?'selected':''} disabled>เลือกสถานะข้อมูล</option><option value="all" ${s.v396Status==='all'?'selected':''}>ทุกสถานะ</option><option value="กรอกข้อมูลแล้ว" ${s.v396Status==='กรอกข้อมูลแล้ว'?'selected':''}>กรอกข้อมูลแล้ว</option><option value="รอกรอกข้อมูล" ${s.v396Status==='รอกรอกข้อมูล'?'selected':''}>รอกรอกข้อมูล</option></select></label>
    </div>`;
  }
  function filtered(){
    if(!adminFiltersReady())return [];
    const s=S();
    return rowItems().filter(x=>{const start=dateKey(x.activity.start_date),end=dateKey(x.activity.end_date)||start;return end>=s.v396From&&start<=s.v396To&&(s.v396Staff==='all'||idEq(x.record.staff_id,s.v396Staff))&&(s.v396Status==='all'||status(x.record)===s.v396Status);}).sort((a,b)=>dateKey(b.activity.start_date).localeCompare(dateKey(a.activity.start_date)));
  }
  function renderTrainingAdmin(){
    if(!isManager())return noPermission();
    const ready=adminFiltersReady(),rows=ready?filtered():[],s=S(),canExport=ready&&(rows.length>0||s.v396Status==='all'),exportLabel=s.v396Staff==='all'?'Export PDF ทุกคน':'Export PDF บุคลากรที่เลือก';
    return `<div class="card"><div class="section-title"><div><h3>ตรวจสอบอบรมของเจ้าหน้าที่</h3><p class="hint">เลือกบุคลากรและสถานะข้อมูลก่อน ระบบจึงจะแสดงตารางและเปิดปุ่ม Export</p></div><button class="ghost-btn" type="button" data-v396-admin-export ${canExport?'':'disabled'}>${exportLabel}</button></div>${trainingFormNotice()}${filters()}${!ready?trainingSelectionPrompt('เลือก “บุคลากร” และ “สถานะข้อมูล” ก่อน'):rows.length?`<div class="table-wrap"><table><thead><tr><th>บุคลากร</th><th>กิจกรรม</th><th>วันที่/สถานที่</th><th>แบบฟอร์ม</th><th>สถานะ</th><th>อัปเดตล่าสุด</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(staffName(x.record.staff_id))}</td><td>${esc(x.activity.title)}</td><td>${dateLabel(x.activity.start_date)}<br>${esc(x.activity.location||'-')}</td><td>FM-CNHR-002</td><td>${badge(status(x.record),status(x.record)==='กรอกข้อมูลแล้ว'?'green':'orange')}</td><td>${dateTimeLabel(x.record.updated_at||x.record.created_at)}</td></tr>`).join('')}</tbody></table></div>`:empty('ไม่พบข้อมูลตามตัวกรอง')}</div>`;
  }

  function dayDiff(start,end){const a=new Date(`${dateKey(start)}T00:00:00`),b=new Date(`${dateKey(end||start)}T00:00:00`);return Number.isFinite(a.getTime())&&Number.isFinite(b.getTime())?Math.max(1,Math.round((b-a)/86400000)+1):1;}
  function durationLabel(a){const start=dateKey(a?.start_date),end=dateKey(a?.end_date)||start;if(start===end){const sh=String(a?.start_time||''),eh=String(a?.end_time||'');if(/^\d{2}:\d{2}/.test(sh)&&/^\d{2}:\d{2}/.test(eh)){const [h1,m1]=sh.split(':').map(Number),[h2,m2]=eh.split(':').map(Number),mins=(h2*60+m2)-(h1*60+m1);if(mins>0)return mins<=300?'0.5 วัน':'1 วัน';}if(a?.duration_label)return String(a.duration_label);return '1 วัน';}return `${dayDiff(start,end)} วัน`;}
  function thaiYear(date){const d=new Date(`${dateKey(date)}T00:00:00`);return Number.isFinite(d.getTime())?d.getFullYear()+543:'';}
  function thaiDateLong(date){
    const key=dateKey(date);if(!key)return '-';
    const d=new Date(`${key}T00:00:00`);if(!Number.isFinite(d.getTime()))return dateLabel(date);
    try{return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'long',year:'numeric'}).format(d);}catch(_){return dateLabel(date);}
  }
  function annualFormTitle(year){return `แบบบันทึกการอบรมประจำปี ${Number(year)+543}`;}
  function organizerText(a){return activityOrganizerValue(a)||a?.location||'-';}
  function chunkRows(items,size){const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out.length?out:[[]];}
  function normalizedPersonText(value){return String(value||'').replace(/\s+/g,'').replace(/^(นาย|นางสาว|นาง|พญ\.|นพ\.|แพทย์หญิง|แพทย์ชาย)/,'');}
  function isParichatProfile(profile){
    const name=normalizedPersonText(profile?.full_name||'');
    const code=String(profile?.employee_code||profile?.personnel_code||'').trim();
    return name.includes('ปาริฉัตรอินทร์เกลี้ยง')||code==='020305';
  }
  function isPhysicianTrainingProfile(profile){
    const type=String(profile?.staff_type||profile?.position||profile?.job_title||'').trim();
    const role=String(profile?.role||profile?.app_role||'').trim();
    if(window.cnmiPersonTypeV516?.isPhysician)return window.cnmiPersonTypeV516.isPhysician(profile);
    return /^(แพทย์|physician|doctor)$/i.test(type)||/^(แพทย์|physician|doctor)$/i.test(role);
  }
  function headDisplayName(head){
    const raw=String(head?.full_name||'ปาริฉัตร อินทร์เกลี้ยง').trim();
    return /^(นาย|นางสาว|นาง|พญ\.|นพ\.|แพทย์หญิง|แพทย์ชาย)/.test(raw)?raw:`นางสาว ${raw}`;
  }
  function annualFormStyles(){return `@page{size:A4 portrait;margin:5mm 5mm 6mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:"TH Sarabun New",Sarabun,Tahoma,sans-serif;color:#000;font-size:16pt;font-weight:400;line-height:1}.fm-page{width:200mm;height:283.5mm;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto auto;overflow:hidden;padding-bottom:1mm;break-after:page;page-break-after:always;background:#fff}.fm-page:last-child{break-after:auto;page-break-after:auto}table{width:100%;border-collapse:collapse;border-spacing:0}.fm-header td{border:0.5pt solid #111;padding:1.05mm 2mm;font-size:16pt;font-weight:700;line-height:.98}.header-label{display:inline-block;min-width:43mm;font-weight:700}.logo-cell{width:27mm;text-align:center;padding:.8mm!important}.fm-logo{display:block;width:23mm;height:23mm;object-fit:contain;margin:auto}.fm-person{margin-top:1mm;table-layout:fixed;border:0.5pt solid #111}.fm-person td{border:0;width:50%;padding:1.45mm 3mm;font-size:16pt;font-weight:700;line-height:.98}.fm-field{display:grid;grid-template-columns:29mm 3mm minmax(0,1fr);align-items:end;gap:1mm}.fm-field b{white-space:nowrap;font-weight:700}.fm-fill-line{display:block;text-align:center;border-bottom:0.5pt solid #111;min-height:5.8mm;line-height:5.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}.fm-training{margin-top:2mm;table-layout:fixed;height:100%;border:0.5pt solid #111}.fm-page.fm-natural-measure .fm-training{height:auto!important;align-self:start!important}.fm-page.fm-natural-measure .fm-training tr.blank{display:none!important}.fm-training thead{display:table-header-group}.fm-training tr{break-inside:avoid;page-break-inside:avoid}.fm-training th,.fm-training td{border:0.5pt solid #111}.fm-training th{padding:.95mm .55mm;font-size:14.5pt;font-weight:700;line-height:1;text-align:center;vertical-align:middle}.fm-training td{height:7.45mm;padding:.65mm 1.15mm;vertical-align:top;font-size:14pt;font-weight:400;line-height:1.02}.fm-training th:nth-child(1){width:4%}.fm-training th:nth-child(2){width:35%}.fm-training th:nth-child(3){width:5%}.fm-training th:nth-child(4){width:24%}.fm-training th:nth-child(5){width:11%}.fm-training th:nth-child(6){width:11%}.fm-training th:nth-child(7){width:10%}.center{text-align:center}.blank td{height:7.45mm;padding:0}.signatures{border:0.5pt solid #111;border-top:0;display:grid;grid-template-columns:1fr 1fr;gap:12mm;padding:5.2mm 10mm 3.6mm;text-align:center;font-size:16pt;font-weight:400;line-height:1.12;min-height:34mm}.signatures.single-signature{grid-template-columns:1fr;gap:0;padding-left:45mm;padding-right:45mm}.signatures.single-signature .signature-box{justify-self:center;width:100%;max-width:90mm}.signature-box{align-self:center}.signature-dots{display:inline-block;width:55mm;border-bottom:0.5pt dotted #111;vertical-align:baseline;transform:none}.signature-name{display:inline-block;min-height:5.5mm;margin-top:1.8mm}.manual-supervisor-name{white-space:nowrap}.signature-name-dots{display:inline-block;width:46mm;min-height:4.7mm;border-bottom:0.5pt dotted #111;vertical-align:baseline}.fm-footer{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:4mm;padding:.55mm .5mm 0;font-size:8.5pt;font-weight:400;line-height:1}.page-number{justify-self:center;white-space:nowrap}.form-code{justify-self:end;white-space:nowrap}.fm-vector-line-capture .fm-header td,.fm-vector-line-capture .fm-person,.fm-vector-line-capture .fm-training,.fm-vector-line-capture .fm-training th,.fm-vector-line-capture .fm-training td{border-color:transparent!important}.fm-vector-line-capture .fm-fill-line{border-bottom-color:transparent!important}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`; }
  function annualFormDocument(items,options={}){
    const year=Number(options.year)||selectedTrainingYear(),staffId=options.staffId||items?.[0]?.record?.staff_id||actor();
    if(!year||!staffId)return null;
    const profile=staffOf(staffId),personName=profile.full_name||profile.nickname||'-',employeeCode=profile.employee_code||profile.personnel_code||'-',position=profile.position||profile.staff_type||'-',startWork=employment(staffId);
    const head=(S().staff||[]).find(x=>normalizedPersonText(x.full_name).includes('ปาริฉัตรอินทร์เกลี้ยง'))||{};
    const physicianProfile=isPhysicianTrainingProfile(profile);
    const supervisorName=(isParichatProfile(profile)||physicianProfile)?'':headDisplayName(head);
    const logoUrl=new URL('fm-cnhr-002-logo.png',window.location.href).href,pages=chunkRows(items||[],20),title=annualFormTitle(year);
    const sections=pages.map((page,pageIndex)=>{
      const offset=pageIndex*20,blank=Math.max(0,20-page.length);
      const rows=page.map((x,i)=>`<tr><td class="center">${offset+i+1}</td><td>${esc(x.activity.title||'-')}</td><td class="center">${esc(activityBatchValue(x.activity)||'-')}</td><td>${esc(organizerText(x.activity))}</td><td class="center">${esc(dateLabel(x.activity.start_date))}</td><td class="center">${esc(dateLabel(x.activity.end_date||x.activity.start_date))}</td><td class="center">${esc(durationLabel(x.activity))}</td></tr>`).join('')+Array.from({length:blank},()=>'<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
      const supervisorLine=supervisorName?`(${esc(supervisorName)})`:'(<span class="signature-name-dots"></span>)';
      const signatureHtml=physicianProfile
        ? `<div class="signatures single-signature"><div class="signature-box">ลงชื่อ <span class="signature-dots"></span><br><span class="signature-name">(${esc(personName)})</span><br>บุคลากรผู้รับการฝึกอบรม</div></div>`
        : `<div class="signatures"><div class="signature-box">ลงชื่อ <span class="signature-dots"></span><br><span class="signature-name">(${esc(personName)})</span><br>บุคลากรผู้รับการฝึกอบรม</div><div class="signature-box">ลงชื่อ <span class="signature-dots"></span><br><span class="signature-name ${supervisorName?'':'manual-supervisor-name'}">${supervisorLine}</span><br>หัวหน้าหน่วย/หัวหน้างาน</div></div>`;
      return `<section class="fm-page"><table class="fm-header"><tr><td class="logo-cell" rowspan="3"><img class="fm-logo" src="${esc(logoUrl)}" alt="ตรามหาวิทยาลัยมหิดล"></td><td><span class="header-label">ชื่อแบบฟอร์ม :</span><b>${esc(title)}</b></td></tr><tr><td><span class="header-label">ฝ่าย/งาน/หน่วย :</span><b>งานพยาธิ นิติเวช และบริการโลหิต</b></td></tr><tr><td>โรงพยาบาลรามาธิบดีจักรีนฤบดินทร์ คณะแพทยศาสตร์โรงพยาบาลรามาธิบดี มหาวิทยาลัยมหิดล</td></tr></table><table class="fm-person"><tr><td><div class="fm-field"><b>ชื่อ สกุล</b><b>:</b><span class="fm-fill-line">${esc(personName)}</span></div></td><td><div class="fm-field"><b>รหัสบุคคล</b><b>:</b><span class="fm-fill-line">${esc(employeeCode)}</span></div></td></tr><tr><td><div class="fm-field"><b>ตำแหน่ง</b><b>:</b><span class="fm-fill-line">${esc(position)}</span></div></td><td><div class="fm-field"><b>วันเริ่มงาน</b><b>:</b><span class="fm-fill-line">${esc(thaiDateLong(startWork))}</span></div></td></tr></table><table class="fm-training"><thead><tr><th>ที่</th><th>หลักสูตร/เรื่อง</th><th>รุ่น</th><th>หน่วยงานผู้จัด</th><th>วันที่เริ่มต้น</th><th>วันที่สิ้นสุด</th><th>ระยะเวลา</th></tr></thead><tbody>${rows}</tbody></table>${signatureHtml}<div class="fm-footer"><span></span><span class="page-number">หน้าที่ ${pageIndex+1} ของ ${pages.length} หน้า</span><span class="form-code">FM-CNHR-002 Rev.00&nbsp;&nbsp; วันบังคับใช้ 1 ตุลาคม 2561</span></div></section>`;
    }).join('');
    return {year,staffId,personName,sections,styles:annualFormStyles(),pageCount:pages.length};
  }
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  async function waitForFrameAssets(doc){
    const imageTasks=[...doc.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=img.onerror=()=>resolve();}));
    await Promise.race([Promise.all(imageTasks),wait(3500)]);
    if(doc.fonts?.ready)await Promise.race([doc.fonts.ready,wait(2500)]);
    await wait(120);
  }
  function annualActualRows(page){return [...(page?.querySelectorAll('.fm-training tbody tr:not(.blank)')||[])];}
  function annualBlankRow(doc){
    const tr=doc.createElement('tr');tr.className='blank';
    tr.innerHTML='<td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
    return tr;
  }
  function normalizeAnnualPageRows(page){
    const tbody=page?.querySelector('.fm-training tbody');if(!tbody)return;
    tbody.querySelectorAll('tr.blank').forEach(row=>row.remove());
    const actual=annualActualRows(page),requestedRaw=Number(page.dataset.fmSlotTarget ?? 20),requested=Number.isFinite(requestedRaw)?Math.max(0,Math.min(20,Math.round(requestedRaw))):20,slotTarget=Math.max(actual.length,requested);
    page.dataset.fmSlotTarget=String(requested);
    for(let i=actual.length;i<slotTarget;i++)tbody.appendChild(annualBlankRow(page.ownerDocument));
  }
  function annualNaturalMetrics(page){
    const actual=annualActualRows(page),table=page?.querySelector('.fm-training'),thead=table?.querySelector('thead'),signatures=page?.querySelector('.signatures');
    if(!table||!thead||!signatures)return {actual,capacity:0,contentHeight:0,blankMin:28.2,overflow:false};
    page.classList.add('fm-natural-measure');
    let metrics;
    try{
      const tableRect=table.getBoundingClientRect(),signatureRect=signatures.getBoundingClientRect();
      const capacity=Math.max(0,signatureRect.top-tableRect.top);
      const headHeight=thead.getBoundingClientRect().height;
      const rowHeights=actual.map(row=>row.getBoundingClientRect().height);
      const contentHeight=headHeight+rowHeights.reduce((sum,h)=>sum+h,0);
      const blankMin=7.45*96/25.4;
      metrics={actual,capacity,contentHeight,blankMin,rowHeights,overflow:actual.length>20||contentHeight>capacity+1.5};
    }finally{page.classList.remove('fm-natural-measure');}
    return metrics;
  }
  function annualBestSlotTarget(page){
    const m=annualNaturalMetrics(page),actualCount=m.actual.length;
    // V426: blank rows are decorative only. Add them only when the remaining
    // table area can really hold them, so a tall course row can never push
    // into the reserved signature area.
    if(!m.capacity)return actualCount;
    const free=Math.max(0,m.capacity-m.contentHeight);
    const blanks=Math.max(0,Math.min(20-actualCount,Math.floor((free+0.5)/Math.max(1,m.blankMin))));
    return Math.max(actualCount,Math.min(20,actualCount+blanks));
  }
  function createAnnualContinuationPage(sourcePage){
    const page=sourcePage.cloneNode(true),tbody=page.querySelector('.fm-training tbody');
    if(tbody)tbody.innerHTML='';
    page.dataset.fmSlotTarget='0';
    return page;
  }
  function refreshAnnualPageLabels(doc){
    const pages=[...doc.querySelectorAll('.fm-page')];let rowNo=1;
    pages.forEach((page,index)=>{
      annualActualRows(page).forEach(row=>{const first=row.querySelector('td');if(first)first.textContent=String(rowNo++);});
      const number=page.querySelector('.page-number');if(number)number.textContent=`หน้าที่ ${index+1} ของ ${pages.length} หน้า`;
    });
    return pages.length;
  }
  async function rebalanceAnnualTrainingPages(doc){
    let guard=0;
    // Measure only the natural height of real training rows. The visual blank
    // rows are added after the page split is stable; otherwise a 100%-height
    // table makes each real row look artificially tall and causes 1 item/page.
    [...doc.querySelectorAll('.fm-page')].forEach(page=>{page.dataset.fmSlotTarget=String(annualActualRows(page).length);normalizeAnnualPageRows(page);});
    while(guard++<120){
      const pages=[...doc.querySelectorAll('.fm-page')];let changed=false;
      for(let i=0;i<pages.length;i++){
        const page=pages[i],metrics=annualNaturalMetrics(page),actual=metrics.actual;
        if(!metrics.overflow)continue;
        // V426: the signature block is a hard reserved area. If the natural
        // height of the real rows exceeds the table area, move the last row
        // to the next page regardless of row count. This prevents long titles
        // or organizer names from growing downward over the signature fields.
        if(actual.length>1){
          const moving=actual[actual.length-1];
          let next=pages[i+1];
          if(!next){next=createAnnualContinuationPage(page);page.after(next);}
          const nextBody=next.querySelector('.fm-training tbody');
          nextBody?.querySelectorAll('tr.blank').forEach(row=>row.remove());
          if(nextBody)nextBody.insertBefore(moving,nextBody.firstChild);
          page.dataset.fmSlotTarget=String(annualActualRows(page).length);
          next.dataset.fmSlotTarget=String(annualActualRows(next).length);
          normalizeAnnualPageRows(page);normalizeAnnualPageRows(next);
          changed=true;break;
        }
      }
      if(!changed)break;
      await wait(12);
    }
    [...doc.querySelectorAll('.fm-page')].forEach(page=>{
      page.dataset.fmSlotTarget=String(annualBestSlotTarget(page));
      normalizeAnnualPageRows(page);
    });
    const count=refreshAnnualPageLabels(doc);
    await wait(60);
    return count;
  }
  async function createAnnualFrame(bundle){
    const frame=document.createElement('iframe');
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;background:#fff;';
    document.body.appendChild(frame);
    const doc=frame.contentDocument;
    doc.open();
    doc.write(`<html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${bundle.styles}</style></head><body>${bundle.sections}</body></html>`);
    doc.close();
    await waitForFrameAssets(doc);
    bundle.pageCount=await rebalanceAnnualTrainingPages(doc);
    return frame;
  }
  function dataUrlBytes(dataUrl){
    const base64=String(dataUrl||'').split(',')[1]||'',binary=atob(base64),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }
  function canvasPngBytes(canvas){return dataUrlBytes(canvas.toDataURL('image/png',1));}
  function safeDownloadName(value){return String(value||'เอกสาร').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();}
  function fitBox(width,height,maxWidth,maxHeight){const scale=Math.min(maxWidth/Math.max(width,1),maxHeight/Math.max(height,1));return {width:width*scale,height:height*scale};}
  function wrapCanvasText(ctx,text,maxWidth){
    const words=String(text||'').split(/\s+/).filter(Boolean),lines=[];let line='';
    for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width<=maxWidth||!line)line=test;else{lines.push(line);line=word;}}
    if(line)lines.push(line);return lines.slice(0,2);
  }
  async function certificateHeaderImage(pdfDoc,item,index,total){
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=190;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#222';ctx.lineWidth=2;ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);
    ctx.fillStyle='#111';ctx.textBaseline='top';ctx.font='700 44px "TH Sarabun New",Sarabun,Tahoma,sans-serif';ctx.fillText(`เอกสารแนบลำดับที่ ${index} จาก ${total}`,40,22);
    ctx.font='600 36px "TH Sarabun New",Sarabun,Tahoma,sans-serif';const lines=wrapCanvasText(ctx,item.activity.title||'-',canvas.width-80);lines.forEach((line,i)=>ctx.fillText(line,40,78+i*39));
    ctx.font='400 28px "TH Sarabun New",Sarabun,Tahoma,sans-serif';ctx.textAlign='right';ctx.fillText(`${dateLabel(item.activity.start_date)}${dateKey(item.activity.end_date)!==dateKey(item.activity.start_date)?' – '+dateLabel(item.activity.end_date):''}`,canvas.width-40,28);ctx.textAlign='left';
    return pdfDoc.embedPng(canvasPngBytes(canvas));
  }
  async function downloadCertificate(record){
    const path=String(record?.certificate_path||'').trim();if(!path)throw new Error('ไม่พบที่อยู่ไฟล์ Certificate');
    if(/^https?:\/\//i.test(path)){const res=await fetch(path,{credentials:'include'});if(!res.ok)throw new Error(`ดาวน์โหลด Certificate ไม่สำเร็จ (${res.status})`);return res.blob();}
    const cleanPath=path.replace(/^staff-files\//,'').replace(/^\/+/,''),res=await DB().storage.from('staff-files').download(cleanPath);
    if(res.error)throw res.error;return res.data;
  }
  function certificateKind(record,blob){
    const mime=String(record?.certificate_mime_type||blob?.type||'').toLowerCase(),name=String(record?.certificate_name||record?.certificate_path||'').toLowerCase();
    if(mime.includes('pdf')||name.endsWith('.pdf'))return 'pdf';
    if(mime.startsWith('image/')||/\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name))return 'image';
    return 'unknown';
  }
  async function blobToPngEmbed(pdfDoc,blob){
    const url=URL.createObjectURL(blob);try{
      const img=new Image();img.decoding='async';
      const loaded=new Promise((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('เปิดไฟล์รูป Certificate ไม่สำเร็จ'));});
      img.src=url;if(typeof img.decode==='function')await img.decode().catch(()=>loaded);else await loaded;
      const sourceWidth=img.naturalWidth||img.width,sourceHeight=img.naturalHeight||img.height,maxSide=3000,scale=Math.min(1,maxSide/Math.max(sourceWidth,sourceHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sourceWidth*scale));canvas.height=Math.max(1,Math.round(sourceHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return pdfDoc.embedPng(canvasPngBytes(canvas));
    }finally{URL.revokeObjectURL(url);}
  }
  async function appendCertificatePdf(pdfDoc,blob,item,index,total){
    const bytes=new Uint8Array(await blob.arrayBuffer()),source=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false}),sourcePages=source.getPages(),indices=sourcePages.map((_,i)=>i),embedded=await pdfDoc.embedPdf(bytes,indices),header=await certificateHeaderImage(pdfDoc,item,index,total);
    const A4W=595.28,A4H=841.89,margin=28,headerH=68,gap=10,maxW=A4W-margin*2,maxH=A4H-margin*2-headerH-gap;
    embedded.forEach((embeddedPage,i)=>{const page=pdfDoc.addPage([A4W,A4H]),size=sourcePages[i].getSize(),fit=fitBox(size.width,size.height,maxW,maxH);page.drawImage(header,{x:margin,y:A4H-margin-headerH,width:maxW,height:headerH});page.drawPage(embeddedPage,{x:(A4W-fit.width)/2,y:margin+(maxH-fit.height)/2,width:fit.width,height:fit.height});});
  }
  async function appendCertificateImage(pdfDoc,blob,item,index,total){
    const image=await blobToPngEmbed(pdfDoc,blob),header=await certificateHeaderImage(pdfDoc,item,index,total),A4W=595.28,A4H=841.89,margin=28,headerH=68,gap=10,maxW=A4W-margin*2,maxH=A4H-margin*2-headerH-gap,fit=fitBox(image.width,image.height,maxW,maxH),page=pdfDoc.addPage([A4W,A4H]);
    page.drawImage(header,{x:margin,y:A4H-margin-headerH,width:maxW,height:headerH});page.drawImage(image,{x:(A4W-fit.width)/2,y:margin+(maxH-fit.height)/2,width:fit.width,height:fit.height});
  }
  function fmMergeLineSegments(raw){
    const groups=new Map(),round=v=>Math.round(v*4)/4;
    for(const seg of raw){
      const horizontal=Math.abs(seg.y2-seg.y1)<=0.5;
      const fixed=round(horizontal?(seg.y1+seg.y2)/2:(seg.x1+seg.x2)/2);
      const start=round(horizontal?Math.min(seg.x1,seg.x2):Math.min(seg.y1,seg.y2));
      const end=round(horizontal?Math.max(seg.x1,seg.x2):Math.max(seg.y1,seg.y2));
      const key=`${horizontal?'h':'v'}:${fixed}`;
      if(!groups.has(key))groups.set(key,{horizontal,fixed,ranges:[]});
      groups.get(key).ranges.push([start,end]);
    }
    const merged=[];
    for(const group of groups.values()){
      group.ranges.sort((a,b)=>a[0]-b[0]);
      const ranges=[];
      for(const range of group.ranges){
        const last=ranges[ranges.length-1];
        if(last&&range[0]<=last[1]+0.75)last[1]=Math.max(last[1],range[1]);
        else ranges.push(range.slice());
      }
      for(const [start,end] of ranges){
        merged.push(group.horizontal?{x1:start,y1:group.fixed,x2:end,y2:group.fixed}:{x1:group.fixed,y1:start,x2:group.fixed,y2:end});
      }
    }
    return merged;
  }
  function fmVectorLineGeometry(pageElement){
    const pageRect=pageElement.getBoundingClientRect(),raw=[];
    const addLine=(x1,y1,x2,y2)=>raw.push({x1:x1-pageRect.left,y1:y1-pageRect.top,x2:x2-pageRect.left,y2:y2-pageRect.top});
    const addRect=element=>{
      const r=element.getBoundingClientRect();
      addLine(r.left,r.top,r.right,r.top);addLine(r.right,r.top,r.right,r.bottom);
      addLine(r.left,r.bottom,r.right,r.bottom);addLine(r.left,r.top,r.left,r.bottom);
    };
    pageElement.querySelectorAll('.fm-header td,.fm-training th,.fm-training td').forEach(addRect);
    const person=pageElement.querySelector('.fm-person');if(person)addRect(person);
    pageElement.querySelectorAll('.fm-fill-line').forEach(element=>{const r=element.getBoundingClientRect();addLine(r.left,r.bottom,r.right,r.bottom);});
    return {width:pageRect.width,height:pageRect.height,segments:fmMergeLineSegments(raw)};
  }
  function drawFmVectorLines(pdfPage,geometry,fit,x,y){
    if(!geometry?.segments?.length||!geometry.width||!geometry.height)return;
    const scaleX=fit.width/geometry.width,scaleY=fit.height/geometry.height,color=window.PDFLib.rgb(0,0,0);
    for(const seg of geometry.segments){
      pdfPage.drawLine({
        start:{x:x+seg.x1*scaleX,y:y+fit.height-seg.y1*scaleY},
        end:{x:x+seg.x2*scaleX,y:y+fit.height-seg.y2*scaleY},
        thickness:0.5,
        color
      });
    }
  }
  function triggerBlobDownload(blob,fileName){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeDownloadName(fileName);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
  async function buildAnnualTrainingPdf(items,options={},onProgress=()=>{}){
    const bundle=annualFormDocument(items,options);if(!bundle)throw new Error('ข้อมูลบุคลากรหรือปีแบบฟอร์มไม่ครบ');
    if(!window.PDFLib?.PDFDocument||typeof window.html2canvas!=='function')throw new Error('ยังโหลดระบบสร้าง PDF ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    const certificates=(items||[]).filter(x=>x.record.certificate_path),errors=[];let frame;
    try{
      const pdfDoc=await PDFLib.PDFDocument.create();frame=await createAnnualFrame(bundle);const pages=[...frame.contentDocument.querySelectorAll('.fm-page')];if(!pages.length)throw new Error('ไม่พบหน้าตาราง FM-CNHR-002 สำหรับสร้าง PDF');const MM=72/25.4,A4W=210*MM,A4H=297*MM,marginX=5*MM,top=5*MM,maxW=200*MM,maxH=286*MM;
      for(let i=0;i<pages.length;i++){
        onProgress(`กำลังสร้างตาราง PDF ${i+1}/${pages.length}`);
        const pageElement=pages[i],lineGeometry=fmVectorLineGeometry(pageElement);pageElement.classList.add('fm-vector-line-capture');let canvas;
        try{canvas=await window.html2canvas(pageElement,{scale:3,backgroundColor:'#fff',useCORS:true,logging:false,scrollX:0,scrollY:0,width:pageElement.scrollWidth,height:pageElement.scrollHeight,windowWidth:pageElement.scrollWidth,windowHeight:pageElement.scrollHeight});}
        finally{pageElement.classList.remove('fm-vector-line-capture');}
        const image=await pdfDoc.embedPng(canvasPngBytes(canvas)),fit=fitBox(image.width,image.height,maxW,maxH),pdfPage=pdfDoc.addPage([A4W,A4H]),imageY=A4H-top-fit.height;
        pdfPage.drawImage(image,{x:marginX,y:imageY,width:fit.width,height:fit.height});drawFmVectorLines(pdfPage,lineGeometry,fit,marginX,imageY);
      }
      for(let i=0;i<certificates.length;i++){
        const item=certificates[i];onProgress(`กำลังแนบ Certificate ${i+1}/${certificates.length}`);
        try{const blob=await downloadCertificate(item.record),kind=certificateKind(item.record,blob);if(kind==='pdf')await appendCertificatePdf(pdfDoc,blob,item,i+1,certificates.length);else if(kind==='image')await appendCertificateImage(pdfDoc,blob,item,i+1,certificates.length);else throw new Error('ชนิดไฟล์ไม่รองรับ');}catch(error){errors.push(`${item.activity.title||'Certificate'}: ${error?.message||String(error)}`);}
      }
      onProgress('กำลังบันทึกไฟล์ PDF…');
      return {bytes:await pdfDoc.save(),bundle,errors,certificateCount:certificates.length};
    }finally{frame?.remove();}
  }
  async function exportMyAnnualTrainingPackage(items,button){
    if(!isMyTrainingFilterReady())return showToast('กรุณาเลือกสถานะข้อมูลและปีแบบฟอร์มก่อน');
    if(!items.length)return showToast(`ไม่พบรายการอบรมในปี ${selectedTrainingYear()+543}`);
    const incomplete=items.filter(x=>!trainingRecordComplete(x.record));
    if(incomplete.length){
      const year=selectedTrainingYear()+543;
      const examples=incomplete.slice(0,2).map(x=>String(x.activity?.title||'').trim()).filter(Boolean);
      return showToast(`ยัง Export PDF ไม่ได้ • กรุณากรอก “ผล/สิ่งที่ได้รับ” และ “การนำความรู้ไปใช้” ให้ครบทุกกิจกรรมในปี พ.ศ. ${year} • ค้าง ${incomplete.length} รายการ${examples.length?' เช่น '+examples.join(', '):''}`);
    }
    const originalText=button?.textContent||'';
    try{
      if(button)button.disabled=true;
      const built=await buildAnnualTrainingPdf(items,{staffId:actor(),year:selectedTrainingYear()},text=>{if(button)button.textContent=text;});
      triggerBlobDownload(new Blob([built.bytes],{type:'application/pdf'}),`FM-CNHR-002_${built.bundle.personName}_${built.bundle.year+543}_พร้อม-Certificate.pdf`);
      if(built.errors.length){console.warn('V421 certificate merge skipped',built.errors);showToast(`สร้าง PDF แล้ว แต่แนบ Certificate ไม่สำเร็จ ${built.errors.length} ไฟล์`);}else showToast(`สร้าง PDF ชุดอบรมแล้ว • แนบ Certificate ${built.certificateCount} ไฟล์`);
    }catch(error){console.error('V421 annual training PDF',error);showToast(`สร้าง PDF ไม่สำเร็จ: ${error?.message||String(error)}`);}finally{if(button){button.disabled=false;button.textContent=originalText||'Export PDF ชุดอบรมประจำปี';}}
  }
  function adminExportYear(){const from=Number(String(S().v396From||'').slice(0,4)),to=Number(String(S().v396To||'').slice(0,4));return from&&from===to?from:0;}
  async function exportAdminAnnualTrainingPackage(button){
    if(!adminFiltersReady())return showToast('กรุณาเลือกบุคลากรและสถานะข้อมูลก่อน');
    const year=adminExportYear();if(!year)return showToast('กรุณาเลือกช่วงวันที่ให้อยู่ภายในปีเดียวกัน');
    const s=S(),rows=filtered(),activeStaff=(S().staff||[]).filter(x=>x.is_active!==false),targets=s.v396Staff==='all'?activeStaff:[staffOf(s.v396Staff)].filter(x=>x.id),groups=[];
    for(const person of targets){const items=rows.filter(x=>idEq(x.record.staff_id,person.id)).sort((a,b)=>dateKey(a.activity.start_date).localeCompare(dateKey(b.activity.start_date)));if(items.length||s.v396Status==='all')groups.push({staffId:person.id,items});}
    if(!groups.length)return showToast('ไม่พบข้อมูลสำหรับ Export ตามตัวกรอง');
    const originalText=button?.textContent||'',allPeople=s.v396Staff==='all',errors=[];
    try{
      if(button)button.disabled=true;
      if(!allPeople&&groups.length===1){
        const group=groups[0],built=await buildAnnualTrainingPdf(group.items,{staffId:group.staffId,year},text=>{if(button)button.textContent=text;});
        triggerBlobDownload(new Blob([built.bytes],{type:'application/pdf'}),`FM-CNHR-002_${built.bundle.personName}_${year+543}_พร้อม-Certificate.pdf`);errors.push(...built.errors.map(x=>`${built.bundle.personName}: ${x}`));
      }else{
        if(!window.JSZip)throw new Error('ยังโหลดระบบรวมไฟล์ ZIP ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
        const zip=new JSZip();
        for(let i=0;i<groups.length;i++){
          const group=groups[i],name=staffOf(group.staffId).full_name||staffName(group.staffId);if(button)button.textContent=`กำลังสร้าง ${i+1}/${groups.length}: ${name}`;
          const built=await buildAnnualTrainingPdf(group.items,{staffId:group.staffId,year},text=>{if(button)button.textContent=`${i+1}/${groups.length} • ${text}`;});
          zip.file(safeDownloadName(`FM-CNHR-002_${built.bundle.personName}_${year+543}_พร้อม-Certificate.pdf`),built.bytes);errors.push(...built.errors.map(x=>`${built.bundle.personName}: ${x}`));
        }
        if(button)button.textContent='กำลังรวมไฟล์ ZIP…';const zipBlob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});triggerBlobDownload(zipBlob,`FM-CNHR-002_เจ้าหน้าที่ทุกคน_${year+543}_พร้อม-Certificate.zip`);
      }
      if(errors.length){console.warn('V421 admin certificate merge skipped',errors);showToast(`Export สำเร็จ แต่แนบ Certificate ไม่สำเร็จ ${errors.length} ไฟล์`);}else showToast(`Export FM-CNHR-002 สำเร็จ ${groups.length} คน`);
    }catch(error){console.error('V421 admin annual training export',error);showToast(`Export ไม่สำเร็จ: ${error?.message||String(error)}`);}finally{if(button){button.disabled=false;button.textContent=originalText||(allPeople?'Export PDF ทุกคน':'Export PDF บุคลากรที่เลือก');}}
  }
  function printMyAnnualForm(items,button){return exportMyAnnualTrainingPackage(items,button);}


  let v417LastPage='';
  function resetTrainingFiltersOnEntry(page){
    const s=S(),year=currentGregorianYear();
    if(page==='myTraining'){s.v402MyStatus='รอกรอกข้อมูล';s.v407TrainingYear='';s.v396MyFrom='';s.v396MyTo='';s.v417MyTrainingPage=1;}
    if(page==='trainingAdmin'){s.v396From=`${year}-01-01`;s.v396To=`${year}-12-31`;s.v396Staff='';s.v396Status='';}
  }
  function renderPageV396(){const p=S().page;if(p==='myTraining'||p==='trainingAdmin'){if(v417LastPage!==p)resetTrainingFiltersOnEntry(p);v417LastPage=p;const item=NAV_ITEMS.find(x=>x.id===p);$('pageTitle').textContent=item.title;$('pageSubtitle').textContent=item.subtitle;renderNav();$('pageContent').innerHTML=p==='myTraining'?renderMyTraining():renderTrainingAdmin();return;}v417LastPage=p;return oldRenderPage.apply(this,arguments);}
  const oldRenderPage=window.renderPage||renderPage;window.renderPage=renderPageV396;try{(0,eval)('renderPage=window.renderPage');}catch(_){ }
  NAV_ITEMS.splice(NAV_ITEMS.findIndex(x=>x.id==='activities')+1,0,{id:'myTraining',icon:'🎓',title:'รายการอบรมของฉัน',subtitle:'กรอกผลการอบรมและ Export FM-CNHR-002',group:'staff'});NAV_ITEMS.push({id:'trainingAdmin',icon:'🧾',title:'ตรวจสอบอบรมของเจ้าหน้าที่',subtitle:'Admin/แพทย์กรองและ Export ประวัติอบรม',group:'admin'});
  const oldNav=window.renderNav||renderNav;window.renderNav=function(){oldNav.apply(this,arguments);if(isManager()&&!document.querySelector('[data-page="trainingAdmin"]')){const nav=document.getElementById('mainNav');if(nav)nav.insertAdjacentHTML('beforeend','<div class="nav-section v396-doctor-nav"><div class="nav-section-title"><span>เมนู Admin/แพทย์</span><small>ตรวจสอบข้อมูลอบรม</small></div><button class="nav-btn" data-page="trainingAdmin"><span class="nav-emoji">🧾</span><span>ตรวจสอบอบรมของเจ้าหน้าที่</span></button></div>');}};try{(0,eval)('renderNav=window.renderNav');}catch(_){ }

  async function saveRecord(form){const r=trainingRows().find(x=>idEq(x.id,form.dataset.v396Record));if(!r||(!idEq(r.staff_id,actor())&&!isManager()))return showToast('ไม่มีสิทธิ์แก้ไขรายการนี้');const fd=new FormData(form),patch={result_text:String(fd.get('result_text')||'').trim()||null,application_text:String(fd.get('application_text')||'').trim()||null,updated_by:actor()};try{const file=fd.get('certificate');if(file?.size){const safe=String(file.name||'certificate').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`training-certificates/${r.staff_id}/${r.id}_${Date.now()}_${safe}`;const up=await DB().storage.from('staff-files').upload(path,file,{upsert:false});if(up.error)throw up.error;patch.certificate_path=path;patch.certificate_name=file.name;patch.certificate_mime_type=file.type||null;}const res=await DB().from(TABLE).update(patch).eq('id',r.id);if(res.error)throw res.error;await loadTraining();renderPage();showToast('บันทึกข้อมูลอบรมแล้ว');}catch(e){showToast(e?.message||String(e));}}
  document.addEventListener('submit',e=>{if(e.target?.id==='activityForm'){e.preventDefault();e.stopImmediatePropagation();saveActivityV396(e.target);}else if(e.target?.matches?.('[data-v396-record]')){e.preventDefault();e.stopImmediatePropagation();saveRecord(e.target);}},true);
  document.addEventListener('change',e=>{if(e.target?.name==='include_fm_cnhr_002'){const wrap=e.target.closest('.v405-training-meta-grid'),required=e.target.checked===true;wrap?.querySelectorAll('.v405-training-field').forEach(field=>{field.classList.toggle('v405-required',required);const input=field.querySelector('input');if(input){input.required=required;input.setAttribute('aria-required',required?'true':'false');}});const batchInput=wrap?.querySelector('input[name="training_batch"]');if(required&&batchInput&&!String(batchInput.value||'').trim())batchInput.value='-';return;}if(e.target?.id==='v407TrainingYear'){applyTrainingYearRange(e.target.value);S().v417MyTrainingPage=1;renderPage();return;}const m={v402MyStatus:'v402MyStatus',v396MyFrom:'v396MyFrom',v396MyTo:'v396MyTo',v396From:'v396From',v396To:'v396To',v396Staff:'v396Staff',v396Status:'v396Status'};if(m[e.target?.id]){S()[m[e.target.id]]=e.target.value||'';if(e.target.id==='v402MyStatus')S().v417MyTrainingPage=1;renderPage();}},true);
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-v402-my-export')){e.preventDefault();e.stopImmediatePropagation();printMyAnnualForm(myTrainingAnnualRows(),b);}else if(b.hasAttribute('data-v396-admin-export')){e.preventDefault();e.stopImmediatePropagation();exportAdminAnnualTrainingPackage(b);}else if(b.hasAttribute('data-v417-my-page')){e.preventDefault();e.stopImmediatePropagation();const totalPages=Math.max(1,Math.ceil(myTrainingRows().length/MY_TRAINING_PAGE_SIZE)),requested=Number(b.getAttribute('data-v417-my-page'));S().v417MyTrainingPage=Math.min(totalPages,Math.max(1,Number.isInteger(requested)?requested:1));renderPage();window.scrollTo?.({top:0,behavior:'smooth'});}},true);
  // staff_profiles ในฐานข้อมูลจริงไม่มี updated_by จึงห้ามส่งฟิลด์นี้ไปตอน Active/ข้อมูลผู้ใช้งาน
  document.addEventListener('click',e=>{const b=e.target.closest('button[data-save-staff-users]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();(async()=>{const card=document.querySelector('[data-staff-row]'),id=S().usersStaffId;if(!card||!id)return;const get=k=>card.querySelector(`[data-field="${k}"]`)?.value;const patch={nickname:get('nickname'),full_name:get('full_name'),email:get('email'),employee_code:get('employee_code'),phone:get('phone'),login_name:get('login_name')||null,staff_color:get('staff_color'),staff_type:get('staff_type'),position:get('position'),role:get('role'),is_active:get('is_active')==='true',roster_enabled:get('roster_enabled')!=='false',daily_position_enabled:get('daily_position_enabled')!=='false',is_long_term_leave:get('is_long_term_leave')==='true',position_training_status:get('position_training_status'),employment_start_date:get('employment_start_date')||null,employment_end_date:get('employment_end_date')||null,daily_position_start_date:get('daily_position_start_date')||null};const q=await DB().from('staff_profiles').update(patch).eq('id',id);if(q.error)return showToast(q.error.message);await loadAllData();renderPage();showToast('บันทึกข้อมูลผู้ใช้งานและวันเริ่มงานแล้ว');})();},true);

  const oldProfile=window.renderMyProfilePage||renderMyProfilePage;window.renderMyProfilePage=function(){const html=oldProfile.apply(this,arguments);return html.replace('</div>','<div class="card"><h3>วันเริ่มงาน</h3><p>'+esc(employment(actor())||'ยังไม่ระบุ')+'</p><span class="hint">ข้อมูลนี้ใช้เป็นข้อมูลตั้งต้นในแบบฟอร์ม FM-CNHR-002</span></div></div>');};try{(0,eval)('renderMyProfilePage=window.renderMyProfilePage');}catch(_){ }
  const oldUsers=window.renderUsersPage||renderUsersPage;window.renderUsersPage=function(){let html=oldUsers.apply(this,arguments);html=html.replace('<label>Email <input data-field="email"','<label>วันเริ่มงาน <input type="date" data-field="employment_start_date" value="'+esc(staffOf(S().usersStaffId).employment_start_date||'')+'"></label><label>ใช้งานถึงวันที่ <input type="date" data-field="employment_end_date" value="'+esc(staffOf(S().usersStaffId).employment_end_date||'')+'"><small class="hint">หลังวันที่นี้บัญชีจะเข้าแอปไม่ได้ และชื่อจะไม่ถูกนำไปจัดตารางเดือนถัดไป</small></label><label>เริ่มเป็นตัวจริง/จัดตำแหน่งกลางวัน <input type="date" data-field="daily_position_start_date" value="'+esc(staffOf(S().usersStaffId).daily_position_start_date||'')+'"><small class="hint">ใช้กรณีน้องใหม่เปลี่ยนเป็นตัวจริง เช่น 01/10/2569 โดยไม่กระทบตำแหน่งที่บันทึกไว้ก่อนหน้า</small></label><label>Email <input data-field="email"');html=html.replace('<label>ชื่อเล่น <input name="nickname"','<label>วันเริ่มงาน <input name="employment_start_date" type="date"></label><label>ใช้งานถึงวันที่ <input name="employment_end_date" type="date"></label><label>เริ่มเป็นตัวจริง/จัดตำแหน่งกลางวัน <input name="daily_position_start_date" type="date"></label><label>ชื่อเล่น <input name="nickname"');return html;};try{(0,eval)('renderUsersPage=window.renderUsersPage');}catch(_){ }
  const oldLeaveBadge=window.leaveCellBadge||leaveCellBadge;window.leaveCellBadge=function(l){const text=leaveDisplayType(l),period=String(l?.leave_period||'เต็มวัน');return `<span class="mini-status ${leaveCellClass(text)}">${esc(text)}${period!=='เต็มวัน'?`<small class="v396-halfday">${esc(period.replace(/\\s*\\d{2}:\\d{2}-\\d{2}:\\d{2}/,'').trim())}</small>`:''}</span>`;};try{(0,eval)('leaveCellBadge=window.leaveCellBadge');}catch(_){ }
  const oldEventText=window.eventText||eventText;window.eventText=function(type){return oldEventText(type);};
  const style=document.createElement('style');style.textContent=`
    .v396-participants{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:240px;overflow:auto}.v396-participant{display:flex;gap:8px;padding:8px;border:1px solid #d9e4ed;border-radius:10px;background:#fff}.v396-participant input{width:auto}.v396-participant span{display:grid}.v396-participant small{color:#68798a}.v405-training-meta-grid{display:grid;grid-template-columns:minmax(260px,1.15fr) minmax(220px,1fr) minmax(170px,.72fr);gap:12px;align-items:stretch}.v396-training-check{display:flex;gap:9px;align-items:flex-start;padding:12px;border:1px solid #9bc8e2;border-radius:12px;background:#f2faff;font-weight:700;margin:0}.v396-training-check input{width:auto;margin-top:4px}.v396-training-check small{display:block;font-weight:400;color:#587087}.v405-training-field{display:grid;align-content:start;gap:5px;padding:10px 12px;border:1px solid #d9e4ed;border-radius:12px;background:#fff;margin:0}.v405-training-field input{margin-top:0}.v405-required-mark{display:none;color:#c93b52}.v405-training-field.v405-required{border-color:#75bce6;background:#f8fcff}.v405-training-field.v405-required .v405-required-mark{display:inline}
    .v439-export-gate{display:block;margin-top:7px;font-size:12px;line-height:1.35;font-weight:700}.v439-export-gate-warn{color:#a85a00}.v439-export-gate-ok{color:#18794e}
    .v396-record-list{display:grid;gap:16px;margin-top:16px}.v396-record textarea{width:100%;resize:vertical}.v396-filters{align-items:end}.v401-my-training-filters{grid-template-columns:repeat(2,minmax(180px,260px));justify-content:start}.v402-my-training-filters{display:grid;grid-template-columns:minmax(180px,230px) minmax(200px,250px) minmax(280px,1fr);align-items:end;gap:12px}.v402-export-wrap{display:grid;gap:5px;align-content:end}.v402-export-wrap button{width:100%}.v402-export-wrap button:disabled,.section-title button:disabled{opacity:.48;cursor:not-allowed}.v396-halfday{display:block;font-size:10px;font-weight:700}
    .v417-my-training-filters{align-items:start}.v417-my-training-filters>label,.v417-my-training-filters>.v402-export-wrap{display:grid;grid-template-rows:auto 42px;gap:6px;align-content:start;margin:0}.v417-control-label{display:block;font-weight:700;color:#263e50;line-height:1.2}.v417-my-training-filters select,.v417-my-training-filters button{height:42px;min-height:42px;margin:0}.v417-training-pagination{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:14px}.v417-training-pagination span{min-width:78px;text-align:center;color:#607789;font-size:.86rem;font-weight:700}.v417-page-btn{min-height:32px!important;padding:5px 12px!important;border-radius:9px!important;font-size:.84rem!important}.v417-page-btn:disabled{opacity:.42;cursor:not-allowed}
    .v416-filter-gate,.v416-admin-training-filters{border:1px solid #d7e6f0;background:#f8fbfd;border-radius:14px;padding:12px}.v416-admin-training-filters{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:12px}.v416-selection-prompt{margin-top:16px;min-height:150px;border:1px dashed #9fc6de;border-radius:16px;background:linear-gradient(180deg,#f8fcff,#fff);display:flex;align-items:center;justify-content:center;gap:14px;padding:24px;color:#24455f;text-align:left}.v416-selection-prompt b{display:block;font-size:1.05rem}.v416-selection-prompt small{display:block;margin-top:4px;color:#6b7f90}.v416-selection-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#e4f4ff;color:#1681bf;font-size:28px;font-weight:700}
    .v416-training-card{padding:0;overflow:hidden;border:1px solid #d7e3ec;box-shadow:0 8px 24px rgba(32,77,108,.06)}.v416-training-card-pending{border-left:4px solid #f0ad4e}.v416-training-card-complete{border-left:4px solid #4caf7d}.v416-record-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:16px;padding:16px 18px 12px}.v416-record-heading{min-width:0}.v416-record-heading h3{margin:4px 0 0;line-height:1.35;font-size:1.02rem}.v416-record-number{display:inline-block;font-size:.75rem;font-weight:700;color:#4c718b;background:#eef7fc;border-radius:999px;padding:3px 9px}.v416-record-status{padding-top:2px;white-space:nowrap}.v416-record-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid #e5edf3;border-bottom:1px solid #e5edf3;background:#f8fbfd}.v416-record-meta span{min-width:0;padding:9px 12px;border-right:1px solid #e5edf3;font-size:.82rem;line-height:1.35;overflow-wrap:anywhere}.v416-record-meta span:last-child{border-right:0}.v416-record-meta b{display:block;color:#587086;font-size:.72rem;margin-bottom:2px}.v416-record-form{padding:14px 18px 16px}.v416-record-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}.v416-answer-field{display:grid;grid-template-rows:auto auto minmax(112px,1fr);gap:5px;margin:0;padding:12px;border:1px solid #cfe0eb;border-radius:13px;background:#fff}.v416-answer-field:focus-within{border-color:#58ace0;box-shadow:0 0 0 3px rgba(88,172,224,.12);background:#fbfeff}.v416-field-title{font-weight:700;color:#193d56}.v416-answer-field small,.v416-certificate-field small,.v416-save-area small{color:#718493;font-weight:400}.v416-answer-field textarea{min-height:112px;height:112px;margin:2px 0 0;border-radius:10px;background:#fbfdff}.v416-record-bottom{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:end;margin-top:12px;padding-top:12px;border-top:1px solid #e7eef3}.v416-certificate-field{display:grid;gap:5px;margin:0}.v416-certificate-field input{max-width:100%}.v416-file-current{color:#277857!important}.v416-save-area{display:grid;gap:6px;justify-items:end;text-align:right}.v416-save-area button{min-width:170px}
    @media(max-width:1050px){.v416-admin-training-filters{grid-template-columns:repeat(2,minmax(180px,1fr))}.v416-record-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.v416-record-meta span:nth-child(2){border-right:0}.v416-record-meta span:nth-child(-n+2){border-bottom:1px solid #e5edf3}}
    @media(max-width:900px){.v405-training-meta-grid{grid-template-columns:1fr}.v402-my-training-filters{grid-template-columns:1fr 1fr}.v402-export-wrap{grid-column:1/-1}}
    @media(max-width:700px){.v396-participants{grid-template-columns:1fr}.v396-filters{display:grid;grid-template-columns:1fr 1fr}.v396-filters label:last-child{grid-column:1/-1}.v401-my-training-filters label:last-child{grid-column:auto}.v402-my-training-filters label:last-of-type{grid-column:auto}.v407-year-filter .v402-export-wrap{grid-column:1/-1}.v416-record-form-grid{grid-template-columns:1fr}.v416-record-bottom{grid-template-columns:1fr}.v416-save-area{justify-items:stretch;text-align:left}.v416-save-area button{width:100%}.v416-record-head{gap:10px}.v416-record-meta{grid-template-columns:1fr}.v416-record-meta span{border-right:0!important;border-bottom:1px solid #e5edf3}.v416-record-meta span:last-child{border-bottom:0}.v417-training-pagination{justify-content:center}}
    @media(max-width:460px){.v401-my-training-filters,.v402-my-training-filters,.v416-admin-training-filters{grid-template-columns:1fr}.v401-my-training-filters label:last-child,.v402-my-training-filters label:last-of-type,.v402-export-wrap{grid-column:1/-1}.v416-record-head{grid-template-columns:1fr}.v416-record-status{justify-self:start}.v416-selection-prompt{align-items:flex-start;padding:18px}.v416-record-form,.v416-record-head{padding-left:13px;padding-right:13px}}
  `;document.head.appendChild(style);
  loadTraining();
})();

} catch (error) { console.error("[v569] patch-v396-training-integrated.js", error); }
;

/* Original source: patch-v397-activity-dashboard-clarity.js */
try {
/* CNMI Staff Planner V397
 * ปรับความชัดเจนของกิจกรรม/ภาพรวม/Calendar และแก้ Active staff_profiles
 */
(function () {
  'use strict';
  if (window.__CNMI_V397_ACTIVITY_DASHBOARD__) return;
  window.__CNMI_V397_ACTIVITY_DASHBOARD__ = true;

  const S = () => window.state || state;
  const esc = v => typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = v => String(v || '').slice(0, 10);
  const person = id => typeof staffNick === 'function' ? staffNick(id) : '-';

  function periodLabel(row) {
    const raw = String(row?.leave_period || row?.period || 'เต็มวัน').trim();
    if (!raw || raw === 'เต็มวัน' || raw === 'ทั้งวัน') return 'เต็มวัน';
    if (/เช้า|morning/i.test(raw)) return 'ครึ่งเช้า';
    if (/บ่าย|afternoon/i.test(raw)) return 'ครึ่งบ่าย';
    return raw;
  }
  function periodHtml(row) {
    return `<span class="v397-period">${esc(periodLabel(row))}</span>`;
  }
  // บังคับให้ช่องปฏิทิน/ตารางที่ใช้ leaveCellBadge แสดงช่วงลาเสมอ
  window.leaveCellBadge = function (row) {
    if (!row) return '';
    const type = typeof leaveDisplayType === 'function' ? leaveDisplayType(row) : (row.type || 'ลา');
    return `<span class="mini-status ${leaveCellClass(type)}">${esc(type)}<small class="v397-halfday-cell">${esc(periodLabel(row))}</small></span>`;
  };
  try { (0, eval)('leaveCellBadge=window.leaveCellBadge'); } catch (_) {}
  function timeText(a) {
    const s = String(a?.start_time || '').slice(0, 5);
    const e = String(a?.end_time || '').slice(0, 5);
    return s && e ? `${s}–${e} น.` : (s ? `${s} น.` : 'ไม่ระบุเวลา');
  }
  function activityHtml(a) {
    const names = (Array.isArray(a?.participant_ids) ? a.participant_ids : []).map(person).filter(x => x && x !== '-');
    return `<div class="v397-activity-item"><div><b>${esc(a?.title || '-')}</b> ${badge(a?.event_type || 'อื่นๆ', typeof activityClass === 'function' ? activityClass(a?.event_type) : 'blue')}</div><div class="v397-detail-line">เวลา: ${esc(timeText(a))} · สถานที่: ${esc(a?.location || 'ไม่ระบุ')}</div>${names.length ? `<div class="v397-detail-line">ผู้เข้าร่วม: ${esc(names.join(', '))}</div>` : ''}${a?.note ? `<div class="v397-detail-note">หมายเหตุ: ${esc(a.note)}</div>` : ''}</div>`;
  }

  // ลดความแน่นของหน้ากิจกรรมด้านขวา โดยยังคงข้อมูล/ปุ่มเดิมไว้ครบ
  const oldActivities = window.renderActivitiesPage || renderActivitiesPage;
  window.renderActivitiesPage = function () {
    let html = oldActivities.apply(this, arguments);
    html = html.replace('<div class="grid grid-2">', '<div class="grid v397-activities-layout">');
    html = html.replace('<div class="card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3></div>', '<div class="card v397-all-activities"><div class="section-title"><div><h3>กิจกรรมทั้งหมด</h3><p class="hint">เลื่อนดูรายการที่ต้องการแก้ไขหรือลบ</p></div></div>');
    html = html.replace('นำเข้าแบบฟอร์ม FM-CNHR-002 <small>ติ๊กเมื่อ ต้องการเก็บกิจกรรมนี้เป็นประวัติการอบรมของผู้เข้าร่วม</small>', 'เก็บเป็นประวัติอบรม FM-CNHR-002 <small>เลือกเฉพาะกิจกรรมที่ต้องการบันทึกเข้าประวัติอบรม</small>');
    return html;
  };
  try { (0, eval)('renderActivitiesPage=window.renderActivitiesPage'); } catch (_) {}

  const oldDashboard = window.renderDashboard || renderDashboard;
  window.renderDashboard = function () {
    const d = todayStr();
    const leaves = (S().leaves || []).filter(x => typeof isLeaveEffective === 'function' && isLeaveEffective(x) && overlapsDate(x, d) && x.type !== 'ไม่รับเวร');
    const noDuty = (S().leaves || []).filter(x => typeof isLeaveEffective === 'function' && isLeaveEffective(x) && overlapsDate(x, d) && x.type === 'ไม่รับเวร');
    const acts = (S().activities || []).filter(x => dateInRange(d, x.start_date, x.end_date));
    const duties = sortDashboardDuties((S().rosterAssignments || []).filter(x => x.duty_date === d), d);
    const leaveItems = [...leaves, ...noDuty];
    return `<div class="grid grid-3 v401-dashboard-stats">${statCard('คนลาวันนี้', leaves.length)}${statCard('กิจกรรมวันนี้', acts.length)}${statCard('เจ้าหน้าที่ทั้งหมด', (S().staff || []).filter(x => x.is_active).length)}</div>
      <div class="grid grid-2 v401-dashboard-details">
        <div class="card"><div class="section-title"><h3>เวรวันนี้</h3><span>${formatThaiDate(d)}</span></div>${duties.length ? `<div class="table-wrap"><table><thead><tr><th>เวร</th><th>ผู้รับผิดชอบ</th></tr></thead><tbody>${duties.map(r => `<tr><td>${esc(DUTY_LABEL[r.duty_code] || r.duty_code)}</td><td>${staffPill(r.staff_id)}</td></tr>`).join('')}</tbody></table></div>` : empty('ยังไม่มีตารางเวรวันนี้')}</div>
        <div class="card"><div class="section-title"><h3>ลา / ไม่รับเวรวันนี้</h3><span class="hint">แสดงช่วงลาและเหตุผล</span></div>${leaveItems.length ? `<div class="v397-today-list">${leaveItems.map(x => `<div class="v397-today-item"><div><b>${esc(person(x.staff_id))}</b> ${badge(x.type === 'ไม่รับเวร' ? 'ไม่รับเวร' : leaveDisplayType(x), leaveBadgeClass(leaveDisplayType(x)))}</div><div class="v397-detail-line">ช่วงเวลา: ${periodHtml(x)} · วันที่: ${esc(formatThaiDate(x.start_date))}${key(x.end_date) !== key(x.start_date) ? `–${esc(formatThaiDate(x.end_date))}` : ''}</div>${leaveReasonText(x) ? `<div class="v397-detail-note">เหตุผล: ${esc(leaveReasonText(x))}</div>` : ''}</div>`).join('')}</div>` : empty('วันนี้ไม่มีรายการลา/ไม่รับเวร')}</div>
        <div class="card v401-dashboard-activity-card"><div class="section-title"><h3>กิจกรรมวันนี้</h3><span class="hint">เวลา สถานที่ ผู้เข้าร่วม และหมายเหตุ</span></div>${acts.length ? `<div class="v397-today-list">${acts.map(activityHtml).join('')}</div>` : empty('วันนี้ไม่มีกิจกรรม')}</div>
      </div>`;
  };
  try { (0, eval)('renderDashboard=window.renderDashboard'); } catch (_) {}

  const oldCalendarDetail = window.calendarEventDetail || calendarEventDetail;
  window.calendarEventDetail = function (e) {
    let extra = '';
    if (e?.raw && ['activity','training','meeting','outing','standard','code'].includes(e.type)) {
      extra += `<br><span class="muted">เวลา: ${esc(timeText(e.raw))} · สถานที่: ${esc(e.raw.location || 'ไม่ระบุ')}</span>`;
    }
    if (e?.raw && !['activity','training','meeting','outing','standard','code','duty','holiday'].includes(e.type)) {
      extra += `<br><span class="muted">ช่วงเวลา: ${periodHtml(e.raw)}</span>`;
    }
    const base = oldCalendarDetail.apply(this, arguments);
    return extra + base;
  };
  try { (0, eval)('calendarEventDetail=window.calendarEventDetail'); } catch (_) {}

  const oldCollect = window.collectCalendarEvents || collectCalendarEvents;
  window.collectCalendarEvents = function () {
    const rows = oldCollect.apply(this, arguments);
    return rows.map(e => {
      if (e?.raw && !['activity','training','meeting','outing','standard','code','duty','holiday'].includes(e.type)) {
        const p = periodLabel(e.raw);
        e.title = `${e.title} (${p})`;
      }
      return e;
    });
  };
  try { (0, eval)('collectCalendarEvents=window.collectCalendarEvents'); } catch (_) {}

  const style = document.createElement('style');
  style.textContent = `.v397-activities-layout{grid-template-columns:minmax(520px,1.15fr) minmax(360px,.85fr)}.v397-all-activities .table-wrap{max-height:760px;overflow:auto}.v397-all-activities table{font-size:13px}.v397-all-activities th,.v397-all-activities td{padding:9px 8px}.v397-period{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef4ff;color:#1d5e9c;font-weight:700;font-size:12px}.v397-halfday-cell{display:block;font-size:10px;font-weight:700;color:#1d5e9c;margin-top:2px}.v397-today-list{display:grid;gap:9px}.v397-today-item,.v397-activity-item{padding:11px 13px;border:1px solid #dce7f0;border-radius:12px;background:#fbfdff}.v397-detail-line{margin-top:4px;color:#587087;font-size:13px;line-height:1.45}.v397-detail-note{margin-top:4px;color:#43566a;font-size:13px;white-space:pre-wrap}.v397-today-item .badge{margin-left:5px}.v401-dashboard-activity-card{grid-column:1/-1}.v401-dashboard-stats{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:14px}@media(max-width:900px){.v397-activities-layout{grid-template-columns:1fr}.v397-all-activities .table-wrap{max-height:520px}}@media(max-width:820px){.v401-dashboard-stats{grid-template-columns:1fr}.v401-dashboard-activity-card{grid-column:auto}}`;
  document.head.appendChild(style);
})();

} catch (error) { console.error("[v569] patch-v397-activity-dashboard-clarity.js", error); }
;

/* Original source: patch-v398-activity-server-filter.js */
try {
/* V400: Activity form restore + server-side filter gate
 * - Restores the existing activity entry form from V396/V397.
 * - Does not load/show the full activity list automatically.
 * - Queries Supabase only after the user selects at least one filter.
 * - Does not modify Dashboard rendering.
 */
(function () {
  'use strict';

  const VERSION = 'V400_ACTIVITY_FORM_FILTER_GATE';
  const oldRenderActivitiesPage = window.renderActivitiesPage;
  const oldHandleChange = window.handleChange;
  const oldHandleClick = window.handleClick;
  const oldLoadAllData = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);

  function defaultFilters() {
    return {
      start: state.activityFilterStart || '',
      end: state.activityFilterEnd || '',
      type: state.activityFilterType || '',
      search: state.activityFilterSearch || ''
    };
  }

  function hasAnyFilter(filters) {
    return Boolean(filters.start || filters.end || filters.type || String(filters.search || '').trim());
  }

  function filterInputValue(name, fallback) {
    return escapeHtml(state[name] || fallback || '');
  }

  function queryKeyOf(filters) {
    return JSON.stringify({
      start: filters.start || '',
      end: filters.end || '',
      type: filters.type || '',
      search: String(filters.search || '').trim()
    });
  }

  async function queryActivityListV398(filters) {
    if (!sb || !state.profile) return;
    let query = sb.from('activity_events')
      .select('*')
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (filters.start) query = query.gte('end_date', filters.start);
    if (filters.end) query = query.lte('start_date', filters.end);
    if (filters.type) query = query.eq('event_type', filters.type);

    const search = String(filters.search || '').trim().replace(/[%_,().]/g, ' ').replace(/\s+/g, ' ');
    if (search) query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    state.activityListRowsV398 = rows;
    state.activityListQueryKeyV398 = queryKeyOf(filters);

    // Keep queried rows available for Edit even when they are outside the
    // calendar's normal preload window. Existing rows retain their order.
    const merged = new Map((state.activities || []).map(row => [String(row.id), row]));
    rows.forEach(row => merged.set(String(row.id), row));
    state.activities = [...merged.values()];
  }

  function filtersFromState() {
    const f = defaultFilters();
    return { start: f.start, end: f.end, type: f.type, search: f.search };
  }

  function renderRowsV398(rows) {
    return `<div class="activity-card-list">${rows.map(r => {
      const participants = (Array.isArray(r.participant_ids) ? r.participant_ids : []).map(staffNick).filter(Boolean).join(', ') || '-';
      const canEdit = isAdmin() || r.created_by === currentStaffId() || r.owner_id === currentStaffId();
      const files = window.cnmiActivityAttachmentsV487?.parse ? window.cnmiActivityAttachmentsV487.parse(r.attachment_path) : (r.attachment_path ? [{path:r.attachment_path,name:'ไฟล์แนบ 1'}] : []);
      const fileButtons = files.length ? `<div class="activity-row-detail v487-activity-files"><span>ไฟล์แนบ</span><b class="v487-file-buttons">${files.map((file,index)=>`<button type="button" class="tiny-btn v487-view-file-btn" data-v487-open-activity-file="${r.id}:${index}">📎 ดูไฟล์ ${index+1}</button>`).join('')}</b></div>` : '';
      return `<div class="activity-row-card" data-v487-activity-id="${r.id}">
        <div class="activity-row-head"><div><b>${escapeHtml(r.title)}</b><br>${badge(r.event_type, activityClass(r.event_type))}</div><span class="muted">${formatThaiDate(r.start_date)}</span></div>
        <div class="activity-row-detail"><span>เวลา</span><b>${escapeHtml([r.start_time, r.end_time].filter(Boolean).join(' - ') || '-')}</b></div>
        <div class="activity-row-detail"><span>สถานที่</span><b>${escapeHtml(r.location || '-')}</b></div>
        <div class="activity-row-detail"><span>ผู้รับผิดชอบ</span><b>${escapeHtml(staffNick(r.owner_id) || '-')}</b></div>
        <div class="activity-row-detail"><span>ผู้เข้าร่วม</span><b>${escapeHtml(participants)}</b></div>
        ${fileButtons}
        <div class="actions">${canEdit ? `<button class="tiny-btn" data-edit-activity="${r.id}">แก้ไข</button><button class="tiny-btn danger" data-delete-activity="${r.id}">ลบ</button>` : '<span class="muted">ดูอย่างเดียว</span>'}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function findActivityListStart(html) {
    const markers = [
      '<div class="card v397-all-activities">',
      '<div class="card activity-list-card">',
      '<div class="card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3>'
    ];
    for (const marker of markers) {
      const index = html.indexOf(marker);
      if (index > -1) return index;
    }
    return -1;
  }

  window.renderActivitiesPage = function renderActivitiesPageV400() {
    const filters = defaultFilters();
    const queryKey = queryKeyOf(filters);
    const hasApplied = state.activityFilterAppliedV398 === true;
    const hasServerRows = hasApplied && state.activityListQueryKeyV398 === queryKey;
    const list = hasServerRows
      ? [...(state.activityListRowsV398 || [])].sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')) || String(a.start_time || '').localeCompare(String(b.start_time || '')))
      : [];

    // V396/V397 own the activity form and training fields. Keep that exact
    // form, then replace only the right-hand activity-list card.
    const formHtml = oldRenderActivitiesPage ? oldRenderActivitiesPage() : '';
    const listStart = findActivityListStart(formHtml);
    const left = listStart > -1
      ? formHtml.slice(0, listStart)
      : '<div class="grid v397-activities-layout"><div class="card"><div class="notice warning">ไม่สามารถแสดงแบบฟอร์มกิจกรรมได้ กรุณารีเฟรชหน้าอีกครั้ง</div></div>';

    return `${left}
      <div class="card activity-list-card v397-all-activities">
        <div class="section-title"><div><h3>ค้นหากิจกรรม</h3><p class="hint">ระบบจะไม่โหลดรายการทั้งหมดอัตโนมัติ</p></div><span class="muted">${hasApplied ? `แสดง ${list.length} รายการ` : 'ยังไม่ได้ค้นหา'}</span></div>
        <div class="activity-filter-box">
          <div class="activity-filter-hint">เลือกอย่างน้อย 1 เงื่อนไข แล้วกดค้นหา เพื่อโหลดเฉพาะรายการที่ต้องการ</div>
          <div class="toolbar compact-filter activity-filter-grid">
            <label>ตั้งแต่ <input type="date" id="activityFilterStart" value="${filterInputValue('activityFilterStart', filters.start)}"></label>
            <label>ถึง <input type="date" id="activityFilterEnd" value="${filterInputValue('activityFilterEnd', filters.end)}"></label>
            <label>ประเภท <select id="activityFilterType"><option value="">กรุณาเลือกประเภท</option>${ACTIVITY_TYPES.map(t => `<option value="${escapeHtml(t)}" ${filters.type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>
            <label class="activity-filter-search">ค้นหา <input type="search" id="activityFilterSearch" value="${filterInputValue('activityFilterSearch', filters.search)}" placeholder="ชื่อกิจกรรมหรือสถานที่"></label>
            <div class="activity-filter-actions"><button type="button" class="primary-btn" data-activity-filter-apply>ค้นหา</button><button type="button" class="ghost-btn" data-activity-filter-reset>ล้างตัวกรอง</button></div>
          </div>
        </div>
        ${!hasApplied ? empty('กรุณาเลือกตัวกรองแล้วกดค้นหา') : (list.length ? renderRowsV398(list) : empty('ไม่พบกิจกรรมตามตัวกรอง'))}
      </div>
    </div>`;
  };
  try { (0, eval)('renderActivitiesPage=window.renderActivitiesPage'); } catch (_) {}

  window.handleChange = function handleChangeV400(e) {
    const t = e.target;
    if (['activityFilterStart', 'activityFilterEnd', 'activityFilterType', 'activityFilterSearch'].includes(t.id)) {
      state[`draft_${t.id}`] = t.value;
      return;
    }
    return oldHandleChange ? oldHandleChange(e) : undefined;
  };
  try { (0, eval)('handleChange=window.handleChange'); } catch (_) {}

  window.handleClick = async function handleClickV400(e) {
    const t = e.target.closest('button, [data-page]');
    if (t?.hasAttribute('data-activity-filter-apply')) {
      const start = document.getElementById('activityFilterStart')?.value || '';
      const end = document.getElementById('activityFilterEnd')?.value || '';
      const type = document.getElementById('activityFilterType')?.value || '';
      const search = document.getElementById('activityFilterSearch')?.value || '';
      const filters = { start, end, type, search };

      if (!hasAnyFilter(filters)) return showToast('กรุณาเลือกอย่างน้อย 1 ตัวกรองก่อนค้นหา', { tone: 'error' });
      if (start && end && start > end) return showToast('วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด', { tone: 'error' });

      state.activityFilterStart = start;
      state.activityFilterEnd = end;
      state.activityFilterType = type;
      state.activityFilterSearch = search;
      try {
        await queryActivityListV398(filters);
        state.activityFilterAppliedV398 = true;
        renderPage();
      } catch (err) {
        state.activityFilterAppliedV398 = false;
        showToast(friendlyDbError(err), { tone: 'error' });
      }
      return;
    }

    if (t?.hasAttribute('data-activity-filter-reset')) {
      state.activityFilterStart = '';
      state.activityFilterEnd = '';
      state.activityFilterType = '';
      state.activityFilterSearch = '';
      state.activityFilterAppliedV398 = false;
      state.activityListRowsV398 = [];
      state.activityListQueryKeyV398 = '';
      renderPage();
      return;
    }

    return oldHandleClick ? oldHandleClick(e) : undefined;
  };
  try { (0, eval)('handleClick=window.handleClick'); } catch (_) {}

  // After saving/deleting an activity, refresh only the active filtered list.
  // No extra activity query runs on Dashboard or other pages.
  if (oldLoadAllData && !window.__CNMI_V400_ACTIVITY_LOAD_WRAPPED__) {
    window.__CNMI_V400_ACTIVITY_LOAD_WRAPPED__ = true;
    window.loadAllData = async function loadAllDataV400() {
      const result = await oldLoadAllData.apply(this, arguments);
      if (state.page === 'activities' && state.activityFilterAppliedV398 === true) {
        const filters = filtersFromState();
        if (hasAnyFilter(filters)) {
          try { await queryActivityListV398(filters); }
          catch (_) {
            state.activityFilterAppliedV398 = false;
            state.activityListRowsV398 = [];
            state.activityListQueryKeyV398 = '';
          }
        }
      }
      return result;
    };
    try { (0, eval)('loadAllData=window.loadAllData'); } catch (_) {}
  }

  const css = document.createElement('style');
  css.textContent = '.activity-filter-box{padding:10px 12px;margin:8px 0 14px;border:1px solid #dbe8f4;border-radius:14px;background:#f7fbff}.activity-filter-hint{font-size:.82rem;color:#62758b;margin-bottom:8px}.activity-filter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:end}.activity-filter-grid label{min-width:0}.activity-filter-search{grid-column:span 2}.activity-filter-actions{display:flex;gap:8px;flex-wrap:wrap}.activity-filter-actions button{min-height:38px}@media(max-width:760px){.activity-filter-grid{grid-template-columns:1fr}.activity-filter-search{grid-column:auto}.activity-filter-actions{grid-column:auto}}';
  document.head.appendChild(css);
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v398-activity-server-filter.js", error); }
;

/* Original source: patch-v404-activity-clickable-links.js */
try {
/* CNMI Staff Planner V408
 * Clickable links for unit activities.
 * - Converts web links in activity notes/details into safe external links.
 * - target="_blank" lets installed PWA hand the link to Chrome/Safari.
 * - Display-only patch: no Supabase schema/query/write changes.
 */
(function () {
  'use strict';
  if (window.__CNMI_V404_ACTIVITY_CLICKABLE_LINKS__) return;
  window.__CNMI_V404_ACTIVITY_CLICKABLE_LINKS__ = true;

  const LINK_RE = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9-]+\.)+(?:com|org|net|io|app|me|ly|co\.th|ac\.th|go\.th|or\.th|in\.th|th)(?:\/[^\s<>"']*)?/gi;
  const TRAILING_PUNCTUATION_RE = /[),.;!?\]}>'"”’。、，；：]+$/;
  const ORGANIZER_MARKER_RE = /\[\[FM-CNHR-002-(?:ORGANIZER|BATCH):[^\]]*\]\]\s*/gi;
  const ACTIVITY_SELECTORS = [
    '.v397-detail-note',
    '.v397-activity-item',
    '.activity-row-card',
    '.calendar-modal-row'
  ].join(',');

  function normaliseHref(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }

  function splitTrailingPunctuation(raw) {
    let url = String(raw || '');
    let suffix = '';
    while (url && TRAILING_PUNCTUATION_RE.test(url)) {
      suffix = url.slice(-1) + suffix;
      url = url.slice(0, -1);
    }
    return { url, suffix };
  }

  function linkifyTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || node.parentElement?.closest('a,script,style,textarea,input,select,option,button,code,pre')) return;
    const originalText = node.nodeValue || '';
    const text = String(originalText).replace(ORGANIZER_MARKER_RE, '');
    if (text !== originalText) node.nodeValue = text;
    LINK_RE.lastIndex = 0;
    if (!LINK_RE.test(text)) return;
    LINK_RE.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match;
    while ((match = LINK_RE.exec(text))) {
      if (match.index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const parts = splitTrailingPunctuation(match[0]);
      if (!parts.url) {
        fragment.appendChild(document.createTextNode(match[0]));
      } else {
        const anchor = document.createElement('a');
        anchor.className = 'v404-activity-link';
        anchor.href = normaliseHref(parts.url);
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer external';
        anchor.referrerPolicy = 'no-referrer-when-downgrade';
        anchor.textContent = parts.url;
        anchor.title = 'กดเพื่อเปิดลิงก์ใน Chrome หรือ Safari';
        anchor.setAttribute('aria-label', `เปิดลิงก์ ${parts.url}`);
        fragment.appendChild(anchor);
        if (parts.suffix) fragment.appendChild(document.createTextNode(parts.suffix));
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  }

  function linkifyElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let current;
    while ((current = walker.nextNode())) nodes.push(current);
    nodes.forEach(linkifyTextNode);
  }

  function addActivityFormHint(root) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll('#activityForm textarea[name="note"]').forEach(textarea => {
      textarea.placeholder = 'วางรายละเอียดหรือลิงก์ได้ เช่น Zoom, Google Meet, Google Docs, Excel หรือแบบสอบถาม';
      const label = textarea.closest('label');
      if (!label || label.querySelector('.v404-link-hint')) return;
      const hint = document.createElement('small');
      hint.className = 'hint v404-link-hint';
      hint.textContent = 'ลิงก์ที่บันทึกจะแสดงเป็นข้อความกดได้ และเปิดใน Chrome หรือ Safari';
      label.appendChild(hint);
    });
  }

  function process(root) {
    const scope = root?.querySelectorAll ? root : document;
    if (scope.matches?.(ACTIVITY_SELECTORS)) linkifyElement(scope);
    scope.querySelectorAll?.(ACTIVITY_SELECTORS).forEach(linkifyElement);
    addActivityFormHint(scope);
  }

  let queued = false;
  function queueProcess() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      process(document);
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          queueProcess();
          return;
        }
      }
    }
  });

  function start() {
    process(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  const style = document.createElement('style');
  style.textContent = `
    .v404-activity-link{color:#075fae;font-weight:700;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;overflow-wrap:anywhere;word-break:break-word;cursor:pointer}
    .v404-activity-link:hover{color:#034b89}
    .v404-activity-link:focus-visible{outline:3px solid rgba(38,145,224,.28);outline-offset:2px;border-radius:4px}
    .v404-activity-link::after{content:' ↗';font-size:.82em;text-decoration:none;display:inline-block}
    .v404-link-hint{display:block;margin-top:5px;line-height:1.35}
  `;
  document.head.appendChild(style);
})();

} catch (error) { console.error("[v569] patch-v404-activity-clickable-links.js", error); }
;

/* Original source: patch-v406-dashboard-mobile-compact.js */
try {
/* CNMI Staff Planner V406
 * Mobile-only dashboard polish.
 * - Keeps "กิจกรรมวันนี้" typography at the same readable scale as leave cards.
 * - Fits the two-column "เวรวันนี้" table inside the phone viewport without horizontal scrolling.
 * - Display-only patch: no Supabase query/write/schema changes.
 */
(function () {
  'use strict';
  if (window.__CNMI_V406_DASHBOARD_MOBILE_COMPACT__) return;
  window.__CNMI_V406_DASHBOARD_MOBILE_COMPACT__ = true;

  const style = document.createElement('style');
  style.id = 'cnmi-v406-dashboard-mobile-compact';
  style.textContent = `
    @media (max-width: 820px) {
      /* Prevent iPhone/Safari from enlarging long activity text automatically. */
      .v401-dashboard-activity-card,
      .v401-dashboard-activity-card .v397-activity-item {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }

      /* Match the activity card scale to the leave card scale. */
      .v401-dashboard-activity-card .v397-activity-item {
        font-size: 15px !important;
        line-height: 1.45 !important;
        padding: 11px 13px !important;
      }
      .v401-dashboard-activity-card .v397-activity-item > div:first-child,
      .v401-dashboard-activity-card .v397-activity-item > div:first-child b {
        font-size: 16px !important;
        line-height: 1.35 !important;
      }
      .v401-dashboard-activity-card .v397-detail-line,
      .v401-dashboard-activity-card .v397-detail-note,
      .v401-dashboard-activity-card .v404-activity-link {
        font-size: 13px !important;
        line-height: 1.45 !important;
      }
      .v401-dashboard-activity-card .badge {
        font-size: 11px !important;
        padding: 3px 8px !important;
      }

      /* The first dashboard detail card is "เวรวันนี้". It has only two short columns. */
      .v401-dashboard-details > .card:first-child .table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
        overflow-y: visible !important;
      }
      .v401-dashboard-details > .card:first-child .table-wrap > table {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        table-layout: fixed !important;
      }
      .v401-dashboard-details > .card:first-child th,
      .v401-dashboard-details > .card:first-child td {
        padding: 10px 9px !important;
        font-size: 15px !important;
        line-height: 1.3 !important;
        vertical-align: middle !important;
        overflow-wrap: anywhere !important;
        word-break: normal !important;
      }
      .v401-dashboard-details > .card:first-child th:first-child,
      .v401-dashboard-details > .card:first-child td:first-child {
        width: 40% !important;
      }
      .v401-dashboard-details > .card:first-child th:nth-child(2),
      .v401-dashboard-details > .card:first-child td:nth-child(2) {
        width: 60% !important;
        text-align: center !important;
      }
      .v401-dashboard-details > .card:first-child td:nth-child(2) .staff-color-pill {
        max-width: 100% !important;
        white-space: normal !important;
        justify-content: center !important;
        font-size: 14px !important;
        line-height: 1.2 !important;
      }
    }

    @media (max-width: 380px) {
      .v401-dashboard-details > .card:first-child th,
      .v401-dashboard-details > .card:first-child td {
        padding: 9px 7px !important;
        font-size: 14px !important;
      }
      .v401-dashboard-details > .card:first-child td:nth-child(2) .staff-color-pill {
        font-size: 13px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();

} catch (error) { console.error("[v569] patch-v406-dashboard-mobile-compact.js", error); }
;

/* Original source: patch-v427-mobile-calendar-popup-font-fix.js */
try {
/* CNMI Staff Planner V427
 * Mobile calendar popup typography fix.
 * - Prevents iPhone/iOS Safari/PWA text autosizing inside the day-detail popup.
 * - Keeps desktop typography unchanged.
 * - Display-only patch: no Supabase query/write/schema changes.
 */
(function () {
  'use strict';
  if (window.__CNMI_V427_MOBILE_CALENDAR_POPUP_FONT_FIX__) return;
  window.__CNMI_V427_MOBILE_CALENDAR_POPUP_FONT_FIX__ = true;

  const style = document.createElement('style');
  style.id = 'cnmi-v427-mobile-calendar-popup-font-fix';
  style.textContent = `
    @media (max-width: 820px) {
      /* iOS Safari/PWA can enlarge text in a scrollable modal independently.
         Lock autosizing only inside the modal so the rest of the app is untouched. */
      #modal,
      #modal .modal-card,
      #modal #modalBody,
      #modal #modalBody .v311-calendar-modal,
      #modal #modalBody .calendar-modal-list,
      #modal #modalBody .calendar-modal-row {
        -webkit-text-size-adjust: 100% !important;
        text-size-adjust: 100% !important;
      }

      /* Stable phone scale for Calendar day-detail popup. */
      #modal #modalBody {
        font-size: 15px !important;
        line-height: 1.45 !important;
      }
      #modal #modalBody > h2,
      #modal #modalBody .v311-calendar-modal > h2 {
        margin: 0 44px 14px 0 !important;
        font-size: 24px !important;
        line-height: 1.25 !important;
        letter-spacing: 0 !important;
      }
      #modal #modalBody .calendar-modal-list {
        gap: 10px !important;
      }
      #modal #modalBody .calendar-modal-row {
        padding: 12px 13px !important;
        border-left-width: 7px !important;
        border-radius: 14px !important;
        font-size: 15px !important;
        line-height: 1.45 !important;
        overflow-wrap: anywhere !important;
        word-break: normal !important;
      }
      #modal #modalBody .calendar-modal-row .event-title,
      #modal #modalBody .calendar-modal-row .event-title b {
        font-size: 17px !important;
        line-height: 1.35 !important;
      }
      #modal #modalBody .calendar-modal-row .event-title {
        margin-bottom: 5px !important;
      }
      #modal #modalBody .calendar-modal-row .muted,
      #modal #modalBody .calendar-modal-row .v332-activity-meta {
        font-size: 14px !important;
        line-height: 1.45 !important;
      }
      #modal #modalBody .calendar-modal-row .badge {
        font-size: 11px !important;
        line-height: 1.2 !important;
        padding: 3px 8px !important;
      }
    }

    @media (max-width: 390px) {
      #modal #modalBody > h2,
      #modal #modalBody .v311-calendar-modal > h2 {
        font-size: 22px !important;
      }
      #modal #modalBody .calendar-modal-row,
      #modal #modalBody .calendar-modal-row .muted,
      #modal #modalBody .calendar-modal-row .v332-activity-meta {
        font-size: 14px !important;
      }
      #modal #modalBody .calendar-modal-row .event-title,
      #modal #modalBody .calendar-modal-row .event-title b {
        font-size: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
  console.info('[V427] mobile calendar popup typography fix loaded');
})();

} catch (error) { console.error("[v569] patch-v427-mobile-calendar-popup-font-fix.js", error); }
;

/* Original source: patch-v429-staff-tracking-hide-completed.js */
try {
/* CNMI Staff Planner V429
   Staff tracking = action queue only.
   - Main duty disappears after the staff OT confirmation/request has been submitted.
   - Ch4 / blood-spinning disappears after a replacement is recorded OR actual extra-OT time is submitted.
   - Rejected / returned OT requests reappear so the staff can correct them.
*/
(function(){
  'use strict';
  const VERSION='V429_STAFF_TRACKING_HIDE_COMPLETED';
  if(window.__CNMI_V429_STAFF_TRACKING_HIDE_COMPLETED__)return;
  window.__CNMI_V429_STAFF_TRACKING_HIDE_COMPLETED__=true;

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof previousRenderOtPage!=='function')return;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function sid(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');}}
  function dutyLabel(code){try{return (DUTY_LABEL&&DUTY_LABEL[code])||code||'-';}catch(_){return code||'-';}}
  function thaiDate(date){try{return formatThaiDate(norm(date));}catch(_){return norm(date)||'-';}}
  function thaiMonth(key){try{const [y,m]=String(key||'').split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key||'-';}}
  function selectedMonth(){
    const raw=S()?.otMenuMonthV369||S()?.myDutyMonthFilter||S()?.monthKey||new Date().toISOString().slice(0,7);
    return /^\d{4}-\d{2}$/.test(String(raw).slice(0,7))?String(raw).slice(0,7):new Date().toISOString().slice(0,7);
  }
  function latest(rows){return (rows||[]).slice().sort((a,b)=>String(b?.created_at||b?.updated_at||b?.confirmed_at||'').localeCompare(String(a?.created_at||a?.updated_at||a?.confirmed_at||'')))[0]||null;}
  function isAttendanceOt(row){
    const text=`${row?.reason||''} ${row?.note||''} ${row?.device||''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|V220_OT_APPROVAL|V219_OT_REPAIR|V221_DUTY_DATE/i.test(text);
  }
  function requestNeedsAction(row){
    if(!row)return true;
    const raw=String(row?.status||'').trim();
    const low=raw.toLowerCase();
    return raw==='ไม่อนุมัติ'||raw==='ส่งกลับแก้ไข'||/reject|return|edit/i.test(low);
  }
  function statusText(row){
    if(!row)return 'ยังไม่ได้ยืนยัน';
    const raw=String(row?.status||'').trim(),low=raw.toLowerCase();
    if(raw==='ไม่อนุมัติ'||low==='rejected')return 'ไม่อนุมัติ — กรุณาแก้ไข';
    if(raw==='ส่งกลับแก้ไข'||/return|edit/i.test(low))return 'ส่งกลับแก้ไข';
    if(raw==='อนุมัติ'||low==='approved')return 'อนุมัติแล้ว';
    return 'ยืนยันแล้ว / รอ Admin';
  }
  function statusClass(text){
    const t=String(text||'');
    if(/ไม่อนุมัติ|ส่งกลับ/.test(t))return 'red';
    if(/ยืนยันแล้ว|รอ Admin/.test(t))return 'orange';
    if(/อนุมัติแล้ว/.test(t))return 'green';
    return 'black';
  }
  function statusBadge(text){try{return badge(text,statusClass(text));}catch(_){return `<span class="badge ${esc(statusClass(text))}">${esc(text)}</span>`;}}
  function isCh4(code){return /^ช4(?:A|B)?$/.test(String(code||'').trim());}
  function weekendHoliday(date){
    try{return (typeof isWeekend==='function'&&isWeekend(date))||(typeof isHolidayDate==='function'&&isHolidayDate(date));}
    catch(_){const d=new Date(`${norm(date)}T00:00:00`).getDay();return d===0||d===6;}
  }
  function timeText(date,codes,duties=[]){
    const exactTimes=[...new Set((duties||[]).map(x=>String(x?._effective_time_label||'').trim()).filter(Boolean))];
    if(exactTimes.length)return exactTimes.join(' + ');
    const effective=(duties||[]).filter(x=>Array.isArray(x?._effective_segments)&&x._effective_segments.length&&Number(x?._effective_hours)>0&&!isCh4(x?.duty_code));
    if(effective.length){
      const order=['morning','afternoon','night'],set=new Set(),hours=Math.round(effective.reduce((sum,x)=>sum+Number(x._effective_hours||0),0)*100)/100;
      effective.forEach(x=>(x._effective_segments||[]).forEach(s=>set.add(s)));
      const key=order.filter(s=>set.has(s)).join(',');
      if(key==='morning')return '08:00 - 16:00';
      if(key==='afternoon')return '16:00 - 00:00';
      if(key==='night')return '00:00 - 08:00';
      if(key==='morning,afternoon')return '08:00 - 00:00';
      if(key==='afternoon,night')return '16:00 - 08:00 (+1 วัน)';
      if(key==='morning,night')return `ดึก-เช้า • ${hours} ชม.`;
      if(key==='morning,afternoon,night')return '08:00 - 08:00 (+1 วัน)';
      return `${hours} ชม.`;
    }
    if(codes.some(c=>/^ชบด/.test(c)))return weekendHoliday(date)?'08:00 - 08:00 (+1 วัน)':'16:00 - 08:00 (+1 วัน)';
    if(codes.every(isCh4))return 'กรอกเวลาปั่นเลือดตามจริง หรือเลือกคนอยู่แทน';
    return '08:00 - 16:00';
  }
  function groupedDuties(){
    const staffId=sid(),month=selectedMonth(),assignments=S()?.rosterAssignments||[];
    let rows=[],usedEffective=false;
    try{
      const fn=window.cnmiTradeSegmentsV217?.effectiveAssignmentsForStaffDate;
      if(typeof fn==='function'){
        usedEffective=true;
        const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate();
        for(let day=1;day<=last;day++){
          const date=`${month}-${String(day).padStart(2,'0')}`;
          rows.push(...(fn(staffId,date,assignments)||[]));
        }
      }
    }catch(_){rows=[];}
    if(!usedEffective)rows=assignments.filter(a=>String(a?.staff_id||'')===staffId&&norm(a?.duty_date).startsWith(month));
    rows.sort((a,b)=>norm(a?.duty_date).localeCompare(norm(b?.duty_date))||String(a?.duty_code||'').localeCompare(String(b?.duty_code||''),'th'));
    const map=new Map();
    rows.forEach(row=>{const date=norm(row?.duty_date);if(!map.has(date))map.set(date,[]);map.get(date).push(row);});
    return {month,entries:[...map.entries()]};
  }
  function otFor(staffId,date){return (S()?.otRequests||[]).filter(r=>String(r?.staff_id||'')===staffId&&norm(r?.work_date)===date);}
  function confirmationFor(duty){
    const rows=S()?.shiftConfirmations||[];
    const date=norm(duty?.duty_date||duty?.work_date),owner=String(duty?.staff_id||duty?.owner_staff_id||''),code=String(duty?.duty_code||duty?.shift_type||''),aid=String(duty?.id||duty?.roster_assignment_id||'');
    return latest(rows.filter(r=>{
      const rDate=norm(r?.work_date||r?.duty_date),rOwner=String(r?.owner_staff_id||r?.staff_id||''),rCode=String(r?.duty_code||r?.shift_type||''),rAid=String(r?.roster_assignment_id||'');
      if(aid&&rAid&&aid===rAid)return true;
      return rDate===date&&rOwner===owner&&(rCode===code||(isCh4(rCode)&&isCh4(code)));
    }));
  }
  function ch4CoveredOrClosed(duties){
    const ch4=duties.filter(d=>isCh4(d?.duty_code));
    if(!ch4.length)return true;
    return ch4.every(d=>{
      const st=String(confirmationFor(d)?.status||'').trim().toLowerCase();
      return ['covered_by_other','no_claim','closed_no_claim','cancelled','canceled'].includes(st);
    });
  }
  function ch4OwnStatus(duties){
    const rec=latest(duties.filter(d=>isCh4(d?.duty_code)).map(confirmationFor).filter(Boolean));
    const st=String(rec?.status||'').trim().toLowerCase();
    if(st==='completed_self'||st==='confirmed_self')return 'ทำเองแล้ว — ยังไม่ได้ลงเวลาปั่นเลือด';
    if(st==='covered_by_other')return `มีคนอยู่แทนแล้ว${rec?.covered_by_name?`: ${rec.covered_by_name}`:''}`;
    if(['no_claim','closed_no_claim'].includes(st))return 'ปิดรายการแล้ว / ไม่เบิก';
    return 'ยังไม่ได้เลือกคนอยู่แทน หรือบันทึกเวลาปั่นเลือด';
  }
  function buildTrackingCard(){
    const staffId=sid(),{month,entries}=groupedDuties();
    const pending=entries.map(([date,duties])=>{
      const codes=duties.map(a=>String(a?.duty_code||'').trim()).filter(Boolean);
      const otRows=otFor(staffId,date),mainRequest=latest(otRows.filter(isAttendanceOt)),extraRequest=latest(otRows.filter(r=>!isAttendanceOt(r)));
      const hasMain=codes.some(code=>!isCh4(code)),hasCh4=codes.some(isCh4);
      const mainNeeds=hasMain&&requestNeedsAction(mainRequest);
      const extraSubmitted=!!extraRequest&&!requestNeedsAction(extraRequest);
      const ch4Needs=hasCh4&&!(ch4CoveredOrClosed(duties)||extraSubmitted);
      if(!mainNeeds&&!ch4Needs)return null;
      const mainText=mainRequest?statusText(mainRequest):'ยังไม่ได้แตะยืนยันเวร';
      const ch4Text=extraRequest&&requestNeedsAction(extraRequest)?statusText(extraRequest):ch4OwnStatus(duties);
      return `<article class="v429-duty-card">
        <div class="v429-duty-head"><div><span class="v429-duty-date">${esc(thaiDate(date))}</span><div class="v429-duty-codes">${duties.map(a=>`<span>${esc(a?._effective_label||dutyLabel(a?.duty_code))}</span>`).join('')}</div></div><span class="v429-time">${esc(timeText(date,codes,duties))}</span></div>
        <div class="v429-status-list">
          ${mainNeeds?`<div class="v429-status-row"><span>เวรหลัก — ยังต้องดำเนินการ</span>${statusBadge(mainText)}</div>`:''}
          ${ch4Needs?`<div class="v429-status-row"><span>ช4 / งานปั่นเลือด</span>${statusBadge(ch4Text)}</div>`:''}
        </div>
        <div class="v429-actions">
          ${mainNeeds?`<button type="button" class="ghost-btn" data-v429-open-confirm="${esc(date)}">${mainRequest?'กลับไปแก้ข้อ 2':'ไปข้อ 2 ยืนยันเวร'}</button>`:''}
          ${ch4Needs?`<button type="button" class="primary-btn" data-v429-open-extra="${esc(date)}">ไปข้อ 3 ลงเวลาปั่นเลือด</button>`:''}
        </div>
      </article>`;
    }).filter(Boolean).join('');
    return `<section class="card wide-card v429-duty-tracking-card" style="grid-column:1/-1">
      <div class="section-title"><div><h3>เวรของฉัน — รายการที่ยังต้องทำ</h3><p class="hint">รายการจะหายจากหน้านี้ทันทีเมื่อยืนยัน OT แล้ว หรือกรณี ช4 เมื่อเลือกคนอยู่แทน/บันทึกเวลาปั่นเลือดแล้ว</p></div></div>
      ${pending?`<div class="v429-duty-grid">${pending}</div>`:'<div class="empty">ไม่มีรายการที่ต้องติดตามในเดือนนี้</div>'}
    </section>`;
  }
  function enhance(html){
    if(isAdminSafe()||String(S()?.otMenuV369||'staff-track')!=='staff-track')return html;
    const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
    const content=tpl.content.querySelector('.v369-ot-content');
    if(!content)return html;
    content.innerHTML=buildTrackingCard();
    const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
  }

  const wrapped=function renderOtPageV429(){return enhance(previousRenderOtPage.apply(this,arguments));};
  try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}

  document.addEventListener('click',function(e){
    const confirm=e.target?.closest?.('[data-v429-open-confirm]');
    if(confirm){
      e.preventDefault();e.stopImmediatePropagation();
      S().myDutyDateV221=String(confirm.getAttribute('data-v429-open-confirm')||'').slice(0,10);
      S().otMenuV369='staff-confirm';S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
      return;
    }
    const extra=e.target?.closest?.('[data-v429-open-extra]');
    if(extra){
      e.preventDefault();e.stopImmediatePropagation();
      S().myDutyDateV221=String(extra.getAttribute('data-v429-open-extra')||'').slice(0,10);
      S().otMenuV369='staff-extra';S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
    }
  },true);

  const style=document.createElement('style');style.id='v429-staff-tracking-style';style.textContent=`
    .v429-duty-tracking-card{display:grid;gap:14px}.v429-duty-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v429-duty-card{display:grid;gap:12px;padding:15px;border:1px solid #d8e6f3;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 5px 14px rgba(30,64,175,.05)}
    .v429-duty-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v429-duty-date{display:block;font-size:1.06rem;font-weight:900;color:#20384f}.v429-duty-codes{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.v429-duty-codes span{padding:4px 8px;border-radius:999px;background:#eaf4ff;color:#1769b0;font-weight:850}.v429-time{max-width:48%;color:#5b7085;font-weight:750;text-align:right;line-height:1.35}
    .v429-status-list{display:grid;gap:8px}.v429-status-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:13px;background:#f4f8fc}.v429-status-row>span:first-child{font-weight:800;color:#35536c}.v429-actions{display:flex;gap:8px;flex-wrap:wrap}.v429-actions button{flex:1 1 180px}
    @media(max-width:760px){.v429-duty-grid{grid-template-columns:1fr}.v429-duty-card{padding:14px}.v429-duty-head{display:grid}.v429-time{max-width:none;text-align:left}.v429-status-row{align-items:flex-start;flex-direction:column}.v429-actions{display:grid;grid-template-columns:1fr}.v429-actions button{width:100%}}
  `;document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v429-staff-tracking-hide-completed.js", error); }
;
