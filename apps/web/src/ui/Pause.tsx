import React, { useEffect, useState } from 'react';
import { useApp } from '../app/App';
import { useSession } from '../app/hooks';
import { session } from '../state/session';
import { exportSave, flushAutosave, listSlots, MANUAL_SLOTS, saveSlot, type SlotInfo } from '../state/persistence';
import { SettingsModal } from './Settings';
import { Icon } from './Icon';
import { toast } from './Toasts';
import { RulesModal } from './Rules';

export function PauseMenu({ onClose }: { onClose(): void }) {
  const { go } = useApp();
  const s = useSession();
  const [view, setView] = useState<'main' | 'save' | 'settings' | 'rules'>('main');
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  useEffect(() => void listSlots().then(setSlots), [view]);
  if (view === 'settings') return <SettingsModal onClose={() => setView('main')} />;
  if (view === 'rules') return <RulesModal onClose={() => setView('main')} />;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel ornate" style={{ width: 'min(460px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="kicker">Pausa</div>
        <h2 className="h2">Mosteiro do Sino Partido</h2>
        <div className="divider" />
        {view === 'main' && (
          <div className="col">
            <button className="btn primary" onClick={onClose}>
              Retomar
            </button>
            {s.role !== 'client' && (
              <button className="btn" onClick={() => setView('save')}>
                <Icon id="save" /> Salvar em slot
              </button>
            )}
            <button className="btn" onClick={() => setView('rules')}>
              <Icon id="info" /> Referência de regras
            </button>
            <button className="btn" onClick={() => setView('settings')}>
              <Icon id="settings" /> Configurações
            </button>
            {s.state && (
              <button className="btn" onClick={() => exportSave(s.state!)}>
                <Icon id="load" /> Exportar save
              </button>
            )}
            <button
              className="btn danger"
              onClick={async () => {
                await flushAutosave();
                session.close();
                onClose();
                go('title');
              }}
            >
              Sair para o menu (progresso salvo)
            </button>
          </div>
        )}
        {view === 'save' && (
          <div className="col">
            {MANUAL_SLOTS.map((slot, i) => {
              const info = slots.find((x) => x.slot === slot);
              return (
                <button
                  key={slot}
                  className="slot"
                  onClick={async () => {
                    await saveSlot(slot, s.state!, `Slot ${i + 1}`);
                    toast(`Salvo no Slot ${i + 1}.`);
                    setView('main');
                  }}
                >
                  <Icon id="save" />
                  <div className="grow">
                    <div className="sl">Slot {i + 1}</div>
                    <div className="small">{info ? info.summary : 'Vazio'}</div>
                    {info && <div className="xs muted">{new Date(info.savedAt).toLocaleString('pt-BR')}</div>}
                  </div>
                </button>
              );
            })}
            <button className="btn" onClick={() => setView('main')}>
              Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
