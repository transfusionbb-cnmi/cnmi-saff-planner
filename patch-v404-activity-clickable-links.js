/* CNMI Staff Planner V404
 * Clickable links for unit activities.
 * - Converts web links in activity notes/details into safe external links.
 * - target="_blank" lets installed PWA hand the link to Chrome/Safari.
 * - Display-only patch: no Supabase schema/query/write changes.
 */
(function () {
  'use strict';
  if (window.__CNMI_V404_ACTIVITY_CLICKABLE_LINKS__) return;
  window.__CNMI_V404_ACTIVITY_CLICKABLE_LINKS__ = true;

  const LINK_RE = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9-]+\.)+(?:com|org|net|io|app|me|ly|co\.th|ac\.th|go\.th|or\.th|in\.th|th)(?:\/[^\s<>"']*)?/gi;
  const TRAILING_PUNCTUATION_RE = /[),.;!?\]}>'"”’。、，；：]+$/;
  const ACTIVITY_SELECTORS = [
    '.v397-detail-note',
    '.v397-activity-item',
    '.activity-row-card',
    '.calendar-modal-row'
  ].join(',');

  function normaliseHref(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }

  function splitTrailingPunctuation(raw) {
    let url = String(raw || '');
    let suffix = '';
    while (url && TRAILING_PUNCTUATION_RE.test(url)) {
      suffix = url.slice(-1) + suffix;
      url = url.slice(0, -1);
    }
    return { url, suffix };
  }

  function linkifyTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || node.parentElement?.closest('a,script,style,textarea,input,select,option,button,code,pre')) return;
    const text = node.nodeValue || '';
    LINK_RE.lastIndex = 0;
    if (!LINK_RE.test(text)) return;
    LINK_RE.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match;
    while ((match = LINK_RE.exec(text))) {
      if (match.index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const parts = splitTrailingPunctuation(match[0]);
      if (!parts.url) {
        fragment.appendChild(document.createTextNode(match[0]));
      } else {
        const anchor = document.createElement('a');
        anchor.className = 'v404-activity-link';
        anchor.href = normaliseHref(parts.url);
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer external';
        anchor.referrerPolicy = 'no-referrer-when-downgrade';
        anchor.textContent = parts.url;
        anchor.title = 'กดเพื่อเปิดลิงก์ใน Chrome หรือ Safari';
        anchor.setAttribute('aria-label', `เปิดลิงก์ ${parts.url}`);
        fragment.appendChild(anchor);
        if (parts.suffix) fragment.appendChild(document.createTextNode(parts.suffix));
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  }

  function linkifyElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let current;
    while ((current = walker.nextNode())) nodes.push(current);
    nodes.forEach(linkifyTextNode);
  }

  function addActivityFormHint(root) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll('#activityForm textarea[name="note"]').forEach(textarea => {
      textarea.placeholder = 'วางรายละเอียดหรือลิงก์ได้ เช่น Zoom, Google Meet, Google Docs, Excel หรือแบบสอบถาม';
      const label = textarea.closest('label');
      if (!label || label.querySelector('.v404-link-hint')) return;
      const hint = document.createElement('small');
      hint.className = 'hint v404-link-hint';
      hint.textContent = 'ลิงก์ที่บันทึกจะแสดงเป็นข้อความกดได้ และเปิดใน Chrome หรือ Safari';
      label.appendChild(hint);
    });
  }

  function process(root) {
    const scope = root?.querySelectorAll ? root : document;
    if (scope.matches?.(ACTIVITY_SELECTORS)) linkifyElement(scope);
    scope.querySelectorAll?.(ACTIVITY_SELECTORS).forEach(linkifyElement);
    addActivityFormHint(scope);
  }

  let queued = false;
  function queueProcess() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      process(document);
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          queueProcess();
          return;
        }
      }
    }
  });

  function start() {
    process(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  const style = document.createElement('style');
  style.textContent = `
    .v404-activity-link{color:#075fae;font-weight:700;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;overflow-wrap:anywhere;word-break:break-word;cursor:pointer}
    .v404-activity-link:hover{color:#034b89}
    .v404-activity-link:focus-visible{outline:3px solid rgba(38,145,224,.28);outline-offset:2px;border-radius:4px}
    .v404-activity-link::after{content:' ↗';font-size:.82em;text-decoration:none;display:inline-block}
    .v404-link-hint{display:block;margin-top:5px;line-height:1.35}
  `;
  document.head.appendChild(style);
})();
