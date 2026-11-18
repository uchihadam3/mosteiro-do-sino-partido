"""pytest suite for the procedural GLB kit.

    python -m pytest tools/python/models/test_models.py -q
"""
from __future__ import annotations

import json
import os
import struct
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import audit_models  # noqa: E402
import build_models  # noqa: E402
from gltf_io import ALLOWED_MATERIALS, accessor, read_glb, write_glb  # noqa: E402
from meshlib import Node, cbox, lathe, signed_volume, sweep, circle, earclip  # noqa: E402

MODELS = audit_models.MODELS_DIR
MANIFEST = os.path.join(MODELS, "manifest.json")
REQUIRED_IDS = [p[0] for p in build_models.PIECES]
SPEC_MATERIALS = {"stone_floor", "stone_wall", "stone_plate", "wood_dark", "bronze_aged", "iron_rusted",
                  "cloth_wool", "parchment", "wax", "leather", "stained_glass", "flame"}


@pytest.fixture(scope="session")
def manifest():
    if not os.path.exists(MANIFEST):
        build_models.build(verbose=False)
    return json.load(open(MANIFEST))


def glb_files(manifest):
    return [os.path.join(MODELS, m["file"]) for m in manifest["models"]]


# ---------------------------------------------------------------- library
def test_primitives_are_outward_and_closed():
    assert signed_volume(cbox(1, 2, 3, 0.1)) > 0
    assert signed_volume(lathe([(0, 0), (1, 0), (1, 1), (0, 1)], 24)) > 0
    tube = sweep(circle(0.1, 8), np.c_[circle(1, 24), np.zeros(24)], closed_path=True)
    assert signed_volume(tube) > 0


def test_earclip_concave():
    poly = [(0, 0), (2, 0), (2, 2), (1, 0.5), (0, 2)]
    tris = earclip(poly)
    assert len(tris) == 3
    p = np.array(poly)
    def tri_area(a, b, c):
        u, v = p[b] - p[a], p[c] - p[a]
        return 0.5 * abs(u[0] * v[1] - u[1] * v[0])

    area = sum(tri_area(a, b, c) for a, b, c in tris)
    x, y = p[:, 0], p[:, 1]
    shoelace = 0.5 * abs(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))
    assert area == pytest.approx(shoelace)


def test_writer_roundtrip(tmp_path):
    root = Node("unit_box")
    root.add("stone_wall", cbox(2, 1, 1, 0.05, bottom=True))
    root.anchor("unit_box_light_anchor", (0, 1, 0))
    path = tmp_path / "unit_box.glb"
    st = write_glb(str(path), root, default_uv_scale={"stone_wall": 2.0})
    js, binc, _ = read_glb(str(path))
    assert st["triangles"] > 12
    pr = js["meshes"][0]["primitives"][0]
    pos = accessor(js, binc, pr["attributes"]["POSITION"])
    assert pos[:, 1].min() == pytest.approx(0.0, abs=1e-6)
    assert js["nodes"][1]["name"] == "unit_box_light_anchor" and "mesh" not in js["nodes"][1]


# ---------------------------------------------------------------- manifest
def test_manifest_lists_every_required_piece(manifest):
    ids = [m["id"] for m in manifest["models"]]
    for rid in REQUIRED_IDS:
        assert rid in ids, rid
    assert "chain_short" in ids


def test_manifest_files_exist(manifest):
    for m in manifest["models"]:
        p = os.path.join(MODELS, m["file"])
        assert os.path.isfile(p), p
        assert m["bytes"] == os.path.getsize(p)
        assert set(m) >= {"id", "file", "triangles", "bounds", "origin", "materials", "use"}


def test_folder_size(manifest):
    total = sum(os.path.getsize(p) for p in glb_files(manifest))
    assert total < 8 * 1024 * 1024


# ---------------------------------------------------------------- per file
def _ids():
    if os.path.exists(MANIFEST):
        return [m["id"] for m in json.load(open(MANIFEST))["models"]]
    return REQUIRED_IDS


@pytest.mark.parametrize("pid", _ids())
def test_glb_container(pid):
    path = os.path.join(MODELS, pid + ".glb")
    data = open(path, "rb").read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and length == len(data)
    jl, jt = struct.unpack_from("<I4s", data, 12)
    assert jt == b"JSON" and jl % 4 == 0
    json.loads(data[20:20 + jl])
    off = 20 + jl
    bl, bt = struct.unpack_from("<I4s", data, off)
    assert bt == b"BIN\0" and bl % 4 == 0 and off % 4 == 0
    assert off + 8 + bl == len(data)


@pytest.mark.parametrize("pid", _ids())
def test_glb_content(pid, manifest):
    entry = next(m for m in manifest["models"] if m["id"] == pid)
    path = os.path.join(MODELS, entry["file"])
    js, binc, _ = read_glb(path)
    tris = 0
    for mesh in js["meshes"]:
        assert mesh.get("name")
        for pr in mesh["primitives"]:
            at = pr["attributes"]
            assert {"POSITION", "NORMAL", "TEXCOORD_0"} <= set(at)
            acc = js["accessors"][at["POSITION"]]
            assert "min" in acc and "max" in acc
            pos = accessor(js, binc, at["POSITION"])
            assert np.isfinite(pos).all()
            assert np.allclose(pos.max(0), acc["max"], atol=1e-5)
            idx = accessor(js, binc, pr["indices"])
            assert idx.max() < len(pos)
            tris += len(idx) // 3
    assert tris == entry["triangles"]
    assert tris <= entry["budget"], f"{pid}: {tris} > {entry['budget']}"
    for m in js["materials"]:
        assert m["name"] in SPEC_MATERIALS
        assert m["name"] in ALLOWED_MATERIALS
        assert "pbrMetallicRoughness" in m
    assert "images" not in js and "textures" not in js
    root = js["nodes"][js["scenes"][0]["nodes"][0]]
    assert root["name"] == pid


@pytest.mark.parametrize("pid", _ids())
def test_audit_passes(pid, manifest):
    entry = next(m for m in manifest["models"] if m["id"] == pid)
    rep = audit_models.audit_file(os.path.join(MODELS, entry["file"]), entry["budget"])
    assert not rep["errors"], rep["errors"]


def test_budget_classes(manifest):
    caps = {"small": 2000, "medium": 6000, "hero": 15000, "plate": 1000, "architecture": 10000}
    for m in manifest["models"]:
        assert m["budget"] == caps[m["budget_class"]]
    hero = {m["id"] for m in manifest["models"] if m["budget_class"] == "hero"}
    assert hero == {"bell_great_cracked", "altar", "bell_frame"}


def test_special_nodes(manifest):
    def names(pid):
        js, _, _ = read_glb(os.path.join(MODELS, pid + ".glb"))
        return {n["name"]: n for n in js["nodes"]}

    d = names("doorway_gothic")
    assert d["door_L"]["translation"][0] < 0 < d["door_R"]["translation"][0]
    w = names("wall_window_lancet")
    js, _, _ = read_glb(os.path.join(MODELS, "wall_window_lancet.glb"))
    glass_mesh = js["meshes"][w["window_glass"]["mesh"]]
    assert js["materials"][glass_mesh["primitives"][0]["material"]]["name"] == "stained_glass"
    b = names("bell_great_cracked")
    assert "bell_clapper" in b and b["bell_clapper"]["translation"][1] > 1.5
    c = names("reliquary_chest")
    assert "chest_lid" in c and "chest_teeth" in c
    assert any(n.endswith("_flame_anchor") for n in names("candle_cluster"))
    assert sum(n.endswith("_flame_anchor") for n in names("candle_cluster")) >= 5
    assert any(n.endswith("_light_anchor") for n in names("brazier"))
    assert any(n.endswith("_light_anchor") for n in names("torch_sconce"))
    for pid, kids in (("rubble_pile", "abcd"), ("counterweight", "abc")):
        nn = names(pid)
        for k in kids:
            assert f"{pid.split('_')[0]}_{k}" in nn


def test_scale_conventions(manifest):
    size = {m["id"]: m["bounds"]["size"] for m in manifest["models"]}
    assert 6.0 <= size["pillar_gothic"][1] <= 8.0
    assert 2.0 <= size["bell_great_cracked"][1] <= 2.4
    assert 2.3 <= size["pew"][0] <= 2.7
    assert size["formation_plate"][0] == pytest.approx(1.6, abs=0.02)
    assert size["formation_plate"][2] == pytest.approx(1.2, abs=0.02)
    assert size["wall_segment_4m"][0] == pytest.approx(4.0, abs=0.02)
    assert size["wall_segment_4m"][1] == pytest.approx(7.0, abs=0.02)
    assert 0.2 <= size["bell_small"][1] <= 0.3
    for m in manifest["models"]:
        lo = m["bounds"]["min"]
        if m["origin"].startswith("bottom_center") and m["id"] not in ("well_dry",):
            assert lo[1] >= -0.02, m["id"]
