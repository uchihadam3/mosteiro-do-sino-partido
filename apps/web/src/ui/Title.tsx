import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/App';
import { Icon } from './Icon';
import { hasContinue, importSave, listSlots, loadSlot, type SlotInfo } from '../state/persistence';
import { session } from '../state/session';
import { canInstall, isStandalone, onPwaChange, promptInstall } from '../pwa/register';
import { SettingsModal } from './Settings';
import { toast } from './Toasts';
import { audio } from '../audio/AudioDirector';

export function Title() {
  const { go } = useApp();
  const [cont, setCont] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [, f] = useState(0);
  useEffect(() => {
    void hasContinue().then(setCont);
    return onPwaChange(() => f((x) => x + 1));
  }, []);
  const doContinue = async () => {
    setLoading(true);
    try {
      const s = await loadSlot('auto');
      session.startLocal(s);
      go('game');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="overlay screen-fade">
      <div className="title-screen">
        <div className="title-left">
          <h1 className="logo">
            <small>Mosteiro do</small>
            Sino Partido
          </h1>
          <p className="tagline">O sino rachou há décadas. O som nunca parou — apenas ficou do lado de dentro.</p>
          <nav className="menu" aria-label="Menu principal">
            {cont && (
              <button className="btn primary" onClick={doContinue} disabled={loading} onMouseEnter={() => audio.play('ui_hover', { volume: 0.4 })}>
                <Icon id="load" /> Continuar
              </button>
            )}
            <button className={`btn ${cont ? '' : 'primary'}`} onClick={() => go('newgame')} onMouseEnter={() => audio.play('ui_hover', { volume: 0.4 })}>
              <Icon id="class_paladino" /> Novo Jogo
            </button>
            <button className="btn" onClick={() => go('online')} onMouseEnter={() => audio.play('ui_hover', { volume: 0.4 })}>
              <Icon id="map_path" /> Jogar Online
            </button>
            <button className="btn" onClick={() => setShowLoad(true)} onMouseEnter={() => audio.play('ui_hover', { volume: 0.4 })}>
              <Icon id="save" /> Carregar
            </button>
            <button className="btn" onClick={() => setShowSettings(true)} onMouseEnter={() => audio.play('ui_hover', { volume: 0.4 })}>
              <Icon id="settings" /> Configurações
            </button>
            {canInstall() && !isStandalone() && (
              <button className="btn" onClick={() => void promptInstall()}>
                <Icon id="load" /> Instalar o Jogo
              </button>
            )}
          </nav>
        </div>
      </div>
      <div className="title-foot xs muted">
        <span className="chip gold">Modo Básico · Dungeon 1</span>
        <span className="chip">Modo Avançado — em desenvolvimento</span>
        <span>v{__APP_VERSION__}</span>
      </div>
      {showLoad && <LoadModal onClose={() => setShowLoad(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export function LoadModal({ onClose }: { onClose(): void }) {
  const { go } = useApp();
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => void listSlots().then(setSlots), []);
  const load = async (slot: SlotInfo['slot']) => {
    try {
      session.startLocal(await loadSlot(slot));
      go('game');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel ornate" onClick={(e) => e.stopPropagation()}>
        <h2 className="h2">Carregar</h2>
        <div className="divider" />
        <div className="body col">
          {slots === null && <div className="muted">Lendo saves…</div>}
          {slots?.length === 0 && <div className="muted">Nenhum save encontrado neste dispositivo.</div>}
          {slots?.map((s) => (
            <button key={s.slot} className="slot" onClick={() => load(s.slot)} disabled={!s.ok}>
              <Icon id={s.slot === 'auto' ? 'load' : 'save'} />
              <div className="grow">
                <div className="sl">{s.slot === 'auto' ? 'Autosave' : `Slot ${s.slot.slice(-1)}`}</div>
                <div>{s.summary}</div>
                <div className="xs muted">{new Date(s.savedAt).toLocaleString('pt-BR')}{s.ok ? '' : ' · corrompido'}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="actions">
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              session.startLocal(await importSave(file));
              go('game');
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }} />
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar arquivo</button>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
