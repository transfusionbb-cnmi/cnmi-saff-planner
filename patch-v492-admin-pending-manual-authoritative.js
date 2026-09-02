/* CNMI Staff Planner V492
 * Admin pending panel — authoritative manual refresh.
 *
 * Why this patch exists:
 * - Older V460 builds could auto-load/carry old HR pending rows into Dashboard.
 * - HR rows that still say "ยังไม่ลง HR" are Staff work, not Admin work.
 *
 * V492 uses a NEW patch filename so browser/PWA caches cannot silently keep an old
 * implementation of patch-v460. It also suppresses V460's automatic idle-load and
 * replaces the Dashboard panel with a V492-owned manual panel.
 *
 * Admin HR pending = only hr_checks rows with hr_reported_date present and status
 * not checked/cancelled. No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V492_ADMIN_PENDING_MANUAL_AUTHORITATIVE';
  if(window.__CNMI_V492_ADMIN_PENDING_MANUAL_AUTHORITATIVE__)return;
  window.__CNMI_V492_ADMIN_PENDING_MANUAL_AUTHORITATIVE__=true;

  const store={status:'idle',error:'',categories:[],loadedAt:0,promise:null};

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function monthOf(v){return norm(v).slice(0,7);}
  function actualAdmin(){try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function onDashboard(){return String(S()?.page||'')==='dashboard';}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function thaiDate(v){try{return typeof formatThaiDate==='function'?formatThaiDate(v):v;}catch(_){return v;}}
  function safeRows(res){return !res?.error&&Array.isArray(res?.data)?res.data:[];}

  function suppressLegacyAutoLoad(){
    try{
      const legacy=window.cnmiV460?.pendingCache;
      if(legacy&&legacy.status==='idle') legacy.status='v492-manual-idle';
    }catch(_){ }
  }

  async function freshHrCategory(db){
    const hrRes=await db.from('hr_checks').select('*').order('updated_at',{ascending:false}).limit(1000);
    if(hrRes?.error)throw hrRes.error;
    const hrRows=safeRows(hrRes);
    // Replace app snapshot even when zero rows, so old rows cannot survive in memory.
    try{S().hrChecks=hrRows;}catch(_){ }

    const pending=hrRows.filter(h=>{
      const status=String(h?.status||'').trim();
      const reported=String(h?.hr_reported_date||'').trim();
      return !!reported && status!=='ตรวจสอบแล้ว' && status!=='ยกเลิก' && status!=='cancelled';
    });
    if(!pending.length)return null;

    const ids=[...new Set(pending.map(h=>String(h?.leave_request_id||'')).filter(Boolean))];
    const leaves=[];
    for(let i=0;i<ids.length;i+=80){
      const q=await db.from('leave_requests').select('*').in('id',ids.slice(i,i+80));
      if(q?.error)throw q.error;
      leaves.push(...(q.data||[]));
    }
    const lmap=new Map(leaves.map(r=>[String(r?.id||''),r]));
    const items=pending.map(h=>{
      const r=lmap.get(String(h?.leave_request_id||''));
      if(!r)return null;
      const type=String(r.type||r.leave_type||'ลา').split(':::')[0].trim()||'ลา';
      const period=String(r.period||r.leave_period||'').trim();
      const date=norm(r.start_date);
      return {
        id:r.id,page:'hr',month:monthOf(date),date,
        title:staffName(r.staff_id),
        detail:`${type}${period?` · ${period}`:''}${date?` · ${thaiDate(date)}`:''} · น้องแจ้งแล้ว · รอตรวจสอบ HR`
      };
    }).filter(Boolean);
    return items.length?{key:'hr',label:'ตรวจ HR',tone:'gray',items}:null;
  }

  async function loadFresh(){
    if(!actualAdmin())return [];
    if(store.status==='loading')return store.promise||[];
    const db=DB();
    if(!db){store.status='error';store.error='เชื่อมต่อ Supabase ไม่สำเร็จ';rerender();return[];}
    store.status='loading';store.error='';store.categories=[];rerender();
    const p=(async()=>{
      try{
        // Reuse legacy loader for non-HR categories only. Even if an older cached V460
        // is present, its HR category is discarded below and rebuilt from fresh DB rows.
        let base=[];
        try{
          if(window.cnmiV460?.loadAdminPending){
            const result=await window.cnmiV460.loadAdminPending(true);
            if(Array.isArray(result))base=result;
          }
        }catch(err){console.warn('[V492] legacy non-HR loader',err);}
        base=(base||[]).filter(c=>c&&c.key!=='hr');
        const hr=await freshHrCategory(db);
        store.categories=[...base,...(hr?[hr]:[])].filter(c=>Array.isArray(c.items)&&c.items.length);
        store.status='loaded';store.loadedAt=Date.now();
        // Keep legacy cache from becoming the visual source again.
        try{
          const legacy=window.cnmiV460?.pendingCache;
          if(legacy){legacy.status='v492-manual-idle';legacy.categories=[];legacy.loadedAt=0;}
        }catch(_){ }
        return store.categories;
      }catch(err){
        store.status='error';store.error=String(err?.message||err||'โหลดรายการไม่สำเร็จ');
        console.warn('[V492] manual pending refresh',err);return[];
      }finally{store.promise=null;rerender();}
    })();
    store.promise=p;return p;
  }

  function panelHtml(){
    if(!actualAdmin())return'';
    if(store.status==='idle')return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ยังไม่ได้โหลดรายการล่าสุด • กด ↻ เมื่อต้องการตรวจจาก Supabase</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total is-loading">—</span><button type="button" class="v460-refresh-icon" data-v492-refresh title="ตรวจรายการล่าสุด">↻</button></div></div></section>`;
    if(store.status==='loading')return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>กำลังตรวจรายการล่าสุดจาก Supabase…</p></div><span class="v460-admin-total is-loading">…</span></div></section>`;
    if(store.status==='error')return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p class="v460-admin-error">${esc(store.error)}</p></div><button type="button" class="ghost-btn" data-v492-refresh>ลองใหม่</button></div></section>`;
    const cats=store.categories||[],total=cats.reduce((n,c)=>n+(c.items?.length||0),0);
    if(!total)return `<section class="card v460-admin-pending v492-admin-pending is-clear" data-v492-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ตรวจล่าสุดแล้ว • ไม่มีรายการค้างของ Admin</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total is-clear">0</span><button type="button" class="v460-refresh-icon" data-v492-refresh title="ตรวจใหม่">↻</button></div></div></section>`;
    return `<section class="card v460-admin-pending v492-admin-pending" data-v492-admin-pending>
      <div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ข้อมูลจากการกด ↻ ล่าสุด • รายการ HR นับเฉพาะน้องที่กด “ลาในระบบแล้ว”</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total">${total}</span><button type="button" class="v460-refresh-icon" data-v492-refresh title="ตรวจใหม่">↻</button></div></div>
      <div class="v460-admin-categories">${cats.map(c=>`<div class="v460-admin-category tone-${esc(c.tone||'blue')}"><div class="v460-admin-category-head"><b>${esc(c.label||'รายการ')}</b><span>${c.items.length}</span></div><div class="v460-admin-items">${c.items.slice(0,6).map(item=>`<button type="button" class="v460-admin-item" data-v460-open-page="${esc(item.page||'dashboard')}" data-v460-open-month="${esc(item.month||'')}" data-v460-open-date="${esc(item.date||'')}"><span><b>${esc(item.title||'-')}</b><small>${esc(item.detail||'')}</small></span><em>เปิด ›</em></button>`).join('')}${c.items.length>6?`<div class="v460-admin-more">และอีก ${c.items.length-6} รายการ</div>`:''}</div></div>`).join('')}</div>
    </section>`;
  }

  function replacePanelInHtml(html){
    try{
      if(!actualAdmin())return html;
      suppressLegacyAutoLoad();
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');const root=tpl.content;
      root.querySelectorAll('[data-v460-admin-pending],[data-v492-admin-pending]').forEach(el=>el.remove());
      const t=document.createElement('template');t.innerHTML=panelHtml().trim();
      const panel=t.content.firstElementChild;
      if(panel){
        const nav=root.querySelector('[data-v443-dashboard-date-nav]');
        if(nav)nav.insertAdjacentElement('afterend',panel); else root.insertBefore(panel,root.firstChild);
      }
      const out=document.createElement('div');out.appendChild(root.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn('[V492] replace panel html',err);return html;}
  }

  const previous=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previous==='function'){
    const wrapped=function renderDashboardV492(){
      suppressLegacyAutoLoad();
      return replacePanelInHtml(previous.apply(this,arguments));
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function rerender(){
    try{if(onDashboard()&&typeof renderPage==='function')renderPage();}catch(_){ }
  }

  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('[data-v492-refresh]');
    if(!b)return;
    e.preventDefault();e.stopPropagation();loadFresh();
  },true);

  // If any legacy patch redraws its panel after V492, replace it immediately.
  const mo=new MutationObserver(()=>{
    if(!actualAdmin()||!onDashboard())return;
    const root=document.getElementById('pageContent')||document.body;
    const legacy=root.querySelector('[data-v460-admin-pending]:not(.v492-admin-pending)');
    if(!legacy)return;
    const t=document.createElement('template');t.innerHTML=panelHtml().trim();
    if(t.content.firstElementChild)legacy.replaceWith(t.content.firstElementChild);
  });
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }

  // Start every new page load in manual/idle mode. Do not display a previous snapshot.
  store.status='idle';store.categories=[];store.loadedAt=0;suppressLegacyAutoLoad();
  window.cnmiV492={version:VERSION,store,loadFresh,reset(){store.status='idle';store.categories=[];store.error='';store.loadedAt=0;rerender();}};
  console.info(`${VERSION} loaded`);
})();
