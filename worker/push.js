import * as webpush from 'web-push';
import testCases from '../public/notification-test-cases.json' with {type:'json'};
import {validWatch,watchKey,ruleUpdate,parlayResult} from './notification-rules.js';

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
    if (Number(request.headers.get('Content-Length')) > 64000) return new Response('Demasiados datos', {status:413,headers});
    const id = env.DEVICES.idFromName(token);
    const response = await env.DEVICES.get(id).fetch(request);
    return new Response(response.body, {status:response.status, headers:{...headers,'Content-Type':'application/json'}});
  }
};
export class Device {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; }
  async queueNotice(payload,scope) {
    const pending=await this.ctx.storage.get('pendingNotices') || [];
    pending.push({id:crypto.randomUUID(),due:Date.now()+60000,payload,scope});
    await this.ctx.storage.put('pendingNotices',pending);
    return true;
  }
  async armAlarm(next) {
    const pending=await this.ctx.storage.get('pendingNotices') || [];
    const earliest=Math.min(next,...pending.map(n=>n.due));
    await this.ctx.storage.setAlarm(Math.max(Date.now()+1,earliest));
  }
  async flushNotices(subscription) {
    const pending=await this.ctx.storage.get('pendingNotices') || [];
    for(const notice of pending){
      if(notice.due>Date.now())continue;
      if(!(await this.ctx.storage.get('subscription')))return;
      const scope=notice.scope;
      const eligible=scope.kind==='pick'
        ? (await this.ctx.storage.get('picks') || []).some(p=>watchKey(p)===scope.key)
        : scope.kind==='event'
          ? (await this.ctx.storage.get('events') || []).includes(scope.id)
          : (await this.ctx.storage.get('parlays') || []).some(p=>p.id===scope.id && p.picks.slice().sort().join('|')===scope.keys);
      const sent=eligible?await this.send(subscription,notice.payload):true;
      if(!(await this.ctx.storage.get('subscription')))return;
      // Relee la cola: una sincronización puede ocurrir mientras se envía el push.
      const current=await this.ctx.storage.get('pendingNotices') || [];
      await this.ctx.storage.put('pendingNotices',sent?current.filter(n=>n.id!==notice.id):current.map(n=>n.id===notice.id?{...n,due:Date.now()+30000}:n));
    }
  }
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
      return Response.json({delivery:await this.ctx.storage.get('testDelivery') || await this.ctx.storage.get('delivery') || null,pending:!!(await this.ctx.storage.get('testAt'))});
    if (request.method === 'DELETE' && path === '/subscription') {
      await this.ctx.storage.deleteAll(); await this.ctx.storage.deleteAlarm();
      return Response.json({ok:true});
    }
    if (request.method !== 'POST') return Response.json({error:'Ruta no disponible'}, {status:404});
    if (path === '/test') {
      const s = await this.ctx.storage.get('subscription');
      if (!s) return Response.json({error:'Activa las notificaciones primero'}, {status:400});
      let testCase='general';
      try {
        const raw=await request.text();if(raw.length>256)throw Error();
        if(raw)testCase=JSON.parse(raw).type || 'general';
      }catch{return Response.json({error:'Prueba inválida'}, {status:400});}
      if(!testCases.some(t=>t.id===testCase))return Response.json({error:'Tipo de prueba no disponible'}, {status:400});
      const last = await this.ctx.storage.get('lastTest') || 0;
      if (Date.now()-last < 30000) return Response.json({error:'Espera 30 segundos entre pruebas'}, {status:429});
      await this.ctx.storage.put('lastTest', Date.now());
      await this.ctx.storage.put('delivery',{state:'queued',at:Date.now()});
      await this.ctx.storage.put('testDelivery',{state:'queued',at:Date.now()});
      await this.ctx.storage.put('testCase',testCase);
      await this.ctx.storage.put('testAt', Date.now()+10000);
      await this.armAlarm(Date.now()+10000);
      return Response.json({ok:true});
    }
    if (path !== '/subscription') return Response.json({error:'Ruta no disponible'}, {status:404});
    let body;
    try { const raw=await request.text(); if(raw.length>64000) throw Error(); body=JSON.parse(raw); }
    catch {return Response.json({error:'Datos inválidos'}, {status:400});}
    if (!validSubscription(body.subscription) || !Array.isArray(body.events) || body.events.length>40)
      return Response.json({error:'Suscripción inválida'}, {status:400});
    const events = [...new Set(body.events)].filter(id => /^\d{1,12}$/.test(id));
    if(body.picks!==undefined && (!Array.isArray(body.picks) || body.picks.length>100 || body.picks.some(p=>!validWatch(p,events))))
      return Response.json({error:'Selecciones para avisos inválidas'}, {status:400});
    const picks=[...new Map((body.picks || []).map(p=>[watchKey(p),{event:p.event,playerId:p.playerId || null,teamId:p.teamId || null,market:p.market,side:p.side,line:p.line,player:p.player.trim(),earlyPayout17:p.earlyPayout17}])).values()];
    const keys=new Set(picks.map(watchKey));
    const parlays=body.parlays || [];
    if(!Array.isArray(parlays) || parlays.length>40 || parlays.some(p=>!p || typeof p.id!=='string' || p.id.length>128 || typeof p.name!=='string' || p.name.length>80 || !Array.isArray(p.picks) || !p.picks.length || p.picks.length>100 || p.picks.some(k=>!keys.has(k))))return Response.json({error:'Parlays inválidos'}, {status:400});
    await this.ctx.storage.put({subscription:body.subscription,events,picks,parlays,expires:Date.now()+90*86400000});
    const testAt=await this.ctx.storage.get('testAt');
    await this.armAlarm(testAt || Date.now()+15000);
    return Response.json({ok:true});
  }
  async alarm() {
    const s=await this.ctx.storage.get('subscription');
    if (!s) return;
    if (Date.now() > await this.ctx.storage.get('expires')) { await this.ctx.storage.deleteAll(); return; }
    await this.flushNotices(s);
    if(!(await this.ctx.storage.get('subscription')))return;
    const testAt = await this.ctx.storage.get('testAt');
    if (testAt && testAt <= Date.now()) {
      await this.ctx.storage.delete('testAt');
      const id=await this.ctx.storage.get('testCase') || 'general';
      const example=testCases.find(t=>t.id===id) || testCases[0];
      const ok=await this.send(s,{title:'[PRUEBA] '+example.title,body:example.body+' Simulación: no modifica tus picks.',tag:'fieldnote-test',url:'/'});
      await this.ctx.storage.put('testDelivery',{state:ok?'accepted':'failed',at:Date.now(),code:(await this.ctx.storage.get('delivery'))?.code || null});
    }
    const events=await this.ctx.storage.get('events') || [];
    const picks=await this.ctx.storage.get('picks') || [];
    let active=false;
    for (const id of events) {
      try {
        const previous=await this.ctx.storage.get('event:'+id);
        if(previous?.completed && !previous.retry){
          const results=await Promise.all(picks.filter(p=>p.event===id).map(p=>this.ctx.storage.get('result:'+watchKey(p))));
          if(results.every(r=>r?.done && r.outcome))continue;
        }
        const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+id,{signal:AbortSignal.timeout(12000)});
        if (!r.ok) continue;
        const data=await r.json(), c=data.header?.competitions?.[0];
        if (!c?.status?.type || !c.date) continue;
        const current={completed:!!c.status.type.completed,state:c.status.type.state,date:c.date};
        let retry=false;
        for(const pick of picks.filter(p=>p.event===id)) {
          const key=watchKey(pick),old=await this.ctx.storage.get('rule:'+key) || {};
          // Conserva los avisos de línea ya enviados por la versión anterior.
          if(['passingYards','completions','rushingYards','rushingAttempts','receivingYards','receptions'].includes(pick.market) &&
             await this.ctx.storage.get('sent:line:'+key.slice(0,-1)))old.level=100;
          const update=ruleUpdate(data,pick,old);
          await this.ctx.storage.put('result:'+key,update.result);
          const eligible=current.state==='in' || (current.completed && previous && (!previous.completed || previous.retry));
          if(!update.notification || !eligible || await this.queueNotice(update.notification,{kind:'pick',key}))await this.ctx.storage.put('rule:'+key,update.state);
          else {
            retry=true;
            await this.ctx.storage.put('rule:'+key,{...old,maxLead:update.state.maxLead,earlyReached:update.state.earlyReached});
          }
          if(!(await this.ctx.storage.get('subscription')))return;
        }
        current.retry=retry;
        const kind=alertKind(previous,current);
        const name=c.competitors?.map(t=>t.team?.abbreviation).join(' vs. ') || 'Tu partido';
        const key='sent:'+id+':'+kind;
        if(kind==='start' && !(await this.ctx.storage.get(key))) {
          const body=kind==='start' ? name+' comienza en menos de 15 minutos.' : name+' terminó. Revisa tus selecciones; los resultados son provisionales.';
          if(await this.queueNotice({title:kind==='start'?'Tu partido está por comenzar':'Partido terminado',body,tag:id+'-'+kind,url:'/?event='+id},{kind:'event',id}))
            await this.ctx.storage.put(key,true);
        }
        await this.ctx.storage.put('event:'+id,current);
        if(!current.completed && (current.state==='in' || Date.parse(current.date)-Date.now()<30*60000)) active=true;
      } catch { /* El siguiente ciclo reintenta sin inventar resultados. */ }
    }
    for(const parlay of await this.ctx.storage.get('parlays') || []) {
      const fingerprint=parlay.id+':'+parlay.picks.slice().sort().join('|');
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint));
      const key=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
      const results=await Promise.all(parlay.picks.map(k=>this.ctx.storage.get('result:'+k)));
      if(results.some(r=>!r?.done))await this.ctx.storage.put('active:'+key,true);
      const text=parlayResult(results);
      if(text && await this.ctx.storage.get('active:'+key) && !(await this.ctx.storage.get('parlay-sent:'+key))) {
        if(await this.queueNotice({title:'Parlay terminado · '+parlay.name,body:text+' Resultado provisional; confirma la liquidación.',tag:'parlay:'+key,url:'/'},{kind:'parlay',id:parlay.id,keys:parlay.picks.slice().sort().join('|')}))await this.ctx.storage.put('parlay-sent:'+key,true);
        if(!(await this.ctx.storage.get('subscription')))return;
      }
    }
    if(await this.ctx.storage.get('subscription')) {
      const pendingTest=await this.ctx.storage.get('testAt');
      await this.armAlarm(pendingTest || Date.now()+(active?60000:5*60000));
    }
  }
}
