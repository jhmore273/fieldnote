(() => {
  const guide = document.querySelector('#install-guide');
  const platform = document.querySelector('#install-platform');
  const iphoneSteps = document.querySelector('#install-iphone');
  const androidSteps = document.querySelector('#install-android');
  const seenKey = 'fieldnote-install-guide-seen';

  function showSteps() {
    iphoneSteps.hidden = platform.value !== 'iphone';
    androidSteps.hidden = platform.value !== 'android';
  }

  function openGuide() {
    guide.showModal();
    try {
      localStorage.setItem(seenKey, '1');
    } catch {
      // La guía funciona aunque el navegador bloquee el almacenamiento.
    }
  }

  platform.value = /Android/i.test(navigator.userAgent) ? 'android' : 'iphone';
  showSteps();
  platform.addEventListener('change', showSteps);
  document.querySelector('#open-install-guide').addEventListener('click', openGuide);

  let seen = false;
  try {
    seen = localStorage.getItem(seenKey) === '1';
  } catch {
    // Si no se puede recordar la visita, se muestran los pasos.
  }

  const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!seen && !installed) openGuide();
})();
