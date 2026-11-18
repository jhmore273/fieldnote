const {test}=require('node:test'),assert=require('node:assert/strict');
test('Línea superada: dato estricto, límite, under y pases completos',async()=>{
 const {lineNotification,lineValue,validPick}=await import('../worker/line-alerts.js');
 const pick={event:'401',playerId:'42',player:'Nico Collins',market:'receivingYards',side:'over',line:49.5};
 const data=raw=>({boxscore:{players:[{statistics:[{name:'receiving',keys:['receivingYards'],athletes:[{athlete:{id:'42'},stats:[raw]}]}]}]}});
 assert.equal(validPick(pick,['401']),true);assert.equal(validPick({...pick,side:'under'},['401']),false);
 assert.equal(lineNotification(data('49'),pick),null);
 assert.match(lineNotification(data('50'),pick).body,/50 yardas de recepción/);
 assert.match(lineNotification(data('50'),pick).body,/provisional/);
 assert.equal(lineNotification(data('50'),{...pick,line:50}),null);
 assert.equal(lineNotification(data('50'),{...pick,side:'under'}),null);
 for(const raw of [null,'','--','garbage'])assert.equal(lineValue(data(raw),pick),null);
 assert.equal(lineValue(data('0'),pick),0);
 assert.equal(lineNotification(data('50'),{...pick,playerId:'other'}),null);
 const completions={boxscore:{players:[{statistics:[{name:'passing',keys:['completions/passingAttempts'],athletes:[{athlete:{id:'42'},stats:['21/30']}]}]}]}};
 assert.equal(lineValue(completions,{...pick,market:'completions'}),21);
});
test('Alarmas: una sola notificación por selección, reintento y eliminación',async()=>{
 const {Device}=await import('../worker/push.js');
 const pick={event:'401',playerId:'42',player:'Nico Collins',market:'receivingYards',side:'over',line:49.5};
 const map=new Map([['subscription',{}],['expires',Date.now()+86400000],['events',['401']],['picks',[pick]]]);
 const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),setAlarm:async()=>{}};
 const device=new Device({storage},{});let sent=0,accepted=true,value='49';
 device.send=async p=>{sent++;return accepted;};
 // send recibe la suscripción y el contenido; comprobamos también el mensaje.
 device.send=async(s,p)=>{assert.match(p.title,/Línea superada/);sent++;return accepted;};
 const original=global.fetch;
 global.fetch=async()=>Response.json({header:{competitions:[{date:new Date().toISOString(),status:{type:{state:'in',completed:false}},competitors:[]}]},boxscore:{players:[{statistics:[{name:'receiving',keys:['receivingYards'],athletes:[{athlete:{id:'42'},stats:[value]}]}]}]}});
 try{
  await device.alarm();assert.equal(sent,0);
  value='50';accepted=false;await device.alarm();assert.equal(sent,1);
  accepted=true;await device.alarm();assert.equal(sent,2);
  value='49';await device.alarm();value='60';await device.alarm();assert.equal(sent,2,'No repite después de una corrección');
  map.set('picks',[]);await device.alarm();assert.equal(sent,2);
 }finally{global.fetch=original;}
});
