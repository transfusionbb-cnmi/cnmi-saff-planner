/* CNMI Staff Planner — V321
   Daily position manual dropdowns:
   - Show every active staff member who matches the slot's main role.
   - Do not hide names because of personal position-permission rows.
   - Keep auto-assignment/monthly permission logic unchanged.
   - Include trainees in manual choices; leave records remain visible but disabled.
*/
(function cnmiV321DailyRoleOptions(){
  'use strict';
  const VERSION = 'V321';

  function appState(){
    try { if (typeof state !== 'undefined' && state) return state; } catch (_) {}
    return window.state || {};
  }
  function idOf(value){ return String(value == null ? '' : value); }
  function text(value){ return String(value == null ? '' : value).trim(); }
  function nickname(staff){ return text(staff?.nickname || staff?.nick_name || staff?.display_name || staff?.full_name); }
  function fullLabel(staff){
    const name = nickname(staff) || text(staff?.full_name) || '-';
    const type = text(staff?.staff_type || staff?.role_type || staff?.position_type);
    const trainee = staff?.is_trainee === true || /น้องใหม่|ผู้ฝึก/.test(text(staff?.position_training_status));
    return `${name}${type ? ` (${type})` : ''}${trainee ? ' • น้องใหม่/ผู้ฝึก' : ''}`;
  }
  function isActiveStaff(staff){
    if (!staff?.id) return false;
    if (staff.is_active === false || staff.active === false || staff.enabled === false) return false;
    const status = text(staff.status).toLowerCase();
    if (['inactive','disabled','deleted','resigned'].includes(status)) return false;
    const type = text(staff.staff_type);
    if (/แพทย์|physician|doctor/i.test(type)) return false;
    return true;
  }
  function isTang(staff){ return nickname(staff) === 'แตง'; }
  function isMT(staff){
    const raw = text(staff?.staff_type || staff?.role_type || staff?.position_type);
    return /^mt$/i.test(raw) || /นักเทคนิค|medical\s*technologist/i.test(raw);
  }
  function isClerk(staff){
    const raw = text(staff?.staff_type || staff?.role_type || staff?.position_type);
    return raw === 'เคิก' || /clerk|ธุรการ|เจ้าหน้าที่ธุรการ/i.test(raw);
  }
  function roleMatch(staff, rule){
    if (!isActiveStaff(staff)) return false;
    const source = text(rule);
    if (!source) return true;
    const lower = source.toLowerCase();
    const mentionsMT = /(^|[^a-z])mt([^a-z]|$)/i.test(source) || /นักเทคนิค/.test(source);
    const mentionsClerk = /clerk/i.test(source) || /เคิก|ธุรการ/.test(source);
    const mentionsTang = /แตง/.test(source);

    if (mentionsMT && mentionsClerk) return isMT(staff) || isClerk(staff) || isTang(staff);
    if (mentionsMT) return isMT(staff) || isTang(staff);
    if (mentionsClerk) return isClerk(staff) || isTang(staff);
    if (mentionsTang) return isTang(staff);
    if (/ทุกคน|all|ไม่จำกัด|ทั่วไป/.test(lower)) return true;
    return true;
  }
  function selectedOption(select){
    return Array.from(select.options || []).find(option => option.selected) || null;
  }
  function currentDate(){
    const st = appState();
    return text(document.getElementById('positionDateInput')?.value || st.positionDate || '').slice(0,10);
  }
  function isOnLeave(staffId, date){
    if (!staffId || !date) return false;
    try {
      if (typeof isActiveLeaveOn === 'function') return !!isActiveLeaveOn(staffId, date);
    } catch (_) {}
    try {
      if (typeof window.isActiveLeaveOn === 'function') return !!window.isActiveLeaveOn(staffId, date);
    } catch (_) {}
    return false;
  }
  function compareStaff(a, b){
    try {
      if (typeof compareStaffOrder === 'function') return compareStaffOrder(a, b);
    } catch (_) {}
    try {
      if (typeof window.compareStaffOrder === 'function') return window.compareStaffOrder(a, b);
    } catch (_) {}
    return nickname(a).localeCompare(nickname(b), 'th');
  }
  function optionFor(staff, selectedId, date){
    const option = document.createElement('option');
    option.value = idOf(staff.id);
    const leave = isOnLeave(staff.id, date);
    option.textContent = `${fullLabel(staff)}${leave ? ' ⚠ ลาวันนี้' : ''}`;
    option.selected = idOf(staff.id) === selectedId;
    if (leave && !option.selected) option.disabled = true;
    return option;
  }
  function patchSelect(select, date){
    if (!select || select.dataset.v321RoleOptions === '1') return;
    const st = appState();
    const selected = selectedOption(select);
    const selectedId = idOf(select.value || selected?.value);
    const rule = text(select.dataset.positionRule);
    let list = (Array.isArray(st.staff) ? st.staff : []).filter(person => roleMatch(person, rule));

    const selectedStaff = (Array.isArray(st.staff) ? st.staff : []).find(person => idOf(person.id) === selectedId);
    if (selectedStaff && !list.some(person => idOf(person.id) === selectedId)) list.unshift(selectedStaff);
    list.sort(compareStaff);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'เลือกคน/ว่าง';
    if (!selectedId) placeholder.selected = true;

    select.replaceChildren(placeholder, ...list.map(person => optionFor(person, selectedId, date)));

    if (selectedId && !list.some(person => idOf(person.id) === selectedId)) {
      const preserved = document.createElement('option');
      preserved.value = selectedId;
      preserved.textContent = selected?.textContent || 'ค่าปัจจุบัน';
      preserved.selected = true;
      select.appendChild(preserved);
    }
    select.dataset.v321RoleOptions = '1';
  }
  function patchRoot(root){
    if (!root?.querySelectorAll) return;
    const st = appState();
    if (st.page && st.page !== 'positions') return;
    const date = currentDate();
    root.querySelectorAll('select[data-position-row]').forEach(select => patchSelect(select, date));
  }
  function patchHtml(html){
    if (typeof document === 'undefined') return String(html || '');
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const date = currentDate();
    template.content.querySelectorAll('select[data-position-row]').forEach(select => patchSelect(select, date));
    return template.innerHTML;
  }
  function assignRender(fn){
    window.renderPositionsPage = fn;
    try { renderPositionsPage = fn; } catch (_) {}
  }

  try {
    const previous = window.renderPositionsPage || (typeof renderPositionsPage === 'function' ? renderPositionsPage : null);
    if (previous && !previous.__v321DailyRoleOptions) {
      const wrapped = function renderPositionsPageV321(){
        return patchHtml(previous.apply(this, arguments));
      };
      wrapped.__v321DailyRoleOptions = true;
      wrapped.__v321Previous = previous;
      assignRender(wrapped);
    }
  } catch (error) {
    console.warn(`${VERSION}: render wrapper skipped`, error);
  }

  if (typeof document !== 'undefined') {
    const installObserver = () => {
      const root = document.getElementById('pageContent');
      if (!root || root.dataset.v321Observer === '1') return;
      root.dataset.v321Observer = '1';
      const observer = new MutationObserver(() => patchRoot(root));
      observer.observe(root, { childList:true, subtree:true });
      patchRoot(root);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installObserver, { once:true });
    else installObserver();
  }

  window.cnmiV321 = { roleMatch, isMT, isClerk, isTang, patchRoot };
  console.info(`${VERSION}: daily manual dropdowns now use role-based full staff lists`);
})();
