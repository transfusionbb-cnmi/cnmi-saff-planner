/* CNMI Staff Planner V278
   Slot-template dropdown + 4 admin position summaries + compact summary popup
   + position-management navigation recovery + separate holiday carry balance reset.
*/
(function(){
  'use strict';
  const VERSION = 'V278_SLOT_STATS_HOLIDAY_BALANCE_NAVIGATION_FIX';
  if (window.__CNMI_V278_SLOT_STATS_HOLIDAY_BALANCE_NAVIGATION_FIX__) return;
  window.__CNMI_V278_SLOT_STATS_HOLIDAY_BALANCE_NAVIGATION_FIX__ = true;

  const lifetimePositionCache = { rows:null, loading:null, error:'' };
  let enhanceQueued = false;
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
  function monthKeySafe(key){ return /^\d{4}-\d{2}$/.test(String(key||'')) ? String(key) : new Date().toISOString().slice(0,7); }
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
    catch (_) { return error?.message || error?.details || error?.hint || String(error || 'เกิดข้อผิดพลาด'); }
  }
  function staffName(personOrId){
    const p=typeof personOrId==='object' ? personOrId : (S()?.staff||[]).find(x=>normId(x.id)===normId(personOrId));
    return p ? (p.nickname || p.full_name || p.email || '-') : '-';
  }
  function staffColorSafe(person){ try { return staffColor(person); } catch (_) { return person?.staff_color || person?.color || '#e2e8f0'; } }
  function textColorSafe(color){ try { return textColorFor(color); } catch (_) { return '#0f172a'; } }
  function staffPillHtml(person){
    try { return staffPill(person); }
    catch (_) { const bg=staffColorSafe(person),fg=textColorSafe(bg);return `<span class="v278-staff-pill" style="--staff-bg:${esc(bg)};--staff-fg:${esc(fg)}">${esc(staffName(person))}</span>`; }
  }
  function badgeHtml(text,tone){
    try { return badge(text,tone); }
    catch (_) { return `<span class="badge ${esc(tone||'')}">${esc(text)}</span>`; }
  }
  function isLongLeave(person){
    try { return !!isLongTermLeaveStaff(person); }
    catch (_) { return person?.is_long_term_leave===true || person?.maternity_status===true; }
  }
  function isActivePerson(person){
    if(!person) return false;
    const active=Object.prototype.hasOwnProperty.call(person,'is_active')?person.is_active:person.active;
    return active != null && !explicitFalse(active);
  }
  function isNormalPositionPerson(person){
    if(!isActivePerson(person) || String(person?.staff_type||'').trim()==='แพทย์' || person?.maternity_status) return false;
    if(explicitFalse(person?.daily_position_enabled)) return false;
    return String(person?.position_training_status||'ใช้งานปกติ').trim()==='ใช้งานปกติ';
  }
  function isRosterEnabled(person){
    if(!isActivePerson(person) || String(person?.staff_type||'').trim()==='แพทย์' || person?.maternity_status) return false;
    const value=person?.roster_enabled ?? person?.duty_enabled ?? person?.can_roster ?? person?.is_roster_enabled ?? person?.schedule_enabled ?? person?.is_schedule_enabled ?? person?.['สถานะจัดเวร'];
    return !explicitFalse(value);
  }
  function ordered(rows){
    try { return orderedStaff(rows); }
    catch (_) { return rows.slice().sort((a,b)=>staffName(a).localeCompare(staffName(b),'th')); }
  }
  function positionStaff(){ return ordered((S()?.staff||[]).filter(isNormalPositionPerson)); }
  function rosterStaff(){ return ordered((S()?.staff||[]).filter(isRosterEnabled)); }
  function groupLabel(person){ return String(person?.staff_type||'').trim()==='เคิก' ? 'เคิก' : 'MT'; }

  /* ------------------------------------------------------------------
     1) Date-specific dropdown options from Position Management templates
     ------------------------------------------------------------------ */
  function slotSetting(date){
    return (S()?.manualDaySlotSettingsV273||[]).find(row=>normDate(row?.work_date)===normDate(date)) || null;
  }
  function targetSlotsForDate(date){
    const input=document.querySelector(`[data-v275-slot][data-date="${CSS.escape(normDate(date))}"]`);
    const raw=input ? input.value : slotSetting(date)?.target_slots;
    const n=Number(raw);
    return Number.isFinite(n) && n>0 ? Math.round(n) : null;
  }
  function isOutingDate(date){
    try { return !!hasOuting(normDate(date)); }
    catch (_) {
      return (S()?.activities||[]).some(a=>String(a?.event_type||'')==='ออกหน่วย' && normDate(a?.start_date)<=normDate(date) && normDate(a?.end_date||a?.start_date)>=normDate(date));
    }
  }
  function activeMasterRows(){
    return (S()?.positionMasters||[]).filter(row=>row && row.is_active!==false && !row.deleted_at && !String(row.code||'').startsWith('__CNMI_SLOT_TEMPLATE'));
  }
  function templateConfigs(){
    try { return window.cnmiV224?.currentConfigs?.() || S()?.slotTemplateV224?.configs || null; }
    catch (_) { return S()?.slotTemplateV224?.configs || null; }
  }
  function normalizeTemplateRows(rows){
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).map((row,index)=>({
      code:String(row?.code||row?.position_code||'').trim(),
      sort:Number(row?.sort_order||index+1)
    })).filter(row=>row.code && !seen.has(row.code) && seen.add(row.code)).sort((a,b)=>a.sort-b.sort||a.code.localeCompare(b.code,'th'));
  }
  function templateRowsForDate(date){
    const target=targetSlotsForDate(date);
    const cfg=templateConfigs();
    let rows=[];
    if(cfg && target){
      if(isOutingDate(date)){
        const bucket=target<=12?12:(target<=13?13:14);
        rows=cfg.outing_by_count?.[bucket] || cfg.outing_by_count?.[String(bucket)] || cfg.outing || [];
      }else{
        rows=cfg.day?.[target] || cfg.day?.[String(target)] || [];
      }
    }
    if(!rows.length && target && !isOutingDate(date)){
      try { rows=window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS_218?.[target] || window.cnmiDayPositionSlotsV218?.DAY_POSITION_SLOT_SETS?.[target] || []; }
      catch (_) {}
    }
    if(!rows.length){
      rows=activeMasterRows().filter(row=>isOutingDate(date) ? (row.is_outing===true || String(row.zone||'')==='ออกหน่วย') : !(row.is_outing===true || String(row.zone||'')==='ออกหน่วย'));
    }
    return normalizeTemplateRows(rows);
  }
  function applyTemplateDropdowns(){
    if(S()?.page!=='positionMonth' || !isAdminSafe()) return;
    document.querySelectorAll('[data-v275-position-cell]').forEach(cell=>{
      const date=normDate(cell.dataset.date),select=cell.querySelector('[data-v275-position-select]');
      if(!date||!select) return;
      const selected=String(select.value||'');
      const rows=templateRowsForDate(date);
      const allowed=rows.map(row=>row.code);
      if(selected && !allowed.includes(selected)) allowed.push(selected);
      const signature=`${date}|${targetSlotsForDate(date)||''}|${isOutingDate(date)?'outing':'day'}|${allowed.join('¦')}|${selected}`;
      if(select.dataset.v278Signature===signature) return;
      select.innerHTML=`<option value="">ว่าง</option>${allowed.map(code=>`<option value="${esc(code)}" ${code===selected?'selected':''}>${esc(code)}${code===selected&&!rows.some(r=>r.code===code)?' (ตำแหน่งเดิม)':''}</option>`).join('')}`;
      select.value=selected;
      select.dataset.v278Signature=signature;
      const target=targetSlotsForDate(date);
      select.title=target ? `${isOutingDate(date)?'ชุดออกหน่วย':'ชุดวันทำงานปกติ'} ${target} คน` : 'ยังไม่ได้กำหนด Slot ของวันนี้';
    });
  }
  async function ensureTemplateConfigs(){
    try {
      const promise=window.cnmiV224?.loadDbConfigs?.(false);
      if(promise && typeof promise.then==='function') await Promise.race([promise,new Promise(resolve=>setTimeout(resolve,5000))]);
    }catch(error){ console.warn(`${VERSION}: slot config load`,error); }
    applyTemplateDropdowns();
  }

  /* ------------------------------------------------------------------
     2) Four Admin position statistics tables
     ------------------------------------------------------------------ */
  function currentPositionRows(key){
    let rows=(S()?.positions||[]).filter(row=>normDate(row?.work_date).startsWith(key));
    try { rows=window.cnmiV272?.operationalRows?.(rows)||rows; } catch (_) {}
    return dedupePositions(rows);
  }
  function dedupePositions(rows){
    const map=new Map();
    (rows||[]).forEach(row=>{
      if(!row?.staff_id || !row?.position_code || !normDate(row?.work_date)) return;
      const key=`${normDate(row.work_date)}|${normId(row.staff_id)}|${String(row.position_code)}`;
      map.set(key,row);
    });
    return [...map.values()];
  }
  function positionMaster(code){ return activeMasterRows().find(row=>String(row.code||'')===String(code||'')) || null; }
  function zoneBucket(row){
    const master=positionMaster(row?.position_code),zone=String(row?.zone||master?.zone||'').trim().toLowerCase();
    if(zone.includes('ออกหน่วย') || row?.is_outing===true || String(master?.eligibility_code||'').startsWith('OUTING:')) return 'outing';
    if(zone.includes('donor') || zone.includes('บริจาค')) return 'donor';
    return 'bb';
  }
  function aggregatePositions(rows,people){
    const result=new Map(people.map(person=>[normId(person.id),{person,total:0,bb:0,donor:0,outing:0,positions:{}}]));
    (rows||[]).forEach(row=>{
      const rec=result.get(normId(row?.staff_id));
      if(!rec || !row?.position_code) return;
      rec.total++;
      rec[zoneBucket(row)]++;
      const code=String(row.position_code||'').trim();
      rec.positions[code]=(rec.positions[code]||0)+1;
    });
    return [...result.values()];
  }
  function allPositionCodes(monthRows,lifetimeRows){
    const seen=new Set(),out=[];
    activeMasterRows().sort((a,b)=>Number(a.sort_order||999)-Number(b.sort_order||999)||String(a.code).localeCompare(String(b.code),'th')).forEach(row=>{
      const code=String(row.code||'').trim();if(code&&!seen.has(code)){seen.add(code);out.push(code);}
    });
    [...(monthRows||[]),...(lifetimeRows||[])].forEach(row=>{
      const code=String(row?.position_code||'').trim();if(code&&!seen.has(code)){seen.add(code);out.push(code);}
    });
    return out;
  }
  async function loadLifetimePositions(force=false){
    if(lifetimePositionCache.rows && !force) return lifetimePositionCache.rows;
    if(lifetimePositionCache.loading) return lifetimePositionCache.loading;
    const client=DB();
    if(!client) return [];
    lifetimePositionCache.loading=(async()=>{
      const rows=[],pageSize=1000;
      for(let from=0,guard=0;guard<100;guard++,from+=pageSize){
        const query=client.from('daily_positions').select('id,work_date,staff_id,position_code,zone').order('work_date',{ascending:true}).range(from,from+pageSize-1);
        const res=await query;
        if(res.error) throw res.error;
        const part=res.data||[];rows.push(...part);
        if(part.length<pageSize) break;
      }
      lifetimePositionCache.rows=dedupePositions(rows);
      lifetimePositionCache.error='';
      return lifetimePositionCache.rows;
    })().catch(error=>{
      lifetimePositionCache.error=friendly(error);
      console.warn(`${VERSION}: lifetime positions`,error);
      return [];
    }).finally(()=>{lifetimePositionCache.loading=null;});
    const rows=await lifetimePositionCache.loading;
    refreshAdminPositionStats();
    return rows;
  }
  function zoneTableHtml(title,subtitle,data){
    return `<section class="card v278-position-stat-card"><div class="section-title"><div><h3>${esc(title)}</h3><p class="hint">${esc(subtitle)}</p></div></div><div class="v278-stat-scroll"><table class="v278-stat-table v278-zone-table"><thead><tr><th>เจ้าหน้าที่</th><th>BB</th><th>Donor</th><th>ออกหน่วย</th><th>รวม</th></tr></thead><tbody>${data.map(row=>`<tr><td>${staffPillHtml(row.person)}</td><td>${row.bb}</td><td>${row.donor}</td><td>${row.outing}</td><td><b>${row.total}</b></td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function positionTableHtml(title,subtitle,data,codes){
    return `<section class="card v278-position-stat-card"><div class="section-title"><div><h3>${esc(title)}</h3><p class="hint">${esc(subtitle)}</p></div></div><div class="v278-stat-scroll"><table class="v278-stat-table v278-position-detail-table"><thead><tr><th>เจ้าหน้าที่</th>${codes.map(code=>`<th title="${esc(code)}">${esc(code)}</th>`).join('')}<th>รวม</th></tr></thead><tbody>${data.map(row=>`<tr><td>${staffPillHtml(row.person)}</td>${codes.map(code=>`<td>${row.positions[code]||0}</td>`).join('')}<td><b>${row.total}</b></td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function fourPositionStatsHtml(key){
    const people=positionStaff(),monthRows=currentPositionRows(key),lifeRows=lifetimePositionCache.rows||[],codes=allPositionCodes(monthRows,lifeRows);
    const monthData=aggregatePositions(monthRows,people),lifeData=aggregatePositions(lifeRows,people);
    const loading=!lifetimePositionCache.rows && !lifetimePositionCache.error;
    return `<div class="v278-admin-position-stats">
      <div class="section-title v278-stats-heading"><div><h2>สถิติตำแหน่งสำหรับ Admin</h2><p class="hint">เดือน ${esc(key)} และยอดสะสมทั้งหมดที่มีในฐานข้อมูล</p></div>${loading?'<span class="badge blue">กำลังโหลดข้อมูลสะสม…</span>':lifetimePositionCache.error?`<span class="badge orange">โหลดสะสมไม่สำเร็จ</span>`:`<span class="badge green">ข้อมูลสะสม ${lifeRows.length} รายการ</span>`}</div>
      <div class="v278-stat-grid">
        ${zoneTableHtml('ตารางที่ 1 — ห้องประจำเดือนนี้','แยก BB · Donor · ออกหน่วย',monthData)}
        ${positionTableHtml('ตารางที่ 2 — ตำแหน่งประจำเดือนนี้','แยกทุกตำแหน่งที่ใช้งาน',monthData,codes)}
        ${zoneTableHtml('ตารางที่ 3 — ห้องสะสมทั้งหมด','แยก BB · Donor · ออกหน่วย ตั้งแต่มีข้อมูลในระบบ',lifeData)}
        ${positionTableHtml('ตารางที่ 4 — ตำแหน่งสะสมทั้งหมด','แยกทุกตำแหน่ง ตั้งแต่มีข้อมูลในระบบ',lifeData,codes)}
      </div>
    </div>`;
  }
  function replaceAdminPositionStats(){
    if(S()?.page!=='positionMonth' || !isAdminSafe()) return;
    const target=document.querySelector('.v275-admin-position-stats');
    if(!target) return;
    const key=monthKeySafe(S()?.positionMonthKey||S()?.monthKey);
    target.outerHTML=fourPositionStatsHtml(key);
    if(!lifetimePositionCache.rows && !lifetimePositionCache.loading) loadLifetimePositions(false);
  }
  function refreshAdminPositionStats(){
    if(S()?.page!=='positionMonth') return;
    const target=document.querySelector('.v278-admin-position-stats,.v275-admin-position-stats');
    if(!target) return;
    target.outerHTML=fourPositionStatsHtml(monthKeySafe(S()?.positionMonthKey||S()?.monthKey));
  }

  /* ------------------------------------------------------------------
     3) Compact position summary popup: current month only
     ------------------------------------------------------------------ */
  function monthlyPositionSummary(person,key){
    const rows=currentPositionRows(key).filter(row=>normId(row.staff_id)===normId(person.id));
    const out={total:rows.length,bb:0,donor:0,outing:0,positions:{}};
    rows.forEach(row=>{out[zoneBucket(row)]++;const code=String(row.position_code||'').trim();if(code)out.positions[code]=(out.positions[code]||0)+1;});
    return out;
  }
  function showCompactPositionSummary(staffId){
    const person=(S()?.staff||[]).find(row=>normId(row.id)===normId(staffId));
    if(!person) return;
    const key=monthKeySafe(S()?.positionMonthKey||S()?.positionMonthViewKey||S()?.monthKey),summary=monthlyPositionSummary(person,key);
    const positions=Object.entries(summary.positions).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'th'));
    const positionHtml=positions.length?`<div class="v278-popup-position-list">${positions.map(([code,count])=>`<div><button type="button" class="v275-position-pill" data-v275-job="${esc(code)}">${esc(code)}</button><b>${count} วัน</b></div>`).join('')}</div>`:'<p class="muted">ยังไม่มีตำแหน่งในเดือนนี้</p>';
    try { showModal(`<div class="v278-position-popup"><h2>สรุปตำแหน่งของ ${esc(staffName(person))}</h2><p class="muted">เดือน ${esc(key)}</p><div class="v278-room-summary"><span>BB <b>${summary.bb}</b></span><span>Donor <b>${summary.donor}</b></span><span>ออกหน่วย <b>${summary.outing}</b></span><span>รวม <b>${summary.total}</b></span></div><h3>ตำแหน่งที่อยู่ในเดือนนี้</h3>${positionHtml}</div>`); }
    catch (_) {}
  }

  /* ------------------------------------------------------------------
     4) Position Management navigation recovery
     ------------------------------------------------------------------ */
  function closeSidebar(){
    document.getElementById('sidebar')?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }
  function renderPositionManagementImmediately(){
    try { window.renderPage?.(); } catch (error) { console.warn(`${VERSION}: position management render`,error); }
    setTimeout(()=>{
      try { window.cnmiV224?.renderPositionManagementV224?.(); } catch (error) { console.warn(`${VERSION}: slot manager render`,error); }
    },0);
    try {
      const load=window.cnmiV224?.loadDbConfigs?.(false);
      if(load&&typeof load.then==='function') Promise.race([load,new Promise(resolve=>setTimeout(resolve,6000))]).finally(()=>{
        if(S()?.page==='positionManagement') try { window.cnmiV224?.renderPositionManagementV224?.(); } catch (_) {}
      });
    } catch (_) {}
  }
  window.addEventListener('click',event=>{
    const nav=event.target?.closest?.('[data-page]');
    if(!nav) return;
    const target=String(nav.getAttribute('data-page')||'');
    const current=String(S()?.page||'');
    if(target!=='positionManagement' && current!=='positionManagement') return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(!target) return;
    if(S()) S().page=target;
    closeSidebar();
    if(target==='positionManagement') renderPositionManagementImmediately();
    else { try { window.renderPage?.(); } catch (error) { console.warn(`${VERSION}: leave position management`,error); } }
  },true);

  /* ------------------------------------------------------------------
     5) Cumulative holiday balance + separate reset action
     ------------------------------------------------------------------ */
  function holidayResetMonth(person){
    const raw=person?.holiday_balance_reset_at;
    return raw ? normDate(raw).slice(0,7) : '';
  }
  function calculateDaysOffSafe(staffId,key,assignments){
    try { return Number(calculateDaysOff(staffId,key,assignments)||0); }
    catch (_) { return 0; }
  }
  function holidayBalanceMap(calc,key){
    const safe=monthKeySafe(key),people=calc.rows.map(row=>row.person),months=[...calc.monthly.keys()].sort(),packs=new Map();
    months.forEach(month=>{
      const pack=calc.monthly.get(month)||{rows:[]},values=new Map();
      people.forEach(person=>values.set(normId(person.id),calculateDaysOffSafe(person.id,month,pack.rows||[])));
      const avgs={MT:0,เคิก:0};
      ['MT','เคิก'].forEach(label=>{
        const eligible=people.filter(person=>groupLabel(person)===label&&!isLongLeave(person)&&(!holidayResetMonth(person)||month>=holidayResetMonth(person)));
        const list=eligible.map(person=>Number(values.get(normId(person.id))||0));
        avgs[label]=list.length?list.reduce((a,c)=>a+c,0)/list.length:0;
      });
      packs.set(month,{values,avgs});
    });
    const result=new Map();
    people.forEach(person=>{
      const id=normId(person.id),reset=holidayResetMonth(person),start=reset&&reset>calc.bounds.startKey?reset:calc.bounds.startKey;
      let carry=0;
      months.filter(month=>month<safe&&month>=start).forEach(month=>{
        const pack=packs.get(month);carry+=Number(pack?.values.get(id)||0)-Number(pack?.avgs?.[groupLabel(person)]||0);
      });
      const current=packs.get(safe),currentDays=Number(current?.values.get(id)||0),currentAvg=Number(current?.avgs?.[groupLabel(person)]||0);
      const currentGap=isLongLeave(person)?0:currentDays-currentAvg;
      result.set(id,{carry,currentDays,currentGap,cumulative:carry+currentGap,resetMonth:reset});
    });
    return result;
  }
  function fmt(n){ const x=Number(n||0);return Math.abs(x)<0.05?'0.0':x.toFixed(1); }
  function dutyStatus(row,key){
    if(isLongLeave(row.person)) return {text:'ลาระยะยาว / ไม่คิดหนี้เวร',tone:'black'};
    if(row.resetMonth===key&&Math.abs(row.cumulative)<=0.5) return {text:'เริ่มนับเวรใหม่เดือนนี้',tone:'blue'};
    if(Math.abs(row.cumulative)<=0.5) return {text:'สมดุลสะสม',tone:'green'};
    return row.cumulative>0?{text:'เวรสะสมมากกว่าเฉลี่ย',tone:'orange'}:{text:'เวรสะสมน้อยกว่าเฉลี่ย',tone:'blue'};
  }
  function renderAdminBalanceV278(assignments,key){
    const safe=monthKeySafe(key||S()?.monthKey),calc=window.cnmiV277?.cumulativeBalance?.(safe,assignments||[]);
    if(!calc) return '<div class="notice error-notice">ยังคำนวณยอดสะสมไม่ได้ กรุณารีเฟรชหน้า</div>';
    const holiday=holidayBalanceMap(calc,safe);
    const groups=['MT','เคิก'].map(label=>({label,rows:calc.rows.filter(row=>groupLabel(row.person)===label)})).filter(group=>group.rows.length);
    return `<div class="clean-balance-dashboard grouped-balance-dashboard v278-cumulative-dashboard">${groups.map(group=>{
      const avg=Number(calc.current?.avgs?.[group.label]||0);
      return `<section class="balance-group-section"><div class="section-title balance-group-title"><h3>กลุ่ม ${esc(group.label)}</h3><span>${badgeHtml(`ค่าเฉลี่ยเดือนนี้ ${avg.toFixed(1)} หน่วยเวร`,'blue')}</span></div><div class="table-wrap v278-balance-table-wrap"><table class="clean-balance-table v278-balance-table"><thead><tr><th>เจ้าหน้าที่</th><th>เวรรวม</th><th>หน่วยเวร</th><th>ชั่วโมงรวม</th><th>เงินประมาณ</th><th>Quota Gap</th><th>OT Balance ยกมา</th><th>เวรสะสม</th><th>วันหยุดเดือนนี้</th><th>วันหยุดสะสม</th><th>ชบด1</th><th>ชบด2</th><th>ชบด3</th><th>ช3A</th><th>ช3B</th><th>ช4</th><th>ช9</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${group.rows.map(row=>{
        const id=normId(row.person.id),h=holiday.get(id)||{carry:0,currentDays:0,resetMonth:''},status=dutyStatus(row,safe),dutyReset=row.resetMonth===safe,holidayReset=h.resetMonth===safe;
        return `<tr class="${isLongLeave(row.person)?'v278-exempt-row':''}"><td>${staffPillHtml(row.person)}</td><td>${row.counts.total}</td><td>${Number(row.units||0).toFixed(1)}</td><td>${Number(row.hours||0).toFixed(1)}</td><td>${Math.round(Number(row.pay||0)).toLocaleString()}</td><td class="${row.gap>0.5?'v278-positive':row.gap<-0.5?'v278-negative':''}">${fmt(row.gap)}</td><td class="${row.carry>0.5?'v278-positive':row.carry<-0.5?'v278-negative':''}">${fmt(row.carry)}</td><td class="${row.cumulative>0.5?'v278-positive':row.cumulative<-0.5?'v278-negative':''}">${fmt(row.cumulative)}</td><td>${h.currentDays}</td><td class="${Number(h.cumulative||0)>0.5?'v278-positive':Number(h.cumulative||0)<-0.5?'v278-negative':''}">${fmt(h.cumulative)}</td><td>${row.counts.chbd1}</td><td>${row.counts.chbd2}</td><td>${row.counts.chbd3}</td><td>${row.counts.ch3a}</td><td>${row.counts.ch3b}</td><td>${row.counts.ch4}</td><td>${row.counts.ch9}</td><td>${badgeHtml(status.text,status.tone)}${row.resetMonth?`<small class="v278-reset-note">เวรเริ่ม ${esc(row.resetMonth)}</small>`:''}${h.resetMonth?`<small class="v278-reset-note">วันหยุดเริ่ม ${esc(h.resetMonth)}</small>`:''}</td><td><div class="v278-action-stack"><button type="button" class="tiny-btn ${dutyReset?'danger':'warning'}" data-v277-balance-reset="${esc(id)}" data-v277-month="${esc(safe)}" data-v277-action="${dutyReset?'undo':'reset'}">${dutyReset?'ยกเลิกรีเซ็ตเวร':'เริ่มนับเวรใหม่เดือนนี้'}</button><button type="button" class="tiny-btn ${holidayReset?'danger':'soft'}" data-v278-holiday-reset="${esc(id)}" data-v278-month="${esc(safe)}" data-v278-action="${holidayReset?'undo':'reset'}">${holidayReset?'ยกเลิกรีเซ็ตวันหยุด':'เริ่มนับวันหยุดใหม่เดือนนี้'}</button></div></td></tr>`;
      }).join('')}</tbody></table></div></section>`;
    }).join('')}</div>`;
  }
  const previousBalance=window.renderBalanceDashboard || (typeof renderBalanceDashboard==='function'?renderBalanceDashboard:null);
  if(previousBalance){
    const enhanced=function renderBalanceDashboardV278(staffList,assignments,key){
      if(isAdminSafe()&&S()?.page==='scheduler') return renderAdminBalanceV278(assignments,key);
      return previousBalance.apply(this,arguments);
    };
    window.renderBalanceDashboard=enhanced;
    try { renderBalanceDashboard=enhanced; } catch (_) {}
  }
  async function setHolidayReset(staffId,key,action){
    const person=(S()?.staff||[]).find(row=>normId(row.id)===normId(staffId));
    if(!person||!DB()) return;
    const reset=action!=='undo';
    const message=reset?`ยืนยันเริ่มนับความสมดุลวันหยุดของ ${staffName(person)} ใหม่ตั้งแต่เดือน ${key} หรือไม่?\nผลต่างวันหยุดก่อนเดือนนี้จะไม่นำมาคิด`:`ยืนยันยกเลิกการเริ่มนับวันหยุดใหม่ของ ${staffName(person)} ในเดือน ${key} หรือไม่?`;
    if(!window.confirm(message)) return;
    try{
      try { setBusy?.(true,'กำลังบันทึกการเริ่มนับวันหยุด'); } catch (_) {}
      const res=await DB().rpc('set_staff_holiday_balance_reset_month_v278',{p_staff_id:staffId,p_month_key:key,p_reset:reset});
      if(res.error) throw res.error;
      person.holiday_balance_reset_at=reset?`${key}-01T00:00:00.000Z`:null;
      toast(reset?'ตั้งให้เริ่มนับวันหยุดใหม่ในเดือนนี้แล้ว':'ยกเลิกการเริ่มนับวันหยุดใหม่แล้ว');
      try { window.renderPage?.(); } catch (_) {}
    }catch(error){ toast(`บันทึกไม่สำเร็จ: ${friendly(error)} — กรุณารัน SQL V278 ก่อน`,'error'); }
    finally { try { setBusy?.(false); } catch (_) {} }
  }

  /* ------------------------------------------------------------------
     Rendering and event integration
     ------------------------------------------------------------------ */
  function enhanceCurrentPage(){
    applyTemplateDropdowns();
    replaceAdminPositionStats();
  }
  function queueEnhance(){
    if(enhanceQueued) return;
    enhanceQueued=true;
    requestAnimationFrame(()=>{enhanceQueued=false;enhanceCurrentPage();});
  }
  const previousRender=window.renderPage || (typeof renderPage==='function'?renderPage:null);
  if(previousRender){
    const wrapped=function renderPageV278(){
      if(rendering) return previousRender.apply(this,arguments);
      rendering=true;let result;
      try { result=previousRender.apply(this,arguments); }
      finally { rendering=false; }
      setTimeout(enhanceCurrentPage,0);
      setTimeout(enhanceCurrentPage,100);
      return result;
    };
    window.renderPage=wrapped;
    try { renderPage=wrapped; } catch (_) {}
  }

  window.addEventListener('click',event=>{
    const summary=event.target?.closest?.('[data-v275-position-summary]');
    if(summary){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();showCompactPositionSummary(summary.dataset.v275PositionSummary);return;}
  },true);
  document.addEventListener('click',event=>{
    const btn=event.target?.closest?.('[data-v278-holiday-reset]');
    if(!btn) return;
    event.preventDefault();event.stopImmediatePropagation();
    setHolidayReset(btn.dataset.v278HolidayReset,btn.dataset.v278Month,btn.dataset.v278Action);
  },true);
  document.addEventListener('input',event=>{
    if(event.target?.matches?.('[data-v275-slot]')) setTimeout(applyTemplateDropdowns,450);
  },true);
  document.addEventListener('change',event=>{
    if(event.target?.matches?.('[data-v275-slot]')) setTimeout(applyTemplateDropdowns,450);
  },true);

  const style=document.createElement('style');
  style.id='v278-slot-stats-holiday-style';
  style.textContent=`
    .v278-admin-position-stats{display:grid;gap:12px;min-width:0}
    .v278-stats-heading{padding:4px 2px}
    .v278-stat-grid{display:grid;grid-template-columns:1fr;gap:12px;min-width:0}
    .v278-position-stat-card{min-width:0;margin:0!important}
    .v278-stat-scroll{display:block;width:100%;max-width:100%;overflow:auto;overscroll-behavior:contain;position:relative}
    .v278-stat-table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:10px}
    .v278-stat-table th,.v278-stat-table td{padding:6px 8px;border-right:1px solid #e5eaf1;border-bottom:1px solid #e5eaf1;text-align:center;white-space:nowrap;background:#fff}
    .v278-stat-table thead th{position:sticky;top:0;z-index:4;background:#f8fafc}
    .v278-stat-table tr>:first-child{position:sticky;left:0;z-index:3;text-align:left;background:#fff;box-shadow:3px 0 5px rgba(15,23,42,.08)}
    .v278-stat-table thead tr>:first-child{z-index:6;background:#f8fafc}
    .v278-position-detail-table th:not(:first-child){max-width:120px;overflow:hidden;text-overflow:ellipsis}
    .v278-staff-pill{display:inline-flex;border-radius:999px;padding:3px 8px;background:var(--staff-bg);color:var(--staff-fg);font-weight:900}
    .v278-room-summary{display:grid;grid-template-columns:repeat(4,minmax(90px,1fr));gap:8px;margin:12px 0}
    .v278-room-summary span{border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;padding:9px;text-align:center}
    .v278-popup-position-list{display:grid;gap:6px}
    .v278-popup-position-list>div{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #eef2f7;padding:6px 0}
    .v278-balance-table-wrap{max-width:100%;overflow:auto}
    .v278-balance-table{min-width:1660px;font-size:10px}
    .v278-balance-table th,.v278-balance-table td{padding:6px 7px;text-align:center;vertical-align:middle;white-space:nowrap}
    .v278-balance-table th:first-child,.v278-balance-table td:first-child{position:sticky;left:0;z-index:3;background:#fff;text-align:left;box-shadow:3px 0 5px rgba(15,23,42,.08)}
    .v278-balance-table thead th:first-child{z-index:5;background:#f6f9fc}
    .v278-positive{color:#b45309;font-weight:900}.v278-negative{color:#1d70b7;font-weight:900}
    .v278-action-stack{display:flex;flex-direction:column;gap:4px;min-width:150px}
    .v278-reset-note{display:block;margin-top:2px;color:#64748b;font-size:8px}
    .v278-exempt-row{opacity:.72}
    @media(min-width:1280px){.v278-stat-grid{grid-template-columns:1fr 1fr}.v278-position-stat-card:nth-child(2),.v278-position-stat-card:nth-child(4){grid-column:1/-1}}
    @media(max-width:820px){.v278-room-summary{grid-template-columns:1fr 1fr}.v278-stat-table{font-size:9px}.v278-action-stack{min-width:132px}}
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(queueEnhance);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(enhanceCurrentPage,100);setTimeout(ensureTemplateConfigs,180);});
  setTimeout(enhanceCurrentPage,0);
  setTimeout(ensureTemplateConfigs,220);

  window.cnmiV278={
    applyTemplateDropdowns,
    templateRowsForDate,
    loadLifetimePositions,
    refreshAdminPositionStats,
    showCompactPositionSummary,
    holidayBalanceMap,
    setHolidayReset
  };
  console.info(`${VERSION} loaded`);
})();
