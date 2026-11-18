"""Ambience loops (stereo). Stationary beds use crossfade folding, events wrap around."""

from __future__ import annotations

import numpy as np

from .core import (SR, Mix, periodic, n_of, rng, hz, lowpass, highpass, bandpass, fold_xfade, periodic_lfo, peak,
                   smooth_noise, pink, brown, resonator, tvec, adsr, stft_filter, band_gain)
from . import instruments as I
from . import foley as F
from . import reverb as R
from .registry import asset

XF = 4.0  # crossfade seconds for beds


def _sub(r):
    return int(r.integers(0, 2**31 - 1))


def bed(fn, L, *a, **k):
    """Render a stationary texture L+XF long and crossfade-fold it into a seamless loop."""
    y = fn(L + XF, *a, **k)
    return fold_xfade(y, n_of(L))


def room_tone(L, r, lp=300, level=1.0):
    n = n_of(L)
    x = np.stack([brown(n, r) + 0.25 * pink(n, r), brown(n, r) + 0.25 * pink(n, r)], axis=1)
    x = periodic(lambda v: lowpass(highpass(v, 55), lp * 3), x, 1.0)
    return x / (peak(x) + 1e-9) * level


def scatter(mx, L, r, count, make, gain=(0.3, 1.0), pan=(-0.8, 0.8), send=0.4, bus="hall", min_gap=0.0):
    times = np.sort(r.uniform(0, L, count))
    last = -1e9
    for t in times:
        if t - last < min_gap:
            continue
        last = t
        y = make(_sub(r))
        mx.add(y, t, r.uniform(*gain), r.uniform(*pan), send=send, bus=bus)


@asset("amb_cloister_wind", "ambience", "Open cloister: gusting wind through arches with soft whistles, distant "
       "drips and a very faint far bell.", loop=True, cost=4)
def amb_cloister_wind(seed):
    r = rng(seed)
    L = 52.0
    mx = Mix(L, loop=True)
    w = bed(F.wind, L, seed=_sub(r), base=380, whistle=0.3)
    mx.add(w, 0, 0.8, send=0.15)
    scatter(mx, L, r, 9, lambda s: F.drip(s), gain=(0.03, 0.08), send=0.8, bus="crypt")
    b = I.bell("A3", 9, vel=0.6, seed=_sub(r), decay=1.0)
    mx.add(lowpass(b, 1800), 31.0, 0.05, -0.5, send=1.0, dry=0.2, bus="dist")
    for t in r.uniform(0, L, 4):  # dry leaves skittering on stone
        y = F.paper(r.uniform(0.6, 1.2), seed=_sub(r), density=0.5, crinkle=0.4, swish=0.2)
        mx.add(highpass(y, 1500), t, 0.05, r.uniform(-0.9, 0.9), send=0.3)
    return mx.render({"hall": R.sender("chapel", 1.0, 21), "crypt": R.sender("crypt", 1.0, 22),
                      "dist": R.sender("distant", 1.0, 23)})


@asset("amb_torches_fire", "ambience", "Torches and braziers: two stereo fire sources (roar, licking flame, "
       "crackles, pops) in a stone room.", loop=True, cost=4)
def amb_torches_fire(seed):
    r = rng(seed)
    L = 40.0
    mx = Mix(L, loop=True)
    a = bed(F.fire, L, seed=_sub(r), roar=1.0, crackle=1.0, rate=9)
    b = bed(F.fire, L, seed=_sub(r), roar=0.7, crackle=0.8, rate=6)
    mx.add(a, 0, 0.6, -0.45, send=0.15)
    mx.add(b, 0, 0.45, 0.5, send=0.15)
    mx.add(room_tone(L, r, 200), 0, 0.15)
    return mx.render({"hall": R.sender("room", 1.0, 24)})


@asset("amb_chains_creak", "ambience", "Prison / counterweight shaft: low room tone, creaking ropes and beams, "
       "swinging chains, a groaning iron counterweight, drips.", loop=True, cost=4)
def amb_chains_creak(seed):
    r = rng(seed)
    L = 48.0
    mx = Mix(L, loop=True)
    mx.add(room_tone(L, r, 260), 0, 0.2)
    scatter(mx, L, r, 10, lambda s: F.creak(rng(s).uniform(0.8, 2.0), seed=s, pitch=rng(s + 1).uniform(0.6, 1.1)),
            gain=(0.15, 0.4), send=0.5, min_gap=2.0)
    scatter(mx, L, r, 8, lambda s: F.chain_rattle(rng(s).uniform(0.4, 1.4), seed=s, density=rng(s).uniform(15, 40),
                                                   env_pts=[(0, 0.3), (0.2, 1), (1.4, 0)], heavy=0.4),
            gain=(0.08, 0.22), send=0.6, min_gap=3.0)
    for t in (7.0, 29.0):
        bm = I.bowed_metal(r.uniform(70, 95), 9.0, seed=_sub(r), swell=0.45, n_modes=5)
        mx.add(bm, t, 0.12, r.uniform(-0.5, 0.5), send=0.6, width_ms=10)
    scatter(mx, L, r, 12, lambda s: F.drip(s), gain=(0.04, 0.1), send=0.9, bus="crypt")
    return mx.render({"hall": R.sender("crypt", 1.0, 25), "crypt": R.sender("crypt", 1.0, 26)})


@asset("amb_chapel_drone", "ambience", "Chapel: low organ-like hum, incense air, distant faint choir chords and "
       "candle flutter in a long stone reverb.", loop=True, cost=5)
def amb_chapel_drone(seed):
    r = rng(seed)
    L = 56.0
    mx = Mix(L, loop=True)
    d = I.drone(["D2", "A2"], L, seed=_sub(r), cutoff=420, motion=0.5, periodic=True, cycles=2)
    mx.add(d, 0, 0.3, send=0.4)
    n = n_of(L)
    air = np.stack([pink(n, r), pink(n, r)], axis=1)
    air = periodic(lambda v: bandpass(v, 400, 5000), air, 1.0) * (0.7 + 0.3 * periodic_lfo(n, 3))[:, None]
    mx.add(air / peak(air), 0, 0.05, send=0.2)
    chords = [["D3", "A3", "F4"], ["Bb2", "F3", "D4"], ["C3", "G3", "E4"], ["A2", "E3", "C#4"]]
    slot = L / len(chords)
    for i, ch in enumerate(chords):
        for voice, sel in (("tenor", ch[:2]), ("alto", ch[2:])):
            c = I.choir([hz(x) for x in sel], slot + 4, voice, "u", vowel2="o", attack=4.0, release=4.5,
                        seed=_sub(r), n_voices=4)
            mx.add(lowpass(c, 2000), i * slot + 1.0, 0.09, r.uniform(-0.4, 0.4), send=1.0, dry=0.25, bus="dist",
                   width_ms=10)
    f = bed(F.fire, L, seed=_sub(r), roar=0.15, crackle=0.25, rate=2, pops=0.1)
    mx.add(periodic(lambda v: highpass(v, 300), f, 1.0), 0, 0.05, 0.3, send=0.3)
    return mx.render({"hall": R.sender("cathedral", 1.0, 27), "dist": R.sender("distant", 1.0, 28)})


@asset("amb_scriptorium", "ambience", "Scriptorium: quiet room tone, occasional parchment rustles and quill "
       "scratches, a slow drip in a corner.", loop=True, cost=3, target_rms_db=-29.0)
def amb_scriptorium(seed):
    r = rng(seed)
    L = 45.0
    mx = Mix(L, loop=True)
    mx.add(room_tone(L, r, 250), 0, 0.1)
    n = n_of(L)
    hiss = np.stack([pink(n, r), pink(n, r)], axis=1)
    mx.add(periodic(lambda v: bandpass(v, 800, 6000), hiss, 1.0) / 6, 0, 0.02)
    scatter(mx, L, r, 7, lambda s: F.paper(rng(s).uniform(0.3, 0.9), seed=s, density=0.6), gain=(0.08, 0.2),
            send=0.3, min_gap=3.0)

    def quill(s):
        rr = rng(s)
        k = int(rr.integers(3, 8))
        parts = []
        for _ in range(k):
            d = rr.uniform(0.06, 0.2)
            m = n_of(d)
            x = rr.standard_normal(m) * (0.5 + 0.5 * np.abs(smooth_noise(m, 60, rr)))
            x = bandpass(x, 2500, 7000) * adsr(m, 0.01, 0, 1, 0.03)
            parts.append(np.concatenate([x, np.zeros(n_of(rr.uniform(0.05, 0.15)))]))
        y = np.concatenate(parts)
        return y / peak(y)

    scatter(mx, L, r, 6, quill, gain=(0.03, 0.07), send=0.3, min_gap=4.0)
    for t in np.arange(3.0, L, 6.3):
        mx.add(F.drip(_sub(r), f0=1300), t + r.uniform(-0.3, 0.3), 0.05, 0.7, send=0.7, bus="crypt")
    return mx.render({"hall": R.sender("room", 1.0, 29), "crypt": R.sender("chapel", 1.0, 30)})


@asset("amb_kennel", "ambience", "Kennel: low distant hound breathing and growls, chain clinks, straw shuffles "
       "in a dark vaulted room.", loop=True, cost=4)
def amb_kennel(seed):
    r = rng(seed)
    L = 46.0
    mx = Mix(L, loop=True)
    mx.add(room_tone(L, r, 220), 0, 0.14)
    for k, p in enumerate((-0.6, 0.5)):
        b = bed(F.breath, L, seed=_sub(r), rate=0.38 + 0.07 * k, size=1.1 + 0.2 * k, voiced=0.25)
        mx.add(periodic(lambda v: lowpass(v, 1500), b, 1.0), 0, 0.06, p, send=0.4)
    for t in (9.0, 27.0, 39.0):
        d = r.uniform(1.4, 2.6)
        g = F.growl(d, seed=_sub(r), f0_pts=[(0, 55), (d * 0.5, 72), (d, 58)], size=1.3,
                    snarl_pts=[(0, 0.0), (d * 0.6, 0.35), (d, 0.1)], amp_pts=[(0, 0), (0.4, 0.8), (d * 0.7, 1), (d, 0)])
        mx.add(lowpass(g, 1800), t, 0.32, r.uniform(-0.7, 0.7), send=0.6)
    scatter(mx, L, r, 9, lambda s: F.chain_rattle(rng(s).uniform(0.2, 0.6), seed=s, density=25, size=0.9, heavy=0.2),
            gain=(0.04, 0.12), send=0.5, min_gap=2.0)
    scatter(mx, L, r, 6, lambda s: lowpass(F.paper(rng(s).uniform(0.4, 1.0), seed=s, density=0.8, swish=0.8), 3500),
            gain=(0.04, 0.1), send=0.3)
    return mx.render({"hall": R.sender("crypt", 1.0, 31)})


@asset("amb_belltower", "ambience", "Bell tower: high bright wind, the great bell's hum resonating sympathetically "
       "in the gusts, creaking frame and rope.", loop=True, cost=5)
def amb_belltower(seed):
    r = rng(seed)
    L = 50.0
    mx = Mix(L, loop=True)
    w = bed(F.wind, L, seed=_sub(r), base=650, whistle=0.45, bright=1.3, spread=1.2, gust_rate=0.12)
    mx.add(w, 0, 0.75, send=0.1)
    n = n_of(L)
    t = tvec(n)
    hum = np.zeros(n)
    f0 = hz("D3")
    for ratio, a in [(0.5, 1.0), (1.0, 0.6), (1.2, 0.5), (1.5, 0.2), (2.0, 0.35)]:
        fr = round(f0 * ratio * L) / L
        hum += a * np.sin(2 * np.pi * fr * t + r.uniform(0, 6.28))
    swell = (0.5 + 0.5 * periodic_lfo(n, 3, 1.0)) * (0.6 + 0.4 * periodic_lfo(n, 7, 2.0))
    mx.add(hum * swell / 3, 0, 0.12, send=0.6, width_ms=12)
    for tt in (12.0, 37.0):
        c = F.creak(2.2, seed=_sub(r), pitch=0.6)
        mx.add(c, tt, 0.25, r.uniform(-0.5, 0.5), send=0.4)
    scatter(mx, L, r, 4, lambda s: F.creak(rng(s).uniform(0.6, 1.2), seed=s, pitch=1.3), gain=(0.06, 0.12), send=0.4)
    return mx.render({"hall": R.sender("chapel", 1.0, 32)})
