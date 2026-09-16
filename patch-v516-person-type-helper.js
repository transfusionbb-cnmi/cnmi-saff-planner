/* CNMI Staff Planner V516
 * Canonical staff-type classifier.
 * Critical Thai-language fix: "นักเทคนิคการแพทย์" contains the word "แพทย์"
 * but is NOT a physician. Older substring regexes could therefore hide MT staff
 * from HR/manpower screens and falsely treat them as doctors.
 */
(function(){
  'use strict';
  const VERSION='V516_PERSON_TYPE_HELPER';
  if(window.__CNMI_V516_PERSON_TYPE_HELPER__)return;
  window.__CNMI_V516_PERSON_TYPE_HELPER__=true;
  const t=v=>String(v==null?'':v).trim();
  const lower=v=>t(v).toLowerCase();
  function isMedicalTechnologist(p){
    if(!p)return false;
    const vals=[p.staff_type,p.role_type,p.position_type,p.position,p.job_title].map(t);
    return vals.some(v=>/^mt$/i.test(v)||/นักเทคนิคการแพทย์|เทคนิคการแพทย์|medical\s*technologist/i.test(v));
  }
  function isClerk(p){
    if(!p)return false;
    const vals=[p.staff_type,p.role_type,p.position_type,p.position,p.job_title].map(t);
    return vals.some(v=>v==='เคิก'||/clerk|ธุรการ|เจ้าหน้าที่ธุรการ/i.test(v));
  }
  function isPhysician(p){
    if(!p)return false;
    if(isMedicalTechnologist(p)||isClerk(p))return false;
    const type=t(p.staff_type), role=t(p.role), pos=t(p.position), job=t(p.job_title), appRole=t(p.app_role);
    const exact=[type,role,appRole].map(lower);
    if(exact.some(v=>['แพทย์','หมอ','physician','doctor'].includes(v)))return true;
    const descriptives=[type,pos,job];
    if(descriptives.some(v=>/^แพทย์(?:$|[\s/()\-]|เวช|ประจำ|ผู้|เฉพาะ|consult)/i.test(v)))return true;
    if(descriptives.concat([role,appRole]).some(v=>/(^|\s|\/|\(|-)(physician|doctor)(\s|\/|\)|-|$)/i.test(v)))return true;
    const nick=t(p.nickname);
    if(/^หมอ\S*/.test(nick)&&!isMedicalTechnologist(p)&&!isClerk(p))return true;
    return false;
  }
  function group(p){
    if(isPhysician(p))return 'แพทย์';
    if(isClerk(p))return 'เคิก';
    return 'MT';
  }
  window.cnmiPersonTypeV516={version:VERSION,isPhysician,isMedicalTechnologist,isClerk,group};
  console.info(`${VERSION} loaded`);
})();
