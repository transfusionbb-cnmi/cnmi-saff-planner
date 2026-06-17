(function(){
  const VERSION = 'V249_MOBILE_POSITION_COMPARE_COMPACT';
  function injectStyle(){
    if (document.getElementById('v249-mobile-position-compare-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'v249-mobile-position-compare-compact-style';
    style.textContent = `
@media (max-width: 760px){
  /* Daily/month position page: make mobile view compare like desktop columns */
  .v225-positions-page,
  .v226-positions-page{
    padding: 14px !important;
  }
  .v225-positions-page .v225-position-note,
  .v226-positions-page .v225-position-note{
    font-size: 14px !important;
    line-height: 1.45 !important;
  }
  .v225-compare-cards{
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }
  .v225-compare-cards > div{
    min-width: 0 !important;
    padding: 10px 6px !important;
    border-radius: 14px !important;
    text-align: center !important;
  }
  .v225-compare-cards > div b{
    font-size: 22px !important;
    line-height: 1 !important;
  }
  .v225-compare-cards > div span{
    display: block !important;
    font-size: 11px !important;
    line-height: 1.2 !important;
    margin-top: 6px !important;
  }
  .v225-daily-slot-toolbar{
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 6px !important;
    margin-top: 10px !important;
  }
  .v225-daily-slot-toolbar label,
  .v225-daily-slot-toolbar select{
    width: 100% !important;
  }
  .v225-mobile-position-list,
  .mobile-position-list{
    gap: 10px !important;
  }
  .position-mobile-card.v225-position-card{
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    grid-template-areas:
      "head head"
      "meta meta"
      "plan edit"
      "action action" !important;
    gap: 8px 10px !important;
    padding: 14px !important;
    border-radius: 18px !important;
  }
  .position-mobile-card.v225-position-card > .section-title{
    grid-area: head !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    margin: 0 !important;
  }
  .position-mobile-card.v225-position-card > .section-title h3{
    font-size: 20px !important;
    line-height: 1.15 !important;
    margin: 0 !important;
    overflow-wrap: anywhere !important;
  }
  .position-mobile-card.v225-position-card > .section-title .badge{
    flex: 0 0 auto !important;
    font-size: 12px !important;
    padding: 5px 9px !important;
  }
  .position-mobile-card.v225-position-card > .muted{
    grid-area: meta !important;
    font-size: 14px !important;
    line-height: 1.3 !important;
    margin: 0 !important;
  }
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions){
    grid-area: plan !important;
    min-width: 0 !important;
    padding: 9px 8px !important;
    border: 1px solid #dbeafe !important;
    border-radius: 14px !important;
    background: #f8fbff !important;
    font-size: 13px !important;
    line-height: 1.25 !important;
  }
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions) b{
    display: block !important;
    margin-bottom: 5px !important;
    font-size: 12px !important;
    color: #64748b !important;
  }
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions) .staff-pill,
  .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions) .badge{
    max-width: 100% !important;
    display: inline-flex !important;
    justify-content: center !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    font-size: 14px !important;
    padding: 5px 10px !important;
  }
  .position-mobile-card.v225-position-card > label{
    grid-area: edit !important;
    min-width: 0 !important;
    display: block !important;
    padding: 9px 8px !important;
    border: 1px solid #dbeafe !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    font-size: 12px !important;
    line-height: 1.25 !important;
    color: #64748b !important;
    font-weight: 700 !important;
  }
  .position-mobile-card.v225-position-card > label select{
    margin-top: 5px !important;
    width: 100% !important;
    min-height: 34px !important;
    height: 34px !important;
    padding: 4px 24px 4px 8px !important;
    border-radius: 999px !important;
    font-size: 15px !important;
    text-align: center !important;
    text-align-last: center !important;
  }
  .position-mobile-card.v225-position-card > .actions{
    grid-area: action !important;
    margin: 0 !important;
    display: flex !important;
    justify-content: flex-end !important;
  }
  .position-mobile-card.v225-position-card > .actions .tiny-btn{
    width: auto !important;
    min-height: 32px !important;
    padding: 6px 12px !important;
    font-size: 13px !important;
  }
}
@media (max-width: 390px){
  .v225-compare-cards{ grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .position-mobile-card.v225-position-card{
    grid-template-columns: 1fr !important;
    grid-template-areas:
      "head"
      "meta"
      "plan"
      "edit"
      "action" !important;
  }
}
`;
    document.head.appendChild(style);
  }
  injectStyle();
  window.addEventListener('DOMContentLoaded', injectStyle);
  const oldRenderPage = window.renderPage || (typeof renderPage === 'function' ? renderPage : null);
  if (oldRenderPage && !window.__CNMI_V249_RENDER_WRAP__) {
    window.__CNMI_V249_RENDER_WRAP__ = true;
    window.renderPage = renderPage = function renderPageV249(){
      const out = oldRenderPage.apply(this, arguments);
      injectStyle();
      return out;
    };
  }
  console.info(`${VERSION} loaded`);
})();
