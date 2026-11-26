import React from 'react';
import { createRoot } from 'react-dom/client';
import { installContent } from '@mosteiro/content';
import { apply as applySettings } from './state/settings';
import { audio } from './audio/AudioDirector';
import { registerSW } from './pwa/register';
import { loadIconSprite } from './ui/Icon';
import { App } from './app/App';
import './ui/styles.css';
import './ui/hud.css';
import './ui/kit.css';

installContent();
applySettings();
void audio.init();
void loadIconSprite();
registerSW();
// An app installed while the game was landscape-only keeps that lock until Android refreshes it (days): ask for
// free rotation now, and again on the first touch (some browsers only allow it after a gesture).
const freeRotation = () => {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (t: string) => Promise<void> };
    void o?.lock?.('any')?.catch?.(() => undefined);
  } catch {
    /* not supported: the manifest decides */
  }
};
freeRotation();
window.addEventListener('pointerdown', freeRotation, { once: true, capture: true });
createRoot(document.getElementById('root')!).render(<App />);
