/* V398: Activity list server-side filters
 * Keeps calendar activity data intact, but queries only the requested activity
 * window/type/search when the Activity page is filtered.
 */
(function () {
  'use strict';

  const VERSION = 'V398_ACTIVITY_SERVER_FILTER';
  const oldRenderActivitiesPage = window.renderActivitiesPage;
  const oldHandleChange = window.handleChange;
  const oldHandleClick = window.handleClick;

  function currentMonthValue() {
    return state.activityFilterMonth || state.monthKey || monthKey(new Date());
  }

  function defaultFilters() {
    const mk = currentMonthValue();
    return {
      start: state.activityFilterStart || `${mk}-01`,
      end: state.activityFilterEnd || `${mk}-31`,
      type: state.activityFilterType || '',
      search: state.activityFilterSearch || ''
    };
  }

  function filterInputValue(name, fallback) {
    return escapeHtml(state[name] || fallback || '');
  }

  async function queryActivityListV398(filters) {
    if (!sb || !state.profile) return;
    let query = sb.from('activity_events')
      .select('*')
      .lte('start_date', filters.end)
      .gte('end_date', filters.start)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (filters.type) query = query.eq('event_type', filters.type);
    const search = String(filters.search || '').trim().replace(/[(),]/g, ' ');
    if (search) query = query.ilike('title', `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    state.activityListRowsV398 = data || [];
    state.activityListQueryKeyV398 = JSON.stringify(filters);
  }

  function filtersFromState() {
    const f = defaultFilters();
    return { start: f.start, end: f.end, type: f.type, search: f.search };
  }

  function renderRowsV398(rows) {
    return `<div class="activity-card-list">${rows.map(r => {
      const participants = (Array.isArray(r.participant_ids) ? r.participant_ids : []).map(staffNick).filter(Boolean).join(', ') || '-';
      const canEdit = isAdmin() || r.created_by === currentStaffId() || r.owner_id === currentStaffId();
      return `<div class="activity-row-card">
        <div class="activity-row-head"><div><b>${escapeHtml(r.title)}</b><br>${badge(r.event_type, activityClass(r.event_type))}</div><span class="muted">${formatThaiDate(r.start_date)}</span></div>
        <div class="activity-row-detail"><span>เวลา</span><b>${escapeHtml([r.start_time, r.end_time].filter(Boolean).join(' - ') || '-')}</b></div>
        <div class="activity-row-detail"><span>สถานที่</span><b>${escapeHtml(r.location || '-')}</b></div>
        <div class="activity-row-detail"><span>ผู้รับผิดชอบ</span><b>${escapeHtml(staffNick(r.owner_id) || '-')}</b></div>
        <div class="activity-row-detail"><span>ผู้เข้าร่วม</span><b>${escapeHtml(participants)}</b></div>
        <div class="actions">${canEdit ? `<button class="tiny-btn" data-edit-activity="${r.id}">แก้ไข</button><button class="tiny-btn danger" data-delete-activity="${r.id}">ลบ</button>` : '<span class="muted">ดูอย่างเดียว</span>'}</div>
      </div>`;
    }).join('')}</div>`;
  }

  window.renderActivitiesPage = function renderActivitiesPageV398() {
    const filters = defaultFilters();
    const queryKey = JSON.stringify(filters);
    const hasServerRows = state.activityListQueryKeyV398 === queryKey;
    const rows = hasServerRows
      ? [...(state.activityListRowsV398 || [])]
      : [...(state.activities || [])]
        .filter(r => String(r.start_date || '') <= filters.end && String(r.end_date || '') >= filters.start)
        .filter(r => !filters.type || r.event_type === filters.type)
        .filter(r => !filters.search || String(r.title || '').toLowerCase().includes(filters.search.toLowerCase()));
    const editing = state.editingActivityId ? state.activities.find(x => x.id === state.editingActivityId) : null;
    const list = rows.sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')) || String(a.start_time || '').localeCompare(String(b.start_time || '')));

    const formHtml = oldRenderActivitiesPage ? oldRenderActivitiesPage() : '';
    const listStart = formHtml.indexOf('<div class="card activity-list-card">');
    const left = listStart > -1
      ? formHtml.slice(0, listStart)
      : '<div class="card">ไม่สามารถแสดงแบบฟอร์มกิจกรรมได้</div>';
    return `${left}
      <div class="card activity-list-card">
        <div class="section-title"><h3>กิจกรรมทั้งหมด</h3><span class="muted">แสดง ${list.length} รายการ</span></div>
        <div class="activity-filter-box">
          <div class="activity-filter-hint">เลือกเงื่อนไขก่อนค้นหา เพื่อโหลดเฉพาะรายการที่ต้องการ</div>
          <div class="toolbar compact-filter activity-filter-grid">
            <label>ตั้งแต่ <input type="date" id="activityFilterStart" value="${filterInputValue('activityFilterStart', filters.start)}"></label>
            <label>ถึง <input type="date" id="activityFilterEnd" value="${filterInputValue('activityFilterEnd', filters.end)}"></label>
            <label>ประเภท <select id="activityFilterType"><option value="">ทุกประเภท</option>${ACTIVITY_TYPES.map(t => `<option value="${escapeHtml(t)}" ${filters.type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>
            <label class="activity-filter-search">ค้นหา <input type="search" id="activityFilterSearch" value="${filterInputValue('activityFilterSearch', filters.search)}" placeholder="ชื่อกิจกรรมหรือสถานที่"></label>
            <div class="activity-filter-actions"><button type="button" class="primary-btn" data-activity-filter-apply>ค้นหา</button><button type="button" class="ghost-btn" data-activity-filter-reset>ล้างตัวกรอง</button></div>
          </div>
        </div>
        ${list.length ? renderRowsV398(list) : empty('ไม่พบกิจกรรมตามตัวกรอง')}
      </div>
    </div>`;
  };

  window.handleChange = function handleChangeV398(e) {
    const t = e.target;
    if (['activityFilterStart', 'activityFilterEnd', 'activityFilterType', 'activityFilterSearch'].includes(t.id)) {
      state[`draft_${t.id}`] = t.value;
      return;
    }
    return oldHandleChange ? oldHandleChange(e) : undefined;
  };

  window.handleClick = async function handleClickV398(e) {
    const t = e.target.closest('button, [data-page]');
    if (t?.hasAttribute('data-activity-filter-apply')) {
      const start = document.getElementById('activityFilterStart')?.value || defaultFilters().start;
      const end = document.getElementById('activityFilterEnd')?.value || defaultFilters().end;
      const type = document.getElementById('activityFilterType')?.value || '';
      const search = document.getElementById('activityFilterSearch')?.value || '';
      if (start > end) return showToast('วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด', { tone: 'error' });
      state.activityFilterStart = start;
      state.activityFilterEnd = end;
      state.activityFilterType = type;
      state.activityFilterSearch = search;
      try {
        await queryActivityListV398({ start, end, type, search });
        renderPage();
      } catch (err) {
        showToast(friendlyDbError(err), { tone: 'error' });
      }
      return;
    }
    if (t?.hasAttribute('data-activity-filter-reset')) {
      const mk = state.monthKey || monthKey(new Date());
      state.activityFilterStart = `${mk}-01`;
      state.activityFilterEnd = `${mk}-31`;
      state.activityFilterType = '';
      state.activityFilterSearch = '';
      state.activityListRowsV398 = [];
      state.activityListQueryKeyV398 = '';
      renderPage();
      return;
    }
    return oldHandleClick ? oldHandleClick(e) : undefined;
  };

  const css = document.createElement('style');
  css.textContent = '.activity-filter-box{padding:10px 12px;margin:8px 0 14px;border:1px solid #dbe8f4;border-radius:14px;background:#f7fbff}.activity-filter-hint{font-size:.82rem;color:#62758b;margin-bottom:8px}.activity-filter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:end}.activity-filter-grid label{min-width:0}.activity-filter-search{grid-column:span 2}.activity-filter-actions{display:flex;gap:8px;flex-wrap:wrap}.activity-filter-actions button{min-height:38px}@media(max-width:760px){.activity-filter-grid{grid-template-columns:1fr}.activity-filter-search{grid-column:auto}.activity-filter-actions{grid-column:auto}}';
  document.head.appendChild(css);
  console.info(`[${VERSION}] loaded`);
})();
