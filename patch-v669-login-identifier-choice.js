/* Staff Planner v669 — choose Mahidol email local-part or staff Username.
 * UI-only bridge to existing Login submit handling. No Supabase/auth/session rewrite.
 * Email mode shows @mahidol.ac.th visually and temporarily sends the full
 * email to the existing resolveLoginIdentifier handler on submit.
 */
(() => {
  'use strict';
  if (window.CNMI_V669_LOGIN_CHOICE) return;
  window.CNMI_V669_LOGIN_CHOICE = true;

  const DOMAIN = '@mahidol.ac.th';
  const KEY = 'cnmi-login-input-mode-v669';
  const form = document.getElementById('loginForm');
  const input = document.getElementById('loginEmail');
  if (!form || !input) return;

  let mode = 'email';
  let submitRestore = null;
  const $ = (selector, root = form) => root.querySelector(selector);
  const stripDomain = value => String(value || '').trim().replace(/@mahidol\.ac\.th$/i, '');
  const getStoredMode = () => {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  };
  const saveMode = value => {
    try { localStorage.setItem(KEY, value); } catch (_) {}
  };

  const label = input.closest('label');
  if (!label || !form.contains(label)) return;
  // The original input remains the login field used by every existing auth hook.
  // Keep it a text input, preserving autofill, password managers and submit handlers.
  const title = document.createElement('span');
  title.className = 'v669-account-title';
  title.textContent = 'บัญชีสำหรับเข้าสู่ระบบ';
  for (const node of Array.from(label.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }
  label.insertBefore(title, label.firstChild);
  label.classList.add('v669-identity-label');

  const switcher = document.createElement('div');
  switcher.className = 'v669-login-switch';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'เลือกเข้าสู่ระบบด้วย Username หรืออีเมล Mahidol');
  switcher.innerHTML =
    '<button class="v669-mode" data-v669-mode="email" type="button" aria-pressed="false">อีเมล Mahidol</button>' +
    '<button class="v669-mode" data-v669-mode="username" type="button" aria-pressed="false">Username</button>';
  form.insertBefore(switcher, label);

  const wrapper = document.createElement('span');
  wrapper.className = 'v669-input-wrap';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const suffix = document.createElement('span');
  suffix.className = 'v669-domain';
  suffix.textContent = DOMAIN;
  suffix.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(suffix);

  const hint = document.createElement('span');
  hint.className = 'v669-mode-hint';
  hint.id = 'v669-mode-hint';
  label.appendChild(hint);
  input.setAttribute('aria-describedby', hint.id);

  // Existing email is safely reduced to local-part in email mode; there is no
  // need to remember the person's identity or password in localStorage.
  function updateMode(next, { focus = false } = {}) {
    const previous = mode;
    mode = next === 'username' ? 'username' : 'email';
    saveMode(mode);
    if (submitRestore) { clearTimeout(submitRestore); submitRestore = null; }
    input.setCustomValidity('');
    if (mode === 'email') input.value = stripDomain(input.value);
    else if (previous === 'email') input.value = stripDomain(input.value);
    suffix.hidden = mode !== 'email';
    input.placeholder = mode === 'email' ? 'เช่น parichat.ink' : 'เช่น 0020305 หรือ gift123';
    input.setAttribute('inputmode', mode === 'email' ? 'email' : 'text');
    input.setAttribute('aria-label', mode === 'email' ? 'ชื่อหน้าอีเมล Mahidol' : 'Username');
    hint.textContent = mode === 'email'
      ? 'กรอกเพียงชื่อหน้า @ หรือวางอีเมล Mahidol เต็มก็ได้'
      : 'กรอก Username ที่ตั้งไว้ในระบบ ไม่ต้องใส่ @mahidol.ac.th';
    switcher.querySelectorAll('[data-v669-mode]').forEach(button => {
      const selected = button.dataset.v669Mode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (focus) input.focus();
  }

  switcher.addEventListener('click', event => {
    const button = event.target.closest('[data-v669-mode]');
    if (button) updateMode(button.dataset.v669Mode, { focus: true });
  });
  input.addEventListener('input', () => {
    if (mode === 'email' && /@mahidol\.ac\.th$/i.test(input.value.trim())) {
      input.value = stripDomain(input.value);
    }
  });
  input.addEventListener('change', () => {
    if (mode === 'email') input.value = stripDomain(input.value);
  });
  input.addEventListener('focus', () => {
    if (mode === 'email' && /@mahidol\.ac\.th$/i.test(input.value.trim())) {
      input.value = stripDomain(input.value);
    }
  });

  // Runs before form-level auth handlers, including any capture-phase handlers.
  // Do not prevent submission or intercept successful login.
  document.addEventListener('submit', event => {
    if (event.target !== form || mode !== 'email') return;
    const local = input.value.trim();
    if (!local) return; // Keep native required-field feedback.
    if (local.includes('@') && !/@mahidol\.ac\.th$/i.test(local)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.setCustomValidity('ใช้ได้เฉพาะอีเมล @mahidol.ac.th');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    input.value = /@mahidol\.ac\.th$/i.test(local) ? local : local + DOMAIN;
    if (submitRestore) clearTimeout(submitRestore);
    submitRestore = setTimeout(() => {
      if (mode === 'email') input.value = stripDomain(input.value);
      submitRestore = null;
    }, 0);
  }, true);
  input.addEventListener('input', () => input.setCustomValidity(''));

  // Browser autofill can occur after deferred scripts. Adapt when the field
  // contains a full Mahidol email without clearing an in-progress entry.
  const prefilled = input.value.trim();
  const saved = getStoredMode();
  updateMode(saved === 'username' && !/@/.test(prefilled) ? 'username' : 'email');
  console.info('[V669_LOGIN_IDENTIFIER_CHOICE] ready; auth pipeline unchanged');
})();
