/* CNMI Staff Planner V532 — Export Guard + Locked Snapshot
 * 1) Pre-export validation: Staff_Total = HR_OT = copy per employee.
 * 2) Freeze immutable batch snapshot in Supabase at export time.
 * 3) Direct rollback of exported batches is disabled; corrections use OT Adjustment Ledger.
 * No OT calculation/rate/carry formula changes.
 */
(function(){
  'use strict';
  if(window.__CNMI_V532_EXPORT_GUARD__) return;
  window.__CNMI_V532_EXPORT_GUARD__=true;
  const VERSION='V532_EXPORT_SNAPSHOT_PREFLIGHT_LOCK';

  function S(){try{return window.state||(typeof state!=='undefined'?state:{});}catch(_){return {};}}
  function DB(){try{return window.sb||(typeof sb!=='undefined'?sb:null);}catch(_){return null;}}
  function admin(){try{return typeof isAdmin==='function'&&isAdmin();}catch(_){return false;}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function round2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  function round4(v){return Math.round((Number(v||0)+Number.EPSILON)*10000)/10000;}
  function staffId(){try{return typeof currentStaffId==='function'?currentStaffId():S()?.profile?.id||null;}catch(_){return S()?.profile?.id||null;}}
  function staffName(id){const p=(S().staff||[]).find(x=>String(x.id)===String(id))||{};return p.nickname||p.full_name||p.name||id||'-';}
  function toast(msg,tone){try{showToast(msg,tone?{tone}:undefined);}catch(_){console.info(msg);}}
  function stable(value){
    if(Array.isArray(value)) return value.map(stable);
    if(value&&typeof value==='object') return Object.keys(value).sort().reduce((o,k)=>{o[k]=stable(value[k]);return o;},{});
    return value;
  }
  async function sha256(value){
    const text=JSON.stringify(stable(value));
    try{
      const data=new TextEncoder().encode(text),digest=await crypto.subtle.digest('SHA-256',data);
      return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(_){
      let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return `fnv-${(h>>>0).toString(16)}`;
    }
  }
  function sheetRows(wb,name){
    try{const ws=wb?.Sheets?.[name];return ws&&window.XLSX?XLSX.utils.sheet_to_json(ws,{defval:null,raw:true}):[];}catch(_){return [];}
  }
  function countBy(rows,key){
    const map=new Map();
    for(const r of rows||[]){const v=String(r?.[key]??'').trim();if(!v)continue;map.set(v,(map.get(v)||0)+1);}return map;
  }
  function closeEnough(a,b,tol=0.01){return Math.abs(Number(a||0)-Number(b||0))<=tol;}

  function preflightReport(ctx){
    const totals=Array.isArray(ctx?.totals)?ctx.totals:[];
    const allocation=ctx?.allocation||{rows:[]};
    const wb=ctx?.workbook;
    const hrRows=sheetRows(wb,'HR_OT');
    const copyRows=sheetRows(wb,'copy');
    const staffRows=sheetRows(wb,'Staff_Total');
    const hrByCode=countBy(hrRows,'no');
    const copyByCode=countBy(copyRows,'no');
    const allocByStaff=new Map();
    (allocation.rows||[]).forEach(r=>{const id=String(r.staff_id||'');if(id)allocByStaff.set(id,(allocByStaff.get(id)||0)+1);});
    const staffByCode=new Map((staffRows||[]).filter(r=>r?.['รหัสพนักงาน']).map(r=>[String(r['รหัสพนักงาน']).trim(),r]));
    const details=[],errors=[],warnings=[];
    let expectedRows=0,totalClaimed=0,totalMoney=0;
    for(const t of totals){
      const sid=String(t.staff_id||''),code=String(t.employeeCode||'').trim(),expected=Math.max(0,Number(t.claimedUnits||0));
      const alloc=Number(allocByStaff.get(sid)||0),hr=Number(hrByCode.get(code)||0),copy=Number(copyByCode.get(code)||0),staffRow=staffByCode.get(code)||null;
      const staffUnits=staffRow?Number(staffRow['จำนวนเวร 8 ชม.']||0):NaN;
      const staffClaimed=staffRow?Number(staffRow['เบิก HR รอบนี้']||0):NaN;
      const staffMoney=staffRow?Number(staffRow['ยอดเงินที่เบิก HR รอบนี้']||staffRow['คำนวณเป็นเงิน']||0):NaN;
      const expectedMoney=round2(Number(t.claimed||0)*Number(t.baseRate||0));
      expectedRows+=expected;totalClaimed+=Number(t.claimed||0);totalMoney+=Number(t.money||expectedMoney||0);
      const row={staff_id:sid,name:staffName(sid),employee_code:code,expected_units:expected,allocation_rows:alloc,hr_ot_rows:hr,copy_rows:copy,staff_total_units:Number.isFinite(staffUnits)?staffUnits:null,claimed_hours:Number(t.claimed||0),staff_total_claimed:Number.isFinite(staffClaimed)?staffClaimed:null,money:Number(t.money||0),staff_total_money:Number.isFinite(staffMoney)?staffMoney:null,carry_in:Number(t.carryIn||0),carry_out:Number(t.carry||0),adjustment_units:Number(t.adjustmentUnits||0)};
      details.push(row);
      if(!code) errors.push(`${row.name}: ไม่มีรหัสพนักงาน`);
      if(expected!==alloc) errors.push(`${row.name}: Summary ${expected} เวร แต่ allocation ${alloc} เวร`);
      if(expected!==hr) errors.push(`${row.name}: Summary ${expected} เวร แต่ HR_OT ${hr} แถว`);
      if(expected!==copy) errors.push(`${row.name}: Summary ${expected} เวร แต่ copy ${copy} แถว`);
      if(staffRow&&Number.isFinite(staffUnits)&&expected!==staffUnits) errors.push(`${row.name}: Staff_Total ${staffUnits} เวร ไม่ตรง Summary ${expected}`);
      if(staffRow&&Number.isFinite(staffClaimed)&&!closeEnough(staffClaimed,Number(t.claimed||0))) errors.push(`${row.name}: Staff_Total ${staffClaimed} ชม. ไม่ตรงเบิก ${Number(t.claimed||0)} ชม.`);
      if(staffRow&&Number.isFinite(staffMoney)&&!closeEnough(staffMoney,Number(t.money||expectedMoney))) errors.push(`${row.name}: เงิน Staff_Total ${staffMoney} ไม่ตรง ${Number(t.money||expectedMoney)}`);
      if(Number(t.unallocatedUnits||0)>0) warnings.push(`${row.name}: มี ${Number(t.unallocatedUnits)} เวรที่จัด dummy ไม่ได้และถูกทบต่อ`);
    }
    if(hrRows.length!==expectedRows) errors.push(`HR_OT รวม ${hrRows.length} แถว แต่ Summary รวม ${expectedRows} เวร`);
    if(copyRows.length!==expectedRows) errors.push(`copy รวม ${copyRows.length} แถว แต่ Summary รวม ${expectedRows} เวร`);
    const knownCodes=new Set(totals.map(t=>String(t.employeeCode||'').trim()).filter(Boolean));
    for(const [code,n] of hrByCode){if(!knownCodes.has(code))errors.push(`HR_OT มีรหัส ${code} จำนวน ${n} แถวที่ไม่อยู่ใน Staff_Total รอบนี้`);}
    for(const [code,n] of copyByCode){if(!knownCodes.has(code))errors.push(`copy มีรหัส ${code} จำนวน ${n} แถวที่ไม่อยู่ใน Staff_Total รอบนี้`);}
    return {ok:errors.length===0,errors,warnings,details,hr_row_count:hrRows.length,copy_row_count:copyRows.length,expected_row_count:expectedRows,total_claimed_hours:round4(totalClaimed),total_money:round2(totalMoney)};
  }

  function snapshotPayload(ctx,report){
    const d=ctx?.data||{};
    return {
      version:VERSION,
      batch_id:ctx.batchId,
      filename:ctx.filename,
      source:d.source||ctx.source||{},
      cycle:d.cycle||ctx.cycle||{},
      generated_at:new Date().toISOString(),
      preflight:{ok:report.ok,warnings:report.warnings,hr_row_count:report.hr_row_count,copy_row_count:report.copy_row_count,expected_row_count:report.expected_row_count,total_claimed_hours:report.total_claimed_hours,total_money:report.total_money},
      staff:report.details,
      source_ot_ids:(d.rows||[]).map(r=>String(r.id||'')).filter(Boolean),
      adjustment_ids:(d.adjustments||[]).map(r=>String(r.id||'')).filter(Boolean)
    };
  }

  async function upsertSnapshot(ctx,report,status='prepared',extra={}){
    const db=DB();if(!db?.from) throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const payload=snapshotPayload(ctx,report),hash=await sha256(payload),source=ctx?.data?.source||ctx?.source||{},cycle=ctx?.data?.cycle||ctx?.cycle||{};
    const row={batch_id:ctx.batchId,source_month:String(source.month||'').slice(0,7),source_start:source.start,source_end:source.end,dummy_start:cycle.start,dummy_end:cycle.end,filename:ctx.filename,snapshot_hash:hash,staff_count:report.details.length,hr_row_count:report.hr_row_count,total_claimed_hours:report.total_claimed_hours,total_money:report.total_money,status,snapshot:payload,exported_by:staffId(),updated_at:new Date().toISOString(),...extra};
    const {error}=await db.from('ot_export_snapshots').upsert(row,{onConflict:'batch_id'});
    if(error){
      const msg=String(error.message||error);
      if(/ot_export_snapshots|42P01|does not exist|schema cache/i.test(msg)) throw new Error('ยังไม่ได้ติดตั้ง V532 กรุณารัน SQL_V532_OT_EXPORT_SNAPSHOT_GUARD.sql ใน Supabase ก่อน Export');
      throw error;
    }
    return {row,payload,hash};
  }

  async function preExport(ctx){
    const report=preflightReport(ctx);
    if(!report.ok){
      const first=report.errors.slice(0,8).join('\n• ');
      throw new Error(`V532 หยุด Export เพราะยอดไม่ตรงกัน\n• ${first}${report.errors.length>8?`\n• และอีก ${report.errors.length-8} จุด`:''}`);
    }
    if(report.warnings.length){
      const msg=`Pre-Export ผ่าน แต่มีข้อควรตรวจสอบ:\n• ${report.warnings.join('\n• ')}\n\nต้องการ Export ต่อหรือไม่?`;
      const ok=typeof confirmDialog==='function'?await confirmDialog(msg,'V532 Pre-Export Check'):window.confirm(msg);
      if(!ok) throw new Error('ยกเลิก Export เพื่อกลับไปตรวจสอบข้อมูล');
    }
    await upsertSnapshot(ctx,report,'prepared');
    window.__CNMI_V532_LAST_EXPORT__={ctx,report};
    return report;
  }
  async function postExport(ctx){
    const memo=window.__CNMI_V532_LAST_EXPORT__;
    const report=memo?.ctx?.batchId===ctx.batchId?memo.report:preflightReport(ctx);
    await upsertSnapshot(ctx,report,'locked',{exported_at:new Date().toISOString()});
    window.__CNMI_V532_LAST_EXPORT__=null;
    toast(`🔒 Batch ${ctx.batchId} ถูกล็อก Snapshot แล้ว • ${report.hr_row_count} เวร • ${report.total_money.toLocaleString('th-TH',{maximumFractionDigits:2})} บาท`);
  }
  async function exportFailed(ctx,err){
    try{
      const memo=window.__CNMI_V532_LAST_EXPORT__,report=memo?.report||preflightReport(ctx);
      await upsertSnapshot(ctx,report,'failed',{revision_note:String(err?.message||err||'Export failed').slice(0,500)});
    }catch(_){ }
    window.__CNMI_V532_LAST_EXPORT__=null;
  }

  function goAdjustment(){
    const s=S();s.page='ot';s.otMenuV369='admin-extra';s.v527ExtraMode='adjustment';s.otGroupV522='ot';
    try{sessionStorage.setItem('cnmi-v528-admin-extra-mode','adjustment');sessionStorage.setItem('cnmi-v528-admin-extra-open','1');sessionStorage.setItem('cnmi-v523-ot-open','1');sessionStorage.setItem('cnmi-sidebar-tree-open-id','ot');}catch(_){ }
    try{renderPage();}catch(_){try{window.renderPage?.();}catch(__){} }
  }
  async function handleLegacyRevert(ids){
    const msg='Batch ที่เคย Export ถูกล็อกเพื่อป้องกันยอดย้อนหลังเปลี่ยนค่ะ\n\nถ้าต้องแก้ยอด ให้สร้าง “ตกเบิก / ลดเบิกเกิน” เป็น Revision แทน โดยไม่แก้ OT/Carry ของ Batch เดิม';
    if(typeof confirmDialog==='function') await confirmDialog(msg,'🔒 Batch Locked'); else window.alert(msg);
    goAdjustment();
    return false;
  }

  async function viewSnapshot(batchId){
    const db=DB();if(!db?.from)return toast('ไม่พบการเชื่อมต่อ Supabase','error');
    const {data,error}=await db.from('ot_export_snapshots').select('*').eq('batch_id',batchId).maybeSingle();
    if(error){const msg=String(error.message||error);if(/ot_export_snapshots|42P01|does not exist|schema cache/i.test(msg))return toast('กรุณารัน SQL V532 ก่อนใช้งาน Snapshot','error');return toast(msg,'error');}
    if(!data)return toast('Batch นี้เป็นข้อมูลเก่าก่อน V532 จึงยังไม่มี Snapshot ที่ล็อก','error');
    const staff=Array.isArray(data.snapshot?.staff)?data.snapshot.staff:[];
    const rows=staff.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.employee_code)}</td><td>${esc(r.claimed_hours)}</td><td>${esc(r.expected_units)}</td><td>${Number(r.money||0).toLocaleString('th-TH',{maximumFractionDigits:2})}</td><td>${esc(r.carry_in)} → ${esc(r.carry_out)}</td></tr>`).join('');
    const html=`<div class="v532-snapshot-modal"><h3>🔒 Snapshot Batch ${esc(batchId)}</h3><p class="hint">${esc(data.filename)}<br>Checksum: <code>${esc(data.snapshot_hash)}</code></p><div class="table-wrap"><table><thead><tr><th>คน</th><th>รหัส</th><th>เบิก HR ชม.</th><th>เวร 8 ชม.</th><th>เงิน</th><th>ทบเข้า → ทบออก</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    if(typeof showModal==='function')return showModal(html);
    const w=window.open('','_blank','width=980,height=720');if(w){w.document.write(`<meta charset="utf-8"><title>Snapshot ${esc(batchId)}</title>${html}`);w.document.close();}
  }

  function decorateVersion(){
    const chip=document.querySelector('.v531-version-chip,.v530-version-chip,.v529-version-chip,.v528-version-chip,.v527-version-chip,.v526-version-chip,.v525-version-chip,.v524-version-chip,.v523-version-chip,.v522-version-chip,.v521-version-chip,.v520-version-chip');
    if(chip&&chip.textContent!=='v532'){chip.textContent='v532';chip.title='Export Guard + Locked Snapshot';chip.classList.add('v532-version-chip');}
  }

  const previousRenderOtPage=window.renderOtPage||(typeof renderOtPage==='function'?renderOtPage:null);
  if(previousRenderOtPage&&!previousRenderOtPage.__v532Wrapped){
    const wrapped=function renderOtPageV532(){
      let html=String(previousRenderOtPage.apply(this,arguments)||'');
      html=html.replace(/ตีกลับเฉพาะชื่อนี้/g,'สร้างรายการปรับยอด').replace(/ตีกลับรายการนี้/g,'สร้างรายการปรับยอด');
      html=html.replace(/data-v318-revert-selected-batch=/g,'data-v532-adjust-batch=').replace(/data-v318-revert-row=/g,'data-v532-adjust-row=');
      html=html.replace(/<button class="danger-btn" type="button" data-v318-revert-whole-batch="([^"]+)">ตีกลับทั้ง Batch<\/button>/g,'<button class="ghost-btn" type="button" data-v532-view-snapshot="$1">🔒 ดู Snapshot ที่ล็อก</button>');
      html=html.replace(/รายการที่ Export แล้วจะมาอยู่หน้านี้ และสามารถตีกลับเป็น Pending ได้/g,'รายการที่ Export แล้วถูกล็อกเป็นหลักฐาน • หากต้องแก้ให้ใช้ ตกเบิก / ลดเบิกเกิน เป็น Revision');
      html=html.replace(/ปุ่มตีกลับจะรีเซ็ตเป็น Pending เพื่อ Export ใหม่ได้/g,'Batch ถูกล็อก • ไม่แก้ Carry/OT ย้อนหลัง • ใช้ Adjustment เป็น Revision');
      if(/data-export-hr-v318/.test(html)&&!html.includes('v532-export-guard-note')){
        html=html.replace(/(<button[^>]+data-export-hr-v318[^>]*>[^<]*<\/button>)/,`$1<div class="notice compact v532-export-guard-note"><b>V532 Pre-Export Guard</b> • ก่อนดาวน์โหลด ระบบจะตรวจรายคนว่า Staff_Total = HR_OT = copy และจะบันทึก Snapshot แบบล็อกอัตโนมัติ ถ้าไม่ตรงแม้แต่คนเดียวจะไม่ Export</div>`);
      }
      return html;
    };
    wrapped.__v532Wrapped=true;
    try{window.renderOtPage=renderOtPage=wrapped;}catch(_){window.renderOtPage=wrapped;}
  }

  const previousRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(previousRenderPage&&!previousRenderPage.__v532VersionWrapped){
    const wrappedPage=function renderPageV532(){const out=previousRenderPage.apply(this,arguments);setTimeout(decorateVersion,0);return out;};
    wrappedPage.__v532VersionWrapped=true;
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  document.addEventListener('click',function(e){
    const view=e.target?.closest?.('[data-v532-view-snapshot]');if(view){e.preventDefault();e.stopPropagation();viewSnapshot(view.dataset.v532ViewSnapshot);return;}
    const adj=e.target?.closest?.('[data-v532-adjust-row],[data-v532-adjust-batch]');if(adj){e.preventDefault();e.stopPropagation();goAdjustment();return;}
  },true);

  function start(){decorateVersion();window.addEventListener('pageshow',decorateVersion);window.addEventListener('hashchange',()=>setTimeout(decorateVersion,50));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.cnmiV532ExportGuard={version:VERSION,preflightReport,preExport,postExport,exportFailed,lockedHistory:true,handleLegacyRevert,viewSnapshot,goAdjustment};
  console.info(`[${VERSION}] loaded`);
})();
