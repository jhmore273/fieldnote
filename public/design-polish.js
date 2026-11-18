"use strict";

function legVisualState(leg, result) {
  if (result.stale) return "unknown";
  if (result.earlyReached) return result.state === "done" ? "won" : "favorable";
  if (result.state === "pending") return "pending";
  if (result.value === null || !Number.isFinite(result.value)) return "unknown";
  if (result.state === "done") return result.tone === "good" ? "won" : result.tone === "bad" ? "lost" : "push";
  const favorable = ["spread", "moneyline"].includes(leg.market)
    ? result.value > 0
    : leg.side === "under" ? result.value < leg.line : result.value > leg.line;
  return favorable ? "favorable" : "live";
}

function legReading(leg, result) {
  if (leg.market === "moneyline") return `<div class="leg-reading"><span class="leg-selection"><small>Tu selección</small><strong>${esc(leg.teamAbbreviation || leg.player)} · ${leg.earlyPayout17 !== false ? "Money Line · anticipo +17" : "Ganar el partido"}</strong></span></div>`;
  let value = result.value, label = "Actual", target;
  if (leg.market === "spread") {
    value = result.scoreDifference;
    label = "Diferencia actual";
    target = `${leg.teamAbbreviation || leg.player} ${signedNumber(leg.line)}`;
  } else if (leg.market === "moneyline") {
    const early = leg.earlyPayout17 !== false;
    value = early ? result.progressValue : result.value;
    label = early ? "Máxima ventaja" : "Ventaja actual";
    target = early ? "Anticipo +17" : "Ganar el partido";
  } else target = YES_MARKETS.has(leg.market) ? "Al menos 1 touchdown" : `${leg.side === "under" ? "Menos" : "Más"} de ${leg.line}`;
  const display = value === null || value === undefined ? "—"
    : ["spread", "moneyline"].includes(leg.market) ? signedNumber(value) : String(value);
  return `<div class="leg-reading"><span><small>${label}</small><strong>${esc(display)}</strong></span><span class="leg-selection"><small>Tu selección</small><strong>${esc(target)}</strong></span></div>`;
}

function marketOptionLabel(key, fallback) {
  return ({ moneyline: "Ganador (Money Line)", firstTouchdown: "Primer touchdown",
    anytimeTouchdown: "Anotador de touchdown", teamTotalPoints: "Total de un equipo",
    totalPoints: "Total del partido", totalFieldGoals: "Goles de campo del partido" })[key] || fallback;
}

let connectionStatus = { kind: "loading", updatedAt: null, empty: false };
function relativeUpdate(date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  return seconds < 60 ? `hace ${seconds} s` : `hace ${Math.floor(seconds / 60)} min`;
}
function renderConnectionStatus() {
  const row = document.querySelector(".connection"), label = document.getElementById("connection");
  const state = demoMode ? "demo" : busy ? "loading" : connectionStatus.kind;
  row.dataset.state = state;
  if (state === "demo") label.textContent = "Ejemplo · Sin seguimiento en vivo";
  else if (state === "loading") label.textContent = "Actualizando datos de ESPN…";
  else if (state === "partial" || state === "error") label.textContent = state === "partial"
    ? "Actualización incompleta · Reintentar"
    : "Sin conexión con ESPN · Reintentar";
  else label.textContent = `${connectionStatus.empty ? "ESPN disponible" : "Actualizado"} ${connectionStatus.updatedAt ? relativeUpdate(connectionStatus.updatedAt) : ""}`.trim();
  label.title = connectionStatus.updatedAt ? "Última recepción: " + connectionStatus.updatedAt.toLocaleTimeString("es-MX") : "";
  const button = document.getElementById("refresh");
  button.setAttribute("aria-label", state === "partial" || state === "error" ? "Reintentar actualización" : "Actualizar datos");
  button.querySelector("span:last-child").textContent = state === "partial" || state === "error" ? "Reintentar" : "Actualizar";
}

function draftSummaryText(el) {
  const value = selector => el.querySelector(selector)?.value || "";
  const market = value(".market");
  const subject = TEAM_MARKETS.has(market) ? value(".spread-team-abbr") || "Equipo por elegir"
    : GAME_MARKETS.has(market) ? "Total del partido" : value(".playerinput") || "Jugador por elegir";
  const selection = market === "spread" ? `Spread ${signedNumber(Number(value(".spread-range")))}`
    : market === "moneyline" ? "Ganador"
    : YES_MARKETS.has(market) ? "Touchdown"
    : `${value(".side") === "under" ? "Menos" : "Más"} de ${value(".line") || "…"}`;
  return `${value(".gamename") || "Partido por elegir"} · ${subject} · ${selection}`;
}
function collapseExistingDrafts() {
  document.querySelectorAll("#drafts > .draft").forEach(el => {
    el.querySelector(".draft-summary").textContent = draftSummaryText(el);
    el.classList.add("is-collapsed");
    el.querySelector(".draft-expand").setAttribute("aria-expanded", "false");
  });
}
function installDraftSummary(el) {
  const summary = document.createElement("p");
  summary.className = "draft-summary";
  el.append(summary);
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "draft-expand";
  edit.textContent = "Editar selección";
  edit.setAttribute("aria-expanded", "true");
  el.querySelector(".drafttop").insertBefore(edit, el.querySelector(".remove"));
  edit.onclick = () => {
    const collapsed = el.classList.toggle("is-collapsed");
    edit.setAttribute("aria-expanded", String(!collapsed));
    summary.textContent = draftSummaryText(el);
    if (!collapsed) animateDraftEdit(el);
  };
  const update = () => { summary.textContent = draftSummaryText(el); };
  el.addEventListener("input", update);
  el.addEventListener("change", update);
  update();
}
