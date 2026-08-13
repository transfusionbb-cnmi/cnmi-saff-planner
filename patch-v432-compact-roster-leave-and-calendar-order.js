/* CNMI Staff Planner V432
 * Compact monthly roster leave labels + chronological leave order in Calendar day popup.
 * Scope:
 *   - monthly roster table (web/mobile and image-export clone)
 *   - calendar event ordering for leave items only
 *   - NO dashboard changes
 * Export layout is tuned against the 31-day (maximum-width) month.
 */
(function(){
  'use strict';
  const VERSION='V432_COMPACT_ROSTER_LEAVE_CALENDAR_ORDER';
  if(window.__CNMI_V432_COMPACT_ROSTER_LEAVE_CALENDAR_ORDER__)return;
  window.__CNMI_V432_COMPACT_ROSTER_LEAVE_CALENDAR_ORDER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function actualLeave(row){
    if(!row)return false;
    try{if(typeof isLeaveEffective==='function'&&!isLeaveEffective(row))return false;}catch(_){}
    let t='';
    try{t=typeof leaveDisplayType==='function'?leaveDisplayType(row):String(row?.type||row?.leave_type||'').split(':::')[0].trim();}catch(_){t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveType(row){
    try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'ลา'):String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
    catch(_){return String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}
  }
  function shortType(row){
    const t=leaveType(row);
    const map={
      'ลาพักผ่อน':'พัก','ลาพักร้อน':'พัก','ลากิจ':'กิจ','ลาป่วย':'ป่วย','ลาคลอด':'คลอด',
      'ลาอุปสมบท':'บวช','ลาศึกษา':'ศึกษา','ลาฝึกอบรม':'อบรม','ลาอื่นๆ':'ลา','ลาอื่น':'ลา'
    };
    if(map[t])return map[t];
    const compact=t.replace(/^ลา\s*/,'').trim();
    return compact||'ลา';
  }
  function periodShort(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim();
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return '';
    if(/เช้า|morning/i.test(raw))return '½ช';
    if(/บ่าย|afternoon/i.test(raw))return '½บ';
    // Keep uncommon custom periods informative, but compact.
    const clock=raw.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if(clock)return `${clock[1]}–${clock[2]}`;
    return raw.length<=7?raw:raw.slice(0,7);
  }
  function rankFor(row,date){
    try{return Number(window.cnmiLeaveSequenceV431?.rankFor?.(row,date))||null;}catch(_){return null;}
  }
  function circled(rank){
    try{return window.cnmiLeaveSequenceV431?.circled?.(rank)||String(rank||'');}catch(_){return String(rank||'');}
  }
  function lateFor(row,date){
    try{return !!window.cnmiLateLeaveV430?.isLateLeaveForDate?.(row,date);}catch(_){return false;}
  }
  function activeLeave(staffId,date){
    try{return typeof activeLeaveRecordOn==='function'?activeLeaveRecordOn(staffId,date):null;}catch(_){return null;}
  }
  function rosterEnabled(st){
    try{return typeof isRosterEnabled==='function'?isRosterEnabled(st):true;}catch(_){return true;}
  }
  function monthDates(key){
    try{
      const rows=typeof scheduleMonthDates==='function'?scheduleMonthDates(String(key||'').slice(0,7)):[];
      return Array.isArray(rows)?rows.map(normDate).filter(Boolean):[];
    }catch(_){return [];}
  }
  function cellLeaveBadge(stack,row){
    if(!stack||!row)return null;
    let cls='';
    try{cls=typeof leaveCellClass==='function'?String(leaveCellClass(leaveType(row))||''):'';}catch(_){}
    if(cls){const hit=stack.querySelector(`.mini-status.${cls}`);if(hit)return hit;}
    return stack.querySelector('.mini-status');
  }
  function compactLabel(row,date){
    const rank=rankFor(row,date);
    const bits=[];
    if(rank)bits.push(circled(rank));
    bits.push(shortType(row));
    const p=periodShort(row);if(p)bits.push(p);
    return bits.filter(Boolean).join(' ');
  }
  function fullTitle(row,date){
    const rank=rankFor(row,date);
    const p=String(row?.leave_period||row?.period||'เต็มวัน').trim()||'เต็มวัน';
    const late=lateFor(row,date);
    return `${rank?`ลำดับลา ${rank} · `:''}${leaveType(row)} · ${p}${late?' · ลานอกตาราง':''}`;
  }

  // Monthly roster: one compact leave line, then duty pills beneath it.
  // Dashboard deliberately untouched.
  const oldRenderGridView=window.renderGridView||(typeof renderGridView==='function'?renderGridView:null);
  if(typeof oldRenderGridView==='function'){
    const wrappedGrid=function renderGridViewV432(staffList,assignments,key){
      let html=String(oldRenderGridView.apply(this,arguments)||'');
      const dates=monthDates(key||S().monthKey);
      if(!dates.length)return html;
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const table=tpl.content.querySelector('table.clean-schedule-grid,table#scheduleTable');
        if(!table)return html;
        const staff=(staffList||[]).filter(rosterEnabled);
        const bodyRows=[...table.querySelectorAll('tbody tr')];
        let hasLeave=false;
        bodyRows.forEach((tr,rowIndex)=>{
          const st=staff[rowIndex];if(!st)return;
          const cells=[...tr.children].slice(-dates.length);
          dates.forEach((date,i)=>{
            const cell=cells[i];if(!cell)return;
            const leave=activeLeave(st.id,date);
            if(!actualLeave(leave))return;
            hasLeave=true;
            const stack=cell.querySelector('.clean-cell-stack')||cell;
            // V431 used a separate line for the rank; V432 folds it into the leave label.
            stack.querySelectorAll('.v431-leave-rank-cell').forEach(n=>n.remove());
            // V430 text badge is replaced with an orange border on the leave pill.
            stack.querySelectorAll('.v430-late-leave-badge').forEach(n=>n.remove());
            const badge=cellLeaveBadge(stack,leave);
            if(!badge)return;
            const label=compactLabel(leave,date);
            badge.classList.add('v432-compact-leave');
            badge.classList.toggle('v432-late-compact',lateFor(leave,date));
            badge.setAttribute('title',fullTitle(leave,date));
            badge.setAttribute('aria-label',fullTitle(leave,date));
            badge.innerHTML=`<span class="v432-compact-leave-text">${esc(label)}</span>`;
          });
        });
        if(hasLeave&&!tpl.content.querySelector('.v432-roster-legend')){
          const legend=document.createElement('div');
          legend.className='v432-roster-legend';
          legend.innerHTML='<span>①②③… = ลำดับลา</span><span>กรอบส้ม = ลานอกตาราง</span><span>½ช = ครึ่งเช้า</span><span>½บ = ครึ่งบ่าย</span>';
          const gridWrap=table.closest('.table-wrap,.clean-grid-wrap')||table;
          gridWrap.insertAdjacentElement('afterend',legend);
        }
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn(`${VERSION} roster compact failed`,err);}
      return html;
    };
    try{window.renderGridView=renderGridView=wrappedGrid;}catch(_){window.renderGridView=wrappedGrid;}
  }

  // Calendar: preserve the existing event categories/positions, but sort leave rows occupying
  // the leave slots of each date by the original submission rank 1 -> 2 -> 3 -> ... .
  // This fixes the day popup without redesigning the Calendar UI.
  const oldCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof oldCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV432(){
      const rows=oldCollect.apply(this,arguments)||[];
      const out=Array.isArray(rows)?rows.slice():[];
      const byDate=new Map();
      out.forEach((e,index)=>{
        if(!e?.raw)return;
        const isNoDuty=String(e?.type||'')==='noduty'||String(e?.raw?.type||e?.raw?.leave_type||'').split(':::')[0].trim()==='ไม่รับเวร';
        if(!actualLeave(e.raw)&&!isNoDuty)return;
        const d=normDate(e.date);if(!d)return;
        // Actual leave is ordered 1..n; no-duty stays after actual leave rows.
        const rank=actualLeave(e.raw)?(Number(e.leaveRankV431)||rankFor(e.raw,d)||89999):(90000+index);
        if(!byDate.has(d))byDate.set(d,[]);
        byDate.get(d).push({index,event:e,rank});
      });
      byDate.forEach(items=>{
        if(items.length<2)return;
        const positions=items.map(x=>x.index).sort((a,b)=>a-b);
        const sorted=items.slice().sort((a,b)=>a.rank-b.rank||a.index-b.index).map(x=>x.event);
        positions.forEach((pos,i)=>{out[pos]=sorted[i];});
      });
      return out;
    };
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  const style=document.createElement('style');style.id='v432-compact-roster-style';style.textContent=`
    /* Web/mobile monthly roster */
    .clean-schedule-grid .v432-compact-leave{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:max-content!important;max-width:100%!important;min-height:0!important;padding:2px 5px!important;margin:0 auto!important;line-height:1.05!important;white-space:nowrap!important;font-size:11px!important;font-weight:900!important;box-sizing:border-box!important}
    .clean-schedule-grid .v432-compact-leave-text{display:block;white-space:nowrap;line-height:1.05}
    .clean-schedule-grid .v432-late-compact{border:1.5px solid #f59e0b!important;box-shadow:0 0 0 1px rgba(245,158,11,.13)!important}
    .clean-schedule-grid td.v430-late-leave-cell{box-shadow:none!important}
    .clean-schedule-grid .clean-cell-stack>.v430-late-leave-badge,.clean-schedule-grid .v431-leave-rank-cell{display:none!important}
    .v432-roster-legend{display:flex;flex-wrap:wrap;gap:5px 12px;align-items:center;margin:7px 2px 0;color:#61758a;font-size:10px;font-weight:750;line-height:1.25}
    .v432-roster-legend span{white-space:nowrap}
    @media(max-width:820px){
      .clean-schedule-grid .v432-compact-leave{font-size:10px!important;padding:2px 4px!important}
      .v432-roster-legend{font-size:9px;gap:4px 9px;margin-top:5px}
    }

    /* Image export: compact enough for the worst-case 31-day month while keeping all staff readable. */
    .schedule-export-clone .schedule-brand-header{display:flex!important;align-items:center!important;gap:8px!important;margin:2px 0 5px!important;padding:5px 8px!important;border-radius:10px!important;min-height:0!important}
    .schedule-export-clone .schedule-brand-logo-circle{width:42px!important;height:42px!important;border-width:2px!important;box-shadow:none!important}
    .schedule-export-clone .schedule-brand-logo-main{font-size:15px!important}.schedule-export-clone .schedule-brand-logo-sub{font-size:7px!important;margin-top:2px!important}
    .schedule-export-clone .schedule-brand-copy{display:flex!important;flex-direction:row!important;align-items:baseline!important;gap:7px!important;white-space:nowrap!important}
    .schedule-export-clone .schedule-brand-unit{font-size:11px!important}.schedule-export-clone .schedule-export-title{font-size:13px!important}.schedule-export-clone .schedule-export-subtitle{font-size:11px!important}
    .schedule-export-clone .clean-schedule-grid thead th{padding:3px 2px!important;font-size:10px!important;line-height:1.05!important}
    .schedule-export-clone .clean-schedule-grid tbody th,.schedule-export-clone .clean-schedule-grid tbody td{padding:2px!important;font-size:10px!important;line-height:1.05!important;vertical-align:middle!important}
    .schedule-export-clone .clean-schedule-grid tbody tr{height:34px!important}
    .schedule-export-clone .clean-cell-stack{gap:1px!important;min-height:30px!important;justify-content:center!important}
    .schedule-export-clone .clean-schedule-grid .v432-compact-leave{font-size:9px!important;padding:1px 3px!important;line-height:1!important}
    .schedule-export-clone .clean-schedule-grid .clean-shift-pill{font-size:9px!important;line-height:1!important;min-height:0!important;padding:2px 5px!important;margin:0 auto!important;border-radius:999px!important}
    .schedule-export-clone .clean-schedule-grid .muted{font-size:9px!important;line-height:1!important}
    .schedule-export-clone .v432-roster-legend{margin:4px 2px 0!important;font-size:9px!important;gap:3px 10px!important;line-height:1.1!important}
  `;document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();
