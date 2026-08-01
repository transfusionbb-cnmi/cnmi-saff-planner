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
