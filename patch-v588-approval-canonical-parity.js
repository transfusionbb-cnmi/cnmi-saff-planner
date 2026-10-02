/* CNMI Staff Planner V588 — Approval canonical OT parity
 * Fix: the Approval OT table in V191 showed the legacy explicit/manual "actual hours"
 * while HR hours already came from the newer trade-aware normalization.  That could
 * show e.g. 8 actual / 29.54 HR even though the canonical Staff/Admin detail is
 * 24 actual / 29.54 HR for the same approved attendance row.
 *
 * V588 makes both Staff "รายการ OT ของฉัน" and Admin "อนุมัติ OT" render hours from
 * the exact same current normalization object.  No synthetic OT rows and no DB writes.
 */
(function(){
  'use strict';
  const VERSION='V588_APPROVAL_CANONICAL_OT_PARITY';
  if(window.__CNMI_V588_APPROVAL_CANONICAL_OT_PARITY__) return;
  window.__CNMI_V588_APPROVAL_CANONICAL_OT_PARITY__=true;

  function S(){ try{return (typeof state!=='undefined'&&state)||window.state||{};}catch(_){return window.state||{};} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function normDate(v){ try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);} }
  function esc(v){ try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));} }
  function fmtDate(v){ const d=normDate(v); try{return formatThaiDate(d);}catch(_){return d||'-';} }
  function round(v,d=2){ const n=Number(v||0); if(!Number.isFinite(n))return 0; const m=10**d; return Math.round(n*m)/m; }
  function hours(v,d=2){ const n=round(v,d); return Number.isInteger(n)?String(n):n.toFixed(d).replace(/0+$/,'').replace(/\.$/,''); }
  function staffName(id){ try{return staffNick(id);}catch(_){const s=(S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||{};return s.nickname||s.full_name||id||'-';} }
  function dutyCode(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function dutyLabel(code){ try{return DUTY_LABEL?.[code]||code||'-';}catch(_){return code||'-';} }
  function marker(note,key){ const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i')); return m?String(m[1]||'').trim():''; }
  function clock(v){ const m=String(v||'').match(/(\d{1,2}):(\d{2})/); return m?`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`:''; }
  function statusText(row){ return String(row?.status||'').trim(); }
  function claimStatus(row){
    const s=String(row?.claim_status||'').trim().toLowerCase();
    return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s)?'Claimed':'Pending';
  }
  function isClaimed(row){ return claimStatus(row)==='Claimed'; }
  function isApproved(row){ return statusText(row)==='อนุมัติ'; }
  function isRejected(row){ return ['ไม่อนุมัติ','ไม่อนุมัติแล้ว','rejected','reject','denied','not_approved','not approved'].includes(statusText(row).replace(/\s+/g,' ').toLowerCase()); }
  function corrected(row){
    try{ const fn=window.cnmiV221DutyOt?.correctedOtRow; return typeof fn==='function'?(fn(row)||row):row; }
    catch(_){ return row; }
  }
  function canonical(row){
    const work=corrected(row);
    try{
      const n=window.v190HrRateNormalization?.otNormalizationBreakdown190?.(work);
      if(n&&Number.isFinite(Number(n.actualHours))&&Number.isFinite(Number(n.hrHours))) return n;
    }catch(err){ console.warn(`[${VERSION}] normalization`,err); }
    let actual=0;
    try{ actual=Number(calcOtHours(work)||0); }catch(_){ actual=Number(work?.manual_hours||work?.requested_hours||work?.hours||0); }
    return {actualHours:round(actual,2),hrHours:round(actual,2),segments:[],tradeInfo:null,helperInfo:null};
  }
  function reasonHtml(row){
    try{
      const h=window.v176OtReasonHelpers;
      if(h?.compactOtReasonText176){ const t=h.compactOtReasonText176(row); return `${esc(t.main||'-')}${t.detail?`<br><span class="muted">${esc(t.detail)}</span>`:''}`; }
    }catch(_){ }
    return `${esc(row?.reason||'-')}${row?.note?`<br><span class="muted">${esc(row.note)}</span>`:''}`;
  }
  function endDate(row){
    const col=normDate(row?.end_date); if(col)return col;
    const m=String(row?.note||'').match(/วันที่สิ้นสุด\s*(\d{4}-\d{2}-\d{2})/); return m?normDate(m[1]):normDate(row?.work_date);
  }
  function noteStart(row){ return String(row?.note||'').match(/เวลาเริ่ม\s*([0-2]?\d:[0-5]\d)/)?.[1]||''; }
  function baseTimeText(row){
    const d=normDate(row?.work_date),ed=endDate(row)||d;
    const st=clock(row?.start_time||noteStart(row)),en=clock(row?.end_time);
    const a=st?`${fmtDate(d)} ${esc(st)}`:fmtDate(d);
    const b=en?`${fmtDate(ed)} ${esc(en)}`:fmtDate(ed);
    return `${a}<br><span class="muted">ถึง ${b}</span>`;
  }
  const PART_TIME={
    full24:'08:00–08:00 (+1 วัน)', morning_afternoon:'08:00–00:00 (+1 วัน)', afternoon_night:'16:00–08:00 (+1 วัน)',
    night_morning:'00:00–08:00 (+1 วัน) + 08:00–16:00', morning:'08:00–16:00', afternoon:'16:00–00:00 (+1 วัน)', night:'00:00–08:00 (+1 วัน)'
  };
  function tradeWindow(item){
    const t=item?.trade||{},a=item?.assignment||{},note=String(t?.note||'');
    const st=clock(marker(note,'SELL_START')),en=clock(marker(note,'SELL_END'));
    if(st&&en) return `${st}–${en}${en<=st?' (+1 วัน)':''}`;
    const part=marker(note,'SELL_PART'); if(PART_TIME[part])return PART_TIME[part];
    const segs=marker(note,'SELL_SEGMENTS');
    if(segs){
      const s=segs.split(',').map(x=>x.trim()).filter(Boolean).join(',');
      const map={morning:'08:00–16:00',afternoon:'16:00–00:00 (+1 วัน)',night:'00:00–08:00 (+1 วัน)'};
      const arr=s.split(',').map(x=>map[x]).filter(Boolean); if(arr.length)return arr.join(' + ');
    }
    const sold=Number(item?.soldHours||0),code=dutyCode(a);
    if(sold===24)return '08:00–08:00 (+1 วัน)';
    if(sold===16&&/^ชบด[123]$/.test(code))return '16:00–08:00 (+1 วัน)';
    if(sold===8&&['ช3A','ช3B','ช9','ช9-MT','ช9-เคิก'].includes(code))return '08:00–16:00';
    return `${dutyLabel(code)} • ${hours(sold)} ชม.`;
  }
  function tradeItems(n){
    const info=n?.tradeInfo;
    if(!info)return [];
    if(Array.isArray(info.trades)&&info.trades.length) return info.trades;
    if(info.trade||info.assignment) return [{trade:info.trade,assignment:info.assignment,soldHours:info.soldHours,claimHours:info.claimHours,amount:info.amount}];
    return [];
  }
  function canonicalTimeText(row,n){
    const items=tradeItems(n);
    if(n?.multiTrade&&items.length>1){
      const labels=[...new Set(items.map(tradeWindow).filter(Boolean))];
      if(labels.length) return `<b>${esc(fmtDate(row?.work_date))}</b><br><span class="muted">${labels.map(esc).join(' + ')}</span>`;
    }
    return baseTimeText(row);
  }
  function sourceBreakdown(row,n){
    const items=tradeItems(n);
    if(!items.length)return '';
    const head=items.length>1?`รวม ${items.length} ช่วงที่ยืนยัน/รับเวร`:'OT จากการซื้อเวร';
    const lines=items.map(item=>{
      const t=item?.trade||{},a=item?.assignment||{};
      const who=staffName(t?.requester_id),windowText=tradeWindow(item),code=dutyLabel(dutyCode(a));
      const amount=Number(item?.amount||0),claim=Number(item?.claimHours||0),sold=Number(item?.soldHours||0);
      return `<div class="v588-source-line"><b>${esc(windowText)}</b> • ${esc(code)} • ${hours(sold)} ชม.${who&&who!=='-'?` • ซื้อจาก ${esc(who)}`:''}${amount>0?` • ${amount.toLocaleString('th-TH')} บ.`:''} → <b>${hours(claim)} ชม. HR</b></div>`;
    }).join('');
    return `<div class="v588-source-box"><span class="badge purple">${esc(head)}</span>${lines}</div>`;
  }
  function statusBadge(row){
    const s=statusText(row)||'-';
    let out='';
    try{ out=badge(s,s==='อนุมัติ'?'green':s==='ไม่อนุมัติ'?'red':s==='ส่งกลับแก้ไข'?'orange':'black'); }
    catch(_){ out=`<span class="badge">${esc(s)}</span>`; }
    return `${out}${isClaimed(row)?'<br><span class="badge yellow">Exported</span>':''}`;
  }
  function actionButtons(row){
    if(admin()){
      const disabled=isClaimed(row)?'disabled':'';
      const statuses=(()=>{ try{return Array.isArray(OT_STATUSES)?OT_STATUSES:['รออนุมัติ','อนุมัติ','ไม่อนุมัติ','ส่งกลับแก้ไข'];}catch(_){return ['รออนุมัติ','อนุมัติ','ไม่อนุมัติ','ส่งกลับแก้ไข'];} })();
      return `<div class="actions v191-ot-actions v588-ot-actions"><button class="tiny-btn icon-btn" type="button" data-edit-ot="${esc(row?.id)}" ${disabled} title="${isClaimed(row)?'รายการนี้ Export HR แล้ว ห้ามแก้ไข':'แก้ไขรายการ OT'}">✏️</button><button class="tiny-btn icon-btn danger" type="button" data-delete-ot-admin="${esc(row?.id)}" ${disabled} title="${isClaimed(row)?'รายการนี้ Export HR แล้ว ห้ามลบ':'ลบรายการ OT'}">🗑️</button>${statuses.filter(s=>s!=='รออนุมัติ').map(s=>`<button class="tiny-btn" type="button" data-ot-status="${esc(row?.id)}|${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    }
    const buttons=[];
    const owner=String(row?.staff_id||'')===currentSid();
    if(owner&&!isApproved(row)&&!isClaimed(row))buttons.push(`<button class="tiny-btn" type="button" data-edit-ot="${esc(row?.id)}">แก้ไข</button>`);
    if(owner&&isRejected(row))buttons.push(`<button class="tiny-btn danger" type="button" data-delete-rejected-ot="${esc(row?.id)}">ลบ</button>`);
    return buttons.length?`<div class="actions v191-ot-actions">${buttons.join('')}</div>`:'-';
  }
  function visibleRows(rows){
    const source=(Array.isArray(rows)?rows:(S().otRequests||[])).filter(r=>!r?._v584Synthetic&&!/^v584-trade-/i.test(String(r?.id||'')));
    const base=admin()?(typeof filteredOtRows==='function'?filteredOtRows(source):source):source.filter(r=>String(r?.staff_id||'')===currentSid());
    return base.slice().sort((a,b)=>normDate(b?.work_date).localeCompare(normDate(a?.work_date))||String(b?.created_at||'').localeCompare(String(a?.created_at||'')));
  }
  function hourInfo(row){
    const n=canonical(row),actual=Number(n?.actualHours||0),hr=Number(n?.hrHours||0),changed=Math.abs(hr-actual)>0.004;
    const label=n?.helperInfo?'แปลงตามเรทช่องที่ลงชื่อ':n?.tradeInfo?'แปลงตามเรทที่ซื้อ':'Normalize';
    const tone=n?.helperInfo?'blue':n?.tradeInfo?'purple':'yellow';
    return {n,actual,hr,changed,label,tone};
  }
  function render(rows){
    try{
      const visible=visibleRows(rows),filters=admin()&&typeof renderOtFilters==='function'?renderOtFilters():'';
      if(!visible.length){ try{return filters+empty(admin()?'ยังไม่มีรายการ OT ตามตัวกรองนี้':'ยังไม่มีรายการ OT ของฉัน');}catch(_){return filters+'<div class="empty">ยังไม่มีรายการ OT</div>'; } }
      const body=visible.map(row=>{
        const h=hourInfo(row),source=sourceBreakdown(row,h.n);
        return `<tr><td>${staffPill(row.staff_id)}</td><td>${canonicalTimeText(row,h.n)}</td><td>${reasonHtml(row)}${source}</td><td><b>${hours(h.actual,1)}</b></td><td><b>${hours(h.hr,2)}</b>${h.changed?`<br><span class="badge ${h.tone}">${h.label}</span>`:''}</td><td>${statusBadge(row)}</td><td>${actionButtons(row)}</td></tr>`;
      }).join('');
      const table=`<div class="table-wrap ot-desktop-table v190-ot-table v191-ot-table v588-canonical-approval"><table><thead><tr><th>ชื่อ</th><th>ช่วงเวลาทำงาน</th><th>เหตุผล / ที่มา</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${body}</tbody></table></div>`;
      const cards=`<div class="mobile-cards ot-mobile-cards v190-ot-cards v191-ot-cards v588-canonical-cards">${visible.map(row=>{ const h=hourInfo(row),acts=actionButtons(row); return `<div class="mobile-card"><div class="mobile-day-head">${staffPill(row.staff_id)}${statusBadge(row)}</div><div><b>ช่วงเวลาทำงาน</b><br>${canonicalTimeText(row,h.n)}</div><div><b>เหตุผล:</b> ${reasonHtml(row)}${sourceBreakdown(row,h.n)}</div><div><b>ชั่วโมงจริง:</b> ${hours(h.actual,1)}<br><b>ชั่วโมงเบิก HR:</b> ${hours(h.hr,2)}${h.changed?` <span class="badge ${h.tone}">${h.label}</span>`:''}</div>${acts!=='-'?acts:''}</div>`; }).join('')}</div>`;
      return filters+table+cards;
    }catch(err){ console.error(`[${VERSION}] render failed`,err); return '<div class="notice error-notice">แสดงรายการ OT ไม่สำเร็จ กรุณารีเฟรชอีกครั้ง</div>'; }
  }
  function install(){ window.renderOtTable=renderOtTable=render; return true; }
  function addStyle(){
    if(document.getElementById('v588CanonicalStyle'))return;
    const st=document.createElement('style'); st.id='v588CanonicalStyle'; st.textContent=`
      .v588-source-box{margin-top:6px;padding:7px 9px;border-radius:10px;background:#f7f4ff;font-size:12px;line-height:1.45}
      .v588-source-line{margin-top:4px;color:#40516a}.v588-source-line b{color:#20354d}
      @media(max-width:760px){.v588-source-box{font-size:12px}.v588-canonical-cards .mobile-card{overflow:hidden}}
    `; document.head.appendChild(st);
  }
  function markVersion(){
    document.querySelectorAll('.v531-version-chip,.v532-version-chip,.v542-version-chip,.v520-version-chip,[class*="version-chip"]').forEach(x=>{ if(!x||!/^v\d+/i.test(String(x.textContent||'').trim()))return; x.textContent='v588'; x.title='Approval canonical OT parity'; });
  }
  async function warm(){
    try{ await window.cnmiV577?.preloadOtReferenceData?.((()=>{try{const h=String(location.hash||'');const q=h.includes('?')?new URLSearchParams(h.split('?')[1]):null;return String(q?.get('month')||'').slice(0,7);}catch(_){return '';}})(),{force:false}); }catch(_){ }
    install();
    if(String(location.hash||'').startsWith('#/ot')){ try{ if(typeof renderPage==='function')renderPage(); }catch(_){ } }
  }

  addStyle(); install(); setTimeout(markVersion,180); setTimeout(warm,220);
  window.addEventListener('hashchange',()=>{setTimeout(()=>{install();markVersion();warm();},80);});
  window.addEventListener('pageshow',()=>{setTimeout(()=>{install();markVersion();},120);});
  window.cnmiV588={version:VERSION,render,canonical};
  console.info(`[${VERSION}] loaded`);
})();
