"""Builds the PWA app icons (192/512) from the generated 'ressonancia' bell icon. Deterministic."""
import io, pathlib, re
import cairosvg
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[3]
ICON = ROOT / 'apps/web/public/assets/icons/ressonancia.svg'
OUT = ROOT / 'apps/web/public/icons'

def build(size: int):
    svg = ICON.read_text().replace('currentColor', '#e6cf8f')
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=int(size * 0.56), output_height=int(size * 0.56))
    glyph = Image.open(io.BytesIO(png)).convert('RGBA')
    img = Image.new('RGBA', (size, size), (14, 12, 12, 255))
    d = ImageDraw.Draw(img)
    # radial warm glow
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = int(size * 0.36)
    gd.ellipse([size // 2 - r, size // 2 - r, size // 2 + r, size // 2 + r], fill=(200, 140, 60, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.08))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)
    m = int(size * 0.08)
    d.ellipse([m, m, size - m, size - m], outline=(184, 154, 90, 255), width=max(2, size // 96))
    img.alpha_composite(glyph, ((size - glyph.width) // 2, (size - glyph.height) // 2))
    OUT.mkdir(parents=True, exist_ok=True)
    img.convert('RGB').save(OUT / f'app-{size}.png', optimize=True)

if __name__ == '__main__':
    for s in (192, 512):
        build(s)
    print('ok')
