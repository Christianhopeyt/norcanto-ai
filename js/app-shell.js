'use strict';

window.Norcanto = (() => {
  const strings = {
    en: {
      language: 'Language', theme: 'Theme', light: 'Light mode', dark: 'Dark mode',
      online: 'Online', offline: 'Offline - saved analyses remain available',
      update: 'A new version is available.', refresh: 'Refresh',
      local: 'Local', cloud: 'Cloud synced', archived: 'Archived',
      noApiKey: 'No API key required. Documents are processed through Norcanto AI’s secure backend.',
      guestStorage: 'Guest analyses stay in this browser. Sign in to sync analyses across devices.',
      signedStorage: 'Signed-in analyses are securely synced to your account.',
      verifyAi: 'AI summaries, risks, and recommendations may contain errors. Verify important decisions.',
      install: 'Install app', close: 'Close'
    },
    fr: {
      language: 'Langue', theme: 'Thème', light: 'Mode clair', dark: 'Mode sombre',
      online: 'En ligne', offline: 'Hors ligne - vos analyses enregistrées restent accessibles',
      update: 'Une nouvelle version est disponible.', refresh: 'Actualiser',
      local: 'Local', cloud: 'Synchronisé', archived: 'Archivé',
      noApiKey: 'Aucune clé API requise. Les documents sont traités via le serveur sécurisé de Norcanto AI.',
      guestStorage: 'Les analyses invitées restent dans ce navigateur. Connectez-vous pour les synchroniser.',
      signedStorage: 'Les analyses des utilisateurs connectés sont synchronisées avec leur compte.',
      verifyAi: 'Les résumés, risques et recommandations de l’IA peuvent contenir des erreurs. Vérifiez les décisions importantes.',
      install: 'Installer', close: 'Fermer'
    }
  };
  const pagePhrases = {
    'Sign in':'Se connecter','Get Started':'Commencer',
    'Analyze Document':'Analyser un document','Analyze':'Analyser','Dashboard':'Tableau de bord',
    'New Analysis':'Nouvelle analyse','Your Documents':'Vos documents','No documents yet':'Aucun document',
    'Documents analyzed':'Documents analysés','High-risk items':'Risques élevés','Upcoming deadlines':'Échéances proches',
    'Storage status':'État du stockage','Needs attention':'À vérifier','Recent Documents':'Documents récents',
    'Drop your document here':'Déposez votre document ici','or click to browse files':'ou cliquez pour parcourir',
    'Max 20MB. Processed securely by Norcanto AI.':'20 Mo maximum. Traitement sécurisé par Norcanto AI.',
    'Welcome back':'Bon retour','Create your account':'Créez votre compte','Email Address':'Adresse e-mail',
    'Password':'Mot de passe','Forgot password?':'Mot de passe oublié ?','Create Account':'Créer un compte',
    'Executive Summary':'Résumé exécutif','Plain Language Explanation':'Explication simplifiée',
    'Key Insights':'Points clés','Important Dates':'Dates importantes','Risks Detected':'Risques détectés',
    'Obligations':'Obligations','Action Items':'Actions à mener','Ask the Document':'Interroger le document',
    'Notes':'Notes','Rename':'Renommer','Copy report':'Copier le rapport','Analysis':'Analyse','Chat':'Discussion',
    'Product':'Produit','Company':'Entreprise','Blog':'Blog','How It Works':'Fonctionnement',
    'Frequently Asked Questions':'Questions fréquentes','Close':'Fermer','Archive all':'Tout archiver',
    'Grid view':'Vue grille','List view':'Vue liste','All types':'Tous les types','All risks':'Tous les risques',
    'Favorites':'Favoris','Archive':'Archives'
  };
  const reversePhrases = Object.fromEntries(Object.entries(pagePhrases).map(([en,fr]) => [fr,en]));

  const preferredLanguage = () => {
    const saved = localStorage.getItem('norcanto_language');
    if (saved === 'en' || saved === 'fr') return saved;
    return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  };
  const getLanguage = () => document.documentElement.lang || preferredLanguage();
  const t = (key) => strings[getLanguage()]?.[key] || strings.en[key] || key;

  const applyLanguage = (language) => {
    const lang = language === 'fr' ? 'fr' : 'en';
    document.documentElement.lang = lang;
    localStorage.setItem('norcanto_language', lang);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const value = strings[lang][el.dataset.i18n];
      if (value) el.textContent = value;
    });
    const phraseMap = lang === 'fr' ? pagePhrases : reversePhrases;
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (['SCRIPT','STYLE'].includes(node.parentElement?.tagName)) return;
      const raw = node.nodeValue;
      const trimmed = raw.trim();
      if (phraseMap[trimmed]) node.nodeValue = raw.replace(trimmed, phraseMap[trimmed]);
    });
    document.querySelectorAll('[placeholder]').forEach((el) => {
      const value = el.getAttribute('placeholder');
      const placeholderMap = lang === 'fr' ? {
        'Search documents...':'Rechercher des documents...',
        'Ask anything about this document...':'Posez une question sur ce document...',
        'Add private notes about this document...':'Ajoutez des notes privées sur ce document...'
      } : {
        'Rechercher des documents...':'Search documents...',
        'Posez une question sur ce document...':'Ask anything about this document...',
        'Ajoutez des notes privées sur ce document...':'Add private notes about this document...'
      };
      if (placeholderMap[value]) el.setAttribute('placeholder', placeholderMap[value]);
    });
    document.dispatchEvent(new CustomEvent('norcanto:language', { detail: { language: lang } }));
  };

  const applyTheme = (theme) => {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    let themeMeta=document.querySelector('meta[name="theme-color"]');
    if(!themeMeta){themeMeta=document.createElement('meta');themeMeta.name='theme-color';document.head.appendChild(themeMeta);}
    themeMeta.content=next==='light'?'#F6F7F9':'#0A0A0B';
    localStorage.setItem('norcanto_theme', next);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const actionLabel = next === 'dark' ? t('light') : t('dark');
      button.setAttribute('aria-label', actionLabel);
      button.setAttribute('title', actionLabel);
      button.innerHTML = next === 'dark'
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 9 9 0 1 0 20.5 15.5Z"/></svg>';
    });
    document.dispatchEvent(new CustomEvent('norcanto:theme', { detail: { theme: next } }));
  };

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const announce = (message) => {
    let live = document.getElementById('norcanto-live');
    if (!live) {
      live = document.createElement('div');
      live.id = 'norcanto-live';
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = message; });
  };

  const addControls = () => {
    const actions = document.querySelector('.nav-actions');
    if (!actions || actions.querySelector('.shell-controls')) return;
    const controls = document.createElement('div');
    controls.className = 'shell-controls';
    controls.innerHTML = `
      <button type="button" class="shell-control" data-language-toggle aria-label="${t('language')}">${getLanguage().toUpperCase()}</button>
      <button type="button" class="shell-control" data-theme-toggle aria-label="${t('theme')}"></button>`;
    actions.prepend(controls);
    controls.querySelector('[data-language-toggle]').addEventListener('click', (event) => {
      const lang = getLanguage() === 'en' ? 'fr' : 'en';
      applyLanguage(lang);
      event.currentTarget.textContent = lang.toUpperCase();
      applyTheme(document.documentElement.dataset.theme);
    });
    controls.querySelector('[data-theme-toggle]').addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  };

  const addConnectionStatus = () => {
    let status = document.getElementById('connection-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'connection-status';
      status.className = 'connection-status';
      status.setAttribute('role', 'status');
      document.body.appendChild(status);
    }
    const update = () => {
      status.textContent = navigator.onLine ? t('online') : t('offline');
      status.classList.toggle('show', !navigator.onLine);
      status.classList.toggle('offline', !navigator.onLine);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    document.addEventListener('norcanto:language', update);
    update();
  };

  const registerPWA = () => {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('/service-worker.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            announce(t('update'));
            const notice = document.createElement('button');
            notice.className = 'update-notice';
            notice.textContent = `${t('update')} ${t('refresh')}`;
            notice.onclick = () => location.reload();
            document.body.appendChild(notice);
          }
        });
      });
    }).catch(() => {});
  };

  const init = () => {
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/manifest.webmanifest';
      document.head.appendChild(manifest);
    }
    applyLanguage(preferredLanguage());
    addControls();
    applyTheme(localStorage.getItem('norcanto_theme') ||
      (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
    addConnectionStatus();
    registerPWA();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  return { t, getLanguage, applyLanguage, applyTheme, escapeHTML, announce };
})();
