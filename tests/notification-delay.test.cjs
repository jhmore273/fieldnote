const {test}=require('node:test'),assert=require('node:assert/strict');
test('Retraso persistente: 59 segundos sin envío, 60 con envío y sin duplicados',async()=>{
 const {Device}=await import('../worker/push.js');let now=1800000000000,alarm;
 const original=Date.now;Date.now=()=>now;
 const pick={event:'401',playerId:'42',market:'receivingYards',side:'over',line:49.5}, {watchKey}=await import('../worker/notification-rules.js');
 const map=new Map([['subscription',{}],['picks',[pick]]]);
 const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),setAlarm:async n=>alarm=n};
 const ctx={storage};let sent=[];
 try{
  const a=new Device(ctx,{});await a.queueNotice({title:'avance'},{kind:'pick',key:watchKey(pick)});await a.armAlarm(now+300000);assert.equal(alarm,now+60000);
  const restarted=new Device(ctx,{});restarted.send=async(s,p)=>{sent.push(p);return true;};
  now+=59000;await restarted.flushNotices({});assert.equal(sent.length,0);
  now+=1000;await restarted.flushNotices({});assert.equal(sent.length,1);await restarted.flushNotices({});assert.equal(sent.length,1);
  await restarted.queueNotice({title:'anulado'},{kind:'pick',key:watchKey(pick)});map.set('picks',[]);now+=60000;await restarted.flushNotices({});assert.equal(sent.length,1);
  assert.deepEqual(map.get('pendingNotices'),[]);
 }finally{Date.now=original;}
});
test('Reintenta el envío fallido y no pospone avisos pendientes al programar otra alarma',async()=>{
 const {Device}=await import('../worker/push.js');let now=1800000000000,alarm,accepted=false,sends=0;
 const original=Date.now;Date.now=()=>now;
 const map=new Map([['subscription',{}],['events',['401']]]),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),setAlarm:async n=>alarm=n};
 const d=new Device({storage},{});d.send=async()=>{sends++;return accepted;};
 try{
  await d.queueNotice({title:'inicio'},{kind:'event',id:'401'});now+=60000;await d.flushNotices({});assert.equal(sends,1);assert.equal(map.get('pendingNotices')[0].due,now+30000);
  await d.armAlarm(now+300000);assert.equal(alarm,now+30000);
  now+=29999;await d.flushNotices({});assert.equal(sends,1);now++;accepted=true;await d.flushNotices({});assert.equal(sends,2);assert.equal(map.get('pendingNotices').length,0);
 }finally{Date.now=original;}
});
