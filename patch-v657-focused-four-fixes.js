/* CNMI Staff Planner v657 — focused UI fixes on v652 working baseline.
 * 1. Donor appointments appear only for the applied, date-scoped activity search.
 * 2. New leave entries require an explicit leave type; instructions are collapsible.
 * 3. Activity create/search panels occupy the available width.
 * 4. Reload current Slot configurations when entering position pages, reconcile
 *    daily metadata/order, and flag legacy positions without deleting assignments.
 * No schema changes, destructive writes, or global startup/render function replacements.
 */
(function () {
  'use strict';
  if (window.__CNMI_V657_FOCUSED_FOUR_FIXES__) return;
  window.__CNMI_V657_FOCUSED_FOUR_FIXES__ = true;

  const PATCH = 'v657';
  const TYPES = { platelet:'นัดเกล็ดเลือด', group:'หมู่คณะเลือดแดง', mobile:'ออกหน่วยนอกสถานที่' };
  const DONOR_FIELDS = 'id,source_type,title,event_date,start_time,location,contact_name,contact_phone,detail,source_url,is_active';
  let lastDonorKey = '', donorStatus = '', donorRows = [], donorToken = 0;
  let scheduled = false, previousPositionRoute = '', positionRefreshBusy = false;
  let previousPositionArea = null, previousPositionDate = '';

  function stateSafe() {
    try { return typeof state !== 'undefined' && state ? state : (window.state || {}); }
    catch (_) { return window.state || {}; }
  }
  function dbSafe() { try { return typeof sb !== 'undefined' ? sb : window.sb; } catch (_) { return window.sb; } }
  function text(v) { return String(v == null ? '' : v); }
  function dateKey(v) { return text(v).slice(0,10); }
  function keyCode(v) { return text(v).replace(/\s+/g,'').toLowerCase(); }
  function esc(v) { return text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function page() { return text(stateSafe().page); }
  function root() { return document.getElementById('pageContent'); }
  function activeSearch() {
    const s = stateSafe();
    return page()==='activities' && !s.editingActivityId && text(s.v524ActivityView || 'create')==='search';
  }
  function appliedFilters() {
    const s = stateSafe();
    return {
      start:dateKey(s.activityFilterStart),end:dateKey(s.activityFilterEnd),
      type:text(s.activityFilterType),search:text(s.activityFilterSearch).trim()
    };
  }
  function queryDates(f) {
    // A single chosen day is an exact-date query (not an unbounded future range).
    if (f.start && f.end) return { start:f.start,end:f.end };
    const d=f.start || f.end; return { start:d,end:d };
  }
  function donorMatches(row,f) {
    if (!row || row.is_active === false) return false;
    const range=queryDates(f),d=dateKey(row.event_date);
    if (range.start && d < range.start) return false;
    if (range.end && d > range.end) return false;
    if (f.type && TYPES[row.source_type] !== f.type) return false;
    if (f.search && ![row.title,row.location,row.contact_name,row.detail].join(' ').toLocaleLowerCase('th').includes(f.search.toLocaleLowerCase('th'))) return false;
    return true;
  }
  function donorAllowed(f) { return !f.type || Object.values(TYPES).includes(f.type); }
  function donorKey(f) { return JSON.stringify([queryDates(f),f.type,f.search]); }
  function donorCard(f) {
    let message = donorStatus==='loading' ? 'กำลังค้นหานัดตามวันที่เลือก…'
      : donorStatus==='error' ? 'โหลดนัดไม่สำเร็จ ลองกดค้นหาใหม่อีกครั้ง'
      : donorStatus==='limit' ? 'พบรายการจำนวนมาก แนะนำให้ค้นหาเฉพาะวัน'
      : donorRows.length ? 'แสดงเฉพาะนัดตามวันที่ค้นหา' : 'ไม่พบนัดจาก Donor App ในวันที่เลือก';
    const items = donorRows.map(r=>{
      const url=text(r.source_url).startsWith('https://') ? r.source_url : 'https://donor.cnmiblood.com/';
      const meta=[dateKey(r.event_date),r.start_time?text(r.start_time).slice(0,5)+' น.':'',r.location,r.contact_name].filter(Boolean);
      return `<article class="v657-donor-item"><div class="v657-donor-main"><span class="v657-type">${esc(TYPES[r.source_type]||'Donor App')}</span><b>${esc(r.title||'นัดหมาย')}</b><small>${meta.map(esc).join(' · ')}</small></div><a class="tiny-btn" target="_blank" rel="noopener noreferrer" href="${esc(url)}">เปิด Donor App</a></article>`;
    }).join('');
    return `<div class="v657-donor-results"><div class="v657-donor-title"><b>นัดจาก Donor App</b><small>${esc(message)}</small></div>${items || (donorStatus==='loading'?'':`<p class="hint">${esc(message)}</p>`)}</div>`;
  }
  function updateDonorView() {
    const area=root(); if(!area || page()!=='activities') return;
    // v494 always appends an unfiltered multi-month list. Remove only that card;
    // leave calendar/day dashboard Donor events intact.
    area.querySelectorAll('.donor-sync-card:not(.v657-keep)').forEach(el=>el.remove());
    const box=area.querySelector('.activity-list-card,.v397-all-activities');
    if(!box) return;
    const select=box.querySelector('#activityFilterType');
    if(select){
      Object.values(TYPES).forEach(name=>{
        if(!Array.from(select.options).some(o=>o.value===name)){
          const option=document.createElement('option');option.value=name;option.textContent=name+' (Donor App)';select.appendChild(option);
        }
      });
      // Preserve the selected Donor type when the base renderer reconstructs its select.
      if(stateSafe().activityFilterAppliedV398 && text(stateSafe().activityFilterType) && select.value!==stateSafe().activityFilterType)
        select.value=stateSafe().activityFilterType;
    }
    const existing=box.querySelector('.v657-donor-results');
    const f=appliedFilters();
    if (!activeSearch() || stateSafe().activityFilterAppliedV398!==true || !(f.start||f.end) || !donorAllowed(f)) {
      existing?.remove(); return;
    }
    const key=donorKey(f);
    if(key !== lastDonorKey) loadDonor(f,key);
    const html=donorCard(f);
    if(existing) { if(existing.outerHTML!==html) existing.outerHTML=html; }
    else box.insertAdjacentHTML('beforeend',html);
  }
  async function loadDonor(f,key) {
    const token=++donorToken;
    lastDonorKey=key;donorStatus='loading';donorRows=[];
    const client=dbSafe();
    if(!client || !stateSafe().profile) { donorStatus='error';schedule();return; }
    const range=queryDates(f);
    if(range.start > range.end){donorStatus='error';schedule();return;}
    try {
      let q=client.from('donor_app_events').select(DONOR_FIELDS)
        .eq('is_active',true).gte('event_date',range.start).lte('event_date',range.end)
        .order('event_date',{ascending:true}).limit(500);
      const {data,error}=await q;
      if(error)throw error;
      if(token!==donorToken)return;
      const rows=Array.isArray(data)?data:[];
      donorRows=rows.filter(row=>donorMatches(row,f));
      donorStatus=rows.length>=500?'limit':'ready';
    }catch(err){
      if(token!==donorToken)return;
      donorRows=[];donorStatus='error';
      console.warn('['+PATCH+'] Donor date query:',err);
    }
    schedule();
  }
  function resetDonor() { donorToken++;lastDonorKey='';donorStatus='';donorRows=[]; }

  function updateLeave() {
    if(page()!=='leave')return;
    const form=root()?.querySelector('#leaveForm');if(!form)return;
    const select=form.querySelector('select[name="type"]');
    const editing=Boolean(stateSafe().editingLeaveId);
    if(select && !editing && !select.dataset.v657Initialized){
      let placeholder=Array.from(select.options).find(o=>o.value==='');
      if(!placeholder){placeholder=document.createElement('option');placeholder.value='';select.insertBefore(placeholder,select.firstChild);}
      placeholder.textContent='เลือกประเภท';placeholder.disabled=true;
      select.value='';select.required=true;select.dataset.v657Initialized='yes';
    }
    // Existing leave's saved type is never overwritten in edit mode.
    if(form.dataset.v657Compact)return;
    form.dataset.v657Compact='yes';
    const notes=Array.from(form.querySelectorAll('[data-v481-leave-form-note],.v481-leave-form-note'));
    if(notes.length){
      const details=document.createElement('details');details.className='v657-leave-help wide';
      const summary=document.createElement('summary');summary.textContent='ขั้นตอนลาออนไลน์และคำแนะนำ';
      details.appendChild(summary);notes[0].parentNode?.insertBefore(details,notes[0]);
      notes.forEach(note=>details.appendChild(note));
    }
    const quota=form.querySelector('[data-v576-quota-notice]');
    if(quota && !quota.closest('details')){
      const details=document.createElement('details');details.className='v657-leave-help wide';
      const summary=document.createElement('summary');summary.textContent='โควตาไม่รับเวร / วันลา (กดดูรายละเอียด)';
      details.appendChild(summary);quota.parentNode?.insertBefore(details,quota);details.appendChild(quota);
    }
    form.querySelectorAll('.notice.soft-notice.wide').forEach(node=>{
      if(node.closest('details'))return;
      if(/ถ้าวันที่ขอลามีการประกาศตารางตำแหน่งรายวันแล้ว/.test(node.textContent||'')){
        node.textContent='วันที่ประกาศตำแหน่งแล้ว: โปรดแจ้งหัวหน้า/อินชาร์จให้ปรับงาน';
        node.classList.add('v657-short-note');
      }
    });
    const admin=form.querySelector('#leaveStaffSelect')?.closest('label')?.querySelector('.hint');
    if(admin)admin.textContent='Admin บันทึกแทนเจ้าหน้าที่ได้';
  }

  function configuredRowsForDate(date) {
    try {return window.cnmiV381?.rowsForDate?.(date)||[];}catch(_) {return [];}
  }
  function formatPositionWarnings() {
    if(page()!=='positions' && page()!=='positionMonth' && page()!=='positionMonthView') return;
    const area=root();if(!area)return;
    const daily=page()==='positions';
    const card=daily?area.querySelector('.v225-positions-page,.v226-positions-page')
      :area.querySelector('.monthly-position-page,.v225-monthly-position-page');
    if(!card)return;
    let summary=card.querySelector('.v657-slot-check');
    if(!summary){ summary=document.createElement('div');summary.className='v657-slot-check';
      const bar=card.querySelector('.v225-position-toolbar,.v224-month-toolbar,.v225-month-toolbar,.section-title');
      if(bar)bar.insertAdjacentElement('afterend',summary);else card.prepend(summary);
    }
    if(daily){
      const date=dateKey(document.getElementById('positionDateInput')?.value||stateSafe().positionDate);
      const rows=window.__CNMI_V226_DAILY_POSITION_ROWS__ || window.__CNMI_V225_DAILY_POSITION_ROWS__ || [];
      const cfgRows=configuredRowsForDate(date);
      const expected=new Set(cfgRows.map(r=>keyCode(r.code||r.position_code)).filter(Boolean));
      const old=expected.size?rows.filter(r=>!expected.has(keyCode(r.position_code||r.code))):[];
      const missing=expected.size?cfgRows.filter(r=>!rows.some(x=>keyCode(x.position_code||x.code)===keyCode(r.code||r.position_code))):[];
      const count=window.cnmiV379?.targetForDate?.(date);
      const isOuting=!count && cfgRows.length>0;
      const title=cfgRows.length
        ? `${isOuting?'ชุด Slot วันออกหน่วย':`ชุด Slot ${count||cfgRows.length} คน`} · ตั้งค่าไว้ ${cfgRows.length} ตำแหน่ง`
        : 'ยังไม่พบชุด Slot สำหรับวันนี้ — ตรวจการตั้งค่า/วันที่/จำนวนคน';
      const warning=old.length || missing.length;
      const caution=warning?`<strong>แผนที่บันทึกเดิมไม่ตรง ${old.length} ตำแหน่ง${missing.length?` · ขาด ${missing.length} ตำแหน่ง`:''}</strong><small>รายการเดิมยังอยู่ ไม่ลบหรือเปลี่ยนผู้รับผิดชอบอัตโนมัติ กรุณาตรวจสอบก่อนบันทึก/ประกาศ</small>`
        : '<small>รายละเอียดตำแหน่งอ้างอิงจากชุด Slot ที่ตั้งค่า · แผนประกาศเดิมไม่ถูกแก้ไข</small>';
      const html=`<b>${esc(title)}</b>${caution}`;
      if(summary.innerHTML!==html)summary.innerHTML=html;
      summary.classList.toggle('v657-slot-warning',Boolean(warning));
    }else{
      const s=stateSafe();
      const month=dateKey(s.positionMonthKey||s.positionMonthViewKey||s.monthKey).slice(0,7);
      const settings=(s.manualDaySlotSettingsV273||[]).filter(x=>dateKey(x.work_date).slice(0,7)===month);
      const known=new Set(settings.map(x=>Number(x.target_slots)).filter(n=>n>=8&&n<=14));
      const cfg=window.cnmiV224?.currentConfigs?.()||{};
      const configured=[...known].flatMap(n=>cfg.day?.[n]||[]);
      const expected=new Set(configured.map(x=>keyCode(x.code||x.position_code)));
      const previous=(s.positions||[]).filter(x=>dateKey(x.work_date).slice(0,7)===month);
      // A month may legitimately use several sets: compare only days with an explicit setting.
      const old=previous.filter(x=>{
        const setting=settings.find(r=>dateKey(r.work_date)===dateKey(x.work_date));
        if(!setting)return false;
        const rows=cfg.day?.[Number(setting.target_slots)]||[];
        return rows.length && !rows.some(r=>keyCode(r.code||r.position_code)===keyCode(x.position_code||x.code));
      });
      const title=known.size ? `ตั้งค่า Slot ของเดือนนี้: ${[...known].sort((a,b)=>a-b).join(', ')} คน` : 'จำนวน Slot ของแต่ละวันใช้ตามตารางเดือน';
      const html=`<b>${esc(title)}</b>`+(old.length?`<strong>มี ${old.length} ตำแหน่งในแผนเดิมไม่ตรงกับชุด Slot ที่ตั้งไว้</strong><small>ระบบไม่เปลี่ยนแผนที่บันทึกไว้เอง หากต้องการใช้ชุดล่าสุด ให้ตรวจแล้วสร้างแผน/บันทึกใหม่</small>`:'<small>การแก้ชุด Slot ไม่ย้ายคนในแผนรายเดือนที่บันทึกแล้วอัตโนมัติ</small>');
      if(summary.innerHTML!==html)summary.innerHTML=html;
      summary.classList.toggle('v657-slot-warning',old.length>0);
    }
  }
  function refreshPositionRoute() {
    const route=page(),isPosition=['positions','positionMonth','positionMonthView'].includes(route);
    if(!isPosition){previousPositionRoute='';previousPositionArea=null;return;}
    if(previousPositionRoute===route)return;
    previousPositionRoute=route;
    if(positionRefreshBusy || typeof window.cnmiV224?.loadDbConfigs!=='function')return;
    positionRefreshBusy=true;
    Promise.resolve().then(()=>window.cnmiV224.loadDbConfigs(true)).then(()=>{
      window.cnmiV224?.applyConfigsToRuntime?.();
      if(page()===route){
        previousPositionArea=null;
        // Only one re-render per entry, after the asynchronous DB configuration reload.
        try {if(typeof window.renderPage==='function')window.renderPage();}catch(err){console.warn('['+PATCH+'] Slot render:',err);}
      }
    }).catch(err=>console.warn('['+PATCH+'] Slot refresh:',err))
      .finally(()=>{positionRefreshBusy=false;schedule();});
  }
  function updatePositions() {
    if(!['positions','positionMonth','positionMonthView'].includes(page()))return;
    const area=root()?.querySelector('.v225-positions-page,.v226-positions-page');
    const date=dateKey(document.getElementById('positionDateInput')?.value||stateSafe().positionDate);
    if(area && (area!==previousPositionArea || date!==previousPositionDate)){
      previousPositionArea=area;previousPositionDate=date;
      try {window.cnmiV379?.reorderDaily?.(document);}catch(err){console.warn('['+PATCH+'] Slot order:',err);}
      try {window.cnmiV381?.apply?.(document);}catch(err){console.warn('['+PATCH+'] Slot metadata:',err);}
    }
    formatPositionWarnings();
  }
  function sync() {
    scheduled=false;
    try{updateDonorView();}catch(err){console.warn('['+PATCH+'] Donor UI:',err);}
    try{updateLeave();}catch(err){console.warn('['+PATCH+'] Leave UI:',err);}
    try{refreshPositionRoute();updatePositions();}catch(err){console.warn('['+PATCH+'] Position UI:',err);}
  }
  function schedule() {
    if(scheduled)return;
    scheduled=true;
    (window.requestAnimationFrame||((cb)=>setTimeout(cb,16)))(sync);
  }
  function install(){
    const area=root();if(!area)return;
    // Only root child-list replacements trigger the observer; modifications made inside
    // cards by this patch do not trigger it (avoids MutationObserver feedback loops).
    new MutationObserver(schedule).observe(area,{childList:true,subtree:false});
    document.addEventListener('click',e=>{
      if(e.target?.closest?.('[data-activity-filter-reset]')){resetDonor();schedule();}
      if(e.target?.closest?.('[data-activity-filter-apply]')){
        resetDonor();setTimeout(schedule,0);
      }
      if(e.target?.closest?.('[data-page], [data-nav]'))setTimeout(schedule,0);
    },true);
    document.addEventListener('change',e=>{
      if(e.target?.matches?.('#positionDateInput,#positionMonthInput'))schedule();
    },true);
    window.addEventListener('pageshow',schedule);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  window.cnmiV657={version:PATCH,donorMatches,queryDates,resetDonor,sync};
})();
