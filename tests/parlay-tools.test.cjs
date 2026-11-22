const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('public/app.js', 'utf8');
const tools = fs.readFileSync('public/parlay-tools.js', 'utf8');
const base = { event: '100000001', date: '2026-11-17', game: 'BUF @ KC', player: 'BUF', playerId: null,
  market: 'moneyline', side: 'over', line: 0, teamId: '2', teamAbbreviation: 'BUF', teamName: 'Buffalo Bills',
  earlyPayout17: true, moneylineMaxLead: 17, moneylineEarlyReached: true, moneylineEvidencePlay: 'saved-proof' };
const context = vm.createContext({ console, crypto: { randomUUID: () => 'new-id' },
  esc: s => String(s).replaceAll('<','&lt;'), GAME_MARKETS: new Set(['moneyline','spread','teamTotalPoints','totalPoints','totalFieldGoals']),
  TEAM_MARKETS: new Set(['moneyline','spread','teamTotalPoints']), YES_MARKETS: new Set(['anytimeTouchdown','firstTouchdown']),
  markets: Object.fromEntries(['moneyline','spread','passingYards','totalPoints'].map(k => [k, []])), legacyMarkets: {},
  groupLegs: legs => [legs], editingParlayId: 'saved-id' });
vm.runInContext(fs.readFileSync('public/local-time.js', 'utf8'), context);
vm.runInContext(tools, context);
vm.runInContext(source.slice(source.indexOf('function validate('), source.indexOf('// Guarda las apuestas')), context);
vm.runInContext(source.slice(source.indexOf('function readDraftParlay('), source.indexOf('function setEditorStep(')), context);

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
check('Resume ganadas, ventaja en vivo, under, push, pérdidas y datos ausentes', () => {
  const rows = [
    {market:'passingYards',side:'over',line:10,result:{state:'done',value:20,tone:'good'}},
    {market:'spread',result:{state:'live',value:3,tone:'good'}},
    {market:'passingYards',side:'under',line:10,result:{state:'live',value:5}},
    {result:{state:'done',value:0,tone:''}},
    {result:{state:'done',value:2,tone:'bad'}},
    {result:{state:'live',value:null}},
    {result:{state:'pending',value:null}},
    {result:{state:'live',value:50,tone:'good',stale:true}},
  ];
  const result = context.summarizeParlay({legs:rows}, leg=>leg.result);
  assert.equal(result.favorable,3);
  assert.equal(result.counts.unknown,2);
  assert.equal(result.counts.push,1);
  assert.equal(result.counts.lost,1);
  assert.equal(result.counts.pending,1);
});
check('Conserva el anticipo si la selección no cambió', () => {
  const next = {...base}; delete next.moneylineMaxLead; delete next.moneylineEarlyReached;
  const merged = context.preserveLegEvidence(base,next);
  assert.equal(merged.moneylineMaxLead,17);
  assert.equal(merged.moneylineEarlyReached,true);
});
check('Descarta pruebas de otro equipo o de otra regla', () => {
  const next = { ...base, teamId: '12' }; delete next.moneylineMaxLead; delete next.moneylineEarlyReached; delete next.moneylineEvidencePlay;
  assert.equal(context.preserveLegEvidence(base,next).moneylineMaxLead,undefined);
  const changedRule = { ...next, teamId:base.teamId, earlyPayout17:false };
  assert.equal(context.preserveLegEvidence(base,changedRule).moneylineEarlyReached,undefined);
});

function draftFor(leg) {
  const values = {'.event':leg.event,'.date':leg.date,'.gamename':leg.game,'.market':leg.market,'.side':leg.side,
    '.line':String(leg.line),'.spread-range':String(leg.line),'.spread-team-id':leg.teamId,
    '.spread-team-abbr':leg.teamAbbreviation,'.spread-team-name':leg.teamName,'.playerinput':leg.player};
  return { originalLeg:leg, querySelector(selector) {
    return { value:values[selector]??'', checked:leg.earlyPayout17!==false, selectedOptions:[{dataset:{id:leg.playerId}}] };
  }};
}
let draft = draftFor(base);
const nodes = {'#drafts':{querySelectorAll:()=>[]}, '#form':{reportValidity:()=>true}, '#title':{value:'Nombre editado'}, '#review-view':{hidden:false}, '#editor':{close:()=>{}}};
context.$ = selector => nodes[selector];
context.document = {querySelectorAll:()=>[draft]};
check('Guarda el instante UTC al crear o editar tanto apuestas de equipo como de jugador', () => {
  for (const market of ['moneyline','passingYards']) {
    draft=draftFor({...base,market,line:market==='moneyline'?0:249.5,kickoff:'2026-11-18T01:15:00Z'});
    assert.equal(context.readDraftParlay().legs[0].kickoff,'2026-11-18T01:15:00.000Z');
    delete draft.originalLeg.kickoff;
    draft.games=[{id:base.event,date:'2026-11-18T02:15:00Z'}];
    assert.equal(context.readDraftParlay().legs[0].kickoff,'2026-11-18T02:15:00.000Z');
  }
  draft=draftFor(base);
});
check('Editar conserva el identificador, la fecha y el anticipo al revisar y guardar', () => {
  const a = context.readDraftParlay();
  const b = context.readDraftParlay();
  assert.equal(a.id,'saved-id'); assert.equal(b.id,'saved-id');
  assert.equal(a.legs[0].date,base.date);
  assert.equal(a.legs[0].moneylineEvidencePlay,'saved-proof');
  assert.equal(a.name,'Nombre editado');
});
check('Crear sigue generando un nuevo parlay', () => {
  context.editingParlayId=null;
  assert.equal(context.readDraftParlay().id,'new-id');
  context.editingParlayId='saved-id';
});
context.parlays = [{id:'saved-id',name:'Anterior',legs:[base]},{id:'other',name:'Otro',legs:[base]}];
context.render = () => {}; context.refresh = () => {}; context.setEditorStep = () => {};
context.toast = () => {}; let saves = 0; context.persist = () => {saves++;return true;};
vm.runInContext(source.slice(source.indexOf('$("#form").onsubmit ='), source.indexOf('document.querySelectorAll("[data-filter]")',source.indexOf('$("#form").onsubmit ='))), context);
check('Guardar sustituye el parlay sin duplicarlo ni alterar los demás', () => {
  nodes['#form'].onsubmit({preventDefault(){}});
  assert.equal(context.parlays.length,2);
  assert.equal(context.parlays[0].name,'Nombre editado');
  assert.equal(context.parlays[1].name,'Otro');
  assert.equal(saves,1);
});
check('Un fallo al guardar conserva el estado anterior', () => {
  const before = context.parlays;
  nodes['#title'].value='No debe guardarse';
  context.persist=()=>false;
  nodes['#form'].onsubmit({preventDefault(){}});
  assert.equal(context.parlays,before);
  assert.equal(context.parlays[0].name,'Nombre editado');
});
console.log(`${checks} checks passed`);

