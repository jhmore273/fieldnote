(() => {
  const installGuide = document.querySelector('#install-guide');
  const appGuide = document.querySelector('#app-guide');
  const platform = document.querySelector('#install-platform');
  const iphoneSteps = document.querySelector('#install-iphone');
  const androidSteps = document.querySelector('#install-android');
  const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const installSeenKey = 'fieldnote-install-guide-seen';
  const appSeenKey = installed ? 'fieldnote-app-guide-installed-seen' : 'fieldnote-app-guide-seen';

  function showSteps() {
    iphoneSteps.hidden = platform.value !== 'iphone';
    androidSteps.hidden = platform.value !== 'android';
  }

  function openGuide(guide, seenKey) {
    guide.showModal();
    try {
      localStorage.setItem(seenKey, '1');
    } catch {
      // La guía funciona aunque el navegador bloquee el almacenamiento.
    }
  }

  function hasSeen(seenKey) {
    try {
      return localStorage.getItem(seenKey) === '1';
    } catch {
      return false;
    }
  }

  platform.value = /Android/i.test(navigator.userAgent) ? 'android' : 'iphone';
  showSteps();
  platform.addEventListener('change', showSteps);
  document.querySelector('#open-install-guide').addEventListener('click', () => openGuide(installGuide, installSeenKey));
  document.querySelector('#open-app-guide').addEventListener('click', () => openGuide(appGuide, appSeenKey));

  if (!installed && !hasSeen(installSeenKey)) {
    installGuide.addEventListener('close', () => {
      if (!hasSeen(appSeenKey)) openGuide(appGuide, appSeenKey);
    }, { once: true });
    openGuide(installGuide, installSeenKey);
  } else if (!hasSeen(appSeenKey)) {
    openGuide(appGuide, appSeenKey);
  }
})();
