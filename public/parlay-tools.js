"use strict";

// El avance en vivo es provisional: nunca presenta una ventaja actual como victoria.
function summarizeParlay(parlay, evaluateLeg = evaluate) {
  const counts = { won: 0, favorable: 0, lost: 0, push: 0, live: 0, pending: 0, unknown: 0 };
  const states = parlay.legs.map(leg => {
    const result = evaluateLeg(leg);
    let state;
    if (result.stale) state = "unknown";
    else if (result.earlyReached) state = result.state === "done" ? "won" : "favorable";
    else if (result.state === "pending") state = "pending";
    else if (result.value === null || !Number.isFinite(result.value)) state = "unknown";
    else if (result.state === "done") state = result.tone === "good" ? "won" : result.tone === "bad" ? "lost" : "push";
    else {
      const hit = ["spread", "moneyline"].includes(leg.market)
        ? result.value > 0
        : leg.side === "under" ? result.value < leg.line : result.value > leg.line;
      state = hit ? "favorable" : "live";
    }
    counts[state]++;
    return state;
  });
  return { counts, states, favorable: counts.won + counts.favorable, total: states.length };
}

// El resultado del parlay solo se confirma tras finalizar todos sus partidos.
function completedParlayResult(parlay, evaluateLeg = evaluate) {
  if (!parlay.legs.length || !parlay.legs.every(leg => evaluateLeg(leg).state === "done"))
    return null;
  const { counts, total } = summarizeParlay(parlay, evaluateLeg);
  if (counts.lost)
    return { outcome: "lost", label: "PERDIDO", note: "Al menos una leg terminó perdida." };
  if (counts.unknown)
    return { outcome: "unknown", label: "POR VERIFICAR", note: "Faltan estadísticas actualizadas para confirmar el resultado." };
  if (counts.push === total)
    return { outcome: "push", label: "ANULADO / PUSH", note: "Todas las legs terminaron empatadas con su línea; confirma la devolución con tu casa." };
  return {
    outcome: "won",
    label: "GANADO",
    note: counts.push
      ? "Ganado con legs en push; confirma el pago ajustado con tu casa."
      : "Todas las legs se cumplieron según los datos y reglas registrados.",
  };
}

function parlaySummaryMarkup(parlay) {
  const { counts, states, favorable, total } = summarizeParlay(parlay);
  const detail = [
    counts.lost ? `${counts.lost} perdidas*` : "",
    counts.push ? `${counts.push} push` : "",
    counts.live ? `${counts.live} aún en juego` : "",
    counts.pending ? `${counts.pending} pendientes` : "",
    counts.unknown ? `${counts.unknown} sin datos actualizados` : "",
  ].filter(Boolean).join(" · ");
  return `<span class="card-progress"><span class="card-progress-heading"><strong>${favorable} de ${total} a favor</strong><small>Provisional</small></span><span class="card-progress-track" aria-hidden="true">${states.map(state => `<span class="summary-${state}"></span>`).join("")}</span>${detail ? `<span class="card-progress-detail">${esc(detail)}</span>` : ""}</span>`;
}

// Las pruebas de anticipo pertenecen al mismo partido, equipo y regla.
function preserveLegEvidence(original, next) {
  const same = original && original.event === next.event && original.market === next.market &&
    original.teamId === next.teamId && original.playerId === next.playerId &&
    original.player === next.player && original.side === next.side && original.line === next.line &&
    (original.earlyPayout17 !== false) === (next.earlyPayout17 !== false);
  return same ? { ...original, ...next } : next;
}
