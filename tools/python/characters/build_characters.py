"""
Character pipeline (Python): turns the CC0 KayKit character packs into lean, game-ready assets.

  * extracts ONE shared animation library (Rig_Medium, 41 bones) with only the clips the game uses
  * strips the animation data out of every character (the clips are shared at runtime by bone name)
  * produces per-prefab variants with a graded palette texture (dark gothic tone per class/enemy)
  * garbage-collects unused accessors / buffer views so every file is as small as possible
  * copies the weapon/shield accessory glTFs as compact GLBs

Sources: KayKit Adventurers 1.0 + Skeletons 1.0 by Kay Lousberg — CC0 1.0 (see LICENSES.md).
Usage: python3 tools/python/characters/build_characters.py <kaykit_root_dir>
Deterministic: same inputs → byte-identical outputs.
"""
from __future__ import annotations

import colorsys
import io
import json
import pathlib
import struct
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / 'apps/web/public/assets/characters'

KEEP_ANIMS = [
    'Idle', 'Idle_B', 'Idle_Combat', '2H_Melee_Idle', 'Unarmed_Idle',
    '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
    '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin',
    'Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab', 'Unarmed_Melee_Attack_Punch_A',
    '1H_Ranged_Shoot', '2H_Ranged_Shoot', '1H_Ranged_Aiming', 'Throw',
    'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Summon', 'Spellcast_Long', 'Use_Item',
    'Block', 'Block_Hit', 'Blocking', 'Hit_A', 'Hit_B', 'Dodge_Backward',
    'Death_A', 'Death_B', 'Death_C_Skeletons', 'Lie_Down', 'Lie_Idle', 'Lie_StandUp',
    'Walking_A', 'Walking_B', 'Running_A', 'Walking_D_Skeletons', 'Jump_Full_Short',
    'Cheer', 'Taunt', 'Interact', 'Spawn_Ground_Skeletons', 'Skeletons_Awaken_Standing',
]

# prefab → (base model, grade(h_shift, sat_mul, val_mul, tint_rgb, tint_strength), hidden nodes)
G = dict
VARIANTS = {
    # ---------------- heroes
    'hero_guerreiro': ('Barbarian', G(sat=0.62, val=0.78, tint=(150, 50, 42), k=0.30), ['Mug', '1H_Axe_Offhand', '2H_Axe', '1H_Axe', 'Barbarian_Round_Shield']),
    'hero_paladino': ('Knight', G(sat=0.55, val=0.95, tint=(215, 180, 95), k=0.28), ['1H_Sword_Offhand', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword', '1H_Sword', 'Badge_Shield']),
    'hero_arcanista': ('Mage', G(sat=0.70, val=0.80, tint=(96, 88, 210), k=0.40), ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff']),
    'hero_clerigo': ('Mage', G(sat=0.25, val=1.05, tint=(236, 224, 196), k=0.55), ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff', 'Mage_Hat']),
    'hero_arqueiro': ('Rogue_Hooded', G(sat=0.62, val=0.80, tint=(84, 128, 70), k=0.40), ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable']),
    'hero_ladino': ('Rogue', G(sat=0.55, val=0.72, tint=(54, 132, 126), k=0.38), ['1H_Crossbow', '2H_Crossbow', 'Throwable', 'Knife', 'Knife_Offhand']),
    # ---------------- enemies
    'enemy_penitente': ('Skeleton_Minion', G(sat=0.20, val=0.46, tint=(105, 96, 92), k=0.55), []),
    'enemy_besteiro': ('Skeleton_Rogue', G(sat=0.40, val=0.55, tint=(120, 92, 62), k=0.45), []),
    'enemy_escudeiro': ('Skeleton_Warrior', G(sat=0.30, val=0.52, tint=(110, 112, 120), k=0.50), []),
    'enemy_acolito': ('Skeleton_Mage', G(sat=0.35, val=0.56, tint=(150, 130, 175), k=0.45), []),
    'enemy_turiferario': ('Skeleton_Rogue', G(sat=0.50, val=0.52, tint=(140, 70, 40), k=0.50), []),
    'enemy_carcereiro': ('Barbarian', G(sat=0.30, val=0.58, tint=(95, 72, 58), k=0.55), ['Mug', '1H_Axe_Offhand', '2H_Axe', 'Barbarian_Round_Shield', '1H_Axe']),
    'enemy_carrasco': ('Barbarian', G(sat=0.35, val=0.48, tint=(70, 30, 30), k=0.55), ['Mug', '1H_Axe_Offhand', '1H_Axe', 'Barbarian_Round_Shield']),
    'enemy_cantor': ('Skeleton_Mage', G(sat=0.70, val=0.50, tint=(150, 30, 28), k=0.60), []),
    'enemy_cavaleiro': ('Knight', G(sat=0.35, val=0.60, tint=(60, 72, 96), k=0.50), ['1H_Sword_Offhand', 'Badge_Shield', 'Round_Shield', 'Rectangle_Shield', '1H_Sword']),
    'enemy_vigia': ('Skeleton_Mage', G(sat=0.30, val=0.95, tint=(150, 190, 230), k=0.50), []),
    'enemy_severin': ('Mage', G(sat=0.55, val=0.55, tint=(110, 40, 22), k=0.55), ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff']),
}
ACCESSORIES = {
    'Adventurers': ['sword_1handed', 'sword_2handed', 'axe_1handed', 'axe_2handed', 'dagger', 'staff', 'wand', 'crossbow_1handed', 'crossbow_2handed', 'shield_badge', 'shield_round', 'shield_square', 'shield_spikes', 'quiver', 'spellbook_open', 'arrow'],
    'Skeletons': ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Crossbow', 'Skeleton_Shield_Large_A', 'Skeleton_Shield_Large_B', 'Skeleton_Shield_Small_A', 'Skeleton_Staff'],
}


# ----------------------------------------------------------------------------- GLB io
def read_glb(path: pathlib.Path):
    b = path.read_bytes()
    assert b[:4] == b'glTF'
    jl = struct.unpack('<I', b[12:16])[0]
    js = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    binc = b[off + 8:off + 8 + bl]
    return js, binc


def read_gltf(path: pathlib.Path):
    js = json.loads(path.read_text())
    buf = (path.parent / js['buffers'][0]['uri']).read_bytes()
    for img in js.get('images', []):
        if 'uri' in img:
            data = (path.parent / img['uri']).read_bytes()
            img['__data'] = data
    return js, buf


def pad4(b: bytes, fill=b'\x00') -> bytes:
    return b + fill * ((4 - len(b) % 4) % 4)


def rebuild(js: dict, binc: bytes, extra_images: dict[int, bytes] | None = None) -> bytes:
    """Garbage-collect unreferenced accessors/bufferViews and repack into one BIN chunk."""
    extra_images = extra_images or {}
    used_acc = set()

    def mark_acc(i):
        if i is not None:
            used_acc.add(i)

    for m in js.get('meshes', []):
        for p in m['primitives']:
            for a in p['attributes'].values():
                mark_acc(a)
            mark_acc(p.get('indices'))
            for t in p.get('targets', []):
                for a in t.values():
                    mark_acc(a)
    for s in js.get('skins', []):
        mark_acc(s.get('inverseBindMatrices'))
    for an in js.get('animations', []):
        for smp in an['samplers']:
            mark_acc(smp['input'])
            mark_acc(smp['output'])
    acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
    used_bv = {js['accessors'][i]['bufferView'] for i in used_acc if 'bufferView' in js['accessors'][i]}
    for i, img in enumerate(js.get('images', [])):
        if 'bufferView' in img and i not in extra_images:
            used_bv.add(img['bufferView'])
    bv_map = {}
    out = bytearray()
    new_bvs = []
    for old in sorted(used_bv):
        bv = dict(js['bufferViews'][old])
        data = binc[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        while len(out) % 4:
            out += b'\x00'
        bv['byteOffset'] = len(out)
        bv['buffer'] = 0
        out += data
        bv_map[old] = len(new_bvs)
        new_bvs.append(bv)
    for i, data in extra_images.items():
        while len(out) % 4:
            out += b'\x00'
        js['images'][i] = {'name': js['images'][i].get('name', f'img{i}'), 'mimeType': 'image/png', 'bufferView': len(new_bvs)}
        new_bvs.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)})
        out += data
    for img in js.get('images', []):
        if 'bufferView' in img and img['bufferView'] in bv_map and img.get('__keep') is None:
            pass
    # remap
    new_acc = []
    for old in sorted(used_acc):
        a = dict(js['accessors'][old])
        if 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]
        new_acc.append(a)
    for m in js.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
            if 'targets' in p:
                p['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in p['targets']]
    for s in js.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for an in js.get('animations', []):
        for smp in an['samplers']:
            smp['input'] = acc_map[smp['input']]
            smp['output'] = acc_map[smp['output']]
    for i, img in enumerate(js.get('images', [])):
        if i not in extra_images and 'bufferView' in img:
            img['bufferView'] = bv_map[img['bufferView']]
    js['accessors'] = new_acc
    js['bufferViews'] = new_bvs
    js['buffers'] = [{'byteLength': len(out)}]
    js.setdefault('asset', {})['generator'] = 'mosteiro build_characters.py'
    jb = pad4(json.dumps(js, separators=(',', ':')).encode(), b' ')
    bb = pad4(bytes(out))
    total = 12 + 8 + len(jb) + 8 + len(bb)
    return b'glTF' + struct.pack('<II', 2, total) + struct.pack('<I', len(jb)) + b'JSON' + jb + struct.pack('<I', len(bb)) + b'BIN\x00' + bb


# ----------------------------------------------------------------------------- texture grading
def grade(png: bytes, sat=0.5, val=0.8, tint=(128, 128, 128), k=0.4) -> bytes:
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    px = im.load()
    tr, tg, tb = (c / 255 for c in tint)
    th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            s *= sat
            v *= val
            # pull hue toward the tint for saturated swatches, keep neutrals neutral
            h = h + (th - h) * k * min(1.0, s * 2.2) if abs(th - h) < 0.5 else h
            r2, g2, b2 = colorsys.hsv_to_rgb(h % 1.0, min(1, s + ts * k * 0.35), v)
            # multiply blend with tint
            r2 = r2 * (1 - k) + r2 * tr * 1.6 * k
            g2 = g2 * (1 - k) + g2 * tg * 1.6 * k
            b2 = b2 * (1 - k) + b2 * tb * 1.6 * k
            px[x, y] = (max(0, min(255, int(r2 * 255))), max(0, min(255, int(g2 * 255))), max(0, min(255, int(b2 * 255))), a)
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


# ----------------------------------------------------------------------------- build
def find(root: pathlib.Path, name: str) -> pathlib.Path:
    hits = list(root.glob(f'**/Characters/gltf/{name}.glb'))
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]


def build_anims(root: pathlib.Path):
    js, binc = read_glb(find(root, 'Skeleton_Warrior'))
    js['animations'] = [a for a in js['animations'] if a['name'] in KEEP_ANIMS]
    # drop meshes/materials: keep the bone hierarchy only
    for n in js['nodes']:
        n.pop('mesh', None)
        n.pop('skin', None)
    js['meshes'] = []
    js['materials'] = []
    js['textures'] = []
    js['images'] = []
    js['samplers'] = []
    js['skins'] = []
    data = rebuild(js, binc)
    (OUT / 'anims_rig_medium.glb').write_bytes(data)
    return [a['name'] for a in js['animations']], len(data)


def build_variant(root: pathlib.Path, prefab: str, base: str, g: dict, hidden: list[str]):
    js, binc = read_glb(find(root, base))
    js.pop('animations', None)
    # hidden accessory nodes are removed from the scene graph entirely
    if hidden:
        hid = {i for i, n in enumerate(js['nodes']) if n.get('name') in hidden}
        for n in js['nodes']:
            if 'children' in n:
                n['children'] = [c for c in n['children'] if c not in hid]
        for s in js.get('scenes', []):
            s['nodes'] = [c for c in s['nodes'] if c not in hid]
        for i in hid:
            js['nodes'][i].pop('mesh', None)
            js['nodes'][i]['name'] = js['nodes'][i]['name'] + '__removed'
    # grade the palette texture
    extra = {}
    for i, img in enumerate(js.get('images', [])):
        bv = js['bufferViews'][img['bufferView']]
        png = binc[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        extra[i] = grade(png, **g)
    for m in js.get('materials', []):
        m['name'] = f'{prefab}_{m.get("name", "mat")}'
    # drop meshes not referenced anymore
    used = {n['mesh'] for n in js['nodes'] if 'mesh' in n}
    remap = {}
    meshes = []
    for i, m in enumerate(js['meshes']):
        if i in used:
            remap[i] = len(meshes)
            meshes.append(m)
    js['meshes'] = meshes
    for n in js['nodes']:
        if 'mesh' in n:
            n['mesh'] = remap[n['mesh']]
    data = rebuild(js, binc, extra)
    (OUT / f'{prefab}.glb').write_bytes(data)
    return len(data)


def build_accessory(path: pathlib.Path, name: str, g: dict | None):
    js, buf = read_gltf(path)
    extra = {}
    for i, img in enumerate(js.get('images', [])):
        data = img.pop('__data')
        img.pop('uri', None)
        extra[i] = grade(data, **g) if g else data
        img['bufferView'] = 0
    for bv in js['bufferViews']:
        bv['buffer'] = 0
    data = rebuild(js, buf, extra)
    (OUT / 'acc').mkdir(parents=True, exist_ok=True)
    (OUT / 'acc' / f'{name}.glb').write_bytes(data)
    return len(data)


def main():
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {'license': 'CC0 1.0 — KayKit by Kay Lousberg (kaylousberg.com); graded/optimized by tools/python/characters', 'prefabs': {}, 'accessories': {}}
    anims, n = build_anims(root)
    manifest['animations'] = {'file': 'anims_rig_medium.glb', 'clips': anims, 'bytes': n}
    for prefab, (base, g, hidden) in VARIANTS.items():
        n = build_variant(root, prefab, base, g, hidden)
        manifest['prefabs'][prefab] = {'file': f'{prefab}.glb', 'base': base, 'bytes': n, 'removed': hidden}
    steel = G(sat=0.45, val=0.82, tint=(140, 140, 150), k=0.35)
    for pack, names in ACCESSORIES.items():
        for name in names:
            hits = list(root.glob(f'**/Assets/gltf/{name}.gltf'))
            if not hits:
                continue
            n = build_accessory(hits[0], name, steel)
            manifest['accessories'][name] = {'file': f'acc/{name}.glb', 'bytes': n}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    total = sum(p.stat().st_size for p in OUT.rglob('*.glb'))
    print(f'{len(manifest["prefabs"])} prefabs, {len(manifest["accessories"])} accessories, {len(anims)} clips, total {total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
