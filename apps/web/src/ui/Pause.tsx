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

function Row({ icon, label, sub, onClick, danger }: { icon: string; label: string; sub?: string; onClick(): void; danger?: boolean }) {
  return (
    <button className={`m-rowbtn ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="m-ico-disc">
        <Icon id={icon} />
      </span>
      <span className="lbl">
        {label}
        {sub && <span className="sub">{sub}</span>}
      </span>
      <span className="chev" aria-hidden />
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
        <div className="m-rows">
          {MANUAL_SLOTS.map((slot, i) => {
            const info = slots.find((x) => x.slot === slot);
            return (
              <Row
                key={slot}
                icon="save"
                label={`Slot ${i + 1}`}
                sub={info ? `${info.summary} · ${new Date(info.savedAt).toLocaleString('pt-BR')}` : 'Vazio'}
                onClick={async () => {
                  await saveSlot(slot, s.state!, `Slot ${i + 1}`);
                  toast(`Salvo no Slot ${i + 1}.`);
                  setView('main');
                }}
              />
            );
          })}
        </div>
      </Sheet>
    );
  return (
    <Sheet kicker="Mosteiro do Sino Partido" title="Pausa" onClose={onClose} foot={<button className="k-cta" onClick={onClose}>Retomar</button>}>
      <div className="m-rows">
        {s.role !== 'client' && <Row icon="save" label="Salvar" sub="Guardar num dos 3 slots" onClick={() => setView('save')} />}
        <Row icon="info" label="Regras" sub="Referência rápida" onClick={() => setView('rules')} />
        <Row
          icon="tempo_rapido"
          label="Rever tutorial"
          sub="O mentor ensina de novo, passo a passo"
          onClick={() => {
            resetTutorial();
            toast('O tutorial volta na próxima batalha.', 'info');
            onClose();
          }}
        />
        <Row icon="settings" label="Configurações" sub="Som, imagem e acessibilidade" onClick={() => setView('settings')} />
        {s.state && <Row icon="load" label="Exportar save" sub="Baixar arquivo .json" onClick={() => exportSave(s.state!)} />}
        <Row icon="back" label="Sair para o menu" sub="Seu progresso fica salvo" danger onClick={() => void quit()} />
      </div>
    </Sheet>
  );
}
