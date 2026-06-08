/*
  Patch v80: Robust selected-month loader (rolling future cap)
  Purpose:
  - Load the month currently opened in Calendar / scheduler pages from Supabase directly.
  - Keep the future rule: today -> today + 1 year.
  - Does not change database schema, login, reset password, drag-drop, duty rules, or imported rows.
  Notes:
  - Past months are allowed to load for history review.
  - Future months after today + 1 year are not fetched.
*/
(function () {
  const PATCH = 'v80-robust-selected-month-loader';
  const loadedRanges = new Set();
  const loadingRanges = new Set();

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseYmd(s) {
    const [y, m, d] = String(s || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function addOneYear(date) {
    const d = new Date(date.getFullYear() + 1, date.getMonth(), date.getDate());
    if (d.getMonth() !== date.getMonth()) return new Date(date.getFullYear() + 1, date.getMonth() + 1, 0);
    return d;
  }
  function minYmd(a, b) {
    const da = parseYmd(a); const db = parseYmd(b);
    if (!da || !db) return a || b;
    return da <= db ? a : b;
  }
  function monthKeyFromDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  function parseMonthKey(key) {
    const [y, m] = String(key || '').split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return null;

    const monthStart = ymd(new Date(y, m - 1, 1));
    const monthEnd = ymd(new Date(y, m, 0));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureEnd = addOneYear(today);
    futureEnd.setHours(0, 0, 0, 0);
    const futureEndYmd = ymd(futureEnd);

    // Only block months that start after the rolling future cap.
    // Past months are still allowed for reviewing imported history.
    if (monthStart > futureEndYmd) {
      return {
        key: `${y}-${pad(m)}`,
        y,
        m,
        start: null,
        end: null,
        outsideFutureCap: true,
        futureEnd: futureEndYmd
      };
    }

    return {
      key: `${y}-${pad(m)}`,
      y,
      m,
      start: monthStart,
      end: minYmd(monthEnd, futureEndYmd),
      outsideFutureCap: false,
      futureEnd: futureEndYmd
    };
  }

  function getState() {
    try { if (typeof state !== 'undefined') return state; } catch (_) {}
    return window.state || null;
  }
  function getClient() {
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (_) {}
    return window.sb || null;
  }
  function uniqueKey(row, fallbackFields) {
    if (row && row.id) return `id:${row.id}`;
    return 'row:' + fallbackFields.map(k => String(row?.[k] ?? '')).join('|');
  }
  function mergeRows(existing, extra, sortKey, ascending = true, fallbackFields = []) {
    const map = new Map();
    (existing || []).forEach(row => { if (row) map.set(uniqueKey(row, fallbackFields), row); });
    (extra || []).forEach(row => { if (row) map.set(uniqueKey(row, fallbackFields), row); });
    const rows = Array.from(map.values());
    if (sortKey) {
      rows.sort((a, b) => {
        const av = String(a?.[sortKey] || '');
        const bv = String(b?.[sortKey] || '');
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return rows;
  }
  function currentCalendarMonthKey() {
    const st = getState();
    const d = st?.calendarDate instanceof Date ? st.calendarDate : new Date(st?.calendarDate || new Date());
    return monthKeyFromDate(d);
  }
  function visibleMonthKeys() {
    const st = getState();
    const keys = new Set();
    if (st?.calendarDate) keys.add(currentCalendarMonthKey());
    if (st?.monthKey) keys.add(st.monthKey);
    if (st?.positionMonthKey) keys.add(st.positionMonthKey);
    if (st?.positionMonthViewKey) keys.add(st.positionMonthViewKey);
    return Array.from(keys).filter(Boolean);
  }
  function renderAgain(tag) {
    try {
      if (typeof renderPage === 'function') {
        renderPage();
        console.info(`[${PATCH}] rendered after loading`, tag);
      }
    } catch (err) {
      console.warn(`[${PATCH}] render failed`, err?.message || err);
    }
  }

  async function loadMonth(monthKey, reason = '') {
    const parsed = parseMonthKey(monthKey);
    const st = getState();
    const client = getClient();
    if (!parsed || !st || !client || !st.profile) return { ok: false, reason: 'not-ready' };

    if (parsed.outsideFutureCap) {
      console.info(`[${PATCH}] skipped month outside future cap`, {
        month: parsed.key,
        futureEnd: parsed.futureEnd,
        reason
      });
      return { ok: false, reason: 'outside-future-cap', parsed };
    }

    const rangeKey = `${parsed.key}:${parsed.start}:${parsed.end}`;
    if (loadedRanges.has(rangeKey)) return { ok: true, reason: 'already-loaded', parsed };
    if (loadingRanges.has(rangeKey)) return { ok: false, reason: 'already-loading', parsed };

    loadingRanges.add(rangeKey);
    try {
      const [
        leaves,
        activities,
        rosterMonths,
        rosterAssignments,
        positions,
        attendance,
        otRequests,
        holidays,
        incharges,
        positionDayStatus
      ] = await Promise.all([
        client.from('leave_requests').select('*')
          .gte('end_date', parsed.start)
          .lte('start_date', parsed.end)
          .order('start_date', { ascending: false }),
        client.from('activity_events').select('*')
          .gte('end_date', parsed.start)
          .lte('start_date', parsed.end)
          .order('start_date', { ascending: true }),
        client.from('roster_months').select('*')
          .eq('year', parsed.y)
          .eq('month', parsed.m),
        client.from('roster_assignments').select('*')
          .gte('duty_date', parsed.start)
          .lte('duty_date', parsed.end)
          .order('duty_date', { ascending: true }),
        client.from('daily_positions').select('*')
          .gte('work_date', parsed.start)
          .lte('work_date', parsed.end)
          .order('work_date', { ascending: true }),
        client.from('attendance_logs').select('*')
          .gte('duty_date', parsed.start)
          .lte('duty_date', parsed.end)
          .order('duty_date', { ascending: false }),
        client.from('ot_requests').select('*')
          .gte('work_date', parsed.start)
          .lte('work_date', parsed.end)
          .order('work_date', { ascending: false }),
        client.from('public_holidays').select('*')
          .gte('holiday_date', parsed.start)
          .lte('holiday_date', parsed.end)
          .order('holiday_date', { ascending: true }),
        client.from('monthly_incharges').select('*')
          .eq('month_key', parsed.key),
        client.from('daily_position_day_status').select('*')
          .gte('work_date', parsed.start)
          .lte('work_date', parsed.end)
          .order('work_date', { ascending: true })
      ]);

      const packs = { leaves, activities, rosterMonths, rosterAssignments, positions, attendance, otRequests, holidays, incharges, positionDayStatus };
      Object.entries(packs).forEach(([name, result]) => {
        if (result.error) throw new Error(`${name}: ${result.error.message}`);
      });

      st.leaves = mergeRows(st.leaves, leaves.data || [], 'start_date', false, ['staff_id','type','start_date','end_date']);
      st.activities = mergeRows(st.activities, activities.data || [], 'start_date', true, ['title','event_type','start_date','end_date']);
      st.rosterMonths = mergeRows(st.rosterMonths, rosterMonths.data || [], 'year', false, ['year','month']);
      st.rosterAssignments = mergeRows(st.rosterAssignments, rosterAssignments.data || [], 'duty_date', true, ['staff_id','duty_code','duty_date']);
      st.positions = mergeRows(st.positions, positions.data || [], 'work_date', true, ['staff_id','position_code','work_date']);
      st.attendance = mergeRows(st.attendance, attendance.data || [], 'duty_date', false, ['staff_id','duty_date']);
      st.otRequests = mergeRows(st.otRequests, otRequests.data || [], 'work_date', false, ['staff_id','work_date']);
      st.holidays = mergeRows(st.holidays, holidays.data || [], 'holiday_date', true, ['holiday_date','title']);
      st.incharges = mergeRows(st.incharges, incharges.data || [], 'month_key', false, ['month_key','staff_id']);
      st.positionDayStatus = mergeRows(st.positionDayStatus, positionDayStatus.data || [], 'work_date', true, ['work_date','status']);

      loadedRanges.add(rangeKey);
      const summary = {
        month: parsed.key,
        start: parsed.start,
        end: parsed.end,
        reason,
        leaves: (leaves.data || []).length,
        activities: (activities.data || []).length,
        rosterAssignments: (rosterAssignments.data || []).length,
        positions: (positions.data || []).length,
        holidays: (holidays.data || []).length
      };
      console.info(`[${PATCH}] loaded selected month`, summary);
      return { ok: true, parsed, summary };
    } catch (err) {
      console.warn(`[${PATCH}] month load failed`, parsed.key, err?.message || err);
      return { ok: false, reason: 'error', error: err, parsed };
    } finally {
      loadingRanges.delete(rangeKey);
    }
  }

  async function loadVisibleMonths(reason = '') {
    const keys = visibleMonthKeys();
    const results = [];
    for (const key of keys) {
      results.push(await loadMonth(key, reason));
    }
    const anyLoaded = results.some(r => r?.ok && r?.reason !== 'already-loaded');
    if (anyLoaded) renderAgain(reason || 'visible-months');
    return results;
  }

  // Wrap calendar navigation directly, because the app renders immediately after navigation.
  try {
    if (typeof calendarNav === 'function') {
      const oldCalendarNav = calendarNav;
      window.calendarNav = calendarNav = function calendarNavV80(action) {
        const result = oldCalendarNav.apply(this, arguments);
        setTimeout(() => loadVisibleMonths(`calendarNav:${action}`), 50);
        return result;
      };
    }
  } catch (err) {
    console.warn(`[${PATCH}] calendarNav wrap failed`, err?.message || err);
  }

  // Wrap renderCalendar as a backup.
  try {
    if (typeof renderCalendar === 'function') {
      const oldRenderCalendar = renderCalendar;
      window.renderCalendar = renderCalendar = function renderCalendarV80() {
        setTimeout(() => loadMonth(currentCalendarMonthKey(), 'renderCalendar').then(r => {
          if (r?.ok && r?.reason !== 'already-loaded') renderAgain('renderCalendar');
        }), 0);
        return oldRenderCalendar.apply(this, arguments);
      };
    }
  } catch (err) {
    console.warn(`[${PATCH}] renderCalendar wrap failed`, err?.message || err);
  }

  // Wrap reload so the current month is loaded after a manual refresh.
  try {
    if (typeof loadAllData === 'function') {
      const oldLoadAllData = loadAllData;
      window.loadAllData = loadAllData = async function loadAllDataV80() {
        await oldLoadAllData.apply(this, arguments);
        await loadVisibleMonths('after-loadAllData');
      };
    }
  } catch (err) {
    console.warn(`[${PATCH}] loadAllData wrap failed`, err?.message || err);
  }

  // Capture button clicks as another backup. This helps when other patches re-wrap render/calendar functions.
  document.addEventListener('click', function (e) {
    const target = e.target && e.target.closest && e.target.closest('[data-cal-nav], [data-cal-view], [data-page]');
    if (!target) return;
    setTimeout(() => loadVisibleMonths('click-backup'), 120);
  }, true);

  // Initial and periodic warm-up for the active page.
  setTimeout(() => loadVisibleMonths('initial'), 800);
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    const st = getState();
    if (st?.profile && ['calendar','scheduler','schedule','positionMonth','positionMonthView'].includes(st.page)) {
      loadVisibleMonths(`timer-${ticks}`);
    }
    if (ticks >= 30) clearInterval(timer);
  }, 2000);

  window.cnmiLoadMonthV80 = async function (monthKey) {
    const result = await loadMonth(monthKey, 'manual');
    if (result?.ok) renderAgain(`manual:${monthKey}`);
    return result;
  };
  window.cnmiV80Status = function () {
    const st = getState();
    return {
      patch: PATCH,
      page: st?.page,
      calendarMonth: currentCalendarMonthKey(),
      visibleMonths: visibleMonthKeys(),
      leaves: st?.leaves?.length || 0,
      activities: st?.activities?.length || 0,
      loadedRanges: Array.from(loadedRanges)
    };
  };

  console.info(`[${PATCH}] installed. Manual test: cnmiLoadMonthV80('2027-02') or cnmiV80Status()`);
})();
