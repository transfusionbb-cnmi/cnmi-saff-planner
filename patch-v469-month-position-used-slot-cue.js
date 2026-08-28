/* CNMI Staff Planner V469
   Monthly daytime-position assignment cues.
   - Shows ✓ + assignee name for positions already used on the same date.
   - Disables positions already assigned to another staff member to prevent accidental duplicates.
   - Highlights cells that already have an assignment.
   - UI only; no SQL/schema/data migration.
*/
(function(){
  'use strict';
  const VERSION='V469_MONTH_POSITION_USED_SLOT_CUE';
  if(window.__CNMI_V469_MONTH_POSITION_USED_SLOT_CUE__) return;
  window.__CNMI_V469_MONTH_POSITION_USED_SLOT_CUE__=true;

  let queued=false;
  function S(){try{return state||window.state||null;}catch(_){return window.state||null;}}
  function norm(v){return String(v==null?'':v).trim();}
  function isAdminSafe(){
    try{return !!isAdmin();}
    catch(_){return String(S()?.profile?.role||'').trim().toLowerCase()==='admin';}
  }
  function isTarget(){return String(S()?.page||'')==='positionMonth'&&isAdminSafe();}

  function staffLabel(staffId,cell){
    const id=norm(staffId);
    const person=(S()?.staff||[]).find(row=>norm(row?.id)===id);
    const fromState=norm(person?.nickname||person?.full_name||person?.display_name||person?.email);
    if(fromState)return fromState;
    const fromRow=norm(cell?.closest?.('tr')?.querySelector?.('.v275-sticky-name b')?.textContent);
    return fromRow||'ไม่ทราบชื่อ';
  }

  function selects(){
    return [...document.querySelectorAll('.v275-position-wrap [data-v275-position-cell] [data-v275-position-select]')];
  }

  function usageByDate(list){
    const result=new Map();
    list.forEach(select=>{
      const cell=select.closest('[data-v275-position-cell]');
      const date=norm(cell?.dataset?.date);
      const staffId=norm(cell?.dataset?.staffId);
      const code=norm(select.value);
      if(!date||!staffId||!code)return;
      if(!result.has(date))result.set(date,new Map());
      const day=result.get(date);
      if(!day.has(code))day.set(code,[]);
      day.get(code).push({staffId,name:staffLabel(staffId,cell),select,cell});
    });
    return result;
  }

  function optionBase(option){
    if(!option)return'';
    if(option.value==='')return'ว่าง';
    if(!option.dataset.v469BaseLabel){
      option.dataset.v469BaseLabel=norm(option.value)||norm(option.textContent);
    }
    return option.dataset.v469BaseLabel;
  }

  function applySelect(select,usage){
    const cell=select.closest('[data-v275-position-cell]');
    if(!cell)return;
    const date=norm(cell.dataset.date);
    const staffId=norm(cell.dataset.staffId);
    const current=norm(select.value);
    const day=usage.get(date)||new Map();

    [...select.options].forEach(option=>{
      const code=norm(option.value);
      if(!code){
        option.disabled=false;
        option.textContent='ว่าง';
        return;
      }
      const base=optionBase(option);
      const holders=day.get(code)||[];
      if(!holders.length){
        option.disabled=false;
        option.textContent=base;
        option.title=`${base} — ยังว่าง`;
        return;
      }
      const own=holders.some(holder=>holder.staffId===staffId);
      const names=[...new Set(holders.map(holder=>holder.name).filter(Boolean))];
      const nameText=names.join(', ')||'มีผู้รับผิดชอบแล้ว';
      if(own&&current===code){
        option.disabled=false;
        option.textContent=`✓ ${base} · ${nameText}`;
        option.title=`${base} — ${nameText}`;
      }else{
        option.disabled=true;
        option.textContent=`✓ ${base} · ${nameText} · ใช้แล้ว`;
        option.title=`${base} ใช้แล้วโดย ${nameText}`;
      }
    });

    cell.classList.toggle('v469-position-assigned',!!current);
    if(current){
      const holders=day.get(current)||[];
      const own=holders.find(holder=>holder.staffId===staffId);
      const who=own?.name||staffLabel(staffId,cell);
      select.title=`✓ จัดแล้ว: ${current} — ${who}`;
      select.setAttribute('aria-label',`จัดแล้ว ${current} ผู้รับผิดชอบ ${who} วันที่ ${date}`);
    }else{
      select.title='ยังไม่ได้จัดตำแหน่ง';
    }
  }

  function ensureLegend(){
    const page=document.querySelector('.v275-page');
    if(!page||page.querySelector('[data-v469-position-legend]'))return;
    const toolbar=page.querySelector('.card .toolbar');
    if(!toolbar)return;
    const legend=document.createElement('span');
    legend.dataset.v469PositionLegend='';
    legend.className='v469-position-legend';
    legend.textContent='✓ มีคนแล้ว · ตัวเลือกจะแสดงชื่อผู้รับผิดชอบ';
    toolbar.appendChild(legend);
  }

  function apply(){
    if(!isTarget())return;
    const list=selects();
    if(!list.length)return;
    const usage=usageByDate(list);
    list.forEach(select=>applySelect(select,usage));
    ensureLegend();
  }

  function queue(delay=0){
    if(queued)return;
    queued=true;
    const run=()=>requestAnimationFrame(()=>{queued=false;apply();});
    delay?setTimeout(run,delay):run();
  }

  const style=document.createElement('style');
  style.id='v469-month-position-used-slot-cue-style';
  style.textContent=`
    .v275-page .v275-position-cell.v469-position-assigned{
      border-radius:8px;
      box-shadow:inset 3px 0 0 #22c55e;
      background:rgba(240,253,244,.72);
    }
    .v275-page .v275-position-cell.v469-position-assigned select{
      background:#f0fdf4!important;
      border-color:#86efac!important;
      color:#166534!important;
      font-weight:800!important;
    }
    .v275-page .v469-position-legend{
      display:inline-flex;
      align-items:center;
      min-height:30px;
      padding:5px 9px;
      border:1px solid #bbf7d0;
      border-radius:999px;
      background:#f0fdf4;
      color:#166534;
      font-size:11px;
      font-weight:800;
      white-space:nowrap;
    }
    @media(max-width:820px){
      .v275-page .v469-position-legend{font-size:9px;min-height:26px;padding:4px 7px}
    }
  `;
  document.head.appendChild(style);

  /* Native <select> fires input before the legacy V290 capture-change handler.
     Refreshing here makes the cue immediate without touching the save logic. */
  window.addEventListener('input',event=>{
    if(!isTarget())return;
    if(event.target?.matches?.('.v275-position-wrap [data-v275-position-select]'))queue();
  },true);
  window.addEventListener('pointerdown',event=>{
    if(!isTarget())return;
    if(event.target?.matches?.('.v275-position-wrap [data-v275-position-select]'))apply();
  },true);
  window.addEventListener('focusin',event=>{
    if(!isTarget())return;
    if(event.target?.matches?.('.v275-position-wrap [data-v275-position-select]'))apply();
  },true);
  window.addEventListener('click',event=>{
    if(!isTarget())return;
    if(event.target?.closest?.('.v275-position-wrap'))queue(20);
  },true);

  const root=document.getElementById('pageContent')||document.body;
  if(root){
    new MutationObserver(mutations=>{
      if(!isTarget())return;
      const relevant=mutations.some(m=>{
        if(m.type==='attributes'&&m.attributeName==='data-v290-save-state')return true;
        return [...(m.addedNodes||[])].some(node=>node?.nodeType===1&&(node.matches?.('.v275-position-wrap,[data-v275-position-cell]')||node.querySelector?.('.v275-position-wrap,[data-v275-position-cell]')));
      });
      if(relevant)queue(10);
    }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-v290-save-state']});
  }

  document.addEventListener('DOMContentLoaded',()=>queue(80),{once:true});
  setTimeout(apply,0);
  setTimeout(apply,250);

  window.cnmiV469={apply,version:VERSION};
  console.info(`${VERSION} loaded`);
})();
