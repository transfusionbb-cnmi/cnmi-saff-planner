/* Staff Planner v653 — scoped Donor App events, compact leave entry,
   full-width activity search, and position-template freshness diagnostics.
   Data safeguards: no database writes, no deletion of appointments or roster positions. */
(function () {
  'use strict';
  const VERSION = 'v653-donor-leave-activity-position-sync';
  if (window.__CNMI_V653__) return;
  window.__CNMI_V653__ = true;
  const DONOR_URL = 'https://donor.cnmiblood.com/';
  const DONOR_FIELDS = 'id,source_system,source_type,source_id,title,event_date,start_time,end_time,location,contact_name,contact_phone,contact_email,status,detail,source_url,is_active,updated_at';
  let donorRequestId = 0;
  let lastPositionRoute = '';
  let positionLoading = false;
  let domQueued = false;

  function S(){ try { return window.state || state || {}; } catch (_) { return window.state || {}; } }
  function DB(){ try { return typeof sb !== 'undefined' ? sb : window.sb; } catch (_) { return window.sb; } }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function normDate(v){ return String(v||'').slice(0,10); }
  function typeLabel(t){return ({platelet:'นัดเกล็ดเลือด',group:'หมู่คณะเลือดแดง',mobile:'ออกหน่วยนอกสถานที่'})[t]||'กิจกรรม Donor';}
  function activityView(){
    const s = S();
    if (s.editingActivityId) return 'create';
    const hash = String(window.location?.hash||'');
    const route = /(?:\?|&)section=(create|search)(?:&|$)/.exec(hash)?.[1];
    return route || String(s.v524ActivityView||'create');
  }
  function filters(){ const s=S(); return {start:normDate(s.activityFilterStart),end:normDate(s.activityFilterEnd),type:String(s.activityFilterType||''),search:String(s.activityFilterSearch||'').trim()}; }
  function donorKey(f){return JSON.stringify([f.start,f.end,f.type,f.search]);}
  function isDonorTypeAllowed(type){return !type || ['นัดเกล็ดเลือด','หมู่คณะเลือดแดง','ออกหน่วยนอกสถานที่'].includes(type);}
  function matches(row, f){
    if (!row || row.is_active===false) return false;
    const date = normDate(row.event_date);
    if (f.start && date < f.start) return false;
    if (f.end && date > f.end) return false;
    if (f.type && typeLabel(row.source_type)!==f.type) return false;
    if (f.search){
      const hay = [row.title,row.location,row.contact_name,row.detail].join(' ').toLocaleLowerCase('th');
      if (!hay.includes(f.search.toLocaleLowerCase('th'))) return false;
    }
    return true;
  }
  function isSafeLink(url){const v=String(url||'');return /^https?:\/\//i.test(v)?v:DONOR_URL;}
  function dateThai(v){try{return typeof formatThaiDate==='function'?formatThaiDate(v):String(v||'');}catch(_){return String(v||'');}}
  function donorCardHtml(rows, status, f){
    const subtitle = status==='loading'?'กำลังค้นหานัดตามวันที่เลือก…':
      status==='error'?'ค้นหานัดจาก Donor App ไม่สำเร็จ กรุณาลองอีกครั้ง':
      status==='limit'?'แสดงสูงสุด 500 นัด กรุณาระบุวันที่เริ่มและสิ้นสุดให้แคบลง':'เฉพาะช่วงวันที่ที่เลือก • แก้ไขนัดที่ Donor App';
    const list = status==='loading' || status==='error' ? `<div class="donor-sync-empty">${esc(subtitle)}</div>` :
      !rows.length?'<div class="donor-sync-empty">ไม่มีนัดจาก Donor App ตามตัวกรองนี้</div>':
      '<div class="donor-sync-list">'+rows.map(r=>{
        const meta = [`${dateThai(r.event_date)}${r.start_time?' · '+String(r.start_time).slice(0,5)+' น.':''}`,r.location,r.contact_name,r.contact_phone].filter(Boolean);
        return `<article class="donor-sync-item"><div class="donor-sync-item-main"><div class="donor-sync-item-title"><span class="donor-sync-type ${esc(r.source_type)}">${esc(typeLabel(r.source_type))}</span><b>${esc(r.title||'นัดหมาย')}</b></div><div class="donor-sync-meta">${meta.map(m=>`<span>${esc(m)}</span>`).join('')}</div></div><a class="tiny-btn donor-sync-open" target="_blank" rel="noopener noreferrer" href="${esc(isSafeLink(r.source_url))}">เปิด Donor App</a></article>`;
      }).join('')+'</div>';
    return `<section class="card donor-sync-card v653-donor-card"><div class="donor-sync-head"><div><h3>นัดจาก CNMI Donor App</h3><p class="hint">${esc(subtitle)}</p></div><span class="donor-sync-badge">${rows.length} นัด</span></div>${list}</section>`;
  }
  async function fetchDonorRange(f){
    const id=++donorRequestId, s=S(), key=donorKey(f);
    s.donorSearchKeyV653=key;
    s.donorSearchRowsV653=[];
    s.donorSearchStatusV653='loading';
    const client=DB();
    if(!client){s.donorSearchStatusV653='error';return;}
    if(!isDonorTypeAllowed(f.type)){
      s.donorSearchStatusV653='ready';
      return;
    }
    try{
      let q=client.from('donor_app_events').select(DONOR_FIELDS)
        .eq('is_active',true).order('event_date',{ascending:true})
        .order('start_time',{ascending:true,nullsFirst:false}).limit(500);
      if(f.start)q=q.gte('event_date',f.start);
      if(f.end)q=q.lte('event_date',f.end);
      const {data,error}=await q;
      if(error)throw error;
      if(id!==donorRequestId)return;
      s.donorSearchRowsV653=(Array.isArray(data)?data:[]).filter(r=>matches(r,f));
      s.donorSearchStatusV653=(Array.isArray(data)&&data.length>=500)?'limit':'ready';
    }catch(err){
      if(id!==donorRequestId)return;
      s.donorSearchStatusV653='error';
      console.warn('['+VERSION+'] Donor range query failed',err);
    }
    if(id===donorRequestId && String(s.page)==='activities' && activityView()==='search' && donorKey(filters())===key){
      try{(window.renderPage||renderPage)();}catch(_){}
    }
  }
  function requestIfNeeded(f){
    const s=S(),key=donorKey(f);
    if(s.donorSearchKeyV653===key)return;
    void fetchDonorRange(f);
  }
  function resetDonorSearch(){
    donorRequestId++;
    const s=S();s.donorSearchKeyV653='';s.donorSearchRowsV653=[];s.donorSearchStatusV653='';
  }
  const previousActivity = window.renderActivitiesPage || (typeof renderActivitiesPage==='function'?renderActivitiesPage:null);
  if(typeof previousActivity==='function'){
    const wrapped = function renderActivitiesPageV653(){
      const base=String(previousActivity.apply(this,arguments)||'');
      const t=document.createElement('template');t.innerHTML=base;
      // The old V494 implementation appended every appointment after the activity layout.
      t.content.querySelectorAll('.donor-sync-card').forEach(card=>card.remove());
      const typeSelect=t.content.querySelector('#activityFilterType');
      if(typeSelect){
        ['นัดเกล็ดเลือด','หมู่คณะเลือดแดง','ออกหน่วยนอกสถานที่'].forEach(label=>{
          if(![...typeSelect.options].some(o=>o.value===label)){
            const opt=document.createElement('option');opt.value=label;opt.textContent=label+' (Donor App)';
            typeSelect.appendChild(opt);
          }
        });
        typeSelect.value=filters().type;
      }
      if(activityView()==='search' && S().activityFilterAppliedV398===true){
        const f=filters();
        // A date is mandatory for Donor results; date-less activity searches remain valid.
        if(f.start || f.end){
          const key=donorKey(f),s=S();
          requestIfNeeded(f);
          const rows=s.donorSearchKeyV653===key?(s.donorSearchRowsV653||[]):[];
          const status=s.donorSearchKeyV653===key?(s.donorSearchStatusV653||'loading'):'loading';
          const holder=t.content.querySelector('.activity-list-card,.v397-all-activities');
          if(holder)holder.insertAdjacentHTML('beforeend',donorCardHtml(rows,status,f));
        }
      }
      return t.innerHTML;
    };
    window.renderActivitiesPage=wrapped;
    try{(0,eval)('renderActivitiesPage=window.renderActivitiesPage');}catch(_){}
  }
  // Use the same click/filter choice as the regular activity search. Run the date-scoped
  // Donor query independently; the existing activity-events search remains untouched.
  document.addEventListener('click', e=>{
    if(e.target?.closest?.('[data-activity-filter-reset]')){resetDonorSearch();return;}
    if(!e.target?.closest?.('[data-activity-filter-apply]'))return;
    const f={
      start:normDate(document.getElementById('activityFilterStart')?.value),
      end:normDate(document.getElementById('activityFilterEnd')?.value),
      type:String(document.getElementById('activityFilterType')?.value||''),
      search:String(document.getElementById('activityFilterSearch')?.value||'').trim()
    };
    if(f.start&&f.end&&f.start>f.end)return;
    resetDonorSearch();
    if(f.start||f.end)void fetchDonorRange(f);
  },true);

  // Leave form: no implied vacation request. Editing a saved leave keeps its true type.
  const previousLeave=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof previousLeave==='function'){
    const wrapped=function renderLeavePageV653(){
      const t=document.createElement('template');t.innerHTML=String(previousLeave.apply(this,arguments)||'');
      const form=t.content.querySelector('#leaveForm');
      if(!form)return t.innerHTML;
      const select=form.querySelector('select[name="type"]');
      if(select && !S().editingLeaveId){
        select.querySelectorAll('option').forEach(opt=>{opt.selected=false;opt.removeAttribute('selected');});
        const placeholder=document.createElement('option');
        placeholder.value='';placeholder.textContent='กรุณาเลือกประเภท';
        placeholder.disabled=true;placeholder.selected=true;placeholder.setAttribute('selected','');
        select.insertBefore(placeholder,select.firstChild);
        select.value='';
      }
      // Keep essential quota warnings outside the form visible. Move long instructional
      // paragraphs into an optional disclosure, without removing validation or policy text.
      const notes=[...form.querySelectorAll('[data-v481-leave-form-note],.v481-leave-form-note,[data-v203-fiscal-leave-note],[data-v319-fiscal-leave-note]')];
      form.querySelectorAll('.notice.soft-notice.wide').forEach(el=>{
        if(!notes.includes(el) && /ถ้าวันที่ขอลา|ระบบเปิดให้บันทึกการลาถึง/.test(el.textContent||''))notes.push(el);
      });
      if(notes.length){
        const details=document.createElement('details');details.className='v653-leave-more wide';
        details.innerHTML='<summary>ขั้นตอนลาออนไลน์และคำแนะนำเพิ่มเติม</summary>';
        notes.forEach(n=>details.appendChild(n));
        const submit=form.querySelector('button[type="submit"],input[type="submit"]');
        if(submit)submit.insertAdjacentElement('beforebegin',details);else form.appendChild(details);
      }
      t.content.querySelectorAll('[data-v576-quota-notice]').forEach(n=>{
        if(n.closest('details')||n.closest('#leaveForm'))return;
        const details=document.createElement('details');details.className='v653-leave-more v653-leave-quota';
        details.innerHTML='<summary>ดูเกณฑ์จำนวนคนลา / ไม่รับเวร</summary>';
        n.parentNode?.insertBefore(details,n);details.appendChild(n);
      });
      const adminHint=form.querySelector('#leaveStaffSelect')?.closest('label')?.querySelector('.hint');
      if(adminHint)adminHint.textContent='Admin บันทึกแทนเจ้าหน้าที่ได้';
      const fileHint=form.querySelector('input[name="file"]')?.closest('label')?.querySelector('.hint');
      if(fileHint)fileHint.textContent='ไม่บังคับ';
      return t.innerHTML;
    };
    window.renderLeavePage=wrapped;
    try{(0,eval)('renderLeavePage=window.renderLeavePage');}catch(_){}
  }

  function positionPage(){return ['positions','positionMonth','positionMonthView'].includes(String(S().page||''));}
  function selectedPositionDate(){return normDate(document.getElementById('positionDateInput')?.value||S().positionDate);}
  function configuredSlots(n){
    const cfg=window.cnmiV224?.currentConfigs?.();
    return cfg?.day?.[n]||cfg?.day?.[String(n)]||[];
  }
  function normalizedCode(v){return String(v||'').replace(/\s+/g,'').toLowerCase();}
  function dailySetCount(date){
    let n=Number(window.cnmiV379?.targetForDate?.(date));
    if(!Number.isFinite(n)||n<8||n>14)n=Number(document.querySelector('[data-v226-daily-slot-set]')?.value);
    return Number.isFinite(n)&&n>=8&&n<=14?n:null;
  }
  function prioritizeConfiguredPositionMetadata(){
    const api=window.cnmiV381;
    if(!api||api.__v653ConfigFirst||typeof api.metadataFor!=='function')return;
    const previous=api.metadataFor.bind(api);
    api.metadataFor=function(row,date){
      const old=previous(row,date)||{};
      const code=normalizedCode(row?.position_code||row?.code);
      const configured=(api.rowsForDate?.(date)||[]).find(r=>normalizedCode(r.code||r.position_code)===code);
      if(!configured)return old;
      const valid=v=>v!=null&&String(v).trim()&&!['-','—','--'].includes(String(v).trim());
      return {...old,
        zone:valid(configured.zone)?configured.zone:old.zone,
        break_time:valid(configured.break_time)?configured.break_time:old.break_time,
        main_rule:valid(configured.main_rule||configured.required_role)?(configured.main_rule||configured.required_role):old.main_rule,
        job_desc:valid(configured.job_desc||configured.description)?(configured.job_desc||configured.description):old.job_desc,
        sourceV653:'configured-slot'
      };
    };
    api.__v653ConfigFirst=true;
  }
  function positionInfo(){
    const p=String(S().page||'');
    if(p==='positions'){
      const date=selectedPositionDate(),count=dailySetCount(date);
      if(!count)return null;
      const slots=configuredSlots(count),codes=new Set(slots.map(r=>normalizedCode(r.code||r.position_code)));
      const rows=window.__CNMI_V226_DAILY_POSITION_ROWS__||[];
      const old=rows.filter(r=>r._source==='extra-plan' && !codes.has(normalizedCode(r.position_code||r.code)));
      return {target:document.querySelector('.v225-positions-page,.v226-positions-page'),count,slots,old:old.length};
    }
    if(p==='positionMonth'||p==='positionMonthView'){
      const key=String(S().positionMonthKey||S().positionMonthViewKey||S().monthKey||'').slice(0,7);
      const settings=(S().manualDaySlotSettingsV273||[]).filter(r=>normDate(r.work_date).startsWith(key));
      const counts=[...new Set(settings.map(r=>Number(r.target_slots)).filter(n=>n>=8&&n<=14))];
      const count=counts.length===1?counts[0]:null;
      const rows=(S().positions||[]).filter(r=>normDate(r.work_date).startsWith(key));
      const expected=new Set((counts.length?counts:[8,9,10,11,12,13,14]).flatMap(n=>configuredSlots(n).map(r=>normalizedCode(r.code||r.position_code))));
      const stale=rows.filter(r=>r.position_code&&!expected.has(normalizedCode(r.position_code)));
      return {target:document.querySelector('.monthly-position-page,.v226-monthly-position-page,.position-month-page'),count,slots:count?configuredSlots(count):[],old:stale.length,month:true};
    }
    return null;
  }
  function renderPositionSource(){
    if(!positionPage())return;
    const info=positionInfo();if(!info?.target)return;
    let bar=info.target.querySelector('.v653-position-source');
    if(!bar){bar=document.createElement('div');bar.className='v653-position-source';
      const toolbar=info.target.querySelector('.v225-position-toolbar,.v225-month-toolbar,.v224-month-toolbar,.section-title');
      if(toolbar)toolbar.insertAdjacentElement('afterend',bar);else info.target.prepend(bar);
    }
    const context=info.count?`ชุด Slot ${info.count} คน · ${info.slots.length} ตำแหน่ง`:'ใช้ชุด Slot ตามจำนวนคนของแต่ละวัน';
    const old=info.old?` · <strong>มี ${info.old} รายการเดิมนอกชุดที่ตั้งค่า</strong>`:'';
    const explain=info.old?'<small>รายการที่บันทึกไว้เดิมไม่ถูกลบอัตโนมัติ ตรวจแผนก่อนสร้าง/ประกาศใหม่</small>':'<small>ข้อมูลชุด Slot จากการตั้งค่า ส่วนแผนที่เคยประกาศจะไม่เปลี่ยนคนอัตโนมัติ</small>'; 
    const html=`<b>${esc(context)}</b>${old}${explain}`;
    if(bar.innerHTML!==html)bar.innerHTML=html;
    bar.classList.toggle('v653-position-has-old',info.old>0);
  }
  async function refreshPositionConfigs(){
    if(positionLoading||!positionPage()||typeof window.cnmiV224?.loadDbConfigs!=='function')return;
    positionLoading=true;
    const before=String(S().page||'');
    try{
      await window.cnmiV224.loadDbConfigs(true);
      window.cnmiV224.applyConfigsToRuntime?.();
      prioritizeConfiguredPositionMetadata();
      if(String(S().page||'')===before){
        try{(window.renderPage||renderPage)();}catch(_){}
        try{window.cnmiV379?.reorderDaily?.(document);}catch(_){}
        try{window.cnmiV381?.apply?.(document);}catch(_){}
      }
    }catch(err){console.warn('['+VERSION+'] Slot refresh failed',err);}
    finally{positionLoading=false;queueDomSync();}
  }
  function checkPositionRoute(){
    const route=String(S().page||'');
    if(positionPage()){
      if(lastPositionRoute!==route){lastPositionRoute=route;void refreshPositionConfigs();}
    }else lastPositionRoute='';
  }
  const prevRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof prevRenderPage==='function'){
    const wrapped=function renderPageV653(){
      const result=prevRenderPage.apply(this,arguments);
      checkPositionRoute();queueDomSync();
      return result;
    };
    window.renderPage=wrapped;
    try{(0,eval)('renderPage=window.renderPage');}catch(_){}
  }
  function queueDomSync(){
    if(domQueued)return;
    domQueued=true;
    requestAnimationFrame(()=>{
      domQueued=false;
      if(positionPage())renderPositionSource();
      if(String(S().page)==='leave'){
        const root=document.querySelector('#pageContent');
        root?.classList.add('v653-leave-compact');
      }
    });
  }
  function markVersion(){
    const chip=document.querySelector('.sidebar-foot .v520-version-chip,.sidebar-foot [class*="version-chip"]');
    if(chip && chip.textContent.trim()!=='v653'){chip.textContent='v653';chip.title='Donor date filter / Leave picker / Activity width / Position Slot sync';}
  }
  function install(){
    const root=document.getElementById('pageContent');
    if(root){const observer=new MutationObserver(()=>{queueDomSync();checkPositionRoute();});observer.observe(root,{childList:true,subtree:false});}
    const sidebar=document.querySelector('.sidebar-foot');
    if(sidebar)new MutationObserver(()=>markVersion()).observe(sidebar,{childList:true,subtree:true});
    markVersion();prioritizeConfiguredPositionMetadata();checkPositionRoute();queueDomSync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.cnmiV653={version:VERSION,matches,filters,donorKey,resetDonorSearch,fetchDonorRange,positionInfo};
  console.info('['+VERSION+'] ready');
})();
