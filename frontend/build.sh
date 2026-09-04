#!/usr/bin/env bash
# Builds the wasm bridges for the Machine Room page.
#
# Two artifacts, because they come from two toolchains and cannot be merged:
#   static/machine.wasm      Go   — chapters 1.4, 1.5, 1.7
#   static/machine_rs_bg.wasm Rust — chapter 1.13 (+ machine_rs.js glue)
#
# Everything this produces lands in frontend/static/. Nothing outside frontend/
# is written to — the Go chapters are read via the replace directives in
# wasm/go.mod, and the Rust chapter via the #[path] mounts in wasm-rs/src/lib.rs.
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

# ─────────────────────────────── Rust / 1.13 ──────────────────────────────────
# Skipped rather than fatal: the Go panels are the bulk of the page, and a
# contributor without a Rust toolchain should still be able to build them.
rust_ok=1
for tool in cargo wasm-bindgen; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "warn: no $tool on PATH — skipping 1.13." >&2
    [ "$tool" = "wasm-bindgen" ] && echo "      cargo install wasm-bindgen-cli" >&2
    rust_ok=0
  fi
done

if [ "$rust_ok" = "1" ] && ! rustup target list --installed 2>/dev/null | grep -qx wasm32-unknown-unknown; then
  echo "warn: wasm32-unknown-unknown target missing — skipping 1.13." >&2
  echo "      rustup target add wasm32-unknown-unknown" >&2
  rust_ok=0
fi

if [ "$rust_ok" = "1" ] && [ ! -f ../1.13-Search-Autocomplete/autocomplete-rs/Cargo.toml ]; then
  echo "warn: 1.13-Search-Autocomplete/autocomplete-rs is empty — skipping 1.13." >&2
  echo "      git submodule update --init --recursive" >&2
  rust_ok=0
fi

# wasm-bindgen refuses to process a module built against a different version of
# its own crate, and the error it prints is not obvious. Check it up front.
if [ "$rust_ok" = "1" ]; then
  cli_ver="$(wasm-bindgen --version | awk '{print $2}')"
  crate_ver="$(awk '/^name = "wasm-bindgen"$/{getline; gsub(/[",]/,""); print $3; exit}' wasm-rs/Cargo.lock 2>/dev/null || true)"
  if [ -n "$crate_ver" ] && [ "$cli_ver" != "$crate_ver" ]; then
    echo "warn: wasm-bindgen CLI $cli_ver != crate $crate_ver — skipping 1.13." >&2
    echo "      cargo install -f wasm-bindgen-cli --version $crate_ver" >&2
    rust_ok=0
  fi
fi

if [ "$rust_ok" = "1" ]; then
  echo "→ building static/machine_rs_bg.wasm"
  ( cd wasm-rs && cargo build --release --quiet --target wasm32-unknown-unknown )
  wasm-bindgen --target web --no-typescript --out-dir static \
    wasm-rs/target/wasm32-unknown-unknown/release/machine_rs.wasm
fi

if [ ! -f static/corpus.tsv ]; then
  echo "warn: static/corpus.tsv missing — the 1.13 panel will report NOT CONNECTED." >&2
  echo "      ./data/build-corpus.sh" >&2
fi

echo
ls -lh static/machine.wasm static/wasm_exec.js 2>/dev/null
[ -f static/machine_rs_bg.wasm ] && ls -lh static/machine_rs_bg.wasm static/machine_rs.js
[ -f static/corpus.tsv ] && ls -lh static/corpus.tsv
echo
echo "done. Serve this directory over HTTP (file:// will not load wasm):"
echo "  python3 -m http.server 8000 --directory $(pwd)"
