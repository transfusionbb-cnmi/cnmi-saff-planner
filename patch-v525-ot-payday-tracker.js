/* CNMI Staff Planner V525 — OT Payday Tracker
 * Admin sets the actual salary/payday for each source OT month.
 * All authenticated staff can read it in monthly OT summary.
 * Requires SQL_V525_OT_PAYDAY_SETTINGS.sql once.
 */
(function(){
  'use strict';
  if(window.__CNMI_V525_OT_PAYDAY__) return;
  window.__CNMI_V525_OT_PAYDAY__=true;
  const VERSION='V525_OT_PAYDAY_TRACKER';
  let loadToken=0;
  const cache=new Map();

  function S(){try{return window.state || (typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.supabaseClient||window.sbClient||window.sb||null;}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function monthKey(){
    const raw=S()?.otMenuMonthV369||S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.myDutyMonthFilter||S()?.monthKey||new Date().toISOString().slice(0,7);
    return /^\d{4}-\d{2}$/.test(String(raw).slice(0,7))?String(raw).slice(0,7):new Date().toISOString().slice(0,7);
  }
  function activeSummary(){
    if(String(S()?.page||'')!=='ot') return false;
    const a=String(S()?.otMenuV369||'');
    return a==='summary'||a==='staff-summary';
  }
  function thaiDate(dateStr,full=false){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr||''))) return '-';
    try{
      const d=new Date(`${dateStr}T12:00:00+07:00`);
      return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:full?'long':'short',year:'numeric'}).format(d);
    }catch(_){return dateStr;}
  }
  function thaiMonthFromDate(dateStr){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr||''))) return '-';
    try{
      const d=new Date(`${dateStr}T12:00:00+07:00`);
      return new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric'}).format(d);
    }catch(_){return dateStr.slice(0,7);}
  }
  function thaiSourceMonth(key){
    if(!/^\d{4}-\d{2}$/.test(String(key||''))) return key||'-';
    try{
      const d=new Date(`${key}-01T12:00:00+07:00`);
      return new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric'}).format(d);
    }catch(_){return key;}
  }
  function calendarSvg(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"></path></svg>';}

  function panelHtml(){
    const key=monthKey();
    return `<div class="v525-payday-panel" id="v525PaydayPanel" data-v525-month="${esc(key)}">
      <div class="v525-payday-loading"><span class="v525-payday-icon">${calendarSvg()}</span><div><b>วันเงินเดือนเข้า</b><small>กำลังโหลดข้อมูลของ OT เดือน ${esc(thaiSourceMonth(key))}…</small></div></div>
    </div>`;
  }

  function injectPanel(html){
    if(!activeSummary() || String(html||'').includes('id="v525PaydayPanel"')) return html;
    const tpl=document.createElement('template');
    tpl.innerHTML=String(html||'');
    const content=tpl.content;
    const target=content.querySelector('.v241-real-month-section') || content.querySelector('.v369-ot-content .card') || content.querySelector('.v369-ot-content');
    if(!target) return html;
    const wrap=document.createElement('template');
    wrap.innerHTML=panelHtml();
    const node=wrap.content.firstElementChild;
    if(target.classList?.contains('v241-real-month-section')) target.prepend(node);
    else if(target.classList?.contains('card')){
      const sectionTitle=target.querySelector('.section-title');
      if(sectionTitle?.nextSibling) target.insertBefore(node,sectionTitle.nextSibling); else target.prepend(node);
    } else target.prepend(node);
    const holder=document.createElement('div'); holder.appendChild(content.cloneNode(true)); return holder.innerHTML;
  }

  const previousRenderOtPage=window.renderOtPage || (typeof renderOtPage==='function'?renderOtPage:null);
  if(previousRenderOtPage && !previousRenderOtPage.__v525Wrapped){
    const wrapped=function renderOtPageV525(){return injectPanel(String(previousRenderOtPage.apply(this,arguments)||''));};
    wrapped.__v525Wrapped=true;
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  function renderLoaded(panel,row){
    const key=String(panel.dataset.v525Month||monthKey());
    const pay=row?.pay_date||'';
    const admin=isAdminSafe();
    if(pay){
      panel.innerHTML=`<div class="v525-payday-main"><span class="v525-payday-icon">${calendarSvg()}</span><div class="v525-payday-copy"><span class="v525-eyebrow">OT เดือน ${esc(thaiSourceMonth(key))}</span><strong>เงินเข้า ${esc(thaiDate(pay))}</strong><span>เช็กสลิปเดือน <b>${esc(thaiMonthFromDate(pay))}</b></span></div></div>
        ${admin?`<div class="v525-payday-admin"><label><span>แก้วันเงินเข้า</span><input type="date" id="v525PayDateInput" value="${esc(pay)}"></label><button type="button" class="ghost-btn v525-save-payday" data-v525-save-payday>บันทึก</button></div>`:''}`;
    }else{
      panel.innerHTML=`<div class="v525-payday-main"><span class="v525-payday-icon">${calendarSvg()}</span><div class="v525-payday-copy"><span class="v525-eyebrow">OT เดือน ${esc(thaiSourceMonth(key))}</span><strong>ยังไม่ได้กำหนดวันเงินเดือนเข้า</strong><span>${admin?'เลือกวันที่แล้วกดบันทึก':'รอ Admin กำหนดวันเงินเดือนเข้า'}</span></div></div>
        ${admin?`<div class="v525-payday-admin"><label><span>วันเงินเข้า</span><input type="date" id="v525PayDateInput" value=""></label><button type="button" class="primary-btn v525-save-payday" data-v525-save-payday>บันทึก</button></div>`:''}`;
    }
    panel.dataset.v525Hydrated='1';
  }

  function renderError(panel,error){
    const missing=String(error?.code||'')==='42P01'||/ot_payday_settings|does not exist|schema cache/i.test(String(error?.message||''));
    panel.innerHTML=`<div class="v525-payday-main is-warning"><span class="v525-payday-icon">${calendarSvg()}</span><div class="v525-payday-copy"><strong>${missing?'ยังไม่ได้ติดตั้งข้อมูลวันเงินเดือน V525':'โหลดวันเงินเดือนไม่สำเร็จ'}</strong><span>${missing?(isAdminSafe()?'รัน SQL_V525_OT_PAYDAY_SETTINGS.sql ใน Supabase 1 ครั้ง':'กรุณาแจ้ง Admin ให้ติดตั้ง V525'):'ลองรีเฟรชอีกครั้ง'}</span></div></div>`;
    panel.dataset.v525Hydrated='error';
  }

  async function fetchMonth(key,force=false){
    if(!force&&cache.has(key)) return cache.get(key);
    const db=DB(); if(!db?.from) throw new Error('Supabase client unavailable');
    const {data,error}=await db.from('ot_payday_settings').select('source_month,pay_date,updated_at,updated_by').eq('source_month',key).maybeSingle();
    if(error) throw error;
    const row=data||null; cache.set(key,row); return row;
  }

  async function hydrate(force=false){
    const panel=document.getElementById('v525PaydayPanel');
    if(!panel||!activeSummary()) return;
    const key=String(panel.dataset.v525Month||monthKey());
    const token=++loadToken;
    if(!force&&panel.dataset.v525Hydrated==='1') return;
    try{
      const row=await fetchMonth(key,force);
      if(token!==loadToken||!document.body.contains(panel)) return;
      renderLoaded(panel,row);
    }catch(err){if(token===loadToken&&document.body.contains(panel)) renderError(panel,err);}
  }

  async function savePayday(button){
    if(!isAdminSafe()) return;
    const panel=button.closest('#v525PaydayPanel'); if(!panel) return;
    const key=String(panel.dataset.v525Month||monthKey());
    const input=panel.querySelector('#v525PayDateInput');
    const pay=String(input?.value||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(pay)){
      try{showToast('กรุณาเลือกวันเงินเดือนเข้า');}catch(_){alert('กรุณาเลือกวันเงินเดือนเข้า');}
      input?.focus(); return;
    }
    const db=DB(); if(!db?.from) return renderError(panel,new Error('Supabase client unavailable'));
    button.disabled=true; button.textContent='กำลังบันทึก…';
    const payload={source_month:key,pay_date:pay,updated_at:new Date().toISOString()};
    const pid=S()?.profile?.id; if(pid) payload.updated_by=pid;
    const {error}=await db.from('ot_payday_settings').upsert(payload,{onConflict:'source_month'});
    if(error){button.disabled=false; renderError(panel,error); return;}
    cache.set(key,{...payload});
    renderLoaded(panel,payload);
    try{showToast(`บันทึกวันเงินเข้า ${thaiDate(pay)} แล้ว`);}catch(_){}
  }

  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('[data-v525-save-payday]');
    if(btn){e.preventDefault();e.stopPropagation();savePayday(btn);}
  },true);

  document.addEventListener('change',e=>{
    if(e.target?.id==='otMoneyMonthV241'||e.target?.id==='otSourceMonthV241'){
      setTimeout(()=>hydrate(true),100);
    }
  },true);

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip){chip.textContent='v525';chip.title='OT payday tracker';chip.classList.add('v525-version-chip');}
  }
  let queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateVersion();hydrate(false);});}
  function start(){
    decorateVersion(); hydrate(false);
    const content=document.getElementById('pageContent');
    if(content)new MutationObserver(muts=>{for(const m of muts){if(m.addedNodes?.length){queue();break;}}}).observe(content,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiV525={version:VERSION,hydrate,fetchMonth};
  console.info(`[${VERSION}] loaded`);
})();
