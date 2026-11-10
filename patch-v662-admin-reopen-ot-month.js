/* Staff Planner v662 - audited one-transaction reopening of a source month's HR OT exports.
 * Does not mutate data by itself. Requires SQL_V662 admin RPC installed in Supabase.
 * The original locked snapshots are NEVER deleted or edited.
 */
(()=>{'use strict';
  if(window.__CNMI_V662_OT_REOPEN__)return;
  window.__CNMI_V662_OT_REOPEN__=true;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const db=()=>{try{return window.sb||(typeof sb!=='undefined'?sb:null)}catch(_){return window.sb||null}};
  const admin=()=>{try{return typeof window.isAdmin==='function'?!!window.isAdmin():window.state?.profile?.role==='admin'}catch(_){return false}};
  const active=()=>location.hash.startsWith('#/ot?')&&new URLSearchParams(location.hash.split('?')[1]||'').get('section')==='hr-claims';
  const month=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||window.state?.otMenuMonthV369||new Date().toISOString().slice(0,7);
  const num=v=>Number(v||0).toLocaleString('th-TH');
  const amt=v=>Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  let previousMonth='',lastPreview=null,busy=false,scheduleId=0,watcherHost=null;
  function status(text,kind=''){const el=$('#v662Status');if(el){el.textContent=text;el.className='v662-status '+kind}}
  async function rpc(name,args){const client=db();if(!client?.rpc)throw Error('ไม่ได้เชื่อมต่อ Supabase');const r=await client.rpc(name,args);if(r.error)throw r.error;return r.data}
  function renderPreview(r){
    const area=$('#v662Preview');if(!area)return;
    const rows=Array.isArray(r?.batches)?r.batches:[];
    const items=rows.map(b=>`<tr><td>${esc(b.batch_id)}</td><td>${num(b.rows)} เวร</td><td>${amt(b.money)} บาท</td><td>${esc(b.exported_at?new Date(b.exported_at).toLocaleString('th-TH'):'-')}</td></tr>`).join('');
    area.innerHTML=`<div class="v662-counts"><span><strong>${num(r.batch_count)}</strong> Batch ที่ล็อก</span><span><strong>${num(r.request_count)}</strong> คำขอ Exported</span><span><strong>${num(r.adjustment_count)}</strong> รายการปรับยอด</span></div>
      ${rows.length?`<div class="v662-scroll"><table><thead><tr><th>Batch เดิม</th><th>เวร HR</th><th>ยอด Snapshot</th><th>วันที่ Export</th></tr></thead><tbody>${items}</tbody></table></div>`:''}
      <div class="v662-state ${r.allowed?'v662-allowed':'v662-blocked'}">${r.allowed?'ผ่านเงื่อนไขเบื้องต้นสำหรับเปิดรอบแก้ไข':`ไม่อนุญาตให้ตีกลับ: ${esc(r.blocker||'ไม่ผ่านการตรวจสอบ')}`}</div>`;
    const controls=$('#v662Controls');if(controls)controls.hidden=!r.allowed;
  }
  async function preview(){if(busy)return;const m=month();if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))return status('รูปแบบเดือนผิด กรุณาเลือกเดือนให้ถูกต้อง','error');busy=true;
    const btn=$('#v662Check');if(btn)btn.disabled=true;status('กำลังตรวจสถานะ Export และความปลอดภัยของเดือน '+m+'…');
    try{const r=await rpc('admin_preview_ot_reopen_month_v662',{p_month:m});lastPreview=r;renderPreview(r);status('ตรวจข้อมูลเดือน '+m+' เสร็จแล้ว',r.allowed?'ok':'warning')}
    catch(e){lastPreview=null;const area=$('#v662Preview');if(area)area.innerHTML='';const ctl=$('#v662Controls');if(ctl)ctl.hidden=true;const hint=/admin_preview_ot_reopen_month_v662|PGRST202|does not exist|schema cache|function/i.test(String(e.message||''))?' ยังไม่ได้ติดตั้ง SQL v662 ใน Supabase จึงยังใช้ปุ่มนี้ไม่ได้':' ';status('ตรวจสอบไม่ได้: '+String(e.message||e)+hint,'error')}
    finally{busy=false;if(btn)btn.disabled=false}
  }
  async function reopen(){const p=lastPreview,m=month();if(busy||!p?.allowed||p.month!==m)return status('กรุณากดตรวจสอบ Batch ใหม่','error');
    const reason=String($('#v662Reason')?.value||'').trim(),typed=String($('#v662Typed')?.value||'').trim(),checked=$('#v662Attest')?.checked===true;
    if(reason.length<12)return status('กรุณาระบุเหตุผลอย่างน้อย 12 ตัวอักษร','error');
    if(typed!=='REOPEN '+m)return status('กรุณาพิมพ์ REOPEN '+m+' ให้ตรงทุกตัวอักษร','error');
    if(!checked)return status('กรุณายืนยันว่าไฟล์เดิมยังไม่ได้ส่ง HR และได้สำรองไฟล์แล้ว','error');
    if(!window.confirm(`ยืนยันคืนสถานะ Export ทั้งเดือน ${m} ทั้ง ${p.batch_count} Batch / ${p.request_count} คำขอ?\n\nSnapshot เดิมไม่ถูกลบ แต่ยอด Carry ของเดือนนี้และเดือนถัดไปต้องตรวจใหม่ก่อน Export`))return;
    busy=true;const b=$('#v662Reopen');if(b)b.disabled=true;
    status('กำลังทำธุรกรรมเปิดรอบแก้ไข โปรดอย่ากดซ้ำ…');
    try{
      const done=await rpc('admin_reopen_ot_export_month_v662',{
        p_month:m,p_reason:reason,p_expected_count:Number(p.request_count),
        p_expected_batches:Number(p.batch_count),p_confirmation:typed
      });
      lastPreview=null;const a=$('#v662Preview');if(a)a.innerHTML=`<div class="v662-state v662-allowed"><b>คืนสถานะสำเร็จ</b> • ${num(done.requests_reopened)} คำขอ, ${num(done.adjustments_reopened)} รายการปรับ • เลขประวัติ ${esc(done.audit_id)}<br>Snapshot เดิมถูกเก็บไว้ครบ</div>`;
      const c=$('#v662Controls');if(c)c.hidden=true;
      status('เปิดรอบแก้ไขเดือน '+m+' สำเร็จ ขั้นต่อไปตรวจคำขอ OT ที่ซ้ำ/ขาดก่อน Export ใหม่','ok');
      try{window.cnmiV318?.clearHistoryCache?.();window.cnmiV318?.clearCarryCache?.();window.cnmiV316?.clearCache?.();}catch(_){ }
      try{window.showToast?.('คืนสถานะ Export เดือน '+m+' แล้ว • ตรวจคำขอก่อน Export ใหม่');}catch(_){ }
    }catch(e){status('ไม่ได้เปิดรอบแก้ไข: '+String(e.message||e)+' • ระบบฐานข้อมูลจะย้อนธุรกรรมอัตโนมัติหากคำสั่งล้มเหลว','error')}
    finally{busy=false;if(b)b.disabled=false}
  }
  function mount(){if(!admin()||!active())return;const host=$('#v637Admin');if(!host||host.hidden)return;const m=month();
    let panel=host.querySelector('#v662ReopenPanel');
    if(panel&&m===previousMonth)return;
    if(panel)panel.remove();previousMonth=m;lastPreview=null;
    panel=document.createElement('details');panel.id='v662ReopenPanel';panel.className='v662-reopen';
    panel.innerHTML=`<summary>เปิดรอบแก้ไข OT / ตีกลับ Export ทั้งเดือน (เฉพาะ Admin)</summary>
      <div class="v662-body">
        <p><b>เดือนต้นทาง ${esc(m)}</b> — ตรวจทุก Batch ที่ Export ในเดือนนี้พร้อมกัน ไม่ใช่แค่รายการของคนที่เลือก</p>
        <p>ใช้กรณีไฟล์ HR ยังไม่ส่งและต้องตรวจ OT ซ้ำหรือขาด • Snapshot เดิมเก็บไว้ • ไม่ลบคำขอ • ไม่แก้สถานะอนุมัติเดิม</p>
        <button type="button" id="v662Check">1. ตรวจสอบ Batch เดือนนี้</button><div id="v662Preview"></div>
        <div id="v662Controls" hidden>
          <label>เหตุผลที่ต้องเปิดรอบแก้ไข (อย่างน้อย 12 ตัวอักษร)
          <textarea id="v662Reason" rows="2" placeholder="เช่น ตรวจพบรายการซ้ำและรายการ OT ที่ยังไม่ขอเบิกเดือนตุลาคม"></textarea></label>
          <label>พิมพ์ <b>REOPEN ${esc(m)}</b> เพื่อยืนยัน
          <input id="v662Typed" autocomplete="off" placeholder="REOPEN ${esc(m)}"></label>
          <label class="v662-check"><input id="v662Attest" type="checkbox"> ยืนยันว่าไฟล์เดิมยังไม่ได้ส่ง HR และได้สำรองไฟล์ Export แล้ว</label>
          <button type="button" id="v662Reopen" class="v662-danger">2. ตีกลับทุก Batch ของเดือน ${esc(m)}</button>
        </div>
        <div id="v662Status" class="v662-status">ระบบจะไม่แก้ข้อมูลใด ๆ จนกว่า Admin ยืนยันด้วยตัวเอง</div>
        <p class="v662-foot">หลังตีกลับ: ตรวจ OT ซ้ำ/ตกหล่น → ส่งกลับแก้ไขเฉพาะคำขอที่ผิด → อนุมัติใหม่ → ตรวจ Carry → Export HR ฉบับใหม่เพียงครั้งเดียว • ถ้ามีการยืนยันส่ง HR แล้ว ระบบจะปฏิเสธการตีกลับ</p>
      </div>`;
    host.insertBefore(panel,host.firstChild);
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('#v662Check,#v662Reopen');if(!b)return;e.preventDefault();e.stopPropagation();if(b.id==='v662Check')void preview();else void reopen()},true);
  function schedule(){clearTimeout(scheduleId);scheduleId=setTimeout(()=>{observe();mount()},180)}
  function observe(){const host=$('#pageContent');if(!host||host===watcherHost)return;watcherHost=host;
    const watcher=new MutationObserver(muts=>{
      if(!active()||!admin())return;
      if(muts.every(x=>x.target.closest?.('#v662ReopenPanel')))return;
      if(!$('#v662ReopenPanel'))schedule();
    });watcher.observe(host,{subtree:true,childList:true});
  }
  window.addEventListener('hashchange',()=>{previousMonth='';schedule();setTimeout(schedule,500);setTimeout(schedule,1100)});
  function init(){observe();schedule();setTimeout(schedule,850)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.cnmiV662={refresh:schedule};
})();
