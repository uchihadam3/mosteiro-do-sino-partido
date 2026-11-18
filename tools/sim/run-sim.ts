/**
 * Batch balance simulation: the autoplay strategy plays the whole of Dungeon 1 (Modo Básico) many times.
 *   npm run sim -- [seeds=20] [heroes=1-5]
 * Prints, per party size and route: wins, defeats, stuck runs, engine errors, average gold and combats.
 */
import { newCampaign } from '@mosteiro/core';
import { autoplayCampaign, installContent } from '@mosteiro/content';

installContent();
const seeds = Number(process.argv[2] ?? 20);
const [lo, hi] = (process.argv[3] ?? '1-5').split('-').map(Number);
const CLASSES = ['guerreiro', 'paladino', 'arcanista', 'clerigo', 'arqueiro', 'ladino'];

console.log(`D1 Básico · ${seeds} sementes por linha · optionals + decifrar ligados`);
console.log('heróis rota   vitórias derrotas travou erros ouro_médio combates_médios');
let failures = 0;
for (let n = lo; n <= (hi ?? lo); n++) {
  for (const route of ['leste', 'oeste'] as const) {
    let wins = 0, losses = 0, stuck = 0, errors = 0, gold = 0, combats = 0;
    for (let i = 0; i < seeds; i++) {
      // rotate the class mix so every class is exercised
      const heroes = Array.from({ length: n }, (_, k) => CLASSES[(i + k) % CLASSES.length]).map((c, k) => ({ classId: c, name: `${c}${k}` }));
      const r = autoplayCampaign(newCampaign({ seed: `sim-${n}-${route}-${i}`, dungeonId: 'd1', heroes }), { route, optionals: true, decipher: true });
      if (r.errors.length) errors++;
      if (r.outcome === 'victory') wins++;
      else if (r.outcome === 'gameover') losses++;
      else stuck++;
      gold += r.state.gold;
      combats += r.combats;
    }
    failures += errors + stuck;
    console.log(`${String(n).padEnd(6)} ${route.padEnd(6)} ${String(wins).padEnd(8)} ${String(losses).padEnd(8)} ${String(stuck).padEnd(6)} ${String(errors).padEnd(5)} ${(gold / seeds).toFixed(1).padEnd(10)} ${(combats / seeds).toFixed(1)}`);
  }
}
if (failures) {
  console.error(`${failures} execução(ões) com erro de motor.`);
  process.exit(1);
}
