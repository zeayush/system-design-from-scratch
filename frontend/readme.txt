SYSTEM DESIGN MACHINE ROOM — frontend
=====================================

A single-page, playable showroom for the implementations in this repo. Scroll
down and each chapter is a machine you operate, drawn in white pencil on pure
black.

STATUS: UI shell only. There is deliberately NO algorithm implementation in this
directory. Every machine talks to the real Go/Rust code in the submodules through
the Backend adapter in index.html. Until each endpoint exists, that panel renders
a NOT CONNECTED state instead of faking an answer.

Open index.html in any browser. No build step, no dependencies.


WHY THERE IS NO JS IMPLEMENTATION
---------------------------------

The first draft of this page reimplemented all four algorithms in JavaScript. That
was the wrong shape: it created a second, drifting implementation of work that
already exists in Go and Rust. Those reimplementations have been removed. The page
now renders and animates; it does not compute.

The visual layer is the part worth keeping. Ring arcs, the 64-bit strip, token
animation, latency readouts and the comic bubbles are all pure rendering — they
read from whatever the Backend adapter returns.


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

index.html    markup, styles, and the Backend adapter — no algorithms
readme.txt    this file
