import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../app/hooks';
import { Inventory } from './Inventory';
import { Icon } from './Icon';
import { useEscape } from './party/Sheet';
import './party.css';

/** Party equipment & Mochila outside combat (opened from the exploration party strip). */
export function InventoryModal({ onClose, heroId: initial }: { onClose(): void; heroId?: string }) {
  const s = useSession();
  const st = s.state!;
  const [heroId, setHeroId] = useState(initial && st.heroes.some((h) => h.id === initial) ? initial : st.heroes[0].id);
  useEscape(onClose);
  return createPortal(
    <div className="pt-modal-back" onClick={onClose}>
      <div className="pt-modal" role="dialog" aria-modal="true" aria-label="Equipamento e Mochila" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="pt-modal-head">
          <div className="k-title">
            <div className="k-kicker">Party</div>
            <h2 className="k-h1">Equipamento</h2>
          </div>
          <button className="k-round" onClick={onClose} aria-label="Fechar">
            <Icon id="close" />
          </button>
        </div>
        <div className="pt-modal-body">
          <Inventory heroId={heroId} setHeroId={setHeroId} inBase={false} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
