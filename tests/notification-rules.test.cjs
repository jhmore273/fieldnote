const {test}=require('node:test'),assert=require('node:assert/strict');
const pick=(market,extra={})=>({event:'401',playerId:'42',teamId:'1',player:'Jugador',market,side:'over',line:49.5,...extra});
function game(done=false,own=10,other=7){return {header:{competitions:[{date:new Date().toISOString(),status:{type:{state:done?'post':'in',completed:done}},competitors:[{team:{id:'1',abbreviation:'A'},homeAway:'home',score:String(own)},{team:{id:'2',abbreviation:'B'},homeAway:'away',score:String(other)}]}]},scoringPlays:[],boxscore:{players:[]}};}
function stat(market,value,done=false){const d=game(done);const groups={passingYards:['passing','passingYards'],completions:['passing','completions'],passingTouchdowns:['passing','passingTouchdowns'],passingInterceptions:['passing','interceptions'],rushingYards:['rushing','rushingYards'],rushingAttempts:['rushing','rushingAttempts'],receivingYards:['receiving','receivingYards'],receptions:['receiving','receptions'],anytimeTouchdown:['receiving','receivingTouchdowns']};const [name,key]=groups[market];d.boxscore.players=[{team:{id:'1'},statistics:[{name,keys:[key],athletes:[{athlete:{id:'42',displayName:'Jugador'},stats:[String(value)]}]}]}];return d;}
test('Hitos, saltos, under, correcciones, igualdad y datos ausentes',async()=>{
 const {ruleUpdate}=await import('../worker/notification-rules.js');
 for(const market of ['passingYards','completions','rushingYards','rushingAttempts','receivingYards','receptions']){
  let state={};for(const [v,level] of [[13,25],[25,50],[38,75],[50,100]]){const r=ruleUpdate(stat(market,v),pick(market),state);assert.equal(r.state.level,level);assert.ok(r.notification);state=r.state;}
  assert.equal(ruleUpdate(stat(market,60),pick(market),state).notification,null);
  assert.equal(ruleUpdate(stat(market,13),pick(market),state).notification,null);
  assert.equal(ruleUpdate(stat(market,38),pick(market)).state.level,75);
 }
 assert.match(ruleUpdate(stat('receivingYards',50),pick('receivingYards',{side:'under'})).notification.title,/Límite superado/);
 assert.equal(ruleUpdate(stat('receivingYards',50),pick('receivingYards',{line:50}),{level:75}).notification,null);
 assert.equal(ruleUpdate(game(),pick('receivingYards')).notification,null);
});
test('Contadores TD, intercepciones y anytime; incrementos sin duplicados',async()=>{
 const {ruleUpdate}=await import('../worker/notification-rules.js');
 for(const market of ['passingTouchdowns','passingInterceptions','anytimeTouchdown']){
  const p=pick(market,{line:.5});const one=ruleUpdate(stat(market,1),p);assert.ok(one.notification);assert.equal(one.state.high,1);
  assert.equal(ruleUpdate(stat(market,1),p,one.state).notification,null);
  assert.equal(ruleUpdate(stat(market,0),p,one.state).notification,null);
  assert.match(ruleUpdate(stat(market,2),p,one.state).notification.body,/\(\+1\)/);
 }
});
test('Money Line, anticipo histórico +17, spread, totales y primer TD',async()=>{
 const {ruleUpdate}=await import('../worker/notification-rules.js');
 const ml=pick('moneyline',{line:0,earlyPayout17:true});
 assert.equal(ruleUpdate(game(false,10,7),ml).notification,null);
 const early=ruleUpdate(game(false,24,7),ml);assert.match(early.notification.title,/anticipo/);
 assert.equal(ruleUpdate(game(true,24,28),ml,early.state).result.outcome,'won');
 assert.equal(ruleUpdate(game(true,24,28),ml,early.state).notification,null);
 assert.equal(ruleUpdate(game(false,24,7),{...ml,earlyPayout17:false}).notification,null);
 assert.ok(ruleUpdate(game(true,24,7),{...ml,earlyPayout17:false}).notification);
 const spread=pick('spread',{line:-3});assert.equal(ruleUpdate(game(false,24,7),spread).notification,null);assert.ok(ruleUpdate(game(true,24,7),spread).notification);assert.equal(ruleUpdate(game(true,10,7),spread).result.outcome,'push');
 for(const market of ['totalPoints','teamTotalPoints']){
  const over=pick(market,{line:20.5});assert.ok(ruleUpdate(game(false,24,7),over).notification);
  const under=pick(market,{line:40.5,side:'under'});assert.equal(ruleUpdate(game(false,24,7),under).notification,null);assert.ok(ruleUpdate(game(true,24,7),under).notification);
 }
 const td=game();td.scoringPlays=[{scoringType:{name:'touchdown'},scorer:{id:'42'},period:{number:1},clock:{displayValue:'10:00'}}];
 const first=pick('firstTouchdown',{line:.5});assert.match(ruleUpdate(td,first).notification.body,/Sí:/);assert.match(ruleUpdate(td,{...first,playerId:'43'}).notification.body,/No:/);
 const fg=game();fg.scoringPlays=Array.from({length:2},()=>({type:{id:'59'}}));assert.equal(ruleUpdate(fg,pick('totalFieldGoals',{line:3.5})).state.level,50);
});
test('Cierre de parlay: espera todos, derrota, push y desconocido',async()=>{
 const {parlayResult}=await import('../worker/notification-rules.js');const win={done:true,outcome:'won'};
 assert.equal(parlayResult([win,{done:false}]),null);assert.match(parlayResult([win,win]),/todas/);assert.match(parlayResult([win,{done:true,outcome:'lost'}]),/No se cumplió/);assert.match(parlayResult([win,{done:true,outcome:'push'}]),/push/);assert.equal(parlayResult([win,{done:true,outcome:null}]),null);
});
test('Ciclo real del Worker: espera partidos, cierre una vez, sin aviso genérico de final',async()=>{
 const {Device}=await import('../worker/push.js'),{watchKey}=await import('../worker/notification-rules.js');
 const a=pick('receivingYards'),b=pick('spread',{event:'402',line:-3});
 const map=new Map([['subscription',{}],['expires',Date.now()+86400000],['events',['401','402']],['picks',[a,b]],['parlays',[{id:'p',name:'Prueba',picks:[watchKey(a),watchKey(b)]}]]]);
 const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),setAlarm:async()=>{}};
 const worker=new Device({storage},{}),sent=[];worker.send=async(s,p)=>{sent.push(p);return true;};
 worker.queueNotice=async payload=>worker.send({},payload);
 let phase=0;const original=global.fetch;
 global.fetch=async url=>{
  const id=new URL(url).searchParams.get('event');
  if(id==='401')return Response.json(stat('receivingYards',phase?60:13,phase>0));
  const d=game(phase>1,24,7);if(phase===0)d.header.competitions[0].status.type={state:'pre',completed:false};return Response.json(d);
 };
 try{
  await worker.alarm();assert.equal(sent.filter(x=>x.title.startsWith('Parlay terminado')).length,0);
  phase=1;await worker.alarm();assert.equal(sent.filter(x=>x.title.startsWith('Parlay terminado')).length,0);
  phase=2;await worker.alarm();assert.equal(sent.filter(x=>x.title.startsWith('Parlay terminado')).length,1);
  await worker.alarm();assert.equal(sent.filter(x=>x.title.startsWith('Parlay terminado')).length,1);
  assert.equal(sent.some(x=>x.title==='Partido terminado'),false);
 }finally{global.fetch=original;}
});
