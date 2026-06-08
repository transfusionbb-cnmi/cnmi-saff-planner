/* CNMI Duty Hub V95: Safe manual roster swap
   Patch-only. Load after v89/v90/v91/v92/v93.
   Purpose:
   - Allow Admin to manually swap staff between two roster slots on the same day.
   - Fix case: dragging ต้า onto หนิง's occupied slot failed because the old validator saw ต้า already had a duty that day.
   - Manual drag/drop changes only the intended slot(s). It does NOT auto-rebalance/fill the whole month.
   - Keeps locked slots protected.
*/
(function(){
  'use strict';
  const PATCH = 'v95-roster-manual-swap-safe';
  const GROUP_A = new Set(['ชบด1','ชบด2','ชบด3']);
  const MT_OR_TANG_CODES = new Set(['ช3A','ช3B','ช9','ช9-MT']);

  function S(){ return (typeof state !== 'undefined') ? state : null; }
  function safe(fn, fallback){ try { return fn(); } catch(e) { console.warn('[CNMI]', PATCH, e); return fallback; } }
  function toast(msg){ return safe(() => showToast(msg), console.log(msg)); }
  function render(){ return safe(() => renderPage(), null); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function idOf(slot){ return String(slot?.id || slot?._temp_id || ''); }
  function isAdminX(){ return !!safe(() => isAdmin(), false); }
  function staffById(id){ return S()?.staff?.find(x => String(x.id) === String(id)) || null; }
  function isGroupA(code){ return GROUP_A.has(String(code || '')); }
  function esc(v){ return safe(() => escapeHtml(v), String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))); }
  function nick(id){ const s = staffById(id); return s ? (s.nickname || s.full_name || '-') : '-'; }
  function thaiDate(date){ return safe(() => formatThaiDate(date), date); }

  function normalizeRole(slot){
    if (!slot) return '';
    if (String(slot.duty_code || '') === 'ช9-เคิก') return slot.required_role || 'เคิก';
    if (MT_OR_TANG_CODES.has(String(slot.duty_code || ''))) return 'MT_OR_TANG';
    return slot.required_role || '';
  }
  function roleOk(st, slot){
    if (!st) return false;
    const role = normalizeRole(slot);
    if (!role) return true;
    if (role === 'MT_OR_TANG') {
      return String(st.staff_type || '') === 'MT' || String(st.nickname || '').trim() === 'แตง' || String(st.full_name || '').includes('ศศิวิมล');
    }
    return safe(() => supportsRequiredRole(st, role), String(st.staff_type || '') === String(role));
  }
  function rosterEnabled(st){
    return !!safe(() => isRosterEnabled(st), !!(st && st.is_active && st.staff_type !== 'แพทย์' && st.roster_enabled !== false));
  }
  function overlaps(leave, date){
    return !!safe(() => overlapsDate(leave, date), String(leave?.start_date || '') <= date && String(leave?.end_date || '') >= date);
  }
  function blockedByLeave(staffId, date){
    return !!(S()?.leaves || []).some(l => String(l.staff_id) === String(staffId) && l.status !== 'cancelled' && overlaps(l, date));
  }
  function groupAOnDate(staffId, date, assignments, ignoreIds){
    return (assignments || []).some(a =>
      String(a.staff_id) === String(staffId)
      && a.duty_date === date
      && isGroupA(a.duty_code)
      && !ignoreIds.has(idOf(a))
    );
  }
  function sameDayDuty(staffId, date, assignments, ignoreIds){
    return (assignments || []).some(a =>
      String(a.staff_id) === String(staffId)
      && a.duty_date === date
      && !ignoreIds.has(idOf(a))
    );
  }
  function addDays(date, delta){
    const d = safe(() => parseDate(date), new Date(String(date) + 'T00:00:00'));
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function adjacentGroupABlock(staffId, slot, assignments, ignoreIds){
    if (!isGroupA(slot?.duty_code)) return false;
    return groupAOnDate(staffId, addDays(slot.duty_date, -1), assignments, ignoreIds)
        || groupAOnDate(staffId, addDays(slot.duty_date, 1), assignments, ignoreIds);
  }
  function canWorkIgnoring(staffId, slot, assignments, ignoreIds){
    const st = staffById(staffId);
    if (!rosterEnabled(st)) return { ok:false, reason:'ไม่อยู่ในกลุ่มจัดเวร' };
    if (!roleOk(st, slot)) return { ok:false, reason:`ประเภทไม่ตรงกับ ${slot?.duty_code || 'ช่องนี้'}` };
    if (blockedByLeave(staffId, slot?.duty_date)) return { ok:false, reason:'ติดลา/ไม่รับเวรวันนั้น' };
    if (sameDayDuty(staffId, slot?.duty_date, assignments, ignoreIds)) return { ok:false, reason:'มีเวรอื่นในวันเดียวกันแล้ว' };
    if (adjacentGroupABlock(staffId, slot, assignments, ignoreIds)) return { ok:false, reason:'ชบดติดกับชบดวันก่อน/วันถัดไป' };
    return { ok:true, reason:'' };
  }

  function monthKey(){ return S()?.monthKey || safe(() => todayStr().slice(0,7), ''); }
  function cloneRows(rows){ return safe(() => structuredClone(rows), JSON.parse(JSON.stringify(rows || []))); }
  function assignmentsForDraft(){
    const st = S();
    if (!st) return [];
    const key = monthKey();
    if (!st.rosterDraft || st.rosterDraft.monthKey !== key) {
      const existing = safe(() => getAssignmentsForMonth(key), []);
      st.rosterDraft = { monthKey: key, assignments: cloneRows(existing) };
    }
    return st.rosterDraft.assignments || [];
  }
  function findSlot(assignments, id){ return (assignments || []).find(a => idOf(a) === String(id)); }
  function findOriginSlot(assignments, staffId, date, excludeId){
    return (assignments || []).find(a =>
      String(a.staff_id) === String(staffId)
      && a.duty_date === date
      && idOf(a) !== String(excludeId || '')
    ) || null;
  }
  function captureScroll(anchor){
    const wrap = anchor?.closest?.('.table-wrap') || document.querySelector('.roster-table-wrap') || document.querySelector('.table-wrap');
    const pool = document.querySelector('.staff-pool');
    return { x: window.scrollX || 0, y: window.scrollY || 0, left: wrap ? wrap.scrollLeft : 0, top: wrap ? wrap.scrollTop : 0, poolTop: pool ? pool.scrollTop : 0 };
  }
  function restoreScroll(snap){
    const apply = () => {
      window.scrollTo(snap.x || 0, snap.y || 0);
      const wrap = document.querySelector('.roster-table-wrap') || document.querySelector('.table-wrap');
      if (wrap) { wrap.scrollLeft = snap.left || 0; wrap.scrollTop = snap.top || 0; }
      const pool = document.querySelector('.staff-pool');
      if (pool) pool.scrollTop = snap.poolTop || 0;
    };
    requestAnimationFrame(() => { apply(); setTimeout(apply, 40); setTimeout(apply, 140); });
  }
  function renderKeep(anchor){ const snap = captureScroll(anchor); render(); restoreScroll(snap); }

  function handleSchedulerDrop(e, host){
    if (!isAdminX()) return false;
    const staffId = e.dataTransfer?.getData('staffId') || e.dataTransfer?.getData('text/plain') || '';
    if (!staffId) return false;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    host.classList.remove('drag-over');

    const targetId = host.dataset.dropSlot;
    const assignments = assignmentsForDraft();
    const target = findSlot(assignments, targetId);
    if (!target) return toast('ไม่พบช่องเวรนี้');
    if (target.is_locked) return toast('ช่องนี้ล็อกอยู่ ต้องปลดล็อกก่อน');

    const origin = findOriginSlot(assignments, staffId, target.duty_date, targetId);
    const targetStaff = target.staff_id || null;

    if (String(targetStaff || '') === String(staffId)) return toast('คนนี้อยู่ช่องนี้อยู่แล้ว');

    // Case 1: target occupied and dragged staff already has another slot on same day => swap.
    if (targetStaff && origin) {
      if (origin.is_locked) return toast(`ช่องเดิมของ ${nick(staffId)} ล็อกอยู่ ต้องปลดล็อกก่อนสลับ`);
      const ignore = new Set([idOf(origin), idOf(target)]);
      const a = canWorkIgnoring(staffId, target, assignments, ignore);
      const b = canWorkIgnoring(targetStaff, origin, assignments, ignore);
      if (!a.ok || !b.ok) {
        return toast(`สลับไม่ได้: ${!a.ok ? `${nick(staffId)} ${a.reason}` : `${nick(targetStaff)} ${b.reason}`}`);
      }
      origin.staff_id = targetStaff;
      target.staff_id = staffId;
      renderKeep(host);
      return toast(`สลับเวร ${thaiDate(target.duty_date)}: ${nick(staffId)} ↔ ${nick(targetStaff)}`);
    }

    // Case 2: target empty and dragged staff has another slot on same day => move, not duplicate.
    if (!targetStaff && origin) {
      if (origin.is_locked) return toast(`ช่องเดิมของ ${nick(staffId)} ล็อกอยู่ ต้องปลดล็อกก่อนย้าย`);
      const ignore = new Set([idOf(origin), idOf(target)]);
      const a = canWorkIgnoring(staffId, target, assignments, ignore);
      if (!a.ok) return toast(`ย้ายไม่ได้: ${nick(staffId)} ${a.reason}`);
      origin.staff_id = null;
      target.staff_id = staffId;
      renderKeep(host);
      return toast(`ย้าย ${nick(staffId)} ไป ${target.duty_code} วันที่ ${thaiDate(target.duty_date)} แล้ว`);
    }

    // Case 3: normal assignment from staff pool.
    const ignore = new Set([idOf(target)]);
    const a = canWorkIgnoring(staffId, target, assignments, ignore);
    if (!a.ok) return toast(`ใส่ไม่ได้: ${nick(staffId)} ${a.reason}`);
    target.staff_id = staffId;
    renderKeep(host);
    return toast(`ใส่ ${nick(staffId)} ใน ${target.duty_code} วันที่ ${thaiDate(target.duty_date)} แล้ว`);
  }

  // Prevent old manual drag from auto-rebalancing the whole month after a manual change.
  try {
    window.rebalanceRosterAfterManualChange = rebalanceRosterAfterManualChange = function(){ return; };
  } catch(err) { console.warn('[CNMI]', PATCH, 'could not override rebalanceRosterAfterManualChange', err); }

  window.addEventListener('dragover', function(e){
    const st = S();
    if (!st || st.page !== 'scheduler') return;
    const host = e.target.closest && e.target.closest('[data-drop-slot]');
    if (!host) return;
    e.preventDefault();
    host.classList.add('drag-over');
  }, true);

  window.addEventListener('dragleave', function(e){
    const host = e.target.closest && e.target.closest('[data-drop-slot]');
    if (host) host.classList.remove('drag-over');
  }, true);

  window.addEventListener('drop', function(e){
    const st = S();
    if (!st || st.page !== 'scheduler') return;
    const host = e.target.closest && e.target.closest('[data-drop-slot]');
    if (!host) return;
    handleSchedulerDrop(e, host);
  }, true);

  function injectHint(){
    const st = S();
    if (!st || st.page !== 'scheduler') return;
    if (document.querySelector('[data-v95-swap-hint]')) return;
    const host = document.querySelector('.roster-board .card:nth-child(2) .section-title') || document.querySelector('.roster-board .card:nth-child(2)');
    if (!host) return;
    const span = document.createElement('span');
    span.dataset.v95SwapHint = '1';
    span.className = 'hint';
    span.style.marginLeft = '10px';
    span.textContent = 'ลากชื่อทับช่องที่มีคน = สลับเวร / ไม่จัดใหม่ทั้งเดือน';
    host.appendChild(span);
  }
  const oldRender = safe(() => renderPage, null);
  if (typeof oldRender === 'function' && !oldRender.__v95ManualSwapSafe) {
    const patched = function(){
      const out = oldRender.apply(this, arguments);
      setTimeout(injectHint, 0);
      return out;
    };
    patched.__v95ManualSwapSafe = true;
    window.renderPage = renderPage = patched;
  }
  setTimeout(injectHint, 500);
  console.info('[CNMI]', PATCH, 'loaded');
})();
