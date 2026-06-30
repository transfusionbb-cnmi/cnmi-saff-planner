/* CNMI Staff Planner V305
   Mobile PWA usability fixes
   1) Position descriptions become compact expandable cards on phones/tablets.
   2) Admin Position Management uses normal page scrolling in installed PWA.
   3) Releases a stale body scroll lock only when no modal is actually open.
*/
(function(){
  'use strict';
  const VERSION='V305_MOBILE_APP_SCROLL_AND_POSITION_DESCRIPTION';
  if(window.__CNMI_V305_MOBILE_APP_SCROLL_AND_POSITION_DESCRIPTION__) return;
  window.__CNMI_V305_MOBILE_APP_SCROLL_AND_POSITION_DESCRIPTION__=true;

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function textOf(cell){
    return String(cell?.textContent || '').replace(/\s+/g,' ').trim() || '-';
  }

  function isVisibleModal(node){
    if(!node || node.classList.contains('hidden')) return false;
    const style=window.getComputedStyle?.(node);
    return style ? style.display!=='none' && style.visibility!=='hidden' : true;
  }

  function releaseStaleScrollLock(){
    const appModal=document.getElementById('modal');
    const installModal=document.getElementById('pwaInstallModalV303');
    const openModal=isVisibleModal(appModal) || isVisibleModal(installModal)
      || Array.from(document.querySelectorAll('.modal:not(.hidden),.pwa-install-modal:not(.hidden)')).some(isVisibleModal);
    if(!openModal) document.body.classList.remove('modal-open');
  }

  function buildMobileDescriptionCards(section){
    if(!section || !section.closest('.v275-page')) return;
    const table=section.querySelector('.v297-position-description-table');
    const rows=Array.from(table?.querySelectorAll('tbody tr') || []);
    const signature=rows.map(row=>Array.from(row.cells || []).map(textOf).join('|')).join('||');
    let list=section.querySelector('.v305-position-description-list');
    if(list?.dataset.signature===signature) return;

    if(!list){
      list=document.createElement('div');
      list.className='v305-position-description-list';
      const wrap=section.querySelector('.v297-position-description-wrap');
      if(wrap) wrap.insertAdjacentElement('beforebegin',list);
      else section.appendChild(list);
    }
    list.dataset.signature=signature;

    if(!rows.length){
      list.innerHTML='<div class="empty-state">เดือนนี้ยังไม่มีตำแหน่งในตาราง</div>';
      return;
    }

    list.innerHTML=rows.map((row,index)=>{
      const cells=Array.from(row.cells || []);
      const code=textOf(cells[0]);
      const dates=textOf(cells[1]);
      const zone=textOf(cells[2]);
      const breakTime=textOf(cells[3]);
      const rule=textOf(cells[4]);
      const job=textOf(cells[5]);
      return `<details class="v305-position-description-item" ${index===0?'open':''}>
        <summary>
          <span class="v305-position-code">${esc(code)}</span>
          <span class="v305-position-dates">วันที่ ${esc(dates)}</span>
        </summary>
        <div class="v305-position-description-body">
          <div><small>โซน</small><b>${esc(zone)}</b></div>
          <div><small>เวลาพัก</small><b>${esc(breakTime)}</b></div>
          <div class="v305-wide"><small>ผู้ปฏิบัติหลัก / เงื่อนไข</small><p>${esc(rule)}</p></div>
          <div class="v305-wide"><small>รายละเอียดหน้าที่</small><p>${esc(job)}</p></div>
        </div>
      </details>`;
    }).join('');
  }

  function enhance(root=document){
    root.querySelectorAll?.('.v275-page [data-v297-position-descriptions]').forEach(buildMobileDescriptionCards);
    releaseStaleScrollLock();
  }

  let queued=false;
  function queueEnhance(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      enhance(document);
    });
  }

  const style=document.createElement('style');
  style.id='v305-mobile-app-scroll-position-description-style';
  style.textContent=`
    .v305-position-description-list{display:none}
    @media(max-width:820px){
      html,body{min-height:100%!important;height:auto!important;overflow-x:hidden!important}
      body:not(.modal-open){overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-y:auto!important}
      #appView.app-view:not(.hidden){height:auto!important;min-height:100dvh!important;overflow:visible!important}
      #appView .main-panel,#appView .page-content{height:auto!important;min-height:0!important;max-height:none!important;overflow-y:visible!important}
      #appView .page-content{padding-bottom:max(34px,env(safe-area-inset-bottom))!important}

      .v282-position-management-root,
      .v282-position-management-root .v282-position-management-stable,
      .v282-position-management-root .v224-position-template-page,
      .v282-position-management-root .v224-slot-crud-card{
        height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;
      }
      .v282-position-management-root .v224-slot-table{
        height:auto!important;min-height:0!important;max-height:none!important;
        overflow:visible!important;overscroll-behavior:auto!important;
        -webkit-overflow-scrolling:auto!important;touch-action:pan-y!important;
      }
      .v282-position-management-root .v224-slot-table table,
      .v282-position-management-root .v224-slot-table tbody,
      .v282-position-management-root .v224-slot-table tr{touch-action:pan-y!important}
      .v282-position-management-root button,
      .v282-position-management-root select,
      .v282-position-management-root input,
      .v282-position-management-root textarea{touch-action:manipulation!important}

      .v275-page .v297-position-description-card{padding:14px!important;overflow:visible!important}
      .v275-page .v297-position-description-card .section-title{margin-bottom:10px}
      .v275-page .v297-position-description-wrap{display:none!important}
      .v275-page .v305-position-description-list{display:grid!important;gap:10px}
      .v305-position-description-item{border:1px solid #d8e6f4;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,.04)}
      .v305-position-description-item summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;cursor:pointer;background:#f7fbff;touch-action:manipulation}
      .v305-position-description-item summary::-webkit-details-marker{display:none}
      .v305-position-description-item summary::after{content:'⌄';flex:0 0 auto;color:#2563eb;font-size:20px;font-weight:900;transition:transform .18s ease}
      .v305-position-description-item[open] summary::after{transform:rotate(180deg)}
      .v305-position-code{font-weight:900;color:#17324d;overflow-wrap:anywhere}
      .v305-position-dates{font-size:12px;font-weight:800;color:#2563eb;text-align:right}
      .v305-position-description-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;padding:13px 14px;border-top:1px solid #e6eef7}
      .v305-position-description-body>div{min-width:0;padding:10px;border-radius:12px;background:#f8fafc}
      .v305-position-description-body .v305-wide{grid-column:1/-1}
      .v305-position-description-body small{display:block;margin-bottom:3px;color:#64748b;font-weight:800}
      .v305-position-description-body b,.v305-position-description-body p{margin:0;color:#263b52;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
    }
    @media(max-width:420px){
      .v305-position-description-body{grid-template-columns:1fr}
      .v305-position-description-body .v305-wide{grid-column:auto}
      .v305-position-description-item summary{align-items:flex-start;flex-wrap:wrap}
      .v305-position-dates{width:100%;text-align:left}
    }
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queueEnhance);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',queueEnhance,{once:true});
  window.addEventListener('pageshow',queueEnhance);
  window.addEventListener('resize',queueEnhance);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.modal-close,.pwa-install-close')) setTimeout(queueEnhance,0);
  },true);
  queueEnhance();

  window.cnmiV305={enhance,buildMobileDescriptionCards,releaseStaleScrollLock};
  console.info(`${VERSION} loaded`);
})();
