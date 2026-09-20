/* V549: Fresh Effective Trade/Roster Engine (cache-safe filename)
   - ปรับช่วงขายเวรเป็น เช้า/บ่าย/ดึก และช่วงรวม 16/24 ชม.
   - ถ้าขายครบชั่วโมงของช่องเวร ให้โอนเจ้าของเวรทั้งช่องตามเดิม
   - ถ้าขายเฉพาะบางช่วง ให้ไม่ย้ายเจ้าของเวรทั้งช่อง แต่ตารางอ่านผลแบบแยกช่วง: ผู้ขายเหลือเฉพาะช่วงที่ยังทำเอง และผู้รับเห็นช่วงที่รับแทน
*/
(function(){
  'use strict';
  const VERSION = 'V549_TRADE_EFFECTIVE_ROSTER';
  if (window.__CNMI_V549_TRADE_EFFECTIVE_ROSTER__) return;
  window.__CNMI_V549_TRADE_EFFECTIVE_ROSTER__ = true;

  const PARTS = {
    full24: { label:'ขาย: เช้า-บ่าย-ดึก', short:'เช้า-บ่าย-ดึก', hours:24, segments:['morning','afternoon','night'] },
    morning_afternoon: { label:'ขาย: เช้า-บ่าย', short:'เช้า-บ่าย', hours:16, segments:['morning','afternoon'] },
    afternoon_night: { label:'ขาย: บ่าย-ดึก', short:'บ่าย-ดึก', hours:16, segments:['afternoon','night'] },
    night_morning: { label:'ขาย: ดึก-เช้า', short:'ดึก-เช้า', hours:16, segments:['night','morning'] },
    morning: { label:'ขาย: เช้า', short:'เช้า', hours:8, segments:['morning'] },
    afternoon: { label:'ขาย: บ่าย', short:'บ่าย', hours:8, segments:['afternoon'] },
    night: { label:'ขาย: ดึก', short:'ดึก', hours:8, segments:['night'] }
  };
  const SEGMENT_ORDER = ['morning','afternoon','night'];
  const SEGMENT_LABEL = { morning:'เช้า', afternoon:'บ่าย', night:'ดึก' };

  const CUSTOM_PART = 'custom_time';

  function clockMinutes(value){
    const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
    if(!m)return NaN;
    const h=Number(m[1]),min=Number(m[2]);
    if(!Number.isInteger(h)||!Number.isInteger(min)||h<0||h>23||min<0||min>59)return NaN;
    return h*60+min;
  }
  function clockText(absMinutes){
    let n=Math.round(Number(absMinutes||0));
    n=((n%1440)+1440)%1440;
    return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  }
  function isWeekendHoliday(date){
    try { return !!(isWeekend(date) || isHolidayDate(date)); }
    catch (_) {
      const d=new Date(`${String(date||'').slice(0,10)}T12:00:00`).getDay();
      return d===0||d===6;
    }
  }
  function assignmentWindow(a){
    const code=String(a?.duty_code||'');
    const full=assignmentFullHours(a);
    if(/^ชบด[123]$/.test(code)) return isWeekendHoliday(a?.duty_date) ? {start:480,end:1920} : {start:960,end:1920};
    if(['ช3A','ช3B','ช9-เคิก','ช9-MT'].includes(code)) return {start:480,end:960};
    if(['ช4A','ช4B'].includes(code)) return {start:960,end:1440};
    if(full>=24)return {start:480,end:1920};
    if(full>=16)return {start:960,end:1920};
    return {start:480,end:480+Math.max(1,full)*60};
  }
  function intervalText(start,end){
    const plus=end>1440 || (end===1440 && start>=960);
    const base=`${clockText(start)}–${clockText(end)}`;
    return plus && clockMinutes(clockText(end))<=clockMinutes(clockText(start)) ? `${base} (+1 วัน)` : base;
  }
  function resolveClockRange(startText,endText,a){
    const w=assignmentWindow(a);
    const sClock=clockMinutes(startText),eClock=clockMinutes(endText);
    if(!Number.isFinite(sClock)||!Number.isFinite(eClock))return null;
    const sCandidates=[sClock,sClock+1440,sClock+2880].filter(x=>x>=w.start-0.01&&x<w.end-0.01);
    if(!sCandidates.length)return null;
    const start=sCandidates[0];
    const eCandidates=[eClock,eClock+1440,eClock+2880].filter(x=>x>start+0.01&&x<=w.end+0.01);
    if(!eCandidates.length)return null;
    const end=eCandidates[0];
    return {start,end,hours:Math.round((end-start)/60*100)/100};
  }
  function segmentIntervals(a,segments){
    const w=assignmentWindow(a);
    const map={morning:[480,960],afternoon:[960,1440],night:[1440,1920]};
    const out=[];
    (segments||[]).forEach(seg=>{
      const raw=map[seg]; if(!raw)return;
      const s=Math.max(w.start,raw[0]),e=Math.min(w.end,raw[1]);
      if(e>s+0.01)out.push([s,e]);
    });
    return out;
  }
  function legacyPartSpec(part,a){
    const key=PARTS[part]?part:defaultPartFor(a);
    const intervals=segmentIntervals(a,PARTS[key]?.segments||[]);
    const hours=intervals.reduce((sum,x)=>sum+(x[1]-x[0])/60,0) || Math.min(Number(PARTS[key]?.hours||0),assignmentFullHours(a));
    return {part:key,custom:false,intervals,hours:Math.round(hours*100)/100,label:PARTS[key]?.short||PARTS[key]?.label||key};
  }
  function tradeSpecFromNote(note,a){
    const raw=String(note||'');
    const start=raw.match(/\[SELL_START=(\d{1,2}:\d{2})\]/i)?.[1]||'';
    const end=raw.match(/\[SELL_END=(\d{1,2}:\d{2})\]/i)?.[1]||'';
    if(start&&end){
      const range=resolveClockRange(start,end,a);
      if(range)return {part:CUSTOM_PART,custom:true,intervals:[[range.start,range.end]],hours:range.hours,start,end,label:intervalText(range.start,range.end)};
    }
    const part=partFromNoteLegacy(raw,a);
    return legacyPartSpec(part,a);
  }
  function specFromInputs(start,end,a){
    const range=resolveClockRange(start,end,a);
    if(!range)return null;
    const w=assignmentWindow(a);
    const full=assignmentFullHours(a);
    const whole=Math.abs(range.hours-full)<0.01 && Math.abs(range.start-w.start)<0.01 && Math.abs(range.end-w.end)<0.01;
    if(whole){
      const legacy=legacyPartSpec(defaultPartFor(a),a);
      return {...legacy,start:clockText(w.start),end:clockText(w.end),whole:true};
    }
    return {part:CUSTOM_PART,custom:true,intervals:[[range.start,range.end]],hours:range.hours,start:clockText(range.start),end:clockText(range.end),label:intervalText(range.start,range.end),whole:false};
  }
  function subtractIntervals(base,removed){
    let pieces=[base];
    (removed||[]).slice().sort((a,b)=>a[0]-b[0]).forEach(([rs,re])=>{
      pieces=pieces.flatMap(([s,e])=>{
        if(re<=s||rs>=e)return [[s,e]];
        const out=[];
        if(rs>s)out.push([s,Math.min(rs,e)]);
        if(re<e)out.push([Math.max(re,s),e]);
        return out.filter(x=>x[1]>x[0]+0.01);
      });
    });
    return pieces;
  }
  function intervalsOverlap(a,b){return a[0]<b[1]-0.01&&b[0]<a[1]-0.01;}
  function exactTimeLabel(intervals){
    return (intervals||[]).map(x=>intervalText(x[0],x[1])).join(' + ');
  }


  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(msg, tone){
    try { if (typeof showToast === 'function') showToast(msg, tone ? { tone } : undefined); else window.alert(msg); }
    catch (_) { console.info(msg); }
  }
  function normDate(v){
    try { return normalizeDateKey(v); }
    catch (_) { return String(v || '').slice(0, 10); }
  }
  function currentId(){
    try { return currentStaffId(); }
    catch (_) { return state?.profile?.id || ''; }
  }
  function admin(){
    try { return typeof isAdmin === 'function' && isAdmin(); }
    catch (_) { return false; }
  }
  function ordered(list){
    try { return orderedStaff(list || []); }
    catch (_) { return (list || []).slice().sort((a,b)=>String(a?.nickname || a?.full_name || '').localeCompare(String(b?.nickname || b?.full_name || ''), 'th')); }
  }
  function activeRosterStaff(){
    const rows = Array.isArray(state?.staff) ? state.staff : [];
    return ordered(rows.filter(st => {
      try { if (typeof isRosterEnabled === 'function') return isRosterEnabled(st); } catch (_) {}
      return st && st.id && st.is_active !== false && st.active !== false && st.schedule !== false;
    }));
  }
  function labelDuty(code){
    try { return (typeof DUTY_LABEL !== 'undefined' && DUTY_LABEL?.[code]) || code || '-'; }
    catch (_) { return code || '-'; }
  }
  function sortDuty(code){
    try { return dutySortIndex(code); }
    catch (_) {
      try { return (DUTY_COLUMNS || []).indexOf(code); } catch (_) { return 999; }
    }
  }
  function money(value){
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0 บ.';
    const rounded = Math.round(n * 100) / 100;
    return `${rounded.toLocaleString('th-TH', { minimumFractionDigits:Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits:2 })} บ.`;
  }
  function hoursText(value){
    const n = Math.round(Number(value || 0) * 100) / 100;
    if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  }
  function monthDates(key){
    try { return scheduleMonthDates(key); }
    catch (_) {
      const [y, m] = String(key || state?.monthKey || '').split('-').map(Number);
      const yy = y || new Date().getFullYear();
      const mm = m || (new Date().getMonth() + 1);
      const last = new Date(yy, mm, 0).getDate();
      return Array.from({length:last}, (_,i)=>`${yy}-${String(mm).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
    }
  }
  function assignmentFullHours(a){
    if (!a) return 0;
    try {
      const h = Number(shiftPaymentHoursForCode(a.duty_date, a.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    try {
      const h = Number(dutyHoursForCode(a.duty_date, a.duty_code));
      if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    return 8;
  }
  function defaultPartFor(a){
    const full = assignmentFullHours(a);
    if (full >= 24) return 'full24';
    if (full >= 16) return 'afternoon_night';
    return 'morning';
  }
  function partFromNoteLegacy(note, a=null){
    const raw = String(note || '').match(/\[SELL_PART=([a-z_]+)\]/i)?.[1]?.toLowerCase() || '';
    if (PARTS[raw]) return raw;
    if (raw === 'full') return defaultPartFor(a);
    if (raw === 'full24') return 'full24';
    return defaultPartFor(a);
  }
  function partFromNote(note, a=null){
    const raw = String(note || '').match(/\[SELL_PART=([a-z_]+)\]/i)?.[1]?.toLowerCase() || '';
    if(raw===CUSTOM_PART || /\[SELL_START=\d{1,2}:\d{2}\]/i.test(String(note||''))) return CUSTOM_PART;
    return partFromNoteLegacy(note,a);
  }
  function partHours(part, a){
    if(part===CUSTOM_PART)return NaN; // ให้ระบบภายนอก fallback ไปอ่าน [SELL_HOURS]
    const full = assignmentFullHours(a);
    const key = PARTS[part] ? part : defaultPartFor(a);
    const h = Number(PARTS[key].hours || full || 0);
    return full > 0 ? Math.min(h, full) : h;
  }
  function coversWholeSlot(part, a){
    if(part===CUSTOM_PART)return false;
    const full = assignmentFullHours(a);
    return partHours(part, a) >= (full - 0.01);
  }
  function partLabel(part, a, note=''){
    if(part===CUSTOM_PART){
      const spec=tradeSpecFromNote(note,a);
      return `ขาย: ${spec?.label||'เลือกเวลา'} (${hoursText(spec?.hours||0)} ชม.)`;
    }
    const key = PARTS[part] ? part : defaultPartFor(a);
    return `${PARTS[key].label} (${hoursText(partHours(key, a))} ชม.)`;
  }
  function allowedPartOptions(selected, a){
    const full = assignmentFullHours(a);
    const keys = full >= 24
      ? ['full24','morning_afternoon','afternoon_night','night_morning','morning','afternoon','night']
      : full >= 16
        ? ['morning_afternoon','afternoon_night','night_morning','morning','afternoon','night']
        : ['morning'];
    let sel = PARTS[selected] && keys.includes(selected) ? selected : keys[0];
    return keys.map(k => `<option value="${esc(k)}" ${k===sel?'selected':''}>${esc(partLabel(k, a))}</option>`).join('');
  }
  function stripMarkers(note){
    return String(note || '')
      .replace(/\s*\[SELL_PART=[a-z_]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_HOURS=\d+(?:\.\d+)?\]\s*/ig, ' ')
      .replace(/\s*\[SELL_SEGMENTS=[^\]]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_START=\d{1,2}:\d{2}\]\s*/ig, ' ')
      .replace(/\s*\[SELL_END=\d{1,2}:\d{2}\]\s*/ig, ' ')
      .replace(/\s*\[SELL_DATE=[^\]]+\]\s*/ig, ' ')
      .replace(/\s*\[SELL_DUTY=[^\]]+\]\s*/ig, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function buildNote(spec, a, note){
    const clean = stripMarkers(note);
    const dutyDate = encodeURIComponent(normDate(a?.duty_date || ''));
    const dutyCode = encodeURIComponent(String(a?.duty_code || ''));
    let marker='';
    if(spec?.custom){
      marker=`[SELL_PART=${CUSTOM_PART}] [SELL_HOURS=${hoursText(spec.hours)}] [SELL_SEGMENTS=custom] [SELL_START=${spec.start}] [SELL_END=${spec.end}] [SELL_DATE=${dutyDate}] [SELL_DUTY=${dutyCode}]`;
    }else{
      const part=spec?.part||defaultPartFor(a),cfg=PARTS[part]||PARTS[defaultPartFor(a)];
      marker=`[SELL_PART=${part}] [SELL_HOURS=${hoursText(spec?.hours ?? partHours(part,a))}] [SELL_SEGMENTS=${(cfg.segments||[]).join(',')}] [SELL_DATE=${dutyDate}] [SELL_DUTY=${dutyCode}]`;
    }
    return clean ? `${marker} ${clean}` : marker;
  }
  function forcedRate(mode, date){
    try {
      if (mode === 'kerk') return dutyRateByType('เคิก', date);
      return dutyRateByType('MT', date);
    } catch (_) {
      const holiday = (() => { try { return isHolidayDate(date); } catch (_) { return false; } })();
      return mode === 'kerk' ? (holiday ? 120 : 90) : (holiday ? 160 : 130);
    }
  }
  function staffTypeFor(staffId, code){
    try { return dutyStaffTypeForRate(staffId, code) || 'MT'; }
    catch (_) {
      const st = (state?.staff || []).find(s => String(s.id) === String(staffId));
      return String(st?.staff_type || '').trim() === 'เคิก' ? 'เคิก' : 'MT';
    }
  }
  function defaultRateMode(staffId, a){
    return staffTypeFor(staffId, a?.duty_code) === 'เคิก' ? 'kerk' : 'mt';
  }
  function niceRate(value){
    try { return niceRoleRateLabel(value); }
    catch (_) { return ({ mt:'ขายเรท MT', kerk:'ขายเรทเคิก', custom:'กำหนดจำนวนเงินเอง' }[value] || value || '-'); }
  }
  function calcPayment(a, sellerId, receiverId, rateMode='mt', part=defaultPartFor(a), customAmount=0){
    const h = partHours(part, a);
    const date = a?.duty_date || '';
    if (rateMode === 'custom') return { hours:h, adjustedHours:h, amount:Number(customAmount || 0), rate:0, sellerType:'-', receiverType:'-' };
    if (rateMode === 'kerk' || rateMode === 'mt') {
      const rate = forcedRate(rateMode, date);
      return { hours:h, adjustedHours:h, amount:Math.round(h * rate), rate, sellerType:rateMode === 'kerk' ? 'เคิก' : 'MT', receiverType:rateMode === 'kerk' ? 'เคิก' : 'MT' };
    }
    try {
      if (typeof calculateShiftPayment === 'function') {
        const base = calculateShiftPayment(a, sellerId, receiverId, 'ขายเวร', rateMode);
        const ratio = assignmentFullHours(a) ? h / assignmentFullHours(a) : 1;
        return { ...base, hours:h, adjustedHours:Math.round(Number(base.adjustedHours || h) * ratio * 100) / 100, amount:Math.round(Number(base.amount || 0) * ratio) };
      }
    } catch (_) {}
    const rate = forcedRate('mt', date);
    return { hours:h, adjustedHours:h, amount:Math.round(h * rate), rate, sellerType:'MT', receiverType:'MT' };
  }
  function rateOptions(selected){
    const legacy = (selected === 'receiver' || selected === 'owner') ? `<option value="${esc(selected)}" selected>รายการเดิม: ${esc(niceRate(selected))}</option>` : '';
    return `${legacy}<option value="mt" ${selected==='mt'?'selected':''}>ขายเรท MT</option><option value="kerk" ${selected==='kerk'?'selected':''}>ขายเรทเคิก</option><option value="custom" ${selected==='custom'?'selected':''}>กำหนดจำนวนเงินเอง / 0 บาทได้</option>`;
  }
  function findAssignment(id, list){
    const rows = list || state?.rosterAssignments || [];
    return rows.find(a => String(a?.id || '') === String(id || '')) || null;
  }
  // V548: roster rows can be re-created after a trade was completed, which changes the
  // roster_assignment id while the trade request still points to the old id. Every V217
  // request already stores SELL_DATE / SELL_DUTY snapshots, so use those snapshots as a
  // safe fallback. requester_id must still equal the current slot owner to avoid binding
  // an old whole-shift transfer to a slot that has already moved to the receiver.
  function tradeSnapshot(note,key){
    const m=String(note||'').match(new RegExp(`\\[${key}=([^\\]]+)\\]`,'i'));
    if(!m?.[1])return '';
    try{return decodeURIComponent(m[1]);}catch(_){return m[1];}
  }
  function tradeMatchesAssignment(r,a){
    if(!r||!a)return false;
    if(String(r?.from_assignment_id||'')===String(a?.id||''))return true;
    const date=normDate(tradeSnapshot(r?.note,'SELL_DATE'));
    const duty=String(tradeSnapshot(r?.note,'SELL_DUTY')||'').trim();
    return !!date && date===normDate(a?.duty_date)
      && !!duty && duty===String(a?.duty_code||'').trim()
      && String(r?.requester_id||'')===String(a?.staff_id||'');
  }
  function completedTradesForAssignment(a){
    if (!a?.id) return [];
    return (state?.tradeRequests || [])
      .filter(r => String(r?.status || '') === 'completed' && tradeMatchesAssignment(r,a))
      .map(r => {
        const spec=tradeSpecFromNote(r?.note,a);
        return {r,spec,part:spec.part,hours:spec.hours,intervals:spec.intervals||[]};
      })
      .filter(x => x.hours < assignmentFullHours(a)-0.01);
  }
  function activeTradePartsForAssignment(a, excludeRequestId=''){
    if (!a?.id) return [];
    return (state?.tradeRequests || [])
      .filter(r => tradeMatchesAssignment(r,a))
      .filter(r => String(r?.id || '') !== String(excludeRequestId || ''))
      .filter(r => !['rejected','completed_deleted','cancelled','canceled'].includes(String(r?.status || '').toLowerCase()))
      .map(r => {
        const spec=tradeSpecFromNote(r?.note,a);
        return {r,spec,part:spec.part,hours:spec.hours,intervals:spec.intervals||[]};
      })
      .filter(x => x.hours < assignmentFullHours(a)-0.01);
  }
  function selectedSpecConflicts(spec, a, excludeRequestId=''){
    const existing = activeTradePartsForAssignment(a, excludeRequestId);
    if (!existing.length) return '';
    if ((spec?.hours||0) >= assignmentFullHours(a)-0.01) return 'ช่องนี้มีรายการขายบางช่วงอยู่แล้ว กรุณาเลือกเฉพาะเวลาที่ยังไม่ได้ขาย';
    const hit=existing.find(x=>(x.intervals||[]).some(i=>(spec?.intervals||[]).some(j=>intervalsOverlap(i,j))));
    if(hit)return `ช่วง ${hit.spec?.label||'ที่เลือก'} มีรายการขายอยู่แล้ว กรุณาเลือกเวลาอื่น`;
    return '';
  }
  function segmentLabel(segments){
    const unique = [];
    (segments || []).forEach(s => { if (!unique.includes(s)) unique.push(s); });
    const orderedSegs = SEGMENT_ORDER.filter(s => unique.includes(s));
    if (unique.includes('night') && unique.includes('morning') && !unique.includes('afternoon')) return 'ดึก-เช้า';
    return orderedSegs.map(s => SEGMENT_LABEL[s] || s).join('-') || '-';
  }
  function remainingIntervalsFor(a,trades){
    const w=assignmentWindow(a);
    const removed=(trades||[]).flatMap(x=>x.intervals||x.spec?.intervals||[]);
    return subtractIntervals([w.start,w.end],removed);
  }
  function remainingLabelFor(a, trades){
    const full = assignmentFullHours(a);
    const soldHours = trades.reduce((sum, x) => sum + Number(x.hours || 0), 0);
    const remainHours = Math.max(0, Math.round((full - soldHours)*100)/100);
    if (remainHours <= 0.01) return '';
    if (remainHours >= full-0.01) return labelDuty(a.duty_code);
    return `เหลือ ${hoursText(remainHours)} ชม.`;
  }
  function entryLabelForReceived(part, a, spec=null){
    if(spec?.custom)return `รับช่วง ${spec.label||`${hoursText(spec.hours)} ชม.`}`;
    const cfg = PARTS[part] || PARTS[defaultPartFor(a)];
    return `รับช่วง ${cfg.short || cfg.label || 'เวร'}`;
  }
  function baseSegmentsForAssignment(a){
    const full=assignmentFullHours(a);
    if(full>=24)return ['morning','afternoon','night'];
    if(full>=16)return ['afternoon','night'];
    return ['morning'];
  }
  function remainingSegmentsFor(a,trades){
    if((trades||[]).some(x=>x.spec?.custom))return ['custom'];
    const sold=new Set();
    (trades||[]).forEach(x=>(PARTS[x.part]?.segments||[]).forEach(s=>sold.add(s)));
    return baseSegmentsForAssignment(a).filter(s=>!sold.has(s));
  }
  function effectiveEntriesForStaffDate(staffId, date, assignments){
    const d = normDate(date);
    const rows = [];
    const sourceRows = (assignments || []).filter(a => normDate(a?.duty_date) === d && a?.staff_id);
    sourceRows.forEach(a => {
      const trades = completedTradesForAssignment(a);
      if (String(a.staff_id) === String(staffId)) {
        if (trades.length) {
          const label = remainingLabelFor(a, trades);
          const full=assignmentFullHours(a),soldHours=trades.reduce((sum,x)=>sum+Number(x.hours||0),0),hours=Math.max(0,full-soldHours),segments=remainingSegmentsFor(a,trades);
          const timeLabel=exactTimeLabel(remainingIntervalsFor(a,trades));
          if (label) rows.push({ kind:'owner-remain', assignment:a, label, timeLabel, hours, segments, trades, sort:sortDuty(a.duty_code), className:'v217-remain' });
        } else {
          const w=assignmentWindow(a);
          rows.push({ kind:'owner', assignment:a, label:labelDuty(a.duty_code), timeLabel:intervalText(w.start,w.end), hours:assignmentFullHours(a), segments:baseSegmentsForAssignment(a), sort:sortDuty(a.duty_code), className:'' });
        }
      }
      trades.forEach(x => {
        if (String(x.r?.receiver_id || '') === String(staffId)) {
          const segments=x.spec?.custom?['custom']:[...(PARTS[x.part]?.segments||[])];
          rows.push({ kind:'receiver-part', assignment:a, request:x.r, part:x.part, spec:x.spec, label:entryLabelForReceived(x.part,a,x.spec), timeLabel:x.spec?.label||'', hours:Number(x.hours||0), segments, sort:sortDuty(a.duty_code) + 0.1, className:'v217-received' });
        }
      });
    });
    return rows.sort((a,b) => (a.sort - b.sort) || String(a.label).localeCompare(String(b.label), 'th'));
  }
  function effectiveAssignmentsForStaffDate(staffId,date,assignments){
    return effectiveEntriesForStaffDate(staffId,date,assignments).map(e=>({
      ...e.assignment,
      staff_id:staffId,
      _effective_label:e.label,
      _effective_time_label:e.timeLabel||'',
      _effective_kind:e.kind,
      _effective_hours:Number(e.hours||0),
      _effective_segments:[...(e.segments||[])],
      _effective_trade_request_id:e.request?.id||''
    }));
  }
  function tradePartsInSlot(a){
    const trades = completedTradesForAssignment(a);
    if (!trades.length) return null;
    const remain = remainingLabelFor(a, trades);
    return { trades, remain };
  }
  function staffStatAttrs(staffId){ return `data-staff-stat="${esc(staffId)}" type="button"`; }
  function pillFor(staffId, attrs=''){
    try { return staffPill(staffId, { button:true, attrs }); }
    catch (_) { return `<button type="button" ${attrs}>${esc(staffId || '-')}</button>`; }
  }
  function tradeButtonSafe(a){
    try { return renderTradeButton(a); }
    catch (_) { return ''; }
  }

  window.tradePaymentDisplay = function tradePaymentDisplayV217(r, from, to=null){
    const a = from || findAssignment(r?.from_assignment_id) || {};
    const spec=tradeSpecFromNote(r?.note,a);
    const p = calcPayment(a, r?.requester_id, r?.receiver_id, r?.rate_mode || 'mt', spec.part, r?.amount_from || 0);
    if(spec?.custom){ p.hours=spec.hours; p.adjustedHours=spec.hours; if((r?.rate_mode||'mt')!=='custom') p.amount=Math.round(spec.hours*forcedRate(r?.rate_mode||'mt',a?.duty_date||'')); }
    const amount = Number(r?.amount_from ?? p.amount ?? 0);
    let html = `${money(amount)}`;
    const sellLabel=spec?.custom?`ขาย ${spec.label}`:partLabel(spec.part,a,r?.note);
    html += `<br><span class="muted">${esc(sellLabel)} • ${hoursText(spec.hours)} ชม. • ${esc(niceRate(r?.rate_mode || 'mt'))}</span>`;
    if (String(r?.status || '') === 'completed' && spec.hours < assignmentFullHours(a)-0.01) html += `<br><span class="badge blue">โอนเฉพาะช่วง</span>`;
    if (to && Number(r?.amount_diff || 0)) html += `<br><span class="muted">ส่วนต่าง ${Number(r.amount_diff || 0).toLocaleString()} บ.</span>`;
    return html;
  };
  try { tradePaymentDisplay = window.tradePaymentDisplay; } catch (_) {}

  window.selfPaidTradeNotice = function selfPaidTradeNoticeV217(){ return ''; };
  try { selfPaidTradeNotice = window.selfPaidTradeNotice; } catch (_) {}

  window.showTradeModal = function showTradeModalV217(assignmentId, existingRequest=null){
    const sourceRows = (() => {
      try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; }
    })();
    const slot = findAssignment(assignmentId, sourceRows) || findAssignment(assignmentId, state?.rosterAssignments || []);
    if (!slot) return toast('ไม่พบเวรนี้ กรุณารีเฟรชหน้า', 'error');
    const editing = !!existingRequest?.id;
    const requesterValue = editing ? existingRequest.requester_id : (admin() ? '' : slot.staff_id);
    const receiverValue = editing ? existingRequest.receiver_id : '';
    const existingSpec=editing?tradeSpecFromNote(existingRequest.note,slot):null;
    const w=assignmentWindow(slot);
    const startValue=existingSpec?.intervals?.length===1?clockText(existingSpec.intervals[0][0]):clockText(w.start);
    const endValue=existingSpec?.intervals?.length===1?clockText(existingSpec.intervals[0][1]):clockText(w.end);
    const rateValue = editing ? (existingRequest.rate_mode || defaultRateMode(requesterValue || slot.staff_id, slot)) : defaultRateMode(slot.staff_id, slot);
    const customValue = editing && rateValue === 'custom' ? Number(existingRequest.amount_from || 0) : '';
    const staffRows = activeRosterStaff();
    const possibleRequester = staffRows;
    const possibleReceiver = staffRows.filter(s => String(s.id) !== String(slot.staff_id));
    const requesterControl = admin()
      ? `<label class="wide">ผู้ขายเวร<select name="requester_id" id="tradeRequesterSelect" required><option value="">เลือกผู้ขายเวร</option>${possibleRequester.map(s => `<option value="${esc(s.id)}" ${String(requesterValue)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('')}</select></label>`
      : `<input type="hidden" name="requester_id" value="${esc(slot.staff_id)}">`;
    const body = `<h2>${editing ? 'แก้ไขคำขอขายเวร' : 'ขอขายเวร'}</h2>
      <p class="hint v217-trade-summary">${formatThaiDate(slot.duty_date)} • ${esc(labelDuty(slot.duty_code))} • ${staffPill(slot.staff_id)}</p>
      <form id="dutyTradeForm" class="form-grid v507-trade-form" data-v217-trade-form="1" data-assignment-id="${esc(slot.id)}">
        <input type="hidden" name="from_assignment_id" value="${esc(slot.id)}">
        <input type="hidden" name="trade_type" value="ขายเวร">
        ${editing ? `<input type="hidden" name="trade_request_id" value="${esc(existingRequest.id)}">` : ''}
        ${requesterControl}
        <label class="wide">ผู้รับเวร<select name="receiver_id" id="tradeReceiverSelect" required><option value="">เลือกคน</option>${possibleReceiver.map(s => `<option value="${esc(s.id)}" ${String(receiverValue)===String(s.id)?'selected':''}>${esc(s.nickname || s.full_name || s.email || s.id)}</option>`).join('')}</select></label>
        <div class="wide v507-time-grid">
          <label>เริ่มขาย<input name="sell_start" id="tradeSellStart" type="time" step="1800" value="${esc(startValue)}" required></label>
          <label>สิ้นสุด<input name="sell_end" id="tradeSellEnd" type="time" step="1800" value="${esc(endValue)}" required></label>
        </div>
        <span class="hint wide v507-short-hint">เลือกขายได้ตามเวลาจริง เช่น 17:00–19:00</span>
        <label>คิดเรท<select name="rate_mode" id="tradeRateSelect">${rateOptions(rateValue)}</select></label>
        <label id="tradeCustomWrap">จำนวนเงิน<input name="custom_amount" id="tradeCustomAmount" type="number" min="0" step="1" value="${esc(customValue)}" placeholder="0"></label>
        <div class="notice soft-notice wide v507-estimate" id="tradeEstimateV217">กำลังคำนวณ...</div>
        <label class="wide">หมายเหตุ <textarea name="note" rows="2" placeholder="ไม่จำเป็นต้องกรอก">${esc(stripMarkers(existingRequest?.note || ''))}</textarea></label>
        <button class="primary-btn wide" type="submit">${editing ? 'บันทึกการแก้ไข' : 'ส่งให้อีกฝ่ายยืนยัน'}</button>
      </form>`;
    try { showModal(body, { large:true }); } catch (_) { document.body.insertAdjacentHTML('beforeend', body); }
    setTimeout(() => updateEstimate(document.getElementById('dutyTradeForm')), 20);
  };
  try { showTradeModal = window.showTradeModal; } catch (_) {}

  function updateEstimate(form){
    if (!form) return;
    const slotId = form.querySelector('[name="from_assignment_id"]')?.value || form.dataset.assignmentId;
    const sourceRows = (() => { try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    const slot = findAssignment(slotId, sourceRows) || findAssignment(slotId);
    if (!slot) return;
    const requesterId = (admin() ? form.querySelector('[name="requester_id"]')?.value : currentId()) || slot.staff_id;
    const receiverId = form.querySelector('[name="receiver_id"]')?.value || slot.staff_id;
    const start=form.querySelector('[name="sell_start"]')?.value||'';
    const end=form.querySelector('[name="sell_end"]')?.value||'';
    const spec=specFromInputs(start,end,slot);
    const rateMode = form.querySelector('[name="rate_mode"]')?.value || defaultRateMode(requesterId, slot);
    const custom = Number(form.querySelector('[name="custom_amount"]')?.value || 0);
    const el = form.querySelector('#tradeEstimateV217') || form.querySelector('#tradeEstimateV205');
    if(!spec){
      if(el)el.innerHTML='<b>กรุณาเลือกเวลาให้อยู่ในช่วงเวรนี้</b>';
    }else{
      let amount=custom;
      if(rateMode!=='custom')amount=Math.round(spec.hours*forcedRate(rateMode,slot.duty_date));
      const mode=spec.hours>=assignmentFullHours(slot)-0.01?'ทั้งเวร':'บางช่วง';
      if (el) el.innerHTML = `<b>${esc(spec.label||exactTimeLabel(spec.intervals))}</b> • ${hoursText(spec.hours)} ชม. • ${esc(niceRate(rateMode))} • ${money(amount)} <span class="muted">(${mode})</span>`;
    }
    const customWrap = form.querySelector('#tradeCustomWrap');
    if (customWrap) customWrap.style.display = rateMode === 'custom' ? '' : 'none';
  }

  window.saveTradeRequest = async function saveTradeRequestV217(form){
    const fd = new FormData(form);
    const requestId = fd.get('trade_request_id') || '';
    const fromId = fd.get('from_assignment_id');
    const sourceRows = (() => { try { return getAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    const from = findAssignment(fromId, sourceRows) || findAssignment(fromId);
    const requesterId = admin() ? fd.get('requester_id') : currentId();
    const receiverId = fd.get('receiver_id');
    if (!from || !receiverId) return toast('กรุณาเลือกผู้รับเวร', 'error');
    if (admin() && !requesterId) return toast('กรุณาเลือกผู้ขายเวร', 'error');
    if (!admin() && String(from.staff_id) !== String(currentId())) return toast('ส่งคำขอได้เฉพาะเวรของตัวเอง', 'error');
    if (String(requesterId) !== String(from.staff_id)) return toast('ผู้ขายเวรไม่ตรงกับเจ้าของเวร', 'error');
    if (String(receiverId) === String(requesterId)) return toast('ผู้รับเวรต้องเป็นคนละคนกับผู้ขาย', 'error');
    const spec=specFromInputs(fd.get('sell_start'),fd.get('sell_end'),from);
    if(!spec)return toast('ช่วงเวลาที่เลือกอยู่นอกเวลาเวร หรือเวลาสิ้นสุดไม่ถูกต้อง', 'error');
    if(spec.hours<0.5)return toast('กรุณาขายอย่างน้อย 30 นาที', 'error');
    const conflict = selectedSpecConflicts(spec, from, requestId);
    if (conflict) return toast(conflict, 'error');
    const rateMode = fd.get('rate_mode') || defaultRateMode(requesterId, from);
    const custom = Number(fd.get('custom_amount') || 0);
    const amountFrom = rateMode === 'custom' ? custom : Math.round(spec.hours*forcedRate(rateMode,from.duty_date));
    const existing = requestId ? (state?.tradeRequests || []).find(x => String(x.id) === String(requestId)) : null;
    const row = {
      requester_id: requesterId,
      receiver_id: receiverId,
      from_assignment_id: fromId,
      to_assignment_id: null,
      trade_type: 'ขายเวร',
      rate_mode: rateMode,
      amount_from: amountFrom,
      amount_to: 0,
      amount_diff: 0,
      status: existing?.status || 'pending',
      note: buildNote(spec, from, fd.get('note') || ''),
      updated_by: currentId()
    };
    let error;
    if (requestId) ({ error } = await sb.from('roster_trade_requests').update(row).eq('id', requestId));
    else ({ error } = await sb.from('roster_trade_requests').insert({ ...row, created_by: currentId() }));
    if (error) return toast(friendlyDbError(error), 'error');
    try { closeModal(); } catch (_) {}
    try { await loadAllData(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(requestId ? 'แก้ไขคำขอขายเวรแล้ว' : 'ส่งคำขอขายเวรแล้ว รออีกฝ่ายยืนยัน');
  };
  try { saveTradeRequest = window.saveTradeRequest; } catch (_) {}

  window.applyTradeRequest = async function applyTradeRequestV217(id){
    if (!admin()) return toast('เฉพาะ Admin เท่านั้น', 'error');
    const r = (state?.tradeRequests || []).find(x => String(x.id) === String(id));
    if (!r || !['pending','confirmed'].includes(String(r.status || ''))) return toast('คำขอนี้ยังไม่พร้อมให้บันทึก', 'error');
    const from = findAssignment(r.from_assignment_id);
    if (!from) return toast('ไม่พบเวรต้นทาง', 'error');
    const spec = tradeSpecFromNote(r.note, from);
    const part = spec.part;
    const isWhole = spec.hours >= assignmentFullHours(from) - 0.01;
    const override = String(r.status || '') === 'pending';
    if (override) {
      let ok = false;
      try { ok = await confirmDialog('ยืนยันรายการนี้แบบ Admin Override โดยไม่รอคู่กรณีตอบรับ?', 'Admin Override'); }
      catch (_) { ok = window.confirm('ยืนยันรายการนี้แบบ Admin Override โดยไม่รอคู่กรณีตอบรับ?'); }
      if (!ok) return;
    }
    const completedPatch = { status:'completed', updated_by:currentId(), confirmed_at:r.confirmed_at || new Date().toISOString() };
    if (override) {
      try { completedPatch.note = adminOverrideNote(r.note); }
      catch (_) { completedPatch.note = `${r.note || ''} [ADMIN_OVERRIDE]`.trim(); }
    }
    if (isWhole) {
      const res = await sb.from('roster_assignments').update({ staff_id:r.receiver_id, updated_by:currentId() }).eq('id', from.id);
      if (res.error) return toast(friendlyDbError(res.error), 'error');
    }
    const { error } = await sb.from('roster_trade_requests').update({ ...completedPatch, trade_type:'ขายเวร', to_assignment_id:null, amount_to:0, amount_diff:0 }).eq('id', id);
    if (error) return toast(friendlyDbError(error), 'error');
    try { await loadAllData(); } catch (_) {}
    try { renderPage(); } catch (_) {}
    toast(isWhole ? (override ? 'Admin Override และบันทึกขายเวรแล้ว' : 'บันทึกขายเวรแล้ว') : 'บันทึกขายเวรเฉพาะช่วงแล้ว ตารางจะแสดงเฉพาะช่วงที่โอนให้ผู้รับเวร');
  };
  try { applyTradeRequest = window.applyTradeRequest; } catch (_) {}

  window.selfPaidDutyProxyOptions = function selfPaidDutyProxyOptionsV217(date=todayStr()){
    const d = normDate(date);
    const me = currentId();
    return (state?.tradeRequests || []).filter(r => String(r?.status || '') === 'completed' && String(r?.receiver_id || '') === String(me)).map(r => {
      const a = findAssignment(r.from_assignment_id);
      if (!a || normDate(a.duty_date) !== d) return null;
      const spec = tradeSpecFromNote(r.note, a);
      const part = spec.part;
      if (spec.hours >= assignmentFullHours(a)-0.01) return null;
      return { request:r, assignment:{ ...a, staff_id:r.receiver_id, _original_staff_id:r.requester_id, _sell_part:part, _sell_label:entryLabelForReceived(part, a, spec), _effective_time_label:spec.label||'' } };
    }).filter(Boolean);
  };
  try { selfPaidDutyProxyOptions = window.selfPaidDutyProxyOptions; } catch (_) {}

  window.scheduleShiftButton = function scheduleShiftButtonV217(slot){
    if (!slot?.staff_id) return '';
    const split = tradePartsInSlot(slot);
    if (!split) return `<div class="schedule-person-cell">${pillFor(slot.staff_id, staffStatAttrs(slot.staff_id))}${tradeButtonSafe(slot)}</div>`;
    const lines = [];
    if (split.remain) lines.push(`<span class="v217-split-line v217-remain"><b>${esc(split.remain)}</b>${pillFor(slot.staff_id, staffStatAttrs(slot.staff_id))}</span>`);
    split.trades.forEach(x => {
      const label = entryLabelForReceived(x.part, slot, x.spec);
      lines.push(`<span class="v217-split-line v217-received"><b>${esc(label)}</b>${pillFor(x.r.receiver_id, staffStatAttrs(x.r.receiver_id))}</span>`);
    });
    return `<div class="schedule-person-cell v217-split-cell">${lines.join('')}${tradeButtonSafe(slot)}</div>`;
  };
  try { scheduleShiftButton = window.scheduleShiftButton; } catch (_) {}

  const oldRenderCalendarCardView = window.renderCalendarCardView || (typeof renderCalendarCardView === 'function' ? renderCalendarCardView : null);
  window.renderCalendarCardView = function renderCalendarCardViewV217(staffList, assignments, key=state.monthKey){
    const dates = monthDates(key);
    const mobile = (() => { try { return isMobileView(); } catch (_) { return false; } })();
    const defaultDate = todayStr().startsWith(key) ? todayStr() : dates[0];
    const selectedDate = dates.includes(state.scheduleSelectedDate) ? state.scheduleSelectedDate : defaultDate;
    const visibleDates = mobile ? [selectedDate] : dates;
    const controls = mobile ? `<div class="single-day-control no-print"><label>เลือกวันที่ <input type="date" id="scheduleSelectedDate" min="${esc(dates[0])}" max="${esc(dates[dates.length-1])}" value="${esc(selectedDate)}"></label><button class="tiny-btn" data-schedule-today>วันนี้</button></div>` : '';
    return `${controls}<div class="clean-calendar-cards ${mobile ? 'single-day-cards' : ''}">${visibleDates.map(date => {
      const d = parseDate(date);
      const rows = (assignments || []).filter(a => normDate(a.duty_date) === date && a.staff_id).sort((a,b)=>sortDuty(a.duty_code)-sortDuty(b.duty_code));
      const dayOff = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
      return `<section class="clean-day-card ${dayOff ? 'is-offday' : ''}">
        <div class="clean-day-head"><b>${d.getDate()}</b><span>${d.toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short' })}</span>${(() => { try { return isHolidayDate(date) ? badge(holidayName(date), 'yellow') : ''; } catch (_) { return ''; } })()}</div>
        ${rows.length ? rows.map(a => `<div class="clean-day-line"><span>${esc(labelDuty(a.duty_code))}</span>${window.scheduleShiftButton(a)}</div>`).join('') : '<span class="muted">ไม่มีเวร</span>'}
      </section>`;
    }).join('')}</div>`;
  };
  try { renderCalendarCardView = window.renderCalendarCardView; } catch (_) { if (!oldRenderCalendarCardView) {} }

  window.renderPersonView = function renderPersonViewV217(staffList, assignments, key=state.monthKey){
    const selectedId = state.schedulePersonFilter || staffList?.[0]?.id || '';
    const selected = (staffList || []).find(st => String(st.id) === String(selectedId)) || staffList?.[0];
    const renderCard = (st) => {
      const rows = monthDates(key).flatMap(date => effectiveEntriesForStaffDate(st?.id, date, assignments));
      return `<section class="clean-person-card" style="--staff-bg:${staffColor(st)};--staff-fg:${textColorFor(staffColor(st))}">
        <button type="button" class="clean-person-head" data-staff-stat="${esc(st?.id)}"><b>${esc(st?.nickname || st?.full_name || '-')}</b><span>${rows.length} รายการ</span></button>
        ${rows.length ? rows.map(e => `<div class="clean-person-duty ${esc(e.className || '')}"><span>${formatThaiDate(e.assignment?.duty_date)}</span><b>${esc(e.label)}</b>${e.kind === 'owner' || e.kind === 'owner-remain' ? tradeButtonSafe(e.assignment) : '<span class="badge blue">รับช่วงขายเวร</span>'}</div>`).join('') : '<span class="muted">ไม่มีเวรเดือนนี้</span>'}
      </section>`;
    };
    return `<div class="person-filter-mobile no-print"><label>เลือกเจ้าหน้าที่ <select id="schedulePersonFilter">${(staffList || []).map(st => `<option value="${esc(st.id)}" ${String(selected?.id)===String(st.id)?'selected':''}>${esc(st.nickname || st.full_name || '-')}</option>`).join('')}</select></label></div>
    <div class="clean-person-mobile-result">${selected ? renderCard(selected) : empty('ไม่มีเจ้าหน้าที่')}</div>
    <div class="clean-person-list">${(staffList || []).map(renderCard).join('')}</div>`;
  };
  try { renderPersonView = window.renderPersonView; } catch (_) {}

  window.renderGridView = function renderGridViewV217(staffList, assignments, key=state.monthKey){
    const dates = monthDates(key);
    return `<div class="table-wrap clean-grid-wrap"><table id="scheduleTable" class="clean-schedule-grid"><thead><tr><th class="clean-sticky-col">เจ้าหน้าที่</th>${dates.map(date => {
      const d = parseDate(date);
      const off = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
      return `<th class="${off ? 'offday-col' : ''}">${d.getDate()}<br><span>${d.toLocaleDateString('th-TH', { weekday:'short' })}</span></th>`;
    }).join('')}</tr></thead><tbody>${(staffList || []).map(st => {
      const bg = staffColor(st);
      const fg = textColorFor(bg);
      return `<tr><th class="clean-sticky-col clean-staff-cell" style="--staff-bg:${bg};--staff-fg:${fg}"><button type="button" data-staff-stat="${esc(st.id)}">${esc(st.nickname || st.full_name || '-')}</button></th>${dates.map(date => {
        const shifts = effectiveEntriesForStaffDate(st.id, date, assignments);
        const off = (() => { try { return isWeekend(date) || isHolidayDate(date); } catch (_) { return false; } })();
        const leave = (() => { try { return activeLeaveRecordOn(st.id, date); } catch (_) { return null; } })();
        const leaveCls = leave ? (() => { try { return leaveCellClass(leaveDisplayType(leave)); } catch (_) { return ''; } })() : '';
        const leaveBadge = leave ? (() => { try { return leaveCellBadge(leave); } catch (_) { return '<span class="badge yellow">ลา</span>'; } })() : '';
        const pills = shifts.map(e => {
          const attrs = (e.kind === 'owner' || e.kind === 'owner-remain') && (() => { try { return canRequestTrade(e.assignment); } catch (_) { return false; } })()
            ? `data-trade-duty="${esc(e.assignment.id)}"`
            : `data-staff-stat="${esc(st.id)}"`;
          return `<button type="button" class="clean-shift-pill ${esc(e.className || '')}" style="--staff-bg:${bg};--staff-fg:${fg}" ${attrs}>${esc(e.label)}</button>`;
        }).join('');
        return `<td class="${off ? 'offday-col' : ''} ${leaveCls}"><div class="clean-cell-stack">${leaveBadge}${pills || (off && !leave ? '<span class="muted">หยุด</span>' : '')}</div></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
  };
  try { renderGridView = window.renderGridView; } catch (_) {}

  window.renderReadOnlySchedule = function renderReadOnlyScheduleV217(assignments){
    const staffList = (() => { try { return scheduleStaffList(); } catch (_) { return activeRosterStaff(); } })();
    const rows = assignments || (() => { try { return scheduleAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
    return window.renderGridView(staffList, rows, state.monthKey);
  };
  try { renderReadOnlySchedule = window.renderReadOnlySchedule; } catch (_) {}

  const oldShowStaffStats = window.showStaffStats || (typeof showStaffStats === 'function' ? showStaffStats : null);
  window.showStaffStats = function showStaffStatsV217(staffId){
    try {
      const assignments = (() => { try { return scheduleAssignmentsForMonth(state.monthKey); } catch (_) { return state?.rosterAssignments || []; } })();
      const rows = monthDates(state.monthKey).flatMap(date => effectiveEntriesForStaffDate(staffId, date, assignments));
      const detail = rows.map(e => `<tr><td>${formatThaiDate(e.assignment?.duty_date)}</td><td>${esc(e.label)}</td><td>${e.kind === 'receiver-part' ? 'รับช่วงขายเวร' : 'เจ้าของเวร/ช่วงคงเหลือ'}</td></tr>`).join('');
      showModal(`<h2>${staffPill(staffId)}</h2><p class="hint">ตารางนี้แสดงผลหลังหักรายการขายเวรเฉพาะช่วงแล้ว</p><div class="compact-detail-table"><table><thead><tr><th>วันที่</th><th>เวร/ช่วง</th><th>สถานะ</th></tr></thead><tbody>${detail || '<tr><td colspan="3">ยังไม่มีเวรในเดือนนี้</td></tr>'}</tbody></table></div>`);
    } catch (err) {
      if (oldShowStaffStats) return oldShowStaffStats.apply(this, arguments);
      console.warn(`${VERSION}: showStaffStats failed`, err);
    }
  };
  try { showStaffStats = window.showStaffStats; } catch (_) {}

  document.addEventListener('input', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v217-trade-form="1"]');
    if (!form) return;
    if (['sell_start','sell_end','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateEstimate(form);
  }, true);
  document.addEventListener('change', function(e){
    const form = e.target?.closest?.('#dutyTradeForm[data-v217-trade-form="1"]');
    if (!form) return;
    if (['sell_start','sell_end','rate_mode','custom_amount','receiver_id','requester_id'].includes(e.target?.name)) updateEstimate(form);
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .v217-split-cell{display:flex;flex-direction:column;gap:6px;align-items:stretch}.v217-split-line{display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid rgba(37,99,235,.18);border-radius:12px;padding:4px 6px;background:#fff}.v217-split-line>b{font-size:12px;white-space:nowrap}.v217-split-line.v217-received{background:#eef8ff;border-color:#bfe4ff}.v217-split-line.v217-remain{background:#fffdf4;border-color:#f7e6a1}.clean-shift-pill.v217-received{outline:2px solid rgba(14,165,233,.35);background:#e0f2fe!important;color:#075985!important}.clean-shift-pill.v217-remain{outline:2px solid rgba(234,179,8,.35)}.clean-person-duty.v217-received{background:#eef8ff;border-radius:12px;padding:6px 8px}.clean-person-duty.v217-remain{background:#fffdf4;border-radius:12px;padding:6px 8px}
    .v507-trade-form{row-gap:12px}.v507-time-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v507-time-grid label{margin:0}.v507-short-hint{margin-top:-6px}.v507-estimate{padding:10px 12px}.v217-trade-summary{margin-top:-4px}
    @media(max-width:640px){.v507-time-grid{grid-template-columns:1fr 1fr}.v507-trade-form textarea{min-height:64px}.v507-estimate{font-size:14px}}
  `;
  document.head.appendChild(style);

  window.cnmiTradeSegmentsV549 = window.cnmiTradeSegmentsV217 = { PARTS, partFromNote, partHours, coversWholeSlot, tradeSpecFromNote, assignmentWindow, effectiveEntriesForStaffDate, effectiveAssignmentsForStaffDate };
  console.info(`${VERSION} loaded`);
})();
