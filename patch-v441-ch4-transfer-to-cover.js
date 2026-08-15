/* CNMI Staff Planner V441
 * CH4 cover = transfer the CH4 roster assignment to the selected replacement.
 * - Keeps CH4 manual: no automatic OT request is created.
 * - Reconciles older covered_by_other records only when the roster still belongs to the original owner.
 * - Safe guard: never overwrites a roster assignment that has already been moved to a different person.
 */
(function(){
  'use strict';
  const VERSION='V441_CH4_TRANSFER_TO_COVER';
  if(window.__CNMI_V441_CH4_TRANSFER_TO_COVER__)return;
  window.__CNMI_V441_CH4_TRANSFER_TO_COVER__=true;

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){try{return window.sb||sb||null;}catch(_){return window.sb||null;}}
  function txt(v){return String(v==null?'':v).trim();}
  function normDate(v){return txt(v).slice(0,10);}
  function currentStaff(){
    try{if(typeof window.currentStaffId==='function')return txt(window.currentStaffId());}catch(_){ }
    const s=S();return txt(s.profile?.staff_id||s.profile?.id||s.user?.id||'');
  }
  function staffName(id){
    const row=(S().staff||[]).find(x=>txt(x?.id)===txt(id))||{};
    return txt(row.nickname||row.full_name||row.email||id||'-');
  }
  function isCovered(rec){return txt(rec?.status).toLowerCase()==='covered_by_other'&&!!txt(rec?.covered_by_staff_id);}
  function assignmentFor(rec){
    const rows=S().rosterAssignments||[];
    const rid=txt(rec?.roster_assignment_id);
    if(rid){const byId=rows.find(r=>txt(r?.id)===rid);if(byId)return byId;}
    const date=normDate(rec?.work_date||rec?.duty_date),owner=txt(rec?.owner_staff_id||rec?.staff_id),code=txt(rec?.duty_code||'ช4');
    return rows.find(r=>normDate(r?.duty_date)===date&&txt(r?.staff_id)===owner&&txt(r?.duty_code||'ช4')===code)||null;
  }
  function updateLocal(assignment,coveredBy,saved){
    const s=S(),id=txt(assignment?.id||saved?.id);
    const patch=row=>{
      if(!row)return row;
      if(id&&txt(row.id)===id)return Object.assign(row,saved||{}, {staff_id:coveredBy});
      if(!id&&normDate(row.duty_date)===normDate(assignment?.duty_date)&&txt(row.duty_code)===txt(assignment?.duty_code)&&txt(row.staff_id)===txt(assignment?.staff_id))return Object.assign(row,saved||{}, {staff_id:coveredBy});
      return row;
    };
    if(Array.isArray(s.rosterAssignments))s.rosterAssignments.forEach(patch);
    if(Array.isArray(s.rosterDraft?.assignments))s.rosterDraft.assignments.forEach(patch);
    if(assignment)Object.assign(assignment,saved||{}, {staff_id:coveredBy});
  }
  async function transferCh4Assignment(assignment,coveredBy,opts={}){
    const client=DB();
    if(!client)throw new Error('ยังเชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    if(!assignment)throw new Error('ไม่พบรายการ ช4');
    const owner=txt(opts.ownerStaffId||assignment.staff_id),receiver=txt(coveredBy);
    if(!receiver)throw new Error('กรุณาเลือกผู้ที่อยู่แทน');
    if(receiver===owner)return assignment;

    // Already transferred locally: treat as success.
    if(txt(assignment.staff_id)===receiver)return assignment;
    // A different later change wins; do not overwrite it.
    if(txt(assignment.staff_id)!==owner)return assignment;

    const patch={staff_id:receiver};
    const updater=currentStaff();if(updater)patch.updated_by=updater;
    const attempts=[patch, {staff_id:receiver}];
    let last=null;
    for(const payload of attempts){
      let q=client.from('roster_assignments').update(payload);
      if(assignment.id)q=q.eq('id',assignment.id).eq('staff_id',owner);
      else q=q.eq('duty_date',normDate(assignment.duty_date)).eq('duty_code',assignment.duty_code||'ช4').eq('staff_id',owner);
      const res=await q.select('*').maybeSingle();
      if(!res.error){
        let saved=res.data||null;
        if(!saved){
          let check=client.from('roster_assignments').select('*');
          if(assignment.id)check=check.eq('id',assignment.id);
          else check=check.eq('duty_date',normDate(assignment.duty_date)).eq('duty_code',assignment.duty_code||'ช4');
          const current=await check.maybeSingle();
          if(current.error)throw current.error;
          if(txt(current.data?.staff_id)===receiver)saved=current.data;
          else if(current.data&&txt(current.data.staff_id)!==owner)return current.data; // a later manual change wins
          else throw new Error('ย้าย ช4 ไม่สำเร็จ');
        }
        updateLocal(assignment,receiver,saved);
        return saved;
      }
      last=res.error;
      if(!/updated_by|column|schema|cache/i.test(txt(res.error?.message)))break;
    }
    throw last||new Error('ย้าย ช4 ไม่สำเร็จ');
  }

  let reconciling=null;
  async function reconcileExisting(){
    if(reconciling)return reconciling;
    reconciling=(async()=>{
      const recs=(S().shiftConfirmations||[]).filter(isCovered);
      let moved=0;
      for(const rec of recs){
        const assignment=assignmentFor(rec);if(!assignment)continue;
        const owner=txt(rec.owner_staff_id),receiver=txt(rec.covered_by_staff_id);
        // Only migrate old records whose roster is still with the original owner.
        if(!owner||!receiver||txt(assignment.staff_id)!==owner)continue;
        try{await transferCh4Assignment(assignment,receiver,{ownerStaffId:owner,quiet:true});moved++;}
        catch(err){console.warn('[V441] reconcile CH4 cover failed',err);}
      }
      return moved;
    })().finally(()=>{reconciling=null;});
    return reconciling;
  }

  // Reconcile after normal data refresh so older "มีคนอยู่แทน" records are reflected in the roster too.
  const oldLoad=window.loadAllData||(typeof loadAllData==='function'?loadAllData:null);
  if(typeof oldLoad==='function'&&!oldLoad.__v441Wrapped){
    const wrapped=async function loadAllDataV441(){
      const out=await oldLoad.apply(this,arguments);
      await reconcileExisting();
      return out;
    };
    wrapped.__v441Wrapped=true;
    try{window.loadAllData=loadAllData=wrapped;}catch(_){window.loadAllData=wrapped;}
  }

  window.cnmiV441Ch4Transfer={transferCh4Assignment,reconcileExisting,staffName};
  window.setTimeout(()=>{void reconcileExisting();},700);
  console.info(`${VERSION} loaded`);
})();
