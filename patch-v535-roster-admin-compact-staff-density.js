/* CNMI Staff Planner V535 — Admin roster compact density like Staff view
 * UI-only patch. No roster/business logic changes.
 * - Admin monthly roster uses the same compact day-cell density as Staff view.
 * - Keep sticky staff name, drag/drop and tap assignment behavior.
 * - Remove-button is visually quiet on desktop and appears on hover/focus.
 */
(function(){
  'use strict';
  if(window.__CNMI_V535_ROSTER_COMPACT__) return;
  window.__CNMI_V535_ROSTER_COMPACT__=true;
  const VERSION='V535_ROSTER_ADMIN_COMPACT_STAFF_DENSITY';

  function injectStyle(){
    if(document.getElementById('v535-roster-compact-style')) return;
    const s=document.createElement('style');
    s.id='v535-roster-compact-style';
    s.textContent=`
      /* V535: make Admin roster matrix visually match Staff monthly roster density */
      .v275-roster-wrap{
        border-radius:10px!important;
        max-height:72vh!important;
        scrollbar-gutter:stable;
      }
      .v275-roster-table{
        width:max-content!important;
        min-width:max-content!important;
        table-layout:fixed!important;
        font-size:9px!important;
      }
      .v275-roster-table th:not(.v275-roster-name),
      .v275-roster-table td{
        width:52px!important;
        min-width:52px!important;
        max-width:52px!important;
        padding:2px!important;
        box-sizing:border-box!important;
      }
      .v275-roster-table thead th{
        height:34px!important;
        min-height:34px!important;
        padding:2px 1px!important;
        line-height:1.05!important;
      }
      .v275-roster-name{
        width:68px!important;
        min-width:68px!important;
        max-width:68px!important;
        padding:2px 4px!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }
      .v275-roster-name b{
        font-size:9px!important;
        line-height:1.05!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      .v275-roster-date b{font-size:9.5px!important;line-height:1!important}
      .v275-roster-date small{font-size:7px!important;line-height:1!important;margin-top:1px!important}
      .v275-roster-date em{
        font-size:6.5px!important;
        line-height:1!important;
        max-width:48px!important;
        margin:1px auto 0!important;
      }
      .v275-roster-day{
        height:32px!important;
        min-height:32px!important;
        padding:1px!important;
      }
      .v275-roster-drop{
        min-height:28px!important;
        height:100%!important;
        padding:0!important;
        gap:1px!important;
        border-radius:4px!important;
      }
      .v275-duty-list{
        gap:1px!important;
        flex-wrap:wrap!important;
        align-items:center!important;
        justify-content:center!important;
        line-height:1!important;
      }
      .v275-duty-pill{
        max-width:48px!important;
        min-height:14px!important;
        padding:2px 4px!important;
        gap:1px!important;
        font-size:8px!important;
        line-height:1!important;
        border-radius:999px!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
        box-sizing:border-box!important;
      }
      .v275-duty-pill>b{
        min-width:0!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      .v275-roster-drop .mini-status,
      .v275-roster-drop .v432-compact-leave,
      .v275-roster-drop .v438-compact-no-duty{
        max-width:48px!important;
        min-height:0!important;
        padding:1px 3px!important;
        margin:0 auto!important;
        font-size:7.5px!important;
        line-height:1!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      /* Desktop: keep delete affordance available but do not let × dominate every cell */
      @media (hover:hover) and (pointer:fine){
        .v275-duty-pill button[data-v275-remove-duty]{
          width:0!important;
          height:12px!important;
          min-width:0!important;
          opacity:0!important;
          overflow:hidden!important;
          padding:0!important;
          transition:opacity .12s ease,width .12s ease!important;
        }
        .v275-duty-pill:hover button[data-v275-remove-duty],
        .v275-duty-pill:focus-within button[data-v275-remove-duty]{
          width:12px!important;
          min-width:12px!important;
          opacity:1!important;
        }
      }
      /* Touch: keep a small delete target because hover is unavailable */
      @media (hover:none), (pointer:coarse){
        .v275-roster-table th:not(.v275-roster-name),
        .v275-roster-table td{width:48px!important;min-width:48px!important;max-width:48px!important}
        .v275-roster-name{width:64px!important;min-width:64px!important;max-width:64px!important}
        .v275-duty-pill{max-width:44px!important;font-size:7.5px!important;padding:2px 3px!important}
        .v275-duty-pill button[data-v275-remove-duty]{width:11px!important;height:11px!important;min-width:11px!important;font-size:8px!important;line-height:10px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function compactDutyLabels(){
    document.querySelectorAll('.v275-roster-wrap .v275-duty-pill[data-v275-existing-duty]').forEach(pill=>{
      const code=String(pill.dataset.v275ExistingDuty||'').trim();
      const label=pill.querySelector('b');
      if(!code||!label) return;
      try{
        if(typeof window.dutyDisplayLabel==='function') label.textContent=window.dutyDisplayLabel(code);
        else if(typeof dutyDisplayLabel==='function') label.textContent=dutyDisplayLabel(code);
        else label.textContent=code;
      }catch(_){ label.textContent=code; }
      pill.title=code;
    });
  }

  function updateVersion(){if(window.__CNMI_V542_VERSION_OWNER__) return;
    const chip=document.querySelector('.v534-version-chip,.v533-version-chip,.v532-version-chip,.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip&&chip.textContent!=='v535'){
      chip.textContent='v535';
      chip.title='Admin roster compact like Staff view';
      chip.classList.add('v535-version-chip');
    }
  }

  function decorate(){
    injectStyle();
    compactDutyLabels();
    updateVersion();
  }

  const previous=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previous&&!previous.__v535Wrapped){
    const wrapped=function(){
      const out=previous.apply(this,arguments);
      setTimeout(decorate,0);
      setTimeout(decorate,180);
      return out;
    };
    wrapped.__v535Wrapped=true;
    try{window.renderPage=wrapped;renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(decorate,0),{once:true});
  setTimeout(decorate,160);
  window.cnmiV535={version:VERSION,decorate};
  console.info(`[${VERSION}] compact Admin roster loaded`);
})();
