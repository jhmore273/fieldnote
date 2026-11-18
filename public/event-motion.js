"use strict";

const eventMotion = { scope: null, filter: null, filterAnimation: null, stepAnimations: [] };
const eventEase = "cubic-bezier(.2,.7,.3,1)";
function motionEnabled() { return !fieldnoteMotionPreference.matches && !document.hidden; }
function motionVisible(el) {
  if (!el.getClientRects().length) return false;
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < innerHeight;
}
function captureRenderMotion() {
  const cards = new Map([...document.querySelectorAll("#cards > .card")].map(el => [el.dataset.parlayId,
    { el, rect: el.getBoundingClientRect(), visible: motionVisible(el),
      signature: el.querySelector(".parlayname")?.textContent + [...el.querySelectorAll(".leg")].map(leg => leg.dataset.legKey).join("|") }]));
  const legs = new Map([...document.querySelectorAll("#cards .leg[data-leg-key]")].map(el => [el.dataset.legKey,
    { value: el.dataset.value, state: el.dataset.state, el, visible: motionVisible(el),
      color: motionEnabled() && motionVisible(el) ? getComputedStyle(el.querySelector(".progress-fill")).backgroundColor : null }]));
  return { cards, legs, scope: eventMotion.scope };
}

// Comparación pura: las consultas con el mismo dato no generan movimiento.
function planEventMotion(before, after) {
  const filtered = before.scope !== null && before.scope !== after.scope;
  const data = [], states = [];
  if (!filtered) after.legs.forEach((next, key) => {
    const old = before.legs.get(key);
    if (!old) return;
    if (old.value !== next.value && old.value !== "" && next.value !== "") data.push(key);
    if (old.state !== next.state) states.push(key);
  });
  return { filtered, data, states,
    added: [...after.cards.keys()].filter(key => !before.cards.has(key)),
    removed: [...before.cards.keys()].filter(key => !after.cards.has(key)) };
}

function animateRenderedEvents(before) {
  const after = captureRenderMotion();
  after.scope = `${demoMode ? "demo" : "personal"}:${filter}`;
  eventMotion.scope = after.scope;
  syncFilterHighlight();
  if (!motionEnabled()) return;
  const changes = planEventMotion(before, after);
  if (changes.filtered) {
    document.getElementById("cards").animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160, easing: eventEase });
    return;
  }
  changes.added.forEach((id, index) => {
    const card = after.cards.get(id);
    if (card.visible) card.el.animate([{ opacity: 0, transform: "translateY(9px)" }, { opacity: 1, transform: "none" }],
      { duration: 250, delay: Math.min(index, 3) * 25, easing: eventEase, fill: "backwards" });
  });
  changes.removed.forEach(id => {
    const card = before.cards.get(id);
    if (!card.visible) return;
    const ghost = card.el;
    ghost.inert = true;
    ghost.setAttribute("aria-hidden", "true");
    ghost.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
    Object.assign(ghost.style, { position: "fixed", left: card.rect.left + "px", top: card.rect.top + "px",
      width: card.rect.width + "px", height: card.rect.height + "px", pointerEvents: "none", zIndex: "4", overflow: "hidden" });
    document.body.append(ghost);
    const animation = ghost.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-5px)" }], { duration: 120, easing: eventEase });
    animation.onfinish = () => ghost.remove();
    animation.oncancel = () => ghost.remove();
  });
  after.cards.forEach((card, id) => {
    const previous = before.cards.get(id);
    if (!previous || !card.visible) return;
    if (changes.added.length || changes.removed.length) {
      const dy = previous.rect.top - card.rect.top, dx = previous.rect.left - card.rect.left;
      if (previous.visible && (Math.abs(dx) > 1 || Math.abs(dy) > 1))
        card.el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 180, easing: eventEase });
    }
    if (previous.signature !== card.signature)
      card.el.querySelector(".cardtop").animate([{ opacity: .6 }, { opacity: 1 }], { duration: 250, easing: eventEase });
  });
  changes.data.forEach(key => {
    const current = after.legs.get(key), previous = before.legs.get(key);
    if (!current.visible) return;
    current.el.classList.add("motion-data-changed");
    const number = current.el.querySelector(".leg-reading > span:first-child strong");
    const oldNumber = previous.el.querySelector(".leg-reading > span:first-child strong");
    if (number && oldNumber && number.textContent !== oldNumber.textContent) {
      const ghost = document.createElement("span");
      ghost.className = "motion-old-number";
      ghost.textContent = oldNumber.textContent;
      ghost.setAttribute("aria-hidden", "true");
      number.parentElement.append(ghost);
      const fade = ghost.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-5px)" }], { duration: 180, easing: eventEase });
      fade.onfinish = fade.oncancel = () => ghost.remove();
      number.animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: eventEase });
    }
    current.el.querySelector(".leg-reading")?.animate([{ backgroundColor: "#f1ac781c" }, { backgroundColor: "transparent" }], { duration: 500 });
  });
  changes.states.forEach(key => {
    const current = after.legs.get(key), previous = before.legs.get(key);
    if (!current.visible) return;
    current.el.classList.add("motion-state-changed");
    current.el.querySelector(".pill")?.animate([{ opacity: .3, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: eventEase });
    if (previous.color) {
      const fill = current.el.querySelector(".progress-fill");
      fill.animate([{ backgroundColor: previous.color }, { backgroundColor: getComputedStyle(fill).backgroundColor }], { duration: 420 });
    }
  });
}

function syncFilterHighlight(animate = true) {
  const root = document.querySelector(".filters"), active = root.querySelector("button.active");
  if (!active) return;
  let indicator = root.querySelector(".filter-highlight");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "filter-highlight";
    indicator.setAttribute("aria-hidden", "true");
    root.append(indicator);
  }
  const target = { x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight };
  const previous = eventMotion.filter;
  if (previous && Object.keys(target).every(key => target[key] === previous[key])) return;
  const currentRect = indicator.getBoundingClientRect(), rootRect = root.getBoundingClientRect();
  eventMotion.filterAnimation?.cancel();
  Object.assign(indicator.style, { left: target.x + "px", top: target.y + "px", width: target.width + "px", height: target.height + "px" });
  if (previous && animate && motionEnabled()) {
    eventMotion.filterAnimation = indicator.animate([
      { transform: `translateX(${currentRect.left - rootRect.left - root.clientLeft - target.x}px) scaleX(${currentRect.width / target.width})` },
      { transform: "none" }], { duration: 200, easing: eventEase });
  }
  eventMotion.filter = target;
}
new ResizeObserver(() => syncFilterHighlight(false)).observe(document.querySelector(".filters"));

function animateEditorStep(review, previouslyReview) {
  if (review === previouslyReview || !document.getElementById("editor").open || !motionEnabled()) return;
  eventMotion.stepAnimations.forEach(animation => animation.cancel());
  const panel = document.getElementById(review ? "review-view" : "compose-view");
  eventMotion.stepAnimations = [panel.animate([
    { opacity: .15, transform: `translateX(${review ? 10 : -10}px)` }, { opacity: 1, transform: "none" }],
    { duration: 200, easing: eventEase })];
}
function animateDraftEdit(el) {
  if (!motionEnabled()) return;
  el.animate([{ opacity: .5, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: eventEase });
  el.querySelector(".market")?.focus({ preventScroll: true });
}
