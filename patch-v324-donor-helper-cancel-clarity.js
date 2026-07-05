/* V324 Donor Helper cancel clarity
   - Rename admin cancel / no-show buttons for clearer workflow
   - Show responsible contact text on donor-helper pages
   - Show previous cancelled helper history when markup contains cancellation fields
   Frontend-only patch; does not add Supabase schema or SQL.
*/
(function(){
  'use strict';
  const V='v324';
  const CONTACT_FALLBACK='กรุณาแจ้งหัวหน้าหน่วยเวชศาสตร์บริการโลหิต';
  const ROOT_SELECTORS=['#app','main','body'];
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const norm=(s)=>String(s||'').replace(/\s+/g,' ').trim();
  function isDonorHelperContext(){
    const t=norm(document.body?.innerText||'');
    return /ห้องบริจาคโลหิต CNMI|ลงชื่อคนมาช่วย|คนเจาะ|Donor Room|donor helper/i.test(t);
  }
  function staffDisplayName(row){
    if(!row) return '';
    const first=row.first_name||row.firstname||row.name_th||row.full_name||row.name||row.display_name||'';
    const last=row.last_name||row.lastname||row.surname||'';
    const nick=row.nickname||row.nick_name||row.nick||row.short_name||'';
    const real=norm(`${first} ${last}`) || norm(first);
    if(real && nick && !real.includes(`(${nick})`)) return `${real} (${nick})`;
    return real || nick || '';
  }
  function monthKeyFromPage(){
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }
  function findChargeName(){
    const S=window.state||window.appState||{};
    const key=S.monthKey||S.selectedMonth||S.positionMonthKey||monthKeyFromPage();
    const rows=[...(S.incharges||[]),...(S.monthIncharges||[]),...(S.donorIncharges||[]),...(S.staff||[])];
    const direct=rows.find(r=>{
      const role=norm(`${r.role||''} ${r.position||''} ${r.note||''} ${r.tag||''}`);
      const mk=norm(r.month_key||r.month||r.ym||'');
      return (/อินชาร์จ|incharge|charge/i.test(role) && (!mk || mk===key));
    });
    return staffDisplayName(direct);
  }
  function ensureContact(){
    if(!isDonorHelperContext()) return;
    const root=document.querySelector(ROOT_SELECTORS.join(','));
    if(!root || document.querySelector('[data-v324-donor-contact]')) return;
    const name=findChargeName();
    const box=document.createElement('div');
    box.setAttribute('data-v324-donor-contact','1');
    box.className='v324-donor-contact';
    box.innerHTML=name?`<b>อินชาร์จเดือนนี้:</b> ${esc(name)}`:esc(CONTACT_FALLBACK);
    const target=[...document.querySelectorAll('.card,section,div')].find(el=>/ห้องบริจาคโลหิต CNMI|ลงชื่อคนมาช่วย/.test(norm(el.innerText||''))) || root.firstElementChild || root;
    target.insertAdjacentElement('afterend',box);
  }
  function renameButtons(){
    if(!isDonorHelperContext()) return;
    document.querySelectorAll('button,a,[role="button"]').forEach(el=>{
      const t=norm(el.textContent||'');
      if(t==='Admin ยกเลิก' || t==='ยกเลิก' || t==='ยกเลิกโดย Admin'){
        el.textContent='ยกเลิกตามคำขอ';
        el.setAttribute('title','ใช้เมื่อเจ้าหน้าที่แจ้งยกเลิกล่วงหน้า เช่น ป่วย ติดเวร หรือหัวหน้า/อินชาร์จรับทราบแล้ว');
        el.dataset.v324CancelRequest='1';
      }
      if(t==='ไม่มาตามนัด' || t==='No Show'){
        el.textContent='ไม่มาตามนัด (No Show)';
        el.setAttribute('title','ใช้เฉพาะกรณีไม่มาโดยไม่แจ้งล่วงหน้า หรือแจ้งหลังเวลานัด');
        el.dataset.v324NoShow='1';
      }
    });
  }
  function reasonFromRowText(text){
    const m=String(text||'').match(/(?:เหตุผล|reason)\s*[:：]\s*([^\n]+)/i);
    return m?m[1].trim():'';
  }
  function cancelledNameFromRowText(text){
    const m=String(text||'').match(/(?:เคยลงชื่อ|ผู้ลงชื่อเดิม|ยกเลิกจาก|previous)\s*[:：]\s*([^\n]+)/i);
    return m?m[1].trim():'';
  }
  function enhanceCancelHistory(){
    if(!isDonorHelperContext()) return;
    const cards=[...document.querySelectorAll('.card,.slot-card,.helper-card,[class*="slot"],[class*="helper"]')];
    cards.forEach(card=>{
      if(card.dataset.v324HistoryDone) return;
      const text=card.innerText||'';
      if(!/ยกเลิก|cancel/i.test(text)) return;
      const oldName=cancelledNameFromRowText(text);
      const reason=reasonFromRowText(text);
      const by=/อินชาร์จ/.test(text)?'อินชาร์จ':'หัวหน้าหน่วยเวชศาสตร์บริการโลหิต/อินชาร์จ';
      if(!oldName && !reason) return;
      const box=document.createElement('div');
      box.className='v324-cancel-history';
      box.innerHTML=`${oldName?`<div><b>เคยลงชื่อ:</b> ${esc(oldName)}</div>`:''}<div><b>ยกเลิกโดย:</b> ${esc(by)}</div>${reason?`<div><b>เหตุผล:</b> ${esc(reason)}</div>`:''}`;
      card.appendChild(box);
      card.dataset.v324HistoryDone='1';
    });
  }
  function installPromptHint(){
    document.addEventListener('click',function(e){
      const btn=e.target?.closest?.('[data-v324-cancel-request="1"]');
      if(!btn) return;
      setTimeout(()=>{
        const txt=norm(document.body?.innerText||'');
        if(/เหตุผล|reason/i.test(txt)) return;
        // non-blocking hint only; the original app still handles the actual cancellation.
        console.info('[V324] ยกเลิกตามคำขอ: ควรบันทึกเหตุผล เช่น ป่วย / ติดเวร / อินชาร์จรับทราบแล้ว');
      },0);
    },true);
  }
  function run(){ renameButtons(); ensureContact(); enhanceCancelHistory(); }
  function boot(){
    run(); installPromptHint();
    const mo=new MutationObserver(()=>{ clearTimeout(window.__v324Timer); window.__v324Timer=setTimeout(run,80); });
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
    window.v324DonorHelperCancelClarity={run,version:V};
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
