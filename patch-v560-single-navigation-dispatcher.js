/* CNMI Staff Planner V560 — Single Navigation Dispatcher
 * Fixes the remaining "click menu -> old page freezes briefly -> new page appears" feeling.
 *
 * Root cause:
 * - Several legacy document-capture navigation handlers still wait for Supabase refreshes
 *   before the first render (especially position/admin routes).
 * - V559 improved render cost, but those earlier capture handlers still owned the click.
 *
 * V560 owns sidebar navigation at WINDOW capture level (before document capture handlers),
 * paints immediate feedback, yields one frame so the browser can paint, renders cached state,
 * and refreshes route data in the background. Rapid taps invalidate older refresh results.
 *
 * UI/navigation/performance only. No schema or business-rule changes.
 */
(function(){
  'use strict';
  const VERSION='V560_SINGLE_NAVIGATION_DISPATCHER';
  if(window.__CNMI_V560_SINGLE_NAVIGATION_DISPATCHER__) return;
  window.__CNMI_V560_SINGLE_NAVIGATION_DISPATCHER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function closeSidebar(){
    try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }
  }
  function titleFor(page){
    try{
      const list=(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]);
      return txt(list.find(x=>txt(x?.id)===page)?.title)||'กำลังเปิดหน้า';
    }catch(_){return 'กำลังเปิดหน้า';}
  }
  function subtitleFor(page){
    try{
      const list=(typeof NAV_ITEMS!=='undefined'?NAV_ITEMS:window.NAV_ITEMS||[]);
      return txt(list.find(x=>txt(x?.id)===page)?.subtitle)||'';
    }catch(_){return '';}
  }
  function currentStamp(){
    try{return window.cnmiV559?.stateStamp?.()||'';}catch(_){return '';}
  }
  function nextPaint(){
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }
  function setBusy(on,node){
    try{
      document.documentElement.classList.toggle('v560-route-busy',!!on);
      document.querySelectorAll('.v560-nav-active').forEach(el=>el.classList.remove('v560-nav-active'));
      if(on&&node?.classList)node.classList.add('v560-nav-active');
    }catch(_){ }
  }
  function paintShell(page){
    const title=titleFor(page),sub=subtitleFor(page);
    try{const el=document.getElementById('pageTitle');if(el)el.textContent=title;}catch(_){ }
    try{const el=document.getElementById('pageSubtitle');if(el)el.textContent=sub;}catch(_){ }
    try{
      const content=document.getElementById('pageContent');
      if(!content)return;
      content.innerHTML=`<div class="v560-route-shell" role="status" aria-live="polite">
        <div class="v560-route-shell-head"><span class="v560-route-spinner" aria-hidden="true"></span><strong>${title.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</strong></div>
        <div class="v560-route-shell-lines"><i></i><i></i><i></i></div>
      </div>`;
    }catch(_){ }
  }
  function setUrl(page){
    try{window.cnmiV515?.setUrl?.(page,{push:true});}catch(_){ }
  }
  function openTree(id){
    try{window.cnmiV542SidebarOwner?.setOpenTree?.(id);}catch(_){ }
  }
  function collapsePlain(page){
    try{window.cnmiV542SidebarOwner?.collapsePlain?.(page);}catch(_){ }
  }

  const CHILDREN={
    'leave:leave-form':{page:'leave',stateKey:'v524LeaveView',session:'cnmi-v524-leave-view',view:'form'},
    'leave:leave-history':{page:'leave',stateKey:'v524LeaveView',session:'cnmi-v524-leave-view',view:'history'},
    'profile:profile-main':{page:'myProfile',stateKey:'v524ProfileView',session:'cnmi-v524-profile-view',view:'profile'},
    'profile:profile-history':{page:'myProfile',stateKey:'v524ProfileView',session:'cnmi-v524-profile-view',view:'requests'},
    'activities:activity-create':{page:'activities',stateKey:'v524ActivityView',session:'cnmi-v524-activity-view',view:'create'},
    'activities:activity-search':{page:'activities',stateKey:'v524ActivityView',session:'cnmi-v524-activity-view',view:'search'},
    'activities:my-training':{page:'myTraining'},
    'roster:roster-view':{page:'schedule'},
    'roster:roster-trade':{page:'tradeRequests'},
    'positions-staff:positions-day':{page:'positions'},
    'positions-staff:positions-month':{page:'positionMonthView'},
    'hr:hr-pending':{page:'hr'},
    'hr:hr-done':{page:'hrSummary'},
    'positions-admin:position-plan':{page:'positionMonth'},
    'positions-admin:position-master':{page:'positionManagement'},
    'positions-admin:intern-add':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'add'},
    'positions-admin:intern-mentor':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'mentor'},
    'positions-admin:intern-list':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'registry'},
    'positions-admin:intern-history':{page:'internManagement',stateKey:'v524InternView',session:'cnmi-v524-intern-view',view:'history'},
    'physician:physician-daytime':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'daytime'},
    'physician:physician-oncall':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'oncall'},
    'physician:physician-override':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'override'},
    'physician:physician-list':{page:'physicianConsult',stateKey:'v524PhysicianView',session:'cnmi-v524-physician-view',view:'list'},
    'users:users-manage':{page:'users',stateKey:'v524UsersView',session:'cnmi-v524-users-view',view:'manage'},
    'users:users-add':{page:'users',stateKey:'v524UsersView',session:'cnmi-v524-users-view',view:'add'},
    'profile-requests:profile-pending':{page:'profileRequests'},
    'profile-requests:profile-history':{page:'profileRequestSummary'}
  };
  function applyChild(tree,key){
    const cfg=CHILDREN[`${tree}:${key}`];
    if(!cfg)return null;
    if(cfg.stateKey){
      S()[cfg.stateKey]=cfg.view;
      try{sessionStorage.setItem(cfg.session,cfg.view);}catch(_){ }
    }
    openTree(`v524:${tree}`);
    return cfg.page;
  }
  function otGroup(id){
    if(admin()){
      if(['admin-duty','tracking'].includes(id))return 'duty';
      if(['admin-extra','approve'].includes(id))return 'ot';
      return 'report';
    }
    if(['staff-track','staff-confirm'].includes(id))return 'duty';
    if(['staff-extra','staff-list'].includes(id))return 'ot';
    return 'summary';
  }
  function applyOt(id){
    const allowed=admin()
      ? new Set(['admin-duty','admin-extra','tracking','approve','summary','admin-details','export','history'])
      : new Set(['staff-track','staff-confirm','staff-extra','staff-list','staff-details','staff-summary']);
    if(!allowed.has(id))return null;
    const st=S();st.otMenuV369=id;st.otGroupV522=otGroup(id);st.page='ot';
    try{sessionStorage.setItem('cnmi-v523-ot-open','1');}catch(_){ }
    openTree('ot');
    return 'ot';
  }

  let navSeq=0;
  let finishTimer=0;
  async function navigate(page,node,{sameSubview=false}={}){
    const p=txt(page);if(!p)return;
    const st=S();if(!st?.profile)return;
    const seq=++navSeq;
    clearTimeout(finishTimer);
    setBusy(true,node);
    closeSidebar();

    const samePage=txt(st.page)===p;
    st.page=p;
    setUrl(p);
    paintShell(p);

    // Critical: give Chrome/Safari one real paint before any legacy-heavy render/data work.
    await nextPaint();
    if(seq!==navSeq||txt(S().page)!==p)return;

    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(err){console.warn(`[${VERSION}] first render`,p,err);}
    requestAnimationFrame(()=>requestAnimationFrame(decorate));

    // If this is only a same-page subview switch, there is usually nothing new to fetch.
    if(samePage&&sameSubview){
      finishTimer=setTimeout(()=>setBusy(false),40);
      return;
    }

    const before=currentStamp();
    try{
      if(window.cnmiV316?.loadPageData){
        await window.cnmiV316.loadPageData(p,{force:false});
      }
      if(['hr','hrSummary'].includes(p)){
        try{await window.cnmiV515?.syncSafeHr?.(true,{render:false});}catch(_){ }
      }
    }catch(err){console.warn(`[${VERSION}] background load`,p,err);}
    if(seq!==navSeq||txt(S().page)!==p)return;

    const after=currentStamp();
    if(after!==before){
      // Yield once more before the fresh-data render so long tables don't monopolize the click frame.
      await nextPaint();
      if(seq!==navSeq||txt(S().page)!==p)return;
      try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(err){console.warn(`[${VERSION}] fresh render`,p,err);}
      requestAnimationFrame(()=>requestAnimationFrame(decorate));
    }
    finishTimer=setTimeout(()=>setBusy(false),40);
  }

  function stop(e){
    try{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}catch(_){ }
  }

  // WINDOW capture runs before all legacy DOCUMENT-capture handlers.
  // This is the key difference from V559 and removes the remaining await-before-render freezes.
  window.addEventListener('click',function(e){
    const target=e.target;
    const navRoot=target?.closest?.('#mainNav');
    if(!navRoot)return;

    // Leave tree expand/collapse controls to the existing sidebar owner; they are local DOM-only actions.
    if(target.closest('[data-v523-submenu-toggle],[data-v524-tree-toggle],[data-v528-extra-toggle],[data-v528-extra-mode]'))return;

    const ot=target.closest('[data-v523-ot-item]');
    if(ot){
      const id=txt(ot.dataset.v523OtItem);const page=applyOt(id);if(!page)return;
      stop(e);void navigate(page,ot,{sameSubview:true});return;
    }

    const child=target.closest('[data-v524-child-key]');
    if(child){
      const tree=txt(child.dataset.v524TreeItem),key=txt(child.dataset.v524ChildKey);
      const beforePage=txt(S().page),page=applyChild(tree,key);if(!page)return;
      stop(e);void navigate(page,child,{sameSubview:beforePage===page});return;
    }

    const plain=target.closest('.nav-btn[data-page]');
    if(plain&&!plain.closest('.v523-nav-tree,.v524-nav-tree')){
      const page=txt(plain.dataset.page);if(!page)return;
      // Scheduler already has an earlier window-capture fast-path (V211). Keep that proven path.
      if(page==='scheduler')return;
      stop(e);collapsePlain(page);void navigate(page,plain,{sameSubview:false});return;
    }
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v560-navigation-dispatcher-style';
  style.textContent=`
    html.v560-route-busy{cursor:progress}
    html.v560-route-busy::after{content:"";position:fixed;z-index:99999;left:0;top:0;height:3px;width:100%;background:linear-gradient(90deg,#49aee8 0 36%,#9bd9bf 58%,transparent 82%);background-size:220% 100%;animation:v560bar .65s linear infinite;pointer-events:none}
    @keyframes v560bar{from{background-position:100% 0}to{background-position:-100% 0}}
    #mainNav .v560-nav-active{filter:brightness(.94)!important;outline:2px solid rgba(42,145,210,.22)!important;outline-offset:-2px}
    .v560-route-shell{margin:14px 0;padding:22px;border:1px solid #dbe8f2;border-radius:16px;background:#fff;min-height:180px}
    .v560-route-shell-head{display:flex;align-items:center;gap:10px;color:#23445a;font-size:1rem}
    .v560-route-spinner{width:18px;height:18px;border-radius:50%;border:2px solid #cfe7f7;border-top-color:#49aee8;animation:v560spin .7s linear infinite}
    @keyframes v560spin{to{transform:rotate(360deg)}}
    .v560-route-shell-lines{display:grid;gap:12px;margin-top:22px}.v560-route-shell-lines i{height:14px;border-radius:999px;background:#edf5fa;display:block}.v560-route-shell-lines i:nth-child(1){width:72%}.v560-route-shell-lines i:nth-child(2){width:92%}.v560-route-shell-lines i:nth-child(3){width:58%}
    @media(max-width:820px){.v560-route-shell{margin:8px 0;padding:18px;min-height:150px}}
    @media(prefers-reduced-motion:reduce){html.v560-route-busy::after,.v560-route-spinner{animation:none}}
  `;
  document.head.appendChild(style);

  // V560 owns the visible version chip. Do not touch the service worker version.
  function decorate(){
    try{document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{chip.textContent='v560';chip.title='Single navigation dispatcher + responsive route paint (V560)';});}catch(_){ }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
  window.addEventListener('pageshow',()=>{decorate();setBusy(false);});
  window.addEventListener('error',()=>setBusy(false));
  window.addEventListener('unhandledrejection',()=>setBusy(false));

  window.cnmiV560={version:VERSION,navigate};
  console.info(`[${VERSION}] loaded`);
})();
