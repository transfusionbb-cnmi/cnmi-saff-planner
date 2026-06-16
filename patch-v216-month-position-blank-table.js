/* V216: Month Position Blank Table First
   - Adds Admin-only “สร้างตารางเปล่า” before auto-generating monthly positions.
   - If auto-generate cannot create any rows, it falls back to a blank staff x workday table instead of showing success with no table.
   - Blank rows are only a screen draft; they are not saved until Admin selects positions and presses save.
*/
(function(){
  'use strict';
  const VERSION = 'V216_MONTH_POSITION_BLANK_TABLE_FIRST';
  if (window.__CNMI_V216_MONTH_POSITION_BLANK_TABLE__) return;
  window.__CNMI_V216_MONTH_POSITION_BLANK_TABLE__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const toast = (msg, tone) => {
    try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else window.alert(msg); }
    catch (_) { console.info(msg); }
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayKey = () => {
    try { return todayStr(); }
    catch (_) {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  };
  const monthKeyFallback = () => {
    try { return monthKey(new Date()); }
    catch (_) { return todayKey().slice(0, 7); }
  };
  const currentId = () => {
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || null; }
  };
  const isAdminSafe = () => {
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  };
  const isNoPositionDate = (date) => {
    try { if (typeof isNoPositionDay === 'function') return !!isNoPositionDay(date); } catch (_) {}
    try { if (typeof isWeekend === 'function' && isWeekend(date)) return true; } catch (_) {}
    try { if (typeof isHolidayDate === 'function' && isHolidayDate(date)) return true; } catch (_) {}
    const d = new Date(`${date}T00:00:00`);
    return d.getDay() === 0 || d.getDay() === 6;
  };
  const isBlankCode = (code) => {
    const raw = String(code || '').trim();
    if (!raw) return true;
    try { return positionBaseCode(raw) === 'รอตรวจสอบ'; }
    catch (_) { return raw === 'รอตรวจสอบ'; }
  };
  const realPositionRows = (rows) => (rows || []).filter(r => r?.staff_id && !isBlankCode(r?.position_code || r?.code));

  function getRange(key){
    try {
      const r = getMonthRange(key);
      return { y: r.y, m: r.m, last: r.last || new Date(r.y, r.m, 0).getDate() };
    } catch (_) {
      const [yy, mm] = String(key || monthKeyFallback()).split('-').map(Number);
      const y = yy || new Date().getFullYear();
      const m = mm || (new Date().getMonth() + 1);
      return { y, m, last: new Date(y, m, 0).getDate() };
    }
  }

  function staffForBlankTable(){
    let rows = Array.isArray(state?.staff) ? state.staff.slice() : [];
    rows = rows.filter(st => {
      try { return typeof isDailyPositionEnabled === 'function' ? isDailyPositionEnabled(st) : true; }
      catch (_) { return true; }
    }).filter(st => st && st.id && !st.deleted_at && st.is_active !== false && st.active !== false);
    try { return orderedStaff(rows); }
    catch (_) { return rows.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }

  function makeBlankRow(date, staffId){
    return {
      work_date: date,
      position_code: '',
      code: '',
      zone: '',
      break_time: '-',
      main_rule: '',
      job_desc: '',
      staff_id: staffId,
      updated_by: currentId(),
      _blankTableV216: true
    };
  }

  function buildBlankMonthPositionDraft(key){
    const { y, m, last } = getRange(key);
    const staff = staffForBlankTable();
    const rows = [];
    for (let day = 1; day <= last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (isNoPositionDate(date)) continue;
      staff.forEach(st => rows.push(makeBlankRow(date, st.id)));
    }
    return { monthKey: key, rows, blankTable: true };
  }

  function currentMonthKeyFromScreen(){
    const input = document.getElementById('positionMonthInput');
    return String(input?.value || state?.positionMonthKey || state?.monthKey || monthKeyFallback()).slice(0, 7);
  }

  async function confirmDiscardDraft(actionText){
    const hasDraft = state?.monthPositionDraft?.rows?.length && state.monthPositionDraft.monthKey === currentMonthKeyFromScreen();
    if (!hasDraft) return true;
    const realRows = realPositionRows(state.monthPositionDraft.rows);
    if (!realRows.length) return true;
    const msg = `มีร่างตำแหน่งที่ยังไม่ได้บันทึกอยู่\n\nต้องการ${actionText}และแทนที่ร่างเดิมหรือไม่?`;
    try { if (typeof confirmDialog === 'function') return await confirmDialog(msg, 'ยืนยันแทนที่ร่างเดิม'); }
    catch (_) {}
    return window.confirm(msg);
  }

  async function createBlankTable(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const key = currentMonthKeyFromScreen();
    const ok = await confirmDiscardDraft('สร้างตารางเปล่า');
    if (!ok) return;
    const draft = buildBlankMonthPositionDraft(key);
    state.positionMonthKey = key;
    state.monthPositionDraft = draft;
    try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
    if (!draft.rows.length) return toast('สร้างตารางเปล่าไม่ได้ เพราะยังไม่พบเจ้าหน้าที่ที่เปิดใช้งานสำหรับจัดตำแหน่ง หรือเดือนนี้ไม่มีวันทำงาน', 'error');
    toast('สร้างตารางเปล่าแล้ว เลือกตำแหน่งในช่องที่ต้องการ จากนั้นค่อยกดบันทึกแผนทั้งเดือน');
  }

  const oldBuildMonthlyPositionDraft = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);

  async function generateMonthPlanWithFallback(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const key = currentMonthKeyFromScreen();
    const ok = await confirmDiscardDraft('สร้างแผนทั้งเดือนใหม่');
    if (!ok) return;
    let draft = null;
    let buildError = null;
    try { draft = oldBuildMonthlyPositionDraft ? oldBuildMonthlyPositionDraft(key) : null; }
    catch (err) { buildError = err; console.warn(`${VERSION}: auto plan failed`, err); }
    const autoRows = Array.isArray(draft?.rows) ? draft.rows : [];
    state.positionMonthKey = key;
    if (realPositionRows(autoRows).length) {
      state.monthPositionDraft = { ...draft, monthKey: key, rows: autoRows };
      try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
      toast('สร้างแผนตำแหน่งรายเดือนแล้ว ตรวจทานก่อนบันทึก');
      return;
    }
    const blank = buildBlankMonthPositionDraft(key);
    state.monthPositionDraft = blank;
    try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
    const extra = buildError ? ' ระบบสร้างแผนอัตโนมัติติด Error จึงเปิดตารางเปล่าให้ก่อน' : ' ระบบยังจัดแผนอัตโนมัติไม่ได้ จึงเปิดตารางเปล่าให้ก่อน';
    toast(`สร้างตารางเปล่าแล้ว${extra} เลือกตำแหน่งเองแล้วค่อยกดบันทึก`, blank.rows.length ? undefined : 'error');
  }

  // Make other callers safe too: an empty auto-plan now returns a visible blank matrix instead of an invisible empty result.
  if (oldBuildMonthlyPositionDraft) {
    window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV216(key){
      let draft = null;
      try { draft = oldBuildMonthlyPositionDraft.apply(this, arguments); } catch (err) { console.warn(`${VERSION}: build fallback`, err); }
      if (Array.isArray(draft?.rows) && draft.rows.length) return draft;
      const month = String(key || currentMonthKeyFromScreen() || monthKeyFallback()).slice(0, 7);
      return buildBlankMonthPositionDraft(month);
    };
  }

  function blankButtonHtml(){
    return '<button class="soft-btn blank-month-table-btn-v216" type="button" data-create-blank-month-position-table-v216>สร้างตารางเปล่า</button>';
  }

  function injectBlankButton(html){
    if (html.includes('data-create-blank-month-position-table-v216')) return html;
    const btn = blankButtonHtml();
    if (/<button[^>]*data-generate-month-positions/.test(html)) {
      return html.replace(/(<button[^>]*data-generate-month-positions[^>]*>)/, `${btn}$1`);
    }
    return html.replace(/(<div class="toolbar">)/, `$1${btn}`);
  }

  const oldRenderPositionMonthPage = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage) {
    window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV216(){
      let html = String(oldRenderPositionMonthPage.apply(this, arguments) || '');
      if (!isAdminSafe()) return html;
      html = injectBlankButton(html);
      const note = '<div class="notice soft-notice compact v216-blank-table-note">ถ้ายังไม่มีตาราง ให้กด “สร้างตารางเปล่า” ก่อน แล้วค่อยเลือกตำแหน่ง/คัดลอกทั้งสัปดาห์/บันทึกแผนทั้งเดือน</div>';
      if (!html.includes('v216-blank-table-note')) {
        html = html.replace(/(<\/div>\s*<div class="monthly-matrix-wrap)/, `${note}$1`).replace(/(<\/div>\s*<div class="empty-state)/, `${note}$1`);
      }
      return html;
    };
  }

  const oldRenderMonthPositionMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
  if (oldRenderMonthPositionMatrix) {
    window.renderMonthPositionMatrix = renderMonthPositionMatrix = function renderMonthPositionMatrixV216(rows, dates){
      if (!Array.isArray(rows) || !rows.length) {
        try { return empty('ยังไม่มีตารางตำแหน่งรายเดือน กด “สร้างตารางเปล่า” ก่อน หรือกด “สร้างแผนทั้งเดือน” เพื่อให้ระบบลองจัดอัตโนมัติ'); }
        catch (_) { return '<div class="empty-state">ยังไม่มีตารางตำแหน่งรายเดือน กด “สร้างตารางเปล่า” ก่อน</div>'; }
      }
      return oldRenderMonthPositionMatrix.apply(this, arguments);
    };
  }

  const oldRenderSummaryHint = window.renderMonthPositionSummaryHint || (typeof renderMonthPositionSummaryHint === 'function' ? renderMonthPositionSummaryHint : null);
  if (oldRenderSummaryHint) {
    window.renderMonthPositionSummaryHint = renderMonthPositionSummaryHint = function renderMonthPositionSummaryHintV216(rows, dates){
      const real = realPositionRows(rows || []);
      if ((!rows || !rows.length) || !real.length) {
        if ((rows || []).length) return '<div class="notice soft-notice compact v216-blank-summary">ตารางนี้เป็นร่างเปล่า ยังไม่มีตำแหน่งที่ถูกเลือก จึงยังไม่มีสรุปภาระงาน</div>';
        return '';
      }
      return oldRenderSummaryHint.call(this, real, dates);
    };
  }

  window.addEventListener('click', async function(e){
    const blank = e.target?.closest?.('[data-create-blank-month-position-table-v216]');
    const generate = e.target?.closest?.('[data-generate-month-positions]');
    if (!blank && !generate) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (blank) return createBlankTable();
    return generateMonthPlanWithFallback();
  }, true);

  window.createBlankMonthPositionTableV216 = createBlankTable;
  window.buildBlankMonthPositionDraftV216 = buildBlankMonthPositionDraft;
  console.info(`${VERSION} loaded`);
})();
