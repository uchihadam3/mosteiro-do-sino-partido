import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/App';
import { Icon } from './Icon';
import { exportSave, hasContinue, importSave, listSlots, loadSlot, type SlotInfo } from '../state/persistence';
import { session } from '../state/session';
import { canInstall, isStandalone, onPwaChange, promptInstall } from '../pwa/register';
import { SettingsModal, Sheet } from './Settings';
import { toast } from './Toasts';
import { audio } from '../audio/AudioDirector';
import './menus.css';

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
  const hover = () => audio.play('ui_hover', { volume: 0.4 });
  return (
    <div className="m-title">
      <div className="m-logo">
        <div className="pre">Mosteiro do</div>
        <h1>Sino Partido</h1>
        <div className="rule" />
        <p className="tag">O sino rachou há décadas. O som nunca parou.</p>
      </div>
      <div className="spacer" />
      <nav className="m-menu" aria-label="Menu principal">
        {cont && (
          <button className="k-cta" onClick={doContinue} disabled={loading} onMouseEnter={hover}>
            <Icon id="fast_forward" /> Continuar
          </button>
        )}
        <button className={cont ? 'k-btn' : 'k-cta'} onClick={() => go('newgame')} onMouseEnter={hover}>
          <Icon id="class_paladino" /> Novo Jogo
        </button>
        <button className="k-btn" onClick={() => go('online')} onMouseEnter={hover}>
          <Icon id="map_path" /> Jogar Online
        </button>
        <div className="pair">
          <button className="k-btn" onClick={() => setShowLoad(true)} onMouseEnter={hover}>
            <Icon id="save" /> Carregar
          </button>
          <button className="k-btn" onClick={() => setShowSettings(true)} onMouseEnter={hover}>
            <Icon id="settings" /> Configurações
          </button>
        </div>
        {canInstall() && !isStandalone() && (
          <button className="k-btn" onClick={() => void promptInstall()} onMouseEnter={hover}>
            <Icon id="save" /> Instalar
          </button>
        )}
      </nav>
      <div className="m-title-foot">
        <span className="k-chip gold">Modo Básico · Dungeon 1</span>
        <span className="k-chip">Avançado em breve</span>
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
  const exportSlot = async (slot: SlotInfo['slot']) => {
    try {
      exportSave(await loadSlot(slot));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <Sheet
      title="Carregar"
      onClose={onClose}
      foot={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                session.startLocal(await importSave(file));
                go('game');
              } catch (err) {
                toast((err as Error).message, 'error');
              }
            }}
          />
          <button className="k-btn" onClick={() => fileRef.current?.click()}>
            <Icon id="save" /> Importar arquivo
          </button>
        </>
      }
    >
      <div className="m-rows">
        {slots === null && <div className="m-hint">Lendo saves…</div>}
        {slots?.length === 0 && <div className="m-empty">Nenhum save neste aparelho ainda.</div>}
        {slots?.map((s) => (
          <div key={s.slot} className="m-slot">
            <button className="m-rowbtn" onClick={() => load(s.slot)} disabled={!s.ok}>
              <span className="m-ico-disc">
                <Icon id={s.slot === 'auto' ? 'tempo_rapido' : 'save'} />
              </span>
              <span className="lbl">
                {s.slot === 'auto' ? 'Autosave' : `Slot ${s.slot.slice(-1)}`}
                <span className="sub">{s.ok ? s.summary : 'Arquivo corrompido'}</span>
                <span className="sub">{new Date(s.savedAt).toLocaleString('pt-BR')}</span>
              </span>
            </button>
            {s.ok && (
              <button className="m-mini" onClick={() => void exportSlot(s.slot)} aria-label="Exportar" title="Exportar arquivo">
                <Icon id="load" />
              </button>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
