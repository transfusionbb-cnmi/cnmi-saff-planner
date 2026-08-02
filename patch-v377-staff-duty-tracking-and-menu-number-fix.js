/* CNMI Staff Planner V377
   Staff OT fixes:
   1) Menu 1 always shows the staff member's duty list and whether OT was tapped/requested.
   2) Staff-facing explanations point to menu 3: ขอ OT เพิ่ม / เวรปั่นเลือด.
*/
(function(){
  'use strict';
  const VERSION='V377_STAFF_DUTY_TRACKING_AND_MENU_NUMBER_FIX';
  if(window.__CNMI_V377_STAFF_DUTY_TRACKING_AND_MENU_NUMBER_FIX__)return;
  window.__CNMI_V377_STAFF_DUTY_TRACKING_AND_MENU_NUMBER_FIX__=true;

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);

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
  function latest(rows){return (rows||[]).slice().sort((a,b)=>String(b?.created_at||b?.updated_at||'').localeCompare(String(a?.created_at||a?.updated_at||'')))[0]||null;}
  function isAttendanceOt(row){
    const text=`${row?.reason||''} ${row?.note||''} ${row?.device||''}`;
    return /ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|V220_OT_APPROVAL|V219_OT_REPAIR|V221_DUTY_DATE/i.test(text);
  }
  function statusText(row){
    const raw=String(row?.status||'').trim();
    const low=raw.toLowerCase();
    if(!raw||raw==='รออนุมัติ'||low==='pending')return 'รอ Admin อนุมัติ';
    if(raw==='อนุมัติ'||low==='approved')return 'อนุมัติแล้ว';
    if(raw==='ไม่อนุมัติ'||low==='rejected')return 'ไม่อนุมัติ';
    if(raw==='ส่งกลับแก้ไข'||/return|edit/i.test(raw))return 'ส่งกลับแก้ไข';
    return raw;
  }
  function statusClass(text){
    const t=String(text||'');
    if(/อนุมัติแล้ว/.test(t))return 'green';
    if(/ไม่อนุมัติ|ส่งกลับ/.test(t))return 'red';
    if(/รอ Admin|รออนุมัติ|แตะแล้ว/.test(t))return 'orange';
    return 'black';
  }
  function statusBadge(text){
    try{return badge(text,statusClass(text));}
    catch(_){return `<span class="badge ${esc(statusClass(text))}">${esc(text)}</span>`;}
  }
  function isCh4(code){return /^ช4(?:A|B)?$/.test(String(code||'').trim());}
  function isCh3(code){return /^ช3[AB]$/.test(String(code||'').trim());}
  function weekendHoliday(date){
    try{return (typeof isWeekend==='function'&&isWeekend(date))||(typeof isHolidayDate==='function'&&isHolidayDate(date));}
    catch(_){const d=new Date(`${norm(date)}T00:00:00`).getDay();return d===0||d===6;}
  }
  function timeText(date,codes){
    if(codes.some(c=>/^ชบด/.test(c)))return weekendHoliday(date)?'08:00 - 08:00 (+1 วัน)':'16:00 - 08:00 (+1 วัน)';
    if(codes.some(isCh3))return '08:00 - 16:00 (เวรหลัก 8 ชม.) + เวลาปั่นเลือดตามจริง';
    if(codes.every(isCh4))return 'กรอกเวลาทำจริงในข้อ 3';
    return '08:00 - 16:00 (เวรหลัก 8 ชม.)';
  }
  function groupedDuties(){
    const staffId=sid();
    const month=selectedMonth();
    const rows=(S()?.rosterAssignments||[])
      .filter(a=>String(a?.staff_id||'')===staffId&&norm(a?.duty_date).startsWith(month))
      .sort((a,b)=>norm(a?.duty_date).localeCompare(norm(b?.duty_date))||String(a?.duty_code||'').localeCompare(String(b?.duty_code||''),'th'));
    const map=new Map();
    rows.forEach(row=>{
      const date=norm(row?.duty_date);
      if(!map.has(date))map.set(date,[]);
      map.get(date).push(row);
    });
    return {month,entries:[...map.entries()]};
  }
  function attendanceFor(staffId,date){
    return (S()?.attendance||[]).filter(a=>String(a?.staff_id||'')===staffId&&norm(a?.duty_date)===date);
  }
  function otFor(staffId,date){
    return (S()?.otRequests||[]).filter(r=>String(r?.staff_id||'')===staffId&&norm(r?.work_date)===date);
  }
  function buildTrackingCard(){
    const staffId=sid();
    const {month,entries}=groupedDuties();
    const cards=entries.map(([date,duties])=>{
      const codes=duties.map(a=>String(a?.duty_code||'').trim()).filter(Boolean);
      const otRows=otFor(staffId,date);
      const mainRequest=latest(otRows.filter(isAttendanceOt));
      const extraRequest=latest(otRows.filter(r=>!isAttendanceOt(r)));
      const hasMain=codes.some(code=>!isCh4(code));
      const needsExtra=codes.some(code=>isCh4(code)||isCh3(code));
      const attendance=attendanceFor(staffId,date);
      const mainStatus=!hasMain?'ไม่มีเวรหลักที่ต้องแตะ':(mainRequest?statusText(mainRequest):(attendance.length?'แตะแล้ว แต่ยังไม่พบรายการ OT':'ยังไม่ได้แตะยืนยันเวร'));
      const extraStatus=extraRequest?statusText(extraRequest):'ยังไม่ได้ขอ OT เพิ่ม';
      return `<article class="v377-duty-card">
        <div class="v377-duty-head"><div><span class="v377-duty-date">${esc(thaiDate(date))}</span><div class="v377-duty-codes">${codes.map(code=>`<span>${esc(dutyLabel(code))}</span>`).join('')}</div></div><span class="v377-time">${esc(timeText(date,codes))}</span></div>
        <div class="v377-status-list">
          ${hasMain?`<div class="v377-status-row"><span>เวรหลัก — แตะยืนยันแล้วหรือยัง</span>${statusBadge(mainStatus)}</div>`:''}
          ${needsExtra?`<div class="v377-status-row"><span>ข้อ 3 ขอ OT เพิ่ม / เวรปั่นเลือด</span>${statusBadge(extraStatus)}</div>`:''}
        </div>
        <div class="v377-actions">
          ${hasMain?`<button type="button" class="ghost-btn" data-v377-open-confirm="${esc(date)}">${mainRequest?'ดูข้อ 2 ยืนยันเวร':'ไปข้อ 2 ยืนยันเวร'}</button>`:''}
          ${needsExtra?`<button type="button" class="primary-btn" data-v377-open-extra="${esc(date)}">${extraRequest?'ดู/กรอกเพิ่มในข้อ 3':'ไปข้อ 3 ขอ OT เพิ่ม'}</button>`:''}
        </div>
      </article>`;
    }).join('');
    return `<section class="card wide-card v377-duty-tracking-card" style="grid-column:1/-1">
      <div class="section-title"><div><h3>เวรของฉัน — แตะขอ OT แล้วหรือยัง</h3><p class="hint">แสดงเวรของเดือน ${esc(thaiMonth(month))} พร้อมแยกสถานะ “เวรหลัก” และ “ข้อ 3 ขอ OT เพิ่ม / เวรปั่นเลือด” ให้เห็นชัดเจน</p></div></div>
      ${entries.length?`<div class="v377-duty-grid">${cards}</div>`:'<div class="empty">ยังไม่มีเวรของฉันในเดือนนี้</div>'}
    </section>`;
  }
  function replaceStaffExplanations(html){
    return String(html||'')
      .replace(/กรอกเพิ่มในส่วนที่\s*2\s*ตามเวลาจริง/g,'กรอกเพิ่มในข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด” ตามเวลาจริง')
      .replace(/กรอก OT จริงในส่วนที่\s*2/g,'กรอก OT จริงในข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”')
      .replace(/เวลาจริงในส่วนที่\s*2/g,'เวลาจริงในข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”')
      .replace(/ใช้ส่วนที่\s*2\s*เพื่อขอ OT เพิ่ม/g,'ใช้ข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”')
      .replace(/ฟอร์ม “ขอ OT เพิ่ม \/ เวรปั่นเลือด”/g,'ข้อ 3 “ขอ OT เพิ่ม / เวรปั่นเลือด”');
  }
  function enhance(html){
    if(isAdminSafe())return html;
    const active=String(S()?.otMenuV369||'staff-track');
    let output=replaceStaffExplanations(html);
    if(active!=='staff-track')return output;
    const tpl=document.createElement('template');
    tpl.innerHTML=output;
    const content=tpl.content.querySelector('.v369-ot-content');
    if(content){
      content.innerHTML=buildTrackingCard();
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
    }
    return output;
  }

  if(typeof previousRenderOtPage==='function'){
    const wrapped=function renderOtPageV377(){return enhance(previousRenderOtPage.apply(this,arguments));};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  document.addEventListener('click',function(e){
    const confirm=e.target?.closest?.('[data-v377-open-confirm]');
    if(confirm){
      e.preventDefault();
      S().myDutyDateV221=String(confirm.getAttribute('data-v377-open-confirm')||'').slice(0,10);
      S().otMenuV369='staff-confirm';
      S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
      return;
    }
    const extra=e.target?.closest?.('[data-v377-open-extra]');
    if(extra){
      e.preventDefault();
      S().myDutyDateV221=String(extra.getAttribute('data-v377-open-extra')||'').slice(0,10);
      S().otMenuV369='staff-extra';
      S().otSubtabV241='mine';
      try{renderPage();}catch(_){}
    }
  },true);

  const style=document.createElement('style');
  style.id='v377-staff-duty-tracking-style';
  style.textContent=`
    .v377-duty-tracking-card{display:grid;gap:14px}.v377-duty-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v377-duty-card{display:grid;gap:12px;padding:15px;border:1px solid #d8e6f3;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 5px 14px rgba(30,64,175,.05)}
    .v377-duty-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v377-duty-date{display:block;font-size:1.06rem;font-weight:900;color:#20384f}.v377-duty-codes{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.v377-duty-codes span{padding:4px 8px;border-radius:999px;background:#eaf4ff;color:#1769b0;font-weight:850}.v377-time{max-width:48%;color:#5b7085;font-weight:750;text-align:right;line-height:1.35}
    .v377-status-list{display:grid;gap:8px}.v377-status-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:13px;background:#f4f8fc}.v377-status-row>span:first-child{font-weight:800;color:#35536c}.v377-actions{display:flex;gap:8px;flex-wrap:wrap}.v377-actions button{flex:1 1 180px}
    @media(max-width:760px){.v377-duty-grid{grid-template-columns:1fr}.v377-duty-card{padding:14px}.v377-duty-head{display:grid}.v377-time{max-width:none;text-align:left}.v377-status-row{align-items:flex-start;flex-direction:column}.v377-actions{display:grid;grid-template-columns:1fr}.v377-actions button{width:100%}}
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
