import React, { useEffect, useState } from 'react';
import { applyUpdate, onPwaChange, updateAvailable } from '../pwa/register';
import { flushAutosave } from '../state/persistence';

export function UpdateBanner() {
  const [, f] = useState(0);
  useEffect(() => onPwaChange(() => f((x) => x + 1)), []);
  if (!updateAvailable()) return null;
  return (
    <div className="update-banner panel ornate">
      <div>
        <div className="kicker">Atualização disponível</div>
        <div className="small muted">Uma nova versão do jogo foi baixada. Seu progresso está salvo.</div>
      </div>
      <button className="btn primary sm" onClick={async () => { await flushAutosave(); applyUpdate(); }}>
        Atualizar agora
      </button>
    </div>
  );
}
