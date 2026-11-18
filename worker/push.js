import * as webpush from 'web-push';

export function validSubscription(s) {
  try {
    const u = new URL(s.endpoint);
    return u.protocol === 'https:' && u.port === '' && !u.username && !u.password &&
      (u.hostname.endsWith('.push.apple.com') || u.hostname === 'fcm.googleapis.com' ||
       u.hostname === 'updates.push.services.mozilla.com' || u.hostname.endsWith('.notify.windows.com')) &&
      /^[\w-]{80,100}$/.test(s.keys.p256dh) && /^[\w-]{20,30}$/.test(s.keys.auth);
  } catch { return false; }
}
export function alertKind(previous, current, now = Date.now()) {
  if (current.completed) return previous && !previous.completed ? 'final' : null;
  const delta = Date.parse(current.date) - now;
  return current.state === 'pre' && delta > 0 && delta <= 15 * 60000 ? 'start' : null;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {'Access-Control-Allow-Origin': env.APP_ORIGIN,
      'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
      'Vary':'Origin', 'Cache-Control':'no-store'};
    if (origin !== env.APP_ORIGIN) return new Response('Origen no permitido', {status:403});
    if (request.method === 'OPTIONS') return new Response(null, {headers});
    if (new URL(request.url).pathname === '/config' && request.method === 'GET')
      return Response.json({publicKey: env.VAPID_PUBLIC_KEY}, {headers});
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!/^[a-f0-9]{64}$/.test(token || '')) return new Response('No autorizado', {status:401,headers});
    if (Number(request.headers.get('Content-Length')) > 24000) return new Response('Demasiados datos', {status:413,headers});
    const id = env.DEVICES.idFromName(token);
    const response = await env.DEVICES.get(id).fetch(request);
    return new Response(response.body, {status:response.status, headers:{...headers,'Content-Type':'application/json'}});
  }
};
export class Device {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; }
  async send(subscription, payload) {
    try {
      const details = webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
        vapidDetails:{subject:this.env.APP_ORIGIN, publicKey:this.env.VAPID_PUBLIC_KEY, privateKey:this.env.VAPID_PRIVATE_KEY},
        TTL:900, timeout:12000
      });
      const response = await fetch(details.endpoint, {method:'POST',headers:details.headers,body:details.body,redirect:'manual',signal:AbortSignal.timeout(12000)});
      if(!response.ok) throw Object.assign(new Error('Push rechazado'),{statusCode:response.status});
      await this.ctx.storage.put('delivery',{state:'accepted',at:Date.now()});
      return true;
    } catch (e) {
      console.error('push_send_failed',e.name,e.code || '',e.message.replace(/https?:\/\/\S+/g,'[endpoint]'));
      if (e.statusCode === 404 || e.statusCode === 410) {
        await this.ctx.storage.deleteAll();
        await this.ctx.storage.deleteAlarm();
      }
      await this.ctx.storage.put('delivery',{state:'failed',at:Date.now(),code:e.statusCode || e.code || 'send_error'});
      return false;
    }
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if(request.method === 'GET' && path === '/test-status')
      return Response.json({delivery:await this.ctx.storage.get('delivery') || null,pending:!!(await this.ctx.storage.get('testAt'))});
    if (request.method === 'DELETE' && path === '/subscription') {
      await this.ctx.storage.deleteAll(); await this.ctx.storage.deleteAlarm();
      return Response.json({ok:true});
    }
    if (request.method !== 'POST') return Response.json({error:'Ruta no disponible'}, {status:404});
    if (path === '/test') {
      const s = await this.ctx.storage.get('subscription');
      if (!s) return Response.json({error:'Activa las notificaciones primero'}, {status:400});
      const last = await this.ctx.storage.get('lastTest') || 0;
      if (Date.now()-last < 30000) return Response.json({error:'Espera 30 segundos entre pruebas'}, {status:429});
      await this.ctx.storage.put('lastTest', Date.now());
      await this.ctx.storage.put('delivery',{state:'queued',at:Date.now()});
      await this.ctx.storage.put('testAt', Date.now()+10000);
      await this.ctx.storage.setAlarm(Date.now()+10000);
      return Response.json({ok:true});
    }
    if (path !== '/subscription') return Response.json({error:'Ruta no disponible'}, {status:404});
    let body;
    try { const raw=await request.text(); if(raw.length>24000) throw Error(); body=JSON.parse(raw); }
    catch {return Response.json({error:'Datos inválidos'}, {status:400});}
    if (!validSubscription(body.subscription) || !Array.isArray(body.events) || body.events.length>40)
      return Response.json({error:'Suscripción inválida'}, {status:400});
    const events = [...new Set(body.events)].filter(id => /^\d{1,12}$/.test(id));
    await this.ctx.storage.put({subscription:body.subscription,events,expires:Date.now()+90*86400000});
    await this.ctx.storage.setAlarm(Date.now()+15000);
    return Response.json({ok:true});
  }
  async alarm() {
    const s=await this.ctx.storage.get('subscription');
    if (!s) return;
    if (Date.now() > await this.ctx.storage.get('expires')) { await this.ctx.storage.deleteAll(); return; }
    const testAt = await this.ctx.storage.get('testAt');
    if (testAt && testAt <= Date.now()) {
      await this.ctx.storage.delete('testAt');
      await this.send(s,{title:'Fieldnote · prueba',body:'¡Listo! Puedes recibir avisos con Fieldnote cerrada.',tag:'fieldnote-test',url:'/'});
    }
    const events=await this.ctx.storage.get('events') || [];
    let active=false;
    for (const id of events) {
      try {
        const previous=await this.ctx.storage.get('event:'+id);
        if (previous?.completed) continue;
        const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+id,{signal:AbortSignal.timeout(12000)});
        if (!r.ok) continue;
        const data=await r.json(), c=data.header?.competitions?.[0];
        if (!c?.status?.type || !c.date) continue;
        const current={completed:!!c.status.type.completed,state:c.status.type.state,date:c.date};
        const kind=alertKind(previous,current);
        const name=c.competitors?.map(t=>t.team?.abbreviation).join(' vs. ') || 'Tu partido';
        const key='sent:'+id+':'+kind;
        if(kind && !(await this.ctx.storage.get(key))) {
          const body=kind==='start' ? name+' comienza en menos de 15 minutos.' : name+' terminó. Revisa tus selecciones; los resultados son provisionales.';
          if(await this.send(s,{title:kind==='start'?'Tu partido está por comenzar':'Partido terminado',body,tag:id+'-'+kind,url:'/?event='+id}))
            await this.ctx.storage.put(key,true);
        }
        await this.ctx.storage.put('event:'+id,current);
        if(!current.completed && (current.state==='in' || Date.parse(current.date)-Date.now()<30*60000)) active=true;
      } catch { /* El siguiente ciclo reintenta sin inventar resultados. */ }
    }
    if(await this.ctx.storage.get('subscription')) {
      const pendingTest=await this.ctx.storage.get('testAt');
      await this.ctx.storage.setAlarm(pendingTest || Date.now()+(active?60000:5*60000));
    }
  }
}
