/* =========================
   V246 Mobile Position Menu Fix
   - Mobile-only responsive polish for Position Management.
   - Fixes iPhone/phone drawer scrolling and prevents horizontal clipping in Slot/Permission tabs.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V246_MOBILE_POSITION_MENU_FIX';
  if (window.__CNMI_V246_MOBILE_POSITION_MENU_FIX__) return;
  window.__CNMI_V246_MOBILE_POSITION_MENU_FIX__ = true;

  const style = document.createElement('style');
  style.id = 'cnmi-v246-mobile-position-menu-fix-style';
  style.textContent = `
    /* Phone drawer: keep header/footer visible and make the menu itself scrollable on iOS/Safari */
    @media (max-width: 820px) {
      html, body { max-width: 100%; overflow-x: hidden; }
      #appView.app-view { grid-template-columns: minmax(0, 1fr) !important; width: 100% !important; }
      #appView .main-panel, #pageContent.page-content { min-width: 0 !important; max-width: 100vw !important; }
      #sidebar.sidebar {
        position: fixed !important;
        inset: 0 auto 0 0 !important;
        width: min(86vw, 320px) !important;
        max-width: 86vw !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        padding: 14px 12px !important;
        z-index: 80 !important;
        transform: translateX(-105%) !important;
      }
      #sidebar.sidebar.open { transform: translateX(0) !important; }
      #sidebar .sidebar-head { flex: 0 0 auto !important; margin-bottom: 10px !important; }
      #sidebar #mainNav.main-nav {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        overscroll-behavior: contain !important;
        touch-action: pan-y !important;
        padding: 0 4px 12px 0 !important;
      }
      #sidebar .sidebar-foot {
        flex: 0 0 auto !important;
        position: relative !important;
        bottom: auto !important;
        margin-top: 10px !important;
        padding-top: 10px !important;
        padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
      }
      #sidebar .nav-btn {
        min-height: 42px !important;
        padding: 10px 10px !important;
        border-radius: 14px !important;
        font-size: 14px !important;
      }
      #sidebar .nav-btn span:last-child {
        white-space: normal !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 2 !important;
        -webkit-box-orient: vertical !important;
        overflow: hidden !important;
      }
      #sidebar .nav-section-title {
        position: sticky !important;
        top: 0 !important;
        z-index: 2 !important;
        background: linear-gradient(180deg, #d9efff, rgba(217,239,255,.94)) !important;
        padding: 7px 6px 5px !important;
        margin: 4px 0 2px !important;
        border-radius: 12px !important;
      }
      .topbar { max-width: 100vw !important; }
      .topbar > div:nth-child(2) { min-width: 0 !important; }
      .topbar #pageTitle { font-size: 22px !important; line-height: 1.15 !important; }
      .topbar #pageSubtitle { font-size: 14px !important; line-height: 1.25 !important; overflow-wrap: anywhere !important; }
    }

    /* Position Management: phone-only, remove horizontal clipping and turn the wide table into cards */
    @media (max-width: 720px) {
      .v244-position-management-page,
      .v244-position-management-page * { min-width: 0; }
      .v244-position-management-page {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }
      .v244-position-management-page .card {
        border-radius: 18px !important;
        padding: 14px !important;
        max-width: 100% !important;
      }
      .v244-position-management-page h3 { font-size: 18px !important; line-height: 1.25 !important; }
      .v244-position-management-page .hint,
      .v244-position-management-page p,
      .v244-position-management-page small,
      .v244-position-management-page em {
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }

      .v244-position-tabs-card { margin-bottom: 12px !important; }
      .v244-position-tabs-card .section-title { display: block !important; margin-bottom: 10px !important; }
      .v244-position-tabs-card .section-title .hint { font-size: 13px !important; line-height: 1.35 !important; }
      .v244-position-tabs {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
        align-items: stretch !important;
      }
      .v244-position-tab {
        width: 100% !important;
        min-width: 0 !important;
        padding: 10px 8px !important;
        border-radius: 16px !important;
        text-align: center !important;
      }
      .v244-position-tab b { font-size: 14px !important; line-height: 1.22 !important; }
      .v244-position-tab small { font-size: 11px !important; line-height: 1.18 !important; }

      .v224-slot-crud-card .section-title,
      .v245-permission-filter-card .section-title,
      .eligibility-position-panel .section-title {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
        align-items: start !important;
      }
      .v224-slot-crud-card .section-title .actions,
      .v224-slot-crud-card .section-title .v232-default-slot-actions,
      .eligibility-position-panel .section-title .actions {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 8px !important;
      }
      .v224-slot-crud-card .section-title button,
      .v232-default-slot-actions button,
      .eligibility-position-panel [data-save-position-eligibility] {
        width: 100% !important;
        white-space: normal !important;
      }

      .v224-template-toolbar {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
        align-items: end !important;
        padding: 10px !important;
        margin: 10px 0 !important;
      }
      .v224-template-toolbar label,
      .v224-template-toolbar button {
        width: 100% !important;
        min-width: 0 !important;
      }
      .v224-template-toolbar select { width: 100% !important; }

      .v224-slot-table {
        overflow: visible !important;
        border: 0 !important;
        background: transparent !important;
      }
      .v224-slot-table table,
      .v224-slot-table thead,
      .v224-slot-table tbody,
      .v224-slot-table tr,
      .v224-slot-table td {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
      }
      .v224-slot-table thead { display: none !important; }
      .v224-slot-table tr {
        background: #fff !important;
        border: 1px solid #dbeafe !important;
        border-radius: 16px !important;
        padding: 10px !important;
        margin-bottom: 10px !important;
        box-shadow: 0 6px 18px rgba(15,23,42,.04) !important;
      }
      .v224-slot-table td {
        border: 0 !important;
        padding: 5px 4px !important;
        line-height: 1.35 !important;
      }
      .v224-slot-table td:nth-child(1) { display: none !important; }
      .v224-slot-table td:nth-child(2) b { font-size: 16px !important; }
      .v224-slot-table td:nth-child(3)::before { content: 'โซน: '; font-weight: 800; color: #64748b; }
      .v224-slot-table td:nth-child(4)::before { content: 'ผู้ปฏิบัติหลัก: '; font-weight: 800; color: #64748b; }
      .v224-slot-table td:nth-child(5)::before { content: 'เวลาพัก: '; font-weight: 800; color: #64748b; }
      .v224-slot-table td:nth-child(6)::before { content: 'หน้าที่: '; font-weight: 800; color: #64748b; }
      .v224-desc-cell {
        min-width: 0 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }
      .v224-actions-cell {
        min-width: 0 !important;
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 6px !important;
        padding-top: 8px !important;
      }
      .v224-actions-cell .tiny-btn { width: 100% !important; }

      .v245-permission-filter-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }
      .v245-permission-filter-grid label,
      .v245-permission-filter-grid select { width: 100% !important; }
      .v245-selected-slot-note {
        min-height: 0 !important;
        padding: 10px 12px !important;
      }
      .v245-permission-layout,
      .eligibility-page.v245-permission-layout {
        display: block !important;
      }
      .v245-permission-layout > .card { margin-bottom: 12px !important; }
      .eligibility-staff-panel { position: static !important; }
      .selected-staff-card { padding: 14px !important; border-radius: 18px !important; }
      .big-staff-name { font-size: 24px !important; }
      .position-card-grid,
      .v245-position-card-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }
      .position-zone-card {
        border-radius: 18px !important;
        padding: 12px !important;
      }
      .position-check {
        grid-template-columns: 22px minmax(0, 1fr) !important;
        gap: 9px !important;
        padding: 10px !important;
        border-radius: 14px !important;
      }
      .position-check em {
        display: block !important;
        line-height: 1.35 !important;
      }
    }

    @media (max-width: 380px) {
      .v244-position-tabs,
      .v224-template-toolbar {
        grid-template-columns: 1fr !important;
      }
      .v244-position-tab small { display: none !important; }
    }
  `;
  document.head.appendChild(style);

  console.info(`${VERSION} loaded`);
})();
