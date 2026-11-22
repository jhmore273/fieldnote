const startAppTour = (() => {
  const tour = document.querySelector('#app-tour');
  const settings = document.querySelector('#backup-dialog');
  const highlight = tour.querySelector('.tour-highlight');
  const panel = tour.querySelector('.tour-panel');
  const heading = tour.querySelector('#tour-heading');
  const back = tour.querySelector('#tour-back');
  const next = tour.querySelector('#tour-next');
  const steps = [
    {
      target: '#new',
      title: 'Crea un parlay',
      description: 'En Nuevo parlay, ponle un nombre y elige el partido y el tipo de apuesta de cada selección. Agrega las que necesites, toca Revisar parlay y guarda.',
    },
    {
      target: '#legs-demo-1 .prop-progress',
      demo: true,
      title: 'Sigue cada selección',
      description: 'Esta selección es de un parlay de ejemplo. Abre cualquier tarjeta para ver el marcador, el avance respecto a tu línea y el estado de cada selección.',
    },
    {
      target: '.filters',
      demo: true,
      title: 'Encuentra tus parlays',
      description: 'Todos reúne los parlays pendientes y en juego. Elige En juego para seguir los partidos activos o Terminados para revisar los resultados de tus parlays finalizados.',
    },
    {
      target: '.push-actions button:not([hidden])',
      settings: true,
      title: 'Activa avisos',
      description: 'En Configuración → Notificaciones puedes activar los avisos de tus selecciones. En iPhone, abre Fieldnote desde el icono de la pantalla de inicio.',
    },
  ];
  let index = 0;
  let restoreDemo;
  let origin;

  function position(reveal = false) {
    if (!tour.open) return;
    const target = document.querySelector(steps[index].target);
    if (!target) return;
    const { width, height } = tour.getBoundingClientRect();
    const margin = 12;
    const padding = 5;
    let rect = target.getBoundingClientRect();
    panel.style.maxHeight = '';
    if (reveal) {
      const desiredSpace = panel.offsetHeight + 2 * margin + padding;
      if (rect.top < desiredSpace && height - rect.bottom < desiredSpace) {
        const placeBelow = rect.top <= height - rect.bottom;
        const shift = placeBelow ? rect.bottom + desiredSpace - height : rect.top - desiredSpace;
        const scroller = steps[index].settings ? settings : window;
        scroller.scrollBy({ top: shift, behavior: 'instant' });
        rect = target.getBoundingClientRect();
      }
    }
    const left = Math.max(2, rect.left - padding);
    const right = Math.min(width - 2, rect.right + padding);
    const top = Math.max(2, rect.top - padding);
    const bottom = Math.min(height - 2, rect.bottom + padding);
    highlight.style.left = left + 'px';
    highlight.style.top = top + 'px';
    highlight.style.width = Math.max(0, right - left) + 'px';
    highlight.style.height = Math.max(0, bottom - top) + 'px';

    const panelWidth = panel.offsetWidth;
    const spaceAbove = top - 2 * margin;
    const spaceBelow = height - bottom - 2 * margin;
    const placeBelow = spaceBelow >= panel.offsetHeight || spaceBelow >= spaceAbove;
    const available = placeBelow ? spaceBelow : spaceAbove;
    panel.style.maxHeight = Math.max(96, available) + 'px';
    const panelHeight = panel.offsetHeight;
    const preferredTop = placeBelow ? bottom + margin : top - margin - panelHeight;
    panel.style.top = Math.max(margin, Math.min(preferredTop, height - panelHeight - margin)) + 'px';
    const centered = (left + right - panelWidth) / 2;
    panel.style.left = Math.max(margin, Math.min(centered, width - panelWidth - margin)) + 'px';
  }

  function closeSettings() {
    settings.close();
    settings.classList.remove('tour-settings');
  }

  function show(indexToShow) {
    if (tour.open) tour.close();
    index = indexToShow;
    const step = steps[index];
    if (step.demo) {
      restoreDemo ??= previewDemo();
    } else if (restoreDemo) {
      restoreDemo();
      restoreDemo = undefined;
    }
    if (step.settings) {
      settings.classList.add('tour-settings');
      settings.showModal();
    } else if (settings.open) {
      closeSettings();
    }

    tour.querySelector('#tour-progress').textContent = `Paso ${index + 1} de ${steps.length}`;
    heading.textContent = step.title;
    tour.querySelector('#tour-description').textContent = step.description;
    back.hidden = index === 0;
    next.textContent = index === steps.length - 1 ? 'Terminar' : 'Siguiente';
    document.querySelector(step.target)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    tour.showModal();
    heading.focus({ preventScroll: true });
    position(true);
    requestAnimationFrame(() => position(true));
  }

  function finish() {
    tour.close();
    restoreDemo?.();
    restoreDemo = undefined;
    if (origin.settingsOpen) {
      settings.showModal();
      settings.scrollTop = origin.settingsScroll;
      settings.classList.remove('tour-settings');
    } else if (settings.open) {
      closeSettings();
    }
    window.scrollTo({ top: origin.scrollY, left: origin.scrollX, behavior: 'instant' });
    origin.focus?.focus({ preventScroll: true });
  }

  back.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => {
    if (index === steps.length - 1) finish();
    else show(index + 1);
  });
  tour.querySelector('#tour-close').addEventListener('click', finish);
  tour.addEventListener('cancel', event => {
    event.preventDefault();
    finish();
  });
  window.addEventListener('resize', () => position(true));
  window.addEventListener('scroll', event => {
    if (event.target !== panel) position();
  }, { passive: true, capture: true });

  return () => {
    origin = {
      settingsOpen: settings.open,
      settingsScroll: settings.scrollTop,
      focus: document.activeElement,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    show(0);
  };
})();
