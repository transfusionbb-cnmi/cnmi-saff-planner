/* CNMI Staff Planner v672: make each activity session's participant picker
   match the compact, readable participant picker at the top of the form.
   UI-only patch. v671 handles session data, saving, and manpower calculations.
*/
(function () {
  'use strict';
  if (window.__CNMI_V672_ROUND_MEMBERS_UI__) return;
  window.__CNMI_V672_ROUND_MEMBERS_UI__ = true;

  function formatMemberName(label) {
    const input = label.querySelector('input[data-v654-member]');
    if (!input) return;
    label.classList.add('v396-participant', 'v672-member-option');
    const span = label.querySelector('span');
    if (span && !span.querySelector('b')) {
      const name = span.textContent.trim();
      span.replaceChildren();
      const bold = document.createElement('b');
      bold.textContent = name;
      span.appendChild(bold);
    }
    // Keep the staff ID and name together for search; only the visual layout
    // changes, never checkbox values or the participant/session model.
    const appState = window.state || (typeof state !== 'undefined' ? state : null);
    const staff = Array.isArray(appState?.staff) ? appState.staff : [];
    const person = staff.find(p => String(p?.id) === String(input.value));
    const full = String(person?.full_name || '');
    const nickname = String(person?.nickname || span?.textContent || '');
    label.dataset.v672Search = `${nickname} ${full}`.toLocaleLowerCase();
    if (full) label.title = full;
  }

  function enhanceRound(round) {
    if (!round || round.dataset.v672Enhanced === '1') return;
    const members = round.querySelector('.v654-members');
    if (!members) return;
    round.dataset.v672Enhanced = '1';
    members.classList.add('v672-member-grid');
    members.querySelectorAll('.v654-member').forEach(formatMemberName);
    const toolbar = document.createElement('div');
    toolbar.className = 'v672-member-tools';
    toolbar.innerHTML = `
      <input type="search" data-v672-round-search aria-label="ค้นหาผู้เข้าร่วมในรอบนี้" placeholder="ค้นหาชื่อผู้เข้าร่วม" autocomplete="off">
      <button type="button" class="ghost-btn" data-v672-round-select>เลือกทั้งหมด</button>
      <button type="button" class="ghost-btn" data-v672-round-clear>ล้างทั้งหมด</button>`;
    members.before(toolbar);
  }

  function enhanceAll(scope) {
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll('.v654-round').forEach(enhanceRound);
  }

  // v671 creates the form from a string; decorate that string instead of
  // observing the live DOM (avoids the earlier MutationObserver freeze).
  const previous = window.renderActivitiesPage ||
    (typeof renderActivitiesPage === 'function' ? renderActivitiesPage : null);
  if (typeof previous === 'function') {
    const wrapped = function renderActivitiesPageV672() {
      const html = previous.apply(this, arguments);
      if (typeof html !== 'string' || !html.includes('v654-round')) return html;
      const template = document.createElement('template');
      template.innerHTML = html;
      enhanceAll(template.content);
      return template.innerHTML;
    };
    try { window.renderActivitiesPage = renderActivitiesPage = wrapped; }
    catch (_) { window.renderActivitiesPage = wrapped; }
  }

  function refreshCount(round) {
    if (!round) return;
    const selected = round.querySelectorAll('input[data-v654-member]:checked').length;
    const count = round.querySelector('[data-v654-count]');
    if (count) count.textContent = `${selected} คน`;
  }

  // Every round has its own search and bulk selection. Never modify people
  // selected in other rounds. 'เลือกทั้งหมด' always means the whole round.
  document.addEventListener('input', function (event) {
    if (!event.target?.matches?.('[data-v672-round-search]')) return;
    const round = event.target.closest('.v654-round');
    if (!round) return;
    const query = event.target.value.trim().toLocaleLowerCase();
    round.querySelectorAll('.v672-member-option').forEach(label => {
      label.hidden = !!query && !(label.dataset.v672Search || label.textContent.toLocaleLowerCase()).includes(query);
    });
  });

  document.addEventListener('click', function (event) {
    const button = event.target?.closest?.('[data-v672-round-select],[data-v672-round-clear]');
    if (!button) return;
    event.preventDefault();
    const round = button.closest('.v654-round');
    if (!round) return;
    const selected = button.hasAttribute('data-v672-round-select');
    const inputs = [...round.querySelectorAll('input[data-v654-member]')];
    inputs.forEach(input => { input.checked = selected; });
    // Trigger v671's existing count and legacy-participant synchronization.
    if (inputs[0]) inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    refreshCount(round);
  });

  // v671 inserts a round directly in the DOM when enabling sessions or
  // clicking + เพิ่มรอบ. Enhance it after v671's synchronous listener ends.
  document.addEventListener('click', function (event) {
    if (!event.target?.closest?.('[data-v654-add]')) return;
    const form = event.target.closest('#activityForm');
    if (form) queueMicrotask(() => enhanceAll(form));
  });
  document.addEventListener('change', function (event) {
    if (!event.target?.matches?.('[data-v654-enabled]')) return;
    const form = event.target.closest('#activityForm');
    if (form) queueMicrotask(() => enhanceAll(form));
  });

  function versionChipOnce() {
    document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(el => {
      if (el.textContent.trim() === 'v671') el.textContent = 'v672';
      if (el.title.includes('v671')) el.title = 'v672 เลือกผู้เข้าร่วมกิจกรรมแต่ละรอบอ่านง่าย';
    });
    enhanceAll(document);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', versionChipOnce, { once: true });
  else versionChipOnce();
  window.addEventListener('pageshow', versionChipOnce);

  const style = document.createElement('style');
  style.id = 'v672-round-members-style';
  style.textContent = `
    .v654-session-editor .v672-member-tools {display:grid;grid-template-columns:minmax(140px,1fr) auto auto;gap:7px;align-items:center;margin:9px 0 7px;}
    .v654-session-editor .v672-member-tools input[type="search"] {min-width:0;width:100%;height:38px;min-height:38px;padding:6px 10px;box-sizing:border-box;border:1px solid #cfe1ec;border-radius:9px;font-size:13px;}
    .v654-session-editor .v672-member-tools button {min-height:36px!important;padding:6px 10px!important;border:1px solid #d4e5ef;border-radius:9px;font-size:12px!important;white-space:nowrap;}
    .v654-session-editor .v654-members.v672-member-grid {display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:7px;max-height:220px;overflow-y:auto;overflow-x:hidden;padding:2px;margin-top:0;align-content:start;}
    .v654-session-editor .v654-member.v672-member-option {display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:auto!important;min-width:0!important;min-height:42px!important;margin:0!important;padding:7px 9px!important;box-sizing:border-box!important;border:1px solid #dce6ed;border-radius:10px;background:#fff;overflow:hidden;cursor:pointer;}
    .v654-session-editor .v654-member.v672-member-option[hidden] {display:none!important;}
    .v654-session-editor .v654-member.v672-member-option:has(input:checked) {background:#eef8fd;border-color:#85bedc;box-shadow:inset 0 0 0 1px rgba(93,174,224,.1);}
    .v654-session-editor .v654-member.v672-member-option input[type="checkbox"] {appearance:auto!important;display:block!important;position:static!important;width:18px!important;height:18px!important;min-width:18px!important;max-width:18px!important;min-height:18px!important;max-height:18px!important;flex:0 0 18px!important;padding:0!important;margin:0!important;transform:none!important;zoom:1!important;box-shadow:none!important;accent-color:#4d9fd0;}
    .v654-session-editor .v654-member.v672-member-option span {display:block!important;flex:1 1 auto;min-width:0!important;width:auto!important;margin:0!important;overflow:hidden;}
    .v654-session-editor .v654-member.v672-member-option b {display:block;font-size:13px;font-weight:700;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    @media(max-width:660px) {
      .v654-session-editor .v672-member-tools {grid-template-columns:repeat(2,minmax(0,1fr));}
      .v654-session-editor .v672-member-tools input[type="search"] {grid-column:1/-1;}
      .v654-session-editor .v654-members.v672-member-grid {grid-template-columns:repeat(2,minmax(0,1fr));max-height:230px;gap:6px;}
      .v654-session-editor .v654-member.v672-member-option {padding:7px!important;gap:6px!important;min-height:41px!important;}
      .v654-session-editor .v654-member.v672-member-option b {font-size:12px;}
    }
  `;
  document.head.appendChild(style);
  console.info('[V672_ACTIVITY_ROUND_PARTICIPANTS_UI] loaded');
})();
