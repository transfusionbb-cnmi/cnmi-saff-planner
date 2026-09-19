/* CNMI Staff Planner V538 — Startup dependency failover
 * Critical startup no longer waits for external <script defer> tags.
 * Dependencies are fetched with AbortController + CDN fallback, then executed.
 * Fetches do not hold the browser load event open, so a slow CDN cannot leave
 * the tab spinning indefinitely on the login screen.
 */
(function(){
  'use strict';
  if(window.__CNMI_V538_DEPENDENCY_BOOTSTRAP__) return;
  window.__CNMI_V538_DEPENDENCY_BOOTSTRAP__=true;

  const LOAD_TIMEOUT=5000;
  const CACHE_NAME='cnmi-external-deps-v538';
  const state={loaded:{},loading:{},errors:{}};

  function test(name){
    if(name==='supabase') return !!window.supabase?.createClient;
    if(name==='xlsx') return !!window.XLSX?.utils;
    if(name==='html2canvas') return typeof window.html2canvas==='function';
    if(name==='pdf-lib') return !!window.PDFLib?.PDFDocument;
    if(name==='jszip') return typeof window.JSZip==='function';
    return false;
  }

  const sources={
    supabase:[
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
      'https://unpkg.com/@supabase/supabase-js@2'
    ],
    xlsx:[
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ],
    html2canvas:[
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
    ],
    'pdf-lib':[
      'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
      'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
    ],
    jszip:[
      'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
      'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
    ]
  };

  async function cachedResponse(url){
    try{return await caches.match(url);}catch(_){return null;}
  }
  async function remember(url,response){
    try{
      const cache=await caches.open(CACHE_NAME);
      await cache.put(url,response.clone());
    }catch(_){}
  }

  async function fetchText(url,timeout=LOAD_TIMEOUT){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url,{mode:'cors',cache:'no-store',signal:controller.signal,credentials:'omit'});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      await remember(url,response);
      return await response.text();
    }finally{
      clearTimeout(timer);
    }
  }

  function execute(code,url){
    // Indirect eval executes UMD bundles in global scope (window), matching the
    // globals used by the existing app: supabase / XLSX / html2canvas / PDFLib / JSZip.
    (0,eval)(`${code}\n//# sourceURL=${url}`);
  }

  async function trySource(name,url){
    // Fast path: use a previously cached dependency without touching the network.
    const cached=await cachedResponse(url);
    if(cached){
      try{
        execute(await cached.text(),url+'?cached=1');
        if(test(name)) return 'cache';
      }catch(err){state.errors[`${name}:cache`]=String(err?.message||err);}
    }

    const code=await fetchText(url);
    execute(code,url);
    if(!test(name)) throw new Error(`${name} loaded without expected global`);
    return url;
  }

  async function ensure(name){
    if(test(name)){state.loaded[name]='existing'; return true;}
    if(state.loading[name]) return state.loading[name];
    const promise=(async()=>{
      let lastErr=null;
      for(const url of (sources[name]||[])){
        try{
          const via=await trySource(name,url);
          state.loaded[name]=via;
          delete state.errors[name];
          return true;
        }catch(err){
          lastErr=err;
          state.errors[name]=String(err?.message||err);
        }
      }
      throw lastErr||new Error(`no source for ${name}`);
    })();
    state.loading[name]=promise.finally(()=>{delete state.loading[name];});
    return state.loading[name];
  }

  function connectionNote(show){
    let note=document.getElementById('v538ConnectionNote');
    if(!show){note?.remove();return;}
    if(note) return;
    const form=document.getElementById('loginForm');
    if(!form) return;
    note=document.createElement('div');
    note.id='v538ConnectionNote';
    note.setAttribute('role','status');
    note.style.cssText='margin:10px 0 0;padding:9px 11px;border-radius:10px;background:#f3f8fc;color:#52677a;font-size:13px;line-height:1.45;border:1px solid #dbe8f1';
    note.textContent='กำลังเชื่อมต่อระบบ…';
    form.appendChild(note);
  }

  const supabasePromise=ensure('supabase');
  const noteTimer=setTimeout(()=>connectionNote(true),700);
  supabasePromise.then(()=>{clearTimeout(noteTimer);connectionNote(false);}).catch(()=>{clearTimeout(noteTimer);connectionNote(false);});
  // App.js awaits the same promise; suppress an early unhandled-rejection event.
  supabasePromise.catch(()=>{});

  window.CNMI_DEPENDENCY_READY={version:'v538',supabase:supabasePromise,ensure,state};
  window.cnmiEnsureDependency=ensure;

  function warmOptional(){
    ['xlsx','html2canvas','pdf-lib','jszip'].forEach(name=>ensure(name).catch(err=>{
      console.warn(`[V538] optional dependency ${name} unavailable; it can retry later`,err?.message||err);
    }));
    // Fonts are visual-only. Load them after the app shell has finished so a
    // Google Fonts network delay can never block login/startup.
    try{
      if(!document.querySelector('link[data-v538-google-fonts]')){
        const link=document.createElement('link');
        link.rel='stylesheet';
        link.dataset.v538GoogleFonts='1';
        link.href='https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Sarabun:wght@400;500;600;700&display=swap';
        document.head.appendChild(link);
      }
    }catch(_){}
  }
  // Optional export libraries start only after the browser's load event, so they
  // can never be the reason the tab remains in a perpetual loading state.
  if(document.readyState==='complete') setTimeout(warmOptional,1200);
  else window.addEventListener('load',()=>setTimeout(warmOptional,1200),{once:true});
})();
