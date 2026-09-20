/* CNMI Staff Planner V521 — Mobile UI clarity polish
   Improves mobile-first readability, trims repeated helper text, and uses placeholders
   for simple text-entry fields where appropriate. No business logic / DB changes. */
(function(){
  'use strict';
  if(window.__CNMI_V521_UI_CLARITY__) return;
  window.__CNMI_V521_UI_CLARITY__=true;
  const VERSION='V521_MOBILE_UI_CLARITY_POLISH';

  function stateSafe(){
    try{return window.state || (typeof state!=='undefined'?state:null);}catch(_){return null;}
  }
  function pageName(){return String(stateSafe()?.page||'').trim();}
  function routeName(){
    const hash=String(location.hash||'');
    const m=hash.match(/^#\/([^?]+)/);
    return m?m[1].trim():'';
  }
  function norm(str){return String(str||'').replace(/[\s*：:]+/g,'').trim();}
  function cleanLabelText(str){
    return String(str||'')
      .replace(/\s*\*+\s*$/,'')
      .replace(/\(ถ้ามี\)/g,'')
      .replace(/\(ถ้ามี\)\s*$/,'')
      .replace(/\s+/g,' ')
      .trim();
  }
  function setDatasets(){
    document.body.classList.add('v521-ui-clarity');
    document.body.dataset.cnmiPage=pageName();
    document.body.dataset.cnmiRoute=routeName();
  }

  function decorateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const foot=document.querySelector('.sidebar-foot');
    if(!foot) return;
    const chip=foot.querySelector('.v520-version-chip, .v521-version-chip');
    if(chip){
      chip.classList.add('v521-version-chip');
      chip.textContent='v521';
      chip.title='Mobile UI clarity polish';
      return;
    }
    const el=document.createElement('span');
    el.className='v520-version-chip v521-version-chip';
    el.textContent='v521';
    el.title='Mobile UI clarity polish';
    foot.prepend(el);
  }

  function findRelatedLabel(input){
    if(!input) return null;
    const wrapped=input.closest('label');
    if(wrapped && !wrapped.classList.contains('v521-ignore-label')){
      const clone=wrapped.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button').forEach(n=>n.remove());
      const txt=cleanLabelText(clone.textContent||'');
      if(txt && txt.length<=40) return {node:wrapped,text:txt};
    }
    let probe=input.previousElementSibling;
    while(probe){
      const txt=cleanLabelText(probe.textContent||'');
      if(txt && txt.length<=40 && /^(LABEL|DIV|SPAN|P|H4|H5|STRONG)$/i.test(probe.tagName)) return {node:probe,text:txt};
      if(txt) break;
      probe=probe.previousElementSibling;
    }
    const field=input.closest('.field,.form-field,.grid-item,.v518-section-grid>div,.card>div,.toolbar>div');
    if(field){
      const candidate=field.querySelector('label,.field-label,strong,h4,h5');
      if(candidate && candidate!==input){
        const txt=cleanLabelText(candidate.textContent||'');
        if(txt && txt.length<=40) return {node:candidate,text:txt};
      }
    }
    return null;
  }

  function applyPlaceholders(root=document){
    root.querySelectorAll('input[type="text"],input[type="search"],input[type="tel"],input[type="url"],input[type="email"],textarea').forEach(input=>{
      const rel=findRelatedLabel(input);
      if(rel && (!input.placeholder || !input.placeholder.trim())){
        input.placeholder=rel.text;
      }
      if(rel && input.placeholder && norm(input.placeholder)===norm(rel.text)){
        rel.node.classList.add('v521-hide-label-on-mobile');
        input.classList.add('v521-placeholder-driven');
      }
    });
  }

  function compactHelpers(root=document){
    const selectors=['.hint','.muted','small','p'];
    root.querySelectorAll(selectors.join(',')).forEach(el=>{
      if(el.classList.contains('v521-skip-helper')) return;
      const text=String(el.textContent||'').replace(/\s+/g,' ').trim();
      if(!text) return;
      if(text.length>=48 && !el.closest('table,thead,tbody,.modal,.nav-btn,.topbar')){
        el.classList.add('v521-helper-compact');
      }
      if(/เลือกพร้อมกันได้หลายไฟล์/i.test(text)){
        el.textContent='แนบได้หลายไฟล์ และเพิ่มภายหลังได้';
        el.classList.add('v521-helper-short');
      }else if(/ไม่บังคับแนบไฟล์/i.test(text)){
        el.textContent='ไม่บังคับแนบไฟล์';
        el.classList.add('v521-helper-short');
      }else if(/ลิงก์ที่บันทึกจะแสดงเป็นข้อความกดได้/i.test(text)){
        el.textContent='ลิงก์ที่บันทึกสามารถกดเปิดได้';
        el.classList.add('v521-helper-short');
      }
    });
  }

  function decorateButtons(root=document){
    root.querySelectorAll('button,.primary-btn,.ghost-btn,.soft-btn').forEach(btn=>{
      const text=String(btn.textContent||'').replace(/\s+/g,' ').trim();
      if(!text || btn.dataset.v521Decorated) return;
      btn.dataset.v521Decorated='1';
      if(/^ค้นหา$/.test(text)) btn.dataset.v521Icon='search';
      else if(/บันทึก/.test(text)) btn.dataset.v521Icon='save';
      else if(/ล้าง/.test(text)) btn.dataset.v521Icon='clear';
      else if(/รีเฟรช/.test(text)) btn.dataset.v521Icon='refresh';
      else if(/ติดตั้งแอป/.test(text)) btn.dataset.v521Icon='download';
    });
  }

  function markDenseCards(root=document){
    root.querySelectorAll('.card').forEach(card=>{
      const text=String(card.textContent||'').replace(/\s+/g,' ').trim();
      if(text.length>500) card.classList.add('v521-dense-card');
    });
  }

  function apply(root=document){
    setDatasets();
    decorateVersion();
    applyPlaceholders(root);
    compactHelpers(root);
    decorateButtons(root);
    markDenseCards(root);
  }

  let pending=false;
  function queue(root=document){
    if(pending) return;
    pending=true;
    requestAnimationFrame(()=>{
      pending=false;
      apply(root);
    });
  }

  const previousRenderPage=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage && !previousRenderPage.__v521Wrapped){
    const wrapped=function renderPageV521(){
      const result=previousRenderPage.apply(this,arguments);
      queue(document);
      return result;
    };
    wrapped.__v521Wrapped=true;
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  const start=()=>{
    apply(document);
    const content=document.getElementById('pageContent');
    if(content){
      const observer=new MutationObserver(mutations=>{
        let changed=false;
        for(const m of mutations){
          if((m.addedNodes && m.addedNodes.length) || m.type==='attributes'){changed=true;break;}
        }
        if(changed) queue(content);
      });
      observer.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    }
    window.addEventListener('hashchange',()=>queue(document));
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  window.cnmiV521={version:VERSION,apply};
  console.info(`[${VERSION}] loaded`);
})();
