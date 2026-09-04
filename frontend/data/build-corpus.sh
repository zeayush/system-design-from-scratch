#!/usr/bin/env bash
# Builds frontend/static/corpus.tsv — the real corpus behind the 1.13 panel.
#
# Output is committed, so the page deploys without network access and the
# artifact you review is the artifact that ships. Re-run this only to change
# the corpus; it is deterministic given the same three inputs.
#
# WHAT GOES IN
#
#   count_1w.txt    333,333 English words with occurrence counts from the
#                   Google Web Trillion-Word Corpus (Brants & Franz, distributed
#                   by the LDC), as published by Peter Norvig alongside "Natural
#                   Language Corpus Data" in Beautiful Data (O'Reilly).
#                   https://norvig.com/ngrams/
#   words_alpha     ~370K English dictionary words (dwyl/english-words).
#   LDNOOBW/en      Obscenity blocklist, single-word entries only.
#
# WHY FILTER AT ALL
#
# count_1w is a raw web crawl, and top-K by frequency surfaces exactly what a
# raw web crawl is full of: "sex" ranks 182, "porn" 659, "nude" 828. Those are
# the first suggestions a visitor sees on typing "s" or "p". Intersecting with a
# dictionary also drops crawl debris that ranks well above rank 50,000
# ("webalizer", "anleitung", "paa") and is what makes the panel read like a
# search box rather than a scrape.
#
# The frequencies are never touched — every count below is the real Google web
# count. Only the vocabulary is restricted. Say so wherever this is described,
# because "real data" is the whole claim.
#
# To ship the unfiltered crawl instead, set KEEP_RAW=1. Read the paragraph above
# first; this page is public.
set -euo pipefail

cd "$(dirname "$0")"
OUT=../static/corpus.tsv
TERMS=${TERMS:-50000}
KEEP_RAW=${KEEP_RAW:-0}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fetch() {
  echo "→ $2" >&2
  curl -sSL --fail --max-time 180 -o "$work/$1" "$2"
}

fetch count_1w.txt https://norvig.com/ngrams/count_1w.txt
fetch words_alpha.txt https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt
fetch block.txt https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en

# Lowercase ASCII words of 2+ characters. The corpus is already pure ASCII, and
# keeping it that way matters: the trie walks bytes, so with multi-byte UTF-8 a
# single character substitution can cost more than one edit and the typo budget
# stops meaning what the panel says it means.
awk -F'\t' 'NF==2 && $1 ~ /^[a-z]+$/ && length($1) >= 2' "$work/count_1w.txt" \
  | sort -t"$(printf '\t')" -k1,1 > "$work/pairs.tsv"

if [ "$KEEP_RAW" = "1" ]; then
  cp "$work/pairs.tsv" "$work/clean.tsv"
else
  tr -d '\r' < "$work/words_alpha.txt" | tr 'A-Z' 'a-z' | sort -u > "$work/dict"
  # Single-word blocklist entries only; the phrases cannot match a unigram.
  tr -d '\r' < "$work/block.txt" | tr 'A-Z' 'a-z' | grep -v ' ' | sort -u > "$work/block"
  join -t"$(printf '\t')" -1 1 -2 1 "$work/pairs.tsv" "$work/dict" \
    | sort -t"$(printf '\t')" -k1,1 \
    | join -t"$(printf '\t')" -v1 -1 1 -2 1 - "$work/block" > "$work/clean.tsv"
fi

# Descending frequency. The trie does its own top-K, so order here is only about
# which terms make the cut at $TERMS.
# Staged through a file rather than piped into head: head closes the pipe early,
# which lands SIGPIPE on sort and trips `set -o pipefail`.
sort -t"$(printf '\t')" -k2,2nr "$work/clean.tsv" > "$work/ranked.tsv"
head -"$TERMS" "$work/ranked.tsv" > "$OUT"

printf 'wrote %s — %s terms, %s raw, %s gzipped\n' \
  "$OUT" "$(wc -l < "$OUT")" \
  "$(du -h "$OUT" | cut -f1)" \
  "$(gzip -9 -c "$OUT" | wc -c | awk '{printf "%.0fK", $1/1024}')"
