/* =========================
   V260 Supabase Position Source of Truth
   - Slot templates and personal permissions always reload from Supabase after login/data refresh.
   - Disables automatic V240 template seeding/restoration UI.
   - Adds explicit Supabase refresh and "save current position base" actions.
   - Saving Slot templates never updates daily_position_eligibility.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V260_SUPABASE_POSITION_SOURCE_OF_TRUTH';
  if (window.__CNMI_V260_SUPABASE_POSITION_SOURCE_OF_TRUTH__) return;
  window.__CNMI_V260_SUPABASE_POSITION_SOURCE_OF_TRUTH__ = true;

  const CFG_PREFIX = '__CNMI_SLOT_TEMPLATE_V224__';
  const SLOT_CACHE_KEY = 'cnmi_slot_template_v224_cache';
  const PERMISSION_CACHE_KEY = 'cnmi_v259_position_permission_backup_v1';
  const DAY_SETS = [8,9,10,11,12,13,14];
  const OUTING_SETS = [12,13,14];
  let slotRefreshInFlight = null;
  let permissionRefreshInFlight = null;
  let permissionRefreshSequence = Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0);
  let saveSlotInFlight = false;

  function appState(){
    try { return state || window.state || null; }
    catch (_) { return window.state || null; }
  }
  function adminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return appState()?.profile?.role === 'admin'; }
  }
  function currentUserId(){
    try { return currentStaffId(); }
    catch (_) { return appState()?.profile?.id || null; }
  }
  function toast(message, tone){
    try { showToast(message, tone ? { tone } : undefined); }
    catch (_) { console.info(message); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function clone(value){
    try { return structuredClone(value); }
    catch (_) {
      try { return JSON.parse(JSON.stringify(value)); }
      catch (__) { return value; }
    }
  }
  function assignGlobalFunction(name, fn){
    try { window[name] = fn; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }
  function boolValue(value){ return value === true || String(value).toLowerCase() === 'true'; }
  function cleanCode(value){ return String(value || '').replace(/^OUTING:/i, '').trim(); }
  function isConfigRow(row){ return String(row?.code || '').startsWith(`${CFG_PREFIX}:`); }
  function safeJson(value){ try { return JSON.parse(String(value || '')); } catch (_) { return null; } }
  function isOutingMaster(row){
    return row?.is_outing === true || String(row?.eligibility_code || '').startsWith('OUTING:');
  }
  function normalizeZone(row, outingSet){
    const raw = String(row?.zone || '').trim();
    const code = cleanCode(row?.code || row?.position_code || row?.eligibility_code);
    if (raw === 'ออกหน่วย') return 'ออกหน่วย';
    if (raw === 'Manual') return 'Manual';
    if (/^BB-Manual/i.test(code)) return 'Manual';
    if (raw === 'Donor Room' || raw === 'Donor' || /^DR-/i.test(code)) return outingSet && raw === 'ออกหน่วย' ? 'ออกหน่วย' : 'Donor Room';
    if (raw === 'Blood Bank' || /^BB-/i.test(code)) return 'Blood Bank';
    return raw || (outingSet ? 'ออกหน่วย' : 'Blood Bank');
  }
  function normalizeSlotRows(rows, outingSet){
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
      const code = cleanCode(row?.code || row?.position_code || row?.eligibility_code);
      if (!code) return null;
      const zone = normalizeZone({ ...row, code }, outingSet);
      return {
        ...row,
        code,
        position_code:code,
        zone,
        main_rule:String(row?.main_rule || '').trim(),
        break_time:String(row?.break_time || '').trim() || (zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
        job_desc:String(row?.job_desc || row?.detail || '').trim(),
        sort_order:Number(row?.sort_order || row?.order || index + 1) || (index + 1),
        eligibility_code:outingSet ? `OUTING:${code}` : (String(row?.eligibility_code || '').trim().replace(/^OUTING:/i, '') || code),
        is_outing:!!outingSet,
        is_active:row?.is_active === false ? false : true
      };
    }).filter(Boolean).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }
  function currentSlotConfigs(){
    const st = appState();
    try {
      return clone(window.cnmiV224?.currentConfigs?.()
        || window.cnmiV227?.currentConfigs226?.()
        || window.cnmiV226?.currentConfigs226?.()
        || st?.slotTemplateV224?.configs
        || { day:{}, outing:[], outing_by_count:{} });
    } catch (_) {
      return clone(st?.slotTemplateV224?.configs || { day:{}, outing:[], outing_by_count:{} });
    }
  }
  function normalizeConfig(config){
    const source = config || {};
    const out = { day:{}, outing:[], outing_by_count:{} };
    DAY_SETS.forEach(count => {
      out.day[count] = normalizeSlotRows(source.day?.[count] || source.day?.[String(count)] || [], false);
    });
    OUTING_SETS.forEach(count => {
      out.outing_by_count[count] = normalizeSlotRows(
        source.outing_by_count?.[count]
        || source.outing_by_count?.[String(count)]
        || (count === 14 ? source.outing : [])
        || [],
        true
      );
    });
    out.outing = normalizeSlotRows(source.outing || out.outing_by_count[14] || [], true);
    if (!out.outing.length && out.outing_by_count[14].length) out.outing = clone(out.outing_by_count[14]);
    if (!out.outing_by_count[14].length && out.outing.length) out.outing_by_count[14] = clone(out.outing);
    return out;
  }
  function parseDbConfigs(rows, fallback){
    const out = normalizeConfig(fallback || currentSlotConfigs());
    let found = 0;
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const parsed = safeJson(row?.job_desc);
      if (!Array.isArray(parsed)) return;
      const code = String(row?.code || '');
      const day = code.match(/:DAY:(\d+)$/);
      const outingCount = code.match(/:OUTING:(\d+)$/);
      if (day && DAY_SETS.includes(Number(day[1]))) {
        out.day[Number(day[1])] = normalizeSlotRows(parsed, false);
        found += 1;
        return;
      }
      if (outingCount && OUTING_SETS.includes(Number(outingCount[1]))) {
        out.outing_by_count[Number(outingCount[1])] = normalizeSlotRows(parsed, true);
        found += 1;
        return;
      }
      if (code.endsWith(':OUTING')) {
        out.outing = normalizeSlotRows(parsed, true);
        found += 1;
      }
    });
    if (!out.outing_by_count[14].length && out.outing.length) out.outing_by_count[14] = clone(out.outing);
    if (!out.outing.length && out.outing_by_count[14].length) out.outing = clone(out.outing_by_count[14]);
    return { config:out, found };
  }
  function applySlotConfig(config){
    const cfg = normalizeConfig(config);
    const st = appState();
    if (st) {
      if (!st.slotTemplateV224) st.slotTemplateV224 = { kind:'day', setNo:14, configs:null, loaded:false, loading:false };
      st.slotTemplateV224.configs = cfg;
      st.slotTemplateV224.loaded = true;
      st.slotTemplateV224.loading = false;
      st.slotTemplateV224.sourceV260 = 'supabase';
      st.slotTemplateV224.loadedAtV260 = new Date().toISOString();
    }
    try { localStorage.setItem(SLOT_CACHE_KEY, JSON.stringify(cfg)); } catch (_) {}
    try { window.cnmiV224?.applyConfigsToRuntime?.(); } catch (_) {}
    try { window.cnmiV227?.applyConfigs226?.(); } catch (_) {}
    try {
      const api = window.cnmiDayPositionSlotsV218 = window.cnmiDayPositionSlotsV218 || {};
      const target = api.DAY_POSITION_SLOT_SETS_218 || api.DAY_POSITION_SLOT_SETS || {};
      DAY_SETS.forEach(count => { target[count] = clone(cfg.day[count] || []); });
      api.DAY_POSITION_SLOT_SETS_218 = target;
      api.DAY_POSITION_SLOT_SETS = target;
      api.outingSlotsV232 = function(count){
        const n = Number(count || 14) <= 12 ? 12 : (Number(count || 14) <= 13 ? 13 : 14);
        return clone(cfg.outing_by_count[n] || cfg.outing || []);
      };
      api.outingSlotsV224 = () => clone(cfg.outing_by_count[14] || cfg.outing || []);
      api.outingSlotsV226 = () => clone(cfg.outing_by_count[14] || cfg.outing || []);
    } catch (error) {
      console.warn(`${VERSION}: runtime slot apply skipped`, error);
    }
    return cfg;
  }
  async function refreshSlotTemplatesFromDatabase(options={}){
    if (slotRefreshInFlight) return slotRefreshInFlight;
    slotRefreshInFlight = (async () => {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const result = await sb.from('daily_position_masters')
        .select('code,job_desc,is_outing,zone,is_active,sort_order,updated_at')
        .like('code', `${CFG_PREFIX}:%`);
      if (result.error) throw result.error;
      const parsed = parseDbConfigs(result.data || [], currentSlotConfigs());
      if (!parsed.found) throw new Error('ไม่พบฐานชุด Slot ที่บันทึกไว้ใน Supabase ระบบจึงไม่ใช้ต้นแบบ V240 มาทับ');
      const cfg = applySlotConfig(parsed.config);
      if (options.render !== false) rerenderCurrentPositionTab();
      if (!options.silent) toast(`รีเฟรชชุด Slot จาก Supabase แล้ว ${parsed.found} ชุด`);
      return cfg;
    })().finally(() => { slotRefreshInFlight = null; });
    return slotRefreshInFlight;
  }

  function permissionKey(row){ return `${String(row?.staff_id || '')}|${String(row?.position_code || '').trim()}`; }
  function normalizePermissionRows(rows){
    const latest = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      if (!row?.staff_id || !row?.position_code) return;
      const key = permissionKey(row);
      const previous = latest.get(key);
      const previousTime = previous ? Date.parse(previous.updated_at || previous.modified_at || previous.created_at || '') || 0 : -1;
      const nextTime = Date.parse(row.updated_at || row.modified_at || row.created_at || '') || 0;
      const previousId = Number(previous?.id);
      const nextId = Number(row?.id);
      const newer = !previous || nextTime > previousTime || (nextTime === previousTime && Number.isFinite(nextId) && (!Number.isFinite(previousId) || nextId >= previousId)) || (nextTime === previousTime && !Number.isFinite(nextId) && index >= Number(previous?.__v260Index || 0));
      if (newer) latest.set(key, { ...row, is_eligible:boolValue(row.is_eligible), __v260Index:index });
    });
    return Array.from(latest.values()).map(row => { const out = { ...row }; delete out.__v260Index; return out; });
  }
  function writePermissionCache(rows){
    try {
      localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify({ version:2, source:'supabase', saved_at:new Date().toISOString(), rows:normalizePermissionRows(rows) }));
    } catch (_) {}
  }
  function nextPermissionRefreshGeneration(){
    permissionRefreshSequence = Math.max(permissionRefreshSequence, Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0)) + 1;
    window.__CNMI_PERMISSION_REFRESH_GENERATION__ = permissionRefreshSequence;
    return permissionRefreshSequence;
  }
  function isLatestPermissionRefresh(generation){
    return Number(generation) === Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0);
  }
  function clearSessionValuesForStaff(staffId){
    try {
      const map = window.cnmiV258?.sessionValues;
      if (!map || typeof map.keys !== 'function') return;
      const prefix = `${String(staffId || '')}|`;
      Array.from(map.keys()).forEach(key => { if (String(key).startsWith(prefix)) map.delete(key); });
    } catch (_) {}
  }
  function replaceStaffPermissionRows(staffId, serverRows){
    const st = appState();
    if (!st) return normalizePermissionRows(serverRows || []);
    const sid = String(staffId || '');
    const others = (Array.isArray(st.positionEligibility) ? st.positionEligibility : [])
      .filter(row => String(row?.staff_id || '') !== sid);
    const merged = normalizePermissionRows(others.concat(serverRows || []));
    clearSessionValuesForStaff(sid);
    st.positionEligibility = merged;
    st.positionEligibilitySourceV260 = 'supabase-force-readback';
    st.positionEligibilityLoadedAtV260 = new Date().toISOString();
    try { window.cnmiV258?.normalizeStateRows?.(); } catch (_) {}
    writePermissionCache(st.positionEligibility || merged);
    return normalizePermissionRows(serverRows || []);
  }

  async function loadStaffPermissions(staffId, options={}){
    const sid = String(staffId || '').trim();
    if (!sid) throw new Error('ไม่พบ staffId สำหรับโหลดสิทธิ์');
    if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
    // Always starts a new request. It never reuses permissionRefreshInFlight.
    const generation = nextPermissionRefreshGeneration();
    const result = await sb.from('daily_position_eligibility').select('*').eq('staff_id', sid);
    if (result.error) throw result.error;
    const rows = normalizePermissionRows(result.data || []);
    if (!isLatestPermissionRefresh(generation)) {
      try { console.info(`${VERSION}: ignored stale per-staff permission response`, sid, generation); } catch (_) {}
      return rows;
    }
    replaceStaffPermissionRows(sid, rows);
    if (options.render !== false) rerenderCurrentPositionTab();
    if (!options.silent) toast(`โหลดสิทธิ์ล่าสุดของเจ้าหน้าที่ที่เลือกแล้ว ${rows.length} รายการ`);
    return rows;
  }

  async function refreshPermissionsFromDatabase(options={}){
    if (permissionRefreshInFlight && options.force !== true) return permissionRefreshInFlight;
    const generation = nextPermissionRefreshGeneration();
    const request = (async () => {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const result = await sb.from('daily_position_eligibility').select('*');
      if (result.error) throw result.error;
      const rows = normalizePermissionRows(result.data || []);
      const st = appState();
      const currentCount = Array.isArray(st?.positionEligibility) ? st.positionEligibility.length : 0;
      if (!rows.length && currentCount && options.allowEmpty !== true) {
        throw new Error('Supabase คืนค่าสิทธิ์ 0 รายการ ระบบจึงหยุดไว้ก่อนและไม่ล้างค่าที่หน้าจอ');
      }
      // A request started before a save/readback is stale and must not touch UI state.
      if (!isLatestPermissionRefresh(generation)) {
        try { console.info(`${VERSION}: ignored stale all-permission response`, generation); } catch (_) {}
        return rows;
      }
      try { window.cnmiV258?.sessionValues?.clear?.(); } catch (_) {}
      if (st) {
        st.positionEligibility = rows;
        st.positionEligibilitySourceV260 = options.force === true ? 'supabase-force' : 'supabase';
        st.positionEligibilityLoadedAtV260 = new Date().toISOString();
      }
      try { window.cnmiV258?.normalizeStateRows?.(); } catch (_) {}
      writePermissionCache(rows);
      if (options.render !== false) rerenderCurrentPositionTab();
      if (!options.silent) toast(`รีเฟรชสิทธิ์เฉพาะบุคคลจาก Supabase แล้ว ${rows.length} รายการ`);
      return rows;
    })();
    permissionRefreshInFlight = request;
    try { return await request; }
    finally { if (permissionRefreshInFlight === request) permissionRefreshInFlight = null; }
  }

  function slotConfigEntries(config){
    const cfg = normalizeConfig(config);
    const entries = [];
    DAY_SETS.forEach(count => entries.push({
      code:`${CFG_PREFIX}:DAY:${count}`,
      rows:cfg.day[count] || []
    }));
    entries.push({ code:`${CFG_PREFIX}:OUTING`, rows:cfg.outing_by_count[14] || cfg.outing || [] });
    OUTING_SETS.forEach(count => entries.push({
      code:`${CFG_PREFIX}:OUTING:${count}`,
      rows:cfg.outing_by_count[count] || []
    }));
    return { cfg, entries };
  }
  async function upsertConfigRows(config){
    const packed = slotConfigEntries(config);
    for (const entry of packed.entries) {
      const payload = {
        code:entry.code,
        eligibility_code:null,
        zone:'SYSTEM',
        break_time:'-',
        main_rule:'SLOT_TEMPLATE_CONFIG',
        job_desc:JSON.stringify(entry.rows || []),
        is_outing:false,
        is_active:false,
        sort_order:99000,
        deleted_at:null,
        updated_by:currentUserId()
      };
      const result = await sb.from('daily_position_masters').upsert(payload, { onConflict:'code,is_outing' });
      if (result.error) throw result.error;
    }
    return packed.cfg;
  }
  function uniqueDayMasterRows(config){
    const map = new Map();
    [14,13,12,11,10,9,8].forEach(count => {
      (config.day[count] || []).forEach(row => {
        const code = cleanCode(row?.code);
        if (code && !map.has(code)) map.set(code, { ...row, code, is_outing:false });
      });
    });
    return Array.from(map.values());
  }
  async function syncActiveMasterRows(config){
    const cfg = normalizeConfig(config);
    const dayRows = uniqueDayMasterRows(cfg);
    const outingRows = normalizeSlotRows(cfg.outing_by_count[14] || cfg.outing || [], true);
    const dayCodes = new Set(dayRows.map(row => row.code));
    const outingCodes = new Set(outingRows.map(row => row.code));
    const existingResult = await sb.from('daily_position_masters').select('*');
    if (existingResult.error) throw existingResult.error;
    const existing = existingResult.data || [];

    for (const row of existing) {
      if (isConfigRow(row)) continue;
      const code = cleanCode(row?.code);
      if (!code) continue;
      const shouldExist = isOutingMaster(row) ? outingCodes.has(code) : dayCodes.has(code);
      if (!shouldExist && row.is_active !== false) {
        const update = await sb.from('daily_position_masters')
          .update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:currentUserId() })
          .eq('id', row.id);
        if (update.error) throw update.error;
      }
    }

    const saveMaster = async (row, outing) => {
      const code = cleanCode(row?.code);
      const payload = {
        code,
        eligibility_code:outing ? `OUTING:${code}` : (String(row?.eligibility_code || '').replace(/^OUTING:/i, '').trim() || code),
        zone:row?.zone || (outing ? 'ออกหน่วย' : 'Blood Bank'),
        break_time:row?.break_time || (row?.zone === 'ออกหน่วย' ? 'ออกหน่วย' : '-'),
        main_rule:row?.main_rule || null,
        job_desc:row?.job_desc || null,
        is_outing:!!outing,
        is_active:true,
        sort_order:Number(row?.sort_order || 999),
        deleted_at:null,
        updated_by:currentUserId()
      };
      const found = existing.find(item => !isConfigRow(item) && cleanCode(item?.code) === code && isOutingMaster(item) === !!outing);
      const result = found?.id
        ? await sb.from('daily_position_masters').update(payload).eq('id', found.id)
        : await sb.from('daily_position_masters').insert({ ...payload, created_by:currentUserId() });
      if (result.error) throw result.error;
    };
    for (const row of dayRows) await saveMaster(row, false);
    for (const row of outingRows) await saveMaster(row, true);
  }
  async function saveAllSlotConfigsAsCurrentBase(){
    if (!adminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (saveSlotInFlight) return toast('ระบบกำลังบันทึกฐานตำแหน่งอยู่ กรุณารอสักครู่');
    let accepted = true;
    try {
      accepted = typeof confirmDialog === 'function'
        ? await confirmDialog('บันทึกชุด Slot 8-14 คน และชุดออกหน่วย 12-14 คนที่เห็นอยู่ทั้งหมดลง Supabase เป็นฐานตำแหน่งปัจจุบัน? การบันทึกนี้จะไม่แก้ไขสิทธิ์เฉพาะบุคคล', 'ยืนยันฐานตำแหน่งปัจจุบัน')
        : window.confirm('ยืนยันบันทึกชุด Slot ทั้งหมดเป็นฐานตำแหน่งปัจจุบัน?');
    } catch (_) {}
    if (!accepted) return;

    saveSlotInFlight = true;
    setPositionSourceButtonsBusy(true, 'กำลังบันทึกฐานตำแหน่ง…');
    try {
      if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
      const cfg = normalizeConfig(currentSlotConfigs());
      await upsertConfigRows(cfg);
      await syncActiveMasterRows(cfg);
      applySlotConfig(cfg);
      try { await window.cnmiV212RefreshPositionMasters?.({ renderAfter:false, silent:true }); } catch (_) {}
      await refreshSlotTemplatesFromDatabase({ render:false, silent:true });
      rerenderCurrentPositionTab();
      toast('บันทึกทั้งหมดเป็นฐานตำแหน่งปัจจุบันใน Supabase แล้ว โดยไม่แตะสิทธิ์เฉพาะบุคคล');
    } catch (error) {
      console.error(`${VERSION}: save slot base failed`, error);
      toast('บันทึกฐานตำแหน่งไม่สำเร็จ: ' + friendly(error), 'error');
    } finally {
      saveSlotInFlight = false;
      setPositionSourceButtonsBusy(false);
    }
  }

  function currentTab(){
    try { return window.cnmiV244PositionPermissions?.currentTab?.() || appState()?.positionManagementSubtabV244 || 'slots'; }
    catch (_) { return appState()?.positionManagementSubtabV244 || 'slots'; }
  }
  function rerenderCurrentPositionTab(){
    const st = appState();
    if (!st || st.page !== 'positionManagement') return;
    try { window.cnmiV244PositionPermissions?.renderTabbedPositionManagement?.(); }
    catch (_) { try { renderPage(); } catch (__) {} }
    setTimeout(injectPositionSourceControls, 30);
  }
  function setPositionSourceButtonsBusy(busy, text){
    document.querySelectorAll('[data-v260-refresh-slots],[data-v260-save-slot-base],[data-v260-refresh-permissions]').forEach(button => {
      if (!button.dataset.v260Text) button.dataset.v260Text = button.textContent || '';
      button.disabled = !!busy;
      if (busy && text) button.textContent = text;
      if (!busy && button.dataset.v260Text) button.textContent = button.dataset.v260Text;
    });
  }
  function removeLegacyV240Buttons(root){
    try { (root || document).querySelectorAll('.v232-default-slot-actions,[data-v232-load-default-slots],[data-v232-save-default-slots]').forEach(node => node.remove()); }
    catch (_) {}
  }
  function slotSourceActionsHtml(){
    return `<div class="actions v260-slot-source-actions">
      <button type="button" class="ghost-btn" data-v260-refresh-slots>รีเฟรชจากฐานข้อมูลล่าสุด</button>
      <button type="button" class="primary-btn" data-v260-save-slot-base>บันทึกทั้งหมดเป็นฐานตำแหน่งปัจจุบัน</button>
    </div>`;
  }
  function injectPositionSourceControls(){
    const st = appState();
    if (!st || st.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    removeLegacyV240Buttons(root);

    if (currentTab() === 'slots') {
      root.querySelectorAll('[data-v224-refresh-config],[data-v224-save-all],[data-v226-refresh-config],[data-v226-save-all]').forEach(button => {
        button.classList.add('v260-legacy-slot-action');
        button.setAttribute('aria-hidden', 'true');
        button.tabIndex = -1;
      });
      const card = root.querySelector('.v224-slot-crud-card') || root.querySelector('.v226-position-template-page .card');
      if (card && !card.querySelector('[data-v260-refresh-slots]')) {
        const title = card.querySelector('.section-title');
        if (title) title.insertAdjacentHTML('beforeend', slotSourceActionsHtml());
        else card.insertAdjacentHTML('afterbegin', slotSourceActionsHtml());
      }
      if (card && !card.querySelector('.v260-source-note')) {
        const toolbar = card.querySelector('.v224-template-toolbar');
        const note = `<div class="notice soft-notice compact v260-source-note"><b>ต้นทางปัจจุบัน: Supabase</b> • เปิดหน้าใหม่หรืออัปเดตไฟล์ ระบบจะโหลดชุด Slot ที่บันทึกไว้ในฐานข้อมูล ไม่โหลด V240 มาทับอัตโนมัติ</div>`;
        if (toolbar) toolbar.insertAdjacentHTML('beforebegin', note); else card.insertAdjacentHTML('afterbegin', note);
      }
    } else {
      const panel = root.querySelector('.eligibility-position-panel');
      const section = panel?.querySelector('.section-title');
      if (section && !section.querySelector('[data-v260-refresh-permissions]')) {
        section.insertAdjacentHTML('beforeend', `<button type="button" class="ghost-btn v260-refresh-permission-btn" data-v260-refresh-permissions>รีเฟรชสิทธิ์จากฐานข้อมูลล่าสุด</button>`);
      }
      if (panel && !panel.querySelector('.v260-permission-source-note')) {
        const grid = panel.querySelector('.position-card-grid');
        const note = `<div class="notice soft-notice compact v260-permission-source-note"><b>ต้นทางสิทธิ์: Supabase</b> • การติ๊กแล้วกดบันทึกจะเป็นฐานถาวรของรายคนนั้น และการอัปเดต ZIP จะไม่สร้างสิทธิ์ใหม่ทับ</div>`;
        if (grid) grid.insertAdjacentHTML('beforebegin', note); else panel.insertAdjacentHTML('beforeend', note);
      }
    }
  }

  document.addEventListener('click', function(event){
    const refreshSlots = event.target?.closest?.('[data-v260-refresh-slots]');
    const saveSlots = event.target?.closest?.('[data-v260-save-slot-base]');
    const refreshPermissions = event.target?.closest?.('[data-v260-refresh-permissions]');
    if (!refreshSlots && !saveSlots && !refreshPermissions) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (refreshSlots) {
      setPositionSourceButtonsBusy(true, 'กำลังโหลดจาก Supabase…');
      refreshSlotTemplatesFromDatabase().catch(error => {
        console.error(`${VERSION}: slot refresh failed`, error);
        toast('รีเฟรชชุด Slot ไม่สำเร็จ: ' + friendly(error), 'error');
      }).finally(() => setPositionSourceButtonsBusy(false));
      return;
    }
    if (saveSlots) { saveAllSlotConfigsAsCurrentBase(); return; }
    if (refreshPermissions) {
      setPositionSourceButtonsBusy(true, 'กำลังโหลดสิทธิ์…');
      const sid = String(document.getElementById('eligibilityStaffSelect')?.value || appState()?.eligibilityStaffId || '').trim();
      const task = sid
        ? loadStaffPermissions(sid, { force:true })
        : refreshPermissionsFromDatabase({ force:true });
      task.catch(error => {
        console.error(`${VERSION}: permission refresh failed`, error);
        toast('รีเฟรชสิทธิ์ไม่สำเร็จ: ' + friendly(error), 'error');
      }).finally(() => setPositionSourceButtonsBusy(false));
    }
  }, true);

  // Supabase must win after every full application reload. V259 local backup remains only a safety copy.
  try {
    const oldLoadAllData = window.loadAllData || (typeof loadAllData === 'function' ? loadAllData : null);
    if (oldLoadAllData && !oldLoadAllData.__v260PositionSourceOfTruth) {
      const wrappedLoadAllData = async function loadAllDataV260(){
        const result = await oldLoadAllData.apply(this, arguments);
        const tasks = [
          refreshPermissionsFromDatabase({ render:false, silent:true }),
          refreshSlotTemplatesFromDatabase({ render:false, silent:true })
        ];
        const settled = await Promise.allSettled(tasks);
        settled.forEach(item => { if (item.status === 'rejected') console.warn(`${VERSION}: post-load refresh skipped`, item.reason); });
        setTimeout(injectPositionSourceControls, 0);
        return result;
      };
      wrappedLoadAllData.__v260PositionSourceOfTruth = true;
      assignGlobalFunction('loadAllData', wrappedLoadAllData);
    }
  } catch (_) {}

  // After each permission save, read the saved truth back from Supabase and replace session/cache values.
  try {
    const oldSaveEligibility = window.savePositionEligibility || (typeof savePositionEligibility === 'function' ? savePositionEligibility : null);
    if (oldSaveEligibility && !oldSaveEligibility.__v260ServerVerified) {
      const wrappedSaveEligibility = async function savePositionEligibilityV260(){
        const sid = String(document.getElementById('eligibilityStaffSelect')?.value || appState()?.eligibilityStaffId || '').trim();
        const result = await oldSaveEligibility.apply(this, arguments);
        if (result === false) return result;
        try {
          if (sid) await loadStaffPermissions(sid, { force:true, render:false, silent:true });
          else await refreshPermissionsFromDatabase({ force:true, render:false, silent:true, allowEmpty:true });
        } catch (error) { console.warn(`${VERSION}: post-save permission force refresh failed`, error); }
        rerenderCurrentPositionTab();
        return result;
      };
      wrappedSaveEligibility.__v260ServerVerified = true;
      assignGlobalFunction('savePositionEligibility', wrappedSaveEligibility);
    }
  } catch (_) {}

  try {
    const observer = new MutationObserver(() => injectPositionSourceControls());
    observer.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  const style = document.createElement('style');
  style.id = 'cnmi-v260-position-source-style';
  style.textContent = `
    .v232-default-slot-actions,.v260-legacy-slot-action{display:none!important}
    .v260-slot-source-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
    .v260-source-note,.v260-permission-source-note{border-color:#86efac;background:#f0fdf4;color:#166534}
    .v260-refresh-permission-btn{margin-left:auto;white-space:normal}
    [data-v260-refresh-slots]:disabled,[data-v260-save-slot-base]:disabled,[data-v260-refresh-permissions]:disabled{opacity:.65;cursor:wait}
    @media(max-width:760px){.v260-slot-source-actions{width:100%;margin-left:0}.v260-slot-source-actions button,.v260-refresh-permission-btn{width:100%;margin-left:0}}
  `;
  document.head.appendChild(style);

  setTimeout(injectPositionSourceControls, 100);
  setTimeout(injectPositionSourceControls, 500);
  setTimeout(() => {
    const st = appState();
    if (!st?.profile || typeof sb === 'undefined' || !sb) return;
    Promise.allSettled([
      refreshPermissionsFromDatabase({ render:false, silent:true }),
      refreshSlotTemplatesFromDatabase({ render:false, silent:true })
    ]).finally(() => injectPositionSourceControls());
  }, 900);

  assignGlobalFunction('loadStaffPermissions', loadStaffPermissions);

  window.cnmiV260 = {
    refreshSlotTemplatesFromDatabase,
    refreshPermissionsFromDatabase,
    loadStaffPermissions,
    saveAllSlotConfigsAsCurrentBase,
    normalizeConfig,
    normalizePermissionRows,
    applySlotConfig,
    injectPositionSourceControls
  };
  console.info(`${VERSION} loaded`);
})();
