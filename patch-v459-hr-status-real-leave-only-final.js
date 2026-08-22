/* CNMI Staff Planner V459
 * Final calendar HR-status guard.
 * HR workflow belongs ONLY to real leave records in state.leaves.
 * Never show HR status on roster duties, activities, training, meetings,
 * outings, holidays, standards, CODE events, or "ไม่รับเวร".
 * Display-only; no Supabase schema/query/write changes.
 */
(function(){
  'use strict';
  const VERSION='V459_HR_STATUS_REAL_LEAVE_ONLY_FINAL';
  if(window.__CNMI_V459_HR_STATUS_REAL_LEAVE_ONLY_FINAL__)return;
  window.__CNMI_V459_HR_STATUS_REAL_LEAVE_ONLY_FINAL__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}

  function isRealLeaveEvent(e){
    if(!e || !e.raw) return false;
    const type=String(e.type||'').trim();
    if(!type.startsWith('leave-')) return false;
    /* "ไม่รับเวร" is emitted as noduty, but keep an explicit guard. */
    if(type==='noduty') return false;

    const rows=Array.isArray(S().leaves)?S().leaves:[];
    if(rows.includes(e.raw)) return true;
    if(e.raw?.id==null) return false;
    const id=String(e.raw.id);
    const staffId=String(e.raw?.staff_id??'');
    return rows.some(r=>String(r?.id??'')===id && String(r?.staff_id??'')===staffId);
  }

  const HR_TEXTS=new Set([
    '✓ ตรวจสอบ HR แล้ว','✓ ตรวจ HR แล้ว','รอตรวจสอบ HR','ยังไม่ลง HR','รอเอกสาร HR','HR ยกเลิก'
  ]);

  function stripHrMarkup(html){
    const source=String(html||'');
    if(!/HR|hr-|v45[34]/i.test(source)) return source;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=source;
      tpl.content.querySelectorAll(
        '.v453-calendar-hr-pill,.v454-calendar-hr-pill,.v453-hr-pill,.v454-hr-pill,.hr-checked-badge'
      ).forEach(n=>n.remove());
      tpl.content.querySelectorAll('span,button,div').forEach(n=>{
        const text=String(n.textContent||'').replace(/\s+/g,' ').trim();
        if(HR_TEXTS.has(text) && /badge|pill|hr/i.test(String(n.className||''))) n.remove();
      });
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML
        .replace(/(?:<br\s*\/?>(?:\s|&nbsp;)*){2,}/gi,'<br>')
        .replace(/^\s*<br\s*\/?>/i,'');
    }catch(_){
      return source
        .replace(/<br\s*\/?>\s*<span[^>]*class=["'][^"']*(?:v453|v454|hr-checked)[^"']*["'][^>]*>.*?<\/span>/gis,'')
        .replace(/<span[^>]*class=["'][^"']*(?:v453|v454|hr-checked)[^"']*["'][^>]*>.*?<\/span>/gis,'');
    }
  }

  /* Clean metadata first so downstream renderers cannot interpret a non-leave
     event as an HR-tracked row. */
  const previousCollect=window.collectCalendarEvents||(typeof collectCalendarEvents==='function'?collectCalendarEvents:null);
  if(typeof previousCollect==='function'&&!previousCollect.__v459Wrapped){
    const wrapped=function collectCalendarEventsV459(){
      const events=previousCollect.apply(this,arguments)||[];
      return events.map(e=>{
        if(isRealLeaveEvent(e)) return e;
        if(!e || typeof e!=='object') return e;
        const clean={...e,hrChecked:false};
        delete clean.hrStatusV453;
        delete clean.hrStatusV454;
        return clean;
      });
    };
    wrapped.__v459Wrapped=true;
    try{window.collectCalendarEvents=collectCalendarEvents=wrapped;}catch(_){window.collectCalendarEvents=wrapped;}
  }

  /* Day/week views call calendarEventDetail directly. */
  const previousDetail=window.calendarEventDetail||(typeof calendarEventDetail==='function'?calendarEventDetail:null);
  if(typeof previousDetail==='function'&&!previousDetail.__v459Wrapped){
    const wrapped=function calendarEventDetailV459(e){
      const html=String(previousDetail.apply(this,arguments)||'');
      return isRealLeaveEvent(e)?html:stripHrMarkup(html);
    };
    wrapped.__v459Wrapped=true;
    try{window.calendarEventDetail=calendarEventDetail=wrapped;}catch(_){window.calendarEventDetail=wrapped;}
  }

  /* Modal rows are sanitized again at the final HTML boundary. This makes the
     fix independent of older patch wrapping order. */
  const previousModalRow=window.renderCalendarModalRow||(typeof renderCalendarModalRow==='function'?renderCalendarModalRow:null);
  if(typeof previousModalRow==='function'&&!previousModalRow.__v459Wrapped){
    const wrapped=function renderCalendarModalRowV459(e){
      const html=String(previousModalRow.apply(this,arguments)||'');
      return isRealLeaveEvent(e)?html:stripHrMarkup(html);
    };
    wrapped.__v459Wrapped=true;
    try{window.renderCalendarModalRow=renderCalendarModalRow=wrapped;}catch(_){window.renderCalendarModalRow=wrapped;}
  }

  window.cnmiHrStatusRealLeaveOnlyV459={version:VERSION,isRealLeaveEvent,stripHrMarkup};
  console.info(`${VERSION} loaded`);
})();
