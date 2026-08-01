/* V357: explicit rate selector for Staff/Admin extra OT forms */
(function(){
  'use strict';
  if(window.__CNMI_V357_EXTRA_OT_RATE_FORM__) return;
  window.__CNMI_V357_EXTRA_OT_RATE_FORM__=true;
  const RATE_RE=/\[OT_RATE_TYPE=(MT|CLERK)\]/i;
  const esc=v=>{try{return escapeHtml(String(v??''));}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}};
  const today=()=>{try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}};
  const admin=()=>{try{return !!isAdmin();}catch(_){return false;}};
  const holiday=date=>{try{return !!isHolidayDate(date);}catch(_){return false;}};
  function rateOptions(selected='MT'){
    return `<option value="MT" ${selected==='MT'?'selected':''}>MT (130 บาท / นักขัตฤกษ์ 160 บาท)</option><option value="CLERK" ${selected==='CLERK'?'selected':''}>Clerk/เคิก (90 บาท / นักขัตฤกษ์ 120 บาท)</option>`;
  }
  function reasonOptions(){
    let rows=[];try{rows=window.OT_REASONS||(typeof OT_REASONS!=='undefined'?OT_REASONS:[]);}catch(_){}
    if(!Array.isArray(rows)||!rows.length)rows=['เวรปั่นเลือดหลังเวลา (รอเทียบ LIS)','มาช่วยงานเสาร์-อาทิตย์','อื่นๆ'];
    return rows.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  function staffOptions(){
    const current=(()=>{try{return currentStaffId();}catch(_){return '';}})();
    try{
      const rows=(state.staff||[]).filter(s=>s.active!==false&&s.is_active!==false);
      return `<option value="">เลือกชื่อ</option>`+rows.map(s=>`<option value="${esc(s.id)}" ${String(s.id)===String(current)?'selected':''}>${esc(s.nickname||s.full_name||s.email||s.id)}</option>`).join('');
    }catch(_){return '<option value="">เลือกชื่อ</option>';}
  }
  function formHtml(isAdmin){
    if(isAdmin)return `<form id="otForm" class="form-grid v181-admin-ot-extra-form v357-extra-ot-form" data-admin-simple="1">
      <label>เลือกชื่อเจ้าหน้าที่ <select name="staff_id" required>${staffOptions()}</select></label>
      <label>วันที่ <input name="work_date" type="date" value="${esc(today())}" required></label>
      <label>เหตุผล <select name="reason" required>${reasonOptions()}</select></label>
      <label>ชั่วโมงที่ต้องการเบิก <input name="requested_hours" type="number" min="0.5" max="240" step="0.5" placeholder="เช่น 2 / 8 / 16" required></label>
      <label>เรทที่จะเบิก <select name="rate_type" required>${rateOptions()}</select></label>
      <label>รายละเอียด <input name="note" placeholder="ระบุรายละเอียดเพิ่มเติม"></label>
      <button class="primary-btn wide" type="submit">ยืนยันขอ OT เพิ่ม</button>
    </form>`;
    return `<form id="otForm" class="form-grid v357-extra-ot-form">
      <label>วันที่ <input name="work_date" type="date" value="${esc(today())}" required></label>
      <label>เหตุผล <select name="reason" required>${reasonOptions()}</select></label>
      <label>เริ่มเวลา <input name="start_time" type="time" value="16:00" required></label>
      <label>ถึงเวลา <input name="end_time" type="time" required></label>
      <label>เรทที่จะเบิก <select name="rate_type" required>${rateOptions()}</select></label>
      <label>รายละเอียด <input name="note" placeholder="เช่น อยู่แทน ช4 / ปั่นเลือดถึงเวลา..."></label>
      <button class="primary-btn wide" type="submit">ส่งให้ Admin อนุมัติ</button>
    </form>`;
  }
  function enhance(html){
    if(!html||!String(html).includes('ส่วนที่ 2 ขอ OT เพิ่ม / เวรปั่นเลือด'))return html;
    const doc=document.createElement('template');doc.innerHTML=String(html);
    const forms=Array.from(doc.content.querySelectorAll('#otForm')).filter(f=>f.closest('.card')?.textContent?.includes('ส่วนที่ 2 ขอ OT เพิ่ม'));
    forms.forEach(f=>f.replaceWith(document.createRange().createContextualFragment(formHtml(admin()))));
    return doc.innerHTML;
  }
  const prevRender=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof prevRender==='function'){
    const wrapped=function(){return enhance(prevRender.apply(this,arguments));};
    window.renderOtPage=wrapped;try{renderOtPage=wrapped;}catch(_){}
  }
  const prevSave=window.saveOtRequest||(typeof saveOtRequest==='function'?saveOtRequest:null);
  if(typeof prevSave==='function'){
    const wrappedSave=async function(form){
      if(!form?.classList?.contains('v357-extra-ot-form'))return prevSave(form);
      const rate=String(new FormData(form).get('rate_type')||'MT').toUpperCase()==='CLERK'?'CLERK':'MT';
      const note=form.querySelector('[name="note"]');
      if(note){const clean=String(note.value||'').replace(RATE_RE,'').trim();note.value=`[OT_RATE_TYPE=${rate}]${clean?' | '+clean:''}`;}
      return prevSave(form);
    };
    window.saveOtRequest=wrappedSave;try{saveOtRequest=wrappedSave;}catch(_){}
  }
  const api=window.v190HrRateNormalization,prevBreakdown=api?.otNormalizationBreakdown190;
  if(api&&typeof prevBreakdown==='function')api.otNormalizationBreakdown190=function(row){
    const base=prevBreakdown(row);const raw=`${row?.note||''} ${row?.device||''}`;const m=raw.match(RATE_RE);
    if(!m)return base;
    const type=m[1].toUpperCase()==='CLERK'?'เคิก':'MT';
    const appliedRate=type==='เคิก'?(holiday(row?.work_date)?120:90):(holiday(row?.work_date)?160:130);
    const helperInfo=base?.helperInfo?{...base.helperInfo,receiverType:type,workType:type,receiverNormalRate:type==='เคิก'?90:130,workRate:appliedRate,appliedRate}:base?.helperInfo;
    return {...base,rateType:type,helperInfo,segments:(base?.segments||[]).map(s=>({...s,rateType:type,sourceRateType:type,normalRate:type==='เคิก'?90:130,appliedRate,workRate:appliedRate,helperInfo:helperInfo||s.helperInfo})),isExplicitRateV357:true};
  };
  const style=document.createElement('style');style.textContent='.v357-extra-ot-form label{min-width:0}.v357-extra-ot-form select,.v357-extra-ot-form input{width:100%}';document.head.appendChild(style);
})();
