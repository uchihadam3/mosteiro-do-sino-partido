#!/usr/bin/env python3
"""Build all procedural audio for Mosteiro do Sino Partido.

Usage (from the repo root):
    python3 tools/python/audio/build_audio.py            # build everything
    python3 tools/python/audio/build_audio.py --only music_title,ui_click
    python3 tools/python/audio/build_audio.py --list

Pipeline per asset: synthesise (numpy/scipy) -> master (DC block, loudness target,
look-ahead limiter; loops are processed circularly) -> write float WAV (loops get
0.5 s of wrapped pre/post-roll) -> encode MP3 with ffmpeg/libmp3lame -> decode the
MP3 again with ffmpeg to measure exact duration, loop points and levels -> manifest.json.

Everything is deterministic: every asset seed is derived from its id (CRC32).
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from sinosynth.core import SR, db, rms, peak, undb, dc_block, limiter, n_of, low_shelf, high_shelf  # noqa: E402
from sinosynth.registry import load_all, REGISTRY  # noqa: E402
from sinosynth.sfx import trim_tail  # noqa: E402

REPO = HERE.parents[2]
OUT_DIR = REPO / "apps" / "web" / "public" / "assets" / "audio"
MANIFEST = OUT_DIR / "manifest.json"
FFMPEG = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
LOOP_PAD = 0.5  # seconds of wrapped pre/post-roll around loops
LICENSE = ("Original audio synthesised from scratch by project code (tools/python/audio). No samples, "
           "recordings or third-party material. Dedicated to the public domain under CC0 1.0 / project-owned.")

TARGETS = {
    # category: (target RMS dBFS or None, ceiling dBFS)
    "music": (-20.0, -1.0),
    "ambience": (-26.0, -3.0),
    "sting": (-17.0, -1.0),
    "ui": (None, -3.0),
    "sfx": (None, -1.3),
}


def asset_seed(aid: str) -> int:
    return zlib.crc32(aid.encode("utf-8")) & 0x7FFFFFFF


def circ(fn, y, pad_s=1.0):
    """Apply a (possibly non-causal) process circularly: pad both ends with wrapped audio."""
    n = y.shape[0]
    p = min(n, n_of(pad_s))
    ext = np.concatenate([y[n - p:], y, y[:p]], axis=0)
    return fn(ext)[p:p + n]


def master(a, y):
    y = np.asarray(y, dtype=np.float64)
    if not a.stereo and y.ndim == 2:
        y = y.mean(axis=1)
    if a.stereo and y.ndim == 1:
        y = np.stack([y, y], axis=1)
    if not np.all(np.isfinite(y)):
        raise ValueError(f"{a.id}: non-finite samples")
    target, ceil = TARGETS[a.category]
    if a.target_rms_db is not None:
        target = a.target_rms_db
    if a.category in ("music", "sting"):
        # gentle bus tilt: tame sub build-up, a little air/presence for small speakers
        def bus_eq(v):
            return high_shelf(low_shelf(v, 110, -3.0), 3200, 2.5)
        y = circ(bus_eq, y, 1.0) if a.loop else bus_eq(y)
    if a.loop:
        y = circ(dc_block, y, 2.0)
        y = y * (undb(target) / rms(y))
        y = circ(lambda v: limiter(v, ceil), y, 0.5)
    else:
        y = dc_block(y)
        if a.category == "ui":  # UI sounds: keep tails short and out of the way
            y = trim_tail(y, -50.0, margin=0.02)
            k = min(y.shape[0] // 3, n_of(0.06))
            y[-k:] *= np.linspace(1, 0, k) ** 2
        if target is not None:
            y = y * (undb(target) / rms(y))
            y = limiter(y, ceil)
        else:
            y = y * (undb(ceil) / peak(y))
        # tiny fades so nothing clicks
        k = min(y.shape[0] // 4, n_of(0.0015))
        r = np.linspace(0, 1, k)
        if y.ndim == 2:
            r = r[:, None]
        y[:k] *= r
        k2 = min(y.shape[0] // 4, n_of(0.01))
        r2 = np.linspace(1, 0, k2)
        if y.ndim == 2:
            r2 = r2[:, None]
        y[-k2:] *= r2
    y[np.abs(y) < 1e-20] = 0.0  # flush denormals
    return y


def ffdecode(path: Path, channels: int) -> np.ndarray:
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-f", "f32le", "-ac", str(channels), "-ar",
                          str(SR), "-"], check=True, capture_output=True).stdout
    x = np.frombuffer(out, dtype="<f4").astype(np.float64)
    return x.reshape(-1, channels) if channels > 1 else x


def find_offset(orig, dec, max_lag=4000, seg_s=3.0):
    """Lag d such that dec[n + d] ~= orig[n] (FFT cross-correlation on a mono fold-down)."""
    o = orig.mean(axis=1) if orig.ndim == 2 else orig
    d = dec.mean(axis=1) if dec.ndim == 2 else dec
    s0 = n_of(0.05)
    seg = o[s0:s0 + n_of(seg_s)]
    win = d[max(0, s0 - max_lag):s0 + n_of(seg_s) + max_lag]
    nfft = 1 << int(np.ceil(np.log2(win.shape[0] + seg.shape[0])))
    c = np.fft.irfft(np.fft.rfft(win, nfft) * np.conj(np.fft.rfft(seg, nfft)), nfft)
    base = max(0, s0 - max_lag)
    lags = np.arange(nfft)
    lags = np.where(lags > nfft // 2, lags - nfft, lags)
    valid = (lags + base - s0 >= -max_lag) & (lags + base - s0 <= max_lag)
    best = lags[valid][np.argmax(c[valid])]
    return int(best + base - s0)


def build_one(aid: str, tmp: str):
    REG = load_all()
    a = REG[aid]
    t0 = time.time()
    y = a.fn(asset_seed(aid))
    y = master(a, y)
    ch = 2 if a.stereo else 1
    if a.loop:
        L = y.shape[0]
        p = n_of(LOOP_PAD)
        ext = np.concatenate([y[L - p:], y, y[:p]], axis=0)
    else:
        L, p, ext = y.shape[0], 0, y
    wav = Path(tmp) / f"{aid}.wav"
    sf.write(str(wav), ext.astype(np.float32), SR, subtype="FLOAT")
    mp3 = OUT_DIR / f"{aid}.mp3"
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", a.bitrate,
                    "-ar", str(SR), "-ac", str(ch), "-map_metadata", "-1", "-fflags", "+bitexact",
                    "-flags:a", "+bitexact", str(mp3)], check=True)
    dec = ffdecode(mp3, ch)
    off = find_offset(ext, dec) if a.loop else 0
    entry = {
        "file": mp3.name,
        "category": a.category,
        "duration": round(dec.shape[0] / SR, 4),
        "loop": bool(a.loop),
        "loopStart": round((p + off) / SR, 6) if a.loop else 0.0,
        "loopEnd": round((p + off + L) / SR, 6) if a.loop else round(dec.shape[0] / SR, 4),
        "gainDb": a.playback_gain_db,
        "description": a.description,
        "channels": ch,
        "sampleRate": SR,
        "bitrate": a.bitrate,
        "peakDb": round(db(peak(dec)), 2),
        "rmsDb": round(db(rms(dec)), 2),
    }
    if a.loop:
        entry["loopSamples"] = int(L)
        entry["loopStartSample"] = int(p + off)
    if a.bpm:
        entry["bpm"] = a.bpm
    if a.group:
        entry["group"] = a.group
    if not os.environ.get("KEEP_WAV"):
        wav.unlink(missing_ok=True)
    return aid, entry, time.time() - t0, off


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma separated asset ids (merged into existing manifest)")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--tmp", default=os.environ.get("MOSTEIRO_AUDIO_TMP"), help="intermediate WAV dir")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    REG = load_all()
    if args.list:
        for k, a in REG.items():
            print(f"{k:28s} {a.category:9s} {'loop' if a.loop else '':5s} {a.description}")
        return
    ids = list(REG)
    if args.only:
        ids = [s.strip() for s in args.only.split(",") if s.strip()]
        for i in ids:
            if i not in REG:
                sys.exit(f"unknown asset id: {i}")
    ids.sort(key=lambda i: -REG[i].cost)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = args.tmp or tempfile.mkdtemp(prefix="mosteiro_audio_")
    Path(tmp).mkdir(parents=True, exist_ok=True)

    manifest = {"version": 1, "generator": "tools/python/audio/build_audio.py", "license": LICENSE, "assets": {}}
    if args.only and MANIFEST.exists():
        manifest["assets"] = json.loads(MANIFEST.read_text()).get("assets", {})
    t_start = time.time()
    results = {}
    ctx = mp.get_context("fork") if "fork" in mp.get_all_start_methods() else mp.get_context()
    with ctx.Pool(processes=max(1, args.jobs), maxtasksperchild=6) as pool:
        for aid, entry, dt, off in pool.imap_unordered(_job, [(i, tmp) for i in ids], chunksize=1):
            results[aid] = entry
            print(f"  {aid:28s} {entry['duration']:7.2f}s  peak {entry['peakDb']:6.1f}  rms {entry['rmsDb']:6.1f}"
                  f"  off {off:+d}  ({dt:5.1f}s)", flush=True)
    manifest["assets"].update(results)
    # keep only assets that are still registered, in registry order
    manifest["assets"] = {k: manifest["assets"][k] for k in REG if k in manifest["assets"]}
    groups = {}
    for k, e in manifest["assets"].items():
        if "group" in e:
            groups.setdefault(e["group"], []).append(k)
    manifest["groups"] = groups
    manifest["notes"] = ("Loops: play with an AudioBufferSourceNode, loop=true, loopStart/loopEnd (seconds, measured "
                         "on the decoded MP3); start playback at offset=loopStart. The file contains 0.5 s of "
                         "wrapped pre/post-roll so the loop stays seamless even if a decoder adds/strips a few ms "
                         "of encoder padding. gainDb is the suggested playback gain for the category mix.")
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    # remove stale mp3 files not in the manifest
    keep = {e["file"] for e in manifest["assets"].values()}
    for f in OUT_DIR.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.mp3"))
    print(f"built {len(results)} assets in {time.time() - t_start:.1f}s; folder total {total / 1e6:.2f} MB")


def _job(arg):
    return build_one(*arg)


if __name__ == "__main__":
    main()
