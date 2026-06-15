/* V214: Position Management CRUD Hard Fix
   - Capture Add/Edit/Delete/Restore/Save before older handlers can swallow events.
   - Directly writes daily_position_masters with clear Console errors.
   - Adds cnmiPositionCrudHealth() for quick Supabase/RLS diagnostics.
*/
(function(){
  'use strict';
  const VERSION = 'V214_POSITION_MANAGEMENT_CRUD_HARD_FIX';
  if (window.__CNMI_V214_POSITION_MANAGEMENT_CRUD_HARD_FIX__) return;
  window.__CNMI_V214_POSITION_MANAGEMENT_CRUD_HARD_FIX__ = true;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const friendly = (err) => {
    try { return friendlyDbError(err); }
    catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); }
  };
  const toast = (msg, tone) => {
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console[tone === 'error' ? 'error' : 'info'](msg); }
  };
  const getClient = () => window.supabaseClient || window.sbClient || (typeof sb !== 'undefined' ? sb : null);
  const currentStaff = () => {
    try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; }
  };
  const bool = (v, fallback=false) => {
    if (typeof v === 'boolean') return v;
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (['true','1','yes','y','ใช่','active','ใช้งาน'].includes(s)) return true;
    if (['false','0','no','n','ไม่','inactive','ปิด','ปิดใช้งาน'].includes(s)) return false;
    return fallback;
  };
  const n = (v, fallback=999) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  };

  function logError(label, err){
    console.error(`${VERSION}: ${label}`, {
      message: err?.message || String(err || ''),
      code: err?.code || null,
      details: err?.details || null,
      hint: err?.hint || null,
      raw: err
    });
  }

  async function withTimeout(promise, ms, label){
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || 'request'} timeout ${ms}ms`)), ms);
    });
    try { return await Promise.race([promise, timeout]); }
    finally { clearTimeout(timer); }
  }

  async function ensureReady(){
    const client = getClient();
    if (!client) throw new Error('ไม่พบ Supabase client: กรุณาตรวจ config.js / Supabase CDN');
    try {
      const sess = await withTimeout(client.auth.getSession(), 8000, 'auth.getSession');
      if (sess?.error) throw sess.error;
      if (!sess?.data?.session?.user) throw new Error('Session หมดอายุ กรุณา Login ใหม่');
      state.session = sess.data.session;
    } catch (err) {
      throw err;
    }
    if (!state.profile && typeof loadProfile === 'function') await loadProfile();
    const admin = (() => { try { return isAdmin(); } catch (_) { return state?.profile?.role === 'admin'; } })();
    if (!admin) throw new Error('บัญชีนี้ไม่ใช่ Admin จึงเพิ่ม/แก้ไข/ลบตำแหน่งไม่ได้');
    return client;
  }

  async function refreshMasters(options={}){
    const client = getClient();
    if (!client) return false;
    try {
      const res = await withTimeout(
        client.from('daily_position_masters').select('*').order('sort_order', { ascending:true }).order('zone', { ascending:true }).order('code', { ascending:true }),
        10000,
        'daily_position_masters select'
      );
      if (res.error) throw res.error;
      state.positionMasters = res.data || [];
      state.positionMastersLoaded = true;
      state.positionMasterLoadError = '';
      console.info(`${VERSION}: daily_position_masters refreshed`, state.positionMasters.length);
      if (options.renderAfter && typeof renderPage === 'function') renderPage();
      return true;
    } catch (err) {
      state.positionMastersLoaded = false;
      state.positionMasterLoadError = err?.message || String(err || 'โหลดตำแหน่งไม่สำเร็จ');
      logError('refresh daily_position_masters failed', err);
      if (!options.silent) toast('โหลดรายการตำแหน่งไม่สำเร็จ: ' + friendly(err), 'error');
      return false;
    }
  }

  function normalizeRow(row){
    const code = String(row?.code || row?.position_code || '').trim();
    const zone = String(row?.zone || '').trim() || 'Blood Bank';
    return {
      ...row,
      id: row?.id,
      code,
      zone,
      is_outing: bool(row?.is_outing, zone === 'ออกหน่วย'),
      is_active: row?.is_active === false || row?.deleted_at ? false : true,
      sort_order: n(row?.sort_order, 999)
    };
  }

  function allMasters(){
    const rows = Array.isArray(state.positionMasters) && state.positionMasters.length ? state.positionMasters : [];
    return rows.map(normalizeRow);
  }

  function nextSortOrder(zone, isOuting){
    const target = isOuting || String(zone || '').trim() === 'ออกหน่วย' ? 'ออกหน่วย' : (String(zone || '').trim() || 'Blood Bank');
    const rows = allMasters().filter(r => (r.is_outing || r.zone === 'ออกหน่วย' ? 'ออกหน่วย' : (r.zone || 'Blood Bank')) === target);
    const max = rows.reduce((m, r) => Math.max(m, n(r.sort_order, 0)), 0);
    return max + 10;
  }

  function closeSidebar(){
    try { const sidebar = $('sidebar'); if (sidebar) sidebar.classList.remove('open'); document.body.classList.remove('sidebar-open'); } catch (_) {}
  }

  async function openPositionManagementFast(){
    state.page = 'positionManagement';
    closeSidebar();
    if (typeof renderPage === 'function') renderPage();
    setTimeout(() => refreshMasters({ renderAfter:true, silent:true }), 0);
  }

  function afterRenderFix(){
    if (state?.page !== 'positionManagement') return;
    const form = $('positionMasterForm');
    if (!form) return;
    // If the table has been loaded but an older render left the submit disabled, unlock it.
    const submit = form.querySelector('button[type="submit"]');
    if (submit && state.positionMastersLoaded === true) submit.disabled = false;
    form.setAttribute('data-v214-bound', '1');
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage && !window.__CNMI_V214_RENDER_WRAPPED__) {
    window.__CNMI_V214_RENDER_WRAPPED__ = true;
    window.renderPage = renderPage = function renderPageV214(){
      const result = previousRenderPage.apply(this, arguments);
      try { afterRenderFix(); } catch (err) { console.warn(`${VERSION}: afterRenderFix failed`, err); }
      return result;
    };
  }

  function scrollToForm(){
    setTimeout(() => {
      try {
        const card = document.querySelector('.position-master-form-card');
        if (card) { card.open = true; card.scrollIntoView({ behavior:'smooth', block:'start' }); }
        const input = document.querySelector('#positionMasterForm [name="code"]');
        if (input) input.focus({ preventScroll:true });
      } catch (_) {}
    }, 30);
  }

  function openAdd(){
    state.editingPositionMasterId = null;
    state.showPositionMasterForm = true;
    state.page = 'positionManagement';
    if (typeof renderPage === 'function') renderPage();
    scrollToForm();
  }

  function openEdit(id){
    state.editingPositionMasterId = String(id || '');
    state.showPositionMasterForm = true;
    state.page = 'positionManagement';
    if (typeof renderPage === 'function') renderPage();
    scrollToForm();
  }

  function cancelEdit(){
    state.editingPositionMasterId = null;
    state.showPositionMasterForm = false;
    if (typeof renderPage === 'function') renderPage();
  }

  async function confirmAction(message, title){
    try {
      if (typeof confirmDialog === 'function') return await confirmDialog(message, title || 'ยืนยันการทำรายการ');
    } catch (err) { console.warn(`${VERSION}: confirmDialog failed, fallback native confirm`, err); }
    return window.confirm(message);
  }

  function buildPayloadFromForm(form){
    const fd = new FormData(form);
    const id = String(fd.get('id') || '').trim();
    const code = String(fd.get('code') || '').trim();
    const zone = String(fd.get('zone') || '').trim() || 'Blood Bank';
    const isOuting = String(fd.get('is_outing')) === 'true' || zone === 'ออกหน่วย';
    const finalZone = isOuting ? 'ออกหน่วย' : zone;
    const isActive = String(fd.get('is_active')) !== 'false';
    if (!code) throw new Error('กรุณากรอกรหัสตำแหน่ง / Code');
    if (id && id.startsWith('seed:')) throw new Error('รายการนี้ยังเป็น fallback seed ไม่ใช่ข้อมูลจริงใน Supabase กรุณารัน SQL สร้าง daily_position_masters ก่อน');
    const sortInput = n(fd.get('sort_order'), NaN);
    const existing = id ? allMasters().find(r => String(r.id) === id) : null;
    const payload = {
      code,
      zone: finalZone,
      is_outing: isOuting,
      break_time: String(fd.get('break_time') || '').trim() || '-',
      main_rule: String(fd.get('main_rule') || '').trim() || null,
      job_desc: String(fd.get('job_desc') || '').trim() || null,
      sort_order: id && Number.isFinite(sortInput) ? sortInput : (id ? n(existing?.sort_order, nextSortOrder(finalZone, isOuting)) : nextSortOrder(finalZone, isOuting)),
      is_active: isActive,
      deleted_at: isActive ? null : new Date().toISOString(),
      updated_by: currentStaff()
    };
    const elig = String(fd.get('eligibility_code') || '').trim();
    payload.eligibility_code = elig || (isOuting ? `OUTING:${code}` : null);
    if (!id) payload.created_by = currentStaff();
    return { id, payload };
  }

  async function saveForm(form){
    const started = performance.now();
    console.info(`${VERSION}: submit captured`);
    try {
      const client = await ensureReady();
      if (state.positionMastersLoaded !== true) await refreshMasters({ silent:true });
      const { id, payload } = buildPayloadFromForm(form);
      if (typeof setBusy === 'function') setBusy(true, id ? 'กำลังบันทึกการแก้ไขตำแหน่ง' : 'กำลังเพิ่มตำแหน่งใหม่');
      const query = id
        ? client.from('daily_position_masters').update(payload).eq('id', id).select('*').maybeSingle()
        : client.from('daily_position_masters').insert(payload).select('*').maybeSingle();
      const res = await withTimeout(query, 12000, id ? 'daily_position_masters update' : 'daily_position_masters insert');
      if (res.error) throw res.error;
      if (!res.data?.id) throw new Error('Supabase ตอบกลับมาแต่ไม่พบ id ที่บันทึก อาจติด RLS หรือ id ไม่ตรงรายการ');
      await refreshMasters({ silent:true });
      state.editingPositionMasterId = null;
      state.showPositionMasterForm = false;
      state.page = 'positionManagement';
      if (typeof renderPage === 'function') renderPage();
      toast(id ? 'บันทึกการแก้ไขตำแหน่งแล้ว' : 'เพิ่มตำแหน่งใหม่แล้ว');
      console.info(`${VERSION}: saved`, { id:res.data.id, code:res.data.code, ms:Math.round(performance.now() - started) });
    } catch (err) {
      logError('save failed', err);
      toast('บันทึกตำแหน่งไม่สำเร็จ: ' + friendly(err), 'error');
    } finally {
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  }

  async function setActive(id, active){
    try {
      const client = await ensureReady();
      const row = allMasters().find(r => String(r.id) === String(id));
      if (!row) throw new Error('ไม่พบตำแหน่งนี้ในรายการล่าสุด กรุณารีเฟรช');
      if (String(id).startsWith('seed:')) throw new Error('รายการนี้ยังเป็น fallback seed ไม่ใช่ข้อมูลจริงใน Supabase');
      const ok = await confirmAction(`${active ? 'เปิดใช้งาน' : 'ลบ/ปิดใช้งาน'}ตำแหน่ง ${row.code}?`, active ? 'ยืนยันเปิดใช้งานตำแหน่ง' : 'ยืนยันลบตำแหน่ง');
      if (!ok) return;
      if (typeof setBusy === 'function') setBusy(true, active ? 'กำลังเปิดใช้งานตำแหน่ง' : 'กำลังลบตำแหน่ง');
      const payload = active
        ? { is_active:true, deleted_at:null, updated_by:currentStaff() }
        : { is_active:false, deleted_at:new Date().toISOString(), updated_by:currentStaff() };
      const res = await withTimeout(client.from('daily_position_masters').update(payload).eq('id', id).select('id,code').maybeSingle(), 12000, 'daily_position_masters active update');
      if (res.error) throw res.error;
      await refreshMasters({ silent:true });
      if (typeof renderPage === 'function') renderPage();
      toast(active ? 'เปิดใช้งานตำแหน่งแล้ว' : 'ปิดใช้งานตำแหน่งแล้ว');
      console.info(`${VERSION}: active changed`, { id, active });
    } catch (err) {
      logError(active ? 'restore failed' : 'delete failed', err);
      toast((active ? 'เปิดใช้งาน' : 'ลบ/ปิดใช้งาน') + 'ตำแหน่งไม่สำเร็จ: ' + friendly(err), 'error');
    } finally {
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  }

  window.cnmiPositionCrudHealth = async function cnmiPositionCrudHealth(){
    const out = { version: VERSION, ok:false, session:null, profile:null, checks:{} };
    try {
      const client = getClient();
      if (!client) throw new Error('ไม่พบ Supabase client');
      const session = await withTimeout(client.auth.getSession(), 8000, 'auth.getSession');
      out.session = { ok:!session.error, user:session.data?.session?.user?.email || null, user_id:session.data?.session?.user?.id || null, error:session.error || null };
      out.profile = state.profile || null;
      const select = await withTimeout(client.from('daily_position_masters').select('id,code', { count:'exact', head:true }), 8000, 'daily_position_masters select/head');
      out.checks.select = { ok:!select.error, status:select.status, count:select.count, error:select.error || null };
      const admin = (() => { try { return isAdmin(); } catch (_) { return state?.profile?.role === 'admin'; } })();
      out.checks.frontend_admin = { ok:!!admin, role:state?.profile?.role || null };
      out.ok = !select.error && !!admin && !!out.session.user;
    } catch (err) {
      out.error = err?.message || String(err);
    }
    console.info(`${VERSION}: health`, out);
    return out;
  };

  window.addEventListener('click', function(e){
    const nav = e.target?.closest?.('[data-page="positionManagement"]');
    if (nav) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openPositionManagementFast();
      return;
    }
    const add = e.target?.closest?.('[data-add-position-master]');
    if (add) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openAdd();
      return;
    }
    const edit = e.target?.closest?.('[data-edit-position-master]');
    if (edit) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openEdit(edit.getAttribute('data-edit-position-master'));
      return;
    }
    const cancel = e.target?.closest?.('[data-cancel-position-master-edit]');
    if (cancel) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      cancelEdit();
      return;
    }
    const del = e.target?.closest?.('[data-delete-position-master]');
    if (del) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setActive(del.getAttribute('data-delete-position-master'), false);
      return;
    }
    const restore = e.target?.closest?.('[data-restore-position-master]');
    if (restore) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setActive(restore.getAttribute('data-restore-position-master'), true);
      return;
    }
    const submitBtn = e.target?.closest?.('#positionMasterForm button[type="submit"]');
    if (submitBtn) {
      const form = submitBtn.closest('form');
      if (form) {
        e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (submitBtn.disabled && state.positionMastersLoaded !== true) return toast('ยังโหลดตาราง daily_position_masters ไม่เสร็จ กรุณากดรีเฟรชจากฐานข้อมูลก่อน', 'error');
        saveForm(form);
      }
    }
  }, true);

  window.addEventListener('submit', function(e){
    if (e.target?.id !== 'positionMasterForm') return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    saveForm(e.target);
  }, true);

  // Run once on load in case the user is already on this page.
  setTimeout(() => { try { afterRenderFix(); } catch (_) {} }, 0);
  console.info(`${VERSION} loaded`);
})();
