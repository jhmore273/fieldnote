// Solo overs numéricos: un under favorable durante el juego aún puede perderse.
export const lineMarkets = {
  passingYards:['passing','passingYards','yardas de pase'],
  passingTouchdowns:['passing','passingTouchdowns','pases de touchdown'],
  completions:['passing','completions','pases completos'],
  passingInterceptions:['passing','interceptions','intercepciones lanzadas'],
  rushingYards:['rushing','rushingYards','yardas por tierra'],
  rushingAttempts:['rushing','rushingAttempts','intentos de carrera'],
  receivingYards:['receiving','receivingYards','yardas de recepción'],
  receptions:['receiving','receptions','recepciones']
};
export function validPick(p, events) {
  return p && events.includes(p.event) && /^\d{1,12}$/.test(p.playerId) &&
    Object.hasOwn(lineMarkets,p.market) && p.side==='over' &&
    typeof p.line==='number' && Number.isFinite(p.line) && p.line>=0 && p.line<=10000 &&
    typeof p.player==='string' && p.player.trim().length>0 && p.player.length<=80;
}
export function pickKey(p) {
  return [p.event,p.playerId,p.market,p.side,p.line].join(':');
}
export function lineValue(data,pick) {
  const definition=lineMarkets[pick.market];if(!definition)return null;
  const [group,key]=definition,rows=[];
  for(const team of data?.boxscore?.players || [])
    for(const stats of team.statistics || []) {
      if(stats.name!==group)continue;
      for(const athlete of stats.athletes || [])
        if(String(athlete.athlete?.id)===pick.playerId)rows.push({stats,athlete});
    }
  if(rows.length!==1)return null;
  const {stats,athlete}=rows[0];let index=(stats.keys || []).indexOf(key);
  if(key==='completions' && index<0){
    index=(stats.keys || []).indexOf('completions/passingAttempts');
    const raw=athlete.stats?.[index];
    if(typeof raw!=='string' || !/^\d+\s*\/\s*\d+$/.test(raw))return null;
    const [completed,attempts]=raw.split('/').map(Number);
    return completed<=attempts?completed:null;
  }
  const raw=athlete.stats?.[index];
  if(raw==null || String(raw).trim()==='' || raw==='--')return null;
  const number=Number(raw);return Number.isFinite(number)?number:null;
}
export function lineNotification(data,pick) {
  const value=lineValue(data,pick);
  if(pick.side!=='over' || value===null || !(value>pick.line))return null;
  return {title:'🏈 Línea superada · '+pick.player,
    body:`${value} ${lineMarkets[pick.market][2]} · Más de ${pick.line}. Resultado provisional; puede haber correcciones.`,
    tag:'line:'+pickKey(pick),url:'/?event='+encodeURIComponent(pick.event)};
}
