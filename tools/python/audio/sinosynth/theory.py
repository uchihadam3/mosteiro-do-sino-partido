"""Tiny bit of music theory: chord spelling and voice-led SATB voicings."""

from __future__ import annotations

from .core import midi, mhz

PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7,
      "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
QUAL = {"": [0, 4, 7], "m": [0, 3, 7], "dim": [0, 3, 6], "sus4": [0, 5, 7], "7": [0, 4, 7, 10],
        "m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11], "madd9": [0, 3, 7, 2], "add9": [0, 4, 7, 2],
        "m9": [0, 3, 7, 10, 2], "5": [0, 7]}

# The game's bell motif ("o motivo do sino"): D - A - C - Bb - A, long-short-short-short-long.
MOTIF = [(0, 2.0), (-5, 1.0), (-2, 1.0), (-4, 1.0), (-5, 3.0)]  # (semitones from root, beats)


def parse(ch: str):
    root = ch[:2] if len(ch) > 1 and ch[1] in "#b" else ch[:1]
    q = ch[len(root):]
    return PC[root], QUAL[q]


def chord_pcs(ch):
    r, iv = parse(ch)
    return [(r + i) % 12 for i in iv]


def in_range(pcs, lo, hi):
    lo, hi = midi(lo), midi(hi)
    return [m for m in range(lo, hi + 1) if m % 12 in pcs]


def bass_note(ch, lo="D2", hi="D3"):
    r, _ = parse(ch)
    c = [m for m in range(midi(lo), midi(hi) + 1) if m % 12 == r]
    return c[0]


def satb(chords, ranges=None):
    """Voice-led voicings: returns list of dict voice -> midi."""
    ranges = ranges or {"bass": ("D2", "D3"), "tenor": ("C3", "G4"), "alto": ("G3", "C5"), "soprano": ("C4", "G5")}
    prev = {"bass": midi("D3"), "tenor": midi("A3"), "alto": midi("D4"), "soprano": midi("F4")}
    out = []
    for ch in chords:
        if ch is None:
            out.append(None)
            continue
        pcs = chord_pcs(ch)
        root = pcs[0]
        v = {}
        bc = [m for m in in_range([root], *ranges["bass"])]
        v["bass"] = min(bc, key=lambda m: abs(m - prev["bass"]))
        used = []
        for voice in ("soprano", "alto", "tenor"):
            cands = in_range(pcs[:4], *ranges[voice])

            def cost(m):
                c = abs(m - prev[voice])
                if m % 12 in used:
                    c += 4
                return c
            m = min(cands, key=cost)
            v[voice] = m
            used.append(m % 12)
        # keep order sane
        if v["tenor"] > v["alto"]:
            v["tenor"], v["alto"] = v["alto"], v["tenor"]
        if v["alto"] > v["soprano"]:
            v["alto"], v["soprano"] = v["soprano"], v["alto"]
        out.append(v)
        prev = v
    return out


def m2hz(m):
    return mhz(m)


def motif(root_name, transpose=0, scale_beats=1.0):
    r = midi(root_name) + transpose
    t = 0.0
    out = []
    for semi, beats in MOTIF:
        out.append((t, r + semi, beats * scale_beats))
        t += beats * scale_beats
    return out
