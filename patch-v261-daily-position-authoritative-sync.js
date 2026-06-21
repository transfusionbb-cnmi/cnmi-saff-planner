/* =========================
   V261 Daily Position Authoritative Sync
   - A daily save writes the visible "ปรับวันนี้" selections to Supabase.
   - Desktop/mobile duplicate selects are synchronized before saving.
   - Publishing also saves the current selections first.
   - The same date is replaced in state.positions and stale monthly drafts are cleared.
   - Monthly position pages refresh the selected month from Supabase when opened.
   ========================= */
(function(){
  'use strict';

  const VERSION = 'V261_DAILY_POSITION_AUTHORITATIVE_SYNC';
  if (window.__CNMI_V261_DAILY_POSITION_AUTHORITATIVE_SYNC__) return;
  window.__CNMI_V261_DAILY_POSITION_AUTHORITATIVE_SYNC__ = true;

  const monthRefreshAt = new Map();
  const monthRefreshInFlight = new Map();
  let dailySaveInFlight = false;

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function normDate(value){
    try { return normalizeDateKey(value); }
    catch (_) { return String(value || '').slice(0, 10); }
  }
  function currentStaff(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function canManage(date){
    try { return !!canManagePositions(date); }
    catch (_) {
      try { return !!isAdmin(); }
      catch (__) { return appState()?.profile?.role === 'admin'; }
    }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function busy(active, message){
    try { setBusy(!!active, message || ''); } catch (_) {}
  }
  function assignGlobalFunction(name, fn){
    try { window[name] = fn; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function visibleControl(el){
    if (!el || el.disabled) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const parent = el.closest('[hidden], .hidden');
      if (parent) return false;
      return el.getClientRects().length > 0;
    } catch (_) { return true; }
  }
  function rowIdentity(sel){
    return [
      String(sel?.dataset?.positionCode || '').trim(),
      String(sel?.dataset?.positionZone || '').trim(),
      String(sel?.dataset?.positionBreak || '').trim(),
      String(sel?.dataset?.positionRule || '').trim(),
      String(sel?.dataset?.positionJob || '').trim()
    ].join('|');
  }
  function syncDuplicateSelects(source){
    if (!source?.matches?.('[data-position-row]')) return;
    const identity = rowIdentity(source);
    document.querySelectorAll('[data-position-row]').forEach(other => {
      if (other !== source && rowIdentity(other) === identity && other.value !== source.value) other.value = source.value;
    });
    source.dataset.v261ChangedAt = String(Date.now());
  }

  document.addEventListener('change', function(event){
    const select = event.target?.closest?.('[data-position-row]');
    if (select) syncDuplicateSelects(select);
  }, true);

  function chosenSelect(group){
    const list = Array.from(group || []);
    if (!list.length) return null;
    const active = list.find(el => el === document.activeElement);
    if (active) return active;
    const changed = list.slice().sort((a,b) => Number(b.dataset.v261ChangedAt || 0) - Number(a.dataset.v261ChangedAt || 0))[0];
    if (changed && Number(changed.dataset.v261ChangedAt || 0) > 0) return changed;
    return list.find(visibleControl) || list[0];
  }
  function collectDailyRows(date){
    const controls = Array.from(document.querySelectorAll('[data-position-row]'));
    const groups = new Map();
    controls.forEach(select => {
      const identity = rowIdentity(select) || `row:${select.dataset.positionRow || groups.size}`;
      if (!groups.has(identity)) groups.set(identity, []);
      groups.get(identity).push(select);
    });

    const rows = [];
    groups.forEach(group => {
      const select = chosenSelect(group);
      if (!select) return;
      const code = String(select.dataset.positionCode || '').trim();
      if (!code) return;
      let base = {};
      try { base = positionTemplateByCode(code, date) || {}; } catch (_) {}
      rows.push({
        work_date: date,
        position_code: code,
        zone: select.dataset.positionZone || base.zone || 'รอตรวจสอบ',
        break_time: select.dataset.positionBreak || base.break_time || '-',
        main_rule: select.dataset.positionRule || base.main_rule || '',
        job_desc: select.dataset.positionJob || base.job_desc || '',
        staff_id: select.value || null,
        updated_by: currentStaff()
      });
    });

    // Keep exactly one row per displayed Slot identity.
    const deduped = [];
    const seen = new Set();
    rows.forEach(row => {
      const key = [row.position_code, row.zone, row.break_time, row.main_rule, row.job_desc].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    try { return sortPositionRows(deduped); }
    catch (_) { return deduped; }
  }

  function replaceDateInState(date, rows, statusRow){
    const st = appState();
    if (!st) return;
    const d = normDate(date);
    const month = d.slice(0, 7);
    st.positions = (Array.isArray(st.positions) ? st.positions : [])
      .filter(row => normDate(row?.work_date) !== d)
      .concat(Array.isArray(rows) ? rows : []);
    st.positionDayStatus = (Array.isArray(st.positionDayStatus) ? st.positionDayStatus : [])
      .filter(row => normDate(row?.work_date) !== d)
      .concat(statusRow ? [statusRow] : []);

    // A monthly draft made before the daily edit is stale by definition.
    if (st.monthPositionDraft?.monthKey === month) st.monthPositionDraft = null;
    st.__v261LastDailySync = { date:d, at:new Date().toISOString(), rows:(rows || []).length };
  }

  async function fetchDateFromDatabase(date){
    const d = normDate(date);
    const [positionResult, statusResult] = await Promise.all([
      sb.from('daily_positions').select('*').eq('work_date', d).order('position_code'),
      sb.from('daily_position_day_status').select('*').eq('work_date', d).maybeSingle()
    ]);
    if (positionResult.error) throw positionResult.error;
    if (statusResult.error) throw statusResult.error;
    return { rows:positionResult.data || [], status:statusResult.data || null };
  }

  async function saveDailyAuthoritative(options={}){
    const st = appState();
    const date = normDate(document.getElementById('positionDateInput')?.value || st?.positionDate || (typeof todayStr === 'function' ? todayStr() : ''));
    if (!date) return false;
    if (!canManage(date)) {
      toast('เฉพาะ Admin หรืออินชาร์จประจำเดือนนี้เท่านั้น', 'error');
      return false;
    }
    if (dailySaveInFlight) {
      toast('ระบบกำลังบันทึกตำแหน่งวันนี้ กรุณารอสักครู่');
      return false;
    }

    const rows = collectDailyRows(date);
    if (!rows.length) {
      toast('ไม่พบรายการ Slot ที่จะบันทึก', 'error');
      return false;
    }

    const publish = options.publish === true;
    dailySaveInFlight = true;
    busy(true, publish ? 'กำลังบันทึกและประกาศตำแหน่งวันนี้' : 'กำลังบันทึกตำแหน่งวันนี้');
    try {
      const del = await sb.from('daily_positions').delete().eq('work_date', date);
      if (del.error) throw del.error;

      const ins = await sb.from('daily_positions').insert(rows).select('*');
      if (ins.error) throw ins.error;

      const statusPayload = {
        work_date: date,
        month_key: date.slice(0, 7),
        status: publish ? 'published' : 'draft',
        updated_by: currentStaff()
      };
      if (publish) {
        statusPayload.published_by = currentStaff();
        statusPayload.published_at = new Date().toISOString();
      }
      const statusResult = await sb.from('daily_position_day_status')
        .upsert(statusPayload, { onConflict:'work_date' })
        .select('*')
        .maybeSingle();
      if (statusResult.error) throw statusResult.error;

      // Read the exact date back from Supabase. This is the value both daily and monthly pages must use.
      const fresh = await fetchDateFromDatabase(date);
      replaceDateInState(date, fresh.rows.length ? fresh.rows : (ins.data || rows), fresh.status || statusResult.data || statusPayload);
      monthRefreshAt.set(date.slice(0,7), Date.now());

      try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
      toast(publish ? 'บันทึกและประกาศตารางตำแหน่งวันนี้แล้ว ตารางรายเดือนอัปเดตตามวันที่นี้แล้ว' : 'บันทึกตำแหน่งวันนี้แล้ว ตารางรายเดือนอัปเดตตามวันที่นี้แล้ว');
      console.info(`${VERSION}: daily date synchronized`, { date, publish, rows:fresh.rows.length || rows.length });
      return true;
    } catch (error) {
      console.error(`${VERSION}: daily save failed`, error);
      toast(`บันทึกตำแหน่งวันนี้ไม่สำเร็จ: ${friendly(error)}`, 'error');
      return false;
    } finally {
      dailySaveInFlight = false;
      busy(false);
    }
  }

  const savePositionsV261 = async function(){
    return saveDailyAuthoritative({ publish:false });
  };
  savePositionsV261.__v261Authoritative = true;
  assignGlobalFunction('savePositions', savePositionsV261);

  const publishPositionsV261 = async function(){
    // Publishing is intentionally save + publish in one transaction flow, so a user cannot publish stale dropdown values.
    return saveDailyAuthoritative({ publish:true });
  };
  publishPositionsV261.__v261Authoritative = true;
  assignGlobalFunction('publishPositionsForDay', publishPositionsV261);

  function monthRange(monthKey){
    const key = String(monthKey || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return null;
    const [year, month] = key.split('-').map(Number);
    const last = new Date(year, month, 0).getDate();
    return { key, start:`${key}-01`, end:`${key}-${String(last).padStart(2,'0')}` };
  }
  function mergeMonthRows(current, fresh, field, key){
    return (Array.isArray(current) ? current : [])
      .filter(row => String(row?.[field] || '').slice(0,7) !== key)
      .concat(Array.isArray(fresh) ? fresh : []);
  }
  async function refreshMonthFromDatabase(monthKey, options={}){
    const range = monthRange(monthKey);
    if (!range) return false;
    if (monthRefreshInFlight.has(range.key)) return monthRefreshInFlight.get(range.key);

    const task = (async () => {
      const [positionsResult, statusResult] = await Promise.all([
        sb.from('daily_positions').select('*').gte('work_date', range.start).lte('work_date', range.end).order('work_date').order('position_code'),
        sb.from('daily_position_day_status').select('*').gte('work_date', range.start).lte('work_date', range.end).order('work_date')
      ]);
      if (positionsResult.error) throw positionsResult.error;
      if (statusResult.error) throw statusResult.error;
      const st = appState();
      if (!st) return false;
      st.positions = mergeMonthRows(st.positions, positionsResult.data || [], 'work_date', range.key);
      st.positionDayStatus = mergeMonthRows(st.positionDayStatus, statusResult.data || [], 'work_date', range.key);
      monthRefreshAt.set(range.key, Date.now());
      if (options.render !== false) {
        const currentPage = st.page;
        const currentKey = currentPage === 'positionMonthView'
          ? String(st.positionMonthViewKey || st.monthKey || '').slice(0,7)
          : String(st.positionMonthKey || st.monthKey || '').slice(0,7);
        if ((currentPage === 'positionMonthView' || currentPage === 'positionMonth') && currentKey === range.key) {
          try { renderPage(); } catch (_) {}
        }
      }
      return true;
    })().catch(error => {
      console.error(`${VERSION}: monthly refresh failed`, error);
      if (!options.silent) toast(`รีเฟรชตารางตำแหน่งกลางวัน รายเดือนไม่สำเร็จ: ${friendly(error)}`, 'error');
      return false;
    }).finally(() => monthRefreshInFlight.delete(range.key));

    monthRefreshInFlight.set(range.key, task);
    return task;
  }

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !oldRenderPage.__v261MonthRefresh) {
    const renderPageV261 = function(){
      const result = oldRenderPage.apply(this, arguments);
      const st = appState();
      if (!st || (st.page !== 'positionMonthView' && st.page !== 'positionMonth')) return result;
      const key = st.page === 'positionMonthView'
        ? String(st.positionMonthViewKey || st.monthKey || '').slice(0,7)
        : String(st.positionMonthKey || st.monthKey || '').slice(0,7);
      if (!/^\d{4}-\d{2}$/.test(key)) return result;
      if (st.page === 'positionMonth' && st.monthPositionDraft?.monthKey === key) return result;
      const age = Date.now() - Number(monthRefreshAt.get(key) || 0);
      if (age > 2500 && !monthRefreshInFlight.has(key)) {
        setTimeout(() => refreshMonthFromDatabase(key, { silent:true }), 0);
      }
      return result;
    };
    renderPageV261.__v261MonthRefresh = true;
    assignGlobalFunction('renderPage', renderPageV261);
  }

  window.cnmiV261 = {
    collectDailyRows,
    saveDailyAuthoritative,
    fetchDateFromDatabase,
    refreshMonthFromDatabase,
    replaceDateInState
  };

  console.info(`${VERSION} loaded`);
})();
