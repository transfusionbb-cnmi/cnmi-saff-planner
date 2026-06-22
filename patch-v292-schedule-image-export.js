/* V292 Schedule image export
   - Replaces the staff schedule print button with image export.
   - Uses html2canvas with scale:2 and white background.
   - Captures a dedicated schedule wrapper without the page toolbar.
*/
(function(){
  'use strict';
  const VERSION_V292 = 'V292_SCHEDULE_IMAGE_EXPORT';

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
    const viewMap = { day:'ดูตามวัน', person:'ดูตามคน', balance:'สรุปสมดุลเวร', table:'ตารางทั้งเดือน' };
    const view = viewMap[activeScheduleView()] || activeScheduleView();
    return `schedule_${month}_${view}.png`.replace(/[\\/:*?"<>|]+/g, '-');
  }
  function fullMonthTitle(key){
    try {
      const [y,m] = String(key || '').split('-').map(Number);
      if (!y || !m) return key || '';
      const d = new Date(y, m - 1, 1);
      return d.toLocaleDateString('th-TH', { month:'long', year:'numeric' });
    } catch (_) { return key || ''; }
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
  function buildCaptureNode(){
    const source = document.getElementById('scheduleCaptureArea') || document.querySelector('.schedule-capture-area') || document.getElementById('scheduleTable');
    if (!source) throw new Error('ไม่พบตารางที่ต้องการ Export');

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

    const clone = source.cloneNode(true);
    clone.classList.add('schedule-export-clone');
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
      toast('Export ตารางเป็นรูปภาพแล้ว');
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
            <div class="schedule-export-header">
              <h3 class="schedule-export-title">ตารางเวรประจำเดือน</h3>
              <p class="schedule-export-subtitle">เดือน ${safeHtml(fullMonthTitle(key) || key)}</p>
            </div>
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
      .schedule-export-header{display:flex;flex-direction:column;gap:4px;margin:6px 0 14px 0;}
      .schedule-export-title{margin:0;font-size:1.15rem;color:#16324f;}
      .schedule-export-subtitle{margin:0;color:#5b6b7f;font-size:.95rem;}
      .schedule-export-clone .table-wrap,
      .schedule-export-clone .clean-grid-wrap{overflow:visible !important;}
    `;
    document.head.appendChild(style);
  } catch(_) {}

  console.info(`[${VERSION_V292}] loaded`);
})();
