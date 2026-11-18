"""Architecture kit pieces (walls, columns, arches, vaults, floors, stairs, portal)."""
from __future__ import annotations

import math

import numpy as np

from kit import (CORNICE, PLINTH, STRING_COURSE, arch_path3, ashlar_face, cluster_section, column_levels,
                 molding_bar, quad_slab, rect_r, rect_slab, ring_stack, rock, polar_ring)
from meshlib import (TAU, Node, R, T, arch_halfwidth, arch_rise, cbox, chain, circle, extrude,
                     grid_surface, lancet_outline, noise1, noise3, pointed_arch, polar_stack, poly_cap,
                     prism_xz, profile_bar, sweep)

WALL_W, WALL_H, WALL_D = 4.0, 7.0, 0.8
CORE_HZ = 0.365  # core face; ashlar blocks stand proud to ~0.4


# --------------------------------------------------------------------------
def _wall_body(root, seed, clip_front=None, clip_back=None, string_gaps=(), holes_halves=None):
    """Common ashlar wall: core (optionally with an opening given as two polygon
    halves), plinth, string course, cornice and ashlar on both faces."""
    stone = []
    if holes_halves is None:
        stone.append(cbox(WALL_W, WALL_H, 2 * CORE_HZ, 0.0, bottom=True))
    else:
        for half in holes_halves:
            stone.append(extrude(half, -CORE_HZ, CORE_HZ,
                                 side_mask=lambda a, b: not (abs(a[0]) < 1e-6 and abs(b[0]) < 1e-6)))
    trim = []
    y_sc = 4.2
    for sign in (1, -1):
        zf = sign * CORE_HZ
        trim.append(molding_bar(PLINTH, -2, 2, zf, 0.0, sign))
        trim.append(molding_bar(CORNICE, -2, 2, zf, WALL_H - 0.22, sign))
        # string course, interrupted by openings
        xs = [-2.0]
        for (ga, gb) in string_gaps:
            xs += [ga, gb]
        xs.append(2.0)
        for a, b in zip(xs[0::2], xs[1::2]):
            if b - a > 0.05:
                trim.append(molding_bar(STRING_COURSE, a, b, zf, y_sc, sign))
        clip = clip_front if sign > 0 else clip_back
        for (y0, y1, sd) in ((0.54, y_sc, 1), (y_sc + 0.27, WALL_H - 0.22, 2)):
            a = ashlar_face(-2, 2, y0, y1, zf, sign, course=0.45 if sd == 1 else 0.5,
                            seed=seed * 10 + sd + (5 if sign < 0 else 0), clip=clip)
            if a is not None:
                stone.append(a)
    root.add("stone_wall", *[s.shade(30) for s in stone])
    root.add("stone_plate", *[t.shade(40) for t in trim])


def wall_segment_4m():
    root = Node("wall_segment_4m")
    _wall_body(root, seed=1)
    return root


def _opening_halves(outline_pts, sill, H=WALL_H, W=WALL_W):
    """Split wall rectangle minus an opening (symmetric about x=0) into two simple polygons."""
    o = np.asarray(outline_pts, float)
    # left half of outline from sill-left corner up to apex
    left = [p for p in o if p[0] <= 1e-9]
    left = sorted(left, key=lambda p: (p[1], p[0]))
    apex = max(o, key=lambda p: p[1])
    lh = [(-W / 2, 0.0)]
    if sill > 1e-6:
        lh += [(0.0, 0.0), (0.0, sill)]
    # opening boundary on left side going up: (-a, sill) ... apex
    lp = [p for p in o if p[0] < -1e-9]
    lp = sorted(lp, key=lambda p: p[1])
    lh += [tuple(p) for p in lp]
    lh += [(0.0, float(apex[1])), (0.0, H), (-W / 2, H)]
    lh = np.array(lh)
    rh = lh.copy()
    rh[:, 0] *= -1
    return [lh, rh[::-1]]


def _frame(path2, z_face, sign, prof):
    p = np.c_[path2, np.full(len(path2), z_face)]
    if sign < 0:
        p = p[::-1]
    return sweep(prof, p, up=(0, 0, sign), caps=True).shade(40)


FRAME_PROF = [(-0.03, -0.04), (0.17, -0.04), (0.17, 0.015), (0.14, 0.035), (0.08, 0.05), (0.045, 0.035),
              (0.02, 0.06), (-0.01, 0.055), (-0.03, 0.03)]
HOOD_PROF = [(0.0, -0.03), (0.07, -0.03), (0.09, 0.01), (0.075, 0.05), (0.04, 0.075), (0.0, 0.06)]


def wall_window_lancet():
    root = Node("wall_window_lancet")
    a, sill, spring = 0.7, 1.6, 4.4
    rad = 2 * a
    apex = spring + arch_rise(a, rad)
    outline = lancet_outline(a, spring, sill, rad, n=10)
    halves = _opening_halves(outline, sill)
    margin = 0.2

    def clip(yA, yB):
        if yB < sill - 0.12 or yA > apex + 0.25:
            return []
        ys = np.linspace(max(yA, sill), min(yB, apex), 6)
        w = max(arch_halfwidth(y, a, rad, spring) for y in ys) + margin
        hood = 0.0
        if yB > spring:
            ys2 = np.linspace(max(yA, spring), min(yB, apex + 0.3), 6)
            hood = max(arch_halfwidth(y - 0.0, a + 0.26, rad + 0.26, spring) for y in ys2) + 0.1
        return [(-max(w, hood), max(w, hood))]

    _wall_body(root, seed=2, clip_front=clip, clip_back=clip, string_gaps=[(-a - 0.4, a + 0.4)], holes_halves=halves)
    trim = []
    # jamb/arch frame molding (both faces), path excludes the sill line
    path = outline.copy()  # (a, sill) -> up right jamb -> arch -> left jamb -> (-a, sill)
    for sign in (1, -1):
        trim.append(_frame(path, sign * CORE_HZ, sign, FRAME_PROF))
        hood = pointed_arch(a + 0.24, rad + 0.24, 14, y0=spring)
        hood3 = np.c_[hood, np.full(len(hood), sign * CORE_HZ)]
        if sign > 0:
            hood3 = hood3[::-1]
        trim.append(sweep(HOOD_PROF, hood3, up=(0, 0, sign)).shade(40))
        for sx in (-1, 1):  # label stops
            trim.append(cbox(0.12, 0.14, 0.1, 0.02, center=(sx * (a + 0.27), spring - 0.07, sign * (CORE_HZ + 0.04))))
    # sill (sloped, projecting)
    sill_prof = [(-0.45, sill - 0.07), (0.5, sill - 0.07), (0.5, sill - 0.02), (0.06, sill + 0.05),
                 (-0.06, sill + 0.05), (-0.45, sill + 0.02)]
    trim.append(profile_bar(sill_prof, -a - 0.12, a + 0.12).shade(30))
    # mullion + Y-ish tracery
    mull_poly = [(-0.05, -0.12), (0.05, -0.12), (0.07, -0.09), (0.07, 0.09), (0.05, 0.12), (-0.05, 0.12),
                 (-0.07, 0.09), (-0.07, -0.09)]
    trim.append(prism_xz(mull_poly, sill + 0.04, spring + 0.02).shade(50))
    bar = [(-0.045, -0.1), (0.045, -0.1), (0.06, -0.07), (0.06, 0.07), (0.045, 0.1), (-0.045, 0.1),
           (-0.06, 0.07), (-0.06, -0.07)]
    for sx in (-1, 1):
        sub = pointed_arch(a / 2, a, 10, y0=spring)
        sub[:, 0] += sx * a / 2
        trim.append(sweep(bar, np.c_[sub, np.zeros(len(sub))], up=(0, 0, 1), caps=True).shade(50))
    oc_r, oc_y = 0.19, spring + arch_rise(a / 2, a) + 0.24
    ring = np.c_[circle(oc_r, 20), np.zeros(20)]
    ring[:, 1] += oc_y
    trim.append(sweep(bar, ring, up=(0, 0, 1), closed_path=True).shade(50))
    # small cusps inside the oculus (quatrefoil hint)
    for k in range(4):
        ang = k * math.pi / 2 + math.pi / 4
        c = np.array([math.cos(ang) * oc_r * 0.8, oc_y + math.sin(ang) * oc_r * 0.8, 0])
        trim.append(cbox(0.06, 0.06, 0.14, 0.015, center=c).r("z", 0).shade(40))
    root.add("stone_plate", *trim)
    # glass
    glass = Node("window_glass")
    gp = lancet_outline(a + 0.02, spring, sill + 0.02, rad + 0.02, n=14)
    g = poly_cap(gp, -0.06)
    u = (g.tris[..., 0] + a) / (2 * a)
    v = (g.tris[..., 1] - sill) / (apex - sill)
    g.uvs = np.stack([u, v], -1)
    glass.add("stained_glass", g.flat())
    root.child(glass)
    root.anchor("window_light_anchor", (0.0, (sill + apex) / 2, 0.7),
                extras={"kind": "light", "note": "interior side (+Z) of the stained glass"})
    return root


# --------------------------------------------------------------------------
def pillar_gothic(height=7.0, broken_at=None, name="pillar_gothic", seed=3):
    n = 64
    th = np.arange(n) * TAU / n
    sec = cluster_section(th)
    L = column_levels(sec, th, height, seed=seed)
    root = Node(name)
    base_L = [lv for lv in L if lv[0] <= 0.69 + 1e-9]
    top_shaft = height - 1.25
    shaft_L = [lv for lv in L if 0.69 - 1e-9 <= lv[0] <= top_shaft + 1e-9]
    cap_L = [lv for lv in L if lv[0] >= top_shaft - 1e-9]
    if broken_at is None:
        root.child(Node(name + "_base")).add("stone_wall", polar_stack(base_L, th, 2.0, 0.45, cap_top=False).shade(40))
        root.child(Node(name + "_shaft")).add("stone_wall", polar_stack(shaft_L, th, 2.0, 0.45, cap_top=False).shade(40))
        root.child(Node(name + "_capital")).add("stone_plate", polar_stack(cap_L, th, 2.0, 0.45).shade(40))
        return root
    # broken column: shaft snapped with a jagged break surface
    root.child(Node(name + "_base")).add("stone_wall", polar_stack(base_L, th, 2.0, 0.45, cap_top=False).shade(40))
    shaft = [lv for lv in shaft_L if lv[0] < broken_at - 0.5]
    shaft.append((broken_at - 0.5, sec))
    low = polar_stack(shaft, th, 2.0, 0.45, cap_top=False)
    jag = broken_at + 0.28 * noise1(th * 1.0, seed + 5) + 0.12 * np.sign(np.sin(th * 3 + 0.5)) * \
        np.abs(np.sin(th * 7)) - 0.1 * np.cos(th)
    ring0 = polar_ring(th, sec, broken_at - 0.5)
    ring1 = polar_ring(th, sec * 0.995, jag)
    ring2 = polar_ring(th, sec * 0.72, jag - 0.06 + 0.05 * noise1(th * 5, seed))
    ring3 = polar_ring(th, sec * 0.38, jag * 0.5 + (broken_at - 0.15) * 0.5)
    top = ring_stack([ring0, ring1, ring2, ring3], cap_top=True, top_center=[0.05, broken_at - 0.2, -0.03])
    top = top.displace(0.025, 4.0, seed, axes=(1, 0.6, 1))
    root.child(Node(name + "_shaft")).add("stone_wall", low.shade(40), top.shade(55))
    # fallen drum
    drum_L = 0.95
    r0 = polar_ring(th, sec * 0.97, 0.05 * noise1(th * 3, seed + 2))
    r1 = polar_ring(th, sec, 0.06 + 0.03 * noise1(th * 2, seed + 7))
    r2 = polar_ring(th, sec, drum_L - 0.05 + 0.12 * noise1(th * 2, seed + 3))
    r3 = polar_ring(th, sec * 0.97, drum_L + 0.1 * noise1(th * 4, seed + 4))
    drum = ring_stack([r0, r1, r2, r3], cap_top=True, cap_bottom=True,
                      top_center=[0, drum_L - 0.06, 0], bottom_center=[0, 0.03, 0])
    drum = drum.displace(0.018, 4.0, seed + 1)
    drum = drum.apply(chain(T(1.35, 0.44, 0.85), R("y", 28), R("z", 90), T(0, -drum_L / 2, 0)))
    drum = drum.t(0, -0.015 - drum.bounds()[0][1], 0)  # rest on the floor, slightly embedded
    root.child(Node(name + "_drum")).add("stone_wall", drum.shade(45))
    # debris
    debris = []
    rng = np.random.default_rng(seed)
    for k in range(7):
        sz = rng.uniform(0.12, 0.35, 3) * [1, 0.6, 1]
        ang = rng.uniform(0, TAU)
        rr = rng.uniform(0.75, 1.5)
        debris.append(rock(sz, seed=seed * 100 + k).r("y", rng.uniform(0, 360)).t(math.cos(ang) * rr, 0,
                                                                                   math.sin(ang) * rr).flat())
    root.child(Node(name + "_debris")).add("stone_wall", *debris)
    return root


def pillar_broken():
    return pillar_gothic(7.0, broken_at=3.5, name="pillar_broken", seed=4)


# --------------------------------------------------------------------------
def _pier(th, inner_dir, height_cap, seed):
    """Respond pier: rectangular core with engaged shafts; capital at height_cap."""
    rect = rect_r(th, 0.26, 0.36)
    sec = cluster_section(th, core=0.0, major=(0.26, 0.14), minor=None, n_major=1, rot=inner_dir)
    sec = np.maximum(sec, rect)
    for d in (0.0, math.pi):  # front/back shafts
        s2 = cluster_section(th, core=0.0, major=(0.36, 0.1), minor=None, n_major=1, rot=d)
        sec = np.maximum(sec, s2)
    L = column_levels(sec, th, height_cap + 1.25, seed=seed, oct_r=0.62, abacus_r=0.62)
    return polar_stack(L, th, 2.0, 0.4).shade(40)


ARCH_PROF = ([(-0.52, -0.33), (-0.29, -0.33), (-0.26, -0.30), (-0.26, -0.22), (-0.23, -0.19), (-0.07, -0.19),
              (-0.03, -0.15), (-0.03, -0.075)]
             + [(-0.01 + 0.075 * math.cos(t), 0.075 * math.sin(t)) for t in np.linspace(-1.2, 1.2, 7)]
             + [(-0.03, 0.075), (-0.03, 0.15), (-0.07, 0.19), (-0.23, 0.19), (-0.26, 0.22), (-0.26, 0.30),
                (-0.29, 0.33), (-0.52, 0.33)])


def arch_gothic():
    root = Node("arch_gothic")
    n = 48
    th = np.arange(n) * TAU / n
    cap_h = 3.6
    for sx, nm in ((-1, "arch_gothic_pier_left"), (1, "arch_gothic_pier_right")):
        inner = math.pi / 2 if sx < 0 else 3 * math.pi / 2
        p = _pier(th, inner, cap_h, seed=7 + sx)
        root.child(Node(nm, translation=(sx * 2.0, 0, 0))).add("stone_wall", p)
    spring = cap_h + 1.25
    a_in = 2.0 - 0.27
    rad = 1.6 * a_in
    path = arch_path3(a_in, spring, rad, n=22)
    ring = sweep(ARCH_PROF, path, up=(0, 0, 1)).shade(40)
    hood = []
    for sign in (1, -1):
        ext = pointed_arch(a_in + 0.52, rad + 0.52, 22, y0=spring)
        p3 = np.c_[ext, np.full(len(ext), sign * 0.33)]
        if sign > 0:
            p3 = p3[::-1]
        hood.append(sweep(HOOD_PROF, p3, up=(0, 0, sign)).shade(40))
    apex = spring + arch_rise(a_in, rad)
    tb = th[::2]
    boss = polar_stack([(apex - 0.2, 0.0), (apex - 0.18, 0.07), (apex - 0.12, 0.12 + 0.03 * np.cos(8 * tb)),
                        (apex - 0.05, 0.14 + 0.03 * np.cos(8 * tb)), (apex + 0.02, 0.1)], tb, 1.0, 0.1,
                       cap_top=False)
    root.child(Node("arch_gothic_ring")).add("stone_plate", ring, *hood, boss.shade(50))
    return root


# --------------------------------------------------------------------------
RIB_PROF = [(0.06, -0.11), (0.06, 0.11), (-0.06, 0.11), (-0.12, 0.075), (-0.17, 0.07), (-0.23, 0.05),
            (-0.28, 0.02), (-0.3, 0.0), (-0.28, -0.02), (-0.23, -0.05), (-0.17, -0.07), (-0.12, -0.075),
            (-0.06, -0.11)]
RIB_HALF = [(0.06, 0.0), (0.06, -0.12), (-0.06, -0.12), (-0.12, -0.08), (-0.2, -0.06), (-0.26, -0.03),
            (-0.28, 0.0)]


def vault_rib_segment():
    root = Node("vault_rib_segment")
    a_e, r_e = 2.0, 3.2
    rise = arch_rise(a_e, r_e)
    a_d = 2.0 * math.sqrt(2)
    r_d = (rise ** 2 + a_d ** 2) / (2 * a_d)
    nphi = 12
    E = pointed_arch(a_e, r_e, nphi, 0.0)[:nphi]  # left springer -> apex (x, y)
    D = pointed_arch(a_d, r_d, nphi, 0.0)[:nphi]
    E3 = np.c_[E[:, 0], E[:, 1], np.full(nphi, -2.0)]
    D3 = np.c_[D[:, 0] / math.sqrt(2), D[:, 1], D[:, 0] / math.sqrt(2)]
    nt = 7
    tt = np.linspace(0, 1, nt)
    P = np.empty((nphi, nt, 3))
    for i in range(nphi):
        phi = i / (nphi - 1)
        for j, t in enumerate(tt):
            P[i, j] = (1 - t) * E3[i] + t * D3[i] + np.array([0, 0.22 * math.sin(math.pi * t) * (0.3 + 0.7 * phi), 0])
    patch_lo = grid_surface(P)
    # make intrados face downward
    if patch_lo.face_normals()[:, 1].mean() > 0:
        patch_lo = patch_lo.flipped()
    patch_hi = patch_lo.t(0, 0.14, 0).flipped()
    webs = []
    for k in range(4):
        for mir in (False, True):
            m = R("y", 90 * k)
            if mir:
                m = m @ np.diag([-1, 1, 1, 1.0])
            webs.append(patch_lo.apply(m))
            webs.append(patch_hi.apply(m))
    root.child(Node("vault_rib_segment_webs")).add("stone_wall", *[w.shade(40) for w in webs])
    ribs = []
    full_d = pointed_arch(a_d, r_d, 20, 0.0)
    for sgn in (1, -1):
        p3 = np.c_[full_d[:, 0] / math.sqrt(2), full_d[:, 1], sgn * full_d[:, 0] / math.sqrt(2)]
        nrm = np.array([sgn, 0, -1]) / math.sqrt(2)  # keeps sweep side pointing out of the vault
        ribs.append(sweep(RIB_PROF, p3, up=nrm).shade(40))
    full_e = pointed_arch(a_e, r_e, 18, 0.0)
    e3 = np.c_[full_e[:, 0], full_e[:, 1], np.full(len(full_e), -2.0)]
    edge = sweep(RIB_HALF, e3, up=(0, 0, -1)).shade(40)
    for k in range(4):
        ribs.append(edge.r("y", 90 * k))
    th = np.arange(24) * TAU / 24
    lob = 0.025 * np.cos(6 * th)
    boss = polar_stack([(rise - 0.42, 0.0), (rise - 0.40, 0.06), (rise - 0.34, 0.15 + lob), (rise - 0.24, 0.2 + lob),
                        (rise - 0.14, 0.2 + lob), (rise - 0.05, 0.16), (rise + 0.05, 0.12)], th, 1.0, 0.15,
                       cap_top=False)
    root.child(Node("vault_rib_segment_ribs")).add("stone_plate", *ribs, boss.shade(45))
    root.extras = {"springing": "y=0 at the four corners (+-2, 0, +-2)", "crown_height": round(rise, 3)}
    return root


# --------------------------------------------------------------------------
def _flag_layout(seed, skip_center=False):
    """Irregular flagstone quads over the 4x4 m tile (outer border kept exact)."""
    rng = np.random.default_rng(seed)
    rows = [(-2.0, -0.75), (-0.75, 0.55), (0.55, 2.0)]
    cuts = [[-2, -0.55, 0.95, 2], [-2, -1.05, 0.25, 2], [-2, -0.25, 2]]
    quads = []
    for (z0, z1), cx in zip(rows, cuts):
        for x0, x1 in zip(cx[:-1], cx[1:]):
            q = np.array([(x0, z1), (x1, z1), (x1, z0), (x0, z0)], float)
            for k in range(4):
                if abs(abs(q[k, 0]) - 2) > 1e-6:
                    q[k, 0] += rng.uniform(-0.05, 0.05)
                if abs(abs(q[k, 1]) - 2) > 1e-6:
                    q[k, 1] += rng.uniform(-0.04, 0.04)
            quads.append(q)
    return quads


def _flagstone(q, rng, gap=0.007):
    c = q.mean(0)
    qq = q + gap * (c - q) / np.linalg.norm(c - q, axis=1, keepdims=True)
    h = 0.12 - rng.uniform(0.0, 0.012)
    s = quad_slab(qq, h, bevel=0.022, n=6, wear=0.01, chip=0.012, seed=int(rng.integers(1 << 30)),
                  dish=rng.uniform(0.0, 0.012), y0=-0.12)
    tilt = rng.uniform(-0.5, 0.5, 2)
    return s.apply(chain(T(c[0], 0, c[1]), R("x", tilt[0]), R("z", tilt[1]), T(-c[0], 0, -c[1]))).shade(35)


def floor_tile_4m():
    root = Node("floor_tile_4m")
    rng = np.random.default_rng(11)
    stones = [_flagstone(q, rng) for q in _flag_layout(11)]
    bed = cbox(4.0, 0.09, 4.0, 0.0, center=(0, -0.12 + 0.045 - 0.01, 0)).shade(20)
    root.add("stone_floor", *stones, bed)
    root.extras = {"origin": "top walking surface at y=0, slab extends to y=-0.12"}
    return root


def floor_crack_slab():
    root = Node("floor_crack_slab")
    rng = np.random.default_rng(12)
    border = [
        [(-2, 2), (-0.3, 2), (-0.3, 1.1), (-2, 1.1)], [(-0.3, 2), (2, 2), (2, 1.1), (-0.3, 1.1)],
        [(-2, -1.1), (0.4, -1.1), (0.4, -2), (-2, -2)], [(0.4, -1.1), (2, -1.1), (2, -2), (0.4, -2)],
        [(-2, 1.1), (-1.1, 1.1), (-1.1, -0.1), (-2, -0.1)], [(-2, -0.1), (-1.1, -0.1), (-1.1, -1.1), (-2, -1.1)],
        [(1.1, 1.1), (2, 1.1), (2, -1.1), (1.1, -1.1)],
    ]
    stones = [_flagstone(np.array(q, float), rng) for q in border]
    # broken central slab: shards around an impact point
    ctr = np.array([0.18, -0.12])
    bpts = np.array([(-1.1, 0.5), (0.2, 1.1), (1.1, 0.35), (0.6, -1.1), (-0.9, -1.1)])
    corners = np.array([(-1.1, 1.1), (1.1, 1.1), (1.1, -1.1), (-1.1, -1.1)])

    def perim_param(p):
        x, z = p
        if abs(z - 1.1) < 1e-6:
            return (x + 1.1)
        if abs(x - 1.1) < 1e-6:
            return 2.2 + (1.1 - z)
        if abs(z + 1.1) < 1e-6:
            return 4.4 + (1.1 - x)
        return 6.6 + (z + 1.1)

    # sort boundary points by perimeter parameter, rays are jagged
    bpts = sorted(bpts.tolist(), key=perim_param)
    rays = []
    for bp in bpts:
        bp = np.array(bp)
        ts = np.linspace(0, 1, 6)[1:-1]
        mids = [ctr + (bp - ctr) * t + rng.normal(0, 0.06, 2) for t in ts]
        rays.append([ctr] + mids + [bp])
    cparams = [(perim_param(c), c) for c in corners]
    shards = []
    for i in range(len(rays)):
        r0, r1 = rays[i], rays[(i + 1) % len(rays)]
        p0, p1 = perim_param(r0[-1]), perim_param(r1[-1])
        if p1 < p0:
            p1 += 8.8
        between = [c for (pc, c) in cparams + [(pc + 8.8, c) for pc, c in cparams] if p0 < pc < p1]
        poly = r0 + [np.array(c) for c in between] + r1[::-1][:-1]
        shards.append(np.array(poly))
    pieces = []
    tilts = [(6, 0.02), (-3, -0.05), (9, 0.04), (-2, -0.09), (4, 0.0)]
    for k, poly in enumerate(shards):
        cen = poly.mean(0)
        shrink = poly + 0.025 * (cen - poly) / np.maximum(np.linalg.norm(cen - poly, axis=1, keepdims=True), 1e-9)
        s = prism_xz(shrink, -0.13, 0.0)
        s = s.map_pos(lambda p: p + np.where(p[:, 1:2] > -0.01, noise3(p, 3.0, k)[:, :] * [0.01, 0.008, 0.01], 0))
        ang, dy = tilts[k % len(tilts)]
        d = cen - ctr
        d = d / np.linalg.norm(d)
        axis = (d[1], 0, -d[0])
        s = s.apply(chain(T(ctr[0], dy, ctr[1]), R(axis, ang), T(-ctr[0], 0, -ctr[1])))
        pieces.append(s.shade(35))
    pit = []
    pit.append(cbox(2.2, 0.06, 2.2, 0.0, center=(0, -0.42, 0)))
    for sx, sz, w, d in ((-1.13, 0, 0.06, 2.2), (1.13, 0, 0.06, 2.2), (0, -1.13, 2.2, 0.06), (0, 1.13, 2.2, 0.06)):
        pit.append(cbox(w, 0.4, d, 0.0, center=(sx, -0.25, sz)))
    for k in range(6):
        pit.append(rock(rng.uniform(0.08, 0.22, 3), seed=500 + k).t(rng.uniform(-0.8, 0.8), -0.39,
                                                                    rng.uniform(-0.8, 0.8)).flat())
    bed = []
    for x0, x1, z0, z1 in ((-2, 2, 1.1, 2), (-2, 2, -2, -1.1), (-2, -1.1, -1.1, 1.1), (1.1, 2, -1.1, 1.1)):
        bed.append(cbox(x1 - x0, 0.09, z1 - z0, 0.0, center=((x0 + x1) / 2, -0.165, (z0 + z1) / 2)))
    root.add("stone_floor", *stones, *pieces, *[p.shade(30) for p in pit], *[b.shade(20) for b in bed])
    root.extras = {"origin": "top walking surface at y=0; crack pit extends to y=-0.45"}
    return root


# --------------------------------------------------------------------------
def stairs_stone():
    root = Node("stairs_stone")
    rng = np.random.default_rng(13)
    n, rise, tread, w = 5, 0.18, 0.32, 2.0
    depth = n * tread
    z_front = depth / 2
    steps = []
    for i in range(n):
        zf = z_front - i * tread
        s = rect_slab(-w / 2, w / 2, -depth / 2, zf, rise, bevel=0.03, n=6, wear=0.006, chip=0.012,
                      seed=int(rng.integers(1 << 30)), dish=0.018, y0=i * rise)
        steps.append(s.shade(35))
    cheeks = []
    top = n * rise
    for sx in (-1, 1):
        x0, x1 = sx * w / 2, sx * (w / 2 + 0.25)
        lo, hi = min(x0, x1), max(x0, x1)
        poly = [(z_front + 0.0, 0.0), (z_front, 0.55), (-depth / 2 + tread, top + 0.42), (-depth / 2, top + 0.42),
                (-depth / 2, 0.0)]
        cheeks.append(profile_bar(poly, lo, hi).shade(30))
        p0 = np.array([(lo + hi) / 2, 0.6, z_front - 0.02])
        p1 = np.array([(lo + hi) / 2, top + 0.47, -depth / 2 + tread])
        from meshlib import beam
        cheeks.append(beam(p0, p1, 0.31, 0.1, bevel=0.03, uv_scale=2.0))
        cheeks.append(beam(p1, p1 + [0, 0, -tread], 0.31, 0.1, bevel=0.03, uv_scale=2.0))
        # newel block with pyramidal cap
        cx = (lo + hi) / 2 + sx * 0.02
        cheeks.append(cbox(0.36, 0.78, 0.36, 0.03, center=(cx, 0, z_front - 0.12), bottom=True))
        cheeks.append(cbox(0.42, 0.08, 0.42, 0.02, center=(cx, 0.78, z_front - 0.12), bottom=True))
        from meshlib import hull
        cheeks.append(hull([[cx - 0.19, 0.86, z_front - 0.31], [cx + 0.19, 0.86, z_front - 0.31],
                            [cx - 0.19, 0.86, z_front + 0.07], [cx + 0.19, 0.86, z_front + 0.07],
                            [cx, 1.08, z_front - 0.12]]).flat())
    root.add("stone_floor", *steps)
    root.add("stone_wall", *[c.shade(30) for c in cheeks])
    root.extras = {"ascends": "towards -Z", "step_rise": rise, "step_tread": tread}
    return root


# --------------------------------------------------------------------------
def doorway_gothic():
    root = Node("doorway_gothic")
    a0, spring = 0.95, 2.9
    r0 = 2 * a0
    apex0 = spring + arch_rise(a0, r0)
    outline = lancet_outline(a0, spring, 0.0, r0, n=12)
    halves = _opening_halves(outline, 0.0)
    orders = 3
    ow = 0.17
    a_out = a0 + orders * ow
    r_out = r0 + orders * ow
    gable_top = spring + arch_rise(a_out, r_out) + 1.25

    def clip_front(yA, yB):
        if yA > gable_top + 0.1:
            return []
        if yB <= spring + arch_rise(a_out, r_out) + 0.1:
            return [(-a_out - 0.3, a_out + 0.3)]
        y = max(yA, spring + arch_rise(a_out, r_out))
        hw = (a_out + 0.3) * max(0.0, (gable_top - y) / (gable_top - spring - arch_rise(a_out, r_out))) + 0.25
        return [(-hw, hw)]

    def clip_back(yA, yB):
        if yA > apex0 + 0.2:
            return []
        ys = np.linspace(yA, min(yB, apex0), 6)
        w = max(arch_halfwidth(y, a0, r0, spring) for y in ys) + 0.2
        return [(-w, w)]

    _wall_body(root, seed=5, clip_front=clip_front, clip_back=clip_back, string_gaps=[(-a_out - 0.35, a_out + 0.35)],
               holes_halves=halves)
    trim = []
    zf = CORE_HZ
    for k in range(orders):
        a_k = a0 + k * ow
        r_k = r0 + k * ow
        proj = 0.1 + 0.08 * k
        path2 = lancet_outline(a_k, spring, 0.0, r_k, n=16)
        p3 = np.c_[path2, np.full(len(path2), zf)]
        prof = [(0.0, -0.02), (ow, -0.02), (ow, proj), (ow - 0.03, proj + 0.02), (0.05, proj + 0.02)] + \
               [(0.04 + 0.04 * math.cos(t), proj - 0.04 + 0.04 * math.sin(t)) for t in np.linspace(1.2, 3.6, 5)] + \
               [(0.0, proj - 0.09)]
        trim.append(sweep(prof, p3, up=(0, 0, 1)).shade(40))
        for sx in (-1, 1):  # capitals + bases of each order
            cx = sx * (a_k + ow / 2)
            trim.append(cbox(ow + 0.06, 0.22, proj + 0.1, 0.02, center=(cx, spring - 0.22, zf + (proj + 0.06) / 2),
                             bottom=True))
            trim.append(cbox(ow + 0.08, 0.4, proj + 0.12, 0.03, center=(cx, 0.0, zf + (proj + 0.08) / 2), bottom=True))
    # gable (wimperg) over the portal
    hw = a_out + 0.25
    gz = zf + 0.1
    tri = [(-hw, spring + 0.6), (hw, spring + 0.6), (0.0, gable_top)]
    trim.append(extrude(tri, zf - 0.02, gz).shade(30))
    from meshlib import beam
    for sx in (-1, 1):
        p0 = np.array([sx * (hw + 0.12), spring + 0.52, gz + 0.04])
        p1 = np.array([0.0, gable_top + 0.08, gz + 0.04])
        trim.append(beam(p0, p1, 0.22, 0.16, bevel=0.03, uv_scale=2.0))
        # crockets along the gable
        for t in np.linspace(0.2, 0.85, 4):
            c = p0 + (p1 - p0) * t + np.array([0, 0.11, 0])
            trim.append(cbox(0.1, 0.12, 0.12, 0.03, center=c).r("z", 0).shade(30))
        trim.append(cbox(0.3, 0.5, 0.3, 0.03, center=(sx * (hw + 0.12), spring + 0.12, zf + 0.15), bottom=True))
    th = np.arange(16) * TAU / 16
    fin = polar_stack([(0, 0.13), (0.1, 0.13), (0.12, 0.09), (0.3, 0.12 + 0.04 * np.cos(4 * th)),
                       (0.45, 0.06), (0.62, 0.02)], th, 2.0, 0.1)
    trim.append(fin.t(0, gable_top, gz - 0.02).shade(40))
    # back face frame
    trim.append(_frame(outline, -CORE_HZ, -1, FRAME_PROF))
    # threshold
    trim.append(cbox(2 * a0 + 0.1, 0.05, 2 * CORE_HZ, 0.01, center=(0, 0, 0), bottom=True))
    root.add("stone_plate", *trim)
    # door leaves (pivots at hinges, closed). Local geometry spans x in [0, a0] (L) / [-a0, 0] (R)
    for side, nm in ((-1, "door_L"), (1, "door_R")):
        node = Node(nm, translation=(side * (a0 - 0.01), 0.0, -0.12),
                    extras={"pivot": "hinge axis = local Y", "opens": "rotate about Y"})
        wood, iron = _door_leaf(a0 - 0.015, spring, r0, apex0, side, seed=21 + side)
        node.add("wood_dark", *wood)
        node.add("iron_rusted", *iron)
        root.child(node)
    root.extras = {"opening": {"width": 2 * a0, "height": round(apex0, 3)}, "front": "+Z (porch side)"}
    return root


def _door_leaf(w, spring, r0, apex0, side, seed):
    """Leaf in local coords: hinge at x=0, extends towards -side*x."""
    rng = np.random.default_rng(seed)
    a0 = w + 0.015

    def ytop(x):  # x in world-ish coordinates relative to opening centre
        xa = abs(x)
        return spring + math.sqrt(max(0.0, r0 ** 2 - (xa - (a0 - r0)) ** 2)) - 0.015

    planks = 5
    edges = np.linspace(0, w, planks + 1)
    wood, iron = [], []
    for i in range(planks):
        e0, e1 = edges[i] + 0.004, edges[i + 1] - 0.004
        xs = np.linspace(e0, e1, 3)
        # distance from hinge -> world x relative to centre: hinge at |x| = a0
        world = [a0 - x for x in xs]
        top = [ytop(x) for x in world]
        poly = [(e0, 0.01), (e1, 0.01)] + [(xs[j], top[j]) for j in (2, 1, 0)]
        z0 = -0.035 + rng.uniform(-0.004, 0.004)
        pl = extrude(poly, z0, z0 + 0.07)
        wood.append(pl.shade(30))
    # battens on the back
    for yb in (0.45, 1.6):
        wood.append(cbox(w * 0.92, 0.12, 0.03, 0.008, center=(w / 2, yb, -0.05)).shade(30))
    # strap hinges on the front with studs
    for ys in (0.55, 1.65, 2.6):
        ln = w * 0.86
        iron.append(cbox(ln, 0.05, 0.012, 0.004, center=(ln / 2 + 0.01, ys, 0.041)).shade(30))
        iron.append(cbox(0.09, 0.12, 0.014, 0.01, center=(ln + 0.02, ys, 0.041)).shade(30))
        for xs in np.linspace(0.12, ln - 0.05, 5):
            iron.append(cbox(0.022, 0.022, 0.03, 0.007, center=(xs, ys, 0.045)).shade(40))
        iron.append(cbox(0.06, 0.08, 0.1, 0.01, center=(0.0, ys, 0.0)).shade(30))  # knuckle
    # ring pull
    from kit import ring_torus
    iron.append(ring_torus(0.07, 0.011, 14, 6, axis="z").t(w - 0.14, 1.05, 0.055))
    iron.append(cbox(0.1, 0.1, 0.012, 0.01, center=(w - 0.14, 1.13, 0.042)).shade(30))
    soups_w = [s.apply(np.diag([-side, 1, 1, 1.0])) for s in wood]
    soups_i = [s.apply(np.diag([-side, 1, 1, 1.0])) for s in iron]
    for s in soups_w:
        s.box_uv(1.0)
    return soups_w, soups_i
