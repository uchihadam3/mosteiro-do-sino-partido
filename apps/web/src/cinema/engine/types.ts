/**
 * Cutscene data model. A cutscene is a list of shots; each shot has camera keyframes, actor tracks and timed cues.
 * Scripts are plain data with small functions where state matters (who is in the party, which boss, which epilogue).
 */
import type * as THREE from 'three';
import type { CampaignState } from '@mosteiro/core';
import type { Diorama } from '../../three/Diorama';
import type { Stage } from './stage';

export type V3 = [number, number, number];
export type EaseName = 'linear' | 'in' | 'out' | 'inOut' | 'outBack' | 'outQuart' | 'inOutSine';

/** A world point, or a point on a staged actor ('head' | 'chest' | 'feet' | 'top'). */
export type Point = V3 | { actor: string; part?: 'head' | 'chest' | 'feet' | 'top'; off?: V3 };

export interface OrbitKey {
  /** What the camera looks at. */
  target: Point;
  /** Degrees around Y; 0 = camera on +Z of the target looking toward −Z. */
  yaw: number;
  /** Degrees above the horizon (camera looks down when positive). */
  pitch: number;
  /** Fixed distance; otherwise computed from `fit` so the subject fits any aspect. */
  dist?: number;
  /** [width, height] in world units that must stay inside the visible picture. */
  fit?: [number, number];
  /** Shift the look point in screen space (fraction of the picture, +x right, +y up) without moving the subject out. */
  shift?: [number, number];
}

export interface CamKey {
  t: number;
  pos?: Point;
  look?: Point;
  orbit?: OrbitKey;
  /** Vertical field of view in degrees for a 16:9 picture (adapted for other aspects). */
  fov?: number;
  roll?: number;
  /** Easing into this key from the previous one. */
  ease?: EaseName;
  /** Overrides used when the screen is portrait (phone upright). */
  p?: Partial<Omit<CamKey, 't' | 'p'>>;
  /** Portrait: fraction of the 16:9 width that must stay visible for explicit pos/look keys (default 0.62). */
  pk?: number;
}

export interface ActorPathKey {
  t: number;
  pos: V3;
  ease?: EaseName;
}

export interface ActorTrack {
  actor: string;
  path?: ActorPathKey[];
  /** Yaw in degrees, a point, or another actor id to face. Default: direction of travel. */
  face?: number | Point;
  /** Looping animation key for the shot ('idle', 'walk', or a clip name). */
  base?: string;
  visible?: boolean;
  /** Animation speed multiplier for the base loop. */
  speed?: number;
}

export interface Cue {
  at: number;
  /** Subtitle. `who` = speaker id (see SPEAKERS in the script) — omitted = narration. */
  line?: string;
  who?: string;
  dur?: number;
  /** Boss name card. */
  card?: { kick?: string; name: string; epi?: string };
  /** Chapter title card. */
  chapter?: { num: string; title: string };
  sfx?: string;
  vol?: number;
  rate?: number;
  music?: string | null;
  amb?: string | null;
  duck?: number;
  flash?: number;
  color?: number;
  shake?: number;
  /** Black overlay target opacity (0..1) and transition time. */
  fade?: number;
  /** One-shot animation on an actor. */
  play?: { actor: string; anim: string; speed?: number; hold?: boolean };
  /** Transient effect (skipped when the player taps ahead). */
  fx?: (c: Ctx) => void;
  /** Persistent change (also applied when tapping ahead past it). */
  state?: (c: Ctx) => void;
}

export interface Shot {
  dur: number;
  /** Named set pieces visible in this shot (Stage.sets); others are hidden. Default: all sets. */
  sets?: string[];
  /** Show the location backdrop (diorama.environment). */
  env?: boolean;
  /** Show the Diorama's own particles (ambient ash, torch embers). */
  vfx?: boolean;
  /** Override scene fog for this shot (null = no fog; undefined = keep the location's). */
  fog?: { color: number; density: number } | null;
  /** Override the clear color. */
  bg?: number;
  cam: CamKey[];
  cues?: Cue[];
  actors?: ActorTrack[];
  /** Low-frequency handheld sway amplitude (world units). */
  sway?: number;
  /** Lowest camera height (location shots default to 0.3 so aspect adaptation never sinks it under the floor). */
  minY?: number;
}

export type Trigger = { on: 'dungeonStart' } | { on: 'combatStart'; encounterId: string } | { on: 'dungeonEnd' };

export interface Speaker {
  name: string;
  /** 'mentor' shows the mentor portrait; 'villain' tints the line. */
  kind?: 'mentor' | 'villain' | 'other';
}

export interface Cutscene {
  id: string;
  dungeonId: string;
  title: string;
  trigger: Trigger;
  /** Location backdrop to load (diorama.loadScene). */
  scene?: string | ((st: CampaignState) => string | undefined);
  music?: string | null;
  amb?: string | null;
  speakers?: Record<string, Speaker>;
  /** Build sets and actors (GLB loads happen here, before the first frame is shown). */
  setup(c: Ctx): Promise<void>;
  shots: Shot[] | ((c: Ctx) => Shot[]);
}

export interface Ctx {
  d: Diorama;
  st: CampaignState;
  stage: Stage;
  three: typeof THREE;
  /** Current picture aspect (width / height of the visible picture). */
  aspect: number;
  portrait: boolean;
  reduced: boolean;
  /** Seconds since the cutscene started. */
  time: number;
  /** Free storage for scripts (e.g. computed positions). */
  data: Record<string, unknown>;
}
