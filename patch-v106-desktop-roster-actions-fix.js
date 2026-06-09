/* patch-v106-desktop-roster-actions-fix.js
   CNMI Staff Planner patch-only
   Scope: Desktop monthly roster page only
   Purpose:
   - Replace v104/v105 desktop roster overlay with a stable 4-view desktop UI
   - Make buttons clickable: Day / Person / Summary by person / Full month calendar
   - Keep mobile untouched
   - Use original roster table as the source of truth and call existing trade modal/buttons
   - Do not touch SQL / Supabase / Auto Assign / leave / fiscal year / monthly position logic
*/
(function () {
  'use strict';

  const PATCH_ID = 'v106-desktop-roster-actions-fix';
  const PANEL_ID = 'v106RosterDesktopPanel';
  const STORAGE_KEY = 'cnmi_v106_roster_desktop_mode';
  const ORIGINAL_OPEN_KEY = 'cnmi_v106_roster_original_open';
  const TH_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const TH_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const DUTY_ORDER = ['ชบด1', 'ชบด2', 'ชบด3', 'ช4', 'ช3A', 'ช3B', 'ช9'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const cleanText = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const isMobile = () => window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  const pageRoot = () => $('#pageContent') || document.body;
  const pageTitle = () => cleanText($('#pageTitle')) || '';
  const isRosterPage = () => /ตารางเวรประจำเดือน/.test(pageTitle());
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));

  function injectStyle() {
    if ($('#v106PatchStyle')) return;
    const style = document.createElement('style');
    style.id = 'v106PatchStyle';
    style.textContent = `
      @media (min-width:769px){
        #v104RosterDesktopPanel,#v105RosterDesktopPanel{display:none!important}
        body.v106-roster-active .desktop-schedule-summary{display:none!important}
        body.v106-roster-active .schedule-page-card > .mobile-schedule-tabs{display:none!important}
        .v106-original-hidden{display:none!important}
      }
      .v106-roster-panel{display:none;margin:18px 0 22px;border:1px solid #dce9f5;border-radius:26px;background:#fff;padding:18px;box-shadow:0 10px 30px rgba(22,72,116,.07);position:relative;z-index:50;isolation:isolate}
      @media (min-width:769px){.v106-roster-panel{display:block}}
      .v106-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:12px}
      .v106-title{font-weight:900;color:#1e344a;font-size:18px;line-height:1.25}
      .v106-note{font-size:13px;color:#72849a;margin-top:3px;line-height:1.45}
      .v106-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .v106-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px;position:relative;z-index:80;pointer-events:auto}
      .v106-tab,.v106-mini-btn,.v106-trade-btn{appearance:none;border:1px solid #d9e8f5;background:#fff;color:#2b7fb8;border-radius:14px;padding:10px 16px;font-weight:850;cursor:pointer;font-family:inherit;line-height:1.15;pointer-events:auto;position:relative;z-index:90;transition:.15s ease;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px}
      .v106-tab:hover,.v106-mini-btn:hover,.v106-trade-btn:hover{border-color:#80caff;box-shadow:0 6px 14px rgba(37,141,206,.12)}
      .v106-tab.active{background:#80caff;color:#10344f;border-color:#80caff;box-shadow:0 8px 18px rgba(37,141,206,.18)}
      .v106-hint{color:#6d8096;font-size:14px;margin:4px 0 14px;line-height:1.55}
      .v106-content{position:relative;z-index:55}
      .v106-select-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
      .v106-select-row select{border:1px solid #d9e8f5;border-radius:12px;padding:10px 12px;background:#fff;font-family:inherit;font-weight:850;color:#24435c;min-width:170px}
      .v106-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px;align-items:stretch}
      .v106-weekday{font-weight:900;text-align:center;color:#536377;padding:3px 0 7px}
      .v106-day-cell{min-height:154px;border:1px solid #e0ebf5;border-radius:18px;background:#fbfdff;padding:10px;overflow:hidden;display:flex;flex-direction:column;gap:6px;transition:.15s ease}
      .v106-day-cell.is-weekend{background:#fffaf0}
      .v106-day-cell.is-other-month{opacity:.38;background:#f6f8fb}
      .v106-day-num{font-weight:900;color:#26384c;font-size:15px;margin-bottom:2px;line-height:1}
      .v106-duty-bar{min-height:28px;line-height:1.2;border-radius:10px;padding:6px 9px;font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(0,0,0,.08);box-sizing:border-box;box-shadow:inset 0 -1px rgba(0,0,0,.05);cursor:pointer;text-align:left}
      .v106-duty-bar:hover{filter:brightness(.96);transform:translateY(-1px)}
      .v106-day-more{font-size:12px;color:#6d8096;margin-top:1px;font-weight:800}
      .v106-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
      .v106-card{border:1px solid #e0ebf5;border-radius:18px;padding:13px;background:#fbfdff;min-width:0}
      .v106-card-title{font-weight:900;margin-bottom:8px;color:#1d3348;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      .v106-card-line{color:#52657b;font-weight:750;margin-top:8px;line-height:1.55}
      .v106-duty-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #edf4fb;padding:9px 0;line-height:1.35}
      .v106-duty-row:first-child{border-top:0}
      .v106-chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:6px 11px;margin:3px;font-weight:900;font-size:13px;border:1px solid rgba(0,0,0,.08);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;cursor:pointer}
      .v106-mini-table-wrap{overflow:auto;border:1px solid #e0ebf5;border-radius:18px;background:#fff}
      .v106-mini-table{width:100%;border-collapse:collapse;min-width:760px}
      .v106-mini-table th,.v106-mini-table td{border-bottom:1px solid #e0ebf5;padding:11px 12px;text-align:left;vertical-align:top}
      .v106-mini-table th{background:#f4f8fc;color:#40536a;font-weight:900}
      .v106-empty{border:1px dashed #cbdceb;background:#f8fbff;border-radius:18px;padding:18px;color:#6b7b91;text-align:center;font-weight:800}
      .v106-trade-btn{padding:7px 10px;border-radius:11px;font-size:12px;white-space:nowrap}
      .v106-trade-btn.disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.2)}
      .v106-original-open-note{margin:10px 0 0;color:#6d8096;font-size:13px}
    `;
    document.head.appendChild(style);
  }

  function normalizeDuty(s) {
    const raw = String(s || '').replace(/\s+/g, '').trim();
    if (!raw) return '';
    if (/ชบด1|ชบต1/i.test(raw)) return 'ชบด1';
    if (/ชบด2|ชบต2/i.test(raw)) return 'ชบด2';
    if (/ชบด3|ชบต3/i.test(raw)) return 'ชบด3';
    if (/ช3A/i.test(raw)) return 'ช3A';
    if (/ช3B/i.test(raw)) return 'ช3B';
    if (/ช9/i.test(raw)) return 'ช9';
    if (/ช4/i.test(raw)) return 'ช4';
    return String(s || '').trim();
  }

  function colorToRgb(str) {
    if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
    const m = String(str).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  function textColor(bg) {
    const rgb = colorToRgb(bg);
    if (!rgb) return '#10263a';
    const [r, g, b] = rgb;
    return ((r * 299 + g * 587 + b * 114) / 1000) >= 150 ? '#10263a' : '#fff';
  }
  function getUsefulBg(el) {
    if (!el) return '';
    const nodes = [el, ...$$('*', el).slice(0, 20)];
    for (const n of nodes) {
      const bg = getComputedStyle(n).backgroundColor;
      const rgb = colorToRgb(bg);
      if (!rgb) continue;
      const [r, g, b] = rgb;
      if ((r > 242 && g > 242 && b > 242) || (r < 10 && g < 10 && b < 10)) continue;
      return bg;
    }
    return '';
  }
  function staffNameFromText(raw) {
    let t = String(raw || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/แลก\s*\/\s*ขาย\s*\/\s*ยก|แลก\s*\/\s*ขาย|ยกเวร|ขายเวร|แลกเวร/g, '');
    t = t.replace(/MT_OR_TANG|MT|เคิก|locked|ล้าง|เลือก|ปลดล็อก|ไม่ต้องจัดตำแหน่ง|WEEKEND|HOLIDAY|ยังไม่จัด/g, '');
    t = t.replace(/[-–—•]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const first = t.split(/\s+/)[0];
    if (!first || first.length > 24) return '';
    return first;
  }
  function findRosterTable() {
    const root = pageRoot();
    return $$('table', root).filter(t => !t.closest('#' + PANEL_ID)).find(tbl => {
      const txt = cleanText(tbl);
      return /วันที่/.test(txt) && /ชบด1/.test(txt) && /ชบด2/.test(txt) && /ชบด3/.test(txt);
    }) || null;
  }
  function getOriginalWrapper(table) {
    if (!table) return null;
    return table.closest('.table-wrap') || table.closest('[class*="table"]') || table.parentElement || table;
  }
  function staffColorMap(root = pageRoot()) {
    const map = new Map();
    $$('[class*="summary-chip"], [class*="staff"], [class*="person"], [class*="pill"], [class*="badge"], [class*="chip"], button, span, div', root)
      .filter(el => !el.closest('#' + PANEL_ID) && !el.closest('#v104RosterDesktopPanel') && !el.closest('#v105RosterDesktopPanel'))
      .forEach(el => {
        const name = staffNameFromText(cleanText(el));
        if (!name || /เวร|บาท|ชม|ทั้งหมด|Export|เดือน|ตาราง|สรุป|วันที่|คน|กด/.test(name)) return;
        const bg = getUsefulBg(el);
        if (bg && !map.has(name)) map.set(name, bg);
      });
    return map;
  }
  function getRosterYearMonth() {
    const root = pageRoot();
    const combined = `${pageTitle()} ${cleanText(root).slice(0, 1600)}`;
    for (let i = 0; i < TH_MONTHS.length; i++) {
      const m = combined.match(new RegExp(`${TH_MONTHS[i]}\\s*(25\\d{2}|20\\d{2})`));
      if (m) {
        let y = Number(m[1]);
        if (y > 2400) y -= 543;
        return { year: y, monthIndex: i, monthName: TH_MONTHS[i] };
      }
    }
    const input = $('input[type="month"]', root);
    if (input && /20\d{2}-\d{2}/.test(input.value || '')) {
      const [y, m] = input.value.split('-').map(Number);
      return { year: y, monthIndex: m - 1, monthName: TH_MONTHS[m - 1] };
    }
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth(), monthName: TH_MONTHS[now.getMonth()] };
  }
  function extractCellInfo(cell) {
    const tradeBtn = cell ? $('[data-trade-duty]', cell) : null;
    const assignmentId = tradeBtn ? tradeBtn.getAttribute('data-trade-duty') : '';
    const preferred = $$('[class*="pill"], [class*="badge"], [class*="chip"], span, button', cell || document.createElement('div'))
      .map(n => staffNameFromText(cleanText(n)))
      .filter(Boolean)
      .filter(t => !/แลก|ขาย|ยก|ล้าง|เลือก|ปลด|MT|เคิก|เวร|วัน|เดือน|บาท|ชม/.test(t));
    let staff = preferred[0] || '';
    if (!staff && cell) {
      const clone = cell.cloneNode(true);
      $$('button, select, option, script, style', clone).forEach(n => n.remove());
      staff = staffNameFromText(cleanText(clone));
    }
    return { staff, assignmentId, tradeBtn };
  }
  function parseData() {
    const table = findRosterTable();
    if (!table) return null;
    const colors = staffColorMap();
    const header = $$('thead th, tr:first-child th, tr:first-child td', table).map(th => normalizeDuty(cleanText(th)) || cleanText(th));
    const dutyIndexes = [];
    header.forEach((h, idx) => {
      const duty = normalizeDuty(h);
      if (DUTY_ORDER.includes(duty)) dutyIndexes.push({ idx, duty });
    });
    if (!dutyIndexes.length) return null;

    const bodyRows = $$('tbody tr', table).length ? $$('tbody tr', table) : $$('tr', table).slice(1);
    const days = new Map();
    const entries = [];

    bodyRows.forEach(row => {
      const cells = $$('td, th', row);
      if (!cells.length) return;
      const dateText = cleanText(cells[0]);
      const m = dateText.match(/(\d{1,2})/);
      if (!m) return;
      const day = Number(m[1]);
      if (!day || day > 31) return;
      if (!days.has(day)) days.set(day, { day, dateText, entries: [] });
      dutyIndexes.forEach(({ idx, duty }) => {
        const cell = cells[idx];
        if (!cell) return;
        const info = extractCellInfo(cell);
        if (!info.staff || /WEEKEND|HOLIDAY|ยังไม่จัด|ไม่ต้องจัด|ลา\/ไม่รับเวร/.test(info.staff)) return;
        const color = colors.get(info.staff) || getUsefulBg(cell) || '#dbeafe';
        const item = { day, dateText, duty, staff: info.staff, color, assignmentId: info.assignmentId, cell };
        entries.push(item);
        days.get(day).entries.push(item);
      });
    });
    const ym = getRosterYearMonth();
    return { table, wrapper: getOriginalWrapper(table), days, entries, ...ym };
  }

  function isAdminUser() {
    try { if (typeof window.isAdmin === 'function') return !!window.isAdmin(); } catch (_) {}
    return /admin|หัวหน้าหน่วย|ผู้ดูแล/i.test(cleanText($('#userMini')));
  }
  function currentStaffName() {
    try {
      if (typeof window.currentStaffId === 'function' && typeof window.staffNick === 'function') {
        const id = window.currentStaffId();
        const n = window.staffNick(id);
        if (n && n !== '-') return String(n).trim();
      }
    } catch (_) {}
    const mini = cleanText($('#userMini'));
    return staffNameFromText(mini);
  }
  function canOpenTrade(item) {
    return !!(item && item.assignmentId);
  }
  function openTrade(item) {
    if (!item || !item.assignmentId) {
      showSimpleToast('รายการนี้ยังไม่มีปุ่มแลก/ขายในตารางเดิม หรือผู้ใช้นี้ไม่มีสิทธิ์กดรายการนี้');
      return;
    }
    try {
      if (typeof window.showTradeModal === 'function') {
        window.showTradeModal(item.assignmentId);
        return;
      }
    } catch (_) {}
    const originalBtn = document.querySelector(`[data-trade-duty="${CSS.escape(item.assignmentId)}"]`);
    if (originalBtn) {
      originalBtn.click();
      return;
    }
    showOriginal(true);
  }
  function showSimpleToast(msg) {
    try { if (typeof window.showToast === 'function') return window.showToast(msg); } catch (_) {}
    const toast = $('#toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2600);
    } else alert(msg);
  }

  function chip(item, label, asButton) {
    const el = document.createElement(asButton ? 'button' : 'span');
    el.className = 'v106-chip';
    if (asButton) el.type = 'button';
    const bg = item.color || '#dbeafe';
    el.style.background = bg;
    el.style.color = textColor(bg);
    el.textContent = label || item.staff || '-';
    if (asButton) el.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openTrade(item); });
    return el;
  }
  function tradeButton(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v106-trade-btn' + (canOpenTrade(item) ? '' : ' disabled');
    btn.textContent = 'แลก/ขาย';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openTrade(item);
    });
    return btn;
  }

  function renderCalendar(data) {
    const grid = document.createElement('div');
    grid.className = 'v106-calendar-grid';
    TH_WEEKDAYS.forEach(w => {
      const h = document.createElement('div');
      h.className = 'v106-weekday';
      h.textContent = w;
      grid.appendChild(h);
    });
    const first = new Date(data.year, data.monthIndex, 1);
    const last = new Date(data.year, data.monthIndex + 1, 0).getDate();
    const prevLast = new Date(data.year, data.monthIndex, 0).getDate();
    const offset = first.getDay();
    const total = Math.ceil((offset + last) / 7) * 7;
    for (let i = 0; i < total; i++) {
      let day; let other = false;
      if (i < offset) { day = prevLast - offset + i + 1; other = true; }
      else if (i >= offset + last) { day = i - (offset + last) + 1; other = true; }
      else day = i - offset + 1;
      const cell = document.createElement('div');
      cell.className = 'v106-day-cell';
      if (other) cell.classList.add('is-other-month');
      if (i % 7 === 0 || i % 7 === 6) cell.classList.add('is-weekend');
      const head = document.createElement('div');
      head.className = 'v106-day-num';
      head.textContent = String(day);
      cell.appendChild(head);
      const entries = other ? [] : (data.days.get(day)?.entries || []);
      entries.slice(0, 7).forEach(item => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'v106-duty-bar';
        b.style.background = item.color || '#dbeafe';
        b.style.color = textColor(item.color || '#dbeafe');
        b.title = `${item.duty}: ${item.staff} — กดเพื่อแลก/ขาย`;
        b.textContent = `${item.duty} ${item.staff}`;
        b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openTrade(item); });
        cell.appendChild(b);
      });
      if (entries.length > 7) {
        const more = document.createElement('div');
        more.className = 'v106-day-more';
        more.textContent = `+${entries.length - 7}`;
        cell.appendChild(more);
      }
      grid.appendChild(cell);
    }
    return grid;
  }

  function renderDay(data) {
    const wrap = document.createElement('div');
    const selRow = document.createElement('div');
    selRow.className = 'v106-select-row';
    const label = document.createElement('b');
    label.textContent = 'เลือกวันที่';
    const sel = document.createElement('select');
    const last = new Date(data.year, data.monthIndex + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = `${d} ${data.monthName}`;
      sel.appendChild(opt);
    }
    const today = new Date();
    if (today.getFullYear() === data.year && today.getMonth() === data.monthIndex && today.getDate() <= last) sel.value = String(today.getDate());
    selRow.append(label, sel);
    const result = document.createElement('div');
    result.className = 'v106-grid';
    const paint = () => {
      result.innerHTML = '';
      const entries = data.days.get(Number(sel.value))?.entries || [];
      if (!entries.length) {
        result.innerHTML = '<div class="v106-empty">ไม่มีเวรในวันที่เลือก</div>';
        return;
      }
      entries.forEach(item => {
        const card = document.createElement('div');
        card.className = 'v106-card';
        const title = document.createElement('div');
        title.className = 'v106-card-title';
        title.innerHTML = `<span>${escapeHtml(item.duty)}</span>`;
        title.appendChild(tradeButton(item));
        card.appendChild(title);
        card.appendChild(chip(item, item.staff, true));
        result.appendChild(card);
      });
    };
    sel.addEventListener('change', paint);
    paint();
    wrap.append(selRow, result);
    return wrap;
  }

  function renderPerson(data) {
    const byPerson = new Map();
    data.entries.forEach(item => {
      if (!byPerson.has(item.staff)) byPerson.set(item.staff, { color: item.color, rows: [] });
      byPerson.get(item.staff).rows.push(item);
    });
    let entries = Array.from(byPerson.entries()).sort((a, b) => a[0].localeCompare(b[0], 'th'));
    if (!isAdminUser()) {
      const mine = currentStaffName();
      if (mine) entries = entries.filter(([name]) => name === mine || name.includes(mine) || mine.includes(name));
    }
    const wrap = document.createElement('div');
    wrap.className = 'v106-grid';
    if (!entries.length) {
      wrap.innerHTML = '<div class="v106-empty">ไม่พบเวรของคุณในเดือนนี้</div>';
      return wrap;
    }
    entries.forEach(([staff, obj]) => {
      obj.rows.sort((a, b) => a.day - b.day);
      const card = document.createElement('div');
      card.className = 'v106-card';
      const title = document.createElement('div');
      title.className = 'v106-card-title';
      title.appendChild(chip({ staff, color: obj.color }, staff, false));
      const count = document.createElement('span');
      count.className = 'v106-note';
      count.textContent = `${obj.rows.length} เวร`;
      title.appendChild(count);
      card.appendChild(title);
      obj.rows.forEach(item => {
        const row = document.createElement('div');
        row.className = 'v106-duty-row';
        const left = document.createElement('div');
        left.innerHTML = `<b>${item.day} ${data.monthName}</b><br><span class="muted">${escapeHtml(item.duty)}</span>`;
        row.appendChild(left);
        row.appendChild(tradeButton(item));
        card.appendChild(row);
      });
      wrap.appendChild(card);
    });
    return wrap;
  }

  function renderSummaryCards(data) {
    const byPerson = new Map();
    data.entries.forEach(item => {
      if (!byPerson.has(item.staff)) byPerson.set(item.staff, { color: item.color, total: 0, counts: {}, rows: [] });
      const row = byPerson.get(item.staff);
      row.total += 1;
      row.counts[item.duty] = (row.counts[item.duty] || 0) + 1;
      row.rows.push(item);
    });
    const wrap = document.createElement('div');
    wrap.className = 'v106-grid';
    if (!byPerson.size) {
      wrap.innerHTML = '<div class="v106-empty">ยังไม่มีข้อมูลสำหรับสรุปตามคน</div>';
      return wrap;
    }
    Array.from(byPerson.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([staff, row]) => {
      const card = document.createElement('div');
      card.className = 'v106-card';
      const title = document.createElement('div');
      title.className = 'v106-card-title';
      title.appendChild(chip({ staff, color: row.color }, staff, false));
      const total = document.createElement('b');
      total.textContent = `${row.total} เวร`;
      title.appendChild(total);
      card.appendChild(title);
      const detail = document.createElement('div');
      detail.className = 'v106-card-line';
      detail.textContent = DUTY_ORDER.map(d => row.counts[d] ? `${d} ${row.counts[d]}` : '').filter(Boolean).join(' • ') || '-';
      card.appendChild(detail);
      row.rows.sort((a, b) => a.day - b.day).slice(0, 8).forEach(item => {
        const dutyRow = document.createElement('div');
        dutyRow.className = 'v106-duty-row';
        const left = document.createElement('div');
        left.innerHTML = `<span>${item.day} ${data.monthName}</span><br><b>${escapeHtml(item.duty)}</b>`;
        dutyRow.append(left, tradeButton(item));
        card.appendChild(dutyRow);
      });
      if (row.rows.length > 8) {
        const more = document.createElement('div');
        more.className = 'v106-card-line';
        more.textContent = `ยังมีอีก ${row.rows.length - 8} รายการ กดดูตามคนเพื่อดูครบ`;
        card.appendChild(more);
      }
      wrap.appendChild(card);
    });
    return wrap;
  }

  function modeText(mode) {
    return ({ day: 'ดูตามวัน', person: 'ดูตามคน', summary: 'สรุปตามคน', calendar: 'ตารางทั้งเดือน' })[mode] || 'ตารางทั้งเดือน';
  }
  function hintText(mode) {
    if (mode === 'day') return 'เลือกวันที่ที่ต้องการดู แล้วกด แลก/ขาย จากรายการเวรของวันนั้น';
    if (mode === 'person') return isAdminUser() ? 'Admin เห็นทุกคนและกดแลก/ขายได้จากรายการของแต่ละคน' : 'Staff เห็นเฉพาะเวรของตนเองและกดแลก/ขายจากรายการนี้';
    if (mode === 'summary') return 'ย้ายการ์ดสรุปมาไว้ในมุมมองนี้ พร้อมปุ่มแลก/ขายในรายการของแต่ละคน';
    return 'ตารางทั้งเดือนแบบแถบสี กดที่แถบชื่อเจ้าหน้าที่เพื่อเปิดแลก/ขาย';
  }
  function getMode() {
    return localStorage.getItem(STORAGE_KEY) || 'calendar';
  }
  function setMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
  }
  function showOriginal(open) {
    const data = parseData();
    const wrapper = data?.wrapper;
    if (!wrapper) return;
    const shouldOpen = typeof open === 'boolean' ? open : wrapper.classList.contains('v106-original-hidden') || wrapper.classList.contains('v105-collapsed');
    localStorage.setItem(ORIGINAL_OPEN_KEY, shouldOpen ? '1' : '0');
    wrapper.dataset.v105UserOpened = shouldOpen ? '1' : '';
    wrapper.dataset.v106UserOpened = shouldOpen ? '1' : '';
    wrapper.classList.toggle('v106-original-hidden', !shouldOpen);
    wrapper.classList.toggle('v105-collapsed', !shouldOpen);
    renderPanel(data);
    if (shouldOpen) setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function renderPanel(data) {
    if (!data || !data.entries.length) return;
    document.body.classList.add('v106-roster-active');
    if (data.wrapper) {
      const originalOpen = localStorage.getItem(ORIGINAL_OPEN_KEY) === '1';
      data.wrapper.classList.add('v106-original-wrap');
      data.wrapper.classList.toggle('v106-original-hidden', !originalOpen);
      data.wrapper.classList.toggle('v105-collapsed', !originalOpen);
      data.wrapper.dataset.v105UserOpened = originalOpen ? '1' : '';
    }
    let panel = $('#' + PANEL_ID, pageRoot());
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.className = 'v106-roster-panel';
      const before = data.wrapper || data.table;
      before.parentNode.insertBefore(panel, before);
    }
    const mode = getMode();
    panel.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'v106-top';
    const titleBox = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'v106-title';
    title.textContent = `มุมมองเวรประจำเดือน ${data.monthName} ${data.year + 543}`;
    const note = document.createElement('div');
    note.className = 'v106-note';
    note.textContent = 'แก้เฉพาะฝั่งคอม: เลือกมุมมองได้ และกดแถบชื่อเพื่อแลก/ขาย';
    titleBox.append(title, note);
    const actions = document.createElement('div');
    actions.className = 'v106-actions';
    const originalBtn = document.createElement('button');
    originalBtn.type = 'button';
    originalBtn.className = 'v106-mini-btn';
    const isOpen = data.wrapper && !data.wrapper.classList.contains('v106-original-hidden') && !data.wrapper.classList.contains('v105-collapsed');
    originalBtn.textContent = isOpen ? 'ซ่อนตารางเดิม' : 'แสดงตารางเดิมสำหรับแลก/ขาย';
    originalBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); showOriginal(!isOpen); });
    actions.appendChild(originalBtn);
    top.append(titleBox, actions);

    const tabs = document.createElement('div');
    tabs.className = 'v106-tabs';
    [['day', 'ดูตามวัน'], ['person', 'ดูตามคน'], ['summary', 'สรุปตามคน'], ['calendar', 'ตารางทั้งเดือน']].forEach(([m, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v106-tab' + (mode === m ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setMode(m);
        const fresh = parseData() || data;
        renderPanel(fresh);
      });
      tabs.appendChild(btn);
    });

    const hint = document.createElement('div');
    hint.className = 'v106-hint';
    hint.textContent = hintText(mode);
    const content = document.createElement('div');
    content.className = 'v106-content';
    if (mode === 'day') content.appendChild(renderDay(data));
    else if (mode === 'person') content.appendChild(renderPerson(data));
    else if (mode === 'summary') content.appendChild(renderSummaryCards(data));
    else content.appendChild(renderCalendar(data));

    panel.append(top, tabs, hint, content);
  }

  let scheduled = false;
  function scheduleRun(force) {
    if (isMobile()) return;
    if (scheduled && !force) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try {
        injectStyle();
        if (!isRosterPage()) {
          document.body.classList.remove('v106-roster-active');
          return;
        }
        const data = parseData();
        if (data && data.entries.length) renderPanel(data);
      } catch (err) {
        console.warn(`[${PATCH_ID}] skipped`, err);
      }
    });
  }
  function boot() {
    injectStyle();
    scheduleRun(true);
    setTimeout(() => scheduleRun(true), 500);
    setTimeout(() => scheduleRun(true), 1500);
    window.addEventListener('resize', () => scheduleRun(false), { passive: true });
    window.addEventListener('hashchange', () => scheduleRun(true), { passive: true });
    const target = $('#pageContent') || document.body;
    new MutationObserver(() => scheduleRun(false)).observe(target, { childList: true, subtree: true });
    console.info(`[${PATCH_ID}] loaded`);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
