# Making art with Codex

How to make event art and key art (`public/art/events/*.png`, 640×360) with the Codex CLI's image generation. What the art should look like is in [style and characters §5](style-and-characters.md#5-event-art-direction); this is how to get it made.

## The command

Work in a scratch folder, not the repo. Write the prompt to a file and pass it on stdin; reference images go in one `-i`, comma-separated (a second `-i` or a prompt after it gets read as another image path):

```sh
mkdir -p /tmp/art && cd /tmp/art
cp ~/Git/flying/public/art/events/derelict.png ~/Git/flying/public/art/events/distress.png .
codex exec --skip-git-repo-check -s workspace-write -i derelict.png,distress.png - < prompt.txt
```

Start the prompt by telling Codex what to do with it, or it may start writing code:

> Generate ONE image with your image generation tool and save it as calf_gen.png in the current directory. Do not write code or edit any other file. The attached images are existing event paintings from our game; match their painterly style, lighting and level of detail.

Then the image prompt (the skeleton in §5), then a line of what it must not have. It saves the picture where you asked; every generation is also kept in `~/.codex/generated_images/`.

## Getting the composition right: a rough sketch

Codex follows a picture better than a paragraph of where things go. Drawing a crude shape first and having Codex fill it in with detail works well, so start from a sketch whenever the layout or a silhouette matters (who's in front, who faces whom, what fills the left two-thirds). The sketch can be very rough: flat blobs for the masses, a line for the horizon, a dark shape for each thing. Codex keeps the placement, sizes and outlines and paints the detail in. Pass it with the references:

- **A blockout in Blender** with the game's own models (`public/models/*.glb`: the ship frames, the enemies, the bosses) over a flat background. Grey shapes are enough; it's for placement, not looks.
- **Or a quick drawing**: coloured blobs and arrows in any paint program, or a few shapes drawn with PIL.

Say what the sketch is for, so the rough look doesn't leak into the painting:

> The attached sketch.png is a rough layout: use it for the composition only (placement, size, outline and facing of each thing), not for style. Keep its shapes where they are and fill them in with full detail. Take the style from the two paintings.

If the result drifts from the sketch, make the sketch's shapes bolder and simpler rather than writing more about placement in the prompt.

## Keeping a set consistent

- **Same references every time.** Pass the same two or three finished paintings from `public/art/events/` with every generation in a set, so each picture is pulled towards the same look.
- **Use a good result as a reference.** For a series (one creature in several events, a boss's before and after), pass the first picture you kept as a reference for the next, and name what must stay the same: "the same creature as in calf.png: four shell chambers, black vanes, the intake ring".
- **Keep the prompts.** Save each prompt that worked next to the art's brief (in the event's doc, or the *Art to redo* table), so a redo starts from it.
- **Describe our things, not famous ones.** Name the Reach's peoples and machines by what they look like, and list what to reject (§5: no Star Wars shapes, no Earth insignia; for creatures, no Earth animals: see [the umora](npcs/the-umora.md)). Check each result against that list before keeping it.

## Into the game

The set is 640×360, 8-bit palette PNG. Crop to 16:9, resize, quantise:

```python
from PIL import Image
im = Image.open("calf_gen.png").convert("RGB")
w, h = im.size
th = round(w * 9 / 16)
im = im.crop((0, (h - th) // 2, w, (h - th) // 2 + th)).resize((640, 360), Image.LANCZOS)
im.quantize(256, method=Image.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save("public/art/events/calf.png", optimize=True)
```

Look at it at that size before committing: details that read at full size can turn to mush at 640×360.
