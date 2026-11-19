/**
 * Combat HUD — game-first, portrait-first.
 * The board is the screen: heroes are tapped (on the board or in the portrait dock), actions are big round
 * buttons, enemies show their Intention above their heads, and decisions slide up from the bottom.
 * Everything else (log, details, rules text) stays out of the way until asked for.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { actionAvailability, actionTargets, ctxOf, dungeon, intentFor, reg, type ActionDef, type Band, type CombatState, type DomainEvent, type Figure, type SectorKey, type Tempo } from '@mosteiro/core';
import { useSession } from '../../app/hooks';
import { useApp } from '../../app/App';
import { Icon } from '../Icon';
import { CLASS_COLOR, COND_NAME, COND_TEXT, TEMPO_NAME } from '../data';
import { session } from '../../state/session';
import { toast } from '../Toasts';
import { audio } from '../../audio/AudioDirector';
import { PendingPrompt } from './Prompts';
import { PauseMenu } from '../Pause';
import type { Highlight } from '../../three/Diorama';
import './game.css';

export const BAND_INFO: { b: Band; side: 'h' | 'e'; tempo: Tempo }[] = [
  { b: 'HR', side: 'h', tempo: 'rapido' },
  { b: 'ER', side: 'e', tempo: 'rapido' },
  { b: 'HT', side: 'h', tempo: 'tatico' },
  { b: 'ET', side: 'e', tempo: 'tatico' },
  { b: 'HP', side: 'h', tempo: 'pesado' },
  { b: 'EP', side: 'e', tempo: 'pesado' },
];

export async function act(cmd: Parameters<typeof session.dispatch>[0]) {
  const err = await session.dispatch(cmd);
  if (err) {
    toast(err, 'error');
    audio.play('ui_error', { volume: 0.6 });
  }
  return err;
}

interface Sel {
  def: ActionDef;
  option?: string;
}

export function GameHUD() {
  const s = useSession();
  const { diorama } = useApp();
  const st = s.state!;
  const S = st.combat!;
  const c = useMemo(() => ctxOf(S), [S]);
  const enc = dungeon(st.dungeonId).encounters.find((e) => e.id === S.encounterId);
  const active = S.activeId ? S.figures.find((f) => f.id === S.activeId) : undefined;
  const heroActive = active?.side === 'H' && S.phase === 'heroActing' ? active : undefined;
  const canAct = !!heroActive && s.controls(heroActive.id);
  const [sel, setSel] = useState<Sel | null>(null);
  const [pre, setPre] = useState<string[]>(['pesado']);
  const [roll, setRoll] = useState<(Extract<DomainEvent, { type: 'roll' }> & { key: number }) | null>(null);
  const [banner, setBanner] = useState<{ t: string; s?: string; key: number } | null>(null);
  const [pause, setPause] = useState(false);
  const [log, setLog] = useState(false);
  const [inspect, setInspect] = useState<string | null>(null);
  const [deploySel, setDeploySel] = useState<string | null>(null);
  const [tempoHero, setTempoHero] = useState<string | null>(null);
  const [areaFirst, setAreaFirst] = useState<SectorKey | null>(null);
  const rollKey = useRef(0);

  const heroes = S.figures.filter((f) => f.side === 'H');
  const mineActive = heroes.filter((h) => h.status === 'active' && s.controls(h.id));
  const band = BAND_INFO.find((b) => b.b === S.band);

  useEffect(() => setSel(null), [S.activeId, S.phase, S.pending?.id]);
  useEffect(() => setAreaFirst(null), [sel]);
  useEffect(() => {
    if (enc && S.cycle <= 1 && S.phase === 'tempo') {
      setBanner({ t: enc.name, key: Date.now() });
      if (enc.kind === 'boss' || enc.kind === 'miniboss' || enc.kind === 'secreto') audio.play('sting_boss_intro', { volume: 0.9 });
    }
  }, [S.encounterId]);
  useEffect(() => {
    if (S.cycle > 1) setBanner({ t: `Ciclo ${S.cycle}`, key: Date.now() });
  }, [S.cycle]);
  useEffect(() => {
    if (S.result === 'victory') setBanner({ t: 'Vitória', key: Date.now() });
  }, [S.result]);
  // Tempo: walk the player through their heroes one by one
  useEffect(() => {
    if (S.phase !== 'tempo') return setTempoHero(null);
    if (!tempoHero || !mineActive.some((h) => h.id === tempoHero)) setTempoHero(mineActive.find((h) => !h.tempo)?.id ?? mineActive[0]?.id ?? null);
  }, [S.phase, S.cycle]);

  const targets = useMemo(() => (sel && heroActive ? actionTargets(c, heroActive, sel.def) : null), [sel, heroActive, c]);

  const fire = (x: { targetIds?: string[]; sector?: SectorKey; sectors?: SectorKey[] }) => {
    if (!sel || !heroActive) return;
    void act({ t: 'combat', cmd: { t: 'action', actionId: sel.def.id, figureId: heroActive.id, pre: [...pre], option: sel.option, ...x } }).then((err) => {
      if (!err) audio.play('ui_confirm', { volume: 0.4 });
    });
    setSel(null);
  };

  // ---- taps on the board (figures and sectors)
  const handlers = useRef({ fig: (_id: string) => {}, sector: (_k: SectorKey) => {} });
  handlers.current.fig = (id: string) => {
    const f = S.figures.find((x) => x.id === id);
    if (!f) return;
    if (S.pending) {
      const p = S.pending;
      if (p.kind === 'tieBreak' && p.candidates.includes(id)) void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'tieBreak', heroId: id } } });
      else if (p.kind === 'step') handlers.current.sector(f.sector);
      else if (p.kind === 'choice' && p.options.some((o) => o.id === id)) void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'choice', optionId: id } } });
      return;
    }
    if (sel && heroActive && targets) {
      if (targets.figures.includes(id)) return fire({ targetIds: [id] });
      const T = sel.def.targeting.type;
      if (T === 'sector' || T === 'move' || T === 'area2' || T === 'sectors2') return handlers.current.sector(f.sector);
      return toast('Esse alvo não serve para esta ação.', 'error');
    }
    if (S.phase === 'deploy' && f.side === 'H' && s.controls(f.id)) return setDeploySel(deploySel === f.id ? null : f.id);
    if (S.phase === 'tempo' && f.side === 'H' && s.controls(f.id)) return setTempoHero(f.id);
    if (S.phase === 'heroBand' && f.side === 'H' && s.controls(f.id) && f.tempo === band?.tempo && !f.acted) {
      void act({ t: 'combat', cmd: { t: 'activate', figureId: f.id } });
      return;
    }
    // anything else: look at it
    setInspect(id);
  };
  handlers.current.sector = (k: SectorKey) => {
    if (S.phase === 'deploy') {
      if (deploySel && k[0] === 'H') {
        void act({ t: 'combat', cmd: { t: 'deploy', figureId: deploySel, sector: k } }).then((e) => !e && audio.play('step_stone_1', { volume: 0.5 }));
        setDeploySel(null);
      }
      return;
    }
    if (S.pending?.kind === 'step') {
      if (S.pending.destinations.includes(k)) void act({ t: 'combat', cmd: { t: 'answer', pendingId: S.pending.id, answer: { kind: 'step', sector: k } } });
      return;
    }
    if (S.pending?.kind === 'choice' && S.pending.options.some((o) => o.id === k)) {
      void act({ t: 'combat', cmd: { t: 'answer', pendingId: S.pending.id, answer: { kind: 'choice', optionId: k } } });
      return;
    }
    if (!sel || !targets) return;
    const T = sel.def.targeting.type;
    if (T === 'sector' || T === 'move') {
      if (targets.sectors.includes(k)) fire({ sector: k });
      else toast('Escolha um Setor destacado.', 'error');
      return;
    }
    if (T === 'area2' || T === 'sectors2') {
      if (!areaFirst) {
        if (targets.areas.some(([a, b]) => a === k || b === k)) setAreaFirst(k);
        return;
      }
      const ok = targets.areas.find(([a, b]) => (a === areaFirst && b === k) || (b === areaFirst && a === k));
      if (ok) fire({ sectors: [areaFirst, k] });
      else setAreaFirst(k);
      return;
    }
    const f = S.figures.find((x) => x.sector === k && targets.figures.includes(x.id));
    if (f) fire({ targetIds: [f.id] });
  };

  useEffect(() => {
    if (!diorama) return;
    diorama.cb.onFigureClick = (id) => handlers.current.fig(id);
    diorama.cb.onSectorClick = (k) => handlers.current.sector(k);
    diorama.cb.onRoll = (ev) => {
      rollKey.current++;
      setRoll({ ...ev, key: rollKey.current });
      audio.play('dice_roll', { volume: 0.7 });
      const best = ev.roll.critico ? 'dice_critical' : ev.roll.impulsos ? 'dice_impulse' : ev.roll.successes ? 'dice_success' : 'dice_fail';
      audio.play(best, { volume: 0.6, delay: 0.35 });
    };
    return () => {
      diorama.cb.onFigureClick = undefined;
      diorama.cb.onSectorClick = undefined;
      diorama.cb.onRoll = undefined;
    };
  }, [diorama]);

  // ---- board highlights
  useEffect(() => {
    if (!diorama) return;
    const h: Highlight = { figures: new Map(), sectors: new Map() };
    if (heroActive) h.figures.set(heroActive.id, 'active');
    if (S.phase === 'deploy') {
      if (deploySel) {
        h.figures.set(deploySel, 'active');
        for (const k of (['F', 'R'] as const).flatMap((r) => [1, 2, 3, 4, 5].map((n) => `H:${r}${n}` as SectorKey))) if (S.figures.filter((f) => f.sector === k && f.id !== deploySel && f.status !== 'dead').length < 2) h.sectors.set(k, 'deploy');
      } else for (const f of S.figures) if (f.side === 'H' && s.controls(f.id)) h.figures.set(f.id, 'ally');
    }
    if (S.phase === 'tempo' && tempoHero) h.figures.set(tempoHero, 'active');
    if (S.phase === 'heroBand') for (const f of S.figures) if (f.side === 'H' && f.status === 'active' && !f.acted && f.tempo === band?.tempo && s.controls(f.id)) h.figures.set(f.id, 'active');
    if (targets && sel) {
      const kind = sel.def.targeting.type === 'ally' ? 'ally' : 'attack';
      for (const id of targets.figures) h.figures.set(id, kind);
      for (const k of targets.sectors) h.sectors.set(k, sel.def.targeting.type === 'move' || sel.def.id === 'reposicionar' || sel.def.id === 'passoRapido' ? 'move' : 'objective');
      for (const [a, b] of targets.areas) {
        if (areaFirst && a !== areaFirst && b !== areaFirst) continue;
        h.sectors.set(a, 'area');
        h.sectors.set(b, 'area');
      }
    }
    const p = S.pending;
    if (p?.kind === 'step') for (const k of p.destinations) h.sectors.set(k, 'move');
    if (p?.kind === 'tieBreak') for (const id of p.candidates) h.figures.set(id, 'intent');
    if (p?.kind === 'choice')
      for (const o of p.options) {
        if (/^[HE]:[FR][1-5]$/.test(o.id)) h.sectors.set(o.id as SectorKey, 'move');
        else if (S.figures.some((f) => f.id === o.id)) h.figures.set(o.id, 'attack');
      }
    if (p?.kind === 'defense') h.figures.set(p.d.targetId, 'attack');
    if (inspect) h.figures.set(inspect, h.figures.get(inspect) ?? 'intent');
    diorama.setHighlight(h);
  }, [diorama, targets, sel, S, areaFirst, deploySel, tempoHero, inspect]);

  const choose = (def: ActionDef, option?: string) => {
    if (!heroActive) return;
    audio.play('ui_click', { volume: 0.5 });
    const opts = def.options?.(c, heroActive) ?? [];
    if (opts.length && !option && !(def.id.startsWith('a_') && opts.every((o) => o.id.startsWith('sobrecarga')))) return setSel({ def });
    if (def.targeting.type === 'none' && !opts.length) {
      void act({ t: 'combat', cmd: { t: 'action', actionId: def.id, figureId: heroActive.id, pre, option } });
      return setSel(null);
    }
    setSel(sel?.def.id === def.id && !option ? null : { def, option });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape' && (sel || inspect)) {
        e.stopPropagation();
        setSel(null);
        setInspect(null);
      }
      if (e.key === ' ' && diorama?.busy) {
        e.preventDefault();
        diorama.skip();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [sel, inspect, diorama]);

  // ---- one short line telling the player what to do now
  const hint = (() => {
    if (S.pending) return null;
    if (S.phase === 'deploy') return deploySel ? 'Toque num lugar brilhando' : 'Toque num herói para trocá-lo de lugar';
    if (S.phase === 'tempo') return null;
    if (S.phase === 'heroBand') return heroes.some((h) => h.tempo === band?.tempo && !h.acted && s.controls(h.id)) ? 'Toque no herói que vai agir' : 'Outro jogador escolhe…';
    if (S.phase === 'enemyBand') return 'Vez dos inimigos';
    if (heroActive && !canAct) return `${heroActive.name} está agindo…`;
    return null;
  })();

  const inspected = inspect ? S.figures.find((f) => f.id === inspect) : null;

  return (
    <div className="g-hud">
      <TopBar S={S} heroes={heroes} onLog={() => setLog(true)} onMenu={() => setPause(true)} onSkip={() => diorama?.skip()} />
      <BossGauge S={S} />
      {hint && (
        <div className="g-hint" key={hint}>
          {hint}
        </div>
      )}

      <div className="g-bottom">
        {S.phase === 'deploy' && !S.pending && (
          <button className="g-cta" onClick={() => void act({ t: 'combat', cmd: { t: 'start' } }).then((e) => !e && audio.play('cycle_start', { volume: 0.6 }))}>
            Começar combate
          </button>
        )}
        {S.phase === 'tempo' && !S.pending && <TempoPicker S={S} heroId={tempoHero} setHero={setTempoHero} />}
        {heroActive && canAct && !S.pending && <ActionWheel f={heroActive} S={S} sel={sel} pre={pre} setPre={setPre} onPick={choose} onEnd={() => void act({ t: 'combat', cmd: { t: 'end', figureId: heroActive.id } })} />}
        <Dock S={S} heroes={heroes} tempoHero={tempoHero} onTap={(id) => handlers.current.fig(id)} />
      </div>

      {sel && heroActive && <TargetBar sel={sel} f={heroActive} S={S} areaFirst={areaFirst} onOption={(o) => setSel({ ...sel, option: o })} onCancel={() => setSel(null)} onFire={() => fire({})} />}
      {S.pending && <PendingPrompt S={S} />}
      {roll && <DiceBurst key={roll.key} ev={roll} />}
      {banner && (
        <div key={banner.key} className="g-banner">
          {banner.t}
        </div>
      )}
      {inspected && !S.pending && !sel && <Inspect S={S} f={inspected} onClose={() => setInspect(null)} />}
      {log && <LogSheet S={S} onClose={() => setLog(false)} />}
      {pause && <PauseMenu onClose={() => setPause(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ top bar: cycle + turn order, two buttons
function TopBar({ S, heroes, onLog, onMenu, onSkip }: { S: CombatState; heroes: Figure[]; onLog(): void; onMenu(): void; onSkip(): void }) {
  const typesShown = S.typeOrder.filter((t) => S.figures.some((f) => f.typeId === t && f.side === 'E' && f.status === 'active'));
  const idx = BAND_INFO.findIndex((x) => x.b === S.band);
  return (
    <div className="g-top">
      <div className="g-cycle">
        <span className="n">{S.cycle}</span>
        <div className="g-track" aria-label="Ordem do Ciclo">
          {BAND_INFO.map((b, i) => {
            const has = b.side === 'h' ? heroes.some((h) => h.tempo === b.tempo && h.status === 'active') : typesShown.some((t) => intentFor(S, t)?.tempo === b.tempo);
            const now = S.phase !== 'tempo' && S.phase !== 'deploy' && b.b === S.band;
            const done = S.phase !== 'tempo' && S.phase !== 'deploy' && i < idx;
            return (
              <span key={b.b} className={`step ${b.side} ${now ? 'now' : ''} ${done ? 'done' : ''} ${has ? 'has' : ''}`} title={`${b.side === 'h' ? 'Heróis' : 'Inimigos'} ${TEMPO_NAME[b.tempo]}`}>
                <Icon id={`tempo_${b.tempo}`} />
              </span>
            );
          })}
        </div>
      </div>
      <div className="g-top-btns">
        <button className="g-round sm" aria-label="Pular animação" onClick={onSkip}>
          <Icon id="fast_forward" />
        </button>
        <button className="g-round sm" aria-label="Histórico" onClick={onLog}>
          <Icon id="log" />
        </button>
        <button className="g-round sm" aria-label="Menu" onClick={onMenu}>
          <Icon id="menu" />
        </button>
      </div>
    </div>
  );
}

function BossGauge({ S }: { S: CombatState }) {
  const sev = S.figures.some((f) => f.typeId === 'severin' && f.status === 'active');
  const can = S.figures.some((f) => f.typeId === 'cantor' && f.status === 'active');
  if (!sev && !can) return null;
  const v = sev ? S.boss.ressonancia : S.boss.canto;
  return (
    <div className={`g-gauge ${v >= 3 ? 'full' : ''}`} title={sev ? 'Ressonância: em 2 Severin fica Exposto; em 3 a Terceira Badalada soa na fase Pesada.' : 'Canto: em 3 a próxima Intenção vira a Última Badalada.'}>
      <Icon id="item_bell" />
      <span className="lbl">{sev ? 'Ressonância' : 'Canto'}</span>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= v ? 'on' : ''} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ hero dock (portraits)
function Dock({ S, heroes, tempoHero, onTap }: { S: CombatState; heroes: Figure[]; tempoHero: string | null; onTap(id: string): void }) {
  const s = useSession();
  const band = BAND_INFO.find((b) => b.b === S.band);
  return (
    <div className={`g-dock n${heroes.length}`}>
      {heroes.map((h) => {
        const mine = s.controls(h.id);
        const down = h.status !== 'active';
        const can = S.phase === 'heroBand' && h.tempo === band?.tempo && !h.acted && !down && mine;
        const isActive = S.activeId === h.id || (S.phase === 'tempo' && tempoHero === h.id);
        const pct = Math.max(0, h.hp / h.maxHp);
        const C = h.conditions;
        const bad = ['veneno', 'sangramento', 'queimando', 'quebrado', 'imobilizado', 'atordoado', 'exposto'].filter((k) => (C as unknown as Record<string, unknown>)[k]);
        return (
          <button key={h.id} className={`g-port ${isActive ? 'active' : ''} ${can ? 'can' : ''} ${h.acted && S.phase !== 'tempo' ? 'acted' : ''} ${down ? 'down' : ''}`} style={{ ['--acc' as string]: CLASS_COLOR[h.typeId], ['--hp' as string]: `${pct * 360}deg` }} onClick={() => onTap(h.id)} aria-label={`${h.name}, ${h.hp} de ${h.maxHp} de vida`}>
            <span className="ring">
              <span className="face">
                <Icon id={`class_${h.typeId}`} />
              </span>
            </span>
            {h.tempo && S.phase !== 'deploy' && (
              <span className="tempo">
                <Icon id={`tempo_${h.tempo}`} />
              </span>
            )}
            {C.guardado && (
              <span className="guard" title="Guardado">
                <Icon id="cond_guardado" />
              </span>
            )}
            {bad.length > 0 && <span className="bad" title={bad.map((k) => COND_NAME[k]).join(', ')} />}
            <span className="hpnum">{down ? (h.status === 'caido' ? 'Caído' : '✕') : h.hp}</span>
            <span className="nm">{h.name}</span>
            {S.activeId === h.id && (
              <span className="ap">
                {Array.from({ length: Math.max(0, h.ap ?? 0) }).map((_, i) => (
                  <i key={i} />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Tempo: one hero at a time, three big choices
const TEMPO_SUB: Record<Tempo, string> = { rapido: '2 AP · age primeiro', tatico: '3 AP', pesado: '3 AP · golpe mais forte' };
function TempoPicker({ S, heroId, setHero }: { S: CombatState; heroId: string | null; setHero(id: string | null): void }) {
  const s = useSession();
  const heroes = S.figures.filter((f) => f.side === 'H' && f.status === 'active');
  const mine = heroes.filter((h) => s.controls(h.id));
  const all = heroes.every((h) => h.tempo);
  const h = mine.find((x) => x.id === heroId) ?? mine.find((x) => !x.tempo);
  const pick = async (t: Tempo) => {
    if (!h) return;
    const err = await act({ t: 'combat', cmd: { t: 'tempo', figureId: h.id, tempo: t } });
    if (err) return;
    audio.play(`ui_select_tempo_${t}`, { volume: 0.55 });
    const next = mine.find((x) => x.id !== h.id && !x.tempo);
    setHero(next?.id ?? null);
  };
  return (
    <div className="g-tempo">
      {h && (!all || heroId) ? (
        <>
          <div className="g-ctx-title" style={{ color: CLASS_COLOR[h.typeId] }}>
            {h.name} <span>· escolha o ritmo</span>
          </div>
          <div className="g-tempo-row">
            {(['rapido', 'tatico', 'pesado'] as Tempo[]).map((t) => (
              <button key={t} className={`g-tempo-btn t-${t} ${h.tempo === t ? 'on' : ''}`} onClick={() => void pick(t)}>
                <Icon id={`tempo_${t}`} />
                <b>{TEMPO_NAME[t]}</b>
                <small>{TEMPO_SUB[t]}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}
      {all ? (
        <button className="g-cta" onClick={() => void act({ t: 'combat', cmd: { t: 'confirmTempo' } }).then((e) => !e && audio.play('cycle_start', { volume: 0.5 }))}>
          Lutar!
        </button>
      ) : (
        mine.length < heroes.length && mine.every((x) => x.tempo) && <div className="g-wait">Esperando os outros jogadores…</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ actions: big round buttons
function ActionWheel({ f, S, sel, onPick, onEnd, pre, setPre }: { f: Figure; S: CombatState; sel: Sel | null; onPick(d: ActionDef, o?: string): void; onEnd(): void; pre: string[]; setPre(p: string[]): void }) {
  const c = ctxOf(S);
  const list = actionAvailability(c, f);
  const order = (a: ActionDef) => (a.kind === 'attack' || a.kind === 'spell' ? 0 : a.kind === 'control' ? 1 : a.kind === 'support' ? 2 : a.kind === 'move' ? 3 : 4);
  const sorted = [...list].sort((a, b) => Number(!!a.reason) - Number(!!b.reason) || order(a.def) - order(b.def));
  const oil = f.backpack?.find((i) => i.itemId === 'oleo_afiacao');
  const tonic = f.backpack?.find((i) => i.itemId === 'tonico_foco');
  const toggle = (k: string) => setPre(pre.includes(k) ? pre.filter((x) => x !== k) : [...pre, k]);
  const boosts = [f.tempo === 'pesado' && { k: 'pesado', label: '+1 Grau' }, oil && { k: `oleo:${oil.uid}`, label: 'Óleo +1 Dano' }, tonic && { k: `tonico:${tonic.uid}`, label: 'Tônico +1 Grau' }].filter(Boolean) as { k: string; label: string }[];
  return (
    <div className="g-actions">
      <div className="g-ctx-title" style={{ color: CLASS_COLOR[f.typeId] }}>
        {f.name}
        <span className="g-ap">
          {Array.from({ length: Math.max(0, f.ap ?? 0) }).map((_, i) => (
            <i key={i} />
          ))}
        </span>
        {boosts.map((b) => (
          <button key={b.k} className={`g-boost ${pre.includes(b.k) ? 'on' : ''}`} onClick={() => toggle(b.k)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="g-act-row">
        {sorted.map(({ def, cost, reason }) => (
          <button key={def.id} className={`g-act k-${def.kind} ${reason ? 'off' : ''} ${sel?.def.id === def.id ? 'sel' : ''}`} title={`${def.name} — ${cost} AP\n${def.text}${reason ? `\n\n${reason}` : ''}`} onClick={() => (reason ? toast(reason, 'error') : onPick(def))}>
            <span className="disc">
              <Icon id={def.icon ?? 'act_item'} />
              <span className="cost">{cost}</span>
            </span>
            <span className="an">{def.name}</span>
          </button>
        ))}
        <button className="g-act end" onClick={onEnd} title="Encerrar a Ativação">
          <span className="disc">
            <Icon id="act_end_turn" />
          </span>
          <span className="an">Encerrar</span>
        </button>
      </div>
    </div>
  );
}

function TargetBar({ sel, f, S, areaFirst, onOption, onCancel, onFire }: { sel: Sel; f: Figure; S: CombatState; areaFirst: SectorKey | null; onOption(o: string): void; onCancel(): void; onFire(): void }) {
  const opts = sel.def.options?.(ctxOf(S), f) ?? [];
  const T = sel.def.targeting.type;
  const needsOption = opts.length > 0 && !sel.option && !opts.every((o) => o.id.startsWith('sobrecarga'));
  const msg = needsOption
    ? 'Escolha uma opção'
    : T === 'enemy'
      ? 'Toque no inimigo'
      : T === 'ally'
        ? 'Toque no aliado'
        : T === 'move'
          ? 'Toque no destino'
          : T === 'sector'
            ? 'Toque num Setor'
            : T === 'area2'
              ? areaFirst
                ? 'Toque no segundo Setor'
                : 'Toque em dois Setores vizinhos'
              : T === 'sectors2'
                ? 'Toque em dois Setores'
                : '';
  return (
    <div className="g-target">
      <div className="row1">
        <b>{sel.def.name}</b>
        <span className="msg">{msg}</span>
        {T === 'none' && !needsOption && (
          <button className="g-pill gold" onClick={onFire}>
            Usar
          </button>
        )}
        <button className="g-x" aria-label="Cancelar" onClick={onCancel}>
          <Icon id="close" />
        </button>
      </div>
      {opts.length > 0 && (
        <div className="opts">
          {opts.map((o) => (
            <button key={o.id} className={`g-pill ${sel.option === o.id ? 'gold' : ''}`} disabled={!!o.disabled} title={o.disabled ?? ''} onClick={() => onOption(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      <details className="rules">
        <summary>O que faz</summary>
        {sel.def.text}
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ dice: a quick burst in the middle of the screen
function DiceBurst({ ev }: { ev: Extract<DomainEvent, { type: 'roll' }> }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1500);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  const r = ev.roll;
  return (
    <div className="g-dice" aria-live="polite">
      <div className="faces">
        {r.dice.map((d, i) => {
          const k = d.value <= 2 ? 's0' : d.value === 12 ? 'crit' : d.value >= 6 ? 'imp' : 's1';
          return (
            <div key={i} className={`g-die ${k}`} style={{ animationDelay: `${i * 70}ms` }}>
              <Icon id={`dice_d${d.grade}`} />
              <span className="v">{d.value}</span>
            </div>
          );
        })}
      </div>
      <div className={`verdict ${r.successes ? 'ok' : 'no'}`}>
        {r.critico ? 'CRÍTICO!' : r.successes ? `${r.successes} sucesso${r.successes > 1 ? 's' : ''}` : 'Falhou'}
        {r.impulsos > 0 && <span className="imp">+{r.impulsos} impulso{r.impulsos > 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tap a figure → details sheet
function Inspect({ S, f, onClose }: { S: CombatState; f: Figure; onClose(): void }) {
  const isHero = f.side === 'H';
  const def = isHero ? null : reg().enemies[f.typeId];
  const intent = isHero ? null : intentFor(S, f.typeId);
  const C = f.conditions as unknown as Record<string, unknown>;
  const conds = Object.keys(COND_NAME).filter((k) => C[k]);
  return (
    <div className="g-sheet-back" onClick={onClose}>
      <div className="g-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={f.name}>
        <div className="g-sheet-grab" />
        <div className="g-insp-head">
          <span className={`g-insp-badge ${isHero ? '' : 'enemy'}`} style={{ ['--acc' as string]: isHero ? CLASS_COLOR[f.typeId] : '#c2463a' }}>
            <Icon id={isHero ? `class_${f.typeId}` : 'act_attack_melee'} />
          </span>
          <div className="grow">
            <div className="g-insp-name">{isHero ? f.name : def!.name}</div>
            <div className="g-insp-sub">{isHero ? reg().classes[f.typeId].name : def!.tierLabel}</div>
          </div>
          <button className="g-x" aria-label="Fechar" onClick={onClose}>
            <Icon id="close" />
          </button>
        </div>
        <div className="g-insp-stats">
          <span>
            <Icon id="hp" /> {f.hp}/{f.maxHp}
          </span>
          <span>
            <Icon id="armor" /> {f.armor + (f.conditions.armaduraExtra ?? 0)}
          </span>
          {!!f.conditions.brechas && <span>Brechas {f.conditions.brechas}</span>}
        </div>
        {intent && (
          <div className="g-insp-intent">
            <Icon id={`tempo_${intent.tempo}`} />
            <div>
              <b>{intent.name}</b> <span className="muted">· {TEMPO_NAME[intent.tempo]}</span>
              <div className="txt">{intent.text}</div>
            </div>
          </div>
        )}
        {conds.length > 0 && (
          <div className="g-insp-conds">
            {conds.map((k) => (
              <div key={k}>
                <b>{COND_NAME[k]}</b> {COND_TEXT[k]}
              </div>
            ))}
          </div>
        )}
        {def && def.passives.length > 0 && (
          <details className="rules">
            <summary>Habilidades</summary>
            {def.passives.map((p) => (
              <div key={p.name}>
                <b>{p.name}.</b> {p.text}
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

function LogSheet({ S, onClose }: { S: CombatState; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollTo({ top: ref.current.scrollHeight }), [S.logSeq]);
  return (
    <div className="g-sheet-back" onClick={onClose}>
      <div className="g-sheet tall" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Histórico">
        <div className="g-sheet-grab" />
        <div className="g-insp-head">
          <div className="g-insp-name grow">Histórico</div>
          <button className="g-x" aria-label="Fechar" onClick={onClose}>
            <Icon id="close" />
          </button>
        </div>
        <div className="g-log" ref={ref}>
          {S.log.slice(-120).map((l) => (
            <div key={l.seq} className={`l k-${l.kind}`}>
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
