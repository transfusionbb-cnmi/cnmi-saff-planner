/* CNMI Staff Planner V319 — fiscal-year unlock on 1 October
   - HR Export history year filter unlocks the next fiscal year every 1 October.
   - Leave date inputs for both Staff and Admin use the same fiscal-year limit.
   - No new Supabase table or SQL is required.
*/
(function(){
  'use strict';
  const VERSION='V319_FISCAL_YEAR_UNLOCK';
  if(window.__CNMI_V319_FISCAL_YEAR_UNLOCK__)return;
  window.__CNMI_V319_FISCAL_YEAR_UNLOCK__=true;

  function pad2(n){return String(n).padStart(2,'0');}
  function localDate(value){
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return new Date(value.getFullYear(),value.getMonth(),value.getDate());
    const text=String(value||'').slice(0,10),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if(!m)return new Date();
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    return Number.isNaN(d.getTime())?new Date():d;
  }
  function thaiDate(value){
    const d=localDate(value);
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()+543}`;
  }
  function fiscalUnlockInfo(baseDate){
    const d=localDate(baseDate||new Date()),year=d.getFullYear(),month=d.getMonth()+1;
    const currentFiscalYearCE=month>=10?year+1:year;
    const unlockedFiscalYearCE=currentFiscalYearCE+1;
    const unlockedFiscalYearBE=unlockedFiscalYearCE+543;
    return {
      currentFiscalYearCE,
      currentFiscalYearBE:currentFiscalYearCE+543,
      unlockedFiscalYearCE,
      unlockedFiscalYearBE,
      maxLeaveDate:`${unlockedFiscalYearCE}-09-30`,
      maxLeaveDateThai:`30/09/${unlockedFiscalYearBE}`,
      nextUnlockDate:`${currentFiscalYearCE}-10-01`,
      nextUnlockDateThai:`01/10/${currentFiscalYearCE+543}`,
      nextUnlockedFiscalYearBE:unlockedFiscalYearBE+1
    };
  }
  function historyYears(baseDate,count=8){
    const max=fiscalUnlockInfo(baseDate).unlockedFiscalYearCE,out=[];
    for(let y=max;y>max-Math.max(1,Number(count)||8);y--)out.push({value:String(y),label:`พ.ศ. ${y+543}`});
    return out;
  }
  function escapeHtmlSafe(value){
    try{return typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'');}
    catch(_){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }
  function stateSafe(){try{return state;}catch(_){return window.state||{};}}
  function addOrReplaceAttr(tag,name,value){
    const attr=`${name}="${String(value).replace(/"/g,'&quot;')}"`,re=new RegExp(`\\s${name}="[^"]*"`,'i');
    return re.test(tag)?tag.replace(re,` ${attr}`):tag.replace(/>$/,` ${attr}>`);
  }
  function applyLeaveLimit(html){
    const info=fiscalUnlockInfo(),note=`<div class="notice soft-notice wide" data-v319-fiscal-leave-note>ระบบเปิดให้ทุกคนบันทึกการลาถึง ${info.maxLeaveDateThai} (สิ้นปีงบประมาณ ${info.unlockedFiscalYearBE}) และจะปลดล็อกปีงบประมาณ ${info.nextUnlockedFiscalYearBE} อัตโนมัติวันที่ ${info.nextUnlockDateThai}</div>`;
    let out=String(html||'');
    out=out.replace(/<input\s+name="start_date"\s+type="date"[^>]*>/i,tag=>addOrReplaceAttr(tag,'max',info.maxLeaveDate));
    out=out.replace(/<input\s+name="end_date"\s+type="date"[^>]*>/i,tag=>addOrReplaceAttr(tag,'max',info.maxLeaveDate));
    out=out.replace(/<div class="notice soft-notice wide" data-v203-fiscal-leave-note>[\s\S]*?<\/div>/i,note);
    if(!out.includes('data-v319-fiscal-leave-note'))out=out.replace(/<button class="primary-btn wide" type="submit">/i,`${note}<button class="primary-btn wide" type="submit">`);
    return out;
  }
  function applyHistoryYears(html){
    let out=String(html||'');
    if(!out.includes('id="hrHistoryYearV318"'))return out;
    const selected=String(stateSafe().hrHistoryYearV318||''),info=fiscalUnlockInfo();
    if(selected&&Number(selected)>info.unlockedFiscalYearCE){
      stateSafe().hrHistoryYearV318='';
      stateSafe().hrHistoryRowsV318=[];
    }
    const current=String(stateSafe().hrHistoryYearV318||'');
    const options=['<option value="">กรุณาเลือกปี</option>',...historyYears().map(y=>`<option value="${y.value}" ${y.value===current?'selected':''}>${escapeHtmlSafe(y.label)}</option>`)].join('');
    return out.replace(/(<select\s+id="hrHistoryYearV318"[^>]*>)[\s\S]*?(<\/select>)/i,`$1${options}$2`);
  }

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(typeof previousRenderOtPage==='function'&&!previousRenderOtPage.__v319FiscalUnlock){
    const wrapped=function renderOtPageV319(){return applyHistoryYears(previousRenderOtPage.apply(this,arguments));};
    wrapped.__v319FiscalUnlock=true;
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  const previousRenderLeavePage=window.renderLeavePage||(typeof renderLeavePage==='function'?renderLeavePage:null);
  if(typeof previousRenderLeavePage==='function'&&!previousRenderLeavePage.__v319FiscalUnlock){
    const wrapped=function renderLeavePageV319(){return applyLeaveLimit(previousRenderLeavePage.apply(this,arguments));};
    wrapped.__v319FiscalUnlock=true;
    try{window.renderLeavePage=renderLeavePage=wrapped;}catch(_){window.renderLeavePage=wrapped;}
  }

  function validateLeave(form,notify=true){
    const info=fiscalUnlockInfo(),start=form?.querySelector?.('input[name="start_date"]'),end=form?.querySelector?.('input[name="end_date"]');
    if(start)start.max=info.maxLeaveDate;if(end)end.max=info.maxLeaveDate;
    const over=[start?.value,end?.value].some(v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&String(v)>info.maxLeaveDate);
    const message=over?`บันทึกการลาได้ถึง ${info.maxLeaveDateThai} ซึ่งเป็นวันสิ้นสุดปีงบประมาณ ${info.unlockedFiscalYearBE}`:'';
    [start,end].forEach(input=>{try{input?.setCustomValidity?.(message);}catch(_){}});
    if(over&&notify){try{showToast(message,{tone:'error'});}catch(_){alert(message);}}
    return !over;
  }
  const previousSaveLeave=window.saveLeave||(typeof saveLeave==='function'?saveLeave:null);
  if(typeof previousSaveLeave==='function'&&!previousSaveLeave.__v319FiscalUnlock){
    const wrapped=async function saveLeaveV319(form){if(!validateLeave(form,true))return;return previousSaveLeave.apply(this,arguments);};
    wrapped.__v319FiscalUnlock=true;
    try{window.saveLeave=saveLeave=wrapped;}catch(_){window.saveLeave=wrapped;}
  }
  document.addEventListener('change',event=>{
    const form=event.target?.closest?.('#leaveForm');
    if(form&&['start_date','end_date'].includes(event.target?.name))validateLeave(form,true);
  },true);

  window.cnmiV319={version:VERSION,getFiscalUnlockInfo:fiscalUnlockInfo,historyYears,_test:{fiscalUnlockInfo,historyYears,applyHistoryYears,applyLeaveLimit}};
  console.info(`[${VERSION}] 1 October fiscal-year unlock loaded`,fiscalUnlockInfo());
})();
