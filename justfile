# Rustwing Raiders
# `just` lists the recipes.

default:
    @just --list

# install dependencies
install:
    npm install

# run the game locally with hot reload (rebuilds the models first)
dev: models
    npm run dev

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

# fly levels headless with the autopilot (e.g. just autopilot --planet orutal --mode hunt --seeds 20)
autopilot *args:
    @npx esbuild tools/autopilot.ts --bundle --platform=node --format=esm --log-level=warning --outfile="${TMPDIR:-/tmp}/rustwing-autopilot.mjs"
    @node "${TMPDIR:-/tmp}/rustwing-autopilot.mjs" {{args}}

# typecheck
check:
    npx tsc --noEmit

# screenshots in headless Chrome (dev server must be running), e.g. just shot "?planet=orutal&mode=raid&autopilot"
shot query="" *args:
    @npx esbuild tools/shot.ts --bundle --platform=node --format=esm --log-level=warning --outfile="${TMPDIR:-/tmp}/rustwing-shot.mjs"
    @node "${TMPDIR:-/tmp}/rustwing-shot.mjs" "{{query}}" {{args}}
