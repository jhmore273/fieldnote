import {evaluateSelection} from './selection-evaluator.js';
export const watchedMarkets=new Set(['moneyline','spread','totalPoints','teamTotalPoints','passingYards','passingTouchdowns','completions','passingInterceptions','rushingYards','rushingAttempts','receivingYards','receptions','anytimeTouchdown','firstTouchdown','totalFieldGoals']);
const teams=new Set(['moneyline','spread','teamTotalPoints']);
const games=new Set([...teams,'totalPoints','totalFieldGoals']);
const progress=new Set(['passingYards','completions','rushingYards','rushingAttempts','receivingYards','receptions','totalFieldGoals']);
const counters=new Set(['passingTouchdowns','passingInterceptions','anytimeTouchdown']);
const units={passingYards:'yardas de pase',completions:'pases completos',rushingYards:'yardas por tierra',rushingAttempts:'intentos de carrera',receivingYards:'yardas de recepción',receptions:'recepciones',totalFieldGoals:'goles de campo'};
export function validWatch(p,events){
 return p && events.includes(p.event) && watchedMarkets.has(p.market) && ['over','under'].includes(p.side) &&
 Number.isFinite(p.line) && Math.abs(p.line)<=10000 && (p.market==='spread' || p.line>=0) &&
 typeof p.player==='string' && p.player.length>0 && p.player.length<=80 &&
 (!teams.has(p.market) || /^\d{1,4}$/.test(p.teamId || '')) &&
 (games.has(p.market) || /^\d{1,12}$/.test(p.playerId || '')) &&
 (p.earlyPayout17===undefined || typeof p.earlyPayout17==='boolean');
}
export function watchKey(p){return [p.event,p.playerId || p.teamId || 'game',p.market,p.side,p.line,p.market==='moneyline'?p.earlyPayout17!==false:''].join(':');}
export function ruleUpdate(data,p,old={}){
 const leg={...p,moneylineMaxLead:old.maxLead,moneylineEarlyReached:old.earlyReached};
 const r=evaluateSelection(data,leg),done=r.state==='done',v=r.value;
 const state={...old,maxLead:r.maxLead ?? old.maxLead,earlyReached:r.earlyReached ?? old.earlyReached};
 const outcome=r.tone==='good'?'won':r.tone==='bad'?'lost':/push/i.test(r.label)?'push':null;
 const result={done,outcome:done?outcome:null};
 let title=null,body=null;
 const notice=(t,b)=>{title=t;body=b;};
 if(p.market==='moneyline'){
   if(!old.resolved && (r.earlyReached || (done && outcome==='won'))){state.resolved=true;notice(r.earlyReached?'Condición de anticipo +17 cumplida':'Money Line ganada',p.player+' · '+(r.earlyReached?'Alcanzó +17 de ventaja. Confirma el abono con tu casa.':'Ganó al finalizar el partido.'));}
 }else if(p.market==='spread'){
   if(done && outcome==='won' && !old.resolved){state.resolved=true;notice('Spread cubierto',p.player+' cubrió la línea '+p.line+'.');}
 }else if(p.market==='firstTouchdown'){
   if(['Primer TD*','No fue el primero*'].includes(r.label) && v!==null && !old.resolved){state.resolved=true;notice('Primer touchdown · '+p.player,v===1?'Sí: fue el primer anotador de touchdown.':'No: otro jugador anotó el primer touchdown.');}
 }else if(v!==null && r.state!=='pending'){
   if(counters.has(p.market)){
     const high=old.high ?? 0;
     if(v>high){state.high=v;notice('Nueva estadística · '+p.player,`Lleva ${v} ${p.market==='passingTouchdowns'?'pases de touchdown':p.market==='passingInterceptions'?'intercepciones lanzadas':'touchdowns anotados'} (+${v-high}).`);}
   }else if(progress.has(p.market)){
     const level=p.line===0?(v>0?100:0):v>p.line || (p.side==='under' && v===p.line)?100:v>=p.line*.75?75:v>=p.line*.5?50:v>=p.line*.25?25:0;
     if(level>(old.level || 0)){
       state.level=level;
       notice(level===100?(p.side==='under'?(v===p.line?'Límite alcanzado':'Límite superado'):'Línea superada'):'Avance '+level+'% · '+p.player,
         `¡${p.player} lleva ${v} ${units[p.market]}! Línea: ${p.side==='under'?'menos':'más'} de ${p.line} · ${level}%.`);
     }
   }else if(['totalPoints','teamTotalPoints'].includes(p.market)){
     if(v>p.line && !old.resolved){state.resolved=true;notice(p.side==='under'?'Límite de puntos superado':'Línea de puntos superada',`${p.player}: ${v} puntos · ${p.side==='under'?'menos':'más'} de ${p.line}.`);}
     else if(done && outcome==='won' && !old.resolved){state.resolved=true;notice('Total de puntos cumplido',`${p.player}: ${v} puntos · menos de ${p.line}.`);}
   }
 }
 return {result,state,notification:title?{title:'🏈 '+title,body:body+' Resultado provisional.',tag:'pick:'+watchKey(p),url:'/?event='+p.event}:null};
}
export function parlayResult(results){
 if(!results.length || results.some(r=>!r?.done))return null;
 if(results.some(r=>r.outcome==='lost'))return 'No se cumplió: una o más selecciones no acertaron.';
 if(results.some(r=>!r.outcome))return null;
 return results.some(r=>r.outcome==='push')?'Terminó con selecciones empatadas / push. Confirma el ajuste con tu casa.':'¡Se cumplieron todas tus selecciones!';
}
