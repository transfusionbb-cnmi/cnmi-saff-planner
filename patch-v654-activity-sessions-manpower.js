/* CNMI Staff Planner V654 — activity sessions and real-time staffing.
 * Backward compatible with existing activity_events (no SQL migration).
 * Session details are versioned metadata in note, not a new DB field.
 * Only explicitly assigned participants are blocked during each session.
 */
(function(){
  'use strict';
  if(window.__CNMI_V654_ACTIVITY_SESSIONS__)return;
  window.__CNMI_V654_ACTIVITY_SESSIONS__=true;
  const MARKER=/\[\[CNMI-ACTIVITY-ROUNDS-V654:([^\]]*)\]\]/i;
  const ALL_MARKERS=/\[\[CNMI-ACTIVITY-ROUNDS-V654:[^\]]*\]\]\s*/gi;
  // Other UI components use the public cleaner to display activity notes.
  const previousClean=window.cnmiCleanActivityNote;
  window.cnmiCleanActivityNote=function(note){
    const clean=typeof previousClean==='function'?previousClean(note):safe(note);
    return String(clean||'').replace(ALL_MARKERS,'').trim();
  };
  const safe=v=>String(v??'');
  const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(safe(v).slice(0,10))?safe(v).slice(0,10):'';
  const hm=v=>/^\d{2}:\d{2}/.test(safe(v))?safe(v).slice(0,5):'';
  const minutes=v=>{const t=hm(v);if(!t)return null;const [h,m]=t.split(':').map(Number);return h<24&&m<60?h*60+m:null;};
  function stateNow(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function staff(){return (stateNow().staff||[]).filter(p=>p&&p.is_active!==false);}
  function normalizedSessions(row){
    if(!row?.note||!MARKER.test(safe(row.note)))return null;
    const m=safe(row.note).match(MARKER);
    try{
      const parsed=JSON.parse(decodeURIComponent(m[1]));
      if(!parsed||parsed.version!==1||!Array.isArray(parsed.sessions))return [];
      return parsed.sessions.slice(0,30).map(x=>({
        date:date(x.date),start:hm(x.start),end:hm(x.end),
        staff_ids:[...new Set((Array.isArray(x.staff_ids)?x.staff_ids:[]).map(String).filter(Boolean))]
      })).filter(x=>x.date&&minutes(x.start)!==null&&minutes(x.end)!==null&&minutes(x.end)>minutes(x.start));
    }catch(_){return [];}
  }
  function intervalsForPerson(a,id,selectedDate,fallback){
    const sessions=normalizedSessions(a);
    if(sessions===null)return fallback?[fallback]:[];
    return sessions.filter(s=>s.date===selectedDate&&s.staff_ids.includes(String(id)))
      .map(s=>[minutes(s.start),minutes(s.end)]);
  }
  function editingActivity(){
    const s=stateNow(),id=s.editingActivityId;
    return id?(s.activities||[]).find(x=>String(x.id)===String(id)):null;
  }
  function participantList(ids){
    const selected=new Set((ids||[]).map(String));
    return `<div class="v654-members">${staff().map(p=>{
      const name=safe(p.nickname||p.full_name||p.id);
      return `<label class="v654-member"><input type="checkbox" data-v654-member value="${esc(p.id)}" ${selected.has(String(p.id))?'checked':''}><span>${esc(name)}</span></label>`;
    }).join('')}</div>`;
  }
  function rowHtml(s,i){
    const d=s?.date||'',start=s?.start||'09:00',end=s?.end||'11:00';
    return `<article class="v654-round">
      <div class="v654-round-title"><strong>รอบที่ <span data-v654-round-number>${i+1}</span></strong><button type="button" class="ghost-btn" data-v654-remove>ลบรอบ</button></div>
      <div class="v654-time-grid"><label>วันที่ <input data-v654-date type="date" value="${esc(d)}"></label>
      <label>เริ่ม <input data-v654-start type="time" value="${esc(start)}"></label>
      <label>สิ้นสุด <input data-v654-end type="time" value="${esc(end)}"></label></div>
      <details class="v654-member-details" ${i===0?'open':''}><summary>ผู้เข้าร่วมรอบนี้ <b data-v654-count>0 คน</b></summary>${participantList(s?.staff_ids)}</details>
    </article>`;
  }
  function formRows(form){return [...form.querySelectorAll('.v654-round')];}
  function readRows(form){return formRows(form).map(el=>({
    date:date(el.querySelector('[data-v654-date]')?.value),
    start:hm(el.querySelector('[data-v654-start]')?.value),
    end:hm(el.querySelector('[data-v654-end]')?.value),
    staff_ids:[...el.querySelectorAll('[data-v654-member]:checked')].map(el=>String(el.value))
  }));}
  function isEnabled(form){return form?.querySelector('[data-v654-enabled]')?.checked===true;}
  function syncForm(form){
    const root=form?.querySelector('.v654-session-editor');if(!root)return;
    const active=isEnabled(form);root.classList.toggle('v654-active',active);
    root.querySelector('.v654-rounds-panel').hidden=!active;
    form.querySelector('.v518-participant-wrap')?.classList.toggle('v654-hidden-participants',active);
    const rows=readRows(form),names=[...new Set(rows.flatMap(x=>x.staff_ids))];
    const hint=root.querySelector('[data-v654-summary]');
    if(hint)hint.textContent=active?`${rows.length} รอบ • ผู้เข้าร่วมไม่ซ้ำ ${names.length} คน • ระบบคำนวณตามเวลาของแต่ละรอบ`:'ไม่แบ่งรอบ: ใช้รายชื่อและเวลาเดียวกันทั้งกิจกรรม';
    formRows(form).forEach((row,i)=>{
      const number=row.querySelector('[data-v654-round-number]');if(number)number.textContent=String(i+1);
      const count=row.querySelector('[data-v654-count]');if(count)count.textContent=`${row.querySelectorAll('[data-v654-member]:checked').length} คน`;
    });
    if(active){
      // Keep the legacy participants array in sync for FM-CNHR-002 and the activity list.
      form.querySelectorAll('input[name="participant_ids"]').forEach(input=>{
        input.checked=names.includes(String(input.value));input.required=false;input.setCustomValidity?.('');
      });
    }
  }
  function appendRound(form,s){
    const box=form?.querySelector('.v654-round-list');if(!box)return;
    const index=formRows(form).length;
    if(index>=20)return;
    box.insertAdjacentHTML('beforeend',rowHtml(s,index));syncForm(form);
  }
  function buildForm(html){
    if(typeof html!=='string'||!html||!html.includes('activityForm'))return html;
    const tpl=document.createElement('template');tpl.innerHTML=html;
    const form=tpl.content.querySelector('#activityForm');if(!form)return html;
    const originalNote=form.querySelector('textarea[name="note"]');
    if(originalNote)originalNote.textContent=safe(originalNote.value||originalNote.textContent).replace(ALL_MARKERS,'').trim();
    const existing=normalizedSessions(editingActivity());
    const section=document.createElement('section');section.className='v518-form-section v654-session-editor';
    section.innerHTML=`<div class="v518-section-head"><h4>เวลาเข้าร่วมกิจกรรม</h4><span>สำหรับอบรมหลายรอบหรือสลับคนทำงาน</span></div>
      <label class="v654-switch"><input type="checkbox" data-v654-enabled ${existing!==null?'checked':''}><span><b>แบ่งผู้เข้าร่วมเป็นรอบ</b><small>เลือกเวลาและรายชื่อแยกแต่ละรอบ เพื่อให้ Dashboard นับกำลังคนตามจริง</small></span></label>
      <p class="v654-summary" data-v654-summary></p>
      <div class="v654-rounds-panel" ${existing===null?'hidden':''}><div class="v654-round-list">${(existing||[]).map(rowHtml).join('')}</div>
      <button class="ghost-btn v654-add" type="button" data-v654-add>+ เพิ่มรอบ</button></div>`;
    const optional=form.querySelector('.v518-optional-section');
    if(optional)optional.before(section);else form.appendChild(section);
    const wrap=form.querySelector('.v518-participant-wrap');if(wrap&&existing!==null)wrap.classList.add('v654-hidden-participants');
    return tpl.innerHTML;
  }
  function prepare(form,note){
    const clean=safe(note).replace(ALL_MARKERS,'').trim();
    if(!isEnabled(form))return {note:clean,participants:null};
    const rows=readRows(form),startDate=date(form.querySelector('[name="start_date"]')?.value),endDate=date(form.querySelector('[name="end_date"]')?.value);
    const start=minutes(form.querySelector('[name="start_time"]')?.value),end=minutes(form.querySelector('[name="end_time"]')?.value);
    if(!rows.length)return {error:'กรุณาเพิ่มรอบกิจกรรมอย่างน้อย 1 รอบ'};
    if(rows.length>20)return {error:'รองรับไม่เกิน 20 รอบต่อกิจกรรม'};
    const union=new Set(),occupied=new Map();
    for(const [i,r] of rows.entries()){
      if(!r.date||r.date<startDate||r.date>endDate)return {error:`รอบที่ ${i+1}: วันที่ต้องอยู่ภายในช่วงกิจกรรม`};
      const a=minutes(r.start),b=minutes(r.end);
      if(a===null||b===null||b<=a)return {error:`รอบที่ ${i+1}: กรุณาระบุเวลาเริ่มและสิ้นสุดให้ถูกต้อง`};
      if((r.date===startDate&&start!==null&&a<start)||(r.date===endDate&&end!==null&&b>end))return {error:`รอบที่ ${i+1}: เวลาอยู่นอกช่วงกิจกรรมหลัก`};
      if(!r.staff_ids.length)return {error:`รอบที่ ${i+1}: กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน`};
      for(const id of r.staff_ids){
        union.add(id);const key=`${r.date}|${id}`;const seen=occupied.get(key)||[];
        if(seen.some(x=>a<x[1]&&b>x[0]))return {error:`รอบที่ ${i+1}: เจ้าหน้าที่คนเดียวกันมีรอบเวลาซ้อนกัน`};
        seen.push([a,b]);occupied.set(key,seen);
      }
    }
    const data={version:1,sessions:rows};
    const marker=`[[CNMI-ACTIVITY-ROUNDS-V654:${encodeURIComponent(JSON.stringify(data))}]]`;
    return {note:`${clean}${clean?'\n':''}${marker}`,participants:[...union]};
  }
  const prev=window.renderActivitiesPage||(typeof renderActivitiesPage==='function'?renderActivitiesPage:null);
  if(typeof prev==='function'){
    const wrapped=function renderActivitiesPageV654(){return buildForm(String(prev.apply(this,arguments)||''));};
    try{window.renderActivitiesPage=renderActivitiesPage=wrapped;}catch(_){window.renderActivitiesPage=wrapped;}
  }
  document.addEventListener('change',event=>{
    const el=event.target,form=el?.closest?.('#activityForm');if(!form||!form.querySelector('.v654-session-editor'))return;
    if(el.matches('[data-v654-enabled]')){
      if(el.checked&&!formRows(form).length){
        const selected=[...form.querySelectorAll('input[name="participant_ids"]:checked')].map(x=>x.value);
        appendRound(form,{date:date(form.querySelector('[name="start_date"]')?.value),start:hm(form.querySelector('[name="start_time"]')?.value)||'09:00',end:hm(form.querySelector('[name="end_time"]')?.value)||'11:00',staff_ids:selected});
      }
      syncForm(form);
    }else if(el.matches('[data-v654-member],[data-v654-date],[data-v654-start],[data-v654-end]'))syncForm(form);
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-v654-add],[data-v654-remove]');if(!el)return;
    const form=el.closest('#activityForm');if(!form)return;
    event.preventDefault();event.stopPropagation();
    if(el.matches('[data-v654-remove]'))el.closest('.v654-round')?.remove();
    else appendRound(form,{date:date(form.querySelector('[name="start_date"]')?.value),start:'13:00',end:'15:00',staff_ids:[]});
    syncForm(form);
  });
  // Capture before the legacy document-level submit handler. Avoid modifying the
  // production V652/V653 activity save code, so this patch is safe to overlay.
  window.addEventListener('submit',event=>{
    const form=event.target;if(form?.id!=='activityForm'||!form.querySelector('.v654-session-editor'))return;
    const textarea=form.querySelector('textarea[name="note"]');if(!textarea)return;
    const original=textarea.value;
    const draft=prepare(form,original);
    if(draft.error){
      event.preventDefault();event.stopImmediatePropagation();
      try{if(typeof showToast==='function')showToast(draft.error);else alert(draft.error);}catch(_){alert(draft.error);}
      return;
    }
    textarea.value=draft.note;
    if(Array.isArray(draft.participants)){
      const members=new Set(draft.participants.map(String));
      form.querySelectorAll('input[name="participant_ids"]').forEach(el=>{
        el.checked=members.has(String(el.value));el.required=false;el.setCustomValidity?.('');
      });
    }
    // The legacy handler reads FormData synchronously; restore the editor text
    // immediately afterwards, including after a failed network save.
    queueMicrotask(()=>{if(textarea.isConnected)textarea.value=original;});
  },true);

  // Recalculate only the dashboard manpower card against virtual per-session rows.
  // No changes to Supabase, activities stored in state, other dashboard widgets,
  // activity editing, or physician assignments are required.
  function dashboardDate(){
    try{return date(window.cnmiDashboardDateV443?.selectedDate?.())||date(stateNow().dashboardDateV443)||date(typeof todayStr==='function'?todayStr():'');}
    catch(_){return date(stateNow().dashboardDateV443)||new Date().toISOString().slice(0,10);}
  }
  function virtualActivities(rows,day){
    const out=[];
    for(const a of rows||[]){
      const sessions=normalizedSessions(a);
      if(sessions===null){out.push(a);continue;}
      sessions.forEach((r,i)=>{
        if(r.date!==day||!r.staff_ids.length)return;
        out.push({...a,id:`${a.id||''}::v654:${i}`,start_date:r.date,end_date:r.date,
          start_time:r.start,end_time:r.end,participant_ids:r.staff_ids,
          note:safe(a.note).replace(ALL_MARKERS,'').trim()});
      });
    }
    return out;
  }
  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV654(){
      const html=previousDashboard.apply(this,arguments);
      if(typeof html!=='string'||!html.includes('data-v562-manpower'))return html;
      const api=window.cnmiAvailabilityV562;
      if(!api?.manpowerCard)return html;
      const s=stateNow(),day=dashboardDate(),activities=s.activities;
      if(!Array.isArray(activities)||!activities.some(a=>normalizedSessions(a)!==null))return html;
      let newCard='';
      try{
        s.activities=virtualActivities(activities,day);
        newCard=api.manpowerCard(day).replace(/ไม่พร้อม (\d+) คน/g,'ติดกิจกรรมรวม $1 คน');
      }catch(err){console.warn('V654 manpower redraw',err);}
      finally{s.activities=activities;}
      if(!newCard)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const old=tpl.content.querySelector('[data-v562-manpower]');if(!old)return html;
        const replacement=document.createElement('template');replacement.innerHTML=newCard;
        old.replaceWith(replacement.content.firstElementChild);
        return tpl.innerHTML;
      }catch(err){console.warn('V654 manpower UI',err);return html;}
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // Initial member counts are hydrated without rebuilding the main form.
  function versionChip(){document.querySelectorAll('.v520-version-chip,.v542-version-chip').forEach(el=>{if(el.textContent!=='v654')el.textContent='v654';if(el.title!=='กิจกรรมแบ่งรอบและกำลังคนตามช่วงเวลา')el.title='กิจกรรมแบ่งรอบและกำลังคนตามช่วงเวลา';});}
  const mo=new MutationObserver(mutations=>{
    for(const m of mutations)for(const node of m.addedNodes){
      if(node.nodeType!==1)continue;
      const form=node.matches?.('#activityForm')?node:node.querySelector?.('#activityForm');
      if(form?.querySelector('.v654-session-editor'))syncForm(form);
    }
    versionChip();
  });
  function start(){mo.observe(document.getElementById('appView')||document.body,{childList:true,subtree:true});const form=document.querySelector('#activityForm');if(form)syncForm(form);versionChip();}
  window.addEventListener('pageshow',versionChip);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cnmiActivitySessionsV654={version:'654',parse:normalizedSessions,prepare,intervalsForPerson,readRows,virtualActivities};
  const style=document.createElement('style');style.id='v654-activity-style';style.textContent=`
    .v654-session-editor{border:1px solid #cae3f7!important;background:#f8fcff!important;border-radius:15px;padding:14px!important}
    .v654-session-editor .v518-section-head{margin-bottom:10px!important}
    .v654-switch{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:11px;background:white;border:1px solid #d8eaf5;cursor:pointer}
    .v654-switch input{width:18px;height:18px;flex:none}.v654-switch span{display:grid;gap:2px}.v654-switch b{font-size:14px}.v654-switch small{font-size:12px;color:#60798d}
    .v654-summary{font-size:12px;color:#4e7993;margin:7px 2px 5px}.v654-hidden-participants{display:none!important}
    .v654-round-list{display:grid;gap:10px}.v654-round{border:1px solid #d4e7f5;background:#fff;border-radius:12px;padding:11px;min-width:0}
    .v654-round-title{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:10px}
    .v654-time-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:8px}.v654-time-grid label{font-size:12px;display:grid;gap:5px;min-width:0}
    .v654-time-grid input{width:100%;min-width:0;box-sizing:border-box}.v654-member-details{margin-top:11px;border-top:1px solid #e2edf4;padding-top:9px}
    .v654-member-details summary{font-size:13px;font-weight:700;cursor:pointer}.v654-member-details summary b{color:#1879b4;font-weight:600}
    .v654-members{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px;margin-top:8px}
    .v654-member{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #dce8ee;border-radius:9px;cursor:pointer;font-size:12px}
    .v654-member:has(input:checked){background:#e8f6ff;border-color:#82c8ee}.v654-member input{margin:0;flex:none}
    .v654-add{margin-top:10px}.v654-rounds-panel[hidden]{display:none!important}
    @media(max-width:600px){.v654-time-grid{grid-template-columns:1fr 1fr}.v654-time-grid label:first-child{grid-column:1/-1}.v654-members{grid-template-columns:repeat(2,minmax(0,1fr))}.v654-session-editor{padding:10px!important}}
  `;document.head.appendChild(style);
  console.info('[V654_ACTIVITY_SESSIONS_MANPOWER] loaded');
})();
