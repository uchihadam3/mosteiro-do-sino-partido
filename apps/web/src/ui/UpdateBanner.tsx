import React, { useEffect, useState } from 'react';
import { applyUpdate, onPwaChange, updateAvailable } from '../pwa/register';
import { flushAutosave } from '../state/persistence';
import './menus.css';

/** Compact pill at the top when a new version is ready; progress is saved before reloading. */
export function UpdateBanner() {
  const [, f] = useState(0);
  useEffect(() => onPwaChange(() => f((x) => x + 1)), []);
  if (!updateAvailable()) return null;
  return (
    <div className="m-update" role="status">
      <span className="t">Nova versão pronta</span>
      <button onClick={async () => { await flushAutosave(); applyUpdate(); }}>Atualizar agora</button>
    </div>
  );
}
