/**
 * The tutorial's coach: Irmão Anselmo, o Último Sineiro (the same mentor who speaks in the cutscenes).
 */
import React from 'react';
import { MentorPortrait } from '../cinema/MentorPortrait';
import { MENTOR } from '../cinema/brand';

export const MENTOR_NAME = MENTOR.short;

export function Mentor() {
  return (
    <div className="tut-mentor" aria-label={MENTOR.name}>
      <div className="face">
        <MentorPortrait size={44} speaking />
      </div>
      <span className="nm">{MENTOR_NAME}</span>
    </div>
  );
}
