import React, { useEffect, useState } from 'react';
import { audio } from '../audio/AudioDirector';

/** Sound captions (Settings → Legendas de áudio): the latest one, bottom-centre, fading after a moment. */
export function Captions() {
  const [cap, setCap] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    audio.onCaption = (text) => {
      setCap({ text, key: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setCap(null), 2600);
    };
    return () => {
      audio.onCaption = null;
      clearTimeout(timer);
    };
  }, []);
  if (!cap) return null;
  return (
    <div className="caption" key={cap.key} role="status" aria-live="polite">
      {cap.text}
    </div>
  );
}
