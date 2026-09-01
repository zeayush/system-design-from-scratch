/**
 * Smoke test for the wasm bridge. Runs the real chapter libraries under Node
 * and asserts the behaviour the page depends on.
 *
 *   node frontend/wasm/smoke.mjs
 *
 * This is not a substitute for the Go test suites in each chapter repo — it
 * only checks that the JS↔wasm boundary marshals correctly and that the
 * libraries behave as the UI assumes.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "..", "static");

globalThis.require = undefined;
globalThis.fs = undefined;

// wasm_exec.js expects a browser-ish global; Node 24 has everything it needs.
const glue = await readFile(join(staticDir, "wasm_exec.js"), "utf8");
new Function(glue)();

const go = new globalThis.Go();
const bytes = await readFile(join(staticDir, "machine.wasm"));

const ready = new Promise((res) => { globalThis.__machineRoomReady = res; });
const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
go.run(instance);
await ready;

const M = globalThis.MachineRoom;

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}

// ── 1.4 rate limiter ────────────────────────────────────────────────────────
console.log("\n1.4 rate-limiter-go");
for (const algo of ["token", "fixed", "sliding"]) {
  const h = M.rlNew(algo, 3, 60000, 0);
  check(`${algo}: constructed`, typeof h === "number", JSON.stringify(h));
  if (typeof h !== "number") continue;

  const results = [];
  for (let i = 0; i < 5; i++) results.push(M.rlAllow(h));

  const allowed = results.filter((r) => r.allowed).length;
  check(`${algo}: 3 of 5 allowed`, allowed === 3, `got ${allowed}`);
  check(`${algo}: limit reported`, results[0].limit === 3, `got ${results[0].limit}`);
  check(`${algo}: remaining decreases`, results[0].remaining > results[2].remaining);
  check(`${algo}: retryAfter set on denial`, results[4].retryAfterMs > 0, `got ${results[4].retryAfterMs}`);
  check(`${algo}: reset in the future`, results[0].resetMs > Date.now() - 1000);
}

// ── 1.5 consistent hashing ──────────────────────────────────────────────────
console.log("\n1.5 consistent-hashing-go");
const ring = M.ringNew(120);
check("ring constructed", typeof ring === "number", JSON.stringify(ring));

const nodes = ["alpha", "bravo", "charlie", "delta"];
nodes.forEach((n) => M.ringAdd(ring, n, 1));
check("Nodes() returns 4 sorted", JSON.stringify(M.ringNodes(ring)) === JSON.stringify(nodes));

const KEYS = Array.from({ length: 240 }, (_, i) => `key:${i}`);
const before = M.ringOwners(ring, KEYS);
check("every key owned", before.every((o) => nodes.includes(o)));

const counts = {};
before.forEach((o) => (counts[o] = (counts[o] || 0) + 1));
const worst = Math.max(...Object.values(counts));
check("load skew under 1.7x", worst / (240 / 4) < 1.7, `${(worst / 60).toFixed(2)}x`);

M.ringRemove(ring, "bravo");
const after = M.ringOwners(ring, KEYS);
const moved = before.filter((o, i) => o !== after[i]).length;
check("removing a node moves some keys", moved > 0);
check("removing a node moves well under half", moved / 240 < 0.45, `${((moved / 240) * 100).toFixed(1)}%`);
check("only bravo's keys moved", before.every((o, i) => o === after[i] || o === "bravo"));

const pos = M.ringKeyPos(KEYS);
check("positions normalised to [0,1)", pos.every((p) => p >= 0 && p < 1));
check("positions are stable", M.ringKeyPos(["key:0"])[0] === pos[0]);

const sample = M.ringSample(ring, 800);
check("sample returns pos+owner", sample.pos.length === 800 && sample.owner.length === 800);
check("sample is sorted by position", sample.pos.every((p, i) => i === 0 || p >= sample.pos[i - 1]));
check("sample owners are live nodes", sample.owner.every((o) => o !== "bravo" && nodes.includes(o)));

// A sampled probe and a direct Get must agree — this is the property the arc
// rendering leans on.
const probe = "ring-probe:0";
check("sample agrees with Get()", M.ringGet(ring, probe) === sample.owner[sample.pos.indexOf(M.ringKeyPos([probe])[0])]);

M.ringRebuild(ring, 5, nodes.filter((n) => n !== "bravo"));
check("rebuild with fewer replicas works", M.ringNodes(ring).length === 3);

// ── 1.7 unique id generator ─────────────────────────────────────────────────
console.log("\n1.7 uid-generator-go");
const snow = M.snowNew(341, 0);
check("snowflake constructed", typeof snow === "number", JSON.stringify(snow));
check("machine id out of range rejected", !!M.snowNew(9999, 0).error);

const a = M.snowNext(snow), b = M.snowNext(snow);
check("id is a decimal string", typeof a.id === "string" && /^\d+$/.test(a.id));
check("ids are monotonic", BigInt(b.id) > BigInt(a.id));
check("machine id round-trips", a.machine === 341, `got ${a.machine}`);
check("bits fit in 64", a.bits.padStart(64, "0").length === 64);
check("bits match the id", BigInt("0b" + a.bits) === BigInt(a.id));
check("timestamp is recent", Math.abs(a.tsMs - Date.now()) < 5000, `${a.tsMs} vs ${Date.now()}`);

const burst = M.snowBurst(snow, 50000);
check("50k ids generated", burst.n === 50000);
check("50k ids all unique", burst.unique === 50000, `${50000 - burst.unique} collisions`);
check("sequence never exceeds MaxSequence", burst.maxSeq <= 4095, `peak ${burst.maxSeq}`);
console.log(`       → ${burst.ms.toFixed(1)} ms, ${Math.round(50000 / (burst.ms / 1000)).toLocaleString()}/s, peak seq ${burst.maxSeq}, ${burst.rollovers} rollovers`);
// NOTE: rollovers is commonly 0. Filling the 4095-slot sequence needs >4.095M
// NextID/sec sustained for a full millisecond; this wasm build's single-
// threaded, interpreted throughput lands well under that (see wasm/BENCH.md).
// The UI must not claim a rollover happened — it reports whatever the real
// number is, including zero.

const u = M.ulidNew();
check("ulid is 26 chars", u.id.length === 26, u.id);
check("ulid is crockford base32", /^[0-9A-HJKMNP-TV-Z]{26}$/.test(u.id), u.id);
check("ulid exposes 16 bytes", u.bytes.length === 16);
const ub = M.ulidBurst(20000);
check("20k ulids all unique", ub.unique === 20000, `${20000 - ub.unique} collisions`);
// Same-millisecond ULIDs are NOT guaranteed to sort — only the timestamp
// portion is ordered; ties are broken by random bits, per spec. Assert
// ordering only across a millisecond boundary, which is the guarantee that
// actually holds.
const early = M.ulidNew();
await new Promise((r) => setTimeout(r, 5));
const late = M.ulidNew();
check("ulids sort lexicographically across ms boundary", early.id <= late.id, `${early.id} vs ${late.id}`);

// ── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
