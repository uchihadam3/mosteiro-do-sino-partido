"""Small procedural mesh library (numpy only).

Geometry is handled as *triangle soups* (``Soup``): an (M, 3, 3) array of
triangle corner positions plus optional per-corner normals, UVs and colours.
Soups are cheap to transform and concatenate; they are welded into indexed
geometry only when written to glTF (see ``gltf_io``).

Conventions: metres, Y-up, +Z forward, counter-clockwise front faces.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

TAU = 2.0 * math.pi
UP = np.array([0.0, 1.0, 0.0])


# --------------------------------------------------------------------------
# Matrices
# --------------------------------------------------------------------------
def T(x=0.0, y=0.0, z=0.0):
    m = np.eye(4)
    m[:3, 3] = (x, y, z)
    return m


def S(x=1.0, y=None, z=None):
    y = x if y is None else y
    z = x if z is None else z
    return np.diag([x, y, z, 1.0])


def R(axis, deg):
    """Rotation matrix about 'x' | 'y' | 'z' or an arbitrary 3-vector (degrees)."""
    if isinstance(axis, str):
        axis = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[axis]
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    x, y, z = a
    m = np.eye(4)
    m[:3, :3] = [
        [c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
        [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
        [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)],
    ]
    return m


def chain(*ms):
    """chain(A, B, C) == A @ B @ C (C applied first)."""
    out = np.eye(4)
    for m in ms:
        out = out @ m
    return out


def look_frame(direction, up=(0, 1, 0)):
    """Matrix that maps local +X onto ``direction`` (keeps local +Y close to ``up``)."""
    d = np.asarray(direction, float)
    d = d / np.linalg.norm(d)
    u = np.asarray(up, float)
    if abs(np.dot(d, u / np.linalg.norm(u))) > 0.999:
        u = np.array([0.0, 0.0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    z = np.cross(d, u)
    z /= np.linalg.norm(z)
    y = np.cross(z, d)
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2] = d, y, z
    return m


def quat_from_matrix(m):
    """glTF quaternion [x, y, z, w] from a 4x4 rotation matrix."""
    r = m[:3, :3]
    tr = r[0, 0] + r[1, 1] + r[2, 2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w, x, y, z = 0.25 * s, (r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = math.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        w, x, y, z = (r[2, 1] - r[1, 2]) / s, 0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s
    elif r[1, 1] > r[2, 2]:
        s = math.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        w, x, y, z = (r[0, 2] - r[2, 0]) / s, (r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s
    else:
        s = math.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        w, x, y, z = (r[1, 0] - r[0, 1]) / s, (r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s
    q = np.array([x, y, z, w])
    return (q / np.linalg.norm(q)).tolist()


# --------------------------------------------------------------------------
# Soup
# --------------------------------------------------------------------------
class Soup:
    """Triangle soup. ``uvs`` NaN entries mean "box-project at export"."""

    __slots__ = ("tris", "normals", "uvs", "colors")

    def __init__(self, tris, normals=None, uvs=None, colors=None):
        self.tris = np.asarray(tris, float).reshape(-1, 3, 3)
        m = len(self.tris)
        self.normals = None if normals is None else np.asarray(normals, float).reshape(m, 3, 3)
        self.uvs = np.full((m, 3, 2), np.nan) if uvs is None else np.asarray(uvs, float).reshape(m, 3, 2)
        self.colors = None if colors is None else np.asarray(colors, float).reshape(m, 3, 4)

    def __len__(self):
        return len(self.tris)

    def copy(self):
        return Soup(self.tris.copy(), None if self.normals is None else self.normals.copy(),
                    self.uvs.copy(), None if self.colors is None else self.colors.copy())

    # ---- transforms -----------------------------------------------------
    def apply(self, m):
        m = np.asarray(m, float)
        p = self.tris.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]
        out = self.copy()
        out.tris = p.reshape(-1, 3, 3)
        if out.normals is not None:
            nm = np.linalg.inv(m[:3, :3]).T
            n = out.normals.reshape(-1, 3) @ nm.T
            n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            out.normals = n.reshape(-1, 3, 3)
        if np.linalg.det(m[:3, :3]) < 0:
            out = out.flipped()
        return out

    def flipped(self):
        idx = [0, 2, 1]
        return Soup(self.tris[:, idx], None if self.normals is None else -self.normals[:, idx],
                    self.uvs[:, idx], None if self.colors is None else self.colors[:, idx])

    def t(self, x=0.0, y=0.0, z=0.0):
        return self.apply(T(x, y, z))

    def r(self, axis, deg):
        return self.apply(R(axis, deg))

    def s(self, x, y=None, z=None):
        return self.apply(S(x, y, z))

    # ---- attributes -----------------------------------------------------
    def face_normals(self):
        p = self.tris
        n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
        return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-15)

    def shade(self, angle=35.0):
        """Auto-smooth normals: corners at the same position are averaged with
        neighbouring faces whose normal differs by less than ``angle`` degrees."""
        self.normals = smooth_normals(self.tris, angle)
        return self

    def flat(self):
        return self.shade(0.0)

    def box_uv(self, scale=1.0, force=True):
        """Per-face box projection (world/local consistent texel density)."""
        uv = box_project(self.tris, self.face_normals(), scale)
        if force:
            self.uvs = uv
        else:
            mask = np.isnan(self.uvs)
            self.uvs[mask] = uv[mask]
        return self

    def color(self, rgba):
        rgba = list(rgba) + [1.0] * (4 - len(rgba))
        self.colors = np.tile(np.asarray(rgba, float), (len(self.tris), 3, 1))
        return self

    def displace(self, amp=0.02, freq=2.0, seed=0, axes=(1, 1, 1)):
        """Smooth deterministic displacement keyed on position (keeps welds)."""
        p = self.tris.reshape(-1, 3)
        d = noise3(p, freq, seed) * amp * np.asarray(axes, float)
        out = self.copy()
        out.tris = (p + d).reshape(-1, 3, 3)
        out.normals = None
        return out

    def map_pos(self, fn):
        out = self.copy()
        out.tris = fn(self.tris.reshape(-1, 3).copy()).reshape(-1, 3, 3)
        out.normals = None
        return out

    def bounds(self):
        p = self.tris.reshape(-1, 3)
        return p.min(0), p.max(0)


def merge(*soups):
    soups = [s for s in soups if s is not None and len(s)]
    if not soups:
        return Soup(np.zeros((0, 3, 3)))
    for s in soups:
        if s.normals is None:
            s.shade()
    any_col = any(s.colors is not None for s in soups)
    cols = None
    if any_col:
        cols = np.concatenate([s.colors if s.colors is not None else np.ones((len(s), 3, 4)) for s in soups])
    return Soup(np.concatenate([s.tris for s in soups]), np.concatenate([s.normals for s in soups]),
                np.concatenate([s.uvs for s in soups]), cols)


# --------------------------------------------------------------------------
# Normals / UV helpers
# --------------------------------------------------------------------------
def smooth_normals(tris, angle=35.0):
    m = len(tris)
    if m == 0:
        return np.zeros((0, 3, 3))
    fn = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    area = np.linalg.norm(fn, axis=1)
    fnu = fn / np.maximum(area, 1e-15)[:, None]
    if angle <= 0.0:
        return np.repeat(fnu[:, None, :], 3, axis=1)
    corners = tris.reshape(-1, 3)
    key = np.round(corners / 1e-5).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    order = np.argsort(inv, kind="stable")
    g_sorted = inv[order]
    counts = np.bincount(inv)
    starts = np.concatenate([[0], np.cumsum(counts)[:-1]])
    cnt_k = counts[g_sorted]
    total = int(cnt_k.sum())
    rep = np.repeat(np.arange(len(order)), cnt_k)
    local = np.arange(total) - np.repeat(np.cumsum(cnt_k) - cnt_k, cnt_k)
    j_sorted = starts[g_sorted][rep] + local
    ci = order[rep]
    cj = order[j_sorted]
    fi, fj = ci // 3, cj // 3
    ok = np.einsum("ij,ij->i", fnu[fi], fnu[fj]) >= math.cos(math.radians(angle)) - 1e-9
    # angle-weighted contributions using face area weighting
    w = fn[fj[ok]]
    acc = np.zeros((len(corners), 3))
    for k in range(3):
        acc[:, k] = np.bincount(ci[ok], weights=w[:, k], minlength=len(corners))
    nrm = np.linalg.norm(acc, axis=1, keepdims=True)
    fallback = np.repeat(fnu, 3, axis=0)
    out = np.where(nrm > 1e-12, acc / np.maximum(nrm, 1e-15), fallback)
    return out.reshape(m, 3, 3)


def box_project(tris, fnu, scale):
    ax = np.argmax(np.abs(fnu), axis=1)
    sg = np.sign(fnu[np.arange(len(fnu)), ax])
    sg[sg == 0] = 1
    p = tris / scale
    u = np.empty(tris.shape[:2])
    v = np.empty(tris.shape[:2])
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    m = ax == 0
    u[m], v[m] = (-z[m] * sg[m][:, None]), y[m]
    m = ax == 1
    u[m], v[m] = x[m], (-z[m] * sg[m][:, None])
    m = ax == 2
    u[m], v[m] = (x[m] * sg[m][:, None]), y[m]
    return np.stack([u, v], axis=-1)


_NOISE_CACHE: dict = {}


def noise3(p, freq=1.0, seed=0):
    """Smooth vector noise in [-1, 1]^3 (sum of random sines)."""
    key = seed
    if key not in _NOISE_CACHE:
        rng = np.random.default_rng(seed + 9173)
        w = rng.normal(size=(3, 6, 3))
        ph = rng.uniform(0, TAU, size=(3, 6))
        amp = np.array([1.0, 0.7, 0.5, 0.35, 0.25, 0.18])
        _NOISE_CACHE[key] = (w, ph, amp)
    w, ph, amp = _NOISE_CACHE[key]
    p = np.asarray(p, float)
    out = np.zeros_like(p)
    for c in range(3):
        f = np.sin((p @ (w[c].T * freq)) * np.array([1, 2, 4, 8, 16, 32]) ** 0.5 * 1.7 + ph[c])
        out[:, c] = (f * amp).sum(1) / amp.sum() * 1.6
    return np.clip(out, -1, 1)


def noise1(x, seed=0, octaves=4):
    rng = np.random.default_rng(seed + 31)
    x = np.asarray(x, float)
    out = np.zeros_like(x)
    tot = 0.0
    for o in range(octaves):
        f = 2.0 ** o
        a = 0.55 ** o
        out += a * np.sin(x * f * 2.1 + rng.uniform(0, TAU)) * np.cos(x * f * 1.3 + rng.uniform(0, TAU))
        tot += a
    return out / tot


# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------
def tri_soup(tris):
    return Soup(np.asarray(tris, float))


def grid_surface(P, uv=None, closed_u=False, closed_v=False, flip=False):
    """Quad grid P[i, j] -> soup. Front face normal = d/di x d/dj (unless flip)."""
    P = np.asarray(P, float)
    nu, nv = P.shape[:2]
    if closed_u:
        P = np.concatenate([P, P[:1]], 0)
        if uv is not None:
            raise ValueError("closed_u with explicit uv: pass the duplicated seam row instead")
    if closed_v:
        P = np.concatenate([P, P[:, :1]], 1)
    nu, nv = P.shape[:2]
    a, b, c, d = P[:-1, :-1], P[1:, :-1], P[1:, 1:], P[:-1, 1:]
    t1 = np.stack([a, b, c], 2).reshape(-1, 3, 3)
    t2 = np.stack([a, c, d], 2).reshape(-1, 3, 3)
    tris = np.concatenate([t1, t2])
    uvs = None
    if uv is not None:
        uv = np.asarray(uv, float)
        if closed_v:
            uv = np.concatenate([uv, uv[:, :1]], 1)
        ua, ub, uc, ud = uv[:-1, :-1], uv[1:, :-1], uv[1:, 1:], uv[:-1, 1:]
        uvs = np.concatenate([np.stack([ua, ub, uc], 2).reshape(-1, 3, 2), np.stack([ua, uc, ud], 2).reshape(-1, 3, 2)])
    s = Soup(tris, uvs=uvs)
    s = drop_degenerate(s)
    return s.flipped() if flip else s


def drop_degenerate(s, eps=1e-12):
    p = s.tris
    a = np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1)
    k = a > eps
    if k.all():
        return s
    return Soup(p[k], None if s.normals is None else s.normals[k], s.uvs[k], None if s.colors is None else s.colors[k])


def fan(loop, center=None, flip=False):
    loop = np.asarray(loop, float)
    c = loop.mean(0) if center is None else np.asarray(center, float)
    nxt = np.roll(loop, -1, 0)
    tris = np.stack([np.broadcast_to(c, loop.shape), loop, nxt], 1)
    s = drop_degenerate(Soup(tris))
    return s.flipped() if flip else s


def hull(points):
    """Convex hull soup with outward winding."""
    from scipy.spatial import ConvexHull

    pts = np.asarray(points, float)
    h = ConvexHull(pts)
    tris = pts[h.simplices]
    c = pts[h.vertices].mean(0)
    fnu = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    inward = np.einsum("ij,ij->i", fnu, tris[:, 0] - c) < 0
    tris[inward] = tris[inward][:, [0, 2, 1]]
    return Soup(tris)


def cbox(sx, sy, sz, bevel=0.0, center=(0, 0, 0), bottom=False):
    """Chamfered box. ``bottom=True`` puts the box base at center-y."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    b = min(bevel, hx * 0.95, hy * 0.95, hz * 0.95)
    if b <= 1e-6:
        pts = np.array([[x, y, z] for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)])
    else:
        pts = []
        for x in (-1, 1):
            for y in (-1, 1):
                for z in (-1, 1):
                    pts += [[x * hx, y * (hy - b), z * (hz - b)], [x * (hx - b), y * hy, z * (hz - b)],
                            [x * (hx - b), y * (hy - b), z * hz]]
        pts = np.array(pts)
    cx, cy, cz = center
    if bottom:
        cy += hy
    return hull(pts + [cx, cy, cz])


def beam(p0, p1, w, h, bevel=0.02, up=(0, 1, 0), uv_scale=1.0, roll=0.0):
    """Timber beam from p0 to p1 with grain-aligned UVs (local box projection)."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    L = np.linalg.norm(p1 - p0)
    s = cbox(L, h, w, bevel).box_uv(uv_scale)
    if roll:
        s = s.r("x", roll)
    return s.apply(T(*((p0 + p1) / 2)) @ look_frame(p1 - p0, up))


def lathe(profile, segs=32, a0=0.0, a1=TAU, uv_scale=1.0, angles=None, ref_r=None, cap=False):
    """Revolve profile [(r, y), ...] (bottom->top for outward normals) about Y.
    Angle 0 is +Z, increasing towards +X."""
    prof = np.asarray(profile, float)
    th = np.linspace(a0, a1, segs + 1) if angles is None else np.asarray(angles, float)
    r, y = prof[:, 0], prof[:, 1]
    P = np.stack([np.sin(th)[:, None] * r[None, :], np.broadcast_to(y, (len(th), len(r))),
                  np.cos(th)[:, None] * r[None, :]], -1)
    seg_len = np.concatenate([[0], np.cumsum(np.hypot(np.diff(r), np.diff(y)))])
    rr = ref_r if ref_r is not None else max(float(r.max()), 1e-3)
    U = np.broadcast_to((th * rr)[:, None], (len(th), len(r)))
    V = np.broadcast_to(seg_len[None, :], (len(th), len(r)))
    uv = np.stack([U, V], -1) / uv_scale
    s = grid_surface(P, uv=uv)
    return s


def polar_stack(levels, thetas, uv_scale=1.0, ref_r=0.5, cap_top=True, cap_bottom=False):
    """Stack of closed rings. levels = [(y, r_array_over_thetas), ...] bottom->top.
    thetas: angles (len n, not closed). Angle 0 = +Z, towards +X."""
    th = np.asarray(thetas, float)
    n = len(th)
    rings = []
    for y, rr in levels:
        rr = np.broadcast_to(np.asarray(rr, float), (n,))
        rings.append(np.stack([np.sin(th) * rr, np.full(n, y), np.cos(th) * rr], -1))
    P = np.stack(rings, 0)  # (L, n, 3)
    P = np.concatenate([P, P[:, :1]], 1)
    thc = np.concatenate([th, [th[0] + TAU]])
    ys = np.array([lv[0] for lv in levels])
    rmean = np.array([np.mean(lv[1]) for lv in levels])
    arc = np.concatenate([[0], np.cumsum(np.hypot(np.diff(ys), np.diff(rmean)))])
    U = np.broadcast_to((thc * ref_r)[None, :], P.shape[:2])
    V = np.broadcast_to(arc[:, None], P.shape[:2])
    s = grid_surface(P, uv=np.stack([U, V], -1) / uv_scale, flip=True)
    parts = [s]
    if cap_top:
        top = P[-1, :-1]
        parts.append(fan(top, center=[0, ys[-1], 0]).box_uv(uv_scale))
    if cap_bottom:
        bot = P[0, :-1]
        parts.append(fan(bot, center=[0, ys[0], 0], flip=True).box_uv(uv_scale))
    out = Soup(np.concatenate([p.tris for p in parts]), uvs=np.concatenate([p.uvs for p in parts]))
    return out


def sweep(profile, path, up=(0, 0, 1), closed_path=False, closed_profile=True, caps=True,
          uv_scale=1.0, scales=None, miter=True):
    """Sweep 2D profile [(px, py)] along a 3D path. px is along side=cross(T, up),
    py along up' = cross(side, T). For planar paths, pass the plane normal as ``up``."""
    path = np.asarray(path, float)
    prof = np.asarray(profile, float)
    n = len(path)
    if closed_path:
        tan_f = np.roll(path, -1, 0) - path
        tan_b = path - np.roll(path, 1, 0)
    else:
        d = np.diff(path, axis=0)
        tan_f = np.concatenate([d, d[-1:]])
        tan_b = np.concatenate([d[:1], d])
    tf = tan_f / np.maximum(np.linalg.norm(tan_f, axis=1, keepdims=True), 1e-12)
    tb = tan_b / np.maximum(np.linalg.norm(tan_b, axis=1, keepdims=True), 1e-12)
    tavg = tf + tb
    tavg /= np.maximum(np.linalg.norm(tavg, axis=1, keepdims=True), 1e-12)
    upv = np.asarray(up, float)
    if upv.ndim == 1:
        upv = np.broadcast_to(upv, (n, 3))
    side = np.cross(tavg, upv)
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-12)
    upp = np.cross(side, tavg)
    mit = np.ones(n)
    if miter:
        sb = np.cross(tb, upv)
        sb /= np.maximum(np.linalg.norm(sb, axis=1, keepdims=True), 1e-12)
        mit = 1.0 / np.clip(np.einsum("ij,ij->i", side, sb), 0.35, 1.0)
    sc = np.ones(n) if scales is None else np.asarray(scales, float)
    px = prof[:, 0][None, :] * (mit * sc)[:, None]
    py = prof[:, 1][None, :] * sc[:, None]
    P = path[:, None, :] + px[..., None] * side[:, None, :] + py[..., None] * upp[:, None, :]
    if closed_path:
        P = np.concatenate([P, P[:1]], 0)
    if closed_profile:
        P = np.concatenate([P, P[:, :1]], 1)
        profc = np.concatenate([prof, prof[:1]])
    else:
        profc = prof
    pl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P[:, 0], axis=0), axis=1))])
    ql = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(profc, axis=0).T))])
    uv = np.stack(np.broadcast_arrays(pl[:, None], ql[None, :]), -1) / uv_scale
    s = grid_surface(P, uv=uv)
    parts = [s]
    if caps and not closed_path and closed_profile:
        parts.append(fan(P[0, :-1]).box_uv(uv_scale))
        parts.append(fan(P[-1, :-1], flip=True).box_uv(uv_scale))
    out = Soup(np.concatenate([p.tris for p in parts]), uvs=np.concatenate([p.uvs for p in parts]))
    # orientation: make sure the tube faces outwards (profile winding agnostic)
    if closed_profile and _signed_area(prof) < 0:
        out = out.flipped()
    return out


def _signed_area(poly):
    p = np.asarray(poly, float)
    x, y = p[:, 0], p[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def signed_volume(s):
    p = s.tris
    return float(np.einsum("ij,ij->i", p[:, 0], np.cross(p[:, 1], p[:, 2])).sum() / 6.0)


# --------------------------------------------------------------------------
# Polygons
# --------------------------------------------------------------------------
def earclip(poly):
    """Triangulate a simple polygon (any winding). Returns index triples, CCW."""
    pts = np.asarray(poly, float)
    n = len(pts)
    idx = list(range(n))
    if _signed_area(pts) < 0:
        idx.reverse()
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10 * n * n:
        guard += 1
        m = len(idx)
        clipped = False
        for k in range(m):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % m]
            a, b, c = pts[i0], pts[i1], pts[i2]
            cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cr < -1e-12:
                continue
            others = np.array([j for j in idx if j not in (i0, i1, i2)])
            if len(others) and cr > 1e-12:
                q = pts[others]
                d1 = (b[0] - a[0]) * (q[:, 1] - a[1]) - (b[1] - a[1]) * (q[:, 0] - a[0])
                d2 = (c[0] - b[0]) * (q[:, 1] - b[1]) - (c[1] - b[1]) * (q[:, 0] - b[0])
                d3 = (a[0] - c[0]) * (q[:, 1] - c[1]) - (a[1] - c[1]) * (q[:, 0] - c[0])
                inside = (d1 > 1e-12) & (d2 > 1e-12) & (d3 > 1e-12)
                if inside.any():
                    continue
            elif len(others) and cr <= 1e-12:
                # collinear vertex: only drop if it does not create a spike
                pass
            tris.append((i0, i1, i2))
            idx.pop(k)
            clipped = True
            break
        if not clipped:
            tris.append((idx[-1], idx[0], idx[1]))
            idx.pop(0)
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris


def poly_cap(poly2, z=0.0, flip=False, plane="xy"):
    """Flat cap of a 2D polygon. plane 'xy' -> normal +Z, 'xz' -> normal +Y."""
    p = np.asarray(poly2, float)
    tri = earclip(p)
    if plane == "xy":
        P = np.c_[p[:, 0], p[:, 1], np.full(len(p), z)]
    else:  # xz plane, polygon (x, z) with CCW seen from +Y means CCW in (x, -z)
        P = np.c_[p[:, 0], np.full(len(p), z), p[:, 1]]
    tris = P[np.array(tri)]
    s = drop_degenerate(Soup(tris))
    fn = s.face_normals()
    want = np.array([0, 0, 1.0]) if plane == "xy" else np.array([0, 1.0, 0])
    bad = fn @ want < 0
    s.tris[bad] = s.tris[bad][:, [0, 2, 1]]
    return s.flipped() if flip else s


def extrude(poly2, z0, z1, side_mask=None, caps=(True, True)):
    """Extrude XY polygon from z0 to z1 (z1 > z0). Front (z1) cap faces +Z.
    side_mask(a, b) -> False to skip the side wall for edge a->b."""
    p = np.asarray(poly2, float)
    if _signed_area(p) < 0:
        p = p[::-1]
    parts = []
    if caps[1]:
        parts.append(poly_cap(p, z1))
    if caps[0]:
        parts.append(poly_cap(p, z0, flip=True))
    quads = []
    for i in range(len(p)):
        a, b = p[i], p[(i + 1) % len(p)]
        if np.allclose(a, b):
            continue
        if side_mask is not None and not side_mask(a, b):
            continue
        a0, b0, b1, a1 = [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]
        quads += [[a0, b0, b1], [a0, b1, a1]]
    if quads:
        parts.append(Soup(np.array(quads)))
    return Soup(np.concatenate([q.tris for q in parts]))


def prism_xz(poly_xz, y0, y1, **kw):
    """Vertical prism of a polygon given in the XZ plane (x, z)."""
    p = np.asarray(poly_xz, float)
    s = extrude(np.c_[p[:, 0], -p[:, 1]], y0, y1, **kw)  # extrude along +Z in (x, -z)
    return s.apply(R("x", -90))


def profile_bar(poly_zy, x0, x1, **kw):
    """Extrude a cross-section polygon given in (z, y) along X from x0 to x1."""
    p = np.asarray(poly_zy, float)
    s = extrude(p, x0, x1, **kw)  # polygon in XY extruded along Z
    # map (X=z_prof, Y=y_prof, Z=x) -> world (x=Z, y=Y, z=X)
    m = np.array([[0, 0, 1, 0], [0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1.0]])
    return s.apply(m)


def circle(r, n=16, a0=0.0, c=(0, 0)):
    a = a0 + np.arange(n) * TAU / n
    return np.c_[c[0] + r * np.cos(a), c[1] + r * np.sin(a)]


def pointed_arch(half_span, radius=None, n=12, y0=0.0):
    """Points of a pointed (two-centred) arch from left springer to right springer
    through the apex. Equilateral when radius == 2 * half_span."""
    a = half_span
    r = 2 * a if radius is None else radius
    cx = a - r  # right arc centre x (left arc centre at -cx)
    tmax = math.acos(max(-1.0, min(1.0, (r - a) / r)))
    t = np.linspace(0, tmax, n)
    right = np.c_[cx + r * np.cos(t), y0 + r * np.sin(t)]  # springer -> apex
    left = right[::-1].copy()
    left[:, 0] *= -1
    left = left[::-1]  # left springer -> apex
    return np.concatenate([left, right[::-1][1:]])  # left springer .. apex .. right springer


def arch_rise(half_span, radius=None):
    a = half_span
    r = 2 * a if radius is None else radius
    return math.sqrt(max(0.0, r * r - (r - a) ** 2))


def arch_halfwidth(y, half_span, radius=None, spring=0.0):
    """Half-width of a pointed opening at height y (springing at ``spring``)."""
    a = half_span
    r = 2 * a if radius is None else radius
    h = y - spring
    if h <= 0:
        return a
    if h >= arch_rise(a, r):
        return 0.0
    return (a - r) + math.sqrt(r * r - h * h)


def lancet_outline(half_span, spring, sill=0.0, radius=None, n=12):
    """Closed CCW outline of a lancet opening (sill line, jambs, pointed head)."""
    arch = pointed_arch(half_span, radius, n, y0=spring)  # left springer -> right springer
    pts = [[half_span, sill]] + arch[::-1].tolist() + [[-half_span, sill]]
    return np.array(pts)


@dataclass
class Node:
    name: str
    parts: dict = field(default_factory=dict)  # material -> list[Soup]
    translation: tuple = (0.0, 0.0, 0.0)
    rotation: tuple | None = None  # quaternion xyzw
    children: list = field(default_factory=list)
    extras: dict | None = None

    def add(self, material, *soups):
        for s in soups:
            if s is None or len(s) == 0:
                continue
            self.parts.setdefault(material, []).append(s)
        return self

    def child(self, node):
        self.children.append(node)
        return node

    def anchor(self, name, pos, extras=None):
        return self.child(Node(name, translation=tuple(float(v) for v in pos), extras=extras))
