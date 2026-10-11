/* CNMI Staff Planner — V606
   Leave history quota review dedupe
   - Prevent repeated green "ตรวจโควตาแล้ว" cards when renderLeavePage is wrapped more than once.
   - Keep one canonical quota review card only.
*/
(() => {
  'use strict';
  if (window.__CNMI_V606_LEAVE_QUOTA_REVIEW_DEDUPE__) return;
  window.__CNMI_V606_LEAVE_QUOTA_REVIEW_DEDUPE__ = true;

  const VERSION = 'V606_LEAVE_QUOTA_REVIEW_DEDUPE';

  function dedupeHtml(html) {
    let out = String(html ?? '');
    const marker = 'data-v576-review-card';
    if (!out.includes(marker)) return out;

    let seen = false;
    out = out.replace(/<div class="v576-review-card(?: v576-review-ok)?" data-v576-review-card>[\s\S]*?<\/div>/g, (card) => {
      if (seen) return '';
      seen = true;
      return card;
    });
    return out;
  }

  function installRenderGuard() {
    let base = null;
    try { base = window.renderLeavePage || (typeof renderLeavePage === 'function' ? renderLeavePage : null); }
    catch (_) { base = window.renderLeavePage || null; }
    if (typeof base !== 'function' || base.__v606QuotaReviewDedupe) return false;

    const wrapped = function renderLeavePageV606() {
      return dedupeHtml(base.apply(this, arguments));
    };
    wrapped.__v606QuotaReviewDedupe = true;
    try { window.renderLeavePage = wrapped; renderLeavePage = wrapped; }
    catch (_) { window.renderLeavePage = wrapped; }
    return true;
  }

  function dedupeDom() {
    try {
      const cards = [...document.querySelectorAll('.v576-review-card[data-v576-review-card], .v576-review-card.v576-review-ok')];
      cards.slice(1).forEach(el => el.remove());
    } catch (_) {}
  }

  function versionChip() {
    try {
      document.querySelectorAll('.v520-version-chip,.v542-version-chip,.v524-version-chip').forEach(chip => {
        chip.textContent = 'v606';
        chip.title = 'V606: แก้การ์ดตรวจโควตาซ้ำในประวัติการลา';
      });
    } catch (_) {}
  }

  installRenderGuard();
  dedupeDom();
  versionChip();

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    installRenderGuard();
    dedupeDom();
    versionChip();
    if (tries >= 80) clearInterval(timer);
  }, 100);

  window.addEventListener('pageshow', () => { installRenderGuard(); dedupeDom(); versionChip(); });
  console.info(`[${VERSION}] loaded`);
})();
