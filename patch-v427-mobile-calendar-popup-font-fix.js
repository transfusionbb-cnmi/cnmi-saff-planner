/* CNMI Staff Planner V427
 * Mobile calendar popup typography fix.
 * - Prevents iPhone/iOS Safari/PWA text autosizing inside the day-detail popup.
 * - Keeps desktop typography unchanged.
 * - Display-only patch: no Supabase query/write/schema changes.
 */
(function () {
  'use strict';
  if (window.__CNMI_V427_MOBILE_CALENDAR_POPUP_FONT_FIX__) return;
  window.__CNMI_V427_MOBILE_CALENDAR_POPUP_FONT_FIX__ = true;

  const style = document.createElement('style');
  style.id = 'cnmi-v427-mobile-calendar-popup-font-fix';
  style.textContent = `
    @media (max-width: 820px) {
      /* iOS Safari/PWA can enlarge text in a scrollable modal independently.
         Lock autosizing only inside the modal so the rest of the app is untouched. */
      #modal,
      #modal .modal-card,
      #modal #modalBody,
      #modal #modalBody .v311-calendar-modal,
      #modal #modalBody .calendar-modal-list,
      #modal #modalBody .calendar-modal-row {
        -webkit-text-size-adjust: 100% !important;
        text-size-adjust: 100% !important;
      }

      /* Stable phone scale for Calendar day-detail popup. */
      #modal #modalBody {
        font-size: 15px !important;
        line-height: 1.45 !important;
      }
      #modal #modalBody > h2,
      #modal #modalBody .v311-calendar-modal > h2 {
        margin: 0 44px 14px 0 !important;
        font-size: 24px !important;
        line-height: 1.25 !important;
        letter-spacing: 0 !important;
      }
      #modal #modalBody .calendar-modal-list {
        gap: 10px !important;
      }
      #modal #modalBody .calendar-modal-row {
        padding: 12px 13px !important;
        border-left-width: 7px !important;
        border-radius: 14px !important;
        font-size: 15px !important;
        line-height: 1.45 !important;
        overflow-wrap: anywhere !important;
        word-break: normal !important;
      }
      #modal #modalBody .calendar-modal-row .event-title,
      #modal #modalBody .calendar-modal-row .event-title b {
        font-size: 17px !important;
        line-height: 1.35 !important;
      }
      #modal #modalBody .calendar-modal-row .event-title {
        margin-bottom: 5px !important;
      }
      #modal #modalBody .calendar-modal-row .muted,
      #modal #modalBody .calendar-modal-row .v332-activity-meta {
        font-size: 14px !important;
        line-height: 1.45 !important;
      }
      #modal #modalBody .calendar-modal-row .badge {
        font-size: 11px !important;
        line-height: 1.2 !important;
        padding: 3px 8px !important;
      }
    }

    @media (max-width: 390px) {
      #modal #modalBody > h2,
      #modal #modalBody .v311-calendar-modal > h2 {
        font-size: 22px !important;
      }
      #modal #modalBody .calendar-modal-row,
      #modal #modalBody .calendar-modal-row .muted,
      #modal #modalBody .calendar-modal-row .v332-activity-meta {
        font-size: 14px !important;
      }
      #modal #modalBody .calendar-modal-row .event-title,
      #modal #modalBody .calendar-modal-row .event-title b {
        font-size: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
  console.info('[V427] mobile calendar popup typography fix loaded');
})();
