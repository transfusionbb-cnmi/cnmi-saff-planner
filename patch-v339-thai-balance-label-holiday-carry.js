/* CNMI Staff Planner V339
   Make monthly balance headings easier to understand and show holiday carry-forward.
   - Remove the explanatory notice above MT/Clerk groups.
   - Use clear Thai labels instead of Quota Gap / OT Balance.
   - Show duty and holiday carry-forward separately from cumulative totals.
   - Keep V338 calculation rules; no new Supabase request and no SQL change.
*/
(function(){
  'use strict';
  const VERSION='V339_THAI_BALANCE_LABEL_HOLIDAY_CARRY';
  if(window.__CNMI_V339_THAI_BALANCE_LABEL_HOLIDAY_CARRY__)return;
  window.__CNMI_V339_THAI_BALANCE_LABEL_HOLIDAY_CARRY__=true;

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
  function signedClass(v){const n=Number(v||0);return n>0.5?'v278-positive':n<-0.5?'v278-negative':'';}

  function cumulativeCell(person,value,type){
    const bg=staffColorSafe(person),fg=textColorSafe(bg);
    return `<td class="v336-staff-cumulative v336-${esc(type)}" style="--v336-staff-bg:${esc(bg)};--v336-staff-fg:${esc(fg)};background:${esc(bg)};color:${esc(fg)}" title="ยอดสะสมต่อเนื่องของ ${esc(person?.nickname||person?.full_name||'เจ้าหน้าที่')}"><b>${fmt(value)}</b></td>`;
  }
  function loadingHtml(){
    const history=window.cnmiV336ContinuousBalance?._test?.history||{};
    const message=history.error?`โหลดข้อมูลสะสมไม่สำเร็จ: ${history.error}`:'กำลังคำนวณเวรสะสมและวันหยุดสะสมจากทุกเดือน กรุณารอสักครู่…';
    return `<div class="notice ${history.error?'danger-notice':'soft-notice'} v336-balance-loading"><b>${esc(message)}</b></div>`;
  }
  function correctedData(staffList,assignments,key){
    const builder=window.cnmiV338PartialTradeBalance?._test?.correctedData;
    if(typeof builder!=='function')throw new Error('ไม่พบตัวคำนวณ V338');
    return builder(staffList,assignments,key);
  }

  function adminTable(data){
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v278-cumulative-dashboard v298-baseline-balance v336-continuous-balance v338-current-trade-balance v339-thai-balance">${data.groups.map(group=>`<section class="balance-group-section"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยตั้งต้นเดือนนี้ ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v278-balance-table-wrap"><table class="clean-balance-table v278-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>ส่วนต่างเวรเดือนนี้</th><th>เวรยกมา</th><th class="v336-cumulative-head">เวรสะสม</th><th>วันหยุดเดือนนี้</th><th>วันหยุดยกมา</th><th class="v336-cumulative-head">วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th class="v279-pair-column">ดูคู่เวร</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${group.rows.map(row=>{
      const f=row.fixed||{},c=row.current||{},id=normId(row.person?.id),dutyReset=f.dutyReset===data.key,holidayReset=f.holidayReset===data.key;
      return `<tr class="${row.excluded?'v278-exempt-row':''}"><td>${staffPillHtml(row.person)}</td><td>${Number(c.total||0)}</td><td>${Number(c.units||0).toFixed(1)}</td><td>${Number(c.hours||0).toFixed(1)}</td><td>${Math.round(Number(c.pay||0)).toLocaleString()}</td><td class="${signedClass(f.gap)}">${fmt(f.gap)}</td><td class="${signedClass(f.carry)}">${fmt(f.carry)}</td>${cumulativeCell(row.person,f.cumulative,'duty')}<td>${Number(c.days||0)}</td><td class="${signedClass(f.holidayCarry)}">${fmt(f.holidayCarry)}</td>${cumulativeCell(row.person,f.holidayCumulative,'holiday')}<td>${Number(f.counts?.chbd1||0)}</td><td>${Number(f.counts?.chbd2||0)}</td><td>${Number(f.counts?.chbd3||0)}</td><td>${Number(f.counts?.ch3a||0)}</td><td>${Number(f.counts?.ch3b||0)}</td><td>${Number(f.counts?.ch4||0)}</td><td>${Number(f.counts?.ch9||0)}</td><td class="v279-pair-column"><button type="button" class="tiny-btn soft v279-pair-button" data-v279-duty-pair="${esc(id)}" data-v279-month="${esc(data.key)}">ดูคู่เวร</button></td><td>${badgeHtml(f.status,f.tone)}${f.dutyReset?`<small class="v278-reset-note">เวรเริ่ม ${esc(f.dutyReset)}</small>`:''}${f.holidayReset?`<small class="v278-reset-note">วันหยุดเริ่ม ${esc(f.holidayReset)}</small>`:''}</td><td><div class="v278-action-stack"><button type="button" class="tiny-btn ${dutyReset?'danger':'warning'}" data-v277-balance-reset="${esc(id)}" data-v277-month="${esc(data.key)}" data-v277-action="${dutyReset?'undo':'reset'}">${dutyReset?'ยกเลิกรีเซ็ตเวร':'เริ่มนับเวรใหม่เดือนนี้'}</button><button type="button" class="tiny-btn ${holidayReset?'danger':'soft'}" data-v278-holiday-reset="${esc(id)}" data-v278-month="${esc(data.key)}" data-v278-action="${holidayReset?'undo':'reset'}">${holidayReset?'ยกเลิกรีเซ็ตวันหยุด':'เริ่มนับวันหยุดใหม่เดือนนี้'}</button></div></td></tr>`;
    }).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }

  function staffTable(data){
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v265-balance-dashboard v298-baseline-balance v336-continuous-balance v338-current-trade-balance v339-thai-balance">${data.groups.map(group=>`<section class="balance-group-section v265-balance-group"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยตั้งต้น ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v265-balance-wrap"><table class="clean-balance-table v265-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>ส่วนต่างเวรเดือนนี้</th><th>เวรยกมา</th><th class="v336-cumulative-head">เวรสะสม</th><th>วันหยุดเดือนนี้</th><th>วันหยุดยกมา</th><th class="v336-cumulative-head">วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th></tr></thead><tbody>${group.rows.map(row=>{
      const f=row.fixed||{},c=row.current||{};
      return `<tr><td>${staffPillHtml(row.person)}</td><td>${Number(c.total||0)}</td><td>${Number(c.units||0).toFixed(1)}</td><td>${Number(c.hours||0).toFixed(1)}</td><td>${Math.round(Number(c.pay||0)).toLocaleString()}</td><td class="${signedClass(f.gap)}">${fmt(f.gap)}</td><td class="${signedClass(f.carry)}">${fmt(f.carry)}</td>${cumulativeCell(row.person,f.cumulative,'duty')}<td>${Number(c.days||0)}</td><td class="${signedClass(f.holidayCarry)}">${fmt(f.holidayCarry)}</td>${cumulativeCell(row.person,f.holidayCumulative,'holiday')}<td>${Number(f.counts?.chbd1||0)}</td><td>${Number(f.counts?.chbd2||0)}</td><td>${Number(f.counts?.chbd3||0)}</td><td>${Number(f.counts?.ch3a||0)}</td><td>${Number(f.counts?.ch3b||0)}</td><td>${Number(f.counts?.ch4||0)}</td><td>${Number(f.counts?.ch9||0)}</td><td>${badgeHtml(f.status,f.tone)}</td></tr>`;
    }).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }

  const previousRender=window.renderBalanceDashboard||(typeof renderBalanceDashboard==='function'?renderBalanceDashboard:null);
  const renderV339=function renderBalanceDashboardV339(staffList,assignments,key){
    const safe=monthKeySafe(key||S()?.monthKey),v336=window.cnmiV336ContinuousBalance,history=v336?._test?.history;
    if(!window.cnmiV338PartialTradeBalance||!v336||!history)return previousRender?previousRender.apply(this,arguments):'<div class="empty-state">ยังโหลดตัวคำนวณสมดุลเวรไม่ครบ</div>';
    if(!history.ready){v336.ensureHistory?.(safe);return loadingHtml();}
    if(String(history.loadedThrough||'')<monthEnd(safe)){v336.ensureHistory?.(safe);return loadingHtml();}
    try{const data=correctedData(staffList,assignments,safe);return isAdminSafe()&&S()?.page==='scheduler'?adminTable(data):staffTable(data);}catch(error){console.error(`${VERSION}: render`,error);return previousRender?previousRender.apply(this,arguments):'<div class="empty-state">คำนวณสมดุลเวรไม่สำเร็จ</div>';}
  };
  window.renderBalanceDashboard=renderV339;try{renderBalanceDashboard=renderV339;}catch(_){}

  const showFairnessV339=function(){
    const key=monthKeySafe(S()?.monthKey),v336=window.cnmiV336ContinuousBalance,history=v336?._test?.history;let assignments=[],staffList=[];
    try{assignments=getAssignmentsForMonth(key).filter(r=>r?.staff_id);}catch(_){assignments=(S()?.rosterAssignments||[]).filter(r=>normDate(r?.duty_date).startsWith(key)&&r?.staff_id);}
    try{staffList=scheduleStaffList();}catch(_){staffList=S()?.staff||[];}
    if(!history?.ready||String(history.loadedThrough||'')<monthEnd(key)){v336?.ensureHistory?.(key);try{showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${loadingHtml()}`,{large:true});}catch(_){}return;}
    try{showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${staffTable(correctedData(staffList,assignments,key))}`,{large:true});}catch(error){console.warn(`${VERSION}: fairness modal`,error);}
  };
  window.showFairness=showFairnessV339;try{showFairness=showFairnessV339;}catch(_){}

  const style=document.createElement('style');
  style.id='v339-thai-balance-style';
  style.textContent=`
    .v339-thai-balance th{white-space:nowrap}
    .v339-thai-balance th:nth-child(6),.v339-thai-balance th:nth-child(7),.v339-thai-balance th:nth-child(10){min-width:96px}
    .v339-thai-balance td:nth-child(6),.v339-thai-balance td:nth-child(7),.v339-thai-balance td:nth-child(10){font-variant-numeric:tabular-nums;text-align:center}
  `;
  document.head.appendChild(style);

  window.cnmiV339ThaiBalance={version:VERSION,_test:{adminTable,staffTable,correctedData}};
  console.info(`${VERSION} loaded`);
})();
