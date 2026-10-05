/* CNMI Staff Planner V598 — Stable Login + Mahidol ID / Username UX
 * Scope:
 *   - Login accepts either Mahidol ID (local part only; app adds @mahidol.ac.th)
 *     or the preset Username stored in staff_profiles.login_name.
 *   - Username lookup is bounded by timeouts so the login screen cannot hang forever.
 *   - Successful sign-in waits for the normal auth callback, then safely falls back to enterApp/reload.
 *   - No password is stored in browser storage.
 *   - Does not change leave/no-duty quotas, OT, HR, roster, or physician rules.
 */
(() => {
  'use strict';
  const VERSION = 'V598_LOGIN_STABILITY_UX';
  if (window.__CNMI_V598_LOGIN_STABILITY_UX__) return;
  window.__CNMI_V598_LOGIN_STABILITY_UX__ = true;

  const MODE_KEY = 'cnmi-login-mode-v598';
  const ID_KEY = 'cnmi-login-id-v598';
  const DOMAIN = '@mahidol.ac.th';
  let submitting = false;

  const $ = id => document.getElementById(id);
  const text = v => String(v ?? '').trim();
  const low = v => text(v).toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function withTimeout(promise, ms, message) {
    let timer = null;
    return Promise.race([
      Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่')), ms);
      })
    ]);
  }

  function getClient() {
    try { if (typeof sb !== 'undefined' && sb?.auth) return sb; } catch (_) {}
    try { if (window.sb?.auth) return window.sb; } catch (_) {}
    return null;
  }

  async function waitForClient(ms = 8000) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const client = getClient();
      if (client?.auth) return client;
      await sleep(80);
    }
    throw new Error('ระบบ Login ยังโหลดไม่ครบ กรุณากดรีเฟรชแล้วลองใหม่');
  }

  function storedMode() {
    try {
      const m = localStorage.getItem(MODE_KEY);
      return m === 'username' ? 'username' : 'mahidol';
    } catch (_) { return 'mahidol'; }
  }
  function currentMode() {
    const selected = document.querySelector('[data-v598-login-mode].active')?.dataset?.v598LoginMode;
    return selected === 'username' ? 'username' : 'mahidol';
  }
  function saveLoginChoice(mode, value) {
    try {
      localStorage.setItem(MODE_KEY, mode === 'username' ? 'username' : 'mahidol');
      localStorage.setItem(ID_KEY, text(value));
    } catch (_) {}
  }
  function rememberedId() {
    try { return text(localStorage.getItem(ID_KEY)); } catch (_) { return ''; }
  }

  function stripMahidolDomain(value) {
    const v = text(value);
    return /@mahidol\.ac\.th$/i.test(v) ? v.replace(/@mahidol\.ac\.th$/i, '') : v;
  }

  function ensureLoginMarkup() {
    const input = $('loginEmail');
    const form = $('loginForm');
    if (!input || !form) return;

    const label = input.closest('label');
    if (label && !label.classList.contains('v598-login-identity-label')) {
      label.classList.add('v598-login-identity-label');
      label.innerHTML = `
        <span class="v598-field-title">เข้าสู่ระบบด้วย</span>
        <span class="v598-login-mode" role="group" aria-label="เลือกวิธีเข้าสู่ระบบ">
          <button type="button" data-v598-login-mode="mahidol">Mahidol ID</button>
          <button type="button" data-v598-login-mode="username">Username ที่ตั้งไว้</button>
        </span>
        <span class="v598-login-input-wrap">
          <input id="loginEmail" type="text" autocomplete="username" required aria-label="ชื่อผู้ใช้หรือ Mahidol ID">
          <span id="v598MahidolSuffix" class="v598-mahidol-suffix">${DOMAIN}</span>
        </span>
        <span id="v598LoginIdentityHint" class="hint v598-login-hint"></span>
      `;
    }

    const pw = $('loginPassword');
    if (pw) pw.setAttribute('placeholder', 'กรอกรหัสผ่าน');

    let helper = form.querySelector('.login-helper-text');
    if (!helper) {
      helper = document.createElement('p');
      helper.className = 'hint login-helper-text';
      form.appendChild(helper);
    }
    helper.textContent = 'เข้าได้ทั้ง Mahidol ID หรือ Username ที่ตั้งไว้ • ครั้งแรกใช้รหัสชั่วคราวจาก Admin • ลืมรหัสผ่านให้ติดต่อ Admin';

    const subtitle = document.querySelector('.auth-card > p.muted');
    if (subtitle) subtitle.textContent = 'เลือกวิธีเข้าสู่ระบบ แล้วกรอกรหัสผ่าน';

    applyMode(storedMode(), false);
  }

  function applyMode(mode, focus = false) {
    mode = mode === 'username' ? 'username' : 'mahidol';
    const input = $('loginEmail');
    const suffix = $('v598MahidolSuffix');
    const hint = $('v598LoginIdentityHint');
    if (!input) return;

    document.querySelectorAll('[data-v598-login-mode]').forEach(btn => {
      const active = btn.dataset.v598LoginMode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (mode === 'mahidol') {
      if (suffix) suffix.hidden = false;
      input.placeholder = 'เช่น somchai.sur';
      input.setAttribute('aria-label', 'Mahidol ID ด้านหน้าอีเมล');
      input.value = stripMahidolDomain(input.value);
      if (hint) hint.textContent = 'กรอกเฉพาะด้านหน้าอีเมล ระบบเติม @mahidol.ac.th ให้อัตโนมัติ';
    } else {
      if (suffix) suffix.hidden = true;
      input.placeholder = 'เช่น gift123 หรือ Username ที่ตั้งไว้';
      input.setAttribute('aria-label', 'Username ที่ตั้งไว้');
      if (hint) hint.textContent = 'ใช้ Username ที่ตั้งไว้ในข้อมูลบัญชี ไม่ต้องพิมพ์อีเมล';
    }

    try { localStorage.setItem(MODE_KEY, mode); } catch (_) {}
    if (focus) input.focus({ preventScroll: true });
  }

  function restoreChoice() {
    ensureLoginMarkup();
    const mode = storedMode();
    applyMode(mode, false);
    const input = $('loginEmail');
    if (!input || input.value) return;
    const saved = rememberedId();
    if (!saved) return;
    input.value = mode === 'mahidol' ? stripMahidolDomain(saved) : saved;
  }

  function isMahidolEmail(email) {
    return /^[^\s@]+@mahidol\.ac\.th$/i.test(text(email));
  }

  async function resolveUsername(client, username) {
    const u = low(username);
    if (!/^[a-z0-9._-]{1,30}$/i.test(u)) {
      throw new Error('Username ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');
    }

    // RPC first: works with RLS enabled and avoids an unauthenticated table scan.
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

    // Safe bounded fallback for older projects where the resolver RPC is missing.
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

    throw new Error('ไม่พบ Username นี้ กรุณาตรวจสอบ Username หรือเลือก Mahidol ID');
  }

  async function resolveIdentifier(client, rawValue, mode) {
    const raw = low(rawValue);
    if (!raw) throw new Error(mode === 'username' ? 'กรุณากรอก Username' : 'กรุณากรอก Mahidol ID');

    // Full Mahidol email is accepted even if pasted into either mode.
    if (raw.includes('@')) {
      if (!isMahidolEmail(raw)) throw new Error('ใช้ได้เฉพาะอีเมล @mahidol.ac.th');
      return raw;
    }

    if (mode === 'mahidol') {
      if (!/^[a-z0-9._-]+$/i.test(raw)) throw new Error('Mahidol ID มีอักขระไม่ถูกต้อง กรุณากรอกเฉพาะด้านหน้าอีเมล');
      return `${raw}${DOMAIN}`;
    }
    return resolveUsername(client, raw);
  }

  function setButtonBusy(on, textValue = '') {
    const btn = $('loginForm')?.querySelector('button[type="submit"]');
    if (!btn) return;
    if (!btn.dataset.v598OriginalText) btn.dataset.v598OriginalText = text(btn.textContent) || 'เข้าสู่ระบบ';
    btn.disabled = !!on;
    btn.textContent = on ? (textValue || 'กำลังเข้าสู่ระบบ…') : btn.dataset.v598OriginalText;
  }

  function toastError(message) {
    try {
      if (typeof showToast === 'function') return showToast(message, { tone: 'error' });
    } catch (_) {}
    alert(message);
  }

  async function waitForAppVisible(ms = 2600) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const app = $('appView');
      if (app && !app.classList.contains('hidden')) return true;
      await sleep(80);
    }
    return false;
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
    if (!rawValue) return toastError(mode === 'username' ? 'กรุณากรอก Username' : 'กรุณากรอก Mahidol ID');
    if (!password) return toastError('กรุณากรอกรหัสผ่าน');

    submitting = true;
    setButtonBusy(true, 'กำลังเข้าสู่ระบบ…');
    try { if (typeof setBusy === 'function') setBusy(true, 'กำลังเข้าสู่ระบบ'); } catch (_) {}

    try {
      const client = await waitForClient();
      const email = await resolveIdentifier(client, rawValue, mode);
      const result = await withTimeout(
        client.auth.signInWithPassword({ email, password }),
        12000,
        'เชื่อมต่อ Login ใช้เวลานานเกินไป กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'
      );
      if (result?.error) throw result.error;
      if (!result?.data?.session?.user) throw new Error('เข้าสู่ระบบสำเร็จแต่ยังไม่ได้ Session กรุณาลองใหม่');

      saveLoginChoice(mode, mode === 'mahidol' ? stripMahidolDomain(email) : rawValue);
      try { if (typeof state !== 'undefined' && state) state.session = result.data.session; } catch (_) {}

      setButtonBusy(true, 'กำลังเปิดระบบ…');
      if (!(await waitForAppVisible())) {
        try {
          if (typeof enterApp === 'function') {
            await withTimeout(enterApp(), 15000, 'โหลดข้อมูลผู้ใช้ใช้เวลานานเกินไป');
          }
        } catch (err) {
          console.warn('[V598] enterApp fallback:', err);
        }
      }

      if (!(await waitForAppVisible(700))) {
        // Session is already persisted by Supabase. A clean reload is safer than
        // leaving the user on an apparently frozen login shell.
        try { sessionStorage.setItem('cnmi-v598-login-reload', '1'); } catch (_) {}
        location.reload();
        return;
      }
    } catch (err) {
      const msg = String(err?.message || err || 'เข้าสู่ระบบไม่สำเร็จ');
      if (/invalid login credentials/i.test(msg)) {
        toastError('Username / Mahidol ID หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่');
      } else {
        toastError(msg);
      }
    } finally {
      submitting = false;
      setButtonBusy(false);
      try { if (typeof setBusy === 'function') setBusy(false); } catch (_) {}
    }
  }

  function installStartupTimeoutGuards() {
    // V199 validates the restored session with a network getUser() call.
    // A stalled mobile connection must not leave the visible login shell frozen forever.
    try {
      if (typeof checkAndCleanBeforeLoginV199 === 'function' && !checkAndCleanBeforeLoginV199.__v598Wrapped) {
        const previous = checkAndCleanBeforeLoginV199;
        const wrapped = async function(){
          try {
            return await withTimeout(previous.apply(this, arguments), 7500, 'ตรวจสอบ Session ใช้เวลานานเกินไป');
          } catch (err) {
            console.warn('[V598] session validation timeout; continue to login/session restore:', err);
            return { cleaned:false, reason:'v598-validation-timeout' };
          }
        };
        wrapped.__v598Wrapped = true;
        checkAndCleanBeforeLoginV199 = wrapped;
        try { window.checkAndCleanBeforeLoginV199 = wrapped; } catch (_) {}
      }
    } catch (_) {}
  }

  function installStyles() {
    if ($('v598LoginStyles')) return;
    const style = document.createElement('style');
    style.id = 'v598LoginStyles';
    style.textContent = `
      .v598-login-identity-label{display:flex!important;flex-direction:column;gap:8px}
      .v598-field-title{font-weight:700;color:#17324d}
      .v598-login-mode{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px;background:#eef6fc;border:1px solid #d8e8f5;border-radius:12px}
      .v598-login-mode button{appearance:none;border:0;background:transparent;border-radius:9px;padding:9px 10px;font:inherit;font-weight:700;color:#5f7790;cursor:pointer}
      .v598-login-mode button.active{background:#fff;color:#12639a;box-shadow:0 1px 4px rgba(35,75,110,.12)}
      .v598-login-input-wrap{display:flex;align-items:center;width:100%;border:1px solid #d7e2eb;border-radius:10px;background:#fff;overflow:hidden;transition:border-color .15s,box-shadow .15s}
      .v598-login-input-wrap:focus-within{border-color:#67b9e9;box-shadow:0 0 0 3px rgba(103,185,233,.15)}
      .v598-login-input-wrap input{min-width:0;flex:1;border:0!important;outline:0!important;box-shadow:none!important;border-radius:0!important;background:transparent!important;padding:11px 12px!important}
      .v598-mahidol-suffix{flex:0 0 auto;padding:0 12px 0 4px;color:#60758a;font-weight:600;white-space:nowrap}
      .v598-mahidol-suffix[hidden]{display:none!important}
      .v598-login-hint{display:block;margin-top:-2px;color:#71869a}
      @media(max-width:520px){.v598-login-mode button{padding:8px 6px;font-size:13px}.v598-mahidol-suffix{padding-right:9px;font-size:13px}}
    `;
    document.head.appendChild(style);
  }

  function markVersion() {
    document.querySelectorAll('.v520-version-chip,.v531-version-chip,.v532-version-chip,.v542-version-chip,[class*="version-chip"]').forEach(chip => {
      if (/^v\d+/i.test(text(chip.textContent))) chip.textContent = 'v598';
    });
  }

  function normalizeLoginUi() {
    installStyles();
    ensureLoginMarkup();
    const mode = storedMode();
    if (!document.querySelector('[data-v598-login-mode].active')) applyMode(mode, false);
    const pw = $('loginPassword');
    if (pw) pw.placeholder = 'กรอกรหัสผ่าน';
    const helper = $('loginForm')?.querySelector('.login-helper-text');
    if (helper) helper.textContent = 'เข้าได้ทั้ง Mahidol ID หรือ Username ที่ตั้งไว้ • ครั้งแรกใช้รหัสชั่วคราวจาก Admin • ลืมรหัสผ่านให้ติดต่อ Admin';
    markVersion();
  }

  installStartupTimeoutGuards();

  // Install the capture handler before app init binds its older login listeners.
  const formNow = $('loginForm');
  if (formNow && formNow.dataset.v598Bound !== '1') {
    formNow.dataset.v598Bound = '1';
    formNow.addEventListener('submit', handleLoginSubmit, true);
  }

  document.addEventListener('click', event => {
    const btn = event.target?.closest?.('[data-v598-login-mode]');
    if (!btn) return;
    event.preventDefault();
    applyMode(btn.dataset.v598LoginMode, true);
  }, true);

  document.addEventListener('paste', event => {
    if (event.target?.id !== 'loginEmail') return;
    setTimeout(() => {
      if (currentMode() === 'mahidol') event.target.value = stripMahidolDomain(event.target.value);
    }, 0);
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    restoreChoice();
    // V162 has bounded 0/400ms UI normalizers. Re-apply V598 after both.
    setTimeout(normalizeLoginUi, 30);
    setTimeout(normalizeLoginUi, 520);
  });
  window.addEventListener('pageshow', () => setTimeout(normalizeLoginUi, 40));

  // If login UI is shown later (manual logout/session expiry), keep the V598 layout.
  try {
    if (typeof showLoginPanel === 'function' && !showLoginPanel.__v598Wrapped) {
      const previous = showLoginPanel;
      const wrapped = function(){
        const out = previous.apply(this, arguments);
        setTimeout(normalizeLoginUi, 0);
        return out;
      };
      wrapped.__v598Wrapped = true;
      showLoginPanel = wrapped;
      try { window.showLoginPanel = wrapped; } catch (_) {}
    }
  } catch (_) {}

  normalizeLoginUi();
  console.info(`[${VERSION}] loaded — Mahidol ID suffix + preset Username + bounded login`);
})();
