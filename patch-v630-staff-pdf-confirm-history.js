/* V630: staff-owned post-export PDF check and permanent adjustment history (read-only). */
(()=>{'use strict';if(window.__CNMI_V630__)return;window.__CNMI_V630__=true;
const S=()=>window.state||{};const DB=()=>{try{return (typeof sb!=='undefined'&&sb?.rpc?sb:null)||window.sb||window.supabaseClient||null}catch(_){return window.sb||null}};const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>Number(x||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});const month=()=>String(S().otMenuMonthV369||S().otSourceMonthV241||S().otMoneyMonthV241||S().monthKey||new Date().toISOString().slice(0,7)).slice(0,7);
let working=false,signature='',lastLoad=0;
const notice=(s)=>{try{showToast(s);}catch(_){alert(s);}};
async function render(){
 if(working||S().page!=='ot'||String(S().otMenuV369||'')!=='staff-details')return;
 const host=document.querySelector('.v369-ot-content');if(!host)return;
 const key=month()+'|'+String(S().profile?.id||'');
 let card=host.querySelector('#v630StaffPdfHistory');
 if(!card){card=document.createElement('section');card.className='card v630-card';card.id='v630StaffPdfHistory';
 card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน (ทุกเดือน)</h3><p class="muted">กำลังโหลดประวัติ…</p>';host.append(card)}
 if(signature===key&&Date.now()-lastLoad<120000)return;
 const db=DB();if(!db?.rpc){card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน (ทุกเดือน)</h3><p class="muted">ยังเชื่อมต่อฐานข้อมูลไม่ได้ กรุณารีเฟรชหรือตรวจการตั้งค่า Supabase</p>';return}
 working=true;
 try{
  const {data,error}=await db.rpc('get_my_ot_adjustment_history_v630');
  if(error)throw error;if(!card.isConnected||S().otMenuV369!=='staff-details')return;
  const rows=Array.isArray(data)?data:[];
  card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน (ทุกเดือน)</h3><p class="muted">แสดงเดือนต้นทาง เดือนที่นำไปเบิก และสถานะ • ยอด OT ตกเบิกแยกจากยอดเดือนปัจจุบัน</p>'+
  (rows.length?'<div class="table-wrap"><table><thead><tr><th>รายการ</th><th>เดือนต้นทาง</th><th>นำไปเบิกเดือน</th><th>จำนวนเงิน</th><th>สถานะ</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+(r.adjustment_type==='overclaim'?'ลดเบิกเกิน':'OT ตกเบิกย้อนหลัง')+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</td><td>'+esc(r.source_month)+'</td><td>'+esc(r.apply_month)+'</td><td>'+(Number(r.amount_delta)>0?'+':'')+fmt(r.amount_delta)+' บาท</td><td>'+(r.status==='exported'?'รวมใน Export แล้ว':r.status==='pending'?'รอดำเนินการ':esc(r.status))+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">ไม่มีประวัติรายการปรับย้อนหลัง</p>');
  signature=key;lastLoad=Date.now();
 }catch(e){if(card.isConnected)card.innerHTML='<h3>ประวัติ OT ตกเบิก / ลดเบิกเกิน</h3><p class="muted">ไม่สามารถโหลดประวัติ: '+esc(e.message||e)+'</p>';}finally{working=false}
}
 window.cnmiV630History={render};
})();
