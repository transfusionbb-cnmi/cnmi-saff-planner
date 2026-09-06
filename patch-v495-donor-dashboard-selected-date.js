/* CNMI Staff Planner v495 — show Donor App events on selected-date dashboard */
(function(){
  'use strict';
  const VERSION='v495-donor-dashboard-selected-date';

  function esc(v){
    if(typeof escapeHtml==='function') return escapeHtml(String(v??''));
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function dateSelected(){
    try{
      const v=window.cnmiDashboardDateV443?.selectedDate?.();
      if(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))) return String(v);
    }catch(_){}
    try{
      const v=state?.dashboardDateV443;
      if(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))) return String(v);
    }catch(_){}
    try{return todayStr();}catch(_){return new Date().toISOString().slice(0,10);}
  }
  function thaiDate(v){ try{return formatThaiDate(v);}catch(_){return String(v||'');} }
  function timeText(v){ return String(v||'').slice(0,5); }
  function sourceLabel(t){return ({platelet:'นัดเกล็ดเลือด',group:'หมู่คณะเลือดแดง',mobile:'ออกหน่วยนอกสถานที่'}[t]||'CNMI Donor');}
  function sourceClass(t){return ['platelet','group','mobile'].includes(t)?t:'';}

  function rowsForSelectedDate(){
    const d=dateSelected();
    const rows=Array.isArray(state?.donorAppEvents)?state.donorAppEvents:[];
    return rows.filter(r=>r&&r.is_active!==false&&String(r.event_date||'')===d)
      .slice().sort((a,b)=>String(a.start_time||'99:99').localeCompare(String(b.start_time||'99:99'))||String(a.title||'').localeCompare(String(b.title||'')));
  }

  function cardHtml(rows,date){
    if(!rows.length) return '';
    const items=rows.map(r=>{
      const phone=r.contact_phone?'<a href="tel:'+esc(r.contact_phone)+'">☎ '+esc(r.contact_phone)+'</a>':'';
      const email=r.contact_email?'<a href="mailto:'+encodeURIComponent(String(r.contact_email))+'">✉ '+esc(r.contact_email)+'</a>':'';
      const time=r.start_time?'<span>🕘 '+esc(timeText(r.start_time))+' น.</span>':'';
      const location=r.location?'<span>📍 '+esc(r.location)+'</span>':'';
      const contact=r.contact_name?'<span>👤 '+esc(r.contact_name)+'</span>':'';
      const status=r.status?'<span>สถานะ: '+esc(r.status)+'</span>':'';
      const url=esc(r.source_url||'https://donor.cnmiblood.com/');
      return '<article class="donor-sync-item v495-dashboard-item">'+
        '<div class="donor-sync-item-main">'+
          '<div class="donor-sync-item-title"><span class="donor-sync-type '+sourceClass(r.source_type)+'">'+esc(sourceLabel(r.source_type))+'</span><b>'+esc(r.title||sourceLabel(r.source_type))+'</b></div>'+
          '<div class="donor-sync-meta">'+time+location+contact+phone+email+status+'</div>'+
          (r.detail?'<div class="muted" style="margin-top:6px">'+esc(r.detail)+'</div>':'')+
        '</div>'+
        '<a class="tiny-btn donor-sync-open" href="'+url+'" target="_blank" rel="noopener">ดูใน Donor App</a>'+
      '</article>';
    }).join('');
    return '<section class="card donor-sync-card v495-donor-dashboard" data-v495-donor-dashboard="1">'+
      '<div class="donor-sync-head"><div><h3>นัด/กิจกรรมจาก Donor App</h3><p class="hint">'+esc(thaiDate(date))+' · แสดงตามวันที่ที่เลือกด้านบน</p></div><span class="donor-sync-badge">↻ CNMI Donor</span></div>'+
      '<div class="donor-sync-list">'+items+'</div></section>';
  }

  function injectDashboard(){
    try{
      if(state?.page!=='dashboard') return;
      const root=document.getElementById('pageContent');
      if(!root) return;
      root.querySelectorAll('[data-v495-donor-dashboard]').forEach(el=>el.remove());
      // v494 used today's date fallback on some installations. Remove only that old dashboard card.
      root.querySelectorAll('.donor-sync-card').forEach(card=>{
        const h=card.querySelector('h3');
        if(h && /นัด\/กิจกรรมจาก Donor App วันนี้/.test(h.textContent||'')) card.remove();
      });
      const date=dateSelected();
      const rows=rowsForSelectedDate();
      const html=cardHtml(rows,date);
      if(html) root.insertAdjacentHTML('beforeend',html);
    }catch(err){console.warn('['+VERSION+'] inject',err);}
  }

  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrapped=function renderPageV495(){
      const result=oldRenderPage.apply(this,arguments);
      setTimeout(injectDashboard,0);
      return result;
    };
    try{window.renderPage=renderPage=wrapped;}catch(_){window.renderPage=wrapped;}
  }

  document.addEventListener('click',function(e){
    if(e.target?.closest?.('[data-v443-date-prev],[data-v443-date-next],[data-v443-date-today]')) setTimeout(injectDashboard,80);
  },true);
  document.addEventListener('change',function(e){
    if(e.target?.closest?.('[data-v443-date-input]')) setTimeout(injectDashboard,80);
  },true);

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(state?.profile){ injectDashboard(); if(Array.isArray(state?.donorAppEvents)&&state.donorAppEvents.length) clearInterval(timer); }
    if(tries>30) clearInterval(timer);
  },500);

  window.injectDonorDashboardV495=injectDashboard;
  console.info('['+VERSION+'] ready');
})();
