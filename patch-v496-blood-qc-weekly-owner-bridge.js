/* CNMI Staff Planner V496 - Blood QC weekly owner read-only bridge marker */
(() => {
  'use strict';
  window.CNMI_BLOOD_QC_BRIDGE = Object.freeze({
    version: '496',
    rpc: 'bloodqc_weekly_position_assignments',
    positions: ['BB-Report', 'BB-Manual 3'],
    mode: 'read-only'
  });
})();
