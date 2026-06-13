/* V196: Stale recovery guard for normal app pages.
   Fixes Position Management save redirecting to mode-recovery when old auth flags or
   a token-less ?mode=recovery marker are still present in the browser. */
(function(){
  'use strict';

  var FORCE_KEYS = [
    'cnmi.forcePasswordSetup.v134',
    'cnmi.forcePasswordSetup.v135',
    'cnmi.forcePasswordSetup.v136',
    'cnmi.forcePasswordSetup.v138'
  ];

  function baseUrl(){
    try {
      var parts = location.pathname.split('/').filter(Boolean);
      if (location.hostname.endsWith('github.io') && parts[0]) return location.origin + '/' + parts[0] + '/';
      if (location.pathname.indexOf('/cnmi-saff-planner/') >= 0) return location.origin + '/cnmi-saff-planner/';
    } catch (_) {}
    return location.origin + '/';
  }

  function rawUrl(){ return String(location.search || '') + String(location.hash || ''); }
  function hasRealAuthLink(){ return /access_token=|refresh_token=|token_hash=|(^|[?#&])code=|type=(recovery|password_recovery|invite|signup)/i.test(rawUrl()); }
  function hasStaleRecoveryMarker(){ return /mode=(recovery|set-password|update-password)|type=recovery/i.test(rawUrl()) && !hasRealAuthLink(); }

  function clearFlags(reason){
    if (hasRealAuthLink()) return false;
    try { window.CNMI_REQUIRE_PASSWORD_UPDATE = false; } catch (_) {}
    try { window.CNMI_AUTH_LINK_INTENT = false; } catch (_) {}
    try { window.RECOVERY_INTENT = false; } catch (_) {}
    try { window.AUTH_LINK_PROCESSING = false; } catch (_) {}
    FORCE_KEYS.forEach(function(k){
      try { sessionStorage.removeItem(k); } catch (_) {}
      try { localStorage.removeItem(k); } catch (_) {}
    });
    try { document.documentElement.classList.remove('v136-auth-link'); } catch (_) {}
    if (hasStaleRecoveryMarker()) {
      try { history.replaceState({}, document.title, baseUrl()); } catch (_) {}
    }
    try { console.info('V196 stale recovery flags cleared', reason || ''); } catch (_) {}
    return true;
  }

  function positionFormSubmit(e){
    var form = e && e.target;
    if (!form || form.id !== 'positionMasterForm') return;
    clearFlags('position-master-submit');
    try { e.preventDefault(); } catch (_) {}
    // Do not stop propagation here: the app.js V182 submit handler still performs the actual save.
  }

  clearFlags('initial-load');
  window.addEventListener('pageshow', function(){ clearFlags('pageshow'); }, true);
  window.addEventListener('focus', function(){ clearFlags('focus'); }, true);
  window.addEventListener('click', function(e){
    if (e && e.target && e.target.closest && e.target.closest('[data-add-position-master], [data-edit-position-master], #positionMasterForm button[type="submit"]')) {
      clearFlags('position-management-click');
    }
  }, true);
  window.addEventListener('submit', positionFormSubmit, true);
})();
