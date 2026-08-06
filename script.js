const WEB_APP_URL = (window.MINIMUM_STOCK_CONFIG && window.MINIMUM_STOCK_CONFIG.GAS_WEB_APP_URL) || "https://script.google.com/macros/s/AKfycbzOcuADXBhegKJzgNODfyX2MfafMJmQ0ZP1k0Q0AxeeI5FAj1_716evZDFOCvHn9iIw/exec";

    const uploadZone = document.getElementById("uploadZone");
    const fileInput = document.getElementById("fileInput");
    const fileName = document.getElementById("fileName");
    const uploadBtn = document.getElementById("uploadBtn");
    const clearDataBtn = document.getElementById("clearDataBtn");
    const statusBox = document.getElementById("statusBox");
    const loadingBox = document.getElementById("loadingBox");
    const dashboard = document.getElementById("dashboard");
    const modalOverlay = document.getElementById("modalOverlay");
    const modalIcon = document.getElementById("modalIcon");
    const modalTitle = document.getElementById("modalTitle");
    const modalMessage = document.getElementById("modalMessage");
    const confirmOverlay = document.getElementById("confirmOverlay");
    const confirmTitle = document.getElementById("confirmTitle");
    const confirmMessage = document.getElementById("confirmMessage");
    const confirmOkBtn = document.getElementById("confirmOkBtn");
    const confirmCancelBtn = document.getElementById("confirmCancelBtn");

    let selectedFile = null;
    document.addEventListener("DOMContentLoaded", loadDashboardOnStart);

    uploadZone.addEventListener("click", () => fileInput.click());

    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    });

    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("dragover");
    });

    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
      handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener("change", () => {
      handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      if (!file) return;

      const ok = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
      if (!ok) {
        showStatus("กรุณาเลือกไฟล์ Excel เท่านั้น", false);
        return;
      }

      selectedFile = file;
      fileName.textContent = file.name;
      uploadBtn.disabled = false;
      showStatus("เลือกไฟล์แล้ว พร้อมอัปโหลด", true);
    }

    uploadBtn.addEventListener("click", async () => {
      if (!selectedFile) return;

      try {
        uploadBtn.disabled = true;
        uploadBtn.textContent = "กำลังตรวจสอบไฟล์...";
        showStatus("กำลังตรวจสอบคอลัมน์ BagNumber, ProductType, DonateSource, DateStockIn, DateStockOut, Status และ DestroyReason", true);
        const validation = await MinimumStockBackend.validateMobileUnitOutcomeFile(selectedFile);
        if (!validation.ok || (validation.missingColumns || []).length) {
          throw new Error("ไฟล์ขาดคอลัมน์สำคัญ: " + (validation.missingColumns || []).join(", "));
        }
        if (Number(validation.issueCount || 0) > 0) {
          const proceed = await showConfirmModal("พบข้อมูลที่ต้องตรวจสอบก่อนคำนวณ", buildMobileOutcomeValidationMessage(validation));
          if (!proceed) {
            showStatus("ยกเลิกการอัปโหลดแล้ว ข้อมูลเดิมยังไม่ถูกล้าง", false);
            uploadBtn.disabled = false;
            uploadBtn.textContent = "อัปโหลดและคำนวณ Minimum Stock";
            return;
          }
        }
      } catch (validationError) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "อัปโหลดและคำนวณ Minimum Stock";
        showStatus("❌ " + validationError.message, false);
        showModal("error", "ตรวจสอบไฟล์ไม่ผ่าน", validationError.message);
        return;
      }

      uploadBtn.disabled = true;
      uploadBtn.textContent = "กำลังล้างข้อมูลเดิม...";
      showStatus("กำลังล้างข้อมูลเดิมก่อนอัปโหลดรอบใหม่", true);
      loadingBox.style.display = "block";
      dashboard.style.display = "none";

      try {
        await MinimumStockBackend.clearAllSnapshots({ gasWebAppUrl: WEB_APP_URL });
        clearMinimumStockLocalCaches({ keepVersion: true });

        uploadBtn.textContent = "กำลังอ่านไฟล์และคำนวณ...";
        showStatus("ล้างข้อมูลเดิมแล้ว กำลังอ่าน Excel, คำนวณ และบันทึกไฟล์ใหม่", true);

        const data = await MinimumStockBackend.uploadExcel(selectedFile, {
          gasWebAppUrl: WEB_APP_URL,
          skipClearBeforeUpload: true
        });

        if (!data.ok) {
          throw new Error(data.message || "อัปโหลดไม่สำเร็จ");
        }

        if (data.mobileUnitOutcomeAnalysis) {
          currentMobileOutcomeAnalysis = data.mobileUnitOutcomeAnalysis;
          saveMobileOutcomeCache(data.mobileUnitOutcomeAnalysis);
        }

        // หลังบันทึกสำเร็จ ให้ล้าง cache ของ Dashboard แล้วอ่าน snapshot ล่าสุด
        // กลับจาก Supabase จริงอีกครั้ง เพื่อไม่แสดงผลคำนวณหรือ snapshot รอบก่อนหน้า
        clearMinimumStockLocalCaches({ keepVersion: true });
        uploadBtn.textContent = "กำลังโหลดข้อมูลล่าสุดจาก Supabase...";
        showStatus("บันทึกสำเร็จ กำลังโหลด snapshot ล่าสุดจาก Supabase", true);

        const refreshedData = await MinimumStockBackend.getDashboard({
          gasWebAppUrl: WEB_APP_URL,
          forceRefresh: true
        });

        if (!refreshedData || !refreshedData.ok) {
          throw new Error((refreshedData && refreshedData.message) || "โหลด snapshot ล่าสุดหลังอัปโหลดไม่สำเร็จ");
        }

        showStatus("✅ คำนวณและโหลดข้อมูลล่าสุดสำเร็จ: " + refreshedData.fileName, true);
        saveDashboardCache(refreshedData);
        renderDashboard(refreshedData);

        if (document.getElementById("page-mobile")?.classList.contains("active")) {
          loadMobilePlanning();
        }
        if (document.getElementById("page-mobile-outcome")?.classList.contains("active")) {
          loadMobileOutcomeAnalysis({ forceRefresh: true });
        }

        showModal("success", "คำนวณสำเร็จ", `อ่านข้อมูล ${refreshedData.totalRows} รายการ พบ Released ${refreshedData.releasedRows} รายการ`);

      } catch (err) {
        showStatus("❌ " + err.message, false);
        showModal("error", "ไม่สำเร็จ", err.message);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "อัปโหลดและคำนวณ Minimum Stock";
        loadingBox.style.display = "none";
      }
    });

    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", async () => {
        const ok = await showConfirmModal("ยืนยันการล้างข้อมูล", "ต้องการล้างข้อมูล Minimum Stock เดิมใน Supabase และ cache ของแอพนี้ใช่ไหม?\n\nหลังล้างแล้วหน้า Dashboard จะว่าง จนกว่าจะอัปโหลดไฟล์ใหม่");
        if (!ok) return;

        clearDataBtn.disabled = true;
        clearDataBtn.textContent = "กำลังล้างข้อมูล...";
        showStatus("กำลังล้างข้อมูลเดิมในระบบ", true);

        try {
          await MinimumStockBackend.clearAllSnapshots({ gasWebAppUrl: WEB_APP_URL });
          clearMinimumStockLocalCaches({ keepVersion: true });
          currentDashboardData = null;
          currentMobilePlanningData = null;
          currentMobileOutcomeAnalysis = null;
          currentMobileOutcomeFilteredRows = [];
          renderEmptyDashboardAfterClear();
          showStatus("✅ ล้างข้อมูลเดิมแล้ว พร้อมอัปโหลดไฟล์ใหม่", true);
          showModal("success", "ล้างข้อมูลเดิมแล้ว", "ระบบล้าง snapshot เดิมและ cache ของแอพนี้แล้ว");
        } catch (err) {
          showStatus("❌ " + err.message, false);
          showModal("error", "ล้างข้อมูลไม่สำเร็จ", err.message);
        } finally {
          clearDataBtn.disabled = false;
          clearDataBtn.textContent = "🧹 ล้างข้อมูลเดิมในระบบ";
        }
      });
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const result = reader.result;
          const base64 = result.split(",")[1];
          resolve(base64);
        };

        reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
        reader.readAsDataURL(file);
      });
    }

    function showStatus(message, good) {
      statusBox.style.display = "block";
      statusBox.style.background = good ? "#eef7ff" : "#fff1f1";
      statusBox.style.borderColor = good ? "#c8e6ff" : "#ffc9c9";
      statusBox.textContent = message;
    }

    let currentDashboardData = null;
let currentTab = "LPRC / LDPRC";
let currentMobilePlanningData = null;
const APP_VERSION = window.MINIMUM_STOCK_APP_VERSION || "20260806-v2-6-0-mobile-unit-outcome-analysis";
const DASHBOARD_CACHE_KEY = `minimumStock.${APP_VERSION}.dashboard.summary`;
const MOBILE_CACHE_KEY = `minimumStock.${APP_VERSION}.mobile.latest`;
const EXPIRY_CACHE_KEY = `minimumStock.${APP_VERSION}.expiry.latest`;
const MOBILE_OUTCOME_CACHE_KEY = `minimumStock.${APP_VERSION}.mobileOutcome.latest`;

function saveDashboardCache(data) {
  try {
    if (!data || !Array.isArray(data.results) || data.results.length === 0) return;
    const slim = {
      ok: true,
      message: data.message || "โหลดจาก cache",
      fileName: data.fileName || "",
      calculatedAt: data.calculatedAt || "",
      startDate: data.startDate || "",
      endDate: data.endDate || "",
      totalRows: Number(data.totalRows || 0),
      releasedRows: Number(data.releasedRows || 0),
      resultRows: Number(data.resultRows || (data.results || []).length || 0),
      results: data.results || [],
      cachedAt: new Date().toISOString()
    };
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(slim));
  } catch (err) {
    console.warn("saveDashboardCache failed", err);
  }
}

function readDashboardCache() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.results) || data.results.length === 0) return null;
    return data;
  } catch (err) {
    console.warn("readDashboardCache failed", err);
    return null;
  }
}


function saveLightCache(key, data) {
  try {
    if (!key || !data || !data.ok) return;
    const payload = {
      ...data,
      cachedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    // ถ้าข้อมูลใหญ่เกิน localStorage ให้ข้าม ไม่ให้เว็บพัง
    console.warn("saveLightCache failed", err);
  }
}

function readLightCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.ok) return null;
    return data;
  } catch (err) {
    console.warn("readLightCache failed", err);
    return null;
  }
}

function clearMinimumStockLocalCaches(options = {}) {
  try {
    const keepVersion = Boolean(options.keepVersion);
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (keepVersion && key === "minimumStock.__appVersion") continue;
      if (
        key === DASHBOARD_CACHE_KEY ||
        key === MOBILE_CACHE_KEY ||
        key === EXPIRY_CACHE_KEY ||
        key.startsWith("minimumStock.") ||
        key.startsWith("MinimumStock.") ||
        key.startsWith("minstock.") ||
        key.includes("minimum_stock")
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    sessionStorage.clear();
  } catch (err) {
    console.warn("clearMinimumStockLocalCaches failed", err);
  }
}

function clearMinimumStockCacheNow() {
  try {
    clearMinimumStockLocalCaches({ keepVersion: false });
    if (typeof window.resetMinimumStockAppCache === "function") {
      window.resetMinimumStockAppCache();
      return;
    }
    location.reload();
  } catch (err) {
    console.warn("clearMinimumStockCacheNow failed", err);
    location.reload();
  }
}

function renderEmptyDashboardAfterClear() {
  const topDashboard = document.getElementById("topDashboard");
  const expiryRiskDashboard = document.getElementById("expiryRiskDashboard");
  const mobilePlanningDashboard = document.getElementById("mobilePlanningDashboard");
  const mobileOutcomeDashboard = document.getElementById("mobileOutcomeDashboard");

  if (topDashboard) {
    topDashboard.innerHTML = `
      <div class="hero-card mt-4">
        <h3 class="fw-bold mb-2">ยังไม่มีข้อมูล Minimum Stock</h3>
        <div class="small-muted mb-3">ล้างข้อมูลเดิมแล้ว กรุณาอัปโหลดไฟล์ Excel ใหม่เพื่อเริ่มคำนวณรอบล่าสุด</div>
        <button class="btn btn-main" onclick="scrollToUpload()">ไปหน้าอัปโหลดไฟล์</button>
      </div>
    `;
  }

  if (expiryRiskDashboard) expiryRiskDashboard.innerHTML = "";
  if (mobilePlanningDashboard) mobilePlanningDashboard.innerHTML = "";
  if (mobileOutcomeDashboard) mobileOutcomeDashboard.innerHTML = "";
}

function isSameDashboardData(a, b) {
  if (!a || !b) return false;
  return String(a.fileName || "") === String(b.fileName || "") &&
    String(a.calculatedAt || "") === String(b.calculatedAt || "") &&
    Number(a.totalRows || 0) === Number(b.totalRows || 0) &&
    Number(a.releasedRows || 0) === Number(b.releasedRows || 0);
}

function renderDashboard(data) {
  currentDashboardData = data;

  const results = data.results || [];
  const totalMin = results.reduce((sum, r) => sum + Number(r.minimumStock || 0), 0);
  const totalUsed = results.reduce((sum, r) => sum + Number(r.totalUsed || 0), 0);
  const totalNet = results.reduce((sum, r) => sum + Number(r.netAvailable || 0), 0);

  const criticalItems = results.filter(r =>
  !["LDPPC", "SDP"].includes(r.type) &&
  (
    String(r.alertLevel || "").toLowerCase() === "critical" ||
    String(r.alertLevel || "").toLowerCase() === "warning"
  )
);

  const overstockItems = results.filter(r =>
    String(r.alertLevel || "").toLowerCase() === "overstock"
  );

  const topDashboard = document.getElementById("topDashboard");

  topDashboard.innerHTML = `
    <div class="mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 class="fw-bold mb-1">Minimum Stock Dashboard</h1>
          <div class="small-muted">
            ข้อมูลล่าสุดจากไฟล์: <b>${data.fileName || "-"}</b><br>
            อัปเดตล่าสุด: <b>${formatDisplayDateTime(data.calculatedAt) || "-"}</b>
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-main" onclick="scrollToUpload()">อัปโหลดไฟล์ใหม่</button>
          <button class="btn btn-outline-secondary" onclick="clearMinimumStockCacheNow()">ล้าง Cache แอพนี้</button>
        </div>
      </div>

      <div class="summary-grid mb-4">
        <div class="summary-card">
          <div class="small-muted">ช่วงวันที่</div>
          <div class="fw-bold">${data.startDate || "-"} ถึง ${data.endDate || "-"}</div>
        </div>
        <div class="summary-card">
          <div class="small-muted">Total Used</div>
          <div class="fs-3 fw-bold">${totalUsed}</div>
        </div>
        <div class="summary-card">
          <div class="small-muted">Net Available</div>
          <div class="fs-3 fw-bold">${totalNet}</div>
        </div>
        <div class="summary-card">
          <div class="small-muted">Minimum Stock รวม</div>
          <div class="fs-3 fw-bold">${totalMin}</div>
        </div>
      </div>

      <div class="priority-grid">
        <div class="priority-card critical">
          <h5 class="fw-bold mb-2">⚠️ ต้องจัดการก่อน</h5>
          ${renderPriorityList(criticalItems, "ไม่มีรายการต่ำกว่า Minimum")}
        </div>

        <div class="priority-card overstock">
          <h5 class="fw-bold mb-2">📦 Stock สูงมาก</h5>
          ${renderPriorityList(overstockItems, "ไม่มีรายการสูงเกิน")}
        </div>
      </div>

      <div class="tab-scroll">
        ${["LPRC / LDPRC", "FFP", "LDPPC", "Cryo", "SDP"].map(type => `
          <button class="tab-btn ${type === currentTab ? "active" : ""}" onclick="changeTab('${type}')">
            ${type}
          </button>
        `).join("")}
      </div>

      <div id="tabContent"></div>
    </div>
  `;

  renderTabContent();
}

function getTypeClass(type) {
  const t = String(type || "").toLowerCase();

  if (t.includes("lprc")) return "type-prc";
  if (t.includes("ffp")) return "type-ffp";
  if (t.includes("ldppc")) return "type-ldppc";
  if (t.includes("cryo")) return "type-cryo";
  if (t.includes("sdp")) return "type-sdp";

  return "type-ffp";
}

function showModal(type, title, message) {
  modalIcon.textContent = type === "success" ? "✅" : "⚠️";
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalOverlay.style.display = "flex";
}

function closeModal() {
  modalOverlay.style.display = "none";
}

function showConfirmModal(title, message) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title || "ยืนยัน";
    confirmMessage.innerHTML = String(message || "").replace(/\n/g, "<br>");
    confirmOverlay.style.display = "flex";

    const cleanup = (result) => {
      confirmOverlay.style.display = "none";
      confirmOkBtn.onclick = null;
      confirmCancelBtn.onclick = null;
      confirmOverlay.onclick = null;
      resolve(result);
    };

    confirmOkBtn.onclick = () => cleanup(true);
    confirmCancelBtn.onclick = () => cleanup(false);
    confirmOverlay.onclick = (e) => {
      if (e.target === confirmOverlay) cleanup(false);
    };
  });
}

    async function loadDashboardOnStart() {
  const topDashboard = document.getElementById("topDashboard");
  const cachedData = readDashboardCache();

  // Instant mode: แสดงข้อมูลสรุปล่าสุดจากเครื่องก่อน แล้วค่อย sync Supabase เบื้องหลัง
  // ทำให้การเปิดหน้า Minimum Stock กลับมาไวเหมือนช่วงก่อนย้ายฐานข้อมูล
  if (cachedData) {
    renderDashboard(cachedData);
  } else {
    topDashboard.innerHTML = `
      <div class="hero-card">
        <div class="fw-bold">กำลังโหลด Dashboard ล่าสุด...</div>
        <div class="small-muted">ระบบกำลังดึงค่า Minimum Stock ล่าสุดจากข้อมูลที่อัปโหลดไว้</div>
      </div>
    `;
  }

  try {
    const data = await MinimumStockBackend.getDashboard({
      gasWebAppUrl: WEB_APP_URL
    });

    if (!data.ok) {
      throw new Error(data.message || "โหลด Dashboard ไม่สำเร็จ");
    }

    if (!data.results || data.results.length === 0) {
      if (!cachedData) {
        topDashboard.innerHTML = `
          <div class="hero-card">
            <h4 class="fw-bold mb-2">ยังไม่มีข้อมูล Minimum Stock</h4>
            <div class="small-muted">กรุณาอัปโหลดไฟล์ Excel เพื่อคำนวณครั้งแรก</div>
          </div>
        `;
      }
      return;
    }

    saveDashboardCache(data);
    if (!cachedData || !isSameDashboardData(cachedData, data)) {
      renderDashboard(data);
    }

  } catch (err) {
    if (cachedData) {
      showStatus("แสดงข้อมูลล่าสุดที่เคยโหลดไว้ก่อน ระบบจะ Sync ใหม่เมื่อเชื่อมต่อได้", true);
      return;
    }

    topDashboard.innerHTML = `
      <div class="hero-card">
        <h4 class="fw-bold mb-2">โหลด Dashboard ไม่สำเร็จ</h4>
        <div class="small-muted">${err.message}</div>
      </div>
    `;
  }
}

    function changeTab(type) {
  currentTab = type;
  renderDashboard(currentDashboardData);
}

function renderTabContent() {
  const results = currentDashboardData?.results || [];
  const filtered = results.filter(r => r.type === currentTab);

  const tabContent = document.getElementById("tabContent");

  tabContent.innerHTML = `
    <div class="summary-card mb-3">
      <div class="small-muted">
        พร้อมใช้ = Available ที่ Blood Bank เท่านั้น | คล้องกับผู้ป่วย = ReadyToIssue ทุก Location | ถุงย่อย suffix .S1, .S2, ... ไม่นับเป็น standard unit | LR / Patient / Location อื่นแยกต่างหาก
      </div>

    <div class="result-table table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Blood Group</th>
            <th class="text-end">Minimum</th>
            <th class="text-end">พร้อมใช้</th>
            <th class="text-end">LR</th>
            <th class="text-end">Patient</th>
            <th class="text-end">รอตรวจ/รอแปะ Bag</th>
            <th class="text-end">คล้องกับผู้ป่วย</th>
            <th class="text-end">S ไม่รวม</th>
            <th class="text-end">อื่น/ไม่รวม</th>
            <th class="text-end">ใช้ได้จริง</th>
            <th class="text-end">ขาด/เกิน</th>
            <th>คำแนะนำ</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(r => `
            <tr>
              <td class="fw-bold">${r.bloodGroup}</td>
              <td class="text-end fw-bold">${r.minimumStock}</td>
              <td class="text-end">${r.available ?? 0}</td>
              <td class="text-end">${r.lrSpare ?? 0}</td>
              <td class="text-end">${r.patientManual ?? 0}</td>
              <td class="text-end">${r.pendingScreening ?? 0}</td>
              <td class="text-end">${r.readyToIssue ?? 0}</td>
              <td class="text-end">${r.splitSubunitExcluded ?? 0}</td>
              <td class="text-end">${r.excludedOtherLocation ?? 0}</td>
              <td class="text-end fw-bold">${r.netAvailable ?? 0}</td>
              <td class="text-end fw-bold">${r.gap ?? 0}</td>
              <td>
                <span class="action-pill ${getAlertClass(r.alertLevel)}">
                  ${getShortActionText(r)}
                </span>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="mobile-stock-cards">
      ${filtered.map(r => `
        <div class="stock-mobile-card">
          <div class="stock-mobile-head">
            <div>
              <div class="small-muted">Blood Group</div>
              <div class="fs-3 fw-bold">${r.bloodGroup}</div>
            </div>
            <span class="action-pill ${getAlertClass(r.alertLevel)}">
              ${getShortActionText(r)}
            </span>
          </div>

          <div class="stock-mobile-grid">
  <div class="stock-mobile-item">
    <div class="stock-mobile-label">Minimum</div>
    <div class="stock-mobile-value">${r.minimumStock}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">พร้อมใช้</div>
    <div class="stock-mobile-value">${r.available ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">LR</div>
    <div class="stock-mobile-value">${r.lrSpare ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">Patient</div>
    <div class="stock-mobile-value">${r.patientManual ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">รอตรวจ/รอแปะ</div>
    <div class="stock-mobile-value">${r.pendingScreening ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">คล้องผู้ป่วย</div>
    <div class="stock-mobile-value">${r.readyToIssue ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">S ไม่รวม</div>
    <div class="stock-mobile-value">${r.splitSubunitExcluded ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">อื่น/ไม่รวม</div>
    <div class="stock-mobile-value">${r.excludedOtherLocation ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">ใช้ได้จริง</div>
    <div class="stock-mobile-value">${r.netAvailable ?? 0}</div>
  </div>

  <div class="stock-mobile-item">
    <div class="stock-mobile-label">ขาด/เกิน</div>
    <div class="stock-mobile-value">${r.gap ?? 0}</div>
  </div>
</div>
        </div>
      `).join("")}
    </div>
  `;
}

    function getShortActionText(r) {
  const level = String(r.alertLevel || "").toLowerCase();

  if (level === "critical") return "เติมด่วน";
  if (level === "warning") return "ควรเติม";
  if (level === "watch") return "เฝ้าระวัง";
  if (level === "overstock") return "ชะลอเติม";
  return "ปกติ";
}

function renderPriorityList(items, emptyText) {
  if (!items || items.length === 0) {
    return `<div class="small-muted">${emptyText}</div>`;
  }

  return `
    <div class="d-grid gap-2">
      ${items.map(r => `
        <div>
          <b>${r.type} ${r.bloodGroup}</b>
          <span class="small-muted">${Number(r.gap) < 0 ? "ขาด" : "เกิน"} ${Math.abs(Number(r.gap || 0))} ยูนิต</span><br>
          <span class="small-muted">${r.suggestedAction || r.suggestion}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function getAlertClass(level) {
  const l = String(level || "").toLowerCase();

  if (l === "critical") return "alert-critical";
  if (l === "warning") return "alert-warning";
  if (l === "watch") return "alert-watch";
  if (l === "overstock") return "alert-overstock";
  return "alert-normal";
}
    function getTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

    function diffDaysFromToday(targetDateText) {
  const todayText = getTodayYmd();

  const today = new Date(todayText + "T00:00:00");
  const target = new Date(targetDateText + "T00:00:00");

  if (isNaN(target)) return 1;

  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  return Math.max(1, diff);
}

async function loadMobilePlanning(targetMobileDate) {
  const holder = document.getElementById("mobilePlanningDashboard");
  if (!holder) return;

  const selectedMobileDate =
    targetMobileDate ||
    document.getElementById("mobilePlanDate")?.value ||
    getTodayYmd();

  const targetPlanDays = diffDaysFromToday(selectedMobileDate);
  const cachedMobile = readLightCache(MOBILE_CACHE_KEY);

  if (cachedMobile) {
    cachedMobile.targetMobileDate = selectedMobileDate;
    cachedMobile.targetPlanDays = targetPlanDays;
    currentMobilePlanningData = cachedMobile;
    renderMobilePlanning(cachedMobile);
  } else {
    holder.innerHTML = `
      <div class="hero-card">
        <div class="fw-bold">กำลังโหลดแผนออกหน่วย...</div>
        <div class="small-muted">ระบบกำลังคำนวณจากวันที่คาดว่าจะออกหน่วย เทียบกับ stock ปัจจุบันและข้อมูลย้อนหลัง 2 ปี</div>
      </div>
    `;
  }

  try {
    const data = await MinimumStockBackend.getMobilePlanning({
      selectedDate: getTodayYmd(),
      planDays: targetPlanDays,
      gasWebAppUrl: WEB_APP_URL
    });

    if (!data.ok) {
      throw new Error(data.message || "โหลด Mobile Unit Planning ไม่สำเร็จ");
    }

    data.targetMobileDate = selectedMobileDate;
    data.targetPlanDays = targetPlanDays;

    saveLightCache(MOBILE_CACHE_KEY, data);
    currentMobilePlanningData = data;
    renderMobilePlanning(data);

  } catch (err) {
    holder.innerHTML = `
      <div class="hero-card">
        <h4 class="fw-bold mb-2">โหลดแผนออกหน่วยไม่สำเร็จ</h4>
        <div class="small-muted">${err.message}</div>
      </div>
    `;
  }
}

function renderMobilePlanning(data) {
  const holder = document.getElementById("mobilePlanningDashboard");
  if (!holder) return;

  const summary = data.summary || {};
  const decisionBase = summary.decisionBase || {};
  const rows = summary.typeGroupRows || [];

  const planDays = Number(data.targetPlanDays || data.planDays || decisionBase.planDays || 14);
  const targetMobileDate = data.targetMobileDate || getTodayYmd();

  const prcRows = rows.filter(r => r.type === "LPRC / LDPRC");

  const prcCnmi = prcRows.reduce((sum, r) => sum + Number(r.cnmi || 0), 0);
  const prcTrc = prcRows.reduce((sum, r) => sum + Number(r.trc || 0), 0);
  const prcTotalSource = prcCnmi + prcTrc;

  const prcTrcRatioDisplay = prcTotalSource > 0
    ? ((prcTrc / prcTotalSource) * 100).toFixed(1)
    : "0.0";

  const decision = getMobilePlanningDecision(decisionBase);
  const riskText = Array.isArray(decisionBase.riskGroups) && decisionBase.riskGroups.length
    ? decisionBase.riskGroups.join(", ")
    : "-";

  holder.innerHTML = `
    <div class="forecast-hero">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <div class="forecast-pill mb-2">LPRC / LDPRC Forecast</div>
          <h1 class="fw-bold mb-2">ประเมินแผนออกหน่วยรับบริจาค</h1>
          <div class="small-muted">
            เลือกวันที่ที่คาดว่าจะออกหน่วย ระบบจะประเมินจาก stock ปัจจุบัน + การใช้ย้อนหลัง + การจัดหาเองในช่วงเดียวกันปีที่แล้ว
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <div class="small-muted mb-1">วันที่คาดว่าจะออกหน่วย</div>
            <input
              id="mobilePlanDate"
              type="date"
              class="mobile-date-input"
              value="${targetMobileDate}"
            />
          </div>

          <button class="btn btn-main" onclick="loadMobilePlanning()">
            คำนวณแผน
          </button>
        </div>
      </div>

      <div class="mobile-decision-card ${decision.level}">
        <div class="small-muted mb-1">คำตอบของระบบ</div>
        <h3 class="fw-bold mb-2">${decision.icon} ${decision.title}</h3>
        <div>${decision.text}</div>
      </div>
    </div>

    <div class="mobile-kpi-grid">
      <div class="summary-card">
        <div class="small-muted">คาดว่าจะใช้</div>
        <div class="fs-3 fw-bold">${decisionBase.totalForecastUse || 0}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">คาดว่าจะจัดหาเองได้</div>
        <div class="fs-3 fw-bold">${decisionBase.totalExpectedCnmiIn || 0}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">คาดว่าจะเหลือ</div>
        <div class="fs-3 fw-bold">${decisionBase.totalProjectedBalance || 0}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">ควรออกหน่วยเพิ่ม</div>
        <div class="fs-3 fw-bold">${decisionBase.totalNeedToCollect || 0}</div>
      </div>
    </div>

    <div class="mobile-note-box">
  <div class="fw-bold mb-1">สรุปเพิ่มเติม</div>
  <div class="small-muted mb-2">
    หมู่เลือดที่เสี่ยงขาด: <b>${riskText}</b> |
    TRC Ratio: <b>${prcTrcRatioDisplay}%</b>
  </div>

  <div class="fw-bold">
    เลือดที่หมดอายุก่อนวันออกหน่วยและไม่นำมาคิดเป็น stock ใช้งาน:
    ${decisionBase.totalExpiringBeforePlan || 0} unit
  </div>
</div>

    <div class="mobile-chart-card mb-3">
      <h5 class="fw-bold mb-3">แหล่งที่มาของ LPRC / LDPRC ใน stock ปัจจุบัน</h5>
      ${renderSimpleBar("CNMI", prcCnmi, prcTotalSource, "fill-cnmi")}
      ${renderSimpleBar("TRC", prcTrc, prcTotalSource, "fill-trc")}
    </div>

    <div class="mobile-chart-card mb-3">
      <h5 class="fw-bold mb-3">Forecast แยกตามหมู่เลือด</h5>
      ${renderPrcBloodGroupChart(prcRows)}
    </div>

    <div class="mobile-note-box">
      <div class="fw-bold mb-1">ตารางสรุปตามหมู่เลือด</div>
      <div class="small-muted">
        คาดว่าจะใช้ = ค่าเฉลี่ยล่าสุดเทียบกับช่วงเดียวกันปีที่แล้ว |
        หาได้เอง = CNMI DateStockIn ช่วงเดียวกันปีที่แล้ว |
        ควรออกเพิ่ม = ส่วนที่ยังไม่พอหลังรวม stock ปัจจุบันและที่คาดว่าจะหาได้เอง
      </div>
    </div>

    <div class="mobile-table-card table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Group</th>
            <th class="text-end">ใช้ได้ตอนนี้</th>
            <th class="text-end">คาดว่าจะใช้</th>
            <th class="text-end">หาได้เอง</th>
            <th class="text-end">คาดว่าจะเหลือ</th>
            <th class="text-end">ควรออกเพิ่ม</th>
            <th class="text-end">CNMI</th>
            <th class="text-end">TRC</th>
          </tr>
        </thead>
        <tbody>
          ${renderMobilePlanningRows(prcRows)}
        </tbody>
      </table>
    </div>
  `;
}

function getMobilePlanningDecision(decisionBase) {
  const planDays = Number(decisionBase.planDays || 14);
  const needToCollect = Number(decisionBase.totalNeedToCollect || 0);
  const forecastUse = Number(decisionBase.totalForecastUse || 0);
  const expectedCnmiIn = Number(decisionBase.totalExpectedCnmiIn || 0);
  const trcRatio = Number(decisionBase.prcTrcRatio || 0);
  const riskGroups = Array.isArray(decisionBase.riskGroups) ? decisionBase.riskGroups : [];
  const riskText = riskGroups.length ? riskGroups.join(", ") : "-";

  if (needToCollect > 0 && planDays <= 7) {
    return {
      level: "critical",
      icon: "🚨",
      title: `ควรเติมด่วนภายใน ${planDays} วัน`,
      text: `ระบบคาดว่าจะใช้ LPRC / LDPRC ${forecastUse} unit และคาดว่าจะจัดหาเองได้ ${expectedCnmiIn} unit แต่ยังควรออกหน่วยเพิ่ม ${needToCollect} unit โดยหมู่ที่เสี่ยงขาดคือ ${riskText} อาจต้องวางแผนออกหน่วยหรือประสาน TRC เฉพาะหน้า`
    };
  }

  if (needToCollect > 0) {
    return {
      level: "warning",
      icon: "🚌",
      title: `ควรวางแผนออกหน่วยภายใน ${planDays} วัน`,
      text: `ระบบคาดว่าจะใช้ LPRC / LDPRC ${forecastUse} unit และคาดว่าจะจัดหาเองได้ ${expectedCnmiIn} unit เมื่อเทียบกับ stock ปัจจุบันแล้วยังควรออกหน่วยเพิ่ม ${needToCollect} unit โดยหมู่ที่ควรเน้นคือ ${riskText}`
    };
  }

  if (trcRatio >= 30) {
    return {
      level: "watch",
      icon: "👀",
      title: `ยังพอใช้ถึงวันออกหน่วย แต่ควรลดการพึ่ง TRC`,
      text: `LPRC / LDPRC ยังพอใช้ตาม forecast แต่สัดส่วนเลือดจาก TRC อยู่ที่ ${trcRatio}% ควรพิจารณาวางรอบออกหน่วยเพื่อลดการเบิกจาก TRC`
    };
  }

  return {
    level: "normal",
    icon: "✅",
    title: `ยังไม่จำเป็นต้องออกหน่วยภายใน ${planDays} วัน`,
    text: `LPRC / LDPRC ยังพอใช้ตาม forecast และสัดส่วนเลือดจาก TRC ไม่สูง สามารถติดตามตามรอบปกติ`
  };
}

function renderSimpleBar(label, value, total, fillClass) {
  const percent = total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0;

  return `
    <div class="mobile-bar-row">
      <div class="mobile-bar-label">
        <span>${label}</span>
        <span>${value} (${percent}%)</span>
      </div>
      <div class="mobile-bar-track">
        <div class="mobile-bar-fill ${fillClass}" style="width:${percent}%"></div>
      </div>
    </div>
  `;
}

function renderPrcBloodGroupChart(rows) {
  const prcRows = (rows || [])
    .filter(r => r.type === "LPRC / LDPRC")
    .sort((a, b) => {
      const order = { "O": 1, "A": 2, "B": 3, "AB": 4 };
      return (order[a.bloodGroup] || 99) - (order[b.bloodGroup] || 99);
    });

  if (!prcRows.length) {
    return `<div class="small-muted">ยังไม่มีข้อมูล LPRC / LDPRC</div>`;
  }

  const maxValue = Math.max(
    ...prcRows.map(r => Math.max(
      Number(r.netAvailable || 0),
      Number(r.forecastUse || 0),
      Number(r.needToCollect || 0)
    )),
    1
  );

  return `
    <div class="group-forecast-grid">
      ${prcRows.map(r => `
        <div class="group-forecast-card">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="fw-bold fs-5">Group ${r.bloodGroup}</div>
            <div class="group-forecast-note">
              จัดหาเองได้ ${r.lastYearCnmiIn || 0} unit
            </div>
          </div>

          <div class="group-forecast-kpi">
            <div class="group-forecast-item">
              <div class="small-muted">ใช้ได้จริง</div>
              <div class="value">${r.netAvailable || 0}</div>
            </div>
            <div class="group-forecast-item">
              <div class="small-muted">คาดว่าจะใช้</div>
              <div class="value">${r.forecastUse || 0}</div>
            </div>
            <div class="group-forecast-item">
              <div class="small-muted">ควรเติม</div>
              <div class="value">${r.needToCollect || 0}</div>
            </div>
          </div>

          ${renderMiniCompareBar("ใช้ได้จริง", r.netAvailable, maxValue, "fill-cnmi")}
          ${renderMiniCompareBar("คาดว่าจะใช้", r.forecastUse, maxValue, "fill-trc")}
          ${renderMiniCompareBar("ควรเติม", r.needToCollect, maxValue, "fill-high")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderMiniCompareBar(label, value, maxValue, fillClass) {
  const percent = maxValue > 0 ? Math.round((Number(value || 0) / maxValue) * 100) : 0;

  return `
    <div class="mobile-bar-row" style="margin-bottom:8px;">
      <div class="mobile-bar-label small-muted">
        <span>${label}</span>
        <span>${value || 0}</span>
      </div>
      <div class="mobile-bar-track" style="height:10px;">
        <div class="mobile-bar-fill ${fillClass}" style="width:${percent}%"></div>
      </div>
    </div>
  `;
}

    
function renderMobilePlanningRows(rows) {
  if (!rows || rows.length === 0) {
    return `
      <tr>
        <td colspan="8" class="text-center small-muted py-4">
          ยังไม่มีข้อมูล LPRC / LDPRC สำหรับประเมินแผนออกหน่วย
        </td>
      </tr>
    `;
  }

  const orderBlood = {
    "O": 1,
    "A": 2,
    "B": 3,
    "AB": 4
  };

  const sorted = [...rows].sort((a, b) => {
    return (orderBlood[a.bloodGroup] || 99) - (orderBlood[b.bloodGroup] || 99);
  });

  return sorted.map(r => {
    const needToCollect = Number(r.needToCollect || 0);
    const projectedBalance = Number(r.projectedBalance || 0);

    let rowClass = "";
    if (needToCollect > 0) rowClass = "table-warning";
    if (projectedBalance < 0) rowClass = "table-danger";

    return `
      <tr class="${rowClass}">
        <td class="fw-bold">Group ${r.bloodGroup}</td>
        <td class="text-end fw-bold">${r.netAvailable || 0}</td>
        <td class="text-end fw-bold">${r.forecastUse || 0}</td>
        <td class="text-end fw-bold">${r.lastYearCnmiIn || 0}</td>
        <td class="text-end fw-bold">${r.projectedBalance || 0}</td>
        <td class="text-end fw-bold">${r.needToCollect || 0}</td>
        <td class="text-end">${r.cnmi || 0}</td>
        <td class="text-end">${r.trc || 0}</td>
      </tr>
    `;
  }).join("");
}

    async function loadExpiryRisk(days) {
  const holder = document.getElementById("expiryRiskDashboard");
  if (!holder) return;

  const targetDays = Number(days || document.querySelector(".expiry-day-btn.active")?.dataset.days || 7);
  const cachedExpiry = readLightCache(EXPIRY_CACHE_KEY);

  if (cachedExpiry) {
    renderExpiryRisk(cachedExpiry, targetDays);
  } else {
    holder.innerHTML = `
      <div class="hero-card">
        <div class="fw-bold">กำลังโหลด Expiry Risk...</div>
        <div class="small-muted">ระบบกำลังดึงรายการเลือดใกล้หมดอายุ</div>
      </div>
    `;
  }

  try {
    const data = await MinimumStockBackend.getMobilePlanning({
      selectedDate: getTodayYmd(),
      planDays: 1,
      gasWebAppUrl: WEB_APP_URL
    });

    if (!data.ok) {
      throw new Error(data.message || "โหลด Expiry Risk ไม่สำเร็จ");
    }

    saveLightCache(EXPIRY_CACHE_KEY, data);
    renderExpiryRisk(data, targetDays);

  } catch (err) {
    holder.innerHTML = `
      <div class="hero-card">
        <h4 class="fw-bold mb-2">โหลด Expiry Risk ไม่สำเร็จ</h4>
        <div class="small-muted">${err.message}</div>
      </div>
    `;
  }
}

function setExpiryDays(days) {
  document.querySelectorAll(".expiry-day-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.days) === Number(days));
  });

  loadExpiryRisk(days);
}

function renderExpiryRisk(data, days) {
  const holder = document.getElementById("expiryRiskDashboard");
  if (!holder) return;

  const stockRows = data.stockRows || [];

  const focusRows = stockRows.filter(r => {
    const type = String(r.type || "");
    const daysToExpire = Number(r.daysToExpire);

    const isFocusProduct =
      type === "LPRC / LDPRC" ||
      type === "LDPPC" ||
      type === "SDP" ||
      type === "FFP";

    return isFocusProduct && daysToExpire >= 0 && daysToExpire <= days;
  });

  const redCount = focusRows.filter(r => r.type === "LPRC / LDPRC").length;
  const plateletCount = focusRows.filter(r => r.type === "LDPPC" || r.type === "SDP").length;
  const ffpCount = focusRows.filter(r => r.type === "FFP").length;

  const groupedRows = buildExpiryGroupedRows(focusRows);

  holder.innerHTML = `
    <div class="forecast-hero">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <div class="forecast-pill mb-2">Expiry Risk</div>
          <h1 class="fw-bold mb-2">เลือดใกล้หมดอายุ</h1>
          <div class="small-muted">
            ใช้ดู LPRC / LDPRC, Platelet และ FFP ที่จะหมดอายุในช่วงที่เลือก เพื่อจัดการก่อนเกิด waste
          </div>
        </div>
      </div>

      <div class="plan-button-row">
        ${[1, 3, 5, 7, 14, 30].map(d => `
          <button
            class="plan-btn expiry-day-btn ${Number(days) === d ? "active" : ""}"
            data-days="${d}"
            onclick="setExpiryDays(${d})"
          >
            ${d} วัน
          </button>
        `).join("")}
      </div>
    </div>

    <div class="mobile-kpi-grid">
      <div class="summary-card">
        <div class="small-muted">LPRC / LDPRC</div>
        <div class="fs-3 fw-bold">${redCount}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">Platelet</div>
        <div class="fs-3 fw-bold">${plateletCount}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">FFP</div>
        <div class="fs-3 fw-bold">${ffpCount}</div>
      </div>

      <div class="summary-card">
        <div class="small-muted">รวมใน ${days} วัน</div>
        <div class="fs-3 fw-bold">${focusRows.length}</div>
      </div>
    </div>

    <div class="mobile-table-card table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>ความเร่งด่วน</th>
            <th>Product</th>
            <th>Group</th>
            <th class="text-end">จำนวน</th>
            <th class="text-end">หมดอายุเร็วสุด</th>
            <th>ควรทำ</th>
          </tr>
        </thead>
        <tbody>
          ${renderExpiryGroupedRows(groupedRows)}
        </tbody>
      </table>
    </div>
  `;
}

function buildExpiryGroupedRows(rows) {
  const bucket = {};

  rows.forEach(r => {
    const key = `${r.type}||${r.bloodGroup}||${r.daysToExpire}`;

    if (!bucket[key]) {
      bucket[key] = {
        type: r.type,
        bloodGroup: r.bloodGroup,
        daysToExpire: Number(r.daysToExpire),
        count: 0
      };
    }

    bucket[key].count++;
  });

  return Object.values(bucket).sort((a, b) => {
    if (a.daysToExpire !== b.daysToExpire) return a.daysToExpire - b.daysToExpire;
    return String(a.type).localeCompare(String(b.type));
  });
}

function getExpiryUrgency(daysToExpire) {
  const d = Number(daysToExpire);

  if (d <= 1) return "🔴 ด่วนมาก";
  if (d <= 3) return "🟠 ด่วน";
  if (d <= 7) return "🟡 เฝ้าระวัง";
  return "🔵 ติดตาม";
}

function getExpiryActionText(row) {
  const d = Number(row.daysToExpire);

  if (d <= 1) return "เร่งกระจาย / แจ้งหน้างานทันที";
  if (d <= 3) return "จัดลำดับใช้ก่อน และติดตามทุกวัน";
  if (d <= 7) return "เฝ้าระวังและวางแผนใช้ก่อน";
  return "ติดตามตามรอบ";
}

function renderExpiryGroupedRows(rows) {
  if (!rows || rows.length === 0) {
    return `
      <tr>
        <td colspan="6" class="text-center small-muted py-4">
          ไม่มีรายการใกล้หมดอายุในช่วงที่เลือก
        </td>
      </tr>
    `;
  }

  return rows.map(r => `
    <tr>
      <td class="fw-bold">${getExpiryUrgency(r.daysToExpire)}</td>
      <td>
        <span class="mobile-product-badge ${getTypeClass(r.type)}">
          ${r.type}
        </span>
      </td>
      <td class="fw-bold">${r.bloodGroup}</td>
      <td class="text-end fw-bold">${r.count}</td>
      <td class="text-end">${r.daysToExpire} วัน</td>
      <td>${getExpiryActionText(r)}</td>
    </tr>
  `).join("");
}

function scrollToUpload() {
  const uploadBtn = document.querySelector("[onclick=\"showDashboardPage('upload', this)\"]");
  showDashboardPage("upload", uploadBtn);
}

function formatDisplayDateTime(value) {
  if (!value) return "";

  const d = new Date(value);
  if (isNaN(d)) return value;

  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}


/* ---------------- วิเคราะห์ผลถุงเลือดจากการออกหน่วย ---------------- */
let currentMobileOutcomeAnalysis = null;
let currentMobileOutcomeFilteredRows = [];
let currentMobileOutcomeGroups = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function saveMobileOutcomeCache(analysis) {
  try {
    if (!analysis || !Array.isArray(analysis.rows)) return;
    const raw = JSON.stringify({ ...analysis, cachedAt: new Date().toISOString() });
    // localStorage ส่วนใหญ่จำกัดประมาณ 5 MB จึงไม่ฝืนบันทึกไฟล์ใหญ่
    if (raw.length > 4_000_000) return;
    localStorage.setItem(MOBILE_OUTCOME_CACHE_KEY, raw);
  } catch (err) {
    console.warn("saveMobileOutcomeCache failed", err);
  }
}

function readMobileOutcomeCache() {
  try {
    const raw = localStorage.getItem(MOBILE_OUTCOME_CACHE_KEY);
    if (!raw) return null;
    const analysis = JSON.parse(raw);
    return analysis && Array.isArray(analysis.rows) ? analysis : null;
  } catch (err) {
    console.warn("readMobileOutcomeCache failed", err);
    return null;
  }
}

function buildMobileOutcomeValidationMessage(validation) {
  const missing = validation?.missingColumns || [];
  if (missing.length) {
    return `<strong>ไฟล์ยังประมวลผลไม่ได้</strong><br>ขาดคอลัมน์: ${missing.map(escapeHtml).join(", ")}`;
  }

  const counts = validation?.issueCounts || {};
  const lines = [
    `พบรายการที่ต้องตรวจสอบทั้งหมด <strong>${Number(validation?.issueCount || 0).toLocaleString("th-TH")}</strong> รายการ`,
    `BagNumber ซ้ำ: ${Number(validation?.duplicateBagCount || 0).toLocaleString("th-TH")} ถุง`,
    `แหล่งรับเข้าต้องตรวจสอบ: ${Number(validation?.reviewSourceCount || 0).toLocaleString("th-TH")} ถุง`,
    `แหล่งทดสอบ/แหล่งที่ตัดออก: ${Number(validation?.excludedSourceCount || 0).toLocaleString("th-TH")} ถุง`,
    `Status ไม่รู้จัก: ${Number(counts.UNKNOWN_STATUS || 0).toLocaleString("th-TH")} แถว`,
    `วันที่ผิด/ขาด DateStockIn: ${Number((counts.INVALID_DATE_STOCK_IN || 0) + (counts.MISSING_DATE_STOCK_IN || 0)).toLocaleString("th-TH")} แถว`
  ];

  const preview = (validation?.issues || []).slice(0, 6).map(issue => {
    const bag = issue.bagNumber ? ` — ${escapeHtml(issue.bagNumber)}` : "";
    return `แถว ${Number(issue.rowNumber || 0).toLocaleString("th-TH")}${bag}: ${escapeHtml(issue.message)}`;
  });

  return `${lines.join("<br>")}<br><br><strong>ตัวอย่างรายการ</strong><br>${preview.join("<br>") || "-"}<br><br>ระบบจะรวม BagNumber ซ้ำเป็นถุงเดียว และจะไม่นำแหล่งที่ไม่ระบุ/ข้อมูลทดสอบมาคำนวณรวม ต้องการดำเนินการต่อหรือไม่?`;
}

async function loadMobileOutcomeAnalysis(options = {}) {
  const target = document.getElementById("mobileOutcomeDashboard");
  if (!target) return;

  const cached = readMobileOutcomeCache();
  if (cached && !options.forceRefresh) {
    currentMobileOutcomeAnalysis = cached;
    renderMobileOutcomeDashboard(cached);
  } else {
    target.innerHTML = `
      <div class="hero-card mt-4">
        <h4 class="fw-bold mb-2">กำลังโหลดรายงาน</h4>
        <div class="small-muted">กำลังอ่านข้อมูลวิเคราะห์ผลถุงเลือดจาก snapshot ล่าสุด</div>
      </div>`;
  }

  try {
    const result = await MinimumStockBackend.getMobileUnitOutcomeAnalysis({
      forceRefresh: Boolean(options.forceRefresh)
    });
    const analysis = result?.analysis || null;
    if (!analysis) {
      if (!cached) renderMobileOutcomeEmpty(result?.message);
      return;
    }

    currentMobileOutcomeAnalysis = analysis;
    saveMobileOutcomeCache(analysis);
    renderMobileOutcomeDashboard(analysis);
  } catch (err) {
    if (!cached) {
      target.innerHTML = `
        <div class="hero-card mt-4">
          <h4 class="fw-bold mb-2">โหลดรายงานไม่สำเร็จ</h4>
          <div class="small-muted">${escapeHtml(err.message)}</div>
        </div>`;
    }
  }
}

function renderMobileOutcomeEmpty(message) {
  const target = document.getElementById("mobileOutcomeDashboard");
  if (!target) return;
  target.innerHTML = `
    <div class="hero-card mt-4">
      <h3 class="fw-bold mb-2">ยังไม่มีข้อมูลวิเคราะห์ผลถุงเลือดออกหน่วย</h3>
      <div class="small-muted mb-3">${escapeHtml(message || "กรุณาอัปโหลดไฟล์ Excel รอบล่าสุดที่หน้า Upload File ระบบจะคำนวณรายงานนี้ให้อัตโนมัติ")}</div>
      <button class="btn btn-main" onclick="scrollToUpload()">ไปหน้าอัปโหลดไฟล์</button>
    </div>`;
}

function mobileOutcomeUnique(rows, field) {
  return Array.from(new Set((rows || []).map(row => String(row[field] || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "th"));
}

function mobileOutcomeOptionHtml(values, placeholder) {
  return `<option value="">${escapeHtml(placeholder)}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function renderMobileOutcomeDashboard(analysis) {
  const target = document.getElementById("mobileOutcomeDashboard");
  if (!target) return;

  const rows = analysis.rows || [];
  const eligibleRows = rows.filter(row => row.received && row.includedInTotals);
  const dates = eligibleRows.map(row => row.dateStockIn).filter(Boolean).sort();
  const minDate = dates[0] || "";
  const maxDate = dates[dates.length - 1] || "";
  const years = Array.from(new Set(dates.map(date => date.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
  const validation = analysis.validation || {};
  const issueCounts = validation.issueCounts || {};

  const points = mobileOutcomeUnique(eligibleRows, "donateSource");
  const productTypes = mobileOutcomeUnique(eligibleRows, "productType");
  const bloodGroups = mobileOutcomeUnique(eligibleRows, "bloodGroup");
  const rhs = mobileOutcomeUnique(eligibleRows, "rh");

  const issueRows = (validation.issues || []).slice(0, 500).map(issue => `
    <tr>
      <td>${Number(issue.rowNumber || 0).toLocaleString("th-TH")}</td>
      <td class="fw-bold">${escapeHtml(issue.bagNumber || "-")}</td>
      <td>${escapeHtml(issue.type)}</td>
      <td>${escapeHtml(issue.message)}</td>
    </tr>`).join("");

  const reviewRows = rows.filter(row =>
    row.sourceGroup === "ไม่ระบุ/ต้องตรวจสอบ" ||
    row.finalOutcome === "ข้อมูลขัดแย้ง ต้องตรวจสอบ" ||
    !row.received
  ).slice(0, 300).map(row => `
    <tr>
      <td class="fw-bold">${escapeHtml(row.bagNumber || "-")}</td>
      <td>${escapeHtml(row.donateSource || "-")}</td>
      <td><span class="mo-source-pill review">${escapeHtml(row.sourceGroup || "ไม่ระบุ/ต้องตรวจสอบ")}</span></td>
      <td>${escapeHtml(row.status || "-")}</td>
      <td>${escapeHtml(row.destroyReason || "-")}</td>
      <td><span class="mo-outcome-pill ${getMobileOutcomeClass(row.finalOutcome)}">${escapeHtml(row.finalOutcome)}</span></td>
      <td>${escapeHtml(row.reviewReason || (!row.received ? "ไม่พบ DateStockIn ที่ถูกต้อง" : "-"))}</td>
    </tr>`).join("");

  target.innerHTML = `
    <div id="mobileOutcomeReportArea" class="mobile-outcome-report-area">
      <div class="mobile-outcome-hero mt-4">
        <div>
          <div class="mobile-outcome-eyebrow">📈 รายงานจากไฟล์ Excel รอบล่าสุด</div>
          <h2 class="fw-bold mb-2">วิเคราะห์ผลถุงเลือดจากการออกหน่วย</h2>
          <div class="small-muted">
            ไฟล์: <strong>${escapeHtml(analysis.fileName || "-")}</strong> · ประมวลผล ${escapeHtml(formatDisplayDateTime(analysis.generatedAt) || "-")}
          </div>
        </div>
        <div class="mobile-outcome-export-row no-print">
          <button class="btn btn-outline-primary" type="button" onclick="exportMobileOutcomeCsv()">CSV</button>
          <button class="btn btn-outline-primary" type="button" onclick="exportMobileOutcomeExcel()">Excel</button>
          <button class="btn btn-outline-primary" type="button" onclick="exportMobileOutcomePng()">บันทึกภาพ</button>
          <button class="btn btn-main" type="button" onclick="printMobileOutcomeReport()">PDF / พิมพ์</button>
        </div>
      </div>

      <div class="mobile-outcome-validation ${Number(validation.issueCount || 0) ? "has-warning" : "is-ok"}">
        <div class="mobile-outcome-validation-head">
          <div>
            <div class="fw-bold">${Number(validation.issueCount || 0) ? "⚠️ พบรายการที่ต้องตรวจสอบ" : "✅ ไม่พบข้อผิดปกติสำคัญ"}</div>
            <div class="small-muted">
              BagNumber ไม่ซ้ำ ${Number(validation.totalUniqueBagCount || 0).toLocaleString("th-TH")} ถุง · ใช้คำนวณได้ ${Number(validation.eligibleBagCount || 0).toLocaleString("th-TH")} ถุง ·
              ซ้ำ ${Number(validation.duplicateBagCount || 0).toLocaleString("th-TH")} · ไม่ระบุแหล่ง ${Number(validation.reviewSourceCount || 0).toLocaleString("th-TH")} · ตัดออก ${Number(validation.excludedSourceCount || 0).toLocaleString("th-TH")}
            </div>
          </div>
          <button class="btn btn-light no-print" type="button" onclick="toggleMobileOutcomeIssues()">ดูรายการตรวจสอบ</button>
        </div>
        <div id="mobileOutcomeIssuePanel" class="mobile-outcome-issue-panel" hidden>
          <div class="small-muted mb-2">
            แสดงสูงสุด 500 รายการ · วันที่ผิด ${Number((issueCounts.INVALID_DATE_STOCK_IN || 0) + (issueCounts.INVALID_DATE_STOCK_OUT || 0)).toLocaleString("th-TH")} ·
            Status ไม่รู้จัก ${Number(issueCounts.UNKNOWN_STATUS || 0).toLocaleString("th-TH")} · ผลลัพธ์ขัดแย้ง ${Number(issueCounts.OUTCOME_CONFLICT || 0).toLocaleString("th-TH")}
          </div>
          <div class="table-responsive mobile-outcome-issue-table">
            <table class="table table-sm align-middle mb-0">
              <thead><tr><th>แถว</th><th>BagNumber</th><th>ประเภท</th><th>รายการที่ต้องตรวจสอบ</th></tr></thead>
              <tbody>${issueRows || `<tr><td colspan="4" class="text-center small-muted py-3">ไม่พบรายการ</td></tr>`}</tbody>
            </table>
          </div>
          <div class="fw-bold mt-3 mb-2">ถุงที่แสดงเป็น “ไม่ระบุ/ต้องตรวจสอบ” หรือผลลัพธ์ขัดแย้ง</div>
          <div class="table-responsive mobile-outcome-issue-table">
            <table class="table table-sm align-middle mb-0 mobile-outcome-review-table">
              <thead><tr><th>BagNumber</th><th>DonateSource</th><th>กลุ่มแหล่งรับเข้า</th><th>Status</th><th>DestroyReason</th><th>ผลลัพธ์</th><th>เหตุผล</th></tr></thead>
              <tbody>${reviewRows || `<tr><td colspan="7" class="text-center small-muted py-3">ไม่พบถุงที่ต้องตรวจสอบเพิ่มเติม</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="mobile-outcome-filter-card no-print">
        <div class="mobile-outcome-filter-grid">
          <label><span>วันที่รับเข้าตั้งแต่</span><input id="moStartDate" class="form-control" type="date" value="${escapeHtml(minDate)}" onchange="applyMobileOutcomeFilters()"></label>
          <label><span>ถึงวันที่</span><input id="moEndDate" class="form-control" type="date" value="${escapeHtml(maxDate)}" onchange="applyMobileOutcomeFilters()"></label>
          <label><span>เดือน</span><select id="moMonth" class="form-select" onchange="setMobileOutcomeMonthYearRange()">
            <option value="">ทุกเดือน</option>
            ${Array.from({length: 12}, (_, index) => `<option value="${String(index + 1).padStart(2, "0")}">${new Date(2020, index, 1).toLocaleDateString("th-TH", { month: "long" })}</option>`).join("")}
          </select></label>
          <label><span>ปี</span><select id="moYear" class="form-select" onchange="setMobileOutcomeMonthYearRange()">${mobileOutcomeOptionHtml(years, "ทุกปี")}</select></label>
          <label><span>กลุ่มแหล่งรับเข้า</span><select id="moSourceGroup" class="form-select" onchange="applyMobileOutcomeFilters()">
            <option value="">ทั้งหมด</option><option value="หาเอง/ออกหน่วย">หาเอง/ออกหน่วย</option><option value="กาชาดไทย">กาชาดไทย</option>
          </select></label>
          <label><span>จุดออกหน่วย / DonateSource</span><select id="moDonateSource" class="form-select" onchange="applyMobileOutcomeFilters()">${mobileOutcomeOptionHtml(points, "ทุกจุด")}</select></label>
          <label><span>ProductType</span><select id="moProductType" class="form-select" onchange="applyMobileOutcomeFilters()">${mobileOutcomeOptionHtml(productTypes, "ทุกชนิด")}</select></label>
          <label><span>Blood Group</span><select id="moBloodGroup" class="form-select" ${analysis.hasBloodGroup ? "" : "disabled"} onchange="applyMobileOutcomeFilters()">${mobileOutcomeOptionHtml(bloodGroups, analysis.hasBloodGroup ? "ทุกหมู่" : "ไม่มีคอลัมน์")}</select></label>
          <label><span>Rh</span><select id="moRh" class="form-select" ${analysis.hasRh ? "" : "disabled"} onchange="applyMobileOutcomeFilters()">${mobileOutcomeOptionHtml(rhs, analysis.hasRh ? "ทุก Rh" : "ไม่มีคอลัมน์")}</select></label>
        </div>
        <div class="d-flex gap-2 flex-wrap mt-3">
          <button class="btn btn-light" type="button" onclick="resetMobileOutcomeFilters()">ล้างตัวกรอง</button>
          <div id="mobileOutcomeFilterCount" class="small-muted align-self-center"></div>
        </div>
      </div>

      <div id="mobileOutcomeSummary"></div>
      <div id="mobileOutcomeCharts"></div>
      <div id="mobileOutcomePointTable"></div>
    </div>`;

  applyMobileOutcomeFilters();
}

function setMobileOutcomeMonthYearRange() {
  const month = document.getElementById("moMonth")?.value || "";
  const year = document.getElementById("moYear")?.value || "";
  const start = document.getElementById("moStartDate");
  const end = document.getElementById("moEndDate");
  if (!start || !end) return;

  if (!year) {
    applyMobileOutcomeFilters();
    return;
  }

  if (month) {
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    start.value = `${year}-${month}-01`;
    end.value = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  } else {
    start.value = `${year}-01-01`;
    end.value = `${year}-12-31`;
  }
  applyMobileOutcomeFilters();
}

function getMobileOutcomeFilterValue(id) {
  return document.getElementById(id)?.value || "";
}

function resetMobileOutcomeFilters() {
  ["moMonth", "moYear", "moSourceGroup", "moDonateSource", "moProductType", "moBloodGroup", "moRh"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const rows = (currentMobileOutcomeAnalysis?.rows || []).filter(row => row.received && row.includedInTotals);
  const dates = rows.map(row => row.dateStockIn).filter(Boolean).sort();
  const start = document.getElementById("moStartDate");
  const end = document.getElementById("moEndDate");
  if (start) start.value = dates[0] || "";
  if (end) end.value = dates[dates.length - 1] || "";
  applyMobileOutcomeFilters();
}

function applyMobileOutcomeFilters() {
  if (!currentMobileOutcomeAnalysis) return;
  const startDate = getMobileOutcomeFilterValue("moStartDate");
  const endDate = getMobileOutcomeFilterValue("moEndDate");
  const sourceGroup = getMobileOutcomeFilterValue("moSourceGroup");
  const donateSource = getMobileOutcomeFilterValue("moDonateSource");
  const productType = getMobileOutcomeFilterValue("moProductType");
  const bloodGroup = getMobileOutcomeFilterValue("moBloodGroup");
  const rh = getMobileOutcomeFilterValue("moRh");

  const rows = (currentMobileOutcomeAnalysis.rows || []).filter(row => {
    if (!row.received || !row.includedInTotals) return false;
    if (startDate && row.dateStockIn < startDate) return false;
    if (endDate && row.dateStockIn > endDate) return false;
    if (sourceGroup && row.sourceGroup !== sourceGroup) return false;
    if (donateSource && row.donateSource !== donateSource) return false;
    if (productType && row.productType !== productType) return false;
    if (bloodGroup && row.bloodGroup !== bloodGroup) return false;
    if (rh && row.rh !== rh) return false;
    return true;
  });

  currentMobileOutcomeFilteredRows = rows;
  const count = document.getElementById("mobileOutcomeFilterCount");
  if (count) count.textContent = `ใช้คำนวณ ${rows.length.toLocaleString("th-TH")} ถุง ตามตัวกรองปัจจุบัน`;
  renderMobileOutcomeSummary(rows);
  renderMobileOutcomeCharts(rows);
  renderMobileOutcomePointTable(rows);
}

function calculateMobileOutcomeSummary(rows) {
  const total = rows.length;
  const self = rows.filter(row => row.sourceGroup === "หาเอง/ออกหน่วย").length;
  const trc = rows.filter(row => row.sourceGroup === "กาชาดไทย").length;
  const released = rows.filter(row => row.finalOutcome === "นำไปใช้/จ่ายออก").length;
  const destroyed = rows.filter(row => row.finalOutcome === "ทิ้ง/ทำลาย").length;
  const unknown = rows.filter(row => row.finalOutcome === "ยังไม่ทราบผล/คงเหลือ/สถานะอื่น").length;
  const conflict = rows.filter(row => row.finalOutcome === "ข้อมูลขัดแย้ง ต้องตรวจสอบ").length;
  return {
    total, self, trc, released, destroyed, unknown, conflict,
    releasedPct: total ? (released / total) * 100 : 0,
    destroyedPct: total ? (destroyed / total) * 100 : 0
  };
}

function renderMobileOutcomeSummary(rows) {
  const target = document.getElementById("mobileOutcomeSummary");
  if (!target) return;
  const s = calculateMobileOutcomeSummary(rows);
  const cards = [
    ["จำนวนรับเข้าทั้งหมด", s.total, "ถุง", "primary"],
    ["หาเอง/ออกหน่วย", s.self, "ถุง", "self"],
    ["กาชาดไทย", s.trc, "ถุง", "trc"],
    ["นำไปใช้/จ่ายออก", s.released, "ถุง", "released"],
    ["ทิ้ง/ทำลาย", s.destroyed, "ถุง", "destroyed"],
    ["ยังไม่ทราบผล/คงเหลือ", s.unknown, "ถุง", "unknown"],
    ["ร้อยละนำไปใช้", s.releasedPct.toFixed(1), "%", "released"],
    ["ร้อยละทิ้ง", s.destroyedPct.toFixed(1), "%", "destroyed"],
    ["ข้อมูลขัดแย้ง", s.conflict, "ถุง", "conflict"]
  ];

  target.innerHTML = `<div class="mobile-outcome-summary-grid">${cards.map(card => `
    <div class="mobile-outcome-summary-card ${card[3]}">
      <div class="mobile-outcome-summary-label">${card[0]}</div>
      <div class="mobile-outcome-summary-value">${Number(card[1]).toLocaleString("th-TH", { maximumFractionDigits: 1 })}<span>${card[2]}</span></div>
    </div>`).join("")}</div>
    <div class="mobile-outcome-formula-note">ร้อยละใช้และร้อยละทิ้งคำนวณจากจำนวนถุงรับเข้าตามช่วงวันที่และตัวกรองปัจจุบัน โดยแสดงถุงยังไม่ทราบผลและข้อมูลขัดแย้งแยกต่างหาก</div>`;
}

function buildMobileOutcomeGroups(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = `${row.donateSource}||${row.sourceGroup}`;
    if (!map.has(key)) {
      map.set(key, {
        donateSource: row.donateSource || "ไม่ระบุ/ต้องตรวจสอบ",
        sourceGroup: row.sourceGroup,
        received: 0,
        released: 0,
        destroyed: 0,
        unknown: 0,
        conflict: 0,
        rows: []
      });
    }
    const group = map.get(key);
    group.received += 1;
    group.rows.push(row);
    if (row.finalOutcome === "นำไปใช้/จ่ายออก") group.released += 1;
    else if (row.finalOutcome === "ทิ้ง/ทำลาย") group.destroyed += 1;
    else if (row.finalOutcome === "ข้อมูลขัดแย้ง ต้องตรวจสอบ") group.conflict += 1;
    else group.unknown += 1;
  });

  return Array.from(map.values()).map(group => ({
    ...group,
    releasedPct: group.received ? (group.released / group.received) * 100 : 0,
    destroyedPct: group.received ? (group.destroyed / group.received) * 100 : 0
  })).sort((a, b) => b.received - a.received || a.donateSource.localeCompare(b.donateSource, "th"));
}

function mobileOutcomeBar(value, max, className) {
  const width = max > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
  return `<div class="mo-bar-track"><div class="mo-bar-fill ${className}" style="width:${width.toFixed(1)}%"></div></div>`;
}

function renderMobileOutcomeCharts(rows) {
  const target = document.getElementById("mobileOutcomeCharts");
  if (!target) return;
  const groups = buildMobileOutcomeGroups(rows);
  const sourceGroups = ["หาเอง/ออกหน่วย", "กาชาดไทย"].map(name => {
    const sourceRows = rows.filter(row => row.sourceGroup === name);
    return { name, ...calculateMobileOutcomeSummary(sourceRows) };
  });
  const maxSource = Math.max(1, ...sourceGroups.flatMap(row => [row.total, row.released, row.destroyed]));
  const maxPoint = Math.max(1, ...groups.flatMap(row => [row.received, row.released, row.destroyed]));
  const chartGroups = groups.slice(0, 30);

  target.innerHTML = `
    <div class="mobile-outcome-chart-grid">
      <div class="mobile-outcome-chart-card">
        <h5 class="fw-bold mb-1">เปรียบเทียบหาเอง/ออกหน่วยกับกาชาดไทย</h5>
        <div class="small-muted mb-3">จำนวนรับเข้า ใช้ และทิ้ง ตามตัวกรองปัจจุบัน</div>
        ${sourceGroups.map(row => `
          <div class="mo-source-chart-group">
            <div class="fw-bold mb-2">${escapeHtml(row.name)}</div>
            <div class="mo-metric-row"><span>รับเข้า ${row.total.toLocaleString("th-TH")}</span>${mobileOutcomeBar(row.total, maxSource, "received")}</div>
            <div class="mo-metric-row"><span>ใช้ ${row.released.toLocaleString("th-TH")}</span>${mobileOutcomeBar(row.released, maxSource, "released")}</div>
            <div class="mo-metric-row"><span>ทิ้ง ${row.destroyed.toLocaleString("th-TH")}</span>${mobileOutcomeBar(row.destroyed, maxSource, "destroyed")}</div>
          </div>`).join("")}
      </div>

      <div class="mobile-outcome-chart-card">
        <h5 class="fw-bold mb-1">รับเข้า ใช้ และทิ้งรายจุดออกหน่วย</h5>
        <div class="small-muted mb-3">เรียงจากจำนวนรับเข้าสูงสุด แสดงสูงสุด 30 จุด</div>
        <div class="mo-scroll-chart">
          ${chartGroups.map(row => `
            <div class="mo-point-chart-row">
              <div class="mo-point-label" title="${escapeHtml(row.donateSource)}">${escapeHtml(row.donateSource)}</div>
              <div class="mo-point-bars">
                <div class="mo-metric-row"><span>รับ ${row.received}</span>${mobileOutcomeBar(row.received, maxPoint, "received")}</div>
                <div class="mo-metric-row"><span>ใช้ ${row.released}</span>${mobileOutcomeBar(row.released, maxPoint, "released")}</div>
                <div class="mo-metric-row"><span>ทิ้ง ${row.destroyed}</span>${mobileOutcomeBar(row.destroyed, maxPoint, "destroyed")}</div>
              </div>
            </div>`).join("") || `<div class="small-muted">ไม่พบข้อมูล</div>`}
        </div>
      </div>

      <div class="mobile-outcome-chart-card mobile-outcome-chart-wide">
        <h5 class="fw-bold mb-1">ร้อยละทิ้งของแต่ละจุด</h5>
        <div class="small-muted mb-3">ใช้จำนวนรับเข้าของจุดนั้นเป็นตัวหาร</div>
        <div class="mo-waste-grid">
          ${groups.slice().sort((a, b) => b.destroyedPct - a.destroyedPct || b.received - a.received).slice(0, 40).map(row => `
            <div class="mo-waste-row">
              <div class="mo-waste-label" title="${escapeHtml(row.donateSource)}">${escapeHtml(row.donateSource)}</div>
              ${mobileOutcomeBar(row.destroyedPct, 100, "destroyed")}
              <div class="mo-waste-value">${row.destroyedPct.toFixed(1)}%</div>
            </div>`).join("") || `<div class="small-muted">ไม่พบข้อมูล</div>`}
        </div>
      </div>
    </div>`;
}

function renderMobileOutcomePointTable(rows) {
  const target = document.getElementById("mobileOutcomePointTable");
  if (!target) return;
  currentMobileOutcomeGroups = buildMobileOutcomeGroups(rows);

  target.innerHTML = `
    <div class="mobile-outcome-table-card">
      <div class="mobile-outcome-section-head">
        <div><h4 class="fw-bold mb-1">สรุปตามจุดออกหน่วย</h4><div class="small-muted">กดดูรายละเอียดเพื่อเปิดรายการรายถุงของจุดนั้น</div></div>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 mobile-outcome-table">
          <thead><tr>
            <th>จุดออกหน่วย</th><th>กลุ่มแหล่งรับเข้า</th><th class="text-end">รับเข้า</th><th class="text-end">นำไปใช้/จ่ายออก</th>
            <th class="text-end">ทิ้ง/ทำลาย</th><th class="text-end">ยังไม่ทราบผล/คงเหลือ</th><th class="text-end">ขัดแย้ง</th>
            <th class="text-end">ร้อยละใช้</th><th class="text-end">ร้อยละทิ้ง</th><th class="no-print"></th>
          </tr></thead>
          <tbody>${currentMobileOutcomeGroups.map((group, index) => `
            <tr>
              <td class="fw-bold">${escapeHtml(group.donateSource)}</td>
              <td><span class="mo-source-pill ${group.sourceGroup === "กาชาดไทย" ? "trc" : "self"}">${escapeHtml(group.sourceGroup)}</span></td>
              <td class="text-end fw-bold">${group.received.toLocaleString("th-TH")}</td>
              <td class="text-end">${group.released.toLocaleString("th-TH")}</td>
              <td class="text-end">${group.destroyed.toLocaleString("th-TH")}</td>
              <td class="text-end">${group.unknown.toLocaleString("th-TH")}</td>
              <td class="text-end">${group.conflict.toLocaleString("th-TH")}</td>
              <td class="text-end">${group.releasedPct.toFixed(1)}%</td>
              <td class="text-end">${group.destroyedPct.toFixed(1)}%</td>
              <td class="no-print"><button class="btn btn-sm btn-outline-primary" type="button" onclick="openMobileOutcomeDetail(${index})">ดูรายละเอียด</button></td>
            </tr>`).join("") || `<tr><td colspan="10" class="text-center small-muted py-4">ไม่พบข้อมูลตามตัวกรอง</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function formatMobileOutcomeDate(value) {
  if (!value) return "-";
  const parts = String(value).split("-");
  if (parts.length !== 3) return escapeHtml(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function openMobileOutcomeDetail(index) {
  const group = currentMobileOutcomeGroups[index];
  const overlay = document.getElementById("mobileOutcomeDetailOverlay");
  const title = document.getElementById("mobileOutcomeDetailTitle");
  const content = document.getElementById("mobileOutcomeDetailContent");
  if (!group || !overlay || !title || !content) return;

  title.textContent = group.donateSource;
  content.innerHTML = `
    <div class="mobile-outcome-detail-summary">
      รับเข้า ${group.received.toLocaleString("th-TH")} · ใช้ ${group.released.toLocaleString("th-TH")} · ทิ้ง ${group.destroyed.toLocaleString("th-TH")} · ยังไม่ทราบผล ${group.unknown.toLocaleString("th-TH")} · ขัดแย้ง ${group.conflict.toLocaleString("th-TH")}
    </div>
    <div class="table-responsive">
      <table class="table table-hover align-middle mobile-outcome-detail-table">
        <thead><tr><th>BagNumber</th><th>ProductType</th><th>BloodGroup</th><th>Rh</th><th>DonateSource</th><th>DateStockIn</th><th>DateStockOut</th><th>Status</th><th>DestroyReason</th><th>ผลลัพธ์สุดท้าย</th></tr></thead>
        <tbody>${group.rows.map(row => `
          <tr>
            <td class="fw-bold">${escapeHtml(row.bagNumber)}</td><td>${escapeHtml(row.productType || "-")}</td><td>${escapeHtml(row.bloodGroup || "-")}</td><td>${escapeHtml(row.rh || "-")}</td>
            <td>${escapeHtml(row.donateSource || "-")}</td><td>${formatMobileOutcomeDate(row.dateStockIn)}</td><td>${formatMobileOutcomeDate(row.dateStockOut)}</td>
            <td>${escapeHtml(row.status || "-")}</td><td>${escapeHtml(row.destroyReason || "-")}</td><td><span class="mo-outcome-pill ${getMobileOutcomeClass(row.finalOutcome)}">${escapeHtml(row.finalOutcome)}</span></td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
  overlay.style.display = "flex";
}

function closeMobileOutcomeDetail() {
  const overlay = document.getElementById("mobileOutcomeDetailOverlay");
  if (overlay) overlay.style.display = "none";
}

function getMobileOutcomeClass(outcome) {
  if (outcome === "นำไปใช้/จ่ายออก") return "released";
  if (outcome === "ทิ้ง/ทำลาย") return "destroyed";
  if (outcome === "ข้อมูลขัดแย้ง ต้องตรวจสอบ") return "conflict";
  return "unknown";
}

function toggleMobileOutcomeIssues() {
  const panel = document.getElementById("mobileOutcomeIssuePanel");
  if (panel) panel.hidden = !panel.hidden;
}

function sanitizeSpreadsheetValue(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function getMobileOutcomeDetailExportRows() {
  return currentMobileOutcomeFilteredRows.map(row => ({
    BagNumber: sanitizeSpreadsheetValue(row.bagNumber),
    ProductType: sanitizeSpreadsheetValue(row.productType),
    BloodGroup: sanitizeSpreadsheetValue(row.bloodGroup),
    Rh: sanitizeSpreadsheetValue(row.rh),
    DonateSource: sanitizeSpreadsheetValue(row.donateSource),
    SourceGroup: row.sourceGroup,
    DateStockIn: row.dateStockIn,
    DateStockOut: row.dateStockOut,
    Status: sanitizeSpreadsheetValue(row.status),
    DestroyReason: sanitizeSpreadsheetValue(row.destroyReason),
    FinalOutcome: row.finalOutcome
  }));
}

function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportMobileOutcomeCsv() {
  const rows = getMobileOutcomeDetailExportRows();
  if (!rows.length) return showModal("error", "ไม่มีข้อมูลส่งออก", "ไม่พบรายการตามตัวกรองปัจจุบัน");
  const headers = Object.keys(rows[0]);
  const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [headers.map(quote).join(","), ...rows.map(row => headers.map(header => quote(row[header])).join(","))].join("\r\n");
  downloadTextFile(csv, `Mobile-Unit-Outcome-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

function exportMobileOutcomeExcel() {
  if (!window.XLSX) return showModal("error", "ส่งออกไม่ได้", "ไม่พบไลบรารี XLSX");
  const detailRows = getMobileOutcomeDetailExportRows();
  if (!detailRows.length) return showModal("error", "ไม่มีข้อมูลส่งออก", "ไม่พบรายการตามตัวกรองปัจจุบัน");

  const summaryRows = currentMobileOutcomeGroups.map(group => ({
    "จุดออกหน่วย": group.donateSource,
    "กลุ่มแหล่งรับเข้า": group.sourceGroup,
    "รับเข้า": group.received,
    "นำไปใช้/จ่ายออก": group.released,
    "ทิ้ง/ทำลาย": group.destroyed,
    "ยังไม่ทราบผล/คงเหลือ": group.unknown,
    "ข้อมูลขัดแย้ง": group.conflict,
    "ร้อยละใช้": Number(group.releasedPct.toFixed(1)),
    "ร้อยละทิ้ง": Number(group.destroyedPct.toFixed(1))
  }));
  const issueRows = (currentMobileOutcomeAnalysis?.validation?.issues || []).map(issue => ({
    "แถว": issue.rowNumber,
    "BagNumber": sanitizeSpreadsheetValue(issue.bagNumber),
    "ประเภท": issue.type,
    "ระดับ": issue.severity,
    "รายการที่ต้องตรวจสอบ": sanitizeSpreadsheetValue(issue.message)
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "สรุปรายจุด");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "รายละเอียดรายถุง");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(issueRows), "รายการตรวจสอบ");
  XLSX.writeFile(workbook, `Mobile-Unit-Outcome-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportMobileOutcomePng() {
  const target = document.getElementById("mobileOutcomeReportArea");
  if (!target) return;
  if (!window.html2canvas) return showModal("error", "บันทึกภาพไม่ได้", "ไม่พบไลบรารี html2canvas กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");

  try {
    document.body.classList.add("mobile-outcome-exporting");
    const canvas = await window.html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const link = document.createElement("a");
    link.download = `Mobile-Unit-Outcome-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    showModal("error", "บันทึกภาพไม่สำเร็จ", err.message);
  } finally {
    document.body.classList.remove("mobile-outcome-exporting");
  }
}

function printMobileOutcomeReport() {
  document.body.classList.add("print-mobile-outcome");
  window.print();
  setTimeout(() => document.body.classList.remove("print-mobile-outcome"), 800);
}


    function showDashboardPage(page, btn) {
  document.querySelectorAll(".dashboard-page").forEach(el => {
    el.classList.remove("active");
  });

  document.getElementById("page-" + page).classList.add("active");

  document.querySelectorAll(".side-btn").forEach(el => {
    el.classList.remove("active");
  });

  if (btn) btn.classList.add("active");

  toggleSidebar(false);

  if (page === "mobile") {
  loadMobilePlanning();
}

if (page === "expiry") {
  loadExpiryRisk(7);
}

if (page === "mobile-outcome") {
  loadMobileOutcomeAnalysis();
}
}

function toggleSidebar(force) {
  const sideMenu = document.getElementById("sideMenu");
  const overlay = document.getElementById("sideOverlay");

  const shouldOpen = force === undefined
    ? !sideMenu.classList.contains("open")
    : force;

  sideMenu.classList.toggle("open", shouldOpen);
  overlay.classList.toggle("show", shouldOpen);
}


/* ---------------- PWA install ---------------- */
let deferredInstallPrompt = null;
const INSTALL_HELP_DISMISSED_KEY = "minimumStock.installHelpDismissed";

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function isIOSSafari() {
  const ua = window.navigator.userAgent;
  return isIOSDevice() && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

function getInstallElements() {
  return {
    button: document.getElementById("installAppBtn"),
    overlay: document.getElementById("installOverlay"),
    title: document.getElementById("installTitle"),
    message: document.getElementById("installMessage"),
    close: document.getElementById("installCloseBtn"),
    dismissWrap: document.getElementById("installDismissWrap"),
    dismissCheck: document.getElementById("installDismissCheck")
  };
}

function hideInstallButtonWhenInstalled() {
  const { button } = getInstallElements();
  if (!button) return;
  button.classList.toggle("is-installed", isStandaloneMode());
}

function closeInstallModal() {
  const { overlay, dismissCheck } = getInstallElements();
  if (!overlay) return;
  if (dismissCheck?.checked) {
    try { localStorage.setItem(INSTALL_HELP_DISMISSED_KEY, "1"); } catch (_) {}
  }
  overlay.style.display = "none";
}

function showInstallModal(mode = "ios", autoShown = false) {
  const { overlay, title, message, close, dismissWrap, dismissCheck } = getInstallElements();
  if (!overlay || !title || !message || !close) return;

  if (mode === "ios") {
    title.textContent = "ติดตั้งบน iPhone / iPad";
    message.innerHTML = `
      <div class="install-step"><span class="install-step-number">1</span><span>กดปุ่มแชร์ <strong>⬆️</strong> ใน Safari</span></div>
      <div class="install-step"><span class="install-step-number">2</span><span>เลือก <strong>เพิ่มไปยังหน้าจอโฮม</strong></span></div>
      <div class="install-step"><span class="install-step-number">3</span><span>กด <strong>เพิ่ม</strong></span></div>
    `;
  } else {
    title.textContent = "ติดตั้งแอป";
    message.innerHTML = `
      <div class="install-step"><span class="install-step-number">1</span><span>เปิดเมนู Chrome <strong>⋮</strong></span></div>
      <div class="install-step"><span class="install-step-number">2</span><span>เลือก <strong>ติดตั้งแอป</strong> หรือ <strong>เพิ่มไปยังหน้าจอหลัก</strong></span></div>
    `;
  }

  if (dismissWrap) dismissWrap.style.display = autoShown ? "flex" : "none";
  if (dismissCheck) dismissCheck.checked = false;
  close.onclick = closeInstallModal;
  overlay.onclick = (event) => {
    if (event.target === overlay) closeInstallModal();
  };
  overlay.style.display = "flex";
}

async function handleInstallAppClick() {
  if (isStandaloneMode()) {
    hideInstallButtonWhenInstalled();
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice?.outcome === "accepted") {
      hideInstallButtonWhenInstalled();
    }
    return;
  }

  showInstallModal(isIOSDevice() ? "ios" : "android", false);
}

function setupPWAInstall() {
  const { button } = getInstallElements();
  hideInstallButtonWhenInstalled();

  if (button) {
    button.addEventListener("click", handleInstallAppClick);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    hideInstallButtonWhenInstalled();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideInstallButtonWhenInstalled();
    showModal("success", "ติดตั้งสำเร็จ", "เพิ่ม Minimum Stock ไปยังหน้าจอแอปแล้ว");
  });

  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", hideInstallButtonWhenInstalled);

  if (isIOSSafari() && !isStandaloneMode()) {
    let dismissed = false;
    try { dismissed = localStorage.getItem(INSTALL_HELP_DISMISSED_KEY) === "1"; } catch (_) {}
    if (!dismissed) {
      window.setTimeout(() => showInstallModal("ios", true), 900);
    }
  }
}

async function registerMinimumStockServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    registration.update().catch(() => {});
  } catch (error) {
    console.warn("Service Worker registration failed", error);
  }
}

window.addEventListener("load", () => {
  setupPWAInstall();
  registerMinimumStockServiceWorker();
});
