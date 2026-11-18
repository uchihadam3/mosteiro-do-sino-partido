/**
 * Deterministic, serializable RNG (sfc32). State lives inside game state so that
 * save/load and network replays reproduce identical rolls (§E: "fonte RNG injetável").
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
  /** Number of draws performed (for debugging / desync detection). */
  n: number;
}

function hashSeed(seed: string): [number, number, number, number] {
  // cyrb128
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function createRng(seed: string): RngState {
  const [a, b, c, d] = hashSeed(seed);
  const s: RngState = { a, b, c, d, n: 0 };
  for (let i = 0; i < 12; i++) nextU32(s);
  s.n = 0;
  return s;
}

/** Mutates state; returns uint32. */
export function nextU32(s: RngState): number {
  const t = (((s.a + s.b) | 0) + s.d) | 0;
  s.d = (s.d + 1) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.c = (s.c + t) | 0;
  s.n++;
  return t >>> 0;
}

/** Uniform integer in [1, sides]. Rejection sampling to avoid modulo bias. */
export function rollInt(s: RngState, sides: number): number {
  const limit = Math.floor(0x100000000 / sides) * sides;
  let v = nextU32(s);
  while (v >= limit) v = nextU32(s);
  return (v % sides) + 1;
}

export function shuffle<T>(s: RngState, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rollInt(s, i + 1) - 1;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cloneRng(s: RngState): RngState {
  return { ...s };
}
