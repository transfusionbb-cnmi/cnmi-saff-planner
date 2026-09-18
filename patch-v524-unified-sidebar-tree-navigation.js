/* CNMI Staff Planner V524 — Unified Sidebar Tree Navigation
 * Extends the V523 sidebar-tree pattern across the app where a screen is really
 * a collection of separate tasks/pages. Filters and data-view controls remain in-page.
 * UI/navigation only. No DB/schema/business-rule changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V524_UNIFIED_TREE_NAV__) return;
  window.__CNMI_V524_UNIFIED_TREE_NAV__=true;
  const VERSION='V524_UNIFIED_SIDEBAR_TREE_NAVIGATION';
  const SIDEBAR_OPEN_KEY='cnmi-sidebar-tree-open-id';
  function getOpenTree(){try{return sessionStorage.getItem(SIDEBAR_OPEN_KEY)||'';}catch(_){return '';} }
  function setOpenTree(id){try{if(id)sessionStorage.setItem(SIDEBAR_OPEN_KEY,id);else sessionStorage.removeItem(SIDEBAR_OPEN_KEY);}catch(_){} }
  function announceOpenTree(id){setOpenTree(id);try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id}}));}catch(_){} }

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return window.state||{};}
  }
  function isAdminSafe(){
    try{return typeof isAdmin==='function' && isAdmin();}catch(_){return false;}
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function page(){return String(S()?.page||'');}
  function ssGet(key,fallback=''){
    try{return sessionStorage.getItem(key)||fallback;}catch(_){return fallback;}
  }
  function ssSet(key,value){try{sessionStorage.setItem(key,String(value));}catch(_){}}
  function closeMobileSidebar(){
    if(!window.matchMedia('(max-width:820px)').matches) return;
    const sidebar=document.getElementById('sidebar');
    sidebar?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }
  function icon(kind){
    const attrs='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      add:`<svg ${attrs}><path d="M12 5v14M5 12h14"></path></svg>`,
      search:`<svg ${attrs}><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>`,
      history:`<svg ${attrs}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"></path><path d="M4 4v4.5h4.5"></path><path d="M12 8v4l2.5 1.5"></path></svg>`,
      list:`<svg ${attrs}><path d="M9 6h10M9 12h10M9 18h10"></path><path d="M5 6h.01M5 12h.01M5 18h.01"></path></svg>`,
      calendar:`<svg ${attrs}><rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4M16 3v4M4 9h16"></path></svg>`,
      trade:`<svg ${attrs}><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5"></path><path d="M17 7v4M7 17v-4"></path></svg>`,
      day:`<svg ${attrs}><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 9h8M8 13h4"></path></svg>`,
      month:`<svg ${attrs}><rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M7 3v4M17 3v4M3.5 9h17M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"></path></svg>`,
      check:`<svg ${attrs}><path d="M5 12.5 9.2 17 19 7"></path></svg>`,
      pending:`<svg ${attrs}><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>`,
      person:`<svg ${attrs}><circle cx="12" cy="8" r="3"></circle><path d="M5.5 19c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5"></path></svg>`,
      settings:`<svg ${attrs}><circle cx="12" cy="12" r="3"></circle><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6a8 8 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A8 8 0 0 0 10.4 18l.3 2.6h4L15 18a8 8 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5c.1-.4.1-.7.1-1.2Z"></path></svg>`,
      trainee:`<svg ${attrs}><path d="m3 9 9-5 9 5-9 5-9-5Z"></path><path d="M7 12.5V17c3 2 7 2 10 0v-4.5"></path></svg>`
    };
    return map[kind]||map.list;
  }

  function currentLeaveView(){
    if(S()?.editingLeaveId) return 'form';
    return String(S()?.v524LeaveView||ssGet('cnmi-v524-leave-view','form')||'form');
  }
  function currentActivityView(){
    if(S()?.editingActivityId) return 'create';
    return String(S()?.v524ActivityView||ssGet('cnmi-v524-activity-view','create')||'create');
  }
  function currentInternView(){
    return String(S()?.v524InternView||ssGet('cnmi-v524-intern-view','add')||'add');
  }
  function currentProfileView(){
    return String(S()?.v524ProfileView||ssGet('cnmi-v524-profile-view','profile')||'profile');
  }
  function currentUsersView(){
    return String(S()?.v524UsersView||ssGet('cnmi-v524-users-view','manage')||'manage');
  }
  function currentPhysicianView(){
    return String(S()?.v524PhysicianView||ssGet('cnmi-v524-physician-view','daytime')||'daytime');
  }

  function defs(){
    const admin=isAdminSafe();
    return [
      {
        id:'leave', anchor:'leave', members:['leave'], label:'ลา / ไม่รับเวร', emoji:'🌿',
        active:()=>page()==='leave',
        children:[
          {key:'leave-form',label:'บันทึกลา / ไม่รับเวร',kind:'add',page:'leave',viewKey:'leave',view:'form'},
          {key:'leave-history',label:admin?'รายการลาของทุกคน':'ประวัติการลาของฉัน',kind:'history',page:'leave',viewKey:'leave',view:'history'}
        ]
      },
      {
        id:'profile', anchor:'myProfile', members:['myProfile'], label:'ข้อมูลส่วนตัว', emoji:'👤',
        active:()=>page()==='myProfile',
        children:[
          {key:'profile-main',label:'ข้อมูลและขอแก้ไข',kind:'person',page:'myProfile',viewKey:'profile',view:'profile'},
          {key:'profile-history',label:'คำขอล่าสุดของฉัน',kind:'history',page:'myProfile',viewKey:'profile',view:'requests'}
        ]
      },
      {
        id:'activities', anchor:'activities', members:['activities','myTraining'], label:'กิจกรรม / อบรม', emoji:'🗂️',
        active:()=>['activities','myTraining'].includes(page()),
        children:[
          {key:'activity-create',label:'เพิ่มกิจกรรม',kind:'add',page:'activities',viewKey:'activity',view:'create'},
          {key:'activity-search',label:'ค้นหากิจกรรม',kind:'search',page:'activities',viewKey:'activity',view:'search'},
          {key:'my-training',label:'รายการอบรมของฉัน',kind:'list',page:'myTraining',requiresNav:'myTraining'}
        ]
      },
      {
        id:'roster', anchor:'schedule', members:['schedule','tradeRequests'], label:'ตารางเวร', emoji:'📋',
        active:()=>['schedule','tradeRequests'].includes(page()),
        children:[
          {key:'roster-view',label:'ตารางเวรประจำเดือน',kind:'calendar',page:'schedule',requiresNav:'schedule'},
          {key:'roster-trade',label:'คำขอขายเวร',kind:'trade',page:'tradeRequests',requiresNav:'tradeRequests'}
        ]
      },
      {
        id:'positions-staff', anchor:'positionMonthView', members:['positionMonthView','positions'], label:'ตำแหน่งกลางวัน', emoji:'🧪',
        active:()=>['positionMonthView','positions'].includes(page()),
        children:[
          {key:'positions-day',label:'รายวัน',kind:'day',page:'positions',requiresNav:'positions'},
          {key:'positions-month',label:'รายเดือน',kind:'month',page:'positionMonthView',requiresNav:'positionMonthView'}
        ]
      },
      {
        id:'hr', anchor:'hr', members:['hr','hrSummary'], label:'ตรวจสอบ HR', emoji:'🧾', adminOnly:true,
        active:()=>['hr','hrSummary'].includes(page()),
        children:[
          {key:'hr-pending',label:'รอตรวจสอบ',kind:'pending',page:'hr',requiresNav:'hr'},
          {key:'hr-done',label:'ตรวจสอบแล้ว',kind:'check',page:'hrSummary',requiresNav:'hrSummary'}
        ]
      },
      {
        id:'positions-admin', anchor:'positionMonth', members:['positionMonth','positionManagement','internManagement'], label:'ตำแหน่ง / Intern', emoji:'🧩', adminOnly:true,
        active:()=>['positionMonth','positionManagement','internManagement'].includes(page()),
        children:[
          {key:'position-plan',label:'จัดตำแหน่งรายเดือน',kind:'month',page:'positionMonth',requiresNav:'positionMonth'},
          {key:'position-master',label:'จัดการตำแหน่งหลัก',kind:'settings',page:'positionManagement',requiresNav:'positionManagement'},
          {key:'intern-add',label:'เพิ่มรายชื่อผู้ฝึก',kind:'add',page:'internManagement',viewKey:'intern',view:'add',requiresNav:'internManagement'},
          {key:'intern-mentor',label:'กำหนดช่วงพี่เลี้ยง',kind:'person',page:'internManagement',viewKey:'intern',view:'mentor',requiresNav:'internManagement'},
          {key:'intern-list',label:'ทะเบียนผู้ฝึก',kind:'trainee',page:'internManagement',viewKey:'intern',view:'registry',requiresNav:'internManagement'},
          {key:'intern-history',label:'ประวัติพี่เลี้ยง',kind:'history',page:'internManagement',viewKey:'intern',view:'history',requiresNav:'internManagement'}
        ]
      },
      {
        id:'physician', anchor:'physicianConsult', members:['physicianConsult'], label:'ตารางแพทย์ Consult', emoji:'🩺', adminOnly:true,
        active:()=>page()==='physicianConsult',
        children:[
          {key:'physician-daytime',label:'ในเวลา จ.–ศ.',kind:'calendar',page:'physicianConsult',viewKey:'physician',view:'daytime'},
          {key:'physician-oncall',label:'นอกเวลา / วันหยุด',kind:'pending',page:'physicianConsult',viewKey:'physician',view:'oncall'},
          {key:'physician-override',label:'แก้เฉพาะวัน',kind:'settings',page:'physicianConsult',viewKey:'physician',view:'override'},
          {key:'physician-list',label:'รายการที่บันทึก',kind:'list',page:'physicianConsult',viewKey:'physician',view:'list'}
        ]
      },
      {
        id:'users', anchor:'users', members:['users'], label:'ผู้ใช้งานและสิทธิ์', emoji:'👥', adminOnly:true,
        active:()=>page()==='users',
        children:[
          {key:'users-manage',label:'จัดการเจ้าหน้าที่',kind:'person',page:'users',viewKey:'users',view:'manage'},
          {key:'users-add',label:'เพิ่มผู้ใช้งานใหม่',kind:'add',page:'users',viewKey:'users',view:'add'}
        ]
      },
      {
        id:'profile-requests', anchor:'profileRequests', members:['profileRequests','profileRequestSummary'], label:'แก้ไขข้อมูล Staff', emoji:'📝', adminOnly:true,
        active:()=>['profileRequests','profileRequestSummary'].includes(page()),
        children:[
          {key:'profile-pending',label:'คำขอรออนุมัติ',kind:'pending',page:'profileRequests',requiresNav:'profileRequests'},
          {key:'profile-history',label:'ประวัติคำขอ',kind:'history',page:'profileRequestSummary',requiresNav:'profileRequestSummary'}
        ]
      }
    ].filter(d=>!d.adminOnly||admin);
  }

  function navHas(id){return !!document.querySelector(`#mainNav .nav-btn[data-page="${CSS.escape(id)}"]`);}
  function childAvailable(child){return !child.requiresNav || navHas(child.requiresNav);}
  function activeChild(def,child){
    if(page()!==child.page) return false;
    if(child.viewKey==='leave') return currentLeaveView()===child.view;
    if(child.viewKey==='activity') return currentActivityView()===child.view;
    if(child.viewKey==='intern') return currentInternView()===child.view;
    if(child.viewKey==='profile') return currentProfileView()===child.view;
    if(child.viewKey==='users') return currentUsersView()===child.view;
    if(child.viewKey==='physician') return currentPhysicianView()===child.view;
    return true;
  }
  function openKey(id){return `cnmi-v524-tree-${id}-open`;}
  function shouldOpen(def){
    const activeDef=defs().find(d=>!!d.active?.());
    if(activeDef) return activeDef.id===def.id;
    return getOpenTree()===`v524:${def.id}`;
  }

  function treeHtml(def,children){
    const open=shouldOpen(def);
    return `<button type="button" class="nav-btn v524-nav-parent ${def.active?.()?'active':''}" data-v524-tree-toggle="${esc(def.id)}" aria-expanded="${open?'true':'false'}">
      <span class="nav-emoji">${def.emoji}</span><span class="v524-parent-label">${esc(def.label)}</span><span class="v524-caret" aria-hidden="true">›</span>
    </button>
    <div class="v524-nav-submenu ${open?'open':''}" data-v524-tree-submenu="${esc(def.id)}" aria-hidden="${open?'false':'true'}">
      ${children.map(c=>`<button type="button" class="v524-subitem ${activeChild(def,c)?'active':''}" data-v524-tree-item="${esc(def.id)}" data-v524-child-key="${esc(c.key)}" aria-current="${activeChild(def,c)?'page':'false'}"><span class="v524-branch-icon">${icon(c.kind)}</span><span>${esc(c.label)}</span></button>`).join('')}
    </div>`;
  }

  function installTree(def){
    const nav=document.getElementById('mainNav');
    if(!nav) return;
    let existing=nav.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(def.id)}"]`);
    if(existing){refreshTree(def,existing);return;}
    const buttons=def.members.map(id=>nav.querySelector(`.nav-btn[data-page="${CSS.escape(id)}"]`)).filter(Boolean);
    const anchor=nav.querySelector(`.nav-btn[data-page="${CSS.escape(def.anchor)}"]`)||buttons[0];
    const children=def.children.filter(childAvailable);
    if(!anchor || children.length<2) return;
    const tree=document.createElement('div');
    tree.className='v524-nav-tree';
    tree.dataset.v524Tree=def.id;
    tree.innerHTML=treeHtml(def,children);
    anchor.replaceWith(tree);
    buttons.filter(b=>b!==anchor).forEach(b=>b.remove());
  }

  function refreshTree(def,tree){
    const parent=tree.querySelector('.v524-nav-parent');
    const sub=tree.querySelector('.v524-nav-submenu');
    const open=shouldOpen(def);
    parent?.classList.toggle('active',!!def.active?.());
    parent?.setAttribute('aria-expanded',open?'true':'false');
    sub?.classList.toggle('open',open);
    sub?.setAttribute('aria-hidden',open?'false':'true');
    sub?.querySelectorAll('[data-v524-child-key]').forEach(btn=>{
      const c=def.children.find(x=>x.key===btn.dataset.v524ChildKey);
      const active=!!c&&activeChild(def,c);
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-current',active?'page':'false');
    });
  }

  function decorateVersion(){
    const chip=document.querySelector('.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v524';chip.title='Unified sidebar tree navigation';chip.classList.add('v524-version-chip');}
  }

  function applyLeaveSubview(){
    if(page()!=='leave') return;
    const form=document.getElementById('leaveForm');
    const formCard=form?.closest('.card');
    const listCard=document.querySelector('#pageContent .leave-list-card');
    if(!formCard||!listCard) return;
    const grid=formCard.parentElement;
    if(!grid) return;
    const view=currentLeaveView();
    S().v524LeaveView=view;
    grid.classList.add('v524-single-view-layout','v524-leave-layout');
    formCard.classList.add('v524-leave-form-panel');
    listCard.classList.add('v524-leave-history-panel');
    formCard.classList.toggle('v524-panel-hidden',view!=='form');
    listCard.classList.toggle('v524-panel-hidden',view!=='history');
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='history'?(isAdminSafe()?'รายการลาและไม่รับเวรของทุกคน':'ประวัติลาและไม่รับเวรของฉัน'):'บันทึกหรือแก้ไขรายการลา / ไม่รับเวร';
  }

  function applyActivitySubview(){
    if(page()!=='activities') return;
    const form=document.getElementById('activityForm');
    const formCard=form?.closest('.card');
    const layout=formCard?.parentElement?.classList?.contains('v397-activities-layout')?formCard.parentElement:document.querySelector('#pageContent .v397-activities-layout');
    const listCard=layout?.querySelector('.activity-list-card,.v397-all-activities');
    if(!layout||!formCard||!listCard||formCard===listCard) return;
    const view=currentActivityView();
    S().v524ActivityView=view;
    layout.classList.add('v524-single-view-layout','v524-activity-layout');
    formCard.classList.add('v524-activity-create-panel');
    listCard.classList.add('v524-activity-search-panel');
    formCard.classList.toggle('v524-panel-hidden',view!=='create');
    listCard.classList.toggle('v524-panel-hidden',view!=='search');
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='search'?'ค้นหา ดู และแก้ไขกิจกรรมย้อนหลัง':'เพิ่มหรือแก้ไขกิจกรรมหน่วยงาน';
  }

  function applyProfileSubview(){
    if(page()!=='myProfile') return;
    const form=document.getElementById('profileChangeForm');
    const main=form?.closest('.card');
    const root=main?.parentElement;
    if(!root||!main) return;
    const cards=[...root.children].filter(el=>el.classList?.contains('card'));
    const requests=cards.find(card=>card!==main && /คำขอล่าสุดของฉัน/.test(String(card.textContent||'')));
    if(!requests) return;
    const view=currentProfileView();S().v524ProfileView=view;
    root.classList.add('v524-single-view-layout','v524-profile-layout');
    main.classList.add('v524-profile-main-panel');requests.classList.add('v524-profile-requests-panel');
    main.classList.toggle('v524-panel-hidden',view!=='profile');
    requests.classList.toggle('v524-panel-hidden',view!=='requests');
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='requests'?'ติดตามคำขอแก้ไขข้อมูลของฉัน':'ดูข้อมูลและส่งคำขอแก้ไข';
  }

  function applyUsersSubview(){
    if(page()!=='users') return;
    const root=document.querySelector('#pageContent .users-page-v49');
    if(!root) return;
    const addPanel=root.querySelector('.v479-new-user-panel');
    const managePanels=[...root.children].filter(el=>el.classList?.contains('card') && el!==addPanel);
    if(!addPanel||!managePanels.length) return;
    const view=currentUsersView();S().v524UsersView=view;
    root.classList.add('v524-users-layout');
    managePanels.forEach(el=>el.classList.toggle('v524-panel-hidden',view!=='manage'));
    addPanel.classList.toggle('v524-panel-hidden',view!=='add');
    if(view==='add'){
      const details=addPanel.querySelector('details.add-user-details');if(details) details.open=true;
    }
    const subtitle=document.getElementById('pageSubtitle');
    if(subtitle) subtitle.textContent=view==='add'?'สร้างบัญชีเจ้าหน้าที่ใหม่':'แก้ไขข้อมูล สิทธิ์ และสถานะเจ้าหน้าที่';
  }

  function applyPhysicianSubview(){
    if(page()!=='physicianConsult') return;
    const root=document.querySelector('#pageContent .v452-admin-page');
    if(!root) return;
    const view=currentPhysicianView();S().v524PhysicianView=view;
    root.classList.add('v524-physician-single-view');
    const day=root.querySelector('#v452DaytimeForm');
    const oncall=root.querySelector('#v452OncallForm');
    const override=root.querySelector('#v452OverrideForm');
    const list=[...root.querySelectorAll(':scope > .card')].find(card=>/รายการที่บันทึกแล้ว/.test(String(card.textContent||'')));
    const panels={daytime:day,oncall,override,list};
    Object.entries(panels).forEach(([key,el])=>el?.classList.toggle('v524-panel-hidden',key!==view));
    const formGrid=root.querySelector('.v452-form-grid');
    if(formGrid){
      formGrid.classList.add('v524-physician-grid');
      formGrid.classList.toggle('v524-grid-hidden',!['daytime','oncall'].includes(view));
    }
    const intro=root.querySelector('.v452-intro');
    if(intro) intro.classList.add('v524-physician-intro');
    const subtitle=document.getElementById('pageSubtitle');
    const labels={daytime:'กำหนดแพทย์ในเวลา จ.–ศ.',oncall:'กำหนดแพทย์นอกเวลา / วันหยุด',override:'แก้ตารางแพทย์เฉพาะวัน',list:'รายการตารางแพทย์ที่บันทึกแล้ว'};
    if(subtitle) subtitle.textContent=labels[view]||'ตารางแพทย์ Consult';
  }

  function applyInternSubview(){
    if(page()!=='internManagement') return;
    const root=document.querySelector('#pageContent .v273-intern-page');
    if(!root) return;
    const view=currentInternView();
    S().v524InternView=view;
    root.classList.add('v524-intern-single-view');
    const cards=[...root.querySelectorAll('.card')];
    const map=[];
    cards.forEach(card=>{
      let key='';
      if(card.querySelector('#v273TraineeDirectoryForm')) key='add';
      else if(card.querySelector('#v273TrainingRangeForm')) key='mentor';
      else {
        const title=String(card.querySelector('h2,h3')?.textContent||'').trim();
        if(/ทะเบียนน้องใหม่|ทะเบียน.*Intern|ทะเบียนผู้ฝึก/i.test(title)) key='registry';
        else if(/ประวัติช่วงพี่เลี้ยง|ประวัติ.*พี่เลี้ยง/i.test(title)) key='history';
      }
      if(key){card.dataset.v524InternPanel=key;map.push([card,key]);}
    });
    map.forEach(([card,key])=>card.classList.toggle('v524-panel-hidden',key!==view));
    [...root.querySelectorAll('.grid.grid-2')].forEach(grid=>{
      const relevant=[...grid.children].filter(el=>el.matches?.('[data-v524-intern-panel]'));
      if(!relevant.length) return;
      const hasActive=relevant.some(el=>!el.classList.contains('v524-panel-hidden'));
      grid.classList.add('v524-intern-grid');
      grid.classList.toggle('v524-grid-hidden',!hasActive);
    });
    const subtitle=document.getElementById('pageSubtitle');
    const labels={add:'เพิ่มรายชื่อผู้ฝึก',mentor:'กำหนดช่วงพี่เลี้ยง',registry:'ทะเบียนน้องใหม่ / Intern',history:'ประวัติช่วงพี่เลี้ยง'};
    if(subtitle) subtitle.textContent=labels[view]||'จัดการน้องใหม่ / Intern';
  }

  function applyPanels(){
    applyLeaveSubview();
    applyProfileSubview();
    applyActivitySubview();
    applyInternSubview();
    applyUsersSubview();
    applyPhysicianSubview();
  }

  function apply(){
    decorateVersion();
    const activeDef=defs().find(d=>!!d.active?.());
    if(activeDef && getOpenTree()!==`v524:${activeDef.id}`) announceOpenTree(`v524:${activeDef.id}`);
    defs().forEach(installTree);
    defs().forEach(def=>{
      const tree=document.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(def.id)}"]`);
      if(tree) refreshTree(def,tree);
    });
    applyPanels();
  }

  function setSubview(child){
    if(child.viewKey==='leave'){
      S().v524LeaveView=child.view;ssSet('cnmi-v524-leave-view',child.view);
    }else if(child.viewKey==='activity'){
      S().v524ActivityView=child.view;ssSet('cnmi-v524-activity-view',child.view);
    }else if(child.viewKey==='intern'){
      S().v524InternView=child.view;ssSet('cnmi-v524-intern-view',child.view);
    }else if(child.viewKey==='profile'){
      S().v524ProfileView=child.view;ssSet('cnmi-v524-profile-view',child.view);
    }else if(child.viewKey==='users'){
      S().v524UsersView=child.view;ssSet('cnmi-v524-users-view',child.view);
    }else if(child.viewKey==='physician'){
      S().v524PhysicianView=child.view;ssSet('cnmi-v524-physician-view',child.view);
    }
  }
  function navigateChild(def,child){
    setSubview(child);
    ssSet(openKey(def.id),'1');
    announceOpenTree(`v524:${def.id}`);
    closeMobileSidebar();
    const same=page()===child.page;
    if(same){
      try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){window.renderPage?.();}
      return;
    }
    try{
      if(window.cnmiV515?.navigate){window.cnmiV515.navigate(child.page);return;}
    }catch(_){ }
    S().page=child.page;
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(_){window.renderPage?.();}
  }

  document.addEventListener('click',function(e){
    const toggle=e.target?.closest?.('[data-v524-tree-toggle]');
    if(toggle){
      e.preventDefault();e.stopPropagation();
      const id=String(toggle.dataset.v524TreeToggle||'');
      const tree=toggle.closest('.v524-nav-tree');
      const sub=tree?.querySelector('.v524-nav-submenu');
      const open=toggle.getAttribute('aria-expanded')!=='true';
      toggle.setAttribute('aria-expanded',open?'true':'false');
      sub?.classList.toggle('open',open);
      sub?.setAttribute('aria-hidden',open?'false':'true');
      ssSet(openKey(id),open?'1':'0');
      if(open) announceOpenTree(`v524:${id}`);
      else if(getOpenTree()===`v524:${id}`) setOpenTree('');
      return;
    }
    const item=e.target?.closest?.('[data-v524-child-key]');
    if(item){
      e.preventDefault();e.stopPropagation();
      const def=defs().find(d=>d.id===item.dataset.v524TreeItem);
      const child=def?.children.find(c=>c.key===item.dataset.v524ChildKey);
      if(def&&child) navigateChild(def,child);
    }
  },true);


  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    const openId=String(e?.detail?.id||'');
    defs().forEach(def=>{
      const own=`v524:${def.id}`;
      if(openId===own) return;
      const tree=document.querySelector(`.v524-nav-tree[data-v524-tree="${CSS.escape(def.id)}"]`);
      const parent=tree?.querySelector('.v524-nav-parent');
      const sub=tree?.querySelector('.v524-nav-submenu');
      parent?.setAttribute('aria-expanded','false');
      sub?.classList.remove('open');
      sub?.setAttribute('aria-hidden','true');
      ssSet(openKey(def.id),'0');
    });
  });

  const oldRenderNav=window.renderNav || (typeof renderNav==='function'?renderNav:null);
  if(oldRenderNav && !oldRenderNav.__v524Wrapped){
    const wrapped=function renderNavV524(){
      const out=oldRenderNav.apply(this,arguments);
      requestAnimationFrame(apply);
      return out;
    };
    wrapped.__v524Wrapped=true;
    try{window.renderNav=renderNav=wrapped;}catch(_){window.renderNav=wrapped;}
  }

  const oldRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(oldRenderPage && !oldRenderPage.__v524Wrapped){
    const wrapped=function renderPageV524(){
      const out=oldRenderPage.apply(this,arguments);
      requestAnimationFrame(apply);
      return out;
    };
    wrapped.__v524Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  let queued=false;
  function queue(){
    if(queued) return;queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  const start=()=>{
    apply();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(muts=>{for(const m of muts){if(m.addedNodes?.length){queue();break;}}}).observe(nav,{childList:true,subtree:true});
    const content=document.getElementById('pageContent');
    if(content)new MutationObserver(muts=>{for(const m of muts){if(m.addedNodes?.length){queue();break;}}}).observe(content,{childList:true,subtree:true});
    window.addEventListener('hashchange',queue);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV524={version:VERSION,apply};
  console.info(`[${VERSION}] loaded`);
})();
