
/* Original source: patch-v517-performance-interaction-feedback.js */
try {
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
    /* V526: sidebar/tree navigation is navigation, never a save/action button.
       Some menu labels contain words such as “รับเวร” / “ขอ OT”, which previously
       triggered the V517 busy guard and temporarily blocked navigation. */
    if (btn.closest('#mainNav')) return false;
    if (btn.matches('[data-page],[data-cal-view],[data-cal-nav],[data-close-modal],[data-toggle-password],[data-v523-submenu-toggle],[data-v523-ot-item],[data-v524-tree-toggle],[data-v524-child-key],.modal-close,.icon-btn')) return false;
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

} catch (error) { console.error("[v569] patch-v517-performance-interaction-feedback.js", error); }
;

/* Original source: patch-v136-preauth.js */
try {
/* v136 pre-auth intent detector: runs before app.js so router/auth guard cannot eat Supabase email-link tokens. */
(function () {
  'use strict';
  var raw = String(location.href || '') + ' ' + String(location.search || '') + ' ' + String(location.hash || '');
  // V196: Do not treat a bare ?mode=recovery as a real auth/recovery link.
  // That stale marker can remain after password setup and later pull normal admin actions
  // (including Position Management save) back into recovery mode.
  var hasRealAuthToken = /(access_token|refresh_token|token_hash|(^|[?#&])code=)/i.test(raw);
  var hasAuthType = /type=(recovery|password_recovery|invite|signup)/i.test(raw);
  var hasRecoveryModeWithToken = /mode=(recovery|set-password|update-password)/i.test(raw) && (hasRealAuthToken || hasAuthType);
  var isAuthLink = hasRealAuthToken || hasAuthType || hasRecoveryModeWithToken;
  var isError = /(error=|error_code=|error_description=)/i.test(raw);
  if (isAuthLink && !isError) {
    window.CNMI_AUTH_LINK_INTENT = true;
    window.CNMI_REQUIRE_PASSWORD_UPDATE = true;
    window.RECOVERY_INTENT = true;
    window.AUTH_LINK_PROCESSING = true;
    try { sessionStorage.setItem('cnmi.forcePasswordSetup.v134', JSON.stringify({ reason:'v136-preauth', at:Date.now() })); } catch (_) {}
    try { sessionStorage.setItem('cnmi.forcePasswordSetup.v135', '1'); } catch (_) {}
    try { sessionStorage.setItem('cnmi.forcePasswordSetup.v136', '1'); } catch (_) {}
    document.documentElement.classList.add('v136-auth-link');
  }
})();

} catch (error) { console.error("[v569] patch-v136-preauth.js", error); }
;

/* Original source: patch-v315-interaction-preload.js */
try {
/* CNMI Staff Planner V315 — early interaction router
   Loaded before app.js so Calendar / OT edit / CH4 actions are handled before
   legacy capture listeners. No database logic is executed in this file.
*/
(function(){
  'use strict';
  const VERSION='V315_INTERACTION_PRELOAD';
  if(window.__CNMI_V315_INTERACTION_PRELOAD__) return;
  window.__CNMI_V315_INTERACTION_PRELOAD__=true;

  let lastKey='';
  let lastAt=0;
  const pointers=new Map();

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
  function normDate(value){
    try{
      const fn=window.normalizeDateKey || (typeof normalizeDateKey==='function' ? normalizeDateKey : null);
      if(typeof fn==='function') return String(fn(value)||'').slice(0,10);
    }catch(_){ }
    return String(value||'').slice(0,10);
  }
  function stop(event){
    try{event.preventDefault();}catch(_){ }
    try{event.stopPropagation();}catch(_){ }
    try{event.stopImmediatePropagation?.();}catch(_){ }
  }
  function showModalDom(html,opts={}){
    try{
      const fn=window.showModal || (typeof showModal==='function' ? showModal : null);
      if(typeof fn==='function') fn(html,opts);
    }catch(_){ }
    const modal=document.getElementById('modal');
    const body=document.getElementById('modalBody');
    if(!modal || !body) return false;
    if(!String(body.innerHTML||'').trim()) body.innerHTML=html;
    try{
      if(window.__modalCloseTimerV193){
        clearTimeout(window.__modalCloseTimerV193);
        window.__modalCloseTimerV193=null;
      }
    }catch(_){ }
    modal.classList.remove('hidden','modal-closing');
    modal.classList.toggle('modal-sm',!!opts.small);
    modal.classList.toggle('modal-lg',!!opts.large);
    modal.classList.add('modal-ready');
    document.body.classList.add('modal-open');
    const card=modal.querySelector('.modal-card');
    if(card) card.scrollTop=0;
    return true;
  }
  function toast(message){
    try{
      const fn=window.showToast || (typeof showToast==='function' ? showToast : null);
      if(typeof fn==='function') return fn(message,{tone:'error'});
    }catch(_){ }
    showModalDom(`<div class="app-alert error"><div class="app-alert-icon">!</div><h2>แจ้งเตือน</h2><p>${esc(message)}</p><div class="confirm-actions"><button class="primary-btn" type="button" data-app-alert-ok>ตกลง</button></div></div>`,{small:true});
  }
  function stateSafe(){
    try{return window.state || state || null;}catch(_){return window.state || null;}
  }
  function calendarRows(date){
    try{
      const fn=window.collectCalendarEvents || (typeof collectCalendarEvents==='function' ? collectCalendarEvents : null);
      const rows=typeof fn==='function' ? fn() : [];
      return (Array.isArray(rows)?rows:[]).filter(row=>normDate(row?.date)===date);
    }catch(error){
      console.warn(`[${VERSION}] calendar collect fallback`,error);
      return [];
    }
  }
  function calendarTitle(date){
    try{
      const fn=window.formatThaiDate || (typeof formatThaiDate==='function' ? formatThaiDate : null);
      if(typeof fn==='function') return fn(date);
    }catch(_){ }
    return date;
  }
  function fallbackCalendarRow(row){
    const raw=row?.raw||{};
    const title=row?.title || row?.name || row?.type || '-';
    const detail=raw?.note || raw?.admin_record_reason || row?.reason || '';
    return `<div class="calendar-modal-row"><div class="event-title"><b>${esc(title)}</b></div>${detail?`<div class="muted">${esc(detail)}</div>`:''}</div>`;
  }
  function renderCalendarRow(row){
    try{
      const fn=window.renderCalendarModalRow || (typeof renderCalendarModalRow==='function' ? renderCalendarModalRow : null);
      if(typeof fn==='function') return fn(row);
    }catch(error){
      console.warn(`[${VERSION}] calendar row fallback`,error);
    }
    return fallbackCalendarRow(row);
  }
  function openCalendar(date){
    const key=normDate(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return toast('ไม่พบวันที่ที่ต้องการเปิด');
    try{
      const rows=calendarRows(key);
      const body=rows.length?rows.map(renderCalendarRow).join(''):'<div class="empty-state">ไม่มีรายการในวันนี้</div>';
      if(!showModalDom(`<div class="v314-calendar-modal"><h2>${esc(calendarTitle(key))}</h2><div class="calendar-modal-list">${body}</div></div>`,{large:false})){
        throw new Error('modal container not found');
      }
    }catch(error){
      console.error(`[${VERSION}] calendar open failed`,error);
      toast('เปิดรายละเอียด Calendar ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }
  function forceModalSoon(){
    const force=()=>{
      const modal=document.getElementById('modal');
      const body=document.getElementById('modalBody');
      if(!modal || !body || !String(body.innerHTML||'').trim()) return;
      modal.classList.remove('hidden','modal-closing');
      modal.classList.add('modal-ready');
      document.body.classList.add('modal-open');
    };
    requestAnimationFrame(force);
    setTimeout(force,60);
  }
  function openTrade(button){
    const id=String(
      button?.getAttribute?.('data-trade-duty') ||
      button?.getAttribute?.('data-v313-trade-id') ||
      button?.getAttribute?.('data-v312-trade-id') ||
      ''
    ).trim();
    if(!id) return toast('ไม่พบรายการเวรที่ต้องการขาย กรุณากดรีเฟรชแล้วลองใหม่');
    try{
      const fn=window.showTradeModal || (typeof showTradeModal==='function' ? showTradeModal : null);
      if(typeof fn==='function') fn(id);
      else if(typeof window.cnmiV313?.openTrade==='function') window.cnmiV313.openTrade(id);
      else if(typeof window.cnmiV312?.openTrade==='function') window.cnmiV312.openTrade(id);
      else throw new Error('trade function not ready');
      forceModalSoon();
      setTimeout(forceModalSoon,160);
    }catch(error){
      console.error(`[${VERSION}] trade open failed`,error);
      toast('เปิดหน้าขายเวรไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }
  function openEdit(button){
    const id=String(button?.getAttribute?.('data-edit-ot')||'').trim();
    if(!id) return toast('ไม่พบรายการ OT ที่ต้องการแก้ไข');
    if(button.disabled || button.hasAttribute('disabled')) return toast(button.title || 'รายการนี้ยังแก้ไขไม่ได้');
    try{
      const custom=window.cnmiV314?.openEditOt;
      if(typeof custom==='function') custom(id);
      else{
        const fn=window.openEditOtModal || window.openEditModal;
        if(typeof fn!=='function') throw new Error('edit function not ready');
        fn(id);
      }
      forceModalSoon();
    }catch(error){
      console.error(`[${VERSION}] OT edit open failed`,error);
      toast('เปิดหน้าต่างแก้ไข OT ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
    }
  }
  function runCh4(button,type){
    const attrs={self:'data-v234-ch4-self',cover:'data-v234-ch4-cover',noClaim:'data-v234-ch4-no-claim'};
    const oldAttrs={self:'data-ch4-self',cover:'data-ch4-cover'};
    const key=String(button?.getAttribute?.(attrs[type]) || button?.getAttribute?.(oldAttrs[type]) || '').trim();
    if(!key) return toast('ไม่พบรายการ ช4 ที่ต้องการจัดการ');
    const fn=window.cnmiV314?.runCh4Action;
    if(typeof fn!=='function') return toast('ระบบจัดการ ช4 ยังโหลดไม่สมบูรณ์ กรุณารีเฟรชหน้า');
    Promise.resolve(fn(type,key)).catch(error=>{
      console.error(`[${VERSION}] CH4 action failed`,error);
      toast(error?.message || 'จัดการสถานะ ช4 ไม่สำเร็จ');
    });
  }
  function actionFor(target){
    if(target?.nodeType===3) target=target.parentElement;
    if(!target?.closest) return null;
    const trade=target.closest('[data-trade-duty],[data-v313-trade-id],[data-v312-trade-id]');
    if(trade){
      const id=trade.getAttribute('data-trade-duty') || trade.getAttribute('data-v313-trade-id') || trade.getAttribute('data-v312-trade-id') || '';
      return {type:'trade',key:`trade:${id}`,node:trade};
    }
    const calendar=target.closest('[data-day-detail]');
    if(calendar) return {type:'calendar',key:`calendar:${calendar.getAttribute('data-day-detail')||''}`,node:calendar};
    const edit=target.closest('[data-edit-ot]');
    if(edit) return {type:'edit',key:`edit:${edit.getAttribute('data-edit-ot')||''}`,node:edit};
    const self=target.closest('[data-v234-ch4-self],[data-ch4-self]');
    if(self) return {type:'ch4-self',key:`ch4-self:${self.getAttribute('data-v234-ch4-self')||self.getAttribute('data-ch4-self')||''}`,node:self};
    const cover=target.closest('[data-v234-ch4-cover],[data-ch4-cover]');
    if(cover) return {type:'ch4-cover',key:`ch4-cover:${cover.getAttribute('data-v234-ch4-cover')||cover.getAttribute('data-ch4-cover')||''}`,node:cover};
    const noClaim=target.closest('[data-v234-ch4-no-claim]');
    if(noClaim) return {type:'ch4-no-claim',key:`ch4-no-claim:${noClaim.getAttribute('data-v234-ch4-no-claim')||''}`,node:noClaim};
    return null;
  }
  function execute(event,action){
    if(!action) return false;
    const now=Date.now();
    if(action.key===lastKey && now-lastAt<900){stop(event);return true;}
    lastKey=action.key;
    lastAt=now;
    stop(event);
    if(action.type==='trade') openTrade(action.node);
    else if(action.type==='calendar') openCalendar(action.node.getAttribute('data-day-detail'));
    else if(action.type==='edit') openEdit(action.node);
    else if(action.type==='ch4-self') runCh4(action.node,'self');
    else if(action.type==='ch4-cover') runCh4(action.node,'cover');
    else if(action.type==='ch4-no-claim') runCh4(action.node,'noClaim');
    return true;
  }

  window.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse') return;
    const action=actionFor(event.target);
    if(!action) return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,action,moved:false});
  },true);
  window.addEventListener('pointermove',event=>{
    const start=pointers.get(event.pointerId);
    if(start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>24) start.moved=true;
  },true);
  window.addEventListener('pointerup',event=>{
    if(event.pointerType==='mouse') return;
    const start=pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if(!start || start.moved) return;
    const target=document.elementFromPoint(event.clientX,event.clientY);
    execute(event,actionFor(target)||start.action);
  },true);
  window.addEventListener('pointercancel',event=>pointers.delete(event.pointerId),true);
  window.addEventListener('click',event=>execute(event,actionFor(event.target)),true);
  window.addEventListener('keydown',event=>{
    if(event.key!=='Enter' && event.key!==' ') return;
    execute(event,actionFor(event.target));
  },true);

  window.__cnmiV315Preload={openCalendar,openTrade,showModalDom,toast,stateSafe};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v315-interaction-preload.js", error); }
;

/* Original source: patch-v316-egress-preload.js */
try {
/* CNMI Staff Planner V316 — Supabase REST request guard
   Loaded before app.js.
   - Coalesces identical in-flight GET requests.
   - Keeps a short in-memory response cache for repeated reads.
   - Invalidates cached reads after every REST write.
   - Never caches Auth, Storage, RPC, or non-GET requests.
*/
(function(){
  'use strict';
  const VERSION='V316_EGRESS_PRELOAD';
  if(window.__CNMI_V316_EGRESS_PRELOAD__) return;
  window.__CNMI_V316_EGRESS_PRELOAD__=true;
  if(typeof window.fetch!=='function') return;

  const nativeFetch=window.fetch.bind(window);
  const inflight=new Map();
  const cache=new Map();
  const stats={network:0,cacheHits:0,deduped:0,writes:0,invalidations:0};
  const STATIC_TABLES=new Set([
    'staff_profiles','public_holidays','monthly_incharges','daily_position_masters',
    'daily_position_eligibility','staff_training_assignments','position_slot_configs',
    'duty_eligibility','roster_months'
  ]);

  function requestUrl(input){
    try{return typeof input==='string'?input:(input?.url||'');}catch(_){return '';}
  }
  function requestMethod(input,init){
    try{return String(init?.method||input?.method||'GET').toUpperCase();}catch(_){return 'GET';}
  }
  function isSupabaseRest(url){
    try{
      const parsed=new URL(url,location.href);
      return /\.supabase\.co$/i.test(parsed.hostname) && parsed.pathname.includes('/rest/v1/');
    }catch(_){return false;}
  }
  function tableName(url){
    try{
      const path=new URL(url,location.href).pathname;
      const marker='/rest/v1/';
      const tail=path.slice(path.indexOf(marker)+marker.length);
      return decodeURIComponent(tail.split('/')[0]||'').trim();
    }catch(_){return '';}
  }
  function headerValue(input,init,name){
    try{
      const headers=new Headers(input?.headers||{});
      new Headers(init?.headers||{}).forEach((v,k)=>headers.set(k,v));
      return headers.get(name)||'';
    }catch(_){return '';}
  }
  function tinyHash(text){
    let h=2166136261;
    const value=String(text||'');
    for(let i=0;i<value.length;i+=1){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }
  function requestKey(input,init,url){
    const auth=headerValue(input,init,'authorization');
    const range=headerValue(input,init,'range');
    const prefer=headerValue(input,init,'prefer');
    const acceptProfile=headerValue(input,init,'accept-profile');
    return [url,tinyHash(auth),range,prefer,acceptProfile].join('|');
  }
  function ttlFor(url){
    const table=tableName(url);
    if(STATIC_TABLES.has(table)) return 5*60*1000;
    if(table==='audit_logs') return 10*1000;
    return 20*1000;
  }
  function snapshotResponse(snapshot){
    return new Response(snapshot.body.slice(0),{
      status:snapshot.status,
      statusText:snapshot.statusText,
      headers:new Headers(snapshot.headers)
    });
  }
  async function makeSnapshot(response){
    const body=await response.arrayBuffer();
    const headers=[];
    response.headers.forEach((value,key)=>headers.push([key,value]));
    return {body,status:response.status,statusText:response.statusText,headers,ok:response.ok};
  }
  function invalidate(reason){
    if(cache.size){cache.clear();stats.invalidations+=1;}
    try{window.dispatchEvent(new CustomEvent('cnmi:v316-cache-invalidated',{detail:{reason}}));}catch(_){ }
  }
  function prune(){
    const now=Date.now();
    for(const [key,row] of cache){if(!row||row.expiresAt<=now) cache.delete(key);}
    if(cache.size>180){
      const rows=[...cache.entries()].sort((a,b)=>(a[1]?.createdAt||0)-(b[1]?.createdAt||0));
      rows.slice(0,cache.size-140).forEach(([key])=>cache.delete(key));
    }
  }

  window.fetch=async function cnmiV316Fetch(input,init={}){
    const url=requestUrl(input);
    const method=requestMethod(input,init);
    if(!isSupabaseRest(url)) return nativeFetch(input,init);

    if(method==='HEAD') return nativeFetch(input,init);
    if(method!=='GET'){
      stats.writes+=1;
      invalidate(`${method}:${tableName(url)}`);
      return nativeFetch(input,init);
    }

    const bypass=headerValue(input,init,'x-cnmi-force-refresh')==='1';
    const key=requestKey(input,init,url);
    prune();
    if(!bypass){
      const hit=cache.get(key);
      if(hit&&hit.expiresAt>Date.now()){
        stats.cacheHits+=1;
        return snapshotResponse(hit.snapshot);
      }
      if(inflight.has(key)){
        stats.deduped+=1;
        const snap=await inflight.get(key);
        return snapshotResponse(snap);
      }
    }

    const task=(async()=>{
      stats.network+=1;
      const response=await nativeFetch(input,init);
      const snapshot=await makeSnapshot(response);
      if(snapshot.ok&&!bypass){
        const now=Date.now();
        cache.set(key,{snapshot,createdAt:now,expiresAt:now+ttlFor(url)});
      }
      return snapshot;
    })();
    inflight.set(key,task);
    try{return snapshotResponse(await task);}
    finally{inflight.delete(key);}
  };

  window.cnmiV316FetchGuard={
    version:VERSION,
    stats,
    clear:()=>invalidate('manual'),
    cacheSize:()=>cache.size,
    inflightSize:()=>inflight.size
  };
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v316-egress-preload.js", error); }
;

/* Original source: patch-v316-navigation-preload.js */
try {
/* CNMI Staff Planner V316 — early route navigation guard
   Loaded before app.js so legacy capture listeners cannot bypass the route-aware loader.
*/
(function(){
  'use strict';
  const VERSION='V316_NAVIGATION_PRELOAD';
  if(window.__CNMI_V316_NAVIGATION_PRELOAD__) return;
  window.__CNMI_V316_NAVIGATION_PRELOAD__=true;
  const PAGES=new Set([
    'dashboard','calendar','leave','myProfile','activities','schedule','tradeRequests',
    'positionMonthView','positions','ot','audit','hr','hrSummary','scheduler',
    'positionMonth','profileRequests','users','eligibility','positionManagement','internManagement'
  ]);
  let serial=0;
  function appState(){try{return state;}catch(_){return window.state||null;}}
  function render(){try{const fn=window.renderPage||(typeof renderPage==='function'?renderPage:null);if(typeof fn==='function')fn();}catch(error){console.warn(`[${VERSION}] render`,error);}}
  function closeSidebar(){
    try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }
  }
  window.addEventListener('click',async event=>{
    const node=event.target?.closest?.('[data-page]');
    const page=String(node?.getAttribute?.('data-page')||'');
    if(!PAGES.has(page)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const st=appState();
    if(!st) return;
    st.page=page;
    closeSidebar();
    render();
    const ticket=++serial;
    try{await window.cnmiV316?.loadPageData?.(page,{force:false});}
    catch(error){console.warn(`[${VERSION}] route load`,page,error);}
    if(ticket===serial&&appState()?.page===page) render();
  },true);
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v316-navigation-preload.js", error); }
;
