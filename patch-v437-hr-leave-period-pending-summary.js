/* CNMI Staff Planner V437
 * HR leave period + pending summary for Admin.
 * Scope:
 *   - show เต็มวัน / ครึ่งเช้า / ครึ่งบ่าย in "ตรวจสอบ HR"
 *   - add compact pending summary above the review forms
 *   - distinguish "ยังไม่ลง HR" from "รอตรวจสอบ" using existing hr_reported_date
 *   - copy a LINE-ready summary without changing leave/HR data
 * Display-only: no schema/query/write changes.
 */
(function(){
  'use strict';
  const VERSION='V437_HR_LEAVE_PERIOD_PENDING_SUMMARY';
  if(window.__CNMI_V437_HR_LEAVE_PERIOD_PENDING_SUMMARY__)return;
  window.__CNMI_V437_HR_LEAVE_PERIOD_PENDING_SUMMARY__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function effective(row){try{return typeof isLeaveEffective==='function'?isLeaveEffective(row):true;}catch(_){return true;}}
  function checked(id){try{return typeof isLeaveHrChecked==='function'?isLeaveHrChecked(id):(S().hrChecks||[]).some(h=>String(h.leave_request_id)===String(id)&&h.status==='ตรวจสอบแล้ว');}catch(_){return false;}}
  function typeOf(row){try{return typeof leaveDisplayType==='function'?String(leaveDisplayType(row)||'ลา'):String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}catch(_){return String(row?.type||row?.leave_type||'ลา').split(':::')[0].trim();}}
  function periodLabel(row){
    const raw=String(row?.leave_period||row?.period||'เต็มวัน').trim();
    if(!raw||/^(เต็มวัน|ทั้งวัน|full\s*day)$/i.test(raw))return 'เต็มวัน';
    if(/เช้า|morning/i.test(raw))return 'ครึ่งเช้า';
    if(/บ่าย|afternoon/i.test(raw))return 'ครึ่งบ่าย';
    return raw.replace(/\s*\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s*/g,'').trim()||raw;
  }
  function staffNameSafe(id){try{return typeof staffName==='function'?staffName(id):(typeof staffNick==='function'?staffNick(id):String(id||'-'));}catch(_){return String(id||'-');}}
  function staffNickSafe(id){try{return typeof staffNick==='function'?staffNick(id):staffNameSafe(id);}catch(_){return staffNameSafe(id);}}
  function thaiDate(d){try{return typeof formatThaiDate==='function'?formatThaiDate(d):String(d||'-');}catch(_){return String(d||'-');}}
  function dateRange(row){
    const a=String(row?.start_date||'').slice(0,10),b=String(row?.end_date||row?.start_date||'').slice(0,10);
    if(!a)return '-';
    return !b||a===b?thaiDate(a):`${thaiDate(a)} – ${thaiDate(b)}`;
  }
  function hrFor(row){return (S().hrChecks||[]).find(h=>String(h?.leave_request_id||'')===String(row?.id||''))||{};}
  function pendingStatus(row){
    const h=hrFor(row);
    const status=String(h?.status||'รอตรวจสอบ').trim();
    if(status==='ตรวจสอบแล้ว')return {key:'done',label:'ตรวจสอบแล้ว',tone:'green',h};
    if(h?.hr_reported_date){
      if(status==='รอเอกสาร')return {key:'waiting',label:'รอเอกสาร',tone:'yellow',h};
      if(status==='ยกเลิก')return {key:'cancelled',label:'ยกเลิก',tone:'gray',h};
      return {key:'waiting',label:'รอตรวจสอบ',tone:'orange',h};
    }
    if(status==='รอเอกสาร')return {key:'action',label:'รอเอกสาร',tone:'yellow',h};
    if(status==='ยกเลิก')return {key:'cancelled',label:'ยกเลิก',tone:'gray',h};
    return {key:'action',label:'ยังไม่ลง HR',tone:'red',h};
  }
  function pendingRows(){
    const staffFilter=S().hrFilterStaff||'';
    const monthFilter=S().hrFilterMonth||S().monthKey||'';
    return (S().leaves||[])
      .filter(x=>String(x?.type||'').trim()!=='ไม่รับเวร'&&effective(x)&&!checked(x.id))
      .filter(x=>!staffFilter||String(x.staff_id)===String(staffFilter))
      .filter(x=>!monthFilter||String(x.start_date||'').startsWith(monthFilter)||String(x.end_date||'').startsWith(monthFilter));
  }
  function badgeStatus(meta){
    const cls=meta.tone==='red'?'v437-status-red':meta.tone==='green'?'v437-status-green':meta.tone==='yellow'?'v437-status-yellow':meta.tone==='gray'?'v437-status-gray':'v437-status-orange';
    return `<span class="v437-hr-status ${cls}">${esc(meta.label)}</span>`;
  }
  function periodBadge(row){return `<span class="v437-period-badge">${esc(periodLabel(row))}</span>`;}

  function summaryHtml(rows){
    const actionable=rows.filter(r=>pendingStatus(r).key==='action').length;
    const waiting=rows.filter(r=>pendingStatus(r).key==='waiting').length;
    const other=rows.length-actionable-waiting;
    const counts=[`ยังไม่ลง HR ${actionable}`,`แจ้งแล้วรอตรวจสอบ ${waiting}`];
    if(other>0)counts.push(`สถานะอื่น ${other}`);
    if(!rows.length)return '';
    const body=rows.map(r=>{
      const meta=pendingStatus(r);
      return `<tr><td><b>${esc(staffNickSafe(r.staff_id))}</b></td><td>${esc(typeOf(r))}</td><td>${periodBadge(r)}</td><td>${esc(dateRange(r))}</td><td>${badgeStatus(meta)}</td></tr>`;
    }).join('');
    const cards=rows.map(r=>{
      const meta=pendingStatus(r);
      return `<div class="v437-summary-card"><div class="v437-summary-card-head"><b>${esc(staffNickSafe(r.staff_id))}</b>${badgeStatus(meta)}</div><div>${esc(typeOf(r))} ${periodBadge(r)}</div><div class="v437-summary-date">${esc(dateRange(r))}</div></div>`;
    }).join('');
    return `<section class="v437-pending-summary" aria-label="สรุปรายการรอดำเนินการ HR">
      <div class="v437-summary-head">
        <div><h4>สรุปรายการรอดำเนินการ HR</h4><p>${esc(counts.join(' • '))}</p></div>
        <button type="button" class="ghost-btn v437-copy-hr-summary" data-v437-copy-hr-summary>คัดลอกสรุปส่ง LINE</button>
      </div>
      <div class="table-wrap desktop-table v437-summary-table"><table><thead><tr><th>เจ้าหน้าที่</th><th>ประเภท</th><th>ช่วงลา</th><th>วันที่ลา</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="mobile-cards v437-summary-cards">${cards}</div>
      <div class="v437-summary-note">“ยังไม่ลง HR” = ยังไม่มีวันที่แจ้งใน HR • “รอตรวจสอบ” = แจ้ง HR แล้ว แต่ยังไม่ได้ตรวจยืนยัน</div>
    </section>`;
  }

  function decorateHrHtml(html){
    const rows=pendingRows();
    try{
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const card=tpl.content.querySelector('.card');if(!card)return html;
      const toolbar=card.querySelector('.toolbar.compact-filter');
      const summary=summaryHtml(rows);
      if(summary){
        const holder=document.createElement('template');holder.innerHTML=summary;
        if(toolbar)toolbar.insertAdjacentElement('afterend',holder.content.firstElementChild);
        else card.insertAdjacentElement('afterbegin',holder.content.firstElementChild);
      }
      const table=card.querySelector(':scope > .table-wrap table')||card.querySelector('.table-wrap table');
      if(table){
        const th=[...table.querySelectorAll('thead th')];
        if(th[1])th[1].textContent='ประเภท / ช่วงลา / วันที่';
        const trs=[...table.querySelectorAll('tbody tr')];
        trs.forEach((tr,i)=>{
          const row=rows[i];if(!row)return;
          const cells=[...tr.children];const cell=cells[1];if(!cell||cell.querySelector('.v437-period-badge'))return;
          const firstBadge=cell.querySelector('.badge');
          if(firstBadge)firstBadge.insertAdjacentHTML('afterend',` ${periodBadge(row)}`);
          else cell.insertAdjacentHTML('afterbegin',`${periodBadge(row)}<br>`);
        });
      }
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] HR decoration skipped`,err);return html;}
  }

  const oldHr=window.renderHrPage||(typeof renderHrPage==='function'?renderHrPage:null);
  if(typeof oldHr==='function'){
    const wrapped=function renderHrPageV437(){return decorateHrHtml(oldHr.apply(this,arguments));};
    try{window.renderHrPage=renderHrPage=wrapped;}catch(_){window.renderHrPage=wrapped;}
  }

  // Keep the completed-history page consistent: show leave period there as well.
  function decorateHrSummaryHtml(html){
    try{
      const staffFilter=S().hrSummaryFilterStaff||'';
      const monthFilter=S().hrSummaryFilterMonth||S().monthKey||'';
      const rows=(S().hrChecks||[]).filter(h=>h.status==='ตรวจสอบแล้ว').map(h=>({h,l:(S().leaves||[]).find(x=>String(x.id)===String(h.leave_request_id))})).filter(x=>x.l)
        .filter(x=>!staffFilter||String(x.l.staff_id)===String(staffFilter))
        .filter(x=>!monthFilter||String(x.l.start_date||'').startsWith(monthFilter)||String(x.l.end_date||'').startsWith(monthFilter)||String(x.h.hr_reported_date||'').startsWith(monthFilter));
      if(!rows.length)return html;
      const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
      const desktop=[...tpl.content.querySelectorAll('.desktop-table tbody tr')];
      desktop.forEach((tr,i)=>{const cell=tr.children[1],row=rows[i]?.l;if(!cell||!row||cell.querySelector('.v437-period-badge'))return;const b=cell.querySelector('.badge');if(b)b.insertAdjacentHTML('afterend',` ${periodBadge(row)}`);});
      const cards=[...tpl.content.querySelectorAll('.mobile-cards .mobile-card')];
      cards.forEach((card,i)=>{const row=rows[i]?.l;if(!row||card.querySelector('.v437-period-badge'))return;const head=card.querySelector('.section-title');if(head)head.insertAdjacentHTML('afterend',`<div class="v437-history-period"><b>ช่วงลา:</b> ${periodBadge(row)}</div>`);});
      const out=document.createElement('div');out.appendChild(tpl.content.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn(`[${VERSION}] HR summary decoration skipped`,err);return html;}
  }
  const oldHrSummary=window.renderHrSummaryPage||(typeof renderHrSummaryPage==='function'?renderHrSummaryPage:null);
  if(typeof oldHrSummary==='function'){
    const wrappedSummary=function renderHrSummaryPageV437(){return decorateHrSummaryHtml(oldHrSummary.apply(this,arguments));};
    try{window.renderHrSummaryPage=renderHrSummaryPage=wrappedSummary;}catch(_){window.renderHrSummaryPage=wrappedSummary;}
  }

  function lineText(){
    const rows=pendingRows();
    const action=rows.filter(r=>pendingStatus(r).key==='action');
    const waiting=rows.filter(r=>pendingStatus(r).key==='waiting');
    const other=rows.filter(r=>!['action','waiting'].includes(pendingStatus(r).key));
    const lines=['รายการลาที่ยังรอดำเนินการ HR',''];
    if(action.length){
      lines.push('กรุณาดำเนินการในระบบ HR');
      action.forEach(r=>lines.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} — ${periodLabel(r)} — ${dateRange(r)}${pendingStatus(r).label!=='ยังไม่ลง HR'?` — ${pendingStatus(r).label}`:''}`));
      lines.push('');
    }
    if(waiting.length){
      lines.push('แจ้ง HR แล้ว รอตรวจสอบ');
      waiting.forEach(r=>lines.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} — ${periodLabel(r)} — ${dateRange(r)}`));
      lines.push('');
    }
    if(other.length){
      lines.push('สถานะอื่น');
      other.forEach(r=>lines.push(`- ${staffNickSafe(r.staff_id)} — ${typeOf(r)} — ${periodLabel(r)} — ${dateRange(r)} — ${pendingStatus(r).label}`));
      lines.push('');
    }
    if(!rows.length)lines.push('ไม่มีรายการค้างตามตัวกรองนี้');
    else if(action.length)lines.push('รบกวนตรวจสอบและดำเนินการลาในระบบ HR ให้เรียบร้อยครับ');
    return lines.join('\n').trim();
  }
  async function copyText(text){
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}
    const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy failed');return true;
  }
  document.addEventListener('click',async event=>{
    const btn=event.target?.closest?.('[data-v437-copy-hr-summary]');if(!btn)return;
    event.preventDefault();event.stopPropagation();
    try{await copyText(lineText());if(typeof showToast==='function')showToast('คัดลอกสรุปรายการ HR แล้ว');}
    catch(err){console.warn(`[${VERSION}] copy failed`,err);if(typeof showToast==='function')showToast('คัดลอกไม่สำเร็จ กรุณาลองใหม่',{tone:'error'});}
  },true);

  const style=document.createElement('style');style.id='cnmi-v437-hr-summary';style.textContent=`
    .v437-period-badge{display:inline-flex;align-items:center;width:max-content;padding:2px 8px;border-radius:999px;background:#eaf3ff;color:#275f94;border:1px solid #cde3fb;font-size:11px;font-weight:900;line-height:1.35;white-space:nowrap;vertical-align:middle}
    .v437-pending-summary{margin:14px 0 16px;padding:14px;border:1px solid #d9e6f0;border-radius:16px;background:#fbfdff;display:grid;gap:11px}
    .v437-summary-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.v437-summary-head h4{margin:0;color:#263d53;font-size:17px}.v437-summary-head p{margin:4px 0 0;color:#718398;font-size:12px;font-weight:750}
    .v437-copy-hr-summary{flex:0 0 auto}
    .v437-summary-table{margin:0}.v437-summary-table table{min-width:650px}.v437-summary-table th,.v437-summary-table td{vertical-align:middle}
    .v437-hr-status{display:inline-flex;align-items:center;width:max-content;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:900;line-height:1.25;white-space:nowrap;border:1px solid transparent}
    .v437-status-red{background:#fff1f2;color:#b42318;border-color:#fecdd3}.v437-status-orange{background:#fff7ed;color:#b45309;border-color:#fed7aa}.v437-status-yellow{background:#fffbea;color:#8a6800;border-color:#fde68a}.v437-status-green{background:#ecfdf3;color:#067647;border-color:#abefc6}.v437-status-gray{background:#f2f4f7;color:#475467;border-color:#e4e7ec}
    .v437-summary-note{color:#718398;font-size:11px;line-height:1.45}.v437-summary-cards{display:none}.v437-summary-card{display:grid;gap:5px;padding:10px 11px;border:1px solid #e1eaf2;border-radius:12px;background:#fff}.v437-summary-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.v437-summary-date{color:#64788d;font-size:12px}.v437-history-period{margin:2px 0 6px;color:#52687e;font-size:12px}
    @media(max-width:820px){.v437-pending-summary{padding:12px;margin:12px 0 14px}.v437-summary-head{align-items:stretch;flex-direction:column}.v437-copy-hr-summary{width:100%}.v437-summary-table{display:none!important}.v437-summary-cards{display:grid;gap:8px}.v437-period-badge{font-size:11px;padding:3px 8px}.v437-summary-head h4{font-size:18px}.v437-summary-head p{font-size:12px}}
  `;document.head.appendChild(style);

  window.cnmiHrSummaryV437={periodLabel,pendingRows,pendingStatus,lineText};
  console.info(`${VERSION} loaded`);
})();
