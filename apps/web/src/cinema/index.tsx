/**
 * Cinematics — studio splash, intro, cutscenes. Owned by the Cinema module.
 * App.tsx shows <Splash> as the first route when SPLASH_ENABLED, and always renders <CinemaLayer> above the game.
 */
import { useEffect } from 'react';

export const SPLASH_ENABLED = false;

export function Splash({ onDone }: { onDone(): void }) {
  useEffect(() => onDone(), []);
  return null;
}

/** Plays cutscenes when the game reaches story beats (new campaign, boss encounters, ending). */
export function CinemaLayer() {
  return null;
}
