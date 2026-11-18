"""Non-musical sound textures: air, fire, wind, wood, chains, paper, water, creatures, steps."""

from __future__ import annotations

import math

import numpy as np

from .core import (SR, TAU, n_of, tvec, rng, adsr, exp_env, fade, smooth_noise, lowpass, highpass,
                   bandpass, resonator, peq, stft_filter, band_gain, curve, saturate, peak, pink, brown,
                   resonator_bank, onepole_lp)


def _norm(y):
    return y / (peak(y) + 1e-12)


# ---------------------------------------------------------------------------
# air movement
# ---------------------------------------------------------------------------

def whoosh(dur=0.5, f0=500, f1=2500, f2=800, peak_at=0.45, bw=1.1, seed=0, color="pink", sharp=2.0,
           tone=0.0):
    """Band-pass sweep of noise: centre goes f0 -> f1 (at peak_at) -> f2, with a swell envelope."""
    r = rng(seed)
    n = n_of(dur)
    x = pink(n, r) if color == "pink" else r.standard_normal(n)
    pts = [(0.0, f0), (dur * peak_at, f1), (dur, f2)]

    def g(f, t):
        fc = curve(t.ravel(), pts, log=True)[None, :]
        return band_gain(f, fc, bw)

    y = stft_filter(x, g, nperseg=512, hop=128)
    t = tvec(n)
    p = dur * peak_at
    env = np.where(t < p, (np.minimum(t, p) / p) ** sharp,
                   np.exp(-(np.maximum(t - p, 0) / max(1e-3, (dur - p) * 0.35)) ** 1.4))
    y *= env
    if tone > 0:  # whistle of a blade edge
        fc = curve(n, pts, log=True) * 0.5
        y += tone * np.sin(TAU * np.cumsum(fc) / SR) * env * 0.3
    return _norm(fade(y, 0.003, 0.02))


def noise_swell(dur=2.0, f_lo=200, f_hi=6000, seed=0, reverse=True):
    """Reverse-cymbal-like rising air swell into a hit."""
    r = rng(seed)
    n = n_of(dur)
    x = r.standard_normal(n)
    t = tvec(n)

    def g(f, tt):
        fc = f_lo * (f_hi / f_lo) ** (tt / dur)
        return band_gain(f, fc, 1.8, floor=0.05)

    y = stft_filter(x, g, nperseg=1024, hop=256)
    env = (t / dur) ** 2.5 if reverse else np.exp(-t / (dur * 0.3))
    y *= env
    return _norm(fade(y, 0.01, 0.01))


def wind(dur, seed=0, base=420, spread=1.0, gust_rate=0.09, whistle=0.25, bright=1.0, stereo=True):
    """Gusting wind with drifting resonance and whistles (returns (n,2) if stereo)."""
    r = rng(seed)
    n = n_of(dur)
    chans = []
    gust = smooth_noise(n, gust_rate, r)
    gust2 = smooth_noise(n, gust_rate * 3.1, r)
    for ch in range(2 if stereo else 1):
        x = pink(n, r)
        fc_ctrl = smooth_noise(n, 0.07, r)
        amp = np.exp(0.55 * gust + 0.25 * gust2 + 0.2 * smooth_noise(n, 0.4, r))

        def g(f, t, fc_ctrl=fc_ctrl, amp=amp):
            idx = np.clip((t.ravel() * SR).astype(int), 0, n - 1)
            fc = base * 2 ** (spread * 0.8 * fc_ctrl[idx] + 0.35 * gust[idx])
            a = amp[idx]
            body = band_gain(f, fc[None, :], 1.4 * bright, floor=0.0)
            air = 0.12 * bright * band_gain(f, (fc * 4)[None, :], 1.2)
            rumble = 0.5 * band_gain(f, 90.0, 1.0)
            return (body + air + rumble) * a[None, :]

        y = stft_filter(x, g, nperseg=2048, hop=512)
        if whistle > 0:
            wctrl = smooth_noise(n, 0.05, r)
            wamp = np.clip(smooth_noise(n, 0.08, r) + 0.3 * gust, 0, None) ** 2

            def gw(f, t, wctrl=wctrl, wamp=wamp):
                idx = np.clip((t.ravel() * SR).astype(int), 0, n - 1)
                fcw = base * 2.1 * 2 ** (0.5 * wctrl[idx] + 0.2 * gust[idx])
                return band_gain(f, fcw[None, :], 0.035) * wamp[idx][None, :]

            w = stft_filter(r.standard_normal(n), gw, nperseg=4096, hop=1024)
            y = y + whistle * w * (np.std(y) / (np.std(w) + 1e-9)) * 0.6
        chans.append(y)
    out = np.stack(chans, axis=1) if stereo else chans[0]
    return out / (peak(out) + 1e-12)


# ---------------------------------------------------------------------------
# fire
# ---------------------------------------------------------------------------

def fire(dur, seed=0, roar=1.0, crackle=1.0, rate=10.0, pops=0.8):
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    flick = np.exp(0.5 * smooth_noise(n, 3.0, r) + 0.3 * smooth_noise(n, 0.5, r))
    body = highpass(lowpass(brown(n, r), 480), 70) * flick
    lick = bandpass(r.standard_normal(n), 300, 1600) * np.exp(0.8 * smooth_noise(n, 7.0, r)) * 0.25
    hiss = highpass(r.standard_normal(n), 4000) * 0.04 * np.exp(0.7 * smooth_noise(n, 2.0, r))
    y = roar * (body * 1.0 + lick) + hiss
    # crackles: sparse impulses with power-law amplitudes through random resonances
    cr = np.zeros(n)
    k = int(dur * rate)
    times = r.uniform(0, dur, k)
    # clustered: some extra bursts near existing ones
    times = np.concatenate([times, (times[: k // 2] + r.exponential(0.02, k // 2)) % dur])
    for tt in times:
        i = int(tt * SR)
        L = int(r.uniform(0.0004, 0.004) * SR)
        if i + L >= n:
            continue
        a = r.pareto(2.2) * 0.25 + 0.05
        cr[i:i + L] += a * r.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.3))
    cr = bandpass(cr, 900, 9000) + 0.6 * resonator(cr, 2400, 3) + 0.4 * resonator(cr, 4800, 4)
    pp = np.zeros(n)
    for tt in r.uniform(0, dur, int(dur * 0.6 * pops)):
        i = int(tt * SR)
        L = int(0.03 * SR)
        if i + L >= n:
            continue
        f = r.uniform(500, 1600)
        tl = np.arange(L) / SR
        pp[i:i + L] += r.uniform(0.5, 1.2) * np.sin(TAU * f * tl) * np.exp(-tl / 0.004) + \
            r.standard_normal(L) * np.exp(-tl / 0.002) * 0.6
    y = y / (peak(y) + 1e-9) * 0.6 + crackle * (cr / (peak(cr) + 1e-9)) * 0.5 + pops * pp * 0.35
    return _norm(highpass(y, 30))


def ignite(dur=1.2, seed=0):
    r = rng(seed)
    w = whoosh(dur * 0.7, 250, 1800, 500, peak_at=0.35, bw=1.6, seed=seed, sharp=1.2)
    f = fire(dur, seed=seed + 1, rate=30, pops=1.5)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    y[: w.shape[0]] += w
    y += f * np.clip(t / 0.15, 0, 1) * np.exp(-t / (dur * 0.45)) * 0.8
    return _norm(fade(y, 0.002, 0.15))


# ---------------------------------------------------------------------------
# friction: creaks, grinding, leather
# ---------------------------------------------------------------------------

def stick_slip(dur, rate_pts, seed=0, res=((420, 6), (900, 8), (1500, 10), (2600, 12)), jitter=0.15,
               amp_pts=None, grain=1.0):
    """Impulse train with time-varying rate exciting a resonator bank (wood/rope creak)."""
    r = rng(seed)
    n = n_of(dur)
    rate = curve(n, rate_pts)
    rate = rate * (1 + jitter * smooth_noise(n, 12.0, r))
    ph = np.cumsum(np.maximum(rate, 1.0)) / SR
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    x = np.zeros(n)
    x[idx] = r.uniform(0.4, 1.0, idx.shape[0]) * (1 + grain * r.standard_normal(idx.shape[0]) * 0.3)
    y = np.zeros(n)
    for f, q in res:
        y += resonator(x, f * r.uniform(0.95, 1.05), q)
    if amp_pts is not None:
        y *= curve(n, amp_pts)
    return _norm(fade(y, 0.005, 0.03))


def creak(dur=1.2, seed=0, pitch=1.0, wood=True):
    r = rng(seed)
    a = r.uniform(25, 60) * pitch
    b = r.uniform(60, 180) * pitch
    pts = [(0, a), (dur * 0.4, b), (dur * 0.7, b * r.uniform(0.6, 1.2)), (dur, a * 0.8)]
    env = [(0, 0), (dur * 0.15, 1), (dur * 0.8, 0.8), (dur, 0)]
    res = ((380 * pitch, 5), (820 * pitch, 7), (1450 * pitch, 9), (2300 * pitch, 10)) if wood else \
        ((180 * pitch, 4), (520 * pitch, 6), (1100 * pitch, 8))
    return stick_slip(dur, pts, seed, res=res, amp_pts=env)


def grind(dur=2.0, seed=0, low=1.0):
    """Stone grinding on stone: rough low noise with stick-slip roughness."""
    r = rng(seed)
    n = n_of(dur)
    x = brown(n, r) * 0.6 + r.standard_normal(n) * 0.15
    rough = np.abs(smooth_noise(n, 35, r)) ** 1.5
    y = lowpass(x, 900) * (0.4 + rough) * low + bandpass(r.standard_normal(n), 1200, 4000) * rough * 0.15
    ss = stick_slip(dur, [(0, 18), (dur, 30)], seed + 1, res=((140, 3), (310, 4), (620, 5)), jitter=0.5)
    y = y / (peak(y) + 1e-9) + 0.35 * ss
    return _norm(y)


def leather(dur=0.35, seed=0):
    r = rng(seed)
    pts = [(0, 40), (dur * 0.5, 120), (dur, 60)]
    c = stick_slip(dur, pts, seed, res=((700, 4), (1400, 5), (2800, 6)), jitter=0.4,
                   amp_pts=[(0, 0), (dur * 0.3, 1), (dur, 0)])
    n = c.shape[0]
    rub = bandpass(r.standard_normal(n), 800, 4000) * adsr(n, dur * 0.3, 0, 1, dur * 0.5) * 0.4
    return _norm(c + rub)


# ---------------------------------------------------------------------------
# metal small parts: chains, coins, clinks
# ---------------------------------------------------------------------------

def clink(seed, size=1.0, dur=0.12, bright=1.0):
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    base = r.uniform(2200, 3600) / size
    for i, ratio in enumerate([1.0, 1.53, 2.11, 2.72, 3.4]):
        fr = base * ratio * r.uniform(0.96, 1.04)
        if fr > 0.42 * SR:
            continue
        tau = r.uniform(0.008, 0.035) * size / (1 + 0.4 * i)
        y += r.uniform(0.4, 1.0) * bright ** i * np.sin(TAU * fr * t + r.uniform(0, TAU)) * np.exp(-t / tau)
    k = min(n, 40)
    y[:k] += r.standard_normal(k) * np.exp(-np.arange(k) / 6.0) * 0.6
    return y


def chain_rattle(dur=1.5, seed=0, density=40.0, size=1.0, env_pts=None, heavy=0.3):
    """Many link-on-link clinks in clustered bursts."""
    r = rng(seed)
    n = n_of(dur)
    y = np.zeros(n)
    env = curve(n, env_pts) if env_pts is not None else np.ones(n)
    k = int(dur * density)
    times = np.sort(r.uniform(0, dur, k))
    for i, tt in enumerate(times):
        s = int(tt * SR)
        if s >= n:
            continue
        c = clink(int(r.integers(0, 1 << 30)), size=size * r.uniform(0.7, 1.4), bright=r.uniform(0.6, 1.0))
        a = env[s] * r.uniform(0.3, 1.0)
        e = min(n, s + c.shape[0])
        y[s:e] += a * c[: e - s]
    if heavy > 0:  # links dragging: low clunks
        for tt in r.uniform(0, dur, max(1, int(dur * density * 0.08))):
            s = int(tt * SR)
            m = np.zeros(n_of(0.12))
            m[:30] = r.standard_normal(30)
            th = lowpass(resonator(m, r.uniform(400, 700), 4), 1500)
            e = min(n, s + th.shape[0])
            y[s:e] += heavy * env[min(s, n - 1)] * th[: e - s] * 3
    return _norm(fade(y, 0.002, 0.05))


def coin(seed=0, dur=0.6):
    """Gold coin: higher, longer ring with characteristic coin modes."""
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    y = np.zeros(n)
    f = r.uniform(3800, 4600)
    for ratio, a, tau in [(1.0, 1.0, 0.18), (1.48, 0.6, 0.12), (2.24, 0.5, 0.08), (2.86, 0.35, 0.06),
                          (0.58, 0.25, 0.1)]:
        bh = r.uniform(4, 15)
        y += a * (np.sin(TAU * f * ratio * t) + 0.6 * np.sin(TAU * (f * ratio + bh) * t)) * np.exp(-t / tau)
    y[:30] += r.standard_normal(30) * 0.5
    return fade(y, 0, 0.05)


# ---------------------------------------------------------------------------
# wood / stone impacts, foot steps
# ---------------------------------------------------------------------------

def knock(f=400, dur=0.25, seed=0, q=8, hard=0.6):
    """Wooden knock: short noise burst through a few wood modes."""
    r = rng(seed)
    n = n_of(dur)
    x = np.zeros(n)
    m = min(n, 60)
    x[:m] = r.standard_normal(m) * np.exp(-np.arange(m) / 10)
    y = np.zeros(n)
    for ratio, g in [(1.0, 1.0), (2.3, 0.5), (3.9, 0.3), (5.2, 0.15)]:
        y += g * resonator(x, f * ratio * r.uniform(0.97, 1.03), q)
    y += hard * highpass(x, 2500)
    return _norm(fade(y, 0, 0.03))


def thump(f=70, dur=0.4, seed=0, drop=1.0, click=0.3, decay=0.08):
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    fe = f * (1 + drop * np.exp(-t / 0.02))
    y = np.sin(TAU * np.cumsum(fe) / SR) * np.exp(-t / decay)
    nz = r.standard_normal(n) * np.exp(-t / 0.01)
    y += click * lowpass(nz, 2500) + 0.3 * lowpass(nz, 400)
    y *= 1 - np.exp(-t / 0.0004)
    return _norm(fade(y, 0, 0.05))


def grit(dur=0.15, seed=0, density=300, band=(2500, 9000)):
    r = rng(seed)
    n = n_of(dur)
    x = np.zeros(n)
    k = int(density * dur)
    idx = r.integers(0, n, k)
    x[idx] = r.standard_normal(k) * r.uniform(0.1, 1, k)
    x *= np.exp(-tvec(n) / (dur * 0.4))
    return bandpass(x, *band)


def footstep(variant=0, seed=0, weight=1.0, armour=0.0):
    r = rng(seed * 31 + variant)
    dur = 0.45
    n = n_of(dur)
    y = np.zeros(n)
    heel = thump(r.uniform(120, 160), 0.2, seed + 1, drop=0.5, click=1.0, decay=0.018)
    y[: heel.shape[0]] += heel * 0.55 * weight
    tock = knock(r.uniform(450, 650), 0.12, seed + 6, q=3, hard=0.6)
    y[: tock.shape[0]] += tock * 0.45
    toe_t = int(r.uniform(0.045, 0.075) * SR)
    toe = knock(r.uniform(900, 1400), 0.15, seed + 2, q=3, hard=1.0) * 0.5
    y[toe_t:toe_t + toe.shape[0]] += toe[: n - toe_t]
    g = grit(0.18, seed + 3, density=500) * 0.6
    y[: g.shape[0]] += g
    g2 = grit(0.1, seed + 4, density=200, band=(1500, 6000)) * 0.25
    y[toe_t:toe_t + g2.shape[0]] += g2[: n - toe_t]
    if armour > 0:
        c = chain_rattle(0.25, seed + 5, density=30, size=0.8, heavy=0.0) * 0.25 * armour
        y[toe_t:toe_t + c.shape[0]] += c[: n - toe_t]
    return _norm(fade(y, 0.0005, 0.05))


# ---------------------------------------------------------------------------
# paper, water
# ---------------------------------------------------------------------------

def paper(dur=0.5, seed=0, density=1.0, crinkle=0.6, swish=0.6):
    """Parchment rustle: crinkle micro-impulses + band-limited swish."""
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    env = np.clip(smooth_noise(n, 9.0, r) + 0.6, 0, None) * adsr(n, dur * 0.2, 0, 1, dur * 0.4)
    x = np.zeros(n)
    k = int(dur * 900 * density)
    idx = r.integers(0, n, k)
    x[idx] = r.standard_normal(k) * r.pareto(2.5, k)
    cr = bandpass(x, 1800, 9000) + 0.5 * resonator(x, r.uniform(2500, 4000), 4)
    sw = bandpass(r.standard_normal(n), 900, 7000)
    y = crinkle * cr / (peak(cr) + 1e-9) + swish * sw / (peak(sw) + 1e-9) * 0.5
    y *= env
    return _norm(fade(y, 0.004, 0.04))


def page_turn(seed=0, dur=0.7):
    r = rng(seed)
    n = n_of(dur)
    a = paper(dur * 0.6, seed, density=0.7, crinkle=0.5, swish=0.3)
    w = whoosh(dur * 0.55, 1200, 4500, 1500, peak_at=0.6, bw=1.3, seed=seed + 1, color="white")
    y = np.zeros(n)
    y[: a.shape[0]] += a * 0.7
    s = int(dur * 0.25 * SR)
    y[s:s + w.shape[0]] += w[: n - s] * 0.6
    flap = knock(320, 0.12, seed + 2, q=2.5, hard=0.3) * 0.25
    s2 = int(dur * 0.62 * SR)
    y[s2:s2 + flap.shape[0]] += flap[: n - s2]
    return _norm(fade(y, 0.002, 0.05))


def drip(seed=0, f0=None, dur=0.25):
    """Water drop: Minnaert-like rising chirp bubble."""
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    f0 = f0 or r.uniform(900, 1800)
    f = f0 * (1 + 1.2 * (1 - np.exp(-t / 0.012)))
    y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / r.uniform(0.012, 0.03))
    y[:20] += r.standard_normal(20) * 0.3
    return _norm(fade(y, 0.0005, 0.02))


def bubbles(dur=1.0, seed=0, rate=18, fband=(300, 900)):
    r = rng(seed)
    n = n_of(dur)
    y = np.zeros(n)
    for tt in np.sort(r.uniform(0, dur * 0.85, int(rate * dur))):
        s = int(tt * SR)
        b = drip(int(r.integers(0, 1 << 30)), f0=r.uniform(*fband), dur=0.12) * r.uniform(0.3, 1)
        e = min(n, s + b.shape[0])
        y[s:e] += b[: e - s]
    return _norm(fade(y, 0.002, 0.05))


# ---------------------------------------------------------------------------
# creatures: growls, breath
# ---------------------------------------------------------------------------

def _glottal_train(f0, n, r, jitter=0.06, shimmer=0.25, subharm=0.3):
    f = f0 * (1 + jitter * smooth_noise(n, 40.0, r))
    ph = np.cumsum(f) / SR
    cyc = np.floor(ph)
    frac = ph - cyc
    k = cyc.astype(int)
    kmax = k.max() + 2
    amps = 1.0 + shimmer * r.standard_normal(kmax)
    amps[::2] *= (1 - subharm)  # period doubling -> roughness
    a = amps[k]
    # LF-ish pulse shape: open phase then sharp closure
    op = 0.6
    p = np.where(frac < op, 0.5 - 0.5 * np.cos(math.pi * frac / op), np.cos(0.5 * math.pi * (frac - op) / (1 - op)))
    g = np.diff(np.concatenate([[0], p * a]))
    return g


def growl(dur=1.6, seed=0, f0_pts=None, amp_pts=None, snarl_pts=None, size=1.0, rough=1.0):
    """Canine growl/snarl: rough pulse source + turbulence through moving formants.

    snarl_pts: (time, 0..1) amount of lip retraction (raises formants, adds hiss).
    """
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    f0_pts = f0_pts or [(0, 70), (dur * 0.5, 95), (dur, 75)]
    f0 = curve(n, f0_pts) / size
    src = _glottal_train(f0, n, r, jitter=0.08 * rough, shimmer=0.35 * rough, subharm=0.35 * rough)
    am = 1 + 0.35 * rough * np.sin(TAU * 27 * t + 2 * smooth_noise(n, 4, r))
    src = src * am
    turb = lowpass(r.standard_normal(n), 3000) * 0.025
    x = src / (peak(src) + 1e-9) + turb
    sn = curve(n, snarl_pts or [(0, 0.2), (dur * 0.6, 0.8), (dur, 0.4)])

    def g(f, tt):
        idx = np.clip((tt.ravel() * SR).astype(int), 0, n - 1)
        s = sn[idx][None, :]
        F = [(520 + 250 * s) / size, (1250 + 450 * s) / size, (2400 + 600 * s) / size, 3600 / size]
        B = [0.32, 0.28, 0.25, 0.25]
        G = [1.0, 0.55, 0.25, 0.08]
        out = 0
        for fc, bw, gg in zip(F, B, G):
            out = out + gg * band_gain(f, fc, bw)
        return out + 0.06 * s * band_gain(f, 4000.0, 0.5) + 0.5 * band_gain(f, 160.0 / size, 0.6)

    y = stft_filter(x, g, nperseg=1024, hop=256)
    hiss = bandpass(r.standard_normal(n), 2500, 6000) * sn * 0.025
    y = y + hiss
    env = curve(n, amp_pts or [(0, 0), (0.15, 0.7), (dur * 0.7, 1.0), (dur, 0)])
    y = saturate(y / (peak(y) + 1e-9) * env, 1.4)
    y = lowpass(highpass(y, 60), 5000)
    return _norm(fade(y, 0.005, 0.05))


def breath(dur=3.0, seed=0, rate=0.45, size=1.0, voiced=0.2):
    """Slow heavy animal breathing (in/out cycles)."""
    r = rng(seed)
    n = n_of(dur)
    t = tvec(n)
    ph = (t * rate + r.random()) % 1.0
    inh = np.clip(np.sin(math.pi * np.clip(ph / 0.45, 0, 1)), 0, None) ** 1.5 * 0.6
    exh = np.clip(np.sin(math.pi * np.clip((ph - 0.5) / 0.45, 0, 1)), 0, None) ** 1.2
    exh[ph < 0.5] = 0
    nz = r.standard_normal(n)
    a = bandpass(nz, 300 / size, 2200 / size) * inh
    b = (resonator(nz, 700 / size, 2) + 0.5 * resonator(nz, 1500 / size, 3)) * exh
    y = a + b
    if voiced > 0:
        v = _glottal_train(np.full(n, 60 / size), n, r, jitter=0.1, shimmer=0.4, subharm=0.4)
        y += voiced * lowpass(v / (peak(v) + 1e-9), 900) * exh
    return _norm(y)


# ---------------------------------------------------------------------------
# magic textures
# ---------------------------------------------------------------------------

def sparkle(dur=1.0, seed=0, rate=40, fband=(2500, 9000), decay=0.05, env_pts=None):
    r = rng(seed)
    n = n_of(dur)
    y = np.zeros(n)
    env = curve(n, env_pts) if env_pts else np.ones(n)
    tt = np.arange(n_of(0.3)) / SR
    for s_t in r.uniform(0, dur, int(rate * dur)):
        s = int(s_t * SR)
        f = math.exp(r.uniform(math.log(fband[0]), math.log(fband[1])))
        g = np.sin(TAU * f * tt + r.uniform(0, TAU)) * np.exp(-tt / (decay * r.uniform(0.5, 1.5)))
        g *= 1 - np.exp(-tt / 0.001)
        e = min(n, s + g.shape[0])
        y[s:e] += env[min(s, n - 1)] * r.uniform(0.2, 1.0) * g[: e - s]
    return _norm(fade(y, 0.002, 0.05))


def ash(dur=1.5, seed=0, f_from=3000, f_to=300, density=1.0):
    """Ash disintegration: granular crumble sweeping down + airy noise."""
    r = rng(seed)
    n = n_of(dur)
    x = np.zeros(n)
    k = int(2500 * dur * density)
    idx = np.sort(r.integers(0, n, k))
    x[idx] = r.standard_normal(k)
    t = tvec(n)

    def g(f, tt):
        fc = f_from * (f_to / f_from) ** (tt / dur)
        return band_gain(f, fc, 1.6, floor=0.02)

    grains = stft_filter(x, g, nperseg=512, hop=128)
    air = stft_filter(pink(n, r), g, nperseg=1024, hop=256)
    env = (1 - np.exp(-t / 0.05)) * np.exp(-t / (dur * 0.4))
    y = (grains / (peak(grains) + 1e-9) * 0.7 + air / (peak(air) + 1e-9) * 0.5) * env
    return _norm(fade(y, 0.002, 0.1))
