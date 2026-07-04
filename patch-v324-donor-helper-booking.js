/* CNMI Staff Planner V325 — คนมาช่วยห้องบริจาคโลหิต + นำเข้ารายชื่อเดิม
   - คนในหน่วยดูตารางจาก App Staff Planner
   - คนนอกหน่วยลงชื่อผ่าน donor-helper.html
   - ผู้ลงชื่อขอยกเลิกได้ แต่ลบชื่อ/คืนช่องเองไม่ได้
   - ไม่แก้สูตร OT และคงการขอ OT ส่วนที่ 2 ตามเดิม
*/
(function(){
  'use strict';
  const VERSION = 'V325_DONOR_HELPER_BOOKING';
  const PAGE_ID = 'donorHelpers';
  if (window.__CNMI_V325_DONOR_HELPER_BOOKING__) return;
  window.__CNMI_V325_DONOR_HELPER_BOOKING__ = true;

  function appState(){ try { return state; } catch (_) { return window.state || null; } }
  function db(){ try { return sb; } catch (_) { return window.sb || null; } }
  function esc(value){
    try { if (typeof escapeHtml === 'function') return escapeHtml(value); } catch (_) {}
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function isAdminSafe(){ try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } }
  function toast(message, tone){
    try { return showToast(message, tone ? { tone } : undefined); }
    catch (_) { window.alert(message); }
  }
  function pageRender(){
    try {
      const fn = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
      if (typeof fn === 'function') fn();
    } catch (error) { console.warn(`[${VERSION}] render failed`, error); }
  }
  function monthKeyNow(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function dateKey(value){
    const d = value instanceof Date ? value : new Date(`${String(value).slice(0,10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return String(value || '').slice(0,10);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function thaiDate(value){
    try { if (typeof formatThaiDate === 'function') return formatThaiDate(value); } catch (_) {}
    const d = new Date(`${dateKey(value)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(value || '-') : d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' });
  }
  function thaiDateTime(value){
    if (!value) return '-';
    try { if (typeof formatThaiDateTime === 'function') return formatThaiDateTime(value); } catch (_) {}
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });
  }
  function weekendDates(month){
    const [year, mon] = String(month || monthKeyNow()).split('-').map(Number);
    if (!year || !mon) return [];
    const result = [];
    const days = new Date(year, mon, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const d = new Date(year, mon - 1, day, 12, 0, 0);
      if (d.getDay() === 0 || d.getDay() === 6) result.push(dateKey(d));
    }
    return result;
  }
  function monthLabel(month){
    const [year, mon] = String(month || monthKeyNow()).split('-').map(Number);
    const d = new Date(year, (mon || 1) - 1, 1);
    return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString('th-TH', { month:'long', year:'numeric' });
  }
  function slotKey(date, type, no){ return `${date}|${type}|${no}`; }
  function slotLabel(type, no){ return type === 'clerk' ? 'Clerk' : `คนเจาะ ${no}`; }
  function statusText(status){
    return ({
      confirmed:'ยืนยันแล้ว',
      cancel_requested:'ขอยกเลิก — รออนุมัติ',
      cancelled:'ยกเลิกแล้ว',
      completed:'มาปฏิบัติงานแล้ว',
      no_show:'ไม่มาตามนัด'
    })[status] || status || '-';
  }
  function statusClass(status){
    return ({confirmed:'green', cancel_requested:'orange', cancelled:'black', completed:'blue', no_show:'red'})[status] || 'black';
  }
  function publicUrl(){
    try { return new URL('donor-helper.html', window.location.href).href; }
    catch (_) { return 'donor-helper.html'; }
  }
  function errorMessage(error){
    const raw = String(error?.message || error || 'ดำเนินการไม่สำเร็จ');
    if (/function .* does not exist|Could not find the function|schema cache/i.test(raw)) {
      return 'ยังไม่ได้ติดตั้งฐานข้อมูล V324 กรุณาให้ Admin Run ไฟล์ SQL_V324_DONOR_HELPER_BOOKING.sql ใน Supabase ก่อน';
    }
    if (/Permission denied/i.test(raw)) return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
    try { if (typeof friendlyDbError === 'function') return friendlyDbError(error); } catch (_) {}
    return raw;
  }

  try {
    if (typeof NAV_ITEMS !== 'undefined' && Array.isArray(NAV_ITEMS) && !NAV_ITEMS.some(item => item.id === PAGE_ID)) {
      const otIndex = NAV_ITEMS.findIndex(item => item.id === 'ot');
      const item = {
        id: PAGE_ID,
        icon: '🩸',
        title: 'คนมาช่วยห้องบริจาคโลหิต',
        subtitle: 'ดูรายชื่อคนนอกหน่วยที่มาช่วยวันเสาร์–อาทิตย์ 09:00–17:00 น.',
        group: 'staff'
      };
      NAV_ITEMS.splice(otIndex >= 0 ? otIndex : NAV_ITEMS.length, 0, item);
    }
  } catch (error) { console.warn(`[${VERSION}] cannot add nav`, error); }

  const st = appState();
  if (st) {
    st.donorHelperMonthV324 = st.donorHelperMonthV324 || monthKeyNow();
    st.donorHelperRowsV324 = st.donorHelperRowsV324 || [];
    st.donorHelperLoadedMonthV324 = st.donorHelperLoadedMonthV324 || '';
    st.donorHelperLoadingV324 = false;
    st.donorHelperErrorV324 = '';
  }

  async function loadMonth(month, options={}){
    const stateRef = appState();
    const client = db();
    if (!stateRef || !client) return;
    const key = String(month || stateRef.donorHelperMonthV324 || monthKeyNow()).slice(0,7);
    if (!options.force && stateRef.donorHelperLoadedMonthV324 === key && !stateRef.donorHelperErrorV324) return;
    if (stateRef.donorHelperLoadingV324) return;

    stateRef.donorHelperLoadingV324 = true;
    stateRef.donorHelperErrorV324 = '';
    if (stateRef.page === PAGE_ID) pageRender();
    try {
      const result = await client.rpc('get_donor_helper_month_internal_v324', { p_month:key });
      if (result.error) throw result.error;
      stateRef.donorHelperRowsV324 = Array.isArray(result.data) ? result.data : [];
      stateRef.donorHelperLoadedMonthV324 = key;
    } catch (error) {
      console.warn(`[${VERSION}] load month failed`, error);
      stateRef.donorHelperRowsV324 = [];
      stateRef.donorHelperLoadedMonthV324 = '';
      stateRef.donorHelperErrorV324 = errorMessage(error);
    } finally {
      stateRef.donorHelperLoadingV324 = false;
      if (stateRef.page === PAGE_ID) pageRender();
    }
  }

  function activeRows(rows){
    return (rows || []).filter(row => row.status !== 'cancelled');
  }
  function activeMap(rows){
    const map = new Map();
    activeRows(rows).forEach(row => map.set(slotKey(dateKey(row.work_date), row.slot_type, Number(row.slot_no)), row));
    return map;
  }
  function slotCard(date, type, no, row, admin){
    if (!row) {
      return `<div class="donor-helper-slot empty">
        <div class="donor-helper-slot-name">${esc(slotLabel(type,no))}</div>
        <div class="donor-helper-empty-text">ยังว่าง</div>
        ${admin ? `<button class="tiny-btn" type="button" data-helper-admin-add="${esc(`${date}|${type}|${no}`)}">เพิ่มชื่อ</button>` : ''}
      </div>`;
    }
    const status = String(row.status || 'confirmed');
    let actions = '';
    if (admin) {
      if (status === 'cancel_requested') {
        actions = `<div class="actions compact-actions">
          <button class="tiny-btn danger" type="button" data-helper-status="${esc(row.id)}|cancelled">ยืนยันยกเลิก</button>
          <button class="tiny-btn" type="button" data-helper-status="${esc(row.id)}|confirmed">ไม่อนุมัติการยกเลิก</button>
        </div>`;
      } else if (status === 'confirmed') {
        actions = `<div class="actions compact-actions">
          <button class="tiny-btn" type="button" data-helper-edit="${esc(row.id)}">แก้ชื่อ</button>
          <button class="tiny-btn" type="button" data-helper-status="${esc(row.id)}|completed">มาปฏิบัติงานแล้ว</button>
          <button class="tiny-btn danger" type="button" data-helper-status="${esc(row.id)}|no_show">ไม่มาตามนัด</button>
          <button class="tiny-btn danger-ghost" type="button" data-helper-status="${esc(row.id)}|cancelled">Admin ยกเลิก</button>
        </div>`;
      }
    }
    return `<div class="donor-helper-slot occupied status-${esc(status)}">
      <div class="donor-helper-slot-head"><span>${esc(slotLabel(type,no))}</span><span class="badge ${esc(statusClass(status))}">${esc(statusText(status))}</span></div>
      <div class="donor-helper-person">${esc(row.helper_name || '-')}</div>
      <div class="donor-helper-unit">${esc(row.unit_name || '-')}</div>
      ${row.phone && admin ? `<div class="donor-helper-phone">โทร ${esc(row.phone)}</div>` : ''}
      ${status === 'cancel_requested' && row.cancel_reason ? `<div class="donor-helper-cancel-reason"><b>เหตุผล:</b> ${esc(row.cancel_reason)}</div>` : ''}
      ${actions}
    </div>`;
  }

  function renderHistory(rows){
    if (!isAdminSafe()) return '';
    const history = (rows || []).filter(row => row.status === 'cancelled' || row.status === 'no_show' || row.status === 'completed' || row.status === 'cancel_requested')
      .sort((a,b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    if (!history.length) return '';
    return `<div class="card donor-helper-history">
      <div class="section-title"><div><h3>ประวัติการเปลี่ยนแปลงเดือนนี้</h3><p class="hint">รายการไม่ถูกลบออกจากฐานข้อมูล แม้ Admin ยืนยันยกเลิกแล้ว</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ตำแหน่ง</th><th>ชื่อ / หน่วยงาน</th><th>สถานะ</th><th>เหตุผล/เวลา</th></tr></thead><tbody>
        ${history.map(row => `<tr>
          <td>${esc(thaiDate(row.work_date))}</td>
          <td>${esc(slotLabel(row.slot_type, row.slot_no))}</td>
          <td><b>${esc(row.helper_name || '-')}</b><br><span class="muted">${esc(row.unit_name || '-')}</span></td>
          <td><span class="badge ${esc(statusClass(row.status))}">${esc(statusText(row.status))}</span></td>
          <td>${row.cancel_reason ? esc(row.cancel_reason) : '-'}<br><span class="muted">อัปเดต ${esc(thaiDateTime(row.updated_at || row.created_at))}</span></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`;
  }

  function renderHelperPage(){
    const stateRef = appState();
    const month = stateRef?.donorHelperMonthV324 || monthKeyNow();
    const rows = stateRef?.donorHelperRowsV324 || [];
    const map = activeMap(rows);
    const admin = isAdminSafe();
    const dates = weekendDates(month);
    const filled = dates.reduce((sum,date) => sum + ['phlebotomist|1','phlebotomist|2','clerk|1'].filter(token => {
      const [type,no] = token.split('|');
      return map.has(slotKey(date,type,Number(no)));
    }).length, 0);
    const total = dates.length * 3;

    return `<div class="donor-helper-page-v324">
      <div class="card donor-helper-hero">
        <div>
          <span class="donor-helper-kicker">ห้องบริจาคโลหิต • 09:00–17:00 น.</span>
          <h3>ตารางคนนอกหน่วยมาช่วย ${esc(monthLabel(month))}</h3>
          <p>คนเจาะ 2 คน และ Clerk 1 คนต่อวัน • เปิดลงชื่อวันที่ 21 ของเดือนก่อนหน้า</p>
        </div>
        <div class="donor-helper-hero-actions">
          <a class="primary-btn donor-helper-link-btn" href="${esc(publicUrl())}" target="_blank" rel="noopener">เปิดหน้าลงชื่อคนนอกหน่วย</a>
          <button class="ghost-btn" type="button" data-copy-helper-link>คัดลอกลิงก์</button>
        </div>
      </div>

      <div class="notice soft-notice donor-helper-ot-note">
        <b>คนในหน่วยที่มาช่วยวันเสาร์–อาทิตย์:</b> ใช้เมนู <b>ลงชื่ออยู่เวร / ขอ OT เพิ่ม → ส่วนที่ 2</b> เหมือนเดิม ตารางหน้านี้ใช้สำหรับคนนอกหน่วยเท่านั้น
        <button class="tiny-btn" type="button" data-page="ot">ไปส่วนขอ OT</button>
      </div>

      <div class="card donor-helper-toolbar">
        <label>เลือกเดือน <input id="donorHelperMonthInputV324" type="month" value="${esc(month)}"></label>
        <div class="donor-helper-counts"><span class="badge blue">ลงชื่อแล้ว ${filled}/${total} ช่อง</span><span class="badge black">${dates.length} วัน</span></div>
        <button class="ghost-btn" type="button" data-helper-refresh>รีเฟรชรายชื่อ</button>
      </div>

      ${stateRef?.donorHelperErrorV324 ? `<div class="notice donor-helper-error"><b>ยังเปิดตารางไม่ได้</b><br>${esc(stateRef.donorHelperErrorV324)}</div>` : ''}
      ${stateRef?.donorHelperLoadingV324 ? `<div class="card donor-helper-loading">กำลังโหลดรายชื่อ…</div>` : ''}

      <div class="donor-helper-weekend-grid">
        ${dates.map(date => {
          const d = new Date(`${date}T12:00:00`);
          const dow = d.toLocaleDateString('th-TH', { weekday:'long' });
          return `<div class="card donor-helper-day-card">
            <div class="donor-helper-day-head"><div><span>${esc(dow)}</span><b>${esc(thaiDate(date))}</b></div><span class="badge ${d.getDay()===0?'orange':'blue'}">09:00–17:00</span></div>
            <div class="donor-helper-slots">
              ${slotCard(date,'phlebotomist',1,map.get(slotKey(date,'phlebotomist',1)),admin)}
              ${slotCard(date,'phlebotomist',2,map.get(slotKey(date,'phlebotomist',2)),admin)}
              ${slotCard(date,'clerk',1,map.get(slotKey(date,'clerk',1)),admin)}
            </div>
          </div>`;
        }).join('') || '<div class="card">ไม่พบวันเสาร์–อาทิตย์ในเดือนที่เลือก</div>'}
      </div>
      ${renderHistory(rows)}
    </div>`;
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  const wrappedRenderPage = function renderPageV324(){
    const stateRef = appState();
    if (!stateRef || stateRef.page !== PAGE_ID) {
      return previousRenderPage ? previousRenderPage.apply(this, arguments) : undefined;
    }
    try {
      const item = (typeof NAV_ITEMS !== 'undefined' && NAV_ITEMS.find(x => x.id === PAGE_ID)) || { title:'คนมาช่วยห้องบริจาคโลหิต', subtitle:'ดูรายชื่อวันเสาร์–อาทิตย์' };
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = item.title;
      if (subtitle) subtitle.textContent = item.subtitle;
      try { if (typeof renderNav === 'function') renderNav(); } catch (_) {}
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = renderHelperPage();
      if (!stateRef.donorHelperLoadingV324 && !stateRef.donorHelperErrorV324 && stateRef.donorHelperLoadedMonthV324 !== stateRef.donorHelperMonthV324) {
        window.setTimeout(() => loadMonth(stateRef.donorHelperMonthV324, { force:false }), 0);
      }
    } catch (error) {
      console.error(`[${VERSION}] page render failed`, error);
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = `<div class="notice">เปิดหน้าคนมาช่วยไม่สำเร็จ: ${esc(error.message || error)}</div>`;
    }
  };
  try { window.renderPage = renderPage = wrappedRenderPage; }
  catch (_) { window.renderPage = wrappedRenderPage; }

  function rowById(id){ return (appState()?.donorHelperRowsV324 || []).find(row => String(row.id) === String(id)); }

  function showAddModal(payload){
    const [workDate, slotType, slotNo] = String(payload || '').split('|');
    const html = `<h2>เพิ่มชื่อคนนอกหน่วย</h2>
      <p class="muted">${esc(thaiDate(workDate))} • ${esc(slotLabel(slotType, Number(slotNo)))} • 09:00–17:00 น.</p>
      <form id="donorHelperAdminAddFormV324" class="form-grid">
        <input type="hidden" name="work_date" value="${esc(workDate)}">
        <input type="hidden" name="slot_type" value="${esc(slotType)}">
        <input type="hidden" name="slot_no" value="${esc(slotNo)}">
        <label>ชื่อ-สกุล <input name="helper_name" required maxlength="120"></label>
        <label>หน่วยงาน <input name="unit_name" required maxlength="160"></label>
        <label class="wide">เบอร์โทร (ถ้ามี) <input name="phone" inputmode="tel" maxlength="30"></label>
        <button class="primary-btn wide" type="submit">บันทึกชื่อ</button>
      </form>`;
    try { showModal(html, { small:true }); }
    catch (_) { toast('เปิดแบบฟอร์มไม่สำเร็จ', 'error'); }
  }

  function showEditModal(id){
    const row = rowById(id);
    if (!row) return toast('ไม่พบรายการ', 'error');
    const html = `<h2>แก้ไขข้อมูลผู้มาช่วย</h2>
      <p class="muted">${esc(thaiDate(row.work_date))} • ${esc(slotLabel(row.slot_type, row.slot_no))}</p>
      <form id="donorHelperAdminEditFormV324" class="form-grid">
        <input type="hidden" name="signup_id" value="${esc(row.id)}">
        <label>ชื่อ-สกุล <input name="helper_name" value="${esc(row.helper_name || '')}" required maxlength="120"></label>
        <label>หน่วยงาน <input name="unit_name" value="${esc(row.unit_name || '')}" required maxlength="160"></label>
        <label class="wide">เบอร์โทร (ถ้ามี) <input name="phone" value="${esc(row.phone || '')}" inputmode="tel" maxlength="30"></label>
        <button class="primary-btn wide" type="submit">บันทึกการแก้ไข</button>
      </form>`;
    try { showModal(html, { small:true }); }
    catch (_) { toast('เปิดแบบฟอร์มไม่สำเร็จ', 'error'); }
  }

  async function confirmAction(message, title='ยืนยันรายการ'){
    try { if (typeof confirmDialog === 'function') return await confirmDialog(message, title); }
    catch (_) {}
    return window.confirm(message);
  }

  async function updateStatus(id, nextStatus){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const row = rowById(id);
    if (!row) return toast('ไม่พบรายการ', 'error');
    const prompts = {
      cancelled: `ยืนยันนำ ${row.helper_name} ออกจากช่อง ${slotLabel(row.slot_type,row.slot_no)} วันที่ ${thaiDate(row.work_date)} ใช่หรือไม่? ประวัติจะยังคงอยู่`,
      confirmed: `ไม่อนุมัติคำขอยกเลิกของ ${row.helper_name} และคงชื่อไว้ในตารางใช่หรือไม่?`,
      completed: `ยืนยันว่า ${row.helper_name} มาปฏิบัติงานแล้วใช่หรือไม่?`,
      no_show: `ยืนยันบันทึกว่า ${row.helper_name} ไม่มาตามนัดใช่หรือไม่?`
    };
    const ok = await confirmAction(prompts[nextStatus] || 'ยืนยันเปลี่ยนสถานะรายการนี้หรือไม่?');
    if (!ok) return;
    let note = null;
    if (nextStatus === 'cancelled' && row.status !== 'cancel_requested') {
      note = window.prompt('เหตุผลที่ Admin ยกเลิก (ถ้ามี)', '') || null;
    }
    try {
      const result = await db().rpc('admin_update_donor_helper_status_v324', {
        p_signup_id:id,
        p_status:nextStatus,
        p_note:note
      });
      if (result.error) throw result.error;
      await loadMonth(appState().donorHelperMonthV324, { force:true });
      toast(nextStatus === 'cancelled' ? 'ยืนยันยกเลิกแล้ว ช่องกลับมาว่าง แต่ประวัติยังอยู่' : 'บันทึกสถานะแล้ว');
    } catch (error) { toast(errorMessage(error), 'error'); }
  }

  async function copyPublicLink(){
    const link = publicUrl();
    try {
      await navigator.clipboard.writeText(link);
      toast('คัดลอกลิงก์หน้าลงชื่อคนนอกหน่วยแล้ว');
    } catch (_) {
      window.prompt('คัดลอกลิงก์นี้', link);
    }
  }

  document.addEventListener('change', function(event){
    const target = event.target;
    if (!target || target.id !== 'donorHelperMonthInputV324') return;
    const stateRef = appState();
    if (!stateRef) return;
    stateRef.donorHelperMonthV324 = target.value || monthKeyNow();
    stateRef.donorHelperLoadedMonthV324 = '';
    stateRef.donorHelperErrorV324 = '';
    pageRender();
  }, true);

  document.addEventListener('click', function(event){
    const target = event.target?.closest?.('[data-helper-admin-add],[data-helper-status],[data-helper-edit],[data-helper-refresh],[data-copy-helper-link]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (target.hasAttribute('data-helper-admin-add')) return showAddModal(target.getAttribute('data-helper-admin-add'));
    if (target.hasAttribute('data-helper-edit')) return showEditModal(target.getAttribute('data-helper-edit'));
    if (target.hasAttribute('data-helper-status')) {
      const [id,status] = String(target.getAttribute('data-helper-status') || '').split('|');
      return void updateStatus(id,status);
    }
    if (target.hasAttribute('data-helper-refresh')) return void loadMonth(appState()?.donorHelperMonthV324, { force:true });
    if (target.hasAttribute('data-copy-helper-link')) return void copyPublicLink();
  }, true);

  document.addEventListener('submit', async function(event){
    const form = event.target;
    if (!form || !['donorHelperAdminAddFormV324','donorHelperAdminEditFormV324'].includes(form.id)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const data = new FormData(form);
    try {
      if (form.id === 'donorHelperAdminAddFormV324') {
        const result = await db().rpc('admin_add_donor_helper_v324', {
          p_work_date:data.get('work_date'),
          p_slot_type:data.get('slot_type'),
          p_slot_no:Number(data.get('slot_no')),
          p_helper_name:String(data.get('helper_name') || '').trim(),
          p_unit_name:String(data.get('unit_name') || '').trim(),
          p_phone:String(data.get('phone') || '').trim() || null
        });
        if (result.error) throw result.error;
        try { closeModal(); } catch (_) {}
        await loadMonth(appState().donorHelperMonthV324, { force:true });
        toast('เพิ่มชื่อคนนอกหน่วยแล้ว');
      } else {
        const result = await db().rpc('admin_edit_donor_helper_v324', {
          p_signup_id:data.get('signup_id'),
          p_helper_name:String(data.get('helper_name') || '').trim(),
          p_unit_name:String(data.get('unit_name') || '').trim(),
          p_phone:String(data.get('phone') || '').trim() || null
        });
        if (result.error) throw result.error;
        try { closeModal(); } catch (_) {}
        await loadMonth(appState().donorHelperMonthV324, { force:true });
        toast('แก้ไขข้อมูลแล้ว');
      }
    } catch (error) { toast(errorMessage(error), 'error'); }
  }, true);

  window.cnmiDonorHelperV324 = {
    version:VERSION,
    loadMonth,
    publicUrl
  };
  console.info(`[${VERSION}] loaded`);
})();
