/* CNMI Staff Planner V443
 * Dashboard date navigation.
 * - Keep the existing "ภาพรวมวันนี้" layout, but allow viewing any loaded date.
 * - Previous / next day, native date picker, and one-tap return to today.
 * - All existing dashboard logic follows the selected date because todayStr is scoped
 *   to the selected date only while the dashboard renderer chain is running.
 * - Weekend / public-holiday manpower, helper count, roster, leave/no-duty, activities,
 *   leave/no-duty sequence, and daytime positions therefore reuse their existing rules.
 * - Display/navigation only. No schema/SQL/write changes.
 */
(function(){
  'use strict';
  const VERSION='V443_DASHBOARD_DATE_NAVIGATION';
  if(window.__CNMI_V443_DASHBOARD_DATE_NAVIGATION__)return;
  window.__CNMI_V443_DASHBOARD_DATE_NAVIGATION__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function pad(n){return String(n).padStart(2,'0');}
  function actualToday(){
    const d=new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function validDate(v){
    const s=String(v||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
    const [y,m,d]=s.split('-').map(Number),dt=new Date(y,m-1,d);
    return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?s:'';
  }
  function range(){
    const st=S(),fw=st.fiscalYearWindow||{};
    const now=new Date(),fallbackMin=`${now.getFullYear()-1}-01-01`,fallbackMax=`${now.getFullYear()+1}-12-31`;
    return {min:validDate(fw.calendarQueryStart)||fallbackMin,max:validDate(fw.calendarQueryEnd)||fallbackMax};
  }
  function clamp(v){
    const date=validDate(v)||actualToday(),r=range();
    if(date<r.min)return r.min;
    if(date>r.max)return r.max;
    return date;
  }
  function selectedDate(){
    const st=S();
    const value=clamp(st.dashboardDateV443||actualToday());
    st.dashboardDateV443=value;
    return value;
  }
  function setSelectedDate(v){
    const st=S();
    st.dashboardDateV443=clamp(v);
    try{if(st.page==='dashboard'&&typeof renderPage==='function')renderPage();}catch(err){console.warn('[V443] render selected date',err);}
  }
  function addDays(date,days){
    const [y,m,d]=String(date).split('-').map(Number),dt=new Date(y,m-1,d);
    dt.setDate(dt.getDate()+Number(days||0));
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  }
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v);}
    catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function thaiDate(date){
    try{return typeof formatThaiDate==='function'?String(formatThaiDate(date)):date;}
    catch(_){
      const [y,m,d]=String(date).split('-').map(Number);
      try{return new Date(y,m-1,d).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}catch(__){return date;}
    }
  }
  function weekday(date){
    const [y,m,d]=String(date).split('-').map(Number);
    try{return new Date(y,m-1,d).toLocaleDateString('th-TH',{weekday:'long'});}catch(_){return '';}
  }

  function dateNavHtml(date){
    const r=range(),isToday=date===actualToday();
    return `<div class="v443-dashboard-date-nav" data-v443-dashboard-date-nav>
      <button type="button" class="v443-date-step" data-v443-date-prev aria-label="วันก่อนหน้า" ${date<=r.min?'disabled':''}>‹</button>
      <div class="v443-date-current">
        <strong>${esc(thaiDate(date))}</strong>
        <span>${esc(weekday(date))}</span>
      </div>
      <button type="button" class="v443-date-step" data-v443-date-next aria-label="วันถัดไป" ${date>=r.max?'disabled':''}>›</button>
      <label class="v443-date-picker" title="เลือกวันที่">
        <span>เลือกวันที่</span>
        <input type="date" data-v443-date-input value="${esc(date)}" min="${esc(r.min)}" max="${esc(r.max)}" aria-label="เลือกวันที่สำหรับภาพรวม">
      </label>
      <button type="button" class="v443-today-btn${isToday?' is-current':''}" data-v443-date-today ${isToday?'disabled':''}>วันนี้</button>
    </div>`;
  }

  function replaceDirectText(el,from,to){
    if(!el)return;
    [...el.childNodes].forEach(node=>{
      if(node.nodeType!==Node.TEXT_NODE)return;
      const text=String(node.nodeValue||'');
      if(text.includes(from))node.nodeValue=text.replace(from,to);
    });
  }
  function neutralizeSelectedDateLabels(root){
    // Selector above is the source of truth for the date; keep the cards compact when browsing another day.
    root.querySelectorAll('.stat-card .label').forEach(el=>{
      const t=String(el.textContent||'').trim();
      if(t==='คนลาวันนี้')el.textContent='คนลา';
      else if(t==='กิจกรรมวันนี้')el.textContent='กิจกรรม';
      else if(t==='คนไม่รับเวรวันนี้')el.textContent='คนไม่รับเวร';
      else if(t==='คนอบรมวันนี้')el.textContent='คนอบรม';
      else if(t==='คนออกหน่วยวันนี้')el.textContent='คนออกหน่วย';
      else if(t==='ประชุมวันนี้')el.textContent='ประชุม';
    });
    root.querySelectorAll('.section-title h3').forEach(el=>{
      const t=String(el.textContent||'').trim();
      const map={
        'เวรวันนี้':'เวร',
        'ลา / ไม่รับเวรวันนี้':'ลา / ไม่รับเวร',
        'กิจกรรมวันนี้':'กิจกรรม',
        'ตำแหน่งกลางวันวันนี้':'ตำแหน่งกลางวัน'
      };
      if(map[t])el.textContent=map[t];
    });
    root.querySelectorAll('.v433-manpower-title').forEach(el=>{
      replaceDirectText(el,'กำลังคนตามเวรวันนี้','กำลังคนตามเวร');
      replaceDirectText(el,'กำลังคนวันนี้','กำลังคน');
    });
    root.querySelectorAll('.v440-detail-lines b').forEach(el=>{if(String(el.textContent||'').trim()==='เวรวันนี้')el.textContent='เวร';});
    root.querySelectorAll('.empty-state').forEach(el=>{
      const t=String(el.textContent||'').trim();
      if(t==='ยังไม่มีตารางเวรวันนี้')el.textContent='ยังไม่มีตารางเวรในวันที่เลือก';
      else if(t==='วันนี้ไม่มีรายการลา/ไม่รับเวร')el.textContent='ไม่มีรายการลา/ไม่รับเวรในวันที่เลือก';
      else if(t==='วันนี้ไม่มีกิจกรรม')el.textContent='ไม่มีกิจกรรมในวันที่เลือก';
    });
  }

  function renderWithSelectedDate(oldDashboard,ctx,args){
    const date=selectedDate();
    const originalWindowToday=window.todayStr;
    let originalBinding=null;
    try{originalBinding=typeof todayStr==='function'?todayStr:null;}catch(_){originalBinding=null;}
    const forced=()=>date;
    let html='';
    try{
      try{window.todayStr=forced;todayStr=forced;}catch(_){window.todayStr=forced;}
      html=String(oldDashboard.apply(ctx,args)||'');
    }finally{
      try{
        if(originalBinding){window.todayStr=originalBinding;todayStr=originalBinding;}
        else if(originalWindowToday)window.todayStr=originalWindowToday;
      }catch(_){if(originalWindowToday)window.todayStr=originalWindowToday;}
    }
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      if(date!==actualToday())neutralizeSelectedDateLabels(tpl.content);
      if(!tpl.content.querySelector('[data-v443-dashboard-date-nav]')){
        const nav=document.createElement('template');nav.innerHTML=dateNavHtml(date).trim();
        tpl.content.insertBefore(nav.content.firstElementChild,tpl.content.firstChild);
      }
      const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));
      html=holder.innerHTML;
    }catch(err){console.warn('[V443] dashboard date navigation decoration',err);}
    return html;
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV443(){return renderWithSelectedDate(oldDashboard,this,arguments);};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function syncHeader(){
    const st=S();
    if(st.page!=='dashboard')return;
    const date=selectedDate(),isToday=date===actualToday();
    const title=document.getElementById('pageTitle'),subtitle=document.getElementById('pageSubtitle');
    if(title)title.textContent=isToday?'ภาพรวมวันนี้':`ภาพรวมวันที่ ${thaiDate(date)}`;
    if(subtitle)subtitle.textContent=isToday?'สรุปภาพรวมทั้งหมดของวันนี้':'สรุปภาพรวมของวันที่เลือก';
  }
  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV443(){
      const result=oldRenderPage.apply(this,arguments);
      try{syncHeader();}catch(err){console.warn('[V443] dashboard header sync',err);}
      return result;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  document.addEventListener('click',function(e){
    const prev=e.target?.closest?.('[data-v443-date-prev]');
    const next=e.target?.closest?.('[data-v443-date-next]');
    const now=e.target?.closest?.('[data-v443-date-today]');
    if(!prev&&!next&&!now)return;
    e.preventDefault();
    if((prev||next)?.disabled||now?.disabled)return;
    const current=selectedDate();
    if(prev)setSelectedDate(addDays(current,-1));
    else if(next)setSelectedDate(addDays(current,1));
    else setSelectedDate(actualToday());
  },true);

  document.addEventListener('change',function(e){
    const input=e.target?.closest?.('[data-v443-date-input]');
    if(!input)return;
    const value=validDate(input.value);
    if(!value)return;
    setSelectedDate(value);
  },true);

  window.cnmiDashboardDateV443={selectedDate,setSelectedDate,actualToday,range,addDays};

  const style=document.createElement('style');
  style.id='cnmi-v443-dashboard-date-navigation';
  style.textContent=`
    .v443-dashboard-date-nav{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:0 0 14px;padding:9px 10px;border:1px solid #dce8f2;border-radius:14px;background:#fff;box-shadow:0 4px 14px rgba(35,74,105,.04)}
    .v443-date-step,.v443-today-btn,.v443-date-picker{height:34px;border:1px solid #d9e6ef;border-radius:10px;background:#f8fbfd;color:#2d5878;font:inherit;font-weight:850}
    .v443-date-step{width:38px;padding:0;font-size:24px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
    .v443-date-step:disabled{opacity:.35;cursor:default}
    .v443-date-current{min-width:150px;text-align:center;display:grid;line-height:1.15;padding:0 4px}
    .v443-date-current strong{font-size:14px;color:#243c55;font-weight:900}.v443-date-current span{font-size:10px;color:#7b8fa2;font-weight:750;margin-top:2px}
    .v443-date-picker{position:relative;display:inline-flex;align-items:center;justify-content:center;padding:0 12px;cursor:pointer;overflow:hidden;background:#eef7fd;border-color:#cde3f1;color:#2475a9;font-size:11px}
    .v443-date-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
    .v443-today-btn{padding:0 12px;cursor:pointer;font-size:11px;background:#fff}.v443-today-btn.is-current{opacity:.42;cursor:default}
    @media(max-width:820px){
      .v443-dashboard-date-nav{justify-content:flex-start;gap:7px;margin-bottom:13px;padding:9px;border-radius:13px}
      .v443-date-current{min-width:128px;flex:1}.v443-date-current strong{font-size:13px}.v443-date-current span{font-size:10px}
      .v443-date-picker,.v443-today-btn{height:32px;font-size:10px}.v443-date-step{height:32px;width:34px}
    }
    @media(max-width:390px){
      .v443-date-current{min-width:105px}.v443-date-picker{padding:0 10px}.v443-today-btn{padding:0 10px}
    }
  `;
  document.head.appendChild(style);
  console.info(`${VERSION} loaded`);
})();
