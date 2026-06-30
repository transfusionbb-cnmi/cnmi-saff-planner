/* CNMI Staff Planner PWA registration + install prompt — V302 */
(() => {
  'use strict';

  const scriptBaseUrl = document.currentScript
    ? new URL('.', document.currentScript.src)
    : new URL('./', window.location.href);

  let deferredInstallPrompt = null;
  let registrationReady = false;
  const installButtons = new Set();

  const isStandalone = () => (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true
  );

  const isAndroid = () => /Android/i.test(navigator.userAgent || '');
  const isIOS = () => /iPad|iPhone|iPod/i.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function setButtonsVisible(visible) {
    installButtons.forEach((button) => {
      button.classList.toggle('hidden', !visible);
      button.disabled = false;
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  function setButtonsBusy(busy, label) {
    installButtons.forEach((button) => {
      button.disabled = busy;
      if (label) button.querySelector('[data-pwa-label]').textContent = label;
    });
  }

  function createButton(extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pwa-install-btn ${extraClass}`.trim();
    button.innerHTML = '<span aria-hidden="true">⬇️</span><span data-pwa-label>ติดตั้งแอป</span>';
    button.addEventListener('click', handleInstallClick);
    installButtons.add(button);
    return button;
  }

  function ensureInstallUI() {
    if (document.querySelector('[data-cnmi-pwa-install="v302"]')) return;

    const authCard = document.querySelector('.auth-card');
    if (authCard) {
      const wrapper = document.createElement('div');
      wrapper.dataset.cnmiPwaInstall = 'v302';
      const button = createButton('pwa-install-btn--auth');
      const note = document.createElement('p');
      note.className = 'pwa-install-note';
      note.textContent = 'ติดตั้งแล้วจะเปิดเต็มหน้าจอเหมือนแอป ไม่แสดงแถบ Browser';
      wrapper.append(button, note);
      authCard.appendChild(wrapper);
    }

    const sidebarFoot = document.querySelector('.sidebar-foot');
    if (sidebarFoot) {
      const button = createButton('');
      button.dataset.cnmiPwaInstall = 'v302';
      sidebarFoot.insertBefore(button, sidebarFoot.firstChild);
    }

    createModal();
    setButtonsVisible(!isStandalone());
  }

  function createModal() {
    if (document.getElementById('pwaInstallModalV302')) return;
    const modal = document.createElement('div');
    modal.id = 'pwaInstallModalV302';
    modal.className = 'pwa-install-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'pwaInstallTitleV302');
    modal.innerHTML = `
      <div class="pwa-install-dialog">
        <button type="button" class="pwa-install-close" aria-label="ปิด">×</button>
        <h3 id="pwaInstallTitleV302">ติดตั้ง CNMI Staff Planner</h3>
        <div data-pwa-instructions></div>
      </div>`;
    modal.querySelector('.pwa-install-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.body.appendChild(modal);
  }

  function showModal(html) {
    const modal = document.getElementById('pwaInstallModalV302');
    if (!modal) return;
    modal.querySelector('[data-pwa-instructions]').innerHTML = html;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    const modal = document.getElementById('pwaInstallModalV302');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  async function handleInstallClick() {
    if (isStandalone()) {
      setButtonsVisible(false);
      return;
    }

    if (deferredInstallPrompt) {
      setButtonsBusy(true, 'กำลังเปิดหน้าติดตั้ง…');
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice && choice.outcome === 'accepted') {
          setButtonsBusy(true, 'กำลังติดตั้ง…');
        } else {
          setButtonsBusy(false, 'ติดตั้งแอป');
        }
      } catch (error) {
        console.warn('[PWA V302] Install prompt failed:', error);
        setButtonsBusy(false, 'ติดตั้งแอป');
        showManualInstructions();
      }
      return;
    }

    if (!registrationReady && 'serviceWorker' in navigator) {
      setButtonsBusy(true, 'กำลังเตรียมแอป…');
      try {
        await navigator.serviceWorker.ready;
        registrationReady = true;
      } catch (_) {
        // Continue to manual instructions.
      }
      setButtonsBusy(false, 'ติดตั้งแอป');
    }

    showManualInstructions();
  }

  function showManualInstructions() {
    if (isAndroid()) {
      showModal(`
        <p>หากหน้าต่างติดตั้งยังไม่เด้งขึ้น ให้ติดตั้งจากเมนู Browser:</p>
        <ol>
          <li>เปิดหน้านี้ด้วย <strong>Google Chrome</strong></li>
          <li>แตะเมนู <strong>⋮</strong> มุมขวาบน</li>
          <li>เลือก <strong>ติดตั้งแอป</strong> หรือ <strong>เพิ่มไปยังหน้าจอหลัก</strong></li>
          <li>แตะ <strong>ติดตั้ง</strong></li>
        </ol>
        <div class="pwa-install-status">หลังอัปเดต V302 ครั้งแรก อาจต้องปิดแท็บเดิมแล้วเปิดเว็บใหม่ 1 ครั้ง เพื่อให้ Android ตรวจพบ Service Worker และแสดงคำสั่ง “ติดตั้งแอป”</div>`);
      return;
    }

    if (isIOS()) {
      showModal(`
        <p>บน iPhone/iPad ให้เปิดด้วย Safari แล้วทำตามนี้:</p>
        <ol>
          <li>แตะปุ่ม <strong>แชร์</strong></li>
          <li>เลือก <strong>เพิ่มไปยังหน้าจอโฮม</strong></li>
          <li>แตะ <strong>เพิ่ม</strong></li>
        </ol>`);
      return;
    }

    showModal(`
      <p>เปิดเมนูของ Browser แล้วเลือก <strong>ติดตั้งแอป</strong> หรือไอคอนติดตั้งบริเวณแถบที่อยู่</p>
      <div class="pwa-install-status">ควรเปิดผ่าน HTTPS และใช้ Chrome, Edge หรือ Browser ที่รองรับ PWA</div>`);
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const workerUrl = new URL('sw.js', scriptBaseUrl);
      const registration = await navigator.serviceWorker.register(workerUrl.href, { scope: scriptBaseUrl.pathname });
      registrationReady = true;
      registration.update().catch(() => {});
      console.info('[PWA V302] Service Worker registered:', registration.scope);
    } catch (error) {
      console.warn('[PWA V302] Service Worker registration failed:', error);
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setButtonsVisible(!isStandalone());
    setButtonsBusy(false, 'ติดตั้งแอป');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setButtonsVisible(false);
    closeModal();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', (event) => {
    if (event.matches) setButtonsVisible(false);
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureInstallUI();
    registerServiceWorker();
  });
})();
