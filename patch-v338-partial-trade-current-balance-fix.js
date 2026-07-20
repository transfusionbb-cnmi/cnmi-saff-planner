/* CNMI Staff Planner V338
   Fix current monthly duty/day-off figures after partial shift sales.

   Business rules preserved:
   - Current columns reflect the people who actually work after completed sales,
     including 8/16-hour partial transfers.
   - Baseline fairness columns (Quota Gap, carry, cumulative balances, duty-type
     counts and status) remain based on the Admin's original roster before sales.
   - No new database table/RPC and no extra API request.
*/
(function(){
  'use strict';
  const VERSION='V338_PARTIAL_TRADE_CURRENT_BALANCE_FIX';
  if(window.__CNMI_V338_PARTIAL_TRADE_CURRENT_BALANCE_FIX__)return;
  window.__CNMI_V338_PARTIAL_TRADE_CURRENT_BALANCE_FIX__=true;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normId(v){return String(v==null?'':v);}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function monthKeySafe(v){return /^\d{4}-\d{2}$/.test(String(v||''))?String(v):new Date().toISOString().slice(0,7);}
  function monthEnd(key){const y=Number(key.slice(0,4)),m=Number(key.slice(5,7));return `${key}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function badgeHtml(text,tone){try{return badge(text,tone);}catch(_){return `<span class="badge ${esc(tone||'')}">${esc(text)}</span>`;}}
  function staffPillHtml(person){try{return staffPill(person);}catch(_){return `<b>${esc(person?.nickname||person?.full_name||'-')}</b>`;}}
  function staffColorSafe(person){try{return staffColor(person);}catch(_){return person?.staff_color||person?.color||'#e2e8f0';}}
  function textColorSafe(color){try{return textColorFor(color);}catch(_){return '#0f172a';}}
  function fmt(n){const x=Number(n||0);return Math.abs(x)<0.05?'0.0':x.toFixed(1);}
  function completedTrades(rows){return (rows||[]).filter(r=>String(r?.status||'')==='completed'&&r?.from_assignment_id&&r?.requester_id&&r?.receiver_id);}
  function tradeTime(row){return row?.updated_at||row?.confirmed_at||row?.created_at||'';}
  function mergeTrades(rows){
    const map=new Map();
    (rows||[]).forEach(row=>{
      const key=normId(row?.id)||`${normId(row?.from_assignment_id)}|${normId(row?.requester_id)}|${normId(row?.receiver_id)}|${String(row?.note||'')}|${tradeTime(row)}`;
      if(key)map.set(key,row);
    });
    return completedTrades([...map.values()]);
  }
  function tradeApi(){return window.cnmiTradeSegmentsV217||null;}
  function partFromRequest(request,assignment){
    try{const api=tradeApi();if(api?.partFromNote)return api.partFromNote(request?.note,assignment);}catch(_){}
    return String(request?.note||'').match(/\[SELL_PART=([a-z_]+)\]/i)?.[1]?.toLowerCase()||'';
  }
  function operationalFullHours(assignment){
    try{const h=Number(shiftPaymentHoursForCode(assignment?.duty_date,assignment?.duty_code));if(Number.isFinite(h)&&h>0)return h;}catch(_){}
    try{const h=Number(dutyHoursForCode(assignment?.duty_date,assignment?.duty_code));if(Number.isFinite(h)&&h>0)return h;}catch(_){}
    try{const m=dutyMetrics(assignment,assignment?.staff_id);const h=Number(m?.hours);if(Number.isFinite(h)&&h>0)return h;}catch(_){}
    return 8;
  }
  function soldHours(request,assignment){
    const part=partFromRequest(request,assignment);
    try{const api=tradeApi();if(api?.partHours){const h=Number(api.partHours(part,assignment));if(Number.isFinite(h)&&h>=0)return h;}}catch(_){}
    const marker=Number(String(request?.note||'').match(/\[SELL_HOURS=(\d+(?:\.\d+)?)\]/i)?.[1]||0);
    return marker>0?Math.min(marker,operationalFullHours(assignment)):operationalFullHours(assignment);
  }
  function isWholeTrade(request,assignment){
    const part=partFromRequest(request,assignment);
    try{const api=tradeApi();if(api?.coversWholeSlot)return !!api.coversWholeSlot(part,assignment);}catch(_){}
    return soldHours(request,assignment)>=operationalFullHours(assignment)-0.01;
  }
  function metricsFor(assignment,staffId){
    try{
      const m=dutyMetrics(assignment,staffId)||{};
      return {hours:Number(m.hours||0),units:Number(m.units||0),pay:Number(m.pay||0)};
    }catch(_){return {hours:0,units:0,pay:0};}
  }
  function emptyStat(){return {total:0,units:0,hours:0,pay:0,dutyDates:new Set()};}
  function statFor(map,staffId){
    const id=normId(staffId);
    if(!map.has(id))map.set(id,emptyStat());
    return map.get(id);
  }
  function addPortion(map,assignment,staffId,ratio,countAsEntry=true){
    const id=normId(staffId);if(!id||ratio<=0.0001)return;
    const m=metricsFor(assignment,id),stat=statFor(map,id),safeRatio=Math.max(0,Math.min(1,Number(ratio||0)));
    stat.total+=countAsEntry?1:0;
    stat.units+=m.units*safeRatio;
    stat.hours+=m.hours*safeRatio;
    stat.pay+=m.pay*safeRatio;
    const date=normDate(assignment?.duty_date);if(date)stat.dutyDates.add(date);
  }
  function effectiveCurrentStats(assignments,trades,key){
    const safe=monthKeySafe(key),rows=(assignments||[]).filter(row=>row?.staff_id&&normDate(row?.duty_date).startsWith(safe));
    const completed=mergeTrades(trades);
    const byAssignment=new Map();
    completed.forEach(request=>{
      const id=normId(request?.from_assignment_id);if(!id)return;
      if(!byAssignment.has(id))byAssignment.set(id,[]);
      byAssignment.get(id).push(request);
    });
    const stats=new Map();
    rows.forEach(assignment=>{
      const requests=(byAssignment.get(normId(assignment?.id))||[]).filter(request=>!isWholeTrade(request,assignment));
      if(!requests.length){addPortion(stats,assignment,assignment.staff_id,1,true);return;}
      const fullHours=Math.max(0.01,operationalFullHours(assignment));
      let soldRatio=0;
      requests.slice().sort((a,b)=>String(tradeTime(a)).localeCompare(String(tradeTime(b)))).forEach(request=>{
        const ratio=Math.max(0,Math.min(1,soldHours(request,assignment)/fullHours));
        if(ratio<=0)return;
        soldRatio+=ratio;
        addPortion(stats,assignment,request.receiver_id,ratio,true);
      });
      const remainRatio=Math.max(0,1-Math.min(1,soldRatio));
      if(remainRatio>0.0001)addPortion(stats,assignment,assignment.staff_id,remainRatio,true);
    });
    return stats;
  }
  function monthDatesSafe(key){
    try{return scheduleMonthDates(key);}catch(_){const y=Number(key.slice(0,4)),m=Number(key.slice(5,7)),last=new Date(y,m,0).getDate();return Array.from({length:last},(_,i)=>`${key}-${String(i+1).padStart(2,'0')}`);}
  }
  function isCalendarOff(date){
    try{return !!(isWeekend(date)||isHolidayDate(date));}catch(_){const d=new Date(`${date}T12:00:00`).getDay();return d===0||d===6;}
  }
  function currentDaysOff(staffId,key,stats){
    const dutyDates=stats.get(normId(staffId))?.dutyDates||new Set();
    return monthDatesSafe(key).reduce((sum,date)=>sum+(isCalendarOff(date)&&!dutyDates.has(normDate(date))?1:0),0);
  }
  function currentTrades(){
    const apiHistory=window.cnmiV336ContinuousBalance?._test?.history?.trades||[];
    const stateTrades=S()?.tradeRequests||[];
    return mergeTrades([...(apiHistory||[]),...(stateTrades||[])]);
  }
  function correctedData(staffList,assignments,key){
    const baseBuilder=window.cnmiV336ContinuousBalance?._test?.buildBalanceData;
    if(typeof baseBuilder!=='function')throw new Error('ไม่พบตัวคำนวณ V336');
    const safe=monthKeySafe(key),data=baseBuilder(staffList,assignments,safe),effective=effectiveCurrentStats(assignments,currentTrades(),safe);
    data.groups.forEach(group=>group.rows.forEach(row=>{
      const stat=effective.get(normId(row.person?.id))||emptyStat();
      row.current={
        total:Number(stat.total||0),
        units:Number(stat.units||0),
        hours:Number(stat.hours||0),
        pay:Number(stat.pay||0),
        days:row.excluded?0:currentDaysOff(row.person?.id,safe,effective)
      };
    }));
    return data;
  }
  function cumulativeCell(person,value,type){
    const bg=staffColorSafe(person),fg=textColorSafe(bg);
    return `<td class="v336-staff-cumulative v336-${esc(type)}" style="--v336-staff-bg:${esc(bg)};--v336-staff-fg:${esc(fg)};background:${esc(bg)};color:${esc(fg)}" title="ยอดสะสมตามแผนตั้งต้นของ ${esc(person?.nickname||person?.full_name||'เจ้าหน้าที่')}"><b>${fmt(value)}</b></td>`;
  }
  function balanceNote(){
    return `<div class="notice soft-notice v338-balance-rule-note"><b>การอ่านตาราง:</b> เวรรวม–เงินประมาณและวันหยุดเดือนนี้เป็นข้อมูลปัจจุบันหลังซื้อขายเวร ส่วน Quota Gap ยอดยกมา ยอดสะสม จำนวนเวรรายประเภท และสถานะ ยึดแผนตั้งต้นที่ Admin จัด</div>`;
  }
  function loadingHtml(){
    const history=window.cnmiV336ContinuousBalance?._test?.history||{};
    const message=history.error?`โหลดข้อมูลสะสมไม่สำเร็จ: ${history.error}`:'กำลังคำนวณเวรสะสมและวันหยุดสะสมจากทุกเดือน กรุณารอสักครู่…';
    return `<div class="notice ${history.error?'danger-notice':'soft-notice'} v336-balance-loading"><b>${esc(message)}</b></div>`;
  }
  function adminTable(data){
    return `${balanceNote()}<div class="clean-balance-dashboard grouped-balance-dashboard v278-cumulative-dashboard v298-baseline-balance v336-continuous-balance v338-current-trade-balance">${data.groups.map(group=>`<section class="balance-group-section"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยตั้งต้นเดือนนี้ ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v278-balance-table-wrap"><table class="clean-balance-table v278-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th title="ปัจจุบันหลังซื้อขายเวร">เวรรวม</th><th title="ปัจจุบันหลังซื้อขายเวร">หน่วยเวร</th><th title="ปัจจุบันหลังซื้อขายเวร">ชั่วโมงรวม</th><th title="ปัจจุบันหลังซื้อขายเวร">เงินประมาณ</th><th>Quota Gap</th><th>OT Balance ยกมา</th><th class="v336-cumulative-head">เวรสะสมเดือนนี้</th><th title="ปัจจุบันหลังซื้อขายเวร รวมการรับซื้อเฉพาะช่วง">วันหยุดเดือนนี้</th><th class="v336-cumulative-head">วันหยุดสะสมเดือนนี้</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th class="v279-pair-column">ดูคู่เวร</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${group.rows.map(row=>{
      const f=row.fixed,c=row.current,id=normId(row.person.id),dutyReset=f.dutyReset===data.key,holidayReset=f.holidayReset===data.key;
      return `<tr class="${row.excluded?'v278-exempt-row':''}"><td>${staffPillHtml(row.person)}</td><td>${Number(c.total||0)}</td><td>${Number(c.units||0).toFixed(1)}</td><td>${Number(c.hours||0).toFixed(1)}</td><td>${Math.round(Number(c.pay||0)).toLocaleString()}</td><td class="${f.gap>0.5?'v278-positive':f.gap<-0.5?'v278-negative':''}">${fmt(f.gap)}</td><td class="${f.carry>0.5?'v278-positive':f.carry<-0.5?'v278-negative':''}">${fmt(f.carry)}</td>${cumulativeCell(row.person,f.cumulative,'duty')}<td>${Number(c.days||0)}</td>${cumulativeCell(row.person,f.holidayCumulative,'holiday')}<td>${f.counts.chbd1}</td><td>${f.counts.chbd2}</td><td>${f.counts.chbd3}</td><td>${f.counts.ch3a}</td><td>${f.counts.ch3b}</td><td>${f.counts.ch4}</td><td>${f.counts.ch9}</td><td class="v279-pair-column"><button type="button" class="tiny-btn soft v279-pair-button" data-v279-duty-pair="${esc(id)}" data-v279-month="${esc(data.key)}">ดูคู่เวร</button></td><td>${badgeHtml(f.status,f.tone)}${f.dutyReset?`<small class="v278-reset-note">เวรเริ่ม ${esc(f.dutyReset)}</small>`:''}${f.holidayReset?`<small class="v278-reset-note">วันหยุดเริ่ม ${esc(f.holidayReset)}</small>`:''}</td><td><div class="v278-action-stack"><button type="button" class="tiny-btn ${dutyReset?'danger':'warning'}" data-v277-balance-reset="${esc(id)}" data-v277-month="${esc(data.key)}" data-v277-action="${dutyReset?'undo':'reset'}">${dutyReset?'ยกเลิกรีเซ็ตเวร':'เริ่มนับเวรใหม่เดือนนี้'}</button><button type="button" class="tiny-btn ${holidayReset?'danger':'soft'}" data-v278-holiday-reset="${esc(id)}" data-v278-month="${esc(data.key)}" data-v278-action="${holidayReset?'undo':'reset'}">${holidayReset?'ยกเลิกรีเซ็ตวันหยุด':'เริ่มนับวันหยุดใหม่เดือนนี้'}</button></div></td></tr>`;
    }).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }
  function staffTable(data){
    return `${balanceNote()}<div class="clean-balance-dashboard grouped-balance-dashboard v265-balance-dashboard v298-baseline-balance v336-continuous-balance v338-current-trade-balance">${data.groups.map(group=>`<section class="balance-group-section v265-balance-group"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยตั้งต้น ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v265-balance-wrap"><table class="clean-balance-table v265-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th title="ปัจจุบันหลังซื้อขายเวร">เวรรวม</th><th title="ปัจจุบันหลังซื้อขายเวร">หน่วยเวร</th><th title="ปัจจุบันหลังซื้อขายเวร">ชั่วโมงรวม</th><th title="ปัจจุบันหลังซื้อขายเวร">เงินประมาณ</th><th>Quota Gap</th><th class="v336-cumulative-head">เวรสะสมเดือนนี้</th><th class="v336-cumulative-head">วันหยุดสะสมเดือนนี้</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th></tr></thead><tbody>${group.rows.map(row=>{const f=row.fixed,c=row.current;return `<tr><td>${staffPillHtml(row.person)}</td><td>${Number(c.total||0)}</td><td>${Number(c.units||0).toFixed(1)}</td><td>${Number(c.hours||0).toFixed(1)}</td><td>${Math.round(Number(c.pay||0)).toLocaleString()}</td><td>${fmt(f.gap)}</td>${cumulativeCell(row.person,f.cumulative,'duty')}${cumulativeCell(row.person,f.holidayCumulative,'holiday')}<td>${f.counts.chbd1}</td><td>${f.counts.chbd2}</td><td>${f.counts.chbd3}</td><td>${f.counts.ch3a}</td><td>${f.counts.ch3b}</td><td>${f.counts.ch4}</td><td>${f.counts.ch9}</td><td>${badgeHtml(f.status,f.tone)}</td></tr>`;}).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }

  const previousRender=window.renderBalanceDashboard||(typeof renderBalanceDashboard==='function'?renderBalanceDashboard:null);
  const renderV338=function renderBalanceDashboardV338(staffList,assignments,key){
    const safe=monthKeySafe(key||S()?.monthKey),v336=window.cnmiV336ContinuousBalance,history=v336?._test?.history;
    if(!v336||!history||typeof v336?._test?.buildBalanceData!=='function')return previousRender?previousRender.apply(this,arguments):'<div class="empty-state">ยังโหลดตัวคำนวณสมดุลเวรไม่ครบ</div>';
    if(!history.ready){v336.ensureHistory?.(safe);return loadingHtml();}
    if(String(history.loadedThrough||'')<monthEnd(safe)){v336.ensureHistory?.(safe);return loadingHtml();}
    try{const data=correctedData(staffList,assignments,safe);return isAdminSafe()&&S()?.page==='scheduler'?adminTable(data):staffTable(data);}catch(error){console.error(`${VERSION}: render`,error);return previousRender?previousRender.apply(this,arguments):'<div class="empty-state">คำนวณสมดุลเวรไม่สำเร็จ</div>';}
  };
  window.renderBalanceDashboard=renderV338;try{renderBalanceDashboard=renderV338;}catch(_){}

  const showFairnessV338=function(){
    const key=monthKeySafe(S()?.monthKey),v336=window.cnmiV336ContinuousBalance,history=v336?._test?.history;let assignments=[],staffList=[];
    try{assignments=getAssignmentsForMonth(key).filter(r=>r?.staff_id);}catch(_){assignments=(S()?.rosterAssignments||[]).filter(r=>normDate(r?.duty_date).startsWith(key)&&r?.staff_id);}
    try{staffList=scheduleStaffList();}catch(_){staffList=S()?.staff||[];}
    if(!history?.ready||String(history.loadedThrough||'')<monthEnd(key)){v336?.ensureHistory?.(key);try{showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${loadingHtml()}`,{large:true});}catch(_){}return;}
    try{showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${staffTable(correctedData(staffList,assignments,key))}`,{large:true});}catch(error){console.warn(`${VERSION}: fairness modal`,error);}
  };
  window.showFairness=showFairnessV338;try{showFairness=showFairnessV338;}catch(_){}

  const style=document.createElement('style');
  style.id='v338-partial-trade-current-balance-style';
  style.textContent=`
    .v338-balance-rule-note{margin:0 0 12px;line-height:1.55}
    .v338-current-trade-balance th[title]{text-decoration:underline dotted rgba(15,23,42,.35);text-underline-offset:3px}
  `;
  document.head.appendChild(style);

  window.cnmiV338PartialTradeBalance={version:VERSION,_test:{effectiveCurrentStats,currentDaysOff,soldHours,isWholeTrade,correctedData}};
  console.info(`${VERSION} loaded`);
})();
