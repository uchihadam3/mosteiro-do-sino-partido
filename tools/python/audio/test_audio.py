"""Tests for the procedural audio build (run after build_audio.py).

    python3 -m pytest tools/python/audio/test_audio.py -q
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

REPO = HERE.parents[2]
AUDIO = REPO / "apps" / "web" / "public" / "assets" / "audio"
MANIFEST = AUDIO / "manifest.json"
SR = 44100
SIZE_BUDGET_MB = 25.0

REQUIRED = """
music_title music_explore music_base music_combat music_miniboss music_boss
sting_victory sting_defeat sting_secret sting_boss_intro sting_reward
amb_cloister_wind amb_torches_fire amb_chains_creak amb_chapel_drone amb_scriptorium amb_kennel amb_belltower
ui_hover ui_click ui_confirm ui_cancel ui_open ui_close ui_page ui_error ui_coin ui_equip ui_unlock
ui_select_tempo_rapido ui_select_tempo_tatico ui_select_tempo_pesado turn_start cycle_start intent_reveal
dice_roll dice_land dice_fail dice_success dice_impulse dice_critical
swing_light swing_heavy hit_metal hit_metal_heavy hit_flesh hit_blunt hit_wood_shield block_shield armor_absorb
guard_gain guard_break miss_whoosh bow_draw bow_release arrow_impact crossbow_shot bolt_impact
spell_arcane_cast spell_arcane_impact rune_place teleport holy_cast holy_impact heal bless profane_hit
cond_poison cond_bleed cond_burn cond_stun cond_immobilize cond_exposed cond_broken cond_cleanse
step_stone_1 step_stone_2 dash push_impact body_fall rise_up death_enemy enemy_spawn
bell_toll_short bell_toll_long bell_great_cracked resonance_up chant_note dog_snarl chain_rattle
counterweight_drop door_stone whoosh_transition page_turn level_up
""".split()

# expected (min, max) seconds: loop length for loops, file duration otherwise
RANGES = {
    "music_title": (80, 100), "music_explore": (90, 120), "music_base": (70, 95), "music_combat": (60, 70),
    "music_miniboss": (55, 70), "music_boss": (70, 95),
    "sting_victory": (5, 7), "sting_defeat": (7, 9), "sting_secret": (4, 6), "sting_boss_intro": (3, 5),
    "sting_reward": (2, 4),
    "cycle_start": (1, 8), "bell_toll_long": (5, 14), "bell_great_cracked": (6, 16),
}
CAT_RANGES = {"ambience": (30, 60), "ui": (0.05, 3.0), "sfx": (0.1, 8.0)}


def load_manifest():
    if not MANIFEST.exists():
        pytest.skip("manifest.json missing - run tools/python/audio/build_audio.py first")
    return json.loads(MANIFEST.read_text())


MAN = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"assets": {}}
IDS = list(MAN["assets"])
_cache: dict[str, np.ndarray] = {}


def decode(aid: str) -> np.ndarray:
    if aid in _cache:
        return _cache[aid]
    e = MAN["assets"][aid]
    path = AUDIO / e["file"]
    try:
        import soundfile as sf

        x, sr = sf.read(str(path), dtype="float64", always_2d=False)
        assert sr == SR
    except Exception:  # pragma: no cover - fallback when libsndfile lacks mp3
        ff = shutil.which("ffmpeg")
        if not ff:
            pytest.skip("no MP3 decoder available")
        out = subprocess.run([ff, "-v", "error", "-i", str(path), "-f", "f32le", "-ar", str(SR), "-"],
                             check=True, capture_output=True).stdout
        x = np.frombuffer(out, "<f4").astype(np.float64)
        if e["channels"] == 2:
            x = x.reshape(-1, 2)
    _cache[aid] = x
    return x


def mono(x):
    return x.mean(axis=1) if x.ndim == 2 else x


# ---------------------------------------------------------------------------
# manifest
# ---------------------------------------------------------------------------

def test_manifest_schema():
    m = load_manifest()
    assert m["version"] == 1
    assert m["generator"] == "tools/python/audio/build_audio.py"
    assert "CC0" in m["license"] or "original" in m["license"].lower()
    for aid, e in m["assets"].items():
        for key in ("file", "category", "duration", "loop", "loopStart", "loopEnd", "gainDb", "description"):
            assert key in e, (aid, key)
        assert e["file"] == f"{aid}.mp3"
        assert e["category"] in ("music", "sting", "ambience", "ui", "sfx")
        assert e["description"]
        assert 0 <= e["loopStart"] < e["loopEnd"] <= e["duration"] + 1e-3, aid
        if e["loop"]:
            assert e["category"] in ("music", "ambience")
            assert e["loopStart"] > 0.2 and e["duration"] - e["loopEnd"] > 0.2, "loop needs wrapped pre/post-roll"
            assert abs((e["loopEnd"] - e["loopStart"]) * SR - e["loopSamples"]) < 2


def test_required_ids_present():
    m = load_manifest()
    missing = [i for i in REQUIRED if i not in m["assets"]]
    assert not missing, missing


def test_music_loops_and_bpm():
    m = load_manifest()["assets"]
    for aid, e in m.items():
        if e["category"] in ("music", "ambience"):
            assert e["loop"], aid
        if e["category"] in ("sting", "ui", "sfx"):
            assert not e["loop"], aid
    assert 84 <= m["music_combat"]["bpm"] <= 92


def test_size_budget():
    load_manifest()
    total = sum(f.stat().st_size for f in AUDIO.glob("*.mp3"))
    assert total / 1e6 < SIZE_BUDGET_MB, f"{total / 1e6:.1f} MB"
    for aid, e in MAN["assets"].items():
        assert (AUDIO / e["file"]).exists(), aid


# ---------------------------------------------------------------------------
# per-file signal checks
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("aid", IDS)
def test_decodes_and_levels(aid):
    e = MAN["assets"][aid]
    x = decode(aid)
    assert np.all(np.isfinite(x)), "NaN/inf"
    assert x.ndim == (2 if e["channels"] == 2 else 1)
    if e["category"] in ("music", "sting", "ambience"):
        assert x.ndim == 2, "music/ambience must be stereo"
    dur = x.shape[0] / SR
    assert abs(dur - e["duration"]) < 0.05
    pk = np.max(np.abs(x))
    assert pk < 1.0, f"clipping: peak {20 * np.log10(pk):.2f} dBFS"
    rms = np.sqrt(np.mean(x ** 2))
    assert 20 * np.log10(rms + 1e-12) > -45, "silent / too quiet"
    assert abs(np.mean(mono(x))) < 2e-3, "DC offset"
    # no hard click at the very start / end of one-shots
    if not e["loop"]:
        m = mono(x)
        assert np.abs(m[:8]).max() < 0.2
        assert np.abs(m[-8:]).max() < 0.02


@pytest.mark.parametrize("aid", IDS)
def test_duration_range(aid):
    e = MAN["assets"][aid]
    length = e["loopEnd"] - e["loopStart"] if e["loop"] else e["duration"]
    lo, hi = RANGES.get(aid, CAT_RANGES.get(e["category"], (0.05, 120)))
    assert lo <= length <= hi, f"{aid}: {length:.2f}s not in [{lo}, {hi}]"


def test_category_loudness():
    m = MAN["assets"]
    if not m:
        pytest.skip("no manifest")
    for aid, e in m.items():
        x = decode(aid)
        if e["loop"]:
            a, b = int(round(e["loopStart"] * SR)), int(round(e["loopEnd"] * SR))
            r = 20 * np.log10(np.sqrt(np.mean(x[a:b] ** 2)))
            lo, hi = (-23.0, -18.0) if e["category"] == "music" else (-31.0, -23.0)
            assert lo < r < hi, (aid, r)
        elif e["category"] in ("ui", "sfx"):
            p = 20 * np.log10(np.max(np.abs(x)))
            assert -6.0 < p < -0.1, (aid, p)


LOOP_IDS = [a for a in IDS if MAN["assets"][a]["loop"]]


@pytest.mark.parametrize("aid", LOOP_IDS)
def test_loop_seam(aid):
    """The audio right after loopEnd must equal the audio right after loopStart, and the jump when
    wrapping must be no bigger than ordinary sample-to-sample motion. Checked also with the loop
    window shifted by +-1 MP3 frame of encoder delay, to cover decoders that don't honour gapless info."""
    e = MAN["assets"][aid]
    x = decode(aid)
    m = mono(x)
    ls = int(round(e["loopStart"] * SR))
    le = int(round(e["loopEnd"] * SR))
    w = 4096
    local = np.abs(np.diff(m[le - SR // 2:le]))
    step_ref = np.percentile(local, 99.9) + 1e-6
    for shift in (0, -1105, 1105, -2257):
        a, b = ls + shift, le + shift
        A = x[b - w:b + w]
        B = x[a - w:a + w]
        err = np.sqrt(np.mean((A - B) ** 2)) / (np.sqrt(np.mean(A ** 2)) + 1e-9)
        assert err < 0.35, f"{aid}: seam mismatch {err:.3f} at shift {shift}"
        jump = abs(m[a] - m[b - 1])
        assert jump <= 2.0 * step_ref, f"{aid}: seam jump {jump:.4f} vs local {step_ref:.4f} (shift {shift})"


# ---------------------------------------------------------------------------
# synthesis library checks (fast)
# ---------------------------------------------------------------------------

def test_bell_partials():
    from sinosynth.core import spectrum_peaks, hz
    from sinosynth.instruments import bell

    f0 = hz("D4")
    y = bell(f0, 4.0, seed=1)
    pk = spectrum_peaks(y, fmin=100, fmax=2000, n_peaks=12, start=0.05, dur=2.0)
    ratios = [f / f0 for f, _ in pk]
    for want in (0.5, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0):
        assert min(abs(r - want) for r in ratios) < 0.02 * want, (want, ratios)


def test_cracked_bell_is_rougher():
    """Cracked bell: deeper fast amplitude beating (2-25 Hz) and more spectral partials."""
    from scipy import signal
    from sinosynth.core import n_of, spectrum_peaks
    from sinosynth.instruments import bell

    def am_depth(y):
        e = signal.decimate(np.abs(signal.hilbert(y[: n_of(3.0)])), 40)
        le = np.log(e + 1e-6)
        k = 551
        res = (le - np.convolve(le, np.ones(k) / k, mode="same"))[k:-k]
        sos = signal.butter(2, [2, 25], "bandpass", fs=SR / 40, output="sos")
        return np.std(signal.sosfiltfilt(sos, res))

    def n_partials(y):
        pk = spectrum_peaks(y, fmin=50, fmax=3000, n_peaks=40, start=0.05, dur=2.0)
        top = max(a for _, a in pk)
        return sum(1 for _, a in pk if a > top * 10 ** (-30 / 20))

    clean = bell("D3", 4.0, seed=2)
    cracked = bell("D3", 4.0, seed=2, cracked=0.9)
    assert am_depth(cracked) > 1.5 * am_depth(clean)
    assert n_partials(cracked) >= n_partials(clean) + 5


def test_mix_loop_wraps_seamlessly():
    from sinosynth.core import Mix, SR
    from sinosynth.instruments import bell

    mx = Mix(4.0, loop=True)
    mx.add(bell("A3", 3.0, seed=3), 3.0, 0.5)  # rings past the end -> must wrap to the head
    y = mx.render({})
    assert y.shape == (4 * SR, 2)
    assert np.abs(y[:100]).max() > 1e-3  # tail landed on the head
    assert abs(y[0, 0] - y[-1, 0]) < 0.02


def test_reverb_rt60_frequency_dependent():
    from sinosynth.reverb import impulse, SPACES
    from sinosynth.core import n_of, bandpass

    ir = impulse("cathedral", 2)[:, 0]

    def t60(sig):
        e = np.cumsum(sig[::-1] ** 2)[::-1]
        e = 10 * np.log10(e / e[0] + 1e-30)
        i5, i35 = np.argmax(e < -5), np.argmax(e < -35)
        return (i35 - i5) / 44100 * 2.0

    low = t60(bandpass(ir, 150, 400))
    high = t60(bandpass(ir, 5000, 9000))
    sp = SPACES["cathedral"]
    assert 0.6 * sp.rt_low < low < 1.4 * sp.rt_low
    assert high < 0.6 * low


def test_render_is_deterministic():
    from sinosynth.registry import load_all

    reg = load_all()
    for aid in ("ui_click", "hit_metal", "dice_land"):
        a = reg[aid].fn(1234)
        b = reg[aid].fn(1234)
        assert np.array_equal(a, b), aid
