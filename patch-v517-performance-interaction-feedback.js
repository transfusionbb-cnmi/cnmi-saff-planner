/* CNMI Staff Planner V517 — performance + interaction feedback
   Goals:
   1) Coalesce duplicate in-flight Supabase REST GET requests.
   2) Give immediate visual feedback after save/confirm actions.
   3) Prevent accidental double submission while a request is running.
   No database/schema changes.
*/
(function(){
  'use strict';
  if (window.__CNMI_V517__) return;
  window.__CNMI_V517__ = true;

  /* ---------- A. network: exact duplicate in-flight GET de-dup ---------- */
  const nativeFetch = window.fetch && window.fetch.bind(window);
  const inflight = new Map();

  function headerValue(input, init, name){
    try {
      const h = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined) || {});
      return h.get(name) || '';
    } catch(_){ return ''; }
  }
  function requestMethod(input, init){
    return String((init && init.method) || (input instanceof Request && input.method) || 'GET').toUpperCase();
  }
  function requestUrl(input){
    try { return String(input instanceof Request ? input.url : input); } catch(_){ return ''; }
  }
  function canDedupe(input, init){
    if (!nativeFetch || requestMethod(input, init) !== 'GET') return false;
    const url = requestUrl(input);
    return /\/rest\/v1\//i.test(url) && /supabase\./i.test(url);
  }
  function requestKey(input, init){
    return [
      requestUrl(input),
      headerValue(input, init, 'authorization'),
      headerValue(input, init, 'apikey'),
      headerValue(input, init, 'range'),
      headerValue(input, init, 'prefer'),
      headerValue(input, init, 'accept-profile')
    ].join('|');
  }

  if (nativeFetch) {
    window.fetch = function v517Fetch(input, init){
      if (!canDedupe(input, init)) return nativeFetch(input, init);
      const key = requestKey(input, init);
      const existing = inflight.get(key);
      if (existing) {
        return existing.then(resp => resp.clone());
      }
      const pending = nativeFetch(input, init);
      inflight.set(key, pending);
      pending.finally(() => {
        /* Keep only during the live request; never cache application data here. */
        if (inflight.get(key) === pending) inflight.delete(key);
      }).catch(()=>{});
      return pending.then(resp => resp.clone());
    };
  }

  /* ---------- B. UX: immediate pressed/saving feedback ---------- */
  const BUSY_MS = 12000;
  const clickTimers = new WeakMap();
  const formTimers = new WeakMap();

  function addStyles(){
    if (document.getElementById('v517UxStyle')) return;
    const style = document.createElement('style');
    style.id = 'v517UxStyle';
    style.textContent = `
      .v517-action-busy{opacity:.72!important;cursor:wait!important;filter:saturate(.8);transition:opacity .12s ease,transform .12s ease}
      .v517-action-busy .v517-spinner,.v517-toast .v517-spinner{display:inline-block;width:.9em;height:.9em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-.12em;animation:v517spin .65s linear infinite;margin-right:.42em}
      @keyframes v517spin{to{transform:rotate(360deg)}}
      .v517-toast{position:fixed;left:50%;bottom:max(20px,calc(env(safe-area-inset-bottom) + 12px));transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:6px;max-width:min(90vw,420px);padding:10px 15px;border-radius:999px;background:rgba(20,52,78,.94);color:#fff;font:600 14px/1.3 Sarabun,system-ui,sans-serif;box-shadow:0 8px 30px rgba(27,58,84,.22);pointer-events:none;opacity:0;transition:opacity .15s ease,transform .15s ease}
      .v517-toast.show{opacity:1;transform:translateX(-50%) translateY(-2px)}
      #syncStatus.v517-working{color:#176eaa;font-weight:700}
      @media (max-width:700px){.v517-toast{font-size:13px;padding:9px 13px}}
    `;
    document.head.appendChild(style);
  }

  function toastNode(){
    let node = document.getElementById('v517ActionToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'v517ActionToast';
      node.className = 'v517-toast';
      document.body.appendChild(node);
    }
    return node;
  }
  let toastTimer = null;
  function quickFeedback(text='รับคำสั่งแล้ว · กำลังบันทึก…'){
    const node = toastNode();
    node.innerHTML = `<span class="v517-spinner" aria-hidden="true"></span><span>${String(text)}</span>`;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>node.classList.remove('show'), 1800);
    const sync = document.getElementById('syncStatus');
    if (sync) {
      sync.dataset.v517OldText = sync.dataset.v517OldText || sync.textContent || 'พร้อมใช้งาน';
      sync.textContent = 'กำลังบันทึก…';
      sync.classList.add('v517-working');
      clearTimeout(sync.__v517Timer);
      sync.__v517Timer = setTimeout(()=>{
        sync.textContent = 'พร้อมใช้งาน';
        sync.classList.remove('v517-working');
      }, 3500);
    }
  }

  function setBusyButton(btn, message='กำลังบันทึก…', timeout=BUSY_MS){
    if (!btn || btn.dataset.v517Busy === '1') return false;
    btn.dataset.v517Busy = '1';
    btn.dataset.v517OriginalHtml = btn.innerHTML;
    btn.classList.add('v517-action-busy');
    btn.setAttribute('aria-busy','true');
    btn.innerHTML = `<span class="v517-spinner" aria-hidden="true"></span>${message}`;
    const timer = setTimeout(()=>clearBusyButton(btn), timeout);
    clickTimers.set(btn, timer);
    return true;
  }
  function clearBusyButton(btn){
    if (!btn) return;
    const timer = clickTimers.get(btn);
    if (timer) clearTimeout(timer);
    clickTimers.delete(btn);
    if (btn.dataset.v517OriginalHtml != null) btn.innerHTML = btn.dataset.v517OriginalHtml;
    delete btn.dataset.v517OriginalHtml;
    delete btn.dataset.v517Busy;
    btn.classList.remove('v517-action-busy');
    btn.removeAttribute('aria-busy');
  }
  function clearBusyForm(form){
    if (!form) return;
    const timer = formTimers.get(form);
    if (timer) clearTimeout(timer);
    formTimers.delete(form);
    delete form.dataset.v517Submitting;
    form.querySelectorAll('[data-v517-submit-busy="1"]').forEach(btn=>{
      btn.removeAttribute('data-v517-submit-busy');
      clearBusyButton(btn);
    });
  }
  function clearAllBusy(){
    document.querySelectorAll('.v517-action-busy').forEach(clearBusyButton);
    document.querySelectorAll('form[data-v517-submitting="1"]').forEach(clearBusyForm);
  }

  const ACTION_WORDS = /(บันทึก|ยืนยัน|ส่งคำขอ|ส่งให้|อนุมัติ|ปฏิเสธ|ตรวจสอบ HR|ไม่พบใน HR|ลาในระบบแล้ว|รับเวร|ขายเวร|ขอ OT|เพิ่มผู้ใช้|แก้ไข|ลบรายการ|ลบทิ้ง|ประกาศตาราง|ล็อกตาราง|บันทึกว่า|ยืนยันรับ)/i;
  function isActionButton(btn){
    if (!btn || btn.tagName !== 'BUTTON') return false;
    if ((btn.type || '').toLowerCase() === 'submit') return false;
    if (btn.matches('[data-page],[data-cal-view],[data-cal-nav],[data-close-modal],[data-toggle-password],.modal-close,.icon-btn')) return false;
    const text = (btn.textContent || '').trim();
    const attrs = Array.from(btn.attributes || []).map(a=>`${a.name}=${a.value}`).join(' ');
    return ACTION_WORDS.test(text) || /data-(approve|reject|confirm|save|delete|submit|publish|lock|hr|trade|ot)/i.test(attrs);
  }

  function setup(){
    addStyles();

    /* Form submits: lock immediately after native validation has passed. */
    document.addEventListener('submit', function(event){
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.v517Submitting === '1') {
        event.preventDefault();
        event.stopImmediatePropagation();
        quickFeedback('กำลังบันทึกรายการเดิมอยู่ · ไม่ต้องกดซ้ำ');
        return;
      }
      form.dataset.v517Submitting = '1';
      const submit = event.submitter || form.querySelector('button[type="submit"],input[type="submit"]');
      if (submit && submit.tagName === 'BUTTON') {
        submit.setAttribute('data-v517-submit-busy','1');
        setBusyButton(submit, 'กำลังบันทึก…');
      }
      quickFeedback();
      const timer = setTimeout(()=>clearBusyForm(form), BUSY_MS);
      formTimers.set(form, timer);
    }, true);

    /* Non-form save/approve buttons: block a repeated tap while the first action runs. */
    document.addEventListener('click', function(event){
      const btn = event.target && event.target.closest ? event.target.closest('button') : null;
      if (!isActionButton(btn)) return;
      if (btn.dataset.v517Busy === '1') {
        event.preventDefault();
        event.stopImmediatePropagation();
        quickFeedback('กำลังดำเนินการอยู่ · ไม่ต้องกดซ้ำ');
        return;
      }
      /* Mark after the current click has reached the app's handler. */
      setTimeout(()=>{
        if (!btn.isConnected) return;
        if (setBusyButton(btn, 'กำลังดำเนินการ…', 6500)) quickFeedback('รับคำสั่งแล้ว · กำลังดำเนินการ…');
      }, 0);
    }, true);

    /* When a page/modal is replaced after success, stale busy states disappear; on errors unlock. */
    window.addEventListener('unhandledrejection', clearAllBusy);
    window.addEventListener('error', clearAllBusy);

    /* Restore buttons when focus returns after an external flow (HC iService etc.). */
    window.addEventListener('pageshow', ()=>setTimeout(clearAllBusy, 80));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true});
  else setup();
})();
