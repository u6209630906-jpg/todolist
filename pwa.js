/* MyniApp — supporto PWA condiviso da tutte le pagine.
   Registra il service worker, gestisce il pulsante "Installa" e, nelle pagine
   interne, aggiunge un tasto per tornare alla home della PWA. */

(function () {
  'use strict';

  var isHome = /(^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
  var deferredPrompt = null;
  var listeners = [];

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(!!deferredPrompt); } catch (e) { /* ignora */ }
    });
  }

  var api = {
    canInstall: function () { return !!deferredPrompt; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    promptInstall: function () {
      if (!deferredPrompt) return Promise.resolve(false);
      var prompt = deferredPrompt;
      deferredPrompt = null;
      notify();
      prompt.prompt();
      return prompt.userChoice.then(function (choice) {
        return choice && choice.outcome === 'accepted';
      }).catch(function () { return false; });
    },
    isStandalone: function () {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
    }
  };
  window.MyniAppPWA = api;

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    notify();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {
        /* offline non disponibile: l'app continua a funzionare online */
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('myni-pwa-style')) return;
    var style = document.createElement('style');
    style.id = 'myni-pwa-style';
    style.textContent = [
      '.myni-home-btn{position:fixed;bottom:calc(14px + env(safe-area-inset-bottom,0px));left:12px;z-index:45;',
      'width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
      'color:currentColor;text-decoration:none;background:rgba(127,127,127,.18);',
      'border:1px solid rgba(127,127,127,.3);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
      'box-shadow:0 4px 16px rgba(0,0,0,.22);transition:transform .2s ease,background .2s ease;opacity:.9}',
      '.myni-home-btn:hover{background:rgba(127,127,127,.3);transform:scale(1.06);opacity:1}',
      '.myni-home-btn:active{transform:scale(.94)}',
      '.myni-home-btn svg{width:20px;height:20px}',
      '.myni-offline-pill{position:fixed;bottom:calc(18px + env(safe-area-inset-bottom,0px));left:50%;',
      'transform:translate(-50%,20px);z-index:95;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:600;',
      'background:rgba(24,24,32,.85);color:#fff;border:1px solid rgba(255,255,255,.16);',
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);opacity:0;',
      'transition:opacity .3s ease,transform .3s ease;pointer-events:none;font-family:inherit;white-space:nowrap}',
      '.myni-offline-pill.show{opacity:1;transform:translate(-50%,0)}'
    ].join('');
    document.head.appendChild(style);
  }

  function addHomeButton() {
    if (isHome || document.querySelector('.myni-home-btn')) return;
    injectStyles();
    var link = document.createElement('a');
    link.className = 'myni-home-btn';
    link.href = 'index.html';
    link.setAttribute('aria-label', 'Torna alla home di MyniApp');
    link.title = 'Torna alla home di MyniApp';
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    document.body.appendChild(link);
  }

  function addOfflinePill() {
    if (document.querySelector('.myni-offline-pill')) return;
    injectStyles();
    var pill = document.createElement('div');
    pill.className = 'myni-offline-pill';
    pill.textContent = '📴 Offline — stai usando la copia salvata';    document.body.appendChild(pill);
    function sync() {
      pill.classList.toggle('show', navigator.onLine === false);
    }
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  function boot() {
    addHomeButton();
    addOfflinePill();
    var button = document.getElementById('installAppBtn');
    if (button && !isHome) button.hidden = true;
    if (button) {
      button.addEventListener('click', function () {
        api.promptInstall().then(function (accepted) {
          if (!accepted) return;
          button.hidden = true;
        });
      });
      api.onChange(function (available) {
        button.hidden = !available;
      });
      button.hidden = !api.canInstall();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
