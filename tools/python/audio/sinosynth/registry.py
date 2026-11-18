"""Asset registry: every sound is a decorated render function."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

REGISTRY: dict[str, "Asset"] = {}

CATEGORY_DEFAULTS = {
    # category: (stereo, bitrate, default gainDb)
    "music": (True, "160k", -3.0),
    "sting": (True, "160k", -2.0),
    "ambience": (True, "128k", -2.0),
    "ui": (False, "112k", -6.0),
    "sfx": (False, "112k", -1.0),
}


@dataclass
class Asset:
    id: str
    category: str
    fn: Callable
    description: str
    loop: bool = False
    bpm: float | None = None
    gain_db: float | None = None
    cost: float = 1.0
    group: str | None = None
    target_rms_db: float | None = None
    extra: dict = field(default_factory=dict)

    @property
    def stereo(self) -> bool:
        return CATEGORY_DEFAULTS[self.category][0]

    @property
    def bitrate(self) -> str:
        return CATEGORY_DEFAULTS[self.category][1]

    @property
    def playback_gain_db(self) -> float:
        return self.gain_db if self.gain_db is not None else CATEGORY_DEFAULTS[self.category][2]


def asset(id, category, description, loop=False, bpm=None, gain_db=None, cost=1.0, group=None,
          target_rms_db=None, **extra):
    def deco(fn):
        if id in REGISTRY:
            raise ValueError(f"duplicate asset id {id}")
        REGISTRY[id] = Asset(id, category, fn, description, loop, bpm, gain_db, cost, group,
                             target_rms_db, extra)
        return fn
    return deco


def load_all():
    from . import music, ambience, sfx  # noqa: F401  (registration side effects)
    return REGISTRY
