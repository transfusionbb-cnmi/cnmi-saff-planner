/* CNMI Staff Planner V406
 * Mobile-only dashboard polish.
 * - Keeps "กิจกรรมวันนี้" typography at the same readable scale as leave cards.
 * - Fits the two-column "เวรวันนี้" table inside the phone viewport without horizontal scrolling.
 * - Display-only patch: no Supabase query/write/schema changes.
 */
(function () {
  'use strict';
  if (window.__CNMI_V406_DASHBOARD_MOBILE_COMPACT__) return;
  window.__CNMI_V406_DASHBOARD_MOBILE_COMPACT__ = true;

  const style = document.createElement('style');
  style.id = 'cnmi-v406-dashboard-mobile-compact';
  style.textContent = `
    @media (max-width: 820px) {
      /* Prevent iPhone/Safari from enlarging long activity text automatically. */
      .v401-dashboard-activity-card,
      .v401-dashboard-activity-card .v397-activity-item {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }

      /* Match the activity card scale to the leave card scale. */
      .v401-dashboard-activity-card .v397-activity-item {
        font-size: 15px !important;
        line-height: 1.45 !important;
        padding: 11px 13px !important;
      }
      .v401-dashboard-activity-card .v397-activity-item > div:first-child,
      .v401-dashboard-activity-card .v397-activity-item > div:first-child b {
        font-size: 16px !important;
        line-height: 1.35 !important;
      }
      .v401-dashboard-activity-card .v397-detail-line,
      .v401-dashboard-activity-card .v397-detail-note,
      .v401-dashboard-activity-card .v404-activity-link {
        font-size: 13px !important;
        line-height: 1.45 !important;
      }
      .v401-dashboard-activity-card .badge {
        font-size: 11px !important;
        padding: 3px 8px !important;
      }

      /* The first dashboard detail card is "เวรวันนี้". It has only two short columns. */
      .v401-dashboard-details > .card:first-child .table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
        overflow-y: visible !important;
      }
      .v401-dashboard-details > .card:first-child .table-wrap > table {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        table-layout: fixed !important;
      }
      .v401-dashboard-details > .card:first-child th,
      .v401-dashboard-details > .card:first-child td {
        padding: 10px 9px !important;
        font-size: 15px !important;
        line-height: 1.3 !important;
        vertical-align: middle !important;
        overflow-wrap: anywhere !important;
        word-break: normal !important;
      }
      .v401-dashboard-details > .card:first-child th:first-child,
      .v401-dashboard-details > .card:first-child td:first-child {
        width: 40% !important;
      }
      .v401-dashboard-details > .card:first-child th:nth-child(2),
      .v401-dashboard-details > .card:first-child td:nth-child(2) {
        width: 60% !important;
        text-align: center !important;
      }
      .v401-dashboard-details > .card:first-child td:nth-child(2) .staff-color-pill {
        max-width: 100% !important;
        white-space: normal !important;
        justify-content: center !important;
        font-size: 14px !important;
        line-height: 1.2 !important;
      }
    }

    @media (max-width: 380px) {
      .v401-dashboard-details > .card:first-child th,
      .v401-dashboard-details > .card:first-child td {
        padding: 9px 7px !important;
        font-size: 14px !important;
      }
      .v401-dashboard-details > .card:first-child td:nth-child(2) .staff-color-pill {
        font-size: 13px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
