/* MyniApp — supporto PWA condiviso da tutte le pagine.
   Registra il service worker, gestisce il pulsante "Installa", il tema unico
   di tutte le app e, nelle pagine interne, un tasto per tornare alla home. */

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
    canInstall: function () { return !!installMode(); },
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
    // Il browser dice che l'app è installabile: propongo l'installazione.
    if (installSheet && !installSheet.hidden) return;
    scheduleInstallOffer(1200);
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    notify();
    markInstalled();
  });

  /* ===== PROPOSTA DI INSTALLAZIONE ===== */
  // Il popup compare solo quando l'installazione è davvero possibile:
  // su Chrome/Edge/Android quando arriva "beforeinstallprompt", su iPhone
  // solo in Safari (dove si fa da Condividi → Aggiungi alla schermata Home).
  var INSTALL_DONE_KEY = 'myniapp_install_done';
  var INSTALL_DISMISS_KEY = 'myniapp_install_dismissed_at';
  var INSTALL_COUNT_KEY = 'myniapp_install_dismiss_count';
  var INSTALL_SESSION_KEY = 'myniapp_install_offered';
  var INSTALL_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
  var INSTALL_MAX_DISMISSALS = 3;
  var installSheet = null;
  var installTimer = 0;
  var installRetries = 0;

  function storageGet(key, storage) {
    try { return (storage || window.localStorage).getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value, storage) {
    try { (storage || window.localStorage).setItem(key, value); } catch (e) { /* modalità privata */ }
  }

  function isIosDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // Su iOS solo Safari può aggiungere un sito alla schermata Home.
  function isIosSafari() {
    if (!isIosDevice()) return false;
    return /Safari/.test(navigator.userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS|mercury)/i.test(navigator.userAgent);
  }

  function installMode() {
    if (api.isStandalone()) return null;
    if (deferredPrompt) return 'prompt';
    if (isIosSafari()) return 'ios';
    return null;
  }

  // Se l'app ha già una finestra aperta (trasferimento, modale…) aspetto.
  function appDialogOpen() {
    var nodes = document.querySelectorAll('[class*="modal"], .overlay, [role="dialog"]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.classList.contains('myni-install-overlay')) continue;
      if (node.classList.contains('hidden') || node.hidden) continue;
      var rect = node.getBoundingClientRect();
      if (rect.width > 4 && rect.height > 4) return true;
    }
    return false;
  }

  function shouldOfferInstall(force) {
    if (!installMode()) return false;
    if (storageGet(INSTALL_DONE_KEY)) return false;
    if (force) return true;
    if (storageGet(INSTALL_SESSION_KEY, window.sessionStorage)) return false;
    var dismissals = parseInt(storageGet(INSTALL_COUNT_KEY) || '0', 10) || 0;
    if (dismissals >= INSTALL_MAX_DISMISSALS) return false;
    var dismissedAt = parseInt(storageGet(INSTALL_DISMISS_KEY) || '0', 10) || 0;
    if (dismissedAt && Date.now() - dismissedAt < INSTALL_COOLDOWN_MS) return false;
    return true;
  }

  function scheduleInstallOffer(delay, force) {
    if (installTimer) return;
    if (!shouldOfferInstall(force)) return;
    installTimer = window.setTimeout(function () {
      installTimer = 0;
      showInstallSheet(force);
    }, typeof delay === 'number' ? delay : 2600);
  }

  function injectInstallStyles() {
    if (document.getElementById('myni-install-style')) return;
    var style = document.createElement('style');
    style.id = 'myni-install-style';
    style.textContent = [
      '@keyframes myniFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes myniSheetIn{from{opacity:0;transform:translateY(22px) scale(.97)}to{opacity:1;transform:none}}',
      '.myni-install-overlay{position:fixed;inset:0;z-index:400;display:flex;align-items:flex-end;justify-content:center;',
      'padding:14px;background:rgba(6,6,12,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;animation:myniFadeIn .22s ease}',
      '.myni-install-overlay[hidden]{display:none !important}',
      '@media (min-width:640px){.myni-install-overlay{align-items:center}}',
      '.myni-install-sheet{position:relative;width:100%;max-width:420px;border-radius:24px;padding:24px 22px 18px;',
      'text-align:center;background:#15151f;color:#f5f5fa;border:1px solid rgba(255,255,255,.14);',
      'box-shadow:0 24px 60px rgba(0,0,0,.45);animation:myniSheetIn .32s cubic-bezier(.16,1,.3,1)}',
      '.myni-install-sheet.myni-light{background:#fff;color:#0f172a;border-color:rgba(15,23,42,.1);',
      'box-shadow:0 24px 60px rgba(15,23,42,.2)}',
      '.myni-install-icon{font-size:34px;line-height:1;margin-bottom:10px}',
      '.myni-install-title{font-size:18px;font-weight:700;letter-spacing:-.3px;margin:0 0 6px}',
      '.myni-install-text{font-size:13.5px;line-height:1.5;margin:0;opacity:.78}',
      '.myni-install-steps{display:none;margin:14px 0 0;padding:12px 14px;border-radius:14px;',
      'background:rgba(127,127,127,.16);font-size:12.5px;line-height:1.65;text-align:left}',
      '.myni-install-steps.show{display:block}',
      '.myni-install-actions{display:flex;gap:10px;margin-top:18px}',
      '.myni-install-btn{flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:1px solid rgba(127,127,127,.34);',
      'background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer;',
      'transition:transform .18s ease,background .2s ease,filter .2s ease}',
      '.myni-install-btn:hover{background:rgba(127,127,127,.16)}',
      '.myni-install-btn:active{transform:scale(.97)}',
      '.myni-install-btn:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}',
      '.myni-install-btn.primary{background:linear-gradient(135deg,#a78bfa,#f0abfc);border-color:transparent;',
      'color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.25)}',
      '.myni-install-btn.primary:hover{filter:brightness(1.06);background:linear-gradient(135deg,#a78bfa,#f0abfc)}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildInstallSheet() {
    if (installSheet) return installSheet;
    injectInstallStyles();
    var overlay = document.createElement('div');
    overlay.className = 'myni-install-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="myni-install-sheet" role="dialog" aria-modal="true" aria-labelledby="myniInstallTitle">' +
        '<div class="myni-install-icon" aria-hidden="true">📱</div>' +
        '<h2 class="myni-install-title" id="myniInstallTitle">Installa MyniApp</h2>' +
        '<p class="myni-install-text">Aggiungila alla schermata Home: si apre a tutto schermo e le app funzionano anche senza connessione.</p>' +
        '<div class="myni-install-steps" id="myniInstallSteps"></div>' +
        '<div class="myni-install-actions">' +
          '<button type="button" class="myni-install-btn" data-install="later">Non ora</button>' +
          '<button type="button" class="myni-install-btn primary" data-install="go">Installa</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) dismissInstallSheet();
    });

    overlay.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-install]') : null;
      if (!button) return;
      if (button.getAttribute('data-install') === 'later') { dismissInstallSheet(); return; }
      if (installMode() === 'ios') { dismissInstallSheet(); return; }
      var goBtn = button;
      goBtn.disabled = true;
      api.promptInstall().then(function (accepted) {
        goBtn.disabled = false;
        if (accepted) markInstalled();
        else dismissInstallSheet();
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !installSheet || installSheet.hidden) return;
      dismissInstallSheet();
    });

    installSheet = overlay;
    return overlay;
  }

  function decoratedInstallSheet(dialog) {
    if (!dialog) return;
    dialog.classList.toggle('myni-light', currentTheme === 'light' && !THEME_FIXED);
  }

  function showInstallSheet(force) {
    if (!shouldOfferInstall(force)) return;
    if (appDialogOpen()) {
      // L'utente sta facendo qualcosa: riprovo più tardi senza insistere.
      installRetries++;
      if (installRetries <= 40) {
        installTimer = 0;
        scheduleInstallOffer(5000, force);
      }
      return;
    }
    var overlay = buildInstallSheet();
    var dialog = overlay.querySelector('.myni-install-sheet');
    var steps = overlay.querySelector('#myniInstallSteps');
    var goBtn = overlay.querySelector('[data-install="go"]');
    var mode = installMode();

    decoratedInstallSheet(dialog);
    if (mode === 'ios') {
      steps.innerHTML = '1. Tocca <b>Condividi</b> (□↑) nella barra di Safari.<br>' +
        '2. Scegli <b>Aggiungi alla schermata Home</b>.<br>3. Conferma con <b>Aggiungi</b>.';
      steps.classList.add('show');
      goBtn.textContent = 'Ho capito';
    } else {
      steps.classList.remove('show');
      steps.innerHTML = '';
      goBtn.textContent = 'Installa';
    }

    storageSet(INSTALL_SESSION_KEY, String(Date.now()), window.sessionStorage);
    installRetries = 0;
    overlay.hidden = false;
    window.setTimeout(function () {
      try { goBtn.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
    }, 60);
  }

  function dismissInstallSheet() {
    if (installSheet) installSheet.hidden = true;
    var count = parseInt(storageGet(INSTALL_COUNT_KEY) || '0', 10) || 0;
    storageSet(INSTALL_COUNT_KEY, String(count + 1));
    storageSet(INSTALL_DISMISS_KEY, String(Date.now()));
  }

  function markInstalled() {
    storageSet(INSTALL_DONE_KEY, String(Date.now()));
    if (installSheet) installSheet.hidden = true;
    notify();
  }

  // Cambiando tema mentre il popup è aperto, lo ricolorò subito.
  themeApi.onChange(function () {
    if (!installSheet || installSheet.hidden) return;
    decoratedInstallSheet(installSheet.querySelector('.myni-install-sheet'));
  });

  // Il pulsante "Installa" della home apre sempre il popup, anche se in
  // passato l'utente aveva scelto "Non ora".
  api.showInstallPrompt = function () { scheduleInstallOffer(0, true); };

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
        // Su iPhone non esiste il prompt del browser: mostro le istruzioni.
        if (!deferredPrompt) { showInstallSheet(true); return; }
        api.promptInstall().then(function (accepted) {
          if (!accepted) return;
          button.hidden = true;
        });
      });
      api.onChange(function (available) {
        button.hidden = !available && !isIosSafari();
      });
      button.hidden = !api.canInstall();
    }
    // Propongo l'installazione solo se il browser la consente davvero.
    scheduleInstallOffer(2600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
