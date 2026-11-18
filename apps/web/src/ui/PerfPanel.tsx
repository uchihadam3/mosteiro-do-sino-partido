import React, { useEffect, useState } from 'react';
import type { Diorama } from '../three/Diorama';

export function PerfPanel({ diorama }: { diorama: Diorama }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(i);
  }, []);
  const s = diorama.stats;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return (
    <div className="perf panel">
      <b>{s.fps} FPS</b> · {s.frameMs} ms
      <br />
      draw calls {s.calls} · tris {(s.tris / 1000).toFixed(1)}k
      <br />
      geo {s.geos} · tex {s.texs} · cena {s.sceneLoadMs} ms
      <br />
      qualidade {diorama.quality}
      {mem ? ` · heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''}
      {s.fps && s.fps < 30 ? <div className="warn">⚠ quadro lento</div> : null}
    </div>
  );
}
