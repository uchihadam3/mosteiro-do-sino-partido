"""Build every procedural GLB of the Mosteiro do Sino Partido environment kit.

    python tools/python/models/build_models.py            # all pieces
    python tools/python/models/build_models.py pew altar  # subset (manifest is merged)

Writes apps/web/public/assets/models/<id>.glb and models/manifest.json.
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import pieces_arch as A  # noqa: E402
import pieces_props as P  # noqa: E402
from gltf_io import read_glb, world_primitives, write_glb  # noqa: E402
from kit import UV_SCALE  # noqa: E402

OUT_DIR = os.path.normpath(os.path.join(HERE, "../../../apps/web/public/assets/models"))

BUDGET = {"small": 2000, "medium": 6000, "hero": 15000, "plate": 1000, "architecture": 10000}

ORIGIN_BOTTOM = "bottom_center: origin at the centre of the footprint, y=0 on the floor/base"
ORIGIN_TOP_FLOOR = "top_center: walkable top surface at y=0 (slab extends below)"
ORIGIN_WALL = "wall_mount: y=0 at the bottom of the mounting plate, z=0 on the wall face, piece extends to +Z"
ORIGIN_SPRING = "springing: y=0 at the rib springing level, corners at (+-2, 0, +-2); hang above pillars"

# id, builder, budget class, origin, intended use
PIECES = [
    ("floor_tile_4m", A.floor_tile_4m, "medium", ORIGIN_TOP_FLOOR, "Modular 4x4 m worn flagstone floor tile."),
    ("wall_segment_4m", A.wall_segment_4m, "medium", ORIGIN_BOTTOM,
     "Ashlar wall module 4 m wide, 7 m tall, 0.8 m thick; x in [-2, 2], faces at z=+-0.4."),
    ("wall_window_lancet", A.wall_window_lancet, "medium", ORIGIN_BOTTOM,
     "Wall module with a two-light lancet window; glass is node window_glass (material stained_glass, 0..1 UVs)."),
    ("arch_gothic", A.arch_gothic, "architecture", ORIGIN_BOTTOM,
     "Freestanding pointed arch on two responds; pier axes at x=+-2 m (4 m grid span)."),
    ("pillar_gothic", A.pillar_gothic, "medium", ORIGIN_BOTTOM, "Clustered gothic column, 7 m, base/shaft/capital nodes."),
    ("pillar_broken", A.pillar_broken, "medium", ORIGIN_BOTTOM,
     "Same column snapped at ~3.5 m with jagged break, fallen drum and debris."),
    ("vault_rib_segment", A.vault_rib_segment, "architecture", ORIGIN_SPRING,
     "Quadripartite ribbed vault bay 4x4 m; edge ribs are half-profiles so neighbouring bays form full ribs."),
    ("stairs_stone", A.stairs_stone, "medium", ORIGIN_BOTTOM, "Five worn stone steps 2.5 m wide with cheek walls; ascends to -Z."),
    ("doorway_gothic", A.doorway_gothic, "architecture", ORIGIN_BOTTOM,
     "Wall module with a pointed portal, three archivolts and gable; door_L/door_R pivot at hinges (rotate Y)."),
    ("rubble_pile", P.rubble_pile, "medium", ORIGIN_BOTTOM,
     "Four rubble variants rubble_a..d laid out along X (2 m apart); each node is centred on its own origin."),
    ("floor_crack_slab", A.floor_crack_slab, "medium", ORIGIN_TOP_FLOOR, "Floor tile with a shattered, tilted central slab."),
    ("bell_great_cracked", P.bell_great_cracked, "hero", ORIGIN_BOTTOM,
     "The cracked great bell (2.2 m). bell_clapper pivots at its node origin; bell_crown_anchor is the hang point."),
    ("bell_frame", P.bell_frame, "hero", ORIGIN_BOTTOM,
     "Timber bell frame with iron straps; bell_headstock swings about local X; bell_mount_anchor receives the bell crown."),
    ("bell_small", P.bell_small, "small", ORIGIN_BOTTOM, "Acolyte handbell / hand prop (0.25 m)."),
    ("counterweight", P.counterweight, "medium", ORIGIN_BOTTOM,
     "Counterweights counterweight_a..c (iron block, banded stone drum, iron pear) with chain stubs, laid out along X."),
    ("chain_hanging", P.chain_hanging, "medium", ORIGIN_BOTTOM, "3 m hanging chain with hook; chain_top_anchor at the top link."),
    ("chain_short", P.chain_short, "small", ORIGIN_BOTTOM, "1 m chain; chain_top_anchor at the top link."),
    ("cage_grate", P.cage_grate, "medium", ORIGIN_BOTTOM, "Kennel iron grate with fixed jamb and grate_door (hinge pivot, rotate Y)."),
    ("bookshelf", P.bookshelf, "medium", ORIGIN_BOTTOM, "Tall gothic bookshelf with ~100 books (COLOR_0 tints on leather)."),
    ("lectern", P.lectern, "small", ORIGIN_BOTTOM, "Carved reading desk with open book."),
    ("desk_scribe", P.desk_scribe, "medium", ORIGIN_BOTTOM, "Scriptorium writing desk with inkwell, quill, scrolls, candle."),
    ("altar", P.altar, "hero", ORIGIN_BOTTOM, "Stone altar on a dais with cloth runner, frontal, cross and candle clusters."),
    ("pew", P.pew, "small", ORIGIN_BOTTOM, "Wooden church bench 2.5 m with poppy-head ends; faces +Z."),
    ("candle_cluster", P.candle_cluster, "small", ORIGIN_BOTTOM, "Seven melted candles on a wax pool; one flame anchor per wick."),
    ("candelabra", P.candelabra, "medium", ORIGIN_BOTTOM, "Iron floor candelabra with five candles."),
    ("torch_sconce", P.torch_sconce, "small", ORIGIN_WALL, "Wall torch in an iron bracket; torch_light_anchor + torch_flame_anchor."),
    ("brazier", P.brazier, "medium", ORIGIN_BOTTOM, "Iron brazier on a tripod with coals/embers; brazier_light_anchor."),
    ("censer", P.censer, "medium", ORIGIN_BOTTOM, "Thurible on three chains; censer_top_anchor is the hand/hang point."),
    ("banner_torn", P.banner_torn, "small", ORIGIN_BOTTOM,
     "Hanging torn banner on a rod; cloth grid is subdivided vertically for vertex-shader sway (weight by height)."),
    ("sarcophagus", P.sarcophagus, "medium", ORIGIN_BOTTOM, "Stone tomb with blind arcade; sarcophagus_lid is a separate node."),
    ("reliquary_chest", P.reliquary_chest, "medium", ORIGIN_BOTTOM,
     "Ornate reliquary chest; chest_lid pivots at the back hinge (rotate -X to open) and carries chest_teeth."),
    ("statue_blind_porter", P.statue_blind_porter, "medium", ORIGIN_BOTTOM,
     "Hooded eyeless monk statue holding an iron key, on a pedestal (2.4 m)."),
    ("well_dry", P.well_dry, "medium", ORIGIN_BOTTOM, "Dry stone well with roofed crank, rope and bucket; shaft extends below y=0."),
    ("pillar_candle_stand", P.pillar_candle_stand, "small", ORIGIN_BOTTOM, "Short stone column with a fat dripping candle."),
    ("bone_pile", P.bone_pile, "small", ORIGIN_BOTTOM, "Subtle scatter of bones and a skull."),
    ("cart_wood", P.cart_wood, "medium", ORIGIN_BOTTOM, "Two-wheeled wooden handcart resting on its shafts."),
    ("crank_wheel", P.crank_wheel, "medium", ORIGIN_BOTTOM,
     "Manivela Conservada: geared crank wheel on a stone pedestal; crank_wheel_rotor rotates about local Z."),
    ("formation_plate", P.formation_plate, "plate", ORIGIN_BOTTOM,
     "Tactical sector plate 1.6 x 1.2 m with carved groove ring (top at y=0.08)."),
    ("formation_divider", P.formation_divider, "plate", ORIGIN_BOTTOM, "Low carved stone rail 1 m long separating rows/sides."),
]


def _anchors(js):
    out = []
    for nd in js["nodes"]:
        nm = nd.get("name", "")
        if nm.endswith("_anchor"):
            out.append(nm)
    return out


def build(ids=None, verbose=True):
    os.makedirs(OUT_DIR, exist_ok=True)
    man_path = os.path.join(OUT_DIR, "manifest.json")
    old = {}
    if ids and os.path.exists(man_path):
        old = {m["id"]: m for m in json.load(open(man_path))["models"]}
    entries = {}
    for pid, fn, cls, origin, use in PIECES:
        if ids and pid not in ids:
            continue
        t0 = time.time()
        root = fn()
        assert root.name == pid, (root.name, pid)
        path = os.path.join(OUT_DIR, pid + ".glb")
        st = write_glb(path, root, asset_extras={"id": pid, "units": "meters", "up": "+Y", "forward": "+Z"},
                       default_uv_scale=UV_SCALE)
        js, binc, _ = read_glb(path)
        pts = np.concatenate([p[2] for p in world_primitives(js, binc)])
        lo, hi = pts.min(0), pts.max(0)
        entries[pid] = {
            "id": pid, "file": f"{pid}.glb", "triangles": st["triangles"], "vertices": st["vertices"],
            "budget": BUDGET[cls], "budget_class": cls, "bytes": st["bytes"],
            "bounds": {"min": [round(float(v), 3) for v in lo], "max": [round(float(v), 3) for v in hi],
                       "size": [round(float(v), 3) for v in hi - lo]},
            "origin": origin, "materials": st["materials"], "anchors": _anchors(js),
            "nodes": [n.get("name") for n in js["nodes"]], "use": use,
        }
        if verbose:
            print(f"{pid:22s} {st['triangles']:6d} tris {st['bytes'] / 1024:7.1f} KB  "
                  f"size {np.round(hi - lo, 2)}  {time.time() - t0:.1f}s")
    order = [p[0] for p in PIECES]
    merged = {**old, **entries}
    models = [merged[i] for i in order if i in merged]
    manifest = {
        "version": 1,
        "generator": "tools/python/models/build_models.py",
        "license": "Original geometry generated procedurally by project code (no third-party assets).",
        "units": "meters", "up": "+Y", "forward": "+Z",
        "texture_binding": "materials are bound by name to assets/textures/<id>_{albedo,normal,rough,ao}.jpg",
        "uv_density_m_per_uv": UV_SCALE,
        "total_bytes": int(sum(m["bytes"] for m in models)),
        "total_triangles": int(sum(m["triangles"] for m in models)),
        "models": models,
    }
    with open(man_path, "w") as f:
        json.dump(manifest, f, indent=2)
    if verbose:
        print(f"total {manifest['total_triangles']} tris, {manifest['total_bytes'] / 1e6:.2f} MB -> {man_path}")
    return manifest


if __name__ == "__main__":
    build(sys.argv[1:] or None)
