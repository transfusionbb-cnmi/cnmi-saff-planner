/* CNMI Staff Planner V490 compatibility replacement for V464
 * - Removes the 60-second Admin pending auto-refresh and all focus/visibility auto-refresh.
 * - Admin pending still loads normally when Dashboard is rendered by V460.
 * - Admin can refresh only by pressing the existing ↻ button.
 * - Keeps the useful Users-page Role / daytime-position lifecycle hints from V464.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V490_ADMIN_PENDING_MANUAL_REFRESH_ONLY';
  if(window.__CNMI_V464_ADMIN_PENDING_AUTO_REFRESH_ROLE_HINT__)return;
  window.__CNMI_V464_ADMIN_PENDING_AUTO_REFRESH_ROLE_HINT__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function actualAdmin(){
    try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}
    catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}
  }
  function onDashboard(){return String(S()?.page||'')==='dashboard';}
  function api(){return window.cnmiV460||null;}

  // Exposed for compatibility only. This function is never called automatically.
  async function refreshPending(reason='manual',force=true){
    const a=api();
    if(!actualAdmin()||!onDashboard()||!a?.loadAdminPending)return [];
    if(a.pendingCache?.status==='loading')return [];
    try{return await a.loadAdminPending(!!force);}
    catch(err){console.warn('[V490] pending manual refresh',reason,err);return [];}
  }

  // Clarify account Role vs daytime-position lifecycle in Admin > Users.
  const previousUsers=window.renderUsersPage||(typeof renderUsersPage==='function'?renderUsersPage:null);
  if(typeof previousUsers==='function'){
    const wrapped=function renderUsersPageV490(){
      let html=String(previousUsers.apply(this,arguments)||'');
      try{
        html=html.replace(/(<label>Role\s*<select\s+data-field="role"[\s\S]*?<\/select>)(<\/label>)/i,
          '$1<small class="hint v464-role-hint">เจ้าหน้าที่ทั่วไปให้ใช้ <b>staff</b> เสมอ • Role เป็นสิทธิ์เข้าใช้งาน ไม่ใช่สถานะน้องใหม่/ตัวจริง</small>$2');
        html=html.replace(/(<label>สถานะตำแหน่งรายวัน\s*<select\s+data-field="position_training_status"[\s\S]*?<\/select>)(<\/label>)/i,
          '$1<small class="hint v464-role-hint">ถ้ากำหนด “เริ่มเป็นตัวจริง/จัดตำแหน่งกลางวัน” แล้ว ให้เลือก <b>ใช้งานปกติ</b> ได้เลย ระบบจะเริ่มนับตั้งแต่วันที่กำหนดเอง</small>$2');
      }catch(_){ }
      return html;
    };
    try{window.renderUsersPage=renderUsersPage=wrapped;}catch(_){window.renderUsersPage=wrapped;}
  }

  // Make the pending panel explicitly manual so Admin knows the ↻ button is the refresh control.
  function decoratePendingPanel(){
    if(!actualAdmin()||!onDashboard())return;
    const panel=document.querySelector('[data-v460-admin-pending]');
    if(!panel)return;
    panel.querySelectorAll('[data-v464-auto-note]').forEach(el=>el.remove());
    const p=panel.querySelector('.v460-admin-pending-head p');
    if(p&&!p.querySelector('[data-v490-manual-note]')){
      const note=document.createElement('span');
      note.setAttribute('data-v490-manual-note','');
      note.className='v490-manual-note';
      note.textContent=' • กด ↻ เมื่อต้องการอัปเดต';
      p.appendChild(note);
    }
  }
  const mo=new MutationObserver(()=>decoratePendingPanel());
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  setTimeout(decoratePendingPanel,300);

  const style=document.createElement('style');style.id='cnmi-v490-admin-manual-style';style.textContent=`
    .v464-role-hint{display:block;margin-top:4px;color:#6f8190!important;font-size:9px!important;line-height:1.35!important;font-weight:500!important}.v464-role-hint b{color:#245d80}.v490-manual-note{color:#667f91;font-weight:750}
    @media(max-width:820px){.v464-role-hint{font-size:10px!important;line-height:1.4!important}}
  `;document.head.appendChild(style);

  window.cnmiV464={version:VERSION,refreshPending,mode:'manual-only'};
  window.cnmiV490={version:VERSION,refreshPending,mode:'manual-only'};
  console.info(`${VERSION} loaded`);
})();
