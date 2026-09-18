/* CNMI Staff Planner V519 — Activity page freeze fix + V518 activity UX
   Scope:
   - "ผู้รับผิดชอบ" -> "ผู้บันทึก" for activity UI; recorder comes from the original creator/login and is read-only.
   - At least 1 participant is required for every activity.
   - Activity form is split into compact sections and made mobile-safe.
   - Participant search / select all / clear / selected chips.
   - Dashboard activity cards show recorder + created time and sort by created_at DESC.
   - No database/schema changes.
*/
(function(){
  'use strict';
  if (window.__CNMI_V519_ACTIVITY_RECORDER_UI__) return;
  window.__CNMI_V519_ACTIVITY_RECORDER_UI__ = true;

  const VERSION = 'V519_ACTIVITY_PAGE_FREEZE_FIX';
  const S = () => window.state || state;
  const esc = v => typeof escapeHtml === 'function'
    ? escapeHtml(v == null ? '' : String(v))
    : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentId = () => {
    try { return typeof currentStaffId === 'function' ? currentStaffId() : ''; }
    catch (_) { return ''; }
  };
  const nick = id => {
    try { return typeof staffNick === 'function' ? (staffNick(id) || '-') : '-'; }
    catch (_) { return '-'; }
  };
  const dateKey = v => String(v || '').slice(0,10);
  const activityInDate = (row,date) => {
    const d=dateKey(date), s=dateKey(row?.start_date), e=dateKey(row?.end_date || row?.start_date);
    return Boolean(d && s && e && d >= s && d <= e);
  };
  const selectedDate = () => {
    try { return dateKey(window.cnmiDashboardDateV443?.selectedDate?.()) || dateKey(S()?.dashboardDateV443) || dateKey(todayStr()); }
    catch (_) { return dateKey(S()?.dashboardDateV443) || new Date().toISOString().slice(0,10); }
  };
  const cleanNote = note => {
    try { if (typeof window.cnmiCleanActivityNote === 'function') return window.cnmiCleanActivityNote(note); }
    catch (_) {}
    return String(note || '')
      .replace(/\[\[FM-CNHR-002-ORGANIZER:[^\]]*\]\]\s*/ig,'')
      .replace(/\[\[FM-CNHR-002-BATCH:[^\]]*\]\]\s*/ig,'')
      .trim();
  };
  const fmtCreated = value => {
    if (!value) return '-';
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return '-';
    try {
      const date = new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'}).format(dt);
      const time = new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(dt);
      return `${date} เวลา ${time} น.`;
    } catch (_) { return String(value); }
  };
  const timeText = row => {
    const s=String(row?.start_time||'').slice(0,5), e=String(row?.end_time||'').slice(0,5);
    return s&&e ? `${s}–${e} น.` : (s ? `${s} น.` : 'ไม่ระบุเวลา');
  };

  function makeSection(title, subtitle, cls=''){
    const section=document.createElement('section');
    section.className=`v518-form-section ${cls}`.trim();
    section.innerHTML=`<div class="v518-section-head"><h4>${esc(title)}</h4>${subtitle?`<span>${esc(subtitle)}</span>`:''}</div><div class="v518-section-grid"></div>`;
    return section;
  }
  function fieldByName(form,name){ return form.querySelector(`[name="${name}"]`)?.closest('label') || null; }
  function participantWrap(form){
    return Array.from(form.children).find(el=>{
      const lab=el.querySelector?.('.field-label');
      return lab && String(lab.textContent||'').trim()==='ผู้เข้าร่วม';
    }) || form.querySelector('.v396-participants')?.parentElement || null;
  }
  function activityEditingRow(){
    const id=S()?.editingActivityId;
    if (!id) return null;
    return (S()?.activities||[]).find(x=>String(x.id)===String(id)) || null;
  }

  function enhanceParticipantMarkup(wrap){
    if(!wrap) return;
    wrap.classList.add('v518-participant-wrap');
    const label=wrap.querySelector('.field-label');
    if(label){
      label.innerHTML='ผู้เข้าร่วม <span class="v518-required">*</span>';
      label.insertAdjacentHTML('afterend',`<div class="v518-participant-tools">
        <input type="search" id="v518ParticipantSearch" placeholder="ค้นหาชื่อผู้เข้าร่วม" autocomplete="off">
        <button type="button" class="ghost-btn v518-tool-btn" data-v518-select-all>เลือกทั้งหมด</button>
        <button type="button" class="ghost-btn v518-tool-btn" data-v518-clear-all>ล้างทั้งหมด</button>
        <span class="v518-selected-count">เลือกแล้ว 0 คน</span>
      </div><div class="v518-selected-chips" aria-live="polite"></div>`);
    }
    wrap.querySelectorAll('.v396-participant').forEach(item=>{
      const name=String(item.querySelector('b')?.textContent||item.textContent||'').trim();
      const full=String(item.querySelector('small')?.textContent||'').trim();
      item.dataset.v518Search=`${name} ${full}`.toLowerCase();
    });
    syncParticipantState(wrap);
  }

  function syncParticipantState(scope=document){
    const wrap=scope.matches?.('.v518-participant-wrap') ? scope : scope.querySelector?.('.v518-participant-wrap');
    if(!wrap) return;
    const checks=[...wrap.querySelectorAll('input[name="participant_ids"]')];
    const checked=checks.filter(x=>x.checked);
    checks.forEach((x,i)=>{
      x.required = checked.length===0 && i===0;
      try { x.setCustomValidity(checked.length===0 && i===0 ? 'กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน' : ''); } catch(_) {}
    });
    const count=wrap.querySelector('.v518-selected-count');
    if(count) count.textContent=`เลือกแล้ว ${checked.length} คน`;
    const chips=wrap.querySelector('.v518-selected-chips');
    if(chips){
      chips.innerHTML=checked.length ? checked.map(input=>{
        const item=input.closest('.v396-participant');
        const name=String(item?.querySelector('b')?.textContent||nick(input.value)||'-').trim();
        return `<button type="button" class="v518-chip" data-v518-chip-remove="${esc(input.value)}">${esc(name)} <span aria-hidden="true">×</span></button>`;
      }).join('') : '<span class="v518-no-selection">ยังไม่ได้เลือกผู้เข้าร่วม</span>';
    }
  }

  function enhanceActivityListRecorder(root){
    const rows=[...(S()?.activityListRowsV398||[]), ...(S()?.activities||[])];
    const byId=new Map(rows.filter(Boolean).map(r=>[String(r.id),r]));
    root.querySelectorAll('.activity-row-card').forEach(card=>{
      const id=card.getAttribute('data-v487-activity-id')||'';
      const row=byId.get(String(id));
      const detail=[...card.querySelectorAll('.activity-row-detail')].find(x=>String(x.querySelector('span')?.textContent||'').trim()==='ผู้รับผิดชอบ');
      if(detail){
        const span=detail.querySelector('span'), b=detail.querySelector('b');
        if(span) span.textContent='ผู้บันทึก';
        if(b && row) b.textContent=nick(row.created_by || row.owner_id);
      }
    });
  }

  function redesignActivityForm(html){
    if(!html || typeof document==='undefined') return html;
    const tpl=document.createElement('template');
    tpl.innerHTML=String(html);
    const form=tpl.content.querySelector('#activityForm');
    if(!form) return html;
    form.classList.add('v518-activity-form');
    form.closest('.card')?.classList.add('v518-activity-entry-card');

    const editing=activityEditingRow();
    const recorderId=editing?.created_by || editing?.owner_id || currentId();
    const ownerValue=editing?.owner_id || editing?.created_by || currentId();
    const ownerSelect=form.querySelector('select[name="owner_id"]');
    if(ownerSelect){
      const oldLabel=ownerSelect.closest('label');
      if(oldLabel){
        const replacement=document.createElement('label');
        replacement.className='v518-recorder-field';
        replacement.innerHTML=`ผู้บันทึก<div class="v518-readonly-person"><span>${esc(nick(recorderId))}</span><small>${editing?'ผู้สร้างรายการเดิม':'ดึงจากผู้ที่ล็อกอินอัตโนมัติ'}</small></div><input type="hidden" name="owner_id" value="${esc(ownerValue)}">`;
        oldLabel.replaceWith(replacement);
      }
    }

    const basic=makeSection('ข้อมูลหลัก','กรอกเฉพาะข้อมูลที่ใช้ดูงานจริง','v518-basic-section');
    const basicGrid=basic.querySelector('.v518-section-grid');
    ['title','event_type','location','start_date','end_date','start_time','end_time'].forEach(name=>{
      const el=fieldByName(form,name); if(el) basicGrid.appendChild(el);
    });
    const dl=form.querySelector('#activityLocationList'); if(dl) basicGrid.appendChild(dl);

    const people=makeSection('ผู้เกี่ยวข้อง','ผู้เข้าร่วมอย่างน้อย 1 คน','v518-people-section');
    const peopleGrid=people.querySelector('.v518-section-grid');
    const recorder=form.querySelector('.v518-recorder-field'); if(recorder) peopleGrid.appendChild(recorder);
    const pWrap=participantWrap(form); if(pWrap){peopleGrid.appendChild(pWrap);enhanceParticipantMarkup(pWrap);}

    const optional=makeSection('ตัวเลือกเพิ่มเติม','ใช้เมื่อเกี่ยวข้องกับประวัติอบรมหรือไฟล์แนบ','v518-optional-section');
    const optionalGrid=optional.querySelector('.v518-section-grid');
    const training=form.querySelector('.v405-training-meta-grid');
    if(training){
      const trainingHint=training.querySelector('.v396-training-check small'); if(trainingHint) trainingHint.textContent='ใช้เมื่อกิจกรรมนี้ต้องเข้าประวัติอบรม';
      const orgHint=training.querySelector('.v405-organizer-field small'); if(orgHint) orgHint.remove();
      const batchHint=training.querySelector('.v408-batch-field small'); if(batchHint) batchHint.textContent='ไม่มีรุ่นให้ใส่ -';
      optionalGrid.appendChild(training);
    }
    const file=fieldByName(form,'file');
    if(file){
      file.querySelectorAll('small.hint,.v487-upload-hint').forEach((x,i)=>{ if(i===0) x.textContent='แนบได้หลายไฟล์'; else x.remove(); });
      optionalGrid.appendChild(file);
    }

    const detail=makeSection('รายละเอียดเพิ่มเติม','','v518-detail-section');
    const detailGrid=detail.querySelector('.v518-section-grid');
    const note=fieldByName(form,'note'); if(note) detailGrid.appendChild(note);

    const submit=form.querySelector('button[type="submit"]');
    const actions=document.createElement('div'); actions.className='v518-form-actions';
    if(!editing){
      const reset=document.createElement('button'); reset.type='button'; reset.className='ghost-btn'; reset.setAttribute('data-v518-reset-activity',''); reset.textContent='ล้างฟอร์ม'; actions.appendChild(reset);
    }
    if(submit){ submit.classList.remove('wide'); actions.appendChild(submit); }

    // Any remaining meaningful nodes (defensive compatibility) stay in the optional section.
    [...form.children].forEach(node=>{
      if([basic,people,optional,detail,actions].includes(node)) return;
      if(node.tagName==='DATALIST') return;
      optionalGrid.appendChild(node);
    });
    form.append(basic,people,optional,detail,actions);

    enhanceActivityListRecorder(tpl.content);
    return tpl.innerHTML;
  }

  const previousActivities=window.renderActivitiesPage || (typeof renderActivitiesPage==='function'?renderActivitiesPage:null);
  if(previousActivities){
    const wrapped=function renderActivitiesPageV518(){ return redesignActivityForm(previousActivities.apply(this,arguments)); };
    try { window.renderActivitiesPage=renderActivitiesPage=wrapped; } catch(_) { window.renderActivitiesPage=wrapped; }
  }

  function dashboardActivityHtml(row){
    const ids=Array.isArray(row?.participant_ids)?row.participant_ids:[];
    const names=ids.map(nick).filter(x=>x&&x!=='-');
    const recorder=nick(row?.created_by || row?.owner_id);
    const note=cleanNote(row?.note);
    const created=fmtCreated(row?.created_at);
    const type=row?.event_type||'อื่นๆ';
    let typeBadge='';
    try { typeBadge=typeof badge==='function' ? badge(type,typeof activityClass==='function'?activityClass(type):'blue') : `<span class="badge">${esc(type)}</span>`; }
    catch(_) { typeBadge=`<span class="badge">${esc(type)}</span>`; }
    return `<article class="v397-activity-item v518-dashboard-activity" data-v518-activity-id="${esc(row?.id||'')}">
      <div class="v518-activity-head"><div class="v518-activity-title"><b>${esc(row?.title||'-')}</b>${typeBadge}</div><span class="v518-created-rank">บันทึกล่าสุดก่อน</span></div>
      <div class="v518-activity-info"><span><strong>เวลา</strong>${esc(timeText(row))}</span><span><strong>สถานที่</strong>${esc(row?.location||'ไม่ระบุ')}</span></div>
      <div class="v397-detail-line"><strong>ผู้เข้าร่วม:</strong> ${esc(names.length?names.join(', '):'-')}</div>
      ${note?`<div class="v518-note-wrap"><div class="v397-detail-note v518-note-clamp">หมายเหตุ: ${esc(note)}</div><button type="button" class="v518-note-more" data-v518-note-toggle>ดูเพิ่มเติม</button></div>`:''}
      <div class="v518-activity-meta"><span><strong>ผู้บันทึก:</strong> ${esc(recorder)}</span><span><strong>บันทึกเมื่อ:</strong> ${esc(created)}</span></div>
    </article>`;
  }

  function decorateDashboard(html){
    if(!html || typeof document==='undefined') return html;
    const tpl=document.createElement('template'); tpl.innerHTML=String(html);
    let card=tpl.content.querySelector('.v401-dashboard-activity-card');
    if(!card){
      card=[...tpl.content.querySelectorAll('.card')].find(x=>/กิจกรรม/.test(String(x.querySelector('h3')?.textContent||''))) || null;
    }
    // V506 intentionally removes this card on weekends/public holidays; preserve that behavior.
    if(!card) return html;
    const date=selectedDate();
    const activities=(S()?.activities||[]).filter(x=>activityInDate(x,date)).sort((a,b)=>{
      const bt=Date.parse(b?.created_at||'')||0, at=Date.parse(a?.created_at||'')||0;
      if(bt!==at) return bt-at;
      return String(b?.id||'').localeCompare(String(a?.id||''));
    });
    const head=card.querySelector('.section-title');
    if(head){
      const h3=head.querySelector('h3'); if(h3) h3.textContent='กิจกรรมวันนี้';
      const hint=head.querySelector('.hint,span'); if(hint) hint.textContent='รายการที่บันทึกล่าสุดอยู่ด้านบน';
    }
    [...card.children].forEach(child=>{if(!child.classList?.contains('section-title')) child.remove();});
    const body=document.createElement('div');
    body.className='v397-today-list v518-dashboard-activity-list';
    if(activities.length) body.innerHTML=activities.map(dashboardActivityHtml).join('');
    else {
      try { body.innerHTML=typeof empty==='function'?empty('วันนี้ไม่มีกิจกรรม'):'<div class="empty">วันนี้ไม่มีกิจกรรม</div>'; }
      catch(_) { body.innerHTML='<div class="empty">วันนี้ไม่มีกิจกรรม</div>'; }
    }
    card.appendChild(body);
    return tpl.innerHTML;
  }

  const previousDashboard=window.renderDashboard || (typeof renderDashboard==='function'?renderDashboard:null);
  if(previousDashboard){
    const wrapped=function renderDashboardV518(){ return decorateDashboard(previousDashboard.apply(this,arguments)); };
    try { window.renderDashboard=renderDashboard=wrapped; } catch(_) { window.renderDashboard=wrapped; }
  }

  function showParticipantWarning(form){
    try { if(typeof showToast==='function') showToast('กรุณาเลือกผู้เข้าร่วมอย่างน้อย 1 คน',{tone:'error'}); } catch(_) {}
    const search=form.querySelector('#v518ParticipantSearch');
    if(search){ search.focus(); search.scrollIntoView({behavior:'smooth',block:'center'}); }
  }

  document.addEventListener('click',e=>{
    const selectAll=e.target.closest('[data-v518-select-all]');
    if(selectAll){
      const wrap=selectAll.closest('.v518-participant-wrap');
      wrap?.querySelectorAll('input[name="participant_ids"]').forEach(x=>{x.checked=true;});
      syncParticipantState(wrap); return;
    }
    const clear=e.target.closest('[data-v518-clear-all]');
    if(clear){
      const wrap=clear.closest('.v518-participant-wrap');
      wrap?.querySelectorAll('input[name="participant_ids"]').forEach(x=>{x.checked=false;});
      syncParticipantState(wrap); return;
    }
    const chip=e.target.closest('[data-v518-chip-remove]');
    if(chip){
      const wrap=chip.closest('.v518-participant-wrap');
      const id=chip.getAttribute('data-v518-chip-remove');
      const input=[...wrap.querySelectorAll('input[name="participant_ids"]')].find(x=>String(x.value)===String(id));
      if(input) input.checked=false;
      syncParticipantState(wrap); return;
    }
    const reset=e.target.closest('[data-v518-reset-activity]');
    if(reset){
      const form=reset.closest('#activityForm'); if(!form) return;
      form.reset();
      const today=(()=>{try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}})();
      const sd=form.querySelector('[name="start_date"]'), ed=form.querySelector('[name="end_date"]');
      if(sd) sd.value=today; if(ed) ed.value=today;
      form.querySelectorAll('input[name="participant_ids"]').forEach(x=>x.checked=false);
      const owner=form.querySelector('input[name="owner_id"]'); if(owner) owner.value=currentId();
      const include=form.querySelector('[name="include_fm_cnhr_002"]'); if(include){include.checked=false;include.dispatchEvent(new Event('change',{bubbles:true}));}
      syncParticipantState(form); return;
    }
    const noteToggle=e.target.closest('[data-v518-note-toggle]');
    if(noteToggle){
      const wrap=noteToggle.closest('.v518-note-wrap'), note=wrap?.querySelector('.v518-note-clamp');
      if(!note) return;
      const expanded=note.classList.toggle('is-expanded');
      noteToggle.textContent=expanded?'ย่อข้อความ':'ดูเพิ่มเติม'; return;
    }
    const submit=e.target.closest('#activityForm button[type="submit"]');
    if(submit){
      const form=submit.closest('#activityForm');
      const checked=form?.querySelectorAll('input[name="participant_ids"]:checked').length||0;
      if(!checked){ e.preventDefault(); e.stopImmediatePropagation(); showParticipantWarning(form); syncParticipantState(form); }
    }
  },true);

  document.addEventListener('input',e=>{
    if(e.target?.id!=='v518ParticipantSearch') return;
    const wrap=e.target.closest('.v518-participant-wrap');
    const q=String(e.target.value||'').trim().toLowerCase();
    wrap?.querySelectorAll('.v396-participant').forEach(item=>{item.hidden=Boolean(q && !String(item.dataset.v518Search||'').includes(q));});
  },true);

  document.addEventListener('change',e=>{
    if(e.target?.name==='participant_ids') syncParticipantState(e.target.closest('.v518-participant-wrap'));
  },true);

  // V519: observe only newly inserted page/card nodes.
  // Do NOT react to mutations created by syncParticipantState itself; V518 did that
  // and caused an endless observer -> chips.innerHTML -> observer loop.
  const observer=new MutationObserver(mutations=>{
    let hasActivityForm=false;
    let hasActivityNote=false;
    for(const mutation of mutations){
      for(const node of mutation.addedNodes || []){
        if(node?.nodeType!==1) continue;
        if(node.matches?.('#activityForm') || node.querySelector?.('#activityForm')) hasActivityForm=true;
        if(node.matches?.('.v518-note-wrap') || node.querySelector?.('.v518-note-wrap')) hasActivityNote=true;
        if(hasActivityForm && hasActivityNote) break;
      }
      if(hasActivityForm && hasActivityNote) break;
    }
    if(!hasActivityForm && !hasActivityNote) return;
    requestAnimationFrame(()=>{
      if(hasActivityForm){
        const form=document.querySelector('#activityForm');
        if(form) syncParticipantState(form);
      }
      if(hasActivityNote){
        document.querySelectorAll('.v518-note-wrap').forEach(wrap=>{
          const note=wrap.querySelector('.v518-note-clamp'), btn=wrap.querySelector('[data-v518-note-toggle]');
          if(!note||!btn) return;
          btn.hidden = note.scrollHeight <= note.clientHeight + 2 && !note.classList.contains('is-expanded');
        });
      }
    });
  });
  const startObserver=()=>observer.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startObserver,{once:true}); else startObserver();

  const style=document.createElement('style');
  style.id='cnmi-v518-activity-ui-style';
  style.textContent=`
    .v518-activity-entry-card{overflow:hidden}.v518-activity-form{display:block!important;min-width:0}.v518-form-section{margin:0 0 12px;padding:12px;border:1px solid #dbe7ef;border-radius:14px;background:#fff;min-width:0}.v518-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}.v518-section-head h4{margin:0;color:#23445d;font-size:.98rem}.v518-section-head span{color:#718698;font-size:.76rem;text-align:right}.v518-section-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0}.v518-section-grid>label,.v518-section-grid>div{min-width:0}.v518-section-grid .wide,.v518-participant-wrap,.v405-training-meta-grid,.v487-attachment-field{grid-column:1/-1}.v518-activity-form input,.v518-activity-form select,.v518-activity-form textarea{width:100%;max-width:100%;box-sizing:border-box}.v518-recorder-field{display:grid;gap:5px}.v518-readonly-person{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:42px;padding:8px 10px;border:1px solid #d9e4ed;border-radius:10px;background:#f7fafc;color:#24465f}.v518-readonly-person span{font-weight:800}.v518-readonly-person small{color:#738899;font-weight:400}.v518-required{color:#c63e52}.v518-participant-tools{display:grid;grid-template-columns:minmax(180px,1fr) auto auto auto;gap:7px;align-items:center;margin:7px 0}.v518-tool-btn{min-height:38px!important;padding:7px 10px!important;white-space:nowrap}.v518-selected-count{font-size:.78rem;font-weight:800;color:#47677f;white-space:nowrap}.v518-selected-chips{display:flex;gap:6px;flex-wrap:wrap;min-height:30px;margin:4px 0 8px}.v518-chip{border:1px solid #bcd9e9;background:#f0f9fe;color:#255675;border-radius:999px;padding:4px 9px;font:700 .78rem/1.2 inherit;cursor:pointer}.v518-no-selection{font-size:.78rem;color:#8093a2;padding:4px 0}.v518-participant-wrap .v396-participants{max-height:220px}.v518-participant-wrap .v396-participant[hidden]{display:none!important}.v518-optional-section .v405-training-meta-grid{grid-template-columns:minmax(220px,1.1fr) minmax(190px,1fr) minmax(150px,.72fr);gap:9px}.v518-optional-section .v396-training-check,.v518-optional-section .v405-training-field{padding:9px 10px}.v518-detail-section textarea{min-height:82px}.v518-form-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}.v518-form-actions button{min-width:126px}.v518-dashboard-activity-list{gap:10px}.v518-dashboard-activity{padding:12px 13px!important}.v518-activity-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.v518-activity-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}.v518-created-rank{font-size:.68rem;color:#7b8e9d;white-space:nowrap}.v518-activity-info{display:grid;grid-template-columns:minmax(120px,.6fr) minmax(160px,1fr);gap:8px;margin-top:8px}.v518-activity-info span{display:grid;gap:1px;padding:7px 8px;border-radius:9px;background:#f6fafc;color:#415b6f;font-size:.82rem;min-width:0}.v518-activity-info strong{font-size:.7rem;color:#708596}.v518-activity-meta{display:flex;gap:10px 18px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed #dbe6ed;color:#63798a;font-size:.76rem}.v518-note-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.v518-note-clamp.is-expanded{display:block;overflow:visible}.v518-note-more{display:block;margin:3px 0 0;padding:0;border:0;background:transparent;color:#277cae;font:700 .76rem/1.3 inherit;cursor:pointer}.v518-note-more[hidden]{display:none!important}
    @media(max-width:900px){.v518-optional-section .v405-training-meta-grid{grid-template-columns:1fr}.v518-participant-tools{grid-template-columns:minmax(0,1fr) auto auto}.v518-selected-count{grid-column:1/-1}}
    @media(max-width:760px){.v397-activities-layout{grid-template-columns:1fr!important}.v518-activity-entry-card{padding:12px!important}.v518-form-section{padding:10px;margin-bottom:10px;border-radius:12px}.v518-section-head{align-items:flex-start;flex-direction:column;gap:2px}.v518-section-head span{text-align:left}.v518-section-grid{grid-template-columns:1fr}.v518-section-grid .wide,.v518-participant-wrap,.v405-training-meta-grid,.v487-attachment-field{grid-column:auto}.v518-participant-tools{grid-template-columns:1fr 1fr}.v518-participant-tools input{grid-column:1/-1}.v518-selected-count{grid-column:1/-1}.v518-readonly-person{align-items:flex-start;flex-direction:column}.v518-form-actions{display:grid;grid-template-columns:1fr 1fr;position:sticky;bottom:max(0px,env(safe-area-inset-bottom));z-index:5;padding:8px 0 2px;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 28%)}.v518-form-actions button:only-child{grid-column:1/-1}.v518-form-actions button{width:100%;min-width:0}.v518-activity-head{display:block}.v518-created-rank{display:none}.v518-activity-info{grid-template-columns:1fr 1fr}.v518-dashboard-activity{overflow:hidden}.v518-activity-meta{display:grid;gap:4px}.activity-filter-grid,.activity-filter-search{min-width:0!important}.activity-list-card,.v397-all-activities{min-width:0;overflow:hidden}}
    @media(max-width:460px){.v518-activity-info{grid-template-columns:1fr}.v518-participant-tools{grid-template-columns:1fr 1fr}.v518-tool-btn{font-size:.78rem}.v518-activity-form .v396-participant{padding:7px}.v518-form-actions{gap:6px}.v518-form-actions button{font-size:.86rem}}
  `;
  document.head.appendChild(style);
  console.info(`[${VERSION}] loaded`);
})();
