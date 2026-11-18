"""Tiny vector-geometry DSL used by build_icons.py.

Shapes are shapely geometries in a 48x48 SVG coordinate space (y down).
Icons are composed with boolean ops and finally flattened into a single
``<path fill-rule="evenodd">`` so each icon is one crisp, tintable shape.
"""

from __future__ import annotations

import math

from shapely import affinity
from shapely.geometry import GeometryCollection, LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

SIZE = 48
SW = 3.2   # main stroke
sw = 2.2   # secondary stroke
GAP = 1.6  # separation between overlapping parts ("engraved" gap)
QS = 24    # quad segments for round things


def C(x, y, r):
    return Point(x, y).buffer(r, quad_segs=QS)


def E(x, y, rx, ry, rot=0):
    g = affinity.scale(C(0, 0, 1), rx, ry, origin=(0, 0))
    if rot:
        g = affinity.rotate(g, rot, origin=(0, 0))
    return affinity.translate(g, x, y)


def R(x0, y0, x1, y1, r=0.0):
    g = box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
    if r:
        r = min(r, (abs(x1 - x0) / 2) * 0.98, (abs(y1 - y0) / 2) * 0.98)
        g = g.buffer(-r, join_style="mitre").buffer(r, quad_segs=QS)
    return g


def Lw(pts, w=SW, cap="round", join="round"):
    return LineString(pts).buffer(w / 2, quad_segs=QS, cap_style=cap, join_style=join, mitre_limit=4)


def arcp(cx, cy, r, a0, a1, n=None):
    n = n or max(8, int(abs(a1 - a0) / 4))
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def Arc(cx, cy, r, a0, a1, w=SW, cap="round"):
    return Lw(arcp(cx, cy, r, a0, a1), w, cap=cap)


def Ring(cx, cy, r, w=SW):
    return C(cx, cy, r + w / 2).difference(C(cx, cy, r - w / 2))


def Poly(pts):
    g = Polygon(pts)
    if not g.is_valid:
        g = g.buffer(0)
    return g


def path(*cmds, n=18):
    """Mini path language -> point list. Commands:
    ("M",x,y) ("L",x,y) ("Q",cx,cy,x,y) ("C",c1x,c1y,c2x,c2y,x,y) ("A",cx,cy,r,a0,a1)"""
    pts = []
    cur = None
    for c in cmds:
        k = c[0]
        if k in ("M", "L"):
            cur = (c[1], c[2])
            pts.append(cur)
        elif k == "Q":
            (x0, y0), (cx, cy), (x1, y1) = cur, c[1:3], c[3:5]
            for i in range(1, n + 1):
                t = i / n
                pts.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
                            (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1))
            cur = (x1, y1)
        elif k == "C":
            (x0, y0) = cur
            c1x, c1y, c2x, c2y, x1, y1 = c[1:]
            for i in range(1, n + 1):
                t = i / n
                mt = 1 - t
                pts.append((mt ** 3 * x0 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t ** 3 * x1,
                            mt ** 3 * y0 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t ** 3 * y1))
            cur = (x1, y1)
        elif k == "A":
            p = arcp(*c[1:])
            pts.extend(p)
            cur = p[-1]
    return pts


def P(*cmds):
    return Poly(path(*cmds))


def sym(half, axis=24.0):
    """Mirror a right-half outline (listed top->bottom) about x=axis."""
    return Poly(list(half) + [(2 * axis - x, y) for x, y in reversed(half)])


def U(*gs):
    gs = [g for g in gs if g is not None and not g.is_empty]
    return unary_union(gs)


def cut(g, *cs):
    return g.difference(U(*cs))


def over(base, *tops, gap=GAP):
    """Lay ``tops`` over ``base`` leaving an engraved gap around them."""
    for t in tops:
        base = base.difference(t.buffer(gap, quad_segs=QS)).union(t)
    return base


def outline(g, w=SW):
    return g.difference(g.buffer(-w, quad_segs=QS))


def inset(g, d):
    return g.buffer(-d, quad_segs=QS)


def rot(g, a, o=(24, 24)):
    return affinity.rotate(g, a, origin=o)


def mv(g, dx, dy):
    return affinity.translate(g, dx, dy)


def scl(g, sx, sy=None, o=(24, 24)):
    return affinity.scale(g, sx, sy if sy is not None else sx, origin=o)


def flipx(g, axis=24):
    return affinity.scale(g, -1, 1, origin=(axis, 0))


def star(cx, cy, r1, r2, n, a0=-90):
    pts = []
    for i in range(2 * n):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(a0 + 180 * i / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return Poly(pts)


def regpoly(cx, cy, r, n, a0=-90):
    return Poly([(cx + r * math.cos(math.radians(a0 + 360 * i / n)),
                  cy + r * math.sin(math.radians(a0 + 360 * i / n))) for i in range(n)])


def arrowhead(tip, ang, size=7, width=None):
    """Filled triangular arrow head; ``ang`` is the direction it points (deg)."""
    width = width or size * 0.9
    a = math.radians(ang)
    tx, ty = tip
    bx, by = tx - math.cos(a) * size, ty - math.sin(a) * size
    px, py = -math.sin(a) * width, math.cos(a) * width
    return Poly([(tx, ty), (bx + px, by + py), (bx - px, by - py)])


def polygons(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        out = []
        for p in g.geoms:
            out.extend(polygons(p))
        return out
    return []


def to_path(g, tol=0.04):
    g = g.intersection(box(0, 0, SIZE, SIZE)).simplify(tol, preserve_topology=True)
    parts = []
    for poly in polygons(g):
        if poly.area < 0.15:
            continue
        for ring in [poly.exterior, *poly.interiors]:
            cs = list(ring.coords)[:-1]
            if len(cs) < 3:
                continue
            seg = "M" + " ".join(f"{_f(x)} {_f(y)}" for x, y in cs[:1])
            seg += "L" + " ".join(f"{_f(x)} {_f(y)}" for x, y in cs[1:]) + "Z"
            parts.append(seg)
    return "".join(parts)


def _f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s
