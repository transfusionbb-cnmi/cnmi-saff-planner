/* =========================
   V240 Default Slot Templates
   - Adds CNMI latest default slot templates for 8-14 normal staff sets.
   - Adds outing templates for 12/13/14 people.
   - Lets Admin restore/save all templates in one click instead of retyping after updates.
   ========================= */
(function(){
  'use strict';
  const VERSION = 'V240_DEFAULT_SLOT_TEMPLATES_OUTING_COUNT_FIX';
  if (window.__CNMI_V240_DEFAULT_SLOT_TEMPLATES__) return;
  window.__CNMI_V240_DEFAULT_SLOT_TEMPLATES__ = true;

  const CFG_PREFIX = '__CNMI_SLOT_TEMPLATE_V224__';
  const LS_KEY = 'cnmi_slot_template_v224_cache';
  const SEED_KEY = 'cnmi_slot_template_v240_seeded_once';
  const DAY_SETS = [8,9,10,11,12,13,14];
  const DEFAULT_CONFIGS_232 = {
  "day": {
    "8": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual",
        "position_code": "BB-Manual",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 3,
        "eligibility_code": "BB-Manual",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB  (เช้า-เย็น)",
        "sort_order": 4,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 6,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 7,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 8,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "9": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual",
        "position_code": "BB-Manual",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 3,
        "eligibility_code": "BB-Manual",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 4,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 6,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 7,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 8,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 9,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "10": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual",
        "position_code": "BB-Manual",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 4,
        "eligibility_code": "BB-Manual",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 7,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 8,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 9,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 10,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "11": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 8,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 9,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 10,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 11,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "12": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adamt, รูดสาย, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด, การปั่นแยกส่วนประกอบโลหิต",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 8,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 9,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 10,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 11,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 12,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "13": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 3",
        "position_code": "BB-Manual 3",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "วัดค่า pH & Adam, การปั่นแยกส่วนประกอบโลหิต, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 6,
        "eligibility_code": "BB-Manual 3",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": ", รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 8,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 9,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 10,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 11,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 12,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด, รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 13,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      }
    ],
    "14": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "BB-Report 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "BB-Report 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "BB-Approve",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 4,
        "eligibility_code": "BB-Manual 1",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag",
        "sort_order": 5,
        "eligibility_code": "BB-Manual 2",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Manual 3",
        "position_code": "BB-Manual 3",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "วัดค่า pH & Adam, การปั่นแยกส่วนประกอบโลหิต, การแปะ Bag, ทำ Pool Plt, รูดสาย, QC ถุงเลือด",
        "sort_order": 6,
        "eligibility_code": "BB-Manual 3",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "BB-Support",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 8,
        "eligibility_code": "DR-Register",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 1) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 9,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview",
        "position_code": "DR-Finger+Interview",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการซักประวัติผู้บริจาค (ประจำห้องสัมภาษณ์ 2) และการเจาะปลายนิ้วเพื่อคัดกรองเบื้องต้น",
        "sort_order": 10,
        "eligibility_code": "DR-Finger+Interview",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 11,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Main",
        "position_code": "DR-Main",
        "zone": "Donor",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหลักคือการเจาะเลือดผู้บริจาคและการเก็บเคส Reaction ต่างๆ เพื่อให้เป็นไปตามเป้าหมายของหน่วยบริการ",
        "sort_order": 12,
        "eligibility_code": "DR-Main",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Processing",
        "position_code": "DR-Processing",
        "zone": "Donor",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "นำส่งเลือดเข้าห้องปั่น, จัดการเลือดกลุ่ม Infectious, แจ้งตำแหน่ง Manual 3 ว่า ถุงไหน เจาะมาเพื่อ QC ถุงเลือด",
        "sort_order": 13,
        "eligibility_code": "DR-Processing",
        "is_outing": false,
        "is_active": true
      },
      {
        "code": "DR-Preparing",
        "position_code": "DR-Preparing",
        "zone": "Donor",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานเตรียม Set อุปกรณ์เจาะเลือด, การเติมน้ำดื่ม/ขนมสำหรับผู้บริจาค, และการดูแลความสะอาดเรียบร้อยของเตียงบริจาค",
        "sort_order": 14,
        "eligibility_code": "DR-Preparing",
        "is_outing": false,
        "is_active": true
      }
    ]
  },
  "outing": [
    {
      "code": "BB-Report 1",
      "position_code": "BB-Report 1",
      "zone": "Blood Bank",
      "main_rule": "MT เท่านั้น",
      "break_time": "11:00",
      "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
      "sort_order": 1,
      "eligibility_code": "OUTING:BB-Report 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Report 2",
      "position_code": "BB-Report 2",
      "zone": "Blood Bank",
      "main_rule": "MT เท่านั้น",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
      "sort_order": 2,
      "eligibility_code": "OUTING:BB-Report 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Approve",
      "position_code": "BB-Approve",
      "zone": "Blood Bank",
      "main_rule": "MT เท่านั้น",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
      "sort_order": 3,
      "eligibility_code": "OUTING:BB-Approve",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Manual 1",
      "position_code": "BB-Manual 1",
      "zone": "Manual",
      "main_rule": "MT เท่านั้น",
      "break_time": "11:00",
      "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
      "sort_order": 4,
      "eligibility_code": "OUTING:BB-Manual 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Manual 2",
      "position_code": "BB-Manual 2",
      "zone": "Manual",
      "main_rule": "MT เท่านั้น",
      "break_time": "11:00",
      "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
      "sort_order": 5,
      "eligibility_code": "OUTING:BB-Manual 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "BB-Support",
      "position_code": "BB-Support",
      "zone": "Blood Bank",
      "main_rule": "Clerk หรือ แตง",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
      "sort_order": 6,
      "eligibility_code": "OUTING:BB-Support",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Register",
      "position_code": "DR-Register",
      "zone": "ออกหน่วย",
      "main_rule": "Clerk หรือ แตง",
      "break_time": "12:00",
      "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
      "sort_order": 7,
      "eligibility_code": "OUTING:DR-Register",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Preparation",
      "position_code": "DR-Preparation",
      "zone": "ออกหน่วย",
      "main_rule": "มัส",
      "break_time": "12:00",
      "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
      "sort_order": 8,
      "eligibility_code": "OUTING:DR-Preparation",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Finger+Interview 1",
      "position_code": "DR-Finger+Interview 1",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
      "sort_order": 9,
      "eligibility_code": "OUTING:DR-Finger+Interview 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Finger+Interview 2",
      "position_code": "DR-Finger+Interview 2",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
      "sort_order": 10,
      "eligibility_code": "OUTING:DR-Finger+Interview 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Main 1",
      "position_code": "DR-Main 1",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
      "sort_order": 11,
      "eligibility_code": "OUTING:DR-Main 1",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Main 2",
      "position_code": "DR-Main 2",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
      "sort_order": 12,
      "eligibility_code": "OUTING:DR-Main 2",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Main 3",
      "position_code": "DR-Main 3",
      "zone": "ออกหน่วย",
      "main_rule": "MT หรือ แตง",
      "break_time": "12:00",
      "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
      "sort_order": 13,
      "eligibility_code": "OUTING:DR-Main 3",
      "is_outing": true,
      "is_active": true
    },
    {
      "code": "DR-Support",
      "position_code": "DR-Support",
      "zone": "ออกหน่วย",
      "main_rule": "Clerk",
      "break_time": "12:00",
      "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
      "sort_order": 14,
      "eligibility_code": "OUTING:DR-Support",
      "is_outing": true,
      "is_active": true
    }
  ],
  "outing_by_count": {
    "12": [
      {
        "code": "BB-Report",
        "position_code": "BB-Report",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "OUTING:BB-Report",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "OUTING:BB-Approve",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
        "sort_order": 3,
        "eligibility_code": "OUTING:BB-Manual 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
        "sort_order": 4,
        "eligibility_code": "OUTING:BB-Manual 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "OUTING:BB-Support",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "OUTING:DR-Register",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Preparation",
        "position_code": "DR-Preparation",
        "zone": "ออกหน่วย",
        "main_rule": "มัส",
        "break_time": "12:00",
        "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
        "sort_order": 7,
        "eligibility_code": "OUTING:DR-Preparation",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 1",
        "position_code": "DR-Finger+Interview 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 8,
        "eligibility_code": "OUTING:DR-Finger+Interview 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 2",
        "position_code": "DR-Finger+Interview 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 9,
        "eligibility_code": "OUTING:DR-Finger+Interview 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 1",
        "position_code": "DR-Main 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 10,
        "eligibility_code": "OUTING:DR-Main 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 2",
        "position_code": "DR-Main 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 11,
        "eligibility_code": "OUTING:DR-Main 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Support",
        "position_code": "DR-Support",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk",
        "break_time": "12:00",
        "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
        "sort_order": 12,
        "eligibility_code": "OUTING:DR-Support",
        "is_outing": true,
        "is_active": true
      }
    ],
    "13": [
      {
        "code": "BB-Report",
        "position_code": "BB-Report",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "OUTING:BB-Report",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 2,
        "eligibility_code": "OUTING:BB-Approve",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
        "sort_order": 3,
        "eligibility_code": "OUTING:BB-Manual 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
        "sort_order": 4,
        "eligibility_code": "OUTING:BB-Manual 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
        "sort_order": 5,
        "eligibility_code": "OUTING:BB-Support",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "OUTING:DR-Register",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Preparation",
        "position_code": "DR-Preparation",
        "zone": "ออกหน่วย",
        "main_rule": "มัส",
        "break_time": "12:00",
        "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
        "sort_order": 7,
        "eligibility_code": "OUTING:DR-Preparation",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 1",
        "position_code": "DR-Finger+Interview 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 8,
        "eligibility_code": "OUTING:DR-Finger+Interview 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 2",
        "position_code": "DR-Finger+Interview 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 9,
        "eligibility_code": "OUTING:DR-Finger+Interview 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 1",
        "position_code": "DR-Main 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 10,
        "eligibility_code": "OUTING:DR-Main 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 2",
        "position_code": "DR-Main 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 11,
        "eligibility_code": "OUTING:DR-Main 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 3",
        "position_code": "DR-Main 3",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 12,
        "eligibility_code": "OUTING:DR-Main 3",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Support",
        "position_code": "DR-Support",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk",
        "break_time": "12:00",
        "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
        "sort_order": 13,
        "eligibility_code": "OUTING:DR-Support",
        "is_outing": true,
        "is_active": true
      }
    ],
    "14": [
      {
        "code": "BB-Report 1",
        "position_code": "BB-Report 1",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, และทำ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 1,
        "eligibility_code": "OUTING:BB-Report 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Report 2",
        "position_code": "BB-Report 2",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการออกผลตรวจ Routine, ทำหน้าที่คล้องเลือด (Cross-match), พิมพ์รายงาน A4 สำหรับแจ้งผล, ตรวจสอบ QC LDPRC (Post-storage) เพื่อความถูกต้องของผลแล็บ",
        "sort_order": 2,
        "eligibility_code": "OUTING:BB-Report 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Approve",
        "position_code": "BB-Approve",
        "zone": "Blood Bank",
        "main_rule": "MT เท่านั้น",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบการอนุมัติผลในระบบ LIS, การรับเลือดเข้า Stock, การจ่ายเลือดทั้งกรณีปกติและเร่งด่วน (OR/ER), และการปลดเลือดตามขั้นตอน",
        "sort_order": 3,
        "eligibility_code": "OUTING:BB-Approve",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 1",
        "position_code": "BB-Manual 1",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, การแปะ Bag, ทำ Pool Plt",
        "sort_order": 4,
        "eligibility_code": "OUTING:BB-Manual 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Manual 2",
        "position_code": "BB-Manual 2",
        "zone": "Manual",
        "main_rule": "MT เท่านั้น",
        "break_time": "11:00",
        "job_desc": "รับผิดชอบงานเทคนิคขั้นสูง ได้แก่ การใช้เครื่อง IH-500, การตรวจ Ab ID, งาน Manual ทั้งหมด, การแปะ Bag, วัดค่า pH & Adam",
        "sort_order": 5,
        "eligibility_code": "OUTING:BB-Manual 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "BB-Support",
        "position_code": "BB-Support",
        "zone": "Blood Bank",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานสนับสนุนที่ช่วยให้งานในห้อง BB ดำเนินไปอย่างต่อเนื่อง เช่น การรับแล็บ, การเดินส่งเลือด, การรับโทรศัพท์ประสานงาน, และการรับเลือดจากสภากาชาด, และบันทึกอุณหภูมิห้อง BB และ Manual (เช้า-เย็น)",
        "sort_order": 6,
        "eligibility_code": "OUTING:BB-Support",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Register",
        "position_code": "DR-Register",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk หรือ แตง",
        "break_time": "12:00",
        "job_desc": "รับผิดชอบงานหน้าด่าน คือการลงทะเบียนผู้บริจาค, คัดกรอง Vital signs (ความดัน, ชีพจร, อุณหภูมิ), และบันทึกอุณหภูมิห้อง Donor (เช้า-เย็น)",
        "sort_order": 7,
        "eligibility_code": "OUTING:DR-Register",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Preparation",
        "position_code": "DR-Preparation",
        "zone": "ออกหน่วย",
        "main_rule": "มัส",
        "break_time": "12:00",
        "job_desc": "เตรียม set ดูแลโปรแกรมออกหน่วย กรณีไปหน้างานแล้วเกิดปัญหา ดูแลภาพรวม กลับมาลงทะเบียน",
        "sort_order": 8,
        "eligibility_code": "OUTING:DR-Preparation",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 1",
        "position_code": "DR-Finger+Interview 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 9,
        "eligibility_code": "OUTING:DR-Finger+Interview 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Finger+Interview 2",
        "position_code": "DR-Finger+Interview 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "คัดกรอง สัมภาษณ์ เจาะปลายนิ้ว กลับมาปั่นเลือด",
        "sort_order": 10,
        "eligibility_code": "OUTING:DR-Finger+Interview 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 1",
        "position_code": "DR-Main 1",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 11,
        "eligibility_code": "OUTING:DR-Main 1",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 2",
        "position_code": "DR-Main 2",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 12,
        "eligibility_code": "OUTING:DR-Main 2",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Main 3",
        "position_code": "DR-Main 3",
        "zone": "ออกหน่วย",
        "main_rule": "MT หรือ แตง",
        "break_time": "12:00",
        "job_desc": "เจาะเลือดตัวหลัก กลับมาปั่นเลือด",
        "sort_order": 13,
        "eligibility_code": "OUTING:DR-Main 3",
        "is_outing": true,
        "is_active": true
      },
      {
        "code": "DR-Support",
        "position_code": "DR-Support",
        "zone": "ออกหน่วย",
        "main_rule": "Clerk",
        "break_time": "12:00",
        "job_desc": "เก็บเซตเจาะ เก็บเลือด เตรียมน้ำดื่ม/ขนม เช็ดเตียง เก็บถุงเลือด จดอุณหภูมิห้องก่อนออกหน่วย",
        "sort_order": 14,
        "eligibility_code": "OUTING:DR-Support",
        "is_outing": true,
        "is_active": true
      }
    ]
  }
};

  function clone(x){ try { return JSON.parse(JSON.stringify(x || null)); } catch (_) { return x; } }
  function esc(v){
    try { return escapeHtml(v == null ? '' : String(v)); }
    catch (_) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  }
  function toast(msg, tone){ try { showToast(msg, tone ? { tone } : undefined); } catch (_) { console.info(msg); } }
  function friendly(err){ try { return friendlyDbError(err); } catch (_) { return err?.message || err?.details || err?.hint || String(err || 'เกิดข้อผิดพลาด'); } }
  function currentStaffSafe(){ try { return currentStaffId(); } catch (_) { return state?.profile?.id || null; } }
  function cfgKey(kind, n){ return kind === 'outing' ? `${CFG_PREFIX}:OUTING` : `${CFG_PREFIX}:DAY:${Number(n)}`; }
  function normalizeRow(r, idx, isOutingSet){
    const code = String(r?.code || r?.position_code || '').trim();
    if (!code) return null;
    const zone = String(r?.zone || '').trim() || (isOutingSet ? 'ออกหน่วย' : 'Blood Bank');
    return {
      code,
      position_code:code,
      zone,
      main_rule:String(r?.main_rule || '').trim(),
      break_time:String(r?.break_time || '').trim() || '12:00',
      job_desc:String(r?.job_desc || r?.detail || '').trim(),
      sort_order:Number(r?.sort_order || idx + 1) || (idx + 1),
      eligibility_code:String(r?.eligibility_code || '').trim() || (zone === 'ออกหน่วย' ? `OUTING:${code}` : code),
      is_outing:!!isOutingSet || r?.is_outing === true,
      is_active:r?.is_active === false ? false : true
    };
  }
  function normalizeConfig(configs){
    const src = configs || DEFAULT_CONFIGS_232;
    const out = { day:{}, outing:[], outing_by_count:{} };
    DAY_SETS.forEach(n => { out.day[n] = (src.day?.[n] || src.day?.[String(n)] || []).map((r,i) => normalizeRow(r, i, false)).filter(Boolean); });
    out.outing = (src.outing || src.outing_by_count?.[14] || src.outing_by_count?.['14'] || []).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    out.outing_by_count[12] = (src.outing_by_count?.[12] || src.outing_by_count?.['12'] || out.outing).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    out.outing_by_count[13] = (src.outing_by_count?.[13] || src.outing_by_count?.['13'] || out.outing).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    out.outing_by_count[14] = (src.outing_by_count?.[14] || src.outing_by_count?.['14'] || out.outing).map((r,i) => normalizeRow(r, i, true)).filter(Boolean);
    return out;
  }
  function defaultConfigs232(){ return normalizeConfig(clone(DEFAULT_CONFIGS_232)); }

  function v232SlotCodeSet(){
    const cfg = defaultConfigs232();
    const set = new Set();
    DAY_SETS.forEach(n => (cfg.day[n] || []).forEach(r => { if (r.code) set.add(String(r.code)); if (r.eligibility_code) set.add(String(r.eligibility_code)); }));
    (cfg.outing || []).forEach(r => { if (r.code) set.add(String(r.code)); if (r.eligibility_code) set.add(String(r.eligibility_code)); });
    Object.values(cfg.outing_by_count || {}).forEach(rows => (rows || []).forEach(r => { if (r.code) set.add(String(r.code)); if (r.eligibility_code) set.add(String(r.eligibility_code)); }));
    return set;
  }
  const V232_SLOT_CODE_SET = v232SlotCodeSet();
  const oldPositionEligible232 = window.positionEligible || (typeof positionEligible === 'function' ? positionEligible : null);
  const positionEligibleV232 = function positionEligibleV232(staff, positionCode){
    if (!staff || !positionCode) return false;
    const key = String(positionCode || '').trim();
    try {
      const rec = (state.positionEligibility || []).find(x => String(x.staff_id) === String(staff.id) && String(x.position_code) === key);
      if (rec) return !!rec.is_eligible;
      const hasAny = (state.positionEligibility || []).some(x => String(x.position_code) === key);
      if (!hasAny && V232_SLOT_CODE_SET.has(key)) return true;
    } catch (_) {}
    return oldPositionEligible232 ? oldPositionEligible232(staff, key) : true;
  };
  window.positionEligible = positionEligibleV232;
  try { positionEligible = positionEligibleV232; } catch (_) {}
  function slotState(){
    try {
      if (!window.state) return null;
      if (!state.slotTemplateV224) state.slotTemplateV224 = { kind:'day', setNo:14, configs:null, loaded:false, loading:false };
      return state.slotTemplateV224;
    } catch (_) { return null; }
  }
  function writeLocal232(configs){
    try { localStorage.setItem(LS_KEY, JSON.stringify(configs)); } catch (_) {}
    try { localStorage.setItem(SEED_KEY, new Date().toISOString()); } catch (_) {}
  }
  function applyRuntime232(configs){
    const cfg = normalizeConfig(configs || defaultConfigs232());
    try {
      const api = window.cnmiDayPositionSlotsV218 = window.cnmiDayPositionSlotsV218 || {};
      const target = api.DAY_POSITION_SLOT_SETS_218 || api.DAY_POSITION_SLOT_SETS || {};
      DAY_SETS.forEach(n => { target[n] = clone(cfg.day[n] || []); });
      api.DAY_POSITION_SLOT_SETS_218 = target;
      api.DAY_POSITION_SLOT_SETS = target;
      api.outingSlotsV232 = function(count){
        const raw = Number(count || 14);
        const n = raw <= 12 ? 12 : (raw <= 13 ? 13 : 14);
        return clone(cfg.outing_by_count?.[n] || cfg.outing_by_count?.[String(n)] || cfg.outing || []);
      };
      api.outingSlotsV224 = () => clone(cfg.outing || []);
      api.outingSlotsV226 = () => clone(cfg.outing || []);
    } catch (err) { console.warn(`${VERSION}: apply runtime failed`, err); }
    return cfg;
  }
  function installDefaults232(options){
    const cfg = defaultConfigs232();
    const st = slotState();
    if (st) { st.configs = clone(cfg); st.loaded = true; st.loading = false; }
    writeLocal232(cfg);
    applyRuntime232(cfg);
    if (!options?.silent) toast('โหลดรายละเอียดตำแหน่งล่าสุด V235 แล้ว');
    return cfg;
  }
  async function saveDefaults232(){
    const cfg = installDefaults232({ silent:true });
    if (typeof sb === 'undefined' || !sb) throw new Error('ไม่พบ Supabase client');
    const entries = [];
    DAY_SETS.forEach(n => entries.push({ key:cfgKey('day', n), rows:cfg.day[n] || [] }));
    entries.push({ key:cfgKey('outing'), rows:cfg.outing || [] });
    entries.push({ key:`${CFG_PREFIX}:OUTING:12`, rows:cfg.outing_by_count?.[12] || [] });
    entries.push({ key:`${CFG_PREFIX}:OUTING:13`, rows:cfg.outing_by_count?.[13] || [] });
    entries.push({ key:`${CFG_PREFIX}:OUTING:14`, rows:cfg.outing_by_count?.[14] || cfg.outing || [] });
    for (const ent of entries) {
      const payload = {
        code:ent.key,
        eligibility_code:null,
        zone:'SYSTEM',
        break_time:'-',
        main_rule:'SLOT_TEMPLATE_CONFIG',
        job_desc:JSON.stringify(ent.rows || []),
        is_outing:false,
        is_active:false,
        sort_order:99000,
        deleted_at:null,
        updated_by:currentStaffSafe()
      };
      const res = await sb.from('daily_position_masters').upsert(payload, { onConflict:'code,is_outing' });
      if (res.error) throw res.error;
    }
    try { await window.cnmiV224?.loadDbConfigs?.(true); } catch (_) {}
    installDefaults232({ silent:true });
    return cfg;
  }
  function shouldAutoSeed232(){
    try {
      if (localStorage.getItem(SEED_KEY)) return false;
      const cur = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      const d14 = cur.day?.[14] || cur.day?.['14'] || [];
      const out = cur.outing || [];
      // Seed once when the browser still has empty/old template cache. This is local/runtime only, not a DB overwrite.
      return d14.length < 14 || out.length < 14 || !cur.day;
    } catch (_) { return true; }
  }
  function injectButton232(){
    try {
      if (state?.page !== 'positionManagement') return;
      const root = document.getElementById('pageContent');
      if (!root || root.querySelector('[data-v232-save-default-slots]')) return;
      const target = root.querySelector('.v224-template-toolbar') || root.querySelector('.section-title .actions') || root.querySelector('.section-title');
      if (!target) return;
      const holder = document.createElement('span');
      holder.className = 'v232-default-slot-actions';
      holder.innerHTML = `<button type="button" class="soft-btn" data-v232-load-default-slots>โหลดรายละเอียดล่าสุด V240</button><button type="button" class="primary-btn" data-v232-save-default-slots>ใช้รายละเอียดล่าสุด V240 + บันทึก</button>`;
      target.appendChild(holder);
    } catch (err) { console.warn(`${VERSION}: inject button failed`, err); }
  }
  function renderAgain232(){
    try { if (state?.page === 'positionManagement' && typeof renderPage === 'function') renderPage(); } catch (_) {}
    setTimeout(injectButton232, 30);
  }

  document.addEventListener('click', function(e){
    const loadBtn = e.target?.closest?.('[data-v232-load-default-slots]');
    const saveBtn = e.target?.closest?.('[data-v232-save-default-slots]');
    if (!loadBtn && !saveBtn) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    (async()=>{
      try {
        if (saveBtn) {
          const ok = window.confirm ? window.confirm('ยืนยันใช้รายละเอียดตำแหน่งล่าสุด V240 ตามไฟล์ที่มัสส่งมา และบันทึกทับฐาน Slot เดิมทั้งหมด?') : true;
          if (!ok) return;
          saveBtn.disabled = true;
          saveBtn.textContent = 'กำลังบันทึก...';
          await saveDefaults232();
          toast('บันทึกรายละเอียดตำแหน่งล่าสุด V240 ลงฐานข้อมูลแล้ว');
        } else {
          installDefaults232();
        }
        renderAgain232();
      } catch (err) {
        toast('ตั้งค่ารายละเอียดตำแหน่งล่าสุด V240 ไม่สำเร็จ: ' + friendly(err), 'error');
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'ใช้รายละเอียดล่าสุด V240 + บันทึก'; }
      }
    })();
  }, true);

  const oldRenderPage = window.renderPage;
  if (typeof oldRenderPage === 'function' && !oldRenderPage.__v232Wrapped) {
    window.renderPage = function renderPageV232Wrapped(){
      const ret = oldRenderPage.apply(this, arguments);
      setTimeout(injectButton232, 20);
      return ret;
    };
    window.renderPage.__v232Wrapped = true;
  }
  try {
    const mo = new MutationObserver(() => injectButton232());
    mo.observe(document.body, { childList:true, subtree:true });
  } catch (_) {}

  const AUTO_SEED_232 = shouldAutoSeed232();
  if (AUTO_SEED_232) installDefaults232({ silent:true });
  // Older patches may asynchronously reload older template rows from Supabase/local cache shortly after page boot.
  // Re-apply the latest local defaults a few times on first V235 run so the user sees the latest baseline without retyping.
  setTimeout(() => { if (AUTO_SEED_232) installDefaults232({ silent:true }); injectButton232(); }, 80);
  setTimeout(() => { if (AUTO_SEED_232) installDefaults232({ silent:true }); injectButton232(); }, 260);
  setTimeout(() => { if (AUTO_SEED_232) installDefaults232({ silent:true }); injectButton232(); }, 700);
  setTimeout(injectButton232, 1000);

  window.cnmiV232 = { DEFAULT_CONFIGS_232, defaultConfigs232, installDefaults232, saveDefaults232, applyRuntime232 };
  window.cnmiV235 = window.cnmiV232;
})();
