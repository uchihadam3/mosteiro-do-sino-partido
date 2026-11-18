"""One-shot sound effects: UI, dice and combat. All mono, with short room acoustics."""

from __future__ import annotations

import math

import numpy as np
from scipy.ndimage import maximum_filter1d

from .core import (SR, TAU, n_of, tvec, rng, hz, adsr, fade, lowpass, highpass, bandpass, resonator, saturate,
                   peak, curve, smooth_noise, pink, peq)
from . import instruments as I
from . import foley as F
from . import reverb as R
from .registry import asset


def _sub(r):
    return int(r.integers(0, 2**31 - 1))


class Seq:
    """Mono one-shot assembly buffer (grows as needed)."""

    def __init__(self):
        self.buf = np.zeros(n_of(0.1))

    def add(self, sig, t=0.0, gain=1.0):
        sig = np.asarray(sig, dtype=np.float64)
        if sig.ndim == 2:
            sig = sig.mean(axis=1)
        s = max(0, int(round(t * SR)))
        e = s + sig.shape[0]
        if e > self.buf.shape[0]:
            self.buf = np.concatenate([self.buf, np.zeros(e - self.buf.shape[0])])
        self.buf[s:e] += sig * gain
        return self


def trim_tail(y, thresh_db=-62.0, margin=0.03):
    a = maximum_filter1d(np.abs(y), size=n_of(0.01))
    th = peak(y) * 10 ** (thresh_db / 20)
    idx = np.nonzero(a > th)[0]
    if idx.size == 0:
        return y
    end = min(y.shape[0], idx[-1] + n_of(margin))
    return y[:end]


def finish(y, space=None, wet=0.15, fout=0.04, thresh=-60.0, seed=3):
    if isinstance(y, Seq):
        y = y.buf
    y = np.asarray(y, dtype=np.float64)
    if space:
        y = R.room(y, space, wet, seed=seed)
    y = highpass(y, 25)
    y = trim_tail(y, thresh)
    return fade(y, 0.0008, fout)


def S():
    return Seq()


# ===========================================================================
# UI
# ===========================================================================

@asset("ui_hover", "ui", "Hover: tiny soft bone tick with a faint high glint.", gain_db=-14.0)
def ui_hover(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(2300, 0.06, _sub(r), q=7, hard=0.15), 0, 0.6)
    n = n_of(0.05)
    t = tvec(n)
    s.add(np.sin(TAU * 3400 * t) * np.exp(-t / 0.012), 0.002, 0.25)
    return finish(lowpass(s.buf, 7000), "small", 0.08)


@asset("ui_click", "ui", "Click: dry wooden press with a small low body.", gain_db=-9.0)
def ui_click(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(1250, 0.12, _sub(r), q=5, hard=0.5), 0, 0.8)
    s.add(F.thump(220, 0.08, _sub(r), drop=0.3, click=0.1, decay=0.01), 0, 0.25)
    s.add(F.clink(_sub(r), size=0.7, dur=0.05), 0.004, 0.08)
    return finish(s.buf, "small", 0.1)


@asset("ui_confirm", "ui", "Confirm: two small bell notes rising a fourth (A5 -> D6) over a soft click.", gain_db=-8.0)
def ui_confirm(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(1400, 0.1, _sub(r), q=5, hard=0.3), 0, 0.35)
    s.add(I.handbell("A5", 1.2, vel=0.75, seed=_sub(r), decay=0.35), 0.0, 0.55)
    s.add(I.handbell("D6", 1.4, vel=0.85, seed=_sub(r), decay=0.4), 0.075, 0.6)
    return finish(s.buf, "chapel", 0.16)


@asset("ui_cancel", "ui", "Cancel: muted wood tap and a falling fourth (D5 -> A4), soft and dark.", gain_db=-9.0)
def ui_cancel(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(700, 0.12, _sub(r), q=4, hard=0.2), 0, 0.6)
    s.add(lowpass(I.handbell("D5", 0.9, vel=0.6, seed=_sub(r), decay=0.25), 3000), 0.0, 0.4)
    s.add(lowpass(I.handbell("A4", 1.0, vel=0.6, seed=_sub(r), decay=0.25), 2500), 0.08, 0.45)
    return finish(s.buf, "room", 0.12)


@asset("ui_open", "ui", "Open panel: parchment unfold with a rising air sweep and a soft low bell.", gain_db=-9.0)
def ui_open(seed):
    r = rng(seed)
    s = S()
    s.add(F.paper(0.35, _sub(r), density=0.6, crinkle=0.4, swish=0.5), 0, 0.35)
    s.add(F.whoosh(0.4, 300, 1600, 1200, peak_at=0.8, bw=1.2, seed=_sub(r)), 0, 0.5)
    s.add(lowpass(I.bell("D4", 2.0, vel=0.5, seed=_sub(r), decay=0.3), 2500), 0.3, 0.25)
    s.add(F.thump(140, 0.12, _sub(r), drop=0.2, click=0.1, decay=0.02), 0.32, 0.3)
    return finish(s.buf, "room", 0.15)


@asset("ui_close", "ui", "Close panel: falling air sweep, folded parchment and a soft wooden settle.", gain_db=-9.0)
def ui_close(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.32, 1500, 1200, 280, peak_at=0.2, bw=1.2, seed=_sub(r)), 0, 0.5)
    s.add(F.paper(0.25, _sub(r), density=0.5, crinkle=0.3, swish=0.4), 0.05, 0.3)
    s.add(F.knock(420, 0.12, _sub(r), q=4, hard=0.2), 0.26, 0.5)
    s.add(F.thump(110, 0.12, _sub(r), drop=0.2, click=0.1, decay=0.02), 0.26, 0.35)
    return finish(s.buf, "room", 0.12)


@asset("ui_page", "ui", "Parchment page turn.", gain_db=-8.0)
def ui_page(seed):
    return finish(F.page_turn(seed, 0.6), "room", 0.1)


@asset("ui_error", "ui", "Error: two dull wooden knocks with a muffled minor-second dissonance.", gain_db=-9.0)
def ui_error(seed):
    r = rng(seed)
    s = S()
    n = n_of(0.3)
    t = tvec(n)
    for k, tt in enumerate((0.0, 0.11)):
        s.add(F.knock(230, 0.18, _sub(r), q=4, hard=0.15), tt, 0.7)
        tone = (np.sin(TAU * hz("E3") * t) + np.sin(TAU * hz("F3") * t)) * np.exp(-t / 0.07)
        s.add(lowpass(tone * (1 - np.exp(-t / 0.002)), 1200), tt, 0.35)
    return finish(s.buf, "small", 0.1)


@asset("ui_coin", "ui", "Gold: a few coins clinking onto a small pile.", gain_db=-8.0)
def ui_coin(seed):
    r = rng(seed)
    s = S()
    for k, (tt, g) in enumerate([(0.0, 1.0), (0.055, 0.6), (0.12, 0.45), (0.2, 0.3)]):
        s.add(F.coin(_sub(r), 0.5), tt + r.uniform(0, 0.01), g * 0.5)
        s.add(F.knock(2600, 0.04, _sub(r), q=4, hard=0.6), tt, g * 0.15)
    return finish(s.buf, "small", 0.12)


@asset("ui_equip", "ui", "Equip: leather strap creak, buckle and a metal fitting clink.", gain_db=-7.0)
def ui_equip(seed):
    r = rng(seed)
    s = S()
    s.add(F.leather(0.32, _sub(r)), 0, 0.45)
    s.add(I.metal(1700, 0.35, vel=0.7, seed=_sub(r), decay=0.08, noise=0.4), 0.22, 0.4)
    s.add(F.clink(_sub(r), size=1.2, dur=0.1), 0.27, 0.25)
    s.add(F.knock(900, 0.08, _sub(r), q=4, hard=0.6), 0.22, 0.3)
    return finish(s.buf, "small", 0.12)


@asset("ui_unlock", "ui", "Unlock: iron mechanism clicks, a heavy latch thunk and a faint chime.", gain_db=-7.0)
def ui_unlock(seed):
    r = rng(seed)
    s = S()
    for k, tt in enumerate((0.0, 0.07, 0.13)):
        s.add(F.knock(2100 - 200 * k, 0.05, _sub(r), q=8, hard=0.8), tt, 0.35)
        s.add(I.metal(2600, 0.08, vel=0.6, seed=_sub(r), decay=0.02), tt, 0.15)
    s.add(I.metal(520, 0.5, vel=0.9, seed=_sub(r), decay=0.09, damp=1.5), 0.22, 0.55)
    s.add(F.thump(120, 0.2, _sub(r), drop=0.3, click=0.4, decay=0.03), 0.22, 0.5)
    s.add(I.handbell("A5", 1.5, vel=0.5, seed=_sub(r), decay=0.4), 0.3, 0.18)
    return finish(s.buf, "room", 0.15)


@asset("ui_select_tempo_rapido", "ui", "Select tempo Rapido: quick double tick and a bright upward flick.", gain_db=-8.0)
def ui_select_tempo_rapido(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(2200, 0.05, _sub(r), q=6, hard=0.6), 0, 0.45)
    s.add(F.knock(2600, 0.05, _sub(r), q=6, hard=0.6), 0.06, 0.4)
    s.add(F.whoosh(0.2, 900, 4200, 3500, peak_at=0.7, bw=0.9, seed=_sub(r), color="white"), 0.02, 0.3)
    s.add(I.handbell("E6", 0.8, vel=0.6, seed=_sub(r), decay=0.18), 0.12, 0.3)
    return finish(s.buf, "small", 0.12)


@asset("ui_select_tempo_tatico", "ui", "Select tempo Tatico: balanced wooden knock and a mid bell (A4).", gain_db=-8.0)
def ui_select_tempo_tatico(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(900, 0.12, _sub(r), q=5, hard=0.4), 0, 0.6)
    s.add(I.bell("A4", 1.8, vel=0.65, seed=_sub(r), decay=0.25), 0.01, 0.45)
    return finish(s.buf, "room", 0.15)


@asset("ui_select_tempo_pesado", "ui", "Select tempo Pesado: low heavy thump, iron clank and a low bell (D3).", gain_db=-7.0)
def ui_select_tempo_pesado(seed):
    r = rng(seed)
    s = S()
    s.add(F.thump(62, 0.5, _sub(r), drop=0.8, click=0.4, decay=0.09), 0, 0.8)
    s.add(I.metal(330, 0.4, vel=0.8, seed=_sub(r), decay=0.07, damp=2.0, bright=0.5), 0.0, 0.3)
    s.add(I.bell("D3", 2.5, vel=0.7, seed=_sub(r), decay=0.3), 0.02, 0.45)
    return finish(s.buf, "room", 0.15)


@asset("turn_start", "ui", "Turn start: soft small bell (A5) in a little chapel.", gain_db=-8.0)
def turn_start(seed):
    r = rng(seed)
    s = S()
    s.add(I.handbell("A5", 2.0, vel=0.6, seed=_sub(r), decay=0.55), 0, 0.7)
    s.add(I.handbell("A4", 2.0, vel=0.4, seed=_sub(r), decay=0.55), 0.0, 0.2)
    return finish(s.buf, "chapel", 0.22)


@asset("cycle_start", "ui", "Cycle start: low bronze gong bloom over a deep bell (D3).", gain_db=-6.0)
def cycle_start(seed):
    r = rng(seed)
    s = S()
    s.add(I.gong(88, 4.5, vel=0.9, seed=_sub(r), shimmer=1.0, decay=0.7), 0, 0.6)
    s.add(I.bell("D3", 4.5, vel=0.7, seed=_sub(r), decay=0.45), 0.0, 0.45)
    return finish(s.buf, "cathedral", 0.25, thresh=-55)


@asset("intent_reveal", "ui", "Enemy intent reveal: card flip swish and flap with a low ominous tone.", gain_db=-7.0)
def intent_reveal(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.14, 1800, 6000, 2500, peak_at=0.6, bw=1.0, seed=_sub(r), color="white"), 0, 0.5)
    s.add(F.knock(380, 0.1, _sub(r), q=2.5, hard=0.4), 0.11, 0.45)
    n = n_of(1.0)
    t = tvec(n)
    tone = np.sin(TAU * hz("A2") * t) + 0.5 * np.sin(TAU * hz("A2") * 1.5 * t + 1) + 0.3 * np.sin(TAU * hz("Bb2") * 2 * t)
    tone *= adsr(n, 0.05, 0.2, 0.6, 0.6)
    s.add(lowpass(tone, 900), 0.1, 0.35)
    s.add(I.bowed_metal(220, 1.0, seed=_sub(r), swell=0.2, n_modes=4), 0.1, 0.12)
    return finish(s.buf, "room", 0.2)


# ===========================================================================
# DICE
# ===========================================================================

def _dice_click(r, wall=0.5, size=1.0):
    s = S()
    s.add(F.knock(r.uniform(2600, 4300) / size, 0.04, _sub(r), q=10, hard=0.8), 0, 1.0)
    if wall > 0:
        s.add(F.knock(r.uniform(600, 900), 0.08, _sub(r), q=4, hard=0.1), 0, wall)
    return s.buf


def _bounces(s, r, t0, n_b=4, gain=1.0, table=True):
    t = t0
    gap = r.uniform(0.09, 0.13)
    g = gain
    for k in range(n_b):
        s.add(_dice_click(r, wall=0.0), t, g * 0.6)
        if table:
            s.add(F.thump(r.uniform(180, 240), 0.12, _sub(r), drop=0.2, click=0.3, decay=0.02), t, g * 0.5)
            s.add(F.knock(r.uniform(320, 420), 0.1, _sub(r), q=5, hard=0.1), t, g * 0.3)
        t += gap
        gap *= r.uniform(0.55, 0.7)
        g *= r.uniform(0.45, 0.6)
    # roll out
    for k in range(int(r.integers(3, 6))):
        s.add(_dice_click(r, wall=0.0, size=1.1), t + 0.02 * k, g * 0.3 * (0.7 ** k))
    return t


@asset("dice_roll", "sfx", "Bone dice shaken in a wooden cup (three shakes of rattling clicks).", gain_db=-3.0)
def dice_roll(seed):
    r = rng(seed)
    s = S()
    for shake in range(3):
        t0 = shake * 0.28
        for k in range(int(r.integers(6, 10))):
            tt = t0 + r.beta(2, 3) * 0.22
            s.add(_dice_click(r, wall=r.uniform(0.3, 0.8)), tt, r.uniform(0.3, 1.0))
    s.add(lowpass(F.paper(0.9, _sub(r), density=0.3, crinkle=0.0, swish=0.5), 1500), 0, 0.08)
    return finish(s.buf, "small", 0.12)


@asset("dice_land", "sfx", "Dice land on a wooden table: bounces and a short roll-out.", gain_db=-3.0, group="dice_land")
def dice_land(seed):
    r = rng(seed)
    s = S()
    _bounces(s, r, 0.0, 4)
    _bounces(s, r, r.uniform(0.02, 0.05), 3, gain=0.7)
    return finish(s.buf, "small", 0.12)


@asset("dice_land_2", "sfx", "Dice land variant.", gain_db=-3.0, group="dice_land")
def dice_land_2(seed):
    return dice_land(seed + 17)


@asset("dice_fail", "sfx", "Failed roll: dice settle with a dull, muffled low tone.", gain_db=-3.0)
def dice_fail(seed):
    r = rng(seed)
    s = S()
    _bounces(s, r, 0.0, 3, 1.0)
    s.add(lowpass(I.bell("D3", 2.5, vel=0.5, seed=_sub(r), decay=0.3, bright=0.5), 700), 0.2, 0.5)
    s.add(F.thump(70, 0.4, _sub(r), drop=0.3, click=0.0, decay=0.08), 0.2, 0.5)
    n = n_of(0.9)
    t = tvec(n)
    tone = np.sin(TAU * curve(n, [(0, hz("A2")), (0.9, hz("Ab2"))]).cumsum() / SR) * adsr(n, 0.05, 0, 1, 0.6)
    s.add(lowpass(tone, 500), 0.2, 0.25)
    return finish(s.buf, "room", 0.15)


@asset("dice_success", "sfx", "Successful roll: dice settle with a soft bright bell pair.", gain_db=-3.0)
def dice_success(seed):
    r = rng(seed)
    s = S()
    _bounces(s, r, 0.0, 3, 0.8)
    s.add(I.handbell("A5", 1.5, vel=0.6, seed=_sub(r), decay=0.4), 0.18, 0.4)
    s.add(I.handbell("D6", 1.6, vel=0.7, seed=_sub(r), decay=0.45), 0.26, 0.4)
    return finish(s.buf, "chapel", 0.15)


@asset("dice_impulse", "sfx", "Impulse die: bright accent, upward glint and a quick sparkle.", gain_db=-3.0)
def dice_impulse(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.3, 800, 5000, 4000, peak_at=0.8, bw=1.0, seed=_sub(r), color="white"), 0, 0.35)
    s.add(I.handbell("E6", 1.2, vel=0.9, seed=_sub(r), decay=0.3), 0.22, 0.5)
    s.add(I.handbell("B5", 1.2, vel=0.7, seed=_sub(r), decay=0.3), 0.22, 0.3)
    s.add(F.sparkle(0.6, _sub(r), rate=50, env_pts=[(0, 1), (0.6, 0)]), 0.22, 0.25)
    s.add(_dice_click(r, wall=0), 0.22, 0.5)
    return finish(s.buf, "chapel", 0.18)


@asset("dice_critical", "sfx", "Critical: resonant bell flourish (D major arpeggio over a bell) with shimmer.", gain_db=-2.0)
def dice_critical(seed):
    r = rng(seed)
    s = S()
    s.add(I.bell("D4", 4.0, vel=1.0, seed=_sub(r), decay=0.6), 0, 0.6)
    for k, nn in enumerate(["D5", "F#5", "A5", "D6", "F#6"]):
        s.add(I.handbell(nn, 2.2, vel=0.8, seed=_sub(r), decay=0.5), 0.05 + 0.075 * k, 0.32)
    s.add(F.sparkle(1.8, _sub(r), rate=40, env_pts=[(0, 0.4), (0.3, 1), (1.8, 0)]), 0.1, 0.25)
    s.add(F.noise_swell(0.3, 1000, 8000, _sub(r)), 0, 0.15)
    return finish(s.buf, "chapel", 0.25, thresh=-58)


# ===========================================================================
# COMBAT
# ===========================================================================

@asset("swing_light", "sfx", "Light blade swing: fast thin whoosh with edge whistle.", group="swing_light")
def swing_light(seed):
    r = rng(seed)
    y = F.whoosh(0.28, r.uniform(600, 800), r.uniform(2300, 3000), 900, peak_at=0.55, bw=0.9, seed=_sub(r),
                 color="white", tone=0.25, sharp=2.5)
    return finish(y, "small", 0.08)


@asset("swing_light_2", "sfx", "Light swing variant.", group="swing_light")
def swing_light_2(seed):
    return swing_light(seed + 99)


@asset("swing_heavy", "sfx", "Heavy weapon swing: broad, low, slower air with body.")
def swing_heavy(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.55, 220, 1100, 260, peak_at=0.55, bw=1.3, seed=_sub(r), sharp=2.0), 0, 1.0)
    s.add(F.whoosh(0.55, 90, 300, 90, peak_at=0.55, bw=1.0, seed=_sub(r), sharp=2.0), 0, 0.6)
    return finish(s.buf, "small", 0.08)


def _hit_metal(r, f0, heavy=False):
    s = S()
    s.add(I.metal(f0, 1.0 if heavy else 0.8, vel=1.0, seed=_sub(r), decay=0.3 if heavy else 0.17,
                  noise=0.8, beat=5.0), 0, 0.7)
    s.add(I.metal(f0 * 1.37, 0.4, vel=0.8, seed=_sub(r), decay=0.08), 0, 0.3)
    s.add(F.thump(85 if heavy else 120, 0.3, _sub(r), drop=1.0, click=0.8, decay=0.05 if heavy else 0.03), 0,
          0.8 if heavy else 0.5)
    s.add(F.grit(0.12, _sub(r), density=900, band=(1500, 8000)), 0, 0.4)
    y = s.buf
    if heavy:
        y = saturate(y / peak(y), 1.8)
    return y


@asset("hit_metal", "sfx", "Sword on armour: bright metallic clang with impact.", group="hit_metal")
def hit_metal(seed):
    r = rng(seed)
    return finish(_hit_metal(r, r.uniform(700, 850)), "room", 0.12)


@asset("hit_metal_2", "sfx", "Sword on armour variant.", group="hit_metal")
def hit_metal_2(seed):
    r = rng(seed + 5)
    return finish(_hit_metal(r, r.uniform(580, 700)), "room", 0.12)


@asset("hit_metal_3", "sfx", "Sword on armour variant.", group="hit_metal")
def hit_metal_3(seed):
    r = rng(seed + 11)
    return finish(_hit_metal(r, r.uniform(880, 1000)), "room", 0.12)


@asset("hit_metal_heavy", "sfx", "Heavy blow on plate: low clang, crunch and weight.")
def hit_metal_heavy(seed):
    r = rng(seed)
    s = S()
    s.add(_hit_metal(r, 390, heavy=True), 0, 1.0)
    s.add(I.taiko(55, 0.9, seed=_sub(r), dur=0.6), 0, 0.5)
    return finish(s.buf, "room", 0.15)


def _flesh(r):
    s = S()
    s.add(F.thump(r.uniform(80, 100), 0.3, _sub(r), drop=0.8, click=0.2, decay=0.04), 0, 1.0)
    n = n_of(0.16)
    x = r.standard_normal(n)
    y = F.stft_filter(x, lambda f, t: F.band_gain(f, 1600 * (300 / 1600) ** (t / 0.16), 1.0), 256, 64) \
        * np.exp(-tvec(n) / 0.05)
    s.add(y / peak(y), 0.004, 0.5)
    s.add(F.bubbles(0.15, _sub(r), rate=60, fband=(250, 600)), 0.01, 0.15)
    return lowpass(s.buf, 4500)


@asset("hit_flesh", "sfx", "Blade into flesh: dull wet thud and squelch.", group="hit_flesh")
def hit_flesh(seed):
    return finish(_flesh(rng(seed)), "small", 0.1)


@asset("hit_flesh_2", "sfx", "Flesh hit variant.", group="hit_flesh")
def hit_flesh_2(seed):
    return finish(_flesh(rng(seed + 3)), "small", 0.1)


@asset("hit_blunt", "sfx", "Blunt weapon impact: heavy low thud with a wooden crack.")
def hit_blunt(seed):
    r = rng(seed)
    s = S()
    s.add(F.thump(62, 0.5, _sub(r), drop=1.2, click=0.9, decay=0.07), 0, 1.0)
    s.add(F.knock(260, 0.2, _sub(r), q=4, hard=0.8), 0, 0.8)
    s.add(F.knock(820, 0.1, _sub(r), q=3, hard=0.8), 0.002, 0.4)
    s.add(F.grit(0.1, _sub(r), density=800, band=(800, 5000)), 0, 0.5)
    return finish(saturate(s.buf / peak(s.buf), 1.5), "room", 0.12)


@asset("hit_wood_shield", "sfx", "Strike on a wooden shield: resonant board knock and splinter crack.")
def hit_wood_shield(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(240, 0.4, _sub(r), q=7, hard=0.7), 0, 0.9)
    s.add(F.knock(510, 0.25, _sub(r), q=6, hard=0.3), 0, 0.5)
    s.add(F.thump(115, 0.3, _sub(r), drop=0.6, click=0.6, decay=0.04), 0, 0.6)
    s.add(F.grit(0.08, _sub(r), density=1200, band=(1200, 7000)), 0.003, 0.35)
    return finish(s.buf, "room", 0.12)


@asset("block_shield", "sfx", "Shield block: wood-and-iron shield takes the blow, the rim rings.")
def block_shield(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(300, 0.35, _sub(r), q=6, hard=0.7), 0, 0.8)
    s.add(I.metal(1050, 0.6, vel=0.8, seed=_sub(r), decay=0.2, noise=0.5), 0, 0.35)
    s.add(F.thump(100, 0.3, _sub(r), drop=0.8, click=0.7, decay=0.04), 0, 0.7)
    return finish(s.buf, "room", 0.12)


@asset("armor_absorb", "sfx", "Armour absorbs: dull, damped clank.")
def armor_absorb(seed):
    r = rng(seed)
    s = S()
    s.add(lowpass(I.metal(300, 0.3, vel=0.8, seed=_sub(r), decay=0.07, damp=2.0, bright=0.5), 2200), 0, 0.8)
    s.add(F.thump(110, 0.25, _sub(r), drop=0.5, click=0.4, decay=0.03), 0, 0.6)
    s.add(F.chain_rattle(0.15, _sub(r), density=60, size=1.3, heavy=0.0), 0.01, 0.12)
    return finish(s.buf, "small", 0.12)


@asset("guard_gain", "sfx", "Guard gained: protective rising shimmer (soft bells and glassy air).")
def guard_gain(seed):
    r = rng(seed)
    s = S()
    s.add(F.noise_swell(0.5, 500, 6000, _sub(r)), 0, 0.25)
    for k, nn in enumerate(["D5", "A5", "E6"]):
        s.add(I.handbell(nn, 1.6, vel=0.6, seed=_sub(r), decay=0.45), 0.35 + 0.06 * k, 0.3)
    s.add(F.sparkle(1.0, _sub(r), rate=35, env_pts=[(0, 0.2), (0.4, 1), (1.0, 0)]), 0.2, 0.2)
    s.add(I.glass("A4", 1.5, seed=_sub(r)), 0.35, 0.25)
    return finish(s.buf, "chapel", 0.2)


@asset("guard_break", "sfx", "Guard broken: crack and shatter of a ward, metallic shards and a low drop.")
def guard_break(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(1800, 0.08, _sub(r), q=3, hard=1.0), 0, 0.6)
    s.add(F.grit(0.25, _sub(r), density=1500, band=(1500, 9000)), 0, 0.5)
    s.add(F.sparkle(0.6, _sub(r), rate=120, fband=(2500, 9000), decay=0.02, env_pts=[(0, 1), (0.6, 0)]), 0.0, 0.5)
    s.add(F.thump(70, 0.5, _sub(r), drop=0.8, click=0.4, decay=0.08), 0.0, 0.7)
    n = n_of(0.8)
    t = tvec(n)
    f = curve(n, [(0, 900), (0.8, 200)], log=True)
    s.add(np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.2) * (1 - np.exp(-t / 0.003)), 0, 0.25)
    return finish(s.buf, "room", 0.18)


@asset("miss_whoosh", "sfx", "Miss: airy whoosh passing by.")
def miss_whoosh(seed):
    r = rng(seed)
    y = F.whoosh(0.42, 380, 1700, 500, peak_at=0.5, bw=1.4, seed=_sub(r), sharp=1.8)
    return finish(y, "small", 0.1)


@asset("bow_draw", "sfx", "Bow draw: creaking wood limbs and rising string tension.")
def bow_draw(seed):
    r = rng(seed)
    s = S()
    s.add(F.stick_slip(0.7, [(0, 25), (0.7, 85)], _sub(r), res=((520, 6), (1100, 8), (2100, 9)),
                       amp_pts=[(0, 0), (0.1, 0.6), (0.7, 1)]), 0, 0.6)
    n = n_of(0.7)
    t = tvec(n)
    f = curve(n, [(0, 160), (0.7, 240)])
    tone = np.sin(TAU * np.cumsum(f) / SR) * (0.5 + 0.5 * np.abs(smooth_noise(n, 30, r))) * (t / 0.7)
    s.add(lowpass(tone, 800), 0, 0.12)
    s.add(F.leather(0.3, _sub(r)), 0, 0.2)
    return finish(s.buf, "small", 0.1)


@asset("bow_release", "sfx", "Bow release: string twang, thrum and the arrow's flight.")
def bow_release(seed):
    r = rng(seed)
    s = S()
    tw = I.lute(110, 0.6, vel=1.0, variant=1, bright=0.9, t60=0.35)
    s.add(tw, 0, 0.8)
    s.add(F.thump(140, 0.15, _sub(r), drop=0.4, click=0.5, decay=0.02), 0, 0.4)
    s.add(F.whoosh(0.35, 1500, 3200, 700, peak_at=0.25, bw=0.9, seed=_sub(r), color="white", tone=0.15), 0.02, 0.5)
    return finish(s.buf, "small", 0.1)


@asset("arrow_impact", "sfx", "Arrow thunks into wood; the shaft quivers.")
def arrow_impact(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(340, 0.2, _sub(r), q=5, hard=1.0), 0, 0.8)
    s.add(F.knock(1100, 0.08, _sub(r), q=3, hard=1.0), 0, 0.4)
    s.add(F.thump(150, 0.2, _sub(r), drop=0.5, click=0.6, decay=0.02), 0, 0.35)
    n = n_of(0.3)
    t = tvec(n)
    q = np.sin(TAU * 185 * t) * (0.6 + 0.4 * np.sin(TAU * 24 * t)) * np.exp(-t / 0.08)
    s.add(q, 0.005, 0.3)
    return finish(s.buf, "small", 0.1)


@asset("crossbow_shot", "sfx", "Crossbow: trigger clack, heavy string thwack, bolt whoosh.")
def crossbow_shot(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(1900, 0.05, _sub(r), q=6, hard=1.0), 0, 0.4)
    s.add(I.metal(2200, 0.1, vel=0.6, seed=_sub(r), decay=0.02), 0, 0.2)
    tw = saturate(I.lute(78, 0.5, vel=1.0, variant=2, bright=1.0, t60=0.2), 2.0)
    s.add(tw, 0.03, 0.9)
    s.add(F.thump(95, 0.2, _sub(r), drop=0.6, click=0.7, decay=0.03), 0.03, 0.6)
    s.add(F.whoosh(0.3, 1200, 3000, 600, peak_at=0.2, bw=0.9, seed=_sub(r), color="white"), 0.05, 0.5)
    return finish(s.buf, "small", 0.1)


@asset("bolt_impact", "sfx", "Crossbow bolt impact: heavy thunk with splintering crack.")
def bolt_impact(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(220, 0.25, _sub(r), q=5, hard=0.9), 0, 0.9)
    s.add(F.thump(90, 0.3, _sub(r), drop=0.8, click=0.8, decay=0.04), 0, 0.7)
    s.add(F.grit(0.12, _sub(r), density=1300, band=(1000, 7000)), 0.003, 0.4)
    s.add(I.metal(1600, 0.15, vel=0.6, seed=_sub(r), decay=0.03), 0, 0.15)
    return finish(s.buf, "room", 0.1)


def _fm(n, fc, ratio, index, r):
    fc = np.asarray(fc) if np.ndim(fc) else np.full(n, fc)
    mod = np.sin(TAU * np.cumsum(fc * ratio) / SR + r.uniform(0, TAU))
    return np.sin(TAU * np.cumsum(fc) / SR + index * mod)


@asset("spell_arcane_cast", "sfx", "Arcane cast: rising FM shimmer with gathering sparkles.")
def spell_arcane_cast(seed):
    r = rng(seed)
    s = S()
    d = 1.1
    n = n_of(d)
    t = tvec(n)
    fc = curve(n, [(0, 300), (d, 900)], log=True)
    idx = 2.5 * np.exp(-t / 0.6) + 0.5
    for k, det in enumerate((1.0, 1.007, 1.5)):
        y = _fm(n, fc * det, 1.414, idx, r) * adsr(n, 0.5, 0, 1, 0.35)
        s.add(y, 0, 0.25 if k < 2 else 0.12)
    s.add(F.noise_swell(d, 400, 7000, _sub(r)), 0, 0.2)
    s.add(F.sparkle(d, _sub(r), rate=50, env_pts=[(0, 0), (d * 0.8, 1), (d, 0.3)]), 0, 0.25)
    return finish(s.buf, "chapel", 0.22)


@asset("spell_arcane_impact", "sfx", "Arcane impact: burst of inharmonic tones, glass and a low blow.")
def spell_arcane_impact(seed):
    r = rng(seed)
    s = S()
    s.add(I.metal(880, 1.5, vel=0.9, seed=_sub(r), decay=0.5, ratios=[1.0, 1.41, 2.0, 2.83, 3.46, 4.24], noise=0.2), 0, 0.4)
    s.add(I.glass("D6", 1.2, seed=_sub(r)), 0, 0.2)
    s.add(F.thump(60, 0.5, _sub(r), drop=1.0, click=0.5, decay=0.09), 0, 0.8)
    s.add(F.whoosh(0.5, 4000, 2500, 300, peak_at=0.05, bw=1.5, seed=_sub(r)), 0, 0.4)
    s.add(F.sparkle(0.8, _sub(r), rate=80, env_pts=[(0, 1), (0.8, 0)]), 0, 0.25)
    return finish(s.buf, "chapel", 0.22)


@asset("rune_place", "sfx", "Rune placed: stone tap, deep resonant thoom and a glassy ring.")
def rune_place(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(700, 0.1, _sub(r), q=4, hard=0.6), 0, 0.4)
    s.add(F.thump(58, 0.9, _sub(r), drop=0.5, click=0.1, decay=0.25), 0.01, 0.8)
    s.add(I.glass("A5", 1.6, seed=_sub(r)), 0.02, 0.22)
    s.add(I.bowed_metal(116, 1.4, seed=_sub(r), swell=0.1, n_modes=5), 0.0, 0.15)
    return finish(s.buf, "chapel", 0.2)


@asset("teleport", "sfx", "Teleport: inhaled reverse swell snapping into a falling shimmer.")
def teleport(seed):
    r = rng(seed)
    s = S()
    s.add(F.noise_swell(0.45, 300, 7000, _sub(r)), 0, 0.5)
    n = n_of(0.8)
    t = tvec(n)
    fc = curve(n, [(0, 1400), (0.8, 180)], log=True)
    y = _fm(n, fc, 2.01, 1.5 * np.exp(-t / 0.3), r) * np.exp(-t / 0.25) * (1 - np.exp(-t / 0.002))
    s.add(y, 0.45, 0.35)
    s.add(F.sparkle(0.6, _sub(r), rate=70, env_pts=[(0, 1), (0.6, 0)]), 0.45, 0.25)
    s.add(F.thump(90, 0.3, _sub(r), drop=0.8, click=0.2, decay=0.05), 0.45, 0.4)
    return finish(s.buf, "chapel", 0.2)


@asset("holy_cast", "sfx", "Holy cast: choir swelling a D major chord with bell shimmer.")
def holy_cast(seed):
    r = rng(seed)
    s = S()
    for voice, nn, g in [("tenor", "A3", 0.3), ("alto", "F#4", 0.25), ("soprano", "D5", 0.22)]:
        s.add(I.choir([hz(nn)], 1.6, voice, "a", attack=0.45, release=0.8, seed=_sub(r), n_voices=4), 0, g)
    s.add(F.noise_swell(0.5, 800, 8000, _sub(r)), 0, 0.12)
    for k, nn in enumerate(["A5", "D6", "F#6"]):
        s.add(I.handbell(nn, 1.2, vel=0.5, seed=_sub(r), decay=0.4), 0.4 + 0.07 * k, 0.15)
    return finish(s.buf, "chapel", 0.3)


@asset("holy_impact", "sfx", "Holy impact: radiant bright bell chord bursting over a low blow.")
def holy_impact(seed):
    r = rng(seed)
    s = S()
    for k, nn in enumerate(["D5", "F#5", "A5"]):
        s.add(I.bell(nn, 2.5, vel=1.0, seed=_sub(r), decay=0.35), 0.003 * k, 0.3)
    s.add(F.thump(70, 0.5, _sub(r), drop=1.0, click=0.5, decay=0.07), 0, 0.6)
    s.add(F.whoosh(0.4, 6000, 4000, 1000, peak_at=0.05, bw=1.4, seed=_sub(r), color="white"), 0, 0.3)
    s.add(F.sparkle(0.9, _sub(r), rate=70, env_pts=[(0, 1), (0.9, 0)]), 0, 0.2)
    return finish(s.buf, "cathedral", 0.22, thresh=-56)


@asset("heal", "sfx", "Heal: warm rising arpeggio of soft flute-organ tones and a gentle choir.")
def heal(seed):
    r = rng(seed)
    s = S()
    for k, nn in enumerate(["D4", "F#4", "A4", "D5"]):
        o = I.organ([hz(nn)], 1.4 - 0.15 * k, stop="flute", attack=0.12, release=0.5, seed=_sub(r), chiff=0.03,
                    octave_rank=0.1)
        s.add(o, 0.12 * k, 0.25)
    s.add(I.choir(["A3", "D4"], 1.8, "alto", "u", attack=0.5, release=0.9, seed=_sub(r), n_voices=4), 0, 0.25)
    s.add(F.sparkle(1.3, _sub(r), rate=25, fband=(2000, 6000), decay=0.08, env_pts=[(0, 0), (0.6, 1), (1.3, 0)]), 0.2, 0.15)
    return finish(s.buf, "chapel", 0.25)


@asset("bless", "sfx", "Blessing: soft bell with a short choir 'oh' and a faint shimmer.")
def bless(seed):
    r = rng(seed)
    s = S()
    s.add(I.bell("A4", 3.0, vel=0.6, seed=_sub(r), decay=0.45), 0, 0.45)
    for voice, nn in (("tenor", "D4"), ("alto", "F#4")):
        s.add(I.choir([hz(nn)], 1.8, voice, "o", attack=0.35, release=1.0, seed=_sub(r), n_voices=4), 0.05, 0.22)
    s.add(F.sparkle(1.0, _sub(r), rate=20, env_pts=[(0, 0.5), (1.0, 0)]), 0.05, 0.12)
    return finish(s.buf, "chapel", 0.28)


@asset("profane_hit", "sfx", "Profane hit: dark distorted ring-modulated blow with a sucked-in swell.")
def profane_hit(seed):
    r = rng(seed)
    s = S()
    s.add(F.noise_swell(0.3, 200, 2500, _sub(r)), 0, 0.3)
    n = n_of(1.0)
    t = tvec(n)
    tone = sum(np.sin(TAU * f * t + r.uniform(0, TAU)) for f in (55, 58.3, 110.7, 82.0))
    tone *= np.sin(TAU * 33 * t)
    tone *= np.exp(-t / 0.3) * (1 - np.exp(-t / 0.003))
    s.add(tone, 0.3, 0.4)
    s.add(F.thump(48, 0.6, _sub(r), drop=1.2, click=0.6, decay=0.1), 0.3, 0.8)
    s.add(F.growl(0.6, _sub(r), f0_pts=[(0, 60), (0.6, 40)], size=1.8, amp_pts=[(0, 1), (0.6, 0)]), 0.3, 0.3)
    y = saturate(s.buf / peak(s.buf), 3.0, oversample=4)
    return finish(lowpass(y, 5000), "crypt", 0.2)


@asset("cond_poison", "sfx", "Poisoned: sickly bubbling with a queasy detuned wobble.")
def cond_poison(seed):
    r = rng(seed)
    s = S()
    s.add(F.bubbles(0.9, _sub(r), rate=24, fband=(250, 700)), 0, 0.6)
    n = n_of(1.0)
    t = tvec(n)
    tone = np.sin(TAU * 220 * t + 3 * np.sin(TAU * 4.5 * t)) + np.sin(TAU * 233 * t)
    s.add(lowpass(tone * adsr(n, 0.2, 0, 1, 0.5), 1200), 0, 0.15)
    s.add(F.noise_swell(0.6, 800, 3000, _sub(r), reverse=False), 0.05, 0.15)
    return finish(s.buf, "small", 0.12)


@asset("cond_bleed", "sfx", "Bleeding: a short slash and wet drips.")
def cond_bleed(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.15, 2000, 3500, 1200, peak_at=0.4, bw=0.8, seed=_sub(r), color="white"), 0, 0.35)
    s.add(lowpass(_flesh(r), 2500), 0.08, 0.4)
    for k in range(4):
        s.add(F.drip(_sub(r), f0=r.uniform(500, 900), dur=0.15), 0.18 + 0.09 * k + r.uniform(0, 0.03), 0.25)
    return finish(s.buf, "small", 0.1)


@asset("cond_burn", "sfx", "Burning: ignition whoosh into crackling flame.")
def cond_burn(seed):
    return finish(F.ignite(1.2, seed), "small", 0.1)


@asset("cond_stun", "sfx", "Stunned: blow followed by high, beating tinnitus ring.")
def cond_stun(seed):
    r = rng(seed)
    s = S()
    n = n_of(1.4)
    t = tvec(n)
    ring = (np.sin(TAU * 3150 * t) + np.sin(TAU * 3163 * t) + 0.5 * np.sin(TAU * 4720 * t)) * \
        np.exp(-t / 0.45) * (1 - np.exp(-t / 0.01))
    s.add(ring, 0.02, 0.2)
    s.add(F.thump(80, 0.4, _sub(r), drop=1.0, click=0.6, decay=0.05), 0, 0.7)
    s.add(I.metal(1300, 0.6, vel=0.7, seed=_sub(r), decay=0.15), 0, 0.25)
    return finish(s.buf, "small", 0.1)


@asset("cond_immobilize", "sfx", "Immobilised: chains whip round and an iron clamp bites shut.")
def cond_immobilize(seed):
    r = rng(seed)
    s = S()
    s.add(F.chain_rattle(0.45, _sub(r), density=60, env_pts=[(0, 0.4), (0.3, 1), (0.45, 0.5)], heavy=0.4), 0, 0.6)
    s.add(I.metal(420, 0.6, vel=1.0, seed=_sub(r), decay=0.18, noise=0.7), 0.38, 0.6)
    s.add(F.thump(100, 0.3, _sub(r), drop=0.6, click=0.8, decay=0.03), 0.38, 0.5)
    s.add(F.knock(2000, 0.05, _sub(r), q=7, hard=0.9), 0.44, 0.25)
    return finish(s.buf, "room", 0.12)


@asset("cond_exposed", "sfx", "Exposed: thin crackling and a descending hollow tone.")
def cond_exposed(seed):
    r = rng(seed)
    s = S()
    s.add(F.grit(0.35, _sub(r), density=500, band=(2000, 8000)), 0, 0.4)
    n = n_of(0.7)
    t = tvec(n)
    f = curve(n, [(0, 900), (0.7, 480)], log=True)
    y = np.sin(TAU * np.cumsum(f) / SR) + 0.4 * np.sin(TAU * np.cumsum(f * 1.51) / SR)
    s.add(y * adsr(n, 0.02, 0, 1, 0.5), 0.05, 0.3)
    s.add(I.glass("E6", 0.6, seed=_sub(r)), 0, 0.12)
    return finish(s.buf, "room", 0.15)


@asset("cond_broken", "sfx", "Broken: sharp snapping crack with a crunchy splinter.")
def cond_broken(seed):
    r = rng(seed)
    s = S()
    s.add(F.knock(1800, 0.06, _sub(r), q=3, hard=1.0), 0, 0.7)
    s.add(F.thump(200, 0.15, _sub(r), drop=0.4, click=0.9, decay=0.02), 0, 0.6)
    s.add(F.grit(0.12, _sub(r), density=2000, band=(800, 4500)), 0.004, 0.6)
    s.add(F.knock(900, 0.08, _sub(r), q=3, hard=0.8), 0.035, 0.35)
    return finish(s.buf, "small", 0.1)


@asset("cond_cleanse", "sfx", "Cleansed: airy upward breath with a soft bell sparkle.")
def cond_cleanse(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.6, 500, 5000, 4000, peak_at=0.7, bw=1.4, seed=_sub(r)), 0, 0.45)
    s.add(I.handbell("A5", 1.4, vel=0.6, seed=_sub(r), decay=0.4), 0.4, 0.3)
    s.add(I.handbell("E6", 1.4, vel=0.5, seed=_sub(r), decay=0.4), 0.47, 0.2)
    s.add(F.sparkle(0.9, _sub(r), rate=40, env_pts=[(0, 0), (0.4, 1), (0.9, 0)]), 0.1, 0.2)
    return finish(s.buf, "chapel", 0.2)


def _step(seed, variant, armour=0.0):
    return finish(F.footstep(variant, seed, armour=armour), "small", 0.1)


@asset("step_stone_1", "sfx", "Footstep on stone (heel, toe, grit).", gain_db=-8.0, group="step_stone")
def step_stone_1(seed):
    return _step(seed, 0)


@asset("step_stone_2", "sfx", "Footstep on stone variant.", gain_db=-8.0, group="step_stone")
def step_stone_2(seed):
    return _step(seed, 1)


@asset("step_stone_3", "sfx", "Footstep on stone variant, with a faint mail jingle.", gain_db=-8.0, group="step_stone")
def step_stone_3(seed):
    return _step(seed, 2, armour=0.6)


@asset("dash", "sfx", "Dash: quick rush of air over two fast footfalls.")
def dash(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.4, 300, 1500, 400, peak_at=0.4, bw=1.3, seed=_sub(r)), 0, 0.7)
    s.add(F.footstep(0, _sub(r)), 0.02, 0.45)
    s.add(F.footstep(1, _sub(r)), 0.2, 0.55)
    return finish(s.buf, "small", 0.1)


@asset("push_impact", "sfx", "Shove impact: body thud and a short scrape across stone.")
def push_impact(seed):
    r = rng(seed)
    s = S()
    s.add(F.thump(75, 0.4, _sub(r), drop=0.8, click=0.7, decay=0.06), 0, 1.0)
    s.add(F.grind(0.45, _sub(r)) * adsr(n_of(0.45), 0.02, 0, 1, 0.3), 0.04, 0.35)
    s.add(F.chain_rattle(0.2, _sub(r), density=50, heavy=0.0), 0.0, 0.12)
    return finish(s.buf, "room", 0.12)


@asset("body_fall", "sfx", "Hero falls: cloth rush, armour clatter and a heavy body thud.")
def body_fall(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(0.35, 200, 800, 250, peak_at=0.7, bw=1.4, seed=_sub(r)), 0, 0.4)
    s.add(F.thump(58, 0.6, _sub(r), drop=1.0, click=0.8, decay=0.09), 0.3, 1.0)
    s.add(F.chain_rattle(0.4, _sub(r), density=55, size=1.1, env_pts=[(0, 1), (0.4, 0)], heavy=0.5), 0.3, 0.4)
    s.add(I.metal(380, 0.5, vel=0.8, seed=_sub(r), decay=0.12, damp=1.5), 0.32, 0.25)
    s.add(F.thump(80, 0.3, _sub(r), drop=0.5, click=0.4, decay=0.04), 0.52, 0.45)
    s.add(I.metal(520, 0.3, vel=0.6, seed=_sub(r), decay=0.07), 0.55, 0.15)
    return finish(s.buf, "room", 0.15)


@asset("rise_up", "sfx", "Rise up: cloth rustle, mail clinks and an upward breath of air.")
def rise_up(seed):
    r = rng(seed)
    s = S()
    s.add(lowpass(F.paper(0.6, _sub(r), density=0.5, crinkle=0.3, swish=0.9), 3000), 0, 0.4)
    s.add(F.chain_rattle(0.5, _sub(r), density=35, env_pts=[(0, 0.2), (0.3, 1), (0.5, 0)], heavy=0.2), 0.1, 0.3)
    s.add(F.whoosh(0.6, 200, 1400, 1000, peak_at=0.8, bw=1.4, seed=_sub(r)), 0.1, 0.4)
    s.add(F.footstep(2, _sub(r)), 0.62, 0.4)
    return finish(s.buf, "room", 0.12)


@asset("death_enemy", "sfx", "Enemy death: body crumbles to ash, a falling sigh of air.")
def death_enemy(seed):
    r = rng(seed)
    s = S()
    s.add(F.ash(1.6, _sub(r), 3500, 250), 0, 0.7)
    s.add(F.whoosh(1.0, 900, 600, 150, peak_at=0.15, bw=1.5, seed=_sub(r)), 0, 0.35)
    b = F.breath(1.2, _sub(r), rate=0.6, size=1.4, voiced=0.4)
    s.add(lowpass(b, 1200) * adsr(n_of(1.2), 0.1, 0, 1, 0.8), 0.05, 0.25)
    s.add(F.thump(60, 0.4, _sub(r), drop=0.6, click=0.2, decay=0.07), 0, 0.4)
    return finish(s.buf, "chapel", 0.2)


@asset("enemy_spawn", "sfx", "Enemy spawn: low bell toll and a rushing column of ash.")
def enemy_spawn(seed):
    r = rng(seed)
    s = S()
    s.add(F.noise_swell(0.7, 150, 3000, _sub(r)), 0, 0.4)
    s.add(lowpass(I.bell("D3", 4.0, vel=0.8, seed=_sub(r), decay=0.5), 1800), 0.7, 0.6)
    s.add(F.ash(1.2, _sub(r), 2000, 400, density=1.5), 0.7, 0.45)
    s.add(F.thump(55, 0.6, _sub(r), drop=0.6, click=0.3, decay=0.1), 0.7, 0.5)
    return finish(s.buf, "chapel", 0.22)


@asset("bell_toll_short", "sfx", "Single bell toll (D4), short tail.")
def bell_toll_short(seed):
    y = I.bell("D4", 3.5, vel=1.0, seed=seed, decay=0.55, bright=1.25)
    return finish(y, "chapel", 0.25, thresh=-55)


@asset("bell_toll_long", "sfx", "Bell toll (A3) with a long, cathedral tail.", cost=2)
def bell_toll_long(seed):
    y = I.bell("A3", 9.0, vel=1.0, seed=seed, decay=1.25, bright=1.3)
    return finish(y, "cathedral", 0.3, thresh=-56)


@asset("bell_great_cracked", "sfx", "Severin's great cracked bell (D2): split, rattling partials and huge decay.", cost=3)
def bell_great_cracked(seed):
    r = rng(seed)
    s = S()
    s.add(I.bell("D2", 12.0, vel=1.0, seed=_sub(r), cracked=0.9, decay=1.5), 0, 1.0)
    s.add(I.taiko(40, 0.8, seed=_sub(r), dur=1.5), 0, 0.35)
    return finish(s.buf, "cathedral", 0.3, thresh=-56)


@asset("resonance_up", "sfx", "Resonance rising: tension swell of choir, bowed bronze and rising air.", cost=2)
def resonance_up(seed):
    r = rng(seed)
    s = S()
    d = 2.4
    n = n_of(d)
    s.add(F.noise_swell(d, 200, 5000, _sub(r)), 0, 0.3)
    c = I.choir(["D3", "A3", "Eb4"], d + 0.2, "tenor", "a", attack=d * 0.8, release=0.2, seed=_sub(r), n_voices=4)
    s.add(c, 0, 0.35)
    s.add(I.bowed_metal(196, d + 0.3, seed=_sub(r), swell=0.9), 0, 0.2)
    t = tvec(n)
    for k in range(3):
        f = 110 * 2 ** k * 2 ** (t / d)
        s.add(np.sin(TAU * np.cumsum(f) / SR) * (t / d) ** 2 * 0.3 / (1 + k), 0, 0.5)
    return finish(s.buf, "chapel", 0.18)


@asset("chant_note", "sfx", "Single choral note: low monks singing 'oh' on D3.", cost=2)
def chant_note(seed):
    r = rng(seed)
    s = S()
    s.add(I.choir(["D3"], 2.6, "bass", "o", attack=0.35, release=1.2, seed=_sub(r), n_voices=6), 0, 0.6)
    s.add(I.choir(["D3"], 2.6, "tenor", "o", attack=0.4, release=1.2, seed=_sub(r), n_voices=4), 0, 0.35)
    return finish(s.buf, "chapel", 0.3)


@asset("dog_snarl", "sfx", "Hound snarl: rough rising growl, lips drawn back, ending in a snap.", cost=2)
def dog_snarl(seed):
    r = rng(seed)
    s = S()
    d = 1.5
    g = F.growl(d, _sub(r), f0_pts=[(0, 68), (0.5, 82), (1.0, 110), (d, 95)],
                snarl_pts=[(0, 0.1), (0.7, 0.6), (1.2, 1.0), (d, 0.7)],
                amp_pts=[(0, 0), (0.12, 0.5), (0.9, 0.8), (1.25, 1.0), (d, 0)])
    s.add(g, 0, 0.9)
    s.add(F.knock(1500, 0.05, _sub(r), q=3, hard=1.0), d - 0.12, 0.35)  # teeth snap
    s.add(F.thump(140, 0.1, _sub(r), drop=0.3, click=0.5, decay=0.015), d - 0.12, 0.25)
    return finish(s.buf, "room", 0.12)


@asset("chain_rattle", "sfx", "Chain rattle: heavy links shaken and dragged.")
def chain_rattle(seed):
    r = rng(seed)
    y = F.chain_rattle(1.2, _sub(r), density=70, size=1.2, env_pts=[(0, 0.3), (0.2, 1), (0.6, 0.7), (1.2, 0)], heavy=0.5)
    return finish(y, "room", 0.12)


@asset("counterweight_drop", "sfx", "Counterweight released: ratchet clicks speeding up, rope rush, a massive "
       "wood-and-iron impact and settling chains.", cost=2)
def counterweight_drop(seed):
    r = rng(seed)
    s = S()
    t = 0.0
    gap = 0.11
    for k in range(9):
        s.add(F.knock(1600, 0.05, _sub(r), q=6, hard=0.9), t, 0.3)
        s.add(F.knock(450, 0.08, _sub(r), q=5, hard=0.2), t, 0.25)
        t += gap
        gap *= 0.8
    s.add(F.whoosh(0.45, 300, 1200, 400, peak_at=0.6, bw=1.4, seed=_sub(r)), t - 0.2, 0.4)
    hit = t + 0.25
    s.add(I.taiko(45, 1.0, seed=_sub(r), dur=1.5), hit, 0.8)
    s.add(F.knock(130, 0.5, _sub(r), q=4, hard=0.8), hit, 0.6)
    s.add(I.metal(240, 1.0, vel=1.0, seed=_sub(r), decay=0.3, damp=1.2, noise=0.8), hit, 0.45)
    s.add(F.grit(0.3, _sub(r), density=800, band=(600, 5000)), hit, 0.3)
    s.add(F.chain_rattle(0.9, _sub(r), density=40, env_pts=[(0, 1), (0.9, 0)], heavy=0.6), hit + 0.05, 0.3)
    return finish(s.buf, "crypt", 0.25)


@asset("door_stone", "sfx", "Stone door grinding open and settling with a heavy thud.", cost=2)
def door_stone(seed):
    r = rng(seed)
    s = S()
    d = 2.4
    g = F.grind(d, _sub(r)) * adsr(n_of(d), 0.25, 0, 1, 0.3)
    s.add(g, 0, 0.7)
    s.add(F.thump(52, 0.8, _sub(r), drop=0.5, click=0.6, decay=0.12), d - 0.05, 0.9)
    s.add(F.grit(0.5, _sub(r), density=400, band=(500, 4000)), d - 0.05, 0.25)
    return finish(s.buf, "crypt", 0.25)


@asset("whoosh_transition", "sfx", "Scene transition: long cinematic whoosh with a low bloom at its crest.", cost=2)
def whoosh_transition(seed):
    r = rng(seed)
    s = S()
    s.add(F.whoosh(1.6, 150, 3000, 200, peak_at=0.55, bw=1.6, seed=_sub(r), sharp=2.2), 0, 0.8)
    s.add(F.thump(48, 1.2, _sub(r), drop=0.4, click=0.0, decay=0.35), 0.85, 0.5)
    s.add(lowpass(I.bell("D3", 3.0, vel=0.5, seed=_sub(r), decay=0.4), 900), 0.85, 0.2)
    return finish(s.buf, "cathedral", 0.18, thresh=-55)


@asset("page_turn", "sfx", "Book page turn (heavier, for lore books).")
def page_turn(seed):
    return finish(F.page_turn(seed + 4, 0.8), "room", 0.12)


@asset("level_up", "sfx", "Mastery / talent gained: rolled warm bell chord in D major with a choir bloom.", cost=2)
def level_up(seed):
    r = rng(seed)
    s = S()
    for k, nn in enumerate(["D3", "A3", "D4", "F#4", "A4", "D5"]):
        s.add(I.bell(nn, 4.0, vel=0.85, seed=_sub(r), decay=0.6), 0.08 * k, 0.28)
    for voice, nn, g in [("tenor", "A3", 0.18), ("alto", "F#4", 0.15), ("soprano", "A4", 0.12)]:
        s.add(I.choir([hz(nn)], 2.8, voice, "a", attack=0.5, release=1.6, seed=_sub(r), n_voices=4), 0.2, g)
    s.add(F.sparkle(2.0, _sub(r), rate=30, env_pts=[(0, 0), (0.5, 1), (2.0, 0)]), 0.3, 0.15)
    return finish(s.buf, "chapel", 0.28, thresh=-58)
