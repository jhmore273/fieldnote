const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const tools = fs.readFileSync('public/parlay-tools.js', 'utf8');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const pick = (state = 'done', value = 20, tone = 'good', extra = {}) => ({
  market: 'passingYards', side: 'over', line: 10,
  result: { state, value, tone, ...extra },
});
const parlay = (id, legs) => ({ id, name: id, legs });
const context = vm.createContext({ esc, evaluate: leg => leg.result });
vm.runInContext(tools, context);

test('El resultado espera todos los partidos y distingue victoria, derrota, push y datos ausentes', () => {
  const cases = [
    [[pick(), pick()], 'won'],
    [[pick(), pick('done', 2, 'bad')], 'lost'],
    [[pick('done', 10, ''), pick('done', 10, '')], 'push'],
    [[pick(), pick('done', 10, '')], 'won'],
    [[pick(), pick('done', null, '')], 'unknown'],
    [[pick('done', 2, 'bad'), pick('done', null, '')], 'lost'],
    [[pick('done', 20, 'good', { stale: true })], 'unknown'],
    [[pick('done', Number.NaN, '')], 'unknown'],
  ];
  for (const [legs, expected] of cases)
    assert.equal(context.completedParlayResult({ legs }).outcome, expected);
  assert.equal(context.completedParlayResult({ legs: [] }), null);
  for (const state of ['pending', 'live'])
    assert.equal(context.completedParlayResult({ legs: [pick('done', 2, 'bad'), pick(state)] }), null);
  const withPush = context.completedParlayResult({ legs: [pick(), pick('done', 10, '')] });
  assert.match(withPush.note, /pago ajustado/);
});

test('La condición de anticipo ML se conserva sin presentar una ventaja en vivo como parlay ganado', () => {
  const ml = { ...pick('done', -7, 'good', { earlyReached: true }), market: 'moneyline' };
  assert.equal(context.completedParlayResult({ legs: [ml] }).outcome, 'won');
  ml.result.state = 'live';
  assert.equal(context.completedParlayResult({ legs: [ml] }), null);
});

function renderContext(parlays) {
  const nodes = { '#cards': { innerHTML: '' }, '#demo-banner': {}, '#refresh': {} };
  const c = vm.createContext({
    esc, evaluate: leg => leg.result, parlays, demoMode: false, demoParlays: [], filter: 'all', busy: false,
    expandedParlays: new Set(), $: selector => nodes[selector],
    document: { querySelectorAll: () => [] },
    captureRenderMotion: () => null, animateRenderedEvents: () => {}, renderConnectionStatus: () => {},
    icon: () => '', groupLegs: legs => [legs], matchHeading: () => '', renderLeg: () => '',
  });
  vm.runInContext(tools, c);
  vm.runInContext(app.slice(app.indexOf('function parlayState('), app.indexOf('let pendingDelete')), c);
  vm.runInContext(app.slice(app.indexOf('function render()'), app.indexOf('function renderDemo()')), c);
  return { c, cards: nodes['#cards'], visible: () => [...nodes['#cards'].innerHTML.matchAll(/data-parlay-id="([^"]+)"/g)].map(m => m[1]) };
}

test('Todos conserva pendientes y activos; los resultados finales aparecen exclusivamente en Terminados', () => {
  const parlays = [
    parlay('pending', [pick('pending', null, '')]), parlay('live', [pick('live')]),
    parlay('won', [pick()]), parlay('lost', [pick('done', 2, 'bad')]),
    parlay('push', [pick('done', 10, '')]), parlay('unknown', [pick('done', null, '')]),
  ];
  const { c, cards, visible } = renderContext(parlays);
  c.render();
  assert.deepEqual(visible(), ['pending', 'live']);
  c.filter = 'live'; c.render();
  assert.deepEqual(visible(), ['live']);
  c.filter = 'done'; c.render();
  assert.deepEqual(visible(), ['won', 'lost', 'push', 'unknown']);
  for (const label of ['GANADO', 'PERDIDO', 'ANULADO / PUSH', 'POR VERIFICAR'])
    assert.ok(cards.innerHTML.includes(label), label);
  assert.match(cards.innerHTML, /data-edit="won"/);
  assert.match(cards.innerHTML, /class="card-progress"/);
  assert.equal(parlays.length, 6, 'los filtros no borran apuestas');
});

test('Un partido recién terminado desaparece de Todos y aparece en Terminados con su resultado', () => {
  const live = parlay('new-final', [pick('live')]);
  const { c, cards, visible } = renderContext([live]);
  c.render(); assert.deepEqual(visible(), ['new-final']);
  live.legs[0].result.state = 'done';
  c.render(); assert.deepEqual(visible(), []);
  assert.match(cards.innerHTML, /finalizados están en Terminados/);
  c.filter = 'done'; c.render();
  assert.deepEqual(visible(), ['new-final']);
  assert.match(cards.innerHTML, /data-result="won"/);
});

test('La navegación ofrece tres filtros sin Pendientes', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.deepEqual([...html.matchAll(/data-filter="([^"]+)"/g)].map(m => m[1]), ['all', 'live', 'done']);
});
