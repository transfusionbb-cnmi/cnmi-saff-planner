/* CNMI Staff Planner V365 — direct previous-month OT carry for the summary table
   Rule: previous month's displayed carry-out becomes this month's carry-in.
   Snapshot rows are deliberately ignored while live approved OT rows exist. */
(function(){
  'use strict';
  if(window.__CNMI_V365_DIRECT_PREVIOUS_MONTH_CARRY__)return;
  window.__CNMI_V365_DIRECT_PREVIOUS_MONTH_CARRY__=true;

  const round2=v=>{const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100)/100:0;};
  const pad2=n=>String(n).padStart(2,'0');
  const monthKey=v=>/^\d{4}-\d{2}$/.test(String(v||'').slice(0,7))?String(v).slice(0,7):'';
  const previousMonth=v=>{const [y,m]=monthKey(v).split('-').map(Number),d=new Date(y,m-2,1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;};
  const monthRange=v=>{const key=monthKey(v),[y,m]=key.split('-').map(Number);return {month:key,start:`${key}-01`,end:`${key}-${pad2(new Date(y,m,0).getDate())}`};};
  const approved=row=>['อนุมัติ','approved','approve'].includes(String(row?.status||'').trim().toLowerCase());
  const db=()=>{try{return sb;}catch(_){return window.sb||null;}};
  const baseRate=staffId=>{
    let list=[];try{list=state?.staff||[];}catch(_){list=window.state?.staff||[];}
    const s=list.find(x=>String(x.id)===String(staffId))||{};
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
    const isHoliday=!!row?.is_holiday;
    const workRate=explicit==='MT'?(isHoliday?160:130):explicit==='CLERK'?(isHoliday?120:90):baseRate(row?.staff_id);
    return round2(actual*workRate/baseRate(row?.staff_id));
  };

  async function directPreviousMonthCarry(month){
    const target=monthKey(month),prev=monthRange(previousMonth(target)),client=db();
    if(!target||!client)throw new Error('ไม่พบเดือนหรือการเชื่อมต่อข้อมูล');
    const res=await client.from('ot_requests').select('*').gte('work_date',prev.start).lte('work_date',prev.end).order('work_date',{ascending:true});
    if(res.error)throw res.error;
    const totals=new Map(),anchors=new Map();
    (res.data||[]).filter(approved).forEach(row=>{
      const id=String(row.staff_id||'');if(!id)return;
      totals.set(id,round2((totals.get(id)||0)+hrHours(row)));
      if(!anchors.has(id))anchors.set(id,String(row.id||''));
    });
    const out=new Map();
    totals.forEach((total,id)=>{
      const claimed=Math.floor((total+1e-7)/8)*8;
      out.set(id,{amount:round2(Math.max(0,total-claimed)),sourceMonth:prev.month,source:'v365-direct-previous-month-live',anchorRowId:anchors.get(id)||''});
    });
    return out;
  }

  function install(){
    const api=window.cnmiV318;
    if(!api||typeof api.queryCarryInSummary!=='function')return false;
    if(api.queryCarryInSummary.__v365)return true;
    const fallback=api.queryCarryInSummary.bind(api);
    const wrapped=async function(month,force){
      try{
        const live=await directPreviousMonthCarry(month);
        if(live.size)return live;
      }catch(err){console.warn('[V365] direct previous-month carry failed; using saved fallback',err);}
      return fallback(month,force);
    };
    wrapped.__v365=true;
    api.queryCarryInSummary=wrapped;
    api.version='V365_DIRECT_PREVIOUS_MONTH_CARRY';
    window.dispatchEvent(new CustomEvent('cnmi:v365-ready'));
    return true;
  }
  if(!install()){
    let tries=0;const timer=setInterval(()=>{if(install()||++tries>=100)clearInterval(timer);},50);
  }
})();
