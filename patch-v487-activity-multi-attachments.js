/* CNMI Staff Planner V487
 * Activity attachments UX
 * - View activity attachments from activity search cards and Dashboard activity cards.
 * - Supports legacy single attachment_path and V487 multi-file JSON values.
 * - No schema change: multi-file metadata is stored in the existing attachment_path text field.
 */
(function(){
  'use strict';
  if(window.__CNMI_V487_ACTIVITY_MULTI_ATTACHMENTS__) return;
  window.__CNMI_V487_ACTIVITY_MULTI_ATTACHMENTS__=true;

  const S=()=>window.state||state;
  const DB=()=>window.sb||sb;
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function fallbackParse(value){
    if(!value) return [];
    if(Array.isArray(value)) return value.map(normalize).filter(Boolean);
    if(typeof value==='object'){const one=normalize(value);return one?[one]:[];}
    const raw=String(value||'').trim();
    if(!raw) return [];
    if(/^[\[{]/.test(raw)){
      try{const parsed=JSON.parse(raw),list=Array.isArray(parsed)?parsed:[parsed];return list.map(normalize).filter(Boolean);}catch(_){}
    }
    const one=normalize(raw);return one?[one]:[];
  }
  function normalize(item,index=0){
    if(!item) return null;
    if(typeof item==='string') return {path:item,name:nameFromPath(item,index),mime:''};
    const path=String(item.path||item.attachment_path||item.url||'').trim();
    if(!path) return null;
    return {path,name:String(item.name||item.file_name||nameFromPath(path,index)).trim(),mime:String(item.mime||item.type||'').trim()};
  }
  function nameFromPath(path,index=0){
    const raw=String(path||'').split('?')[0].split('/').pop()||'';
    const clean=raw.replace(/^\d+_/,'').replace(/_+/g,' ').trim();
    return clean&&/[A-Za-z0-9ก-๙]/.test(clean)?clean:`ไฟล์แนบ ${index+1}`;
  }
  function parse(value){
    try{return window.cnmiActivityAttachmentsV487?.parse?window.cnmiActivityAttachmentsV487.parse(value):fallbackParse(value);}catch(_){return fallbackParse(value);}
  }
  function activityById(id){return (S().activities||[]).find(row=>String(row.id)===String(id));}

  async function openAttachment(activityId,index){
    const row=activityById(activityId);
    if(!row) throw new Error('ไม่พบกิจกรรมนี้ กรุณารีเฟรชแล้วลองอีกครั้ง');
    const files=parse(row.attachment_path),file=files[Number(index)];
    if(!file?.path) throw new Error('ไม่พบไฟล์แนบนี้');
    const path=String(file.path).trim();
    if(/^https?:\/\//i.test(path)){window.open(path,'_blank','noopener,noreferrer');return;}

    // Open a blank tab synchronously so iPhone/iPad/Safari does not block the popup after await.
    const preview=window.open('about:blank','_blank');
    try{
      if(preview){preview.document.title='กำลังเปิดไฟล์แนบ…';preview.document.body.innerHTML='<div style="font:16px system-ui;padding:24px">กำลังเปิดไฟล์แนบ…</div>';}
      const clean=path.replace(/^staff-files\//,'').replace(/^\/+/, '');
      const res=await DB().storage.from('staff-files').download(clean);
      if(res.error) throw res.error;
      const url=URL.createObjectURL(res.data);
      if(preview){preview.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),120000);}
      else{
        const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click();setTimeout(()=>URL.revokeObjectURL(url),120000);
      }
    }catch(err){
      try{preview?.close();}catch(_){}
      throw err;
    }
  }

  function buttonsFor(row,compact=false){
    const files=parse(row?.attachment_path);
    if(!files.length) return '';
    return `<div class="v487-dashboard-files ${compact?'is-compact':''}">${files.map((file,index)=>`<button type="button" class="tiny-btn v487-view-file-btn" data-v487-open-activity-file="${esc(row.id)}:${index}" title="${esc(file.name||`ไฟล์แนบ ${index+1}`)}">📎 ${compact?`ไฟล์ ${index+1}`:`${esc(file.name||`ดูไฟล์ ${index+1}`)}`}</button>`).join('')}</div>`;
  }

  function decorateDashboard(){
    document.querySelectorAll('.v397-activity-item').forEach(item=>{
      if(item.querySelector('.v487-dashboard-files')) return;
      const title=String(item.querySelector('b')?.textContent||'').trim();
      if(!title) return;
      const rows=(S().activities||[]).filter(row=>String(row.title||'').trim()===title && parse(row.attachment_path).length);
      if(!rows.length) return;
      // Usually one visible activity corresponds to one row. If titles repeat, show unique files from the first matching row.
      const html=buttonsFor(rows[0],true);
      if(html) item.insertAdjacentHTML('beforeend',html);
    });
  }

  function decorateForm(){
    const input=document.querySelector('#activityForm input[name="file"]');
    if(!input) return;
    input.multiple=true;
    const label=input.closest('label');
    if(label&&!label.querySelector('.v487-upload-hint')){
      const hint=document.createElement('small');hint.className='hint v487-upload-hint';hint.textContent='เลือกพร้อมกันได้หลายไฟล์ และกลับมาแก้ไขเพื่อเพิ่มไฟล์ภายหลังได้';label.appendChild(hint);
    }
  }

  function decorate(){decorateForm();decorateDashboard();}

  document.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-v487-open-activity-file]');
    if(!btn) return;
    e.preventDefault();e.stopPropagation();
    const raw=String(btn.getAttribute('data-v487-open-activity-file')||'');
    const cut=raw.lastIndexOf(':');
    if(cut<0) return;
    const activityId=raw.slice(0,cut),index=Number(raw.slice(cut+1));
    btn.disabled=true;
    const oldText=btn.textContent;
    btn.textContent='กำลังเปิด…';
    try{await openAttachment(activityId,index);}catch(err){if(typeof showToast==='function')showToast('เปิดไฟล์แนบไม่สำเร็จ: '+(err?.message||String(err)));}
    finally{btn.disabled=false;btn.textContent=oldText;}
  },true);

  let queued=false;
  const queue=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});};
  const observer=new MutationObserver(queue);
  function start(){decorate();observer.observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  const style=document.createElement('style');
  style.textContent=`
    .v487-attachment-field{display:block}.v487-existing-files{margin-top:8px;padding:9px;border:1px solid #dbe8f4;border-radius:12px;background:#f8fbfe}.v487-existing-title{font-weight:800;margin-bottom:6px;color:#445d73}.v487-existing-file{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 0;border-top:1px dashed #e1eaf1}.v487-existing-file:first-of-type{border-top:0}.v487-file-name{min-width:0;flex:1;overflow-wrap:anywhere;color:#4b6074;font-size:.84rem}.v487-keep-file{display:flex!important;align-items:center;gap:5px!important;font-size:.78rem!important;color:#5c6f82!important}.v487-keep-file input{width:auto!important;min-height:0!important}.v487-upload-hint{display:block;margin-top:5px;line-height:1.35}.v487-file-buttons,.v487-dashboard-files{display:flex;gap:6px;flex-wrap:wrap}.v487-view-file-btn{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v487-dashboard-files{margin-top:7px}.v487-dashboard-files.is-compact .v487-view-file-btn{font-size:12px;padding:5px 8px}.v487-activity-files b{font-weight:400}
    @media(max-width:760px){.v487-existing-file{align-items:flex-start}.v487-file-name{flex-basis:100%;order:3}.v487-view-file-btn{max-width:100%}.v487-dashboard-files.is-compact .v487-view-file-btn{min-height:34px}}
  `;
  document.head.appendChild(style);
  console.info('[V487_ACTIVITY_MULTI_ATTACHMENTS] loaded');
})();
