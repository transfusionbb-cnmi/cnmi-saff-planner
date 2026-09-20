/* CNMI Staff Planner V541 — Exact Action Deep-link Routing
 * Fixes shortcut/navigation actions that previously knew only the parent page,
 * causing grouped pages (especially OT) to open their first/default submenu.
 *
 * Main fixes:
 * - Dashboard Admin pending: OT pending -> OT approval (not confirm-duty).
 * - Dashboard Admin pending: leave cancellation -> leave history.
 * - Donor helper "go to OT" -> request-extra.
 * - Direct URL / Refresh / Back-Forward re-apply exact submenu BEFORE render,
 *   including admin-only OT sections even if V540 parsed the route before profile restore.
 *
 * Navigation/UI only. No database/schema/business-rule changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V541_EXACT_ACTION_DEEP_LINK_ROUTING__) return;
  window.__CNMI_V541_EXACT_ACTION_DEEP_LINK_ROUTING__=true;
  const VERSION='V541_EXACT_ACTION_DEEP_LINK_ROUTING';

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function text(v){return String(v==null?'':v).trim();}
  function validMonth(v){return /^\d{4}-\d{2}$/.test(text(v));}
  function monthEnd(key){const m=/^(\d{4})-(\d{2})$/.exec(text(key));if(!m)return'';return `${key}-${String(new Date(Number(m[1]),Number(m[2]),0).getDate()).padStart(2,'0')}`;}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){} }

  function actualAdmin(){
    try{if(typeof window.isActualAdminV167==='function')return !!window.isActualAdminV167();}catch(_){}
    const st=S(),role=text(st?.profile?.role).toLowerCase();
    return role==='admin';
  }
  function adminMode(){
    try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return actualAdmin();}
  }
  function forceAdminMode(){
    const st=S();if(!actualAdmin())return false;
    try{
      const id=st?.session?.user?.id||st?.profile?.user_id||st?.profile?.id||st?.profile?.email||'guest';
      st.viewAsMode='admin';
      localStorage.setItem(`cnmi_view_as_mode_${id}`,'admin');
    }catch(_){ }
    return true;
  }

  function parseHash(){
    const raw=String(location.hash||'');
    const h=raw.replace(/^#\/?/,'');
    const q=h.indexOf('?');
    const route=decodeURIComponent((q>=0?h.slice(0,q):h)||'dashboard');
    return {route,params:new URLSearchParams(q>=0?h.slice(q+1):'')};
  }

  function setOpenTree(id){
    try{
      const legacy=id==='ot'?'ot':`v524:${id}`;
      if(window.cnmiV542SidebarOwner?.setOpenTree){window.cnmiV542SidebarOwner.setOpenTree(legacy);return;}
      sessionStorage.setItem('cnmi-sidebar-tree-open-id',legacy);
      sessionStorage.setItem('cnmi-v536-sidebar-open-tree',legacy);
    }catch(_){ }
  }

  function setSimpleSubview(route,section){
    const st=S();
    if(route==='leave'){
      const v=['form','history'].includes(section)?section:'form';
      st.v524LeaveView=v;ssSet('cnmi-v524-leave-view',v);setOpenTree('leave');return true;
    }
    if(route==='profile'){
      const v=['profile','requests'].includes(section)?section:'profile';
      st.v524ProfileView=v;ssSet('cnmi-v524-profile-view',v);setOpenTree('profile');return true;
    }
    if(route==='activities'){
      const v=['create','search'].includes(section)?section:'create';
      st.v524ActivityView=v;ssSet('cnmi-v524-activity-view',v);setOpenTree('activities');return true;
    }
    if(route==='intern'){
      const v=['add','mentor','registry','history'].includes(section)?section:'add';
      st.v524InternView=v;ssSet('cnmi-v524-intern-view',v);setOpenTree('positions-admin');return true;
    }
    if(route==='physician-consult'){
      const v=['daytime','oncall','override','list'].includes(section)?section:'daytime';
      st.v524PhysicianView=v;ssSet('cnmi-v524-physician-view',v);setOpenTree('physician');return true;
    }
    if(route==='users'){
      const v=['manage','add'].includes(section)?section:'manage';
      st.v524UsersView=v;ssSet('cnmi-v524-users-view',v);setOpenTree('users');return true;
    }
    return false;
  }

  const ADMIN_OT={
    'confirm-duty':'admin-duty',
    'request-extra':'admin-extra',
    'staff-tracking':'tracking',
    'approval':'approve',
    'monthly-summary':'summary',
    'staff-detail':'admin-details',
    'hr-export':'export',
    'export-history':'history'
  };
  const STAFF_OT={
    'my-duty':'staff-track',
    'confirm-duty':'staff-confirm',
    'request-extra':'staff-extra',
    'my-ot':'staff-list',
    'claim-detail':'staff-details',
    'monthly-summary':'staff-summary'
  };
  const ADMIN_ONLY_SECTIONS=new Set(['staff-tracking','approval','staff-detail','hr-export','export-history']);
  const STAFF_ONLY_SECTIONS=new Set(['my-duty','my-ot','claim-detail']);

  function setOtSection(section,{month='',mode='',forceAdmin=false}={}){
    const st=S();
    const hasProfile=!!st?.profile;
    if(forceAdmin)forceAdminMode();

    let useAdmin=false;
    if(ADMIN_ONLY_SECTIONS.has(section)){
      if(hasProfile&&!actualAdmin()) return false;
      useAdmin=true;
      if(actualAdmin())forceAdminMode();
    }else if(STAFF_ONLY_SECTIONS.has(section)){
      useAdmin=false;
    }else{
      useAdmin=adminMode();
    }

    const id=(useAdmin?ADMIN_OT:STAFF_OT)[section] || (useAdmin?'admin-duty':'staff-track');
    st.otMenuV369=id;
    st.otGroupV522=(['admin-duty','tracking','staff-track','staff-confirm'].includes(id)?'duty':(['admin-extra','approve','staff-extra','staff-list'].includes(id)?'ot':'report'));
    setOpenTree('ot');

    if(id==='admin-extra'){
      const m=['work','adjustment','activity'].includes(mode)?mode:'work';
      st.v527ExtraMode=m;ssSet('cnmi-v528-admin-extra-mode',m);ssSet('cnmi-v528-admin-extra-open','1');
    }
    if(validMonth(month)){
      st.otMenuMonthV369=month;st.otMoneyMonthV241=month;st.otSourceMonthV241=month;st.myDutyMonthFilter=month;
      if(id==='approve'){
        st.otApprovalStatusFilter='รออนุมัติ';
        st.otApprovalStartDate=`${month}-01`;
        st.otApprovalEndDate=monthEnd(month);
      }
    }
    return true;
  }

  function applyExactHashState(){
    const {route,params}=parseHash();
    const section=text(params.get('section'));
    if(route==='ot'){
      if(section)setOtSection(section,{month:text(params.get('month')),mode:text(params.get('mode'))});
      return;
    }
    if(section)setSimpleSubview(route,section);
  }

  function exactOtHash(section,{month='',mode=''}={}){
    const p=new URLSearchParams();p.set('section',section);
    if(validMonth(month))p.set('month',month);
    if(mode)p.set('mode',mode);
    return `#/ot?${p.toString()}`;
  }

  function pushExactHash(hash){
    try{if(String(location.hash||'')!==hash)history.pushState({cnmiV541:true},'',hash);}catch(_){location.hash=hash;}
  }

  /* Window capture runs before V515/V460 document capture handlers. This means
     the exact subview is already selected when their normal navigation/render runs. */
  window.addEventListener('click',function(e){
    const target=e.target;

    const pending=target?.closest?.('[data-v460-open-page]');
    if(pending){
      const page=text(pending.getAttribute('data-v460-open-page'));
      const month=text(pending.getAttribute('data-v460-open-month'));
      if(page==='ot'){
        forceAdminMode();
        setOtSection('approval',{month,forceAdmin:true});
      }else if(page==='leave'){
        const st=S();st.v524LeaveView='history';ssSet('cnmi-v524-leave-view','history');setOpenTree('leave');
      }else if(page==='hr'){
        forceAdminMode();
      }else if(page==='profileRequests'||page==='donorHelpers'||page==='tradeRequests'){
        forceAdminMode();
      }
      return;
    }

    /* Donor-helper shortcuts explicitly say "ไปส่วนขอ OT". Open request-extra,
       not the first OT submenu. */
    const donorOt=target?.closest?.('[data-v327-go-ot],.donor-helper-ot-note [data-page="ot"]');
    if(donorOt){
      const st=S();const month=text(st.donorHelperMonthV327||st.donorHelperMonthV324||'');
      const admin=adminMode();
      setOtSection('request-extra',{month,mode:'work'});
      if(donorOt.hasAttribute('data-v327-go-ot')){
        pushExactHash(exactOtHash('request-extra',{month,mode:admin?'work':''}));
      }
      return;
    }
  },true);

  /* Re-apply exact URL intent before every render. V540 could parse an admin OT
     route before the restored profile/role existed, which made it choose a staff/default
     submenu. This pre-render pass makes direct links deterministic. */
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'&&!previousRender.__v541Wrapped){
    const wrapped=function renderPageV541(){
      try{applyExactHashState();}catch(_){ }
      const out=previousRender.apply(this,arguments);
      setTimeout(()=>{try{decorateVersion();}catch(_){ }},0);
      return out;
    };
    wrapped.__v541Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  function onHistory(){try{applyExactHashState();}catch(_){ }}
  window.addEventListener('hashchange',onHistory,true);
  window.addEventListener('popstate',onHistory,true);

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v540-version-chip,.v539-version-chip,.v535-version-chip,.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip)return;chip.textContent='v541';chip.title='Exact action deep-link routing';chip.classList.add('v541-version-chip');
  }

  function start(){
    try{applyExactHashState();}catch(_){ }
    setTimeout(()=>{try{applyExactHashState();decorateVersion();}catch(_){ }},0);
    setTimeout(()=>{try{applyExactHashState();decorateVersion();}catch(_){ }},180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pageshow',()=>setTimeout(start,0));

  window.cnmiV541={version:VERSION,applyExactHashState,setOtSection};
  console.info(`[${VERSION}] loaded`);
})();
