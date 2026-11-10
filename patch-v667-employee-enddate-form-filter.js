/* Staff Planner V667 | Employee end-date aware NEW-entry selection.
 * Does not remove historical leave, OT, published roster, snapshots, or staff profiles.
 * Keeps form options consistent with the employment period while allowing an existing
 * historical activity/leave record to retain an already saved participant.
 */
(function(){
  'use strict';
  if(window.__CNMI_V667_STAFF_ELIGIBILITY__)return;
  window.__CNMI_V667_STAFF_ELIGIBILITY__=true;
  const VERSION='V667_STAFF_END_DATE_SELECTION';
  const selectOriginal=new WeakMap();
  const falseValue=v=>v===false||v===0||/^(false|0|off|no)$/i.test(String(v??'').trim());
  const dateKey=v=>{const d=String(v||'').trim().slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:'';};
  const today=()=>{try{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const x=Object.fromEntries(p.map(z=>[z.type,z.value]));return `${x.year}-${x.month}-${x.day}`;}catch(_){return new Date().toISOString().slice(0,10);}};
  function stateSafe(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function staffRows(){return Array.isArray(stateSafe().staff)?stateSafe().staff:[];}
  function staffById(id){return staffRows().find(p=>String(p?.id||'')===String(id||''))||null;}
  function eligible(person,first,last){
    if(!person)return false;
    if(falseValue(person.is_active)||falseValue(person.active))return false;
    let start=dateKey(first)||today(),end=dateKey(last)||start;
    if(end<start) return false;
    const s=dateKey(person.employment_start_date),e=dateKey(person.employment_end_date);
    return (!s||start>=s)&&(!e||end<=e);
  }
  function formDates(form){
    const find=name=>dateKey(form.querySelector(`[name="${name}"]`)?.value);
    const first=find('start_date')||find('duty_date')||find('work_date')||today();
    const last=find('end_date')||first;
    return {first,last};
  }
  function isHistoricalEdit(form){
    const s=stateSafe();
    return (form.id==='activityForm'&&!!s.editingActivityId)||(form.id==='leaveForm'&&!!s.editingLeaveId);
  }
  function forms(root){
    const ids=['activityForm','leaveForm','attendanceAdminFormV180','otForm','v527ActivityForm'];
    return ids.map(id=>root.querySelector('#'+id)).filter(form=>form&&(
      form.id!=='otForm'||form.querySelector('select[name="staff_id"]')
    ));
  }
  function syncActivityCount(form){
    const wrap=form.querySelector('.v518-participant-wrap');if(!wrap)return;
    const checks=[...wrap.querySelectorAll('input[name="participant_ids"]')],picked=checks.filter(c=>c.checked&&!c.disabled);
    checks.forEach(x=>{x.required=false;try{x.setCustomValidity('');}catch(_){}});
    if(!picked.length){const first=checks.find(c=>!c.disabled);if(first)first.required=true;}
    const counter=wrap.querySelector('.v518-selected-count');if(counter)counter.textContent=`เลือกแล้ว ${picked.length} คน`;
    const chips=wrap.querySelector('.v518-selected-chips');
    if(chips){
      const names=picked.map(c=>({id:c.value,name:c.closest('label')?.querySelector('b')?.textContent||staffById(c.value)?.nickname||'-'}));
      const sig=names.map(x=>x.id).join('|');
      if(chips.dataset.v667Ids!==sig){
        chips.dataset.v667Ids=sig;
        if(!names.length){chips.innerHTML='<span class="v518-no-selection">ยังไม่ได้เลือกผู้เข้าร่วม</span>';}
        else{
          chips.replaceChildren(...names.map(x=>{const btn=document.createElement('button');btn.type='button';btn.className='v518-chip';btn.setAttribute('data-v518-chip-remove',x.id);btn.textContent=x.name+' ×';return btn;}));
        }
      }
    }
  }
  function updateCheckboxes(form,dates){
    let change=false;
    form.querySelectorAll('input[type="checkbox"][value]').forEach(check=>{
      const p=staffById(check.value);if(!p)return;
      const keepHistorical=isHistoricalEdit(form)&&check.checked;
      const ok=eligible(p,dates.first,dates.last)||keepHistorical;
      const label=check.closest('label')||check.parentElement;
      if(label){label.classList.toggle('v667-unavailable-staff',!ok);if(keepHistorical&&!eligible(p,dates.first,dates.last))label.title='รายชื่อในข้อมูลเดิม (พ้นสภาพแล้ว)';}
      if(!ok&&check.checked){check.checked=false;change=true;}
      if(check.disabled===ok)check.disabled=!ok;
    });
    if(form.id==='activityForm')syncActivityCount(form);
    if(form.id==='v527ActivityForm'){
      const el=form.querySelector('#v527SelectedCount');
      if(el)el.textContent=String(form.querySelectorAll('input[name="participants"]:checked:not(:disabled)').length);
    }
    return change;
  }
  function updateSelect(select,dates,edit){
    if(!selectOriginal.has(select))selectOriginal.set(select,[...select.options].map(o=>o.cloneNode(true)));
    const all=selectOriginal.get(select),value=select.value;
    const keep=all.filter(opt=>{
      const p=staffById(opt.value);
      return !p||eligible(p,dates.first,dates.last)||(edit&&opt.value===value);
    });
    if(!keep.some(o=>o.value==='')){const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='เลือกเจ้าหน้าที่';placeholder.disabled=true;keep.unshift(placeholder);}
    const desired=keep.map(o=>String(o.value)).join('|');
    const actual=[...select.options].map(o=>String(o.value)).join('|');
    if(actual===desired)return;
    select.replaceChildren(...keep.map(o=>o.cloneNode(true)));
    if(keep.some(o=>o.value===value))select.value=value;
    else select.value='';
  }
  function apply(){
    const root=document.getElementById('pageContent');if(!root)return;
    const page=String(stateSafe().page||'');
    if(page!=='activities'&&page!=='leave'&&page!=='ot'){
      if(page==='users')updateProfileWarning(root);
      return;
    }
    for(const form of forms(root)){
      const dates=formDates(form),edit=isHistoricalEdit(form);
      form.querySelectorAll('select[name="staff_id"],select[name="owner_id"]').forEach(sel=>updateSelect(sel,dates,edit));
      updateCheckboxes(form,dates);
    }
  }
  function updateProfileWarning(root){
    const row=root.querySelector('[data-staff-row]');if(!row)return;
    const end=dateKey(row.querySelector('[data-field="employment_end_date"]')?.value),active=row.querySelector('[data-field="is_active"]')?.value;
    let note=row.querySelector('.v667-profile-warning');
    if(end&&end<today()&&!falseValue(active)){
      if(!note){note=document.createElement('div');note.className='v667-profile-warning notice soft-notice';row.prepend(note);}
      note.textContent=`สิ้นสุดการใช้งาน ${end} แล้ว แต่ Active ยังเป็น true • เปลี่ยนเป็น false และบันทึกข้อมูล เพื่อปิดสถานะบัญชี (ประวัติย้อนหลังจะยังอยู่)`;
    }else note?.remove();
  }
  function validation(form){
    const d=formDates(form),invalid=[];
    form.querySelectorAll('select[name="staff_id"],select[name="owner_id"]').forEach(sel=>{
      const p=staffById(sel.value);
      if(p&&!eligible(p,d.first,d.last)&&!isHistoricalEdit(form))invalid.push(p.nickname||p.full_name||'เจ้าหน้าที่');
    });
    form.querySelectorAll('input[type="checkbox"][value]:checked').forEach(c=>{
      const p=staffById(c.value);
      if(p&&!eligible(p,d.first,d.last)&&!isHistoricalEdit(form))invalid.push(p.nickname||p.full_name||'เจ้าหน้าที่');
    });
    return [...new Set(invalid)];
  }
  function warn(message){try{if(typeof showToast==='function')return showToast(message,{tone:'error'});}catch(_){ }console.warn('['+VERSION+'] '+message);}
  // Run after normal render. No polling, no Supabase call, no global rewriting of staff rows.
  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof previousRender==='function'){
    const wrapped=function renderPageV667(){const result=previousRender.apply(this,arguments);apply();return result;};
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }
  document.addEventListener('change',e=>{
    const t=e.target;if(!t)return;
    if(t.closest?.('[data-staff-row]')&&['is_active','employment_end_date'].includes(String(t.dataset.field||''))){updateProfileWarning(document.getElementById('pageContent'));return;}
    const form=t.closest?.('form');if(!form)return;
    if(!['activityForm','leaveForm','attendanceAdminFormV180','otForm','v527ActivityForm'].includes(form.id))return;
    if(['start_date','end_date','duty_date','work_date'].includes(t.name))apply();
  },true);
  document.addEventListener('click',e=>{
    const t=e.target;
    if(t?.closest?.('[data-v518-select-all],[data-v527-select-all],[data-v518-reset-activity]')){
      // Previous handlers run in capture phase; keep the selected pool clean.
      apply();
    }
  },true);
  window.addEventListener('submit',e=>{
    const form=e.target;if(!form||!['activityForm','leaveForm','attendanceAdminFormV180','otForm','v527ActivityForm'].includes(form.id))return;
    const invalid=validation(form);
    if(invalid.length){e.preventDefault();e.stopImmediatePropagation();warn('ไม่สามารถบันทึกให้บุคลากรที่พ้นสภาพ/ไม่อยู่ในช่วงการจ้างงาน: '+invalid.join(', '));}
  },true);
  const css=document.createElement('style');css.id='v667-end-date-form-style';css.textContent='.v667-unavailable-staff{display:none!important}.v667-profile-warning{margin:10px 0;padding:10px 14px;border:1px solid #ebc47d;border-radius:10px;background:#fff8e8;color:#825b16;font-weight:600}';document.head.appendChild(css);
  window.cnmiStaffEligibilityV667={eligible,apply,formDates,today};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  console.info('['+VERSION+'] date-aware create-form eligibility enabled');
})();
