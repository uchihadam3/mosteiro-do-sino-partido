import React, { useEffect, useState } from 'react';

type Toast = { id: number; text: string; kind: 'info' | 'error' };
let push: (t: Omit<Toast, 'id'>) => void = () => undefined;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  push({ text, kind });
}
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    push = (t) => {
      const id = ++n;
      setList((l) => [...l.slice(-3), { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.kind === 'error' ? 3600 : 2600);
    };
  }, []);
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast panel ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
