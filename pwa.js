/* MyniApp — supporto PWA condiviso da tutte le pagine.
   Registra il service worker, gestisce il pulsante "Installa", il tema unico
   di tutte le app e, nelle pagine interne, un tasto per tornare alla home. */

(function () {
  'use strict';

  var isHome = /(^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
  var deferredPrompt = null;
  var listeners = [];

  /* ===== TEMA CONDIVISO ===== */
  // Un solo tema per tutta la PWA: cambiarlo in un'app vale anche per le altre,
  // comprese le finestre già aperte (sincronizzazione con l'evento "storage").
  var THEME_KEY = 'myniapp_theme';
  var THEME_LEGACY_KEYS = ['myniapp-theme', 'ftx:theme'];
  var themeListeners = [];
  var currentTheme = 'dark';

  // Le app senza modalità scura (per ora il Gantt) dichiarano
  // <meta name="myni-theme" content="light-only"> e restano sempre chiare.
  var THEME_FIXED = !!(document.querySelector('meta[name="myni-theme"][content="light-only"]'));

  function readStoredTheme() {
    try {
      var value = localStorage.getItem(THEME_KEY);
      if (value === 'light' || value === 'dark') return value;
      // Adotta il tema salvato dalle vecchie versioni delle singole app.
      for (var i = 0; i < THEME_LEGACY_KEYS.length; i++) {
        var legacy = localStorage.getItem(THEME_LEGACY_KEYS[i]);
        if (legacy === 'light' || legacy === 'dark') return legacy;
      }
    } catch (e) { /* localStorage non disponibile */ }
    return null;
  }

  function applyThemeToDocument(value) {
    currentTheme = value === 'light' ? 'light' : 'dark';
    var root = document.documentElement;
    if (THEME_FIXED) {
      // L'app non ha un tema scuro: non tocco colori né schema, così i suoi
      // controlli nativi (date picker compreso) restano leggibili.
      if (document.body) document.body.classList.remove('light');
      if (root) {
        root.classList.remove('myni-light');
        root.style.backgroundColor = '';
        root.style.colorScheme = 'light';
      }
      return;
    }
    if (document.body) {
      document.body.classList.toggle('light', currentTheme === 'light');
    }
    if (root) {
      root.classList.toggle('myni-light', currentTheme === 'light');
      root.style.colorScheme = currentTheme;
      // Colore di fondo immediato: evita il lampo bianco/nero nel primo paint.
      root.style.backgroundColor = currentTheme === 'light' ? '#f0f2f5' : '#0a0a14';
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', currentTheme === 'light' ? '#f0f2f5' : '#0a0a14');
  }

  // Il body non esiste ancora quando questo file viene letto nell'<head>:
  // appena compare gli applico il tema, prima che la pagina sia dipinta.
  function applyThemeWhenBodyReady() {
    if (document.body) {
      document.body.classList.toggle('light', currentTheme === 'light');
      return;
    }
    var observer = new MutationObserver(function () {
      if (!document.body) return;
      observer.disconnect();
      document.body.classList.toggle('light', currentTheme === 'light');
    });
    observer.observe(document.documentElement, { childList: true });
  }

  function emitTheme() {
    themeListeners.forEach(function (fn) {
      try { fn(currentTheme); } catch (e) { /* ignora */ }
    });
  }

  function hasStoredTheme() {
    try {
      var value = localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark';
    } catch (e) { return false; }
  }

  var themeApi = {
    key: THEME_KEY,
    get: function () { return currentTheme; },
    set: function (value, silent) {
      var next = value === 'light' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* modalità privata */ }
      applyThemeToDocument(next);
      if (!silent) emitTheme();
      return next;
    },
    toggle: function () { return themeApi.set(currentTheme === 'light' ? 'dark' : 'light'); },
    apply: function (value) { applyThemeToDocument(value); },
    // Usato dalle app che avevano già un proprio tema salvato: viene adottato
    // solo la prima volta, senza mai sovrascrivere una scelta già condivisa.
    setDefault: function (value) {
      if (!hasStoredTheme()) themeApi.set(value, true);
      return currentTheme;
    },
    onChange: function (fn) { if (typeof fn === 'function') themeListeners.push(fn); }
  };
  window.MyniAppTheme = themeApi;

  // Applico il tema solo se l'utente ne ha già scelto uno: al primo avvio
  // decide la singola app (che può seguire il tema di sistema) e poi lo salva.
  var savedTheme = readStoredTheme();
  if (savedTheme) {
    currentTheme = savedTheme;
    applyThemeToDocument(currentTheme);
    applyThemeWhenBodyReady();
    if (!hasStoredTheme()) themeApi.set(currentTheme, true);
  }

  window.addEventListener('storage', function (event) {
    if (event.key !== THEME_KEY) return;
    var next = event.newValue === 'light' ? 'light' : 'dark';
    applyThemeToDocument(next);
    emitTheme();
  });

  // Tornando sull'app dopo aver cambiato tema in un'altra scheda.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var stored = readStoredTheme();
    if (stored && stored !== currentTheme) {
      applyThemeToDocument(stored);
      emitTheme();
    }
  });

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
    pill.textContent = '📴 Offline — stai usando la copia salvata';
    document.body.appendChild(pill);
    function sync() {
      pill.classList.toggle('show', navigator.onLine === false);
    }
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  function boot() {
    // Ora il body esiste: riapplico il tema condiviso se era già scelto.
    if (hasStoredTheme()) applyThemeToDocument(currentTheme);
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
