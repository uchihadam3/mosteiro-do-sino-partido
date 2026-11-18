import React, { useState } from 'react';
import { reg, type SectorKey } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { Inventory, run } from './Inventory';
import { CLASS_COLOR } from './data';
import { VoteBar } from './Explore';

export function FormationBoard({ pick, setPick }: { pick: string | null; setPick(id: string | null): void }) {
  const s = useSession();
  const st = s.state!;
  const rows: ('F' | 'R')[] = ['F', 'R'];
  return (
    <div>
      <div className="row xs muted" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span>▲ Inimigos à frente</span>
        <span>{pick ? 'Escolha o Setor' : 'Toque num herói para movê-lo'}</span>
      </div>
      <div className="mini-board">
        {rows.flatMap((r) =>
          [1, 2, 3, 4, 5].map((c) => {
            const k = `H:${r}${c}` as SectorKey;
            const here = st.heroes.filter((h) => st.formation[h.id] === k);
            return (
              <div
                key={k}
                className="mb-cell"
                style={pick && here.length < 2 ? { borderColor: 'var(--gold)' } : undefined}
                onClick={() => {
                  if (pick) {
                    void run({ t: 'setFormation', heroId: pick, sector: k }, 'step_stone_1');
                    setPick(null);
                  } else if (here[0]) setPick(here[0].id);
                }}
              >
                <span className="rl">{r === 'F' ? 'Frente' : 'Ret.'} {c}</span>
                {here.map((h) => (
                  <Icon key={h.id} id={`class_${h.classId}`} style={{ color: CLASS_COLOR[h.classId], filter: pick === h.id ? 'drop-shadow(0 0 6px #ffd27a)' : undefined }} />
                ))}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

export function Prep() {
  const s = useSession();
  const st = s.state!;
  const [heroId, setHeroId] = useState(st.heroes[0].id);
  const [pick, setPick] = useState<string | null>(null);
  return (
    <div className="overlay screen-fade">
      <div className="frame" style={{ gridTemplateRows: 'auto 1fr auto' }}>
        <div className="screen-head" style={{ paddingRight: 60 }}>
          <div className="grow">
            <div className="kicker">Base · antes da Dungeon 1</div>
            <h2 className="h2">Preparar a expedição</h2>
            <div className="small muted">Escolha Primária e Secundária entre o equipamento inicial e posicione a party. Itens não equipados ficam no Armazém e não ocupam a Mochila.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(240px, 1fr)', gap: 14, minHeight: 0 }}>
          <Inventory heroId={heroId} setHeroId={setHeroId} inBase />
          <div className="panel ornate col" style={{ padding: 16 }}>
            <div className="kicker">Formação inicial</div>
            <FormationBoard pick={pick} setPick={setPick} />
            <div className="xs muted">Cada Setor comporta no máximo 2 figuras. A Frente protege a Retaguarda da mesma coluna contra Corpo a Corpo e Alcance.</div>
            <div className="divider" />
            <div className="col" style={{ gap: 6 }}>
              {st.heroes.map((h) => (
                <div key={h.id} className="row small">
                  <Icon id={`class_${h.classId}`} style={{ color: CLASS_COLOR[h.classId] }} />
                  <span className="grow">{h.name}</span>
                  <span className="xs muted">{h.equipment.primary ? reg().items[h.equipment.primary.itemId].name : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <VoteBar voteKey="beginDungeon" />
          <button className="btn primary" onClick={() => void run({ t: 'beginDungeon' }, 'door_stone')}>
            Partir para o Mosteiro <Icon id="loc_portico" />
          </button>
        </div>
      </div>
    </div>
  );
}
