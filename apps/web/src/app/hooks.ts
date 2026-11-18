import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { session } from '../state/session';
import { getSettings, subscribeSettings } from '../state/settings';

export function useSession() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => session.subscribe(force), []);
  return session;
}
export function useSettings() {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
