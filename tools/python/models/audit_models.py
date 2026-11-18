"""Audit every GLB in apps/web/public/assets/models against the kit conventions.

    python tools/python/models/audit_models.py          # human report, exit 1 on errors
    python tools/python/models/audit_models.py --json   # machine-readable

Checks: GLB container (magic, version 2, chunk order/alignment, declared length),
JSON integrity (accessor/bufferView ranges), POSITION min/max, finite data,
unit normals, TEXCOORD_0 present, index ranges, triangle budget, naming
convention (root node == file id, snake_case nodes, named meshes), PBR
materials from the allowed id list, no embedded textures, anchors are empty
nodes, bounds sanity and the total folder size.
"""
from __future__ import annotations

import json
import os
import re
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gltf_io import ALLOWED_MATERIALS, accessor, read_glb, world_primitives  # noqa: E402

MODELS_DIR = os.path.normpath(os.path.join(HERE, "../../../apps/web/public/assets/models"))
NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
MAX_FOLDER_BYTES = 8 * 1024 * 1024
ANCHOR_REQUIRED = {  # pieces that must expose attachment points
    "candle_cluster": "_flame_anchor", "candelabra": "_flame_anchor", "altar": "_flame_anchor",
    "torch_sconce": "_light_anchor", "brazier": "_light_anchor", "wall_window_lancet": "_light_anchor",
    "pillar_candle_stand": "_flame_anchor", "desk_scribe": "_flame_anchor",
}
REQUIRED_NODES = {
    "doorway_gothic": ["door_L", "door_R"], "wall_window_lancet": ["window_glass"],
    "bell_great_cracked": ["bell_clapper"], "reliquary_chest": ["chest_lid", "chest_teeth"],
    "rubble_pile": ["rubble_a", "rubble_b", "rubble_c", "rubble_d"],
    "counterweight": ["counterweight_a", "counterweight_b", "counterweight_c"],
}
CASE_EXEMPT = {"door_L", "door_R"}  # names fixed by the game spec


def check_container(path):
    errs = []
    with open(path, "rb") as f:
        data = f.read()
    if len(data) < 28:
        return ["file too small"]
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        errs.append("bad magic")
    if version != 2:
        errs.append(f"version {version} != 2")
    if length != len(data):
        errs.append("declared length mismatch")
    jl, jt = struct.unpack_from("<I4s", data, 12)
    if jt != b"JSON":
        errs.append("first chunk is not JSON")
    if jl % 4:
        errs.append("JSON chunk not 4-byte aligned")
    off = 20 + jl
    if off + 8 > len(data):
        errs.append("missing BIN chunk")
    else:
        bl, bt = struct.unpack_from("<I4s", data, off)
        if bt != b"BIN\0":
            errs.append("second chunk is not BIN")
        if bl % 4 or off % 4:
            errs.append("BIN chunk not 4-byte aligned")
        if off + 8 + bl != len(data):
            errs.append("BIN chunk length mismatch")
    return errs


def audit_file(path, budget=None):
    pid = os.path.splitext(os.path.basename(path))[0]
    errs, warns = check_container(path), []
    if errs:
        return {"id": pid, "errors": errs, "warnings": warns}
    js, binc, _ = read_glb(path)
    if js.get("asset", {}).get("version") != "2.0":
        errs.append("asset.version must be 2.0")
    if js.get("images") or js.get("textures") or js.get("samplers"):
        errs.append("textures must not be embedded (bound by material name in game)")
    if len(js.get("buffers", [])) != 1 or "uri" in js["buffers"][0]:
        errs.append("expected exactly one embedded GLB buffer")
    elif js["buffers"][0]["byteLength"] > len(binc):
        errs.append("buffer byteLength exceeds BIN chunk")
    for i, v in enumerate(js.get("bufferViews", [])):
        if v.get("byteOffset", 0) + v["byteLength"] > len(binc):
            errs.append(f"bufferView {i} out of range")
        if v.get("byteOffset", 0) % 4:
            errs.append(f"bufferView {i} not 4-byte aligned")
    # nodes / names
    nodes = js.get("nodes", [])
    roots = js["scenes"][js.get("scene", 0)]["nodes"]
    if len(roots) != 1 or nodes[roots[0]].get("name") != pid:
        errs.append(f"scene must have a single root node named '{pid}'")
    names = [n.get("name", "") for n in nodes]
    for nm in names:
        if not nm:
            errs.append("unnamed node")
        elif nm not in CASE_EXEMPT and not NAME_RE.match(nm):
            errs.append(f"node name not snake_case: {nm}")
    if len(set(names)) != len(names):
        errs.append("duplicate node names")
    for m in js.get("meshes", []):
        if not m.get("name"):
            errs.append("unnamed mesh")
    for nd in nodes:
        nm = nd.get("name", "")
        if nm.endswith("_anchor") and ("mesh" in nd or nd.get("children")):
            errs.append(f"anchor {nm} must be an empty leaf node")
    for req in REQUIRED_NODES.get(pid, []):
        if req not in names:
            errs.append(f"missing required node {req}")
    suffix = ANCHOR_REQUIRED.get(pid)
    if suffix and not any(n.endswith(suffix) for n in names):
        errs.append(f"missing *{suffix} node")
    # materials
    mats = js.get("materials", [])
    for m in mats:
        nm = m.get("name")
        if nm not in ALLOWED_MATERIALS:
            errs.append(f"material id not allowed: {nm}")
        pbr = m.get("pbrMetallicRoughness")
        if not pbr or "baseColorFactor" not in pbr or "metallicFactor" not in pbr or "roughnessFactor" not in pbr:
            errs.append(f"material {nm} lacks PBR factors")
    # primitives
    tris = 0
    for m in js.get("meshes", []):
        for pr in m["primitives"]:
            at = pr["attributes"]
            for key in ("POSITION", "NORMAL", "TEXCOORD_0"):
                if key not in at:
                    errs.append(f"{m['name']}: missing {key}")
            if "indices" not in pr or "material" not in pr:
                errs.append(f"{m['name']}: primitive needs indices and material")
                continue
            if pr.get("mode", 4) != 4:
                errs.append(f"{m['name']}: primitives must be triangles")
            pa = js["accessors"][at["POSITION"]]
            if "min" not in pa or "max" not in pa:
                errs.append(f"{m['name']}: POSITION accessor needs min/max")
            pos = accessor(js, binc, at["POSITION"])
            nrm = accessor(js, binc, at["NORMAL"])
            uv = accessor(js, binc, at["TEXCOORD_0"]) if "TEXCOORD_0" in at else np.zeros((len(pos), 2))
            idx = accessor(js, binc, pr["indices"])
            for nm, arr in (("POSITION", pos), ("NORMAL", nrm), ("TEXCOORD_0", uv)):
                if not np.isfinite(arr).all():
                    errs.append(f"{m['name']}: non-finite {nm}")
            if "min" in pa and not np.allclose(pos.min(0), pa["min"], atol=1e-5):
                errs.append(f"{m['name']}: POSITION min mismatch")
            ln = np.linalg.norm(nrm, axis=1)
            if np.abs(ln - 1).max() > 1e-3:
                errs.append(f"{m['name']}: normals not unit length")
            if idx.max() >= len(pos):
                errs.append(f"{m['name']}: index out of range")
            if len(idx) % 3:
                errs.append(f"{m['name']}: index count not a multiple of 3")
            if np.ptp(uv, axis=0).max() < 1e-6:
                warns.append(f"{m['name']}: degenerate UVs")
            tris += len(idx) // 3
    if budget is not None and tris > budget:
        errs.append(f"triangle budget exceeded: {tris} > {budget}")
    pts = np.concatenate([p[2] for p in world_primitives(js, binc)])
    lo, hi = pts.min(0), pts.max(0)
    size = hi - lo
    if size.max() > 12 or size.max() < 0.05:
        warns.append(f"suspicious size {np.round(size, 2)}")
    if hi[1] <= 0:
        errs.append("geometry entirely below y=0")
    return {"id": pid, "errors": errs, "warnings": warns, "triangles": tris, "bytes": os.path.getsize(path),
            "bounds": [lo.round(3).tolist(), hi.round(3).tolist()], "materials": sorted(m["name"] for m in mats)}


def audit_all(models_dir=MODELS_DIR):
    man_path = os.path.join(models_dir, "manifest.json")
    report = {"files": [], "errors": [], "warnings": []}
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {"models": []}
    if not manifest["models"]:
        report["errors"].append("manifest.json missing or empty")
    budgets = {m["id"]: m.get("budget") for m in manifest["models"]}
    listed = {m["file"] for m in manifest["models"]}
    on_disk = sorted(f for f in os.listdir(models_dir) if f.endswith(".glb"))
    for f in sorted(listed - set(on_disk)):
        report["errors"].append(f"manifest lists missing file {f}")
    for f in sorted(set(on_disk) - listed):
        report["warnings"].append(f"{f} not listed in manifest")
    total = 0
    for f in on_disk:
        r = audit_file(os.path.join(models_dir, f), budgets.get(f[:-4]))
        total += os.path.getsize(os.path.join(models_dir, f))
        m = next((m for m in manifest["models"] if m["file"] == f), None)
        if m and "triangles" in r and m["triangles"] != r["triangles"]:
            r["errors"].append("manifest triangle count is stale")
        report["files"].append(r)
    report["total_bytes"] = total
    if total > MAX_FOLDER_BYTES:
        report["errors"].append(f"models folder {total / 1e6:.2f} MB exceeds 8 MB")
    return report


def main():
    rep = audit_all()
    if "--json" in sys.argv:
        print(json.dumps(rep, indent=2))
    else:
        for r in rep["files"]:
            status = "FAIL" if r["errors"] else "ok  "
            print(f"{status} {r['id']:22s} {r.get('triangles', 0):6d} tris {r.get('bytes', 0) / 1024:7.1f} KB "
                  f"{','.join(r.get('materials', []))}")
            for e in r["errors"]:
                print(f"      ERROR {e}")
            for w in r["warnings"]:
                print(f"      warn  {w}")
        for e in rep["errors"]:
            print("ERROR", e)
        for w in rep["warnings"]:
            print("warn ", w)
        print(f"{len(rep['files'])} files, {rep['total_bytes'] / 1e6:.2f} MB total")
    bad = rep["errors"] or any(r["errors"] for r in rep["files"])
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
