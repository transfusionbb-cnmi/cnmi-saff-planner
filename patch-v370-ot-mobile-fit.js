/* CNMI Staff Planner V370
   - Fixes mobile overflow on OT / HR Export page for both staff and admin.
   - Makes the V369 top month selector and menu buttons fully fit small screens.
   - Ensures tables/cards scroll inside their own container instead of widening the whole page.
*/
(function(){
  'use strict';
  const VERSION = 'V370_OT_MOBILE_FIT';
  if (window.__CNMI_V370_OT_MOBILE_FIT__) return;
  window.__CNMI_V370_OT_MOBILE_FIT__ = true;

  const style = document.createElement('style');
  style.textContent = `
    .v369-ot-page, .v369-ot-page *, .v369-ot-page *::before, .v369-ot-page *::after{box-sizing:border-box}
    .v369-ot-page, .v369-ot-menu-card, .v369-ot-content, .v369-ot-content>.card, .v369-menu-grid, .v369-menu-btn, .v369-month-label, .v369-month-label input, .v369-month-label select{min-width:0;max-width:100%}
    .v369-ot-page{width:100%;overflow-x:hidden}
    .v369-ot-menu-card{overflow:hidden}
    .v369-ot-menu-head{align-items:stretch}
    .v369-ot-menu-head>div{min-width:0;flex:1 1 260px}
    .v369-month-label{flex:1 1 240px;width:100%}
    .v369-month-label input,.v369-month-label select{display:block;width:100%}
    .v369-menu-grid{width:100%}
    .v369-menu-btn{
      display:flex;
      align-items:center;
      justify-content:flex-start;
      width:100%;
      min-width:0;
      max-width:100%;
      overflow:hidden;
      white-space:normal !important;
      overflow-wrap:anywhere;
      word-break:break-word;
      word-wrap:break-word;
      text-wrap:pretty;
      text-align:left;
      hyphens:auto;
    }
    .v369-ot-page .table-wrap{max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
    .v369-ot-page .table-wrap>table{min-width:100%}
    .v369-ot-page .mobile-cards,.v369-ot-page .mobile-card,.v369-ot-page .actions,.v369-ot-page .notice,.v369-ot-page .empty{min-width:0;max-width:100%}
    .v369-ot-page .section-title,.v369-ot-page .mobile-day-head{min-width:0;flex-wrap:wrap}
    .v369-ot-page .section-title h2,.v369-ot-page .section-title h3,.v369-ot-page .section-title h4,.v369-ot-page .mobile-day-head b{min-width:0;overflow-wrap:anywhere;word-break:break-word}

    @media(max-width:760px){
      .v369-ot-page{gap:12px}
      .v369-ot-menu-card{padding:16px}
      .v369-ot-menu-head{gap:12px}
      .v369-month-label{gap:6px}
      .v369-month-label{font-size:14px}
      .v369-month-label input,.v369-month-label select{font-size:16px}
      .v369-menu-grid,.v369-menu-grid.is-staff,.v369-menu-grid.is-admin{grid-template-columns:1fr !important;gap:10px}
      .v369-menu-btn{
        min-height:54px;
        padding:14px 16px;
        font-size:clamp(18px,4.5vw,22px);
        line-height:1.22;
        justify-content:flex-start;
        text-align:left;
        border-radius:16px;
      }
      .v369-ot-content{display:block}
      .v369-ot-content>*+*{margin-top:12px}
    }

    @media(max-width:480px){
      .v369-ot-menu-card{padding:14px}
      .v369-menu-btn{font-size:17px;line-height:1.2;padding:13px 14px}
      .v369-ot-page .card{padding-left:14px;padding-right:14px}
    }
  `;
  document.head.appendChild(style);

  function healOtOverflow(root){
    const page = root || document.querySelector('.v369-ot-page');
    if (!page) return;
    page.querySelectorAll('.v369-menu-btn').forEach(btn => {
      btn.style.width = '100%';
      btn.style.maxWidth = '100%';
      btn.style.minWidth = '0';
    });
    page.querySelectorAll('.table-wrap').forEach(wrap => {
      wrap.style.maxWidth = '100%';
      wrap.style.overflowX = 'auto';
    });
  }

  const run = () => healOtOverflow();
  document.addEventListener('DOMContentLoaded', run, { once:true });
  document.addEventListener('click', function(){ setTimeout(run, 0); }, true);
  document.addEventListener('change', function(){ setTimeout(run, 0); }, true);
  const observer = new MutationObserver(() => {
    if (document.querySelector('.v369-ot-page')) healOtOverflow();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  window.cnmiV370 = { version: VERSION, healOtOverflow };
  console.info('[' + VERSION + '] loaded');
})();
