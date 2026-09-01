/* V400: Activity form restore + server-side filter gate
 * - Restores the existing activity entry form from V396/V397.
 * - Does not load/show the full activity list automatically.
 * - Queries Supabase only after the user selects at least one filter.
 * - Does not modify Dashboard rendering.
 */
(function () {
  'use strict';

  const VERSION = 'V400_ACTIVITY_FORM_FILTER_GATE';
  const oldRenderActivitiesPage = window.renderActivitiesPage;
  const oldHandleChange = window.handleChange;
  const oldHandleClick = window.handleClick;
  const oldLoadAllData = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);

  function defaultFilters() {
    return {
      start: state.activityFilterStart || '',
      end: state.activityFilterEnd || '',
      type: state.activityFilterType || '',
      search: state.activityFilterSearch || ''
    };
  }

  function hasAnyFilter(filters) {
    return Boolean(filters.start || filters.end || filters.type || String(filters.search || '').trim());
  }

  function filterInputValue(name, fallback) {
    return escapeHtml(state[name] || fallback || '');
  }

  function queryKeyOf(filters) {
    return JSON.stringify({
      start: filters.start || '',
      end: filters.end || '',
      type: filters.type || '',
      search: String(filters.search || '').trim()
    });
  }

  async function queryActivityListV398(filters) {
    if (!sb || !state.profile) return;
    let query = sb.from('activity_events')
      .select('*')
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (filters.start) query = query.gte('end_date', filters.start);
    if (filters.end) query = query.lte('start_date', filters.end);
    if (filters.type) query = query.eq('event_type', filters.type);

    const search = String(filters.search || '').trim().replace(/[%_,().]/g, ' ').replace(/\s+/g, ' ');
    if (search) query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    state.activityListRowsV398 = rows;
    state.activityListQueryKeyV398 = queryKeyOf(filters);

    // Keep queried rows available for Edit even when they are outside the
    // calendar's normal preload window. Existing rows retain their order.
    const merged = new Map((state.activities || []).map(row => [String(row.id), row]));
    rows.forEach(row => merged.set(String(row.id), row));
    state.activities = [...merged.values()];
  }

  function filtersFromState() {
    const f = defaultFilters();
    return { start: f.start, end: f.end, type: f.type, search: f.search };
  }

  function renderRowsV398(rows) {
    return `<div class="activity-card-list">${rows.map(r => {
      const participants = (Array.isArray(r.participant_ids) ? r.participant_ids : []).map(staffNick).filter(Boolean).join(', ') || '-';
      const canEdit = isAdmin() || r.created_by === currentStaffId() || r.owner_id === currentStaffId();
      const files = window.cnmiActivityAttachmentsV487?.parse ? window.cnmiActivityAttachmentsV487.parse(r.attachment_path) : (r.attachment_path ? [{path:r.attachment_path,name:'ไฟล์แนบ 1'}] : []);
      const fileButtons = files.length ? `<div class="activity-row-detail v487-activity-files"><span>ไฟล์แนบ</span><b class="v487-file-buttons">${files.map((file,index)=>`<button type="button" class="tiny-btn v487-view-file-btn" data-v487-open-activity-file="${r.id}:${index}">📎 ดูไฟล์ ${index+1}</button>`).join('')}</b></div>` : '';
      return `<div class="activity-row-card" data-v487-activity-id="${r.id}">
        <div class="activity-row-head"><div><b>${escapeHtml(r.title)}</b><br>${badge(r.event_type, activityClass(r.event_type))}</div><span class="muted">${formatThaiDate(r.start_date)}</span></div>
        <div class="activity-row-detail"><span>เวลา</span><b>${escapeHtml([r.start_time, r.end_time].filter(Boolean).join(' - ') || '-')}</b></div>
        <div class="activity-row-detail"><span>สถานที่</span><b>${escapeHtml(r.location || '-')}</b></div>
        <div class="activity-row-detail"><span>ผู้รับผิดชอบ</span><b>${escapeHtml(staffNick(r.owner_id) || '-')}</b></div>
        <div class="activity-row-detail"><span>ผู้เข้าร่วม</span><b>${escapeHtml(participants)}</b></div>
        ${fileButtons}
        <div class="actions">${canEdit ? `<button class="tiny-btn" data-edit-activity="${r.id}">แก้ไข</button><button class="tiny-btn danger" data-delete-activity="${r.id}">ลบ</button>` : '<span class="muted">ดูอย่างเดียว</span>'}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function findActivityListStart(html) {
    const markers = [
      '<div class="card v397-all-activities">',
      '<div class="card activity-list-card">',
      '<div class="card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3>'
    ];
    for (const marker of markers) {
      const index = html.indexOf(marker);
      if (index > -1) return index;
    }
    return -1;
  }

  window.renderActivitiesPage = function renderActivitiesPageV400() {
    const filters = defaultFilters();
    const queryKey = queryKeyOf(filters);
    const hasApplied = state.activityFilterAppliedV398 === true;
    const hasServerRows = hasApplied && state.activityListQueryKeyV398 === queryKey;
    const list = hasServerRows
      ? [...(state.activityListRowsV398 || [])].sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')) || String(a.start_time || '').localeCompare(String(b.start_time || '')))
      : [];

    // V396/V397 own the activity form and training fields. Keep that exact
    // form, then replace only the right-hand activity-list card.
    const formHtml = oldRenderActivitiesPage ? oldRenderActivitiesPage() : '';
    const listStart = findActivityListStart(formHtml);
    const left = listStart > -1
      ? formHtml.slice(0, listStart)
      : '<div class="grid v397-activities-layout"><div class="card"><div class="notice warning">ไม่สามารถแสดงแบบฟอร์มกิจกรรมได้ กรุณารีเฟรชหน้าอีกครั้ง</div></div>';

    return `${left}
      <div class="card activity-list-card v397-all-activities">
        <div class="section-title"><div><h3>ค้นหากิจกรรม</h3><p class="hint">ระบบจะไม่โหลดรายการทั้งหมดอัตโนมัติ</p></div><span class="muted">${hasApplied ? `แสดง ${list.length} รายการ` : 'ยังไม่ได้ค้นหา'}</span></div>
        <div class="activity-filter-box">
          <div class="activity-filter-hint">เลือกอย่างน้อย 1 เงื่อนไข แล้วกดค้นหา เพื่อโหลดเฉพาะรายการที่ต้องการ</div>
          <div class="toolbar compact-filter activity-filter-grid">
            <label>ตั้งแต่ <input type="date" id="activityFilterStart" value="${filterInputValue('activityFilterStart', filters.start)}"></label>
            <label>ถึง <input type="date" id="activityFilterEnd" value="${filterInputValue('activityFilterEnd', filters.end)}"></label>
            <label>ประเภท <select id="activityFilterType"><option value="">กรุณาเลือกประเภท</option>${ACTIVITY_TYPES.map(t => `<option value="${escapeHtml(t)}" ${filters.type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>
            <label class="activity-filter-search">ค้นหา <input type="search" id="activityFilterSearch" value="${filterInputValue('activityFilterSearch', filters.search)}" placeholder="ชื่อกิจกรรมหรือสถานที่"></label>
            <div class="activity-filter-actions"><button type="button" class="primary-btn" data-activity-filter-apply>ค้นหา</button><button type="button" class="ghost-btn" data-activity-filter-reset>ล้างตัวกรอง</button></div>
          </div>
        </div>
        ${!hasApplied ? empty('กรุณาเลือกตัวกรองแล้วกดค้นหา') : (list.length ? renderRowsV398(list) : empty('ไม่พบกิจกรรมตามตัวกรอง'))}
      </div>
    </div>`;
  };
  try { (0, eval)('renderActivitiesPage=window.renderActivitiesPage'); } catch (_) {}

  window.handleChange = function handleChangeV400(e) {
    const t = e.target;
    if (['activityFilterStart', 'activityFilterEnd', 'activityFilterType', 'activityFilterSearch'].includes(t.id)) {
      state[`draft_${t.id}`] = t.value;
      return;
    }
    return oldHandleChange ? oldHandleChange(e) : undefined;
  };
  try { (0, eval)('handleChange=window.handleChange'); } catch (_) {}

  window.handleClick = async function handleClickV400(e) {
    const t = e.target.closest('button, [data-page]');
    if (t?.hasAttribute('data-activity-filter-apply')) {
      const start = document.getElementById('activityFilterStart')?.value || '';
      const end = document.getElementById('activityFilterEnd')?.value || '';
      const type = document.getElementById('activityFilterType')?.value || '';
      const search = document.getElementById('activityFilterSearch')?.value || '';
      const filters = { start, end, type, search };

      if (!hasAnyFilter(filters)) return showToast('กรุณาเลือกอย่างน้อย 1 ตัวกรองก่อนค้นหา', { tone: 'error' });
      if (start && end && start > end) return showToast('วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด', { tone: 'error' });

      state.activityFilterStart = start;
      state.activityFilterEnd = end;
      state.activityFilterType = type;
      state.activityFilterSearch = search;
      try {
        await queryActivityListV398(filters);
        state.activityFilterAppliedV398 = true;
        renderPage();
      } catch (err) {
        state.activityFilterAppliedV398 = false;
        showToast(friendlyDbError(err), { tone: 'error' });
      }
      return;
    }

    if (t?.hasAttribute('data-activity-filter-reset')) {
      state.activityFilterStart = '';
      state.activityFilterEnd = '';
      state.activityFilterType = '';
      state.activityFilterSearch = '';
      state.activityFilterAppliedV398 = false;
      state.activityListRowsV398 = [];
      state.activityListQueryKeyV398 = '';
      renderPage();
      return;
    }

    return oldHandleClick ? oldHandleClick(e) : undefined;
  };
  try { (0, eval)('handleClick=window.handleClick'); } catch (_) {}

  // After saving/deleting an activity, refresh only the active filtered list.
  // No extra activity query runs on Dashboard or other pages.
  if (oldLoadAllData && !window.__CNMI_V400_ACTIVITY_LOAD_WRAPPED__) {
    window.__CNMI_V400_ACTIVITY_LOAD_WRAPPED__ = true;
    window.loadAllData = async function loadAllDataV400() {
      const result = await oldLoadAllData.apply(this, arguments);
      if (state.page === 'activities' && state.activityFilterAppliedV398 === true) {
        const filters = filtersFromState();
        if (hasAnyFilter(filters)) {
          try { await queryActivityListV398(filters); }
          catch (_) {
            state.activityFilterAppliedV398 = false;
            state.activityListRowsV398 = [];
            state.activityListQueryKeyV398 = '';
          }
        }
      }
      return result;
    };
    try { (0, eval)('loadAllData=window.loadAllData'); } catch (_) {}
  }

  const css = document.createElement('style');
  css.textContent = '.activity-filter-box{padding:10px 12px;margin:8px 0 14px;border:1px solid #dbe8f4;border-radius:14px;background:#f7fbff}.activity-filter-hint{font-size:.82rem;color:#62758b;margin-bottom:8px}.activity-filter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:end}.activity-filter-grid label{min-width:0}.activity-filter-search{grid-column:span 2}.activity-filter-actions{display:flex;gap:8px;flex-wrap:wrap}.activity-filter-actions button{min-height:38px}@media(max-width:760px){.activity-filter-grid{grid-template-columns:1fr}.activity-filter-search{grid-column:auto}.activity-filter-actions{grid-column:auto}}';
  document.head.appendChild(css);
  console.info(`[${VERSION}] loaded`);
})();
