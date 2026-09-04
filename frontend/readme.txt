SYSTEM DESIGN MACHINE ROOM — frontend
=====================================

A single-page, playable showroom for the implementations in this repo. Scroll
down and each chapter is a machine you operate, drawn in white pencil on pure
black.

STATUS: Phases 1-3 and 5 done. The page is driven by the real chapter
libraries compiled to WebAssembly. There is no algorithm implementation in this
directory -- wasm/ and wasm-rs/ are marshalling shims only, and the chapter
repos are consumed as dependencies and never modified.

  1.4  LIVE   limiter.Allow() runs in your tab
  1.5  LIVE   ConsistentHashRing.Get() drives every arc and dot
  1.7  LIVE   Snowflake.NextID() / NewULID() generate every ID shown
  1.8  DORMANT needs Postgres + Redis; proxy is written, service not deployed
  1.13 LIVE   RadixTrie::prefix_search / fuzzy_search answer every keystroke,
              over 50,000 real English words with real web-corpus counts

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

  The corpus (static/corpus.tsv) is committed. Rebuild it only to change it:

    ./data/build-corpus.sh

HOW IT FITS TOGETHER

  wasm/go.mod      replace directives point at the three submodules, so the
                   libraries are dependencies. uid-generator-go declares
                   `module uid-generator-go` (not a URL), so replace is the
                   only way to import it at all.
  wasm/main.go     ~16 exported functions, all marshalling. No logic.
  wasm-rs/         Rust equivalent for 1.13. Four exported functions. See
                   MOUNTING 1.13 BY PATH below for why it is wired the odd way.
  data/            build-corpus.sh -- provenance and filtering for the corpus.
  index.html       UI + the Backend adapter. Loads the wasm lazily, per panel,
                   on first scroll into view.
  functions/       Cloudflare Pages Function proxying /api/* to 1.8.
  build.sh         builds both wasm artifacts + copies wasm_exec.js.


MOUNTING 1.13 BY PATH

autocomplete-rs is one crate whose lib.rs unconditionally declares `pub mod
api`, `pub mod storage` and `pub mod error`, dragging in rocksdb, axum and
tokio. None of those build for wasm32, and the crate exposes no feature flag to
switch them off -- so a normal Cargo path dependency on it cannot compile for
the browser at all.

The clean fix is upstream: put the server modules behind a default-on `server`
feature. That is a ~15-line change and it was deliberately not made, because
the chapter repos stay untouched.

So wasm-rs/src/lib.rs mounts the three modules it needs as its own, straight
out of the submodule working tree:

    #[path = ".../autocomplete-rs/src/scoring.rs"] mod scoring;
    #[path = ".../autocomplete-rs/src/typo.rs"]    mod typo;
    #[path = ".../autocomplete-rs/src/trie/mod.rs"] mod trie;

Those three depend only on std plus one serde::Serialize derive, and they refer
to each other as crate::scoring / crate::typo, which resolves correctly once
they sit side by side at this crate's root. The bytes compiled are the
chapter's own, unmodified, read in place -- nothing is vendored or copied, and
`git status` in the submodule stays clean.

The coupling this buys, stated plainly: if autocomplete-rs ever adds a
crate::error or crate::storage import to one of those three modules, this build
breaks. build.sh fails loudly when it does, and the fix at that point is the
feature flag upstream.


TESTING 1.13

  cd frontend/wasm-rs && cargo test        # 34 tests, no browser needed

Three of those are this shim's own: the corpus loads to exactly 50,000 terms,
loading twice does not double frequencies (the shim calls set(), not insert(),
because insert() accumulates), and the typo budgets behave as the panel's copy
claims. Both bugs recorded at the bottom of this file were caught by them.

The other 31 are autocomplete-rs's own unit tests for trie, scoring and typo.
They run here for free: mounting the modules by path brings their #[cfg(test)]
blocks along with them. A regression in the chapter's trie fails this build.

The tests live inside src/lib.rs rather than in tests/, which is the less
idiomatic choice and a deliberate one: an integration test would need the crate
to expose an `rlib`, and an rlib in the crate graph costs LTO about 44% of the
shipped wasm -- 76KB against 110KB -- for nothing the browser uses.


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
    50,000 ("webalizer", "anleitung", "paa"), which is what makes the panel
    read like a search box instead of a scrape.

Say "filtered vocabulary, real frequencies" wherever this is described. "Real
data" is the whole claim of the panel and it should stay exactly true.

KEEP_RAW=1 ./data/build-corpus.sh ships the unfiltered crawl. Read the above
first; the page is public.

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

CORRECTIONS FOUND WHEN READING THE REAL CODE
--------------------------------------------

The JS draft was written from README prose before the submodules were checked
out. Reading the actual source turned up several places where it was simply wrong.
Recording them here so they are not reintroduced:

  * Short codes are 6 characters from crypto/rand, NOT Base-62 of an
    auto-increment id. See internal/shortcode/base62.go — Random() draws 6 chars
    from "0-9A-Za-z" (uppercase before lowercase). There is no sequence counter.
  * Snowflake's DefaultEpoch is 2020-01-01 UTC, not 2024-01-01.
  * The ring is weighted: New(replicas) then Add(node string, weight int).
  * url-shortener-go already imports rate-limiter-go and applies it to /api,
    keyed by IP. The chapters genuinely compose — worth showing on the page.
  * rate-limiter-go's cmd/server is hardcoded to FixedWindow, 100/min, keyed by
    the X-API-Key header. It cannot switch algorithms or change limit/window from
    a query string yet.

Two more turned up the same way when 1.13 was wired, both caught by
wasm-rs/tests/smoke.rs before they reached the page:

  * The trie holds MORE nodes than terms -- 60,151 nodes for 50,000 words --
    because edge splits create internal branch nodes. A draft of the panel
    claimed the opposite ("N nodes hold M words"). The compression is real but
    it lives in the edge-label BYTES: 116 KB of labels for 367 KB of raw words,
    3.2x smaller. State it in bytes, never in nodes.
  * fuzzy_search is plain Levenshtein, not Damerau-Levenshtein, so a
    transposition costs TWO edits. "recieve" -> "receive" is therefore not
    reachable at budget 1; at budget 1 the trie returns "relieve" instead. The
    panel's 1-edit invitation had to change to "seperate" -> "separate", which
    is a genuine single substitution. The 2-edit case is now the more
    interesting demo, and the copy says why.


WIRING PLAN
-----------

Fill in ENDPOINTS at the top of index.html as each backend comes up. The four
adapter objects are the entire contract.

1.4  RATE LIMITER  — rate-limiter-go
     Already has cmd/server. Deploy as-is and the panel works for the FixedWindow
     case: POST/GET /api/hello with X-API-Key, then read X-RateLimit-Limit,
     X-RateLimit-Remaining, X-RateLimit-Reset and Retry-After, which
     middleware/http.go already writes.
     To drive the algorithm/limit/window controls, cmd/server needs to accept
     those as parameters and build the matching Limiter per key.
     Note: key per browser session (the UI sends a random demo-xxxx key) or one
     visitor exhausts the bucket for everybody.

1.5  CONSISTENT HASHING  — consistent-hashing-go / consistent-hash-rs
     Best served as WebAssembly: it is pure computation, so it can run in the page
     with no server and stay a free static deploy.
     The ring visualisation needs ownership arcs, and the library exposes only
     Nodes(), Len(), Get(key) and Add/Remove. Rather than exporting vnode
     positions, sample Get() at ~720 points around the keyspace and draw the arcs
     from that. Requires no change to ring.go.
     "Keys moved" comes from diffing Get() over the key set before and after a
     membership change.

1.7  UNIQUE ID GENERATOR  — uid-generator-go / uid-generator-rs
     Also ideal as WebAssembly. NextID() and NewULID() over the wasm boundary;
     DecomposeID(id, epoch) feeds the bit strip directly. The Rust build
     benchmarking its own hot path live in the browser is the strongest version
     of this demo.
     Careful across the boundary: Snowflake returns int64, which does not survive
     a JS number. Pass it as a string and parse with BigInt.

1.8  URL SHORTENER  — url-shortener-go
     Cannot be WebAssembly; it needs Postgres and Redis. Deploy the Docker Compose
     stack and point ENDPOINTS.shortener at it.
     Routes already exist: POST /api/links, GET /api/links/:code,
     DELETE /api/links/:code, GET /api/links/:code/analytics, GET /:code, /health.
     Needs CORS for the Pages origin.
     The "squeeze" animation should show the real 6-char random code, and the
     MISS/HIT latency readout should come from real timings rather than the
     simulated numbers the first draft used.

1.13 SEARCH AUTOCOMPLETE  -- autocomplete-rs
     DONE as wasm, query path only. prefix_search / fuzzy_search / stats over
     the boundary, corpus handed across in one crossing (50,000 insert() calls
     from JS would mean 50,000 boundary crossings and a string conversion each).
     Latency is timed in JS around the call, not simulated -- and because
     performance.now() is clamped to roughly 5-100us, a single sub-microsecond
     query cannot be timed directly. The panel runs the query enough times to
     clear the clamp and reports the mean with the run count, the same reason
     cargo bench exists.
     NOT shown: the RocksDB write-behind, restart recovery and the multi-tenant
     Engine. Those need a server and a persistent disk, so they are out of
     scope for a free static deploy -- same call as 1.8.

Recommended order: 1.4 first (its server already exists), then 1.5 and 1.7 as
wasm, then 1.8 last since it is the only one with an always-on hosting cost.


DESIGN
------

Pure #000 ground, everything drawn in white chalk: hand-wobbled border radii,
doubled pencil strokes, 45-degree hatching for empty capacity, and SVG
feTurbulence displacement filters to rough up the ring and the speech-bubble
tails. Single committed theme — it does not follow the viewer's light/dark
setting, by design. One accent only: chalk red #FF6B5A, reserved for the blocked
/ moved / not-connected states.

Type: Caveat (hand-lettered display), Karla (body), JetBrains Mono (IDs, hashes,
bit fields), from Google Fonts with real fallback stacks.


FILES
-----

index.html          markup, styles, Backend adapter -- no algorithms
wasm/               Go module: marshalling shim over the chapter libraries
wasm-rs/            Rust crate: marshalling shim over 1.13's radix trie
                    src/lib.rs also carries the smoke tests -- see TESTING
data/               build-corpus.sh: how static/corpus.tsv was cut
functions/          Cloudflare Pages Function: same-origin proxy for 1.8
build.sh            builds both wasm artifacts
PHASE4-DEPLOY.md    ready-to-file deployment issue
readme.txt          this file
