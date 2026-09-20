/* CNMI Staff Planner V540 — Submenu Deep-link Routing
 * Gives every Sidebar submenu a stable URL while keeping V515 base routing intact.
 * Same-page subviews use ?section=... (and ?mode=... for nested OT request modes).
 * Existing submenu pages that already have their own route keep that route.
 * Browser Back/Forward and Refresh restore the selected submenu.
 * Navigation/UI only. No DB/schema/business-rule changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V540_SUBMENU_DEEP_LINK_ROUTING__) return;
  window.__CNMI_V540_SUBMENU_DEEP_LINK_ROUTING__=true;
  const VERSION='V540_SUBMENU_DEEP_LINK_ROUTING';

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function text(v){return String(v==null?'':v).trim();}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){}}
  function validMonth(v){return /^\d{4}-\d{2}$/.test(text(v));}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){try{return !!window.isAdmin?.();}catch(__){return false;}}}

  const OT_ADMIN_SECTION_TO_ID={
    'confirm-duty':'admin-duty',
    'request-extra':'admin-extra',
    'staff-tracking':'tracking',
    'approval':'approve',
    'monthly-summary':'summary',
    'staff-detail':'admin-details',
    'hr-export':'export',
    'export-history':'history'
  };
  const OT_STAFF_SECTION_TO_ID={
    'my-duty':'staff-track',
    'confirm-duty':'staff-confirm',
    'request-extra':'staff-extra',
    'my-ot':'staff-list',
    'claim-detail':'staff-details',
    'monthly-summary':'staff-summary'
  };
  const OT_ADMIN_ID_TO_SECTION=Object.fromEntries(Object.entries(OT_ADMIN_SECTION_TO_ID).map(([k,v])=>[v,k]));
  const OT_STAFF_ID_TO_SECTION=Object.fromEntries(Object.entries(OT_STAFF_SECTION_TO_ID).map(([k,v])=>[v,k]));

  const BASE_DEFAULTS={
    leave:'form',
    profile:'profile',
    activities:'create',
    intern:'add',
    'physician-consult':'daytime',
    users:'manage',
    ot:null
  };

  const TITLE_BY_URL={
    'leave:form':'บันทึกลา / ไม่รับเวร',
    'leave:history':'ประวัติการลา',
    'profile:profile':'ข้อมูลและขอแก้ไข',
    'profile:requests':'คำขอล่าสุดของฉัน',
    'activities:create':'เพิ่มกิจกรรม',
    'activities:search':'ค้นหากิจกรรม',
    'intern:add':'เพิ่มรายชื่อผู้ฝึก',
    'intern:mentor':'กำหนดช่วงพี่เลี้ยง',
    'intern:registry':'ทะเบียนผู้ฝึก',
    'intern:history':'ประวัติพี่เลี้ยง',
    'physician-consult:daytime':'แพทย์ Consult ในเวลา',
    'physician-consult:oncall':'แพทย์ Consult นอกเวลา / วันหยุด',
    'physician-consult:override':'แก้ตารางแพทย์เฉพาะวัน',
    'physician-consult:list':'รายการตารางแพทย์',
    'users:manage':'จัดการเจ้าหน้าที่',
    'users:add':'เพิ่มผู้ใช้งานใหม่',
    'ot:confirm-duty':'ยืนยันเวร',
    'ot:request-extra':'ขอ OT เพิ่ม',
    'ot:staff-tracking':'ติดตามเจ้าหน้าที่',
    'ot:approval':'อนุมัติ OT',
    'ot:monthly-summary':'สรุป OT รายเดือน',
    'ot:staff-detail':'รายละเอียด OT เจ้าหน้าที่',
    'ot:hr-export':'Export HR',
    'ot:export-history':'ประวัติ Export',
    'ot:my-duty':'ติดตามเวรของฉัน',
    'ot:my-ot':'รายการ OT ของฉัน',
    'ot:claim-detail':'รายละเอียดเบิก'
  };

  function parseHash(){
    const raw=String(location.hash||'');
    const h=raw.replace(/^#\/?/,'');
    const q=h.indexOf('?');
    const route=decodeURIComponent((q>=0?h.slice(0,q):h)||'dashboard');
    const params=new URLSearchParams(q>=0?h.slice(q+1):'');
    return {route,params};
  }

  function setLeaveView(v){
    const next=['form','history'].includes(v)?v:'form';
    S().v524LeaveView=next;ssSet('cnmi-v524-leave-view',next);
  }
  function setProfileView(v){
    const next=['profile','requests'].includes(v)?v:'profile';
    S().v524ProfileView=next;ssSet('cnmi-v524-profile-view',next);
  }
  function setActivityView(v){
    const next=['create','search'].includes(v)?v:'create';
    S().v524ActivityView=next;ssSet('cnmi-v524-activity-view',next);
  }
  function setInternView(v){
    const next=['add','mentor','registry','history'].includes(v)?v:'add';
    S().v524InternView=next;ssSet('cnmi-v524-intern-view',next);
  }
  function setPhysicianView(v){
    const next=['daytime','oncall','override','list'].includes(v)?v:'daytime';
    S().v524PhysicianView=next;ssSet('cnmi-v524-physician-view',next);
  }
  function setUsersView(v){
    const next=['manage','add'].includes(v)?v:'manage';
    S().v524UsersView=next;ssSet('cnmi-v524-users-view',next);
  }
  function otGroupFor(id){
    if(['admin-duty','tracking','staff-track','staff-confirm'].includes(id)) return 'duty';
    if(['admin-extra','approve','staff-extra','staff-list'].includes(id)) return 'ot';
    return 'report';
  }
  function setOtView(section,mode,month){
    const admin=isAdminSafe();
    const map=admin?OT_ADMIN_SECTION_TO_ID:OT_STAFF_SECTION_TO_ID;
    const fallback=admin?'admin-duty':'staff-track';
    const id=map[section]||fallback;
    S().otMenuV369=id;
    S().otGroupV522=otGroupFor(id);
    if(id==='admin-extra'&&admin){
      const m=['work','adjustment','activity'].includes(mode)?mode:'work';
      S().v527ExtraMode=m;ssSet('cnmi-v528-admin-extra-mode',m);ssSet('cnmi-v528-admin-extra-open','1');
    }
    if(validMonth(month)){
      S().otMenuMonthV369=month;
      S().otMoneyMonthV241=month;
      S().otSourceMonthV241=month;
      S().myDutyMonthFilter=month;
    }
  }

  function applyFromUrl(){
    const {route,params}=parseHash();
    const section=text(params.get('section'));
    if(route==='leave') setLeaveView(section||BASE_DEFAULTS.leave);
    else if(route==='profile') setProfileView(section||BASE_DEFAULTS.profile);
    else if(route==='activities') setActivityView(section||BASE_DEFAULTS.activities);
    else if(route==='intern') setInternView(section||BASE_DEFAULTS.intern);
    else if(route==='physician-consult') setPhysicianView(section||BASE_DEFAULTS['physician-consult']);
    else if(route==='users') setUsersView(section||BASE_DEFAULTS.users);
    else if(route==='ot') setOtView(section,text(params.get('mode')),text(params.get('month')));
  }

  function currentOtMonth(){
    const st=S();
    const raw=st.otMenuMonthV369||st.otSourceMonthV241||st.otMoneyMonthV241||st.myDutyMonthFilter||'';
    return validMonth(raw)?String(raw).slice(0,7):'';
  }
  function currentSection(page){
    const st=S();
    if(page==='leave') return st.editingLeaveId?'form':(['form','history'].includes(st.v524LeaveView)?st.v524LeaveView:'form');
    if(page==='myProfile') return ['profile','requests'].includes(st.v524ProfileView)?st.v524ProfileView:'profile';
    if(page==='activities') return st.editingActivityId?'create':(['create','search'].includes(st.v524ActivityView)?st.v524ActivityView:'create');
    if(page==='internManagement') return ['add','mentor','registry','history'].includes(st.v524InternView)?st.v524InternView:'add';
    if(page==='physicianConsult') return ['daytime','oncall','override','list'].includes(st.v524PhysicianView)?st.v524PhysicianView:'daytime';
    if(page==='users') return ['manage','add'].includes(st.v524UsersView)?st.v524UsersView:'manage';
    if(page==='ot'){
      const id=text(st.otMenuV369)||(isAdminSafe()?'admin-duty':'staff-track');
      const map=isAdminSafe()?OT_ADMIN_ID_TO_SECTION:OT_STAFF_ID_TO_SECTION;
      return map[id]||(isAdminSafe()?'confirm-duty':'my-duty');
    }
    return '';
  }

  function baseHashFor(page){
    try{if(window.cnmiV515?.hashFor)return window.cnmiV515.hashFor(page);}catch(_){ }
    const fallback={
      leave:'leave',myProfile:'profile',activities:'activities',internManagement:'intern',
      physicianConsult:'physician-consult',users:'users',ot:'ot'
    };
    return `#/${fallback[page]||page||'dashboard'}`;
  }

  function canonicalHash(){
    const st=S(),page=text(st.page)||'dashboard';
    let base=baseHashFor(page);
    const q=base.indexOf('?');
    const route=q>=0?base.slice(0,q):base;
    const params=new URLSearchParams(q>=0?base.slice(q+1):'');
    const section=currentSection(page);
    if(section) params.set('section',section); else params.delete('section');
    if(page==='ot'){
      const month=currentOtMonth();if(month)params.set('month',month);else params.delete('month');
      if(text(st.otMenuV369)==='admin-extra'&&isAdminSafe()){
        const mode=['work','adjustment','activity'].includes(text(st.v527ExtraMode))?text(st.v527ExtraMode):'work';
        params.set('mode',mode);
      }else params.delete('mode');
    }else{
      params.delete('mode');
    }
    const qs=params.toString();
    return `${route}${qs?`?${qs}`:''}`;
  }

  let pendingPush=false;
  let pendingPreviousHash='';
  function markSubmenuNavigation(e){
    const t=e.target?.closest?.('[data-v523-ot-item],[data-v524-child-key],[data-v528-extra-mode]');
    if(!t) return;
    pendingPush=true;
    pendingPreviousHash=String(location.hash||'');
  }
  document.addEventListener('click',markSubmenuNavigation,true);

  function setCanonicalUrl({push=false}={}){
    const target=canonicalHash();
    const current=String(location.hash||'');
    if(current===target) return;
    try{
      if(push){
        /* V515's render wrapper may replace the current submenu URL with the base page
           just before we run. Restore the previous submenu entry first so Back works. */
        if(pendingPreviousHash&&pendingPreviousHash!==target&&current!==pendingPreviousHash){
          history.replaceState({cnmiV540:true},'',pendingPreviousHash);
        }
        if(String(location.hash||'')!==target) history.pushState({cnmiV540:true},'',target);
      }else{
        history.replaceState({cnmiV540:true},'',target);
      }
    }catch(_){
      location.hash=target;
    }
  }

  function titleForCurrent(){
    const {route,params}=parseHash();
    const section=text(params.get('section'));
    const label=TITLE_BY_URL[`${route}:${section}`];
    if(label) document.title=`${label} | Staff Planner`;
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v539-version-chip,.v535-version-chip,.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(!chip) return;
    chip.textContent='v540';
    chip.title='Submenu Deep-link Routing';
    chip.classList.add('v540-version-chip');
  }

  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'&&!previousRender.__v540Wrapped){
    const wrapped=function(){
      const out=previousRender.apply(this,arguments);
      const doPush=pendingPush;
      pendingPush=false;
      try{setCanonicalUrl({push:doPush});}catch(_){ }
      pendingPreviousHash='';
      try{titleForCurrent();decorateVersion();}catch(_){ }
      setTimeout(()=>{try{setCanonicalUrl({push:false});titleForCurrent();decorateVersion();}catch(_){ }},0);
      return out;
    };
    wrapped.__v540Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  function onHistoryNavigation(){
    pendingPush=false;pendingPreviousHash='';
    applyFromUrl();
    /* V515 applies page + loads data a few ms later. Re-apply section state after it. */
    setTimeout(()=>{applyFromUrl();try{if(S().profile&&typeof renderPage==='function')renderPage();}catch(_){ }},12);
  }
  window.addEventListener('hashchange',onHistoryNavigation);
  window.addEventListener('popstate',onHistoryNavigation);

  document.addEventListener('change',function(e){
    if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='otSourceMonthV241'){
      setTimeout(()=>setCanonicalUrl({push:false}),0);
    }
  },true);

  function start(){
    applyFromUrl();
    setTimeout(()=>{try{setCanonicalUrl({push:false});titleForCurrent();decorateVersion();}catch(_){ }},0);
    setTimeout(()=>{try{applyFromUrl();setCanonicalUrl({push:false});decorateVersion();}catch(_){ }},180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pageshow',()=>setTimeout(start,0));

  window.cnmiV540={version:VERSION,applyFromUrl,canonicalHash,setCanonicalUrl};
  console.info(`[${VERSION}] loaded`);
})();
