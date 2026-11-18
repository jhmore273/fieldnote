const fs=require('node:fs');const source=fs.readFileSync('public/app.js','utf8');
const names=['evaluate','scoreNumber','contextForLeg','playerStatValue','gamePointsValue','touchdownPlays','scorerId','evaluateFirstTouchdown','moneylineEvidence','evaluateMoneyline','evaluateSpread','totalFieldGoalsValue','anytimeValue','norm','teamCode'];
let out='// Evaluador compartido con el tablero. Regenerar con node scripts/build-notification-evaluator.cjs\nexport function evaluateSelection(data,leg){\nconst demoMode=false,demoSummaries=new Map(),cache=new Map([[leg.event,data]]),failures=new Set(),NFL_TEAM_CODES={};\n';
for(const name of ['markets','legacyMarkets']){const m=source.match(new RegExp('const '+name+' = \\{[\\s\\S]*?^\\};','m'));if(!m)throw Error(name);out+=m[0]+'\n';}
for(const name of names){const m=source.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));if(!m)throw Error(name);out+=m[0]+'\n';}
out+='return evaluate(leg);\n}\n';fs.writeFileSync('worker/selection-evaluator.js',out);
