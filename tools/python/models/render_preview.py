"""Software rasterizer contact sheet for the generated GLBs (numpy + pillow).

python render_preview.py [--out PATH] [--only id1,id2] [--size 360]
Front 3/4 view, orthographic, z-buffered, Lambert + hemispheric ambient, so
silhouettes and proportions can be judged without a GPU or Blender.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gltf_io import MATERIALS, read_glb, world_primitives  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "../../../apps/web/public/assets/models"))
PREVIEW_COLORS = {  # sRGB-ish display tints (brighter than PBR factors for legibility)
    "stone_floor": (150, 144, 134), "stone_wall": (160, 152, 140), "stone_plate": (176, 170, 158),
    "wood_dark": (112, 76, 50), "bronze_aged": (176, 138, 76), "iron_rusted": (110, 92, 82),
    "cloth_wool": (150, 40, 34), "parchment": (220, 200, 160), "wax": (236, 226, 200),
    "leather": (130, 74, 44), "stained_glass": (120, 90, 170), "flame": (255, 170, 60),
}


def render(path, size=360, az=35.0, el=22.0, ss=2):
    js, binc, _ = read_glb(path)
    prims = world_primitives(js, binc)
    W = H = size * ss
    a, e = math.radians(az), math.radians(el)
    # camera looks from +Z/+X quadrant towards origin
    fwd = -np.array([math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e)])
    right = np.cross(fwd, [0, 1, 0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    allp = np.concatenate([p[2] for p in prims])
    lo, hi = allp.min(0), allp.max(0)
    center = (lo + hi) / 2
    corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    pc = corners - center
    ext = max(np.abs(pc @ right).max(), np.abs(pc @ up).max()) * 1.08
    scale = (W / 2) / ext
    zbuf = np.full(W * H, np.inf)
    cbuf = np.zeros((W * H, 3))
    light = np.array([-0.45, 0.8, 0.55])
    light /= np.linalg.norm(light)
    fill = np.array([0.6, 0.2, -0.4])
    fill /= np.linalg.norm(fill)
    for name, mat, wp, wn, idx, col in prims:
        rel = wp - center
        sx = rel @ right * scale + W / 2
        sy = H / 2 - rel @ up * scale
        dz = rel @ fwd
        nrm = wn / np.maximum(np.linalg.norm(wn, axis=1, keepdims=True), 1e-9)
        base = np.array(PREVIEW_COLORS.get(mat, (200, 0, 200)), float) / 255.0
        lam = np.clip(nrm @ light, 0, 1) * 0.85 + np.clip(nrm @ fill, 0, 1) * 0.2 + 0.18 + 0.12 * nrm[:, 1]
        if mat == "flame":
            lam = np.full_like(lam, 1.4)
        vcol = base[None, :] * lam[:, None]
        if col is not None:
            vcol = vcol * col[:, :3]
        if MATERIALS[mat][1] > 0.5:  # cheap metal sheen
            spec = np.clip(nrm @ (light - fwd) / np.linalg.norm(light - fwd), 0, 1) ** 24
            vcol = vcol + spec[:, None] * 0.5
        _raster(sx, sy, dz, vcol, idx, W, H, zbuf, cbuf)
    bg = np.array([0.11, 0.10, 0.11])
    img = np.where(np.isinf(zbuf)[:, None], bg, cbuf).reshape(H, W, 3)
    img = np.clip(img, 0, 1) ** (1 / 1.15)
    im = Image.fromarray((img * 255).astype(np.uint8))
    return im.resize((size, size), Image.LANCZOS), (hi - lo)


def _raster(sx, sy, dz, vcol, idx, W, H, zbuf, cbuf):
    x0, y0, z0 = sx[idx[:, 0]], sy[idx[:, 0]], dz[idx[:, 0]]
    x1, y1, z1 = sx[idx[:, 1]], sy[idx[:, 1]], dz[idx[:, 1]]
    x2, y2, z2 = sx[idx[:, 2]], sy[idx[:, 2]], dz[idx[:, 2]]
    area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    ok = np.abs(area) > 1e-9
    xmin = np.clip(np.floor(np.minimum(np.minimum(x0, x1), x2)), 0, W - 1).astype(int)
    xmax = np.clip(np.ceil(np.maximum(np.maximum(x0, x1), x2)), 0, W - 1).astype(int)
    ymin = np.clip(np.floor(np.minimum(np.minimum(y0, y1), y2)), 0, H - 1).astype(int)
    ymax = np.clip(np.ceil(np.maximum(np.maximum(y0, y1), y2)), 0, H - 1).astype(int)
    bw, bh = xmax - xmin + 1, ymax - ymin + 1
    cnt = np.where(ok, bw * bh, 0)
    tri_ids = np.nonzero(cnt)[0]
    # process in chunks to bound memory
    chunk = []
    acc = 0
    for t in tri_ids:
        chunk.append(t)
        acc += cnt[t]
        if acc > 3_000_000:
            _do(np.array(chunk), locals_=(x0, y0, z0, x1, y1, z1, x2, y2, z2, area, xmin, ymin, bw, cnt), vcol=vcol,
                idx=idx, W=W, zbuf=zbuf, cbuf=cbuf)
            chunk, acc = [], 0
    if chunk:
        _do(np.array(chunk), locals_=(x0, y0, z0, x1, y1, z1, x2, y2, z2, area, xmin, ymin, bw, cnt), vcol=vcol,
            idx=idx, W=W, zbuf=zbuf, cbuf=cbuf)


def _do(ts, locals_, vcol, idx, W, zbuf, cbuf):
    x0, y0, z0, x1, y1, z1, x2, y2, z2, area, xmin, ymin, bw, cnt = locals_
    c = cnt[ts]
    rep = np.repeat(ts, c)
    local = np.arange(c.sum()) - np.repeat(np.cumsum(c) - c, c)
    px = xmin[rep] + local % bw[rep] + 0.5
    py = ymin[rep] + local // bw[rep] + 0.5
    A = area[rep]
    w0 = ((x1[rep] - px) * (y2[rep] - py) - (x2[rep] - px) * (y1[rep] - py)) / A
    w1 = ((x2[rep] - px) * (y0[rep] - py) - (x0[rep] - px) * (y2[rep] - py)) / A
    w2 = 1 - w0 - w1
    inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
    rep, px, py, w0, w1, w2 = rep[inside], px[inside], py[inside], w0[inside], w1[inside], w2[inside]
    z = w0 * z0[rep] + w1 * z1[rep] + w2 * z2[rep]
    pix = (py.astype(int)) * W + px.astype(int)
    order = np.lexsort((z, pix))
    pix_s = pix[order]
    first = np.ones(len(pix_s), bool)
    first[1:] = pix_s[1:] != pix_s[:-1]
    sel = order[first]
    pp, zz = pix[sel], z[sel]
    better = zz < zbuf[pp]
    sel, pp, zz = sel[better], pp[better], zz[better]
    t = rep[sel]
    col = (w0[sel, None] * vcol[idx[t, 0]] + w1[sel, None] * vcol[idx[t, 1]] + w2[sel, None] * vcol[idx[t, 2]])
    zbuf[pp] = zz
    cbuf[pp] = col


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "models_contact.png"))
    ap.add_argument("--only", default="")
    ap.add_argument("--size", type=int, default=300)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--az", type=float, default=35.0)
    ap.add_argument("--el", type=float, default=22.0)
    args = ap.parse_args()
    man = json.load(open(os.path.join(OUT_DIR, "manifest.json")))
    ids = [m["id"] for m in man["models"]]
    if args.only:
        want = args.only.split(",")
        ids = [i for i in ids if i in want]
    tiles = []
    for i in ids:
        im, dims = render(os.path.join(OUT_DIR, i + ".glb"), args.size, args.az, args.el)
        d = ImageDraw.Draw(im)
        d.text((6, 4), i, fill=(235, 225, 200))
        d.text((6, args.size - 14), f"{dims[0]:.2f} x {dims[1]:.2f} x {dims[2]:.2f} m", fill=(160, 150, 140))
        tiles.append(im)
    cols = min(args.cols, len(tiles))
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new("RGB", (cols * args.size, rows * args.size), (20, 18, 20))
    for k, im in enumerate(tiles):
        sheet.paste(im, ((k % cols) * args.size, (k // cols) * args.size))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sheet.save(args.out)
    print(args.out)


if __name__ == "__main__":
    main()
