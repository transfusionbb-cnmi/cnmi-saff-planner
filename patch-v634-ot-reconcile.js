
/* v634: independent, read-only explanation card; does not alter archived snapshots. */
(()=>{if(window.__CNMI_V634__)return;window.__CNMI_V634__=true;
const current=()=>{const s=window.state||{};return s.page==='ot' && s.otMenuV369==='staff-details'};
const fmt=n=>Number(n).toLocaleString('th-TH',{maximumFractionDigits:2});
function update(){if(!current())return;const host=document.querySelector('.v369-ot-content');if(!host)return;
const text=host.innerText||'';const a=text.match(/รอบนี้เคย Export แล้ว\s*([\d,.]+)\s*ชม\.\s*[•·]\s*([\d,.]+)\s*บ/);
const b=text.match(/คำนวณเป็นเงินจากยอดเบิก\s*([\d,.]+)\s*บ/);
const snap=a?Number(a[2].replace(/,/g,'')):NaN,base=b?Number(b[1].replace(/,/g,'')):NaN;
let c=host.querySelector('#v634Breakdown');if(!c){c=document.createElement('section');c.id='v634Breakdown';c.className='card v634-breakdown';host.prepend(c)}
if(!Number.isFinite(snap)||!Number.isFinite(base)){c.hidden=true;return}c.hidden=false;
const delta=Math.round((snap-base)*100)/100;
const html='<h3>ยอดที่ Export ไปแล้ว — แยกที่มา</h3><div class="v634-rows"><div><span>ยอด OT คำนวณเดือนนี้</span><b>'+fmt(base)+' บาท</b></div><div><span>ส่วนต่างจากยอด Export (ต้องตรวจรายการตกเบิก/ปรับยอด)</span><b>'+((delta>=0)?'+':'')+fmt(delta)+' บาท</b></div><div><strong>ยอด Snapshot ที่ Export แล้ว</strong><strong>'+fmt(snap)+' บาท</strong></div></div><p>ส่วนต่างเป็นเพียงผลต่างระหว่างยอดเดือนนี้กับ Snapshot ไม่ถือเป็นหลักฐานว่าเป็น OT ตกเบิกทั้งหมด กรุณาตรวจตารางประวัติปรับย้อนหลังด้านล่าง</p>';if(c.innerHTML!==html)c.innerHTML=html;
}
window.addEventListener('hashchange',()=>setTimeout(update,700));/* v635: stop polling */setTimeout(update,1300);
})();
