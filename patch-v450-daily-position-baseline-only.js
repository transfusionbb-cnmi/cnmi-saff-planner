/* CNMI Staff Planner V450
 * Daily daytime-position page: baseline-only / no daily rearrangement.
 * - Keep the Admin baseline assignment as the visible source of truth.
 * - Hide and disable the "ปรับวันนี้" controls for every role, including Admin.
 * - Hide the daily Save + Publish action and draft/published status badges.
 * - Keep date selection, in-charge selection/save, leave indicators, conditions,
 *   and job descriptions unchanged.
 * UI/interaction-only. No SQL/schema changes and no automatic data deletion.
 */
(function(){
  'use strict';
  const VERSION='V450_DAILY_POSITION_BASELINE_ONLY';
  if(window.__CNMI_V450_DAILY_POSITION_BASELINE_ONLY__)return;
  window.__CNMI_V450_DAILY_POSITION_BASELINE_ONLY__=true;

  let queued=false;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function isDaily(){return String(S()?.page||'')==='positions';}

  function lockPage(root=document){
    if(!isDaily())return;
    const area=root.querySelector?.('#pageContent .v225-positions-page,#pageContent .v226-positions-page,.v225-positions-page,.v226-positions-page');
    if(!area)return;

    area.dataset.v450BaselineOnly='1';

    // The controls stay in the DOM so older observers do not recreate them,
    // but they are disabled and permanently hidden by the V450 stylesheet.
    area.querySelectorAll('select[data-position-row]').forEach(select=>{
      select.disabled=true;
      select.tabIndex=-1;
      select.setAttribute('aria-hidden','true');
    });
    area.querySelectorAll('[data-save-positions],[data-publish-positions],[data-v337-save-publish]').forEach(button=>{
      button.disabled=true;
      button.tabIndex=-1;
      button.setAttribute('aria-hidden','true');
    });

    // Remove compare/change helper blocks because there is no daily-edit workflow anymore.
    area.querySelectorAll('.v322-daily-change-summary,.v322-change-status,.v225-position-note,.v225-daily-compare-panel').forEach(node=>{
      node.hidden=true;
      node.setAttribute('aria-hidden','true');
    });

    // Status "ร่าง/ประกาศแล้ว" no longer has operational meaning on this page.
    const toolbar=area.querySelector('.v225-position-toolbar,.toolbar');
    toolbar?.querySelectorAll('.badge.orange,.badge.green,.v434-draft-badge,.v434-publish-badge').forEach(badge=>{
      const value=String(badge.textContent||'').trim();
      if(/ร่าง|ประกาศแล้ว/.test(value)){
        badge.hidden=true;
        badge.setAttribute('aria-hidden','true');
      }
    });

    // Keep the visible baseline wording stable even if an older patch tries to rename it.
    const headers=area.querySelectorAll('.v225-daily-position-table thead th');
    if(headers?.[3])headers[3].textContent='ตั้งต้นจาก Admin';
    area.querySelectorAll('.v322-baseline-label').forEach(node=>{node.textContent='ตั้งต้นจาก Admin';});
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      lockPage(document);
    });
  }

  function install(){
    const root=document.getElementById('pageContent')||document.body;
    if(root&&!root.__v450BaselineOnlyObserver){
      const observer=new MutationObserver(queue);
      observer.observe(root,{childList:true,subtree:true});
      root.__v450BaselineOnlyObserver=observer;
    }
    queue();
  }

  document.addEventListener('change',event=>{
    if(event.target?.closest?.('#positionDateInput,#inchargeSelect'))[0,60,180].forEach(ms=>setTimeout(queue,ms));
  },true);

  window.addEventListener('pageshow',queue);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  const style=document.createElement('style');
  style.id='cnmi-v450-daily-position-baseline-only-style';
  style.textContent=`
    /* Daily page: baseline is authoritative; daily-adjust column is intentionally unavailable. */
    .v225-positions-page[data-v450-baseline-only="1"] [data-save-positions],
    .v225-positions-page[data-v450-baseline-only="1"] [data-publish-positions],
    .v225-positions-page[data-v450-baseline-only="1"] [data-v337-save-publish],
    .v226-positions-page[data-v450-baseline-only="1"] [data-save-positions],
    .v226-positions-page[data-v450-baseline-only="1"] [data-publish-positions],
    .v226-positions-page[data-v450-baseline-only="1"] [data-v337-save-publish]{display:none!important}

    .v225-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table th:nth-child(5),
    .v225-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table td:nth-child(5),
    .v226-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table th:nth-child(5),
    .v226-positions-page[data-v450-baseline-only="1"] .v225-daily-position-table td:nth-child(5){display:none!important}

    .v225-positions-page[data-v450-baseline-only="1"] .v225-mobile-position-list label:has(select[data-position-row]),
    .v226-positions-page[data-v450-baseline-only="1"] .v225-mobile-position-list label:has(select[data-position-row]),
    .v225-positions-page[data-v450-baseline-only="1"] .v322-change-status,
    .v226-positions-page[data-v450-baseline-only="1"] .v322-change-status,
    .v225-positions-page[data-v450-baseline-only="1"] .v322-daily-change-summary,
    .v226-positions-page[data-v450-baseline-only="1"] .v322-daily-change-summary,
    .v225-positions-page[data-v450-baseline-only="1"] .v225-position-note,
    .v226-positions-page[data-v450-baseline-only="1"] .v225-position-note,
    .v225-positions-page[data-v450-baseline-only="1"] .v225-daily-compare-panel,
    .v226-positions-page[data-v450-baseline-only="1"] .v225-daily-compare-panel{display:none!important}

    .v225-positions-page[data-v450-baseline-only="1"] select[data-position-row],
    .v226-positions-page[data-v450-baseline-only="1"] select[data-position-row]{pointer-events:none!important}
  `;
  document.head.appendChild(style);

  window.cnmiV450={version:VERSION,lockPage,queue};
  console.info(`${VERSION} loaded`);
})();
