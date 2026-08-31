SYSTEM DESIGN MACHINE ROOM — frontend
=====================================

A single-page, playable showroom for the implementations in this repo. Scroll
down and each chapter is a machine you operate, drawn in white pencil on pure
black.

STATUS: Phases 1-3 and 5 done. The page is driven by the real chapter
libraries compiled to WebAssembly. There is no algorithm implementation in this
directory -- frontend/wasm/ is a marshalling shim only, and the chapter repos
are consumed as dependencies and never modified.

  1.4  LIVE   limiter.Allow() runs in your tab
  1.5  LIVE   ConsistentHashRing.Get() drives every arc and dot
  1.7  LIVE   Snowflake.NextID() / NewULID() generate every ID shown
  1.8  DORMANT needs Postgres + Redis; proxy is written, service not deployed

BUILD

  git submodule update --init --recursive
  ./build.sh                       # needs Go 1.22+; writes static/
  python3 -m http.server 8000      # wasm will not load over file://

HOW IT FITS TOGETHER

  wasm/go.mod      replace directives point at the three submodules, so the
                   libraries are dependencies. uid-generator-go declares
                   `module uid-generator-go` (not a URL), so replace is the
                   only way to import it at all.
  wasm/main.go     ~16 exported functions, all marshalling. No logic.
  index.html       UI + the Backend adapter. Loads the wasm lazily, per panel,
                   on first scroll into view.
  functions/       Cloudflare Pages Function proxying /api/* to 1.8.
  build.sh         builds static/machine.wasm + copies wasm_exec.js.

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
functions/          Cloudflare Pages Function: same-origin proxy for 1.8
build.sh            builds static/machine.wasm
PHASE4-DEPLOY.md    ready-to-file deployment issue
readme.txt    this file
