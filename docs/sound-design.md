# Sound design

How Rustwing should sound, what the craft says about getting there, and how Claude works on it without ears.

Everything in the game is synthesized at runtime with the Web Audio API (`src/audio.ts`). There are no sample files. The music stays retro (a seeded chip/synthwave sequencer per planet). Everything around the music should feel like a place: air, distance, weather and machinery, things living in it, and a mix that reacts to what is happening to you.

## Pillars

1. **Every place has a sound before anything happens in it.** A biome has a bed (air, surf, rumble, hum) and things that happen in it now and then (birds, thunder, a creak of metal a long way off). If you mute the music, you should still know where you are.
2. **Near is dry and bright; far is dark and wet.** Distance is a filter and a reverb send, not just a volume. Things far away lose their top end and gain room.
3. **The room changes with the place.** A canyon slaps back, ice rings bright and long, a jungle is diffuse, the hangar is a small tin shed. Every sound in a level goes through that level's space.
4. **The mix makes room for the moment.** Big hits duck the music and ambience for a beat. Low hull closes the world in and brings up a heartbeat. Pause sinks everything under water. Going down deafens you for a second.
5. **Gameplay reads first.** Danger cues and hits always cut through. Ambience sits under everything and steps back as the fight gets busy. The UI is never muffled.
6. **Retro music, modern mix.** Chip leads and pulse waves are fine. Clicks, harsh pile-ups and a flat, dead space are not.

## What the craft says

### Anatomy of a sound: transient, body, tail

Most effects can be broken into three parts. The **transient** is a high click or crack that gives definition. The **body** carries the character: the tone, the noise band, what material it is. The **tail** is how it decays into the space. Weapon and impact design adds a **sub** layer for weight and a **mechanical** layer for detail ([Violet Recording: weapons](https://violetrecording.com/how-to-design-weapon-sounds/), [impacts](https://violetrecording.com/how-to-make-impact-sounds/), [Wayline](https://www.wayline.io/learn/game-audio/1)).

- Line the transients up on the same instant, or offset them on purpose to shape the attack ([IRPR glossary: layering](https://sounddesign.irpr.agency/glossary/layering/), [Morphic](https://morphic.com/resources/how-to/how-to-layer-sound-effects)).
- Keep tails short on anything that fires a lot. A long tail on a rapid-fire sound turns into mud and fatigue ([Violet Recording](https://violetrecording.com/how-to-make-impact-sounds/)).
- In code, `boom()` is exactly this stack: a sine thump (sub), a lowpassed noise body, a bandpassed crack (transient) and crackle (tail detail).

### Variation

A sound that fires dozens of times a minute must not be identical every time. Small random pitch (±3–5%) and level (±1 dB) per play, plus random noise offsets, stop the "machine gun" effect. Tuned sounds (UI, pickups, chimes) are the exception: they keep exact pitch so they stay in key with each other and the music.

### Buses and priority

Route every sound into a group bus (music, SFX, ambience, UI) and balance the buses, not individual clips. Buses are also what volume sliders and mix states act on ([bugnet: mixing game audio](https://bugnet.io/blog/how-to-mix-game-audio-so-nothing-drowns-out), [awesome-gamedev audio-design skill](https://claudeskills.info/skills/gamedev-skills/awesome-gamedev-agent-skills/audio-design/)).

Decide up front what must always be heard. For Rustwing the order is: danger telegraphs and player damage, then hits and kills, then weapons, then music, then ambience. Cap simultaneous voices per sound and overall, and let low-priority sounds drop first ([bugnet](https://bugnet.io/blog/how-to-mix-game-audio-so-nothing-drowns-out)).

### Ducking

Lower the rest of the soundscape for a moment so the important thing has headroom. Use a quick attack and a gentle release: around 30–40 ms down and 0.5–0.6 s back up ([Game Developer: Game Audio Theory: Ducking](https://www.gamedeveloper.com/audio/game-audio-theory-ducking), [abratabia: dynamic game music](https://abratabia.com/web-game-audio/dynamic-game-music.php)). Ambience beds can be ducked by nearer, local sounds in the same way ([Roblox: Beyond the Dark sound design](https://create.roblox.com/docs/resources/beyond-the-dark/sound-design)). Treat any exact numbers as starting points and tune them in context.

### Ambience: a bed plus one-shots

Ambience splits into **room tones** (a continuous bed) and **one-shots** (discrete events) ([Designing Sound: creating the spaces of ambience](https://designingsound.org/2012/12/29/creating-the-spaces-of-ambience/)).

- The bed keeps the world from ever going silent.
- One-shots spawn at random times with random position, pitch and volume. Randomize their panning enough that the player can't pin them down: they are the world, not targets ([Audiokinetic: designing ambience systems in Wwise](https://blog.audiokinetic.com/en/designing-ambience-systems-in-wwise/), [CRI: ambience design in Atom Craft](https://blog.criware.com/index.php/2020/12/14/ambience-design-in-atom-craft-part-1-2/)).
- Exaggerate distance and diffusion. Real-life distances read as too flat in a game ([Designing Sound](https://designingsound.org/2012/12/29/creating-the-spaces-of-ambience/)).
- Ambience carries emotion as well as information. Room tone sets the mood before anything happens ([Designing Sound: room tone, emotional tone](https://designingsound.org/2012/11/15/room-tone-emotional-tone-the-importance-of-hearing-ambience)).
- Layer the bed by intensity: let ambience step back as the music and combat take over ([Banner Saga audio](https://bannersaga.com/?p=6673)).

### Distance and air

Air absorbs high frequencies more than low ones. Engines put a distance-driven lowpass on every sound, and raise the reverb send with distance, so far things are dull and roomy and near things are crisp and dry ([Unreal: attenuation settings](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SoundAttenuationSettings), [Arma 3: sound filters](https://community.bistudio.com/wiki/Arma_3_Sound:_Filters), [FMOD distance attenuation notes](https://dereckdeabreucoelho.myblog.arts.ac.uk/?p=517)).

### Reverb is the space

`ConvolverNode` convolves a sound with an impulse response (IR). An IR does not have to be recorded: a buffer of decaying noise is a usable tail ([MDN: ConvolverNode](https://developer.mozilla.org/docs/Web/API/ConvolverNode), [ITNEXT: convolution reverb and Web Audio](https://itnext.io/convolution-reverb-and-web-audio-api-8ee65108f4ae), [O'Reilly: Web Audio API, advanced topics](https://www.oreilly.com/library/view/web-audio-api/9781449332679/ch06.html)).

A generated IR sounds like a real place when it has:

- **Pre-delay**: a gap before the first reflection, which gives the room its size.
- **Early reflections**: a handful of discrete taps in the first 5–200 ms, placed differently on the left and right channels. This gives stereo width and the shape of the room (a canyon's slapback, a tin room's flutter).
- **A tail that darkens as it decays**: lowpassed noise with a falling cutoff, decaying along a power curve.

Notes for generating IRs:

- The IR's sample rate must match the context's sample rate.
- With `normalize` on, the IR's overall loudness is scaled away, so only its shape matters.
- Early reflection taps have to be scaled against the tail's energy, or normalization makes them vanish.
- Crossfade between two convolvers when the space changes; don't hot-swap the buffer under a ringing tail.

### Mix states (snapshots)

Health, pause and death are states of the whole mix, not single sounds. Common moves:

- A lowpass and a duck on music and ambience at low health, with a heartbeat, in the spirit of health-reactive music layers ([Audiokinetic](https://blog.audiokinetic.com/en/designing-ambience-systems-in-wwise/)).
- A heavy lowpass on everything but the UI while paused.
- A short "shell shock" when the player goes down: the world dulls and a faint high ring comes up, then the world comes back.

### Procedural audio

Andy Farnell's *Designing Sound* (MIT Press, 2010) is the reference for procedural audio. It treats sound as a process, not stored data, built from analysis of the real thing and then synthesis, and it can change live in response to unpredictable events ([Designing Sound interview with Andy Farnell](https://designingsound.org/2012/01/18/procedural-audio-interview-with-andy-farnell/), [OpenCourser: Designing Sound](https://opencourser.com/book/50vd9c/designing-sound)). Tools like AudioGaming's AudioWeather do the same for wind and rain in commercial engines ([Designing Sound: AudioGaming interview](https://designingsound.org/2012/06/13/audiogaming-an-interview/)). The recipes in Rustwing come from that way of thinking:

- **Wind**: pink noise through a bandpass whose centre and level are pushed around by slow, unrelated LFOs.
- **Surf**: lowpassed noise that swells over seconds.
- **Rain**: a steady band of bright noise.
- **Creaking metal**: a sawtooth stepped at random pitches through a narrow bandpass.
- **Struck metal**: inharmonic sine partials (×1, 2.76, 5.4, 8.9) with short to long decays.
- **Ice cracking**: a snap of noise, then a fast falling "pew" of a sine.

### Web Audio practice

- Create or resume the `AudioContext` only from a user gesture ([game-creator audio skill](https://www.claudepluginhub.com/skills/opusgamelabs-game-creator/game-audio)).
- Sequence music with a lookahead scheduler on `AudioContext.currentTime`, not on timers.
- Route all sound through one master. Put a glue compressor and a limiter at the end.
- Disconnect finished voices.
- Test in a real browser: timing and levels are never quite what the code suggests.

## How Claude does sound design

Claude can't listen. Research on LLMs writing audio code finds that free-form synthesis scripts often fail, and that a small, constrained vocabulary of audio operations works far better ([SonicRAG, arXiv 2505.03244](https://arxiv.org/abs/2505.03244)). So Claude works like this:

1. **Write the sound in words first, as a picture.** "A plate of hull dropped on the bench, and its ring." "A crystal going to pieces." The comment above each SFX recipe is that sentence, and the code has to match it.
2. **Break it into layers before writing code.** Sub, body, transient, tail, sweetener. Each layer is one call.
3. **Use the house vocabulary, not raw nodes.** `tone(out, t, wave, f0, f1, dur, peak, attack)`, `noise(out, t, dur, filter, f0, f1, q, peak, attack)`, `boom(...)`, `crackle(...)`, `filt(...)`. These helpers are the constrained language: they get the envelopes right (no clicks) and keep recipes short enough to read.
4. **Think in frequency bands so sounds don't mask each other.** Keep a rough map:
   - sub and thumps: 30–150 Hz
   - bodies: 150–1500 Hz
   - UI and pickups: 1–3 kHz and tuned
   - danger telegraphs: 600–1800 Hz with a rhythm
   - sparkle and crackle: above 4 kHz
   - ambience mostly fills the gaps (low beds, far, filtered events)
5. **Use real reference numbers.** Explosion thumps start around 120–150 Hz and fall to 30–40 Hz. A blade ring is a few close partials at 1.7–3 kHz with a 0.6–0.9 s decay. A bird chirp is 2.5–5 kHz and 50–100 ms long.
6. **Measure, because Claude can't hear.** Render through the audition page (`/audio-test.html`) and read RMS and peak per bus with an `AnalyserNode` in the browser. Check that ambience sits about 15–25 dB under the music, that nothing clips into the limiter for long, and that a new sound's loudness is in line with its neighbours.
7. **Then hand it to human ears.** Every new sound or place goes on the audition page so Vincent can A/B it. Comments say what the sound is meant to be, so "doesn't sound like a crystal" is actionable feedback.

## Rustwing's audio graph

```
sfx voices ─ gain/pan ─┬─ sfxBus ─────────────────────────────┐
                       └─ send ─ sfxVerb ─ place reverb ───────┤
ambience beds+events ─ ambLevel ─ ambDuck ─ ambVol ─┐          ├─ world ─ worldLP ─┐
music players ─ fade ─ musicDuck ─ musicVol ────────┴─ bedLP ──┘                   ├─ master ─ comp ─ limiter
ui sounds ─ uiBus ─────────────────────────────────────────────────────────────────┘
```

- **sfxBus**: everything in the world. Its reverb send goes to the **place reverb**, which crossfades to a new generated IR when the place changes.
- **bedLP**: lowpass on music and ambience only. Low hull closes it and a heartbeat comes in. Gameplay SFX stay crisp.
- **worldLP**: lowpass on everything but the UI. Pause sinks it to about 700 Hz. Going down sweeps it shut and lets it back open.
- **musicDuck / ambDuck**: big sounds duck both automatically (`duck: [seconds, depth]` on the SFX). `audio.duck(s)` is still there for scripted moments.
- **ambLevel**: in flight, ambience steps back as intensity rises, so the boss fight is all music and guns.

### Places

`audio.ambience(place)` sets the place. Flight sets it to the biome under the camera. `audio.music()` with `title`, `map` or `hangar` sets the matching menu place. Each place is data in `AMB`:

- `space`: the reverb (open, forest, canyon, cave, metal, ice, room, void).
- `wind`, `rumble`, `hiss`, `drone`: the bed. The drone is pitched on the current track's root, so it is always in key with the music.
- `events`: one-shots and how many a minute. They are spawned as a Poisson process, each with a random pan, distance, pitch and level.

| Planet | Biome | Sounds like |
|---|---|---|
| Oru-Tal | Fernwood | humid air, leaves, birds, insects, far beast calls |
| | Basalt | lava rumble and hiss, deep bubbling, steam vents, fire |
| | Prism | wind whistling through crystal, a glass hum, chimes |
| | Jade | warm surf, long-neck calls, a deep slow moan, birds |
| Halcyon | Kelp | surf, bubbles, a warm drone, jellies chiming |
| | Stiltport | neon hum, foghorns, cranes clanking, buzzing signs |
| | Colony Bones | wind through wrecks, groaning metal, drips |
| | Stormwall | heavy rain, gale, thunder rolling in |
| Kessra | Salt Pans | dry wind and blown salt, gusts |
| | Red Mesa | canyon wind, gusts, birds of prey |
| | Monoliths | low wind and an old warm drone |
| | Oasis | running water, birds, insects, wind chimes |
| Mirefall | Glowcap | glassy drone, bubbles, insects, drips |
| | Peat | fog, frogs, drips, drowned trees creaking |
| | Temple | stone room: drips, a drone, far calls |
| | Spore Vents | the ground breathing, rumble, vents, bubbles |
| Glacis | Shelf | polar wind, aurora hum, ice cracking |
| | Springs | steam, bubbling pools, drips |
| | Tundra | open gale, herds calling, ice |
| | Engine City | machine hum, presses, clanks, vents |
| Ashgrave | Titans | groaning giants, rumble, metal |
| | Glass | sizzling, buzzing, glass tinkle, small fires |
| | Scav Camp | campfires, clanking, a horn |
| | Whitewood | dead forest wind, creaks, crows |
| Vesh | Coral Flats | low surf, dripping reef, birds |
| | Calving Haze | surf and the calves' slow song |
| | Bone Arch | wind in the empty shells, creaks, gulls, surf |
| | Tide Caves | surf in a cave, drips, rumble |
| Cinder | Orchards | machine hum, clanks, chimes off metal fruit |
| | Refinery | rumble, flare-stack hiss, vents, presses, horns |
| | Pipeline | canyon wind, pipe hum, clanks |
| | Chem Lake | bubbling, vents, a sour drone |
| Menus | Hangar | small tin room: vent hum, clanks, drips |
| | Map | the void: a warm drone, the odd far chime |
| | Title | wind and far thunder |

### Measured levels (output RMS, dBFS)

From the audio bench's meter, in headless Chrome:

| What | Level |
|---|---|
| Planet music, mid intensity | −15 to −20 |
| Ambience alone | −36 to −28; the storm and the lava fields are loudest, the reef and the glowcaps quietest |
| A big explosion, alone | −22 (peaks stay under −5) |
| Music, paused (muffled) | −20 |

Keep a new place's ambience in that band: 13–20 dB under the music, so you feel it more than hear it. Watch `rumble`: pink noise below 150 Hz reads loud on a meter long before it does on laptop speakers.

## Checklist for a new sound

- [ ] One sentence that says what it is, as a comment.
- [ ] Layers chosen by band: does it collide with a sound that plays at the same time?
- [ ] Short tail if it fires often. `low: true` if it can be dropped under load.
- [ ] `gap` and `max` set so a burst can't stack into a wall.
- [ ] `tuned: true` only if it must stay in key.
- [ ] `rev` for anything that should live in the place. `duck` for anything that should own the moment.
- [ ] Added to the audition page and checked for level next to its neighbours.

## Not done yet (ideas)

- Distance from screen depth for enemy sounds (`dist` exists on `audio.play`; the call sites only pass `pan` today).
- Per-faction weapon timbres, so you can hear who is shooting.
- An enemy "presence" layer: a quiet engine loop on big ships as they cross the screen.
- Weather that follows hazards: rain bed intensity tied to the Stormwall's lightning.
