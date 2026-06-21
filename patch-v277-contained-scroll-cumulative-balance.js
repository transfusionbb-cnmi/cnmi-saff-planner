/* CNMI Staff Planner V277
   Contained table scrolling + cumulative roster balance
   - Keep horizontal scrolling inside the monthly tables
   - Freeze position columns 1-2 and roster column 1
   - Move balance reset from Users page to Admin monthly roster summary
   - Add carry-in and cumulative duty balance from previous months
*/
(function(){
  'use strict';
  const VERSION = 'V277_CONTAINED_SCROLL_CUMULATIVE_BALANCE';
  if (window.__CNMI_V277_CONTAINED_SCROLL_CUMULATIVE_BALANCE__) return;
  window.__CNMI_V277_CONTAINED_SCROLL_CUMULATIVE_BALANCE__ = true;

  const fiscalAssignmentCache = new Map();
  const fiscalAssignmentLoading = new Map();
  let cleanupQueued = false;
  let rendering = false;

  function S(){ try { return state || window.state || null; } catch (_) { return window.state || null; } }
  function DB(){ try { return sb || window.sb || null; } catch (_) { return window.sb || null; } }
  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function normId(v){ return String(v == null ? '' : v); }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0,10); }
  }
  function explicitFalse(v){ return v===false || ['false','0','no','off','ปิด'].includes(String(v??'').trim().toLowerCase()); }
  function isAdminSafe(){
    try { return !!isAdmin(); }
    catch (_) { return String(S()?.profile?.role || '').toLowerCase()==='admin'; }
  }
  function toast(message,tone){
    try { showToast(message,tone ? {tone} : undefined); }
    catch (_) { console.info(message); }
  }
  function friendly(error){
    try { return friendlyDbError(error); }
    catch (_) { return error?.message || error?.details || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function staffName(person){ return person?.nickname || person?.full_name || person?.email || '-'; }
  function staffColorSafe(person){ try { return staffColor(person); } catch (_) { return person?.staff_color || person?.color || '#e2e8f0'; } }
  function textColorSafe(color){ try { return textColorFor(color); } catch (_) { return '#0f172a'; } }
  function ordered(rows){ try { return orderedStaff(rows); } catch (_) { return rows.slice().sort((a,b)=>staffName(a).localeCompare(staffName(b),'th')); } }
  function isLongLeave(person){
    try { return isLongTermLeaveStaff(person); }
    catch (_) { return person?.is_long_term_leave===true || person?.maternity_status===true; }
  }
  function isRosterEnabled(person){
    if (!person) return false;
    const active = Object.prototype.hasOwnProperty.call(person,'is_active') ? person.is_active : person.active;
    if (explicitFalse(active) || active == null) return false;
    if (String(person.staff_type||'').trim()==='แพทย์') return false;
    if (person.maternity_status) return false;
    const value = person.roster_enabled ?? person.duty_enabled ?? person.can_roster ?? person.is_roster_enabled ?? person.schedule_enabled ?? person.is_schedule_enabled ?? person['สถานะจัดเวร'];
    return !explicitFalse(value);
  }
  function rosterStaff(){ return ordered((S()?.staff || []).filter(isRosterEnabled)); }
  function groupLabel(person){ return String(person?.staff_type || '').trim()==='เคิก' ? 'เคิก' : 'MT'; }
  function monthKeySafe(key){ return /^\d{4}-\d{2}$/.test(String(key||'')) ? String(key) : new Date().toISOString().slice(0,7); }
  function nextMonth(key){
    const y=Number(key.slice(0,4)),m=Number(key.slice(5,7));
    const d=new Date(y,m,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function prevMonth(key){
    const y=Number(key.slice(0,4)),m=Number(key.slice(5,7));
    const d=new Date(y,m-2,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function monthEnd(key){
    const y=Number(key.slice(0,4)),m=Number(key.slice(5,7));
    return `${key}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
  }
  function fiscalBounds(key){
    const safe=monthKeySafe(key),y=Number(safe.slice(0,4)),m=Number(safe.slice(5,7));
    const startYear=m>=10?y:y-1;
    return { start:`${startYear}-10-01`, end:monthEnd(safe), startKey:`${startYear}-10`, selectedKey:safe, cacheKey:`${startYear}-10_${safe}` };
  }
  function monthsBetween(startKey,endKey){
    const out=[]; let cur=startKey; let guard=0;
    while(cur<=endKey && guard<36){ out.push(cur); cur=nextMonth(cur); guard++; }
    return out;
  }
  function resetMonth(person){
    const raw=person?.balance_reset_at;
    return raw ? normDate(raw).slice(0,7) : '';
  }
  function dutyStats(assignments){
    try { return typeof calcFairness==='function' ? (calcFairness((assignments||[]).filter(a=>a?.staff_id)) || {}) : {}; }
    catch (_) {
      const map={};
      (assignments||[]).forEach(a=>{
        if(!a?.staff_id)return;
        const id=normId(a.staff_id); map[id]=map[id]||{total:0,units:0,hours:0,pay:0};
        map[id].total++; map[id].units++; map[id].hours+=8;
      });
      return map;
    }
  }
  function dutyCounts(assignments,staffId){
    const rows=(assignments||[]).filter(a=>normId(a?.staff_id)===normId(staffId));
    const count=fn=>rows.filter(fn).length;
    return {
      total:rows.length,
      chbd1:count(a=>a.duty_code==='ชบด1'),
      chbd2:count(a=>a.duty_code==='ชบด2'),
      chbd3:count(a=>a.duty_code==='ชบด3'),
      ch3a:count(a=>a.duty_code==='ช3A'),
      ch3b:count(a=>a.duty_code==='ช3B'),
      ch4:count(a=>a.duty_code==='ช4A'||a.duty_code==='ช4B'),
      ch9:count(a=>String(a.duty_code||'').startsWith('ช9'))
    };
  }
  function daysOff(staffId,key,assignments){
    try { return Number(calculateDaysOff(staffId,key,assignments)||0); }
    catch (_) { return 0; }
  }
  function assignmentRowsForFiscal(key){
    const b=fiscalBounds(key);
    if(fiscalAssignmentCache.has(b.cacheKey)) return fiscalAssignmentCache.get(b.cacheKey);
    const rows=(S()?.rosterAssignments||[]).filter(a=>{
      const d=normDate(a?.duty_date); return d>=b.start&&d<=b.end&&a?.staff_id;
    });
    ensureFiscalAssignments(key);
    return rows;
  }
  async function ensureFiscalAssignments(key){
    const b=fiscalBounds(key);
    if(fiscalAssignmentCache.has(b.cacheKey)) return fiscalAssignmentCache.get(b.cacheKey);
    if(fiscalAssignmentLoading.has(b.cacheKey)) return fiscalAssignmentLoading.get(b.cacheKey);
    const client=DB();
    if(!client) return [];
    const task=(async()=>{
      try{
        const res=await client.from('roster_assignments').select('*').gte('duty_date',b.start).lte('duty_date',b.end).order('duty_date');
        if(res.error) throw res.error;
        const rows=res.data||[];
        fiscalAssignmentCache.set(b.cacheKey,rows);
        if(S()){
          const outside=(S().rosterAssignments||[]).filter(a=>{const d=normDate(a?.duty_date);return d<b.start||d>b.end;});
          S().rosterAssignments=outside.concat(rows);
        }
        setTimeout(()=>{ try { window.renderPage?.(); } catch (_) {} },0);
        return rows;
      }catch(error){
        console.warn(`${VERSION}: fiscal assignments`,error);
        return [];
      }finally{ fiscalAssignmentLoading.delete(b.cacheKey); }
    })();
    fiscalAssignmentLoading.set(b.cacheKey,task);
    return task;
  }
  function cumulativeBalance(key,currentAssignments){
    const safe=monthKeySafe(key),b=fiscalBounds(safe),staff=rosterStaff(),fiscalRows=assignmentRowsForFiscal(safe);
    const months=monthsBetween(b.startKey,safe);
    const monthly=new Map();
    months.forEach(month=>{
      const rows=month===safe ? (currentAssignments||[]) : fiscalRows.filter(a=>normDate(a?.duty_date).startsWith(month));
      const stats=dutyStats(rows);
      const groups={MT:[],เคิก:[]};
      staff.forEach(person=>{
        const rMonth=resetMonth(person);
        if(isLongLeave(person)) return;
        if(rMonth && month<rMonth) return;
        groups[groupLabel(person)].push(person);
      });
      const avgs={};
      Object.entries(groups).forEach(([label,people])=>{
        const values=people.map(person=>Number(stats[normId(person.id)]?.units||0));
        avgs[label]=values.length?values.reduce((a,c)=>a+c,0)/values.length:0;
      });
      monthly.set(month,{rows,stats,avgs});
    });
    const current=monthly.get(safe)||{rows:currentAssignments||[],stats:{},avgs:{MT:0,เคิก:0}};
    const result=new Map();
    staff.forEach(person=>{
      const id=normId(person.id),rMonth=resetMonth(person),start=(rMonth&&rMonth>b.startKey)?rMonth:b.startKey;
      let carry=0;
      months.filter(m=>m<safe&&m>=start).forEach(month=>{
        const pack=monthly.get(month),units=Number(pack?.stats?.[id]?.units||0),avg=Number(pack?.avgs?.[groupLabel(person)]||0);
        carry += units-avg;
      });
      const units=Number(current.stats?.[id]?.units||0),hours=Number(current.stats?.[id]?.hours||0),pay=Number(current.stats?.[id]?.pay||0),avg=Number(current.avgs?.[groupLabel(person)]||0);
      const gap=isLongLeave(person)?0:units-avg;
      const cumulative=isLongLeave(person)?0:carry+gap;
      result.set(id,{person,units,hours,pay,avg,gap,carry,cumulative,resetMonth:rMonth,counts:dutyCounts(current.rows,id),daysOff:daysOff(id,safe,current.rows)});
    });
    return {rows:[...result.values()],monthly,current,bounds:b};
  }
  function badgeHtml(text,tone){
    try { return badge(text,tone); }
    catch (_) { return `<span class="badge ${esc(tone||'')}">${esc(text)}</span>`; }
  }
  function staffPillHtml(person){
    try { return staffPill(person); }
    catch (_) {
      const bg=staffColorSafe(person),fg=textColorSafe(bg);
      return `<span class="v277-staff-pill" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}">${esc(staffName(person))}</span>`;
    }
  }
  function fmt(n){ const x=Number(n||0); return Math.abs(x)<0.05?'0.0':x.toFixed(1); }
  function statusFor(row,key){
    if(isLongLeave(row.person)) return {text:'ลาระยะยาว / ไม่คิดหนี้เวร',tone:'black'};
    if(row.resetMonth===key && Math.abs(row.cumulative)<=0.5) return {text:'เริ่มนับใหม่เดือนนี้',tone:'blue'};
    if(Math.abs(row.cumulative)<=0.5) return {text:'สมดุลสะสม',tone:'green'};
    return row.cumulative>0 ? {text:'เวรสะสมมากกว่าเฉลี่ย',tone:'orange'} : {text:'เวรสะสมน้อยกว่าเฉลี่ย',tone:'blue'};
  }
  function renderEnhancedBalance(staffList,assignments,key){
    const safe=monthKeySafe(key||S()?.monthKey),calc=cumulativeBalance(safe,assignments||[]);
    const groups=['MT','เคิก'].map(label=>({label,rows:calc.rows.filter(r=>groupLabel(r.person)===label)})).filter(g=>g.rows.length);
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v277-cumulative-dashboard">
      <div class="notice soft-notice"><b>การอ่านค่า:</b> Quota Gap = ส่วนต่างของเดือนนี้ • OT Balance ยกมา = ผลสะสมก่อนเข้าเดือนนี้ • เวรสะสม = OT Balance ยกมา + Quota Gap เดือนนี้ ค่าบวกหมายถึงเคยได้มากกว่าค่าเฉลี่ย ค่าลบหมายถึงเคยได้น้อยกว่าค่าเฉลี่ย</div>
      ${groups.map(group=>{
        const avg=Number(calc.current?.avgs?.[group.label]||0);
        return `<section class="balance-group-section"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยเดือนนี้ ${Number(avg||0).toFixed(1)} หน่วยเวร`,'blue')}</span></div>
          <div class="table-wrap v277-balance-table-wrap"><table class="clean-balance-table v277-balance-table"><thead><tr>
            <th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th>OT Balance ยกมา</th><th>เวรสะสม</th><th>วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th><th>จัดการ</th>
          </tr></thead><tbody>${group.rows.map(row=>{
            const status=statusFor(row,safe),isReset=row.resetMonth===safe;
            return `<tr class="${isLongLeave(row.person)?'v277-exempt-row':''}"><td>${staffPillHtml(row.person)}</td><td>${row.counts.total}</td><td>${row.units.toFixed(1)}</td><td>${row.hours.toFixed(1)}</td><td>${Math.round(row.pay).toLocaleString()}</td><td class="${row.gap>0.5?'v277-positive':row.gap<-0.5?'v277-negative':''}">${fmt(row.gap)}</td><td class="${row.carry>0.5?'v277-positive':row.carry<-0.5?'v277-negative':''}">${fmt(row.carry)}</td><td class="v277-cumulative ${row.cumulative>0.5?'v277-positive':row.cumulative<-0.5?'v277-negative':''}">${fmt(row.cumulative)}</td><td>${row.daysOff}</td><td>${row.counts.chbd1}</td><td>${row.counts.chbd2}</td><td>${row.counts.chbd3}</td><td>${row.counts.ch3a}</td><td>${row.counts.ch3b}</td><td>${row.counts.ch4}</td><td>${row.counts.ch9}</td><td>${badgeHtml(status.text,status.tone)}${row.resetMonth?`<small class="v277-reset-note">เริ่มนับใหม่ ${esc(row.resetMonth)}</small>`:''}</td><td><button type="button" class="tiny-btn ${isReset?'danger':'warning'}" data-v277-balance-reset="${esc(row.person.id)}" data-v277-month="${esc(safe)}" data-v277-action="${isReset?'undo':'reset'}">${isReset?'ยกเลิกรีเซ็ตเดือนนี้':'เริ่มนับใหม่เดือนนี้'}</button></td></tr>`;
          }).join('')}</tbody></table></div></section>`;
      }).join('')}
    </div>`;
  }

  const previousBalance=window.renderBalanceDashboard || (typeof renderBalanceDashboard==='function'?renderBalanceDashboard:null);
  if(previousBalance){
    const enhanced=function renderBalanceDashboardV277(staffList,assignments,key){
      if(isAdminSafe() && S()?.page==='scheduler') return renderEnhancedBalance(staffList,assignments,key);
      return previousBalance.apply(this,arguments);
    };
    window.renderBalanceDashboard=enhanced;
    try { renderBalanceDashboard=enhanced; } catch (_) {}
  }

  async function setResetMonth(staffId,key,action){
    const person=(S()?.staff||[]).find(p=>normId(p.id)===normId(staffId));
    if(!person||!DB()) return;
    const reset=action!=='undo';
    const message=reset
      ? `ยืนยันเริ่มนับยอดสะสมของ ${staffName(person)} ใหม่ตั้งแต่เดือน ${key} หรือไม่?\nยอดก่อนเดือนนี้จะไม่นำมาคิด แต่เวรที่จัดในเดือนนี้ยังคำนวณตามปกติ`
      : `ยืนยันยกเลิกการเริ่มนับใหม่ของ ${staffName(person)} ในเดือน ${key} หรือไม่?\nระบบจะนำยอดตั้งแต่ต้นปีงบประมาณกลับมาคำนวณ`;
    if(!window.confirm(message)) return;
    try{
      try { setBusy?.(true,'กำลังบันทึกยอดสะสม'); } catch (_) {}
      const rpc=await DB().rpc('set_staff_balance_reset_month_v277',{p_staff_id:staffId,p_month_key:key,p_reset:reset});
      if(rpc.error) throw rpc.error;
      person.balance_reset_at=reset?`${key}-01T00:00:00.000Z`:null;
      person.carry_over_balance=0; person.overtime_balance=0; person.ot_balance=0;
      toast(reset?'ตั้งให้เริ่มนับยอดสะสมใหม่ในเดือนนี้แล้ว':'ยกเลิกการเริ่มนับใหม่แล้ว');
      try { window.renderPage?.(); } catch (_) {}
    }catch(error){
      toast(`บันทึกไม่สำเร็จ: ${friendly(error)} — กรุณารัน SQL V277 ก่อน`,'error');
    }finally{ try { setBusy?.(false); } catch (_) {} }
  }

  function removeLegacyResetControls(){
    document.querySelectorAll('.long-leave-admin-actions').forEach(el=>el.remove());
    document.querySelectorAll('[data-v140-reset-balance]').forEach(btn=>{
      const wrap=btn.closest('[data-v140-long-leave-wrap]');
      if(wrap){
        btn.remove();
        wrap.querySelectorAll('small').forEach(s=>{ if(/รีเซ็ตยอดสะสม|พนักงานใหม่|กลับมาทำงาน/.test(s.textContent||'')) s.remove(); });
      }else btn.remove();
    });
  }

  function syncContainedScroll(){
    const page=S()?.page||'';
    const relevant=['positionMonth','positionMonthView','scheduler'].includes(page);
    document.body.classList.toggle('v277-contained-table-page',relevant);
    document.body.classList.toggle('v277-position-page',page==='positionMonth'||page==='positionMonthView');
    document.body.classList.toggle('v277-roster-page',page==='scheduler');
    const root=document.getElementById('pageContent');
    if(root) root.classList.toggle('v277-contained-page-content',relevant);
    document.querySelectorAll('.v275-position-wrap,.v275-roster-wrap').forEach(wrap=>{
      wrap.classList.add('v277-table-scroller');
      wrap.setAttribute('tabindex','0');
      wrap.setAttribute('role','region');
      wrap.setAttribute('aria-label',wrap.classList.contains('v275-roster-wrap')?'ตารางจัดเวรรายเดือน เลื่อนซ้ายขวาภายในตาราง':'ตารางตำแหน่งกลางวันรายเดือน เลื่อนซ้ายขวาภายในตาราง');
      if(wrap.classList.contains('v275-position-wrap')){
        const first=wrap.querySelector('.v275-position-table tr > :first-child');
        const width=Math.max(76,Math.ceil(first?.getBoundingClientRect?.().width||first?.offsetWidth||88));
        wrap.style.setProperty('--v277-first-col-width',`${width}px`);
      }
    });
    removeLegacyResetControls();
  }
  function queueSync(){
    if(cleanupQueued)return; cleanupQueued=true;
    requestAnimationFrame(()=>{cleanupQueued=false;syncContainedScroll();});
  }

  const previousRender=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(previousRender){
    const wrapped=function renderPageV277(){
      if(rendering) return previousRender.apply(this,arguments);
      rendering=true; let ret;
      try { ret=previousRender.apply(this,arguments); }
      finally { rendering=false; }
      setTimeout(syncContainedScroll,0);
      setTimeout(syncContainedScroll,80);
      return ret;
    };
    window.renderPage=wrapped;
    try { renderPage=wrapped; } catch (_) {}
  }

  document.addEventListener('click',event=>{
    const btn=event.target?.closest?.('[data-v277-balance-reset]');
    if(!btn)return;
    event.preventDefault(); event.stopImmediatePropagation();
    setResetMonth(btn.dataset.v277BalanceReset,btn.dataset.v277Month,btn.dataset.v277Action);
  },true);

  const style=document.createElement('style');
  style.id='v277-contained-scroll-cumulative-balance-style';
  style.textContent=`
    /* Remove the old reset control from Users and rights. Reset now belongs to the monthly roster summary. */
    .long-leave-admin-actions,[data-v140-reset-balance]{display:none!important}

    /* Do not let the matrix widen the whole page. Horizontal movement belongs to the table scroller. */
    body.v277-contained-table-page{overflow-x:hidden!important}
    body.v277-contained-table-page .app-view,
    body.v277-contained-table-page .main-panel,
    body.v277-contained-table-page .page-content,
    body.v277-contained-table-page #pageContent,
    body.v277-contained-table-page .v275-page,
    body.v277-contained-table-page .v275-page>.card{min-width:0!important;max-width:100%!important;width:100%!important}
    body.v277-contained-table-page .page-content,
    body.v277-contained-table-page #pageContent,
    body.v277-contained-table-page .v275-page{overflow-x:hidden!important}
    .v277-table-scroller{
      display:block!important;
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
      overflow-x:auto!important;
      overflow-y:auto!important;
      overscroll-behavior-x:contain!important;
      touch-action:pan-x pan-y!important;
      scrollbar-gutter:stable both-edges;
      -webkit-overflow-scrolling:touch;
      position:relative!important;
      isolation:isolate!important;
    }
    .v277-table-scroller>.v275-position-table,
    .v277-table-scroller>.v275-roster-table{
      width:max-content!important;
      min-width:100%!important;
      max-width:none!important;
      margin:0!important;
    }

    /* Position matrix: true sticky columns 1 and 2 inside the table scroller. */
    .v275-position-wrap{--v277-first-col-width:88px}
    .v275-position-table tr>:nth-child(1){
      position:sticky!important;left:0!important;z-index:40!important;
      width:88px!important;min-width:88px!important;max-width:88px!important;
      background-clip:padding-box!important;
    }
    .v275-position-table tr>:nth-child(2){
      position:sticky!important;left:var(--v277-first-col-width)!important;z-index:39!important;
      width:118px!important;min-width:118px!important;max-width:118px!important;
      background:#fff!important;background-clip:padding-box!important;
      box-shadow:4px 0 7px rgba(15,23,42,.15)!important;
    }
    .v275-position-table thead tr>:nth-child(1){z-index:60!important;background:#f8fafc!important;color:#0f172a!important}
    .v275-position-table thead tr>:nth-child(2){z-index:59!important;background:#f8fafc!important;color:#0f172a!important}
    .v275-position-table .v275-count-row>:nth-child(1),
    .v275-position-table .v275-count-row>:nth-child(2){z-index:50!important;background:#fffaf0!important}

    /* Admin roster: true sticky staff column inside its own scroller. */
    .v275-roster-table tr>:first-child{
      position:sticky!important;left:0!important;z-index:42!important;
      width:82px!important;min-width:82px!important;max-width:82px!important;
      background-clip:padding-box!important;box-shadow:4px 0 7px rgba(15,23,42,.15)!important;
    }
    .v275-roster-table thead tr>:first-child{z-index:62!important;background:#f8fafc!important;color:#0f172a!important}

    /* Cumulative balance table. */
    .v277-cumulative-dashboard{display:grid;gap:14px}
    .v277-balance-table-wrap{max-width:100%;overflow:auto}
    .v277-balance-table{min-width:1450px;font-size:11px}
    .v277-balance-table th,.v277-balance-table td{padding:7px 8px;text-align:center;vertical-align:middle;white-space:nowrap}
    .v277-balance-table th:first-child,.v277-balance-table td:first-child{position:sticky;left:0;z-index:3;background:#fff;text-align:left;box-shadow:3px 0 5px rgba(15,23,42,.08)}
    .v277-balance-table thead th:first-child{z-index:5;background:#f6f9fc}
    .v277-positive{color:#b45309;font-weight:900}
    .v277-negative{color:#1d70b7;font-weight:900}
    .v277-cumulative{font-size:12px}
    .v277-reset-note{display:block;margin-top:3px;color:#64748b;font-size:8px}
    .v277-staff-pill{display:inline-flex;border-radius:999px;padding:4px 9px;background:var(--staff-bg);color:var(--staff-fg);font-weight:900}
    .v277-exempt-row{opacity:.72}

    @media(max-width:820px){
      .v275-position-wrap{--v277-first-col-width:76px}
      .v275-position-table tr>:nth-child(1){width:76px!important;min-width:76px!important;max-width:76px!important}
      .v275-position-table tr>:nth-child(2){width:104px!important;min-width:104px!important;max-width:104px!important}
      .v275-roster-table tr>:first-child{width:72px!important;min-width:72px!important;max-width:72px!important}
      .v277-table-scroller{max-height:72dvh!important}
    }
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queueSync);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('resize',queueSync,{passive:true});
  window.addEventListener('orientationchange',queueSync,{passive:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(syncContainedScroll,150));
  setTimeout(syncContainedScroll,0);
  setTimeout(syncContainedScroll,300);

  window.cnmiV277={
    cumulativeBalance,
    ensureFiscalAssignments,
    syncContainedScroll,
    setResetMonth
  };
  console.info(`${VERSION} loaded`);
})();
