/* CNMI Staff Planner V434
 * Dashboard compact daytime-position summary.
 * - Adds today's daytime positions to "ภาพรวมวันนี้" without changing the existing detail page.
 * - Shows compact position -> staff assignments grouped by Blood Bank / Donor Room / ออกหน่วย.
 * - Shows assigned/total and vacancy count at a glance.
 * - Admin can jump to the existing daily-position page to edit; Staff can still use that page for detail.
 * - Display-only. No Supabase query/write/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V434_DASHBOARD_DAYTIME_POSITIONS';
  if(window.__CNMI_V434_DASHBOARD_DAYTIME_POSITIONS__)return;
  window.__CNMI_V434_DASHBOARD_DAYTIME_POSITIONS__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function today(){try{return todayStr();}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function norm(v){try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}catch(_){return String(v||'').slice(0,10);}}
  function codeOf(row){return String(row?.position_code||row?.code||'').trim();}
  function codeKey(v){return String(v||'').toLowerCase().replace(/\s+/g,'');}
  function labelOf(row){
    const code=codeOf(row);
    try{return typeof positionLabelForCell==='function'?String(positionLabelForCell(code)||code):code;}catch(_){return code;}
  }
  function zoneOf(row){
    const code=codeOf(row);
    const z=String(row?.zone||'').trim();
    if(z==='ออกหน่วย'||row?.is_outing===true||/^OUTING:/i.test(String(row?.eligibility_code||'')))return 'ออกหน่วย';
    if(z==='Blood Bank'||z==='Manual'||/^BB-/i.test(code)||/manual/i.test(code))return 'Blood Bank';
    if(z==='Donor Room'||/^DR-/i.test(code))return 'Donor Room';
    return z||'อื่นๆ';
  }
  function formatDate(date){try{return formatThaiDate(date);}catch(_){return date;}}
  function admin(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return false;}}
  function noPositionDay(date){try{return typeof isNoPositionDay==='function'&&!!isNoPositionDay(date);}catch(_){return false;}}
  function staffHtml(id){
    if(!id)return '<span class="v434-vacant-pill">ว่าง</span>';
    try{return staffPill(id);}catch(_){
      const st=(S().staff||[]).find(x=>String(x?.id)===String(id));
      return `<span class="v434-staff-fallback">${esc(st?.nickname||st?.full_name||'-')}</span>`;
    }
  }
  function statusFor(date){return (S().positionDayStatus||[]).find(x=>norm(x?.work_date)===date)||null;}

  function dedupeAndSort(rows){
    const map=new Map();
    (rows||[]).forEach((row,index)=>{
      const code=codeOf(row);if(!code)return;
      const key=codeKey(code);
      const old=map.get(key);
      if(!old){map.set(key,{row,index});return;}
      const a=String(old.row?.updated_at||old.row?.created_at||'');
      const b=String(row?.updated_at||row?.created_at||'');
      if(b>=a)map.set(key,{row,index});
    });
    let out=[...map.values()].sort((a,b)=>a.index-b.index).map(x=>x.row);
    try{if(typeof sortPositionRows==='function')out=sortPositionRows(out);}catch(_){ }
    return out;
  }
  function rowsFor(date){
    return dedupeAndSort((S().positions||[]).filter(row=>norm(row?.work_date)===date&&codeOf(row)));
  }
  function zoneOrder(z){return z==='Blood Bank'?1:z==='Donor Room'?2:z==='ออกหน่วย'?3:9;}
  function groupRows(rows){
    const groups=new Map();
    rows.forEach(row=>{const z=zoneOf(row);if(!groups.has(z))groups.set(z,[]);groups.get(z).push(row);});
    return [...groups.entries()].sort((a,b)=>zoneOrder(a[0])-zoneOrder(b[0])||a[0].localeCompare(b[0],'th'));
  }
  function compactStatus(rows,date){
    const assigned=rows.filter(r=>!!r?.staff_id).length;
    const total=rows.length;
    const vacant=Math.max(0,total-assigned);
    const status=String(statusFor(date)?.status||'').toLowerCase();
    const publishBadge=status==='published'?'<span class="badge green v434-publish-badge">ประกาศแล้ว</span>':(status?'<span class="badge v434-draft-badge">ร่าง</span>':'');
    const vacancy=vacant?`<span class="v434-vacancy-badge">ว่าง ${vacant}</span>`:`<span class="v434-complete-badge">ครบ ${assigned}/${total}</span>`;
    const fraction=vacant?`<span class="v434-assigned-count">จัดแล้ว ${assigned}/${total}</span>`:'';
    return `${vacancy}${fraction}${publishBadge}`;
  }
  function positionItem(row){
    const label=labelOf(row);
    return `<div class="v434-position-item${row?.staff_id?'':' is-vacant'}" title="${esc(label)}">
      <div class="v434-position-code">${esc(label)}</div>
      <div class="v434-position-staff">${staffHtml(row?.staff_id)}</div>
    </div>`;
  }
  function groupHtml(zone,rows){
    const assigned=rows.filter(r=>!!r?.staff_id).length;
    return `<section class="v434-zone-group">
      <div class="v434-zone-head"><b>${esc(zone)}</b><span>${assigned}/${rows.length}</span></div>
      <div class="v434-position-grid">${rows.map(positionItem).join('')}</div>
    </section>`;
  }
  function cardHtml(date){
    const rows=rowsFor(date);
    if(!rows.length){
      if(noPositionDay(date))return '';
      return `<div class="card v434-daytime-card" data-v434-daytime-positions>
        <div class="section-title v434-title"><div><h3>ตำแหน่งกลางวันวันนี้</h3><span class="hint">${esc(formatDate(date))}</span></div>${admin()?'<button type="button" class="soft-btn v434-jump-btn" data-nav="positions">จัดตำแหน่ง</button>':''}</div>
        <div class="v434-empty">ยังไม่ได้จัดตำแหน่งกลางวันสำหรับวันนี้</div>
      </div>`;
    }
    const groups=groupRows(rows);
    return `<div class="card v434-daytime-card" data-v434-daytime-positions>
      <div class="section-title v434-title">
        <div><h3>ตำแหน่งกลางวันวันนี้</h3><span class="hint">${esc(formatDate(date))}</span></div>
        <div class="v434-head-actions"><div class="v434-summary-badges">${compactStatus(rows,date)}</div>${admin()?'<button type="button" class="soft-btn v434-jump-btn" data-nav="positions">จัด/แก้ไข</button>':''}</div>
      </div>
      <div class="v434-groups">${groups.map(([z,list])=>groupHtml(z,list)).join('')}</div>
    </div>`;
  }

  window.cnmiDashboardPositionsV434={rowsFor,groupRows,zoneOf,cardHtml};

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV434(){
      let html=String(oldDashboard.apply(this,arguments)||'');
      try{
        const tpl=document.createElement('template');tpl.innerHTML=html;
        const detail=tpl.content.querySelector('.v401-dashboard-details');
        if(detail&&!tpl.content.querySelector('[data-v434-daytime-positions]')){
          const card=cardHtml(today());
          if(card){
            const t=document.createElement('template');t.innerHTML=card.trim();
            detail.parentNode.insertBefore(t.content.firstElementChild,detail);
          }
        }
        const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));html=holder.innerHTML;
      }catch(err){console.warn('[V434] dashboard position render fallback',err);}
      return html;
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v434-dashboard-daytime-positions';
  style.textContent=`
    .v434-daytime-card{margin-bottom:14px}
    .v434-title{align-items:flex-start;gap:12px;margin-bottom:10px}
    .v434-title>div:first-child{min-width:0}
    .v434-title h3{margin:0 0 2px;font-size:18px}
    .v434-title .hint{font-size:11px}
    .v434-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
    .v434-summary-badges{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap}
    .v434-vacancy-badge,.v434-complete-badge,.v434-assigned-count{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:10px;line-height:1;font-weight:850;white-space:nowrap}
    .v434-vacancy-badge{background:#fff1df;color:#a85a00;border:1px solid #ffd39d}
    .v434-complete-badge{background:#e9f8ee;color:#16713a;border:1px solid #bfe8cc}
    .v434-assigned-count{background:#eef5fb;color:#587087}
    .v434-publish-badge,.v434-draft-badge{font-size:9px!important;padding:4px 7px!important}
    .v434-draft-badge{background:#f1f4f7;color:#697d91}
    .v434-jump-btn{padding:6px 9px!important;font-size:10px!important;white-space:nowrap}
    .v434-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
    .v434-zone-group{min-width:0;border:1px solid #e2ebf3;border-radius:12px;background:#fbfdff;padding:9px}
    .v434-zone-group:only-child{grid-column:1/-1}
    .v434-zone-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 1px 7px;color:#36536f;font-size:11px}
    .v434-zone-head b{font-size:12px}.v434-zone-head span{color:#7b8fa3;font-size:10px;font-weight:800}
    .v434-position-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .v434-position-item{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;padding:7px 8px;border:1px solid #e6edf4;border-radius:10px;background:#fff;min-height:42px}
    .v434-position-item.is-vacant{background:#fffaf4;border-color:#ffd9aa}
    .v434-position-code{min-width:0;color:#314d68;font-size:10px;font-weight:850;line-height:1.15;overflow-wrap:anywhere}
    .v434-position-staff{min-width:0;display:flex;justify-content:flex-end;align-items:center}
    .v434-position-staff .staff-color-pill{font-size:10px!important;line-height:1!important;padding:5px 8px!important;min-width:0;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .v434-vacant-pill{display:inline-flex;padding:4px 7px;border-radius:999px;background:#fff0dc;color:#a85a00;font-size:9px;font-weight:900;border:1px solid #ffd39d;white-space:nowrap}
    .v434-staff-fallback{font-size:10px;font-weight:850;color:#314d68}
    .v434-empty{padding:12px;border-radius:10px;background:#f6f9fc;color:#71869a;font-size:12px;text-align:center}
    @media(max-width:900px){
      .v434-daytime-card{margin-bottom:14px;padding:15px!important}
      .v434-title{margin-bottom:11px}.v434-title h3{font-size:18px}.v434-title .hint{font-size:11px}
      .v434-groups{grid-template-columns:1fr;gap:9px}
      .v434-zone-group:only-child{grid-column:auto}
      .v434-position-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .v434-position-item{grid-template-columns:1fr;gap:5px;align-content:center;min-height:58px;padding:8px 9px}
      .v434-position-code{font-size:12px;line-height:1.2}
      .v434-position-staff{justify-content:flex-start}
      .v434-position-staff .staff-color-pill{font-size:11px!important;padding:5px 9px!important;max-width:100%}
      .v434-vacant-pill{font-size:10px;padding:5px 8px}
      .v434-zone-head{font-size:12px}.v434-zone-head b{font-size:13px}.v434-zone-head span{font-size:11px}
      .v434-vacancy-badge,.v434-complete-badge,.v434-assigned-count{font-size:11px;padding:5px 8px}
    }
    @media(max-width:390px){
      .v434-daytime-card{padding:13px!important}
      .v434-title{display:grid;grid-template-columns:1fr;gap:8px}
      .v434-head-actions{justify-content:flex-start}
      .v434-summary-badges{justify-content:flex-start}
      .v434-position-grid{gap:6px}
      .v434-position-code{font-size:11px}
      .v434-position-item{padding:7px 8px;min-height:55px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
