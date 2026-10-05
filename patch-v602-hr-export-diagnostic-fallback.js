/* CNMI Staff Planner V602 — HR Export Diagnostic + Snapshot-safe fallback
 * Base: V601
 * Scope:
 *   - Keep V532 per-person preflight guard intact.
 *   - Show a centered, readable error dialog when Export is blocked.
 *   - Snapshot-table/configuration failures no longer make the Excel button appear dead:
 *     if preflight itself passes, Excel may continue while a local fallback audit record is kept.
 *   - Never bypass a real Staff_Total / HR_OT / copy mismatch.
 */
(() => {
  'use strict';
  const VERSION = 'V602_HR_EXPORT_DIAGNOSTIC_FALLBACK';
  if (window.__CNMI_V602_HR_EXPORT_DIAGNOSTIC_FALLBACK__) return;
  window.__CNMI_V602_HR_EXPORT_DIAGNOSTIC_FALLBACK__ = true;

  const text = v => String(v ?? '').trim();
  const esc = v => text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = () => window.cnmiV532ExportGuard || null;
  const fallbackKey = batchId => `cnmi-v602-export-fallback:${text(batchId) || 'unknown'}`;

  function centeredDialog(title, message, tone='error') {
    const lines = text(message).split(/\n+/).map(s => s.replace(/^\s*[•-]\s*/, '').trim()).filter(Boolean);
    const list = lines.length > 1
      ? `<ul class="v602-export-list">${lines.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
      : `<p class="v602-export-message">${esc(lines[0] || message)}</p>`;
    const html = `<div class="v602-export-dialog ${tone === 'warn' ? 'is-warn' : 'is-error'}">
      <div class="v602-export-icon">${tone === 'warn' ? '!' : '×'}</div>
      <h3>${esc(title)}</h3>
      ${list}
      <p class="v602-export-help">${tone === 'warn'
        ? 'ไฟล์ Excel จะยังสร้างได้ เพราะการตรวจยอดผ่านแล้ว แต่ Snapshot บน Supabase ยังบันทึกไม่ได้ กรุณาให้ Admin ติดตั้ง/ตรวจ SQL V532 ภายหลัง'
        : 'ระบบยังไม่ Export เพื่อป้องกันยอด HR ผิด กรุณาแก้รายการที่แจ้ง แล้วกด Export ใหม่'}</p>
    </div>`;
    try {
      if (typeof showModal === 'function') { showModal(html); return; }
    } catch (_) {}
    const modal = document.getElementById('modal'), body = document.getElementById('modalBody');
    if (modal && body) {
      body.innerHTML = html;
      modal.classList.remove('hidden');
      return;
    }
    window.alert(`${title}\n\n${text(message)}`);
  }

  function snapshotProblem(err) {
    const s = text(err?.message || err);
    return /ot_export_snapshots|SQL_V532|V532.*SQL|42P01|42501|row[- ]level security|permission denied|schema cache|does not exist|relation .*snapshot|snapshot.*supabase/i.test(s);
  }

  function saveLocalFallback(ctx, report, phase, err) {
    try {
      const source = ctx?.data?.source || ctx?.source || {};
      const cycle = ctx?.data?.cycle || ctx?.cycle || {};
      const payload = {
        version: VERSION,
        saved_at: new Date().toISOString(),
        phase,
        batch_id: ctx?.batchId || null,
        filename: ctx?.filename || null,
        source,
        cycle,
        preflight: report ? {
          ok: !!report.ok,
          errors: report.errors || [],
          warnings: report.warnings || [],
          hr_row_count: report.hr_row_count,
          copy_row_count: report.copy_row_count,
          expected_row_count: report.expected_row_count,
          total_claimed_hours: report.total_claimed_hours,
          total_money: report.total_money,
          staff: report.details || []
        } : null,
        error: text(err?.message || err)
      };
      localStorage.setItem(fallbackKey(ctx?.batchId), JSON.stringify(payload));
      return true;
    } catch (_) { return false; }
  }

  function reportMessage(report) {
    const errors = Array.isArray(report?.errors) ? report.errors : [];
    if (!errors.length) return 'ไม่พบรายละเอียดจุดที่ไม่ตรง กรุณารีเฟรชหน้าแล้วลองใหม่';
    const shown = errors.slice(0, 12);
    if (errors.length > shown.length) shown.push(`และอีก ${errors.length - shown.length} จุด`);
    return shown.join('\n');
  }

  function install() {
    const guard = api();
    if (!guard || guard.__v602Wrapped) return false;
    guard.__v602Wrapped = true;

    const oldPre = guard.preExport;
    const oldPost = guard.postExport;
    const oldFailed = guard.exportFailed;

    guard.preExport = async function(ctx) {
      let report = null;
      try { report = typeof guard.preflightReport === 'function' ? guard.preflightReport(ctx) : null; } catch (_) {}

      if (report && !report.ok) {
        centeredDialog('Export HR ยังไม่ได้ — พบยอดไม่ตรง', reportMessage(report), 'error');
        const err = new Error(`V602 หยุด Export เพราะยอดไม่ตรงกัน\n${reportMessage(report)}`);
        err.cnmiV602Preflight = true;
        throw err;
      }

      try {
        const out = typeof oldPre === 'function' ? await oldPre.apply(this, arguments) : report;
        window.__CNMI_V602_FALLBACK_EXPORT__ = null;
        return out || report;
      } catch (err) {
        if (snapshotProblem(err) && report?.ok) {
          saveLocalFallback(ctx, report, 'prepared-local-fallback', err);
          window.__CNMI_V602_FALLBACK_EXPORT__ = { batchId: ctx?.batchId, ctx, report, error: text(err?.message || err) };
          centeredDialog('Snapshot Supabase ยังบันทึกไม่ได้', text(err?.message || err), 'warn');
          try { if (typeof showToast === 'function') showToast('ยอดตรวจผ่านแล้ว • ใช้ Local Audit ชั่วคราวและสร้าง Excel ต่อ', {tone:'warning'}); } catch (_) {}
          return report;
        }
        centeredDialog('Export HR ไม่สำเร็จ', text(err?.message || err || 'เกิดข้อผิดพลาดก่อนสร้างไฟล์'), 'error');
        throw err;
      }
    };

    guard.postExport = async function(ctx) {
      const fb = window.__CNMI_V602_FALLBACK_EXPORT__;
      if (fb && (!fb.batchId || fb.batchId === ctx?.batchId)) {
        saveLocalFallback(ctx, fb.report, 'exported-local-fallback', fb.error || 'Supabase snapshot unavailable');
        window.__CNMI_V602_FALLBACK_EXPORT__ = null;
        try { if (typeof showToast === 'function') showToast(`Export Excel สำเร็จ • Batch ${ctx?.batchId || '-'} • Snapshot เก็บ Local ชั่วคราว`, {tone:'warning'}); } catch (_) {}
        return fb.report;
      }
      try {
        return typeof oldPost === 'function' ? await oldPost.apply(this, arguments) : undefined;
      } catch (err) {
        let report = null;
        try { report = typeof guard.preflightReport === 'function' ? guard.preflightReport(ctx) : null; } catch (_) {}
        if (snapshotProblem(err) && report?.ok) {
          saveLocalFallback(ctx, report, 'exported-local-fallback', err);
          centeredDialog('Excel สร้างแล้ว แต่ Snapshot Supabase ยังบันทึกไม่ได้', text(err?.message || err), 'warn');
          return report;
        }
        throw err;
      }
    };

    guard.exportFailed = async function(ctx, err) {
      if (err?.cnmiV602Preflight) return;
      try { return typeof oldFailed === 'function' ? await oldFailed.apply(this, arguments) : undefined; }
      catch (_) { return undefined; }
    };

    console.info(`[${VERSION}] wrapped V532 export guard`);
    return true;
  }

  function decorateButton(root=document) {
    root.querySelectorAll?.('[data-export-hr-v318],[data-export-hr-v241]').forEach(btn => {
      if (btn.dataset.v602Decorated) return;
      btn.dataset.v602Decorated = '1';
      btn.title = 'ตรวจยอดก่อน แล้วสร้าง Excel HR';
    });
  }

  const css = document.createElement('style');
  css.textContent = `
    .v602-export-dialog{max-width:720px;margin:0 auto;padding:6px 4px 2px;text-align:left}
    .v602-export-dialog .v602-export-icon{width:46px;height:46px;border-radius:999px;display:grid;place-items:center;margin:0 auto 10px;font-size:30px;font-weight:900;line-height:1}
    .v602-export-dialog.is-error .v602-export-icon{background:#fee2e2;color:#b91c1c}
    .v602-export-dialog.is-warn .v602-export-icon{background:#fef3c7;color:#92400e}
    .v602-export-dialog h3{text-align:center;margin:0 0 12px;font-size:20px}
    .v602-export-list{margin:8px 0 12px;padding:12px 12px 12px 30px;border:1px solid #fecaca;border-radius:12px;background:#fff7f7;max-height:42vh;overflow:auto}
    .v602-export-dialog.is-warn .v602-export-list{border-color:#fde68a;background:#fffbeb}
    .v602-export-list li{margin:6px 0;line-height:1.5}
    .v602-export-message{padding:12px;border-radius:12px;background:#f8fafc;white-space:pre-wrap;line-height:1.55}
    .v602-export-help{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#eff6ff;color:#1e3a5f;font-size:13px;line-height:1.5}
  `;
  document.head.appendChild(css);

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (install() || tries > 80) clearInterval(timer);
    decorateButton();
  }, 125);

  const mo = new MutationObserver(() => decorateButton());
  if (document.documentElement) mo.observe(document.documentElement, {childList:true, subtree:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => decorateButton(), {once:true});
  else decorateButton();

  window.cnmiV602 = {version:VERSION, install, snapshotProblem};
})();
