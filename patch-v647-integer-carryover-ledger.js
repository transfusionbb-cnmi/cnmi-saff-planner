/* Staff Planner v647 — whole-number roster fairness balances.
 * Maintain precise historical arithmetic; quantize cumulative and opening
 * balances at the reporting boundary, deriving the displayed monthly gap
 * as the difference. This avoids month-by-month rounding drift.
 * Does not change duty counts, fractional duty units, OT/payroll or trade data.
 */
(function () {
  'use strict';
  const api = window.cnmiV336ContinuousBalance;
  const mod = api && api._test;
  if (!mod || typeof mod.buildBalanceData !== 'function' || window.__CNMI_V647_INTEGER_BALANCE__) return;
  window.__CNMI_V647_INTEGER_BALANCE__ = true;
  const previous = mod.buildBalanceData;
  // Round positive and negative amounts symmetrically; -0.5 must become -1.
  function whole(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const result = Math.sign(number) * Math.floor(Math.abs(number) + 0.5 + 1e-9);
    return result || 0;
  }
  function integerFixed(f) {
    const carry = whole(f.carry), cumulative = whole(f.cumulative);
    const holidayCarry = whole(f.holidayCarry), holidayCumulative = whole(f.holidayCumulative);
    let status = f.status, tone = f.tone;
    if (!/ลาระยะยาว/.test(String(status || ''))) {
      if (/เริ่มนับเวรใหม่/.test(String(status || '')) && cumulative === 0) {
        status = 'เริ่มนับเวรใหม่เดือนนี้'; tone = 'blue';
      } else if (cumulative > 0) {
        status = 'เวรสะสมมากกว่าเฉลี่ย'; tone = 'orange';
      } else if (cumulative < 0) {
        status = 'เวรสะสมน้อยกว่าเฉลี่ย'; tone = 'blue';
      } else {
        status = 'สมดุลสะสม'; tone = 'green';
      }
    }
    return {
      ...f, status, tone,
      carry, cumulative, gap: cumulative - carry,
      holidayCarry, holidayCumulative, holidayGap: holidayCumulative - holidayCarry
    };
  }
  function integerBalance(staffList, assignments, key) {
    const data = previous.apply(this, arguments);
    // V644 caches the original data. NEVER mutate its raw floats or we lose
    // the precise month-to-month continuity when navigating between months.
    if (!data || !Array.isArray(data.groups)) return data;
    return {
      ...data,
      groups: data.groups.map(group => ({
        ...group,
        rows: (group.rows || []).map(row => ({...row, fixed: integerFixed(row.fixed || {})}))
      }))
    };
  }
  mod.buildBalanceData = integerBalance;
  window.cnmiV647IntegerBalance = {
    version: 'v647', whole,
    _test: {integerFixed, integerBalance}
  };
  console.info('[v647] Whole-number carryovers and cumulative balances enabled');
})();
