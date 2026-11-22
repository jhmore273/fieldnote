"use strict";

// Se guarda un instante absoluto; al dibujarlo se usa la zona actual del dispositivo.
// Una fecha sin hora ni zona no se interpreta como un horario confirmado.
function kickoffDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))
    return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function gameKickoff(game, savedKickoff) {
  const competition = game?.competitions?.[0] || game;
  for (const value of [competition?.date, game?.date, savedKickoff]) {
    const date = kickoffDate(value);
    if (date) return date.toISOString();
  }
  return null;
}

function formatLocalKickoff(value) {
  const date = kickoffDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function gameTimeLabel(game, savedKickoff) {
  const competition = game?.competitions?.[0] || game,
    status = game?.status?.type || competition?.status?.type,
    name = status?.name || "";
  if (/POSTPONED/.test(name)) return "Pospuesto";
  if (/CANCEL/.test(name)) return "Cancelado";
  if (/SUSPENDED/.test(name)) return "Suspendido";
  if (/DELAYED/.test(name)) return "Retrasado";
  // El reloj de juego no es una hora del día y conserva su valor deportivo.
  if (status?.completed || status?.state === "post") return status.shortDetail || "Final";
  if (status?.state === "in") return status.shortDetail || "En juego";
  if (/\bTBD\b/i.test(status?.shortDetail || "")) return "Hora por confirmar";
  return formatLocalKickoff(gameKickoff(game, savedKickoff)) || "Hora por confirmar";
}

function selectedGameKickoff(draft, eventId) {
  const game = draft.games?.find((event) => String(event.id) === String(eventId)),
    original = draft.originalLeg,
    saved = original && String(original.event) === String(eventId) ? original.kickoff : undefined;
  return gameKickoff(game, saved);
}
