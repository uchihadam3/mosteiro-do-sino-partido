"""Builds the PWA app icons (192/512) from the game emblem: the cracked bronze bell under a gothic arch.
Mirrors apps/web/src/cinema/GameLogo.tsx (GameEmblem). Maskable-safe: the emblem stays inside the centre 70%.
Deterministic."""
import io, pathlib
import cairosvg
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / 'apps/web/public/icons'

CRACK = 'M113 195 L109.5 183 L115.5 171 L108.5 158 L113 146 L106 132 L110 120 L104 107'
BELL = ('M100 89 C86 89 78 95 76 107 C73 125 72 147 66 167 C62 179 55 185 50 188 L50 195 L150 195 L150 188 '
        'C145 185 138 179 134 167 C128 147 127 125 124 107 C122 95 114 89 100 89 Z')
ARCH = ('M28 228 L28 110 A90 90 0 0 1 100 22 A90 90 0 0 1 172 110 L172 228 L160 228 L160 112 A78 78 0 0 0 100 36 '
        'A78 78 0 0 0 40 112 L40 228 Z')

EMBLEM = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">
<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff2c8"/><stop offset="0.28" stop-color="#e9c97c"/><stop offset="0.55" stop-color="#b2843f"/>
    <stop offset="0.8" stop-color="#6e4c1f"/><stop offset="1" stop-color="#c9a25a"/></linearGradient>
  <linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7a5623"/><stop offset="0.3" stop-color="#f3dc9c"/><stop offset="0.55" stop-color="#b98a43"/><stop offset="1" stop-color="#5e421b"/></linearGradient>
  <linearGradient id="bronze" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#24150a"/><stop offset="0.16" stop-color="#6b4320"/><stop offset="0.34" stop-color="#d9a35a"/>
    <stop offset="0.42" stop-color="#f7d595"/><stop offset="0.56" stop-color="#a8702f"/><stop offset="0.8" stop-color="#4d2f14"/><stop offset="1" stop-color="#1c1007"/></linearGradient>
  <radialGradient id="niche" cx="0.5" cy="0.62" r="0.62">
    <stop offset="0" stop-color="#4a2410"/><stop offset="0.45" stop-color="#1a0f0a"/><stop offset="1" stop-color="#080606"/></radialGradient>
  <linearGradient id="ember" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#fff3c4"/><stop offset="0.5" stop-color="#ffb347"/><stop offset="1" stop-color="#ff6a1e"/></linearGradient>
</defs>
<path d="M40 226 L40 112 A78 78 0 0 1 100 36 A78 78 0 0 1 160 112 L160 226 Z" fill="url(#niche)"/>
<rect x="56" y="80" width="88" height="9" rx="2" fill="url(#goldH)"/>
<path d="M92 90 C92 81 108 81 108 90" fill="none" stroke="url(#goldH)" stroke-width="4"/>
<path d="{BELL}" fill="url(#bronze)"/>
<path d="M60 178 Q100 170 140 178" fill="none" stroke="#f4d796" stroke-opacity="0.45" stroke-width="1.4"/>
<ellipse cx="100" cy="195" rx="50" ry="5.5" fill="#120a05"/>
<path d="{CRACK}" fill="none" stroke="#120703" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
<path d="{CRACK}" fill="none" stroke="#ff8a3a" stroke-opacity="0.45" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
<path d="{CRACK}" fill="none" stroke="url(#ember)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
<path d="{ARCH}" fill="url(#gold)" fill-rule="evenodd"/>
<rect x="23" y="104" width="22" height="7" rx="1" fill="url(#goldH)"/>
<rect x="155" y="104" width="22" height="7" rx="1" fill="url(#goldH)"/>
<path d="M100 3 L105.5 14 L100 24 L94.5 14 Z" fill="url(#gold)"/>
<rect x="16" y="226" width="168" height="9" rx="1.5" fill="url(#goldH)"/>
</svg>'''


def build(size: int):
    h = int(size * 0.66)
    w = int(h * 200 / 240)
    png = cairosvg.svg2png(bytestring=EMBLEM.encode(), output_width=w, output_height=h)
    glyph = Image.open(io.BytesIO(png)).convert('RGBA')
    img = Image.new('RGBA', (size, size), (12, 10, 10, 255))
    # warm glow behind the bell
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = int(size * 0.32)
    cx, cy = size // 2, int(size * 0.55)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(230, 120, 40, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.1))
    img = Image.alpha_composite(img, glow)
    # vignette
    vig = Image.new('L', (size, size), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-size * 0.2, -size * 0.2, size * 1.2, size * 1.2], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(size * 0.12))
    dark = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    img = Image.composite(img, dark, vig)
    img.alpha_composite(glyph, ((size - w) // 2, (size - h) // 2 + int(size * 0.01)))
    OUT.mkdir(parents=True, exist_ok=True)
    img.convert('RGB').save(OUT / f'app-{size}.png', optimize=True)


if __name__ == '__main__':
    for s in (192, 512):
        build(s)
    print('ok')
