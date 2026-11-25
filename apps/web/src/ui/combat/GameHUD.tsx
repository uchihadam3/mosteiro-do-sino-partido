/**
 * Combat HUD — game-first, portrait-first.
 * The board is the screen: heroes are tapped (on the board or in the portrait dock), actions are big round
 * buttons, enemies show their Intention above their heads, and decisions slide up from the bottom.
 * Everything else (log, details, rules text) stays out of the way until asked for.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { actionAvailability, actionTargets, ctxOf, dungeon, expectedSuccesses, intentFor, probAtLeastOneSuccess, reg, type ActionDef, type Band, type CombatState, type DomainEvent, type Figure, type Grade, type SectorKey, type Tempo } from '@mosteiro/core';
import { useSession } from '../../app/hooks';
import { useApp } from '../../app/App';
import { Icon } from '../Icon';
import { CLASS_COLOR, COND_NAME, COND_TEXT, TEMPO_NAME } from '../data';
import { session } from '../../state/session';
import { getSettings } from '../../state/settings';
import { toast } from '../Toasts';
import { audio } from '../../audio/AudioDirector';
import { PendingPrompt } from './Prompts';
import { PauseMenu } from '../Pause';
import { Dice3D } from './Dice3D';
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
  const [forecast, setForecast] = useState<{ targetId: string; defId: string } | null>(null);
  const [callout, setCallout] = useState<{ text: string; kind: 'hero' | 'enemy'; key: number } | null>(null);
  const lastTempo = useRef<Record<string, Tempo>>({});
  const noAttackTap = useRef<{ id: string; t: number } | null>(null);
  const presetCycle = useRef(-1);
  const rollKey = useRef(0);

  const heroes = S.figures.filter((f) => f.side === 'H');
  const mineActive = heroes.filter((h) => h.status === 'active' && s.controls(h.id));
  const band = BAND_INFO.find((b) => b.b === S.band);

  useEffect(() => {
    setSel(null);
    setForecast(null);
  }, [S.activeId, S.phase, S.pending?.id]);
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
  const threats = useMemo(() => predictThreats(S), [S]);
  const showThreats = !S.pending && !S.result && (S.phase === 'tempo' || S.phase === 'heroBand' || S.phase === 'heroActing');

  const fire = (x: { targetIds?: string[]; sector?: SectorKey; sectors?: SectorKey[] }) => {
    if (!sel || !heroActive) return;
    // plain moves can be taken back (local play) as long as nothing random or reactive happened
    const isMove = sel.def.kind === 'move' || sel.def.targeting.type === 'move';
    const snap = isMove && session.role === 'local' && session.state ? structuredClone(session.state) : null;
    const rngBefore = JSON.stringify(S.rng);
    const label = sel.def.name;
    void act({ t: 'combat', cmd: { t: 'action', actionId: sel.def.id, figureId: heroActive.id, pre: [...pre], option: sel.option, ...x } }).then((err) => {
      if (err) return;
      audio.play('ui_confirm', { volume: 0.4 });
      const now = session.state?.combat;
      if (snap && now && JSON.stringify(now.rng) === rngBefore && !now.pending && now.activeId === heroActive.id) setUndo({ snap, label, seq: now.logSeq, key: Date.now() });
    });
    setSel(null);
  };
  const [undo, setUndo] = useState<{ snap: NonNullable<typeof session.state>; label: string; seq: number; key: number } | null>(null);
  // the undo offer lasts until anything else happens
  useEffect(() => {
    if (undo && (S.logSeq !== undo.seq || S.activeId !== heroActive?.id)) setUndo(null);
  }, [S.logSeq, S.activeId]);

  const attackNow = (defId: string, targetId: string) => {
    if (!heroActive) return;
    const def = actionAvailability(c, heroActive).find((a) => a.def.id === defId && !a.reason)?.def;
    setForecast(null);
    if (!def) return;
    const opts = def.options?.(c, heroActive) ?? [];
    if (opts.length && !(def.id.startsWith('a_') && opts.every((o) => o.id.startsWith('sobrecarga')))) {
      // this attack needs a choice first: open its picker with the target already known
      setSel({ def });
      return;
    }
    void act({ t: 'combat', cmd: { t: 'action', actionId: def.id, figureId: heroActive.id, pre: [...pre], targetIds: [targetId] } }).then((err) => {
      if (!err) audio.play('ui_confirm', { volume: 0.45 });
    });
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
    // the hero's turn: tapping an enemy shows what the best attack would do (then one tap to confirm)
    if (heroActive && canAct && f.side === 'E' && f.status === 'active') {
      const options = attacksOn(c, heroActive, id);
      if (options.length) {
        audio.play('ui_click', { volume: 0.45 });
        setForecast(forecast?.targetId === id ? null : { targetId: id, defId: options[0].id });
        return;
      }
      // first tap: say why; a second tap on the same enemy shortly after opens its details
      const now = Date.now();
      if (!(noAttackTap.current && noAttackTap.current.id === id && now - noAttackTap.current.t < 2500)) {
        noAttackTap.current = { id, t: now };
        const why = actionAvailability(c, heroActive).find((a) => (a.def.kind === 'attack' || a.def.kind === 'spell') && a.reason)?.reason;
        toast(why ? `Não dá para atacar: ${why}` : 'Fora de alcance — aproxime-se ou use outra ação.', 'error');
        return;
      }
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

  // phone haptics (Android; iOS Safari has no vibration API): heroes hurt, your hits, criticals, defeats
  useEffect(() => {
    const vib = (p: number | number[]) => {
      if (getSettings().reducedMotion || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
      try {
        navigator.vibrate(p);
      } catch {
        /* ignore */
      }
    };
    return session.onEvents((evs) => {
      const cur = session.state?.combat;
      if (!cur) return;
      for (const e of evs) {
        if (e.type === 'damage') {
          const t = cur.figures.find((f) => f.id === e.targetId);
          if (t?.side === 'H') vib(e.amount >= 3 ? [40, 30, 60] : 35);
          else vib(18);
        } else if (e.type === 'roll' && e.roll.critico) vib([15, 25, 15, 25, 50]);
        else if (e.type === 'death') vib([30, 40, 80]);
      }
    });
  }, []);

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
    if (forecast) h.figures.set(forecast.targetId, 'attack');
    // the hero's turn with nothing chosen yet: every enemy that can be attacked right now glows
    if (heroActive && canAct && !sel && !forecast && !S.pending) for (const e of S.figures) if (e.side === 'E' && e.status === 'active' && attacksOn(c, heroActive, e.id).length) h.figures.set(e.id, 'attack');
    diorama.setHighlight(h);
  }, [diorama, targets, sel, S, areaFirst, deploySel, tempoHero, inspect, forecast]);

  // ---- automatic flow: the game never waits for a tap that has only one possible answer
  // only one hero can act in this band → activate it
  useEffect(() => {
    if (S.phase !== 'heroBand' || S.pending) return;
    const elig = heroes.filter((h) => h.status === 'active' && !h.acted && h.tempo === band?.tempo && s.controls(h.id));
    if (elig.length !== 1) return;
    const t = setTimeout(() => void act({ t: 'combat', cmd: { t: 'activate', figureId: elig[0].id } }), 450);
    return () => clearTimeout(t);
  }, [S.phase, S.band, S.pending?.id, heroes.map((h) => `${h.id}${h.acted}`).join()]);
  // nothing left to do (no AP / no valid action) → end the activation
  const avail = heroActive && canAct ? actionAvailability(c, heroActive) : [];
  const stuck = !!heroActive && canAct && !S.pending && !sel && avail.length > 0 && avail.every((a) => a.reason);
  useEffect(() => {
    if (!stuck || !heroActive) return;
    const id = heroActive.id;
    const t = setTimeout(() => void act({ t: 'combat', cmd: { t: 'end', figureId: id } }), 1100);
    return () => clearTimeout(t);
  }, [stuck, heroActive?.id, S.logSeq]);
  // Tempo: everybody starts with the rhythm they used last time (Tático the first time) — one tap on "Lutar!"
  useEffect(() => {
    if (S.phase !== 'tempo' || S.pending || presetCycle.current === S.cycle) return;
    presetCycle.current = S.cycle;
    const missing = mineActive.filter((h) => !h.tempo);
    void (async () => {
      for (const h of missing) await act({ t: 'combat', cmd: { t: 'tempo', figureId: h.id, tempo: lastTempo.current[h.id] ?? 'tatico' } });
    })();
    setTempoHero(null);
  }, [S.phase, S.cycle, S.pending?.id]);
  useEffect(() => {
    for (const h of heroes) if (h.tempo) lastTempo.current[h.id] = h.tempo;
  }, [heroes.map((h) => h.tempo).join()]);
  // big "your turn / enemies' turn" call-outs when the band changes
  useEffect(() => {
    if (S.phase === 'tempo' || S.phase === 'deploy' || S.result) return;
    const b = BAND_INFO.find((x) => x.b === S.band);
    if (!b) return;
    if (b.side === 'h' && heroes.some((h) => h.tempo === b.tempo && h.status === 'active' && s.controls(h.id))) setCallout({ text: 'Sua vez!', kind: 'hero', key: Date.now() });
    else if (b.side === 'e' && S.typeOrder.some((t) => intentFor(S, t)?.tempo === b.tempo && S.figures.some((f) => f.typeId === t && f.side === 'E' && f.status === 'active'))) setCallout({ text: 'Vez dos inimigos', kind: 'enemy', key: Date.now() });
  }, [S.band, S.cycle]);
  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout(null), 1300);
    return () => clearTimeout(t);
  }, [callout?.key]);

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
    if (S.phase === 'enemyBand') return null;
    if (heroActive && !canAct) return `${heroActive.name} está agindo…`;
    if (heroActive && canAct && !sel && !forecast) return stuck ? `${heroActive.name} terminou` : 'Toque num inimigo brilhando para atacar';
    return null;
  })();

  const inspected = inspect ? S.figures.find((f) => f.id === inspect) : null;

  return (
    <div className="g-hud">
      <TopBar S={S} heroes={heroes} onLog={() => setLog(true)} onMenu={() => setPause(true)} onSkip={() => diorama?.skip()} />
      <BossGauge S={S} />
      <ObjectivePill S={S} />
      {hint && (
        <div className="g-hint" key={hint}>
          {hint}
        </div>
      )}

      {showThreats && diorama && <ThreatLines threats={threats} diorama={diorama} />}
      <div className="g-bottom">
        {S.phase === 'deploy' && !S.pending && (
          <button className="g-cta" onClick={() => void act({ t: 'combat', cmd: { t: 'start' } }).then((e) => !e && audio.play('cycle_start', { volume: 0.6 }))}>
            Começar combate
          </button>
        )}
        {S.phase === 'tempo' && !S.pending && <TempoPicker S={S} heroId={tempoHero} setHero={setTempoHero} />}
        {undo && heroActive && canAct && !S.pending && !sel && !forecast && (
          <button
            className="g-undo"
            onClick={() => {
              const snap = undo.snap;
              setUndo(null);
              if (session.undoTo(snap)) audio.play('ui_cancel', { volume: 0.5 });
            }}
          >
            <Icon id="back" /> Desfazer {undo.label.toLowerCase()}
          </button>
        )}
        {heroActive && canAct && !S.pending && !forecast && <ActionWheel f={heroActive} S={S} sel={sel} pre={pre} setPre={setPre} onPick={choose} onEnd={() => void act({ t: 'combat', cmd: { t: 'end', figureId: heroActive.id } })} />}
        <Dock S={S} heroes={heroes} tempoHero={tempoHero} incoming={showThreats ? incomingDamage(threats) : {}} onTap={(id) => handlers.current.fig(id)} />
      </div>

      {forecast && heroActive && !S.pending && !sel && <Forecast S={S} hero={heroActive} targetId={forecast.targetId} defId={forecast.defId} pre={pre} onPick={(defId) => setForecast({ ...forecast, defId })} onConfirm={() => attackNow(forecast.defId, forecast.targetId)} onCancel={() => setForecast(null)} />}
      {callout && (
        <div key={callout.key} className={`g-callout ${callout.kind}`}>
          {callout.text}
        </div>
      )}
      {S.phase === 'enemyBand' && active && active.side === 'E' && !S.pending && <EnemyActing S={S} f={active} />}
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

// ------------------------------------------------------------------ attack forecast (tap an enemy → see the odds → confirm)
type Ctx = ReturnType<typeof ctxOf>;
/** Attacks the hero can use on that enemy right now, best first (weapon attack, then techniques, then spells). */
function attacksOn(c: Ctx, hero: Figure, targetId: string): ActionDef[] {
  const order = (d: ActionDef) => (d.kind === 'attack' ? 0 : d.kind === 'spell' ? 1 : 2);
  return actionAvailability(c, hero)
    .filter((a) => !a.reason && (a.def.kind === 'attack' || a.def.kind === 'spell') && a.def.targeting.type === 'enemy')
    .filter((a) => {
      try {
        return actionTargets(c, hero, a.def).figures.includes(targetId);
      } catch {
        return false;
      }
    })
    .map((a) => a.def)
    .sort((a, b) => order(a) - order(b));
}

/** Chance to hit (≥1 success) and the likely damage after armour, from the dice the attack rolls. */
function odds(c: Ctx, hero: Figure, def: ActionDef, target: Figure, pre: string[]) {
  const pv = def.preview?.(c, hero);
  const attrs = pv?.dice ?? [];
  const grades = attrs.map((a) => ((hero.attrs as unknown as Record<string, number>)?.[a] ?? 6) as Grade);
  if (pre.includes('pesado') && hero.tempo === 'pesado' && grades.length) {
    const i = grades.indexOf(Math.min(...grades) as Grade);
    grades[i] = Math.min(12, grades[i] + 2) as Grade;
  }
  if (target.conditions.exposto && grades.length) {
    const i = grades.indexOf(Math.min(...grades) as Grade);
    grades[i] = Math.min(12, grades[i] + 2) as Grade;
  }
  if (!grades.length) return null;
  const hit = probAtLeastOneSuccess(grades);
  const exp = expectedSuccesses(grades);
  const armor = target.conditions.quebrado ? 0 : target.armor + (target.conditions.armaduraExtra ?? 0);
  const base = pv?.dano ?? 1;
  const succIfHit = hit > 0 ? exp / hit : 0;
  const dmg = Math.max(0, Math.round(base + Math.max(0, succIfHit - 1) - armor));
  return { hit, dmg, armor, kills: dmg >= target.hp };
}

function Forecast({ S, hero, targetId, defId, pre, onPick, onConfirm, onCancel }: { S: CombatState; hero: Figure; targetId: string; defId: string; pre: string[]; onPick(id: string): void; onConfirm(): void; onCancel(): void }) {
  const c = ctxOf(S);
  const target = S.figures.find((f) => f.id === targetId);
  const options = target ? attacksOn(c, hero, targetId) : [];
  const def = options.find((d) => d.id === defId) ?? options[0];
  if (!target || !def) return null;
  const o = odds(c, hero, def, target, pre);
  const cost = actionAvailability(c, hero).find((a) => a.def.id === def.id)?.cost ?? 0;
  const name = reg().enemies[target.typeId]?.name ?? target.name;
  const pct = o ? Math.round(o.hit * 100) : null;
  return (
    <div className="g-forecast" role="dialog" aria-label={`Atacar ${name}`}>
      <div className="g-fc-head">
        <span className="who">{name}</span>
        <span className="hp">
          <i style={{ width: `${Math.max(0, (target.hp / target.maxHp) * 100)}%` }} />
          {o && o.dmg > 0 && <i className="loss" style={{ left: `${Math.max(0, ((target.hp - o.dmg) / target.maxHp) * 100)}%`, width: `${(Math.min(o.dmg, target.hp) / target.maxHp) * 100}%` }} />}
        </span>
        <span className="hpn">
          {target.hp}/{target.maxHp}
        </span>
        <button className="g-x" aria-label="Cancelar" onClick={onCancel}>
          <Icon id="close" />
        </button>
      </div>
      <div className="g-fc-stats">
        <div className={`st ${pct !== null && pct >= 70 ? 'good' : pct !== null && pct < 45 ? 'bad' : ''}`}>
          <b>{pct !== null ? `${pct}%` : '—'}</b>
          <small>acerto</small>
        </div>
        <div className="st">
          <b>{o ? (o.kills ? `${o.dmg} ☠` : o.dmg) : '—'}</b>
          <small>{o?.kills ? 'derruba' : 'dano provável'}</small>
        </div>
        <div className="st">
          <b>{cost}</b>
          <small>AP</small>
        </div>
      </div>
      {options.length > 1 && (
        <div className="g-fc-alts">
          {options.slice(0, 5).map((d) => (
            <button key={d.id} className={`g-pill ${d.id === def.id ? 'gold' : ''}`} onClick={() => onPick(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
      )}
      <button className="g-cta g-fc-go" autoFocus onClick={onConfirm}>
        Atacar
      </button>
    </div>
  );
}

function EnemyActing({ S, f }: { S: CombatState; f: Figure }) {
  const intent = intentFor(S, f.typeId);
  const name = reg().enemies[f.typeId]?.name ?? f.name;
  return (
    <div className="g-enemy-turn" key={f.id}>
      <span className="who">{name}</span>
      {intent && (
        <span className="what">
          <Icon id={`tempo_${intent.tempo}`} /> {intent.name}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ threat preview (who each enemy will hit this Cycle)
interface Threat {
  from: string;
  to: string[];
  dano: Record<string, number>;
  tempo: Tempo;
  name: string;
}
/** Runs each revealed Intention's plan on a copy of the state to learn its targets (the real state is untouched). */
function predictThreats(S: CombatState): Threat[] {
  const out: Threat[] = [];
  if (S.phase === 'deploy' || S.result) return out;
  for (const f of S.figures) {
    if (f.side !== 'E' || f.status !== 'active') continue;
    const intent = intentFor(S, f.typeId);
    if (!intent || !['melee', 'ranged', 'area', 'control'].includes(intent.kind)) continue;
    try {
      const copy = structuredClone(S);
      copy.queue = [];
      copy.pending = null;
      copy.settings = { ...copy.settings, autoTieBreak: true };
      const c2 = ctxOf(copy);
      const self = copy.figures.find((x) => x.id === f.id)!;
      intent.plan(c2, self);
      for (const op of copy.queue) {
        if (op.op !== 'eAttack') continue;
        const to = op.spec.targetIds.filter((id) => S.figures.some((h) => h.id === id && h.side === 'H' && h.status === 'active'));
        if (!to.length) continue;
        const dano: Record<string, number> = {};
        for (const id of to) dano[id] = op.spec.dano + (op.spec.perTargetBonus[id] ?? 0);
        out.push({ from: f.id, to, dano, tempo: intent.tempo, name: intent.name });
      }
    } catch {
      /* a plan that needs a decision (tie) is simply not previewed */
    }
  }
  return out;
}
function incomingDamage(threats: Threat[]): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const t of threats) for (const id of t.to) sum[id] = (sum[id] ?? 0) + (t.dano[id] ?? 0);
  return sum;
}

/** Red dashed arcs from each enemy to the hero it will attack, following the 3D figures every frame. */
function ThreatLines({ threats, diorama }: { threats: Threat[]; diorama: NonNullable<ReturnType<typeof useApp>['diorama']> }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const svg = ref.current;
      if (!svg) return;
      let i = 0;
      for (const t of threats) {
        const a = diorama.screenOf(t.from);
        for (const to of t.to) {
          const b = diorama.screenOf(to);
          const path = svg.children[i++] as SVGGElement | undefined;
          if (!path) continue;
          if (!a || !b) {
            path.style.display = 'none';
            continue;
          }
          path.style.display = '';
          const ay = a.y + 30;
          const by = b.y + 20;
          const mx = (a.x + b.x) / 2;
          const my = Math.min(ay, by) - 40 - Math.abs(a.x - b.x) * 0.15;
          (path.children[0] as SVGPathElement).setAttribute('d', `M${a.x},${ay} Q${mx},${my} ${b.x},${by}`);
          const badge = path.children[1] as SVGGElement;
          badge.setAttribute('transform', `translate(${b.x},${by - 6})`);
        }
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [threats, diorama]);
  return (
    <svg ref={ref} className="g-threats" aria-hidden>
      {threats.flatMap((t) =>
        t.to.map((to) => (
          <g key={t.from + to} className={`th t-${t.tempo}`}>
            <path />
            <g>
              <circle r="11" />
              <text y="4" textAnchor="middle">
                {t.dano[to]}
              </text>
            </g>
          </g>
        )),
      )}
    </svg>
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
      {sev && S.objectives['contrapesos'] && <span className="cw">· Contrapesos {S.boss.contrapesos.filter((c) => c.used).length}/3</span>}
    </div>
  );
}

/** Extra objectives of special encounters (e.g. deciphering the Sete Linhas) — tap for how. */
function ObjectivePill({ S }: { S: CombatState }) {
  const [open, setOpen] = useState(false);
  const o = S.objectives['setelinhas'];
  if (!o) return null;
  return (
    <button className={`g-obj ${o.done ? 'done' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
      <Icon id="sete_linhas" />
      <span>{o.done ? 'Sete Linhas decifradas' : 'Objetivo: decifrar as Sete Linhas'}</span>
      {open && !o.done && <small>Um herói na Retaguarda usa a ação “Decifrar as Sete Linhas” (1 AP, uma tentativa por ciclo).</small>}
    </button>
  );
}

// ------------------------------------------------------------------ hero dock (portraits)
function Dock({ S, heroes, tempoHero, incoming, onTap }: { S: CombatState; heroes: Figure[]; tempoHero: string | null; incoming: Record<string, number>; onTap(id: string): void }) {
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
            {!down && incoming[h.id] > 0 && (
              <span className="threat" title={`Ameaçado: até ${incoming[h.id]} de dano neste ciclo`}>
                −{incoming[h.id]}
              </span>
            )}
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
  // who acts when, in the real order: within a rhythm, heroes act before the enemies of that rhythm
  const typesShown = S.typeOrder.filter((t) => S.figures.some((f) => f.typeId === t && f.side === 'E' && f.status === 'active'));
  const timeline = (['rapido', 'tatico', 'pesado'] as Tempo[]).map((t) => ({
    t,
    heroes: heroes.filter((x) => x.tempo === t),
    enemies: typesShown.filter((ty) => intentFor(S, ty)?.tempo === t),
  }));
  return (
    <div className="g-tempo">
      <div className="g-timeline" aria-label="Ordem do ciclo">
        {timeline.map((col, i) => (
          <div key={col.t} className={`col t-${col.t}`}>
            <div className="hd">
              <Icon id={`tempo_${col.t}`} />
              {i + 1}º {TEMPO_NAME[col.t]}
            </div>
            <div className="who">
              {col.heroes.map((x) => (
                <button key={x.id} className={`av h ${x.id === heroId ? 'sel' : ''}`} style={{ ['--acc' as string]: CLASS_COLOR[x.typeId] }} onClick={() => s.controls(x.id) && setHero(x.id)} aria-label={x.name}>
                  <Icon id={`class_${x.typeId}`} />
                </button>
              ))}
              {col.heroes.length > 0 && col.enemies.length > 0 && <span className="then">›</span>}
              {col.enemies.map((ty) => {
                const n = S.figures.filter((f) => f.typeId === ty && f.status === 'active').length;
                return (
                  <span key={ty} className="av e" title={reg().enemies[ty]?.name}>
                    <Icon id="act_attack_melee" />
                    {n > 1 && <b>×{n}</b>}
                  </span>
                );
              })}
              {col.heroes.length === 0 && col.enemies.length === 0 && <span className="none">—</span>}
            </div>
          </div>
        ))}
      </div>
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
      {all && !heroId && mine.length > 0 && (
        <div className="g-tempo-sum">
          {mine.map((x) => (
            <button key={x.id} className={`chip-t t-${x.tempo}`} style={{ ['--acc' as string]: CLASS_COLOR[x.typeId] }} onClick={() => setHero(x.id)} aria-label={`${x.name}: ${TEMPO_NAME[x.tempo as Tempo]}. Mudar`}>
              <Icon id={`class_${x.typeId}`} className="cls" />
              <Icon id={`tempo_${x.tempo}`} className="tmp" />
            </button>
          ))}
          <span className="lbl">Toque para mudar o ritmo</span>
        </div>
      )}
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
  const [settled, setSettled] = useState(false);
  const [gone, setGone] = useState(false);
  const slow = (window as unknown as { __diceSlow?: number }).__diceSlow ?? 1;
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setGone(true), 1250 * slow);
    return () => clearTimeout(t);
  }, [settled]);
  useEffect(() => {
    // safety: never keep the dice up for long
    const t = setTimeout(() => setGone(true), 4000 * slow);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  const r = ev.roll;
  return (
    <>
      <Dice3D ev={ev} onSettled={() => setSettled(true)} />
      {settled && (
        <div className="g-dice" aria-live="polite">
          <div className={`verdict ${r.critico ? 'crit' : r.successes ? 'ok' : 'no'}`}>
            {r.critico ? 'CRÍTICO!' : r.successes ? `${r.successes} sucesso${r.successes > 1 ? 's' : ''}` : 'Falhou'}
            {r.impulsos > 0 && <span className="imp">+{r.impulsos} impulso{r.impulsos > 1 ? 's' : ''}</span>}
          </div>
        </div>
      )}
    </>
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
