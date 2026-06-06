// คัดลอกไฟล์นี้เป็น config.js แล้วใส่ค่าจาก Supabase / Apps Script ของจริง
window.CNMI_CONFIG = {
  APP_NAME: 'CNMI Duty Hub',
  ORG_NAME: 'หน่วยเวชศาสตร์บริการโลหิต',
  ALLOWED_DOMAIN: 'mahidol.ac.th',

  // Supabase Project Settings > API
  SUPABASE_URL: 'https://tpjhwmtctejhehutpzov.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwamh3bXRjdGVqaGVodXRwem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTY0OTMsImV4cCI6MjA5NjI3MjQ5M30.WG7PO2xbp_11VhZRPaEgFTQaV5lIdi1D4_-zqRiQETQ',

  // Apps Script Web App URL ใช้เฉพาะงาน admin/backup ที่ต้องถือ secret ฝั่ง server
  APP_SCRIPT_URL: '',

  // ปรับพิกัดหน่วยงานจริงหลังติดตั้ง เพื่อใช้ Check-In / OT geofence
  GEOFENCE: {
    enabled: false,
    lat: 13.7563,
    lng: 100.5018,
    radiusMeters: 500
  },

  // ปิดรับแก้วันลา/ไม่รับเวรของเดือนถัดไป เช่น วันที่ 20 เวลา 23:59
  ROSTER_CLOSE_DAY: 20
};
