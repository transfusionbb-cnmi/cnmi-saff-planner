/* CNMI Staff Planner V460
 * Off-day dashboard clarity + 24h physician consult + helper names + Admin action center.
 *
 * 1) Saturday/Sunday/public holiday:
 *    - Hide leave count from Dashboard summary.
 *    - Show only "ไม่รับเวร" in the leave/no-duty section.
 *    - Holiday manpower no longer displays/subtracts normal leave; it uses roster + helper signups.
 *    - Show helper names directly on Dashboard.
 * 2) Physician Consult:
 *    - Off-day uses one Donor & BB physician for 24 hours (from on-call range / daily override).
 *    - Physician name remains tappable for V455 phone popup.
 * 3) Admin action center:
 *    - Global pending items on Dashboard without manually switching month menus.
 *    - Trade confirmed waiting Admin, OT pending, leave cancellation, profile changes,
 *      donor-helper cancellations, and HR follow-up.
 *    - Tapping an item opens the correct page/month when applicable.
 *
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V460_OFFDAY_CONSULT_HELPER_ADMIN_ALERTS';
  if(window.__CNMI_V460_OFFDAY_CONSULT_HELPER_ADMIN_ALERTS__)return;
  window.__CNMI_V460_OFFDAY_CONSULT_HELPER_ADMIN_ALERTS__=true;

  const pendingCache={status:'idle',error:'',loadedAt:0,categories:[],promise:null};

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){} return window.supabaseClient||window.sb||null;}
  function esc(v){try{return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v??'');}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}
  function norm(v){const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function selectedDate(){try{return norm(window.cnmiDashboardDateV443?.selectedDate?.())||norm(S().dashboardDateV443)||norm(todayStr());}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}}
  function isWeekendSafe(date){try{return typeof isWeekend==='function'?!!isWeekend(date):[0,6].includes(new Date(`${date}T12:00:00`).getDay());}catch(_){return false;}}
  function isHolidaySafe(date){try{return typeof isHolidayDate==='function'?!!isHolidayDate(date):false;}catch(_){return false;}}
  function isOffDay(date){try{return window.cnmiDashboardHolidayManpowerV440?.isOffDay?.(date)??(isWeekendSafe(date)||isHolidaySafe(date));}catch(_){return isWeekendSafe(date)||isHolidaySafe(date);}}
  function actualAdmin(){try{return typeof window.isActualAdminV167==='function'?!!window.isActualAdminV167():(typeof isAdmin==='function'&&!!isAdmin());}catch(_){return String(S()?.profile?.role||'').toLowerCase()==='admin';}}
  function adminMode(){try{return typeof isAdmin==='function'&&!!isAdmin();}catch(_){return actualAdmin();}}
  function forceAdminView(){
    if(!actualAdmin())return;
    try{
      const st=S(),id=st?.session?.user?.id||st?.profile?.user_id||st?.profile?.id||st?.profile?.email||'guest';
      st.viewAsMode='admin';
      window.localStorage?.setItem?.(`cnmi_view_as_mode_${id}`,'admin');
    }catch(_){ }
  }
  function staffById(id){return (S().staff||[]).find(x=>String(x?.id||'')===String(id||''))||null;}
  function staffName(id){const p=staffById(id);return p?(p.nickname||p.full_name||p.email||'-'):'-';}
  function thaiDate(date){try{return typeof formatThaiDate==='function'?formatThaiDate(date):date;}catch(_){return date;}}
  function monthOf(date){return norm(date).slice(0,7);}
  function monthEnd(key){const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));if(!m)return'';return `${key}-${String(new Date(Number(m[1]),Number(m[2]),0).getDate()).padStart(2,'0')}`;}
  function addMonths(key,delta){const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));if(!m)return key;const d=new Date(Number(m[1]),Number(m[2])-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function thaiDateTime(v){try{return typeof formatThaiDateTime==='function'?formatThaiDateTime(v):String(v||'');}catch(_){return String(v||'');}}
  function mergeRows(key,rows){
    const st=S(),cur=Array.isArray(st[key])?st[key]:[],map=new Map();
    [...cur,...(rows||[])].forEach(r=>{if(r?.id!=null)map.set(String(r.id),r);});
    st[key]=[...map.values()];
  }

  function groupOf(staff){
    const type=String(staff?.staff_type||'').trim(),role=String(staff?.role||'').trim(),text=`${type} ${role}`;
    if(/แพทย์|physician|doctor/i.test(text))return 'แพทย์';
    if(type==='เคิก'||/clerk|ธุรการ/i.test(text))return 'เคิก';
    return 'MT';
  }
  function rosterGroupCounts(ids){
    const out={MT:0,'เคิก':0,'แพทย์':0};
    (ids||[]).forEach(id=>{const g=groupOf(staffById(id));out[g]=(out[g]||0)+1;});
    return out;
  }
  function helperName(row){
    if(row?.internal_staff_id){const p=staffById(row.internal_staff_id);if(p)return p.nickname||p.full_name||row.helper_name||'-';}
    return String(row?.helper_name||'-').trim()||'-';
  }
  function helperUnit(row){
    if(row?.internal_staff_id)return 'ในหน่วย';
    const unit=String(row?.unit_name||'').trim();
    return unit&&unit!=='หน่วยเวชศาสตร์บริการโลหิต'?unit:'นอกหน่วย';
  }
  function helperNamesHtml(h){
    if(!h?.loaded){
      if(h?.loading)return '<span class="v460-helper-loading">กำลังโหลดรายชื่อ…</span>';
      if(h?.error)return '<span class="v460-helper-error">โหลดรายชื่อไม่สำเร็จ</span>';
      return '<span class="v460-helper-loading">กำลังตรวจรายชื่อ…</span>';
    }
    if(!h.rows?.length)return '<span class="v460-helper-empty">ยังไม่มีผู้ลงชื่อมาช่วย</span>';
    return `<div class="v460-helper-names">${h.rows.map(r=>`<span class="v460-helper-name"><b>${esc(helperName(r))}</b><small>${esc(helperUnit(r))}</small></span>`).join('')}</div>`;
  }

  function rebuildOffdayManpower(root,date){
    const card=root.querySelector?.('[data-v440-holiday-manpower]');
    const api=window.cnmiDashboardHolidayManpowerV440;
    if(!card||!api?.offDayManpower)return;
    const m=api.offDayManpower(date),h=m.helpers||{};
    const scheduled=[...(m.scheduled||[])],groups=rosterGroupCounts(scheduled);
    const helperCount=h.loaded?Number(h.total||0):null;
    const total=scheduled.length+(helperCount==null?0:helperCount);
    const totalText=helperCount==null?`${scheduled.length}+…`:String(total);
    const holidayText=(()=>{try{const d=new Date(`${date}T12:00:00`),w=d.toLocaleDateString('th-TH',{weekday:'long'});return isHolidaySafe(date)?`${w} • ${holidayName(date)||'วันหยุดนักขัตฤกษ์'}`:w;}catch(_){return 'วันหยุด';}})();
    card.classList.add('v460-offday-manpower');
    card.innerHTML=`
      <div class="v440-title-row">
        <div class="v433-manpower-title">กำลังคนตามเวร <small>${esc(holidayText)}</small></div>
        <div class="v440-pills">${h.loaded?`<span class="v440-helper-pill">มาช่วย ${helperCount}</span>`:'<span class="v440-helper-pill muted">มาช่วย …</span>'}</div>
      </div>
      <div class="v440-main-count"><strong>${esc(totalText)}</strong><span>คน</span><small>รวมตารางเวร + คนมาช่วย</small></div>
      <div class="v440-breakdown v460-offday-breakdown">
        <div><span>จัดเวร</span><b>${scheduled.length}</b><small>คน</small></div>
        <div><span>คนมาช่วย</span><b>${helperCount==null?'…':helperCount}</b><small>คน</small></div>
        <div><span>รวม</span><b>${esc(totalText)}</b><small>คน</small></div>
      </div>
      <div class="v440-detail-lines v460-offday-detail">
        <div><b>เวร</b><span>MT ${groups.MT||0} • เคิก ${groups['เคิก']||0} • แพทย์ ${groups['แพทย์']||0}</span></div>
        <div class="v460-helper-detail"><b>คนมาช่วย</b>${helperNamesHtml(h)}</div>
      </div>
      <div class="v440-note">นับคนไม่ซ้ำจากตารางเวร + ผู้ลงชื่อมาช่วย • ไม่รับเวรแสดงแยกด้านล่าง</div>`;
  }

  function noDutyRows(date){
    const effective=r=>{try{return typeof isLeaveEffective==='function'?!!isLeaveEffective(r):!['cancelled','ยกเลิก'].includes(String(r?.status||'').toLowerCase());}catch(_){return true;}};
    const overlap=r=>{try{return typeof overlapsDate==='function'?!!overlapsDate(r,date):(norm(r?.start_date)<=date&&norm(r?.end_date||r?.start_date)>=date);}catch(_){return false;}};
    return (S().leaves||[]).filter(r=>effective(r)&&overlap(r)&&String(r?.type||r?.leave_type||'').split(':::')[0].trim()==='ไม่รับเวร')
      .sort((a,b)=>String(a?.created_at||'').localeCompare(String(b?.created_at||'')));
  }
  function rebuildNoDutyOnly(root,date){
    const sections=[...root.querySelectorAll?.('.card')||[]];
    const card=sections.find(c=>/ลา\s*\/\s*ไม่รับเวร|ไม่รับเวร/.test(String(c.querySelector?.('.section-title h3')?.textContent||'').trim())&&c.querySelector('.section-title'));
    if(!card)return;
    const title=card.querySelector('.section-title h3');if(title)title.textContent='ไม่รับเวร';
    [...card.children].forEach(ch=>{if(!ch.classList?.contains('section-title'))ch.remove();});
    const rows=noDutyRows(date);
    if(!rows.length){card.insertAdjacentHTML('beforeend','<div class="empty-state">ไม่มีคนไม่รับเวรในวันที่เลือก</div>');return;}
    const list=document.createElement('div');list.className='v460-no-duty-list';
    rows.forEach((r,i)=>{
      const seq=Number(r?.no_duty_sequence||r?.leave_sequence||0)||i+1;
      const item=document.createElement('div');item.className='v460-no-duty-row';
      item.innerHTML=`<span class="v460-no-duty-name">${esc(staffName(r.staff_id))}</span><span class="v460-no-duty-seq">ลำดับไม่รับเวร ${seq}</span><span class="v460-no-duty-badge">ไม่รับเวร</span>`;
      list.appendChild(item);
    });
    card.appendChild(list);
  }
  function hideOffdayLeaveStat(root){
    const stats=root.querySelector?.('.v401-dashboard-stats');if(!stats)return;
    const card=[...stats.querySelectorAll(':scope > .stat-card')].find(c=>/^คนลา(?:วันนี้)?$/.test(String(c.querySelector('.label')?.textContent||'').trim()));
    if(card)card.remove();
    stats.classList.add('v460-offday-stats');
  }

  function doctorButton(id,site,time){
    if(!id)return '<span class="v452-not-set">ยังไม่กำหนด</span>';
    return `<button type="button" class="v452-doctor-pill v455-doctor-contact-btn" data-v455-doctor-id="${esc(id)}" data-v455-site="${esc(site)}" data-v455-time="${esc(time)}" aria-label="ดูเบอร์โทร ${esc(staffName(id))}" title="แตะเพื่อดูเบอร์โทรแพทย์">${esc(staffName(id))}</button>`;
  }
  function rebuildOffdayPhysician(root,date){
    if(!isOffDay(date))return;
    const card=root.querySelector?.('[data-v452-physician-card]'),api=window.cnmiPhysicianConsultV452;
    if(!card||!api?.baseForDate||!api?.cache?.loaded)return;
    const m=api.baseForDate(date),id=m?.combined||null,time='24 ชม.',site='Donor & BB';
    const ready=card.querySelector('.v452-ready');
    if(ready){ready.textContent=`พร้อม ${id?1:0}/1`;ready.classList.toggle('is-complete',!!id);}
    const tbody=card.querySelector('.v452-dashboard-table tbody');
    if(tbody)tbody.innerHTML=`<tr><td>${esc(time)}</td><td><b>${esc(site)}</b></td><td>${doctorButton(id,site,time)}</td></tr>`;
    let list=card.querySelector('.v456-mobile-consult-list');
    if(!list){list=document.createElement('div');list.className='v456-mobile-consult-list';card.appendChild(list);}
    list.innerHTML=`<div class="v456-mobile-consult-row"><div class="v456-mobile-consult-top"><strong class="v456-mobile-consult-site">${esc(site)}</strong><span class="v456-mobile-consult-time">${esc(time)}</span></div><div class="v456-mobile-consult-doctor"><span class="v456-mobile-doctor-label">แพทย์</span>${id?doctorButton(id,site,time).replace('v455-doctor-contact-btn"','v455-doctor-contact-btn v456-mobile-doctor-button"'):'<span class="v452-not-set v456-mobile-not-set">ยังไม่กำหนด</span>'}</div></div>`;
  }

  function tradeSnapshot(note,key){const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i'));if(!m?.[1])return'';try{return decodeURIComponent(m[1]);}catch(_){return m[1];}}
  function profilePendingRows(){return (S().profileChangeRequests||[]).filter(r=>['pending','รออนุมัติ','รอตรวจ','รอตรวจสอบ',''].includes(String(r?.status||'pending').trim().toLowerCase()));}
  function safeRows(res){return res&&!res.error?(res.data||[]):[];}
  function parseRpcPayload(data){if(!data)return{};if(typeof data==='string'){try{return JSON.parse(data)||{};}catch(_){return{};}}return data||{};}
  function currentMonthBangkok(){try{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date()),m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}`;}catch(_){return monthOf(selectedDate());}}

  async function loadHelperCancelRequests(db){
    const months=Array.from({length:4},(_,i)=>addMonths(currentMonthBangkok(),i));
    const rows=[];
    for(const month of months){
      try{
        const res=await db.rpc('get_donor_helper_month_internal_v327',{p_month:month});
        if(res?.error)continue;
        const payload=parseRpcPayload(res.data),items=Array.isArray(payload?.rows)?payload.rows:[];
        items.filter(r=>String(r?.status||'').toLowerCase()==='cancel_requested').forEach(r=>rows.push({...r,_v460_month:month}));
      }catch(_){ }
    }
    const seen=new Set();return rows.filter(r=>{const k=String(r?.id||'');if(!k||seen.has(k))return false;seen.add(k);return true;});
  }

  async function loadAdminPending(force=false){
    if(!actualAdmin())return [];
    if(pendingCache.status==='loading'&&!force)return pendingCache.promise;
    if(pendingCache.status==='loaded'&&!force&&Date.now()-pendingCache.loadedAt<120000)return pendingCache.categories;
    const db=DB();if(!db)return[];
    pendingCache.status='loading';pendingCache.error='';
    const promise=(async()=>{
      try{
        const [tradesRes,otRes,leaveRes,profileRes,hrRes,helperCancels]=await Promise.all([
          db.from('roster_trade_requests').select('*').eq('status','confirmed').order('created_at',{ascending:false}).limit(200),
          db.from('ot_requests').select('*').in('status',['รออนุมัติ','pending']).order('work_date',{ascending:true}).limit(200),
          db.from('leave_requests').select('*').in('status',['รออนุมัติยกเลิก','cancel_requested','pending_cancel','pending_cancellation']).order('start_date',{ascending:true}).limit(200),
          db.from('profile_change_requests').select('*').order('created_at',{ascending:false}).limit(200),
          db.from('hr_checks').select('*').order('updated_at',{ascending:false}).limit(500),
          loadHelperCancelRequests(db)
        ]);
        const trades=safeRows(tradesRes),ots=safeRows(otRes),leaveCancels=safeRows(leaveRes),hrRows=safeRows(hrRes);
        let profileRows=safeRows(profileRes);
        if(!profileRows.length&&profileRes?.error){
          const sid=S()?.profile?.id||null,email=S()?.profile?.email||S()?.session?.user?.email||null,uid=S()?.session?.user?.id||null;
          for(const fn of ['list_profile_change_requests_v57','list_profile_change_requests_v56','list_profile_change_requests_v52']){
            try{const q=await db.rpc(fn,{p_staff_id:sid,p_user_email:email,p_user_id:uid,p_is_admin:true});if(!q?.error&&Array.isArray(q?.data)&&q.data.length){profileRows=q.data;break;}}catch(_){ }
          }
        }
        if(profileRows.length)S().profileChangeRequests=profileRows;
        if(hrRows.length)S().hrChecks=hrRows;
        const assignmentIds=[...new Set(trades.map(r=>String(r?.from_assignment_id||'')).filter(Boolean))];
        let assignments=[];
        if(assignmentIds.length){
          for(let i=0;i<assignmentIds.length;i+=80){
            const q=await db.from('roster_assignments').select('id,duty_date,duty_code,staff_id').in('id',assignmentIds.slice(i,i+80));
            if(!q.error)assignments.push(...(q.data||[]));
          }
        }
        mergeRows('tradeRequests',trades);mergeRows('otRequests',ots);mergeRows('leaves',leaveCancels);mergeRows('rosterAssignments',assignments);
        const amap=new Map(assignments.map(a=>[String(a.id),a]));
        const tradeItems=trades.map(r=>{
          const a=amap.get(String(r.from_assignment_id||''))||{};
          const date=norm(a.duty_date)||norm(tradeSnapshot(r.note,'SELL_DATE'));
          const duty=a.duty_code||tradeSnapshot(r.note,'SELL_DUTY')||'เวร';
          return {id:r.id,page:'tradeRequests',month:monthOf(date),date,title:`${staffName(r.requester_id)} → ${staffName(r.receiver_id)}`,detail:`${date?thaiDate(date):'ไม่พบวันที่'} · ${duty}`};
        });
        const otItems=ots.map(r=>({id:r.id,page:'ot',month:monthOf(r.work_date),date:norm(r.work_date),title:staffName(r.staff_id),detail:`${thaiDate(norm(r.work_date))} · ${String(r.reason||'OT').trim()||'OT'}`}));
        const leaveItems=leaveCancels.map(r=>({id:r.id,page:'leave',month:monthOf(r.start_date),date:norm(r.start_date),title:staffName(r.staff_id),detail:`${String(r.type||r.leave_type||'ลา').split(':::')[0]} · ${thaiDate(norm(r.start_date))}${norm(r.end_date)&&norm(r.end_date)!==norm(r.start_date)?`–${thaiDate(norm(r.end_date))}`:''}`}));
        const profileItems=(profileRows.length?profileRows:profilePendingRows()).filter(r=>['pending','รออนุมัติ','รอตรวจ','รอตรวจสอบ',''].includes(String(r?.status||'pending').trim().toLowerCase())).map(r=>{const who=staffById(r.staff_id);return{id:r.id,page:'profileRequests',month:'',date:norm(r.created_at),title:who?(who.nickname||who.full_name||'-'):String(r.staff_nickname||r.staff_full_name||r.staff_email||'เจ้าหน้าที่'),detail:`ขอแก้ ${String(r.field_name||'ข้อมูลส่วนตัว')} · ${thaiDateTime(r.created_at)}`};});
        const helperItems=(helperCancels||[]).map(r=>({id:r.id,page:'donorHelpers',month:r._v460_month||monthOf(r.work_date),date:norm(r.work_date),title:helperName(r),detail:`${thaiDate(norm(r.work_date))} · ขอยกเลิกมาช่วย`}));
        let hrItems=[];
        try{
          const api=window.cnmiHrSummaryV437;
          if(api?.pendingRows){hrItems=api.pendingRows().map(r=>({id:r.id,page:'hr',month:monthOf(r.start_date),date:norm(r.start_date),title:staffName(r.staff_id),detail:`${String(r.type||r.leave_type||'ลา').split(':::')[0]} · ${api.pendingStatus?.(r)?.label||'รอตรวจ HR'}`}));}
        }catch(_){ }
        pendingCache.categories=[
          {key:'trade',label:'ขายเวร รอ Admin บันทึก',tone:'purple',items:tradeItems},
          {key:'ot',label:'OT รออนุมัติ',tone:'blue',items:otItems},
          {key:'leaveCancel',label:'ยกเลิกลา รออนุมัติ',tone:'orange',items:leaveItems},
          {key:'profile',label:'แก้ไขข้อมูลส่วนตัว',tone:'teal',items:profileItems},
          {key:'helper',label:'ยกเลิกคนมาช่วย',tone:'red',items:helperItems},
          {key:'hr',label:'ตรวจ HR',tone:'gray',items:hrItems}
        ].filter(c=>c.items.length);
        pendingCache.status='loaded';pendingCache.loadedAt=Date.now();
        return pendingCache.categories;
      }catch(err){
        pendingCache.status='error';pendingCache.error=String(err?.message||err||'โหลดรายการไม่สำเร็จ');console.warn('[V460] pending center',err);return[];
      }finally{
        pendingCache.promise=null;
        try{if(String(S().page||'')==='dashboard'&&typeof renderPage==='function')renderPage();}catch(_){ }
      }
    })();
    pendingCache.promise=promise;return promise;
  }

  function adminPendingPanel(){
    if(!actualAdmin())return'';
    if(pendingCache.status==='idle'){setTimeout(()=>loadAdminPending(false),0);return `<section class="card v460-admin-pending" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>กำลังตรวจรายการที่ต้องกดอนุมัติ/บันทึก…</p></div><span class="v460-admin-total is-loading">…</span></div></section>`;}
    if(pendingCache.status==='loading')return `<section class="card v460-admin-pending" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>กำลังรวมรายการจากทุกเดือน</p></div><span class="v460-admin-total is-loading">…</span></div></section>`;
    if(pendingCache.status==='error')return `<section class="card v460-admin-pending" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p class="v460-admin-error">${esc(pendingCache.error)}</p></div><button type="button" class="ghost-btn" data-v460-refresh-pending>ลองใหม่</button></div></section>`;
    const cats=pendingCache.categories||[],total=cats.reduce((n,c)=>n+c.items.length,0);
    if(!total)return `<section class="card v460-admin-pending is-clear" data-v460-admin-pending><div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>ตอนนี้ไม่มีรายการค้างที่ต้องกดอนุมัติหรือบันทึก</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total is-clear">0</span><button type="button" class="v460-refresh-icon" data-v460-refresh-pending title="รีเฟรช">↻</button></div></div></section>`;
    return `<section class="card v460-admin-pending" data-v460-admin-pending>
      <div class="v460-admin-pending-head"><div><h3>รอดำเนินการ Admin</h3><p>รวมทุกเดือนแล้ว ไม่ต้องไล่เปลี่ยนเดือนทีละเมนู</p></div><div class="v460-admin-head-actions"><span class="v460-admin-total">${total}</span><button type="button" class="v460-refresh-icon" data-v460-refresh-pending title="รีเฟรช">↻</button></div></div>
      <div class="v460-admin-categories">${cats.map(c=>`<div class="v460-admin-category tone-${esc(c.tone)}"><div class="v460-admin-category-head"><b>${esc(c.label)}</b><span>${c.items.length}</span></div><div class="v460-admin-items">${c.items.slice(0,6).map(item=>`<button type="button" class="v460-admin-item" data-v460-open-page="${esc(item.page)}" data-v460-open-month="${esc(item.month||'')}" data-v460-open-date="${esc(item.date||'')}"><span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span><em>เปิด ›</em></button>`).join('')}${c.items.length>6?`<div class="v460-admin-more">และอีก ${c.items.length-6} รายการ</div>`:''}</div></div>`).join('')}</div>
    </section>`;
  }

  function injectAdminPending(root){
    if(!actualAdmin()||root.querySelector('[data-v460-admin-pending]'))return;
    const html=adminPendingPanel();if(!html)return;
    const t=document.createElement('template');t.innerHTML=html.trim();
    const nav=root.querySelector('[data-v443-dashboard-date-nav]');
    if(nav)nav.insertAdjacentElement('afterend',t.content.firstElementChild);
    else root.insertBefore(t.content.firstElementChild,root.firstChild);
  }

  function mutateDashboard(html){
    try{
      const date=selectedDate(),tpl=document.createElement('template');tpl.innerHTML=String(html||'');const root=tpl.content;
      if(isOffDay(date)){
        hideOffdayLeaveStat(root);
        rebuildOffdayManpower(root,date);
        rebuildNoDutyOnly(root,date);
        rebuildOffdayPhysician(root,date);
      }
      injectAdminPending(root);
      const out=document.createElement('div');out.appendChild(root.cloneNode(true));return out.innerHTML;
    }catch(err){console.warn('[V460] dashboard mutation',err);return html;}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrapped=function renderDashboardV460(){return mutateDashboard(oldDashboard.apply(this,arguments));};
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  function openPendingTarget(button){
    const st=S(),page=button.getAttribute('data-v460-open-page')||'dashboard',month=button.getAttribute('data-v460-open-month')||'',date=button.getAttribute('data-v460-open-date')||'';
    forceAdminView();
    if(page==='tradeRequests'&&month){st.monthKey=month;st.tradeFilterStaff='';}
    if(page==='ot'&&month){st.otApprovalStatusFilter='รออนุมัติ';st.otApprovalStartDate=`${month}-01`;st.otApprovalEndDate=monthEnd(month);}
    if(page==='donorHelpers'&&month){st.donorHelperMonthV327=month;st.donorHelperLoadedMonthV327='';st.donorHelperErrorV327='';}
    if(page==='hr'&&month){st.hrFilterMonth=month;}
    if(page==='leave'&&month){try{st.leaveFilterMonth=month;}catch(_){ }}
    st.page=page;
    try{if(typeof renderPage==='function')renderPage();}catch(_){ }
    if(page==='donorHelpers'&&month){try{window.cnmiDonorHelperV327?.loadMonth?.(month,{force:true});}catch(_){ }}
    if(date){setTimeout(()=>{try{document.querySelector(`[data-date="${CSS.escape(date)}"]`)?.scrollIntoView({block:'center'});}catch(_){ }},120);}
  }

  document.addEventListener('click',e=>{
    const refresh=e.target?.closest?.('[data-v460-refresh-pending]');
    if(refresh){e.preventDefault();pendingCache.status='idle';loadAdminPending(true);try{if(typeof renderPage==='function')renderPage();}catch(_){}return;}
    const open=e.target?.closest?.('[data-v460-open-page]');
    if(open){e.preventDefault();e.stopPropagation();openPendingTarget(open);}
  },true);

  const style=document.createElement('style');style.id='cnmi-v460-style';style.textContent=`
    .v401-dashboard-stats.v460-offday-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
    .v460-helper-detail{align-items:flex-start!important}.v460-helper-names{display:flex;gap:5px;flex-wrap:wrap;min-width:0}.v460-helper-name{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid #cfe3f0;background:#f2f9fd;border-radius:999px;color:#285a79;line-height:1.15}.v460-helper-name b{min-width:0!important;font-size:10px}.v460-helper-name small{font-size:8px!important;color:#71899a!important}.v460-helper-loading,.v460-helper-empty{color:#7b8fa2}.v460-helper-error{color:#b45309}
    .v460-no-duty-list{display:grid;gap:8px}.v460-no-duty-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 12px;border:1px solid #e1e9f1;border-radius:12px;background:#fbfdff}.v460-no-duty-name{font-weight:900;color:#263d52;font-size:14px}.v460-no-duty-seq,.v460-no-duty-badge{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:850}.v460-no-duty-seq{border:1px solid #c8d9e6;color:#537087;background:#fff}.v460-no-duty-badge{background:#eef1f4;color:#4d5d6b}
    .v460-admin-pending{margin:0 0 14px;border:1px solid #f2d5a8;background:linear-gradient(180deg,#fffdf8,#fff);box-shadow:0 6px 18px rgba(99,72,29,.05)}.v460-admin-pending.is-clear{border-color:#cde8d6;background:linear-gradient(180deg,#fbfffc,#fff)}.v460-admin-pending-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v460-admin-pending-head h3{margin:0;color:#2b4052;font-size:17px}.v460-admin-pending-head p{margin:4px 0 0;color:#718397;font-size:11px}.v460-admin-head-actions{display:flex;align-items:center;gap:6px}.v460-admin-total{display:grid;place-items:center;min-width:36px;height:36px;padding:0 9px;border-radius:999px;background:#fff0d8;color:#a45a00;font-size:17px;font-weight:950;border:1px solid #ffd49a}.v460-admin-total.is-clear{background:#eaf8ef;border-color:#bee5ca;color:#197342}.v460-admin-total.is-loading{color:#73899b;background:#f2f6f9;border-color:#dce6ed}.v460-refresh-icon{width:32px;height:32px;border:1px solid #dae5ed;border-radius:50%;background:#fff;color:#57758b;font:inherit;font-weight:900;cursor:pointer}.v460-admin-error{color:#b42318!important}.v460-admin-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.v460-admin-category{border:1px solid #e3eaf0;border-radius:13px;overflow:hidden;background:#fff}.v460-admin-category-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#f8fafc}.v460-admin-category-head b{font-size:12px;color:#344d61}.v460-admin-category-head span{min-width:24px;height:24px;padding:0 6px;border-radius:999px;display:grid;place-items:center;font-size:10px;font-weight:900;background:#eef3f7;color:#5c7285}.v460-admin-items{display:grid}.v460-admin-item{appearance:none;border:0;border-top:1px solid #edf1f4;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:9px 10px;cursor:pointer;color:inherit;font:inherit}.v460-admin-item:hover{background:#f8fbfd}.v460-admin-item>span{display:grid;gap:2px;min-width:0}.v460-admin-item b{font-size:11px;color:#294257;overflow-wrap:anywhere}.v460-admin-item small{font-size:9px;color:#778a9b;line-height:1.35}.v460-admin-item em{font-size:9px;font-style:normal;font-weight:850;color:#2677a8;white-space:nowrap}.v460-admin-more{padding:7px 10px;border-top:1px solid #edf1f4;color:#7c8f9e;font-size:9px}.tone-purple .v460-admin-category-head{background:#faf7ff}.tone-purple .v460-admin-category-head span{background:#eee6ff;color:#6541a5}.tone-blue .v460-admin-category-head{background:#f2f9ff}.tone-blue .v460-admin-category-head span{background:#e2f2ff;color:#2472a5}.tone-orange .v460-admin-category-head{background:#fff8ef}.tone-orange .v460-admin-category-head span{background:#ffedd5;color:#a85a00}.tone-teal .v460-admin-category-head{background:#f1fbf9}.tone-teal .v460-admin-category-head span{background:#dff5ef;color:#267562}.tone-red .v460-admin-category-head{background:#fff6f5}.tone-red .v460-admin-category-head span{background:#ffe4e1;color:#b33e32}
    @media(max-width:820px){.v401-dashboard-stats.v460-offday-stats{grid-template-columns:1fr}.v460-helper-name{padding:5px 8px}.v460-helper-name b{font-size:12px}.v460-helper-name small{font-size:9px!important}.v460-no-duty-row{padding:11px 12px}.v460-no-duty-name{font-size:16px}.v460-no-duty-seq,.v460-no-duty-badge{font-size:11px;padding:4px 8px}.v460-admin-pending{margin-bottom:13px}.v460-admin-pending-head h3{font-size:18px}.v460-admin-pending-head p{font-size:12px;line-height:1.4}.v460-admin-categories{grid-template-columns:1fr;gap:8px}.v460-admin-category-head{padding:10px 11px}.v460-admin-category-head b{font-size:14px}.v460-admin-item{padding:11px}.v460-admin-item b{font-size:13px}.v460-admin-item small{font-size:11px}.v460-admin-item em{font-size:11px}.v460-admin-more{font-size:11px}.v460-offday-detail{font-size:12px!important}}
  `;document.head.appendChild(style);

  window.cnmiV460={version:VERSION,pendingCache,loadAdminPending,mutateDashboard};
  console.info(`${VERSION} loaded`);
})();
