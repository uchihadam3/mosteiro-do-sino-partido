"""Algorithmic convolution reverb.

Impulse responses are synthesised from decorrelated Gaussian noise shaped in
the STFT domain with a *frequency-dependent* exponential decay (RT60 per
frequency, interpolated on a log-frequency axis), plus a sparse cluster of
early reflections and a short density build-up.  Each stereo channel uses an
independent noise realisation, giving a wide, decorrelated tail.

For loops the convolution is *circular* (FFT of the loop length), so the
reverb tail of the end of the loop rings into its start: seamless by design.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from scipy import signal

from .core import SR, n_of, rng, lowpass, highpass


@dataclass(frozen=True)
class Space:
    name: str
    rt_low: float     # RT60 at ~100 Hz (s)
    rt_mid: float     # RT60 at ~1 kHz
    rt_high: float    # RT60 at ~8 kHz
    predelay: float   # s
    build: float      # density build-up (s)
    er: int           # number of early reflections
    er_span: float    # s
    air_hz: float     # overall air absorption corner
    hp_hz: float = 60.0


SPACES = {
    # great stone nave: long, dark-ish highs
    "cathedral": Space("cathedral", 4.8, 3.8, 1.5, 0.040, 0.07, 14, 0.110, 7000, 45),
    # music hall (slightly shorter, clearer)
    "hall": Space("hall", 3.4, 2.8, 1.2, 0.028, 0.05, 12, 0.090, 8000, 50),
    "chapel": Space("chapel", 2.6, 2.1, 0.9, 0.020, 0.04, 10, 0.070, 7500, 55),
    "crypt": Space("crypt", 2.0, 1.5, 0.45, 0.012, 0.03, 10, 0.050, 4500, 60),
    "room": Space("room", 0.9, 0.75, 0.35, 0.007, 0.012, 8, 0.030, 8000, 70),
    "small": Space("small", 0.45, 0.38, 0.2, 0.004, 0.006, 6, 0.018, 9000, 80),
    "distant": Space("distant", 5.5, 4.2, 1.1, 0.070, 0.12, 6, 0.150, 3500, 60),
}


def _rt_of_f(f, sp: Space):
    lf = np.log10(np.maximum(f, 20.0))
    xs = np.log10([100.0, 1000.0, 8000.0])
    ys = np.array([sp.rt_low, sp.rt_mid, sp.rt_high])
    return np.interp(lf, xs, ys)


@lru_cache(maxsize=32)
def impulse(space: str, channels: int = 2, seed: int = 7) -> np.ndarray:
    sp = SPACES[space]
    r = rng(seed * 7919 + hash_name(space))
    length = 1.15 * max(sp.rt_low, sp.rt_mid) + sp.predelay
    n = n_of(length)
    nper, hop = 1024, 256
    irs = []
    for ch in range(channels):
        noise = r.standard_normal(n)
        f, t, Z = signal.stft(noise, fs=SR, nperseg=nper, noverlap=nper - hop)
        rt = _rt_of_f(f, sp)[:, None]
        dec = np.exp(-6.9077553 * t[None, :] / rt)
        air = 1.0 / np.sqrt(1.0 + (f / sp.air_hz) ** 4)
        Z = Z * dec * air[:, None]
        _, y = signal.istft(Z, fs=SR, nperseg=nper, noverlap=nper - hop)
        y = y[:n]
        if y.shape[0] < n:
            y = np.pad(y, (0, n - y.shape[0]))
        # density build-up
        tt = np.arange(n) / SR
        y *= 1.0 - np.exp(-tt / max(sp.build, 1e-3))
        # early reflections
        er = np.zeros(n)
        times = np.sort(r.uniform(0.002, sp.er_span, sp.er))
        for k, tr in enumerate(times):
            i = int(tr * SR)
            if i < n:
                er[i] += r.choice([-1, 1]) * (0.9 ** k) * (0.02 / (tr + 0.02))
        er = lowpass(er, sp.air_hz * 0.8)
        e_tail = np.sqrt(np.sum(y * y))
        e_er = np.sqrt(np.sum(er * er)) + 1e-12
        y = y + er * (0.45 * e_tail / e_er)
        y = highpass(y, sp.hp_hz)
        d = int(sp.predelay * SR)
        y = np.concatenate([np.zeros(d), y])[:n]
        y /= np.sqrt(np.sum(y * y)) + 1e-12
        irs.append(y)
    return np.stack(irs, axis=1) if channels > 1 else irs[0]


def hash_name(s: str) -> int:
    h = 0
    for ch in s:
        h = (h * 131 + ord(ch)) & 0xFFFFFF
    return h


def _circ_conv(x, h):
    L = x.shape[0]
    if h.shape[0] > L:
        hw = np.zeros(L)
        for k in range(0, h.shape[0], L):
            seg = h[k:k + L]
            hw[: seg.shape[0]] += seg
        h = hw
    X = np.fft.rfft(x, L)
    H = np.fft.rfft(h, L)
    return np.fft.irfft(X * H, L)


def apply(x, space="hall", wet=0.3, loop=False, seed=7, predelay_extra=0.0, mono_out=False):
    """Return the *wet* signal only, scaled by `wet` (caller sums with dry).

    Mono input + stereo IR -> stereo wet output (unless mono_out).
    Non-loop output length = len(x) + len(ir) - 1.
    """
    x = np.asarray(x, dtype=np.float64)
    chans = 1 if mono_out else 2
    ir = impulse(space, chans, seed)
    if predelay_extra > 0:
        d = int(predelay_extra * SR)
        pad = np.zeros((d,) + ir.shape[1:])
        ir = np.concatenate([pad, ir], axis=0)
    if chans == 1:
        xm = x if x.ndim == 1 else x.mean(axis=1)
        y = _circ_conv(xm, ir) if loop else signal.oaconvolve(xm, ir)
        return y * wet
    xs = x if x.ndim == 2 else np.stack([x, x], axis=1)
    outs = []
    for c in range(2):
        h = ir[:, c]
        outs.append(_circ_conv(xs[:, c], h) if loop else signal.oaconvolve(xs[:, c], h))
    return np.stack(outs, axis=1) * wet


def sender(space, wet=1.0, seed=7, predelay_extra=0.0, mono_out=False):
    """Factory for Mix.render() reverb callables."""

    def fn(buf, loop):
        return apply(buf, space, wet, loop=loop, seed=seed, predelay_extra=predelay_extra, mono_out=mono_out)

    return fn


def room(x, space="room", wet=0.2, seed=3):
    """Convenience: mono SFX through a room, returns dry+wet with tail, mono."""
    y = apply(x, space, wet, loop=False, seed=seed, mono_out=True)
    y[: x.shape[0]] += x
    return y
