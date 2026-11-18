import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { dungeon, reg, type CampaignState, type SectorKey } from '@mosteiro/core';
import { Diorama } from '../three/Diorama';
import { audio } from '../audio/AudioDirector';
import { session } from '../state/session';
import { useSession, useSettings } from './hooks';
import { flushAutosave } from '../state/persistence';
import { Title } from '../ui/Title';
import { NewGame } from '../ui/NewGame';
import { OnlineLobby } from '../ui/OnlineLobby';
import { GameScreens } from '../ui/GameScreens';
import { Toasts } from '../ui/Toasts';
import { PerfPanel } from '../ui/PerfPanel';
import { UpdateBanner } from '../ui/UpdateBanner';

export type Route = 'title' | 'newgame' | 'online' | 'game';
interface AppCtx {
  route: Route;
  go(r: Route): void;
  diorama: Diorama | null;
}
const Ctx = createContext<AppCtx>({ route: 'title', go: () => undefined, diorama: null });
export const useApp = () => useContext(Ctx);

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [diorama, setDiorama] = useState<Diorama | null>(null);
  const [route, setRoute] = useState<Route>('title');
  const s = useSession();
  const settings = useSettings();

  useEffect(() => {
    const d = new Diorama(stageRef.current!, labelsRef.current!, {
      onSound: (id, o) => audio.play(id, o),
    });
    d.setQuality(settings.quality);
    void d.loadScene('campanario');
    d.setMode('title');
    setDiorama(d);
    (window as unknown as { __diorama: Diorama }).__diorama = d;
    const off = session.onEvents((evs) => d.play(evs));
    void debugBoot(setRoute);
    const save = () => void flushAutosave();
    window.addEventListener('pagehide', save);
    return () => {
      off();
      window.removeEventListener('pagehide', save);
      d.dispose();
    };
  }, []);

  useEffect(() => {
    if (!diorama) return;
    diorama.setQuality(settings.quality);
  }, [settings.quality, diorama]);
  useEffect(() => {
    if (diorama) diorama.speed = settings.animSpeed;
  }, [settings.animSpeed, diorama]);

  // scene / music direction from game state
  const st = s.state;
  useEffect(() => {
    if (!diorama) return;
    if (route !== 'game' || !st) {
      void diorama.loadScene('campanario');
      diorama.setMode('title');
      audio.setMusic('music_title');
      audio.setAmbience('amb_belltower');
      return;
    }
    const d = dungeon(st.dungeonId);
    if (st.phase === 'base' || st.phase === 'prep' || st.phase === 'complete') {
      void diorama.loadScene('claustro');
      diorama.setMode('explore');
      audio.setMusic('music_base');
      audio.setAmbience('amb_torches_fire');
      void diorama.syncParty(partyView(st));
      return;
    }
    const encId = st.combatEncounterId;
    const enc = encId ? d.encounters.find((e) => e.id === encId) : undefined;
    const locId = st.phase === 'combat' && enc ? enc.locationId : st.node;
    const loc = d.locations.find((l) => l.id === locId) ?? d.locations[0];
    void diorama.loadScene(loc.scene);
    audio.setAmbience(loc.ambience);
    if (st.phase === 'combat' && st.combat && enc) {
      diorama.setMode('combat');
      audio.setMusic(enc.music);
    } else {
      diorama.setMode('explore');
      audio.setMusic(st.phase === 'gameover' ? null : 'music_explore');
      void diorama.syncParty(partyView(st));
    }
  }, [diorama, route, st?.phase, st?.node, st?.combatEncounterId, st?.heroes.map((h) => h.status + h.equipment.primary?.itemId).join()]);

  // keep combat figures synced
  useEffect(() => {
    if (!diorama || !st?.combat || st.phase !== 'combat') return;
    const weapons: Record<string, string | undefined> = {};
    for (const h of st.heroes) weapons[h.id] = h.equipment.primary ? reg().items[h.equipment.primary.itemId]?.icon : undefined;
    for (const f of st.combat.figures) if (f.side === 'H' && f.equipment?.primary) weapons[f.id] = reg().items[f.equipment.primary.itemId]?.icon;
    void diorama.syncCombat(st.combat, weapons);
  }, [diorama, s.seq]);

  const go = (r: Route) => {
    audio.play('ui_confirm', { volume: 0.6 });
    setRoute(r);
  };
  useEffect(() => {
    if (s.state && route !== 'game' && (s.role !== 'local' || s.lobby.started)) setRoute('game');
  }, [s.state, s.lobby.started]);

  return (
    <Ctx.Provider value={{ route, go, diorama }}>
      <div className="stage" ref={stageRef} />
      <div className="labels" ref={labelsRef} />
      <div className="vignette" />
      {route === 'title' && <Title />}
      {route === 'newgame' && <NewGame />}
      {route === 'online' && <OnlineLobby />}
      {route === 'game' && s.state && <GameScreens />}
      <Toasts />
      <UpdateBanner />
      {settings.showPerf && diorama && <PerfPanel diorama={diorama} />}
    </Ctx.Provider>
  );
}

/** Dev/test shortcut: ?debug=combat&enc=GAL-E01&party=guerreiro,clerigo — or ?debug=explore. Not shown in UI. */
async function debugBoot(setRoute: (r: Route) => void) {
  const q = new URLSearchParams(location.search);
  const mode = q.get('debug');
  if (!mode) return;
  const { newCampaign, startEncounter, campaignDispatch } = await import('@mosteiro/core');
  const party = (q.get('party') ?? 'guerreiro,clerigo,arqueiro').split(',');
  let st = newCampaign({ seed: q.get('seed') ?? 'debug', dungeonId: 'd1', heroes: party.map((c, i) => ({ classId: c, name: ['Bertrand', 'Irmã Clara', 'Leda', 'Severa', 'Corvo'][i] ?? c })), now: Date.now() });
  if (mode !== 'prep') {
    st = campaignDispatch(st, { t: 'beginDungeon' }).state;
    st = campaignDispatch(st, { t: 'closeNarrative' }).state;
  }
  if (q.get('node')) st = { ...st, node: q.get('node')!, flags: { ...st.flags, route: 'leste', routeDone: true, rareOffered: true } };
  if (mode === 'combat') {
    st = structuredClone(st);
    startEncounter(st, q.get('enc') ?? 'GAL-E01');
  }
  session.startLocal(st);
  setRoute('game');
}

export function partyView(st: CampaignState) {
  return st.heroes.map((h) => ({ id: h.id, classId: h.classId, name: h.name, weaponIcon: h.equipment.primary ? reg().items[h.equipment.primary.itemId]?.icon : undefined, sector: (st.formation[h.id] ?? 'H:F3') as SectorKey, down: h.status !== 'ok' }));
}
