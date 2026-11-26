/** Per-device preferences (localStorage, guarded). */
export interface Settings {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
  uiScale: number;
  reducedMotion: boolean;
  highContrast: boolean;
  animSpeed: 1 | 1.5 | 2 | 3;
  autoTieBreak: boolean;
  /** Always open the attack result to choose Impulsos (otherwise they are spent on the best effect). */
  askImpulse: boolean;
  showPerf: boolean;
  subtitles: boolean;
  playerName: string;
}
const DEFAULTS: Settings = {
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
  ambience: 0.6,
  muted: false,
  quality: 'auto',
  uiScale: 1,
  reducedMotion: false,
  highContrast: false,
  animSpeed: 1,
  autoTieBreak: false,
  askImpulse: false,
  showPerf: false,
  subtitles: true,
  playerName: 'Peregrino',
};
const KEY = 'mosteiro.settings.v1';
let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* private mode */
  }
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return { ...DEFAULTS, reducedMotion: true };
  return { ...DEFAULTS };
}
export function getSettings(): Settings {
  return current;
}
export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  apply();
  listeners.forEach((l) => l());
}
export function subscribeSettings(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function apply() {
  const r = document.documentElement;
  r.style.setProperty('--ui-scale', String(current.uiScale));
  r.dataset.motion = current.reducedMotion ? 'reduced' : 'full';
  r.dataset.contrast = current.highContrast ? 'high' : 'normal';
}
