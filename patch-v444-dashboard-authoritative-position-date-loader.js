/* CNMI Staff Planner V444
 * Dashboard authoritative daytime-position loader for selected dates.
 *
 * Problem fixed:
 * - V443 lets the dashboard browse another date, but the daytime-position card could
 *   render before that date's rows had been loaded into state.positions.
 * - The monthly position page could therefore show assignments while Dashboard said
 *   "ยังไม่ได้จัดตำแหน่งกลางวัน".
 *
 * V444 behavior:
 * - Whenever Dashboard opens or its selected date changes, read ONLY that date's
 *   daily_positions + daily_position_day_status directly from Supabase.
 * - Replace only that date in local state, then re-render through the existing V434/V435
 *   card chain. Existing visual design, leave overlays, HR badges, position info popup,
 *   holiday hiding, and all other Dashboard cards remain unchanged.
 * - While a weekday date is being verified, an empty position card says
 *   "กำลังโหลดตำแหน่งกลางวัน…" instead of incorrectly saying there is no schedule.
 * - Read-only sync. No SQL/schema/write changes.
 */
(function(){
  'use strict';
  const VERSION='V444_DASHBOARD_AUTHORITATIVE_POSITION_DATE_LOADER';
  if(window.__CNMI_V444_DASHBOARD_AUTHORITATIVE_POSITION_DATE_LOADER__)return;
  window.__CNMI_V444_DASHBOARD_AUTHORITATIVE_POSITION_DATE_LOADER__=true;

  let requestSerial=0;
  let trackedDate='';
  let lastPage='';
  const loadByDate=new Map(); // date -> {status:'loading'|'loaded'|'error',error,at}

  function S(){try{return window.state||state||{};}catch(_){return window.state||{};}}
  function DB(){
    try{if(typeof sb!=='undefined'&&sb?.from)return sb;}catch(_){}
    return window.sb||window.supabaseClient||null;
  }
  function norm(v){
    try{return typeof normalizeDateKey==='function'?String(normalizeDateKey(v)||'').slice(0,10):String(v||'').slice(0,10);}
    catch(_){return String(v||'').slice(0,10);}
  }
  function actualToday(){
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function selectedDate(){
    try{
      const api=window.cnmiDashboardDateV443;
      if(api&&typeof api.selectedDate==='function')return norm(api.selectedDate());
    }catch(_){}
    return norm(S()?.dashboardDateV443)||actualToday();
  }
  function isDashboard(){return String(S()?.page||'')==='dashboard';}
  function friendly(error){
    try{if(typeof friendlyDbError==='function')return friendlyDbError(error);}catch(_){}
    return error?.message||error?.details||error?.hint||String(error||'เกิดข้อผิดพลาด');
  }
  function replaceDate(date,rows,status){
    const d=norm(date),st=S();
    if(!d||!st)return;
    try{
      if(window.cnmiV261?.replaceDateInState){
        window.cnmiV261.replaceDateInState(d,Array.isArray(rows)?rows:[],status||null);
        return;
      }
    }catch(_){}
    st.positions=(Array.isArray(st.positions)?st.positions:[])
      .filter(row=>norm(row?.work_date)!==d)
      .concat(Array.isArray(rows)?rows:[]);
    st.positionDayStatus=(Array.isArray(st.positionDayStatus)?st.positionDayStatus:[])
      .filter(row=>norm(row?.work_date)!==d)
      .concat(status?[status]:[]);
  }
  async function fetchDate(date){
    const d=norm(date);
    if(!d)throw new Error('วันที่ไม่ถูกต้อง');
    try{
      if(window.cnmiV261?.fetchDateFromDatabase)return await window.cnmiV261.fetchDateFromDatabase(d);
    }catch(error){
      // If the shared authoritative helper itself returned a database error, keep that error.
      throw error;
    }
    const db=DB();
    if(!db)throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const [positions,status]=await Promise.all([
      db.from('daily_positions').select('*').eq('work_date',d).order('position_code'),
      db.from('daily_position_day_status').select('*').eq('work_date',d).maybeSingle()
    ]);
    if(positions.error)throw positions.error;
    if(status.error)throw status.error;
    return {rows:positions.data||[],status:status.data||null};
  }
  function renderIfCurrent(date){
    if(!isDashboard()||selectedDate()!==norm(date))return;
    try{if(typeof renderPage==='function')renderPage();else window.renderPage?.();}
    catch(error){console.warn('[V444] dashboard rerender skipped',error);}
  }
  async function loadSelected(date,options={}){
    const d=norm(date);
    if(!d||!isDashboard())return false;
    const current=loadByDate.get(d);
    if(current?.status==='loading'&&!options.force)return current.promise||false;

    const serial=++requestSerial;
    const record={status:'loading',error:null,at:Date.now(),promise:null};
    loadByDate.set(d,record);
    if(options.showLoading!==false)renderIfCurrent(d);

    const promise=(async()=>{
      try{
        const fresh=await fetchDate(d);
        if(serial!==requestSerial||!isDashboard()||selectedDate()!==d)return false;
        replaceDate(d,fresh?.rows||[],fresh?.status||null);
        loadByDate.set(d,{status:'loaded',error:null,at:Date.now(),rows:(fresh?.rows||[]).length,promise:null});
        renderIfCurrent(d);
        console.info(`${VERSION}: selected dashboard date synchronized`,{date:d,rows:(fresh?.rows||[]).length,status:fresh?.status?.status||null});
        return true;
      }catch(error){
        if(serial!==requestSerial)return false;
        console.error(`${VERSION}: selected dashboard date load failed`,error);
        loadByDate.set(d,{status:'error',error:friendly(error),at:Date.now(),promise:null});
        renderIfCurrent(d);
        return false;
      }
    })();
    record.promise=promise;
    return promise;
  }

  function decorateDashboardHtml(html){
    if(!isDashboard())return html;
    const date=selectedDate();
    const load=loadByDate.get(date);
    if(!load)return html;
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'');
      const card=tpl.content.querySelector('[data-v434-daytime-positions]');
      if(card){
        const empty=card.querySelector('.v434-empty');
        if(load.status==='loading'&&empty){
          empty.innerHTML='<span class="v444-position-loading"><span class="v444-position-spinner" aria-hidden="true"></span>กำลังโหลดตำแหน่งกลางวัน…</span>';
          empty.setAttribute('aria-live','polite');
        }else if(load.status==='error'&&empty){
          empty.innerHTML=`<span class="v444-position-load-error">โหลดตำแหน่งกลางวันไม่สำเร็จ<br><small>${escapeSafe(load.error||'กรุณาลองเลือกวันที่อีกครั้ง')}</small></span>`;
          empty.setAttribute('aria-live','polite');
        }else if(load.status==='loaded'&&empty&&date!==actualToday()){
          empty.textContent='ยังไม่ได้จัดตำแหน่งกลางวันสำหรับวันที่เลือก';
        }
      }
      const holder=document.createElement('div');
      holder.appendChild(tpl.content.cloneNode(true));
      return holder.innerHTML;
    }catch(error){
      console.warn('[V444] dashboard position loading decoration skipped',error);
      return html;
    }
  }
  function escapeSafe(v){
    try{return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');}
    catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  }

  const oldDashboard=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof oldDashboard==='function'){
    const wrappedDashboard=function renderDashboardV444(){
      const html=oldDashboard.apply(this,arguments);
      return decorateDashboardHtml(String(html||''));
    };
    try{window.renderDashboard=renderDashboard=wrappedDashboard;}catch(_){window.renderDashboard=wrappedDashboard;}
  }

  const oldRenderPage=window.renderPage||(typeof renderPage==='function'?renderPage:null);
  if(typeof oldRenderPage==='function'){
    const wrappedPage=function renderPageV444(){
      const page=String(S()?.page||'');
      if(page!=='dashboard'){
        if(lastPage==='dashboard'){
          trackedDate='';
          requestSerial+=1;
        }
        lastPage=page;
        return oldRenderPage.apply(this,arguments);
      }

      lastPage='dashboard';
      const d=selectedDate();
      const changed=d&&d!==trackedDate;
      if(changed){
        trackedDate=d;
        requestSerial+=1; // invalidate any previous selected-date response immediately
        loadByDate.set(d,{status:'loading',error:null,at:Date.now(),promise:null});
      }

      const result=oldRenderPage.apply(this,arguments);
      if(changed){
        // Start only after the current render returns, so the existing V443 date controls stay responsive.
        queueMicrotask(()=>{
          if(isDashboard()&&selectedDate()===d)loadSelected(d,{force:true,showLoading:false});
        });
      }
      return result;
    };
    try{window.renderPage=renderPage=wrappedPage;}catch(_){window.renderPage=wrappedPage;}
  }

  // Safety net for the initial dashboard if it was already rendered before this patch executed.
  queueMicrotask(()=>{
    if(!isDashboard())return;
    const d=selectedDate();
    if(!d)return;
    if(!trackedDate)trackedDate=d;
    if(!loadByDate.has(d)){
      loadByDate.set(d,{status:'loading',error:null,at:Date.now(),promise:null});
      renderIfCurrent(d);
      loadSelected(d,{force:true,showLoading:false});
    }
  });

  const style=document.createElement('style');
  style.id='cnmi-v444-dashboard-authoritative-position-date-loader';
  style.textContent=`
    .v444-position-loading{display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#66829a;font-weight:750}
    .v444-position-spinner{width:14px;height:14px;border:2px solid #b9d9ec;border-right-color:#2f91c8;border-radius:50%;animation:v444spin .8s linear infinite;flex:0 0 auto}
    .v444-position-load-error{color:#a85b5b;line-height:1.35}.v444-position-load-error small{font-size:10px;color:#8799a9;font-weight:600}
    @keyframes v444spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  window.cnmiDashboardPositionLoaderV444={loadSelected,selectedDate,loadByDate};
  console.info(`${VERSION} loaded`);
})();
