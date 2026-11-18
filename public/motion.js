"use strict";

// Mantiene la pelota en el centro de la pantalla, incluso con la barra lateral.
const fieldnoteHeading = document.querySelector(".board-heading");
function centerFieldnoteFootball() {
  const headingLeft = fieldnoteHeading.getBoundingClientRect().left;
  fieldnoteHeading.style.setProperty("--football-center", (document.documentElement.clientWidth / 2 - headingLeft) + "px");
}
new ResizeObserver(centerFieldnoteFootball).observe(fieldnoteHeading);
window.addEventListener("resize", centerFieldnoteFootball);
centerFieldnoteFootball();

const fieldnoteMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const fieldnoteBodyAnimations = new WeakMap();
const fieldnoteCardAnimations = new WeakMap();

// Mide la distribución una vez y anima solo transformaciones, sin recalcular
// la altura de todas las legs en cada fotograma.
function changeParlayVisibility(body, hidden) {
  if (body.hidden === hidden) return;
  const cards = [...document.querySelectorAll("#cards > .card")];
  const positions = cards.map(card => card.getBoundingClientRect());
  cards.forEach(card => fieldnoteCardAnimations.get(card)?.cancel());
  body.hidden = hidden;
  const nextPositions = cards.map(card => card.getBoundingClientRect());
  if (fieldnoteMotionPreference.matches) return;
  cards.forEach((card, index) => {
    const dx = positions[index].left - nextPositions[index].left;
    const dy = positions[index].top - nextPositions[index].top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const animation = card.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: 180, easing: "cubic-bezier(.2, .7, .3, 1)" },
    );
    fieldnoteCardAnimations.set(card, animation);
    animation.onfinish = () => fieldnoteCardAnimations.delete(card);
  });
}

// Las pulsaciones consecutivas interrumpen la transición desde su estado actual.
function animateParlayBody(body, open) {
  const previous = fieldnoteBodyAnimations.get(body);
  const style = body.hidden ? null : getComputedStyle(body);
  const opacity = style ? style.opacity : "0";
  const transform = previous && style ? style.transform : open ? "translateY(-5px)" : "none";
  if (previous) {
    previous.onfinish = null;
    previous.cancel();
    fieldnoteBodyAnimations.delete(body);
  }
  // El contenido que está cerrándose deja de recibir foco inmediatamente.
  body.inert = !open;
  if (fieldnoteMotionPreference.matches || typeof body.animate !== "function") {
    body.hidden = !open;
    body.style.removeProperty("will-change");
    return;
  }
  if (open) changeParlayVisibility(body, false);
  body.style.willChange = "opacity, transform";
  const animation = body.animate(
    [{ opacity, transform },
      { opacity: open ? 1 : 0, transform: open ? "none" : "translateY(-4px)" }],
    { duration: open ? 180 : 120, easing: "cubic-bezier(.2, .7, .3, 1)", fill: "both" },
  );
  fieldnoteBodyAnimations.set(body, animation);
  animation.onfinish = () => {
    if (fieldnoteBodyAnimations.get(body) !== animation) return;
    if (!open) changeParlayVisibility(body, true);
    animation.cancel();
    body.style.removeProperty("will-change");
    fieldnoteBodyAnimations.delete(body);
  };
}

