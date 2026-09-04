# system-design-from-scratch

> Building every system from Alex Xu's *System Design Interview* (Vol. 1 & 2) — from scratch, in production-grade code.

This is a living portfolio. Each chapter lives in its own directory here as a **git submodule** pointing to a standalone implementation repo. No toy examples. No pseudocode. Every chapter ships with benchmarks, tests, and the reasoning behind every design decision.

---

## Repo Structure

```
system-design-from-scratch/
├── 1.4-Rate-Limiter/          → rate-limiter-go
├── 1.5-Consistent-Hashing/    → consistent-hashing-go · consistent-hash-rs
├── 1.7-Unique-ID-Generator/   → uid-generator-go · uid-generator-rs
├── 1.8-URL-Shortener/         → url-shortener-go
└── 1.13-Search-Autocomplete/  → autocomplete-rs
```

Clone with all submodules:

```bash
git clone --recurse-submodules https://github.com/zeayush/system-design-from-scratch
```

Or, if already cloned:

```bash
git submodule update --init --recursive
```

---

## Volume 1 — System Design Interview

| Directory | Chapter | Implementation | Stack | Status |
|-----------|---------|----------------|-------|--------|
| [`1.4-Rate-Limiter`](1.4-Rate-Limiter/) | Ch. 4 — Rate Limiter | [rate-limiter-go](https://github.com/zeayush/rate-limiter-go) | Go | ✅ |
| [`1.5-Consistent-Hashing`](1.5-Consistent-Hashing/) | Ch. 5 — Consistent Hashing | [consistent-hashing-go](https://github.com/zeayush/consistent-hashing-go) · [consistent-hash-rs](https://github.com/zeayush/consistent-hash-rs) | Go · Rust | ✅ |
| `1.6-Key-Value-Store` | Ch. 6 — Key-Value Store | — | — | 🔜 |
| [`1.7-Unique-ID-Generator`](1.7-Unique-ID-Generator/) | Ch. 7 — Unique ID Generator | [uid-generator-go](https://github.com/zeayush/uid-generator-go) · [uid-generator-rs](https://github.com/zeayush/uid-generator-rs) | Go · Rust | ✅ |
| [`1.8-URL-Shortener`](1.8-URL-Shortener/) | Ch. 8 — URL Shortener | [url-shortener-go](https://github.com/zeayush/url-shortener-go) | Go | ✅ |
| `1.9-Web-Crawler` | Ch. 9 — Web Crawler | — | — | 🔜 |
| `1.10-Notification-System` | Ch. 10 — Notification System | — | — | 🔜 |
| `1.11-News-Feed` | Ch. 11 — News Feed System | — | — | 🔜 |
| `1.12-Chat-System` | Ch. 12 — Chat System | — | — | 🔜 |
| [`1.13-Search-Autocomplete`](1.13-Search-Autocomplete/) | Ch. 13 — Search Autocomplete | [autocomplete-rs](https://github.com/zeayush/autocomplete-rs) | Rust | ✅ |
| `1.14-YouTube` | Ch. 14 — YouTube | — | — | 🔜 |
| `1.15-Google-Drive` | Ch. 15 — Google Drive | — | — | 🔜 |

> Ch. 1–3 skipped (conceptual framework / estimation chapters, no implementation target).

---

## Volume 2 — System Design Interview: An Insider's Guide

| Directory | Chapter | Implementation | Stack | Status |
|-----------|---------|----------------|-------|--------|
| `2.1-Proximity-Service` | Ch. 1 — Proximity Service | — | — | 🔜 |
| `2.2-Nearby-Friends` | Ch. 2 — Nearby Friends | — | — | 🔜 |
| `2.3-Google-Maps` | Ch. 3 — Google Maps | — | — | 🔜 |
| `2.4-Message-Queue` | Ch. 4 — Distributed Message Queue | — | — | 🔜 |
| `2.5-Metrics-Monitoring` | Ch. 5 — Metrics Monitoring & Alerting | — | — | 🔜 |
| `2.6-Ad-Click-Aggregation` | Ch. 6 — Ad Click Event Aggregation | — | — | 🔜 |
| `2.7-Hotel-Reservation` | Ch. 7 — Hotel Reservation System | — | — | 🔜 |
| `2.8-Email-Service` | Ch. 8 — Distributed Email Service | — | — | 🔜 |
| `2.9-S3-Object-Storage` | Ch. 9 — S3-like Object Storage | — | — | 🔜 |
| `2.10-Leaderboard` | Ch. 10 — Real-time Gaming Leaderboard | — | — | 🔜 |
| `2.11-Payment-System` | Ch. 11 — Payment System | — | — | 🔜 |
| `2.12-Digital-Wallet` | Ch. 12 — Digital Wallet | — | — | 🔜 |
| `2.13-Stock-Exchange` | Ch. 13 — Stock Exchange | — | — | 🔜 |

> CDN delivery skipped.

---

## What's Built

### Book 1 · Ch. 4 — Rate Limiter · [`rate-limiter-go`](https://github.com/zeayush/rate-limiter-go)

Production-ready rate limiting library in Go. Three algorithms (Fixed Window, Sliding Window Log, Token Bucket), two storage backends (in-memory + Redis), two middleware adapters (stdlib `net/http` + Gin), and Prometheus metrics — all behind clean interfaces so each piece swaps independently.

**Key ideas implemented:** atomic Lua scripts to kill the INCR/EXPIRE race, fail-open on Redis outages, per-key limiting (IP / API key / user ID).

---

### Book 1 · Ch. 5 — Consistent Hashing · [`consistent-hashing-go`](https://github.com/zeayush/consistent-hashing-go) · [`consistent-hash-rs`](https://github.com/zeayush/consistent-hash-rs)

Virtual-node ring with weighted nodes, O(log n) lookup via binary search, automatic rebalancing on node add/remove, and thread-safe reads — implemented in both Go and Rust.

**Key ideas implemented:** virtual node replication factor, CRC32 hashing, `sync.RWMutex` / `RwLock` for read-heavy workloads, benchmark comparisons between language runtimes.

---

### Book 1 · Ch. 7 — Unique ID Generator · [`uid-generator-go`](https://github.com/zeayush/uid-generator-go) · [`uid-generator-rs`](https://github.com/zeayush/uid-generator-rs)

Snowflake-style 64-bit IDs (41-bit timestamp + 10-bit machine ID + 12-bit sequence) and ULID (48-bit timestamp + 80-bit randomness, lexicographically sortable) — implemented in both Go and Rust with configurable custom epochs.

**Key ideas implemented:** machine ID derivation from MAC address, clock-skew guards, monotonic sequence overflow handling, zero-allocation hot path in Rust.

---

### Book 1 · Ch. 8 — URL Shortener · [`url-shortener-go`](https://github.com/zeayush/url-shortener-go)

Full production service in Go — Base-62 short codes, consistent-hash database sharding across Postgres shards, Redis read-through cache, click analytics with GeoIP, link expiry, and a Redis-backed token-bucket rate limiter baked in.

**Key ideas implemented:** Base-62 encoding, consistent-hash sharding (integrates Ch. 5), cache-aside pattern, GeoIP lookup, Dockerized multi-service stack.

---

### Book 1 · Ch. 13 — Search Autocomplete · [`autocomplete-rs`](https://github.com/zeayush/autocomplete-rs)

Full autocomplete engine in Rust — radix trie over bytes, top-K by frequency with a bounded min-heap, Levenshtein typo tolerance to 2 edits, multi-tenant namespaces, RocksDB persistence behind a write-behind batcher, served over axum.

**Key ideas implemented:** edge split/merge so no non-terminal node keeps a single child, `max_subtree_freq` cached per node so top-K skips any subtree that cannot beat the heap cutoff, one Levenshtein DP row carried down the walk and abandoned as soon as its minimum exceeds the budget (Hanov's method), writes queryable immediately from the in-memory trie while a background task coalesces up to 1000 ops or 50ms into one RocksDB `WriteBatch`.

Benchmarks on a 100K-term corpus: prefix search 270ns–16µs depending on prefix length, fuzzy search 326µs at budget 1 and 4.13ms at budget 2 — the last of which sits just under the 5ms target with nothing to spare, and is why the HTTP layer caps `typo` at 2.

---

## The Machine Room

`frontend/` is a single-page showroom where four of these chapters run **live in the browser** — the real libraries compiled to WebAssembly, not reimplementations. Mash the buttons: overload the rate limiter, kill a node on the hash ring, spam the ID generator, and type at an autocomplete backed by 50,000 real English words carrying their real Google web-corpus frequencies.

Ch. 8 is the exception: it needs Postgres and Redis, so it cannot run as WebAssembly. Its same-origin proxy is written and the panel is wired, but the service is not deployed. Ch. 13's write path — RocksDB batching, restart recovery, multi-tenancy — is out of the browser for the same reason; the panel demonstrates the query path only.

```bash
cd frontend
./build.sh                    # Go 1.22+; Rust + wasm-bindgen for 1.13
python3 -m http.server 8000   # wasm will not load over file://
```

See [`frontend/readme.txt`](frontend/readme.txt) for how the shims stay honest — no algorithm is implemented in that directory, and the chapter repos are consumed unmodified.

---

## Philosophy

- **Real code, not diagrams.** Every chapter is a working, tested codebase.
- **Benchmarks included.** Claim nothing without numbers.
- **Both Go and Rust.** Go for services and APIs. Rust for hot-path libraries where allocation cost matters.
- **Chapters build on each other.** The URL shortener literally uses the consistent-hashing patterns from Ch. 5.

---

## Running Anything

Each submodule repo is self-contained:

```bash
# Consistent hashing in Go
cd 1.5-Consistent-Hashing/consistent-hashing-go
go test ./...
go test -bench=. ./...
```

```bash
# UID generator in Rust
cd 1.7-Unique-ID-Generator/uid-generator-rs
cargo test
cargo bench
```

```bash
# URL shortener (Docker)
cd 1.8-URL-Shortener/url-shortener-go
docker compose up --build
```

```bash
# Search autocomplete in Rust
cd 1.13-Search-Autocomplete/autocomplete-rs
cargo test
cargo bench
```

---

## Author

[@zeayush](https://github.com/zeayush) — working through Alex Xu's books one chapter at a time until it's all done.
