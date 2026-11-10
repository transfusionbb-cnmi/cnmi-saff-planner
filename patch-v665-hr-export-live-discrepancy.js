/* Staff Planner v665: explain rather than conceal a discrepancy between
   the exported (locked) HR snapshot and recalculated current OT. This guard
   does not change either set of rows, carry-in, export status, or payroll. */
(()=>{'use strict';
if(window.__CNMI_V665_HR_RECONCILE__)return;
window.__CNMI_V665_HR_RECONCILE__=true;
const number=(value)=>{
  const x=Number(String(value==null?'':value).replace(/[^0-9.\-]/g,''));
  return Number.isFinite(x)?x:null;
};
const baht=n=>Number(n).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+' บาท';
function check(){
  const p=document.querySelector('#pageContent');
  const card=p?.querySelector('#v643HrTotal');
  const detail=p?.querySelector('.v347-my-claim-card');
  const existing=card?.querySelector('#v665-hr-discrepancy');
  if(!card||!detail){existing?.remove();return;}
  const snapshotNode=card.querySelector('.v643-original b');
  const currentNode=detail.querySelector('.v347-claim-equation .money b');
  const snapshot=snapshotNode?number(snapshotNode.textContent):null;
  const current=currentNode?number(currentNode.textContent):null;
  if(snapshot===null||current===null){existing?.remove();return;}
  const diff=Math.round((current-snapshot)*100)/100;
  if(Math.abs(diff)<0.01){existing?.remove();return;}
  const marker=String(snapshot)+'|'+String(current);
  if(existing?.dataset?.signature===marker)return;
  const box=existing||document.createElement('div');
  box.id='v665-hr-discrepancy';box.className='v665-hr-discrepancy';
  box.dataset.signature=marker;
  box.innerHTML='';
  const bold=document.createElement('strong');bold.textContent='ยอดจากรายการ OT ปัจจุบันยังไม่ตรงกับยอด Export';
  const line=document.createElement('div');line.textContent='Export ที่ล็อกไว้ '+baht(snapshot)+' • คำนวณสด '+baht(current)+' • ผลต่าง '+baht(Math.abs(diff));
  const hint=document.createElement('small');hint.textContent='ยังไม่ควรกดยืนยันยอด ให้ Admin ตรวจยอดทบและรายการต้นทางที่ใช้ Export ก่อน การแก้ยอดในระบบจะไม่แก้ไฟล์ Excel ที่ Export ไปแล้ว';
  box.append(bold,line,hint);
  card.appendChild(box);
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;check();});}
for(const ev of ['cnmi:v665-detail-ready','cnmi:v665-snapshot-ready'])document.addEventListener(ev,schedule);
window.addEventListener('hashchange',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.cnmiV665={version:'v665',check,_test:{number}};
})();
