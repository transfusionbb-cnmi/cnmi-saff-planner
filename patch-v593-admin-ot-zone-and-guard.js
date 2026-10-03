/* CNMI Staff Planner V593 — Admin OT Zone + Admin Mode Guard
 * - In effective Admin mode, moves the complete OT admin tree from Staff section to Admin section.
 * - Staff mode keeps the normal personal OT tree under Staff.
 * - Adds a persistent Admin mode banner with a one-click switch to Staff mode.
 * - Adds a blocking confirmation when an Admin OT form is about to create a record for the logged-in Admin themself.
 * - Repairs the 3 direct Admin-extra OT buttons independently of legacy nested-menu handlers.
 * UI/navigation safety only. No OT/HR calculation, approval, rate, export, or database logic changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V593_ADMIN_OT_ZONE_GUARD__) return;
  window.__CNMI_V593_ADMIN_OT_ZONE_GUARD__=true;
  const VERSION='V593_ADMIN_OT_ZONE_GUARD';
  const VALID_EXTRA=new Set(['work','adjustment','activity']);
  let queued=false;
  let guardForm=null;

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function actualAdmin(){
    try{if(typeof window.isActualAdminV167==='function')return !!window.isActualAdminV167();}catch(_){ }
    return String(S()?.profile?.role||'').toLowerCase()==='admin';
  }
  function adminMode(){try{return actualAdmin()&&typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function currentStaff(){
    try{if(typeof currentStaffId==='function')return String(currentStaffId()||'');}catch(_){ }
    const s=S();return String(s?.profile?.id||s?.profile?.staff_id||s?.session?.user?.id||'');
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function month(){
    const s=S();
    const v=String(s.otMenuMonthV369||s.otSourceMonthV241||s.otMoneyMonthV241||s.myDutyMonthFilter||'').slice(0,7);
    return /^\d{4}-\d{2}$/.test(v)?v:'';
  }

  function adminSection(){
    return [...document.querySelectorAll('#mainNav .nav-section')].find(sec=>/เมนู\s*Admin/i.test(String(sec.querySelector('.nav-section-title span')?.textContent||'')))||null;
  }
  function staffSection(){
    return [...document.querySelectorAll('#mainNav .nav-section')].find(sec=>/เมนู\s*Staff/i.test(String(sec.querySelector('.nav-section-title span')?.textContent||'')))||null;
  }

  function moveOtTree(){
    const tree=document.querySelector('#mainNav .v523-nav-tree');
    if(!tree)return;
    const parent=tree.querySelector('.v523-nav-parent');
    const label=parent?.querySelector('.v523-parent-label');
    if(adminMode()){
      const sec=adminSection();if(!sec)return;
      const title=sec.querySelector('.nav-section-title');
      if(tree.parentElement!==sec){ title?.insertAdjacentElement('afterend',tree); }
      if(label)label.textContent='จัดการ OT เจ้าหน้าที่';
      tree.classList.add('v593-admin-ot-tree');
      tree.classList.remove('v593-staff-ot-tree');
      parent?.setAttribute('title','งาน OT สำหรับ Admin: บันทึกแทน ตรวจสอบ อนุมัติ และ Export');
    }else{
      const sec=staffSection();if(!sec)return;
      const audit=[...sec.querySelectorAll('.nav-btn[data-page]')].find(b=>String(b.dataset.page)==='audit');
      if(tree.parentElement!==sec){
        if(audit) audit.insertAdjacentElement('beforebegin',tree); else sec.appendChild(tree);
      }
      if(label)label.textContent='ลงชื่ออยู่เวร / ขอ OT เพิ่ม';
      tree.classList.add('v593-staff-ot-tree');
      tree.classList.remove('v593-admin-ot-tree');
      parent?.setAttribute('title','OT ของฉัน');
    }
  }

  function ensureBanner(){
    const panel=document.querySelector('.main-panel');
    const topbar=document.querySelector('.main-panel .topbar');
    if(!panel||!topbar)return;
    let bar=document.getElementById('v593AdminModeBanner');
    if(!actualAdmin()){
      bar?.remove();document.documentElement.classList.remove('v593-admin-active');return;
    }
    if(!bar){
      bar=document.createElement('div');bar.id='v593AdminModeBanner';bar.className='v593-admin-mode-banner';
      bar.innerHTML=`<div class="v593-admin-mode-copy"><strong>🛡 Admin mode</strong><span>กำลังใช้งานสิทธิ์ผู้ดูแลระบบ • เมนู OT ในส่วน Admin เป็นการทำรายการแทนเจ้าหน้าที่</span></div><button type="button" class="v593-switch-staff" data-v593-switch-staff>สลับเป็น Staff mode</button>`;
      topbar.insertAdjacentElement('afterend',bar);
    }
    const on=adminMode();
    bar.hidden=!on;
    document.documentElement.classList.toggle('v593-admin-active',on);
  }

  function extraGo(mode){
    if(!adminMode()||!VALID_EXTRA.has(mode))return false;
    const s=S();
    s.page='ot';s.otMenuV369='admin-extra';s.otGroupV522='ot';s.v527ExtraMode=mode;
    try{
      sessionStorage.setItem('cnmi-v528-admin-extra-mode',mode);
      sessionStorage.setItem('cnmi-v528-admin-extra-open','1');
      sessionStorage.setItem('cnmi-v523-ot-open','1');
      sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');
    }catch(_){ }
    const qs=new URLSearchParams();qs.set('section','request-extra');const m=month();if(m)qs.set('month',m);qs.set('mode',mode);
    const target='#/ot?'+qs.toString();
    try{history.pushState({cnmiV593:true},'',target);}catch(_){location.hash=target;}
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){ }
    try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:'ot'}}));}catch(_){ }
    const sidebar=document.getElementById('sidebar');
    if(sidebar&&window.matchMedia('(max-width:820px)').matches){sidebar.classList.remove('open');document.body.classList.remove('sidebar-open');}
    setTimeout(apply,0);
    return true;
  }

  function selectedStaffForForm(form){
    if(!form)return'';
    const el=form.querySelector('select[name="staff_id"],input[name="staff_id"]');
    return String(el?.value||'');
  }
  function staffNameById(id){
    const s=S();const row=(s.staff||s.staffs||s.staffList||[]).find(x=>String(x.id||x.staff_id||'')===String(id));
    return String(row?.nickname||row?.display_name||row?.full_name||row?.name||s?.profile?.nickname||s?.profile?.full_name||'คุณ');
  }
  function isGuardedAdminOtForm(form){
    if(!adminMode()||!form||String(S().page||'')!=='ot')return false;
    if(!form.querySelector('[name="staff_id"]'))return false;
    return !!form.closest('.v369-ot-page,.v234-ot-page,.ot-page,#pageContent') && (
      form.id==='attendanceAdminFormV180' ||
      form.matches('[data-admin-simple="1"]') ||
      /^v527/i.test(form.id||'') ||
      !!form.closest('.v234-admin-card,.v527-admin-extra,.v527-mode-content')
    );
  }
  function showSelfGuard(form){
    guardForm=form;
    const who=staffNameById(currentStaff());
    const html=`<div class="v593-guard-dialog"><div class="v593-guard-icon">🛡</div><h2>กำลังทำรายการใน Admin mode</h2><p>รายการนี้เลือกชื่อ <b>${esc(who)}</b> ซึ่งเป็นบัญชีที่กำลังใช้งานอยู่</p><div class="v593-guard-note">ถ้าตั้งใจลงชื่ออยู่เวร/ขอ OT ของตัวเอง แนะนำให้สลับเป็น <b>Staff mode</b> ก่อน เพื่อไม่ให้สับสนว่าเป็นรายการที่ Admin บันทึกแทน</div><div class="confirm-actions v593-guard-actions"><button type="button" class="ghost-btn" data-v593-switch-staff>สลับเป็น Staff mode</button><button type="button" class="primary-btn" data-v593-self-continue>ยืนยัน ทำต่อใน Admin mode</button></div></div>`;
    try{if(typeof showModal==='function')showModal(html,{small:true});else window.showModal?.(html,{small:true});}catch(_){ }
  }
  async function switchStaff(){
    guardForm=null;
    try{if(typeof hideModal==='function')hideModal();else document.getElementById('modal')?.classList.add('hidden');}catch(_){ }
    try{
      if(typeof window.setViewAsModeV167==='function'){await window.setViewAsModeV167('staff');return;}
      if(typeof window.setViewAsMode==='function'){await window.setViewAsMode('staff');return;}
    }catch(_){ }
  }

  function versionChip(){
    try{document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{chip.textContent='v593';chip.title='Admin OT Zone + Admin Mode Guard (V593)';});}catch(_){ }
  }
  function apply(){moveOtTree();ensureBanner();versionChip();}
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}

  // Repair the three direct V592 Admin-extra items at WINDOW capture phase.
  window.addEventListener('click',function(e){
    const btn=e.target?.closest?.('[data-v592-admin-extra],[data-v528-extra-mode]');
    if(!btn)return;
    const mode=String(btn.dataset.v592AdminExtra||btn.dataset.v528ExtraMode||'');
    if(!VALID_EXTRA.has(mode)||!adminMode())return;
    e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
    extraGo(mode);
  },true);

  // Explicit Staff-mode switch in the persistent banner and safety dialog.
  window.addEventListener('click',function(e){
    const sw=e.target?.closest?.('[data-v593-switch-staff]');if(!sw)return;
    e.preventDefault();e.stopPropagation();void switchStaff();
  },true);

  // If Admin is about to submit an OT record for themself, stop and ask explicitly.
  window.addEventListener('submit',function(e){
    const form=e.target;if(!(form instanceof HTMLFormElement))return;
    if(form.dataset.v593GuardPass==='1'){delete form.dataset.v593GuardPass;return;}
    if(!isGuardedAdminOtForm(form))return;
    const selected=selectedStaffForForm(form),me=currentStaff();
    if(!selected||!me||selected!==me)return;
    e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
    showSelfGuard(form);
  },true);

  document.addEventListener('click',function(e){
    const go=e.target?.closest?.('[data-v593-self-continue]');if(!go)return;
    e.preventDefault();e.stopPropagation();
    const form=guardForm;guardForm=null;
    try{if(typeof hideModal==='function')hideModal();else document.getElementById('modal')?.classList.add('hidden');}catch(_){ }
    if(form&&document.body.contains(form)){
      form.dataset.v593GuardPass='1';
      if(typeof form.requestSubmit==='function')form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    }
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v593-admin-ot-zone-style';
  style.textContent=`
    .v593-admin-mode-banner{position:sticky;top:0;z-index:35;margin:0 14px 8px;padding:10px 12px;border:2px solid #f1a4b6;border-radius:14px;background:#fff4f7;box-shadow:0 4px 14px rgba(120,42,66,.10);display:flex;align-items:center;justify-content:space-between;gap:12px}
    .v593-admin-mode-banner[hidden]{display:none!important}.v593-admin-mode-copy{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap}.v593-admin-mode-copy strong{color:#a51d47;font-size:.96rem}.v593-admin-mode-copy span{color:#6c3142;font-size:.82rem}
    .v593-switch-staff{border:1px solid #7fc6a8;background:#effcf6;color:#176744;border-radius:999px;padding:8px 12px;font-weight:700;white-space:nowrap;cursor:pointer}
    #mainNav .v593-admin-ot-tree{margin:4px 0 8px;padding:3px 0 8px;border-bottom:1px dashed #d9e6ef}
    #mainNav .v593-admin-ot-tree>.v523-nav-parent{background:#fff7fa;border:1px solid #f0ced8}
    #mainNav .v593-admin-ot-tree>.v523-nav-parent .v523-parent-label{color:#733044;font-weight:700}
    .v593-guard-dialog{text-align:center}.v593-guard-icon{font-size:2rem;margin-bottom:4px}.v593-guard-dialog h2{margin:4px 0 10px;color:#7b2942}.v593-guard-dialog p{margin:0 0 10px}.v593-guard-note{text-align:left;background:#fff4f7;border:1px solid #f1ccd7;border-radius:12px;padding:10px 12px;color:#633443;line-height:1.55}.v593-guard-actions{margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    @media(max-width:820px){.v593-admin-mode-banner{margin:0 8px 8px;padding:9px 10px;align-items:flex-start}.v593-admin-mode-copy{display:block}.v593-admin-mode-copy strong,.v593-admin-mode-copy span{display:block}.v593-admin-mode-copy span{margin-top:2px}.v593-switch-staff{padding:7px 9px;font-size:.78rem}.v593-guard-actions>*{width:100%}}
  `;
  document.head.appendChild(style);

  function start(){
    apply();
    const nav=document.getElementById('mainNav');if(nav)new MutationObserver(queue).observe(nav,{childList:true,subtree:true});
    const mini=document.getElementById('userMini');if(mini)new MutationObserver(queue).observe(mini,{childList:true,subtree:true,characterData:true});
    window.addEventListener('hashchange',queue);window.addEventListener('pageshow',queue);
    document.addEventListener('click',e=>{if(e.target?.closest?.('[data-view-as-mode]'))setTimeout(queue,50);},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV593={version:VERSION,apply,extraGo};
  console.info('['+VERSION+'] loaded');
})();
