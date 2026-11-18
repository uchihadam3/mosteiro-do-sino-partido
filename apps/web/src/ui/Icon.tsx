import React from 'react';

/** Injects the generated SVG sprite (tools/python/textures/build_icons.py) once; icons tint via currentColor. */
export async function loadIconSprite() {
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'assets/icons/icons.svg');
    const txt = await r.text();
    const div = document.createElement('div');
    div.style.display = 'none';
    div.setAttribute('aria-hidden', 'true');
    div.innerHTML = txt;
    document.body.prepend(div);
  } catch {
    /* offline first load: icons appear after cache */
  }
}

export function Icon({ id, size, className, title, style }: { id: string; size?: number | string; className?: string; title?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`ico ${className ?? ''}`} style={{ width: size, height: size, ...style }} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <use href={`#${id}`} />
    </svg>
  );
}
