/* =========================================================
   V254 Admin Leave Status Filter + Pending First
   - เพิ่มตัวกรอง "สถานะ" ในรายการของทุกคน เฉพาะ Admin
   - แสดงรายการที่รอ Admin อนุมัติยกเลิกก่อนรายการอื่นเสมอ
   - ไม่แก้ Logic ปีงบประมาณ V203
   - ไม่แก้ Logic บล็อก Staff ลง "ไม่รับเวร" ในวันหยุด V250
   ========================================================= */
(function(){
  'use strict';

  const VERSION_V254 = 'V254_LEAVE_STATUS_FILTER_ADMIN_FIRST';
  let leaveRenderContext254 = false;
  let lastFilteredCount254 = null;
  let lastPendingCount254 = 0;

  function isAdmin254(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }

  function state254(){
    try { if (typeof state !== 'undefined' && state) return state; } catch (_) {}
    return window.state || null;
  }

  function rawLeaveStatus254(row){
    try {
      if (typeof leaveStatusText === 'function') return String(leaveStatusText(row) || '').trim();
    } catch (_) {}
    return String(row?.status || row?.approval_status || 'active').trim();
  }

  function isPendingAdmin254(row){
    try {
      if (typeof isLeaveCancellationRequested === 'function' && isLeaveCancellationRequested(row)) return true;
    } catch (_) {}
    const raw = rawLeaveStatus254(row);
    const st = raw.toLowerCase();
    return [
      'รออนุมัติยกเลิก',
      'รอ admin อนุมัติยกเลิก',
      'รอแอดมินอนุมัติยกเลิก',
      'รออนุมัติ',
      'รอ admin อนุมัติ',
      'รอแอดมินอนุมัติ',
      'cancel_requested',
      'pending_cancel',
      'pending_cancellation',
      'pending',
      'pending_approval',
      'waiting_approval'
    ].includes(st);
  }

  function isInactive254(row){
    try {
      if (typeof isLeaveFinalInactive === 'function') return !!isLeaveFinalInactive(row);
    } catch (_) {}
    const raw = rawLeaveStatus254(row);
    const st = raw.toLowerCase();
    return [
      'cancelled', 'canceled', 'deleted', 'inactive', 'void', 'rejected',
      'ยกเลิกแล้ว', 'ลบทิ้ง', 'ไม่อนุมัติ'
    ].includes(st);
  }

  function leaveStatusGroup254(row){
    if (isPendingAdmin254(row)) return 'pending_admin';
    if (isInactive254(row)) return 'cancelled';
    const raw = rawLeaveStatus254(row).toLowerCase();
    if (!raw || ['active', 'approved', 'ใช้งาน', 'อนุมัติแล้ว'].includes(raw)) return 'active';
    return 'other';
  }

  function dateSortKey254(row){
    return String(
      row?.updated_at || row?.created_at || row?.start_date || row?.end_date || ''
    );
  }

  function sortLeaveRows254(rows){
    const priority = { pending_admin: 0, active: 1, other: 2, cancelled: 3 };
    return (rows || []).slice().sort((a, b) => {
      const pa = priority[leaveStatusGroup254(a)] ?? 9;
      const pb = priority[leaveStatusGroup254(b)] ?? 9;
      if (pa !== pb) return pa - pb;
      return dateSortKey254(b).localeCompare(dateSortKey254(a));
    });
  }

  function filteredByStatus254(rows){
    const selected = String(state254()?.leaveFilterStatus || '').trim();
    const source = rows || [];
    lastPendingCount254 = source.filter(isPendingAdmin254).length;
    const filtered = selected
      ? source.filter(row => leaveStatusGroup254(row) === selected)
      : source.slice();
    lastFilteredCount254 = filtered.length;
    return sortLeaveRows254(filtered);
  }

  const previousRenderLeaveTable254 = window.renderLeaveTable || (typeof renderLeaveTable === 'function' ? renderLeaveTable : null);
  if (previousRenderLeaveTable254) {
    const patchedRenderLeaveTable254 = function renderLeaveTableV254(rows){
      if (!leaveRenderContext254 || !isAdmin254()) {
        return previousRenderLeaveTable254.apply(this, arguments);
      }
      const adjusted = filteredByStatus254(rows);
      return previousRenderLeaveTable254.call(this, adjusted);
    };
    window.renderLeaveTable = patchedRenderLeaveTable254;
    try { renderLeaveTable = patchedRenderLeaveTable254; } catch (_) {}
  }

  function statusFilterHtml254(){
    const current = String(state254()?.leaveFilterStatus || '').trim();
    const selected = value => current === value ? 'selected' : '';
    return `<label>สถานะ
      <select id="leaveFilterStatus">
        <option value="" ${selected('')}>ทั้งหมด</option>
        <option value="pending_admin" ${selected('pending_admin')}>รอ Admin อนุมัติยกเลิก (${lastPendingCount254})</option>
        <option value="active" ${selected('active')}>ใช้งานอยู่</option>
        <option value="cancelled" ${selected('cancelled')}>ยกเลิกแล้ว</option>
        <option value="other" ${selected('other')}>สถานะอื่น</option>
      </select>
    </label>`;
  }

  function injectStatusFilter254(html){
    let out = String(html || '');
    if (!isAdmin254() || !out.includes('leave-filter-bar')) return out;

    if (!out.includes('id="leaveFilterStatus"')) {
      out = out.replace(
        /(<div class="leave-filter-bar compact-filter">)([\s\S]*?)(<\/div>)/i,
        (match, open, body, close) => `${open}${body}${statusFilterHtml254()}${close}`
      );
    }

    if (Number.isFinite(lastFilteredCount254)) {
      out = out.replace(
        /แสดง\s+\d+\s*\/\s*(\d+)\s+รายการ/,
        (_, total) => `แสดง ${lastFilteredCount254} / ${total} รายการ`
      );
    }

    if (lastPendingCount254 > 0 && !out.includes('data-v254-pending-admin-summary')) {
      const summary = `<div class="notice soft-notice v254-pending-admin-summary" data-v254-pending-admin-summary>
        <b>รอ Admin อนุมัติยกเลิก ${lastPendingCount254} รายการ</b>
        <span>ระบบเรียงรายการเหล่านี้ไว้ด้านบนก่อนแล้ว</span>
      </div>`;
      out = out.replace(
        /(<div class="leave-filter-bar compact-filter">[\s\S]*?<\/div>)/i,
        `$1${summary}`
      );
    }

    return out;
  }

  const previousRenderLeavePage254 = window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null);
  if (previousRenderLeavePage254) {
    const patchedRenderLeavePage254 = function renderLeavePageV254(){
      leaveRenderContext254 = true;
      lastFilteredCount254 = null;
      lastPendingCount254 = 0;
      try {
        return injectStatusFilter254(previousRenderLeavePage254.apply(this, arguments));
      } finally {
        leaveRenderContext254 = false;
      }
    };
    window.renderLeavePage = patchedRenderLeavePage254;
    try { renderLeavePage = patchedRenderLeavePage254; } catch (_) {}
  }

  document.addEventListener('change', function(event){
    const target = event.target;
    if (!target || target.id !== 'leaveFilterStatus') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const appState = state254();
    if (!appState) return;
    appState.leaveFilterStatus = target.value || '';
    try {
      if (typeof renderPage === 'function') renderPage();
    } catch (err) {
      console.error(`[${VERSION_V254}] cannot render after status filter change`, err);
    }
  }, true);

  const style = document.createElement('style');
  style.setAttribute('data-v254-leave-status-style', '');
  style.textContent = `
    .v254-pending-admin-summary{
      display:flex;
      gap:10px;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      margin:-2px 0 12px;
      border-color:#fed7aa;
      background:#fff7ed;
      color:#9a3412;
    }
    .v254-pending-admin-summary span{font-size:.88rem;font-weight:600;}
    @media(max-width:820px){
      .v254-pending-admin-summary{align-items:flex-start;}
    }
  `;
  document.head.appendChild(style);

  console.info(`[${VERSION_V254}] admin leave status filter and pending-first sorting loaded`);
})();
