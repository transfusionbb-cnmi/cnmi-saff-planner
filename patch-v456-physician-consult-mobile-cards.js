/* CNMI Staff Planner V456
 * Physician Consult mobile readability fix
 * - Desktop keeps the 3-column table.
 * - Mobile replaces the squeezed/hidden table columns with compact cards.
 * - Each mobile physician name remains tappable and uses the V455 phone popup/tel: behavior.
 * No SQL required.
 */
(function(){
  'use strict';
  const VERSION='V456_PHYSICIAN_CONSULT_MOBILE_CARDS';
  if(window.__CNMI_V456_PHYSICIAN_CONSULT_MOBILE_CARDS__)return;
  window.__CNMI_V456_PHYSICIAN_CONSULT_MOBILE_CARDS__=true;

  function decorate(html){
    if(!html||!String(html).includes('data-v452-physician-card'))return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html);
      const card=tpl.content.querySelector('[data-v452-physician-card]');
      if(!card||card.querySelector('.v456-mobile-consult-list'))return html;
      const tbody=card.querySelector('.v452-dashboard-table tbody');
      if(!tbody)return html;

      const list=document.createElement('div');
      list.className='v456-mobile-consult-list';
      [...tbody.querySelectorAll('tr')].forEach((tr)=>{
        const cells=[...tr.children];
        if(cells.length<3)return;
        const time=(cells[0].textContent||'').trim();
        const site=(cells[1].textContent||'').trim();
        const doctorCell=cells[2];
        const row=document.createElement('div');
        row.className='v456-mobile-consult-row';

        const top=document.createElement('div');
        top.className='v456-mobile-consult-top';
        const siteEl=document.createElement('strong');
        siteEl.className='v456-mobile-consult-site';
        siteEl.textContent=site||'Consult';
        const timeEl=document.createElement('span');
        timeEl.className='v456-mobile-consult-time';
        timeEl.textContent=time||'-';
        top.append(siteEl,timeEl);

        const bottom=document.createElement('div');
        bottom.className='v456-mobile-consult-doctor';
        const label=document.createElement('span');
        label.className='v456-mobile-doctor-label';
        label.textContent='แพทย์';
        bottom.appendChild(label);

        const sourceButton=doctorCell.querySelector('[data-v455-doctor-id]');
        if(sourceButton){
          const button=sourceButton.cloneNode(true);
          button.classList.add('v456-mobile-doctor-button');
          bottom.appendChild(button);
        }else{
          const sourceFallback=doctorCell.querySelector('.v452-not-set')||doctorCell.firstElementChild;
          const fallback=document.createElement('span');
          fallback.className='v452-not-set v456-mobile-not-set';
          fallback.textContent=(sourceFallback?.textContent||doctorCell.textContent||'ยังไม่กำหนด').trim();
          bottom.appendChild(fallback);
        }

        row.append(top,bottom);
        list.appendChild(row);
      });

      const wrap=card.querySelector('.v452-dashboard-table-wrap');
      if(wrap)wrap.insertAdjacentElement('afterend',list);
      else card.appendChild(list);

      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(err){
      console.warn('[V456] decorate physician mobile cards',err);
      return html;
    }
  }

  const previousDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previousDashboard==='function'){
    const wrapped=function renderDashboardV456(){return decorate(previousDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  const style=document.createElement('style');
  style.id='cnmi-v456-physician-consult-mobile-style';
  style.textContent=`
    .v456-mobile-consult-list{display:none}
    @media(max-width:760px){
      .v452-physician-card .v452-dashboard-table-wrap{display:none!important}
      .v456-mobile-consult-list{display:grid!important;gap:9px;margin-top:10px}
      .v456-mobile-consult-row{display:grid;gap:9px;padding:12px 13px;border:1px solid #e1eaf2;border-radius:14px;background:#fbfdff;min-width:0}
      .v456-mobile-consult-top{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
      .v456-mobile-consult-site{font-size:15px;line-height:1.25;color:#263d52;min-width:0;overflow-wrap:anywhere}
      .v456-mobile-consult-time{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;padding:5px 8px;border-radius:999px;background:#eef5fb;color:#607c93;font-size:11px;font-weight:800;white-space:nowrap}
      .v456-mobile-consult-doctor{display:flex;align-items:center;gap:9px;min-width:0;padding-top:8px;border-top:1px solid #edf2f6}
      .v456-mobile-doctor-label{flex:0 0 auto;font-size:11px;font-weight:800;color:#7a8fa2}
      .v456-mobile-doctor-button{display:inline-flex!important;visibility:visible!important;opacity:1!important;max-width:100%;min-height:38px!important;padding:7px 12px!important;font-size:14px!important;white-space:normal!important;text-align:left!important;overflow-wrap:anywhere}
      .v456-mobile-not-set{font-size:13px;font-weight:800}
      .v452-physician-card .v452-card-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:10px!important;flex-wrap:wrap}
      .v452-physician-card .v452-card-meta{justify-content:flex-start!important}
    }
    @media(max-width:390px){
      .v456-mobile-consult-top{align-items:flex-start;flex-direction:column;gap:6px}
      .v456-mobile-consult-time{align-self:flex-start}
    }
  `;
  document.head.appendChild(style);

  window.cnmiPhysicianMobileV456={version:VERSION,decorate};
  console.info(`${VERSION} loaded`);
})();
