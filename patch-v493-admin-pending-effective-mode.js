/* CNMI Staff Planner V493
 * Admin pending visibility follows EFFECTIVE UI MODE, not the account's stored role.
 *
 * Problem fixed:
 * - A real Admin account can switch to "Staff mode" for normal staff use.
 * - V492 intentionally used actualAdmin() to own the pending panel, which caused
 *   "รอดำเนินการ Admin" to reappear even while the UI was in Staff mode.
 *
 * V493 rule:
 * - Admin mode  => Admin pending panel may be shown and manually refreshed.
 * - Staff mode  => Admin pending panel is removed and manual refresh is blocked.
 * - Non-admin   => Admin pending panel is never shown.
 *
 * No SQL/schema changes required.
 */
(function(){
  'use strict';
  const VERSION='V493_ADMIN_PENDING_EFFECTIVE_MODE';
  if(window.__CNMI_V493_ADMIN_PENDING_EFFECTIVE_MODE__)return;
  window.__CNMI_V493_ADMIN_PENDING_EFFECTIVE_MODE__=true;

  function effectiveAdmin(){
    try{
      if(typeof window.isAdmin==='function') return !!window.isAdmin();
      if(typeof isAdmin==='function') return !!isAdmin();
    }catch(_){ }
    try{
      const actual=typeof window.isActualAdminV167==='function' ? !!window.isActualAdminV167() : String((window.state||state)?.profile?.role||'').toLowerCase()==='admin';
      const mode=typeof window.getViewAsModeV167==='function' ? String(window.getViewAsModeV167()||'').toLowerCase() : String((window.state||state)?.viewAsMode||'').toLowerCase();
      return actual && mode==='admin';
    }catch(_){return false;}
  }

  function stripAdminPending(root){
    if(effectiveAdmin())return;
    try{
      (root||document).querySelectorAll('[data-v460-admin-pending],[data-v492-admin-pending]').forEach(el=>el.remove());
    }catch(_){ }
  }

  function stripFromHtml(html){
    if(effectiveAdmin())return html;
    try{
      const t=document.createElement('template');
      t.innerHTML=String(html||'');
      t.content.querySelectorAll('[data-v460-admin-pending],[data-v492-admin-pending]').forEach(el=>el.remove());
      const out=document.createElement('div');
      out.appendChild(t.content.cloneNode(true));
      return out.innerHTML;
    }catch(_){return html;}
  }

  // V493 loads after V492, so this is the final dashboard visibility guard.
  const previous=window.renderDashboard||(typeof renderDashboard==='function'?renderDashboard:null);
  if(typeof previous==='function'){
    const wrapped=function renderDashboardV493(){
      return stripFromHtml(previous.apply(this,arguments));
    };
    try{window.renderDashboard=renderDashboard=wrapped;}catch(_){window.renderDashboard=wrapped;}
  }

  // Block V492's manual Supabase refresh while the same Admin account is viewing as Staff.
  try{
    const api=window.cnmiV492;
    if(api?.loadFresh && !api.__v493EffectiveModeWrapped){
      const original=api.loadFresh.bind(api);
      api.loadFresh=async function(){
        if(!effectiveAdmin()){
          try{
            if(api.store){
              api.store.status='idle'; api.store.categories=[]; api.store.error=''; api.store.loadedAt=0; api.store.promise=null;
            }
          }catch(_){ }
          stripAdminPending(document);
          return [];
        }
        return original.apply(api,arguments);
      };
      api.__v493EffectiveModeWrapped=true;
    }
  }catch(_){ }

  // Remove a panel immediately if an older patch redraws it after a role-mode switch.
  const enforce=()=>stripAdminPending(document.getElementById('pageContent')||document);
  const mo=new MutationObserver(()=>enforce());
  try{mo.observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}catch(_){ }
  document.addEventListener('click',()=>setTimeout(enforce,0),true);
  window.addEventListener('pageshow',()=>setTimeout(enforce,0));
  window.addEventListener('focus',()=>setTimeout(enforce,0));
  setTimeout(enforce,0);
  setTimeout(enforce,150);

  window.cnmiV493={version:VERSION,effectiveAdmin,enforce};
  console.info(`${VERSION} loaded`);
})();
