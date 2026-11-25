/**
 * Cinematics — studio splash, game logo, intro and cutscenes. Owned by the Cinema module.
 * App.tsx shows <Splash> as the first route when SPLASH_ENABLED, and always renders <CinemaLayer> above the game.
 */
import React, { useSyncExternalStore } from 'react';
import { Splash as SplashView } from './Splash';
import { getCineView, subscribeCinema as subscribe } from './player';
import { Gallery } from './Gallery';

export const SPLASH_ENABLED = true;

export function Splash({ onDone }: { onDone(): void }) {
  if (new URLSearchParams(location.search).get('cinema') === 'gallery') return <Gallery />;
  return <SplashView onDone={onDone} />;
}

export { CinemaLayer } from './Layer';
export { GameLogo, GameEmblem, GameWordmark } from './GameLogo';
export { StudioMark, StudioWordmark } from './StudioMark';
export { MentorPortrait } from './MentorPortrait';
export { STUDIO, GAME, MENTOR } from './brand';
export { cinema, isCinemaPlaying, subscribeCinema } from './player';
export { registerCutscene, cutscenesFor } from './registry';

/** True while a cutscene owns the screen (the tutorial / HUD can wait for it). */
export function useCinemaPlaying(): boolean {
  return useSyncExternalStore(subscribe, () => getCineView().active);
}
