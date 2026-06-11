/* v131: Ch4 two-slot regression fix + update-password callback + compact grid leave/status UI
   Scope: หน้าแอดมินจัดเวร/ตั้งต้นเวร, หน้า reset/invite callback, หน้า Grid ตารางเวรรายเดือน */
(function(){
  'use strict';

  const log = (...args) => console.warn('[v131]', ...args);
  const safe = (fn, fallback) => { try { return fn(); } catch(e) { log(e); return fallback; } };
  const html = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])));
  const pad2 = (n) => (typeof pad === 'function' ? pad(n) : String(n).padStart(2,'0'));

  // ---------- Shared helpers ----------
  function dutyHeaderLabel(code){
    if (code === 'ช4A') return 'ช4 (1)';
    if (code === 'ช4B') return 'ช4 (2)';
    return html((window.DUTY_LABEL && DUTY_LABEL[code]) || code || '-');
  }
  function dutyStaffLabel(code){
    const raw = String(code || '');
    if (raw === 'ช4A' || raw === 'ช4B' || raw.startsWith('ช4')) return 'ช4';
    return html((window.DUTY_LABEL && DUTY_LABEL[raw]) || raw || '-');
  }
  function allLeaveRows(){
    return Array.isArray(state?.leaves) ? state.leaves : (Array.isArray(state?.leaveRequests) ? state.leaveRequests : []);
  }
  function rowStatusActive(r){
    const st = String(r?.status || r?.approval_status || '').toLowerCase();
    return !/(cancel|reject|denied|ยกเลิก|ไม่อนุมัติ)/i.test(st);
  }
  function rowType(r){
    return String(r?.type || r?.request_type || r?.leave_type || r?.category || r?.reason || '').trim();
  }
  function dateInRow(r, date){
    if (!r || !date) return false;
    const start = String(r.start_date || r.leave_date || r.duty_date || r.date || '').slice(0,10);
    const end = String(r.end_date || r.leave_date || r.duty_date || r.date || start).slice(0,10);
    if (!start) return false;
    return start <= date && date <= (end || start);
  }
  function leaveRowsFor(staffId, date){
    return allLeaveRows().filter(r => String(r.staff_id || '') === String(staffId || '') && rowStatusActive(r) && dateInRow(r, date));
  }
  function isLongTermStaff(staff){
    return !!(staff?.isLongTermLeave || staff?.is_long_term_leave || staff?.long_term_leave || staff?.maternity_status || staff?.maternity_leave);
  }
  function leaveBadgeFor(staff, date){
    if (!staff) return '';
    if (isLongTermStaff(staff)) return '<span class="cnmi-v131-status cnmi-v131-mat">ลาคลอด</span>';
    const rows = leaveRowsFor(staff.id, date);
    const mat = rows.find(r => /ลาคลอด|maternity|ระยะยาว|long/i.test(rowType(r)));
    if (mat) return '<span class="cnmi-v131-status cnmi-v131-mat">ลาคลอด</span>';
    const noduty = rows.find(r => /ไม่รับเวร|no\s*duty|unavailable/i.test(rowType(r)));
    if (noduty) return '<span class="cnmi-v131-status cnmi-v131-noduty">ไม่รับเวร</span>';
    const sick = rows.find(r => /ลาป่วย|sick/i.test(rowType(r)));
    if (sick) return '<span class="cnmi-v131-status cnmi-v131-sick">ลาป่วย</span>';
    const personal = rows.find(r => /ลากิจ|personal/i.test(rowType(r)));
    if (personal) return '<span class="cnmi-v131-status cnmi-v131-personal">ลากิจ</span>';
    const vacation = rows.find(r => /ลาพัก|พักผ่อน|vacation|annual/i.test(rowType(r)));
    if (vacation) return '<span class="cnmi-v131-status cnmi-v131-vacation">ลาพักผ่อน</span>';
    const any = rows[0];
    return any ? `<span class="cnmi-v131-status cnmi-v131-leave">${html(rowType(any) || 'ลา')}</span>` : '';
  }
  function isHolidayLike(date){ return safe(() => isWeekend(date) || isHolidayDate(date), false); }
  function dayHeader(y,m,day){
    const date = `${y}-${pad2(m)}-${pad2(day)}`;
    const dow = safe(() => parseDate(date).toLocaleDateString('th-TH', { weekday:'short' }), '');
    const cls = isHolidayLike(date) ? 'cnmi-v131-holiday-col' : '';
    const title = safe(() => isHolidayDate(date) ? holidayName(date) : dow, dow);
    return `<th class="${cls}" title="${html(title)}"><b>${day}</b><br><span>${html(dow)}</span></th>`;
  }
  function shiftPill(slot, staff){
    if (!slot || !slot.staff_id) return '';
    const bg = safe(() => staffColor(staff || slot.staff_id), '#e8f3ff');
    const fg = safe(() => textColorFor(bg), '#203245');
    const label = dutyStaffLabel(slot.duty_code);
    const title = `${html(staff?.nickname || staff?.full_name || '')} ${label} ${html(slot.duty_date || '')}`;
    const slotId = html(slot.id || slot._temp_id || '');
    const attrs = slot.id ? `type="button" data-trade-duty="${slotId}"` : `type="button" data-roster-slot-view="${slotId}"`;
    return `<button class="cnmi-v131-shift-pill" ${attrs} style="--staff-bg:${bg};--staff-fg:${fg}" title="${title}">${label}</button>`;
  }

  // ---------- Part 1: Admin roster grid must keep ช4 as two separate columns ----------
  window.renderRosterGrid = function(assignments){
    if (!assignments?.length) return typeof empty === 'function' ? empty('กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร') : '<div>ยังไม่มีตารางร่าง</div>';
    const { y, m } = getMonthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    const columns = Array.isArray(window.DUTY_COLUMNS) ? DUTY_COLUMNS : ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT'];
    const desktopTable = `<div class="table-wrap roster-table-wrap cnmi-v131-roster-admin-wrap"><table class="roster-table cnmi-v131-roster-admin"><thead><tr><th>วันที่</th>${columns.map(c => `<th>${dutyHeaderLabel(c)}</th>`).join('')}</tr></thead><tbody>
      ${Array.from({length:last}, (_,i)=>i+1).map(day => {
        const date = `${y}-${pad2(m)}-${pad2(day)}`;
        const dow = safe(() => parseDate(date).toLocaleDateString('th-TH', { weekday:'short' }), '');
        return `<tr><td class="cnmi-v131-date-cell"><b>${day}</b><br><span class="muted">${html(dow)}</span>${safe(() => isHolidayDate(date), false) ? `<br><span class="badge yellow">${html(holidayName(date))}</span>` : ''}</td>${columns.map(code => {
          if (!allowedDutyCodesForDate(date).includes(code)) return '<td class="muted">-</td>';
          const slot = assignments.find(a => a.duty_date === date && a.duty_code === code);
          if (!slot) return '<td class="muted">-</td>';
          const id = html(slot.id || slot._temp_id);
          return `<td><div class="roster-slot ${slot.is_locked?'locked':''}" data-drop-slot="${id}">
            <div class="assigned-name">${slot.staff_id ? staffPill(slot.staff_id) : 'ยังไม่จัด'}</div>
            <div class="slot-meta">${html(slot.required_role)} ${slot.is_locked?'• locked':''}</div>
            <select class="mobile-roster-select" data-roster-slot-select="${id}" ${slot.is_locked?'disabled':''}><option value="">ยังไม่จัด</option>${staffOptionList(slot.staff_id, st => canStaffWorkSlot(st.id, slot))}</select>
            <div class="actions"><button class="tiny-btn" data-clear-slot="${id}">ล้าง</button><button class="tiny-btn" data-toggle-lock-slot="${id}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button></div>
          </div></td>`;
        }).join('')}</tr>`;
      }).join('')}
    </tbody></table></div>`;
    return desktopTable + (typeof renderRosterMobileGrid === 'function' ? renderRosterMobileGrid(assignments, y, m, last) : '');
  };

  // ---------- Part 3: Staff grid compact UI + staff color first column + leave statuses ----------
  function renderScheduleMatrixV131(assignments, opts={}){
    const { y, m } = getMonthRange(state.monthKey);
    const last = new Date(y, m, 0).getDate();
    const days = Array.from({length:last}, (_,i)=>i+1);
    const active = orderedStaff(state.staff.filter(s => isRosterEnabled(s)));
    const tableId = opts.tableId || 'scheduleTable';
    if (!active.length) return typeof empty === 'function' ? empty('ยังไม่มีรายชื่อเจ้าหน้าที่') : '<div>ยังไม่มีรายชื่อเจ้าหน้าที่</div>';

    return `<div class="table-wrap cnmi-v131-grid-wrap ${opts.mobile ? 'cnmi-v131-mobile-wrap' : 'desktop-schedule-table'}">
      <table id="${tableId}" class="schedule-person-matrix cnmi-v131-schedule-grid">
        <thead><tr><th class="cnmi-v131-sticky-staff-col">เจ้าหน้าที่</th>${days.map(day => dayHeader(y,m,day)).join('')}</tr></thead>
        <tbody>${active.map((staff, rowIdx) => {
          const bg = safe(() => staffColor(staff), '#f7fafc');
          const fg = safe(() => textColorFor(bg), '#203245');
          return `<tr class="${rowIdx % 2 ? 'cnmi-zebra-row' : ''}">
            <th class="cnmi-v131-sticky-staff-col cnmi-v131-staff-cell" style="--staff-bg:${bg};--staff-fg:${fg}"><span class="cnmi-v131-staff-name">${html(staff.nickname || staff.full_name || '-')}</span></th>
            ${days.map(day => {
              const date = `${y}-${pad2(m)}-${pad2(day)}`;
              const holidayCls = isHolidayLike(date) ? 'cnmi-v131-holiday-col' : '';
              const slots = (assignments || []).filter(a => String(a.staff_id) === String(staff.id) && a.duty_date === date);
              const status = leaveBadgeFor(staff, date);
              const content = slots.length ? slots.map(slot => shiftPill(slot, staff)).join('') + status : status;
              return `<td class="${holidayCls}">${content || ''}</td>`;
            }).join('')}
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  window.renderSchedulePersonMatrix = function(assignments){
    return renderScheduleMatrixV131(assignments, { mobile:true, tableId:'scheduleTableMobile' });
  };
  window.renderReadOnlySchedule = function(assignments){
    const desktop = renderScheduleMatrixV131(assignments || [], { tableId:'scheduleTable' });
    const mobile = `<div class="mobile-schedule-view">${typeof renderMobileScheduleView === 'function' ? renderMobileScheduleView(assignments || []) : ''}</div>`;
    return desktop + mobile;
  };

  // ---------- Part 2: Auth invite/recovery callback -> /update-password + link staff_profiles.user_id ----------
  function updatePasswordPath(){
    const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    // ถ้าอยู่ root ของโปรเจกต์แล้ว ให้ไปโฟลเดอร์ update-password/ ใต้ path ปัจจุบัน
    const root = window.location.pathname.endsWith('/') ? (window.location.origin + window.location.pathname) : base;
    return root.replace(/\/?$/, '/') + 'update-password/';
  }
  window.authRedirectUrl = function(mode=''){
    const url = mode === 'recovery' || mode === 'set-password' || mode === 'invite' ? updatePasswordPath() : (window.location.origin + (window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/'));
    return mode ? `${url}?mode=${encodeURIComponent(mode)}` : url;
  };

  async function linkCurrentAuthUserToProfile(session){
    const user = session?.user || state?.session?.user;
    if (!user?.id || !user?.email || !window.sb) return;
    // ใช้ RPC ก่อน เพราะปลอดภัยกว่าและทำงานได้แม้ RLS กัน update แถวที่ user_id ยังเป็น null
    try {
      const rpc = await sb.rpc('link_profile_to_current_user_v131');
      if (!rpc.error) return rpc.data;
    } catch(_){ /* fallback ด้านล่าง */ }
    try {
      const { error } = await sb.from('staff_profiles')
        .update({ user_id: user.id })
        .is('user_id', null)
        .ilike('email', user.email);
      if (error) console.warn('[v131] fallback profile link failed', error.message);
    } catch(e){ console.warn('[v131] fallback profile link failed', e); }
  }
  window.cnmiLinkCurrentAuthUserToProfileV131 = linkCurrentAuthUserToProfile;

  // ดัก invite/recovery ที่เปิดจาก /update-password แล้วให้แสดงฟอร์มตั้งรหัสผ่านเสมอ
  document.addEventListener('DOMContentLoaded', () => {
    const raw = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}`;
    const isUpdatePasswordRoute = /\/update-password\/?/i.test(window.location.pathname) || /mode=(recovery|set-password|invite)/i.test(raw) || /type=(recovery|invite|password_recovery)/i.test(raw);
    const loginName = document.getElementById('recoveryLoginName');
    if (loginName) {
      loginName.removeAttribute('required');
      loginName.placeholder = 'เว้นว่างได้ ถ้าเคยมีชื่อผู้ใช้อยู่แล้ว';
      const label = loginName.closest('label');
      if (label) label.classList.add('cnmi-v131-login-name-optional');
    }
    if (isUpdatePasswordRoute && typeof showResetPasswordPanel === 'function') {
      setTimeout(() => showResetPasswordPanel(), 0);
    }
    if (window.sb?.auth) {
      sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          state.session = session || state.session;
          if (/PASSWORD_RECOVERY|SIGNED_IN/.test(event) && isUpdatePasswordRoute && typeof showResetPasswordPanel === 'function') showResetPasswordPanel();
          if (session?.user) await linkCurrentAuthUserToProfile(session);
        }
      });
    }
  });

  // จับ submit แบบ capture เพื่อกัน handler เก่าที่บังคับ username และเพื่อ link user_id หลังตั้ง password สำเร็จ
  document.addEventListener('submit', async (e) => {
    if (e.target?.id !== 'resetPasswordForm') return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const password = document.getElementById('newPassword')?.value || '';
    const loginName = String(document.getElementById('recoveryLoginName')?.value || '').trim();
    if (!password || password.length < 6) return showToast('กรุณากรอกรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร', { tone:'error' });
    setBusy(true, 'กำลังตั้งรหัสผ่านใหม่');
    try {
      const before = await sb.auth.getSession();
      const email = before?.data?.session?.user?.email || state?.session?.user?.email || '';
      if (!email) throw new Error('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');
      if (loginName) {
        let r = await sb.rpc('set_initial_login_name_v56', { p_email: email, p_login_name: loginName });
        if (r.error) r = await sb.rpc('set_initial_login_name_v44', { p_email: email, p_login_name: loginName });
        if (r.error) throw r.error;
      }
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      const now = await sb.auth.getSession();
      state.session = now?.data?.session || state.session;
      await linkCurrentAuthUserToProfile(state.session);
      if (window.history?.replaceState) window.history.replaceState({}, document.title, window.location.pathname.replace(/update-password\/?$/,'') || './');
      showToast('ตั้งรหัสผ่านใหม่และผูกบัญชีเรียบร้อยแล้ว');
      await enterApp();
    } catch(err) {
      showToast(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ', { tone:'error' });
    } finally { setBusy(false); }
  }, true);

  window.exportScheduleExcel = function(){
    if (typeof exportTable === 'function') return exportTable('scheduleTable', `Roster_${state.monthKey}.xlsx`);
  };
})();
