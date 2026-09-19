/* CNMI Staff Planner V528 — OT Sidebar Subtree + Leave Status
 * - Replaces V527's page tabs with a nested Sidebar Tree under "ขอ OT เพิ่มแทนเจ้าหน้าที่".
 * - Adds 3 sub-items: real OT / shortfall-overclaim / meeting-activity OT.
 * - Meeting/activity participant cards show both roster duty and leave period (morning/afternoon/full day).
 * - Leave/duty statuses are informational only; Admin may still select the person.
 * UI/navigation + leave context only. No schema/business-rule changes beyond V527.
 */
(function(){
  'use strict';
  if(window.__CNMI_V528_OT_SIDEBAR_SUBTREE__) return;
  window.__CNMI_V528_OT_SIDEBAR_SUBTREE__=true;
  const VERSION='V528_OT_SIDEBAR_SUBTREE_LEAVE_STATUS';
  const MODE_KEY='cnmi-v528-admin-extra-mode';
  const BRANCH_KEY='cnmi-v528-admin-extra-open';
  const leaveCache=new Map();

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{return window.sb||(typeof sb!=='undefined'?sb:null);}catch(_){return null;}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ssGet(k,d=''){try{return sessionStorage.getItem(k)||d;}catch(_){return d;}}
  function ssSet(k,v){try{sessionStorage.setItem(k,String(v));}catch(_){}}
  function activeMode(){
    const raw=String(S().v527ExtraMode||ssGet(MODE_KEY,'work'));
    return ['work','adjustment','activity'].includes(raw)?raw:'work';
  }
  function setMode(mode){
    const m=['work','adjustment','activity'].includes(mode)?mode:'work';
    S().v527ExtraMode=m;ssSet(MODE_KEY,m);ssSet(BRANCH_KEY,'1');
  }
  function svg(kind){
    const a='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map={
      real:`<svg ${a}><path d="M12 3v18M3 12h18"></path></svg>`,
      adjust:`<svg ${a}><path d="M4 7h16M7 4v6M4 17h16M17 14v6"></path></svg>`,
      activity:`<svg ${a}><path d="M4 20v-2a4 4 0 0 1 4-4h3"></path><circle cx="9" cy="7" r="3"></circle><path d="M15 8h5M17.5 5.5v5"></path><path d="M15 16h5"></path></svg>`
    };
    return map[kind]||map.real;
  }
  const MODES=[
    ['work','ขอ OT เพิ่มแทนเจ้าหน้าที่ตามจริง','real'],
    ['adjustment','ตกเบิก / ลดเบิกเกิน','adjust'],
    ['activity','ขอ OT สำหรับประชุม / กิจกรรมร่วม','activity']
  ];

  function decorateVersion(){
    if(window.__CNMI_V529_OT_ADJUSTMENT_VISIBILITY__) return;
    const chip=document.querySelector('.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){
      if(chip.textContent!=='v528') chip.textContent='v528';
      chip.title='OT Sidebar Subtree + Leave Status';
      chip.classList.add('v528-version-chip');
    }
  }

  function subtreeHtml(){
    const mode=activeMode();
    return `<div class="v528-extra-tree" data-v528-extra-tree>
      <button type="button" class="v523-subitem v528-extra-parent ${S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'?'active-parent':''}" data-v528-extra-toggle aria-expanded="true" data-page="">
        <span class="v523-branch-icon">${svg('real')}</span><span class="v528-extra-parent-label">ขอ OT เพิ่มแทนเจ้าหน้าที่</span><span class="v528-extra-caret" aria-hidden="true">›</span>
      </button>
      <div class="v528-extra-submenu open" data-v528-extra-submenu aria-hidden="false">
        ${MODES.map(([id,label,kind])=>`<button type="button" class="v528-extra-item ${S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'&&mode===id?'active':''}" data-v528-extra-mode="${id}" data-page="" aria-current="${S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'&&mode===id?'page':'false'}"><span class="v528-extra-icon">${svg(kind)}</span><span>${esc(label)}</span></button>`).join('')}
      </div>
    </div>`;
  }

  function installSubtree(){
    if(!isAdminSafe()) return;
    const otTree=document.querySelector('.v523-nav-tree');
    if(!otTree) return;
    const sub=otTree.querySelector('.v523-nav-submenu');
    if(!sub) return;
    let branch=sub.querySelector('[data-v528-extra-tree]');
    if(!branch){
      const old=sub.querySelector('[data-v523-ot-item="admin-extra"]');
      if(!old) return;
      const wrap=document.createElement('div');
      wrap.innerHTML=subtreeHtml();
      branch=wrap.firstElementChild;
      old.replaceWith(branch);
    }
    refreshSubtree(branch);
  }

  function refreshSubtree(branch=document.querySelector('[data-v528-extra-tree]')){
    if(!branch) return;
    const isPage=S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra';
    const parent=branch.querySelector('[data-v528-extra-toggle]');
    const submenu=branch.querySelector('[data-v528-extra-submenu]');
    const open=isPage||ssGet(BRANCH_KEY,'1')==='1';
    parent?.classList.toggle('active-parent',isPage);
    parent?.setAttribute('aria-expanded',open?'true':'false');
    submenu?.classList.toggle('open',open);
    submenu?.setAttribute('aria-hidden',open?'false':'true');
    const mode=activeMode();
    branch.querySelectorAll('[data-v528-extra-mode]').forEach(btn=>{
      const yes=isPage&&btn.dataset.v528ExtraMode===mode;
      btn.classList.toggle('active',yes);
      btn.setAttribute('aria-current',yes?'page':'false');
    });
  }

  function normalizePeriod(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(/ครึ่งเช้า|เช้า|morning/.test(raw)) return 'ครึ่งเช้า';
    if(/ครึ่งบ่าย|บ่าย|afternoon/.test(raw)) return 'ครึ่งบ่าย';
    return 'เต็มวัน';
  }
  function leaveType(row){
    const raw=String(row?.type||row?.leave_type||'ลา').trim();
    if(!raw||raw==='ไม่รับเวร') return 'ลา';
    return raw;
  }
  function leaveActive(row){
    const st=String(row?.status||'').toLowerCase();
    if(/reject|rejected|cancel|cancelled|ไม่อนุมัติ|ยกเลิก/.test(st)) return false;
    const t=String(row?.type||row?.leave_type||'');
    return t!=='ไม่รับเวร';
  }

  async function fetchLeaves(date){
    const d=String(date||'').slice(0,10);if(!d)return [];
    if(leaveCache.has(d)) return leaveCache.get(d);
    let rows=[];
    try{
      const db=DB();
      if(db?.from){
        const {data,error}=await db.from('leave_requests').select('staff_id,type,leave_period,start_date,end_date,status').lte('start_date',d).gte('end_date',d);
        if(error) throw error;
        rows=(data||[]).filter(leaveActive);
      }
    }catch(err){
      rows=(S().leaves||[]).filter(r=>{
        const a=String(r.start_date||'').slice(0,10),b=String(r.end_date||r.start_date||'').slice(0,10);
        return leaveActive(r)&&a&&b&&d>=a&&d<=b;
      });
    }
    leaveCache.set(d,rows);return rows;
  }

  async function decorateParticipantLeaves(){
    const form=document.getElementById('v527ActivityForm');
    const grid=document.getElementById('v527ParticipantGrid');
    if(!form||!grid) return;
    const date=String(form.querySelector('[name="work_date"]')?.value||'').slice(0,10);
    if(!date) return;
    const leaves=await fetchLeaves(date);
    if(!document.body.contains(grid)) return;
    const byStaff=new Map();
    for(const r of leaves){
      const id=String(r.staff_id||'');if(!id)continue;
      if(!byStaff.has(id))byStaff.set(id,[]);
      byStaff.get(id).push(r);
    }
    grid.querySelectorAll('[data-v527-person]').forEach(card=>{
      const id=String(card.querySelector('input[name="participants"]')?.value||'');
      const small=card.querySelector('.v527-person-main small');if(!small)return;
      const list=byStaff.get(id)||[];
      const desired=[...new Set(list.map(r=>`${leaveType(r)} • ${normalizePeriod(r)}`))];
      const existing=[...small.querySelectorAll('.v528-leave-chip')].map(x=>String(x.textContent||'').trim());
      const same=desired.length===existing.length&&desired.every((x,i)=>x===existing[i]);
      if(!same){
        small.querySelectorAll('.v528-leave-chip').forEach(x=>x.remove());
        /* V527 may have rendered a leave chip without period; replace only leave-related chips. */
        small.querySelectorAll('.v527-status-chip').forEach(x=>{if(/ลา/.test(String(x.textContent||''))&&!/อยู่เวร/.test(String(x.textContent||'')))x.remove();});
        if(desired.length){
          if(small.classList.contains('muted')){small.classList.remove('muted');small.textContent='';}
          small.querySelectorAll('.muted').forEach(x=>x.remove());
          for(const label of desired){
            const span=document.createElement('span');span.className='v527-status-chip v528-leave-chip';span.textContent=label;small.appendChild(span);
          }
        }
      }
      /* If no duty and no leave, keep compact neutral text without rewriting it repeatedly. */
      if(!desired.length&&!small.querySelector('.v527-status-chip')&&!String(small.textContent||'').trim()){
        small.className='muted';small.textContent='ไม่มีเวร/ลาในวันนี้';
      }
    });
  }

  function hidePageTabs(){
    document.querySelectorAll('.v527-mode-card').forEach(el=>el.classList.add('v528-hidden-mode-tabs'));
  }

  function apply(){
    decorateVersion();
    installSubtree();
    refreshSubtree();
    hidePageTabs();
    if(S().page==='ot'&&String(S().otMenuV369||'')==='admin-extra'&&activeMode()==='activity') decorateParticipantLeaves();
  }

  /* Restore the last selected admin-extra mode before the first OT render. */
  if(isAdminSafe() && !S().v527ExtraMode) S().v527ExtraMode=ssGet(MODE_KEY,'work');

  document.addEventListener('click',function(e){
    const toggle=e.target?.closest?.('[data-v528-extra-toggle]');
    if(toggle){
      e.preventDefault();e.stopPropagation();
      const branch=toggle.closest('[data-v528-extra-tree]');
      const submenu=branch?.querySelector('[data-v528-extra-submenu]');
      const open=toggle.getAttribute('aria-expanded')!=='true';
      toggle.setAttribute('aria-expanded',open?'true':'false');
      submenu?.classList.toggle('open',open);submenu?.setAttribute('aria-hidden',open?'false':'true');ssSet(BRANCH_KEY,open?'1':'0');
      return;
    }
    const otherOtItem=e.target?.closest?.('[data-v523-ot-item]');
    if(otherOtItem && String(otherOtItem.dataset.v523OtItem||'')!=='admin-extra'){
      ssSet(BRANCH_KEY,'0');
      const branch=document.querySelector('[data-v528-extra-tree]');
      const parent=branch?.querySelector('[data-v528-extra-toggle]');
      const submenu=branch?.querySelector('[data-v528-extra-submenu]');
      parent?.setAttribute('aria-expanded','false');
      submenu?.classList.remove('open');
      submenu?.setAttribute('aria-hidden','true');
    }
    const item=e.target?.closest?.('[data-v528-extra-mode]');
    if(item){
      e.preventDefault();e.stopPropagation();
      const mode=String(item.dataset.v528ExtraMode||'work');setMode(mode);
      S().page='ot';S().otMenuV369='admin-extra';S().otGroupV522='ot';
      try{sessionStorage.setItem('cnmi-v523-ot-open','1');sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');}catch(_){}
      try{window.dispatchEvent(new CustomEvent('cnmi:sidebar-tree-open',{detail:{id:'ot'}}));}catch(_){}
      const sidebar=document.getElementById('sidebar');
      if(sidebar&&window.matchMedia('(max-width:820px)').matches){sidebar.classList.remove('open');document.body.classList.remove('sidebar-open');}
      try{renderPage();}catch(_){try{window.renderPage?.();}catch(__){}}
      return;
    }
  },true);

  document.addEventListener('change',function(e){
    if(e.target?.closest?.('#v527ActivityForm')&&e.target.name==='work_date'){
      const d=String(e.target.value||'').slice(0,10);if(d)leaveCache.delete(d);
      setTimeout(decorateParticipantLeaves,80);
    }
  },true);

  let queued=false;
  function queue(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }
  function start(){
    apply();
    const nav=document.getElementById('mainNav');
    if(nav)new MutationObserver(ms=>{for(const m of ms){if(m.addedNodes?.length){queue();break;}}}).observe(nav,{childList:true,subtree:true});
    const content=document.getElementById('pageContent');
    if(content)new MutationObserver(ms=>{for(const m of ms){if(m.addedNodes?.length){queue();break;}}}).observe(content,{childList:true,subtree:true});
    const chip=document.querySelector('.sidebar-foot');
    if(chip)new MutationObserver(()=>decorateVersion()).observe(chip,{childList:true,subtree:true,characterData:true});
    window.addEventListener('hashchange',queue);window.addEventListener('pageshow',queue);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV528={version:VERSION,apply,decorateParticipantLeaves};
  console.info(`[${VERSION}] loaded`);
})();
