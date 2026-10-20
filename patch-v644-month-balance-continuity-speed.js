/* Staff Planner v644 — roster-planning balance continuity and render cache.
 * Previous month's displayed *planned* cumulative duty/holiday balance is the
 * following month's opening balance. Completed trades are undone only for the
 * fairness baseline; they still affect the operational columns via v338.
 * This patch does not change OT claims, payroll, or confirmed sales.
 */
(function () {
  'use strict';
  const API = window.cnmiV336ContinuousBalance;
  const mod = API && API._test;
  if (!mod || typeof mod.buildBalanceData !== 'function' || window.__CNMI_V644_BALANCE__) return;
  window.__CNMI_V644_BALANCE__ = true;

  const original = mod.buildBalanceData;
  const cache = new Map();
  const MAX_CACHE = 5;
  let computations = 0;
  const norm = x => String(x == null ? '' : x);
  const date = v => {
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  };
  const monthOf = r => date(r?.duty_date).slice(0, 7);
  const monthEnd = key => `${key}-${String(new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate()).padStart(2,'0')}`;
  const prevMonth = key => { const d = new Date(+key.slice(0,4), +key.slice(5,7)-2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const fmtNum = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const resetAt = (person, field) => norm(person?.[field] || '').slice(0,7);
  const isLong = person => { try { return !!isLongTermLeaveStaff(person); } catch (_) { return !!person?.is_long_term_leave || !!person?.maternity_status; } };
  const groupOf = p => norm(p?.staff_type).trim() === 'เคิก' ? 'เคิก' : 'MT';
  const offDays = (id, key, rows) => { try { return fmtNum(calculateDaysOff(id,key,rows)); } catch (_) { return 0; } };
  const fairStats = rows => { try { return calcFairness(rows.filter(r => r?.staff_id)) || {}; } catch (_) { return {}; } };
  const uniqueCurrent = (historyRows, visibleRows, key) => {
    const result = (historyRows || []).filter(r => monthOf(r) !== key);
    const picked = Array.isArray(visibleRows) && visibleRows.some(r => monthOf(r) === key) ? visibleRows : (historyRows || []).filter(r => monthOf(r) === key);
    // Do not erase the current month's DB rows if its lazy page state has not loaded.
    return result.concat(picked.filter(r => r?.staff_id && monthOf(r) === key));
  };
  const staffKey = people => people.map(p => [p.id,p.staff_type,p.is_active,p.roster_enabled,p.balance_reset_at,p.holiday_balance_reset_at,p.is_long_term_leave,p.maternity_status].join('/')).join(';');
  const currentKey = (rows, key) => (rows || []).filter(r => monthOf(r) === key)
    .map(r => [r.id,r.staff_id,r.duty_code,date(r.duty_date)].join('/')).sort().join(';');
  const signature = (people, rows, key, history) => [key,history.loadedThrough,history.assignments?.length,history.trades?.length,
    history.assignments?.[0]?.id,history.assignments?.at(-1)?.id,
    staffKey(people),currentKey(rows,key),history.trades?.at(-1)?.updated_at].join('|');

  function calculateLedger(people, assignments, key, history) {
    const full = uniqueCurrent((history.assignments || []).filter(r => monthOf(r) <= key), assignments, key);
    const baseline = mod.reconstructBaseline(full, history.trades || []);
    const byMonth = new Map();
    const firstAssigned = new Map();
    baseline.forEach(row => {
      const month = monthOf(row), id = norm(row.staff_id);
      if (!id || !/^\d{4}-\d{2}$/.test(month) || month > key) return;
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(row);
      if (!firstAssigned.has(id) || firstAssigned.get(id) > month) firstAssigned.set(id,month);
    });
    // One stable monthly calculation irrespective of which month the UI is showing.
    // Never use a selected-month-only exception in the historical average.
    // Include months without any assignments: those still contribute actual days off.
    const sortedMonths=[];
    let start=[...byMonth.keys()].sort()[0] || key;
    for (let guard=0; start<=key && guard<240; guard++) {
      sortedMonths.push(start);
      const d=new Date(+start.slice(0,4),+start.slice(5,7),1);
      start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }
    const detail = new Map();
    for (const month of sortedMonths) {
      const rows = byMonth.get(month) || [], stat = fairStats(rows);
      const days = new Map(), average = {};
      for (const p of people) days.set(norm(p.id),offDays(p.id,month,rows));
      for (const label of ['MT','เคิก']) {
        const eligible = people.filter(p => groupOf(p) === label && !isLong(p) &&
          // Membership depends on first scheduled month, NEVER on the currently viewed month
          // or on a reset scheduled in the future.
          firstAssigned.has(norm(p.id)) && firstAssigned.get(norm(p.id)) <= month);
        const n = eligible.length;
        average[label] = {
          units:n ? eligible.reduce((acc,p) => acc+fmtNum(stat[norm(p.id)]?.units),0)/n : 0,
          days:n ? eligible.reduce((acc,p) => acc+fmtNum(days.get(norm(p.id))),0)/n : 0
        };
      }
      detail.set(month,{stat,days,average});
    }
    const fixed = new Map();
    for (const person of people) {
      const id = norm(person.id), label = groupOf(person),
        first = firstAssigned.get(id) || key, dutyReset = resetAt(person,'balance_reset_at'),
        holidayReset = resetAt(person,'holiday_balance_reset_at'),
        dutyStart = dutyReset && dutyReset > first ? dutyReset : first,
        holidayStart = holidayReset && holidayReset > first ? holidayReset : first;
      let dutyBalance=0,holidayBalance=0,carry=0,holidayCarry=0, gap=0,holidayGap=0;
      for (const month of sortedMonths) {
        if (month > key) break;
        const d=detail.get(month),avg=d.average[label] || {units:0,days:0};
        const eligibleMonth = month >= first && !isLong(person);
        const dutyDelta = eligibleMonth ? fmtNum(d.stat[id]?.units)-avg.units : 0;
        const holidayDelta = eligibleMonth ? fmtNum(d.days.get(id))-avg.days : 0;
        if (month === dutyStart) dutyBalance = 0; // explicit Admin reset
        if (month === holidayStart) holidayBalance = 0;
        if (month === key) {
          carry = month >= dutyStart ? dutyBalance : 0;
          holidayCarry = month >= holidayStart ? holidayBalance : 0;
          gap = month >= dutyStart ? dutyDelta : 0;
          holidayGap = month >= holidayStart ? holidayDelta : 0;
        }
        if (month >= dutyStart) dutyBalance += dutyDelta;
        if (month >= holidayStart) holidayBalance += holidayDelta;
      }
      fixed.set(id,{carry,holidayCarry,gap,holidayGap,cumulative:carry+gap,holidayCumulative:holidayCarry+holidayGap});
    }
    return {fixed,detail,baseline,full};
  }

  function correctedBalance(staffList, assignments, key) {
    const history=mod.history;
    if (!history?.ready || history.loadedThrough < monthEnd(key)) return original.apply(this,arguments);
    let list=Array.isArray(staffList) && staffList.length ? staffList : [];
    if(!list.length) {
      try { list=state?.staff||window.state?.staff||[]; } catch(_) { list=window.state?.staff||[]; }
    }
    const stamp=signature(list,assignments,key,history);
    if (cache.has(stamp)) return cache.get(stamp);
    let data;
    try {
      // Construct the rows in one pass rather than running the old all-month
      // calculation first and then redoing the same historical work.
      const people=list.filter(p => p && norm(p.staff_type).trim() !== 'แพทย์');
      const ledger=calculateLedger(people,assignments,key,history);
      const now=ledger.detail.get(key) || {stat:{},days:new Map(),average:{}};
      const currentRows=ledger.full.filter(r => monthOf(r) === key);
      const actual=fairStats(currentRows);
      const plannedRows=ledger.baseline.filter(r => monthOf(r) === key);
      const groups=['MT','เคิก'].filter(label => people.some(p => groupOf(p) === label)).map(label => {
        const avg=now.average[label] || {units:0,days:0};
        const rows=people.filter(p => groupOf(p) === label).map(person => {
          const id=norm(person.id), excluded=isLong(person),
            f=ledger.fixed.get(id) || {carry:0,holidayCarry:0,gap:0,holidayGap:0,cumulative:0,holidayCumulative:0},
            c=actual[id] || {},
            own=plannedRows.filter(r => norm(r.staff_id) === id),
            count=fn => own.filter(fn).length,
            dutyReset=resetAt(person,'balance_reset_at'),
            holidayReset=resetAt(person,'holiday_balance_reset_at');
          let status='สมดุลสะสม',tone='green';
          if(excluded){status='ลาระยะยาว / ไม่คิดหนี้เวร';tone='black';}
          else if(dutyReset===key && Math.abs(f.cumulative)<=0.5){status='เริ่มนับเวรใหม่เดือนนี้';tone='blue';}
          else if(f.cumulative>0.5){status='เวรสะสมมากกว่าเฉลี่ย';tone='orange';}
          else if(f.cumulative< -0.5){status='เวรสะสมน้อยกว่าเฉลี่ย';tone='blue';}
          return {person,excluded,
            current:{total:fmtNum(c.total),units:fmtNum(c.units),hours:fmtNum(c.hours),pay:fmtNum(c.pay),days:excluded?0:offDays(id,key,currentRows)},
            fixed:{...f,dutyReset,holidayReset,status,tone,counts:{total:own.length,
              chbd1:count(r=>r.duty_code==='ชบด1'),chbd2:count(r=>r.duty_code==='ชบด2'),
              chbd3:count(r=>r.duty_code==='ชบด3'),ch3a:count(r=>r.duty_code==='ช3A'),
              ch3b:count(r=>r.duty_code==='ช3B'),ch4:count(r=>norm(r.duty_code).startsWith('ช4')),
              ch9:count(r=>norm(r.duty_code).startsWith('ช9'))}}
          };
        });
        return {label,average:avg.units,rows};
      });
      data={key,groups,startKey:[...ledger.detail.keys()][0]||key};
      computations++;
    } catch(error) {
      console.warn('[v644] Cannot build planned cumulative ledger; showing original calculation', error);
      return original.apply(this,arguments);
    }
    cache.set(stamp,data);
    if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
    return data;
  }
  mod.buildBalanceData=correctedBalance;
  const oldInvalidate=API.invalidate?.bind(API);
  if (oldInvalidate) API.invalidate=function(...args){cache.clear();return oldInvalidate(...args);};
  const oldEnsure=API.ensureHistory?.bind(API);
  if (oldEnsure) API.ensureHistory=function(key,...args){
    if(!mod.history.ready || (key && mod.history.loadedThrough < monthEnd(key))) cache.clear();
    return oldEnsure(key,...args);
  };
  window.cnmiV644Balance={version:'v644',clear:()=>cache.clear(),_test:{calculateLedger,prevMonth,getBuildCount:()=>computations}};
  console.info('[v644] Planned duty/holiday month continuity and memoized balance rendering enabled');
})();
