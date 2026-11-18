import React, { useState } from 'react';
import { useSession } from '../app/hooks';
import { Inventory } from './Inventory';

export function InventoryModal({ onClose }: { onClose(): void }) {
  const s = useSession();
  const [heroId, setHeroId] = useState(s.state!.heroes[0].id);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel ornate" style={{ width: 'min(1060px, 97vw)', height: 'min(720px, 94vh)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <div className="grow">
            <div className="kicker">Party</div>
            <h2 className="h2">Equipamento e Mochila</h2>
          </div>
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="divider" />
        <div className="body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: 'grid' }}>
            <Inventory heroId={heroId} setHeroId={setHeroId} inBase={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
