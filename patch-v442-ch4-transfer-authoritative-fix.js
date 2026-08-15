/* CNMI Staff Planner V442
 * Authoritative CH4 transfer fix.
 * Problem in V441: some "มีคนอยู่แทน" records were saved in shift_confirmations
 * but the published roster could remain with the original owner.
 *
 * V442 rules:
 * - covered_by_other MUST move the actual roster_assignments.staff_id to the selected replacement.
 * - Never creates OT automatically.
 * - Uses an authoritative DB read -> guarded update -> DB verification.
 * - Repairs existing covered_by_other records when the roster is still with the original owner.
 * - Never overwrites a roster row that was subsequently changed to a third person.
 */
(function(){
  'use strict';
  const VERSION='V442_CH4_TRANSFER_AUTHORITATIVE_FIX';
  if(window.__CNMI_V442_CH4_TRANSFER_AUTHORITATIVE_FIX__)return;
  window.__CNMI_V442_CH4_TRANSFER_AUTHORITATIVE_FIX__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{return window.sb||sb||null;}catch(_){return window.sb||null;}}
  function txt(v){return String(v==null?'':v).trim();}
  function dateKey(v){
    try{if(typeof window.normalizeDateKey==='function')return txt(window.normalizeDateKey(v)).slice(0,10);}catch(_){ }
    return txt(v).slice(0,10);
  }
  function isCh4(code){return ['ช4','ช4A','ช4B','ช4-MT'].includes(txt(code));}
  function currentStaff(){
    try{if(typeof window.currentStaffId==='function')return txt(window.currentStaffId());}catch(_){ }
    const s=S();return txt(s.profile?.staff_id||s.profile?.id||'');
  }
  function staffName(id){
    const row=(S().staff||[]).find(x=>txt(x?.id)===txt(id))||{};
    return txt(row.nickname||row.full_name||row.email||id||'-');
  }
  function sameSlot(a,b){
    if(!a||!b)return false;
    if(txt(a.id)&&txt(b.id)&&txt(a.id)===txt(b.id))return true;
    return dateKey(a.duty_date)===dateKey(b.duty_date)
      && txt(a.duty_code)===txt(b.duty_code)
      && (!txt(a.roster_month_id)||!txt(b.roster_month_id)||txt(a.roster_month_id)===txt(b.roster_month_id));
  }
  function syncLocal(saved){
    if(!saved)return;
    const s=S();
    const apply=list=>{
      if(!Array.isArray(list))return;
      const i=list.findIndex(r=>sameSlot(r,saved));
      if(i>=0)list[i]=Object.assign(list[i]||{},saved);
      else list.push(saved);
    };
    apply(s.rosterAssignments);
    if(Array.isArray(s.rosterDraft?.assignments))apply(s.rosterDraft.assignments);
  }
  async function selectCurrent(assignment){
    const client=DB();if(!client)throw new Error('ยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    let res=null;
    if(txt(assignment?.id)){
      res=await client.from('roster_assignments').select('*').eq('id',assignment.id).maybeSingle();
      if(res.error)throw res.error;
      if(res.data)return res.data;
    }
    const date=dateKey(assignment?.duty_date),code=txt(assignment?.duty_code),monthId=txt(assignment?.roster_month_id);
    if(!date||!code)throw new Error('ข้อมูลเวร ช4 ไม่ครบ');
    let q=client.from('roster_assignments').select('*').eq('duty_date',date).eq('duty_code',code);
    if(monthId)q=q.eq('roster_month_id',monthId);
    const rows=await q.limit(5);
    if(rows.error)throw rows.error;
    const data=Array.isArray(rows.data)?rows.data:[];
    if(data.length===1)return data[0];
    const owner=txt(assignment?.staff_id);
    return data.find(r=>txt(r?.staff_id)===owner)||data[0]||null;
  }
  async function updateAuthoritative(current,owner,receiver){
    const client=DB();
    const updater=currentStaff();
    const variants=[];
    if(updater)variants.push({staff_id:receiver,updated_by:updater});
    variants.push({staff_id:receiver});
    let last=null;
    for(const payload of variants){
      let q=client.from('roster_assignments').update(payload);
      if(txt(current?.id))q=q.eq('id',current.id);
      else{
        q=q.eq('duty_date',dateKey(current?.duty_date)).eq('duty_code',txt(current?.duty_code));
        if(txt(current?.roster_month_id))q=q.eq('roster_month_id',current.roster_month_id);
      }
      // Guard against overwriting a later manual change.
      if(owner)q=q.eq('staff_id',owner);
      const res=await q.select('*').maybeSingle();
      if(!res.error&&res.data)return res.data;
      if(!res.error&&!res.data){last=new Error('ไม่พบแถวเวรที่ตรงกับเจ้าของเดิม');break;}
      last=res.error;
      if(!/updated_by|column|schema|cache/i.test(txt(res.error?.message)))break;
    }
    throw last||new Error('ย้าย ช4 ไม่สำเร็จ');
  }
  async function verifyCurrent(reference,receiver){
    const now=await selectCurrent(reference);
    if(!now||txt(now.staff_id)!==txt(receiver))throw new Error('ตรวจสอบแล้ว ช4 ยังไม่ถูกย้าย กรุณาลองใหม่');
    syncLocal(now);
    return now;
  }
  async function transferCh4Assignment(assignment,coveredBy,opts={}){
    if(!assignment)throw new Error('ไม่พบรายการ ช4');
    const receiver=txt(coveredBy);
    if(!receiver)throw new Error('กรุณาเลือกผู้ที่อยู่แทน');
    const owner=txt(opts.ownerStaffId||assignment.staff_id);
    if(receiver===owner)return assignment;

    const current=await selectCurrent(assignment);
    if(!current)throw new Error('ไม่พบรายการ ช4 ในตารางเวรจริง');
    if(!isCh4(current.duty_code)&&!isCh4(assignment.duty_code))throw new Error('รายการนี้ไม่ใช่ ช4');

    const currentOwner=txt(current.staff_id);
    if(currentOwner===receiver){syncLocal(current);return current;}
    if(owner&&currentOwner!==owner){
      // Somebody changed the roster after the cover record was created. Preserve that later edit.
      const err=new Error(`ช4 ถูกแก้เป็น ${staffName(currentOwner)} แล้ว จึงไม่เขียนทับ`);
      err.code='CH4_LATER_CHANGE';
      throw err;
    }

    const saved=await updateAuthoritative(current,owner||currentOwner,receiver);
    syncLocal(saved);
    return await verifyCurrent(saved,receiver);
  }

  function coveredRecords(){
    return (S().shiftConfirmations||[]).filter(r=>txt(r?.status).toLowerCase()==='covered_by_other'&&txt(r?.covered_by_staff_id));
  }
  function localAssignmentFor(rec){
    const rows=S().rosterAssignments||[];
    const rid=txt(rec?.roster_assignment_id);
    if(rid){const x=rows.find(r=>txt(r?.id)===rid);if(x)return x;}
    const d=dateKey(rec?.work_date||rec?.duty_date),owner=txt(rec?.owner_staff_id||rec?.staff_id),code=txt(rec?.duty_code);
    let list=rows.filter(r=>dateKey(r?.duty_date)===d&&txt(r?.staff_id)===owner);
    if(code) {
      const exact=list.find(r=>txt(r?.duty_code)===code);if(exact)return exact;
    }
    list=list.filter(r=>isCh4(r?.duty_code));
    return list.length===1?list[0]:null;
  }
  async function dbAssignmentFor(rec){
    const client=DB();if(!client)return null;
    const rid=txt(rec?.roster_assignment_id);
    if(rid){
      const byId=await client.from('roster_assignments').select('*').eq('id',rid).maybeSingle();
      if(!byId.error&&byId.data)return byId.data;
    }
    const d=dateKey(rec?.work_date||rec?.duty_date),owner=txt(rec?.owner_staff_id||rec?.staff_id),code=txt(rec?.duty_code);
    if(!d||!owner)return null;
    let q=client.from('roster_assignments').select('*').eq('duty_date',d).eq('staff_id',owner);
    if(code&&code!=='ช4')q=q.eq('duty_code',code);else q=q.in('duty_code',['ช4','ช4A','ช4B','ช4-MT']);
    const out=await q.limit(5);
    if(out.error)return null;
    const list=(out.data||[]).filter(r=>isCh4(r?.duty_code));
    return list.length===1?list[0]:(list.find(r=>txt(r?.duty_code)===code)||null);
  }

  let repairing=null;
  async function reconcileExisting(){
    if(repairing)return repairing;
    repairing=(async()=>{
      let moved=0,already=0,skipped=0,failed=0;
      for(const rec of coveredRecords()){
        const owner=txt(rec?.owner_staff_id||rec?.staff_id),receiver=txt(rec?.covered_by_staff_id);
        if(!owner||!receiver||owner===receiver)continue;
        let assignment=localAssignmentFor(rec);
        if(!assignment)assignment=await dbAssignmentFor(rec);
        if(!assignment){skipped++;continue;}
        try{
          const before=txt(assignment.staff_id);
          const out=await transferCh4Assignment(assignment,receiver,{ownerStaffId:owner,repair:true});
          if(before===receiver||txt(out?.staff_id)===receiver&&before!==owner)already++;
          else if(txt(out?.staff_id)===receiver)moved++;
        }catch(err){
          if(err?.code==='CH4_LATER_CHANGE')skipped++;
          else{failed++;console.warn('[V442] repair CH4 cover failed',rec,err);}
        }
      }
      return {moved,already,skipped,failed};
    })().finally(()=>{repairing=null;});
    return repairing;
  }

  // Replace the V441 transfer implementation so every existing V222/V314/V331 handler uses V442 automatically.
  window.cnmiV442Ch4Transfer={transferCh4Assignment,reconcileExisting,staffName};
  window.cnmiV441Ch4Transfer=window.cnmiV441Ch4Transfer||{};
  window.cnmiV441Ch4Transfer.transferCh4Assignment=transferCh4Assignment;
  window.cnmiV441Ch4Transfer.reconcileExisting=reconcileExisting;

  // Run repair after every normal refresh, after shift_confirmations has been loaded.
  const oldLoad=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  if(typeof oldLoad==='function'&&!oldLoad.__v442Wrapped){
    const wrapped=async function loadAllDataV442(){
      const out=await oldLoad.apply(this,arguments);
      await reconcileExisting();
      return out;
    };
    wrapped.__v442Wrapped=true;
    try{window.loadAllData=loadAllData=wrapped;}catch(_){window.loadAllData=wrapped;}
  }

  // Initial repair: the first app load may have started before this final patch file executed.
  // Retry a few times so slow mobile/network loads still get repaired without requiring a manual refresh.
  [900,2200,5000].forEach(delay=>window.setTimeout(async()=>{
    try{
      if(!(S().shiftConfirmations||[]).length)return;
      const result=await reconcileExisting();
      if(result?.moved>0&&typeof window.renderPage==='function')window.renderPage();
    }catch(err){console.warn('[V442] initial repair failed',err);}
  },delay));

  console.info(`${VERSION} loaded`);
})();
