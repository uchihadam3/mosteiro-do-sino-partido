"""
KayKit Dungeon Remastered → lean, game-ready environment kit for the Three.js client.

  * copies only the pieces the dungeons use (PIECES below; add more when a new dungeon needs them)
  * strips the texture every source GLB embeds (all 203 files carry the same 1024² gradient atlas) and writes it
    ONCE as `dungeon_texture.png` (resampled to 512², the atlas is made of smooth gradient swatches)
  * quantizes the geometry with KHR_mesh_quantization (positions int16 + uniform dequantization scale on a child
    node, normals int8, UVs uint16) and drops tangents: ~half the bytes, no decoder needed (three.js reads it natively)
  * keeps the node hierarchy (e.g. `wall_doorway_door`, `chest_lid` stay separate nodes so doors/lids can move)
  * writes `manifest.json` with bounds / triangles / bytes / nodes per piece (the runtime uses the bounds for
    colliders and placement)

Source: KayKit Dungeon Remastered 1.0 by Kay Lousberg — CC0 1.0 (see LICENSES.md).
Usage:  python3 tools/python/kaykit/build_kit.py <path to .../kaykit_dungeon_remastered/Assets>
Deterministic: same inputs → byte-identical outputs.
"""
from __future__ import annotations

import io
import json
import math
import pathlib
import struct
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / 'apps/web/public/assets/kaykit-dungeon'
ATLAS_SIZE = 512
MATERIAL = 'kaykit_dungeon'

# Only what the dungeons use (D1 today). A new dungeon adds its pieces here and re-runs the script.
PIECES = [
    # walls (4 x 4 x 1 modules, origin bottom-centre)
    'wall', 'wall_arched', 'wall_archedwindow_gated', 'wall_archedwindow_open', 'wall_window_closed', 'wall_doorway',
    'wall_gated', 'wall_broken', 'wall_cracked', 'wall_shelves', 'wall_scaffold', 'wall_open_scaffold', 'wall_pillar',
    # floors
    'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small_broken_A',
    'floor_tile_small_weeds_A', 'floor_tile_small_weeds_B', 'floor_tile_big_grate', 'floor_tile_grate',
    'floor_wood_large', 'floor_wood_large_dark', 'floor_dirt_large', 'floor_dirt_large_rocky', 'floor_dirt_small_weeds',
    # structure
    'pillar', 'pillar_decorated', 'column', 'barrier', 'barrier_half', 'barrier_column', 'stairs_wood',
    # light
    'torch_lit', 'torch_mounted', 'candle_lit', 'candle_thin_lit', 'candle_triple', 'candle_melted',
    # furniture & props
    'table_long', 'table_long_broken', 'table_medium', 'table_small_decorated_A', 'chair', 'bed_frame', 'bed_floor',
    'keg', 'barrel_large', 'barrel_large_decorated', 'barrel_small', 'barrel_small_stack', 'box_large', 'box_small',
    'box_stacked', 'crates_stacked', 'trunk_large_A', 'trunk_large_B', 'trunk_medium_A', 'trunk_small_A', 'chest_gold',
    'sword_shield', 'sword_shield_broken', 'sword_shield_gold', 'rubble_large', 'rubble_half', 'keyring_hanging',
    'coin_stack_small', 'coin_stack_medium', 'coin_stack_large', 'bottle_A_brown', 'bottle_B_green', 'bottle_C_brown',
    'plate',
    # banners (D1 heraldry: ecclesiastic red and white)
    'banner_red', 'banner_thin_red', 'banner_triple_red', 'banner_shield_red', 'banner_patternC_white',
]

# flames are split into their own node ('flame') so the runtime can make them glow and flicker
FLAME_CELLS = {'torch_lit': {(7, 2)}, 'candle_lit': {(7, 2)}, 'candle_thin_lit': {(7, 2)}}

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path: pathlib.Path):
    b = path.read_bytes()
    assert b[:4] == b'glTF', path
    off = 12
    js, binc = None, b''
    while off < len(b):
        clen, ctype = struct.unpack_from('<II', b, off)
        chunk = b[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk)
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc


def accessor(js, binc, i) -> np.ndarray:
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    n = NCOMP[a['type']]
    stride = bv.get('byteStride', size * n)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    dt = np.dtype(fmt).newbyteorder('<')
    if stride == size * n:
        arr = np.frombuffer(binc, dtype=dt, count=a['count'] * n, offset=base).reshape(a['count'], n)
    else:
        arr = np.stack([np.frombuffer(binc, dtype=dt, count=n, offset=base + k * stride) for k in range(a['count'])])
    arr = arr.astype(np.float64)
    if a.get('normalized'):
        arr = {5120: lambda x: np.maximum(x / 127, -1), 5121: lambda x: x / 255, 5122: lambda x: np.maximum(x / 32767, -1), 5123: lambda x: x / 65535}[a['componentType']](arr)
    return arr if n > 1 else arr[:, 0]


class Writer:
    def __init__(self):
        self.bin = bytearray()
        self.views: list[dict] = []
        self.accs: list[dict] = []

    def view(self, data: bytes, stride: int | None = None, target: int | None = None) -> int:
        while len(self.bin) % 4:
            self.bin += b'\x00'
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if stride:
            v['byteStride'] = stride
        if target:
            v['target'] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def acc(self, view: int, ctype: int, count: int, typ: str, normalized=False, mn=None, mx=None) -> int:
        a = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
        if normalized:
            a['normalized'] = True
        if mn is not None:
            a['min'] = mn
            a['max'] = mx
        self.accs.append(a)
        return len(self.accs) - 1


def quantize_primitive(w: Writer, pos, nrm, uv, idx):
    """Returns (attributes, indices accessor, dequant translation, dequant scale)."""
    lo, hi = pos.min(0), pos.max(0)
    center = (lo + hi) / 2
    half = float(max((hi - lo).max() / 2, 1e-6))
    q = np.round((pos - center) / half * 32767).astype('<i2')
    q4 = np.zeros((len(q), 4), '<i2')
    q4[:, :3] = q
    pv = w.view(q4.tobytes(), stride=8, target=34962)
    pa = w.acc(pv, 5122, len(q), 'VEC3', True, [int(v) for v in q.min(0)], [int(v) for v in q.max(0)])
    attrs = {'POSITION': pa}
    if nrm is not None:
        nn = nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
        n4 = np.zeros((len(nn), 4), '<i1')
        n4[:, :3] = np.round(nn * 127).astype('<i1')
        attrs['NORMAL'] = w.acc(w.view(n4.tobytes(), stride=4, target=34962), 5120, len(nn), 'VEC3', True)
    if uv is not None:
        if uv.min() >= -1e-4 and uv.max() <= 1 + 1e-4:
            u = np.round(np.clip(uv, 0, 1) * 65535).astype('<u2')
            attrs['TEXCOORD_0'] = w.acc(w.view(u.tobytes(), stride=4, target=34962), 5123, len(u), 'VEC2', True)
        else:
            attrs['TEXCOORD_0'] = w.acc(w.view(uv.astype('<f4').tobytes(), target=34962), 5126, len(uv), 'VEC2')
    ii = idx.astype('<u2' if len(pos) < 65536 else '<u4')
    ia = w.acc(w.view(ii.tobytes(), target=34963), 5123 if ii.dtype == np.dtype('<u2') else 5125, len(ii), 'SCALAR')
    return attrs, ia, center, half


def quat_rotate(q, v):
    x, y, z, w_ = q
    u = np.array([x, y, z])
    return 2 * np.dot(u, v) * u + (w_ * w_ - np.dot(u, u)) * v + 2 * w_ * np.cross(u, v)


def build_piece(src: pathlib.Path, name: str):
    js, binc = read_glb(src)
    w = Writer()
    nodes_out: list[dict] = []
    meshes_out: list[dict] = []
    tris = verts = 0
    world_lo = np.full(3, 1e9)
    world_hi = np.full(3, -1e9)

    def node_matrix(n):
        t = np.array(n.get('translation', [0, 0, 0]), float)
        r = np.array(n.get('rotation', [0, 0, 0, 1]), float)
        s = np.array(n.get('scale', [1, 1, 1]), float)
        return t, r, s

    def emit(ni: int, parent_tf) -> int:
        n = js['nodes'][ni]
        t, r, s = node_matrix(n)
        out = {'name': n.get('name', f'n{ni}')}
        if np.any(t != 0):
            out['translation'] = [round(float(v), 6) for v in t]
        if np.any(r != [0, 0, 0, 1]):
            out['rotation'] = [round(float(v), 7) for v in r]
        if np.any(s != 1):
            out['scale'] = [round(float(v), 6) for v in s]
        idx_self = len(nodes_out)
        nodes_out.append(out)
        children = []

        def to_world(p):
            # apply this node's TRS then the parents' (enough for bounds)
            p = p * s
            p = np.array([quat_rotate(r, v) for v in p]) if np.any(r != [0, 0, 0, 1]) else p
            p = p + t
            return parent_tf(p)

        if 'mesh' in n:
            nonlocal tris, verts
            for pi, prim in enumerate(js['meshes'][n['mesh']]['primitives']):
                at = prim['attributes']
                pos = accessor(js, binc, at['POSITION'])
                nrm = accessor(js, binc, at['NORMAL']) if 'NORMAL' in at else None
                uv = accessor(js, binc, at['TEXCOORD_0']) if 'TEXCOORD_0' in at else None
                idx = accessor(js, binc, prim['indices']).astype(np.int64) if 'indices' in prim else np.arange(len(pos))
                groups = [('', idx)]
                if name in FLAME_CELLS and uv is not None:
                    tri = idx.reshape(-1, 3)
                    cells = np.floor(uv[tri].mean(1) * [8, 4]).astype(int)
                    is_flame = np.array([tuple(c) in FLAME_CELLS[name] for c in cells])
                    groups = [('', tri[~is_flame].ravel()), ('flame', tri[is_flame].ravel())]
                for gname, gidx in groups:
                    used = np.unique(gidx)
                    remap = np.full(len(pos), -1, np.int64)
                    remap[used] = np.arange(len(used))
                    gpos, gnrm, guv = pos[used], (nrm[used] if nrm is not None else None), (uv[used] if uv is not None else None)
                    attrs, ia, center, half = quantize_primitive(w, gpos, gnrm, guv, remap[gidx])
                    meshes_out.append({'name': f"{out['name']}_{gname or pi}", 'primitives': [{'attributes': attrs, 'indices': ia, 'material': 0}]})
                    q = {'name': f"{gname}__q{pi}" if gname else f"{out['name']}__q{pi}", 'mesh': len(meshes_out) - 1, 'translation': [round(float(v), 7) for v in center], 'scale': [half, half, half]}
                    if gname:
                        # a named group node holds the quantized mesh so the runtime can find it by name
                        holder = {'name': gname, 'children': [len(nodes_out) + 1]}
                        children.append(len(nodes_out))
                        nodes_out.append(holder)
                    else:
                        children.append(len(nodes_out))
                    nodes_out.append(q)
                    tris += len(gidx) // 3
                    verts += len(gpos)
                    wp = to_world(gpos)
                    world_lo[:] = np.minimum(world_lo, wp.min(0))
                    world_hi[:] = np.maximum(world_hi, wp.max(0))
        for c in n.get('children', []):
            children.append(emit(c, to_world))
        if children:
            out['children'] = children
        return idx_self

    scene_nodes = js['scenes'][js.get('scene', 0)]['nodes']
    roots = [emit(i, lambda p: p) for i in scene_nodes]
    piece = {'name': name, 'children': roots}
    nodes_out.append(piece)
    gl = {
        'asset': {'version': '2.0', 'generator': 'mosteiro tools/python/kaykit/build_kit.py', 'copyright': 'KayKit Dungeon Remastered by Kay Lousberg (CC0 1.0)'},
        'extensionsUsed': ['KHR_mesh_quantization'],
        'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0,
        'scenes': [{'nodes': [len(nodes_out) - 1]}],
        'nodes': nodes_out,
        'meshes': meshes_out,
        'materials': [{'name': MATERIAL, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}}],
        'accessors': w.accs,
        'bufferViews': w.views,
        'buffers': [{'byteLength': len(w.bin)}],
    }
    jb = json.dumps(gl, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    bb = bytes(w.bin) + b'\x00' * ((4 - len(w.bin) % 4) % 4)
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + 8 + len(bb)) + struct.pack('<I', len(jb)) + b'JSON' + jb + struct.pack('<I', len(bb)) + b'BIN\x00' + bb
    meta = {
        'file': f'{name}.glb', 'bytes': len(glb), 'triangles': tris, 'vertices': verts,
        'bounds': {'min': [round(float(v), 3) for v in world_lo], 'max': [round(float(v), 3) for v in world_hi]},
        'nodes': [n['name'] for n in nodes_out if '__q' not in n['name'] and n is not piece],
    }
    return glb, meta


def find_source(assets: pathlib.Path, name: str) -> pathlib.Path:
    for cand in (assets / 'gltf' / f'{name}.gltf.glb', assets / 'gltf' / f'{name}.glb'):
        if cand.exists():
            return cand
    raise FileNotFoundError(name)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    assets = pathlib.Path(sys.argv[1]).resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        'license': 'CC0 1.0 — KayKit Dungeon Remastered 1.0 by Kay Lousberg (kaylousberg.com); repacked by tools/python/kaykit/build_kit.py',
        'units': 'KayKit native units (walls are 4 x 4 x 1); the runtime scales the kit per dungeon theme',
        'material': MATERIAL,
        'texture': 'dungeon_texture.png',
        'quantized': 'KHR_mesh_quantization (POSITION int16 + uniform dequant node, NORMAL int8, TEXCOORD_0 uint16)',
        'pieces': {},
    }
    total = 0
    src_total = 0
    for name in PIECES:
        src = find_source(assets, name)
        glb, meta = build_piece(src, name)
        (OUT / meta['file']).write_bytes(glb)
        manifest['pieces'][name] = meta
        total += len(glb)
        src_total += src.stat().st_size
    atlas = Image.open(assets / 'texture' / 'dungeon_texture.png').convert('RGB').resize((ATLAS_SIZE, ATLAS_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    atlas.save(buf, 'PNG', optimize=True)
    (OUT / 'dungeon_texture.png').write_bytes(buf.getvalue())
    total += len(buf.getvalue())
    for old in OUT.glob('*.glb'):
        if old.stem not in PIECES:
            old.unlink()
    manifest['total_bytes'] = total
    manifest['source_bytes'] = src_total
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')
    print(f'{len(PIECES)} pieces, {total / 1024:.0f} KiB (sources {src_total / 1024:.0f} KiB)')


if __name__ == '__main__':
    main()
