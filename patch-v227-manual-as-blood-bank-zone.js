/* =========================
   V227 Outing Template + Compact Month Position + Manual-as-Blood-Bank
   V308: Separate total staff present from staff counted toward Slot (trainee/Intern excluded).
   - Outing-date template can contain Outing / Blood Bank / Donor Room slots; Manual is counted/displayed as Blood Bank.
   - Outing days use the outing-date template only, not weekly rotation.
   - Outing slots are assigned from activity participants; non-outing slots are assigned from staff not joining the outing.
   - Monthly matrix rows are more compact and the summary sticky column has a solid white background.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V227_MANUAL_AS_BLOOD_BANK_ZONE';
  if (window.__CNMI_V227_MANUAL_AS_BLOOD_BANK_ZONE__) return;
  window.__CNMI_V227_MANUAL_AS_BLOOD_BANK_ZONE__ = true;

  const CFG_PREFIX = '__CNMI_SLOT_TEMPLATE_V224__';
  const LS_KEY = 'cnmi_slot_template_v224_cache';
  const DAY_SETS = [8,9,10,11,12,13,14];
  const ZONES = ['Blood Bank','Donor Room','ออกหน่วย'];
  const ROOM_COLUMNS = ['Blood Bank','Donor Room','ออกหน่วย'];
  const oldV224 = window.cnmiV224 ? { ...window.cnmiV224 } : {};

  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function norm(v){ try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } }
  function pad2(n){ try { return pad(n); } catch (_) { return String(n).padStart(2,'0'); } }
  function today(){ try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } }
  function toast(msg, tone){ try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } }
  function friendly(err){ try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } }
  function admin(){ try { return isAdmin(); } catch (_) { return false; } }
  function sid(){ try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } }
  function safeStaffId(v){ return String(v == null ? '' : v).trim(); }
  function staffName(st){ return st ? (st.nickname || st.full_name || st.email || '-') : '-'; }
  function badgeSafe(text, tone){ try { return badge(text, tone); } catch (_) { return `<span class="badge ${esc(tone || 'blue')}">${esc(text)}</span>`; } }
  function emptySafe(text){ try { return empty(text); } catch (_) { return `<div class="empty-state">${esc(text)}</div>`; } }
  function staffPillSafe(id){ try { return id ? staffPill(id) : '<span class="muted">-</span>'; } catch (_) { return id ? esc(id) : '<span class="muted">-</span>'; } }
  function parseSafe(date){ try { return parseDate(norm(date)); } catch (_) { const [y,m,d] = norm(date).split('-').map(Number); return new Date(y || 2000, (m || 1) - 1, d || 1); } }
  function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function addDays(date, days){ const d = parseSafe(date); d.setDate(d.getDate() + Number(days || 0)); return dateKey(d); }
  function thDay(date){ try { return parseSafe(date).toLocaleDateString('th-TH', { weekday:'short' }); } catch (_) { return ''; } }
  function isWeekendSafe(date){ try { return isWeekend(norm(date)); } catch (_) { const d = parseSafe(date).getDay(); return d === 0 || d === 6; } }
  function isHolidaySafe(date){ try { return isHolidayDate(norm(date)); } catch (_) { return false; } }
  function isNoPosition(date){ try { return isNoPositionDay(norm(date)); } catch (_) { return isWeekendSafe(date) || isHolidaySafe(date); } }
  function hasOutingSafe(date){ try { return !!hasOuting(norm(date)); } catch (_) { return false; } }
  function outingIdSet(date){ try { return new Set((outingParticipants(norm(date)) || []).map(x => String(x))); } catch (_) { return new Set(); } }
  function compareStaffSafe(a,b){ try { return compareStaffOrder(a,b); } catch (_) { return String(staffName(a)).localeCompare(String(staffName(b)), 'th'); } }
  function orderStaff(rows){ try { return orderedStaff(rows || []); } catch (_) { return (rows || []).slice().sort(compareStaffSafe); } }
  function monthRange(key){
    try { const r = getMonthRange(key); return { y:r.y, m:r.m, last:r.last || new Date(r.y, r.m, 0).getDate(), start:r.start || `${r.y}-${pad2(r.m)}-01`, end:r.end || `${r.y}-${pad2(r.m)}-${pad2(r.last || new Date(r.y, r.m, 0).getDate())}` }; }
    catch (_) { const [yy,mm] = String(key || today().slice(0,7)).split('-').map(Number); const y = yy || new Date().getFullYear(); const m = mm || new Date().getMonth()+1; const last = new Date(y, m, 0).getDate(); return { y, m, last, start:`${y}-${pad2(m)}-01`, end:`${y}-${pad2(m)}-${pad2(last)}` }; }
  }
  function monthDates(key){ const r = monthRange(key); return Array.from({ length:r.last }, (_,i) => `${r.y}-${pad2(r.m)}-${pad2(i+1)}`); }
  function weekKey(date){ const d = parseSafe(date); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return dateKey(d); }
  function fiscalStart(date){ const d = parseSafe(date); const y = d.getFullYear(); return `${d.getMonth() >= 9 ? y : y - 1}-10-01`; }
  function fiscalEnd(date){ const y = Number(fiscalStart(date).slice(0,4)) + 1; return `${y}-09-30`; }
  function weekIndexFromFiscal(date){ const fs = parseSafe(fiscalStart(date)); const d = parseSafe(date); return Math.max(0, Math.floor((d.getTime() - fs.getTime()) / 86400000 / 7)); }
  function cfgKey(kind, n){ return kind === 'outing' ? `${CFG_PREFIX}:OUTING` : `${CFG_PREFIX}:DAY:${Number(n)}`; }
  function safeJson(v){ try { return JSON.parse(String(v || '')); } catch (_) { return null; } }
  function readLocal(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function writeLocal(configs){ try { localStorage.setItem(LS_KEY, JSON.stringify(configs || {})); } catch (_) {} }
  function clone(x){ try { return JSON.parse(JSON.stringify(x || null)); } catch (_) { return x; } }
  function stateSlot(){ if (!state.slotTemplateV224) state.slotTemplateV224 = { kind:'day', setNo:14, configs:null, loaded:false, loading:false }; return state.slotTemplateV224; }
  function displayZone(z, code=''){ const raw = String(z || '').trim(); const c = String(code || '').trim(); if (raw === 'ออกหน่วย') return 'ออกหน่วย'; if (raw === 'Manual' || /^BB-Manual/i.test(c) || /manual/i.test(c)) return 'Blood Bank'; if (raw === 'Donor Room' || /^DR-/i.test(c)) return 'Donor Room'; if (raw === 'Blood Bank' || /^BB-/i.test(c)) return 'Blood Bank'; return raw || 'Blood Bank'; }

  function fallbackOuting(){
    const base = [
      { code:'DR-Registration', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'ลงทะเบียน, คัดกรองความดัน ชีพจร อุณหภูมิ', sort_order:1 },
      { code:'DR-Preparation', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'มัส', job_desc:'เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน', sort_order:2 },
      { code:'DR-Finger 1', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด', sort_order:3 },
      { code:'DR-Finger 2', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด', sort_order:4 },
      { code:'DR-Main 1', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'เจาะเลือดตัวหลัก กลับมาปั่นเลือด', sort_order:5 },
      { code:'DR-Main', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'MT / แตง', job_desc:'เจาะเลือดตัวหลัก กลับมาปั่นเลือด', sort_order:6 },
      { code:'DR-Support', zone:'ออกหน่วย', break_time:'ออกหน่วย', main_rule:'แก๊ส / เฟื่อง', job_desc:'เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย', sort_order:7 }
    ];
    return sanitizeRows(base, 'outing');
  }
  function sanitizeRows(rows, kind){
    const isOutSet = kind === 'outing';
    return (Array.isArray(rows) ? rows : []).map((r, i) => {
      const code = String(r?.code || r?.position_code || '').trim();
      if (!code) return null;
      const rawZone = String(r?.zone || '').trim();
      const zone = isOutSet && rawZone === 'ออกหน่วย' ? 'ออกหน่วย' : displayZone(rawZone, code);
      const isOutingZone = zone === 'ออกหน่วย';
      return {
        ...r,
        code,
        position_code:code,
        zone,
        break_time:String(r?.break_time || '').trim() || (isOutingZone ? 'ออกหน่วย' : '-'),
        main_rule:String(r?.main_rule || '').trim() || '',
        job_desc:String(r?.job_desc || r?.detail || '').trim() || '',
        sort_order:Number(r?.sort_order || r?.order || (i + 1)) || (i + 1),
        eligibility_code:String(r?.eligibility_code || '').trim() || (isOutingZone ? `OUTING:${code}` : code),
        is_outing:isOutSet || r?.is_outing === true,
        is_active:r?.is_active === false ? false : true
      };
    }).filter(Boolean).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }
  function baseConfigs(){
    const out = { day:{}, outing:[] };
    let old = null;
    try { old = oldV224.currentConfigs?.(); } catch (_) {}
    DAY_SETS.forEach(n => {
      const rows = old?.day?.[n] || old?.day?.[String(n)] || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218?.[n] || [];
      out.day[n] = sanitizeRows(clone(rows) || [], 'day');
    });
    let outing = old?.outing || [];
    if (!outing.length) outing = fallbackOuting();
    out.outing = sanitizeRows(clone(outing) || [], 'outing');
    return out;
  }
  function mergeConfigs(base, extra){
    const out = clone(base || baseConfigs()) || { day:{}, outing:[] };
    if (extra?.day) DAY_SETS.forEach(n => { if (Array.isArray(extra.day[n]) || Array.isArray(extra.day[String(n)])) out.day[n] = sanitizeRows(extra.day[n] || extra.day[String(n)], 'day'); });
    if (Array.isArray(extra?.outing)) out.outing = sanitizeRows(extra.outing, 'outing');
    return out;
  }
  function currentConfigs226(){
    const st = stateSlot();
    if (st.configs) return st.configs;
    st.configs = mergeConfigs(baseConfigs(), readLocal());
    return st.configs;
  }
  async function loadConfigs226(force=false){
    const st = stateSlot();
    if (st.loading) return currentConfigs226();
    if (st.loaded && !force) return currentConfigs226();
    st.loading = true;
    let configs = mergeConfigs(baseConfigs(), readLocal());
    try {
      if (typeof sb !== 'undefined' && sb) {
        const res = await sb.from('daily_position_masters').select('code,job_desc').like('code', `${CFG_PREFIX}:%`);
        if (res.error) throw res.error;
        const db = {};
        (res.data || []).forEach(row => {
          const parsed = safeJson(row.job_desc);
          if (!Array.isArray(parsed)) return;
          const code = String(row.code || '');
          if (code.endsWith(':OUTING')) db.outing = sanitizeRows(parsed, 'outing');
          const m = code.match(/:DAY:(\d+)$/);
          if (m) { db.day = db.day || {}; db.day[Number(m[1])] = sanitizeRows(parsed, 'day'); }
        });
        configs = mergeConfigs(configs, db);
      }
    } catch (err) { console.warn(`${VERSION}: load config skipped`, err); }
    finally {
      st.configs = configs;
      st.loaded = true;
      st.loading = false;
      writeLocal(configs);
      applyConfigs226();
    }
    return configs;
  }
  function applyConfigs226(){
    const cfg = currentConfigs226();
    try {
      const target = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS;
      if (target) DAY_SETS.forEach(n => { target[n] = sanitizeRows(cfg.day[n] || [], 'day'); });
      if (window.cnmiDayPositionSlotsV218) {
        window.cnmiDayPositionSlotsV218.DAY_POSITION_SLOT_SETS_218 = target;
        window.cnmiDayPositionSlotsV218.outingSlotsV226 = () => outingTemplateSlots();
      }
    } catch (err) { console.warn(`${VERSION}: apply config failed`, err); }
  }
  async function saveConfigRows226(kinds){
    if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
    const cfg = currentConfigs226();
    const entries = [];
    if (!kinds || kinds.includes('day')) DAY_SETS.forEach(n => entries.push({ key:cfgKey('day', n), rows:sanitizeRows(cfg.day[n] || [], 'day') }));
    if (!kinds || kinds.includes('outing')) entries.push({ key:cfgKey('outing'), rows:sanitizeRows(cfg.outing || [], 'outing') });
    for (const ent of entries) {
      const payload = { code:ent.key, eligibility_code:null, zone:'SYSTEM', break_time:'-', main_rule:'SLOT_TEMPLATE_CONFIG', job_desc:JSON.stringify(ent.rows || []), is_outing:false, is_active:false, sort_order:99000, deleted_at:null, updated_by:sid() };
      const res = await sb.from('daily_position_masters').upsert(payload, { onConflict:'code,is_outing' });
      if (res.error) throw res.error;
    }
  }

  // Replace V224 exposed config helpers so V225/V226 read outing zones exactly as Admin configured.
  window.cnmiV224 = window.cnmiV224 || {};
  window.cnmiV224.currentConfigs = currentConfigs226;
  window.cnmiV224.loadDbConfigs = loadConfigs226;
  window.cnmiV224.applyConfigsToRuntime = applyConfigs226;

  function selectedKind(){ return stateSlot().kind || 'day'; }
  function selectedSet(){ return Number(stateSlot().setNo || 10); }
  function selectedRows(){ const cfg = currentConfigs226(); return selectedKind() === 'outing' ? (cfg.outing || []) : (cfg.day[selectedSet()] || []); }
  function setSelectedRows(rows){
    const cfg = currentConfigs226();
    if (selectedKind() === 'outing') cfg.outing = sanitizeRows(rows, 'outing');
    else cfg.day[selectedSet()] = sanitizeRows(rows, 'day');
    stateSlot().configs = cfg;
    writeLocal(cfg);
    applyConfigs226();
  }
  function reindex(rows){ return (rows || []).map((r,i) => ({ ...r, sort_order:i + 1 })); }

  function slotManagerHtml226(){
    const kind = selectedKind();
    const rows = selectedRows();
    const kindOptions = `<option value="day" ${kind==='day'?'selected':''}>วันทำงานปกติ 8-14 คน</option><option value="outing" ${kind==='outing'?'selected':''}>วันที่ออกหน่วย</option>`;
    const setOptions = DAY_SETS.map(n => `<option value="${n}" ${selectedSet()===n?'selected':''}>${n} คน</option>`).join('');
    const tableRows = rows.map((r,i) => `<tr>
      <td>${i+1}</td><td><b>${esc(r.code)}</b><br><span class="muted">${esc(r.eligibility_code || '')}</span></td><td>${esc(r.zone || '')}</td><td>${esc(r.main_rule || '')}</td><td>${esc(r.break_time || '')}</td><td class="v224-desc-cell">${esc(r.job_desc || '')}</td>
      <td class="v224-actions-cell"><button class="tiny-btn" type="button" data-v226-edit-slot="${i}">แก้ไข</button><button class="tiny-btn" type="button" data-v226-copy-slot="${i}">คัดลอก</button><button class="tiny-btn" type="button" data-v226-move-slot="${i}:-1" ${i===0?'disabled':''}>↑</button><button class="tiny-btn" type="button" data-v226-move-slot="${i}:1" ${i===rows.length-1?'disabled':''}>↓</button><button class="tiny-btn danger" type="button" data-v226-delete-slot="${i}">ลบ</button></td>
    </tr>`).join('');
    return `<div class="position-template-page v224-position-template-page v226-position-template-page">
      <div class="card wide-card v224-slot-crud-card"><div class="section-title"><div><h3>ชุด Slot ตำแหน่งกลางวัน</h3><p class="hint">จัดการ Slot ผ่านหน้าเว็บได้เลย: เพิ่ม / แก้ไข / ลบ / เรียงลำดับ แล้วบันทึกเป็นต้นทางเดียวของตารางรายวันและรายเดือน</p></div><div class="actions"><button class="ghost-btn" type="button" data-v226-refresh-config>รีเฟรชจากฐานข้อมูลล่าสุด</button><button class="primary-btn" type="button" data-v226-save-all>บันทึกทั้งหมดเป็นฐานตำแหน่งปัจจุบัน</button></div></div>
        <div class="v224-template-toolbar"><label>ประเภทวัน <select id="slotTemplateKindV226" data-v226-kind>${kindOptions}</select></label><label class="${kind==='outing'?'hidden':''}">จำนวนคน <select id="slotTemplateSetV226" data-v226-set>${setOptions}</select></label><button type="button" class="soft-btn" data-v226-add-slot>เพิ่ม Slot</button><button type="button" class="primary-btn" data-v226-save-current>บันทึกชุดนี้</button>${kind==='outing'?'<span class="badge orange">วันออกหน่วยใช้ชุดนี้เท่านั้น ไม่อิงรายสัปดาห์</span>':''}</div>
        ${kind==='outing'?'<div class="notice soft-notice compact"><b>วันที่ออกหน่วย:</b> สามารถเพิ่ม Slot โซน Blood Bank / Donor Room รวมในชุดนี้ได้เลย โดยงาน Manual ให้นับรวมเป็น Blood Bank ระบบจะจัดคนที่ติ๊กเข้าร่วมกิจกรรมลง Slot ออกหน่วย และจัดคนที่ไม่ได้ออกหน่วยลง Slot ห้องตามที่เพิ่มไว้</div>':''}
        <div class="section-title compact"><h4>ชุด Slot ${kind==='outing'?'วันที่ออกหน่วย':`${selectedSet()} คน`} • ${rows.length} Slot</h4></div>
        <div class="table-wrap compact-table v224-slot-table"><table><thead><tr><th>#</th><th>ตำแหน่ง</th><th>โซน</th><th>ผู้ปฏิบัติหลัก</th><th>เวลาพัก</th><th>รายละเอียดหน้าที่</th><th>จัดการ</th></tr></thead><tbody>${tableRows || `<tr><td colspan="7" class="muted">ยังไม่มี Slot ในชุดนี้ กด “เพิ่ม Slot” ได้เลย</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  }
  function renderPositionManagement226(){
    const root = document.getElementById('pageContent');
    if (!root || state?.page !== 'positionManagement') return;
    root.innerHTML = slotManagerHtml226();
  }
  function openSlotModal226(idx=null, copy=false){
    const rows = selectedRows();
    const editing = idx == null ? null : rows[Number(idx)];
    const isOut = selectedKind() === 'outing';
    const row = editing ? { ...editing, zone:displayZone(editing.zone, editing.code) } : { code:'', zone:isOut?'ออกหน่วย':'Blood Bank', break_time:isOut?'ออกหน่วย':'12:00', main_rule:'', job_desc:'', eligibility_code:'' };
    if (copy && row.code) row.code = `${row.code} copy`;
    const zoneOptions = ZONES.map(z => `<option value="${esc(z)}" ${row.zone===z?'selected':''}>${esc(z)}</option>`).join('');
    showModal(`<div class="v226-slot-modal"><h2>${editing && !copy ? 'แก้ไข Slot' : 'เพิ่ม Slot'}</h2><p class="hint">${isOut?'วันที่ออกหน่วย: เลือกโซนได้ทั้ง ออกหน่วย / Blood Bank / Donor Room โดย Manual ให้นับรวมเป็น Blood Bank':`${selectedSet()} คน`}</p>
      <form id="slotTemplateFormV226" class="form-grid compact-form" action="javascript:void(0)">
        <input type="hidden" name="idx" value="${idx == null || copy ? '' : esc(idx)}">
        <label>Code ตำแหน่ง <input name="code" value="${esc(row.code || '')}" required placeholder="เช่น BB-Report 1"></label>
        <label>โซน <select name="zone">${zoneOptions}</select></label>
        <label>ผู้ปฏิบัติหลัก <input name="main_rule" value="${esc(row.main_rule || '')}" required placeholder="เช่น MT เท่านั้น / Clerk หรือ แตง"></label>
        <label>เวลาพัก <input name="break_time" value="${esc(row.break_time || '')}" required placeholder="11:00 / 12:00 / ออกหน่วย"></label>
        <label class="wide">รายละเอียดหน้าที่ <textarea name="job_desc" rows="5" required>${esc(row.job_desc || '')}</textarea></label>
        <label class="wide">Eligibility Code <input name="eligibility_code" value="${esc(row.eligibility_code || '')}" placeholder="ปล่อยว่างได้: โซนออกหน่วยใช้ OUTING:Code / โซน BB ใช้ Code ปกติ"></label>
        <div class="actions wide modal-form-actions"><button type="button" class="ghost-btn" onclick="closeModal()">ยกเลิก</button><button type="button" class="primary-btn" data-v226-save-slot-modal>บันทึก Slot</button></div>
      </form></div>`, { large:true });
  }
  function saveSlotModal226(form){
    const fd = new FormData(form);
    const idxRaw = String(fd.get('idx') || '').trim();
    const idx = idxRaw === '' ? null : Number(idxRaw);
    const code = String(fd.get('code') || '').trim();
    const rawZone = String(fd.get('zone') || '').trim() || (selectedKind()==='outing' ? 'ออกหน่วย' : 'Blood Bank');
    const zone = displayZone(rawZone, code);
    const isOutingZone = zone === 'ออกหน่วย';
    const row = { code, zone, main_rule:String(fd.get('main_rule') || '').trim(), break_time:String(fd.get('break_time') || '').trim() || (isOutingZone ? 'ออกหน่วย' : '-'), job_desc:String(fd.get('job_desc') || '').trim(), eligibility_code:String(fd.get('eligibility_code') || '').trim() || (isOutingZone ? `OUTING:${code}` : code), is_outing:selectedKind()==='outing', is_active:true };
    if (!row.code || !row.main_rule || !row.job_desc) return toast('กรุณากรอก Code, ผู้ปฏิบัติหลัก และรายละเอียดหน้าที่ให้ครบ', 'error');
    const rows = selectedRows().slice();
    const dup = rows.some((r,i) => String(r.code || '').trim() === row.code && i !== idx);
    if (dup) return toast('Code นี้มีอยู่ในชุดนี้แล้ว ถ้าต้องการตำแหน่งซ้ำให้ใส่เลขต่อท้าย เช่น DR-Main 1 / DR-Main 2', 'error');
    if (idx == null || !rows[idx]) rows.push({ ...row, sort_order:rows.length + 1 });
    else rows[idx] = { ...rows[idx], ...row };
    setSelectedRows(reindex(rows));
    try { closeModal(); } catch (_) {}
    renderPositionManagement226();
    toast('แก้ไข Slot แล้ว อย่าลืมกด “บันทึกชุดนี้” หรือ “บันทึกทั้งหมดเป็นฐานตำแหน่ง”');
  }
  async function saveCurrent226(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกชุด Slot'); } catch (_) {}
    try { await saveConfigRows226([selectedKind()==='outing' ? 'outing' : 'day']); writeLocal(currentConfigs226()); applyConfigs226(); toast('บันทึกชุด Slot แล้ว'); }
    catch (err) { console.error(`${VERSION}: save current failed`, err); toast('บันทึกชุด Slot ไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  function isConfigRow(row){ return String(row?.code || '').startsWith(`${CFG_PREFIX}:`); }
  function isOutingMaster(row){ return row?.is_outing === true || String(row?.eligibility_code || '').startsWith('OUTING:'); }
  function uniqueDayRows(){
    const map = new Map(); const cfg = currentConfigs226();
    DAY_SETS.forEach(n => (cfg.day[n] || []).forEach(r => { const code = String(r.code || '').trim(); if (code && !map.has(code)) map.set(code, { ...r, is_outing:false }); }));
    return Array.from(map.values());
  }
  async function saveAll226(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const ok = await (typeof confirmDialog === 'function' ? confirmDialog('บันทึกชุด Slot ทั้งหมดเป็นต้นทาง และอัปเดตฐานตำแหน่งที่ระบบใช้จริง?', 'ยืนยันบันทึก Slot') : Promise.resolve(window.confirm('บันทึกชุด Slot ทั้งหมด?')));
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึก Slot ทั้งหมด'); } catch (_) {}
    try {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const cfg = currentConfigs226();
      await saveConfigRows226();
      const dayRows = uniqueDayRows();
      const outingRows = sanitizeRows(cfg.outing || [], 'outing');
      const dayCodes = new Set(dayRows.map(r => r.code));
      const outingCodes = new Set(outingRows.map(r => r.code));
      const existingRes = await sb.from('daily_position_masters').select('*');
      if (existingRes.error) throw existingRes.error;
      const existing = existingRes.data || [];
      for (const row of existing) {
        if (isConfigRow(row)) continue;
        const code = String(row?.code || '').trim();
        if (!code) continue;
        if (isOutingMaster(row)) {
          if (!outingCodes.has(code) && row.is_active !== false) {
            const res = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
            if (res.error) throw res.error;
          }
        } else if (!dayCodes.has(code) && row.is_active !== false) {
          const res = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
          if (res.error) throw res.error;
        }
      }
      const payloads = [
        ...dayRows.map((r,i) => ({ code:r.code, eligibility_code:r.eligibility_code || r.code, zone:r.zone || 'Blood Bank', break_time:r.break_time || '-', main_rule:r.main_rule || '', job_desc:r.job_desc || '', sort_order:Number(r.sort_order || i+1), is_outing:false, is_active:true, deleted_at:null, updated_by:sid() })),
        ...outingRows.map((r,i) => ({ code:r.code, eligibility_code:r.eligibility_code || (r.zone === 'ออกหน่วย' ? `OUTING:${r.code}` : r.code), zone:r.zone || 'ออกหน่วย', break_time:r.break_time || (r.zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'), main_rule:r.main_rule || '', job_desc:r.job_desc || '', sort_order:Number(r.sort_order || i+1), is_outing:true, is_active:true, deleted_at:null, updated_by:sid() }))
      ];
      for (const row of payloads) {
        const res = await sb.from('daily_position_masters').upsert(row, { onConflict:'code,is_outing' });
        if (res.error) throw res.error;
      }
      writeLocal(currentConfigs226()); applyConfigs226(); toast('บันทึกทั้งหมดเป็นฐานตำแหน่งแล้ว');
    } catch (err) { console.error(`${VERSION}: save all failed`, err); toast('บันทึกทั้งหมดไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }

  function staffForMonthlyTemplate(){
    const rows = (state.staff || []).filter(st => { try { return isDailyPositionEnabled(st); } catch (_) { return st?.id && st?.is_active !== false && st?.staff_type !== 'แพทย์'; } });
    return orderStaff(rows);
  }
  function workingStaffToday(date){
    try { return dailyWorkingStaff(norm(date)) || []; }
    catch (_) { return orderStaff((state.staff || []).filter(st => { try { return isDailyPositionEnabled(st) && !isActiveLeaveOn(st.id, norm(date)); } catch (__){ return st?.id && st?.is_active !== false; } })); }
  }
  function isTraineeExcludedFromSlot(person,date){
    const d=norm(date), id=safeStaffId(person?.id);
    if(!id) return false;
    try { if(window.cnmiV271?.excludeFromDaySlot?.(person,d)) return true; } catch (_) {}
    try { if(window.cnmiV271?.isTrainingPersonOnDate?.(id,d)) return true; } catch (_) {}
    try {
      const rows=Array.isArray(state?.trainingAssignmentsV271)?state.trainingAssignmentsV271:[];
      if(rows.some(row=>row?.active!==false&&safeStaffId(row?.trainee_staff_id)===id&&norm(row?.start_date)<=d&&d<=norm(row?.end_date))) return true;
    } catch (_) {}
    // รองรับข้อมูลน้องใหม่รูปแบบเดิมก่อน V271 กรณียังไม่มีข้อมูลช่วงวันที่โหลดเข้ามา
    try {
      const rows=Array.isArray(state?.trainingAssignmentsV271)?state.trainingAssignmentsV271:[];
      if(!rows.length && (person?.is_trainee===true || /น้องใหม่|trainee|intern|probation/i.test(String(person?.position_training_status||'')))) return true;
    } catch (_) {}
    return false;
  }
  function slotCountedWorkingStaffToday(date){
    const d=norm(date);
    return workingStaffToday(d).filter(person=>!isTraineeExcludedFromSlot(person,d));
  }
  function bucketForCount(n){ const x = Math.max(8, Math.min(14, Number(n) || 14)); return DAY_SETS.reduce((best, v) => Math.abs(v - x) < Math.abs(best - x) ? v : best, 14); }
  function daySlotsForCount(count){ const cfg = currentConfigs226(); const n = bucketForCount(count); return sanitizeRows(cfg.day[n] || cfg.day[String(n)] || [], 'day'); }
  function outingTemplateSlots(){ return sanitizeRows(currentConfigs226().outing || [], 'outing'); }
  function allSlotTemplates(){ const map = new Map(); DAY_SETS.forEach(n => daySlotsForCount(n).forEach(p => { if (!map.has(p.code)) map.set(p.code, p); })); outingTemplateSlots().forEach(p => { if (!map.has(`${p.code}|outing`)) map.set(`${p.code}|outing`, p); }); return Array.from(map.values()); }
  function baseCode(code){ try { return positionBaseCode(code); } catch (_) { return String(code || '').replace(/\s+#\d+$/, '').trim(); } }
  function labelCode(code){ try { return positionLabelForCell(code); } catch (_) { return baseCode(code); } }
  function zoneOf(pos){
    const code = baseCode(pos?.code || pos?.position_code || '');
    return displayZone(pos?.zone, code);
  }
  function isRealCode(code){ const c = baseCode(code); return !!c && c !== 'รอตรวจสอบ' && c !== '-'; }
  function loadWeight(pos){ try { return positionLoadWeight(baseCode(pos.code || pos.position_code)); } catch (_) { return zoneOf(pos)==='ออกหน่วย' ? 1.1 : /^BB-Manual/i.test(baseCode(pos?.code || pos?.position_code || '')) ? 1.15 : 1; } }
  function ruleOkNoLeave(staff, pos){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff)) return false; } catch (_) {}
    try { if (typeof positionRuleOk === 'function' && !positionRuleOk(staff, pos.main_rule || '')) return false; } catch (_) {}
    try { if (typeof positionEligible === 'function' && !positionEligible(staff, pos.eligibility_code || pos.code)) return false; } catch (_) {}
    return true;
  }
  function dailyEligible(staff, pos, date){
    if (!staff?.id || !pos?.code) return false;
    try { if (!isDailyPositionEnabled(staff) || isActiveLeaveOn(staff.id, norm(date))) return false; } catch (_) {}
    return ruleOkNoLeave(staff, pos);
  }
  function makeRow(date, staff, pos){
    const p = { ...pos, code:pos.code || pos.position_code, position_code:pos.code || pos.position_code };
    try { return rowForStaffPosition(staff, norm(date), p, {}); }
    catch (_) { return { work_date:norm(date), position_code:p.code, code:p.code, zone:p.zone || zoneOf(p), break_time:p.break_time || '-', main_rule:p.main_rule || '', job_desc:p.job_desc || '', staff_id:staff?.id || null, updated_by:sid() }; }
  }
  function reviewPos(msg){ return { code:'รอตรวจสอบ', position_code:'รอตรวจสอบ', zone:'รอตรวจสอบ', break_time:'-', main_rule:'', job_desc:msg || 'ต้องตรวจสอบ', eligibility_code:'รอตรวจสอบ' }; }
  function initStats(){ return { total:0, load:0, byCode:{}, byRoom:{}, lastCode:'', lastRoom:'' }; }
  function addStats(stats, staffId, pos){
    if (!staffId || !pos) return;
    const code = baseCode(pos.code || pos.position_code || ''); if (!isRealCode(code)) return;
    const s = stats[staffId] || (stats[staffId] = initStats()); const room = zoneOf(pos);
    s.total += 1; s.load += loadWeight(pos); s.byCode[code] = (s.byCode[code] || 0) + 1; s.byRoom[room] = (s.byRoom[room] || 0) + 1; s.lastCode = code; s.lastRoom = room;
  }
  function priorFiscalStats(monthKey){
    const start = fiscalStart(`${monthKey}-01`); const monthStart = `${monthKey}-01`; const stats = {};
    (state.positions || []).forEach(r => { const d = norm(r?.work_date); if (!d || d < start || d >= monthStart) return; const id = safeStaffId(r?.staff_id); const code = baseCode(r?.position_code || r?.code || ''); if (!id || !isRealCode(code)) return; addStats(stats, id, { code, zone:r.zone }); });
    return stats;
  }
  function lastMonthCodesByStaff(monthKey){
    const [yRaw,mRaw] = String(monthKey).split('-').map(Number); const d = new Date(yRaw || new Date().getFullYear(), (mRaw || 1) - 2, 1); const prev = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; const out = {};
    (state.positions || []).forEach(r => { const dk = norm(r?.work_date); if (!dk.startsWith(prev)) return; const id = safeStaffId(r?.staff_id); const c = baseCode(r?.position_code || r?.code || ''); if (!id || !isRealCode(c)) return; (out[id] ||= new Set()).add(c); });
    return out;
  }
  function circularDistance(a,b,n){ if (!n) return 0; const d = Math.abs((a % n) - (b % n)); return Math.min(d, n - d); }
  function scorePositionForStaff(staff, pos, ctx){
    const id = safeStaffId(staff?.id); const code = baseCode(pos.code || pos.position_code || ''); const room = zoneOf(pos); const hist = ctx.hist[id] || initStats(); const cur = ctx.cur[id] || initStats(); const lastMonth = ctx.lastMonth[id] || new Set(); const staffIndex = ctx.staffIndex.get(id) || 0; const posIndex = ctx.posIndex.get(code) || 0; const desired = (staffIndex + ctx.fiscalWeekIndex) % Math.max(1, ctx.slots.length);
    let score = 0;
    score += (hist.byCode[code] || 0) * 900 + (cur.byCode[code] || 0) * 1250;
    score += (hist.byRoom[room] || 0) * 170 + (cur.byRoom[room] || 0) * 360;
    score += (hist.load || 0) * 12 + (cur.load || 0) * 35 + (hist.total || 0) * 8 + (cur.total || 0) * 18;
    if (lastMonth.has(code)) score += 1800;
    if (ctx.prevWeekCode[id] === code) score += 2600;
    if (ctx.prevWeekRoom[id] === room) score += 380;
    if (['Blood Bank','Donor Room'].includes(room) && !(cur.byRoom[room] || 0)) score -= 420;
    score += circularDistance(posIndex, desired, ctx.slots.length) * 6;
    return score;
  }
  function chooseForSlot(slot, pool, used, ctx){
    const candidates = pool.filter(st => !used.has(safeStaffId(st.id)) && ruleOkNoLeave(st, slot));
    candidates.sort((a,b) => scorePositionForStaff(a, slot, ctx) - scorePositionForStaff(b, slot, ctx) || compareStaffSafe(a,b));
    return candidates[0] || null;
  }
  function chooseWeeklyAssignments(staffList, slots, weekDates, ctx){
    const assignments = new Map(); const usedCodes = new Set();
    const eligibleCount = st => slots.filter(p => ruleOkNoLeave(st, p)).length || 99;
    const staffOrder = staffList.slice().sort((a,b) => eligibleCount(a) - eligibleCount(b) || compareStaffSafe(a,b));
    staffOrder.forEach(st => {
      const id = safeStaffId(st.id);
      let candidates = slots.filter(p => !usedCodes.has(baseCode(p.code)) && ruleOkNoLeave(st, p));
      if (!candidates.length) candidates = slots.filter(p => !usedCodes.has(baseCode(p.code)));
      if (!candidates.length) candidates = slots.slice();
      candidates.sort((a,b) => scorePositionForStaff(st, a, ctx) - scorePositionForStaff(st, b, ctx) || String(a.code).localeCompare(String(b.code), 'th'));
      const chosen = candidates[0] || reviewPos('ไม่พบตำแหน่งที่ตรงสิทธิ์ในสัปดาห์นี้');
      assignments.set(id, chosen); if (isRealCode(chosen.code)) usedCodes.add(baseCode(chosen.code)); addStats(ctx.cur, id, chosen); ctx.prevWeekCode[id] = baseCode(chosen.code || ''); ctx.prevWeekRoom[id] = zoneOf(chosen);
    });
    return assignments;
  }
  function buildOutingRowsForDate(date, staffList, ctx){
    const slots = outingTemplateSlots(); const rows = []; const used = new Set(); const participants = outingIdSet(date);
    const outingPool = staffList.filter(st => participants.has(safeStaffId(st.id)));
    const roomPool = staffList.filter(st => !participants.has(safeStaffId(st.id)));
    slots.forEach(slot => {
      const z = zoneOf(slot); const pool = z === 'ออกหน่วย' ? outingPool : roomPool;
      const st = chooseForSlot(slot, pool, used, { ...ctx, slots });
      if (st) { used.add(safeStaffId(st.id)); rows.push(makeRow(date, st, slot)); addStats(ctx.cur, st.id, slot); ctx.prevWeekCode[safeStaffId(st.id)] = baseCode(slot.code); ctx.prevWeekRoom[safeStaffId(st.id)] = z; }
    });
    outingPool.filter(st => !used.has(safeStaffId(st.id))).forEach(st => rows.push(makeRow(date, st, reviewPos('คนเข้าร่วมออกหน่วยมากกว่า Slot ออกหน่วย'))));
    roomPool.filter(st => !used.has(safeStaffId(st.id))).forEach(st => rows.push(makeRow(date, st, reviewPos('คนอยู่ห้องมากกว่า Slot ห้องในชุดวันออกหน่วย'))));
    return rows;
  }
  function buildWeeklyRotationPlan226(key){
    const monthKey = String(key || (state.positionMonthKey || state.monthKey || today().slice(0,7))).slice(0,7);
    const staffList = staffForMonthlyTemplate(); const rows = []; const slotCount = bucketForCount(staffList.length); const normalSlots = daySlotsForCount(slotCount); const hist = priorFiscalStats(monthKey); const cur = {}; const lastMonth = lastMonthCodesByStaff(monthKey); const staffIndex = new Map(staffList.map((s,i) => [safeStaffId(s.id), i])); const posIndex = new Map(normalSlots.map((p,i) => [baseCode(p.code), i])); const prevWeekCode = {}; const prevWeekRoom = {}; let currentWeek = ''; let weekly = new Map();
    monthDates(monthKey).forEach(date => {
      if (isNoPosition(date)) return;
      const baseCtx = { monthKey, hist, cur, lastMonth, staffIndex, posIndex, slots:normalSlots, fiscalWeekIndex:weekIndexFromFiscal(date), prevWeekCode, prevWeekRoom };
      if (hasOutingSafe(date)) { rows.push(...buildOutingRowsForDate(date, staffList, baseCtx)); return; }
      const wk = weekKey(date);
      if (wk !== currentWeek) { currentWeek = wk; weekly = chooseWeeklyAssignments(staffList, normalSlots, [date], baseCtx); }
      staffList.forEach(st => { const pos = weekly.get(safeStaffId(st.id)) || reviewPos('ยังไม่จัดตำแหน่งตั้งต้น'); rows.push(makeRow(date, st, pos)); });
    });
    return { monthKey, rows, autoPlanV226:true, weeklyRotation:true, outingTemplateException:true, slotSet:slotCount, ignoreLeave:true };
  }
  function blankMonthlyTemplate226(key){
    const monthKey = String(key || (state.positionMonthKey || state.monthKey || today().slice(0,7))).slice(0,7); const staffList = staffForMonthlyTemplate(); const rows = [];
    monthDates(monthKey).forEach(date => { if (isNoPosition(date)) return; staffList.forEach(st => rows.push({ work_date:date, position_code:'', code:'', zone:'', break_time:'', main_rule:'', job_desc:'', staff_id:st.id, updated_by:sid(), _blankTableV226:true })); });
    return { monthKey, rows, blankTable:true, ignoreLeave:true };
  }
  try { window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV226(key){ return buildWeeklyRotationPlan226(key); }; } catch (_) { window.buildMonthlyPositionDraft = buildWeeklyRotationPlan226; }

  function rowsForMonthContext(key){ if (state.monthPositionDraft?.monthKey === key && Array.isArray(state.monthPositionDraft.rows)) return state.monthPositionDraft.rows; return (state.positions || []).filter(r => norm(r?.work_date).startsWith(key)); }
  function cellRowsByStaffDate(rows){
    const by = Object.create(null); const assigned = new Map();
    (rows || []).forEach((r,idx) => { const id = safeStaffId(r?.staff_id); const d = norm(r?.work_date); if (!id || !d) return; (by[`${id}|${d}`] ||= []).push({ ...r, _idx:idx }); const c = baseCode(r?.position_code || r?.code || ''); if (isRealCode(c)) { if (!assigned.has(d)) assigned.set(d, new Set()); assigned.get(d).add(c); } });
    return { by, assigned };
  }
  function expectedSlotsForMonthDate(date){ if (hasOutingSafe(date)) return outingTemplateSlots(); return daySlotsForCount(staffForMonthlyTemplate().length); }
  function countCell(date, assigned){
    const d = norm(date); if (isNoPosition(d)) return `<th class="count-role-cell no-position-day">ไม่จัด</th>`;
    const actual = hasOutingSafe(d) ? outingIdSet(d).size : slotCountedWorkingStaffToday(d).length; const slots = expectedSlotsForMonthDate(d); const diff = actual - slots.length; const text = diff === 0 ? 'พอดี' : (diff > 0 ? `เกิน ${diff}` : `ขาด ${Math.abs(diff)}`); const title = hasOutingSafe(d) ? `คนเข้าร่วมออกหน่วย ${actual} คน | Slot ออกหน่วย ${slots.length}` : `คนที่นับ Slot ${actual} คน | Slot ${slots.length}`;
    return `<th class="count-role-cell ${diff<0?'has-missing':diff>0?'has-extra':'complete'}" title="${esc(title)}"><b>${actual}/${slots.length}</b><br><small>${hasOutingSafe(d)?'ออกหน่วย':'วันนี้'}</small><br><small>${esc(text)}</small></th>`;
  }
  function missingCell(date, assigned){
    const d = norm(date); if (isNoPosition(d)) return `<th class="missing-role-cell no-position-day">ไม่จัด</th>`;
    const set = assigned.get(d) || new Set(); const missing = expectedSlotsForMonthDate(d).filter(p => !set.has(baseCode(p.code)));
    if (!missing.length) return `<th class="missing-role-cell complete">ครบ</th>`;
    return `<th class="missing-role-cell has-missing">${missing.slice(0,3).map(p => `<span>${esc(p.code)}</span>`).join('')}${missing.length>3?`<small>+${missing.length-3}</small>`:''}</th>`;
  }
  function monthOptions(date, current){
    const expected = expectedSlotsForMonthDate(date); const map = new Map((expected.length ? expected : allSlotTemplates()).map(p => [p.code, p]));
    if (current && !map.has(current)) map.set(current, allSlotTemplates().find(p => baseCode(p.code) === baseCode(current)) || { code:current, zone:'รอตรวจสอบ' });
    return Array.from(map.values());
  }
  function renderMonthCell226(staff, date, cellRows, canEdit){
    const d = norm(date); if (isNoPosition(d)) return `<td class="matrix-cell no-position-day ${isHolidaySafe(d) ? 'holiday-cell' : 'weekend-cell'}"><span>${isHolidaySafe(d) ? 'HOLIDAY' : 'WEEKEND'}</span></td>`;
    const row = (cellRows || [])[0] || null; const cleanCodes = (cellRows || []).map(r => baseCode(r?.position_code || r?.code || '')).filter(isRealCode); const current = row?.position_code || ''; const cls = `${hasOutingSafe(d) ? 'outing-cell' : ''} ${!cleanCodes.length ? 'needs-review-cell' : ''}`.trim();
    if (canEdit) { const options = monthOptions(d, current); return `<td class="matrix-cell ${cls}"><select class="month-position-select" data-month-position-edit="${esc(d)}|${esc(staff?.id || '')}"><option value="">รอตรวจสอบ</option>${options.map(t => `<option value="${esc(t.code)}" ${current===t.code?'selected':''}>${esc(labelCode(t.code))}</option>`).join('')}</select>${hasOutingSafe(d) ? '<div class="cell-note">ใช้ชุดออกหน่วย</div>' : ''}</td>`; }
    const text = cleanCodes.length ? cleanCodes.map(labelCode).join(' / ') : 'รอตรวจสอบ'; return `<td class="matrix-cell ${cls}"><span title="${esc(text)}">${esc(text)}</span>${hasOutingSafe(d) && cleanCodes.length ? '<div class="cell-note">ใช้ชุดออกหน่วย</div>' : ''}</td>`;
  }
  window.renderMonthPositionMatrix = renderMonthPositionMatrix = function renderMonthPositionMatrixV226(rows, dates){
    rows = Array.isArray(rows) ? rows : []; dates = Array.isArray(dates) ? dates : [];
    if (!rows.length) return emptySafe('ยังไม่มีแผนรายเดือน กด “สร้างตารางตั้งต้นเปล่า” หรือ “สร้างแผนรายสัปดาห์ทั้งเดือน” ก่อน');
    const { by, assigned } = cellRowsByStaffDate(rows); const rowStaffIds = new Set(rows.map(r => safeStaffId(r?.staff_id)).filter(Boolean)); const displayStaff = orderStaff((state.staff || []).filter(s => { try { return isDailyPositionEnabled(s) || rowStaffIds.has(safeStaffId(s.id)); } catch (_) { return rowStaffIds.has(safeStaffId(s.id)) || s?.is_active !== false; } })); const canEdit = (() => { try { return admin() && state.page === 'positionMonth'; } catch (_) { return false; } })();
    const heads = dates.map(date => { const d = parseSafe(date); const cls = isHolidaySafe(date) ? 'holiday-head' : isWeekendSafe(date) ? 'weekend-head' : hasOutingSafe(date) ? 'outing-head' : ''; return `<th class="date-head ${cls}"><b>${d.getDate()}</b><br><span>${esc(thDay(date))}</span>${hasOutingSafe(date)?'<br><small>ออกหน่วย</small>':''}</th>`; }).join('');
    return `<div class="monthly-matrix-wrap v225-position-matrix v226-position-matrix"><div class="matrix-legend"><span class="legend-box weekend"></span> WEEKEND/HOLIDAY = ไม่จัดตำแหน่ง <span class="legend-box outing"></span> วันออกหน่วย = ใช้ชุด Slot วันที่ออกหน่วยเท่านั้น <span class="hint">วันปกติหมุนรายสัปดาห์ ส่วนวันออกหน่วยไม่อิงรายสัปดาห์</span></div><div class="table-wrap month-position-matrix v225-month-position-matrix v226-month-position-matrix"><table><thead><tr><th class="sticky-col staff-col v225-staff-col">เจ้าหน้าที่</th><th class="sticky-col summary-col v225-summary-col">สรุป</th>${heads}</tr><tr class="count-role-row"><th class="sticky-col staff-col v225-staff-col count-role-head">จำนวนคน</th><th class="sticky-col summary-col v225-summary-col count-role-head">คน/Slot</th>${dates.map(date => countCell(date, assigned)).join('')}</tr><tr class="missing-role-row"><th class="sticky-col staff-col v225-staff-col missing-role-head">ยังขาด</th><th class="sticky-col summary-col v225-summary-col missing-role-head">ตำแหน่ง</th>${dates.map(date => missingCell(date, assigned)).join('')}</tr></thead><tbody>${displayStaff.map(st => { const bg = (() => { try { return staffColor(st); } catch (_) { return '#dbeafe'; } })(); const fg = (() => { try { return textColorFor(bg); } catch (_) { return '#0f172a'; } })(); return `<tr><td class="sticky-col staff-col v225-staff-col staff-color-cell" style="background:${esc(bg)};color:${esc(fg)}"><div class="matrix-staff-name"><b>${esc(staffName(st))}</b><small>${esc(st.staff_type || '')}</small></div></td><td class="sticky-col summary-col v225-summary-col summary-action-cell"><button class="tiny-btn staff-summary-trigger compact-staff-summary" data-month-position-stat="${esc(st.id)}" type="button">ดูสรุป</button></td>${dates.map(date => renderMonthCell226(st, date, by[`${st.id}|${date}`] || [], canEdit)).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  };
  function renderMonthPositionPage226(){
    try { if (!admin()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>'; } catch (_) {}
    const key = state.positionMonthKey || state.monthKey || today().slice(0,7); const dates = monthDates(key); const rows = rowsForMonthContext(key); const savedCount = (state.positions || []).filter(x => norm(x?.work_date).startsWith(key)).length; const workingDays = dates.filter(d => !isNoPosition(d)).length; const staffCount = staffForMonthlyTemplate().length; const setNo = bucketForCount(staffCount);
    return `<div class="card monthly-position-page v225-monthly-position-page v226-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3><p class="hint">วันปกติ = คงตำแหน่งรายสัปดาห์แล้วหมุนสัปดาห์ถัดไป • วันออกหน่วย = ใช้ชุด Slot วันที่ออกหน่วยและคนเข้าร่วมกิจกรรม</p></div></div><div class="v224-month-toolbar v225-month-toolbar"><label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label><button class="ghost-btn" type="button" data-v226-create-blank-month>สร้างตารางตั้งต้นเปล่า</button><button class="soft-btn" type="button" data-v226-generate-month-plan>สร้างแผนรายสัปดาห์ทั้งเดือน</button><button class="primary-btn" type="button" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button><button class="ghost-btn danger" type="button" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button><button class="ghost-btn" type="button" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button><button class="soft-btn" type="button" data-position-month-overview-v225>ดูภาพรวมจัดตำแหน่ง</button><span class="v224-mini-badges">${badgeSafe(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black')} ${badgeSafe(`วันทำงาน ${workingDays} วัน`, 'blue')} ${badgeSafe(`วันปกติชุด ${setNo} Slot`, 'blue')} ${badgeSafe(`ออกหน่วย ${outingTemplateSlots().length} Slot`, 'orange')}</span></div>${window.renderMonthPositionMatrix(rows, dates)}</div>`;
  }
  try { window.renderPositionMonthPage = renderPositionMonthPage = renderMonthPositionPage226; } catch (_) { window.renderPositionMonthPage = renderMonthPositionPage226; }
  async function generateMonth226(){
    try { if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error'); } catch (_) {}
    const input = document.getElementById('positionMonthInput'); const key = String(input?.value || state.positionMonthKey || state.monthKey || today().slice(0,7)).slice(0,7);
    await loadConfigs226(false); state.positionMonthKey = key; state.monthPositionDraft = buildWeeklyRotationPlan226(key); renderPage(); toast('สร้างแผนแล้ว: วันปกติหมุนรายสัปดาห์ / วันออกหน่วยใช้ชุดออกหน่วย');
  }
  function blankMonth226(){ const input = document.getElementById('positionMonthInput'); const key = String(input?.value || state.positionMonthKey || state.monthKey || today().slice(0,7)).slice(0,7); state.positionMonthKey = key; state.monthPositionDraft = blankMonthlyTemplate226(key); renderPage(); toast('สร้างตารางตั้งต้นเปล่าแล้ว'); }

  const LS_DAILY_SLOT_KEY = 'cnmi_v225_daily_slot_set_by_date';
  function dailySlotStore(){ try { return JSON.parse(localStorage.getItem(LS_DAILY_SLOT_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function setDailySlotSet(date, setNo){ const data = dailySlotStore(); data[norm(date)] = Number(setNo) || bucketForCount(slotCountedWorkingStaffToday(date).length); try { localStorage.setItem(LS_DAILY_SLOT_KEY, JSON.stringify(data)); } catch (_) {} }
  function dailySlotSet(date){ const data = dailySlotStore(); return Number(data[norm(date)] || bucketForCount(slotCountedWorkingStaffToday(date).length)); }
  function dailyBaseSlots(date){ return hasOutingSafe(date) ? outingTemplateSlots() : daySlotsForCount(dailySlotSet(date)); }
  function combineDailyRows226(date){
    const d = norm(date); const planRows = (() => { try { return sortPositionRows((state.positions || []).filter(x => norm(x.work_date) === d)); } catch (_) { return (state.positions || []).filter(x => norm(x.work_date) === d); } })(); const planByCode = new Map(); planRows.forEach(r => { const c = baseCode(r.position_code || r.code || ''); if (c && !planByCode.has(c)) planByCode.set(c, r); });
    const rows = dailyBaseSlots(d).map(p => { const plan = planByCode.get(baseCode(p.code)); return { ...p, code:p.code, position_code:p.code, staff_id:plan?.staff_id || null, _planned_staff_id:plan?.staff_id || null, _planned_code:p.code, _source:'slot' }; });
    planRows.forEach(r => { const c = baseCode(r.position_code || r.code || ''); if (!c || rows.some(x => baseCode(x.position_code || x.code) === c)) return; const tpl = allSlotTemplates().find(p => baseCode(p.code) === c) || r; rows.push({ ...tpl, ...r, code:c, position_code:c, _planned_staff_id:r.staff_id || null, _source:'extra-plan' }); });
    return rows;
  }
  function staffOptionsDaily226(row, selectedId, date){
    const d = norm(date); const participants = outingIdSet(d); let pool = workingStaffToday(d);
    if (hasOutingSafe(d)) { const z = zoneOf(row); pool = z === 'ออกหน่วย' ? pool.filter(st => participants.has(safeStaffId(st.id))) : pool.filter(st => !participants.has(safeStaffId(st.id))); }
    let list = pool.filter(st => dailyEligible(st, row, d)); const selected = selectedId ? (state.staff || []).find(s => safeStaffId(s.id) === safeStaffId(selectedId)) : null; if (selected && !list.some(s => safeStaffId(s.id) === safeStaffId(selected.id))) list.unshift(selected); list = orderStaff(list);
    return list.map(s => `<option value="${esc(s.id)}" ${safeStaffId(s.id)===safeStaffId(selectedId)?'selected':''}>${esc(staffName(s))}</option>`).join('');
  }
  function leaveTextForStaff(staffId, date){ try { const row = activeLeaveRecordOn(staffId, norm(date)); if (!row) return ''; if (typeof leaveDisplayType === 'function') return leaveDisplayType(row); return String(row.type || row.leave_type || 'ลา'); } catch (_) { return ''; } }
  function renderDailySelect226(row, idx, date, layout){ const code = row.position_code || row.code || 'รอตรวจสอบ'; const zone = zoneOf(row); const breakTime = row.break_time || '-'; const rule = row.main_rule || ''; const job = row.job_desc || ''; return `<select class="v225-position-select" data-position-row="${esc(idx)}" data-position-code="${esc(code)}" data-position-zone="${esc(zone)}" data-position-break="${esc(breakTime)}" data-position-rule="${esc(rule)}" data-position-job="${esc(job)}" data-position-layout-item="${esc(layout || '')}"><option value="">เลือกคน/ว่าง</option>${staffOptionsDaily226({ ...row, code, position_code:code, zone, break_time:breakTime, main_rule:rule, job_desc:job }, row.staff_id, date)}</select>`; }
  function renderDailyComparePanel226(date, rows){
    const d=norm(date);
    const working=workingStaffToday(d);
    const countedWorking=slotCountedWorkingStaffToday(d);
    const excludedCount=Math.max(0,working.length-countedWorking.length);
    const planStaffIds=new Set((state.positions||[]).filter(r=>norm(r.work_date)===d&&r.staff_id).map(r=>safeStaffId(r.staff_id)));
    const planCount=planStaffIds.size;
    const slotCount=rows.filter(r=>r._source!=='extra-plan').length;
    const participants=outingIdSet(d);
    const outing=hasOutingSafe(d);
    const compareCount=outing?participants.size:countedWorking.length;
    const diff=compareCount-slotCount;
    const missingStaff=Array.from(planStaffIds).filter(id=>!working.some(st=>safeStaffId(st.id)===id));
    const setNo=dailySlotSet(d);
    const setOptions=DAY_SETS.map(n=>`<option value="${n}" ${n===setNo?'selected':''}>${n} Slot</option>`).join('');
    if(outing){
      return `<div class="v225-daily-compare-panel v226-daily-compare-panel"><div class="v225-compare-cards"><div><b>${working.length}</b><span>คนเหลือจริงวันนี้</span></div><div><b>${participants.size}</b><span>คนเข้าร่วมออกหน่วย</span></div><div><b>${slotCount}</b><span>Slot ชุดออกหน่วย</span></div><div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':(diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`)}</b><span>เทียบคนเข้าร่วมกับ Slot</span></div></div><div class="notice soft-notice compact"><b>วันนี้เป็นวันออกหน่วย:</b> ใช้ชุด Slot วันที่ออกหน่วยเท่านั้น ไม่ใช้แผนหมุนรายสัปดาห์</div>${missingStaff.length?`<div class="notice compact warn-notice">คนในแผนตั้งต้นที่ไม่อยู่วันนี้: ${missingStaff.map(id=>staffPillSafe(id)).join(' ')}</div>`:''}</div>`;
    }
    return `<div class="v225-daily-compare-panel v226-daily-compare-panel v308-slot-count-panel"><div class="v225-compare-cards v308-five-cards"><div><b>${working.length}</b><span>คนอยู่จริงทั้งหมด</span></div><div><b>${countedWorking.length}</b><span>คนที่นับเป็น Slot</span></div><div><b>${planCount}</b><span>คนในแผนตั้งต้น</span></div><div><b>${slotCount}</b><span>Slot วันนี้</span></div><div class="${diff<0?'warn':diff>0?'info':'ok'}"><b>${diff===0?'พอดี':(diff>0?`เกิน ${diff}`:`ขาด ${Math.abs(diff)}`)}</b><span>เทียบคนที่นับ Slot</span></div></div>${excludedCount?`<div class="notice soft-notice compact v308-trainee-note"><b>น้องใหม่/Intern ${excludedCount} คน:</b> แสดงเป็นคนที่อยู่จริง แต่ไม่นำมาคำนวณ Slot</div>`:''}<div class="v225-daily-slot-toolbar"><label>ชุด Slot วันนี้ <select data-v226-daily-slot-set="${esc(d)}">${setOptions}</select></label><span class="hint">ระบบเลือกจากจำนวนคนที่นับเป็น Slot โดยอัตโนมัติ และปรับเป็น 8-14 Slot ได้</span></div>${missingStaff.length?`<div class="notice compact warn-notice">คนในแผนตั้งต้นที่ไม่อยู่วันนี้: ${missingStaff.map(id=>staffPillSafe(id)).join(' ')}</div>`:''}</div>`;
  }
  function renderPositionsPage226(){
    try {
      const date = norm(state.positionDate || today()); const canManage = canManagePositions(date); const key = date.slice(0,7); const incharge = currentInchargeForMonth(key); const dayStatus = (state.positionDayStatus || []).find(x => norm(x.work_date) === date); const isPublished = dayStatus?.status === 'published'; const noPosition = isNoPosition(date); const rows = noPosition ? [] : combineDailyRows226(date); window.__CNMI_V226_DAILY_POSITION_ROWS__ = rows; window.__CNMI_V225_DAILY_POSITION_ROWS__ = rows;
      const rowHtml = rows.map((r,idx) => { const code = r.position_code || r.code || 'รอตรวจสอบ'; const label = labelCode(code); const zone = zoneOf(r); const breakTime = r.break_time || '-'; const rule = r.main_rule || '-'; const job = r.job_desc || '-'; const planned = r._planned_staff_id ? `${staffPillSafe(r._planned_staff_id)}${leaveTextForStaff(r._planned_staff_id, date) ? `<div class="cell-note">${esc(leaveTextForStaff(r._planned_staff_id, date))}</div>` : ''}` : '<span class="muted">-</span>'; const select = canManage ? renderDailySelect226(r, idx, date, 'desktop') : staffPillSafe(r.staff_id); const extra = r._source === 'extra-plan' ? badgeSafe('เกินจากชุด Slot วันนี้', 'orange') : ''; return `<tr class="${r._source === 'extra-plan' ? 'v225-extra-plan-row' : ''}"><td>${esc(zone)}${extra}</td><td><b>${esc(label)}</b></td><td>${esc(breakTime)}</td><td class="v225-plan-cell">${planned}</td><td>${select}</td><td>${esc(rule)}</td><td><button class="tiny-btn" type="button" data-v226-position-detail="${esc(idx)}">ดู</button><span class="muted v225-job-short">${esc(String(job).slice(0,70))}${String(job).length>70?'…':''}</span></td></tr>`; }).join('');
      const cardHtml = rows.map((r,idx) => { const code = r.position_code || r.code || 'รอตรวจสอบ'; const zone = zoneOf(r); const breakTime = r.break_time || '-'; const rule = r.main_rule || '-'; const select = canManage ? renderDailySelect226(r, idx, date, 'mobile') : staffPillSafe(r.staff_id); const planned = r._planned_staff_id ? staffPillSafe(r._planned_staff_id) : '<span class="muted">-</span>'; return `<div class="position-mobile-card v225-position-card ${r._source === 'extra-plan' ? 'v225-extra-plan-row' : ''}"><div class="section-title"><h3>${esc(labelCode(code))}</h3>${badgeSafe(zone || '-', zone === 'ออกหน่วย' ? 'red' : 'blue')}</div><div class="muted">พัก ${esc(breakTime)} • ${esc(rule)}</div><div><b>แผนตั้งต้น:</b> ${planned}</div><label>ปรับวันนี้ ${select}</label><div class="actions"><button class="tiny-btn" type="button" data-v226-position-detail="${esc(idx)}">ดูรายละเอียดหน้าที่</button></div></div>`; }).join('');
      const table = `<div class="table-wrap daily-position-table desktop-table v225-daily-position-table" data-position-layout="desktop"><table><thead><tr><th>โซน</th><th>Slot วันนี้</th><th>พัก</th><th>แผนตั้งต้น</th><th>ปรับวันนี้</th><th>เงื่อนไข</th><th>รายละเอียด</th></tr></thead><tbody>${rowHtml}</tbody></table></div><div class="mobile-position-list v225-mobile-position-list" data-position-layout="mobile">${cardHtml}</div>`;
      return `<div class="card v225-positions-page v226-positions-page"><div class="toolbar v225-position-toolbar"><label>วันที่ <input type="date" id="positionDateInput" value="${esc(date)}"></label>${admin() ? `<label>อินชาร์จ <select id="inchargeSelect"><option value="">ไม่ระบุ</option>${staffOptions(incharge)}</select></label><button class="soft-btn" type="button" data-save-incharge>บันทึกอินชาร์จ</button>` : `<span>${badgeSafe('อินชาร์จ: ' + staffNick(incharge), 'blue')}</span>`}${canManage && !noPosition ? '<button class="primary-btn" type="button" data-save-positions>บันทึกตำแหน่งวันนี้</button><button class="soft-btn" type="button" data-publish-positions>ประกาศให้ Staff เห็น</button>' : ''}${isPublished ? '<span class="badge green">ประกาศแล้ว</span>' : '<span class="badge orange">ร่าง</span>'}</div><div class="notice soft-notice compact v225-position-note"><b>วิธีใช้:</b> ซ้ายคือแผนตั้งต้นจากรายเดือน ขวาคือคนที่อินชาร์จปรับสำหรับวันนี้ หลังหักลา/ไม่รับเวรแล้วค่อยกดบันทึก</div>${noPosition ? `<div class="notice">วันนี้เป็น${isHolidaySafe(date) ? 'วันหยุดราชการ' : 'วันเสาร์-อาทิตย์'} จึงไม่ต้องจัดตำแหน่งรายวัน</div>` : ''}${!noPosition ? renderDailyComparePanel226(date, rows) : ''}${noPosition ? emptySafe('ไม่มีตารางตำแหน่งกลางวัน รายวันสำหรับวันนี้') : table}</div>`;
    } catch (err) { console.error(`${VERSION}: renderPositionsPage failed`, err); return `<div class="notice error-notice">โหลดตารางตำแหน่งกลางวัน รายวันไม่สำเร็จ: ${esc(err?.message || err)}</div>`; }
  }
  try { window.renderPositionsPage = renderPositionsPage = renderPositionsPage226; } catch (_) { window.renderPositionsPage = renderPositionsPage226; }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = renderPage = function renderPageV226(){
    if (state?.page === 'positionManagement') { try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} try { const item = (window.NAV_ITEMS || NAV_ITEMS || []).find(x => x.id === 'positionManagement') || {}; const title = document.getElementById('pageTitle'); const sub = document.getElementById('pageSubtitle'); if (title) title.textContent = item.title || 'จัดการตำแหน่ง'; if (sub) sub.textContent = item.subtitle || 'เพิ่ม/แก้ไข/ปิดใช้งานตำแหน่งรายวัน'; } catch (_) {} renderPositionManagement226(); setTimeout(() => loadConfigs226(false).then(() => { if (state?.page === 'positionManagement') renderPositionManagement226(); }), 10); return; }
    if (state?.page === 'positionMonth') { try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} const content = document.getElementById('pageContent'); if (content) content.innerHTML = renderMonthPositionPage226(); return; }
    if (state?.page === 'positions') { try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} const content = document.getElementById('pageContent'); if (content) content.innerHTML = renderPositionsPage226(); return; }
    return previousRenderPage ? previousRenderPage.apply(this, arguments) : undefined;
  };

  window.addEventListener('click', function(e){
    const add = e.target?.closest?.('[data-v226-add-slot]'); if (add) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); openSlotModal226(); return; }
    const edit = e.target?.closest?.('[data-v226-edit-slot]'); if (edit) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); openSlotModal226(Number(edit.getAttribute('data-v226-edit-slot'))); return; }
    const copy = e.target?.closest?.('[data-v226-copy-slot]'); if (copy) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); openSlotModal226(Number(copy.getAttribute('data-v226-copy-slot')), true); return; }
    const mv = e.target?.closest?.('[data-v226-move-slot]'); if (mv) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); const [iRaw,dRaw] = String(mv.getAttribute('data-v226-move-slot') || '').split(':'); const i = Number(iRaw), delta = Number(dRaw); const rows = selectedRows().slice(); const j = i + delta; if (rows[i] && rows[j]) { const tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp; setSelectedRows(reindex(rows)); renderPositionManagement226(); } return; }
    const del = e.target?.closest?.('[data-v226-delete-slot]'); if (del) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); (async () => { const idx = Number(del.getAttribute('data-v226-delete-slot')); const rows = selectedRows().slice(); const row = rows[idx]; if (!row) return; const ok = await (typeof confirmDialog === 'function' ? confirmDialog(`ลบ Slot ${row.code} ออกจากชุดนี้?`, 'ยืนยันลบ Slot') : Promise.resolve(window.confirm(`ลบ Slot ${row.code}?`))); if (!ok) return; rows.splice(idx,1); setSelectedRows(reindex(rows)); renderPositionManagement226(); toast('ลบ Slot ออกจากชุดนี้แล้ว อย่าลืมบันทึก'); })(); return; }
    const saveModal = e.target?.closest?.('[data-v226-save-slot-modal]'); if (saveModal) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); const form = saveModal.closest('form'); if (form) saveSlotModal226(form); return; }
    const saveCurrent = e.target?.closest?.('[data-v226-save-current]'); if (saveCurrent) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); saveCurrent226(); return; }
    const refresh = e.target?.closest?.('[data-v226-refresh-config]'); if (refresh) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); (async()=>{ await loadConfigs226(true); renderPositionManagement226(); toast('รีเฟรชจากฐานข้อมูลแล้ว'); })(); return; }
    const saveAll = e.target?.closest?.('[data-v226-save-all]'); if (saveAll) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); saveAll226(); return; }
    const gen = e.target?.closest?.('[data-v226-generate-month-plan],[data-v225-generate-month-plan],[data-v224-generate-month-plan],[data-v223-generate-month-plan],[data-generate-month-positions]'); if (gen) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); generateMonth226(); return; }
    const blank = e.target?.closest?.('[data-v226-create-blank-month],[data-v225-create-blank-month],[data-v224-create-blank-month],[data-v223-create-blank-month],[data-create-blank-month-positions]'); if (blank) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); blankMonth226(); return; }
    const detail = e.target?.closest?.('[data-v226-position-detail]'); if (detail) { e.preventDefault(); e.stopPropagation(); const idx = Number(detail.getAttribute('data-v226-position-detail')); const row = window.__CNMI_V226_DAILY_POSITION_ROWS__?.[idx]; if (row) showModal(`<h2>${esc(labelCode(row.position_code || row.code))}</h2><p class="hint">${esc(zoneOf(row))} • พัก ${esc(row.break_time || '-')} • ${esc(row.main_rule || '-')}</p><div class="notice soft-notice">${esc(row.job_desc || '-')}</div>`, { large:false }); return; }
  }, true);
  window.addEventListener('change', function(e){
    const kind = e.target?.closest?.('[data-v226-kind]'); if (kind) { stateSlot().kind = kind.value === 'outing' ? 'outing' : 'day'; renderPositionManagement226(); return; }
    const set = e.target?.closest?.('[data-v226-set]'); if (set) { stateSlot().setNo = Number(set.value) || 10; renderPositionManagement226(); return; }
    const slot = e.target?.closest?.('[data-v226-daily-slot-set]'); if (slot) { setDailySlotSet(slot.getAttribute('data-v226-daily-slot-set') || state.positionDate || today(), Number(slot.value) || 10); renderPage(); return; }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v226-position-matrix .v225-summary-col{background:#fff!important;color:#0f172a!important;opacity:1!important;background-clip:padding-box!important}
    .v226-position-matrix thead .v225-summary-col{background:#f8fafc!important}.v226-position-matrix tbody .v225-summary-col{background:#fff!important}.v226-position-matrix .summary-action-cell{box-shadow:8px 0 18px rgba(15,35,52,.08)!important}
    .v226-month-position-matrix table th,.v226-month-position-matrix table td{padding:4px 6px!important;line-height:1.15!important;vertical-align:middle!important}.v226-month-position-matrix tbody tr{height:42px!important}.v226-month-position-matrix .matrix-staff-name{min-height:34px!important;gap:0!important}.v226-month-position-matrix .matrix-staff-name b{font-size:13px!important}.v226-month-position-matrix .matrix-staff-name small{font-size:10px!important}.v226-month-position-matrix .month-position-select{min-height:32px!important;height:32px!important;padding:4px 24px 4px 8px!important;font-size:12px!important;border-radius:10px!important}.v226-month-position-matrix .cell-note{font-size:10px!important;margin-top:1px!important}.v226-month-position-matrix .date-head{font-size:11px!important}.v226-month-position-matrix .date-head b{font-size:12px!important}.v226-month-position-matrix .date-head small{font-size:10px!important;color:#b45309}.v226-month-position-matrix .count-role-cell,.v226-month-position-matrix .missing-role-cell{font-size:10px!important;line-height:1.15!important}.v226-month-position-matrix .count-role-cell b{font-size:12px!important}.v226-month-position-matrix .missing-role-cell span{display:block;font-size:10px;white-space:nowrap}.v226-month-position-matrix .compact-staff-summary{padding:4px 7px!important;font-size:11px!important}
    .v226-position-template-page .notice{margin:8px 0}.v226-slot-modal textarea{min-height:140px}.v226-daily-compare-panel .notice{margin-top:10px}
    .v308-five-cards{grid-template-columns:repeat(5,minmax(105px,1fr))!important}.v308-trainee-note{border-color:#fed7aa!important;background:#fff7ed!important;color:#9a3412!important}
    @media(max-width:980px){.v308-five-cards{grid-template-columns:repeat(3,minmax(105px,1fr))!important}}
    @media(max-width:760px){.v226-month-position-matrix tbody tr{height:38px!important}.v226-month-position-matrix table th,.v226-month-position-matrix table td{padding:3px 5px!important}.v226-month-position-matrix .v225-staff-col{min-width:112px!important;max-width:112px!important}.v226-month-position-matrix .v225-summary-col{left:112px!important;min-width:70px!important;max-width:70px!important}.v308-five-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  `;
  document.head.appendChild(style);

  setTimeout(() => loadConfigs226(false).then(() => { if (state?.page === 'positionManagement') renderPositionManagement226(); }), 160);
  window.cnmiV227 = { loadConfigs226, currentConfigs226, buildWeeklyRotationPlan226, renderPositionManagement226, renderPositionsPage226, outingTemplateSlots, displayZone, slotCountedWorkingStaffToday, isTraineeExcludedFromSlot };
  window.cnmiV226 = window.cnmiV227;
  console.info(`${VERSION} loaded`);
})();
