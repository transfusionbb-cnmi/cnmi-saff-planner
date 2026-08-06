/* CNMI Staff Planner V397
 * ปรับความชัดเจนของกิจกรรม/ภาพรวม/Calendar และแก้ Active staff_profiles
 */
(function () {
  'use strict';
  if (window.__CNMI_V397_ACTIVITY_DASHBOARD__) return;
  window.__CNMI_V397_ACTIVITY_DASHBOARD__ = true;

  const S = () => window.state || state;
  const esc = v => typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = v => String(v || '').slice(0, 10);
  const person = id => typeof staffNick === 'function' ? staffNick(id) : '-';

  function periodLabel(row) {
    const raw = String(row?.leave_period || row?.period || 'เต็มวัน').trim();
    if (!raw || raw === 'เต็มวัน' || raw === 'ทั้งวัน') return 'เต็มวัน';
    if (/เช้า|morning/i.test(raw)) return 'ครึ่งเช้า';
    if (/บ่าย|afternoon/i.test(raw)) return 'ครึ่งบ่าย';
    return raw;
  }
  function periodHtml(row) {
    return `<span class="v397-period">${esc(periodLabel(row))}</span>`;
  }
  // บังคับให้ช่องปฏิทิน/ตารางที่ใช้ leaveCellBadge แสดงช่วงลาเสมอ
  window.leaveCellBadge = function (row) {
    if (!row) return '';
    const type = typeof leaveDisplayType === 'function' ? leaveDisplayType(row) : (row.type || 'ลา');
    return `<span class="mini-status ${leaveCellClass(type)}">${esc(type)}<small class="v397-halfday-cell">${esc(periodLabel(row))}</small></span>`;
  };
  try { (0, eval)('leaveCellBadge=window.leaveCellBadge'); } catch (_) {}
  function timeText(a) {
    const s = String(a?.start_time || '').slice(0, 5);
    const e = String(a?.end_time || '').slice(0, 5);
    return s && e ? `${s}–${e} น.` : (s ? `${s} น.` : 'ไม่ระบุเวลา');
  }
  function activityHtml(a) {
    const names = (Array.isArray(a?.participant_ids) ? a.participant_ids : []).map(person).filter(x => x && x !== '-');
    return `<div class="v397-activity-item"><div><b>${esc(a?.title || '-')}</b> ${badge(a?.event_type || 'อื่นๆ', typeof activityClass === 'function' ? activityClass(a?.event_type) : 'blue')}</div><div class="v397-detail-line">เวลา: ${esc(timeText(a))} · สถานที่: ${esc(a?.location || 'ไม่ระบุ')}</div>${names.length ? `<div class="v397-detail-line">ผู้เข้าร่วม: ${esc(names.join(', '))}</div>` : ''}${a?.note ? `<div class="v397-detail-note">หมายเหตุ: ${esc(a.note)}</div>` : ''}</div>`;
  }

  // ลดความแน่นของหน้ากิจกรรมด้านขวา โดยยังคงข้อมูล/ปุ่มเดิมไว้ครบ
  const oldActivities = window.renderActivitiesPage || renderActivitiesPage;
  window.renderActivitiesPage = function () {
    let html = oldActivities.apply(this, arguments);
    html = html.replace('<div class="grid grid-2">', '<div class="grid v397-activities-layout">');
    html = html.replace('<div class="card"><div class="section-title"><h3>กิจกรรมทั้งหมด</h3></div>', '<div class="card v397-all-activities"><div class="section-title"><div><h3>กิจกรรมทั้งหมด</h3><p class="hint">เลื่อนดูรายการที่ต้องการแก้ไขหรือลบ</p></div></div>');
    html = html.replace('นำเข้าแบบฟอร์ม FM-CNHR-002 <small>ติ๊กเมื่อ ต้องการเก็บกิจกรรมนี้เป็นประวัติการอบรมของผู้เข้าร่วม</small>', 'เก็บเป็นประวัติอบรม FM-CNHR-002 <small>เลือกเฉพาะกิจกรรมที่ต้องการบันทึกเข้าประวัติอบรม</small>');
    return html;
  };
  try { (0, eval)('renderActivitiesPage=window.renderActivitiesPage'); } catch (_) {}

  const oldDashboard = window.renderDashboard || renderDashboard;
  window.renderDashboard = function () {
    const d = todayStr();
    const leaves = (S().leaves || []).filter(x => typeof isLeaveEffective === 'function' && isLeaveEffective(x) && overlapsDate(x, d) && x.type !== 'ไม่รับเวร');
    const noDuty = (S().leaves || []).filter(x => typeof isLeaveEffective === 'function' && isLeaveEffective(x) && overlapsDate(x, d) && x.type === 'ไม่รับเวร');
    const acts = (S().activities || []).filter(x => dateInRange(d, x.start_date, x.end_date));
    const duties = sortDashboardDuties((S().rosterAssignments || []).filter(x => x.duty_date === d), d);
    const leaveItems = [...leaves, ...noDuty];
    return `<div class="grid grid-3 v401-dashboard-stats">${statCard('คนลาวันนี้', leaves.length)}${statCard('กิจกรรมวันนี้', acts.length)}${statCard('เจ้าหน้าที่ทั้งหมด', (S().staff || []).filter(x => x.is_active).length)}</div>
      <div class="grid grid-2 v401-dashboard-details">
        <div class="card"><div class="section-title"><h3>เวรวันนี้</h3><span>${formatThaiDate(d)}</span></div>${duties.length ? `<div class="table-wrap"><table><thead><tr><th>เวร</th><th>ผู้รับผิดชอบ</th></tr></thead><tbody>${duties.map(r => `<tr><td>${esc(DUTY_LABEL[r.duty_code] || r.duty_code)}</td><td>${staffPill(r.staff_id)}</td></tr>`).join('')}</tbody></table></div>` : empty('ยังไม่มีตารางเวรวันนี้')}</div>
        <div class="card"><div class="section-title"><h3>ลา / ไม่รับเวรวันนี้</h3><span class="hint">แสดงช่วงลาและเหตุผล</span></div>${leaveItems.length ? `<div class="v397-today-list">${leaveItems.map(x => `<div class="v397-today-item"><div><b>${esc(person(x.staff_id))}</b> ${badge(x.type === 'ไม่รับเวร' ? 'ไม่รับเวร' : leaveDisplayType(x), leaveBadgeClass(leaveDisplayType(x)))}</div><div class="v397-detail-line">ช่วงเวลา: ${periodHtml(x)} · วันที่: ${esc(formatThaiDate(x.start_date))}${key(x.end_date) !== key(x.start_date) ? `–${esc(formatThaiDate(x.end_date))}` : ''}</div>${leaveReasonText(x) ? `<div class="v397-detail-note">เหตุผล: ${esc(leaveReasonText(x))}</div>` : ''}</div>`).join('')}</div>` : empty('วันนี้ไม่มีรายการลา/ไม่รับเวร')}</div>
        <div class="card v401-dashboard-activity-card"><div class="section-title"><h3>กิจกรรมวันนี้</h3><span class="hint">เวลา สถานที่ ผู้เข้าร่วม และหมายเหตุ</span></div>${acts.length ? `<div class="v397-today-list">${acts.map(activityHtml).join('')}</div>` : empty('วันนี้ไม่มีกิจกรรม')}</div>
      </div>`;
  };
  try { (0, eval)('renderDashboard=window.renderDashboard'); } catch (_) {}

  const oldCalendarDetail = window.calendarEventDetail || calendarEventDetail;
  window.calendarEventDetail = function (e) {
    let extra = '';
    if (e?.raw && ['activity','training','meeting','outing','standard','code'].includes(e.type)) {
      extra += `<br><span class="muted">เวลา: ${esc(timeText(e.raw))} · สถานที่: ${esc(e.raw.location || 'ไม่ระบุ')}</span>`;
    }
    if (e?.raw && !['activity','training','meeting','outing','standard','code','duty','holiday'].includes(e.type)) {
      extra += `<br><span class="muted">ช่วงเวลา: ${periodHtml(e.raw)}</span>`;
    }
    const base = oldCalendarDetail.apply(this, arguments);
    return extra + base;
  };
  try { (0, eval)('calendarEventDetail=window.calendarEventDetail'); } catch (_) {}

  const oldCollect = window.collectCalendarEvents || collectCalendarEvents;
  window.collectCalendarEvents = function () {
    const rows = oldCollect.apply(this, arguments);
    return rows.map(e => {
      if (e?.raw && !['activity','training','meeting','outing','standard','code','duty','holiday'].includes(e.type)) {
        const p = periodLabel(e.raw);
        e.title = `${e.title} (${p})`;
      }
      return e;
    });
  };
  try { (0, eval)('collectCalendarEvents=window.collectCalendarEvents'); } catch (_) {}

  const style = document.createElement('style');
  style.textContent = `.v397-activities-layout{grid-template-columns:minmax(520px,1.15fr) minmax(360px,.85fr)}.v397-all-activities .table-wrap{max-height:760px;overflow:auto}.v397-all-activities table{font-size:13px}.v397-all-activities th,.v397-all-activities td{padding:9px 8px}.v397-period{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef4ff;color:#1d5e9c;font-weight:700;font-size:12px}.v397-halfday-cell{display:block;font-size:10px;font-weight:700;color:#1d5e9c;margin-top:2px}.v397-today-list{display:grid;gap:9px}.v397-today-item,.v397-activity-item{padding:11px 13px;border:1px solid #dce7f0;border-radius:12px;background:#fbfdff}.v397-detail-line{margin-top:4px;color:#587087;font-size:13px;line-height:1.45}.v397-detail-note{margin-top:4px;color:#43566a;font-size:13px;white-space:pre-wrap}.v397-today-item .badge{margin-left:5px}.v401-dashboard-activity-card{grid-column:1/-1}.v401-dashboard-stats{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:14px}@media(max-width:900px){.v397-activities-layout{grid-template-columns:1fr}.v397-all-activities .table-wrap{max-height:520px}}@media(max-width:820px){.v401-dashboard-stats{grid-template-columns:1fr}.v401-dashboard-activity-card{grid-column:auto}}`;
  document.head.appendChild(style);
})();
