import React, { useEffect, useState } from 'react';
import { useApp } from '../app/App';
import { useSession } from '../app/hooks';
import { session } from '../state/session';
import { exportSave, flushAutosave, listSlots, MANUAL_SLOTS, saveSlot, type SlotInfo } from '../state/persistence';
import { SettingsModal, Sheet } from './Settings';
import { Icon } from './Icon';
import { toast } from './Toasts';
import { RulesModal } from './Rules';
import { resetTutorial } from '../tutorial';
import './menus.css';
import './settings.css';

/** A big square menu tile: icon medallion, label, one-line hint. */
function Tile({ icon, label, sub, onClick, danger }: { icon: string; label: string; sub?: string; onClick(): void; danger?: boolean }) {
  return (
    <button className={`pz-tile ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="pz-ic">
        <Icon id={icon} />
      </span>
      <span className="pz-l">{label}</span>
      {sub && <span className="pz-s">{sub}</span>}
    </button>
  );
}

export function PauseMenu({ onClose }: { onClose(): void }) {
  const { go } = useApp();
  const s = useSession();
  const [view, setView] = useState<'main' | 'save' | 'settings' | 'rules'>('main');
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  useEffect(() => void listSlots().then(setSlots), [view]);
  if (view === 'settings') return <SettingsModal onClose={() => setView('main')} />;
  if (view === 'rules') return <RulesModal onClose={() => setView('main')} />;
  const quit = async () => {
    await flushAutosave();
    session.close();
    onClose();
    go('title');
  };
  if (view === 'save')
    return (
      <Sheet kicker="Pausa" title="Salvar em slot" onClose={() => setView('main')}>
        <div className="pz-slots">
          {MANUAL_SLOTS.map((slot, i) => {
            const info = slots.find((x) => x.slot === slot);
            return (
              <button
                key={slot}
                className={`pz-slot ${info ? 'full' : ''}`}
                onClick={async () => {
                  await saveSlot(slot, s.state!, `Slot ${i + 1}`);
                  toast(`Salvo no Slot ${i + 1}.`);
                  setView('main');
                }}
              >
                <span className="pz-slot-n">{i + 1}</span>
                <Icon id="save" />
                <span className="pz-slot-s">{info ? info.summary : 'Vazio'}</span>
                {info && (
                  <small>
                    {new Date(info.savedAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  return (
    <Sheet
      kicker="Mosteiro do Sino Partido"
      title="Pausa"
      onClose={onClose}
      foot={
        <button className="k-cta" onClick={onClose}>
          Retomar
        </button>
      }
    >
      <div className="pz-grid">
        {s.role !== 'client' && <Tile icon="save" label="Salvar" sub="3 espaços" onClick={() => setView('save')} />}
        <Tile icon="info" label="Regras" sub="Consulta rápida" onClick={() => setView('rules')} />
        <Tile
          icon="tempo_rapido"
          label="Rever tutorial"
          sub="O mentor volta"
          onClick={() => {
            resetTutorial();
            toast('O tutorial volta na próxima batalha.', 'info');
            onClose();
          }}
        />
        <Tile icon="settings" label="Opções" sub="Som e imagem" onClick={() => setView('settings')} />
        {s.state && <Tile icon="load" label="Exportar" sub="Arquivo .json" onClick={() => exportSave(s.state!)} />}
        <Tile icon="back" label="Sair" sub="Progresso salvo" danger onClick={() => void quit()} />
      </div>
    </Sheet>
  );
}
