# Procedural audio — Mosteiro do Sino Partido

All music, ambience and sound effects of the game are **synthesised from scratch by the Python code in this
folder**. There are no samples, recordings, sound libraries or third-party material of any kind.

## Rebuild

From the repository root:

```bash
python3 tools/python/audio/build_audio.py                 # everything (~1 min on 4 cores)
python3 tools/python/audio/build_audio.py --only music_title,ui_click   # rebuild some ids, merge manifest
python3 tools/python/audio/build_audio.py --list          # list all asset ids
python3 -m pytest tools/python/audio/test_audio.py -q     # validate the output
```

Requirements: Python 3.11+ with `numpy`, `scipy`, `soundfile`, `pytest`, and `ffmpeg` with `libmp3lame`.
Intermediate float WAVs go to `--tmp DIR` / `$MOSTEIRO_AUDIO_TMP` (default: a fresh system temp dir) and are deleted
after encoding (set `KEEP_WAV=1` to keep them).

Output: `apps/web/public/assets/audio/<id>.mp3` and `apps/web/public/assets/audio/manifest.json`.

The build is **deterministic**: every asset's random seed is the CRC32 of its id, so a rebuild with the same
toolchain produces byte-identical files.

## Layout

| file | role |
|---|---|
| `build_audio.py` | render (multiprocessing) → master → WAV → ffmpeg MP3 → decode-and-measure → `manifest.json` |
| `test_audio.py` | pytest checks on the produced files and on the synth library |
| `sinosynth/core.py` | envelopes, noise colours, Butterworth/RBJ filters, STFT time-varying filter, saturation, look-ahead limiter, panning/Haas, loop helpers, the wrap-around `Mix` timeline |
| `sinosynth/osc.py` | band-limited oscillators (polyBLEP saw/pulse), additive synthesis |
| `sinosynth/reverb.py` | algorithmic convolution reverb (spaces: cathedral, hall, chapel, crypt, room, small, distant) |
| `sinosynth/instruments.py` | bells (clean / cracked / hand bell), choir, strings, organ, drone, flute, lute, frame drum, tom, taiko, timpani, gong, metal, bowed metal, glass |
| `sinosynth/foley.py` | whooshes, wind, fire, creaks (stick-slip), stone grinding, leather, chains, coins, knocks, thumps, footsteps, paper, drips, bubbles, growl, breath, sparkle, ash |
| `sinosynth/theory.py` | chord spelling, voice-led SATB voicings, the bell motif |
| `sinosynth/music.py`, `ambience.py`, `sfx.py` | the asset recipes (each is a `@asset(...)`-decorated function) |

## Techniques

**Bells.** Additive model of a minor-third church bell. Partials relative to the strike (prime) pitch:
hum 0.5, prime 1.0, tierce 1.2 (minor third), quint 1.5, nominal 2.0, then 2.5, 2.67, 3.0, 3.36, 4.0, 4.7, 5.33, 6.0.
Each partial has its own exponential decay (hum longest, upper partials shortest; base decay scales with pitch)
and is a slightly mistuned *doublet* so it beats slowly like a real (asymmetric) bell. Velocity raises the upper
partials. The strike adds short high inharmonic "clang" partials plus a band-passed contact-noise burst.
The **cracked bell** (`cracked=0..1`) adds split/shifted dissonant partials (1.065, 1.27, 1.83, 2.13 …), fast
3–11 Hz rough beating, shorter decays, a *rattle* (band-passed noise gated by the bell's own low-mode vibration, i.e.
the crack faces chattering), and oversampled tanh grit. A test checks the partial ratios and that the cracked bell has
deeper 2–25 Hz amplitude modulation and more partials.

**Motif.** D–A–C–B♭–A (long-short-short-short-long), heard on bells in the title, explore (fragments), combat,
mini-boss (cracked, in C♯), boss (cracked, ending on the tritone A♭), defeat (falling) and as a warm relative-major
flute line in the base theme.

**Choir.** Per note 4–6 detuned voices of polyBLEP saw + pulse with random slow pitch drift, delayed vibrato and
amplitude wander, a glottal spectral tilt, breath noise, then a parallel 5-formant resonator bank per voice type
(bass/tenor/alto/soprano) and vowel (a, o, u, e — Csound formant tables). Singers are split in two groups with ±3.5 %
formant shift (different vocal-tract lengths). Vowel morphs (o→a) are cross-faded filter outputs. Stabs use a fast
attack/decay envelope.

**Strings / brass.** Detuned polyBLEP saw ensembles, envelope-driven brightness (crossfade between two low-pass
states), body-resonance EQ, bow noise, optional tremolo and spiccato envelopes. "Brass" = the same through 2× oversampled
saturation.

**Organ / drones / flute.** Additive pipe spectra (flute, principal, reed stops) with chiff noise and an octave rank;
drones are saw+sine stacks whose frequencies are rounded to an integer number of cycles per loop so they are
perfectly periodic; flute = additive + resonant breath noise + delayed vibrato.

**Lute.** Karplus–Strong with a first-order allpass for exact fractional tuning (one `lfilter`), pluck-position comb on
the excitation, doubled course (+2.5 cents), body-resonance EQ.

**Percussion.** Membranes: phase-accumulated sine with pitch-drop envelope plus circular-membrane mode ratios
(1, 1.59, 2.14, 2.30, 2.65 …), stick/skin click noise and body noise (frame drum *doum*/*tek*, toms, taiko).
Timpani: tuned mode set (1, 1.5, 1.74, 2.0, 2.24, 2.49 …) with felt-mallet click and rolls. Gong: inharmonic partials
whose upper modes bloom later. Metal: inharmonic plate modes with beating.

**Foley.** Whooshes = noise through an STFT-domain band-pass whose centre follows a log-frequency curve; wind = pink
noise through a drifting resonance with gust envelopes and narrow whistle bands; fire = flickering brown-noise roar +
licking mid band + Pareto-distributed crackle impulses through resonances + pops; creaks/bow/leather/door = stick-slip
impulse trains with time-varying rate exciting resonator banks; chains/coins = clusters of short inharmonic metallic
clinks; footsteps = heel thump + tock + toe knock + grit; paper = crinkle micro-impulses + swish; drips = Minnaert-like
rising chirps; growl = jittered, shimmered, period-doubled glottal pulse train + turbulence through moving formants
(snarl raises formants); ash = granular impulses swept downward.

**Reverb.** Convolution with *synthesised* impulse responses: decorrelated Gaussian noise per channel, shaped in the
STFT domain by a frequency-dependent exponential decay (RT60 interpolated on log-frequency between low/mid/high
values; e.g. cathedral 4.8 / 3.8 / 1.5 s), air absorption, a density build-up, sparse early reflections and pre-delay.
Music/stings use cathedral, hall or chapel; SFX use small/room/chapel/crypt/cathedral sends (mono).

**Loops.** The `Mix` timeline wraps events that run past the end back to the start, reverb for loops is a *circular*
FFT convolution, stationary noise beds are rendered longer and equal-power cross-fold their tail into their head, and
any filtering of a looped bed is applied with wrapped pre-roll. The result is exactly periodic before encoding.

**Mastering.** Music/stings: gentle bus tilt (−3 dB low shelf @110 Hz, +2.5 dB high shelf @3.2 kHz). DC blocking,
loudness to target and a zero-phase look-ahead limiter (processed circularly for loops):

| category | level target | ceiling |
|---|---|---|
| music | RMS −20 dBFS (explore −21) | −1 dBFS |
| sting | RMS −17 dBFS | −1 dBFS |
| ambience | RMS −26 dBFS (scriptorium −29) | −3 dBFS |
| ui | peak −3 dBFS, tails trimmed at −50 dB | — |
| sfx | peak −1.3 dBFS | — |

Encoding: MP3 44.1 kHz, music/stings 160 kb/s stereo, ambience 128 kb/s stereo, UI/SFX 112 kb/s mono.

## Playing loops in the game (important)

Each looped file contains the loop plus **0.5 s of wrapped pre-roll and post-roll** (the end of the loop before
it, the start of the loop after it). Use Web Audio, not `<audio loop>`:

```ts
const src = ctx.createBufferSource();
src.buffer = await ctx.decodeAudioData(bytes);
src.loop = true;
src.loopStart = entry.loopStart;   // seconds, measured on the decoded MP3
src.loopEnd = entry.loopEnd;
src.start(0, entry.loopStart);
```

`loopStart`/`loopEnd` are measured by decoding the encoded MP3 with ffmpeg and cross-correlating it with the source.
Because the audio around both points is identical, the loop stays seamless even in a decoder that ignores the
LAME gapless header and shifts everything by an encoder-delay frame (±1105 samples); the tests check that case.
`loopSamples`/`loopStartSample` give the same values in samples (44.1 kHz).

## Manifest

```json
{ "version": 1, "generator": "tools/python/audio/build_audio.py", "license": "...",
  "assets": { "<id>": { "file": "<id>.mp3", "category": "music|sting|ambience|ui|sfx", "duration": 66.45,
      "loop": true, "loopStart": 0.5, "loopEnd": 65.95, "bpm": 88, "gainDb": -3, "description": "...",
      "channels": 2, "sampleRate": 44100, "bitrate": "160k", "peakDb": -2.2, "rmsDb": -20.4,
      "loopSamples": 2886545, "loopStartSample": 22050, "group": "..." } },
  "groups": { "step_stone": ["step_stone_1", "step_stone_2", "step_stone_3"], "...": [] } }
```

`gainDb` is a suggested playback gain to balance categories in the game mix (e.g. hover −14 dB, footsteps −8 dB).
`groups` lists interchangeable variants to pick from at random.

## Tests

`test_audio.py` checks: every required id exists in the manifest and on disk, every file decodes (soundfile, ffmpeg
fallback), has the declared duration and channel count, no NaN, no clipping (peak < 0 dBFS), not silent, no DC,
no click at the start/end of one-shots, durations within the expected ranges, category loudness, loop seams (audio
after `loopEnd` equals audio after `loopStart`, wrap jump no larger than normal sample motion, also with ±1 frame
decoder shift), total size < 25 MB, plus synth-library checks (bell partial ratios, cracked-bell roughness, loop
wrap in the mixer, frequency-dependent RT60 of the reverb, determinism).

## Asset list

| id | category | length (s) | | description |
|---|---|---|---|---|
| `ui_hover` | ui | 0.18 |  | Hover: tiny soft bone tick with a faint high glint. |
| `ui_click` | ui | 0.24 |  | Click: dry wooden press with a small low body. |
| `ui_confirm` | ui | 1.97 |  | Confirm: two small bell notes rising a fourth (A5 -> D6) over a soft click. |
| `ui_cancel` | ui | 1.40 |  | Cancel: muted wood tap and a falling fourth (D5 -> A4), soft and dark. |
| `ui_open` | ui | 2.24 |  | Open panel: parchment unfold with a rising air sweep and a soft low bell. |
| `ui_close` | ui | 0.71 |  | Close panel: falling air sweep, folded parchment and a soft wooden settle. |
| `ui_page` | ui | 0.67 |  | Parchment page turn. |
| `ui_error` | ui | 0.48 |  | Error: two dull wooden knocks with a muffled minor-second dissonance. |
| `ui_coin` | ui | 0.71 |  | Gold: a few coins clinking onto a small pile. |
| `ui_equip` | ui | 0.53 |  | Equip: leather strap creak, buckle and a metal fitting clink. |
| `ui_unlock` | ui | 1.72 |  | Unlock: iron mechanism clicks, a heavy latch thunk and a faint chime. |
| `ui_select_tempo_rapido` | ui | 0.98 |  | Select tempo Rapido: quick double tick and a bright upward flick. |
| `ui_select_tempo_tatico` | ui | 1.93 |  | Select tempo Tatico: balanced wooden knock and a mid bell (A4). |
| `ui_select_tempo_pesado` | ui | 2.47 |  | Select tempo Pesado: low heavy thump, iron clank and a low bell (D3). |
| `turn_start` | ui | 2.90 |  | Turn start: soft small bell (A5) in a little chapel. |
| `cycle_start` | ui | 6.65 |  | Cycle start: low bronze gong bloom over a deep bell (D3). |
| `intent_reveal` | ui | 1.34 |  | Enemy intent reveal: card flip swish and flap with a low ominous tone. |
| `dice_roll` | sfx | 0.87 |  | Bone dice shaken in a wooden cup (three shakes of rattling clicks). |
| `dice_land` | sfx | 0.49 |  | Dice land on a wooden table: bounces and a short roll-out. |
| `dice_land_2` | sfx | 0.52 |  | Dice land variant. |
| `dice_fail` | sfx | 2.92 |  | Failed roll: dice settle with a dull, muffled low tone. |
| `dice_success` | sfx | 2.75 |  | Successful roll: dice settle with a soft bright bell pair. |
| `dice_impulse` | sfx | 2.45 |  | Impulse die: bright accent, upward glint and a quick sparkle. |
| `dice_critical` | sfx | 4.66 |  | Critical: resonant bell flourish (D major arpeggio over a bell) with shimmer. |
| `swing_light` | sfx | 0.44 |  | Light blade swing: fast thin whoosh with edge whistle. |
| `swing_light_2` | sfx | 0.43 |  | Light swing variant. |
| `swing_heavy` | sfx | 0.71 |  | Heavy weapon swing: broad, low, slower air with body. |
| `hit_metal` | sfx | 0.84 |  | Sword on armour: bright metallic clang with impact. |
| `hit_metal_2` | sfx | 0.80 |  | Sword on armour variant. |
| `hit_metal_3` | sfx | 0.79 |  | Sword on armour variant. |
| `hit_metal_heavy` | sfx | 1.13 |  | Heavy blow on plate: low clang, crunch and weight. |
| `hit_flesh` | sfx | 0.40 |  | Blade into flesh: dull wet thud and squelch. |
| `hit_flesh_2` | sfx | 0.40 |  | Flesh hit variant. |
| `hit_blunt` | sfx | 0.80 |  | Blunt weapon impact: heavy low thud with a wooden crack. |
| `hit_wood_shield` | sfx | 0.72 |  | Strike on a wooden shield: resonant board knock and splinter crack. |
| `block_shield` | sfx | 0.76 |  | Shield block: wood-and-iron shield takes the blow, the rim rings. |
| `armor_absorb` | sfx | 0.45 |  | Armour absorbs: dull, damped clank. |
| `guard_gain` | sfx | 3.11 |  | Guard gained: protective rising shimmer (soft bells and glassy air). |
| `guard_break` | sfx | 1.04 |  | Guard broken: crack and shatter of a ward, metallic shards and a low drop. |
| `miss_whoosh` | sfx | 0.58 |  | Miss: airy whoosh passing by. |
| `bow_draw` | sfx | 0.98 |  | Bow draw: creaking wood limbs and rising string tension. |
| `bow_release` | sfx | 0.45 |  | Bow release: string twang, thrum and the arrow's flight. |
| `arrow_impact` | sfx | 0.37 |  | Arrow thunks into wood; the shaft quivers. |
| `crossbow_shot` | sfx | 0.42 |  | Crossbow: trigger clack, heavy string thwack, bolt whoosh. |
| `bolt_impact` | sfx | 0.56 |  | Crossbow bolt impact: heavy thunk with splintering crack. |
| `spell_arcane_cast` | sfx | 2.89 |  | Arcane cast: rising FM shimmer with gathering sparkles. |
| `spell_arcane_impact` | sfx | 2.33 |  | Arcane impact: burst of inharmonic tones, glass and a low blow. |
| `rune_place` | sfx | 2.69 |  | Rune placed: stone tap, deep resonant thoom and a glassy ring. |
| `teleport` | sfx | 2.70 |  | Teleport: inhaled reverse swell snapping into a falling shimmer. |
| `holy_cast` | sfx | 3.24 |  | Holy cast: choir swelling a D major chord with bell shimmer. |
| `holy_impact` | sfx | 3.49 |  | Holy impact: radiant bright bell chord bursting over a low blow. |
| `heal` | sfx | 3.19 |  | Heal: warm rising arpeggio of soft flute-organ tones and a gentle choir. |
| `bless` | sfx | 3.65 |  | Blessing: soft bell with a short choir 'oh' and a faint shimmer. |
| `profane_hit` | sfx | 2.50 |  | Profane hit: dark distorted ring-modulated blow with a sucked-in swell. |
| `cond_poison` | sfx | 1.09 |  | Poisoned: sickly bubbling with a queasy detuned wobble. |
| `cond_bleed` | sfx | 0.76 |  | Bleeding: a short slash and wet drips. |
| `cond_burn` | sfx | 1.26 |  | Burning: ignition whoosh into crackling flame. |
| `cond_stun` | sfx | 1.51 |  | Stunned: blow followed by high, beating tinnitus ring. |
| `cond_immobilize` | sfx | 1.20 |  | Immobilised: chains whip round and an iron clamp bites shut. |
| `cond_exposed` | sfx | 1.19 |  | Exposed: thin crackling and a descending hollow tone. |
| `cond_broken` | sfx | 0.34 |  | Broken: sharp snapping crack with a crunchy splinter. |
| `cond_cleanse` | sfx | 2.95 |  | Cleansed: airy upward breath with a soft bell sparkle. |
| `step_stone_1` | sfx | 0.33 |  | Footstep on stone (heel, toe, grit). |
| `step_stone_2` | sfx | 0.32 |  | Footstep on stone variant. |
| `step_stone_3` | sfx | 0.39 |  | Footstep on stone variant, with a faint mail jingle. |
| `dash` | sfx | 0.58 |  | Dash: quick rush of air over two fast footfalls. |
| `push_impact` | sfx | 0.78 |  | Shove impact: body thud and a short scrape across stone. |
| `body_fall` | sfx | 1.19 |  | Hero falls: cloth rush, armour clatter and a heavy body thud. |
| `rise_up` | sfx | 1.30 |  | Rise up: cloth rustle, mail clinks and an upward breath of air. |
| `death_enemy` | sfx | 2.84 |  | Enemy death: body crumbles to ash, a falling sigh of air. |
| `enemy_spawn` | sfx | 5.33 |  | Enemy spawn: low bell toll and a rushing column of ash. |
| `bell_toll_short` | sfx | 4.23 |  | Single bell toll (D4), short tail. |
| `bell_toll_long` | sfx | 10.53 |  | Bell toll (A3) with a long, cathedral tail. |
| `bell_great_cracked` | sfx | 13.35 |  | Severin's great cracked bell (D2): split, rattling partials and huge decay. |
| `resonance_up` | sfx | 4.43 |  | Resonance rising: tension swell of choir, bowed bronze and rising air. |
| `chant_note` | sfx | 4.04 |  | Single choral note: low monks singing 'oh' on D3. |
| `dog_snarl` | sfx | 2.04 |  | Hound snarl: rough rising growl, lips drawn back, ending in a snap. |
| `chain_rattle` | sfx | 1.39 |  | Chain rattle: heavy links shaken and dragged. |
| `counterweight_drop` | sfx | 3.37 |  | Counterweight released: ratchet clicks speeding up, rope rush, a massive wood-and-iron impact and settling chains. |
| `door_stone` | sfx | 3.94 |  | Stone door grinding open and settling with a heavy thud. |
| `whoosh_transition` | sfx | 4.49 |  | Scene transition: long cinematic whoosh with a low bloom at its crest. |
| `page_turn` | sfx | 0.94 |  | Book page turn (heavier, for lore books). |
| `level_up` | sfx | 5.04 |  | Mastery / talent gained: rolled warm bell chord in D major with a choir bloom. |
| `music_title` | music | 96.00 | loop | Main theme: solemn bell motif D-A-C-Bb-A over a choir and low drone in D Aeolian/Phrygian; intro, choir build, timpani climax, return. |
| `music_explore` | music | 104.00 | loop | Sparse ambient exploration bed: dark drone, slow string/choir pads, distant bell fragments of the motif, bowed bronze swells. Very calm. |
| `music_base` | music | 80.00 | loop | Hearth / sanctuary theme: lute arpeggios (Karplus-Strong), soft flute-stop organ, cello and a flute singing a warmer, relative-major turn of the bell motif. 72 BPM in 3/4. |
| `music_combat` | music | 65.45 | loop | Combat loop at 88 BPM: frame-drum ostinato, spiccato low strings in 3+3+2, choir stabs, bell motif, taiko and toms in the last section. Mid-range kept clear for SFX. |
| `music_miniboss` | music | 60.00 | loop | Mini-boss loop (the Knight / the Watcher), 80 BPM, C# Phrygian: taiko, armoured anvil backbeats, saturated low brass-strings, low choir, timpani and a dark bell every four bars. |
| `music_boss` | music | 82.29 | loop | Final boss (Abbot Severin), 70 BPM, D Phrygian/Locrian: the great cracked bell, full choir, timpani ostinato, string tremolo and a cracked statement of the motif; builds dread then pulls back to loop. |
| `sting_victory` | sting | 6.50 |  | Victory: Picardy-third D major bell chord and rising motif, choir swell, timpani roll and hit. |
| `sting_defeat` | sting | 8.50 |  | Defeat: slow low cracked toll, choir sliding down in D minor, the motif falling and fading into a dark drone. |
| `sting_secret` | sting | 5.00 |  | Secret found: shimmering high bell arpeggio in D Lydian-ish colour, glass sparkles and a soft high choir bloom. |
| `sting_boss_intro` | sting | 4.20 |  | Boss intro: rising air swell into a huge cracked-bell hit with timpani, taiko and a low choir stab. |
| `sting_reward` | sting | 3.00 |  | Reward: bright bell arpeggio up the D major triad with coin shimmer. |
| `amb_cloister_wind` | ambience | 52.00 | loop | Open cloister: gusting wind through arches with soft whistles, distant drips and a very faint far bell. |
| `amb_torches_fire` | ambience | 40.00 | loop | Torches and braziers: two stereo fire sources (roar, licking flame, crackles, pops) in a stone room. |
| `amb_chains_creak` | ambience | 48.00 | loop | Prison / counterweight shaft: low room tone, creaking ropes and beams, swinging chains, a groaning iron counterweight, drips. |
| `amb_chapel_drone` | ambience | 56.00 | loop | Chapel: low organ-like hum, incense air, distant faint choir chords and candle flutter in a long stone reverb. |
| `amb_scriptorium` | ambience | 45.00 | loop | Scriptorium: quiet room tone, occasional parchment rustles and quill scratches, a slow drip in a corner. |
| `amb_kennel` | ambience | 46.00 | loop | Kennel: low distant hound breathing and growls, chain clinks, straw shuffles in a dark vaulted room. |
| `amb_belltower` | ambience | 50.00 | loop | Bell tower: high bright wind, the great bell's hum resonating sympathetically in the gusts, creaking frame and rope. |

## Known limitations

- It is synthesis, not recordings: the choir and strings are convincing as dark, distant pads but read as
  "synthetic ensemble" when exposed; the hound growl/snarl and the flesh hits are the least realistic sounds.
- Loudness targets are RMS-based (not LUFS-gated); the `gainDb` values are starting points to tune by ear in-game.
- Loops rely on Web Audio `loopStart`/`loopEnd`; an `<audio loop>` element would also replay the 0.5 s pre/post-roll.

## License

Original work generated by this project's code. No third-party audio. The generated audio files and this generator are
dedicated to the public domain under **CC0 1.0** (project-owned; use freely).
