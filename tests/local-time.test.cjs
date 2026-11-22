const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync("public/app.js", "utf8");
const times = fs.readFileSync("public/local-time.js", "utf8");
const kickoff = "2026-11-23T01:15:00Z";
const context = () => {
  const c = vm.createContext({
    console,
    Date,
    Intl,
    demoMode: false,
    demoSummaries: new Map(),
    cache: new Map(),
  });
  vm.runInContext(times, c);
  return c;
};
function load(c, name, async = false) {
  const match = app.match(
    new RegExp("^" + (async ? "async " : "") + "function " + name + "\\([^]*?^\\}", "m"),
  );
  assert.ok(match, name);
  vm.runInContext(match[0], c);
}
async function inZone(zone, action) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
const event = () => ({
  id: "401999001",
  date: kickoff,
  shortName: "BAL @ BUF",
  status: { type: { state: "pre", shortDetail: "11/22 - 8:15 PM EST" } },
  competitions: [
    {
      date: kickoff,
      status: { type: { state: "pre", shortDetail: "11/22 - 8:15 PM EST" } },
      competitors: [],
    },
  ],
});

test("Un mismo partido usa la zona actual del dispositivo y cambia de día cuando corresponde", async () => {
  const c = context();
  for (const [zone, expected] of [
    ["America/Mexico_City", "22 nov, 7:15 p.m."],
    ["America/Los_Angeles", "22 nov, 5:15 p.m."],
    ["America/New_York", "22 nov, 8:15 p.m."],
    ["Europe/Madrid", "23 nov, 2:15 a.m."],
    ["Asia/Tokyo", "23 nov, 10:15 a.m."],
  ]) {
    await inZone(zone, () => {
      assert.equal(c.formatLocalKickoff(kickoff), expected);
      assert.equal(c.gameTimeLabel(event()), expected);
      assert.equal(c.gameTimeLabel(event().competitions[0]), expected);
      assert.equal(
        c.gameTimeLabel(null, kickoff),
        expected,
        "el respaldo conserva un instante, no una hora formateada",
      );
    });
  }
});

test("Respeta los cambios de horario de verano sin usar una resta fija de horas", async () => {
  const c = context();
  await inZone("America/New_York", () => {
    assert.equal(c.formatLocalKickoff("2026-03-08T06:30:00Z"), "8 mar, 1:30 a.m.");
    assert.equal(c.formatLocalKickoff("2026-03-08T07:30:00Z"), "8 mar, 3:30 a.m.");
    assert.equal(c.formatLocalKickoff("2026-07-13T01:15:00Z"), "12 jul, 9:15 p.m.");
  });
  await inZone("America/Mexico_City", () => {
    assert.equal(c.formatLocalKickoff("2026-07-13T01:15:00Z"), "12 jul, 7:15 p.m.");
  });
});

test("El reloj de juego, Final y los partidos pospuestos mantienen su significado; no inventa horarios", () => {
  const c = context();
  for (const value of [undefined, null, "", "2026-11-22", "11/22 - 8:15 PM EST", "invalid", 0]) {
    assert.equal(c.formatLocalKickoff(value), "");
    assert.equal(c.gameTimeLabel(null, value), "Hora por confirmar");
  }
  const game = event().competitions[0];
  game.status.type = { state: "in", shortDetail: "Q3 · 06:42" };
  assert.equal(c.gameTimeLabel(game), "Q3 · 06:42");
  game.status.type = { state: "post", completed: true, shortDetail: "Final/OT" };
  assert.equal(c.gameTimeLabel(game), "Final/OT");
  for (const [name, label] of [
    ["STATUS_POSTPONED", "Pospuesto"],
    ["STATUS_CANCELED", "Cancelado"],
    ["STATUS_DELAYED", "Retrasado"],
  ]) {
    game.status.type = { state: "pre", name };
    assert.equal(c.gameTimeLabel(game), label);
  }
  game.status.type = { state: "pre", shortDetail: "TBD" };
  assert.equal(c.gameTimeLabel(game), "Hora por confirmar");
  assert.equal(c.gameKickoff({ date: "2026-11-22T20:15:00-05:00" }), "2026-11-23T01:15:00.000Z");
});

test("El selector y las legs guardan el inicio correcto, sin reutilizar el horario de otro partido", () => {
  const c = context();
  assert.equal(
    c.selectedGameKickoff({ games: [event()] }, "401999001"),
    "2026-11-23T01:15:00.000Z",
  );
  const draft = { originalLeg: { event: "401999001", kickoff } };
  assert.equal(c.selectedGameKickoff(draft, "401999001"), "2026-11-23T01:15:00.000Z");
  assert.equal(c.selectedGameKickoff(draft, "401999002"), null);
  draft.games = [{ ...event(), date: "2026-11-23T02:15:00Z", competitions: [] }];
  assert.equal(c.selectedGameKickoff(draft, "401999001"), "2026-11-23T02:15:00.000Z");
});

test("Selector, cabecera del parlay y revisión muestran el horario local en lugar del texto EST de ESPN", async () => {
  await inZone("America/Mexico_City", async () => {
    const c = context(),
      nodes = {};
    const node = (key) =>
      (nodes[key] ||= {
        value: "",
        innerHTML: "",
        textContent: "",
        querySelectorAll: () => [],
        focus() {},
      });
    c.$ = node;
    c.esc = (value) => String(value);
    c.teamMarkup = () => "BAL / BUF";
    c.teamsFromGameName = () => [];
    c.populatePlayers = () => {};
    c.groupLegs = (legs) => [legs];
    c.marketLabel = c.compactMarketLabel = () => "Yardas de pase";
    c.setEditorStep = () => {};
    const game = event(),
      leg = {
        event: game.id,
        kickoff,
        game: game.shortName,
        player: "Jugador",
        date: "2026-11-22",
      };
    c.cache.set(game.id, { header: { competitions: game.competitions } });
    for (const name of ["gameTimeForLeg", "matchHeading", "showReview"]) load(c, name);
    load(c, "loadGames", true);
    const el = { querySelector: node };
    node(".date").value = "2026-11-22";
    await c.loadGames(el, { events: [game] });
    assert.match(node(".gamepicker").innerHTML, /22 nov, 7:15 p\.m\./);
    assert.doesNotMatch(node(".gamepicker").innerHTML, /EST/);
    assert.match(c.matchHeading([leg]), /22 nov, 7:15 p\.m\./);
    assert.doesNotMatch(c.matchHeading([leg]), /EST/);
    c.readDraftParlay = () => ({ name: "Prueba", legs: [leg] });
    c.showReview();
    assert.match(node("#review-view").innerHTML, /22 nov, 7:15 p\.m\./);
    assert.doesNotMatch(node("#review-view").innerHTML, /EST/);
    c.cache.clear();
    assert.match(
      c.matchHeading([leg]),
      /22 nov, 7:15 p\.m\./,
      "también funciona desde el horario guardado",
    );
  });
});

test("La actualización completa horarios de parlays antiguos, los guarda una sola vez y acepta respaldos anteriores", async () => {
  await inZone("America/Mexico_City", async () => {
    const c = context(),
      game = event();
    const leg = {
      event: game.id,
      date: "2026-11-22",
      game: game.shortName,
      player: "Jugador",
      market: "passingYards",
      side: "over",
      line: 10,
    };
    c.parlays = [{ id: "legacy", name: "Anterior", legs: [leg] }];
    Object.assign(c, { markets: { passingYards: [] }, legacyMarkets: {}, TEAM_MARKETS: new Set() });
    load(c, "validate");
    assert.doesNotThrow(() => c.validate(c.parlays));
    for (const name of ["recordGameKickoffs", "gameTimeForLeg"]) load(c, name);
    load(c, "refresh", true);
    let saved,
      saves = 0;
    Object.assign(c, {
      busy: false,
      failures: new Set(),
      connectionStatus: {},
      $: () => ({}),
      renderConnectionStatus() {},
      render() {},
      recordMoneylineEvidence: () => false,
      persist: () => {
        saves++;
        saved = JSON.parse(JSON.stringify(c.parlays));
        return true;
      },
      get: async () => ({ header: { competitions: game.competitions } }),
    });
    await c.refresh();
    assert.equal(saves, 1);
    assert.equal(saved[0].legs[0].kickoff, "2026-11-23T01:15:00.000Z");
    assert.equal(c.gameTimeForLeg(leg), "22 nov, 7:15 p.m.");
    assert.doesNotThrow(() => c.validate(saved));
    await c.refresh();
    assert.equal(saves, 1, "sin escrituras repetidas si no cambia el horario");
    c.cache.clear();
    assert.equal(c.recordGameKickoffs(), false);
    assert.equal(c.gameTimeForLeg(leg), "22 nov, 7:15 p.m.");
    leg.kickoff = "11/22 - 8:15 PM EST";
    assert.throws(() => c.validate(c.parlays), /Leg no válida/);
  });
});
