/**
 * The tutorial's coach. Uses the mentor character from the cinema module when available;
 * falls back to a bell emblem.
 */
import React from 'react';
import { Icon } from '../ui/Icon';

export const MENTOR_NAME = 'O Sineiro';

export function Mentor() {
  return (
    <div className="tut-mentor" aria-label={MENTOR_NAME}>
      <div className="face">
        <Icon id="item_bell" />
      </div>
      <span className="nm">{MENTOR_NAME}</span>
    </div>
  );
}
