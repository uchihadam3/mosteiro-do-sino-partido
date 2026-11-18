"""Music loops and stings.

Shared language: D Aeolian / Phrygian, slow tempi, the 5-note bell motif
D-A-C-Bb-A (theory.MOTIF) recurring in every cue, stone-hall convolution reverb.
All loops are built on a wrap-around Mix (seamless) and circular reverb.
"""

from __future__ import annotations

import numpy as np

from .core import (SR, Mix, periodic, n_of, rng, mhz, midi, hz, lowpass, highpass, saturate, fade, pink,
                   smooth_noise, periodic_lfo, peak, stft_filter, band_gain, tvec, adsr, fold_xfade)
from . import instruments as I
from . import foley as F
from . import reverb as R
from .registry import asset
from .theory import satb, chord_pcs, bass_note, motif, parse

HALL = R.sender("cathedral", 1.0, seed=11)
DIST = R.sender("distant", 1.0, seed=12)
CHAP = R.sender("chapel", 1.0, seed=13)
TIGHT = R.sender("hall", 1.0, seed=14)


def _sub(r):
    return int(r.integers(0, 2**31 - 1))


def bell_motif(mx, t0, root, beat, r, gain=0.5, transpose=0, notes=None, pan=0.0, send=0.55, bus="hall",
               cracked=0.0, decay=1.0, bright=1.0, dur=7.0, lowcut=None, dry=1.0):
    """Place the motif. notes: optional explicit list of (beat_offset, note, beats)."""
    seq = notes or [(t, m, b) for t, m, b in motif(root, transpose)]
    for i, (bt, m, _) in enumerate(seq):
        f = mhz(m) if isinstance(m, (int, np.integer)) else hz(m)
        v = [1.0, 0.8, 0.85, 0.78, 0.92][i % 5] * r.uniform(0.92, 1.0)
        b = I.bell(f, dur=dur, vel=v, seed=_sub(r), decay=decay, bright=bright, cracked=cracked)
        if lowcut:
            b = lowpass(b, lowcut)
        mx.add(b, t0 + bt * beat + r.normal(0, 0.006), gain * v, pan + r.uniform(-0.1, 0.1), send=send,
               bus=bus, dry=dry)


def place_choir(mx, t, dur, notes, voice, vowel, gain, r, vowel2=None, attack=2.0, release=2.5,
                pan=0.0, send=0.5, n_voices=5, bright=1.0, lp=None):
    y = I.choir(notes, dur, voice, vowel, vowel2=vowel2, attack=attack, release=release, seed=_sub(r),
                n_voices=n_voices, bright=bright)
    if lp:
        y = lowpass(y, lp)
    mx.add(y, t, gain, pan, send=send, width_ms=8)


def satb_pad(mx, chords, t0, slot, parts, r, gains=None, vowel="a", vowel2=None, overlap=2.5, send=0.5,
             lp=None, attack=2.0):
    voicings = satb(chords)
    gains = gains or {}
    pans = {"bass": -0.15, "tenor": 0.2, "alto": -0.3, "soprano": 0.3}
    for i, (ch, v) in enumerate(zip(chords, voicings)):
        if ch is None:
            continue
        for p in parts:
            place_choir(mx, t0 + i * slot, slot + overlap, [mhz(v[p])], p, vowel, gains.get(p, 0.25), r,
                        vowel2=vowel2, attack=attack, release=overlap + 0.5, pan=pans[p], send=send, lp=lp)


def ostinato_note(m, dur, accent, seed):
    y = I.strings([mhz(m)], dur, spiccato=True, n_voices=3, cutoff=900 + 900 * accent, seed=seed,
                  bow_noise=0.05)
    return y


def drone_bed(L, notes, seed, cutoff=700, motion=0.4, cycles=2):
    return I.drone(notes, L, seed=seed, cutoff=cutoff, motion=motion, periodic=True, cycles=cycles)


def air_bed(L, r, level=1.0, lp=1200, cycles=3):
    n = n_of(L)
    x = pink(n, r)
    x = periodic(lambda v: lowpass(highpass(v, 120), lp), x, 1.0)
    a = 0.6 + 0.4 * periodic_lfo(n, cycles, r.uniform(0, 6.28))
    return x * a / (peak(x) + 1e-9) * level


# ===========================================================================
# MUSIC LOOPS
# ===========================================================================

@asset("music_title", "music", "Main theme: solemn bell motif D-A-C-Bb-A over a choir and low drone in D Aeolian/Phrygian; "
       "intro, choir build, timpani climax, return.", loop=True, bpm=60, cost=10)
def music_title(seed):
    r = rng(seed)
    bpm, beat = 60, 1.0
    bar = 4 * beat
    L = 24 * bar
    mx = Mix(L, loop=True)
    chords = ["Dm", "Dm", "Bb", "Gm", "Eb", "A", "Dm", "F", "Bb", "Gm", "Eb", "A"]
    slot = 2 * bar
    # drone (whole loop, periodic)
    mx.add(drone_bed(L, ["D2", "A2"], _sub(r), cutoff=650, cycles=3), 0, 0.12, send=0.25)
    mx.add(drone_bed(L, ["D1"], _sub(r), cutoff=300, cycles=2), 0, 0.045, send=0.1)
    # low strings: root+5th per chord from bar 4
    for i, ch in enumerate(chords):
        if i < 2:
            continue
        root = bass_note(ch, "D2", "C#3")
        g = 0.16 if i < 6 else 0.22
        if i >= 10:
            g = 0.15
        s = I.strings([mhz(root), mhz(root + 7)], slot + 3.0, attack=2.0, release=3.0, cutoff=1100, seed=_sub(r))
        mx.add(s, i * slot, g, -0.2, send=0.45)
    # choir
    satb_pad(mx, [None, None, "Bb", "Gm", "Eb", "A", None, None, None, None, None, None], 0, slot,
             ["bass", "tenor"], r, gains={"bass": 0.22, "tenor": 0.18}, vowel="o", vowel2="a")
    satb_pad(mx, [None, None, None, None, "Eb", "A"], 0, slot, ["alto"], r, gains={"alto": 0.13}, vowel="u")
    satb_pad(mx, [None] * 6 + ["Dm", "F", "Bb", "Gm"], 0, slot, ["bass", "tenor", "alto", "soprano"], r,
             gains={"bass": 0.24, "tenor": 0.2, "alto": 0.17, "soprano": 0.14}, vowel="a", lp=4500)
    satb_pad(mx, [None] * 10 + ["Eb", "A"], 0, slot, ["tenor", "alto"], r,
             gains={"tenor": 0.14, "alto": 0.11}, vowel="u", overlap=4.0)
    # cello counter-melody bars 12-19
    line = ["A3", "F3", "A3", "C4", "D4", "Bb3", "G3", "A3"]
    for k, nn in enumerate(line):
        s = I.strings([hz(nn)], bar + 0.9, attack=0.5, release=0.9, n_voices=2, cutoff=2200, seed=_sub(r),
                      vib_depth=0.006)
        mx.add(s, (12 + k) * bar, 0.14, 0.25, send=0.5)
    # the bell motif
    bell_motif(mx, 0 * bar, "D4", beat, r, gain=0.55)
    bell_motif(mx, 2 * bar, "D3", beat, r, gain=0.32, send=0.7, bright=0.7)
    bell_motif(mx, 12 * bar, "D4", beat, r, gain=0.5)
    bell_motif(mx, 14 * bar, None, beat, r, gain=0.45,
               notes=[(0, "F4", 2), (2, "C4", 1), (3, "E4", 1), (4, "D4", 1), (5, "C4", 3)])
    bell_motif(mx, 16 * bar, "D4", beat, r, gain=0.5)
    bell_motif(mx, 18 * bar, None, beat, r, gain=0.42,
               notes=[(0, "G4", 2), (2, "D4", 1), (3, "F4", 1), (4, "Eb4", 1), (5, "D4", 3)])
    bell_motif(mx, 20 * bar, None, beat, r, gain=0.3, bright=0.8,
               notes=[(0, "Eb4", 2), (2, "Bb3", 1), (3, "D4", 1), (4, "C4", 1), (5, "Bb3", 3)])
    for k, nn in enumerate(["A2", "A2"]):
        b = I.bell(nn, 9, vel=0.8, seed=_sub(r), decay=1.3)
        mx.add(b, (22 + k) * bar, 0.4, 0, send=0.6)
    # timpani
    for b_, nn, v in [(0, "D2", 0.45), (12, "D2", 0.9), (14, "F2", 0.6), (16, "Bb1", 0.8), (18, "G1", 0.7),
                      (20, "Eb2", 0.5), (22, "A1", 0.6)]:
        mx.add(I.timpani(nn, vel=v, seed=_sub(r)), b_ * bar, 0.32 * v, 0.1, send=0.35)
    mx.add(I.timpani_roll("A1", dur=2 * bar - 0.05, v0=0.1, v1=0.9, seed=_sub(r)), 10 * bar + 0.02, 0.32,
           0.1, send=0.4)
    mx.add(I.timpani_roll("A1", dur=bar, v0=0.05, v1=0.45, seed=_sub(r)), 23 * bar, 0.2, 0.1, send=0.4)
    return mx.render({"hall": HALL})


@asset("music_explore", "music", "Sparse ambient exploration bed: dark drone, slow string/choir pads, distant bell "
       "fragments of the motif, bowed bronze swells. Very calm.", loop=True, cost=8, target_rms_db=-21.0)
def music_explore(seed):
    r = rng(seed)
    L = 104.0
    mx = Mix(L, loop=True)
    mx.add(drone_bed(L, ["D2", "A2"], _sub(r), cutoff=520, cycles=2), 0, 0.15, send=0.3)
    mx.add(air_bed(L, r, 1.0), 0, 0.035, send=0.2)
    pads = [["D3", "A3", "E4", "F4"], ["Bb2", "F3", "A3", "D4"], ["G2", "D3", "F3", "Bb3"],
            ["D3", "A3", "C4", "F4"], ["C3", "G3", "Bb3", "E4"], ["Bb2", "F3", "D4", "A4"],
            ["A2", "E3", "G3", "C4"], ["D3", "A3", "F4", "E4"]]
    slot = L / len(pads)
    for i, p in enumerate(pads):
        s = I.strings([hz(x) for x in p], slot + 5.0, attack=4.5, release=5.0, cutoff=850, seed=_sub(r),
                      n_voices=2, vib_depth=0.003, bow_noise=0.01)
        mx.add(s, i * slot, 0.15, r.uniform(-0.3, 0.3), send=0.55)
        if i % 2 == 1:
            c = I.choir([hz(p[1]), hz(p[2])], slot + 4.0, "tenor", "u", attack=4.0, release=4.0, seed=_sub(r),
                        n_voices=4)
            mx.add(c, i * slot + 1.0, 0.08, 0.2, send=0.7, width_ms=10)
    for t0, notes in [(5.0, [(0, "D4", 2), (2.5, "A3", 1), (4.0, "C4", 1)]),
                      (36.0, [(0, "Bb3", 2), (3, "A3", 2)]),
                      (61.0, [(0, "D4", 2), (2, "A3", 1), (3, "C4", 1), (4, "Bb3", 1), (5, "A3", 3)]),
                      (90.0, [(0, "A3", 3), (4, "D3", 3)])]:
        bell_motif(mx, t0, None, 1.25, r, gain=0.22, notes=notes, send=0.9, bus="dist", lowcut=2600,
                   pan=r.uniform(-0.5, 0.5), dry=0.35, decay=1.2)
    for t0, f0, d in [(20.0, 182.0, 13.0), (71.0, 147.0, 15.0)]:
        bm = I.bowed_metal(f0, d, seed=_sub(r))
        mx.add(bm, t0, 0.07, r.uniform(-0.6, 0.6), send=0.6, width_ms=12)
    for t0 in r.uniform(0, L, 5):
        g = I.glass(r.choice(["A5", "D6", "E6", "F5"]), 3.0, seed=_sub(r))
        mx.add(g, t0, 0.03, r.uniform(-0.8, 0.8), send=0.8, dry=0.5)
    return mx.render({"hall": HALL, "dist": DIST})


@asset("music_base", "music", "Hearth / sanctuary theme: lute arpeggios (Karplus-Strong), soft flute-stop organ, "
       "cello and a flute singing a warmer, relative-major turn of the bell motif. 72 BPM in 3/4.",
       loop=True, bpm=72, cost=8)
def music_base(seed):
    r = rng(seed)
    beat = 60 / 72
    bar = 3 * beat
    prog = ["Dm", "Dm", "F", "C", "Bb", "F", "Gm", "A",
            "Dm", "Dm", "F", "C", "Bb", "Gm", "A", "A",
            "F", "C", "Dm", "Am", "Bb", "F", "Gm", "A",
            "Dm", "F", "C", "Bb", "Gm", "Gm", "A", "A"]
    L = len(prog) * bar
    mx = Mix(L, loop=True)
    for i, ch in enumerate(prog):
        pcs = chord_pcs(ch)
        root = bass_note(ch, "C3", "B3") - 12
        if root < midi("A2"):
            root += 12
        tones = [root, root + 7, root + 12, root + 12 + ((pcs[1] - pcs[0]) % 12), root + 19]
        pattern = [0, 1, 2, 3, 4, 3] if i < 16 else [0, 2, 4, 3, 1, 3]
        for k, idx in enumerate(pattern):
            t = i * bar + k * beat / 2 + r.normal(0, 0.006)
            v = (1.0 if k == 0 else 0.7 if k == 2 else 0.55) * r.uniform(0.85, 1.0)
            y = I.lute(mhz(tones[idx]), 2.6, vel=v, variant=int(r.integers(0, 4)), bright=0.35 + 0.2 * v)
            mx.add(y, max(0.0, t), 0.32 if i < 16 else 0.27, -0.25 + 0.1 * idx, send=0.25, bus="chap")
        # organ pad (flute stop) - soft
        voic = [mhz(root + 12), mhz(root + 12 + ((pcs[1] - pcs[0]) % 12)), mhz(root + 19)]
        o = I.organ(voic, bar + 0.6, stop="flute", attack=0.35, release=0.6, seed=_sub(r), chiff=0.05,
                    octave_rank=0.15)
        mx.add(o, i * bar, 0.11 if i < 16 else 0.07, 0.15, send=0.4, bus="chap")
        if i >= 16 and i % 2 == 0:
            c = I.strings([mhz(root - 12 if root - 12 >= midi("C2") else root)], 2 * bar + 1.2, attack=0.6,
                          release=1.2, n_voices=2, cutoff=1400, seed=_sub(r))
            mx.add(c, i * bar, 0.11, -0.1, send=0.35, bus="chap")
    # flute melody (second half) - the motif turned warm
    mel = [("F4", 2), ("C4", 1), ("E4", 1), ("D4", 1), ("C4", 1),
           ("D4", 2), ("A3", 1), ("C4", 1), ("D4", 1), ("E4", 1),
           ("F4", 2), ("D4", 1), ("C4", 2), ("A3", 1),
           ("Bb3", 1), ("C4", 1), ("D4", 1), ("E4", 3),
           ("A4", 2), ("E4", 1), ("G4", 1), ("F4", 1), ("E4", 1),
           ("E4", 2), ("C4", 1), ("D4", 3),
           ("Bb4", 2), ("A4", 1), ("G4", 1), ("F4", 1), ("E4", 1),
           ("E4", 3), ("A3", 3)]
    t = 16 * bar
    for nn, b in mel:
        d = b * beat
        y = I.flute(hz(nn) * 2, d + 0.25, seed=_sub(r), release=0.2)
        mx.add(y, t, 0.11, 0.1, send=0.5, bus="chap")
        t += d
    # little bell motif at the top of each half
    for b_ in (0, 8):
        bell_motif(mx, b_ * bar, "D5", beat, r, gain=0.12, send=0.6, bus="chap", decay=0.6, bright=0.8)
    # soft hand drum in second half
    for i in range(16, 32):
        mx.add(I.frame_drum("doum", 0.6, seed=_sub(r)), i * bar, 0.06, 0, send=0.2, bus="chap")
        if i % 2 == 1:
            mx.add(I.frame_drum("tek", 0.4, seed=_sub(r)), i * bar + 2 * beat, 0.04, 0.2, send=0.2, bus="chap")
    return mx.render({"chap": CHAP})


def _drum_bar(mx, t0, step, r, doum=None, tek=None, gain=1.0, send=0.25):
    for s_, v in (doum or {}).items():
        mx.add(I.frame_drum("doum", v * r.uniform(0.9, 1.0), seed=_sub(r) % 8), t0 + s_ * step + r.normal(0, 0.003),
               0.36 * gain * v, r.uniform(-0.1, 0.1), send=send)
    for s_, v in (tek or {}).items():
        mx.add(I.frame_drum("tek", v * r.uniform(0.85, 1.0), seed=_sub(r) % 8), t0 + s_ * step + r.normal(0, 0.004),
               0.42 * gain * v, r.uniform(-0.3, 0.3), send=send)


@asset("music_combat", "music", "Combat loop at 88 BPM: frame-drum ostinato, spiccato low strings in 3+3+2, choir "
       "stabs, bell motif, taiko and toms in the last section. Mid-range kept clear for SFX.",
       loop=True, bpm=88, cost=9)
def music_combat(seed):
    r = rng(seed)
    bpm = 88
    beat = 60 / bpm
    step = beat / 4
    bar = 4 * beat
    cyc = ["Dm", "Dm", "Bb", "A", "Dm", "Dm", "Eb", "A"]
    prog = cyc * 3
    L = len(prog) * bar
    mx = Mix(L, loop=True)
    mx.add(drone_bed(L, ["D1", "D2"], _sub(r), cutoff=400, cycles=4), 0, 0.07, send=0.15)
    doum = {0: 1.0, 6: 0.75, 10: 0.9}
    tek = {3: 0.45, 4: 0.3, 8: 0.6, 12: 0.55, 14: 0.35, 15: 0.25}
    cache = {}
    for i, ch in enumerate(prog):
        t0 = i * bar
        _drum_bar(mx, t0, step, r, doum, tek if i >= 2 else None)
        root = bass_note(ch, "C2", "B2")
        pat = [root, root, root, root + 12, root, root, root + 12, root + 7]
        acc = [1, 0, 0, 1, 0, 0, 1, 0]
        for k, (m, a) in enumerate(zip(pat, acc)):
            key = (m, a, k % 2)
            if key not in cache:
                cache[key] = ostinato_note(m, 0.32, a, seed=_sub(r))
            mx.add(cache[key], t0 + k * 2 * step + r.normal(0, 0.003), 0.30 if a else 0.2, -0.15, send=0.2)
        if i >= 8:
            if i % 2 == 0 or ch != prog[i - 1]:
                s = I.strings([mhz(root + 12), mhz(root + 19)], bar * 2 + 1.0, attack=0.8, release=1.2,
                              cutoff=1000, seed=_sub(r))
                mx.add(s, t0, 0.13, 0.25, send=0.35)
            # choir stabs on chord changes
            if i % 2 == 0 or ch != prog[i - 1]:
                v = satb([ch])[0]
                for p in ("bass", "tenor"):
                    y = I.choir([mhz(v[p])], 1.1, p, "a", attack=0.03, release=0.5, seed=_sub(r), stab=True,
                                n_voices=4)
                    mx.add(lowpass(y, 2400), t0, 0.26, -0.2 if p == "bass" else 0.2, send=0.5)
            if i % 4 == 3:
                v = satb([prog[(i + 1) % len(prog)]])[0]
                y = I.choir([mhz(v["tenor"])], 0.9, "tenor", "a", attack=0.02, release=0.4, seed=_sub(r),
                            stab=True, n_voices=4)
                mx.add(lowpass(y, 2400), t0 + 14 * step, 0.18, 0.2, send=0.5)
        if i >= 16:
            for s_, v in {0: 1.0, 8: 0.7}.items():
                mx.add(I.taiko(50, v, seed=_sub(r) % 6), t0 + s_ * step, 0.28 * v, 0, send=0.3)
            if i % 8 == 0:
                satb_pad(mx, [ch, ch], t0, bar, ["alto", "soprano"], r, gains={"alto": 0.1, "soprano": 0.08},
                         vowel="a", lp=2500, overlap=1.5, attack=1.0)
        if i % 8 == 7 and i >= 7:
            for k, f0 in enumerate([118, 104, 94, 86, 78, 70, 64, 58]):
                mx.add(I.tom(f0, 0.6 + 0.05 * k, seed=_sub(r) % 6), t0 + (8 + k) * step, 0.24, -0.4 + 0.1 * k,
                       send=0.3)
    for b_ in (8, 12, 20):
        bell_motif(mx, b_ * bar, "D4", beat, r, gain=0.26, send=0.6, decay=0.7)
    for b_ in (16, 20):
        mx.add(I.timpani("D2", 0.9, seed=_sub(r)), b_ * bar, 0.35, 0.1, send=0.3)
    for b_ in (19, 23):
        mx.add(I.timpani("A1", 0.8, seed=_sub(r)), b_ * bar, 0.3, 0.1, send=0.3)
    mx.add(I.timpani_roll("A1", dur=bar, v0=0.1, v1=0.8, seed=_sub(r)), 15 * bar, 0.25, 0.1, send=0.3)
    return mx.render({"hall": TIGHT})


def brass(notes, dur, seed, drive=2.2, cutoff=700):
    y = I.strings(notes, dur, attack=0.09, release=0.6, n_voices=3, cutoff=cutoff, seed=seed, vib_depth=0.002,
                  bow_noise=0.0)
    y = saturate(y, drive)
    return lowpass(y, cutoff * 2.2) / (1e-9 + peak(lowpass(y, cutoff * 2.2)))


@asset("music_miniboss", "music", "Mini-boss loop (the Knight / the Watcher), 80 BPM, C# Phrygian: taiko, armoured "
       "anvil backbeats, saturated low brass-strings, low choir, timpani and a dark bell every four bars.",
       loop=True, bpm=80, cost=8)
def music_miniboss(seed):
    r = rng(seed)
    bpm = 80
    beat = 60 / bpm
    step = beat / 4
    bar = 4 * beat
    prog = ["C#m", "C#m", "D", "C#m", "A", "F#m", "D", "G#",
            "C#m", "C#m", "D", "C#m", "A", "F#m", "D", "G#",
            "C#m", "D", "C#m", "G#"]
    L = len(prog) * bar
    mx = Mix(L, loop=True)
    mx.add(drone_bed(L, ["C#1", "C#2", "G#1"], _sub(r), cutoff=380, cycles=5), 0, 0.08, send=0.15)
    taiko_p = {0: 1.0, 3: 0.5, 6: 0.8, 8: 0.9, 11: 0.5, 14: 0.7}
    for i, ch in enumerate(prog):
        t0 = i * bar
        for s_, v in taiko_p.items():
            if i < 2 and s_ not in (0, 8):
                continue
            mx.add(I.taiko(46 if s_ in (0, 8) else 58, v, seed=_sub(r) % 6), t0 + s_ * step, 0.3 * v, 0, send=0.3)
        if i >= 4:
            for s_ in (4, 12):
                m = I.metal(1150, 0.6, vel=0.8, seed=_sub(r) % 5, decay=0.18, noise=0.6)
                mx.add(m, t0 + s_ * step, 0.09, 0.35, send=0.4)
            _drum_bar(mx, t0, step, r, None, {2: 0.4, 7: 0.35, 10: 0.45, 15: 0.3}, gain=0.8)
        root = bass_note(ch, "C2", "B2")
        mx.add(brass([mhz(root), mhz(root + 7)], bar * 0.95, _sub(r)), t0, 0.22, -0.1, send=0.3)
        if i % 2 == 0 and i >= 2:
            v = satb([ch])[0]
            for p in ("bass", "tenor"):
                place_choir(mx, t0, 2 * bar + 1.5, [mhz(v[p])], p, "o", 0.2, r, attack=1.2, release=1.5,
                            pan=-0.2 if p == "bass" else 0.2, send=0.5, lp=2200)
        if 8 <= i < 16:
            pcs = chord_pcs(ch)
            s = I.strings([mhz(root + 24), mhz(root + 24 + ((pcs[2] - pcs[0]) % 12))], bar + 0.6,
                          attack=0.2, release=0.6, cutoff=2200, tremolo=0.8, trem_rate=12, seed=_sub(r))
            mx.add(s, t0, 0.08, 0.4, send=0.45)
        if i % 2 == 0:
            mx.add(I.timpani(mhz(root), 0.8, seed=_sub(r)), t0, 0.3, 0.1, send=0.3)
    for b_ in (0, 4, 8, 12, 16):
        b = I.bell("C#3", 8, vel=0.9, seed=_sub(r), cracked=0.35, decay=1.0)
        mx.add(b, b_ * bar, 0.33, -0.1, send=0.55)
    bell_motif(mx, 8 * bar + 2 * bar, "C#4", beat, r, gain=0.2, send=0.6, cracked=0.25, decay=0.6)
    for b_ in (7, 15):
        mx.add(I.timpani_roll("G#1", dur=bar, v0=0.1, v1=0.9, seed=_sub(r)), b_ * bar, 0.24, 0.1, send=0.3)
    return mx.render({"hall": TIGHT})


@asset("music_boss", "music", "Final boss (Abbot Severin), 70 BPM, D Phrygian/Locrian: the great cracked bell, "
       "full choir, timpani ostinato, string tremolo and a cracked statement of the motif; builds dread "
       "then pulls back to loop.", loop=True, bpm=70, cost=12)
def music_boss(seed):
    r = rng(seed)
    bpm = 70
    beat = 60 / bpm
    step = beat / 4
    bar = 4 * beat
    chords = ["Dm", "Eb", "Dm", "Bb", "Gm", "Eb", "Dm", "Ab", "Gm", "Eb", "A", "A"]
    slot = 2 * bar
    L = 24 * bar
    mx = Mix(L, loop=True)
    mx.add(drone_bed(L, ["D1", "A1"], _sub(r), cutoff=420, cycles=3), 0, 0.11, send=0.2)
    mx.add(drone_bed(L, ["D2", "Ab2"], _sub(r), cutoff=600, cycles=5, motion=0.6), 0, 0.07, send=0.3)
    for b_ in (0, 4, 8, 12, 16, 18, 20, 22):
        b = I.bell("D2", 14, vel=1.0, seed=_sub(r) % 3, cracked=0.85, decay=1.6)
        mx.add(b, b_ * bar, 0.45 if b_ != 22 else 0.33, 0, send=0.45)
    # choir
    satb_pad(mx, chords[:2] + [None] * 10, 0, slot, ["bass"], r, gains={"bass": 0.25}, vowel="u")
    satb_pad(mx, [None, None] + chords[2:10] + [None, None], 0, slot, ["bass", "tenor", "alto"], r,
             gains={"bass": 0.26, "tenor": 0.21, "alto": 0.16}, vowel="o", vowel2="a", lp=3500)
    satb_pad(mx, [None] * 6 + chords[6:10] + [None, None], 0, slot, ["soprano"], r, gains={"soprano": 0.13},
             vowel="a", lp=4000)
    satb_pad(mx, [None] * 10 + ["A", "A"], 0, slot, ["bass", "tenor"], r, gains={"bass": 0.2, "tenor": 0.14},
             vowel="u", overlap=3.0)
    # timpani ostinato bars 8-21
    for i in range(8, 22):
        t0 = i * bar
        ch = chords[i // 2]
        root = bass_note(ch, "F1", "E2")
        for s_, v, m in [(0, 1.0, root), (8, 0.75, root), (14, 0.55, root - 5 if root - 5 >= midi("F1") else root + 7)]:
            mx.add(I.timpani(mhz(m), v, seed=_sub(r) % 6, dur=2.0), t0 + s_ * step, 0.26 * v, 0.1, send=0.3)
    for b_ in (7, 15):
        mx.add(I.timpani_roll("A1", dur=bar, v0=0.1, v1=1.0, seed=_sub(r)), b_ * bar, 0.3, 0.1, send=0.35)
    # strings
    for k in range(4, 11):
        ch = chords[k]
        root = bass_note(ch, "C3", "B3")
        pcs = chord_pcs(ch)
        s = I.strings([mhz(root), mhz(root + ((pcs[1] - pcs[0]) % 12)), mhz(root + 7)], slot + 0.8, attack=0.6,
                      release=0.8, cutoff=1800, tremolo=0.85, trem_rate=13, seed=_sub(r))
        mx.add(s, k * slot, 0.12, 0.3, send=0.4)
    cache = {}
    for i in range(12, 22):
        t0 = i * bar
        ch = chords[i // 2]
        root = bass_note(ch, "C2", "B2")
        for k in range(8):
            a = 1 if k in (0, 3, 6) else 0
            m = root + (12 if k in (3, 6) else 0)
            key = (m, a)
            if key not in cache:
                cache[key] = ostinato_note(m, 0.36, a, seed=_sub(r))
            mx.add(cache[key], t0 + k * 2 * step, 0.24 if a else 0.16, -0.2, send=0.25)
        if i >= 16:
            _drum_bar(mx, t0, step, r, {0: 1.0, 6: 0.7, 8: 0.8, 14: 0.6}, {4: 0.4, 12: 0.45}, gain=0.9)
            mx.add(I.taiko(44, 1.0, seed=_sub(r) % 6), t0, 0.4, 0, send=0.35)
    # motif on a cracked mid bell, ending on the tritone Ab
    crk = [(0, "D4", 2), (2, "A3", 1), (3, "C4", 1), (4, "Bb3", 1), (5, "Ab3", 3)]
    for b_ in (4, 10, 16):
        bell_motif(mx, b_ * bar + 2 * beat, None, beat, r, gain=0.3, notes=crk, cracked=0.5, send=0.55, decay=0.8)
    # rising noise swell into the climax
    sw = F.noise_swell(2 * bar, 150, 5000, seed=_sub(r))
    mx.add(sw, 14 * bar, 0.06, 0, send=0.5, width_ms=15)
    return mx.render({"hall": HALL})


# ===========================================================================
# STINGS
# ===========================================================================

def _sting_mix(dur, tail=4.0):
    return Mix(dur, loop=False, tail=tail)


def _finish(mx, dur):
    y = mx.render({"hall": HALL, "chap": CHAP, "dist": DIST})
    y = y[: n_of(dur)]
    return fade(y, 0.002, min(1.5, dur * 0.25))


@asset("sting_victory", "sting", "Victory: Picardy-third D major bell chord and rising motif, choir swell, "
       "timpani roll and hit.", cost=2)
def sting_victory(seed):
    r = rng(seed)
    mx = _sting_mix(6.5)
    for k, (nn, tt) in enumerate([("A3", 0.0), ("D4", 0.35), ("F#4", 0.7), ("A4", 1.05)]):
        mx.add(I.bell(nn, 6, vel=0.9, seed=_sub(r), decay=0.8), 0.6 + tt, 0.4, -0.3 + 0.2 * k, send=0.5)
    mx.add(I.timpani_roll("D2", dur=0.6, v0=0.2, v1=0.8, seed=_sub(r)), 0.0, 0.3, send=0.3)
    mx.add(I.timpani("D2", 1.0, seed=_sub(r)), 0.6, 0.45, send=0.3)
    mx.add(I.bell("D3", 7, vel=1.0, seed=_sub(r), decay=1.0), 1.4, 0.45, 0, send=0.6)
    for p, nn, g in [("bass", "D3", 0.25), ("tenor", "A3", 0.22), ("alto", "F#4", 0.18), ("soprano", "A4", 0.14)]:
        y = I.choir([hz(nn)], 5.2, p, "a", attack=0.9, release=2.5, seed=_sub(r))
        mx.add(y, 0.7, g, {"bass": -0.2, "tenor": 0.2, "alto": -0.3, "soprano": 0.3}[p], send=0.5, width_ms=8)
    mx.add(I.strings(["D2", "A2"], 5.0, attack=0.5, release=2.5, seed=_sub(r)), 0.6, 0.2, send=0.4)
    return _finish(mx, 6.5)


@asset("sting_defeat", "sting", "Defeat: slow low cracked toll, choir sliding down in D minor, the motif falling "
       "and fading into a dark drone.", cost=2)
def sting_defeat(seed):
    r = rng(seed)
    dur = 8.5
    mx = _sting_mix(dur)
    mx.add(I.bell("D2", 10, vel=1.0, seed=_sub(r), cracked=0.6, decay=1.3), 0.0, 0.55, send=0.5)
    for k, (nn, tt) in enumerate([("D4", 1.2), ("A3", 2.4), ("C4", 3.2), ("Bb3", 4.0), ("A3", 5.0)]):
        mx.add(I.bell(nn, 6, vel=0.7 - 0.07 * k, seed=_sub(r), decay=0.9, bright=0.7), tt, 0.3, 0.2 * (k - 2) / 2,
               send=0.6)
    n = n_of(7.5)
    for p, nn, g in [("bass", "D3", 0.25), ("tenor", "F3", 0.18), ("alto", "A3", 0.15)]:
        y = I.choir([hz(nn)], 7.5, p, "o", vowel2="u", attack=1.5, release=3.0, seed=_sub(r))
        mx.add(y, 0.5, g, 0, send=0.55, width_ms=8)
    mx.add(I.drone(["D1", "A1"], 8.0, seed=_sub(r), cutoff=300) * adsr(n_of(8.0), 1.0, 0, 1, 4.0), 0.3, 0.25,
           send=0.3)
    mx.add(I.timpani("D2", 0.7, seed=_sub(r), dur=4.0), 0.0, 0.3, send=0.3)
    return _finish(mx, dur)


@asset("sting_secret", "sting", "Secret found: shimmering high bell arpeggio in D Lydian-ish colour, glass "
       "sparkles and a soft high choir bloom.", cost=2)
def sting_secret(seed):
    r = rng(seed)
    dur = 5.0
    mx = _sting_mix(dur)
    notes = ["D5", "E5", "G#5", "A5", "C#6", "E6", "A6"]
    for k, nn in enumerate(notes):
        mx.add(I.handbell(nn, 3.5, vel=0.7, seed=_sub(r)), 0.1 + 0.11 * k, 0.22, -0.6 + 0.2 * k, send=0.6)
    sp = F.sparkle(3.5, seed=_sub(r), rate=45, env_pts=[(0, 0), (0.5, 1), (3.5, 0)])
    mx.add(sp, 0.2, 0.12, 0, send=0.7, width_ms=12)
    y = I.choir(["A4", "E5"], 4.2, "soprano", "u", vowel2="a", attack=0.8, release=2.2, seed=_sub(r))
    mx.add(y, 0.3, 0.2, 0, send=0.7, width_ms=10)
    mx.add(I.glass("A5", 3.5, seed=_sub(r)), 0.9, 0.12, 0.3, send=0.6)
    mx.add(I.bell("A3", 5, vel=0.6, seed=_sub(r), decay=0.7, bright=0.8), 0.1, 0.25, send=0.6)
    return _finish(mx, dur)


@asset("sting_boss_intro", "sting", "Boss intro: rising air swell into a huge cracked-bell hit with timpani, "
       "taiko and a low choir stab.", cost=2)
def sting_boss_intro(seed):
    r = rng(seed)
    dur = 4.2
    mx = _sting_mix(dur)
    sw = F.noise_swell(0.9, 120, 6000, seed=_sub(r))
    mx.add(sw, 0.0, 0.25, 0, send=0.3, width_ms=15)
    hit = 0.9
    mx.add(I.bell("D2", 8, vel=1.0, seed=_sub(r), cracked=0.9, decay=1.2), hit, 0.6, send=0.5)
    mx.add(I.taiko(42, 1.0, seed=_sub(r)), hit, 0.5, send=0.4)
    mx.add(I.timpani("D2", 1.0, seed=_sub(r)), hit, 0.4, send=0.3)
    for p, nn in [("bass", "D3"), ("tenor", "Ab3")]:
        y = I.choir([hz(nn)], 2.5, p, "a", attack=0.02, release=1.4, seed=_sub(r), stab=True)
        mx.add(y, hit, 0.3, -0.2 if p == "bass" else 0.2, send=0.6)
    return _finish(mx, dur)


@asset("sting_reward", "sting", "Reward: bright bell arpeggio up the D major triad with coin shimmer.", cost=1)
def sting_reward(seed):
    r = rng(seed)
    dur = 3.0
    mx = _sting_mix(dur)
    for k, nn in enumerate(["D5", "F#5", "A5", "D6"]):
        mx.add(I.handbell(nn, 2.5, vel=0.8, seed=_sub(r)), 0.02 + 0.09 * k, 0.3, -0.3 + 0.2 * k, send=0.45, bus="chap")
    mx.add(I.bell("D4", 4, vel=0.8, seed=_sub(r), decay=0.5), 0.02, 0.3, send=0.45, bus="chap")
    for k in range(5):
        c = F.coin(seed=_sub(r))
        mx.add(c, 0.25 + 0.07 * k + r.uniform(0, 0.03), 0.1, r.uniform(-0.6, 0.6), send=0.3, bus="chap")
    sp = F.sparkle(1.8, seed=_sub(r), rate=30, env_pts=[(0, 1), (1.8, 0)])
    mx.add(sp, 0.1, 0.08, 0, send=0.4, bus="chap", width_ms=10)
    return _finish(mx, dur)
