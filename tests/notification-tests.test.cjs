const {test}=require('node:test'),assert=require('node:assert/strict');
const cases=require('../public/notification-test-cases.json');
test('Catálogo de pruebas: selección exacta, simulación aislada y rechazo de tipos ajenos',async()=>{
 const {Device}=await import('../worker/push.js');
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 const map=new Map([['subscription',{}],['expires',Date.now()+86400000],['events',[]],['picks',[{event:'real'}]],['rule:real',{level:50}]]);
 const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),delete:async k=>map.delete(k),setAlarm:async()=>{}};
 const device=new Device({storage},{});let payload;device.send=async(s,p)=>{payload=p;return true;};
 for(const example of cases){
   map.set('lastTest',0);
   const request=new Request('https://test/test',{method:'POST',body:JSON.stringify({type:example.id})});
   assert.equal((await device.fetch(request)).status,200);
   map.set('testAt',Date.now()-1);await device.alarm();
   assert.equal(payload.title,'[PRUEBA] '+example.title);assert.match(payload.body,/Simulación: no modifica tus picks/);
   assert.ok(payload.body.startsWith(example.body));assert.deepEqual(map.get('rule:real'),{level:50});
   const status=await(await device.fetch(new Request('https://test/test-status'))).json();assert.equal(status.delivery.state,'accepted');
 }
 const response=await device.fetch(new Request('https://test/test',{method:'POST',body:JSON.stringify({type:'custom-arbitrary-message'})}));assert.equal(response.status,400);
});
