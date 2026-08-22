/* CNMI Staff Planner V464
 * 1) Admin pending center auto-refreshes on Dashboard (every 60s while visible),
 *    and refreshes when the app returns to foreground / Dashboard is opened.
 * 2) Users page clarifies that Role=staff is independent from trainee/regular status,
 *    and daily_position_start_date is the effective date for becoming regular.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V464_ADMIN_PENDING_AUTO_REFRESH_ROLE_HINT';
  if(window.__CNMI_V464_ADMIN_PENDING_AUTO_REFRESH_ROLE_HINT__)return;
  window.__CNMI_V464_ADMIN_PENDING_AUTO_REFRESH_ROLE_HINT__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function actualAdmin(){try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function onDashboard(){return String(S()?.page||'')==='dashboard';}
  function api(){return window.cnmiV460||null;}
  let lastAttempt=0;
  let timer=null;

  function preserveScroll(){
    const page=document.getElementById('pageContent');
    return {y:window.scrollY||0,pageTop:page?.scrollTop||0};
  }
  function restoreScroll(pos){
    setTimeout(()=>{
      try{window.scrollTo({top:pos?.y||0,left:0,behavior:'auto'});}catch(_){try{window.scrollTo(0,pos?.y||0);}catch(__){}}
      try{const page=document.getElementById('pageContent');if(page)page.scrollTop=pos?.pageTop||0;}catch(_){ }
    },0);
  }
  async function refreshPending(reason='timer',force=true){
    const a=api();
    if(!actualAdmin()||!onDashboard()||document.hidden||!a?.loadAdminPending)return;
    if(a.pendingCache?.status==='loading')return;
    const now=Date.now();
    // Guard bursts caused by focus + visibilitychange firing together.
    if(now-lastAttempt<5000)return;
    lastAttempt=now;
    const pos=preserveScroll();
    try{
      await a.loadAdminPending(!!force);
    }catch(err){console.warn('[V464] pending auto refresh',reason,err);}
    finally{restoreScroll(pos);}
  }

  function startTimer(){
    if(timer)return;
    timer=setInterval(()=>{refreshPending('interval',true);},60000);
  }
  startTimer();

  window.addEventListener('focus',()=>{setTimeout(()=>refreshPending('focus',true),120);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>refreshPending('visible',true),150);});
  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('[data-page="dashboard"], [data-nav-page="dashboard"]');
    if(b)setTimeout(()=>refreshPending('dashboard-open',true),250);
  },true);

  // Clarify account Role vs daytime-position lifecycle in Admin > Users.
  const previousUsers=window.renderUsersPage||(typeof renderUsersPage==='function'?renderUsersPage:null);
  if(typeof previousUsers==='function'){
    const wrapped=function renderUsersPageV464(){
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

  // Add a tiny visible note so Admin knows the center no longer requires manual refresh.
  function decoratePendingPanel(){
    if(!actualAdmin()||!onDashboard())return;
    const panel=document.querySelector('[data-v460-admin-pending]');
    if(!panel||panel.querySelector('[data-v464-auto-note]'))return;
    const p=panel.querySelector('.v460-admin-pending-head p');
    if(p){
      const note=document.createElement('span');
      note.setAttribute('data-v464-auto-note','');
      note.className='v464-auto-note';
      note.textContent=' • อัปเดตอัตโนมัติทุก 1 นาที';
      p.appendChild(note);
    }
  }
  const mo=new MutationObserver(()=>decoratePendingPanel());
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  setTimeout(decoratePendingPanel,300);

  const style=document.createElement('style');style.id='cnmi-v464-style';style.textContent=`
    .v464-role-hint{display:block;margin-top:4px;color:#6f8190!important;font-size:9px!important;line-height:1.35!important;font-weight:500!important}.v464-role-hint b{color:#245d80}.v464-auto-note{color:#3c7d5a;font-weight:800}
    @media(max-width:820px){.v464-role-hint{font-size:10px!important;line-height:1.4!important}}
  `;document.head.appendChild(style);

  window.cnmiV464={version:VERSION,refreshPending};
  console.info(`${VERSION} loaded`);
})();
