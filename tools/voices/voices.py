#!/usr/bin/env python3
"""Bake character barks with ElevenLabs (see docs/alien-voices.md §7).

  python3 tools/voices/voices.py design <who>            # previews -> tools/voices/previews/<who>/
  python3 tools/voices/voices.py save <who> [<gen_id>]    # default: first usable preview
  python3 tools/voices/voices.py render [<who>] [--force] # speech barks -> public/audio/voices/<who>/
  python3 tools/voices/voices.py sfx [<who>] [--force]    # creature barks (kind: sfx)
  python3 tools/voices/voices.py finish [<who>]          # redo the ffmpeg pass from the raw downloads
  python3 tools/voices/voices.py manifest                 # rewrite public/audio/voices/index.json

The key is read from config.yaml (elevenlabs.apiKey) and never printed.
Clips are post-processed with ffmpeg: trimmed, long pauses capped, sped up to fit 2.5 s
(at most `max_tempo`, default 1.15), mono 44.1 kHz, ~-18 LUFS, mp3 96 kbps.
"""
import base64, json, os, re, shutil, subprocess, sys, tempfile, urllib.error, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CAST = os.path.join(ROOT, "tools", "voices", "cast.json")
PREVIEWS = os.path.join(ROOT, "tools", "voices", "previews")
OUT = os.path.join(ROOT, "public", "audio", "voices")
API = "https://api.elevenlabs.io"
MODELS = {"design": "eleven_ttv_v3", "speech": "eleven_v4", "sfx": "eleven_text_to_sound_v3"}


class ApiError(Exception):
    pass


def api_key():
    txt = open(os.path.join(ROOT, "config.yaml")).read()
    m = re.search(r"elevenlabs:\s*\n(?:\s+.*\n)*?\s+apiKey:\s*[\"']?([^\"'\s#]+)", txt)
    if not m:
        sys.exit("config.yaml has no elevenlabs.apiKey")
    return m.group(1)


def call(path, body=None, raw=False):
    req = urllib.request.Request(API + path, headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        raise ApiError(f"{e.code} on {path}: {e.read()[:600].decode(errors='replace')}")
    return data if raw else json.loads(data)


def load():
    return json.load(open(CAST))


def store(cast):
    with open(CAST, "w") as f:
        json.dump(cast, f, indent=2, ensure_ascii=False)
        f.write("\n")


def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]", "", s)).strip()


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def design(who):
    c = load()[who]
    text = c.get("design_text") or " ".join(strip_tags(l) for takes in c["barks"].values() for l in takes)
    while len(text) < 100:
        text = text + " " + text
    body = {"model_id": MODELS["design"], "voice_description": c["description"], "text": text[:1000],
            "guidance_scale": c.get("guidance", 5), "loudness": 0.5, "seed": c["seed"], "should_enhance": False}
    res = call("/v1/text-to-voice/design", body)
    d = os.path.join(PREVIEWS, who)
    os.makedirs(d, exist_ok=True)
    ids = []
    for i, p in enumerate(res.get("previews", [])):
        path = os.path.join(d, f"preview_{i + 1}_{p['generated_voice_id']}.mp3")
        open(path, "wb").write(base64.b64decode(p["audio_base_64"]))
        ids.append((p["generated_voice_id"], duration(path)))
        print(f"{who}: preview {i + 1} {p['generated_voice_id']} {ids[-1][1]:.1f}s")
    json.dump(ids, open(os.path.join(d, "previews.json"), "w"))
    return ids


def save(who, gen_id=None):
    cast = load()
    c = cast[who]
    if not gen_id:  # the first preview unless it's silent or too short
        ids = json.load(open(os.path.join(PREVIEWS, who, "previews.json")))
        gen_id = next((g for g, dur in ids if dur > 2.0), ids[0][0])
    res = call("/v1/text-to-voice", {"voice_name": f"Rustwing – {c['name']}", "voice_description": c["description"],
                                     "generated_voice_id": gen_id, "labels": {"game": "rustwing", "who": who}})
    c["voice_id"] = res["voice_id"]
    store(cast)
    print(f"{who}: saved voice {res['voice_id']}")


# Trim both ends, and cap pauses inside a line at ~0.25 s, so a bark stays short.
TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,"
        "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,"
        "silenceremove=stop_periods=-1:stop_threshold=-45dB:stop_duration=0.3:stop_silence=0.25")
TARGET = 2.5  # seconds; speech barks over this are sped up a little (up to max_tempo)


def finish(raw, dst, max_tempo=1.0, kind="voice"):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    chain = TRIM
    if kind != "voice":  # sound effects come back quiet: raise the peak to -1 dB first, keep inner gaps and tails
        out = subprocess.run(["ffmpeg", "-i", raw, "-af", "volumedetect", "-f", "null", "-"],
                             capture_output=True, text=True).stderr
        peak = float(re.search(r"max_volume: (-?[\d.]+) dB", out).group(1))
        chain = f"volume={-1 - peak:.1f}dB," + TRIM.rsplit(",silenceremove=stop", 1)[0].replace("-45dB", "-55dB")
    with tempfile.TemporaryDirectory() as tmp:
        mid = os.path.join(tmp, "trim.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", chain, "-ac", "1", "-ar", "44100", mid],
                       check=True)
        tempo = min(max_tempo, max(1.0, duration(mid) / TARGET)) if kind == "voice" else 1.0
        af = (f"atempo={tempo:.3f}," if tempo > 1.001 else "") + "loudnorm=I=-18:TP=-1.5:LRA=11"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mid, "-af", af, "-ac", "1", "-ar", "44100",
                        "-c:a", "libmp3lame", "-b:a", "96k", dst], check=True)
    print(f"  {os.path.relpath(dst, ROOT)} {duration(dst):.2f}s" + (f" (x{tempo:.2f})" if tempo > 1.001 else ""))


def refinish(who):
    """Re-run the ffmpeg pass on the raw downloads, without calling the API."""
    c = load()[who]
    for bark, takes in c["barks"].items():
        for n in range(1, len(takes) + 1):
            raw = os.path.join(PREVIEWS, who, "raw", f"{bark}_{n}.mp3")
            if os.path.exists(raw):
                finish(raw, os.path.join(OUT, who, f"{bark}_{n}.mp3"), c.get("max_tempo", 1.15), c["kind"])


def clips(who, c, force):
    for bark, takes in c["barks"].items():
        for n, line in enumerate(takes, 1):
            dst = os.path.join(OUT, who, f"{bark}_{n}.mp3")
            if force or not os.path.exists(dst):
                yield bark, n, line, dst


def render(who, force=False):
    c = load()[who]
    if c["kind"] != "voice":
        return sfx(who, force)
    if not c.get("voice_id"):
        sys.exit(f"{who}: no voice_id, run design + save first")
    for bark, n, line, dst in clips(who, c, force):
        body = {"model_id": MODELS["speech"], "text": line,
                "voice_settings": {"stability": c["stability"], "similarity_boost": 0.75}}
        audio = call(f"/v1/text-to-speech/{c['voice_id']}?output_format=mp3_44100_128", body, raw=True)
        raw = os.path.join(PREVIEWS, who, "raw", f"{bark}_{n}.mp3")
        os.makedirs(os.path.dirname(raw), exist_ok=True)
        open(raw, "wb").write(audio)
        finish(raw, dst, c.get("max_tempo", 1.15))


def sfx(who, force=False):
    c = load()[who]
    for bark, n, line, dst in clips(who, c, force):
        body = {"model_id": MODELS["sfx"], "text": line, "duration_seconds": c["seconds"], "prompt_influence": 0.5}
        audio = call("/v1/sound-generation?output_format=mp3_44100_128", body, raw=True)
        raw = os.path.join(PREVIEWS, who, "raw", f"{bark}_{n}.mp3")
        os.makedirs(os.path.dirname(raw), exist_ok=True)
        open(raw, "wb").write(audio)
        finish(raw, dst, kind="sfx")


def manifest():
    out = {}
    for who, c in load().items():
        barks = {b: [f"{b}_{n}.mp3" for n in range(1, len(t) + 1) if os.path.exists(os.path.join(OUT, who, f"{b}_{n}.mp3"))]
                 for b, t in c["barks"].items()}
        barks = {b: f for b, f in barks.items() if f}
        if barks:
            out[who] = {"fx": c.get("fx", "none"), "barks": barks}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    print(f"index.json: {len(out)} characters, {sum(len(v) for o in out.values() for v in o['barks'].values())} clips")


def main(argv):
    if not shutil.which("ffmpeg"):
        sys.exit("needs ffmpeg")
    force = "--force" in argv
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    cmd, rest = args[0], args[1:]
    cast = load()
    try:
        if cmd == "design":
            design(rest[0])
        elif cmd == "save":
            save(rest[0], rest[1] if len(rest) > 1 else None)
        elif cmd in ("render", "sfx"):
            kind = "voice" if cmd == "render" else "sfx"
            for who in rest or [w for w, c in cast.items() if c["kind"] == kind]:
                (render if cast[who]["kind"] == "voice" else sfx)(who, force)
            manifest()
        elif cmd == "finish":
            for who in rest or list(cast):
                refinish(who)
            manifest()
        elif cmd == "manifest":
            manifest()
        else:
            sys.exit(__doc__)
    except ApiError as e:
        sys.exit(f"API error: {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
