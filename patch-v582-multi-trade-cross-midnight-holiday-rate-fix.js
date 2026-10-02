/* CNMI Staff Planner V582 — Multi-Trade Cross-Midnight Holiday Rate Fix
 * - Keeps each completed trade as its own transaction, even on the same date.
 * - Matches OT rows to trade markers by exact sold start/end times before comparing hours.
 * - 16:00–08:00 (+1 day) is always 16 actual hours; 08:00–16:00 is 8 hours.
 * - Uses the saved trade amount when present (audit/source of truth). Therefore holiday MT
 *   trades already saved at 160 B/hr remain 160 B/hr and are converted to HR hours by
 *   the receiver's normal HR rate (MT 130 / Clerk 90).
 * - Supports a combined row when one OT row intentionally represents multiple trades.
 * No database schema change required.
 */
(function(){
  'use strict';
  const VERSION='V582_MULTI_TRADE_CROSS_MIDNIGHT_HOLIDAY_RATE_FIX';
  if(window.__CNMI_V582_MULTI_TRADE_CROSS_MIDNIGHT_HOLIDAY_RATE_FIX__)return;
  window.__CNMI_V582_MULTI_TRADE_CROSS_MIDNIGHT_HOLIDAY_RATE_FIX__=true;

  function S(){try{return state;}catch(_){return window.state||{};}}
  function r2(v){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
  function date(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function hm(v){const m=String(v||'').match(/(\d{1,2}):(\d{2})/);return m?`${String(+m[1]).padStart(2,'0')}:${m[2]}`:'';}
  function marker(note,key){const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i'));return m?String(m[1]||'').trim():'';}
  function markerNum(note,key){const n=Number(marker(note,key));return Number.isFinite(n)?n:0;}
  function addDays(d,n){const x=new Date(`${date(d)}T00:00:00`);if(Number.isNaN(x.getTime()))return date(d);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);}
  function durationHours(row){
    const st=hm(row?.start_time), en=hm(row?.end_time); if(!st||!en)return 0;
    const wd=date(row?.work_date), ed=date(row?.end_date)||wd;
    const [sh,sm]=st.split(':').map(Number),[eh,em]=en.split(':').map(Number);
    let start=new Date(`${wd}T${st}:00`), end=new Date(`${ed}T${en}:00`);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return 0;
    if(end<=start)end=new Date(`${addDays(wd,1)}T${en}:00`);
    return r2((end-start)/3600000);
  }
  function staff(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{};}
  function isTang(id){const s=staff(id);return String(s.nickname||'').trim()==='แตง'||/(^|\s)แตง($|\s)/.test(`${s.nickname||''} ${s.full_name||''}`.trim());}
  function code(a){return String(a?.duty_code||a?.shift_type||'').trim();}
  function rateType(id,duty){
    try{const t=dutyStaffTypeForRate(id,duty);if(t)return t==='เคิก'?'เคิก':'MT';}catch(_){}
    const s=staff(id);if(isTang(id)&&['ช3A','ช3B','ช4','ช4A','ช4B'].includes(String(duty||'')))return 'MT';
    return String(s.staff_type||s.type||'').trim()==='เคิก'?'เคิก':'MT';
  }
  function normalRate(t){return t==='เคิก'?90:130;}
  function holiday(d){try{return !!isHolidayDate(d);}catch(_){return false;}}
  function datedRate(t,d){return t==='เคิก'?(holiday(d)?120:90):(holiday(d)?160:130);}
  function assignment(id){return (S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null;}
  function soldHours(t,a){
    const mark=markerNum(t?.note,'SELL_HOURS'); if(mark>0)return r2(mark);
    const st=hm(marker(t?.note,'SELL_START')),en=hm(marker(t?.note,'SELL_END'));
    if(st&&en){let s=new Date(`2000-01-01T${st}:00`),e=new Date(`2000-01-01T${en}:00`);if(e<=s)e=new Date(`2000-01-02T${en}:00`);return r2((e-s)/3600000);}
    try{const h=Number(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return r2(h);}catch(_){}
    try{const h=Number(dutyHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return r2(h);}catch(_){}
    return 0;
  }
  function soldWindow(t,a){
    const st=hm(marker(t?.note,'SELL_START')),en=hm(marker(t?.note,'SELL_END'));
    if(st&&en)return {start:st,end:en};
    const h=soldHours(t,a);
    if(h===16)return {start:'16:00',end:'08:00'};
    if(h===24)return {start:'08:00',end:'08:00'};
    if(h===8)return {start:'08:00',end:'16:00'};
    return {start:'',end:''};
  }
  function paidType(t,a){
    const m=String(t?.rate_mode||'receiver').toLowerCase();
    if(m==='mt')return 'MT'; if(m==='kerk')return 'เคิก';
    if(m==='owner')return rateType(t?.requester_id,code(a));
    if(m==='receiver')return rateType(t?.receiver_id,code(a));
    return 'กำหนดเอง';
  }
  function tradeAmount(t,a,h){
    const saved=Number(t?.amount_from),mode=String(t?.rate_mode||'receiver').toLowerCase();
    if(Number.isFinite(saved)&&(saved>0||mode==='custom'))return r2(Math.max(0,saved));
    const pt=paidType(t,a);return pt==='กำหนดเอง'?0:r2(h*datedRate(pt,a?.duty_date));
  }
  function rowActual(row,base){return r2(durationHours(row)||base?.actualHours||0);}
  function completedForRow(row,base){
    const sid=String(row?.staff_id||''),d=date(row?.work_date);if(!sid||!d)return [];
    const rst=hm(row?.start_time),ren=hm(row?.end_time),dur=rowActual(row,base);
    const items=[];
    for(const t of (S().tradeRequests||[])){
      if(String(t?.status||'')!=='completed'||String(t?.receiver_id||'')!==sid)continue;
      const a=assignment(t?.from_assignment_id);if(!a||date(a?.duty_date)!==d)continue;
      const h=soldHours(t,a);if(h<=0)continue;
      const w=soldWindow(t,a);let score=0;
      if(rst&&ren&&w.start===rst&&w.end===ren)score+=100;
      if(Math.abs(h-dur)<=0.11)score+=30;
      if(String(row?.assignment_id||row?.roster_assignment_id||'')===String(a?.id||''))score+=80;
      const dc=String(row?.duty_code||row?.shift_type||row?.shift_code||'').trim(); if(dc&&dc===code(a))score+=25;
      const txt=`${row?.reason||''} ${row?.note||''}`;if(code(a)&&txt.includes(code(a)))score+=10;
      items.push({trade:t,assignment:a,soldHours:h,window:w,score});
    }
    if(!items.length)return [];
    const exact=items.filter(x=>x.score>=100);if(exact.length===1)return exact;
    const total=r2(items.reduce((s,x)=>s+x.soldHours,0));
    if(items.length>1&&Math.abs(total-dur)<=0.25)return items;
    items.sort((a,b)=>b.score-a.score||String(a.trade?.id||'').localeCompare(String(b.trade?.id||'')));
    return items[0]&&items[0].score>=25?[items[0]]:[];
  }
  function segment(x){
    const t=x.trade,a=x.assignment,h=x.soldHours,rt=rateType(t?.receiver_id,code(a)),base=normalRate(rt),amt=tradeAmount(t,a,h),pt=paidType(t,a);
    return {actualHours:h,hrHours:base?r2(amt/base):h,shiftType:code(a)||'-',rateType:rt,sourceRateType:pt,normalRate:base,appliedRate:h?r2(amt/h):0,isHoliday:holiday(a?.duty_date),amount:amt,trade:t,assignment:a,window:x.window};
  }
  function install(){
    const api=window.v190HrRateNormalization;if(!api||typeof api.otNormalizationBreakdown190!=='function')return false;
    if(api.otNormalizationBreakdown190.__v582Wrapped)return true;
    const prev=api.otNormalizationBreakdown190;
    const wrap=function(row){
      let base;try{base=prev(row);}catch(e){console.warn(`[${VERSION}] base`,e);return prev(row);}
      try{
        const matches=completedForRow(row,base);if(!matches.length)return base;
        const segs=matches.map(segment),actual=r2(segs.reduce((s,x)=>s+x.actualHours,0)),hr=r2(segs.reduce((s,x)=>s+x.hrHours,0)),amount=r2(segs.reduce((s,x)=>s+x.amount,0));
        return {...base,actualHours:actual,hrHours:hr,segments:segs,shiftType:segs.length===1?segs[0].shiftType:'หลายเวร',rateType:[...new Set(segs.map(x=>x.rateType))].join('/')||base?.rateType,isHoliday:segs.some(x=>x.isHoliday),tradeInfo:{aggregate:segs.length>1,count:segs.length,actualHours:actual,soldHours:actual,amount,claimHours:hr,trades:segs.map(x=>({trade:x.trade,assignment:x.assignment,soldHours:x.actualHours,amount:x.amount,claimHours:x.hrHours,sourceRateType:x.sourceRateType,appliedRate:x.appliedRate,window:x.window}))},isTradeRate:true,v582Authoritative:true};
      }catch(e){console.warn(`[${VERSION}] fallback`,e);return base;}
    };
    wrap.__v582Wrapped=true;wrap.__v582Previous=prev;api.otNormalizationBreakdown190=wrap;
    window.v582TradeFix={version:VERSION,completedForRow,soldHours,soldWindow,durationHours};
    return true;
  }
  let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>120)clearInterval(timer);},50);install();
  function mark(){document.querySelectorAll('[class*="version-chip"]').forEach(el=>{if(/^v\d+/i.test(String(el.textContent||'').trim())){el.textContent='v582';el.title='Multi-Trade Cross-Midnight Holiday Rate Fix';}});}
  mark();setTimeout(mark,700);setTimeout(mark,1800);window.addEventListener('hashchange',()=>setTimeout(mark,250));window.addEventListener('pageshow',()=>setTimeout(mark,250));
  console.info(`[${VERSION}] loaded`);
})();
