(() => {
  const installGuide = document.querySelector('#install-guide');
  const platform = document.querySelector('#install-platform');
  const iphoneSteps = document.querySelector('#install-iphone');
  const androidSteps = document.querySelector('#install-android');
  const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const installSeenKey = 'fieldnote-install-guide-seen';
  const tourSeenKey = installed ? 'fieldnote-tour-installed-seen' : 'fieldnote-tour-seen';

  function showSteps() {
    iphoneSteps.hidden = platform.value !== 'iphone';
    androidSteps.hidden = platform.value !== 'android';
  }

  function remember(seenKey) {
    try {
      localStorage.setItem(seenKey, '1');
    } catch {
      // La guía funciona aunque el navegador bloquee el almacenamiento.
    }
  }

  function openInstallGuide() {
    installGuide.showModal();
    remember(installSeenKey);
  }

  function openTour() {
    startAppTour();
    remember(tourSeenKey);
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
  document.querySelector('#open-install-guide').addEventListener('click', openInstallGuide);
  document.querySelector('#open-app-guide').addEventListener('click', openTour);

  if (!installed && !hasSeen(installSeenKey)) {
    installGuide.addEventListener('close', () => {
      if (!hasSeen(tourSeenKey)) openTour();
    }, { once: true });
    openInstallGuide();
  } else if (!hasSeen(tourSeenKey)) {
    openTour();
  }
})();
