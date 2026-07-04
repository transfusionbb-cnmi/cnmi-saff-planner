/* CNMI Donor Helper Public V325 — existing signup import */
(function(){
  'use strict';
  const VERSION = 'V325_DONOR_HELPER_PUBLIC';
  const CFG = window.CNMI_CONFIG || {};
  const STORAGE_KEY = 'cnmi_donor_helper_manage_tokens_v324';
  let client = null;
  let rows = [];
  let currentMonth = defaultMonth();
  let loading = false;

  const $ = id => document.getElementById(id);
  function esc(value){ return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function pad(value){ return String(value).padStart(2,'0'); }
  function dateKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function todayKey(){ return dateKey(new Date()); }
  function defaultMonth(){
    const now = new Date();
    if (now.getDate() >= 21) now.setMonth(now.getMonth()+1, 1);
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  }
  function thaiDate(value){
    const d = new Date(`${String(value).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(value || '-') : d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' });
  }
  function monthLabel(month){
    const [y,m] = String(month).split('-').map(Number);
    const d = new Date(y,m-1,1);
    return d.toLocaleDateString('th-TH',{month:'long',year:'numeric'});
  }
  function weekendDates(month){
    const [year, mon] = String(month).split('-').map(Number);
    const total = new Date(year,mon,0).getDate();
    const out=[];
    for(let day=1;day<=total;day++){
      const d=new Date(year,mon-1,day,12);
      if(d.getDay()===0||d.getDay()===6) out.push(dateKey(d));
    }
    return out;
  }
  function openDateFor(workDate){
    const d = new Date(`${workDate.slice(0,7)}-01T12:00:00`);
    d.setMonth(d.getMonth()-1,21);
    return dateKey(d);
  }
  function slotKey(date,type,no){ return `${date}|${type}|${no}`; }
  function slotLabel(type,no){ return type==='clerk' ? 'Clerk' : `คนเจาะ ${no}`; }
  function statusText(status){ return ({confirmed:'ยืนยันแล้ว',cancel_requested:'ขอยกเลิก — รอหัวหน้าหน่วยอนุมัติ',completed:'มาปฏิบัติงานแล้ว',no_show:'ไม่มาตามนัด'})[status]||status||'-'; }
  function statusBadge(status){ return ({confirmed:'green',cancel_requested:'orange',completed:'blue',no_show:'red'})[status]||'gray'; }
  function configReady(){ return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase); }
  function messageFromError(error){
    const raw=String(error?.message||error||'ดำเนินการไม่สำเร็จ');
    if(/function .* does not exist|Could not find the function|schema cache/i.test(raw)) return 'ระบบยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลให้ติดตั้งฐานข้อมูล V324';
    if(/ช่องนี้มีผู้ลงชื่อแล้ว/i.test(raw)) return 'ช่องนี้มีผู้ลงชื่อแล้ว กรุณารีเฟรชและเลือกช่องอื่น';
    return raw.replace(/^.*?:\s*/,'');
  }
  function loadTokens(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}; }
    catch(_){ return {}; }
  }
  function saveToken(id,token){
    const map=loadTokens(); map[id]=token;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(map));}catch(_){}
  }
  function tokenFor(id){ return loadTokens()[id]||''; }
  function isMine(id){ return !!tokenFor(id); }
  function showToast(text){
    const node=$('toast'); if(!node) return;
    node.textContent=text; node.classList.remove('hidden');
    clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>node.classList.add('hidden'),2800);
  }
  function showModal(html){ $('modalBody').innerHTML=html; $('helperModal').classList.remove('hidden'); }
  function closeModal(){ $('helperModal').classList.add('hidden'); $('modalBody').innerHTML=''; }
  function setError(text=''){
    const node=$('setupMessage');
    if(!text){node.classList.add('hidden');node.textContent='';return;}
    node.textContent=text;node.classList.remove('hidden');
  }
  function activeMap(){
    const map=new Map();
    rows.forEach(row=>map.set(slotKey(String(row.work_date).slice(0,10),row.slot_type,Number(row.slot_no)),row));
    return map;
  }

  function renderSlot(date,type,no,row){
    const label=slotLabel(type,no);
    if(!row){
      const past=date<todayKey();
      const open=todayKey()>=openDateFor(date);
      let reason='';
      if(past) reason='เลยวันทำงานแล้ว';
      else if(!open) reason=`เปิดลงชื่อ ${thaiDate(openDateFor(date))}`;
      return `<div class="slot-card empty">
        <div class="slot-label">${esc(label)}</div>
        <div class="slot-unit">${reason||'ยังว่าง'}</div>
        <div class="slot-actions">${!past&&open?`<button class="primary-btn" type="button" data-signup="${esc(`${date}|${type}|${no}`)}">ลงชื่อ</button>`:''}</div>
      </div>`;
    }
    const mine=isMine(row.id);
    return `<div class="slot-card ${esc(row.status||'confirmed')}">
      <div class="slot-head"><span class="slot-label">${esc(label)}</span><span class="badge ${statusBadge(row.status)}">${esc(statusText(row.status))}</span></div>
      <div class="slot-name">${esc(row.helper_name||'-')}</div>
      <div class="slot-unit">${esc(row.unit_name||'-')}</div>
      ${mine?'<span class="my-item">รายการของฉันบนอุปกรณ์นี้</span>':''}
      ${row.status==='cancel_requested'?'<div class="slot-note">ชื่อยังคงอยู่จนกว่าหัวหน้าหน่วย/Admin จะยืนยันการยกเลิก</div>':''}
      <div class="slot-actions">${mine&&row.status==='confirmed'&&date>=todayKey()?`<button class="danger-btn" type="button" data-cancel="${esc(row.id)}">ขอยกเลิก</button>`:''}</div>
    </div>`;
  }
  function render(){
    const dates=weekendDates(currentMonth); const map=activeMap();
    let filled=0;
    dates.forEach(date=>[['phlebotomist',1],['phlebotomist',2],['clerk',1]].forEach(([type,no])=>{if(map.has(slotKey(date,type,no)))filled++;}));
    $('summaryBadges').innerHTML=`<span class="badge blue">${esc(monthLabel(currentMonth))}</span><span class="badge green">ลงชื่อแล้ว ${filled}/${dates.length*3} ช่อง</span>`;
    $('scheduleGrid').innerHTML=dates.map(date=>{
      const d=new Date(`${date}T12:00:00`);
      return `<article class="day-card">
        <div class="day-head"><div class="day-title"><span>${esc(d.toLocaleDateString('th-TH',{weekday:'long'}))}</span><b>${esc(thaiDate(date))}</b></div><span class="badge ${d.getDay()===0?'orange':'blue'}">09:00–17:00</span></div>
        <div class="slot-grid">
          ${renderSlot(date,'phlebotomist',1,map.get(slotKey(date,'phlebotomist',1)))}
          ${renderSlot(date,'phlebotomist',2,map.get(slotKey(date,'phlebotomist',2)))}
          ${renderSlot(date,'clerk',1,map.get(slotKey(date,'clerk',1)))}
        </div>
      </article>`;
    }).join('');
  }
  async function loadMonth(){
    if(!client||loading)return;
    loading=true;setError('');$('loadingMessage').classList.remove('hidden');$('scheduleGrid').innerHTML='';
    try{
      const result=await client.rpc('get_donor_helper_month_v324',{p_month:currentMonth});
      if(result.error)throw result.error;
      rows=Array.isArray(result.data)?result.data:[];
      render();
    }catch(error){
      console.warn(`[${VERSION}] load failed`,error);rows=[];render();setError(messageFromError(error));
    }finally{loading=false;$('loadingMessage').classList.add('hidden');}
  }
  function showSignup(payload){
    const [date,type,noRaw]=String(payload).split('|');const no=Number(noRaw);
    showModal(`<h2>ลงชื่อ ${esc(slotLabel(type,no))}</h2>
      <p>${esc(thaiDate(date))} • 09:00–17:00 น.</p>
      <form id="signupForm" class="form-grid">
        <input type="hidden" name="work_date" value="${esc(date)}"><input type="hidden" name="slot_type" value="${esc(type)}"><input type="hidden" name="slot_no" value="${esc(no)}">
        <label>ชื่อ-สกุล <input name="helper_name" required maxlength="120" autocomplete="name"></label>
        <label>หน่วยงาน <input name="unit_name" required maxlength="160"></label>
        <label class="wide">เบอร์โทร (ถ้ามี) <input name="phone" inputmode="tel" maxlength="30" autocomplete="tel"></label>
        <label class="wide ack-box"><input type="checkbox" name="ack" required><span>ยืนยันว่าจะมาช่วยตามวันที่เลือก และรับทราบว่าหากต้องยกเลิกต้องกดขอยกเลิก ระบุเหตุผล และแจ้งหัวหน้าหน่วยเวชศาสตร์บริการโลหิต เพื่ออนุมัติการยกเลิก ชื่อจะไม่หายจนกว่า Admin จะยืนยัน</span></label>
        <div class="form-actions"><button class="ghost-btn" type="button" data-close-modal>ยกเลิก</button><button class="primary-btn" type="submit">ยืนยันลงชื่อ</button></div>
      </form>`);
  }
  function groupMessage(row,reason){
    return `ขออนุมัติยกเลิกการมาช่วยห้องบริจาคโลหิต\nชื่อ: ${row.helper_name||'-'}\nหน่วยงาน: ${row.unit_name||'-'}\nวันที่: ${thaiDate(row.work_date)}\nตำแหน่ง: ${slotLabel(row.slot_type,row.slot_no)}\nเหตุผล: ${reason||'-'}`;
  }
  function showCancel(id){
    const row=rows.find(item=>String(item.id)===String(id));
    if(!row)return showToast('ไม่พบรายการ');
    showModal(`<h2>ขอยกเลิกการมาช่วย</h2>
      <p>${esc(row.helper_name)} • ${esc(thaiDate(row.work_date))} • ${esc(slotLabel(row.slot_type,row.slot_no))}</p>
      <form id="cancelForm" class="form-grid">
        <input type="hidden" name="signup_id" value="${esc(row.id)}">
        <label class="wide">เหตุผล <textarea name="reason" rows="3" minlength="3" required placeholder="ระบุเหตุผลเพื่อให้หน่วยงานจัดคนแทนได้"></textarea></label>
        <label class="wide ack-box"><input type="checkbox" name="ack" required><span>รับทราบว่าต้องแจ้งหัวหน้าหน่วยเวชศาสตร์บริการโลหิต เพื่ออนุมัติการยกเลิก และชื่อจะยังคงอยู่จนกว่า Admin จะยืนยัน</span></label>
        <div class="form-actions"><button class="ghost-btn" type="button" data-close-modal>กลับ</button><button class="danger-btn" type="submit">ส่งคำขอยกเลิก</button></div>
      </form>`);
  }
  async function submitSignup(form){
    const fd=new FormData(form);const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='กำลังบันทึก…';
    try{
      const result=await client.rpc('signup_donor_helper_v324',{
        p_work_date:fd.get('work_date'),p_slot_type:fd.get('slot_type'),p_slot_no:Number(fd.get('slot_no')),
        p_helper_name:String(fd.get('helper_name')||'').trim(),p_unit_name:String(fd.get('unit_name')||'').trim(),p_phone:String(fd.get('phone')||'').trim()||null
      });
      if(result.error)throw result.error;
      const saved=Array.isArray(result.data)?result.data[0]:result.data;
      if(saved?.signup_id&&saved?.manage_token)saveToken(saved.signup_id,saved.manage_token);
      closeModal();await loadMonth();showToast('ลงชื่อเรียบร้อยแล้ว');
    }catch(error){showToast(messageFromError(error));button.disabled=false;button.textContent='ยืนยันลงชื่อ';}
  }
  async function submitCancel(form){
    const fd=new FormData(form);const id=String(fd.get('signup_id'));const row=rows.find(item=>String(item.id)===id);const reason=String(fd.get('reason')||'').trim();const token=tokenFor(id);
    if(!token)return showToast('ไม่พบสิทธิ์จัดการรายการนี้ในอุปกรณ์');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='กำลังส่งคำขอ…';
    try{
      const result=await client.rpc('request_cancel_donor_helper_v324',{p_signup_id:id,p_manage_token:token,p_reason:reason});
      if(result.error)throw result.error;
      const text=groupMessage(row,reason);
      closeModal();await loadMonth();
      showModal(`<h2>ส่งคำขอยกเลิกแล้ว</h2><p>ชื่อยังคงอยู่ในตารางจนกว่า Admin จะยืนยัน กรุณาคัดลอกข้อความด้านล่างและส่งให้หัวหน้าหน่วยเวชศาสตร์บริการโลหิต เพื่ออนุมัติการยกเลิก</p><div id="groupCopyText" class="copy-box">${esc(text)}</div><div class="form-actions"><button class="primary-btn" type="button" data-copy-group>คัดลอกข้อความ</button><button class="ghost-btn" type="button" data-close-modal>ปิด</button></div>`);
    }catch(error){showToast(messageFromError(error));button.disabled=false;button.textContent='ส่งคำขอยกเลิก';}
  }
  async function copyGroup(){
    const text=$('groupCopyText')?.textContent||'';
    try{await navigator.clipboard.writeText(text);showToast('คัดลอกข้อความแล้ว');}
    catch(_){window.prompt('คัดลอกข้อความนี้',text);}
  }
  function bind(){
    $('helperMonth').value=currentMonth;
    $('helperMonth').addEventListener('change',()=>{currentMonth=$('helperMonth').value||defaultMonth();loadMonth();});
    $('refreshBtn').addEventListener('click',loadMonth);
    $('modalClose').addEventListener('click',closeModal);
    $('helperModal').addEventListener('click',e=>{if(e.target.id==='helperModal')closeModal();});
    document.addEventListener('click',e=>{
      const target=e.target.closest('[data-signup],[data-cancel],[data-close-modal],[data-copy-group]');if(!target)return;
      if(target.hasAttribute('data-signup'))showSignup(target.getAttribute('data-signup'));
      else if(target.hasAttribute('data-cancel'))showCancel(target.getAttribute('data-cancel'));
      else if(target.hasAttribute('data-close-modal'))closeModal();
      else if(target.hasAttribute('data-copy-group'))copyGroup();
    });
    document.addEventListener('submit',e=>{
      if(e.target.id==='signupForm'){e.preventDefault();submitSignup(e.target);}
      if(e.target.id==='cancelForm'){e.preventDefault();submitCancel(e.target);}
    });
  }
  function init(){
    bind();
    if(!configReady()){
      $('loadingMessage').classList.add('hidden');
      setError('ยังไม่ได้ตั้งค่า config.js หรือโหลด Supabase ไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ');
      return;
    }
    client=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    loadMonth();
  }
  document.addEventListener('DOMContentLoaded',init);
})();
