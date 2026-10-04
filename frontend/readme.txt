SYSTEM DESIGN MACHINE ROOM — frontend
=====================================

A single-page, interactive showroom for the implementations in this repo. Each
chapter is a panel you can operate, drawn in white pencil on pure black.

The page is driven by the real chapter libraries compiled to WebAssembly.
There is no algorithm implementation in this directory -- wasm/ and wasm-rs/
are marshalling shims only, and the chapter repos are consumed as dependencies
and never modified.

  1.4  LIVE    limiter.Allow() runs in your tab
  1.5  LIVE    ConsistentHashRing.Get() drives every arc and dot
  1.7  LIVE    Snowflake.NextID() / NewULID() generate every ID shown
  1.8  LIVE    url-shortener-go on Cloud Run, via the /api/* proxy
  1.13 LIVE    RadixTrie::prefix_search / fuzzy_search answer every keystroke,
               over 50,000 real English words with real web-corpus counts
  2.10 LIVE    leaderboard-go on Cloud Run, REST + WebSocket via the /lb/* proxy

TWO WASM BINARIES, NOT ONE

  static/machine.wasm        Go   -- 1.4, 1.5, 1.7   (+ wasm_exec.js)
  static/machine_rs_bg.wasm  Rust -- 1.13            (+ machine_rs.js)

A Go wasm build and a Rust cdylib cannot be merged into one module, so the page
carries both and loads each lazily and independently. The Go side comes in
through a script tag and the Go runtime; the Rust side is a wasm-bindgen
--target web ES module pulled in with a dynamic import().

BUILD

  git submodule update --init --recursive
  ./build.sh                       # writes static/
  python3 -m http.server 8000      # wasm will not load over file://

  build.sh needs Go 1.22+ for the Go panels, and for 1.13 additionally:

    rustup target add wasm32-unknown-unknown
    cargo install wasm-bindgen-cli   # version must match wasm-rs/Cargo.lock

  The Rust stage is skipped with a warning rather than failing the build, so a
  contributor without a Rust toolchain can still build the Go panels. The CLI
  and crate versions are compared up front because wasm-bindgen's own error for
  a mismatch is not obvious.

  The build output in static/ is committed, so deploying needs no build step.
  The corpus (static/corpus.tsv) is committed too. Rebuild it only to change it:

    ./data/build-corpus.sh

HOW IT FITS TOGETHER

  wasm/go.mod      replace directives point at the three submodules, so the
                   libraries are dependencies. uid-generator-go declares
                   `module uid-generator-go` (not a URL), so replace is the
                   only way to import it at all.
  wasm/main.go     16 exported functions, all marshalling. No logic.
  wasm/smoke.mjs   Node smoke test for the Go bridge.
  wasm-rs/         Rust equivalent for 1.13. Four exported functions. See
                   MOUNTING 1.13 BY PATH below for why it is wired this way.
  data/            build-corpus.sh -- provenance and filtering for the corpus.
  index.html       UI and panel wiring. Loads the wasm lazily, per panel,
                   on first scroll into view.
  functions/       Cloudflare Pages Functions: /api/* to 1.8, /lb/* to 2.10.
  build.sh         builds both wasm artifacts + copies wasm_exec.js.


MOUNTING 1.13 BY PATH

autocomplete-rs is one crate whose lib.rs unconditionally declares `pub mod
api`, `pub mod storage` and `pub mod error`, dragging in rocksdb, axum and
tokio. None of those build for wasm32, and the crate exposes no feature flag to
switch them off -- so a normal Cargo path dependency on it cannot compile for
the browser at all.

The clean fix is upstream: put the server modules behind a default-on `server`
feature. That is a ~15-line change, not made here because the chapter repos
stay untouched.

So wasm-rs/src/lib.rs mounts the three modules it needs as its own, straight
out of the submodule working tree:

    #[path = ".../autocomplete-rs/src/scoring.rs"] mod scoring;
    #[path = ".../autocomplete-rs/src/typo.rs"]    mod typo;
    #[path = ".../autocomplete-rs/src/trie/mod.rs"] mod trie;

Those three depend only on std plus one serde::Serialize derive, and they refer
to each other as crate::scoring / crate::typo, which resolves correctly once
they sit side by side at this crate's root. Nothing is vendored or copied, and
`git status` in the submodule stays clean.

The cost: if autocomplete-rs ever adds a crate::error or crate::storage import
to one of those three modules, this build breaks. build.sh fails loudly when it
does, and the fix at that point is the feature flag upstream.


TESTING

  node wasm/smoke.mjs                      # Go bridge: 1.4, 1.5, 1.7
  cd wasm-rs && cargo test                 # Rust bridge: 1.13, 34 tests

Three of the Rust tests are this shim's own: the corpus loads to exactly 50,000
terms, loading twice does not double frequencies (the shim calls set(), not
insert(), because insert() accumulates), and the typo budgets behave as the
panel's copy claims.

The other 31 are autocomplete-rs's own unit tests for trie, scoring and typo.
Mounting the modules by path brings their #[cfg(test)] blocks along, so a
regression in the chapter's trie fails this build.

The tests live inside src/lib.rs rather than in tests/: an integration test
would need the crate to expose an `rlib`, and an rlib in the crate graph costs
LTO about 44% of the shipped wasm -- 76KB against 110KB.


THE CORPUS

static/corpus.tsv is 50,000 English words with their real occurrence counts
from the Google Web Trillion-Word Corpus (Brants & Franz, distributed by the
LDC), as published by Peter Norvig at https://norvig.com/ngrams/ alongside
"Natural Language Corpus Data" in Beautiful Data.

The frequencies are untouched. The vocabulary is filtered, for two reasons:

  * count_1w is a raw web crawl and top-K by frequency surfaces exactly what a
    raw web crawl is full of. "sex" ranks 182, "porn" 659, "nude" 828 -- the
    first suggestions a visitor would see on typing "s" or "p". The filter is
    an intersection with an English dictionary plus the LDNOOBW blocklist.
  * The dictionary pass also drops crawl debris ranking well inside the top
    50,000 ("webalizer", "anleitung", "paa").

So the accurate description is "filtered vocabulary, real frequencies".

KEEP_RAW=1 ./data/build-corpus.sh ships the unfiltered crawl.


TWO PLACES THE FRONTEND COMPUTES SOMETHING, AND WHY

  * ringKeyPos() recomputes CRC-32 to decide where to DRAW a key. ring.go's
    keyHash is unexported. Ownership always comes from Get(); if the library
    ever changes its hash, dots move but colours stay correct.
  * The "hash % N would move" counterfactual is computed in JS because the
    library deliberately does not implement modulo hashing -- it is the naive
    baseline the chapter exists to beat.

RING ARCS WITHOUT EXPORTING VNODES

  ConsistentHashRing does not expose virtual-node positions, and adding an
  accessor would mean editing 1.5. Instead ringSample() hashes 1,600 probe
  keys, sorts them by position, and asks Get() who owns each. Consecutive
  probes bound an arc. Rendering approximation only -- never used for the
  "keys moved" figure, which is an exact diff of Get() over all 240 keys.


FACTS THE PAGE COPY DEPENDS ON
------------------------------

Checked against the chapter source. Keep the copy in line with these:

  * Short codes are 6 characters from crypto/rand, NOT Base-62 of an
    auto-increment id. See internal/shortcode/base62.go -- Random() draws 6
    chars from "0-9A-Za-z". There is no sequence counter.
  * Snowflake's DefaultEpoch is 2020-01-01 UTC.
  * The ring is weighted: New(replicas) then Add(node string, weight int).
  * url-shortener-go imports rate-limiter-go and applies it to /api, keyed by
    IP -- the reason the proxy forwards the client address.
  * The trie holds MORE nodes than terms -- 60,151 nodes for 50,000 words --
    because edge splits create internal branch nodes. The compression is in
    the edge-label BYTES: 116 KB of labels for 367 KB of raw words, 3.2x
    smaller. State it in bytes, never in nodes.
  * fuzzy_search is plain Levenshtein, not Damerau-Levenshtein, so a
    transposition costs TWO edits. "recieve" -> "receive" is not reachable at
    budget 1 (the trie returns "relieve" instead). The 1-edit example is
    "seperate" -> "separate", a single substitution.
  * performance.now() is clamped to roughly 5-100us, so a single
    sub-microsecond query cannot be timed directly. The 1.13 panel repeats the
    query enough times to clear the clamp and reports the mean with the run
    count.


1.8 URL SHORTENER
-----------------

Cannot be WebAssembly; it needs Postgres and Redis. It runs on Cloud Run, and
the Pages Function in functions/ proxies /api/* to it same-origin, so the
service needs no CORS changes. The backend URL is the SHORTENER_ORIGIN
environment variable on the Pages project. Setting SHORTENER_API to null in
index.html puts the panel back into its "not deployed" state.

Routes: POST /api/links, GET /api/links/:code, DELETE /api/links/:code,
GET /api/links/:code/analytics, GET /:code, /health. Short-link redirects are
served from a separate hostname by ../redirect/.

Not shown for 1.13 either: the RocksDB write-behind, restart recovery and the
multi-tenant Engine need a server and a persistent disk.


2.10 LEADERBOARD
----------------

A click race on leaderboard-go: register under a name, and each click is one
point on the daily, weekly and all-time boards, global or per region. Runs on
Cloud Run with SIM_BOTS=0, since bot points are not clicks. The board and your
standing arrive over the service's own WebSocket at /lb/ws.

functions/lb/[[path]].js proxies /lb/* to LEADERBOARD_ORIGIN and holds
LEADERBOARD_KEY, a secret key the page never sees. It allows only:
registering a visitor-xxxxxxxx player with a 1-20 character name of letters,
digits, spaces and _ . ' -, adding 1-30 clicks per write to such a player, and
the reads. Every other route is refused.

Clicks are batched: the tab counts them and sends one write every 1.5 s,
because the service allows 60 writes a minute per IP. A 429 keeps the clicks
and backs off; unsent clicks go out with sendBeacon when the tab closes. The
limits are per write, not per person, so a script can outpace a human. It is
a demo, not a contest.

Shares 1.8's Neon instance (its own `leaderboard` database, on the direct
endpoint, because migrations take a session advisory lock the pooler cannot
hold) and 1.8's Upstash database. The keys do not collide: lb:* and rl:lb:<ip>
here, url:* and rl:<ip> for 1.8.

The socket closes 20 s after the panel leaves view or the tab is hidden, so the
service can scale to zero. Cloud Run ends WebSockets at its 900 s request
timeout; the panel reconnects and gets a fresh snapshot.


DESIGN
------

Pure #000 ground, everything drawn in white chalk: hand-wobbled border radii,
doubled pencil strokes, 45-degree hatching for empty capacity, and SVG
feTurbulence displacement filters to rough up the ring and the speech-bubble
tails. Single dark theme -- it does not follow the viewer's light/dark
setting. One accent only: chalk red #FF6B5A, reserved for the blocked / moved /
not-connected states.

Type: Caveat (hand-lettered display), Karla (body), JetBrains Mono (IDs, hashes,
bit fields), from Google Fonts with fallback stacks.


FILES
-----

index.html          markup, styles, panel wiring -- no algorithms
wasm/               Go module: marshalling shim over the chapter libraries
wasm-rs/            Rust crate: marshalling shim over 1.13's radix trie
                    src/lib.rs also carries the smoke tests -- see TESTING
data/               build-corpus.sh: how static/corpus.tsv was cut
functions/          Cloudflare Pages Functions: same-origin proxies for 1.8
                    (api/) and 2.10 (lb/)
build.sh            builds both wasm artifacts
readme.txt          this file
