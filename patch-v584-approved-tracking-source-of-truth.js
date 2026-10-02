/* CNMI Staff Planner V584 — Approved Tracking Source of Truth
 * Goal:
 * - The Admin "ติดตามเจ้าหน้าที่" approved attendance view is authoritative.
 * - If one staff member has multiple completed received-trade segments on the same day,
 *   OT detail / monthly summary / HR export must include every approved worked segment.
 * - Missing legacy OT rows are synthesized in memory only; no database schema/write change.
 * - Existing real OT rows always win and are never duplicated.
 */
(function(){
  'use strict';
  const VERSION='V584_APPROVED_TRACKING_SOURCE_OF_TRUTH';
  if(window.__CNMI_V584_APPROVED_TRACKING_SOURCE_OF_TRUTH__) return;
  window.__CNMI_V584_APPROVED_TRACKING_SOURCE_OF_TRUTH__=true;

  let syncing=false;
  let renderTimer=null;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n)?Math.round(n*100)/100:0; }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function addDays(date,days){
    const d=new Date(`${normDate(date)}T12:00:00`); if(!Number.isFinite(d.getTime())) return normDate(date);
    d.setDate(d.getDate()+Number(days||0));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function approved(row){ const s=String(row?.status||'').trim().toLowerCase(); return s==='approved'||s==='อนุมัติ'||s==='อนุมัติแล้ว'; }
  function attendanceLike(row){ return /ยืนยัน(?:อยู่)?เวร|อยู่เวรตามตาราง|อยู่เวร|รับช่วง/i.test(`${row?.reason||''} ${row?.note||''}`); }
  function assignmentById(id){ return (S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null; }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function time(v){ const m=String(v||'').match(/(\d{1,2}):(\d{2})/); return m?`${String(+m[1]).padStart(2,'0')}:${m[2]}`:''; }
  function rowWindowHours(row){
    const st=time(row?.start_time), en=time(row?.end_time), wd=normDate(row?.work_date); if(!st||!en||!wd) return round2(row?.manual_hours||row?.requested_hours||row?.hours||0);
    const ed=normDate(row?.end_date)||wd;
    let a=new Date(`${wd}T${st}:00`), b=new Date(`${ed}T${en}:00`);
    if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())) return round2(row?.manual_hours||row?.requested_hours||row?.hours||0);
    if(b<=a) b=new Date(b.getTime()+24*3600000);
    const h=(b-a)/3600000; return h>0&&h<=24?round2(h):round2(row?.manual_hours||row?.requested_hours||row?.hours||0);
  }
  function tradeSpec(trade,a){
    try{
      const spec=window.cnmiTradeSegmentsV217?.tradeSpecFromNote?.(trade?.note,a);
      if(spec){
        const start=time(spec?.start || spec?.intervals?.[0]?.[0]);
        const end=time(spec?.end || spec?.intervals?.[spec?.intervals?.length-1]?.[1]);
        const hours=round2(spec?.hours||0);
        if(start&&end&&hours>0) return {start,end,hours,label:String(spec?.label||`${start}–${end}`)};
      }
    }catch(_){}
    const start=time(marker(trade?.note,'SELL_START'));
    const end=time(marker(trade?.note,'SELL_END'));
    let hours=round2(marker(trade?.note,'SELL_HOURS'));
    if(hours<=0){
      try{ hours=round2(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code)); }catch(_){}
      if(hours<=0) try{ hours=round2(dutyHoursForCode(a?.duty_date,a?.duty_code)); }catch(_){}
    }
    return {start,end,hours,label:start&&end?`${start}–${end}`:''};
  }
  function sameWindow(row,spec,a){
    if(String(row?.assignment_id||row?.roster_assignment_id||'')===String(a?.id||'')){
      const rs=time(row?.start_time), re=time(row?.end_time);
      if(!spec.start||!spec.end||(!rs&&!re)|| (rs===spec.start&&re===spec.end)) return true;
    }
    const rs=time(row?.start_time), re=time(row?.end_time);
    if(spec.start&&spec.end&&rs===spec.start&&re===spec.end) return true;
    const tagged=marker(row?.note,'V584_TRADE_ID');
    return !!tagged && tagged===String(a?._v584TradeId||'');
  }
  function monthFromRoute(){
    try{ const h=String(location.hash||''); const q=h.includes('?')?new URLSearchParams(h.split('?')[1]):null; const m=String(q?.get('month')||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(m)) return m; }catch(_){}
    const st=S();
    for(const v of [st.otMenuMonthV369,st.otMoneyMonthV241,st.otSourceMonthV241,st.otAdminMonthFilterV234,st.monthKey]){ const m=String(v||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(m)) return m; }
    return new Date().toISOString().slice(0,7);
  }
  function synthRows(month){
    const st=S();
    const source=(st.otRequests||[]).filter(r=>!r?._v584Synthetic);
    const approvedAttendance=source.filter(r=>approved(r)&&attendanceLike(r)&&normDate(r?.work_date).startsWith(month));
    const byStaffDate=new Map();
    approvedAttendance.forEach(r=>{
      const k=`${r.staff_id}|${normDate(r.work_date)}`; if(!byStaffDate.has(k)) byStaffDate.set(k,[]); byStaffDate.get(k).push(r);
    });
    const trades=(st.tradeRequests||[]).filter(t=>String(t?.status||'')==='completed'&&t?.receiver_id&&t?.from_assignment_id);
    const out=[];
    const groups=new Map();
    trades.forEach(trade=>{
      const a=assignmentById(trade.from_assignment_id); if(!a) return;
      const date=normDate(a.duty_date); if(!date.startsWith(month)) return;
      const sid=String(trade.receiver_id||''); const base=byStaffDate.get(`${sid}|${date}`)||[]; if(!base.length) return;
      const spec=tradeSpec(trade,a); if(spec.hours<=0) return;
      const key=`${sid}|${date}`; if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push({trade,a,spec,base});
    });

    groups.forEach(items=>{
      const base=items[0].base;
      const baseTotal=round2(base.reduce((s,r)=>s+rowWindowHours(r),0));
      const tradeTotal=round2(items.reduce((s,x)=>s+x.spec.hours,0));
      // A real combined row already represents all received segments; do not split/double count it.
      if(tradeTotal>0 && baseTotal>=tradeTotal-0.11 && base.some(r=>rowWindowHours(r)>=tradeTotal-0.11)) return;

      const usedBase=new Set();
      items.forEach(item=>{
        item.a._v584TradeId=String(item.trade.id||'');
        const matchIndex=base.findIndex((r,i)=>!usedBase.has(i)&&sameWindow(r,item.spec,item.a));
        if(matchIndex>=0){ usedBase.add(matchIndex); return; }
        // If an unmatched real row has essentially the same duration, assign it to this segment first.
        const durationIndex=base.findIndex((r,i)=>!usedBase.has(i)&&Math.abs(rowWindowHours(r)-item.spec.hours)<=0.11);
        if(durationIndex>=0){ usedBase.add(durationIndex); return; }

        const seed=base[0];
        const cross=!!(item.spec.start&&item.spec.end&&item.spec.end<=item.spec.start);
        const claim=String(seed?.claim_status||'pending');
        const cleanNote=String(seed?.note||'').replace(/\s*\[V584_[^\]]+\]\s*/ig,' ').trim();
        out.push({
          ...seed,
          id:`v584-trade-${item.trade.id||item.a.id}-${sid}`,
          work_date:normDate(item.a.duty_date),
          end_date:cross?addDays(item.a.duty_date,1):normDate(item.a.duty_date),
          start_time:item.spec.start||seed?.start_time||'',
          end_time:item.spec.end||seed?.end_time||'',
          manual_hours:item.spec.hours,
          requested_hours:item.spec.hours,
          hours:item.spec.hours,
          duty_code:item.a.duty_code||seed?.duty_code||'',
          shift_type:item.a.duty_code||seed?.shift_type||'',
          assignment_id:item.a.id,
          roster_assignment_id:item.a.id,
          reason:`อยู่เวร ${item.spec.label||item.a.duty_code||''}`.trim(),
          note:`${cleanNote}${cleanNote?' ':''}[V584_TRADE_ID=${item.trade.id||''}] [V584_TRACKING_SOURCE=approved]`,
          status:seed?.status||'approved',
          claim_status:claim,
          created_at:seed?.created_at||new Date().toISOString(),
          _v584Synthetic:true,
          _v584TradeId:String(item.trade.id||''),
          _v584SourceRowId:String(seed?.id||'')
        });
      });
    });
    return out;
  }
  function sync(month=monthFromRoute()){
    if(syncing) return {changed:false,count:0}; syncing=true;
    try{
      const st=S(); if(!Array.isArray(st.otRequests)) return {changed:false,count:0};
      const real=st.otRequests.filter(r=>!r?._v584Synthetic);
      const synthetic=synthRows(month);
      const before=st.otRequests.filter(r=>r?._v584Synthetic&&normDate(r?.work_date).startsWith(month)).length;
      st.otRequests=[...real,...synthetic];
      return {changed:before!==synthetic.length,count:synthetic.length};
    }finally{syncing=false;}
  }
  function patchApprovedDetails(){
    const api=window.cnmiV347; if(!api||typeof api.approvedDetails!=='function'||api.approvedDetails.__v584Wrapped) return false;
    const prev=api.approvedDetails;
    const wrapped=function(staffId,month){ sync(String(month||monthFromRoute()).slice(0,7)); return prev.call(this,staffId,month); };
    wrapped.__v584Wrapped=true; wrapped.__v584Previous=prev; api.approvedDetails=wrapped; return true;
  }
  function rerenderSoon(){
    clearTimeout(renderTimer); renderTimer=setTimeout(()=>{
      try{ sync(); patchApprovedDetails(); if(String(location.hash||'').startsWith('#/ot')){ if(typeof renderPage==='function') renderPage(); else window.renderPage?.(); } }catch(err){ console.warn(`[${VERSION}] rerender`,err); }
    },120);
  }
  async function preloadAndSync(){
    try{ await window.cnmiV577?.preloadOtReferenceData?.(monthFromRoute(),{force:false}); }catch(_){}
    const result=sync(); patchApprovedDetails();
    if(result.changed) rerenderSoon();
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim())) return;
      x.textContent='v584'; x.title='Approved Tracking Source of Truth';
    });
  }

  // Install after bundled OT APIs are ready.
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    const ok=patchApprovedDetails();
    if(ok||tries>100){ clearInterval(timer); preloadAndSync(); setTimeout(markVersion,300); }
  },80);
  window.addEventListener('hashchange',()=>{ setTimeout(preloadAndSync,80); setTimeout(markVersion,250); });
  window.addEventListener('pageshow',()=>setTimeout(preloadAndSync,120));

  window.cnmiV584={version:VERSION,sync,synthRows,patchApprovedDetails,preloadAndSync};
  console.info(`[${VERSION}] loaded`);
})();
