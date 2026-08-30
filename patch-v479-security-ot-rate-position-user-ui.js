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
