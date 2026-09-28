/* Informational browser alerts use the same centered, accessible app surface.
   Confirmation workflows keep their asynchronous confirmDialog implementation. */
(() => {
  'use strict';
  if (window.__CNMI_V569_CENTERED_FEEDBACK__) return;
  window.__CNMI_V569_CENTERED_FEEDBACK__ = true;

  const messages = [];
  let visible = false;
  let previousFocus = null;

  function present() {
    if (visible || !messages.length || !document.body) return;
    visible = true;
    previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.id = 'cnmiAlertV569';
    backdrop.className = 'cnmi-alert-backdrop-v569';
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'cnmiAlertTitleV569');
    backdrop.setAttribute('aria-describedby', 'cnmiAlertMessageV569');
    const card = document.createElement('div');
    card.className = 'cnmi-alert-card-v569';
    const title = document.createElement('h2');
    title.id = 'cnmiAlertTitleV569';
    title.textContent = 'แจ้งเตือน';
    const message = document.createElement('p');
    message.id = 'cnmiAlertMessageV569';
    message.textContent = messages.shift();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'รับทราบ';
    button.className = 'primary-btn';
    function dismiss() {
      backdrop.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      visible = false;
      if (!messages.length && previousFocus?.isConnected) previousFocus.focus();
      present();
    }
    function onKeydown(event) {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        dismiss();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        button.focus();
      }
    }
    button.addEventListener('click', dismiss, {once:true});
    backdrop.addEventListener('keydown', onKeydown);
    card.append(title, message, button);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    button.focus();
  }

  window.alert = function centeredAppAlert(value) {
    messages.push(String(value === undefined ? '' : value));
    if (document.body) present();
    else document.addEventListener('DOMContentLoaded', present, {once:true});
  };
})();
