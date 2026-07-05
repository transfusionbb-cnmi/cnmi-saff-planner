/* CNMI Staff Planner V327 — ลงชื่อช่วยห้องบริจาคโลหิตในแอป + กันเวร + ปิดวันหยุดนักขัตฤกษ์
   - เจ้าหน้าที่ในหน่วยลงชื่อจากหน้าเดียวกัน ชื่อ/หน่วย/เบอร์โทรมาจากโปรไฟล์
   - หากมีเวรในวันเดียวกัน ระบบไม่ให้ลงจนกว่าจะขายเวรและตารางเวรถูกโอนแล้ว
   - วันเสาร์–อาทิตย์ที่อยู่ใน public_holidays ปิดรับลงชื่อทั้งคนในและคนนอก
   - ไม่สร้าง OT อัตโนมัติ ยังคงให้ขอ OT ส่วนที่ 2 ตามเดิม
*/
(function(){
  'use strict';
  const VERSION = 'V327_DONOR_HELPER_INTERNAL_BOOKING';
  const PAGE_ID = 'donorHelpers';
  const INTERNAL_UNIT = 'หน่วยเวชศาสตร์บริการโลหิต';
  const UNIT_OPTIONS = [
    'หน่วยคลังพยาธิวิทยา',
    'หน่วยธุรการพยาธิ',
    'หน่วยนิติเวช',
    'หน่วยบริการพยาธิวิทยา',
    'หน่วยพยาธิวิทยากายวิภาค',
    'หน่วยพยาธิวิทยาคลินิก',
    INTERNAL_UNIT,
  ];
  if (window.__CNMI_V327_DONOR_HELPER_INTERNAL_BOOKING__) return;
  window.__CNMI_V327_DONOR_HELPER_INTERNAL_BOOKING__ = true;

  function S(){ try { return state; } catch (_) { return window.state || null; } }
  function DB(){ try { return sb; } catch (_) { return window.sb || null; } }
  function admin(){ try { return typeof isAdmin === 'function' && isAdmin(); } catch (_) { return false; } }
  function esc(value){
    try { if (typeof escapeHtml === 'function') return escapeHtml(value); } catch (_) {}
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function toast(message, tone){
    try { return showToast(message, tone ? { tone } : undefined); }
    catch (_) { window.alert(message); }
  }
  function rerender(){
    try {
      const fn = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
      if (typeof fn === 'function') fn();
    } catch (error) { console.warn(`[${VERSION}] render failed`, error); }
  }
  function monthNow(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  function dateKey(value){
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0,10);
    const d=value instanceof Date?value:new Date(value);
    if(Number.isNaN(d.getTime())) return String(value||'').slice(0,10);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function today(){ return dateKey(new Date()); }
  function weekendDates(month){
    const [y,m]=String(month||monthNow()).split('-').map(Number); if(!y||!m)return[];
    const last=new Date(y,m,0).getDate(),out=[];
    for(let day=1;day<=last;day++){const d=new Date(y,m-1,day,12);if(d.getDay()===0||d.getDay()===6)out.push(dateKey(d));}
    return out;
  }
  function openDateFor(workDate){
    const d=new Date(`${String(workDate).slice(0,7)}-01T12:00:00`); d.setMonth(d.getMonth()-1,21); return dateKey(d);
  }
  function thaiDate(value){
    try { if (typeof formatThaiDate === 'function') return formatThaiDate(value); } catch (_) {}
    const d=new Date(`${dateKey(value)}T12:00:00`); return Number.isNaN(d.getTime())?String(value||'-'):d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
  }
  function thaiDateTime(value){
    if(!value)return'-';
    try { if (typeof formatThaiDateTime === 'function') return formatThaiDateTime(value); } catch (_) {}
    const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});
  }
  function monthLabel(month){
    const [y,m]=String(month||monthNow()).split('-').map(Number),d=new Date(y,(m||1)-1,1);
    return Number.isNaN(d.getTime())?month:d.toLocaleDateString('th-TH',{month:'long',year:'numeric'});
  }
  function slotKey(date,type,no){return `${date}|${type}|${no}`;}
  function slotLabel(type,no){return type==='clerk'?'Clerk':`คนเจาะ ${no}`;}
  function statusText(status){return ({confirmed:'ยืนยันแล้ว',cancel_requested:'ขอยกเลิก — รออนุมัติ',cancelled:'ยกเลิกแล้ว',completed:'มาปฏิบัติงานแล้ว',no_show:'ไม่มาตามนัด (No Show)'})[status]||status||'-';}
  function statusClass(status){return ({confirmed:'green',cancel_requested:'orange',cancelled:'black',completed:'blue',no_show:'red'})[status]||'black';}
  function isAllowedUnit(value){return UNIT_OPTIONS.includes(String(value||'').trim());}
  function unitOptions(selected=''){
    const value=String(selected||'').trim();
    return `<option value=""${isAllowedUnit(value)?'':' selected'} disabled>กรุณาเลือกหน่วยงาน</option>`+
      UNIT_OPTIONS.map(unit=>`<option value="${esc(unit)}"${unit===value?' selected':''}>${esc(unit)}</option>`).join('');
  }
  function publicUrl(){try{return new URL('donor-helper.html',window.location.href).href;}catch(_){return'donor-helper.html';}}
  function errorText(error){
    const raw=String(error?.message||error||'ดำเนินการไม่สำเร็จ');
    if(/get_donor_helper_month_internal_v327|signup_donor_helper_internal_v327|function .* does not exist|schema cache/i.test(raw)) return 'ยังไม่ได้ติดตั้งฐานข้อมูล V327 กรุณาให้ Admin Run ไฟล์ SQL_V327_DONOR_HELPER_INTERNAL_BOOKING_HOLIDAY_GUARD.sql ใน Supabase ก่อน';
    if(/Permission denied/i.test(raw))return'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
    try{if(typeof friendlyDbError==='function')return friendlyDbError(error);}catch(_){}
    return raw.replace(/^.*?:\s*/,'');
  }
  function parsePayload(data){
    if(!data)return{};
    if(typeof data==='string'){try{return JSON.parse(data)||{};}catch(_){return{};}}
    return data;
  }

  try{
    if(typeof NAV_ITEMS!=='undefined'&&Array.isArray(NAV_ITEMS)){
      let item=NAV_ITEMS.find(x=>x.id===PAGE_ID);
      if(!item){
        item={id:PAGE_ID,icon:'🩸',title:'คนมาช่วยห้องบริจาคโลหิต',subtitle:'คนในหน่วยลงชื่อในแอปได้ • คนนอกหน่วยใช้ลิงก์สาธารณะ',group:'staff'};
        const otIndex=NAV_ITEMS.findIndex(x=>x.id==='ot');
        NAV_ITEMS.splice(otIndex>=0?otIndex:NAV_ITEMS.length,0,item);
      }
      item.title='คนมาช่วยห้องบริจาคโลหิต';
      item.subtitle='คนในหน่วยลงชื่อในแอปได้ • คนนอกหน่วยใช้ลิงก์สาธารณะ';
    }
  }catch(_){}

  const initial=S();
  if(initial){
    initial.donorHelperMonthV327=initial.donorHelperMonthV327||initial.donorHelperMonthV324||monthNow();
    initial.donorHelperPayloadV327=initial.donorHelperPayloadV327||{rows:[],blocked_dates:[],my_duties:[],my_profile:null,contact:null};
    initial.donorHelperLoadedMonthV327=initial.donorHelperLoadedMonthV327||'';
    initial.donorHelperLoadingV327=false;
    initial.donorHelperErrorV327='';
  }

  async function loadMonth(month,options={}){
    const st=S(),client=DB();if(!st||!client)return;
    const key=String(month||st.donorHelperMonthV327||monthNow()).slice(0,7);
    if(!options.force&&st.donorHelperLoadedMonthV327===key&&!st.donorHelperErrorV327)return;
    if(st.donorHelperLoadingV327)return;
    st.donorHelperLoadingV327=true;st.donorHelperErrorV327='';if(st.page===PAGE_ID)rerender();
    try{
      const result=await client.rpc('get_donor_helper_month_internal_v327',{p_month:key});
      if(result.error)throw result.error;
      const payload=parsePayload(result.data);
      st.donorHelperPayloadV327={
        rows:Array.isArray(payload.rows)?payload.rows:[],
        blocked_dates:Array.isArray(payload.blocked_dates)?payload.blocked_dates:[],
        my_duties:Array.isArray(payload.my_duties)?payload.my_duties:[],
        my_profile:payload.my_profile||null,
        contact:payload.contact||null
      };
      st.donorHelperLoadedMonthV327=key;
    }catch(error){
      console.warn(`[${VERSION}] load month failed`,error);
      st.donorHelperPayloadV327={rows:[],blocked_dates:[],my_duties:[],my_profile:null,contact:null};
      st.donorHelperLoadedMonthV327='';st.donorHelperErrorV327=errorText(error);
    }finally{st.donorHelperLoadingV327=false;if(st.page===PAGE_ID)rerender();}
  }

  function payload(){return S()?.donorHelperPayloadV327||{rows:[],blocked_dates:[],my_duties:[],my_profile:null,contact:null};}
  function rows(){return payload().rows||[];}
  function activeRows(){return rows().filter(row=>row.status!=='cancelled');}
  function activeMap(){const map=new Map();activeRows().forEach(row=>map.set(slotKey(dateKey(row.work_date),row.slot_type,Number(row.slot_no)),row));return map;}
  function blockedMap(){const map=new Map();(payload().blocked_dates||[]).forEach(row=>map.set(dateKey(row.work_date),row.title||'วันหยุดนักขัตฤกษ์'));return map;}
  function dutyMap(){const map=new Map();(payload().my_duties||[]).forEach(row=>map.set(dateKey(row.work_date),Array.isArray(row.duty_codes)?row.duty_codes:[]));return map;}
  function myActiveOn(date){return activeRows().find(row=>row.is_mine&&dateKey(row.work_date)===date);}
  function rowById(id){return rows().find(row=>String(row.id)===String(id));}
  function cancelHistoryFor(date,type,no){return rows().filter(row=>String(row.status||'')==='cancelled'&&dateKey(row.work_date)===date&&row.slot_type===type&&Number(row.slot_no)===Number(no)).sort((a,b)=>String(b.cancelled_at||b.updated_at||b.created_at||'').localeCompare(String(a.cancelled_at||a.updated_at||a.created_at||'')))[0]||null;}
  function cancelHistoryHtml(row){if(!row)return'';return `<div class="donor-helper-slot-history"><b>เคยลงชื่อ:</b> ${esc(row.helper_name||'-')}<br><b>ยกเลิกโดย:</b> ${esc(row.cancelled_by_label||'หัวหน้าหน่วยเวชศาสตร์บริการโลหิต/อินชาร์จ')}<br><b>เหตุผล:</b> ${esc(row.cancel_reason||'-')}<br><b>วันที่-เวลา:</b> ${esc(thaiDateTime(row.cancelled_at||row.updated_at))}</div>`;}
  function contactNotice(){const c=payload().contact||{};return `<div class="notice soft-notice donor-helper-contact-note"><b>ผู้ติดต่อกรณีขอยกเลิก:</b> ${c.incharge_label?`อินชาร์จเดือนนี้: ${esc(c.incharge_label)}`:'กรุณาแจ้งหัวหน้าหน่วยเวชศาสตร์บริการโลหิต'}</div>`;}

  function emptyActions(date,type,no,isBlocked,myDuty){
    const isPast=date<today(),isOpen=today()>=openDateFor(date),own=myActiveOn(date);
    if(isBlocked)return'';
    if(isPast)return'';
    if(!isOpen)return`<div class="donor-helper-empty-reason">เปิดลงชื่อ ${esc(thaiDate(openDateFor(date)))}</div>`;
    const selfLabel=own?'ลงชื่อวันนี้แล้ว':myDuty?'ตรวจสอบเวรก่อน':'ลงชื่อของฉัน';
    const selfClass=myDuty||own?'tiny-btn donor-helper-self-btn blocked':'tiny-btn donor-helper-self-btn';
    return `<div class="donor-helper-empty-actions">
      <button class="${selfClass}" type="button" data-v327-self-book="${esc(`${date}|${type}|${no}`)}">${esc(selfLabel)}</button>
      ${admin()?`<button class="tiny-btn ghost" type="button" data-v327-admin-add="${esc(`${date}|${type}|${no}`)}">เพิ่มชื่อแทน</button>`:''}
    </div>`;
  }

  function slotCard(date,type,no,row,context){
    const label=slotLabel(type,no),isBlocked=context.blocked,myDuty=context.myDuty;
    if(!row){
      return `<div class="donor-helper-slot empty ${isBlocked?'holiday-closed':''}">
        <div class="donor-helper-slot-name">${esc(label)}</div>
        <div class="donor-helper-empty-text">${isBlocked?'ปิดรับลงชื่อ':myDuty?'วันนี้คุณอยู่เวร — ต้องขายเวรก่อน':'ยังว่าง'}</div>
        ${cancelHistoryHtml(cancelHistoryFor(date,type,no))}
        ${emptyActions(date,type,no,isBlocked,myDuty)}
      </div>`;
    }
    const status=String(row.status||'confirmed'),mine=!!row.is_mine;
    let actions='';
    if(mine&&status==='confirmed'){
      actions+=`<button class="tiny-btn danger-ghost" type="button" data-v327-self-cancel="${esc(row.id)}">ขอยกเลิก</button>`;
    }
    if(admin()){
      if(status==='cancel_requested'){
        actions+=`<button class="tiny-btn danger" type="button" data-v327-status="${esc(row.id)}|cancelled">ยกเลิกตามคำขอ</button><button class="tiny-btn" type="button" data-v327-status="${esc(row.id)}|confirmed">ไม่อนุมัติการยกเลิก</button>`;
      }else if(status==='confirmed'){
        actions+=`<button class="tiny-btn" type="button" data-v327-edit="${esc(row.id)}">แก้ข้อมูล</button><button class="tiny-btn" type="button" data-v327-status="${esc(row.id)}|completed">มาปฏิบัติงานแล้ว</button><button class="tiny-btn danger" type="button" data-v327-status="${esc(row.id)}|no_show">ไม่มาตามนัด (No Show)</button><button class="tiny-btn danger-ghost" type="button" data-v327-status="${esc(row.id)}|cancelled">ยกเลิกตามคำขอ</button>`;
      }
    }
    return `<div class="donor-helper-slot occupied status-${esc(status)} ${mine?'mine':''}">
      <div class="donor-helper-slot-head"><span>${esc(label)}</span><span class="badge ${esc(statusClass(status))}">${esc(statusText(status))}</span></div>
      <div class="donor-helper-person">${esc(row.helper_name||'-')}</div>
      <div class="donor-helper-unit">${esc(row.unit_name||'-')}</div>
      ${mine?'<div class="donor-helper-mine-label">รายการของฉัน</div>':''}
      ${row.phone&&admin()?`<div class="donor-helper-phone">โทร ${esc(row.phone)}</div>`:''}
      ${status==='cancel_requested'&&row.cancel_reason?`<div class="donor-helper-cancel-reason"><b>เหตุผล:</b> ${esc(row.cancel_reason)}</div>`:''}
      ${actions?`<div class="actions compact-actions">${actions}</div>`:''}
    </div>`;
  }

  function historyTable(){
    if(!admin())return'';
    const history=rows().filter(row=>['cancelled','no_show','completed','cancel_requested'].includes(row.status)).sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
    if(!history.length)return'';
    return `<div class="card donor-helper-history"><div class="section-title"><h3>ประวัติและรายการที่ต้องติดตาม</h3><span class="badge black">${history.length} รายการ</span></div><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ตำแหน่ง</th><th>ชื่อ / หน่วยงาน</th><th>สถานะ</th><th>เหตุผล/เวลา</th></tr></thead><tbody>${history.map(row=>`<tr><td>${esc(thaiDate(row.work_date))}</td><td>${esc(slotLabel(row.slot_type,row.slot_no))}</td><td><b>${esc(row.helper_name||'-')}</b><br><span class="muted">${esc(row.unit_name||'-')}</span></td><td><span class="badge ${esc(statusClass(row.status))}">${esc(statusText(row.status))}</span></td><td>${row.cancel_reason?esc(row.cancel_reason):'-'}<br><span class="muted">อัปเดต ${esc(thaiDateTime(row.updated_at||row.created_at))}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderPageHtml(){
    const st=S(),month=st?.donorHelperMonthV327||monthNow(),dates=weekendDates(month),map=activeMap(),blocked=blockedMap(),duties=dutyMap();
    const openDates=dates.filter(date=>!blocked.has(date));
    const filled=openDates.reduce((sum,date)=>sum+[['phlebotomist',1],['phlebotomist',2],['clerk',1]].filter(([type,no])=>map.has(slotKey(date,type,no))).length,0);
    const profile=payload().my_profile||{};
    return `<div class="donor-helper-page-v324 donor-helper-page-v327">
      <div class="card donor-helper-hero"><div><span class="donor-helper-kicker">ห้องบริจาคโลหิต • 09:00–17:00 น.</span><h3>ตารางผู้มาช่วย ${esc(monthLabel(month))}</h3><p>คนเจาะ 2 คน และ Clerk 1 คนต่อวัน • เปิดลงชื่อวันที่ 21 ของเดือนก่อนหน้า</p></div><div class="donor-helper-hero-actions"><a class="primary-btn donor-helper-link-btn" href="${esc(publicUrl())}" target="_blank" rel="noopener">เปิดหน้าลงชื่อคนนอกหน่วย</a><button class="ghost-btn" type="button" data-v327-copy-link>คัดลอกลิงก์</button></div></div>
      ${contactNotice()}
      <div class="notice soft-notice donor-helper-ot-note"><b>คนในหน่วย:</b> กด “ลงชื่อของฉัน” ในช่องที่ว่าง ระบบเติมชื่อ เบอร์โทร และหน่วยเวชศาสตร์บริการโลหิตให้อัตโนมัติ หลังลงชื่อแล้วให้ขอ OT ที่ <b>ส่วนที่ 2</b> เหมือนเดิม ระบบนี้ไม่สร้าง OT อัตโนมัติ <button class="tiny-btn" type="button" data-v327-go-ot>ไปส่วนขอ OT</button></div>
      ${profile.full_name?`<div class="card donor-helper-my-profile"><div><span class="muted">ข้อมูลที่ใช้ลงชื่ออัตโนมัติ</span><b>${esc(profile.full_name)}</b></div><div><span class="muted">หน่วยงาน</span><b>${esc(profile.unit_name||INTERNAL_UNIT)}</b></div><div><span class="muted">เบอร์โทร</span><b>${esc(profile.phone||'ยังไม่มีในข้อมูลส่วนตัว')}</b></div></div>`:''}
      <div class="card donor-helper-toolbar"><label>เลือกเดือน <input id="donorHelperMonthInputV327" type="month" value="${esc(month)}"></label><div class="donor-helper-counts"><span class="badge blue">ลงชื่อแล้ว ${filled}/${openDates.length*3} ช่อง</span><span class="badge black">เปิดรับ ${openDates.length} วัน</span>${blocked.size?`<span class="badge orange">ปิดวันหยุด ${blocked.size} วัน</span>`:''}</div><button class="ghost-btn" type="button" data-v327-refresh>รีเฟรชรายชื่อ</button></div>
      ${st?.donorHelperErrorV327?`<div class="notice donor-helper-error"><b>ยังเปิดตารางไม่ได้</b><br>${esc(st.donorHelperErrorV327)}</div>`:''}
      ${st?.donorHelperLoadingV327?'<div class="card donor-helper-loading">กำลังโหลดรายชื่อและตรวจตารางเวร…</div>':''}
      <div class="donor-helper-weekend-grid">${dates.map(date=>{
        const d=new Date(`${date}T12:00:00`),holiday=blocked.get(date),myDuty=duties.has(date),codes=duties.get(date)||[];
        return `<div class="card donor-helper-day-card ${holiday?'donor-helper-day-closed':''}"><div class="donor-helper-day-head"><div><span>${esc(d.toLocaleDateString('th-TH',{weekday:'long'}))}</span><b>${esc(thaiDate(date))}</b></div><span class="badge ${holiday?'red':d.getDay()===0?'orange':'blue'}">${holiday?'ปิดรับลงชื่อ':'09:00–17:00'}</span></div>${holiday?`<div class="donor-helper-holiday-banner"><b>${esc(holiday)}</b><span>วันนี้เป็นวันหยุดนักขัตฤกษ์ จึงไม่เปิดช่องให้ลงชื่อ</span></div>`:''}${myDuty&&!holiday?`<div class="donor-helper-duty-warning"><b>คุณมีเวรวันนี้${codes.length?` (${esc(codes.join(', '))})`:''}</b><span>ลงชื่อช่วยไม่ได้จนกว่าจะขายเวรและโอนเวรเรียบร้อย</span></div>`:''}<div class="donor-helper-slots">${slotCard(date,'phlebotomist',1,map.get(slotKey(date,'phlebotomist',1)),{blocked:!!holiday,myDuty})}${slotCard(date,'phlebotomist',2,map.get(slotKey(date,'phlebotomist',2)),{blocked:!!holiday,myDuty})}${slotCard(date,'clerk',1,map.get(slotKey(date,'clerk',1)),{blocked:!!holiday,myDuty})}</div></div>`;
      }).join('')||'<div class="card">ไม่พบวันเสาร์–อาทิตย์ในเดือนที่เลือก</div>'}</div>${historyTable()}</div>`;
  }

  const previousRender=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  const renderV327=function(){
    const st=S();if(!st||st.page!==PAGE_ID)return previousRender?previousRender.apply(this,arguments):undefined;
    try{
      const title=document.getElementById('pageTitle'),subtitle=document.getElementById('pageSubtitle'),content=document.getElementById('pageContent');
      if(title)title.textContent='คนมาช่วยห้องบริจาคโลหิต';
      if(subtitle)subtitle.textContent='คนในหน่วยลงชื่อในแอปได้ • คนนอกหน่วยใช้ลิงก์สาธารณะ';
      try{if(typeof renderNav==='function')renderNav();}catch(_){}
      if(content)content.innerHTML=renderPageHtml();
      if(!st.donorHelperLoadingV327&&!st.donorHelperErrorV327&&st.donorHelperLoadedMonthV327!==st.donorHelperMonthV327)window.setTimeout(()=>loadMonth(st.donorHelperMonthV327),0);
    }catch(error){console.error(`[${VERSION}] render failed`,error);const content=document.getElementById('pageContent');if(content)content.innerHTML=`<div class="notice">เปิดหน้าไม่สำเร็จ: ${esc(error.message||error)}</div>`;}
  };
  try{window.renderPage=renderPage=renderV327;}catch(_){window.renderPage=renderV327;}

  function showSelfModal(payloadText){
    const [date,type,noRaw]=String(payloadText||'').split('|'),no=Number(noRaw),blocked=blockedMap(),duties=dutyMap(),profile=payload().my_profile||{};
    if(blocked.has(date))return toast('วันนี้ไม่เปิดลงชื่อ เนื่องจากเป็นวันหยุดนักขัตฤกษ์','error');
    if(duties.has(date))return toast('วันนี้ลงไม่ได้ เนื่องจากอยู่เวร ต้องขายเวรก่อน','error');
    if(date<today())return toast('ไม่สามารถลงชื่อย้อนหลังได้','error');
    if(today()<openDateFor(date))return toast(`เดือนนี้จะเปิดให้ลงชื่อวันที่ ${thaiDate(openDateFor(date))}`,'error');
    if(myActiveOn(date))return toast('วันนี้คุณลงชื่อช่วยไว้แล้ว 1 ตำแหน่ง','error');
    const html=`<h2>ยืนยันลงชื่อของฉัน</h2><p class="muted">${esc(thaiDate(date))} • ${esc(slotLabel(type,no))} • 09:00–17:00 น.</p><form id="donorHelperSelfFormV327" class="form-grid"><input type="hidden" name="work_date" value="${esc(date)}"><input type="hidden" name="slot_type" value="${esc(type)}"><input type="hidden" name="slot_no" value="${esc(no)}"><div class="wide donor-helper-confirm-profile"><div><span>ชื่อ</span><b>${esc(profile.full_name||'-')}</b></div><div><span>หน่วยงาน</span><b>${esc(profile.unit_name||INTERNAL_UNIT)}</b></div><div><span>เบอร์โทร</span><b>${esc(profile.phone||'ยังไม่มีในข้อมูลส่วนตัว')}</b></div></div><label class="wide donor-helper-ack"><input type="checkbox" name="ack" required><span>ยืนยันว่าจะมาช่วยตามวันที่เลือก และรับทราบว่าหากต้องยกเลิกต้องส่งคำขอพร้อมเหตุผลเพื่อให้หัวหน้าหน่วยอนุมัติ</span></label><div class="wide form-actions"><button class="ghost-btn" type="button" data-v327-close>กลับ</button><button class="primary-btn" type="submit">ยืนยันลงชื่อ</button></div></form>`;
    try{showModal(html,{small:true});}catch(_){toast('เปิดหน้าต่างยืนยันไม่สำเร็จ','error');}
  }

  function showCancelModal(id){
    const row=rowById(id);if(!row||!row.is_mine)return toast('ไม่พบสิทธิ์จัดการรายการนี้','error');
    const html=`<h2>ขอยกเลิกการมาช่วย</h2><p class="muted">${esc(row.helper_name)} • ${esc(thaiDate(row.work_date))} • ${esc(slotLabel(row.slot_type,row.slot_no))}</p><form id="donorHelperSelfCancelFormV327" class="form-grid"><input type="hidden" name="signup_id" value="${esc(row.id)}"><label class="wide">เหตุผล <textarea name="reason" rows="3" minlength="3" required placeholder="ระบุเหตุผลเพื่อให้หน่วยงานจัดคนแทนได้"></textarea></label><label class="wide donor-helper-ack"><input type="checkbox" name="ack" required><span>รับทราบว่าต้องแจ้งอินชาร์จเดือนนี้หรือหัวหน้าหน่วยเวชศาสตร์บริการโลหิตเพื่ออนุมัติ และชื่อจะยังคงอยู่จนกว่า Admin จะยืนยัน</span></label><div class="wide form-actions"><button class="ghost-btn" type="button" data-v327-close>กลับ</button><button class="danger-btn" type="submit">ส่งคำขอยกเลิก</button></div></form>`;
    try{showModal(html,{small:true});}catch(_){toast('เปิดหน้าต่างขอยกเลิกไม่สำเร็จ','error');}
  }

  function showAdminAdd(payloadText){
    const [date,type,no]=String(payloadText||'').split('|');if(blockedMap().has(date))return toast('วันนี้ไม่เปิดลงชื่อ เนื่องจากเป็นวันหยุดนักขัตฤกษ์','error');
    const html=`<h2>เพิ่มชื่อแทน</h2><p class="muted">${esc(thaiDate(date))} • ${esc(slotLabel(type,Number(no)))}</p><form id="donorHelperAdminAddFormV327" class="form-grid"><input type="hidden" name="work_date" value="${esc(date)}"><input type="hidden" name="slot_type" value="${esc(type)}"><input type="hidden" name="slot_no" value="${esc(no)}"><label>ชื่อ-สกุล <input name="helper_name" required maxlength="120"></label><label>หน่วยงาน <select name="unit_name" required>${unitOptions()}</select></label><label class="wide">เบอร์โทร (ถ้ามี) <input name="phone" inputmode="tel" maxlength="30"></label><button class="primary-btn wide" type="submit">บันทึกชื่อ</button></form>`;
    try{showModal(html,{small:true});}catch(_){toast('เปิดแบบฟอร์มไม่สำเร็จ','error');}
  }
  function showAdminEdit(id){
    const row=rowById(id);if(!row)return toast('ไม่พบรายการ','error');
    const html=`<h2>แก้ไขข้อมูลผู้มาช่วย</h2><p class="muted">${esc(thaiDate(row.work_date))} • ${esc(slotLabel(row.slot_type,row.slot_no))}</p><form id="donorHelperAdminEditFormV327" class="form-grid"><input type="hidden" name="signup_id" value="${esc(row.id)}"><label>ชื่อ-สกุล <input name="helper_name" value="${esc(row.helper_name||'')}" required maxlength="120"></label><label>หน่วยงาน <select name="unit_name" required>${unitOptions(row.unit_name||'')}</select>${row.unit_name&&!isAllowedUnit(row.unit_name)?`<span class="muted">ข้อมูลเดิม: ${esc(row.unit_name)} — กรุณาเลือกใหม่</span>`:''}</label><label class="wide">เบอร์โทร (ถ้ามี) <input name="phone" value="${esc(row.phone||'')}" inputmode="tel" maxlength="30"></label><button class="primary-btn wide" type="submit">บันทึกการแก้ไข</button></form>`;
    try{showModal(html,{small:true});}catch(_){toast('เปิดแบบฟอร์มไม่สำเร็จ','error');}
  }
  async function confirmAction(message,title='ยืนยันรายการ'){try{if(typeof confirmDialog==='function')return await confirmDialog(message,title);}catch(_){}return window.confirm(message);}
  async function updateStatus(id,next){
    const row=rowById(id);if(!row)return toast('ไม่พบรายการ','error');
    const prompts={cancelled:`ยืนยัน “ยกเลิกตามคำขอ” ของ ${row.helper_name} ใช่หรือไม่? ประวัติจะยังคงอยู่`,confirmed:`ไม่อนุมัติคำขอยกเลิกของ ${row.helper_name} และคงชื่อไว้ใช่หรือไม่?`,completed:`ยืนยันว่า ${row.helper_name} มาปฏิบัติงานแล้วใช่หรือไม่?`,no_show:`ยืนยันบันทึกว่า ${row.helper_name} ไม่มาตามนัด (No Show) ใช่หรือไม่?`};
    if(!await confirmAction(prompts[next]||'ยืนยันเปลี่ยนสถานะหรือไม่?'))return;
    let note=null;if(next==='cancelled')note=window.prompt('เหตุผลที่ยกเลิกตามคำขอ',row.cancel_reason||'')||row.cancel_reason||null;
    try{const result=await DB().rpc('admin_update_donor_helper_status_v324',{p_signup_id:id,p_status:next,p_note:note});if(result.error)throw result.error;await loadMonth(S().donorHelperMonthV327,{force:true});toast('บันทึกสถานะแล้ว');}catch(error){toast(errorText(error),'error');}
  }
  async function copyLink(){const link=publicUrl();try{await navigator.clipboard.writeText(link);toast('คัดลอกลิงก์แล้ว');}catch(_){window.prompt('คัดลอกลิงก์นี้',link);}}
  function goOt(){const st=S();if(!st)return;try{closeModal();}catch(_){}st.page='ot';rerender();}

  document.addEventListener('change',event=>{
    const target=event.target;if(!target||target.id!=='donorHelperMonthInputV327')return;const st=S();if(!st)return;
    st.donorHelperMonthV327=target.value||monthNow();st.donorHelperLoadedMonthV327='';st.donorHelperErrorV327='';rerender();
  },true);

  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-v327-self-book],[data-v327-self-cancel],[data-v327-admin-add],[data-v327-edit],[data-v327-status],[data-v327-refresh],[data-v327-copy-link],[data-v327-go-ot],[data-v327-close]');
    if(!target)return;event.preventDefault();event.stopPropagation();
    if(target.hasAttribute('data-v327-self-book'))return showSelfModal(target.getAttribute('data-v327-self-book'));
    if(target.hasAttribute('data-v327-self-cancel'))return showCancelModal(target.getAttribute('data-v327-self-cancel'));
    if(target.hasAttribute('data-v327-admin-add'))return showAdminAdd(target.getAttribute('data-v327-admin-add'));
    if(target.hasAttribute('data-v327-edit'))return showAdminEdit(target.getAttribute('data-v327-edit'));
    if(target.hasAttribute('data-v327-status')){const [id,status]=String(target.getAttribute('data-v327-status')||'').split('|');return void updateStatus(id,status);}
    if(target.hasAttribute('data-v327-refresh'))return void loadMonth(S()?.donorHelperMonthV327,{force:true});
    if(target.hasAttribute('data-v327-copy-link'))return void copyLink();
    if(target.hasAttribute('data-v327-go-ot'))return goOt();
    if(target.hasAttribute('data-v327-close')){try{closeModal();}catch(_){}return;}
  },true);

  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form||!['donorHelperSelfFormV327','donorHelperSelfCancelFormV327','donorHelperAdminAddFormV327','donorHelperAdminEditFormV327'].includes(form.id))return;
    event.preventDefault();event.stopPropagation();const fd=new FormData(form),button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
    try{
      if(form.id==='donorHelperSelfFormV327'){
        const result=await DB().rpc('signup_donor_helper_internal_v327',{p_work_date:fd.get('work_date'),p_slot_type:fd.get('slot_type'),p_slot_no:Number(fd.get('slot_no'))});if(result.error)throw result.error;
        try{closeModal();}catch(_){}await loadMonth(S().donorHelperMonthV327,{force:true});
        try{showModal(`<h2>ลงชื่อเรียบร้อยแล้ว</h2><p>ระบบเติมชื่อ เบอร์โทร และหน่วยงานจากข้อมูลส่วนตัวให้แล้ว</p><div class="notice soft-notice">รายการนี้ยังไม่สร้าง OT อัตโนมัติ กรุณาไปขอ OT ที่ <b>ส่วนที่ 2</b></div><div class="form-actions"><button class="primary-btn" type="button" data-v327-go-ot>ไปขอ OT ส่วนที่ 2</button><button class="ghost-btn" type="button" data-v327-close>ปิด</button></div>`,{small:true});}catch(_){toast('ลงชื่อเรียบร้อยแล้ว');}
      }else if(form.id==='donorHelperSelfCancelFormV327'){
        const result=await DB().rpc('request_cancel_donor_helper_internal_v327',{p_signup_id:fd.get('signup_id'),p_reason:String(fd.get('reason')||'').trim()});if(result.error)throw result.error;
        try{closeModal();}catch(_){}await loadMonth(S().donorHelperMonthV327,{force:true});toast('ส่งคำขอยกเลิกแล้ว ชื่อจะยังอยู่จนกว่า Admin จะยืนยัน');
      }else if(form.id==='donorHelperAdminAddFormV327'){
        if(!admin())throw new Error('Permission denied');const unit=String(fd.get('unit_name')||'').trim();if(!isAllowedUnit(unit))throw new Error('กรุณาเลือกหน่วยงานจากรายการ');
        const result=await DB().rpc('admin_add_donor_helper_v324',{p_work_date:fd.get('work_date'),p_slot_type:fd.get('slot_type'),p_slot_no:Number(fd.get('slot_no')),p_helper_name:String(fd.get('helper_name')||'').trim(),p_unit_name:unit,p_phone:String(fd.get('phone')||'').trim()||null});if(result.error)throw result.error;
        try{closeModal();}catch(_){}await loadMonth(S().donorHelperMonthV327,{force:true});toast('เพิ่มชื่อแล้ว');
      }else{
        if(!admin())throw new Error('Permission denied');const unit=String(fd.get('unit_name')||'').trim();if(!isAllowedUnit(unit))throw new Error('กรุณาเลือกหน่วยงานจากรายการ');
        const result=await DB().rpc('admin_edit_donor_helper_v324',{p_signup_id:fd.get('signup_id'),p_helper_name:String(fd.get('helper_name')||'').trim(),p_unit_name:unit,p_phone:String(fd.get('phone')||'').trim()||null});if(result.error)throw result.error;
        try{closeModal();}catch(_){}await loadMonth(S().donorHelperMonthV327,{force:true});toast('แก้ไขข้อมูลแล้ว');
      }
    }catch(error){toast(errorText(error),'error');if(button)button.disabled=false;}
  },true);

  window.cnmiDonorHelperV327={version:VERSION,loadMonth,publicUrl};
  console.info(`[${VERSION}] loaded`);
})();
