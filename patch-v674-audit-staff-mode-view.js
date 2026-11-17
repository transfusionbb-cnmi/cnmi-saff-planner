/* CNMI v676 — Clear shift-sale audit timeline, discreet Staff view, keeps v674 RLS-backed mode isolation.
 * Requires SUPABASE_Run_Once_v673_Audit_Visibility.sql BEFORE deployment.
 * Never infer owner permissions from nickname, client-side role, or localStorage.
 */
(function () {
  'use strict';
  if (window.__CNMI_V674_AUDIT__) return;
  window.__CNMI_V674_AUDIT__ = true;

  const filters = { actor: '', action: '', mode: 'all', search: '' };
  let acl = { ready: false, is_owner: false, user: '', loading: false, error: '' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const S = () => (typeof state !== 'undefined' ? state : window.state);
  const clean = str => String(str ?? '').trim();
  // The owner's DB identity does not mean they are currently USING Admin mode.
  // Staff view must behave like any other staff account, including details and Excel.
  // Fail closed if the view-mode API is unavailable or inconsistent.
  function canViewAdminAudit() {
    if (!acl.ready || !acl.is_owner) return false;
    try {
      return typeof window.getViewAsModeV167 === 'function'
        && window.getViewAsModeV167() === 'admin'
        && typeof window.isAdmin === 'function'
        && window.isAdmin() === true;
    } catch (_) { return false; }
  }
  const modeOf = a => (a?.cnmi_actor_mode_v673 === 'admin' ? 'admin' : 'staff');
  const actionOf = a => String(a?.action || '').toUpperCase();
  const tableOf = a => String(a?.table_name || '');
  const date = value => { try { return formatThaiDateTime(value); } catch (_) { return clean(value); } };
  const prettyTable = a => { try { return tableLabel(tableOf(a)); } catch (_) { return tableOf(a) || 'ระบบ'; } };
  const labelAction = a => { try { return tradeEventLabel(a) || auditActionLabel(a); } catch (_) { return actionOf(a) || '-'; } };
  const actorName = a => {
    if (!a?.actor_id) return 'ระบบอัตโนมัติ';
    const person = (S()?.staff || []).find(x => String(x?.id) === String(a.actor_id));
    if (!person) return 'เจ้าหน้าที่ (ไม่พบข้อมูลบัญชี)';
    const nick = clean(person.nickname || person.full_name || 'เจ้าหน้าที่');
    const full = clean(person.full_name || '');
    return full && full !== nick ? nick + ' (' + full + ')' : nick;
  };
  const names = { staff_id:'เจ้าหน้าที่', requester_id:'ผู้ขายเวร', receiver_id:'ผู้รับเวร', created_by:'ผู้บันทึกคำขอ', confirmed_at:'เวลายืนยัน', updated_by:'ผู้แก้ไข', duty_date:'วันที่เวร', duty_code:'ประเภทเวร', work_date:'วันที่', start_date:'วันเริ่ม', end_date:'วันสิ้นสุด', start_time:'เวลาเริ่ม', end_time:'เวลาสิ้นสุด', title:'หัวข้อ', nickname:'ชื่อเล่น', full_name:'ชื่อจริง', status:'สถานะ', type:'ประเภท', note:'หมายเหตุ', reason:'เหตุผล', role:'สิทธิ์', position_code:'ตำแหน่ง', is_eligible:'มีสิทธิ์', is_active:'เปิดใช้งาน', staff_type:'ประเภทเจ้าหน้าที่', holiday_date:'วันหยุด', attendance_status:'สถานะการเข้าเวร', trade_type:'ประเภทการขายเวร', amount_to:'จำนวนเงิน', approval_status:'สถานะอนุมัติ' };
  // Never display arbitrary row columns / credentials from old_data and new_data.
  const allowedFields = Object.keys(names);
  const fmt = (key,val) => {
    if (val === undefined || val === null || val === '') return '—';
    if (typeof val === 'boolean') return val ? 'ใช่' : 'ไม่ใช่';
    if (key === 'confirmed_at') return date(val);
    if (key === 'status' && ['pending','confirmed','rejected','completed','cancelled'].includes(String(val))) return tradeStatus(val);
    if (key === 'staff_id' || key === 'requester_id' || key === 'receiver_id' || key === 'updated_by' || key === 'created_by') {
      try { const name = staffNick(val); if (name && name !== '-') return name; } catch (_) {}
      return 'เจ้าหน้าที่';
    }
    if (typeof val === 'object') return '[ข้อมูลหลายรายการ]';
    return String(val).slice(0,160);
  };
  function differences(a) {
    const old = a?.old_data && typeof a.old_data === 'object' ? a.old_data : {};
    const next = a?.new_data && typeof a.new_data === 'object' ? a.new_data : {};
    return allowedFields.filter(key => {
      if (!Object.prototype.hasOwnProperty.call(old,key) && !Object.prototype.hasOwnProperty.call(next,key)) return false;
      const before = old[key], after = next[key];
      if (before === undefined || after === undefined) return false;
      return JSON.stringify(before) !== JSON.stringify(after);
    }).slice(0,7).map(key => ({ field: names[key], before: fmt(key,old[key]), after: fmt(key,next[key]) }));
  }

  // Trade requests have several separate events. Distinguish request, acceptance and
  // final booking by the actual audit row created at each transition (not by
  // today's status, and never infer a confirmation actor from the seller field).
  const isTrade = a => tableOf(a) === 'roster_trade_requests';
  const tradeStatus = v => ({ pending:'รอผู้รับเวรยืนยัน', confirmed:'ยืนยันรับเวรแล้ว', rejected:'ปฏิเสธคำขอ', completed:'บันทึกเวรแล้ว', cancelled:'ยกเลิกคำขอ' })[String(v||'').toLowerCase()] || clean(v) || '—';
  function tradeEventKey(a) {
    if (!isTrade(a)) return actionOf(a);
    const operation = actionOf(a);
    const old = a?.old_data || {}, next = a?.new_data || {};
    if (operation === 'INSERT') return 'TRADE_REQUEST';
    if (operation === 'DELETE') return 'TRADE_DELETE';
    if (operation !== 'UPDATE') return operation;
    if (old.status !== next.status && next.status === 'confirmed') return 'TRADE_CONFIRM';
    if (old.status !== next.status && next.status === 'rejected') return 'TRADE_REJECT';
    if (old.status !== next.status && next.status === 'completed') return 'TRADE_COMPLETE';
    return 'TRADE_EDIT';
  }
  const tradeEventLabel = a => ({
    TRADE_REQUEST:'ส่งคำขอขายเวร',
    TRADE_CONFIRM: String(a?.actor_id || '') === String(a?.new_data?.receiver_id || '') ? 'ผู้รับเวรกดยืนยัน' : 'ยืนยันคำขอขายเวร',
    TRADE_REJECT:'ปฏิเสธคำขอขายเวร',
    TRADE_COMPLETE:'บันทึกขายเวรสำเร็จ',
    TRADE_EDIT:'แก้ไขคำขอขายเวร',
    TRADE_DELETE:'ลบคำขอขายเวร'
  })[tradeEventKey(a)] || '';
  function tradeSummary(a) {
    const n=a?.new_data || {}, o=a?.old_data || {};
    const seller=n.requester_id || o.requester_id;
    const receiver=n.receiver_id || o.receiver_id;
    const fromId=n.from_assignment_id || o.from_assignment_id;
    const duty=(S()?.rosterAssignments || []).find(x=>String(x?.id)===String(fromId));
    let dutyText='';
    if (duty?.duty_date) {
      let dateLabel=clean(duty.duty_date);
      try { dateLabel=formatThaiDate(duty.duty_date); } catch (_) {}
      let code=clean(duty.duty_code);
      try { code=DUTY_LABEL[code] || code; } catch (_) {}
      dutyText=` · เวร ${dateLabel}${code ? ' ('+code+')' : ''}`;
    }
    const action=tradeEventLabel(a);
    const fromName=fmt('requester_id',seller),toName=fmt('receiver_id',receiver);
    const change=(tradeEventKey(a)==='TRADE_CONFIRM' || tradeEventKey(a)==='TRADE_REJECT' || tradeEventKey(a)==='TRADE_COMPLETE')
      ? ` · ${tradeStatus(n.status || o.status)}` : '';
    return `${action}: ${fromName} → ${toName}${dutyText}${change}`;
  }

  function summary(a) {
    const operation = actionOf(a);
    const next = a?.new_data || {}, old = a?.old_data || {};
    if (isTrade(a)) return tradeSummary(a);
    if (tableOf(a) === 'auth') return labelAction(a) + ' ' + (next?.at ? date(next.at) : '');
    const identity = tableOf(a) === 'leave_requests' ? ' ('+fmt('staff_id',next.staff_id || old.staff_id)+')' : '';
    try {
      let text = clean(auditSummary(a));
      if (text && text !== prettyTable(a)) return text + identity;
    } catch (_) {}
    if (operation === 'INSERT') return 'เพิ่มรายการใหม่ใน ' + prettyTable(a) + identity;
    if (operation === 'DELETE') return 'ลบรายการใน ' + prettyTable(a) + identity;
    if (operation === 'UPDATE') return 'แก้ไขรายการใน ' + prettyTable(a) + identity;
    return labelAction(a) + ' — ' + prettyTable(a);
  }
  function rowsVisible() {
    if (!acl.ready) return [];
    let rows = Array.isArray(S()?.auditLogs) ? S().auditLogs : [];
    // Defense in depth: never present private/admin rows in Staff view, even
    // if a previously loaded owner session has both kinds cached in memory.
    const adminView = canViewAdminAudit();
    rows = rows.filter(a => (a?.cnmi_visibility_v673 === 'public' && modeOf(a) === 'staff')
      || (adminView && a?.cnmi_visibility_v673 === 'private'));
    const day = S()?.auditDate;
    if (day) rows = rows.filter(a => {
      try { return toDateInput(new Date(a.created_at)) === day; } catch (_) { return String(a.created_at||'').slice(0,10) === day; }
    });
    return rows;
  }
  function rowsFiltered() {
    return rowsVisible().filter(a => {
      if (filters.actor && String(a.actor_id || '') !== filters.actor) return false;
      if (filters.action && tradeEventKey(a) !== filters.action) return false;
      const visibleMode = canViewAdminAudit() ? filters.mode : 'staff';
      if (visibleMode !== 'all' && modeOf(a) !== visibleMode) return false;
      if (filters.search) {
        const haystack = [actorName(a),prettyTable(a),labelAction(a),summary(a), ...differences(a).map(d=>d.field+' '+d.before+' '+d.after)].join(' ').toLocaleLowerCase();
        if (!haystack.includes(filters.search.toLocaleLowerCase())) return false;
      }
      return true;
    });
  }
  async function loadAcl() {
    const st = S();
    const uid = clean(st?.session?.user?.id || '');
    if (!uid) return;
    if (acl.loading || (acl.user === uid && (acl.ready || acl.error))) return;
    acl = { ready:false,is_owner:false,user:uid,loading:true,error:'' };
    try {
      const client = typeof sb !== 'undefined' ? sb : window.sb;
      const result = await client?.rpc?.('cnmi_audit_access_v673');
      if (result?.error) throw result.error;
      if (result?.data?.ready !== true) throw new Error('ไม่สามารถยืนยันสิทธิ์ Audit Log จากฐานข้อมูล');
      // Require the new DB audit column, even if the RPC exists.
      const check = await client.from('audit_logs').select('id,cnmi_visibility_v673,cnmi_actor_mode_v673').limit(1);
      if (check?.error) throw check.error;
      acl = { ready:true,is_owner:result.data.is_owner === true,user:uid,loading:false,error:'' };
    } catch (err) {
      acl = { ready:false,is_owner:false,user:uid,loading:false,error:clean(err?.message || err) };
    }
    if (S()?.page === 'audit') {
      try { renderPage(); } catch (_) {}
    }
  }
  function checkAcl() {
    const uid = clean(S()?.session?.user?.id || '');
    if (uid && acl.user !== uid) acl = { ready:false,is_owner:false,user:'',loading:false,error:'' };
    if (uid && !acl.ready && !acl.loading && !acl.error) Promise.resolve().then(loadAcl);
    return acl.ready;
  }
  function modeTag(a) {
    if (!canViewAdminAudit()) return '';
    return modeOf(a) === 'admin' ? '<span class="v673-tag private">Admin · ส่วนตัว</span>' : '<span class="v673-tag staff">Staff</span>';
  }
  function diffHtml(a, compact) {
    const diff = differences(a);
    if (!diff.length) return `<span class="v673-muted">${esc(summary(a))}</span>`;
    const take = compact ? diff.slice(0,2) : diff;
    return `<div class="v673-diffs">${take.map(d => `<div><b>${esc(d.field)}:</b> <span class="v673-old">${esc(d.before)}</span> <span class="v673-arrow">→</span> <strong>${esc(d.after)}</strong></div>`).join('')}${compact && diff.length > 2 ? `<small class="v673-muted">และอีก ${diff.length-2} รายการ</small>` : ''}</div>`;
  }
  function rowHtml(a) {
    return `<tr><td><div class="v673-date">${esc(date(a.created_at))}</div></td>
      <td><strong class="v673-actor">${esc(actorName(a))}</strong>${canViewAdminAudit()?`<div>${modeTag(a)}</div>`:''}</td>
      <td><b>${esc(labelAction(a))}</b><div class="v673-muted">${esc(prettyTable(a))}</div></td>
      <td><div>${esc(summary(a))}</div>${diffHtml(a,true)}<button type="button" class="tiny-btn" data-audit-detail="${esc(a.id)}">รายละเอียด</button></td></tr>`;
  }
  function cardHtml(a) { return `<article class="v673-entry"><div class="v673-entry-head"><strong>${esc(actorName(a))}</strong>${modeTag(a)}</div>
    <div class="v673-muted">${esc(date(a.created_at))}</div>
    <div><b>${esc(labelAction(a))}</b> · ${esc(prettyTable(a))}</div>
    <div>${esc(summary(a))}</div>${diffHtml(a,true)}<button type="button" class="tiny-btn" data-audit-detail="${esc(a.id)}">รายละเอียด</button></article>`; }
  function renderNewAuditPage() {
    const ready = checkAcl();
    if (!ready) {
      return `<section class="card v673-audit-page"><h3>ประวัติการใช้งาน (Audit Log)</h3><div class="notice">${acl.error ? 'ยังไม่สามารถยืนยันสิทธิ์ได้ จึงไม่แสดงข้อมูล Audit Log เพื่อความปลอดภัย กรุณาติดตั้ง SQL ของ v673 ใน Supabase ก่อนเปิดใช้งาน' : 'กำลังตรวจสอบสิทธิ์การเข้าถึงข้อมูล Audit Log…'}</div>${acl.error ? `<p class="hint">${esc(acl.error)}</p><button type="button" class="ghost-btn" data-v673-retry>ลองตรวจสอบใหม่</button>` : ''}</section>`;
    }
    const adminView = canViewAdminAudit();
    // Don't carry an old Admin-only filter into Staff view (empty list bug).
    if (!adminView) filters.mode = 'all';
    const source = rowsVisible(), rows = rowsFiltered();
    const actors = [...new Map(source.filter(a=>a.actor_id).map(a=>[String(a.actor_id),actorName(a)])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'th'));
    const opts = (value,label,selected) => `<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(label)}</option>`;
    return `<div class="card v673-audit-page">
      <div class="section-title"><div><h3>ประวัติการใช้งาน · ใครทำอะไร</h3><p class="hint">แสดงผู้ทำ เวลา รายการที่เปลี่ยน และข้อมูลก่อน–หลังแบบอ่านง่าย</p></div><button type="button" class="ghost-btn" data-export-audit-excel>Export Excel</button></div>
      <div class="toolbar audit-toolbar v673-audit-toolbar">
        <label>วันที่ <input type="date" id="auditDateInput" value="${esc(S()?.auditDate || '')}"></label>
        <button type="button" class="soft-btn" data-audit-today>วันนี้</button><button type="button" class="ghost-btn" data-audit-all>แสดงทั้งหมด</button>
      </div>
      <div class="v673-filters">
        <label>ผู้ทำ<select data-v673-filter="actor">${opts('','ทุกคน',filters.actor)}${actors.map(([id,name])=>opts(id,name,filters.actor)).join('')}</select></label>
        <label>เหตุการณ์<select data-v673-filter="action">${opts('','ทุกเหตุการณ์',filters.action)}${[['LOGIN','เข้าสู่ระบบ'],['LOGOUT','ออกจากระบบ'],['TRADE_REQUEST','ส่งคำขอขายเวร'],['TRADE_CONFIRM','ยืนยันรับเวร'],['TRADE_REJECT','ปฏิเสธขายเวร'],['TRADE_COMPLETE','บันทึกขายเวร'],['TRADE_EDIT','แก้ไขคำขอขายเวร'],['TRADE_DELETE','ลบคำขอขายเวร'],['INSERT','เพิ่มข้อมูลอื่น'],['UPDATE','แก้ไขข้อมูลอื่น'],['DELETE','ลบข้อมูลอื่น']].map(v=>opts(v[0],v[1],filters.action)).join('')}</select></label>
        ${adminView ? `<label>โหมด<select data-v673-filter="mode">${opts('all','ทุกโหมด',filters.mode)}${opts('staff','Staff',filters.mode)}${opts('admin','Admin (ส่วนตัว)',filters.mode)}</select></label>` : ''}
        <label>ค้นหา<input type="search" data-v673-filter="search" value="${esc(filters.search)}" placeholder="ค้นหาชื่อ เมนู หรือสิ่งที่แก้"></label>
      </div>
      <div class="v673-results"><b>${rows.length}</b> รายการ${source.length > 250 ? ' · หน้าจออาจแสดงข้อมูลล่าสุดเพียงบางส่วน' : ''}</div>
      ${rows.length ? `<div class="v673-audit-table table-wrap"><table><thead><tr><th>วันเวลา</th><th>ใครเป็นผู้ทำ</th><th>ทำอะไร / เมนู</th><th>รายละเอียดสิ่งที่เปลี่ยน</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div><div class="v673-audit-cards">${rows.map(cardHtml).join('')}</div>` : '<div class="empty-state">ไม่มีประวัติตรงกับตัวกรองที่เลือก</div>'}
    </div>`;
  }
  function showNewDetail(id) {
    const a = rowsVisible().find(x => String(x.id) === String(id));
    if (!a || !acl.ready) return;
    const diff = differences(a);
    const body = `<h2>ประวัติการทำรายการ</h2>
      <div class="v673-detail-fields"><div><b>ผู้ทำ</b><p>${esc(actorName(a))}</p></div><div><b>วันเวลา</b><p>${esc(date(a.created_at))}</p></div>${canViewAdminAudit() ? `<div><b>โหมด</b><p>${modeTag(a)}</p></div>` : ''}<div><b>เหตุการณ์</b><p>${esc(labelAction(a))}</p></div><div><b>เมนู</b><p>${esc(prettyTable(a))}</p></div></div>
      <h3>ทำอะไรไปบ้าง</h3><p>${esc(summary(a))}</p>${diff.length ? `<h3>ข้อมูลที่เปลี่ยน</h3>${diffHtml(a,false)}` : '<p class="hint">รายการนี้ไม่มีค่าก่อน–หลังในช่องข้อมูลที่เปิดให้แสดง</p>'}
      ${canViewAdminAudit() && modeOf(a)==='admin' ? '<p class="hint">รายการ Admin นี้มองเห็นได้เฉพาะเจ้าของ Audit Log ใน Admin mode</p>' : ''}`;
    try { showModal(body,{ large:false }); } catch (_) {}
  }
  function exportNewExcel() {
    if (!acl.ready) return;
    const data = rowsFiltered().map(a => ({ 'วันเวลา':date(a.created_at),'ผู้ทำ':actorName(a),...(canViewAdminAudit()?{'โหมด':modeOf(a)==='admin'?'Admin (ส่วนตัว)':'Staff'}:{}),'การกระทำ':labelAction(a),'เมนู':prettyTable(a),'รายละเอียด':summary(a),'ค่าที่เปลี่ยน':differences(a).map(d=>`${d.field}: ${d.before} → ${d.after}`).join(' | ') }));
    if (!window.XLSX) return;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(data.length?data:[{'รายการ':'ไม่มีข้อมูล'}]),'Audit');
    XLSX.writeFile(book,`Audit_v676_${(typeof todayStr==='function' ? todayStr() : 'export')}.xlsx`);
  }

  try { window.renderAuditPage = renderAuditPage = renderNewAuditPage; } catch (_) { window.renderAuditPage = renderNewAuditPage; }
  try { window.showAuditDetail = showAuditDetail = showNewDetail; } catch (_) { window.showAuditDetail = showNewDetail; }
  try { window.exportAuditExcel = exportAuditExcel = exportNewExcel; } catch (_) { window.exportAuditExcel = exportNewExcel; }
  try { window.getFilteredAuditLogs = getFilteredAuditLogs = rowsFiltered; } catch (_) { window.getFilteredAuditLogs = rowsFiltered; }
  document.addEventListener('change',e => {
    const input = e.target?.closest?.('[data-v673-filter]');
    if (!input) return;
    const k=input.dataset.v673Filter;
    if (Object.prototype.hasOwnProperty.call(filters,k)) filters[k]=String(input.value||'');
    try { renderPage(); } catch (_) {}
  });
  document.addEventListener('input',e => {
    const input = e.target?.closest?.('[data-v673-filter="search"]');
    if (!input) return;
    filters.search=String(input.value||'');
    // Do not rebuild the whole app on each keypress (input focus and performance).
    const panel = input.closest('.v673-audit-page');
    const rows = rowsFiltered();
    const desktop = panel?.querySelector('.v673-audit-table tbody');
    const mobile = panel?.querySelector('.v673-audit-cards');
    if (desktop) desktop.innerHTML = rows.map(rowHtml).join('');
    if (mobile) mobile.innerHTML = rows.map(cardHtml).join('');
    const count=panel?.querySelector('.v673-results b'); if(count)count.textContent=rows.length;
  });
  document.addEventListener('click',e => {
    const retry=e.target?.closest?.('[data-v673-retry]');
    if (!retry) return;
    e.preventDefault(); e.stopPropagation();
    acl = {ready:false,is_owner:false,user:'',loading:false,error:''};
    try { renderPage(); } catch (_) {}
  },true);

  const style = document.createElement('style');
  style.id='cnmi-v673-audit-css';
  style.textContent = `
    .v673-audit-page{max-width:100%;overflow:hidden}
    .v673-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.v673-filters label{font-weight:600;font-size:.87rem;color:#35566d}.v673-filters select,.v673-filters input{display:block;width:100%;box-sizing:border-box;margin-top:5px;height:43px;border:1px solid #d5e2e8;border-radius:10px;padding:7px 10px;background:#fff;color:#18364e}
    .v673-results{font-size:.9rem;color:#5a7287;margin:10px 0}.v673-audit-table table{width:100%;table-layout:auto}.v673-audit-table th{white-space:nowrap}.v673-audit-table td{vertical-align:top;padding:12px 10px;line-height:1.6;min-width:100px}.v673-audit-table td:last-child{min-width:280px}.v673-date{white-space:nowrap;font-size:.88rem}.v673-actor{display:block;max-width:230px;overflow-wrap:anywhere}.v673-muted{color:#698093;font-size:.86rem}.v673-tag{display:inline-flex;font-size:.73rem;line-height:1.4;margin-top:5px;padding:3px 7px;border-radius:7px;white-space:nowrap}.v673-tag.staff{color:#15604e;background:#e2f7ee}.v673-tag.private{color:#934455;background:#fce9ef}
    .v673-diffs{margin:6px 0;display:grid;gap:3px;font-size:.86rem;line-height:1.55}.v673-diffs>div{overflow-wrap:anywhere}.v673-old{color:#8b5960;text-decoration:line-through;text-decoration-thickness:1px}.v673-arrow{color:#677e94;margin:0 4px}.v673-diffs strong{color:#16644c}.v673-audit-cards{display:none}.v673-detail-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 12px}.v673-detail-fields p{margin:2px 0 10px;overflow-wrap:anywhere}
    @media(max-width:1000px){.v673-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:820px){.v673-audit-table{display:none}.v673-audit-cards{display:grid;gap:10px}.v673-entry{border:1px solid #d8e8f2;border-radius:13px;padding:13px;display:grid;gap:7px;background:#fff}.v673-entry-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap}.v673-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.v673-audit-toolbar{display:flex;flex-wrap:wrap}.v673-detail-fields{grid-template-columns:1fr 1fr}}@media(max-width:480px){.v673-filters{grid-template-columns:1fr 1fr}.v673-filters label:last-child{grid-column:1/-1}}`;
  document.head.appendChild(style);
})();
