/* CNMI Staff Planner V579 — OT Attendance Authoritative + Trade Rate Recalculation Fix
 * Fixes staff-detail / monthly summary / HR export discrepancies where a purchased duty
 * was converted from a stale saved amount instead of the actual duty-date rate.
 *
 * Rules:
 * 1) Staff-confirmed attendance remains the source of actual worked hours.
 * 2) For non-custom purchased duties, HR hours are recalculated from actual/sold hours
 *    x the selected sold-rate type (MT/Clerk) for that duty date, divided by the
 *    receiver's normal HR rate. Saved amount is audit/display only.
 * 3) Custom amount keeps the saved amount as authoritative.
 * 4) Same-rate normal-day purchases (e.g. MT -> MT) therefore keep HR hours equal to
 *    actual attendance hours instead of drifting because of an incorrect old amount.
 * 5) Multiple purchased duties represented by one attendance row are summed segment by segment.
 * No database schema change required.
 */
(function(){
  'use strict';
  const VERSION='V579_OT_ATTENDANCE_AUTHORITATIVE_TRADE_RATE_FIX';
  if(window.__CNMI_V579_OT_ATTENDANCE_AUTHORITATIVE_TRADE_RATE_FIX__) return;
  window.__CNMI_V579_OT_ATTENDANCE_AUTHORITATIVE_TRADE_RATE_FIX__=true;

  function S(){try{return state;}catch(_){return window.state||{};}}
  function round2(v){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function staffRec(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{};}
  function isTang(id){const s=staffRec(id);return String(s.nickname||'').trim()==='แตง'||/(^|\s)แตง($|\s)/.test(`${s.nickname||''} ${s.full_name||''}`.trim());}
  function rateType(staffId,code){
    try{const t=dutyStaffTypeForRate(staffId,code);if(t)return t==='เคิก'?'เคิก':'MT';}catch(_){}
    const s=staffRec(staffId);
    if(isTang(staffId)&&['ช3A','ช3B','ช4','ช4A','ช4B'].includes(String(code||'')))return 'MT';
    return String(s.staff_type||s.type||'').trim()==='เคิก'?'เคิก':'MT';
  }
  function normalRate(type){return type==='เคิก'?90:130;}
  function isHoliday(d){try{return !!isHolidayDate(d);}catch(_){return false;}}
  function datedRate(type,date){return type==='เคิก'?(isHoliday(date)?120:90):(isHoliday(date)?160:130);}
  function assignmentById(id){return (S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null;}
  function codeOf(a){return String(a?.duty_code||a?.shift_type||'').trim();}
  function sellHours(trade,a){
    const marker=Number(String(trade?.note||'').match(/\[SELL_HOURS=(\d+(?:\.\d+)?)\]/i)?.[1]||0);
    if(Number.isFinite(marker)&&marker>0)return marker;
    try{const h=Number(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return h;}catch(_){}
    try{const h=Number(dutyHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return h;}catch(_){}
    return 0;
  }
  function soldRateType(trade,a){
    const mode=String(trade?.rate_mode||'receiver').toLowerCase();
    if(mode==='mt')return 'MT';
    if(mode==='kerk')return 'เคิก';
    if(mode==='owner')return rateType(trade?.requester_id,codeOf(a));
    // Historical "receiver" rows were saved as a named MT/Clerk sale rate in the UI.
    // Use receiver type for compatibility, but recalc the dated rate instead of trusting amount_from.
    if(mode==='receiver')return rateType(trade?.receiver_id,codeOf(a));
    return 'กำหนดเอง';
  }
  function actualHours(row,base){
    const fromBase=round2(base?.actualHours||0);if(fromBase>0)return fromBase;
    try{return round2(calcOtHours(row)||0);}catch(_){return round2(row?.manual_hours||row?.hours||0);}
  }
  function completedTradesForRow(row,base){
    const sid=String(row?.staff_id||''),date=normDate(row?.work_date),actual=actualHours(row,base);
    if(!sid||!date||actual<=0)return [];
    const explicit=String(row?.duty_code||row?.shift_type||row?.shift_code||row?.ot_type||'').trim();
    const text=`${row?.reason||''} ${row?.note||''}`;
    const matches=[];
    const seen=new Set();
    for(const trade of (S().tradeRequests||[])){
      if(String(trade?.status||'')!=='completed'||String(trade?.receiver_id||'')!==sid)continue;
      const a=assignmentById(trade?.from_assignment_id);if(!a||normDate(a?.duty_date)!==date)continue;
      const sold=round2(sellHours(trade,a));if(sold<=0)continue;
      let score=1;const code=codeOf(a);
      if(String(row?.assignment_id||row?.roster_assignment_id||'')===String(a.id))score+=100;
      if(explicit&&explicit===code)score+=25;
      if(code&&text.includes(code))score+=12;
      if(Math.abs(actual-sold)<=0.11)score+=10;
      if(/ยืนยันอยู่เวรตามตาราง|ยืนยันอยู่เวร/.test(text))score+=4;
      const key=String(trade?.id||`${trade?.from_assignment_id}|${trade?.requester_id}|${trade?.receiver_id}|${trade?.note||''}`);
      if(seen.has(key))continue;seen.add(key);
      matches.push({trade,assignment:a,soldHours:sold,score});
    }
    if(!matches.length)return [];
    const total=round2(matches.reduce((s,x)=>s+x.soldHours,0));
    if(matches.length>1&&Math.abs(total-actual)<=0.25)return matches.sort((a,b)=>String(a.assignment?.id||'').localeCompare(String(b.assignment?.id||'')));
    const best=matches.slice().sort((a,b)=>b.score-a.score)[0];
    return best&&best.score>=5?[best]:[];
  }
  function segmentInfo(item){
    const {trade,assignment,soldHours}=item;
    const receiverType=rateType(trade?.receiver_id,codeOf(assignment));
    const receiverBase=normalRate(receiverType);
    const mode=String(trade?.rate_mode||'receiver').toLowerCase();
    const sourceType=soldRateType(trade,assignment);
    let amount=0,appliedRate=0,claimHours=0;
    if(mode==='custom'){
      amount=round2(Math.max(0,Number(trade?.amount_from)||0));
      appliedRate=soldHours>0?round2(amount/soldHours):0;
      claimHours=receiverBase>0?round2(amount/receiverBase):0;
    }else{
      appliedRate=datedRate(sourceType,assignment?.duty_date);
      amount=round2(soldHours*appliedRate);
      claimHours=receiverBase>0?round2(amount/receiverBase):soldHours;
    }
    return {actualHours:soldHours,hrHours:claimHours,shiftType:codeOf(assignment)||'-',rateType:receiverType,sourceRateType:sourceType,normalRate:receiverBase,appliedRate,isHoliday:isHoliday(assignment?.duty_date),tradeId:trade?.id||'',assignmentId:assignment?.id||'',amount,trade,assignment};
  }

  function install(){
    const api=window.v190HrRateNormalization;
    if(!api||typeof api.otNormalizationBreakdown190!=='function')return false;
    if(api.otNormalizationBreakdown190.__v579Wrapped)return true;
    const previous=api.otNormalizationBreakdown190;
    const wrapped=function(row){
      let base;try{base=previous(row);}catch(err){console.warn(`[${VERSION}] previous breakdown`,err);return previous(row);}
      try{
        const actual=actualHours(row,base);if(actual<=0)return base;
        const matches=completedTradesForRow(row,base);if(!matches.length)return base;
        const segments=matches.map(segmentInfo);
        const soldTotal=round2(segments.reduce((s,x)=>s+x.actualHours,0));
        if(matches.length>1&&Math.abs(soldTotal-actual)>0.25)return base;
        if(matches.length===1&&Math.abs(segments[0].actualHours-actual)>0.25&&String(row?.assignment_id||row?.roster_assignment_id||'')!==String(segments[0].assignmentId))return base;
        const hrTotal=round2(segments.reduce((s,x)=>s+x.hrHours,0));
        const amountTotal=round2(segments.reduce((s,x)=>s+x.amount,0));
        const savedAmountTotal=round2(matches.reduce((s,x)=>s+Math.max(0,Number(x.trade?.amount_from)||0),0));
        return {
          ...base,
          actualHours:actual,
          hrHours:hrTotal,
          segments,
          shiftType:segments.length===1?segments[0].shiftType:'หลายเวร',
          rateType:[...new Set(segments.map(x=>x.rateType))].join('/')||base?.rateType,
          isHoliday:segments.some(x=>x.isHoliday),
          tradeInfo:{
            ...(base?.tradeInfo||{}),
            aggregate:segments.length>1,
            count:segments.length,
            actualHours:actual,
            soldHours:soldTotal,
            amount:amountTotal,
            savedAmount:savedAmountTotal,
            claimHours:hrTotal,
            recalculatedFromAttendance:true,
            trades:matches.map((m,i)=>({trade:m.trade,assignment:m.assignment,soldHours:m.soldHours,amount:segments[i].amount,claimHours:segments[i].hrHours,sourceRateType:segments[i].sourceRateType,appliedRate:segments[i].appliedRate}))
          },
          isTradeRate:true,
          v579Authoritative:true
        };
      }catch(err){console.warn(`[${VERSION}] authoritative trade fallback`,err);return base;}
    };
    wrapped.__v579Wrapped=true;wrapped.__v579Previous=previous;
    api.otNormalizationBreakdown190=wrapped;
    window.v579OtAttendanceAuthoritative={version:VERSION,completedTradesForRow,segmentInfo};
    return true;
  }

  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim()))return;
      x.textContent='v579';x.title='OT Attendance Authoritative + Trade Rate Recalculation Fix';
    });
  }
  let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>120)clearInterval(timer);},50);
  install();markVersion();setTimeout(markVersion,700);
  window.addEventListener('hashchange',()=>setTimeout(markVersion,300));
  window.addEventListener('pageshow',()=>setTimeout(markVersion,250));
  console.info(`[${VERSION}] loaded`);
})();
