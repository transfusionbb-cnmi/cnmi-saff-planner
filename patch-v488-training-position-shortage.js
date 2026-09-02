/* CNMI Staff Planner V488
 * Full-day training -> show position shortage for daytime staff and physician consult.
 * No database/schema changes.
 */
(function () {
  'use strict';

  const VERSION = 'V488';
  const FULL_DAY_MINUTES = 360; // 6 hours: includes common 09:00-16:00 training days.
  const POSITION_CODES_RE = /\b(?:BB|DR)-[A-Za-z0-9+& -]+/i;

  function norm(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function parseParticipantIds(v) {
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return [];
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch (_) {}
      return s.split(',').map(x => x.trim()).filter(Boolean);
    }
    return [];
  }

  function minutes(t) {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function durationMinutes(start, end) {
    const a = minutes(start), b0 = minutes(end);
    if (a == null || b0 == null) return 0;
    let b = b0;
    if (b <= a) b += 24 * 60;
    return b - a;
  }

  function isFullDayTraining(a) {
    if (!a || norm(a.event_type) !== 'อบรม') return false;
    const dur = durationMinutes(a.start_time, a.end_time);
    if (dur >= FULL_DAY_MINUTES) return true;
    const st = minutes(a.start_time), en = minutes(a.end_time);
    return st != null && en != null && st <= 9 * 60 && en >= 15 * 60 + 30;
  }

  function inDateRange(date, start, end) {
    const d = String(date || '');
    return !!d && (!start || d >= String(start)) && (!end || d <= String(end));
  }

  const THAI_MONTHS = {
    'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
    'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12
  };
  function pad2(n) { return String(n).padStart(2, '0'); }

  function parseThaiDateText(s) {
    const m = norm(s).match(/(\d{1,2})\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+(\d{4})/);
    if (!m) return '';
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return `${y}-${pad2(THAI_MONTHS[m[2]])}-${pad2(Number(m[1]))}`;
  }

  function dashboardDate() {
    try {
      const keys = ['dashboardDate', 'dashboardSelectedDate', 'selectedDashboardDate', 'dashboardDateKey', 'selectedDate'];
      for (const k of keys) {
        const v = (typeof state !== 'undefined' && state) ? state[k] : null;
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        if (v instanceof Date && !Number.isNaN(v.getTime())) {
          return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
        }
      }
    } catch (_) {}

    const root = document.getElementById('pageContent');
    if (root) {
      const dateInputs = Array.from(root.querySelectorAll('input[type="date"]'));
      for (const input of dateInputs) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(input.value || '')) return input.value;
      }
    }
    const title = document.getElementById('pageTitle');
    const parsedTitle = parseThaiDateText(title ? title.textContent : '');
    if (parsedTitle) return parsedTitle;
    const parsedRoot = parseThaiDateText(root ? root.textContent : '');
    if (parsedRoot) return parsedRoot;

    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  }

  function exactTextElements(root, text) {
    if (!root || !text) return [];
    const out = [];
    const all = root.querySelectorAll('span,button,b,strong,small,p,div,td');
    for (const el of all) {
      if (norm(el.textContent) === text) out.push(el);
    }
    return out;
  }

  function findSectionRoot(root, headingText) {
    if (!root) return null;
    const heads = Array.from(root.querySelectorAll('h1,h2,h3,h4,b,strong,div'))
      .filter(el => norm(el.textContent) === headingText || norm(el.textContent).startsWith(headingText));
    for (const h of heads) {
      let n = h;
      while (n && n !== root) {
        if (n.classList && n.classList.contains('card')) return n;
        n = n.parentElement;
      }
    }
    return null;
  }

  function closestPositionCard(nameEl, root) {
    let n = nameEl;
    while (n && n !== root) {
      const t = norm(n.textContent);
      if (POSITION_CODES_RE.test(t) && t.length < 420) return n;
      n = n.parentElement;
    }
    return null;
  }

  function closestConsultCard(nameEl, root) {
    let n = nameEl;
    while (n && n !== root) {
      const t = norm(n.textContent);
      if (/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/.test(t) && /(Donor|Blood Bank|Donor\s*&\s*BB)/i.test(t) && t.length < 500) return n;
      n = n.parentElement;
    }
    return null;
  }

  function addStatus(card, training, doctorMode) {
    if (!card || card.querySelector(':scope > .v488-training-shortage')) return;
    if (/ลาทั้งวัน|ลาครึ่ง|ตำแหน่งขาด|ขาดช่วง/.test(norm(card.textContent))) return;

    card.classList.add('v488-training-missing-card');
    const row = document.createElement('div');
    row.className = 'v488-training-shortage';
    const title = norm(training && training.title);
    row.innerHTML = `<span class="badge blue v488-training-badge" title="${escapeAttr(title || 'อบรมทั้งวัน')}">🎓 อบรมทั้งวัน</span><span class="badge red v488-missing-badge">⚠ ${doctorMode ? 'Consult ขาด' : 'ตำแหน่งขาด'}</span>`;
    card.appendChild(row);
  }

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function trainingOverlapsConsult(training, card) {
    const m = norm(card.textContent).match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
    if (!m) return true;
    const ts = minutes(training.start_time), te0 = minutes(training.end_time);
    let cs = minutes(m[1]), ce = minutes(m[2]);
    if (ts == null || te0 == null || cs == null || ce == null) return true;
    let te = te0;
    if (te <= ts) te += 1440;
    if (ce <= cs) ce += 1440;
    // Compare daytime interval and, if consult crosses midnight, its same-day portion.
    return Math.max(ts, cs) < Math.min(te, ce);
  }

  function restorePrevious() {
    document.querySelectorAll('.v488-training-shortage').forEach(el => el.remove());
    document.querySelectorAll('.v488-training-missing-card').forEach(el => el.classList.remove('v488-training-missing-card'));
    document.querySelectorAll('[data-v488-original-text]').forEach(el => {
      el.textContent = el.dataset.v488OriginalText;
      delete el.dataset.v488OriginalText;
    });
    document.querySelectorAll('.v488-summary-training').forEach(el => el.remove());
  }

  function leafWithRegex(root, re) {
    if (!root) return null;
    const els = Array.from(root.querySelectorAll('span,small,b,strong,div'));
    return els.find(el => el.children.length === 0 && re.test(norm(el.textContent))) || null;
  }

  function decrementReadyText(root, count, regex) {
    if (!root || !count) return;
    const el = leafWithRegex(root, regex);
    if (!el) return;
    const text = norm(el.textContent);
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return;
    if (!el.dataset.v488OriginalText) el.dataset.v488OriginalText = el.textContent;
    const ready = Math.max(0, Number(m[1]) - count);
    el.textContent = text.replace(/\d+\s*\/\s*\d+/, `${ready}/${m[2]}`);
  }

  function nearestReadyGroup(card, sectionRoot) {
    let n = card && card.parentElement;
    while (n && n !== sectionRoot) {
      if (/พร้อม\s*\d+\s*\/\s*\d+/.test(norm(n.textContent))) return n;
      n = n.parentElement;
    }
    return null;
  }

  function findStaffById(id) {
    try {
      return (state.staff || []).find(s => String(s.id) === String(id));
    } catch (_) { return null; }
  }

  function staffLabel(st) {
    return norm(st && (st.nickname || st.full_name));
  }

  function decorate() {
    const root = document.getElementById('pageContent');
    if (!root) return;
    const pageTitle = norm(document.getElementById('pageTitle')?.textContent);
    if (!pageTitle.includes('ภาพรวม')) return;

    restorePrevious();

    const date = dashboardDate();
    let activities = [];
    try { activities = Array.isArray(state.activities) ? state.activities : []; } catch (_) {}
    const trainings = activities.filter(a => inDateRange(date, a.start_date, a.end_date) && isFullDayTraining(a));
    if (!trainings.length) return;

    const participantMap = new Map(); // staff id -> first matching training
    for (const a of trainings) {
      for (const id of parseParticipantIds(a.participant_ids)) {
        if (!participantMap.has(String(id))) participantMap.set(String(id), a);
      }
    }
    if (!participantMap.size) return;

    const signature = date + '|' + Array.from(participantMap.entries())
      .map(([id, a]) => `${id}:${a.id || a.title || ''}:${a.start_time || ''}-${a.end_time || ''}`)
      .sort().join('|');
    const hasDecoration = !!root.querySelector('.v488-training-shortage, .v488-summary-training');
    if (root.dataset.v488TrainingSignature === signature && hasDecoration) return;
    root.dataset.v488TrainingSignature = signature;

    const posRoot = findSectionRoot(root, 'ตำแหน่งกลางวัน');
    const consultRoot = findSectionRoot(root, 'แพทย์ Consult');

    let positionMissing = 0;
    const groupCounts = new Map();
    const positionMarkedStaff = new Set();

    if (posRoot) {
      for (const [id, training] of participantMap.entries()) {
        const st = findStaffById(id);
        const label = staffLabel(st);
        if (!label) continue;
        const matches = exactTextElements(posRoot, label);
        for (const el of matches) {
          const card = closestPositionCard(el, posRoot);
          if (!card) continue;
          if (card.querySelector('.v488-training-shortage')) continue;
          addStatus(card, training, false);
          if (!card.querySelector('.v488-training-shortage')) continue;
          positionMissing += 1;
          positionMarkedStaff.add(id);
          const group = nearestReadyGroup(card, posRoot);
          if (group) groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
          break;
        }
      }

      groupCounts.forEach((count, group) => decrementReadyText(group, count, /พร้อม\s*\d+\s*\/\s*\d+/));
      decrementReadyText(posRoot, positionMarkedStaff.size, /พร้อมปฏิบัติงาน\s*\d+\s*\/\s*\d+/);

      if (positionMarkedStaff.size) {
        const readyEl = leafWithRegex(posRoot, /พร้อมปฏิบัติงาน\s*\d+\s*\/\s*\d+/);
        const holder = readyEl && readyEl.parentElement;
        if (holder && !holder.querySelector('.v488-summary-training')) {
          const chip = document.createElement('span');
          chip.className = 'badge blue v488-summary-training';
          chip.textContent = `อบรม ${positionMarkedStaff.size}`;
          holder.appendChild(chip);
        }
      }
    }

    let consultMissing = 0;
    if (consultRoot) {
      const markedCards = new Set();
      for (const [id, training] of participantMap.entries()) {
        const st = findStaffById(id);
        const label = staffLabel(st);
        if (!label) continue;
        const matches = exactTextElements(consultRoot, label);
        for (const el of matches) {
          const card = closestConsultCard(el, consultRoot);
          if (!card || markedCards.has(card) || !trainingOverlapsConsult(training, card)) continue;
          addStatus(card, training, true);
          if (card.querySelector('.v488-training-shortage')) {
            markedCards.add(card);
            consultMissing += 1;
          }
        }
      }
      decrementReadyText(consultRoot, consultMissing, /พร้อม\s*\d+\s*\/\s*\d+/);
    }
  }

  function installStyle() {
    if (document.getElementById('v488-style')) return;
    const style = document.createElement('style');
    style.id = 'v488-style';
    style.textContent = `
      .v488-training-missing-card{box-shadow:inset 0 0 0 2px rgba(239,68,68,.16);background:linear-gradient(0deg,rgba(255,247,247,.88),rgba(255,255,255,.98))!important}
      .v488-training-shortage{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px}
      .v488-training-shortage .badge{font-weight:700}
      .v488-summary-training{margin-left:6px}
      @media(max-width:820px){.v488-training-shortage{gap:5px;margin-top:6px}.v488-training-shortage .badge{font-size:12px;padding:5px 8px}}
    `;
    document.head.appendChild(style);
  }

  installStyle();

  let queued = false;
  function scheduleDecorate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      try { decorate(); } catch (err) { console.warn(VERSION, err); }
    });
  }

  try {
    if (typeof renderPage === 'function') {
      const baseRenderPage = renderPage;
      renderPage = function (...args) {
        const out = baseRenderPage.apply(this, args);
        scheduleDecorate();
        setTimeout(scheduleDecorate, 80);
        return out;
      };
    }
  } catch (_) {}

  const observeTarget = document.getElementById('pageContent') || document.body;
  if (observeTarget && window.MutationObserver) {
    const mo = new MutationObserver(() => scheduleDecorate());
    mo.observe(observeTarget, { childList: true, subtree: true });
  }
  setTimeout(scheduleDecorate, 150);
})();
