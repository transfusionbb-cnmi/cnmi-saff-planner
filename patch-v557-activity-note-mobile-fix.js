/* CNMI Staff Planner V557 — Activity note mobile visibility fix
   Fixes the "รายละเอียดเพิ่มเติม" activity field disappearing on mobile.
   Root cause: V521 may add .v521-hide-label-on-mobile to a wrapping <label>;
   that class hid the whole label, including its textarea.
   No database/schema/business-rule changes.
*/
(function(){
  'use strict';
  if(window.__CNMI_V557_ACTIVITY_NOTE_MOBILE_FIX__) return;
  window.__CNMI_V557_ACTIVITY_NOTE_MOBILE_FIX__=true;
  const VERSION='v558';

  function S(){
    try{return window.state || (typeof state!=='undefined'?state:null) || {};}
    catch(_){return window.state||{};}
  }
  function esc(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function editingNote(){
    try{
      const s=S();
      const id=s?.editingActivityId;
      const row=(s?.activities||[]).find(x=>String(x?.id||'')===String(id||''));
      let note=String(row?.note||'');
      if(typeof window.cnmiCleanActivityNote==='function') note=window.cnmiCleanActivityNote(note);
      return note;
    }catch(_){return '';}
  }

  function repairActivityNote(root=document){
    const scope=root?.querySelectorAll?root:document;
    const forms=[];
    if(scope.matches?.('#activityForm')) forms.push(scope);
    scope.querySelectorAll?.('#activityForm').forEach(f=>forms.push(f));
    forms.forEach(form=>{
      let textarea=form.querySelector('textarea[name="note"]');
      const section=form.querySelector('.v518-detail-section');
      const grid=section?.querySelector('.v518-section-grid');

      // Defensive recovery: if another UI patch dropped the note field, restore it.
      if(!textarea && grid){
        const label=document.createElement('label');
        label.className='wide v557-activity-note-field';
        label.innerHTML=`หมายเหตุ / รายละเอียดเพิ่มเติม<textarea name="note" rows="4" placeholder="ใส่รายละเอียดเพิ่มเติม หรือลิงก์ที่เกี่ยวข้อง">${esc(editingNote())}</textarea>`;
        grid.appendChild(label);
        textarea=label.querySelector('textarea');
      }
      if(!textarea) return;

      const label=textarea.closest('label');
      if(label) label.classList.add('v557-activity-note-field');
      if(!textarea.placeholder || /^(หมายเหตุเพิ่มเติม|รายละเอียดเพิ่มเติม)$/i.test(textarea.placeholder.trim())){
        textarea.placeholder='ใส่รายละเอียดเพิ่มเติม หรือลิงก์ที่เกี่ยวข้อง';
      }
      textarea.setAttribute('aria-label','หมายเหตุ / รายละเอียดเพิ่มเติม');
    });
  }

  function setVersion(root=document){
    root.querySelectorAll?.('.v520-version-chip').forEach(chip=>{
      if(chip.textContent!=='v558') chip.textContent='v558';
      chip.title='CNMI Staff Planner v558';
    });
  }

  const style=document.createElement('style');
  style.id='cnmi-v557-activity-note-mobile-fix-style';
  style.textContent=`
    /* V521 hides repeated labels. A wrapping label must stay visible because it owns the control. */
    body.v521-ui-clarity #activityForm .v518-detail-section label.v521-hide-label-on-mobile,
    body.v521-ui-clarity #activityForm .v518-detail-section .v557-activity-note-field{
      display:grid!important;
      gap:6px!important;
    }
    #activityForm .v518-detail-section .v557-activity-note-field{
      grid-column:1/-1!important;
      min-width:0!important;
      font-size:13px!important;
      color:#29475c!important;
    }
    #activityForm .v518-detail-section textarea[name="note"]{
      display:block!important;
      width:100%!important;
      min-height:96px!important;
      box-sizing:border-box!important;
      resize:vertical!important;
      opacity:1!important;
      visibility:visible!important;
    }
    @media(max-width:760px){
      #activityForm .v518-detail-section textarea[name="note"]{
        min-height:104px!important;
        font-size:16px!important; /* prevents iOS input zoom */
        line-height:1.45!important;
      }
    }
  `;
  document.head.appendChild(style);

  function apply(root=document){repairActivityNote(root);setVersion(root);}
  let queued=false;
  function queue(root=document){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply(root);});
  }

  const start=()=>{
    apply(document);
    const target=document.getElementById('pageContent')||document.body;
    if(target){
      const observer=new MutationObserver(mutations=>{
        for(const m of mutations){
          if(m.addedNodes?.length){queue(target);break;}
        }
      });
      observer.observe(target,{childList:true,subtree:true});
    }
    window.addEventListener('hashchange',()=>queue(document));
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();

  console.info(`[${VERSION}] activity note mobile visibility fix loaded`);
})();
