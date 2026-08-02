/* CNMI Staff Planner V380
   - Makes OT reason/detail text concise without changing saved data.
   - Removes duplicated date/time/hour/system metadata from display only.
   - Keeps custom notes and collapses rate-calculation details behind a disclosure.
*/
(function(){
  'use strict';
  const VERSION='V380_COMPACT_OT_DETAIL_TEXT';
  if(window.__CNMI_V380_COMPACT_OT_DETAIL_TEXT__)return;
  window.__CNMI_V380_COMPACT_OT_DETAIL_TEXT__=true;

  function text(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function norm(v){return text(v).toLowerCase().replace(/[\s|:：•()\[\]{}.,/\\-]+/g,'');}
  function esc(v){
    try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    catch(_){return String(v==null?'':v);}
  }
  function tokens(value){return String(value||'').split('|').map(text).filter(Boolean);}
  function extractDuty(value){
    const raw=String(value||'');
    let m=raw.match(/เวรที่คิดอัตโนมัติ\s*[:：]\s*([^|]+)/i);
    if(m&&text(m[1]))return text(m[1]);
    m=raw.match(/ประเภทเวร\s*[:：]\s*([^|]+)/i);
    if(m&&text(m[1]))return text(m[1]);
    m=raw.match(/(?:อยู่เวร|เวร)\s*(ชบด\s*[123]|ช3A|ช3B|ช4|ช9)\b/i);
    return m?text(m[1]).replace(/\s+/g,''):'';
  }
  function isGeneratedToken(token){
    const t=text(token);
    return !t
      || /^จำนวนเวลา\s*OT\s*[:：]/i.test(t)
      || /^ชั่วโมงที่ต้องการเบิก\s*[:：]/i.test(t)
      || /^ชั่วโมงเบิก\s*[:：]/i.test(t)
      || /^จำนวนชั่วโมง\s*[:：]/i.test(t)
      || /^HR_HOURS\s*=/i.test(t)
      || /^สร้างจากส่วนที่\s*[12]/i.test(t)
      || /^เวรที่คิดอัตโนมัติ\s*[:：]/i.test(t)
      || /^ประเภทเวร\s*[:：]/i.test(t)
      || /^เวลาเวร\s+/i.test(t)
      || /^Staff\s*ยืนยันจากวันที่ที่เลือก/i.test(t)
      || /^ระบบคิด\s*OT\s*.*อัตโนมัติ/i.test(t)
      || /^รอบเบิก\s+/i.test(t)
      || /^วันที่(?:เริ่ม|สิ้นสุด|อยู่เวร)\s*/i.test(t)
      || /^เวลา(?:เริ่ม|สิ้นสุด)\s*[0-2]?\d:[0-5]\d/i.test(t)
      || /^\[OT_RATE_TYPE=(?:MT|CLERK)\]$/i.test(t)
      || /^\[DONOR_HELPER_SLOT=/i.test(t)
      || /^V\d+[_-]/i.test(t);
  }
  function cleanToken(token){
    let t=text(token)
      .replace(/^หมายเหตุ\s*[:：]\s*/i,'')
      .replace(/\[OT_RATE_TYPE=(?:MT|CLERK)\]/ig,'')
      .replace(/\[DONOR_HELPER_SLOT=[^\]]+\]/ig,'')
      .replace(/HR_HOURS\s*=\s*\d+(?:\.\d+)?/ig,'')
      .replace(/\s{2,}/g,' ')
      .replace(/^[•|,;:\-\s]+|[•|,;:\-\s]+$/g,'')
      .trim();
    return isGeneratedToken(t)?'':t;
  }
  function compactReason(reason,note){
    const rawReason=text(reason)||'-';
    const rawNote=String(note||'');
    const all=`${rawReason} | ${rawNote}`;
    const duty=extractDuty(all);
    const attendance=/ยืนยันอยู่เวร|อยู่เวรตามตาราง|สร้างจากส่วนที่\s*1|เวรที่คิดอัตโนมัติ|ประเภทเวร\s*[:：]/i.test(all);
    let main=rawReason
      .replace(/\s*\(ส่วนที่\s*1\)\s*/ig,' ')
      .replace(/^ยืนยันอยู่เวรโดย\s*Admin$/i,'อยู่เวรตามตาราง')
      .replace(/^ยืนยันอยู่เวรตามตาราง$/i,'อยู่เวรตามตาราง')
      .trim()||'-';
    if(attendance)main=duty?`อยู่เวร ${duty}`:'อยู่เวรตามตาราง';

    const seen=new Set();
    const details=[];
    tokens(rawNote).forEach(token=>{
      const cleaned=cleanToken(token);
      if(!cleaned)return;
      const key=norm(cleaned);
      if(!key||seen.has(key))return;
      const mainKey=norm(main),reasonKey=norm(rawReason);
      if(key===mainKey||key===reasonKey)return;
      if((mainKey.length>5&&key.includes(mainKey))||(key.length>5&&mainKey.includes(key)))return;
      seen.add(key);details.push(cleaned);
    });
    let detail=details.join(' • ');
    if(/^(อื่นๆ|อื่น ๆ|OT เพิ่ม|ขอ OT เพิ่ม)$/i.test(main)&&detail){main=detail;detail='';}
    return {main,detail};
  }

  // All existing OT tables call this helper dynamically, so replacing it shortens
  // both the desktop table and mobile cards without touching the database row.
  const helpers=window.v176OtReasonHelpers||{};
  helpers.compactOtReasonText176=function(row){return compactReason(row?.reason,row?.note);};
  window.v176OtReasonHelpers=helpers;

  function directChild(parent,selector){
    if(!parent)return null;
    return Array.from(parent.children||[]).find(el=>el.matches&&el.matches(selector))||null;
  }
  function compactReasonCell(cell){
    if(!cell||cell.dataset.v380Compact==='1')return;
    const bold=directChild(cell,'b,strong');
    const muted=directChild(cell,'.muted');
    if(!bold)return;
    const result=compactReason(bold.textContent,muted?.textContent||'');
    bold.textContent=result.main;
    bold.classList.add('v380-reason-main');
    if(muted){
      if(result.detail){muted.textContent=result.detail;muted.classList.add('v380-reason-detail');}
      else muted.remove();
    }else if(result.detail){
      const span=document.createElement('span');
      span.className='muted v380-reason-detail';
      span.textContent=result.detail;
      bold.insertAdjacentElement('afterend',span);
    }
    cell.dataset.v380Compact='1';
  }
  function compactTable(table){
    if(!table)return;
    const headers=Array.from(table.querySelectorAll('thead th'));
    const index=headers.findIndex(th=>/เหตุผล/.test(text(th.textContent)));
    if(index<0)return;
    Array.from(table.querySelectorAll('tbody tr')).forEach(row=>compactReasonCell(row.children?.[index]));
    table.classList.add('v380-compact-ot-table');
  }
  function compactMobileCard(card){
    if(!card||card.dataset.v380Compact==='1')return;
    const blocks=Array.from(card.children||[]);
    const reasonBlock=blocks.find(el=>{
      if(el.classList?.contains('v348-card-head')||el.classList?.contains('v348-hour-pair'))return false;
      return !!directChild(el,'b,strong');
    });
    if(!reasonBlock)return;
    const bold=directChild(reasonBlock,'b,strong');
    const muted=directChild(reasonBlock,'.muted');
    let note='';let timePart='';
    if(muted){
      const raw=text(muted.textContent);
      const split=raw.indexOf(' • ');
      if(split>=0){timePart=raw.slice(0,split);note=raw.slice(split+3);}else timePart=raw;
    }
    const result=compactReason(bold.textContent,note);
    bold.textContent=result.main;
    bold.classList.add('v380-reason-main');
    if(muted){
      muted.textContent=[timePart,result.detail].filter(Boolean).join(' • ');
      if(!muted.textContent)muted.remove();
      else muted.classList.add('v380-reason-detail');
    }
    card.dataset.v380Compact='1';
  }
  function collapseRateBox(box){
    if(!box||box.closest('details.v380-rate-details'))return;
    const details=document.createElement('details');
    details.className='v380-rate-details';
    const summary=document.createElement('summary');
    summary.textContent='ดูที่มาและสูตรเรท';
    box.parentNode.insertBefore(details,box);
    details.append(summary,box);
  }
  function compactRoot(root){
    const scope=root?.querySelectorAll?root:document;
    scope.querySelectorAll('table').forEach(compactTable);
    scope.querySelectorAll('.v348-ot-card').forEach(compactMobileCard);
    scope.querySelectorAll('.v348-trade-box,.v350-helper-box').forEach(collapseRateBox);
  }

  // V348 has an internal renderer. Wrap the public renderer for V369 and also
  // observe replacements made by the internal renderer.
  if(window.cnmiV348?.detailRows){
    const original=window.cnmiV348.detailRows;
    window.cnmiV348.detailRows=function(rows){
      const tpl=document.createElement('template');
      tpl.innerHTML=String(original.call(this,rows)||'');
      compactRoot(tpl.content);
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    };
  }

  let queued=false;
  function queueCompact(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;compactRoot(document);});
  }
  document.addEventListener('DOMContentLoaded',queueCompact,{once:true});
  const target=document.getElementById('pageContent')||document.body;
  if(target&&typeof MutationObserver==='function'){
    new MutationObserver(queueCompact).observe(target,{childList:true,subtree:true});
  }
  [0,120,500,1200].forEach(ms=>setTimeout(queueCompact,ms));

  const style=document.createElement('style');
  style.textContent=`
    .v380-compact-ot-table th,.v380-compact-ot-table td{vertical-align:top}
    .v380-compact-ot-table .v380-reason-main{line-height:1.35}
    .v380-reason-detail{display:block;margin-top:3px;line-height:1.4;color:#6a7c90}
    .v348-desktop-detail table{min-width:760px!important}
    .v348-desktop-detail th:nth-child(3){min-width:230px!important;width:34%!important}
    .v347-detail-table table{min-width:760px}
    .v380-rate-details{margin-top:7px;border:1px solid #d8e5f0;border-radius:10px;background:#f8fbfe;overflow:hidden}
    .v380-rate-details>summary{cursor:pointer;padding:8px 10px;font-weight:800;color:#2572a8;list-style:none}
    .v380-rate-details>summary::-webkit-details-marker{display:none}
    .v380-rate-details>summary:after{content:'⌄';float:right}
    .v380-rate-details[open]>summary:after{content:'⌃'}
    .v380-rate-details>.v348-trade-box,.v380-rate-details>.v350-helper-box{margin:0;border:0;border-top:1px solid #d8e5f0;border-radius:0;min-width:0}
    @media(max-width:900px){
      .v380-reason-detail{font-size:13px}
      .v348-ot-card{gap:8px}
      .v348-ot-card .v380-reason-main{font-size:16px}
    }
  `;
  document.head.appendChild(style);
  window.cnmiV380={version:VERSION,compactReason,compactRoot};
  console.info(`[${VERSION}] loaded`);
})();
