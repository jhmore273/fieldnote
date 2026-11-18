const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const app = fs.readFileSync('public/app.js','utf8');
const label = {textContent:'',title:''}, row={dataset:{}}, caption={textContent:''};
const button={disabled:false,setAttribute(){},querySelector:()=>caption};
const context=vm.createContext({console,Date,Math,Number,document:{querySelector:()=>row,getElementById:id=>id==='connection'?label:button},
  demoMode:false,busy:false,parlays:[{legs:[{event:'1'},{event:'2'}]}],cache:new Map(),failures:new Set(),
  get:async path=>{if(path.includes('event=2'))throw Error('unavailable');return {header:{}};},
  recordMoneylineEvidence:()=>false,persist:()=>true,$:()=>button});
vm.runInContext(fs.readFileSync('public/design-polish.js','utf8'),context);
context.render=()=>context.renderConnectionStatus();
vm.runInContext(app.slice(app.indexOf('async function refresh()'),app.indexOf('// Obtiene la fecha de hoy')),context);
const leg={market:'passingYards',line:100,side:'over'};
assert.equal(context.legVisualState(leg,{state:'live',value:20,tone:'bad'}),'live');
assert.equal(context.legVisualState(leg,{state:'done',value:20,tone:'bad'}),'lost');
assert.equal(context.legVisualState({...leg,side:'under'},{state:'live',value:20}),'favorable');
assert.equal(context.legVisualState(leg,{state:'pending',value:0}),'pending');
assert.equal(context.legVisualState(leg,{state:'live',value:null}),'unknown');
assert.equal(context.legVisualState(leg,{state:'live',value:200,stale:true}),'unknown');
(async()=>{
  await context.refresh();
  assert.equal(row.dataset.state,'partial');
  assert.match(label.textContent,/incompleta/);
  const lastGood=vm.runInContext('connectionStatus.updatedAt',context);
  context.get=async()=>{throw Error('offline');};
  await context.refresh();
  assert.equal(row.dataset.state,'error');
  assert.equal(vm.runInContext('connectionStatus.updatedAt',context),lastGood);
  context.get=async()=>({header:{}});
  await context.refresh();
  assert.equal(row.dataset.state,'ready');
  assert.equal(context.failures.size,0);
  assert.match(label.textContent,/Actualizado hace/);
  context.demoMode=true;context.renderConnectionStatus();
  assert.equal(row.dataset.state,'demo');
  assert.match(label.textContent,/Sin seguimiento/);
  console.log('PASS: 6 estados de selección; actualización parcial, fallo sin falsa fecha, recuperación y demo.');
})().catch(error=>{console.error(error);process.exit(1);});
