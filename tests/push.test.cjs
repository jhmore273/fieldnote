const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createECDH,randomBytes}=require('node:crypto');
const webpush=require('web-push');
const ece=require('http_ece');
test('Push: permisos, cifrado, aviso diferido, baja y transiciones',async()=>{
 const {default:worker,Device,alertKind,validSubscription}=await import('../worker/push.js');
 const keys=webpush.generateVAPIDKeys(),receiver=createECDH('prime256v1');receiver.generateKeys();
 const auth=randomBytes(16).toString('base64url');
 const sub={endpoint:'https://web.push.apple.com/test',keys:{auth,p256dh:receiver.getPublicKey().toString('base64url')}};
 assert.equal(validSubscription(sub),true);
 assert.equal(validSubscription({...sub,endpoint:'https://127.0.0.1/internal'}),false);
 const now=Date.now(),pre={state:'pre',date:new Date(now+10*60000).toISOString(),completed:false};
 assert.equal(alertKind(null,pre,now),'start');
 assert.equal(alertKind(null,{...pre,completed:true},now),null);
 assert.equal(alertKind(pre,{...pre,completed:true},now),'final');
 assert.equal(alertKind({...pre,completed:true},{...pre,completed:true},now),null);
 const map=new Map();let alarm;
 const storage={get:async k=>map.get(k),put:async(k,v)=>typeof k==='object'?Object.entries(k).forEach(([a,b])=>map.set(a,b)):map.set(k,v),delete:async k=>map.delete(k),deleteAll:async()=>map.clear(),setAlarm:async x=>alarm=x,deleteAlarm:async()=>alarm=null};
 const env={APP_ORIGIN:'https://fieldnote-89i.pages.dev',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey};
 const device=new Device({storage},env);
 const req=(path,body)=>new Request('https://push.example'+path,{method:'POST',body:JSON.stringify(body)});
 assert.equal((await device.fetch(req('/subscription',{subscription:sub,events:['401']}))).status,200);
 assert.ok(alarm>Date.now());
 assert.equal((await device.fetch(req('/test',{}))).status,404);
 assert.equal((await device.fetch(new Request('https://push.example/test-status'))).status,404);
 // Una prueba encolada por una versión anterior no debe enviarse.
 map.set('testAt',Date.now()-1);
 map.set('events',[]);
 await device.queueNotice({title:'Tu partido está por comenzar',tag:'401-start'},{kind:'event',id:'401'});
 map.get('pendingNotices')[0].due=Date.now()-1;
 map.set('events',['401']);
 map.set('event:401',{completed:true});
 const original=global.fetch;let payload;
 global.fetch=async(url,options)=>{
   assert.equal(options.redirect,'manual','Workers solo admite follow o manual');
   assert.equal(url,sub.endpoint);
   assert.match(options.headers.Authorization || options.headers.authorization,/vapid/);
   payload=JSON.parse(ece.decrypt(Buffer.from(options.body),{version:'aes128gcm',privateKey:receiver,authSecret:auth}).toString());
   return new Response(null,{status:201});
 };
 try{await device.alarm();}finally{global.fetch=original;}
 assert.equal(payload.tag,'401-start');assert.deepEqual(map.get('pendingNotices'),[]);
 assert.equal(map.get('delivery').state,'accepted');
 await device.fetch(new Request('https://push.example/subscription',{method:'DELETE'}));assert.equal(map.size,0);assert.equal(alarm,null);
 assert.equal((await worker.fetch(new Request('https://push.example/config'),env)).status,403);
 assert.equal((await worker.fetch(new Request('https://push.example/config',{headers:{Origin:env.APP_ORIGIN}}),env)).status,200);
});
