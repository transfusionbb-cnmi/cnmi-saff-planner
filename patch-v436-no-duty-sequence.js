/* CNMI Staff Planner V436
 * No-duty sequence / ลำดับไม่รับเวร by the original submission timestamp.
 * Purpose:
 *   - keep leave sequence and no-duty sequence separate
 *   - show who submitted "ไม่รับเวร" #1, #2, #3 ... for each date
 *   - sort today's no-duty cards by the original submission time
 *   - show the sequence in Calendar detail and keep no-duty rows chronological
 *   - tapping the dashboard sequence badge shows the original submission timestamp
 * Historical/display-only: calculated from leave_requests.created_at; no schema/query/write change.
 */
(function(){
  'use strict';
  const VERSION='V436_NO_DUTY_SEQUENCE';
  if(window.__CNMI_V436_NO_DUTY_SEQUENCE__)return;
  window.__CNMI_V436_NO_DUTY_SEQUENCE__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function timeMs(v){const n=Date.parse(String(v||''));return Number.isFinite(n)?n:NaN;}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):String(row?.status||'active').toLowerCase()!=='cancelled';}catch(_){return true;}}
  function rowType(row){return String(row?.type||row?.leave_type||'').split(':::')[0].trim();}
  function noDuty(row){return !!row&&effective(row)&&rowType(row)==='ไม่รับเวร';}
  function overlaps(row,date){
    try{return typeof overlapsDate==='function'?overlapsDate(row,date):normDate(row?.start_date)<=date&&normDate(row?.end_date||row?.start_date)>=date;}
    catch(_){return false;}
  }
  function submittedMs(row){
    for(const v of [row?.created_at,row?.submitted_at,row?.requested_at,row?.createdAt]){
      const n=timeMs(v);if(Number.isFinite(n))return n;
    }
    const u=timeMs(row?.updated_at);return Number.isFinite(u)?u:Number.POSITIVE_INFINITY;
  }
  function staffOrder(id){
    const list=S().staff||[];
    const i=list.findIndex(x=>String(x?.id)===String(id));
    return i<0?99999:i;
  }
  function stableKey(row){return `${String(row?.id||'')}|${String(row?.staff_id||'')}`;}
  function staffNickSafe(id){try{return typeof staffNick==='function'?String(staffNick(id)||''):'';}catch(_){return '';}}

  function sequenceForDate(date){
    const d=normDate(date);if(!d)return [];
    const perStaff=new Map();
    (S().leaves||[]).forEach(row=>{
      if(!noDuty(row)||!overlaps(row,d))return;
      const sid=String(row?.staff_id||'');if(!sid)return;
      const existing=perStaff.get(sid);
      if(!existing||submittedMs(row)<submittedMs(existing))perStaff.set(sid,row);
    });
    const rows=[...perStaff.values()].sort((a,b)=>{
      const ta=submittedMs(a),tb=submittedMs(b);
      if(ta!==tb)return ta-tb;
      const oa=staffOrder(a?.staff_id),ob=staffOrder(b?.staff_id);
      if(oa!==ob)return oa-ob;
      return stableKey(a).localeCompare(stableKey(b),'th');
    });
    return rows.map((row,i)=>({
      row,
      rank:i+1,
      staff_id:String(row?.staff_id||''),
      submitted_ms:submittedMs(row)
    }));
  }
  function rankFor(row,date){
    if(!noDuty(row))return null;
    const sid=String(row?.staff_id||'');
    const hit=sequenceForDate(date).find(x=>x.staff_id===sid);
    return hit?hit.rank:null;
  }
  function submittedDateTime(row){
    const ms=submittedMs(row);
    if(!Number.isFinite(ms)||ms===Number.POSITIVE_INFINITY)return 'ไม่พบเวลาบันทึกเดิม';
    const d=new Date(ms);
    if(Number.isNaN(d.getTime()))return 'ไม่พบเวลาบันทึกเดิม';
    try{
      const date=d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
      const time=d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',hour12:false});
      return `${date} เวลา ${time} น.`;
    }catch(_){return d.toLocaleString();}
  }
  window.cnmiNoDutySequenceV436={sequenceForDate,rankFor,submittedMs,submittedDateTime};

  function today(){try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}}

  function decorateDashboardHtml(html){
    const date=today();
    const seq=sequenceForDate(date);
    if(!seq.length)return html;
    const byNick=new Map();
    seq.forEach(x=>{const nick=staffNickSafe(x.staff_id).trim();if(nick)byNick.set(nick,x);});
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const cards=[...tpl.content.querySelectorAll('.card')];
      const card=cards.find(c=>String(c.querySelector('h3')?.textContent||'').includes('ลา / ไม่รับเวรวันนี้'));
      const list=card?.querySelector('.v397-today-list');
      if(!card||!list)return html;

      const leaveItems=[];
      const noDutyItems=[];
      [...list.querySelectorAll(':scope > .v397-today-item')].forEach((item,index)=>{
        const isNoDuty=String(item.textContent||'').includes('ไม่รับเวร');
        if(!isNoDuty){leaveItems.push(item);return;}
        const nameEl=item.querySelector('b');
        const nick=String(nameEl?.textContent||'').trim();
        const hit=byNick.get(nick);
        const rank=hit?.rank||null;
        item.dataset.v436OriginalOrder=String(index);
        item.dataset.v436NoDutyRank=rank?String(rank):'';
        if(rank&&nameEl&&!item.querySelector('.v436-no-duty-rank-badge')){
          nameEl.insertAdjacentHTML('afterend',` <button type="button" class="v436-no-duty-rank-badge" data-v436-no-duty-rank="${rank}" data-v436-date="${esc(date)}" data-v436-staff="${esc(hit.staff_id)}" title="แตะดูเวลาที่บันทึกครั้งแรก">ลำดับไม่รับเวร ${rank}</button>`);
        }
        noDutyItems.push(item);
      });

      noDutyItems.sort((a,b)=>{
        const ar=Number(a.dataset.v436NoDutyRank||99999),br=Number(b.dataset.v436NoDutyRank||99999);
        if(ar!==br)return ar-br;
        return Number(a.dataset.v436OriginalOrder||0)-Number(b.dataset.v436OriginalOrder||0);
      });
      [...leaveItems,...noDutyItems].forEach(x=>list.appendChild(x));

      const help=card.querySelector('.v431-rank-help');
      if(help)help.textContent='ลำดับลาและลำดับไม่รับเวร แยกกัน เรียงตามเวลาที่บันทึกครั้งแรก';
      else{
        const title=card.querySelector('.section-title');
        if(title&&!card.querySelector('.v436-rank-help'))title.insertAdjacentHTML('afterend','<div class="v431-rank-help v436-rank-help">ลำดับลาและลำดับไม่รับเวร แยกกัน เรียงตามเวลาที่บันทึกครั้งแรก</div>');
      }

      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){console.warn(`[${VERSION}] dashboard decoration skipped`,err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV436(){return decorateDashboardHtml(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  // Calendar: prefix no-duty titles with #rank and order no-duty rows by their own sequence.
  const oldCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof oldCollect==='function'){
    const wrappedCollect=function collectCalendarEventsV436(){
      const rows=oldCollect.apply(this,arguments)||[];
      const out=Array.isArray(rows)?rows.map(e=>{
        const isNoDuty=String(e?.type||'')==='noduty'||noDuty(e?.raw);
        if(!isNoDuty||!e?.raw||!e?.date)return e;
        const rank=rankFor(e.raw,e.date);if(!rank)return e;
        let title=String(e.title||'');
        title=title.replace(/^#\d+\s+/,'');
        return {...e,noDutyRankV436:rank,title:`#${rank} ${title}`};
      }):[];

      const byDate=new Map();
      out.forEach((e,index)=>{
        if(!e?.raw)return;
        const isActualLeave=(function(){
          try{return typeof window.cnmiLeaveSequenceV431?.rankFor==='function'&&rowType(e.raw)!=='ไม่รับเวร'&&!!window.cnmiLeaveSequenceV431.rankFor(e.raw,e.date);}catch(_){return false;}
        })();
        const isND=String(e?.type||'')==='noduty'||noDuty(e?.raw);
        if(!isActualLeave&&!isND)return;
        const d=normDate(e.date);if(!d)return;
        let group=2,rank=99999;
        if(isActualLeave){group=0;rank=Number(e.leaveRankV431)||Number(window.cnmiLeaveSequenceV431?.rankFor?.(e.raw,d))||89999;}
        else if(isND){group=1;rank=Number(e.noDutyRankV436)||rankFor(e.raw,d)||89999;}
        if(!byDate.has(d))byDate.set(d,[]);
        byDate.get(d).push({index,event:e,group,rank});
      });
      byDate.forEach(items=>{
        if(items.length<2)return;
        const positions=items.map(x=>x.index).sort((a,b)=>a-b);
        const sorted=items.slice().sort((a,b)=>a.group-b.group||a.rank-b.rank||a.index-b.index).map(x=>x.event);
        positions.forEach((pos,i)=>{out[pos]=sorted[i];});
      });
      return out;
    };
    try{window.collectCalendarEvents=collectCalendarEvents=wrappedCollect;}catch(_){window.collectCalendarEvents=wrappedCollect;}
  }

  const oldCalendarDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof oldCalendarDetail==='function'){
    const wrappedDetail=function calendarEventDetailV436(e){
      const base=String(oldCalendarDetail.apply(this,arguments)||'');
      const isND=String(e?.type||'')==='noduty'||noDuty(e?.raw);
      if(!isND||!e?.raw||!e?.date)return base;
      const rank=Number(e?.noDutyRankV436)||rankFor(e.raw,e.date);
      if(!rank)return base;
      return `<br><button type="button" class="v436-calendar-noduty-rank" data-v436-no-duty-rank="${rank}" data-v436-date="${esc(normDate(e.date))}" data-v436-staff="${esc(String(e.raw.staff_id||''))}">ลำดับไม่รับเวร ${rank}</button>${base}`;
    };
    try{window.calendarEventDetail=calendarEventDetail=wrappedDetail;}catch(_){window.calendarEventDetail=wrappedDetail;}
  }

  function showRankDetail(date,staffId){
    const hit=sequenceForDate(date).find(x=>String(x.staff_id)===String(staffId));
    if(!hit)return;
    const nick=staffNickSafe(hit.staff_id)||'-';
    const requested=(()=>{try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}})();
    const submitted=submittedDateTime(hit.row);
    const modalHtml=`
      <div class="v436-rank-detail-modal">
        <div class="v436-rank-detail-head">
          <span class="v436-rank-detail-number">${hit.rank}</span>
          <div><h2>ลำดับไม่รับเวร ${hit.rank}</h2><p>${esc(nick)}</p></div>
        </div>
        <div class="v436-rank-detail-grid">
          <div><small>วันที่ไม่รับเวร</small><b>${esc(requested)}</b></div>
          <div><small>บันทึกครั้งแรก</small><b>${esc(submitted)}</b></div>
        </div>
        <p class="v436-rank-detail-note">ลำดับนี้อ้างอิงเวลาบันทึกครั้งแรกของรายการ ไม่เปลี่ยนเมื่อกลับมาแก้หมายเหตุภายหลัง</p>
      </div>`;
    try{if(typeof showModal==='function')showModal(modalHtml,{small:true});}
    catch(_){ }
  }

  document.addEventListener('click',event=>{
    const badge=event.target?.closest?.('[data-v436-no-duty-rank]');
    if(!badge)return;
    event.preventDefault();event.stopPropagation();
    const date=normDate(badge.dataset.v436Date)||today();
    const staffId=String(badge.dataset.v436Staff||'');
    if(staffId)showRankDetail(date,staffId);
  },true);

  const style=document.createElement('style');
  style.id='cnmi-v436-no-duty-sequence';
  style.textContent=`
    .v436-no-duty-rank-badge,.v436-calendar-noduty-rank{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;padding:2px 7px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#475569;font:inherit;font-size:10px;font-weight:900;line-height:1.25;white-space:nowrap;cursor:pointer;touch-action:manipulation;vertical-align:middle}
    .v436-no-duty-rank-badge:hover,.v436-calendar-noduty-rank:hover{background:#eef2f7;border-color:#94a3b8;color:#334155}
    .v436-no-duty-rank-badge:focus-visible,.v436-calendar-noduty-rank:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(100,116,139,.18)}
    .v436-rank-help{color:#718398}
    .v436-calendar-noduty-rank{margin:4px 0 2px;font-size:11px}
    .v436-rank-detail-modal{display:grid;gap:13px}
    .v436-rank-detail-head{display:flex;align-items:center;gap:11px}
    .v436-rank-detail-number{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#eef2f7;color:#334155;font-size:20px;font-weight:950;flex:0 0 auto}
    .v436-rank-detail-head h2{margin:0;color:#263d53;font-size:18px;line-height:1.2}.v436-rank-detail-head p{margin:3px 0 0;color:#667b90;font-weight:800}
    .v436-rank-detail-grid{display:grid;gap:8px}.v436-rank-detail-grid>div{display:grid;gap:3px;padding:10px 12px;border:1px solid #dce7f0;border-radius:11px;background:#fbfdff}.v436-rank-detail-grid small{color:#7b8ea2;font-size:10px;font-weight:800}.v436-rank-detail-grid b{color:#334b62;font-size:13px;line-height:1.35}
    .v436-rank-detail-note{margin:0;color:#7b8ea2;font-size:10px;line-height:1.45}
    @media(max-width:820px){.v436-no-duty-rank-badge{font-size:10px;padding:3px 7px}.v436-rank-detail-head h2{font-size:20px}.v436-rank-detail-grid b{font-size:14px}}
  `;
  document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();
