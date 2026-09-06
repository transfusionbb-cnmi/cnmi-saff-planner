/* CNMI Staff Planner v494 — synchronized CNMI Donor App activities */
(function(){
  'use strict';
  const VERSION='v494-donor-app-events';
  const DONOR_URL='https://donor.cnmiblood.com/';

  function esc(v){
    if(typeof escapeHtml==='function') return escapeHtml(String(v??''));
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function thaiDate(v){ return typeof formatThaiDate==='function' ? formatThaiDate(v) : String(v||''); }
  function timeText(v){ return String(v||'').slice(0,5); }
  function sourceLabel(type){ return ({platelet:'นัดเกล็ดเลือด',group:'หมู่คณะเลือดแดง',mobile:'ออกหน่วยนอกสถานที่'}[type]||'CNMI Donor'); }
  function sourceClass(type){ return ['platelet','group','mobile'].includes(type)?type:''; }
  function eventNote(r){
    const bits=[];
    if(r.contact_name) bits.push('ผู้ติดต่อ: '+r.contact_name);
    if(r.contact_phone) bits.push('โทร: '+r.contact_phone);
    if(r.detail) bits.push(r.detail);
    if(r.status) bits.push('สถานะ: '+r.status);
    return bits.join(' · ');
  }
  function activeRows(){ return (state.donorAppEvents||[]).filter(r=>r&&r.is_active!==false); }

  async function loadDonorAppEventsV494(){
    if(!state.profile || !sb) return;
    const now=new Date();
    const start=toDateInput(new Date(now.getFullYear(),now.getMonth()-2,1));
    const end=toDateInput(new Date(now.getFullYear(),now.getMonth()+4,0));
    const {data,error}=await sb.from('donor_app_events')
      .select('id,source_system,source_type,source_id,title,event_date,start_time,end_time,location,contact_name,contact_phone,contact_email,status,detail,source_url,is_active,updated_at')
      .gte('event_date',start).lte('event_date',end)
      .eq('is_active',true)
      .order('event_date',{ascending:true})
      .order('start_time',{ascending:true,nullsFirst:false});
    if(error){
      state.donorAppEvents=[];
      if(!/does not exist|relation|schema cache/i.test(String(error.message||''))) console.warn('['+VERSION+']',error.message||error);
      return;
    }
    state.donorAppEvents=Array.isArray(data)?data:[];
  }

  if(!Array.isArray(state.donorAppEvents)) state.donorAppEvents=[];

  const prevLoad=typeof loadAllData==='function'?loadAllData:null;
  if(prevLoad){
    const wrapped=async function loadAllDataV494(){ await prevLoad.apply(this,arguments); await loadDonorAppEventsV494(); };
    window.loadAllData=wrapped; try{(0,eval)('loadAllData=window.loadAllData');}catch(_){}
  }

  const prevCollect=typeof collectCalendarEvents==='function'?collectCalendarEvents:null;
  if(prevCollect){
    const wrapped=function collectCalendarEventsV494(){
      const events=prevCollect.apply(this,arguments)||[];
      activeRows().forEach(r=>{
        const raw={
          ...r,
          event_type:sourceLabel(r.source_type),
          note:eventNote(r),
          participant_ids:[],
          __donor_sync:true
        };
        const type=r.source_type==='mobile'?'outing':'activity';
        events.push({date:r.event_date,type,title:r.title,raw,donorSync:true});
      });
      return events;
    };
    window.collectCalendarEvents=wrapped; try{(0,eval)('collectCalendarEvents=window.collectCalendarEvents');}catch(_){}
  }

  const prevColor=typeof calendarEventColor==='function'?calendarEventColor:null;
  if(prevColor){
    const wrapped=function calendarEventColorV494(e){
      if(e?.raw?.__donor_sync){
        if(e.raw.source_type==='platelet') return '#fff0f2';
        if(e.raw.source_type==='group') return '#edf8f2';
        if(e.raw.source_type==='mobile') return '#edf6fa';
      }
      return prevColor.apply(this,arguments);
    };
    window.calendarEventColor=wrapped; try{(0,eval)('calendarEventColor=window.calendarEventColor');}catch(_){}
  }

  function rowsHtml(rows){
    if(!rows.length) return '<div class="donor-sync-empty">ยังไม่มีนัดหรือกิจกรรมจาก CNMI Donor App ในช่วงวันที่ที่โหลด</div>';
    return '<div class="donor-sync-list">'+rows.map(r=>{
      const phone=r.contact_phone?'<a href="tel:'+esc(r.contact_phone)+'">☎ '+esc(r.contact_phone)+'</a>':'';
      const email=r.contact_email?'<a href="mailto:'+encodeURIComponent(String(r.contact_email))+'">✉ '+esc(r.contact_email)+'</a>':'';
      const when=thaiDate(r.event_date)+(r.start_time?' · '+esc(timeText(r.start_time))+' น.':'');
      const url=esc(r.source_url||DONOR_URL);
      return '<article class="donor-sync-item"><div class="donor-sync-item-main"><div class="donor-sync-item-title"><span class="donor-sync-type '+sourceClass(r.source_type)+'">'+esc(sourceLabel(r.source_type))+'</span><b>'+esc(r.title)+'</b></div><div class="donor-sync-meta"><span>📅 '+esc(when)+'</span>'+(r.location?'<span>📍 '+esc(r.location)+'</span>':'')+(r.contact_name?'<span>👤 '+esc(r.contact_name)+'</span>':'')+phone+email+(r.status?'<span>สถานะ: '+esc(r.status)+'</span>':'')+'</div>'+(r.detail?'<div class="muted" style="margin-top:6px">'+esc(r.detail)+'</div>':'')+'</div><a class="tiny-btn donor-sync-open" href="'+url+'" target="_blank" rel="noopener">เปิด Donor App</a></article>';
    }).join('')+'</div>';
  }

  function syncedCard(rows,title,subtitle){
    return '<div class="card donor-sync-card"><div class="donor-sync-head"><div><h3>'+esc(title)+'</h3><p class="hint">'+esc(subtitle)+'</p></div><span class="donor-sync-badge">↻ เชื่อมจาก CNMI Donor</span></div>'+rowsHtml(rows)+'</div>';
  }

  const prevActivities=typeof renderActivitiesPage==='function'?renderActivitiesPage:null;
  if(prevActivities){
    const wrapped=function renderActivitiesPageV494(){
      const base=String(prevActivities.apply(this,arguments)||'');
      const rows=activeRows().slice().sort((a,b)=>String(a.event_date||'').localeCompare(String(b.event_date||''))||String(a.start_time||'').localeCompare(String(b.start_time||'')));
      return base+syncedCard(rows,'กิจกรรมจาก CNMI Donor App','นัดเกล็ดเลือดจะเข้าอัตโนมัติทันที ส่วนหมู่คณะและออกหน่วยจะแสดงเมื่อยืนยันแล้ว · แก้ไขต้นทางที่ Donor App');
    };
    window.renderActivitiesPage=wrapped; try{(0,eval)('renderActivitiesPage=window.renderActivitiesPage');}catch(_){}
  }

  const prevDashboard=typeof renderDashboard==='function'?renderDashboard:null;
  if(prevDashboard){
    const wrapped=function renderDashboardV494(){
      const base=String(prevDashboard.apply(this,arguments)||'');
      let d='';
      try{ d=typeof selectedDashboardDate==='function'?selectedDashboardDate():todayStr(); }catch(_){ d=todayStr(); }
      const rows=activeRows().filter(r=>String(r.event_date)===String(d));
      if(!rows.length) return base;
      return base+syncedCard(rows,'นัด/กิจกรรมจาก Donor App วันนี้','ข้อมูลสำหรับเตรียมงานและติดต่อผู้บริจาค/ผู้ประสานงาน');
    };
    window.renderDashboard=wrapped; try{(0,eval)('renderDashboard=window.renderDashboard');}catch(_){}
  }

  // Initial page load can start before the final patch is parsed. Backfill once a profile exists.
  let tries=0;
  const timer=setInterval(async()=>{
    tries++;
    if(state.profile&&sb){
      clearInterval(timer);
      await loadDonorAppEventsV494();
      try{ if(typeof renderPage==='function') renderPage(); }catch(_){}
    } else if(tries>20) clearInterval(timer);
  },500);

  window.loadDonorAppEventsV494=loadDonorAppEventsV494;
  console.info('['+VERSION+'] ready');
})();
