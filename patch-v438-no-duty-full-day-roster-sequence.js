/* CNMI Staff Planner V438
 * No-duty = full-day only + compact no-duty rank in monthly roster.
 * Scope:
 *   - hide/disable leave-period selector when type is "ไม่รับเวร"
 *   - force leave_period = "เต็มวัน" before save for no-duty rows
 *   - monthly roster shows ① ไม่รับ, ② ไม่รับ, ... using V436 original created_at sequence
 *   - leave sequence and no-duty sequence stay separate
 * No SQL/schema/query change.
 */
(function(){
  'use strict';
  const VERSION='V438_NO_DUTY_FULL_DAY_ROSTER_SEQUENCE';
  if(window.__CNMI_V438_NO_DUTY_FULL_DAY_ROSTER_SEQUENCE__)return;
  window.__CNMI_V438_NO_DUTY_FULL_DAY_ROSTER_SEQUENCE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function rowType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'').trim():String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  }
  function isNoDuty(rowOrType){
    if(rowOrType&&typeof rowOrType==='object')return rowType(rowOrType)==='ไม่รับเวร';
    return String(rowOrType||'').split(':::')[0].trim()==='ไม่รับเวร';
  }
  function rosterEnabled(st){try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}}
  function activeLeave(staffId,date){try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}}
  function monthDates(key){
    try{const rows=typeof scheduleMonthDates==='function'?scheduleMonthDates(String(key||'').slice(0,7)):[];return Array.isArray(rows)?rows.map(normDate).filter(Boolean):[];}
    catch(_){return [];}
  }
  function noDutyRank(row,date){
    try{return Number(window.cnmiNoDutySequenceV436?.rankFor?.(row,date))||null;}catch(_){return null;}
  }
  function circled(n){
    const v=Number(n)||0;
    const chars=['','①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
    return chars[v]||String(v||'');
  }

  /* ---------- Leave form: no-duty is always full day ---------- */
  function periodLabelOf(form){
    const select=form?.querySelector?.('select[name="leave_period"]');
    return select?.closest?.('label')||null;
  }
  function syncNoDutyPeriod(form){
    if(!form)return;
    const typeSel=form.querySelector('select[name="type"]');
    const periodSel=form.querySelector('select[name="leave_period"]');
    if(!typeSel||!periodSel)return;
    const noDuty=isNoDuty(typeSel.value);
    const label=periodLabelOf(form);
    if(noDuty){
      periodSel.value='เต็มวัน';
      periodSel.disabled=true;
      periodSel.setAttribute('data-v438-forced-full-day','true');
      if(label){label.hidden=true;label.classList.add('v438-no-duty-period-hidden');}
    }else{
      periodSel.disabled=false;
      periodSel.removeAttribute('data-v438-forced-full-day');
      if(label){label.hidden=false;label.classList.remove('v438-no-duty-period-hidden');}
    }
  }
  function decorateLeaveHtml(html){
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const form=tpl.content.querySelector('#leaveForm');
      if(!form)return html;
      const typeSel=form.querySelector('select[name="type"]');
      const periodSel=form.querySelector('select[name="leave_period"]');
      if(typeSel&&periodSel&&isNoDuty(typeSel.value)){
        periodSel.value='เต็มวัน';
        periodSel.disabled=true;
        periodSel.setAttribute('data-v438-forced-full-day','true');
        const label=periodSel.closest('label');if(label){label.hidden=true;label.classList.add('v438-no-duty-period-hidden');}
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] leave form decoration skipped`,err);return html;}
  }
  const oldLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof oldLeavePage==='function'){
    const wrappedLeave=function renderLeavePageV438(){return decorateLeaveHtml(oldLeavePage.apply(this,arguments));};
    try{window.renderLeavePage=renderLeavePage=wrappedLeave;}catch(_){window.renderLeavePage=wrappedLeave;}
  }

  document.addEventListener('change',event=>{
    const typeSel=event.target?.closest?.('#leaveForm select[name="type"]');
    if(!typeSel)return;
    syncNoDutyPeriod(typeSel.closest('#leaveForm'));
  },true);

  /* Last-line guard before the existing save code reads FormData. */
  const oldSaveLeave=window.saveLeave||(typeof saveLeave==='function'?saveLeave:null);
  if(typeof oldSaveLeave==='function'){
    const wrappedSave=async function saveLeaveV438(form){
      try{
        const typeSel=form?.querySelector?.('select[name="type"]');
        const periodSel=form?.querySelector?.('select[name="leave_period"]');
        if(typeSel&&periodSel&&isNoDuty(typeSel.value)){
          periodSel.disabled=false; // FormData now carries the forced value explicitly.
          periodSel.value='เต็มวัน';
        }
      }catch(_){ }
      return oldSaveLeave.apply(this,arguments);
    };
    try{window.saveLeave=saveLeave=wrappedSave;}catch(_){window.saveLeave=wrappedSave;}
  }

  /* ---------- Monthly roster: ① ไม่รับ / ② ไม่รับ / ... ---------- */
  function decorateRosterHtml(html,staffList,key){
    const dates=monthDates(key||S().monthKey);
    if(!dates.length)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const table=tpl.content.querySelector('table.clean-schedule-grid,table#scheduleTable');
      if(!table)return html;
      const staff=(staffList||[]).filter(rosterEnabled);
      const bodyRows=[...table.querySelectorAll('tbody tr')];
      let hasNoDuty=false;

      bodyRows.forEach((tr,rowIndex)=>{
        const st=staff[rowIndex];if(!st)return;
        const cells=[...tr.children].slice(-dates.length);
        dates.forEach((date,i)=>{
          const cell=cells[i];if(!cell)return;
          const row=activeLeave(st.id,date);
          if(!isNoDuty(row))return;
          hasNoDuty=true;
          const rank=noDutyRank(row,date);
          const label=`${rank?circled(rank)+' ':''}ไม่รับ`;
          const fullTitle=`${rank?`ลำดับไม่รับเวร ${rank} · `:''}ไม่รับเวร · เต็มวัน`;
          const stack=cell.querySelector('.clean-cell-stack')||cell;
          let badge=stack.querySelector('.mini-status.leave-no-duty');
          if(!badge){
            badge=[...stack.querySelectorAll('.mini-status')].find(n=>/ไม่รับเวร|ไม่รับ/.test(String(n.textContent||'')))||null;
          }
          if(!badge)return;
          badge.classList.add('v438-compact-no-duty');
          badge.setAttribute('title',fullTitle);
          badge.setAttribute('aria-label',fullTitle);
          badge.innerHTML=`<span class="v438-compact-no-duty-text">${esc(label)}</span>`;
          // Remove any old rank/helper line if an earlier patch added one in the cell.
          stack.querySelectorAll('.v436-calendar-noduty-rank,.v436-no-duty-rank-badge,[data-v436-no-duty-rank]').forEach(n=>{if(n!==badge)n.remove();});
        });
      });

      if(hasNoDuty){
        let legend=tpl.content.querySelector('.v432-roster-legend');
        if(!legend){
          legend=document.createElement('div');legend.className='v432-roster-legend';
          const gridWrap=table.closest('.table-wrap,.clean-grid-wrap')||table;
          gridWrap.insertAdjacentElement('afterend',legend);
        }
        if(!legend.querySelector('[data-v438-no-duty-legend]')){
          const item=document.createElement('span');
          item.setAttribute('data-v438-no-duty-legend','true');
          item.textContent='①②③… ไม่รับ = ลำดับไม่รับเวร (แยกจากลำดับลา)';
          legend.appendChild(item);
        }
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] roster decoration skipped`,err);return html;}
  }

  const oldGrid=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldGrid==='function'){
    const wrappedGrid=function renderGridViewV438(staffList,assignments,key){return decorateRosterHtml(oldGrid.apply(this,arguments),staffList,key);};
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v438-no-duty-full-day-roster';
  style.textContent=`
    #leaveForm .v438-no-duty-period-hidden{display:none!important}
    .clean-schedule-grid .v438-compact-no-duty{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:max-content!important;max-width:100%!important;min-height:0!important;padding:2px 5px!important;margin:0 auto!important;line-height:1.05!important;white-space:nowrap!important;font-size:11px!important;font-weight:900!important;box-sizing:border-box!important}
    .clean-schedule-grid .v438-compact-no-duty-text{display:block;white-space:nowrap;line-height:1.05}
    @media(max-width:820px){.clean-schedule-grid .v438-compact-no-duty{font-size:10px!important;padding:2px 4px!important}}
  `;
  document.head.appendChild(style);

  window.cnmiNoDutyFullDayV438={isNoDuty,noDutyRank,circled,syncNoDutyPeriod};
  console.info(`${VERSION} loaded`);
})();
