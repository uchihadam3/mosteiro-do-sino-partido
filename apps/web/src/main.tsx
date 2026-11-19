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
createRoot(document.getElementById('root')!).render(<App />);
