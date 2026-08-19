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
