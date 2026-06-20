/* =========================================================
   V256 Selected Month Data Loader
   - Fixes future/past month pages that were rendered from the
     fixed "today -2 months / +3 months" data window only.
   - Loads and merges the month currently selected by Admin.
   - Keeps holidays visible after save/reload and also keeps the
     roster, leave/activity context, positions and incharge data
     available for that selected month.
   ========================================================= */
(function(){
  'use strict';

  const VERSION_V256 = 'V256_SELECTED_MONTH_DATA_LOADER';
  const MONTH_INPUT_IDS_V256 = new Set([
    'rosterMonthInput',
    'scheduleMonthInput',
    'positionMonthInput',
    'positionMonthViewInput'
  ]);

  function validMonth256(value){
    const key = String(value || '').trim().slice(0, 7);
    return /^\d{4}-\d{2}$/.test(key) ? key : '';
  }

  function monthRange256(value){
    const key = validMonth256(value);
    if (!key) return null;
    const [year, month] = key.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return { key, start:`${key}-01`, end:`${key}-${String(lastDay).padStart(2, '0')}` };
  }

  function dateKey256(row, field){
    const raw = row?.[field];
    if (!raw) return '';
    return String(raw).slice(0, 10);
  }

  function mergeDateRows256(current, fresh, field, start, end){
    const kept = (Array.isArray(current) ? current : []).filter(row => {
      const date = dateKey256(row, field);
      return !date || date < start || date > end;
    });
    return kept.concat(Array.isArray(fresh) ? fresh : []);
  }


  function mergeOverlapRows256(current, fresh, startField, endField, start, end){
    const kept = (Array.isArray(current) ? current : []).filter(row => {
      const rowStart = String(row?.[startField] || '').slice(0, 10);
      const rowEnd = String(row?.[endField] || row?.[startField] || '').slice(0, 10);
      if (!rowStart) return true;
      return rowEnd < start || rowStart > end;
    });
    return kept.concat(Array.isArray(fresh) ? fresh : []);
  }

  function mergeMonthRows256(current, fresh, field, monthKey){
    const kept = (Array.isArray(current) ? current : []).filter(row => String(row?.[field] || '').slice(0, 7) !== monthKey);
    return kept.concat(Array.isArray(fresh) ? fresh : []);
  }

  function selectedMonthKeys256(){
    const values = [
      state?.monthKey,
      state?.positionMonthKey,
      state?.positionMonthViewKey
    ];
    return [...new Set(values.map(validMonth256).filter(Boolean))];
  }

  async function loadSelectedMonthData256(monthValue, options={}){
    const range = monthRange256(monthValue);
    if (!range || typeof sb === 'undefined' || !sb || typeof state === 'undefined' || !state?.profile) return false;

    const { key, start, end } = range;
    const queries = {
      holidays: sb.from('public_holidays').select('*').gte('holiday_date', start).lte('holiday_date', end).order('holiday_date'),
      assignments: sb.from('roster_assignments').select('*').gte('duty_date', start).lte('duty_date', end).order('duty_date'),
      leaves: sb.from('leave_requests').select('*').gte('end_date', start).lte('start_date', end).order('start_date', { ascending:false }),
      activities: sb.from('activity_events').select('*').gte('end_date', start).lte('start_date', end).order('start_date'),
      positions: sb.from('daily_positions').select('*').gte('work_date', start).lte('work_date', end).order('work_date'),
      positionDayStatus: sb.from('daily_position_day_status').select('*').gte('work_date', start).lte('work_date', end).order('work_date'),
      incharges: sb.from('monthly_incharges').select('*').eq('month_key', key)
    };

    const entries = Object.entries(queries);
    const results = await Promise.all(entries.map(([,promise]) => promise));
    const data = {};
    const errors = [];

    results.forEach((result, index) => {
      const name = entries[index][0];
      if (result?.error) errors.push(`${name}: ${result.error.message || result.error}`);
      else data[name] = result?.data || [];
    });

    if (errors.length) {
      console.warn(`[${VERSION_V256}] selected month partial load`, errors);
      if (!options.silent) {
        try { showToast(`โหลดข้อมูลเดือน ${key} ได้ไม่ครบ: ${errors[0]}`, { tone:'error' }); } catch (_) {}
      }
    }

    if (data.holidays) state.holidays = mergeDateRows256(state.holidays, data.holidays, 'holiday_date', start, end).sort((a,b) => String(a.holiday_date || '').localeCompare(String(b.holiday_date || '')));
    if (data.assignments) state.rosterAssignments = mergeDateRows256(state.rosterAssignments, data.assignments, 'duty_date', start, end).sort((a,b) => String(a.duty_date || '').localeCompare(String(b.duty_date || '')));
    if (data.leaves) state.leaves = mergeOverlapRows256(state.leaves, data.leaves, 'start_date', 'end_date', start, end).sort((a,b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
    if (data.activities) state.activities = mergeOverlapRows256(state.activities, data.activities, 'start_date', 'end_date', start, end).sort((a,b) => String(a.start_date || '').localeCompare(String(b.start_date || '')));
    if (data.positions) state.positions = mergeDateRows256(state.positions, data.positions, 'work_date', start, end).sort((a,b) => String(a.work_date || '').localeCompare(String(b.work_date || '')));
    if (data.positionDayStatus) state.positionDayStatus = mergeDateRows256(state.positionDayStatus, data.positionDayStatus, 'work_date', start, end).sort((a,b) => String(a.work_date || '').localeCompare(String(b.work_date || '')));
    if (data.incharges) state.incharges = mergeMonthRows256(state.incharges, data.incharges, 'month_key', key).sort((a,b) => String(b.month_key || '').localeCompare(String(a.month_key || '')));

    return !errors.length;
  }

  async function loadAllSelectedMonths256(options={}){
    const keys = selectedMonthKeys256();
    for (const key of keys) await loadSelectedMonthData256(key, options);
  }

  const originalLoadAllData256 = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
  if (originalLoadAllData256) {
    const patchedLoadAllData256 = async function(){
      const result = await originalLoadAllData256.apply(this, arguments);
      await loadAllSelectedMonths256({ silent:true });
      return result;
    };
    window.loadAllData = patchedLoadAllData256;
    try { loadAllData = patchedLoadAllData256; } catch (_) {}
  }

  document.addEventListener('change', function(e){
    const input = e.target;
    if (!input || !MONTH_INPUT_IDS_V256.has(input.id)) return;
    const key = validMonth256(input.value);
    if (!key) return;

    // Legacy change handler updates state/render first. Then fetch the
    // selected month and render again with the real holiday/data context.
    setTimeout(async function(){
      try {
        await loadSelectedMonthData256(key);
        if (typeof renderPage === 'function') renderPage();
      } catch (err) {
        console.error(`[${VERSION_V256}] month change load failed`, err);
        try { showToast(`โหลดข้อมูลเดือน ${key} ไม่สำเร็จ: ${err?.message || err}`, { tone:'error' }); } catch (_) {}
      }
    }, 0);
  });

  window.loadSelectedMonthDataV256 = loadSelectedMonthData256;
  console.info(`[${VERSION_V256}] loaded`);
})();
