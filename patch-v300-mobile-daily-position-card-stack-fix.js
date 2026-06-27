/* V300 Mobile daily-position card layout fix
   - Prevents the duty preview from sharing/overlapping the planned-staff cell.
   - Stacks planned staff, daily adjustment, duty preview, and action on phones.
   - Keeps the existing desktop/tablet rendering and all data logic unchanged.
*/
(function(){
  'use strict';

  const STYLE_ID = 'v300-mobile-daily-position-card-stack-fix-style';

  function injectStyle(){
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* V296 inserts this block as another direct child of the card.
         Give it its own grid row instead of letting the broad V249 selector
         place it on top of the planned-staff block. */
      .position-mobile-card.v225-position-card > .v296-position-duty-preview{
        grid-area:duty !important;
        width:100% !important;
        min-width:0 !important;
        box-sizing:border-box !important;
        margin:0 !important;
      }

      @media (max-width:760px){
        .position-mobile-card.v225-position-card{
          grid-template-columns:minmax(0,1fr) !important;
          grid-template-areas:
            "head"
            "meta"
            "plan"
            "edit"
            "duty"
            "action" !important;
          gap:10px !important;
        }

        /* Planned staff block only. Exclude the newly inserted duty preview. */
        .position-mobile-card.v225-position-card > div:not(.section-title):not(.muted):not(.actions):not(.v296-position-duty-preview){
          grid-area:plan !important;
          width:100% !important;
          min-width:0 !important;
          box-sizing:border-box !important;
        }

        .position-mobile-card.v225-position-card > label{
          grid-area:edit !important;
          width:100% !important;
          min-width:0 !important;
          box-sizing:border-box !important;
        }

        .position-mobile-card.v225-position-card > .v296-position-duty-preview{
          grid-area:duty !important;
          width:100% !important;
          min-width:0 !important;
          box-sizing:border-box !important;
          padding:12px 14px !important;
        }

        .position-mobile-card.v225-position-card > .actions{
          grid-area:action !important;
          width:100% !important;
          justify-content:flex-end !important;
        }

        .position-mobile-card.v225-position-card > .actions .tiny-btn{
          max-width:100% !important;
          white-space:normal !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  injectStyle();
  document.addEventListener('DOMContentLoaded', injectStyle, { once:true });

  console.info('[V300_MOBILE_DAILY_POSITION_CARD_STACK_FIX] loaded');
})();
