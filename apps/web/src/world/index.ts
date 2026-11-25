/**
 * Real-time exploration ("world" mode) — owned by the World module.
 * App.tsx calls enterWorld() whenever the campaign is in the explore phase and leaveWorld() otherwise.
 * While WORLD_ENABLED is false the classic exploration screen is used.
 */
import type { CampaignState } from '@mosteiro/core';
import type { Diorama } from '../three/Diorama';

export const WORLD_ENABLED = false;

/** Called on every relevant state change while the campaign is exploring (location, party, phase). */
export function enterWorld(_d: Diorama, _st: CampaignState): void {}

/** Called when the campaign leaves exploration (combat, base, title...). Must restore Diorama hooks it took. */
export function leaveWorld(_d: Diorama): void {}
