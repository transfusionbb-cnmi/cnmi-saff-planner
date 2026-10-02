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
  function assignmentById(id){ return (S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null; }
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
      const a=assignmentById(trade?.from_assignment_id);
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
      try{ base=previous(row); }catch(err){ console.warn(`[${VERSION}] previous breakdown`,err); return previous(row); }
      try{
        const actual=round2(Number(base?.actualHours||0));
        if(actual<=0) return base;
        const matches=completedTradesForRow(row);
        if(matches.length<2) return base;

        const totalSold=round2(matches.reduce((s,x)=>s+x.soldHours,0));
        // Only aggregate when this OT row is clearly the combined representation
        // of those purchased duties. This prevents unrelated same-day trades from leaking in.
        if(Math.abs(totalSold-actual)>0.25) return base;

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
          actualHours:actual,
          hrHours:hrTotal,
          segments,
          rateType:[...new Set(segments.map(s=>s.rateType))].join('/')||base?.rateType,
          isHoliday:segments.some(s=>s.isHoliday),
          tradeInfo:{
            aggregate:true,
            count:matches.length,
            actualHours:actual,
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
