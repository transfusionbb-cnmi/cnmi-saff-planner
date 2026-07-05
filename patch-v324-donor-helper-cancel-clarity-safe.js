/* V324 SAFE - Donor helper cancel clarity
   Frontend-only DOM patch. No Supabase call, no SQL, no popup override, no central modal changes.
   Changes only visible text on donor-helper page:
   - Admin ยกเลิก -> ยกเลิกตามคำขอ
   - ไม่มาตามนัด -> ไม่มาตามนัด (No Show)
   - show current incharge/contact when already loaded in app state
   - show cancellation history when the page already has previous/cancel fields
*/
(function(){
  'use strict';
  var VERSION='v324-safe';
  var CONTACT_FALLBACK='กรุณาแจ้งหัวหน้าหน่วยเวชศาสตร์บริการโลหิต';
  var TH_MONTHS={
    'มกราคม':'01','กุมภาพันธ์':'02','มีนาคม':'03','เมษายน':'04','พฤษภาคม':'05','มิถุนายน':'06',
    'กรกฎาคม':'07','สิงหาคม':'08','กันยายน':'09','ตุลาคม':'10','พฤศจิกายน':'11','ธันวาคม':'12'
  };
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function norm(s){return String(s||'').replace(/\s+/g,' ').trim();}
  function getAppState(){
    try { if (typeof state !== 'undefined') return state; } catch(_){ }
    try { if (window.state) return window.state; } catch(_){ }
    try { if (window.appState) return window.appState; } catch(_){ }
    return {};
  }
  function donorContext(){
    var t=norm(document.body && document.body.innerText || '');
    return /ลงชื่อคนมาช่วย|ห้องบริจาคโลหิต\s*CNMI|ช่วยห้องบริจาค|รายการคนมาช่วย|donor\s*helper/i.test(t);
  }
  function currentMonthKey(){
    var S=getAppState() || {};
    var keys=[S.donorHelperMonthKey,S.selectedDonorHelperMonth,S.monthKey,S.selectedMonth,S.positionMonthKey,S.positionMonthViewKey];
    for(var i=0;i<keys.length;i++) if(/^\d{4}-\d{2}$/.test(String(keys[i]||''))) return String(keys[i]);
    var body=norm(document.body && document.body.innerText || '');
    var iso=body.match(/(20\d{2})[-/](\d{1,2})/);
    if(iso) return iso[1]+'-'+String(iso[2]).padStart(2,'0');
    var th=body.match(/(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(25\d{2}|20\d{2})/);
    if(th){ var y=Number(th[2]); if(y>2400)y-=543; return String(y)+'-'+TH_MONTHS[th[1]]; }
    var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function staffName(row){
    if(!row) return '';
    var real=norm([row.full_name,row.name_th,row.display_name,row.name].filter(Boolean)[0] || [row.first_name||row.firstname||'', row.last_name||row.lastname||row.surname||''].join(' '));
    var nick=norm(row.nickname||row.nick_name||row.nick||row.short_name||'');
    if(real && nick && real.indexOf('('+nick+')')<0) return real+' ('+nick+')';
    return real || nick || '';
  }
  function findStaffById(id){
    var S=getAppState() || {}, people=S.staff || S.staffProfiles || S.users || [];
    id=String(id||'');
    return people.find(function(p){return String(p.id||p.staff_id||p.user_id||'')===id;}) || null;
  }
  function inchargeName(){
    var S=getAppState() || {}, key=currentMonthKey();
    var rows=[].concat(S.incharges||[], S.monthIncharges||[], S.monthlyIncharges||[], S.donorIncharges||[]);
    var found=rows.find(function(r){
      var mk=String(r.month_key||r.month||r.ym||'');
      return (!mk || mk===key) && (r.staff_id || r.user_id || r.id || r.name || r.full_name || r.display_name || r.nickname);
    });
    if(!found) return '';
    if(found.staff_id || found.user_id){
      var person=findStaffById(found.staff_id || found.user_id);
      var n=staffName(person);
      if(n) return n;
    }
    return staffName(found);
  }
  function upsertContact(){
    if(!donorContext()) return;
    var root=document.querySelector('#app, main, .app-shell, body');
    if(!root) return;
    var existing=document.querySelector('[data-v324-safe-contact]');
    var name=inchargeName();
    var html=name?('<b>อินชาร์จเดือนนี้:</b> '+esc(name)):esc(CONTACT_FALLBACK);
    if(existing){ existing.innerHTML=html; return; }
    var box=document.createElement('div');
    box.setAttribute('data-v324-safe-contact','1');
    box.style.cssText='margin:10px 0;padding:10px 12px;border:1px solid #cfe8ff;border-radius:12px;background:#f5fbff;color:#17506d;font-size:14px;';
    box.innerHTML=html;
    var title=[].slice.call(document.querySelectorAll('h1,h2,h3,.card,section')).find(function(el){return /ลงชื่อคนมาช่วย|ห้องบริจาคโลหิต\s*CNMI|ช่วยห้องบริจาค/.test(norm(el.innerText||''));});
    (title || root).insertAdjacentElement(title?'afterend':'afterbegin', box);
  }
  function renameButtons(){
    if(!donorContext()) return;
    [].slice.call(document.querySelectorAll('button,a,[role="button"]')).forEach(function(el){
      var t=norm(el.textContent||'');
      if(/^(Admin\s*)?ยกเลิก(โดย\s*Admin)?$/.test(t) || t==='Admin ยกเลิก'){
        el.textContent='ยกเลิกตามคำขอ';
        el.setAttribute('title','ใช้เมื่อเจ้าหน้าที่แจ้งยกเลิกล่วงหน้า และหัวหน้า/อินชาร์จรับทราบแล้ว');
      }
      if(t==='ไม่มาตามนัด' || /^no\s*show$/i.test(t)){
        el.textContent='ไม่มาตามนัด (No Show)';
        el.setAttribute('title','ใช้เฉพาะกรณีไม่มาโดยไม่แจ้งล่วงหน้า หรือแจ้งหลังเวลานัด');
      }
    });
  }
  function firstMatch(text, patterns){
    for(var i=0;i<patterns.length;i++){ var m=String(text||'').match(patterns[i]); if(m && m[1]) return norm(m[1]); }
    return '';
  }
  function enhanceHistory(){
    if(!donorContext()) return;
    var cards=[].slice.call(document.querySelectorAll('.card,.slot-card,.helper-card,[class*="slot"],[class*="helper"],tr'));
    cards.forEach(function(card){
      if(card.dataset && card.dataset.v324SafeHistoryDone) return;
      var text=card.innerText||'';
      if(!/ยกเลิก|cancel|เคยลงชื่อ|ผู้ลงชื่อเดิม/i.test(text)) return;
      var oldName=firstMatch(text,[/เคยลงชื่อ\s*[:：]\s*([^\n]+)/i,/ผู้ลงชื่อเดิม\s*[:：]\s*([^\n]+)/i,/previous\s*[:：]\s*([^\n]+)/i]);
      var reason=firstMatch(text,[/เหตุผล\s*[:：]\s*([^\n]+)/i,/reason\s*[:：]\s*([^\n]+)/i,/หมายเหตุ\s*[:：]\s*([^\n]+)/i]);
      var dt=firstMatch(text,[/วันที่[-\s]*เวลา\s*[:：]\s*([^\n]+)/i,/เวลาแจ้งยกเลิก\s*[:：]\s*([^\n]+)/i,/cancel(?:led)?[_\s-]*at\s*[:：]\s*([^\n]+)/i]);
      if(!oldName && !reason && !dt) return;
      if(card.querySelector && card.querySelector('[data-v324-safe-history]')) return;
      var box=document.createElement('div');
      box.setAttribute('data-v324-safe-history','1');
      box.style.cssText='margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff8e8;border:1px solid #ffe0a8;color:#6b4300;font-size:13px;line-height:1.45;';
      box.innerHTML=(oldName?'<div><b>เคยลงชื่อ:</b> '+esc(oldName)+'</div>':'')+
        '<div><b>ยกเลิกโดย:</b> หัวหน้าหน่วยเวชศาสตร์บริการโลหิต/อินชาร์จ</div>'+
        (reason?'<div><b>เหตุผล:</b> '+esc(reason)+'</div>':'')+
        (dt?'<div><b>วันที่-เวลา:</b> '+esc(dt)+'</div>':'');
      card.appendChild(box);
      if(card.dataset) card.dataset.v324SafeHistoryDone='1';
    });
  }
  function run(){
    try{ renameButtons(); upsertContact(); enhanceHistory(); }catch(e){ console.warn('[V324 SAFE]', e); }
  }
  function boot(){
    run();
    var timer=null;
    var mo=new MutationObserver(function(){ clearTimeout(timer); timer=setTimeout(run,150); });
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
    window.v324DonorHelperCancelClaritySafe={version:VERSION,run:run};
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
