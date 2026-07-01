/* CNMI Staff Planner V316 — Supabase REST request guard
   Loaded before app.js.
   - Coalesces identical in-flight GET requests.
   - Keeps a short in-memory response cache for repeated reads.
   - Invalidates cached reads after every REST write.
   - Never caches Auth, Storage, RPC, or non-GET requests.
*/
(function(){
  'use strict';
  const VERSION='V316_EGRESS_PRELOAD';
  if(window.__CNMI_V316_EGRESS_PRELOAD__) return;
  window.__CNMI_V316_EGRESS_PRELOAD__=true;
  if(typeof window.fetch!=='function') return;

  const nativeFetch=window.fetch.bind(window);
  const inflight=new Map();
  const cache=new Map();
  const stats={network:0,cacheHits:0,deduped:0,writes:0,invalidations:0};
  const STATIC_TABLES=new Set([
    'staff_profiles','public_holidays','monthly_incharges','daily_position_masters',
    'daily_position_eligibility','staff_training_assignments','position_slot_configs',
    'duty_eligibility','roster_months'
  ]);

  function requestUrl(input){
    try{return typeof input==='string'?input:(input?.url||'');}catch(_){return '';}
  }
  function requestMethod(input,init){
    try{return String(init?.method||input?.method||'GET').toUpperCase();}catch(_){return 'GET';}
  }
  function isSupabaseRest(url){
    try{
      const parsed=new URL(url,location.href);
      return /\.supabase\.co$/i.test(parsed.hostname) && parsed.pathname.includes('/rest/v1/');
    }catch(_){return false;}
  }
  function tableName(url){
    try{
      const path=new URL(url,location.href).pathname;
      const marker='/rest/v1/';
      const tail=path.slice(path.indexOf(marker)+marker.length);
      return decodeURIComponent(tail.split('/')[0]||'').trim();
    }catch(_){return '';}
  }
  function headerValue(input,init,name){
    try{
      const headers=new Headers(input?.headers||{});
      new Headers(init?.headers||{}).forEach((v,k)=>headers.set(k,v));
      return headers.get(name)||'';
    }catch(_){return '';}
  }
  function tinyHash(text){
    let h=2166136261;
    const value=String(text||'');
    for(let i=0;i<value.length;i+=1){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }
  function requestKey(input,init,url){
    const auth=headerValue(input,init,'authorization');
    const range=headerValue(input,init,'range');
    const prefer=headerValue(input,init,'prefer');
    const acceptProfile=headerValue(input,init,'accept-profile');
    return [url,tinyHash(auth),range,prefer,acceptProfile].join('|');
  }
  function ttlFor(url){
    const table=tableName(url);
    if(STATIC_TABLES.has(table)) return 5*60*1000;
    if(table==='audit_logs') return 10*1000;
    return 20*1000;
  }
  function snapshotResponse(snapshot){
    return new Response(snapshot.body.slice(0),{
      status:snapshot.status,
      statusText:snapshot.statusText,
      headers:new Headers(snapshot.headers)
    });
  }
  async function makeSnapshot(response){
    const body=await response.arrayBuffer();
    const headers=[];
    response.headers.forEach((value,key)=>headers.push([key,value]));
    return {body,status:response.status,statusText:response.statusText,headers,ok:response.ok};
  }
  function invalidate(reason){
    if(cache.size){cache.clear();stats.invalidations+=1;}
    try{window.dispatchEvent(new CustomEvent('cnmi:v316-cache-invalidated',{detail:{reason}}));}catch(_){ }
  }
  function prune(){
    const now=Date.now();
    for(const [key,row] of cache){if(!row||row.expiresAt<=now) cache.delete(key);}
    if(cache.size>180){
      const rows=[...cache.entries()].sort((a,b)=>(a[1]?.createdAt||0)-(b[1]?.createdAt||0));
      rows.slice(0,cache.size-140).forEach(([key])=>cache.delete(key));
    }
  }

  window.fetch=async function cnmiV316Fetch(input,init={}){
    const url=requestUrl(input);
    const method=requestMethod(input,init);
    if(!isSupabaseRest(url)) return nativeFetch(input,init);

    if(method==='HEAD') return nativeFetch(input,init);
    if(method!=='GET'){
      stats.writes+=1;
      invalidate(`${method}:${tableName(url)}`);
      return nativeFetch(input,init);
    }

    const bypass=headerValue(input,init,'x-cnmi-force-refresh')==='1';
    const key=requestKey(input,init,url);
    prune();
    if(!bypass){
      const hit=cache.get(key);
      if(hit&&hit.expiresAt>Date.now()){
        stats.cacheHits+=1;
        return snapshotResponse(hit.snapshot);
      }
      if(inflight.has(key)){
        stats.deduped+=1;
        const snap=await inflight.get(key);
        return snapshotResponse(snap);
      }
    }

    const task=(async()=>{
      stats.network+=1;
      const response=await nativeFetch(input,init);
      const snapshot=await makeSnapshot(response);
      if(snapshot.ok&&!bypass){
        const now=Date.now();
        cache.set(key,{snapshot,createdAt:now,expiresAt:now+ttlFor(url)});
      }
      return snapshot;
    })();
    inflight.set(key,task);
    try{return snapshotResponse(await task);}
    finally{inflight.delete(key);}
  };

  window.cnmiV316FetchGuard={
    version:VERSION,
    stats,
    clear:()=>invalidate('manual'),
    cacheSize:()=>cache.size,
    inflightSize:()=>inflight.size
  };
  console.info(`[${VERSION}] loaded`);
})();
