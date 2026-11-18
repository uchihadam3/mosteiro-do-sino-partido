"""Asset checks for generated textures and icons.

Run from the repo root:  python3 -m pytest tools/python/textures -q
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

REPO = Path(__file__).resolve().parents[3]
TEX = REPO / "apps" / "web" / "public" / "assets" / "textures"
ICO = REPO / "apps" / "web" / "public" / "assets" / "icons"
SVG_NS = "{http://www.w3.org/2000/svg}"

REQUIRED_TEXTURE_SETS = [
    "stone_floor", "stone_wall", "stone_plate", "wood_dark", "bronze_aged", "iron_rusted",
    "cloth_wool", "parchment", "wax", "leather",
]
REQUIRED_SPRITES = [
    "ash_particle", "ember_particle", "smoke_puff", "glow_radial", "light_shaft", "stained_glass",
    "rune_ring", "holy_ring", "crack_decal", "blood_decal", "vignette", "grain",
    "ui_parchment_panel", "ui_frame_corner",
]
REQUIRED_ICONS = """
class_guerreiro class_paladino class_arcanista class_clerigo class_arqueiro class_ladino
attr_poder attr_guarda attr_agilidade attr_precisao attr_arcano attr_determinacao attr_espirito attr_sombra
cond_veneno cond_sangramento cond_queimando cond_quebrado cond_exposto cond_imobilizado cond_atordoado
cond_guardado cond_furtivo cond_caido cond_derrotado cond_trauma cond_julgado cond_fumaca cond_cobertura cond_brecha
tempo_rapido tempo_tatico tempo_pesado
hp armor ap reaction gold dice_d4 dice_d6 dice_d8 dice_d10 dice_d12 success impulse critical cantil mochila mira
conviccao runa instabilidade verso sequencia ressonancia canto contrapeso manivela selo_silencio selo_palavra
selo_peso sete_linhas ultimo_folego maestria talento
act_attack_melee act_attack_alcance act_attack_distancia act_attack_global act_area act_move act_passo act_swap
act_defend act_heal act_buff act_summon act_push act_pull act_objective act_item act_end_turn act_raise act_swap_weapon
item_sword item_axe item_spear item_hammer item_bow item_crossbow item_staff item_wand item_orb item_bell
item_censer item_dagger item_rapier item_armor_light item_armor_medium item_armor_heavy item_robe
item_accessory_ring item_accessory_amulet item_accessory_boots item_accessory_lens item_consumable_vial item_bomb
item_bandage item_scroll item_cloak_epic
loc_portico loc_galeria loc_claustro loc_scriptorium loc_canil loc_carceres loc_capela loc_salao loc_campanario
loc_relicario loc_cripta map_path map_lock settings pause save load sound_on sound_off music fast_forward skip
log close check info warning back menu
""".split()


def _pow2(n):
    return n > 0 and (n & (n - 1)) == 0


@pytest.fixture(scope="module")
def tex_manifest():
    return json.loads((TEX / "manifest.json").read_text())


@pytest.fixture(scope="module")
def icon_manifest():
    return json.loads((ICO / "manifest.json").read_text())


# --------------------------------------------------------------------------
# textures
# --------------------------------------------------------------------------

def test_texture_manifest_files_exist_and_match(tex_manifest):
    files = tex_manifest["files"]
    listed = {e["file"] for e in files}
    on_disk = {p.name for p in TEX.iterdir() if p.suffix in (".jpg", ".png")}
    assert listed == on_disk, f"manifest/disk mismatch: {listed ^ on_disk}"
    for e in files:
        p = TEX / e["file"]
        assert p.stat().st_size == e["bytes"], e["file"]
        with Image.open(p) as im:
            assert im.size == (e["width"], e["height"]), e["file"]
        assert e["purpose"]
        assert isinstance(e["tileable"], bool)


def test_required_texture_sets_present(tex_manifest):
    names = {e["file"] for e in tex_manifest["files"]}
    for s in REQUIRED_TEXTURE_SETS:
        for kind in ("albedo", "normal", "rough", "ao"):
            assert f"{s}_{kind}.jpg" in names
    for s in REQUIRED_SPRITES:
        assert f"{s}.png" in names


def test_texture_sizes_power_of_two(tex_manifest):
    for e in tex_manifest["files"]:
        assert _pow2(e["width"]) and _pow2(e["height"]), e["file"]
        if e["kind"] in ("albedo", "normal", "rough", "ao", "metal"):
            assert e["width"] == e["height"] and e["width"] in (512, 1024), e["file"]


def test_texture_budget(tex_manifest):
    total = sum(e["bytes"] for e in tex_manifest["files"])
    assert total < 20 * 1024 * 1024, f"textures folder is {total / 1e6:.1f} MB"


def test_sprite_modes(tex_manifest):
    for e in tex_manifest["files"]:
        if e["kind"] != "sprite":
            continue
        with Image.open(TEX / e["file"]) as im:
            if e["file"] == "grain.png":
                assert im.mode == "L"
            else:
                assert im.mode == "RGBA", e["file"]
                a = np.asarray(im)[..., 3]
                assert a.min() < 10 or e["file"] == "ui_parchment_panel.png", f"{e['file']} has no transparency"


def _seam_x(b):
    """Wrap-around step between the last and first column, relative to the
    steps across other JPEG 8x8 block boundaries (the seam is also a block
    boundary, so that is the fair baseline), both image-wide and near the
    seam (so a groove that deliberately sits on the tile edge is judged
    against the slope around it)."""
    n = b.shape[1]
    wrap = np.abs(b[:, 0] - b[:, -1]).mean()

    def step(k):
        return np.abs(b[:, k - 1] - b[:, k]).mean()

    glob = np.mean([step(k) for k in range(8, n, 8)])
    local = np.mean([step(k) for k in (8, 16, n - 16, n - 8)])
    return wrap / (max(glob, local) + 1e-6)


def _seam_ratio(a, normal=False):
    a = np.asarray(a, np.float64)
    if a.ndim == 2:
        a = a[..., None]
    if normal:
        # Only the derivative *along* a seam must be continuous: a V-groove
        # sitting on the tile edge legitimately flips the across-seam slope.
        return _seam_x(a[..., 1:2]), _seam_x(a[..., 0:1].transpose(1, 0, 2))
    return _seam_x(a), _seam_x(a.transpose(1, 0, 2))


def test_tileable_textures_have_no_seams(tex_manifest):
    tile = [e for e in tex_manifest["files"] if e["tileable"]]
    assert len(tile) >= 40
    for e in tile:
        with Image.open(TEX / e["file"]) as im:
            a = np.asarray(im)
        rx, ry = _seam_ratio(a, normal=e["kind"] == "normal")
        assert rx < 1.6 and ry < 1.6, f"{e['file']} seam ratio x={rx:.2f} y={ry:.2f}"


def test_seam_metric_detects_a_real_seam():
    # guard against a metric that always passes: gradients and offset noise are not tileable
    g = np.tile(np.linspace(0, 255, 256), (256, 1))
    assert _seam_ratio(g)[0] > 50
    rng = np.random.default_rng(0)
    from scipy import ndimage

    smooth = ndimage.gaussian_filter(rng.standard_normal((256, 300)), 6, mode="reflect")[:, :256]
    assert max(_seam_ratio(smooth)) > 3


def test_generators_are_periodic_before_compression():
    """Rebuild one small material and check the raw float height directly."""
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_textures as bt

    m = bt.tex_leather(128)
    h = m["height"]
    rx, ry = _seam_ratio(h * 255)
    assert rx < 1.6 and ry < 1.6


def test_normal_maps_are_normalized_and_point_out(tex_manifest):
    for e in tex_manifest["files"]:
        if e["kind"] != "normal":
            continue
        with Image.open(TEX / e["file"]) as im:
            n = np.asarray(im.convert("RGB"), np.float64) / 255.0 * 2 - 1
        length = np.linalg.norm(n, axis=-1)
        assert 0.93 < length.mean() < 1.07, f"{e['file']} mean length {length.mean():.3f}"
        assert n[..., 2].mean() > 0.8, f"{e['file']} mean z {n[..., 2].mean():.3f}"
        assert n[..., 2].min() > 0.0, e["file"]
        # unbiased: a tileable height field has zero mean slope
        assert abs(n[..., 0].mean()) < 0.03 and abs(n[..., 1].mean()) < 0.03, e["file"]


def test_normal_map_is_opengl_convention():
    """A bump in the middle must tilt +Y (green up) on its upper side."""
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from texlib import height_to_normal

    y, x = np.mgrid[0:64, 0:64]
    h = np.exp(-((x - 32) ** 2 + (y - 32) ** 2) / 60.0)
    n = height_to_normal(h, 4.0)
    assert n[24, 32, 1] > 0.1   # above the bump (smaller row) -> faces up (+Y)
    assert n[40, 32, 1] < -0.1
    assert n[32, 24, 0] < -0.1  # left of the bump faces left (-X)


# --------------------------------------------------------------------------
# icons
# --------------------------------------------------------------------------

def test_icon_manifest_covers_required(icon_manifest):
    ids = set(icon_manifest["icons"])
    missing = [i for i in REQUIRED_ICONS if i not in ids]
    assert not missing, missing
    for iid, e in icon_manifest["icons"].items():
        assert (ICO / e["file"]).exists(), iid
        assert e["description"]


@pytest.mark.parametrize("iid", REQUIRED_ICONS)
def test_icon_svg_valid(iid):
    p = ICO / f"{iid}.svg"
    text = p.read_text(encoding="utf-8")
    assert text.isascii(), "icons must be plain ASCII (no emoji or symbols)"
    root = ET.fromstring(text)
    assert root.tag == SVG_NS + "svg"
    assert root.get("viewBox") in ("0 0 24 24", "0 0 48 48")
    assert "currentColor" in text
    assert root.find(f".//{SVG_NS}text") is None
    paths = root.findall(f".//{SVG_NS}path")
    assert paths and all(len(pth.get("d", "")) > 20 for pth in paths)
    # no hard-coded colours that would defeat tinting
    assert not re.search(r"#[0-9a-fA-F]{3,6}\b", text)


def test_sprite_contains_every_icon(icon_manifest):
    root = ET.fromstring((ICO / "icons.svg").read_text(encoding="utf-8"))
    sym = {s.get("id"): s for s in root.findall(f"{SVG_NS}symbol")}
    for iid in list(icon_manifest["icons"]) + REQUIRED_ICONS:
        assert iid in sym, iid
        assert sym[iid].get("viewBox")
        assert "currentColor" in ET.tostring(sym[iid], encoding="unicode")
    assert len(sym) == len(icon_manifest["icons"])


def test_icons_are_distinct():
    seen = {}
    for p in ICO.glob("*.svg"):
        if p.name == "icons.svg":
            continue
        d = ET.fromstring(p.read_text()).find(f".//{SVG_NS}path").get("d")
        assert d not in seen, f"{p.stem} duplicates {seen.get(d)}"
        seen[d] = p.stem
