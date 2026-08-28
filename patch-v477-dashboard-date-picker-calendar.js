/* CNMI Staff Planner V477
 * Reliable dashboard date picker.
 * - Fixes the "เลือกวันที่" control on Dashboard when the transparent native
 *   <input type=date> does not open in some Chrome/PWA/device combinations.
 * - Uses a small in-app calendar, while keeping V443 previous/next/today logic.
 * - Display/navigation only. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V477_DASHBOARD_DATE_PICKER_CALENDAR';
  if(window.__CNMI_V477_DASHBOARD_DATE_PICKER_CALENDAR__)return;
  window.__CNMI_V477_DASHBOARD_DATE_PICKER_CALENDAR__=true;

  const pad=n=>String(n).padStart(2,'0');
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function api(){return window.cnmiDashboardDateV443||null;}
  function validDate(v){
    const s=String(v||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
    const [y,m,d]=s.split('-').map(Number),dt=new Date(y,m-1,d);
    return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?s:'';
  }
  function dateParts(s){const [y,m,d]=String(s).split('-').map(Number);return {y,m,d};}
  function ymd(y,m,d){return `${y}-${pad(m)}-${pad(d)}`;}
  function today(){
    try{return validDate(api()?.actualToday?.())||'';}catch(_){return '';}
  }
  function selected(){
    try{return validDate(api()?.selectedDate?.())||today();}catch(_){return today();}
  }
  function range(){
    try{
      const r=api()?.range?.()||{};
      return {min:validDate(r.min)||'1900-01-01',max:validDate(r.max)||'2999-12-31'};
    }catch(_){return {min:'1900-01-01',max:'2999-12-31'};}
  }
  function monthLabel(y,m){
    try{return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return `${m}/${y}`;}
  }
  function inRange(s){const r=range();return s>=r.min&&s<=r.max;}
  function monthHasSelectable(y,m){
    const first=ymd(y,m,1),last=ymd(y,m,new Date(y,m,0).getDate()),r=range();
    return last>=r.min&&first<=r.max;
  }
  function shiftMonth(y,m,delta){
    const dt=new Date(y,m-1+delta,1);
    return {y:dt.getFullYear(),m:dt.getMonth()+1};
  }

  let overlay=null;
  let view=null;
  function close(){
    if(overlay){overlay.remove();overlay=null;view=null;}
  }
  function dayButton(date,day,isSelected,isToday){
    const disabled=!inRange(date);
    const cls=['v477-day'];
    if(isSelected)cls.push('is-selected');
    if(isToday)cls.push('is-today');
    return `<button type="button" class="${cls.join(' ')}" data-v477-day="${esc(date)}" ${disabled?'disabled':''}>${day}</button>`;
  }
  function renderCalendar(){
    if(!overlay||!view)return;
    const {y,m}=view,sel=selected(),now=today(),firstDow=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate();
    const prev=shiftMonth(y,m,-1),next=shiftMonth(y,m,1);
    let cells='';
    for(let i=0;i<firstDow;i++)cells+='<span class="v477-day-spacer"></span>';
    for(let d=1;d<=days;d++){
      const date=ymd(y,m,d);
      cells+=dayButton(date,d,date===sel,date===now);
    }
    const body=overlay.querySelector('[data-v477-calendar-body]');
    if(!body)return;
    body.innerHTML=`
      <div class="v477-calendar-head">
        <button type="button" class="v477-month-step" data-v477-prev-month ${monthHasSelectable(prev.y,prev.m)?'':'disabled'} aria-label="เดือนก่อนหน้า">‹</button>
        <strong>${esc(monthLabel(y,m))}</strong>
        <button type="button" class="v477-month-step" data-v477-next-month ${monthHasSelectable(next.y,next.m)?'':'disabled'} aria-label="เดือนถัดไป">›</button>
      </div>
      <div class="v477-weekdays"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>
      <div class="v477-days">${cells}</div>
      <div class="v477-calendar-actions">
        <button type="button" class="v477-action" data-v477-close>ยกเลิก</button>
        <button type="button" class="v477-action primary" data-v477-today ${inRange(now)?'':'disabled'}>วันนี้</button>
      </div>`;
  }
  function open(){
    close();
    const sel=selected();
    if(!sel)return;
    const p=dateParts(sel);view={y:p.y,m:p.m};
    overlay=document.createElement('div');
    overlay.className='v477-date-overlay';
    overlay.setAttribute('data-v477-date-overlay','');
    overlay.innerHTML=`<div class="v477-date-dialog" role="dialog" aria-modal="true" aria-label="เลือกวันที่สำหรับภาพรวม"><div data-v477-calendar-body></div></div>`;
    document.body.appendChild(overlay);
    renderCalendar();
    try{overlay.querySelector('.v477-date-dialog')?.focus?.();}catch(_){ }
  }
  function choose(date){
    const d=validDate(date);if(!d||!inRange(d))return;
    close();
    try{api()?.setSelectedDate?.(d);}catch(err){console.warn('[V477] set selected date',err);}
  }

  document.addEventListener('click',function(e){
    const picker=e.target?.closest?.('.v443-date-picker');
    if(picker){
      e.preventDefault();
      e.stopPropagation();
      open();
      return;
    }
    if(!overlay)return;
    const day=e.target?.closest?.('[data-v477-day]');
    if(day){e.preventDefault();choose(day.getAttribute('data-v477-day'));return;}
    const prev=e.target?.closest?.('[data-v477-prev-month]');
    if(prev&&!prev.disabled){e.preventDefault();view=shiftMonth(view.y,view.m,-1);renderCalendar();return;}
    const next=e.target?.closest?.('[data-v477-next-month]');
    if(next&&!next.disabled){e.preventDefault();view=shiftMonth(view.y,view.m,1);renderCalendar();return;}
    const now=e.target?.closest?.('[data-v477-today]');
    if(now&&!now.disabled){e.preventDefault();choose(today());return;}
    if(e.target?.closest?.('[data-v477-close]')){e.preventDefault();close();return;}
    if(e.target===overlay){e.preventDefault();close();}
  },true);

  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay)close();},true);

  const style=document.createElement('style');
  style.id='cnmi-v477-dashboard-date-picker-calendar';
  style.textContent=`
    .v443-date-picker input[data-v443-date-input]{pointer-events:none!important}
    .v477-date-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(25,47,66,.42);backdrop-filter:blur(2px)}
    .v477-date-dialog{width:min(390px,calc(100vw - 28px));background:#fff;border:1px solid #dbe7f0;border-radius:20px;box-shadow:0 22px 70px rgba(15,45,70,.25);padding:16px;color:#263d53}
    .v477-calendar-head{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;margin-bottom:12px}.v477-calendar-head strong{text-align:center;font-size:18px;font-weight:900}
    .v477-month-step{height:40px;border:1px solid #d8e6ef;border-radius:12px;background:#f7fbfe;color:#276f9d;font:inherit;font-size:25px;font-weight:900;cursor:pointer}.v477-month-step:disabled{opacity:.32;cursor:default}
    .v477-weekdays,.v477-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.v477-weekdays{margin-bottom:6px;color:#7a8ea0;font-size:11px;font-weight:850;text-align:center}.v477-weekdays span{padding:4px 0}
    .v477-day,.v477-day-spacer{aspect-ratio:1/1;min-height:36px}.v477-day{border:1px solid #e1eaf1;border-radius:11px;background:#fff;color:#2b4054;font:inherit;font-size:13px;font-weight:800;cursor:pointer}.v477-day:hover{background:#eef8fe;border-color:#b7d9ed}.v477-day:disabled{opacity:.28;cursor:default;background:#f6f8fa}.v477-day.is-today{box-shadow:inset 0 0 0 2px #b8ddf2}.v477-day.is-selected{background:#2788c4;color:#fff;border-color:#2788c4;box-shadow:none}
    .v477-calendar-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #edf2f6}.v477-action{height:38px;padding:0 16px;border:1px solid #d8e6ef;border-radius:11px;background:#fff;color:#47667f;font:inherit;font-size:12px;font-weight:850;cursor:pointer}.v477-action.primary{background:#e9f6fd;border-color:#bee0f2;color:#1676ac}.v477-action:disabled{opacity:.35;cursor:default}
    @media(max-width:520px){.v477-date-overlay{align-items:flex-end;padding:0}.v477-date-dialog{width:100%;max-width:none;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));}.v477-day,.v477-day-spacer{min-height:42px}.v477-calendar-head strong{font-size:19px}}
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
