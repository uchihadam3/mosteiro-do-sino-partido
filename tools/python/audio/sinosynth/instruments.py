"""Synthesised instruments: bells, choir, strings, organ, lute, flute, drums."""

from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
from scipy import signal

from .core import (SR, TAU, n_of, tvec, rng, adsr, exp_env, fade, smooth_noise, lowpass, highpass,
                   bandpass, resonator, peq, onepole_lp, saturate, peak, hz, high_shelf, low_shelf)
from .osc import saw, pulse, sine, additive
from .core import periodic as core_periodic

# ---------------------------------------------------------------------------
# BELLS
# ---------------------------------------------------------------------------
# Partials of a minor-third church bell, relative to the *prime* (= strike pitch).
# (ratio, amplitude, decay scale relative to the hum)
BELL_PARTIALS = [
    (0.500, 0.50, 1.00),   # hum
    (1.000, 0.46, 0.62),   # prime / fundamental
    (1.200, 0.56, 0.55),   # tierce (minor third) - the characteristic "sad" colour
    (1.500, 0.18, 0.38),   # quint
    (2.000, 0.80, 0.42),   # nominal (octave)
    (2.500, 0.34, 0.26),   # superquint / deciem
    (2.667, 0.20, 0.22),   # undeciem
    (3.000, 0.30, 0.20),   # duodeciem
    (3.360, 0.12, 0.16),
    (4.000, 0.20, 0.13),   # upper octave nominal
    (4.700, 0.09, 0.10),
    (5.330, 0.10, 0.09),
    (6.000, 0.06, 0.07),
]
# extra partials that a cracked bell develops (split/shifted modes)
CRACK_PARTIALS = [
    (1.065, 0.30, 0.30),
    (1.270, 0.26, 0.28),
    (1.830, 0.22, 0.22),
    (2.130, 0.30, 0.20),
    (2.370, 0.22, 0.18),
    (2.840, 0.18, 0.15),
    (3.570, 0.14, 0.12),
    (4.310, 0.10, 0.09),
]


def bell(f, dur=6.0, vel=1.0, seed=0, decay=1.0, bright=1.0, cracked=0.0, beat=1.0, clang=1.0,
         partials=None):
    """Church bell. f = strike (prime) pitch in Hz or note name.

    Every partial is a slightly-mistuned doublet (bell asymmetry -> slow beating),
    each with its own exponential decay.  `cracked` (0..1) adds split, dissonant
    partials, fast rough beating, damped decay, rattle buzz and grit.
    """
    f = hz(f)
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    out = np.zeros(n)
    tau0 = 3.2 * decay * (220.0 / f) ** 0.6
    table = list(partials or BELL_PARTIALS)
    if cracked > 0:
        table += [(a, b * cracked, c) for a, b, c in CRACK_PARTIALS]
    low_component = np.zeros(n)
    for ratio, amp, dsc in table:
        detune = 1.0 + r.normal(0, 0.0015) - 0.004 * cracked * r.random()
        fr = f * ratio * detune
        if fr > 0.42 * SR:
            continue
        a = amp * (bright ** math.log2(ratio) if ratio > 1 else 1.0)
        a *= vel ** (0.5 * max(0.0, math.log2(ratio * 2)))  # harder strike -> brighter
        tau = tau0 * dsc * (1.0 - 0.45 * cracked)
        bh = r.uniform(0.25, 1.3) * beat + cracked * r.uniform(3.0, 11.0)
        k2 = r.uniform(0.3, 0.75)
        p1, p2 = r.uniform(0, TAU, 2)
        env = np.exp(-t / tau)
        s = (np.sin(TAU * fr * t + p1) + k2 * np.sin(TAU * (fr + bh) * t + p2)) / (1 + k2)
        comp = a * env * s
        out += comp
        if ratio <= 1.0:
            low_component += comp
    # strike: clapper clang (high inharmonic, very short) + contact noise
    for ratio, amp, tau in [(6.8, 0.16, 0.05), (8.1, 0.12, 0.035), (9.7, 0.1, 0.025), (11.3, 0.08, 0.018),
                            (13.9, 0.06, 0.012)]:
        fr = f * ratio * r.uniform(0.98, 1.02)
        if fr < 0.42 * SR:
            out += clang * vel * amp * np.sin(TAU * fr * t + r.uniform(0, TAU)) * np.exp(-t / tau)
    m = min(n, n_of(0.08))
    nz = np.zeros(n)
    nz[:m] = r.standard_normal(m) * np.exp(-t[:m] / 0.005)
    out += 0.25 * clang * vel * bandpass(nz, 1800, 9000)
    if cracked > 0:
        # chatter of the crack faces: noise gated by the bell's own low vibration
        g = np.maximum(0.0, low_component) / (peak(low_component) + 1e-9)
        g = g ** 1.5
        buzz = bandpass(r.standard_normal(n), 900, 6500) * g * np.exp(-t / (0.9 + 0.8 * decay))
        out += 0.55 * cracked * buzz * peak(out)
        # metallic grit
        drive = 1.0 + 2.5 * cracked
        out = (1 - 0.35 * cracked) * out + 0.35 * cracked * saturate(out / (peak(out) + 1e-9), drive) * peak(out)
    out *= 1.0 - np.exp(-t / 0.0007)
    out = fade(out, 0.0, min(0.4, dur * 0.1))
    return out / (peak(out) + 1e-12)


def handbell(f, dur=2.5, vel=1.0, seed=0, decay=0.6):
    """Small bright bell (handbell-like, more harmonic: partials 1, 2.0(3rd mode 3.0), 4.2, 5.4)."""
    tab = [(1.0, 1.0, 1.0), (2.0, 0.12, 0.4), (2.76, 0.35, 0.5), (3.0, 0.15, 0.35), (4.17, 0.2, 0.3),
           (5.4, 0.12, 0.2), (6.8, 0.06, 0.12)]
    return bell(f, dur=dur, vel=vel, seed=seed, decay=decay, partials=tab, clang=0.4, beat=0.6)


# ---------------------------------------------------------------------------
# CHOIR
# ---------------------------------------------------------------------------
# Formant tables (frequency Hz, gain dB, bandwidth Hz) per voice type / vowel.
FORMANTS = {
    ("bass", "a"): ([600, 1040, 2250, 2450, 2750], [0, -7, -9, -9, -20], [60, 70, 110, 120, 130]),
    ("bass", "o"): ([400, 750, 2400, 2600, 2900], [0, -11, -21, -20, -40], [40, 80, 100, 120, 120]),
    ("bass", "u"): ([350, 600, 2400, 2675, 2950], [0, -20, -32, -28, -36], [40, 80, 100, 120, 120]),
    ("bass", "e"): ([400, 1620, 2400, 2800, 3100], [0, -12, -9, -12, -18], [40, 80, 100, 120, 120]),
    ("tenor", "a"): ([650, 1080, 2650, 2900, 3250], [0, -6, -7, -8, -22], [80, 90, 120, 130, 140]),
    ("tenor", "o"): ([400, 800, 2600, 2800, 3000], [0, -10, -12, -12, -26], [40, 80, 100, 120, 120]),
    ("tenor", "u"): ([350, 600, 2700, 2900, 3300], [0, -20, -17, -14, -26], [40, 60, 100, 120, 120]),
    ("tenor", "e"): ([400, 1700, 2600, 3200, 3580], [0, -14, -12, -14, -20], [70, 80, 100, 120, 120]),
    ("alto", "a"): ([800, 1150, 2800, 3500, 4950], [0, -4, -20, -36, -60], [80, 90, 120, 130, 140]),
    ("alto", "o"): ([450, 800, 2830, 3500, 4950], [0, -9, -16, -28, -55], [70, 80, 100, 130, 135]),
    ("alto", "u"): ([325, 700, 2530, 3500, 4950], [0, -12, -30, -40, -64], [50, 60, 170, 180, 200]),
    ("alto", "e"): ([400, 1600, 2700, 3300, 4950], [0, -24, -30, -35, -60], [60, 80, 120, 150, 200]),
    ("soprano", "a"): ([800, 1150, 2900, 3900, 4950], [0, -6, -32, -20, -50], [80, 90, 120, 130, 140]),
    ("soprano", "o"): ([450, 800, 2830, 3800, 4950], [0, -11, -22, -22, -50], [70, 80, 100, 130, 135]),
    ("soprano", "u"): ([325, 700, 2700, 3800, 4950], [0, -16, -35, -40, -60], [50, 60, 170, 180, 200]),
    ("soprano", "e"): ([350, 2000, 2800, 3600, 4950], [0, -20, -15, -40, -56], [60, 100, 120, 150, 200]),
}
VOICE_RANGE = {"bass": ("E2", "D4"), "tenor": ("C3", "A4"), "alto": ("F3", "D5"), "soprano": ("C4", "A5")}


def formant(x, voice="bass", vowel="a", shift=1.0):
    fs, gs, bws = FORMANTS[(voice, vowel)]
    y = np.zeros_like(x)
    for f, g, bw in zip(fs, gs, bws):
        f2 = f * shift
        y += (10 ** (g / 20)) * resonator(x, f2, f2 / (bw * 1.15))
    return y


def _voice_source(freqs, n, r, n_voices=5, detune_cents=9.0, vib_depth=0.0045, vib_rate=5.0,
                  vib_delay=0.6, drift_cents=5.0, breath=0.05, tilt_hz=500.0):
    t = tvec(n)
    src = np.zeros(n)
    onset = 1.0 - np.exp(-t / max(vib_delay, 1e-3))
    for f in freqs:
        f = hz(f)
        for _ in range(n_voices):
            cents = r.normal(0, detune_cents * 0.5) + drift_cents * smooth_noise(n, 0.35, r)
            vr = vib_rate * r.uniform(0.88, 1.12)
            vib = vib_depth * r.uniform(0.6, 1.2) * onset * np.sin(TAU * vr * t + r.uniform(0, TAU))
            fr = f * 2 ** (cents / 1200.0) * (1 + vib)
            amp = 0.85 + 0.15 * smooth_noise(n, 0.6, r)
            src += amp * (0.75 * saw(fr, n, r.random()) + 0.25 * pulse(fr, n, 0.35, r.random()))
    src = onepole_lp(src, tilt_hz)  # glottal spectral tilt (-12 dB/oct overall)
    src /= (np.sqrt(len(freqs) * n_voices) + 1e-9)
    if breath > 0:
        src += breath * highpass(r.standard_normal(n), 300) * 0.35
    return src


def choir(freqs, dur, voice="bass", vowel="a", vowel2=None, morph=None, attack=1.5, release=2.0,
          n_voices=5, seed=0, breath=0.05, vib_depth=0.0045, detune_cents=9.0, bright=1.0, stab=False):
    """Choir section singing `freqs` (list of notes). Vowel formants; optional vowel morph curve."""
    r = rng(seed)
    n = n_of(dur)
    tilt = {"bass": 1000, "tenor": 1200, "alto": 1500, "soprano": 1900}[voice] * bright
    # two sub-sections of singers with slightly different vocal-tract lengths (formant shift)
    nv1 = max(1, (n_voices + 1) // 2)
    nv2 = max(1, n_voices - nv1)
    kw = dict(detune_cents=detune_cents, vib_depth=vib_depth, breath=breath * 0.7, tilt_hz=tilt,
              vib_delay=0.15 if stab else 0.6)
    srcs = [(_voice_source(freqs, n, r, n_voices=nv1, **kw), 0.965),
            (_voice_source(freqs, n, r, n_voices=nv2, **kw), 1.035)]

    def vowel_mix(v):
        return sum(formant(s, voice, v, shift=sh) for s, sh in srcs)

    y = vowel_mix(vowel)
    if vowel2 is not None:
        y2 = vowel_mix(vowel2)
        m = morph if morph is not None else 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, n))
        y = y * (1 - m) + y2 * m
    y = highpass(y, 70 if voice == "bass" else 110)
    if stab:
        env = adsr(n, attack, dur * 0.3, 0.35, release, shape="exp")
    else:
        env = adsr(n, attack, 0.0, 1.0, release)
    y *= env
    return y / (peak(y) + 1e-12)


# ---------------------------------------------------------------------------
# STRINGS
# ---------------------------------------------------------------------------

def strings(freqs, dur, attack=0.5, release=1.0, n_voices=3, cutoff=1500.0, seed=0, vib_depth=0.004,
            tremolo=0.0, trem_rate=11.0, spiccato=False, bow_noise=0.03, sus=1.0):
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    src = np.zeros(n)
    onset = 1.0 - np.exp(-t / 0.35)
    for f in freqs:
        f = hz(f)
        for _ in range(n_voices):
            cents = r.normal(0, 5.0) + 3.0 * smooth_noise(n, 0.4, r)
            vib = vib_depth * onset * np.sin(TAU * r.uniform(5.0, 6.0) * t + r.uniform(0, TAU))
            src += saw(f * 2 ** (cents / 1200) * (1 + vib), n, r.random())
    src /= np.sqrt(len(freqs) * n_voices)
    if spiccato:
        env = adsr(n, 0.006, dur * 0.4, 0.25, min(0.06, dur * 0.4), shape="exp")
    else:
        env = adsr(n, attack, 0.0, sus, release)
    if tremolo > 0:
        ph = np.cumsum(trem_rate * (1 + 0.08 * smooth_noise(n, 3.0, r))) / SR
        tr = 0.5 + 0.5 * np.cos(TAU * ph)
        env = env * (1 - tremolo + tremolo * tr ** 0.6)
    bright = lowpass(src, cutoff, order=2)
    dark = lowpass(src, cutoff * 0.35, order=2)
    e = env / (env.max() + 1e-9)
    y = dark * (1 - e) + bright * e
    y += bow_noise * bandpass(r.standard_normal(n), 1800, 6000) * e
    y = peq(y, 280, 4.0, 1.2)
    y = peq(y, 900, -3.0, 1.0)
    y = peq(y, 2600, 2.0, 2.0)
    y = highpass(y, 45)
    y *= env
    return y / (peak(y) + 1e-12)


# ---------------------------------------------------------------------------
# ORGAN / DRONES / FLUTE
# ---------------------------------------------------------------------------
ORGAN_STOPS = {
    "principal": [1.0, 0.55, 0.32, 0.22, 0.14, 0.10, 0.07, 0.05, 0.04, 0.03, 0.02, 0.015],
    "flute": [1.0, 0.06, 0.32, 0.03, 0.12, 0.02, 0.05, 0.01],
    "soft": [1.0, 0.25, 0.1, 0.05, 0.03],
    "reed": [1.0, 0.8, 0.7, 0.55, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.16, 0.13, 0.1, 0.08],
}


def organ(freqs, dur, stop="flute", attack=0.12, release=0.6, seed=0, chiff=0.15, tremulant=0.0,
          octave_rank=0.3):
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    amps = ORGAN_STOPS[stop]
    for f in freqs:
        f = hz(f)
        for rank, mult, lvl in [(0, 1.0, 1.0), (1, 2.0, octave_rank)]:
            if lvl <= 0:
                continue
            fr = f * mult * (1 + r.normal(0, 0.0007))
            if tremulant > 0:
                fr = fr * (1 + 0.002 * tremulant * np.sin(TAU * 5.5 * t))
            ph = r.uniform(0, TAU, len(amps))
            y += lvl * additive(fr, n, amps, phases=ph)
            if chiff > 0:
                m = min(n, n_of(0.12))
                nz = np.zeros(n)
                nz[:m] = r.standard_normal(m) * np.exp(-t[:m] / 0.025)
                y += chiff * lvl * bandpass(nz, f * mult * 2.5, f * mult * 7)
    y += 0.004 * lowpass(r.standard_normal(n), 2500)  # wind
    env = adsr(n, attack, 0.0, 1.0, release)
    if tremulant > 0:
        env = env * (1 - 0.12 * tremulant * (0.5 + 0.5 * np.sin(TAU * 5.5 * t)))
    y *= env
    return y / (peak(y) + 1e-12)


def drone(freqs, dur, seed=0, motion=0.3, cutoff=900.0, periodic=False, cycles=1):
    """Dark sustained drone: saw ensemble + sines, slowly breathing filter.
    periodic=True makes all modulation an integer number of cycles (loopable)."""
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    for f in freqs:
        f = hz(f)
        # use exact-frequency multiples for periodicity when requested
        for k in range(3):
            det = [-0.06, 0.0, 0.07][k]  # Hz (slow beating)
            fr = f + det
            if periodic:
                fr = round(fr * dur) / dur
            y += 0.35 * saw(fr, n, r.random())
        fs_ = round(f * dur) / dur if periodic else f
        y += 0.8 * np.sin(TAU * fs_ * t + r.uniform(0, TAU))
        y += 0.25 * np.sin(TAU * 2 * fs_ * t + r.uniform(0, TAU))
    if periodic:
        lfo = 0.5 + 0.5 * np.sin(TAU * cycles * np.arange(n) / n + r.uniform(0, TAU))
    else:
        lfo = 0.5 + 0.5 * np.tanh(smooth_noise(n, 0.08, r))
    # morph between two fixed filters (stays LTI -> loop safe)
    def filt(v):
        lo = lowpass(v, cutoff * 0.45, order=2)
        hi = lowpass(v, cutoff * 1.4, order=2)
        return highpass(lo, 30), highpass(hi, 30)

    if periodic:
        lo = core_periodic(lambda v: filt(v)[0], y, 2.0)
        hi = core_periodic(lambda v: filt(v)[1], y, 2.0)
    else:
        lo, hi = filt(y)
    out = lo * (1 - motion * lfo) + hi * (motion * lfo)
    return out / (peak(out) + 1e-12)


def flute(f, dur, seed=0, vib=0.005, breath=0.12, attack=0.09, release=0.25):
    r = rng(seed)
    f = hz(f)
    n = n_of(dur)
    t = tvec(n)
    onset = np.clip((t - 0.25) / 0.4, 0, 1)
    fr = f * (1 + vib * onset * np.sin(TAU * 5.0 * t + r.uniform(0, TAU)) + 0.0015 * smooth_noise(n, 2, r))
    y = additive(fr, n, [1.0, 0.18, 0.07, 0.03], phases=r.uniform(0, TAU, 4))
    nz = r.standard_normal(n)
    y += breath * (resonator(nz, f, 8) * 2.0 + 0.3 * bandpass(nz, 2000, 8000))
    env = adsr(n, attack, 0.0, 1.0, release)
    chiffm = np.exp(-t / 0.04) * 0.3
    y += chiffm * bandpass(nz, f * 2, f * 6)
    y *= env
    y = lowpass(y, 7000)
    return y / (peak(y) + 1e-12)


# ---------------------------------------------------------------------------
# PLUCKED (Karplus-Strong with fractional-delay allpass) - lute
# ---------------------------------------------------------------------------

def _ks(f, n, t60, excitation):
    P = SR / f
    N = int(math.floor(P - 0.5 - 0.15))
    d = P - 0.5 - N
    c = (1 - d) / (1 + d)
    g = 10 ** (-3.0 / (f * t60))
    a = np.zeros(N + 3)
    a[0] = 2.0
    a[1] = 2.0 * c
    a[N] -= g * c
    a[N + 1] -= g * (1 + c)
    a[N + 2] -= g
    b = np.array([2.0, 2.0 * c])
    x = np.zeros(n)
    x[: excitation.shape[0]] = excitation[:n]
    return signal.lfilter(b, a, x)


@lru_cache(maxsize=512)
def _lute_cached(f, dur, variant, bright, t60):
    r = rng(int(f * 100) + variant * 7717)
    n = n_of(dur)
    P = int(SR / f)
    exc = r.standard_normal(P * 2)
    exc = lowpass(exc, 1200 + 5000 * bright)
    exc *= np.hanning(exc.shape[0])
    pos = max(1, int(0.13 * P))
    exc = exc - np.concatenate([np.zeros(pos), exc[:-pos]])  # pluck position comb
    y = _ks(f, n, t60, exc)
    y2 = _ks(f * 2 ** (2.5 / 1200), n, t60 * 0.9, exc * 0.8)  # doubled course
    y = y + np.concatenate([np.zeros(n_of(0.004)), y2])[:n]
    y = peq(y, 115, 5.0, 1.5)
    y = peq(y, 240, 3.0, 1.5)
    y = peq(y, 480, 2.0, 2.0)
    y = high_shelf(y, 3500, -6.0)
    y = highpass(y, 70)
    y = fade(y, 0.0005, 0.05)
    return y / (peak(y) + 1e-12)


def lute(f, dur=2.5, vel=1.0, variant=0, bright=0.5, t60=2.2):
    f = round(hz(f), 3)
    y = _lute_cached(f, round(dur, 3), int(variant) % 4, round(bright, 2), round(t60, 2))
    return y * vel


# ---------------------------------------------------------------------------
# PERCUSSION
# ---------------------------------------------------------------------------
MEMBRANE_MODES = [(1.0, 1.0, 1.0), (1.59, 0.45, 0.55), (2.14, 0.32, 0.42), (2.30, 0.28, 0.38),
                  (2.65, 0.22, 0.32), (2.92, 0.16, 0.28), (3.16, 0.12, 0.24), (3.50, 0.08, 0.2)]
TIMPANI_MODES = [(0.62, 0.35, 0.12), (1.0, 1.0, 1.0), (1.504, 0.55, 0.75), (1.742, 0.22, 0.45),
                 (2.0, 0.38, 0.6), (2.245, 0.16, 0.4), (2.494, 0.22, 0.42), (2.8, 0.1, 0.3),
                 (2.98, 0.08, 0.25)]


def membrane(f0, dur=0.8, vel=1.0, seed=0, decay=0.35, pitch_drop=0.35, drop_time=0.035, click=0.35,
             click_band=(1500, 7000), body_noise=0.25, modes=None, damp_high=1.0):
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    fenv = f0 * (1 + pitch_drop * vel * np.exp(-t / drop_time))
    base = TAU * np.cumsum(fenv) / SR
    y = np.zeros(n)
    for ratio, amp, dsc in (modes or MEMBRANE_MODES):
        if f0 * ratio > 0.42 * SR:
            continue
        a = amp * (vel ** (0.6 * (ratio - 1))) * damp_high ** (ratio - 1)
        y += a * np.sin(base * ratio + r.uniform(0, TAU)) * np.exp(-t / (decay * dsc))
    m = min(n, n_of(0.05))
    nz = np.zeros(n)
    nz[:m] = r.standard_normal(m)
    y += click * vel * bandpass(nz * np.exp(-t / 0.004), *click_band)
    y += body_noise * lowpass(r.standard_normal(n), f0 * 5) * np.exp(-t / (decay * 0.25))
    y *= 1 - np.exp(-t / 0.0004)
    y = fade(y, 0, min(0.05, dur * 0.2))
    return y / (peak(y) + 1e-12) * vel


def frame_drum(kind="doum", vel=1.0, seed=0):
    if kind == "doum":
        return membrane(92, 0.9, vel, seed, decay=0.32, pitch_drop=0.4, click=0.18, body_noise=0.2,
                        click_band=(600, 3000), damp_high=0.8)
    if kind == "tek":
        return membrane(330, 0.3, vel, seed, decay=0.05, pitch_drop=0.15, click=3.0, body_noise=0.8,
                        click_band=(1200, 8000), damp_high=1.2)
    raise ValueError(kind)


def tom(f0=80, vel=1.0, seed=0, dur=1.2):
    return membrane(f0, dur, vel, seed, decay=0.45, pitch_drop=0.5, drop_time=0.06, click=0.25,
                    click_band=(800, 5000), body_noise=0.15, damp_high=0.7)


def taiko(f0=52, vel=1.0, seed=0, dur=2.0):
    y = membrane(f0, dur, vel, seed, decay=0.7, pitch_drop=0.6, drop_time=0.05, click=0.35,
                 click_band=(1000, 6000), body_noise=0.3, damp_high=0.6)
    return saturate(y, 1.4)


def timpani(f, vel=1.0, seed=0, dur=3.5, decay=1.0):
    f = hz(f)
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    fenv = f * (1 + 0.018 * vel * np.exp(-t / 0.09))
    base = TAU * np.cumsum(fenv) / SR
    y = np.zeros(n)
    tau0 = 1.1 * decay * (100.0 / f) ** 0.3
    for ratio, amp, dsc in TIMPANI_MODES:
        a = amp * vel ** (0.5 * max(0, ratio - 1))
        bh = r.uniform(0.2, 0.9)
        y += a * (np.sin(base * ratio + r.uniform(0, TAU)) + 0.4 * np.sin(base * ratio + TAU * bh * t)) \
            * np.exp(-t / (tau0 * dsc))
    m = min(n, n_of(0.04))
    nz = np.zeros(n)
    nz[:m] = r.standard_normal(m)
    y += 0.35 * vel * lowpass(nz * np.exp(-t / 0.006), 2500)  # felt mallet
    y *= 1 - np.exp(-t / 0.0015)
    y = fade(y, 0, 0.3)
    return y / (peak(y) + 1e-12) * vel


def timpani_roll(f, dur=2.0, v0=0.2, v1=1.0, rate=17.0, seed=0, tail=2.5):
    r = rng(seed)
    n = n_of(dur + tail)
    y = np.zeros(n)
    k = int(dur * rate)
    for i in range(k):
        tt = i / rate + r.normal(0, 0.006)
        if tt < 0:
            tt = 0
        v = v0 + (v1 - v0) * (i / max(1, k - 1)) ** 1.6
        v *= r.uniform(0.85, 1.0)
        h = timpani(f, vel=v, seed=int(r.integers(0, 6)), dur=min(2.5, dur + tail - tt), decay=0.8)
        s = int(tt * SR)
        y[s:s + h.shape[0]] += h[: n - s]
    return y / (peak(y) + 1e-12)


GONG_SEED_RATIOS = [1.0, 1.43, 1.87, 2.11, 2.52, 2.93, 3.35, 3.71, 4.12, 4.64, 5.21, 5.88, 6.4, 7.3]


def gong(f0=70, dur=6.0, vel=1.0, seed=0, shimmer=1.0, decay=1.0):
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    for i, ratio in enumerate(GONG_SEED_RATIOS):
        fr = f0 * ratio * r.uniform(0.985, 1.015)
        if fr > 0.42 * SR:
            continue
        amp = 1.0 / (1 + 0.35 * i)
        tau = decay * 3.5 / (1 + 0.25 * i)
        sw = 0.05 + shimmer * 0.12 * i  # upper modes bloom later (energy transfer)
        env = (1 - np.exp(-t / sw)) * np.exp(-t / tau)
        bh = r.uniform(0.3, 2.0)
        fm = fr * (1 + 0.003 * np.exp(-t / 0.5))
        ph = TAU * np.cumsum(fm) / SR
        y += amp * env * (np.sin(ph + r.uniform(0, TAU)) + 0.5 * np.sin(ph + TAU * bh * t))
    nz = r.standard_normal(n)
    y += 0.2 * vel * lowpass(nz * np.exp(-t / 0.01), 1500)
    y *= 1 - np.exp(-t / 0.002)
    y = fade(y, 0, 0.6)
    return y / (peak(y) + 1e-12) * vel


PLATE_RATIOS = [1.0, 1.64, 2.31, 2.97, 3.74, 4.51, 5.23, 6.40, 7.18, 8.6, 9.9]


def metal(f0=700, dur=1.2, vel=1.0, seed=0, decay=0.35, ratios=None, bright=1.0, noise=0.5,
          damp=1.0, beat=3.0):
    """Struck metal plate / armour / blade resonance."""
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    for i, ratio in enumerate(ratios or PLATE_RATIOS):
        fr = f0 * ratio * r.uniform(0.97, 1.03)
        if fr > 0.42 * SR:
            continue
        amp = r.uniform(0.5, 1.0) / (1 + 0.25 * i) * bright ** (i * 0.3)
        tau = decay * damp / (1 + 0.35 * i * damp) * r.uniform(0.7, 1.3)
        bh = r.uniform(0.5, beat)
        y += amp * (np.sin(TAU * fr * t + r.uniform(0, TAU)) + 0.6 * np.sin(TAU * (fr + bh) * t)) * np.exp(-t / tau)
    m = min(n, n_of(0.03))
    nz = np.zeros(n)
    nz[:m] = r.standard_normal(m)
    y += noise * vel * highpass(nz * np.exp(-t / 0.002), 1500) * 2.0
    y *= 1 - np.exp(-t / 0.0003)
    y = fade(y, 0, min(0.2, dur * 0.3))
    return y / (peak(y) + 1e-12) * vel


def bowed_metal(f0, dur, seed=0, swell=0.4, n_modes=7):
    """Bowed bronze/plate: friction noise exciting narrow inharmonic resonances, slow swells."""
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    exc = r.standard_normal(n)
    exc = exc * (0.6 + 0.4 * np.abs(smooth_noise(n, 25, r)))  # bow grain
    y = np.zeros(n)
    ratios = [1.0, 1.51, 2.34, 2.92, 3.88, 4.7, 5.9, 7.2][:n_modes]
    for i, ratio in enumerate(ratios):
        fr = f0 * ratio * r.uniform(0.99, 1.01)
        if fr > 0.4 * SR:
            continue
        q = 260 + 120 * i
        g = (0.5 + 0.5 * np.tanh(1.5 * smooth_noise(n, 0.25 + 0.1 * i, r))) / (1 + 0.4 * i)
        y += resonator(exc, fr, q) * g
    y = y * 6.0
    env = adsr(n, dur * swell, 0, 1.0, dur * 0.4)
    y = highpass(y, 60) * env
    return y / (peak(y) + 1e-12)


def glass(f, dur=2.0, seed=0):
    """Glassy sine cluster (harmonica-like shimmer)."""
    r = rng(seed)
    f = hz(f)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    for ratio, a, tau in [(1.0, 1.0, 1.0), (2.756, 0.3, 0.4), (5.404, 0.12, 0.2), (2.0, 0.15, 0.6)]:
        y += a * np.sin(TAU * f * ratio * t + r.uniform(0, TAU)) * np.exp(-t / (tau * dur * 0.35))
    y *= 1 - np.exp(-t / 0.004)
    y = fade(y, 0, 0.1)
    return y / (peak(y) + 1e-12)
