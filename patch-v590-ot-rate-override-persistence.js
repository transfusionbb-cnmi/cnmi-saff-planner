/* CNMI Staff Planner V590 — Persist Admin OT rate override across attendance normalization
 *
 * Root cause fixed:
 * - Admin OT edit (V479/V191) stored [OT_RATE_TYPE=MT|CLERK] in note.
 * - Attendance correction (V221) rebuilds note for "ยืนยันอยู่เวรตามตาราง" rows and can
 *   overwrite that token before V589 calculates trade HR.
 * - Result: a row edited to MT could still use the original trade amount (e.g. 1,800 / 130 = 13.85)
 *   instead of the corrected MT holiday rate (15 x 160 / 130 = 18.46).
 *
 * V590 persists the selected Admin override in device as well as note. V221 preserves device
 * when it normalizes attendance rows, and V589 already reads the rate token from note + device.
 * No schema change / no SQL.
 */
(function(){
  'use strict';
  const VERSION='V590_OT_RATE_OVERRIDE_PERSISTENCE';
  if(window.__CNMI_V590_OT_RATE_OVERRIDE_PERSISTENCE__) return;
  window.__CNMI_V590_OT_RATE_OVERRIDE_PERSISTENCE__=true;

  const RATE_RE=/\[OT_RATE_TYPE=(MT|CLERK)\]/ig;
  const pending=new Map();
  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function DB(){ try{return (typeof sb!=='undefined'&&sb)||window.sb||null;}catch(_){return window.sb||null;} }
  function cleanToken(v){ return String(v||'').replace(RATE_RE,'').replace(/\s*\|\s*\|\s*/g,' | ').replace(/^\s*\|\s*|\s*\|\s*$/g,'').trim(); }
  function stamp(v,rate){ const r=String(rate||'').toUpperCase()==='CLERK'?'CLERK':'MT'; const clean=cleanToken(v); return `[OT_RATE_TYPE=${r}]${clean?` | ${clean}`:''}`; }
  function formRate(form){ const el=form?.querySelector?.('[name="rate_type_v479"]'); return String(el?.value||'').toUpperCase()==='CLERK'?'CLERK':'MT'; }
  function formId(form){ return String(form?.querySelector?.('[name="id"]')?.value||'').trim(); }
  function stateRow(id){ return (S().otRequests||[]).find(r=>String(r?.id||'')===String(id||''))||null; }

  function stage(form){
    if(!form||form.id!=='otEditFormV191') return null;
    const id=formId(form); if(!id)return null;
    const rate=formRate(form);
    const note=form.querySelector('textarea[name="note"]');
    if(note) note.value=stamp(note.value,rate);
    pending.set(id,{rate,at:Date.now()});
    return {id,rate};
  }

  async function persist(id,rate,attempt=0){
    const db=DB(); if(!db?.from||!id)return false;
    try{
      // Wait until V191 has completed its own update/load cycle, then persist the rate in
      // a field V221 never rebuilds (device). Fetch fresh DB state so we do not overwrite
      // the edit audit text written by V191.
      const sel=await db.from('ot_requests').select('id,device,note').eq('id',id).maybeSingle();
      if(sel?.error) throw sel.error;
      const row=sel?.data||{};
      const device=stamp(row.device,rate).slice(0,250);
      const note=stamp(row.note,rate).slice(0,900);
      const upd=await db.from('ot_requests').update({device,note}).eq('id',id).select('id,device,note').maybeSingle();
      if(upd?.error) throw upd.error;
      const local=stateRow(id);
      if(local){ local.device=device; local.note=note; }
      pending.delete(id);
      // Reload once so Admin detail/approval/monthly summary all read the same persisted row.
      try{
        if(typeof loadAllData==='function') await loadAllData();
        if(String(location.hash||'').startsWith('#/ot')&&typeof renderPage==='function') renderPage();
      }catch(_){
        try{ window.cnmiV589?.hydrateAndRender?.({force:true}); }catch(__){}
      }
      return true;
    }catch(err){
      if(attempt<2){ setTimeout(()=>persist(id,rate,attempt+1),700*(attempt+1)); return false; }
      console.warn(`[${VERSION}] persist rate override failed`,err);
      return false;
    }
  }

  // Capture before V191's document-level click handler stops propagation.
  window.addEventListener('click',e=>{
    const btn=e.target?.closest?.('[data-save-ot-edit-v191]');
    if(!btn)return;
    const staged=stage(btn.closest('#otEditFormV191'));
    if(staged) setTimeout(()=>persist(staged.id,staged.rate,0),950);
  },true);
  window.addEventListener('submit',e=>{
    if(e.target?.id!=='otEditFormV191')return;
    const staged=stage(e.target);
    if(staged) setTimeout(()=>persist(staged.id,staged.rate,0),950);
  },true);

  // Preserve a saved token when callers use the public corrected-row helper. This fixes
  // display normalization immediately where that public API is used. The DB persistence
  // above is the authoritative safeguard for V221's internal/lexical normalizer.
  function wrapCorrected(){
    const api=window.cnmiV221DutyOt;
    if(!api||typeof api.correctedOtRow!=='function'||api.correctedOtRow.__v590Wrapped)return false;
    const prev=api.correctedOtRow;
    const wrapped=function(row){
      const out=prev.call(this,row)||row;
      const token=String(`${row?.device||''} ${row?.note||''}`).match(/\[OT_RATE_TYPE=(MT|CLERK)\]/i);
      if(token&&out){
        const rate=String(token[1]).toUpperCase();
        out.device=stamp(out.device||row?.device,rate).slice(0,250);
        out.note=stamp(out.note,rate).slice(0,900);
      }
      return out;
    };
    wrapped.__v590Wrapped=true; wrapped.__v590Previous=prev; api.correctedOtRow=wrapped; return true;
  }

  // If the just-saved row is normalized before the DB follow-up finishes, use the staged
  // override for this short window so the UI does not flash the old trade amount.
  function wrapNormalization(){
    const api=window.v190HrRateNormalization;
    if(!api||typeof api.otNormalizationBreakdown190!=='function'||api.otNormalizationBreakdown190.__v590Wrapped)return false;
    const prev=api.otNormalizationBreakdown190;
    const wrapped=function(row){
      const id=String(row?.id||''); const p=pending.get(id);
      if(!p)return prev.call(this,row);
      const clone={...row,device:stamp(row?.device,p.rate),note:stamp(row?.note,p.rate)};
      return prev.call(this,clone);
    };
    wrapped.__v590Wrapped=true; wrapped.__v590Previous=prev; api.otNormalizationBreakdown190=wrapped; return true;
  }

  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{
      if(x&&/^v\d+/i.test(String(x.textContent||'').trim())){x.textContent='v590';x.title='OT rate override persistence';}
    });
  }
  let tries=0; const timer=setInterval(()=>{
    tries++; const a=wrapCorrected(),b=wrapNormalization();
    if((a&&b)||tries>100){clearInterval(timer);setTimeout(markVersion,120);}
  },60);
  window.addEventListener('pageshow',()=>setTimeout(()=>{wrapCorrected();wrapNormalization();markVersion();},120));
  window.addEventListener('hashchange',()=>setTimeout(()=>{wrapCorrected();wrapNormalization();markVersion();},100));
  window.cnmiV590={version:VERSION,stage,persist,wrapCorrected,wrapNormalization};
  console.info(`[${VERSION}] loaded`);
})();
