// Evaluador compartido con el tablero. Regenerar con node scripts/build-notification-evaluator.cjs
export function evaluateSelection(data,leg){
const demoMode=false,demoSummaries=new Map(),cache=new Map([[leg.event,data]]),failures=new Set(),NFL_TEAM_CODES={};
const markets = {
  moneyline: ["Money Line · pago anticipado +17", "game"],
  spread: ["Spread del partido", "game"],
  totalPoints: ["Puntos totales del partido", "game"],
  teamTotalPoints: ["Puntos totales de un equipo", "game"],
  passingYards: ["Yardas de pase", "passing"],
  passingTouchdowns: ["Pases de touchdown", "passing"],
  completions: ["Pases completos", "passing"],
  passingInterceptions: ["Intercepciones lanzadas", "passing"],
  rushingYards: ["Yardas por tierra", "rushing"],
  rushingAttempts: ["Intentos de carrera", "rushing"],
  receivingYards: ["Yardas de recepción", "receiving"],
  receptions: ["Cantidad de recepciones", "receiving"],
  anytimeTouchdown: ["Touchdown en cualquier momento", "anytime"],
  firstTouchdown: ["Primer anotador de touchdown", "first"],
  totalFieldGoals: ["Goles de campo totales del partido", "game"],
};
const legacyMarkets = {
  rushingTouchdowns: ["TD de carrera", "rushing"],
  receivingTouchdowns: ["TD de recepción", "receiving"],
};
function evaluate(l) {
  if (l.market === "spread") return evaluateSpread(l);
  if (l.market === "moneyline") return evaluateMoneyline(l);
  if (l.market === "firstTouchdown") return evaluateFirstTouchdown(l);
  const d = demoMode ? demoSummaries.get(l.event) : cache.get(l.event),
    c = d?.header?.competitions?.[0],
    type = c?.status?.type,
    state = type?.completed ? "done" : type?.state === "in" ? "live" : "pending";
  let value = playerStatValue(d, l);
  if (l.market === "anytimeTouchdown") value = anytimeValue(d, l);
  if (l.market === "totalFieldGoals") value = totalFieldGoalsValue(d);
  if (l.market === "totalPoints" || l.market === "teamTotalPoints") value = gamePointsValue(d, l);
  let label = state === "pending" ? "Pendiente" : "Sin dato",
    tone = "",
    message = "Esperando estadísticas";
  if (value !== null) {
    const hit = l.side === "over" ? value > l.line : value < l.line,
      push = value === l.line;
    if (state === "done") {
      label = push ? "Empate / push" : hit ? "Ganada*" : "Perdida*";
      tone = hit ? "good" : push ? "" : "bad";
      message = "Resultado provisional";
    } else if (l.side === "over" && hit) {
      label = "Línea superada";
      tone = "good";
      message = "Provisional hasta el final";
    } else if (l.side === "under" && value >= l.line) {
      label = "Límite alcanzado";
      message = "Pendiente del resultado final";
    } else {
      label = state === "live" ? "En juego" : "Pendiente";
      message =
        l.side === "over"
          ? `Faltan ${Math.max(0, Math.floor(l.line) + 1 - value)}`
          : `Margen: ${Math.max(0, l.line - value)}`;
    }
  }
  const teams = c?.competitors?.map((t) => `${t.team.abbreviation} ${t.score ?? ""}`).join(" · ");
  return {
    value,
    state,
    label,
    tone,
    message,
    game: teams || l.game,
    detail: c?.status?.type?.shortDetail || "Por comenzar",
    stale: failures.has(l.event),
  };
}
function scoreNumber(raw) {
  if (raw && typeof raw === "object") raw = raw.value ?? raw.displayValue;
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function contextForLeg(leg) {
  const data = demoMode ? demoSummaries.get(leg.event) : cache.get(leg.event),
    competition = data?.header?.competitions?.[0],
    type = competition?.status?.type;
  const state = type?.completed ? "done" : type?.state === "in" ? "live" : "pending",
    competitors = competition?.competitors || [];
  const selected = competitors.filter((t) => String(t.team?.id) === leg.teamId),
    rivals = competitors.filter((t) => String(t.team?.id) !== leg.teamId);
  return {
    data,
    competition,
    type,
    state,
    competitors,
    selected: selected.length === 1 ? selected[0] : null,
    rival: competitors.length === 2 && rivals.length === 1 ? rivals[0] : null,
  };
}
function playerStatValue(data, leg) {
  const rows = [];
  for (const t of data?.boxscore?.players || [])
    for (const g of t.statistics || [])
      if (g.name === (markets[leg.market] || legacyMarkets[leg.market])?.[1])
        for (const a of g.athletes || [])
          if (
            leg.playerId
              ? String(a.athlete.id) === leg.playerId
              : norm(a.athlete.displayName) === norm(leg.player)
          )
            rows.push({ a, g });
  if (rows.length !== 1) return null;
  const { a, g } = rows[0],
    key = leg.market === "passingInterceptions" ? "interceptions" : leg.market;
  let index = (g.keys || []).indexOf(key),
    raw = a.stats?.[index];
  if (leg.market === "completions" && index < 0) {
    index = (g.keys || []).indexOf("completions/passingAttempts");
    raw = a.stats?.[index];
    if (typeof raw !== "string" || !/^\d+\s*\/\s*\d+$/.test(raw.trim())) return null;
    const [completed, attempts] = raw.split("/").map(Number);
    return completed <= attempts ? completed : null;
  }
  if (index < 0 || raw == null || String(raw).trim() === "" || raw === "--") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
function gamePointsValue(data, leg) {
  const c = data?.header?.competitions?.[0],
    type = c?.status?.type;
  if (!type || (!type.completed && type.state !== "in") || c.competitors?.length !== 2) return null;
  if (leg.market === "teamTotalPoints") {
    const team = c.competitors.filter((t) => String(t.team?.id) === leg.teamId);
    return team.length === 1 ? scoreNumber(team[0].score) : null;
  }
  const scores = c.competitors.map((t) => scoreNumber(t.score));
  return scores.every((n) => n !== null) ? scores[0] + scores[1] : null;
}
function touchdownPlays(data) {
  if (!Array.isArray(data?.scoringPlays)) return null;
  const clock = (p) => {
    if (Number.isFinite(p.clock?.value)) return p.clock.value;
    const match = String(p.clock?.displayValue || "").match(/^(\d+):(\d+)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  };
  return data.scoringPlays
    .filter(
      (p) =>
        (p.scoringType?.name === "touchdown" ||
          p.scoringType?.abbreviation === "TD" ||
          p.type?.abbreviation === "TD") &&
        !/\b(no play|overturned|reversed)\b/i.test(p.text || ""),
    )
    .slice()
    .sort((a, b) => (a.period?.number || 0) - (b.period?.number || 0) || clock(b) - clock(a));
}
function scorerId(data, play) {
  const direct =
    play.scorer?.id ||
    play.scoringAthlete?.id ||
    play.participants?.find((p) => p.type === "scorer" || p.role === "scorer")?.athlete?.id;
  if (direct) return String(direct);
  const text = norm(play.text || ""),
    candidates = new Set();
  for (const team of data?.boxscore?.players || []) {
    if (play.team?.id != null && String(team.team?.id) !== String(play.team.id)) continue;
    for (const g of team.statistics || [])
      for (const row of g.athletes || []) {
        const a = row.athlete || {},
          names = [
            a.displayName,
            a.shortName,
            a.firstName && a.lastName ? a.firstName + " " + a.lastName : null,
          ].filter(Boolean);
        if (names.some((name) => text.startsWith(norm(name)))) candidates.add(String(a.id));
      }
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}
function evaluateFirstTouchdown(leg) {
  const ctx = contextForLeg(leg),
    plays = touchdownPlays(ctx.data);
  let value = null,
    label = ctx.state === "pending" ? "Pendiente" : "Sin dato",
    tone = "",
    message = "Esperando el primer touchdown";
  if (plays) {
    if (plays.length) {
      const id = scorerId(ctx.data, plays[0]);
      if (id) {
        value = String(leg.playerId) === id ? 1 : 0;
        label = value ? "Primer TD*" : "No fue el primero*";
        tone = value ? "good" : "bad";
        message = "Anotador identificado por ESPN";
      } else message = "ESPN aún no identifica al anotador con certeza";
    } else if (ctx.state !== "pending") {
      value = 0;
      label = ctx.state === "done" ? "Sin touchdown" : "Sin touchdown aún";
      tone = ctx.state === "done" ? "bad" : "";
      message =
        ctx.state === "done" ? "Confirma liquidación con tu casa" : "Esperando el primer touchdown";
    }
  }
  return {
    value,
    state: ctx.state,
    label,
    tone,
    message,
    game: leg.game,
    detail: ctx.type?.shortDetail || "Por comenzar",
    stale: failures.has(leg.event),
  };
}
function moneylineEvidence(leg, data) {
  const c = data?.header?.competitions?.[0],
    type = c?.status?.type,
    teams = c?.competitors || [],
    team = teams.find((t) => String(t.team?.id) === leg.teamId),
    rival = teams.find((t) => String(t.team?.id) !== leg.teamId);
  const stored =
    Number.isInteger(leg.moneylineMaxLead) && leg.moneylineMaxLead >= 0
      ? leg.moneylineMaxLead
      : null;
  let max = stored,
    evidence = leg.moneylineEvidencePlay || null;
  if (teams.length !== 2 || !team || !rival)
    return {
      maxLead: max,
      reached: leg.earlyPayout17 !== false && leg.moneylineEarlyReached === true,
      evidence,
    };
  if (type?.completed || type?.state === "in") {
    const own = scoreNumber(team.score),
      other = scoreNumber(rival.score);
    if (own !== null && other !== null) max = Math.max(max ?? 0, 0, own - other);
    if (team.homeAway === "home" || team.homeAway === "away")
      for (const play of data.scoringPlays || []) {
        const home = scoreNumber(play.homeScore),
          away = scoreNumber(play.awayScore);
        if (
          home === null ||
          away === null ||
          /\b(no play|overturned|reversed)\b/i.test(play.text || "")
        )
          continue;
        const lead = team.homeAway === "home" ? home - away : away - home;
        if (lead > (max ?? -1)) {
          max = Math.max(0, lead);
          evidence = String(play.id || "scoring-play");
        }
      }
  }
  return {
    maxLead: max,
    reached:
      leg.earlyPayout17 !== false &&
      (leg.moneylineEarlyReached === true || (max !== null && max >= 17)),
    evidence,
  };
}
function evaluateMoneyline(leg) {
  const ctx = contextForLeg(leg),
    proof = moneylineEvidence(leg, ctx.data),
    own = ctx.selected ? scoreNumber(ctx.selected.score) : null,
    other = ctx.rival ? scoreNumber(ctx.rival.score) : null;
  const value = ctx.state !== "pending" && own !== null && other !== null ? own - other : null,
    early = leg.earlyPayout17 !== false;
  let label = ctx.state === "pending" ? "Pendiente" : "Sin dato",
    tone = "",
    message = "Esperando marcador",
    satisfied = false;
  if (proof.reached) {
    label = "Condición +17 cumplida*";
    tone = "good";
    message = "Confirma el abono con tu casa";
    satisfied = true;
  } else if (value !== null) {
    if (ctx.state === "done") {
      label = value === 0 ? "Empate / push" : value > 0 ? "Ganada*" : "Perdida*";
      tone = value > 0 ? "good" : value < 0 ? "bad" : "";
      message = "Resultado provisional";
      satisfied = value > 0;
    } else {
      label = value > 0 ? "En ventaja" : value < 0 ? "En desventaja" : "Empate actual";
      message = early ? "Anticipo: alcanzar +17 de ventaja" : "Esperando resultado final";
    }
  }
  return {
    value,
    state: ctx.state,
    label,
    tone,
    message,
    game: leg.game,
    detail: ctx.type?.shortDetail || "Por comenzar",
    stale: failures.has(leg.event),
    maxLead: proof.maxLead,
    earlyReached: proof.reached,
    satisfied,
    progressValue: early ? proof.maxLead : value,
  };
}
function evaluateSpread(leg) {
  const data = demoMode ? demoSummaries.get(leg.event) : cache.get(leg.event),
    competition = data?.header?.competitions?.[0],
    type = competition?.status?.type;
  const state = type?.completed ? "done" : type?.state === "in" ? "live" : "pending";
  const competitors = competition?.competitors || [],
    selected = competitors.filter((t) => String(t.team?.id) === leg.teamId),
    rival = competitors.filter((t) => String(t.team?.id) !== leg.teamId);
  function points(raw) {
    if (raw && typeof raw === "object") raw = raw.value ?? raw.displayValue;
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  const own = selected.length === 1 ? points(selected[0].score) : null,
    other = rival.length === 1 ? points(rival[0].score) : null;
  const value =
    state !== "pending" &&
    competitors.length === 2 &&
    selected.length === 1 &&
    rival.length === 1 &&
    own !== null &&
    other !== null
      ? own + leg.line - other
      : null;
  let label = state === "pending" ? "Pendiente" : "Sin dato",
    tone = "",
    message = "Esperando marcador";
  if (value !== null) {
    if (state === "done") {
      label = value === 0 ? "Empate / push" : value > 0 ? "Ganada*" : "Perdida*";
      tone = value > 0 ? "good" : value < 0 ? "bad" : "";
      message = "Resultado provisional";
    } else if (value > 0) {
      label = "Cubriendo";
      tone = "good";
      message = `Cubre por ${value} pts`;
    } else if (value === 0) {
      label = "Empate actual";
      message = "Push si termina así";
    } else {
      label = "Sin cubrir";
      tone = "bad";
      message = `Faltan ${Math.floor(Math.abs(value)) + 1} pts para cubrir`;
    }
  }
  return {
    value,
    // Diferencia real del marcador, sin sumar el hándicap de la apuesta.
    scoreDifference: value === null ? null : own - other,
    state,
    label,
    tone,
    message,
    game: competitors.map((t) => `${teamCode(t.team)} ${t.score ?? ""}`).join(" · ") || leg.game,
    detail: type?.shortDetail || "Por comenzar",
    stale: failures.has(leg.event),
  };
}
function totalFieldGoalsValue(data) {
  const competition = data?.header?.competitions?.[0];
  const status = competition?.status?.type;
  if (!status || (!status.completed && status.state !== "in")) return null;
  const teams = competition.competitors || [];
  if (teams.length !== 2) return null;
  const made = (raw) => {
    if (typeof raw !== "string" || !/^\d+\s*\/\s*\d+$/.test(raw.trim())) return null;
    const [goals, attempts] = raw.split("/").map(Number);
    return goals <= attempts ? goals : null;
  };
  const values = teams.map((team) => {
    const box = data.boxscore?.players?.find((t) => String(t.team?.id) === String(team.team?.id));
    const kicking = box?.statistics?.find((g) => g.name === "kicking");
    if (!kicking) return null;
    const index = (kicking.keys || []).indexOf("fieldGoalsMade/fieldGoalAttempts");
    if (index < 0) return null;
    const total = made(kicking.totals?.[index]);
    if (total !== null) return total;
    if (!kicking.athletes?.length) return null;
    const players = kicking.athletes.map((a) => made(a.stats?.[index]));
    return players.every((n) => n !== null) ? players.reduce((a, b) => a + b, 0) : null;
  });
  if (values.every((n) => n !== null)) return values[0] + values[1];
  // A falta del desglose completo, ESPN también publica las jugadas de anotación.
  if (Array.isArray(data.scoringPlays)) {
    return data.scoringPlays.filter(
      (play) =>
        String(play.type?.id) === "59" ||
        (play.scoringType?.name === "field-goal" &&
          /field goal (good|made)/i.test(play.type?.text || "")),
    ).length;
  }
  return null;
}
function anytimeValue(d, l) {
  let participated = false,
    total = 0,
    seen = new Set();
  const keys = [
    "rushingTouchdowns",
    "receivingTouchdowns",
    "kickReturnTouchdowns",
    "puntReturnTouchdowns",
    "interceptionTouchdowns",
    "defensiveTouchdowns",
    "fumbleReturnTouchdowns",
  ];
  for (const t of d?.boxscore?.players || [])
    for (const g of t.statistics || [])
      for (const a of g.athletes || []) {
        if (
          !(l.playerId
            ? String(a.athlete.id) === l.playerId
            : norm(a.athlete.displayName) === norm(l.player))
        )
          continue;
        participated = true;
        for (const key of keys) {
          const i = (g.keys || []).indexOf(key),
            raw = a.stats?.[i];
          if (i < 0 || seen.has(key) || raw == null || raw === "" || raw === "--") continue;
          const n = Number(raw);
          if (Number.isFinite(n)) {
            total += n;
            seen.add(key);
          }
        }
      }
  if (participated) {
    const defensive = {};
    for (const t of d?.boxscore?.players || [])
      for (const g of t.statistics || [])
        for (const a of g.athletes || [])
          if (
            l.playerId
              ? String(a.athlete.id) === l.playerId
              : norm(a.athlete.displayName) === norm(l.player)
          )
            for (const key of [
              "defensiveTouchdowns",
              "interceptionTouchdowns",
              "fumbleReturnTouchdowns",
            ]) {
              const i = (g.keys || []).indexOf(key);
              if (i >= 0 && a.stats?.[i] != null && Number.isFinite(Number(a.stats[i])))
                defensive[key] = Number(a.stats[i]);
            }
    const components =
        (defensive.interceptionTouchdowns || 0) + (defensive.fumbleReturnTouchdowns || 0),
      aggregate = defensive.defensiveTouchdowns || 0;
    total -= components + aggregate;
    total += Math.max(components, aggregate);
  }
  return participated ? total : null;
}
function norm(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function teamCode(team) {
  const abbreviation = String(team?.abbreviation || "").toUpperCase();
  const aliases = {
    JAC: "JAX",
    WAS: "WSH",
    LA: "LAR",
    GNB: "GB",
    KAN: "KC",
    NWE: "NE",
    NOR: "NO",
    SFO: "SF",
    TAM: "TB",
  };
  return aliases[abbreviation] || abbreviation || NFL_TEAM_CODES[String(team?.id)] || "";
}
return evaluate(leg);
}
