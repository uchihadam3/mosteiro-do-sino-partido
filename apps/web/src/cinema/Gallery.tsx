/** Dev view of the brand art (?cinema=gallery): studio mark, game logo variants, mentor portrait sizes. */
import React from 'react';
import { StudioMark, StudioWordmark } from './StudioMark';
import { GameEmblem, GameLogo } from './GameLogo';
import { MentorPortrait } from './MentorPortrait';

export function Gallery() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, overflow: 'auto', background: 'radial-gradient(ellipse at 50% 30%, #2a1d16, #070505 70%)', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <StudioMark className="g-sm" />
        <StudioWordmark />
      </div>
      <GameLogo size="title" />
      <GameLogo size="title" layout="row" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <GameEmblem className="g-em" />
        <GameLogo size="loading" layout="row" />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <MentorPortrait size={300} speaking />
        <MentorPortrait size={96} />
        <MentorPortrait size={56} />
        <MentorPortrait size={40} />
      </div>
      <style>{'.g-sm{width:220px;height:auto}.g-em{width:90px;height:auto}'}</style>
    </div>
  );
}
