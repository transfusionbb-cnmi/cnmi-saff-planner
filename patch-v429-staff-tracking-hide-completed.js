/* CNMI Staff Planner V429
   Staff tracking = action queue only.
   - Main duty disappears after the staff OT confirmation/request has been submitted.
   - Ch4 / blood-spinning disappears after a replacement is recorded OR actual extra-OT time is submitted.
   - Rejected / returned OT requests reappear so the staff can correct them.
*/
(function(){
  'use strict';
  const VERSION='V429_STAFF_TRACKING_HIDE_COMPLETED';
  if(window.__CNMI_V429_STAFF_TRACKING_HIDE_COMPLETED__)return;
  window.__CNMI_V429_STAFF_TRACKING_HIDE_COMPLETED__=true;

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof previousRenderOtPage!=='function')return;

  function S(){try{return state||window.state||{};}catch(_){return window.state||{};}}
  function isAdminSafe(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){try{return escapeHtml(v==null?'':String(v));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){try{return normalizeDateKey(v);}catch(_){return String(v||'').slice(0,10);}}
  function sid(){try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');}}
  function dutyLabel(code){try{return (DUTY_LABEL&&DUTY_LABEL[code])||code||'-';}catch(_){return code||'-';}}
  function thaiDate(date){try{return formatThaiDate(norm(date));}catch(_){return norm(date)||'-';}}
  function thaiMonth(key){try{const [y,m]=String(key||'').split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key||'-';}}
  function selectedMonth(){
    const raw=S()?.otMenuMonthV369||S()?.myDutyMonthFilter||S()?.monthKey||new Date().toISOString().slice(0,7);
    return /^\d{4}-\d{2}$/.test(String(raw).slice(0,7))?String(raw).slice(0,7):new Date().toISOString().slice(0,7);
  }
  function latest(rows){return (rows||[]).slice().sort((a,b)=>String(b?.created_at||b?.updated_at||b?.confirmed_at||'').localeCompare(String(a?.created_at||a?.updated_at||a?.confirmed_at||'')))[0]||null;}
  function isAttendanceOt(row){
    const text=`${row?.reason||''} ${row?.note||''} ${row?.device||''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|V220_OT_APPROVAL|V219_OT_REPAIR|V221_DUTY_DATE/i.test(text);
  }
  function requestNeedsAction(row){
    if(!row)return true;
    const raw=String(row?.status||'').trim();
    const low=raw.toLowerCase();
    return raw==='ไม่อนุมัติ'||raw==='ส่งกลับแก้ไข'||/reject|return|edit/i.test(low);
  }
  function statusText(row){
    if(!row)return 'ยังไม่ได้ยืนยัน';
    const raw=String(row?.status||'').trim(),low=raw.toLowerCase();
    if(raw==='ไม่อนุมัติ'||low==='rejected')return 'ไม่อนุมัติ — กรุณาแก้ไข';
    if(raw==='ส่งกลับแก้ไข'||/return|edit/i.test(low))return 'ส่งกลับแก้ไข';
    if(raw==='อนุมัติ'||low==='approved')return 'อนุมัติแล้ว';
    return 'ยืนยันแล้ว / รอ Admin';
  }
  function statusClass(text){
    const t=String(text||'');
    if(/ไม่อนุมัติ|ส่งกลับ/.test(t))return 'red';
    if(/ยืนยันแล้ว|รอ Admin/.test(t))return 'orange';
    if(/อนุมัติแล้ว/.test(t))return 'green';
    return 'black';
  }
  function statusBadge(text){try{return badge(text,statusClass(text));}catch(_){return `<span class="badge ${esc(statusClass(text))}">${esc(text)}</span>`;}}
  function isCh4(code){return /^ช4(?:A|B)?$/.test(String(code||'').trim());}
  function weekendHoliday(date){
    try{return (typeof isWeekend==='function'&&isWeekend(date))||(typeof isHolidayDate==='function'&&isHolidayDate(date));}
    catch(_){const d=new Date(`${norm(date)}T00:00:00`).getDay();return d===0||d===6;}
  }
  function timeText(date,codes,duties=[]){
    const effective=(duties||[]).filter(x=>Array.isArray(x?._effective_segments)&&x._effective_segments.length&&Number(x?._effective_hours)>0&&!isCh4(x?.duty_code));
    if(effective.length){
      const order=['morning','afternoon','night'],set=new Set(),hours=Math.round(effective.reduce((sum,x)=>sum+Number(x._effective_hours||0),0)*100)/100;
      effective.forEach(x=>(x._effective_segments||[]).forEach(s=>set.add(s)));
      const key=order.filter(s=>set.has(s)).join(',');
      if(key==='morning')return '08:00 - 16:00';
      if(key==='afternoon')return '16:00 - 00:00';
      if(key==='night')return '00:00 - 08:00';
      if(key==='morning,afternoon')return '08:00 - 00:00';
      if(key==='afternoon,night')return '16:00 - 08:00 (+1 วัน)';
      if(key==='morning,night')return `ดึก-เช้า • ${hours} ชม.`;
      if(key==='morning,afternoon,night')return '08:00 - 08:00 (+1 วัน)';
      return `${hours} ชม.`;
    }
    if(codes.some(c=>/^ชบด/.test(c)))return weekendHoliday(date)?'08:00 - 08:00 (+1 วัน)':'16:00 - 08:00 (+1 วัน)';
    if(codes.every(isCh4))return 'กรอกเวลาปั่นเลือดตามจริง หรือเลือกคนอยู่แทน';
    return '08:00 - 16:00';
  }
  function groupedDuties(){
    const staffId=sid(),month=selectedMonth(),assignments=S()?.rosterAssignments||[];
    let rows=[],usedEffective=false;
    try{
      const fn=window.cnmiTradeSegmentsV217?.effectiveAssignmentsForStaffDate;
      if(typeof fn==='function'){
        usedEffective=true;
        const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate();
        for(let day=1;day<=last;day++){
          const date=`${month}-${String(day).padStart(2,'0')}`;
          rows.push(...(fn(staffId,date,assignments)||[]));
        }
      }
    }catch(_){rows=[];}
    if(!usedEffective)rows=assignments.filter(a=>String(a?.staff_id||'')===staffId&&norm(a?.duty_date).startsWith(month));
    rows.sort((a,b)=>norm(a?.duty_date).localeCompare(norm(b?.duty_date))||String(a?.duty_code||'').localeCompare(String(b?.duty_code||''),'th'));
    const map=new Map();
    rows.forEach(row=>{const date=norm(row?.duty_date);if(!map.has(date))map.set(date,[]);map.get(date).push(row);});
    return {month,entries:[...map.entries()]};
  }
  function otFor(staffId,date){return (S()?.otRequests||[]).filter(r=>String(r?.staff_id||'')===staffId&&norm(r?.work_date)===date);}
  function confirmationFor(duty){
    const rows=S()?.shiftConfirmations||[];
    const date=norm(duty?.duty_date||duty?.work_date),owner=String(duty?.staff_id||duty?.owner_staff_id||''),code=String(duty?.duty_code||duty?.shift_type||''),aid=String(duty?.id||duty?.roster_assignment_id||'');
    return latest(rows.filter(r=>{
      const rDate=norm(r?.work_date||r?.duty_date),rOwner=String(r?.owner_staff_id||r?.staff_id||''),rCode=String(r?.duty_code||r?.shift_type||''),rAid=String(r?.roster_assignment_id||'');
      if(aid&&rAid&&aid===rAid)return true;
      return rDate===date&&rOwner===owner&&(rCode===code||(isCh4(rCode)&&isCh4(code)));
    }));
  }
  function ch4CoveredOrClosed(duties){
    const ch4=duties.filter(d=>isCh4(d?.duty_code));
    if(!ch4.length)return true;
    return ch4.every(d=>{
      const st=String(confirmationFor(d)?.status||'').trim().toLowerCase();
      return ['covered_by_other','no_claim','closed_no_claim','cancelled','canceled'].includes(st);
    });
  }
  function ch4OwnStatus(duties){
    const rec=latest(duties.filter(d=>isCh4(d?.duty_code)).map(confirmationFor).filter(Boolean));
    const st=String(rec?.status||'').trim().toLowerCase();
    if(st==='completed_self'||st==='confirmed_self')return 'ทำเองแล้ว — ยังไม่ได้ลงเวลาปั่นเลือด';
    if(st==='covered_by_other')return `มีคนอยู่แทนแล้ว${rec?.covered_by_name?`: ${rec.covered_by_name}`:''}`;
    if(['no_claim','closed_no_claim'].includes(st))return 'ปิดรายการแล้ว / ไม่เบิก';
    return 'ยังไม่ได้เลือกคนอยู่แทน หรือบันทึกเวลาปั่นเลือด';
  }
  function buildTrackingCard(){
    const staffId=sid(),{month,entries}=groupedDuties();
    const pending=entries.map(([date,duties])=>{
      const codes=duties.map(a=>String(a?.duty_code||'').trim()).filter(Boolean);
      const otRows=otFor(staffId,date),mainRequest=latest(otRows.filter(isAttendanceOt)),extraRequest=latest(otRows.filter(r=>!isAttendanceOt(r)));
      const hasMain=codes.some(code=>!isCh4(code)),hasCh4=codes.some(isCh4);
      const mainNeeds=hasMain&&requestNeedsAction(mainRequest);
      const extraSubmitted=!!extraRequest&&!requestNeedsAction(extraRequest);
      const ch4Needs=hasCh4&&!(ch4CoveredOrClosed(duties)||extraSubmitted);
      if(!mainNeeds&&!ch4Needs)return null;
      const mainText=mainRequest?statusText(mainRequest):'ยังไม่ได้แตะยืนยันเวร';
      const ch4Text=extraRequest&&requestNeedsAction(extraRequest)?statusText(extraRequest):ch4OwnStatus(duties);
      return `<article class="v429-duty-card">
        <div class="v429-duty-head"><div><span class="v429-duty-date">${esc(thaiDate(date))}</span><div class="v429-duty-codes">${duties.map(a=>`<span>${esc(a?._effective_label||dutyLabel(a?.duty_code))}</span>`).join('')}</div></div><span class="v429-time">${esc(timeText(date,codes,duties))}</span></div>
        <div class="v429-status-list">
          ${mainNeeds?`<div class="v429-status-row"><span>เวรหลัก — ยังต้องดำเนินการ</span>${statusBadge(mainText)}</div>`:''}
          ${ch4Needs?`<div class="v429-status-row"><span>ช4 / งานปั่นเลือด</span>${statusBadge(ch4Text)}</div>`:''}
        </div>
        <div class="v429-actions">
          ${mainNeeds?`<button type="button" class="ghost-btn" data-v429-open-confirm="${esc(date)}">${mainRequest?'กลับไปแก้ข้อ 2':'ไปข้อ 2 ยืนยันเวร'}</button>`:''}
          ${ch4Needs?`<button type="button" class="primary-btn" data-v429-open-extra="${esc(date)}">ไปข้อ 3 ลงเวลาปั่นเลือด</button>`:''}
        </div>
      </article>`;
    }).filter(Boolean).join('');
    return `<section class="card wide-card v429-duty-tracking-card" style="grid-column:1/-1">
      <div class="section-title"><div><h3>เวรของฉัน — รายการที่ยังต้องทำ</h3><p class="hint">รายการจะหายจากหน้านี้ทันทีเมื่อยืนยัน OT แล้ว หรือกรณี ช4 เมื่อเลือกคนอยู่แทน/บันทึกเวลาปั่นเลือดแล้ว</p></div></div>
      ${pending?`<div class="v429-duty-grid">${pending}</div>`:'<div class="empty">ไม่มีรายการที่ต้องติดตามในเดือนนี้</div>'}
    </section>`;
  }
  function enhance(html){
    if(isAdminSafe()||String(S()?.otMenuV369||'staff-track')!=='staff-track')return html;
    const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
    const content=tpl.content.querySelector('.v369-ot-content');
    if(!content)return html;
    content.innerHTML=buildTrackingCard();
    const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
  }

  const wrapped=function renderOtPageV429(){return enhance(previousRenderOtPage.apply(this,arguments));};
  try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}

  document.addEventListener('click',function(e){
    const confirm=e.target?.closest?.('[data-v429-open-confirm]');
    if(confirm){
      e.preventDefault();e.stopImmediatePropagation();
      S().myDutyDateV221=String(confirm.getAttribute('data-v429-open-confirm')||'').slice(0,10);
      S().otMenuV369='staff-confirm';S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
      return;
    }
    const extra=e.target?.closest?.('[data-v429-open-extra]');
    if(extra){
      e.preventDefault();e.stopImmediatePropagation();
      S().myDutyDateV221=String(extra.getAttribute('data-v429-open-extra')||'').slice(0,10);
      S().otMenuV369='staff-extra';S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
    }
  },true);

  const style=document.createElement('style');style.id='v429-staff-tracking-style';style.textContent=`
    .v429-duty-tracking-card{display:grid;gap:14px}.v429-duty-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v429-duty-card{display:grid;gap:12px;padding:15px;border:1px solid #d8e6f3;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 5px 14px rgba(30,64,175,.05)}
    .v429-duty-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v429-duty-date{display:block;font-size:1.06rem;font-weight:900;color:#20384f}.v429-duty-codes{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.v429-duty-codes span{padding:4px 8px;border-radius:999px;background:#eaf4ff;color:#1769b0;font-weight:850}.v429-time{max-width:48%;color:#5b7085;font-weight:750;text-align:right;line-height:1.35}
    .v429-status-list{display:grid;gap:8px}.v429-status-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:13px;background:#f4f8fc}.v429-status-row>span:first-child{font-weight:800;color:#35536c}.v429-actions{display:flex;gap:8px;flex-wrap:wrap}.v429-actions button{flex:1 1 180px}
    @media(max-width:760px){.v429-duty-grid{grid-template-columns:1fr}.v429-duty-card{padding:14px}.v429-duty-head{display:grid}.v429-time{max-width:none;text-align:left}.v429-status-row{align-items:flex-start;flex-direction:column}.v429-actions{display:grid;grid-template-columns:1fr}.v429-actions button{width:100%}}
  `;document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
