//! Marshalling shim over chapter 1.13's radix trie. No logic lives here.
//!
//! WHY THE MODULES ARE MOUNTED BY PATH
//!
//! The Go chapters are consumed through `replace` directives in wasm/go.mod.
//! Rust has no equivalent that works here: autocomplete-rs is a single crate
//! whose lib.rs unconditionally declares `pub mod api` / `pub mod storage` /
//! `pub mod error`, which drag in rocksdb, axum and tokio. None of those build
//! for wasm32, and the crate exposes no feature flag to switch them off — so a
//! plain path dependency on it cannot compile for the browser.
//!
//! Rather than modify the chapter repo, this crate mounts the three modules it
//! needs as its own, straight out of the submodule working tree. `trie`,
//! `scoring` and `typo` depend only on `std` plus one `serde::Serialize`
//! derive, and they reach for each other as `crate::scoring` / `crate::typo` —
//! which resolves correctly once they are mounted side by side at this crate's
//! root. The bytes compiled below are the chapter's own, unmodified, read in
//! place; nothing is vendored or copied.
//!
//! The coupling this buys is worth stating plainly: if autocomplete-rs ever
//! adds a `crate::error` or `crate::storage` import to one of these three
//! modules, this build breaks. build.sh fails loudly when it does, and the fix
//! is a feature flag upstream.

// The chapter's modules carry their full API; this shim uses a slice of it,
// so dead-code warnings here are about the library being bigger than the demo.
#[allow(dead_code, unused_imports)]
#[path = "../../../1.13-Search-Autocomplete/autocomplete-rs/src/scoring.rs"]
mod scoring;
#[allow(dead_code, unused_imports)]
#[path = "../../../1.13-Search-Autocomplete/autocomplete-rs/src/typo.rs"]
mod typo;
#[allow(dead_code, unused_imports)]
#[path = "../../../1.13-Search-Autocomplete/autocomplete-rs/src/trie/mod.rs"]
mod trie;

use std::cell::RefCell;
use trie::RadixTrie;
use wasm_bindgen::prelude::*;

thread_local! {
    /// One trie for the page. wasm is single-threaded, so a thread_local
    /// RefCell is the whole concurrency story — the Engine's DashMap and
    /// RwLock exist to serve many tenants across many threads, which is a
    /// problem the browser does not have.
    static TRIE: RefCell<RadixTrie> = RefCell::new(RadixTrie::new());
}

/// Load the corpus in one crossing.
///
/// The corpus is ~50K lines; calling `insert` from JS per line would mean 50K
/// boundary crossings and a UTF-16→UTF-8 conversion each time. Handing the
/// whole blob over once and splitting it here costs a single crossing.
///
/// Expects `term\tfrequency` per line. Malformed lines are skipped rather than
/// failing the load — a truncated fetch should still leave a usable page.
/// Returns the number of terms actually indexed.
#[wasm_bindgen]
pub fn load_corpus(tsv: &str) -> usize {
    TRIE.with(|cell| {
        let mut trie = cell.borrow_mut();
        let mut loaded = 0usize;
        for line in tsv.lines() {
            let mut parts = line.split('\t');
            let (Some(term), Some(freq)) = (parts.next(), parts.next()) else {
                continue;
            };
            let term = term.trim();
            if term.is_empty() {
                continue;
            }
            if let Ok(freq) = freq.trim().parse::<u64>() {
                // `set`, not `insert`: insert *adds* to any existing frequency,
                // which would double every term if the corpus were ever loaded
                // twice.
                trie.set(term, freq);
                loaded += 1;
            }
        }
        loaded
    })
}

/// Exact prefix search. `[{term, freq}]`, best first.
#[wasm_bindgen]
pub fn query(prefix: &str, k: usize) -> String {
    TRIE.with(|cell| {
        let hits = cell.borrow().prefix_search(prefix, k);
        let rows: Vec<_> = hits
            .into_iter()
            .map(|(term, freq)| serde_json::json!({ "term": term, "freq": freq }))
            .collect();
        serde_json::Value::Array(rows).to_string()
    })
}

/// Levenshtein-tolerant search. Same shape as `query`, plus the edit distance
/// that actually matched each hit, which is what the panel colours by.
#[wasm_bindgen]
pub fn fuzzy(term: &str, budget: u32, k: usize) -> String {
    TRIE.with(|cell| {
        let hits = cell.borrow().fuzzy_search(term, budget, k);
        let rows: Vec<_> = hits
            .into_iter()
            .map(|(term, freq, distance)| {
                serde_json::json!({ "term": term, "freq": freq, "distance": distance })
            })
            .collect();
        serde_json::Value::Array(rows).to_string()
    })
}

/// `{nodes, terms, bytes}` straight off the trie — the compression readout.
#[wasm_bindgen]
pub fn stats() -> String {
    TRIE.with(|cell| {
        serde_json::to_string(&cell.borrow().stats())
            .unwrap_or_else(|_| "{}".to_string())
    })
}

/// Smoke test for the Rust half of the wasm bridge.
///
///   cargo test --manifest-path frontend/wasm-rs/Cargo.toml
///
/// The counterpart to wasm/smoke.mjs: it does not re-test autocomplete-rs (the
/// chapter repo has its own suite, which incidentally runs here too — mounting
/// the modules brings their #[cfg(test)] blocks along). It checks that this
/// shim marshals the real corpus correctly and that the trie answers the way
/// the panel's copy claims it does. Runs natively, so it catches breakage
/// without a browser.
///
/// These live in-file rather than in tests/ on purpose: an integration test
/// would need the crate to expose an `rlib`, and adding one to the crate graph
/// costs LTO about 44% of the shipped wasm (76KB -> 110KB) for no runtime gain.
#[cfg(test)]
mod tests {
    use super::*;

    fn corpus() -> String {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../static/corpus.tsv");
        std::fs::read_to_string(path)
            .expect("static/corpus.tsv missing — run frontend/data/build-corpus.sh")
    }

    fn terms(json: &str) -> Vec<String> {
        serde_json::from_str::<serde_json::Value>(json)
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["term"].as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn corpus_loads_and_answers_the_way_the_panel_says() {
        let loaded = load_corpus(&corpus());
        assert_eq!(loaded, 50_000, "corpus should be exactly 50k terms");

        let st: serde_json::Value = serde_json::from_str(&stats()).unwrap();
        assert_eq!(st["terms"], 50_000);

        // The panel's compression claim, and the reason it is stated in bytes
        // rather than nodes: a radix trie holds MORE nodes than terms (edge splits
        // create internal branch nodes), so a node count says nothing flattering.
        // The win is that a shared prefix is stored once, which shows up in the
        // edge-label bytes — ~118KB of labels for ~375KB of raw terms.
        let edge_bytes = st["bytes"].as_u64().unwrap() as f64;
        let raw_bytes: usize = corpus().lines().filter_map(|l| l.split('\t').next()).map(str::len).sum();
        assert!(
            edge_bytes / (raw_bytes as f64) < 0.5,
            "edge labels should hold under half the raw term bytes, got {edge_bytes} of {raw_bytes}"
        );

        // Exact prefix, ranked by real frequency. "system" outweighs every other
        // word starting "sys" in the Google web corpus by two orders of magnitude.
        let hits = terms(&query("sys", 10));
        assert_eq!(hits[0], "system");
        assert!(hits.iter().all(|t| t.starts_with("sys")), "prefix search leaked a non-match");

        // Loading twice must not double frequencies — the shim uses set(), not
        // insert(), precisely because insert() accumulates.
        let before = query("sys", 3);
        load_corpus(&corpus());
        assert_eq!(before, query("sys", 3), "second load changed the ranking");
    }

    #[test]
    fn typo_budget_rescues_a_misspelling() {
        load_corpus(&corpus());

        // "seperate" is a single substitution from "separate" — the 1-edit demo.
        assert!(
            !terms(&query("seperate", 10)).contains(&"separate".to_string()),
            "exact prefix search should not find separate"
        );
        assert!(
            terms(&fuzzy("seperate", 1, 10)).contains(&"separate".to_string()),
            "budget 1 should rescue separate"
        );

        // "recieve" is a TRANSPOSITION, which plain Levenshtein charges two edits
        // for — Damerau-Levenshtein would charge one. So budget 1 does not find
        // "receive"; it finds "relieve" instead, which is the panel's whole point
        // about what the cheap budget actually buys you. Pin that behaviour: if the
        // chapter ever switches to Damerau, this test says so and the copy is wrong.
        assert!(
            !terms(&fuzzy("recieve", 1, 10)).contains(&"receive".to_string()),
            "a transposition should cost more than one edit under plain Levenshtein"
        );
        assert!(
            terms(&fuzzy("recieve", 2, 10)).contains(&"receive".to_string()),
            "budget 2 should rescue receive"
        );

        // Every hit carries the distance that matched it, and none may exceed the
        // budget the panel advertises.
        let rows: serde_json::Value = serde_json::from_str(&fuzzy("seperate", 2, 10)).unwrap();
        assert!(!rows.as_array().unwrap().is_empty());
        for row in rows.as_array().unwrap() {
            assert!(row["distance"].as_u64().unwrap() <= 2, "distance exceeded the budget");
        }
    }

    #[test]
    fn malformed_corpus_lines_are_skipped_not_fatal() {
        // A truncated fetch should still leave a usable page.
        let loaded = load_corpus("good\t100\nmissing-count\n\nbad\tnotanumber\nfine\t7\n");
        assert_eq!(loaded, 2);
    }
}
