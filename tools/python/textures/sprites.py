"""Non-PBR helper textures: particles, decals, VFX rings, stained glass and UI.

Called from build_textures.py. Everything is drawn procedurally (numpy +
Pillow, supersampled for anti-aliasing). Original work of this project.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from texlib import (
    F32, Perlin, fbm, gblur, grid, hexc, lerp, ramp, smoothstep, spectral, to8,
)

SS = 4  # supersampling factor for vector-ish drawing


def rgba(rgb, a):
    rgb = np.broadcast_to(np.asarray(rgb, F32), a.shape + (3,))
    return Image.fromarray(np.dstack([to8(rgb), to8(a)]), "RGBA")


class Pen:
    """Supersampled grayscale canvas in output-pixel coordinates."""

    def __init__(self, w, h=None, ss=SS):
        self.w, self.h, self.ss = w, h or w, ss
        self.img = Image.new("L", (self.w * ss, self.h * ss), 0)
        self.d = ImageDraw.Draw(self.img)

    def _p(self, pts):
        return [(x * self.ss, y * self.ss) for x, y in pts]

    def line(self, pts, width, fill=255):
        self.d.line(self._p(pts), fill=fill, width=max(1, int(round(width * self.ss))), joint="curve")
        r = width * self.ss / 2
        for x, y in (pts[0], pts[-1]):
            self.d.ellipse([x * self.ss - r, y * self.ss - r, x * self.ss + r, y * self.ss + r], fill=fill)

    def poly(self, pts, fill=255):
        self.d.polygon(self._p(pts), fill=fill)

    def circle(self, cx, cy, r, fill=255):
        s = self.ss
        self.d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], fill=fill)

    def ring(self, cx, cy, r, width, fill=255):
        s = self.ss
        self.d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], outline=fill,
                       width=max(1, int(round(width * s))))

    def array(self):
        return np.asarray(self.img.resize((self.w, self.h), Image.LANCZOS), F32) / 255.0


def blob_radius(rng, n_harm=6, amp=0.25, jag=0.0, n=360):
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    r = np.ones(n)
    for k in range(2, 2 + n_harm):
        r += rng.normal(0, amp / k ** 0.8) * np.cos(k * th + rng.uniform(0, 2 * np.pi))
    if jag:
        r += rng.normal(0, jag, n)
        r = ndimage.uniform_filter1d(r, 3, mode="wrap")
    return th, np.clip(r, 0.25, None)


def atlas(cell, fn, seed, grid_n=4):
    out = np.zeros((cell * grid_n, cell * grid_n, 4), F32)
    for i in range(grid_n * grid_n):
        rgb, a = fn(np.random.default_rng(seed + i * 101), i)
        y, x = divmod(i, grid_n)
        out[y * cell:(y + 1) * cell, x * cell:(x + 1) * cell, :3] = rgb
        out[y * cell:(y + 1) * cell, x * cell:(x + 1) * cell, 3] = a
    return Image.fromarray(to8(out), "RGBA")


# --------------------------------------------------------------------------
# particles
# --------------------------------------------------------------------------

def ash_particle():
    cell = 128

    def flake(rng, i):
        p = Pen(cell)
        R = rng.uniform(22, 44)
        th, r = blob_radius(rng, 5, 0.35, jag=0.05)
        sx, sy = rng.uniform(0.55, 1.0), 1.0
        rot = rng.uniform(0, np.pi)
        pts = []
        for t, rr in zip(th, r):
            x, y = math.cos(t) * rr * R * sx, math.sin(t) * rr * R * sy
            pts.append((64 + x * math.cos(rot) - y * math.sin(rot), 64 + x * math.sin(rot) + y * math.cos(rot)))
        p.poly(pts)
        m = p.array()
        u, v = grid(cell)
        tex = fbm(u + rng.random(), v + rng.random(), 6, 4, int(rng.integers(1e6)))
        holes = smoothstep(0.28, 0.4, fbm(u, v, 10, 3, int(rng.integers(1e6))))
        edge = m - ndimage.grey_erosion(m, size=5)
        a = m * (0.55 + 0.45 * smoothstep(-0.4, 0.4, tex)) * (1 - holes * 0.85)
        a = ndimage.gaussian_filter(a, 0.6)
        tone = 0.72 + 0.12 * tex[..., None] - 0.25 * edge[..., None]
        rgb = np.clip(tone * hexc("#e6e1d8") / 0.85, 0, 1)
        return rgb, np.clip(a, 0, 1)

    return atlas(cell, flake, 11)


def ember_particle():
    cell = 128
    heat = ["#3a0804", "#7a1f0c", "#c2410f", "#e39a3b", "#ffd27a", "#fff6dc"]

    def ember(rng, i):
        y, x = np.mgrid[0:cell, 0:cell].astype(F32) + 0.5
        cx, cy = 64, 64
        kind = (i + i // 4) % 4
        if kind == 0:  # round spark
            r = rng.uniform(5, 9)
            d = np.hypot(x - cx, y - cy) / r
            core = np.exp(-d ** 2 * 1.6)
            halo = np.exp(-d * 0.75) * 0.5
            I = np.clip(core + halo * 0.6, 0, 1)
        elif kind == 1:  # streak
            ang = rng.uniform(-0.6, 0.6) - np.pi / 2
            L = rng.uniform(24, 46)
            dx, dy = x - cx, y - cy
            along = dx * math.cos(ang) + dy * math.sin(ang)
            perp = -dx * math.sin(ang) + dy * math.cos(ang)
            t = np.clip(along / L, -1, 1)
            w = rng.uniform(2.2, 3.5) * (1 - 0.6 * (t + 1) / 2)
            core = np.exp(-(perp / w) ** 2) * smoothstep(1.0, 0.3, np.abs(along / L)) * (0.55 + 0.45 * (1 - (t + 1) / 2))
            I = np.clip(core + 0.35 * np.exp(-np.hypot(perp / (w * 3), along / (L * 1.3)) ** 2), 0, 1)
        elif kind == 2:  # irregular glowing fleck
            th, rr = blob_radius(rng, 5, 0.4, jag=0.06)
            p = Pen(cell)
            R = rng.uniform(9, 16)
            p.poly([(cx + math.cos(t) * q * R, cy + math.sin(t) * q * R) for t, q in zip(th, rr)])
            m = p.array()
            u, v = grid(cell)
            n = fbm(u, v, 8, 3, int(rng.integers(1e6)))
            I = np.clip(m * (0.5 + 0.4 * n) + ndimage.gaussian_filter(m, 6) * 0.6, 0, 0.92)
        else:  # cluster of tiny sparks
            I = np.zeros((cell, cell), F32)
            for _ in range(rng.integers(3, 7)):
                px, py = rng.normal(64, 16, 2)
                r = rng.uniform(1.8, 4.0)
                d = np.hypot(x - px, y - py) / r
                I = np.maximum(I, np.exp(-d ** 2 * 1.5) + 0.25 * np.exp(-d * 0.9))
            I = np.clip(I, 0, 1)
        I *= smoothstep(64, 50, np.hypot(x - cx, y - cy))
        rgb = ramp(heat, np.clip(I * 1.05, 0, 1))
        a = np.clip(I * 1.25, 0, 1) ** 0.9
        return rgb, a

    return atlas(cell, ember, 23)


def smoke_puff():
    cell = 128

    def puff(rng, i):
        u, v = grid(cell)
        s1 = int(rng.integers(1e6))
        wu = fbm(u, v, 3, 3, s1) * 0.12
        wv = fbm(u, v, 3, 3, s1 + 1) * 0.12
        n = fbm(u + wu, v + wv, 4, 5, s1 + 2, gain=0.55)
        x = (u - 0.5) * 2
        y = (v - 0.5) * 2
        sq = rng.uniform(0.8, 1.15)
        d = np.hypot(x * sq, y / sq) + 0.35 * n
        a = smoothstep(0.95, 0.15, d) * (0.65 + 0.5 * smoothstep(-0.3, 0.4, n))
        a *= smoothstep(1.0, 0.82, np.hypot(x, y))  # never touch the cell edge
        a = np.clip(a * 0.85, 0, 1)
        shade = 0.8 + 0.2 * smoothstep(0.6, -0.6, x * 0.6 + y * 0.8) + 0.08 * n
        rgb = np.clip(shade[..., None] * hexc("#d9d6d0"), 0, 1)
        return rgb, a

    return atlas(cell, puff, 37)


def glow_radial():
    n = 256
    y, x = np.mgrid[0:n, 0:n].astype(F32) + 0.5
    r = np.hypot(x - n / 2, y - n / 2) / (n / 2)
    a = 0.75 * np.exp(-(r / 0.28) ** 2) + 0.35 * np.exp(-(r / 0.55) ** 2)
    a *= smoothstep(1.0, 0.75, r)
    a = a / a.max()
    a += (np.random.default_rng(5).random(a.shape) - 0.5) / 255.0  # dither against banding
    return rgba(np.ones(3), np.clip(a, 0, 1))


def light_shaft():
    w, h = 256, 1024
    y, x = np.mgrid[0:h, 0:w].astype(F32) + 0.5
    xn = (x / w - 0.5) * 2
    yn = y / h
    prof = np.exp(-(xn / 0.42) ** 2) * 0.8 + np.exp(-(xn / 0.75) ** 4) * 0.35
    rng = np.random.default_rng(8)
    line = ndimage.gaussian_filter1d(rng.standard_normal(w * 4), 6, mode="wrap")[::4]
    line = (line - line.min()) / (line.max() - line.min())
    slow = 0.85 + 0.15 * np.sin(yn[:, 0] * 9.0)[:, None] * np.sin(np.arange(w) / w * 13)[None, :]
    streak = 0.65 + 0.5 * line[None, :] * slow
    vert = smoothstep(0.0, 0.14, yn) * (1 - smoothstep(0.35, 1.0, yn)) ** 1.2
    a = prof * streak * vert
    a *= smoothstep(1.0, 0.85, np.abs(xn))
    a = np.clip(a / a.max() * 0.95, 0, 1)
    a += (rng.random(a.shape) - 0.5) / 255.0
    return rgba(np.ones(3), np.clip(a, 0, 1))


# --------------------------------------------------------------------------
# stained glass
# --------------------------------------------------------------------------

def stained_glass():
    W, H = 1024, 2048
    rng = np.random.default_rng(1307)
    m = 28
    r = W - 2 * m
    ys = m + 0.8660254 * r
    y, x = np.mgrid[0:H, 0:W].astype(F32) + 0.5

    def lancet(xx, yy):
        inside_rect = (xx >= m) & (xx <= W - m) & (yy >= ys) & (yy <= H - m)
        arch = (yy < ys) & (np.hypot(xx - m, yy - ys) <= r) & (np.hypot(xx - (W - m), yy - ys) <= r)
        return inside_rect | arch

    # supersampled outline for a clean silhouette
    p = Pen(W, H, ss=2)
    pts = []
    for k in range(60):
        t = k / 59 * math.radians(60)
        pts.append((W - m - r * math.cos(t), ys - r * math.sin(t)))
    for k in range(60):
        t = math.radians(60) - k / 59 * math.radians(60)
        pts.append((m + r * math.cos(t), ys - r * math.sin(t)))
    pts += [(W - m, H - m), (m, H - m)]
    p.poly(pts)
    shape_aa = p.array()
    shape = lancet(x, y)
    din = ndimage.distance_transform_edt(shape).astype(F32)

    label = np.zeros((H, W), np.int64)
    color_of = {}
    nid = [1]

    def new_piece(col):
        i = nid[0]
        nid[0] += 1
        color_of[i] = col
        return i

    palette = {
        "blue": ["#14205a", "#1b2c78", "#22378c", "#18266a", "#2a3f96"],
        "ruby": ["#6e0f10", "#8a1714", "#9e2217", "#7a1512"],
        "amber": ["#b5701c", "#c98a2a", "#d9a03c", "#a8641a"],
        "green": ["#1f4a2c", "#2a5c35", "#335f2c"],
        "white": ["#c9c2a6", "#b8b294", "#d6cfb4"],
        "violet": ["#3d2358", "#4a2a63"],
    }

    def pc(name):
        return hexc(palette[name][rng.integers(len(palette[name]))]) * rng.uniform(0.85, 1.12)

    # ---- field: diamond quarries
    cell = 92
    ru = (x + y) / cell
    rv = (x - y) / cell
    iu = np.floor(ru).astype(np.int64)
    iv = np.floor(rv).astype(np.int64)
    fu = ru - iu
    fv = rv - iv
    node = (np.minimum(fu, 1 - fu) < 0.16) & (np.minimum(fv, 1 - fv) < 0.16)
    keys = {}
    field = np.zeros((H, W), np.int64)
    flat = (iu * 1000 + iv).ravel()
    uniq, inv = np.unique(flat, return_inverse=True)
    ids = np.array([new_piece(pc("blue") if rng.random() > 0.12 else pc("violet")) for _ in uniq])
    field = ids[inv].reshape(H, W)
    # little ruby squares at lattice nodes
    nu = np.round(ru).astype(np.int64)
    nv = np.round(rv).astype(np.int64)
    nflat = (nu * 1000 + nv).ravel()
    nuniq, ninv = np.unique(nflat, return_inverse=True)
    nids = np.array([new_piece(pc("ruby") if rng.random() > 0.3 else pc("amber")) for _ in nuniq])
    field = np.where(node, nids[ninv].reshape(H, W), field)
    label[:] = field
    del keys

    # ---- medallions
    meds = [(W / 2, 520, 215), (W / 2, 1160, 225), (W / 2, 1690, 225)]
    med_ring = np.zeros((H, W), bool)
    for mi, (cx, cy, R) in enumerate(meds):
        dx, dy = x - cx, y - cy
        rr = np.hypot(dx, dy)
        ang = np.arctan2(dy, dx)
        # outer jewelled band
        band = (rr > R - 30) & (rr <= R)
        nseg = 16
        seg = np.floor((ang + np.pi) / (2 * np.pi) * nseg).astype(np.int64) % nseg
        seg_ids = [new_piece(pc("amber") if s % 2 == 0 else pc("white")) for s in range(nseg)]
        label = np.where(band, np.array(seg_ids)[seg], label)
        # inner ground
        inner = rr <= R - 30
        nseg2 = 8
        seg2 = np.floor((ang + np.pi) / (2 * np.pi) * nseg2 + 0.5).astype(np.int64) % nseg2
        ground_col = "ruby" if mi != 1 else "blue"
        g_ids = [new_piece(pc(ground_col)) for _ in range(nseg2)]
        label = np.where(inner, np.array(g_ids)[seg2], label)
        # quatrefoil of four lobes
        lobe_r = (R - 30) * 0.36
        qf = np.zeros_like(inner)
        for k in range(4):
            a = k * np.pi / 2 + (np.pi / 4 if mi == 1 else 0)
            lx, ly = cx + math.cos(a) * lobe_r, cy + math.sin(a) * lobe_r
            qf |= np.hypot(x - lx, y - ly) <= lobe_r * 0.92
        lobe_col = {"ruby": "blue", "blue": "ruby"}[ground_col]
        lobe_ids = [new_piece(pc(lobe_col)) for _ in range(4)]
        lobe_seg = np.floor((ang + np.pi + (np.pi / 4 if mi != 1 else 0)) / (np.pi / 2)).astype(np.int64) % 4
        label = np.where(qf & inner, np.array(lobe_ids)[lobe_seg], label)
        # central boss + petals
        petal = (rr < lobe_r * 0.75) & (rr > lobe_r * 0.32)
        nseg3 = 6
        seg3 = np.floor((ang + np.pi) / (2 * np.pi) * nseg3).astype(np.int64) % nseg3
        p_ids = [new_piece(pc("green") if s % 2 else pc("amber")) for s in range(nseg3)]
        label = np.where(petal, np.array(p_ids)[seg3], label)
        label = np.where(rr <= lobe_r * 0.32, new_piece(pc("white")), label)
        med_ring |= np.abs(rr - R) < 6
        med_ring |= np.abs(rr - (R - 30)) < 3.5

    # ---- border band following the lancet outline
    bw = 54
    border = shape & (din < bw)
    left = x < W / 2
    arc_s = np.where(left,
                     np.arctan2(ys - y, (W - m) - x),
                     np.arctan2(ys - y, x - m)) * r
    s_param = np.where(y >= ys, (H - m) - y, (H - m - ys) + arc_s)
    bottom = ((H - m) - y) < np.minimum(x - m, (W - m) - x)
    s_param = np.where(bottom, -1000 + x, s_param)
    bseg = np.floor(s_param / 62).astype(np.int64)
    bkey = bseg * 2 + left.astype(np.int64)
    buniq, binv = np.unique(bkey[border], return_inverse=True)
    b_ids = np.array([new_piece(pc("ruby") if (k // 2) % 3 else pc("amber")) for k in buniq])
    label[border] = b_ids[binv]
    # pearl dots in the border
    dots = border & (np.abs((s_param % 62) - 31) < 9) & (np.abs(din - bw / 2) < 9) & ((bseg % 3) == 0)
    label = np.where(dots, new_piece(pc("white")) * 0 + 0, label)  # placeholder, replaced below
    dot_id = new_piece(hexc("#d8cfae"))
    label = np.where(dots, dot_id, label)

    label = np.where(shape, label, 0)

    # ---- lead lines
    edges = np.zeros((H, W), bool)
    edges[:, 1:] |= label[:, 1:] != label[:, :-1]
    edges[1:, :] |= label[1:, :] != label[:-1, :]
    lead = ndimage.binary_dilation(edges, iterations=3)
    lead |= med_ring
    lead |= shape & (np.abs(din - bw) < 5)
    lead |= shape & (din < 12)
    for by in (ys, 1425.0):  # iron saddle bars
        lead |= shape & (np.abs(y - by) < 6)
    lead_d = ndimage.distance_transform_edt(~lead).astype(F32)

    # ---- broken holes
    hole = np.zeros((H, W), bool)
    holes = [(735, 470, 150), (300, 1365, 105), (660, 1880, 80), (230, 760, 55)]
    hp = Pen(W, H, ss=1)
    for hx, hy, hr in holes:
        n = int(rng.integers(14, 22))
        pts = []
        for k in range(n):
            a = 2 * np.pi * k / n + rng.uniform(-0.12, 0.12)
            rr_ = hr * (rng.uniform(0.45, 1.0) if k % 2 else rng.uniform(0.8, 1.15))
            pts.append((hx + math.cos(a) * rr_, hy + math.sin(a) * rr_))
        hp.poly(pts)
    hole = hp.array() > 0.5
    # some panes simply fell out whole
    ids_all = np.unique(label[shape])
    lost = rng.choice(ids_all, size=max(1, len(ids_all) // 45), replace=False)
    hole |= np.isin(label, lost) & ~lead
    # bent / missing came in the middle of the big holes
    lead_gone = np.zeros_like(hole)
    for hx, hy, hr in holes[:2]:
        lead_gone |= np.hypot(x - hx, y - hy) < hr * 0.55
    lead = lead & ~lead_gone

    # ---- cracks spreading from the holes
    cp = Pen(W, H, ss=2)
    for hx, hy, hr in holes:
        for _ in range(int(hr / 9)):
            a = rng.uniform(0, 2 * np.pi)
            px, py = hx + math.cos(a) * hr * 0.9, hy + math.sin(a) * hr * 0.9
            pts = [(px, py)]
            L = rng.uniform(40, 180)
            for _s in range(10):
                a += rng.normal(0, 0.25)
                px += math.cos(a) * L / 10
                py += math.sin(a) * L / 10
                pts.append((px, py))
            cp.line(pts, rng.uniform(1.0, 1.8))
    cracks = cp.array()

    # ---- glass colour
    cols = np.zeros((nid[0] + 1, 3), F32)
    for k, c in color_of.items():
        cols[k] = np.clip(c, 0, 1)
    glass = cols[label]
    u, v = x / W, y / H
    mott = fbm(u, v * 2, 12, 5, 77)
    streaks = spectral(W, 78, beta=1.6, ax=1, ay=4, m=H)
    glass *= (0.86 + 0.32 * mott + 0.05 * streaks)[..., None]
    seeds = spectral(W, 79, beta=0.2, fmin=200, m=H)
    glass *= (1 + 0.08 * smoothstep(2.0, 3.0, seeds))[..., None]
    grime = np.exp(-lead_d / 9.0)
    glass *= (1 - 0.45 * grime)[..., None]
    glass = lerp(glass, hexc("#1a1612"), cracks * 0.85)
    # paint-like grisaille dashes in the border pieces
    glass = np.clip(glass, 0, 1)

    lead_rgb = ramp(["#0c0b0a", "#1b1916", "#35302a"], np.clip(1 - lead_d / 4.0, 0, 1) * 0 + 0.3 + 0.25 * mott)
    rgb = np.where(lead[..., None], lead_rgb, glass)
    a = np.where(lead, 1.0, 0.94)
    a = np.where(hole & ~lead, 0.0, a)
    # chipped glass edges around holes
    hole_edge = ndimage.binary_dilation(hole, iterations=2) & ~hole & ~lead
    rgb = np.where(hole_edge[..., None], rgb * 0.6, rgb)
    a = a * shape_aa
    return rgba(np.clip(rgb, 0, 1), np.clip(a, 0, 1).astype(F32))


# --------------------------------------------------------------------------
# VFX rings & decals
# --------------------------------------------------------------------------

def _glyph_strokes(rng):
    """Original rune glyph: a stave plus 1-3 branch strokes on a small grid."""
    # grid in glyph space: x in [-1,1], y in [-1,1] (y up)
    stave = [((0, -1), (0, 1))]
    options = [
        ((0, 1), (0.8, 0.45)), ((0, 1), (-0.8, 0.45)), ((0, 0.3), (0.8, -0.2)),
        ((0, 0.3), (-0.8, -0.2)), ((0, -0.2), (0.8, 0.35)), ((0, -0.2), (-0.8, 0.35)),
        ((0, 0.6), (0.7, 0.0)), ((0.7, 0.0), (0, -0.6)), ((-0.7, 0.4), (0.7, 0.4)),
        ((0, -1), (0.7, -0.55)), ((0, -1), (-0.7, -0.55)), ((0, 0.0), (0.75, 0.0)),
    ]
    k = int(rng.integers(1, 4))
    idx = rng.choice(len(options), k, replace=False)
    strokes = stave + [options[i] for i in idx]
    if rng.random() < 0.25:
        strokes.append(((0.6, 1.0), (0.6, -1.0)))  # a second stave
    return strokes


def rune_ring():
    n = 512
    c = n / 2
    p = Pen(n)
    p.ring(c, c, 236, 4.0)
    p.ring(c, c, 224, 1.6)
    p.ring(c, c, 182, 3.0)
    p.ring(c, c, 172, 1.2)
    rng = np.random.default_rng(4242)
    N = 24
    for i in range(N):
        a = 2 * np.pi * i / N - np.pi / 2
        gx, gy = c + math.cos(a) * 203, c + math.sin(a) * 203
        # glyph 'up' points outward, 'right' is tangential
        ux, uy = math.cos(a), math.sin(a)
        tx, ty = -math.sin(a), math.cos(a)
        for (x0, y0), (x1, y1) in _glyph_strokes(rng):
            s = 11.0
            P0 = (gx + (x0 * tx + y0 * ux) * s * 0.75, gy + (x0 * ty + y0 * uy) * s * 0.75 + 0)
            P0 = (gx + x0 * 7 * tx + y0 * 11 * ux, gy + x0 * 7 * ty + y0 * 11 * uy)
            P1 = (gx + x1 * 7 * tx + y1 * 11 * ux, gy + x1 * 7 * ty + y1 * 11 * uy)
            p.line([P0, P1], 2.6)
        # separator dots between glyphs
        b = a + np.pi / N
        p.circle(c + math.cos(b) * 203, c + math.sin(b) * 203, 2.2)
    # heptagram {7/3}
    R = 168
    verts = [(c + R * math.cos(-np.pi / 2 + 2 * np.pi * k / 7), c + R * math.sin(-np.pi / 2 + 2 * np.pi * k / 7)) for k in range(7)]
    for k in range(7):
        p.line([verts[k], verts[(k + 3) % 7]], 2.4)
    for vx, vy in verts:
        p.circle(vx, vy, 4.5)
    p.ring(c, c, 74, 2.6)
    p.ring(c, c, 62, 1.2)
    # inner seven-spoke sigil
    for k in range(7):
        a = -np.pi / 2 + 2 * np.pi * k / 7
        p.line([(c + math.cos(a) * 18, c + math.sin(a) * 18), (c + math.cos(a) * 56, c + math.sin(a) * 56)], 2.0)
    p.ring(c, c, 14, 2.4)
    p.circle(c, c, 5)
    lines = p.array()
    glow = ndimage.gaussian_filter(lines, 5) * 0.55 + ndimage.gaussian_filter(lines, 14) * 0.35
    a = np.clip(np.maximum(lines, glow), 0, 1)
    return rgba(np.ones(3), a)


def holy_ring():
    n = 512
    c = n / 2
    p = Pen(n)
    N = 48
    for i in range(N):
        a = 2 * np.pi * i / N - np.pi / 2
        long = i % 2 == 0
        r0, r1 = (128, 246) if long else (140, 205)
        if i % 4 == 0:
            r1 = 252
        hw = 4.2 if long else 2.6
        tx, ty = -math.sin(a), math.cos(a)
        ux, uy = math.cos(a), math.sin(a)
        p.poly([
            (c + ux * r0 + tx * hw, c + uy * r0 + ty * hw),
            (c + ux * r1, c + uy * r1),
            (c + ux * r0 - tx * hw, c + uy * r0 - ty * hw),
        ])
    p.ring(c, c, 122, 4.0)
    p.ring(c, c, 110, 1.4)
    p.ring(c, c, 214, 1.4)
    for i in range(12):
        a = 2 * np.pi * i / 12 + np.pi / 12
        cx, cy = c + math.cos(a) * 166, c + math.sin(a) * 166
        ux, uy = math.cos(a), math.sin(a)
        tx, ty = -uy, ux
        p.poly([(cx + ux * 10, cy + uy * 10), (cx + tx * 5, cy + ty * 5), (cx - ux * 10, cy - uy * 10), (cx - tx * 5, cy - ty * 5)])
    for i in range(24):
        a = 2 * np.pi * i / 24
        p.circle(c + math.cos(a) * 96, c + math.sin(a) * 96, 2.0)
    lines = p.array()
    y, x = np.mgrid[0:n, 0:n].astype(F32) + 0.5
    rr = np.hypot(x - c, y - c) / c
    inner = np.exp(-((rr - 0.46) / 0.12) ** 2) * 0.22
    glow = ndimage.gaussian_filter(lines, 5) * 0.5 + ndimage.gaussian_filter(lines, 16) * 0.35
    a = np.clip(np.maximum(lines, glow + inner), 0, 1)
    return rgba(np.ones(3), a)


def crack_decal():
    n = 512
    c = n / 2
    rng = np.random.default_rng(99)
    p = Pen(n)
    rim = Pen(n)
    stack = []
    for k in range(6):
        a = 2 * np.pi * k / 6 + rng.uniform(-0.35, 0.35)
        stack.append((c + rng.normal(0, 3), c + rng.normal(0, 3), a, rng.uniform(6.0, 8.5), 0, rng.uniform(170, 235)))
    while stack:
        x, y, a, w, depth, reach = stack.pop()
        pts = [(x, y)]
        widths = [w]
        heading = a
        while w > 0.9:
            # angular zig-zag: straight segments with abrupt small turns
            heading = a + rng.normal(0, 0.35)
            step = rng.uniform(10, 22)
            x += math.cos(heading) * step
            y += math.sin(heading) * step
            pts.append((x, y))
            w *= rng.uniform(0.84, 0.93)
            widths.append(w)
            if math.hypot(x - c, y - c) > reach:
                break
            if depth < 2 and rng.random() < 0.22:
                stack.append((x, y, a + rng.choice([-1, 1]) * rng.uniform(0.5, 1.1), w * 0.6, depth + 1, reach))
        for i in range(len(pts) - 1):
            p.line([pts[i], pts[i + 1]], max(0.9, widths[i]))
            rim.line([pts[i], pts[i + 1]], max(0.9, widths[i]) + 5)
    lines = p.array()
    edge = np.clip(rim.array() - lines, 0, 1)
    y, x = np.mgrid[0:n, 0:n].astype(F32) + 0.5
    rr = np.hypot(x - c, y - c) / c
    u, v = x / n, y / n
    dust = fbm(u, v, 6, 4, 5)
    crater = np.exp(-(rr / 0.16) ** 2) * (0.45 + 0.25 * dust)
    shards = smoothstep(0.1, 0.3, fbm(u, v, 18, 3, 6)) * np.exp(-(rr / 0.3) ** 2) * 0.35
    a = np.clip(lines * 0.96 + edge * 0.28 + crater + shards * (1 - lines), 0, 1)
    a *= smoothstep(1.0, 0.88, rr)
    rgb = lerp(hexc("#0b0a09"), hexc("#3a352f"), np.clip(edge * 1.5 - lines, 0, 1))
    return rgba(rgb, a)


def blood_decal():
    n = 256
    c = n / 2
    rng = np.random.default_rng(66)
    p = Pen(n)
    th, r = blob_radius(rng, 7, 0.32, jag=0.03)
    R = 52
    p.poly([(c + math.cos(t) * q * R, c + math.sin(t) * q * R) for t, q in zip(th, r)])
    direction = rng.uniform(0, 2 * np.pi)
    for _ in range(26):
        a = direction + rng.normal(0, 0.9)
        d = rng.uniform(55, 118)
        s = rng.uniform(1.5, 7.5) * (1.2 - d / 140)
        cx, cy = c + math.cos(a) * d, c + math.sin(a) * d
        el = rng.uniform(1.0, 2.2)
        pts = [(cx + math.cos(t) * s * el * math.cos(a) - math.sin(t) * s * math.sin(a),
                cy + math.cos(t) * s * el * math.sin(a) + math.sin(t) * s * math.cos(a)) for t in np.linspace(0, 2 * np.pi, 24)]
        p.poly(pts)
    for _ in range(40):
        a = rng.uniform(0, 2 * np.pi)
        d = rng.uniform(40, 120)
        p.circle(c + math.cos(a) * d, c + math.sin(a) * d, rng.uniform(0.6, 1.8))
    m = p.array()
    inner = ndimage.grey_erosion(m, size=7)
    rim = np.clip(m - ndimage.gaussian_filter(inner, 2), 0, 1)
    u, v = grid(n)
    nz = fbm(u, v, 6, 4, 12)
    a = m * (0.6 + 0.16 * nz) + rim * 0.15
    rgb = ramp(["#220706", "#370b0a", "#4f1210", "#641916"], 0.45 + 0.4 * nz - 0.5 * rim)
    return rgba(rgb, np.clip(a, 0, 0.9))


# --------------------------------------------------------------------------
# UI / post
# --------------------------------------------------------------------------

def vignette():
    n = 1024
    y, x = np.mgrid[0:n, 0:n].astype(F32) + 0.5
    xn = (x / n - 0.5) * 2
    yn = (y / n - 0.5) * 2
    d = np.sqrt(xn ** 2 * 0.85 + yn ** 2 * 1.0)
    a = smoothstep(0.55, 1.45, d) ** 1.4 * 0.92
    a += (np.random.default_rng(3).random(a.shape) - 0.5) / 255.0
    return rgba(hexc("#0a0908"), np.clip(a, 0, 1))


def grain():
    n = 256
    rng = np.random.default_rng(17)
    g = gblur(rng.standard_normal((n, n)).astype(F32), 0.55)
    g = (g - g.mean()) / g.std()
    return Image.fromarray(to8(0.5 + g * 0.16), "L")


def ui_parchment_panel():
    n = 1024
    u, v = grid(n)
    big = fbm(u, v, 2, 5, 31)
    mid = fbm(u, v, 8, 5, 32)
    fib = spectral(n, 33, beta=0.8, ax=1, ay=3, fmin=30)
    t = 0.5 + 0.35 * big + 0.15 * mid + 0.02 * fib
    col = ramp(["#15120f", "#1d1915", "#251f1a", "#2d261f"], t)
    y, x = np.mgrid[0:n, 0:n].astype(F32) + 0.5
    e = np.minimum.reduce([x, y, n - x, n - y])
    edge_dark = 1 - 0.38 * (1 - smoothstep(0, 140, e)) ** 1.5
    col *= edge_dark[..., None]
    centre = np.exp(-(((x - n / 2) / (n * 0.45)) ** 2 + ((y - n / 2) / (n * 0.45)) ** 2))
    col *= (0.94 + 0.1 * centre)[..., None]

    # faint tooled double rule (blind-embossed: light top edge, dark bottom edge)
    def rule(d, w):
        sd = np.maximum(d - np.minimum(x, n - x), d - np.minimum(y, n - y))
        return 1 - smoothstep(w * 0.5, w * 0.5 + 1.0, np.abs(sd))

    tool = np.clip(rule(22, 1.4) + rule(29, 0.9) * 0.7, 0, 1)
    col = lerp(col, hexc("#6b5536"), tool * 0.35)
    col = np.clip(col, 0, 1)
    # rounded corners
    rad = 10
    cx = np.clip(x, rad, n - rad)
    cy = np.clip(y, rad, n - rad)
    cd = np.hypot(x - cx, y - cy)
    a = 1 - smoothstep(rad - 1.0, rad, cd)
    return rgba(col, a)


def ui_frame_corner():
    n = 256
    p = Pen(n)
    # double rule running off toward the stretched 9-slice edges
    p.line([(38, 7.5), (n + 4, 7.5)], 3.2)
    p.line([(7.5, 38), (7.5, n + 4)], 3.2)
    p.line([(56, 16.5), (n + 4, 16.5)], 1.6)
    p.line([(16.5, 56), (16.5, n + 4)], 1.6)
    # corner boss: a lozenge ring with a jewel
    c = 23.0
    d = 19.0
    p.poly([(c, c - d), (c + d, c), (c, c + d), (c - d, c)])
    p.poly([(c, c - d + 6), (c + d - 6, c), (c, c + d - 6), (c - d + 6, c)], fill=0)
    p.circle(c, c, 4.6)
    # trefoil on the diagonal
    t = 54.0
    lobes = [(t, t - 10.5), (t - 10.5, t), (t + 7.0, t + 7.0)]
    for (lx, ly) in lobes:
        p.circle(lx, ly, 7.6)
    p.circle(t - 1, t - 1, 6.5)
    for (lx, ly) in lobes:
        p.circle(lx, ly, 3.0, fill=0)
    p.poly([(t + 11, t + 11), (t + 19, t + 19), (t + 14, t + 9.5)])
    p.poly([(t + 11, t + 11), (t + 19, t + 19), (t + 9.5, t + 14)])

    def scroll(mirror):
        def P(x, y):
            return (y, x) if mirror else (x, y)

        # ogee tendril from the boss along the edge, ending in a curl and a leaf
        pts = []
        for k in range(40):
            s = k / 39
            xx = 40 + s * 96
            yy = 26 + 6 * math.sin(s * math.pi * 1.5)
            pts.append(P(xx, yy))
        p.line(pts, 2.2)
        cx, cy = 136, 26 + 6 * math.sin(math.pi * 1.5)
        spiral = []
        for k in range(50):
            a = k / 49 * 2.0 * math.pi
            r = 9 * (1 - k / 60)
            spiral.append(P(cx + r * math.sin(a), cy + 9 - r * math.cos(a)))
        p.line(spiral, 2.0)
        # leaf at the midpoint, pointed both ends
        lx, ly = 92, 30
        leaf = []
        for k in range(30):
            a = k / 29 * math.pi
            leaf.append(P(lx + 13 * math.cos(a), ly + 7 * math.sin(a) + 2))
        for k in range(30):
            a = math.pi + k / 29 * math.pi
            leaf.append(P(lx + 13 * math.cos(a), ly + 2 * math.sin(a) + 2))
        p.poly(leaf)
        # small cusps hanging from the inner rule
        for xx in (176, 204, 232):
            p.poly([P(xx - 5, 17), P(xx + 5, 17), P(xx, 25)])
        p.circle(*P(160, 16.5), 2.6)

    scroll(False)
    scroll(True)
    m = p.array()
    h = ndimage.gaussian_filter(m, 1.6) * 0.6 + ndimage.gaussian_filter(m, 0.7) * 0.4
    dx = ndimage.sobel(h, axis=1) / 8
    dy = ndimage.sobel(h, axis=0) / 8
    nrm = np.dstack([-dx * 6, -dy * 6, np.ones_like(h)])
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    L = np.array([-0.5, -0.6, 0.62])
    L /= np.linalg.norm(L)
    lam = np.clip((nrm * L).sum(-1), 0, 1)
    spec = np.clip((nrm * (L + [0, 0, 1]) / np.linalg.norm(L + [0, 0, 1])).sum(-1), 0, 1) ** 24
    col = ramp(["#2e2113", "#5e4527", "#8c6a3f", "#b89a5a", "#e6cf98"], 0.15 + 0.75 * lam)
    col = np.clip(col + spec[..., None] * 0.35, 0, 1)
    shadow = ndimage.shift(ndimage.gaussian_filter(m, 2.2), (2.0, 1.5), order=1)
    a = np.clip(m + shadow * 0.55 * (1 - m), 0, 1)
    rgb = np.where((m > 0.02)[..., None], col, hexc("#050403"))
    # un-premultiply the AA edge so the bronze does not fringe dark
    return rgba(rgb, a)


SPRITES = {
    "ash_particle": (ash_particle, "4x4 atlas (128px cells) of soft irregular ash flakes; tint in shader.", False),
    "ember_particle": (ember_particle, "4x4 atlas of glowing embers: sparks, streaks, flecks, clusters (additive).", False),
    "smoke_puff": (smoke_puff, "4x4 atlas of soft smoke/incense puffs, top-lit, white-grey.", False),
    "glow_radial": (glow_radial, "Soft radial glow sprite (white, alpha falloff) for torches, candles, magic.", False),
    "light_shaft": (light_shaft, "Vertical god-ray beam gradient for fake volumetric light planes.", False),
    "stained_glass": (stained_glass, "Broken gothic lancet window: lead came, medallions, quarries; transparent holes.", False),
    "rune_ring": (rune_ring, "Engraved rune sigil (original glyphs, heptagram); white on transparent decal for arcane VFX.", False),
    "holy_ring": (holy_ring, "Radiant geometric halo; white on transparent decal for holy VFX.", False),
    "crack_decal": (crack_decal, "Branching ground crack decal (impact, heavy hits).", False),
    "blood_decal": (blood_decal, "Subtle dark blood splatter decal.", False),
    "vignette": (vignette, "UI/screen vignette overlay (black, alpha toward edges).", False),
    "grain": (grain, "Tileable film-grain tile, grayscale centred on mid-grey (overlay blend).", True),
    "ui_parchment_panel": (ui_parchment_panel, "Dark parchment/leather UI panel background with faint tooled rule (9-slice ~40px).", False),
    "ui_frame_corner": (ui_frame_corner, "Ornate gothic bronze top-left corner; mirror for the other corners (9-slice).", False),
}


def contact_sheet(out_dir: Path, path):
    names = list(SPRITES)
    cell = 300
    cols = 4
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), (24, 22, 20))
    d = ImageDraw.Draw(sheet)
    for i, nme in enumerate(names):
        im = Image.open(out_dir / f"{nme}.png").convert("RGBA")
        im.thumbnail((cell - 20, cell - 20), Image.LANCZOS)
        bg = Image.new("RGBA", im.size, (40, 37, 34, 255))
        chk = Image.new("RGBA", im.size)
        cd = ImageDraw.Draw(chk)
        for yy in range(0, im.height, 16):
            for xx in range(0, im.width, 16):
                if (xx // 16 + yy // 16) % 2:
                    cd.rectangle([xx, yy, xx + 15, yy + 15], fill=(52, 48, 44, 255))
        bg.alpha_composite(chk)
        bg.alpha_composite(im)
        r, c = divmod(i, cols)
        sheet.paste(bg.convert("RGB"), (c * cell + 10, r * (cell + 18) + 22))
        d.text((c * cell + 10, r * (cell + 18) + 6), nme, fill=(216, 199, 163))
    sheet.save(path)
    print("sprite contact sheet ->", path)
