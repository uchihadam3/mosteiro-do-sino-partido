"""Prop pieces: bells, chains, furniture, liturgical objects, tombs, mechanisms."""
from __future__ import annotations

import math

import numpy as np

from kit import (bezier, candle, chain_links, cluster_section, ellipse_r, octagon,
                 polar_ring, quad_slab, rect_r, rect_slab, ring_stack, ring_torus, rock, turned)
from meshlib import (TAU, Node, R, S, T, beam, cbox, chain, circle, extrude, fan, grid_surface, hull, lancet_outline,
                     lathe, merge, noise1, pointed_arch, polar_stack, prism_xz, profile_bar, sweep)


def _th(n, off=0.0):
    return np.arange(n) * TAU / n + off


# ==========================================================================
# Bells
# ==========================================================================
BELL_OUTER = [(0.93, 0.0), (0.952, 0.025), (0.962, 0.07), (0.962, 0.115), (0.95, 0.165), (0.925, 0.225),
              (0.928, 0.245), (0.928, 0.27), (0.905, 0.285), (0.87, 0.345), (0.81, 0.45), (0.745, 0.585),
              (0.69, 0.75), (0.655, 0.92), (0.632, 1.09), (0.62, 1.25), (0.632, 1.262), (0.632, 1.30),
              (0.616, 1.31), (0.608, 1.44), (0.60, 1.53), (0.618, 1.545), (0.618, 1.585), (0.594, 1.60),
              (0.565, 1.665), (0.515, 1.725), (0.44, 1.768), (0.34, 1.795), (0.33, 1.80), (0.33, 1.83),
              (0.20, 1.845), (0.0, 1.85)]
BELL_INNER = [(0.0, 1.70), (0.28, 1.69), (0.44, 1.645), (0.515, 1.565), (0.548, 1.42), (0.565, 1.23),
              (0.588, 1.03), (0.625, 0.83), (0.68, 0.64), (0.74, 0.48), (0.79, 0.35), (0.815, 0.24),
              (0.83, 0.13), (0.84, 0.05), (0.85, 0.0)]


def bell_great_cracked():
    root = Node("bell_great_cracked")
    prof = BELL_INNER + BELL_OUTER  # axis(inside top) -> inner -> lip -> outer -> axis(top)
    th_c = 0.32
    base = np.linspace(0, TAU, 89)
    dense = th_c + np.linspace(-0.16, 0.16, 33)
    ang = np.unique(np.round(np.concatenate([base, dense]), 6))
    body = lathe(prof, angles=ang, uv_scale=0.5, ref_r=0.8)
    rng = np.random.default_rng(42)
    knots_y = np.linspace(0, 1.2, 14)
    knots_o = np.cumsum(rng.normal(0, 0.016, 14))
    knots_o -= knots_o[0]
    y_end = 1.2

    def crack_field(p):
        th = np.arctan2(p[:, 0], p[:, 2])
        rr = np.hypot(p[:, 0], p[:, 2])
        y = p[:, 1]
        path = th_c + np.interp(y, knots_y, knots_o)
        dth = np.angle(np.exp(1j * (th - path)))
        dist = np.abs(dth) * rr
        f = np.clip(1 - y / y_end, 0, 1)
        w = 0.008 + 0.028 * f
        g = np.clip(1 - dist / w, 0, 1) * (y < y_end)
        return th, rr, y, dist, f, g

    def deform(p):
        q = p.copy()
        th, rr, y, dist, f, g = crack_field(p)
        outer = rr > np.interp(y, [0, 0.3, 0.8, 1.3, 1.7], [0.9, 0.86, 0.66, 0.59, 0.5])
        depth = np.where(outer, 0.075 * f ** 0.7 + 0.01, -(0.035 * f))
        nr = rr - depth * g
        q[:, 0] = np.sin(th) * nr
        q[:, 2] = np.cos(th) * nr
        # V notch chipped out of the lip
        nw = 0.07
        nh = 0.16 * np.clip(1 - dist / nw, 0, 1)
        q[:, 1] = np.where((y < nh) & (dist < nw), nh, q[:, 1])
        return q

    body = body.map_pos(deform).shade(38)
    _, _, _, _, _, g = crack_field(body.tris.reshape(-1, 3))
    shade_c = 1.0 - 0.75 * g
    lip_dark = 1.0 - 0.3 * np.clip(1 - np.abs(body.tris.reshape(-1, 3)[:, 1] - 0.0) / 0.2, 0, 1) * \
        (np.abs(np.angle(np.exp(1j * (np.arctan2(body.tris.reshape(-1, 3)[:, 0], body.tris.reshape(-1, 3)[:, 2]) - th_c))))
         < 0.08)
    c = np.clip(shade_c * lip_dark, 0, 1)
    body.colors = np.stack([c, c * 0.97, c * 0.95, np.ones_like(c)], -1).reshape(-1, 3, 4)
    # canons (crown loops) + central argent
    canon_prof = [(0.03, -0.04), (0.03, 0.04), (-0.03, 0.04), (-0.03, -0.04)]
    crown = []
    for k in range(6):
        a = k * TAU / 6 + TAU / 12
        t = np.linspace(0, math.pi, 12)
        rad = 0.19 + 0.09 * np.cos(t)
        pts = np.c_[np.sin(a) * rad, 1.82 + 0.2 * np.sin(t), np.cos(a) * rad]
        crown.append(sweep(canon_prof, pts, up=(math.cos(a), 0, -math.sin(a))).shade(45))
    t = np.linspace(0, math.pi, 16)
    pts = np.c_[0.11 * np.cos(t), 1.83 + 0.37 * np.sin(t), np.zeros(16)]
    crown.append(sweep([(0.04, -0.05), (0.04, 0.05), (-0.04, 0.05), (-0.04, -0.05)], pts, up=(0, 0, 1)).shade(45))
    crown.append(turned([(0.36, 1.83), (0.36, 1.86), (0.3, 1.89), (0.0, 1.9)], 32, 0.5, 40))
    root.child(Node("bell_great_cracked_body")).add("bronze_aged", body)
    root.child(Node("bell_great_cracked_crown")).add("bronze_aged", *crown)
    # clapper hanging from a pivot under the crown
    clap = Node("bell_clapper", translation=(0, 1.66, 0), extras={"pivot": "swing about local X/Z"})
    cl = [ring_torus(0.045, 0.014, 14, 6, axis="x").t(0, -0.05, 0),
          turned([(0.0, -1.62), (0.03, -1.6), (0.06, -1.56), (0.1, -1.5), (0.118, -1.44), (0.11, -1.37),
                  (0.07, -1.31), (0.045, -1.27), (0.038, -0.6), (0.03, -0.14), (0.04, -0.1), (0.0, -0.09)], 14, 0.5, 45)]
    clap.add("iron_rusted", *cl)
    root.child(clap)
    root.anchor("bell_crown_anchor", (0, 2.2, 0), extras={"kind": "hang"})
    root.extras = {"crack": "jagged groove from a lip notch at ~18 deg towards +X, darkened via COLOR_0"}
    return root


def bell_small():
    root = Node("bell_small")
    prof = [(0.0, 0.118), (0.035, 0.117), (0.05, 0.1), (0.056, 0.06), (0.062, 0.025), (0.068, 0.006), (0.07, 0.0),
            (0.074, 0.004), (0.077, 0.014), (0.072, 0.04), (0.064, 0.07), (0.06, 0.1), (0.052, 0.118), (0.04, 0.128),
            (0.016, 0.133), (0.0, 0.134)]
    root.add("bronze_aged", lathe(prof, 28, uv_scale=0.25).shade(45))
    root.add("wood_dark", turned([(0.0, 0.13), (0.02, 0.13), (0.022, 0.15), (0.014, 0.17), (0.016, 0.2),
                                  (0.021, 0.225), (0.017, 0.245), (0.008, 0.252), (0.0, 0.253)], 12, 0.25, 50))
    root.add("iron_rusted", turned([(0.0, 0.02), (0.012, 0.024), (0.015, 0.035), (0.01, 0.045), (0.003, 0.05),
                                    (0.003, 0.11), (0.0, 0.11)], 8, 0.25, 50))
    root.anchor("bell_small_grip_anchor", (0, 0.2, 0), extras={"kind": "hand"})
    return root


# ==========================================================================
def bell_frame():
    root = Node("bell_frame")
    wood, iron = [], []
    axis_y = 3.45
    for sx in (-1, 1):
        x = sx * 1.55
        wood.append(beam((x, 0.45, -1.35), (x, 0.45, 1.35), 0.32, 0.3, 0.03))  # side sill
        for sz in (-1, 1):
            wood.append(beam((x, 0.55, sz * 1.1), (x, axis_y - 0.25, sz * 0.2), 0.28, 0.28, 0.03))
            # knee brace
            wood.append(beam((x, 0.6, sz * 1.25), (x, 1.45, sz * 0.88), 0.2, 0.18, 0.025))
        wood.append(beam((x, 1.75, -0.78), (x, 1.75, 0.78), 0.26, 0.24, 0.025))  # tie
        wood.append(beam((x, 2.65, -0.43), (x, 2.65, 0.43), 0.24, 0.22, 0.025))
        wood.append(cbox(0.42, 0.3, 0.72, 0.03, center=(x, axis_y - 0.32, 0), bottom=True).box_uv(1.0))
        iron.append(cbox(0.3, 0.12, 0.36, 0.015, center=(x, axis_y - 0.04, 0), bottom=True))  # bearing
        for sz in (-1, 1):
            iron.append(cbox(0.36, 0.34, 0.02, 0.006, center=(x, 1.75, sz * 0.66)))  # joint plates
            iron.append(cbox(0.34, 0.06, 0.06, 0.01, center=(x, 0.45, sz * 1.05)))
    for sz in (-1, 1):
        wood.append(beam((-1.95, 0.15, sz * 1.15), (1.95, 0.15, sz * 1.15), 0.3, 0.3, 0.03))
        wood.append(beam((-1.5, 0.72, sz * 1.15), (1.5, 1.55, sz * 1.15), 0.18, 0.16, 0.02))
        wood.append(beam((1.5, 0.72, sz * 1.15), (-1.5, 1.55, sz * 1.15) , 0.18, 0.16, 0.02).t(0, 0, sz * 0.02))
    for x in (-1.55, 1.55):
        for sz in (-1, 1):
            iron.append(cbox(0.3, 0.28, 0.02, 0.006, center=(x, 0.15, sz * 1.31)))
    root.add("wood_dark", *[w.shade(30) for w in wood])
    root.add("iron_rusted", *[i.shade(30) for i in iron])
    # swinging headstock with wheel
    hs = Node("bell_headstock", translation=(0, axis_y, 0), extras={"pivot": "swing about local X"})
    hw, hi = [], []
    hw.append(cbox(2.6, 0.5, 0.48, 0.04).box_uv(1.0))
    hw.append(cbox(1.2, 0.16, 0.6, 0.03, center=(0, -0.3, 0)).box_uv(1.0))
    for sx in (-1, 1):
        hi.append(turned([(0.0, 0), (0.07, 0), (0.07, 0.34), (0.05, 0.36), (0.0, 0.36)], 12, 0.5, 40)
                  .apply(chain(T(sx * 1.28, 0, 0), R("z", -90 * sx))))
        for zz in (-1, 1):  # U straps down to the crown
            hi.append(cbox(0.08, 0.72, 0.025, 0.006, center=(sx * 0.22, -0.18, zz * 0.255)))
        hi.append(cbox(0.08, 0.025, 0.56, 0.006, center=(sx * 0.22, 0.2625, 0)))
        for k in np.linspace(-1.1, 1.1, 5):
            hi.append(cbox(0.04, 0.04, 0.52, 0.01, center=(k, 0.1 * sx, 0)))
    # wheel (rope wheel) in the YZ plane at x = 1.2
    rim = sweep([(-0.06, -0.04), (0.06, -0.04), (0.06, 0.04), (-0.06, 0.04)],
                np.c_[np.zeros(40), np.sin(np.linspace(0, TAU, 40, endpoint=False)) * 1.15,
                      np.cos(np.linspace(0, TAU, 40, endpoint=False)) * 1.15],
                up=(1, 0, 0), closed_path=True).t(1.18, 0, 0)
    hw.append(rim.box_uv(1.0))
    for k in range(4):
        a = k * math.pi / 4
        d = np.array([0, math.sin(a), math.cos(a)]) * 1.12
        hw.append(beam(np.array([1.18, 0, 0]) - d, np.array([1.18, 0, 0]) + d, 0.07, 0.08, 0.012, up=(1, 0, 0)))
    hs.add("wood_dark", *[w.shade(30) for w in hw])
    hs.add("iron_rusted", *[i.shade(30) for i in hi])
    hs.anchor("bell_mount_anchor", (0, -0.36, 0), extras={"kind": "attach bell_crown_anchor here"})
    root.child(hs)
    return root


# ==========================================================================
def _chain_stub(top_y, length, seed=0, link=0.1, wire=0.012):
    s, _ = chain_links(length, link_len=link, wire=wire, width=0.06, segs=10, prof=5, seed=seed,
                       top=(0, top_y + length, 0))
    return s


def counterweight():
    root = Node("counterweight")
    # a: cast iron block
    a = Node("counterweight_a", translation=(-1.0, 0, 0))
    parts = [cbox(0.46, 0.56, 0.36, 0.035, bottom=True)]
    for y in (0.1, 0.42):
        parts.append(cbox(0.49, 0.05, 0.39, 0.012, center=(0, y, 0), bottom=True))
    parts.append(hull([[-0.12, 0.56, -0.08], [0.12, 0.56, -0.08], [-0.12, 0.56, 0.08], [0.12, 0.56, 0.08],
                       [-0.06, 0.62, -0.04], [0.06, 0.62, -0.04], [-0.06, 0.62, 0.04], [0.06, 0.62, 0.04]]))
    parts.append(ring_torus(0.06, 0.017, 14, 6, axis="z").t(0, 0.68, 0))
    parts.append(_chain_stub(0.70, 0.42, 1))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(cbox(0.03, 0.03, 0.02, 0.008, center=(sx * 0.17, 0.27, sz * 0.18)))
    a.add("iron_rusted", *[p.shade(35) for p in parts])
    # b: banded stone drum
    b = Node("counterweight_b")
    b.add("stone_plate", turned([(0.0, 0), (0.3, 0), (0.32, 0.03), (0.33, 0.08), (0.33, 0.44), (0.31, 0.49),
                                 (0.27, 0.52), (0.0, 0.52)], 28, 2.0, 40).displace(0.008, 6.0, 3))
    ib = [turned([(0.338, 0.2), (0.345, 0.21), (0.345, 0.3), (0.338, 0.31)], 28, 0.5, 40),
          sweep([(-0.03, -0.006), (0.03, -0.006), (0.03, 0.006), (-0.03, 0.006)],
                np.c_[np.r_[[-0.345] * 2, np.linspace(-0.3, 0.3, 9), [0.345] * 2],
                      np.r_[[0.25, 0.48], np.full(9, 0.535), [0.48, 0.25]], np.zeros(13)], up=(0, 0, 1)),
          ring_torus(0.06, 0.016, 14, 6, axis="z").t(0, 0.61, 0), _chain_stub(0.63, 0.4, 2)]
    b.add("iron_rusted", *[p.shade(35) for p in ib])
    # c: iron pear weight
    c = Node("counterweight_c", translation=(1.0, 0, 0))
    c.add("iron_rusted", turned([(0.0, 0.0), (0.1, 0.0), (0.17, 0.03), (0.22, 0.1), (0.235, 0.2), (0.21, 0.33),
                                 (0.15, 0.45), (0.1, 0.52), (0.075, 0.56), (0.09, 0.575), (0.09, 0.6), (0.05, 0.62),
                                 (0.0, 0.625)], 24, 0.5, 40),
          ring_torus(0.05, 0.014, 14, 6, axis="z").t(0, 0.67, 0), _chain_stub(0.69, 0.42, 3))
    for n in (a, b, c):
        root.child(n)
    return root


def chain_hanging(length=3.0, name="chain_hanging"):
    root = Node(name)
    links, bottom = chain_links(length, link_len=0.16, wire=0.017, width=0.09, segs=12, prof=5, seed=7,
                                top=(0, length + 0.22, 0))
    hook_path = bezier([[0, 0.24, 0], [0, 0.05, 0], [0.13, 0.0, 0], [0.13, 0.17, 0], [0.06, 0.2, 0]], 12)
    hook = sweep(circle(0.018, 6), hook_path, up=(0, 0, 1), scales=np.linspace(1, 0.6, 12)).shade(50)
    ring = ring_torus(0.035, 0.014, 12, 6, axis="z").t(0, bottom + 0.0, 0)
    soup = merge(links, hook.t(0, bottom - 0.2, 0), ring)
    lo = soup.bounds()[0][1]
    root.add("iron_rusted", soup.t(0, -lo, 0))
    root.anchor("chain_top_anchor", (0, length + 0.22 - lo, 0), extras={"kind": "hang"})
    return root


def chain_short():
    return chain_hanging(1.0, "chain_short")


# ==========================================================================
def cage_grate():
    root = Node("cage_grate")
    W, H = 1.2, 2.0
    jamb = []
    for sx in (-1, 1):
        jamb.append(cbox(0.1, H + 0.12, 0.12, 0.012, center=(sx * (W / 2 + 0.07), 0, 0), bottom=True))
        jamb.append(cbox(0.16, 0.06, 0.18, 0.01, center=(sx * (W / 2 + 0.07), 0, 0), bottom=True))
    jamb.append(cbox(W + 0.34, 0.1, 0.14, 0.012, center=(0, H + 0.12, 0), bottom=True))
    for y in (0.35, 1.0, 1.65):  # pintles
        jamb.append(cbox(0.08, 0.05, 0.05, 0.008, center=(-W / 2 - 0.01, y, 0.0)))
    root.child(Node("cage_grate_frame")).add("iron_rusted", *[j.shade(30) for j in jamb])
    door = Node("grate_door", translation=(-W / 2 + 0.01, 0.02, 0), extras={"pivot": "hinge axis local Y"})
    d = []
    w = W - 0.04
    for x in (0.02, w - 0.02):
        d.append(cbox(0.05, H - 0.06, 0.05, 0.008, center=(x, 0.0, 0), bottom=True))
    for y in (0.03, 0.9, H - 0.1):
        d.append(cbox(w, 0.06, 0.03, 0.008, center=(w / 2, y, 0), bottom=True))
    nb = 9
    for k in range(nb):
        x = 0.1 + k * (w - 0.2) / (nb - 1)
        d.append(turned([(0.0, 0.05), (0.016, 0.05), (0.016, H - 0.08), (0.024, H - 0.05), (0.012, H + 0.02),
                         (0.0, H + 0.1)], 8, 0.5, 40).t(x, 0, 0))
        for y in (0.06, 0.93, H - 0.07):
            d.append(cbox(0.04, 0.05, 0.04, 0.01, center=(x, y, 0.017)))
    for y in (0.35, 1.0, 1.65):
        d.append(turned([(0.0, -0.06), (0.022, -0.06), (0.022, 0.06), (0.0, 0.06)], 10, 0.5, 40).t(0.0, y, 0))
    d.append(cbox(0.16, 0.22, 0.08, 0.015, center=(w - 0.06, 0.95, 0.05)))
    d.append(cbox(0.016, 0.05, 0.01, 0.004, center=(w - 0.06, 0.95, 0.095)))
    door.add("iron_rusted", *[p.shade(35) for p in d])
    root.child(door)
    return root


# ==========================================================================
BOOK_TINTS = [(1.0, 1.0, 1.0), (0.7, 0.35, 0.3), (0.45, 0.55, 0.42), (0.35, 0.33, 0.45), (1.25, 1.1, 0.85),
              (0.5, 0.45, 0.4), (1.1, 0.8, 0.55), (0.8, 0.25, 0.22)]


def _book(w, h, d, tint, rng):
    cover = cbox(w, h, d, 0.0, bottom=True)
    tint = np.clip(np.array(tint) / 1.25, 0, 1)
    cover.color(list(tint) + [1.0])
    pages = cbox(w - 0.01, h + 0.004 - 0.01, d - 0.022, 0.0, center=(0, 0.004, -0.011 + 0.0), bottom=True)
    pages = pages.t(0, 0.0, -0.001)
    return cover, pages


def bookshelf():
    root = Node("bookshelf")
    rng = np.random.default_rng(17)
    W, Hs, D = 1.6, 2.7, 0.45
    wood = []
    th_s = 0.06
    for sx in (-1, 1):
        x = sx * (W / 2 - th_s / 2)
        poly = [(-D / 2, 0.0), (D / 2, 0.0), (D / 2 + 0.02, 0.1), (D / 2, 0.14), (D / 2, Hs)]
        poly += [(D / 2 + 0.03, Hs + 0.06), (0.1, Hs + 0.06), (0.0, Hs + 0.16), (-0.1, Hs + 0.06), (-D / 2, Hs + 0.06)]
        wood.append(profile_bar(poly, x - th_s / 2, x + th_s / 2).box_uv(1.0))
        # pinnacle on each side
        th8 = _th(8, math.pi / 8)
        pin = polar_stack([(0, 0.07), (0.08, 0.07), (0.1, 0.05), (0.35, 0.025), (0.37, 0.04), (0.4, 0.0)], th8, 1.0,
                          0.05)
        wood.append(pin.t(x, Hs + 0.13, 0))
        for zz in (-1, 1):
            wood.append(cbox(0.08, 0.08, 0.08, 0.015, center=(x, Hs + 0.06, zz * 0.18), bottom=True))
    shelves = [0.12, 0.62, 1.12, 1.62, 2.12, 2.62]
    for y in shelves:
        wood.append(cbox(W - 2 * th_s, 0.035, D - 0.03, 0.006, center=(0, y - 0.035, 0.0), bottom=True).box_uv(1.0))
        wood.append(beam((-W / 2 + th_s, y - 0.02, D / 2 - 0.01), (W / 2 - th_s, y - 0.02, D / 2 - 0.01), 0.03, 0.05,
                         0.008))
    wood.append(cbox(W - 0.02, 0.12, 0.03, 0.01, center=(0, 0.0, D / 2 - 0.02), bottom=True).box_uv(1.0))
    for k in range(6):  # back planks
        x0 = -W / 2 + th_s + k * (W - 2 * th_s) / 6
        wood.append(cbox((W - 2 * th_s) / 6 - 0.004, Hs - 0.12, 0.02, 0.003,
                         center=(x0 + (W - 2 * th_s) / 12, 0.12, -D / 2 + 0.02), bottom=True).box_uv(1.0))
    # crest with three pointed gables and tracery holes as relief
    crest_poly = [(-W / 2 + th_s, Hs), (W / 2 - th_s, Hs), (W / 2 - th_s, Hs + 0.08)]
    for cx in (0.45, 0.0, -0.45):
        top = 0.36 if cx == 0 else 0.28
        crest_poly += [(cx + 0.24, Hs + 0.08), (cx, Hs + top), (cx - 0.24, Hs + 0.08)]
    crest_poly += [(-W / 2 + th_s, Hs + 0.08)]
    wood.append(extrude(crest_poly, D / 2 - 0.05, D / 2 - 0.01).box_uv(1.0))
    for cx in (0.45, 0.0, -0.45):
        arch = pointed_arch(0.06, 0.12, 6, y0=Hs + 0.06)
        pr = np.c_[arch + [cx, 0], np.full(len(arch), D / 2 - 0.005)]
        wood.append(sweep([(-0.008, -0.004), (0.008, -0.004), (0.008, 0.004), (-0.008, 0.004)], pr, up=(0, 0, 1)))
    root.add("wood_dark", *[w.shade(30) for w in wood])
    covers, pages = [], []
    for si, y in enumerate(shelves[:-1]):
        x = -W / 2 + th_s + 0.01
        x_end = W / 2 - th_s - 0.01
        gap_h = shelves[si + 1] - y - 0.04
        while x < x_end - 0.03:
            r = rng.random()
            if r < 0.06 and x < x_end - 0.35:  # stack of lying books
                yy = y
                for k in range(rng.integers(2, 5)):
                    w, d, hh = rng.uniform(0.2, 0.3), rng.uniform(0.18, 0.26), rng.uniform(0.03, 0.06)
                    cv, pg = _book(hh, w, d, BOOK_TINTS[rng.integers(len(BOOK_TINTS))], rng)
                    m = chain(T(x + w / 2 + 0.01, yy + hh, D / 2 - 0.03 - d / 2), R("y", rng.uniform(-8, 8)),
                              R("z", -90))
                    covers.append(cv.apply(m))
                    pages.append(pg.apply(m))
                    yy += hh
                x += 0.33
                continue
            if r < 0.1:
                x += rng.uniform(0.04, 0.12)
                continue
            w = rng.uniform(0.028, 0.075)
            h = min(rng.uniform(0.22, 0.42), gap_h - 0.02)
            d = rng.uniform(0.2, 0.3)
            if x + w > x_end:
                break
            cv, pg = _book(w, h, d, BOOK_TINTS[rng.integers(len(BOOK_TINTS))], rng)
            lean = 0.0
            if rng.random() < 0.08 and x + w + 0.12 < x_end:
                lean = rng.uniform(8, 20)
            m = chain(T(x + w / 2, y, D / 2 - 0.035 - d / 2 + rng.uniform(-0.015, 0.0)), R("z", -lean),
                      R("y", rng.uniform(-2, 2)))
            covers.append(cv.apply(m))
            pages.append(pg.apply(m))
            x += w + 0.002 + (math.sin(math.radians(lean)) * h if lean else 0)
    root.child(Node("bookshelf_books")).add("leather", *[c.flat() for c in covers]).add("parchment",
                                                                                        *[p.flat() for p in pages])
    return root


# ==========================================================================
def _open_book(width=0.44, depth=0.3, thick=0.03, segs=8):
    """Open book lying on local XZ (spine along Z), returns (parchment, leather) soups."""
    pg = []
    for sx in (-1, 1):
        xs = np.linspace(0, width / 2, segs)
        z = np.array([-depth / 2, depth / 2])
        y = thick * (0.4 + 0.6 * np.sin(np.linspace(0, math.pi * 0.9, segs)) ** 0.7)
        y[0] = 0.006
        P = np.stack([np.stack([sx * xs, y, np.full(segs, zz)], -1) for zz in z], 1)
        s = grid_surface(P)
        if s.face_normals()[:, 1].mean() < 0:
            s = s.flipped()
        pg.append(s)
        # page block edges
        e = np.stack([np.c_[sx * xs, y, np.full(segs, depth / 2)], np.c_[sx * xs, np.zeros(segs), np.full(segs, depth / 2)]], 1)
        e2 = grid_surface(e)
        if e2.face_normals()[:, 2].mean() < 0:
            e2 = e2.flipped()
        pg.append(e2)
        pg.append(e2.apply(np.diag([1, 1, -1, 1.0])))
        o = np.stack([np.c_[[sx * width / 2] * 2, [0, y[-1]], [-depth / 2, -depth / 2]],
                      np.c_[[sx * width / 2] * 2, [0, y[-1]], [depth / 2, depth / 2]]], 1)
        o2 = grid_surface(o)
        if o2.face_normals()[:, 0].mean() * sx < 0:
            o2 = o2.flipped()
        pg.append(o2)
    cover = cbox(width + 0.03, 0.008, depth + 0.02, 0.003, center=(0, -0.006, 0), bottom=True)
    return merge(*[p.shade(40) for p in pg]), cover.shade(30)


def lectern():
    root = Node("lectern")
    wood = []
    th6 = np.linspace(0, TAU, 7) + math.pi / 6
    base = lathe([(0.0, 0.0), (0.36, 0.0), (0.36, 0.06), (0.32, 0.09), (0.3, 0.13), (0.24, 0.15), (0.2, 0.2),
                  (0.12, 0.24), (0.0, 0.24)], angles=th6, uv_scale=1.0).shade(30)
    wood.append(base)
    wood.append(turned([(0.06, 0.24), (0.075, 0.28), (0.06, 0.32), (0.05, 0.4), (0.055, 0.55), (0.08, 0.6),
                        (0.085, 0.64), (0.06, 0.68), (0.045, 0.8), (0.05, 0.92), (0.075, 0.96), (0.075, 1.0),
                        (0.1, 1.04), (0.0, 1.05)], 12, 1.0, 50))
    top = Node("lectern_desk", translation=(0, 1.1, 0))
    tw = []
    tw.append(cbox(0.62, 0.04, 0.46, 0.008).r("x", 28))
    tw.append(cbox(0.62, 0.05, 0.03, 0.008, center=(0, 0.02, 0.235)).r("x", 28))
    for sx in (-1, 1):
        tw.append(profile_bar([(z, y) for (z, y) in [(-0.2, 0.08), (0.2, -0.13), (-0.2, -0.13)]], sx * 0.26 - 0.015,
                              sx * 0.26 + 0.015))
    tw.append(cbox(0.2, 0.1, 0.2, 0.01, center=(0, -0.11, 0)))
    pages, cover = _open_book(0.5, 0.34, 0.035)
    m = chain(R("x", 28), T(0, 0.03, -0.01))
    top.add("wood_dark", *[w.box_uv(1.0).shade(30) for w in tw])
    top.add("parchment", pages.apply(m))
    top.add("leather", cover.apply(m))
    root.add("wood_dark", *wood)
    root.child(top)
    return root


def desk_scribe():
    root = Node("desk_scribe")
    wood = []
    Wd, Dd = 1.2, 0.62
    for sx in (-1, 1):
        for sz in (-1, 1):
            h = 0.78 if sz < 0 else 0.68
            wood.append(beam((sx * 0.54, 0, sz * 0.26), (sx * 0.54, h, sz * 0.26), 0.07, 0.07, 0.012))
        wood.append(beam((sx * 0.54, 0.12, -0.26), (sx * 0.54, 0.12, 0.26), 0.05, 0.05, 0.008))
    wood.append(beam((-0.54, 0.12, 0), (0.54, 0.12, 0), 0.05, 0.05, 0.008))
    wood.append(cbox(1.05, 0.025, 0.45, 0.005, center=(0, 0.3, 0)).box_uv(1.0))  # lower shelf
    slope = math.degrees(math.atan2(0.1, 0.56))
    wood.append(cbox(Wd, 0.04, Dd, 0.01).box_uv(1.0).apply(chain(T(0, 0.75, 0.0), R("x", slope))))
    wood.append(cbox(Wd, 0.04, 0.18, 0.008, center=(0, 0.81, -0.36)).box_uv(1.0))  # flat back shelf
    wood.append(cbox(Wd, 0.05, 0.03, 0.006).box_uv(1.0).apply(chain(T(0, 0.75, 0), R("x", slope), T(0, 0.04, 0.3))))
    for sx in (-1, 1):
        wood.append(profile_bar([(-0.31, 0.68), (0.31, 0.64), (0.31, 0.58), (-0.31, 0.58)], sx * 0.56 - 0.015,
                                sx * 0.56 + 0.015).box_uv(1.0))
    root.add("wood_dark", *[w.shade(30) for w in wood])
    # inkwell + quill
    ink = turned([(0.0, 0.0), (0.045, 0.0), (0.05, 0.01), (0.05, 0.035), (0.035, 0.05), (0.02, 0.055), (0.022, 0.065),
                  (0.012, 0.067), (0.0, 0.06)], 12, 0.25, 50).t(0.38, 0.83, -0.34)
    quill_path = bezier([[0.38, 0.88, -0.34], [0.4, 1.0, -0.33], [0.43, 1.1, -0.3], [0.45, 1.16, -0.26]], 8)
    quill = sweep([(-0.012, -0.0015), (0.012, -0.0015), (0.012, 0.0015), (-0.012, 0.0015)], quill_path,
                  up=(1, 0, 0), scales=np.r_[0.15, 0.4, 0.8, 1.0, 1.0, 0.9, 0.6, 0.2]).shade(50)
    root.add("bronze_aged", ink)
    root.add("parchment", quill)
    # scrolls, sheet, book
    scrolls, ties = [], []
    for k, (x, z, ang, L) in enumerate([(-0.35, -0.36, 80, 0.32), (-0.2, -0.33, 95, 0.28), (0.12, -0.36, 75, 0.3)]):
        sc = turned([(0.0, 0.0), (0.028, 0.0), (0.03, 0.004), (0.03, L - 0.004), (0.028, L), (0.0, L)], 10, 0.25, 50)
        m = chain(T(x, 0.83 + 0.03, z), R("y", ang), R("z", -90), T(0, -L / 2, 0))
        scrolls.append(sc.apply(m))
        ties.append(turned([(0.031, L / 2 - 0.01), (0.033, L / 2 - 0.008), (0.033, L / 2 + 0.008),
                            (0.031, L / 2 + 0.01)], 10, 0.25, 50).apply(m))
    sheet_m = chain(T(0, 0.75, 0), R("x", slope), T(-0.05, 0.022, 0.02))
    xs = np.linspace(-0.2, 0.2, 2)
    zs = np.linspace(-0.15, 0.15, 6)
    P = np.stack([np.c_[np.full(6, x), 0.006 * np.sin(zs * 20) + 0.004, zs] for x in xs], 0)
    sheet = grid_surface(P)
    if sheet.face_normals()[:, 1].mean() < 0:
        sheet = sheet.flipped()
    scrolls.append(sheet.apply(sheet_m).shade(40))
    cv, pg = _book(0.22, 0.05, 0.3, (0.7, 0.35, 0.3), None)
    bm = chain(T(-0.44, 0.83, -0.34 + 0.0), R("y", 8), R("z", -90), T(0, -0.11, 0))
    root.add("parchment", *[s.shade(45) for s in scrolls], pg.apply(chain(T(0.48, 0.0, 0.0), bm)).flat())
    root.add("leather", *ties, cv.apply(chain(T(0.48, 0.0, 0.0), bm)).flat())
    wax, wick, tip = candle(0.11, 0.022, seed=5, segs=8, drips=2)
    holder = turned([(0.0, 0.0), (0.05, 0.0), (0.055, 0.008), (0.03, 0.014), (0.026, 0.03), (0.0, 0.03)], 10, 0.25, 50)
    root.add("iron_rusted", holder.t(0.5, 0.83, -0.36), wick.t(0.5, 0.86, -0.36))
    root.add("wax", wax.t(0.5, 0.86, -0.36))
    root.anchor("desk_scribe_candle_flame_anchor", tip + [0.5, 0.86 + 0.015, -0.36], extras={"kind": "flame"})
    return root


# ==========================================================================
def _candle_group(node, prefix, center, count, seed, rmin=0.02, rmax=0.045, hmin=0.08, hmax=0.42, spread=0.16,
                  pool=True):
    rng = np.random.default_rng(seed)
    wax, wick = [], []
    placed = []
    for k in range(count):
        for _ in range(40):
            r = rng.uniform(rmin, rmax)
            ang, dist = rng.uniform(0, TAU), spread * math.sqrt(rng.random())
            p = np.array([math.cos(ang) * dist, math.sin(ang) * dist])
            if all(np.linalg.norm(p - q) > r + rq + 0.006 for q, rq in placed):
                break
        placed.append((p, r))
        h = rng.uniform(hmin, hmax) * (1.2 if dist < spread * 0.4 else 0.85)
        w, wk, tip = candle(h, r, seed=seed * 31 + k, segs=9, drips=rng.integers(1, 4))
        off = np.array([center[0] + p[0], center[1], center[2] + p[1]])
        wax.append(w.t(*off))
        wick.append(wk.t(*off))
        node.anchor(f"{prefix}_c{k}_flame_anchor", tip + off + [0, 0.012, 0], extras={"kind": "flame"})
    if pool:
        th = _th(24)
        rr = spread * 0.75 + rmax + 0.025 * (1 + noise1(th * 3, seed)) + 0.02 * np.abs(np.sin(th * 2.5 + seed))
        pool_s = ring_stack([polar_ring(th, rr, 0.0), polar_ring(th, rr - 0.012, 0.008),
                             polar_ring(th, rr * 0.7, 0.014)], cap_top=True, top_center=[0, 0.015, 0])
        wax.append(pool_s.t(*center).shade(50))
    node.add("wax", *wax)
    node.add("iron_rusted", *wick)


def candle_cluster():
    root = Node("candle_cluster")
    _candle_group(root, "candle_cluster", (0, 0, 0), 7, seed=3)
    return root


def candelabra():
    root = Node("candelabra")
    iron = []
    iron.append(turned([(0.0, 0.3), (0.07, 0.3), (0.08, 0.34), (0.05, 0.38), (0.035, 0.45), (0.05, 0.5),
                        (0.06, 0.53), (0.04, 0.57), (0.026, 0.7), (0.022, 1.0), (0.045, 1.05), (0.05, 1.08),
                        (0.03, 1.12), (0.022, 1.35), (0.04, 1.4), (0.05, 1.45), (0.0, 1.46)], 12, 0.5, 50))
    for k in range(3):
        a = k * TAU / 3
        d = np.array([math.sin(a), 0, math.cos(a)])
        path = bezier([[0, 0.34, 0], d * 0.12 + [0, 0.32, 0], d * 0.3 + [0, 0.2, 0], d * 0.38 + [0, 0.02, 0],
                       d * 0.42 + [0, 0.05, 0]], 12)
        iron.append(sweep(circle(0.018, 6), path, up=(d[2], 0, -d[0]), scales=np.linspace(1.1, 0.7, 12)).shade(50))
        iron.append(turned([(0.0, 0.0), (0.035, 0.0), (0.04, 0.02), (0.025, 0.045), (0.0, 0.05)], 8, 0.5, 50)
                    .t(*(d * 0.4)))
    tops = [np.array([0, 1.6, 0])]
    for k in range(4):
        a = k * TAU / 4 + math.pi / 4
        d = np.array([math.sin(a), 0, math.cos(a)])
        path = bezier([[0, 1.38, 0], d * 0.2 + [0, 1.32, 0], d * 0.34 + [0, 1.42, 0], d * 0.3 + [0, 1.52, 0]], 10)
        iron.append(sweep(circle(0.014, 6), path, up=(d[2], 0, -d[0])).shade(50))
        tops.append(d * 0.3 + [0, 1.53, 0])
    iron.append(turned([(0.0, 1.46), (0.02, 1.46), (0.02, 1.58), (0.0, 1.58)], 8, 0.5, 50))
    for k, tp in enumerate(tops):
        iron.append(turned([(0.0, -0.02), (0.02, -0.02), (0.07, 0.0), (0.075, 0.012), (0.06, 0.008), (0.02, 0.01),
                            (0.018, 0.03), (0.0, 0.03)], 12, 0.5, 40).t(*tp))
        w, wk, tip = candle(0.16 + 0.06 * (k == 0), 0.022, seed=40 + k, segs=9, drips=2)
        root.add("wax", w.t(*(tp + [0, 0.03, 0])))
        iron.append(wk.t(*(tp + [0, 0.03, 0])))
        root.anchor(f"candelabra_c{k}_flame_anchor", tip + tp + [0, 0.045, 0], extras={"kind": "flame"})
    root.add("iron_rusted", *iron)
    return root


def torch_sconce():
    root = Node("torch_sconce")
    iron = [cbox(0.12, 0.3, 0.02, 0.006, center=(0, 0, 0.01), bottom=True)]
    for y in (0.05, 0.25):
        iron.append(cbox(0.025, 0.025, 0.02, 0.008, center=(0, y, 0.025)))
    arm = bezier([[0, 0.12, 0.02], [0, 0.12, 0.15], [0, 0.2, 0.2], [0, 0.3, 0.22]], 8)
    iron.append(sweep([(-0.012, -0.008), (0.012, -0.008), (0.012, 0.008), (-0.012, 0.008)], arm, up=(1, 0, 0)))
    scroll = bezier([[0, 0.1, 0.02], [0, 0.0, 0.08], [0, 0.04, 0.16], [0, 0.11, 0.12], [0, 0.08, 0.09]], 10)
    iron.append(sweep([(-0.01, -0.004), (0.01, -0.004), (0.01, 0.004), (-0.01, 0.004)], scroll, up=(1, 0, 0)))
    tilt = 18
    tm = chain(T(0, 0.12, 0.24), R("x", tilt))
    iron.append(ring_torus(0.042, 0.008, 14, 5).apply(chain(tm, T(0, 0.2, 0))))
    iron.append(ring_torus(0.034, 0.008, 14, 5).apply(chain(tm, T(0, 0.04, 0))))
    torch_w = turned([(0.0, -0.05), (0.016, -0.05), (0.022, 0.1), (0.027, 0.3), (0.03, 0.42), (0.0, 0.42)], 10, 1.0, 50)
    head = turned([(0.0, 0.38), (0.034, 0.38), (0.05, 0.41), (0.056, 0.46), (0.05, 0.51), (0.055, 0.55),
                   (0.046, 0.6), (0.03, 0.625), (0.0, 0.63)], 12, 0.5, 40).displace(0.004, 30, 5)
    bands = [turned([(0.036, y), (0.04, y + 0.01), (0.036, y + 0.02)], 12, 0.5, 40) for y in (0.37,)]
    root.add("iron_rusted", *[i.shade(35) for i in iron], *[b.apply(tm) for b in bands])
    root.add("wood_dark", torch_w.apply(tm))
    root.add("cloth_wool", head.apply(tm).shade(50))
    tip = (tm @ np.array([0, 0.64, 0, 1.0]))[:3]
    root.anchor("torch_flame_anchor", tip, extras={"kind": "flame"})
    root.anchor("torch_light_anchor", tip + [0, 0.15, 0.12], extras={"kind": "light"})
    return root


def brazier():
    root = Node("brazier")
    iron = []
    th = _th(32)
    cren = (np.cos(th * 8) > 0.3).astype(float)
    bowl_outer = [(0.55, 0.06), (0.58, 0.18), (0.63, 0.3), (0.68, 0.38), (0.74, 0.41), (0.8, 0.42)]
    rings = [polar_ring(th, r + 0.008 * np.cos(th * 16), y) for (y, r) in bowl_outer]
    rings += [polar_ring(th, 0.44, 0.8), polar_ring(th, 0.44, 0.83 + 0.07 * cren),
              polar_ring(th, 0.405, 0.83 + 0.07 * cren), polar_ring(th, 0.40, 0.8), polar_ring(th, 0.37, 0.78)]
    bowl = ring_stack(rings, cap_top=True, top_center=[0, 0.8, 0])
    iron.append(bowl.shade(45))
    iron.append(fan(polar_ring(th, 0.06, 0.55)[::-1]).shade(0))
    for k in range(3):
        a = k * TAU / 3
        d = np.array([math.sin(a), 0, math.cos(a)])
        path = bezier([d * 0.3 + [0, 0.7, 0], d * 0.42 + [0, 0.5, 0], d * 0.36 + [0, 0.25, 0], d * 0.5 + [0, 0.08, 0],
                       d * 0.56 + [0, 0.1, 0]], 14)
        iron.append(sweep([(-0.025, -0.012), (0.025, -0.012), (0.025, 0.012), (-0.025, 0.012)], path,
                          up=(d[2], 0, -d[0]), scales=np.linspace(1.0, 0.8, 14)).shade(45))
        foot = hull(np.array([[0.06, 0, 0.05], [-0.06, 0, 0.05], [0.07, 0, -0.06], [-0.07, 0, -0.06],
                              [0.0, 0.07, 0.0], [0.03, 0.04, 0.06], [-0.03, 0.04, 0.06]]))
        iron.append(foot.apply(chain(T(*(d * 0.55)), R("y", math.degrees(a)))).flat())
    iron.append(ring_torus(0.37, 0.012, 32, 5).t(0, 0.3, 0))
    coals, embers = [], []
    rng = np.random.default_rng(9)
    for k in range(40):
        ang, dist = rng.uniform(0, TAU), 0.34 * math.sqrt(rng.random())
        big = rng.uniform(0.07, 0.15)
        s = rock((big, big * 0.7, big * rng.uniform(0.8, 1.2)), seed=900 + k, npts=12)
        y = 0.74 + 0.1 * (1 - (dist / 0.34) ** 2) + rng.uniform(-0.03, 0.01)
        s = s.r("y", rng.uniform(0, 360)).t(math.cos(ang) * dist, y, math.sin(ang) * dist)
        if k % 6 == 0:
            embers.append(s.s(0.7, 0.6, 0.7).t(math.cos(ang) * dist * 0.3, y * 0.4 + 0.02, math.sin(ang) * dist * 0.3).flat())
        else:
            coals.append(s.flat())
    root.add("iron_rusted", *iron, *coals)
    root.add("flame", *embers)
    root.anchor("brazier_flame_anchor", (0, 0.9, 0), extras={"kind": "flame"})
    root.anchor("brazier_light_anchor", (0, 1.25, 0), extras={"kind": "light"})
    return root


def censer():
    root = Node("censer")
    br = []
    br.append(turned([(0.0, 0.0), (0.04, 0.0), (0.045, 0.012), (0.03, 0.02), (0.035, 0.03), (0.07, 0.05),
                      (0.09, 0.08), (0.095, 0.11), (0.1, 0.12), (0.0, 0.12)], 16, 0.25, 45))
    th = _th(16)
    lid = polar_stack([(0.12, 0.1), (0.14, 0.098 + 0.006 * np.cos(th * 8)), (0.18, 0.085 + 0.01 * np.cos(th * 8)),
                       (0.22, 0.06 + 0.008 * np.cos(th * 8)), (0.25, 0.035), (0.27, 0.02), (0.29, 0.025),
                       (0.31, 0.012), (0.33, 0.0)], th, 0.25, 0.08)
    br.append(lid.shade(45))
    for k in range(3):
        a = k * TAU / 3
        br.append(ring_torus(0.012, 0.004, 8, 4, axis="z").r("y", math.degrees(a))
                  .t(math.sin(a) * 0.1, 0.12, math.cos(a) * 0.1))
    top_y = 1.02
    br.append(turned([(0.0, top_y - 0.01), (0.05, top_y - 0.01), (0.055, top_y + 0.0), (0.04, top_y + 0.02),
                      (0.0, top_y + 0.025)], 12, 0.25, 45))
    br.append(ring_torus(0.03, 0.006, 12, 5, axis="z").t(0, top_y + 0.06, 0))
    root.add("bronze_aged", *br)
    chains = []
    for k in range(3):
        a = k * TAU / 3
        p0 = np.array([math.sin(a) * 0.1, 0.13, math.cos(a) * 0.1])
        p1 = np.array([math.sin(a) * 0.035, top_y - 0.01, math.cos(a) * 0.035])
        L = np.linalg.norm(p1 - p0)
        links, _ = chain_links(L, link_len=0.045, wire=0.004, width=0.022, segs=6, prof=3, seed=k, top=(0, L, 0))
        m = np.eye(4)
        d = (p1 - p0) / L
        axis = np.cross([0, 1, 0], d)
        ang = math.degrees(math.acos(np.clip(d[1], -1, 1)))
        m = chain(T(*p0), R(axis, ang) if np.linalg.norm(axis) > 1e-6 else np.eye(4))
        chains.append(links.apply(m))
    root.add("iron_rusted", *chains)
    root.anchor("censer_flame_anchor", (0, 0.2, 0), extras={"kind": "smoke/embers"})
    root.anchor("censer_top_anchor", (0, top_y + 0.06, 0), extras={"kind": "hang"})
    return root


def banner_torn():
    root = Node("banner_torn")
    rng = np.random.default_rng(23)
    W, top = 1.2, 2.82
    nx, ny = 11, 20
    xs = np.linspace(-W / 2, W / 2, nx)
    tails = 0.42 * np.abs(np.sin((xs / W + 0.5) * math.pi * 1.5)) ** 1.2
    tear = rng.uniform(0, 0.22, nx) * (rng.random(nx) < 0.6)
    bottom = 0.05 + tails + tear
    bottom[0] += 0.08
    P = np.empty((nx, ny, 3))
    for i, x in enumerate(xs):
        ys = np.linspace(top, bottom[i], ny)
        f = (top - ys) / (top - 0.05)
        z = 0.028 * np.sin(x * 9.0 + ys * 0.8) * (0.4 + f) + 0.05 * f ** 2
        xx = x * (1 - 0.04 * f) + 0.02 * np.sin(ys * 3 + x) * f
        P[i] = np.c_[xx, ys, z]
    cloth = grid_surface(P)
    if cloth.face_normals()[:, 2].mean() < 0:
        cloth = cloth.flipped()
    cloth.box_uv(1.0)
    root.add("cloth_wool", cloth.shade(70))
    rod = turned([(0.0, -0.72), (0.03, -0.72), (0.035, -0.69), (0.02, -0.66), (0.018, 0.66), (0.035, 0.69),
                  (0.03, 0.72), (0.0, 0.72)], 10, 1.0, 50).r("z", 90).t(0, top + 0.03, 0)
    cord = []
    for sx in (-1, 1):
        path = np.array([[sx * 0.62, top + 0.03, 0], [sx * 0.3, top + 0.12, 0], [0, top + 0.2, 0]])
        cord.append(sweep(circle(0.006, 4), path, up=(0, 0, 1)).shade(50))
    root.add("wood_dark", rod)
    root.add("leather", *cord)
    root.add("iron_rusted", ring_torus(0.025, 0.006, 10, 4, axis="z").t(0, top + 0.22, 0))
    root.anchor("banner_mount_anchor", (0, top + 0.24, 0), extras={"kind": "hang"})
    root.extras = {"sway": "weight = (top_y - y) / (top_y - min_y); cloth rows are evenly subdivided", "top_y": top}
    return root


# ==========================================================================
def _arcade_relief(x0, x1, z_face, sign, y0, h, count, half=0.16, depth=0.03):
    """Blind arcade of small lancet frames on a face (plane z=z_face, facing sign*Z)."""
    out = []
    xs = np.linspace(x0, x1, count + 2)[1:-1]
    spring = y0 + h - arch_rise_local(half)
    prof = [(-0.012, -0.005), (0.035, -0.005), (0.035, depth * 0.6), (0.02, depth), (0.0, depth * 0.8)]
    for cx in xs:
        o = lancet_outline(half, spring, y0, 2 * half, n=8)
        o[:, 0] += cx
        p3 = np.c_[o, np.full(len(o), z_face)]
        if sign < 0:
            p3 = p3[::-1]
        out.append(sweep(prof, p3, up=(0, 0, sign)).shade(40))
    return out


def arch_rise_local(a):
    return math.sqrt((2 * a) ** 2 - a ** 2)


def altar():
    root = Node("altar")
    rng = np.random.default_rng(31)
    stone, plate = [], []
    plate.append(rect_slab(-1.75, 1.75, -1.15, 1.15, 0.16, bevel=0.025, n=4, wear=0.004, chip=0.01, seed=1))
    plate.append(rect_slab(-1.5, 1.5, -0.95, 0.95, 0.15, bevel=0.025, n=4, wear=0.004, chip=0.01, seed=2, y0=0.16))
    y0 = 0.31
    bw, bd, bh = 2.3, 0.9, 0.86
    stone.append(cbox(bw, bh, bd, 0.02, center=(0, y0, 0), bottom=True))
    plate.append(cbox(bw + 0.1, 0.14, bd + 0.1, 0.03, center=(0, y0, 0), bottom=True))
    for sign in (1, -1):
        plate += _arcade_relief(-bw / 2 + 0.1, bw / 2 - 0.1, sign * bd / 2, sign, y0 + 0.2, 0.55, 5)
    for sx in (-1, 1):  # corner colonnettes
        for sz in (-1, 1):
            plate.append(turned([(0.0, 0.0), (0.06, 0.0), (0.06, 0.04), (0.045, 0.07), (0.035, 0.1), (0.035, 0.7),
                                 (0.05, 0.73), (0.062, 0.8), (0.062, 0.86), (0.0, 0.86)], 10, 2.0, 50)
                         .t(sx * (bw / 2 + 0.01), y0, sz * (bd / 2 + 0.01)))
    mensa_y = y0 + bh
    plate.append(cbox(bw + 0.12, 0.06, bd + 0.12, 0.02, center=(0, mensa_y - 0.06, 0), bottom=True))
    plate.append(rect_slab(-(bw + 0.3) / 2, (bw + 0.3) / 2, -(bd + 0.3) / 2, (bd + 0.3) / 2, 0.13, bevel=0.035, n=6,
                           wear=0.003, chip=0.008, seed=3, y0=mensa_y))
    top_y = mensa_y + 0.13
    root.add("stone_wall", *[s.shade(30) for s in stone])
    root.add("stone_plate", *[p.shade(35) for p in plate])
    # cloth runner along X, draping over both ends; frontal on +Z face
    cloth = []
    half_len = (bw + 0.3) / 2
    nz = 9
    zs = np.linspace(-0.32, 0.32, nz)
    path = []
    for t in np.linspace(0, 1, 7):  # left drop (bottom -> top)
        path.append((-half_len - 0.012, top_y - 0.62 * (1 - t)))
    for x in np.linspace(-half_len + 0.01, half_len - 0.01, 12):
        path.append((x, top_y + 0.006))
    for t in np.linspace(0, 1, 7):
        path.append((half_len + 0.012, top_y - 0.62 * t))
    path = np.array(path)
    P = np.empty((len(path), nz, 3))
    tear_l = rng.uniform(0, 0.12, nz)
    tear_r = rng.uniform(0, 0.12, nz)
    for i, (x, y) in enumerate(path):
        for j, z in enumerate(zs):
            yy, xx = y, x
            if abs(x) > half_len:
                drop = top_y - y
                fold = 0.018 * math.sin(z * 26) * drop / 0.62
                xx = x + np.sign(x) * (0.01 + fold + 0.01)
                tear = tear_l[j] if x < 0 else tear_r[j]
                yy = max(y, top_y - 0.62 + tear)
            P[i, j] = (xx, yy, z * (1 + 0.04 * (abs(x) > half_len) * (top_y - y)))
    runner = grid_surface(P)
    if runner.face_normals()[:, 1].max() < 0.5 or (runner.face_normals()[:, 1].mean() < 0):
        runner = runner.flipped()
    cloth.append(runner.box_uv(1.0).shade(60))
    # frontal (antependium)
    nx = 14
    xs = np.linspace(-0.8, 0.8, nx)
    fz = (bd + 0.3) / 2 + 0.012
    Pf = np.empty((nx, 8, 3))
    bot = mensa_y - 0.62 + rng.uniform(0, 0.12, nx) + 0.06 * np.abs(np.sin(xs * 6))
    for i, x in enumerate(xs):
        ys = np.linspace(top_y + 0.004, bot[i], 8)
        zz = fz + 0.012 * np.sin(x * 22) * (top_y - ys) / 0.6
        Pf[i] = np.c_[np.full(8, x), ys, zz]
    Pf[:, 0, 2] = 0.2
    Pf[:, 1, 1] = top_y - 0.03
    frontal = grid_surface(Pf)
    if frontal.face_normals()[:, 2].mean() < 0:
        frontal = frontal.flipped()
    cloth.append(frontal.box_uv(1.0).shade(60))
    root.child(Node("altar_cloth")).add("cloth_wool", *cloth)
    # bronze cross on stepped base
    cr = [cbox(0.26, 0.05, 0.16, 0.01, center=(0, top_y, -0.15), bottom=True),
          cbox(0.18, 0.05, 0.11, 0.01, center=(0, top_y + 0.05, -0.15), bottom=True),
          cbox(0.04, 0.56, 0.035, 0.008, center=(0, top_y + 0.1, -0.15), bottom=True),
          cbox(0.3, 0.04, 0.035, 0.008, center=(0, top_y + 0.5, -0.15))]
    for p in ((0, top_y + 0.68, -0.15), (0.16, top_y + 0.5, -0.15), (-0.16, top_y + 0.5, -0.15)):
        cr.append(hull(np.array(p) + np.array([[0.03, 0.03, 0.02], [-0.03, 0.03, 0.02], [0.03, -0.03, 0.02],
                                               [-0.03, -0.03, 0.02], [0.03, 0.03, -0.02], [-0.03, 0.03, -0.02],
                                               [0.03, -0.03, -0.02], [-0.03, -0.03, -0.02], [0, 0, 0.035]])))
    root.add("bronze_aged", *[c.shade(30) for c in cr])
    for k, cx in enumerate((-0.92, 0.92)):
        _candle_group(root, f"altar_l{k}", (cx, top_y, -0.12), 6, seed=50 + k, spread=0.15, hmax=0.5)
    _candle_group(root, "altar_m", (0.42, top_y, 0.12), 3, seed=60, spread=0.07, hmax=0.2, pool=True)
    return root


def pew():
    root = Node("pew")
    wood = []
    L = 2.5
    end = [(0.3, 0.0), (0.3, 0.06), (0.24, 0.09), (0.24, 0.6), (0.27, 0.62), (0.28, 0.67), (0.2, 0.7),
           (0.06, 0.72), (-0.06, 0.8), (-0.12, 0.9), (-0.09, 0.96), (-0.1, 1.02), (-0.16, 1.07), (-0.2, 1.12),
           (-0.25, 1.07), (-0.29, 1.02), (-0.3, 0.96), (-0.27, 0.9), (-0.28, 0.06), (-0.34, 0.03), (-0.34, 0.0)]
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.04)
        wood.append(profile_bar(end, x - 0.04, x + 0.04).box_uv(1.0))
        # raised panel on the end
        pan = [(0.16, 0.18), (0.16, 0.55), (-0.18, 0.62), (-0.2, 0.18)]
        wood.append(profile_bar(pan, x + sx * 0.04 - 0.008, x + sx * 0.04 + 0.008).box_uv(1.0))
        # poppy-head carved knob
        wood.append(hull(np.array([[x - 0.05, 1.09, -0.2], [x + 0.05, 1.09, -0.2], [x, 1.17, -0.21],
                                   [x - 0.04, 1.12, -0.14], [x + 0.04, 1.12, -0.14], [x, 1.13, -0.27]])))
    inner = L - 0.16
    wood.append(cbox(inner, 0.05, 0.44, 0.012, center=(0, 0.43, 0.02), bottom=True).box_uv(1.0))
    wood.append(cbox(inner, 0.08, 0.03, 0.008, center=(0, 0.4, 0.23), bottom=True).box_uv(1.0))
    back_m = chain(T(0, 0.48, -0.2), R("x", -10))
    for k, (y, h) in enumerate(((0.05, 0.18), (0.25, 0.18), (0.45, 0.12))):
        wood.append(cbox(inner, h, 0.025, 0.006, center=(0, y, 0), bottom=True).box_uv(1.0).apply(back_m))
    wood.append(cbox(inner + 0.02, 0.06, 0.07, 0.015, center=(0, 0.59, -0.01), bottom=True).box_uv(1.0).apply(back_m))
    wood.append(cbox(inner, 0.025, 0.14, 0.006, center=(0, 0.74, -0.33), bottom=True).box_uv(1.0))  # book shelf
    wood.append(cbox(inner, 0.06, 0.02, 0.006, center=(0, 0.74, -0.4), bottom=True).box_uv(1.0))
    wood.append(cbox(inner, 0.08, 0.08, 0.01, center=(0, 0.08, -0.22), bottom=True).box_uv(1.0))  # stretcher
    root.add("wood_dark", *[w.shade(30) for w in wood])
    root.extras = {"faces": "+Z (sitter looks towards +Z)"}
    return root


# ==========================================================================
def sarcophagus():
    root = Node("sarcophagus")
    plate, wall = [], []
    plate.append(rect_slab(-1.3, 1.3, -0.62, 0.62, 0.16, bevel=0.03, n=3, wear=0.003, chip=0.012, seed=4))
    bw, bd, bh = 2.3, 0.98, 0.72
    wall.append(cbox(bw, bh, bd, 0.025, center=(0, 0.16, 0), bottom=True).displace(0.004, 3.0, 2))
    for sign in (1, -1):
        plate += _arcade_relief(-bw / 2, bw / 2, sign * bd / 2, sign, 0.26, 0.5, 6, half=0.12)
    for sx in (-1, 1):
        for sz in (-1, 1):
            plate.append(turned([(0.0, 0.0), (0.05, 0.0), (0.05, 0.04), (0.035, 0.07), (0.03, 0.6), (0.045, 0.64),
                                 (0.055, 0.72), (0.0, 0.72)], 8, 2.0, 50).t(sx * (bw / 2 + 0.005), 0.16,
                                                                            sz * (bd / 2 + 0.005)))
    plate.append(cbox(bw + 0.06, 0.05, bd + 0.06, 0.015, center=(0, 0.16 + bh - 0.05, 0), bottom=True))
    root.add("stone_wall", *[w.shade(30) for w in wall])
    root.add("stone_plate", *[p.shade(35) for p in plate])
    lid = Node("sarcophagus_lid", translation=(0, 0.16 + bh, 0), extras={"pivot": "slide/tilt; local y=0 at seat"})
    hw = (bd + 0.12) / 2
    sec = [(-hw, 0.0), (hw, 0.0), (hw, 0.07), (hw - 0.03, 0.1), (0.0, 0.24), (-hw + 0.03, 0.1), (-hw, 0.07)]
    lp = [profile_bar(sec, -(bw + 0.14) / 2, (bw + 0.14) / 2).shade(30)]
    # raised floriated cross on the ridge
    slope = math.degrees(math.atan2(0.14, hw - 0.03))
    lp.append(cbox(1.9, 0.04, 0.08, 0.012, center=(0, 0.24, 0)).shade(30))
    for sz in (-1, 1):
        arm = cbox(0.08, 0.035, 0.36, 0.01).apply(chain(T(0.62, 0.24 - 0.09, sz * 0.2), R("x", sz * slope)))
        lp.append(arm.shade(30))
        for xx in (0.62, -0.88):
            lp.append(hull(np.array([[xx - 0.06, 0.2, sz * 0.03], [xx + 0.06, 0.2, sz * 0.03], [xx, 0.26, sz * 0.06],
                                     [xx, 0.22, sz * 0.13]])).flat())
    for sxx in (-1, 1):  # end blocks of the cross
        lp.append(hull(np.array([[sxx * 0.95, 0.22, -0.06], [sxx * 0.95, 0.22, 0.06], [sxx * 1.02, 0.25, 0.0],
                                 [sxx * 0.95, 0.27, 0.0]])).flat())
    lid.add("stone_plate", *[l.displace(0.003, 4.0, 9).shade(35) for l in lp])
    root.child(lid)
    return root


def reliquary_chest():
    root = Node("reliquary_chest")
    W, D, H = 0.9, 0.56, 0.44
    t = 0.04
    y0 = 0.06
    wood = [cbox(W, t, D, 0.008, center=(0, y0, 0), bottom=True)]
    wood.append(cbox(W, H, t, 0.008, center=(0, y0, D / 2 - t / 2), bottom=True))
    wood.append(cbox(W, H, t, 0.008, center=(0, y0, -D / 2 + t / 2), bottom=True))
    for sx in (-1, 1):
        wood.append(cbox(t, H, D - 2 * t, 0.008, center=(sx * (W / 2 - t / 2), y0, 0), bottom=True))
    wood = [w.box_uv(1.0) for w in wood]
    br = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            br.append(turned([(0.0, 0.0), (0.035, 0.0), (0.045, 0.025), (0.038, 0.05), (0.03, 0.062), (0.0, 0.062)], 10,
                             0.25, 50).t(sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06)))
            br.append(cbox(0.012, H + 0.01, 0.07, 0.004, center=(sx * (W / 2 + 0.004), y0, sz * (D / 2 - 0.03)),
                           bottom=True))
            br.append(cbox(0.07, H + 0.01, 0.012, 0.004, center=(sx * (W / 2 - 0.03), y0, sz * (D / 2 + 0.004)),
                           bottom=True))
    for x in (-0.22, 0.22):
        for sz in (-1, 1):
            br.append(cbox(0.05, H, 0.01, 0.003, center=(x, y0, sz * (D / 2 + 0.004)), bottom=True))
    for sign in (1, -1):
        br += _arcade_relief(-0.22, 0.22, sign * (D / 2 + 0.004), sign, y0 + 0.08, 0.3, 1, half=0.07, depth=0.012)
        for xa in (-0.34, 0.34):
            br += _arcade_relief(xa - 0.1, xa + 0.1, sign * (D / 2 + 0.004), sign, y0 + 0.08, 0.3, 1, half=0.06,
                                 depth=0.012)
    br.append(cbox(W + 0.012, 0.03, D + 0.012, 0.006, center=(0, y0 + H - 0.03, 0), bottom=True))
    br.append(cbox(W + 0.012, 0.03, D + 0.012, 0.006, center=(0, y0, 0), bottom=True))
    shield = [(-0.07, 0.0), (0.07, 0.0), (0.07, 0.1), (0.0, 0.16), (-0.07, 0.1)]
    br.append(extrude([(x, y + y0 + 0.17) for x, y in shield], D / 2, D / 2 + 0.015).shade(30))
    br.append(cbox(0.015, 0.04, 0.008, 0.002, center=(0, y0 + 0.25, D / 2 + 0.017)).color((0.2, 0.2, 0.2)))
    lining = [cbox(W - 2 * t - 0.01, 0.02, D - 2 * t - 0.01, 0.004, center=(0, y0 + t, 0), bottom=True)]
    # lower teeth on the inner rim of the body (hidden while closed)
    teeth_lo = []
    rng = np.random.default_rng(77)
    for k, x in enumerate(np.linspace(-W / 2 + 0.08, W / 2 - 0.08, 11)):
        h = rng.uniform(0.04, 0.075)
        zz = D / 2 - t - 0.012
        teeth_lo.append(hull(np.array([[x - 0.022, y0 + H - 0.02, zz + 0.01], [x + 0.022, y0 + H - 0.02, zz + 0.01],
                                       [x, y0 + H - 0.02, zz - 0.02], [x + rng.uniform(-0.005, 0.005), y0 + H + h - 0.02, zz]])))
    root.add("wood_dark", *[w.shade(30) for w in wood])
    root.add("bronze_aged", *[b.shade(30) for b in br])
    root.add("cloth_wool", *[l.shade(30) for l in lining])
    root.child(Node("chest_teeth_lower")).add("parchment", *[s.flat() for s in teeth_lo])
    # lid: chasse roof, pivot at the back top edge
    lid = Node("chest_lid", translation=(0, y0 + H, -D / 2), extras={"pivot": "hinge along local X; open = rotate -X"})
    sec = [(-0.01, 0.0), (D + 0.01, 0.0), (D + 0.025, 0.04), (D / 2, 0.2), (-0.025, 0.04)]
    lw = [profile_bar(sec, -W / 2 - 0.02, W / 2 + 0.02).box_uv(1.0).shade(30)]
    lb = [cbox(W + 0.06, 0.02, 0.025, 0.005, center=(0, 0.21, D / 2)).shade(30)]
    for sxx in (-1, 1):
        lb.append(turned([(0.0, 0.0), (0.025, 0.0), (0.03, 0.03), (0.018, 0.05), (0.025, 0.07), (0.0, 0.1)], 10, 0.25,
                         50).t(sxx * (W / 2 + 0.01), 0.2, D / 2))
    for x in (-0.22, 0.22, -W / 2 + 0.01, W / 2 - 0.01):
        for sz in (-1, 1):
            ang = math.degrees(math.atan2(0.16, D / 2))
            lb.append(cbox(0.05, 0.008, D / 2 + 0.03, 0.002).apply(
                chain(T(x, 0.128, D / 2 + sz * D / 4), R("x", sz * ang))).shade(30))
    lid.add("wood_dark", *lw)
    lid.add("bronze_aged", *lb)
    teeth = []
    for k, x in enumerate(np.linspace(-W / 2 + 0.07, W / 2 - 0.07, 12)):
        h = rng.uniform(0.05, 0.095)
        zz = D - t - 0.015
        teeth.append(hull(np.array([[x - 0.024, 0.0, zz + 0.012], [x + 0.024, 0.0, zz + 0.012], [x, 0.0, zz - 0.02],
                                    [x + rng.uniform(-0.006, 0.006), -h, zz - 0.004]])))
    for sxx in (-1, 1):
        for k, zf in enumerate(np.linspace(0.12, D - 0.12, 4)):
            h = rng.uniform(0.04, 0.07)
            xx = sxx * (W / 2 - t - 0.015)
            teeth.append(hull(np.array([[xx, 0.0, zf - 0.022], [xx, 0.0, zf + 0.022], [xx - sxx * 0.03, 0.0, zf],
                                        [xx - sxx * 0.005, -h, zf]])))
    lid.child(Node("chest_teeth")).add("parchment", *[s.flat() for s in teeth])
    root.child(lid)
    return root


# ==========================================================================
def statue_blind_porter():
    root = Node("statue_blind_porter")
    th = _th(48)
    # pedestal
    ped = polar_stack([(0.0, octagon(th, 0.62)), (0.12, octagon(th, 0.62)), (0.12, octagon(th, 0.58)),
                       (0.16, octagon(th, 0.55)), (0.34, octagon(th, 0.55)), (0.36, octagon(th, 0.58)),
                       (0.4, octagon(th, 0.58)), (0.4, octagon(th, 0.52))], th, 2.0, 0.5, cap_top=True)
    parts = [ped.shade(35)]
    y0 = 0.4
    rings = []
    spec = [(0.0, 0.43, 0.37, 0.035, 0.03), (0.03, 0.43, 0.37, 0.035, 0.03), (0.35, 0.37, 0.31, 0.03, 0.02),
            (0.75, 0.31, 0.26, 0.022, 0.01), (1.02, 0.285, 0.225, 0.012, 0.0), (1.08, 0.3, 0.232, 0.01, 0.0),
            (1.3, 0.33, 0.225, 0.01, -0.01), (1.48, 0.34, 0.2, 0.008, -0.025), (1.56, 0.3, 0.18, 0.0, -0.03),
            (1.62, 0.2, 0.15, 0.0, -0.03), (1.66, 0.1, 0.1, 0.0, -0.02)]
    for (yy, ax, az, fold, zoff) in spec:
        r = ellipse_r(th, ax, az)
        r = r + fold * (0.5 + 0.5 * np.cos(7 * th + yy * 1.5)) + fold * 0.4 * noise1(th * 3 + yy, 3)
        r = r * (1 + 0.04 * np.cos(th) * (yy < 0.2))
        rings.append(polar_ring(th, r, y0 + yy, cz=zoff))
    robe = ring_stack(rings, cap_top=True, top_center=[0, y0 + 1.67, -0.02])
    parts.append(robe.shade(45))
    # head (blank face) and hood
    hc = np.array([0, y0 + 1.82, 0.03])
    head = lathe([(0.0, -0.13), (0.06, -0.12), (0.095, -0.07), (0.105, 0.0), (0.098, 0.06), (0.07, 0.11), (0.0, 0.13)],
                 18, uv_scale=2.0).apply(chain(T(*hc), R("x", 12), S(1.0, 1.0, 1.1)))
    parts.append(head.shade(50))
    hood_rings = []
    for (yy, ax, az, zo, front) in [(1.55, 0.3, 0.26, -0.02, 0.21), (1.62, 0.25, 0.23, -0.025, 0.19),
                                    (1.7, 0.17, 0.19, -0.03, 0.115), (1.8, 0.155, 0.18, -0.03, 0.11),
                                    (1.9, 0.145, 0.17, -0.035, 0.105), (1.98, 0.12, 0.15, -0.05, 0.09),
                                    (2.04, 0.07, 0.1, -0.08, 0.05), (2.07, 0.02, 0.04, -0.11, 0.01)]:
        r = ellipse_r(th, ax, az)
        fr = np.clip(np.cos(th), 0, 1) ** 3
        r = r * (1 - fr) + np.minimum(r, front) * fr
        hood_rings.append(polar_ring(th, r, y0 + yy, cz=zo))
    hood = ring_stack(hood_rings, cap_top=True, top_center=[0, y0 + 2.08, -0.12])
    parts.append(hood.shade(50))
    # sleeves meeting at the front, hands, cord belt
    for sx in (-1, 1):
        path = bezier([[sx * 0.3, y0 + 1.5, -0.02], [sx * 0.36, y0 + 1.2, 0.0], [sx * 0.3, y0 + 1.06, 0.2],
                       [sx * 0.07, y0 + 1.1, 0.3]], 10)
        sl = sweep(circle(0.075, 10), path, up=(1, 0, 0), scales=np.linspace(1.0, 1.55, 10))
        parts.append(sl.shade(50))
    hands = hull(np.array([[-0.07, y0 + 1.06, 0.3], [0.07, y0 + 1.06, 0.3], [0.0, y0 + 1.15, 0.34],
                           [-0.05, y0 + 1.12, 0.37], [0.05, y0 + 1.12, 0.37], [0, y0 + 1.04, 0.36],
                           [0, y0 + 1.1, 0.27]]))
    parts.append(hands.shade(40))
    cord = np.c_[np.sin(th) * ellipse_r(th, 0.3, 0.236), np.full(48, y0 + 1.05), np.cos(th) * ellipse_r(th, 0.3, 0.236)]
    parts.append(sweep(circle(0.014, 5), cord[::2], up=(0, 1, 0), closed_path=True).shade(50))
    hang = bezier([[0.2, y0 + 1.05, 0.16], [0.22, y0 + 0.85, 0.22], [0.2, y0 + 0.6, 0.26]], 6)
    parts.append(sweep(circle(0.013, 5), hang, up=(1, 0, 0)).shade(50))
    parts.append(hull(np.array(hang[-1]) + rock((0.05, 0.05, 0.05), 3).tris.reshape(-1, 3)[:20] - [0, 0.0, 0]).shade(30))
    root.add("stone_plate", *[p.displace(0.004, 5.0, 12) for p in parts])
    # iron key hanging from the hands
    key = [ring_torus(0.05, 0.012, 14, 6, axis="z").t(0, y0 + 1.03, 0.37),
           turned([(0.0, 0.0), (0.012, 0.0), (0.012, 0.42), (0.0, 0.42)], 8, 0.5, 50).t(0, y0 + 0.56, 0.37),
           cbox(0.07, 0.06, 0.015, 0.003, center=(0.035, y0 + 0.6, 0.37)),
           cbox(0.02, 0.025, 0.016, 0.003, center=(0.065, y0 + 0.59, 0.37)),
           turned([(0.016, 0.0), (0.02, 0.01), (0.016, 0.02)], 8, 0.5, 50).t(0, y0 + 0.96, 0.37)]
    root.child(Node("statue_blind_porter_key")).add("iron_rusted", *[k.shade(40) for k in key])
    return root


# ==========================================================================
def well_dry():
    root = Node("well_dry")
    rng = np.random.default_rng(5)
    stone = []
    r_in, r_out = 0.62, 0.9
    nb = 10
    for c in range(3):
        y0, y1 = c * 0.28, c * 0.28 + 0.27
        off = (c % 2) * 0.5
        for k in range(nb):
            a0 = (k + off) / nb * TAU + 0.012
            a1 = (k + 1 + off) / nb * TAU - 0.012
            aa = np.linspace(a0, a1, 5)
            ro = r_out + rng.uniform(-0.015, 0.02)
            poly = [(math.sin(a) * ro, math.cos(a) * ro) for a in aa] + \
                   [(math.sin(a) * r_in, math.cos(a) * r_in) for a in aa[::-1]]
            s = prism_xz(np.array(poly)[::-1], y0, y1 - 0.01)
            stone.append(s.displace(0.012, 5.0, 100 + c * 20 + k).shade(35))
    th = _th(40)
    cop = polar_stack([(0.84, r_out + 0.06), (0.9, r_out + 0.07), (0.96, r_out + 0.04), (0.98, r_out - 0.04),
                       (0.98, r_in + 0.03), (0.95, r_in - 0.02), (0.84, r_in - 0.02)], th, 2.0, 0.8, cap_top=False)
    stone.append(cop.displace(0.01, 4.0, 7).shade(35))
    shaft = lathe([(r_in - 0.01, 0.84), (r_in - 0.01, -0.8)], 24, uv_scale=2.0).flipped()  # faces inward
    stone.append(shaft.shade(40))
    floor = fan(polar_ring(_th(24), r_in, -0.8)).shade(0)
    stone.append(floor)
    for k in range(5):
        stone.append(rock(rng.uniform(0.1, 0.25, 3), seed=600 + k).t(rng.uniform(-0.35, 0.35), -0.8,
                                                                     rng.uniform(-0.35, 0.35)).flat())
    root.add("stone_wall", *stone)
    wood, iron, rope = [], [], []
    px = 1.06
    for sx in (-1, 1):
        wood.append(beam((sx * px, 0, 0), (sx * px, 2.05, 0), 0.14, 0.14, 0.02))
        wood.append(beam((sx * px, 0.02, -0.25), (sx * px, 0.02, 0.25), 0.16, 0.12, 0.02))
        for sz in (-1, 1):
            wood.append(beam((sx * px, 1.6, sz * 0.02), (sx * px, 2.08, sz * 0.4), 0.08, 0.08, 0.012))
    wood.append(beam((-px - 0.1, 2.08, 0), (px + 0.1, 2.08, 0), 0.12, 0.12, 0.02))
    for sz in (-1, 1):
        for k in range(5):
            x = -1.04 + k * 0.52
            p0 = np.array([x, 2.47, 0.0])
            p1 = np.array([x, 2.08, sz * 0.66])
            wood.append(beam(p0 + [0, 0.02, 0], p1 + [0, 0.02, 0], 0.5, 0.03, 0.006, roll=rng.uniform(-1.5, 1.5)))
    wood.append(beam((-1.3, 2.47, 0), (1.3, 2.47, 0), 0.1, 0.1, 0.02))
    roller = turned([(0.0, -0.98), (0.09, -0.98), (0.09, 0.98), (0.0, 0.98)], 12, 1.0, 50).r("z", 90).t(0, 1.5, 0)
    wood.append(roller)
    rope.append(turned([(0.096, -0.35), (0.11, -0.33), (0.11, 0.25), (0.096, 0.27)], 12, 0.5, 50).r("z", 90).t(0, 1.5, 0))
    iron.append(turned([(0.0, 0.0), (0.02, 0.0), (0.02, 0.2), (0.0, 0.2)], 8, 0.5, 50).r("z", -90).t(px - 0.05, 1.5, 0))
    crank = np.array([[px + 0.12, 1.5, 0], [px + 0.14, 1.5, 0], [px + 0.14, 1.2, 0.02], [px + 0.14, 1.18, 0.02]])
    iron.append(sweep(circle(0.018, 6), crank, up=(0, 0, 1)).shade(40))
    wood.append(turned([(0.0, 0.0), (0.025, 0.0), (0.028, 0.2), (0.0, 0.2)], 8, 1.0, 50).r("z", -90).t(px + 0.14, 1.18,
                                                                                                    0.02))
    rope.append(sweep(circle(0.012, 5), np.array([[0.05, 1.39, 0.08], [0.05, 0.8, 0.12], [0.05, 0.25, 0.14]]),
                      up=(1, 0, 0)).shade(50))
    bucket = turned([(0.0, 0.0), (0.12, 0.0), (0.14, 0.24), (0.13, 0.24), (0.11, 0.02), (0.0, 0.02)], 14, 1.0, 40)
    wood.append(bucket.apply(chain(T(0.05, 0.02, 0.14), R("z", 10))).box_uv(1.0))
    for y in (0.04, 0.2):
        iron.append(turned([(0.123 + y * 0.083, y), (0.13 + y * 0.083, y + 0.01), (0.123 + y * 0.083, y + 0.02)], 14,
                           0.5, 40).apply(chain(T(0.05, 0.02, 0.14), R("z", 10))))
    iron.append(sweep(circle(0.006, 4), bezier([[-0.09, 0.26, 0.14], [0.05, 0.42, 0.14], [0.2, 0.26, 0.14]], 8),
                      up=(0, 0, 1)).shade(50))
    root.add("wood_dark", *[w.shade(30) for w in wood])
    root.add("iron_rusted", *iron)
    root.add("leather", *rope)
    root.extras = {"origin": "ground level y=0; the dry shaft extends to y=-0.8"}
    return root


def pillar_candle_stand():
    root = Node("pillar_candle_stand")
    th = _th(32)
    sec = cluster_section(th, core=0.1, major=(0.1, 0.045), minor=None)
    L = [(0.0, octagon(th, 0.26)), (0.1, octagon(th, 0.26)), (0.1, octagon(th, 0.23)), (0.14, sec + 0.05),
         (0.18, sec + 0.03), (0.2, sec), (0.85, sec), (0.88, sec + 0.025), (0.92, sec + 0.025), (0.94, sec),
         (1.0, sec + 0.06 + 0.02 * np.cos(8 * th)), (1.06, octagon(th, 0.22)), (1.1, octagon(th, 0.22))]
    root.add("stone_plate", polar_stack(L, th, 2.0, 0.2).shade(40))
    root.add("iron_rusted", turned([(0.0, 1.1), (0.18, 1.1), (0.19, 1.13), (0.17, 1.14), (0.06, 1.125), (0.02, 1.15),
                                    (0.0, 1.15)], 16, 0.5, 40))
    wax, wick, tip = candle(0.32, 0.075, seed=88, segs=14, drips=5)
    root.add("wax", wax.t(0, 1.12, 0))
    root.add("iron_rusted", wick.t(0, 1.12, 0))
    # wax spill on the dish
    th2 = _th(20)
    rr = 0.13 + 0.03 * noise1(th2 * 2, 4)
    root.add("wax", ring_stack([polar_ring(th2, rr, 1.13), polar_ring(th2, rr * 0.9, 1.14)], cap_top=True,
                               top_center=[0, 1.145, 0]).shade(50))
    root.anchor("pillar_candle_stand_flame_anchor", tip + [0, 1.135, 0], extras={"kind": "flame"})
    return root


def _bone(length, r=0.018, knob=0.032, seg=8):
    prof = [(0.0, 0.0), (knob * 0.8, 0.004), (knob, 0.02), (knob * 0.7, 0.045), (r, 0.08), (r * 0.9, length * 0.5),
            (r, length - 0.08), (knob * 0.75, length - 0.045), (knob * 1.05, length - 0.02), (knob * 0.7, length - 0.003),
            (0.0, length)]
    return turned(prof, seg, 0.25, 55).s(1.0, 1.0, 0.85)


def bone_pile():
    root = Node("bone_pile")
    rng = np.random.default_rng(66)
    parts = []
    for k in range(7):
        ln = rng.uniform(0.25, 0.46)
        b = _bone(ln, seg=7).apply(chain(T(rng.uniform(-0.4, 0.4), 0.03, rng.uniform(-0.35, 0.35)),
                                         R("y", rng.uniform(0, 360)), R("z", 90 + rng.uniform(-8, 8)),
                                         T(0, -ln / 2, 0)))
        parts.append(b.color((rng.uniform(0.75, 1.0),) * 3))
    for k in range(5):  # ribs
        a = rng.uniform(0, 360)
        pts = np.array([[math.cos(t) * 0.16, 0.012 + 0.03 * math.sin(t * 2) * 0, math.sin(t) * 0.16] for t in
                        np.linspace(0, 2.2, 8)])
        rb = sweep([(-0.01, -0.004), (0.01, -0.004), (0.01, 0.004), (-0.01, 0.004)], pts, up=(0, 1, 0)).shade(50)
        parts.append(rb.apply(chain(T(rng.uniform(-0.3, 0.3), 0.004, rng.uniform(-0.3, 0.3)), R("y", a),
                                    R("x", rng.uniform(-10, 10)))).color((0.85, 0.83, 0.78)))
    # skull
    th = _th(20)
    sk = []
    for (y, ax, az, cz) in [(0.0, 0.05, 0.06, 0.02), (0.03, 0.065, 0.085, 0.0), (0.07, 0.07, 0.1, -0.01),
                            (0.11, 0.065, 0.095, -0.015), (0.14, 0.045, 0.07, -0.02), (0.155, 0.015, 0.03, -0.02)]:
        r = ellipse_r(th, ax, az)
        sk.append(polar_ring(th, r, y, cz=cz))
    skull = ring_stack(sk, cap_top=True, cap_bottom=True, top_center=[0, 0.158, -0.02], bottom_center=[0, 0.0, 0.0])

    def sockets(p):
        q = p.copy()
        for sx in (-1, 1):
            c = np.array([sx * 0.03, 0.065, 0.085])
            d = np.linalg.norm(p - c, axis=1)
            q[:, 2] -= 0.025 * np.clip(1 - d / 0.03, 0, 1)
        return q

    skull = skull.map_pos(sockets).shade(55)
    c = skull.tris.reshape(-1, 3)
    dark = np.ones(len(c))
    for sx in (-1, 1):
        d = np.linalg.norm(c - [sx * 0.03, 0.065, 0.065], axis=1)
        dark = np.minimum(dark, np.clip(d / 0.03, 0.25, 1))
    skull.colors = np.stack([dark, dark, dark * 0.95, np.ones_like(dark)], -1).reshape(-1, 3, 4)
    jaw = hull(np.array([[-0.05, 0.0, 0.03], [0.05, 0.0, 0.03], [0.0, 0.0, 0.1], [0.0, 0.03, 0.1], [-0.055, 0.04, 0.0],
                         [0.055, 0.04, 0.0], [-0.03, 0.01, 0.08], [0.03, 0.01, 0.08]])).flat()
    for s in (skull, jaw.color((0.9, 0.88, 0.82))):
        parts.append(s.apply(chain(T(0.12, 0.0, 0.08), R("y", -30), R("x", -12))))
    root.add("parchment", *parts)
    return root


# ==========================================================================
def _wheel(r=0.45, spokes=8, rim_w=0.07, rim_t=0.06, hub_len=0.22):
    """Wooden wheel in the XY plane (axle along Z)."""
    ang = np.linspace(0, TAU, 32, endpoint=False)
    rim = sweep([(-rim_t, -rim_w / 2), (0.0, -rim_w / 2), (0.0, rim_w / 2), (-rim_t, rim_w / 2)],
                np.c_[np.cos(ang) * r, np.sin(ang) * r, np.zeros(32)], up=(0, 0, 1), closed_path=True)
    wood = [rim.box_uv(1.0).shade(35)]
    for k in range(spokes):
        a = k * TAU / spokes
        d = np.array([math.cos(a), math.sin(a), 0])
        wood.append(beam(d * 0.07, d * (r - rim_t * 0.6), 0.04, 0.05, 0.008, up=(0, 0, 1)))
    hub = turned([(0.0, -hub_len / 2), (0.06, -hub_len / 2), (0.085, -0.04), (0.09, 0.0), (0.085, 0.04),
                  (0.06, hub_len / 2), (0.0, hub_len / 2)], 12, 1.0, 40).r("x", 90)
    wood.append(hub)
    tire = sweep([(0.0, -rim_w / 2 - 0.003), (0.012, -rim_w / 2 - 0.003), (0.012, rim_w / 2 + 0.003),
                  (0.0, rim_w / 2 + 0.003)], np.c_[np.cos(ang) * r, np.sin(ang) * r, np.zeros(32)], up=(0, 0, 1),
                 closed_path=True).shade(35)
    return wood, [tire]


def cart_wood():
    root = Node("cart_wood")
    tilt = -9.0
    body = Node("cart_wood_body")
    wood, iron = [], []
    bed_y = 0.62
    for k in range(6):
        wood.append(cbox(1.5, 0.035, 0.86 / 6 - 0.008, 0.005, center=(0.1, bed_y, -0.43 + 0.86 / 12 + k * 0.86 / 6))
                    .box_uv(1.0))
    for sz in (-1, 1):
        wood.append(cbox(1.5, 0.28, 0.035, 0.006, center=(0.1, bed_y + 0.02, sz * 0.45), bottom=True).box_uv(1.0))
        wood.append(beam((-1.3, bed_y - 0.05, sz * 0.38), (0.85, bed_y - 0.05, sz * 0.38), 0.07, 0.07, 0.012))
        for x in (-0.55, 0.15, 0.8):
            wood.append(beam((x, bed_y, sz * 0.45), (x, bed_y + 0.36, sz * 0.46), 0.05, 0.05, 0.008))
    for sx in (-1, 1):
        wood.append(cbox(0.035, 0.26, 0.86, 0.006, center=(0.1 + sx * 0.75, bed_y + 0.02, 0), bottom=True).box_uv(1.0))
    wood.append(cbox(0.12, 0.08, 1.12, 0.012, center=(0.2, bed_y - 0.11, 0)).box_uv(1.0))  # axle beam
    iron.append(turned([(0.0, -0.66), (0.03, -0.66), (0.03, 0.66), (0.0, 0.66)], 8, 0.5, 40).r("x", 90)
                .t(0.2, bed_y - 0.17, 0))
    ww, wi = _wheel()
    for sz in (-1, 1):
        m = T(0.2, bed_y - 0.17, sz * 0.6)
        wood += [w.apply(m) for w in ww]
        iron += [i.apply(m) for i in wi]
    body.add("wood_dark", *[w.shade(30) for w in wood])
    body.add("iron_rusted", *iron)
    # rest the cart on its shafts: rotate about the wheel contact
    pivot = np.array([0.2, 0.0, 0.0])
    m = chain(T(*pivot), R("z", tilt), T(*-pivot))
    for mat in list(body.parts):
        body.parts[mat] = [s.apply(m) for s in body.parts[mat]]
    lo = min(s.bounds()[0][1] for v in body.parts.values() for s in v)
    for mat in list(body.parts):
        body.parts[mat] = [s.t(0, -lo, 0) for s in body.parts[mat]]
    root.child(body)
    return root


def crank_wheel():
    root = Node("crank_wheel")
    stone = [cbox(0.9, 0.18, 0.8, 0.03, bottom=True), cbox(0.6, 1.05, 0.5, 0.03, center=(0, 0.18, -0.05), bottom=True),
             cbox(0.72, 0.12, 0.62, 0.03, center=(0, 1.2, -0.05), bottom=True)]
    root.add("stone_plate", *[s.displace(0.006, 4.0, 3).shade(35) for s in stone])
    axis_y, axis_z = 0.95, 0.28
    iron = [cbox(0.24, 0.24, 0.06, 0.01, center=(0, axis_y, 0.22)),
            turned([(0.0, 0.0), (0.04, 0.0), (0.04, 0.28), (0.0, 0.28)], 10, 0.5, 40).r("x", 90).t(0, axis_y, 0.18)]
    pawl = beam((0.3, 1.25, 0.25), (0.1, 1.42, 0.25), 0.03, 0.05, 0.006)
    iron.append(pawl)
    root.add("iron_rusted", *[i.shade(35) for i in iron])
    rot = Node("crank_wheel_rotor", translation=(0, axis_y, axis_z + 0.18), extras={"pivot": "rotate about local Z"})
    ang = np.linspace(0, TAU, 48, endpoint=False)
    R0 = 0.62
    rim = sweep([(-0.07, -0.04), (0.0, -0.04), (0.0, 0.04), (-0.07, 0.04)], np.c_[np.cos(ang) * R0, np.sin(ang) * R0,
                                                                                 np.zeros(48)], up=(0, 0, 1),
                closed_path=True).shade(35)
    ri = [rim]
    for k in range(28):
        a = k * TAU / 28
        tooth = hull(np.array([[R0 - 0.005, -0.025, -0.04], [R0 - 0.005, 0.025, -0.04], [R0 - 0.005, -0.025, 0.04],
                               [R0 - 0.005, 0.025, 0.04], [R0 + 0.06, -0.012, -0.035], [R0 + 0.06, 0.012, -0.035],
                               [R0 + 0.06, -0.012, 0.035], [R0 + 0.06, 0.012, 0.035]]))
        ri.append(tooth.r("z", math.degrees(a)).flat())
    rw = []
    for k in range(6):
        a = k * TAU / 6
        d = np.array([math.cos(a), math.sin(a), 0])
        rw.append(beam(d * 0.08, d * (R0 - 0.06), 0.06, 0.07, 0.01, up=(0, 0, 1)))
    hub = turned([(0.0, -0.08), (0.08, -0.08), (0.12, -0.04), (0.12, 0.04), (0.09, 0.07), (0.05, 0.09), (0.0, 0.1)],
                 16, 0.5, 40).r("x", 90)
    # crank handle
    arm = beam((0, 0, 0.08), (0.0, -0.42, 0.1), 0.05, 0.03, 0.008, up=(0, 0, 1))
    grip_w = turned([(0.0, 0.0), (0.026, 0.0), (0.03, 0.06), (0.026, 0.16), (0.0, 0.16)], 10, 1.0, 50).r("x", 90) \
        .t(0, -0.42, 0.28)
    pin = turned([(0.0, 0.0), (0.012, 0.0), (0.012, 0.2), (0.0, 0.2)], 8, 0.5, 40).r("x", 90).t(0, -0.42, 0.29)
    rot.add("iron_rusted", *ri, arm.shade(30), pin)
    rot.add("bronze_aged", hub)
    rot.add("wood_dark", *[w.shade(30) for w in rw], grip_w)
    root.child(rot)
    return root


# ==========================================================================
def formation_plate():
    root = Node("formation_plate")
    hx, hz, h = 0.8, 0.6, 0.08
    bev = 0.035
    r_in, r_out, depth = 0.44, 0.5, 0.018
    base = np.linspace(0, TAU, 48, endpoint=False)
    corners = [math.atan2(hx, hz), math.atan2(hx, -hz), math.atan2(-hx, -hz) + TAU, math.atan2(-hx, hz) + TAU]
    corners_i = [math.atan2(hx - bev, hz - bev), math.atan2(hx - bev, -hz + bev),
                 math.atan2(-hx + bev, -hz + bev) + TAU, math.atan2(-hx + bev, hz - bev) + TAU]
    th = np.unique(np.round(np.mod(np.concatenate([base, corners, corners_i]), TAU), 9))
    rings = [polar_ring(th, r_in, h), polar_ring(th, r_in, h - depth), polar_ring(th, r_out, h - depth),
             polar_ring(th, r_out, h), polar_ring(th, rect_r(th, hx - bev, hz - bev), h),
             polar_ring(th, rect_r(th, hx, hz), h - bev), polar_ring(th, rect_r(th, hx, hz), 0.0)]
    surf = ring_stack(rings[::-1])
    # ring_stack expects bottom->top for outward normals; our rings go outer-bottom -> centre-top
    if surf.face_normals()[:, 1].sum() < 0:
        surf = surf.flipped()
    disk = fan(polar_ring(th, r_in, h))
    root.add("stone_plate", merge(surf.shade(35), disk.shade(0)))
    root.extras = {"top_y": h, "groove": {"r_inner": r_in, "r_outer": r_out, "depth": depth}}
    return root


def formation_divider():
    root = Node("formation_divider")
    prof = [(-0.1, 0.0), (0.1, 0.0), (0.1, 0.05), (0.075, 0.08), (0.07, 0.2), (0.09, 0.22), (0.09, 0.25),
            (0.06, 0.29), (0.03, 0.31), (0.0, 0.315), (-0.03, 0.31), (-0.06, 0.29), (-0.09, 0.25), (-0.09, 0.22),
            (-0.07, 0.2), (-0.075, 0.08), (-0.1, 0.05)]
    parts = [profile_bar(prof, -0.39, 0.39).shade(35)]
    for sx in (-1, 1):
        x = sx * 0.44
        parts.append(cbox(0.12, 0.34, 0.24, 0.015, center=(x, 0, 0), bottom=True).shade(30))
        parts.append(cbox(0.14, 0.04, 0.26, 0.01, center=(x, 0.34, 0), bottom=True).shade(30))
        parts.append(hull(np.array([[x - 0.06, 0.38, -0.11], [x + 0.06, 0.38, -0.11], [x - 0.06, 0.38, 0.11],
                                    [x + 0.06, 0.38, 0.11], [x, 0.45, 0.0]])).flat())
    root.add("stone_plate", *[p.displace(0.003, 6.0, 2) for p in parts])
    return root


# ==========================================================================
def rubble_pile():
    """Four rubble variants. Stones are stacked with a coarse height field so piles
    read as heaps (bigger blocks at the base, chips on top and around)."""
    root = Node("rubble_pile")
    specs = [("rubble_a", 0.85, 22, 1, 1.0), ("rubble_b", 0.5, 12, 2, 0.75), ("rubble_c", 0.7, 12, 3, 0.8),
             ("rubble_d", 0.75, 26, 4, 0.4)]
    for k, (nm, rad, count, seed, scl) in enumerate(specs):
        rng = np.random.default_rng(seed * 13)
        node = Node(nm, translation=(-3.0 + k * 2.0, 0, 0))
        stones = []
        hf = []  # (x, z, radius, top)

        def ground(x, z):
            h = 0.0
            for (hx, hz, hr, ht) in hf:
                d = math.hypot(x - hx, z - hz)
                if d < hr:
                    h = max(h, ht * (1 - (d / hr) ** 2) * 0.85)
            return h

        for i in range(count):
            if nm == "rubble_c" and i == 0:  # broken ashlar block, tilted
                blk = quad_slab([(-0.36, 0.24), (0.4, 0.24), (0.33, -0.22), (-0.36, -0.24)], 0.4, bevel=0.035, n=3,
                                wear=0.01, chip=0.05, seed=5, bottom=True)
                blk = blk.apply(chain(R("y", 20), R("z", 7)))
                stones.append(blk.t(0, -blk.bounds()[0][1] - 0.01, 0).shade(30))
                hf.append((0.0, 0.0, 0.45, 0.42))
                continue
            f = i / count
            size = (0.55 - 0.4 * f) * scl * rng.uniform(0.7, 1.15)
            sz = np.array([size, size * rng.uniform(0.45, 0.75), size * rng.uniform(0.6, 1.0)])
            ang = rng.uniform(0, TAU)
            dist = rad * (0.15 + 0.85 * math.sqrt(rng.random())) * (0.5 + 0.7 * f)
            x, z = math.cos(ang) * dist, math.sin(ang) * dist
            base_y = ground(x, z)
            if nm == "rubble_c" and i > 0:
                base_y = 0.0 if dist > 0.45 else base_y
            s = rock(sz, seed=seed * 1000 + i, flat=0.75 if i % 3 else 0.45)
            if nm in ("rubble_a", "rubble_b") and i % 5 == 1:  # squared ashlar fragment
                s = quad_slab([(-sz[0] / 2, sz[2] / 2), (sz[0] / 2, sz[2] / 2), (sz[0] / 2, -sz[2] / 2),
                               (-sz[0] / 2, -sz[2] / 2)], sz[1], bevel=0.02, n=2, wear=0.008, chip=0.03,
                              seed=seed * 50 + i, bottom=True)
            s = s.apply(chain(T(x, base_y - sz[1] * 0.15, z), R("y", rng.uniform(0, 360)),
                              R("x", rng.uniform(-18, 18)), R("z", rng.uniform(-12, 12))))
            lo = s.bounds()[0][1]
            if lo < 0:
                s = s.t(0, -lo, 0)
            stones.append(s.shade(28))
            hf.append((x, z, max(sz[0], sz[2]) * 0.8, base_y + sz[1] * 0.8))
        node.add("stone_wall", *stones)
        root.child(node)
    return root
