/* CNMI Staff Planner Patch V56
   1) กิจกรรมหน่วยงาน: ปรับรายการกิจกรรมให้เรียงวันที่ + มีตัวกรองเดือน/ประเภท/ผู้รับผิดชอบ และแสดงแบบ Card อ่านง่าย
   2) คำขอแก้ไขข้อมูลส่วนตัว: โหลด/แสดงคำขอให้ชัดทั้ง Staff และ Admin, หน้า Admin แสดงเฉพาะ pending, เพิ่มหน้าสรุปคำขอที่ตรวจแล้ว
   3) อนุมัติชื่อผู้ใช้แล้ว login ได้: ใช้ RPC V56 และ override resolveLoginIdentifier ให้ค้นชื่อผู้ใช้จาก staff_profiles
*/
(function () {
  const PATCH = 'V56_ACTIVITY_PROFILE_LOGIN_FIX';

  function n(v) { return String(v ?? '').trim(); }
  function l(v) { return n(v).toLowerCase(); }
  function same(a, b) { return n(a) !== '' && n(a) === n(b); }
  function getStaffId() {
    try { return n(currentStaffId && currentStaffId()); } catch (e) { return n(state?.profile?.id); }
  }
  function getUserId() { return n(state?.session?.user?.id); }
  function getUserEmail() { return l(state?.profile?.email || state?.session?.user?.email); }
  function isAdminSafe() { try { return !!isAdmin(); } catch (e) { return state?.profile?.role === 'admin'; } }
  function requestStatus(row) { return l(row?.status || 'pending') || 'pending'; }
  function statusText(s) { return ({ pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ' }[l(s)] || s || '-'); }
  function statusBadge(s) { return l(s) === 'approved' ? 'green' : l(s) === 'rejected' ? 'red' : 'orange'; }
  function fieldText(f) { return ({ phone:'เบอร์โทร', login_name:'ชื่อผู้ใช้', nickname:'ชื่อเล่น', full_name:'ชื่อ-สกุล' }[n(f)] || f || '-'); }
  function staffByAny(row) {
    const ids = [row?.staff_id, row?.requested_by, row?.reviewed_by].map(n).filter(Boolean);
    const email = l(row?.email || row?.user_email || row?.request_email || row?.requester_email);
    return (state.staff || []).find(s => ids.includes(n(s.id)) || ids.includes(n(s.user_id)) || (!!email && l(s.email) === email)) || null;
  }
  function reviewerName(row) {
    const reviewer = (state.staff || []).find(s => same(s.id, row?.reviewed_by) || same(s.user_id, row?.reviewed_by));
    return reviewer ? staffPill(reviewer) : '-';
  }
  function isMine(row) {
    const myStaffId = getStaffId();
    const myUserId = getUserId();
    const myEmail = getUserEmail();
    const st = staffByAny(row);
    return same(row?.staff_id, myStaffId) || same(row?.requested_by, myStaffId) ||
      same(row?.staff_id, myUserId) || same(row?.requested_by, myUserId) ||
      same(st?.id, myStaffId) || same(st?.user_id, myUserId) ||
      (!!myEmail && (l(st?.email) === myEmail || l(row?.email || row?.user_email || row?.request_email || row?.requester_email) === myEmail));
  }
  function addOnce(list, seen, rows) {
    (rows || []).forEach(r => {
      if (!r) return;
      const key = r.id || `${r.staff_id||''}|${r.requested_by||''}|${r.field_name||''}|${r.new_value||''}|${r.created_at||''}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push(r);
    });
  }
  async function rpc(name, args) {
    try {
      const res = await sb.rpc(name, args || {});
      if (res && !res.error) return res.data || [];
      console.warn(`[${PATCH}] ${name} skipped`, res?.error?.message || res?.error);
    } catch (err) {
      console.warn(`[${PATCH}] ${name} failed`, err);
    }
    return [];
  }

  window.loadProfileChangeRequests = async function loadProfileChangeRequestsV56() {
    const staffId = getStaffId() || null;
    const userId = getUserId() || null;
    const email = getUserEmail() || null;
    const admin = isAdminSafe();
    const rows = [];
    const seen = new Set();

    addOnce(rows, seen, await rpc('list_profile_change_requests_v56', {
      p_staff_id: staffId,
      p_user_email: email,
      p_user_id: userId,
      p_is_admin: admin
    }));

    // fallback เผื่อยังไม่ได้ Run SQL V56 แต่ RLS เปิดให้อ่านได้แล้ว
    if (!rows.length) {
      for (const fn of ['list_profile_change_requests_v54','list_profile_change_requests_v52','list_profile_change_requests_v51','list_profile_change_requests_v50','list_profile_change_requests_v47']) {
        const args = fn.endsWith('_v47') ? { p_staff_id: staffId, p_is_admin: admin } : { p_staff_id: staffId, p_user_email: email, p_user_id: userId, p_is_admin: admin };
        const got = await rpc(fn, args);
        addOnce(rows, seen, got);
        if (got && got.length) break;
      }
    }

    try {
      const direct = await sb.from('profile_change_requests').select('*').order('created_at', { ascending:false });
      if (!direct.error) addOnce(rows, seen, direct.data || []);
      else console.warn(`[${PATCH}] direct profile_change_requests skipped`, direct.error.message || direct.error);
    } catch (err) {
      console.warn(`[${PATCH}] direct profile_change_requests failed`, err);
    }

    rows.sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    state.profileChangeRequests = admin ? rows : rows.filter(isMine);
    console.info(`[${PATCH}] profile requests loaded`, { total: rows.length, visible: state.profileChangeRequests.length, admin, staffId, userId, email });
    return state.profileChangeRequests;
  };

  function profileRequestCard(row, mode) {
    const st = staffByAny(row);
    const status = requestStatus(row);
    const title = mode === 'admin'
      ? (st ? staffPill(st) : `<span class="staff-color-pill">${escapeHtml(row.email || row.user_email || row.request_email || 'ไม่พบชื่อ')}</span>`)
      : fieldText(row.field_name);
    const actions = mode === 'admin' && status === 'pending'
      ? `<div class="actions"><button class="primary-btn" data-approve-profile-request="${row.id}">อนุมัติ</button><button class="ghost-btn danger" data-reject-profile-request="${row.id}">ไม่อนุมัติ</button></div>`
      : `<div class="muted">ผู้ตรวจ: ${reviewerName(row)} ${formatThaiDateTime(row.reviewed_at)}</div>${row.review_note ? `<div><b>หมายเหตุ Admin:</b> ${escapeHtml(row.review_note)}</div>` : ''}`;
    return `<div class="mobile-card profile-request-card">
      <div class="mobile-day-head"><h3>${title}</h3>${badge(statusText(status), statusBadge(status))}</div>
      ${mode === 'admin' ? `<div><b>ขอแก้:</b> ${escapeHtml(fieldText(row.field_name))}</div>` : ''}
      <div><b>ค่าเดิม:</b> ${escapeHtml(row.old_value || '-')}</div>
      <div><b>ค่าใหม่:</b> ${escapeHtml(row.new_value || '-')}</div>
      <div><b>เหตุผล/หมายเหตุ:</b> ${escapeHtml(row.note || '-')}</div>
      <div class="muted">ส่งเมื่อ ${formatThaiDateTime(row.created_at)}</div>
      ${actions}
    </div>`;
  }

  window.renderMyProfilePage = function renderMyProfilePageV56() {
    const p = state.profile || {};
    const myReqs = (state.profileChangeRequests || []).filter(isMine).slice(0, 20);
    return `<div class="grid grid-2" id="myProfilePage">
      <div class="card">
        <div class="section-title"><h3>ข้อมูลส่วนตัว</h3></div>
        <p class="muted">ข้อมูลจริงใช้จากตารางผู้ใช้งาน ถ้าต้องการแก้ ให้ส่งคำขอให้ Admin อนุมัติ</p>
        <div class="profile-info-row"><span>ชื่อเล่น</span><b>${escapeHtml(p.nickname || '-')}</b></div>
        <div class="profile-info-row"><span>ชื่อ-สกุล</span><b>${escapeHtml(p.full_name || '-')}</b></div>
        <div class="profile-info-row"><span>เบอร์โทร</span><b>${escapeHtml(p.phone || '-')}</b></div>
        <div class="profile-info-row"><span>Email</span><b>${escapeHtml(p.email || '-')}</b></div>
        <div class="profile-info-row"><span>ชื่อผู้ใช้</span><b>${escapeHtml(p.login_name || '-')}</b></div>
        <form id="profileChangeForm" class="form-grid compact-form">
          <label>ต้องการแก้ไข <select name="field_name" required><option value="phone">เบอร์โทร</option><option value="login_name">ชื่อผู้ใช้</option><option value="nickname">ชื่อเล่น</option><option value="full_name">ชื่อ-สกุล</option></select></label>
          <label>ข้อมูลใหม่ <input name="new_value" required placeholder="กรอกข้อมูลใหม่"></label>
          <label class="wide">เหตุผล/หมายเหตุ <textarea name="note" placeholder="เช่น เปลี่ยนเบอร์โทร / สะกดชื่อผิด"></textarea></label>
          <button class="primary-btn wide" type="submit">ส่งคำขอให้ Admin อนุมัติ</button>
        </form>
      </div>
      <div class="card">
        <div class="section-title"><h3>คำขอล่าสุดของฉัน</h3><button class="ghost-btn" type="button" data-refresh-profile-requests>รีเฟรช</button></div>
        <div class="mobile-cards always-cards">${myReqs.length ? myReqs.map(r => profileRequestCard(r, 'me')).join('') : empty('ยังไม่มีคำขอ')}</div>
      </div>
    </div>`;
  };

  window.renderProfileRequestsPage = function renderProfileRequestsPageV56() {
    if (!isAdminSafe()) return noPermission();
    const pendingRows = (state.profileChangeRequests || []).filter(r => requestStatus(r) === 'pending');
    return `<div class="card">
      <div class="section-title"><div><h3>คำขอแก้ไขข้อมูลส่วนตัว</h3><p class="hint">แสดงเฉพาะรายการที่รออนุมัติ รายการที่ตรวจแล้วให้ดูที่เมนู “สรุปคำขอแก้ไขข้อมูลส่วนตัว”</p></div><button class="ghost-btn" type="button" data-refresh-profile-requests>รีเฟรชคำขอ</button></div>
    </div>
    <div class="mobile-cards always-cards">${pendingRows.length ? pendingRows.map(r => profileRequestCard(r, 'admin')).join('') : empty('ยังไม่มีคำขอที่รออนุมัติ')}</div>`;
  };

  window.renderProfileRequestsSummaryPage = function renderProfileRequestsSummaryPageV56() {
    if (!isAdminSafe()) return noPermission();
    const month = state.profileRequestSummaryMonth || todayStr().slice(0,7);
    const staffId = state.profileRequestSummaryStaffId || '';
    const done = (state.profileChangeRequests || []).filter(r => requestStatus(r) !== 'pending')
      .filter(r => !month || String(r.reviewed_at || r.created_at || '').slice(0,7) === month)
      .filter(r => !staffId || same(staffByAny(r)?.id, staffId) || same(r.staff_id, staffId) || same(r.requested_by, staffId));
    return `<div class="card">
      <div class="section-title"><h3>สรุปคำขอแก้ไขข้อมูลส่วนตัว</h3><button class="ghost-btn" type="button" data-refresh-profile-requests>รีเฟรช</button></div>
      <div class="toolbar">
        <label>คน <select id="profileSummaryStaff"><option value="">ทุกคน</option>${orderedStaff(state.staff || []).map(s => `<option value="${s.id}" ${staffId===s.id?'selected':''}>${escapeHtml(s.nickname || s.full_name)}</option>`).join('')}</select></label>
        <label>เดือน <input id="profileSummaryMonth" type="month" value="${month}"></label>
      </div>
    </div>
    <div class="mobile-cards always-cards">${done.length ? done.map(r => profileRequestCard(r, 'summary')).join('') : empty('ยังไม่มีรายการที่ตรวจแล้วในเงื่อนไขนี้')}</div>`;
  };

  const oldReview = window.reviewProfileChangeRequest;
  window.reviewProfileChangeRequest = async function reviewProfileChangeRequestV56(id, status) {
    if (!isAdminSafe()) return showToast('เฉพาะ Admin เท่านั้น');
    const req = (state.profileChangeRequests || []).find(r => same(r.id, id));
    if (!req) return showToast('ไม่พบคำขอ');
    let note = '';
    if (status === 'rejected') note = await promptDialog('เหตุผลที่ไม่อนุมัติ (ถ้ามี)', 'ไม่อนุมัติคำขอ') || '';
    setBusy(true, 'กำลังบันทึกผลตรวจ');
    let res = await sb.rpc('review_profile_change_request_v56', { p_request_id: id, p_status: status, p_review_note: note || null });
    if (res.error) {
      console.warn(`[${PATCH}] review_profile_change_request_v56 failed`, res.error.message || res.error);
      if (oldReview) {
        setBusy(false);
        return oldReview(id, status);
      }
      setBusy(false);
      return showToast(friendlyDbError(res.error));
    }
    setBusy(false);
    await loadProfile();
    await loadAllData();
    await loadProfileChangeRequests();
    renderPage();
    showToast(status === 'approved' ? 'อนุมัติและอัปเดตข้อมูลแล้ว' : 'บันทึกไม่อนุมัติแล้ว', { tone:'success', title:'สำเร็จ' });
  };

  const oldSaveProfile = window.saveProfileChangeRequest;
  window.saveProfileChangeRequest = async function saveProfileChangeRequestV56(form) {
    const fd = new FormData(form);
    const field = n(fd.get('field_name'));
    const newValue = n(fd.get('new_value'));
    if (!['phone','login_name','nickname','full_name'].includes(field)) return showToast('เลือกข้อมูลที่ต้องการแก้ไขไม่ถูกต้อง');
    if (!newValue) return showToast('กรุณากรอกข้อมูลใหม่');
    if (field === 'login_name' && !/^[a-zA-Z0-9._-]{1,30}$/.test(newValue)) return showToast('ชื่อผู้ใช้ควรเป็นอังกฤษ/ตัวเลข เช่น user หรือ gift123 หรือ 012345');
    setBusy(true, 'กำลังส่งคำขอ');
    const res = await sb.rpc('submit_profile_change_request_v56', { p_field_name: field, p_new_value: newValue, p_note: fd.get('note') || null });
    setBusy(false);
    if (res.error) {
      console.warn(`[${PATCH}] submit_profile_change_request_v56 failed`, res.error.message || res.error);
      if (oldSaveProfile) return oldSaveProfile(form);
      return showToast(friendlyDbError(res.error));
    }
    form.reset();
    await loadProfileChangeRequests();
    renderPage();
    showToast('ส่งคำขอให้ Admin แล้ว', { tone:'success', title:'สำเร็จ' });
  };

  // หลัง Admin อนุมัติชื่อผู้ใช้ ให้ login ด้วยชื่อผู้ใช้ได้ทันที
  window.resolveLoginIdentifier = async function resolveLoginIdentifierV56(loginId) {
    const raw = n(loginId);
    if (!raw) return raw;
    if (raw.includes('@')) return raw;
    const username = raw.toLowerCase();
    const res = await sb.from('staff_profiles').select('email, login_name, is_active').ilike('login_name', username).eq('is_active', true).limit(1);
    if (res.error) {
      console.warn(`[${PATCH}] resolve login_name failed`, res.error.message || res.error);
      return raw;
    }
    return res.data?.[0]?.email || raw;
  };

  function sortedActivities() {
    const rows = [...(state.activities || [])];
    return rows.sort((a,b) => {
      const ad = String(a.start_date || '9999-99-99') + ' ' + String(a.start_time || '99:99');
      const bd = String(b.start_date || '9999-99-99') + ' ' + String(b.start_time || '99:99');
      return ad.localeCompare(bd);
    });
  }
  function activityMatchesFilters(r) {
    const m = state.activityFilterMonth || todayStr().slice(0,7);
    const type = state.activityFilterType || '';
    const owner = state.activityFilterOwner || '';
    const sMonth = String(r.start_date || '').slice(0,7);
    const eMonth = String(r.end_date || r.start_date || '').slice(0,7);
    return (!m || sMonth === m || eMonth === m) && (!type || r.event_type === type) && (!owner || r.owner_id === owner);
  }
  function activityParticipantNames(r) {
    const ids = asArray(r.participant_ids);
    if (!ids.length) return '-';
    return ids.map(id => staffNick(id)).filter(Boolean).join(', ') || '-';
  }
  function activityCard(r) {
    const canEdit = isAdminSafe() || r.created_by === getStaffId() || r.owner_id === getStaffId();
    const time = [r.start_time, r.end_time].filter(Boolean).join(' - ');
    return `<div class="mobile-card activity-list-card">
      <div class="mobile-day-head"><h3>${escapeHtml(r.title)}</h3>${badge(r.event_type, activityClass(r.event_type))}</div>
      <div><b>วันที่:</b> ${formatThaiDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ` - ${formatThaiDate(r.end_date)}` : ''}</div>
      ${time ? `<div><b>เวลา:</b> ${escapeHtml(time)}</div>` : ''}
      <div><b>สถานที่:</b> ${escapeHtml(r.location || '-')}</div>
      <div><b>ผู้รับผิดชอบ:</b> ${escapeHtml(staffNick(r.owner_id))}</div>
      <div><b>ผู้เข้าร่วม:</b> ${escapeHtml(activityParticipantNames(r))}</div>
      ${r.note ? `<div><b>หมายเหตุ:</b> ${escapeHtml(r.note)}</div>` : ''}
      <div class="actions">${canEdit ? `<button class="tiny-btn" data-edit-activity="${r.id}">แก้ไข</button><button class="tiny-btn danger" data-delete-activity="${r.id}">ลบ</button>` : '<span class="muted">ดูอย่างเดียว</span>'}</div>
    </div>`;
  }
  window.renderActivityTable = function renderActivityTableV56(rows) {
    const filtered = (rows || []).filter(activityMatchesFilters).sort((a,b) => {
      const ad = String(a.start_date || '9999-99-99') + ' ' + String(a.start_time || '99:99');
      const bd = String(b.start_date || '9999-99-99') + ' ' + String(b.start_time || '99:99');
      return ad.localeCompare(bd);
    });
    if (!filtered.length) return empty('ไม่มีกิจกรรมในเงื่อนไขนี้');
    return `<div class="activity-list-grid">${filtered.map(activityCard).join('')}</div>`;
  };
  window.renderActivitiesPage = function renderActivitiesPageV56() {
    const rows = sortedActivities();
    const editing = state.editingActivityId ? (state.activities || []).find(x => x.id === state.editingActivityId) : null;
    const month = state.activityFilterMonth || todayStr().slice(0,7);
    const type = state.activityFilterType || '';
    const owner = state.activityFilterOwner || '';
    return `<div class="grid grid-2">
      <div class="card">
        <div class="section-title"><h3>${editing ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมหน่วยงาน'}</h3>${editing ? '<button class="ghost-btn" data-cancel-edit-activity>ยกเลิกแก้ไข</button>' : ''}</div>
        <form id="activityForm" class="form-grid">
          <label class="wide">รายละเอียดกิจกรรม <input name="title" value="${escapeHtml(editing?.title || '')}" placeholder="เช่น ประชุมทีม / ออกหน่วยที่..." required></label>
          <label>ประเภท <select name="event_type" required>${ACTIVITY_TYPES.map(t => `<option ${editing?.event_type===t?'selected':''}>${t}</option>`).join('')}</select></label>
          <label>สถานที่ <input name="location" list="activityLocationList" value="${escapeHtml(editing?.location || '')}" placeholder="เลือกหรือพิมพ์เอง" required></label><datalist id="activityLocationList">${ACTIVITY_LOCATIONS.map(x => `<option value="${escapeHtml(x)}"></option>`).join('')}</datalist>
          <label>วันที่เริ่ม <input name="start_date" type="date" value="${editing?.start_date || todayStr()}" required></label>
          <label>วันที่สิ้นสุด <input name="end_date" type="date" value="${editing?.end_date || todayStr()}" required></label>
          <label>เวลาเริ่ม <input name="start_time" type="time" value="${editing?.start_time || ''}" required></label>
          <label>เวลาสิ้นสุด <input name="end_time" type="time" value="${editing?.end_time || ''}" required></label>
          <label>ผู้รับผิดชอบ <select name="owner_id" required><option value="">เลือกผู้รับผิดชอบ</option>${staffOptions(editing?.owner_id || getStaffId())}</select></label>
          <label>เอกสารแนบ <input name="file" type="file"></label>
          <div class="wide"><div class="field-label">ผู้เข้าร่วม</div>${renderParticipantCheckboxes(asArray(editing?.participant_ids))}</div>
          <label class="wide">หมายเหตุเพิ่มเติม <textarea name="note" placeholder="ถ้ามี เช่น จำนวนคน / รายละเอียดเสริม">${escapeHtml(editing?.note || '')}</textarea></label>
          <button class="primary-btn wide" type="submit">${editing ? 'บันทึกการแก้ไข' : 'บันทึกกิจกรรม'}</button>
        </form>
      </div>
      <div class="card">
        <div class="section-title"><h3>กิจกรรมทั้งหมด</h3></div>
        <div class="toolbar activity-filter-bar">
          <label>เดือน <input id="activityFilterMonth" type="month" value="${month}"></label>
          <label>ประเภท <select id="activityFilterType"><option value="">ทุกประเภท</option>${ACTIVITY_TYPES.map(t => `<option value="${t}" ${type===t?'selected':''}>${t}</option>`).join('')}</select></label>
          <label>ผู้รับผิดชอบ <select id="activityFilterOwner"><option value="">ทุกคน</option>${orderedStaff(state.staff || []).map(s => `<option value="${s.id}" ${owner===s.id?'selected':''}>${escapeHtml(s.nickname || s.full_name)}</option>`).join('')}</select></label>
        </div>
        ${renderActivityTable(rows)}
      </div>
    </div>`;
  };

  const oldRenderPage = renderPage;
  renderPage = function renderPageV56() {
    if (isAdminSafe() && !NAV_ITEMS.some(x => x.id === 'profileRequestsSummary')) {
      const idx = NAV_ITEMS.findIndex(x => x.id === 'profileRequests');
      NAV_ITEMS.splice(idx >= 0 ? idx + 1 : NAV_ITEMS.length, 0, { id:'profileRequestsSummary', icon:'📄', title:'สรุปคำขอแก้ไขข้อมูลส่วนตัว', subtitle:'รายการที่ตรวจแล้ว ย้อนกลับมาดูได้', group:'admin' });
    }
    const item = NAV_ITEMS.find(x => x.id === state.page) || NAV_ITEMS[0];
    $('pageTitle').textContent = item.title;
    $('pageSubtitle').textContent = item.subtitle;
    renderNav();
    const pages = {
      dashboard: renderDashboard, calendar: renderCalendar, leave: renderLeavePage, myProfile: renderMyProfilePage,
      activities: renderActivitiesPage, hr: renderHrPage, hrSummary: renderHrSummaryPage, scheduler: renderSchedulerPage,
      schedule: renderMonthlySchedulePage, tradeRequests: renderTradeRequestsPage, positions: renderPositionsPage, ot: renderOtPage,
      audit: renderAuditPage, profileRequests: renderProfileRequestsPage, profileRequestsSummary: renderProfileRequestsSummaryPage,
      users: renderUsersPage, eligibility: renderEligibilityPage, positionMonth: renderPositionMonthPage, positionMonthView: renderPositionMonthViewPage
    };
    $('pageContent').innerHTML = (pages[state.page] || renderDashboard)();
  };

  document.addEventListener('click', async function (e) {
    const t = e.target.closest('[data-refresh-profile-requests]');
    if (t) { await loadProfileChangeRequests(); renderPage(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'activityFilterMonth') { state.activityFilterMonth = e.target.value; renderPage(); }
    if (e.target.id === 'activityFilterType') { state.activityFilterType = e.target.value; renderPage(); }
    if (e.target.id === 'activityFilterOwner') { state.activityFilterOwner = e.target.value; renderPage(); }
    if (e.target.id === 'profileSummaryMonth') { state.profileRequestSummaryMonth = e.target.value; renderPage(); }
    if (e.target.id === 'profileSummaryStaff') { state.profileRequestSummaryStaffId = e.target.value; renderPage(); }
  });

  setTimeout(async () => {
    try {
      if (window.sb || typeof sb !== 'undefined') {
        await loadProfileChangeRequests();
        if (['myProfile','profileRequests','profileRequestsSummary'].includes(state.page)) renderPage();
      }
    } catch (err) { console.warn(`[${PATCH}] init skipped`, err); }
  }, 500);

  console.info(`CNMI Staff Planner ${PATCH} loaded`);
})();
