# system-design-from-scratch

> Building every system from Alex Xu's *System Design Interview* (Vol. 1 & 2) — from scratch, in production-grade code.

This is a living portfolio. Each chapter lives in its own directory here as a **git submodule** pointing to a standalone implementation repo. No toy examples. No pseudocode. Every chapter ships with benchmarks, tests, and the reasoning behind every design decision.

---

## Repo Structure

```
system-design-from-scratch/
├── book1-chapter04/   → rate-limiter-go
├── book1-chapter05/   → consistent-hashing-go · consistent-hash-rs
├── book1-chapter06/   → (coming: key-value store)
├── book1-chapter07/   → uid-generator-go · uid-generator-rs
├── book1-chapter08/   → url-shortener-go
├── book1-chapter09/   → (coming: web crawler)
│   ...
├── book2-chapter01/   → (coming: proximity service)
├── book2-chapter02/   → (coming: nearby friends)
│   ...
└── book2-chapter13/   → (coming: stock exchange)
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
| `book1-chapter04` | Ch. 4 — Rate Limiter | [rate-limiter-go](https://github.com/zeayush/rate-limiter-go) | Go | ✅ |
| `book1-chapter05` | Ch. 5 — Consistent Hashing | [consistent-hashing-go](https://github.com/zeayush/consistent-hashing-go) · [consistent-hash-rs](https://github.com/zeayush/consistent-hash-rs) | Go · Rust | ✅ |
| `book1-chapter06` | Ch. 6 — Key-Value Store | — | — | 🔜 |
| `book1-chapter07` | Ch. 7 — Unique ID Generator | [uid-generator-go](https://github.com/zeayush/uid-generator-go) · [uid-generator-rs](https://github.com/zeayush/uid-generator-rs) | Go · Rust | ✅ |
| `book1-chapter08` | Ch. 8 — URL Shortener | [url-shortener-go](https://github.com/zeayush/url-shortener-go) | Go | ✅ |
| `book1-chapter09` | Ch. 9 — Web Crawler | — | — | 🔜 |
| `book1-chapter10` | Ch. 10 — Notification System | — | — | 🔜 |
| `book1-chapter11` | Ch. 11 — News Feed System | — | — | 🔜 |
| `book1-chapter12` | Ch. 12 — Chat System | — | — | 🔜 |
| `book1-chapter13` | Ch. 13 — Search Autocomplete | — | — | 🔜 |
| `book1-chapter14` | Ch. 14 — YouTube | — | — | 🔜 |
| `book1-chapter15` | Ch. 15 — Google Drive | — | — | 🔜 |

> Ch. 1–3 skipped (conceptual framework / estimation chapters, no implementation target).

---

## Volume 2 — System Design Interview: An Insider's Guide

| Directory | Chapter | Implementation | Stack | Status |
|-----------|---------|----------------|-------|--------|
| `book2-chapter01` | Ch. 1 — Proximity Service | — | — | 🔜 |
| `book2-chapter02` | Ch. 2 — Nearby Friends | — | — | 🔜 |
| `book2-chapter03` | Ch. 3 — Google Maps | — | — | 🔜 |
| `book2-chapter04` | Ch. 4 — Distributed Message Queue | — | — | 🔜 |
| `book2-chapter05` | Ch. 5 — Metrics Monitoring & Alerting | — | — | 🔜 |
| `book2-chapter06` | Ch. 6 — Ad Click Event Aggregation | — | — | 🔜 |
| `book2-chapter07` | Ch. 7 — Hotel Reservation System | — | — | 🔜 |
| `book2-chapter08` | Ch. 8 — Distributed Email Service | — | — | 🔜 |
| `book2-chapter09` | Ch. 9 — S3-like Object Storage | — | — | 🔜 |
| `book2-chapter10` | Ch. 10 — Real-time Gaming Leaderboard | — | — | 🔜 |
| `book2-chapter11` | Ch. 11 — Payment System | — | — | 🔜 |
| `book2-chapter12` | Ch. 12 — Digital Wallet | — | — | 🔜 |
| `book2-chapter13` | Ch. 13 — Stock Exchange | — | — | 🔜 |

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
cd book1-chapter05/consistent-hashing-go
go test ./...
go test -bench=. ./...
```

```bash
# UID generator in Rust
cd book1-chapter07/uid-generator-rs
cargo test
cargo bench
```

```bash
# URL shortener (Docker)
cd book1-chapter08/url-shortener-go
docker compose up --build
```

---

## Author

[@zeayush](https://github.com/zeayush) — working through Alex Xu's books one chapter at a time until it's all done.
