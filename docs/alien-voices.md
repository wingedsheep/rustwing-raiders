# Alien voices with ElevenLabs

How we give the cast from `docs/style-and-characters.md` §3 its voices: a short clip in the creature's own language, played under the subtitled text. This is the "every character makes a sound" rule from Gazillionaire, and the "aliens speak their own language, with subtitles" rule from Star Wars. The subtitles carry the meaning. The voice carries the person.

Everything else in `src/audio.ts` is synthesized at runtime. Voices are the exception: they are **baked offline** into small files and shipped with the game. Nothing calls ElevenLabs while the game runs, so players never need a key, and a clip sounds the same every time.

---

## 1. Which models (checked 2026-10-22)

| Job | Model | Why |
|---|---|---|
| **Speech** (the lines) | `eleven_v4` | The newest and most expressive model (out since late September 2026). It follows audio tags such as `[growls]`, `[whispers]` and `[laughs]` more reliably than v3, and keeps a voice steadier across takes. Up to 10,000 characters per call. |
| **Voice design** (making the voices) | `eleven_ttv_v3` | The newest voice-design model. Unlike `eleven_multilingual_ttv_v2`, it can take **reference audio**, which we need for the creature-shop trick in §4. |
| **Creature noises** (no words) | `eleven_text_to_sound_v3` | For the things that don't talk: hull leeches, the purrgil, a creature's bark on a tell. |

Not for us: `eleven_v4_turbo` and `eleven_v3_conversational` are the real-time models. They are built for live agents, and our clips are baked once. `eleven_v3` is the previous generation, our fallback if a designed voice sounds worse on v4 (one guide says designed voices can lose a little polish there, so compare both).

**v4 voice settings:** v4 reads only `stability` and `similarity_boost`. `style`, `speed` and `use_speaker_boost` are gone, and SSML `<break>` doesn't work. Use `[pause]` instead. Lower `stability` (0.3–0.4) gives livelier reads that respond more to tags. Higher (0.6+) makes every bark match. We want low for the characters and high for the droids.

---

## 2. Two kinds of sound

1. **People who talk** (the Vhossk Twins, Tobbo Grisk, 7-Holly, ...). A **designed voice** speaks **gibberish written in that species' sound-set** (§5), with audio tags for the acting. Sent to `eleven_v4`.
2. **Creatures that don't** (hull leeches, the purrgil, faction beasts). A **sound-effect prompt** to `eleven_text_to_sound_v3`. Voice design is built for voices that speak, so it can't make a whale song or a wet chitter.

When in doubt, pick (1) when it haggles and (2) when it bites.

---

## 3. What a character gets

We don't voice whole lines. Each character gets a few **barks**, 1–3 seconds each, played when a text box opens. The subtitle varies, and the bark matches its mood:

| Bark | When |
|---|---|
| `hello` | the event opens |
| `pleased` | a good deal, a kept promise |
| `annoyed` | a low offer, a refusal |
| `angry` | a broken deal, a threat |
| `bye` | the event closes |
| `remember` (recurring cast only) | "You again." on a later meeting |

Two takes of each, so a repeat doesn't sound canned. That makes about 10–12 clips per character, and 3–4 minutes of audio for the whole cast.

---

## 4. Designing a voice

### The call

`POST https://api.elevenlabs.io/v1/text-to-voice/design` with header `xi-api-key: <elevenlabs.apiKey from config.yaml>`:

```json
{
  "model_id": "eleven_ttv_v3",
  "voice_description": "…see below…",
  "text": "…100–1000 characters, in the character's own gibberish…",
  "guidance_scale": 5,
  "loudness": 0.5,
  "seed": 7101,
  "should_enhance": false
}
```

It returns `previews[]`, each with `generated_voice_id` and `audio_base_64` (mp3). Listen to all of them, pick one, and save it:

`POST /v1/text-to-voice` with `{ "voice_name": "Rustwing – Tobbo Grisk", "voice_description": "…", "generated_voice_id": "…", "labels": { "game": "rustwing", "who": "tobbo" } }` → returns the permanent `voice_id`. That id goes in the cast file (§7).

Knobs that matter:
- **`seed`**: fix it per character, so rerunning the design gives the same voice and only the prompt change shows.
- **`guidance_scale`**: 5 by default. Raise it to 7–9 when the voice drifts from the description. Very high values sound synthetic.
- **`should_enhance`**: keep it **off**. It rewrites our description into a generic one and smooths away the oddness.
- **`text`**: always pass our own gibberish. Auto-generated English text makes the previews sound like an audiobook narrator.
- **`reference_audio_base64` + `prompt_strength`** (ttv_v3 only): a recording that shapes the voice's texture. **This is our Ben Burtt trick.** Feed it a slowed walrus grunt, a pitched-down cat purr or a squeaky hinge at `prompt_strength` 0.6–0.8, so the description still decides who it is and the reference adds the animal. Use only recordings we own or that are CC0.

### Writing the description

Fill in the same six slots every time, in this order. ElevenLabs gives far better results from a specific description than from "an alien voice":

1. **Age and build.** "An old, heavy, barrel-chested…", "A tiny, frail…"
2. **Timbre.** gravelly, nasal, breathy, wet, reedy, buzzing, hollow
3. **Pitch and pace.** "very low, slow and rolling", "high, fast, clipped"
4. **Manner.** the one quirk from the cast list: wheedling, imperious, fussy, solemn
5. **Recording.** "close-mic'd, studio quality" for people. "Through a cheap tinny speaker" for intercoms and radios
6. **No accent from Earth.** Write "an unplaceable, non-human accent". Otherwise it picks a real one, and Tobbo ends up Italian.

Avoid names of real actors or characters ("like Jabba"). The API rejects or ignores them, and we don't copy anyway.

---

## 5. Gibberish that sounds like a language

TTS reads made-up words phonetically, so we write them in **species sound-sets**: a small set of syllables each species always uses. Keep each species' set consistent, and a player starts to "hear" the language after a few events.

| Species | Sounds | Feel | Sample |
|---|---|---|---|
| **Vhossk** (the Twins) | hard *gr, kh, v, uu, oh*; doubled consonants | heavy, slow | `Grohh-vukka. Vhoss tuum kharr, kharr! Uuvo grenn-takk.` |
| **Skree** (salvagers) | *t, k, ch, ee, i*; short syllables, many hyphens | fast chatter | `Ti-kee! Chik-chik-ta, eeti kreetch? Ta-ta-kee!` |
| **Grisk** (Tobbo) | *zz, b, w, ah, oh*; rising endings | wheedling sing-song | `Bahwoh-zza! Zzimbo, zzimbo wahh, oh-boh-boh?` |
| **Ledger Clan** | *k, t, x, eh*; clipped, every word ends on a click | legal, flat | `Kehx-tekk. Ottex, kehx-tekk. Tekk.` |
| **Squit** | *f, s, ee, ip*; whispered runs | nervous | `Fssip! Ee-fee-sip, sip — psst. Fip-sss.` |
| **Lady Vey** | *l, m, v, ae*; long vowels | languid, bored | `Laeee-mava. Vaelo… mm. Vael-ae-mira.` |
| **Seffa** | *h, w, oo, ae*; lots of breath | slow, kind | `Hoo… waeha. Hoo-ae, waeha-hoo?` |

Droids (7-Holly, Saint Ferrule) and the Choir speak **English** in-world (they are Port Authority, a shrine, and a fungus wearing a freighter's intercom). That contrast is the joke and the horror.

Let audio tags do the acting, not the words: `[annoyed] Bahwoh-zza?! [scoffs] Zzimbo wahh…` Put the tag right before the words it colours.

---

## 6. The cast

Voice descriptions for the first eleven, ready to paste into §4. The bark-specific tags go in the lines file.

| Who | Kind | Voice description (`eleven_ttv_v3`) | v4 `stability` | Post (§8) |
|---|---|---|---|---|
| **Vhossk Twins, left head** | voice | An old, enormous, barrel-chested alien broker. Very low, gravelly, rolling voice, slow and certain, a wet rumble under every word. Greedy but polite. Close-mic'd, studio quality, unplaceable non-human accent. | 0.35 | — |
| **Vhossk Twins, right head** | voice | The same huge alien's second head: low but a little higher and hoarse, fast, cutting in, petty and suspicious, always arguing. Close-mic'd, unplaceable non-human accent. | 0.3 | — |
| **Skree salvager** | voice | A small hooded scavenger. High, quick, clicky, chattering voice, excited and shifty, breathy laughs. Unplaceable non-human accent, studio quality. | 0.3 | pitch +3 |
| **Unit 7-Holly** | voice | A tall, thin clerk droid, forty years alone. Precise, fussy, formal, overly polite, desperately glad of company. Mid pitch, crisp consonants. Studio quality. | 0.65 | ring-mod, bandpass |
| **Choir of Mirefall** | voice | A calm, polite, genderless voice, speaking slowly in a slightly wrong rhythm. Through an old, crackling ship intercom speaker. Eerie and gentle. | 0.5 | 3 detuned layers, static |
| **Old Mother Seffa** | voice | A tiny, ancient alien woman. Thin, breathy, warm, very slow, pauses to think, a smile in it. Unplaceable non-human accent, studio quality. | 0.4 | — |
| **Ledger Clan banker** | voice | A tall insectoid banker. Dry, flat, clipped, nasal mid-low voice, cites rules, no warmth at all. Unplaceable non-human accent. | 0.6 | click layer |
| **Saint Ferrule** | voice | An old maintenance droid turned priest. Slow, solemn, deep and kindly, like a blessing in a big empty hall. Studio quality. | 0.6 | ring-mod, long verb |
| **Tobbo Grisk** | voice | A pot-bellied alien junk dealer. Raspy, nasal, mid-high voice, fast-talking, wheedling, easily insulted, sing-song rise at the end. Unplaceable non-human accent. | 0.3 | wing-buzz layer |
| **Squit** | voice | A twitchy, small alien informant. Thin, nasal, high voice, whispering fast, nervous, always about to run. Unplaceable non-human accent. | 0.3 | pitch +2 |
| **Lady Vey** | voice | An aristocratic alien noblewoman. Smooth, low-mid, languid and bored, drawn-out vowels, delighted only by rare things. Rich, close-mic'd. | 0.45 | — |
| **Hull leeches** | sfx | `leathery bat wings flapping against metal, wet chittering, teeth chewing on cable, sparks` (3 s) | — | — |
| **Purrgil of Vesh** | sfx | `huge whale song in deep space, slow low moan rising to a warm hum, distant and vast` (6 s) | — | long verb |

For the **Choir**, render each bark once and layer three copies in the browser, each pitch-shifted by a few cents. One voice talking as "we" sounds right that way.

**Faction beasts** (wild-faction tells: crouch, dust, pounce) can use `eleven_text_to_sound_v3` too: a short roar on the tell gives the "one tell grammar per faction" from `docs/design-research.md` a voice. Keep each under 1 s, and check it against the synth mix before adding more.

---

## 7. The pipeline in the repo

```
config.yaml                     # elevenlabs.apiKey — gitignored, never commit it
tools/voices/cast.yaml          # per character: description, seed, voice_id, stability, barks
tools/voices/voices.py          # design | save | render | sfx
public/audio/voices/<who>/<bark>_<take>.mp3
```

`tools/voices/voices.py` (Python, like `tools/models/`), with four commands:

- `design <who>`: calls `/text-to-voice/design`, writes the previews to `tools/voices/previews/<who>/` (gitignored), and prints their ids. You listen and pick.
- `save <who> <generated_voice_id>`: calls `/text-to-voice` and writes the `voice_id` back into `cast.yaml`.
- `render [<who>]`: for each bark and take, `POST /v1/text-to-speech/<voice_id>?output_format=mp3_44100_128` with `{ "model_id": "eleven_v4", "text": "…", "voice_settings": { "stability": …, "similarity_boost": 0.75 } }`, and writes the file. It skips files that exist, so rerunning only fills gaps (`--force` to redo).
- `sfx <who>`: `POST /v1/sound-generation` with `{ "model_id": "eleven_text_to_sound_v3", "text": "…", "duration_seconds": … , "prompt_influence": 0.5 }`.

An entry in `cast.yaml`:

```yaml
tobbo:
  kind: voice
  seed: 7110
  description: >-
    A pot-bellied alien junk dealer. Raspy, nasal, mid-high voice, fast-talking,
    wheedling, easily insulted, sing-song rise at the end. Unplaceable non-human accent.
  voice_id: null        # filled by `save`
  stability: 0.3
  barks:
    hello:   ["[cheerful] Bahwoh-zza! Zzimbo, zzimbo wahh!", "[warmly] Oh-boh-boh! Zza-wimbo?"]
    pleased: ["[laughs] Wahh-zza, wahh-zza!", "[delighted] Bimbo-bah! Oh-boh!"]
    annoyed: ["[scoffs] Bahh. Zzimbo… [sighs] wahh.", "[offended] Zza?! Boh-boh-boh!"]
    angry:   ["[shouting] ZZA! Bahwoh-zza-BAH!", "[growls] Wohh… zzimbo. Bah!"]
    bye:     ["[cheerful] Wahh-boh!", "[muttering] Zza, zza… boh."]
```

The game plays a bark through `audio.ts` on the `sfxBus` (so mute and volume apply), keyed by the event's `who` in `src/sim/events.ts`. That ties to the human cast too, if we voice them later.

---

## 8. Post-processing in the browser

The clips stay clean, and the strangeness that is cheap to do live happens in Web Audio:

- **Droids** (7-Holly, Saint Ferrule): a ring modulator (a 40–70 Hz sine multiplying the signal) plus a bandpass, so they sound like a speaker grille.
- **Pitch**: `playbackRate` 1.1–1.25 for Skree and Squit. It shifts speed too, and that suits them.
- **Layers**: Tobbo's wing buzz and the Ledger Clan's abacus clicks are synth sounds `audio.ts` can already make, played under the bark.
- **Space**: the Choir and the purrgil go through the long reverb send.

---

## 9. Cost and rights

- Voice design previews and sound effects cost credits like speech does. The whole cast (a few designs each, about 150 short clips) fits easily in a starter plan's monthly credits. Check the current price on the account before a full render.
- Shipping the clips in a commercial game needs a **paid** plan when they are generated. The free tier doesn't allow commercial use.
- Designed voices are ours to use. Don't clone a real person's voice for a character.

---

Sources: [Eleven v4](https://elevenlabs.io/v4), [Models](https://elevenlabs.io/docs/overview/models), [Design a voice](https://elevenlabs.io/docs/api-reference/text-to-voice/design), [Create a voice](https://elevenlabs.io/docs/api-reference/text-to-voice/create), [Voice Design quickstart](https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/voice-design), [Sound effects](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [Prompting v3 (audio tags)](https://elevenlabs.io/docs/best-practices/prompting), [Eleven v4 prompt guide (Morphic)](https://morphic.com/resources/how-to/eleven-v4-guide).
