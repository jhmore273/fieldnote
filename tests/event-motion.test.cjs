const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({console,Map,Set,document:{hidden:false,querySelector:()=>({})},
  fieldnoteMotionPreference:{matches:false},ResizeObserver:class{observe(){}}});
vm.runInContext(fs.readFileSync('public/event-motion.js','utf8'),context);
const frame=(scope='personal:all',values=[['a','218','live']],cards=['one','two'])=>({scope,
  legs:new Map(values.map(([key,value,state])=>[key,{value,state}])),cards:new Map(cards.map(key=>[key,{}]))});
let before=frame(),after=frame();
assert.equal(context.planEventMotion(before,after).data.length,0);
assert.equal(context.planEventMotion(before,after).states.length,0);
after=frame('personal:all',[['a','234','live']]);
assert.equal(context.planEventMotion(before,after).data.length,1);
assert.equal(context.planEventMotion(before,after).states.length,0);
after=frame('personal:all',[['a','280','favorable']]);
assert.equal(context.planEventMotion(before,after).states.length,1);
assert.equal(context.planEventMotion(after,before).data.length,1);
assert.equal(context.planEventMotion(after,before).states.length,1);
after=frame('personal:pending',[['a','280','favorable']],['two']);
assert.equal(context.planEventMotion(before,after).filtered,true);
assert.equal(context.planEventMotion(before,after).data.length,0);
assert.equal(context.planEventMotion(before,after).states.length,0);
assert.deepEqual(Array.from(context.planEventMotion(before,frame('personal:all',[],['one','two','three'])).added),['three']);
assert.deepEqual(Array.from(context.planEventMotion(before,frame('personal:all',[],['one'])).removed),['two']);
assert.equal(context.planEventMotion(frame('personal:all',[['a','','pending']]),frame()).data.length,0);
assert.equal(context.motionEnabled(),true);
context.fieldnoteMotionPreference.matches=true;
assert.equal(context.motionEnabled(),false);
context.fieldnoteMotionPreference.matches=false; context.document.hidden=true;
assert.equal(context.motionEnabled(),false);
console.log('PASS: datos iguales, incremento, corrección, estados, filtros, nuevas tarjetas, eliminación y movimiento reducido.');
