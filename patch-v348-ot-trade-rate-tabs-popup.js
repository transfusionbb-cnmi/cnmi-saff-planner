/* CNMI Staff Planner V350
   - Makes purchased-duty OT auditable: seller, date, duty, sold rate, money and HR-hour formula.
   - Uses the saved trade amount as the source of truth for cross-rate HR normalization.
   - Staff gets two nearby tabs instead of a long claim-details card at the bottom.
   - Admin detail modal is wide on desktop and card-based on mobile.
   - Trade rows are loaded only for roster assignments in the selected OT month.
   - Weekend donor-helper OT uses the signed slot rate: phlebotomist = MT, Clerk = clerk.
*/
(function(){
  'use strict';
  const VERSION = 'V350_DONOR_HELPER_SLOT_OT_RATE';
  if (window.__CNMI_V350_DONOR_HELPER_SLOT_OT_RATE__) return;
  window.__CNMI_V350_DONOR_HELPER_SLOT_OT_RATE__ = true;

  const tradeLoads = new Map();
  const helperLoads = new Map();
  const helperRowsByMonth = new Map();
  const refreshedTradeScopes = new Set();
  let staffInnerTab = 'list';
  let lastAdminStaffId = '';
  let refreshQueued = false;
  let arranging = false;

  function S(){ try { return state; } catch (_) { return window.state || {}; } }
  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function round2(v){ const n=Number(v||0); return Number.isFinite(n) ? Math.round(n*100)/100 : 0; }
  function hours(v){ const n=round2(v); return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,''); }
  function baht(v){
    const n=round2(v);
    return `${n.toLocaleString('th-TH',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2})} บ.`;
  }
  function normDate(v){ try { return normalizeDateKey(v); } catch (_) { return String(v||'').slice(0,10); } }
  function fmtDate(v){ const d=normDate(v); if(!d)return '-'; try{return formatThaiDate(d);}catch(_){return d;} }
  function currentSid(){ try{return String(currentStaffId()||'');}catch(_){return String(S()?.profile?.staff_id||S()?.profile?.id||'');} }
  function admin(){ try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;} }
  function staffRecord(id){ return (S()?.staff||[]).find(x=>String(x?.id||'')===String(id||''))||null; }
  function staffName(id){
    try{return staffNick(id);}catch(_){const s=staffRecord(id)||{};return s.nickname||s.full_name||s.name||id||'-';}
  }
  function staffPillSafe(id){ try{return staffPill(id);}catch(_){return `<span class="staff-pill">${esc(staffName(id))}</span>`;} }
  function selectedMonth(){
    const raw=String(S()?.otSourceMonthV241||S()?.otMoneyMonthV241||S()?.myDutyMonthFilter||S()?.monthKey||'').slice(0,7);
    if(/^\d{4}-\d{2}$/.test(raw))return raw;
    const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function assignmentById(id){ return (S()?.rosterAssignments||[]).find(a=>String(a?.id||'')===String(id||''))||null; }
  function assignmentCode(a){ return String(a?.duty_code||a?.shift_type||'').trim(); }
  function dutyLabel(code){ try{return DUTY_LABEL?.[code]||code||'-';}catch(_){return code||'-';} }
  function isHoliday(date){ try{return !!isHolidayDate(date);}catch(_){return false;} }
  function rateTypeFor(staffId,dutyCode){
    try{const t=dutyStaffTypeForRate(staffId,dutyCode);if(t)return t==='เคิก'?'เคิก':'MT';}catch(_){}
    const s=staffRecord(staffId)||{};
    const nick=String(s.nickname||s.full_name||'');
    if(/แตง/.test(nick)&&['ช3A','ช3B','ช4','ช4A','ช4B'].includes(String(dutyCode||'')))return 'MT';
    return String(s.staff_type||s.type||'').trim()==='เคิก'?'เคิก':'MT';
  }
  function normalRateFor(staffId,dutyCode){ return rateTypeFor(staffId,dutyCode)==='เคิก'?90:130; }
  function rateForType(type,date){ return type==='เคิก'?(isHoliday(date)?120:90):(isHoliday(date)?160:130); }
  function baseRateTypeFor(staffId){
    const s=staffRecord(staffId)||{};
    const nick=String(s.nickname||s.full_name||'');
    if(/แตง/.test(nick))return 'เคิก';
    return String(s.staff_type||s.type||'').trim()==='เคิก'?'เคิก':'MT';
  }
  function parsePayload(data){
    if(!data)return{};
    if(typeof data==='string'){try{return JSON.parse(data)||{};}catch(_){return{};}}
    return data;
  }
  function cachedHelperRows(month){
    if(helperRowsByMonth.has(month))return helperRowsByMonth.get(month)||[];
    const st=S();
    if(String(st?.donorHelperLoadedMonthV327||'')===String(month||'')){
      const rows=Array.isArray(st?.donorHelperPayloadV327?.rows)?st.donorHelperPayloadV327.rows:[];
      helperRowsByMonth.set(month,rows);
      return rows;
    }
    return [];
  }
  async function ensureHelpers(month){
    const key=String(month||selectedMonth()).slice(0,7);
    if(helperRowsByMonth.has(key))return {loaded:true,count:(helperRowsByMonth.get(key)||[]).length,cached:true};
    if(helperLoads.has(key))return helperLoads.get(key);
    let db=null;try{db=sb;}catch(_){db=window.sb||null;}
    if(!db?.rpc)return {loaded:false,reason:'no-db'};
    const task=(async()=>{
      const result=await db.rpc('get_donor_helper_month_internal_v327',{p_month:key});
      if(result?.error)throw result.error;
      const payload=parsePayload(result?.data);
      const rows=Array.isArray(payload?.rows)?payload.rows:[];
      helperRowsByMonth.set(key,rows);
      return {loaded:true,count:rows.length};
    })().catch(error=>{
      console.warn(`[${VERSION}] donor-helper load`,error);
      helperLoads.delete(key);
      return {loaded:false,error};
    });
    helperLoads.set(key,task);
    return task;
  }
  function isHelperOtRow(row){
    return /มาช่วยงานเสาร์\s*[–—-]?\s*อาทิตย์|มาช่วย.*เสาร์.*อาทิตย์|ช่วยห้องบริจาคโลหิต|donor\s*helper/i.test(`${row?.reason||''} ${row?.note||''}`);
  }
  function helperSignupForOtRow(row){
    if(!isHelperOtRow(row))return null;
    const sid=String(row?.staff_id||''),date=normDate(row?.work_date),month=date.slice(0,7);
    if(!sid||!date)return null;
    return cachedHelperRows(month).find(item=>{
      const status=String(item?.status||'confirmed');
      return String(item?.internal_staff_id||'')===sid&&normDate(item?.work_date)===date&&!['cancelled','no_show'].includes(status);
    })||null;
  }
  function helperClaimInfo(row,base){
    const signup=helperSignupForOtRow(row);
    if(!signup)return null;
    const actual=round2(base?.actualHours||0);
    if(actual<=0)return null;
    const slotType=String(signup.slot_type||'').toLowerCase();
    const workType=slotType==='clerk'?'เคิก':'MT';
    const receiverType=baseRateTypeFor(row?.staff_id);
    const receiverNormalRate=receiverType==='เคิก'?90:130;
    const workRate=rateForType(workType,row?.work_date);
    const claimHours=receiverNormalRate>0?round2(actual*workRate/receiverNormalRate):0;
    const slotLabel=slotType==='clerk'?'Clerk':`คนเจาะ ${Number(signup.slot_no||1)}`;
    return {signup,actualHours:actual,slotType,slotLabel,workType,workRate,receiverType,receiverNormalRate,claimHours,isHoliday:isHoliday(row?.work_date)};
  }
  function sellHours(trade,a){
    const marker=Number(String(trade?.note||'').match(/\[SELL_HOURS=(\d+(?:\.\d+)?)\]/i)?.[1]||0);
    if(Number.isFinite(marker)&&marker>0)return marker;
    try{const h=Number(shiftPaymentHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return h;}catch(_){}
    try{const h=Number(dutyHoursForCode(a?.duty_date,a?.duty_code));if(h>0)return h;}catch(_){}
    return 0;
  }
  function cleanTradeNote(note){
    return String(note||'').replace(/\s*\[SELL_PART=[a-z_]+\]\s*/ig,' ').replace(/\s*\[SELL_HOURS=\d+(?:\.\d+)?\]\s*/ig,' ').replace(/\s*\[SELL_SEGMENTS=[^\]]+\]\s*/ig,' ').replace(/\s{2,}/g,' ').trim();
  }
  function soldRateType(trade,a){
    const mode=String(trade?.rate_mode||'receiver');
    if(mode==='mt')return 'MT';
    if(mode==='kerk')return 'เคิก';
    if(mode==='owner')return rateTypeFor(trade?.requester_id,assignmentCode(a));
    if(mode==='receiver')return rateTypeFor(trade?.receiver_id,assignmentCode(a));
    return 'กำหนดเอง';
  }

  function completedTrades(){ return (S()?.tradeRequests||[]).filter(t=>String(t?.status||'')==='completed'&&t?.from_assignment_id&&t?.receiver_id); }
  function tradeForOtRow(row,base){
    const sid=String(row?.staff_id||'');
    const date=normDate(row?.work_date);
    if(!sid||!date)return null;
    const actual=Number(base?.actualHours||0);
    const explicit=String(row?.duty_code||row?.shift_type||row?.shift_code||row?.ot_type||'').trim();
    const text=`${row?.reason||''} ${row?.note||''}`;
    let best=null,bestScore=-1;
    completedTrades().forEach(trade=>{
      if(String(trade.receiver_id)!==sid)return;
      const a=assignmentById(trade.from_assignment_id);
      if(!a||normDate(a.duty_date)!==date)return;
      const code=assignmentCode(a),sold=sellHours(trade,a);
      let score=1;
      if(String(row?.assignment_id||row?.roster_assignment_id||'')===String(a.id))score+=100;
      if(explicit&&explicit===code)score+=20;
      if(code&&text.includes(code))score+=12;
      if(actual>0&&sold>0&&Math.abs(actual-sold)<=0.11)score+=10;
      if(/ยืนยันอยู่เวรตามตาราง|ยืนยันอยู่เวร/.test(text))score+=4;
      if(score>bestScore){bestScore=score;best={trade,assignment:a,soldHours:sold};}
    });
    return bestScore>=5?best:null;
  }

  function tradeClaimInfo(row,base){
    const found=tradeForOtRow(row,base);
    if(!found)return null;
    const {trade,assignment}=found;
    const actual=round2(base?.actualHours||found.soldHours||0);
    const soldHoursValue=round2(found.soldHours||actual);
    const receiverType=rateTypeFor(trade.receiver_id,assignmentCode(assignment));
    const receiverNormalRate=normalRateFor(trade.receiver_id,assignmentCode(assignment));
    const mode=String(trade.rate_mode||'receiver');
    const paidType=soldRateType(trade,assignment);
    let amount=Number(trade.amount_from);
    const hasSavedAmount=Number.isFinite(amount)&&(amount>0||mode==='custom');
    if(!hasSavedAmount){
      const paidRate=paidType==='กำหนดเอง'?0:rateForType(paidType,assignment.duty_date);
      amount=round2(soldHoursValue*paidRate);
    }
    amount=round2(Math.max(0,amount||0));
    const paidRate=soldHoursValue>0?round2(amount/soldHoursValue):0;
    const claimHours=receiverNormalRate>0?round2(amount/receiverNormalRate):0;
    return {
      trade,assignment,actualHours:actual,soldHours:soldHoursValue,amount,paidRate,paidType,
      receiverType,receiverNormalRate,claimHours,mode,note:cleanTradeNote(trade.note)
    };
  }

  const normalizeApi=window.v190HrRateNormalization;
  const originalBreakdown=normalizeApi?.otNormalizationBreakdown190;
  function breakdown(row){
    let base;
    try{base=originalBreakdown?originalBreakdown(row):null;}catch(_){}
    if(!base){
      let actual=0;try{actual=Number(calcOtHours(row)||0);}catch(_){actual=Number(row?.manual_hours||row?.hours||0);}
      base={actualHours:round2(actual),hrHours:round2(actual),segments:[],shiftType:row?.duty_code||'-',rateType:rateTypeFor(row?.staff_id,row?.duty_code),isHoliday:isHoliday(row?.work_date)};
    }
    const info=tradeClaimInfo(row,base);
    if(info)return {...base,hrHours:info.claimHours,rateType:info.receiverType,tradeInfo:info,isTradeRate:true};
    const helper=helperClaimInfo(row,base);
    if(!helper)return base;
    const segment={
      actualHours:helper.actualHours,hrHours:helper.claimHours,
      rateType:helper.receiverType,sourceRateType:helper.workType,
      normalRate:helper.receiverNormalRate,appliedRate:helper.workRate,workRate:helper.workRate,
      shiftType:`มาช่วยเสาร์–อาทิตย์ • ${helper.slotLabel}`,isHoliday:helper.isHoliday,
      multiplier:helper.receiverNormalRate?round2(helper.workRate/helper.receiverNormalRate):1,
      helperInfo:helper
    };
    return {...base,actualHours:helper.actualHours,hrHours:helper.claimHours,segments:[segment],shiftType:segment.shiftType,rateType:helper.receiverType,isHoliday:helper.isHoliday,helperInfo:helper,isDonorHelperRate:true};
  }
  if(normalizeApi&&originalBreakdown)normalizeApi.otNormalizationBreakdown190=breakdown;

  function mergeTrades(rows){
    const map=new Map((S()?.tradeRequests||[]).map(x=>[String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}`),x]));
    (rows||[]).forEach(x=>map.set(String(x?.id||`${x?.from_assignment_id}|${x?.receiver_id}`),x));
    S().tradeRequests=Array.from(map.values());
  }
  async function ensureTrades(month,staffId){
    const scope=admin()?'admin':String(staffId||currentSid());
    const key=`${month}|${scope}`;
    if(tradeLoads.has(key))return tradeLoads.get(key);
    const assignments=(S()?.rosterAssignments||[]).filter(a=>normDate(a?.duty_date).startsWith(month)&&a?.id);
    if(!assignments.length)return {loaded:false,reason:'no-roster'};
    let db=null;try{db=sb;}catch(_){db=window.sb||null;}
    if(!db?.from)return {loaded:false,reason:'no-db'};
    const task=(async()=>{
      const rows=[];
      const ids=assignments.map(a=>a.id);
      for(let i=0;i<ids.length;i+=50){
        let q=db.from('roster_trade_requests').select('*').in('from_assignment_id',ids.slice(i,i+50)).eq('status','completed');
        if(!admin()&&scope)q=q.eq('receiver_id',scope);
        const res=await q;
        if(res?.error)throw res.error;
        rows.push(...(res?.data||[]));
      }
      mergeTrades(rows);
      return {loaded:true,count:rows.length};
    })().catch(error=>{console.warn(`[${VERSION}] trade load`,error);tradeLoads.delete(key);return {loaded:false,error};});
    tradeLoads.set(key,task);
    return task;
  }

  function tradeExplain(info){
    if(!info)return '<span class="badge blue">OT ปกติ / OT เพิ่ม</span>';
    const a=info.assignment||{},t=info.trade||{};
    const rateText=info.paidType==='กำหนดเอง'?`กำหนดเอง ${baht(info.amount)}`:`${info.paidType} ${hours(info.paidRate)} บ./ชม.`;
    const formula=info.amount===0
      ? 'รายการนี้บันทึกมูลค่า 0 บาท จึงไม่นำชั่วโมงจากการซื้อเวรนี้ไปเบิก HR'
      : `${baht(info.amount)} ÷ เรทเบิกประจำของผู้รับ ${info.receiverType} ${hours(info.receiverNormalRate)} บ./ชม. = ${hours(info.claimHours)} ชม.`;
    return `<div class="v348-trade-box">
      <div class="v348-trade-head"><span class="badge purple">OT จากการซื้อเวร</span><b>ซื้อจาก ${staffPillSafe(t.requester_id)}</b></div>
      <div class="v348-trade-grid"><span><small>วันที่ / เวร</small><b>${esc(fmtDate(a.duty_date))} • ${esc(dutyLabel(assignmentCode(a)))}</b></span><span><small>ช่วงที่ซื้อ</small><b>${hours(info.soldHours)} ชม.</b></span><span><small>เรทที่ซื้อ</small><b>${esc(rateText)}</b></span><span><small>มูลค่าที่บันทึก</small><b>${esc(baht(info.amount))}</b></span></div>
      <div class="v348-formula"><b>วิธีแปลงเป็นชั่วโมงเบิก HR:</b> ${esc(formula)}</div>
      ${info.note?`<div class="muted">หมายเหตุการซื้อขาย: ${esc(info.note)}</div>`:''}
    </div>`;
  }
  function helperExplain(info){
    if(!info)return '';
    const holiday=info.isHoliday?'วันนักขัตฤกษ์':'วันปกติ';
    const formula=`${hours(info.actualHours)} ชม. × ${hours(info.workRate)} บ./ชม. ÷ ฐาน HR ${hours(info.receiverNormalRate)} บ./ชม. = ${hours(info.claimHours)} ชม.เบิก HR`;
    return `<div class="v350-helper-box">
      <div class="v350-helper-head"><span class="badge blue">OT มาช่วยเสาร์–อาทิตย์</span><b>คิดเรทตามช่องที่ลงชื่อ</b></div>
      <div class="v350-helper-grid"><span><small>ตำแหน่งที่ลงชื่อ</small><b>${esc(info.slotLabel)}</b></span><span><small>เรทของช่อง (${esc(holiday)})</small><b>${esc(info.workType)} ${hours(info.workRate)} บ./ชม.</b></span><span><small>ฐานเบิก HR ของผู้รับ</small><b>${esc(info.receiverType)} ${hours(info.receiverNormalRate)} บ./ชม.</b></span><span><small>ชั่วโมงจริง</small><b>${hours(info.actualHours)} ชม.</b></span></div>
      <div class="v350-helper-formula"><b>วิธีคำนวณ:</b> ${esc(formula)}</div>
    </div>`;
  }
  function claimStatus(row){
    const s=String(row?.claim_status||'').toLowerCase();
    return ['claimed','exported','hr_exported','เบิกแล้ว','export แล้ว'].includes(s)?'<span class="badge green">Exported</span>':'<span class="badge orange">Pending</span>';
  }
  function timeText(row){
    const start=String(row?.start_time||'').slice(0,5),end=String(row?.end_time||'').slice(0,5);
    const endDate=normDate(row?.end_date),date=normDate(row?.work_date);
    return `${start||'-'}–${end||'-'}${endDate&&endDate!==date?` (${fmtDate(endDate)})`:''}`;
  }
  function detailRows(rows){
    if(!rows.length)return '<div class="empty">ยังไม่มีรายการ OT ที่อนุมัติในเดือนนี้</div>';
    const body=rows.map(row=>{
      const n=breakdown(row),info=n.tradeInfo,helper=n.helperInfo;
      return `<tr><td>${esc(fmtDate(row.work_date))}</td><td>${esc(timeText(row))}</td><td><b>${esc(row.reason||'-')}</b>${row.note?`<br><span class="muted">${esc(row.note)}</span>`:''}${tradeExplain(info)}${helperExplain(helper)}</td><td><b>${hours(n.actualHours)}</b></td><td><b>${hours(n.hrHours)}</b>${info?'<br><span class="badge purple">แปลงตามเรทที่ซื้อ</span>':helper?'<br><span class="badge blue">แปลงตามเรทช่องที่ลงชื่อ</span>':''}</td><td>${claimStatus(row)}</td></tr>`;
    }).join('');
    const cards=rows.map(row=>{
      const n=breakdown(row),info=n.tradeInfo,helper=n.helperInfo;
      return `<article class="v348-ot-card"><div class="v348-card-head"><b>${esc(fmtDate(row.work_date))}</b>${claimStatus(row)}</div><div><b>${esc(row.reason||'-')}</b><div class="muted">${esc(timeText(row))}${row.note?` • ${esc(row.note)}`:''}</div></div>${tradeExplain(info)}${helperExplain(helper)}<div class="v348-hour-pair"><span>ชั่วโมงจริง <b>${hours(n.actualHours)}</b></span><span>ชั่วโมงเบิก HR <b>${hours(n.hrHours)}</b></span></div></article>`;
    }).join('');
    return `<div class="v348-detail-rows"><div class="table-wrap v348-desktop-detail"><table><thead><tr><th>วันที่ OT</th><th>เวลา</th><th>เหตุผล / ที่มา / สูตรเรท</th><th>ชั่วโมงจริง</th><th>ชั่วโมงเบิก HR</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table></div><div class="v348-mobile-detail">${cards}</div></div>`;
  }

  function updateDetailRoot(root,sid,month){
    if(!root||!sid)return;
    const rows=window.cnmiV347?.approvedDetails?.(sid,month)||[];
    const old=root.querySelector('.v347-detail-table,.v348-detail-rows');
    if(old)old.outerHTML=detailRows(rows);
    if(root.classList.contains('v347-admin-detail')){
      const modal=document.getElementById('modal');
      modal?.classList.add('modal-lg','v348-ot-detail-modal');
      let note=root.querySelector('.v348-admin-note');
      if(!note){
        note=document.createElement('div');note.className='notice soft-notice compact v348-admin-note';
        note.innerHTML='<b>อ่านตามลำดับ:</b> ดูยอดรวมด้านบน แล้วตรวจแต่ละรายการด้านล่าง โดยรายการซื้อเวรจะแสดงผู้ขาย เรท มูลค่า และสูตรแปลงชั่วโมงครบ';
        root.querySelector('.v347-claim-equation')?.before(note);
      }
    }
    const slot=root.querySelector('.v347-summary-slot');
    if(slot&&window.cnmiV347?.summaryHtml){
      const api=window.cnmiV318;
      Promise.resolve(api?.queryCarryInSummary?.(month)).then(map=>{
        const carry=map instanceof Map?(map.get(String(sid))||{amount:0,sourceMonth:''}):{amount:0,sourceMonth:''};
        if(document.body.contains(root))slot.innerHTML=window.cnmiV347.summaryHtml(sid,rows,carry);
      }).catch(()=>{});
    }
  }

  async function refreshDetail(root,sid,month){
    updateDetailRoot(root,sid,month);
    const [trades,helpers]=await Promise.all([ensureTrades(month,sid),ensureHelpers(month)]);
    if((trades?.loaded||helpers?.loaded)&&document.body.contains(root))updateDetailRoot(root,sid,month);
  }
  function findMyListCard(){
    return Array.from(document.querySelectorAll('#pageContent .card')).find(card=>{
      const h=card.querySelector('h3');return h&&h.textContent.trim()==='รายการ OT ของฉัน'&&!card.classList.contains('v347-my-claim-card');
    })||null;
  }
  function applyStaffTab(){
    const list=document.querySelector('.v348-staff-list-card');
    const detail=document.querySelector('.v348-staff-detail-card');
    const tabs=document.querySelector('.v348-staff-tabs');
    if(!list||!detail||!tabs)return;
    const showDetail=staffInnerTab==='detail';
    list.classList.toggle('v348-hidden',showDetail);
    detail.classList.toggle('v348-hidden',!showDetail);
    tabs.querySelectorAll('[data-v348-staff-tab]').forEach(btn=>{
      const active=btn.dataset.v348StaffTab===staffInnerTab;
      btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false');
    });
  }
  function arrangeStaff(){
    if(arranging||admin())return;
    const detail=document.querySelector('#pageContent .v347-my-claim-card');
    const list=findMyListCard();
    if(!detail||!list)return;
    arranging=true;
    try{
      let tabs=document.querySelector('#pageContent .v348-staff-tabs');
      if(!tabs){
        tabs=document.createElement('div');tabs.className='v348-staff-tabs';tabs.setAttribute('role','tablist');
        tabs.innerHTML='<button type="button" class="active" role="tab" aria-selected="true" data-v348-staff-tab="list">รายการ OT ของฉัน</button><button type="button" role="tab" aria-selected="false" data-v348-staff-tab="detail">รายละเอียด OT ที่นำมาคำนวณเบิกของฉัน</button>';
        list.before(tabs);
      }
      list.classList.add('v348-staff-list-card');detail.classList.add('v348-staff-detail-card');
      if(tabs.nextElementSibling!==detail)tabs.after(detail);
      if(detail.nextElementSibling!==list)detail.after(list);
      applyStaffTab();
      refreshDetail(detail,currentSid(),String(detail.dataset.v347Month||selectedMonth()).slice(0,7));
    }finally{arranging=false;}
  }

  function queueFullRefresh(){
    if(refreshQueued)return;refreshQueued=true;
    setTimeout(async()=>{
      refreshQueued=false;
      if(String(S()?.page||'')!=='ot')return;
      const month=selectedMonth(),scope=admin()?'admin':currentSid(),key=`${month}|${scope}`;
      if(refreshedTradeScopes.has(key))return;
      const [trades,helpers]=await Promise.all([ensureTrades(month,currentSid()),ensureHelpers(month)]);
      if((trades?.loaded||helpers?.loaded)&&typeof renderPage==='function'){
        refreshedTradeScopes.add(key);
        renderPage();
      }
    },80);
  }
  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(previousRenderOtPage){
    const wrapped=function renderOtPageV348(){const html=previousRenderOtPage.apply(this,arguments);queueFullRefresh();setTimeout(arrangeStaff,0);return html;};
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  document.addEventListener('click',e=>{
    const tab=e.target?.closest?.('[data-v348-staff-tab]');
    if(tab){staffInnerTab=tab.dataset.v348StaffTab==='detail'?'detail':'list';applyStaffTab();return;}
    const adminLink=e.target?.closest?.('.v241-real-month-section [data-v347-show-staff]');
    if(adminLink&&admin())lastAdminStaffId=String(adminLink.getAttribute('data-v347-show-staff')||'');
  },true);

  const observer=new MutationObserver(mutations=>{
    if(arranging)return;
    if(mutations.some(m=>Array.from(m.addedNodes||[]).some(n=>n.nodeType===1&&(n.matches?.('.v347-my-claim-card,.v347-admin-detail')||n.querySelector?.('.v347-my-claim-card,.v347-admin-detail'))))){
      setTimeout(()=>{
        arrangeStaff();
        const root=document.querySelector('#modalBody .v347-admin-detail');
        if(root&&lastAdminStaffId)refreshDetail(root,lastAdminStaffId,selectedMonth());
      },0);
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  const style=document.createElement('style');
  style.textContent=`
    .v348-staff-tabs{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 -4px;padding:8px;border:1px solid #dbe7f3;border-radius:16px;background:#f8fbff}
    .v348-staff-tabs button{border:1px solid #d5e4f2;border-radius:999px;background:#fff;color:#314b62;padding:10px 16px;font-weight:800;cursor:pointer}
    .v348-staff-tabs button.active{background:#75c5f4;border-color:#75c5f4;color:#17364e;box-shadow:0 5px 14px rgba(63,152,207,.2)}
    .v348-hidden{display:none!important}.v348-staff-detail-card,.v348-staff-list-card{grid-column:1/-1}
    .v348-trade-box{margin-top:8px;padding:10px;border:1px solid #dfd4f5;border-radius:12px;background:#faf7ff;display:grid;gap:8px;min-width:310px}
    .v348-trade-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.v348-trade-head .staff-pill{vertical-align:middle}
    .v348-trade-grid{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:6px}.v348-trade-grid span{display:grid;gap:2px;padding:7px 8px;border-radius:9px;background:#fff}.v348-trade-grid small{color:#6d7180}.v348-formula{padding:8px 10px;border-radius:9px;background:#f0e9ff;color:#4c3475;line-height:1.5}
    .v350-helper-box{margin-top:8px;padding:10px;border:1px solid #c9e3f4;border-radius:12px;background:#f4fbff;display:grid;gap:8px;min-width:310px}.v350-helper-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.v350-helper-grid{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:6px}.v350-helper-grid span{display:grid;gap:2px;padding:7px 8px;border-radius:9px;background:#fff}.v350-helper-grid small{color:#5e7488}.v350-helper-formula{padding:8px 10px;border-radius:9px;background:#e6f5ff;color:#245573;line-height:1.5}
    .v348-desktop-detail table{min-width:900px}.v348-desktop-detail th,.v348-desktop-detail td{vertical-align:top}.v348-desktop-detail th:nth-child(3){min-width:390px}
    .v348-mobile-detail{display:none}.v348-ot-card{border:1px solid #dbe7f3;border-radius:16px;padding:12px;background:#fff;display:grid;gap:10px}.v348-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.v348-hour-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v348-hour-pair span{padding:9px;border-radius:10px;background:#f3f8fc;display:flex;justify-content:space-between;gap:8px}
    .v348-ot-detail-modal .modal-card{width:min(1180px,calc(100vw - 32px))!important;max-height:92vh!important}.v348-admin-detail{min-width:0!important}.v348-admin-detail>.section-title{padding-right:46px}.v348-admin-note{margin:8px 0 12px}
    @media(max-width:900px){
      .v348-desktop-detail{display:none}.v348-mobile-detail{display:grid;gap:10px}.v348-trade-box,.v350-helper-box{min-width:0}.v348-trade-grid,.v350-helper-grid{grid-template-columns:1fr 1fr}.v348-ot-detail-modal .modal-card{width:min(96vw,100%)!important;padding:16px!important}.v347-claim-equation{grid-template-columns:1fr 1fr!important}.v347-claim-equation .money{grid-column:1/-1}
    }
    @media(max-width:560px){.v348-staff-tabs{display:grid;grid-template-columns:1fr}.v348-staff-tabs button{white-space:normal}.v348-trade-grid,.v350-helper-grid,.v348-hour-pair{grid-template-columns:1fr}.v347-claim-equation{grid-template-columns:1fr!important}.v347-claim-equation .money{grid-column:auto}.v348-trade-box,.v350-helper-box{font-size:13px}}
  `;
  document.head.appendChild(style);

  window.cnmiV348={version:VERSION,breakdown,tradeForOtRow,tradeClaimInfo,helperSignupForOtRow,helperClaimInfo,ensureTrades,ensureHelpers,detailRows,arrangeStaff};
  console.info(`[${VERSION}] loaded`);
})();
