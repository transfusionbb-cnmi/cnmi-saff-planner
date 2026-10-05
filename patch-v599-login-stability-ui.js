/* CNMI Staff Planner V599 — Stable Login + polished UI
 * Fixes:
 * - Prevent duplicate enterApp/loadAllData calls during SIGNED_IN + form submit.
 * - Remove reload fallback after successful sign-in (no reload loop / white shell).
 * - Bound profile/data/session startup calls so the UI cannot spin forever.
 * - Keep Mahidol local-part login and preset Username login.
 * - Keep a visible login shell as a failsafe if startup has an exception.
 * - Does not change leave/no-duty quotas, physician rules, OT, HR, or roster logic.
 */
(() => {
  'use strict';
  const VERSION = 'V599_LOGIN_STABILITY_UI';
  if (window.__CNMI_V599_LOGIN_STABILITY_UI__) return;
  window.__CNMI_V599_LOGIN_STABILITY_UI__ = true;

  const MODE_KEY = 'cnmi-login-mode-v599';
  const ID_KEY = 'cnmi-login-id-v599';
  const DOMAIN = '@mahidol.ac.th';
  let submitting = false;
  let enterPromise = null;

  const $ = id => document.getElementById(id);
  const text = v => String(v ?? '').trim();
  const low = v => text(v).toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
      Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || 'การเชื่อมต่อใช้เวลานานเกินไป')), ms);
      })
    ]);
  }

  function getClient() {
    try { if (typeof sb !== 'undefined' && sb?.auth) return sb; } catch (_) {}
    try { if (window.sb?.auth) return window.sb; } catch (_) {}
    return null;
  }

  async function waitForClient(ms = 9000) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const client = getClient();
      if (client?.auth) return client;
      await sleep(80);
    }
    throw new Error('ระบบเข้าสู่ระบบยังโหลดไม่ครบ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่');
  }

  function storedMode() {
    try {
      const current = localStorage.getItem(MODE_KEY) || localStorage.getItem('cnmi-login-mode-v598');
      return current === 'username' ? 'username' : 'mahidol';
    } catch (_) { return 'mahidol'; }
  }

  function currentMode() {
    const selected = document.querySelector('[data-v599-login-mode].active')?.dataset?.v599LoginMode;
    return selected === 'username' ? 'username' : 'mahidol';
  }

  function rememberedId() {
    try { return text(localStorage.getItem(ID_KEY) || localStorage.getItem('cnmi-login-id-v598')); }
    catch (_) { return ''; }
  }

  function saveLoginChoice(mode, value) {
    try {
      localStorage.setItem(MODE_KEY, mode === 'username' ? 'username' : 'mahidol');
      localStorage.setItem(ID_KEY, text(value));
    } catch (_) {}
  }

  function stripMahidolDomain(value) {
    return text(value).replace(/@mahidol\.ac\.th$/i, '');
  }

  function isMahidolEmail(email) {
    return /^[^\s@]+@mahidol\.ac\.th$/i.test(text(email));
  }

  function ensurePolishedMarkup() {
    const authCard = document.querySelector('#authView .auth-card');
    const form = $('loginForm');
    let input = $('loginEmail');
    if (!authCard || !form || !input) return;

    // Header: stable static structure, no repeated observer or animation work.
    if (!authCard.querySelector('.v599-brand-row')) {
      const oldBrand = authCard.querySelector(':scope > .brand-mark');
      const oldH1 = authCard.querySelector(':scope > h1');
      const oldSub = authCard.querySelector(':scope > p.muted');
      const row = document.createElement('div');
      row.className = 'v599-brand-row';
      const brand = oldBrand || document.createElement('div');
      brand.className = 'brand-mark';
      if (!brand.querySelector('img')) brand.innerHTML = '<img src="app-icon-1024.png?v=299" alt="CNMI Staff Planner">';
      const copy = document.createElement('div');
      copy.className = 'v599-brand-copy';
      copy.innerHTML = '<h1 class="v599-app-name">Staff Planner</h1><p class="v599-app-subtitle">เวชศาสตร์บริการโลหิต · Blood Bank CNMI</p>';
      row.append(brand, copy);
      authCard.insertBefore(row, authCard.firstChild);
      if (oldH1) oldH1.remove();
      if (oldSub) oldSub.remove();
    }
    if (!authCard.querySelector('.v599-login-intro')) {
      const intro = document.createElement('p');
      intro.className = 'v599-login-intro';
      intro.textContent = 'เลือกวิธีเข้าสู่ระบบ แล้วกรอกรหัสผ่านของบัญชี';
      const tabs = authCard.querySelector('.auth-tabs');
      authCard.insertBefore(intro, tabs || form);
    }

    const oldValue = input.value;
    const label = input.closest('label');
    if (label && !label.classList.contains('v599-login-identity-label')) {
      label.className = 'v599-login-identity-label';
      label.innerHTML = `
        <span class="v599-field-title">บัญชีผู้ใช้</span>
        <span class="v599-login-mode" role="group" aria-label="เลือกวิธีเข้าสู่ระบบ">
          <button type="button" data-v599-login-mode="mahidol" aria-pressed="false">Mahidol ID</button>
          <button type="button" data-v599-login-mode="username" aria-pressed="false">Username</button>
        </span>
        <span class="v599-login-input-wrap">
          <input id="loginEmail" type="text" autocomplete="username" required aria-label="บัญชีผู้ใช้">
          <span id="v599MahidolSuffix" class="v599-mahidol-suffix">${DOMAIN}</span>
        </span>
        <span id="v599LoginIdentityHint" class="hint v599-login-hint"></span>`;
      input = $('loginEmail');
      if (input) input.value = oldValue;
    }

    const pw = $('loginPassword');
    if (pw) pw.placeholder = 'กรอกรหัสผ่าน';

    let footer = form.querySelector('.v599-login-footer');
    const oldHelper = form.querySelector('.login-helper-text');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'v599-login-footer';
      footer.innerHTML = '<b>บัญชีใหม่ / ลืมรหัสผ่าน</b> ติดต่อ Admin เพื่อกำหนดรหัสชั่วคราว';
      form.appendChild(footer);
    }
    if (oldHelper && oldHelper !== footer) oldHelper.remove();

    applyMode(storedMode(), false);
  }

  function applyMode(mode, focus = false) {
    mode = mode === 'username' ? 'username' : 'mahidol';
    const input = $('loginEmail');
    const suffix = $('v599MahidolSuffix');
    const hint = $('v599LoginIdentityHint');
    if (!input) return;

    document.querySelectorAll('[data-v599-login-mode]').forEach(btn => {
      const active = btn.dataset.v599LoginMode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (mode === 'mahidol') {
      if (suffix) suffix.hidden = false;
      input.placeholder = 'เช่น somchai.sur';
      input.value = stripMahidolDomain(input.value);
      if (hint) hint.textContent = 'กรอกเฉพาะด้านหน้าอีเมล ระบบเติม @mahidol.ac.th ให้';
    } else {
      if (suffix) suffix.hidden = true;
      input.placeholder = 'Username ที่ตั้งไว้';
      if (hint) hint.textContent = 'ใช้ Username ที่ตั้งไว้ในบัญชี ไม่ต้องพิมพ์อีเมล';
    }
    try { localStorage.setItem(MODE_KEY, mode); } catch (_) {}
    if (focus) input.focus({ preventScroll: true });
  }

  function restoreChoice() {
    ensurePolishedMarkup();
    const input = $('loginEmail');
    if (!input || input.value) return;
    const saved = rememberedId();
    if (!saved) return;
    input.value = storedMode() === 'mahidol' ? stripMahidolDomain(saved) : saved;
  }

  async function resolveUsername(client, username) {
    const u = low(username);
    if (!/^[a-z0-9._-]{1,30}$/i.test(u)) throw new Error('Username ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');

    for (const fn of ['resolve_login_identifier_v57', 'resolve_login_identifier_v56']) {
      try {
        const r = await withTimeout(client.rpc(fn, { p_identifier: u }), 4500, 'ค้นหา Username ใช้เวลานานเกินไป');
        if (!r?.error && r?.data) {
          const email = low(r.data);
          if (!isMahidolEmail(email)) throw new Error('บัญชีนี้ไม่ได้ใช้อีเมล Mahidol กรุณาติดต่อ Admin');
          return email;
        }
        const msg = String(r?.error?.message || '');
        if (/DUPLICATE_LOGIN_NAME/i.test(msg)) throw new Error('Username นี้ซ้ำในระบบ กรุณาให้ Admin ตรวจบัญชี');
        if (/ACCOUNT_INACTIVE/i.test(msg)) throw new Error('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อ Admin');
      } catch (err) {
        if (/ซ้ำ|ถูกปิด|ไม่ได้ใช้อีเมล/i.test(String(err?.message || ''))) throw err;
      }
    }

    try {
      const q = await withTimeout(
        client.from('staff_profiles').select('email,login_name,is_active').ilike('login_name', u).limit(2),
        4500,
        'ค้นหา Username ใช้เวลานานเกินไป'
      );
      if (!q?.error) {
        const rows = Array.isArray(q.data) ? q.data : [];
        if (rows.length > 1) throw new Error('Username นี้ซ้ำในระบบ กรุณาให้ Admin ตรวจบัญชี');
        if (rows.length === 1) {
          if (rows[0].is_active === false) throw new Error('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อ Admin');
          const email = low(rows[0].email);
          if (!isMahidolEmail(email)) throw new Error('บัญชีนี้ไม่ได้ใช้อีเมล Mahidol กรุณาติดต่อ Admin');
          return email;
        }
      }
    } catch (err) {
      if (/ซ้ำ|ถูกปิด|ไม่ได้ใช้อีเมล/i.test(String(err?.message || ''))) throw err;
    }
    throw new Error('ไม่พบ Username นี้ กรุณาตรวจสอบหรือเลือก Mahidol ID');
  }

  async function resolveIdentifier(client, rawValue, mode) {
    const raw = low(rawValue);
    if (!raw) throw new Error(mode === 'username' ? 'กรุณากรอก Username' : 'กรุณากรอก Mahidol ID');
    if (raw.includes('@')) {
      if (!isMahidolEmail(raw)) throw new Error('ใช้ได้เฉพาะอีเมล @mahidol.ac.th');
      return raw;
    }
    if (mode === 'mahidol') {
      if (!/^[a-z0-9._-]+$/i.test(raw)) throw new Error('Mahidol ID มีอักขระไม่ถูกต้อง');
      return `${raw}${DOMAIN}`;
    }
    return resolveUsername(client, raw);
  }

  function setButtonBusy(on, label = '') {
    const btn = $('loginForm')?.querySelector('button[type="submit"]');
    if (!btn) return;
    if (!btn.dataset.v599OriginalText) btn.dataset.v599OriginalText = text(btn.textContent) || 'เข้าสู่ระบบ';
    btn.disabled = !!on;
    btn.textContent = on ? (label || 'กำลังเข้าสู่ระบบ…') : btn.dataset.v599OriginalText;
  }

  function notifyError(message) {
    try { if (typeof showToast === 'function') { showToast(message, { tone:'error' }); return; } } catch (_) {}
    const warning = $('setupWarning');
    if (warning) {
      warning.classList.remove('hidden');
      warning.innerHTML = `<b>เข้าสู่ระบบไม่สำเร็จ</b><span>${String(message || '').replace(/[<>&]/g, '')}</span>`;
      setTimeout(() => warning.classList.add('hidden'), 7000);
      return;
    }
    alert(message);
  }

  function appVisible() {
    const app = $('appView');
    return !!(app && !app.classList.contains('hidden'));
  }

  async function waitForAppVisible(ms = 10000) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      if (appVisible()) return true;
      await sleep(100);
    }
    return false;
  }

  function installCoreGuards() {
    // Bound remote profile/data calls. Underlying fetch may finish later, but UI is released.
    try {
      if (typeof loadProfile === 'function' && !loadProfile.__v599Wrapped) {
        const prev = loadProfile;
        const wrapped = function(){ return withTimeout(prev.apply(this, arguments), 10000, 'โหลดข้อมูลผู้ใช้ใช้เวลานานเกินไป'); };
        wrapped.__v599Wrapped = true;
        loadProfile = wrapped;
        try { window.loadProfile = wrapped; } catch (_) {}
      }
    } catch (_) {}
    try {
      if (typeof loadAllData === 'function' && !loadAllData.__v599Wrapped) {
        const prev = loadAllData;
        const wrapped = function(){ return withTimeout(prev.apply(this, arguments), 18000, 'โหลดข้อมูลระบบใช้เวลานานเกินไป'); };
        wrapped.__v599Wrapped = true;
        loadAllData = wrapped;
        try { window.loadAllData = wrapped; } catch (_) {}
      }
    } catch (_) {}
    try {
      if (typeof checkAndCleanBeforeLoginV199 === 'function' && !checkAndCleanBeforeLoginV199.__v599Wrapped) {
        const prev = checkAndCleanBeforeLoginV199;
        const wrapped = async function(){
          try { return await withTimeout(prev.apply(this, arguments), 7000, 'ตรวจสอบ Session ใช้เวลานานเกินไป'); }
          catch (err) {
            console.warn('[V599] session validation timeout; continue without forced cleanup', err);
            return { cleaned:false, reason:'v599-validation-timeout' };
          }
        };
        wrapped.__v599Wrapped = true;
        checkAndCleanBeforeLoginV199 = wrapped;
        try { window.checkAndCleanBeforeLoginV199 = wrapped; } catch (_) {}
      }
    } catch (_) {}

    // All callers (auth callback, init, login fallback) share one enterApp execution.
    try {
      if (typeof enterApp === 'function' && !enterApp.__v599Wrapped) {
        const prev = enterApp;
        const wrapped = function(){
          if (enterPromise) return enterPromise;
          enterPromise = Promise.resolve().then(() => prev.apply(this, arguments)).finally(() => {
            setTimeout(() => { enterPromise = null; }, 250);
          });
          return enterPromise;
        };
        wrapped.__v599Wrapped = true;
        enterApp = wrapped;
        try { window.enterApp = wrapped; } catch (_) {}
      }
    } catch (_) {}
  }

  async function handleLoginSubmit(event) {
    if (event?.target?.id !== 'loginForm') return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (submitting) return;

    const input = $('loginEmail');
    const passwordInput = $('loginPassword');
    const rawValue = text(input?.value);
    const password = String(passwordInput?.value || '');
    const mode = currentMode();
    if (!rawValue) return notifyError(mode === 'username' ? 'กรุณากรอก Username' : 'กรุณากรอก Mahidol ID');
    if (!password) return notifyError('กรุณากรอกรหัสผ่าน');

    submitting = true;
    setButtonBusy(true, 'กำลังเข้าสู่ระบบ…');
    try {
      const client = await waitForClient();
      const email = await resolveIdentifier(client, rawValue, mode);
      const result = await withTimeout(
        client.auth.signInWithPassword({ email, password }),
        12000,
        'เชื่อมต่อ Login ใช้เวลานานเกินไป กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'
      );
      if (result?.error) throw result.error;
      if (!result?.data?.session?.user) throw new Error('ยังไม่ได้ Session จากระบบ กรุณาลองใหม่');

      saveLoginChoice(mode, mode === 'mahidol' ? stripMahidolDomain(email) : rawValue);
      try { if (typeof state !== 'undefined' && state) state.session = result.data.session; } catch (_) {}
      setButtonBusy(true, 'กำลังเปิดระบบ…');

      // Normally SIGNED_IN calls enterApp. Do not call enterApp concurrently.
      if (!(await waitForAppVisible(6500))) {
        try {
          if (typeof enterApp === 'function') await withTimeout(enterApp(), 19000, 'เปิดระบบใช้เวลานานเกินไป');
        } catch (err) {
          console.warn('[V599] serialized enterApp fallback failed:', err);
        }
      }
      if (!(await waitForAppVisible(1200))) {
        // Never location.reload() here; reload loops were the white-screen/spinner failure mode.
        throw new Error('เข้าสู่ระบบแล้ว แต่โหลดหน้าหลักไม่สำเร็จ กรุณากดรีเฟรช 1 ครั้ง');
      }
    } catch (err) {
      const msg = String(err?.message || err || 'เข้าสู่ระบบไม่สำเร็จ');
      if (/invalid login credentials/i.test(msg)) notifyError('Mahidol ID / Username หรือรหัสผ่านไม่ถูกต้อง');
      else notifyError(msg);
    } finally {
      submitting = false;
      setButtonBusy(false);
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  }

  function startupShellFailsafe() {
    const auth = $('authView');
    const app = $('appView');
    if (!auth || !app) return;
    if (auth.classList.contains('hidden') && app.classList.contains('hidden')) {
      auth.classList.remove('hidden');
      try { if (typeof showLoginPanel === 'function') showLoginPanel(); } catch (_) {}
      console.warn('[V599] recovered hidden startup shell');
    }
  }

  function markVersion() {
    document.querySelectorAll('.v520-version-chip,.v531-version-chip,.v532-version-chip,.v542-version-chip,[class*="version-chip"]').forEach(chip => {
      if (/^v\d+/i.test(text(chip.textContent))) chip.textContent = 'v599';
    });
  }

  installCoreGuards();
  ensurePolishedMarkup();

  const form = $('loginForm');
  if (form && form.dataset.v599Bound !== '1') {
    form.dataset.v599Bound = '1';
    form.addEventListener('submit', handleLoginSubmit, true);
  }

  document.addEventListener('click', event => {
    const btn = event.target?.closest?.('[data-v599-login-mode]');
    if (!btn) return;
    event.preventDefault();
    applyMode(btn.dataset.v599LoginMode, true);
  }, true);

  document.addEventListener('paste', event => {
    if (event.target?.id !== 'loginEmail') return;
    setTimeout(() => {
      if (currentMode() === 'mahidol') event.target.value = stripMahidolDomain(event.target.value);
    }, 0);
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    installCoreGuards();
    restoreChoice();
    markVersion();
    setTimeout(() => { ensurePolishedMarkup(); startupShellFailsafe(); }, 550);
    setTimeout(startupShellFailsafe, 9000);
  });
  window.addEventListener('pageshow', () => setTimeout(() => { ensurePolishedMarkup(); startupShellFailsafe(); }, 60));

  window.addEventListener('unhandledrejection', event => {
    const msg = String(event?.reason?.message || event?.reason || '');
    if (/auth|session|profile|fetch|network|load/i.test(msg)) setTimeout(startupShellFailsafe, 0);
  });
  window.addEventListener('error', () => setTimeout(startupShellFailsafe, 0));

  // If logout/session expiry shows login later, restore the polished shell once.
  try {
    if (typeof showLoginPanel === 'function' && !showLoginPanel.__v599Wrapped) {
      const prev = showLoginPanel;
      const wrapped = function(){
        const out = prev.apply(this, arguments);
        setTimeout(() => { ensurePolishedMarkup(); restoreChoice(); }, 0);
        return out;
      };
      wrapped.__v599Wrapped = true;
      showLoginPanel = wrapped;
      try { window.showLoginPanel = wrapped; } catch (_) {}
    }
  } catch (_) {}

  restoreChoice();
  console.info(`[${VERSION}] loaded — serialized enterApp + no reload loop + polished login`);
})();
