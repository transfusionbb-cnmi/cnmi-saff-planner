/* V292 Schedule image export
   - Replaces the staff schedule print button with image export.
   - Uses html2canvas with scale:2 and white background.
   - Captures a dedicated schedule wrapper without the page toolbar.
*/
(function(){
  'use strict';
  const VERSION_V292 = 'V295_SCHEDULE_IMAGE_EXPORT_BRANDED_HEADER';

  function safeHtml(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(msg, tone){
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console[(tone === 'error' ? 'error' : 'log')](msg); }
  }
  function activeScheduleMonth(){
    try { return state?.monthKey || new Date().toISOString().slice(0,7); }
    catch (_) { return new Date().toISOString().slice(0,7); }
  }
  function activeScheduleView(){
    try {
      const v = state?.scheduleMobileView;
      return ['day','person','balance','table'].includes(v) ? v : 'table';
    } catch (_) { return 'table'; }
  }
  function fileName(){
    const month = activeScheduleMonth();
    return `schedule_${month}_ตารางทั้งเดือน.png`.replace(/[\/:*?"<>|]+/g, '-');
  }
  function fullMonthTitle(key){
    try {
      const [y,m] = String(key || '').split('-').map(Number);
      if (!y || !m) return key || '';
      const d = new Date(y, m - 1, 1);
      return d.toLocaleDateString('th-TH', { month:'long', year:'numeric' });
    } catch (_) { return key || ''; }
  }
  function renderExportBrandHeader(key){
    const monthLabel = safeHtml(fullMonthTitle(key) || key);
    return `
      <div class="schedule-brand-header">
        <div class="schedule-brand-logo" aria-hidden="true">
          <div class="schedule-brand-logo-circle">
            <span class="schedule-brand-logo-main">BB</span>
            <span class="schedule-brand-logo-sub">CNMI</span>
          </div>
        </div>
        <div class="schedule-brand-copy">
          <p class="schedule-brand-unit">เวชศาสตร์บริการโลหิต</p>
          <h3 class="schedule-export-title">ตารางเวรประจำเดือน</h3>
          <p class="schedule-export-subtitle">เดือน ${monthLabel}</p>
        </div>
      </div>
    `;
  }
  function ensureHtml2Canvas(){
    if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
    return Promise.reject(new Error('ไม่พบไลบรารี html2canvas'));
  }
  function expandCloneTree(root){
    if (!root) return;
    const selectors = [
      '.table-wrap', '.clean-grid-wrap', '.desktop-table', '.mobile-table',
      '.clean-schedule-content', '.schedule-capture-area', '.schedule-export-clone'
    ];
    root.querySelectorAll(selectors.join(',')).forEach(el => {
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
      el.style.maxWidth = 'none';
      el.style.height = 'auto';
      if (el.classList.contains('table-wrap') || el.classList.contains('clean-grid-wrap')) {
        el.style.width = 'max-content';
      }
    });
    root.querySelectorAll('table').forEach(table => {
      table.style.width = 'max-content';
      table.style.maxWidth = 'none';
    });
  }
  function getScheduleExportDataset(){
    const key = activeScheduleMonth();
    const onlyMine = !!state?.scheduleOnlyMine;
    let staffList = scheduleStaffList();
    let assignments = scheduleAssignmentsForMonth(key);
    if (onlyMine) {
      const sid = (typeof currentSid206 === 'function' ? currentSid206() : (typeof currentStaffId === 'function' ? currentStaffId() : state?.user?.staff_id));
      staffList = staffList.filter(s => String(s.id) === String(sid));
      assignments = assignments.filter(a => String(a.staff_id) === String(sid));
    }
    return { key, staffList, assignments };
  }
  function buildMonthlyGridMarkup(){
    const { key, staffList, assignments } = getScheduleExportDataset();
    if (!staffList.length) return `<div class="empty">ไม่มีรายชื่อเจ้าหน้าที่ที่เปิดใช้งาน</div>`;
    const grid = renderGridView(staffList, assignments, key);
    return `
      <div class="schedule-export-clone schedule-export-sheet">
        ${renderExportBrandHeader(key)}
        <div class="schedule-export-grid-only">${grid}</div>
      </div>
    `;
  }
  function buildCaptureNode(){
    const sandbox = document.createElement('div');
    sandbox.setAttribute('data-v292-export-sandbox', 'true');
    sandbox.style.position = 'fixed';
    sandbox.style.left = '-100000px';
    sandbox.style.top = '0';
    sandbox.style.zIndex = '-1';
    sandbox.style.padding = '24px';
    sandbox.style.background = '#ffffff';
    sandbox.style.width = 'max-content';
    sandbox.style.maxWidth = 'none';

    const holder = document.createElement('div');
    holder.innerHTML = buildMonthlyGridMarkup().trim();
    const clone = holder.firstElementChild;
    if (!clone) throw new Error('ไม่พบตารางทั้งเดือนที่ต้องการ Export');

    clone.style.background = '#ffffff';
    clone.style.color = '#1f2937';
    clone.style.width = 'max-content';
    clone.style.maxWidth = 'none';
    clone.style.overflow = 'visible';
    clone.style.padding = '0';
    clone.style.margin = '0';

    expandCloneTree(clone);
    sandbox.appendChild(clone);
    document.body.appendChild(sandbox);
    return { sandbox, target: clone };
  }
  async function exportTableToImage(){
    try {
      const html2canvas = await ensureHtml2Canvas();
      const { sandbox, target } = buildCaptureNode();
      const width = Math.max(target.scrollWidth, target.offsetWidth, 1200);
      const height = Math.max(target.scrollHeight, target.offsetHeight, 600);
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0
      });
      sandbox.remove();
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = fileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('Export รูปภาพพร้อมหัวข้อเดือนและชื่อหน่วยงานแล้ว');
    } catch (err) {
      console.error(VERSION_V292, err);
      try {
        const sandbox = document.querySelector('[data-v292-export-sandbox="true"]');
        if (sandbox) sandbox.remove();
      } catch(_) {}
      toast(err?.message || 'Export รูปภาพไม่สำเร็จ', 'error');
    }
  }
  window.exportTableToImage = exportTableToImage;

  const previousRenderMonthlySchedulePage = window.renderMonthlySchedulePage || (typeof renderMonthlySchedulePage === 'function' ? renderMonthlySchedulePage : null);
  if (previousRenderMonthlySchedulePage) {
    window.renderMonthlySchedulePage = renderMonthlySchedulePage = function renderMonthlySchedulePageV292(){
      try {
        const key = state.monthKey;
        const onlyMine = !!state.scheduleOnlyMine;
        let staffList = scheduleStaffList();
        let assignments = scheduleAssignmentsForMonth(key);
        if (onlyMine) {
          const sid = (typeof currentSid206 === 'function' ? currentSid206() : (typeof currentStaffId === 'function' ? currentStaffId() : state?.user?.staff_id));
          staffList = staffList.filter(s => String(s.id) === String(sid));
          assignments = assignments.filter(a => String(a.staff_id) === String(sid));
          if (!state.schedulePersonFilter || String(state.schedulePersonFilter) !== String(sid)) state.schedulePersonFilter = sid;
        }
        const active = ['day','person','balance','table'].includes(state.scheduleMobileView) ? state.scheduleMobileView : 'day';
        state.scheduleMobileView = active;
        const content = staffList.length
          ? (active === 'day' ? renderCalendarCardView(staffList, assignments, key)
            : active === 'person' ? renderPersonView(staffList, assignments, key)
            : active === 'balance' ? renderBalanceDashboard(staffList, assignments, key)
            : renderGridView(staffList, assignments, key))
          : empty('ไม่มีรายชื่อเจ้าหน้าที่ที่เปิดใช้งาน');
        return `<div class="card schedule-page-card clean-schedule-page v206-schedule-page">
          <div class="toolbar no-print">
            <label>เดือน <input type="month" id="scheduleMonthInput" value="${safeHtml(key)}"></label>
            <button class="${onlyMine ? 'primary-btn' : 'ghost-btn'}" type="button" data-only-my-schedule>${onlyMine ? 'แสดงทุกคน' : 'ดูเฉพาะเวรของฉัน'}</button>
            <button class="ghost-btn" data-export-schedule-excel>Export Excel</button>
            <button class="ghost-btn" data-export-schedule-image>Export เป็นรูปภาพ (Download Image)</button>
          </div>
          <div id="scheduleCaptureArea" class="schedule-capture-area">
            ${renderScheduleTabs(active)}
            ${renderExportBrandHeader(key)}
            <h3 class="print-only">ตารางเวรประจำเดือน ${safeHtml(key)}</h3>
            <div class="clean-schedule-content">${content}</div>
          </div>
          ${onlyMine ? '' : renderDutyTradePanel(assignments)}
        </div>`;
      } catch (err) {
        console.warn(`${VERSION_V292} schedule override fallback`, err);
        return previousRenderMonthlySchedulePage.apply(this, arguments);
      }
    };
  }

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-export-schedule-image]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    exportTableToImage();
  }, true);

  // minimal styles for export header area
  try {
    const style = document.createElement('style');
    style.textContent = `
      .schedule-capture-area{display:block;background:#fff;border-radius:18px;}
      .schedule-brand-header{display:flex;align-items:center;gap:14px;margin:8px 0 16px 0;padding:10px 12px;border:1px solid #d7e5f6;border-radius:18px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);}
      .schedule-brand-logo{flex:0 0 auto;}
      .schedule-brand-logo-circle{width:74px;height:74px;border-radius:999px;background:linear-gradient(135deg,#8fd0ff 0%,#4aa3ff 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;box-shadow:0 8px 18px rgba(74,163,255,.24);border:3px solid #ffffff;}
      .schedule-brand-logo-main{font-size:24px;line-height:1;font-weight:800;letter-spacing:.5px;}
      .schedule-brand-logo-sub{font-size:10px;line-height:1.1;font-weight:700;letter-spacing:1.2px;margin-top:4px;opacity:.96;}
      .schedule-brand-copy{display:flex;flex-direction:column;gap:3px;min-width:0;}
      .schedule-brand-unit{margin:0;font-size:.95rem;font-weight:700;color:#2563eb;letter-spacing:.2px;}
      .schedule-export-title{margin:0;font-size:1.2rem;font-weight:800;color:#16324f;}
      .schedule-export-subtitle{margin:0;color:#5b6b7f;font-size:.98rem;font-weight:600;}
      .schedule-export-sheet,
      .schedule-export-grid-only{display:block;background:#fff;width:max-content;max-width:none;}
      .schedule-export-clone .table-wrap,
      .schedule-export-clone .clean-grid-wrap{overflow:visible !important;max-width:none !important;width:max-content !important;height:auto !important;}
      .schedule-export-clone table{width:max-content !important;max-width:none !important;table-layout:auto !important;}
      .schedule-export-clone .clean-sticky-col{position:static !important;left:auto !important;z-index:auto !important;}
      .schedule-export-clone .clean-staff-cell button{pointer-events:none !important;}
      @media (max-width: 700px){
        .schedule-brand-header{padding:10px;gap:10px;}
        .schedule-brand-logo-circle{width:62px;height:62px;}
        .schedule-brand-logo-main{font-size:20px;}
        .schedule-brand-logo-sub{font-size:9px;}
        .schedule-brand-unit{font-size:.88rem;}
        .schedule-export-title{font-size:1.08rem;}
        .schedule-export-subtitle{font-size:.9rem;}
      }
    `;
    document.head.appendChild(style);
  } catch(_) {}

  console.info(`[${VERSION_V292}] loaded`);
})();
