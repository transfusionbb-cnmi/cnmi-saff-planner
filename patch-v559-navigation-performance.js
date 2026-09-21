/* CNMI Staff Planner V559 — smooth navigation + render performance
 * Goals:
 * - One menu tap should feel immediate on desktop and mobile.
 * - Avoid rebuilding the whole sidebar on every page render when role/menu structure did not change.
 * - Avoid duplicate post-load renders on cached route data (paired with V550 update).
 * - Keep URL/deep-link behavior and all business logic unchanged.
 * No SQL / schema changes.
 */
(function(){
  'use strict';
  const VERSION='V559_NAVIGATION_PERFORMANCE';
  if(window.__CNMI_V559_NAVIGATION_PERFORMANCE__) return;
  window.__CNMI_V559_NAVIGATION_PERFORMANCE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v);}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function actualAdmin(){try{return typeof isActualAdmin==='function'?isActualAdmin():String(S()?.profile?.role||'').toLowerCase()==='admin';}catch(_){return false;}}

  /* ---------- lightweight state stamp (object identity, not deep serialization) ---------- */
  const ids=new WeakMap();let idSeq=0;
  function oid(v){
    if(!v||((typeof v!=='object')&&(typeof v!=='function'))) return txt(v);
    let id=ids.get(v);if(!id){id=++idSeq;ids.set(v,id);}return `@${id}`;
  }
  function stateStamp(){
    const st=S();if(!st)return '';
    const out=[];
    for(const key of Object.keys(st).sort()){
      const v=st[key];
      if(v instanceof Date){out.push(`${key}:${v.getTime()}`);continue;}
      const type=typeof v;
      if(v&&type==='object'){out.push(`${key}:${oid(v)}`);continue;}
      if(type==='string'||type==='number'||type==='boolean'||v==null) out.push(`${key}:${txt(v)}`);
    }
    return out.join('|');
  }

  /* ---------- visible response on tap ---------- */
  let transitionTimer=0;
  function finishTransition(){
    clearTimeout(transitionTimer);
    document.documentElement.classList.remove('v559-route-busy');
    document.querySelectorAll('.v559-nav-pressed').forEach(el=>el.classList.remove('v559-nav-pressed'));
  }
  function beginTransition(node){
    clearTimeout(transitionTimer);
    document.documentElement.classList.add('v559-route-busy');
    document.querySelectorAll('.v559-nav-pressed').forEach(el=>el.classList.remove('v559-nav-pressed'));
    node?.classList?.add('v559-nav-pressed');
    transitionTimer=setTimeout(finishTransition,1800);
  }
  function paintActive(page){
    const p=txt(page);
    document.querySelectorAll('#mainNav .nav-btn[data-page]').forEach(btn=>btn.classList.toggle('active',txt(btn.dataset.page)===p));
  }
  function closeMobileSidebar(){
    try{document.getElementById('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');}catch(_){ }
  }

  const style=document.createElement('style');
  style.id='cnmi-v559-navigation-performance';
  style.textContent=`
    #mainNav .nav-btn,.v523-subitem,.v524-subitem{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    #mainNav .nav-btn.v559-nav-pressed,.v523-subitem.v559-nav-pressed,.v524-subitem.v559-nav-pressed{
      transform:translateY(0)!important;filter:brightness(.96);outline:2px solid rgba(52,152,219,.18);outline-offset:-2px
    }
    html.v559-route-busy::before{content:"";position:fixed;z-index:99998;left:0;top:0;height:3px;width:34%;border-radius:0 999px 999px 0;background:#49aee8;animation:v559RouteProgress .7s ease-in-out infinite alternate;pointer-events:none}
    @keyframes v559RouteProgress{from{transform:translateX(-15%);opacity:.68}to{transform:translateX(210%);opacity:1}}
    @media(prefers-reduced-motion:reduce){html.v559-route-busy::before{animation:none;width:100%;opacity:.7}}
  `;
  document.head.appendChild(style);

  document.addEventListener('pointerdown',function(e){
    const nav=e.target?.closest?.('#mainNav .nav-btn[data-page],#mainNav [data-v523-ot-item],#mainNav [data-v524-child-key]');
    if(!nav)return;
    nav.classList.add('v559-nav-pressed');
  },{capture:true,passive:true});
  document.addEventListener('click',function(e){
    const nav=e.target?.closest?.('#mainNav .nav-btn[data-page],#mainNav [data-v523-ot-item],#mainNav [data-v524-child-key]');
    if(!nav)return;
    beginTransition(nav);
    const p=nav.getAttribute('data-page');if(p)paintActive(p);
    /* V523 OT children historically render immediately but do not run the route loader.
       Refresh in the background and repaint only if state objects actually changed. */
    if(nav.hasAttribute('data-v523-ot-item')){
      const before=stateStamp();
      Promise.resolve().then(async()=>{
        try{await window.cnmiV316?.loadPageData?.('ot',{force:false});}catch(_){ }
        if(txt(S()?.page)==='ot'&&stateStamp()!==before){try{if(typeof renderPage==='function')renderPage();}catch(_){ }}
        else finishTransition();
      });
    }
  },true);

  /* ---------- do not rebuild the complete sidebar for every page render ---------- */
  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  const fullRenderNav=window.renderNav||(typeof renderNav==='function'?renderNav:null);
  let navContext='';
  let navEverBuilt=false;
  let afterRenderQueued=false;

  function contextSignature(){
    const st=S(),p=st?.profile||{};
    let mode='';try{mode=typeof getViewAsMode==='function'?getViewAsMode():txt(st?.viewAsMode);}catch(_){mode=txt(st?.viewAsMode);}
    return [p.id,p.user_id,p.nickname,p.full_name,p.position,p.role,p.staff_type,actualAdmin(),isAdminSafe(),mode].map(txt).join('|');
  }
  function fastRenderNav(){
    paintActive(S()?.page||'dashboard');
    /* User mini/menu structure is intentionally preserved. It is rebuilt automatically
       when profile/role/view-mode changes because contextSignature changes. */
  }
  function afterRender(){
    if(afterRenderQueued)return;afterRenderQueued=true;
    requestAnimationFrame(()=>{
      afterRenderQueued=false;
      finishTransition();
      try{window.cnmiV542SidebarOwner?.sync?.();}catch(_){ }
      try{
        document.querySelectorAll('.v520-version-chip').forEach(chip=>{
          chip.textContent='v559';chip.title='Smooth navigation + performance (V559)';
        });
      }catch(_){ }
    });
  }

  if(typeof previousRenderPage==='function'){
    const wrapped=function renderPageV559(){
      const nav=document.getElementById('mainNav');
      const ctx=contextSignature();
      const canFast=!!(navEverBuilt&&nav&&nav.children.length&&ctx===navContext&&typeof fullRenderNav==='function');
      let result;
      if(canFast){
        let savedWindow=window.renderNav;
        let savedBinding=null;
        try{savedBinding=(typeof renderNav==='function'?renderNav:null);}catch(_){ }
        try{
          window.renderNav=fastRenderNav;
          try{renderNav=fastRenderNav;}catch(_){ }
          result=previousRenderPage.apply(this,arguments);
        }finally{
          window.renderNav=savedWindow||fullRenderNav;
          try{renderNav=savedBinding||savedWindow||fullRenderNav;}catch(_){ }
        }
      }else{
        result=previousRenderPage.apply(this,arguments);
        navEverBuilt=!!document.getElementById('mainNav')?.children?.length;
        navContext=ctx;
      }
      paintActive(S()?.page||'dashboard');
      afterRender();
      return result;
    };
    wrapped.__v559Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  /* ---------- V515 submenu navigation: same immediate-render / conditional-refresh model ---------- */
  function applyParams(page,params={}){
    const st=S();if(!st)return;
    const month=txt(params.month),date=txt(params.date),staff=txt(params.staff);
    if(/^\d{4}-\d{2}$/.test(month)){
      if(page==='hr')st.hrFilterMonth=month;
      else if(page==='hrSummary')st.hrSummaryFilterMonth=month;
      else if(page==='positionMonth')st.positionMonthKey=month;
      else if(page==='positionMonthView')st.positionMonthViewKey=month;
      else if(['schedule','scheduler','tradeRequests'].includes(page))st.monthKey=month;
      else if(page==='physicianConsult'){st.physicianConsultMonthV452=month;st.monthKey=month;}
    }
    if(/^\d{4}-\d{2}-\d{2}$/.test(date)){
      if(page==='dashboard')st.dashboardDateV443=date;
      else if(page==='positions')st.positionDate=date;
      else if(page==='audit')st.auditDate=date;
      else if(page==='calendar'){const d=new Date(`${date}T12:00:00`);if(!Number.isNaN(d.getTime()))st.calendarDate=d;}
    }
    if(page==='hr'&&staff)st.hrFilterStaff=staff;
    if(page==='hrSummary'&&staff)st.hrSummaryFilterStaff=staff;
  }

  if(window.cnmiV515?.navigate){
    const oldNavigate=window.cnmiV515.navigate.bind(window.cnmiV515);
    window.cnmiV515.navigate=async function navigateV559(page,params={}){
      const p=txt(page)||'dashboard';
      const st=S();
      try{window.cnmiV515.setUrl?.(p,{push:true,override:params});}catch(_){ }
      if(st){st.page=p;applyParams(p,params);}
      closeMobileSidebar();
      beginTransition(document.querySelector(`#mainNav [data-page="${CSS.escape(p)}"]`));
      try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      const before=stateStamp();
      try{
        if(window.cnmiV316?.loadPageData)await window.cnmiV316.loadPageData(p,{force:false});
        else return oldNavigate(page,params);
        if(['hr','hrSummary'].includes(p))await window.cnmiV515.syncSafeHr?.(true,{render:false});
      }catch(err){console.warn(`[${VERSION}] navigate load`,p,err);}
      if(txt(S()?.page)===p&&stateStamp()!==before){
        try{if(typeof renderPage==='function')renderPage();}catch(_){ }
      }else finishTransition();
    };
  }

  /* Manual refresh must really be fresh even with the route cache. */
  document.addEventListener('click',function(e){
    if(!e.target?.closest?.('#reloadBtn'))return;
    try{window.cnmiV316?.clearCache?.();}catch(_){ }
  },true);

  /* If an old route request finishes after the user already changed page, V550/V515
     already guard the final render. This hook only clears stale visual feedback. */
  window.addEventListener('pageshow',()=>setTimeout(finishTransition,80));
  window.addEventListener('error',finishTransition);
  window.addEventListener('unhandledrejection',finishTransition);

  function start(){
    navEverBuilt=!!document.getElementById('mainNav')?.children?.length;
    navContext=contextSignature();
    try{document.querySelectorAll('.v520-version-chip').forEach(chip=>{chip.textContent='v559';chip.title='Smooth navigation + performance (V559)';});}catch(_){ }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV559={version:VERSION,stateStamp,finishTransition};
  console.info(`[${VERSION}] loaded`);
})();
