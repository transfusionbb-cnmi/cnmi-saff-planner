/* V332 — Calendar activity time/location detail (display-only, no extra data request) */
(function(){
  'use strict';
  const VERSION='V332';

  function esc(value){
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function isActivity(row){
    return ['activity','training','meeting','outing','standard','code'].includes(String(row?.type || ''));
  }

  function activityMeta(row){
    if(!isActivity(row)) return '';
    const raw=row?.raw || {};
    const start=String(raw.start_time || '').trim();
    const end=String(raw.end_time || '').trim();
    const location=String(raw.location || '').trim();
    const timeText=start && end ? `${start}–${end}` : (start || end);
    if(!timeText && !location) return '';
    return `<div class="v332-activity-meta muted">${timeText ? `<div><b>เวลา:</b> ${esc(timeText)}</div>` : ''}${location ? `<div><b>สถานที่:</b> ${esc(location)}</div>` : ''}</div>`;
  }

  function enhanceRenderer(){
    const original=window.renderCalendarModalRow;
    if(typeof original!=='function' || original.__v332Enhanced) return false;

    function renderCalendarModalRowV332(row){
      const html=String(original(row) || '');
      const meta=activityMeta(row);
      if(!meta || html.includes('v332-activity-meta')) return html;
      const marker='</div>';
      const titleStart=html.indexOf('<div class="event-title"');
      if(titleStart<0) return html;
      const titleEnd=html.indexOf(marker,titleStart);
      if(titleEnd<0) return html;
      const insertAt=titleEnd+marker.length;
      return html.slice(0,insertAt)+meta+html.slice(insertAt);
    }
    renderCalendarModalRowV332.__v332Enhanced=true;
    renderCalendarModalRowV332.__v332Original=original;
    window.renderCalendarModalRow=renderCalendarModalRowV332;
    try{ renderCalendarModalRow=renderCalendarModalRowV332; }catch(_){ }
    return true;
  }

  function addStyle(){
    if(document.getElementById('v332-calendar-meta-style')) return;
    const style=document.createElement('style');
    style.id='v332-calendar-meta-style';
    style.textContent='.v332-activity-meta{margin:.45rem 0 .3rem;line-height:1.5}.v332-activity-meta>div+div{margin-top:.1rem}';
    document.head.appendChild(style);
  }

  addStyle();
  enhanceRenderer();
  document.addEventListener('DOMContentLoaded',()=>{ addStyle(); enhanceRenderer(); },{once:true});
  setTimeout(enhanceRenderer,0);
  window.cnmiV332={version:VERSION,enhanceRenderer};
})();
