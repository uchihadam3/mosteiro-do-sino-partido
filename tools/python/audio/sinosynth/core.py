"""Core DSP utilities for the Mosteiro do Sino Partido procedural audio.

Everything here is plain numpy/scipy, vectorised, deterministic given a seed.
Signals are float64 numpy arrays: mono = shape (n,), stereo = shape (n, 2).
"""

from __future__ import annotations

import math
import zlib
from functools import lru_cache

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d

SR = 44100
TAU = 2.0 * math.pi


# ---------------------------------------------------------------------------
# basic helpers
# ---------------------------------------------------------------------------

def n_of(sec: float) -> int:
    return max(1, int(round(sec * SR)))


def tvec(n: int) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / SR


def rng(seed) -> np.random.Generator:
    if isinstance(seed, str):
        seed = zlib.crc32(seed.encode("utf-8"))
    return np.random.default_rng(int(seed) & 0xFFFFFFFF)


def subseed(r: np.random.Generator) -> int:
    return int(r.integers(0, 2**31 - 1))


def db(x: float) -> float:
    return 20.0 * math.log10(max(float(x), 1e-12))


def undb(d: float) -> float:
    return 10.0 ** (d / 20.0)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)) + 1e-30))


def peak(x: np.ndarray) -> float:
    return float(np.max(np.abs(x))) if x.size else 0.0


NOTE_OFFS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name: str) -> int:
    """'D4' -> 62, 'Bb3' -> 58, 'C#2' -> 37."""
    name = name.strip()
    base = NOTE_OFFS[name[0].upper()]
    i = 1
    while i < len(name) and name[i] in "#b":
        base += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    return base + 12 * (octave + 1)


def mhz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69.0) / 12.0)


def hz(name) -> float:
    if isinstance(name, (int, float)):
        return float(name)
    return mhz(midi(name))


# ---------------------------------------------------------------------------
# envelopes
# ---------------------------------------------------------------------------

def _ramp(k: int, shape: str = "sin") -> np.ndarray:
    if k <= 0:
        return np.zeros(0)
    x = (np.arange(k) + 0.5) / k
    if shape == "sin":
        return np.sin(0.5 * math.pi * x) ** 2
    if shape == "exp":
        return (1.0 - np.exp(-5.0 * x)) / (1.0 - math.exp(-5.0))
    return x


def adsr(n: int, a: float, d: float, s: float, r: float, shape: str = "sin") -> np.ndarray:
    """ADSR of total length n samples; release occupies the last r seconds."""
    na, nd, nr = n_of(a) if a > 0 else 0, n_of(d) if d > 0 else 0, n_of(r) if r > 0 else 0
    if na + nr > n:
        sc = n / max(1, na + nr)
        na, nr = int(na * sc), int(nr * sc)
        nd = 0
    nd = min(nd, n - na - nr)
    ns = n - na - nd - nr
    e = np.empty(n)
    e[:na] = _ramp(na, shape)
    if nd > 0:
        e[na:na + nd] = 1.0 - (1.0 - s) * _ramp(nd, "sin")
    lvl = s
    e[na + nd:na + nd + ns] = lvl
    if nr > 0:
        e[n - nr:] = lvl * (1.0 - _ramp(nr, "sin"))
    return e


def exp_env(n: int, tau: float, attack: float = 0.0005) -> np.ndarray:
    t = tvec(n)
    e = np.exp(-t / max(tau, 1e-5))
    if attack > 0:
        e *= 1.0 - np.exp(-t / attack)
    return e


def fade(x: np.ndarray, fin: float = 0.002, fout: float = 0.01) -> np.ndarray:
    x = np.array(x, dtype=np.float64, copy=True)
    n = x.shape[0]
    ki, ko = min(n, n_of(fin)) if fin > 0 else 0, min(n, n_of(fout)) if fout > 0 else 0
    if ki:
        r = _ramp(ki)
        x[:ki] *= r if x.ndim == 1 else r[:, None]
    if ko:
        r = _ramp(ko)[::-1]
        x[n - ko:] *= r if x.ndim == 1 else r[:, None]
    return x


def smooth_noise(n: int, rate: float, r: np.random.Generator, periodic: bool = False) -> np.ndarray:
    """Smooth random control signal ~N(0,1), with features at ~rate Hz (cosine interpolation)."""
    k = max(2, int(math.ceil(n / SR * rate)) + 2)
    pts = r.standard_normal(k)
    if periodic:
        pts[-1] = pts[0]
        pos = np.linspace(0, k - 1, n, endpoint=False)
    else:
        pos = np.arange(n) / SR * rate
    i = np.floor(pos).astype(int)
    i = np.clip(i, 0, k - 2)
    f = pos - i
    w = 0.5 - 0.5 * np.cos(math.pi * f)
    return pts[i] * (1 - w) + pts[i + 1] * w


def periodic_lfo(n: int, cycles: int, phase: float = 0.0) -> np.ndarray:
    """Sine LFO with an integer number of cycles over n samples (loop safe)."""
    return np.sin(TAU * cycles * np.arange(n) / n + phase)


# ---------------------------------------------------------------------------
# noise
# ---------------------------------------------------------------------------

def white(n: int, r: np.random.Generator) -> np.ndarray:
    return r.standard_normal(n)


def colored(n: int, r: np.random.Generator, slope_db_oct: float = -3.0) -> np.ndarray:
    """FFT-shaped noise; -3 = pink, -6 = brown. Circular (loop safe)."""
    x = r.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1] if len(f) > 1 else 1.0
    g = (f / 1000.0) ** (slope_db_oct / 6.0206)
    g[0] = 0.0
    y = np.fft.irfft(X * g, n)
    return y / (rms(y) + 1e-12)


def pink(n, r):
    return colored(n, r, -3.0)


def brown(n, r):
    return colored(n, r, -6.0)


# ---------------------------------------------------------------------------
# filters
# ---------------------------------------------------------------------------

def _clipf(f):
    return float(min(max(f, 5.0), 0.47 * SR))


@lru_cache(maxsize=4096)
def _butter(order, kind, f1, f2=None):
    if kind in ("bandpass", "bandstop"):
        return signal.butter(order, [_clipf(f1), _clipf(f2)], btype=kind, fs=SR, output="sos")
    return signal.butter(order, _clipf(f1), btype=kind, fs=SR, output="sos")


def _apply_sos(sos, x, zero_phase=False):
    if zero_phase:
        return signal.sosfiltfilt(sos, x, axis=0)
    return signal.sosfilt(sos, x, axis=0)


def lowpass(x, fc, order=2, zero_phase=False):
    return _apply_sos(_butter(order, "lowpass", round(_clipf(fc), 3)), x, zero_phase)


def highpass(x, fc, order=2, zero_phase=False):
    return _apply_sos(_butter(order, "highpass", round(_clipf(fc), 3)), x, zero_phase)


def bandpass(x, lo, hi, order=2, zero_phase=False):
    lo, hi = _clipf(lo), _clipf(hi)
    if hi <= lo * 1.01:
        hi = lo * 1.02
    return _apply_sos(_butter(order, "bandpass", round(lo, 3), round(hi, 3)), x, zero_phase)


def _rbj(kind, f, q, gain_db=0.0):
    w = TAU * _clipf(f) / SR
    cw, sw = math.cos(w), math.sin(w)
    alpha = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == "bp":  # constant 0 dB peak gain
        b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        sq = 2 * math.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == "highshelf":
        sq = 2 * math.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def resonator(x, f, q, gain=1.0):
    b, a = _rbj("bp", f, q)
    return gain * signal.lfilter(b, a, x, axis=0)


def peq(x, f, gain_db, q=1.0):
    b, a = _rbj("peak", f, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def low_shelf(x, f, gain_db, q=0.707):
    b, a = _rbj("lowshelf", f, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def high_shelf(x, f, gain_db, q=0.707):
    b, a = _rbj("highshelf", f, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def onepole_lp(x, fc):
    a = math.exp(-TAU * _clipf(fc) / SR)
    return signal.lfilter([1 - a], [1, -a], x, axis=0)


def resonator_bank(x, freqs, qs, gains):
    y = np.zeros_like(x)
    for f, q, g in zip(freqs, qs, gains):
        if f < 0.45 * SR:
            y += resonator(x, f, q, g)
    return y


# --- time-varying spectral filtering (STFT domain) ---------------------------

def stft_filter(x, gain_fn, nperseg=1024, hop=256):
    """Apply a time-varying magnitude response. gain_fn(f[:,None], t[None,:]) -> (F, T)."""
    x = np.asarray(x, dtype=np.float64)
    n = x.shape[0]
    f, t, Z = signal.stft(x, fs=SR, nperseg=nperseg, noverlap=nperseg - hop, boundary="even", padded=True)
    G = gain_fn(f[:, None], t[None, :])
    _, y = signal.istft(Z * G, fs=SR, nperseg=nperseg, noverlap=nperseg - hop, boundary=True)
    y = y[:n]
    if y.shape[0] < n:
        y = np.pad(y, (0, n - y.shape[0]))
    return y


def band_gain(f, fc, bw_oct, floor=0.0):
    """Smooth bell in log-frequency centred on fc (arrays broadcast)."""
    z = np.log2(np.maximum(f, 1.0) / fc) / bw_oct
    return floor + (1 - floor) * np.exp(-0.5 * z * z)


def curve(n_or_t, points, log=False):
    """Piecewise interpolate [(time_s, value), ...] at sample times or given times array."""
    tt = tvec(n_or_t) if isinstance(n_or_t, (int, np.integer)) else np.asarray(n_or_t)
    ts = np.array([p[0] for p in points], dtype=float)
    vs = np.array([p[1] for p in points], dtype=float)
    if log:
        return np.exp(np.interp(tt, ts, np.log(vs)))
    return np.interp(tt, ts, vs)


# ---------------------------------------------------------------------------
# non-linear / dynamics
# ---------------------------------------------------------------------------

def saturate(x, drive=1.5, oversample=2, asym=0.0):
    """tanh saturation with optional 2x/4x oversampling to limit aliasing."""
    x = np.asarray(x, dtype=np.float64)
    if oversample > 1:
        u = signal.resample_poly(x, oversample, 1, axis=0)
    else:
        u = x
    y = np.tanh(drive * (u + asym)) - math.tanh(drive * asym)
    y /= math.tanh(drive)
    if oversample > 1:
        y = signal.resample_poly(y, 1, oversample, axis=0)[: x.shape[0]]
    return y


def limiter(x, ceiling_db=-1.0, hold=0.006, smooth=0.003):
    """Look-ahead style brickwall limiter (zero-phase gain computer)."""
    x = np.asarray(x, dtype=np.float64)
    ceil = undb(ceiling_db)
    a = np.abs(x) if x.ndim == 1 else np.max(np.abs(x), axis=1)
    if a.max() <= ceil:
        return x
    g = np.minimum(1.0, ceil / np.maximum(a, 1e-12))
    w = max(1, int(hold * SR))
    g = minimum_filter1d(g, size=2 * w + 1, mode="nearest")
    k = max(3, int(smooth * SR) | 1)
    win = np.hanning(k)
    win /= win.sum()
    g = np.convolve(g, win, mode="same")
    y = x * (g if x.ndim == 1 else g[:, None])
    # safety: a soft knee above the ceiling (should be inaudible / rarely engaged)
    m = np.abs(y) > ceil
    if np.any(m):
        y[m] = np.sign(y[m]) * ceil
    return y


def dc_block(x, fc=18.0):
    return highpass(x, fc, order=2)


# ---------------------------------------------------------------------------
# stereo
# ---------------------------------------------------------------------------

def pan(x, p=0.0):
    """Constant-power pan of a mono signal, p in [-1, 1]."""
    p = float(np.clip(p, -1, 1))
    ang = (p + 1) * math.pi / 4
    return np.stack([x * math.cos(ang), x * math.sin(ang)], axis=1) * math.sqrt(2)


def to_stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def to_mono(x):
    return x if x.ndim == 1 else x.mean(axis=1)


def haas(x, ms=12.0, p=0.0):
    d = int(ms * 1e-3 * SR)
    y = pan(x, p)
    if d > 0:
        if p >= 0:
            y[:, 0] = np.concatenate([np.zeros(d), y[:-d, 0]])
        else:
            y[:, 1] = np.concatenate([np.zeros(d), y[:-d, 1]])
    return y


def widen(x, amount=0.3):
    """Mid/side width adjust for stereo signal."""
    m = (x[:, 0] + x[:, 1]) * 0.5
    s = (x[:, 0] - x[:, 1]) * 0.5 * (1 + amount)
    return np.stack([m + s, m - s], axis=1)


# ---------------------------------------------------------------------------
# loop helpers
# ---------------------------------------------------------------------------

def periodic(fn, x, pad_s=2.0):
    """Run a causal process on a periodic signal so that its output is periodic too."""
    n = x.shape[0]
    p = min(n, n_of(pad_s))
    ext = np.concatenate([x[n - p:], x], axis=0)
    return fn(ext)[p:p + n]


def fold_add(x, L):
    """Fold everything past L back onto the head (sum). For event layers with tails."""
    out = np.array(x[:L], copy=True)
    k = L
    while k < x.shape[0]:
        seg = x[k:k + L]
        out[: seg.shape[0]] += seg
        k += L
    return out


def fold_xfade(x, L):
    """Equal-power crossfade of the tail [L:] into the head. For stationary beds."""
    T = x.shape[0] - L
    out = np.array(x[:L], copy=True)
    if T <= 0:
        return out
    T = min(T, L)
    th = (np.arange(T) + 0.5) / T * (math.pi / 2)
    fi, fo = np.sin(th), np.cos(th)
    if x.ndim == 2:
        fi, fo = fi[:, None], fo[:, None]
    out[:T] = x[:T] * fi + x[L:L + T] * fo
    return out


# ---------------------------------------------------------------------------
# mixer
# ---------------------------------------------------------------------------

class Mix:
    """Stereo (or mono) timeline mixer with a dry bus and named send buses.

    loop=True: the buffer is exactly `dur` long and anything placed past the end
    wraps around to the start (so loops are seamless by construction).
    """

    def __init__(self, dur, stereo=True, loop=False, tail=0.0):
        self.loop = loop
        self.stereo = stereo
        self.n = n_of(dur) if loop else n_of(dur + tail)
        self.L = n_of(dur)
        shape = (self.n, 2) if stereo else (self.n,)
        self.shape = shape
        self.buses = {"dry": np.zeros(shape)}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros(self.shape)
        return self.buses[name]

    def _place(self, buf, sig, start):
        n = self.n
        if self.loop:
            start %= n
            pos = 0
            while pos < sig.shape[0]:
                s = (start + pos) % n
                k = min(n - s, sig.shape[0] - pos)
                buf[s:s + k] += sig[pos:pos + k]
                pos += k
        else:
            if start >= n:
                return
            if start < 0:
                sig = sig[-start:]
                start = 0
            k = min(n - start, sig.shape[0])
            if k > 0:
                buf[start:start + k] += sig[:k]

    def add(self, sig, t, gain=1.0, p=0.0, send=0.0, bus="hall", dry=1.0, width_ms=0.0):
        sig = np.asarray(sig, dtype=np.float64) * gain
        if self.stereo:
            if sig.ndim == 1:
                sig = haas(sig, width_ms, p) if width_ms > 0 else pan(sig, p)
        else:
            sig = to_mono(sig)
        start = int(round(t * SR))
        if dry:
            self._place(self.buses["dry"], sig * dry, start)
        if send:
            self._place(self.bus(bus), sig * send, start)

    def render(self, reverbs: dict):
        """reverbs: {bus_name: callable(signal, loop) -> wet signal}"""
        out = self.buses["dry"].copy()
        for name, buf in self.buses.items():
            if name == "dry":
                continue
            fn = reverbs[name]
            wet = fn(buf, self.loop)
            out += wet[: self.n]
        return out


# ---------------------------------------------------------------------------
# analysis helpers (used by tests / QA)
# ---------------------------------------------------------------------------

def spectrum_peaks(x, fmin=30, fmax=8000, n_peaks=12, min_sep_hz=8.0, start=0.0, dur=1.5):
    x = to_mono(x)
    s = n_of(start)
    seg = x[s:s + n_of(dur)]
    w = np.hanning(seg.shape[0])
    nfft = 1 << int(math.ceil(math.log2(seg.shape[0] * 4)))
    S = np.abs(np.fft.rfft(seg * w, nfft))
    f = np.fft.rfftfreq(nfft, 1 / SR)
    pk, _ = signal.find_peaks(S, distance=max(1, int(min_sep_hz / (f[1] - f[0]))))
    pk = pk[(f[pk] >= fmin) & (f[pk] <= fmax)]
    pk = pk[np.argsort(S[pk])[::-1][:n_peaks]]
    return sorted([(float(f[i]), float(S[i])) for i in pk])
