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
