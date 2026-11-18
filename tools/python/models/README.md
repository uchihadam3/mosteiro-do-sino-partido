# Procedural 3D models — Mosteiro do Sino Partido

Original environment and prop meshes for the Three.js (WebGL2) client, generated
entirely by project code (Python + numpy). There are no third-party meshes and
no Blender files: geometry is built procedurally and written straight to binary
glTF 2.0 (`.glb`).

Output: `apps/web/public/assets/models/<id>.glb` + `manifest.json`.

## Rebuild / verify

```bash
# from the repo root (Python 3.13, numpy, scipy, pillow, pytest)
python tools/python/models/build_models.py                 # all 39 pieces (~5 s)
python tools/python/models/build_models.py altar pew       # subset; manifest is merged
python tools/python/models/audit_models.py                 # structural audit, exit 1 on error
python -m pytest tools/python/models/test_models.py -q     # 126 tests
python tools/python/models/render_preview.py --out /tmp/models_contact.png   # contact sheet
python tools/python/models/render_preview.py --only bell_great_cracked --size 600 --el -25
```

Optional cross-check with the official Khronos validator (not required by the build):
`npm i gltf-validator` in a scratch folder, then call `validator.validateBytes` on each file.
Last run: 0 errors and 0 warnings on all 39 files (only info-level notes).

## Files

| file | role |
| --- | --- |
| `meshlib.py` | Triangle-soup mesh library: chamfered boxes (convex hull), lathe, polar ring stacks, sweep along a path (parallel frames + mitred corners), prism/extrude with ear-clipping caps, pointed-arch / lancet outlines, smooth noise displacement, auto-smooth normals (angle threshold), box/cylindrical UVs, matrices, `Node` tree with named anchors. |
| `kit.py` | Shared gothic parts: worn quad slabs (bevel, subdivided top, wear/chip noise), rocks, ashlar faces, moldings (plinth, string course, cornice), clustered column sections + level stacks, melted candles with drips, chain links, rings, bezier paths. |
| `pieces_arch.py` | Architecture kit (walls, window, portal, columns, arch, vault, floors, stairs). |
| `pieces_props.py` | Props (bells, frame, chains, furniture, liturgical items, tombs, mechanisms, rubble). |
| `gltf_io.py` | Dependency-free GLB writer (welding, accessors with min/max, PBR materials) and reader. |
| `build_models.py` | Registry (id, builder, budget class, origin, intended use) + manifest writer. |
| `audit_models.py` | Validator for every GLB (see "Audit" below). |
| `render_preview.py` | Numpy z-buffer software rasterizer for contact sheets (orthographic 3/4 view, Lambert). |
| `test_models.py` | pytest suite. |
| `blender/reexport_glb.py` | **Untested** bpy script to import/re-export the GLBs (Blender was not available; not needed by the pipeline). |

## Technique

* **Real gothic shapes, not boxes.** Columns are polar ring stacks over a clustered
  section (core + 4 major + 4 minor shafts) with an octagonal plinth, torus/scotia
  base moldings that follow the cluster, an annulet, a necking and a leafy capital
  (16 lobes, two staggered rows) under an octagonal abacus. Arches and the portal
  sweep molded sections (rolls, chamfers, hollows) along two-centred pointed
  curves; the vault has diagonal + half-profile wall ribs, domed webs and a boss.
* **Wear.** Slabs and blocks are bevelled, their tops subdivided and displaced with a
  deterministic position-keyed noise (so shared vertices stay welded), edges are
  chipped; stairs are dished at the centre; floor stones are slightly tilted.
* **The cracked bell** is a lathe of a real bell profile (lip, sound bow, waist,
  shoulder, crown, mouldings) with extra angular samples around the crack. A jagged
  groove is carved from a V notch in the lip upward (outer surface pushed in, inner
  pushed out), darkened via `COLOR_0`. Canons + argent on the crown, separate clapper.
* **Normals.** Auto-smooth by angle threshold (≈30–60° depending on the part):
  hard edges on masonry, smooth on lathed/swept forms.
* **UVs.** Every primitive has `TEXCOORD_0`. Stone uses world-space box projection at
  **1 UV = 2 m**; wood 1 m (beams are projected in their local frame so grain runs
  along the beam); metal 0.5 m; wax 0.25 m; cloth 1 m. Lathe/sweep surfaces get
  cylindrical/arc-length UVs. `window_glass` uses 0..1 over the opening so a
  stained-glass texture fits it exactly. Exact densities are in `manifest.uv_density_m_per_uv`.

## Conventions

* Metres, +Y up, +Z forward (the "display" face), CCW front faces.
* Root node of each file is named exactly like the file id; sub-nodes are
  `snake_case` (`pillar_gothic_capital`, `bell_clapper` …; `door_L`/`door_R` as specified).
* **Origins** (also per model in `manifest.json`):
  * default `bottom_center`: centre of the footprint, y=0 on the floor;
  * `floor_tile_4m`, `floor_crack_slab`: walkable top at y=0, slab below (crack pit to −0.45);
  * `vault_rib_segment`: y=0 at the springing, corners at (±2, 0, ±2) — place on pillar tops;
  * `torch_sconce`: wall mount (z=0 on the wall, extends to +Z);
  * `well_dry`: ground at y=0, the shaft goes to y=−0.8 (needs a hole in the floor).
* Variant files (`rubble_pile`: `rubble_a..d`; `counterweight`: `counterweight_a..c`) lay the
  variants out along X; each variant node is centred on its own origin, so zero the node
  translation to use one on its own.
* Animated parts are separate nodes whose origin is the pivot:
  `door_L`/`door_R` (hinge, rotate Y), `grate_door` (hinge, rotate Y), `chest_lid`
  (back hinge, rotate −X; carries `chest_teeth`), `bell_clapper` (top), `bell_headstock`
  (swing about X; child `bell_mount_anchor` receives `bell_crown_anchor` of the bell),
  `crank_wheel_rotor` (rotate Z), `sarcophagus_lid`.
* **Anchors** are empty leaf nodes: `*_flame_anchor` (one per wick on candles, candelabra,
  altar, desk, candle stand; torch, brazier, censer), `*_light_anchor` (torch, brazier,
  window), plus `*_top_anchor` / `*_mount_anchor` / `*_crown_anchor` hang points.

## Materials

Material **names are the shared PBR ids** so the game binds
`assets/textures/<id>_{albedo,normal,rough,ao}.jpg` by name. Textures are *not*
embedded. Each material carries fallback factors so models look right untextured:

| id | baseColor (linear) | metallic | roughness | notes |
| --- | --- | --- | --- | --- |
| stone_floor | 0.26 0.25 0.23 | 0 | 0.92 | |
| stone_wall | 0.30 0.285 0.265 | 0 | 0.90 | |
| stone_plate | 0.36 0.345 0.32 | 0 | 0.86 | finer dressed stone: moldings, statue, plates |
| wood_dark | 0.15 0.095 0.06 | 0 | 0.74 | |
| bronze_aged | 0.46 0.34 0.19 | 0.85 | 0.45 | |
| iron_rusted | 0.21 0.165 0.135 | 0.70 | 0.70 | also wicks, coals |
| cloth_wool | 0.26 0.055 0.045 | 0 | 0.95 | `doubleSided` |
| parchment | 0.70 0.60 0.43 | 0 | 0.85 | also bones and the chest teeth (no bone id exists) |
| wax | 0.86 0.79 0.63 | 0 | 0.55 | |
| leather | 0.24 0.12 0.065 | 0 | 0.70 | also ropes/cords |
| stained_glass | 0.55 0.35 0.60 α0.65 | 0 | 0.25 | custom id, `BLEND`, doubleSided, faint emissive |
| flame | 1.0 0.55 0.18 | 0 | 1.0 | custom id, emissive; brazier embers only |

Integration notes for the game side:
* Some primitives carry **`COLOR_0`** tints (book covers, the bell crack darkening, bone
  dirt). If the game replaces materials by name, set `vertexColors: true` on the
  replacement when the geometry has a `color` attribute, or the variation is lost.
* If materials are replaced, keep `side: DoubleSide` for `cloth_wool` and `stained_glass`
  (banner, altar cloths are single surfaces).
* Tangents are not exported; Three.js normal maps work without them (derivative TBN),
  or call `geometry.computeTangents()` (or `BufferGeometryUtils.computeMikkTSpaceTangents`) if needed.
* The banner cloth is a regular grid (11 × 20) for vertex-shader sway: weight by
  `(top_y - y) / (top_y - min_y)` with `top_y = 2.82` (also in node extras).

## Budgets

| class | max triangles | pieces |
| --- | --- | --- |
| small | 2 000 | bell_small, chain_short, lectern, pew, candle_cluster, torch_sconce, banner_torn, pillar_candle_stand, bone_pile |
| medium | 6 000 | most props and modules |
| hero | 15 000 | bell_great_cracked, altar, bell_frame |
| architecture | 10 000 | arch_gothic, vault_rib_segment, doorway_gothic (large modules; no limit given in the brief) |
| plate | 1 000 | formation_plate, formation_divider |

Totals and per-file numbers live in `manifest.json` (≈120 k triangles, ≈6 MB for the
whole folder, under the 8 MB target).

## Audit

`audit_models.py` checks for every file: GLB magic/version/length, JSON-then-BIN
chunk order and 4-byte alignment, buffer view ranges, a single root named like
the file, snake_case unique node names, named meshes, anchors as empty leaves,
required nodes (doors, glass, clapper, lid/teeth, variants, flame/light anchors),
allowed material ids with PBR factors, no embedded images/textures, triangles only,
POSITION min/max present and correct, finite positions/normals/UVs, unit normals,
indices in range, triangle budget, manifest triangle counts up to date, folder size.

## License

All geometry is original, generated procedurally by the code in this folder
(no external assets). It is covered by the project's own license.
