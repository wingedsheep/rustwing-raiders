# Rustwing Raiders
# `just` lists the recipes.

default:
    @just --list

# install dependencies
install:
    npm install

# run the game locally with hot reload (rebuilds the models first); `just dev fixed` serves a frozen build instead
dev mode="": models
    {{ if mode == "fixed" { "npx vite build --logLevel warn && npx vite preview --port 5190 --open" } else { "npm run dev" } }}

# just the dev server, without rebuilding the models
serve:
    npm run dev

# build for the web (into dist/)
build: models
    npm run build

# rebuild every model from the Blender scripts (headless), or one module: just models ships
models module="":
    blender -b --factory-startup -P tools/models/build.py -- {{ if module == "" { "" } else { "--only " + module } }} 2>&1 | grep -E "templates|Error|Traceback" || true

# render a preview of a model module (e.g. just preview props_a, just preview ships demo_kestrel)
preview module kind="":
    blender -b --factory-startup -P tools/models/build.py -- --only {{module}} --preview "${TMPDIR:-/tmp}/{{module}}-preview.png" {{ if kind == "" { "" } else { "--kind " + kind } }} > /dev/null
    open "${TMPDIR:-/tmp}/{{module}}-preview.png"

# render the minigames' sprite sheets from Blender (headless), or one: just sprites demo (see tools/sprites/README.md)
sprites sheet="":
    blender -b --factory-startup -P tools/sprites/render.py -- {{ if sheet == "" { "" } else { "--only " + sheet + " --preview ${TMPDIR:-/tmp}/sprites-" + sheet + ".png" } }} 2>&1 | grep -E "^sprites|Error|Traceback" || true

# fly levels headless with the autopilot (e.g. just autopilot --planet orutal --mode hunt --seeds 20)
autopilot *args:
    @npx esbuild tools/autopilot.ts --bundle --platform=node --format=esm --log-level=warning --outfile="${TMPDIR:-/tmp}/rustwing-autopilot.mjs"
    @node "${TMPDIR:-/tmp}/rustwing-autopilot.mjs" {{args}}

# watch the autopilot fly level after level in the browser (e.g. just tour, just tour "planet=orutal&mode=hunt&coop")
tour query="":
    #!/usr/bin/env bash
    url="http://localhost:5190/?tour&{{query}}"
    if curl -s -o /dev/null http://localhost:5190; then open "$url"; else npx vite --open "/?tour&{{query}}"; fi

# the wave lab: compose waves, fly them in the game, bench them against every ship (solo and co-op), check every enemy's model
lab:
    #!/usr/bin/env bash
    url="http://localhost:5190/wave-lab.html"
    if curl -s -o /dev/null http://localhost:5190; then open "$url"; else npx vite --open /wave-lab.html; fi

# typecheck
check:
    npx tsc --noEmit

# screenshots in headless Chrome (dev server must be running), e.g. just shot "?planet=orutal&mode=raid&autopilot"
shot query="" *args:
    @npx esbuild tools/shot.ts --bundle --platform=node --format=esm --log-level=warning --outfile="${TMPDIR:-/tmp}/rustwing-shot.mjs"
    @node "${TMPDIR:-/tmp}/rustwing-shot.mjs" "{{query}}" {{args}}

# a biome's still beside its painting, and the grey frame, at a fixed seed and moment (e.g. just look kessra mesarun --at 20, just look --all; see docs/readability.md)
look *args:
    @npx esbuild tools/look.ts --bundle --platform=node --format=esm --log-level=warning --outfile="${TMPDIR:-/tmp}/rustwing-look.mjs"
    @node "${TMPDIR:-/tmp}/rustwing-look.mjs" {{args}}

# the forge, headless: builds side by side against a target (e.g. just forge --a rivet,flak --b frost,anchor --target plated --combos=both)
forge *args:
    @npx esbuild tools/forge.ts --bundle --platform=node --format=esm --log-level=warning --outfile="${TMPDIR:-/tmp}/rustwing-forge.mjs"
    @node "${TMPDIR:-/tmp}/rustwing-forge.mjs" {{args}}

# check every event choice shows what it does: plays each one out every way it can go (e.g. just event-audit derelict)
event-audit event="":
    @npx esbuild tools/event-audit.ts --bundle --platform=node --format=esm --log-level=warning --outfile="${TMPDIR:-/tmp}/rustwing-event-audit.mjs"
    @node "${TMPDIR:-/tmp}/rustwing-event-audit.mjs" {{event}}
