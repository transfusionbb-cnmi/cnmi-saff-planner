/* CNMI Staff Planner V359 — authoritative previous-month carry + compact Staff mobile OT */
(function(){
  'use strict';
  if(window.__CNMI_V359_CARRY_SOURCE_MOBILE_STAFF__)return;
  window.__CNMI_V359_CARRY_SOURCE_MOBILE_STAFF__=true;
  const style=document.createElement('style');
  style.textContent=`
    @media(max-width:560px){
      .v347-my-claim-card{padding:14px 12px!important;border-radius:16px!important}
      .v347-my-claim-card .section-title{margin-bottom:6px!important}
      .v347-my-claim-card .section-title h3{font-size:18px!important;line-height:1.35!important;margin:0!important}
      .v347-my-claim-card .section-title .hint{display:none!important}
      .v347-my-claim-card .v347-claim-equation{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 12px!important}
      .v347-my-claim-card .v347-claim-equation>div{min-width:0!important;padding:10px!important;border-radius:10px!important;gap:2px!important}
      .v347-my-claim-card .v347-claim-equation span{font-size:11px!important;line-height:1.3!important}
      .v347-my-claim-card .v347-claim-equation b{font-size:18px!important;line-height:1.25!important}
      .v347-my-claim-card .v347-claim-equation .money{grid-column:1/-1!important}
      .v347-my-claim-card .v347-claim-equation .money small{font-size:11px!important;line-height:1.35!important}
      .v347-my-claim-card .v348-mobile-detail{gap:8px!important}
      .v347-my-claim-card .v348-mobile-detail>div{padding:10px!important;border-radius:10px!important}
      .v348-staff-tabs{grid-template-columns:1fr 1fr!important;gap:6px!important}
      .v348-staff-tabs button{padding:9px 7px!important;font-size:12px!important;line-height:1.25!important}
    }`;
  document.head.appendChild(style);
})();
