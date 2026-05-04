# system-design-from-scratch

> Building every system from Alex Xu's *System Design Interview* (Vol. 1 & 2) — from scratch, in production-grade code.

This is a living portfolio. Each chapter gets its own standalone repository with real implementations, benchmarks, tests, and the reasoning behind every design decision. No toy examples. No pseudocode.

---

## The Plan

| # | Chapter | Implementation | Language(s) | Status |
|---|---------|----------------|-------------|--------|
| Ch. 4 | Design a Rate Limiter | [rate-limiter-go](https://github.com/zeayush/rate-limiter-go) | Go | ✅ Done |
| Ch. 5 | Design Consistent Hashing | [consistent-hashing-go](https://github.com/zeayush/consistent-hashing-go) · [consistent-hash-rs](https://github.com/zeayush/consistent-hash-rs) | Go · Rust | ✅ Done |
| Ch. 7 | Design a Unique ID Generator | [uid-generator-go](https://github.com/zeayush/uid-generator-go) · [uid-generator-rs](https://github.com/zeayush/uid-generator-rs) | Go · Rust | ✅ Done |
| Ch. 8 | Design a URL Shortener | [url-shortener-go](https://github.com/zeayush/url-shortener-go) | Go | ✅ Done |
| Ch. 1 | Scale from Zero to Millions | — | — | 🔜 |
| Ch. 2 | Back-of-the-Envelope Estimation | — | — | 🔜 |
| Ch. 3 | A Framework for System Design | — | — | 🔜 |
| Ch. 6 | Design a Key-Value Store | — | — | 🔜 |
| Ch. 9 | Design a Web Crawler | — | — | 🔜 |
| Ch. 10 | Design a Notification System | — | — | 🔜 |
| Ch. 11 | Design a News Feed System | — | — | 🔜 |
| Ch. 12 | Design a Chat System | — | — | 🔜 |
| Ch. 13 | Design a Search Autocomplete System | — | — | 🔜 |
| Ch. 14 | Design YouTube | — | — | 🔜 |
| Ch. 15 | Design Google Drive | — | — | 🔜 |

---

## What's Built

### Ch. 4 — Rate Limiter · [`rate-limiter-go`](https://github.com/zeayush/rate-limiter-go)

Production-ready rate limiting library in Go. Three algorithms (Fixed Window, Sliding Window Log, Token Bucket), two storage backends (in-memory + Redis), two middleware adapters (stdlib `net/http` + Gin), and Prometheus metrics — all behind clean interfaces so each piece swaps independently.

**Key ideas implemented:** atomic Lua scripts to kill the INCR/EXPIRE race, fail-open on Redis outages, per-key limiting (IP / API key / user ID).

---

### Ch. 5 — Consistent Hashing · [`consistent-hashing-go`](https://github.com/zeayush/consistent-hashing-go) · [`consistent-hash-rs`](https://github.com/zeayush/consistent-hash-rs)

Virtual-node ring with weighted nodes, O(log n) lookup via binary search, automatic rebalancing on node add/remove, and thread-safe reads — implemented in both Go and Rust.

**Key ideas implemented:** virtual node replication factor, CRC32 hashing, `sync.RWMutex` / `RwLock` for read-heavy workloads, benchmark comparisons between language runtimes.

---

### Ch. 7 — Unique ID Generator · [`uid-generator-go`](https://github.com/zeayush/uid-generator-go) · [`uid-generator-rs`](https://github.com/zeayush/uid-generator-rs)

Snowflake-style 64-bit IDs (41-bit timestamp + 10-bit machine ID + 12-bit sequence) and ULID (48-bit timestamp + 80-bit randomness, lexicographically sortable) — implemented in both Go and Rust with configurable custom epochs.

**Key ideas implemented:** machine ID derivation from MAC address, clock-skew guards, monotonic sequence overflow handling, zero-allocation hot path in Rust.

---

### Ch. 8 — URL Shortener · [`url-shortener-go`](https://github.com/zeayush/url-shortener-go)

Full production service in Go — Base-62 short codes, consistent-hash database sharding across Postgres shards, Redis read-through cache, click analytics with GeoIP, link expiry, and a Redis-backed token-bucket rate limiter baked in.

**Key ideas implemented:** Base-62 encoding, consistent-hash sharding (integrates Ch. 5), cache-aside pattern, GeoIP lookup, Dockerized multi-service stack.

---

## Philosophy

- **Real code, not diagrams.** Every chapter is a working, tested codebase.
- **Benchmarks included.** Claim nothing without numbers.
- **Both Go and Rust.** Go for services and APIs. Rust for hot-path libraries where allocation cost matters.
- **Chapters build on each other.** The URL shortener literally imports the consistent-hashing patterns from Ch. 5.

---

## Running Anything

Each repo is self-contained. Clone the one you want:

```bash
# Example: consistent hashing in Go
git clone https://github.com/zeayush/consistent-hashing-go
cd consistent-hashing-go
go test ./...
go test -bench=. ./...
```

```bash
# Example: UID generator in Rust
git clone https://github.com/zeayush/uid-generator-rs
cd uid-generator-rs
cargo test
cargo bench
```

Services with Docker (e.g. URL shortener, rate limiter):

```bash
git clone https://github.com/zeayush/url-shortener-go
cd url-shortener-go
docker compose up --build
```

---

## Author

[@zeayush](https://github.com/zeayush) — working through Alex Xu's books one chapter at a time until it's all done.
