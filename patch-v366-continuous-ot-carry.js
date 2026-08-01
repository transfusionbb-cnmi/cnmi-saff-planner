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
