import { newCampaign, campaignDispatch, startEncounter } from '@mosteiro/core';
import { installContent, nextCombatCommand } from '@mosteiro/content';
installContent();
const classes = (process.argv[2] ?? 'guerreiro,clerigo,ladino').split(',');
const enc = process.argv[3] ?? 'GAL-E01';
let s = newCampaign({ seed: process.argv[4] ?? 'x', dungeonId: 'd1', heroes: classes.map((c, i) => ({ classId: c, name: c })) });
s = campaignDispatch(s, { t: 'beginDungeon' }).state;
s = structuredClone(s); startEncounter(s, enc);
let n = 0; let last: any = null;
while (s.phase === 'combat' && n++ < 3000) { const cmd = nextCombatCommand(s.combat!); if (!cmd) break; const r = campaignDispatch(s, { t: 'combat', cmd }); if (r.error) { console.log('ERR', r.error, JSON.stringify(cmd)); if (cmd.t==='action') { const r2 = campaignDispatch(s, {t:'combat', cmd:{t:'end', figureId: s.combat!.activeId!}}); s = r2.state; } else break; } else { s = r.state; if (s.combat) last = s.combat; } }
console.log((last?.log ?? []).map((x: any) => `[C${x.cycle}] ${x.text}`).join('\n'));
console.log(s.phase);
