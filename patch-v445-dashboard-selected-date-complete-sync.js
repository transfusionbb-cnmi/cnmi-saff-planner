/* CNMI Staff Planner V445
 * Dashboard selected-date complete sync + restore daytime leave overlays.
 *
 * Fixes two visible regressions when browsing another date from V443/V444:
 * 1) Activities could show 0/empty because Dashboard reused only the preload cache.
 * 2) Daytime-position rows loaded correctly, but the old leave/HR/shortage presentation
 *    was not restored on the compact Dashboard card.
 *
 * Behavior:
 * - Read selected date directly from Supabase for leave/activity/roster/holiday rows.
 * - Merge only the selected date into local state, then let the existing Dashboard chain render.
 * - Keep V434/V435 visual structure and info buttons; only decorate assigned positions with
 *   leave period, HR status and shortage badges, plus ready/assigned summary.
 * - Read-only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V445_DASHBOARD_SELECTED_DATE_COMPLETE_SYNC';
  if(window.__CNMI_V445_DASHBOARD_SELECTED_DATE_COMPLETE_SYNC__)return;
  window.__CNMI_V445_DASHBOARD_SELECTED_DATE_COMPLETE_SYNC__=true;

  let trackedDate='';
  let serial=0;
  const loads=new Map(); // date -> {status,error,at,promise}

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.sb||window.supabaseClient||null;}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function selectedDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443);}catch(_){return norm(S().dashboardDateV443);}}
  function isDashboard(){return String(S().page||'')==='dashboard';}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function friendly(err){try{return typeof friendlyDbError==='function'?friendlyDbError(err):(err?.message||String(err||''));}catch(_){return err?.message||String(err||'');}}
  function inRange(row,date){
    const s=norm(row?.start_date),e=norm(row?.end_date||row?.start_date);
    return !!s&&s<=date&&e>=date;
  }
  function effective(row){try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(row):!['cancelled','ยกเลิก'].includes(String(row?.status||'').toLowerCase());}catch(_){return true;}}
  function actualLeave(row){
    if(!row||!effective(row))return false;
    const t=String(row?.type||row?.leave_type||'').split(':::')[0].trim();
    return !!t&&t!=='ไม่รับเวร';
  }
  function leaveFor(staffId,date){
    return (S().leaves||[]).find(r=>String(r?.staff_id||'')===String(staffId||'')&&actualLeave(r)&&inRange(r,date))||null;
  }
  function periodKind(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim().toLowerCase();
    if(/ครึ่งเช้า|morning/.test(raw))return 'morning';
    if(/ครึ่งบ่าย|afternoon/.test(raw))return 'afternoon';
    return 'full';
  }
  function periodLabel(row){
    const k=periodKind(row);
    return k==='morning'?'ลาครึ่งเช้า':k==='afternoon'?'ลาครึ่งบ่าย':'ลาทั้งวัน';
  }
  function shortageLabel(row){
    const k=periodKind(row);
    return k==='morning'?'⚠ ขาดช่วงเช้า':k==='afternoon'?'⚠ ขาดช่วงบ่าย':'⚠ ตำแหน่งขาด';
  }
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function hrChecked(row){
    try{return typeof isLeaveHrChecked==='function'?!!isLeaveHrChecked(row?.id):(S().hrChecks||[]).some(h=>String(h?.leave_request_id||'')===String(row?.id||'')&&String(h?.status||'')==='ตรวจสอบแล้ว');}
    catch(_){return false;}
  }
  function hrLabel(row){return hrChecked(row)?'✓ ตรวจ HR แล้ว':'รอตรวจ HR';}

  function replaceOverlap(key,date,rows,predicate){
    const st=S(),cur=Array.isArray(st[key])?st[key]:[];
    st[key]=cur.filter(x=>!predicate(x,date)).concat(Array.isArray(rows)?rows:[]);
  }
  function replaceSelectedDate(date,payload){
    replaceOverlap('activities',date,payload.activities,(r,d)=>inRange(r,d));
    replaceOverlap('leaves',date,payload.leaves,(r,d)=>inRange(r,d));
    replaceOverlap('rosterAssignments',date,payload.roster,(r,d)=>norm(r?.duty_date)===d);
    replaceOverlap('holidays',date,payload.holidays,(r,d)=>norm(r?.holiday_date)===d);
  }

  async function fetchSelectedDate(date){
    const db=DB();if(!db)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const [activities,leaves,roster,holidays]=await Promise.all([
      db.from('activity_events').select('*').lte('start_date',date).gte('end_date',date).order('start_date').order('start_time'),
      db.from('leave_requests').select('*').lte('start_date',date).gte('end_date',date).order('created_at',{ascending:true}),
      db.from('roster_assignments').select('*').eq('duty_date',date).order('duty_code'),
      db.from('public_holidays').select('*').eq('holiday_date',date).order('holiday_date')
    ]);
    const packs={activities,leaves,roster,holidays};
    for(const [name,res] of Object.entries(packs))if(res?.error)throw new Error(`${name}: ${friendly(res.error)}`);
    return {
      activities:activities.data||[],
      leaves:leaves.data||[],
      roster:roster.data||[],
      holidays:holidays.data||[]
    };
  }

  function rerenderIfCurrent(date){
    if(!isDashboard()||selectedDate()!==date)return;
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}catch(err){console.warn('[V445] rerender skipped',err);}
  }
  async function loadSelected(date,{force=false}={}){
    const d=norm(date);if(!d||!isDashboard())return false;
    const old=loads.get(d);
    if(old?.status==='loading'&&!force)return old.promise||false;
    const my=++serial;
    const rec={status:'loading',error:null,at:Date.now(),promise:null};
    loads.set(d,rec);
    rerenderIfCurrent(d);
    const promise=(async()=>{
      try{
        const payload=await fetchSelectedDate(d);
        if(my!==serial||!isDashboard()||selectedDate()!==d)return false;
        replaceSelectedDate(d,payload);
        loads.set(d,{status:'loaded',error:null,at:Date.now(),promise:null,activityCount:payload.activities.length,leaveCount:payload.leaves.length,rosterCount:payload.roster.length});
        rerenderIfCurrent(d);
        console.info(`${VERSION}: synchronized`,{date:d,activities:payload.activities.length,leaves:payload.leaves.length,roster:payload.roster.length});
        return true;
      }catch(err){
        if(my!==serial)return false;
        loads.set(d,{status:'error',error:friendly(err),at:Date.now(),promise:null});
        console.error(`${VERSION}: load failed`,err);
        rerenderIfCurrent(d);
        return false;
      }
    })();
    rec.promise=promise;
    return promise;
  }

  function rowsForDate(date){
    try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return [];}
  }
  function zoneOf(row){try{return window.cnmiDashboardPositionsV434?.zoneOf?.(row)||String(row?.zone||'');}catch(_){return String(row?.zone||'');}}
  function decoratePositionCard(root,date){
    const card=root.querySelector?.('[data-v434-daytime-positions]');
    if(!card)return;
    const rows=rowsForDate(date);
    if(!rows.length)return;
    const items=[...card.querySelectorAll('.v434-position-item')];
    const byZone=new Map();
    let assigned=0,leaveCount=0;

    rows.forEach((row,i)=>{
      const item=items[i];if(!item)return;
      item.querySelectorAll('.v445-position-leave-meta').forEach(n=>n.remove());
      item.classList.remove('v445-has-leave','v445-half-leave','v445-full-leave');
      const sid=row?.staff_id;
      if(sid)assigned++;
      const leave=sid?leaveFor(sid,date):null;
      const zone=zoneOf(row)||'อื่นๆ';
      if(!byZone.has(zone))byZone.set(zone,{total:0,assigned:0,leave:0});
      const z=byZone.get(zone);z.total++;if(sid)z.assigned++;
      if(!leave)return;
      leaveCount++;z.leave++;
      const kind=periodKind(leave);
      item.classList.add('v445-has-leave',kind==='full'?'v445-full-leave':'v445-half-leave');
      const meta=document.createElement('div');
      meta.className='v445-position-leave-meta';
      const hr=admin()?`<span class="v445-hr-pill ${hrChecked(leave)?'is-done':'is-pending'}">${esc(hrLabel(leave))}</span>`:'';
      meta.innerHTML=`<div class="v445-position-status-line"><span class="v445-leave-pill">${esc(periodLabel(leave))}</span>${hr}</div><div class="v445-shortage-pill">${esc(shortageLabel(leave))}</div>`;
      item.appendChild(meta);
    });

    const ready=Math.max(0,assigned-leaveCount);
    const summaries=card.querySelector('.v434-summary-badges');
    if(summaries){
      summaries.querySelectorAll('.v445-ready-badge,.v445-leave-count-badge').forEach(n=>n.remove());
      const complete=summaries.querySelector('.v434-complete-badge');
      if(complete&&/^ครบ\s/.test(String(complete.textContent||'').trim()))complete.textContent=String(complete.textContent||'').replace(/^ครบ\s*/,'จัดครบ ');
      summaries.insertAdjacentHTML('beforeend',`<span class="v445-ready-badge">พร้อมปฏิบัติงาน ${ready}/${rows.length}</span>${leaveCount?`<span class="v445-leave-count-badge">ลา ${leaveCount}</span>`:''}`);
    }

    const groups=[...card.querySelectorAll('.v434-zone-group')];
    groups.forEach(group=>{
      const name=String(group.querySelector('.v434-zone-head b')?.textContent||'').trim();
      const stat=byZone.get(name);if(!stat)return;
      const span=group.querySelector('.v434-zone-head span');if(!span)return;
      const readyZone=Math.max(0,stat.assigned-stat.leave);
      span.classList.add('v445-zone-count');
      span.innerHTML=`<b>พร้อม ${readyZone}/${stat.total}</b><small>จัด ${stat.assigned}/${stat.total}</small>`;
    });
  }

  function decorateActivityLoading(root,date){
    const load=loads.get(date);if(!load)return;
    const cards=[...root.querySelectorAll?.('.card')||[]];
    const activityCard=cards.find(c=>String(c.querySelector('h3')?.textContent||'').trim()==='กิจกรรม'||String(c.querySelector('h3')?.textContent||'').includes('กิจกรรมวันนี้'));
    const stat=[...root.querySelectorAll?.('.stat-card')||[]].find(c=>String(c.querySelector('.label')?.textContent||'').includes('กิจกรรม'));
    if(load.status==='loading'){
      if(stat?.querySelector('.num'))stat.querySelector('.num').textContent='…';
      const empty=activityCard?.querySelector('.empty-state');
      if(empty)empty.innerHTML='<span class="v445-activity-loading"><span class="v445-spinner"></span>กำลังโหลดกิจกรรม…</span>';
    }else if(load.status==='error'){
      const empty=activityCard?.querySelector('.empty-state');
      if(empty)empty.innerHTML=`<span class="v445-load-error">โหลดกิจกรรมไม่สำเร็จ<br><small>${esc(load.error||'กรุณาลองเลือกวันที่อีกครั้ง')}</small></span>`;
    }
  }

  function decorateHtml(html){
    if(!isDashboard())return html;
    const d=selectedDate();if(!d)return html;
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      decoratePositionCard(tpl.content,d);
      decorateActivityLoading(tpl.content,d);
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn('[V445] dashboard decoration skipped',err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV445(){return decorateHtml(String(oldDashboard.apply(this,arguments)||''));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV445(){
      const page=String(S().page||'');
      if(page!=='dashboard'){
        trackedDate='';serial++;
        return oldRenderPage.apply(this,arguments);
      }
      const d=selectedDate(),changed=!!d&&d!==trackedDate;
      if(changed){trackedDate=d;serial++;loads.set(d,{status:'loading',error:null,at:Date.now(),promise:null});}
      const out=oldRenderPage.apply(this,arguments);
      if(changed)queueMicrotask(()=>{if(isDashboard()&&selectedDate()===d)loadSelected(d,{force:true});});
      return out;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  queueMicrotask(()=>{
    if(!isDashboard())return;
    const d=selectedDate();if(!d)return;
    if(!trackedDate)trackedDate=d;
    if(!loads.has(d)){loads.set(d,{status:'loading',error:null,at:Date.now(),promise:null});loadSelected(d,{force:true});}
  });

  const style=document.createElement('style');style.id='cnmi-v445-dashboard-selected-date-complete-sync';style.textContent=`
    .v445-position-leave-meta{grid-column:1/-1;display:grid;gap:5px;margin-top:2px;min-width:0}
    .v445-position-status-line{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
    .v445-leave-pill,.v445-hr-pill,.v445-shortage-pill,.v445-ready-badge,.v445-leave-count-badge{display:inline-flex;align-items:center;width:max-content;max-width:100%;border-radius:999px;font-weight:900;line-height:1.15;white-space:nowrap}
    .v445-leave-pill{padding:4px 8px;background:#fff7ed;color:#b45309;border:1px solid #fdba74;font-size:10px}
    .v445-hr-pill{padding:4px 8px;font-size:9px}.v445-hr-pill.is-done{background:#ecfdf3;color:#067647}.v445-hr-pill.is-pending{background:#f2f4f7;color:#667085}
    .v445-shortage-pill{padding:4px 8px;background:#fff1f2;color:#b42318;font-size:10px}
    .v434-position-item.v445-has-leave{background:#fffaf5!important;border-color:#f3b25d!important;box-shadow:inset 4px 0 0 #f3b25d}
    .v434-position-item.v445-half-leave{background:#fffdf3!important;border-color:#e9c55c!important;box-shadow:inset 4px 0 0 #e9c55c}
    .v445-ready-badge{padding:5px 9px;background:#fff7e6;color:#9b5d00;border:1px solid #f4c76d;font-size:10px}
    .v445-leave-count-badge{padding:5px 9px;background:#fff1f0;color:#b42318;border:1px solid #ffc8c2;font-size:10px}
    .v445-zone-count{display:grid!important;justify-items:end;gap:1px;line-height:1.05!important}.v445-zone-count b{font-size:10px;color:#72879a}.v445-zone-count small{font-size:9px;color:#9aa9b6;font-weight:800}
    .v445-activity-loading{display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#66829a;font-weight:750}.v445-spinner{width:14px;height:14px;border:2px solid #b9d9ec;border-right-color:#2f91c8;border-radius:50%;animation:v445spin .8s linear infinite}.v445-load-error{color:#a85b5b}.v445-load-error small{color:#8799a9;font-size:10px}
    @keyframes v445spin{to{transform:rotate(360deg)}}
    @media(max-width:820px){
      .v445-position-leave-meta{gap:6px;margin-top:1px}.v445-leave-pill,.v445-shortage-pill{font-size:11px;padding:5px 9px}.v445-hr-pill{font-size:10px;padding:5px 8px}
      .v445-ready-badge,.v445-leave-count-badge{font-size:11px;padding:5px 9px}.v445-zone-count b{font-size:12px}.v445-zone-count small{font-size:10px}
      .v434-position-item.v445-has-leave{min-height:86px}
    }
  `;document.head.appendChild(style);

  window.cnmiDashboardSelectedDateV445={loadSelected,loads,selectedDate,leaveFor,decoratePositionCard};
  console.info(`${VERSION} loaded`);
})();
