/**
 * Tiny external store shared by the real-time world (imperative, Three.js) and the exploration HUD (React).
 * The world publishes what the player can do right now; the HUD sends back requests through `worldActions`.
 */
import { useSyncExternalStore } from 'react';
import type { ExploreOption } from '@mosteiro/core';

/** The contextual action offered when the leader stands next to something (big button at the bottom). */
export interface WorldPrompt {
  optionId: string;
  /** Button text, e.g. "Entrar · Galeria dos Peregrinos" or "Ler as Sete Linhas". */
  text: string;
  /** Short line under it (route, danger). */
  sub?: string;
  kind: ExploreOption['kind'];
  fight: boolean;
  secret: boolean;
  icon: string;
}

export interface WorldUiState {
  /** The real-time world is driving exploration (false → HUD falls back to plain choices). */
  active: boolean;
  /** A scripted moment (door, cutscene-like transition) is running: hide the action UI. */
  busy: boolean;
  prompt: WorldPrompt | null;
  /** Option waiting for the "no way back" confirmation. */
  confirm: { optionId: string; label: string; warning: string } | null;
  /** Cinematic caption (location arrival text the first time a room is entered). */
  caption: { text: string; key: number } | null;
  /** First-time movement hint. */
  hint: null | 'touch' | 'mouse';
  /** Option this device voted for and is waiting on the rest of the party (online). */
  waiting: string | null;
  /** Ids of options whose interactable is currently on screen and highlighted (main path first). */
  main: string[];
}

let state: WorldUiState = { active: false, busy: false, prompt: null, confirm: null, caption: null, hint: null, waiting: null, main: [] };
const listeners = new Set<() => void>();

export const worldUi = {
  get: () => state,
  set(patch: Partial<WorldUiState>) {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof WorldUiState)[]) {
      if (state[k] !== patch[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useWorldUi(): WorldUiState {
  return useSyncExternalStore(worldUi.subscribe, worldUi.get, worldUi.get);
}

/** HUD → world requests. The world installs the real handlers while it is active. */
export interface WorldActionHandlers {
  /** Walk to the option's door/object and use it (asks for confirmation first when the option has a warning). */
  request(optionId: string, from: 'prompt' | 'list'): void;
  /** Confirmed (or warning-free) option: perform it. */
  go(optionId: string): void;
  /** Number of HUD sheets/modals currently open (blocks walking). */
  setUiOpen(open: boolean): void;
}

const noop: WorldActionHandlers = { request: () => undefined, go: () => undefined, setUiOpen: () => undefined };
let handlers: WorldActionHandlers = noop;
export function installWorldActions(h: WorldActionHandlers | null) {
  handlers = h ?? noop;
}
export const worldActions: WorldActionHandlers = {
  request: (id, from) => handlers.request(id, from),
  go: (id) => handlers.go(id),
  setUiOpen: (v) => handlers.setUiOpen(v),
};
