/* V75: auth recovery stability + scheduler drag/drop guard
   Scope: เฉพาะ Login/Reset link/Refresh session และการลากวางจัดเวรเท่านั้น
*/
(function(){
  const PATCH = 'v75-auth-dnd-stability';

  function hasImplicitTokensV75(){
    const raw = String(window.location.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(raw);
    return !!(params.get('access_token') && params.get('refresh_token'));
  }

  function hasAuthNoiseV75(){
    const raw = `${window.location.search || ''}${window.location.hash || ''}`;
    return /(^|[?#&])(code|error|error_code|error_description|type|mode)=/i.test(raw);
  }

  function currentCleanUrlV75(){
    try {
      if (typeof authRedirectUrl === 'function') return authRedirectUrl();
    } catch (_) {}
    const path = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
    return window.location.origin + path;
  }

  function cleanAuthUrlV75(){
    try {
      window.history.replaceState({}, document.title, currentCleanUrlV75());
    } catch (_) {}
  }

  function normalizeAuthErrorV75(err){
    const msg = String(err?.message || err || '');
    if (/code verifier|PKCE|otp_expired|access_denied|invalid.*code|flow state/i.test(msg)) {
      return 'ลิงก์ตั้งรหัสผ่านเดิมใช้ไม่ได้แล้ว กรุณากดส่งลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง แล้วเปิดลิงก์ล่าสุดจากอีเมล';
    }
    return msg || 'เกิดข้อผิดพลาดในระบบเข้าสู่ระบบ';
  }

  // Static GitHub Pages ไม่ควรพึ่ง PKCE code verifier เพราะผู้ใช้มักเปิดอีเมลคนละแท็บ/คนละ browser
  // บังคับ flow ใหม่ให้เป็น implicit สำหรับลิงก์ reset รอบถัดไป โดยไม่แตะ logic ฐานข้อมูล/ตารางเวร
  if (window.supabase?.createClient && !window.__CNMI_V75_CREATE_CLIENT_PATCHED__) {
    window.__CNMI_V75_CREATE_CLIENT_PATCHED__ = true;
    const originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function(url, key, options){
      const nextOptions = Object.assign({}, options || {});
      nextOptions.auth = Object.assign({}, nextOptions.auth || {}, {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        flowType: 'implicit'
      });
      return originalCreateClient(url, key, nextOptions);
    };
  }

  async function ensureRecoverySessionV75(){
    if (!window.sb && typeof sb === 'undefined') throw new Error('ยังไม่พบการเชื่อมต่อ Supabase');
    let res = await sb.auth.getSession();
    if (res?.data?.session?.user?.email) return res.data.session;

    const rawHash = String(window.location.hash || '').replace(/^#/, '');
    const hash = new URLSearchParams(rawHash);
    const accessToken = hash.get('access_token') || '';
    const refreshToken = hash.get('refresh_token') || '';
    if (accessToken && refreshToken && sb.auth.setSession) {
      const set = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (set.error) throw set.error;
      res = await sb.auth.getSession();
      if (res?.data?.session?.user?.email) return res.data.session;
    }

    // รองรับลิงก์เก่าที่เป็น code เท่าที่ทำได้ แต่ถ้าเป็น PKCE จากคนละ browser จะตั้งใจแจ้งให้ขอลิงก์ใหม่
    const code = new URL(window.location.href).searchParams.get('code') || hash.get('code') || '';
    if (code && sb.auth.exchangeCodeForSession) {
      const exchanged = await sb.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw exchanged.error;
      res = await sb.auth.getSession();
      if (res?.data?.session?.user?.email) return res.data.session;
    }

    throw new Error('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');
  }

  // กด Login ปกติจากหน้า login ต้องไม่ถูก flag recovery เก่าดึงกลับไปหน้า reset
  document.addEventListener('submit', function(e){
    const form = e.target;
    if (!form || form.id !== 'loginForm') return;
    try { if (typeof RECOVERY_INTENT !== 'undefined') RECOVERY_INTENT = false; } catch (_) {}
    if (hasAuthNoiseV75() && !hasImplicitTokensV75()) cleanAuthUrlV75();
  }, true);

  // Reset submit แบบ capture เพื่อกัน handler เดิมยิงซ้ำและกันข้อความ PKCE ดิบ ๆ หลุดถึงผู้ใช้
  document.addEventListener('submit', async function(e){
    const form = e.target;
    if (!form || form.id !== 'resetPasswordForm') return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const loginName = String(document.getElementById('recoveryLoginName')?.value || '').trim();
    const password = String(document.getElementById('newPassword')?.value || '');
    if (!loginName) return showToast('กรุณาตั้งชื่อผู้ใช้', { tone:'error' });
    if (!/^[a-zA-Z0-9._-]{1,30}$/.test(loginName)) return showToast('ชื่อผู้ใช้ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง', { tone:'error' });
    if (!password) return showToast('กรุณากรอกรหัสผ่านใหม่', { tone:'error' });

    setBusy(true, 'กำลังบันทึกชื่อผู้ใช้และรหัสผ่าน');
    try {
      const session = await ensureRecoverySessionV75();
      const recoveryEmail = String(session?.user?.email || '').toLowerCase();
      if (!recoveryEmail) throw new Error('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');

      let r = await sb.rpc('set_initial_login_name_v56', { p_email: recoveryEmail, p_login_name: loginName });
      if (r.error) r = await sb.rpc('set_initial_login_name_v44', { p_email: recoveryEmail, p_login_name: loginName });
      if (r.error) throw r.error;

      const upd = await sb.auth.updateUser({ password });
      if (upd.error) throw upd.error;

      try { if (typeof RECOVERY_INTENT !== 'undefined') RECOVERY_INTENT = false; } catch (_) {}
      cleanAuthUrlV75();
      form.classList.add('hidden');
      const latest = await sb.auth.getSession();
      if (window.state) state.session = latest.data?.session || session;
      showToast('บันทึกชื่อผู้ใช้และรหัสผ่านแล้ว');
      if (typeof enterApp === 'function') await enterApp();
    } catch (err) {
      showToast(normalizeAuthErrorV75(err), { tone:'error' });
      if (/code verifier|PKCE|otp_expired|access_denied|invalid.*code|flow state/i.test(String(err?.message || err || ''))) cleanAuthUrlV75();
    } finally {
      setBusy(false);
    }
  }, true);

  // ส่งลิงก์ reset: ใช้ Apps Script ถ้ามี เพื่อสร้าง Auth user ครั้งแรกได้; fallback เป็น Supabase implicit link
  if (typeof requestPasswordSetupLink === 'function') {
    window.requestPasswordSetupLink = requestPasswordSetupLink = async function requestPasswordSetupLinkV75(email){
      const cleanEmail = String(email || '').trim().toLowerCase();
      const redirectTo = (typeof authRedirectUrl === 'function') ? authRedirectUrl('recovery') : (currentCleanUrlV75() + '?mode=recovery');

      if (window.CFG?.APP_SCRIPT_URL) {
        const res = await fetch(CFG.APP_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'requestPasswordLink', email: cleanEmail, redirectTo, flowType: 'implicit' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.message || 'ส่งลิงก์ตั้งรหัสผ่านไม่สำเร็จ');
        return Object.assign({ ok:true, sentBy:'AppsScript' }, data);
      }

      const direct = await sb.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (direct.error) throw direct.error;
      return { ok:true, sentBy:'Supabase' };
    };
  }

  if (typeof resetUserPassword === 'function') {
    window.resetUserPassword = resetUserPassword = async function resetUserPasswordV75(email){
      if (!email) return showToast('ยังไม่มีอีเมลของผู้ใช้นี้', { tone:'error' });
      if (!(await confirmDialog(`ส่งลิงก์ตั้งรหัสผ่านไปที่ ${email}?`, 'ส่งลิงก์ตั้งรหัสผ่าน'))) return;
      try {
        await requestPasswordSetupLink(String(email).trim().toLowerCase());
        showToast('ส่งลิงก์ตั้งรหัสผ่านแล้ว กรุณาเช็ก Inbox / Spam');
      } catch (err) {
        showToast(normalizeAuthErrorV75(err), { tone:'error' });
      }
    };
  }

  // กันพลาด: ถ้า binding รุ่นท้าย ๆ ลืม drag/drop อีก ให้เติม listener หลังหน้าโหลด
  function installDndGuardV75(){
    if (document.body?.dataset?.v75DndGuard === '1') return;
    if (typeof handleDragStart !== 'function' || typeof handleDrop !== 'function') return;
    document.body.dataset.v75DndGuard = '1';
    document.body.addEventListener('dragstart', handleDragStart);
    document.body.addEventListener('dragover', handleDragOver);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('drop', handleDrop);
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(installDndGuardV75, 300));
  setTimeout(installDndGuardV75, 900);

  console.info(`CNMI Staff Planner ${PATCH} loaded`);
})();
