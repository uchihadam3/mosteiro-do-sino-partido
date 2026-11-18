import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  actionAvailability,
  actionTargets,
  ctxOf,
  dungeon,
  intentFor,
  reg,
  type ActionDef,
  type Band,
  type CombatState,
  type DomainEvent,
  type Figure,
  type SectorKey,
  type Tempo,
} from '@mosteiro/core';
import { useSession, useSettings } from '../../app/hooks';
import { useApp } from '../../app/App';
import { Icon } from '../Icon';
import { CLASS_COLOR, COND_NAME, COND_TEXT, TEMPO_DESC, TEMPO_NAME, ATTR_NAME } from '../data';
import { session } from '../../state/session';
import { toast } from '../Toasts';
import { audio } from '../../audio/AudioDirector';
import { PendingPrompt } from './Prompts';
import { PauseMenu } from '../Pause';
import type { Highlight } from '../../three/Diorama';

const BAND_INFO: { b: Band; label: string; side: 'h' | 'e'; tempo: Tempo }[] = [
  { b: 'HR', label: 'Heróis', side: 'h', tempo: 'rapido' },
  { b: 'ER', label: 'Inimigos', side: 'e', tempo: 'rapido' },
  { b: 'HT', label: 'Heróis', side: 'h', tempo: 'tatico' },
  { b: 'ET', label: 'Inimigos', side: 'e', tempo: 'tatico' },
  { b: 'HP', label: 'Heróis', side: 'h', tempo: 'pesado' },
  { b: 'EP', label: 'Inimigos', side: 'e', tempo: 'pesado' },
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

export function CombatHUD() {
  const s = useSession();
  const settings = useSettings();
  const { diorama } = useApp();
  const st = s.state!;
  const S = st.combat!;
  const c = useMemo(() => ctxOf(S), [S]);
  const d = dungeon(st.dungeonId);
  const enc = d.encounters.find((e) => e.id === S.encounterId);
  const active = S.activeId ? S.figures.find((f) => f.id === S.activeId) : undefined;
  const heroActive = active?.side === 'H' && S.phase === 'heroActing' ? active : undefined;
  const canAct = !!heroActive && s.controls(heroActive.id);
  const [sel, setSel] = useState<Sel | null>(null);
  const [pre, setPre] = useState<string[]>(['pesado']);
  const [hover, setHover] = useState<{ figureId?: string; sector?: SectorKey; x: number; y: number } | null>(null);
  const [roll, setRoll] = useState<(Extract<DomainEvent, { type: 'roll' }> & { key: number }) | null>(null);
  const [banner, setBanner] = useState<{ t: string; s?: string; key: number } | null>(null);
  const [showLog, setShowLog] = useState(true);
  const [pause, setPause] = useState(false);
  const rollKey = useRef(0);
  const [deploySel, setDeploySel] = useState<string | null>(null);

  useEffect(() => setSel(null), [S.activeId, S.phase, S.pending?.id]);
  useEffect(() => {
    if (enc && S.cycle <= 1 && S.phase === 'tempo') {
      setBanner({ t: enc.name, s: enc.intro, key: Date.now() });
      if (enc.kind === 'boss' || enc.kind === 'miniboss' || enc.kind === 'secreto') audio.play('sting_boss_intro', { volume: 0.9 });
    }
  }, [S.encounterId]);
  useEffect(() => {
    if (S.cycle > 1) setBanner({ t: `Ciclo ${S.cycle}`, key: Date.now() });
  }, [S.cycle]);
  useEffect(() => {
    if (S.result === 'victory') setBanner({ t: 'Vitória', key: Date.now() });
  }, [S.result]);

  // diorama wiring: callbacks + highlights
  const targets = useMemo(() => (sel && heroActive ? actionTargets(c, heroActive, sel.def) : null), [sel, heroActive, c]);
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
      if (sel.def.targeting.type === 'sector' || sel.def.targeting.type === 'move' || sel.def.targeting.type === 'area2' || sel.def.targeting.type === 'sectors2') return handlers.current.sector(f.sector);
      return toast('Alvo inválido para esta ação.', 'error');
    }
    if (S.phase === 'deploy' && f.side === 'H' && s.controls(f.id)) {
      setDeploySel(f.id);
      return;
    }
    if (S.phase === 'heroBand' && f.side === 'H' && s.controls(f.id)) void act({ t: 'combat', cmd: { t: 'activate', figureId: f.id } });
  };
  const [areaFirst, setAreaFirst] = useState<SectorKey | null>(null);
  useEffect(() => setAreaFirst(null), [sel]);
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
      else toast('Setor inválido.', 'error');
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
    // clicking a sector containing a valid target figure
    const f = S.figures.find((x) => x.sector === k && targets.figures.includes(x.id));
    if (f) fire({ targetIds: [f.id] });
  };
  useEffect(() => {
    if (!diorama) return;
    diorama.cb.onFigureClick = (id) => handlers.current.fig(id);
    diorama.cb.onSectorClick = (k) => handlers.current.sector(k);
    diorama.cb.onHover = setHover;
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
      diorama.cb.onHover = undefined;
      diorama.cb.onRoll = undefined;
    };
  }, [diorama]);

  useEffect(() => {
    if (!diorama) return;
    const h: Highlight = { figures: new Map(), sectors: new Map() };
    if (heroActive) h.figures.set(heroActive.id, 'active');
    if (S.phase === 'deploy') {
      if (deploySel) {
        h.figures.set(deploySel, 'active');
        for (const k of (['F', 'R'] as const).flatMap((r) => [1, 2, 3, 4, 5].map((c) => `H:${r}${c}` as SectorKey))) if (S.figures.filter((f) => f.sector === k && f.id !== deploySel && f.status !== 'dead').length < 2) h.sectors.set(k, 'deploy');
      } else for (const f of S.figures) if (f.side === 'H' && s.controls(f.id)) h.figures.set(f.id, 'ally');
    }
    if (S.phase === 'heroBand') for (const f of S.figures) if (f.side === 'H' && f.status === 'active' && !f.acted && f.tempo === BAND_INFO.find((b) => b.b === S.band)?.tempo && s.controls(f.id)) h.figures.set(f.id, 'active');
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
    if (p?.kind === 'choice') for (const o of p.options) {
      if (/^[HE]:[FR][1-5]$/.test(o.id)) h.sectors.set(o.id as SectorKey, 'move');
      else if (S.figures.some((f) => f.id === o.id)) h.figures.set(o.id, 'attack');
    }
    if (p?.kind === 'defense') h.figures.set(p.d.targetId, 'attack');
    diorama.setHighlight(h);
  }, [diorama, targets, sel, S, areaFirst, deploySel]);

  const fire = (x: { targetIds?: string[]; sector?: SectorKey; sectors?: SectorKey[] }) => {
    if (!sel || !heroActive) return;
    const preList = [...pre];
    void act({ t: 'combat', cmd: { t: 'action', actionId: sel.def.id, figureId: heroActive.id, pre: preList, option: sel.option, ...x } }).then((err) => {
      if (!err) audio.play('ui_confirm', { volume: 0.4 });
    });
    setSel(null);
  };

  const choose = (def: ActionDef, option?: string) => {
    if (!heroActive) return;
    audio.play('ui_click', { volume: 0.5 });
    const T = def.targeting.type;
    const opts = def.options?.(c, heroActive) ?? [];
    if (opts.length && !option && !(def.id.startsWith('a_') && opts.every((o) => o.id.startsWith('sobrecarga')))) {
      setSel({ def });
      return;
    }
    if (T === 'none') {
      void act({ t: 'combat', cmd: { t: 'action', actionId: def.id, figureId: heroActive.id, pre, option } });
      setSel(null);
      return;
    }
    // single obvious target → still require a click for clarity, but preselect
    setSel({ def, option });
  };

  // keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape' && sel) {
        e.stopPropagation();
        setSel(null);
      }
      if (e.key === ' ' && diorama?.busy) {
        e.preventDefault();
        diorama.skip();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [sel, diorama]);

  const heroes = S.figures.filter((f) => f.side === 'H');
  const typesShown = S.typeOrder.filter((t) => S.figures.some((f) => f.typeId === t && f.side === 'E' && f.status === 'active'));
  const allTempos = heroes.filter((h) => h.status === 'active').every((h) => h.tempo);

  return (
    <div className="overlay">
      <div className="frame hud">
        <div className="topbar">
          <div className="cycle-badge panel">
            Ciclo <b>{S.cycle}</b>
          </div>
          <div className="timeline panel" aria-label="Ordem do Ciclo">
            {BAND_INFO.map((b, i) => {
              const idx = BAND_INFO.findIndex((x) => x.b === S.band);
              const has = b.side === 'h' ? heroes.some((h) => h.tempo === b.tempo && h.status === 'active') : typesShown.some((t) => intentFor(S, t)?.tempo === b.tempo);
              const now = S.phase !== 'tempo' && b.b === S.band;
              return (
                <div key={b.b} className={`tl-step ${b.side} ${now ? 'now' : ''} ${S.phase !== 'tempo' && i < idx ? 'done' : ''} ${has ? 'has' : ''}`} title={`${b.label} ${TEMPO_NAME[b.tempo]}`}>
                  <Icon id={`tempo_${b.tempo}`} />
                  <span>{b.label}</span>
                </div>
              );
            })}
          </div>
          <div className="grow" />
          <span className="xs muted" style={{ whiteSpace: 'nowrap' }}>{enc?.code} · {enc?.name}</span>
          <button className="btn icon sm" title="Pular animações (Espaço)" onClick={() => diorama?.skip()}>
            <Icon id="fast_forward" />
          </button>
          <button className="btn icon sm" title="Histórico" onClick={() => setShowLog((x) => !x)}>
            <Icon id="log" />
          </button>
          <button className="btn icon sm" title="Menu (Esc)" onClick={() => setPause(true)}>
            <Icon id="menu" />
          </button>
        </div>

        <div className="intents" aria-label="Intenções inimigas reveladas">
          {typesShown.map((t) => {
            const intent = intentFor(S, t);
            const def = reg().enemies[t];
            if (!intent) return null;
            const n = S.figures.filter((f) => f.typeId === t && f.status === 'active').length;
            const now = S.phase === 'enemyBand' && BAND_INFO.find((b) => b.b === S.band)?.tempo === intent.tempo;
            return (
              <div key={t} className={`intent ${def.boss || def.miniboss ? 'boss' : ''} ${now ? 'now' : ''}`} onMouseEnter={(e) => setHover({ figureId: S.figures.find((f) => f.typeId === t && f.status === 'active')?.id, x: e.clientX, y: e.clientY + 40 })} onMouseLeave={() => setHover(null)}>
                <Icon id={`tempo_${intent.tempo}`} className="tempo" />
                <div className="who">
                  {def.name}
                  {n > 1 ? ` ×${n}` : ''}
                </div>
                <div className="what">{intent.name}</div>
                <div className="tags">
                  {intent.dano !== undefined && <span className="chip red">Dano {intent.dano}</span>}
                  {intent.def && <span className="chip">Def. {ATTR_NAME[intent.def]}</span>}
                  {intent.tags?.map((x) => (
                    <span key={x} className="chip gold">{x}</span>
                  ))}
                  {intent.guard && <span className="chip">{intent.guard === 'fechada' ? 'Guarda Fechada' : 'Guarda Aberta'}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className={`heroes-col ${heroes.length > 3 ? "many" : ""}`}>
          {heroes.map((h) => (
            <HeroCard key={h.id} h={h} S={S} target={!!(targets && targets.figures.includes(h.id))} onClick={() => handlers.current.fig(h.id)} />
          ))}
        </div>

        <div className="right-col">
          {(S.boss.ressonancia > 0 || S.figures.some((f) => f.typeId === 'severin' || f.typeId === 'cantor')) && <BossPanel S={S} />}
          {showLog && <LogPanel S={S} />}
        </div>

        <div className="bottom">
          {S.phase === 'deploy' && (
            <div className="panel row" style={{ padding: '10px 14px', gap: 14 }}>
              <div className="small muted" style={{ maxWidth: 460 }}>
                <b style={{ color: 'var(--ink)' }}>Posicionamento.</b> {deploySel ? 'Escolha um Setor destacado do seu lado (máx. 2 figuras por Setor).' : 'Clique num herói para mudá-lo de Setor, ou comece com a formação atual.'}
              </div>
              <button className="btn primary" onClick={() => void act({ t: 'combat', cmd: { t: 'start' } }).then((e) => !e && audio.play('cycle_start', { volume: 0.6 }))}>
                Iniciar combate
              </button>
            </div>
          )}
          {S.phase === 'tempo' && !S.pending && <TempoPanel S={S} />}
          {S.phase === 'heroBand' && !S.pending && (
            <div className="panel small" style={{ padding: '10px 16px' }}>
              {heroes.some((h) => h.tempo === BAND_INFO.find((b) => b.b === S.band)?.tempo && !h.acted && s.controls(h.id)) ? 'Escolha qual herói age agora — clique no cartão ou na figura destacada.' : 'Aguardando outro jogador escolher quem age…'}
            </div>
          )}
          {S.phase === 'enemyBand' && !S.pending && (
            <div className="panel small row" style={{ padding: '10px 16px' }}>
              <Icon id="act_attack_melee" style={{ color: '#e7a090' }} /> Os inimigos agem…
            </div>
          )}
          {heroActive && !S.pending && (
            canAct ? (
              <ActionBar f={heroActive} S={S} sel={sel} onPick={choose} pre={pre} setPre={setPre} onEnd={() => void act({ t: 'combat', cmd: { t: 'end', figureId: heroActive.id } })} />
            ) : (
              <div className="panel small" style={{ padding: '10px 16px' }}>
                {heroActive.name} está agindo ({st.seats.find((x) => x.id === st.heroes.find((h) => h.id === heroActive.id)?.seat)?.name ?? 'outro jogador'})…
              </div>
            )
          )}
        </div>
      </div>

      {sel && heroActive && (
        <TargetHint
          sel={sel}
          f={heroActive}
          S={S}
          areaFirst={areaFirst}
          onOption={(o) => setSel({ ...sel, option: o })}
          onCancel={() => setSel(null)}
          onFire={() => fire({})}
        />
      )}
      {S.pending && <PendingPrompt S={S} />}
      {roll && <DiceTray key={roll.key} ev={roll} name={S.figures.find((f) => f.id === roll.figureId)?.name ?? ''} />}
      {banner && (
        <div key={banner.key} className="banner">
          <div className="t">{banner.t}</div>
          {banner.s && <div className="s">{banner.s}</div>}
        </div>
      )}
      {hover?.figureId && !S.pending && <FigureTip S={S} id={hover.figureId} x={hover.x} y={hover.y} />}
      {pause && <PauseMenu onClose={() => setPause(false)} />}
      <div className="rotate-hint when-combat">
        <div>
          <Icon id="info" size={40} />
          <div className="h3" style={{ marginTop: 10 }}>Gire o aparelho</div>
          <div className="small muted">O combate tático foi desenhado para a tela deitada.</div>
        </div>
      </div>
      {settings.showPerf ? null : null}
    </div>
  );
}

// ------------------------------------------------------------------ tempo choice
function TempoPanel({ S }: { S: CombatState }) {
  const s = useSession();
  const heroes = S.figures.filter((f) => f.side === 'H' && f.status === 'active');
  const mine = heroes.filter((h) => s.controls(h.id));
  const all = heroes.every((h) => h.tempo);
  const vigia = S.figures.some((f) => f.typeId === 'vigia' && f.status === 'active');
  return (
    <div className="tempo-panel panel ornate">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <div className="kicker grow">Escolha o Tempo</div>
        <span className="xs muted">{vigia ? 'O Vigia fortalece a Intenção contra quem escolher o mesmo Tempo dela.' : 'Rápido age antes dos inimigos rápidos; Pesado age por último.'}</span>
      </div>
      <div className="tp-rows">
        {mine.map((h) => (
          <div key={h.id} className="tp-row">
            <span className="row tp-name" style={{ gap: 6, color: CLASS_COLOR[h.typeId] }}>
              <Icon id={`class_${h.typeId}`} />
              <span>{h.name}</span>
            </span>
            {(['rapido', 'tatico', 'pesado'] as Tempo[]).map((t) => (
              <button key={t} className={`tp-btn ${h.tempo === t ? 'on' : ''}`} title={TEMPO_DESC[t]} onClick={() => void act({ t: 'combat', cmd: { t: 'tempo', figureId: h.id, tempo: t } }).then(() => audio.play(`ui_select_tempo_${t}`, { volume: 0.55 }))}>
                <Icon id={`tempo_${t}`} />
                <span>{TEMPO_NAME[t]}</span>
                <small>{t === 'rapido' ? '2 AP + Passo' : t === 'tatico' ? '3 AP' : '3 AP + Grau'}</small>
              </button>
            ))}
          </div>
        ))}
        {mine.length < heroes.length && <div className="xs muted">Aguardando os outros jogadores escolherem…</div>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" disabled={!all} onClick={() => void act({ t: 'combat', cmd: { t: 'confirmTempo' } }).then((e) => !e && audio.play('cycle_start', { volume: 0.5 }))}>
          Confirmar Tempos
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ hero card
function HeroCard({ h, S, target, onClick }: { h: Figure; S: CombatState; target: boolean; onClick(): void }) {
  const s = useSession();
  const mine = s.controls(h.id);
  const down = h.status !== 'active';
  const band = BAND_INFO.find((b) => b.b === S.band);
  const can = S.phase === 'heroBand' && h.tempo === band?.tempo && !h.acted && !down && mine;
  const owner = s.state!.seats.length > 1 ? s.state!.seats.find((x) => x.id === s.state!.heroes.find((r) => r.id === h.id)?.seat)?.name : null;
  const C = h.conditions;
  const conds: [string, number | null][] = [];
  if (C.guardado) conds.push(['guardado', null]);
  if (C.furtivo) conds.push(['furtivo', null]);
  if (C.bencao) conds.push(['bencao', null]);
  if (C.veneno) conds.push(['veneno', C.veneno]);
  if (C.sangramento) conds.push(['sangramento', C.sangramento]);
  if (C.queimando) conds.push(['queimando', null]);
  if (C.quebrado) conds.push(['quebrado', null]);
  if (C.imobilizado) conds.push(['imobilizado', null]);
  if (C.atordoado) conds.push(['atordoado', null]);
  if (C.semReacoes) conds.push(['semReacoes', null]);
  const condIcon: Record<string, string> = { bencao: 'act_buff', semReacoes: 'reaction', ancorado: 'armor' };
  return (
    <div className={`hero-card ${S.activeId === h.id ? 'active' : ''} ${can ? 'can' : ''} ${h.acted && S.phase !== 'tempo' ? 'acted' : ''} ${down ? 'down' : ''} ${target ? 'target' : ''}`} style={{ ['--acc' as string]: CLASS_COLOR[h.typeId] }} onClick={onClick}>
      <div className="hc-top">
        <Icon id={`class_${h.typeId}`} className="emb" />
        <div style={{ minWidth: 0 }}>
          <div className="hc-name">{h.name}</div>
          {owner && <div className="hc-owner">{owner}</div>}
        </div>
        {h.tempo && S.phase !== 'tempo' && <Icon id={`tempo_${h.tempo}`} className="hc-tempo" title={TEMPO_NAME[h.tempo]} />}
      </div>
      <div className="hc-hp">
        <div className="bar">
          <i style={{ width: `${(h.hp / h.maxHp) * 100}%` }} />
        </div>
        <span className="num">{down ? (h.status === 'caido' ? 'Caído' : 'Derrotado') : `${h.hp}/${h.maxHp}`}</span>
      </div>
      <div className="hc-row">
        <span className="stat" title="Armadura">
          <Icon id="armor" /> {h.armor}
        </span>
        <span className={`stat ${h.reaction && !C.semReacoes ? 'react-on' : 'react-off'}`} title="Reação disponível neste Ciclo">
          <Icon id="reaction" />
        </span>
        {S.activeId === h.id && (
          <span className="pips" title="AP">
            {Array.from({ length: Math.max(h.ap ?? 0, 0) }).map((_, i) => (
              <span key={i} className="pip on" />
            ))}
          </span>
        )}
        {!!h.trauma && <span className="stat" title="Trauma">⚔{h.trauma}</span>}
        {s.state!.partySizeOriginal === 1 && <span className="stat" title="Último Fôlego"><Icon id="ultimo_folego" /> {h.ultimoFolego}</span>}
        <Resource h={h} />
      </div>
      {conds.length > 0 && (
        <div className="hc-row conds">
          {conds.map(([k, n]) => (
            <span key={k} className="cond" title={`${COND_NAME[k]}: ${COND_TEXT[k]}`}>
              <Icon id={condIcon[k] ?? `cond_${k}`} />
              {n ? <span className="n">{n}</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Resource({ h }: { h: Figure }) {
  const r = h.res;
  if (!r) return null;
  switch (h.typeId) {
    case 'guerreiro':
      return (
        <span className="res" title="Sequência I → II → III">
          <Icon id="sequencia" /> {r.sequencia === 0 ? '—' : r.sequencia === 1 ? 'I' : 'II'}
        </span>
      );
    case 'paladino':
      return (
        <span className="res" title="Convicção (máx. 3)">
          <Icon id="conviccao" />
          <span className="pips">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`pip ${i < r.conviccao ? 'on' : ''}`} />
            ))}
          </span>
        </span>
      );
    case 'arcanista':
      return (
        <span className="res" title={`Runas Prontas · Instabilidade ${r.instabilidade}/3`}>
          {(['ruina', 'vinculo', 'transposicao', 'raio', 'explosao', 'sigilo'] as const).map((k) => (
            <span key={k} className={`rune ${r.runes[k] ? 'on' : ''}`}>
              {k[0].toUpperCase()}
            </span>
          ))}
          <Icon id="instabilidade" style={{ color: r.instabilidade >= 3 ? 'var(--blood-2)' : undefined }} /> {r.instabilidade}
        </span>
      );
    case 'clerigo':
      return (
        <span className="res" title="Liturgia (3 Versos)">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`verse ${r.liturgia[i] ? `v-${r.liturgia[i]}` : ''}`}>
              {r.liturgia[i]?.[0].toUpperCase() ?? ''}
            </span>
          ))}
        </span>
      );
    case 'arqueiro':
      return (
        <span className="res" title="Mira (máx. 3)">
          <Icon id="mira" />
          <span className="pips">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`pip ${i < r.mira ? 'on' : ''}`} />
            ))}
          </span>
        </span>
      );
    default:
      return null;
  }
}

// ------------------------------------------------------------------ action bar
function ActionBar({ f, S, sel, onPick, onEnd, pre, setPre }: { f: Figure; S: CombatState; sel: Sel | null; onPick(d: ActionDef, o?: string): void; onEnd(): void; pre: string[]; setPre(p: string[]): void }) {
  const c = ctxOf(S);
  const list = actionAvailability(c, f);
  const order = (a: ActionDef) => (a.kind === 'attack' || a.kind === 'spell' ? 0 : a.kind === 'control' ? 1 : a.kind === 'support' ? 2 : a.kind === 'move' ? 3 : 4);
  const sorted = [...list].sort((a, b) => order(a.def) - order(b.def));
  const oil = f.backpack?.find((i) => i.itemId === 'oleo_afiacao');
  const tonic = f.backpack?.find((i) => i.itemId === 'tonico_foco');
  const toggle = (k: string) => setPre(pre.includes(k) ? pre.filter((x) => x !== k) : [...pre, k]);
  return (
    <div className="actionbar panel">
      <div className="ab-head">
        <div className="nm" style={{ color: CLASS_COLOR[f.typeId] }}>{f.name}</div>
        <span className="pips" title="AP restantes">
          {Array.from({ length: Math.max(0, f.ap ?? 0) }).map((_, i) => (
            <span key={i} className="pip on" />
          ))}
          {(f.ap ?? 0) === 0 && <span className="xs muted">sem AP</span>}
        </span>
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {f.tempo === 'pesado' && (
            <button className={`chip ${pre.includes('pesado') ? 'gold' : ''}`} onClick={() => toggle('pesado')} title="Pesado: +1 Grau na próxima rolagem desta Ativação">
              +Grau
            </button>
          )}
          {oil && (
            <button className={`chip ${pre.includes(`oleo:${oil.uid}`) ? 'gold' : ''}`} onClick={() => toggle(`oleo:${oil.uid}`)} title="Óleo de Afiação: +1 Dano no próximo Ataque com Arma">
              Óleo
            </button>
          )}
          {tonic && (
            <button className={`chip ${pre.includes(`tonico:${tonic.uid}`) ? 'gold' : ''}`} onClick={() => toggle(`tonico:${tonic.uid}`)} title="Tônico de Foco: +1 Grau num dado">
              Tônico
            </button>
          )}
        </div>
      </div>
      <div className="ab-actions">
        {sorted.map(({ def, cost, reason }) => (
          <button key={def.id} className={`act k-${def.kind} ${reason ? 'off' : ''} ${sel?.def.id === def.id ? 'sel' : ''}`} title={`${def.name} — ${cost} AP\n${def.text}${reason ? `\n\n⛔ ${reason}` : ''}`} onClick={() => (reason ? toast(reason, 'error') : onPick(def))}>
            {def.tier && <span className="tier">{def.tier}</span>}
            <span className="cost">
              {Array.from({ length: cost }).map((_, i) => (
                <i key={i} />
              ))}
            </span>
            <Icon id={def.icon ?? 'act_item'} />
            <span className="an">{def.name}</span>
          </button>
        ))}
      </div>
      <button className="btn end-btn" onClick={onEnd} title="Encerrar a Ativação">
        <Icon id="act_end_turn" /> Encerrar
      </button>
    </div>
  );
}

function TargetHint({ sel, f, S, areaFirst, onOption, onCancel, onFire }: { sel: Sel; f: Figure; S: CombatState; areaFirst: SectorKey | null; onOption(o: string): void; onCancel(): void; onFire(): void }) {
  const c = ctxOf(S);
  const opts = sel.def.options?.(c, f) ?? [];
  const T = sel.def.targeting.type;
  const needsOption = opts.length > 0 && !sel.option && !opts.every((o) => o.id.startsWith('sobrecarga'));
  const msg = needsOption
    ? 'Escolha uma opção'
    : T === 'enemy'
      ? 'Escolha o inimigo alvo'
      : T === 'ally'
        ? 'Escolha o aliado'
        : T === 'move'
          ? 'Escolha o destino'
          : T === 'sector'
            ? 'Escolha o Setor'
            : T === 'area2'
              ? areaFirst
                ? 'Escolha o segundo Setor (ortogonal)'
                : 'Escolha dois Setores conectados'
              : T === 'sectors2'
                ? 'Escolha dois Setores'
                : 'Confirmar';
  return (
    <div className="hint-chip panel" style={{ flexDirection: 'column', alignItems: 'stretch', maxWidth: 'min(720px, 94vw)' }}>
      <div className="row">
        <span className="kicker" style={{ color: 'var(--gold-2)' }}>{sel.def.name}</span>
        <span className="grow">{msg}</span>
        {T === 'none' && !needsOption && (
          <button className="btn sm primary" onClick={onFire}>
            Usar
          </button>
        )}
        <button className="btn sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {opts.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {opts.map((o) => (
            <button key={o.id} className={`opt ${sel.option === o.id ? 'on' : ''}`} disabled={!!o.disabled} title={o.disabled ?? ''} onClick={() => onOption(o.id)}>
              {o.label}
              {o.disabled && <small>{o.disabled}</small>}
            </button>
          ))}
        </div>
      )}
      <div className="xs muted" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-ui)' }}>{sel.def.text}</div>
    </div>
  );
}

// ------------------------------------------------------------------ boss panel & log
function BossPanel({ S }: { S: CombatState }) {
  const sev = S.figures.find((f) => f.typeId === 'severin' && f.status === 'active');
  const can = S.figures.find((f) => f.typeId === 'cantor' && f.status === 'active');
  if (!sev && !can) return null;
  return (
    <div className="panel" style={{ padding: '10px 12px' }}>
      {sev && (
        <>
          <div className="kicker">Ressonância</div>
          <div className="row" style={{ gap: 6, margin: '6px 0' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, height: 10, borderRadius: 3, background: i <= S.boss.ressonancia ? (i === 3 ? '#e0663a' : '#c8a75e') : 'rgba(255,255,255,0.08)', boxShadow: i <= S.boss.ressonancia ? '0 0 10px rgba(230,160,74,0.5)' : undefined }} />
            ))}
          </div>
          <div className="xs muted">Em 2: Severin Exposto. Em 3: Terceira Badalada na fase Pesada.</div>
          <div className="row xs" style={{ gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {S.boss.contrapesos.map((c) => (
              <span key={c.id} className={`chip ${c.used ? 'green' : ''}`}>
                <Icon id="contrapeso" /> {c.id === 'oeste' ? 'Oeste (C1)' : c.id === 'norte' ? 'Norte (C3)' : 'Leste (C5)'}
              </span>
            ))}
          </div>
          <div className="row xs" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {S.ctx.hasManivela && <span className={`chip ${S.boss.manivelaUsada ? '' : 'gold'}`}>Manivela {S.boss.manivelaUsada ? 'usada' : 'pronta'}</span>}
            {S.ctx.hasSilencio && <span className={`chip ${S.boss.silencioUsado ? '' : 'gold'}`}>Silêncio do Coro {S.boss.silencioUsado ? 'usado' : 'pronto'}</span>}
            <span className="chip">Convocações {S.boss.convocacoes}/{S.partySize}</span>
          </div>
        </>
      )}
      {can && (
        <>
          <div className="kicker" style={{ marginTop: sev ? 8 : 0 }}>Canto</div>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, height: 10, borderRadius: 3, background: i <= S.boss.canto ? '#c2463a' : 'rgba(255,255,255,0.08)' }} />
            ))}
          </div>
          <div className="xs muted" style={{ marginTop: 4 }}>Em 3: a próxima Intenção vira Última Badalada.</div>
        </>
      )}
    </div>
  );
}

function LogPanel({ S }: { S: CombatState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [S.logSeq]);
  return (
    <div className="log-panel panel">
      <div className="kicker" style={{ marginBottom: 6 }}>Histórico</div>
      <div className="log-list scroll-y" ref={ref}>
        {S.log.slice(-80).map((l) => (
          <div key={l.seq} className={`l k-${l.kind}`}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dice tray
function DiceTray({ ev, name }: { ev: Extract<DomainEvent, { type: 'roll' }>; name: string }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1550);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  const r = ev.roll;
  return (
    <div className="dice-tray">
      <div className="lbl">
        {name} · {ev.purpose}
      </div>
      <div className="dice-row">
        {r.dice.map((d, i) => {
          const s = d.value <= 2 ? 's0' : d.value === 12 ? 'crit' : d.value >= 6 ? 'imp' : 's1';
          return (
            <div key={i} className={`die3d ${s}`} style={{ animationDelay: `${i * 70}ms` }}>
              <Icon id={`dice_d${d.grade}`} />
              <span className="v">{d.value}</span>
              <span className="g">D{d.grade}</span>
            </div>
          );
        })}
      </div>
      <div className="dice-sum">
        <span className={`chip ${r.successes ? 'green' : 'red'}`}>
          <Icon id="success" /> {r.successes} Sucesso{r.successes === 1 ? '' : 's'}
        </span>
        {r.impulsos > 0 && (
          <span className="chip gold">
            <Icon id="impulse" /> {r.impulsos} Impulso{r.impulsos === 1 ? '' : 's'}
          </span>
        )}
        {r.critico && (
          <span className="chip gold">
            <Icon id="critical" /> Crítico
          </span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tooltip
function FigureTip({ S, id, x, y }: { S: CombatState; id: string; x: number; y: number }) {
  const f = S.figures.find((q) => q.id === id);
  if (!f) return null;
  const left = Math.min(x + 18, window.innerWidth - 360);
  const top = Math.min(y + 12, window.innerHeight - 260);
  if (f.side === 'H') {
    return (
      <div className="tip panel" style={{ left, top }}>
        <div className="title">{f.name}</div>
        <div className="small muted">
          {reg().classes[f.typeId].name} · HP {f.hp}/{f.maxHp} · Armadura {f.armor} · {f.sector.replace('H:', '').replace('F', 'Frente ').replace('R', 'Retaguarda ')}
        </div>
      </div>
    );
  }
  const def = reg().enemies[f.typeId];
  const intent = intentFor(S, f.typeId);
  return (
    <div className="tip panel" style={{ left, top }}>
      <div className="title">{def.name}</div>
      <div className="xs muted" style={{ marginBottom: 6 }}>
        {def.tierLabel} · HP {f.hp}/{f.maxHp} · Armadura {f.armor + f.conditions.armaduraExtra}
        {f.conditions.brechas ? ` · Brechas ${f.conditions.brechas}` : ''}
      </div>
      {def.passives.map((p) => (
        <div key={p.name} className="xs" style={{ marginBottom: 4 }}>
          <b>{p.name}.</b> {p.text}
        </div>
      ))}
      {intent && (
        <div className="xs" style={{ marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          <b style={{ color: '#e7a090' }}>
            {intent.name} ({TEMPO_NAME[intent.tempo]})
          </b>
          <br />
          {intent.text}
        </div>
      )}
    </div>
  );
}
