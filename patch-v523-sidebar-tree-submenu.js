/* CNMI Staff Planner V523 — Sidebar Tree Submenu
   Moves OT navigation out of page cards into the sidebar tree. UI/navigation only. */
(function(){
  'use strict';
  if(window.__CNMI_V523_SIDEBAR_SUBMENU__) return;
  window.__CNMI_V523_SIDEBAR_SUBMENU__=true;
  const VERSION='V523_SIDEBAR_TREE_SUBMENU';
  const SIDEBAR_OPEN_KEY='cnmi-sidebar-tree-open-id';
  function getOpenTree(){try{return sessionStorage.getItem(SIDEBAR_OPEN_KEY)||'';}catch(_){return '';} }
  function setOpenTree(id){try{if(id)sessionStorage.setItem(SIDEBAR_OPEN_KEY,id);else sessionStorage.removeItem(SIDEBAR_OPEN_KEY);}catch(_){} }
  function announceOpenTree(id){setOpenTree(id);try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id}}));}catch(_){} }

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return {};}
  }
  function isAdminSafe(){
    try{return typeof isAdmin==='function' && isAdmin();}catch(_){return false;}
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  const STAFF_ITEMS=[
    ['staff-track','ติดตามเวรของฉัน','track'],
    ['staff-confirm','ยืนยันวันอยู่เวร','confirm'],
    ['staff-extra','ขอ OT เพิ่ม / ปั่นเลือด','plus'],
    ['staff-list','รายการ OT ของฉัน','list'],
    ['staff-details','รายละเอียดเบิก','detail'],
    ['staff-summary','สรุปรายเดือน','summary']
  ];
  const ADMIN_ITEMS=[
    ['admin-duty','ยืนยันเวรแทนเจ้าหน้าที่','confirm'],
    ['admin-extra','ขอ OT เพิ่มแทนเจ้าหน้าที่','plus'],
    ['tracking','ติดตามเจ้าหน้าที่','track'],
    ['approve','อนุมัติ OT','approve'],
    ['summary','สรุป OT รายเดือน','summary'],
    ['admin-details','รายละเอียด OT เจ้าหน้าที่','detail'],
    ['export','Export HR','export'],
    ['history','ประวัติ Export','history']
  ];
  function items(){return isAdminSafe()?ADMIN_ITEMS:STAFF_ITEMS;}
  function validItem(id){return items().some(([x])=>x===id);}
  function defaultItem(){return isAdminSafe()?'admin-duty':'staff-track';}
  function activeItem(){
    const current=String(S()?.otMenuV369||'');
    return validItem(current)?current:defaultItem();
  }
  function groupFor(id){
    if(isAdminSafe()){
      if(['admin-duty','tracking'].includes(id)) return 'duty';
      if(['admin-extra','approve'].includes(id)) return 'ot';
      return 'report';
    }
    if(['staff-track','staff-confirm'].includes(id)) return 'duty';
    if(['staff-extra','staff-list'].includes(id)) return 'ot';
    return 'summary';
  }
  function icon(kind){
    const attrs='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      track:`<svg ${attrs}><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>`,
      confirm:`<svg ${attrs}><path d="M5 12.5 9.2 17 19 7"></path></svg>`,
      plus:`<svg ${attrs}><path d="M12 5v14M5 12h14"></path></svg>`,
      list:`<svg ${attrs}><path d="M9 6h10M9 12h10M9 18h10"></path><path d="M5 6h.01M5 12h.01M5 18h.01"></path></svg>`,
      detail:`<svg ${attrs}><rect x="4" y="3.5" width="16" height="17" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg>`,
      summary:`<svg ${attrs}><path d="M5 19V10M12 19V5M19 19v-7"></path></svg>`,
      approve:`<svg ${attrs}><circle cx="12" cy="12" r="8"></circle><path d="M8.5 12.2 11 14.7 15.8 9.8"></path></svg>`,
      export:`<svg ${attrs}><path d="M12 3v11"></path><path d="m8 10 4 4 4-4"></path><path d="M5 18h14"></path></svg>`,
      history:`<svg ${attrs}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"></path><path d="M4 4v4.5h4.5"></path><path d="M12 8v4l2.5 1.5"></path></svg>`
    };
    return map[kind]||map.list;
  }

  function submenuHtml(open){
    const active=activeItem();
    return `<div class="v523-nav-submenu ${open?'open':''}" data-v523-submenu aria-hidden="${open?'false':'true'}">
      ${items().map(([id,label,kind])=>`<button type="button" class="v523-subitem ${id===active && S().page==='ot'?'active':''}" data-v523-ot-item="${esc(id)}" aria-current="${id===active && S().page==='ot'?'page':'false'}"><span class="v523-branch-icon">${icon(kind)}</span><span>${esc(label)}</span></button>`).join('')}
    </div>`;
  }

  function decorateVersion(){
    const chip=document.querySelector('.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v523';chip.title='Sidebar tree submenu';chip.classList.add('v523-version-chip');}
  }

  function installTree(){
    decorateVersion();
    const nav=document.getElementById('mainNav');
    if(!nav) return;
    const otBtn=nav.querySelector('.nav-btn[data-page="ot"]');
    if(!otBtn) return;
    if(otBtn.closest('.v523-nav-tree')){
      refreshTree();
      return;
    }
    const wasOpen = S().page==='ot' || getOpenTree()==='ot';
    const tree=document.createElement('div');
    tree.className='v523-nav-tree';
    tree.dataset.v523Tree='ot';
    tree.innerHTML=`<button type="button" class="nav-btn v523-nav-parent ${S().page==='ot'?'active':''}" data-v523-submenu-toggle="ot" aria-expanded="${wasOpen?'true':'false'}">
      <span class="nav-emoji">⏱️</span><span class="v523-parent-label">ลงชื่ออยู่เวร / ขอ OT เพิ่ม</span><span class="v523-caret" aria-hidden="true">›</span>
    </button>${submenuHtml(wasOpen)}`;
    otBtn.replaceWith(tree);
  }

  function refreshTree(){
    const tree=document.querySelector('.v523-nav-tree');
    if(!tree) return;
    const parent=tree.querySelector('.v523-nav-parent');
    const sub=tree.querySelector('.v523-nav-submenu');
    const openId=getOpenTree();
    const shouldOpen = openId ? openId==='ot' : S().page==='ot';
    if(parent){
      parent.classList.toggle('active',S().page==='ot');
      parent.setAttribute('aria-expanded',shouldOpen?'true':'false');
    }
    if(sub){
      sub.classList.toggle('open',shouldOpen);
      sub.setAttribute('aria-hidden',shouldOpen?'false':'true');
      sub.querySelectorAll('[data-v523-ot-item]').forEach(btn=>{
        const active=S().page==='ot' && btn.dataset.v523OtItem===activeItem();
        btn.classList.toggle('active',active);
        btn.setAttribute('aria-current',active?'page':'false');
      });
    }
  }

  function compactOtTopCard(){
    const page=document.querySelector('.v369-ot-page');
    if(!page) return;
    page.classList.add('v523-sidebar-driven');
    const top=page.querySelector('.v369-ot-menu-card');
    if(top) top.classList.add('v523-month-only-card');
    const selected=activeItem();
    const g=groupFor(selected);
    S().otGroupV522=g;
  }

  function apply(){
    if(S().page==='ot' && !getOpenTree()) announceOpenTree('ot');
    installTree();
    refreshTree();
    compactOtTopCard();
  }

  const oldRenderNav=window.renderNav || (typeof renderNav==='function'?renderNav:null);
  if(oldRenderNav && !oldRenderNav.__v523Wrapped){
    const wrapped=function renderNavV523(){
      const result=oldRenderNav.apply(this,arguments);
      requestAnimationFrame(apply);
      return result;
    };
    wrapped.__v523Wrapped=true;
    try{window.renderNav=renderNav=wrapped;}catch(_){window.renderNav=wrapped;}
  }

  document.addEventListener('click',function(e){
    const toggle=e.target?.closest?.('[data-v523-submenu-toggle]');
    if(toggle){
      e.preventDefault();
      e.stopPropagation();
      const tree=toggle.closest('.v523-nav-tree');
      const sub=tree?.querySelector('.v523-nav-submenu');
      const open=toggle.getAttribute('aria-expanded')!=='true';
      toggle.setAttribute('aria-expanded',open?'true':'false');
      sub?.classList.toggle('open',open);
      sub?.setAttribute('aria-hidden',open?'false':'true');
      sessionStorage.setItem('cnmi-v523-ot-open',open?'1':'0');
      if(open) announceOpenTree('ot');
      else if(getOpenTree()==='ot') setOpenTree('');
      return;
    }
    const item=e.target?.closest?.('[data-v523-ot-item]');
    if(item){
      e.preventDefault();
      e.stopPropagation();
      const id=String(item.dataset.v523OtItem||'');
      if(!validItem(id)) return;
      S().otMenuV369=id;
      S().otGroupV522=groupFor(id);
      S().page='ot';
      sessionStorage.setItem('cnmi-v523-ot-open','1');
      announceOpenTree('ot');
      const sidebar=document.getElementById('sidebar');
      if(sidebar && window.matchMedia('(max-width:820px)').matches){
        sidebar.classList.remove('open');
        document.body.classList.remove('sidebar-open');
      }
      try{renderPage();}catch(_){try{window.renderPage?.();}catch(__){}}
      return;
    }
  },true);


  window.addEventListener('cnmi:sidebar-tree-open',function(e){
    const id=String(e?.detail?.id||'');
    if(id==='ot') return;
    const tree=document.querySelector('.v523-nav-tree');
    const parent=tree?.querySelector('.v523-nav-parent');
    const sub=tree?.querySelector('.v523-nav-submenu');
    parent?.setAttribute('aria-expanded','false');
    sub?.classList.remove('open');
    sub?.setAttribute('aria-hidden','true');
    try{sessionStorage.setItem('cnmi-v523-ot-open','0');}catch(_){}
  });

  let queued=false;
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  const start=()=>{
    apply();
    const nav=document.getElementById('mainNav');
    if(nav){
      new MutationObserver(muts=>{
        for(const m of muts){if(m.addedNodes?.length){queue();break;}}
      }).observe(nav,{childList:true,subtree:true});
    }
    const content=document.getElementById('pageContent');
    if(content){
      new MutationObserver(muts=>{
        for(const m of muts){if(m.addedNodes?.length){queue();break;}}
      }).observe(content,{childList:true,subtree:true});
    }
    window.addEventListener('hashchange',queue);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  window.cnmiV523={version:VERSION,apply,installTree};
  console.info(`[${VERSION}] loaded`);
})();
