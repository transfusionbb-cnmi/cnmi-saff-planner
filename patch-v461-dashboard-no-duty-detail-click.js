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
