"""Shared gothic building blocks used by the piece builders."""
from __future__ import annotations

import math

import numpy as np

from meshlib import (TAU, R, Soup, T, chain, circle, fan, grid_surface, hull, lathe, merge,
                     noise1, noise3, pointed_arch, sweep)

UV_SCALE = {  # metres per UV unit (world-consistent texel density)
    "stone_floor": 2.0, "stone_wall": 2.0, "stone_plate": 2.0,
    "wood_dark": 1.0, "bronze_aged": 0.5, "iron_rusted": 0.5,
    "cloth_wool": 1.0, "parchment": 0.5, "wax": 0.25, "leather": 0.5,
    "stained_glass": 1.0, "flame": 0.25,
}


def orient_outward(s: Soup, center):
    fn = s.face_normals()
    cen = s.tris.mean(1) - np.asarray(center, float)
    bad = np.einsum("ij,ij->i", fn, cen) < 0
    t = s.tris.copy()
    t[bad] = t[bad][:, [0, 2, 1]]
    return Soup(t, uvs=s.uvs.copy())


# --------------------------------------------------------------------------
# Slabs and stones
# --------------------------------------------------------------------------
def quad_slab(corners, h, bevel=0.02, n=4, wear=0.0, chip=0.0, seed=0, dish=0.0, bottom=False, y0=0.0):
    """Irregular quad slab: corners [(x, z)]*4, height h above y0, beveled top
    edge, subdivided top (n x n) with wear noise and chipped edges."""
    c = np.asarray(corners, float)
    cen = c.mean(0)
    inset = c + bevel * 1.41 * (cen - c) / np.linalg.norm(cen - c, axis=1, keepdims=True)

    def bil(q, u, v):
        return ((1 - u) * (1 - v))[..., None] * q[0] + (u * (1 - v))[..., None] * q[1] + \
               (u * v)[..., None] * q[2] + ((1 - u) * v)[..., None] * q[3]

    g = np.linspace(0, 1, n + 1)
    U, V = np.meshgrid(g, g, indexing="ij")
    top2 = bil(inset, U, V)
    top = np.stack([top2[..., 0], np.full(U.shape, y0 + h), top2[..., 1]], -1)
    # boundary loop parameters
    lu = np.concatenate([g[:-1], np.ones(n), g[::-1][:-1], np.zeros(n)])
    lv = np.concatenate([np.zeros(n), g[:-1], np.ones(n), g[::-1][:-1]])
    tl2 = bil(inset, lu, lv)
    ol2 = bil(c, lu, lv)
    yb = y0 + h - bevel
    tl = np.c_[tl2[:, 0], np.full(len(lu), y0 + h), tl2[:, 1]]
    ol = np.c_[ol2[:, 0], np.full(len(lu), yb), ol2[:, 1]]
    bl = np.c_[ol2[:, 0], np.full(len(lu), y0), ol2[:, 1]]
    parts = [grid_surface(top)]
    parts.append(grid_surface(np.stack([tl, ol], 1), closed_u=True))
    parts.append(grid_surface(np.stack([ol, bl], 1), closed_u=True))
    if bottom:
        parts.append(fan(bl))
    s = Soup(np.concatenate([p.tris for p in parts]))
    s = orient_outward(s, [cen[0], y0 + h * 0.5, cen[1]])
    if wear or chip or dish:
        rng_off = seed * 7.31

        def f(p):
            q = p.copy()
            nz = noise3(p * 1.0 + rng_off, 2.2, seed)
            topm = p[:, 1] > y0 + h - 1e-6
            edgem = np.abs(p[:, 1] - yb) < 1e-6
            q[topm, 1] += wear * nz[topm, 1]
            if dish:
                d2 = ((p[:, 0] - cen[0]) ** 2 + (p[:, 2] - cen[1]) ** 2)
                span = np.max(np.linalg.norm(c - cen, axis=1)) ** 2
                q[topm, 1] -= dish * np.exp(-d2[topm] / (0.3 * span))
            ch = noise3(p * 1.0 + rng_off + 3.3, 5.0, seed + 1)
            q[edgem] += chip * ch[edgem] * [1, 0.8, 1]
            q[topm, 1] -= chip * 0.6 * np.clip(ch[topm, 0], 0, 1) ** 2 * (1 - np.clip(
                np.min(np.abs(p[topm][:, None, [0, 2]] - inset[None]), axis=(1, 2)) / (bevel * 3 + 1e-6), 0, 1))
            return q

        s = s.map_pos(f)
    return s


def rect_slab(x0, x1, z0, z1, h, **kw):
    return quad_slab([(x0, z1), (x1, z1), (x1, z0), (x0, z0)], h, **kw)


def rock(size, seed=0, flat=0.6, npts=18):
    """Broken stone chunk (convex hull of jittered box/ellipsoid samples)."""
    rng = np.random.default_rng(seed)
    sx, sy, sz = size
    pts = rng.normal(size=(npts, 3))
    pts /= np.linalg.norm(pts, axis=1, keepdims=True)
    boxy = np.sign(pts) * np.abs(pts) ** 0.35
    pts = boxy * flat + pts * (1 - flat)
    pts *= np.array([sx, sy, sz]) / 2 * rng.uniform(0.8, 1.05, size=(npts, 1))
    # a couple of planar cuts (fractures)
    for _ in range(2):
        nrm = rng.normal(size=3)
        nrm /= np.linalg.norm(nrm)
        d = rng.uniform(0.25, 0.4) * min(size)
        proj = pts @ nrm
        over = proj > d
        pts[over] -= np.outer(proj[over] - d, nrm)
    s = hull(pts)
    lo = s.bounds()[0]
    return s.t(0, -lo[1], 0)


def ashlar_face(x0, x1, y0, y1, z_face, sign=1, course=0.5, seed=0, gap=0.014, depth=0.035,
                clip=None, min_len=0.55, max_len=1.15):
    """Blocks proud of a wall face (plane z = z_face, facing sign*Z). ``clip(yA, yB)``
    returns list of forbidden x-intervals for that course."""
    rng = np.random.default_rng(seed)
    out = []
    y = y0
    row = 0
    while y < y1 - 0.05:
        ch = min(course * rng.uniform(0.85, 1.12), y1 - y)
        if y1 - (y + ch) < 0.2:
            ch = y1 - y
        xs = [x0]
        x = x0 + (rng.uniform(0.25, 0.6) if row % 2 else 0.0)
        if x > x0:
            xs.append(x)
        while x < x1:
            x = x + rng.uniform(min_len, max_len)
            if x1 - x < 0.3:
                x = x1
            xs.append(min(x, x1))
        bad = clip(y, y + ch) if clip else []
        for a, b in zip(xs[:-1], xs[1:]):
            segs = [(a, b)]
            for (ca, cb) in bad:
                nxt = []
                for (sa, sb) in segs:
                    if sb <= ca or sa >= cb:
                        nxt.append((sa, sb))
                    else:
                        if sa < ca:
                            nxt.append((sa, ca))
                        if sb > cb:
                            nxt.append((cb, sb))
                segs = nxt
            for (sa, sb) in segs:
                if sb - sa < 0.12:
                    continue
                g = gap / 2
                blk = rect_slab(sa + g, sb - g, -(y + ch - g), -(y + g), depth * rng.uniform(0.7, 1.2),
                                bevel=0.018, n=1, wear=0.006, chip=0.008, seed=int(rng.integers(1 << 30)))
                # local (x, h, z=-y) -> world: x, y=-z, z = z_face + sign*h
                m = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, sign, 0, z_face], [0, 0, 0, 1.0]])
                out.append(blk.apply(m))
        y += ch
        row += 1
    return merge(*[o.shade(30) for o in out]) if out else None


# --------------------------------------------------------------------------
# Moldings (profiles in (out, up), metres)
# --------------------------------------------------------------------------
STRING_COURSE = [(-0.03, 0.0), (0.03, 0.02), (0.07, 0.05), (0.10, 0.08), (0.135, 0.11), (0.155, 0.15),
                 (0.155, 0.18), (0.14, 0.205), (-0.03, 0.27)]
PLINTH = [(-0.03, 0.0), (0.12, 0.0), (0.12, 0.42), (0.10, 0.47), (0.04, 0.52), (-0.03, 0.54)]
CORNICE = [(-0.03, 0.0), (0.02, 0.0), (0.05, 0.03), (0.06, 0.07), (0.09, 0.1), (0.14, 0.13), (0.16, 0.17),
           (0.16, 0.22), (-0.03, 0.22)]


def roll_profile(r=0.05, n=8, out=0.0):
    a = np.linspace(-math.pi / 2, math.pi / 2, n)
    return [(out + r * math.cos(t), r * math.sin(t)) for t in a]


def molding_bar(profile_out_up, x0, x1, z_face, y, sign=1):
    """Straight molding along X on face z_face (facing sign*Z) with its base at height y."""
    from meshlib import profile_bar

    p = np.asarray(profile_out_up, float)
    zy = np.c_[z_face + sign * p[:, 0], y + p[:, 1]]
    return profile_bar(zy, x0, x1)


# --------------------------------------------------------------------------
# Columns
# --------------------------------------------------------------------------
def cluster_section(th, core=0.34, major=(0.34, 0.15), minor=(0.36, 0.085), n_major=4, rot=0.0):
    th = np.asarray(th, float)
    r = np.full_like(th, core)
    shafts = [(rot + k * TAU / n_major, *major) for k in range(n_major)]
    if minor:
        shafts += [(rot + (k + 0.5) * TAU / n_major, *minor) for k in range(n_major)]
    for ang, d, rc in shafts:
        dl = th - ang
        perp = d * np.sin(dl)
        along = d * np.cos(dl)
        ok = (np.abs(perp) < rc) & (along > 0)
        t = along + np.sqrt(np.clip(rc * rc - perp * perp, 0, None))
        r = np.where(ok, np.maximum(r, t), r)
    return r


def octagon(th, R_, rot=0.0):
    x = np.mod(np.asarray(th) - rot, TAU / 8)
    return R_ * math.cos(math.pi / 8) / np.cos(x - math.pi / 8)


def column_levels(sec, th, height=7.0, base=True, capital=True, seed=0, oct_r=0.78, abacus_r=0.80):
    """Polar ring levels for a gothic clustered column."""
    L = []
    if base:
        o = octagon(th, oct_r)
        L += [(0.0, o), (0.30, o), (0.30, octagon(th, oct_r - 0.05)), (0.36, octagon(th, oct_r - 0.08))]
        for y, d in [(0.36, 0.08), (0.40, 0.105), (0.45, 0.12), (0.50, 0.10), (0.53, 0.05), (0.57, 0.04),
                     (0.61, 0.065), (0.65, 0.05), (0.69, 0.012)]:
            L.append((y, sec + d))
        start = 0.69
    else:
        start = 0.0
        L.append((0.0, sec))
    top_shaft = height - 1.25 if capital else height
    mid = (start + top_shaft) / 2
    L += [(mid - 0.05, sec), (mid - 0.03, sec + 0.025), (mid + 0.03, sec + 0.025), (mid + 0.05, sec)]
    L.append((top_shaft, sec))
    if capital:
        y = top_shaft
        L += [(y + 0.03, sec + 0.03), (y + 0.09, sec + 0.03), (y + 0.11, sec + 0.005)]
        lob = 0.5 + 0.5 * np.cos(16 * th)
        lob2 = 0.5 + 0.5 * np.cos(16 * th + math.pi)
        jit = 1 + 0.25 * noise1(th * 3, seed)
        for k, (dy, base_d, leaf) in enumerate([(0.2, 0.02, 0.02), (0.35, 0.05, 0.06), (0.5, 0.09, 0.09),
                                                (0.62, 0.15, 0.10), (0.72, 0.22, 0.08), (0.8, 0.24, 0.02),
                                                (0.86, 0.2, 0.0)]):
            lb = lob if k < 4 else lob2
            L.append((y + dy, sec + base_d + leaf * lb ** 2 * jit))
        ya = y + 0.88
        a = octagon(th, abacus_r)
        L += [(ya, octagon(th, abacus_r - 0.06)), (ya + 0.02, a), (ya + 0.16, a), (ya + 0.22, octagon(th, abacus_r - 0.07)),
              (height, octagon(th, abacus_r - 0.07))]
    return L


# --------------------------------------------------------------------------
# Candles, chains
# --------------------------------------------------------------------------
def candle(h, r, seed=0, segs=9, drips=3, dish=True):
    """Melted candle: returns (wax soup, wick soup, wick tip position)."""
    rng = np.random.default_rng(seed)
    th = np.linspace(0, TAU, segs, endpoint=False)
    wob = 1 + 0.06 * noise1(th * 2 + seed, seed)
    tilt = rng.uniform(-0.12, 0.12)
    top = h + tilt * r * np.sin(th + rng.uniform(0, TAU)) + 0.15 * r * noise1(th * 3, seed + 1)
    rings = []
    for f in (0.0, 0.25, 0.6, 0.92):
        rr = r * wob * (1.06 - 0.06 * f) * (1 + (0.12 if f == 0.0 else 0.0))
        rings.append(np.stack([np.sin(th) * rr, np.full(segs, f * (h - 2 * r)), np.cos(th) * rr], -1))
    rim = np.stack([np.sin(th) * r * wob * 0.98, top, np.cos(th) * r * wob * 0.98], -1)
    inner = np.stack([np.sin(th) * r * 0.6, top - (0.25 * r if dish else -0.02 * r), np.cos(th) * r * 0.6], -1)
    rings += [rim, inner]
    P = np.stack(rings, 0)
    s = grid_surface(np.concatenate([P, P[:, :1]], 1), flip=True)
    cap_y = inner[:, 1].mean() - (0.1 * r if dish else -0.05 * r)
    cap = fan(inner, center=[0, cap_y, 0])
    wax = merge(s.shade(50), cap.shade(50))
    parts = [wax]
    for k in range(drips):
        a = rng.uniform(0, TAU)
        ln = rng.uniform(0.25, 0.7) * h
        y_top = top[int(a / TAU * segs) % segs] - 0.01
        path = [[math.sin(a) * r * 0.98, y_top, math.cos(a) * r * 0.98]]
        for t in np.linspace(0.15, 1, 4):
            rr = r * (1.0 + 0.12 * math.sin(t * 3))
            path.append([math.sin(a) * rr, y_top - ln * t, math.cos(a) * rr])
        sc = np.linspace(1, 0.55, len(path))
        dr = sweep(circle(r * rng.uniform(0.16, 0.26), 5), path, up=(math.cos(a), 0, -math.sin(a)), scales=sc)
        parts.append(dr.shade(60))
    wax = merge(*parts)
    tip = np.array([0, cap_y + 0.03, 0])
    wick = sweep(circle(0.0035, 4), [[0, cap_y - 0.005, 0], [0.002, cap_y + 0.018, 0], [0.005, cap_y + 0.03, 0.001]],
                 up=(0, 0, 1))
    return wax, wick, tip


def chain_links(length, link_len=0.16, wire=0.016, width=0.085, segs=12, prof=5, seed=0, top=None):
    """Hanging chain from ``top`` (default (0, length, 0)) downwards, merged soup."""
    rng = np.random.default_rng(seed)
    pitch = link_len - 2 * wire - 0.006
    n = max(1, int(length / pitch))
    # stadium path in XY plane, long axis Y
    st = []
    hl = (link_len - width) / 2
    rr = width / 2 - wire
    for k in range(segs):
        t = k / segs * TAU
        x, y = rr * math.cos(t), rr * math.sin(t)
        y += hl if y >= 0 else -hl
        st.append([x, y, 0])
    base = sweep(circle(wire, prof), st, up=(0, 0, 1), closed_path=True).shade(60)
    top = np.array([0, length, 0]) if top is None else np.asarray(top, float)
    out = []
    for i in range(n):
        y = top[1] - link_len / 2 + 0.002 - i * pitch
        tw = 90 * (i % 2) + rng.uniform(-12, 12)
        out.append(base.apply(chain(T(top[0], y, top[2]), R("y", tw), R("z", rng.uniform(-3, 3)))))
    return merge(*out), top[1] - (n - 1) * pitch - link_len


def ring_torus(R_, r, n=16, m=6, axis="y"):
    """Torus: ring radius R_, tube r, lying in the XZ plane (axis y) by default."""
    path = np.c_[np.cos(np.linspace(0, TAU, n, endpoint=False)) * R_, np.zeros(n),
                 np.sin(np.linspace(0, TAU, n, endpoint=False)) * R_]
    s = sweep(circle(r, m), path, up=(0, 1, 0), closed_path=True)
    if axis == "z":
        s = s.r("x", 90)
    elif axis == "x":
        s = s.r("z", 90)
    return s.shade(60)


def turned(profile, segs=16, uv=1.0, smooth=50):
    return lathe(profile, segs, uv_scale=uv).shade(smooth)


def arch_path3(half_span, spring, radius=None, n=14, z=0.0):
    a2 = pointed_arch(half_span, radius, n, y0=spring)
    return np.c_[a2, np.full(len(a2), z)]


def ring_stack(rings, cap_top=False, cap_bottom=False, top_center=None, bottom_center=None):
    """Closed rings [(n,3) arrays] bottom->top -> outward-facing surface."""
    P = np.stack([np.asarray(r, float) for r in rings], 0)
    P = np.concatenate([P, P[:, :1]], 1)
    s = grid_surface(P, flip=True)
    parts = [s]
    if cap_top:
        parts.append(fan(P[-1, :-1], center=top_center))
    if cap_bottom:
        parts.append(fan(P[0, :-1], center=bottom_center, flip=True))
    return Soup(np.concatenate([p.tris for p in parts]))


def ellipse_r(th, ax, az):
    return 1.0 / np.sqrt((np.sin(th) / ax) ** 2 + (np.cos(th) / az) ** 2)


def rect_r(th, hx, hz):
    s, c = np.abs(np.sin(th)), np.abs(np.cos(th))
    return np.minimum(hx / np.maximum(s, 1e-9), hz / np.maximum(c, 1e-9))


def polar_ring(th, r, y, cx=0.0, cz=0.0):
    r = np.broadcast_to(np.asarray(r, float), np.shape(th))
    y = np.broadcast_to(np.asarray(y, float), np.shape(th))
    return np.stack([cx + np.sin(th) * r, y, cz + np.cos(th) * r], -1)


def bezier(pts, n=10):
    """Bezier curve through control points (de Casteljau), n samples."""
    p = np.asarray(pts, float)
    t = np.linspace(0, 1, n)[:, None, None]
    p = np.broadcast_to(p[None], (n,) + p.shape).copy()
    while p.shape[1] > 1:
        p = (1 - t) * p[:, :-1] + t * p[:, 1:]
    return p[:, 0]
