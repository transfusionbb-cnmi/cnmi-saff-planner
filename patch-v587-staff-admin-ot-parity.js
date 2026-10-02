/* CNMI Staff Planner V587 — Staff/Admin OT parity
 * 1) Admin selected staff sees the same canonical real OT rows as that staff account.
 * 2) Load completed received-trades directly by receiver as a fallback, so Staff and Admin
 *    have the same reference data even when roster preload/RLS differs.
 * 3) OT detail rows use the current global HR-normalization result (including V574 multi-trade),
 *    not the old single-trade closure captured by V356.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V587_STAFF_ADMIN_OT_PARITY';
  if(window.__CNMI_V587_STAFF_ADMIN_OT_PARITY__) return;
  window.__CNMI_V587_STAFF_ADMIN_OT_PARITY__=true;

  const loaded=new Set();
  const loading=new Map();
  let rerendering=false;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function monthKey(){
    try{ const h=String(location.hash||''); const q=h.includes('?')?new URLSearchParams(h.split('?')[1]||''):null; const m=String(q?.get('month')||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(m))return m; }catch(_){ }
    const st=S();
    for(const v of [st.otMoneyMonthV241,st.otSourceMonthV241,st.otMenuMonthV369,st.myDutyMonthFilter,st.monthKey]){const m=String(v||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(m))return m;}
    return new Date().toISOString().slice(0,7);
  }
  function selectedSid(){ return String(S()?.otDetailStaffV369||currentSid()||''); }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n)?Math.round(n*100)/100:0; }
  function hours(v){ const n=round2(v); return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,''); }
  function esc(v){ try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));} }
  function fmtDate(v){ const d=normDate(v); try{return formatThaiDate(d);}catch(_){return d||'-';} }
  function staffName(id){ try{return staffNick(id);}catch(_){const s=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{};return s.nickname||s.full_name||id||'-';} }
  function assignmentCode(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function dutyLabel(code){ try{return DUTY_LABEL?.[code]||code||'-';}catch(_){return code||'-';} }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function assignmentForTrade(trade){
    const real=(S().rosterAssignments||[]).find(a=>String(a?.id||'')===String(trade?.from_assignment_id||''));
    if(real) return real;
    const date=marker(trade?.note,'SELL_DATE'),code=marker(trade?.note,'SELL_DUTY');
    return date&&code?{id:trade?.from_assignment_id||'',duty_date:date,duty_code:code,staff_id:trade?.requester_id||''}:null;
  }
  function mergeTrades(rows){
    const map=new Map();
    (S().tradeRequests||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}|${x?.requester_id}`);if(k)map.set(k,x);});
    (rows||[]).forEach(x=>{const k=String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}|${x?.requester_id}`);if(k)map.set(k,x);});
    S().tradeRequests=[...map.values()];
  }
  async function ensureReceiverTrades(month,sid,{force=false}={}){
    month=String(month||monthKey()).slice(0,7); sid=String(sid||'');
    if(!sid) return {loaded:false,reason:'no-staff'};
    const key=`${month}|${sid}`;
    if(!force&&loaded.has(key)) return {loaded:true,cached:true};
    if(loading.has(key)) return loading.get(key);
    const task=(async()=>{
      const db=DB(); if(!db?.from) return {loaded:false,reason:'no-db'};
      // Receiver-only query is intentionally independent of roster-assignment preload.
      // RLS can therefore give a Staff account its own completed trade rows directly.
      const res=await db.from('roster_trade_requests').select('*').eq('receiver_id',sid).eq('status','completed').order('created_at',{ascending:false});
      if(res?.error) throw res.error;
      const rows=(res?.data||[]).filter(t=>{
        const a=assignmentForTrade(t); const d=normDate(a?.duty_date||marker(t?.note,'SELL_DATE'));
        return !d || d.startsWith(month);
      });
      mergeTrades(rows);
      loaded.add(key);
      return {loaded:true,count:rows.length,month,sid};
    })().catch(error=>{console.warn(`[${VERSION}] receiver trades`,error);return {loaded:false,error};}).finally(()=>loading.delete(key));
    loading.set(key,task); return task;
  }
  function globalBreakdown(row){
    let r=row;
    try{ const fn=window.cnmiV221DutyOt?.correctedOtRow; if(typeof fn==='function')r=fn(row)||row; }catch(_){ }
    try{
      const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(r);
      if(n&&Number.isFinite(Number(n.hrHours))) return n;
    }catch(err){ console.warn(`[${VERSION}] breakdown`,err); }
    let actual=0; try{actual=Number(calcOtHours(r)||0);}catch(_){actual=Number(r?.manual_hours||r?.requested_hours||r?.hours||0);}
    return {actualHours:round2(actual),hrHours:round2(actual),segments:[],tradeInfo:null,helperInfo:null};
  }
  function timeText(row){
    const st=String(row?.start_time||'').slice(0,5),en=String(row?.end_time||'').slice(0,5),d=normDate(row?.work_date),ed=normDate(row?.end_date);
    return `${st||'-'}–${en||'-'}${ed&&d&&ed!==d?` (${fmtDate(ed)})`:''}`;
  }
  function claimStatus(row){
    const s=String(row?.claim_status||'').trim().toLowerCase();
    return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s)?'<span class="badge green">Exported</span>':'<span class="badge orange">Pending</span>';
  }
  function tradeLines(n){
    const info=n?.tradeInfo;
    if(!info) return '';
    const list=Array.isArray(info.trades)&&info.trades.length?info.trades:null;
    if(!list){
      const a=info.assignment||{},t=info.trade||{};
      return `<div class="v587-trade-line"><span class="badge purple">OT จากการซื้อเวร</span> ซื้อจาก <b>${esc(staffName(t.requester_id))}</b> • ${esc(dutyLabel(assignmentCode(a)))} • ${hours(info.soldHours)} ชม. → <b>${hours(info.claimHours)} ชม. HR</b></div>`;
    }
    return `<div class="v587-trade-box"><div><span class="badge purple">รวม ${list.length} ช่วงซื้อเวร</span></div>${list.map(item=>{
      const a=item.assignment||{},t=item.trade||{};
      const amount=round2(item.amount||0);
      return `<div class="v587-trade-line">${esc(dutyLabel(assignmentCode(a)))} • ${hours(item.soldHours)} ชม. • ซื้อจาก ${esc(staffName(t.requester_id))}${amount>0?` • ${amount.toLocaleString('th-TH')} บ.`:''} → <b>${hours(item.claimHours)} ชม. HR</b></div>`;
    }).join('')}</div>`;
  }
  function detailRows(rows){
    const source=(rows||[]).filter(r=>!r?._v584Synthetic&&!/^v584-trade-/i.test(String(r?.id||'')));
    if(!source.length) return '<div class="empty">ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้</div>';
    const cards=source.map(row=>{
      const n=globalBreakdown(row);
      return `<article class="v348-ot-card v587-canonical-row"><div class="v348-card-head"><b>${esc(fmtDate(row.work_date))}</b>${claimStatus(row)}</div><div><b>${esc(row.reason||'-')}</b><div class="muted">${esc(timeText(row))}</div></div>${tradeLines(n)}<div class="v348-hour-pair"><span>ชั่วโมงจริง <b>${hours(n.actualHours)}</b></span><span>ชั่วโมงเบิก HR <b>${hours(n.hrHours)}</b></span></div></article>`;
    }).join('');
    const body=source.map(row=>{
      const n=globalBreakdown(row);
      return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${esc(timeText(row))}</td><td><b>${esc(row.reason||'-')}</b>${tradeLines(n)}</td><td><b>${hours(n.actualHours)}</b></td><td><b>${hours(n.hrHours)}</b></td><td>${claimStatus(row)}</td></tr>`;
    }).join('');
    return `<div class="v348-detail-rows v587-detail-rows"><div class="table-wrap v348-desktop-detail"><table><thead><tr><th>วันที่ OT</th><th>เวลา</th><th>เหตุผล / ที่มา</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table></div><div class="v348-mobile-detail">${cards}</div></div>`;
  }
  function install(){
    try{ window.cnmiV584?.stripSyntheticState?.(); }catch(_){ }
    if(window.cnmiV348) window.cnmiV348.detailRows=detailRows;
  }
  async function hydrateForCurrentView({force=false,rerender=true}={}){
    install();
    const month=monthKey(),sid=selectedSid();
    if(!sid) return;
    const result=await ensureReceiverTrades(month,sid,{force});
    install();
    if(!result?.loaded) return;
    if(admin()&&String(S()?.otMenuV369||'')==='admin-details'){
      try{ await window.cnmiV369?.hydrateAdminDetail?.(); }catch(_){ }
      return;
    }
    if(rerender&&!rerendering&&String(location.hash||'').startsWith('#/ot')){
      rerendering=true;
      try{ if(typeof renderPage==='function') renderPage(); else window.renderPage?.(); }catch(_){ }
      setTimeout(()=>{rerendering=false;install();},0);
    }
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(!x||!/^v\d+/i.test(String(x.textContent||'').trim())) return;
      x.textContent='v587'; x.title='Staff/Admin OT parity';
    });
  }

  let tries=0;
  const timer=setInterval(()=>{tries++;install();if(window.cnmiV348&&window.v190HrRateNormalization||tries>100){clearInterval(timer);setTimeout(()=>hydrateForCurrentView({force:false,rerender:true}),120);setTimeout(markVersion,260);}},80);
  window.addEventListener('hashchange',()=>{setTimeout(()=>hydrateForCurrentView({force:false,rerender:true}),100);setTimeout(markVersion,240);});
  window.addEventListener('pageshow',()=>{setTimeout(()=>hydrateForCurrentView({force:false,rerender:true}),140);setTimeout(markVersion,260);});
  document.addEventListener('change',e=>{
    if(e.target?.id==='v369AdminDetailStaff'){
      const sid=String(e.target.value||'');
      if(sid) setTimeout(()=>ensureReceiverTrades(monthKey(),sid,{force:true}).then(()=>{install();return window.cnmiV369?.hydrateAdminDetail?.();}),60);
    }
    if(['otMoneyMonthV241','otSourceMonthV241','myDutyMonthFilter'].includes(e.target?.id)) setTimeout(()=>hydrateForCurrentView({force:true,rerender:true}),100);
  },true);

  const style=document.createElement('style');
  style.textContent='.v587-trade-box{margin-top:8px;padding:8px 10px;border:1px solid #e4dafb;border-radius:10px;background:#faf7ff}.v587-trade-line{margin-top:5px;font-size:12px;color:#52657a}.v587-trade-line b{color:#263a4d}.v587-canonical-row .v348-hour-pair{margin-top:10px}';
  document.head.appendChild(style);

  window.cnmiV587={version:VERSION,ensureReceiverTrades,detailRows,globalBreakdown,hydrateForCurrentView};
  console.info(`[${VERSION}] loaded`);
})();
