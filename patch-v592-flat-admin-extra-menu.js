/* CNMI Staff Planner V592 — Flat Admin Extra OT Menu
 * Replaces the nested Admin "ขอ OT เพิ่มแทนเจ้าหน้าที่" branch with 3 direct menu items:
 *  1) ขอ OT เพิ่มแทนเจ้าหน้าที่ตามจริง
 *  2) แก้ไข OT ตกเบิก / ลดเบิกเกิน
 *  3) ขอ OT สำหรับประชุม / กิจกรรมร่วม
 * Navigation/UI only. Existing V527/V528/V573 OT logic remains unchanged.
 */
(function(){
  'use strict';
  if(window.__CNMI_V592_FLAT_ADMIN_EXTRA_MENU__) return;
  window.__CNMI_V592_FLAT_ADMIN_EXTRA_MENU__=true;
  const VERSION='V592_FLAT_ADMIN_EXTRA_MENU';
  let queued=false;

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function mode(){
    const s=S();
    const raw=String(s.v527ExtraMode||'');
    if(['work','adjustment','activity'].includes(raw)) return raw;
    try{
      const q=new URLSearchParams(String(location.hash||'').split('?')[1]||'');
      const m=String(q.get('mode')||'');
      if(['work','adjustment','activity'].includes(m)) return m;
      const saved=String(sessionStorage.getItem('cnmi-v528-admin-extra-mode')||'');
      return ['work','adjustment','activity'].includes(saved)?saved:'work';
    }catch(_){return 'work';}
  }
  function svg(kind){
    const a='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      work:`<svg ${a}><path d="M12 3v18M3 12h18"></path></svg>`,
      adjustment:`<svg ${a}><path d="M4 7h16M7 4v6M4 17h16M17 14v6"></path></svg>`,
      activity:`<svg ${a}><path d="M4 20v-2a4 4 0 0 1 4-4h3"></path><circle cx="9" cy="7" r="3"></circle><path d="M15 8h5M17.5 5.5v5"></path><path d="M15 16h5"></path></svg>`
    };
    return map[kind]||map.work;
  }
  const ITEMS=[
    ['work','ขอ OT เพิ่มแทนเจ้าหน้าที่ตามจริง'],
    ['adjustment','แก้ไข OT ตกเบิก / ลดเบิกเกิน'],
    ['activity','ขอ OT สำหรับประชุม / กิจกรรมร่วม']
  ];

  function makeButton(id,label){
    const b=document.createElement('button');
    b.type='button';
    b.className='v523-subitem v592-admin-extra-item';
    b.dataset.v528ExtraMode=id; // Keep V573's proven click/navigation handler.
    b.dataset.v592AdminExtra=id;
    b.innerHTML=`<span class="v523-branch-icon">${svg(id)}</span><span>${label}</span>`;
    return b;
  }

  function flatten(){
    if(!isAdminSafe()) return;
    const sub=document.querySelector('.v523-nav-tree .v523-nav-submenu');
    if(!sub) return;

    // V528 builds one nested branch. Replace that entire branch with 3 first-level buttons.
    const branch=sub.querySelector('[data-v528-extra-tree]');
    if(branch){
      const frag=document.createDocumentFragment();
      ITEMS.forEach(([id,label])=>frag.appendChild(makeButton(id,label)));
      branch.replaceWith(frag);
    } else if(!sub.querySelector('[data-v592-admin-extra]')){
      // Fallback for a fresh sidebar render before V528 has transformed admin-extra.
      const old=sub.querySelector('[data-v523-ot-item="admin-extra"]');
      if(old){
        const frag=document.createDocumentFragment();
        ITEMS.forEach(([id,label])=>frag.appendChild(makeButton(id,label)));
        old.replaceWith(frag);
      }
    }
    refreshActive();
  }

  function refreshActive(){
    const s=S();
    const active=s.page==='ot'&&String(s.otMenuV369||'')==='admin-extra';
    const current=mode();
    document.querySelectorAll('[data-v592-admin-extra]').forEach(btn=>{
      const yes=active&&String(btn.dataset.v592AdminExtra||'')===current;
      btn.classList.toggle('active',yes);
      btn.setAttribute('aria-current',yes?'page':'false');
    });
  }

  function versionChip(){
    try{
      document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(chip=>{
        chip.textContent='v592';
        chip.title='Flat Admin Extra OT Menu (V592)';
      });
    }catch(_){}
  }

  function apply(){flatten();refreshActive();versionChip();}
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}

  function start(){
    apply();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(queue).observe(nav,{childList:true,subtree:true});
    window.addEventListener('hashchange',queue);
    window.addEventListener('pageshow',queue);
    document.addEventListener('click',function(e){
      if(e.target?.closest?.('[data-v592-admin-extra]')) setTimeout(queue,0);
    },true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  window.cnmiV592={version:VERSION,apply};
  console.info('['+VERSION+'] loaded');
})();
