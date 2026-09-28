
/* Original source: patch-v455-physician-phone-popup.js */
try {
/* CNMI Staff Planner V455
 * Physician Consult contact popup
 * - Physician name in Dashboard > แพทย์ Consult is clickable/tappable.
 * - Popup shows physician full name and phone from staff_profiles.phone/contact_phone.
 * - On phones, shows a tel: button so the device can call immediately.
 * - On desktop, offers Copy phone number.
 * No SQL required: reuses the existing staff profile phone field.
 */
(function(){
  'use strict';
  const VERSION='V455_PHYSICIAN_PHONE_POPUP';
  if(window.__CNMI_V455_PHYSICIAN_PHONE_POPUP__)return;
  window.__CNMI_V455_PHYSICIAN_PHONE_POPUP__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v);}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{
      const d=normDate(S()?.dashboardDateV443);
      if(d)return d;
      if(typeof todayStr==='function')return normDate(todayStr());
    }catch(_){ }
    const x=new Date(),p=n=>String(n).padStart(2,'0');
    return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`;
  }
  function person(id){return (S().staff||[]).find(p=>String(p?.id)===String(id||''))||null;}
  function shortName(p){return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function fullName(p){return p?(p.full_name||p.nickname||p.email||'-'):'-';}
  function rawPhone(p){return String(p?.phone||p?.contact_phone||'').trim();}
  function phoneForTel(raw){
    let s=String(raw||'').trim();
    if(!s)return '';
    const hasPlus=s.startsWith('+');
    s=s.replace(/\D/g,'');
    return s?(hasPlus?`+${s}`:s):'';
  }
  function phoneDisplay(raw){
    const original=String(raw||'').trim();
    if(!original)return '';
    const digits=original.replace(/\D/g,'');
    if(/^0\d{9}$/.test(digits))return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    if(/^0\d{8}$/.test(digits))return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5)}`;
    if(/^66\d{9}$/.test(digits))return `+66 ${digits.slice(2,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
    return original;
  }
  function currentModel(){
    try{
      const api=window.cnmiPhysicianConsultV452;
      return api&&typeof api.baseForDate==='function'?api.baseForDate(selectedDate()):null;
    }catch(_){return null;}
  }
  function rowAssignments(){
    const m=currentModel();
    if(!m)return [];
    if(m.weekday){
      return [
        {id:m.donor,time:'08:00–16:00',site:'Donor'},
        {id:m.bb,time:'08:00–16:00',site:'Blood Bank'},
        {id:m.combined,time:'16:00–08:00',site:'Donor & BB'}
      ];
    }
    return [{id:m.combined,time:'ตลอดวัน',site:'Donor & BB'}];
  }
  function decorate(html){
    if(!html||!String(html).includes('v452-physician-card'))return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html);
      const card=tpl.content.querySelector('[data-v452-physician-card]');
      if(!card)return html;
      const rows=[...card.querySelectorAll('.v452-dashboard-table tbody tr')];
      const assignments=rowAssignments();
      rows.forEach((tr,index)=>{
        const a=assignments[index];
        const pill=tr.querySelector('.v452-doctor-pill');
        if(!pill||!a?.id)return;
        const p=person(a.id);
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='v452-doctor-pill v455-doctor-contact-btn';
        btn.setAttribute('data-v455-doctor-id',String(a.id));
        btn.setAttribute('data-v455-site',a.site||'');
        btn.setAttribute('data-v455-time',a.time||'');
        btn.setAttribute('aria-label',`ดูเบอร์โทร ${shortName(p)}`);
        btn.title='แตะเพื่อดูเบอร์โทรแพทย์';
        btn.textContent=p?shortName(p):pill.textContent;
        pill.replaceWith(btn);
      });
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn('[V455] decorate physician card',err);return html;}
  }

  function copyText(text){
    if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
    return new Promise((resolve,reject)=>{
      try{
        const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
        const ok=document.execCommand('copy');ta.remove();ok?resolve():reject(new Error('copy failed'));
      }catch(e){reject(e);}
    });
  }
  function notify(msg){try{if(typeof toast==='function')return toast(msg);}catch(_){ } try{if(typeof showToast==='function')return showToast(msg);}catch(_){ } console.info('[V455]',msg);}
  function openDoctor(id,site,time){
    const p=person(id);if(!p)return notify('ไม่พบข้อมูลแพทย์');
    const raw=rawPhone(p),display=phoneDisplay(raw),tel=phoneForTel(raw);
    const phoneBlock=raw?`
      <div class="v455-contact-row"><span>เบอร์โทร</span><b class="v455-phone-number">${esc(display)}</b></div>
      <div class="v455-contact-actions">
        ${tel?`<a class="primary-btn v455-call-mobile" href="tel:${esc(tel)}">☎ โทรออก ${esc(display)}</a>`:''}
        <button class="soft-btn v455-copy-phone" type="button" data-v455-copy-phone="${esc(raw)}">คัดลอกเบอร์โทร</button>
      </div>`:`
      <div class="v455-no-phone">ยังไม่มีเบอร์โทรในข้อมูลผู้ใช้งาน</div>
      <div class="hint v455-no-phone-hint">Admin สามารถกรอกได้ที่ ข้อมูลผู้ใช้งาน → เลือกแพทย์ → เบอร์โทร</div>`;
    const html=`<div class="v455-doctor-popup">
      <div class="v455-doctor-icon">☎</div>
      <h2>${esc(shortName(p))}</h2>
      <div class="v455-full-name">${esc(fullName(p))}</div>
      ${(site||time)?`<div class="v455-consult-meta">${site?`<span><small>จุด Consult</small><b>${esc(site)}</b></span>`:''}${time?`<span><small>เวลา</small><b>${esc(time)}</b></span>`:''}</div>`:''}
      ${phoneBlock}
    </div>`;
    try{
      if(typeof showModal==='function')showModal(html,{small:true});
      else if(window.showModal)window.showModal(html,{small:true});
    }catch(err){console.warn('[V455] show modal',err);}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV455(){return decorate(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('[data-v455-doctor-id]');
    if(b){
      e.preventDefault();e.stopPropagation();
      openDoctor(b.getAttribute('data-v455-doctor-id'),b.getAttribute('data-v455-site')||'',b.getAttribute('data-v455-time')||'');
      return;
    }
    const copy=e.target?.closest?.('[data-v455-copy-phone]');
    if(copy){
      e.preventDefault();
      const raw=copy.getAttribute('data-v455-copy-phone')||'';
      copyText(raw).then(()=>notify('คัดลอกเบอร์โทรแล้ว')).catch(()=>notify('คัดลอกเบอร์โทรไม่สำเร็จ'));
    }
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v455-physician-phone-popup-style';
  style.textContent=`
    .v455-doctor-contact-btn{appearance:none;-webkit-appearance:none;font:inherit;cursor:pointer;line-height:1.1;transition:transform .12s ease,box-shadow .12s ease}
    .v455-doctor-contact-btn:hover{box-shadow:0 0 0 3px rgba(74,157,214,.12)}
    .v455-doctor-contact-btn:active{transform:scale(.97)}
    .v455-doctor-contact-btn:focus-visible{outline:2px solid #4a9dd6;outline-offset:2px}
    .v455-doctor-popup{text-align:center;padding:2px 2px 4px}.v455-doctor-icon{width:50px;height:50px;margin:0 auto 8px;border-radius:50%;display:grid;place-items:center;background:#e8f5ff;color:#1672ad;font-size:22px;font-weight:900}.v455-doctor-popup h2{margin:0 0 3px}.v455-full-name{color:#657b8e;font-weight:700;margin-bottom:14px}.v455-consult-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 12px;text-align:left}.v455-consult-meta span,.v455-contact-row{border:1px solid #e2ebf3;background:#f8fbfd;border-radius:12px;padding:10px 12px}.v455-consult-meta small,.v455-contact-row span{display:block;color:#7a8fa2;font-size:11px;margin-bottom:3px}.v455-consult-meta b{display:block;color:#263c50}.v455-contact-row{text-align:left;margin-bottom:10px}.v455-phone-number{display:block;color:#1d6d9e;font-size:22px;letter-spacing:.3px}.v455-contact-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.v455-contact-actions .primary-btn,.v455-contact-actions .soft-btn{min-height:42px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}.v455-call-mobile{display:none!important}.v455-no-phone{padding:12px;border-radius:12px;background:#fff7e8;color:#97610c;font-weight:850}.v455-no-phone-hint{margin-top:7px;line-height:1.45}
    @media(max-width:820px){.v455-doctor-contact-btn{min-height:32px}.v455-call-mobile{display:inline-flex!important;flex:1 1 100%;font-size:16px}.v455-copy-phone{flex:1 1 100%}.v455-phone-number{font-size:24px}.v455-consult-meta{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);

  window.cnmiPhysicianPhoneV455={version:VERSION,openDoctor,decorate,phoneDisplay};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v455-physician-phone-popup.js", error); }
;

/* Original source: patch-v456-physician-consult-mobile-cards.js */
try {
/* CNMI Staff Planner V456
 * Physician Consult mobile readability fix
 * - Desktop keeps the 3-column table.
 * - Mobile replaces the squeezed/hidden table columns with compact cards.
 * - Each mobile physician name remains tappable and uses the V455 phone popup/tel: behavior.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V456_PHYSICIAN_CONSULT_MOBILE_CARDS';
  if(window.__CNMI_V456_PHYSICIAN_CONSULT_MOBILE_CARDS__)return;
  window.__CNMI_V456_PHYSICIAN_CONSULT_MOBILE_CARDS__=true;

  function decorate(html){
    if(!html||!String(html).includes('data-v452-physician-card'))return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html);
      const card=tpl.content.querySelector('[data-v452-physician-card]');
      if(!card||card.querySelector('.v456-mobile-consult-list'))return html;
      const tbody=card.querySelector('.v452-dashboard-table tbody');
      if(!tbody)return html;

      const list=document.createElement('div');
      list.className='v456-mobile-consult-list';
      [...tbody.querySelectorAll('tr')].forEach((tr)=>{
        const cells=[...tr.children];
        if(cells.length<3)return;
        const time=(cells[0].textContent||'').trim();
        const site=(cells[1].textContent||'').trim();
        const doctorCell=cells[2];
        const row=document.createElement('div');
        row.className='v456-mobile-consult-row';

        const top=document.createElement('div');
        top.className='v456-mobile-consult-top';
        const siteEl=document.createElement('strong');
        siteEl.className='v456-mobile-consult-site';
        siteEl.textContent=site||'Consult';
        const timeEl=document.createElement('span');
        timeEl.className='v456-mobile-consult-time';
        timeEl.textContent=time||'-';
        top.append(siteEl,timeEl);

        const bottom=document.createElement('div');
        bottom.className='v456-mobile-consult-doctor';
        const label=document.createElement('span');
        label.className='v456-mobile-doctor-label';
        label.textContent='แพทย์';
        bottom.appendChild(label);

        const sourceButton=doctorCell.querySelector('[data-v455-doctor-id]');
        if(sourceButton){
          const button=sourceButton.cloneNode(true);
          button.classList.add('v456-mobile-doctor-button');
          bottom.appendChild(button);
        }else{
          const sourceFallback=doctorCell.querySelector('.v452-not-set')||doctorCell.firstElementChild;
          const fallback=document.createElement('span');
          fallback.className='v452-not-set v456-mobile-not-set';
          fallback.textContent=(sourceFallback?.textContent||doctorCell.textContent||'ยังไม่กำหนด').trim();
          bottom.appendChild(fallback);
        }

        row.append(top,bottom);
        list.appendChild(row);
      });

      const wrap=card.querySelector('.v452-dashboard-table-wrap');
      if(wrap)wrap.insertAdjacentElement('afterend',list);
      else card.appendChild(list);

      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){
      console.warn('[V456] decorate physician mobile cards',err);
      return html;
    }
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV456(){return decorate(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v456-physician-consult-mobile-style';
  style.textContent=`
    .v456-mobile-consult-list{display:none}
    @media(max-width:760px){
      .v452-physician-card .v452-dashboard-table-wrap{display:none!important}
      .v456-mobile-consult-list{display:grid!important;gap:9px;margin-top:10px}
      .v456-mobile-consult-row{display:grid;gap:9px;padding:12px 13px;border:1px solid #e1eaf2;border-radius:14px;background:#fbfdff;min-width:0}
      .v456-mobile-consult-top{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
      .v456-mobile-consult-site{font-size:15px;line-height:1.25;color:#263d52;min-width:0;overflow-wrap:anywhere}
      .v456-mobile-consult-time{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;padding:5px 8px;border-radius:999px;background:#eef5fb;color:#607c93;font-size:11px;font-weight:800;white-space:nowrap}
      .v456-mobile-consult-doctor{display:flex;align-items:center;gap:9px;min-width:0;padding-top:8px;border-top:1px solid #edf2f6}
      .v456-mobile-doctor-label{flex:0 0 auto;font-size:11px;font-weight:800;color:#7a8fa2}
      .v456-mobile-doctor-button{display:inline-flex!important;visibility:visible!important;opacity:1!important;max-width:100%;min-height:38px!important;padding:7px 12px!important;font-size:14px!important;white-space:normal!important;text-align:left!important;overflow-wrap:anywhere}
      .v456-mobile-not-set{font-size:13px;font-weight:800}
      .v452-physician-card .v452-card-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:10px!important;flex-wrap:wrap}
      .v452-physician-card .v452-card-meta{justify-content:flex-start!important}
    }
    @media(max-width:390px){
      .v456-mobile-consult-top{align-items:flex-start;flex-direction:column;gap:6px}
      .v456-mobile-consult-time{align-self:flex-start}
    }
  `;
  document.head.appendChild(style);

  window.cnmiPhysicianMobileV456={version:VERSION,decorate};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v456-physician-consult-mobile-cards.js", error); }
;

/* Original source: patch-v457-hr-status-leave-only-calendar.js */
try {
/* CNMI Staff Planner V457
 * HR workflow badge belongs to leave requests only.
 * Prevent V453/V454 HR badges from appearing on activities, training, meetings,
 * outings, holidays, roster duties, or other non-leave calendar events.
 * Display-only. No Supabase schema/query/write changes.
 */
(function(){
  'use strict';
  const VERSION='V457_HR_STATUS_LEAVE_ONLY_CALENDAR';
  if(window.__CNMI_V457_HR_STATUS_LEAVE_ONLY_CALENDAR__)return;
  window.__CNMI_V457_HR_STATUS_LEAVE_ONLY_CALENDAR__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function rowType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function isRealLeaveEvent(e){
    if(!e||!e.raw)return false;
    const rows=Array.isArray(S().leaves)?S().leaves:[];
    /* collectCalendarEvents keeps the original leave object in e.raw. */
    let found=rows.includes(e.raw);
    if(!found&&e.raw?.id!=null){
      const id=String(e.raw.id);
      found=rows.some(r=>String(r?.id??'')===id && String(r?.staff_id??'')===String(e.raw?.staff_id??''));
    }
    if(!found)return false;
    return rowType(e.raw)!=='ไม่รับเวร';
  }
  function stripHrPills(html){
    const text=String(html||'');
    if(!/v45[34]-.*hr-pill|v445-hr-pill/.test(text))return text;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=text;
      tpl.content.querySelectorAll('.v453-calendar-hr-pill,.v454-calendar-hr-pill,.v453-hr-pill.v445-hr-pill,.v454-hr-pill.v445-hr-pill').forEach(n=>n.remove());
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML.replace(/^\s*<br\s*\/?>(?=\s*$)/i,'');
    }catch(_){
      return text
        .replace(/<br\s*\/?>\s*<span[^>]*class=["'][^"']*(?:v453-calendar-hr-pill|v454-calendar-hr-pill)[^"']*["'][^>]*>.*?<\/span>/gis,'')
        .replace(/<span[^>]*class=["'][^"']*(?:v453-calendar-hr-pill|v454-calendar-hr-pill)[^"']*["'][^>]*>.*?<\/span>/gis,'');
    }
  }

  const previousDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof previousDetail==='function'&&!previousDetail.__v457Wrapped){
    const wrapped=function calendarEventDetailV457(e){
      const html=previousDetail.apply(this,arguments);
      return isRealLeaveEvent(e)?html:stripHrPills(html);
    };
    wrapped.__v457Wrapped=true;
    try{window.calendarEventDetail=calendarEventDetail=wrapped;}catch(_){window.calendarEventDetail=wrapped;}
  }

  /* Also clean metadata injected by V453/V454 on non-leave events so future UI
     code cannot accidentally treat activities/duties as HR-tracked leave. */
  const previousCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof previousCollect==='function'&&!previousCollect.__v457Wrapped){
    const wrapped=function collectCalendarEventsV457(){
      const events=previousCollect.apply(this,arguments)||[];
      return events.map(e=>{
        if(isRealLeaveEvent(e))return e;
        if(!('hrStatusV453' in e)&&!('hrStatusV454' in e))return e;
        const clean={...e};
        delete clean.hrStatusV453;
        delete clean.hrStatusV454;
        return clean;
      });
    };
    wrapped.__v457Wrapped=true;
    try{window.collectCalendarEvents=collectCalendarEvents=wrapped;}catch(_){window.collectCalendarEvents=wrapped;}
  }

  window.cnmiHrStatusLeaveOnlyV457={version:VERSION,isRealLeaveEvent};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v457-hr-status-leave-only-calendar.js", error); }
;

/* Original source: patch-v459-hr-status-real-leave-only-final.js */
try {
/* CNMI Staff Planner V459
 * Final calendar HR-status guard.
 * HR workflow belongs ONLY to real leave records in state.leaves.
 * Never show HR status on roster duties, activities, training, meetings,
 * outings, holidays, standards, CODE events, or "ไม่รับเวร".
 * Display-only; no Supabase schema/query/write changes.
 */
(function(){
  'use strict';
  const VERSION='V459_HR_STATUS_REAL_LEAVE_ONLY_FINAL';
  if(window.__CNMI_V459_HR_STATUS_REAL_LEAVE_ONLY_FINAL__)return;
  window.__CNMI_V459_HR_STATUS_REAL_LEAVE_ONLY_FINAL__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}

  function isRealLeaveEvent(e){
    if(!e || !e.raw) return false;
    const type=String(e.type||'').trim();
    if(!type.startsWith('leave-')) return false;
    /* "ไม่รับเวร" is emitted as noduty, but keep an explicit guard. */
    if(type==='noduty') return false;

    const rows=Array.isArray(S().leaves)?S().leaves:[];
    if(rows.includes(e.raw)) return true;
    if(e.raw?.id==null) return false;
    const id=String(e.raw.id);
    const staffId=String(e.raw?.staff_id??'');
    return rows.some(r=>String(r?.id??'')===id && String(r?.staff_id??'')===staffId);
  }

  const HR_TEXTS=new Set([
    '✓ ตรวจสอบ HR แล้ว','✓ ตรวจ HR แล้ว','รอตรวจสอบ HR','ยังไม่ลง HR','รอเอกสาร HR','HR ยกเลิก'
  ]);

  function stripHrMarkup(html){
    const source=String(html||'');
    if(!/HR|hr-|v45[34]/i.test(source)) return source;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=source;
      tpl.content.querySelectorAll(
        '.v453-calendar-hr-pill,.v454-calendar-hr-pill,.v453-hr-pill,.v454-hr-pill,.hr-checked-badge'
      ).forEach(n=>n.remove());
      tpl.content.querySelectorAll('span,button,div').forEach(n=>{
        const text=String(n.textContent||'').replace(/\s+/g,' ').trim();
        if(HR_TEXTS.has(text) && /badge|pill|hr/i.test(String(n.className||''))) n.remove();
      });
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML
        .replace(/(?:<br\s*\/?>(?:\s|&nbsp;)*){2,}/gi,'<br>')
        .replace(/^\s*<br\s*\/?>/i,'');
    }catch(_){
      return source
        .replace(/<br\s*\/?>\s*<span[^>]*class=["'][^"']*(?:v453|v454|hr-checked)[^"']*["'][^>]*>.*?<\/span>/gis,'')
        .replace(/<span[^>]*class=["'][^"']*(?:v453|v454|hr-checked)[^"']*["'][^>]*>.*?<\/span>/gis,'');
    }
  }

  /* Clean metadata first so downstream renderers cannot interpret a non-leave
     event as an HR-tracked row. */
  const previousCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof previousCollect==='function'&&!previousCollect.__v459Wrapped){
    const wrapped=function collectCalendarEventsV459(){
      const events=previousCollect.apply(this,arguments)||[];
      return events.map(e=>{
        if(isRealLeaveEvent(e)) return e;
        if(!e || typeof e!=='object') return e;
        const clean={...e,hrChecked:false};
        delete clean.hrStatusV453;
        delete clean.hrStatusV454;
        return clean;
      });
    };
    wrapped.__v459Wrapped=true;
    try{window.collectCalendarEvents=collectCalendarEvents=wrapped;}catch(_){window.collectCalendarEvents=wrapped;}
  }

  /* Day/week views call calendarEventDetail directly. */
  const previousDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof previousDetail==='function'&&!previousDetail.__v459Wrapped){
    const wrapped=function calendarEventDetailV459(e){
      const html=String(previousDetail.apply(this,arguments)||'');
      return isRealLeaveEvent(e)?html:stripHrMarkup(html);
    };
    wrapped.__v459Wrapped=true;
    try{window.calendarEventDetail=calendarEventDetail=wrapped;}catch(_){window.calendarEventDetail=wrapped;}
  }

  /* Modal rows are sanitized again at the final HTML boundary. This makes the
     fix independent of older patch wrapping order. */
  const previousModalRow=window.renderCalendarModalRow||(typeof renderCalendarModalRow==='function'?renderCalendarModalRow:null);
  if(typeof previousModalRow==='function'&&!previousModalRow.__v459Wrapped){
    const wrapped=function renderCalendarModalRowV459(e){
      const html=String(previousModalRow.apply(this,arguments)||'');
      return isRealLeaveEvent(e)?html:stripHrMarkup(html);
    };
    wrapped.__v459Wrapped=true;
    try{window.renderCalendarModalRow=renderCalendarModalRow=wrapped;}catch(_){window.renderCalendarModalRow=wrapped;}
  }

  window.cnmiHrStatusRealLeaveOnlyV459={version:VERSION,isRealLeaveEvent,stripHrMarkup};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v459-hr-status-real-leave-only-final.js", error); }
;

/* Original source: patch-v460-offday-consult-helper-admin-alerts.js */
try {
/* CNMI Staff Planner V460
 * Off-day dashboard clarity + 24h physician consult + helper names + Admin action center.
 *
 * 1) Saturday/Sunday/public holiday:
 *    - Hide leave count from Dashboard summary.
 *    - Show only "ไม่รับเวร" in the leave/no-duty section.
 *    - Holiday manpower no longer displays/subtracts normal leave; it uses roster + helper signups.
 *    - Show helper names directly on Dashboard.
 * 2) Physician Consult:
 *    - Off-day uses one Donor & BB physician for 24 hours (from on-call range / daily override).
 *    - Physician name remains tappable for V455 phone popup.
 * 3) Admin action center:
 *    - Global pending items on Dashboard without manually switching month menus.
 *    - Trade confirmed waiting Admin, OT pending, leave cancellation, profile changes,
 *      donor-helper cancellations, and HR follow-up.
 *    - Tapping an item opens the correct page/month when applicable.
 *
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V491_ADMIN_PENDING_FRESH_MANUAL_ONLY';
  if(window.__CNMI_V460_OFFDAY_CONSULT_HELPER_ADMIN_ALERTS__)return;
  window.__CNMI_V460_OFFDAY_CONSULT_HELPER_ADMIN_ALERTS__=true;

  const pendingCache={status:'idle',error:'',loadedAt:0,categories:[],promise:null};

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(todayStr());}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function isOffDay(date){try{return window.cnmiDashboardHolidayManpowerV440?.isOffDay?.(date)??(isWeekendSafe(date)||isHolidaySafe(date));}catch(_){return isWeekendSafe(date)||isHolidaySafe(date);}}
  function actualAdmin(){try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function adminMode(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return actualAdmin();}}
  function forceAdminView(){
    if(!actualAdmin())return;
    try{
      const st=S(),id=st?.session?.user?.id||st?.profile?.user_id||st?.profile?.id||st?.profile?.email||'guest';
      st.viewAsMode='admin';
      window.localStorage?.setItem?.(`cnmi_view_as_mode_${id}`,'admin');
    }catch(_){ }
  }
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}}
  function monthOf(date){return norm(date).slice(0,7);}
  function monthEnd(key){const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));if(!m)return'';return `${key}-${String(new Date(Number(m[1]),Number(m[2]),0).getDate()).padStart(2,'0')}`;}
  function addMonths(key,delta){const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));if(!m)return key;const d=new Date(Number(m[1]),Number(m[2])-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function thaiDateTime(v){try{return typeof formatThaiDateTime==='function'?formatThaiDateTime(v):String(v||'');}catch(_){return String(v||'');}}
  function mergeRows(key,rows){
    const st=S(),cur=Array.isArray(st[key])?st[key]:[],map=new Map();
    [...cur,...(rows||[])].forEach(r=>{if(r?.id!=null)map.set(String(r.id),r);});
    st[key]=[...map.values()];
  }

  function groupOf(staff){
    const type=String(staff?.staff_type||'').trim(),role=String(staff?.role||'').trim(),text=`${type} ${role}`;
    if(window.cnmiPersonTypeV516?.isPhysician?.(staff) ?? /^(แพทย์|physician|doctor)$/i.test(type))return 'แพทย์';
    if(type==='เคิก'||/clerk|ธุรการ/i.test(text))return 'เคิก';
    return 'MT';
  }
  function rosterGroupCounts(ids){
    const out={MT:0,'เคิก':0,'แพทย์':0};
    (ids||[]).forEach(id=>{const g=groupOf(staffById(id));out[g]=(out[g]||0)+1;});
    return out;
  }
  function helperName(row){
    if(row?.internal_staff_id){const p=staffById(row.internal_staff_id);if(p)return p.nickname||p.full_name||row.helper_name||'-';}
    return String(row?.helper_name||'-').trim()||'-';
  }
  function helperUnit(row){
    if(row?.internal_staff_id)return 'ในหน่วย';
    const unit=String(row?.unit_name||'').trim();
    return unit&&unit!=='หน่วยเวชศาสตร์บริการโลหิต'?unit:'นอกหน่วย';
  }
  function helperNamesHtml(h){
    if(!h?.loaded){
      if(h?.loading)return '<span class="v460-helper-loading">กำลังโหลดรายชื่อ…</span>';
      if(h?.error)return '<span class="v460-helper-error">โหลดรายชื่อไม่สำเร็จ</span>';
      return '<span class="v460-helper-loading">กำลังตรวจรายชื่อ…</span>';
    }
    if(!h.rows?.length)return '<span class="v460-helper-empty">ยังไม่มีผู้ลงชื่อมาช่วย</span>';
    return `<div class="v460-helper-names">${h.rows.map(r=>`<span class="v460-helper-name"><b>${esc(helperName(r))}</b><small>${esc(helperUnit(r))}</small></span>`).join('')}</div>`;
  }

  function rebuildOffdayManpower(root,date){
    const card=root.querySelector?.('[data-v440-holiday-manpower]');
    const api=window.cnmiDashboardHolidayManpowerV440;
    if(!card||!api?.offDayManpower)return;
    const m=api.offDayManpower(date),h=m.helpers||{};
    const scheduled=[...(m.scheduled||[])],groups=rosterGroupCounts(scheduled);
    const helperCount=h.loaded?Number(h.total||0):null;
    const total=scheduled.length+(helperCount==null?0:helperCount);
    const totalText=helperCount==null?`${scheduled.length}+…`:String(total);
    const holidayText=(()=>{try{const d=new Date(`${date}T12:00:00`),w=d.toLocaleDateString('th-TH',{weekday:'long'});return isHolidaySafe(date)?`${w} • ${holidayName(date)||'วันหยุดนักขัตฤกษ์'}`:w;}catch(_){return 'วันหยุด';}})();
    card.classList.add('v460-offday-manpower');
    card.innerHTML=`
      <div class="v440-title-row">
        <div class="v433-manpower-title">กำลังคนตามเวร <small>${esc(holidayText)}</small></div>
        <div class="v440-pills">${h.loaded?`<span class="v440-helper-pill">มาช่วย ${helperCount}</span>`:'<span class="v440-helper-pill muted">มาช่วย …</span>'}</div>
      </div>
      <div class="v440-main-count"><strong>${esc(totalText)}</strong><span>คน</span><small>รวมตารางเวร + คนมาช่วย</small></div>
      <div class="v440-breakdown v460-offday-breakdown">
        <div><span>จัดเวร</span><b>${scheduled.length}</b><small>คน</small></div>
        <div><span>คนมาช่วย</span><b>${helperCount==null?'…':helperCount}</b><small>คน</small></div>
        <div><span>รวม</span><b>${esc(totalText)}</b><small>คน</small></div>
      </div>
      <div class="v440-detail-lines v460-offday-detail">
        <div><b>เวร</b><span>MT ${groups.MT||0} • เคิก ${groups['เคิก']||0} • แพทย์ ${groups['แพทย์']||0}</span></div>
        <div class="v460-helper-detail"><b>คนมาช่วย</b>${helperNamesHtml(h)}</div>
      </div>
      <div class="v440-note">นับคนไม่ซ้ำจากตารางเวร + ผู้ลงชื่อมาช่วย • ไม่รับเวรแสดงแยกด้านล่าง</div>`;
  }

  function noDutyRows(date){
    const effective=r=>{try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(r):!['cancelled','ยกเลิก'].includes(String(r?.status||'').toLowerCase());}catch(_){return true;}};
    const overlap=r=>{try{return typeof overlapsDate==='function'?!!overlapsDate(r,date):(norm(r?.start_date)<=date&&norm(r?.end_date||r?.start_date)>=date);}catch(_){return false;}};
    return (S().leaves||[]).filter(r=>effective(r)&&overlap(r)&&String(r?.type||r?.leave_type||'').split(':::')[0].trim()==='ไม่รับเวร')
      .sort((a,b)=>String(a?.created_at||'').localeCompare(String(b?.created_at||'')));
  }
  function rebuildNoDutyOnly(root,date){
    const sections=[...root.querySelectorAll?.('.card')||[]];
    const card=sections.find(c=>/ลา\s*\/\s*ไม่รับเวร|ไม่รับเวร/.test(String(c.querySelector?.('.section-title h3')?.textContent||'').trim())&&c.querySelector('.section-title'));
    if(!card)return;
    const title=card.querySelector('.section-title h3');if(title)title.textContent='ไม่รับเวร';
    [...card.children].forEach(ch=>{if(!ch.classList?.contains('section-title'))ch.remove();});
    const rows=noDutyRows(date);
    if(!rows.length){card.insertAdjacentHTML('beforeend','<div class="empty-state">ไม่มีคนไม่รับเวรในวันที่เลือก</div>');return;}
    const list=document.createElement('div');list.className='v460-no-duty-list';
    rows.forEach((r,i)=>{
      const seq=Number(r?.no_duty_sequence||r?.leave_sequence||0)||i+1;
      const item=document.createElement('div');item.className='v460-no-duty-row';
      item.innerHTML=`<span class="v460-no-duty-name">${esc(staffName(r.staff_id))}</span><span class="v460-no-duty-seq">ลำดับไม่รับเวร ${seq}</span><span class="v460-no-duty-badge">ไม่รับเวร</span>`;
      list.appendChild(item);
    });
    card.appendChild(list);
  }
  function hideOffdayLeaveStat(root){
    const stats=root.querySelector?.('.v401-dashboard-stats');if(!stats)return;
    const card=[...stats.querySelectorAll(':scope > .stat-card')].find(c=>/^คนลา(?:วันนี้)?$/.test(String(c.querySelector('.label')?.textContent||'').trim()));
    if(card)card.remove();
    stats.classList.add('v460-offday-stats');
  }

  function doctorButton(id,site,time){
    if(!id)return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" aria-label="ดูเบอร์โทร ${esc(staffName(id))}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(staffName(id))}</button>`;
  }
  function rebuildOffdayPhysician(root,date){
    if(!isOffDay(date))return;
    const card=root.querySelector?.('[data-v452-physician-card]'),api=window.cnmiPhysicianConsultV452;
    if(!card||!api?.baseForDate||!api?.cache?.loaded)return;
    const m=api.baseForDate(date),id=m?.combined||null,time='24 ชม.',site='Donor & BB';
    const ready=card.querySelector('.v452-ready');
    if(ready){ready.textContent=`พร้อม ${id?1:0}/1`;ready.classList.toggle('is-complete',!!id);}
    const tbody=card.querySelector('.v452-dashboard-table tbody');
    if(tbody)tbody.innerHTML=`<tr><td>${esc(time)}</td><td><b>${esc(site)}</b></td><td>${doctorButton(id,site,time)}</td></tr>`;
    let list=card.querySelector('.v456-mobile-consult-list');
    if(!list){list=document.createElement('div');list.className='v456-mobile-consult-list';card.appendChild(list);}
    list.innerHTML=`<div class="v456-mobile-consult-row"><div class="v456-mobile-consult-top"><strong class="v456-mobile-consult-site">${esc(site)}</strong><span class="v456-mobile-consult-time">${esc(time)}</span></div><div class="v456-mobile-consult-doctor"><span class="v456-mobile-doctor-label">แพทย์</span>${id?doctorButton(id,site,time).replace('v455-doctor-contact-btn"','v455-doctor-contact-btn v456-mobile-doctor-button"'):'<span class="v452-not-set v456-mobile-not-set">ยังไม่กำหนด</span>'}</div></div>`;
  }

  function tradeSnapshot(note,key){const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i'));if(!m?.[1])return'';try{return decodeURIComponent(m[1]);}catch(_){return m[1];}}
  function profilePendingRows(){return (S().profileChangeRequests||[]).filter(r=>['pending','รออนุมัติ','รอตรวจ','รอตรวจสอบ',''].includes(String(r?.status||'pending').trim().toLowerCase()));}
  function safeRows(res){return res&&!res.error?(res.data||[]):[];}
  function parseRpcPayload(data){if(!data)return{};if(typeof data==='string'){try{return JSON.parse(data)||{};}catch(_){return{};}}return data||{};}
  function currentMonthBangkok(){try{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date()),m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}`;}catch(_){return monthOf(selectedDate());}}

  async function loadHelperCancelRequests(db){
    const months=Array.from({length:4},(_,i)=>addMonths(currentMonthBangkok(),i));
    const rows=[];
    for(const month of months){
      try{
        const res=await db.rpc('get_donor_helper_month_internal_v327',{p_month:month});
        if(res?.error)continue;
        const payload=parseRpcPayload(res.data),items=Array.isArray(payload?.rows)?payload.rows:[];
        items.filter(r=>String(r?.status||'').toLowerCase()==='cancel_requested').forEach(r=>rows.push({...r,_v460_month:month}));
      }catch(_){ }
    }
    const seen=new Set();return rows.filter(r=>{const k=String(r?.id||'');if(!k||seen.has(k))return false;seen.add(k);return true;});
  }

  async function loadAdminPending(force=false){
    if(!actualAdmin())return [];
    if(pendingCache.status==='loading'&&!force)return pendingCache.promise;
    if(pendingCache.status==='loaded'&&!force)return pendingCache.categories;
    const db=DB();if(!db)return[];
    pendingCache.status='loading';pendingCache.error='';
    const promise=(async()=>{
      try{
        const [tradesRes,otRes,leaveRes,profileRes,hrRes,helperCancels]=await Promise.all([
          db.from('roster_trade_requests').select('*').eq('status','confirmed').order('created_at',{ascending:false}).limit(200),
          db.from('ot_requests').select('*').in('status',['รออนุมัติ','pending']).order('work_date',{ascending:true}).limit(200),
          db.from('leave_requests').select('*').in('status',['รออนุมัติยกเลิก','cancel_requested','pending_cancel','pending_cancellation']).order('start_date',{ascending:true}).limit(200),
          db.from('profile_change_requests').select('*').order('created_at',{ascending:false}).limit(200),
          db.from('hr_checks').select('*').order('updated_at',{ascending:false}).limit(1000),
          loadHelperCancelRequests(db)
        ]);
        const trades=safeRows(tradesRes),ots=safeRows(otRes),leaveCancels=safeRows(leaveRes),hrRows=safeRows(hrRes);
        let profileRows=safeRows(profileRes);
        if(!profileRows.length&&profileRes?.error){
          const sid=S()?.profile?.id||null,email=S()?.profile?.email||S()?.session?.user?.email||null,uid=S()?.session?.user?.id||null;
          for(const fn of ['list_profile_change_requests_v57','list_profile_change_requests_v56','list_profile_change_requests_v52']){
            try{const q=await db.rpc(fn,{p_staff_id:sid,p_user_email:email,p_user_id:uid,p_is_admin:true});if(!q?.error&&Array.isArray(q?.data)&&q.data.length){profileRows=q.data;break;}}catch(_){ }
          }
        }
        if(profileRows.length)S().profileChangeRequests=profileRows;
        // V491: replace the HR snapshot even when the server returns zero rows.
        // Keeping an old non-empty state here was the main reason completed HR items
        // could reappear after reopening the Dashboard.
        S().hrChecks=hrRows;
        const assignmentIds=[...new Set(trades.map(r=>String(r?.from_assignment_id||'')).filter(Boolean))];
        let assignments=[];
        if(assignmentIds.length){
          for(let i=0;i<assignmentIds.length;i+=80){
            const q=await db.from('roster_assignments').select('id,duty_date,duty_code,staff_id').in('id',assignmentIds.slice(i,i+80));
            if(!q.error)assignments.push(...(q.data||[]));
          }
        }
        mergeRows('tradeRequests',trades);mergeRows('otRequests',ots);mergeRows('leaves',leaveCancels);mergeRows('rosterAssignments',assignments);
        const amap=new Map(assignments.map(a=>[String(a.id),a]));
        const tradeItems=trades.map(r=>{
          const a=amap.get(String(r.from_assignment_id||''))||{};
          const date=norm(a.duty_date)||norm(tradeSnapshot(r.note,'SELL_DATE'));
          const duty=a.duty_code||tradeSnapshot(r.note,'SELL_DUTY')||'เวร';
          return {id:r.id,page:'tradeRequests',month:monthOf(date),date,title:`${staffName(r.requester_id)} → ${staffName(r.receiver_id)}`,detail:`${date?thaiDate(date):'ไม่พบวันที่'} · ${duty}`};
        });
        const otItems=ots.map(r=>({id:r.id,page:'ot',month:monthOf(r.work_date),date:norm(r.work_date),title:staffName(r.staff_id),detail:`${thaiDate(norm(r.work_date))} · ${String(r.reason||'OT').trim()||'OT'}`}));
        const leaveItems=leaveCancels.map(r=>({id:r.id,page:'leave',month:monthOf(r.start_date),date:norm(r.start_date),title:staffName(r.staff_id),detail:`${String(r.type||r.leave_type||'ลา').split(':::')[0]} · ${thaiDate(norm(r.start_date))}${norm(r.end_date)&&norm(r.end_date)!==norm(r.start_date)?`–${thaiDate(norm(r.end_date))}`:''}`}));
        const profileItems=(profileRows.length?profileRows:profilePendingRows()).filter(r=>['pending','รออนุมัติ','รอตรวจ','รอตรวจสอบ',''].includes(String(r?.status||'pending').trim().toLowerCase())).map(r=>{const who=staffById(r.staff_id);return{id:r.id,page:'profileRequests',month:'',date:norm(r.created_at),title:who?(who.nickname||who.full_name||'-'):String(r.staff_nickname||r.staff_full_name||r.staff_email||'เจ้าหน้าที่'),detail:`ขอแก้ ${String(r.field_name||'ข้อมูลส่วนตัว')} · ${thaiDateTime(r.created_at)}`};});
        const helperItems=(helperCancels||[]).map(r=>({id:r.id,page:'donorHelpers',month:r._v460_month||monthOf(r.work_date),date:norm(r.work_date),title:helperName(r),detail:`${thaiDate(norm(r.work_date))} · ขอยกเลิกมาช่วย`}));
        let hrItems=[];
        try{
          // V491: build Admin HR work directly from the fresh hr_checks query.
          // Only rows that Staff already confirmed in HC iService are Admin work.
          const pendingHr=hrRows.filter(h=>{
            const st=String(h?.status||'').trim();
            return !!h?.hr_reported_date && st!=='ตรวจสอบแล้ว' && st!=='ยกเลิก';
          });
          const leaveIds=[...new Set(pendingHr.map(h=>String(h?.leave_request_id||'')).filter(Boolean))];
          let hrLeaves=[];
          for(let i=0;i<leaveIds.length;i+=80){
            const q=await db.from('leave_requests').select('*').in('id',leaveIds.slice(i,i+80));
            if(!q?.error)hrLeaves.push(...(q.data||[]));
          }
          const lmap=new Map(hrLeaves.map(r=>[String(r?.id||''),r]));
          // Update only the fetched HR-related leave rows in app state so the HR page
          // and Dashboard agree after a manual refresh.
          if(hrLeaves.length)mergeRows('leaves',hrLeaves);
          hrItems=pendingHr.map(h=>{
            const r=lmap.get(String(h?.leave_request_id||''));
            if(!r)return null;
            const type=String(r.type||r.leave_type||'ลา').split(':::')[0];
            return {id:r.id,page:'hr',month:monthOf(r.start_date),date:norm(r.start_date),title:staffName(r.staff_id),detail:`${type} · น้องแจ้งแล้ว · รอตรวจสอบ HR`};
          }).filter(Boolean);
        }catch(err){console.warn('[V491] fresh HR pending',err);}
        pendingCache.categories=[
          {key:'trade',label:'ขายเวร รอ Admin บันทึก',tone:'purple',items:tradeItems},
          {key:'ot',label:'OT รออนุมัติ',tone:'blue',items:otItems},
          {key:'leaveCancel',label:'ยกเลิกลา รออนุมัติ',tone:'orange',items:leaveItems},
          {key:'profile',label:'แก้ไขข้อมูลส่วนตัว',tone:'teal',items:profileItems},
          {key:'helper',label:'ยกเลิกคนมาช่วย',tone:'red',items:helperItems},
          {key:'hr',label:'ตรวจ HR',tone:'gray',items:hrItems}
        ].filter(c=>c.items.length);
        pendingCache.status='loaded';pendingCache.loadedAt=Date.now();
        return pendingCache.categories;
      }catch(err){
        pendingCache.status='error';pendingCache.error=String(err?.message||err||'โหลดรายการไม่สำเร็จ');console.warn('[V460] pending center',err);return[];
      }finally{
        pendingCache.promise=null;
        try{if(String(S().page||'')==='dashboard'&&typeof renderPage==='function')renderPage();}catch(_){ }
      }
    })();
    pendingCache.promise=promise;return promise;
  }

  function adminPendingPanel(){
    if(!actualAdmin())return'';
    if(pendingCache.status==='idle')return `<section class="card v460-admin-pending" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>กด ↻ เมื่อต้องการตรวจรายการล่าสุดจาก Supabase</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total is-loading">—</span><button type="button" class="v460-refresh-icon" data-v460-refresh-pending title="ตรวจรายการล่าสุด">↻</button></div></div></section>`;
    if(pendingCache.status==='loading')return `<section class="card v460-admin-pending" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>กำลังรวมรายการจากทุกเดือน</p></div><span class="v460-admin-total is-loading">…</span></div></section>`;
    if(pendingCache.status==='error')return `<section class="card v460-admin-pending" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p class="v460-admin-error">${esc(pendingCache.error)}</p></div><button type="button" class="ghost-btn" data-v460-refresh-pending>ลองใหม่</button></div></section>`;
    const cats=pendingCache.categories||[],total=cats.reduce((n,c)=>n+c.items.length,0);
    if(!total)return `<section class="card v460-admin-pending is-clear" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ตอนนี้ไม่มีรายการค้างที่ต้องกดอนุมัติหรือบันทึก</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total is-clear">0</span><button type="button" class="v460-refresh-icon" data-v460-refresh-pending title="รีเฟรช">↻</button></div></div></section>`;
    return `<section class="card v460-admin-pending" data-v460-admin-pending>
      <div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>รวมทุกเดือนแล้ว ไม่ต้องไล่เปลี่ยนเดือนทีละเมนู</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total">${total}</span><button type="button" class="v460-refresh-icon" data-v460-refresh-pending title="รีเฟรช">↻</button></div></div>
      <div class="v460-admin-categories">${cats.map(c=>`<div class="v460-admin-category tone-${esc(c.tone)}"><div class="v460-admin-category-head"><b>${esc(c.label)}</b><span>${c.items.length}</span></div><div class="v460-admin-items">${c.items.slice(0,6).map(item=>`<button type="button" class="v460-admin-item" data-v460-open-page="${esc(item.page)}" data-v460-open-month="${esc(item.month||'')}" data-v460-open-date="${esc(item.date||'')}"><span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span><em>เปิด ›</em></button>`).join('')}${c.items.length>6?`<div class="v460-admin-more">และอีก ${c.items.length-6} รายการ</div>`:''}</div></div>`).join('')}</div>
    </section>`;
  }

  function injectAdminPending(root){
    if(!actualAdmin()||root.querySelector('[data-v460-admin-pending]'))return;
    const html=adminPendingPanel();if(!html)return;
    const t=document.createElement('template');t.innerHTML=html.trim();
    const nav=root.querySelector('[data-v443-dashboard-date-nav]');
    if(nav)nav.insertAdjacentElement('afterend',t.content.firstElementChild);
    else root.insertBefore(t.content.firstElementChild,root.firstChild);
  }

  function mutateDashboard(html){
    try{
      const date=selectedDate(),tpl=document.createElement('template');tpl.innerHTML=String(html||'');const root=tpl.content;
      if(isOffDay(date)){
        hideOffdayLeaveStat(root);
        rebuildOffdayManpower(root,date);
        rebuildNoDutyOnly(root,date);
        rebuildOffdayPhysician(root,date);
      }
      injectAdminPending(root);
      const out=document.createElement('div');out.appendChild(root.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn('[V460] dashboard mutation',err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV460(){return mutateDashboard(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function openPendingTarget(button){
    const st=S(),page=button.getAttribute('data-v460-open-page')||'dashboard',month=button.getAttribute('data-v460-open-month')||'',date=button.getAttribute('data-v460-open-date')||'';
    forceAdminView();
    if(page==='tradeRequests'&&month){st.monthKey=month;st.tradeFilterStaff='';}
    if(page==='ot'&&month){st.otApprovalStatusFilter='รออนุมัติ';st.otApprovalStartDate=`${month}-01`;st.otApprovalEndDate=monthEnd(month);}
    if(page==='donorHelpers'&&month){st.donorHelperMonthV327=month;st.donorHelperLoadedMonthV327='';st.donorHelperErrorV327='';}
    if(page==='hr'&&month){st.hrFilterMonth=month;}
    if(page==='leave'&&month){try{st.leaveFilterMonth=month;}catch(_){ }}
    st.page=page;
    try{if(typeof renderPage==='function')renderPage();}catch(_){ }
    if(page==='donorHelpers'&&month){try{window.cnmiDonorHelperV327?.loadMonth?.(month,{force:true});}catch(_){ }}
    if(date){setTimeout(()=>{try{document.querySelector(`[data-date="${CSS.escape(date)}"]`)?.scrollIntoView({block:'center'});}catch(_){ }},120);}
  }

  document.addEventListener('click',e=>{
    const refresh=e.target?.closest?.('[data-v460-refresh-pending]');
    if(refresh){
      e.preventDefault();e.stopPropagation();
      pendingCache.status='idle';pendingCache.error='';pendingCache.categories=[];pendingCache.loadedAt=0;
      try{if(typeof renderPage==='function')renderPage();}catch(_){}
      loadAdminPending(true);
      return;
    }
    const open=e.target?.closest?.('[data-v460-open-page]');
    if(open){e.preventDefault();e.stopPropagation();openPendingTarget(open);}
  },true);

  const style=document.createElement('style');style.id='cnmi-v460-style';style.textContent=`
    .v401-dashboard-stats.v460-offday-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
    .v460-helper-detail{align-items:flex-start!important}.v460-helper-names{display:flex;gap:5px;flex-wrap:wrap;min-width:0}.v460-helper-name{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid #cfe3f0;background:#f2f9fd;border-radius:999px;color:#285a79;line-height:1.15}.v460-helper-name b{min-width:0!important;font-size:10px}.v460-helper-name small{font-size:8px!important;color:#71899a!important}.v460-helper-loading,.v460-helper-empty{color:#7b8fa2}.v460-helper-error{color:#b45309}
    .v460-no-duty-list{display:grid;gap:8px}.v460-no-duty-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 12px;border:1px solid #e1e9f1;border-radius:12px;background:#fbfdff}.v460-no-duty-name{font-weight:900;color:#263d52;font-size:14px}.v460-no-duty-seq,.v460-no-duty-badge{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:850}.v460-no-duty-seq{border:1px solid #c8d9e6;color:#537087;background:#fff}.v460-no-duty-badge{background:#eef1f4;color:#4d5d6b}
    .v460-admin-pending{margin:0 0 14px;border:1px solid #f2d5a8;background:linear-gradient(180deg,#fffdf8,#fff);box-shadow:0 6px 18px rgba(99,72,29,.05)}.v460-admin-pending.is-clear{border-color:#cde8d6;background:linear-gradient(180deg,#fbfffc,#fff)}.v460-admin-pending-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v460-admin-pending-head h3{margin:0;color:#2b4052;font-size:17px}.v460-admin-pending-head p{margin:4px 0 0;color:#718397;font-size:11px}.v460-admin-head-actions{display:flex;align-items:center;gap:6px}.v460-admin-total{display:grid;place-items:center;min-width:36px;height:36px;padding:0 9px;border-radius:999px;background:#fff0d8;color:#a45a00;font-size:17px;font-weight:950;border:1px solid #ffd49a}.v460-admin-total.is-clear{background:#eaf8ef;border-color:#bee5ca;color:#197342}.v460-admin-total.is-loading{color:#73899b;background:#f2f6f9;border-color:#dce6ed}.v460-refresh-icon{width:32px;height:32px;border:1px solid #dae5ed;border-radius:50%;background:#fff;color:#57758b;font:inherit;font-weight:900;cursor:pointer}.v460-admin-error{color:#b42318!important}.v460-admin-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.v460-admin-category{border:1px solid #e3eaf0;border-radius:13px;overflow:hidden;background:#fff}.v460-admin-category-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#f8fafc}.v460-admin-category-head b{font-size:12px;color:#344d61}.v460-admin-category-head span{min-width:24px;height:24px;padding:0 6px;border-radius:999px;display:grid;place-items:center;font-size:10px;font-weight:900;background:#eef3f7;color:#5c7285}.v460-admin-items{display:grid}.v460-admin-item{appearance:none;border:0;border-top:1px solid #edf1f4;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:9px 10px;cursor:pointer;color:inherit;font:inherit}.v460-admin-item:hover{background:#f8fbfd}.v460-admin-item>span{display:grid;gap:2px;min-width:0}.v460-admin-item b{font-size:11px;color:#294257;overflow-wrap:anywhere}.v460-admin-item small{font-size:9px;color:#778a9b;line-height:1.35}.v460-admin-item em{font-size:9px;font-style:normal;font-weight:850;color:#2677a8;white-space:nowrap}.v460-admin-more{padding:7px 10px;border-top:1px solid #edf1f4;color:#7c8f9e;font-size:9px}.tone-purple .v460-admin-category-head{background:#faf7ff}.tone-purple .v460-admin-category-head span{background:#eee6ff;color:#6541a5}.tone-blue .v460-admin-category-head{background:#f2f9ff}.tone-blue .v460-admin-category-head span{background:#e2f2ff;color:#2472a5}.tone-orange .v460-admin-category-head{background:#fff8ef}.tone-orange .v460-admin-category-head span{background:#ffedd5;color:#a85a00}.tone-teal .v460-admin-category-head{background:#f1fbf9}.tone-teal .v460-admin-category-head span{background:#dff5ef;color:#267562}.tone-red .v460-admin-category-head{background:#fff6f5}.tone-red .v460-admin-category-head span{background:#ffe4e1;color:#b33e32}
    @media(max-width:820px){.v401-dashboard-stats.v460-offday-stats{grid-template-columns:1fr}.v460-helper-name{padding:5px 8px}.v460-helper-name b{font-size:12px}.v460-helper-name small{font-size:9px!important}.v460-no-duty-row{padding:11px 12px}.v460-no-duty-name{font-size:16px}.v460-no-duty-seq,.v460-no-duty-badge{font-size:11px;padding:4px 8px}.v460-admin-pending{margin-bottom:13px}.v460-admin-pending-head h3{font-size:18px}.v460-admin-pending-head p{font-size:12px;line-height:1.4}.v460-admin-categories{grid-template-columns:1fr;gap:8px}.v460-admin-category-head{padding:10px 11px}.v460-admin-category-head b{font-size:14px}.v460-admin-item{padding:11px}.v460-admin-item b{font-size:13px}.v460-admin-item small{font-size:11px}.v460-admin-item em{font-size:11px}.v460-admin-more{font-size:11px}.v460-offday-detail{font-size:12px!important}}
  `;document.head.appendChild(style);

  window.cnmiV460={version:VERSION,pendingCache,loadAdminPending,mutateDashboard};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v460-offday-consult-helper-admin-alerts.js", error); }
;

/* Original source: patch-v461-dashboard-no-duty-detail-click.js */
try {
/* CNMI Staff Planner V461
 * Restore no-duty detail interaction on the V460 off-day Dashboard card.
 * - Entire "ไม่รับเวร" row is tappable/clickable.
 * - Reuses V436 original submission-time popup (leave_requests.created_at).
 * - Keyboard Enter/Space supported.
 * Display-only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V461_DASHBOARD_NO_DUTY_DETAIL_CLICK';
  if(window.__CNMI_V461_DASHBOARD_NO_DUTY_DETAIL_CLICK__)return;
  window.__CNMI_V461_DASHBOARD_NO_DUTY_DETAIL_CLICK__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}
    catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function staffLabel(id){
    const p=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''));
    return String(p?.nickname||p?.full_name||p?.email||'').trim();
  }
  function thaiDate(date){try{return typeof formatThaiDate==='function'?String(formatThaiDate(date)||date):date;}catch(_){return date;}}
  function submittedText(row){try{return String(window.cnmiNoDutySequenceV436?.submittedDateTime?.(row)||'').trim();}catch(_){return '';}}

  function decorate(html){
    try{
      const api=window.cnmiNoDutySequenceV436;
      if(!api?.sequenceForDate)return html;
      const date=selectedDate();
      const seq=api.sequenceForDate(date)||[];
      if(!seq.length)return html;

      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const rows=[...tpl.content.querySelectorAll('.v460-no-duty-row')];
      if(!rows.length)return html;

      const unused=seq.slice();
      rows.forEach((el,index)=>{
        const displayed=String(el.querySelector('.v460-no-duty-name')?.textContent||'').trim();
        let hitIndex=unused.findIndex(x=>staffLabel(x.staff_id)===displayed);
        if(hitIndex<0&&unused[index])hitIndex=index;
        if(hitIndex<0)return;
        const hit=unused.splice(hitIndex,1)[0];
        const rank=Number(hit?.rank)||index+1;
        const staffId=String(hit?.staff_id||hit?.row?.staff_id||'');
        if(!staffId)return;

        // V436's existing capture listener opens the authoritative popup when
        // any ancestor has data-v436-no-duty-rank/date/staff.
        el.dataset.v436NoDutyRank=String(rank);
        el.dataset.v436Date=date;
        el.dataset.v436Staff=staffId;
        el.dataset.v461NoDutyDetail='true';
        el.setAttribute('role','button');
        el.setAttribute('tabindex','0');
        const submitted=submittedText(hit.row);
        const aria=`ดูรายละเอียดไม่รับเวร ลำดับ ${rank} วันที่ ${thaiDate(date)}${submitted?` บันทึกครั้งแรก ${submitted}`:''}`;
        el.setAttribute('aria-label',aria);
        el.setAttribute('title','แตะดูวันที่และเวลาที่ลงไม่รับเวร');

        const seqBadge=el.querySelector('.v460-no-duty-seq');
        if(seqBadge){
          seqBadge.classList.add('v461-no-duty-detail-hint');
          seqBadge.setAttribute('aria-hidden','true');
        }
      });

      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decoration skipped`,err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV461(){return decorate(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const row=event.target?.closest?.('[data-v461-no-duty-detail]');
    if(!row)return;
    event.preventDefault();
    row.click();
  },true);

  const style=document.createElement('style');style.id='cnmi-v461-dashboard-no-duty-detail-click';style.textContent=`
    .v460-no-duty-row[data-v461-no-duty-detail]{cursor:pointer;touch-action:manipulation;transition:background .12s ease,border-color .12s ease,box-shadow .12s ease}
    .v460-no-duty-row[data-v461-no-duty-detail]:hover{background:#f5f9fc;border-color:#cbdce8}
    .v460-no-duty-row[data-v461-no-duty-detail]:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(80,130,165,.18)}
    .v460-no-duty-row[data-v461-no-duty-detail] .v461-no-duty-detail-hint::after{content:'  • แตะดูเวลา';font-weight:800;color:#71879a}
    @media(max-width:820px){.v460-no-duty-row[data-v461-no-duty-detail]{min-height:50px}.v460-no-duty-row[data-v461-no-duty-detail] .v461-no-duty-detail-hint::after{content:'  • แตะดู'}}
  `;document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v461-dashboard-no-duty-detail-click.js", error); }
;

/* Original source: patch-v462-physician-month-staff-lifecycle.js */
try {
/* CNMI Staff Planner V462
 * Physician monthly visibility + staff lifecycle dates + historical schedule preservation.
 *
 * 1) ตารางเวรประจำเดือน: shows a compact Physician Consult summary with tappable doctor names.
 * 2) Staff lifecycle:
 *    - employment_start_date: first employment/use date.
 *    - employment_end_date: last day the account may be used and staff is eligible for future schedules.
 *    - daily_position_start_date: first day counted as regular staff for daytime positions.
 * 3) Historical safety:
 *    - Existing roster/daily-position assignments remain visible after a staff member becomes inactive
 *      or transitions from trainee -> regular.
 *    - Future months exclude staff outside their employment range.
 * 4) Account access automatically stops after employment_end_date (Asia/Bangkok).
 * Requires SQL_V462_STAFF_LIFECYCLE.sql once.
 */
(function(){
  'use strict';
  const VERSION='V462_PHYSICIAN_MONTH_STAFF_LIFECYCLE';
  if(window.__CNMI_V462_PHYSICIAN_MONTH_STAFF_LIFECYCLE__)return;
  window.__CNMI_V462_PHYSICIAN_MONTH_STAFF_LIFECYCLE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function pad(n){return String(n).padStart(2,'0');}
  function bangkokToday(){
    try{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;}
    catch(_){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  }
  function monthBounds(key){const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));if(!m)return null;const y=Number(m[1]),mo=Number(m[2]),last=new Date(y,mo,0).getDate();return {key:String(key),first:`${key}-01`,last:`${key}-${pad(last)}`};}
  function monthDates(key){const b=monthBounds(key);if(!b)return[];return Array.from({length:Number(b.last.slice(8))},(_,i)=>`${key}-${pad(i+1)}`);}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):new Date(`${date}T12:00:00`).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}catch(_){return date;}}
  function thaiMonth(key){try{const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key;}}
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function explicitFalse(v){return v===false||['false','0','no','off','ปิด'].includes(String(v??'').trim().toLowerCase());}
  function activeNow(p){if(!p)return false;const raw=Object.prototype.hasOwnProperty.call(p,'active')?p.active:p.is_active;return !explicitFalse(raw)&&raw!=null;}
  function actualAdmin(){try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function employmentStart(p){return norm(p?.employment_start_date||p?.start_date||'');}
  function employmentEnd(p){return norm(p?.employment_end_date||'');}
  function dailyPositionStart(p){return norm(p?.daily_position_start_date||'');}
  function employmentOn(p,date){const d=norm(date),start=employmentStart(p),end=employmentEnd(p);if(!d)return true;if(start&&d<start)return false;if(end&&d>end)return false;return true;}
  function employmentOverlapsMonth(p,key){const b=monthBounds(key);if(!b)return true;const start=employmentStart(p),end=employmentEnd(p);return (!start||start<=b.last)&&(!end||end>=b.first);}
  function dailyPositionOn(p,date){const d=norm(date),start=dailyPositionStart(p);return employmentOn(p,d)&&(!start||!d||d>=start);}
  function isRosterBase(p){if(!p||String(p?.staff_type||'').trim()==='แพทย์'||p?.maternity_status)return false;const v=p?.roster_enabled??p?.duty_enabled??p?.can_roster??p?.is_roster_enabled??p?.schedule_enabled??p?.is_schedule_enabled??p?.['สถานะจัดเวร'];return !explicitFalse(v);}
  function order(rows){try{return typeof orderedStaff==='function'?orderedStaff(rows):rows;}catch(_){return rows;}}
  function monthAssignments(key){try{return typeof getAssignmentsForMonth==='function'?(getAssignmentsForMonth(key)||[]):((S().rosterAssignments||[]).filter(r=>norm(r?.duty_date).startsWith(key)));}catch(_){return (S().rosterAssignments||[]).filter(r=>norm(r?.duty_date).startsWith(key));}}
  function assignmentStaffIds(key){return new Set(monthAssignments(key).map(r=>String(r?.staff_id||'')).filter(Boolean));}
  function rosterStaffForMonth(key){
    const ids=assignmentStaffIds(key),rows=(S().staff||[]).filter(p=>{
      if(!p?.id||String(p?.staff_type||'').trim()==='แพทย์'||p?.maternity_status)return false;
      if(ids.has(String(p.id)))return true; // saved history must stay visible
      if(!isRosterBase(p)||!employmentOverlapsMonth(p,key))return false;
      if(activeNow(p))return true;
      // Planned leaver may be inactive today but should remain visible in their historical employment month.
      return !!employmentEnd(p);
    });
    return order(rows);
  }
  function scheduleMonthKey(){return String(S().monthKey||new Date().toISOString().slice(0,7)).slice(0,7);}
  function selectedDashboardDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||bangkokToday();}catch(_){return bangkokToday();}}

  function assignGlobal(name,value){try{window[name]=value;}catch(_){}try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){} }

  // Preserve monthly roster history instead of filtering assignments by today's Active status.
  assignGlobal('scheduleStaffList',function scheduleStaffListV462(){return rosterStaffForMonth(scheduleMonthKey());});
  assignGlobal('scheduleAssignmentsForMonth',function scheduleAssignmentsForMonthV462(key=scheduleMonthKey()){
    return monthAssignments(key).filter(r=>norm(r?.duty_date).startsWith(key));
  });

  // Date-aware daytime candidate pool. Saved rows are rendered separately by V275 and are never deleted here.
  const previousDailyWorking=window.dailyWorkingStaff||(typeof dailyWorkingStaff==='function'?dailyWorkingStaff:null);
  if(typeof previousDailyWorking==='function')assignGlobal('dailyWorkingStaff',function dailyWorkingStaffV462(date){return (previousDailyWorking(date)||[]).filter(p=>dailyPositionOn(p,date));});
  const previousCandidate=window.positionCandidateOk||(typeof positionCandidateOk==='function'?positionCandidateOk:null);
  if(typeof previousCandidate==='function')assignGlobal('positionCandidateOk',function positionCandidateOkV462(staff,row,date){return dailyPositionOn(staff,date)&&previousCandidate(staff,row,date);});

  function doctorButton(id,site,time){
    if(!id)return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn v462-month-doctor" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(staffName(id))}</button>`;
  }
  function compressOnCall(key){
    const api=window.cnmiPhysicianConsultV452;if(!api?.baseForDate)return[];
    const dates=monthDates(key),out=[];let cur=null;
    dates.forEach(date=>{
      const id=api.baseForDate(date)?.combined||'';
      if(cur&&String(cur.id)===String(id)){cur.end=date;return;}
      if(cur)out.push(cur);cur={start:date,end:date,id};
    });
    if(cur)out.push(cur);return out;
  }
  function weekdayBase(key){
    const api=window.cnmiPhysicianConsultV452;if(!api?.baseForDate)return {donor:'',bb:'',exceptions:[]};
    const weekdays=monthDates(key).filter(d=>!isWeekendSafe(d)&&!isHolidaySafe(d));if(!weekdays.length)return {donor:'',bb:'',exceptions:[]};
    const models=weekdays.map(d=>({date:d,m:api.baseForDate(d)}));
    const freq=new Map();models.forEach(x=>{const k=`${x.m?.donor||''}|${x.m?.bb||''}`;freq.set(k,(freq.get(k)||0)+1);});
    const base=[...freq.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'|';const [donor,bb]=base.split('|');
    const exceptions=models.filter(x=>String(x.m?.donor||'')!==String(donor)||String(x.m?.bb||'')!==String(bb));
    return {donor,bb,exceptions};
  }
  function physicianMonthCard(key){
    const api=window.cnmiPhysicianConsultV452;
    if(!api)return '';
    if(!api.cache?.loaded){api.ensureLoaded?.();return `<section class="card v462-physician-month-card" data-v462-physician-month><div class="section-title"><div><h3>แพทย์ Consult · ${esc(thaiMonth(key))}</h3><p class="hint">กำลังโหลดตารางแพทย์…</p></div></div></section>`;}
    if(api.cache?.unavailable)return '';
    const day=weekdayBase(key),oncall=compressOnCall(key),exceptions=day.exceptions||[];
    return `<section class="card v462-physician-month-card" data-v462-physician-month>
      <div class="section-title"><div><h3>แพทย์ Consult · ${esc(thaiMonth(key))}</h3><p class="hint">ชื่อแพทย์กดดูเบอร์โทรได้ • วันธรรมดา 16:00–08:00 / เสาร์–อาทิตย์–นักขัตฤกษ์ 24 ชม.</p></div>${actualAdmin()?'<button type="button" class="ghost-btn" data-page="physicianConsult">จัดการตาราง</button>':''}</div>
      <div class="v462-physician-month-grid">
        <div class="v462-physician-block"><b>ในเวลา จ.–ศ. 08:00–16:00</b><div><span>Donor</span>${doctorButton(day.donor,'Donor','08:00–16:00')}</div><div><span>Blood Bank</span>${doctorButton(day.bb,'Blood Bank','08:00–16:00')}</div></div>
        <div class="v462-physician-block"><b>On-call / วันหยุด</b>${oncall.length?oncall.map(r=>`<div class="v462-oncall-row"><span>${esc(r.start===r.end?thaiDate(r.start):`${thaiDate(r.start)} – ${thaiDate(r.end)}`)}</span>${doctorButton(r.id,'Donor & BB','วันธรรมดา 16:00–08:00 / วันหยุด 24 ชม.')}</div>`).join(''):'<div class="v462-empty-line">ยังไม่กำหนดแพทย์ On-call</div>'}</div>
      </div>
      ${exceptions.length?`<div class="v462-physician-exceptions"><b>แก้เฉพาะวัน</b>${exceptions.map(x=>`<span>${esc(thaiDate(x.date))}: Donor ${esc(staffName(x.m?.donor))} · BB ${esc(staffName(x.m?.bb))}</span>`).join('')}</div>`:''}
    </section>`;
  }

  // Staff monthly schedule page: physician summary appears before the roster table.
  const previousMonthly=window.renderMonthlySchedulePage||(typeof renderMonthlySchedulePage==='function'?renderMonthlySchedulePage:null);
  if(typeof previousMonthly==='function'){
    const wrapped=function renderMonthlySchedulePageV462(){const key=scheduleMonthKey();const card=physicianMonthCard(key);return `${card}${previousMonthly.apply(this,arguments)}`;};
    assignGlobal('renderMonthlySchedulePage',wrapped);
  }

  function injectPhysicianIntoAdminScheduler(){
    if(String(S().page||'')!=='scheduler')return;
    const root=document.getElementById('pageContent');if(!root||root.querySelector('[data-v462-physician-month]'))return;
    const key=scheduleMonthKey(),html=physicianMonthCard(key);if(!html)return;
    const t=document.createElement('template');t.innerHTML=html.trim();const page=root.querySelector('.v275-page')||root;page.insertBefore(t.content.firstElementChild,page.firstChild);
  }

  // Decorate Users page with lifecycle explanation/status. Fields themselves are emitted by V396 (updated in V462 package).
  const previousUsers=window.renderUsersPage||(typeof renderUsersPage==='function'?renderUsersPage:null);
  if(typeof previousUsers==='function'){
    const wrapped=function renderUsersPageV462(){
      let html=String(previousUsers.apply(this,arguments)||'');
      try{
        const p=(S().staff||[]).find(x=>String(x?.id||'')===String(S().usersStaffId||''));
        const end=employmentEnd(p),dp=dailyPositionStart(p),status=[];
        if(end)status.push(`ใช้งานถึง ${thaiDate(end)}`);if(dp)status.push(`เริ่มตัวจริง ${thaiDate(dp)}`);
        const note=`<div class="v462-lifecycle-help"><b>ช่วงการใช้งาน</b><span>กรณีลาออก ไม่ต้องปิด Active ล่วงหน้า: ใส่ “ใช้งานถึงวันที่” ระบบจะให้เข้าแอปได้ถึงวันนั้น และหยุดนำชื่อไปจัดตารางหลังวันสิ้นสุดโดยอัตโนมัติ</span>${status.length?`<em>${esc(status.join(' • '))}</em>`:''}</div>`;
        html=html.replace('<div class="admin-user-form">',`${note}<div class="admin-user-form">`);
      }catch(_){ }
      return html;
    };
    assignGlobal('renderUsersPage',wrapped);
  }

  // Final Auth-aware create flow: keep V161 account creation, then save lifecycle dates by email.
  const previousSaveNew=window.saveNewStaff||(typeof saveNewStaff==='function'?saveNewStaff:null);
  if(typeof previousSaveNew==='function'){
    const wrapped=async function saveNewStaffV462(form){
      const fd=new FormData(form),email=String(fd.get('email')||'').trim().toLowerCase(),dates={employment_start_date:norm(fd.get('employment_start_date'))||null,employment_end_date:norm(fd.get('employment_end_date'))||null,daily_position_start_date:norm(fd.get('daily_position_start_date'))||null};
      const existedBefore=(S().staff||[]).some(p=>String(p?.email||'').trim().toLowerCase()===email);
      await previousSaveNew(form);
      if(!email||existedBefore||!Object.values(dates).some(Boolean))return;
      const created=(S().staff||[]).find(p=>String(p?.email||'').trim().toLowerCase()===email);if(!created?.id)return;
      const db=DB();if(!db)return;
      try{const q=await db.from('staff_profiles').update(dates).eq('id',created.id);if(q.error)throw q.error;try{await loadAllData();renderPage();}catch(_){ }}catch(err){console.warn('[V462] save new staff lifecycle',err);try{showToast(`สร้างบัญชีแล้ว แต่บันทึกช่วงวันที่ไม่สำเร็จ: ${err.message||err}`);}catch(_){ }}
    };
    assignGlobal('saveNewStaff',wrapped);
  }

  function accessExpired(p,date=bangkokToday()){const end=employmentEnd(p);return !!end&&date>end;}
  async function enforceAccess(){
    const p=S().profile;if(!p||!accessExpired(p))return false;
    try{if(typeof clearCachedAppSession==='function')clearCachedAppSession();}catch(_){ }
    try{await DB()?.auth?.signOut?.();}catch(_){ }
    try{document.getElementById('appView')?.classList.add('hidden');document.getElementById('authView')?.classList.remove('hidden');}catch(_){ }
    try{showToast(`สิทธิ์ใช้งานสิ้นสุดวันที่ ${thaiDate(employmentEnd(p))} กรุณาติดต่อ Admin`);}catch(_){ }
    return true;
  }
  const previousEnter=window.enterApp||(typeof enterApp==='function'?enterApp:null);
  if(typeof previousEnter==='function'){
    const wrapped=async function enterAppV462(){
      try{if(typeof loadProfile==='function')await loadProfile();}catch(_){ }
      if(await enforceAccess())return;
      return previousEnter.apply(this,arguments);
    };
    assignGlobal('enterApp',wrapped);
  }
  window.addEventListener('focus',()=>{enforceAccess();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforceAccess();});
  setInterval(()=>{if(S().profile)enforceAccess();},60000);

  // Life-cycle aware weekday manpower so a leaver is not counted after their end date.
  function groupOf(p){if(window.cnmiPersonTypeV516?.group)return window.cnmiPersonTypeV516.group(p);const t=`${p?.staff_type||''} ${p?.role||''}`;if(/^(แพทย์|physician|doctor)$/i.test(String(p?.staff_type||'').trim()))return 'แพทย์';if(String(p?.staff_type||'').trim()==='เคิก'||/clerk|ธุรการ/i.test(t))return 'เคิก';return 'MT';}
  function actualLeave(row){try{if(typeof isLeaveEffective==='function'&&!isLeaveEffective(row))return false;}catch(_){ }const t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();return !!t&&t!=='ไม่รับเวร';}
  function overlap(row,date){return norm(row?.start_date)<=date&&norm(row?.end_date||row?.start_date)>=date;}
  function period(row){const x=String(row?.leave_period||row?.period||'เต็มวัน').toLowerCase();if(/ครึ่งเช้า|morning/.test(x))return'morning';if(/ครึ่งบ่าย|afternoon/.test(x))return'afternoon';return'full';}
  function manpower(date){
    const staff=(S().staff||[]).filter(p=>activeNow(p)&&employmentOn(p,date)),byId=new Set(staff.map(p=>String(p.id))),am=new Set(),pm=new Set();
    (S().leaves||[]).forEach(r=>{const id=String(r?.staff_id||'');if(!byId.has(id)||!actualLeave(r)||!overlap(r,date))return;const k=period(r);if(k==='full'||k==='morning')am.add(id);if(k==='full'||k==='afternoon')pm.add(id);});
    const groups=['MT','เคิก','แพทย์'],total=Object.fromEntries(groups.map(g=>[g,0])),morning=Object.fromEntries(groups.map(g=>[g,0])),afternoon=Object.fromEntries(groups.map(g=>[g,0]));
    staff.forEach(p=>{const id=String(p.id),g=groupOf(p);total[g]++;if(!am.has(id))morning[g]++;if(!pm.has(id))afternoon[g]++;});const sum=o=>groups.reduce((n,g)=>n+(o[g]||0),0);return{total,morning,afternoon,morningCount:sum(morning),afternoonCount:sum(afternoon)};
  }
  function updateManpowerCard(root,date){
    if(isWeekendSafe(date)||isHolidaySafe(date))return;const card=root.querySelector?.('[data-v433-manpower]');if(!card)return;const m=manpower(date),groups=['MT','เคิก','แพทย์'];
    const totals=card.querySelectorAll('.v433-period-totals strong');if(totals[0])totals[0].textContent=m.morningCount;if(totals[1])totals[1].textContent=m.afternoonCount;
    const lines=[...card.querySelectorAll('.v433-type-line')];[['เช้า',m.morning],['บ่าย',m.afternoon]].forEach(([label,c],i)=>{if(!lines[i])return;lines[i].innerHTML=`<b>${label}</b>${groups.map(g=>`<span>${g==='เคิก'?'เคิก':g} <strong>${c[g]||0}</strong>/${m.total[g]||0}</span>`).join('')}`;});
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV462(){let html=String(previousDashboard.apply(this,arguments)||'');try{const tpl=document.createElement('template');tpl.innerHTML=html;updateManpowerCard(tpl.content,selectedDashboardDate());const h=document.createElement('div');h.appendChild(tpl.content.cloneNode(true));html=h.innerHTML;}catch(e){console.warn('[V462] dashboard lifecycle',e);}return html;};
    assignGlobal('renderDashboard',wrapped);
  }

  // Final render wrapper: add physician card to Admin manual scheduler after V275 replaces page content.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV462(){const ret=previousRender.apply(this,arguments);try{if(String(S().page||'')==='scheduler'){window.cnmiPhysicianConsultV452?.ensureLoaded?.();injectPhysicianIntoAdminScheduler();}}catch(_){ }return ret;};
    assignGlobal('renderPage',wrapped);
  }

  document.addEventListener('change',e=>{
    if(!e.target?.matches?.('[data-field="employment_start_date"],[data-field="employment_end_date"],[data-field="daily_position_start_date"]'))return;
    const card=e.target.closest('[data-staff-row]');if(!card)return;
    const start=norm(card.querySelector('[data-field="employment_start_date"]')?.value),end=norm(card.querySelector('[data-field="employment_end_date"]')?.value),dp=norm(card.querySelector('[data-field="daily_position_start_date"]')?.value);
    if(start&&end&&end<start){try{showToast('วันสิ้นสุดการใช้งานต้องไม่ก่อนวันเริ่มงาน');}catch(_){ }e.target.value='';}
    if(dp&&end&&dp>end){try{showToast('วันเริ่มเป็นตัวจริงต้องไม่หลังวันสิ้นสุดการใช้งาน');}catch(_){ }e.target.value='';}
  },true);

  const style=document.createElement('style');style.id='cnmi-v462-style';style.textContent=`
    .v462-physician-month-card{margin-bottom:14px}.v462-physician-month-card .section-title{align-items:flex-start}.v462-physician-month-grid{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:10px}.v462-physician-block{border:1px solid #e1eaf1;border-radius:13px;padding:11px;background:#fbfdff;display:grid;gap:8px}.v462-physician-block>b{color:#334f67}.v462-physician-block>div,.v462-oncall-row{display:flex;align-items:center;justify-content:space-between;gap:9px}.v462-physician-block>div>span,.v462-oncall-row>span{font-size:11px;color:#71879a}.v462-month-doctor{white-space:nowrap}.v462-empty-line{color:#8ca0b0!important;justify-content:flex-start!important}.v462-physician-exceptions{margin-top:9px;padding:9px 11px;border-radius:11px;background:#fff8e9;display:flex;gap:7px;flex-wrap:wrap;font-size:10px;color:#80622e}.v462-physician-exceptions>b{color:#76520e}.v462-lifecycle-help{margin:0 0 12px;padding:11px 12px;border-radius:12px;background:#eef8ff;border:1px solid #cfe6f6;display:grid;gap:4px;color:#496b83}.v462-lifecycle-help b{color:#245b7d}.v462-lifecycle-help span{font-size:11px;line-height:1.45}.v462-lifecycle-help em{font-size:10px;font-style:normal;font-weight:850;color:#1c7250}.v462-lifecycle-off{background:#f7f9fb!important}.v462-lifecycle-cell{display:block;color:#9aa9b5;font-size:9px;line-height:1.2;text-align:center;padding:4px}.v462-preserved-note{display:block;margin-top:4px;color:#a16a17!important;font-size:8px!important;line-height:1.25}.admin-user-form label small.hint{display:block;font-size:9px;line-height:1.3;color:#7c8e9d;font-weight:500;margin-top:3px}
    @media(max-width:820px){.v462-physician-month-grid{grid-template-columns:1fr}.v462-physician-block{padding:12px}.v462-physician-block>b{font-size:14px}.v462-physician-block>div>span,.v462-oncall-row>span{font-size:12px}.v462-lifecycle-help span{font-size:12px}.v462-lifecycle-help em{font-size:11px}.v462-lifecycle-cell{font-size:10px}.v462-preserved-note{font-size:9px!important}}
  `;document.head.appendChild(style);

  // Warm consult cache for schedule pages; rerender once names are ready.
  setTimeout(()=>{try{window.cnmiPhysicianConsultV452?.ensureLoaded?.().then(()=>{if(['schedule','scheduler'].includes(String(S().page||''))&&typeof renderPage==='function')renderPage();});}catch(_){ }},900);

  window.cnmiStaffLifecycleV462={version:VERSION,bangkokToday,employmentOn,employmentOverlapsMonth,dailyPositionOn,rosterStaffForMonth,physicianMonthCard,enforceAccess};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v462-physician-month-staff-lifecycle.js", error); }
;

/* Original source: patch-v463-dashboard-offday-physician-only.js */
try {
/* CNMI Staff Planner V463
 * Dashboard physician consult visibility on off-days + remove physician summary from monthly roster pages.
 *
 * 1) Dashboard:
 *    - Weekdays remain unchanged (Donor / Blood Bank / On-call).
 *    - Saturday / Sunday / public holiday always gets a Physician Consult card.
 *    - Off-day card shows one Donor & BB physician for 24 hours from the existing on-call schedule.
 *    - Physician name remains tappable for V455 phone popup; mobile uses V456-style card.
 * 2) Monthly roster pages:
 *    - Remove V462 physician monthly summary from both Staff monthly roster and Admin scheduler.
 *
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V463_DASHBOARD_OFFDAY_PHYSICIAN_ONLY';
  if(window.__CNMI_V463_DASHBOARD_OFFDAY_PHYSICIAN_ONLY__)return;
  window.__CNMI_V463_DASHBOARD_OFFDAY_PHYSICIAN_ONLY__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(todayStr());}
    catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function isOffDay(date){return isWeekendSafe(date)||isHolidaySafe(date);}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function versionText(m){
    const vals=[];
    for(const v of [m?.override?.version_label,m?.callBase?.version_label]){
      const s=String(v||'').trim();if(s&&!vals.includes(s))vals.push(s);
    }
    return vals.join(' · ');
  }
  function doctorButton(id,site,time){
    if(!id)return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" aria-label="ดูเบอร์โทร ${esc(staffName(id))}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(staffName(id))}</button>`;
  }
  function loadingCard(date){
    return `<div class="card v452-physician-card" data-v452-physician-card><div class="section-title"><h3>แพทย์ Consult</h3><span>${esc(thaiDate(date))}</span></div><div class="v452-loading">กำลังโหลดตารางแพทย์…</div></div>`;
  }
  function offdayCard(date){
    const api=window.cnmiPhysicianConsultV452;
    if(!api||api.cache?.unavailable)return '';
    if(!api.cache?.loaded){try{api.ensureLoaded?.();}catch(_){}return loadingCard(date);}
    const m=api.baseForDate?.(date)||{};
    const id=m?.combined||null,site='Donor & BB',time='24 ชม.',version=versionText(m);
    const btn=doctorButton(id,site,time);
    return `<div class="card v452-physician-card v463-offday-physician" data-v452-physician-card data-v463-offday-physician>
      <div class="section-title v452-card-head"><div><h3>แพทย์ Consult</h3><span>${esc(thaiDate(date))}</span></div><div class="v452-card-meta"><span class="v452-ready ${id?'is-complete':''}">พร้อม ${id?1:0}/1</span>${version?`<span class="v452-version">${esc(version)}</span>`:''}</div></div>
      <div class="v452-dashboard-table-wrap"><table class="v452-dashboard-table"><thead><tr><th>เวลา</th><th>จุด Consult</th><th>แพทย์</th></tr></thead><tbody><tr><td>${esc(time)}</td><td><b>${esc(site)}</b></td><td>${btn}</td></tr></tbody></table></div>
      <div class="v456-mobile-consult-list"><div class="v456-mobile-consult-row"><div class="v456-mobile-consult-top"><strong class="v456-mobile-consult-site">${esc(site)}</strong><span class="v456-mobile-consult-time">${esc(time)}</span></div><div class="v456-mobile-consult-doctor"><span class="v456-mobile-doctor-label">แพทย์</span>${id?btn.replace('v455-doctor-contact-btn"','v455-doctor-contact-btn v456-mobile-doctor-button"'):'<span class="v452-not-set v456-mobile-not-set">ยังไม่กำหนด</span>'}</div></div></div>
      ${m?.override?`<div class="v452-override-note">มีการแก้เฉพาะวันนี้${m.override.note?` · ${esc(m.override.note)}`:''}</div>`:''}
    </div>`;
  }
  function insertOffdayPhysician(html){
    const date=selectedDate();
    if(!isOffDay(date))return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      if(tpl.content.querySelector('[data-v452-physician-card]'))return html;
      const cardHtml=offdayCard(date);if(!cardHtml)return html;
      const t=document.createElement('template');t.innerHTML=cardHtml.trim();const card=t.content.firstElementChild;if(!card)return html;
      const manpower=tpl.content.querySelector('[data-v440-holiday-manpower]');
      if(manpower?.parentNode)manpower.parentNode.insertBefore(card,manpower.nextSibling);
      else{
        const cards=[...tpl.content.querySelectorAll('.card')];
        const roster=cards.find(c=>/^(เวรวันนี้|เวร)$/.test(String(c.querySelector('.section-title h3')?.textContent||'').trim()));
        if(roster?.parentNode)roster.parentNode.insertBefore(card,roster);
        else{
          const content=tpl.content.firstElementChild||tpl.content;
          content.appendChild(card);
        }
      }
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn('[V463] off-day physician insert',err);return html;}
  }
  function stripMonthlyPhysician(html){
    if(!String(html||'').includes('v462-physician-month-card'))return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      tpl.content.querySelectorAll('[data-v462-physician-month],.v462-physician-month-card').forEach(x=>x.remove());
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(_){return html;}
  }

  // Dashboard: V452 originally inserts before daytime positions; off-days have no daytime-position card.
  // This final wrapper guarantees the physician card still exists on those days.
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV463(){return insertOffdayPhysician(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // Staff monthly roster page: keep roster only.
  const previousMonthly=window.renderMonthlySchedulePage||(typeof renderMonthlySchedulePage==='function'?renderMonthlySchedulePage:null);
  if(typeof previousMonthly==='function'){
    const wrapped=function renderMonthlySchedulePageV463(){return stripMonthlyPhysician(previousMonthly.apply(this,arguments));};
    try{window.renderMonthlySchedulePage=renderMonthlySchedulePage=wrapped;}catch(_){window.renderMonthlySchedulePage=wrapped;}
  }

  // Admin monthly scheduler: V462 may inject into the live DOM after rendering; remove it after the chain returns.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV463(){
      const ret=previousRender.apply(this,arguments);
      try{
        if(['schedule','scheduler'].includes(String(S().page||''))){
          const root=document.getElementById('pageContent');
          root?.querySelectorAll?.('[data-v462-physician-month],.v462-physician-month-card')?.forEach?.(x=>x.remove());
        }
      }catch(_){ }
      return ret;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  // Fallback in case an older asynchronous V462 callback inserts the monthly card after a page render.
  const observer=new MutationObserver(()=>{
    try{
      if(!['schedule','scheduler'].includes(String(S().page||'')))return;
      document.getElementById('pageContent')?.querySelectorAll?.('[data-v462-physician-month],.v462-physician-month-card')?.forEach?.(x=>x.remove());
    }catch(_){ }
  });
  try{observer.observe(document.documentElement,{childList:true,subtree:true});}catch(_){ }

  const style=document.createElement('style');style.id='cnmi-v463-style';style.textContent=`
    .v462-physician-month-card,[data-v462-physician-month]{display:none!important}
    .v463-offday-physician{margin-top:14px;margin-bottom:14px}
  `;document.head.appendChild(style);

  window.cnmiV463={version:VERSION,offdayCard,stripMonthlyPhysician};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v463-dashboard-offday-physician-only.js", error); }
;

/* Original source: patch-v464-admin-pending-auto-refresh-role-hint.js */
try {
/* CNMI Staff Planner V490 compatibility replacement for V464
 * - Removes the 60-second Admin pending auto-refresh and all focus/visibility auto-refresh.
 * - Admin pending still loads normally when Dashboard is rendered by V460.
 * - Admin can refresh only by pressing the existing ↻ button.
 * - Keeps the useful Users-page Role / daytime-position lifecycle hints from V464.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V490_ADMIN_PENDING_MANUAL_REFRESH_ONLY';
  if(window.__CNMI_V464_ADMIN_PENDING_AUTO_REFRESH_ROLE_HINT__)return;
  window.__CNMI_V464_ADMIN_PENDING_AUTO_REFRESH_ROLE_HINT__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function actualAdmin(){
    try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}
    catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}
  }
  function onDashboard(){return String(S()?.page||'')==='dashboard';}
  function api(){return window.cnmiV460||null;}

  // Exposed for compatibility only. This function is never called automatically.
  async function refreshPending(reason='manual',force=true){
    const a=api();
    if(!actualAdmin()||!onDashboard()||!a?.loadAdminPending)return [];
    if(a.pendingCache?.status==='loading')return [];
    try{return await a.loadAdminPending(!!force);}
    catch(err){console.warn('[V490] pending manual refresh',reason,err);return [];}
  }

  // Clarify account Role vs daytime-position lifecycle in Admin > Users.
  const previousUsers=window.renderUsersPage||(typeof renderUsersPage==='function'?renderUsersPage:null);
  if(typeof previousUsers==='function'){
    const wrapped=function renderUsersPageV490(){
      let html=String(previousUsers.apply(this,arguments)||'');
      try{
        html=html.replace(/(<label>Role\s*<select\s+data-field="role"[\s\S]*?<\/select>)(<\/label>)/i,
          '$1<small class="hint v464-role-hint">เจ้าหน้าที่ทั่วไปให้ใช้ <b>staff</b> เสมอ • Role เป็นสิทธิ์เข้าใช้งาน ไม่ใช่สถานะน้องใหม่/ตัวจริง</small>$2');
        html=html.replace(/(<label>สถานะตำแหน่งรายวัน\s*<select\s+data-field="position_training_status"[\s\S]*?<\/select>)(<\/label>)/i,
          '$1<small class="hint v464-role-hint">ถ้ากำหนด “เริ่มเป็นตัวจริง/จัดตำแหน่งกลางวัน” แล้ว ให้เลือก <b>ใช้งานปกติ</b> ได้เลย ระบบจะเริ่มนับตั้งแต่วันที่กำหนดเอง</small>$2');
      }catch(_){ }
      return html;
    };
    try{window.renderUsersPage=renderUsersPage=wrapped;}catch(_){window.renderUsersPage=wrapped;}
  }

  // Make the pending panel explicitly manual so Admin knows the ↻ button is the refresh control.
  function decoratePendingPanel(){
    if(!actualAdmin()||!onDashboard())return;
    const panel=document.querySelector('[data-v460-admin-pending]');
    if(!panel)return;
    panel.querySelectorAll('[data-v464-auto-note]').forEach(el=>el.remove());
    const p=panel.querySelector('.v460-admin-pending-head p');
    if(p&&!p.querySelector('[data-v490-manual-note]')){
      const note=document.createElement('span');
      note.setAttribute('data-v490-manual-note','');
      note.className='v490-manual-note';
      note.textContent=' • กด ↻ เมื่อต้องการอัปเดต';
      p.appendChild(note);
    }
  }
  const mo=new MutationObserver(()=>decoratePendingPanel());
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  setTimeout(decoratePendingPanel,300);

  const style=document.createElement('style');style.id='cnmi-v490-admin-manual-style';style.textContent=`
    .v464-role-hint{display:block;margin-top:4px;color:#6f8190!important;font-size:9px!important;line-height:1.35!important;font-weight:500!important}.v464-role-hint b{color:#245d80}.v490-manual-note{color:#667f91;font-weight:750}
    @media(max-width:820px){.v464-role-hint{font-size:10px!important;line-height:1.4!important}}
  `;document.head.appendChild(style);

  window.cnmiV464={version:VERSION,refreshPending,mode:'manual-only'};
  window.cnmiV490={version:VERSION,refreshPending,mode:'manual-only'};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v464-admin-pending-auto-refresh-role-hint.js", error); }
;

/* Original source: patch-v465-admin-pending-admin-mode-only.js */
try {
/* CNMI Staff Planner V465
 * Admin pending center is visible/active only in effective Admin mode.
 * If an Admin account switches to Staff mode, the panel is hidden and
 * the V464 one-minute auto-refresh does not query pending data.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V465_ADMIN_PENDING_ADMIN_MODE_ONLY';
  if(window.__CNMI_V465_ADMIN_PENDING_ADMIN_MODE_ONLY__)return;
  window.__CNMI_V465_ADMIN_PENDING_ADMIN_MODE_ONLY__=true;

  function effectiveAdmin(){
    try{return typeof isAdmin==='function' && !!isAdmin();}
    catch(_){
      try{return typeof window.isAdmin==='function' && !!window.isAdmin();}
      catch(__){return false;}
    }
  }

  function stripPanelFromHtml(html){
    if(effectiveAdmin())return html;
    try{
      const t=document.createElement('template');
      t.innerHTML=String(html||'');
      t.content.querySelectorAll('[data-v460-admin-pending]').forEach(el=>el.remove());
      const out=document.createElement('div');
      out.appendChild(t.content.cloneNode(true));
      return out.innerHTML;
    }catch(_){return html;}
  }

  // V460 injects by actual account role. Add a final guard for the current UI mode.
  const prevDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof prevDashboard==='function'){
    const wrapped=function renderDashboardV465(){
      return stripPanelFromHtml(prevDashboard.apply(this,arguments));
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // V464 timer calls cnmiV460.loadAdminPending dynamically. Block its DB work in Staff mode.
  try{
    const api=window.cnmiV460;
    if(api?.loadAdminPending && !api.__v465Wrapped){
      const original=api.loadAdminPending.bind(api);
      api.loadAdminPending=async function(){
        if(!effectiveAdmin())return [];
        return original.apply(api,arguments);
      };
      api.__v465Wrapped=true;
    }
  }catch(_){ }

  function enforceDom(){
    if(effectiveAdmin())return;
    document.querySelectorAll('[data-v460-admin-pending]').forEach(el=>el.remove());
  }
  const mo=new MutationObserver(enforceDom);
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  document.addEventListener('click',()=>setTimeout(enforceDom,0),true);
  setTimeout(enforceDom,100);

  window.cnmiV465={version:VERSION,effectiveAdmin};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v465-admin-pending-admin-mode-only.js", error); }
;

/* Original source: patch-v466-ot-weekend-hr-helper-call-dashboard-cue.js */
try {
/* CNMI Staff Planner V466
 * 1) OT extra request: restore authoritative default start time (17:00 on weekend/holiday,
 *    16:00 on normal weekday) and enforce it on submit so staff do not forget.
 * 2) Rename OT reason "มาช่วยออกหน่วย" -> "เตรียมของออกหน่วย/เคลียงานออกหน่วย".
 * 3) Weekday Dashboard leave/no-duty rows show a visible "• แตะดู" cue and the row is tappable.
 * 4) Admin pending center gets HR pending leaves independently from Supabase, only leave dates
 *    not later than Bangkok today (future leave is excluded).
 * 5) Holiday helper names on Dashboard are tappable tel links for both internal/external helpers.
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V466_OT_WEEKEND_HR_HELPER_CALL_DASHBOARD_CUE';
  if(window.__CNMI_V466_OT_WEEKEND_HR_HELPER_CALL_DASHBOARD_CUE__)return;
  window.__CNMI_V466_OT_WEEKEND_HR_HELPER_CALL_DASHBOARD_CUE__=true;

  const OLD_OUTING_REASON='มาช่วยออกหน่วย';
  const NEW_OUTING_REASON='เตรียมของออกหน่วย/เคลียงานออกหน่วย';
  const hrSync={loading:false,lastAt:0,lastSignature:'',promise:null};

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function effectiveAdmin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){try{return typeof window.isAdmin==='function'&&!!window.isAdmin();}catch(__){return false;}}}
  function selectedDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(typeof todayStr==='function'?todayStr():'');}catch(_){return bangkokToday();}}
  function bangkokToday(){
    try{
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
      return `${m.year}-${m.month}-${m.day}`;
    }catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  }
  function isOffDay(date){try{return window.cnmiDashboardHolidayManpowerV440?.isOffDay?.(date)??((typeof isWeekend==='function'&&isWeekend(date))||(typeof isHolidayDate==='function'&&isHolidayDate(date)));}catch(_){return false;}}
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffNameSafe(id){const p=staffById(id);return String(p?.nickname||p?.full_name||p?.email||'-');}
  function helperDisplayName(row){if(row?.internal_staff_id){const p=staffById(row.internal_staff_id);if(p)return String(p.nickname||p.full_name||p.email||row.helper_name||'-');}return String(row?.helper_name||'-').trim()||'-';}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?String(formatThaiDate(date)||date):date;}catch(_){return date;}}
  function periodLabel(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim();
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw;
  }
  function typeOf(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'ลา').trim():String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
  }
  function effectiveLeave(row){
    try{if(typeof isLeaveEffective==='function')return !!isLeaveEffective(row);}catch(_){ }
    const st=String(row?.status||'active').trim().toLowerCase();
    return !['cancelled','canceled','ยกเลิก','rejected','declined','ไม่อนุมัติ'].includes(st);
  }

  /* ---------- OT reason + weekend/holiday default ---------- */
  function installOtReason(){
    let rows=null;
    try{if(typeof OT_REASONS!=='undefined'&&Array.isArray(OT_REASONS))rows=OT_REASONS;}catch(_){ }
    if(!rows&&Array.isArray(window.OT_REASONS))rows=window.OT_REASONS;
    if(!rows)rows=[];
    const oldIndex=rows.findIndex(x=>String(x).trim()===OLD_OUTING_REASON);
    const newIndex=rows.findIndex(x=>String(x).trim()===NEW_OUTING_REASON);
    if(oldIndex>=0){
      if(newIndex>=0&&newIndex!==oldIndex)rows.splice(oldIndex,1);
      else rows.splice(oldIndex,1,NEW_OUTING_REASON);
    }else if(newIndex<0){
      const other=rows.findIndex(x=>String(x).trim()==='อื่นๆ');
      if(other>=0)rows.splice(other,0,NEW_OUTING_REASON);else rows.push(NEW_OUTING_REASON);
    }
    window.OT_REASONS=rows;
  }
  installOtReason();

  function defaultOtStart(date){
    const d=norm(date)||bangkokToday();
    try{if(typeof otStartHourForDate==='function')return `${String(otStartHourForDate(d)).padStart(2,'0')}:00`;}catch(_){ }
    try{const dow=new Date(`${d}T12:00:00`).getDay();return (dow===0||dow===6)?'17:00':'16:00';}catch(_){return '16:00';}
  }
  function tuneOtFormNode(form){
    if(!form||form.dataset?.adminSimple==='1')return;
    const date=form.querySelector('input[name="work_date"]');
    const start=form.querySelector('input[name="start_time"]');
    if(!date||!start)return;
    const expected=defaultOtStart(date.value);
    start.setAttribute('value',expected);
    start.value=expected;
    start.defaultValue=expected;
    const label=start.closest('label');
    if(label&&!label.querySelector('.v466-ot-start-note')){
      const note=document.createElement('small');
      note.className='hint v466-ot-start-note';
      note.textContent='ระบบตั้งอัตโนมัติ: วันธรรมดา 16:00 • เสาร์-อาทิตย์/วันหยุด 17:00';
      label.appendChild(note);
    }
  }
  function decorateOtHtml(html){
    let out=String(html||'').split(OLD_OUTING_REASON).join(NEW_OUTING_REASON);
    try{
      const tpl=document.createElement('template');tpl.innerHTML=out;
      tpl.content.querySelectorAll('#otForm').forEach(tuneOtFormNode);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }catch(_){return out;}
  }
  const previousOtRender=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof previousOtRender==='function'){
    const wrapped=function renderOtPageV466(){installOtReason();return decorateOtHtml(previousOtRender.apply(this,arguments));};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }
  const previousSaveOt=window.saveOtRequest||(typeof saveOtRequest==='function'?saveOtRequest:null);
  if(typeof previousSaveOt==='function'){
    const wrappedSave=async function saveOtRequestV466(form){
      try{
        if(form?.id==='otForm'&&form?.dataset?.adminSimple!=='1'){
          const date=form.querySelector('input[name="work_date"]');
          const start=form.querySelector('input[name="start_time"]');
          const reason=form.querySelector('[name="reason"]');
          if(start&&date)start.value=defaultOtStart(date.value);
          if(reason&&String(reason.value||'').trim()===OLD_OUTING_REASON)reason.value=NEW_OUTING_REASON;
        }
      }catch(_){ }
      return previousSaveOt.apply(this,arguments);
    };
    try{window.saveOtRequest=saveOtRequest=wrappedSave;}catch(_){window.saveOtRequest=wrappedSave;}
  }

  document.addEventListener('change',event=>{
    const date=event.target?.closest?.('#otForm input[name="work_date"]');
    if(!date)return;
    const form=date.form,start=form?.querySelector('input[name="start_time"]');
    if(form?.dataset?.adminSimple==='1'||!start)return;
    start.value=defaultOtStart(date.value);
  },true);

  /* ---------- Dashboard helpers phone + weekday "แตะดู" ---------- */
  function helperPhone(row){
    let raw=String(row?.phone||'').trim();
    if(!raw&&row?.internal_staff_id){
      const p=staffById(row.internal_staff_id)||{};
      raw=String(p.phone||p.phone_number||p.mobile||p.mobile_phone||'').trim();
    }
    const digits=raw.replace(/\D/g,'');
    return digits.length>=9?digits:'';
  }
  function decorateHelperPhones(root,date){
    const api=window.cnmiDashboardHolidayManpowerV440;
    if(!api?.offDayManpower||!isOffDay(date))return;
    let rows=[];try{rows=api.offDayManpower(date)?.helpers?.rows||[];}catch(_){rows=[];}
    const chips=[...root.querySelectorAll?.('.v460-helper-name')||[]];
    chips.forEach((chip,index)=>{
      const row=rows[index];if(!row)return;
      const phone=helperPhone(row);if(!phone)return;
      const a=document.createElement('a');
      a.className=`${chip.className} v466-helper-call-link`;
      a.href=`tel:${phone}`;
      a.title='แตะเพื่อโทร';
      a.setAttribute('aria-label',`โทรหา ${helperDisplayName(row)}`);
      a.innerHTML=`${chip.innerHTML}<span class="v466-helper-phone-icon" aria-hidden="true">☎</span>`;
      chip.replaceWith(a);
    });
  }
  function decorateWeekdayTapCue(root,date){
    if(isOffDay(date))return;
    const cards=[...root.querySelectorAll?.('.card')||[]];
    const card=cards.find(c=>/ลา\s*\/\s*ไม่รับเวร/.test(String(c.querySelector?.('h3')?.textContent||'')));
    if(!card)return;
    card.querySelectorAll('.v447-leave-rank-button,.v436-no-duty-rank-badge').forEach(btn=>btn.classList.add('v466-dashboard-tap-cue'));
    card.querySelectorAll('.v397-today-item').forEach(item=>{
      const target=item.querySelector('.v447-leave-rank-button,.v436-no-duty-rank-badge');
      if(!target)return;
      item.classList.add('v466-dashboard-detail-row');
      item.setAttribute('role','button');item.setAttribute('tabindex','0');
      item.title='แตะดูวันที่และเวลาที่บันทึกครั้งแรก';
    });
  }

  /* ---------- HR pending category, <= Bangkok today ---------- */
  function mergeRows(key,rows){
    const st=S(),cur=Array.isArray(st[key])?st[key]:[],map=new Map();
    [...cur,...(rows||[])].forEach(r=>{if(r?.id!=null)map.set(String(r.id),r);});
    st[key]=[...map.values()];
  }
  function hrPendingLabel(hr){
    const status=String(hr?.status||'').trim();
    if(status==='รอเอกสาร')return 'รอเอกสาร HR';
    if(status==='รอตรวจสอบ'||hr?.hr_reported_date)return 'รอตรวจสอบ HR';
    return 'ยังไม่ลง HR';
  }
  function hrPendingItems(leaves,hrRows,today){
    const hrMap=new Map();
    (hrRows||[]).forEach(h=>{const id=String(h?.leave_request_id||'');if(id)hrMap.set(id,h);});
    return (leaves||[])
      .filter(r=>effectiveLeave(r)&&typeOf(r)!=='ไม่รับเวร')
      .filter(r=>{const d=norm(r?.start_date);return d&&d<=today;})
      .filter(r=>{const h=hrMap.get(String(r?.id||''));const s=String(h?.status||'').trim();return !['ตรวจสอบแล้ว','ยกเลิก'].includes(s);})
      .sort((a,b)=>norm(a?.start_date).localeCompare(norm(b?.start_date))||String(a?.created_at||'').localeCompare(String(b?.created_at||'')))
      .map(r=>{
        const h=hrMap.get(String(r?.id||''))||null;
        const start=norm(r.start_date),end=norm(r.end_date||r.start_date);
        const dateText=end&&end!==start?`${thaiDate(start)}–${thaiDate(end)}`:thaiDate(start);
        return {id:r.id,page:'hr',month:start.slice(0,7),date:start,title:staffNameSafe(r.staff_id),detail:`${typeOf(r)} · ${periodLabel(r)} · ${dateText} · ${hrPendingLabel(h)}`};
      });
  }
  function signature(items){return (items||[]).map(x=>`${x.id}|${x.detail}`).join('||');}
  function replaceHrCategory(items){
    const api=window.cnmiV460;if(!api?.pendingCache)return false;
    const pc=api.pendingCache,cats=Array.isArray(pc.categories)?pc.categories.filter(c=>c?.key!=='hr'):[];
    if(items.length)cats.push({key:'hr',label:'ตรวจ HR',tone:'gray',items});
    const sig=signature(items);const changed=sig!==hrSync.lastSignature;
    hrSync.lastSignature=sig;pc.categories=cats;pc.status='loaded';pc.loadedAt=Date.now();
    return changed;
  }
  async function syncHrPending(force=false,{rerender=true}={}){
    if(!effectiveAdmin()||String(S().page||'')!=='dashboard'||document.hidden)return [];
    if(hrSync.loading)return hrSync.promise||[];
    if(!force&&Date.now()-hrSync.lastAt<55000)return [];
    /* V460 may still be building the other pending categories. Wait for it so
       our HR category is applied last instead of being overwritten by a late base response. */
    try{
      const pc=window.cnmiV460?.pendingCache;
      for(let i=0;pc?.status==='loading'&&i<80;i++)await new Promise(r=>setTimeout(r,100));
    }catch(_){ }
    const db=DB();if(!db)return[];
    hrSync.loading=true;
    hrSync.promise=(async()=>{
      try{
        const today=bangkokToday();
        const [leaveRes,hrRes]=await Promise.all([
          db.from('leave_requests').select('*').lte('start_date',today).order('start_date',{ascending:true}).limit(600),
          db.from('hr_checks').select('*').order('updated_at',{ascending:false}).limit(1200)
        ]);
        if(leaveRes?.error)throw leaveRes.error;
        if(hrRes?.error)throw hrRes.error;
        const leaves=leaveRes?.data||[],hrs=hrRes?.data||[];
        mergeRows('leaves',leaves);mergeRows('hrChecks',hrs);
        const items=hrPendingItems(leaves,hrs,today);
        const changed=replaceHrCategory(items);
        hrSync.lastAt=Date.now();
        if(changed&&rerender&&effectiveAdmin()&&String(S().page||'')==='dashboard'){
          const y=window.scrollY||0;
          try{if(typeof renderPage==='function')renderPage();}catch(_){ }
          setTimeout(()=>{try{window.scrollTo(0,y);}catch(_){ }},0);
        }
        return items;
      }catch(err){console.warn('[V466] HR pending sync failed',err);return[];}
      finally{hrSync.loading=false;hrSync.promise=null;}
    })();
    return hrSync.promise;
  }

  const api460=window.cnmiV460||null;
  const basePendingLoader=api460?.loadAdminPending?api460.loadAdminPending.bind(api460):null;
  if(api460&&basePendingLoader&&!api460.__v466HrWrapped){
    api460.loadAdminPending=async function loadAdminPendingV466(force=false){
      const out=await basePendingLoader(!!force);
      await syncHrPending(!!force,{rerender:true});
      return api460.pendingCache?.categories||out||[];
    };
    api460.__v466HrWrapped=true;
  }

  function decorateDashboardHtml(html){
    try{
      const date=selectedDate(),tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decorateWeekdayTapCue(tpl.content,date);
      decorateHelperPhones(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      if(effectiveAdmin()&&String(S().page||'')==='dashboard')setTimeout(()=>syncHrPending(false,{rerender:true}),350);
      return holder.innerHTML;
    }catch(err){console.warn('[V466] dashboard decorate skipped',err);return html;}
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV466(){return decorateDashboardHtml(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  document.addEventListener('click',event=>{
    const row=event.target?.closest?.('.v466-dashboard-detail-row');
    if(row&&!event.target?.closest?.('button,a,input,select,textarea,label')){
      const btn=row.querySelector('.v447-leave-rank-button,.v436-no-duty-rank-badge');
      if(btn){event.preventDefault();btn.click();return;}
    }
    if(event.target?.closest?.('[data-v460-refresh-pending]'))setTimeout(()=>syncHrPending(true,{rerender:true}),450);
  },true);
  document.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key))return;
    const row=event.target?.closest?.('.v466-dashboard-detail-row');if(!row)return;
    event.preventDefault();row.querySelector('.v447-leave-rank-button,.v436-no-duty-rank-badge')?.click();
  },true);

  const style=document.createElement('style');style.id='cnmi-v466-style';style.textContent=`
    .v466-ot-start-note{display:block;margin-top:4px;font-size:9px!important;line-height:1.35;color:#6f8190!important;font-weight:600!important}
    .v466-dashboard-detail-row{cursor:pointer;touch-action:manipulation}.v466-dashboard-detail-row:hover{background:#f7fbfe}.v466-dashboard-detail-row:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(54,126,174,.16)}
    .v466-dashboard-tap-cue::after{content:' • แตะดู';color:#71879a;font-weight:800;font-size:.92em}
    .v466-helper-call-link{text-decoration:none!important;cursor:pointer;touch-action:manipulation}.v466-helper-call-link:hover{background:#e8f5fc!important;border-color:#9fcce5!important}.v466-helper-phone-icon{font-size:9px;line-height:1;color:#2477a8;margin-left:1px}.v466-helper-call-link:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(61,139,186,.18)}
    @media(max-width:820px){.v466-ot-start-note{font-size:10px!important}.v466-dashboard-tap-cue::after{font-size:1em}.v466-helper-phone-icon{font-size:11px}}
  `;document.head.appendChild(style);

  window.cnmiV466={version:VERSION,syncHrPending,defaultOtStart,hrSync};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v466-ot-weekend-hr-helper-call-dashboard-cue.js", error); }
;

/* Original source: patch-v469-month-position-used-slot-cue.js */
try {
/* CNMI Staff Planner V469
   Monthly daytime-position assignment cues.
   - Shows ✓ + assignee name for positions already used on the same date.
   - Disables positions already assigned to another staff member to prevent accidental duplicates.
   - Highlights cells that already have an assignment.
   - UI only; no SQL/schema/data migration.
*/
(function(){
  'use strict';
  const VERSION='V469_MONTH_POSITION_USED_SLOT_CUE';
  if(window.__CNMI_V469_MONTH_POSITION_USED_SLOT_CUE__) return;
  window.__CNMI_V469_MONTH_POSITION_USED_SLOT_CUE__=true;

  let queued=false;
  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function norm(v){return String(v==null?'':v).trim();}
  function isAdminSafe(){
    try{return !!isAdmin();}
    catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isTarget(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}

  function staffLabel(staffId,cell){
    const id=norm(staffId);
    const person=(S()?.staff||[]).find(row=>norm(row?.id)===id);
    const fromState=norm(person?.nickname||person?.full_name||person?.display_name||person?.email);
    if(fromState)return fromState;
    const fromRow=norm(cell?.closest?.('tr')?.querySelector?.('.v275-sticky-name b')?.textContent);
    return fromRow||'ไม่ทราบชื่อ';
  }

  function selects(){
    return [...document.querySelectorAll('.v275-position-wrap [data-v275-position-cell] [data-v275-position-select]')];
  }

  function usageByDate(list){
    const result=new Map();
    list.forEach(select=>{
      const cell=select.closest('[data-v275-position-cell]');
      const date=norm(cell?.dataset?.date);
      const staffId=norm(cell?.dataset?.staffId);
      const code=norm(select.value);
      if(!date||!staffId||!code)return;
      if(!result.has(date))result.set(date,new Map());
      const day=result.get(date);
      if(!day.has(code))day.set(code,[]);
      day.get(code).push({staffId,name:staffLabel(staffId,cell),select,cell});
    });
    return result;
  }

  function optionBase(option){
    if(!option)return'';
    if(option.value==='')return'ว่าง';
    if(!option.dataset.v469BaseLabel){
      option.dataset.v469BaseLabel=norm(option.value)||norm(option.textContent);
    }
    return option.dataset.v469BaseLabel;
  }

  function applySelect(select,usage){
    const cell=select.closest('[data-v275-position-cell]');
    if(!cell)return;
    const date=norm(cell.dataset.date);
    const staffId=norm(cell.dataset.staffId);
    const current=norm(select.value);
    const day=usage.get(date)||new Map();

    [...select.options].forEach(option=>{
      const code=norm(option.value);
      if(!code){
        option.disabled=false;
        option.textContent='ว่าง';
        return;
      }
      const base=optionBase(option);
      const holders=day.get(code)||[];
      if(!holders.length){
        option.disabled=false;
        option.textContent=base;
        option.title=`${base} — ยังว่าง`;
        return;
      }
      const own=holders.some(holder=>holder.staffId===staffId);
      const names=[...new Set(holders.map(holder=>holder.name).filter(Boolean))];
      const nameText=names.join(', ')||'มีผู้รับผิดชอบแล้ว';
      if(own&&current===code){
        option.disabled=false;
        option.textContent=`✓ ${base} · ${nameText}`;
        option.title=`${base} — ${nameText}`;
      }else{
        option.disabled=true;
        option.textContent=`✓ ${base} · ${nameText} · ใช้แล้ว`;
        option.title=`${base} ใช้แล้วโดย ${nameText}`;
      }
    });

    cell.classList.toggle('v469-position-assigned',!!current);
    if(current){
      const holders=day.get(current)||[];
      const own=holders.find(holder=>holder.staffId===staffId);
      const who=own?.name||staffLabel(staffId,cell);
      select.title=`✓ จัดแล้ว: ${current} — ${who}`;
      select.setAttribute('aria-label',`จัดแล้ว ${current} ผู้รับผิดชอบ ${who} วันที่ ${date}`);
    }else{
      select.title='ยังไม่ได้จัดตำแหน่ง';
    }
  }

  function ensureLegend(){
    const page=document.querySelector('.v275-page');
    if(!page||page.querySelector('[data-v469-position-legend]'))return;
    const toolbar=page.querySelector('.card .toolbar');
    if(!toolbar)return;
    const legend=document.createElement('span');
    legend.dataset.v469PositionLegend='';
    legend.className='v469-position-legend';
    legend.textContent='✓ มีคนแล้ว · ตัวเลือกจะแสดงชื่อผู้รับผิดชอบ';
    toolbar.appendChild(legend);
  }

  function apply(){
    if(!isTarget())return;
    const list=selects();
    if(!list.length)return;
    const usage=usageByDate(list);
    list.forEach(select=>applySelect(select,usage));
    ensureLegend();
  }

  function queue(delay=0){
    if(queued)return;
    queued=true;
    const run=()=>requestAnimationFrame(()=>{queued=false;apply();});
    delay?setTimeout(run,delay):run();
  }

  const style=document.createElement('style');
  style.id='v469-month-position-used-slot-cue-style';
  style.textContent=`
    .v275-page .v275-position-cell.v469-position-assigned{
      border-radius:8px;
      box-shadow:inset 3px 0 0 #22c55e;
      background:rgba(240,253,244,.72);
    }
    .v275-page .v275-position-cell.v469-position-assigned select{
      background:#f0fdf4!important;
      border-color:#86efac!important;
      color:#166534!important;
      font-weight:800!important;
    }
    .v275-page .v469-position-legend{
      display:inline-flex;
      align-items:center;
      min-height:30px;
      padding:5px 9px;
      border:1px solid #bbf7d0;
      border-radius:999px;
      background:#f0fdf4;
      color:#166534;
      font-size:11px;
      font-weight:800;
      white-space:nowrap;
    }
    @media(max-width:820px){
      .v275-page .v469-position-legend{font-size:9px;min-height:26px;padding:4px 7px}
    }
  `;
  document.head.appendChild(style);

  /* Native <select> fires input before the legacy V290 capture-change handler.
     Refreshing here makes the cue immediate without touching the save logic. */
  window.addEventListener('input',event=>{
    if(!isTarget())return;
    if(event.target?.matches?.('.v275-position-wrap [data-v275-position-select]'))queue();
  },true);
  window.addEventListener('pointerdown',event=>{
    if(!isTarget())return;
    if(event.target?.matches?.('.v275-position-wrap [data-v275-position-select]'))apply();
  },true);
  window.addEventListener('focusin',event=>{
    if(!isTarget())return;
    if(event.target?.matches?.('.v275-position-wrap [data-v275-position-select]'))apply();
  },true);
  window.addEventListener('click',event=>{
    if(!isTarget())return;
    if(event.target?.closest?.('.v275-position-wrap'))queue(20);
  },true);

  const root=document.getElementById('pageContent')||document.body;
  if(root){
    new MutationObserver(mutations=>{
      if(!isTarget())return;
      const relevant=mutations.some(m=>{
        if(m.type==='attributes'&&m.attributeName==='data-v290-save-state')return true;
        return [...(m.addedNodes||[])].some(node=>node?.nodeType===1&&(node.matches?.('.v275-position-wrap,[data-v275-position-cell]')||node.querySelector?.('.v275-position-wrap,[data-v275-position-cell]')));
      });
      if(relevant)queue(10);
    }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-v290-save-state']});
  }

  document.addEventListener('DOMContentLoaded',()=>queue(80),{once:true});
  setTimeout(apply,0);
  setTimeout(apply,250);

  window.cnmiV469={apply,version:VERSION};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v469-month-position-used-slot-cue.js", error); }
;

/* Original source: patch-v470-position-stat-room-groups-current-only.js */
try {
/* CNMI Staff Planner V470
   Current-position statistics grouped by real work room.
   - Statistics detail tables show only the current normal-day Slot codes.
   - Current positions are ordered by room and share the same soft background.
   - Adds a room legend: Specimen & Issue / Blood Bank / Component Prep / Donor Room.
   - Old/retired position columns remain in historical data, but are hidden from the current-position statistics.
   - Position Management displays the derived room/group name without changing the stored zone values.
   - No Supabase schema/data changes.
*/
(function(){
  'use strict';
  const VERSION='V470_POSITION_STAT_ROOM_GROUPS_CURRENT_ONLY';
  if(window.__CNMI_V470_POSITION_STAT_ROOM_GROUPS_CURRENT_ONLY__) return;
  window.__CNMI_V470_POSITION_STAT_ROOM_GROUPS_CURRENT_ONLY__=true;

  let queued=false;
  let loadingRequested=false;

  function S(){ try{return state||window.state||{};}catch(_){return window.state||{};} }
  function norm(v){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g,''); }
  function page(){ return String(S()?.page||''); }
  function admin(){ try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';} }

  const GROUPS=[
    {id:'specimen-issue', label:'Specimen & Issue', thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank', label:'Blood Bank', thai:'งานตรวจ Donor / งาน Immunohematology และเคสยาก'},
    {id:'component-prep', label:'Component Prep', thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room', label:'Donor Room', thai:'ห้องบริจาคโลหิต'},
    {id:'other', label:'อื่นๆ', thai:'ตำแหน่งปัจจุบันที่ยังไม่ได้จัดกลุ่ม'}
  ];
  const groupById=id=>GROUPS.find(g=>g.id===id)||GROUPS[GROUPS.length-1];

  function roomGroup(code){
    const raw=String(code||'').trim();
    const k=norm(raw);
    if(!raw) return 'other';
    if(/^dr-/i.test(raw)) return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2') return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4') return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport') return 'specimen-issue';
    if(/^bb-/i.test(raw)) return 'specimen-issue';
    return 'other';
  }

  function baseSlotCount(){
    try{
      const n=Number(window.cnmiV231?.getBaseSlotCount231?.());
      if(Number.isFinite(n)&&n>0) return Math.round(n);
    }catch(_){}
    const fromState=Number(S()?.baseSlotCountV231||0);
    return Number.isFinite(fromState)&&fromState>0?Math.round(fromState):13;
  }

  function currentSlotRows(){
    const n=baseSlotCount();
    try{
      const cfg=window.cnmiV224?.currentConfigs?.();
      const rows=cfg?.day?.[n]||cfg?.day?.[String(n)]||[];
      if(Array.isArray(rows)&&rows.length) return rows;
    }catch(_){}
    try{
      const masters=(S()?.positionMasters||[]).filter(r=>r&&r.is_active!==false&&!r.deleted_at&&!String(r.code||'').startsWith('__CNMI_SLOT_TEMPLATE')&&r.is_outing!==true&&String(r.zone||'')!=='ออกหน่วย');
      if(masters.length) return masters.sort((a,b)=>Number(a.sort_order||999)-Number(b.sort_order||999));
    }catch(_){}
    return [];
  }

  function currentCodes(){
    const seen=new Set();
    return currentSlotRows().map(r=>String(r?.code||r?.position_code||'').trim()).filter(c=>c&&!seen.has(c)&&seen.add(c));
  }

  function orderedCurrentCodes(){
    const codes=currentCodes();
    const rank=new Map(GROUPS.map((g,i)=>[g.id,i]));
    return codes.map((code,index)=>({code,index,group:roomGroup(code)})).sort((a,b)=>(rank.get(a.group)??99)-(rank.get(b.group)??99)||a.index-b.index).map(x=>x.code);
  }

  function textNumber(cell){
    const raw=String(cell?.textContent||'').replace(/,/g,'').trim();
    const n=Number(raw);
    return Number.isFinite(n)?n:0;
  }

  function addLegend(card,codes){
    if(!card) return;
    let legend=card.querySelector('.v470-room-legend');
    if(!legend){
      legend=document.createElement('div');
      legend.className='v470-room-legend';
      const title=card.querySelector('.section-title');
      if(title) title.insertAdjacentElement('afterend',legend);
      else card.prepend(legend);
    }
    const used=[...new Set(codes.map(roomGroup))];
    const signature=used.map(id=>`${id}:${codes.filter(c=>roomGroup(c)===id).length}`).join('|');
    if(legend.dataset.v470Signature===signature) return;
    legend.dataset.v470Signature=signature;
    legend.innerHTML=used.map(id=>{
      const g=groupById(id);
      const count=codes.filter(c=>roomGroup(c)===id).length;
      return `<span class="v470-room-chip" data-v470-group="${g.id}" title="${g.thai}"><b>${g.label}</b><small>${count} ตำแหน่ง</small></span>`;
    }).join('');
  }

  function updateCardCopy(card,isLifetime){
    const title=card?.querySelector('.section-title h3');
    const hint=card?.querySelector('.section-title .hint');
    if(title) title.textContent=isLifetime?'ตารางที่ 4 — ตำแหน่งสะสมทั้งหมด':'ตารางที่ 2 — ตำแหน่งประจำเดือนนี้';
    if(hint) hint.textContent=isLifetime?'เฉพาะตำแหน่งปัจจุบัน · เรียงตามห้อง · ตำแหน่งเก่าที่เลิกใช้ยังเก็บประวัติไว้แต่ไม่แสดง':'เฉพาะตำแหน่งปัจจุบัน · เรียงตามห้อง';
  }

  function rebuildDetailTable(table,codes,isLifetime){
    if(!table||!codes.length) return;
    const headRow=table.tHead?.rows?.[0];
    const body=table.tBodies?.[0];
    if(!headRow||!body) return;

    const headerCells=Array.from(headRow.cells||[]);
    if(headerCells.length<3) return;
    const indexByCode=new Map();
    headerCells.forEach((cell,index)=>{
      if(index===0||index===headerCells.length-1) return;
      indexByCode.set(String(cell.textContent||'').trim(),index);
    });
    const available=codes.filter(code=>indexByCode.has(code));
    if(!available.length) return;
    const signature=available.join('¦');
    if(table.dataset.v470Signature===signature){
      addLegend(table.closest('.v278-position-stat-card'),available);
      return;
    }

    const sourceHeader=headerCells.map(cell=>cell.cloneNode(true));
    const sourceRows=Array.from(body.rows||[]).map(row=>Array.from(row.cells||[]).map(cell=>cell.cloneNode(true)));
    const oldLast=headerCells.length-1;

    headRow.innerHTML='';
    const first=sourceHeader[0];
    first.textContent='เจ้าหน้าที่';
    headRow.appendChild(first);
    available.forEach(code=>{
      const idx=indexByCode.get(code);
      const cell=sourceHeader[idx];
      cell.classList.remove('v373-stat-color');
      delete cell.dataset.v373StatGroup;
      const group=roomGroup(code);
      cell.dataset.v470Group=group;
      cell.dataset.v470Code=code;
      cell.title=`${code} · ${groupById(group).label}`;
      headRow.appendChild(cell);
    });
    const totalHead=sourceHeader[oldLast];
    totalHead.textContent='รวม';
    totalHead.title='รวมเฉพาะตำแหน่งปัจจุบันที่แสดง';
    headRow.appendChild(totalHead);

    Array.from(body.rows||[]).forEach((row,rowIndex)=>{
      const src=sourceRows[rowIndex]||[];
      row.innerHTML='';
      if(src[0]) row.appendChild(src[0]);
      let total=0;
      available.forEach(code=>{
        const idx=indexByCode.get(code);
        const cell=src[idx]||document.createElement('td');
        cell.classList.remove('v373-stat-color');
        delete cell.dataset.v373StatGroup;
        const value=textNumber(cell);
        total+=value;
        const group=roomGroup(code);
        cell.dataset.v470Group=group;
        cell.dataset.v470Code=code;
        cell.classList.toggle('v470-never',value===0);
        if(value===0) cell.title='ยังไม่เคยอยู่ตำแหน่งนี้';
        row.appendChild(cell);
      });
      const totalCell=src[oldLast]||document.createElement('td');
      totalCell.innerHTML=`<b>${total}</b>`;
      totalCell.title='รวมเฉพาะตำแหน่งปัจจุบันที่แสดง';
      row.appendChild(totalCell);
    });

    table.dataset.v470Signature=signature;
    const card=table.closest('.v278-position-stat-card');
    addLegend(card,available);
    updateCardCopy(card,isLifetime);
  }

  function enhanceStats(){
    if(page()!=='positionMonth'||!admin()) return;
    const codes=orderedCurrentCodes();
    if(!codes.length){ requestConfigs(); return; }
    const tables=Array.from(document.querySelectorAll('.v278-position-detail-table'));
    tables.forEach((table,index)=>rebuildDetailTable(table,codes,index===1));
  }

  function decoratePositionManagement(){
    if(page()!=='positionManagement'||!admin()) return;
    document.querySelectorAll('.v224-slot-table').forEach(table=>{
      const head=table.tHead?.rows?.[0];
      if(head?.cells?.[2] && head.cells[2].textContent!=='ห้อง/กลุ่มงาน') head.cells[2].textContent='ห้อง/กลุ่มงาน';
      Array.from(table.tBodies?.[0]?.rows||[]).forEach(row=>{
        const code=String(row.cells?.[1]?.querySelector('b')?.textContent||row.cells?.[1]?.textContent||'').trim();
        const zoneCell=row.cells?.[2];
        if(!code||!zoneCell) return;
        const systemZone=zoneCell.dataset.v470SystemZone||String(zoneCell.textContent||'').trim();
        zoneCell.dataset.v470SystemZone=systemZone;
        const group=roomGroup(code),g=groupById(group);
        if(zoneCell.dataset.v470Decorated===group && zoneCell.querySelector('.v470-zone-pill')) return;
        zoneCell.dataset.v470Decorated=group;
        zoneCell.innerHTML=`<span class="v470-zone-pill" data-v470-group="${group}" title="${g.thai} · ค่าโซนระบบเดิม: ${systemZone}">${g.label}</span>`;
      });
      const wrap=table.closest('.v224-slot-crud-card');
      if(wrap&&!wrap.querySelector('.v470-room-note')){
        const note=document.createElement('div');
        note.className='notice soft-notice compact v470-room-note';
        note.innerHTML='<b>ชื่อห้องที่ใช้จัดกลุ่ม:</b> Specimen &amp; Issue · Blood Bank · Component Prep · Donor Room <span class="muted">(เปลี่ยนเฉพาะการแสดงผล/สถิติ ไม่เปลี่ยน Code และค่าโซนเดิมในฐานข้อมูล)</span>';
        const tableWrap=table.closest('.table-wrap');
        tableWrap?.insertAdjacentElement('beforebegin',note);
      }
    });

    const form=document.getElementById('slotTemplateFormV224');
    if(form&&!form.querySelector('.v470-modal-room-note')){
      const codeInput=form.querySelector('[name="code"]');
      const zoneSelect=form.querySelector('[name="zone"]');
      if(zoneSelect){
        const note=document.createElement('span');
        note.className='hint v470-modal-room-note';
        const refresh=()=>{
          const code=String(codeInput?.value||'').trim();
          const g=groupById(roomGroup(code));
          note.textContent=code?`ห้องที่แสดงในสถิติ: ${g.label}`:'ชื่อห้องในสถิติจะอิงจาก Code ตำแหน่งอัตโนมัติ';
        };
        zoneSelect.parentElement?.appendChild(note);
        codeInput?.addEventListener('input',refresh);
        refresh();
      }
    }
  }

  function requestConfigs(){
    if(loadingRequested) return;
    const fn=window.cnmiV224?.loadDbConfigs;
    if(typeof fn!=='function') return;
    loadingRequested=true;
    try{
      const p=fn(false);
      if(p&&typeof p.then==='function') p.finally(()=>{loadingRequested=false;queue();});
      else loadingRequested=false;
    }catch(_){ loadingRequested=false; }
  }

  function enhance(){
    enhanceStats();
    decoratePositionManagement();
  }
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance();});
  }

  const style=document.createElement('style');
  style.id='v470-position-stat-room-groups-current-only-style';
  style.textContent=`
    .v470-room-legend{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px}
    .v470-room-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #d8e2ec;border-radius:9px;padding:5px 8px;color:#274157;line-height:1}
    .v470-room-chip b{font-size:9px}.v470-room-chip small{font-size:7px;color:#64748b}
    .v470-room-chip[data-v470-group="specimen-issue"],.v470-zone-pill[data-v470-group="specimen-issue"]{background:#e8f2ff;border-color:#bfdbfe}
    .v470-room-chip[data-v470-group="blood-bank"],.v470-zone-pill[data-v470-group="blood-bank"]{background:#fff3d9;border-color:#fde68a}
    .v470-room-chip[data-v470-group="component-prep"],.v470-zone-pill[data-v470-group="component-prep"]{background:#f2eaff;border-color:#ddd6fe}
    .v470-room-chip[data-v470-group="donor-room"],.v470-zone-pill[data-v470-group="donor-room"]{background:#e8f8ee;border-color:#bbf7d0}
    .v470-room-chip[data-v470-group="other"],.v470-zone-pill[data-v470-group="other"]{background:#f8fafc;border-color:#cbd5e1}

    .v278-position-detail-table [data-v470-group="specimen-issue"]{background:#eef6ff!important}
    .v278-position-detail-table [data-v470-group="blood-bank"]{background:#fff8e8!important}
    .v278-position-detail-table [data-v470-group="component-prep"]{background:#f7f0ff!important}
    .v278-position-detail-table [data-v470-group="donor-room"]{background:#eefaf2!important}
    .v278-position-detail-table [data-v470-group="other"]{background:#f8fafc!important}
    .v278-position-detail-table thead [data-v470-group]{font-weight:850!important;color:#223b50!important;border-top:3px solid transparent!important}
    .v278-position-detail-table thead [data-v470-group="specimen-issue"]{border-top-color:#60a5fa!important}
    .v278-position-detail-table thead [data-v470-group="blood-bank"]{border-top-color:#f59e0b!important}
    .v278-position-detail-table thead [data-v470-group="component-prep"]{border-top-color:#8b5cf6!important}
    .v278-position-detail-table thead [data-v470-group="donor-room"]{border-top-color:#22c55e!important}
    .v278-position-detail-table td.v470-never{color:#b42318!important;font-weight:850!important;box-shadow:inset 0 0 0 1px rgba(180,35,24,.14)}

    .v470-zone-pill{display:inline-flex;align-items:center;border:1px solid #d8e2ec;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;color:#274157;white-space:nowrap}
    .v470-room-note{margin:6px 0!important}
    .v470-modal-room-note{display:block;margin-top:4px}

    @media(max-width:820px){
      .v470-room-chip{padding:4px 6px}.v470-room-chip b{font-size:8px}.v470-room-chip small{font-size:6.5px}
      .v470-zone-pill{font-size:9px;padding:3px 6px}
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>{requestConfigs();queue();},{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{requestConfigs();queue();},300);

  window.cnmiV470={version:VERSION,roomGroup,currentCodes,orderedCurrentCodes,enhance};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v470-position-stat-room-groups-current-only.js", error); }
;

/* Original source: patch-v471-dashboard-room-groups-september.js */
try {
/* CNMI Staff Planner V471
 * Dashboard daytime positions: real work-room grouping effective 1 Sep 2026.
 * - Sep 2026 onward: Specimen & Issue / Blood Bank / Component Prep / Donor Room.
 * - Aug 2026 and earlier keep the previous Dashboard grouping for historical continuity.
 * - Reuses the exact assigned position rows already rendered; display only.
 * - Position popup room badge follows the same room grouping from Sep 2026 onward.
 * - No Supabase schema/data changes.
 */
(function(){
  'use strict';
  const VERSION='V471_DASHBOARD_ROOM_GROUPS_SEPTEMBER';
  const EFFECTIVE='2026-09-01';
  if(window.__CNMI_V471_DASHBOARD_ROOM_GROUPS_SEPTEMBER__) return;
  window.__CNMI_V471_DASHBOARD_ROOM_GROUPS_SEPTEMBER__=true;

  const GROUPS=[
    {id:'specimen-issue',label:'Specimen & Issue',thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank',label:'Blood Bank',thai:'ตรวจ Donor / Immunohematology และเคสยาก'},
    {id:'component-prep',label:'Component Prep',thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room',label:'Donor Room',thai:'ห้องบริจาคโลหิต'},
    {id:'other',label:'อื่นๆ',thai:'ตำแหน่งอื่น'}
  ];
  const byId=id=>GROUPS.find(g=>g.id===id)||GROUPS[GROUPS.length-1];

  function text(v){return String(v==null?'':v).trim();}
  function normDate(v){return text(v).slice(0,10);}
  function selectedDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.())||normDate(typeof todayStr==='function'?todayStr():'');}catch(_){return normDate(new Date().toISOString());}
  }
  function isNew(date){const d=normDate(date);return !!d&&d>=EFFECTIVE;}
  function codeOf(row){return text(row?.position_code||row?.code);}
  function roomGroup(code){
    try{const g=window.cnmiV470?.roomGroup?.(code);if(g)return g;}catch(_){ }
    const raw=text(code),k=raw.toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');
    if(/^dr-/i.test(raw))return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2')return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4')return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport')return 'specimen-issue';
    if(/^bb-/i.test(raw))return 'specimen-issue';
    return 'other';
  }
  function rowsFor(date){try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}}
  function isVacant(item){return !!item?.querySelector?.('.v434-vacant-pill')||item?.classList?.contains('is-vacant');}
  function isOnLeave(item){return !!item?.classList?.contains('v445-has-leave');}

  function buildGroup(groupId,entries){
    const g=byId(groupId);
    const total=entries.length;
    const assigned=entries.filter(x=>!isVacant(x.item)).length;
    const ready=entries.filter(x=>!isVacant(x.item)&&!isOnLeave(x.item)).length;
    const section=document.createElement('section');
    section.className='v434-zone-group v471-room-group';
    section.dataset.v471Group=groupId;
    section.innerHTML=`<div class="v434-zone-head v471-room-head"><div class="v471-room-title"><b>${g.label}</b><small>${g.thai}</small></div><span class="v445-zone-count"><b>พร้อม ${ready}/${total}</b><small>จัด ${assigned}/${total}</small></span></div><div class="v434-position-grid"></div>`;
    const grid=section.querySelector('.v434-position-grid');
    entries.forEach(x=>grid.appendChild(x.item));
    return section;
  }

  function decorateCard(card,date){
    if(!card||!isNew(date))return;
    if(card.dataset.v471Date===date)return;
    const rows=rowsFor(date);
    const items=Array.from(card.querySelectorAll('.v434-position-item'));
    if(!rows.length||!items.length)return;

    // Preserve the exact rendered item (leave/HR/status decorations included) and regroup only its container.
    const entries=[];
    items.forEach((item,index)=>{
      const row=rows[index];
      if(!row)return;
      entries.push({item,row,group:roomGroup(codeOf(row))});
    });
    if(!entries.length)return;

    const holder=card.querySelector('.v434-groups');
    if(!holder)return;
    holder.innerHTML='';
    GROUPS.forEach(g=>{
      const list=entries.filter(x=>x.group===g.id);
      if(list.length)holder.appendChild(buildGroup(g.id,list));
    });
    card.dataset.v471Date=date;
    card.dataset.v471DashboardRooms='1';

    const title=card.querySelector('.v434-title .hint');
    if(title&&!card.querySelector('.v471-effective-note')){
      const note=document.createElement('span');
      note.className='v471-effective-note';
      note.textContent='จัดตามห้องจริง';
      note.title='ใช้โครงสร้างห้องใหม่ตั้งแต่ 1 ก.ย. 2569';
      title.insertAdjacentElement('afterend',note);
    }
  }

  function decorateDashboard(root=document,date=selectedDate()){
    if(!isNew(date))return;
    root.querySelectorAll?.('[data-v434-daytime-positions]').forEach(card=>decorateCard(card,date));
  }

  function decorateHtml(html){
    const date=selectedDate();
    if(!isNew(date))return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decorateDashboard(tpl.content,date);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] HTML decoration skipped`,err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV471(){return decorateHtml(String(oldDashboard.apply(this,arguments)||''));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function popupCode(modal){return text(modal?.querySelector?.('.v435-modal-heading h2')?.textContent);}
  function decoratePositionPopup(date){
    if(!isNew(date))return;
    document.querySelectorAll('.v435-position-summary-modal,.v435-position-full-modal').forEach(modal=>{
      const d=normDate(modal.dataset.v435Date)||date;
      if(!isNew(d))return;
      const badge=modal.querySelector('.v435-zone-badge');
      const code=popupCode(modal);
      if(!badge||!code)return;
      const g=byId(roomGroup(code));
      badge.textContent=g.label;
      badge.title=g.thai;
      badge.dataset.v471Group=g.id;
    });
  }

  let queued=false;
  function queue(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;const d=selectedDate();decorateDashboard(document,d);decoratePositionPopup(d);});
  }
  document.addEventListener('DOMContentLoaded',queue,{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});

  const style=document.createElement('style');
  style.id='cnmi-v471-dashboard-room-groups-september';
  style.textContent=`
    .v471-effective-note{display:inline-flex;margin-left:6px;padding:2px 6px;border-radius:999px;background:#eef5fb;color:#587087;font-size:9px;font-weight:800;vertical-align:middle}
    .v471-room-head{align-items:flex-start!important}
    .v471-room-title{min-width:0;display:flex;flex-direction:column;gap:2px}
    .v471-room-title b{font-size:12px!important;color:#2c4a65}
    .v471-room-title small{font-size:8.5px;color:#7b8fa3;font-weight:650;line-height:1.2}
    .v471-room-group[data-v471-group="specimen-issue"]{border-top:3px solid #60a5fa;background:#f8fbff}
    .v471-room-group[data-v471-group="blood-bank"]{border-top:3px solid #f59e0b;background:#fffdf8}
    .v471-room-group[data-v471-group="component-prep"]{border-top:3px solid #8b5cf6;background:#fcfaff}
    .v471-room-group[data-v471-group="donor-room"]{border-top:3px solid #22c55e;background:#f9fefb}
    .v471-room-group[data-v471-group="other"]{border-top:3px solid #94a3b8}
    .v435-zone-badge[data-v471-group="specimen-issue"]{background:#eef6ff;border-color:#bfdbfe;color:#2563a6}
    .v435-zone-badge[data-v471-group="blood-bank"]{background:#fff8e8;border-color:#fde68a;color:#9a6200}
    .v435-zone-badge[data-v471-group="component-prep"]{background:#f7f0ff;border-color:#ddd6fe;color:#6d42ad}
    .v435-zone-badge[data-v471-group="donor-room"]{background:#eefaf2;border-color:#bbf7d0;color:#23814a}
    @media(max-width:820px){
      .v471-room-title b{font-size:13px!important}.v471-room-title small{font-size:9px}
      .v471-effective-note{font-size:8.5px}
    }
  `;
  document.head.appendChild(style);

  window.cnmiV471={version:VERSION,effectiveDate:EFFECTIVE,roomGroup,decorateDashboard};
  console.info(`[${VERSION}] loaded; effective ${EFFECTIVE}`);
})();

} catch (error) { console.error("[v569] patch-v471-dashboard-room-groups-september.js", error); }
;

/* Original source: patch-v472-admin-month-hide-position-descriptions.js */
try {
/* CNMI Staff Planner V472
 * Admin monthly daytime-position page: hide the long position-description section.
 * - Admin page (state.page === 'positionMonth'): hide "คำอธิบายตำแหน่งที่ใช้ในตาราง".
 * - Staff monthly view (state.page === 'positionMonthView'): keep it exactly as before.
 * - Display-only. No Supabase/data changes.
 */
(function(){
  'use strict';
  const VERSION='V472_ADMIN_MONTH_HIDE_POSITION_DESCRIPTIONS';
  const ROOT_CLASS='v472-admin-position-month';
  if(window.__CNMI_V472_ADMIN_MONTH_HIDE_POSITION_DESCRIPTIONS__) return;
  window.__CNMI_V472_ADMIN_MONTH_HIDE_POSITION_DESCRIPTIONS__=true;

  let queued=false;
  function S(){
    try{return state || window.state || null;}
    catch(_){return window.state || null;}
  }
  function apply(){
    queued=false;
    const adminMonth=String(S()?.page||'')==='positionMonth';
    document.documentElement.classList.toggle(ROOT_CLASS,adminMonth);
    // Accessibility / layout fallback in case an older browser has stale CSS.
    document.querySelectorAll?.('[data-v297-position-descriptions]').forEach(section=>{
      if(adminMonth){
        section.setAttribute('data-v472-admin-hidden','1');
        section.setAttribute('aria-hidden','true');
      }else if(section.getAttribute('data-v472-admin-hidden')==='1'){
        section.removeAttribute('data-v472-admin-hidden');
        section.removeAttribute('aria-hidden');
      }
    });
  }
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(apply);
  }

  const style=document.createElement('style');
  style.id='cnmi-v472-admin-month-hide-position-descriptions-style';
  style.textContent=`
    html.${ROOT_CLASS} [data-v297-position-descriptions],
    html.${ROOT_CLASS} .v297-position-description-card{
      display:none!important;
    }
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-page']});
  document.addEventListener('click',queue,true);
  document.addEventListener('change',queue,true);
  window.addEventListener('popstate',queue);
  window.addEventListener('hashchange',queue);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});
  queue();
  setTimeout(queue,120);
  setTimeout(queue,600);

  window.cnmiV472={version:VERSION,apply};
})();

} catch (error) { console.error("[v569] patch-v472-admin-month-hide-position-descriptions.js", error); }
;

/* Original source: patch-v473-position-stats-live-sync.js */
try {
/* CNMI Staff Planner V473
   Live-sync Admin position statistics after monthly position saves.
   - No manual page refresh is required after assigning/clearing a daytime position.
   - Monthly statistics refresh immediately from the local saved state.
   - Lifetime statistics are updated optimistically from the month delta, then revalidated from Supabase after the user pauses.
   - Keeps V470 room grouping/current-position filtering and V281 tabs/zero-column behavior.
   - No schema/data migration.
*/
(function(){
  'use strict';
  const VERSION='V473_POSITION_STATS_LIVE_SYNC';
  if(window.__CNMI_V473_POSITION_STATS_LIVE_SYNC__) return;
  window.__CNMI_V473_POSITION_STATS_LIVE_SYNC__=true;

  let baseline=null;
  let syncTimer=null;
  let verifyTimer=null;
  let captureTimer=null;
  let verifying=false;

  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function admin(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function target(){return String(S()?.page||'')==='positionMonth'&&admin();}
  function monthKey(){return String(S()?.positionMonthKey||S()?.positionMonthViewKey||S()?.monthKey||'').slice(0,7);}
  function num(v){const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}
  function text(el){return String(el?.textContent||'').trim();}

  function cards(){
    const grid=document.querySelector('.v278-admin-position-stats .v278-stat-grid');
    if(!grid)return[];
    const rows=[...grid.querySelectorAll(':scope > .v278-position-stat-card')];
    return rows.sort((a,b)=>Number(a.dataset.v281StatIndex??rows.indexOf(a))-Number(b.dataset.v281StatIndex??rows.indexOf(b)));
  }

  function staffName(row){return text(row?.cells?.[0]);}
  function detailSnapshot(table){
    const out={codes:[],rows:new Map()};
    const head=table?.tHead?.rows?.[0];
    const body=table?.tBodies?.[0];
    if(!head||!body)return out;
    const heads=[...head.cells];
    out.codes=heads.slice(1,-1).map(cell=>String(cell.dataset.v470Code||text(cell)).trim()).filter(Boolean);
    [...body.rows].forEach(row=>{
      const name=staffName(row);if(!name)return;
      const values=new Map();
      out.codes.forEach((code,i)=>values.set(code,num(row.cells?.[i+1]?.textContent)));
      out.rows.set(name,{values,total:num(row.cells?.[row.cells.length-1]?.textContent)});
    });
    return out;
  }

  function zoneSnapshot(table){
    const out={keys:[],rows:new Map()};
    const head=table?.tHead?.rows?.[0];
    const body=table?.tBodies?.[0];
    if(!head||!body)return out;
    out.keys=[...head.cells].slice(1,-1).map(cell=>text(cell));
    [...body.rows].forEach(row=>{
      const name=staffName(row);if(!name)return;
      const values=new Map();
      out.keys.forEach((key,i)=>values.set(key,num(row.cells?.[i+1]?.textContent)));
      out.rows.set(name,{values,total:num(row.cells?.[row.cells.length-1]?.textContent)});
    });
    return out;
  }

  function lifetimeBadgeBase(){
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    const match=text(heading).match(/ข้อมูลสะสม\s*([\d,]+)\s*รายการ/);
    return match?num(match[1]):null;
  }

  function canCapture(){
    if(!target())return false;
    const list=cards();
    if(list.length<4)return false;
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    if(!heading)return false;
    const t=text(heading);
    return !t.includes('กำลังโหลดข้อมูลสะสม')&&!t.includes('โหลดสะสมไม่สำเร็จ');
  }

  function capture(force=false){
    if(!canCapture())return false;
    const key=monthKey();
    if(!force&&baseline?.key===key)return true;
    const list=cards();
    baseline={
      key,
      monthZone:zoneSnapshot(list[0]?.querySelector('.v278-zone-table')),
      monthDetail:detailSnapshot(list[1]?.querySelector('.v278-position-detail-table')),
      lifeZone:zoneSnapshot(list[2]?.querySelector('.v278-zone-table')),
      lifeDetail:detailSnapshot(list[3]?.querySelector('.v278-position-detail-table')),
      lifeRows:lifetimeBadgeBase()
    };
    decorateStatus('พร้อม · สถิติอัปเดตอัตโนมัติ');
    return true;
  }

  function cellForCode(table,code){
    const head=table?.tHead?.rows?.[0];if(!head)return-1;
    return [...head.cells].findIndex((cell,index)=>index>0&&index<head.cells.length-1&&String(cell.dataset.v470Code||text(cell)).trim()===code);
  }
  function rowByName(table,name){
    return [...(table?.tBodies?.[0]?.rows||[])].find(row=>staffName(row)===name)||null;
  }
  function setNumericCell(cell,value){
    if(!cell)return;
    const safe=Math.max(0,Math.round(Number(value)||0));
    cell.textContent=String(safe);
    if(cell.dataset.v470Group){
      cell.classList.toggle('v470-never',safe===0);
      cell.title=safe===0?'ยังไม่เคยอยู่ตำแหน่งนี้':'';
    }
  }
  function setTotalCell(cell,value){
    if(!cell)return;
    const safe=Math.max(0,Math.round(Number(value)||0));
    cell.innerHTML=`<b>${safe}</b>`;
  }

  function applyDetailDelta(lifeTable,currentMonth){
    if(!lifeTable||!baseline)return;
    const codes=[...lifeTable.tHead.rows[0].cells].slice(1,-1).map(cell=>String(cell.dataset.v470Code||text(cell)).trim());
    const names=new Set([...baseline.lifeDetail.rows.keys(),...baseline.monthDetail.rows.keys(),...currentMonth.rows.keys()]);
    names.forEach(name=>{
      const row=rowByName(lifeTable,name);if(!row)return;
      let total=0;
      codes.forEach(code=>{
        const baseLife=baseline.lifeDetail.rows.get(name)?.values?.get(code)||0;
        const baseMonth=baseline.monthDetail.rows.get(name)?.values?.get(code)||0;
        const current=currentMonth.rows.get(name)?.values?.get(code)||0;
        const value=Math.max(0,baseLife+current-baseMonth);
        total+=value;
        const index=cellForCode(lifeTable,code);
        if(index>0)setNumericCell(row.cells[index],value);
      });
      setTotalCell(row.cells[row.cells.length-1],total);
    });
    syncZeroColumns(lifeTable);
  }

  function applyZoneDelta(lifeTable,currentMonth){
    if(!lifeTable||!baseline)return;
    const head=[...lifeTable.tHead.rows[0].cells];
    const keys=head.slice(1,-1).map(cell=>text(cell));
    const names=new Set([...baseline.lifeZone.rows.keys(),...baseline.monthZone.rows.keys(),...currentMonth.rows.keys()]);
    names.forEach(name=>{
      const row=rowByName(lifeTable,name);if(!row)return;
      let total=0;
      keys.forEach((key,i)=>{
        const baseLife=baseline.lifeZone.rows.get(name)?.values?.get(key)||0;
        const baseMonth=baseline.monthZone.rows.get(name)?.values?.get(key)||0;
        const current=currentMonth.rows.get(name)?.values?.get(key)||0;
        const value=Math.max(0,baseLife+current-baseMonth);
        total+=value;
        setNumericCell(row.cells[i+1],value);
      });
      setTotalCell(row.cells[row.cells.length-1],total);
    });
  }

  function monthRowTotal(snapshot){
    let total=0;snapshot?.rows?.forEach(row=>{total+=Number(row.total||0);});return total;
  }
  function updateLifetimeBadge(currentMonthZone){
    if(!baseline||baseline.lifeRows==null)return;
    const delta=monthRowTotal(currentMonthZone)-monthRowTotal(baseline.monthZone);
    const value=Math.max(0,baseline.lifeRows+delta);
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    const badge=[...(heading?.querySelectorAll('.badge')||[])].find(el=>text(el).includes('ข้อมูลสะสม'));
    if(badge)badge.textContent=`ข้อมูลสะสม ${value} รายการ`;
  }

  function syncZeroColumns(table){
    if(!table?.tHead?.rows?.[0])return;
    const showAll=!!document.querySelector('[data-v281-show-zero]:checked');
    const count=table.tHead.rows[0].cells.length;
    for(let index=1;index<count-1;index++){
      const hasValue=[...(table.tBodies?.[0]?.rows||[])].some(row=>num(row.cells?.[index]?.textContent)!==0);
      [...table.rows].forEach(row=>row.cells?.[index]?.classList.toggle('v281-hidden-zero-column',!showAll&&!hasValue));
    }
  }

  function decorateStatus(message){
    const stats=document.querySelector('.v278-admin-position-stats');if(!stats)return;
    let status=stats.querySelector('[data-v473-live-status]');
    if(!status){
      status=document.createElement('span');
      status.dataset.v473LiveStatus='';
      status.className='v473-live-status';
      const heading=stats.querySelector('.v278-stats-heading');
      heading?.appendChild(status);
    }
    status.textContent=message||'สถิติอัปเดตอัตโนมัติ';
  }

  function optimisticSync(){
    if(!target())return;
    if(!baseline||baseline.key!==monthKey()){
      baseline=null;
      if(!capture(true)){scheduleCapture();return;}
    }
    decorateStatus('กำลังอัปเดตสถิติ…');
    try{window.cnmiV278?.refreshAdminPositionStats?.();}catch(err){console.warn(VERSION,'refresh month stats',err);}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{window.cnmiV470?.enhance?.();}catch(_){}
      const list=cards();if(list.length<4)return;
      const currentMonthZone=zoneSnapshot(list[0]?.querySelector('.v278-zone-table'));
      const currentMonthDetail=detailSnapshot(list[1]?.querySelector('.v278-position-detail-table'));
      applyZoneDelta(list[2]?.querySelector('.v278-zone-table'),currentMonthZone);
      applyDetailDelta(list[3]?.querySelector('.v278-position-detail-table'),currentMonthDetail);
      updateLifetimeBadge(currentMonthZone);
      decorateStatus('อัปเดตแล้ว · ไม่ต้องรีเฟรช');
    }));
    scheduleVerify();
  }

  function scheduleSync(delay=40){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(optimisticSync,delay);
  }
  function scheduleCapture(delay=120){
    clearTimeout(captureTimer);
    captureTimer=setTimeout(()=>{
      if(!target())return;
      if(!capture(true))scheduleCapture(250);
    },delay);
  }
  function scheduleVerify(){
    clearTimeout(verifyTimer);
    verifyTimer=setTimeout(async()=>{
      if(!target()||verifying)return;
      verifying=true;
      decorateStatus('กำลังตรวจยอดกับฐานข้อมูล…');
      try{
        await window.cnmiV278?.loadLifetimePositions?.(true);
        setTimeout(()=>{
          try{window.cnmiV470?.enhance?.();}catch(_){}
          baseline=null;
          capture(true);
          decorateStatus('อัปเดตแล้ว · ไม่ต้องรีเฟรช');
        },180);
      }catch(err){
        console.warn(VERSION,'lifetime revalidate',err);
        decorateStatus('อัปเดตจากหน้าจอแล้ว');
      }finally{verifying=false;}
    },1800);
  }

  const style=document.createElement('style');
  style.id='v473-position-stats-live-sync-style';
  style.textContent=`
    .v473-live-status{display:inline-flex;align-items:center;margin-left:8px;padding:3px 7px;border:1px solid #bbf7d0;border-radius:999px;background:#f0fdf4;color:#166534;font-size:8px;font-weight:800;white-space:nowrap}
    @media(max-width:820px){.v473-live-status{font-size:7px;padding:3px 6px;margin-left:4px}}
  `;
  document.head.appendChild(style);

  const root=document.getElementById('pageContent')||document.body;
  new MutationObserver(mutations=>{
    if(!target())return;
    let saved=false,statsChanged=false;
    for(const m of mutations){
      if(m.type==='attributes'&&m.attributeName==='data-v290-save-state'){
        const cell=m.target;
        if(cell?.dataset?.v290SaveState==='saved'&&cell.matches?.('[data-v275-position-cell]'))saved=true;
      }
      if(m.type==='childList'&&[...(m.addedNodes||[])].some(node=>node?.nodeType===1&&(node.matches?.('.v278-admin-position-stats')||node.querySelector?.('.v278-admin-position-stats'))))statsChanged=true;
    }
    if(saved)scheduleSync(30);
    else if(statsChanged&&!baseline)scheduleCapture(140);
  }).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-v290-save-state']});

  document.addEventListener('change',event=>{
    if(!target())return;
    if(event.target?.matches?.('[data-v281-show-zero]'))setTimeout(()=>{
      const list=cards();
      syncZeroColumns(list[1]?.querySelector('.v278-position-detail-table'));
      syncZeroColumns(list[3]?.querySelector('.v278-position-detail-table'));
    },0);
  },true);

  document.addEventListener('DOMContentLoaded',()=>scheduleCapture(250),{once:true});
  setTimeout(()=>scheduleCapture(300),0);

  window.cnmiV473={sync:optimisticSync,capture:()=>capture(true),version:VERSION};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v473-position-stats-live-sync.js", error); }
;

/* Original source: patch-v474-clerk-rule-room-unification.js */
try {
/* CNMI Staff Planner V474
 * Clerk-aware daytime position rules + unified real-room display.
 *
 * Goals
 * 1) Treat staff_type = เคิก / Clerk / ธุรการ as Clerk consistently.
 * 2) Understand generic rules such as:
 *      - Clerk
 *      - MT / Clerk
 *      - MT / Clerk ที่ผ่านการฝึก
 *    without relying on a person's nickname.
 * 3) For Clerk positions that explicitly say "ผ่านการฝึก", require an explicit
 *    per-person eligibility record before auto/manual candidate filtering accepts them.
 * 4) Show the same 4 real-room groups on Position Management:
 *      Specimen & Issue / Blood Bank / Component Prep / Donor Room
 *    while keeping the stored legacy zone value unchanged for backward compatibility.
 *
 * No Supabase schema changes.
 */
(function(){
  'use strict';
  const VERSION='V474_CLERK_RULE_ROOM_UNIFICATION';
  if(window.__CNMI_V474_CLERK_RULE_ROOM_UNIFICATION__) return;
  window.__CNMI_V474_CLERK_RULE_ROOM_UNIFICATION__=true;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function norm(v){return txt(v).toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');}
  function currentPage(){return txt(S()?.page);}
  function isAdminMode(){
    try{return !!isAdmin();}catch(_){return txt(S()?.profile?.role).toLowerCase()==='admin';}
  }

  function staffType(staff){return txt(staff?.staff_type||staff?.type||staff?.staffType);}
  function isClerk(staff){
    const t=staffType(staff).toLowerCase();
    return t==='เคิก'||t==='clerk'||t.includes('clerk')||t.includes('ธุรการ')||t.includes('เสมียน');
  }
  function isMT(staff){
    const t=staffType(staff).toLowerCase();
    return t==='mt'||/(^|[^a-z])mt([^a-z]|$)/i.test(staffType(staff))||t.includes('นักเทคนิคการแพทย์');
  }

  function hasClerkToken(rule){
    const r=txt(rule).toLowerCase();
    return r.includes('clerk')||r.includes('เคิก')||r.includes('ธุรการ')||r.includes('เสมียน');
  }
  function hasMTToken(rule){
    const r=txt(rule);
    return /(^|[^A-Za-z])MT([^A-Za-z]|$)/i.test(r)||r.includes('นักเทคนิคการแพทย์');
  }

  const previousRuleOk=window.positionRuleOk||(typeof positionRuleOk==='function'?positionRuleOk:null);
  function ruleOk474(staff,rule){
    if(!staff) return false;
    const raw=txt(rule);
    if(!raw) return previousRuleOk?!!previousRuleOk(staff,rule):true;
    const mt=hasMTToken(raw);
    const clerk=hasClerkToken(raw);

    // Generic modern rules use profession, not nickname.
    if(mt&&clerk) return isMT(staff)||isClerk(staff);
    if(clerk&&!mt) return isClerk(staff);

    // Keep explicit MT-only semantics deterministic.
    if(mt&&(/เท่านั้น/.test(raw)||/only/i.test(raw))) return isMT(staff);

    // Preserve legacy special-name rules and any other established behavior.
    return previousRuleOk?!!previousRuleOk(staff,rule):true;
  }
  try{window.positionRuleOk=positionRuleOk=ruleOk474;}catch(_){window.positionRuleOk=ruleOk474;}

  function eligibilityKey(row){return txt(row?.eligibility_code||row?.code||row?.position_code);}
  function explicitEligibility(staff,key){
    const sid=txt(staff?.id); const k=txt(key);
    if(!sid||!k) return null;
    const rec=(S()?.positionEligibility||[]).find(x=>txt(x?.staff_id)===sid&&txt(x?.position_code)===k);
    return rec?!!rec.is_eligible:null;
  }

  const previousCandidateOk=window.positionCandidateOk||(typeof positionCandidateOk==='function'?positionCandidateOk:null);
  function candidateOk474(staff,row,date){
    if(previousCandidateOk&&!previousCandidateOk(staff,row,date)) return false;
    const rule=txt(row?.main_rule);
    // "ผ่านการฝึก" is meaningful for Clerk: do not assume every Clerk is trained.
    if(isClerk(staff)&&/ผ่านการฝึก/.test(rule)){
      const explicit=explicitEligibility(staff,eligibilityKey(row));
      return explicit===true;
    }
    return true;
  }
  try{window.positionCandidateOk=positionCandidateOk=candidateOk474;}catch(_){window.positionCandidateOk=candidateOk474;}

  const GROUPS=[
    {id:'specimen-issue',label:'Specimen & Issue',thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank',label:'Blood Bank',thai:'ตรวจ Donor / Immunohematology และเคสยาก'},
    {id:'component-prep',label:'Component Prep',thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room',label:'Donor Room',thai:'ห้องบริจาคโลหิต'},
    {id:'other',label:'อื่นๆ',thai:'ตำแหน่งอื่น'}
  ];
  function groupInfo(id){return GROUPS.find(g=>g.id===id)||GROUPS[GROUPS.length-1];}
  function roomGroup(code){
    const raw=txt(code),k=norm(raw);
    if(!raw) return 'other';
    if(/^dr-/i.test(raw)) return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2') return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4') return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport') return 'specimen-issue';
    return 'other';
  }

  // Publish a single authoritative helper for later patches/debugging.
  window.cnmiRoomGroupV474={version:VERSION,roomGroup,groups:GROUPS.slice(),isClerk,isMT,ruleOk:ruleOk474};
  try{if(window.cnmiV470) window.cnmiV470.roomGroup=roomGroup;}catch(_){ }
  try{if(window.cnmiV471) window.cnmiV471.roomGroup=roomGroup;}catch(_){ }

  function headerIndex(table,label){
    const row=table?.tHead?.rows?.[0]||table?.rows?.[0];
    if(!row) return -1;
    return Array.from(row.cells||[]).findIndex(c=>txt(c.textContent)===label||txt(c.textContent).includes(label));
  }
  function codeFromCell(cell){
    if(!cell) return '';
    return txt(cell.querySelector('b')?.textContent||cell.firstElementChild?.textContent||cell.textContent).split('\n')[0];
  }

  function decorateManagementTable(table){
    if(!table) return;
    const codeIdx=headerIndex(table,'ตำแหน่ง');
    let zoneIdx=headerIndex(table,'ห้อง/กลุ่มงาน');
    if(zoneIdx<0) zoneIdx=headerIndex(table,'โซน');
    const ruleIdx=headerIndex(table,'ผู้ปฏิบัติหลัก');
    if(codeIdx<0||zoneIdx<0||ruleIdx<0) return;

    const head=table.tHead?.rows?.[0]||table.rows?.[0];
    if(head?.cells?.[zoneIdx]) head.cells[zoneIdx].textContent='ห้อง/กลุ่มงาน';

    const bodies=table.tBodies?.length?Array.from(table.tBodies):[];
    bodies.forEach(body=>Array.from(body.rows||[]).forEach(row=>{
      const code=codeFromCell(row.cells?.[codeIdx]);
      const cell=row.cells?.[zoneIdx];
      if(!code||!cell) return;
      if(!cell.dataset.v474LegacyZone) cell.dataset.v474LegacyZone=txt(cell.textContent);
      const id=roomGroup(code),g=groupInfo(id);
      cell.dataset.v474Group=id;
      cell.innerHTML=`<span class="v474-room-pill" data-v474-group="${id}" title="${g.thai} · ค่าโซนเดิม: ${cell.dataset.v474LegacyZone||'-'}">${g.label}</span>`;
    }));
  }

  function decoratePositionManagement(){
    if(currentPage()!=='positionManagement'||!isAdminMode()) return;
    const root=document.getElementById('pageContent')||document;
    root.querySelectorAll('table').forEach(decorateManagementTable);

    // Replace/refresh the explanatory line so it matches the actual display.
    root.querySelectorAll('.v470-room-note').forEach(n=>{
      n.innerHTML='<b>ห้อง/กลุ่มงานที่ใช้:</b> Specimen &amp; Issue · Blood Bank · Component Prep · Donor Room <span class="muted">(แสดงตาม Code ตำแหน่ง โดยยังคงค่าโซนเดิมในฐานข้อมูลเพื่อไม่กระทบระบบเก่า)</span>';
    });
  }

  function decorateRuleHints(){
    if(currentPage()!=='positionManagement'||!isAdminMode()) return;
    const root=document.getElementById('pageContent')||document;
    const notes=root.querySelectorAll('.v474-rule-note');
    if(notes.length) return;
    const card=root.querySelector('.v224-slot-crud-card');
    if(!card) return;
    const note=document.createElement('div');
    note.className='notice soft-notice compact v474-rule-note';
    note.innerHTML='<b>การตีความผู้ปฏิบัติหลัก:</b> Clerk = เจ้าหน้าที่ประเภทเคิกทุกคน • MT / Clerk = ทำได้ทั้ง MT และเคิก • ถ้ามีคำว่า “ผ่านการฝึก” เคิกต้องถูกเปิดสิทธิ์เฉพาะบุคคลของตำแหน่งนั้นก่อน';
    const roomNote=card.querySelector('.v470-room-note');
    if(roomNote) roomNote.insertAdjacentElement('afterend',note);
    else card.querySelector('.table-wrap')?.insertAdjacentElement('beforebegin',note);
  }

  let queued=false;
  function queue(){
    if(queued) return; queued=true;
    requestAnimationFrame(()=>{queued=false;decoratePositionManagement();decorateRuleHints();});
  }
  document.addEventListener('DOMContentLoaded',queue,{once:true});
  document.addEventListener('click',()=>setTimeout(queue,0),true);
  document.addEventListener('change',()=>setTimeout(queue,0),true);
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(queue,250);
  setTimeout(queue,900);

  const style=document.createElement('style');
  style.id='cnmi-v474-clerk-room-unification-style';
  style.textContent=`
    .v474-room-pill{display:inline-flex;align-items:center;min-height:24px;padding:4px 9px;border-radius:999px;border:1px solid #d8e2ec;font-size:10px;font-weight:850;white-space:nowrap;color:#274157}
    .v474-room-pill[data-v474-group="specimen-issue"]{background:#e8f2ff;border-color:#bfdbfe}
    .v474-room-pill[data-v474-group="blood-bank"]{background:#fff3d9;border-color:#fde68a}
    .v474-room-pill[data-v474-group="component-prep"]{background:#f2eaff;border-color:#ddd6fe}
    .v474-room-pill[data-v474-group="donor-room"]{background:#e8f8ee;border-color:#bbf7d0}
    .v474-room-pill[data-v474-group="other"]{background:#f8fafc;border-color:#cbd5e1}
    .v474-rule-note{margin:6px 0!important;border-color:#bae6fd!important;background:#f0f9ff!important;color:#0c4a6e!important}
    @media(max-width:820px){.v474-room-pill{font-size:9px;padding:3px 7px}}
  `;
  document.head.appendChild(style);

  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v474-clerk-rule-room-unification.js", error); }
;

/* Original source: patch-v475-position-management-clean-hints.js */
try {
/* CNMI Staff Planner V475
 * Clean Position Management helper text.
 *
 * Keep only the useful room-group summary and remove the long technical/rule
 * explanation bars from the main screen. The actual "ผู้ปฏิบัติหลัก" values
 * remain visible in each position row.
 *
 * No Supabase/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V475_POSITION_MANAGEMENT_CLEAN_HINTS';
  if(window.__CNMI_V475_POSITION_MANAGEMENT_CLEAN_HINTS__) return;
  window.__CNMI_V475_POSITION_MANAGEMENT_CLEAN_HINTS__=true;

  const style=document.createElement('style');
  style.id='cnmi-v475-position-management-clean-hints-style';
  style.textContent=`
    /* V474's profession explanation is useful as implementation guidance,
       but it is too verbose for the daily Admin screen. */
    .v474-rule-note{display:none!important;}

    /* Keep one concise room-group line only; hide legacy/technical wording. */
    .v470-room-note .muted{display:none!important;}
    .v470-room-note{
      margin:4px 0!important;
      padding:5px 10px!important;
      min-height:0!important;
      font-size:11px!important;
      line-height:1.25!important;
      border-radius:9px!important;
      background:#f7fbff!important;
      border-color:#d9eaf7!important;
      color:#34536b!important;
    }
    .v470-room-note b{font-weight:800!important;}

    @media(max-width:820px){
      .v470-room-note{font-size:10px!important;padding:5px 8px!important;}
    }
  `;
  document.head.appendChild(style);

  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v475-position-management-clean-hints.js", error); }
;

/* Original source: patch-v476-position-stats-regular-start-gate.js */
try {
/* CNMI Staff Planner V476
   Position statistics respect daily_position_start_date.
   - Rows before a staff member's "เริ่มเป็นตัวจริง/จัดตำแหน่งกลางวัน" date remain historical/training data.
   - Those pre-start rows do NOT count in monthly or cumulative Admin position statistics.
   - From the effective date onward, counts begin normally.
   - Does not delete or modify daily_positions rows in Supabase.
*/
(function(){
  'use strict';
  const VERSION='V476_POSITION_STATS_REGULAR_START_GATE';
  if(window.__CNMI_V476_POSITION_STATS_REGULAR_START_GATE__) return;
  window.__CNMI_V476_POSITION_STATS_REGULAR_START_GATE__=true;

  let timer=null;
  let running=false;
  let lifetimeRowsCache=null;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function normDate(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function normId(v){return String(v==null?'':v);}
  function page(){return String(S()?.page||'');}
  function isAdminSafe(){try{return !!isAdmin();}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function text(el){return String(el?.textContent||'').trim();}
  function num(v){const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}
  function monthKey(){const k=String(S()?.positionMonthKey||S()?.monthKey||new Date().toISOString().slice(0,7));return /^\d{4}-\d{2}$/.test(k)?k:new Date().toISOString().slice(0,7);}
  function personById(id){return (S()?.staff||[]).find(p=>normId(p?.id)===normId(id))||null;}
  function staffName(p){return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function startDate(p){return normDate(p?.daily_position_start_date||'');}
  function countable(row){
    if(!row?.position_code) return false;
    const d=normDate(row?.work_date),p=personById(row?.staff_id),start=startDate(p);
    if(!d) return false;
    return !start || d>=start;
  }
  function activeStaff(){
    return (S()?.staff||[]).filter(p=>{
      const raw=Object.prototype.hasOwnProperty.call(p||{},'is_active')?p.is_active:p?.active;
      const inactive=raw===false||['false','0','no','off','ปิด'].includes(String(raw??'').trim().toLowerCase());
      return !inactive&&String(p?.staff_type||'').trim()!=='แพทย์'&&!p?.maternity_status;
    });
  }
  function personByRow(row){
    const label=text(row?.cells?.[0]);
    if(!label)return null;
    return activeStaff().find(p=>{
      const names=[p?.nickname,p?.full_name,p?.email].filter(Boolean).map(x=>String(x).trim());
      return names.some(n=>label===n||label.startsWith(n+' ')||label.includes(n));
    })||null;
  }
  function roomBucket(row){
    const code=String(row?.position_code||'').trim().toUpperCase();
    const zone=String(row?.zone||'').trim().toLowerCase();
    if(zone.includes('ออกหน่วย')||row?.is_outing===true)return 'outing';
    if(code.startsWith('DR-'))return 'donor';
    if(code.startsWith('BB-'))return 'bb';
    if(zone.includes('donor')||zone.includes('บริจาค'))return 'donor';
    return 'bb';
  }
  function rowsForPerson(rows,p){return (rows||[]).filter(r=>normId(r?.staff_id)===normId(p?.id)&&countable(r));}
  function setCell(cell,value){
    if(!cell)return;
    const v=Math.max(0,Math.round(Number(value)||0));
    if(text(cell)!==String(v))cell.textContent=String(v);
    if(cell.dataset?.v470Group){
      cell.classList.toggle('v470-never',v===0);
      cell.title=v===0?'ยังไม่เคยอยู่ตำแหน่งนี้':'';
    }
  }
  function setTotal(cell,value){
    if(!cell)return;
    const v=Math.max(0,Math.round(Number(value)||0));
    if(num(cell.textContent)!==v)cell.innerHTML=`<b>${v}</b>`;
  }
  function decoratePersonCell(row,p){
    const cell=row?.cells?.[0],start=startDate(p);if(!cell)return;
    let badge=cell.querySelector('.v476-start-badge');
    const key=monthKey();
    if(start&&`${key}-01`<start){
      if(!badge){badge=document.createElement('small');badge.className='v476-start-badge';cell.appendChild(badge);}
      const [y,m,d]=start.split('-');
      badge.textContent=`เริ่มนับ ${Number(d)}/${Number(m)}/${Number(y)+543}`;
      cell.title='ช่วงก่อนวันเริ่มเป็นตัวจริงเป็นช่วงฝึก/พี่เลี้ยง จึงไม่นับสถิติตำแหน่ง';
    }else if(badge){badge.remove();cell.removeAttribute('title');}
  }
  function updateZoneTable(table,rows){
    if(!table?.tHead?.rows?.[0])return;
    [...(table.tBodies?.[0]?.rows||[])].forEach(row=>{
      const p=personByRow(row);if(!p)return;
      const own=rowsForPerson(rows,p),counts={bb:0,donor:0,outing:0};
      own.forEach(r=>counts[roomBucket(r)]++);
      const head=[...table.tHead.rows[0].cells].map(c=>text(c).toLowerCase());
      const idxBB=head.findIndex(x=>x==='bb');
      const idxDonor=head.findIndex(x=>x==='donor');
      const idxOut=head.findIndex(x=>x.includes('ออกหน่วย'));
      if(idxBB>0)setCell(row.cells[idxBB],counts.bb);
      if(idxDonor>0)setCell(row.cells[idxDonor],counts.donor);
      if(idxOut>0)setCell(row.cells[idxOut],counts.outing);
      setTotal(row.cells[row.cells.length-1],own.length);
      decoratePersonCell(row,p);
    });
  }
  function updateDetailTable(table,rows){
    if(!table?.tHead?.rows?.[0])return;
    const headers=[...table.tHead.rows[0].cells];
    const codes=headers.slice(1,-1).map(c=>String(c.dataset?.v470Code||text(c)).trim());
    [...(table.tBodies?.[0]?.rows||[])].forEach(row=>{
      const p=personByRow(row);if(!p)return;
      const own=rowsForPerson(rows,p),counts=new Map();
      own.forEach(r=>{const c=String(r?.position_code||'').trim();counts.set(c,(counts.get(c)||0)+1);});
      let total=0;
      codes.forEach((code,i)=>{const v=counts.get(code)||0;total+=v;setCell(row.cells[i+1],v);});
      setTotal(row.cells[row.cells.length-1],total);
      decoratePersonCell(row,p);
    });
  }
  function updateBadge(rows){
    const heading=document.querySelector('.v278-admin-position-stats .v278-stats-heading');
    if(!heading)return;
    const badge=[...(heading.querySelectorAll('.badge')||[])].find(el=>text(el).includes('ข้อมูลสะสม'));
    if(!badge)return;
    const count=(rows||[]).filter(countable).length;
    badge.textContent=`ข้อมูลสะสม ${count.toLocaleString('th-TH')} รายการ`;
    badge.title='ไม่นับตำแหน่งที่เกิดก่อนวันเริ่มเป็นตัวจริง/จัดตำแหน่งกลางวันของเจ้าหน้าที่';
  }
  async function getLifetimeRows(){
    try{
      const rows=await window.cnmiV278?.loadLifetimePositions?.(false);
      if(Array.isArray(rows))lifetimeRowsCache=rows;
    }catch(e){console.warn(VERSION,'lifetime rows',e);}
    return lifetimeRowsCache||[];
  }
  async function apply(){
    if(running||page()!=='positionMonth'||!isAdminSafe())return;
    const stats=document.querySelector('.v278-admin-position-stats');if(!stats)return;
    running=true;
    try{
      const key=monthKey();
      let monthRows=(S()?.positions||[]).filter(r=>normDate(r?.work_date).startsWith(key));
      try{monthRows=window.cnmiV272?.operationalRows?.(monthRows)||monthRows;}catch(_){ }
      const lifeRows=await getLifetimeRows();
      const cards=[...stats.querySelectorAll('.v278-position-stat-card')];
      if(cards[0])updateZoneTable(cards[0].querySelector('.v278-zone-table'),monthRows);
      if(cards[1])updateDetailTable(cards[1].querySelector('.v278-position-detail-table'),monthRows);
      if(cards[2])updateZoneTable(cards[2].querySelector('.v278-zone-table'),lifeRows);
      if(cards[3])updateDetailTable(cards[3].querySelector('.v278-position-detail-table'),lifeRows);
      updateBadge(lifeRows);
      stats.dataset.v476Gated=key;
    }finally{running=false;}
  }
  function schedule(delay=60){clearTimeout(timer);timer=setTimeout(()=>apply(),delay);}

  function wrapApi(){
    const api=window.cnmiV278;if(!api||api.__v476Wrapped)return false;
    const oldRefresh=api.refreshAdminPositionStats;
    if(typeof oldRefresh==='function')api.refreshAdminPositionStats=function(){const r=oldRefresh.apply(this,arguments);schedule(40);return r;};
    const oldLoad=api.loadLifetimePositions;
    if(typeof oldLoad==='function')api.loadLifetimePositions=async function(){const r=await oldLoad.apply(this,arguments);if(Array.isArray(r))lifetimeRowsCache=r;schedule(30);return r;};
    api.__v476Wrapped=true;
    return true;
  }

  const style=document.createElement('style');
  style.id='v476-position-stats-regular-start-style';
  style.textContent=`
    .v476-start-badge{display:inline-flex;margin-left:5px;padding:2px 5px;border-radius:999px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:7px;font-weight:850;white-space:nowrap;vertical-align:middle}
    @media(max-width:820px){.v476-start-badge{font-size:6.5px;padding:2px 4px;margin-left:3px}}
  `;
  document.head.appendChild(style);

  const root=document.getElementById('pageContent')||document.body;
  new MutationObserver(muts=>{
    if(page()!=='positionMonth')return;
    const relevant=muts.some(m=>[...(m.addedNodes||[])].some(n=>n?.nodeType===1&&(n.matches?.('.v278-admin-position-stats')||n.querySelector?.('.v278-admin-position-stats'))));
    if(relevant)schedule(80);
  }).observe(root,{subtree:true,childList:true});

  document.addEventListener('change',e=>{
    if(e.target?.matches?.('[data-v275-position-select],#positionMonthInput'))schedule(120);
  },true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(80);});

  let tries=0;const hook=setInterval(()=>{tries++;if(wrapApi()||tries>40){clearInterval(hook);schedule(120);}},100);
  window.addEventListener('load',()=>{wrapApi();schedule(160);},{once:true});
  setTimeout(()=>{wrapApi();schedule(160);},0);

  window.cnmiV476={version:VERSION,apply,countable,startDate};
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v476-position-stats-regular-start-gate.js", error); }
;

/* Original source: patch-v477-dashboard-date-picker-calendar.js */
try {
/* CNMI Staff Planner V477
 * Reliable dashboard date picker.
 * - Fixes the "เลือกวันที่" control on Dashboard when the transparent native
 *   <input type=date> does not open in some Chrome/PWA/device combinations.
 * - Uses a small in-app calendar, while keeping V443 previous/next/today logic.
 * - Display/navigation only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V477_DASHBOARD_DATE_PICKER_CALENDAR';
  if(window.__CNMI_V477_DASHBOARD_DATE_PICKER_CALENDAR__)return;
  window.__CNMI_V477_DASHBOARD_DATE_PICKER_CALENDAR__=true;

  const pad=n=>String(n).padStart(2,'0');
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function api(){return window.cnmiDashboardDateV443||null;}
  function validDate(v){
    const s=String(v||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
    const [y,m,d]=s.split('-').map(Number),dt=new Date(y,m-1,d);
    return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?s:'';
  }
  function dateParts(s){const [y,m,d]=String(s).split('-').map(Number);return {y,m,d};}
  function ymd(y,m,d){return `${y}-${pad(m)}-${pad(d)}`;}
  function today(){
    try{return validDate(api()?.actualToday?.())||'';}catch(_){return '';}
  }
  function selected(){
    try{return validDate(api()?.selectedDate?.())||today();}catch(_){return today();}
  }
  function range(){
    try{
      const r=api()?.range?.()||{};
      return {min:validDate(r.min)||'1900-01-01',max:validDate(r.max)||'2999-12-31'};
    }catch(_){return {min:'1900-01-01',max:'2999-12-31'};}
  }
  function monthLabel(y,m){
    try{return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return `${m}/${y}`;}
  }
  function inRange(s){const r=range();return s>=r.min&&s<=r.max;}
  function monthHasSelectable(y,m){
    const first=ymd(y,m,1),last=ymd(y,m,new Date(y,m,0).getDate()),r=range();
    return last>=r.min&&first<=r.max;
  }
  function shiftMonth(y,m,delta){
    const dt=new Date(y,m-1+delta,1);
    return {y:dt.getFullYear(),m:dt.getMonth()+1};
  }

  let overlay=null;
  let view=null;
  function close(){
    if(overlay){overlay.remove();overlay=null;view=null;}
  }
  function dayButton(date,day,isSelected,isToday){
    const disabled=!inRange(date);
    const cls=['v477-day'];
    if(isSelected)cls.push('is-selected');
    if(isToday)cls.push('is-today');
    return `<button type="button" class="${cls.join(' ')}" data-v477-day="${esc(date)}" ${disabled?'disabled':''}>${day}</button>`;
  }
  function renderCalendar(){
    if(!overlay||!view)return;
    const {y,m}=view,sel=selected(),now=today(),firstDow=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate();
    const prev=shiftMonth(y,m,-1),next=shiftMonth(y,m,1);
    let cells='';
    for(let i=0;i<firstDow;i++)cells+='<span class="v477-day-spacer"></span>';
    for(let d=1;d<=days;d++){
      const date=ymd(y,m,d);
      cells+=dayButton(date,d,date===sel,date===now);
    }
    const body=overlay.querySelector('[data-v477-calendar-body]');
    if(!body)return;
    body.innerHTML=`
      <div class="v477-calendar-head">
        <button type="button" class="v477-month-step" data-v477-prev-month ${monthHasSelectable(prev.y,prev.m)?'':'disabled'} aria-label="เดือนก่อนหน้า">‹</button>
        <strong>${esc(monthLabel(y,m))}</strong>
        <button type="button" class="v477-month-step" data-v477-next-month ${monthHasSelectable(next.y,next.m)?'':'disabled'} aria-label="เดือนถัดไป">›</button>
      </div>
      <div class="v477-weekdays"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>
      <div class="v477-days">${cells}</div>
      <div class="v477-calendar-actions">
        <button type="button" class="v477-action" data-v477-close>ยกเลิก</button>
        <button type="button" class="v477-action primary" data-v477-today ${inRange(now)?'':'disabled'}>วันนี้</button>
      </div>`;
  }
  function open(){
    close();
    const sel=selected();
    if(!sel)return;
    const p=dateParts(sel);view={y:p.y,m:p.m};
    overlay=document.createElement('div');
    overlay.className='v477-date-overlay';
    overlay.setAttribute('data-v477-date-overlay','');
    overlay.innerHTML=`<div class="v477-date-dialog" role="dialog" aria-modal="true" aria-label="เลือกวันที่สำหรับภาพรวม"><div data-v477-calendar-body></div></div>`;
    document.body.appendChild(overlay);
    renderCalendar();
    try{overlay.querySelector('.v477-date-dialog')?.focus?.();}catch(_){ }
  }
  function choose(date){
    const d=validDate(date);if(!d||!inRange(d))return;
    close();
    try{api()?.setSelectedDate?.(d);}catch(err){console.warn('[V477] set selected date',err);}
  }

  document.addEventListener('click',function(e){
    const picker=e.target?.closest?.('.v443-date-picker');
    if(picker){
      e.preventDefault();
      e.stopPropagation();
      open();
      return;
    }
    if(!overlay)return;
    const day=e.target?.closest?.('[data-v477-day]');
    if(day){e.preventDefault();choose(day.getAttribute('data-v477-day'));return;}
    const prev=e.target?.closest?.('[data-v477-prev-month]');
    if(prev&&!prev.disabled){e.preventDefault();view=shiftMonth(view.y,view.m,-1);renderCalendar();return;}
    const next=e.target?.closest?.('[data-v477-next-month]');
    if(next&&!next.disabled){e.preventDefault();view=shiftMonth(view.y,view.m,1);renderCalendar();return;}
    const now=e.target?.closest?.('[data-v477-today]');
    if(now&&!now.disabled){e.preventDefault();choose(today());return;}
    if(e.target?.closest?.('[data-v477-close]')){e.preventDefault();close();return;}
    if(e.target===overlay){e.preventDefault();close();}
  },true);

  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay)close();},true);

  const style=document.createElement('style');
  style.id='cnmi-v477-dashboard-date-picker-calendar';
  style.textContent=`
    .v443-date-picker input[data-v443-date-input]{pointer-events:none!important}
    .v477-date-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(25,47,66,.42);backdrop-filter:blur(2px)}
    .v477-date-dialog{width:min(390px,calc(100vw - 28px));background:#fff;border:1px solid #dbe7f0;border-radius:20px;box-shadow:0 22px 70px rgba(15,45,70,.25);padding:16px;color:#263d53}
    .v477-calendar-head{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;margin-bottom:12px}.v477-calendar-head strong{text-align:center;font-size:18px;font-weight:900}
    .v477-month-step{height:40px;border:1px solid #d8e6ef;border-radius:12px;background:#f7fbfe;color:#276f9d;font:inherit;font-size:25px;font-weight:900;cursor:pointer}.v477-month-step:disabled{opacity:.32;cursor:default}
    .v477-weekdays,.v477-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.v477-weekdays{margin-bottom:6px;color:#7a8ea0;font-size:11px;font-weight:850;text-align:center}.v477-weekdays span{padding:4px 0}
    .v477-day,.v477-day-spacer{aspect-ratio:1/1;min-height:36px}.v477-day{border:1px solid #e1eaf1;border-radius:11px;background:#fff;color:#2b4054;font:inherit;font-size:13px;font-weight:800;cursor:pointer}.v477-day:hover{background:#eef8fe;border-color:#b7d9ed}.v477-day:disabled{opacity:.28;cursor:default;background:#f6f8fa}.v477-day.is-today{box-shadow:inset 0 0 0 2px #b8ddf2}.v477-day.is-selected{background:#2788c4;color:#fff;border-color:#2788c4;box-shadow:none}
    .v477-calendar-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #edf2f6}.v477-action{height:38px;padding:0 16px;border:1px solid #d8e6ef;border-radius:11px;background:#fff;color:#47667f;font:inherit;font-size:12px;font-weight:850;cursor:pointer}.v477-action.primary{background:#e9f6fd;border-color:#bee0f2;color:#1676ac}.v477-action:disabled{opacity:.35;cursor:default}
    @media(max-width:520px){.v477-date-overlay{align-items:flex-end;padding:0}.v477-date-dialog{width:100%;max-width:none;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));}.v477-day,.v477-day-spacer{min-height:42px}.v477-calendar-head strong{font-size:19px}}
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();

} catch (error) { console.error("[v569] patch-v477-dashboard-date-picker-calendar.js", error); }
;

/* Original source: patch-v478-donor-helper-external-guard-ot.js */
try {
/* CNMI Staff Planner V478
   - External helper page is for non-CNMI staff only (DB guard is in SQL_V478...)
   - Admin can mark each external helper as self-claim or CNMI-claim OT.
   - CNMI claim supports manual rate, hours, claim month independent from work date,
     and bulk retrospective claims across multiple work months.
*/
(function(){
  'use strict';
  const VERSION='V478_DONOR_HELPER_EXTERNAL_GUARD_OT';
  const PAGE='donorHelpers';
  if(window.__CNMI_V478_DONOR_HELPER_EXTERNAL_GUARD_OT__)return;
  window.__CNMI_V478_DONOR_HELPER_EXTERNAL_GUARD_OT__=true;

  let otRows=[];
  let otLoaded=false;
  let otLoading=false;
  let selectedIds=new Set();
  let filterMode='all';
  let filterSearch='';
  let filterClaimMonth=currentMonth();

  function S(){try{return state;}catch(_){return window.state||{};}}
  function DB(){try{return sb;}catch(_){return window.sb||null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function toast(msg,tone){try{return showToast(msg,tone?{tone}:undefined);}catch(_){window.alert(msg);}}
  function currentMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function isoMonth(v){const s=String(v||'').slice(0,7);return /^\d{4}-\d{2}$/.test(s)?s:'';}
  function fmtMonth(v){const s=isoMonth(v);if(!s)return'-';const [y,m]=s.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'short',year:'numeric'});}
  function fmtDate(v){const s=String(v||'').slice(0,10);if(!s)return'-';try{if(typeof formatThaiDate==='function')return formatThaiDate(s);}catch(_){}const d=new Date(`${s}T12:00:00`);return Number.isNaN(d.getTime())?s:d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
  function slotLabel(r){return String(r?.slot_type)==='clerk'?'Clerk':`คนเจาะ ${Number(r?.slot_no||1)}`;}
  function money(v){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}):'0';}
  function statusText(v){return ({pending:'รอเบิก',submitted:'ส่งเบิกแล้ว',paid:'จ่ายแล้ว'})[String(v||'')]||'-';}
  function modeText(v){return ({cnmi:'หน่วยเบิกให้',self:'เบิกเอง'})[String(v||'')]||'ยังไม่กำหนด';}
  function modeClass(v){return v==='cnmi'?'blue':v==='self'?'green':'black';}
  function cssEsc(v){try{return CSS.escape(String(v||''));}catch(_){return String(v||'').replace(/[^a-zA-Z0-9_-]/g,'\\$&');}}
  function eligible(r){return !['cancelled','no_show'].includes(String(r?.status||''));}
  function claimMonthOf(r){return isoMonth(r?.ot_claim_month);}

  function ensureStyle(){
    if(document.getElementById('v478HelperOtStyle'))return;
    const st=document.createElement('style');st.id='v478HelperOtStyle';st.textContent=`
      .v478-helper-ot-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px}
      .v478-helper-ot-summary h3{margin:0 0 4px}.v478-helper-ot-summary p{margin:0;color:var(--muted,#64748b)}
      .v478-helper-ot-badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .v478-ot-modal{max-width:1100px}.v478-ot-toolbar{display:grid;grid-template-columns:1fr 180px 160px auto;gap:10px;align-items:end;margin:12px 0}
      .v478-ot-list{max-height:56vh;overflow:auto;border:1px solid #dbe6ef;border-radius:14px}
      .v478-ot-row{display:grid;grid-template-columns:38px 110px minmax(180px,1.4fr) 110px 145px minmax(180px,1fr);gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #e7eef5}
      .v478-ot-row:last-child{border-bottom:0}.v478-ot-row small{display:block;color:#718096;margin-top:2px}.v478-ot-row .v478-amount{text-align:right;font-weight:700}
      .v478-ot-row.disabled{opacity:.55}.v478-ot-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;justify-content:flex-end}
      .v478-ot-config-note{background:#f6f9fc;border:1px solid #dce8f2;border-radius:12px;padding:10px 12px;margin-bottom:10px}
      .v478-ot-inline-btn{margin-left:6px}
      @media(max-width:760px){.v478-ot-toolbar{grid-template-columns:1fr 1fr}.v478-ot-toolbar .wide-mobile{grid-column:1/-1}.v478-ot-row{grid-template-columns:34px 1fr 100px}.v478-ot-row>div:nth-child(4),.v478-ot-row>div:nth-child(6){grid-column:2/-1}.v478-ot-row>div:nth-child(5){grid-column:2}.v478-ot-list{max-height:62vh}}
    `;document.head.appendChild(st);
  }

  function summaryStats(){
    const active=otRows.filter(eligible);
    const unset=active.filter(r=>!r.ot_payment_mode).length;
    const self=active.filter(r=>r.ot_payment_mode==='self').length;
    const cnmiMonth=active.filter(r=>r.ot_payment_mode==='cnmi'&&claimMonthOf(r)===filterClaimMonth);
    const amount=cnmiMonth.reduce((s,r)=>s+Number(r.ot_amount||0),0);
    return {unset,self,cnmiCount:cnmiMonth.length,amount};
  }

  function renderSummary(){
    if(S()?.page!==PAGE||!admin())return;
    ensureStyle();
    const root=document.querySelector('.donor-helper-page-v327');if(!root)return;
    let node=document.getElementById('v478ExternalHelperOtSummary');
    if(!node){node=document.createElement('div');node.id='v478ExternalHelperOtSummary';node.className='card v478-helper-ot-summary';const toolbar=root.querySelector('.donor-helper-toolbar');if(toolbar?.nextSibling)root.insertBefore(node,toolbar.nextSibling);else root.appendChild(node);}
    if(otLoading&&!otLoaded){node.innerHTML='<div><h3>OT คนนอกหน่วย</h3><p>กำลังโหลด…</p></div>';return;}
    const x=summaryStats();
    node.innerHTML=`<div><h3>OT คนนอกหน่วย</h3><p>กำหนดเฉพาะรายที่หน่วยต้องเบิกให้ • เบิกย้อนหลังได้โดยเลือกเดือนเบิกแยกจากวันที่ทำงาน</p></div><div class="v478-helper-ot-badges"><span class="badge black">ยังไม่กำหนด ${x.unset}</span><span class="badge green">เบิกเอง ${x.self}</span><span class="badge blue">${esc(fmtMonth(filterClaimMonth))} ${x.cnmiCount} รายการ • ${esc(money(x.amount))} บ.</span><button class="primary-btn" type="button" data-v478-open-ot>จัดการ OT</button></div>`;
    decorateCurrentCards();
  }

  async function loadOt(force=false){
    if(!admin()||S()?.page!==PAGE)return;
    if(otLoading)return;
    if(otLoaded&&!force){renderSummary();return;}
    const db=DB();if(!db?.rpc)return;
    otLoading=true;renderSummary();
    try{
      const res=await db.rpc('get_donor_helper_external_ot_admin_v478',{p_from:null,p_to:null});
      if(res?.error)throw res.error;
      const data=typeof res.data==='string'?JSON.parse(res.data):res.data;
      otRows=Array.isArray(data?.rows)?data.rows:[];otLoaded=true;
    }catch(e){console.warn(`[${VERSION}] load`,e);toast(/does not exist|schema cache/i.test(String(e?.message||e))?'กรุณา Run SQL_V478_DONOR_HELPER_EXTERNAL_GUARD_OT.sql ก่อน':'โหลด OT คนนอกหน่วยไม่สำเร็จ','error');}
    finally{otLoading=false;renderSummary();}
  }

  function visibleRows(){
    const q=filterSearch.trim().toLocaleLowerCase('th-TH');
    return otRows.filter(r=>{
      if(!eligible(r))return false;
      if(filterMode==='unset'&&r.ot_payment_mode)return false;
      if(filterMode==='cnmi'&&r.ot_payment_mode!=='cnmi')return false;
      if(filterMode==='self'&&r.ot_payment_mode!=='self')return false;
      if(filterMode==='claimmonth'&&!(r.ot_payment_mode==='cnmi'&&claimMonthOf(r)===filterClaimMonth))return false;
      if(q&&!`${r.helper_name||''} ${r.unit_name||''} ${r.phone||''}`.toLocaleLowerCase('th-TH').includes(q))return false;
      return true;
    });
  }

  function rowHtml(r){
    const mode=String(r.ot_payment_mode||'');const cnmi=mode==='cnmi';
    return `<div class="v478-ot-row${eligible(r)?'':' disabled'}" data-v478-row="${esc(r.id)}"><div><input type="checkbox" data-v478-check="${esc(r.id)}" ${selectedIds.has(String(r.id))?'checked':''} ${eligible(r)?'':'disabled'}></div><div><b>${esc(fmtDate(r.work_date))}</b><small>${esc(slotLabel(r))}</small></div><div><b>${esc(r.helper_name||'-')}</b><small>${esc(r.unit_name||'-')}${r.phone?` • ${esc(r.phone)}`:''}</small></div><div><span class="badge ${modeClass(mode)}">${esc(modeText(mode))}</span></div><div>${cnmi?`<b>${esc(money(r.ot_rate))} บ./ชม.</b><small>${esc(money(r.ot_hours))} ชม. • ${esc(fmtMonth(r.ot_claim_month))} • ${esc(statusText(r.ot_claim_status))}</small>`:'<span class="muted">—</span>'}</div><div class="v478-amount">${cnmi?`${esc(money(r.ot_amount))} บ.`:'—'}<small>${r.ot_note?esc(r.ot_note):''}</small></div></div>`;
  }

  function modalHtml(){
    const rows=visibleRows();
    return `<div class="v478-ot-modal"><h2>จัดการ OT คนนอกหน่วย</h2><div class="v478-ot-config-note">วันทำงานยังคงเป็นวันที่มาช่วยจริง ส่วน <b>เดือนเบิก</b> เลือกแยกได้ จึงรวมงานย้อนหลังหลายเดือนไปเบิกในเดือนเดียวกันได้</div><div class="v478-ot-toolbar"><label class="wide-mobile">ค้นหาชื่อ/หน่วยงาน<input data-v478-search value="${esc(filterSearch)}" placeholder="พิมพ์ชื่อหรือหน่วยงาน"></label><label>แสดง<select data-v478-mode><option value="all"${filterMode==='all'?' selected':''}>ทั้งหมด</option><option value="unset"${filterMode==='unset'?' selected':''}>ยังไม่กำหนด</option><option value="cnmi"${filterMode==='cnmi'?' selected':''}>หน่วยเบิกให้</option><option value="self"${filterMode==='self'?' selected':''}>เบิกเอง</option><option value="claimmonth"${filterMode==='claimmonth'?' selected':''}>เดือนเบิกที่เลือก</option></select></label><label>เดือนเบิก<input type="month" data-v478-claim-filter value="${esc(filterClaimMonth)}"></label><button class="ghost-btn" type="button" data-v478-refresh-ot>รีเฟรช</button></div><div class="v478-ot-list">${rows.length?rows.map(rowHtml).join(''):'<div style="padding:24px;text-align:center;color:#718096">ไม่พบรายการตามตัวกรอง</div>'}</div><div class="v478-ot-actions"><button class="ghost-btn" type="button" data-v478-select-visible>เลือกทั้งหมดที่เห็น</button><button class="primary-btn" type="button" data-v478-configure ${selectedIds.size?'':'disabled'}>กำหนด OT ที่เลือก (${selectedIds.size})</button><button class="ghost-btn" type="button" data-v478-close>ปิด</button></div></div>`;
  }

  function showManage(){
    if(!admin())return;
    selectedIds.clear();
    try{showModal(modalHtml(),{large:true});}catch(_){return toast('เปิดหน้าจัดการ OT ไม่สำเร็จ','error');}
  }
  function rerenderModal(){const body=document.querySelector('#modalBody');if(body&&document.querySelector('[data-v478-mode]'))body.innerHTML=modalHtml();}

  function selectedRows(){return otRows.filter(r=>selectedIds.has(String(r.id)));}
  function configureHtml(ids){
    const rows=selectedRows();const first=rows[0]||{};const sameMode=rows.every(r=>String(r.ot_payment_mode||'')===String(first.ot_payment_mode||''));const mode=sameMode?String(first.ot_payment_mode||'cnmi'):'cnmi';
    const claim=claimMonthOf(first)||filterClaimMonth||currentMonth();const rate=Number(first.ot_rate||0)||'';const hrs=Number(first.ot_hours||8)||8;const stat=String(first.ot_claim_status||'pending');
    return `<div class="v478-ot-modal"><h2>กำหนด OT ${rows.length} รายการ</h2><p class="muted">${esc(rows.slice(0,4).map(r=>`${fmtDate(r.work_date)} ${r.helper_name}`).join(' • '))}${rows.length>4?` • +${rows.length-4} รายการ`:''}</p><form id="v478OtConfigForm" class="form-grid"><input type="hidden" name="ids" value="${esc(ids.join(','))}"><label class="wide">วิธีเบิก<select name="mode" data-v478-config-mode required><option value="cnmi"${mode==='cnmi'?' selected':''}>หน่วยเวชศาสตร์บริการโลหิตเบิกให้</option><option value="self"${mode==='self'?' selected':''}>ผู้มาช่วยเบิกเอง</option><option value="unset">ยังไม่กำหนด</option></select></label><label data-v478-cnmi-field>เรท OT (บาท/ชม.)<input name="rate" type="number" min="0.01" step="0.01" value="${esc(rate)}" placeholder="ใส่เรทเอง"></label><label data-v478-cnmi-field>ชั่วโมงต่อรายการ<input name="hours" type="number" min="0.25" max="24" step="0.25" value="${esc(hrs)}"></label><label data-v478-cnmi-field>นำไปเบิกเดือน<input name="claim_month" type="month" value="${esc(claim)}"></label><label data-v478-cnmi-field>สถานะ<select name="claim_status"><option value="pending"${stat==='pending'?' selected':''}>รอเบิก</option><option value="submitted"${stat==='submitted'?' selected':''}>ส่งเบิกแล้ว</option><option value="paid"${stat==='paid'?' selected':''}>จ่ายแล้ว</option></select></label><label class="wide">หมายเหตุ<input name="note" value="${esc(first.ot_note||'')}" placeholder="เช่น เบิกย้อนหลัง ก.ค.–ส.ค. ในรอบ ก.ย."></label><div class="wide v478-ot-actions"><button class="ghost-btn" type="button" data-v478-back>กลับ</button><button class="primary-btn" type="submit">บันทึก</button></div></form></div>`;
  }
  function toggleCnmiFields(){const mode=document.querySelector('[data-v478-config-mode]')?.value;document.querySelectorAll('[data-v478-cnmi-field]').forEach(el=>{el.style.display=mode==='cnmi'?'':'none';});}

  async function saveConfig(form){
    const fd=new FormData(form);const ids=String(fd.get('ids')||'').split(',').filter(Boolean);const mode=String(fd.get('mode')||'unset');const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
    try{
      const claim=String(fd.get('claim_month')||'');
      const args={p_signup_ids:ids,p_payment_mode:mode,p_rate:mode==='cnmi'?Number(fd.get('rate')):null,p_hours:mode==='cnmi'?Number(fd.get('hours')):null,p_claim_month:mode==='cnmi'&&claim?`${claim}-01`:null,p_claim_status:mode==='cnmi'?String(fd.get('claim_status')||'pending'):null,p_note:String(fd.get('note')||'').trim()||null};
      const res=await DB().rpc('admin_set_donor_helper_ot_v478',args);if(res?.error)throw res.error;
      await loadOt(true);selectedIds.clear();toast(`บันทึก OT ${Number(res.data||ids.length)} รายการแล้ว`);showManage();
    }catch(e){toast(String(e?.message||e).replace(/^.*?:\s*/,''),'error');if(button)button.disabled=false;}
  }

  function decorateCurrentCards(){
    if(!admin()||!otLoaded)return;
    otRows.forEach(r=>{
      const id=String(r.id||'');if(!id)return;
      const edit=document.querySelector(`[data-v327-edit="${cssEsc(id)}"]`);if(!edit)return;
      const parent=edit.parentElement;if(!parent||parent.querySelector(`[data-v478-ot-one="${cssEsc(id)}"]`))return;
      const btn=document.createElement('button');btn.type='button';btn.className='tiny-btn v478-ot-inline-btn';btn.setAttribute('data-v478-ot-one',id);btn.textContent=r.ot_payment_mode==='cnmi'?`OT ${money(r.ot_amount)} บ.`:r.ot_payment_mode==='self'?'OT เบิกเอง':'OT';parent.appendChild(btn);
    });
  }

  const prevRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  const wrapped=function(){const out=prevRender?prevRender.apply(this,arguments):undefined;setTimeout(()=>{if(S()?.page===PAGE&&admin()){renderSummary();loadOt(false);}},0);return out;};
  try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}

  document.addEventListener('click',e=>{
    const t=e.target?.closest?.('[data-v478-open-ot],[data-v478-refresh-ot],[data-v478-select-visible],[data-v478-configure],[data-v478-close],[data-v478-back],[data-v478-ot-one]');if(!t)return;
    e.preventDefault();e.stopPropagation();
    if(t.hasAttribute('data-v478-open-ot'))return showManage();
    if(t.hasAttribute('data-v478-refresh-ot'))return void loadOt(true).then(()=>rerenderModal());
    if(t.hasAttribute('data-v478-select-visible')){visibleRows().forEach(r=>selectedIds.add(String(r.id)));return rerenderModal();}
    if(t.hasAttribute('data-v478-configure')){const ids=[...selectedIds];if(!ids.length)return;try{showModal(configureHtml(ids),{large:true});setTimeout(toggleCnmiFields,0);}catch(_){toast('เปิดแบบฟอร์มไม่สำเร็จ','error');}return;}
    if(t.hasAttribute('data-v478-ot-one')){selectedIds=new Set([String(t.getAttribute('data-v478-ot-one'))]);try{showModal(configureHtml([...selectedIds]),{large:true});setTimeout(toggleCnmiFields,0);}catch(_){toast('เปิดแบบฟอร์มไม่สำเร็จ','error');}return;}
    if(t.hasAttribute('data-v478-back'))return showManage();
    if(t.hasAttribute('data-v478-close')){try{closeModal();}catch(_){}return;}
  },true);

  document.addEventListener('change',e=>{
    const t=e.target;
    if(t?.matches?.('[data-v478-check]')){const id=String(t.getAttribute('data-v478-check'));if(t.checked)selectedIds.add(id);else selectedIds.delete(id);return rerenderModal();}
    if(t?.matches?.('[data-v478-mode]')){filterMode=t.value||'all';selectedIds.clear();return rerenderModal();}
    if(t?.matches?.('[data-v478-claim-filter]')){filterClaimMonth=t.value||currentMonth();selectedIds.clear();renderSummary();return rerenderModal();}
    if(t?.matches?.('[data-v478-config-mode]'))return toggleCnmiFields();
  },true);
  document.addEventListener('input',e=>{const t=e.target;if(t?.matches?.('[data-v478-search]')){filterSearch=t.value||'';selectedIds.clear();clearTimeout(window.__v478SearchTimer);window.__v478SearchTimer=setTimeout(()=>{rerenderModal();const n=document.querySelector('[data-v478-search]');if(n){n.focus();try{n.setSelectionRange(n.value.length,n.value.length);}catch(_){}}},180);}},true);
  document.addEventListener('submit',e=>{if(e.target?.id!=='v478OtConfigForm')return;e.preventDefault();e.stopPropagation();void saveConfig(e.target);},true);

  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v478-donor-helper-external-guard-ot.js", error); }
;

/* Original source: patch-v479-security-ot-rate-position-user-ui.js */
try {
/* CNMI Staff Planner V479
 * 1) Admin OT edit: show and edit the explicit OT rate (MT / Clerk-เคิก) already stored
 *    in the existing [OT_RATE_TYPE=...] note token used by V357. No OT schema change.
 * 2) Dashboard/daytime position metadata: always prefer the exact Slot Master currently
 *    configured in Admin > จัดการตำแหน่ง, including OUTING sets selected by date/count.
 * 3) Admin > ผู้ใช้งานและสิทธิ์: move "เพิ่มผู้ใช้งานใหม่" out of the narrow side panel;
 *    desktop uses a full-width structured form, mobile uses stacked section cards.
 */
(function(){
  'use strict';
  const VERSION='V479_SECURITY_OT_RATE_POSITION_USER_UI';
  if(window.__CNMI_V479_SECURITY_OT_RATE_POSITION_USER_UI__) return;
  window.__CNMI_V479_SECURITY_OT_RATE_POSITION_USER_UI__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return txt(S()?.profile?.role).toLowerCase()==='admin';}}
  function assignGlobal(name,value){try{window[name]=value;}catch(_){}try{(0,eval)(`${name}=window[${JSON.stringify(name)}]`);}catch(_){}}
  function normDate(v){
    try{if(typeof normalizeDateKey==='function')return txt(normalizeDateKey(v)).slice(0,10);}catch(_){}
    return txt(v).slice(0,10);
  }
  function key(v){return txt(v).toLowerCase().replace(/\s+/g,'').replace(/^outing:/,'');}
  function codeOf(row){return txt(row?.position_code||row?.code||row?.eligibility_code).replace(/^OUTING:/i,'');}
  function useful(v){const s=txt(v);return !!s&&!['-','--','—'].includes(s)&&!/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);}

  /* ------------------------------------------------------------------
     A. Admin OT edit — explicit rate selector
     V357 already stores the chosen rate in note as [OT_RATE_TYPE=MT|CLERK].
     Reuse that exact mechanism so normalization/export remains one source.
     ------------------------------------------------------------------ */
  const RATE_RE=/\[OT_RATE_TYPE=(MT|CLERK)\]/i;
  function rateFromHtmlForm(form){
    const raw=`${form?.querySelector?.('[name="note"]')?.value||''}`;
    const m=raw.match(RATE_RE);
    return m&&String(m[1]).toUpperCase()==='CLERK'?'CLERK':'MT';
  }
  function stripRateToken(value){
    return txt(String(value||'').replace(RATE_RE,'').replace(/^\s*\|\s*/,'').replace(/\s*\|\s*$/,''));
  }
  function injectAdminOtRate(html){
    if(!admin()||!String(html||'').includes('id="otEditFormV191"')) return html;
    try{
      const t=document.createElement('template');t.innerHTML=String(html||'');
      const form=t.content.querySelector('#otEditFormV191');
      if(!form||form.querySelector('[name="rate_type_v479"]')) return t.innerHTML;
      const note=form.querySelector('textarea[name="note"]');
      const selected=rateFromHtmlForm(form);
      if(note) note.value=stripRateToken(note.value);
      const label=document.createElement('label');
      label.className='v479-ot-rate-field';
      label.innerHTML=`เรทที่จะเบิก
        <select name="rate_type_v479" required>
          <option value="MT" ${selected==='MT'?'selected':''}>MT — 130 บาท/ชม. • นักขัตฤกษ์ 160</option>
          <option value="CLERK" ${selected==='CLERK'?'selected':''}>Clerk/เคิก — 90 บาท/ชม. • นักขัตฤกษ์ 120</option>
        </select>
        <span class="hint">Admin แก้ตรงนี้ได้ หากผู้ขอเลือกเรทผิด</span>`;
      const hours=form.querySelector('[name="requested_hours"]')?.closest('label');
      if(hours) hours.insertAdjacentElement('afterend',label); else form.appendChild(label);
      return t.innerHTML;
    }catch(err){console.warn(`[${VERSION}] inject OT rate`,err);return html;}
  }
  function stampOtRateBeforeSave(form){
    if(!form||form.id!=='otEditFormV191')return;
    const select=form.querySelector('[name="rate_type_v479"]');
    const note=form.querySelector('textarea[name="note"]');
    if(!select||!note)return;
    const rate=String(select.value||'MT').toUpperCase()==='CLERK'?'CLERK':'MT';
    const clean=stripRateToken(note.value);
    note.value=`[OT_RATE_TYPE=${rate}]${clean?` | ${clean}`:''}`;
  }
  const prevShowModal=window.showModal||(typeof showModal==='function'?showModal:null);
  if(typeof prevShowModal==='function'&&!prevShowModal.__v479OtRateWrapped){
    const wrapped=function showModalV479(html,opts){return prevShowModal.call(this,injectAdminOtRate(html),opts);};
    wrapped.__v479OtRateWrapped=true;wrapped.__v479Previous=prevShowModal;assignGlobal('showModal',wrapped);
  }
  window.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-save-ot-edit-v191]')) stampOtRateBeforeSave(event.target.closest('#otEditFormV191'));
  },true);
  window.addEventListener('submit',event=>{if(event.target?.id==='otEditFormV191')stampOtRateBeforeSave(event.target);},true);

  /* ------------------------------------------------------------------
     B. Position detail source of truth — Admin > จัดการตำแหน่ง Slot Master
     ------------------------------------------------------------------ */
  function dateInRange(date,start,end){const d=normDate(date),s=normDate(start),e=normDate(end||start);return !!d&&!!s&&s<=d&&d<=(e||s);}
  function outingDate(date){
    const d=normDate(date);if(!d)return false;
    if((S()?.activities||[]).some(a=>txt(a?.event_type)==='ออกหน่วย'&&dateInRange(d,a?.start_date,a?.end_date)))return true;
    return (S()?.positions||[]).some(r=>normDate(r?.work_date)===d&&(r?.is_outing===true||txt(r?.zone)==='ออกหน่วย'||/^OUTING:/i.test(txt(r?.eligibility_code))));
  }
  function targetForDate(date){
    try{const n=Number(window.cnmiV379?.targetForDate?.(date));if(Number.isFinite(n)&&n>0)return Math.round(n);}catch(_){}
    const row=(S()?.manualDaySlotSettingsV273||[]).find(x=>normDate(x?.work_date)===normDate(date));
    const n=Number(row?.target_slots);if(Number.isFinite(n)&&n>0)return Math.round(n);
    const codes=new Set((S()?.positions||[]).filter(x=>normDate(x?.work_date)===normDate(date)).map(codeOf).filter(Boolean));
    if(codes.size>=8&&codes.size<=14)return codes.size;
    return null;
  }
  function configs(){try{return window.cnmiV224?.currentConfigs?.()||S()?.slotTemplateV224?.configs||null;}catch(_){return S()?.slotTemplateV224?.configs||null;}}
  function configuredRowsForDate(date){
    const cfg=configs();if(!cfg)return[];
    const target=targetForDate(date);
    if(outingDate(date)){
      const n=Number(target||14),bucket=n<=12?12:(n<=13?13:14);
      return cfg?.outing_by_count?.[bucket]||cfg?.outing_by_count?.[String(bucket)]||cfg?.outing||[];
    }
    if(target!=null)return cfg?.day?.[target]||cfg?.day?.[String(target)]||[];
    return[];
  }
  function configuredTemplate(code,date){
    const k=key(code);if(!k)return null;
    const rows=configuredRowsForDate(date);
    const exact=(rows||[]).find(r=>key(codeOf(r))===k);
    if(exact)return exact;
    /* Fallback search stays inside Slot Master configs, not legacy hard-coded text. */
    const cfg=configs();if(!cfg)return null;
    const pools=[];
    Object.values(cfg.day||{}).forEach(r=>Array.isArray(r)&&pools.push(r));
    Object.values(cfg.outing_by_count||{}).forEach(r=>Array.isArray(r)&&pools.push(r));
    if(Array.isArray(cfg.outing))pools.push(cfg.outing);
    for(const pool of pools){const found=pool.find(r=>key(codeOf(r))===k);if(found)return found;}
    return null;
  }
  function mergeConfiguredMeta(row,date,legacy){
    const src=configuredTemplate(codeOf(row),date)||{};
    const base=legacy||{};
    return {
      ...base,
      code:codeOf(row)||base.code,
      zone:useful(src.zone)?txt(src.zone):(base.zone||txt(row?.zone)||'-'),
      break_time:useful(src.break_time)?txt(src.break_time):(base.break_time||txt(row?.break_time)||'-'),
      main_rule:useful(src.main_rule||src.required_role)?txt(src.main_rule||src.required_role):(base.main_rule||txt(row?.main_rule||row?.required_role)||'-'),
      job_desc:useful(src.job_desc||src.description||src.detail)?txt(src.job_desc||src.description||src.detail):(base.job_desc||txt(row?.job_desc||row?.description)||'-'),
      sourceV479:src&&Object.keys(src).length?'slot-master':'legacy'
    };
  }
  function patchPositionMetadataApi(){
    const api=window.cnmiV381;if(!api||api.__v479SourcePatched)return;
    const prevMeta=typeof api.metadataFor==='function'?api.metadataFor.bind(api):null;
    api.metadataFor=function(row,date){let legacy={};try{legacy=prevMeta?prevMeta(row,date)||{}:{};}catch(_){}return mergeConfiguredMeta(row,normDate(date),legacy);};
    const prevTemplate=typeof api.templateFor==='function'?api.templateFor.bind(api):null;
    api.templateFor=function(code,date){return configuredTemplate(code,normDate(date))||(prevTemplate?prevTemplate(code,date):null);};
    const prevRows=typeof api.rowsForDate==='function'?api.rowsForDate.bind(api):null;
    api.rowsForDate=function(date){const rows=configuredRowsForDate(normDate(date));return Array.isArray(rows)&&rows.length?rows:(prevRows?prevRows(date):[]);};
    api.__v479SourcePatched=true;
  }
  patchPositionMetadataApi();
  setTimeout(patchPositionMetadataApi,200);
  setTimeout(patchPositionMetadataApi,1200);

  /* V435's MutationObserver can re-stamp a dashboard position link with the
     real current date after V443 has rendered another selected date. Fix the
     date at click time so the popup always resolves the Slot Master for the
     date the Admin is actually viewing. */
  function selectedDashboardDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.()||S()?.dashboardDateV443||'');}catch(_){return normDate(S()?.dashboardDateV443||'');}
  }
  window.addEventListener('click',event=>{
    const open=event.target?.closest?.('[data-v435-position-open]');
    if(!open)return;
    const d=selectedDashboardDate();
    if(d)open.dataset.v435Date=d;
  },true);

  /* ------------------------------------------------------------------
     C. Admin Users — responsive New User panel
     ------------------------------------------------------------------ */
  function groupLabel(form,names,title,subtitle,cls){
    const section=document.createElement('section');section.className=`v479-new-user-section ${cls||''}`;
    section.innerHTML=`<div class="v479-new-user-section-head"><h4>${esc(title)}</h4>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><div class="v479-new-user-fields"></div>`;
    const fields=section.querySelector('.v479-new-user-fields');
    names.forEach(name=>{const input=form.querySelector(`[name="${name}"]`);const label=input?.closest('label');if(label)fields.appendChild(label);});
    return section;
  }
  function transformUsersHtml(html){
    if(!admin()||!String(html||'').includes('id="newStaffForm"'))return html;
    try{
      const t=document.createElement('template');t.innerHTML=String(html||'');
      const grid=t.content.querySelector('.users-page-v49');
      const details=t.content.querySelector('.add-user-details');
      const form=t.content.querySelector('#newStaffForm');
      if(!grid||!details||!form||grid.querySelector('.v479-new-user-panel'))return t.innerHTML;
      const oldSummary=details.querySelector('summary');
      if(oldSummary)oldSummary.innerHTML='<span>เพิ่มผู้ใช้งานใหม่</span><small>เปิดเมื่อมีเจ้าหน้าที่ใหม่ ไม่ต้องกรอกในช่องแคบด้านซ้าย</small>';
      const submit=form.querySelector('button[type="submit"]');
      const personal=groupLabel(form,['nickname','full_name','employee_code','staff_type','position','phone'],'ข้อมูลเจ้าหน้าที่','ข้อมูลที่ใช้แสดงในตารางและการจัดเวร','personal');
      const account=groupLabel(form,['email','login_name','role','staff_color','employment_start_date','employment_end_date','daily_position_start_date'],'บัญชีและช่วงการใช้งาน','สิทธิ์เข้าแอปและวันที่เริ่ม/สิ้นสุดการใช้งาน','account');
      const body=document.createElement('div');body.className='v479-new-user-body';body.append(personal,account);
      form.innerHTML='';form.appendChild(body);
      const actions=document.createElement('div');actions.className='v479-new-user-actions';
      if(submit){submit.classList.add('v479-new-user-submit');actions.appendChild(submit);}form.appendChild(actions);
      details.remove();
      const panel=document.createElement('section');panel.className='card v479-new-user-panel';panel.appendChild(details);grid.appendChild(panel);
      return t.innerHTML;
    }catch(err){console.warn(`[${VERSION}] users transform`,err);return html;}
  }
  const prevUsers=window.renderUsersPage||(typeof renderUsersPage==='function'?renderUsersPage:null);
  if(typeof prevUsers==='function'&&!prevUsers.__v479ResponsiveNewUser){
    const wrapped=function renderUsersPageV479(){return transformUsersHtml(prevUsers.apply(this,arguments));};
    wrapped.__v479ResponsiveNewUser=true;wrapped.__v479Previous=prevUsers;assignGlobal('renderUsersPage',wrapped);
  }

  const style=document.createElement('style');style.id='cnmi-v479-style';style.textContent=`
    .v479-ot-rate-field{border:1px solid #cfe5f7;background:#f6fbff;border-radius:12px;padding:9px 10px}
    .v479-ot-rate-field select{font-weight:700}
    .users-page-v49>.v479-new-user-panel{grid-column:1/-1;padding:0;overflow:hidden}
    .v479-new-user-panel .add-user-details{margin:0;border:0;border-radius:0;background:transparent}
    .v479-new-user-panel .add-user-details>summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;font-weight:800;background:#f7fbff;border-bottom:1px solid transparent}
    .v479-new-user-panel .add-user-details>summary::-webkit-details-marker{display:none}
    .v479-new-user-panel .add-user-details>summary span{font-size:16px;color:#19354d}.v479-new-user-panel .add-user-details>summary small{font-size:11px;font-weight:600;color:#6f8190;text-align:right}
    .v479-new-user-panel .add-user-details[open]>summary{border-bottom-color:#dce9f3}
    .v479-new-user-panel #newStaffForm{display:block;padding:14px 16px 16px}
    .v479-new-user-body{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .v479-new-user-section{border:1px solid #dce8f2;border-radius:14px;background:#fff;padding:13px}
    .v479-new-user-section-head{margin-bottom:10px}.v479-new-user-section-head h4{margin:0;color:#173750}.v479-new-user-section-head p{margin:3px 0 0;font-size:10px;color:#718096}
    .v479-new-user-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}
    .v479-new-user-fields label{margin:0;min-width:0;font-size:11px;font-weight:700;color:#334e63}
    .v479-new-user-fields input,.v479-new-user-fields select{width:100%;min-width:0;margin-top:5px}
    .v479-new-user-actions{display:flex;justify-content:flex-end;padding-top:12px}.v479-new-user-submit{min-width:180px}
    @media(min-width:1100px){.v479-new-user-section.account .v479-new-user-fields{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(max-width:820px){
      .users-page-v49>.v479-new-user-panel{grid-column:1!important}
      .v479-new-user-panel .add-user-details>summary{padding:13px 14px;align-items:flex-start;flex-direction:column;gap:3px}
      .v479-new-user-panel .add-user-details>summary small{text-align:left;font-size:10px}
      .v479-new-user-panel #newStaffForm{padding:10px}
      .v479-new-user-body{grid-template-columns:1fr;gap:10px}
      .v479-new-user-section{padding:11px;border-radius:12px;box-shadow:0 3px 10px rgba(26,63,89,.05)}
      .v479-new-user-fields{grid-template-columns:1fr;gap:8px}
      .v479-new-user-fields label{display:block;background:#f9fbfd;border:1px solid #e7eef5;border-radius:10px;padding:9px 10px;font-size:11px}
      .v479-new-user-fields input,.v479-new-user-fields select{margin-top:5px;background:#fff}
      .v479-new-user-actions{padding-top:10px}.v479-new-user-submit{width:100%;min-width:0}
    }
  `;document.head.appendChild(style);

  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v479-security-ot-rate-position-user-ui.js", error); }
;

/* Original source: patch-v481-staff-hr-confirm-admin-pending.js */
try {
/* CNMI Staff Planner V481
 * Staff HR self-confirmation + monthly leave checklist + Admin pending center.
 *
 * - V480 is intentionally NOT loaded in index.html anymore.
 * - Admin keeps the original "รอดำเนินการ Admin" center from V460/V464/V465.
 * - Staff gets a separate HC iService checklist showing every real leave in
 *   the month selected on Dashboard, not only the 7-day reminder window.
 * - Staff can press "ลาในระบบแล้ว". A locked-down RPC records only the staff's
 *   own leave as HR-reported and moves it to "รอตรวจสอบ" for Admin.
 * - All real leave types are reminded; "ไม่รับเวร" is excluded.
 * - Vacation leave has the special HC iService rule: submit at least 3 calendar
 *   days before the leave start date. Staff Planner does NOT fake/override that
 *   external HC iService lock; it shows the deadline and a strong late warning.
 *
 * Requires SQL_V481_STAFF_MARK_HR_REPORTED.sql once.
 */
(function(){
  'use strict';
  const VERSION='V558_HC_ISERVICE_TWO_STEP_FLOW';
  const LEAVE_URL='https://www3.ra.mahidol.ac.th/leaveRama/';
  const VACATION_ADVANCE_DAYS=3;
  if(window.__CNMI_V481_STAFF_HR_CONFIRM_ADMIN_PENDING__)return;
  window.__CNMI_V481_STAFF_HR_CONFIRM_ADMIN_PENDING__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.rpc)return sb;}catch(_){}return window.sb||window.supabaseClient||null;}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function effectiveAdmin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return txt(S()?.profile?.role).toLowerCase()==='admin';}}
  function currentId(){try{return typeof currentStaffId==='function'?txt(currentStaffId()):txt(S()?.profile?.id||S()?.profile?.staff_id);}catch(_){return txt(S()?.profile?.id||S()?.profile?.staff_id);}}
  function norm(v){
    try{if(typeof normalizeDateKey==='function')return txt(normalizeDateKey(v)).slice(0,10);}catch(_){}
    const s=txt(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
  }
  function localToday(){
    try{if(typeof todayStr==='function')return norm(todayStr());}catch(_){}
    const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function selectedDashboardDate(){
    try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S()?.dashboardDateV443)||localToday();}catch(_){return norm(S()?.dashboardDateV443)||localToday();}
  }
  function selectedMonthKey(){return selectedDashboardDate().slice(0,7);}
  function monthBounds(monthKey){
    const m=String(monthKey||'');if(!/^\d{4}-\d{2}$/.test(m))return {first:'',last:''};
    const [y,mo]=m.split('-').map(Number);const lastDay=new Date(y,mo,0).getDate();
    return {first:`${m}-01`,last:`${m}-${String(lastDay).padStart(2,'0')}`};
  }
  function thaiMonthYear(monthKey){
    const m=String(monthKey||'');if(!/^\d{4}-\d{2}$/.test(m))return m;
    const [y,mo]=m.split('-').map(Number);const names=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${names[mo-1]||''} ${y+543}`;
  }
  function dateObj(date){const d=norm(date);return d?new Date(`${d}T12:00:00`):null;}
  function addDays(date,days){const d=dateObj(date);if(!d)return'';d.setDate(d.getDate()+Number(days||0));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function diffDays(a,b){const da=dateObj(a),db=dateObj(b);if(!da||!db)return 0;return Math.round((da-db)/86400000);}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}}
  function staffName(id){const row=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''));return txt(row?.nickname||row?.full_name||row?.email||'เจ้าหน้าที่');}
  function typeOf(row){
    try{if(typeof leaveDisplayType==='function')return txt(leaveDisplayType(row));}catch(_){}
    const t=txt(row?.type||row?.leave_type).split(':::')[0].trim();return t==='ลาพักร้อน'?'ลาพักผ่อน':t;
  }
  function periodOf(row){
    const raw=txt(row?.leave_period||row?.period||'เต็มวัน');
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw;
  }
  function thaiRange(row){const s=norm(row?.start_date),e=norm(row?.end_date||row?.start_date);if(!s)return'-';return e&&e!==s?`${thaiDate(s)} – ${thaiDate(e)}`:thaiDate(s);}
  function effective(row){
    try{if(typeof isLeaveEffective==='function'&&!isLeaveEffective(row))return false;}catch(_){}
    const st=txt(row?.status).toLowerCase();
    return !/(cancel|delete|inactive|ยกเลิก|ไม่อนุมัติ)/i.test(st);
  }
  function realLeave(row){return !!row&&effective(row)&&!!typeOf(row)&&typeOf(row)!=='ไม่รับเวร';}
  function vacation(row){const t=typeOf(row);return t==='ลาพักผ่อน'||t==='ลาพักร้อน';}
  function hrRow(row){const id=String(row?.id||'');return (S().hrChecks||[]).find(h=>String(h?.leave_request_id||'')===id)||null;}
  function reported(row){const h=hrRow(row),status=txt(h?.status);return !!h?.hr_reported_date||status==='ตรวจสอบแล้ว';}
  function checked(row){return txt(hrRow(row)?.status)==='ตรวจสอบแล้ว';}
  function retry(row){const h=hrRow(row);return !!h&&!h?.hr_reported_date&&txt(h?.status)==='รอเอกสาร';}
  function pendingAdmin(row){const h=hrRow(row);return !!h?.hr_reported_date&&!checked(row);}
  function overlapsMonth(row,monthKey){
    const {first,last}=monthBounds(monthKey);if(!first||!last)return false;
    const a=norm(row?.start_date),b=norm(row?.end_date||row?.start_date)||a;if(!a)return false;
    return a<=last&&b>=first;
  }
  const STEP1_KEY_PREFIX='cnmi-v558-hc-opened:';
  function step1Key(id){return STEP1_KEY_PREFIX+String(id||'');}
  function clearStep1(rowOrId){
    const id=typeof rowOrId==='object'?rowOrId?.id:rowOrId;
    try{if(id)localStorage.removeItem(step1Key(id));}catch(_){}
  }
  function step1Done(row){
    if(!row?.id)return false;
    if(retry(row)){clearStep1(row);return false;}
    try{return localStorage.getItem(step1Key(row.id))==='1';}catch(_){return false;}
  }
  function markStep1(rowOrId){
    const id=typeof rowOrId==='object'?rowOrId?.id:rowOrId;
    try{if(id)localStorage.setItem(step1Key(id),'1');}catch(_){}
  }

  function actionableRows(){
    if(effectiveAdmin())return [];
    const mine=currentId();if(!mine)return[];
    const month=selectedMonthKey(),today=localToday();
    return (S().leaves||[])
      .filter(r=>String(r?.staff_id||'')===String(mine)&&realLeave(r)&&overlapsMonth(r,month))
      .map(r=>{
        const start=norm(r?.start_date),deadline=vacation(r)?addDays(start,-VACATION_ADVANCE_DAYS):'',daysToDeadline=deadline?diffDays(deadline,today):null;
        return {...r,_v481Deadline:deadline,_v481DaysToDeadline:daysToDeadline};
      })
      .sort((a,b)=>String(a.start_date||'').localeCompare(String(b.start_date||''))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
  }

  function vacationMeta(row){
    if(!vacation(row))return {key:'normal',label:'อย่าลืมลาออนไลน์',detail:'ทำขั้นตอน 1 แล้วให้กดขั้นตอน 2 เพื่อยืนยัน'};
    const d=Number(row?._v481DaysToDeadline||0),deadline=thaiDate(row?._v481Deadline);
    if(d<0)return {key:'late',label:'พ้นกำหนดล่วงหน้า 3 วัน',detail:`HC iService กำหนดให้ยื่นภายใน ${deadline} และอาจล็อกรายการแล้ว`};
    if(d===0)return {key:'today',label:'วันนี้วันสุดท้าย',detail:`ลาพักผ่อนต้องยื่น HC iService วันนี้ (${deadline})`};
    if(d<=3)return {key:'soon',label:`เหลือ ${d} วันถึงกำหนด`,detail:`ต้องยื่น HC iService ภายใน ${deadline}`};
    return {key:'plan',label:`ต้องยื่นภายใน ${deadline}`,detail:'ลาพักผ่อนต้องลาออนไลน์ล่วงหน้าอย่างน้อย 3 วันปฏิทิน'};
  }

  function statusInline(row){
    if(checked(row))return `<span class="v481-inline-status is-checked" title="Admin ตรวจรายการใน HC iService แล้ว">✓ Admin ตรวจแล้ว</span>`;
    if(pendingAdmin(row))return `<span class="v481-inline-status is-pending">✓ ยืนยันแล้ว • รอ Admin ตรวจ HR</span>`;
    if(retry(row))return `<span class="v481-inline-status is-retry">⚠ Admin ตรวจไม่พบใน HC iService • กรุณาตรวจ/บันทึกใหม่</span>`;
    if(step1Done(row))return `<span class="v481-inline-status is-waiting is-step2">ขั้นตอน 2 • ยืนยันว่าลาแล้ว</span>`;
    return `<span class="v481-inline-status is-waiting is-step1">ขั้นตอน 1 • เปิด HC iService ก่อน</span>`;
  }
  function actionBlock(row){
    if(checked(row)||pendingAdmin(row))return '';
    const opened=step1Done(row);
    return `<div class="v481-reminder-actions ${opened?'is-step2':'is-step1'}" data-v558-actions="${esc(row.id)}">
      <a class="v481-open-link" data-v558-open-hc="${esc(row.id)}" href="${LEAVE_URL}" target="_blank" rel="noopener noreferrer external">
        <span class="v481-step-no">${opened?'✓':'1'}</span><span class="v558-action-copy"><b>${opened?'เปิด HC iService แล้ว':'เปิด HC iService'}</b><small>${opened?'เปิดซ้ำได้':'เริ่มขั้นตอนนี้'}</small></span>
      </a>
      <span class="v481-step-arrow ${opened?'is-active':''}" aria-hidden="true">→</span>
      <button type="button" class="v481-confirm-btn" data-v481-mark-hr="${esc(row.id)}">
        <span class="v481-step-no">2</span><span class="v558-action-copy"><b>ยืนยันว่าลาแล้ว</b><small>${opened?'ทำขั้นตอนนี้ต่อ':'หลังบันทึก HC'}</small></span>
      </button>
    </div>`;
  }
  function refreshActionBlock(leaveId){
    const row=(S().leaves||[]).find(r=>String(r?.id||'')===String(leaveId||''));
    if(!row)return;
    const current=document.querySelector(`[data-v558-actions="${CSS.escape(String(leaveId||''))}"]`)||document.querySelector(`[data-v481-mark-hr="${CSS.escape(String(leaveId||''))}"]`)?.closest?.('.v481-reminder-actions');
    if(current){
      const t=document.createElement('template');t.innerHTML=actionBlock(row).trim();const next=t.content.firstElementChild;if(next)current.replaceWith(next);
      const item=next?.closest?.('.v481-reminder-item');
      const status=item?.querySelector?.('.v481-inline-status.is-waiting');
      if(status)status.outerHTML=statusInline(row);
    }
  }
  function rowHtml(row){
    const m=vacationMeta(row),type=typeOf(row),period=periodOf(row),done=checked(row),pending=pendingAdmin(row),again=retry(row);
    const tone=done?'checked':pending?'pending':again?'retry':m.key;
    const inlineMeta=`<div class="v481-compact-line">
      <b class="v481-compact-type">${esc(type)}</b>
      <span class="v481-period">${esc(period)}</span>
      ${vacation(row)&&!done?'<span class="v481-vacation">ล่วงหน้า 3 วัน</span>':''}
      <span class="v481-compact-date"><b>วันลา</b> ${esc(thaiRange(row))}</span>
      ${statusInline(row)}
    </div>`;
    return `<div class="v481-reminder-item tone-${esc(tone)}">
      <div class="v481-reminder-main">
        ${inlineMeta}
        ${done||pending||again?'':`<div class="v481-reminder-rule"><strong>${esc(m.label)}</strong><span>${esc(m.detail)}</span></div>`}
      </div>
      ${actionBlock(row)}
    </div>`;
  }

  function panelHtml(){
    if(effectiveAdmin())return'';
    const month=selectedMonthKey(),rows=actionableRows();
    const waiting=rows.filter(r=>!reported(r)).length,pending=rows.filter(pendingAdmin).length,done=rows.filter(checked).length;
    const head=`<div class="v481-reminder-head"><div><h3>ลาออนไลน์ HC iService</h3><p>รายการลาของคุณในเดือน <b>${esc(thaiMonthYear(month))}</b> • ทำตามขั้นตอน 1 → 2 ให้ครบในรายการนั้น</p></div></div>`;
    if(!rows.length)return `<section class="card v481-staff-hr-reminder is-clear" data-v481-staff-hr-reminder>${head}<div class="v481-clear"><span>✓</span><div><b>เดือนนี้ไม่มีรายการลา</b><small>เมื่อมีการบันทึกลาใน Staff Planner รายการจะขึ้นที่กล่องนี้ทันที</small></div></div></section>`;
    return `<section class="card v481-staff-hr-reminder" data-v481-staff-hr-reminder>${head}
      <div class="v481-month-summary"><span><b>${rows.length}</b> รายการ</span><span class="is-waiting"><b>${waiting}</b> รอยืนยัน</span><span class="is-pending"><b>${pending}</b> รอ Admin</span><span class="is-done"><b>${done}</b> ตรวจแล้ว</span></div>
      <div class="v481-reminder-list">${rows.map(rowHtml).join('')}</div>
      <div class="v481-footnote"><b>ทำตามรายการ:</b> ① กด “เปิด HC iService” → บันทึกลาในระบบโรงพยาบาล → กลับมาที่ Staff Planner → ② กด “ยืนยันว่าลาแล้ว”</div>
    </section>`;
  }

  function mutateDashboard(html){
    if(String(S()?.page||'')!=='dashboard')return html;
    try{
      const t=document.createElement('template');t.innerHTML=String(html||'');
      t.content.querySelectorAll('[data-v480-leave-reminder],[data-v481-staff-hr-reminder]').forEach(n=>n.remove());
      if(!effectiveAdmin()){
        const box=document.createElement('template');box.innerHTML=panelHtml().trim();
        const panel=box.content.firstElementChild;
        const nav=t.content.querySelector('[data-v443-dashboard-date-nav]');
        if(panel){if(nav)nav.insertAdjacentElement('afterend',panel);else t.content.insertBefore(panel,t.content.firstChild);}
      }
      const holder=document.createElement('div');holder.appendChild(t.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard`,err);return html;}
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'&&!previousDashboard.__v481StaffHrReminder){
    const wrapped=function renderDashboardV481(){return mutateDashboard(previousDashboard.apply(this,arguments));};
    wrapped.__v481StaffHrReminder=true;wrapped.__v481Previous=previousDashboard;
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function leaveFormNoteHtml(){
    return `<div class="notice soft-notice wide v481-leave-form-note" data-v481-leave-form-note>
      <div class="v481-form-note-main"><b>หลังบันทึกรายการลา</b><span>ไปลาออนไลน์ใน HC iService แล้วกลับมาที่ Dashboard กด <b>“ยืนยันว่าลาแล้ว”</b> เพื่อให้ Admin ทราบว่าพร้อมตรวจ HR</span></div>
      <div class="v481-form-vacation-rule" data-v481-vacation-rule></div>
      <a href="${LEAVE_URL}" target="_blank" rel="noopener noreferrer external">เปิด HC iService ↗</a>
    </div>`;
  }
  function injectLeaveForm(html){
    if(String(S()?.page||'')!=='leave'||!String(html||'').includes('id="leaveForm"'))return html;
    try{
      const t=document.createElement('template');t.innerHTML=String(html||'');const form=t.content.querySelector('#leaveForm');
      if(!form)return html;
      form.querySelectorAll('[data-v480-leave-form-note],[data-v481-leave-form-note]').forEach(n=>n.remove());
      const typeSelect=form.querySelector('select[name="type"]'),label=typeSelect?.closest('label');if(!typeSelect||!label)return html;
      const note=document.createElement('template');note.innerHTML=leaveFormNoteHtml().trim();label.insertAdjacentElement('afterend',note.content.firstElementChild);
      const holder=document.createElement('div');holder.appendChild(t.content.cloneNode(true));return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] leave form`,err);return html;}
  }
  const previousLeave=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof previousLeave==='function'&&!previousLeave.__v481HrNote){
    const wrapped=function renderLeavePageV481(){return injectLeaveForm(previousLeave.apply(this,arguments));};
    wrapped.__v481HrNote=true;wrapped.__v481Previous=previousLeave;
    try{window.renderLeavePage=renderLeavePage=wrapped;}catch(_){window.renderLeavePage=wrapped;}
  }

  function updateLeaveFormNote(form){
    if(!form)return;
    const note=form.querySelector('[data-v481-leave-form-note]'),rule=form.querySelector('[data-v481-vacation-rule]');if(!note||!rule)return;
    const setRule=html=>{if(rule.innerHTML!==html)rule.innerHTML=html;};
    const type=txt(form.querySelector('[name="type"]')?.value),start=norm(form.querySelector('[name="start_date"]')?.value),isNoDuty=type==='ไม่รับเวร';
    note.hidden=isNoDuty;
    if(isNoDuty){setRule('');return;}
    const isVacation=type==='ลาพักผ่อน'||type==='ลาพักร้อน';
    if(!isVacation){setRule('<span class="v481-rule-neutral">รายการลาประเภทนี้ไม่มีเงื่อนไข “ล่วงหน้า 3 วัน” ใน Staff Planner</span>');return;}
    if(!start){setRule('<span class="v481-rule-neutral">เลือกวันที่เริ่มลาเพื่อดูวันสุดท้ายที่ต้องยื่น HC iService</span>');return;}
    const today=localToday(),deadline=addDays(start,-VACATION_ADVANCE_DAYS),d=diffDays(deadline,today);
    if(d<0)setRule(`<span class="v481-rule-danger"><b>ลาพักผ่อน:</b> พ้นกำหนดล่วงหน้า 3 วันแล้ว • HC iService กำหนดให้ยื่นภายใน <b>${esc(thaiDate(deadline))}</b> และระบบภายนอกอาจล็อกไม่ให้ยื่น กรุณาติดต่อหัวหน้า/HR หากยังไม่ได้ลาออนไลน์</span>`);
    else if(d===0)setRule(`<span class="v481-rule-warn"><b>ลาพักผ่อน:</b> วันนี้เป็นวันสุดท้ายที่ต้องยื่น HC iService • กำหนด <b>${esc(thaiDate(deadline))}</b></span>`);
    else setRule(`<span class="v481-rule-ok"><b>ลาพักผ่อน:</b> ต้องยื่น HC iService ล่วงหน้าอย่างน้อย 3 วันปฏิทิน • วันสุดท้ายคือ <b>${esc(thaiDate(deadline))}</b> (${d} วันจากวันนี้)</span>`);
  }

  async function confirmDialogSafe(message,title){
    try{if(typeof confirmDialog==='function')return !!(await confirmDialog(message,title));}catch(_){}
    return window.confirm(message);
  }
  function mergeHrResult(payload){
    if(!payload||!payload.leave_request_id)return;
    const rows=S().hrChecks||(S().hrChecks=[]),idx=rows.findIndex(h=>String(h?.leave_request_id||'')===String(payload.leave_request_id));
    const safe={leave_request_id:payload.leave_request_id,status:payload.status,hr_reported_date:payload.hr_reported_date};
    if(idx>=0)rows[idx]={...rows[idx],...safe};else rows.push(safe);
  }
  async function markHrReported(leaveId,button){
    const row=(S().leaves||[]).find(r=>String(r?.id||'')===String(leaveId||''));
    if(!row||String(row?.staff_id||'')!==String(currentId()))return typeof showToast==='function'&&showToast('ยืนยันได้เฉพาะรายการลาของตัวเอง');
    if(!realLeave(row))return typeof showToast==='function'&&showToast('รายการนี้ไม่ใช่วันลาที่ต้องลง HC iService');
    const ok=await confirmDialogSafe(`ยืนยันว่าได้บันทึก “${typeOf(row)}” วันที่ ${thaiRange(row)} ใน HC iService เรียบร้อยแล้วจริง?\n\nหลังยืนยัน Admin จะเห็นเป็น “รอตรวจสอบ HR”`,'ยืนยันว่าลาแล้ว');
    if(!ok)return;
    const db=DB();if(!db)return typeof showToast==='function'&&showToast('ยังเชื่อมต่อ Supabase ไม่สำเร็จ');
    const oldText=button?.textContent;try{if(button){button.disabled=true;button.textContent='กำลังบันทึก…';}}
    catch(_){}
    try{
      const res=await db.rpc('staff_mark_leave_hr_reported_v481',{p_leave_request_id:leaveId});
      if(res?.error){
        const msg=txt(res.error.message||res.error);
        if(/staff_mark_leave_hr_reported_v481|Could not find the function|schema cache/i.test(msg))throw new Error('ยังไม่ได้ Run SQL_V481_STAFF_MARK_HR_REPORTED.sql ใน Supabase');
        throw res.error;
      }
      let payload=res?.data;
      if(Array.isArray(payload))payload=payload[0]||null;
      if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch(_){} }
      mergeHrResult(payload);
      clearStep1(leaveId);
      try{if(window.cnmiHrStatusV454?.loadPublicHrStatus)await window.cnmiHrStatusV454.loadPublicHrStatus();}catch(_){}
      try{if(typeof renderPage==='function')renderPage();}catch(_){}
      if(typeof showToast==='function')showToast('ยืนยันแล้ว • รอ Admin ตรวจสอบ HR');
    }catch(err){
      console.warn(`[${VERSION}] mark HR reported`,err);
      if(typeof showToast==='function')showToast(txt(err?.message||err||'บันทึกไม่สำเร็จ'));
    }finally{try{if(button){button.disabled=false;refreshActionBlock(leaveId);}}catch(_){} }
  }

  document.addEventListener('click',e=>{
    const open=e.target?.closest?.('[data-v558-open-hc]');
    if(open){
      const id=open.getAttribute('data-v558-open-hc');
      markStep1(id);
      setTimeout(()=>refreshActionBlock(id),0);
      return;
    }
    const btn=e.target?.closest?.('[data-v481-mark-hr]');if(!btn)return;
    e.preventDefault();e.stopPropagation();markHrReported(btn.getAttribute('data-v481-mark-hr'),btn);
  },true);
  document.addEventListener('change',e=>{
    const form=e.target?.closest?.('#leaveForm');if(!form)return;
    if(['type','start_date','end_date'].includes(e.target?.name))updateLeaveFormNote(form);
  },true);

  function guardDom(){
    if(String(S()?.page||'')==='dashboard'){
      document.querySelectorAll('[data-v480-leave-reminder]').forEach(n=>n.remove());
      if(effectiveAdmin())document.querySelectorAll('[data-v481-staff-hr-reminder]').forEach(n=>n.remove());
      else{
        const page=document.getElementById('pageContent');
        if(page&&!page.querySelector('[data-v481-staff-hr-reminder]')){
          const nav=page.querySelector('[data-v443-dashboard-date-nav]');
          const t=document.createElement('template');t.innerHTML=panelHtml().trim();const panel=t.content.firstElementChild;
          if(panel){if(nav)nav.insertAdjacentElement('afterend',panel);else page.insertBefore(panel,page.firstChild);}
        }
      }
    }
    if(String(S()?.page||'')==='leave')updateLeaveFormNote(document.querySelector('#leaveForm'));
  }
  const mo=new MutationObserver(()=>guardDom());
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){}
  setTimeout(guardDom,80);setTimeout(guardDom,350);

  const style=document.createElement('style');style.id='cnmi-v481-style';style.textContent=`
    .v481-staff-hr-reminder{margin:0 0 14px;border:1px solid #bcdcf0;background:linear-gradient(180deg,#f8fcff,#fff);box-shadow:0 6px 18px rgba(36,92,130,.05)}
    .v481-staff-hr-reminder.is-clear{border-color:#cfe8d8;background:linear-gradient(180deg,#fbfffc,#fff)}
    .v481-reminder-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.v481-reminder-head h3{margin:0;color:#233f55;font-size:17px}.v481-reminder-head p{margin:4px 0 0;color:#6f8294;font-size:11px;line-height:1.45}
    .v481-head-link,.v481-open-link{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:850;border-radius:10px;white-space:nowrap}.v481-head-link{padding:9px 12px;background:#e7f5ff;color:#1573ad;border:1px solid #bfe3f8;font-size:11px}.v481-open-link{padding:7px 9px;border:1px solid #d6e7f3;background:#f5fbff;color:#2573a3;font-size:10px}
    .v481-reminder-list{display:grid;gap:8px;margin-top:12px}.v481-reminder-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 12px;border:1px solid #e0e9f0;border-radius:13px;background:#fff}.v481-reminder-item.tone-late{border-color:#ffc8c3;background:#fff8f7}.v481-reminder-item.tone-today{border-color:#ffd795;background:#fffaf1}.v481-reminder-item.tone-soon{border-color:#cfe2f0;background:#fbfdff}
    .v481-reminder-main{display:grid;gap:4px;min-width:0;flex:1}.v481-compact-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;color:#29465b;font-size:10px;line-height:1.35}.v481-compact-type{font-size:13px;color:#29465b}.v481-period,.v481-vacation{display:inline-flex;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:850;white-space:nowrap}.v481-period{background:#eaf3ff;color:#275f94}.v481-vacation{background:#e8f7ed;color:#317e56}.v481-compact-date{color:#6c8091;white-space:nowrap}.v481-compact-date b{color:#3c566a}.v481-inline-status{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:9px;font-weight:850;white-space:nowrap}.v481-inline-status.is-checked{background:#eaf8ef;color:#236d49}.v481-inline-status.is-pending{background:#eef6ff;color:#2a628e}.v481-inline-status.is-retry{background:#fff1ef;color:#a84438}.v481-inline-status.is-waiting{background:#fff7e8;color:#8a5a08}.v481-reminder-rule{display:flex;gap:6px;flex-wrap:wrap;align-items:baseline;font-size:10px}.v481-reminder-rule strong{color:#2877a9}.v481-reminder-rule span{color:#788b9a}.tone-late .v481-reminder-rule strong{color:#b33228}.tone-today .v481-reminder-rule strong{color:#a86100}
    .v481-reminder-actions{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);align-items:center;gap:6px;min-width:360px}.v481-open-link,.v481-confirm-btn{min-width:0;min-height:50px;gap:7px;white-space:normal;text-align:left}.v481-confirm-btn{appearance:none;border:1px solid #9ed7ba;border-radius:12px;background:#f0faf4;color:#187449;font:inherit;font-size:11px;font-weight:900;padding:8px 10px;cursor:pointer}.v481-confirm-btn:hover{filter:brightness(.98)}.v481-confirm-btn:disabled{opacity:.55;cursor:wait}.v558-action-copy{display:grid;gap:1px;line-height:1.15;min-width:0}.v558-action-copy b{font-size:11px;font-weight:950}.v558-action-copy small{font-size:8px;font-weight:800;opacity:.82}.v481-step-arrow{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:#edf2f5;color:#8aa0ad;font-size:17px;font-weight:950;transition:.18s ease}.v481-reminder-actions.is-step1 .v481-open-link{background:#168fd3;border-color:#168fd3;color:#fff;box-shadow:0 4px 12px rgba(22,143,211,.22)}.v481-reminder-actions.is-step1 .v481-confirm-btn{background:#f2fbf6;border-color:#b8dfc9;color:#4f7f67}.v481-reminder-actions.is-step2 .v481-open-link{background:#e8f6ff;border-color:#abd9f3;color:#176d9b;box-shadow:none}.v481-reminder-actions.is-step2 .v481-confirm-btn{background:#22a06b;border-color:#22a06b;color:#fff;box-shadow:0 4px 12px rgba(34,160,107,.22)}.v481-reminder-actions.is-step2 .v481-step-arrow{background:#e8f8ef;color:#178b58;animation:v481ArrowNudge 1.25s ease-in-out infinite}.v481-inline-status.is-step1{background:#e7f5ff;color:#126f9f}.v481-inline-status.is-step2{background:#e9f8ef;color:#187449}@keyframes v481ArrowNudge{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}
    .v481-month-summary{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.v481-month-summary>span{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;background:#f2f6f9;color:#607687;font-size:10px;font-weight:800}.v481-month-summary .is-waiting{background:#fff7e8;color:#8a5a08}.v481-month-summary .is-pending{background:#eef6ff;color:#2b6795}.v481-month-summary .is-done{background:#eaf8ef;color:#23724a}
    .v481-step-no{display:inline-grid;place-items:center;flex:0 0 auto;width:22px;height:22px;border-radius:999px;background:rgba(255,255,255,.94);color:#1c6f9d;font-size:11px;font-weight:950}.v481-confirm-btn .v481-step-no{color:#197149}.v481-reminder-actions.is-step1 .v481-open-link .v481-step-no{color:#168fd3}.v481-reminder-actions.is-step2 .v481-confirm-btn .v481-step-no{color:#1d8d5f}.v481-month-status{display:grid;gap:2px;margin-top:2px;padding:7px 9px;border-radius:9px;font-size:10px}.v481-month-status b{font-size:10px}.v481-month-status span{font-size:9px}.v481-month-status.is-checked{background:#eaf8ef;color:#236d49}.v481-month-status.is-pending{background:#eef6ff;color:#2a628e}.v481-month-status.is-retry{background:#fff1ef;color:#a84438}.v481-reminder-item.tone-checked{border-color:#bfe2cc;background:#fbfffc}.v481-reminder-item.tone-checked .v481-compact-line{flex-wrap:nowrap}.v481-reminder-item.tone-pending{border-color:#c8dff0;background:#fbfdff}.v481-reminder-item.tone-retry{border-color:#f2c0ba;background:#fff9f8}
    .v481-clear{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;border:1px solid #d7ebde;border-radius:12px;background:#f7fcf9}.v481-clear>span{display:grid;place-items:center;width:25px;height:25px;border-radius:999px;background:#e2f5e8;color:#187745;font-weight:950}.v481-clear div{display:grid;gap:2px}.v481-clear b{font-size:11px;color:#37624a}.v481-clear small{font-size:9px;color:#789084}.v481-more,.v481-footnote{margin-top:8px;color:#788b9a;font-size:9px}.v481-footnote{border-top:1px dashed #e3ebf1;padding-top:7px}
    .v481-leave-form-note{display:grid!important;gap:7px;border-color:#bfe0f4!important;background:#f4fbff!important;color:#355c74!important}.v481-leave-form-note[hidden]{display:none!important}.v481-form-note-main{display:grid;gap:2px}.v481-form-note-main>b{color:#245d80}.v481-leave-form-note a{width:max-content;color:#1477b2;font-weight:850;text-decoration:none}.v481-form-vacation-rule>span{display:block;padding:7px 9px;border-radius:9px;font-size:11px;line-height:1.45}.v481-rule-ok{background:#eef9f2;color:#2e6e49}.v481-rule-warn{background:#fff7e8;color:#8b5a00}.v481-rule-danger{background:#fff0ef;color:#a43a32}.v481-rule-neutral{background:#f4f6f8;color:#647586}
    @media(max-width:820px){
      .v481-staff-hr-reminder{margin-bottom:12px}.v481-reminder-head{align-items:stretch;flex-direction:column;gap:8px}.v481-reminder-head h3{font-size:17px}.v481-reminder-head p{font-size:11px}.v481-head-link{width:100%;font-size:12px;padding:9px 10px}
      .v481-reminder-item{align-items:stretch;flex-direction:column;gap:7px;padding:9px 10px}.v481-compact-line{gap:5px;font-size:10px}.v481-compact-type{font-size:13px}.v481-period,.v481-vacation{font-size:9px}.v481-compact-date{font-size:10px}.v481-inline-status{font-size:9px;padding:4px 7px}.v481-reminder-rule{font-size:10px}.v481-reminder-actions{min-width:0;width:100%;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);gap:5px}.v481-open-link,.v481-confirm-btn{width:100%;font-size:11px;padding:9px 7px;min-height:56px}.v558-action-copy b{font-size:11px}.v558-action-copy small{font-size:8px}.v481-step-arrow{width:24px;height:24px;font-size:17px}.v481-clear b{font-size:12px}.v481-clear small,.v481-more,.v481-footnote{font-size:10px;line-height:1.4}.v481-month-summary>span{font-size:10px}.v481-month-status b{font-size:11px}.v481-month-status span{font-size:10px}.v481-step-no{width:20px;height:20px;font-size:11px}.v481-form-vacation-rule>span{font-size:11px}
    }
  `;document.head.appendChild(style);

  window.cnmiV481={version:VERSION,url:LEAVE_URL,actionableRows,panelHtml,markHrReported,updateLeaveFormNote};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v481-staff-hr-confirm-admin-pending.js", error); }
;

/* Original source: patch-v483-position-master-authoritative-nav-fix.js */
try {
/* CNMI Staff Planner V483
 * Position master authoritative display + mobile position navigation fix.
 *
 * Fixes:
 * 1) Dashboard room grouping must use EACH rendered position code, never array index pairing.
 * 2) Position popup metadata prefers the latest active daily_position_masters row saved in
 *    Admin > จัดการตำแหน่ง. Slot templates remain for head-count/template selection only.
 * 3) Mobile navigation to daily/monthly daytime-position pages is routed directly and
 *    refreshes daily_position_masters before rendering.
 *
 * No schema change.
 */
(function(){
  'use strict';
  const VERSION='V483_POSITION_MASTER_AUTHORITATIVE_NAV_FIX';
  if(window.__CNMI_V483_POSITION_MASTER_AUTHORITATIVE_NAV_FIX__)return;
  window.__CNMI_V483_POSITION_MASTER_AUTHORITATIVE_NAV_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{return sb||window.sb||null;}catch(_){return window.sb||null;}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return typeof normalizeDateKey==='function'?txt(normalizeDateKey(v)).slice(0,10):txt(v).slice(0,10);}catch(_){return txt(v).slice(0,10);}}
  function key(v){return txt(v).replace(/^OUTING:/i,'').toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');}
  function codeOf(row){return txt(row?.position_code||row?.code||row?.eligibility_code).replace(/^OUTING:/i,'');}
  function labelOf(row){const c=codeOf(row);try{return typeof positionLabelForCell==='function'?txt(positionLabelForCell(c))||c:c;}catch(_){return c;}}
  function active(row){return !!row&&row.is_active!==false&&!row.deleted_at;}
  function useful(v){const s=txt(v);return !!s&&!['-','--','—'].includes(s)&&!/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);}
  function dateValue(row){const s=txt(row?.updated_at||row?.created_at||'');const n=Date.parse(s);return Number.isFinite(n)?n:0;}

  let masterRefreshPromise=null;
  let masterRefreshedAt=0;
  async function refreshMasters(force=false){
    const client=DB();
    if(!client)return S()?.positionMasters||[];
    if(!force&&Date.now()-masterRefreshedAt<30000&&Array.isArray(S()?.positionMasters)&&S().positionMasters.length)return S().positionMasters;
    if(masterRefreshPromise)return masterRefreshPromise;
    masterRefreshPromise=(async()=>{
      try{
        let q=client.from('daily_position_masters').select('*').order('sort_order',{ascending:true}).order('code',{ascending:true});
        const res=await q;
        if(res?.error)throw res.error;
        if(S()){
          S().positionMasters=Array.isArray(res?.data)?res.data:[];
          S().positionMastersLoaded=true;
          S().positionMasterLoadError=null;
        }
        masterRefreshedAt=Date.now();
        return S()?.positionMasters||[];
      }catch(err){
        console.warn(`[${VERSION}] daily_position_masters refresh failed`,err);
        if(S())S().positionMasterLoadError=err?.message||String(err||'');
        return S()?.positionMasters||[];
      }finally{masterRefreshPromise=null;}
    })();
    return masterRefreshPromise;
  }

  function masterFor(code){
    const k=key(code);if(!k)return null;
    const pools=[];
    if(Array.isArray(S()?.positionMasters))pools.push(...S().positionMasters);
    if(Array.isArray(S()?.dailyPositionMasters))pools.push(...S().dailyPositionMasters);
    const exact=pools.filter(active).filter(r=>key(codeOf(r))===k||key(r?.eligibility_code)===k);
    if(!exact.length){
      try{const p=typeof positionByCode==='function'?positionByCode(code):null;if(active(p))return p;}catch(_){ }
      return null;
    }
    exact.sort((a,b)=>dateValue(b)-dateValue(a));
    return exact[0];
  }

  function authoritativeMeta(row,date){
    const c=codeOf(row);
    const master=masterFor(c)||{};
    let fallback={};
    try{fallback=window.cnmiV381?.__v483PreviousMetadata?.(row,date)||{};}catch(_){fallback={};}
    return {
      code:c,
      zone:useful(master?.zone)?txt(master.zone):(useful(row?.zone)?txt(row.zone):(useful(fallback?.zone)?txt(fallback.zone):'-')),
      break_time:useful(master?.break_time)?txt(master.break_time):(useful(row?.break_time)?txt(row.break_time):(useful(fallback?.break_time)?txt(fallback.break_time):'-')),
      main_rule:useful(master?.main_rule||master?.required_role)?txt(master.main_rule||master.required_role):(useful(row?.main_rule||row?.required_role)?txt(row.main_rule||row.required_role):(useful(fallback?.main_rule)?txt(fallback.main_rule):'-')),
      job_desc:useful(master?.job_desc||master?.description||master?.detail)?txt(master.job_desc||master.description||master.detail):(useful(row?.job_desc||row?.description)?txt(row.job_desc||row.description):(useful(fallback?.job_desc)?txt(fallback.job_desc):`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c||'ที่ได้รับมอบหมาย'}`)),
      sourceV483:Object.keys(master).length?'daily_position_masters':'daily_positions'
    };
  }

  // Override V381 metadata: latest saved master first. V479 previously preferred Slot Master,
  // which could be stale after the Admin edited the master catalog.
  function patchMetadataApi(){
    const api=window.cnmiV381;if(!api||api.__v483MasterPatched)return;
    const previous=typeof api.metadataFor==='function'?api.metadataFor.bind(api):null;
    api.__v483PreviousMetadata=previous;
    api.metadataFor=function(row,date){
      const c=codeOf(row),master=masterFor(c)||{};
      let old={};try{old=previous?previous(row,date)||{}:{};}catch(_){old={};}
      return {
        ...old,
        code:c||old.code,
        zone:useful(master?.zone)?txt(master.zone):(useful(row?.zone)?txt(row.zone):old.zone),
        break_time:useful(master?.break_time)?txt(master.break_time):(useful(row?.break_time)?txt(row.break_time):old.break_time),
        main_rule:useful(master?.main_rule||master?.required_role)?txt(master.main_rule||master.required_role):(useful(row?.main_rule||row?.required_role)?txt(row.main_rule||row.required_role):old.main_rule),
        job_desc:useful(master?.job_desc||master?.description||master?.detail)?txt(master.job_desc||master.description||master.detail):(useful(row?.job_desc||row?.description)?txt(row.job_desc||row.description):old.job_desc),
        sourceV483:Object.keys(master).length?'daily_position_masters':(old.sourceV479||old.sourceV381||'fallback')
      };
    };
    api.__v483MasterPatched=true;
  }
  patchMetadataApi();
  setTimeout(patchMetadataApi,250);
  setTimeout(patchMetadataApi,1200);

  const GROUPS=[
    {id:'specimen-issue',label:'Specimen & Issue',thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank',label:'Blood Bank',thai:'ตรวจ Donor / Immunohematology และเคสยาก'},
    {id:'component-prep',label:'Component Prep',thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room',label:'Donor Room',thai:'ห้องบริจาคโลหิต'},
    {id:'other',label:'อื่นๆ',thai:'ตำแหน่งอื่น'}
  ];
  function groupInfo(id){return GROUPS.find(g=>g.id===id)||GROUPS[4];}
  function roomGroup(code){
    try{const g=window.cnmiRoomGroupV474?.roomGroup?.(code);if(g)return g;}catch(_){ }
    const c=txt(code),k=key(c);
    if(/^dr-/i.test(c))return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2')return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4')return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport')return 'specimen-issue';
    if(/^bb-/i.test(c))return 'specimen-issue';
    return 'other';
  }
  function selectedDashboardDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.()||S()?.dashboardDateV443||'')||normDate(typeof todayStr==='function'?todayStr():'');}catch(_){return normDate(S()?.dashboardDateV443||'');}
  }
  function rowsForDate(date){
    try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return (S()?.positions||[]).filter(r=>normDate(r?.work_date)===date&&codeOf(r));}
  }
  function itemLabel(item){
    const title=txt(item?.getAttribute?.('title'));if(title)return title;
    const node=item?.querySelector?.('.v434-position-code');
    if(!node)return '';
    const first=Array.from(node.childNodes||[]).find(n=>n.nodeType===Node.TEXT_NODE&&txt(n.textContent));
    return txt(first?.textContent||node.textContent).replace(/\bi\s*$/,'').trim();
  }
  function rowForItem(item,date){
    const rows=rowsForDate(date),label=itemLabel(item),k=key(label);
    if(!rows.length)return null;
    let found=rows.find(r=>key(labelOf(r))===k||key(codeOf(r))===k);
    if(found)return found;
    const staffNode=item?.querySelector?.('.v434-position-staff .staff-color-pill,.v434-position-staff');
    const staffText=key(staffNode?.textContent||'');
    if(staffText){
      found=rows.find(r=>{
        const st=(S()?.staff||[]).find(x=>String(x?.id)===String(r?.staff_id));
        return st&&staffText.includes(key(st?.nickname||st?.full_name));
      });
    }
    return found||null;
  }
  function isVacant(item){return !!item?.querySelector?.('.v434-vacant-pill')||item?.classList?.contains('is-vacant');}
  function isOnLeave(item){return !!item?.classList?.contains('v445-has-leave');}
  function buildGroup(id,items){
    const g=groupInfo(id),total=items.length,assigned=items.filter(x=>!isVacant(x)).length,ready=items.filter(x=>!isVacant(x)&&!isOnLeave(x)).length;
    const sec=document.createElement('section');
    sec.className='v434-zone-group v471-room-group v483-room-group';sec.dataset.v471Group=id;sec.dataset.v483Group=id;
    sec.innerHTML=`<div class="v434-zone-head v471-room-head"><div class="v471-room-title"><b>${esc(g.label)}</b><small>${esc(g.thai)}</small></div><span class="v445-zone-count"><b>พร้อม ${ready}/${total}</b><small>จัด ${assigned}/${total}</small></span></div><div class="v434-position-grid"></div>`;
    const grid=sec.querySelector('.v434-position-grid');items.forEach(item=>grid.appendChild(item));return sec;
  }
  function fixDashboardCard(card,date){
    if(!card||!date||date<'2026-09-01')return;
    const holder=card.querySelector('.v434-groups');if(!holder)return;
    const items=Array.from(card.querySelectorAll('.v434-position-item'));if(!items.length)return;
    const buckets=new Map();
    items.forEach(item=>{
      const row=rowForItem(item,date);const code=codeOf(row)||itemLabel(item);const id=roomGroup(code);
      item.dataset.v483PositionCode=code;
      const node=item.querySelector('.v434-position-code');if(node){node.dataset.v483PositionCode=code;node.dataset.v483Date=date;}
      if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(item);
    });
    holder.innerHTML='';
    GROUPS.forEach(g=>{const list=buckets.get(g.id)||[];if(list.length)holder.appendChild(buildGroup(g.id,list));});
    card.dataset.v483Date=date;
    card.dataset.v483Authoritative='1';
  }
  function fixDashboard(root=document){const d=selectedDashboardDate();root.querySelectorAll?.('[data-v434-daytime-positions]').forEach(card=>fixDashboardCard(card,d));}

  // Popup: map by the actual item code, not by rendered-array index.
  function splitDuties(v){
    const source=txt(v).replace(/\r/g,'\n');if(!source)return[];
    let parts=source.split(/\n+|[•;]|,(?=\s|$)/).map(txt).filter(Boolean);
    if(parts.length<2)parts=source.split(/\s+และ(?=การ|งาน|ทำ|ตรวจ|รับ|บันทึก|ดูแล|แจ้ง|นำ|จ่าย|เตรียม|ปั่น)/).map(txt).filter(Boolean);
    return [...new Set((parts.length?parts:[source]).map(x=>x.replace(/^[\-–—•\s]+/,'').trim()).filter(Boolean))].slice(0,3);
  }
  function popupRow(code,date){const k=key(code);return rowsForDate(date).find(r=>key(codeOf(r))===k||key(labelOf(r))===k)||{position_code:code,work_date:date};}
  function displayGroup(code){return groupInfo(roomGroup(code));}
  function breakLabel(v){const s=txt(v)||'-';return /^\d{1,2}:\d{2}$/.test(s)?`${s} น.`:s;}
  function showSummary(code,date){
    const row=popupRow(code,date),meta=authoritativeMeta(row,date),g=displayGroup(code),duties=splitDuties(meta.job_desc);
    showModal(`<div class="v435-position-summary-modal v483-position-modal" data-v483-code="${esc(code)}" data-v483-date="${esc(date)}"><div class="v435-modal-heading"><div><h2>${esc(labelOf(row)||code)}</h2><span class="v435-zone-badge" data-v471-group="${esc(g.id)}">${esc(g.label)}</span></div></div><section class="v435-main-duty-box"><h3>หน้าที่หลัก</h3><ul>${duties.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="v435-break-row"><span>เวลาพัก</span><b>${esc(breakLabel(meta.break_time))}</b></div></section><button type="button" class="soft-btn v435-full-detail-btn" data-v483-full-detail>ดูคำอธิบายตำแหน่งฉบับเต็ม</button></div>`,{small:true});
  }
  function showFull(code,date){
    const row=popupRow(code,date),meta=authoritativeMeta(row,date),g=displayGroup(code);
    showModal(`<div class="v435-position-full-modal v483-position-modal" data-v483-code="${esc(code)}" data-v483-date="${esc(date)}"><div class="v435-modal-heading"><div><h2>${esc(labelOf(row)||code)}</h2><span class="v435-zone-badge" data-v471-group="${esc(g.id)}">${esc(g.label)}</span></div></div><div class="v435-full-meta-grid"><div><small>เวลาพัก</small><b>${esc(breakLabel(meta.break_time))}</b></div><div><small>ผู้ปฏิบัติหลัก / เงื่อนไข</small><b>${esc(meta.main_rule||'-')}</b></div></div><section class="v435-full-duty-box"><h3>รายละเอียดหน้าที่ที่ต้องทำ</h3><p>${esc(meta.job_desc||'-')}</p></section><button type="button" class="soft-btn v435-back-summary-btn" data-v483-back-summary>กลับหน้าที่หลัก</button></div>`,{small:true});
  }

  // Window capture runs before the older document-level V435 listener.
  window.addEventListener('click',event=>{
    const node=event.target?.closest?.('.v434-position-code[data-v435-position-open],.v434-position-code[data-v483-position-code]');
    if(node){
      const item=node.closest('.v434-position-item');const date=txt(node.dataset.v483Date)||selectedDashboardDate();const row=rowForItem(item,date);const code=codeOf(row)||txt(node.dataset.v483PositionCode)||itemLabel(item);
      if(code){event.preventDefault();event.stopImmediatePropagation();showSummary(code,date);return;}
    }
    const full=event.target?.closest?.('[data-v483-full-detail]');
    if(full){const modal=full.closest('.v483-position-modal');if(modal){event.preventDefault();event.stopImmediatePropagation();showFull(modal.dataset.v483Code,modal.dataset.v483Date);return;}}
    const back=event.target?.closest?.('[data-v483-back-summary]');
    if(back){const modal=back.closest('.v483-position-modal');if(modal){event.preventDefault();event.stopImmediatePropagation();showSummary(modal.dataset.v483Code,modal.dataset.v483Date);return;}}
  },true);
  window.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const node=event.target?.closest?.('.v434-position-code[data-v435-position-open],.v434-position-code[data-v483-position-code]');if(!node)return;
    const item=node.closest('.v434-position-item'),date=txt(node.dataset.v483Date)||selectedDashboardDate(),row=rowForItem(item,date),code=codeOf(row)||txt(node.dataset.v483PositionCode)||itemLabel(item);
    if(code){event.preventDefault();event.stopImmediatePropagation();showSummary(code,date);}
  },true);

  // Mobile route hardening for the two Staff position pages (+ Admin monthly page).
  let navigating=false;
  async function navigatePosition(page){
    if(navigating)return;navigating=true;
    try{
      if(S())S().page=page;
      const sidebar=document.getElementById('sidebar');if(sidebar)sidebar.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      await refreshMasters(true);
      try{if(typeof window.renderPage==='function')window.renderPage();else if(typeof renderPage==='function')renderPage();}catch(err){console.error(`[${VERSION}] render ${page}`,err);}
      window.scrollTo?.({top:0,left:0,behavior:'auto'});
    }finally{navigating=false;}
  }
  window.addEventListener('click',event=>{
    const nav=event.target?.closest?.('[data-page="positions"],[data-page="positionMonthView"],[data-page="positionMonth"],[data-nav="positions"]');
    if(!nav)return;
    let page=txt(nav.dataset.page||nav.dataset.nav);if(page==='positions'||page==='positionMonthView'||page==='positionMonth'){
      event.preventDefault();event.stopImmediatePropagation();navigatePosition(page);
    }
  },true);

  let queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patchMetadataApi();fixDashboard(document);});}
  const observer=new MutationObserver(queue);observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{refreshMasters(false).then(queue);queue();},{once:true});
  window.addEventListener('pageshow',()=>{refreshMasters(false).then(queue);});
  setTimeout(()=>refreshMasters(false).then(queue),500);

  const style=document.createElement('style');style.id='cnmi-v483-position-master-authoritative-nav-fix';style.textContent=`
    .v483-room-group[data-v483-group="specimen-issue"]{border-top-color:#60a5fa!important;background:#f8fbff!important}
    .v483-room-group[data-v483-group="blood-bank"]{border-top-color:#f59e0b!important;background:#fffdf8!important}
    .v483-room-group[data-v483-group="component-prep"]{border-top-color:#8b5cf6!important;background:#fcfaff!important}
    .v483-room-group[data-v483-group="donor-room"]{border-top-color:#22c55e!important;background:#f9fefb!important}
    @media(max-width:820px){.nav-btn[data-page="positions"],.nav-btn[data-page="positionMonthView"],.nav-btn[data-page="positionMonth"]{touch-action:manipulation;pointer-events:auto!important}}
  `;document.head.appendChild(style);

  window.cnmiV483={version:VERSION,refreshMasters,masterFor,authoritativeMeta,roomGroup,fixDashboard,navigatePosition};
  console.info(`[${VERSION}] loaded`);
})();

} catch (error) { console.error("[v569] patch-v483-position-master-authoritative-nav-fix.js", error); }
;
