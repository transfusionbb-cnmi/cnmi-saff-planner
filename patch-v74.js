/* V74: password setup / reset email fix only
   Scope: ไม่แตะ logic เมนูอื่น, ตารางเวร, คำขอข้อมูลส่วนตัว, sidebar
*/
(function(){
  const PATCH = 'v74-reset-link-only';

  function getRecoveryCodeFromUrl(){
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('code') || url.hash.match(/[?#&]code=([^&]+)/)?.[1] || '';
    } catch (_) { return ''; }
  }

  function getHashToken(name){
    const raw = String(window.location.hash || '').replace(/^#/, '');
    return new URLSearchParams(raw).get(name) || '';
  }

  async function ensureRecoverySessionV74(){
    let { data } = await sb.auth.getSession();
    if (data?.session?.user?.email) return data.session;

    const code = getRecoveryCodeFromUrl();
    if (code && sb.auth.exchangeCodeForSession) {
      const exchanged = await sb.auth.exchangeCodeForSession(decodeURIComponent(code));
      if (exchanged.error) throw exchanged.error;
      const again = await sb.auth.getSession();
      if (again.data?.session?.user?.email) return again.data.session;
    }

    const accessToken = getHashToken('access_token');
    const refreshToken = getHashToken('refresh_token');
    if (accessToken && refreshToken && sb.auth.setSession) {
      const set = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (set.error) throw set.error;
      const again = await sb.auth.getSession();
      if (again.data?.session?.user?.email) return again.data.session;
    }

    throw new Error('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');
  }

  function cleanRecoveryUrlV74(){
    try {
      const base = (typeof authRedirectUrl === 'function') ? authRedirectUrl() : (window.location.origin + window.location.pathname);
      window.history.replaceState({}, document.title, base);
    } catch (_) {}
  }

  // แก้จุดส่งลิงก์: ใช้ Apps Script เป็นหลัก ไม่ใช้ Supabase direct ก่อน
  // เพราะ Supabase direct เคยตอบเหมือนสำเร็จ แต่บางเคสไม่มี Auth user/ไม่มีเมลเข้าจริง
  if (typeof requestPasswordSetupLink === 'function') {
    window.requestPasswordSetupLink = requestPasswordSetupLink = async function requestPasswordSetupLinkV74(email){
      const cleanEmail = String(email || '').trim().toLowerCase();
      const redirectTo = (typeof authRedirectUrl === 'function') ? authRedirectUrl('recovery') : (window.location.origin + window.location.pathname + '?mode=recovery');

      if (window.CFG?.APP_SCRIPT_URL) {
        const res = await fetch(CFG.APP_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'requestPasswordLink', email: cleanEmail, redirectTo })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.message || 'ส่งลิงก์ตั้งรหัสผ่านไม่สำเร็จ');
        return Object.assign({ ok:true, sentBy:'AppsScript' }, data);
      }

      // fallback เฉพาะกรณีไม่มี Apps Script URL จริง ๆ
      const direct = await sb.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (direct.error) throw direct.error;
      return { ok:true, sentBy:'Supabase' };
    };
  }

  // แก้จุดกดบันทึกตั้งรหัสผ่านจากลิงก์: ดึง session จาก code/token ก่อนเสมอ
  // ใช้ capture submit เพื่อไม่ให้ handler เดิมยิงซ้ำและขึ้นข้อความหมดอายุผิดจังหวะ
  document.addEventListener('submit', async function(e){
    const form = e.target;
    if (!form || form.id !== 'resetPasswordForm') return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const loginName = String(document.getElementById('recoveryLoginName')?.value || '').trim();
    const password = String(document.getElementById('newPassword')?.value || '');
    if (!loginName) return showToast('กรุณาตั้งชื่อผู้ใช้', { tone:'error' });
    if (!/^[a-zA-Z0-9._-]+$/.test(loginName)) return showToast('ชื่อผู้ใช้ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง', { tone:'error' });
    if (!password) return showToast('กรุณากรอกรหัสผ่านใหม่', { tone:'error' });

    setBusy(true, 'กำลังบันทึกชื่อผู้ใช้และรหัสผ่าน');
    try {
      const session = await ensureRecoverySessionV74();
      const recoveryEmail = session?.user?.email || '';
      if (!recoveryEmail) throw new Error('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');

      let r = await sb.rpc('set_initial_login_name_v56', { p_email: recoveryEmail, p_login_name: loginName });
      if (r.error) r = await sb.rpc('set_initial_login_name_v44', { p_email: recoveryEmail, p_login_name: loginName });
      if (r.error) throw r.error;

      const upd = await sb.auth.updateUser({ password });
      if (upd.error) throw upd.error;

      if (typeof RECOVERY_INTENT !== 'undefined') RECOVERY_INTENT = false;
      cleanRecoveryUrlV74();
      form.classList.add('hidden');
      const latest = await sb.auth.getSession();
      if (window.state) state.session = latest.data?.session || session;
      showToast('บันทึกชื่อผู้ใช้และรหัสผ่านแล้ว');
      if (typeof enterApp === 'function') await enterApp();
    } catch (err) {
      showToast(err.message || 'บันทึกไม่สำเร็จ', { tone:'error' });
    } finally {
      setBusy(false);
    }
  }, true);

  console.info(`CNMI Staff Planner ${PATCH} loaded`);
})();
