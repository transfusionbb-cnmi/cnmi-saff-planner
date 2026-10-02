
/* Original source: patch-v516-person-type-helper.js */
try {
/* CNMI Staff Planner V516
 * Canonical staff-type classifier.
 * Critical Thai-language fix: "นักเทคนิคการแพทย์" contains the word "แพทย์"
 * but is NOT a physician. Older substring regexes could therefore hide MT staff
 * from HR/manpower screens and falsely treat them as doctors.
 */
(function(){
  'use strict';
  const VERSION='V516_PERSON_TYPE_HELPER';
  if(window.__CNMI_V516_PERSON_TYPE_HELPER__)return;
  window.__CNMI_V516_PERSON_TYPE_HELPER__=true;
  const t=v=>String(v==null?'':v).trim();
  const lower=v=>t(v).toLowerCase();
  function isMedicalTechnologist(p){
    if(!p)return false;
    const vals=[p.staff_type,p.role_type,p.position_type,p.position,p.job_title].map(t);
    return vals.some(v=>/^mt$/i.test(v)||/นักเทคนิคการแพทย์|เทคนิคการแพทย์|medical\s*technologist/i.test(v));
  }
  function isClerk(p){
    if(!p)return false;
    const vals=[p.staff_type,p.role_type,p.position_type,p.position,p.job_title].map(t);
    return vals.some(v=>v==='เคิก'||/clerk|ธุรการ|เจ้าหน้าที่ธุรการ/i.test(v));
  }
  function isPhysician(p){
    if(!p)return false;
    if(isMedicalTechnologist(p)||isClerk(p))return false;
    const type=t(p.staff_type), role=t(p.role), pos=t(p.position), job=t(p.job_title), appRole=t(p.app_role);
    const exact=[type,role,appRole].map(lower);
    if(exact.some(v=>['แพทย์','หมอ','physician','doctor'].includes(v)))return true;
    const descriptives=[type,pos,job];
    if(descriptives.some(v=>/^แพทย์(?:$|[\s/()\-]|เวช|ประจำ|ผู้|เฉพาะ|consult)/i.test(v)))return true;
    if(descriptives.concat([role,appRole]).some(v=>/(^|\s|\/|\(|-)(physician|doctor)(\s|\/|\)|-|$)/i.test(v)))return true;
    const nick=t(p.nickname);
    if(/^หมอ\S*/.test(nick)&&!isMedicalTechnologist(p)&&!isClerk(p))return true;
    return false;
  }
  function group(p){
    if(isPhysician(p))return 'แพทย์';
    if(isClerk(p))return 'เคิก';
    return 'MT';
  }
  window.cnmiPersonTypeV516={version:VERSION,isPhysician,isMedicalTechnologist,isClerk,group};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v516-person-type-helper.js", error); }
;

/* Original source: patch-v136-auth-layout-tabs-final.js */
try {
/* v136 Auth + Navigation + Layout Stabilizer
   Scope: no duty calculation changes. Only guards auth flow, renders schedule tabs/UI, and restores compact Ch4 layout.
*/
(function () {
  'use strict';

  const FORCE_KEYS = ['cnmi.forcePasswordSetup.v134','cnmi.forcePasswordSetup.v135','cnmi.forcePasswordSetup.v136'];
  function html(s) { return typeof escapeHtml === 'function' ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function rawUrl() { return String(location.href || '') + ' ' + String(location.search || '') + ' ' + String(location.hash || ''); }
  function authInfo(raw = rawUrl()) {
    const text = String(raw || '');
    const params = new URLSearchParams((String(location.search || '') + '&' + String(location.hash || '').replace(/^#/, '')).replace(/^&/, ''));
    const type = params.get('type') || '';
    const mode = params.get('mode') || '';
    const hasToken = /(access_token|refresh_token|token_hash|(^|[?#&])code=)/i.test(text);
    const hasAuthType = /^(recovery|password_recovery|invite|signup)$/i.test(type);
    // V196: A bare ?mode=recovery is only a stale URL marker, not an active recovery link.
    // Keep mode support only when a token/code or explicit auth type is also present.
    const isRecovery = hasToken || hasAuthType || (/^(recovery|set-password|update-password)$/i.test(mode) && (hasToken || hasAuthType));
    const hasError = /(error=|error_code=|error_description=)/i.test(text);
    return { text, type, mode, hasToken, isRecovery, hasError };
  }
  function forcePassword(reason) {
    window.CNMI_AUTH_LINK_INTENT = true;
    window.CNMI_REQUIRE_PASSWORD_UPDATE = true;
    window.RECOVERY_INTENT = true;
    window.AUTH_LINK_PROCESSING = true;
    FORCE_KEYS.forEach(k => { try { sessionStorage.setItem(k, JSON.stringify({ reason: reason || 'v136', at: Date.now() })); } catch (_) {} });
    document.documentElement.classList.add('v136-auth-link');
  }
  function isForced() {
    if (window.CNMI_REQUIRE_PASSWORD_UPDATE || window.CNMI_AUTH_LINK_INTENT) return true;
    for (const k of FORCE_KEYS) { try { if (sessionStorage.getItem(k)) return true; } catch (_) {} }
    const info = authInfo();
    return info.isRecovery && !info.hasError;
  }
  function clearForced() {
    window.CNMI_REQUIRE_PASSWORD_UPDATE = false;
    window.CNMI_AUTH_LINK_INTENT = false;
    window.RECOVERY_INTENT = false;
    window.AUTH_LINK_PROCESSING = false;
    FORCE_KEYS.forEach(k => { try { sessionStorage.removeItem(k); } catch (_) {} });
    document.documentElement.classList.remove('v136-auth-link');
  }
  function appBaseUrl() {
    try {
      const parts = location.pathname.split('/').filter(Boolean);
      if (location.hostname.endsWith('github.io') && parts[0]) return location.origin + '/' + parts[0] + '/';
      if (location.pathname.includes('/cnmi-saff-planner/')) return location.origin + '/cnmi-saff-planner/';
    } catch (_) {}
    return location.origin + '/';
  }
  function cleanToRecoveryMode() {
    // V196: avoid writing a token-less ?mode=recovery back into the URL.
    // Older behavior left a stale recovery marker that could revive password setup mode
    // during unrelated saves. Keep the user at app root after Supabase has consumed the link.
    try { history.replaceState({}, document.title, appBaseUrl()); } catch (_) {}
  }
  function showPasswordOverlay() {
    const authView = document.getElementById('authView');
    const appView = document.getElementById('appView');
    const resetForm = document.getElementById('resetPasswordForm');
    if (!authView || !appView || !resetForm) return false;
    appView.classList.add('hidden');
    authView.classList.remove('hidden');
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    resetForm.classList.remove('hidden');
    resetForm.classList.add('active', 'v136-password-panel');
    const h = document.querySelector('.auth-card h1');
    if (h) h.textContent = 'ตั้งชื่อผู้ใช้และรหัสผ่านใหม่';
    return true;
  }
  function showAuthExpired(msg) {
    try { window.CNMI_REQUIRE_PASSWORD_UPDATE = false; } catch (_) {}
    if (typeof showToast === 'function') showToast(msg || 'ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง', { tone:'error' });
  }

  const firstInfo = authInfo();
  if (firstInfo.isRecovery && !firstInfo.hasError) forcePassword('v136-early-url');
  if (firstInfo.hasError) {
    try { sessionStorage.removeItem('cnmi.forcePasswordSetup.v134'); sessionStorage.removeItem('cnmi.forcePasswordSetup.v135'); sessionStorage.removeItem('cnmi.forcePasswordSetup.v136'); } catch (_) {}
    setTimeout(async () => {
      try { if (window.sb && sb.auth) await sb.auth.signOut(); } catch (_) {}
      showAuthExpired();
    }, 100);
  }

  const originalShowLogin = window.showLoginPanel;
  window.showLoginPanel = function showLoginPanelV136() {
    if (isForced()) { forcePassword('block-show-login'); showPasswordOverlay(); return; }
    return typeof originalShowLogin === 'function' ? originalShowLogin.apply(this, arguments) : undefined;
  };
  try { showLoginPanel = window.showLoginPanel; } catch (_) {}

  const originalShowReset = window.showResetPasswordPanel;
  window.showResetPasswordPanel = function showResetPasswordPanelV136() {
    if (typeof originalShowReset === 'function') { try { originalShowReset.apply(this, arguments); } catch (_) {} }
    showPasswordOverlay();
  };
  try { showResetPasswordPanel = window.showResetPasswordPanel; } catch (_) {}

  const originalEnterApp = window.enterApp;
  window.enterApp = async function enterAppV136() {
    if (isForced()) { forcePassword('block-enter-app'); showPasswordOverlay(); try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} return; }
    return typeof originalEnterApp === 'function' ? originalEnterApp.apply(this, arguments) : undefined;
  };
  try { enterApp = window.enterApp; } catch (_) {}

  document.addEventListener('DOMContentLoaded', () => {
    if (isForced()) {
      forcePassword('domcontentloaded');
      showPasswordOverlay();
      [80, 300, 800, 1600, 2600].forEach(ms => setTimeout(showPasswordOverlay, ms));
      setTimeout(cleanToRecoveryMode, 2500);
    }
  });

  // Stop auth tabs/login UI from stealing focus while a recovery/invite link is being processed.
  document.addEventListener('click', (e) => {
    if (!isForced()) return;
    const tab = e.target.closest('.auth-tab, [data-auth-tab]');
    if (tab) { e.preventDefault(); e.stopImmediatePropagation(); showPasswordOverlay(); }
  }, true);

  async function waitSession(maxMs = 5000) {
    const waits = [0, 150, 300, 550, 900, 1300, 1800, 2400, 3200, 4200];
    let last = null;
    for (const ms of waits) {
      if (ms) await new Promise(r => setTimeout(r, ms));
      try {
        if (!window.sb && typeof sb !== 'undefined') window.sb = sb;
        const client = window.sb || (typeof sb !== 'undefined' ? sb : null);
        if (!client?.auth) continue;
        const res = await client.auth.getSession();
        last = res.data;
        if (res.data?.session?.user) return res.data;
      } catch (_) {}
      if (ms > maxMs) break;
    }
    return last || { session: null };
  }

  document.addEventListener('submit', async (e) => {
    if (!(e.target && e.target.id === 'resetPasswordForm') || !isForced()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const loginName = String(document.getElementById('recoveryLoginName')?.value || '').trim();
    const password = String(document.getElementById('newPassword')?.value || '');
    if (!loginName) return typeof showToast === 'function' && showToast('กรุณาตั้งชื่อผู้ใช้');
    if (!/^[a-zA-Z0-9._-]+$/.test(loginName)) return typeof showToast === 'function' && showToast('ชื่อผู้ใช้ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');
    if (!password || password.length < 6) return typeof showToast === 'function' && showToast('กรุณากรอกรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร');
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกชื่อผู้ใช้และรหัสผ่าน'); } catch (_) {}
    try {
      const client = (typeof sb !== 'undefined' ? sb : window.sb);
      if (!client?.auth) throw new Error('ระบบ Auth ยังไม่พร้อม กรุณารีเฟรชแล้วลองใหม่');
      let data = await waitSession();
      let user = data?.session?.user || null;
      if (!user) throw new Error('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');
      const email = user.email || '';
      // Save login name first. If RPC is absent, continue password update but show clear console detail.
      try {
        const r = await client.rpc('set_initial_login_name_v44', { p_email: email, p_login_name: loginName });
        if (r.error) throw r.error;
      } catch (rpcErr) {
        console.warn('set_initial_login_name_v44 failed; continue password update', rpcErr);
      }
      const upd = await client.auth.updateUser({ password });
      if (upd.error) throw upd.error;
      try { await client.rpc('link_my_staff_profile_v132'); } catch (linkErr) { console.warn('link profile rpc skipped', linkErr); }
      clearForced();
      cleanToRecoveryMode();
      try { history.replaceState({}, document.title, appBaseUrl()); } catch (_) {}
      const after = await client.auth.getSession();
      if (typeof state !== 'undefined') state.session = after.data?.session || data.session;
      document.getElementById('resetPasswordForm')?.classList.add('hidden');
      if (typeof showToast === 'function') showToast('ตั้งรหัสผ่านสำเร็จ');
      if (typeof originalEnterApp === 'function') await originalEnterApp();
    } catch (err) {
      forcePassword('submit-failed');
      showPasswordOverlay();
      if (typeof showToast === 'function') showToast(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ', { tone:'error' });
    } finally {
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  }, true);

  // V150: schedule/roster overrides removed. Clean schedule components now live in app.js.
})();

} catch (error) { console.error("[v569] patch-v136-auth-layout-tabs-final.js", error); }
;

/* Original source: patch-v137-critical-regression-restore.js */
try {
/* v137 Critical Regression Restore
   Scope: restore missing admin menus, sanitize holiday titles, keep person cards scoped,
   strengthen long-leave balance reset and add days-off columns. Does not change duty OT formulas.
*/
(function(){
  'use strict';
  if (window.__CNMI_V137_CRITICAL_RESTORE__) return;
  window.__CNMI_V137_CRITICAL_RESTORE__ = true;

  const MARKER = ':::DUTY_RULES:';
  const CODES = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  const WEEKDAYS = [
    {key:'mon', label:'จันทร์'}, {key:'tue', label:'อังคาร'}, {key:'wed', label:'พุธ'},
    {key:'thu', label:'พฤหัสบดี'}, {key:'fri', label:'ศุกร์'}, {key:'sat', label:'เสาร์'}, {key:'sun', label:'อาทิตย์'}
  ];
  const esc = (v) => (typeof escapeHtml === 'function') ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const $id = (id) => document.getElementById(id);
  const pad2 = (n) => (typeof pad === 'function' ? pad(n) : String(n).padStart(2,'0'));
  const parseD = (d) => (typeof parseDate === 'function' ? parseDate(d) : new Date(`${d}T00:00:00`));
  const monthKeyNow = () => (typeof monthKey === 'function' ? monthKey(new Date()) : new Date().toISOString().slice(0,7));
  const dateThai = (d) => { try { return formatThaiDate(d); } catch(_) { return d; } };
  const showMsg = (m) => { if (typeof showToast === 'function') showToast(m); else alert(m); };
  const staffById = (id) => (state.staff || []).find(s => String(s.id) === String(id));
  const rosterStaff = () => { try { return orderedStaff((state.staff || []).filter(s => typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : s?.is_active !== false)); } catch(_) { return state.staff || []; } };
  const colorOf = (s) => { try { return staffColor(s); } catch(_) { return s?.color || '#dbeafe'; } };
  const isWE = (d) => { try { return isWeekend(d); } catch(_) { return [0,6].includes(parseD(d).getDay()); } };
  const isHol = (d) => { try { return isHolidayDate(d); } catch(_) { return (state.holidays||[]).some(h => h.holiday_date === d); } };
  function cleanHolidayTitle(title='') {
    const t = String(title || '');
    const idx = t.indexOf(MARKER);
    return (idx >= 0 ? t.slice(0, idx) : t).replace(/\s+$/,'').trim() || 'วันหยุดราชการ';
  }
  function decodeHoliday(title='') {
    const t = String(title || '');
    const start = t.indexOf(MARKER);
    if (start < 0) return null;
    const raw = t.slice(start + MARKER.length).split(':::')[0];
    try { return JSON.parse(decodeURIComponent(escape(atob(raw)))); }
    catch(_) { try { return JSON.parse(atob(raw)); } catch(__) { return null; } }
  }
  function encodeHoliday(title, duties, roleMode) {
    const json = JSON.stringify({
      duties: CODES.reduce((acc,c) => { acc[c] = duties.includes(c); return acc; }, {}),
      roleMode: roleMode || 'MT_MT_KERK'
    });
    let enc = '';
    try { enc = btoa(unescape(encodeURIComponent(json))); } catch(_) { enc = btoa(json); }
    return `${String(title || '').trim()} ${MARKER}${enc}:::`.trim();
  }
  function holidayCfg(date) {
    const row = (state.holidays || []).find(h => h.holiday_date === date);
    return decodeHoliday(row?.title || '') || null;
  }
  function normalizeDuty(code='') {
    const c = String(code || '').trim();
    if (['ช4','ช4A','ช4B','ช4-MT/แตง','ช4-MT/แตง1','ช4-MT/แตง-1','ช4-1'].includes(c)) return 'ช4-MT/แตง 1';
    if (['ช4-MT/แตง2','ช4-MT/แตง-2','ช4-2'].includes(c)) return 'ช4-MT/แตง 2';
    if (c === 'ช9-MT') return 'ช9-MT/แตง';
    return c;
  }
  function detailDuty(code) {
    const c = normalizeDuty(code);
    if (c === 'ช4-MT/แตง 1') return 'ช4-MT/แตง 1';
    if (c === 'ช4-MT/แตง 2') return 'ช4-MT/แตง 2';
    if (c === 'ช9-MT/แตง') return 'ช9-MT/แตง';
    return c;
  }
  function dayKey(date) { return ['sun','mon','tue','wed','thu','fri','sat'][parseD(date).getDay()]; }
  function defaultCodesForDayKey(k) {
    if (k === 'sat' || k === 'sun') return ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง'];
    return ['ชบด1','ชบด2','ชบด3','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  }
  function holidayAllowed(date) {
    const cfg = holidayCfg(date);
    if (!cfg?.duties) return ['ชบด1','ชบด2','ชบด3'];
    return CODES.filter(c => cfg.duties[c] || (c.startsWith('ช4') && cfg.duties['ช4-MT/แตง']));
  }
  function holidayRoleMode(date) { return holidayCfg(date)?.roleMode || 'MT_MT_KERK'; }
  function eligCode(day, duty) { return `DUTY_RULE:${day}:${normalizeDuty(duty)}`; }
  function eligRows(staffId) { return (state.positionEligibility || []).filter(r => String(r.staff_id) === String(staffId) && String(r.position_code || '').startsWith('DUTY_RULE:')); }

  // 1) Always sanitize hidden Base64 duty-rule payload before rendering holiday names.
  const oldHolidayName = window.holidayName || (typeof holidayName === 'function' ? holidayName : null);
  window.holidayName = function holidayNameV137(date) {
    const raw = (state.holidays || []).find(h => h.holiday_date === date)?.title;
    if (raw) return cleanHolidayTitle(raw);
    return oldHolidayName ? cleanHolidayTitle(oldHolidayName(date)) : 'วันหยุดราชการ';
  };
  try { holidayName = window.holidayName; } catch(_) {}

  // 2) Restore missing Admin menu items without deleting current menu logic.
  function ensureMenu() {
    if (!Array.isArray(window.NAV_ITEMS || NAV_ITEMS)) return;
    const arr = window.NAV_ITEMS || NAV_ITEMS;
    if (!arr.some(x => x.id === 'holidayRulesV107')) arr.push({ id:'holidayRulesV107', icon:'🎌', title:'ตั้งค่าเวรวันนักขัตฤกษ์', subtitle:'กำหนดวันนักขัตฤกษ์และเวรที่เปิด', group:'admin' });
    if (!arr.some(x => x.id === 'dutyEligibilityV107')) arr.push({ id:'dutyEligibilityV107', icon:'✅', title:'สิทธิ์เวรตามวัน', subtitle:'กำหนดสิทธิ์เวรแยกรายวันและรายคน', group:'admin' });
  }
  ensureMenu();

  function noPerm() { return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งานหน้านี้</div>'; }
  function renderDutyEligibilityPageV137() {
    if (typeof isAdmin === 'function' && !isAdmin()) return noPerm();
    const active = rosterStaff();
    if (!active.length) return typeof empty === 'function' ? empty('ยังไม่มีเจ้าหน้าที่ที่เปิดสิทธิ์จัดเวร') : '<div class="card">ยังไม่มีเจ้าหน้าที่</div>';
    if (!state.dutyEligibilityStaffId || !active.some(s => String(s.id) === String(state.dutyEligibilityStaffId))) state.dutyEligibilityStaffId = active[0].id;
    const selected = active.find(s => String(s.id) === String(state.dutyEligibilityStaffId)) || active[0];
    const hasRows = eligRows(selected.id).length > 0;
    const dayRows = WEEKDAYS.map(w => `<tr><th>${esc(w.label)}</th>${CODES.map(code => {
      const rec = (state.positionEligibility || []).find(r => String(r.staff_id) === String(selected.id) && r.position_code === eligCode(w.key, code));
      const checked = rec ? !!rec.is_eligible : defaultCodesForDayKey(w.key).includes(code);
      return `<td><label class="switch-check"><input type="checkbox" data-duty-eligibility-v137 data-staff-id="${esc(selected.id)}" data-day-key="${esc(w.key)}" data-duty-code="${esc(code)}" ${checked?'checked':''}><span></span></label></td>`;
    }).join('')}</tr>`).join('');
    const bg = colorOf(selected);
    const fg = typeof textColorFor === 'function' ? textColorFor(bg) : '#0f172a';
    return `<div class="grid duty-eligibility-page-v137">
      <div class="card eligibility-staff-panel">
        <div class="section-title"><h3>เลือกเจ้าหน้าที่</h3></div>
        <label>เจ้าหน้าที่ <select id="dutyEligibilityStaffSelectV137">${active.map(s => `<option value="${esc(s.id)}" ${String(selected.id)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name)} (${esc(s.staff_type || '-')})</option>`).join('')}</select></label>
        <div class="selected-staff-card" style="background:${esc(bg)};color:${esc(fg)}"><b>${esc(selected.nickname || selected.full_name)}</b></div>
        <div class="notice soft-notice">หน้านี้ใช้กับเวรเท่านั้น ไม่เกี่ยวกับตำแหน่งกลางวัน</div>
      </div>
      <div class="card duty-eligibility-matrix-card">
        <div class="section-title"><div><h3>สิทธิ์เวรตามวันของ ${esc(selected.nickname || selected.full_name)}</h3><p class="hint">ช4-MT/แตง มี 2 ตำแหน่งต่อวัน จึงมี 2 ช่องให้ติ๊กแยกกัน</p></div><button class="primary-btn" type="button" data-save-duty-eligibility-v137>บันทึกสิทธิ์เวร</button></div>
        ${!hasRows ? '<div class="notice soft-notice">ยังไม่เคยตั้งสิทธิ์เวรของคนนี้ ระบบแสดงค่าเริ่มต้นให้ก่อน กดบันทึกเพื่อเริ่มใช้ตารางนี้</div>' : ''}
        <div class="table-wrap duty-eligibility-wrap"><table class="duty-eligibility-table v137-duty-table"><thead><tr><th>วัน</th>${CODES.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${dayRows}</tbody></table></div>
      </div>
    </div>`;
  }
  async function saveDutyEligibilityV137() {
    if (typeof isAdmin === 'function' && !isAdmin()) return showMsg('เฉพาะ Admin เท่านั้น');
    const checks = Array.from(document.querySelectorAll('[data-duty-eligibility-v137]'));
    const rows = checks.map(cb => ({ staff_id: cb.dataset.staffId, position_code: eligCode(cb.dataset.dayKey, cb.dataset.dutyCode), is_eligible: !!cb.checked, updated_by: currentStaffId() }));
    if (!rows.length) return showMsg('ไม่มีข้อมูลสิทธิ์เวรให้บันทึก');
    const { error } = await sb.from('daily_position_eligibility').upsert(rows, { onConflict:'staff_id,position_code' });
    if (error) return showMsg(typeof friendlyDbError === 'function' ? friendlyDbError(error) : error.message);
    const targetStaff = rows[0].staff_id;
    const rowCodes = new Set(rows.map(r => r.position_code));
    state.positionEligibility = (state.positionEligibility || []).filter(r => !(String(r.staff_id) === String(targetStaff) && rowCodes.has(r.position_code))).concat(rows);
    state.rosterDraft = null;
    try { await loadAllData(); } catch(_) {}
    state.positionEligibility = (state.positionEligibility || []).filter(r => !(String(r.staff_id) === String(targetStaff) && rowCodes.has(r.position_code))).concat(rows);
    renderPage(); showMsg('บันทึกสิทธิ์เวรตามวันแล้ว');
  }

  function renderHolidayRulesPageV137() {
    if (typeof isAdmin === 'function' && !isAdmin()) return noPerm();
    const key = state.holidayRuleMonthKey || state.monthKey || monthKeyNow();
    const rows = (state.holidays || []).filter(h => String(h.holiday_date || '').startsWith(key)).sort((a,b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));
    const editing = state.editHolidayRuleDate ? (state.holidays || []).find(h => h.holiday_date === state.editHolidayRuleDate) : null;
    const date = editing?.holiday_date || `${key}-01`;
    const cfg = editing ? holidayCfg(editing.holiday_date) : null;
    const allowed = editing ? holidayAllowed(editing.holiday_date) : ['ชบด1','ชบด2','ชบด3'];
    const mode = cfg?.roleMode || 'MT_MT_KERK';
    return `<div class="grid grid-2 holiday-rules-page-v137">
      <div class="card"><div class="section-title"><h3>${editing ? 'แก้ไขวันหยุดนักขัตฤกษ์' : 'เพิ่มวันหยุดนักขัตฤกษ์'}</h3>${editing ? '<button class="ghost-btn" type="button" data-cancel-edit-holiday-v137>ยกเลิกแก้ไข</button>' : ''}</div>
        <form id="holidayRulesFormV137" class="form-grid compact-form">
          <label>วันที่ <input name="holiday_date" type="date" value="${esc(date)}" ${editing?'readonly':''} required></label>
          <label>ชื่อวันหยุด <input name="title" value="${esc(cleanHolidayTitle(editing?.title || ''))}" placeholder="เช่น วันเข้าพรรษา" required></label>
          <label class="wide">รูปแบบคนอยู่เวรนักขัต <select name="holiday_role_mode"><option value="MT_MT_KERK" ${mode==='MT_MT_KERK'?'selected':''}>MT / MT / เคิก</option><option value="MT_MT_MT" ${mode==='MT_MT_MT'?'selected':''}>MT / MT / MT</option></select></label>
          <div class="wide duty-checkbox-grid"><div class="field-label">เวรที่เปิดในวันนี้</div>${CODES.map(code => `<label class="check-pill"><input type="checkbox" name="holiday_duties" value="${esc(code)}" ${allowed.includes(code)?'checked':''}> <span>${esc(code)}</span></label>`).join('')}</div>
          <button class="primary-btn wide" type="submit">บันทึกวันหยุดและกฎเวร</button>
        </form>
      </div>
      <div class="card"><div class="section-title"><h3>รายการวันหยุด ${esc(key)}</h3></div><div class="toolbar compact-filter"><label>เดือน <input type="month" id="holidayRuleMonthInputV137" value="${esc(key)}"></label></div>
        ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th>รูปแบบ</th><th>เวรที่เปิด</th><th>จัดการ</th></tr></thead><tbody>${rows.map(h => `<tr><td>${dateThai(h.holiday_date)}</td><td>${esc(cleanHolidayTitle(h.title))}</td><td>${holidayRoleMode(h.holiday_date)==='MT_MT_MT'?'MT/MT/MT':'MT/MT/เคิก'}</td><td>${holidayAllowed(h.holiday_date).map(c => `<span class="badge blue">${esc(detailDuty(c))}</span>`).join(' ') || '-'}</td><td><button class="tiny-btn" type="button" data-edit-holiday-v137="${esc(h.holiday_date)}">แก้ไข</button><button class="tiny-btn danger" type="button" data-delete-holiday-v137="${esc(h.holiday_date)}">ลบ</button></td></tr>`).join('')}</tbody></table></div>` : (typeof empty === 'function' ? empty('ยังไม่มีวันหยุดในเดือนนี้') : '<div>ยังไม่มีวันหยุดในเดือนนี้</div>')}
      </div>
    </div>`;
  }
  async function saveHolidayRulesV137(form) {
    if (typeof isAdmin === 'function' && !isAdmin()) return showMsg('เฉพาะ Admin เท่านั้น');
    const fd = new FormData(form);
    const date = fd.get('holiday_date');
    const title = String(fd.get('title') || '').trim();
    const duties = Array.from(form.querySelectorAll('input[name="holiday_duties"]:checked')).map(x => normalizeDuty(x.value));
    const roleMode = String(fd.get('holiday_role_mode') || 'MT_MT_KERK');
    if (!date || !title) return showMsg('กรุณาระบุวันที่และชื่อวันหยุด');
    const row = { holiday_date: date, title: encodeHoliday(title, duties, roleMode), updated_by: currentStaffId() };
    const { error } = await sb.from('public_holidays').upsert(row, { onConflict:'holiday_date' });
    if (error) return showMsg(typeof friendlyDbError === 'function' ? friendlyDbError(error) : error.message);
    state.editHolidayRuleDate = ''; state.rosterDraft = null;
    try { await loadAllData(); } catch(_) {}
    renderPage(); showMsg('บันทึกวันหยุดและกฎเวรแล้ว');
  }
  async function deleteHolidayV137(date) {
    if (typeof confirmDialog === 'function') { if (!(await confirmDialog(`ลบวันหยุด ${dateThai(date)} หรือไม่?`, 'ยืนยันลบวันหยุด'))) return; }
    else if (!confirm(`ลบวันหยุด ${dateThai(date)} หรือไม่?`)) return;
    const { error } = await sb.from('public_holidays').delete().eq('holiday_date', date);
    if (error) return showMsg(typeof friendlyDbError === 'function' ? friendlyDbError(error) : error.message);
    state.editHolidayRuleDate = ''; state.rosterDraft = null;
    try { await loadAllData(); } catch(_) {}
    renderPage(); showMsg('ลบวันหยุดแล้ว');
  }

  // 3) Balance logic display: long leave exemptions and days-off tracking.
  const LONG_LEAVE_WORDS = /(ลาคลอด|ลาบวช|ลาดูใจ|ลาถือศีล)/;
  function isActiveLeave(l) { return !['cancelled','rejected','deleted'].includes(String(l?.status || 'active').toLowerCase()); }
  function overlaps(l, date) { return String(l.start_date || '') <= date && String(l.end_date || l.start_date || '') >= date; }
  function leaveTextFor(s, date) {
    const texts = [];
    (state.leaves || []).filter(isActiveLeave).forEach(l => {
      if (String(l.staff_id) !== String(s.id) || !overlaps(l, date)) return;
      const t = String(l.type || l.leave_type || l.reason || '').trim();
      if (/ไม่รับเวร/.test(t)) texts.push('ไม่รับเวร');
      else if (/คลอด/.test(t)) texts.push('ลาคลอด');
      else if (/บวช/.test(t)) texts.push('ลาบวช');
      else if (/ดูใจ/.test(t)) texts.push('ลาดูใจ');
      else if (/ถือศีล/.test(t)) texts.push('ลาถือศีล');
      else if (/กิจ/.test(t)) texts.push('ลากิจ');
      else if (/ป่วย/.test(t)) texts.push('ลาป่วย');
      else if (/พักผ่อน|พักร้อน/.test(t)) texts.push('ลาพักผ่อน');
      else if (t) texts.push(t);
    });
    if (s.isLongTermLeave || s.is_long_term_leave || LONG_LEAVE_WORDS.test(String(s.position_training_status || s.note || s.remark || ''))) texts.push('ลาคลอด');
    return [...new Set(texts)];
  }
  function isLongLeaveWholeMonth(s, key) {
    const target = Number(s.targetShifts ?? s.target_shifts ?? NaN);
    if (target === 0) return true;
    if (s.isLongTermLeave || s.is_long_term_leave) return true;
    if (LONG_LEAVE_WORDS.test(String(s.position_training_status || s.note || s.remark || ''))) return true;
    const [yy, mm] = key.split('-').map(Number);
    const start = `${yy}-${pad2(mm)}-01`;
    const end = `${yy}-${pad2(mm)}-${pad2(new Date(yy, mm, 0).getDate())}`;
    return (state.leaves || []).filter(isActiveLeave).some(l => String(l.staff_id) === String(s.id) && LONG_LEAVE_WORDS.test(String(l.type || l.leave_type || l.reason || '')) && String(l.start_date || '') <= start && String(l.end_date || l.start_date || '') >= end);
  }
  function previousMonthKey(key) {
    const [y,m] = key.split('-').map(Number); const d = new Date(y, m-2, 1); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  }
  function assignmentListForMonth(key) {
    try { return getAssignmentsForMonth(key).filter(a => a.staff_id); }
    catch(_) { return (state.rosterAssignments || []).filter(a => String(a.duty_date || '').startsWith(key) && a.staff_id); }
  }
  function daysOffForStaff(s, key, assignments) {
    const [y,m] = key.split('-').map(Number); const last = new Date(y,m,0).getDate(); let count = 0;
    for (let day=1; day<=last; day++) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (!(isWE(date) || isHol(date))) continue;
      const hasDuty = (assignments || []).some(a => String(a.staff_id) === String(s.id) && a.duty_date === date);
      const texts = leaveTextFor(s, date);
      if (!hasDuty || texts.includes('ไม่รับเวร')) count++;
    }
    return count;
  }
  function makeBalanceViewV137(assignments) {
    const key = state.monthKey || monthKeyNow();
    const stats = (typeof calcFairness === 'function') ? calcFairness((assignments || []).filter(a => a.staff_id)) : {};
    const staff = rosterStaff();
    const usable = staff.filter(s => !isLongLeaveWholeMonth(s, key));
    const values = usable.map(s => Number(stats[s.id]?.units || stats[s.id]?.total || 0)).filter(Number.isFinite);
    const avgQuota = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
    const prevKey = previousMonthKey(key);
    const prevAssignments = assignmentListForMonth(prevKey);
    const prevOffs = usable.map(s => daysOffForStaff(s, prevKey, prevAssignments));
    const avgPrevOff = prevOffs.length ? prevOffs.reduce((a,b)=>a+b,0)/prevOffs.length : 0;
    return `<div class="v137-balance-dashboard"><div class="notice soft-notice">ลาระยะยาว/ลาคลอด/ลาบวช/ลาดูใจ/ลาถือศีล หรือ targetShifts = 0 จะไม่ถูกนำไปคิดหนี้เวร และเริ่มต้นใหม่เป็น 0 เมื่อกลับมาทำงาน</div><div class="table-wrap"><table class="v137-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรที่จัดแล้ว</th><th>Quota Gap</th><th>OT Balance/ยกยอด</th><th>จำนวนวันหยุด</th><th>ทบวันหยุดครั้งหน้า</th><th>สถานะ</th></tr></thead><tbody>${staff.map(s => {
      const r = stats[s.id] || {};
      const targetRaw = Number(s.targetShifts ?? s.target_shifts ?? avgQuota ?? 0);
      const exempt = isLongLeaveWholeMonth(s, key);
      const current = exempt ? 0 : Number(r.units || r.total || 0);
      const target = exempt ? 0 : targetRaw;
      const gap = exempt ? 0 : target - current;
      const prevExempt = isLongLeaveWholeMonth(s, prevKey);
      const carry = (exempt || prevExempt) ? 0 : Number(s.overtimeBalance ?? s.overtime_balance ?? s.carry_over_balance ?? 0);
      const off = exempt ? 0 : daysOffForStaff(s, key, assignments);
      const prevOff = exempt ? 0 : daysOffForStaff(s, prevKey, prevAssignments);
      const nextOff = exempt ? 0 : (avgPrevOff - prevOff);
      const label = exempt ? 'ยกเว้น/ลาระยะยาว' : prevExempt ? 'รีเซ็ตหลังกลับจากลา' : Math.abs(gap) < 0.5 ? 'สมดุล' : gap > 0 ? 'ขาดเวร' : 'งานหนักเกิน';
      const cls = exempt ? 'exempt' : prevExempt ? 'reset' : Math.abs(gap) < 0.5 ? 'ok' : gap > 0 ? 'warn' : 'over';
      const name = typeof staffPill === 'function' ? staffPill(s) : esc(s.nickname || s.full_name);
      return `<tr><td>${name}</td><td>${current.toFixed(1)}</td><td>${gap.toFixed(1)}</td><td>${carry.toFixed(1)} ชม.</td><td>${off}</td><td>${nextOff.toFixed(1)}</td><td><span class="v137-balance-status ${cls}">${esc(label)}</span></td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  }
  function currentScheduleView() { const v = state.scheduleView || state.scheduleMobileView || 'table'; return v === 'ot' ? 'balance' : v; }

  // 4) Route restore and post-render cleanup. Keep existing pages except the two restored pages and balance tab content.
  const prevRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = function renderPageV137() {
    ensureMenu();
    if (state.page === 'dutyEligibilityV107') {
      const item = (NAV_ITEMS || []).find(x => x.id === 'dutyEligibilityV107') || {};
      if ($id('pageTitle')) $id('pageTitle').textContent = item.title || 'สิทธิ์เวรตามวัน';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = item.subtitle || 'กำหนดสิทธิ์เวรแยกรายวันและรายคน';
      try { renderNav(); } catch(_) {}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderDutyEligibilityPageV137();
      return;
    }
    if (state.page === 'holidayRulesV107') {
      const item = (NAV_ITEMS || []).find(x => x.id === 'holidayRulesV107') || {};
      if ($id('pageTitle')) $id('pageTitle').textContent = item.title || 'ตั้งค่าเวรวันนักขัตฤกษ์';
      if ($id('pageSubtitle')) $id('pageSubtitle').textContent = item.subtitle || 'กำหนดวันนักขัตฤกษ์และเวรที่เปิด';
      try { renderNav(); } catch(_) {}
      if ($id('pageContent')) $id('pageContent').innerHTML = renderHolidayRulesPageV137();
      return;
    }
    const res = prevRenderPage ? prevRenderPage.apply(this, arguments) : undefined;
    postRenderFixes();
    return res;
  };
  try { renderPage = window.renderPage; } catch(_) {}

  function postRenderFixes() {
    if (state.page !== 'schedule') return;
    const page = document.querySelector('.v136-schedule-page');
    if (!page) return;
    const view = currentScheduleView();
    page.classList.toggle('v137-person-active', view === 'person');
    page.classList.toggle('v137-balance-active', view === 'balance');
    if (view === 'balance') {
      const old = page.querySelector('.v136-balance-dashboard, .v137-balance-dashboard');
      const assignments = (typeof getAssignmentsForMonth === 'function') ? getAssignmentsForMonth(state.monthKey) : (state.rosterAssignments || []).filter(a => String(a.duty_date || '').startsWith(state.monthKey || ''));
      if (old) old.outerHTML = makeBalanceViewV137(assignments);
    }
    // one more cleanup pass for hidden holiday metadata that escaped from older renderers
    page.querySelectorAll('.badge, em, td, th, span').forEach(el => { if (el.childElementCount === 0 && el.textContent.includes(MARKER)) el.textContent = cleanHolidayTitle(el.textContent); });
  }

  document.addEventListener('click', async function(e) {
    const t = e.target.closest && e.target.closest('[data-save-duty-eligibility-v137],[data-edit-holiday-v137],[data-delete-holiday-v137],[data-cancel-edit-holiday-v137]');
    if (!t) return;
    if (t.hasAttribute('data-save-duty-eligibility-v137')) { e.preventDefault(); e.stopImmediatePropagation(); await saveDutyEligibilityV137(); return; }
    if (t.dataset.editHolidayV137) { e.preventDefault(); e.stopImmediatePropagation(); state.editHolidayRuleDate = t.dataset.editHolidayV137; renderPage(); return; }
    if (t.dataset.deleteHolidayV137) { e.preventDefault(); e.stopImmediatePropagation(); await deleteHolidayV137(t.dataset.deleteHolidayV137); return; }
    if (t.hasAttribute('data-cancel-edit-holiday-v137')) { e.preventDefault(); e.stopImmediatePropagation(); state.editHolidayRuleDate = ''; renderPage(); return; }
  }, true);
  document.addEventListener('change', function(e) {
    if (e.target.id === 'dutyEligibilityStaffSelectV137') { e.preventDefault(); e.stopImmediatePropagation(); state.dutyEligibilityStaffId = e.target.value; renderPage(); }
    if (e.target.id === 'holidayRuleMonthInputV137') { e.preventDefault(); e.stopImmediatePropagation(); state.holidayRuleMonthKey = e.target.value; state.editHolidayRuleDate = ''; renderPage(); }
  }, true);
  document.addEventListener('submit', async function(e) {
    if (e.target.id === 'holidayRulesFormV137') { e.preventDefault(); e.stopImmediatePropagation(); await saveHolidayRulesV137(e.target); }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .duty-eligibility-page-v137{grid-template-columns:280px 1fr}.holiday-rules-page-v137 .check-pill{min-width:130px}.v137-duty-table th,.v137-duty-table td{white-space:nowrap;text-align:center;padding:6px 8px}.v137-duty-table th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:2}.v137-balance-table th,.v137-balance-table td{white-space:nowrap}.v137-balance-status{display:inline-block;border-radius:999px;padding:4px 9px;font-weight:700}.v137-balance-status.ok{background:#dcfce7;color:#166534}.v137-balance-status.warn{background:#fef3c7;color:#92400e}.v137-balance-status.over{background:#fee2e2;color:#991b1b}.v137-balance-status.exempt,.v137-balance-status.reset{background:#e0f2fe;color:#075985}.v136-schedule-page .floating-card,.v136-schedule-page .summary-cards,.v136-schedule-page .staff-summary-cards,.v136-schedule-page .roster-summary-cards{position:static!important;top:auto!important;z-index:auto!important}.v136-schedule-page:not(.v137-person-active) .v136-person-list,.v136-schedule-page:not(.v137-person-active) .v136-person-card,.v136-schedule-page:not(.v137-person-active) .schedule-person-card{position:static!important}.v136-schedule-page:not(.v137-person-active) > .v136-person-list{display:none!important}
    @media(max-width:820px){.duty-eligibility-page-v137,.holiday-rules-page-v137{grid-template-columns:1fr!important}.v137-duty-table{font-size:12px}}
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', () => { ensureMenu(); setTimeout(postRenderFixes, 200); setTimeout(postRenderFixes, 800); });
})();

} catch (error) { console.error("[v569] patch-v137-critical-regression-restore.js", error); }
;

/* Original source: patch-v138-password-complete-redirect.js */
try {
/* v138 Password Update Completion Fix
   Scope: only fixes recovery/invite submit completion. Does not touch duty calculation or roster layout logic.
*/
(function () {
  'use strict';

  const FORCE_KEYS = [
    'cnmi.forcePasswordSetup.v134',
    'cnmi.forcePasswordSetup.v135',
    'cnmi.forcePasswordSetup.v136',
    'cnmi.forcePasswordSetup.v138'
  ];

  function $(id) { return document.getElementById(id); }
  function val(id) { return String($(id)?.value || '').trim(); }
  function authClient() { return window.sb || (typeof sb !== 'undefined' ? sb : null); }

  function appBaseUrl() {
    try {
      const parts = location.pathname.split('/').filter(Boolean);
      if (location.hostname.endsWith('github.io') && parts[0]) return location.origin + '/' + parts[0] + '/';
      if (location.pathname.includes('/cnmi-saff-planner/')) return location.origin + '/cnmi-saff-planner/';
    } catch (_) {}
    return location.origin + '/';
  }

  function clearRecoveryFlags() {
    try { window.CNMI_REQUIRE_PASSWORD_UPDATE = false; } catch (_) {}
    try { window.CNMI_AUTH_LINK_INTENT = false; } catch (_) {}
    try { window.RECOVERY_INTENT = false; } catch (_) {}
    try { window.AUTH_LINK_PROCESSING = false; } catch (_) {}
    for (const key of FORCE_KEYS) {
      try { sessionStorage.removeItem(key); } catch (_) {}
      try { localStorage.removeItem(key); } catch (_) {}
    }
    try { document.documentElement.classList.remove('v136-auth-link'); } catch (_) {}
  }

  function cleanAuthUrl() {
    try { window.history.replaceState(null, '', appBaseUrl()); } catch (_) {
      try { window.history.replaceState(null, '', window.location.pathname); } catch (__) {}
    }
  }

  async function waitForSession(client, maxMs = 4500) {
    const waits = [0, 120, 250, 500, 800, 1200, 1700, 2400, 3200, 4200];
    let last = null;
    for (const ms of waits) {
      if (ms) await new Promise(r => setTimeout(r, ms));
      try {
        const res = await client.auth.getSession();
        last = res?.data || null;
        if (last?.session?.user) return last;
      } catch (_) {}
      if (ms >= maxMs) break;
    }
    return last || { session: null };
  }

  async function setLoginNameIfPossible(client, email, loginName) {
    if (!email || !loginName) return;
    const payload = { p_email: email, p_login_name: loginName };
    const rpcNames = ['set_initial_login_name_v56', 'set_initial_login_name_v44'];
    let lastError = null;
    for (const fn of rpcNames) {
      try {
        const r = await client.rpc(fn, payload);
        if (!r?.error) return;
        lastError = r.error;
      } catch (err) { lastError = err; }
    }
    if (lastError) throw lastError;
  }

  async function linkProfileIfPossible(client) {
    try { await client.rpc('link_my_staff_profile_v132'); } catch (err) { console.warn('v138 link profile skipped', err); }
  }

  function forceHidePasswordForm() {
    try { $('resetPasswordForm')?.classList.add('hidden'); } catch (_) {}
    try { $('resetPasswordForm')?.classList.remove('active', 'v136-password-panel'); } catch (_) {}
    try { document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active')); } catch (_) {}
    try { $('authView')?.classList.add('hidden'); } catch (_) {}
    try { $('appView')?.classList.remove('hidden'); } catch (_) {}
  }

  async function enterDashboard(client, sessionData) {
    clearRecoveryFlags();
    cleanAuthUrl();
    try {
      const latest = await client.auth.getSession();
      if (typeof state !== 'undefined') state.session = latest?.data?.session || sessionData?.session || null;
    } catch (_) {
      try { if (typeof state !== 'undefined') state.session = sessionData?.session || null; } catch (__) {}
    }

    forceHidePasswordForm();

    // Prefer the app's normal enterApp so data, permissions and routing are loaded exactly as usual.
    try {
      if (typeof window.enterApp === 'function') {
        await window.enterApp();
      } else if (typeof enterApp === 'function') {
        await enterApp();
      }
    } catch (err) {
      console.warn('v138 enterApp fallback', err);
    }

    // Fallback if enterApp was not available or was interrupted by older guards.
    try {
      clearRecoveryFlags();
      forceHidePasswordForm();
      if (typeof state !== 'undefined') {
        state.page = state.page && state.page !== 'login' ? state.page : 'roster';
      }
      if (typeof loadAllData === 'function' && !window.__CNMI_V138_LOADED_ONCE__) {
        window.__CNMI_V138_LOADED_ONCE__ = true;
        await loadAllData();
      }
      if (typeof renderPage === 'function') renderPage();
    } catch (err) {
      console.warn('v138 render fallback', err);
    }
  }

  async function handlePasswordSubmit(e) {
    if (!(e.target && e.target.id === 'resetPasswordForm')) return;

    // Run before older document-level recovery submit guards. This prevents the success alert from leaving
    // the user stuck on the password setup form.
    e.preventDefault();
    e.stopImmediatePropagation();

    const loginName = val('recoveryLoginName');
    const password = String($('newPassword')?.value || '');
    if (!loginName) return typeof showToast === 'function' && showToast('กรุณาตั้งชื่อผู้ใช้', { tone:'error' });
    if (!/^[a-zA-Z0-9._-]+$/.test(loginName)) return typeof showToast === 'function' && showToast('ชื่อผู้ใช้ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง', { tone:'error' });
    if (!password || password.length < 6) return typeof showToast === 'function' && showToast('กรุณากรอกรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร', { tone:'error' });

    const client = authClient();
    if (!client?.auth) return typeof showToast === 'function' && showToast('ระบบ Auth ยังไม่พร้อม กรุณารีเฟรชแล้วลองใหม่', { tone:'error' });

    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกชื่อผู้ใช้และรหัสผ่าน'); } catch (_) {}

    try {
      const sessionData = await waitForSession(client);
      const user = sessionData?.session?.user;
      const email = user?.email || '';
      if (!user || !email) throw new Error('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');

      await setLoginNameIfPossible(client, email, loginName);

      const upd = await client.auth.updateUser({ password });
      if (upd?.error) throw upd.error;

      await linkProfileIfPossible(client);

      // This is the missing part from the regression: clear state + hash, then enter the app immediately.
      await enterDashboard(client, sessionData);

      if (typeof showToast === 'function') showToast('บันทึกชื่อผู้ใช้และรหัสผ่านแล้ว เข้าสู่ระบบเรียบร้อย');
    } catch (err) {
      try {
        window.CNMI_REQUIRE_PASSWORD_UPDATE = true;
        window.CNMI_AUTH_LINK_INTENT = true;
        sessionStorage.setItem('cnmi.forcePasswordSetup.v138', '1');
      } catch (_) {}
      try { $('authView')?.classList.remove('hidden'); $('appView')?.classList.add('hidden'); $('resetPasswordForm')?.classList.remove('hidden'); $('resetPasswordForm')?.classList.add('active'); } catch (_) {}
      if (typeof showToast === 'function') showToast(err.message || 'บันทึกไม่สำเร็จ', { tone:'error' });
    } finally {
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  }

  // Use window capture so this handler runs before previous document-capture patches that call stopImmediatePropagation.
  window.addEventListener('submit', handlePasswordSubmit, true);
})();

} catch (error) { console.error("[v569] patch-v138-password-complete-redirect.js", error); }
;

/* Original source: patch-v140-long-leave-balance-admin.js */
try {
/* v140 Long-term Leave / Balance Reset Admin Patch
   Scope only: add Admin UI controls for long-term leave and balance reset,
   force balance dashboard to exclude long-term leave / target 0 staff,
   and make carry-over helpers return 0 for excluded staff.
   Does not modify roster assignment, OT formulas, or existing duty calculations.
*/
(function () {
  'use strict';

  const VERSION = 'v140';
  const esc = (v) => (typeof escapeHtml === 'function')
    ? escapeHtml(v == null ? '' : String(v))
    : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const LONG_LEAVE_RE = /(คลอด|ลาคลอด|บวช|ลาบวช|ดูใจ|ลาดูใจ|ถือศีล|ลาถือศีล|long.?term|maternity|mat\s*leave)/i;

  // v263: reuse the real Supabase client already created by app.js.
  // The original v140 checked only window.sb, while the app exposes the client as
  // window.supabaseClient / window.sbClient, causing a false “not connected” error.
  function getSupabaseClientV263() {
    try {
      return window.supabaseClient
        || window.sbClient
        || window.sb
        || (typeof sb !== 'undefined' ? sb : null);
    } catch (_) {
      return window.supabaseClient || window.sbClient || window.sb || null;
    }
  }

  function monthKeyNow() {
    if (window.state && state.monthKey) return state.monthKey;
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  function prevMonthKey(key) {
    const [y, m] = String(key || monthKeyNow()).split('-').map(Number);
    const d = new Date(y || new Date().getFullYear(), (m || 1) - 2, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  function rosterStaffV140() {
    const arr = (window.state && Array.isArray(state.staff)) ? state.staff : [];
    const filtered = arr.filter(s => s && s.is_active !== false && s.staff_type !== 'แพทย์' && s.roster_enabled !== false);
    try { return typeof orderedStaff === 'function' ? orderedStaff(filtered) : filtered; }
    catch (_) { return filtered; }
  }
  function monthRange(key) {
    const [y, m] = String(key || monthKeyNow()).split('-').map(Number);
    return { y, m, last: new Date(y, m, 0).getDate() };
  }
  function dateInRange(date, start, end) {
    if (!date || !start) return false;
    const e = end || start;
    return String(start) <= date && date <= String(e);
  }
  function activeLeave(l) {
    const st = String(l.status || l.approval_status || '').toLowerCase();
    return !/reject|cancel|ยกเลิก|ไม่อนุมัติ/.test(st);
  }
  function leaveTypeText(l) {
    return String(l.type || l.leave_type || l.reason || l.note || '').trim();
  }
  function hasLongLeaveInMonth(staff, key) {
    if (!window.state || !Array.isArray(state.leaves)) return false;
    const { y, m, last } = monthRange(key);
    const start = `${y}-${pad2(m)}-01`;
    const end = `${y}-${pad2(m)}-${pad2(last)}`;
    return state.leaves.some(l => {
      if (!activeLeave(l)) return false;
      if (String(l.staff_id) !== String(staff.id)) return false;
      if (!LONG_LEAVE_RE.test(leaveTypeText(l))) return false;
      const ls = String(l.start_date || l.work_date || '');
      const le = String(l.end_date || l.start_date || l.work_date || '');
      return ls <= end && le >= start;
    });
  }
  function isLongLeaveStaff(staff, key) {
    if (!staff) return false;
    if (staff.is_long_term_leave === true || staff.isLongTermLeave === true) return true;
    if (String(staff.is_long_term_leave).toLowerCase() === 'true') return true;
    if (String(staff.isLongTermLeave).toLowerCase() === 'true') return true;
    if (LONG_LEAVE_RE.test(String(staff.position_training_status || staff.maternity_status || staff.note || staff.remark || ''))) return true;
    return hasLongLeaveInMonth(staff, key || monthKeyNow());
  }
  function targetFor(staff, stats, avgQuota) {
    const raw = staff.targetShifts ?? staff.target_shifts ?? staff.monthly_target_shifts ?? staff.quota_shifts;
    const n = num(raw, NaN);
    if (Number.isFinite(n)) return n;
    return num(avgQuota, 0);
  }
  function isTargetZero(staff, stats, avgQuota) {
    const raw = staff.targetShifts ?? staff.target_shifts ?? staff.monthly_target_shifts ?? staff.quota_shifts;
    return raw !== undefined && raw !== null && raw !== '' && num(raw, 0) === 0;
  }
  function assignmentList(key) {
    try {
      if (typeof getAssignmentsForMonth === 'function') return getAssignmentsForMonth(key || monthKeyNow()).filter(a => a && a.staff_id);
    } catch (_) {}
    return ((window.state && state.rosterAssignments) || []).filter(a => String(a.duty_date || '').startsWith(key || monthKeyNow()) && a.staff_id);
  }
  function isWeekend(date) {
    const d = new Date(`${date}T12:00:00`);
    const day = d.getDay();
    return day === 0 || day === 6;
  }
  function isHoliday(date) {
    try { if (typeof isHolidayDate === 'function' && isHolidayDate(date)) return true; } catch (_) {}
    try { if (typeof getHolidayName === 'function' && getHolidayName(date)) return true; } catch (_) {}
    return false;
  }
  function leaveLabelsFor(staff, date) {
    const out = [];
    ((window.state && state.leaves) || []).filter(activeLeave).forEach(l => {
      if (String(l.staff_id) !== String(staff.id)) return;
      const start = String(l.start_date || l.work_date || '');
      const end = String(l.end_date || l.start_date || l.work_date || '');
      if (!dateInRange(date, start, end)) return;
      const t = leaveTypeText(l);
      if (/ไม่รับเวร/.test(t)) out.push('ไม่รับเวร');
      else if (/คลอด/.test(t)) out.push('ลาคลอด');
      else if (/บวช/.test(t)) out.push('ลาบวช');
      else if (/ดูใจ/.test(t)) out.push('ลาดูใจ');
      else if (/ถือศีล/.test(t)) out.push('ลาถือศีล');
      else if (/กิจ/.test(t)) out.push('ลากิจ');
      else if (/ป่วย/.test(t)) out.push('ลาป่วย');
      else if (/พักผ่อน|พักร้อน/.test(t)) out.push('ลาพักผ่อน');
      else if (t) out.push(t);
    });
    return [...new Set(out)];
  }
  function daysOffFor(staff, key, assignments) {
    if (isLongLeaveStaff(staff, key)) return 0;
    const { y, m, last } = monthRange(key);
    let count = 0;
    for (let day = 1; day <= last; day++) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (!(isWeekend(date) || isHoliday(date))) continue;
      const hasDuty = (assignments || []).some(a => String(a.staff_id) === String(staff.id) && String(a.duty_date) === date);
      const labels = leaveLabelsFor(staff, date);
      if (!hasDuty || labels.includes('ไม่รับเวร')) count++;
    }
    return count;
  }
  function computeStats(assignments) {
    try {
      if (typeof calcFairness === 'function') return calcFairness((assignments || []).filter(a => a.staff_id)) || {};
    } catch (_) {}
    const stats = {};
    (assignments || []).forEach(a => {
      if (!a.staff_id) return;
      stats[a.staff_id] = stats[a.staff_id] || { units: 0, total: 0 };
      stats[a.staff_id].units += 1;
      stats[a.staff_id].total += 1;
    });
    return stats;
  }
  function carryFor(staff, exempt, previousExempt) {
    if (exempt || previousExempt) return 0;
    return num(staff.carry_over_balance ?? staff.overtime_balance ?? staff.overtimeBalance ?? staff.ot_balance, 0);
  }
  window.getCarryOverBalanceV140 = function getCarryOverBalanceV140(staff, key) {
    const prevExempt = isLongLeaveStaff(staff, prevMonthKey(key || monthKeyNow()));
    const exempt = isLongLeaveStaff(staff, key || monthKeyNow()) || num(staff.target_shifts ?? staff.targetShifts, NaN) === 0;
    return carryFor(staff, exempt, prevExempt);
  };

  function renderBalanceV140(assignments) {
    const key = monthKeyNow();
    const prevKey = prevMonthKey(key);
    const staff = rosterStaffV140();
    const stats = computeStats(assignments || assignmentList(key));
    const nonExempt = staff.filter(s => !isLongLeaveStaff(s, key) && !isTargetZero(s, stats, 0));
    const quotaValues = nonExempt.map(s => num(stats[s.id]?.units ?? stats[s.id]?.total, 0)).filter(Number.isFinite);
    const avgQuota = quotaValues.length ? quotaValues.reduce((a, b) => a + b, 0) / quotaValues.length : 0;
    const prevAssignments = assignmentList(prevKey);
    const prevOffValues = nonExempt.map(s => daysOffFor(s, prevKey, prevAssignments));
    const avgPrevOff = prevOffValues.length ? prevOffValues.reduce((a, b) => a + b, 0) / prevOffValues.length : 0;

    const rows = staff.map(s => {
      const r = stats[s.id] || {};
      const longExempt = isLongLeaveStaff(s, key);
      const zeroTarget = isTargetZero(s, r, avgQuota);
      const exempt = longExempt || zeroTarget;
      const prevExempt = isLongLeaveStaff(s, prevKey);
      const current = exempt ? 0 : num(r.units ?? r.total, 0);
      const target = exempt ? 0 : targetFor(s, r, avgQuota);
      const gap = exempt ? 0 : target - current;
      const carry = carryFor(s, exempt, prevExempt);
      const daysOff = exempt ? 0 : daysOffFor(s, key, assignments || assignmentList(key));
      const prevDaysOff = exempt ? 0 : daysOffFor(s, prevKey, prevAssignments);
      const nextOff = exempt ? 0 : avgPrevOff - prevDaysOff;
      const status = longExempt ? 'ยกเว้น/ลาระยะยาว'
        : zeroTarget ? 'ไม่มีเป้าหมายเวร'
        : prevExempt ? 'รีเซ็ตยอดสะสมแล้ว'
        : Math.abs(gap) < 0.5 ? 'สมดุล'
        : gap > 0 ? 'ขาดเวร' : 'งานหนักเกิน';
      const cls = longExempt || zeroTarget ? 'exempt' : prevExempt ? 'reset' : Math.abs(gap) < 0.5 ? 'ok' : gap > 0 ? 'warn' : 'over';
      const name = typeof staffPill === 'function' ? staffPill(s) : esc(s.nickname || s.full_name || '-');
      return `<tr class="${exempt ? 'v140-exempt-row' : ''}">
        <td>${name}</td>
        <td>${target.toFixed(1)}</td>
        <td>${current.toFixed(1)}</td>
        <td>${gap.toFixed(1)}</td>
        <td>${carry.toFixed(1)} ชม.</td>
        <td>${daysOff}</td>
        <td>${nextOff.toFixed(1)}</td>
        <td><span class="v140-balance-status ${cls}">${esc(status)}</span></td>
      </tr>`;
    }).join('');

    return `<div class="v140-balance-dashboard">
      <div class="notice soft-notice"><b>v140 Leave & Reset Logic:</b> คนที่เปิดสถานะลาระยะยาว หรือ targetShifts = 0 จะถูกบังคับ Gap/Balance เป็น 0 และไม่ถูกยกหนี้เวรไปเดือนถัดไป</div>
      <div class="table-wrap"><table class="v140-balance-table"><thead><tr>
        <th>เจ้าหน้าที่</th><th>เป้าหมายเวร</th><th>เวรที่จัดแล้ว</th><th>Quota Gap</th><th>OT Balance/ยกยอด</th><th>จำนวนวันหยุด</th><th>ทบวันหยุดครั้งหน้า</th><th>Status</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }

  function activeScheduleView() {
    const v = (window.state && (state.scheduleView || state.scheduleMobileView)) || 'table';
    return v === 'ot' ? 'balance' : v;
  }
  function replaceBalanceDashboard() {
    if (!window.state || state.page !== 'schedule' || activeScheduleView() !== 'balance') return;
    const page = document.getElementById('pageContent');
    if (!page || page.querySelector('.v140-balance-dashboard')) return;
    const target = page.querySelector('.v137-balance-dashboard, .v136-balance-dashboard, .v125-balance-dashboard, .balance-dashboard');
    const assignments = assignmentList(monthKeyNow());
    if (target) target.outerHTML = renderBalanceV140(assignments);
  }

  function injectAdminLeaveControls() {
    if (!window.state || state.page !== 'users') return;
    document.querySelectorAll('[data-staff-row]').forEach(card => {
      if (card.querySelector('[data-v140-long-leave-wrap]')) return;
      const staffId = card.getAttribute('data-staff-row');
      const staff = (state.staff || []).find(s => String(s.id) === String(staffId)) || {};
      const checked = isLongLeaveStaff(staff, monthKeyNow());
      const form = card.querySelector('.admin-user-form') || card;
      const wrap = document.createElement('div');
      wrap.className = 'v140-admin-leave-controls';
      wrap.setAttribute('data-v140-long-leave-wrap', staffId);
      wrap.innerHTML = `
        <label class="v140-toggle-row" title="เปิดเมื่อลาคลอด/ลาบวช/ลาดูใจ/ลาถือศีล หรือพักงานระยะยาว">
          <input type="checkbox" data-v140-long-leave-toggle="${esc(staffId)}" ${checked ? 'checked' : ''}>
          <span>สถานะลาระยะยาว</span>
        </label>
        <button type="button" class="tiny-btn warning" data-v140-reset-balance="${esc(staffId)}">รีเซ็ตยอดสะสมเป็น 0</button>
        <small class="muted">ใช้กับลาคลอด/กลับมาทำงาน/พนักงานใหม่ เพื่อไม่ให้หนี้เวรเก่าทบต่อ</small>`;
      form.appendChild(wrap);
    });
  }

  async function updateLongLeave(staffId, value) {
    if (!window.sb) return showToast('ยังไม่ได้เชื่อม Supabase', { tone: 'error' });
    setBusy && setBusy(true, 'กำลังบันทึกสถานะลาระยะยาว');
    try {
      const { error } = await sb.from('staff_profiles').update({ is_long_term_leave: !!value }).eq('id', staffId);
      if (error) throw error;
      const st = (state.staff || []).find(s => String(s.id) === String(staffId));
      if (st) st.is_long_term_leave = !!value;
      showToast(value ? 'เปิดสถานะลาระยะยาวแล้ว' : 'ปิดสถานะลาระยะยาวแล้ว');
      replaceBalanceDashboard();
    } catch (err) {
      showToast((err && err.message ? err.message : 'บันทึกไม่สำเร็จ') + ' — ถ้ายังไม่เคยรัน SQL v140 ให้รันก่อน', { tone: 'error' });
    } finally { setBusy && setBusy(false); }
  }

  async function resetBalance(staffId) {
    const client = getSupabaseClientV263();
    if (!client) return showToast('ยังไม่ได้เชื่อม Supabase', { tone: 'error' });
    const st = (state.staff || []).find(s => String(s.id) === String(staffId)) || {};
    const name = st.nickname || st.full_name || 'เจ้าหน้าที่นี้';
    if (!(await confirmDialog(`ยืนยันรีเซ็ตยอดสะสมของ ${name} เป็น 0 ?`, 'ยืนยันรีเซ็ตยอดสะสม'))) return;
    setBusy && setBusy(true, 'กำลังรีเซ็ตยอดสะสม');
    try {
      const resetAt = new Date().toISOString();
      const patch = { carry_over_balance: 0, overtime_balance: 0, ot_balance: 0, balance_reset_at: resetAt };

      // Prefer the SECURITY DEFINER helper so Admin can reset another staff member
      // even when normal table RLS blocks direct updates.
      const rpcResult = await client.rpc('reset_staff_balance_v140', { p_staff_id: staffId });
      if (rpcResult.error) {
        const updateResult = await client.from('staff_profiles').update(patch).eq('id', staffId).select('id').maybeSingle();
        if (updateResult.error) throw updateResult.error;
        if (!updateResult.data) throw rpcResult.error || new Error('ไม่มีสิทธิ์อัปเดตข้อมูลเจ้าหน้าที่รายนี้');
      }

      Object.assign(st, patch);
      showToast('รีเซ็ตยอดสะสมเป็น 0 แล้ว');
      replaceBalanceDashboard();
    } catch (err) {
      showToast((err && err.message ? err.message : 'รีเซ็ตไม่สำเร็จ') + ' — ถ้ายังไม่เคยรัน SQL v140 ให้รันก่อน', { tone: 'error' });
    } finally { setBusy && setBusy(false); }
  }

  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = function renderPageV140() {
    const res = typeof oldRenderPage === 'function' ? oldRenderPage.apply(this, arguments) : undefined;
    setTimeout(() => { injectAdminLeaveControls(); replaceBalanceDashboard(); }, 0);
    setTimeout(() => { injectAdminLeaveControls(); replaceBalanceDashboard(); }, 120);
    return res;
  };
  try { renderPage = window.renderPage; } catch (_) {}

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('[data-v140-long-leave-toggle]')) {
      updateLongLeave(t.getAttribute('data-v140-long-leave-toggle'), t.checked);
    }
  }, true);
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-v140-reset-balance]');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      resetBalance(btn.getAttribute('data-v140-reset-balance'));
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { injectAdminLeaveControls(); replaceBalanceDashboard(); }, 250);
  });

  // Expose for quick console checks by admin/debugging.
  window.renderBalanceV140 = renderBalanceV140;
  window.isLongLeaveStaffV140 = isLongLeaveStaff;
})();

} catch (error) { console.error("[v569] patch-v140-long-leave-balance-admin.js", error); }
;

/* Original source: patch-v141-admin-long-leave-ui-force.js */
try {
/* v141 Admin Long-term Leave UI Force Render
   Purpose: ensure the controls are present in the actual Users/Admin form, not only behind logic.
   Scope: users page UI + reset button fallback only. Does not touch roster/OT calculation logic.
*/
(function(){
  'use strict';
  const esc = (v) => (typeof escapeHtml === 'function') ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // v142: patch scripts cannot read the app.js lexical `let sb`; create/reuse a real Supabase client here.
  function getSupabaseClient(){
    if (window.sb && window.sb.from) return window.sb;
    if (window.__cnmiPatchSupabase && window.__cnmiPatchSupabase.from) return window.__cnmiPatchSupabase;
    const cfg = window.CNMI_CONFIG || {};
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
    window.__cnmiPatchSupabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage,
        flowType: 'implicit'
      }
    });
    return window.__cnmiPatchSupabase;
  }

  function notify(msg, tone){
    if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined);
    else alert(msg);
  }

  function getStaff(staffId){
    return ((window.state && state.staff) || []).find(s => String(s.id) === String(staffId)) || null;
  }

  function ensureControls(){
    if (!window.state || state.page !== 'users') return;
    document.querySelectorAll('[data-staff-row]').forEach(card => {
      const staffId = card.getAttribute('data-staff-row');
      const st = getStaff(staffId) || {};
      const form = card.querySelector('.admin-user-form') || card;

      if (!form.querySelector('[data-field="is_long_term_leave"]')) {
        const rosterLabel = form.querySelector('[data-field="roster_enabled"]')?.closest('label');
        const label = document.createElement('label');
        label.className = 'long-leave-field v141-long-leave-field';
        label.innerHTML = `สถานะลาระยะยาว
          <select data-field="is_long_term_leave">
            <option value="false" ${st.is_long_term_leave === true ? '' : 'selected'}>ปิด / ใช้งานปกติ</option>
            <option value="true" ${st.is_long_term_leave === true ? 'selected' : ''}>เปิด / ลาระยะยาว</option>
          </select>
          <small class="v141-long-leave-inline-note">ใช้กับลาคลอด/ลาบวช/ลาดูใจ/ลาถือศีล หรือพักงานยาว</small>`;
        if (rosterLabel && rosterLabel.parentNode) rosterLabel.insertAdjacentElement('afterend', label);
        else form.appendChild(label);
      }

      if (!card.querySelector('[data-v140-reset-balance], [data-v141-reset-balance]')) {
        const action = document.createElement('div');
        action.className = 'long-leave-admin-actions v141-long-leave-actions';
        action.innerHTML = `
          <button type="button" class="soft-btn warning" data-v141-reset-balance="${esc(staffId)}">รีเซ็ตยอดสะสมเป็น 0</button>
          <span class="hint">ใช้ตอนกลับจากลาคลอด/ลาระยะยาว หรือรับพนักงานใหม่ เพื่อเริ่มยอดชดเชยใหม่ที่ 0</span>`;
        card.appendChild(action);
      }
    });
  }

  async function updateLongLeave(staffId, value){
    const client = getSupabaseClient();
    if (!client) return notify('ยังเชื่อม Supabase ไม่ได้: ตรวจ config.js / SUPABASE_URL / SUPABASE_ANON_KEY', 'error');
    try {
      if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกสถานะลาระยะยาว');
      const { error } = await client.from('staff_profiles').update({ is_long_term_leave: !!value }).eq('id', staffId);
      if (error) throw error;
      const st = getStaff(staffId);
      if (st) st.is_long_term_leave = !!value;
      if (typeof showToast === 'function') showToast(value ? 'เปิดสถานะลาระยะยาวแล้ว' : 'ปิดสถานะลาระยะยาวแล้ว');
    } catch(err) {
      if (typeof showToast === 'function') showToast((err && err.message) || 'บันทึกสถานะลาระยะยาวไม่สำเร็จ');
    } finally {
      if (typeof setBusy === 'function') setBusy(false);
    }
  }

  async function resetBalance(staffId){
    const client = getSupabaseClient();
    if (!client) return notify('ยังเชื่อม Supabase ไม่ได้: ตรวจ config.js / SUPABASE_URL / SUPABASE_ANON_KEY', 'error');

    const st = getStaff(staffId) || {};
    const name = st.nickname || st.full_name || 'เจ้าหน้าที่นี้';
    if (!(await confirmDialog(`ยืนยันรีเซ็ตยอดสะสมของ ${name} เป็น 0 ?`, 'ยืนยันรีเซ็ตยอดสะสม'))) return;

    try {
      if (typeof setBusy === 'function') setBusy(true, 'กำลังรีเซ็ตยอดสะสม');

      const resetAt = new Date().toISOString();
      let error = null;

      // Preferred path: use v140 SECURITY DEFINER helper created by supabase_staff_balance_v140.sql.
      // This avoids normal RLS update blocks when an admin resets another staff member's balance.
      const rpcRes = await client.rpc('reset_staff_balance_v140', { p_staff_id: staffId });
      if (rpcRes.error) {
        // Fallback path for projects that have columns but not the RPC.
        const patch = {
          carry_over_balance: 0,
          overtime_balance: 0,
          ot_balance: 0,
          balance_reset_at: resetAt
        };
        const updRes = await client.from('staff_profiles').update(patch).eq('id', staffId);
        error = updRes.error || null;
      }
      if (error) throw error;

      Object.assign(st, {
        carry_over_balance: 0,
        overtime_balance: 0,
        ot_balance: 0,
        balance_reset_at: resetAt
      });

      notify('รีเซ็ตยอดสะสมเป็น 0 สำเร็จเรียบร้อย', 'success');

      // Refresh current screen state.
      if (typeof loadAllData === 'function') await loadAllData();
      if (typeof renderPage === 'function') renderPage();
      setTimeout(ensureControls, 150);
    } catch(err) {
      console.error('[v142 reset balance] failed', err);
      notify((err && err.message) || 'รีเซ็ตยอดสะสมไม่สำเร็จ', 'error');
    } finally {
      if (typeof setBusy === 'function') setBusy(false);
    }
  }

  const oldRender = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRender && !window.__v141WrappedRenderPage) {
    window.__v141WrappedRenderPage = true;
    window.renderPage = function renderPageV141(){
      const out = oldRender.apply(this, arguments);
      setTimeout(ensureControls, 0);
      setTimeout(ensureControls, 150);
      return out;
    };
    try { renderPage = window.renderPage; } catch(_) {}
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('[data-field="is_long_term_leave"]')) {
      const card = t.closest('[data-staff-row]');
      if (card) updateLongLeave(card.getAttribute('data-staff-row'), t.value === 'true');
    }
  }, true);

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-v141-reset-balance]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    resetBalance(btn.getAttribute('data-v141-reset-balance'));
  }, true);

  document.addEventListener('DOMContentLoaded', () => setTimeout(ensureControls, 250));
  setInterval(ensureControls, 1200);
})();

} catch (error) { console.error("[v569] patch-v141-admin-long-leave-ui-force.js", error); }
;

/* Original source: patch-v143-neutral-long-leave-label.js */
try {
/* V143 retained as a no-op for cache compatibility. V150 moved clean schedule/balance components into app.js. */
(function(){ 'use strict'; })();

} catch (error) { console.error("[v569] patch-v143-neutral-long-leave-label.js", error); }
;

/* Original source: patch-v196-no-stale-recovery.js */
try {
/* V196: Stale recovery guard for normal app pages.
   Fixes Position Management save redirecting to mode-recovery when old auth flags or
   a token-less ?mode=recovery marker are still present in the browser. */
(function(){
  'use strict';

  var FORCE_KEYS = [
    'cnmi.forcePasswordSetup.v134',
    'cnmi.forcePasswordSetup.v135',
    'cnmi.forcePasswordSetup.v136',
    'cnmi.forcePasswordSetup.v138'
  ];

  function baseUrl(){
    try {
      var parts = location.pathname.split('/').filter(Boolean);
      if (location.hostname.endsWith('github.io') && parts[0]) return location.origin + '/' + parts[0] + '/';
      if (location.pathname.indexOf('/cnmi-saff-planner/') >= 0) return location.origin + '/cnmi-saff-planner/';
    } catch (_) {}
    return location.origin + '/';
  }

  function rawUrl(){ return String(location.search || '') + String(location.hash || ''); }
  function hasRealAuthLink(){ return /access_token=|refresh_token=|token_hash=|(^|[?#&])code=|type=(recovery|password_recovery|invite|signup)/i.test(rawUrl()); }
  function hasStaleRecoveryMarker(){ return /mode=(recovery|set-password|update-password)|type=recovery/i.test(rawUrl()) && !hasRealAuthLink(); }

  function clearFlags(reason){
    if (hasRealAuthLink()) return false;
    try { window.CNMI_REQUIRE_PASSWORD_UPDATE = false; } catch (_) {}
    try { window.CNMI_AUTH_LINK_INTENT = false; } catch (_) {}
    try { window.RECOVERY_INTENT = false; } catch (_) {}
    try { window.AUTH_LINK_PROCESSING = false; } catch (_) {}
    FORCE_KEYS.forEach(function(k){
      try { sessionStorage.removeItem(k); } catch (_) {}
      try { localStorage.removeItem(k); } catch (_) {}
    });
    try { document.documentElement.classList.remove('v136-auth-link'); } catch (_) {}
    if (hasStaleRecoveryMarker()) {
      try { history.replaceState({}, document.title, baseUrl()); } catch (_) {}
    }
    // V269: intentionally silent; this guard must not spam Console on every browser focus.
    return true;
  }

  function positionFormSubmit(e){
    var form = e && e.target;
    if (!form || form.id !== 'positionMasterForm') return;
    clearFlags('position-master-submit');
    try { e.preventDefault(); } catch (_) {}
    // Do not stop propagation here: the app.js V182 submit handler still performs the actual save.
  }

  clearFlags('initial-load');
  window.addEventListener('pageshow', function(){ clearFlags('pageshow'); }, true);
  // V269: do not run recovery cleanup on every window focus. It is unrelated to permission refresh
  // and previously produced repeated `stale recovery flags cleared focus` logs for all staff.
  window.addEventListener('click', function(e){
    if (e && e.target && e.target.closest && e.target.closest('[data-add-position-master], [data-edit-position-master], #positionMasterForm button[type="submit"]')) {
      clearFlags('position-management-click');
    }
  }, true);
  window.addEventListener('submit', positionFormSubmit, true);
})();

} catch (error) { console.error("[v569] patch-v196-no-stale-recovery.js", error); }
;

/* Original source: patch-v197-duty-permission-sync.js */
try {
/* V197: Duty eligibility sync for roster scheduler.
   Fixes stale/static roster rules after saving “สิทธิ์เวรตามวัน”.
   - Scheduler refreshes daily_position_eligibility before generate/auto-assign/open.
   - Empty draft, existing draft, dropdown, drag/drop, auto assign, and save use DUTY_RULE rows.
   - Slot required_role label is recalculated from the latest saved eligibility instead of stale defaults. */
(function(){
  'use strict';
  if (window.__CNMI_V197_DUTY_PERMISSION_SYNC__) return;
  window.__CNMI_V197_DUTY_PERMISSION_SYNC__ = true;

  const MARKER = ':::DUTY_RULES:';
  const DUTY_RULE_PREFIX = 'DUTY_RULE:';
  const CODES = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  const DUTY_COLUMNS_V197 = ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT'];
  const DEFAULT_RULES = {
    weekday: [
      { code:'ชบด1', role:'MT' },
      { code:'ชบด2', role:'MT' },
      { code:'ชบด3', role:'เคิก' },
      { code:'ช4A', role:'MT/แตง' },
      { code:'ช4B', role:'MT/แตง' }
    ],
    saturday: [
      { code:'ชบด1', role:'MT' },
      { code:'ชบด2', role:'MT' },
      { code:'ชบด3', role:'เคิก' },
      { code:'ช9-เคิก', role:'เคิก' },
      { code:'ช3A', role:'MT' },
      { code:'ช3B', role:'MT' },
      { code:'ช9-MT', role:'MT/แตง' }
    ],
    sunday: [
      { code:'ชบด1', role:'MT' },
      { code:'ชบด2', role:'MT' },
      { code:'ชบด3', role:'MT' },
      { code:'ช9-เคิก', role:'เคิก' },
      { code:'ช3A', role:'MT' },
      { code:'ช3B', role:'MT' },
      { code:'ช9-MT', role:'MT/แตง' }
    ],
    holidayMtMtKerk: [
      { code:'ชบด1', role:'MT' },
      { code:'ชบด2', role:'MT' },
      { code:'ชบด3', role:'เคิก' }
    ],
    holidayMtMtMt: [
      { code:'ชบด1', role:'MT' },
      { code:'ชบด2', role:'MT' },
      { code:'ชบด3', role:'MT' }
    ]
  };

  const prev = {
    dutyRuleForDate: window.dutyRuleForDate || (typeof dutyRuleForDate === 'function' ? dutyRuleForDate : null),
    allowedDutyCodesForDate: window.allowedDutyCodesForDate || (typeof allowedDutyCodesForDate === 'function' ? allowedDutyCodesForDate : null),
    generateEmptyAssignments: window.generateEmptyAssignments || (typeof generateEmptyAssignments === 'function' ? generateEmptyAssignments : null),
    getAssignmentsForMonth: window.getAssignmentsForMonth || (typeof getAssignmentsForMonth === 'function' ? getAssignmentsForMonth : null),
    canStaffWorkSlot: window.canStaffWorkSlot || (typeof canStaffWorkSlot === 'function' ? canStaffWorkSlot : null),
    autoAssignRoster: window.autoAssignRoster || (typeof autoAssignRoster === 'function' ? autoAssignRoster : null),
    saveRosterDraft: window.saveRosterDraft || (typeof saveRosterDraft === 'function' ? saveRosterDraft : null),
    supportsRequiredRole: window.supportsRequiredRole || (typeof supportsRequiredRole === 'function' ? supportsRequiredRole : null),
    handleDrop: window.handleDrop || (typeof handleDrop === 'function' ? handleDrop : null),
    renderPage: window.renderPage || (typeof renderPage === 'function' ? renderPage : null)
  };

  const esc = (v) => (typeof escapeHtml === 'function') ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, tone) => { try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else console.info(msg); } catch(_) {} };
  const pad2v = (n) => (typeof pad === 'function' ? pad(n) : String(n).padStart(2, '0'));
  const uidv = () => (typeof uid === 'function' ? uid() : 'tmp_' + Math.random().toString(36).slice(2));
  const parseDv = (date) => (typeof parseDate === 'function' ? parseDate(date) : new Date(String(date) + 'T00:00:00'));
  const normDate = (v) => (typeof normalizeDateKey === 'function' ? normalizeDateKey(v) : String(v || '').slice(0, 10));
  const slotIdOf = (a) => String((typeof getSlotId === 'function' ? getSlotId(a) : (a && (a.id || a._temp_id))) || '');
  const staffById = (id) => (state.staff || []).find(s => String(s.id) === String(id));
  const staffType = (s) => String(s?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT';
  const isTang = (s) => String(s?.nickname || s?.full_name || '').trim() === 'แตง';
  const isRosterOn = (s) => { try { return typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : s && s.is_active !== false && s.staff_type !== 'แพทย์'; } catch(_) { return !!s; } };
  const isHol = (date) => { try { return typeof isHolidayDate === 'function' ? isHolidayDate(date) : false; } catch(_) { return false; } };

  function cleanTitle(title='') {
    const t = String(title || '');
    const idx = t.indexOf(MARKER);
    return (idx >= 0 ? t.slice(0, idx) : t).trim();
  }

  function decodeHolidayConfig(title='') {
    const t = String(title || '');
    const idx = t.indexOf(MARKER);
    if (idx < 0) return null;
    const raw = t.slice(idx + MARKER.length).split(':::')[0];
    try { return JSON.parse(decodeURIComponent(escape(atob(raw)))); }
    catch(_) { try { return JSON.parse(atob(raw)); } catch(__) { return null; } }
  }

  function holidayCfg(date) {
    const row = (state.holidays || []).find(h => normDate(h?.holiday_date) === normDate(date));
    return decodeHolidayConfig(row?.title || '') || null;
  }

  function dayKey(date) {
    return ['sun','mon','tue','wed','thu','fri','sat'][parseDv(date).getDay()];
  }

  function normalizeEligibilityDuty(code='') {
    const c = String(code || '').trim();
    if (['ช4A','ช4','ช4-MT/แตง','ช4-MT/แตง1','ช4-MT/แตง-1','ช4-1','ช4-MT/แตง 1'].includes(c)) return 'ช4-MT/แตง 1';
    if (['ช4B','ช4-MT/แตง2','ช4-MT/แตง-2','ช4-2','ช4-MT/แตง 2'].includes(c)) return 'ช4-MT/แตง 2';
    if (c === 'ช9-MT' || c === 'ช9' || c === 'ช9-MT/แตง') return 'ช9-MT/แตง';
    return c;
  }

  function rosterCodeFromEligibility(code='') {
    const c = normalizeEligibilityDuty(code);
    if (c === 'ช4-MT/แตง 1') return 'ช4A';
    if (c === 'ช4-MT/แตง 2') return 'ช4B';
    if (c === 'ช9-MT/แตง') return 'ช9-MT';
    return c;
  }

  function eligCode(dateOrDay, dutyCode) {
    const dk = String(dateOrDay || '').length === 3 ? dateOrDay : dayKey(dateOrDay);
    return `${DUTY_RULE_PREFIX}${dk}:${normalizeEligibilityDuty(dutyCode)}`;
  }

  function dutyRowsForStaff(staffId) {
    return (state.positionEligibility || []).filter(r => String(r?.staff_id) === String(staffId) && String(r?.position_code || '').startsWith(DUTY_RULE_PREFIX));
  }

  function explicitDutyRecord(staffId, date, dutyCode) {
    const code = eligCode(date, dutyCode);
    return (state.positionEligibility || []).find(r => String(r?.staff_id) === String(staffId) && String(r?.position_code) === code);
  }

  function explicitRowsForSlot(date, dutyCode) {
    const code = eligCode(date, dutyCode);
    return (state.positionEligibility || []).filter(r => String(r?.position_code) === code);
  }

  function fallbackRoleForRosterCode(code, date) {
    const dow = parseDv(date).getDay();
    if (code === 'ชบด1' || code === 'ชบด2') return 'MT';
    if (code === 'ชบด3') {
      if (isHol(date)) return holidayCfg(date)?.roleMode === 'MT_MT_MT' ? 'MT' : (dow === 0 ? 'MT' : 'เคิก');
      return dow === 0 ? 'MT' : 'เคิก';
    }
    if (code === 'ช9-เคิก') return 'เคิก';
    if (code === 'ช9-MT') return 'MT/แตง';
    if (code === 'ช4A' || code === 'ช4B') return 'MT/แตง';
    if (code === 'ช3A' || code === 'ช3B') return 'MT';
    return 'MT/เคิก';
  }

  function defaultRuleListForDate(date) {
    const d = parseDv(date);
    const dow = d.getDay();
    if (isHol(date)) {
      const cfg = holidayCfg(date);
      const base = (cfg?.roleMode === 'MT_MT_MT') ? DEFAULT_RULES.holidayMtMtMt : DEFAULT_RULES.holidayMtMtKerk;
      if (cfg?.duties) {
        const allowedRosterCodes = [...new Set(CODES
          .filter(c => cfg.duties[c] || (String(c).startsWith('ช4') && cfg.duties['ช4-MT/แตง']))
          .map(rosterCodeFromEligibility))];
        return allowedRosterCodes.map(code => {
          const found = base.find(r => r.code === code);
          return found || { code, role: fallbackRoleForRosterCode(code, date) };
        });
      }
      return base;
    }
    if (dow === 0) return DEFAULT_RULES.sunday;
    if (dow === 6) return DEFAULT_RULES.saturday;
    return DEFAULT_RULES.weekday;
  }

  function roleFromExplicitRows(date, dutyCode, fallbackRole) {
    const rows = explicitRowsForSlot(date, dutyCode);
    if (!rows.length) return fallbackRole;
    const eligibleRows = rows.filter(r => r?.is_eligible === true || String(r?.is_eligible).toLowerCase() === 'true');
    if (!eligibleRows.length) return 'ไม่มีสิทธิ์';

    let hasMt = false;
    let hasKerk = false;
    let hasTangOnlyKerk = false;
    let hasOtherKerk = false;
    eligibleRows.forEach(r => {
      const st = staffById(r.staff_id);
      if (!st || !isRosterOn(st)) return;
      if (staffType(st) === 'เคิก') {
        hasKerk = true;
        if (isTang(st)) hasTangOnlyKerk = true; else hasOtherKerk = true;
      } else {
        hasMt = true;
      }
    });
    if (hasMt && hasOtherKerk) return 'MT/เคิก';
    if (hasMt && hasTangOnlyKerk && !hasOtherKerk) return 'MT/แตง';
    if (hasMt) return 'MT';
    if (hasKerk) return 'เคิก';
    return fallbackRole;
  }

  function effectiveRuleForDate(date) {
    return defaultRuleListForDate(date).map(slot => ({
      code: slot.code,
      role: roleFromExplicitRows(date, slot.code, slot.role)
    }));
  }

  function refreshSlotRole(row) {
    if (!row?.duty_date || !row?.duty_code) return row;
    const slot = effectiveRuleForDate(row.duty_date).find(x => x.code === row.duty_code);
    if (slot) row.required_role = slot.role;
    return row;
  }

  function syncAssignmentsInPlace(rows) {
    (rows || []).forEach(refreshSlotRole);
    return rows || [];
  }

  function nextPermissionRefreshGenerationV269(){
    const next = Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0) + 1;
    window.__CNMI_PERMISSION_REFRESH_GENERATION__ = next;
    return next;
  }

  async function refreshDutyEligibilityFromDb(options={}) {
    if (!sb || !state?.profile) return false;
    const requestGeneration = nextPermissionRefreshGenerationV269();
    try {
      const q = await sb.from('daily_position_eligibility').select('*');
      if (q.error) throw q.error;
      // V269: a query that started before a later force refresh must never overwrite newer state.
      if (requestGeneration !== Number(window.__CNMI_PERMISSION_REFRESH_GENERATION__ || 0)) {
        try { console.info('V269 ignored stale V197 permission refresh', requestGeneration); } catch (_) {}
        return true;
      }
      state.positionEligibility = q.data || [];
      state.__dutyEligibilitySyncedAtV197 = Date.now();
      if (options.clearDraft) state.rosterDraft = null;
      try { console.info('V197 duty eligibility refreshed', state.positionEligibility.filter(r => String(r.position_code || '').startsWith(DUTY_RULE_PREFIX)).length); } catch(_) {}
      return true;
    } catch (err) {
      console.warn('V197 duty eligibility refresh failed', err);
      if (options.toast !== false) toast('โหลดสิทธิ์เวรล่าสุดไม่สำเร็จ ใช้ข้อมูลที่มีในหน้าจอก่อน', 'error');
      return false;
    }
  }

  window.refreshDutyEligibilityFromDbV197 = refreshDutyEligibilityFromDb;
  window.dutyRuleForDate = dutyRuleForDate = function dutyRuleForDateV197(date) {
    return effectiveRuleForDate(normDate(date));
  };
  window.allowedDutyCodesForDate = allowedDutyCodesForDate = function allowedDutyCodesForDateV197(date) {
    return effectiveRuleForDate(normDate(date)).map(x => x.code);
  };
  window.generateEmptyAssignments = generateEmptyAssignments = function generateEmptyAssignmentsV197(key) {
    const range = (typeof getMonthRange === 'function') ? getMonthRange(key) : { y:Number(String(key).slice(0,4)), m:Number(String(key).slice(5,7)) };
    const last = new Date(range.y, range.m, 0).getDate();
    const rows = [];
    for (let day=1; day<=last; day++) {
      const date = `${range.y}-${pad2v(range.m)}-${pad2v(day)}`;
      effectiveRuleForDate(date).forEach(slot => rows.push({ _temp_id: uidv(), duty_date:date, duty_code:slot.code, required_role:slot.role, staff_id:null, is_locked:false }));
    }
    return rows;
  };

  if (prev.getAssignmentsForMonth) {
    window.getAssignmentsForMonth = getAssignmentsForMonth = function getAssignmentsForMonthV197(key) {
      const rows = prev.getAssignmentsForMonth.call(this, key) || [];
      return syncAssignmentsInPlace(rows);
    };
  }

  window.supportsRequiredRole = supportsRequiredRole = function supportsRequiredRoleV197(staff, required) {
    const r = String(required || '').trim();
    if (!staff) return false;
    if (!r || r === '-' || r === 'ใครก็ได้' || r === 'MT/เคิก') return staffType(staff) === 'MT' || staffType(staff) === 'เคิก';
    if (r === 'ไม่มีสิทธิ์') return false;
    if (r === 'MT/แตง' || r === 'MT_OR_TANG') return staffType(staff) === 'MT' || isTang(staff);
    if (r === 'MT') return staffType(staff) === 'MT';
    if (r === 'เคิก') return staffType(staff) === 'เคิก';
    if (/MT/.test(r) && /เคิก/.test(r)) return staffType(staff) === 'MT' || staffType(staff) === 'เคิก';
    if (/MT/.test(r) && /แตง/.test(r)) return staffType(staff) === 'MT' || isTang(staff);
    return prev.supportsRequiredRole ? prev.supportsRequiredRole(staff, required) : true;
  };

  function dutyEligibilityAllowsStaff(staffId, slot) {
    const staff = staffById(staffId);
    if (!staff || !slot) return false;
    const explicit = explicitDutyRecord(staffId, slot.duty_date, slot.duty_code);
    if (explicit) return explicit.is_eligible === true || String(explicit.is_eligible).toLowerCase() === 'true';
    const sameDayRows = dutyRowsForStaff(staffId).filter(r => String(r.position_code || '').startsWith(`${DUTY_RULE_PREFIX}${dayKey(slot.duty_date)}:`));
    if (sameDayRows.length) return false;
    return supportsRequiredRole(staff, slot.required_role || roleFromExplicitRows(slot.duty_date, slot.duty_code, ''));
  }

  window.canStaffWorkSlot = canStaffWorkSlot = function canStaffWorkSlotV197(staffId, slot, assignments) {
    const s = staffById(staffId);
    if (!isRosterOn(s)) return false;
    refreshSlotRole(slot);
    if (!dutyEligibilityAllowsStaff(staffId, slot)) return false;
    try { if (typeof activeLeaveRecordOn === 'function' && activeLeaveRecordOn(staffId, slot.duty_date)) return false; } catch(_) {}
    const list = assignments || (typeof getAssignmentsForMonth === 'function' ? getAssignmentsForMonth(state.monthKey) : []);
    try { if (typeof hasSameDayDuty === 'function' && hasSameDayDuty(staffId, slot.duty_date, list, slot)) return false; } catch(_) {}
    try { if (typeof isConsecutiveRestrictedDuty === 'function' && isConsecutiveRestrictedDuty(slot?.duty_code) && typeof hasAdjacentDuty === 'function' && hasAdjacentDuty(staffId, slot.duty_date, list, slot)) return false; } catch(_) {}
    return true;
  };

  window.autoAssignRoster = autoAssignRoster = function autoAssignRosterV197() {
    if (!state.rosterDraft || state.rosterDraft.monthKey !== state.monthKey) state.rosterDraft = { monthKey: state.monthKey, assignments: generateEmptyAssignments(state.monthKey) };
    const assignments = syncAssignmentsInPlace(state.rosterDraft.assignments || []);
    const counts = (typeof calcFairness === 'function') ? calcFairness(assignments.filter(x => x.staff_id)) : {};
    let blockedByConsecutive = 0;
    let unfilled = 0;
    assignments.forEach(slot => {
      if (slot.is_locked || slot.staff_id) return;
      const wk = (typeof weekKeyOf === 'function') ? weekKeyOf(slot.duty_date) : String(slot.duty_date || '').slice(0, 10);
      const baseCandidates = (state.staff || []).filter(s => isRosterOn(s) && dutyEligibilityAllowsStaff(s.id, slot))
        .filter(s => { try { return !(state.leaves || []).some(l => l.staff_id === s.id && typeof overlapsDate === 'function' && overlapsDate(l, slot.duty_date)); } catch(_) { return true; } })
        .filter(s => { try { return !(typeof hasSameDayDuty === 'function' && hasSameDayDuty(s.id, slot.duty_date, assignments, slot)); } catch(_) { return true; } });
      const candidates = baseCandidates.filter(s => { try { return !(typeof hasAdjacentDuty === 'function' && hasAdjacentDuty(s.id, slot.duty_date, assignments, slot)); } catch(_) { return true; } });
      if (!candidates.length && baseCandidates.length) blockedByConsecutive++;
      candidates.sort((a,b) => {
        const ca = counts[a.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const cb = counts[b.id] || { total:0, weekend:0, hours:0, pay:0, weekCounts:{} };
        const order = (typeof compareStaffOrder === 'function') ? compareStaffOrder(a,b) : String(a.nickname || '').localeCompare(String(b.nickname || ''), 'th');
        return ((ca.pay || 0) - (cb.pay || 0)) || ((ca.hours || 0) - (cb.hours || 0)) || (((ca.weekCounts || {})[wk] || 0) - (((cb.weekCounts || {})[wk] || 0))) || ((ca.weekend || 0) - (cb.weekend || 0)) || ((ca.total || 0) - (cb.total || 0)) || order;
      });
      if (candidates[0]) {
        slot.staff_id = candidates[0].id;
        const c = counts[candidates[0].id] = counts[candidates[0].id] || { total:0, mon:0, fri:0, weekend:0, weekday:0, hours:0, pay:0, units:0, weekCounts:{} };
        c.total++;
        try {
          const dm = typeof dutyMetrics === 'function' ? dutyMetrics(slot, candidates[0].id) : { hours:0, units:1, pay:0 };
          c.hours = (c.hours || 0) + (dm.hours || 0);
          c.units = (c.units || 0) + (dm.units || 0);
          c.pay = (c.pay || 0) + (dm.pay || 0);
        } catch(_) {}
        c.weekCounts[wk] = (c.weekCounts[wk] || 0) + 1;
        try { if ((typeof isWeekend === 'function' && isWeekend(slot.duty_date)) || isHol(slot.duty_date)) c.weekend++; else c.weekday++; } catch(_) {}
      } else {
        unfilled++;
      }
    });
    state.rosterDraft = { monthKey: state.monthKey, assignments };
    if (unfilled) toast(`Auto Assign แล้ว แต่เหลือ ${unfilled} ช่องที่ยังจัดไม่ได้ เพราะติดเงื่อนไขลา/สิทธิ์เวรตามวัน/ห้าม ชบด ติดกัน`);
    else toast('Auto Assign แล้ว โดยใช้สิทธิ์เวรตามวันที่บันทึกล่าสุด');
  };

  if (prev.saveRosterDraft) {
    window.saveRosterDraft = saveRosterDraft = async function saveRosterDraftV197(status='draft') {
      if (state.rosterDraft?.assignments) syncAssignmentsInPlace(state.rosterDraft.assignments);
      return prev.saveRosterDraft.call(this, status);
    };
  }

  function cloneAssignments(rows) {
    try { return structuredClone(rows || []); } catch(_) { return JSON.parse(JSON.stringify(rows || [])); }
  }

  function swapRosterSlotsV197(sourceId, targetId, targetEl) {
    if (!sourceId || !targetId || String(sourceId) === String(targetId)) return;
    const assignments = cloneAssignments(state.rosterDraft?.monthKey === state.monthKey ? state.rosterDraft.assignments : (getAssignmentsForMonth(state.monthKey) || []));
    syncAssignmentsInPlace(assignments);
    const src = assignments.find(x => slotIdOf(x) === String(sourceId));
    const dst = assignments.find(x => slotIdOf(x) === String(targetId));
    if (!src || !dst) return;
    if (src.is_locked || dst.is_locked) return toast('ช่องต้นทางหรือปลายทางล็อกอยู่');
    if (normDate(src.duty_date) !== normDate(dst.duty_date)) return toast('สลับเวรได้เฉพาะช่องที่อยู่วันเดียวกัน');
    const sourceStaff = src.staff_id || null;
    const targetStaff = dst.staff_id || null;
    src.staff_id = targetStaff;
    dst.staff_id = sourceStaff;
    if (sourceStaff && !canStaffWorkSlot(sourceStaff, dst, assignments)) return toast('สลับไม่ได้: เจ้าหน้าที่ต้นทางไม่ตรงสิทธิ์เวร/ติดลา/ติดเวรต่อเนื่อง');
    if (targetStaff && !canStaffWorkSlot(targetStaff, src, assignments)) return toast('สลับไม่ได้: เจ้าหน้าที่ปลายทางไม่ตรงสิทธิ์เวร/ติดลา/ติดเวรต่อเนื่อง');
    let snap = null;
    try { snap = typeof captureRosterScroll === 'function' ? captureRosterScroll(targetEl || document.querySelector(`[data-drop-slot="${targetId}"]`)) : null; } catch(_) {}
    state.rosterDraft = { monthKey: state.monthKey, assignments };
    renderPage();
    try { if (snap && typeof restoreRosterScroll === 'function') restoreRosterScroll(snap); } catch(_) {}
    toast(targetStaff ? 'สลับเวรในวันเดียวกันแล้ว กดบันทึกเพื่อบันทึกจริง' : 'ย้ายเวรไปช่องใหม่แล้ว กดบันทึกเพื่อบันทึกจริง');
  }

  window.handleDrop = handleDrop = function handleDropV197(e) {
    const slotEl = e.target.closest && e.target.closest('[data-drop-slot]');
    if (!slotEl) return;
    e.preventDefault();
    try { document.querySelectorAll('.roster-slot.drag-over, .roster-slot.dragging').forEach(el => el.classList.remove('drag-over', 'dragging')); } catch(_) {}
    const slotId = slotEl.dataset.dropSlot;
    const sourceSlotId = e.dataTransfer?.getData('sourceSlotId');
    if (sourceSlotId) { swapRosterSlotsV197(sourceSlotId, slotId, slotEl); return; }
    const staffId = e.dataTransfer?.getData('staffId');
    if (!staffId || !slotId) return;
    const currentAssignments = cloneAssignments(state.rosterDraft?.monthKey === state.monthKey ? state.rosterDraft.assignments : (getAssignmentsForMonth(state.monthKey) || []));
    syncAssignmentsInPlace(currentAssignments);
    const target = currentAssignments.find(x => slotIdOf(x) === String(slotId));
    if (!target) return;
    if (target.is_locked) return toast('ช่องนี้ล็อกอยู่');
    if (allowedDutyCodesForDate(target.duty_date).indexOf(target.duty_code) < 0) return toast('ช่องนี้ปิดใช้งาน จึงไม่รับการลากวาง');
    if (!canStaffWorkSlot(staffId, target, currentAssignments)) {
      try { if (typeof isConsecutiveRestrictedDuty === 'function' && isConsecutiveRestrictedDuty(target?.duty_code) && typeof hasAdjacentDuty === 'function' && hasAdjacentDuty(staffId, target.duty_date, currentAssignments, target)) return toast('คนนี้มีเวร ชบด ติดกับวันก่อน/วันถัดไปแล้ว กรุณาเลือกคนอื่น'); } catch(_) {}
      return toast('คนนี้ติดลา/ไม่รับเวร หรือสิทธิ์เวรตามวันไม่ตรงกับช่องนี้');
    }
    let snap = null;
    try { snap = typeof captureRosterScroll === 'function' ? captureRosterScroll(slotEl) : null; } catch(_) {}
    target.staff_id = staffId;
    state.rosterDraft = { monthKey: state.monthKey, assignments: currentAssignments };
    renderPage();
    try { if (snap && typeof restoreRosterScroll === 'function') restoreRosterScroll(snap); } catch(_) {}
  };

  // Sync before scheduler render, so old saved required_role does not leak into the UI.
  if (prev.renderPage) {
    window.renderPage = renderPage = function renderPageV197() {
      try {
        if (state.page === 'scheduler') {
          if (state.rosterDraft?.monthKey === state.monthKey && Array.isArray(state.rosterDraft.assignments)) syncAssignmentsInPlace(state.rosterDraft.assignments);
          else (getAssignmentsForMonth(state.monthKey) || []).forEach(refreshSlotRole);
        }
      } catch(err) { console.warn('V197 pre-render sync failed', err); }
      const res = prev.renderPage.apply(this, arguments);
      try {
        if (state.page === 'scheduler') {
          const card = document.querySelector('.roster-board .card:nth-child(2) .section-title');
          if (card && !document.querySelector('[data-v197-duty-sync-note]')) {
            const note = document.createElement('div');
            note.setAttribute('data-v197-duty-sync-note', '1');
            note.className = 'notice soft-notice v197-duty-sync-note';
            const n = (state.positionEligibility || []).filter(r => String(r.position_code || '').startsWith(DUTY_RULE_PREFIX)).length;
            note.innerHTML = `ใช้สิทธิ์เวรตามวันล่าสุดจากฐานข้อมูลแล้ว <b>${esc(n)}</b> รายการ`;
            card.parentElement.insertBefore(note, card.nextSibling);
          }
        }
      } catch(_) {}
      return res;
    };
  }

  // V210: Do not block sidebar navigation while waiting for Supabase.
  // Previous behavior awaited daily_position_eligibility before changing page, so a slow/RLS-blocked
  // query made the "จัดตารางเวร" menu look like it did nothing.
  async function refreshDutyEligibilityWithTimeoutV210(options={}, timeoutMs=3500) {
    let timer = null;
    try {
      return await Promise.race([
        refreshDutyEligibilityFromDb(options),
        new Promise(resolve => { timer = window.setTimeout(() => resolve('__timeout__'), timeoutMs); })
      ]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function openSchedulerFresh() {
    // Navigate first so the UI responds immediately even if Supabase/API is slow.
    state.page = 'scheduler';
    try { renderPage(); } catch (err) { console.error('V210 scheduler first render failed', err); }

    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังโหลดสิทธิ์เวรล่าสุด'); } catch(_) {}
    const result = await refreshDutyEligibilityWithTimeoutV210({ clearDraft:true, toast:false }, 3500);
    try { if (typeof setBusy === 'function') setBusy(false); } catch(_) {}

    if (result === '__timeout__') {
      console.warn('V210 scheduler open: daily_position_eligibility refresh timed out; using cached state.');
      toast('เปิดหน้าจัดตารางเวรแล้ว แต่โหลดสิทธิ์เวรล่าสุดช้า ระบบใช้ข้อมูลที่โหลดไว้ก่อน');
      return;
    }
    if (result === false) {
      toast('เปิดหน้าจัดตารางเวรแล้ว แต่โหลดสิทธิ์เวรล่าสุดไม่สำเร็จ ระบบใช้ข้อมูลที่มีในหน้าจอก่อน', 'error');
      return;
    }
    renderPage();
    toast('โหลดสิทธิ์เวรล่าสุดแล้ว');
  }

  async function generateRosterFresh() {
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังสร้างตารางเปล่า'); } catch(_) {}
    const result = await refreshDutyEligibilityWithTimeoutV210({ clearDraft:false, toast:false }, 3500);
    try { if (typeof setBusy === 'function') setBusy(false); } catch(_) {}
    state.rosterDraft = { monthKey: state.monthKey, assignments: generateEmptyAssignments(state.monthKey) };
    renderPage();
    if (result === '__timeout__') return toast('สร้างตารางเปล่าแล้ว แต่โหลดสิทธิ์เวรล่าสุดช้า ระบบใช้ข้อมูลเดิมก่อน');
    if (result === false) return toast('สร้างตารางเปล่าแล้ว แต่โหลดสิทธิ์เวรล่าสุดไม่สำเร็จ ระบบใช้ข้อมูลเดิมก่อน', 'error');
    toast('สร้างตารางเปล่าจากสิทธิ์เวรล่าสุดแล้ว');
  }

  async function autoAssignFresh() {
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลัง Auto Assign'); } catch(_) {}
    const result = await refreshDutyEligibilityWithTimeoutV210({ clearDraft:false, toast:false }, 3500);
    try { if (typeof setBusy === 'function') setBusy(false); } catch(_) {}
    autoAssignRoster();
    renderPage();
    if (result === '__timeout__') toast('Auto Assign แล้ว แต่โหลดสิทธิ์เวรล่าสุดช้า ระบบใช้ข้อมูลเดิมก่อน');
    else if (result === false) toast('Auto Assign แล้ว แต่โหลดสิทธิ์เวรล่าสุดไม่สำเร็จ ระบบใช้ข้อมูลเดิมก่อน', 'error');
  }

  window.addEventListener('click', async function(e){
    const t = e.target && e.target.closest && e.target.closest('[data-generate-roster],[data-auto-assign],[data-save-roster],[data-publish-roster],[data-lock-roster],[data-save-duty-eligibility-v137]');
    if (!t) return;
    // V212: scheduler sidebar navigation is handled by app.js V211/V212 hard-nav.
    // Do not intercept [data-page="scheduler"] here; otherwise a slow Supabase refresh can make navigation feel frozen.
    if (t.hasAttribute('data-generate-roster')) {
      e.preventDefault(); e.stopImmediatePropagation();
      await generateRosterFresh();
      return;
    }
    if (t.hasAttribute('data-auto-assign')) {
      e.preventDefault(); e.stopImmediatePropagation();
      await autoAssignFresh();
      return;
    }
    if (t.hasAttribute('data-save-roster') || t.hasAttribute('data-publish-roster') || t.hasAttribute('data-lock-roster')) {
      if (state.rosterDraft?.assignments) syncAssignmentsInPlace(state.rosterDraft.assignments);
      return;
    }
    if (t.hasAttribute('data-save-duty-eligibility-v137')) {
      state.rosterDraft = null;
      window.setTimeout(() => refreshDutyEligibilityFromDb({ clearDraft:true, toast:false }).then(() => { if (state.page === 'scheduler' || state.page === 'dutyEligibilityV107') renderPage(); }), 900);
      window.setTimeout(() => refreshDutyEligibilityFromDb({ clearDraft:true, toast:false }).then(() => { if (state.page === 'scheduler') renderPage(); }), 1800);
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `.v197-duty-sync-note{margin:8px 0 10px}.roster-slot .slot-meta{font-weight:700}`;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', function(){
    window.setTimeout(() => {
      if (state?.page === 'scheduler' || state?.page === 'dutyEligibilityV107') refreshDutyEligibilityFromDb({ toast:false });
    }, 300);
  });
})();

} catch (error) { console.error("[v569] patch-v197-duty-permission-sync.js", error); }
;

/* Original source: patch-v204-duty-eligibility-state-fix.js */
try {
/* V204: Duty Eligibility State Isolation + Supabase Re-fetch
   Fixes stale checkbox state on “สิทธิ์เวรตามวัน”.
   - Every selected staff loads DUTY_RULE rows directly from Supabase before enabling the matrix.
   - Save reads only the currently selected staff form, not every checkbox on the document.
   - After save, the page re-fetches the same staff from Supabase and updates state.positionEligibility.
   - Async request token prevents old staff fetch results from overwriting the newest selection. */
(function(){
  'use strict';
  if (window.__CNMI_V204_DUTY_ELIGIBILITY_STATE_FIX__) return;
  window.__CNMI_V204_DUTY_ELIGIBILITY_STATE_FIX__ = true;

  const VERSION = 'V204_DUTY_ELIGIBILITY_STATE_FIX';
  const DUTY_RULE_PREFIX = 'DUTY_RULE:';
  const CODES = ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  const WEEKDAYS = [
    { key:'mon', label:'จันทร์' },
    { key:'tue', label:'อังคาร' },
    { key:'wed', label:'พุธ' },
    { key:'thu', label:'พฤหัสบดี' },
    { key:'fri', label:'ศุกร์' },
    { key:'sat', label:'เสาร์' },
    { key:'sun', label:'อาทิตย์' }
  ];

  const esc = (v) => {
    try { return typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    catch (_) { return String(v == null ? '' : v); }
  };
  const $id = (id) => document.getElementById(id);
  const toast = (msg, tone) => { try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else console.info(msg); } catch(_) {} };
  const friendly = (err) => { try { return typeof friendlyDbError === 'function' ? friendlyDbError(err) : (err?.message || String(err || 'เกิดข้อผิดพลาด')); } catch(_) { return err?.message || String(err || 'เกิดข้อผิดพลาด'); } };
  const currentActor = () => { try { return typeof currentStaffId === 'function' ? currentStaffId() : (state?.profile?.id || null); } catch(_) { return null; } };
  const colorOf = (s) => { try { return staffColor(s); } catch(_) { return s?.staff_color || s?.color || '#dbeafe'; } };
  const fgOf = (bg) => { try { return typeof textColorFor === 'function' ? textColorFor(bg) : '#0f172a'; } catch(_) { return '#0f172a'; } };
  const staffPillSafe = (s) => { try { return typeof staffPill === 'function' ? staffPill(s) : esc(s?.nickname || s?.full_name || '-'); } catch(_) { return esc(s?.nickname || s?.full_name || '-'); } };
  const noPerm = () => { try { return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งานหน้านี้</div>'; } catch(_) { return '<div class="card">ไม่มีสิทธิ์ใช้งานหน้านี้</div>'; } };
  const isAdminSafe = () => { try { return typeof isAdmin === 'function' ? isAdmin() : false; } catch(_) { return false; } };
  const orderedRosterStaff = () => {
    const rows = (state.staff || []).filter(s => {
      try { return typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : s?.is_active !== false && s?.staff_type !== 'แพทย์'; }
      catch (_) { return s?.is_active !== false; }
    });
    try { return typeof orderedStaff === 'function' ? orderedStaff(rows) : rows; } catch(_) { return rows; }
  };

  function normalizeDuty(code='') {
    const c = String(code || '').trim();
    if (['ช4','ช4A','ช4-MT/แตง','ช4-MT/แตง1','ช4-MT/แตง-1','ช4-1','ช4-MT/แตง 1'].includes(c)) return 'ช4-MT/แตง 1';
    if (['ช4B','ช4-MT/แตง2','ช4-MT/แตง-2','ช4-2','ช4-MT/แตง 2'].includes(c)) return 'ช4-MT/แตง 2';
    if (c === 'ช9-MT' || c === 'ช9' || c === 'ช9-MT/แตง') return 'ช9-MT/แตง';
    return c;
  }
  function eligCode(day, duty) { return `${DUTY_RULE_PREFIX}${day}:${normalizeDuty(duty)}`; }
  function defaultCodesForDayKey(k) {
    if (k === 'sat' || k === 'sun') return ['ชบด1','ชบด2','ชบด3','ช3A','ช3B','ช9-เคิก','ช9-MT/แตง'];
    return ['ชบด1','ชบด2','ชบด3','ช4-MT/แตง 1','ช4-MT/แตง 2'];
  }
  function isDutyRow(row) { return String(row?.position_code || '').startsWith(DUTY_RULE_PREFIX); }
  function truthy(v) { return v === true || String(v).toLowerCase() === 'true' || String(v) === '1'; }
  function selectedStaffId() {
    const staff = orderedRosterStaff();
    if (!staff.length) return '';
    if (!state.dutyEligibilityStaffId || !staff.some(s => String(s.id) === String(state.dutyEligibilityStaffId))) state.dutyEligibilityStaffId = staff[0].id;
    return String(state.dutyEligibilityStaffId || staff[0].id || '');
  }

  function replaceDutyRowsForStaff(staffId, rows) {
    const sid = String(staffId || '');
    state.positionEligibility = (state.positionEligibility || [])
      .filter(r => !(String(r?.staff_id) === sid && isDutyRow(r)))
      .concat((rows || []).map(r => ({ ...r, staff_id: r.staff_id || sid })));
  }

  function dutyRowsForStaff(staffId) {
    const sid = String(staffId || '');
    return (state.positionEligibility || []).filter(r => String(r?.staff_id) === sid && isDutyRow(r));
  }

  function recordMapForStaff(staffId) {
    const draft = state.__dutyEligibilityDraftV204;
    if (draft?.staffId && String(draft.staffId) === String(staffId) && draft.dirty && draft.map) return draft.map;
    const map = new Map();
    dutyRowsForStaff(staffId).forEach(r => map.set(String(r.position_code), truthy(r.is_eligible)));
    return map;
  }

  function hasLoadedStaff(staffId) {
    return String(state.__dutyEligibilityLoadedStaffV204 || '') === String(staffId) && !state.__dutyEligibilityLoadingStaffV204;
  }

  async function loadDutyRowsForStaffV204(staffId, options={}) {
    const sid = String(staffId || '');
    if (!sid || !sb) return false;
    const seq = (state.__dutyEligibilityLoadSeqV204 || 0) + 1;
    state.__dutyEligibilityLoadSeqV204 = seq;
    state.__dutyEligibilityLoadingStaffV204 = sid;
    if (options.renderLoading !== false) renderPageSafe();
    try {
      const res = await sb.from('daily_position_eligibility')
        .select('*')
        .eq('staff_id', sid)
        .like('position_code', `${DUTY_RULE_PREFIX}%`)
        .order('position_code', { ascending:true });
      if (res.error) throw res.error;
      if (state.__dutyEligibilityLoadSeqV204 !== seq) return false;
      replaceDutyRowsForStaff(sid, res.data || []);
      state.__dutyEligibilityLoadedStaffV204 = sid;
      state.__dutyEligibilityLoadingStaffV204 = '';
      if (state.__dutyEligibilityDraftV204?.staffId && String(state.__dutyEligibilityDraftV204.staffId) === sid) state.__dutyEligibilityDraftV204 = null;
      return true;
    } catch (err) {
      if (state.__dutyEligibilityLoadSeqV204 === seq) {
        state.__dutyEligibilityLoadingStaffV204 = '';
        state.__dutyEligibilityLoadErrorV204 = friendly(err);
      }
      toast('โหลดสิทธิ์เวรจาก Supabase ไม่สำเร็จ: ' + friendly(err), 'error');
      return false;
    } finally {
      if (state.__dutyEligibilityLoadSeqV204 === seq && options.renderAfter !== false) renderPageSafe();
    }
  }

  function readFormRowsV204(form) {
    const staffId = form?.dataset?.staffId || selectedStaffId();
    const checks = Array.from(form?.querySelectorAll?.('[data-duty-eligibility-v204]') || []);
    return checks.map(cb => ({
      staff_id: staffId,
      position_code: eligCode(cb.dataset.dayKey, cb.dataset.dutyCode),
      is_eligible: !!cb.checked,
      updated_by: currentActor()
    }));
  }

  function captureDraftFromFormV204(form) {
    const rows = readFormRowsV204(form);
    if (!rows.length) return;
    state.__dutyEligibilityDraftV204 = {
      staffId: rows[0].staff_id,
      dirty: true,
      map: new Map(rows.map(r => [String(r.position_code), !!r.is_eligible]))
    };
  }

  async function saveDutyEligibilityV204(form) {
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const staffId = String(form?.dataset?.staffId || selectedStaffId());
    if (!staffId) return toast('ไม่พบเจ้าหน้าที่ที่เลือก', 'error');
    const rows = readFormRowsV204(form);
    if (!rows.length) return toast('ไม่มีข้อมูลสิทธิ์เวรให้บันทึก', 'error');

    const btn = form?.querySelector?.('[data-save-duty-eligibility-v204]');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }
    try {
      const res = await sb.from('daily_position_eligibility').upsert(rows, { onConflict:'staff_id,position_code' });
      if (res.error) throw res.error;
      state.rosterDraft = null;
      state.__dutyEligibilityDraftV204 = null;

      const verify = await sb.from('daily_position_eligibility')
        .select('*')
        .eq('staff_id', staffId)
        .like('position_code', `${DUTY_RULE_PREFIX}%`)
        .order('position_code', { ascending:true });
      if (verify.error) throw verify.error;
      replaceDutyRowsForStaff(staffId, verify.data || rows);
      state.__dutyEligibilityLoadedStaffV204 = staffId;
      state.__dutyEligibilityLoadingStaffV204 = '';

      try { if (typeof window.refreshDutyEligibilityFromDbV197 === 'function') await window.refreshDutyEligibilityFromDbV197({ clearDraft:true, toast:false }); } catch(_) {}
      state.dutyEligibilityStaffId = staffId;
      renderPageSafe();
      toast('บันทึกสิทธิ์เวรตามวันแล้ว และโหลดข้อมูลล่าสุดกลับมาตรวจซ้ำแล้ว');
    } catch (err) {
      toast('บันทึกสิทธิ์เวรไม่สำเร็จ: ' + friendly(err), 'error');
      renderPageSafe();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'บันทึกสิทธิ์เวร'; }
    }
  }

  function renderDutyEligibilityPageV204() {
    if (!isAdminSafe()) return noPerm();
    const active = orderedRosterStaff();
    if (!active.length) return '<div class="card">ยังไม่มีเจ้าหน้าที่ที่เปิดสิทธิ์จัดเวร</div>';
    const staffId = selectedStaffId();
    const selected = active.find(s => String(s.id) === staffId) || active[0];
    const loading = String(state.__dutyEligibilityLoadingStaffV204 || '') === staffId;
    const loadError = state.__dutyEligibilityLoadErrorV204 || '';

    if (!hasLoadedStaff(staffId) && !loading && !loadError) {
      window.setTimeout(() => loadDutyRowsForStaffV204(staffId, { renderLoading:true, renderAfter:true }), 0);
    }

    const loaded = hasLoadedStaff(staffId);
    const rows = loaded ? dutyRowsForStaff(staffId) : [];
    const hasRows = rows.length > 0;
    const map = loaded ? recordMapForStaff(staffId) : new Map();
    const disabled = loading || !loaded;
    const dayRows = WEEKDAYS.map(w => `<tr><th>${esc(w.label)}</th>${CODES.map(code => {
      const key = eligCode(w.key, code);
      const checked = hasRows ? map.get(key) === true : defaultCodesForDayKey(w.key).includes(code);
      return `<td><label class="switch-check v204-duty-switch"><input type="checkbox" data-duty-eligibility-v204 data-day-key="${esc(w.key)}" data-duty-code="${esc(code)}" ${checked?'checked':''} ${disabled?'disabled':''}><span></span></label></td>`;
    }).join('')}</tr>`).join('');
    const bg = colorOf(selected);
    const fg = fgOf(bg);
    const syncText = loading
      ? '<div class="notice soft-notice v204-duty-sync">กำลังโหลดสิทธิ์เวรของเจ้าหน้าที่คนนี้จาก Supabase...</div>'
      : loadError
        ? `<div class="notice error-notice v204-duty-sync">โหลดข้อมูลล่าสุดไม่สำเร็จ: ${esc(loadError)}</div>`
        : !loaded
          ? '<div class="notice soft-notice v204-duty-sync">กำลังเตรียมโหลดข้อมูลล่าสุดจาก Supabase...</div>'
          : `<div class="notice soft-notice v204-duty-sync">โหลดข้อมูลของ <b>${esc(selected.nickname || selected.full_name)}</b> แยกจาก Supabase แล้ว ${hasRows ? `พบ ${rows.length} รายการ` : 'ยังไม่เคยบันทึก ใช้ค่าเริ่มต้นชั่วคราว'}</div>`;

    return `<div class="grid duty-eligibility-page-v137 duty-eligibility-page-v204">
      <div class="card eligibility-staff-panel">
        <div class="section-title"><h3>เลือกเจ้าหน้าที่</h3></div>
        <label>เจ้าหน้าที่ <select id="dutyEligibilityStaffSelectV204">${active.map(s => `<option value="${esc(s.id)}" ${String(selected.id)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name)} (${esc(s.staff_type || '-')})</option>`).join('')}</select></label>
        <div class="selected-staff-card" style="background:${esc(bg)};color:${esc(fg)}"><b>${esc(selected.nickname || selected.full_name)}</b><span>${esc(selected.full_name || '')}</span></div>
        <div class="notice soft-notice compact">หน้านี้ใช้กับเวรเท่านั้น และจะโหลดข้อมูลใหม่ทุกครั้งเมื่อเปลี่ยนชื่อ</div>
        <button class="ghost-btn full-btn" type="button" data-refresh-duty-eligibility-v204 ${loading?'disabled':''}>โหลดข้อมูลคนนี้ใหม่</button>
      </div>
      <div class="card duty-eligibility-matrix-card">
        <form id="dutyEligibilityFormV204" data-staff-id="${esc(staffId)}">
          <div class="section-title"><div><h3>สิทธิ์เวรตามวันของ ${esc(selected.nickname || selected.full_name)}</h3><p class="hint">ช4-MT/แตง มี 2 ตำแหน่งต่อวัน จึงมี 2 ช่องให้ติ๊กแยกกัน</p></div><button class="primary-btn" type="submit" data-save-duty-eligibility-v204 ${disabled?'disabled':''}>บันทึกสิทธิ์เวร</button></div>
          ${syncText}
          ${!hasRows && loaded ? '<div class="notice soft-notice">ยังไม่เคยตั้งสิทธิ์เวรของคนนี้ ระบบแสดงค่าเริ่มต้นให้ก่อน กดบันทึกเพื่อเริ่มใช้ตารางนี้</div>' : ''}
          <div class="table-wrap duty-eligibility-wrap"><table class="duty-eligibility-table v137-duty-table v204-duty-table"><thead><tr><th>วัน</th>${CODES.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${dayRows}</tbody></table></div>
        </form>
      </div>
    </div>`;
  }

  function renderPageSafe() { try { if (typeof renderPage === 'function') renderPage(); } catch(err) { console.warn(`${VERSION}: render skipped`, err); } }

  const prevRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = renderPage = function renderPageV204() {
    if (state.page === 'dutyEligibilityV107') {
      const item = (window.NAV_ITEMS || NAV_ITEMS || []).find(x => x.id === 'dutyEligibilityV107') || {};
      const title = $id('pageTitle'); if (title) title.textContent = item.title || 'สิทธิ์เวรตามวัน';
      const subtitle = $id('pageSubtitle'); if (subtitle) subtitle.textContent = item.subtitle || 'กำหนดสิทธิ์เวรแยกรายวันและรายคน';
      try { if (typeof renderNav === 'function') renderNav(); } catch(_) {}
      const content = $id('pageContent'); if (content) content.innerHTML = renderDutyEligibilityPageV204();
      return;
    }
    return prevRenderPage ? prevRenderPage.apply(this, arguments) : undefined;
  };

  document.addEventListener('change', function(e){
    if (e.target?.id === 'dutyEligibilityStaffSelectV204') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      state.dutyEligibilityStaffId = e.target.value;
      state.__dutyEligibilityDraftV204 = null;
      state.__dutyEligibilityLoadedStaffV204 = '';
      state.__dutyEligibilityLoadErrorV204 = '';
      renderPageSafe();
      return;
    }
    if (e.target?.matches?.('[data-duty-eligibility-v204]')) {
      const form = e.target.closest('#dutyEligibilityFormV204');
      captureDraftFromFormV204(form);
    }
  }, true);

  document.addEventListener('submit', async function(e){
    if (e.target?.id === 'dutyEligibilityFormV204') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      await saveDutyEligibilityV204(e.target);
    }
  }, true);

  document.addEventListener('click', async function(e){
    const btn = e.target?.closest?.('[data-refresh-duty-eligibility-v204]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    state.__dutyEligibilityDraftV204 = null;
    state.__dutyEligibilityLoadedStaffV204 = '';
    state.__dutyEligibilityLoadErrorV204 = '';
    await loadDutyRowsForStaffV204(selectedStaffId(), { renderLoading:true, renderAfter:true });
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .duty-eligibility-page-v204 .selected-staff-card{display:flex;flex-direction:column;gap:3px}
    .v204-duty-sync{margin:0 0 10px}
    .v204-duty-table input[disabled] + span{opacity:.45;cursor:not-allowed}
    .duty-eligibility-page-v204 .full-btn{width:100%;margin-top:10px}
  `;
  document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v204-duty-eligibility-state-fix.js", error); }
;

/* Original source: patch-v213-fast-scheduler-daily-position-dedup.js */
try {
/* V213: Fast Scheduler Render + Daily Position Dedup
   - Scheduler: renders roster grid without prebuilding staff dropdowns in every duty slot.
     Staff selection is generated only when clicking "เลือกคน" for a slot.
   - Daily positions: removes duplicate daily position rows that have the same code/zone/break/rule/job,
     preferring the row that already has a staff assignment.
   - Daily position save: saves only deduped visible rows and refreshes just that date instead of full app reload.
*/
(function(){
  'use strict';
  const VERSION = 'V213_FAST_SCHEDULER_DAILY_POSITION_DEDUP';
  if (window.__CNMI_V213_FAST_SCHEDULER_DAILY_POSITION_DEDUP__) return;
  window.__CNMI_V213_FAST_SCHEDULER_DAILY_POSITION_DEDUP__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const toast = (msg, tone) => { try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else console.info(msg); } catch (_) { console.info(msg); } };
  const friendly = (err) => { try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } };
  const normDate = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0, 10); } };
  const slotId = (slot) => String((typeof getSlotId === 'function' ? getSlotId(slot) : (slot?.id || slot?._temp_id)) || '');
  const clone = (rows) => { try { return structuredClone(rows || []); } catch (_) { return JSON.parse(JSON.stringify(rows || [])); } };

  function safeRenderNav(){ try { if (typeof renderNav === 'function') renderNav(); } catch (_) {} }
  function safeTitleFor(pageId, fallbackTitle, fallbackSubtitle){
    try {
      const item = (window.NAV_ITEMS || NAV_ITEMS || []).find(x => x.id === pageId) || {};
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = item.title || fallbackTitle || '';
      if (subtitle) subtitle.textContent = item.subtitle || fallbackSubtitle || '';
    } catch (_) {}
  }

  function rosterEnabledStaff(){
    const rows = (state.staff || []).filter(s => {
      try { return typeof isRosterEnabled === 'function' ? isRosterEnabled(s) : s?.is_active !== false && s?.staff_type !== 'แพทย์'; }
      catch (_) { return s?.is_active !== false; }
    });
    try { return orderedStaff(rows); } catch (_) { return rows; }
  }
  function staffPillSafe(id){ try { return id ? staffPill(id) : '<span class="muted">ยังไม่จัด</span>'; } catch (_) { return id || '<span class="muted">ยังไม่จัด</span>'; } }
  function staffColorSafe(s){ try { return staffColor(s); } catch (_) { return s?.color || s?.staff_color || '#dbeafe'; } }
  function textColorSafe(bg){ try { return textColorFor(bg); } catch (_) { return '#0f172a'; } }
  function dutyLabel(code){ try { return DUTY_LABEL[code] || code || ''; } catch (_) { return code || ''; } }

  function currentRosterAssignments(){
    if (state.rosterDraft?.monthKey === state.monthKey && Array.isArray(state.rosterDraft.assignments)) return state.rosterDraft.assignments;
    try { return getAssignmentsForMonth(state.monthKey) || []; } catch (_) { return []; }
  }
  function ensureRosterDraft(){
    if (!state.rosterDraft || state.rosterDraft.monthKey !== state.monthKey || !Array.isArray(state.rosterDraft.assignments)) {
      state.rosterDraft = { monthKey: state.monthKey, assignments: clone(currentRosterAssignments()) };
    }
    return state.rosterDraft.assignments;
  }
  function findAssignmentById(id){
    return (ensureRosterDraft() || []).find(a => slotId(a) === String(id));
  }

  function fastRosterSlotHtml(slot){
    if (!slot) return '<td class="muted">-</td>';
    const id = slotId(slot);
    const disabled = slot.is_locked ? 'disabled' : '';
    return `<td><div class="roster-slot v213-fast-roster-slot ${slot.is_locked?'locked':''}" data-drop-slot="${esc(id)}">
      <div class="assigned-name">${staffPillSafe(slot.staff_id)}</div>
      <div class="slot-meta">${esc(slot.required_role || '-')} ${slot.is_locked?'• locked':''}</div>
      <div class="actions">
        <button class="tiny-btn" type="button" data-edit-roster-slot-v213="${esc(id)}" ${disabled}>เลือกคน</button>
        <button class="tiny-btn" type="button" data-clear-slot="${esc(id)}" ${disabled}>ล้าง</button>
        <button class="tiny-btn" type="button" data-toggle-lock-slot="${esc(id)}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button>
      </div>
    </div></td>`;
  }

  window.renderRosterGrid = renderRosterGrid = function renderRosterGridV213(assignments){
    const rows = assignments || [];
    if (!rows.length) {
      try { return empty('กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร'); }
      catch (_) { return '<div class="empty">กด “สร้างร่าง Auto Assign” เพื่อเริ่มจัดเวร</div>'; }
    }
    const range = getMonthRange(state.monthKey);
    const y = range.y, m = range.m;
    const last = new Date(y, m, 0).getDate();
    const columns = (typeof DUTY_COLUMNS !== 'undefined' ? DUTY_COLUMNS : ['ชบด1','ชบด2','ชบด3','ช4A','ช4B','ช3A','ช3B','ช9-เคิก','ช9-MT']);
    const byCell = new Map();
    rows.forEach(a => byCell.set(`${normDate(a.duty_date)}|${a.duty_code}`, a));
    const desktop = `<div class="table-wrap roster-table-wrap v213-fast-roster-wrap"><table class="roster-table"><thead><tr><th>วันที่</th>${columns.map(c => `<th>${esc(dutyLabel(c))}</th>`).join('')}</tr></thead><tbody>
      ${Array.from({length:last}, (_,i)=>i+1).map(day => {
        const date = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dow = parseDate(date).toLocaleDateString('th-TH', { weekday:'short' });
        const allowed = new Set((typeof allowedDutyCodesForDate === 'function' ? allowedDutyCodesForDate(date) : columns));
        return `<tr><td><b>${day}</b><br><span class="muted">${esc(dow)}</span>${isHolidayDate(date) ? `<br><span class="badge yellow">${esc(holidayName(date))}</span>` : ''}</td>${columns.map(code => allowed.has(code) ? fastRosterSlotHtml(byCell.get(`${date}|${code}`)) : '<td class="muted">-</td>').join('')}</tr>`;
      }).join('')}
    </tbody></table></div>`;
    const mobile = `<div class="mobile-roster-cards v213-mobile-roster-cards">${Array.from({length:last}, (_,i)=>i+1).map(day => {
      const date = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dow = parseDate(date).toLocaleDateString('th-TH', { weekday:'short' });
      const allowed = (typeof allowedDutyCodesForDate === 'function' ? allowedDutyCodesForDate(date) : columns);
      const slots = allowed.map(code => byCell.get(`${date}|${code}`)).filter(Boolean);
      return `<div class="mobile-card roster-day-card"><div class="mobile-day-head"><b>${day}</b><span>${esc(dow)}</span>${isHolidayDate(date) ? `<span class="badge yellow">${esc(holidayName(date))}</span>` : ''}</div>${slots.map(slot => {
        const id = slotId(slot);
        return `<div class="mobile-roster-slot"><div><b>${esc(dutyLabel(slot.duty_code))}</b><br><span class="muted">${esc(slot.required_role || '-')} ${slot.is_locked?'• locked':''}</span><br>${staffPillSafe(slot.staff_id)}</div><div class="actions"><button class="tiny-btn" type="button" data-edit-roster-slot-v213="${esc(id)}" ${slot.is_locked?'disabled':''}>เลือกคน</button><button class="tiny-btn" type="button" data-clear-slot="${esc(id)}" ${slot.is_locked?'disabled':''}>ล้าง</button><button class="tiny-btn" type="button" data-toggle-lock-slot="${esc(id)}">${slot.is_locked?'ปลดล็อก':'ล็อก'}</button></div></div>`;
      }).join('')}</div>`;
    }).join('')}</div>`;
    return desktop + mobile + '<p class="hint v213-speed-note">โหมดเร็ว: ระบบไม่สร้าง dropdown เจ้าหน้าที่ทุกช่องพร้อมกัน จึงเปิดหน้าจัดตารางเวรได้ไวขึ้น หากต้องเปลี่ยนคนให้กด “เลือกคน” ในช่องนั้น หรือใช้ลากชื่อจากรายชื่อเจ้าหน้าที่</p>';
  };

  window.renderSchedulerPage = renderSchedulerPage = function renderSchedulerPageV213(){
    if (typeof isAdmin === 'function' && !isAdmin()) return (typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์</div>');
    const range = getMonthRange(state.monthKey);
    const y = range.y, m = range.m;
    const month = (state.rosterMonths || []).find(x => Number(x.year) === Number(y) && Number(x.month) === Number(m));
    const assignments = currentRosterAssignments().filter(a => { try { return assignmentBelongsToActiveStaff(a); } catch (_) { return true; } });
    const monthHolidays = (state.holidays || []).filter(h => String(h.holiday_date || '').startsWith(state.monthKey));
    const staff = rosterEnabledStaff();
    return `<div class="grid v213-scheduler-page">
      <div class="card">
        <div class="toolbar">
          <label>เดือน <input type="month" id="rosterMonthInput" value="${esc(state.monthKey)}"></label>
          <button class="ghost-btn" type="button" data-generate-roster>สร้างตารางเปล่า</button>
          <button class="soft-btn" type="button" data-auto-assign>สร้างร่าง Auto Assign</button>
          <button class="primary-btn" type="button" data-save-roster>บันทึก</button>
          <button class="ghost-btn danger" type="button" data-clear-roster-month>ล้างข้อมูลเดือนนี้</button>
          <button class="ghost-btn" type="button" data-restore-roster-month>ย้อนกลับข้อมูลล่าสุด</button>
          ${typeof badge === 'function' ? badge(month?.status || 'ยังไม่สร้าง', month?.status==='published'?'green':month?.status==='locked'?'red':'black') : `<span>${esc(month?.status || 'ยังไม่สร้าง')}</span>`}
        </div>
        <form id="holidayForm" class="form-grid compact-form">
          <label>เพิ่มวันหยุดราชการ <input name="holiday_date" type="date" value="${esc(state.monthKey)}-01" required></label>
          <label>ชื่อวันหยุด <input name="title" placeholder="เช่น วันเฉลิมฯ" required></label>
          <button class="soft-btn" type="submit">บันทึกวันหยุด</button>
        </form>
        <div class="hint">Auto Assign จะช่วยเกลี่ยเวรตามกติกาและไม่แตะช่องที่ล็อกไว้</div>
        ${monthHolidays.length ? `<div class="chip-line">${monthHolidays.map(h => `<span class="badge yellow">${formatThaiDate(h.holiday_date)} ${esc(String(h.title || h.name || h.holiday_name || 'วันหยุดราชการ').split(':::')[0].trim())}</span>`).join('')}</div>` : ''}
      </div>
      <div class="roster-board">
        <div class="card">
          <h3>รายชื่อเจ้าหน้าที่</h3>
          <p class="hint">ลากชื่อไปวางในช่องเวรได้เลย / คนที่ปิดจัดเวรจะไม่ถูก Auto Assign</p>
          <div class="staff-pool">
            ${staff.map(s => { const bg = staffColorSafe(s); return `<div class="staff-chip" style="--staff-bg:${esc(bg)};--staff-fg:${esc(textColorSafe(bg))}" draggable="true" data-drag-staff="${esc(s.id)}" data-staff-stat="${esc(s.id)}" title="กดเพื่อดูสถิติเวร"><span>${esc(s.nickname || s.full_name)}</span>${typeof badge === 'function' ? badge(s.staff_type || '-', s.staff_type==='MT'?'blue':'orange') : `<span>${esc(s.staff_type || '-')}</span>`}</div>`; }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="section-title"><h3>ตารางร่าง ${esc(state.monthKey)}</h3><button class="tiny-btn" type="button" data-show-fairness>ดูสมดุลเวร</button></div>
          ${window.renderRosterGrid(assignments)}
        </div>
      </div>
    </div>`;
  };

  function positionKey(row){
    const code = (typeof positionBaseCode === 'function' ? positionBaseCode(row?.position_code || row?.code || '') : String(row?.position_code || row?.code || '').trim());
    return [code, row?.zone || '', row?.break_time || '', row?.main_rule || '', row?.job_desc || ''].map(x => String(x || '').trim()).join('|');
  }
  function dedupeDailyPositionRows(rows){
    const out = [];
    const map = new Map();
    (rows || []).forEach((row, idx) => {
      if (!row) return;
      const key = positionKey(row) || `__row_${idx}`;
      if (!map.has(key)) { map.set(key, out.length); out.push(row); return; }
      const currentIndex = map.get(key);
      const current = out[currentIndex];
      const currentHasStaff = !!current?.staff_id;
      const rowHasStaff = !!row?.staff_id;
      // Prefer the row that already has a selected staff. If both have staff, keep the first to avoid duplicating one position.
      if (!currentHasStaff && rowHasStaff) out[currentIndex] = row;
    });
    try { return sortPositionRows(out); } catch (_) { return out; }
  }
  window.cnmiDeduplicateDailyPositionsV213 = dedupeDailyPositionRows;

  function staffOptionsForPosition(row, selectedId, date){
    let list = [];
    try {
      const base = positionTemplateByCode(row.position_code || row.code, date) || row;
      const checkRow = { ...base, ...row, code: row.position_code || row.code || base.code, position_code: row.position_code || row.code || base.code };
      list = (state.staff || []).filter(s => positionCandidateOk(s, checkRow, date));
      list = orderedStaff(list);
    } catch (_) { list = state.staff || []; }
    const selected = selectedId ? (state.staff || []).find(s => String(s.id) === String(selectedId)) : null;
    if (selected && !list.some(s => String(s.id) === String(selected.id))) list.unshift(selected);
    return list.map(s => `<option value="${esc(s.id)}" ${String(s.id) === String(selectedId || '') ? 'selected' : ''}>${esc(s.nickname || s.full_name || s.email || '-')}</option>`).join('');
  }

  window.renderPositionsPage = renderPositionsPage = function renderPositionsPageV213(){
    try {
      const date = state.positionDate || (typeof todayStr === 'function' ? todayStr() : '');
      const existing = (state.positions || []).filter(x => normDate(x.work_date) === date);
      const template = (typeof positionTemplateForDate === 'function' ? positionTemplateForDate(date) : []) || [];
      let rows = existing.length ? existing.map(r => {
        const base = positionTemplateByCode(r.position_code, date) || {};
        return { ...base, ...r, code: r.position_code, position_code: r.position_code || base.code };
      }) : template.map(p => ({ ...p, position_code:p.code, staff_id:null }));
      rows = dedupeDailyPositionRows(rows);
      const canManage = typeof canManagePositions === 'function' ? canManagePositions(date) : false;
      const key = date.slice(0, 7);
      const incharge = typeof currentInchargeForMonth === 'function' ? currentInchargeForMonth(key) : '';
      const dayStatus = (state.positionDayStatus || []).find(x => normDate(x.work_date) === date);
      const isPublished = dayStatus?.status === 'published';
      const noPosition = typeof isNoPositionDay === 'function' ? isNoPositionDay(date) : false;
      const rowHtml = rows.map((r,idx) => {
        const base = positionTemplateByCode(r.position_code || r.code, date) || r;
        const code = base.code || r.position_code || r.code || 'รอตรวจสอบ';
        const select = canManage ? `<select data-position-row="${idx}" data-position-code="${esc(code)}" data-position-zone="${esc(r.zone || base.zone || '')}" data-position-break="${esc(r.break_time || base.break_time || '')}" data-position-rule="${esc(r.main_rule || base.main_rule || '')}" data-position-job="${esc(r.job_desc || base.job_desc || '')}"><option value="">-</option>${staffOptionsForPosition(r, r.staff_id, date)}</select>` : staffPillSafe(r.staff_id);
        const label = typeof positionLabelForCell === 'function' ? positionLabelForCell(r.position_code || base.code) : (r.position_code || base.code || '');
        return `<tr><td>${esc(r.zone || base.zone || '')}</td><td><b>${esc(label)}</b></td><td>${esc(r.break_time || base.break_time || '')}</td><td>${select}</td><td>${esc(r.main_rule || base.main_rule || '')}</td><td>${esc(r.job_desc || base.job_desc || '')}</td></tr>`;
      }).join('');
      const cardHtml = rows.map((r,idx) => {
        const base = positionTemplateByCode(r.position_code || r.code, date) || r;
        const code = base.code || r.position_code || r.code || 'รอตรวจสอบ';
        const select = canManage ? `<select data-position-row="${idx}" data-position-code="${esc(code)}" data-position-zone="${esc(r.zone || base.zone || '')}" data-position-break="${esc(r.break_time || base.break_time || '')}" data-position-rule="${esc(r.main_rule || base.main_rule || '')}" data-position-job="${esc(r.job_desc || base.job_desc || '')}"><option value="">-</option>${staffOptionsForPosition(r, r.staff_id, date)}</select>` : staffPillSafe(r.staff_id);
        return `<div class="position-mobile-card"><div class="section-title"><h3>${esc(typeof positionLabelForCell === 'function' ? positionLabelForCell(r.position_code || base.code) : (r.position_code || base.code || ''))}</h3>${typeof badge === 'function' ? badge(r.zone || base.zone || '-', (r.zone || base.zone) === 'ออกหน่วย' ? 'red' : 'blue') : `<span>${esc(r.zone || base.zone || '-')}</span>`}</div><div class="muted">พัก ${esc(r.break_time || base.break_time || '-')} • ${esc(r.main_rule || base.main_rule || '')}</div><label>ผู้รับผิดชอบ ${select}</label><p>${esc(r.job_desc || base.job_desc || '')}</p></div>`;
      }).join('');
      const table = `<div class="table-wrap daily-position-table desktop-table v213-daily-position-table"><table><thead><tr><th>โซน</th><th>ตำแหน่ง</th><th>เวลาพัก</th><th>ผู้รับผิดชอบ</th><th>ผู้ปฏิบัติหลัก</th><th>หน้าที่โดยย่อ</th></tr></thead><tbody>${rowHtml}</tbody></table></div><div class="mobile-position-list">${cardHtml}</div>`;
      return `<div class="card v213-positions-page">
        <div class="toolbar">
          <label>วันที่ <input type="date" id="positionDateInput" value="${esc(date)}"></label>
          ${typeof isAdmin === 'function' && isAdmin() ? `<label>อินชาร์จประจำเดือน <select id="inchargeSelect"><option value="">ไม่ระบุ</option>${staffOptions(incharge)}</select></label><button class="soft-btn" type="button" data-save-incharge>บันทึกอินชาร์จ</button>` : `<span>${typeof badge === 'function' ? badge('อินชาร์จ: ' + staffNick(incharge), 'blue') : esc('อินชาร์จ: ' + incharge)}</span>`}
          ${canManage && !noPosition ? '<button class="primary-btn" type="button" data-save-positions>บันทึกตำแหน่งวันนี้</button>' : ''}
          ${isPublished ? '<span class="badge green">ประกาศแล้ว</span>' : '<span class="badge orange">ร่าง</span>'}
        </div>
        <div class="notice soft-notice">ตรวจตำแหน่งของวันนี้ให้ตรงกับคนลาและงานจริง แล้วกดบันทึกตำแหน่งวันนี้ หากมีคนลาหลังจากบันทึกแล้ว ให้ปรับหน้างานและบันทึกใหม่อีกครั้ง</div>
        ${noPosition ? `<div class="notice">วันนี้เป็น${isHolidayDate(date) ? 'วันหยุดราชการ' : 'วันเสาร์-อาทิตย์'} จึงไม่ต้องจัดตำแหน่งรายวัน</div>` : ''}
        ${!noPosition && hasOuting(date) ? `<div class="notice">วันนี้มีออกหน่วย: คนที่ถูกติ๊กในกิจกรรมจะถูกจัดลงชุดออกหน่วย ส่วนคนที่เหลือจะถูกเกลี่ยไปตำแหน่งห้อง Blood Bank</div>` : ''}
        ${noPosition ? (typeof empty === 'function' ? empty('ไม่มีตารางตำแหน่งกลางวัน รายวันสำหรับวันนี้') : '') : table}
      </div>`;
    } catch (err) {
      console.error(`${VERSION}: renderPositionsPage failed`, err);
      return `<div class="notice error-notice">โหลดตารางตำแหน่งกลางวัน รายวันไม่สำเร็จ: ${esc(err?.message || err)}</div>`;
    }
  };

  window.savePositions = savePositions = async function savePositionsV213(){
    const date = document.getElementById('positionDateInput')?.value || state.positionDate || (typeof todayStr === 'function' ? todayStr() : '');
    if (typeof canManagePositions === 'function' && !canManagePositions(date)) return toast('เฉพาะ Admin หรืออินชาร์จประจำเดือนนี้เท่านั้น', 'error');
    const selects = Array.from(document.querySelectorAll('[data-position-row]'));
    let rows = selects.map(sel => {
      const base = (typeof positionTemplateByCode === 'function' ? positionTemplateByCode(sel.dataset.positionCode, date) : {}) || {};
      const code = sel.dataset.positionCode || base.code || 'รอตรวจสอบ';
      return {
        work_date: date,
        position_code: code,
        zone: sel.dataset.positionZone || base.zone || 'รอตรวจสอบ',
        break_time: sel.dataset.positionBreak || base.break_time || '-',
        main_rule: sel.dataset.positionRule || base.main_rule || '',
        job_desc: sel.dataset.positionJob || base.job_desc || '',
        staff_id: sel.value || null,
        updated_by: typeof currentStaffId === 'function' ? currentStaffId() : null
      };
    }).filter(r => r.position_code);
    rows = dedupeDailyPositionRows(rows);
    try {
      if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกตำแหน่งวันนี้');
      const del = await sb.from('daily_positions').delete().eq('work_date', date);
      if (del.error) throw del.error;
      const ins = rows.length ? await sb.from('daily_positions').insert(rows).select('*') : { data:[], error:null };
      if (ins.error) throw ins.error;
      const statusRow = { work_date: date, month_key: date.slice(0,7), status: 'draft', updated_by: typeof currentStaffId === 'function' ? currentStaffId() : null };
      const st = await sb.from('daily_position_day_status').upsert(statusRow, { onConflict:'work_date' }).select('*').maybeSingle();
      if (st.error) throw st.error;
      state.positions = (state.positions || []).filter(r => normDate(r.work_date) !== date).concat(ins.data || rows);
      state.positionDayStatus = (state.positionDayStatus || []).filter(r => normDate(r.work_date) !== date).concat(st.data || statusRow);
      renderPage();
      toast('บันทึกตำแหน่งรายวันแล้ว');
      console.info(`${VERSION}: daily positions saved`, { date, rows: rows.length });
    } catch (err) {
      console.error(`${VERSION}: savePositions failed`, err);
      toast('บันทึกตำแหน่งรายวันไม่สำเร็จ: ' + friendly(err), 'error');
    } finally {
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  };

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  window.renderPage = renderPage = function renderPageV213(){
    if (state?.page === 'scheduler') {
      safeTitleFor('scheduler', 'จัดตารางเวร', 'สร้างร่าง Auto Assign และบันทึกตาราง');
      safeRenderNav();
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = window.renderSchedulerPage();
      return;
    }
    if (state?.page === 'positions') {
      safeTitleFor('positions', 'ตารางตำแหน่งกลางวัน รายวัน', 'ดู/ปรับตำแหน่งประจำวันก่อนเริ่มงาน');
      safeRenderNav();
      const content = document.getElementById('pageContent');
      if (content) content.innerHTML = window.renderPositionsPage();
      return;
    }
    return previousRenderPage ? previousRenderPage.apply(this, arguments) : undefined;
  };

  window.addEventListener('click', function(e){
    const nav = e.target?.closest?.('[data-page="scheduler"]');
    if (!nav) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    try {
      state.page = 'scheduler';
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      renderPage();
      console.info(`${VERSION}: scheduler opened immediately, no blocking refresh`);
    } catch (err) {
      console.error(`${VERSION}: scheduler open failed`, err);
      toast('เปิดหน้าจัดตารางเวรไม่สำเร็จ: ' + friendly(err), 'error');
    }
  }, true);

  document.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-edit-roster-slot-v213]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const id = btn.dataset.editRosterSlotV213;
    const assignments = ensureRosterDraft();
    const slot = assignments.find(a => slotId(a) === String(id));
    if (!slot) return toast('ไม่พบช่องเวรนี้ กรุณารีเฟรชหน้า', 'error');
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่');
    let options = '';
    try { options = staffOptionList(slot.staff_id, st => canStaffWorkSlot(st.id, slot, assignments)); }
    catch (err) {
      console.warn(`${VERSION}: staff option build fallback`, err);
      options = rosterEnabledStaff().map(s => `<option value="${esc(s.id)}" ${String(s.id)===String(slot.staff_id||'')?'selected':''}>${esc(s.nickname || s.full_name || '-')} (${esc(s.staff_type || '-')})</option>`).join('');
    }
    const html = `<h2>เลือกคนลงเวร</h2><p class="hint">${esc(slot.duty_date)} • ${esc(dutyLabel(slot.duty_code))} • ${esc(slot.required_role || '-')}</p><form id="v213RosterSlotForm" data-slot-id="${esc(id)}" class="form-grid compact-form"><label>ผู้รับผิดชอบ <select name="staff_id"><option value="">ยังไม่จัด</option>${options}</select></label><button class="primary-btn" type="submit">บันทึกช่องนี้</button></form>`;
    if (typeof showModal === 'function') showModal(html); else toast('ไม่สามารถเปิด popup ได้', 'error');
  }, true);

  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'v213RosterSlotForm') return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const id = e.target.dataset.slotId;
    const slot = findAssignmentById(id);
    if (!slot) return toast('ไม่พบช่องเวรนี้ กรุณารีเฟรชหน้า', 'error');
    const fd = new FormData(e.target);
    const staffId = fd.get('staff_id') || null;
    if (slot.is_locked) return toast('ช่องนี้ล็อกอยู่');
    if (staffId && !canStaffWorkSlot(staffId, slot, state.rosterDraft.assignments)) return toast('คนนี้ติดลา/ไม่รับเวร หรือสิทธิ์เวรตามวันไม่ตรงกับช่องนี้', 'error');
    slot.staff_id = staffId;
    try { if (typeof closeModal === 'function') closeModal(); } catch (_) {}
    renderPage();
    toast('แก้ไขช่องเวรแล้ว กดบันทึกเพื่อบันทึกจริง');
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v213-fast-roster-wrap .roster-slot{min-width:122px}
    .v213-fast-roster-slot .actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
    .v213-speed-note{margin-top:10px}
    .v213-daily-position-table table tbody tr td{vertical-align:middle}
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v213-fast-scheduler-daily-position-dedup.js", error); }
;

/* Original source: patch-v214-position-management-crud-hard-fix.js */
try {
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

} catch (error) { console.error("[v569] patch-v214-position-management-crud-hard-fix.js", error); }
;

/* Original source: patch-v215-weekly-position-copy.js */
try {
/* V215: Weekly Position Copy
   - Adds Admin-only "คัดลอกตำแหน่งทั้งสัปดาห์" controls to monthly and daily position pages.
   - Copies from the selected source date to Mon-Fri of the same week in local draft only.
   - Protects weekend/holiday, leave, outing participants, and existing cells unless override is checked.
*/
(function(){
  'use strict';
  const VERSION = 'V215_WEEKLY_POSITION_COPY';
  if (window.__CNMI_V215_WEEKLY_POSITION_COPY__) return;
  window.__CNMI_V215_WEEKLY_POSITION_COPY__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const toast = (msg, tone) => {
    try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else window.alert(msg); }
    catch (_) { console.info(msg); }
  };
  const normDate = (v) => {
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parse = (date) => {
    try { return parseDate(normDate(date)); }
    catch (_) { return new Date(`${normDate(date)}T00:00:00`); }
  };
  const copyRows = (rows) => {
    try { return structuredClone(rows || []); }
    catch (_) { return JSON.parse(JSON.stringify(rows || [])); }
  };
  const currentId = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } };
  const isAdminSafe = () => { try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } };

  function sameMonth(date, key){ return normDate(date).startsWith(String(key || '').slice(0, 7)); }
  function monthKeyOfDate(date){ return normDate(date).slice(0, 7); }
  function isNoPosition(date){
    const d = normDate(date);
    try { if (typeof isNoPositionDay === 'function' && isNoPositionDay(d)) return true; } catch (_) {}
    try { if (typeof isWeekend === 'function' && isWeekend(d)) return true; } catch (_) {}
    try { if (typeof isHolidayDate === 'function' && isHolidayDate(d)) return true; } catch (_) {}
    return false;
  }
  function weekMonFriDates(sourceDate){
    const base = parse(sourceDate);
    const day = base.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return ymd(d);
    });
  }
  function firstWorkdayOfMonth(key){
    try {
      const { y, m, last } = getMonthRange(key);
      for (let day = 1; day <= last; day += 1) {
        const d = `${y}-${pad2(m)}-${pad2(day)}`;
        if (!isNoPosition(d)) return d;
      }
    } catch (_) {}
    return `${key}-01`;
  }
  function defaultSourceDateForMonth(key){
    const current = normDate(state.positionWeekSourceDateV215 || '');
    if (current && sameMonth(current, key)) return current;
    const today = (typeof todayStr === 'function' ? todayStr() : ymd(new Date()));
    if (sameMonth(today, key) && !isNoPosition(today)) return today;
    return firstWorkdayOfMonth(key);
  }
  function realLeaveOn(staffId, date){
    try {
      const row = activeLeaveRecordOn(staffId, normDate(date));
      if (!row) return null;
      try { if (typeof isNoDutyLeaveType === 'function' && isNoDutyLeaveType(row)) return null; } catch (_) {}
      return row;
    } catch (_) { return null; }
  }
  function staffHasOuting(staffId, date){
    const d = normDate(date);
    try { if (typeof hasOuting === 'function' && !hasOuting(d)) return false; } catch (_) {}
    try {
      if (typeof outingParticipants === 'function') {
        const ids = outingParticipants(d) || [];
        return ids.map(String).includes(String(staffId || ''));
      }
    } catch (_) {}
    return false;
  }
  function codeOf(row){
    const raw = String(row?.position_code || row?.code || '').trim();
    if (!raw) return '';
    try { return positionBaseCode(raw) || raw; } catch (_) { return raw.replace(/\s+#\d+$/, '').trim(); }
  }
  function isBlankCode(code){
    const raw = String(code || '').trim();
    if (!raw) return true;
    try { return positionBaseCode(raw) === 'รอตรวจสอบ'; } catch (_) { return raw === 'รอตรวจสอบ'; }
  }
  function rowHasRealPosition(row){ return !!row?.staff_id && !isBlankCode(row?.position_code || row?.code); }
  function monthRowsForKey(key){
    const draft = state.monthPositionDraft;
    if (draft?.monthKey === key && Array.isArray(draft.rows)) return copyRows(draft.rows);
    return copyRows((state.positions || []).filter(r => normDate(r?.work_date).startsWith(key)));
  }
  function ensureDraft(key){
    let rows = monthRowsForKey(key);
    rows = mergeVisibleMonthSelections(rows, key);
    state.monthPositionDraft = { monthKey: key, rows };
    return state.monthPositionDraft.rows;
  }
  function mergeVisibleMonthSelections(rows, key){
    const selects = Array.from(document.querySelectorAll('[data-month-position-edit]'));
    if (!selects.length) return rows;
    let next = copyRows(rows || []);
    selects.forEach(sel => {
      const [dateRaw, staffIdRaw] = String(sel.dataset.monthPositionEdit || '').split('|');
      const d = normDate(dateRaw);
      const staffId = String(staffIdRaw || '').trim();
      if (!d || !sameMonth(d, key) || !staffId) return;
      next = next.filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === staffId));
      const code = String(sel.value || '').trim();
      if (code) next.push(makeCopiedRow(d, { staff_id: staffId, position_code: code }, d, false));
    });
    return next;
  }
  function visibleDailyRows(sourceDate){
    const currentDate = normDate(document.getElementById('positionDateInput')?.value || state.positionDate || '');
    if (currentDate !== normDate(sourceDate)) return [];
    const selects = Array.from(document.querySelectorAll('[data-position-row]'));
    const seen = new Set();
    const rows = [];
    selects.forEach(sel => {
      const key = String(sel.dataset.positionRow || `${sel.dataset.positionCode}|${sel.dataset.positionZone}|${sel.dataset.positionBreak}`);
      if (seen.has(key)) return;
      seen.add(key);
      const staffId = String(sel.value || '').trim();
      if (!staffId) return;
      rows.push({
        work_date: normDate(sourceDate),
        position_code: sel.dataset.positionCode || 'รอตรวจสอบ',
        code: sel.dataset.positionCode || 'รอตรวจสอบ',
        zone: sel.dataset.positionZone || '',
        break_time: sel.dataset.positionBreak || '-',
        main_rule: sel.dataset.positionRule || '',
        job_desc: sel.dataset.positionJob || '',
        staff_id: staffId,
        updated_by: currentId()
      });
    });
    return rows;
  }
  function sourceRowsForDate(rows, sourceDate){
    const sourceKey = normDate(sourceDate);
    const byStaff = new Map();
    (rows || []).forEach(r => {
      if (normDate(r?.work_date) !== sourceKey || !r?.staff_id || !rowHasRealPosition(r)) return;
      if (!byStaff.has(String(r.staff_id))) byStaff.set(String(r.staff_id), { ...r, work_date: sourceKey });
    });
    const daily = visibleDailyRows(sourceKey);
    daily.forEach(r => {
      if (!r.staff_id || !rowHasRealPosition(r)) return;
      byStaff.set(String(r.staff_id), r);
    });
    return Array.from(byStaff.values());
  }
  function makeCopiedRow(targetDate, sourceRow, sourceDate, copied=true){
    const code = String(sourceRow?.position_code || sourceRow?.code || '').trim();
    const base = (() => {
      try { return positionTemplateByCode(code, targetDate) || positionTemplateByCode(code, sourceDate) || {}; }
      catch (_) { return {}; }
    })();
    return {
      work_date: normDate(targetDate),
      position_code: code,
      zone: sourceRow?.zone || base.zone || 'รอตรวจสอบ',
      break_time: sourceRow?.break_time || base.break_time || '-',
      main_rule: sourceRow?.main_rule || base.main_rule || '',
      job_desc: sourceRow?.job_desc || base.job_desc || '',
      staff_id: sourceRow?.staff_id,
      updated_by: currentId(),
      _weekCopiedV215: !!copied,
      _copySourceDateV215: normDate(sourceDate)
    };
  }
  function protectSourceDateInDraft(rows, sourceDate, sourceRows){
    let next = copyRows(rows || []);
    (sourceRows || []).forEach(src => {
      const sid = String(src.staff_id || '');
      if (!sid) return;
      next = next.filter(r => !(normDate(r?.work_date) === normDate(sourceDate) && String(r?.staff_id || '') === sid));
      next.push(makeCopiedRow(sourceDate, src, sourceDate, false));
    });
    return next;
  }
  function rowKeyCell(row){ return `${String(row?.staff_id || '')}|${normDate(row?.work_date)}`; }
  function hasExistingCell(rows, staffId, date){
    return (rows || []).some(r => String(r?.staff_id || '') === String(staffId || '') && normDate(r?.work_date) === normDate(date) && rowHasRealPosition(r));
  }
  function codeAlreadyUsedByOther(rows, staffId, date, code){
    const c = codeOf({ position_code: code });
    return (rows || []).some(r => String(r?.staff_id || '') !== String(staffId || '') && normDate(r?.work_date) === normDate(date) && codeOf(r) === c && rowHasRealPosition(r));
  }
  function replaceCell(rows, staffId, date, newRow){
    const d = normDate(date);
    const sid = String(staffId || '');
    return (rows || []).filter(r => !(normDate(r?.work_date) === d && String(r?.staff_id || '') === sid)).concat(newRow);
  }
  function applyWeeklyCopyToRows(rows, sourceDate, sourceRows, options){
    const sourceKey = normDate(sourceDate);
    const key = monthKeyOfDate(sourceKey);
    const override = !!options?.override;
    let next = protectSourceDateInDraft(rows, sourceKey, sourceRows);
    const copiedCells = new Set();
    const stats = { changed:0, skippedWeekendHoliday:0, skippedLeave:0, skippedOuting:0, skippedExisting:0, skippedDuplicate:0, skippedOutsideMonth:0, protectedSource:0 };
    const targets = weekMonFriDates(sourceKey).filter(d => d !== sourceKey);

    targets.forEach(targetDate => {
      if (!sameMonth(targetDate, key)) { stats.skippedOutsideMonth += Math.max(sourceRows.length, 1); return; }
      if (isNoPosition(targetDate)) { stats.skippedWeekendHoliday += Math.max(sourceRows.length, 1); return; }
      (sourceRows || []).forEach(src => {
        const staffId = String(src.staff_id || '');
        const code = String(src.position_code || src.code || '').trim();
        if (!staffId || isBlankCode(code)) return;
        if (realLeaveOn(staffId, targetDate)) { stats.skippedLeave += 1; return; }
        if (staffHasOuting(staffId, targetDate)) { stats.skippedOuting += 1; return; }
        const existing = hasExistingCell(next, staffId, targetDate);
        if (!override && existing) { stats.skippedExisting += 1; return; }
        if (!override && codeAlreadyUsedByOther(next, staffId, targetDate, code)) { stats.skippedDuplicate += 1; return; }
        const newRow = makeCopiedRow(targetDate, src, sourceKey, true);
        next = replaceCell(next, staffId, targetDate, newRow);
        copiedCells.add(`${staffId}|${normDate(targetDate)}`);
        stats.changed += 1;
      });
    });
    return { rows: next, copiedCells, stats, targets };
  }
  async function confirmCopy(sourceDate, override){
    const msg = `ต้องการคัดลอกตำแหน่งจากวันนี้ไปทั้งสัปดาห์หรือไม่?\n\nวันต้นแบบ: ${normDate(sourceDate)}\nช่วงเป้าหมาย: จันทร์-ศุกร์ในสัปดาห์เดียวกัน\nโหมด: ${override ? 'ทับข้อมูลเดิมที่ไม่ติดเงื่อนไขป้องกัน' : 'คัดลอกเฉพาะช่องว่าง'}`;
    try {
      if (typeof confirmDialog === 'function') return await confirmDialog(msg, 'ยืนยันคัดลอกตำแหน่งทั้งสัปดาห์');
    } catch (_) {}
    return window.confirm(msg);
  }
  function copySummaryText(stats, sourceRowsCount){
    const parts = [`คัดลอก ${stats.changed} ช่อง`];
    if (stats.skippedExisting) parts.push(`คงช่องเดิม ${stats.skippedExisting}`);
    if (stats.skippedLeave) parts.push(`ข้ามวันลา ${stats.skippedLeave}`);
    if (stats.skippedOuting) parts.push(`ข้ามออกหน่วย ${stats.skippedOuting}`);
    if (stats.skippedDuplicate) parts.push(`ข้ามตำแหน่งที่มีคนถืออยู่ ${stats.skippedDuplicate}`);
    if (stats.skippedWeekendHoliday) parts.push(`ข้าม WEEKEND/HOLIDAY`);
    if (stats.skippedOutsideMonth) parts.push(`ข้ามวันที่นอกเดือนนี้`);
    if (!sourceRowsCount) parts.push('ไม่พบข้อมูลวันต้นแบบ');
    return parts.join(' • ');
  }
  async function copyWeekPositions(sourceDateRaw, options={}){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้นที่คัดลอกตำแหน่งทั้งสัปดาห์ได้', 'error');
    const sourceDate = normDate(sourceDateRaw || '');
    if (!sourceDate) return toast('กรุณาเลือกวันต้นแบบก่อน', 'error');
    if (isNoPosition(sourceDate)) return toast('วันต้นแบบเป็น WEEKEND/HOLIDAY จึงคัดลอกตำแหน่งไม่ได้', 'error');
    const key = monthKeyOfDate(sourceDate);
    const ok = await confirmCopy(sourceDate, !!options.override);
    if (!ok) return;
    let rows = ensureDraft(key);
    const sourceRows = sourceRowsForDate(rows, sourceDate);
    if (!sourceRows.length) return toast('ยังไม่พบตำแหน่งของวันต้นแบบ ให้เลือก/สร้างแผนของวันนั้นก่อน', 'error');
    const result = applyWeeklyCopyToRows(rows, sourceDate, sourceRows, options);
    state.monthPositionDraft = { monthKey: key, rows: result.rows };
    state.positionMonthKey = key;
    state.positionWeekSourceDateV215 = sourceDate;
    state.weeklyCopiedPositionCellsV215 = result.copiedCells;
    const rerender = () => { if (typeof renderPage === 'function') renderPage(); };
    try {
      if (typeof withPreservedTableScrollV168 === 'function') withPreservedTableScrollV168(rerender);
      else rerender();
    } catch (_) { rerender(); }
    setTimeout(highlightCopiedCells, 40);
    toast(`คัดลอกตำแหน่งทั้งสัปดาห์แล้ว กรุณาตรวจสอบก่อนบันทึก (${copySummaryText(result.stats, sourceRows.length)})`, result.stats.changed ? undefined : 'error');
  }

  function monthCopyControlsHtml(key){
    const source = defaultSourceDateForMonth(key);
    state.positionWeekSourceDateV215 = source;
    const checked = state.positionWeekOverrideV215 ? 'checked' : '';
    return `<label class="week-copy-source-v215">วันต้นแบบ <input type="date" id="positionWeekSourceDateV215" value="${esc(source)}"></label>
      <label class="week-copy-checkbox-v215"><input type="checkbox" id="positionWeekOverrideV215" ${checked}> ทับข้อมูลเดิม</label>
      <button class="soft-btn week-copy-btn-v215" type="button" data-copy-week-positions-v215="month">คัดลอกตำแหน่งทั้งสัปดาห์</button>`;
  }
  function dailyCopyControlsHtml(){
    const checked = state.positionWeekDailyOverrideV215 ? 'checked' : '';
    return `<label class="week-copy-checkbox-v215"><input type="checkbox" id="positionWeekDailyOverrideV215" ${checked}> ทับข้อมูลเดิม</label>
      <button class="soft-btn week-copy-btn-v215" type="button" data-copy-week-positions-v215="daily">คัดลอกตำแหน่งทั้งสัปดาห์</button>`;
  }
  function injectAfterButton(html, attr, insertHtml){
    const re = new RegExp(`(<button[^>]*${attr}[^>]*>[\\s\\S]*?<\\/button>)`);
    if (re.test(html)) return html.replace(re, `$1${insertHtml}`);
    return html.replace(/(<div class="toolbar">)/, `$1${insertHtml}`);
  }

  const oldRenderPositionMonthPage = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage) {
    window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV215(){
      let html = String(oldRenderPositionMonthPage.apply(this, arguments) || '');
      if (!isAdminSafe() || html.includes('data-copy-week-positions-v215="month"')) return html;
      const key = state.positionMonthKey || state.monthKey || monthKeyOfDate(typeof todayStr === 'function' ? todayStr() : ymd(new Date()));
      html = injectAfterButton(html, 'data-save-month-positions', monthCopyControlsHtml(key));
      return html.replace('Admin เลือกตำแหน่งในช่องได้ แล้วกดบันทึกแผนทั้งเดือน', 'Admin เลือกตำแหน่งในช่องได้ / คัดลอกทั้งสัปดาห์ได้ แล้วกดบันทึกแผนทั้งเดือน');
    };
  }

  const oldRenderPositionsPage = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
  if (oldRenderPositionsPage) {
    window.renderPositionsPage = renderPositionsPage = function renderPositionsPageV215(){
      let html = String(oldRenderPositionsPage.apply(this, arguments) || '');
      if (!isAdminSafe() || html.includes('data-copy-week-positions-v215="daily"')) return html;
      const date = normDate(state.positionDate || (typeof todayStr === 'function' ? todayStr() : ymd(new Date())));
      if (isNoPosition(date)) return html;
      return injectAfterButton(html, 'data-save-positions', dailyCopyControlsHtml());
    };
  }

  function highlightCopiedCells(){
    try {
      const set = state.weeklyCopiedPositionCellsV215;
      if (!set || !set.size) return;
      document.querySelectorAll('[data-month-position-edit]').forEach(sel => {
        const [dateRaw, staffIdRaw] = String(sel.dataset.monthPositionEdit || '').split('|');
        const key = `${String(staffIdRaw || '')}|${normDate(dateRaw)}`;
        if (set.has(key)) {
          const td = sel.closest('td');
          if (td) td.classList.add('week-copy-cell-v215');
        }
      });
    } catch (err) { console.warn(`${VERSION}: highlight failed`, err); }
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV215(){
      const result = previousRenderPage.apply(this, arguments);
      setTimeout(highlightCopiedCells, 20);
      return result;
    };
  }

  document.addEventListener('change', function(e){
    if (e.target?.id === 'positionWeekSourceDateV215') state.positionWeekSourceDateV215 = e.target.value || '';
    if (e.target?.id === 'positionWeekOverrideV215') state.positionWeekOverrideV215 = !!e.target.checked;
    if (e.target?.id === 'positionWeekDailyOverrideV215') state.positionWeekDailyOverrideV215 = !!e.target.checked;
  }, true);

  document.addEventListener('click', async function(e){
    const btn = e.target?.closest?.('[data-copy-week-positions-v215]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const mode = btn.getAttribute('data-copy-week-positions-v215');
    const source = mode === 'daily'
      ? (document.getElementById('positionDateInput')?.value || state.positionDate || (typeof todayStr === 'function' ? todayStr() : ''))
      : (document.getElementById('positionWeekSourceDateV215')?.value || state.positionWeekSourceDateV215 || '');
    const override = mode === 'daily'
      ? !!document.getElementById('positionWeekDailyOverrideV215')?.checked
      : !!document.getElementById('positionWeekOverrideV215')?.checked;
    await copyWeekPositions(source, { override, mode });
  }, true);

  window.copyWeekPositionsV215 = copyWeekPositions;
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v215-weekly-position-copy.js", error); }
;

/* Original source: patch-v216-month-position-blank-table.js */
try {
/* V216: Month Position Blank Table First
   - Adds Admin-only “สร้างตารางเปล่า” before auto-generating monthly positions.
   - If auto-generate cannot create any rows, it falls back to a blank staff x workday table instead of showing success with no table.
   - Blank rows are only a screen draft; they are not saved until Admin selects positions and presses save.
*/
(function(){
  'use strict';
  const VERSION = 'V216_MONTH_POSITION_BLANK_TABLE_FIRST';
  if (window.__CNMI_V216_MONTH_POSITION_BLANK_TABLE__) return;
  window.__CNMI_V216_MONTH_POSITION_BLANK_TABLE__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const toast = (msg, tone) => {
    try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else window.alert(msg); }
    catch (_) { console.info(msg); }
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayKey = () => {
    try { return todayStr(); }
    catch (_) {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  };
  const monthKeyFallback = () => {
    try { return monthKey(new Date()); }
    catch (_) { return todayKey().slice(0, 7); }
  };
  const currentId = () => {
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || null; }
  };
  const isAdminSafe = () => {
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  };
  const isNoPositionDate = (date) => {
    try { if (typeof isNoPositionDay === 'function') return !!isNoPositionDay(date); } catch (_) {}
    try { if (typeof isWeekend === 'function' && isWeekend(date)) return true; } catch (_) {}
    try { if (typeof isHolidayDate === 'function' && isHolidayDate(date)) return true; } catch (_) {}
    const d = new Date(`${date}T00:00:00`);
    return d.getDay() === 0 || d.getDay() === 6;
  };
  const isBlankCode = (code) => {
    const raw = String(code || '').trim();
    if (!raw) return true;
    try { return positionBaseCode(raw) === 'รอตรวจสอบ'; }
    catch (_) { return raw === 'รอตรวจสอบ'; }
  };
  const realPositionRows = (rows) => (rows || []).filter(r => r?.staff_id && !isBlankCode(r?.position_code || r?.code));

  function getRange(key){
    try {
      const r = getMonthRange(key);
      return { y: r.y, m: r.m, last: r.last || new Date(r.y, r.m, 0).getDate() };
    } catch (_) {
      const [yy, mm] = String(key || monthKeyFallback()).split('-').map(Number);
      const y = yy || new Date().getFullYear();
      const m = mm || (new Date().getMonth() + 1);
      return { y, m, last: new Date(y, m, 0).getDate() };
    }
  }

  function staffForBlankTable(){
    let rows = Array.isArray(state?.staff) ? state.staff.slice() : [];
    rows = rows.filter(st => {
      try { return typeof isDailyPositionEnabled === 'function' ? isDailyPositionEnabled(st) : true; }
      catch (_) { return true; }
    }).filter(st => st && st.id && !st.deleted_at && st.is_active !== false && st.active !== false);
    try { return orderedStaff(rows); }
    catch (_) { return rows.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }

  function makeBlankRow(date, staffId){
    return {
      work_date: date,
      position_code: '',
      code: '',
      zone: '',
      break_time: '-',
      main_rule: '',
      job_desc: '',
      staff_id: staffId,
      updated_by: currentId(),
      _blankTableV216: true
    };
  }

  function buildBlankMonthPositionDraft(key){
    const { y, m, last } = getRange(key);
    const staff = staffForBlankTable();
    const rows = [];
    for (let day = 1; day <= last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (isNoPositionDate(date)) continue;
      staff.forEach(st => rows.push(makeBlankRow(date, st.id)));
    }
    return { monthKey: key, rows, blankTable: true };
  }

  function currentMonthKeyFromScreen(){
    const input = document.getElementById('positionMonthInput');
    return String(input?.value || state?.positionMonthKey || state?.monthKey || monthKeyFallback()).slice(0, 7);
  }

  async function confirmDiscardDraft(actionText){
    const hasDraft = state?.monthPositionDraft?.rows?.length && state.monthPositionDraft.monthKey === currentMonthKeyFromScreen();
    if (!hasDraft) return true;
    const realRows = realPositionRows(state.monthPositionDraft.rows);
    if (!realRows.length) return true;
    const msg = `มีร่างตำแหน่งที่ยังไม่ได้บันทึกอยู่\n\nต้องการ${actionText}และแทนที่ร่างเดิมหรือไม่?`;
    try { if (typeof confirmDialog === 'function') return await confirmDialog(msg, 'ยืนยันแทนที่ร่างเดิม'); }
    catch (_) {}
    return window.confirm(msg);
  }

  async function createBlankTable(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const key = currentMonthKeyFromScreen();
    const ok = await confirmDiscardDraft('สร้างตารางเปล่า');
    if (!ok) return;
    const draft = buildBlankMonthPositionDraft(key);
    state.positionMonthKey = key;
    state.monthPositionDraft = draft;
    try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
    if (!draft.rows.length) return toast('สร้างตารางเปล่าไม่ได้ เพราะยังไม่พบเจ้าหน้าที่ที่เปิดใช้งานสำหรับจัดตำแหน่ง หรือเดือนนี้ไม่มีวันทำงาน', 'error');
    toast('สร้างตารางเปล่าแล้ว เลือกตำแหน่งในช่องที่ต้องการ จากนั้นค่อยกดบันทึกแผนทั้งเดือน');
  }

  const oldBuildMonthlyPositionDraft = window.buildMonthlyPositionDraft || (typeof buildMonthlyPositionDraft === 'function' ? buildMonthlyPositionDraft : null);

  async function generateMonthPlanWithFallback(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const key = currentMonthKeyFromScreen();
    const ok = await confirmDiscardDraft('สร้างแผนทั้งเดือนใหม่');
    if (!ok) return;
    let draft = null;
    let buildError = null;
    try { draft = oldBuildMonthlyPositionDraft ? oldBuildMonthlyPositionDraft(key) : null; }
    catch (err) { buildError = err; console.warn(`${VERSION}: auto plan failed`, err); }
    const autoRows = Array.isArray(draft?.rows) ? draft.rows : [];
    state.positionMonthKey = key;
    if (realPositionRows(autoRows).length) {
      state.monthPositionDraft = { ...draft, monthKey: key, rows: autoRows };
      try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
      toast('สร้างแผนตำแหน่งรายเดือนแล้ว ตรวจทานก่อนบันทึก');
      return;
    }
    const blank = buildBlankMonthPositionDraft(key);
    state.monthPositionDraft = blank;
    try { if (typeof renderPage === 'function') renderPage(); } catch (_) {}
    const extra = buildError ? ' ระบบสร้างแผนอัตโนมัติติด Error จึงเปิดตารางเปล่าให้ก่อน' : ' ระบบยังจัดแผนอัตโนมัติไม่ได้ จึงเปิดตารางเปล่าให้ก่อน';
    toast(`สร้างตารางเปล่าแล้ว${extra} เลือกตำแหน่งเองแล้วค่อยกดบันทึก`, blank.rows.length ? undefined : 'error');
  }

  // Make other callers safe too: an empty auto-plan now returns a visible blank matrix instead of an invisible empty result.
  if (oldBuildMonthlyPositionDraft) {
    window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV216(key){
      let draft = null;
      try { draft = oldBuildMonthlyPositionDraft.apply(this, arguments); } catch (err) { console.warn(`${VERSION}: build fallback`, err); }
      if (Array.isArray(draft?.rows) && draft.rows.length) return draft;
      const month = String(key || currentMonthKeyFromScreen() || monthKeyFallback()).slice(0, 7);
      return buildBlankMonthPositionDraft(month);
    };
  }

  function blankButtonHtml(){
    return '<button class="soft-btn blank-month-table-btn-v216" type="button" data-create-blank-month-position-table-v216>สร้างตารางเปล่า</button>';
  }

  function injectBlankButton(html){
    if (html.includes('data-create-blank-month-position-table-v216')) return html;
    const btn = blankButtonHtml();
    if (/<button[^>]*data-generate-month-positions/.test(html)) {
      return html.replace(/(<button[^>]*data-generate-month-positions[^>]*>)/, `${btn}$1`);
    }
    return html.replace(/(<div class="toolbar">)/, `$1${btn}`);
  }

  const oldRenderPositionMonthPage = window.renderPositionMonthPage || (typeof renderPositionMonthPage === 'function' ? renderPositionMonthPage : null);
  if (oldRenderPositionMonthPage) {
    window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV216(){
      let html = String(oldRenderPositionMonthPage.apply(this, arguments) || '');
      if (!isAdminSafe()) return html;
      html = injectBlankButton(html);
      const note = '<div class="notice soft-notice compact v216-blank-table-note">ถ้ายังไม่มีตาราง ให้กด “สร้างตารางเปล่า” ก่อน แล้วค่อยเลือกตำแหน่ง/คัดลอกทั้งสัปดาห์/บันทึกแผนทั้งเดือน</div>';
      if (!html.includes('v216-blank-table-note')) {
        html = html.replace(/(<\/div>\s*<div class="monthly-matrix-wrap)/, `${note}$1`).replace(/(<\/div>\s*<div class="empty-state)/, `${note}$1`);
      }
      return html;
    };
  }

  const oldRenderMonthPositionMatrix = window.renderMonthPositionMatrix || (typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix : null);
  if (oldRenderMonthPositionMatrix) {
    window.renderMonthPositionMatrix = renderMonthPositionMatrix = function renderMonthPositionMatrixV216(rows, dates){
      if (!Array.isArray(rows) || !rows.length) {
        try { return empty('ยังไม่มีตารางตำแหน่งกลางวัน รายเดือน กด “สร้างตารางเปล่า” ก่อน หรือกด “สร้างแผนทั้งเดือน” เพื่อให้ระบบลองจัดอัตโนมัติ'); }
        catch (_) { return '<div class="empty-state">ยังไม่มีตารางตำแหน่งกลางวัน รายเดือน กด “สร้างตารางเปล่า” ก่อน</div>'; }
      }
      return oldRenderMonthPositionMatrix.apply(this, arguments);
    };
  }

  const oldRenderSummaryHint = window.renderMonthPositionSummaryHint || (typeof renderMonthPositionSummaryHint === 'function' ? renderMonthPositionSummaryHint : null);
  if (oldRenderSummaryHint) {
    window.renderMonthPositionSummaryHint = renderMonthPositionSummaryHint = function renderMonthPositionSummaryHintV216(rows, dates){
      const real = realPositionRows(rows || []);
      if ((!rows || !rows.length) || !real.length) {
        if ((rows || []).length) return '<div class="notice soft-notice compact v216-blank-summary">ตารางนี้เป็นร่างเปล่า ยังไม่มีตำแหน่งที่ถูกเลือก จึงยังไม่มีสรุปภาระงาน</div>';
        return '';
      }
      return oldRenderSummaryHint.call(this, real, dates);
    };
  }

  window.addEventListener('click', async function(e){
    const blank = e.target?.closest?.('[data-create-blank-month-position-table-v216]');
    const generate = e.target?.closest?.('[data-generate-month-positions]');
    if (!blank && !generate) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (blank) return createBlankTable();
    return generateMonthPlanWithFallback();
  }, true);

  window.createBlankMonthPositionTableV216 = createBlankTable;
  window.buildBlankMonthPositionDraftV216 = buildBlankMonthPositionDraft;
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v216-month-position-blank-table.js", error); }
;

/* Original source: patch-v549-trade-effective-roster.js */
try {
/* V549: Fresh Effective Trade/Roster Engine (cache-safe filename)
   - ปรับช่วงขายเวรเป็น เช้า/บ่าย/ดึก และช่วงรวม 16/24 ชม.
   - ถ้าขายครบชั่วโมงของช่องเวร ให้โอนเจ้าของเวรทั้งช่องตามเดิม
   - ถ้าขายเฉพาะบางช่วง ให้ไม่ย้ายเจ้าของเวรทั้งช่อง แต่ตารางอ่านผลแบบแยกช่วง: ผู้ขายเหลือเฉพาะช่วงที่ยังทำเอง และผู้รับเห็นช่วงที่รับแทน
*/
(function(){
  'use strict';
  const VERSION = 'V549_TRADE_EFFECTIVE_ROSTER';
  if (window.__CNMI_V549_TRADE_EFFECTIVE_ROSTER__) return;
  window.__CNMI_V549_TRADE_EFFECTIVE_ROSTER__ = true;

  const PARTS = {
    full24: { label:'ขาย: เช้า-บ่าย-ดึก', short:'เช้า-บ่าย-ดึก', hours:24, segments:['morning','afternoon','night'] },
    morning_afternoon: { label:'ขาย: เช้า-บ่าย', short:'เช้า-บ่าย', hours:16, segments:['morning','afternoon'] },
    afternoon_night: { label:'ขาย: บ่าย-ดึก', short:'บ่าย-ดึก', hours:16, segments:['afternoon','night'] },
    night_morning: { label:'ขาย: ดึก-เช้า', short:'ดึก-เช้า', hours:16, segments:['night','morning'] },
    morning: { label:'ขาย: เช้า', short:'เช้า', hours:8, segments:['morning'] },
    afternoon: { label:'ขาย: บ่าย', short:'บ่าย', hours:8, segments:['afternoon'] },
    night: { label:'ขาย: ดึก', short:'ดึก', hours:8, segments:['night'] }
  };
  const SEGMENT_ORDER = ['morning','afternoon','night'];
  const SEGMENT_LABEL = { morning:'เช้า', afternoon:'บ่าย', night:'ดึก' };

  const CUSTOM_PART = 'custom_time';

  function clockMinutes(value){
    const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
    if(!m)return NaN;
    const h=Number(m[1]),min=Number(m[2]);
    if(!Number.isInteger(h)||!Number.isInteger(min)||h<0||h>23||min<0||min>59)return NaN;
    return h*60+min;
  }
  function clockText(absMinutes){
    let n=Math.round(Number(absMinutes||0));
    n=((n%1440)+1440)%1440;
    return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  }
  function isWeekendHoliday(date){
    try { return !!(isWeekend(date) || isHolidayDate(date)); }
    catch (_) {
      const d=new Date(`${String(date||'').slice(0,10)}T12:00:00`).getDay();
      return d===0||d===6;
    }
  }
  function assignmentWindow(a){
    const code=String(a?.duty_code||'');
    const full=assignmentFullHours(a);
    if(/^ชบด[123]$/.test(code)) return isWeekendHoliday(a?.duty_date) ? {start:480,end:1920} : {start:960,end:1920};
    if(['ช3A','ช3B','ช9-เคิก','ช9-MT'].includes(code)) return {start:480,end:960};
    if(['ช4A','ช4B'].includes(code)) return {start:960,end:1440};
    if(full>=24)return {start:480,end:1920};
    if(full>=16)return {start:960,end:1920};
    return {start:480,end:480+Math.max(1,full)*60};
  }
  function intervalText(start,end){
    const plus=end>1440 || (end===1440 && start>=960);
    const base=`${clockText(start)}–${clockText(end)}`;
    return plus && clockMinutes(clockText(end))<=clockMinutes(clockText(start)) ? `${base} (+1 วัน)` : base;
  }
  function resolveClockRange(startText,endText,a){
    const w=assignmentWindow(a);
    const sClock=clockMinutes(startText),eClock=clockMinutes(endText);
    if(!Number.isFinite(sClock)||!Number.isFinite(eClock))return null;
    const sCandidates=[sClock,sClock+1440,sClock+2880].filter(x=>x>=w.start-0.01&&x<w.end-0.01);
    if(!sCandidates.length)return null;
    const start=sCandidates[0];
    const eCandidates=[eClock,eClock+1440,eClock+2880].filter(x=>x>start+0.01&&x<=w.end+0.01);
    if(!eCandidates.length)return null;
    const end=eCandidates[0];
    return {start,end,hours:Math.round((end-start)/60*100)/100};
  }
  function segmentIntervals(a,segments){
    const w=assignmentWindow(a);
    const map={morning:[480,960],afternoon:[960,1440],night:[1440,1920]};
    const out=[];
    (segments||[]).forEach(seg=>{
      const raw=map[seg]; if(!raw)return;
      const s=Math.max(w.start,raw[0]),e=Math.min(w.end,raw[1]);
      if(e>s+0.01)out.push([s,e]);
    });
    return out;
  }
  function legacyPartSpec(part,a){
    const key=PARTS[part]?part:defaultPartFor(a);
    const intervals=segmentIntervals(a,PARTS[key]?.segments||[]);
    const hours=intervals.reduce((sum,x)=>sum+(x[1]-x[0])/60,0) || Math.min(Number(PARTS[key]?.hours||0),assignmentFullHours(a));
    return {part:key,custom:false,intervals,hours:Math.round(hours*100)/100,label:PARTS[key]?.short||PARTS[key]?.label||key};
  }
  function tradeSpecFromNote(note,a){
    const raw=String(note||'');
    const start=raw.match(/\[SELL_START=(\d{1,2}:\d{2})\]/i)?.[1]||'';
    const end=raw.match(/\[SELL_END=(\d{1,2}:\d{2})\]/i)?.[1]||'';
    if(start&&end){
      const range=resolveClockRange(start,end,a);
      if(range)return {part:CUSTOM_PART,custom:true,intervals:[[range.start,range.end]],hours:range.hours,start,end,label:intervalText(range.start,range.end)};
    }
    const part=partFromNoteLegacy(raw,a);
    return legacyPartSpec(part,a);
  }
  function specFromInputs(start,end,a){
    const range=resolveClockRange(start,end,a);
    if(!range)return null;
    const w=assignmentWindow(a);
    const full=assignmentFullHours(a);
    const whole=Math.abs(range.hours-full)<0.01 && Math.abs(range.start-w.start)<0.01 && Math.abs(range.end-w.end)<0.01;
    if(whole){
      const legacy=legacyPartSpec(defaultPartFor(a),a);
      return {...legacy,start:clockText(w.start),end:clockText(w.end),whole:true};
    }
    return {part:CUSTOM_PART,custom:true,intervals:[[range.start,range.end]],hours:range.hours,start:clockText(range.start),end:clockText(range.end),label:intervalText(range.start,range.end),whole:false};
  }
  function subtractIntervals(base,removed){
    let pieces=[base];
    (removed||[]).slice().sort((a,b)=>a[0]-b[0]).forEach(([rs,re])=>{
      pieces=pieces.flatMap(([s,e])=>{
        if(re<=s||rs>=e)return [[s,e]];
        const out=[];
        if(rs>s)out.push([s,Math.min(rs,e)]);
        if(re<e)out.push([Math.max(re,s),e]);
        return out.filter(x=>x[1]>x[0]+0.01);
      });
    });
    return pieces;
  }
  function intervalsOverlap(a,b){return a[0]<b[1]-0.01&&b[0]<a[1]-0.01;}
  function exactTimeLabel(intervals){
    return (intervals||[]).map(x=>intervalText(x[0],x[1])).join(' + ');
  }


  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(msg, tone){
    try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else window.alert(msg); }
    catch (_) { console.info(msg); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function currentId(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  }
  function admin(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }
  function ordered(list){
    try { return orderedStaff(list || []); }
    catch (_) { return (list || []).slice().sort((a,b)=>String(a?.nickname || a?.full_name || '').localeCompare(String(b?.nickname || b?.full_name || ''), 'th')); }
  }
  function activeRosterStaff(){
    const rows = Array.isArray(state?.staff) ? state.staff : [];
    return ordered(rows.filter(st => {
      try { if (typeof isRosterEnabled === 'function') return isRosterEnabled(st); } catch (_) {}
      return st && st.id && st.is_active !== false && st.active !== false && st.schedule !== false;
    }));
  }
  function labelDuty(code){
    try { return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL?.[code]) || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function sortDuty(code){
    try { return dutySortIndex(code); }
    catch (_) {
      try { return (DUTY_COLUMNS || []).indexOf(code); } catch (_) { return 999; }
    }
  }
  function money(value){
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    const rounded = Math.round(n * 100) / 100;
    return `${rounded.toLocaleString('th-TH', { minimumFractionDigits:Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits:2 })} บ.`;
  }
  function hoursText(value){
    const n = Math.round(Number(value || 0) * 100) / 100;
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  }
  function monthDates(key){
    try { return scheduleMonthDates(key); }
    catch (_) {
      const [y, m] = String(key || state?.monthKey || '').split('-').map(Number);
      const yy = y || new Date().getFullYear();
      const mm = m || (new Date().getMonth() + 1);
      const last = new Date(yy, mm, 0).getDate();
      return Array.from({length:last}, (_,i)=>`${yy}-${String(mm).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
    }
  }
  function assignmentFullHours(a){
    if (!a) return 0;
    try {
      const h = Number(shiftPaymentHoursForCode(a.duty_date, a.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    try {
      const h = Number(dutyHoursForCode(a.duty_date, a.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    return 8;
  }
  function defaultPartFor(a){
    const full = assignmentFullHours(a);
    if (full >= 24) return 'full24';
    if (full >= 16) return 'afternoon_night';
    return 'morning';
  }
  function partFromNoteLegacy(note, a=null){
    const raw = String(note || '').match(/\[SELL_PART=([a-z_]+)\]/i)?.[1]?.toLowerCase() || '';
    if (PARTS[raw]) return raw;
    if (raw === 'full') return defaultPartFor(a);
    if (raw === 'full24') return 'full24';
    return defaultPartFor(a);
  }
  function partFromNote(note, a=null){
    const raw = String(note || '').match(/\[SELL_PART=([a-z_]+)\]/i)?.[1]?.toLowerCase() || '';
    if(raw===CUSTOM_PART || /\[SELL_START=\d{1,2}:\d{2}\]/i.test(String(note||''))) return CUSTOM_PART;
    return partFromNoteLegacy(note,a);
  }
  function partHours(part, a){
    if(part===CUSTOM_PART)return NaN; // ให้ระบบภายนอก fallback ไปอ่าน [SELL_HOURS]
    const full = assignmentFullHours(a);
    const key = PARTS[part] ? part : defaultPartFor(a);
    const h = Number(PARTS[key].hours || full || 0);
    return full > 0 ? Math.min(h, full) : h;
  }
  function coversWholeSlot(part, a){
    if(part===CUSTOM_PART)return false;
    const full = assignmentFullHours(a);
    return partHours(part, a) >= (full - 0.01);
  }
  function partLabel(part, a, note=''){
    if(part===CUSTOM_PART){
      const spec=tradeSpecFromNote(note,a);
      return `ขาย: ${spec?.label||'เลือกเวลา'} (${hoursText(spec?.hours||0)} ชม.)`;
    }
    const key = PARTS[part] ? part : defaultPartFor(a);
    return `${PARTS[key].label} (${hoursText(partHours(key, a))} ชม.)`;
  }
  function allowedPartOptions(selected, a){
    const full = assignmentFullHours(a);
    const keys = full >= 24
      ? ['full24','morning_afternoon','afternoon_night','night_morning','morning','afternoon','night']
      : full >= 16
        ? ['morning_afternoon','afternoon_night','night_morning','morning','afternoon','night']
        : ['morning'];
    let sel = PARTS[selected] && keys.includes(selected) ? selected : keys[0];
    return keys.map(k => `<option value="${esc(k)}" ${k===sel?'selected':''}>${esc(partLabel(k, a))}</option>`).join('');
  }
  function stripMarkers(note){
    return String(note || '')
      .replace(/\s*\[SELL_PART=[a-z_]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_HOURS=\d+(?:\.\d+)?\]\s*/ig, ' ')
      .replace(/\s*\[SELL_SEGMENTS=[^\]]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_START=\d{1,2}:\d{2}\]\s*/ig, ' ')
      .replace(/\s*\[SELL_END=\d{1,2}:\d{2}\]\s*/ig, ' ')
      .replace(/\s*\[SELL_DATE=[^\]]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_DUTY=[^\]]+\]\s*/ig, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function buildNote(spec, a, note){
    const clean = stripMarkers(note);
    const dutyDate = encodeURIComponent(normDate(a?.duty_date || ''));
    const dutyCode = encodeURIComponent(String(a?.duty_code || ''));
    let marker='';
    if(spec?.custom){
      marker=`[SELL_PART=${CUSTOM_PART}] [SELL_HOURS=${hoursText(spec.hours)}] [SELL_SEGMENTS=custom] [SELL_START=${spec.start}] [SELL_END=${spec.end}] [SELL_DATE=${dutyDate}] [SELL_DUTY=${dutyCode}]`;
    }else{
      const part=spec?.part||defaultPartFor(a),cfg=PARTS[part]||PARTS[defaultPartFor(a)];
      marker=`[SELL_PART=${part}] [SELL_HOURS=${hoursText(spec?.hours ?? partHours(part,a))}] [SELL_SEGMENTS=${(cfg.segments||[]).join(',')}] [SELL_DATE=${dutyDate}] [SELL_DUTY=${dutyCode}]`;
    }
    return clean ? `${marker} ${clean}` : marker;
  }
  function forcedRate(mode, date){
    try {
      if (mode === 'kerk') return dutyRateByType('เคิก', date);
      return dutyRateByType('MT', date);
    } catch (_) {
      const holiday = (() => { try { return isHolidayDate(date); } catch (_) { return false; } })();
      return mode === 'kerk' ? (holiday ? 120 : 90) : (holiday ? 160 : 130);
    }
  }
  function staffTypeFor(staffId, code){
    try { return dutyStaffTypeForRate(staffId, code) || 'MT'; }
    catch (_) {
      const st = (state?.staff || []).find(s => String(s.id) === String(staffId));
      return String(st?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT';
    }
  }
  function defaultRateMode(staffId, a){
    return staffTypeFor(staffId, a?.duty_code) === 'เคิก' ? 'kerk' : 'mt';
  }
  function niceRate(value){
    try { return niceRoleRateLabel(value); }
    catch (_) { return ({ mt:'ขายเรท MT', kerk:'ขายเรทเคิก', custom:'กำหนดจำนวนเงินเอง' }[value] || value || '-'); }
  }
  function calcPayment(a, sellerId, receiverId, rateMode='mt', part=defaultPartFor(a), customAmount=0){
    const h = partHours(part, a);
    const date = a?.duty_date || '';
    if (rateMode === 'custom') return { hours:h, adjustedHours:h, amount:Number(customAmount || 0), rate:0, sellerType:'-', receiverType:'-' };
    if (rateMode === 'kerk' || rateMode === 'mt') {
      const rate = forcedRate(rateMode, date);
      return { hours:h, adjustedHours:h, amount:Math.round(h * rate), rate, sellerType:rateMode === 'kerk' ? 'เคิก' : 'MT', receiverType:rateMode === 'kerk' ? 'เคิก' : 'MT' };
    }
    try {
      if (typeof calculateShiftPayment === 'function') {
        const base = calculateShiftPayment(a, sellerId, receiverId, 'ขายเวร', rateMode);
        const ratio = assignmentFullHours(a) ? h / assignmentFullHours(a) : 1;
        return { ...base, hours:h, adjustedHours:Math.round(Number(base.adjustedHours || h) * ratio * 100) / 100, amount:Math.round(Number(base.amount || 0) * ratio) };
      }
    } catch (_) {}
    const rate = forcedRate('mt', date);
    return { hours:h, adjustedHours:h, amount:Math.round(h * rate), rate, sellerType:'MT', receiverType:'MT' };
  }
  function rateOptions(selected){
    const legacy = (selected === 'receiver' || selected === 'owner') ? `<option value="${esc(selected)}" selected>รายการเดิม: ${esc(niceRate(selected))}</option>` : '';
    return `${legacy}<option value="mt" ${selected==='mt'?'selected':''}>ขายเรท MT</option><option value="kerk" ${selected==='kerk'?'selected':''}>ขายเรทเคิก</option><option value="custom" ${selected==='custom'?'selected':''}>กำหนดจำนวนเงินเอง / 0 บาทได้</option>`;
  }
  function findAssignment(id, list){
    const rows = list || state?.rosterAssignments || [];
    return rows.find(a => String(a?.id || '') === String(id || '')) || null;
  }
  // V548: roster rows can be re-created after a trade was completed, which changes the
  // roster_assignment id while the trade request still points to the old id. Every V217
  // request already stores SELL_DATE / SELL_DUTY snapshots, so use those snapshots as a
  // safe fallback. requester_id must still equal the current slot owner to avoid binding
  // an old whole-shift transfer to a slot that has already moved to the receiver.
  function tradeSnapshot(note,key){
    const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i'));
    if(!m?.[1])return '';
    try{return decodeURIComponent(m[1]);}catch(_){return m[1];}
  }
  function tradeMatchesAssignment(r,a){
    if(!r||!a)return false;
    if(String(r?.from_assignment_id||'')===String(a?.id||''))return true;
    const date=normDate(tradeSnapshot(r?.note,'SELL_DATE'));
    const duty=String(tradeSnapshot(r?.note,'SELL_DUTY')||'').trim();
    return !!date && date===normDate(a?.duty_date)
      && !!duty && duty===String(a?.duty_code||'').trim()
      && String(r?.requester_id||'')===String(a?.staff_id||'');
  }
  function completedTradesForAssignment(a){
    if (!a?.id) return [];
    return (state?.tradeRequests || [])
      .filter(r => String(r?.status || '') === 'completed' && tradeMatchesAssignment(r,a))
      .map(r => {
        const spec=tradeSpecFromNote(r?.note,a);
        return {r,spec,part:spec.part,hours:spec.hours,intervals:spec.intervals||[]};
      })
      .filter(x => x.hours < assignmentFullHours(a)-0.01);
  }
  function activeTradePartsForAssignment(a, excludeRequestId=''){
    if (!a?.id) return [];
    return (state?.tradeRequests || [])
      .filter(r => tradeMatchesAssignment(r,a))
      .filter(r => String(r?.id || '') !== String(excludeRequestId || ''))
      .filter(r => !['rejected','completed_deleted','cancelled','canceled'].includes(String(r?.status || '').toLowerCase()))
      .map(r => {
        const spec=tradeSpecFromNote(r?.note,a);
        return {r,spec,part:spec.part,hours:spec.hours,intervals:spec.intervals||[]};
      })
      .filter(x => x.hours < assignmentFullHours(a)-0.01);
  }
  function selectedSpecConflicts(spec, a, excludeRequestId=''){
    const existing = activeTradePartsForAssignment(a, excludeRequestId);
    if (!existing.length) return '';
    if ((spec?.hours||0) >= assignmentFullHours(a)-0.01) return 'ช่องนี้มีรายการขายบางช่วงอยู่แล้ว กรุณาเลือกเฉพาะเวลาที่ยังไม่ได้ขาย';
    const hit=existing.find(x=>(x.intervals||[]).some(i=>(spec?.intervals||[]).some(j=>intervalsOverlap(i,j))));
    if(hit)return `ช่วง ${hit.spec?.label||'ที่เลือก'} มีรายการขายอยู่แล้ว กรุณาเลือกเวลาอื่น`;
    return '';
  }
  function segmentLabel(segments){
    const unique = [];
    (segments || []).forEach(s => { if (!unique.includes(s)) unique.push(s); });
    const orderedSegs = SEGMENT_ORDER.filter(s => unique.includes(s));
    if (unique.includes('night') && unique.includes('morning') && !unique.includes('afternoon')) return 'ดึก-เช้า';
    return orderedSegs.map(s => SEGMENT_LABEL[s] || s).join('-') || '-';
  }
  function remainingIntervalsFor(a,trades){
    const w=assignmentWindow(a);
    const removed=(trades||[]).flatMap(x=>x.intervals||x.spec?.intervals||[]);
    return subtractIntervals([w.start,w.end],removed);
  }
  function remainingLabelFor(a, trades){
    const full = assignmentFullHours(a);
    const soldHours = trades.reduce((sum, x) => sum + Number(x.hours || 0), 0);
    const remainHours = Math.max(0, Math.round((full - soldHours)*100)/100);
    if (remainHours <= 0.01) return '';
    if (remainHours >= full-0.01) return labelDuty(a.duty_code);
    return `เหลือ ${hoursText(remainHours)} ชม.`;
  }
  function entryLabelForReceived(part, a, spec=null){
    if(spec?.custom)return `รับช่วง ${spec.label||`${hoursText(spec.hours)} ชม.`}`;
    const cfg = PARTS[part] || PARTS[defaultPartFor(a)];
    return `รับช่วง ${cfg.short || cfg.label || 'เวร'}`;
  }
  function baseSegmentsForAssignment(a){
    const full=assignmentFullHours(a);
    if(full>=24)return ['morning','afternoon','night'];
    if(full>=16)return ['afternoon','night'];
    return ['morning'];
  }
  function remainingSegmentsFor(a,trades){
    if((trades||[]).some(x=>x.spec?.custom))return ['custom'];
    const sold=new Set();
    (trades||[]).forEach(x=>(PARTS[x.part]?.segments||[]).forEach(s=>sold.add(s)));
    return baseSegmentsForAssignment(a).filter(s=>!sold.has(s));
  }
  function effectiveEntriesForStaffDate(staffId, date, assignments){
    const d = normDate(date);
    const rows = [];
    const sourceRows = (assignments || []).filter(a => normDate(a?.duty_date) === d && a?.staff_id);
    sourceRows.forEach(a => {
      const trades = completedTradesForAssignment(a);
      if (String(a.staff_id) === String(staffId)) {
        if (trades.length) {
          const label = remainingLabelFor(a, trades);
          const full=assignmentFullHours(a),soldHours=trades.reduce((sum,x)=>sum+Number(x.hours||0),0),hours=Math.max(0,full-soldHours),segments=remainingSegmentsFor(a,trades);
          const timeLabel=exactTimeLabel(remainingIntervalsFor(a,trades));
          if (label) rows.push({ kind:'owner-remain', assignment:a, label, timeLabel, hours, segments, trades, sort:sortDuty(a.duty_code), className:'v217-remain' });
        } else {
          const w=assignmentWindow(a);
          rows.push({ kind:'owner', assignment:a, label:labelDuty(a.duty_code), timeLabel:intervalText(w.start,w.end), hours:assignmentFullHours(a), segments:baseSegmentsForAssignment(a), sort:sortDuty(a.duty_code), className:'' });
        }
      }
      trades.forEach(x => {
        if (String(x.r?.receiver_id || '') === String(staffId)) {
          const segments=x.spec?.custom?['custom']:[...(PARTS[x.part]?.segments||[])];
          rows.push({ kind:'receiver-part', assignment:a, request:x.r, part:x.part, spec:x.spec, label:entryLabelForReceived(x.part,a,x.spec), timeLabel:x.spec?.label||'', hours:Number(x.hours||0), segments, sort:sortDuty(a.duty_code) + 0.1, className:'v217-received' });
        }
      });
    });
    return rows.sort((a,b) => (a.sort - b.sort) || String(a.label).localeCompare(String(b.label), 'th'));
  }
  function effectiveAssignmentsForStaffDate(staffId,date,assignments){
    return effectiveEntriesForStaffDate(staffId,date,assignments).map(e=>({
      ...e.assignment,
      staff_id:staffId,
      _effective_label:e.label,
      _effective_time_label:e.timeLabel||'',
      _effective_kind:e.kind,
      _effective_hours:Number(e.hours||0),
      _effective_segments:[...(e.segments||[])],
      _effective_trade_request_id:e.request?.id||''
    }));
  }
  function tradePartsInSlot(a){
    const trades = completedTradesForAssignment(a);
    if (!trades.length) return null;
    const remain = remainingLabelFor(a, trades);
    return { trades, remain };
  }
  function staffStatAttrs(staffId){ return `data-staff-stat="${esc(staffId)}" type="button"`; }
  function pillFor(staffId, attrs=''){
    try { return staffPill(staffId, { button:true, attrs }); }
    catch (_) { return `<button type="button" ${attrs}>${esc(staffId || '-')}</button>`; }
  }
  function tradeButtonSafe(a){
    try { return renderTradeButton(a); }
    catch (_) { return ''; }
  }

  window.tradePaymentDisplay = function tradePaymentDisplayV217(r, from, to=null){
    const a = from || findAssignment(r?.from_assignment_id) || {};
    const spec=tradeSpecFromNote(r?.note,a);
    const p = calcPayment(a, r?.requester_id, r?.receiver_id, r?.rate_mode || 'mt', spec.part, r?.amount_from || 0);
    if(spec?.custom){ p.hours=spec.hours; p.adjustedHours=spec.hours; if((r?.rate_mode||'mt')!=='custom') p.amount=Math.round(spec.hours*forcedRate(r?.rate_mode||'mt',a?.duty_date||'')); }
    const amount = Number(r?.amount_from ?? p.amount ?? 0);
    let html = `${money(amount)}`;
    const sellLabel=spec?.custom?`ขาย ${spec.label}`:partLabel(spec.part,a,r?.note);
    html += `<br><span class="muted">${esc(sellLabel)} • ${hoursText(spec.hours)} ชม. • ${esc(niceRate(r?.rate_mode || 'mt'))}</span>`;
    if (String(r?.status || '') === 'completed' && spec.hours < assignmentFullHours(a)-0.01) html += `<br><span class="badge blue">โอนเฉพาะช่วง</span>`;
    if (to && Number(r?.amount_diff || 0)) html += `<br><span class="muted">ส่วนต่าง ${Number(r.amount_diff || 0).toLocaleString()} บ.</span>`;
    return html;
  };
  try { tradePaymentDisplay = window.tradePaymentDisplay; } catch (_) {}

  window.selfPaidTradeNotice = function selfPaidTradeNoticeV217(){ return ''; };
  try { selfPaidTradeNotice = window.selfPaidTradeNotice; } catch (_) {}

  window.showTradeModal = function showTradeModalV217(assignmentId, existingRequest=null){
    const sourceRows = (() => {
      try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; }
    })();
    const slot = findAssignment(assignmentId, sourceRows) || findAssignment(assignmentId, state?.rosterAssignments || []);
    if (!slot) return toast('ไม่พบเวรนี้ กรุณารีเฟรชหน้า', 'error');
    const editing = !!existingRequest?.id;
    const requesterValue = editing ? existingRequest.requester_id : (admin() ? '' : slot.staff_id);
    const receiverValue = editing ? existingRequest.receiver_id : '';
    const existingSpec=editing?tradeSpecFromNote(existingRequest.note,slot):null;
    const w=assignmentWindow(slot);
    const startValue=existingSpec?.intervals?.length===1?clockText(existingSpec.intervals[0][0]):clockText(w.start);
    const endValue=existingSpec?.intervals?.length===1?clockText(existingSpec.intervals[0][1]):clockText(w.end);
    const rateValue = editing ? (existingRequest.rate_mode || defaultRateMode(requesterValue || slot.staff_id, slot)) : defaultRateMode(slot.staff_id, slot);
    const customValue = editing && rateValue === 'custom' ? Number(existingRequest.amount_from || 0) : '';
    const staffRows = activeRosterStaff();
    const possibleRequester = staffRows;
    const possibleReceiver = staffRows.filter(s => String(s.id) !== String(slot.staff_id));
    const requesterControl = admin()
      ? `<label class="wide">ผู้ขายเวร<select name="requester_id" id="tradeRequesterSelect" required><option value="">เลือกผู้ขายเวร</option>${possibleRequester.map(s => `<option value="${esc(s.id)}" ${String(requesterValue)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('')}</select></label>`
      : `<input type="hidden" name="requester_id" value="${esc(slot.staff_id)}">`;
    const body = `<h2>${editing ? 'แก้ไขคำขอขายเวร' : 'ขอขายเวร'}</h2>
      <p class="hint v217-trade-summary">${formatThaiDate(slot.duty_date)} • ${esc(labelDuty(slot.duty_code))} • ${staffPill(slot.staff_id)}</p>
      <form id="dutyTradeForm" class="form-grid v507-trade-form" data-v217-trade-form="1" data-assignment-id="${esc(slot.id)}">
        <input type="hidden" name="from_assignment_id" value="${esc(slot.id)}">
        <input type="hidden" name="trade_type" value="ขายเวร">
        ${editing ? `<input type="hidden" name="trade_request_id" value="${esc(existingRequest.id)}">` : ''}
        ${requesterControl}
        <label class="wide">ผู้รับเวร<select name="receiver_id" id="tradeReceiverSelect" required><option value="">เลือกคน</option>${possibleReceiver.map(s => `<option value="${esc(s.id)}" ${String(receiverValue)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('')}</select></label>
        <div class="wide v507-time-grid">
          <label>เริ่มขาย<input name="sell_start" id="tradeSellStart" type="time" step="1800" value="${esc(startValue)}" required></label>
          <label>สิ้นสุด<input name="sell_end" id="tradeSellEnd" type="time" step="1800" value="${esc(endValue)}" required></label>
        </div>
        <span class="hint wide v507-short-hint">เลือกขายได้ตามเวลาจริง เช่น 17:00–19:00</span>
        <label>คิดเรท<select name="rate_mode" id="tradeRateSelect">${rateOptions(rateValue)}</select></label>
        <label id="tradeCustomWrap">จำนวนเงิน<input name="custom_amount" id="tradeCustomAmount" type="number" min="0" step="1" value="${esc(customValue)}" placeholder="0"></label>
        <div class="notice soft-notice wide v507-estimate" id="tradeEstimateV217">กำลังคำนวณ...</div>
        <label class="wide">หมายเหตุ <textarea name="note" rows="2" placeholder="ไม่จำเป็นต้องกรอก">${esc(stripMarkers(existingRequest?.note || ''))}</textarea></label>
        <button class="primary-btn wide" type="submit">${editing ? 'บันทึกการแก้ไข' : 'ส่งให้อีกฝ่ายยืนยัน'}</button>
      </form>`;
    try { showModal(body, { large:true }); } catch (_) { document.body.insertAdjacentHTML('beforeend', body); }
    setTimeout(() => updateEstimate(document.getElementById('dutyTradeForm')), 20);
  };
  try { showTradeModal = window.showTradeModal; } catch (_) {}

  function updateEstimate(form){
    if (!form) return;
    const slotId = form.querySelector('[name="from_assignment_id"]')?.value || form.dataset.assignmentId;
    const sourceRows = (() => { try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    const slot = findAssignment(slotId, sourceRows) || findAssignment(slotId);
    if (!slot) return;
    const requesterId = (admin() ? form.querySelector('[name="requester_id"]')?.value : currentId()) || slot.staff_id;
    const receiverId = form.querySelector('[name="receiver_id"]')?.value || slot.staff_id;
    const start=form.querySelector('[name="sell_start"]')?.value||'';
    const end=form.querySelector('[name="sell_end"]')?.value||'';
    const spec=specFromInputs(start,end,slot);
    const rateMode = form.querySelector('[name="rate_mode"]')?.value || defaultRateMode(requesterId, slot);
    const custom = Number(form.querySelector('[name="custom_amount"]')?.value || 0);
    const el = form.querySelector('#tradeEstimateV217') || form.querySelector('#tradeEstimateV205');
    if(!spec){
      if(el)el.innerHTML='<b>กรุณาเลือกเวลาให้อยู่ในช่วงเวรนี้</b>';
    }else{
      let amount=custom;
      if(rateMode!=='custom')amount=Math.round(spec.hours*forcedRate(rateMode,slot.duty_date));
      const mode=spec.hours>=assignmentFullHours(slot)-0.01?'ทั้งเวร':'บางช่วง';
      if (el) el.innerHTML = `<b>${esc(spec.label||exactTimeLabel(spec.intervals))}</b> • ${hoursText(spec.hours)} ชม. • ${esc(niceRate(rateMode))} • ${money(amount)} <span class="muted">(${mode})</span>`;
    }
    const customWrap = form.querySelector('#tradeCustomWrap');
    if (customWrap) customWrap.style.display = rateMode === 'custom' ? '' : 'none';
  }

  window.saveTradeRequest = async function saveTradeRequestV217(form){
    const fd = new FormData(form);
    const requestId = fd.get('trade_request_id') || '';
    const fromId = fd.get('from_assignment_id');
    const sourceRows = (() => { try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    const from = findAssignment(fromId, sourceRows) || findAssignment(fromId);
    const requesterId = admin() ? fd.get('requester_id') : currentId();
    const receiverId = fd.get('receiver_id');
    if (!from || !receiverId) return toast('กรุณาเลือกผู้รับเวร', 'error');
    if (admin() && !requesterId) return toast('กรุณาเลือกผู้ขายเวร', 'error');
    if (!admin() && String(from.staff_id) !== String(currentId())) return toast('ส่งคำขอได้เฉพาะเวรของตัวเอง', 'error');
    if (String(requesterId) !== String(from.staff_id)) return toast('ผู้ขายเวรไม่ตรงกับเจ้าของเวร', 'error');
    if (String(receiverId) === String(requesterId)) return toast('ผู้รับเวรต้องเป็นคนละคนกับผู้ขาย', 'error');
    const spec=specFromInputs(fd.get('sell_start'),fd.get('sell_end'),from);
    if(!spec)return toast('ช่วงเวลาที่เลือกอยู่นอกเวลาเวร หรือเวลาสิ้นสุดไม่ถูกต้อง', 'error');
    if(spec.hours<0.5)return toast('กรุณาขายอย่างน้อย 30 นาที', 'error');
    const conflict = selectedSpecConflicts(spec, from, requestId);
    if (conflict) return toast(conflict, 'error');
    const rateMode = fd.get('rate_mode') || defaultRateMode(requesterId, from);
    const custom = Number(fd.get('custom_amount') || 0);
    const amountFrom = rateMode === 'custom' ? custom : Math.round(spec.hours*forcedRate(rateMode,from.duty_date));
    const existing = requestId ? (state?.tradeRequests || []).find(x => String(x.id) === String(requestId)) : null;
    const row = {
      requester_id: requesterId,
      receiver_id: receiverId,
      from_assignment_id: fromId,
      to_assignment_id: null,
      trade_type: 'ขายเวร',
      rate_mode: rateMode,
      amount_from: amountFrom,
      amount_to: 0,
      amount_diff: 0,
      status: existing?.status || 'pending',
      note: buildNote(spec, from, fd.get('note') || ''),
      updated_by: currentId()
    };
    let error;
    if (requestId) ({ error } = await sb.from('roster_trade_requests').update(row).eq('id', requestId));
    else ({ error } = await sb.from('roster_trade_requests').insert({ ...row, created_by: currentId() }));
    if (error) return toast(friendlyDbError(error), 'error');
    try { closeModal(); } catch (_) {}
    try { await loadAllData(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(requestId ? 'แก้ไขคำขอขายเวรแล้ว' : 'ส่งคำขอขายเวรแล้ว รออีกฝ่ายยืนยัน');
  };
  try { saveTradeRequest = window.saveTradeRequest; } catch (_) {}

  window.applyTradeRequest = async function applyTradeRequestV217(id){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const r = (state?.tradeRequests || []).find(x => String(x.id) === String(id));
    if (!r || !['pending','confirmed'].includes(String(r.status || ''))) return toast('คำขอนี้ยังไม่พร้อมให้บันทึก', 'error');
    const from = findAssignment(r.from_assignment_id);
    if (!from) return toast('ไม่พบเวรต้นทาง', 'error');
    const spec = tradeSpecFromNote(r.note, from);
    const part = spec.part;
    const isWhole = spec.hours >= assignmentFullHours(from) - 0.01;
    const override = String(r.status || '') === 'pending';
    if (override) {
      let ok = false;
      try { ok = await confirmDialog('ยืนยันรายการนี้แบบ Admin Override โดยไม่รอคู่กรณีตอบรับ?', 'Admin Override'); }
      catch (_) { ok = window.confirm('ยืนยันรายการนี้แบบ Admin Override โดยไม่รอคู่กรณีตอบรับ?'); }
      if (!ok) return;
    }
    const completedPatch = { status:'completed', updated_by:currentId(), confirmed_at:r.confirmed_at || new Date().toISOString() };
    if (override) {
      try { completedPatch.note = adminOverrideNote(r.note); }
      catch (_) { completedPatch.note = `${r.note || ''} [ADMIN_OVERRIDE]`.trim(); }
    }
    if (isWhole) {
      const res = await sb.from('roster_assignments').update({ staff_id:r.receiver_id, updated_by:currentId() }).eq('id', from.id);
      if (res.error) return toast(friendlyDbError(res.error), 'error');
    }
    const { error } = await sb.from('roster_trade_requests').update({ ...completedPatch, trade_type:'ขายเวร', to_assignment_id:null, amount_to:0, amount_diff:0 }).eq('id', id);
    if (error) return toast(friendlyDbError(error), 'error');
    try { await loadAllData(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(isWhole ? (override ? 'Admin Override และบันทึกขายเวรแล้ว' : 'บันทึกขายเวรแล้ว') : 'บันทึกขายเวรเฉพาะช่วงแล้ว ตารางจะแสดงเฉพาะช่วงที่โอนให้ผู้รับเวร');
  };
  try { applyTradeRequest = window.applyTradeRequest; } catch (_) {}

  window.selfPaidDutyProxyOptions = function selfPaidDutyProxyOptionsV217(date=todayStr()){
    const d = normDate(date);
    const me = currentId();
    return (state?.tradeRequests || []).filter(r => String(r?.status || '') === 'completed' && String(r?.receiver_id || '') === String(me)).map(r => {
      const a = findAssignment(r.from_assignment_id);
      if (!a || normDate(a.duty_date) !== d) return null;
      const spec = tradeSpecFromNote(r.note, a);
      const part = spec.part;
      if (spec.hours >= assignmentFullHours(a)-0.01) return null;
      return { request:r, assignment:{ ...a, staff_id:r.receiver_id, _original_staff_id:r.requester_id, _sell_part:part, _sell_label:entryLabelForReceived(part, a, spec), _effective_time_label:spec.label||'' } };
    }).filter(Boolean);
  };
  try { selfPaidDutyProxyOptions = window.selfPaidDutyProxyOptions; } catch (_) {}

  window.scheduleShiftButton = function scheduleShiftButtonV217(slot){
    if (!slot?.staff_id) return '';
    const split = tradePartsInSlot(slot);
    if (!split) return `<div class="schedule-person-cell">${pillFor(slot.staff_id, staffStatAttrs(slot.staff_id))}${tradeButtonSafe(slot)}</div>`;
    const lines = [];
    if (split.remain) lines.push(`<span class="v217-split-line v217-remain"><b>${esc(split.remain)}</b>${pillFor(slot.staff_id, staffStatAttrs(slot.staff_id))}</span>`);
    split.trades.forEach(x => {
      const label = entryLabelForReceived(x.part, slot, x.spec);
      lines.push(`<span class="v217-split-line v217-received"><b>${esc(label)}</b>${pillFor(x.r.receiver_id, staffStatAttrs(x.r.receiver_id))}</span>`);
    });
    return `<div class="schedule-person-cell v217-split-cell">${lines.join('')}${tradeButtonSafe(slot)}</div>`;
  };
  try { scheduleShiftButton = window.scheduleShiftButton; } catch (_) {}

  const oldRenderCalendarCardView = window.renderCalendarCardView || (typeof renderCalendarCardView === 'function' ? renderCalendarCardView : null);
  window.renderCalendarCardView = function renderCalendarCardViewV217(staffList, assignments, key=state.monthKey){
    const dates = monthDates(key);
    const mobile = (() => { try { return isMobileView(); } catch (_) { return false; } })();
    const defaultDate = todayStr().startsWith(key) ? todayStr() : dates[0];
    const selectedDate = dates.includes(state.scheduleSelectedDate) ? state.scheduleSelectedDate : defaultDate;
    const visibleDates = mobile ? [selectedDate] : dates;
    const controls = mobile ? `<div class="single-day-control no-print"><label>เลือกวันที่ <input type="date" id="scheduleSelectedDate" min="${esc(dates[0])}" max="${esc(dates[dates.length-1])}" value="${esc(selectedDate)}"></label><button class="tiny-btn" data-schedule-today>วันนี้</button></div>` : '';
    return `${controls}<div class="clean-calendar-cards ${mobile ? 'single-day-cards' : ''}">${visibleDates.map(date => {
      const d = parseDate(date);
      const rows = (assignments || []).filter(a => normDate(a.duty_date) === date && a.staff_id).sort((a,b)=>sortDuty(a.duty_code)-sortDuty(b.duty_code));
      const dayOff = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
      return `<section class="clean-day-card ${dayOff ? 'is-offday' : ''}">
        <div class="clean-day-head"><b>${d.getDate()}</b><span>${d.toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short' })}</span>${(() => { try { return isHolidayDate(date) ? badge(holidayName(date), 'yellow') : ''; } catch (_) { return ''; } })()}</div>
        ${rows.length ? rows.map(a => `<div class="clean-day-line"><span>${esc(labelDuty(a.duty_code))}</span>${window.scheduleShiftButton(a)}</div>`).join('') : '<span class="muted">ไม่มีเวร</span>'}
      </section>`;
    }).join('')}</div>`;
  };
  try { renderCalendarCardView = window.renderCalendarCardView; } catch (_) { if (!oldRenderCalendarCardView) {} }

  window.renderPersonView = function renderPersonViewV217(staffList, assignments, key=state.monthKey){
    const selectedId = state.schedulePersonFilter || staffList?.[0]?.id || '';
    const selected = (staffList || []).find(st => String(st.id) === String(selectedId)) || staffList?.[0];
    const renderCard = (st) => {
      const rows = monthDates(key).flatMap(date => effectiveEntriesForStaffDate(st?.id, date, assignments));
      return `<section class="clean-person-card" style="--staff-bg:${staffColor(st)};--staff-fg:${textColorFor(staffColor(st))}">
        <button type="button" class="clean-person-head" data-staff-stat="${esc(st?.id)}"><b>${esc(st?.nickname || st?.full_name || '-')}</b><span>${rows.length} รายการ</span></button>
        ${rows.length ? rows.map(e => `<div class="clean-person-duty ${esc(e.className || '')}"><span>${formatThaiDate(e.assignment?.duty_date)}</span><b>${esc(e.label)}</b>${e.kind === 'owner' || e.kind === 'owner-remain' ? tradeButtonSafe(e.assignment) : '<span class="badge blue">รับช่วงขายเวร</span>'}</div>`).join('') : '<span class="muted">ไม่มีเวรเดือนนี้</span>'}
      </section>`;
    };
    return `<div class="person-filter-mobile no-print"><label>เลือกเจ้าหน้าที่ <select id="schedulePersonFilter">${(staffList || []).map(st => `<option value="${esc(st.id)}" ${String(selected?.id)===String(st.id)?'selected':''}>${esc(st.nickname || st.full_name || '-')}</option>`).join('')}</select></label></div>
    <div class="clean-person-mobile-result">${selected ? renderCard(selected) : empty('ไม่มีเจ้าหน้าที่')}</div>
    <div class="clean-person-list">${(staffList || []).map(renderCard).join('')}</div>`;
  };
  try { renderPersonView = window.renderPersonView; } catch (_) {}

  window.renderGridView = function renderGridViewV217(staffList, assignments, key=state.monthKey){
    const dates = monthDates(key);
    return `<div class="table-wrap clean-grid-wrap"><table id="scheduleTable" class="clean-schedule-grid"><thead><tr><th class="clean-sticky-col">เจ้าหน้าที่</th>${dates.map(date => {
      const d = parseDate(date);
      const off = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
      return `<th class="${off ? 'offday-col' : ''}">${d.getDate()}<br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('')}</tr></thead><tbody>${(staffList || []).map(st => {
      const bg = staffColor(st);
      const fg = textColorFor(bg);
      return `<tr><th class="clean-sticky-col clean-staff-cell" style="--staff-bg:${bg};--staff-fg:${fg}"><button type="button" data-staff-stat="${esc(st.id)}">${esc(st.nickname || st.full_name || '-')}</button></th>${dates.map(date => {
        const shifts = effectiveEntriesForStaffDate(st.id, date, assignments);
        const off = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
        const leave = (() => { try { return activeLeaveRecordOn(st.id, date); } catch (_) { return null; } })();
        const leaveCls = leave ? (() => { try { return leaveCellClass(leaveDisplayType(leave)); } catch (_) { return ''; } })() : '';
        const leaveBadge = leave ? (() => { try { return leaveCellBadge(leave); } catch (_) { return '<span class="badge yellow">ลา</span>'; } })() : '';
        const pills = shifts.map(e => {
          const attrs = (e.kind === 'owner' || e.kind === 'owner-remain') && (() => { try { return canRequestTrade(e.assignment); } catch (_) { return false; } })()
            ? `data-trade-duty="${esc(e.assignment.id)}"`
            : `data-staff-stat="${esc(st.id)}"`;
          return `<button type="button" class="clean-shift-pill ${esc(e.className || '')}" style="--staff-bg:${bg};--staff-fg:${fg}" ${attrs}>${esc(e.label)}</button>`;
        }).join('');
        return `<td class="${off ? 'offday-col' : ''} ${leaveCls}"><div class="clean-cell-stack">${leaveBadge}${pills || (off && !leave ? '<span class="muted">หยุด</span>' : '')}</div></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
  };
  try { renderGridView = window.renderGridView; } catch (_) {}

  window.renderReadOnlySchedule = function renderReadOnlyScheduleV217(assignments){
    const staffList = (() => { try { return scheduleStaffList(); } catch (_) { return activeRosterStaff(); } })();
    const rows = assignments || (() => { try { return scheduleAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    return window.renderGridView(staffList, rows, state.monthKey);
  };
  try { renderReadOnlySchedule = window.renderReadOnlySchedule; } catch (_) {}

  const oldShowStaffStats = window.showStaffStats || (typeof showStaffStats === 'function' ? showStaffStats : null);
  window.showStaffStats = function showStaffStatsV217(staffId){
    try {
      const assignments = (() => { try { return scheduleAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
      const rows = monthDates(state.monthKey).flatMap(date => effectiveEntriesForStaffDate(staffId, date, assignments));
      const detail = rows.map(e => `<tr><td>${formatThaiDate(e.assignment?.duty_date)}</td><td>${esc(e.label)}</td><td>${e.kind === 'receiver-part' ? 'รับช่วงขายเวร' : 'เจ้าของเวร/ช่วงคงเหลือ'}</td></tr>`).join('');
      showModal(`<h2>${staffPill(staffId)}</h2><p class="hint">ตารางนี้แสดงผลหลังหักรายการขายเวรเฉพาะช่วงแล้ว</p><div class="compact-detail-table"><table><thead><tr><th>วันที่</th><th>เวร/ช่วง</th><th>สถานะ</th></tr></thead><tbody>${detail || '<tr><td colspan="3">ยังไม่มีเวรในเดือนนี้</td></tr>'}</tbody></table></div>`);
    } catch (err) {
      if (oldShowStaffStats) return oldShowStaffStats.apply(this, arguments);
      console.warn(`${VERSION}: showStaffStats failed`, err);
    }
  };
  try { showStaffStats = window.showStaffStats; } catch (_) {}

  document.addEventListener('input', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v217-trade-form="1"]');
    if (!form) return;
    if (['sell_start','sell_end','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateEstimate(form);
  }, true);
  document.addEventListener('change', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v217-trade-form="1"]');
    if (!form) return;
    if (['sell_start','sell_end','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateEstimate(form);
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v217-split-cell{display:flex;flex-direction:column;gap:6px;align-items:stretch}.v217-split-line{display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid rgba(37,99,235,.18);border-radius:12px;padding:4px 6px;background:#fff}.v217-split-line>b{font-size:12px;white-space:nowrap}.v217-split-line.v217-received{background:#eef8ff;border-color:#bfe4ff}.v217-split-line.v217-remain{background:#fffdf4;border-color:#f7e6a1}.clean-shift-pill.v217-received{outline:2px solid rgba(14,165,233,.35);background:#e0f2fe!important;color:#075985!important}.clean-shift-pill.v217-remain{outline:2px solid rgba(234,179,8,.35)}.clean-person-duty.v217-received{background:#eef8ff;border-radius:12px;padding:6px 8px}.clean-person-duty.v217-remain{background:#fffdf4;border-radius:12px;padding:6px 8px}
    .v507-trade-form{row-gap:12px}.v507-time-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v507-time-grid label{margin:0}.v507-short-hint{margin-top:-6px}.v507-estimate{padding:10px 12px}.v217-trade-summary{margin-top:-4px}
    @media(max-width:640px){.v507-time-grid{grid-template-columns:1fr 1fr}.v507-trade-form textarea{min-height:64px}.v507-estimate{font-size:14px}}
  `;
  document.head.appendChild(style);

  window.cnmiTradeSegmentsV549 = window.cnmiTradeSegmentsV217 = { PARTS, partFromNote, partHours, coversWholeSlot, tradeSpecFromNote, assignmentWindow, effectiveEntriesForStaffDate, effectiveAssignmentsForStaffDate };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v549-trade-effective-roster.js", error); }
;

/* Original source: patch-v220-ot-approval-position-slots-final.js */
try {
/* =========================
   V220 OT approval repair + Position slot details final
   - Load this file LAST in index.html.
   - Fixes cached app.js issue by cache-busting index and runs after external patches.
   - Creates missing pending OT rows when attendance_logs already exists.
   - Shows detailed daytime slot templates 10-14 people in Admin > จัดการตำแหน่ง.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V220_OT_APPROVAL_POSITION_SLOTS_FINAL';
  if (window.__CNMI_V220_OT_APPROVAL_POSITION_SLOTS_FINAL__) return;
  window.__CNMI_V220_OT_APPROVAL_POSITION_SLOTS_FINAL__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const normDate = (v) => {
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  };
  const today = () => {
    try { return todayStr(); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  };
  const toast = (msg, tone) => {
    try { showToast(msg, tone ? { tone } : undefined); }
    catch (_) { console.info(msg); }
  };
  const friendly = (err) => {
    try { return friendlyDbError(err); }
    catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); }
  };
  const currentSid = () => {
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  };
  const isAdminSafe = () => {
    try { return isAdmin(); }
    catch (_) { return false; }
  };
  const staffName = (id) => {
    try { return staffNick(id); }
    catch (_) { return String(id || '-'); }
  };
  const badgeHtml = (text, cls='blue') => {
    try { return badge(text, cls); }
    catch (_) { return `<span class="badge ${esc(cls)}">${esc(text)}</span>`; }
  };
  function addDays(date, n){
    const d = new Date(`${normDate(date)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return normDate(date);
    d.setDate(d.getDate() + Number(n || 0));
    try { return toDateInput(d); }
    catch (_) { return d.toISOString().slice(0,10); }
  }
  function dutyLabel(code){
    try { return (DUTY_LABEL && DUTY_LABEL[code]) || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function isManualDuty(code){
    const c = String(code || '').trim();
    return c === 'ช4' || c === 'ช4A' || c === 'ช4B';
  }
  function dutiesOn(staffId, date){
    const d = normDate(date);
    return (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && normDate(a?.duty_date) === d)
      .sort((a,b) => {
        try { return dutySortIndex(a?.duty_code) - dutySortIndex(b?.duty_code); }
        catch (_) { return String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'); }
      });
  }
  function hasAutoDuty(staffId, date){
    const list = dutiesOn(staffId, date);
    if (!list.length) return true; // attendance_logs is already a confirmation signal; keep legacy/admin cases visible.
    return list.some(a => !isManualDuty(a?.duty_code));
  }
  function isAttendanceOtReason(row){
    const text = `${row?.reason || ''} ${row?.note || ''}`;
    return /ยืนยันอยู่เวร|รับ OT|อยู่เวรตามตาราง|สร้างจากส่วนที่ 1/i.test(text);
  }
  function attendanceOtRows(staffId, date){
    const d = normDate(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && normDate(r?.work_date) === d && isAttendanceOtReason(r));
  }
  function attendanceRowsFor(staffId, date){
    const d = normDate(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && normDate(a?.duty_date) === d);
  }
  function findMissingAttendanceOtRows({ allInRange=false }={}){
    const start = normDate(state.otApprovalStartDate || `${today().slice(0,7)}-01`);
    const end = normDate(state.otApprovalEndDate || addDays(start, 40));
    const me = currentSid();
    const map = new Map();
    (state.attendance || []).forEach(a => {
      const staffId = a?.staff_id;
      const d = normDate(a?.duty_date);
      if (!staffId || !d) return;
      if (!isAdminSafe() && String(staffId) !== String(me)) return;
      if (isAdminSafe() && allInRange && start && d < start) return;
      if (isAdminSafe() && allInRange && end && d > end) return;
      if (!isAdminSafe() && d !== today()) return;
      if (attendanceOtRows(staffId, d).length) return;
      if (!hasAutoDuty(staffId, d)) return;
      map.set(`${staffId}|${d}`, { staffId, date:d, attendance:a });
    });
    return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date) || staffName(a.staffId).localeCompare(staffName(b.staffId), 'th'));
  }
  async function existsAttendanceOtInDb(staffId, date){
    try {
      const res = await sb.from('ot_requests')
        .select('id,status,reason,note,work_date,staff_id,created_at')
        .eq('staff_id', staffId)
        .eq('work_date', date)
        .ilike('reason', '%ยืนยันอยู่เวร%')
        .limit(1);
      if (!res.error && (res.data || []).length) return res.data[0];
    } catch (_) {}
    return null;
  }
  function otNoteFor(staffId, date, source){
    const duties = dutiesOn(staffId, date).filter(a => !isManualDuty(a?.duty_code));
    const labels = duties.map(a => dutyLabel(a.duty_code)).filter(Boolean).join(', ');
    let incharge = false;
    try { incharge = String(currentInchargeForMonth(date.slice(0,7))) === String(staffId); } catch (_) {}
    const base = incharge
      ? 'ระบบคิด OT อินชาร์จประจำเดือน 8 ชั่วโมงอัตโนมัติ'
      : `สร้างจากส่วนที่ 1 ยืนยันอยู่เวร${labels ? ` | เวรที่คิดอัตโนมัติ: ${labels}` : ''}`;
    return `${base} | ${source || 'ซ่อมจาก attendance_logs'} | ${VERSION}`.slice(0, 900);
  }
  async function insertMissingAttendanceOt(staffId, date, source){
    const d = normDate(date);
    if (!staffId || !d) throw new Error('ข้อมูลเจ้าหน้าที่หรือวันที่ไม่ครบ');
    const inState = attendanceOtRows(staffId, d)[0];
    if (inState) return inState;
    const inDb = await existsAttendanceOtInDb(staffId, d);
    if (inDb) return inDb;
    const base = {
      staff_id: staffId,
      work_date: d,
      start_time: '08:00',
      end_date: addDays(d, 1),
      end_time: '08:00',
      reason: 'ยืนยันอยู่เวรตามตาราง',
      note: otNoteFor(staffId, d, source),
      status: 'รออนุมัติ',
      lat: null,
      lng: null,
      accuracy: null,
      device: `${navigator.userAgent || 'browser'} | ${VERSION}`.slice(0, 250)
    };
    const attempts = [
      { ...base },
      (() => { const p = { ...base }; delete p.end_date; return p; })(),
      (() => { const p = { ...base }; delete p.start_time; delete p.end_date; return p; })(),
      (() => { const p = { ...base }; delete p.start_time; delete p.end_date; delete p.lat; delete p.lng; delete p.accuracy; return p; })()
    ];
    let lastError = null;
    for (const payload of attempts) {
      const res = await sb.from('ot_requests').insert(payload).select('*').maybeSingle();
      if (!res.error) {
        const row = res.data || payload;
        try { state.otRequests = [row, ...(state.otRequests || [])]; } catch (_) {}
        return row;
      }
      lastError = res.error;
      const msg = String(res.error?.message || '');
      if (!/column|schema|cache|start_time|end_date|lat|lng|accuracy/i.test(msg)) break;
    }
    throw lastError || new Error('สร้างรายการ OT ไม่สำเร็จ');
  }
  async function repairMissingAttendanceOt(rows, source){
    const targets = rows || findMissingAttendanceOtRows({ allInRange:isAdminSafe() });
    if (!targets.length) return { ok:0, fail:0 };
    let ok = 0; let fail = 0; const errors = [];
    for (const t of targets) {
      try { await insertMissingAttendanceOt(t.staffId, t.date, source); ok += 1; }
      catch (err) { fail += 1; errors.push(err); console.warn(`${VERSION}: repair failed`, t, err); }
    }
    return { ok, fail, errors };
  }
  let autoRepairTimer = null;
  let autoRepairRunning = false;
  function scheduleAutoRepair(){
    if (state?.page !== 'ot') return;
    if (autoRepairTimer) clearTimeout(autoRepairTimer);
    autoRepairTimer = setTimeout(async () => {
      if (autoRepairRunning || state?.page !== 'ot') return;
      const targets = findMissingAttendanceOtRows({ allInRange:isAdminSafe() });
      if (!targets.length) return;
      autoRepairRunning = true;
      try {
        const res = await repairMissingAttendanceOt(targets, 'ซ่อมอัตโนมัติเมื่อเปิดหน้า OT');
        if (res.ok) {
          await loadAllData();
          if (state.page === 'ot') renderPage();
          toast(`สร้างรายการ OT รอ Admin อนุมัติแล้ว ${res.ok} รายการ${res.fail ? ` / ไม่สำเร็จ ${res.fail}` : ''}`, res.fail ? 'error' : undefined);
        } else if (res.fail) {
          toast('ยังสร้างรายการ OT ไม่สำเร็จ: ' + friendly(res.errors?.[0]), 'error');
        }
      } finally {
        autoRepairRunning = false;
      }
    }, 250);
  }
  function repairPanelHtml(){
    const missing = findMissingAttendanceOtRows({ allInRange:isAdminSafe() });
    if (!missing.length) return '';
    const lines = missing.slice(0, 8).map(x => `${staffName(x.staffId)} • ${formatThaiDate ? formatThaiDate(x.date) : x.date}`).join('<br>');
    const more = missing.length > 8 ? `<br><span class="muted">และอีก ${missing.length - 8} รายการ</span>` : '';
    return `<div class="notice error-notice compact v220-ot-repair-panel" style="grid-column:1/-1;">
      <b>พบว่าแตะ/ลงชื่ออยู่เวรแล้ว แต่ยังไม่มีรายการ OT รออนุมัติ</b><br>
      ${lines}${more}
      <div class="actions"><button class="primary-btn" type="button" data-repair-attendance-ot-v220>สร้างรายการ OT รออนุมัติจาก Attendance</button></div>
    </div>`;
  }

  const previousFilteredOtRows = window.filteredOtRows || (typeof filteredOtRows === 'function' ? filteredOtRows : null);
  if (previousFilteredOtRows) {
    window.filteredOtRows = filteredOtRows = function filteredOtRowsV220(rows){
      const mapped = (Array.isArray(rows) ? rows : []).map(r => {
        const s = String(r?.status || '').trim().toLowerCase();
        if (s === 'pending') return { ...r, status:'รออนุมัติ' };
        if (s === 'approved') return { ...r, status:'อนุมัติ' };
        if (s === 'rejected') return { ...r, status:'ไม่อนุมัติ' };
        return r;
      });
      return previousFilteredOtRows(mapped);
    };
  }

  const previousCheckIn = window.checkIn || (typeof checkIn === 'function' ? checkIn : null);
  if (previousCheckIn) {
    window.checkIn = checkIn = async function checkInV220(){
      const staffId = currentSid();
      const d = today();
      if (attendanceRowsFor(staffId, d).length && !attendanceOtRows(staffId, d).length && hasAutoDuty(staffId, d)) {
        try {
          await insertMissingAttendanceOt(staffId, d, 'ซ่อมจากการกดปุ่มยืนยันซ้ำ');
          await loadAllData();
          renderPage();
          toast('สร้างรายการ OT รอ Admin อนุมัติแล้ว');
        } catch (err) { toast('สร้างรายการ OT ไม่สำเร็จ: ' + friendly(err), 'error'); }
        return;
      }
      await previousCheckIn.apply(this, arguments);
      // Legacy checkIn could save attendance but fail OT; verify immediately.
      try {
        await loadAllData();
        if (attendanceRowsFor(staffId, d).length && !attendanceOtRows(staffId, d).length && hasAutoDuty(staffId, d)) {
          await insertMissingAttendanceOt(staffId, d, 'ซ่อมทันทีหลังลงชื่ออยู่เวร');
          await loadAllData();
          renderPage();
          toast('ลงชื่อแล้ว และสร้างรายการ OT รอ Admin อนุมัติแล้ว');
        }
      } catch (err) { console.warn(`${VERSION}: post check-in repair skipped`, err); }
    };
  }

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  if (previousRenderOtPage) {
    window.renderOtPage = renderOtPage = function renderOtPageV220(){
      let html = String(previousRenderOtPage.apply(this, arguments) || '');
      const panel = repairPanelHtml();
      if (panel && !html.includes('v220-ot-repair-panel')) {
        if (html.includes('ส่วนที่ 3 อนุมัติ OT')) html = html.replace(/(<div class="card wide-card"[^>]*>\s*<div class="section-title"><h3>ส่วนที่ 3 อนุมัติ OT)/, panel + '$1');
        else html = html.replace(/(<div class="card wide-card"[^>]*>\s*<div class="section-title"><h3>รายการ OT ของฉัน)/, panel + '$1');
        if (!html.includes('v220-ot-repair-panel')) html = panel + html;
      }
      scheduleAutoRepair();
      return html;
    };
  }

  // ----- Position slot detail manager -----
  const SLOT_DETAIL_FALLBACK = {
    report1: 'รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ',
    report2: 'รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ',
    approve: 'รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน',
    manualAll: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด',
    manual1Wide: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam, รูดสาย, การปั่นแยกส่วนประกอบโลหิต',
    manual2Wide: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด, การปั่นแยกส่วนประกอบโลหิต',
    manual1: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag',
    manual2: 'รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag',
    manual3: 'วัดค่า pH & Adam, การปั่นแยกส่วนประกอบโลหิต, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด',
    bbSupport: 'รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)',
    register: 'รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)',
    finger1: 'รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    finger2: 'รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น',
    main: 'รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ',
    processingFull: 'นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค',
    processingShort: 'นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด',
    preparing: 'รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค'
  };
  function slotRow(code, zone, main_rule, break_time, job_desc, sort_order){
    return { code, zone, main_rule, break_time, job_desc, sort_order, is_outing:false, is_active:true, eligibility_code:code };
  }
  function fallbackSlotSets(){
    const MT_ONLY = 'MT เท่านั้น'; const MT_TANG = 'MT หรือ แตง'; const CLERK_TANG = 'Clerk หรือ แตง'; const D = SLOT_DETAIL_FALLBACK;
    return {
      10: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual','Manual',MT_ONLY,'12:00',D.manualAll,4), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,5), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,6), slotRow('DR-Finger+Interview','Donor Room',MT_TANG,'12:00',D.finger1,7), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,8), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,9), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,10)
      ],
      11: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1Wide,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2Wide,5), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,6), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,7), slotRow('DR-Finger+Interview','Donor Room',MT_TANG,'12:00',D.finger1,8), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,9), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,10), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,11)
      ],
      12: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1Wide,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2Wide,5), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,6), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,7), slotRow('DR-Finger+Interview 1','Donor Room',MT_TANG,'12:00',D.finger1,8), slotRow('DR-Finger+Interview 2','Donor Room',MT_TANG,'12:00',D.finger2,9), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,10), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,11), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,12)
      ],
      13: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2,5), slotRow('BB-Manual 3','Manual',MT_ONLY,'12:00',D.manual3,6), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,7), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,8), slotRow('DR-Finger+Interview 1','Donor Room',MT_TANG,'12:00',D.finger1,9), slotRow('DR-Finger+Interview 2','Donor Room',MT_TANG,'12:00',D.finger2,10), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,11), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,12), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingFull,13)
      ],
      14: [
        slotRow('BB-Report 1','Blood Bank',MT_ONLY,'11:00',D.report1,1), slotRow('BB-Report 2','Blood Bank',MT_ONLY,'11:00',D.report2,2), slotRow('BB-Approve','Blood Bank',MT_ONLY,'12:00',D.approve,3), slotRow('BB-Manual 1','Manual',MT_ONLY,'11:00',D.manual1,4), slotRow('BB-Manual 2','Manual',MT_ONLY,'11:00',D.manual2,5), slotRow('BB-Manual 3','Manual',MT_ONLY,'12:00',D.manual3,6), slotRow('BB-Support','Blood Bank',CLERK_TANG,'12:00',D.bbSupport,7), slotRow('DR-Register','Donor Room',CLERK_TANG,'12:00',D.register,8), slotRow('DR-Finger+Interview 1','Donor Room',MT_TANG,'12:00',D.finger1,9), slotRow('DR-Finger+Interview 2','Donor Room',MT_TANG,'12:00',D.finger2,10), slotRow('DR-Main 1','Donor Room',MT_TANG,'12:00',D.main,11), slotRow('DR-Main 2','Donor Room',MT_TANG,'12:00',D.main,12), slotRow('DR-Processing','Donor Room',MT_ONLY,'12:00',D.processingShort,13), slotRow('DR-Preparing','Donor Room',CLERK_TANG,'12:00',D.preparing,14)
      ]
    };
  }
  function slotSets(){
    return window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || fallbackSlotSets();
  }
  function allUniqueSlotRows(){
    const map = new Map();
    [8,9,10,11,12,13,14].forEach(n => (slotSets()[n] || []).forEach(p => {
      if (!map.has(p.code)) map.set(p.code, { ...p });
    }));
    return Array.from(map.values()).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999) || String(a.code).localeCompare(String(b.code), 'th'));
  }
  function slotDetailManagerHtml(){
    const sets = slotSets();
    const selected = Number(state.daySlotPreviewSet220 || 10);
    const rows = sets[selected] || sets[10] || [];
    const buttons = [8,9,10,11,12,13,14].map(n => `<button type="button" class="${selected===n?'primary-btn':'ghost-btn'}" data-slot-set-preview-v220="${n}">${n} คน</button>`).join('');
    const tableRows = rows.map((p, idx) => `<tr><td>${idx + 1}</td><td>${esc(p.zone || '-')}</td><td><b>${esc(p.code)}</b></td><td>${esc(p.main_rule || '-')}</td><td>${esc(p.break_time || '-')}</td><td>${esc(p.job_desc || '-')}</td></tr>`).join('');
    return `<div class="card wide-card v220-slot-manager-card">
      <div class="section-title"><div><h3>ชุด Slot ตำแหน่งกลางวัน 8-14 คน</h3><p class="hint">เลือกดูชุดตามจำนวนคนทำงานจริง รายละเอียดนี้ใช้เป็น Template ของตารางตำแหน่งกลางวัน รายวัน/รายเดือน</p></div><div class="actions"><button type="button" class="soft-btn" data-seed-all-slots-v220>อัปเดตฐานข้อมูลจากชุด 8-14 ทั้งหมด</button></div></div>
      <div class="v220-slot-tabs">${buttons}</div>
      <div class="notice soft-notice compact"><b>ชุดที่เลือก:</b> ${selected} คน / ${rows.length} ตำแหน่ง — ระบบรายวันจะเลือกชุดตามจำนวนเจ้าหน้าที่ที่มาทำงานจริงอัตโนมัติ</div>
      <div class="table-wrap compact-table v220-slot-detail-table"><table><thead><tr><th>#</th><th>โซน</th><th>ตำแหน่ง</th><th>ผู้ปฏิบัติหลัก</th><th>เวลาพัก</th><th>รายละเอียดหน้าที่ประจำตำแหน่ง</th></tr></thead><tbody>${tableRows}</tbody></table></div>
      <p class="hint">ตำแหน่งที่ซ้ำเชิงหน้าที่ เช่น DR-Main 1/2 หรือ BB-Manual 1/2 แยกชื่อเพื่อให้จัดคนในระบบไม่ทับช่องกัน</p>
    </div>`;
  }
  function injectSlotManager(){
    if (state?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    root.querySelectorAll('.v218-position-slot-tools').forEach(el => el.remove());
    const existing = root.querySelector('.v220-slot-manager-card');
    if (existing) existing.outerHTML = slotDetailManagerHtml();
    else {
      const wrap = document.createElement('div');
      wrap.innerHTML = slotDetailManagerHtml();
      const target = root.querySelector('.position-management-page');
      if (target) target.prepend(wrap.firstElementChild);
      else root.prepend(wrap.firstElementChild);
    }
  }
  async function seedAllSlotsToSupabase(){
    if (!isAdminSafe()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const ok = await (typeof confirmDialog === 'function'
      ? confirmDialog('อัปเดต daily_position_masters ด้วยชุด Slot 8-14 ทั้งหมด และปิดใช้งานตำแหน่งปกติเก่าที่ไม่อยู่ในชุดนี้ใช่ไหม?', 'ยืนยันอัปเดต Slot กลางวัน')
      : Promise.resolve(window.confirm('อัปเดตชุด Slot 8-14 ทั้งหมด?')));
    if (!ok) return;
    try { setBusy(true, 'กำลังอัปเดตชุด Slot 8-14'); } catch (_) {}
    try {
      const desired = allUniqueSlotRows();
      const desiredCodes = new Set(desired.map(p => String(p.code || '').trim()).filter(Boolean));
      const existingRes = await sb.from('daily_position_masters').select('*');
      if (existingRes.error) throw existingRes.error;
      const existing = existingRes.data || [];
      const isOuting = (row) => row?.is_outing === true || String(row?.zone || '').trim() === 'ออกหน่วย' || String(row?.eligibility_code || '').startsWith('OUTING:');
      for (const row of existing) {
        const code = String(row?.code || '').trim();
        if (!isOuting(row) && code && !desiredCodes.has(code) && row.is_active !== false) {
          const r = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:currentSid() }).eq('id', row.id);
          if (r.error) throw r.error;
        }
      }
      for (const p of desired) {
        const payload = {
          code:p.code,
          zone:p.zone,
          is_outing:false,
          break_time:p.break_time || '-',
          main_rule:p.main_rule || null,
          job_desc:p.job_desc || null,
          sort_order:p.sort_order || 999,
          eligibility_code:p.eligibility_code || p.code,
          is_active:true,
          deleted_at:null,
          updated_by:currentSid()
        };
        const found = existing.find(x => String(x?.code || '').trim() === String(p.code || '').trim() && !isOuting(x));
        const res = found?.id
          ? await sb.from('daily_position_masters').update(payload).eq('id', found.id)
          : await sb.from('daily_position_masters').insert({ ...payload, created_by:currentSid() });
        if (res.error) throw res.error;
      }
      if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true });
      else if (typeof loadAllData === 'function') await loadAllData();
      renderPage();
      toast('อัปเดตฐานข้อมูลชุด Slot 8-14 ทั้งหมดแล้ว');
    } catch (err) {
      console.error(`${VERSION}: seed slots failed`, err);
      toast('อัปเดต Slot ไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { setBusy(false); } catch (_) {} }
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV220(){
      const result = previousRenderPage.apply(this, arguments);
      setTimeout(() => {
        try { injectSlotManager(); } catch (err) { console.warn(`${VERSION}: inject slot manager failed`, err); }
        try { if (state?.page === 'ot') scheduleAutoRepair(); } catch (_) {}
      }, 0);
      return result;
    };
  }

  document.addEventListener('click', function(e){
    const repairBtn = e.target?.closest?.('[data-repair-attendance-ot-v220]');
    if (repairBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      (async () => {
        try { setBusy(true, 'กำลังสร้างรายการ OT รออนุมัติ'); } catch (_) {}
        try {
          const res = await repairMissingAttendanceOt(findMissingAttendanceOtRows({ allInRange:isAdminSafe() }), 'กดปุ่มซ่อม V220');
          await loadAllData(); renderPage();
          toast(`สร้างรายการ OT รออนุมัติแล้ว ${res.ok} รายการ${res.fail ? ` / ไม่สำเร็จ ${res.fail}` : ''}`, res.fail ? 'error' : undefined);
        } catch (err) { toast('สร้างรายการ OT ไม่สำเร็จ: ' + friendly(err), 'error'); }
        finally { try { setBusy(false); } catch (_) {} }
      })();
      return;
    }
    const tab = e.target?.closest?.('[data-slot-set-preview-v220]');
    if (tab) {
      e.preventDefault(); e.stopPropagation();
      state.daySlotPreviewSet220 = Number(tab.getAttribute('data-slot-set-preview-v220')) || 10;
      injectSlotManager();
      return;
    }
    const seed = e.target?.closest?.('[data-seed-all-slots-v220]');
    if (seed) {
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      seedAllSlotsToSupabase();
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v220-slot-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px;}
    .v220-slot-detail-table table td:nth-child(6){min-width:360px;line-height:1.55;white-space:normal;}
    .v220-slot-detail-table table td:nth-child(3){min-width:150px;}
    .v220-slot-manager-card{margin-bottom:14px;}
    .v220-ot-repair-panel .actions{margin-top:10px;}
  `;
  document.head.appendChild(style);

  window.cnmiV220OtRepair = { findMissingAttendanceOtRows, repairMissingAttendanceOt, insertMissingAttendanceOt };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v220-ot-approval-position-slots-final.js", error); }
;

/* Original source: patch-v221-duty-date-slot-edit-month-ui.js */
try {
/* =========================
   V221 Retroactive duty confirmation + editable slot templates + cleaner monthly position UI
   - Staff can choose the duty date in OT section 1 and confirm past duties.
   - Main duty time display/save: weekday ชบด = 16:00-08:00, weekend/holiday ชบด = 08:00-08:00.
   - Admin can edit slot template details directly from Position Management.
   - Monthly Position page top tools are compacted into a cleaner command bar.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V221_DUTY_DATE_SLOT_EDIT_MONTH_UI';
  if (window.__CNMI_V221_DUTY_DATE_SLOT_EDIT_MONTH_UI__) return;
  window.__CNMI_V221_DUTY_DATE_SLOT_EDIT_MONTH_UI__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const norm = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } };
  const today = () => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } };
  const toast = (msg, tone) => { try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } };
  const friendly = (err) => { try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } };
  const sid = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || ''; } };
  const admin = () => { try { return isAdmin(); } catch (_) { return false; } };
  const b = (text, cls='blue') => { try { return badge(text, cls); } catch (_) { return `<span class="badge ${esc(cls)}">${esc(text)}</span>`; } };
  const staffName = (id) => { try { return staffNick(id); } catch (_) { return String(id || '-'); } };
  const dutyName = (code) => { try { return (DUTY_LABEL && DUTY_LABEL[code]) || code || '-'; } catch (_) { return code || '-'; } };
  const thDate = (d) => { try { return formatThaiDate(d); } catch (_) { return d || '-'; } };
  const deepClone = (x) => JSON.parse(JSON.stringify(x || {}));
  function addDays(date, n){
    const d = new Date(`${norm(date)}T00:00:00`);
    if (!Number.isFinite(d.getTime())) return norm(date);
    d.setDate(d.getDate() + Number(n || 0));
    try { return toDateInput(d); } catch (_) { return d.toISOString().slice(0,10); }
  }
  function isWeekendHoliday(date){
    try { return isWeekend(date) || isHolidayDate(date); }
    catch (_) { const day = new Date(`${norm(date)}T00:00:00`).getDay(); return day === 0 || day === 6; }
  }
  function isCh3Composite(code){
    const c = String(code || '').trim();
    return c === 'ช3A' || c === 'ช3B';
  }
  function isManualDuty(code){
    const c = String(code || '').trim();
    return c === 'ช4' || c === 'ช4A' || c === 'ช4B';
  }
  // V251: ช3A/ช3B ยืนยันเวรหลัก 8 ชม. เหมือน ช9; ส่วน ช4/เวลาปั่นเลือดให้กรอกเพิ่มตามจริง
  function isAutoDuty(code){ return !!String(code || '').trim() && !isManualDuty(code); }
  function dutiesOn(staffId, date){
    const d = norm(date);
    try{
      const fn=window.cnmiTradeSegmentsV217?.effectiveAssignmentsForStaffDate;
      if(typeof fn==='function'){
        const rows=fn(staffId,d,state.rosterAssignments||[]);
        if(Array.isArray(rows))return rows;
      }
    }catch(_){ }
    return (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date) === d)
      .sort((a,b) => {
        try { return dutySortIndex(a?.duty_code) - dutySortIndex(b?.duty_code); }
        catch (_) { return String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'); }
      });
  }
  function attendanceRows(staffId, date){
    const d = norm(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date) === d);
  }
  function isAttendanceOt(row){
    const t = `${row?.reason || ''} ${row?.note || ''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่ 1|V220_OT_APPROVAL|V219_OT_REPAIR|V221_DUTY_DATE/i.test(t);
  }
  function attendanceOtRows(staffId, date){
    const d = norm(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && norm(r?.work_date) === d && isAttendanceOt(r));
  }
  function latest(rows){ return (rows || []).slice().sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null; }
  function statusText(row){
    const raw = String(row?.status || '').trim();
    const low = raw.toLowerCase();
    if (!raw || raw === 'รออนุมัติ' || low === 'pending') return 'รอ Admin อนุมัติ';
    if (raw === 'อนุมัติ' || low === 'approved') return 'อนุมัติแล้ว';
    if (raw === 'ไม่อนุมัติ' || low === 'rejected') return 'ไม่อนุมัติ';
    if (raw === 'ส่งกลับแก้ไข' || /return|edit/i.test(raw)) return 'ส่งกลับแก้ไข';
    return raw;
  }
  function statusCls(text){
    const t = String(text || '');
    if (/อนุมัติแล้ว/.test(t)) return 'green';
    if (/ไม่อนุมัติ|ส่งกลับ/.test(t)) return 'orange';
    if (/รอ Admin|รออนุมัติ|ยืนยันแล้ว/.test(t)) return 'orange';
    return 'black';
  }
  function autoDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isAutoDuty(x?.duty_code)); }
  function manualDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isManualDuty(x?.duty_code)); }
  function hasChbd(duties){ return (duties || []).some(x => /^ชบด/.test(String(x?.duty_code || ''))); }
  function shiftWindowForDuties(date, duties){
    const d = norm(date);
    const list = duties || [];
    const effective=list.filter(x=>Array.isArray(x?._effective_segments)&&x._effective_segments.length&&Number(x?._effective_hours)>0);
    if(effective.length){
      const order=['morning','afternoon','night'],set=new Set(),hours=Math.round(effective.reduce((sum,x)=>sum+Number(x._effective_hours||0),0)*100)/100;
      effective.forEach(x=>(x._effective_segments||[]).forEach(s=>set.add(s)));
      const segs=order.filter(s=>set.has(s)),key=segs.join(',');
      if(key==='morning')return {start_time:'08:00',end_date:d,end_time:'16:00',hours:8,label:'08:00 - 16:00'};
      if(key==='afternoon')return {start_time:'16:00',end_date:addDays(d,1),end_time:'00:00',hours:8,label:'16:00 - 00:00 (+1 วัน)'};
      if(key==='night')return {start_time:'00:00',end_date:d,end_time:'08:00',hours:8,label:'00:00 - 08:00'};
      if(key==='morning,afternoon')return {start_time:'08:00',end_date:addDays(d,1),end_time:'00:00',hours:16,label:'08:00 - 00:00 (+1 วัน)'};
      if(key==='afternoon,night')return {start_time:'16:00',end_date:addDays(d,1),end_time:'08:00',hours:16,label:'16:00 - 08:00 (+1 วัน)'};
      if(key==='morning,night')return {start_time:'00:00',end_date:d,end_time:'16:00',hours:16,label:'ดึก-เช้า รวม 16 ชม.'};
      if(key==='morning,afternoon,night')return {start_time:'08:00',end_date:addDays(d,1),end_time:'08:00',hours:24,label:'08:00 - 08:00 (+1 วัน)'};
      return {start_time:'08:00',end_date:d,end_time:'16:00',hours:hours||8,label:`${hours||8} ชั่วโมง`};
    }
    if (hasChbd(list)) {
      const holiday = isWeekendHoliday(d);
      return { start_time: holiday ? '08:00' : '16:00', end_date: addDays(d, 1), end_time: '08:00', hours: holiday ? 24 : 16, label: holiday ? '08:00 - 08:00 (+1 วัน)' : '16:00 - 08:00 (+1 วัน)' };
    }
    return { start_time: '08:00', end_date: d, end_time: '16:00', hours: 8, label: '08:00 - 16:00' };
  }
  function shiftWindowForStaffDate(staffId, date){ return shiftWindowForDuties(date, autoDuties(staffId, date)); }
  function autoNote(staffId, date, source){
    const duties = autoDuties(staffId, date);
    const labels = duties.map(a => a?._effective_label || dutyName(a.duty_code)).filter(Boolean).join(', ');
    const win = shiftWindowForDuties(date, duties);
    return [`จำนวนเวลา OT: ${win.hours} ชั่วโมง`, `สร้างจากส่วนที่ 1 ยืนยันอยู่เวร${labels ? ` | เวรที่คิดอัตโนมัติ: ${labels}` : ''}`, `เวลาเวร ${win.label}`, source || VERSION].filter(Boolean).join(' | ').slice(0, 900);
  }
  async function insertAttendanceOt(staffId, date, source){
    const d = norm(date);
    const existing = latest(attendanceOtRows(staffId, d));
    if (existing) return existing;
    const duties = autoDuties(staffId, d);
    if (!duties.length) throw new Error('วันนี้ไม่มีเวรหลักที่สร้าง OT อัตโนมัติได้');
    const win = shiftWindowForDuties(d, duties);
    const payload = {
      staff_id: staffId,
      work_date: d,
      start_time: win.start_time,
      end_date: win.end_date,
      end_time: win.end_time,
      reason: 'ยืนยันอยู่เวรตามตาราง',
      note: autoNote(staffId, d, source),
      status: 'รออนุมัติ',
      lat: null,
      lng: null,
      accuracy: null,
      device: `${navigator.userAgent || 'browser'} | ${VERSION}`.slice(0,250)
    };
    const attempts = [
      { ...payload },
      (() => { const p = { ...payload }; delete p.lat; delete p.lng; delete p.accuracy; return p; })(),
      (() => { const p = { ...payload }; delete p.end_date; return p; })(),
      (() => { const p = { ...payload }; delete p.start_time; delete p.end_date; return p; })()
    ];
    let lastError = null;
    for (const p of attempts) {
      const res = await sb.from('ot_requests').insert(p).select('*').maybeSingle();
      if (!res.error) {
        const row = res.data || p;
        try { state.otRequests = [row, ...(state.otRequests || [])]; } catch (_) {}
        return row;
      }
      lastError = res.error;
      if (!/column|schema|cache|start_time|end_date|lat|lng|accuracy/i.test(String(res.error?.message || ''))) break;
    }
    throw lastError || new Error('สร้างรายการ OT ไม่สำเร็จ');
  }
  async function confirmDutyForDate(date){
    const staffId = sid();
    const d = norm(date || state.myDutyDateV221 || today());
    if (!staffId) return toast('ไม่พบข้อมูลผู้ใช้งาน', 'error');
    if (!d) return toast('กรุณาเลือกวันที่อยู่เวร', 'error');
    if (d > today()) return toast('ยังไม่ถึงวันอยู่เวรนี้ จึงยังไม่ให้ยืนยันล่วงหน้า', 'error');
    const auto = autoDuties(staffId, d);
    const manual = manualDuties(staffId, d);
    if (!auto.length) {
      if (manual.length) return toast('วันนี้มีเฉพาะ ช4 ให้เลือกทำเอง/มีคนอยู่แทน หรือกรอกเวลาจริงในส่วนที่ 2', 'error');
      return toast('วันที่เลือกไม่มีเวรหลักที่ต้องยืนยัน', 'error');
    }
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกยืนยันอยู่เวร'); } catch (_) {}
    try {
      const att = attendanceRows(staffId, d);
      const ot = attendanceOtRows(staffId, d);
      if (!att.length) {
        let pos = { ok:true, lat:null, lng:null, accuracy:null };
        try { if (typeof getGps === 'function') pos = await getGps(); } catch (_) {}
        if (pos && pos.ok === false && typeof showGpsHelp === 'function') return showGpsHelp(pos.message);
        const attendancePayload = { staff_id: staffId, duty_date: d, check_in_at: new Date().toISOString(), lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.accuracy ?? null, device: `${navigator.userAgent || 'browser'} | ${VERSION}`.slice(0,250) };
        const ares = await sb.from('attendance_logs').insert(attendancePayload).select('*').maybeSingle();
        if (ares.error && !/duplicate|unique/i.test(String(ares.error.message || ''))) throw ares.error;
        if (!ares.error && ares.data) state.attendance = [ares.data, ...(state.attendance || [])];
      }
      if (!ot.length) await insertAttendanceOt(staffId, d, 'Staff ยืนยันจากวันที่ที่เลือก');
      await loadAllData();
      state.myDutyDateV221 = d;
      if (state.page === 'ot') renderPage();
      toast(d === today() ? 'ส่งรายการให้ Admin อนุมัติแล้ว' : `ส่งรายการย้อนหลังวันที่ ${thDate(d)} ให้ Admin อนุมัติแล้ว`);
    } catch (err) {
      console.error(`${VERSION}: confirm duty failed`, err);
      toast('บันทึกยืนยันอยู่เวรไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }

  // Make old data display with the correct ชบด time window, and repair pending rows in DB when possible.
  function correctedOtRow(row){
    if (!row || !isAttendanceOt(row)) return row;
    const d = norm(row.work_date);
    const duties = autoDuties(row.staff_id, d);
    if (!duties.length) return row;
    const win = shiftWindowForDuties(d, duties);
    const out = { ...row, start_time: win.start_time, end_date: win.end_date, end_time: win.end_time };
    // V424: attendance OT must follow the effective owner after partial trade.
    // Rebuild the explicit-hours note so seller/receiver does not keep the old full-shift hours.
    out.note = autoNote(row.staff_id, d, 'ปรับตามเวรปัจจุบัน/ขายเวร V424');
    return out;
  }
  function normalizeOtStateRows(){
    let changed = false;
    state.otRequests = (state.otRequests || []).map(r => {
      const fixed = correctedOtRow(r);
      if (fixed !== r) changed = true;
      return fixed;
    });
    return changed;
  }
  let normalizeTimer = null;
  function schedulePendingOtDbNormalize(){
    if (normalizeTimer) clearTimeout(normalizeTimer);
    normalizeTimer = setTimeout(async () => {
      if (state?.page !== 'ot' || !sb) return;
      const rows = (state.otRequests || []).filter(r => {
        if (!r?.id || !isAttendanceOt(r)) return false;
        const st = String(r.status || '').trim().toLowerCase();
        if (!['รออนุมัติ','pending',''].includes(st)) return false;
        const fixed = correctedOtRow(r);
        return fixed.start_time !== r.start_time || norm(fixed.end_date) !== norm(r.end_date) || fixed.end_time !== r.end_time || String(fixed.note||'') !== String(r.note||'');
      });
      for (const r of rows.slice(0, 30)) {
        try {
          const fixed = correctedOtRow(r);
          const payload = { start_time:fixed.start_time, end_date:fixed.end_date, end_time:fixed.end_time, note:fixed.note, device:`${r.device || ''} | normalized ${VERSION}`.slice(0,250) };
          const res = await sb.from('ot_requests').update(payload).eq('id', r.id);
          if (res.error) console.warn(`${VERSION}: normalize OT failed`, res.error);
        } catch (err) { console.warn(`${VERSION}: normalize OT failed`, err); }
      }
    }, 700);
  }

  // Override checkIn so any old button still uses the selected date logic.
  const previousCheckIn = window.checkIn || (typeof checkIn === 'function' ? checkIn : null);
  window.checkIn = checkIn = async function checkInV221(){
    return confirmDutyForDate(state.myDutyDateV221 || today());
  };

  function renderMyDutyCard(){
    const staffId = sid();
    const d = norm(state.myDutyDateV221 || today());
    const duties = dutiesOn(staffId, d);
    const auto = duties.filter(x => isAutoDuty(x?.duty_code));
    const manual = duties.filter(x => isManualDuty(x?.duty_code));
    const ch3 = duties.filter(x => isCh3Composite(x?.duty_code));
    const att = attendanceRows(staffId, d);
    const ot = attendanceOtRows(staffId, d);
    const latestOt = latest(ot);
    const win = auto.length ? shiftWindowForDuties(d, auto) : null;
    let status = 'ยังไม่ได้ยืนยัน';
    if (latestOt) status = statusText(latestOt);
    else if (att.length && auto.length) status = 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT';
    else if (!auto.length && manual.length) status = 'ต้องกรอกเวลาจริง';
    else if (!duties.length) status = 'ไม่มีเวรที่ต้องยืนยัน';
    const dutyNames = duties.length ? duties.map(a => a?._effective_label || dutyName(a.duty_code)).join(' / ') : '-';
    const timeText = auto.length ? (ch3.length ? `${win.label} (เวรหลัก 8 ชม.)` : win.label) : (manual.length ? 'กรอกเวลาจริงในส่วนที่ 2' : '-');
    const missingOt = att.length && !ot.length && auto.length;
    const canCheck = auto.length && !latestOt && d <= today();
    return `<div class="card ot-card my-duty-today-card v221-ot-card">
      <div class="section-title"><div><h3>ส่วนที่ 1 เวรของฉันตามวันที่เลือก</h3><p class="hint">ใช้ยืนยันเวรหลัก ชบด/ช9/ช3A/ช3B ได้ทั้งวันนี้และย้อนหลัง กรณีลืมกดวันก่อน</p></div></div>
      <label class="wide v221-duty-date-label">เลือกวันที่อยู่เวร <input id="myDutyDateV221" type="date" value="${esc(d)}" max="${esc(today())}"></label>
      <div class="my-duty-detail v221-duty-detail">
        <div><span class="muted">เวร</span><b>${esc(dutyNames)}</b></div>
        <div><span class="muted">เวลา</span><b>${esc(timeText)}</b></div>
        <div><span class="muted">สถานะ</span>${b(status, statusCls(status))}</div>
      </div>
      ${missingOt ? '<div class="notice error-notice compact"><b>พบรายการค้าง</b><br>ลงชื่อแล้ว แต่ยังไม่มีรายการ OT รออนุมัติ กดปุ่มด้านล่างเพื่อสร้างรายการให้ใหม่</div>' : ''}
      ${ch3.length ? '<div class="notice soft-notice compact"><b>ช3A/ช3B = ช9 + ช4</b><br>ปุ่มด้านล่างยืนยันเวรหลัก 8 ชม. ส่วนเวลาปั่นเลือด/อยู่ต่อของ ช4 ให้กรอกเพิ่มในส่วนที่ 2 ตามเวลาจริง</div>' : ''}
      ${manual.length ? '<div class="notice soft-notice compact">ช4 ไม่สร้าง 8 ชม. อัตโนมัติ ให้เลือกสถานะ ช4 หรือกรอกเวลาเริ่ม-สิ้นสุดจริงในส่วนที่ 2</div>' : ''}
      ${!duties.length ? '<div class="my-duty-empty"><b>วันที่เลือกไม่มีเวรที่ต้องยืนยัน</b><span class="muted">ถ้าอยู่ต่อจริง ใช้ส่วนที่ 2 เพื่อขอ OT เพิ่ม</span></div>' : ''}
      <div class="actions v221-ot-actions">
        <button class="primary-btn" type="button" data-check-in-selected-v221="${esc(d)}" ${canCheck ? '' : 'disabled'}>${latestOt ? 'รอ/บันทึกแล้ว' : (canCheck ? (ch3.length ? 'ยืนยันเวรหลัก 8 ชม.' : 'ส่งให้ Admin อนุมัติ') : 'ไม่ต้องยืนยันเวรหลัก')}</button>
      </div>
    </div>`;
  }
  function renderMyMonthDuties(){
    const staffId = sid();
    const key = state.myDutyMonthFilter || state.monthKey || today().slice(0,7);
    const rows = (()=>{
      const out=[];
      const [y,m]=String(key).split('-').map(Number),last=new Date(y,m,0).getDate();
      for(let day=1;day<=last;day++)out.push(...dutiesOn(staffId,`${key}-${String(day).padStart(2,'0')}`));
      return out.sort((a,b)=>norm(a?.duty_date).localeCompare(norm(b?.duty_date))||String(a?.duty_code||'').localeCompare(String(b?.duty_code||''),'th'));
    })();
    const body = rows.map(a => {
      const d = norm(a.duty_date);
      const auto = isAutoDuty(a.duty_code);
      const ot = latest(attendanceOtRows(staffId, d));
      const att = attendanceRows(staffId, d).length;
      const st = ot ? statusText(ot) : (att && auto ? 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT' : (auto ? 'ยังไม่ได้ยืนยัน' : 'บันทึกเวลาจริงถ้าจะเบิก'));
      const time = auto ? shiftWindowForDuties(d, [a]).label : 'เวลาจริง';
      const hint = isCh3Composite(a.duty_code) ? 'ช3A/ช3B: เวรหลัก 8 ชม. + ส่วน ช4 กรอกเวลาจริงเพิ่ม' : (auto ? 'เวรหลัก: ต้องมีรายการรอ Admin อนุมัติ' : 'ช4: ไม่คิด 8 ชม. อัตโนมัติ');
      return `<tr><td>${thDate(d)}</td><td><b>${esc(a?._effective_label || dutyName(a.duty_code))}</b></td><td>${esc(time)}</td><td>${b(st, statusCls(st))}<br><span class="muted">${esc(hint)}</span></td></tr>`;
    }).join('');
    return `<div class="card wide-card v221-my-month-card" style="grid-column:1/-1;">
      <div class="section-title"><div><h3>เวรของฉันเดือนนี้</h3><p class="hint">เลือกวันที่ในส่วนที่ 1 เพื่อกดยืนยันย้อนหลังได้</p></div><label>เดือน <input id="myDutyMonthFilter" type="month" value="${esc(key)}"></label></div>
      <div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody>${body || '<tr><td colspan="4">ยังไม่มีเวรเดือนนี้</td></tr>'}</tbody></table></div>
    </div>`;
  }

  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  window.renderOtPage = renderOtPage = function renderOtPageV221(){
    try { normalizeOtStateRows(); } catch (err) { console.warn(`${VERSION}: normalize state skipped`, err); }
    schedulePendingOtDbNormalize();
    if (admin()) return previousRenderOtPage ? previousRenderOtPage.apply(this, arguments) : '';
    const d = norm(state.myDutyDateV221 || today());
    const mine = (state.otRequests || []).filter(x => String(x?.staff_id || '') === String(sid() || ''));
    return `<div class="grid grid-2 ot-page v221-ot-page">
      ${renderMyDutyCard()}
      <div class="card ot-card v221-ot-card">
        <h3>ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด</h3>
        <p class="hint compact">ใช้เมื่ออยู่ต่อจริง/ปั่นเลือดจริง กรอกเวลาเริ่ม-สิ้นสุด แล้วรอ Admin เทียบ LIS</p>
        <form id="otForm" class="form-grid">
          <label>วันที่ <input name="work_date" type="date" value="${esc(d)}" required></label>
          <label>เริ่มเวลา <input name="start_time" type="time" value="16:00" required></label>
          <label>ถึงเวลา <input name="end_time" type="time" required></label>
          <label>เหตุผล <select name="reason">${(window.OT_REASONS || (typeof OT_REASONS !== 'undefined' ? OT_REASONS : ['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','อื่นๆ'])).map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label>
          <label class="wide">รายละเอียด <input name="note" placeholder="เช่น ปั่นเลือดถึง 18:20 / อยู่แทน ช4 ของ..."></label>
          <button class="primary-btn wide" type="submit">ส่งให้ Admin อนุมัติ</button>
        </form>
      </div>
      ${renderMyMonthDuties()}
      <div class="card wide-card" style="grid-column:1/-1;"><div class="section-title"><h3>รายการ OT ของฉัน</h3></div>${typeof renderOtTable === 'function' ? renderOtTable(mine.map(correctedOtRow)) : ''}</div>
      <div class="card" style="grid-column:1/-1;"><h3>ส่วนที่ 4 สรุป OT รายเดือน</h3><p class="hint">สรุปเฉพาะรายการที่อนุมัติแล้วและยังไม่เบิก</p>${typeof renderOtSummary === 'function' ? renderOtSummary() : ''}</div>
    </div>`;
  };

  // ----- Editable slot templates in Position Management -----
  const LS_KEY = 'cnmi_day_slot_template_overrides_v221';
  function readOverrides(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function writeOverrides(obj){ try { localStorage.setItem(LS_KEY, JSON.stringify(obj || {})); } catch (_) {} }
  function baseSlotSets(){
    const src = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218 || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS || null;
    return deepClone(src || {});
  }
  function dbMasterByCode(){
    const map = new Map();
    (state.positionMasters || []).forEach(p => {
      const code = String(p?.code || '').trim();
      if (!code) return;
      const isOuting = p?.is_outing === true || String(p?.zone || '') === 'ออกหน่วย';
      if (isOuting) return;
      map.set(code, p);
    });
    return map;
  }
  function effectiveSlotSets(){
    const sets = baseSlotSets();
    const db = dbMasterByCode();
    Object.keys(sets).forEach(n => {
      sets[n] = (sets[n] || []).map((row, idx) => {
        const code = String(row.code || '').trim();
        const m = db.get(code);
        let out = { ...row };
        if (m) out = { ...out, zone:m.zone || out.zone, main_rule:m.main_rule || out.main_rule, break_time:m.break_time || out.break_time, job_desc:m.job_desc || out.job_desc, eligibility_code:m.eligibility_code || out.eligibility_code || code };
        const ov = readOverrides()[`${n}:${idx}`];
        if (ov && String(ov.code || code) === code) out = { ...out, ...ov };
        return out;
      });
    });
    return sets;
  }
  function applyEffectiveSlotSets(){
    try {
      const sets = effectiveSlotSets();
      const target = window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218;
      if (target) {
        Object.keys(sets).forEach(k => { target[k] = sets[k]; });
      }
    } catch (err) { console.warn(`${VERSION}: apply slot sets skipped`, err); }
  }
  function allUniqueSlotRows(){
    const map = new Map();
    const sets = effectiveSlotSets();
    [8,9,10,11,12,13,14].forEach(n => (sets[n] || []).forEach(p => { if (!map.has(p.code)) map.set(p.code, { ...p }); }));
    return Array.from(map.values()).sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999) || String(a.code).localeCompare(String(b.code), 'th'));
  }
  function slotManagerHtml(){
    const sets = effectiveSlotSets();
    const selected = Number(state.daySlotPreviewSet221 || state.daySlotPreviewSet220 || 10);
    const rows = sets[selected] || sets[10] || [];
    const buttons = [8,9,10,11,12,13,14].map(n => `<button type="button" class="${selected===n?'primary-btn':'ghost-btn'}" data-slot-set-preview-v221="${n}">${n} คน</button>`).join('');
    const tableRows = rows.map((p, idx) => `<tr><td>${idx + 1}</td><td>${esc(p.zone || '-')}</td><td><b>${esc(p.code)}</b></td><td>${esc(p.main_rule || '-')}</td><td>${esc(p.break_time || '-')}</td><td>${esc(p.job_desc || '-')}</td><td><button class="tiny-btn" type="button" data-edit-slot-template-v221="${selected}:${idx}">แก้ไข</button></td></tr>`).join('');
    return `<div class="card wide-card v221-slot-manager-card">
      <div class="section-title"><div><h3>ชุด Slot ตำแหน่งกลางวัน 8-14 คน</h3><p class="hint">เลือกชุดตามจำนวนคนทำงานจริง และแก้รายละเอียดหน้าที่ได้จากตรงนี้</p></div><div class="actions"><button type="button" class="ghost-btn" data-refresh-slot-template-v221>รีเฟรชรายละเอียด</button><button type="button" class="soft-btn" data-seed-all-slots-v221>อัปเดตฐานข้อมูลจากชุด 8-14 ทั้งหมด</button></div></div>
      <div class="v221-slot-tabs">${buttons}</div>
      <div class="notice soft-notice compact"><b>ชุดที่เลือก:</b> ${selected} คน / ${rows.length} ตำแหน่ง — ถ้าแก้ไขรายละเอียด ระบบจะบันทึกลงฐานข้อมูลตำแหน่งและใช้กับตารางรายวัน/รายเดือนรอบถัดไป</div>
      <div class="table-wrap compact-table v221-slot-detail-table"><table><thead><tr><th>#</th><th>โซน</th><th>ตำแหน่ง</th><th>ผู้ปฏิบัติหลัก</th><th>เวลาพัก</th><th>รายละเอียดหน้าที่ประจำตำแหน่ง</th><th>จัดการ</th></tr></thead><tbody>${tableRows}</tbody></table></div>
    </div>`;
  }
  function injectSlotManager(){
    if (state?.page !== 'positionManagement') return;
    applyEffectiveSlotSets();
    const root = document.getElementById('pageContent');
    if (!root) return;
    root.querySelectorAll('.v220-slot-manager-card,.v218-position-slot-tools,.v221-slot-manager-card').forEach(el => el.remove());
    const tmp = document.createElement('div');
    tmp.innerHTML = slotManagerHtml();
    const page = root.querySelector('.position-management-page') || root;
    page.prepend(tmp.firstElementChild);
  }
  function openSlotEdit(setNo, idx){
    const sets = effectiveSlotSets();
    const row = (sets[setNo] || [])[idx];
    if (!row) return toast('ไม่พบ Slot นี้', 'error');
    showModal(`<div class="v221-slot-edit-modal"><h2>แก้ไขรายละเอียด Slot</h2><p class="hint">${setNo} คน • ${esc(row.code)}</p>
      <form id="slotTemplateEditFormV221" class="form-grid compact-form" action="javascript:void(0)">
        <input type="hidden" name="set_no" value="${esc(setNo)}"><input type="hidden" name="idx" value="${esc(idx)}"><input type="hidden" name="code" value="${esc(row.code)}">
        <label>ตำแหน่ง <input value="${esc(row.code)}" disabled></label>
        <label>โซน <input name="zone" value="${esc(row.zone || '')}" required></label>
        <label>ผู้ปฏิบัติหลัก <input name="main_rule" value="${esc(row.main_rule || '')}" required></label>
        <label>เวลาพัก <input name="break_time" value="${esc(row.break_time || '')}" placeholder="เช่น 11:00 / 12:00" required></label>
        <label class="wide">รายละเอียดหน้าที่ <textarea name="job_desc" rows="5" required>${esc(row.job_desc || '')}</textarea></label>
        <div class="actions wide modal-form-actions"><button type="button" class="ghost-btn" onclick="closeModal()">ยกเลิก</button><button type="button" class="primary-btn" data-save-slot-template-v221>บันทึก Slot นี้</button></div>
      </form></div>`, { large:true });
  }
  async function saveSlotTemplate(form){
    const fd = new FormData(form);
    const setNo = String(fd.get('set_no') || '').trim();
    const idx = Number(fd.get('idx'));
    const code = String(fd.get('code') || '').trim();
    if (!code || !setNo || !Number.isFinite(idx)) return toast('ข้อมูล Slot ไม่ครบ', 'error');
    const row = { code, zone:String(fd.get('zone') || '').trim(), main_rule:String(fd.get('main_rule') || '').trim(), break_time:String(fd.get('break_time') || '').trim(), job_desc:String(fd.get('job_desc') || '').trim() };
    if (!row.zone || !row.main_rule || !row.break_time || !row.job_desc) return toast('กรุณากรอกข้อมูลให้ครบ', 'error');
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึก Slot'); } catch (_) {}
    try {
      const overrides = readOverrides();
      overrides[`${setNo}:${idx}`] = { ...row };
      writeOverrides(overrides);
      // Save code-level detail to Supabase master so it follows account/database, not just this browser.
      if (sb && admin()) {
        const existingRes = await sb.from('daily_position_masters').select('*').eq('code', code).limit(1);
        if (existingRes.error) throw existingRes.error;
        const found = (existingRes.data || []).find(x => x?.is_outing !== true && String(x?.zone || '') !== 'ออกหน่วย') || (existingRes.data || [])[0];
        const sets = effectiveSlotSets();
        const base = ((sets[setNo] || [])[idx] || {});
        const payload = { code, zone:row.zone, is_outing:false, break_time:row.break_time, main_rule:row.main_rule, job_desc:row.job_desc, eligibility_code:base.eligibility_code || code, sort_order:base.sort_order || idx + 1, is_active:true, deleted_at:null, updated_by:sid() };
        const res = found?.id
          ? await sb.from('daily_position_masters').update(payload).eq('id', found.id)
          : await sb.from('daily_position_masters').insert({ ...payload, created_by:sid() });
        if (res.error) throw res.error;
        if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true });
        else if (typeof loadAllData === 'function') await loadAllData();
      }
      applyEffectiveSlotSets();
      try { closeModal(); } catch (_) {}
      if (state.page === 'positionManagement') renderPage();
      toast('บันทึกรายละเอียด Slot แล้ว');
    } catch (err) {
      console.error(`${VERSION}: save slot failed`, err);
      toast('บันทึก Slot ไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  async function seedAllSlots(){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const ok = await (typeof confirmDialog === 'function' ? confirmDialog('อัปเดต daily_position_masters ด้วยชุด Slot 8-14 ทั้งหมดใช่ไหม?', 'ยืนยันอัปเดต Slot กลางวัน') : Promise.resolve(window.confirm('อัปเดต Slot 8-14 ทั้งหมด?')));
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังอัปเดตชุด Slot 8-14'); } catch (_) {}
    try {
      const desired = allUniqueSlotRows();
      const desiredCodes = new Set(desired.map(p => String(p.code || '').trim()).filter(Boolean));
      const existingRes = await sb.from('daily_position_masters').select('*');
      if (existingRes.error) throw existingRes.error;
      const existing = existingRes.data || [];
      const isOuting = (row) => row?.is_outing === true || String(row?.zone || '') === 'ออกหน่วย' || String(row?.eligibility_code || '').startsWith('OUTING:');
      for (const row of existing) {
        const code = String(row?.code || '').trim();
        if (!isOuting(row) && code && !desiredCodes.has(code) && row.is_active !== false) {
          const r = await sb.from('daily_position_masters').update({ is_active:false, deleted_at:new Date().toISOString(), updated_by:sid() }).eq('id', row.id);
          if (r.error) throw r.error;
        }
      }
      for (const p of desired) {
        const payload = { code:p.code, zone:p.zone, is_outing:false, break_time:p.break_time || '-', main_rule:p.main_rule || null, job_desc:p.job_desc || null, sort_order:p.sort_order || 999, eligibility_code:p.eligibility_code || p.code, is_active:true, deleted_at:null, updated_by:sid() };
        const found = existing.find(x => String(x?.code || '').trim() === String(p.code || '').trim() && !isOuting(x));
        const res = found?.id ? await sb.from('daily_position_masters').update(payload).eq('id', found.id) : await sb.from('daily_position_masters').insert({ ...payload, created_by:sid() });
        if (res.error) throw res.error;
      }
      if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true });
      else if (typeof loadAllData === 'function') await loadAllData();
      applyEffectiveSlotSets();
      renderPage();
      toast('อัปเดตฐานข้อมูลชุด Slot 8-14 ทั้งหมดแล้ว');
    } catch (err) {
      console.error(`${VERSION}: seed slots failed`, err);
      toast('อัปเดต Slot ไม่สำเร็จ: ' + friendly(err), 'error');
    } finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }

  // ----- Cleaner Monthly Position top UI -----
  function polishMonthPositionPage(){
    if (state?.page !== 'positionMonth') return;
    const card = document.querySelector('.monthly-position-page');
    if (!card || card.dataset.v221Polished === '1') return;
    card.dataset.v221Polished = '1';
    const toolbar = card.querySelector(':scope > .toolbar');
    if (!toolbar) return;
    const shell = document.createElement('div');
    shell.className = 'v221-month-command-shell';
    const primary = document.createElement('div');
    primary.className = 'v221-month-primary-actions';
    const details = document.createElement('details');
    details.className = 'v221-month-more-tools';
    details.innerHTML = '<summary>ตัวเลือกเพิ่มเติม / คำอธิบาย</summary><div class="v221-month-more-body"></div>';
    const moreBody = details.querySelector('.v221-month-more-body');
    Array.from(toolbar.children).forEach(el => {
      const text = (el.textContent || '').trim();
      const html = el.outerHTML || '';
      const primaryHit = el.matches?.('label') || /สร้างตารางเปล่า|สร้างแผนทั้งเดือน|บันทึกแผนทั้งเดือน|มีข้อมูล|วันทำงาน|คัดลอกตำแหน่งทั้งสัปดาห์/.test(text) || /data-create-blank-month-positions|data-generate-month-positions|data-save-month-positions|weekly|copy/i.test(html);
      (primaryHit ? primary : moreBody).appendChild(el);
    });
    // Move verbose notices near the top into the details panel.
    Array.from(card.querySelectorAll(':scope > .notice, :scope > .v218-slot-note')).forEach(n => moreBody.appendChild(n));
    shell.appendChild(primary);
    shell.appendChild(details);
    toolbar.replaceWith(shell);
  }

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV221(){
      const ret = previousRenderPage.apply(this, arguments);
      setTimeout(() => {
        try { applyEffectiveSlotSets(); } catch (_) {}
        try { injectSlotManager(); } catch (err) { console.warn(`${VERSION}: slot manager inject failed`, err); }
        try { polishMonthPositionPage(); } catch (err) { console.warn(`${VERSION}: month UI polish failed`, err); }
      }, 0);
      return ret;
    };
  }

  document.addEventListener('change', function(e){
    const dateInput = e.target?.closest?.('#myDutyDateV221');
    if (dateInput) {
      state.myDutyDateV221 = norm(dateInput.value) || today();
      if (state.page === 'ot') renderPage();
      return;
    }
  }, true);

  document.addEventListener('click', function(e){
    const check = e.target?.closest?.('[data-check-in-selected-v221]');
    if (check) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      confirmDutyForDate(check.getAttribute('data-check-in-selected-v221') || state.myDutyDateV221 || today());
      return;
    }
    const tab = e.target?.closest?.('[data-slot-set-preview-v221]');
    if (tab) {
      e.preventDefault(); e.stopPropagation();
      state.daySlotPreviewSet221 = Number(tab.getAttribute('data-slot-set-preview-v221')) || 10;
      injectSlotManager();
      return;
    }
    const edit = e.target?.closest?.('[data-edit-slot-template-v221]');
    if (edit) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const [setNo, idx] = String(edit.getAttribute('data-edit-slot-template-v221') || '').split(':');
      openSlotEdit(setNo, Number(idx));
      return;
    }
    const save = e.target?.closest?.('[data-save-slot-template-v221]');
    if (save) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const form = save.closest('form');
      if (form) saveSlotTemplate(form);
      return;
    }
    const seed = e.target?.closest?.('[data-seed-all-slots-v221]');
    if (seed) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      seedAllSlots();
      return;
    }
    const ref = e.target?.closest?.('[data-refresh-slot-template-v221]');
    if (ref) {
      e.preventDefault(); e.stopPropagation();
      (async () => { try { if (typeof window.cnmiV212RefreshPositionMasters === 'function') await window.cnmiV212RefreshPositionMasters({ renderAfter:false, silent:true }); applyEffectiveSlotSets(); injectSlotManager(); toast('รีเฟรชรายละเอียด Slot แล้ว'); } catch (err) { toast('รีเฟรชไม่สำเร็จ: ' + friendly(err), 'error'); } })();
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v221-duty-date-label{display:block;margin-bottom:10px}.v221-ot-card .notice{margin-top:10px}.v221-duty-detail{margin-top:8px}.v221-duty-detail b{white-space:normal}
    .v221-slot-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}.v221-slot-detail-table table td:nth-child(6){min-width:420px;line-height:1.5;white-space:normal}.v221-slot-detail-table table td:nth-child(3){min-width:150px}.v221-slot-manager-card{margin-bottom:14px}.v221-slot-edit-modal textarea{min-height:130px}
    .v221-month-command-shell{background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:10px 0 12px}.v221-month-primary-actions{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.v221-month-primary-actions label{min-width:170px}.v221-month-primary-actions button{white-space:nowrap}.v221-month-more-tools{margin-top:10px}.v221-month-more-tools>summary{cursor:pointer;color:#2563eb;font-weight:700}.v221-month-more-body{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.v221-month-more-body .notice{width:100%;margin:4px 0}.monthly-position-page[data-v221-polished="1"]>.toolbar{display:none!important}
    @media(max-width:760px){.v221-slot-detail-table table td:nth-child(6){min-width:280px}.v221-month-primary-actions>*{width:100%}.v221-month-primary-actions button{width:100%}}
  `;
  document.head.appendChild(style);

  // Initial application for current page.
  setTimeout(() => { try { applyEffectiveSlotSets(); injectSlotManager(); polishMonthPositionPage(); } catch (_) {} }, 50);
  window.cnmiV221DutyOt = { confirmDutyForDate, insertAttendanceOt, correctedOtRow, shiftWindowForStaffDate };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v221-duty-date-slot-edit-month-ui.js", error); }
;

/* Original source: patch-v222-clean-ot-ch4-month-position-ui.js */
try {
/* =========================
   V222 clean OT wording + Ch4 cover on selected date + clean monthly position toolbar
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V222_CLEAN_OT_CH4_MONTH_POSITION_UI';
  if (window.__CNMI_V222_CLEAN_OT_CH4_MONTH_POSITION_UI__) return;
  window.__CNMI_V222_CLEAN_OT_CH4_MONTH_POSITION_UI__ = true;

  const CH4_TABLE = 'shift_confirmations';
  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const norm = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } };
  const today = () => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } };
  const toast = (msg, tone) => { try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } };
  const friendly = (err) => { try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } };
  const sid = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || ''; } };
  const isAdminMode = () => { try { return isAdmin(); } catch (_) { return false; } };
  const thDate = (d) => { try { return formatThaiDate(d); } catch (_) { return d || '-'; } };
  const staffName = (id) => { try { return staffNick(id); } catch (_) { return String(id || '-'); } };
  const label = (code) => { try { return (DUTY_LABEL && DUTY_LABEL[code]) || code || '-'; } catch (_) { return code || '-'; } };
  const b = (text, cls='blue') => { try { return badge(text, cls); } catch (_) { return `<span class="badge ${esc(cls)}">${esc(text)}</span>`; } };
  function addDays(date, n){
    const d = new Date(`${norm(date)}T00:00:00`);
    if (!Number.isFinite(d.getTime())) return norm(date);
    d.setDate(d.getDate() + Number(n || 0));
    try { return toDateInput(d); } catch (_) { return d.toISOString().slice(0,10); }
  }
  function isWeekendHoliday(date){
    try { return isWeekend(date) || isHolidayDate(date); }
    catch (_) { const day = new Date(`${norm(date)}T00:00:00`).getDay(); return day === 0 || day === 6; }
  }
  function isCh4(code){ const c = String(code || '').trim(); return c === 'ช4' || c === 'ช4A' || c === 'ช4B' || c === 'ช4-MT'; }
  function isCh3Composite(code){ const c = String(code || '').trim(); return c === 'ช3A' || c === 'ช3B'; }
  function isManualDuty(code){ const c = String(code || '').trim(); return isCh4(c); }
  // V251: ช3A/ช3B ยืนยันเวรหลัก 8 ชม. เหมือน ช9 ส่วน ช4 เป็นเวลาส่วนเพิ่มตามจริง
  function isAutoDuty(code){ return !!String(code || '').trim() && !isManualDuty(code); }
  function dutiesOn(staffId, date){
    const d = norm(date);
    try{
      const fn=window.cnmiTradeSegmentsV217?.effectiveAssignmentsForStaffDate;
      if(typeof fn==='function'){
        const rows=fn(staffId,d,state.rosterAssignments||[]);
        if(Array.isArray(rows))return rows;
      }
    }catch(_){ }
    return (state.rosterAssignments || [])
      .filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date) === d)
      .sort((a,b) => {
        try { return dutySortIndex(a?.duty_code) - dutySortIndex(b?.duty_code); }
        catch (_) { return String(a?.duty_code || '').localeCompare(String(b?.duty_code || ''), 'th'); }
      });
  }
  function autoDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isAutoDuty(x?.duty_code)); }
  function manualDuties(staffId, date){ return dutiesOn(staffId, date).filter(x => isManualDuty(x?.duty_code)); }
  function ch4Duties(staffId, date){ return dutiesOn(staffId, date).filter(x => isCh4(x?.duty_code)); }
  function attendanceRows(staffId, date){
    const d = norm(date);
    return (state.attendance || []).filter(a => String(a?.staff_id || '') === String(staffId || '') && norm(a?.duty_date) === d);
  }
  function isAttendanceOt(row){
    const t = `${row?.reason || ''} ${row?.note || ''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|V220_OT_APPROVAL|V221_DUTY_DATE|V222_CLEAN_OT/i.test(t);
  }
  function attendanceOtRows(staffId, date){
    const d = norm(date);
    return (state.otRequests || []).filter(r => String(r?.staff_id || '') === String(staffId || '') && norm(r?.work_date) === d && isAttendanceOt(r));
  }
  function latest(rows){ return (rows || []).slice().sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null; }
  function hasChbd(duties){ return (duties || []).some(x => /^ชบด/.test(String(x?.duty_code || ''))); }
  function shiftWindowForDuties(date, duties){
    const d = norm(date),list=duties||[];
    const effective=list.filter(x=>Array.isArray(x?._effective_segments)&&x._effective_segments.length&&Number(x?._effective_hours)>0);
    if(effective.length){
      const order=['morning','afternoon','night'],set=new Set(),hours=Math.round(effective.reduce((sum,x)=>sum+Number(x._effective_hours||0),0)*100)/100;
      effective.forEach(x=>(x._effective_segments||[]).forEach(s=>set.add(s)));
      const key=order.filter(s=>set.has(s)).join(',');
      if(key==='morning')return {start_time:'08:00',end_date:d,end_time:'16:00',hours:8,label:'08:00 - 16:00'};
      if(key==='afternoon')return {start_time:'16:00',end_date:addDays(d,1),end_time:'00:00',hours:8,label:'16:00 - 00:00 (+1 วัน)'};
      if(key==='night')return {start_time:'00:00',end_date:d,end_time:'08:00',hours:8,label:'00:00 - 08:00'};
      if(key==='morning,afternoon')return {start_time:'08:00',end_date:addDays(d,1),end_time:'00:00',hours:16,label:'08:00 - 00:00 (+1 วัน)'};
      if(key==='afternoon,night')return {start_time:'16:00',end_date:addDays(d,1),end_time:'08:00',hours:16,label:'16:00 - 08:00 (+1 วัน)'};
      if(key==='morning,night')return {start_time:'00:00',end_date:d,end_time:'16:00',hours:16,label:'ดึก-เช้า รวม 16 ชม.'};
      if(key==='morning,afternoon,night')return {start_time:'08:00',end_date:addDays(d,1),end_time:'08:00',hours:24,label:'08:00 - 08:00 (+1 วัน)'};
      return {start_time:'08:00',end_date:d,end_time:'16:00',hours:hours||8,label:`${hours||8} ชั่วโมง`};
    }
    if (hasChbd(list)) {
      const hol = isWeekendHoliday(d);
      return { start_time: hol ? '08:00' : '16:00', end_date:addDays(d, 1), end_time:'08:00', hours:hol ? 24 : 16, label:hol ? '08:00 - 08:00 (+1 วัน)' : '16:00 - 08:00 (+1 วัน)' };
    }
    return { start_time:'08:00', end_date:d, end_time:'16:00', hours:8, label:'08:00 - 16:00' };
  }
  function statusText(row){
    const raw = String(row?.status || '').trim();
    const low = raw.toLowerCase();
    if (!raw || raw === 'รออนุมัติ' || low === 'pending') return 'รอ Admin อนุมัติ';
    if (raw === 'อนุมัติ' || low === 'approved') return 'อนุมัติแล้ว';
    if (raw === 'ไม่อนุมัติ' || low === 'rejected') return 'ไม่อนุมัติ';
    if (raw === 'ส่งกลับแก้ไข' || /return|edit/i.test(raw)) return 'ส่งกลับแก้ไข';
    return raw;
  }
  function statusCls(text){
    const t = String(text || '');
    if (/อนุมัติแล้ว|ทำเองแล้ว|อยู่แทนแล้ว/.test(t)) return 'green';
    if (/ไม่อนุมัติ|ส่งกลับ/.test(t)) return 'red';
    if (/รอ|ยังไม่|ต้อง/.test(t)) return 'orange';
    return 'black';
  }

  // ---------- 1) Clean OT reason wording for display ----------
  function noteTokens(note){ return String(note || '').split('|').map(x => x.trim()).filter(Boolean); }
  function cleanTechTokens(text){
    return String(text || '')
      .replace(/V\d{3}[_A-Z0-9-]*/g, '')
      .replace(/ปรับเวลาแสดงผล\s*V\d+/g, '')
      .replace(/ซ่อมอัตโนมัติเมื่อเปิดหน้า\s*OT/gi, '')
      .replace(/สร้างจากส่วนที่\s*1\s*/gi, '')
      .replace(/จำนวนเวลา\s*OT\s*:?\s*\d+(?:\.\d+)?\s*ชั่วโมง?/gi, '')
      .replace(/เวรที่คิดอัตโนมัติ\s*:\s*[^|]+/gi, '')
      .replace(/เวลาเวร\s*[^|]+/gi, '')
      .replace(/ประเภทเวร\s*:\s*-/gi, '')
      .replace(/หมายเหตุ\s*:\s*/gi, '')
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/^\|+|\|+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function dutyFromOtRow(row){
    const text = `${row?.note || ''} | ${row?.reason || ''}`;
    let m = text.match(/เวรที่คิดอัตโนมัติ\s*:\s*([^|]+)/i);
    if (m && m[1].trim()) return m[1].trim();
    m = text.match(/ประเภทเวร\s*:?\s*([^|]+)/i);
    if (m && m[1].trim() && m[1].trim() !== '-') return m[1].trim();
    const auto = autoDuties(row?.staff_id, row?.work_date).map(a => a?._effective_label || label(a?.duty_code)).filter(Boolean).join(', ');
    return auto || '';
  }
  function cleanNonAttendanceDetail(note){
    return noteTokens(note).map(cleanTechTokens).filter(Boolean).join(' | ');
  }
  function compactOtReasonTextV222(row){
    if (!isAttendanceOt(row)) {
      const main = String(row?.reason || '').trim() || '-';
      const detail = cleanNonAttendanceDetail(row?.note);
      return { main, detail };
    }
    const duty = dutyFromOtRow(row);
    return { main:'ยืนยันอยู่เวรตามตาราง', detail:duty ? `เวร ${duty}` : '' };
  }
  window.v176OtReasonHelpers = window.v176OtReasonHelpers || {};
  window.v176OtReasonHelpers.compactOtReasonText176 = compactOtReasonTextV222;
  window.v222CompactOtReasonText = compactOtReasonTextV222;

  // ---------- 2) Ch4 cover/self confirmation on selected date ----------
  function activeStaffOptions(selectedId='', excludeId=''){
    const list = (state.staff || []).filter(s => {
      const activeOk = Object.prototype.hasOwnProperty.call(s, 'active') ? (s.active === true || String(s.active).toLowerCase() === 'true') : (s.is_active !== false && String(s.is_active).toLowerCase() !== 'false');
      const role = String(s.role || s.position || '').toLowerCase();
      return activeOk && !role.includes('physician') && !String(s.staff_type || '').includes('แพทย์') && String(s.id) !== String(excludeId || '');
    });
    let ordered = list;
    try { ordered = orderedStaff(list); } catch (_) { ordered = list.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
    return ordered.map(s => `<option value="${esc(s.id)}" ${String(s.id)===String(selectedId)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('');
  }
  function ch4Key(a){ return [a?.id || '', norm(a?.duty_date), a?.staff_id || '', a?.duty_code || 'ช4'].map(x => String(x || '').replace(/\|/g, '')).join('|'); }
  function findAssignmentByKey(key){
    const [id, date, staffId, dutyCode] = String(key || '').split('|');
    return (state.rosterAssignments || []).find(a => {
      if (!isCh4(a?.duty_code)) return false;
      if (id && String(a?.id || '') === id) return true;
      return norm(a?.duty_date) === date && String(a?.staff_id || '') === staffId && String(a?.duty_code || '') === dutyCode;
    }) || null;
  }
  function ch4ConfirmRows(){ return Array.isArray(state.shiftConfirmations) ? state.shiftConfirmations : []; }
  function ch4ConfirmationFor(a){
    const date = norm(a?.duty_date || a?.work_date);
    const owner = String(a?.staff_id || a?.owner_staff_id || '');
    const code = String(a?.duty_code || a?.shift_type || '');
    const aid = String(a?.id || a?.roster_assignment_id || '');
    return ch4ConfirmRows().slice().sort((x,y) => String(y?.updated_at || y?.confirmed_at || y?.covered_at || '').localeCompare(String(x?.updated_at || x?.confirmed_at || x?.covered_at || ''))).find(r => {
      const rDate = norm(r?.work_date || r?.duty_date);
      const rOwner = String(r?.owner_staff_id || r?.staff_id || '');
      const rCode = String(r?.duty_code || r?.shift_type || '');
      const rAid = String(r?.roster_assignment_id || '');
      if (aid && rAid && rAid === aid) return true;
      return rDate === date && rOwner === owner && (rCode === code || (isCh4(rCode) && isCh4(code)));
    }) || null;
  }
  function ch4Status(a){
    const rec = ch4ConfirmationFor(a);
    const st = String(rec?.status || '').trim();
    if (st === 'completed_self' || st === 'confirmed_self') return 'ทำเองแล้ว';
    if (st === 'covered_by_other') return `มีคนอยู่แทนแล้ว: ${staffName(rec?.covered_by_staff_id)}`;
    return 'ยังไม่ยืนยัน';
  }
  function ch4Closed(a){
    const st = String(ch4ConfirmationFor(a)?.status || '').trim();
    return st === 'completed_self' || st === 'confirmed_self' || st === 'covered_by_other';
  }
  async function saveCh4Confirmation(assignment, status, coveredByStaffId='', note=''){
    if (!assignment) throw new Error('ไม่พบรายการ ช4 นี้ กรุณารีเฟรชหน้า');
    if (state.shiftConfirmationReadyV209 === false) throw new Error('ยังไม่ได้เปิดตาราง shift_confirmations');
    const now = new Date().toISOString();
    const payload = {
      roster_assignment_id: assignment.id || null,
      shift_type: 'ช4',
      duty_code: assignment.duty_code || 'ช4',
      work_date: norm(assignment.duty_date),
      owner_staff_id: assignment.staff_id,
      status,
      covered_by_staff_id: coveredByStaffId || null,
      covered_by_name: coveredByStaffId ? staffName(coveredByStaffId) : null,
      covered_note: note || null,
      note: note || null,
      confirmed_at: now,
      covered_at: status === 'covered_by_other' ? now : null,
      updated_by: sid()
    };
    const attempts = [
      { ...payload },
      (() => { const p = { ...payload }; delete p.covered_by_name; return p; })(),
      (() => { const p = { ...payload }; delete p.roster_assignment_id; delete p.covered_by_name; return p; })()
    ];
    let lastErr = null;
    for (const p of attempts) {
      const res = await sb.from(CH4_TABLE).upsert(p, { onConflict:'work_date,owner_staff_id,duty_code' }).select('*').maybeSingle();
      if (!res.error) return res.data || p;
      lastErr = res.error;
      if (!/column|schema|cache|constraint|conflict/i.test(String(res.error?.message || ''))) break;
    }
    throw lastErr || new Error('บันทึกสถานะ ช4 ไม่สำเร็จ');
  }
  async function confirmCh4Self(key){
    const a = findAssignmentByKey(key);
    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog('บันทึกว่าทำ ช4 เอง และไม่สร้าง OT 8 ชั่วโมงอัตโนมัติ ใช่ไหม?', 'ยืนยันทำ ช4 เอง')
      : window.confirm('บันทึกว่าทำ ช4 เองใช่ไหม?');
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกสถานะ ช4'); } catch (_) {}
    try {
      await saveCh4Confirmation(a, 'completed_self', '', 'ทำ ช4 เอง');
      await loadAllData(); renderPage();
      toast('บันทึก ช4 เองแล้ว ถ้าจะเบิก OT ให้กรอกเวลาจริงในส่วนที่ 2');
    } catch (err) { toast('บันทึก ช4 ไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  async function confirmCh4Cover(key, coveredBy){
    const a = findAssignmentByKey(key);
    if (!coveredBy) return toast('กรุณาเลือกคนอยู่แทนก่อน', 'error');
    const ok = typeof confirmDialog === 'function'
      ? await confirmDialog(`ย้าย ช4 ให้ ${staffName(coveredBy)} ใช่ไหม?`, 'ยืนยันย้าย ช4')
      : window.confirm(`บันทึกว่า ${staffName(coveredBy)} อยู่แทน ช4 ใช่ไหม?`);
    if (!ok) return;
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังบันทึกคนอยู่แทน'); } catch (_) {}
    try {
      await saveCh4Confirmation(a, 'covered_by_other', coveredBy, `มีคนอยู่แทน: ${staffName(coveredBy)}`);
      if(typeof window.cnmiV441Ch4Transfer?.transferCh4Assignment==='function') await window.cnmiV441Ch4Transfer.transferCh4Assignment(a,coveredBy,{ownerStaffId:a.staff_id});
      await loadAllData(); renderPage();
      toast(`ย้าย ช4 ให้ ${staffName(coveredBy)} แล้ว • ไม่สร้าง OT อัตโนมัติ`);
    } catch (err) { toast('บันทึกคนอยู่แทนไม่สำเร็จ: ' + friendly(err), 'error'); }
    finally { try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {} }
  }
  function renderCh4Actions(a){
    const key = ch4Key(a);
    if (state.shiftConfirmationReadyV209 === false) return `<div class="notice error-notice compact">ยังไม่ได้เปิดตารางบันทึกสถานะ ช4</div>`;
    if (ch4Closed(a)) return `<button class="ghost-btn" type="button" disabled>ปิดรายการแล้ว</button>`;
    return `<div class="v222-ch4-action-row">
      <button class="primary-btn" type="button" data-ch4-self-v222="${esc(key)}">ทำ ช4 เอง</button>
      <label class="v222-cover-select">คนอยู่แทน <select data-ch4-cover-select-v222="${esc(key)}"><option value="">เลือกคนอยู่แทน</option>${activeStaffOptions('', a.staff_id)}</select></label>
      <button class="ghost-btn" type="button" data-ch4-cover-v222="${esc(key)}">ย้าย ช4</button>
    </div>`;
  }
  function renderCh4Box(rows){
    if (!rows.length) return '';
    return `<div class="notice soft-notice compact v222-ch4-box"><b>ช4 / งานปั่นเลือด</b><div class="muted">เลือก “ทำเอง” หรือเลือกคนอยู่แทนก่อนบันทึก คนอยู่แทนค่อยกรอก OT จริงในส่วนที่ 2</div>${rows.map(a => `<div class="v222-ch4-item"><div><b>${esc(label(a.duty_code))}</b> ${b(ch4Status(a), statusCls(ch4Status(a)))}</div>${renderCh4Actions(a)}</div>`).join('')}</div>`;
  }
  function renderDutyCardV222(){
    const staffId = sid();
    const d = norm(state.myDutyDateV221 || today());
    const duties = dutiesOn(staffId, d);
    const auto = duties.filter(x => isAutoDuty(x?.duty_code));
    const manual = duties.filter(x => isManualDuty(x?.duty_code));
    const ch3 = duties.filter(x => isCh3Composite(x?.duty_code));
    const c4 = duties.filter(x => isCh4(x?.duty_code));
    const att = attendanceRows(staffId, d);
    const ot = attendanceOtRows(staffId, d);
    const latestOt = latest(ot);
    const win = auto.length ? shiftWindowForDuties(d, auto) : null;
    let status = 'ยังไม่ได้ยืนยัน';
    if (latestOt) status = statusText(latestOt);
    else if (att.length && auto.length) status = 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT';
    else if (!auto.length && manual.length) status = 'ต้องกรอกเวลาจริง/เลือกสถานะ';
    else if (!duties.length) status = 'ไม่มีเวรที่ต้องยืนยัน';
    const dutyNames = duties.length ? duties.map(a => a?._effective_label || label(a.duty_code)).join(' / ') : '-';
    const timeText = auto.length ? (ch3.length ? `${win.label} (เวรหลัก 8 ชม.)` : win.label) : (manual.length ? 'เวลาจริงในส่วนที่ 2' : '-');
    const canCheck = auto.length && !latestOt && d <= today();
    return `<div class="card ot-card my-duty-today-card v222-ot-card">
      <div class="section-title"><div><h3>ส่วนที่ 1 เวรของฉันตามวันที่เลือก</h3><p class="hint">เลือกย้อนหลังได้ กรณีลืมกดยืนยันเวร • ช3A/ช3B ยืนยันเวรหลัก 8 ชม. ได้เหมือน ช9</p></div></div>
      <label class="wide v222-duty-date-label">เลือกวันที่อยู่เวร <input id="myDutyDateV221" type="date" value="${esc(d)}" max="${esc(today())}"></label>
      <div class="my-duty-detail v222-duty-detail"><div><span class="muted">เวร</span><b>${esc(dutyNames)}</b></div><div><span class="muted">เวลา</span><b>${esc(timeText)}</b></div><div><span class="muted">สถานะ</span>${b(status, statusCls(status))}</div></div>
      ${ch3.length ? '<div class="notice soft-notice compact v251-ch3-composite-note"><b>ช3A/ช3B = ช9 + ช4</b><br>กด “ยืนยันเวรหลัก 8 ชม.” ด้านล่างก่อน ส่วนเวลาปั่นเลือด/อยู่ต่อของ ช4 ให้กรอกเพิ่มในส่วนที่ 2 ตามเวลาจริง</div>' : ''}
      ${renderCh4Box(c4)}
      ${!duties.length ? '<div class="my-duty-empty"><b>วันที่เลือกไม่มีเวรที่ต้องยืนยัน</b><span class="muted">ถ้าอยู่ต่อจริง ใช้ส่วนที่ 2 เพื่อขอ OT เพิ่ม</span></div>' : ''}
      <div class="actions v222-ot-actions"><button class="primary-btn" type="button" data-check-in-selected-v221="${esc(d)}" ${canCheck ? '' : 'disabled'}>${latestOt ? 'รอ/บันทึกแล้ว' : (canCheck ? (ch3.length ? 'ยืนยันเวรหลัก 8 ชม.' : 'ส่งให้ Admin อนุมัติ') : 'ไม่ต้องยืนยันเวรหลัก')}</button></div>
    </div>`;
  }
  function renderMyMonthDutiesV222(){
    const staffId = sid();
    const key = state.myDutyMonthFilter || state.monthKey || today().slice(0,7);
    const rows = (()=>{
      const out=[];
      const [y,m]=String(key).split('-').map(Number),last=new Date(y,m,0).getDate();
      for(let day=1;day<=last;day++)out.push(...dutiesOn(staffId,`${key}-${String(day).padStart(2,'0')}`));
      return out.sort((a,b)=>norm(a?.duty_date).localeCompare(norm(b?.duty_date))||String(a?.duty_code||'').localeCompare(String(b?.duty_code||''),'th'));
    })();
    const body = rows.map(a => {
      const d = norm(a.duty_date);
      const auto = isAutoDuty(a.duty_code);
      const ot = latest(attendanceOtRows(staffId, d));
      const att = attendanceRows(staffId, d).length;
      const st = isCh4(a.duty_code) ? ch4Status(a) : (ot ? statusText(ot) : (att && auto ? 'ยืนยันแล้ว แต่ยังไม่มีรายการ OT' : (auto ? 'ยังไม่ได้ยืนยัน' : 'บันทึกเวลาจริงถ้าจะเบิก')));
      const time = auto ? (isCh3Composite(a.duty_code) ? `${shiftWindowForDuties(d, [a]).label} + ช4 ตามเวลาจริง` : shiftWindowForDuties(d, [a]).label) : 'เวลาจริง';
      return `<tr><td>${thDate(d)}</td><td><b>${esc(a?._effective_label || label(a.duty_code))}</b></td><td>${esc(time)}</td><td>${b(st, statusCls(st))}</td></tr>`;
    }).join('');
    return `<div class="card wide-card v222-my-month-card" style="grid-column:1/-1;"><div class="section-title"><div><h3>เวรของฉันเดือนนี้</h3></div><label>เดือน <input id="myDutyMonthFilter" type="month" value="${esc(key)}"></label></div><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวร</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody>${body || '<tr><td colspan="4">ยังไม่มีเวรเดือนนี้</td></tr>'}</tbody></table></div></div>`;
  }
  const previousRenderOtPage = window.renderOtPage || (typeof renderOtPage === 'function' ? renderOtPage : null);
  window.renderOtPage = renderOtPage = function renderOtPageV222(){
    if (isAdminMode()) return previousRenderOtPage ? previousRenderOtPage.apply(this, arguments) : '';
    const d = norm(state.myDutyDateV221 || today());
    const mine = (state.otRequests || []).filter(x => String(x?.staff_id || '') === String(sid() || ''));
    const corrected = (r) => window.cnmiV221DutyOt?.correctedOtRow ? window.cnmiV221DutyOt.correctedOtRow(r) : r;
    return `<div class="grid grid-2 ot-page v222-ot-page">
      ${renderDutyCardV222()}
      <div class="card ot-card v222-ot-card"><h3>ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด</h3><p class="hint compact">ใช้เมื่ออยู่ต่อจริง/ปั่นเลือดจริง กรอกเวลาเริ่ม-สิ้นสุด แล้วรอ Admin เทียบ LIS</p><form id="otForm" class="form-grid"><label>วันที่ <input name="work_date" type="date" value="${esc(d)}" required></label><label>เริ่มเวลา <input name="start_time" type="time" value="16:00" required></label><label>ถึงเวลา <input name="end_time" type="time" required></label><label>เหตุผล <select name="reason">${(window.OT_REASONS || (typeof OT_REASONS !== 'undefined' ? OT_REASONS : ['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','อื่นๆ'])).map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label><label class="wide">รายละเอียด <input name="note" placeholder="เช่น อยู่แทน ช4 ของ... / ปั่นเลือดถึง 18:20 / รอเทียบ LIS"></label><button class="primary-btn wide" type="submit">ส่งให้ Admin อนุมัติ</button></form></div>
      ${renderMyMonthDutiesV222()}
      <div class="card wide-card" style="grid-column:1/-1;"><div class="section-title"><h3>รายการ OT ของฉัน</h3></div>${typeof renderOtTable === 'function' ? renderOtTable(mine.map(corrected)) : ''}</div>
      <div class="card" style="grid-column:1/-1;"><h3>ส่วนที่ 4 สรุป OT รายเดือน</h3>${typeof renderOtSummary === 'function' ? renderOtSummary() : ''}</div>
    </div>`;
  };

  // ---------- 3) Position management explanation / link source and actual master ----------
  function polishPositionManagement(){
    if (state?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    if (!root) return;
    const slot = root.querySelector('.v221-slot-manager-card');
    if (slot && !slot.dataset.v222Labeled) {
      slot.dataset.v222Labeled = '1';
      const h3 = slot.querySelector('h3');
      if (h3) h3.textContent = 'Template Slot ตามจำนวนคน (ต้นทาง)';
      const hint = slot.querySelector('.hint');
      if (hint) hint.textContent = 'แก้รายละเอียดที่นี่ แล้วกดอัปเดตฐานข้อมูล เพื่อให้ตารางรายวัน/รายเดือนใช้ข้อมูลเดียวกัน';
    }
    const list = Array.from(root.querySelectorAll('h3')).find(x => /รายการตำแหน่งทั้งหมด/.test(x.textContent || ''));
    if (list && !list.dataset.v222Renamed) {
      list.dataset.v222Renamed = '1';
      list.textContent = 'ฐานตำแหน่งจริงที่ระบบใช้ (เชื่อมจาก Template)';
    }
  }

  // ---------- 4) Cleaner monthly position toolbar + better balancing weights ----------
  const previousPositionLoadWeight = window.positionLoadWeight || (typeof positionLoadWeight === 'function' ? positionLoadWeight : null);
  window.positionLoadWeight = positionLoadWeight = function positionLoadWeightV222(positionOrCode){
    const raw = typeof positionOrCode === 'string' ? positionOrCode : (positionOrCode?.code || positionOrCode?.position_code || '');
    const code = String(raw || '').replace(/\s+#\d+$/, '').trim();
    if (/^BB-Report/.test(code) || code === 'DR-Processing') return 1.35;
    if (/^BB-Manual/.test(code) || code === 'BB-Approve') return 1.20;
    if (/^DR-Main/.test(code)) return 1.10;
    if (/^DR-Finger/.test(code)) return 1.00;
    if (/Register|Support|Preparing/.test(code)) return 0.90;
    return previousPositionLoadWeight ? previousPositionLoadWeight(positionOrCode) : 1;
  };
  function zoneGroup(position){
    const z = String(position?.zone || '').trim();
    if (z === 'Blood Bank' || z === 'Manual') return 'BB/Manual';
    if (z === 'Donor Room') return 'Donor';
    if (z === 'ออกหน่วย') return 'Outing';
    return z || 'Other';
  }
  function isQcPosition(position){
    const c = String(position?.code || position?.position_code || '').replace(/\s+#\d+$/, '').trim();
    return /^BB-Report/.test(c) || c === 'DR-Processing' || c === 'DR-Preparation';
  }
  function fiscalStartFor(date){
    const d = new Date(`${norm(date) || today()}T00:00:00`);
    const y = d.getFullYear();
    const startYear = d.getMonth() >= 9 ? y : y - 1;
    return `${startYear}-10-01`;
  }
  function historicalPositionStats(staffId, date){
    const d = norm(date);
    const start = fiscalStartFor(d);
    const out = { group:{}, qc:0 };
    (state.positions || []).forEach(r => {
      const wd = norm(r?.work_date);
      if (!wd || wd < start || wd >= d || String(r?.staff_id || '') !== String(staffId || '')) return;
      const pos = { code:r?.position_code || r?.code, position_code:r?.position_code, zone:r?.zone };
      const g = zoneGroup(pos);
      out.group[g] = (out.group[g] || 0) + 1;
      if (isQcPosition(pos)) out.qc += 1;
    });
    return out;
  }
  const previousScore = window.monthPositionCandidateScore || (typeof monthPositionCandidateScore === 'function' ? monthPositionCandidateScore : null);
  window.monthPositionCandidateScore = monthPositionCandidateScore = function monthPositionCandidateScoreV222(staff, position, counts, rows, date, options={}){
    const base = previousScore ? Number(previousScore(staff, position, counts, rows, date, options)) || 0 : 0;
    const c = counts?.[staff.id] || { byCode:{}, byZone:{}, total:0, load:0 };
    const g = zoneGroup(position);
    const currentGroupCount = g === 'BB/Manual'
      ? Number(c.byZone?.['Blood Bank'] || 0) + Number(c.byZone?.['Manual'] || 0)
      : Number(c.byZone?.[position?.zone] || 0);
    const hist = historicalPositionStats(staff.id, date);
    const histGroup = hist.group[g] || 0;
    const qcPenalty = isQcPosition(position) ? ((hist.qc || 0) * 90 + (c.byCode?.[position?.code] || 0) * 130) : 0;
    const groupPenalty = (currentGroupCount * 46) + (histGroup * 10);
    return base + groupPenalty + qcPenalty;
  };
  window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV222(){
    if (!isAdminMode()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>';
    const key = state.positionMonthKey || state.monthKey || today().slice(0,7);
    const range = getMonthRange(key);
    const y = range.y, m = range.m, last = range.last || new Date(y, m, 0).getDate();
    const dates = Array.from({length:last}, (_,i)=>`${y}-${pad(m)}-${pad(i+1)}`);
    const rows = state.monthPositionDraft?.monthKey === key ? state.monthPositionDraft.rows : (state.positions || []).filter(x => String(x.work_date || '').startsWith(key));
    const savedCount = (state.positions || []).filter(x => String(x.work_date || '').startsWith(key)).length;
    const workingDays = dates.filter(d => !isNoPositionDay(d)).length;
    const summary = typeof renderMonthPositionSummaryHint === 'function' ? renderMonthPositionSummaryHint(rows, dates) : '';
    const matrix = typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix(rows, dates) : '';
    return `<div class="card monthly-position-page v222-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3></div></div>
      <div class="v222-month-toolbar">
        <label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label>
        <button class="ghost-btn" data-create-blank-month-positions>สร้างตารางที่ไม่มีตำแหน่ง</button>
        <button class="soft-btn" data-generate-month-positions>สร้างแผนทั้งเดือน</button>
        <button class="primary-btn" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button>
        <button class="ghost-btn danger" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button>
        <button class="ghost-btn" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button>
        <button class="soft-btn" data-position-month-overview-v169>ดูภาพรวมจัดตำแหน่ง</button>
        <button class="soft-btn qc-rotation-btn" data-qc-rotation-v169>ติดตามการหมุนเวียน QC</button>
        <span class="v222-mini-badges">${b(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black')} ${b(`วันทำงาน ${workingDays} วัน`, 'blue')}</span>
      </div>
      ${summary}${matrix}
    </div>`;
  };

  const previousRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (previousRenderPage) {
    window.renderPage = renderPage = function renderPageV222(){
      const ret = previousRenderPage.apply(this, arguments);
      setTimeout(() => { try { polishPositionManagement(); } catch (err) { console.warn(`${VERSION}: polish position management failed`, err); } }, 0);
      return ret;
    };
  }

  document.addEventListener('click', function(e){
    const self = e.target?.closest?.('[data-ch4-self-v222]');
    if (self) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); confirmCh4Self(self.getAttribute('data-ch4-self-v222')); return; }
    const cover = e.target?.closest?.('[data-ch4-cover-v222]');
    if (cover) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const key = cover.getAttribute('data-ch4-cover-v222');
      const select = document.querySelector(`select[data-ch4-cover-select-v222="${CSS.escape(key)}"]`);
      confirmCh4Cover(key, select?.value || '');
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v222-ch4-box{margin-top:12px}.v222-ch4-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #dbeafe}.v222-ch4-action-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.v222-cover-select{min-width:240px}.v222-cover-select select{min-width:180px}.v222-duty-date-label{display:block;margin-bottom:10px}.v222-duty-detail b{white-space:normal}
    .v222-month-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:8px 0 12px}.v222-month-toolbar label{min-width:170px}.v222-month-toolbar button{white-space:nowrap}.v222-mini-badges{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.v222-monthly-position-page .notice,.v222-monthly-position-page .v218-slot-note,.v222-monthly-position-page .v174-save-mode-note,.v222-monthly-position-page .matrix-legend{display:none!important}.v222-monthly-position-page .month-position-summary-hint{display:none!important}
    .v222-ot-page .ot-desktop-table td:nth-child(3){line-height:1.4}.v222-ot-page .muted{font-size:12px}
    @media(max-width:760px){.v222-ch4-item{display:block}.v222-ch4-action-row>*{width:100%}.v222-month-toolbar>*{width:100%}.v222-month-toolbar button{width:100%}.v222-mini-badges{width:100%}}
  `;
  document.head.appendChild(style);

  setTimeout(() => { try { polishPositionManagement(); } catch (_) {} }, 50);
  window.cnmiV222 = { compactOtReasonTextV222, confirmCh4Self, confirmCh4Cover };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v222-clean-ot-ch4-month-position-ui.js", error); }
;

/* Original source: patch-v223-month-plan-source-template-only.js */
try {
/* =========================
   V223 monthly position auto plan + source-template only position management
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V223_MONTH_PLAN_SOURCE_TEMPLATE_ONLY';
  if (window.__CNMI_V223_MONTH_PLAN_SOURCE_TEMPLATE_ONLY__) return;
  window.__CNMI_V223_MONTH_PLAN_SOURCE_TEMPLATE_ONLY__ = true;

  const esc = (v) => {
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const norm = (v) => { try { return normalizeDateKey(v); } catch (_) { return String(v || '').slice(0,10); } };
  const pad2 = (n) => String(n).padStart(2, '0');
  const toast = (msg, tone) => { try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } };
  const adminOk = () => { try { return isAdmin(); } catch (_) { return false; } };
  const currentId = () => { try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } };
  const todayKey = () => { try { return todayStr(); } catch (_) { return new Date().toISOString().slice(0,10); } };
  const monthNow = () => { try { return monthKey(new Date()); } catch (_) { return todayKey().slice(0,7); } };
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
    try {
      if (typeof dailyWorkingStaff === 'function') {
        const list = dailyWorkingStaff(date) || [];
        if (list.length) return list;
      }
    } catch (_) {}
    let rows = Array.isArray(state?.staff) ? state.staff.slice() : [];
    rows = rows.filter(st => {
      try { return isDailyPositionEnabled(st) && !isActiveLeaveOn(st.id, date); }
      catch (_) { return st?.id && st?.is_active !== false && st?.active !== false; }
    });
    try { return orderedStaff(rows); } catch (_) { return rows.sort((a,b) => String(a.nickname || a.full_name || '').localeCompare(String(b.nickname || b.full_name || ''), 'th')); }
  }
  function normalSlotsForDate(date){
    try {
      const api = window.cnmiDayPositionSlotsV218;
      if (api?.daySlotsForDate218) {
        const list = api.daySlotsForDate218(date) || [];
        if (list.length) return list.map(p => ({ ...p }));
      }
    } catch (_) {}
    try {
      const list = positionTemplateForDate(date) || [];
      if (list.length) return list.filter(p => String(p?.zone || '') !== 'ออกหน่วย').map(p => ({ ...p }));
    } catch (_) {}
    const fallback = Array.isArray(window.ALL_POSITION_TEMPLATES) ? window.ALL_POSITION_TEMPLATES : (typeof ALL_POSITION_TEMPLATES !== 'undefined' ? ALL_POSITION_TEMPLATES : []);
    return fallback.filter(p => p && p.code && String(p.zone || '') !== 'ออกหน่วย').map(p => ({ ...p }));
  }
  function outingSlotsForDate(date){
    try {
      if (window.cnmiPositionCatalogV182?.outingPositions182) return (window.cnmiPositionCatalogV182.outingPositions182() || []).map(p => ({ ...p }));
    } catch (_) {}
    try { return (OUTING_POSITIONS || []).map(p => ({ ...p, is_outing:true })); } catch (_) { return []; }
  }
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
  function isQc(pos){
    const c = baseCode(pos?.code || pos?.position_code || '');
    return /^BB-Report/.test(c) || c === 'DR-Processing' || c === 'DR-Preparation';
  }
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
      const g = zoneGroup(pos);
      const c = baseCode(pos.code || '');
      out.group[g] = (out.group[g] || 0) + 1;
      out.code[c] = (out.code[c] || 0) + 1;
      if (isQc(pos)) out.qc += 1;
    });
    return out;
  }
  function initCount(staffId){ return { total:0, load:0, group:{}, code:{}, qc:0 }; }
  function addCount(counts, staffId, pos){
    if (!staffId || !pos) return;
    const c = counts[staffId] || (counts[staffId] = initCount(staffId));
    const g = zoneGroup(pos); const code = baseCode(pos.code || pos.position_code || '');
    c.total += 1;
    c.load += loadWeight(pos);
    c.group[g] = (c.group[g] || 0) + 1;
    c.code[code] = (c.code[code] || 0) + 1;
    if (isQc(pos)) c.qc += 1;
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
    const id = staff.id;
    const c = counts[id] || initCount(id);
    const hist = historicalStats(id, date);
    const g = zoneGroup(pos);
    const code = baseCode(pos.code || '');
    let score = 0;
    score += c.load * 70;
    score += c.total * 25;
    score += (c.group[g] || 0) * 95;
    score += (hist.group[g] || 0) * 12;
    score += (c.code[code] || 0) * 180;
    score += (hist.code[code] || 0) * 20;
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
    try {
      if (typeof rowForStaffPosition === 'function') {
        const r = rowForStaffPosition(staff, date, pos, {});
        if (r?.staff_id && r?.position_code) return r;
      }
    } catch (_) {}
    return {
      work_date: date,
      position_code: pos.code,
      zone: pos.zone || '',
      break_time: pos.break_time || '-',
      main_rule: pos.main_rule || '',
      job_desc: pos.job_desc || '',
      staff_id: staff.id,
      updated_by: currentId()
    };
  }
  function blankRowsForMonth(key){
    const { y, m, last } = rangeOfMonth(key);
    const rows = [];
    for (let day=1; day<=last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (isNoPosition(date)) continue;
      activePositionStaff(date).forEach(st => rows.push({ work_date:date, position_code:'', code:'', zone:'', break_time:'', main_rule:'', job_desc:'', staff_id:st.id, updated_by:currentId(), _blankTableV223:true }));
    }
    return { monthKey:key, rows, blankTable:true };
  }
  function buildAutoPlan(key){
    const { y, m, last } = rangeOfMonth(key);
    const rows = [];
    const counts = {};
    for (let day=1; day<=last; day += 1) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (isNoPosition(date)) continue;
      const working = activePositionStaff(date);
      if (!working.length) continue;
      const used = new Set();
      let slots = [];
      let pools = [{ slots:null, pool:working }];
      if (hasOutingSafe(date)) {
        const outIds = outingIds(date);
        const outingPool = working.filter(st => outIds.has(st.id));
        const roomPool = working.filter(st => !outIds.has(st.id));
        const roomSlots = normalSlotsForDate(date).filter(p => ['Blood Bank','Manual'].includes(String(p.zone || '')));
        const outingSlots = outingSlotsForDate(date);
        pools = [
          { slots:outingSlots, pool:outingPool },
          { slots:roomSlots, pool:roomPool }
        ];
      } else {
        slots = normalSlotsForDate(date);
        pools = [{ slots, pool:working }];
      }
      pools.forEach(group => {
        (group.slots || []).forEach(pos => {
          const st = chooseStaff(pos, date, group.pool || [], used, counts, rows);
          if (!st) return;
          used.add(String(st.id));
          rows.push(makeRow(date, st, pos));
          addCount(counts, st.id, pos);
        });
      });
    }
    return { monthKey:key, rows, autoPlanV223:true };
  }
  async function confirmReplace(action){
    const key = monthKeyFromUi();
    const hasRealDraft = state?.monthPositionDraft?.monthKey === key && (state.monthPositionDraft.rows || []).some(r => r?.position_code);
    if (!hasRealDraft) return true;
    try { if (typeof confirmDialog === 'function') return await confirmDialog(`มีร่างที่ยังไม่ได้บันทึก ต้องการ${action}และแทนที่ร่างเดิมหรือไม่?`, 'ยืนยันแทนที่ร่าง'); } catch (_) {}
    return window.confirm(`มีร่างที่ยังไม่ได้บันทึก ต้องการ${action}และแทนที่ร่างเดิมหรือไม่?`);
  }
  async function createBlank(){
    if (!adminOk()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (!(await confirmReplace('สร้างตารางที่ไม่มีตำแหน่ง'))) return;
    const key = monthKeyFromUi();
    state.positionMonthKey = key;
    state.monthPositionDraft = blankRowsForMonth(key);
    renderPage();
    toast('สร้างตารางที่ไม่มีตำแหน่งแล้ว เลือกตำแหน่งเองแล้วกดบันทึก/ประกาศ');
  }
  async function generateAuto(){
    if (!adminOk()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    if (!(await confirmReplace('สร้างแผนทั้งเดือน'))) return;
    const key = monthKeyFromUi();
    let draft;
    try { draft = buildAutoPlan(key); } catch (err) { console.error(`${VERSION}: auto build failed`, err); return toast('สร้างแผนอัตโนมัติไม่สำเร็จ: ' + (err?.message || String(err)), 'error'); }
    state.positionMonthKey = key;
    state.monthPositionDraft = draft;
    renderPage();
    const real = (draft.rows || []).filter(r => r?.position_code && r?.staff_id).length;
    if (!real) return toast('ยังสร้างแผนอัตโนมัติไม่ได้ เพราะไม่พบ Slot หรือเจ้าหน้าที่ที่เข้าเงื่อนไข', 'error');
    toast(`สร้างแผนทั้งเดือนแล้ว ${real} รายการ ตรวจทานก่อนบันทึก/ประกาศ`);
  }

  // override global builder too, so Save does not fall back to blank when no draft exists.
  window.buildMonthlyPositionDraft = buildMonthlyPositionDraft = function buildMonthlyPositionDraftV223(key){
    return buildAutoPlan(String(key || monthKeyFromUi()).slice(0,7));
  };

  window.renderPositionMonthPage = renderPositionMonthPage = function renderPositionMonthPageV223(){
    if (!adminOk()) return typeof noPermission === 'function' ? noPermission() : '<div class="card">ไม่มีสิทธิ์ใช้งาน</div>';
    const key = state.positionMonthKey || state.monthKey || monthNow();
    const r = rangeOfMonth(key);
    const dates = Array.from({ length:r.last }, (_,i) => `${r.y}-${pad2(r.m)}-${pad2(i+1)}`);
    const rows = state.monthPositionDraft?.monthKey === key ? (state.monthPositionDraft.rows || []) : (state.positions || []).filter(x => String(x.work_date || '').startsWith(key));
    const savedCount = (state.positions || []).filter(x => String(x.work_date || '').startsWith(key)).length;
    const workingDays = dates.filter(d => !isNoPosition(d)).length;
    const matrix = typeof renderMonthPositionMatrix === 'function' ? renderMonthPositionMatrix(rows, dates) : '';
    return `<div class="card monthly-position-page v223-monthly-position-page"><div class="section-title"><div><h3>จัดตำแหน่งรายเดือน ${esc(key)}</h3></div></div>
      <div class="v223-month-toolbar">
        <label>เดือน <input type="month" id="positionMonthInput" value="${esc(key)}"></label>
        <button class="ghost-btn" type="button" data-v223-create-blank-month>สร้างตารางที่ไม่มีตำแหน่ง</button>
        <button class="soft-btn" type="button" data-v223-generate-month-plan>สร้างแผนทั้งเดือน</button>
        <button class="primary-btn" type="button" data-save-month-positions>บันทึก/ประกาศให้ Staff เห็น</button>
        <button class="ghost-btn danger" type="button" data-clear-month-positions>ล้างข้อมูลเดือนนี้</button>
        <button class="ghost-btn" type="button" data-restore-month-positions>ย้อนกลับข้อมูลล่าสุด</button>
        <button class="soft-btn" type="button" data-position-month-overview-v169>ดูภาพรวมจัดตำแหน่ง</button>
        <button class="soft-btn qc-rotation-btn" type="button" data-qc-rotation-v169>ติดตามการหมุนเวียน QC</button>
        <span class="v223-mini-badges">${(typeof badge === 'function' ? badge(`มีข้อมูล ${savedCount} รายการ`, savedCount ? 'green' : 'black') : `<span>${savedCount}</span>`)} ${(typeof badge === 'function' ? badge(`วันทำงาน ${workingDays} วัน`, 'blue') : `<span>${workingDays}</span>`)}</span>
      </div>${matrix}</div>`;
  };

  function collapsePositionManagementToTemplate(){
    if (state?.page !== 'positionManagement') return;
    const root = document.getElementById('pageContent');
    const slot = root?.querySelector?.('.v221-slot-manager-card');
    if (!slot) return;
    const h3 = slot.querySelector('h3');
    if (h3) h3.textContent = 'Template Slot ตามจำนวนคน (ต้นทางเดียว)';
    const hint = slot.querySelector('.section-title .hint');
    if (hint) hint.textContent = 'แก้รายละเอียด Slot จากส่วนนี้ แล้วกดอัปเดตฐานข้อมูลจากชุด 8-14 ทั้งหมด ตารางรายวัน/รายเดือนจะใช้ข้อมูลชุดเดียวกัน';
    const page = slot.parentElement || root;
    Array.from(page.children).forEach(ch => {
      if (ch === slot) return;
      ch.classList.add('v223-hide-position-master');
      ch.setAttribute('aria-hidden', 'true');
    });
  }
  const prevRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (prevRenderPage) {
    window.renderPage = renderPage = function renderPageV223(){
      const out = prevRenderPage.apply(this, arguments);
      setTimeout(collapsePositionManagementToTemplate, 0);
      return out;
    };
  }

  document.addEventListener('click', function(e){
    const blank = e.target?.closest?.('[data-v223-create-blank-month]');
    const gen = e.target?.closest?.('[data-v223-generate-month-plan]');
    if (!blank && !gen) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (blank) createBlank();
    else generateAuto();
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v223-hide-position-master{display:none!important}
    .v223-month-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:12px;margin:8px 0 12px}
    .v223-month-toolbar label{min-width:170px}.v223-month-toolbar button{white-space:nowrap}.v223-mini-badges{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .v223-monthly-position-page .notice,.v223-monthly-position-page .v218-slot-note,.v223-monthly-position-page .v174-save-mode-note,.v223-monthly-position-page .matrix-legend,.v223-monthly-position-page .month-position-summary-hint{display:none!important}
    @media(max-width:760px){.v223-month-toolbar>*{width:100%}.v223-month-toolbar button{width:100%}.v223-mini-badges{width:100%}}
  `;
  document.head.appendChild(style);

  setTimeout(collapsePositionManagementToTemplate, 100);
  window.cnmiV223 = { buildAutoPlan, blankRowsForMonth, generateAuto, createBlank };
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v223-month-plan-source-template-only.js", error); }
;

/* Original source: patch-v224-slot-template-crud-month-plan-hard-fix.js */
try {
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

} catch (error) { console.error("[v569] patch-v224-slot-template-crud-month-plan-hard-fix.js", error); }
;
