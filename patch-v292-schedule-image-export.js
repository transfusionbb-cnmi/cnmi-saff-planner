/* V292 Schedule image export
   - Replaces the staff schedule print button with image export.
   - Uses html2canvas with scale:2 and white background.
   - Captures a dedicated schedule wrapper without the page toolbar.
*/
(function(){
  'use strict';
  const VERSION_V292 = 'V341_SCHEDULE_IMAGE_FULL_MONTH_WIDTH_FIX';

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
    sandbox.style.padding = '0';
    sandbox.style.background = '#ffffff';
    sandbox.style.width = 'max-content';
    sandbox.style.maxWidth = 'none';
    sandbox.style.overflow = 'visible';

    const holder = document.createElement('div');
    holder.innerHTML = buildMonthlyGridMarkup().trim();
    const clone = holder.firstElementChild;
    if (!clone) throw new Error('ไม่พบตารางทั้งเดือนที่ต้องการ Export');

    clone.setAttribute('data-v341-export-target', 'true');
    clone.classList.add('v341-export-fixed-grid');
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
  function nextTwoFrames(){
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  function expectedDaysInActiveMonth(){
    const [y, m] = String(activeScheduleMonth() || '').split('-').map(Number);
    if (!y || !m) return 31;
    return new Date(y, m, 0).getDate();
  }
  async function settleFullMonthWidth(target){
    try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}
    await nextTwoFrames();

    const table = target.querySelector('#scheduleTable') || target.querySelector('table');
    if (!table) throw new Error('ไม่พบตารางเวรสำหรับ Export');
    const headCells = Array.from(table.querySelectorAll('thead tr:first-child > th'));
    const expectedDays = expectedDaysInActiveMonth();
    if (headCells.length < expectedDays + 1) {
      throw new Error(`ตารางเดือนนี้สร้างได้เพียง ${Math.max(0, headCells.length - 1)} วัน จาก ${expectedDays} วัน กรุณารีเฟรชแล้ว Export ใหม่`);
    }

    const dayWidth = 52;
    const firstCell = headCells[0];
    const firstWidth = Math.max(74, Math.ceil(firstCell?.scrollWidth || firstCell?.getBoundingClientRect?.().width || 74));
    const rows = Array.from(table.rows || []);
    rows.forEach(row => {
      Array.from(row.cells || []).forEach((cell, index) => {
        const px = index === 0 ? firstWidth : dayWidth;
        cell.style.setProperty('width', `${px}px`, 'important');
        cell.style.setProperty('min-width', `${px}px`, 'important');
        cell.style.setProperty('max-width', `${px}px`, 'important');
        cell.style.setProperty('box-sizing', 'border-box', 'important');
      });
    });

    const tableWidth = firstWidth + (expectedDays * dayWidth) + 2;
    table.style.setProperty('width', `${tableWidth}px`, 'important');
    table.style.setProperty('min-width', `${tableWidth}px`, 'important');
    table.style.setProperty('max-width', `${tableWidth}px`, 'important');
    table.style.setProperty('table-layout', 'fixed', 'important');

    target.querySelectorAll('.table-wrap,.clean-grid-wrap,.schedule-export-grid-only').forEach(el => {
      el.style.setProperty('width', `${tableWidth}px`, 'important');
      el.style.setProperty('min-width', `${tableWidth}px`, 'important');
      el.style.setProperty('max-width', `${tableWidth}px`, 'important');
      el.style.setProperty('overflow', 'visible', 'important');
    });
    target.style.setProperty('width', `${tableWidth}px`, 'important');
    target.style.setProperty('min-width', `${tableWidth}px`, 'important');
    target.style.setProperty('max-width', `${tableWidth}px`, 'important');
    const brand = target.querySelector('.schedule-brand-header');
    if (brand) {
      brand.style.setProperty('width', `${tableWidth}px`, 'important');
      brand.style.setProperty('box-sizing', 'border-box', 'important');
    }

    await nextTwoFrames();
    return {
      tableWidth,
      captureWidth: Math.max(tableWidth + 4, target.scrollWidth, target.offsetWidth),
      captureHeight: Math.max(target.scrollHeight, target.offsetHeight, 600)
    };
  }
  async function exportTableToImage(){
    let sandbox = null;
    try {
      const html2canvas = await ensureHtml2Canvas();
      const built = buildCaptureNode();
      sandbox = built.sandbox;
      const target = built.target;
      const layout = await settleFullMonthWidth(target);
      const width = Math.ceil(layout.captureWidth);
      const height = Math.ceil(layout.captureHeight);
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width,
        height,
        windowWidth: Math.max(width, 1600),
        windowHeight: Math.max(height, 900),
        scrollX: 0,
        scrollY: 0,
        onclone: clonedDoc => {
          try {
            const clonedTarget = clonedDoc.querySelector('[data-v341-export-target="true"]');
            if (!clonedTarget) return;
            clonedTarget.style.setProperty('width', `${layout.tableWidth}px`, 'important');
            clonedTarget.style.setProperty('min-width', `${layout.tableWidth}px`, 'important');
            clonedTarget.style.setProperty('max-width', `${layout.tableWidth}px`, 'important');
            clonedTarget.style.setProperty('overflow', 'visible', 'important');
            clonedTarget.querySelectorAll('.table-wrap,.clean-grid-wrap,.schedule-export-grid-only,table').forEach(el => {
              el.style.setProperty('width', `${layout.tableWidth}px`, 'important');
              el.style.setProperty('min-width', `${layout.tableWidth}px`, 'important');
              el.style.setProperty('max-width', `${layout.tableWidth}px`, 'important');
              el.style.setProperty('overflow', 'visible', 'important');
            });
          } catch (_) {}
        }
      });
      sandbox.remove();
      sandbox = null;
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = fileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('Export รูปภาพครบทุกวันของเดือนแล้ว');
    } catch (err) {
      console.error(VERSION_V292, err);
      try {
        if (sandbox?.isConnected) sandbox.remove();
        const oldSandbox = document.querySelector('[data-v292-export-sandbox="true"]');
        if (oldSandbox) oldSandbox.remove();
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
      .v341-export-fixed-grid .clean-schedule-grid th:not(.clean-sticky-col),
      .v341-export-fixed-grid .clean-schedule-grid td{width:52px!important;min-width:52px!important;max-width:52px!important;box-sizing:border-box!important;}
      .v341-export-fixed-grid .clean-schedule-grid .clean-sticky-col{position:static!important;left:auto!important;z-index:auto!important;white-space:nowrap!important;}
      .v341-export-fixed-grid .schedule-brand-header{margin-left:0!important;margin-right:0!important;}
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
