/* CNMI Staff Planner V589 — Trade-chain net hours + explicit OT rate override
 *
 * Fixes chained/partial trade OT calculation.
 * Example: A sells a 24h duty to B, then B sells 08:00–17:00 (9h) onward to C.
 * B actually remains 17:00–08:00 = 15h, so B must not keep the original 24h
 * purchase amount/hours in OT.  The current approved OT rate token
 * [OT_RATE_TYPE=MT|CLERK] is also honored as an Admin correction, even when the
 * original trade request was saved with the wrong sell rate.
 *
 * No DB writes / no SQL.  This wraps the final V588 normalization only.
 */
(function(){
  'use strict';
  const VERSION='V589_TRADE_CHAIN_NET_HOURS_RATE_OVERRIDE';
  if(window.__CNMI_V589_TRADE_CHAIN_NET_HOURS_RATE_OVERRIDE__) return;
  window.__CNMI_V589_TRADE_CHAIN_NET_HOURS_RATE_OVERRIDE__=true;

  const chainLoaded=new Set(),chainLoading=new Map();
  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function selectedSid(){ return String((admin()?S()?.otDetailStaffV369:'')||currentSid()||''); }
  function monthKey(){ try{const h=String(location.hash||'');const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null;const m=String(q?.get('month')||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(m))return m;}catch(_){ } return String(S()?.monthKey||new Date().toISOString().slice(0,7)).slice(0,7); }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n)?Math.round(n*100)/100:0; }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function decode(v){ try{return decodeURIComponent(String(v||''));}catch(_){return String(v||'');} }
  function clockMin(v){ const m=String(v||'').match(/(\d{1,2}):(\d{2})/); if(!m)return NaN; return Number(m[1])*60+Number(m[2]); }
  function clockText(min){ let n=Math.round(Number(min||0)); n=((n%1440)+1440)%1440; return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
  function holiday(date){ try{return !!isHolidayDate(normDate(date));}catch(_){ const d=new Date(`${normDate(date)}T12:00:00`); const day=d.getDay(); return day===0||day===6; } }
  function staffRec(id){ return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{}; }
  function hrBase(id){ const s=staffRec(id); return /เคิก|clerk/i.test(String(s?.staff_type||s?.type||''))?90:130; }
  function rateFor(type,date){ return type==='CLERK'?(holiday(date)?120:90):(holiday(date)?160:130); }
  function explicitRate(row){ const m=`${row?.note||''} ${row?.device||''}`.match(/\[OT_RATE_TYPE=(MT|CLERK)\]/i); return m?String(m[1]).toUpperCase():''; }
  function codeOf(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function assignmentById(id){ return (S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null; }
  function assignmentForTrade(t,fallback=null){
    const real=assignmentById(t?.from_assignment_id); if(real)return real;
    if(fallback)return fallback;
    const date=decode(marker(t?.note,'SELL_DATE')),code=decode(marker(t?.note,'SELL_DUTY'));
    return date&&code?{id:t?.from_assignment_id||'',duty_date:date,duty_code:code,staff_id:t?.requester_id||''}:null;
  }
  function fullHours(a){
    try{ const h=Number(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code)); if(h>0)return h; }catch(_){ }
    try{ const h=Number(dutyHoursForCode(a?.duty_date,a?.duty_code)); if(h>0)return h; }catch(_){ }
    const m=Number(marker(a?.note,'SELL_HOURS')); return m>0?m:8;
  }
  function assignmentWindow(a){
    const full=fullHours(a),code=codeOf(a);
    if(/^ชบด[123]$/.test(code)) return full>=24?{start:480,end:1920}:{start:960,end:1920};
    if(['ช3A','ช3B','ช9','ช9-MT','ช9-เคิก'].includes(code)) return {start:480,end:960};
    if(['ช4','ช4A','ช4B'].includes(code)&&full<=8.01) return {start:960,end:1440};
    if(full>=24)return {start:480,end:1920};
    if(full>=16)return {start:960,end:1920};
    return {start:480,end:480+Math.max(1,full)*60};
  }
  function resolveRange(st,en,a){
    const w=assignmentWindow(a),s0=clockMin(st),e0=clockMin(en); if(!Number.isFinite(s0)||!Number.isFinite(e0))return null;
    const starts=[s0,s0+1440,s0+2880].filter(x=>x>=w.start-0.01&&x<w.end-0.01); if(!starts.length)return null;
    const s=starts[0],ends=[e0,e0+1440,e0+2880].filter(x=>x>s+0.01&&x<=w.end+0.01); if(!ends.length)return null;
    return [s,ends[0]];
  }
  function partIntervals(part,a){
    const w=assignmentWindow(a),map={morning:[480,960],afternoon:[960,1440],night:[1440,1920]};
    const defs={full24:['morning','afternoon','night'],morning_afternoon:['morning','afternoon'],afternoon_night:['afternoon','night'],night_morning:['night','morning'],morning:['morning'],afternoon:['afternoon'],night:['night']};
    const names=defs[String(part||'').toLowerCase()]||[];
    return names.map(n=>map[n]).filter(Boolean).map(([s,e])=>[Math.max(s,w.start),Math.min(e,w.end)]).filter(([s,e])=>e>s+0.01);
  }
  function tradeIntervals(t,a,soldHint=0){
    const note=String(t?.note||''),st=marker(note,'SELL_START'),en=marker(note,'SELL_END');
    if(st&&en){ const r=resolveRange(st,en,a); if(r)return [r]; }
    const segRaw=marker(note,'SELL_SEGMENTS');
    if(segRaw&&segRaw!=='custom'){
      const w=assignmentWindow(a),map={morning:[480,960],afternoon:[960,1440],night:[1440,1920]};
      const arr=segRaw.split(',').map(x=>x.trim()).filter(Boolean).map(n=>map[n]).filter(Boolean).map(([s,e])=>[Math.max(s,w.start),Math.min(e,w.end)]).filter(([s,e])=>e>s+0.01);
      if(arr.length)return arr;
    }
    const part=marker(note,'SELL_PART');
    const p=partIntervals(part,a); if(p.length)return p;
    const sold=Number(marker(note,'SELL_HOURS')||soldHint||0),w=assignmentWindow(a),fh=(w.end-w.start)/60;
    if(sold>0&&Math.abs(sold-fh)<=0.11)return [[w.start,w.end]];
    return [];
  }
  function mergeIntervals(list){
    const rows=(list||[]).slice().sort((a,b)=>a[0]-b[0]); const out=[];
    rows.forEach(([s,e])=>{ if(!out.length||s>out[out.length-1][1]+0.01)out.push([s,e]); else out[out.length-1][1]=Math.max(out[out.length-1][1],e); });
    return out;
  }
  function intervalHours(list){ return round2(mergeIntervals(list).reduce((s,[a,b])=>s+Math.max(0,b-a)/60,0)); }
  function subtract(base,removed){
    let pieces=(base||[]).map(x=>[x[0],x[1]]);
    (removed||[]).slice().sort((a,b)=>a[0]-b[0]).forEach(([rs,re])=>{
      pieces=pieces.flatMap(([s,e])=>{
        if(re<=s||rs>=e)return [[s,e]];
        const out=[]; if(rs>s)out.push([s,Math.min(rs,e)]); if(re<e)out.push([Math.max(re,s),e]);
        return out.filter(([x,y])=>y>x+0.01);
      });
    });
    return pieces;
  }
  function sameSlot(parent,pa,child){
    if(String(parent?.from_assignment_id||'')&&String(parent?.from_assignment_id||'')===String(child?.from_assignment_id||''))return true;
    const pd=normDate(pa?.duty_date||decode(marker(parent?.note,'SELL_DATE'))),pc=codeOf(pa)||decode(marker(parent?.note,'SELL_DUTY'));
    const cd=normDate(decode(marker(child?.note,'SELL_DATE'))||assignmentById(child?.from_assignment_id)?.duty_date),cc=decode(marker(child?.note,'SELL_DUTY'))||codeOf(assignmentById(child?.from_assignment_id));
    return !!pd&&pd===cd&&!!pc&&pc===cc;
  }
  function downstream(parent,pa){
    const receiver=String(parent?.receiver_id||''); if(!receiver)return [];
    return (S().tradeRequests||[]).filter(t=>String(t?.status||'')==='completed'&&String(t?.id||'')!==String(parent?.id||'')&&String(t?.requester_id||'')===receiver&&sameSlot(parent,pa,t));
  }
  function cloneTradeWithNetWindow(t,intervals,netHours){
    const copy={...t};
    if((intervals||[]).length===1){
      const [s,e]=intervals[0]; let note=String(copy.note||'');
      note=note.replace(/\s*\[SELL_START=[^\]]+\]/ig,'').replace(/\s*\[SELL_END=[^\]]+\]/ig,'').replace(/\s*\[SELL_HOURS=[^\]]+\]/ig,'').trim();
      copy.note=`${note} [SELL_START=${clockText(s)}] [SELL_END=${clockText(e)}] [SELL_HOURS=${netHours}]`.trim();
    }
    return copy;
  }
  function effectiveItem(item){
    const t=item?.trade||{},a=assignmentForTrade(t,item?.assignment||null); if(!t?.receiver_id||!a)return {...item};
    const origHint=Number(item?.originalSoldHours||item?.soldHours||0),baseIntervals=tradeIntervals(t,a,origHint);
    const origHours=intervalHours(baseIntervals)||round2(origHint||Number(marker(t?.note,'SELL_HOURS'))||0);
    const children=downstream(t,a);
    let childIntervals=[]; let fallbackChildHours=0;
    children.forEach(c=>{ const ca=assignmentForTrade(c,a),ints=tradeIntervals(c,ca,Number(marker(c?.note,'SELL_HOURS'))||0); if(ints.length)childIntervals.push(...ints); else fallbackChildHours+=Number(marker(c?.note,'SELL_HOURS'))||0; });
    let remainIntervals=baseIntervals.length?mergeIntervals(subtract(baseIntervals,childIntervals)):[];
    let netHours=remainIntervals.length?intervalHours(remainIntervals):Math.max(0,round2(origHours-fallbackChildHours));
    if(baseIntervals.length&&fallbackChildHours>0)netHours=Math.max(0,round2(netHours-fallbackChildHours));
    if(!origHours&&Number(item?.soldHours||0)>0)netHours=round2(Number(item.soldHours||0));
    const resold=round2(Math.max(0,origHours-netHours));
    return {...item,trade:cloneTradeWithNetWindow(t,remainIntervals,netHours),assignment:a,originalSoldHours:origHours,soldHours:netHours,effectiveHours:netHours,resoldHours:resold,remainingIntervals:remainIntervals,downstreamTrades:children};
  }
  function originalAmount(item,info){
    const n=Number(item?.amount); if(Number.isFinite(n)&&n>=0)return n;
    const m=Number(info?.amount); if(Number.isFinite(m)&&m>=0)return m;
    const t=item?.trade||{}; const x=Number(t?.amount_from); return Number.isFinite(x)&&x>=0?x:0;
  }
  function normalizeItem(item,info,row,rateOverride){
    const eff=effectiveItem(item),sid=String((eff.trade||{}).receiver_id||row?.staff_id||''),base=hrBase(sid),date=eff.assignment?.duty_date||row?.work_date;
    const orig=Math.max(0,Number(eff.originalSoldHours||item?.soldHours||0)),net=Math.max(0,Number(eff.soldHours||0));
    let amount=0,claim=0,paidType=info?.paidType||'',paidRate=0;
    if(rateOverride){
      paidType=rateOverride==='CLERK'?'เคิก':'MT'; paidRate=rateFor(rateOverride,date); amount=round2(net*paidRate); claim=base>0?round2(amount/base):net;
    }else{
      const fullAmount=originalAmount(item,info);
      if(orig>0) amount=round2(fullAmount*(net/orig));
      else if(Number(info?.paidRate)>0) amount=round2(net*Number(info.paidRate));
      else amount=round2(fullAmount);
      paidRate=net>0?round2(amount/net):0; claim=base>0?round2(amount/base):net;
    }
    return {...eff,amount,claimHours:claim,receiverNormalRate:base,paidType,paidRate,rateOverride:rateOverride||'',netOfResale:eff.resoldHours>0.004};
  }
  function mergeTrades(rows){
    const map=new Map();
    (S().tradeRequests||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.requester_id}|${x?.receiver_id}`);if(k)map.set(k,x);});
    (rows||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.requester_id}|${x?.receiver_id}`);if(k)map.set(k,x);});
    S().tradeRequests=[...map.values()];
  }
  async function ensureOutgoingTrades(month,sid,{force=false}={}){
    month=String(month||monthKey()).slice(0,7); sid=String(sid||''); if(!sid)return {loaded:false,reason:'no-staff'};
    const key=`${month}|${sid}`; if(!force&&chainLoaded.has(key))return {loaded:true,cached:true}; if(chainLoading.has(key))return chainLoading.get(key);
    const task=(async()=>{
      const db=DB(); if(!db?.from)return {loaded:false,reason:'no-db'};
      const res=await db.from('roster_trade_requests').select('*').eq('requester_id',sid).eq('status','completed').order('created_at',{ascending:false});
      if(res?.error)throw res.error;
      const rows=(res?.data||[]).filter(t=>{
        const a=assignmentForTrade(t); const d=normDate(a?.duty_date||decode(marker(t?.note,'SELL_DATE'))); return !d||d.startsWith(month);
      });
      mergeTrades(rows); chainLoaded.add(key); return {loaded:true,count:rows.length};
    })().catch(error=>{console.warn(`[${VERSION}] outgoing trades`,error);return {loaded:false,error};}).finally(()=>chainLoading.delete(key));
    chainLoading.set(key,task); return task;
  }
  function install(){
    const api=window.v190HrRateNormalization; if(!api||typeof api.otNormalizationBreakdown190!=='function')return false;
    if(api.otNormalizationBreakdown190.__v589Wrapped)return true;
    const prev=api.otNormalizationBreakdown190;
    const wrapped=function(row){
      const n=prev.call(this,row)||{}; const info=n?.tradeInfo; if(!info)return n;
      try{
        const rawItems=Array.isArray(info.trades)&&info.trades.length?info.trades:[{trade:info.trade,assignment:info.assignment,soldHours:info.soldHours,amount:info.amount,claimHours:info.claimHours}];
        const override=explicitRate(row);
        const items=rawItems.map(it=>normalizeItem(it,info,row,override)).filter(it=>Number(it.soldHours||0)>0.004);
        if(!items.length)return {...n,actualHours:0,hrHours:0,segments:[],tradeInfo:{...info,trades:[],soldHours:0,actualHours:0,amount:0,claimHours:0,netOfResale:true},v589NetTrade:true};
        const actual=round2(items.reduce((s,x)=>s+Number(x.soldHours||0),0));
        const hr=round2(items.reduce((s,x)=>s+Number(x.claimHours||0),0));
        const amount=round2(items.reduce((s,x)=>s+Number(x.amount||0),0));
        const resold=round2(items.reduce((s,x)=>s+Number(x.resoldHours||0),0));
        const single=items.length===1?items[0]:null;
        const tradeInfo={...info,
          ...(single?{trade:single.trade,assignment:single.assignment,soldHours:single.soldHours,originalSoldHours:single.originalSoldHours,resoldHours:single.resoldHours,amount:single.amount,claimHours:single.claimHours,paidType:single.paidType,paidRate:single.paidRate,receiverNormalRate:single.receiverNormalRate,rateOverride:single.rateOverride,downstreamTrades:single.downstreamTrades}:{}),
          trades:items,actualHours:actual,soldHours:actual,amount,claimHours:hr,resoldHours:resold,netOfResale:resold>0.004,rateOverride:override||info?.rateOverride||''
        };
        const segments=items.map(x=>({actualHours:round2(x.soldHours),hrHours:round2(x.claimHours),shiftType:codeOf(x.assignment)||n.shiftType||'-',rateType:override?(override==='CLERK'?'เคิก':'MT'):(n.rateType||''),sourceRateType:x.paidType||'',normalRate:x.receiverNormalRate,appliedRate:x.paidRate,isHoliday:holiday(x.assignment?.duty_date||row?.work_date),tradeId:x.trade?.id||'',assignmentId:x.assignment?.id||'',resoldHours:x.resoldHours||0}));
        return {...n,actualHours:actual,hrHours:hr,segments,tradeInfo,isTradeRate:true,v589NetTrade:true,isExplicitRateV589:!!override,rateType:override?(override==='CLERK'?'เคิก':'MT'):(n.rateType||'')};
      }catch(err){ console.warn(`[${VERSION}] fallback`,err); return n; }
    };
    wrapped.__v589Wrapped=true; wrapped.__v589Previous=prev; api.otNormalizationBreakdown190=wrapped;
    return true;
  }
  async function hydrateAndRender({force=false}={}){
    const sid=selectedSid(),month=monthKey();
    try{ await window.cnmiV587?.ensureReceiverTrades?.(month,sid,{force}); }catch(_){ }
    try{ await ensureOutgoingTrades(month,sid,{force}); }catch(_){ }
    install();
    try{ if(String(location.hash||'').startsWith('#/ot')&&typeof renderPage==='function')renderPage(); }catch(_){ }
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{if(x&&/^v\d+/i.test(String(x.textContent||'').trim())){x.textContent='v589';x.title='Trade chain net hours + OT rate override';}});
  }
  let tries=0; const timer=setInterval(()=>{tries++;if(install()||tries>100){clearInterval(timer);setTimeout(()=>{markVersion();hydrateAndRender({force:false});},160);}},60);
  window.addEventListener('hashchange',()=>setTimeout(()=>{install();markVersion();hydrateAndRender({force:false});},100));
  window.addEventListener('pageshow',()=>setTimeout(()=>{install();markVersion();hydrateAndRender({force:false});},120));
  document.addEventListener('submit',e=>{if(e.target?.id==='otEditFormV191')setTimeout(()=>{install();hydrateAndRender({force:true});},500);},true);
  document.addEventListener('change',e=>{if(e.target?.id==='v369AdminDetailStaff')setTimeout(()=>hydrateAndRender({force:true}),80);},true);
  window.cnmiV589={version:VERSION,install,effectiveItem,explicitRate,ensureOutgoingTrades,hydrateAndRender};
  console.info(`[${VERSION}] loaded`);
})();
