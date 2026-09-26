/* In-app release notes, per signed-in user. Remote manifest also alerts open older tabs. */
(()=>{
  'use strict';
  const RUNNING_VERSION=568;
  const bundled={version:'568',title:'อัปเดต Staff Planner v568',changes:[
    'แพทย์จัดการตาราง Consult ได้ครบ: ในเวลา นอกเวลา แก้เฉพาะวัน และรายการที่บันทึก',
    'เพิ่มหน้าต่างแจ้งรายการอัปเดตให้ผู้ใช้แต่ละคนเมื่อเปิดแอพหรือกลับมาใช้งาน'
  ]};
  let checking=false, showing=false, lastFetch=0, pending=null;
  function signedIn(){return !!(typeof state!=='undefined'&&state.profile&&document.getElementById('appView')&&!document.getElementById('appView').classList.contains('hidden'));}
  function identity(){return String(state.session?.user?.id||state.profile?.user_id||state.profile?.id||'').trim();}
  function safe(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function show(info){
    if(showing||!signedIn()||!identity())return;
    const version=String(info.version||'');
    if(!/^\d+$/.test(version)||!Array.isArray(info.changes)||!info.changes.length)return;
    const key=`cnmi-release-seen:${identity()}`;
    try{if(Number(localStorage.getItem(key)||0)>=Number(version))return;}catch(_){}
    // Leave an existing task dialog undisturbed; check again shortly.
    if(document.getElementById('modal')&&!document.getElementById('modal').classList.contains('hidden'))return;
    showing=true;
    const overlay=document.createElement('div');overlay.className='v568-release-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','มีอะไรใหม่ในแอพ');
    const newer=Number(version)>RUNNING_VERSION;
    overlay.innerHTML=`<div class="v568-release-card"><span class="v568-release-tag">มีอะไรใหม่</span><h2>${safe(info.title||`อัปเดต Staff Planner v${version}`)}</h2><ul>${info.changes.slice(0,12).map(x=>`<li>${safe(x)}</li>`).join('')}</ul><div class="v568-release-actions"><button type="button" data-release-close>รับทราบ</button>${newer?'<button type="button" data-release-reload>รีโหลดเพื่อใช้เวอร์ชันใหม่</button>':''}</div></div>`;
    const style=document.getElementById('v568-release-style');
    if(!style){const s=document.createElement('style');s.id='v568-release-style';s.textContent='.v568-release-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(16,35,55,.58);display:grid;place-items:center;padding:18px}.v568-release-card{box-sizing:border-box;background:white;border-radius:22px;padding:25px;width:min(520px,100%);box-shadow:0 18px 55px #18314d55;color:#17344f;font-family:inherit}.v568-release-tag{display:inline-block;border-radius:99px;padding:5px 12px;background:#e5f4ff;color:#17699b;font-weight:700}.v568-release-card h2{margin:14px 0}.v568-release-card ul{padding-left:24px;line-height:1.7}.v568-release-card li{margin:8px 0}.v568-release-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px}.v568-release-actions button{border:1px solid #b8d4e8;border-radius:11px;background:#e7f5ff;padding:10px 16px;color:#145582;font:inherit;font-weight:700;cursor:pointer}.v568-release-actions [data-release-reload]{background:#66b8e3;color:white;border-color:#66b8e3}';document.head.appendChild(s);}
    function dismiss(reload){try{localStorage.setItem(key,version);}catch(_){}overlay.remove();showing=false;if(reload)location.reload();}
    overlay.querySelector('[data-release-close]').addEventListener('click',()=>dismiss(false));
    overlay.querySelector('[data-release-reload]')?.addEventListener('click',()=>dismiss(true));
    document.body.appendChild(overlay);
    overlay.querySelector('button')?.focus();
  }
  async function check(){
    if(checking||showing||!signedIn())return;
    if(pending){show(pending);if(showing)return;}
    if(Date.now()-lastFetch<300000)return;
    checking=true;
    lastFetch=Date.now();
    try{
      const response=await fetch(`release-notes.json?t=${Date.now()}`,{cache:'no-store'});
      pending=response.ok?await response.json():bundled;
    }catch(_){pending=bundled;}finally{checking=false;show(pending);}
  }
  // Login can complete after scripts load; the interval also observes a restored session.
  setInterval(check,3000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastFetch=0;check();}});
  window.addEventListener('focus',()=>{lastFetch=0;check();});
})();
