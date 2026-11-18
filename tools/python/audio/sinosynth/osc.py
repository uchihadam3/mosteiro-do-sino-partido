"""Band-limited oscillators (polyBLEP) and additive helpers."""

from __future__ import annotations

import numpy as np

from .core import SR, TAU


def _freq_arr(freq, n):
    f = np.asarray(freq, dtype=np.float64)
    if f.ndim == 0:
        f = np.full(n, float(f))
    return f[:n]


def phase_of(freq, n, phase0=0.0):
    """Normalised phase in [0,1) for a (possibly time-varying) frequency."""
    f = _freq_arr(freq, n)
    ph = phase0 + np.cumsum(f) / SR
    return ph - np.floor(ph), f / SR


def _polyblep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt
    t = ph[m] / dt[m]
    out[m] = t + t - t * t - 1.0
    m = ph > 1.0 - dt
    t = (ph[m] - 1.0) / dt[m]
    out[m] = t * t + t + t + 1.0
    return out


def saw(freq, n, phase0=0.0):
    ph, dt = phase_of(freq, n, phase0)
    return 2.0 * ph - 1.0 - _polyblep(ph, dt)


def pulse(freq, n, width=0.5, phase0=0.0):
    ph, dt = phase_of(freq, n, phase0)
    ph2 = ph + width
    ph2 -= np.floor(ph2)
    a = 2.0 * ph - 1.0 - _polyblep(ph, dt)
    b = 2.0 * ph2 - 1.0 - _polyblep(ph2, dt)
    return 0.5 * (a - b)


def sine(freq, n, phase0=0.0):
    f = _freq_arr(freq, n)
    ph = phase0 + TAU * np.cumsum(f) / SR
    return np.sin(ph)


def additive(f0, n, amps, ratios=None, phases=None, decays=None, t=None, nyq_guard=0.45):
    """Sum of sinusoids. f0 scalar or array; decays (seconds tau) optional per partial."""
    f0a = _freq_arr(f0, n)
    base = TAU * np.cumsum(f0a) / SR
    if t is None:
        t = np.arange(n) / SR
    y = np.zeros(n)
    fmax = float(np.max(f0a))
    for i, a in enumerate(amps):
        if a == 0:
            continue
        r = ratios[i] if ratios is not None else (i + 1)
        if fmax * r > nyq_guard * SR:
            continue
        p = phases[i] if phases is not None else 0.0
        s = np.sin(base * r + p) * a
        if decays is not None and decays[i]:
            s *= np.exp(-t / decays[i])
        y += s
    return y
