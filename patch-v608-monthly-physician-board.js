/* V608: Embed physician roster after monthly staff roster with board-style layout */
(()=>{'use strict';
if(window.__CNMI_V608_MONTHLY_PHYSICIAN_BOARD__)return;window.__CNMI_V608_MONTHLY_PHYSICIAN_BOARD__=true;
const VERSION='V608_MONTHLY_PHYSICIAN_BOARD';
function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}catch(_){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
function pad(n){return String(n).padStart(2,'0');}
function monthKey(){
  const key=String(S()?.monthKey||'').slice(0,7);
  if(/^\d{4}-\d{2}$/.test(key))return key;
  try{const url=new URL(location.href);const q=url.hash.split('?')[1]||url.searchParams.get('month')||'';const m=String(q).match(/(?:^|&)month=(\d{4}-\d{2})(?:&|$)/);if(m)return m[1];}catch(_){ }
  try{const el=document.getElementById('rosterMonthInput');if(el&&/^\d{4}-\d{2}$/.test(el.value))return el.value;}catch(_){ }
  const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function monthDates(key){if(!/^\d{4}-\d{2}$/.test(String(key||'')))return[];const [y,m]=key.split('-').map(Number);const last=new Date(y,m,0).getDate();return Array.from({length:last},(_,i)=>`${key}-${pad(i+1)}`);}
function thaiMonth(key){try{const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}catch(_){return key;}}
function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):new Date(`${date}T12:00:00`).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}catch(_){return date;}}
function dayShort(date){try{return new Date(`${date}T12:00:00`).toLocaleDateString('th-TH',{weekday:'short'});}catch(_){return '';}}
function isWeekend(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
function isHoliday(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
function staffName(id,long=false){const p=staffById(id);if(!p)return 'ยังไม่กำหนด';return p[long?'full_name':'nickname']||p.full_name||p.nickname||p.name||p.email||'แพทย์';}
function api(){return window.cnmiPhysicianConsultV452||null;}
function ensureLoaded(){try{return api()?.ensureLoaded?.();}catch(_){return null;}}
function doctorPill(id,kind='generic',full=false){if(!id)return '<span class="v608-pill v608-pill-empty">-</span>';return `<span class="v608-pill ${esc(`v608-pill-${kind}`)}" title="${esc(staffName(id,true))}">${esc(staffName(id,full))}</span>`;}
function tinyPill(text,kind='meta'){return `<span class="v608-mini ${esc(`v608-mini-${kind}`)}">${esc(text)}</span>`;}
function buildBoard(key){
  const a=api();
  if(!a)return '<div class="card v608-physician-state">ไม่พบโมดูลตารางเวรแพทย์</div>';
  if(a.cache?.unavailable)return '<div class="card v608-physician-state">ยังไม่เปิดใช้งานฐานข้อมูลตารางเวรแพทย์</div>';
  if(!a.cache?.loaded){ensureLoaded();return '<div class="card v608-physician-state">กำลังโหลดตารางเวรแพทย์…</div>';}
  const dates=monthDates(key),models=dates.map(date=>({date,m:a.baseForDate?.(date)||{}}));
  const readyDay=models.filter(x=>x.m.weekday).reduce((n,x)=>n+((x.m.donor?1:0)+(x.m.bb?1:0)),0);
  const totalDay=models.filter(x=>x.m.weekday).length*2;
  const readyCall=models.reduce((n,x)=>n+(x.m.combined?1:0),0);
  const totalCall=models.length;

  const head=`<thead><tr><th class="v608-sticky-col">เวร/ห้อง</th>${models.map(x=>{
    const off=isWeekend(x.date)||isHoliday(x.date);const cls=off?'v608-offday-head':'';
    return `<th class="${cls}"><div class="v608-day-num">${Number(String(x.date).slice(8))}</div><div class="v608-day-dow">${esc(dayShort(x.date))}</div></th>`;
  }).join('')}</tr></thead>`;

  const row=(label,sub,renderer,rowClass='')=>`<tr class="${rowClass}"><th class="v608-sticky-col"><div class="v608-row-title">${esc(label)}</div><small>${esc(sub)}</small></th>${models.map(x=>renderer(x)).join('')}</tr>`;

  const donorRow=row('ในเวลา · Donor','08:00–16:00',x=>{
    const off=isWeekend(x.date)||isHoliday(x.date);
    if(off)return `<td class="v608-cell v608-cell-muted"><span class="v608-empty-note">หยุด</span></td>`;
    return `<td class="v608-cell">${doctorPill(x.m.donor,'donor')}</td>`;
  },'v608-row-day');
  const bbRow=row('ในเวลา · Blood Bank','08:00–16:00',x=>{
    const off=isWeekend(x.date)||isHoliday(x.date);
    if(off)return `<td class="v608-cell v608-cell-muted"><span class="v608-empty-note">หยุด</span></td>`;
    return `<td class="v608-cell">${doctorPill(x.m.bb,'bb')}</td>`;
  },'v608-row-day');
  const callRow=row('นอกเวลา / วันหยุด','วันธรรมดา 16:00–08:00 · วันหยุด 24 ชม.',x=>{
    const off=isWeekend(x.date)||isHoliday(x.date);
    return `<td class="v608-cell ${off?'v608-cell-offday':''}">${doctorPill(x.m.combined,'oncall')}${tinyPill(off?'24 ชม.':'16–08','time')}</td>`;
  },'v608-row-call');

  const daytimeTable=`<div class="v608-detail-card"><div class="v608-detail-head"><h4>สรุปในเวลา</h4><span class="v608-stat">พร้อม ${readyDay}/${totalDay}</span></div><div class="v608-detail-scroll"><table><thead><tr><th>วันที่</th><th>Donor</th><th>Blood Bank</th></tr></thead><tbody>${models.filter(x=>x.m.weekday).map(x=>`<tr><td>${esc(thaiDate(x.date))} <small>${esc(dayShort(x.date))}</small></td><td>${doctorPill(x.m.donor,'donor',true)}</td><td>${doctorPill(x.m.bb,'bb',true)}</td></tr>`).join('')||'<tr><td colspan="3">ไม่มีวันทำการในเดือนนี้</td></tr>'}</tbody></table></div></div>`;
  const offdayTable=`<div class="v608-detail-card"><div class="v608-detail-head"><h4>สรุปนอกเวลา / วันหยุด</h4><span class="v608-stat">พร้อม ${readyCall}/${totalCall}</span></div><div class="v608-detail-scroll"><table><thead><tr><th>วันที่</th><th>ช่วงเวลา</th><th>แพทย์</th></tr></thead><tbody>${models.map(x=>{const off=isWeekend(x.date)||isHoliday(x.date);return `<tr><td>${esc(thaiDate(x.date))} <small>${esc(dayShort(x.date))}</small></td><td>${off?'ตลอดวัน (วันหยุด)':'16:00–08:00'}</td><td>${doctorPill(x.m.combined,'oncall',true)}</td></tr>`;}).join('')}</tbody></table></div></div>`;

  return `<section class="card v608-physician-month" data-v608-physician-month>
    <div class="section-title v608-header"><div><h3>ตารางเวรแพทย์</h3><p class="hint">แสดงต่อจากตารางเวรประจำเดือน · ดูว่าแพทย์ในเวลาอยู่ห้องไหน และนอกเวลาใครรับผิดชอบวันไหน</p></div><div class="v608-header-meta"><span class="badge blue">${esc(thaiMonth(key))}</span><span class="badge green">ในเวลา ${readyDay}/${totalDay}</span><span class="badge yellow">นอกเวลา ${readyCall}/${totalCall}</span></div></div>
    <div class="v608-board-wrap"><table class="v608-board">${head}<tbody>${donorRow}${bbRow}${callRow}</tbody></table></div>
    <div class="v608-legend"><span><i class="v608-dot donor"></i> Donor</span><span><i class="v608-dot bb"></i> Blood Bank</span><span><i class="v608-dot oncall"></i> นอกเวลา / วันหยุด</span><span><i class="v608-dot off"></i> วันหยุด/เสาร์-อาทิตย์</span></div>
    <div class="v608-detail-grid">${daytimeTable}${offdayTable}</div>
  </section>`;
}
function insertSection(html,key){
  try{
    const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
    tpl.content.querySelectorAll('[data-v462-physician-month],.v462-physician-month-card,[data-v608-physician-month]').forEach(x=>x.remove());
    const sectionHtml=buildBoard(key);
    if(!sectionHtml)return html;
    const t=document.createElement('template');t.innerHTML=sectionHtml.trim();
    const section=t.content.firstElementChild;if(!section)return html;
    const capture=tpl.content.querySelector('#scheduleCaptureArea');
    if(capture?.parentNode)capture.parentNode.insertBefore(section,capture.nextSibling);
    else (tpl.content.firstElementChild||tpl.content).appendChild(section);
    const holder=document.createElement('div');holder.appendChild(tpl.content.cloneNode(true));return holder.innerHTML;
  }catch(err){console.warn('[V608] insertSection',err);return `${html||''}${buildBoard(key)}`;}
}
const previousMonthly=window.renderMonthlySchedulePage||(typeof renderMonthlySchedulePage==='function'?renderMonthlySchedulePage:null);
if(typeof previousMonthly==='function'){
  const wrapped=function renderMonthlySchedulePageV608(){const key=monthKey();return insertSection(previousMonthly.apply(this,arguments),key);};
  try{window.renderMonthlySchedulePage=renderMonthlySchedulePage=wrapped;}catch(_){window.renderMonthlySchedulePage=wrapped;}
}
const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
if(typeof previousRender==='function'){
  const wrapped=function renderPageV608(){const ret=previousRender.apply(this,arguments);try{
    const page=String(S().page||'');
    if(['schedule','roster'].includes(page)){
      const root=document.getElementById('pageContent');
      if(root && !root.querySelector('[data-v608-physician-month]')){
        const capture=root.querySelector('#scheduleCaptureArea');
        const mount=document.createElement('div');mount.innerHTML=buildBoard(monthKey()).trim();
        const section=mount.firstElementChild;
        if(section){if(capture?.parentNode)capture.parentNode.insertBefore(section,capture.nextSibling);else root.appendChild(section);}
      }
      root?.querySelectorAll?.('[data-v462-physician-month],.v462-physician-month-card')?.forEach?.(x=>x.remove());
    }
  }catch(err){console.warn('[V608] live inject',err);}return ret;};
  try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
}
const observer=new MutationObserver(()=>{try{
  const page=String(S().page||'');
  if(!['schedule','roster'].includes(page))return;
  const root=document.getElementById('pageContent');if(!root)return;
  root.querySelectorAll('[data-v462-physician-month],.v462-physician-month-card').forEach(x=>x.remove());
  if(root.querySelector('[data-v608-physician-month]'))return;
  const capture=root.querySelector('#scheduleCaptureArea');
  const mount=document.createElement('div');mount.innerHTML=buildBoard(monthKey()).trim();
  const section=mount.firstElementChild;if(!section)return;
  if(capture?.parentNode)capture.parentNode.insertBefore(section,capture.nextSibling);else root.appendChild(section);
}catch(_){ }});
try{observer.observe(document.documentElement,{childList:true,subtree:true});}catch(_){ }
setTimeout(()=>{try{ensureLoaded();}catch(_){ }},600);
window.cnmiPhysicianBoardV611={render:buildBoard};
console.info(`${VERSION} loaded`);
})();
