/* CNMI Staff Planner V475
 * Clean Position Management helper text.
 *
 * Keep only the useful room-group summary and remove the long technical/rule
 * explanation bars from the main screen. The actual "ผู้ปฏิบัติหลัก" values
 * remain visible in each position row.
 *
 * No Supabase/schema changes.
 */
(function(){
  'use strict';
  const VERSION='V475_POSITION_MANAGEMENT_CLEAN_HINTS';
  if(window.__CNMI_V475_POSITION_MANAGEMENT_CLEAN_HINTS__) return;
  window.__CNMI_V475_POSITION_MANAGEMENT_CLEAN_HINTS__=true;

  const style=document.createElement('style');
  style.id='cnmi-v475-position-management-clean-hints-style';
  style.textContent=`
    /* V474's profession explanation is useful as implementation guidance,
       but it is too verbose for the daily Admin screen. */
    .v474-rule-note{display:none!important;}

    /* Keep one concise room-group line only; hide legacy/technical wording. */
    .v470-room-note .muted{display:none!important;}
    .v470-room-note{
      margin:4px 0!important;
      padding:5px 10px!important;
      min-height:0!important;
      font-size:11px!important;
      line-height:1.25!important;
      border-radius:9px!important;
      background:#f7fbff!important;
      border-color:#d9eaf7!important;
      color:#34536b!important;
    }
    .v470-room-note b{font-weight:800!important;}

    @media(max-width:820px){
      .v470-room-note{font-size:10px!important;padding:5px 8px!important;}
    }
  `;
  document.head.appendChild(style);

  console.info(`[${VERSION}] loaded`);
})();
