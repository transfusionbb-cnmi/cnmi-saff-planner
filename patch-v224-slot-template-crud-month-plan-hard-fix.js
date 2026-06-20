/* =========================
   V224 Slot Template CRUD + Monthly Position Hard Fix
   - Manage daytime slot templates from Web App only.
   - Supports normal 8-14 staff sets and outing-date slots.
   - Stores template config in daily_position_masters system rows, so no new SQL is required.
   - Hard intercepts “สร้างแผนทั้งเดือน” to prevent fallback blank-table logic.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V224_SLOT_TEMPLATE_CRUD_MONTH_PLAN_HARD_FIX';
  if (window.__CNMI_V224_SLOT_TEMPLATE_CRUD_MONTH_PLAN_HARD_FIX__) return;
  window.__CNMI_V224_SLOT_TEMPLATE_CRUD_MONTH_PLAN_HARD_FIX__ = true;

  const CFG_PREFIX = '__CNMI_SLOT_TEMPLATE_V224__';
  const LS_KEY = 'cnmi_slot_template_v224_cache';
  const DAY_SETS = [8,9,10,11,12,13,14];
  const ZONES = ['Blood Bank','Manual','Donor','Donor Room','ออกหน่วย'];

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const norm = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } };
  const pad2 = (n) => String(n).padStart(2, '0');
  const toast = (msg, tone) => { try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } };
  const friendly = (err) => { try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } };
  const admin = () => { try { return isAdmin(); } catch (_) { return false; } };
  const sid = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } };
  const today = () => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } };
  const monthNow = () => { try { return monthKey(new Date()); } catch (_) { return today().slice(0,7); } };
  const deepClone = (x) => { try { return JSON.parse(JSON.stringify(x || null)); } catch (_) { return x; } };

  function cfgKey(kind, n){ return kind === 'outing' ? `${CFG_PREFIX}:OUTING` : `${CFG_PREFIX}:DAY:${Number(n)}`; }
  function isConfigRow(row){ return String(row?.code || '').startsWith(`${CFG_PREFIX}:`); }
  function safeJsonParse(v){ try { return JSON.parse(String(v || '')); } catch (_) { return null; } }
  function getState(){
    if (!state.slotTemplateV224) state.slotTemplateV224 = { kind:'day', setNo:14, configs:null, loaded:false, loading:false };
    return state.slotTemplateV224;
  }
  function readLocal(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function writeLocal(configs){
    try { localStorage.setItem(LS_KEY, JSON.stringify(configs || {})); } catch (_) {}
  }
  function baseDaySets(){
    const src = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS || {};
    const out = {};
    DAY_SETS.forEach(n => { out[n] = sanitizeRows(deepClone(src[n] || []), false); });
    return out;
  }
  function latestOutingByCount(){
    const row = (code, zone, main_rule, break_time, job_desc, sort_order) => ({
      code, zone, break_time, main_rule, job_desc, sort_order,
      eligibility_code: zone === 'ออกหน่วย' ? `OUTING:${code}` : code,
      is_outing:true,
      is_active:true
    });
    const commonDesc = {
      report:'รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ',
      report2:'รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ',
      approve:'รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน',
      manual1:'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt',
      manual2:'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam',
      support:'รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)',
      register:'รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)',
      prep:'เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน',
      finger:'คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด',
      main:'เจาะเลือดตัวหลัก กลับมาปั่นเลือด',
      outSupport:'เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย'
    };
    const rows14 = [
      row('BB-Report 1','Blood Bank','MT เท่านั้น','11:00',commonDesc.report,1),
      row('BB-Report 2','Blood Bank','MT เท่านั้น','12:00',commonDesc.report2,2),
      row('BB-Approve','Blood Bank','MT เท่านั้น','12:00',commonDesc.approve,3),
      row('BB-Manual 1','Manual','MT เท่านั้น','11:00',commonDesc.manual1,4),
      row('BB-Manual 2','Manual','MT เท่านั้น','11:00',commonDesc.manual2,5),
      row('BB-Support','Blood Bank','Clerk หรือ แตง','12:00',commonDesc.support,6),
      row('DR-Register','ออกหน่วย','Clerk หรือ แตง','12:00',commonDesc.register,7),
      row('DR-Preparation','ออกหน่วย','มัส','12:00',commonDesc.prep,8),
      row('DR-Finger+Interview 1','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.finger,9),
      row('DR-Finger+Interview 2','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.finger,10),
      row('DR-Main 1','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,11),
      row('DR-Main 2','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,12),
      row('DR-Main 3','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,13),
      row('DR-Support','ออกหน่วย','Clerk','12:00',commonDesc.outSupport,14)
    ];
    const rows13 = [
      row('BB-Report','Blood Bank','MT เท่านั้น','11:00',commonDesc.report,1),
      row('BB-Approve','Blood Bank','MT เท่านั้น','12:00',commonDesc.approve,2),
      row('BB-Manual 1','Manual','MT เท่านั้น','11:00',commonDesc.manual1,3),
      row('BB-Manual 2','Manual','MT เท่านั้น','11:00',commonDesc.manual2,4),
      row('BB-Support','Blood Bank','Clerk หรือ แตง','12:00',commonDesc.support,5),
      row('DR-Register','ออกหน่วย','Clerk หรือ แตง','12:00',commonDesc.register,6),
      row('DR-Preparation','ออกหน่วย','มัส','12:00',commonDesc.prep,7),
      row('DR-Finger+Interview 1','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.finger,8),
      row('DR-Finger+Interview 2','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.finger,9),
      row('DR-Main 1','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,10),
      row('DR-Main 2','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,11),
      row('DR-Main 3','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,12),
      row('DR-Support','ออกหน่วย','Clerk','12:00',commonDesc.outSupport,13)
    ];
    const rows12 = [
      row('BB-Report','Blood Bank','MT เท่านั้น','11:00',commonDesc.report,1),
      row('BB-Approve','Blood Bank','MT เท่านั้น','12:00',commonDesc.approve,2),
      row('BB-Manual 1','Manual','MT เท่านั้น','11:00',commonDesc.manual1,3),
      row('BB-Manual 2','Manual','MT เท่านั้น','11:00',commonDesc.manual2,4),
      row('BB-Support','Blood Bank','Clerk หรือ แตง','12:00',commonDesc.support,5),
      row('DR-Register','ออกหน่วย','Clerk หรือ แตง','12:00',commonDesc.register,6),
      row('DR-Preparation','ออกหน่วย','มัส','12:00',commonDesc.prep,7),
      row('DR-Finger+Interview 1','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.finger,8),
      row('DR-Finger+Interview 2','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.finger,9),
      row('DR-Main 1','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,10),
      row('DR-Main 2','ออกหน่วย','MT หรือ แตง','12:00',commonDesc.main,11),
      row('DR-Support','ออกหน่วย','Clerk','12:00',commonDesc.outSupport,12)
    ];
    return { 12:sanitizeRows(rows12, true), 13:sanitizeRows(rows13, true), 14:sanitizeRows(rows14, true) };
  }
  function outingBucket(n){ const raw = Number(n || 14); return raw <= 12 ? 12 : (raw <= 13 ? 13 : 14); }
  function latestOutingRows(count=14){ return latestOutingByCount()[outingBucket(count)] || []; }
  function hasCompleteOuting(rows, min=12){ return Array.isArray(rows) && rows.length >= min; }
  function baseOutingRows(){
    let rows = [];
    try { rows = (window.cnmiPositionCatalogV182?.outingPositions182?.() || []).map(x => ({ ...x })); } catch (_) {}
    if (!hasCompleteOuting(rows)) {
      try { rows = (state.positionMasters || []).filter(p => p?.is_outing === true || String(p?.zone || '') === 'ออกหน่วย').map(x => ({ ...x })); } catch (_) {}
    }
    if (!hasCompleteOuting(rows)) rows = latestOutingRows(14);
    return sanitizeRows(rows, true);
  }
  function defaultConfigs(){
    return { day:baseDaySets(), outing:latestOutingRows(14), outing_by_count:latestOutingByCount() };
  }
  function sanitizeRows(rows, outing){
    return (Array.isArray(rows) ? rows : []).map((r, i) => {
      const code = String(r?.code || r?.position_code || '').trim();
      if (!code) return null;
      const rawZone = String(r?.zone || '').trim();
      const isOut = outing || r?.is_outing === true || rawZone === 'ออกหน่วย' || String(r?.eligibility_code || '').startsWith('OUTING:');
      return {
        code,
        zone: rawZone || (isOut ? 'ออกหน่วย' : 'Blood Bank'),
        break_time:String(r?.break_time || '').trim() || (rawZone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
        main_rule:String(r?.main_rule || '').trim() || '',
        job_desc:String(r?.job_desc || r?.detail || '').trim() || '',
        sort_order:Number(r?.sort_order || r?.order || (i + 1)) || (i + 1),
        eligibility_code:String(r?.eligibility_code || '').trim() || (rawZone === 'ออกหน่วย' ? `OUTING:${code}` : code),
        is_outing:isOut,
        is_active:r?.is_active === false ? false : true
      };
    }).filter(Boolean).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }
  function currentConfigs(){
    const st = getState();
    if (st.configs) return st.configs;
    const base = defaultConfigs();
    const local = readLocal();
    st.configs = mergeConfigs(base, local);
    return st.configs;
  }
  function mergeConfigs(base, extra){
    const out = deepClone(base || defaultConfigs());
    if (!out.outing_by_count) out.outing_by_count = latestOutingByCount();
    if (extra?.day) DAY_SETS.forEach(n => { if (Array.isArray(extra.day[n])) out.day[n] = sanitizeRows(extra.day[n], false); });
    if (extra?.outing_by_count) [12,13,14].forEach(n => {
      const rows = extra.outing_by_count[n] || extra.outing_by_count[String(n)] || [];
      if (hasCompleteOuting(rows, n)) out.outing_by_count[n] = sanitizeRows(rows, true);
    });
    if (Array.isArray(extra?.outing)) {
      const rows = sanitizeRows(extra.outing, true);
      if (hasCompleteOuting(rows, 12)) {
        out.outing = rows;
        if (!hasCompleteOuting(out.outing_by_count?.[14], 14) && rows.length >= 14) out.outing_by_count[14] = rows;
      }
    }
    [12,13,14].forEach(n => { if (!hasCompleteOuting(out.outing_by_count?.[n], n)) out.outing_by_count[n] = latestOutingRows(n); });
    if (!hasCompleteOuting(out.outing, 12)) out.outing = out.outing_by_count[14] || latestOutingRows(14);
    return out;
  }
  async function loadDbConfigs(force=false){
    const st = getState();
    if (st.loading) return currentConfigs();
    if (st.loaded && !force) return currentConfigs();
    st.loading = true;
    let configs = currentConfigs();
    try {
      if (sb) {
        const res = await sb.from('daily_position_masters').select('code,job_desc,is_outing,zone,is_active,sort_order').like('code', `${CFG_PREFIX}:%`);
        if (res.error) throw res.error;
        const db = {};
        (res.data || []).forEach(row => {
          const parsed = safeJsonParse(row.job_desc);
          if (!Array.isArray(parsed)) return;
          const code = String(row.code || '');
          const mo = code.match(/:OUTING:(\d+)$/);
          if (mo) { db.outing_by_count = db.outing_by_count || {}; db.outing_by_count[Number(mo[1])] = sanitizeRows(parsed, true); return; }
          if (code.endsWith(':OUTING')) db.outing = sanitizeRows(parsed, true);
          const m = code.match(/:DAY:(\d+)$/);
          if (m) { db.day = db.day || {}; db.day[Number(m[1])] = sanitizeRows(parsed, false); }
        });
        configs = mergeConfigs(configs, db);
      }
    } catch (err) {
      console.warn(`${VERSION}: config load skipped`, err);
    } finally {
      st.configs = configs;
      st.loaded = true;
      st.loading = false;
      writeLocal(configs);
      applyConfigsToRuntime();
    }
    return configs;
  }
  async function saveConfigRows(kinds){
    if (!sb) throw new Error('ไม่พบ Supabase client');
    const configs = currentConfigs();
    const entries = [];
    if (!kinds || kinds.includes('day')) DAY_SETS.forEach(n => entries.push({ key:cfgKey('day', n), rows:configs.day[n] || [] }));
    if (!kinds || kinds.includes('outing')) {
      const by = configs.outing_by_count || latestOutingByCount();
      entries.push({ key:cfgKey('outing'), rows:by[14] || configs.outing || latestOutingRows(14) });
      [12,13,14].forEach(n => entries.push({ key:`${CFG_PREFIX}:OUTING:${n}`, rows:by[n] || latestOutingRows(n) }));
    }
    for (const ent of entries) {
      const payload = {
        code:ent.key,
        eligibility_code:null,
        zone:'SYSTEM',
        break_time:'-',
        main_rule:'SLOT_TEMPLATE_CONFIG',
        job_desc:JSON.stringify(ent.rows || []),
        is_outing:false,
        is_active:false,
        sort_order:99000,
        deleted_at:null,
        updated_by:sid()
      };
      const res = await sb.from('daily_position_masters').upsert(payload, { onConflict:'code,is_outing' });
      if (res.error) throw res.error;
    }
  }
  function applyConfigsToRuntime(){
    const configs = currentConfigs();
    try {
      const target = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS;
      if (target) DAY_SETS.forEach(n => { target[n] = sanitizeRows(configs.day[n] || [], false); });
      if (window.cnmiDayPositionSlotsV218) {
        window.cnmiDayPositionSlotsV218.DAY_POSITION_SLOT_SETS_218 = target;
        window.cnmiDayPositionSlotsV218.daySlotsForDateV224 = configuredDaySlotsForDate;
        window.cnmiDayPositionSlotsV218.outingSlotsV224 = () => sanitizeRows(currentConfigs().outing_by_count?.[14] || currentConfigs().outing || latestOutingRows(14), true);
        window.cnmiDayPositionSlotsV218.outingSlotsV232 = (count) => sanitizeRows(currentConfigs().outing_by_count?.[outingBucket(count)] || currentConfigs().outing || latestOutingRows(count), true);
        window.cnmiDayPositionSlotsV218.outingSlotsV226 = () => sanitizeRows(currentConfigs().outing_by_count?.[14] || currentConfigs().outing || latestOutingRows(14), true);
      }
    } catch (err) { console.warn(`${VERSION}: apply runtime config failed`, err); }
  }

  function selectedKind(){ return getState().kind || 'day'; }
  function selectedSet(){ return Number(getState().setNo || 10); }
  function selectedRows(){
    const cfg = currentConfigs();
    if (selectedKind() === 'outing') return cfg.outing_by_count?.[outingBucket(selectedSet())] || cfg.outing || latestOutingRows(selectedSet());
    return cfg.day[selectedSet()] || [];
  }
  function setSelectedRows(rows){
    const cfg = currentConfigs();
    if (selectedKind() === 'outing') {
      cfg.outing_by_count = cfg.outing_by_count || latestOutingByCount();
      const n = outingBucket(selectedSet());
      cfg.outing_by_count[n] = sanitizeRows(rows, true);
      if (n === 14) cfg.outing = cfg.outing_by_count[14];
    } else cfg.day[selectedSet()] = sanitizeRows(rows, false);
    getState().configs = cfg;
    writeLocal(cfg);
    applyConfigsToRuntime();
  }
  function reindex(rows, outing){ return sanitizeRows(rows.map((r, i) => ({ ...r, sort_order:i + 1, is_outing:outing })), outing); }

  function slotManagerPageHtml(){
    const st = getState();
    const kind = selectedKind();
    const setNo = selectedSet();
    const rows = selectedRows();
    const kindOptions = `<option value="day" ${kind==='day'?'selected':''}>วันทำงานปกติ</option><option value="outing" ${kind==='outing'?'selected':''}>วันที่ออกหน่วย</option>`;
    const availableSets = kind === 'outing' ? [12,13,14] : DAY_SETS;
    const setOptions = availableSets.map(n => `<option value="${n}" ${setNo===n?'selected':''}>${n} คน</option>`).join('');
    const tableRows = rows.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td><b>${esc(r.code)}</b><div class="muted">${esc(r.eligibility_code || '')}</div></td>
      <td>${esc(r.zone || '-')}</td>
      <td>${esc(r.main_rule || '-')}</td>
      <td>${esc(r.break_time || '-')}</td>
      <td class="v224-desc-cell">${esc(r.job_desc || '-')}</td>
      <td class="v224-actions-cell">
        <button class="tiny-btn" type="button" data-v224-edit-slot="${i}">แก้ไข</button>
        <button class="tiny-btn" type="button" data-v224-copy-slot="${i}">คัดลอก</button>
        <button class="tiny-btn" type="button" data-v224-move-slot="${i}:-1" ${i===0?'disabled':''}>↑</button>
        <button class="tiny-btn" type="button" data-v224-move-slot="${i}:1" ${i===rows.length-1?'disabled':''}>↓</button>
        <button class="tiny-btn danger" type="button" data-v224-delete-slot="${i}">ลบ</button>
      </td>
    </tr>`).join('');
    const title = kind === 'outing' ? `ชุด Slot วันที่ออกหน่วย ${outingBucket(setNo)} คน` : `ชุด Slot วันทำงานปกติ ${setNo} คน`;
    return `<div class="position-management-page v224-position-template-page">
      <div class="card wide-card v224-slot-crud-card">
        <div class="section-title">
          <div><h3>ชุด Slot ตำแหน่งกลางวัน</h3><p class="hint">จัดการ Slot ผ่านหน้าเว็บนี้ได้เลย: เพิ่ม / แก้ไข / ลบ / เรียงลำดับ แล้วบันทึกเป็นต้นทางเดียวของตารางรายวันและรายเดือน</p></div>
          <div class="actions"><button type="button" class="ghost-btn" data-v224-refresh-config>รีเฟรชจากฐานข้อมูลล่าสุด</button><button type="button" class="primary-btn" data-v224-save-all>บันทึกทั้งหมดเป็นฐานตำแหน่งปัจจุบัน</button></div>
        </div>
        <div class="v224-template-toolbar">
          <label>ประเภทวัน <select id="slotTemplateKindV224" data-v224-kind>${kindOptions}</select></label>
          <label>จำนวนคน <select id="slotTemplateSetV224" data-v224-set>${setOptions}</select></label>
          <button type="button" class="soft-btn" data-v224-add-slot>เพิ่ม Slot</button>
          <button type="button" class="primary-btn" data-v224-save-current>บันทึกชุดนี้</button>
        </div>
        <div class="notice soft-notice compact"><b>${esc(title)}</b> • ${rows.length} Slot</div>
        <div class="table-wrap compact-table v224-slot-table"><table><thead><tr><th>#</th><th>ตำแหน่ง</th><th>โซน</th><th>ผู้ปฏิบัติหลัก</th><th>เวลาพัก</th><th>รายละเอียดหน้าที่</th><th>จัดการ</th></tr></thead><tbody>${tableRows || `<tr><td colspan="7" class="muted">ยังไม่มี Slot ในชุดนี้ กด “เพิ่ม Slot” ได้เลย</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  }
  function renderPositionManagementV224(){
    const root = document.getElementById('pageContent');
    if (!root || state?.page !== 'positionManagement') return;
    root.innerHTML = slotManagerPageHtml();
  }

  function openSlotModal(idx=null, copy=false){
    const rows = selectedRows();
    const editing = idx == null ? null : rows[Number(idx)];
    const isOut = selectedKind() === 'outing';
    const row = editing ? { ...editing } : { code:'', zone:isOut?'ออกหน่วย':'Blood Bank', break_time:isOut?'ออกหน่วย':'12:00', main_rule:'', job_desc:'', eligibility_code:'' };
    if (copy && row.code) row.code = `${row.code} copy`;
    const zoneOptions = ZONES.map(z => `<option value="${esc(z)}" ${row.zone===z?'selected':''}>${esc(z)}</option>`).join('');
    const title = editing && !copy ? 'แก้ไข Slot' : 'เพิ่ม Slot';
    showModal(`<div class="v224-slot-modal"><h2>${title}</h2><p class="hint">${selectedKind()==='outing'?`วันที่ออกหน่วย ${outingBucket(selectedSet())} คน`:`${selectedSet()} คน`}</p>
      <form id="slotTemplateFormV224" class="form-grid compact-form" action="javascript:void(0)">
        <input type="hidden" name="idx" value="${idx == null || copy ? '' : esc(idx)}">
        <label>Code ตำแหน่ง <input name="code" value="${esc(row.code || '')}" required placeholder="เช่น BB-Report 1"></label>
        <label>โซน <select name="zone">${zoneOptions}</select><input type="hidden" name="zone_hidden" value="${esc(row.zone || (isOut?'ออกหน่วย':'Blood Bank'))}"></label>
        <label>ผู้ปฏิบัติหลัก <input name="main_rule" value="${esc(row.main_rule || '')}" required placeholder="เช่น MT เท่านั้น / Clerk หรือ แตง"></label>
        <label>เวลาพัก <input name="break_time" value="${esc(row.break_time || '')}" required placeholder="11:00 / 12:00 / ออกหน่วย"></label>
        <label class="wide">รายละเอียดหน้าที่ <textarea name="job_desc" rows="5" required>${esc(row.job_desc || '')}</textarea></label>
        <label class="wide">Eligibility Code <input name="eligibility_code" value="${esc(row.eligibility_code || '')}" placeholder="ปล่อยว่างได้ ระบบจะใช้ Code ให้เอง"></label>
        <div class="actions wide modal-form-actions"><button type="button" class="ghost-btn" onclick="closeModal()">ยกเลิก</button><button type="button" class="primary-btn" data-v224-save-slot-modal>บันทึก Slot</button></div>
      </form></div>`, { large:true });
  }
  function saveSlotModal(form){
    const fd = new FormData(form);
    const idxRaw = String(fd.get('idx') || '').trim();
    const idx = idxRaw === '' ? null : Number(idxRaw);
    const isOut = selectedKind() === 'outing';
    const code = String(fd.get('code') || '').trim();
    const zone = String(fd.get('zone') || fd.get('zone_hidden') || '').trim() || (isOut ? 'ออกหน่วย' : 'Blood Bank');
    const row = {
      code,
      zone,
      main_rule:String(fd.get('main_rule') || '').trim(),
      break_time:String(fd.get('break_time') || '').trim() || (zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
      job_desc:String(fd.get('job_desc') || '').trim(),
      eligibility_code:String(fd.get('eligibility_code') || '').trim() || (zone === 'ออกหน่วย' ? `OUTING:${code}` : code),
      is_outing:isOut,
      is_active:true
    };
    if (!row.code || !row.main_rule || !row.job_desc) return toast('กรุณากรอก Code, ผู้ปฏิบัติหลัก และรายละเอียดหน้าที่ให้ครบ', 'error');
    const rows = selectedRows().slice();
    const dup = rows.some((r, i) => String(r.code || '').trim() === row.code && i !== idx);
    if (dup) return toast('Code นี้มีอยู่ในชุดนี้แล้ว ถ้าต้องการตำแหน่งซ้ำให้ใส่เลขต่อท้าย เช่น DR-Main 1 / DR-Main 2', 'error');
    if (idx == null || !rows[idx]) rows.push({ ...row, sort_order:rows.length + 1 });
    else rows[idx] = { ...rows[idx], ...row };
    setSelectedRows(reindex(rows, isOut));
    try { closeModal(); } catch (_) {}
    renderPositionManagementV224();
    toast('แก้ไข Slot ในหน้านี้แล้ว อย่าลืมกด “บันทึกชุดนี้” หรือ “บันทึกทั้งหมดเป็นฐานตำแหน่ง”');
  }
  async function saveCurrentConfigOnly(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกชุด Slot'); } catch (_) {}
    try {
      await saveConfigRows([selectedKind() === 'outing' ? 'outing' : 'day']);
      writeLocal(currentConfigs());
      applyConfigsToRuntime();
      toast('บันทึกชุด Slot แล้ว');
    } catch (err) { console.error(`${VERSION}: save current failed`, err); toast('บันทึกชุด Slot ไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  function isOutingRow(row){ return row?.is_outing === true || String(row?.zone || '') === 'ออกหน่วย' || String(row?.eligibility_code || '').startsWith('OUTING:'); }
  function uniqueDayRows(){
    const map = new Map();
    const cfg = currentConfigs();
    DAY_SETS.forEach(n => (cfg.day[n] || []).forEach(r => { const code = String(r.code || '').trim(); if (code && !map.has(code)) map.set(code, { ...r, is_outing:false }); }));
    return Array.from(map.values());
  }
  async function saveAllToMasters(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const ok = await (typeof confirmDialog === 'function' ? confirmDialog('บันทึกชุด Slot ทั้งหมดเป็นต้นทาง และอัปเดตฐานตำแหน่งที่ระบบใช้จริง?', 'ยืนยันบันทึก Slot') : Promise.resolve(window.confirm('บันทึกชุด Slot ทั้งหมด?')));
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึก Slot ทั้งหมด'); } catch (_) {}
    try {
      const cfg = currentConfigs();
      await saveConfigRows();
      const dayRows = uniqueDayRows();
      const outingRows = sanitizeRows(cfg.outing_by_count?.[14] || cfg.outing || latestOutingRows(14), true);
      const dayCodes = new Set(dayRows.map(r => r.code));
      const outingCodes = new Set(outingRows.map(r => r.code));
      const existingRes = await sb.from('daily_position_masters').select('*');
      if (existingRes.error) throw existingRes.error;
      const existing = existingRes.data || [];
      for (const row of existing) {
        if (isConfigRow(row)) continue;
        const code = String(row?.code || '').trim();
        if (!code) continue;
        if (isOutingRow(row)) {
          if (!outingCodes.has(code) && row.is_active !== false) {
            const res = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
            if (res.error) throw res.error;
          }
        } else if (!dayCodes.has(code) && row.is_active !== false) {
          const res = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
          if (res.error) throw res.error;
        }
      }
      const upsertRow = async (r, outing) => {
        const payload = {
          code:r.code,
          eligibility_code:r.eligibility_code || (r.zone === 'ออกหน่วย' ? `OUTING:${r.code}` : r.code),
          zone:outing ? (r.zone || 'ออกหน่วย') : r.zone,
          break_time:r.break_time || (r.zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
          main_rule:r.main_rule || null,
          job_desc:r.job_desc || null,
          is_outing:!!outing,
          is_active:true,
          sort_order:Number(r.sort_order || 999),
          deleted_at:null,
          updated_by:sid()
        };
        const found = existing.find(x => String(x?.code || '').trim() === String(r.code || '').trim() && !isConfigRow(x) && (!!isOutingRow(x)) === !!outing);
        const res = found?.id
          ? await sb.from('daily_position_masters').update(payload).eq('id', found.id)
          : await sb.from('daily_position_masters').insert({ ...payload, created_by:sid() });
        if (res.error) throw res.error;
      };
      for (const r of dayRows) await upsertRow(r, false);
      for (const r of outingRows) await upsertRow(r, true);
      if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true });
      else if (typeof loadAllData === 'function') await loadAllData();
      await loadDbConfigs(true);
      renderPositionManagementV224();
      toast('บันทึก Slot ทั้งหมดและอัปเดตฐานตำแหน่งแล้ว');
    } catch (err) { console.error(`${VERSION}: save all failed`, err); toast('บันทึกทั้งหมดไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }

  // ----- Monthly auto plan hard-fix -----
  function rangeOfMonth(key){
    try { const r = getMonthRange(key); return { y:r.y, m:r.m, last:r.last || new Date(r.y, r.m, 0).getDate() }; }
    catch (_) { const [yy,mm] = String(key || monthNow()).split('-').map(Number); const y = yy || new Date().getFullYear(); const m = mm || (new Date().getMonth()+1); return { y, m, last:new Date(y, m, 0).getDate() }; }
  }
  function monthKeyFromUi(){
    const input = document.getElementById('positionMonthInput');
    return String(input?.value || state?.positionMonthKey || state?.monthKey || monthNow()).slice(0,7);
  }
  function isNoPosition(date){
    try { return !!isNoPositionDay(date); } catch (_) {}
    try { return (typeof isWeekend === 'function' && isWeekend(date)) || (typeof isHolidayDate === 'function' && isHolidayDate(date)); } catch (_) {}
    const d = new Date(`${date}T00:00:00`);
    return d.getDay() === 0 || d.getDay() === 6;
  }
  function activePositionStaff(date){
    try { const list = typeof dailyWorkingStaff === 'function' ? (dailyWorkingStaff(date) || []) : []; if (list.length) return list; } catch (_) {}
    let rows = Array.isArray(state?.staff) ? state.staff.slice() : [];
    rows = rows.filter(st => {
      try { return isDailyPositionEnabled(st) && !isActiveLeaveOn(st.id, date); }
      catch (_) { return st?.id && st?.is_active !== false && st?.active !== false; }
    });
    try { return orderedStaff(rows); } catch (_) { return rows.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function bucketForCount(count){ return Math.max(8, Math.min(14, Number(count) || 14)); }
  function configuredDaySlotsForDate(date){
    const working = activePositionStaff(date).length;
    const n = bucketForCount(working);
    return sanitizeRows((currentConfigs().day[n] || currentConfigs().day[10] || []), false);
  }
  function configuredOutingSlots(date){ const cfg = currentConfigs(); const n = date ? outingBucket(activePositionStaff(date).length) : 14; return sanitizeRows(cfg.outing_by_count?.[n] || cfg.outing || latestOutingRows(n), true); }
  function hasOutingSafe(date){ try { return !!hasOuting(date); } catch (_) { return false; } }
  function outingIds(date){ try { return new Set(outingParticipants(date) || []); } catch (_) { return new Set(); } }
  function baseCode(code){ try { return positionBaseCode(code); } catch (_) { return String(code || '').replace(/\s+#\d+$/, '').trim(); } }
  function zoneGroup(pos){
    const z = String(pos?.zone || '').trim();
    if (z === 'Blood Bank' || z === 'Manual') return 'BB/Manual';
    if (z === 'Donor Room') return 'Donor Room';
    if (z === 'ออกหน่วย') return 'Outing';
    return z || 'Other';
  }
  function isQc(pos){ const c = baseCode(pos?.code || pos?.position_code || ''); return /^BB-Report/.test(c) || c === 'DR-Processing' || c === 'DR-Preparation'; }
  function loadWeight(pos){
    try { return Number(positionLoadWeight(pos)) || 1; } catch (_) {}
    const c = baseCode(pos?.code || '');
    if (/^BB-Report/.test(c) || c === 'DR-Processing') return 1.35;
    if (/^BB-Manual/.test(c) || c === 'BB-Approve') return 1.2;
    return 1;
  }
  function fiscalStart(date){
    const d = new Date(`${norm(date)}T00:00:00`);
    const y = Number.isFinite(d.getTime()) ? d.getFullYear() : new Date().getFullYear();
    const m = Number.isFinite(d.getTime()) ? d.getMonth() : new Date().getMonth();
    return `${m >= 9 ? y : y - 1}-10-01`;
  }
  function historicalStats(staffId, date){
    const start = fiscalStart(date);
    const end = norm(date);
    const out = { group:{}, qc:0, code:{} };
    (state.positions || []).forEach(r => {
      const d = norm(r?.work_date);
      if (!d || d < start || d >= end || String(r?.staff_id || '') !== String(staffId || '')) return;
      const pos = { code:r?.position_code || r?.code, position_code:r?.position_code, zone:r?.zone };
      const g = zoneGroup(pos); const c = baseCode(pos.code || '');
      out.group[g] = (out.group[g] || 0) + 1; out.code[c] = (out.code[c] || 0) + 1; if (isQc(pos)) out.qc += 1;
    });
    return out;
  }
  function initCount(){ return { total:0, load:0, group:{}, code:{}, qc:0 }; }
  function addCount(counts, staffId, pos){
    if (!staffId || !pos) return;
    const c = counts[staffId] || (counts[staffId] = initCount());
    const g = zoneGroup(pos); const code = baseCode(pos.code || pos.position_code || '');
    c.total += 1; c.load += loadWeight(pos); c.group[g] = (c.group[g] || 0) + 1; c.code[code] = (c.code[code] || 0) + 1; if (isQc(pos)) c.qc += 1;
  }
  function basicRuleOk(staff, pos){
    const rule = String(pos?.main_rule || '').toLowerCase();
    const nick = String(staff?.nickname || '').trim();
    const type = String(staff?.staff_type || '').trim();
    const isMt = type === 'MT' || /mt/i.test(type);
    const isClerk = type === 'เคิก' || /clerk/i.test(type) || /ธุรการ/.test(type);
    if (/mt/.test(rule) && /เท่านั้น/.test(rule) && nick !== 'แตง') return isMt;
    if ((/clerk/.test(rule) || /เคิก/.test(rule)) && /แตง/.test(rule) && !/mt/.test(rule)) return isClerk || nick === 'แตง';
    if (/mt/.test(rule) && /แตง/.test(rule)) return isMt || nick === 'แตง';
    return true;
  }
  function eligible(staff, pos, date, strict=true){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff) || isActiveLeaveOn(staff.id, date)) return false; } catch (_) {}
    if (strict) {
      try { if (typeof positionCandidateOk === 'function') return !!positionCandidateOk(staff, pos, date); } catch (_) {}
      try { if (!positionRuleOk(staff, pos?.main_rule)) return false; } catch (_) { if (!basicRuleOk(staff, pos)) return false; }
      try { return positionEligible(staff, pos?.eligibility_code || pos?.code); } catch (_) { return true; }
    }
    return basicRuleOk(staff, pos);
  }
  function scoreStaff(staff, pos, counts, rows, date){
    const id = staff.id; const c = counts[id] || initCount(); const hist = historicalStats(id, date); const g = zoneGroup(pos); const code = baseCode(pos.code || '');
    let score = 0;
    score += c.load * 70 + c.total * 25;
    score += (c.group[g] || 0) * 95 + (hist.group[g] || 0) * 12;
    score += (c.code[code] || 0) * 180 + (hist.code[code] || 0) * 20;
    if (isQc(pos)) score += (c.qc || 0) * 220 + (hist.qc || 0) * 55;
    try { score += (Number(monthPositionCandidateScore(staff, pos, counts, rows, date, {})) || 0) * 0.15; } catch (_) {}
    return score;
  }
  function chooseStaff(pos, date, pool, used, counts, rows){
    let candidates = pool.filter(st => !used.has(String(st.id)) && eligible(st, pos, date, true));
    if (!candidates.length) candidates = pool.filter(st => !used.has(String(st.id)) && eligible(st, pos, date, false));
    candidates.sort((a,b) => scoreStaff(a, pos, counts, rows, date) - scoreStaff(b, pos, counts, rows, date) || (typeof compareStaffOrder === 'function' ? compareStaffOrder(a,b) : String(a.nickname || '').localeCompare(String(b.nickname || ''), 'th')));
    return candidates[0] || null;
  }
  function makeRow(date, staff, pos){
    try { if (typeof rowForStaffPosition === 'function') { const r = rowForStaffPosition(staff, date, pos, {}); if (r?.staff_id && r?.position_code) return r; } } catch (_) {}
    return { work_date:date, position_code:pos.code, zone:pos.zone || '', break_time:pos.break_time || '-', main_rule:pos.main_rule || '', job_desc:pos.job_desc || '', staff_id:staff.id, updated_by:sid() };
  }
  function blankRowsForMonth(key){
    const { y, m, last } = rangeOfMonth(key); const rows = [];
    for (let day=1; day<=last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`; if (isNoPosition(date)) continue;
      activePositionStaff(date).forEach(st => rows.push({ work_date:date, position_code:'', code:'', zone:'', break_time:'', main_rule:'', job_desc:'', staff_id:st.id, updated_by:sid(), _blankTableV224:true }));
    }
    return { monthKey:key, rows, blankTable:true };
  }
  function buildAutoPlan(key){
    applyConfigsToRuntime();
    const { y, m, last } = rangeOfMonth(key); const rows = []; const counts = {};
    for (let day=1; day<=last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`; if (isNoPosition(date)) continue;
      const working = activePositionStaff(date); if (!working.length) continue;
      const used = new Set();
      if (hasOutingSafe(date)) {
        const outIds = outingIds(date);
        const outingPool = working.filter(st => outIds.has(st.id));
        const roomPool = working.filter(st => !outIds.has(st.id));
        const outingSet = configuredOutingSlots(date);
        const outingSlots = outingSet.filter(p => String(p.zone || '') === 'ออกหน่วย');
        const roomSlots = outingSet.filter(p => ['Blood Bank','Manual'].includes(String(p.zone || '')));
        outingSlots.forEach(pos => { const st = chooseStaff(pos, date, outingPool, used, counts, rows); if (st) { used.add(String(st.id)); rows.push(makeRow(date, st, pos)); addCount(counts, st.id, pos); } });
        (roomSlots.length ? roomSlots : configuredDaySlotsForDate(date).filter(p => ['Blood Bank','Manual'].includes(String(p.zone || '')))).forEach(pos => { const st = chooseStaff(pos, date, roomPool, used, counts, rows); if (st) { used.add(String(st.id)); rows.push(makeRow(date, st, pos)); addCount(counts, st.id, pos); } });
      } else {
        configuredDaySlotsForDate(date).forEach(pos => { const st = chooseStaff(pos, date, working, used, counts, rows); if (st) { used.add(String(st.id)); rows.push(makeRow(date, st, pos)); addCount(counts, st.id, pos); } });
      }
    }
    return { monthKey:key, rows, autoPlanV224:true };
  }
  async function confirmReplace(action){
    const key = monthKeyFromUi();
    const hasRealDraft = state?.monthPositionDraft?.monthKey === key && (state.monthPositionDraft.rows || []).some(r => r?.position_code);
    if (!hasRealDraft) return true;
    try { if (typeof confirmDialog === 'function') return await confirmDialog(`มีร่างที่ยังไม่ได้บันทึก ต้องการ${action}และแทนที่ร่างเดิมหรือไม่?`, 'ยืนยันแทนที่ร่าง'); } catch (_) {}
    return window.confirm(`มีร่างที่ยังไม่ได้บันทึก ต้องการ${action}และแทนที่ร่างเดิมหรือไม่?`);
  }
  async function createBlank(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (!(await confirmReplace('สร้างตารางที่ไม่มีตำแหน่ง'))) return;
    const key = monthKeyFromUi(); state.positionMonthKey = key; state.monthPositionDraft = blankRowsForMonth(key); renderPage(); toast('สร้างตารางที่ไม่มีตำแหน่งแล้ว');
  }
  async function generateAuto(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (!(await confirmReplace('สร้างแผนทั้งเดือน'))) return;
    await loadDbConfigs(false);
    const key = monthKeyFromUi();
    let draft;
    try { draft = buildAutoPlan(key); } catch (err) { console.error(`${VERSION}: auto build failed`, err); return toast('สร้างแผนอัตโนมัติไม่สำเร็จ: ' + friendly(err), 'error'); }
    state.positionMonthKey = key; state.monthPositionDraft = draft; renderPage();
    const real = (draft.rows || []).filter(r => r?.position_code && r?.staff_id).length;
    if (!real) return toast('ยังสร้างแผนอัตโนมัติไม่ได้ เพราะไม่พบ Slot หรือเจ้าหน้าที่ที่เข้าเงื่อนไข', 'error');
    toast(`สร้างแผนทั้งเดือนแล้ว ${real} รายการ ตรวจทานก่อนบันทึก/ประกาศ`);
  }
  function renderMonthPositionPageV224(){
    if (!admin()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>';
    const key = state.positionMonthKey || state.monthKey || monthNow();
    const r = rangeOfMonth(key); const dates = Array.from({ length:r.last }, (_,i) => `${r.y}-${pad2(r.m)}-${pad2(i+1)}`);
    const rows = state.monthPositionDraft?.monthKey === key ? (state.monthPositionDraft.rows || []) : (state.positions || []).filter(x => String(x.work_date || '').startsWith(key));
    const savedCount = (state.positions || []).filter(x => String(x.work_date || '').startsWith(key)).length;
    const workingDays = dates.filter(d => !isNoPosition(d)).length;
    const matrix = typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix(rows, dates) : '';
    const b1 = typeof badge === 'function' ? badge(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black') : `<span>${savedCount}</span>`;
    const b2 = typeof badge === 'function' ? badge(`วันทำงาน ${workingDays} วัน`, 'blue') : `<span>${workingDays}</span>`;
    return `<div class="card monthly-position-page v224-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3></div></div>
      <div class="v224-month-toolbar">
        <label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label>
        <button class="ghost-btn" type="button" data-v224-create-blank-month>สร้างตารางที่ไม่มีตำแหน่ง</button>
        <button class="soft-btn" type="button" data-v224-generate-month-plan>สร้างแผนทั้งเดือน</button>
        <button class="primary-btn" type="button" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button>
        <button class="ghost-btn danger" type="button" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button>
        <button class="ghost-btn" type="button" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button>
        <button class="soft-btn" type="button" data-position-month-overview-v169>ดูภาพรวมจัดตำแหน่ง</button>
        <button class="soft-btn qc-rotation-btn" type="button" data-qc-rotation-v169>ติดตามการหมุนเวียน QC</button>
        <span class="v224-mini-badges">${b1} ${b2}</span>
      </div>${matrix}</div>`;
  }

  try { window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV224(key){ return buildAutoPlan(String(key || monthKeyFromUi()).slice(0,7)); }; } catch (_) { window.buildMonthlyPositionDraft = function(key){ return buildAutoPlan(String(key || monthKeyFromUi()).slice(0,7)); }; }
  try { window.renderPositionMonthPage = renderPositionMonthPage = renderMonthPositionPageV224; } catch (_) { window.renderPositionMonthPage = renderMonthPositionPageV224; }

  const prevRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (prevRenderPage) {
    window.renderPage = renderPage = function renderPageV224(){
      const out = prevRenderPage.apply(this, arguments);
      setTimeout(() => {
        try { if (state?.page === 'positionManagement') renderPositionManagementV224(); } catch (err) { console.warn(`${VERSION}: render position management failed`, err); }
      }, 0);
      return out;
    };
  }

  document.addEventListener('change', function(e){
    const kind = e.target?.closest?.('[data-v224-kind]');
    if (kind) { getState().kind = kind.value === 'outing' ? 'outing' : 'day'; if (getState().kind === 'outing' && ![12,13,14].includes(Number(getState().setNo))) getState().setNo = 14; renderPositionManagementV224(); return; }
    const set = e.target?.closest?.('[data-v224-set]');
    if (set) { getState().setNo = Number(set.value) || 10; renderPositionManagementV224(); return; }
  }, true);

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('button');
    if (!btn) return;
    const text = (btn.textContent || '').trim();
    const isGen = btn.matches('[data-v224-generate-month-plan],[data-v223-generate-month-plan],[data-generate-month-positions]') || text === 'สร้างแผนทั้งเดือน';
    const isBlank = btn.matches('[data-v224-create-blank-month],[data-v223-create-blank-month],[data-create-blank-month-positions]') || text === 'สร้างตารางที่ไม่มีตำแหน่ง' || text === 'สร้างตารางเปล่า';
    if (isGen || isBlank) {
      e.preventDefault(); e.stopPropagation(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (isGen) generateAuto(); else createBlank();
      return;
    }
    const add = btn.closest('[data-v224-add-slot]');
    if (add) { e.preventDefault(); e.stopPropagation(); openSlotModal(null); return; }
    const edit = btn.closest('[data-v224-edit-slot]');
    if (edit) { e.preventDefault(); e.stopPropagation(); openSlotModal(Number(edit.getAttribute('data-v224-edit-slot'))); return; }
    const copy = btn.closest('[data-v224-copy-slot]');
    if (copy) { e.preventDefault(); e.stopPropagation(); openSlotModal(Number(copy.getAttribute('data-v224-copy-slot')), true); return; }
    const mv = btn.closest('[data-v224-move-slot]');
    if (mv) {
      e.preventDefault(); e.stopPropagation();
      const [iRaw, dRaw] = String(mv.getAttribute('data-v224-move-slot') || '').split(':');
      const i = Number(iRaw); const d = Number(dRaw); const rows = selectedRows().slice(); const j = i + d;
      if (rows[i] && rows[j]) { const t = rows[i]; rows[i] = rows[j]; rows[j] = t; setSelectedRows(reindex(rows, selectedKind()==='outing')); renderPositionManagementV224(); }
      return;
    }
    const del = btn.closest('[data-v224-delete-slot]');
    if (del) {
      e.preventDefault(); e.stopPropagation();
      (async () => {
        const idx = Number(del.getAttribute('data-v224-delete-slot')); const rows = selectedRows().slice(); const row = rows[idx]; if (!row) return;
        const ok = await (typeof confirmDialog === 'function' ? confirmDialog(`ลบ Slot ${row.code} ออกจากชุดนี้?`, 'ยืนยันลบ Slot') : Promise.resolve(window.confirm(`ลบ Slot ${row.code}?`)));
        if (!ok) return; rows.splice(idx, 1); setSelectedRows(reindex(rows, selectedKind()==='outing')); renderPositionManagementV224(); toast('ลบ Slot ออกจากชุดนี้แล้ว อย่าลืมบันทึก');
      })();
      return;
    }
    const saveModal = btn.closest('[data-v224-save-slot-modal]');
    if (saveModal) { e.preventDefault(); e.stopPropagation(); const form = saveModal.closest('form'); if (form) saveSlotModal(form); return; }
    const saveCurrent = btn.closest('[data-v224-save-current]');
    if (saveCurrent) { e.preventDefault(); e.stopPropagation(); saveCurrentConfigOnly(); return; }
    const saveAll = btn.closest('[data-v224-save-all]');
    if (saveAll) { e.preventDefault(); e.stopPropagation(); saveAllToMasters(); return; }
    const refresh = btn.closest('[data-v224-refresh-config]');
    if (refresh) { e.preventDefault(); e.stopPropagation(); (async () => { await loadDbConfigs(true); renderPositionManagementV224(); toast('รีเฟรชจากฐานข้อมูลแล้ว'); })(); return; }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v224-position-template-page{display:block}.v224-slot-crud-card{margin-bottom:14px}.v224-template-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:10px 0}.v224-template-toolbar label{min-width:190px}.v224-template-toolbar .hidden{display:none!important}.v224-slot-table table td{vertical-align:top}.v224-desc-cell{min-width:430px;white-space:normal;line-height:1.45}.v224-actions-cell{min-width:230px;display:flex;gap:6px;flex-wrap:wrap}.v224-slot-modal textarea{min-height:140px}.v224-month-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:8px 0 12px}.v224-month-toolbar label{min-width:170px}.v224-month-toolbar button{white-space:nowrap}.v224-mini-badges{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.v224-monthly-position-page .notice,.v224-monthly-position-page .v218-slot-note,.v224-monthly-position-page .v174-save-mode-note,.v224-monthly-position-page .matrix-legend,.v224-monthly-position-page .month-position-summary-hint{display:none!important}
    @media(max-width:760px){.v224-template-toolbar>*{width:100%}.v224-template-toolbar button{width:100%}.v224-desc-cell{min-width:280px}.v224-month-toolbar>*{width:100%}.v224-month-toolbar button{width:100%}.v224-mini-badges{width:100%}}
  `;
  document.head.appendChild(style);

  setTimeout(async () => {
    await loadDbConfigs(false);
    if (state?.page === 'positionManagement') renderPositionManagementV224();
  }, 120);

  window.cnmiV224 = { loadDbConfigs, currentConfigs, applyConfigsToRuntime, buildAutoPlan, generateAuto, createBlank, renderPositionManagementV224, saveAllToMasters };
  console.info(`${VERSION} loaded`);
})();
