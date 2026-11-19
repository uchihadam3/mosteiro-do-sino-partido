import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import './menus.css';

type Toast = { id: number; text: string; kind: 'info' | 'error' };
let push: (t: Omit<Toast, 'id'>) => void = () => undefined;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  push({ text, kind });
}
/** Small pills at the top centre — never over the bottom action area. */
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    push = (t) => {
      const id = ++n;
      setList((l) => [...l.filter((x) => x.text !== t.text).slice(-2), { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.kind === 'error' ? 3600 : 2600);
    };
  }, []);
  return (
    <div className="m-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`m-toast ${t.kind}`}>
          <Icon id={t.kind === 'error' ? 'warning' : 'check'} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
