/* CNMI Staff Planner V483
 * Position master authoritative display + mobile position navigation fix.
 *
 * Fixes:
 * 1) Dashboard room grouping must use EACH rendered position code, never array index pairing.
 * 2) Position popup metadata prefers the latest active daily_position_masters row saved in
 *    Admin > จัดการตำแหน่ง. Slot templates remain for head-count/template selection only.
 * 3) Mobile navigation to daily/monthly daytime-position pages is routed directly and
 *    refreshes daily_position_masters before rendering.
 *
 * No schema change.
 */
(function(){
  'use strict';
  const VERSION='V483_POSITION_MASTER_AUTHORITATIVE_NAV_FIX';
  if(window.__CNMI_V483_POSITION_MASTER_AUTHORITATIVE_NAV_FIX__)return;
  window.__CNMI_V483_POSITION_MASTER_AUTHORITATIVE_NAV_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{return sb||window.sb||null;}catch(_){return window.sb||null;}}
  function txt(v){return String(v==null?'':v).trim();}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(txt(v)):txt(v);}catch(_){return txt(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function normDate(v){try{return typeof normalizeDateKey==='function'?txt(normalizeDateKey(v)).slice(0,10):txt(v).slice(0,10);}catch(_){return txt(v).slice(0,10);}}
  function key(v){return txt(v).replace(/^OUTING:/i,'').toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'');}
  function codeOf(row){return txt(row?.position_code||row?.code||row?.eligibility_code).replace(/^OUTING:/i,'');}
  function labelOf(row){const c=codeOf(row);try{return typeof positionLabelForCell==='function'?txt(positionLabelForCell(c))||c:c;}catch(_){return c;}}
  function active(row){return !!row&&row.is_active!==false&&!row.deleted_at;}
  function useful(v){const s=txt(v);return !!s&&!['-','--','—'].includes(s)&&!/ยังไม่ได้ระบุ|รอตรวจสอบ/i.test(s);}
  function dateValue(row){const s=txt(row?.updated_at||row?.created_at||'');const n=Date.parse(s);return Number.isFinite(n)?n:0;}

  let masterRefreshPromise=null;
  let masterRefreshedAt=0;
  async function refreshMasters(force=false){
    const client=DB();
    if(!client)return S()?.positionMasters||[];
    if(!force&&Date.now()-masterRefreshedAt<30000&&Array.isArray(S()?.positionMasters)&&S().positionMasters.length)return S().positionMasters;
    if(masterRefreshPromise)return masterRefreshPromise;
    masterRefreshPromise=(async()=>{
      try{
        let q=client.from('daily_position_masters').select('*').order('sort_order',{ascending:true}).order('code',{ascending:true});
        const res=await q;
        if(res?.error)throw res.error;
        if(S()){
          S().positionMasters=Array.isArray(res?.data)?res.data:[];
          S().positionMastersLoaded=true;
          S().positionMasterLoadError=null;
        }
        masterRefreshedAt=Date.now();
        return S()?.positionMasters||[];
      }catch(err){
        console.warn(`[${VERSION}] daily_position_masters refresh failed`,err);
        if(S())S().positionMasterLoadError=err?.message||String(err||'');
        return S()?.positionMasters||[];
      }finally{masterRefreshPromise=null;}
    })();
    return masterRefreshPromise;
  }

  function masterFor(code){
    const k=key(code);if(!k)return null;
    const pools=[];
    if(Array.isArray(S()?.positionMasters))pools.push(...S().positionMasters);
    if(Array.isArray(S()?.dailyPositionMasters))pools.push(...S().dailyPositionMasters);
    const exact=pools.filter(active).filter(r=>key(codeOf(r))===k||key(r?.eligibility_code)===k);
    if(!exact.length){
      try{const p=typeof positionByCode==='function'?positionByCode(code):null;if(active(p))return p;}catch(_){ }
      return null;
    }
    exact.sort((a,b)=>dateValue(b)-dateValue(a));
    return exact[0];
  }

  function authoritativeMeta(row,date){
    const c=codeOf(row);
    const master=masterFor(c)||{};
    let fallback={};
    try{fallback=window.cnmiV381?.__v483PreviousMetadata?.(row,date)||{};}catch(_){fallback={};}
    return {
      code:c,
      zone:useful(master?.zone)?txt(master.zone):(useful(row?.zone)?txt(row.zone):(useful(fallback?.zone)?txt(fallback.zone):'-')),
      break_time:useful(master?.break_time)?txt(master.break_time):(useful(row?.break_time)?txt(row.break_time):(useful(fallback?.break_time)?txt(fallback.break_time):'-')),
      main_rule:useful(master?.main_rule||master?.required_role)?txt(master.main_rule||master.required_role):(useful(row?.main_rule||row?.required_role)?txt(row.main_rule||row.required_role):(useful(fallback?.main_rule)?txt(fallback.main_rule):'-')),
      job_desc:useful(master?.job_desc||master?.description||master?.detail)?txt(master.job_desc||master.description||master.detail):(useful(row?.job_desc||row?.description)?txt(row.job_desc||row.description):(useful(fallback?.job_desc)?txt(fallback.job_desc):`ปฏิบัติงานตามหน้าที่ของตำแหน่ง ${c||'ที่ได้รับมอบหมาย'}`)),
      sourceV483:Object.keys(master).length?'daily_position_masters':'daily_positions'
    };
  }

  // Override V381 metadata: latest saved master first. V479 previously preferred Slot Master,
  // which could be stale after the Admin edited the master catalog.
  function patchMetadataApi(){
    const api=window.cnmiV381;if(!api||api.__v483MasterPatched)return;
    const previous=typeof api.metadataFor==='function'?api.metadataFor.bind(api):null;
    api.__v483PreviousMetadata=previous;
    api.metadataFor=function(row,date){
      const c=codeOf(row),master=masterFor(c)||{};
      let old={};try{old=previous?previous(row,date)||{}:{};}catch(_){old={};}
      return {
        ...old,
        code:c||old.code,
        zone:useful(master?.zone)?txt(master.zone):(useful(row?.zone)?txt(row.zone):old.zone),
        break_time:useful(master?.break_time)?txt(master.break_time):(useful(row?.break_time)?txt(row.break_time):old.break_time),
        main_rule:useful(master?.main_rule||master?.required_role)?txt(master.main_rule||master.required_role):(useful(row?.main_rule||row?.required_role)?txt(row.main_rule||row.required_role):old.main_rule),
        job_desc:useful(master?.job_desc||master?.description||master?.detail)?txt(master.job_desc||master.description||master.detail):(useful(row?.job_desc||row?.description)?txt(row.job_desc||row.description):old.job_desc),
        sourceV483:Object.keys(master).length?'daily_position_masters':(old.sourceV479||old.sourceV381||'fallback')
      };
    };
    api.__v483MasterPatched=true;
  }
  patchMetadataApi();
  setTimeout(patchMetadataApi,250);
  setTimeout(patchMetadataApi,1200);

  const GROUPS=[
    {id:'specimen-issue',label:'Specimen & Issue',thai:'รับสิ่งส่งตรวจ / จ่ายส่วนประกอบโลหิต'},
    {id:'blood-bank',label:'Blood Bank',thai:'ตรวจ Donor / Immunohematology และเคสยาก'},
    {id:'component-prep',label:'Component Prep',thai:'เตรียมส่วนประกอบโลหิต'},
    {id:'donor-room',label:'Donor Room',thai:'ห้องบริจาคโลหิต'},
    {id:'other',label:'อื่นๆ',thai:'ตำแหน่งอื่น'}
  ];
  function groupInfo(id){return GROUPS.find(g=>g.id===id)||GROUPS[4];}
  function roomGroup(code){
    try{const g=window.cnmiRoomGroupV474?.roomGroup?.(code);if(g)return g;}catch(_){ }
    const c=txt(code),k=key(c);
    if(/^dr-/i.test(c))return 'donor-room';
    if(k==='bbmanual1'||k==='bbmanual2')return 'blood-bank';
    if(k==='bbmanual3'||k==='bbmanual4')return 'component-prep';
    if(k==='bbreport'||k==='bbreport1'||k==='bbreport2'||k==='bbapprove'||k==='bbstockissue'||k==='bbsupport')return 'specimen-issue';
    if(/^bb-/i.test(c))return 'specimen-issue';
    return 'other';
  }
  function selectedDashboardDate(){
    try{return normDate(window.cnmiDashboardDateV443?.selectedDate?.()||S()?.dashboardDateV443||'')||normDate(typeof todayStr==='function'?todayStr():'');}catch(_){return normDate(S()?.dashboardDateV443||'');}
  }
  function rowsForDate(date){
    try{return window.cnmiDashboardPositionsV434?.rowsFor?.(date)||[];}catch(_){return (S()?.positions||[]).filter(r=>normDate(r?.work_date)===date&&codeOf(r));}
  }
  function itemLabel(item){
    const title=txt(item?.getAttribute?.('title'));if(title)return title;
    const node=item?.querySelector?.('.v434-position-code');
    if(!node)return '';
    const first=Array.from(node.childNodes||[]).find(n=>n.nodeType===Node.TEXT_NODE&&txt(n.textContent));
    return txt(first?.textContent||node.textContent).replace(/\bi\s*$/,'').trim();
  }
  function rowForItem(item,date){
    const rows=rowsForDate(date),label=itemLabel(item),k=key(label);
    if(!rows.length)return null;
    let found=rows.find(r=>key(labelOf(r))===k||key(codeOf(r))===k);
    if(found)return found;
    const staffNode=item?.querySelector?.('.v434-position-staff .staff-color-pill,.v434-position-staff');
    const staffText=key(staffNode?.textContent||'');
    if(staffText){
      found=rows.find(r=>{
        const st=(S()?.staff||[]).find(x=>String(x?.id)===String(r?.staff_id));
        return st&&staffText.includes(key(st?.nickname||st?.full_name));
      });
    }
    return found||null;
  }
  function isVacant(item){return !!item?.querySelector?.('.v434-vacant-pill')||item?.classList?.contains('is-vacant');}
  function isOnLeave(item){return !!item?.classList?.contains('v445-has-leave');}
  function buildGroup(id,items){
    const g=groupInfo(id),total=items.length,assigned=items.filter(x=>!isVacant(x)).length,ready=items.filter(x=>!isVacant(x)&&!isOnLeave(x)).length;
    const sec=document.createElement('section');
    sec.className='v434-zone-group v471-room-group v483-room-group';sec.dataset.v471Group=id;sec.dataset.v483Group=id;
    sec.innerHTML=`<div class="v434-zone-head v471-room-head"><div class="v471-room-title"><b>${esc(g.label)}</b><small>${esc(g.thai)}</small></div><span class="v445-zone-count"><b>พร้อม ${ready}/${total}</b><small>จัด ${assigned}/${total}</small></span></div><div class="v434-position-grid"></div>`;
    const grid=sec.querySelector('.v434-position-grid');items.forEach(item=>grid.appendChild(item));return sec;
  }
  function fixDashboardCard(card,date){
    if(!card||!date||date<'2026-09-01')return;
    const holder=card.querySelector('.v434-groups');if(!holder)return;
    const items=Array.from(card.querySelectorAll('.v434-position-item'));if(!items.length)return;
    const buckets=new Map();
    items.forEach(item=>{
      const row=rowForItem(item,date);const code=codeOf(row)||itemLabel(item);const id=roomGroup(code);
      item.dataset.v483PositionCode=code;
      const node=item.querySelector('.v434-position-code');if(node){node.dataset.v483PositionCode=code;node.dataset.v483Date=date;}
      if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(item);
    });
    holder.innerHTML='';
    GROUPS.forEach(g=>{const list=buckets.get(g.id)||[];if(list.length)holder.appendChild(buildGroup(g.id,list));});
    card.dataset.v483Date=date;
    card.dataset.v483Authoritative='1';
  }
  function fixDashboard(root=document){const d=selectedDashboardDate();root.querySelectorAll?.('[data-v434-daytime-positions]').forEach(card=>fixDashboardCard(card,d));}

  // Popup: map by the actual item code, not by rendered-array index.
  function splitDuties(v){
    const source=txt(v).replace(/\r/g,'\n');if(!source)return[];
    let parts=source.split(/\n+|[•;]|,(?=\s|$)/).map(txt).filter(Boolean);
    if(parts.length<2)parts=source.split(/\s+และ(?=การ|งาน|ทำ|ตรวจ|รับ|บันทึก|ดูแล|แจ้ง|นำ|จ่าย|เตรียม|ปั่น)/).map(txt).filter(Boolean);
    return [...new Set((parts.length?parts:[source]).map(x=>x.replace(/^[\-–—•\s]+/,'').trim()).filter(Boolean))].slice(0,3);
  }
  function popupRow(code,date){const k=key(code);return rowsForDate(date).find(r=>key(codeOf(r))===k||key(labelOf(r))===k)||{position_code:code,work_date:date};}
  function displayGroup(code){return groupInfo(roomGroup(code));}
  function breakLabel(v){const s=txt(v)||'-';return /^\d{1,2}:\d{2}$/.test(s)?`${s} น.`:s;}
  function showSummary(code,date){
    const row=popupRow(code,date),meta=authoritativeMeta(row,date),g=displayGroup(code),duties=splitDuties(meta.job_desc);
    showModal(`<div class="v435-position-summary-modal v483-position-modal" data-v483-code="${esc(code)}" data-v483-date="${esc(date)}"><div class="v435-modal-heading"><div><h2>${esc(labelOf(row)||code)}</h2><span class="v435-zone-badge" data-v471-group="${esc(g.id)}">${esc(g.label)}</span></div></div><section class="v435-main-duty-box"><h3>หน้าที่หลัก</h3><ul>${duties.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="v435-break-row"><span>เวลาพัก</span><b>${esc(breakLabel(meta.break_time))}</b></div></section><button type="button" class="soft-btn v435-full-detail-btn" data-v483-full-detail>ดูคำอธิบายตำแหน่งฉบับเต็ม</button></div>`,{small:true});
  }
  function showFull(code,date){
    const row=popupRow(code,date),meta=authoritativeMeta(row,date),g=displayGroup(code);
    showModal(`<div class="v435-position-full-modal v483-position-modal" data-v483-code="${esc(code)}" data-v483-date="${esc(date)}"><div class="v435-modal-heading"><div><h2>${esc(labelOf(row)||code)}</h2><span class="v435-zone-badge" data-v471-group="${esc(g.id)}">${esc(g.label)}</span></div></div><div class="v435-full-meta-grid"><div><small>เวลาพัก</small><b>${esc(breakLabel(meta.break_time))}</b></div><div><small>ผู้ปฏิบัติหลัก / เงื่อนไข</small><b>${esc(meta.main_rule||'-')}</b></div></div><section class="v435-full-duty-box"><h3>รายละเอียดหน้าที่ที่ต้องทำ</h3><p>${esc(meta.job_desc||'-')}</p></section><button type="button" class="soft-btn v435-back-summary-btn" data-v483-back-summary>กลับหน้าที่หลัก</button></div>`,{small:true});
  }

  // Window capture runs before the older document-level V435 listener.
  window.addEventListener('click',event=>{
    const node=event.target?.closest?.('.v434-position-code[data-v435-position-open],.v434-position-code[data-v483-position-code]');
    if(node){
      const item=node.closest('.v434-position-item');const date=txt(node.dataset.v483Date)||selectedDashboardDate();const row=rowForItem(item,date);const code=codeOf(row)||txt(node.dataset.v483PositionCode)||itemLabel(item);
      if(code){event.preventDefault();event.stopImmediatePropagation();showSummary(code,date);return;}
    }
    const full=event.target?.closest?.('[data-v483-full-detail]');
    if(full){const modal=full.closest('.v483-position-modal');if(modal){event.preventDefault();event.stopImmediatePropagation();showFull(modal.dataset.v483Code,modal.dataset.v483Date);return;}}
    const back=event.target?.closest?.('[data-v483-back-summary]');
    if(back){const modal=back.closest('.v483-position-modal');if(modal){event.preventDefault();event.stopImmediatePropagation();showSummary(modal.dataset.v483Code,modal.dataset.v483Date);return;}}
  },true);
  window.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const node=event.target?.closest?.('.v434-position-code[data-v435-position-open],.v434-position-code[data-v483-position-code]');if(!node)return;
    const item=node.closest('.v434-position-item'),date=txt(node.dataset.v483Date)||selectedDashboardDate(),row=rowForItem(item,date),code=codeOf(row)||txt(node.dataset.v483PositionCode)||itemLabel(item);
    if(code){event.preventDefault();event.stopImmediatePropagation();showSummary(code,date);}
  },true);

  // Mobile route hardening for the two Staff position pages (+ Admin monthly page).
  let navigating=false;
  async function navigatePosition(page){
    if(navigating)return;navigating=true;
    try{
      if(S())S().page=page;
      const sidebar=document.getElementById('sidebar');if(sidebar)sidebar.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      await refreshMasters(true);
      try{if(typeof window.renderPage==='function')window.renderPage();else if(typeof renderPage==='function')renderPage();}catch(err){console.error(`[${VERSION}] render ${page}`,err);}
      window.scrollTo?.({top:0,left:0,behavior:'auto'});
    }finally{navigating=false;}
  }
  window.addEventListener('click',event=>{
    const nav=event.target?.closest?.('[data-page="positions"],[data-page="positionMonthView"],[data-page="positionMonth"],[data-nav="positions"]');
    if(!nav)return;
    let page=txt(nav.dataset.page||nav.dataset.nav);if(page==='positions'||page==='positionMonthView'||page==='positionMonth'){
      event.preventDefault();event.stopImmediatePropagation();navigatePosition(page);
    }
  },true);

  let queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patchMetadataApi();fixDashboard(document);});}
  const observer=new MutationObserver(queue);observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{refreshMasters(false).then(queue);queue();},{once:true});
  window.addEventListener('pageshow',()=>{refreshMasters(false).then(queue);});
  setTimeout(()=>refreshMasters(false).then(queue),500);

  const style=document.createElement('style');style.id='cnmi-v483-position-master-authoritative-nav-fix';style.textContent=`
    .v483-room-group[data-v483-group="specimen-issue"]{border-top-color:#60a5fa!important;background:#f8fbff!important}
    .v483-room-group[data-v483-group="blood-bank"]{border-top-color:#f59e0b!important;background:#fffdf8!important}
    .v483-room-group[data-v483-group="component-prep"]{border-top-color:#8b5cf6!important;background:#fcfaff!important}
    .v483-room-group[data-v483-group="donor-room"]{border-top-color:#22c55e!important;background:#f9fefb!important}
    @media(max-width:820px){.nav-btn[data-page="positions"],.nav-btn[data-page="positionMonthView"],.nav-btn[data-page="positionMonth"]{touch-action:manipulation;pointer-events:auto!important}}
  `;document.head.appendChild(style);

  window.cnmiV483={version:VERSION,refreshMasters,masterFor,authoritativeMeta,roomGroup,fixDashboard,navigatePosition};
  console.info(`[${VERSION}] loaded`);
})();
