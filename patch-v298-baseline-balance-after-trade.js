/* CNMI Staff Planner V298
   Preserve Admin's original duty balance after completed shift sales.
   Current columns remain live; fairness/carry columns use the pre-sale roster.
   This patch is additive and keeps the complete V296/V297 UI intact.
*/
(function(){
  'use strict';
  const VERSION='V298_BASELINE_BALANCE_AFTER_TRADE';
  if(window.__CNMI_V298_BASELINE_BALANCE_AFTER_TRADE__)return;
  window.__CNMI_V298_BASELINE_BALANCE_AFTER_TRADE__=true;

  const fiscalCache=new Map();
  const fiscalLoading=new Map();
  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function DB(){try{return sb||window.sb||null;}catch(_){return window.sb||null;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normId(v){return String(v==null?'':v);}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function monthKeySafe(v){return /^\d{4}-\d{2}$/.test(String(v||''))?String(v):new Date().toISOString().slice(0,7);}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function explicitFalse(v){return v===false||['false','0','no','off','ปิด'].includes(String(v??'').trim().toLowerCase());}
  function isLongLeave(person){try{return !!isLongTermLeaveStaff(person);}catch(_){return person?.maternity_status===true||person?.is_long_term_leave===true;}}
  function isRosterPerson(person){
    if(!person)return false;
    const active=Object.prototype.hasOwnProperty.call(person,'is_active')?person.is_active:person.active;
    if(active==null||explicitFalse(active)||String(person.staff_type||'').trim()==='แพทย์')return false;
    const enabled=person.roster_enabled??person.duty_enabled??person.can_roster??person.is_roster_enabled??person.schedule_enabled??person.is_schedule_enabled;
    return !explicitFalse(enabled);
  }
  function ordered(rows){try{return orderedStaff(rows);}catch(_){return [...rows].sort((a,b)=>String(a?.nickname||a?.full_name||'').localeCompare(String(b?.nickname||b?.full_name||''),'th'));}}
  function groupLabel(person){return String(person?.staff_type||'').trim()==='เคิก'?'เคิก':'MT';}
  function badgeHtml(text,tone){try{return badge(text,tone);}catch(_){return `<span class="badge ${esc(tone||'')}">${esc(text)}</span>`;}}
  function staffPillHtml(person){try{return staffPill(person);}catch(_){return `<b>${esc(person?.nickname||person?.full_name||'-')}</b>`;}}
  function fmt(n){const x=Number(n||0);return Math.abs(x)<0.05?'0.0':x.toFixed(1);}
  function nextMonth(key){const [y,m]=key.split('-').map(Number),d=new Date(y,m,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function monthEnd(key){const [y,m]=key.split('-').map(Number);return `${key}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;}
  function fiscalBounds(key){const safe=monthKeySafe(key),y=Number(safe.slice(0,4)),m=Number(safe.slice(5,7)),sy=m>=10?y:y-1;return{start:`${sy}-10-01`,startKey:`${sy}-10`,end:monthEnd(safe),key:`${sy}-10_${safe}`};}
  function monthsBetween(start,end){const out=[];let cur=start,guard=0;while(cur<=end&&guard<24){out.push(cur);cur=nextMonth(cur);guard++;}return out;}
  function resetMonth(person,field){const raw=person?.[field];return raw?normDate(raw).slice(0,7):'';}
  function currentStaffList(staffList){const input=Array.isArray(staffList)&&staffList.length?staffList:(S()?.staff||[]).filter(isRosterPerson);return ordered(input.filter(p=>p&&String(p.staff_type||'').trim()!=='แพทย์'));}
  function calcStats(rows){try{return calcFairness((rows||[]).filter(r=>r?.staff_id))||{};}catch(_){return{};}}
  function countDutyCodes(rows,staffId){
    const own=(rows||[]).filter(r=>normId(r?.staff_id)===normId(staffId));
    const count=fn=>own.filter(fn).length;
    return{total:own.length,chbd1:count(r=>r.duty_code==='ชบด1'),chbd2:count(r=>r.duty_code==='ชบด2'),chbd3:count(r=>r.duty_code==='ชบด3'),ch3a:count(r=>r.duty_code==='ช3A'),ch3b:count(r=>r.duty_code==='ช3B'),ch4:count(r=>String(r.duty_code||'').startsWith('ช4')),ch9:count(r=>String(r.duty_code||'').startsWith('ช9'))};
  }
  function daysOff(staffId,key,rows){try{return Number(calculateDaysOff(staffId,key,rows)||0);}catch(_){return 0;}}
  function tradeTime(row){return row?.updated_at||row?.completed_at||row?.confirmed_at||row?.created_at||'';}
  function isWholeTrade(request,assignment){
    try{const api=window.cnmiTradeSegmentsV217;if(api){const part=api.partFromNote(request?.note,assignment);return api.coversWholeSlot(part,assignment);}}catch(_){}
    return true;
  }
  function completedTrades(rows){return (rows||[]).filter(r=>String(r?.status||'')==='completed'&&r?.from_assignment_id&&r?.requester_id);}
  function reconstructBaseline(assignments,trades){
    const output=(assignments||[]).map(row=>({...row}));
    const byId=new Map(output.filter(r=>r?.id).map(r=>[normId(r.id),r]));
    completedTrades(trades).slice().sort((a,b)=>String(tradeTime(b)).localeCompare(String(tradeTime(a)))).forEach(request=>{
      const assignment=byId.get(normId(request.from_assignment_id));
      if(!assignment||!isWholeTrade(request,assignment))return;
      assignment.staff_id=request.requester_id;
    });
    return output;
  }
  function mergeSelectedMonth(source,selected,key){
    const kept=(source||[]).filter(r=>!normDate(r?.duty_date).startsWith(key));
    return kept.concat((selected||[]).filter(r=>normDate(r?.duty_date).startsWith(key)));
  }
  function availableFiscal(key,selectedAssignments){
    const b=fiscalBounds(key),cached=fiscalCache.get(b.key),stateRows=(S()?.rosterAssignments||[]).filter(r=>{const d=normDate(r?.duty_date);return d>=b.start&&d<=b.end;});
    const current=mergeSelectedMonth(cached?.assignments||stateRows,selectedAssignments,key);
    const trades=cached?.trades||completedTrades(S()?.tradeRequests||[]);
    ensureFiscalData(key);
    return{bounds:b,current,trades,baseline:reconstructBaseline(current,trades)};
  }
  async function ensureFiscalData(key){
    const b=fiscalBounds(key);if(fiscalCache.has(b.key))return fiscalCache.get(b.key);if(fiscalLoading.has(b.key))return fiscalLoading.get(b.key);const client=DB();if(!client)return null;
    const task=(async()=>{
      try{
        const [a,t]=await Promise.all([
          client.from('roster_assignments').select('*').gte('duty_date',b.start).lte('duty_date',b.end).order('duty_date'),
          client.from('roster_trade_requests').select('*').eq('status','completed').order('created_at')
        ]);
        if(a.error)throw a.error;
        const ids=new Set((a.data||[]).map(r=>normId(r.id)));
        const trades=t.error?completedTrades(S()?.tradeRequests||[]):completedTrades(t.data||[]).filter(r=>ids.has(normId(r.from_assignment_id))||ids.has(normId(r.to_assignment_id)));
        const pack={assignments:a.data||[],trades};fiscalCache.set(b.key,pack);
        setTimeout(()=>{try{if(['scheduler','schedule','positionMonth'].includes(S()?.page))window.renderPage?.();}catch(_){}},0);
        return pack;
      }catch(error){console.warn(`${VERSION}: fiscal data`,error);return null;}
      finally{fiscalLoading.delete(b.key);}
    })();fiscalLoading.set(b.key,task);return task;
  }
  function buildBalanceData(staffList,assignments,key){
    const safe=monthKeySafe(key),people=currentStaffList(staffList),fiscal=availableFiscal(safe,assignments),months=monthsBetween(fiscal.bounds.startKey,safe);
    const currentByMonth=new Map(),baseByMonth=new Map();
    months.forEach(month=>{
      const currentRows=fiscal.current.filter(r=>normDate(r?.duty_date).startsWith(month)&&r?.staff_id);
      const baseRows=fiscal.baseline.filter(r=>normDate(r?.duty_date).startsWith(month)&&r?.staff_id);
      currentByMonth.set(month,{rows:currentRows,stats:calcStats(currentRows)});
      baseByMonth.set(month,{rows:baseRows,stats:calcStats(baseRows)});
    });
    const selectedCurrent=currentByMonth.get(safe)||{rows:[],stats:{}},selectedBase=baseByMonth.get(safe)||{rows:[],stats:{}};
    const groupNames=['MT','เคิก'].filter(label=>people.some(p=>groupLabel(p)===label));
    const groupAverages=new Map();
    months.forEach(month=>{
      const pack=baseByMonth.get(month)||{rows:[],stats:{}};const values={};
      groupNames.forEach(label=>{
        const eligible=people.filter(p=>groupLabel(p)===label&&!isLongLeave(p)&&(!resetMonth(p,'balance_reset_at')||month>=resetMonth(p,'balance_reset_at')));
        const units=eligible.map(p=>Number(pack.stats[normId(p.id)]?.units||0));
        const dayValues=eligible.map(p=>daysOff(p.id,month,pack.rows));
        values[label]={units:units.length?units.reduce((a,c)=>a+c,0)/units.length:0,days:dayValues.length?dayValues.reduce((a,c)=>a+c,0)/dayValues.length:0};
      });
      groupAverages.set(month,values);
    });
    const groups=groupNames.map(label=>{
      const groupPeople=people.filter(p=>groupLabel(p)===label),selectedAvg=groupAverages.get(safe)?.[label]||{units:0,days:0};
      const rows=groupPeople.map(person=>{
        const id=normId(person.id),currentStat=selectedCurrent.stats[id]||{},baseStat=selectedBase.stats[id]||{},excluded=isLongLeave(person);
        const dutyReset=resetMonth(person,'balance_reset_at'),holidayReset=resetMonth(person,'holiday_balance_reset_at');
        const dutyStart=dutyReset&&dutyReset>fiscal.bounds.startKey?dutyReset:fiscal.bounds.startKey;
        const holidayStart=holidayReset&&holidayReset>fiscal.bounds.startKey?holidayReset:fiscal.bounds.startKey;
        let carry=0,holidayCarry=0;
        months.filter(month=>month<safe).forEach(month=>{
          const pack=baseByMonth.get(month)||{rows:[],stats:{}};const averages=groupAverages.get(month)?.[label]||{units:0,days:0};
          if(!excluded&&month>=dutyStart)carry+=Number(pack.stats[id]?.units||0)-Number(averages.units||0);
          if(!excluded&&month>=holidayStart)holidayCarry+=daysOff(id,month,pack.rows)-Number(averages.days||0);
        });
        const baseUnits=Number(baseStat.units||0),gap=excluded?0:baseUnits-Number(selectedAvg.units||0),cumulative=excluded?0:carry+gap;
        const baseDays=daysOff(id,safe,selectedBase.rows),holidayGap=excluded?0:baseDays-Number(selectedAvg.days||0),holidayCumulative=excluded?0:holidayCarry+holidayGap;
        const currentDays=excluded?0:daysOff(id,safe,selectedCurrent.rows),counts=countDutyCodes(selectedBase.rows,id);
        let status='สมดุลสะสม',tone='green';
        if(excluded){status='ลาระยะยาว / ไม่คิดหนี้เวร';tone='black';}
        else if(dutyReset===safe&&Math.abs(cumulative)<=0.5){status='เริ่มนับเวรใหม่เดือนนี้';tone='blue';}
        else if(cumulative>0.5){status='เวรสะสมมากกว่าเฉลี่ย';tone='orange';}
        else if(cumulative<-0.5){status='เวรสะสมน้อยกว่าเฉลี่ย';tone='blue';}
        return{person,excluded,current:{total:Number(currentStat.total||0),units:Number(currentStat.units||0),hours:Number(currentStat.hours||0),pay:Number(currentStat.pay||0),days:currentDays},fixed:{gap,carry,cumulative,holidayCumulative,counts,dutyReset,holidayReset,status,tone}};
      });
      return{label,average:Number(selectedAvg.units||0),rows};
    });
    return{key:safe,groups};
  }
  function adminTable(data){
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v278-cumulative-dashboard v298-baseline-balance">${data.groups.map(group=>`<section class="balance-group-section"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยเดือนนี้ ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v278-balance-table-wrap"><table class="clean-balance-table v278-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th>OT Balance ยกมา</th><th>เวรสะสม</th><th>วันหยุดเดือนนี้</th><th>วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th class="v279-pair-column">ดูคู่เวร</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${group.rows.map(row=>{
      const f=row.fixed,c=row.current,id=normId(row.person.id),dutyReset=f.dutyReset===data.key,holidayReset=f.holidayReset===data.key;
      return `<tr class="${row.excluded?'v278-exempt-row':''}"><td>${staffPillHtml(row.person)}</td><td>${c.total}</td><td>${c.units.toFixed(1)}</td><td>${c.hours.toFixed(1)}</td><td>${Math.round(c.pay).toLocaleString()}</td><td class="${f.gap>0.5?'v278-positive':f.gap<-0.5?'v278-negative':''}">${fmt(f.gap)}</td><td class="${f.carry>0.5?'v278-positive':f.carry<-0.5?'v278-negative':''}">${fmt(f.carry)}</td><td class="${f.cumulative>0.5?'v278-positive':f.cumulative<-0.5?'v278-negative':''}">${fmt(f.cumulative)}</td><td>${c.days}</td><td class="${f.holidayCumulative>0.5?'v278-positive':f.holidayCumulative<-0.5?'v278-negative':''}">${fmt(f.holidayCumulative)}</td><td>${f.counts.chbd1}</td><td>${f.counts.chbd2}</td><td>${f.counts.chbd3}</td><td>${f.counts.ch3a}</td><td>${f.counts.ch3b}</td><td>${f.counts.ch4}</td><td>${f.counts.ch9}</td><td class="v279-pair-column"><button type="button" class="tiny-btn soft v279-pair-button" data-v279-duty-pair="${esc(id)}" data-v279-month="${esc(data.key)}">ดูคู่เวร</button></td><td>${badgeHtml(f.status,f.tone)}${f.dutyReset?`<small class="v278-reset-note">เวรเริ่ม ${esc(f.dutyReset)}</small>`:''}${f.holidayReset?`<small class="v278-reset-note">วันหยุดเริ่ม ${esc(f.holidayReset)}</small>`:''}</td><td><div class="v278-action-stack"><button type="button" class="tiny-btn ${dutyReset?'danger':'warning'}" data-v277-balance-reset="${esc(id)}" data-v277-month="${esc(data.key)}" data-v277-action="${dutyReset?'undo':'reset'}">${dutyReset?'ยกเลิกรีเซ็ตเวร':'เริ่มนับเวรใหม่เดือนนี้'}</button><button type="button" class="tiny-btn ${holidayReset?'danger':'soft'}" data-v278-holiday-reset="${esc(id)}" data-v278-month="${esc(data.key)}" data-v278-action="${holidayReset?'undo':'reset'}">${holidayReset?'ยกเลิกรีเซ็ตวันหยุด':'เริ่มนับวันหยุดใหม่เดือนนี้'}</button></div></td></tr>`;
    }).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }
  function staffTable(data){
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v265-balance-dashboard v298-baseline-balance">${data.groups.map(group=>`<section class="balance-group-section v265-balance-group"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ย ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v265-balance-wrap"><table class="clean-balance-table v265-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th>OT Balance</th><th>วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th></tr></thead><tbody>${group.rows.map(row=>{const f=row.fixed,c=row.current;return `<tr><td>${staffPillHtml(row.person)}</td><td>${c.total}</td><td>${c.units.toFixed(1)}</td><td>${c.hours.toFixed(1)}</td><td>${Math.round(c.pay).toLocaleString()}</td><td>${fmt(f.gap)}</td><td>${fmt(f.cumulative)}</td><td>${fmt(f.holidayCumulative)}</td><td>${f.counts.chbd1}</td><td>${f.counts.chbd2}</td><td>${f.counts.chbd3}</td><td>${f.counts.ch3a}</td><td>${f.counts.ch3b}</td><td>${f.counts.ch4}</td><td>${f.counts.ch9}</td><td>${badgeHtml(f.status,f.tone)}</td></tr>`;}).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }
  const previousRender=window.renderBalanceDashboard||(typeof renderBalanceDashboard==='function'?renderBalanceDashboard:null);
  const renderV298=function renderBalanceDashboardV298(staffList,assignments,key){
    try{const data=buildBalanceData(staffList,assignments,key||S()?.monthKey);return isAdminSafe()&&S()?.page==='scheduler'?adminTable(data):staffTable(data);}catch(error){console.error(`${VERSION}: render`,error);return previousRender?previousRender.apply(this,arguments):'<div class="empty-state">คำนวณสมดุลเวรไม่สำเร็จ</div>';}
  };
  window.renderBalanceDashboard=renderV298;try{renderBalanceDashboard=renderV298;}catch(_){}

  const showFairnessV298=function(){
    const key=monthKeySafe(S()?.monthKey);let assignments=[];let staffList=[];
    try{assignments=getAssignmentsForMonth(key).filter(r=>r?.staff_id);}catch(_){assignments=(S()?.rosterAssignments||[]).filter(r=>normDate(r?.duty_date).startsWith(key)&&r?.staff_id);}
    try{staffList=scheduleStaffList();}catch(_){staffList=(S()?.staff||[]).filter(isRosterPerson);}
    try{showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${staffTable(buildBalanceData(staffList,assignments,key))}`,{large:true});}catch(error){console.warn(`${VERSION}: fairness modal`,error);}
  };
  window.showFairness=showFairnessV298;try{showFairness=showFairnessV298;}catch(_){}

  const style=document.createElement('style');style.id='v298-baseline-balance-style';style.textContent=`
    .v298-baseline-balance .v278-balance-table,.v298-baseline-balance .v265-balance-table{font-variant-numeric:tabular-nums}
  `;document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
