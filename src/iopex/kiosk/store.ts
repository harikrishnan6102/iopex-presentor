import { useSyncExternalStore } from 'react';
import type { ProductId } from '../data/products';

export type View = 'home' | ProductId;
export type Mode = 'manual' | 'gesture';

export interface KioskState {
  /** Which surface is on screen: the home carousel or one product deck. */
  view: View;
  /** Manual (arrows/swipe/keys) or Gesture (camera motion-swipe) on a deck. */
  mode: Mode;
}

type Listener = () => void;

let state: KioskState = { view: 'home', mode: 'manual' };
const listeners = new Set<Listener>();

export const kioskStore = {
  get: (): KioskState => state,
  set(patch: Partial<KioskState>): void {
    const next = { ...state, ...patch };
    if (next.view === state.view && next.mode === state.mode) return;
    state = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useKioskState(): KioskState {
  return useSyncExternalStore(kioskStore.subscribe, kioskStore.get, kioskStore.get);
}

export function openProductKey(): ProductId | null {
  return state.view === 'home' ? null : state.view;
}
