"use strict";

/*
 * FIELDNOTE — Seguimiento personal de parlays NFL.
 *
 * Flujo general:
 * 1. Leer apuestas desde localStorage y dibujar las tarjetas.
 * 2. Consultar ESPN para obtener partidos, jugadores y estadísticas.
 * 3. Evaluar cada leg y actualizar su avance cada 45 segundos.
 *
 * Las apuestas se quedan en este navegador. No se envían a ESPN.
 * ESPN solo recibe consultas de partidos, equipos y jugadores.
 */

const $ = (s) => document.querySelector(s),
  API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/",
  KEY = "fieldnote-v1";
const legacyMarkets = {
  rushingTouchdowns: ["TD de carrera", "rushing"],
  receivingTouchdowns: ["TD de recepción", "receiving"],
};
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
const TEAM_MARKETS = new Set(["spread", "moneyline", "teamTotalPoints"]);
const GAME_MARKETS = new Set([...TEAM_MARKETS, "totalPoints", "totalFieldGoals"]);
const YES_MARKETS = new Set(["anytimeTouchdown", "firstTouchdown"]);
let parlays = [],
  filter = "all",
  cache = new Map(),
  draftSeq = 0,
  busy = false,
  last = null,
  failures = new Set();
// La vista de ejemplo no se guarda ni consulta partidos ficticios en ESPN.
let demoMode = false;
const demoParlays = [
  {
    id: "demo-1",
    name: "Domingo de NFL",
    legs: [
      {
        event: "900000001",
        game: "KC @ BUF",
        date: localDate(),
        player: "Patrick Mahomes",
        playerId: "d1",
        market: "passingYards",
        side: "over",
        line: 249.5,
      },
      {
        event: "900000001",
        game: "KC @ BUF",
        date: localDate(),
        player: "Travis Kelce",
        playerId: "d2",
        market: "receivingYards",
        side: "over",
        line: 59.5,
      },
      {
        event: "900000001",
        game: "KC @ BUF",
        date: localDate(),
        player: "Total del partido",
        playerId: null,
        market: "totalFieldGoals",
        side: "over",
        line: 3.5,
      },
    ],
  },
  {
    id: "demo-2",
    name: "Para el siguiente juego",
    legs: [
      {
        event: "900000002",
        game: "PHI @ NYG",
        date: localDate(),
        player: "Saquon Barkley",
        playerId: "d3",
        market: "rushingYards",
        side: "over",
        line: 79.5,
      },
      {
        event: "900000002",
        game: "PHI @ NYG",
        date: localDate(),
        player: "A. J. Brown",
        playerId: "d4",
        market: "anytimeTouchdown",
        side: "over",
        line: 0.5,
      },
    ],
  },
];
demoParlays[0].legs.push({
  event: "900000001",
  game: "KC @ BUF",
  date: localDate(),
  player: "KC",
  playerId: null,
  market: "spread",
  side: "over",
  line: 7.5,
  teamId: "12",
  teamAbbreviation: "KC",
  teamName: "Kansas City Chiefs",
});
const demoSummaries = new Map([
  [
    "900000001",
    {
      header: {
        competitions: [
          {
            competitors: [
              {
                team: {
                  id: "2",
                  abbreviation: "BUF",
                  logo: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
                },
                score: "21",
              },
              {
                team: {
                  id: "12",
                  abbreviation: "KC",
                  logo: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
                },
                score: "17",
              },
            ],
            status: { type: { state: "in", completed: false, shortDetail: "Q3 · 06:42" } },
          },
        ],
      },
      boxscore: {
        players: [
          {
            team: { id: "12" },
            statistics: [
              {
                name: "passing",
                keys: ["passingYards"],
                athletes: [{ athlete: { id: "d1" }, stats: ["218"] }],
              },
              {
                name: "receiving",
                keys: ["receivingYards"],
                athletes: [{ athlete: { id: "d2" }, stats: ["67"] }],
              },
              { name: "kicking", keys: ["fieldGoalsMade/fieldGoalAttempts"], totals: ["1/1"] },
            ],
          },
          {
            team: { id: "2" },
            statistics: [
              { name: "kicking", keys: ["fieldGoalsMade/fieldGoalAttempts"], totals: ["2/2"] },
            ],
          },
        ],
      },
    },
  ],
  [
    "900000002",
    {
      header: {
        competitions: [
          {
            competitors: [
              {
                team: {
                  id: "19",
                  abbreviation: "NYG",
                  logo: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png",
                },
              },
              {
                team: {
                  id: "21",
                  abbreviation: "PHI",
                  logo: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png",
                },
              },
            ],
            status: { type: { state: "pre", completed: false, shortDetail: "Por comenzar" } },
          },
        ],
      },
    },
  ],
]);
demoParlays[0].legs.push({
  event: "900000001",
  game: "KC @ BUF",
  date: localDate(),
  player: "BUF",
  playerId: null,
  market: "moneyline",
  side: "over",
  line: 0,
  teamId: "2",
  teamAbbreviation: "BUF",
  teamName: "Buffalo Bills",
  earlyPayout17: true,
});
const demoGame = demoSummaries.get("900000001");
demoGame.header.competitions[0].competitors.forEach(
  (t) => (t.homeAway = t.team.id === "2" ? "home" : "away"),
);
demoGame.scoringPlays = [
  {
    id: "example-17",
    homeScore: 17,
    awayScore: 0,
    period: { number: 2 },
    clock: { displayValue: "10:00" },
  },
];
try {
  parlays = validate(JSON.parse(localStorage.getItem(KEY) || "[]"));
} catch (e) {
  toast("No se pudieron leer las apuestas guardadas. Importa tu respaldo.");
}
// Escapa texto externo antes de insertarlo en plantillas HTML.
function esc(x) {
  return String(x ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
// Muestra un aviso temporal en la parte inferior de la pantalla.
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  setTimeout(() => ($("#toast").style.display = "none"), 4500);
}
// Comprueba la estructura y los límites de las apuestas leídas o importadas.
function validate(a) {
  if (!Array.isArray(a) || a.length > 200) throw Error("Formato no válido");
  for (const p of a) {
    if (
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      p.name.length > 80 ||
      !Array.isArray(p.legs) ||
      !p.legs.length ||
      p.legs.length > 30
    )
      throw Error("Parlay no válido");
    for (const l of p.legs) {
      if (
        !/^\d{6,12}$/.test(l.event) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(l.date) ||
        (!["totalFieldGoals", "totalPoints"].includes(l.market) &&
          (typeof l.player !== "string" || !l.player.trim())) ||
        !(markets[l.market] || legacyMarkets[l.market]) ||
        !["over", "under"].includes(l.side) ||
        !Number.isFinite(l.line) ||
        (l.market === "spread"
          ? Math.abs(l.line) > 50 || !Number.isInteger(l.line * 2)
          : l.line < 0 || l.line > 10000)
      )
        throw Error("Leg no válida");
      if (
        TEAM_MARKETS.has(l.market) &&
        (typeof l.teamId !== "string" ||
          !/^\d{1,4}$/.test(l.teamId) ||
          typeof l.teamAbbreviation !== "string" ||
          !l.teamAbbreviation.trim() ||
          l.teamAbbreviation.length > 12 ||
          (["spread", "moneyline"].includes(l.market) && l.side !== "over"))
      )
        throw Error("Equipo o selección no válido");
      if (
        l.market === "moneyline" &&
        (l.line !== 0 ||
          (l.earlyPayout17 !== undefined && typeof l.earlyPayout17 !== "boolean") ||
          (l.moneylineMaxLead !== undefined &&
            (!Number.isInteger(l.moneylineMaxLead) ||
              l.moneylineMaxLead < 0 ||
              l.moneylineMaxLead > 1000)) ||
          (l.moneylineEarlyReached !== undefined && typeof l.moneylineEarlyReached !== "boolean") ||
          (l.moneylineEarlyReached === true && !(l.moneylineMaxLead >= 17)))
      )
        throw Error("Money Line no válido");
      if (
        l.market === "firstTouchdown" &&
        (l.line !== 0.5 ||
          l.side !== "over" ||
          typeof l.playerId !== "string" ||
          !/^\d{1,12}$/.test(l.playerId))
      )
        throw Error("Primer touchdown no válido");
    }
  }
  return a;
}
// Guarda las apuestas en este navegador; avisa si falla el almacenamiento.
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(parlays));
    window.dispatchEvent(new Event('fieldnote-saved'));
    return true;
  } catch (e) {
    toast("No se pudo guardar. Exporta un respaldo antes de cerrar.");
    return false;
  }
}
// Consulta JSON de ESPN y cancela la petición después de 15 segundos.
async function get(path) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(/^https:\/\//.test(path) ? path : API + path, {
      signal: controller.signal,
    });
    if (!r.ok) throw Error("ESPN respondió HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
// Normaliza nombres para buscar sin depender de acentos o mayúsculas.
function norm(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
// Reúne las legs del mismo partido conservando el orden de aparición.
function groupLegs(legs) {
  const groups = new Map();
  for (const l of legs) {
    if (!groups.has(l.event)) groups.set(l.event, []);
    groups.get(l.event).push(l);
  }
  return [...groups.values()];
}
// Suma touchdowns anotados por el jugador; excluye los pases de touchdown.
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
const teamRequests = new Map();
// Reutiliza consultas de plantilla y orden de titulares para evitar descargas repetidas.
function teamInfo(id) {
  if (!teamRequests.has(id))
    teamRequests.set(
      id,
      Promise.allSettled([
        get("teams/" + encodeURIComponent(id) + "/roster"),
        get("teams/" + encodeURIComponent(id) + "/depthcharts"),
      ]).then((r) => {
        if (r.every((x) => x.status === "rejected")) {
          teamRequests.delete(id);
          throw Error("Sin plantilla");
        }
        return {
          roster: r[0].status === "fulfilled" ? r[0].value : {},
          depth: r[1].status === "fulfilled" ? r[1].value : {},
        };
      }),
    );
  return teamRequests.get(id);
}
// Para un touchdown en cualquier momento fija la línea en más de 0.5.
function updateMarket(el) {
  const market = el.querySelector(".market").value,
    team = TEAM_MARKETS.has(market),
    spread = market === "spread",
    ml = market === "moneyline",
    binary = YES_MARKETS.has(market),
    game = GAME_MARKETS.has(market);
  el.dataset.market = market;
  const player = el.querySelector(".playerinput");
  player.closest("label").hidden = game;
  player.required = !game;
  el.querySelector(".otherplayers").hidden = game;
  el.querySelector(".playersearchlabel").hidden = game || !el.expandedPlayers;
  el.querySelector(".linelabel").hidden = spread || ml || binary;
  el.querySelector(".line").disabled = spread || ml;
  el.querySelector(".line").required = !spread && !ml;
  el.querySelector(".side").closest("label").hidden = spread || ml || binary;
  el.querySelector(".spread-config").hidden = !team;
  for (const selector of [".spread-control-head", ".spread-slider-row", ".spread-range-labels"])
    el.querySelector(selector).hidden = !spread;
  el.querySelector(".spread-range").disabled = !spread;
  el.querySelector(".early-payout-option").hidden = !ml;
  el.querySelector(".early-payout-checkbox").disabled = !ml;
  el.querySelector(".spread-team-picker").setAttribute(
    "aria-label",
    spread ? "Equipo para el spread" : ml ? "Equipo ganador" : "Equipo de la apuesta",
  );
  el.querySelector(".team-market-heading").textContent = spread
    ? "Equipo del spread"
    : ml
      ? "Equipo ganador"
      : "Equipo de la apuesta";
  if (binary) {
    el.querySelector(".line").value = ".5";
    el.querySelector(".side").value = "over";
  }
  if (spread || ml) el.querySelector(".side").value = "over";
  if (team) updateSpreadInfo(el);
}
function signedNumber(value) {
  return value > 0 ? "+" + value : String(value);
}
function updateSpreadInfo(el) {
  const market = el.querySelector(".market").value,
    input = el.querySelector(".spread-range"),
    value = Number(input.value),
    team = el.querySelector(".spread-team-abbr").value;
  el.querySelector(".spread-output").textContent = (team ? team + " " : "") + signedNumber(value);
  input.setAttribute("aria-valuetext", (team || "Equipo") + " " + signedNumber(value));
  input.style.setProperty(
    "--spread-percent",
    ((value - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100 + "%",
  );
  el.querySelector(".spread-hint").textContent = !team
    ? "Selecciona uno de los equipos del partido."
    : market === "moneyline"
      ? el.querySelector(".early-payout-checkbox").checked
        ? "Se marca cumplida si gana o alcanza +17 de ventaja. Confirma elegibilidad y abono con tu casa."
        : `${team} debe ganar el partido; sin regla de anticipo.`
      : market === "teamTotalPoints"
        ? `Se cuentan únicamente los puntos anotados por ${team}.`
        : value > 0
          ? `Se suman ${value} puntos al marcador de ${team}.`
          : value < 0
            ? `Se restan ${Math.abs(value)} puntos al marcador de ${team}.`
            : `Sin ventaja: ${team} debe terminar por delante.`;
}
function populateSpreadTeams(el, provided) {
  const id = el.querySelector(".event").value;
  if (el.spreadEvent !== id) {
    el.spreadEvent = id;
    el.querySelector(".spread-team-id").value = "";
    el.querySelector(".spread-team-abbr").value = "";
    el.querySelector(".spread-team-name").value = "";
  }
  const game = (el.games || []).find((e) => String(e.id) === id);
  const competitors =
    provided ||
    game?.competitions?.[0]?.competitors ||
    cache.get(id)?.header?.competitions?.[0]?.competitors ||
    [];
  const teams = competitors
    .filter((c) => c.team?.id != null)
    .slice()
    .reverse();
  el.spreadTeams = teams;
  const picker = el.querySelector(".spread-team-picker"),
    selected = el.querySelector(".spread-team-id").value;
  if (teams.length !== 2) {
    picker.textContent = id ? "Cargando equipos del partido…" : "Primero selecciona un partido.";
    updateSpreadInfo(el);
    return;
  }
  if (selected && !teams.some((t) => String(t.team.id) === selected)) {
    el.querySelector(".spread-team-id").value = "";
    el.querySelector(".spread-team-abbr").value = "";
    el.querySelector(".spread-team-name").value = "";
  }
  picker.innerHTML = teams
    .map(
      (t, index) =>
        `<button type="button" class="spread-team-button" data-team-index="${index}" aria-pressed="${String(t.team.id) === el.querySelector(".spread-team-id").value}">${teamMarkup({ team: t.team }, "teamlogo")}</button>`,
    )
    .join("");
  picker.querySelectorAll("button").forEach(
    (button) =>
      (button.onclick = () => {
        const team = teams[Number(button.dataset.teamIndex)].team;
        el.querySelector(".spread-team-id").value = String(team.id);
        el.querySelector(".spread-team-abbr").value = teamCode(team) || team.abbreviation;
        el.querySelector(".spread-team-name").value =
          team.displayName || teamCode(team) || team.abbreviation;
        picker
          .querySelectorAll("button")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        updateSpreadInfo(el);
      }),
  );
  updateSpreadInfo(el);
}
const seasonRequests = new Map();
// Extrae los totales de temporada y distingue touchdowns anotados de pases de TD.
function seasonNumbers(data) {
  const stats = {};
  for (const category of data.splits?.categories || [])
    for (const stat of category.stats || []) {
      if (typeof stat.value === "number" && Number.isFinite(stat.value))
        stats[stat.name] = stat.value;
    }
  const scoring = data.splits?.categories?.find((c) => c.name === "scoring");
  const scored = scoring?.stats?.find((s) => s.name === "totalScoringTouchdowns");
  if (scored && Number.isFinite(scored.value)) stats.anytimeTouchdown = scored.value;
  else if (["rushingTouchdowns", "receivingTouchdowns", "returnTouchdowns"].some((k) => k in stats))
    stats.anytimeTouchdown =
      (stats.rushingTouchdowns || 0) +
      (stats.receivingTouchdowns || 0) +
      (stats.returnTouchdowns || 0) +
      (stats.offensiveFumblesTouchdowns || 0);
  const passing = data.splits?.categories?.find((c) => c.name === "passing");
  const interceptions = passing?.stats?.find((s) => s.name === "interceptions");
  if (interceptions && Number.isFinite(interceptions.value))
    stats.passingInterceptions = interceptions.value;
  return stats;
}
// Obtiene y almacena temporalmente las estadísticas de un jugador en esta sesión.
function seasonStats(team, id, year, type) {
  const key = [team, id, year, type].join("/");
  if (!seasonRequests.has(key))
    seasonRequests.set(
      key,
      get(
        `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/${type}/teams/${team}/athletes/${id}/statistics/0`,
      )
        .then(seasonNumbers)
        .catch((e) => {
          seasonRequests.delete(key);
          return null;
        }),
    );
  return seasonRequests.get(key);
}
// Carga estadísticas para los candidatos ofensivos, con hasta seis consultas simultáneas.
async function attachSeasonStats(players, competitors, season) {
  const jobs = players.filter((p) =>
    ["QB", "RB", "FB", "WR", "TE"].includes(p.position?.abbreviation),
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, jobs.length) }, async () => {
      while (next < jobs.length) {
        const a = jobs[next++],
          team = competitors.find((t) => t.team.abbreviation === a.team);
        if (!team || !season?.year) continue;
        const stats = await seasonStats(team.team.id, a.id, season.year, season.type || 2);
        a.seasonStats = stats;
        a.statsYear = season.year;
      }
    }),
  );
}
// Devuelve el valor del mercado seleccionado o null si no existe un dato válido.
function performance(a, market) {
  const value = a.seasonStats?.[market === "firstTouchdown" ? "anytimeTouchdown" : market];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
// Selecciona hasta cinco líderes por equipo según el total de temporada del mercado.
function relevantPlayers(players, market, limit = 5) {
  const result = new Map();
  for (const a of players) {
    const score = performance(a, market);
    if (
      score === null ||
      (market === "passingInterceptions"
        ? score < 0 || (score === 0 && a.position?.abbreviation !== "QB")
        : score <= 0)
    )
      continue;
    const team = a.team || "Equipo";
    if (!result.has(team)) result.set(team, []);
    result.get(team).push(a);
  }
  for (const [team, list] of result) {
    const secondary =
      market === "anytimeTouchdown"
        ? (a) => (a.seasonStats?.rushingYards || 0) + (a.seasonStats?.receivingYards || 0)
        : (a) =>
            a.seasonStats?.[
              market === "passingYards" || market === "passingTouchdowns"
                ? "passingAttempts"
                : market === "rushingYards"
                  ? "rushingAttempts"
                  : "receptions"
            ] || 0;
    list.sort(
      (a, b) =>
        performance(b, market) - performance(a, market) ||
        secondary(b) - secondary(a) ||
        String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
    );
    result.set(team, list.slice(0, limit));
  }
  return result;
}
// Dibuja el selector por equipo: líderes o plantilla completa con búsqueda por nombre.
function populatePlayers(el) {
  const market = el.querySelector(".market").value;
  if (TEAM_MARKETS.has(market)) {
    updateMarket(el);
    populateSpreadTeams(el);
    el.querySelector(".draftstatus").textContent =
      market === "moneyline"
        ? "Marcador en vivo. El anticipo +17 es una condición de seguimiento, no confirmación de abono."
        : market === "spread"
          ? "Marcador completo, incluida prórroga. Resultado provisional durante el juego."
          : "Solo cuentan los puntos del equipo elegido.";
    return;
  }
  if (["totalFieldGoals", "totalPoints"].includes(market)) {
    updateMarket(el);
    el.querySelector(".draftstatus").textContent =
      market === "totalPoints"
        ? "Suma de los puntos de ambos equipos, incluida la prórroga."
        : "Goles de campo anotados por ambos equipos; no cuenta fallos ni puntos extra.";
    return;
  }
  const select = el.querySelector(".playerinput"),
    old = select.selectedOptions[0]?.dataset.id,
    expanded = !!el.expandedPlayers,
    query = norm(el.querySelector(".playersearch").value || "");
  let groups;
  if (expanded) {
    groups = new Map();
    for (const a of el.players || []) {
      if (query && !norm(a.displayName).includes(query)) continue;
      const team = a.team || "Equipo";
      if (!groups.has(team)) groups.set(team, []);
      groups.get(team).push(a);
    }
    for (const list of groups.values())
      list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } else groups = relevantPlayers(el.players || [], el.querySelector(".market").value);
  select.innerHTML =
    '<option value="">Selecciona un jugador</option>' +
    [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([team, list]) =>
          `<optgroup label="${esc(team)} — ${expanded ? "plantilla completa" : "líderes de temporada"}">${list.map((a) => `<option value="${esc(a.displayName)}" data-id="${esc(a.id)}" ${String(a.id) === old ? "selected" : ""}>${esc(a.displayName)} · ${esc(a.position?.abbreviation || "")}${expanded ? "" : ` · ${performance(a, el.querySelector(".market").value)} ${el.querySelector(".market").value.includes("Yards") ? "yd" : el.querySelector(".market").value === "receptions" ? "REC" : "TD"}`}</option>`).join("")}</optgroup>`,
      )
      .join("");
  select.disabled = !groups.size;
  if (!groups.size)
    select.innerHTML = `<option value="">${query ? "No hay coincidencias" : "Sin jugadores disponibles"}</option>`;
  const button = el.querySelector(".otherplayers");
  button.disabled = !(el.players || []).length;
  button.setAttribute("aria-expanded", String(expanded));
  button.textContent = expanded
    ? "− Volver a los 5 principales por equipo"
    : "＋ Buscar otro jugador de la plantilla";
  el.querySelector(".playersearchlabel").hidden = !expanded;
  el.querySelector(".draftstatus").textContent = groups.size
    ? expanded
      ? "Plantilla completa de ESPN. Puedes buscar por nombre."
      : "Top 5 por equipo según el total de esta estadística en la temporada " +
        (el.rankingYear || "") +
        " de ESPN. Empates: volumen de juego."
    : query
      ? "Prueba con otro nombre."
      : el.players?.length
        ? "Sin rendimiento de temporada disponible para este mercado. Usa «Buscar otro jugador» para ver la plantilla."
        : "Selecciona un partido con plantilla disponible.";
  restoreSavedPlayer(el);
}
// Convierte una fecha a año-mes-día usando la zona horaria del navegador.
function dateOf(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Calendario anual: saltar directamente a días con partidos, sin selector de fecha.
const calendarYears = new Map();
async function yearCalendar(year) {
  const old = calendarYears.get(year);
  if (old && Date.now() - old.loadedAt < 300000) return old.promise;
  const entry = { loadedAt: Date.now(), promise: null };
  entry.promise = get(`scoreboard?dates=${year}&limit=1000`)
    .then((data) => {
      if (!Array.isArray(data.events)) throw Error("Calendario no disponible");
      return data.events.filter((event) => event.date && !Number.isNaN(Date.parse(event.date)));
    })
    .catch((error) => {
      if (calendarYears.get(year) === entry) calendarYears.delete(year);
      throw error;
    });
  calendarYears.set(year, entry);
  return entry.promise;
}
function shiftGameDate(date, offset) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + offset);
  return dateOf(d);
}
async function nextGameDay(reference, includeReference = false) {
  const minimum = includeReference ? reference : shiftGameDate(reference, 1);
  const firstYear = Number(minimum.slice(0, 4));
  for (let year = firstYear; year <= firstYear + 1; year++) {
    const events = await yearCalendar(year);
    const days = [...new Set(events.map((event) => dateOf(event.date)))]
      .filter((date) => date >= minimum)
      .sort();
    if (days.length) {
      const date = days[0];
      return { date, events: events.filter((event) => dateOf(event.date) === date) };
    }
  }
  return null;
}
function displayGameDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T12:00:00"));
}
function dateNavigationBusy(el, busy) {
  el.querySelector(".next-game-date").disabled = busy;
  el.querySelector(".current-game-date").disabled = busy;
  el.querySelector(".gamepicker").setAttribute("aria-busy", String(busy));
  el.querySelectorAll(".gameoption").forEach((button) => (button.disabled = busy));
}
async function navigateGameDate(el, mode = "next") {
  if (el.calendarBusy) return;
  el.calendarBusy = true;
  const version = (el.calendarVersion || 0) + 1;
  el.calendarVersion = version;
  const current = el.querySelector(".date").value;
  const fromCurrent = mode === "current" || !current;
  const notice = el.querySelector(".calendar-status");
  dateNavigationBusy(el, true);
  notice.textContent = fromCurrent
    ? "Buscando la fecha con partidos más cercana…"
    : "Buscando la siguiente fecha con partidos…";
  try {
    const result = await nextGameDay(fromCurrent ? localDate() : current, fromCurrent);
    if (!el.isConnected || el.calendarVersion !== version) return;
    if (!result) {
      notice.textContent = "ESPN todavía no tiene otra fecha de partidos publicada.";
      if (!current) {
        el.querySelector(".games-date-value").textContent = "Sin fechas publicadas";
        el.querySelector(".gamepicker").textContent =
          "No hay partidos próximos publicados por ESPN.";
      }
      return;
    }
    if (fromCurrent) el.baseGameDate = result.date;
    el.querySelector(".date").value = result.date;
    el.querySelector(".games-date-value").textContent = displayGameDate(result.date);
    el.querySelector(".current-game-date").hidden = result.date === el.baseGameDate;
    await loadGames(el, { events: result.events });
    notice.textContent = "";
  } catch (error) {
    if (!el.isConnected || el.calendarVersion !== version) return;
    notice.textContent =
      "No se pudo consultar el calendario. Intenta de nuevo; tu selección actual se conserva.";
    if (!current) {
      el.querySelector(".gamepicker").textContent = "No se pudieron cargar los partidos.";
      el.querySelector(".games-date-value").textContent = "Calendario no disponible";
    }
  } finally {
    if (el.isConnected && el.calendarVersion === version) {
      el.calendarBusy = false;
      dateNavigationBusy(el, false);
      el.querySelector(".next-game-date").innerHTML = el.querySelector(".date").value
        ? "Siguiente fecha de partido más cercana " + icon("arrow")
        : "Reintentar cargar partidos " + icon("refresh");
    }
  }
}
async function initializeDate(el) {
  await navigateGameDate(el, "current");
}
// Compara cada estadística real con la línea guardada de la apuesta.
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
// Lecturas estrictas: una cifra ausente nunca se convierte en cero.
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
// Ventaja máxima: usa el marcador actual y cada instantánea de las jugadas de anotación.
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
function recordMoneylineEvidence() {
  let changed = false;
  for (const p of parlays)
    for (const leg of p.legs) {
      if (leg.market !== "moneyline" || leg.earlyPayout17 === false || !cache.has(leg.event))
        continue;
      const proof = moneylineEvidence(leg, cache.get(leg.event));
      if (proof.maxLead !== null && proof.maxLead > (leg.moneylineMaxLead ?? -1)) {
        leg.moneylineMaxLead = proof.maxLead;
        changed = true;
      }
      if (proof.reached && !leg.moneylineEarlyReached) {
        leg.moneylineEarlyReached = true;
        leg.moneylineEvidencePlay = proof.evidence || "live-score";
        changed = true;
      }
    }
  return changed;
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
// Marcador compartido por Money Line y spread, con el equipo elegido primero.
function gameScoreboard(leg, result) {
  const ctx = contextForLeg(leg);
  const teams =
    ctx.selected && ctx.rival
      ? [ctx.selected, ctx.rival]
      : [
          { team: { id: leg.teamId, abbreviation: leg.teamAbbreviation } },
          { team: { abbreviation: "Rival" } },
        ];
  return `<div class="game-scoreboard moneyline-scoreboard" aria-label="Marcador del partido">${teams.map((t, i) => `${i ? '<span class="moneyline-versus">VS</span>' : ""}<div class="moneyline-score-team">${teamMarkup({ team: t.team }, "teamlogo")}<strong>${result.state === "pending" ? "—" : (scoreNumber(t.score) ?? "—")}</strong></div>`).join("")}</div>`;
}
function moneylineScoreboard(leg, result) {
  return `${gameScoreboard(leg, result)}<div class="moneyline-rule">${leg.earlyPayout17 !== false ? "Regla de anticipo: +17 de ventaja · abono sujeto a tu boleto" : "Money Line al resultado final"}</div>`;
}
// Margen con hándicap: puntos del equipo + spread - puntos del rival.
// Se cubre por encima de cero; cero es empate/push al terminar el juego.
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
// Cuenta goles de campo ANOTADOS de ambos equipos, nunca intentos ni puntos extra.
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
// Determina el filtro del parlay a partir de los estados de sus partidos.
function parlayState(p) {
  const s = p.legs.map((l) => evaluate(l).state);
  return s.every((x) => x === "done") ? "done" : s.includes("live") ? "live" : "pending";
}
let pendingDelete = null;
let editingParlayId = null;
const expandedParlays = new Set();
// Genera tarjetas, agrupa legs por partido y conecta los controles de abrir, cerrar y eliminar.
// Un único conjunto de iconos, sin librerías ni imágenes para los controles.
function icon(name) {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    archive: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M3 3h18v4H3zm6 9h6"/>',
    settings: '<path d="M10 2h4l.6 3 2.3 1.3 2.9-1 2 3.4-2.3 2v2.6l2.3 2-2 3.4-2.9-1-2.3 1.3-.6 3h-4l-.6-3-2.3-1.3-2.9 1-2-3.4 2.3-2v-2.6l-2.3-2 2-3.4 2.9 1L9.4 5Z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    refresh:
      '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    football:
      '<path d="M5 19C1 9 9 1 19 5c4 10-4 18-14 14Z"/><path d="m8 16 8-8m-7 4 3 3m0-6 3 3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}
function paintIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
}
// Logos locales: funcionan aunque el resumen no incluya imágenes de los equipos.
const NFL_TEAM_CODES = {
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};
const NFL_TEAM_LOGOS = {
  ARI: "logos/ari.png",
  ATL: "logos/atl.png",
  BAL: "logos/bal.png",
  BUF: "logos/buf.png",
  CAR: "logos/car.png",
  CHI: "logos/chi.png",
  CIN: "logos/cin.png",
  CLE: "logos/cle.png",
  DAL: "logos/dal.png",
  DEN: "logos/den.png",
  DET: "logos/det.png",
  GB: "logos/gb.png",
  HOU: "logos/hou.png",
  IND: "logos/ind.png",
  JAX: "logos/jax.png",
  KC: "logos/kc.png",
  LAC: "logos/lac.png",
  LAR: "logos/lar.png",
  LV: "logos/lv.png",
  MIA: "logos/mia.png",
  MIN: "logos/min.png",
  NE: "logos/ne.png",
  NO: "logos/no.png",
  NYG: "logos/nyg.png",
  NYJ: "logos/nyj.png",
  PHI: "logos/phi.png",
  PIT: "logos/pit.png",
  SEA: "logos/sea.png",
  SF: "logos/sf.png",
  TB: "logos/tb.png",
  TEN: "logos/ten.png",
  WSH: "logos/wsh.png",
};
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
function teamLogo(team) {
  const code = teamCode(team),
    local = NFL_TEAM_LOGOS[code] || NFL_TEAM_LOGOS[NFL_TEAM_CODES[String(team?.id)]];
  return (
    local ||
    (typeof team?.logo === "string" ? team.logo : team?.logo?.href) ||
    team?.logos?.find((l) => l.href)?.href ||
    ""
  );
}
function teamMarkup(competitor, className = "match-team") {
  const team = competitor.team || {},
    src = teamLogo(team),
    name = teamCode(team) || team.displayName || "";
  return `<span class="${className}">${src ? `<img src="${esc(src)}" alt="" width="24" height="24" loading="lazy" onerror="this.hidden=true">` : ""}<strong>${esc(name)}</strong>${competitor.score != null ? `<b>${esc(competitor.score)}</b>` : ""}</span>`;
}
function teamsFromGameName(game) {
  const codes = (String(game || "").match(/\b[A-Za-z]{2,3}\b/g) || [])
    .map((abbreviation) => teamCode({ abbreviation }))
    .filter((code) => NFL_TEAM_LOGOS[code]);
  return codes.length === 2 ? codes.map((abbreviation) => ({ team: { abbreviation } })) : [];
}
function matchHeading(group) {
  const l = group[0],
    d = demoMode ? demoSummaries.get(l.event) : cache.get(l.event),
    c = d?.header?.competitions?.[0];
  const competitors = c?.competitors?.length
    ? c.competitors.slice().reverse()
    : teamsFromGameName(l.game);
  const markup = competitors.length
    ? competitors.map((t) => teamMarkup(t)).join('<span class="match-separator">/</span>')
    : esc(l.game);
  return `<div class="eventheading"><span class="match-label">${markup}</span><span class="match-time">${esc(c?.status?.type?.shortDetail || l.date)}</span></div>`;
}
function marketLabel(l) {
  if (l.market === "moneyline")
    return `${l.teamAbbreviation || l.player} · Money Line${l.earlyPayout17 !== false ? " · anticipo +17" : ""}`;
  if (l.market === "firstTouchdown") return "Primer anotador de touchdown · Sí";
  if (l.market === "spread")
    return `${l.teamAbbreviation || l.player} · Spread ${signedNumber(l.line)}`;
  return l.market === "anytimeTouchdown"
    ? "Touchdown en cualquier momento · Sí"
    : `${(markets[l.market] || legacyMarkets[l.market])[0]} · ${l.side === "over" ? "Más" : "Menos"} de ${l.line}`;
}
// Escala fija por leg: la marca de la línea no se mueve al actualizar el dato.
// El número de la etiqueta es real; solo su posición se limita al ancho de la barra.
const previousProgress = new WeakMap();
function progressState(leg, result) {
  if (leg.market === "moneyline") {
    if (leg.earlyPayout17 !== false) {
      return {
        position:
          result.progressValue === null
            ? 0
            : Math.max(0, Math.min(100, (result.progressValue / (17 / 0.85)) * 100)),
        target: 85,
        origin: 0,
        pace: result.satisfied ? "reached" : "behind",
      };
    }
    const extent = 14;
    return {
      position:
        result.value === null
          ? 0
          : Math.max(0, Math.min(100, ((result.value + extent) / (extent / 0.85)) * 100)),
      target: 85,
      origin: -extent,
      pace: result.satisfied ? "reached" : "behind",
    };
  }
  if (leg.market === "spread") {
    // El centro representa el punto de equilibrio (diferencia + spread = 0).
    // La etiqueta central muestra el spread elegido; el círculo, la diferencia real.
    const extent = Math.max(14, Math.abs(leg.line) + 7);
    return {
      position:
        result.value === null ? 50 : Math.max(0, Math.min(100, 50 + (result.value / extent) * 50)),
      target: 50,
      pace:
        result.value === null || result.state === "pending"
          ? "unavailable"
          : result.value > 0
            ? "reached"
            : result.value < 0
              ? "behind"
              : "push",
    };
  }
  const boundary = YES_MARKETS.has(leg.market) ? 1 : leg.line;
  // La meta queda fija al 85% del recorrido, dejando espacio para rebasarla.
  const scale = boundary > 0 ? boundary / 0.85 : 1 / 0.85;
  const position =
    result.value === null ? 0 : Math.max(0, Math.min(100, (result.value / scale) * 100));
  const target = Math.max(0, Math.min(100, (boundary / scale) * 100));
  // El color indica cómo va la selección; no cambia su liquidación provisional.
  // Un under permanece verde y solo se vuelve rojo cuando supera la línea.
  let pace = "behind";
  if (leg.side === "under") {
    pace = result.value === null || result.value <= leg.line ? "reached" : "behind";
  } else if (result.value !== null && result.state !== "pending" && result.value > leg.line) {
    pace = "reached";
  }
  return { position, target, pace };
}
// Copy breve para que jugador, mercado y selección compartan una fila.
function compactMarketLabel(l) { return marketLabel(l); }
// Nombre del mercado para el encabezado; la revisión conserva la selección completa.
function propName(l) {
  if (l.market === "moneyline") return "Ganador · Money Line";
  if (l.market === "spread") return "Spread " + signedNumber(l.line);
  return (markets[l.market] || legacyMarkets[l.market] || ["Selección"])[0];
}
function spreadProgress(leg, result, progress, previous) {
  const team = { id: leg.teamId, abbreviation: leg.teamAbbreviation || leg.player },
    logo = teamLogo(team),
    difference = result.scoreDifference,
    rule = `Cubre con una diferencia mayor a ${signedNumber(-leg.line)} pts`,
    description = `${marketLabel(leg)}. Diferencia actual de ${teamCode(team)}: ${difference === null ? "sin dato" : signedNumber(difference)}. ${rule}. ${result.message}.`;
  return `${gameScoreboard(leg, result)}<div class="spread-stat-label">Diferencia actual · ${esc(teamCode(team))}</div><div class="prop-progress spread-progress pace-${progress.pace}" role="img" aria-label="${esc(description)}" style="--current:${progress.position}%;--previous:${previous}%;--target:50%"><span class="progress-badge" aria-hidden="true"><span class="spread-difference">${difference === null ? "—" : signedNumber(difference)}</span>${logo ? `<img src="${esc(logo)}" alt="" width="24" height="24">` : `<span class="spread-team-code">${esc(teamCode(team))}</span>`}</span><div class="progress-rail" aria-hidden="true"><div class="progress-fill"></div></div><span class="progress-target" aria-hidden="true" title="Punto de equilibrio de tu spread"></span><span class="progress-target-label" aria-hidden="true"><small>Tu spread</small><strong>${signedNumber(leg.line)}</strong></span></div><p class="spread-cover-rule">${esc(rule)}</p>`;
}
function renderLeg(l, parlayId = "", legIndex = 0) {
  const r = evaluate(l),
    progress = progressState(l, r),
    previous = previousProgress.get(l) ?? progress.position;
  progress.pace = legVisualState(l, r);
  previousProgress.set(l, progress.position);
  const teamMargin = l.market === "spread" || l.market === "moneyline",
    wholeGame = l.market === "totalFieldGoals" || l.market === "totalPoints";
  const marker =
    l.market === "moneyline"
      ? l.earlyPayout17 !== false
        ? "17"
        : "0"
      : l.market === "spread"
        ? "0"
        : String(l.line);
  const value = l.market === "moneyline" ? r.progressValue : r.value;
  const description = teamMargin
    ? `${marketLabel(l)}. ${value === null ? "Sin dato actual" : "Valor: " + signedNumber(value)}. ${r.message}.`
    : `${marketLabel(l)}. ${r.value === null ? "Sin dato actual" : "Actual: " + r.value}. ${r.message}.`;
  const tracking =
    l.market === "moneyline" ? moneylineScoreboard(l, r) :
    l.market === "spread"
      ? spreadProgress(l, r, progress, previous)
      : `<div class="prop-progress pace-${progress.pace}" role="img" aria-label="${esc(description)}" style="--current:${progress.position}%;--previous:${previous}%;--target:${progress.target}%"><span class="progress-badge" aria-hidden="true">${value === null ? "—" : teamMargin ? signedNumber(value) : value}</span><div class="progress-rail" aria-hidden="true"><div class="progress-fill"></div></div><span class="progress-target" aria-hidden="true" title="Línea de la apuesta"></span>${progress.target > 25 ? `<span class="progress-origin" aria-hidden="true">${progress.origin ?? 0}</span>` : ""}<span class="progress-target-label" aria-hidden="true">${marker}</span></div>`;
  const motionKey = JSON.stringify([parlayId, legIndex, l.event, l.market, l.playerId || l.player, l.teamId || "", l.side, l.line]);
  const motionValue = l.market === "spread" ? r.scoreDifference : value;
  return `<div class="leg" data-leg-key="${esc(motionKey)}" data-value="${Number.isFinite(motionValue) ? motionValue : ""}" data-state="${progress.pace}" data-motion="${r.state === "done" ? "finished" : r.stale ? "stale" : r.state === "live" ? "live" : "pending"}"><div class="leg-info"><span class="player">${esc(wholeGame ? "Total del partido" : l.player)}</span><span class="leg-divider" aria-hidden="true">/</span><span class="market" title="${esc(marketLabel(l))}" aria-label="${esc(marketLabel(l))}">${esc(propName(l))}</span></div>${legReading(l, r)}${tracking}<div class="leg-status"><span class="pill ${r.tone}">${r.label}</span><span class="remaining ${r.tone}">${esc(r.message)}</span></div>${r.stale ? '<p class="stale-note">Sin actualizar · dato anterior</p>' : ""}</div>`;
}
function render() {
  const motionBefore = captureRenderMotion();
  const items = demoMode ? demoParlays : parlays,
    list = items.filter((p) => filter === "all" || parlayState(p) === filter);
  $("#demo-banner").hidden = !demoMode;
  $("#cards").innerHTML = list.length
    ? list
        .map((p) => {
          const state = parlayState(p),
            stateLabel = { live: "EN JUEGO", pending: "PENDIENTE", done: "TERMINADO" }[state];
          return `<article class="card" data-parlay-id="${esc(p.id)}"><div class="cardtop"><button class="parlaytoggle" data-toggle="${esc(p.id)}" aria-expanded="${expandedParlays.has(p.id)}" aria-controls="legs-${esc(p.id)}"><span class="card-kicker">${demoMode ? "EJEMPLO" : "PARLAY"} / ${String(items.indexOf(p) + 1).padStart(2, "0")}</span><span class="parlayname">${esc(p.name)}</span><span class="parlaymeta"><span class="parlay-status ${state}">${stateLabel}</span><span class="togglecaption">${expandedParlays.has(p.id) ? "Toca para cerrar" : "Toca para ver las legs"}</span></span>${parlaySummaryMarkup(p)}<span class="parlay-chevron" aria-hidden="true">${icon("arrow")}</span></button>${demoMode ? "" : `<div class="card-actions"><button class="edit-parlay" data-edit="${esc(p.id)}" aria-label="Editar ${esc(p.name)}" title="Editar parlay">${icon("edit")}<span>Editar</span></button><button class="delete" data-delete="${esc(p.id)}" aria-label="Eliminar ${esc(p.name)}" title="Eliminar parlay">${icon("trash")}</button></div>`}</div><div class="parlaybody" id="legs-${esc(p.id)}" ${expandedParlays.has(p.id) ? "" : "hidden"}>${groupLegs(
            p.legs,
          )
            .map(
              (group) =>
                `<section class="eventgroup">${matchHeading(group)}${group.map(l => renderLeg(l, p.id, p.legs.indexOf(l))).join("")}</section>`,
            )
            .join("")}</div></article>`;
        })
        .join("")
    : `<div class="empty"><div class="empty-symbol">${icon("football")}</div><small>TU TABLERO ESTÁ LISTO</small><h2>${items.length ? "Nada por aquí, por ahora." : "El juego empieza con tu primer parlay."}</h2><p>${items.length ? "Prueba otro filtro para encontrar tus parlays." : "Registra tus selecciones y sigue cada yarda, touchdown y gol de campo en un solo lugar."}</p><div class="empty-actions">${items.length ? "" : `<button class="primary" id="emptynew">${icon("plus")}Crear mi primer parlay</button>`}</div></div>`;
  $("#refresh").disabled = busy || demoMode;
  renderConnectionStatus();
  $("#emptynew")?.addEventListener("click", openEditor);
  document.querySelectorAll("[data-toggle]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.toggle,
          open = !expandedParlays.has(id);
        if (open) expandedParlays.add(id);
        else expandedParlays.delete(id);
        b.setAttribute("aria-expanded", String(open));
        b.querySelector(".togglecaption").textContent = open
          ? "Toca para cerrar"
          : "Toca para ver las legs";
        animateParlayBody(document.getElementById("legs-" + id), open);
      }),
  );
  document.querySelectorAll("[data-edit]").forEach(b => {
    b.onclick = () => openEditParlay(b.dataset.edit);
  });
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        pendingDelete = b.dataset.delete;
        $("#delete-name").textContent =
          parlays.find((p) => p.id === pendingDelete)?.name || "este parlay";
        $("#delete-confirm").showModal();
      }),
  );
  animateRenderedEvents(motionBefore);
}
function renderDemo() {
  demoMode = true;
  filter = "all";
  expandedParlays.add(demoParlays[0].id);
  setFilterButtons();
  render();
}
function previewDemo() {
  const previousMode = demoMode,
    previousFilter = filter,
    firstId = demoParlays[0].id,
    wasExpanded = expandedParlays.has(firstId);
  renderDemo();
  return () => {
    demoMode = previousMode;
    filter = previousFilter;
    if (!wasExpanded) expandedParlays.delete(firstId);
    setFilterButtons();
    render();
  };
}
function enterDemo() {
  renderDemo();
  $("#backup-dialog").close();
  $("#demo-banner").focus({ preventScroll: true });
  $("#demo-banner").scrollIntoView({ block: "start" });
}
function exitDemo() {
  demoMode = false;
  filter = "all";
  setFilterButtons();
  $("#connection").textContent = "Consultando ESPN…";
  render();
  refresh();
}
function setFilterButtons() {
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filter);
    b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
  });
}
// Actualiza cada partido una sola vez, aunque aparezca en varias legs o parlays.
async function refresh() {
  if (demoMode || busy) return;
  busy = true;
  $("#refresh").disabled = true;
  renderConnectionStatus();
  const ids = [...new Set(parlays.flatMap((p) => p.legs.map((l) => l.event)))];
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const d = await get("summary?event=" + id);
      if (!d.header) throw Error("Sin partido");
      cache.set(id, d);
      failures.delete(id);
    }),
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") failures.add(ids[i]);
  });
  if (recordMoneylineEvidence()) persist();
  last = new Date();
  if (!ids.length) {
    try {
      await get("scoreboard");
      connectionStatus = { kind: "ready", updatedAt: new Date(), empty: true };
    } catch (error) {
      connectionStatus = { ...connectionStatus, kind: "error", empty: true };
    }
  } else {
    const received = results.filter(result => result.status === "fulfilled").length;
    connectionStatus = {
      kind: failures.size ? received ? "partial" : "error" : "ready",
      updatedAt: received ? new Date() : connectionStatus.updatedAt,
      empty: false,
    };
  }
  busy = false;
  $("#refresh").disabled = false;
  render();
}
// Obtiene la fecha de hoy en el dispositivo del usuario.
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Abre el formulario vacío y agrega la primera leg.
function openEditor() {
  if (demoMode) exitDemo();
  editingParlayId = null;
  setEditorStep(false);
  $("#form").reset();
  $("#drafts").innerHTML = "";
  $("#formerror").textContent = "";
  addDraft();
  $("#editor").showModal();
}
function openEditParlay(id) {
  const parlay = parlays.find(p => p.id === id);
  if (!parlay) return;
  editingParlayId = id;
  $("#form").reset();
  $("#drafts").innerHTML = "";
  $("#title").value = parlay.name;
  setEditorStep(false);
  parlay.legs.forEach(leg => addDraft(leg));
  $("#editor").showModal();
}

// Los datos guardados se pueden editar aun sin conexión a ESPN.
function fillSavedDraft(el, leg) {
  el.originalLeg = { ...leg };
  const set = (selector, value) => { el.querySelector(selector).value = value ?? ""; };
  set(".date", leg.date);
  set(".event", leg.event);
  set(".gamename", leg.game);
  el.baseGameDate = localDate();
  el.querySelector(".games-date-value").textContent = displayGameDate(leg.date);
  el.querySelector(".current-game-date").hidden = leg.date === el.baseGameDate;
  el.querySelector(".next-game-date").disabled = false;
  const market = el.querySelector(".market");
  if (!markets[leg.market] && legacyMarkets[leg.market])
    market.add(new Option(legacyMarkets[leg.market][0], leg.market));
  set(".market", leg.market);
  set(".side", leg.side);
  set(".line", leg.line);
  set(".spread-range", leg.market === "spread" ? leg.line : 0);
  set(".spread-team-id", leg.teamId);
  set(".spread-team-abbr", leg.teamAbbreviation);
  set(".spread-team-name", leg.teamName);
  el.spreadEvent = leg.event;
  el.querySelector(".early-payout-checkbox").checked = leg.earlyPayout17 !== false;
  updateMarket(el);
  const picker = el.querySelector(".gamepicker");
  picker.innerHTML = `<button type="button" class="gameoption" aria-pressed="true">${esc(leg.game)}<small>Partido guardado · Cargar opciones</small></button>`;
  picker.querySelector("button").onclick = () => loadPlayers(el);
  if (TEAM_MARKETS.has(leg.market)) {
    el.querySelector(".spread-team-picker").innerHTML = `<button type="button" class="spread-team-button" aria-pressed="true">${esc(leg.teamAbbreviation)} · Cargar equipos</button>`;
    el.querySelector(".spread-team-picker button").onclick = () => loadPlayers(el);
  }
  if (!GAME_MARKETS.has(leg.market)) {
    restoreSavedPlayer(el);
    el.querySelector(".otherplayers").textContent = "＋ Cambiar jugador de la plantilla";
    el.querySelector(".otherplayers").disabled = false;
  }
  el.querySelector(".draftstatus").textContent = "Selección guardada. Puedes editarla o cargar más opciones del partido.";
}

function restoreSavedPlayer(el) {
  const leg = el.originalLeg;
  if (!leg || el.querySelector(".event").value !== leg.event ||
      el.querySelector(".market").value !== leg.market || GAME_MARKETS.has(leg.market)) return;
  const select = el.querySelector(".playerinput");
  if (select.value) return;
  let option = [...select.options].find(option => option.value === leg.player &&
    (!leg.playerId || option.dataset.id === leg.playerId));
  if (!option) {
    option = new Option(leg.player + " · selección guardada", leg.player);
    if (leg.playerId) option.dataset.id = leg.playerId;
    select.add(option);
  }
  option.selected = true;
  select.disabled = false;
}
// Crea los campos de una leg y conecta fecha, partido, mercado y selector de jugador.
function addDraft(savedLeg = null) {
  collapseExistingDrafts();
  const id = ++draftSeq,
    el = document.createElement("section");
  el.className = "draft";
  el.innerHTML = `<div class="drafttop"><strong>LEG</strong><button type="button" class="remove">Quitar</button></div><input type="hidden" class="date" value=""><div class="games-date"><span>PARTIDOS DISPONIBLES</span><strong class="games-date-value">Buscando fecha…</strong></div><input type="hidden" class="event"><input type="hidden" class="gamename"><div class="gamepicker" role="group" aria-label="Seleccionar partido"></div><div class="game-date-actions"><button type="button" class="next-game-date" disabled>Siguiente fecha de partido más cercana</button><button type="button" class="current-game-date" hidden>Regresar a fecha actual</button></div><p class="calendar-status" role="status"></p><div class="row"><label>Estadística<select class="market">${Object.entries(
    markets,
  )
    .map(([k, v]) => `<option value="${k}">${marketOptionLabel(k, v[0])}</option>`)
    .join(
      "",
    )}</select></label><label>Selección<select class="side"><option value="over">Más de</option><option value="under">Menos de</option></select></label></div><section class="spread-config" hidden><input type="hidden" class="spread-team-id"><input type="hidden" class="spread-team-abbr"><input type="hidden" class="spread-team-name"><div class="fieldlabel team-market-heading">Equipo de la apuesta</div><div class="spread-team-picker" role="group" aria-label="Seleccionar equipo para el spread">Primero selecciona un partido.</div><div class="spread-control-head"><label for="spread-${id}">Spread del equipo</label><output class="spread-output" for="spread-${id}" aria-live="polite">0</output></div><div class="spread-slider-row"><button type="button" class="spread-minus" aria-label="Reducir spread en 0.5">−</button><input type="range" id="spread-${id}" class="spread-range" min="-50" max="50" step="0.5" value="0" aria-label="Spread del equipo"><button type="button" class="spread-plus" aria-label="Aumentar spread en 0.5">+</button></div><div class="spread-range-labels"><span>−50</span><span>0</span><span>+50</span></div><label class="early-payout-option" hidden><input type="checkbox" class="early-payout-checkbox" checked><span>Considerar pago anticipado al alcanzar +17 puntos de ventaja</span></label><p class="spread-hint">Selecciona un equipo del partido.</p></section><label>Jugador<select class="playerinput" required disabled><option value="">Primero selecciona un partido</option></select></label><button type="button" class="otherplayers" aria-expanded="false">＋ Buscar otro jugador de la plantilla</button><label class="playersearchlabel" hidden>Buscar en la plantilla<input type="search" class="playersearch" placeholder="Nombre del jugador" autocomplete="off"></label><label class="linelabel">Línea<input type="number" class="line" min="0" max="10000" step="0.5" required placeholder="249.5"></label><div class="draftstatus" role="status"></div>`;
  $("#drafts").append(el);
  el.querySelector(".remove").onclick = () => {
    if ($("#drafts").children.length > 1) {
      el.remove();
      if (!$("#drafts .draft:not(.is-collapsed)")) $("#drafts").lastElementChild?.classList.remove("is-collapsed");
    }
    else toast("El parlay necesita al menos una leg");
  };
  el.querySelector(".next-game-date").onclick = () => navigateGameDate(el, "next");
  el.querySelector(".current-game-date").onclick = () => navigateGameDate(el, "current");
  el.querySelector(".market").onchange = () => {
    updateMarket(el);
    populatePlayers(el);
    if (
      el.querySelector(".market").value !== "totalFieldGoals" &&
      (!el.players?.length || (el.originalLeg && !el.rosterLoaded)) &&
      el.querySelector(".event").value
    )
      loadPlayers(el);
  };
  el.querySelector(".otherplayers").onclick = () => {
    if (el.originalLeg && !el.rosterLoaded) {
      loadPlayers(el);
      return;
    }
    el.expandedPlayers = !el.expandedPlayers;
    el.querySelector(".playersearch").value = "";
    populatePlayers(el);
    if (el.expandedPlayers) el.querySelector(".playersearch").focus();
  };
  el.querySelector(".playersearch").oninput = () => populatePlayers(el);
  el.querySelector(".early-payout-checkbox").onchange = () => updateSpreadInfo(el);
  el.querySelector(".spread-range").oninput = () => updateSpreadInfo(el);
  for (const [selector, change] of [
    [".spread-minus", -0.5],
    [".spread-plus", 0.5],
  ])
    el.querySelector(selector).onclick = () => {
      const range = el.querySelector(".spread-range");
      range.value = String(
        Math.max(Number(range.min), Math.min(Number(range.max), Number(range.value) + change)),
      );
      updateSpreadInfo(el);
    };
  updateMarket(el);
  paintIcons(el);
  installDraftSummary(el);
  if (savedLeg) fillSavedDraft(el, savedLeg);
  else initializeDate(el);
  return el;
}
// Carga los partidos del día y los presenta como tarjetas con los logos de sus equipos.
async function loadGames(el, provided) {
  const date = el.querySelector(".date").value,
    sel = el.querySelector(".event"),
    version = (el.loadVersion || 0) + 1;
  el.loadVersion = version;
  sel.value = "";
  el.querySelector(".gamename").value = "";
  el.players = [];
  el.expandedPlayers = false;
  el.querySelector(".playersearch").value = "";
  populatePlayers(el);
  el.querySelector(".playerinput").innerHTML =
    '<option value="">Primero selecciona un partido</option>';
  el.querySelector(".playerinput").disabled = true;
  el.querySelector(".gamepicker").textContent = "Cargando partidos…";
  try {
    const d = provided || (await get("scoreboard?dates=" + date.replaceAll("-", "")));
    if (el.loadVersion !== version) return;
    const picker = el.querySelector(".gamepicker");
    el.games = d.events || [];
    picker.innerHTML = el.games
      .map(
        (e) =>
          `<button type="button" class="gameoption" data-event="${esc(e.id)}" aria-pressed="false">${(
            e.competitions?.[0]?.competitors || []
          )
            .slice()
            .reverse()
            .map((t) => teamMarkup(t, "teamlogo"))
            .join(
              '<span class="versus">vs</span>',
            )}<small>${esc(e.status?.type?.shortDetail)}</small></button>`,
      )
      .join("");
    picker.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          sel.value = b.dataset.event;
          el.querySelector(".gamename").value =
            el.games.find((e) => String(e.id) === sel.value)?.shortName || "";
          picker
            .querySelectorAll("button")
            .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          loadPlayers(el);
        }),
    );
    el.querySelector(".draftstatus").textContent = d.events?.length
      ? ""
      : "No hay partidos publicados para esta fecha.";
  } catch (e) {
    if (el.loadVersion !== version) return;
    el.querySelector(".gamepicker").textContent = "No se pudieron cargar los partidos.";
    el.querySelector(".draftstatus").textContent =
      "Revisa tu conexión y vuelve a cargar los partidos.";
  }
}
// Obtiene plantilla, titulares y rendimiento de temporada para el partido elegido.
async function loadPlayers(el) {
  const id = el.querySelector(".event").value,
    select = el.querySelector(".playerinput");
  el.players = [];
  el.expandedPlayers = false;
  el.querySelector(".playersearch").value = "";
  populatePlayers(el);
  select.disabled = true;
  select.innerHTML = '<option value="">Cargando jugadores…</option>';
  if (!id) return;
  if (["totalFieldGoals", "totalPoints"].includes(el.querySelector(".market").value)) {
    populatePlayers(el);
    return;
  }
  if (TEAM_MARKETS.has(el.querySelector(".market").value)) {
    populateSpreadTeams(el);
    if (el.spreadTeams?.length !== 2)
      try {
        const data = await get("summary?event=" + id);
        if (el.querySelector(".event").value !== id) return;
        cache.set(id, data);
        populateSpreadTeams(el, data.header?.competitions?.[0]?.competitors || []);
      } catch (e) {
        el.querySelector(".draftstatus").textContent =
          "No se pudieron cargar los equipos; selecciona de nuevo el partido.";
      }
    return;
  }
  try {
    const d = await get("summary?event=" + id);
    if (el.querySelector(".event").value !== id) return;
    const players = new Map();
    for (const t of d.boxscore?.players || [])
      for (const g of t.statistics || [])
        for (const a of g.athletes || [])
          players.set(String(a.athlete.id), { ...a.athlete, team: t.team?.abbreviation || "" });
    const competitors = d.header?.competitions?.[0]?.competitors || [];
    const rosters = await Promise.allSettled(
      competitors.map(async (t) => {
        const info = await teamInfo(t.team.id);
        return { ...info, team: t.team.abbreviation };
      }),
    );
    if (el.querySelector(".event").value !== id) return;
    for (const r of rosters)
      if (r.status === "fulfilled") {
        for (const group of r.value.roster.athletes || [])
          for (const a of group.items || []) {
            const key = String(a.id);
            players.set(key, { ...players.get(key), ...a, team: r.value.team });
          }
        for (const chart of r.value.depth?.depthchart || [])
          for (const [key, pos] of Object.entries(chart.positions || {})) {
            const role = key.replace(/[0-9]/g, "").toUpperCase();
            if (!["QB", "RB", "FB", "WR", "TE"].includes(role)) continue;
            (pos.athletes || []).forEach((a, index) => {
              const id = String(a.id),
                old = players.get(id) || {};
              players.set(id, {
                ...a,
                ...old,
                team: r.value.team,
                position: old.position || { abbreviation: role },
                depthRank: Math.min(old.depthRank ?? 99, index),
              });
            });
          }
      }
    el.players = [...players.values()].sort(
      (a, b) =>
        (a.team || "").localeCompare(b.team || "") || a.displayName.localeCompare(b.displayName),
    );
    el.rosterLoaded = true;
    cache.set(id, d);
    el.querySelector(".draftstatus").textContent =
      "Calculando líderes por estadísticas de temporada…";
    select.innerHTML = '<option value="">Cargando rendimiento de temporada…</option>';
    const rosterPlayers = el.players;
    await attachSeasonStats(rosterPlayers, competitors, d.header?.season);
    if (el.querySelector(".event").value !== id || el.players !== rosterPlayers) return;
    el.rankingYear = d.header?.season?.year;
    populatePlayers(el);
  } catch (e) {
    if (el.querySelector(".event").value !== id) return;
    select.innerHTML = '<option value="">No se pudieron cargar los jugadores</option>';
    el.querySelector(".draftstatus").textContent =
      "Selecciona de nuevo el partido para reintentar.";
    restoreSavedPlayer(el);
  }
}

// Acciones de la ventana de confirmación de eliminación.
$("#delete-cancel").onclick = () => $("#delete-confirm").close();
$("#delete-confirm").addEventListener("close", () => {
  pendingDelete = null;
});
$("#delete-accept").onclick = () => {
  if (!pendingDelete) return;
  const id = pendingDelete,
    remaining = parlays.filter((p) => p.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(remaining));
    window.dispatchEvent(new Event('fieldnote-saved'));
  } catch (e) {
    toast("No se pudo eliminar. Revisa el almacenamiento del navegador.");
    return;
  }
  parlays = remaining;
  expandedParlays.delete(id);
  $("#delete-confirm").close();
  render();
  toast("Parlay eliminado");
};
// Formulario: abrir, cerrar, agregar legs y guardar un nuevo parlay.
$("#new").onclick = openEditor;
$("#close").onclick = () => $("#editor").close();
$("#addleg").onclick = () => {
  if ($("#drafts").children.length < 30) addDraft();
};
// La revisión y el guardado usan la misma lectura y validación del formulario.
function readDraftParlay() {
  $("#drafts").querySelectorAll(".draft").forEach(el => {
    const market = el.querySelector(".market").value;
    const missingSelection = !el.querySelector(".event").value ||
      (TEAM_MARKETS.has(market) && !el.querySelector(".spread-team-id").value);
    if (missingSelection || el.querySelector(":invalid")) { el.classList.remove("is-collapsed"); el.querySelector(".draft-expand")?.setAttribute("aria-expanded", "true"); }
  });
  if (!$("#form").reportValidity()) throw Error("Completa los campos obligatorios.");
  const p = {
    id: editingParlayId || crypto.randomUUID(),
    name: $("#title").value.trim(),
    legs: [...document.querySelectorAll(".draft")].map((el) => {
      const q = (s) => el.querySelector(s).value,
        market = q(".market");
      if (TEAM_MARKETS.has(market)) {
        if (!q(".spread-team-id")) {
          el.querySelector(".draftstatus").textContent = "Selecciona el equipo de la apuesta.";
          throw Error("Falta seleccionar el equipo");
        }
        const leg = {
          event: q(".event"),
          date: q(".date"),
          game: q(".gamename"),
          player: q(".spread-team-abbr"),
          playerId: null,
          market,
          side: market === "teamTotalPoints" ? q(".side") : "over",
          line:
            market === "spread"
              ? Number(q(".spread-range"))
              : market === "moneyline"
                ? 0
                : Number(q(".line")),
          teamId: q(".spread-team-id"),
          teamAbbreviation: q(".spread-team-abbr"),
          teamName: q(".spread-team-name"),
        };
        if (market === "moneyline")
          leg.earlyPayout17 = el.querySelector(".early-payout-checkbox").checked;
        return preserveLegEvidence(el.originalLeg, leg);
      }
      const game = GAME_MARKETS.has(market);
      const leg = {
        event: q(".event"),
        date: q(".date"),
        game: q(".gamename"),
        player: game ? "Total del partido" : q(".playerinput").trim(),
        playerId: game
          ? null
          : el.querySelector(".playerinput").selectedOptions[0]?.dataset.id || null,
        market,
        side: YES_MARKETS.has(market) ? "over" : q(".side"),
        line: YES_MARKETS.has(market) ? 0.5 : Number(q(".line")),
      };
      return preserveLegEvidence(el.originalLeg, leg);
    }),
  };
  if (!p.name) throw Error("Escribe un nombre para tu parlay.");
  validate([p]);
  p.legs = groupLegs(p.legs).flat();
  return p;
}
function setEditorStep(review) {
  const previouslyReview = !$("#review-view").hidden;
  $("#compose-view").hidden = review;
  $("#review-view").hidden = !review;
  $("#review-button").hidden = review;
  $("#save-parlay").hidden = !review;
  $("#back-compose").hidden = !review;
  $("#step-compose").classList.toggle("current", !review);
  $("#step-review").classList.toggle("current", review);
  $("#formerror").textContent = "";
  $("#editor-heading").textContent = review
    ? editingParlayId ? "Confirma los cambios." : "Confirma tu parlay."
    : editingParlayId ? "Edita tu parlay." : "Arma tu parlay.";
  $("#editor .eyebrow").textContent = editingParlayId ? "EDITAR SEGUIMIENTO" : "NUEVO SEGUIMIENTO";
  $("#save-parlay").innerHTML = (editingParlayId ? "Guardar cambios " : "Guardar parlay ") + icon("check");
  $("#editor").scrollTop = 0;
  animateEditorStep(review, previouslyReview);
}
function showReview() {
  try {
    const p = readDraftParlay();
    $("#review-view").innerHTML = `<h3>${esc(p.name)}</h3>${groupLegs(p.legs)
      .map(
        (group) =>
          `<div class="review-group"><h4>${esc(group[0].game)} · ${esc(group[0].date)}</h4>${group.map((l) => `<div class="review-leg">${esc(l.player)}<small title="${esc(marketLabel(l))}" aria-label="${esc(marketLabel(l))}">${esc(compactMarketLabel(l))}</small></div>`).join("")}</div>`,
      )
      .join(
        "",
      )}<p class="review-notice">Se guardará en este navegador. Podrás seguir todas las legs desde tu tablero.</p>`;
    setEditorStep(true);
    $("#save-parlay").focus();
  } catch (e) {
    $("#formerror").textContent =
      "Revisa el nombre, partido, equipo o jugador y línea de cada leg.";
  }
}
$("#review-button").onclick = showReview;
$("#back-compose").onclick = () => setEditorStep(false);
$("#form").onsubmit = (e) => {
  e.preventDefault();
  if ($("#review-view").hidden) {
    showReview();
    return;
  }
  try {
    const p = readDraftParlay();
    const wasEditing = editingParlayId !== null;
    if (wasEditing && !parlays.some(item => item.id === editingParlayId))
      throw Error("El parlay ya no está disponible.");
    const previousParlays = parlays;
    parlays = wasEditing ? parlays.map(item => item.id === editingParlayId ? p : item) : [...parlays, p];
    if (!persist()) {
      parlays = previousParlays;
      return;
    }
    $("#editor").close();
    render();
    refresh();
    toast(wasEditing ? "Cambios guardados" : "Parlay guardado");
  } catch (e) {
    setEditorStep(false);
    $("#formerror").textContent =
      "Revisa el nombre, partido, equipo o jugador y línea de cada leg.";
  }
};
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((x) => x.classList.toggle("active", x === b));
      setFilterButtons();
      render();
    }),
);
$("#refresh").onclick = refresh;
// Respaldos: exportar JSON e importar sin reemplazar los parlays existentes.
$("#export").onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, parlays }, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `mis-parlays-${localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Respaldo exportado");
};
$("#import").onclick = () => $("#file").click();
$("#file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 2000000) throw Error();
    const d = JSON.parse(await f.text());
    if (d.version !== 1) throw Error();
    const incoming = validate(d.parlays);
    const merged = new Map(parlays.map((p) => [p.id, p]));
    for (const p of incoming) if (!merged.has(p.id)) merged.set(p.id, p);
    validate([...merged.values()]);
    demoMode = false;
    parlays = [...merged.values()];
    persist();
    render();
    refresh();
    toast("Respaldo importado; se conservaron tus parlays existentes");
  } catch (e) {
    toast("Respaldo no válido. Selecciona un archivo exportado de esta app.");
  }
  e.target.value = "";
};
// Navegación y accesos comunes de la nueva interfaz.
document.querySelectorAll("[data-create]").forEach((b) => (b.onclick = openEditor));
document
  .querySelectorAll("[data-backup]")
  .forEach((b) => (b.onclick = () => $("#backup-dialog").showModal()));
$("#close-backup").onclick = () => $("#backup-dialog").close();
$("#backup-dialog [data-demo]").onclick = enterDemo;
$("#exit-demo").onclick = exitDemo;
paintIcons();
// Apariencia final: Pizarra y Tomorrow, sin selectores de diseño.
document.documentElement.dataset.font = "tomorrow";
document.documentElement.dataset.palette = "slate";
document.querySelector('meta[name="theme-color"]').content = "#15181c";
// Inicio y actualización automática mientras la pestaña está visible.
render();
refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, 45000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});

setInterval(() => { if (!document.hidden) renderConnectionStatus(); }, 15000);
