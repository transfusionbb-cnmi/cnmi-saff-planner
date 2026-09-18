/* CNMI Staff Planner V522 — OT Submenu Mobile Navigation
   Presentation/navigation only. Re-groups the existing V369 OT menu into 3 logical groups
   without changing the existing OT/HR calculation, approval, export, or data flow. */
(function(){
  'use strict';
  if(window.__CNMI_V522_OT_SUBMENU__) return;
  window.__CNMI_V522_OT_SUBMENU__=true;
  const VERSION='V522_OT_SUBMENU_MOBILE_NAVIGATION';

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return {};}
  }
  function isAdminSafe(){
    try{return typeof isAdmin==='function' && isAdmin();}catch(_){return false;}
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const STAFF_GROUPS=[
    {id:'duty',title:'เวร',desc:'ติดตาม · ยืนยัน',icon:'clock',items:[
      {id:'staff-track',label:'ติดตามเวร'},
      {id:'staff-confirm',label:'ยืนยันวันอยู่เวร'}
    ]},
    {id:'ot',title:'OT',desc:'ขอเพิ่ม · รายการ',icon:'ot',items:[
      {id:'staff-extra',label:'ขอ OT เพิ่ม'},
      {id:'staff-list',label:'รายการ OT ของฉัน'}
    ]},
    {id:'summary',title:'สรุป',desc:'รายละเอียด · รายเดือน',icon:'chart',items:[
      {id:'staff-details',label:'รายละเอียดเบิก'},
      {id:'staff-summary',label:'สรุปรายเดือน'}
    ]}
  ];

  const ADMIN_GROUPS=[
    {id:'duty',title:'เวรเจ้าหน้าที่',desc:'ยืนยัน · ติดตาม',icon:'clock',items:[
      {id:'admin-duty',label:'ยืนยันวันอยู่เวร'},
      {id:'tracking',label:'ติดตามเจ้าหน้าที่'}
    ]},
    {id:'ot',title:'จัดการ OT',desc:'ขอเพิ่ม · อนุมัติ',icon:'ot',items:[
      {id:'admin-extra',label:'ขอ OT เพิ่ม'},
      {id:'approve',label:'อนุมัติ OT'}
    ]},
    {id:'report',title:'รายงาน / HR',desc:'สรุป · Export',icon:'chart',items:[
      {id:'summary',label:'สรุป OT'},
      {id:'admin-details',label:'รายละเอียดเจ้าหน้าที่'},
      {id:'export',label:'Export HR'},
      {id:'history',label:'ประวัติ Export'}
    ]}
  ];

  function groups(){return isAdminSafe()?ADMIN_GROUPS:STAFF_GROUPS;}
  function groupForItem(itemId){return groups().find(g=>g.items.some(i=>i.id===itemId))||groups()[0];}
  function validGroup(id){return groups().some(g=>g.id===id);}

  function iconSvg(kind){
    const common='width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if(kind==='clock') return `<svg ${common}><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5l3.5 2"></path></svg>`;
    if(kind==='ot') return `<svg ${common}><path d="M7 3.5v17M17 3.5v17"></path><path d="M19.5 7.5H10.5a3 3 0 0 0 0 6h3a3 3 0 0 1 0 6H4.5"></path></svg>`;
    return `<svg ${common}><path d="M4 19V10"></path><path d="M10 19V5"></path><path d="M16 19v-8"></path><path d="M22 19V3"></path></svg>`;
  }

  function groupTabsHtml(selected){
    return `<div class="v522-group-tabs" role="tablist" aria-label="กลุ่มเมนูเวรและ OT">${groups().map(g=>`<button type="button" class="v522-group-btn ${g.id===selected?'active':''}" data-v522-ot-group="${esc(g.id)}" role="tab" aria-selected="${g.id===selected?'true':'false'}"><span class="v522-group-icon">${iconSvg(g.icon)}</span><span class="v522-group-copy"><b>${esc(g.title)}</b><small>${esc(g.desc)}</small></span></button>`).join('')}</div>`;
  }

  function submenuHtml(group,activeItem){
    return `<div class="v522-submenu" role="tablist" aria-label="เมนูย่อย ${esc(group.title)}">${group.items.map(i=>`<button type="button" class="v522-submenu-btn ${i.id===activeItem?'active':''}" data-v369-ot-menu="${esc(i.id)}" role="tab" aria-selected="${i.id===activeItem?'true':'false'}">${esc(i.label)}</button>`).join('')}</div>`;
  }

  function activeItemFromMenu(menu){
    return String(menu.querySelector('.v369-menu-btn.active,[data-v369-ot-menu][aria-selected="true"]')?.getAttribute('data-v369-ot-menu') || S()?.otMenuV369 || '');
  }

  function updateTopCopy(page){
    const head=page.querySelector('.v369-ot-menu-head');
    if(!head) return;
    const h=head.querySelector('h3');
    if(h) h.textContent=isAdminSafe()?'เวร / OT / HR':'เวร / OT ของฉัน';
    const hint=head.querySelector('.hint');
    if(hint){
      hint.textContent=isAdminSafe()?'เลือกเดือน แล้วเลือกกลุ่มงาน':'เลือกเดือน แล้วเลือกสิ่งที่ต้องการทำ';
      hint.classList.add('v522-top-hint');
    }
    const month=head.querySelector('.v369-month-label');
    if(month){
      for(const node of month.childNodes){
        if(node.nodeType===Node.TEXT_NODE && String(node.nodeValue||'').trim()){
          node.nodeValue='เดือน ';
          break;
        }
      }
    }
  }

  function renderGroupedMenu(page,forcedGroup){
    if(!page) return;
    const menu=page.querySelector('.v369-menu-grid');
    if(!menu) return;
    if(menu.dataset.v522Grouped==='1' && !forcedGroup){
      updateTopCopy(page);
      return;
    }
    const activeItem=activeItemFromMenu(menu);
    const activeGroup=groupForItem(activeItem);
    const stored=String(forcedGroup || S()?.otGroupV522 || '');
    const selected=validGroup(stored)?stored:activeGroup.id;
    const selectedGroup=groups().find(g=>g.id===selected)||activeGroup;
    S().otGroupV522=selectedGroup.id;

    menu.classList.add('v522-grouped-menu');
    menu.dataset.v522Grouped='1';
    menu.innerHTML=groupTabsHtml(selectedGroup.id)+submenuHtml(selectedGroup,activeItem);

    const content=page.querySelector('.v369-ot-content');
    const browsingDifferent=selectedGroup.id!==activeGroup.id;
    if(content){
      content.classList.toggle('v522-await-submenu',browsingDifferent);
      let chooser=page.querySelector('.v522-submenu-chooser');
      if(browsingDifferent){
        if(!chooser){
          chooser=document.createElement('div');
          chooser.className='v522-submenu-chooser';
          content.parentNode.insertBefore(chooser,content);
        }
        chooser.innerHTML=`<span class="v522-chooser-icon">${iconSvg(selectedGroup.icon)}</span><span><b>${esc(selectedGroup.title)}</b><small>เลือกเมนูย่อยด้านบนเพื่อเปิดรายการ</small></span>`;
      }else if(chooser){
        chooser.remove();
      }
    }
    updateTopCopy(page);
  }

  function decorateVersion(){
    const chip=document.querySelector('.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v522';chip.title='OT submenu mobile navigation';chip.classList.add('v522-version-chip');}
  }

  function apply(root=document){
    decorateVersion();
    const page=(root.matches?.('.v369-ot-page')?root:root.querySelector?.('.v369-ot-page')) || document.querySelector('.v369-ot-page');
    if(page) renderGroupedMenu(page);
  }

  document.addEventListener('click',function(e){
    const groupBtn=e.target?.closest?.('[data-v522-ot-group]');
    if(groupBtn){
      e.preventDefault();
      e.stopPropagation();
      const id=String(groupBtn.getAttribute('data-v522-ot-group')||'');
      if(!validGroup(id)) return;
      S().otGroupV522=id;
      const page=groupBtn.closest('.v369-ot-page');
      renderGroupedMenu(page,id);
      const submenu=page?.querySelector('.v522-submenu');
      if(submenu && window.matchMedia('(max-width:760px)').matches){
        requestAnimationFrame(()=>submenu.scrollIntoView({block:'nearest',behavior:'smooth'}));
      }
      return;
    }
    const sub=e.target?.closest?.('[data-v369-ot-menu]');
    if(sub){
      const item=String(sub.getAttribute('data-v369-ot-menu')||'');
      const g=groupForItem(item);
      if(g) S().otGroupV522=g.id;
    }
  },true);

  let queued=false;
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply(document);});
  }

  const start=()=>{
    apply(document);
    const target=document.getElementById('pageContent')||document.body;
    const observer=new MutationObserver(mutations=>{
      for(const m of mutations){
        if(m.addedNodes?.length){queue();break;}
      }
    });
    observer.observe(target,{childList:true,subtree:true});
    window.addEventListener('hashchange',queue);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  window.cnmiV522={version:VERSION,apply,renderGroupedMenu};
  console.info(`[${VERSION}] loaded`);
})();
