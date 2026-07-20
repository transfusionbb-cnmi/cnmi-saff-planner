/* CNMI Staff Planner V336
   Continuous duty + holiday balance across every available month.
   - No automatic calendar/fiscal-year reset
   - Reset only from each staff member's Admin reset month
   - Preserve V298 pre-trade baseline logic
   - Highlight current cumulative duty/holiday columns with each staff colour
   - Load only the compact historical columns required for this calculation
*/
(function(){
  'use strict';
  const VERSION='V336_CONTINUOUS_BALANCE_STAFF_COLOR';
  if(window.__CNMI_V336_CONTINUOUS_BALANCE_STAFF_COLOR__)return;
  window.__CNMI_V336_CONTINUOUS_BALANCE_STAFF_COLOR__=true;

  const history={
    assignments:[],
    trades:[],
    holidays:[],
    loadedThrough:'',
    ready:false,
    loading:null,
    error:''
  };
  const PAGE_SIZE=1000;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function DB(){try{return sb||window.sb||null;}catch(_){return window.sb||null;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normId(v){return String(v==null?'':v);}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function monthKeySafe(v){return /^\d{4}-\d{2}$/.test(String(v||''))?String(v):new Date().toISOString().slice(0,7);}
  function monthEnd(key){const y=Number(key.slice(0,4)),m=Number(key.slice(5,7));return `${key}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;}
  function nextMonth(key){const y=Number(key.slice(0,4)),m=Number(key.slice(5,7)),d=new Date(y,m,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function nextDate(date){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function monthsBetween(start,end){const out=[];let cur=start,guard=0;while(cur<=end&&guard<600){out.push(cur);cur=nextMonth(cur);guard++;}return out;}
  function explicitFalse(v){return v===false||['false','0','no','off','ปิด'].includes(String(v??'').trim().toLowerCase());}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function isLongLeave(person){try{return !!isLongTermLeaveStaff(person);}catch(_){return person?.maternity_status===true||person?.is_long_term_leave===true;}}
  function isRosterPerson(person){
    if(!person)return false;
    const active=Object.prototype.hasOwnProperty.call(person,'is_active')?person.is_active:person.active;
    if(active==null||explicitFalse(active)||String(person.staff_type||'').trim()==='แพทย์')return false;
    const enabled=person.roster_enabled??person.duty_enabled??person.can_roster??person.is_roster_enabled??person.schedule_enabled??person.is_schedule_enabled;
    return !explicitFalse(enabled);
  }
  function ordered(rows){try{return orderedStaff(rows);}catch(_){return [...rows].sort((a,b)=>String(a?.nickname||a?.full_name||'').localeCompare(String(b?.nickname||b?.full_name||''),'th'));}}
  function currentStaffList(staffList){const input=Array.isArray(staffList)&&staffList.length?staffList:(S()?.staff||[]).filter(isRosterPerson);return ordered(input.filter(p=>p&&String(p.staff_type||'').trim()!=='แพทย์'));}
  function groupLabel(person){return String(person?.staff_type||'').trim()==='เคิก'?'เคิก':'MT';}
  function resetMonth(person,field){const raw=person?.[field];return raw?normDate(raw).slice(0,7):'';}
  function badgeHtml(text,tone){try{return badge(text,tone);}catch(_){return `<span class="badge ${esc(tone||'')}">${esc(text)}</span>`;}}
  function staffPillHtml(person){try{return staffPill(person);}catch(_){return `<b>${esc(person?.nickname||person?.full_name||'-')}</b>`;}}
  function staffColorSafe(person){try{return staffColor(person);}catch(_){return person?.staff_color||person?.color||'#e2e8f0';}}
  function textColorSafe(color){try{return textColorFor(color);}catch(_){return '#0f172a';}}
  function fmt(n){const x=Number(n||0);return Math.abs(x)<0.05?'0.0':x.toFixed(1);}
  function calcStats(rows){try{return calcFairness((rows||[]).filter(r=>r?.staff_id))||{};}catch(_){return{};}}
  function daysOff(staffId,key,rows){try{return Number(calculateDaysOff(staffId,key,rows)||0);}catch(_){return 0;}}
  function countDutyCodes(rows,staffId){
    const own=(rows||[]).filter(r=>normId(r?.staff_id)===normId(staffId));
    const count=fn=>own.filter(fn).length;
    return{total:own.length,chbd1:count(r=>r.duty_code==='ชบด1'),chbd2:count(r=>r.duty_code==='ชบด2'),chbd3:count(r=>r.duty_code==='ชบด3'),ch3a:count(r=>r.duty_code==='ช3A'),ch3b:count(r=>r.duty_code==='ช3B'),ch4:count(r=>String(r.duty_code||'').startsWith('ช4')),ch9:count(r=>String(r.duty_code||'').startsWith('ช9'))};
  }
  function tradeTime(row){return row?.updated_at||row?.completed_at||row?.confirmed_at||row?.created_at||'';}
  function completedTrades(rows){return (rows||[]).filter(r=>String(r?.status||'')==='completed'&&r?.from_assignment_id&&r?.requester_id);}
  function isWholeTrade(request,assignment){
    try{const api=window.cnmiTradeSegmentsV217;if(api){const part=api.partFromNote(request?.note,assignment);return api.coversWholeSlot(part,assignment);}}catch(_){}
    return true;
  }
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
  function mergeUnique(rows,keyFn){
    const map=new Map();
    (rows||[]).forEach(row=>{const key=keyFn(row);if(key)map.set(key,row);});
    return [...map.values()];
  }
  function mergeHolidaysIntoState(rows){
    const st=S();if(!st)return;
    st.holidays=mergeUnique([...(st.holidays||[]),...(rows||[])],r=>normDate(r?.holiday_date||r?.date));
  }

  async function fetchPaged(makeQuery){
    const rows=[];
    for(let from=0,guard=0;guard<100;from+=PAGE_SIZE,guard++){
      const result=await makeQuery(from,from+PAGE_SIZE-1);
      if(result?.error)throw result.error;
      const page=Array.isArray(result?.data)?result.data:[];
      rows.push(...page);
      if(page.length<PAGE_SIZE)break;
    }
    return rows;
  }
  async function fetchAssignments(client,startDate,endDate){
    return fetchPaged((from,to)=>{
      let q=client.from('roster_assignments').select('id,duty_date,duty_code,staff_id').not('staff_id','is',null).lte('duty_date',endDate).order('duty_date').range(from,to);
      if(startDate)q=q.gte('duty_date',startDate);
      return q;
    });
  }
  async function fetchHolidays(client,startDate,endDate){
    return fetchPaged((from,to)=>{
      let q=client.from('public_holidays').select('holiday_date,title').lte('holiday_date',endDate).order('holiday_date').range(from,to);
      if(startDate)q=q.gte('holiday_date',startDate);
      return q;
    });
  }
  async function fetchTrades(client){
    return fetchPaged((from,to)=>client.from('roster_trade_requests')
      .select('id,status,from_assignment_id,to_assignment_id,requester_id,receiver_id,note,updated_at,confirmed_at,created_at')
      .eq('status','completed').order('created_at').range(from,to));
  }
  function invalidateHistory(){
    history.assignments=[];history.trades=[];history.holidays=[];history.loadedThrough='';history.ready=false;history.loading=null;history.error='';
  }
  async function ensureHistoryData(key){
    const safe=monthKeySafe(key),endDate=monthEnd(safe);
    if(history.ready&&history.loadedThrough>=endDate)return history;
    if(history.loading)return history.loading;
    const client=DB();
    if(!client){history.error='ไม่พบการเชื่อมต่อฐานข้อมูล';return history;}
    const startDate=history.ready&&history.loadedThrough?nextDate(history.loadedThrough):'';
    history.loading=(async()=>{
      try{
        const [newAssignments,newHolidays,newTrades]=await Promise.all([
          fetchAssignments(client,startDate,endDate),
          fetchHolidays(client,startDate,endDate),
          fetchTrades(client)
        ]);
        history.assignments=mergeUnique([...(history.assignments||[]),...newAssignments],r=>normId(r?.id)||`${normDate(r?.duty_date)}|${r?.duty_code}|${normId(r?.staff_id)}`);
        history.holidays=mergeUnique([...(history.holidays||[]),...newHolidays],r=>normDate(r?.holiday_date));
        history.trades=completedTrades(newTrades);
        history.loadedThrough=endDate;
        history.ready=true;
        history.error='';
        mergeHolidaysIntoState(history.holidays);
      }catch(error){
        history.error=error?.message||String(error||'โหลดข้อมูลสะสมไม่สำเร็จ');
        console.warn(`${VERSION}: history`,error);
      }finally{
        history.loading=null;
        setTimeout(()=>{try{if(['scheduler','schedule'].includes(S()?.page))window.renderPage?.();}catch(_){}},0);
      }
      return history;
    })();
    return history.loading;
  }

  function earliestMonth(rows,fallback){
    const keys=(rows||[]).map(r=>normDate(r?.duty_date).slice(0,7)).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort();
    return keys[0]||fallback;
  }
  function firstMonthByStaff(rows){
    const map=new Map();
    (rows||[]).forEach(row=>{
      const id=normId(row?.staff_id),month=normDate(row?.duty_date).slice(0,7);
      if(!id||!/^\d{4}-\d{2}$/.test(month))return;
      if(!map.has(id)||month<map.get(id))map.set(id,month);
    });
    return map;
  }
  function eligibleFrom(person,field,firstMap,safe){
    const reset=resetMonth(person,field);
    if(reset)return reset;
    return firstMap.get(normId(person?.id))||safe;
  }
  function availableHistory(key,selectedAssignments){
    const safe=monthKeySafe(key),end=monthEnd(safe);
    const source=history.ready?history.assignments.filter(r=>normDate(r?.duty_date)<=end):(S()?.rosterAssignments||[]).filter(r=>normDate(r?.duty_date)<=end);
    const current=mergeSelectedMonth(source,selectedAssignments,safe);
    const trades=history.ready?history.trades:completedTrades(S()?.tradeRequests||[]);
    return{current,trades,baseline:reconstructBaseline(current,trades)};
  }
  function buildBalanceData(staffList,assignments,key){
    const safe=monthKeySafe(key),people=currentStaffList(staffList),data=availableHistory(safe,assignments);
    const globalStart=earliestMonth(data.baseline,safe),months=monthsBetween(globalStart,safe);
    const currentByMonth=new Map(),baseByMonth=new Map();
    months.forEach(month=>{
      const currentRows=data.current.filter(r=>normDate(r?.duty_date).startsWith(month)&&r?.staff_id);
      const baseRows=data.baseline.filter(r=>normDate(r?.duty_date).startsWith(month)&&r?.staff_id);
      currentByMonth.set(month,{rows:currentRows,stats:calcStats(currentRows)});
      baseByMonth.set(month,{rows:baseRows,stats:calcStats(baseRows)});
    });
    const firstMap=firstMonthByStaff(data.baseline);
    const selectedCurrent=currentByMonth.get(safe)||{rows:[],stats:{}},selectedBase=baseByMonth.get(safe)||{rows:[],stats:{}};
    const groupNames=['MT','เคิก'].filter(label=>people.some(p=>groupLabel(p)===label));
    const groupAverages=new Map();
    months.forEach(month=>{
      const pack=baseByMonth.get(month)||{rows:[],stats:{}};const values={};
      groupNames.forEach(label=>{
        const groupPeople=people.filter(p=>groupLabel(p)===label&&!isLongLeave(p));
        const dutyEligible=groupPeople.filter(p=>month===safe||month>=eligibleFrom(p,'balance_reset_at',firstMap,safe));
        const holidayEligible=groupPeople.filter(p=>month===safe||month>=eligibleFrom(p,'holiday_balance_reset_at',firstMap,safe));
        const units=dutyEligible.map(p=>Number(pack.stats[normId(p.id)]?.units||0));
        const dayValues=holidayEligible.map(p=>daysOff(p.id,month,pack.rows));
        values[label]={
          units:units.length?units.reduce((a,c)=>a+c,0)/units.length:0,
          days:dayValues.length?dayValues.reduce((a,c)=>a+c,0)/dayValues.length:0
        };
      });
      groupAverages.set(month,values);
    });
    const groups=groupNames.map(label=>{
      const groupPeople=people.filter(p=>groupLabel(p)===label),selectedAvg=groupAverages.get(safe)?.[label]||{units:0,days:0};
      const rows=groupPeople.map(person=>{
        const id=normId(person.id),currentStat=selectedCurrent.stats[id]||{},baseStat=selectedBase.stats[id]||{},excluded=isLongLeave(person);
        const dutyReset=resetMonth(person,'balance_reset_at'),holidayReset=resetMonth(person,'holiday_balance_reset_at');
        const dutyStart=eligibleFrom(person,'balance_reset_at',firstMap,safe),holidayStart=eligibleFrom(person,'holiday_balance_reset_at',firstMap,safe);
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
        return{person,excluded,current:{total:Number(currentStat.total||0),units:Number(currentStat.units||0),hours:Number(currentStat.hours||0),pay:Number(currentStat.pay||0),days:currentDays},fixed:{gap,carry,cumulative,holidayGap,holidayCarry,holidayCumulative,counts,dutyReset,holidayReset,status,tone}};
      });
      return{label,average:Number(selectedAvg.units||0),rows};
    });
    return{key:safe,groups,startKey:globalStart};
  }
  function cumulativeCell(person,value,type){
    const bg=staffColorSafe(person),fg=textColorSafe(bg);
    return `<td class="v336-staff-cumulative v336-${esc(type)}" style="--v336-staff-bg:${esc(bg)};--v336-staff-fg:${esc(fg)};background:${esc(bg)};color:${esc(fg)}" title="ยอดสะสมของ ${esc(person?.nickname||person?.full_name||'เจ้าหน้าที่')}"><b>${fmt(value)}</b></td>`;
  }
  function loadingHtml(){
    const message=history.error?`โหลดข้อมูลสะสมไม่สำเร็จ: ${history.error}`:'กำลังคำนวณเวรสะสมและวันหยุดสะสมจากทุกเดือน กรุณารอสักครู่…';
    return `<div class="notice ${history.error?'danger-notice':'soft-notice'} v336-balance-loading"><b>${esc(message)}</b></div>`;
  }
  function adminTable(data){
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v278-cumulative-dashboard v298-baseline-balance v336-continuous-balance">${data.groups.map(group=>`<section class="balance-group-section"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยเดือนนี้ ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v278-balance-table-wrap"><table class="clean-balance-table v278-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th>OT Balance ยกมา</th><th class="v336-cumulative-head">เวรสะสมเดือนนี้</th><th>วันหยุดเดือนนี้</th><th class="v336-cumulative-head">วันหยุดสะสมเดือนนี้</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th class="v279-pair-column">ดูคู่เวร</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${group.rows.map(row=>{
      const f=row.fixed,c=row.current,id=normId(row.person.id),dutyReset=f.dutyReset===data.key,holidayReset=f.holidayReset===data.key;
      return `<tr class="${row.excluded?'v278-exempt-row':''}"><td>${staffPillHtml(row.person)}</td><td>${c.total}</td><td>${c.units.toFixed(1)}</td><td>${c.hours.toFixed(1)}</td><td>${Math.round(c.pay).toLocaleString()}</td><td class="${f.gap>0.5?'v278-positive':f.gap<-0.5?'v278-negative':''}">${fmt(f.gap)}</td><td class="${f.carry>0.5?'v278-positive':f.carry<-0.5?'v278-negative':''}">${fmt(f.carry)}</td>${cumulativeCell(row.person,f.cumulative,'duty')}<td>${c.days}</td>${cumulativeCell(row.person,f.holidayCumulative,'holiday')}<td>${f.counts.chbd1}</td><td>${f.counts.chbd2}</td><td>${f.counts.chbd3}</td><td>${f.counts.ch3a}</td><td>${f.counts.ch3b}</td><td>${f.counts.ch4}</td><td>${f.counts.ch9}</td><td class="v279-pair-column"><button type="button" class="tiny-btn soft v279-pair-button" data-v279-duty-pair="${esc(id)}" data-v279-month="${esc(data.key)}">ดูคู่เวร</button></td><td>${badgeHtml(f.status,f.tone)}${f.dutyReset?`<small class="v278-reset-note">เวรเริ่ม ${esc(f.dutyReset)}</small>`:''}${f.holidayReset?`<small class="v278-reset-note">วันหยุดเริ่ม ${esc(f.holidayReset)}</small>`:''}</td><td><div class="v278-action-stack"><button type="button" class="tiny-btn ${dutyReset?'danger':'warning'}" data-v277-balance-reset="${esc(id)}" data-v277-month="${esc(data.key)}" data-v277-action="${dutyReset?'undo':'reset'}">${dutyReset?'ยกเลิกรีเซ็ตเวร':'เริ่มนับเวรใหม่เดือนนี้'}</button><button type="button" class="tiny-btn ${holidayReset?'danger':'soft'}" data-v278-holiday-reset="${esc(id)}" data-v278-month="${esc(data.key)}" data-v278-action="${holidayReset?'undo':'reset'}">${holidayReset?'ยกเลิกรีเซ็ตวันหยุด':'เริ่มนับวันหยุดใหม่เดือนนี้'}</button></div></td></tr>`;
    }).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }
  function staffTable(data){
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v265-balance-dashboard v298-baseline-balance v336-continuous-balance">${data.groups.map(group=>`<section class="balance-group-section v265-balance-group"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ย ${group.average.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v265-balance-wrap"><table class="clean-balance-table v265-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th class="v336-cumulative-head">เวรสะสมเดือนนี้</th><th class="v336-cumulative-head">วันหยุดสะสมเดือนนี้</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th></tr></thead><tbody>${group.rows.map(row=>{const f=row.fixed,c=row.current;return `<tr><td>${staffPillHtml(row.person)}</td><td>${c.total}</td><td>${c.units.toFixed(1)}</td><td>${c.hours.toFixed(1)}</td><td>${Math.round(c.pay).toLocaleString()}</td><td>${fmt(f.gap)}</td>${cumulativeCell(row.person,f.cumulative,'duty')}${cumulativeCell(row.person,f.holidayCumulative,'holiday')}<td>${f.counts.chbd1}</td><td>${f.counts.chbd2}</td><td>${f.counts.chbd3}</td><td>${f.counts.ch3a}</td><td>${f.counts.ch3b}</td><td>${f.counts.ch4}</td><td>${f.counts.ch9}</td><td>${badgeHtml(f.status,f.tone)}</td></tr>`;}).join('')}</tbody></table></div></section>`).join('')}</div>`;
  }

  const previousRender=window.renderBalanceDashboard||(typeof renderBalanceDashboard==='function'?renderBalanceDashboard:null);
  const renderV336=function renderBalanceDashboardV336(staffList,assignments,key){
    const safe=monthKeySafe(key||S()?.monthKey);
    if(!history.ready){ensureHistoryData(safe);return loadingHtml();}
    if(history.loadedThrough<monthEnd(safe)){ensureHistoryData(safe);return loadingHtml();}
    try{const data=buildBalanceData(staffList,assignments,safe);return isAdminSafe()&&S()?.page==='scheduler'?adminTable(data):staffTable(data);}catch(error){console.error(`${VERSION}: render`,error);return previousRender?previousRender.apply(this,arguments):'<div class="empty-state">คำนวณสมดุลเวรไม่สำเร็จ</div>';}
  };
  window.renderBalanceDashboard=renderV336;try{renderBalanceDashboard=renderV336;}catch(_){}

  const showFairnessV336=function(){
    const key=monthKeySafe(S()?.monthKey);let assignments=[];let staffList=[];
    try{assignments=getAssignmentsForMonth(key).filter(r=>r?.staff_id);}catch(_){assignments=(S()?.rosterAssignments||[]).filter(r=>normDate(r?.duty_date).startsWith(key)&&r?.staff_id);}
    try{staffList=scheduleStaffList();}catch(_){staffList=(S()?.staff||[]).filter(isRosterPerson);}
    if(!history.ready||history.loadedThrough<monthEnd(key)){ensureHistoryData(key);try{showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${loadingHtml()}`,{large:true});}catch(_){}return;}
    try{showModal(`<h2>ตรวจสมดุลการกระจายเวร ${esc(key)}</h2>${staffTable(buildBalanceData(staffList,assignments,key))}`,{large:true});}catch(error){console.warn(`${VERSION}: fairness modal`,error);}
  };
  window.showFairness=showFairnessV336;try{showFairness=showFairnessV336;}catch(_){}

  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-save-roster],[data-publish-roster],[data-trade-status],[data-trade-apply],[data-trade-delete]');
    if(!target)return;
    setTimeout(()=>{invalidateHistory();try{if(S()?.scheduleMobileView==='balance')window.renderPage?.();}catch(_){}},1800);
  },true);

  const style=document.createElement('style');
  style.id='v336-continuous-balance-style';
  style.textContent=`
    .v336-continuous-balance .v336-cumulative-head{background:#e0f2fe!important;color:#0c4a6e!important;font-weight:900;box-shadow:inset 0 -3px 0 #38bdf8}
    .v336-continuous-balance td.v336-staff-cumulative{background:var(--v336-staff-bg)!important;color:var(--v336-staff-fg)!important;text-align:center;font-weight:900;min-width:92px;box-shadow:inset 0 0 0 2px rgba(15,23,42,.16)}
    .v336-continuous-balance td.v336-staff-cumulative b{font-size:1.05em;text-shadow:0 1px 1px rgba(255,255,255,.2)}
    .v336-balance-loading{margin:12px 0;min-height:70px;display:flex;align-items:center;justify-content:center;text-align:center}
    @media(max-width:760px){.v336-continuous-balance td.v336-staff-cumulative{min-width:82px}}
  `;
  document.head.appendChild(style);

  window.cnmiV336ContinuousBalance={
    version:VERSION,
    invalidate:invalidateHistory,
    ensureHistory:ensureHistoryData,
    _test:{buildBalanceData,reconstructBaseline,monthsBetween,eligibleFrom,firstMonthByStaff,availableHistory,history}
  };
  console.info(`${VERSION} loaded`);
})();
