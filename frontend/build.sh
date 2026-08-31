#!/usr/bin/env bash
# Builds the wasm bridge for the Machine Room page.
#
# Everything this produces lands in frontend/static/. Nothing outside frontend/
# is written to — the chapter libraries are read as Go module dependencies via
# the replace directives in wasm/go.mod.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p static

if ! command -v go >/dev/null 2>&1; then
  echo "error: no Go toolchain on PATH. Install Go 1.22+ and re-run." >&2
  exit 1
fi

# The submodules must be checked out — the replace directives point straight at
# them, and Go fails with a confusing "no such file" if they are empty.
for d in ../1.4-Rate-Limiter/rate-limiter-go \
         ../1.5-Consistent-Hashing/consistent-hashing-go \
         ../1.7-Unique-ID-Generator/uid-generator-go; do
  if [ ! -f "$d/go.mod" ]; then
    echo "error: $d is empty. Run: git submodule update --init --recursive" >&2
    exit 1
  fi
done

echo "→ building static/machine.wasm"
( cd wasm && GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o ../static/machine.wasm . )

# wasm_exec.js is the runtime glue Go ships with the toolchain. Its location
# moved from misc/wasm to lib/wasm in Go 1.24, so check both.
GOROOT="$(go env GOROOT)"
for candidate in "$GOROOT/lib/wasm/wasm_exec.js" "$GOROOT/misc/wasm/wasm_exec.js"; do
  if [ -f "$candidate" ]; then
    cp "$candidate" static/wasm_exec.js
    echo "→ copied wasm_exec.js from ${candidate#$GOROOT/}"
    break
  fi
done

if [ ! -f static/wasm_exec.js ]; then
  echo "error: wasm_exec.js not found under $GOROOT (looked in lib/wasm and misc/wasm)" >&2
  exit 1
fi

echo
ls -lh static/machine.wasm static/wasm_exec.js
echo
echo "done. Serve this directory over HTTP (file:// will not load wasm):"
echo "  python3 -m http.server 8000 --directory $(pwd)"
