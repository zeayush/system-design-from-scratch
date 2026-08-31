//go:build js && wasm

// Command wasm exposes the chapter libraries to the Machine Room page.
//
// Every function registered here is a thin marshalling shim: it converts JS
// values to Go, calls the real library, and converts the result back. There is
// no algorithm logic in this file, and none of the chapter repos are modified.
//
//	1.4  github.com/zeayush/rate-limiter-go/limiter
//	1.5  github.com/zeayush/consistent-hashing-go
//	1.7  uid-generator-go/uid
//
// Build:
//
//	GOOS=js GOARCH=wasm go build -o ../static/machine.wasm .
package main

import (
	"context"
	"hash/crc32"
	"sort"
	"strconv"
	"sync"
	"syscall/js"
	"time"

	consistenthash "github.com/zeayush/consistent-hashing-go"
	"github.com/zeayush/rate-limiter-go/limiter"
	"uid-generator-go/uid"
)

// ─── handle table ────────────────────────────────────────────────────────────
//
// JS cannot hold Go pointers, so every constructed object is parked here and
// referenced from JS by an integer handle.

var (
	mu       sync.Mutex
	nextH    = 1
	limiters = map[int]limiter.Limiter{}
	rings    = map[int]*consistenthash.ConsistentHashRing{}
	ringRepl = map[int]int{} // replicas each ring was built with (New takes it once)
	snows    = map[int]*snowHandle{}
)

type snowHandle struct {
	gen   *uid.Snowflake
	epoch time.Time
}

func put(fn func(h int)) int {
	mu.Lock()
	defer mu.Unlock()
	h := nextH
	nextH++
	fn(h)
	return h
}

func fail(err error) any { return map[string]any{"error": err.Error()} }

// ─── 1.4 rate limiter ────────────────────────────────────────────────────────

// rlNew(algo, rate, windowMs, burst) -> handle | {error}
//
// algo is "token" | "fixed" | "sliding", matching the three constructors in
// limiter/. The limiter runs per browser tab, so one visitor exhausting their
// bucket never affects anybody else.
func rlNew(_ js.Value, args []js.Value) any {
	algo := args[0].String()
	cfg := limiter.Config{
		Rate:   int64(args[1].Int()),
		Window: time.Duration(args[2].Int()) * time.Millisecond,
	}
	if len(args) > 3 {
		cfg.Burst = int64(args[3].Int())
	}

	var (
		l   limiter.Limiter
		err error
	)
	switch algo {
	case "token":
		l, err = limiter.NewTokenBucket(cfg)
	case "fixed":
		l, err = limiter.NewFixedWindow(cfg)
	case "sliding":
		l, err = limiter.NewSlidingWindowLog(cfg)
	default:
		return map[string]any{"error": "unknown algorithm: " + algo}
	}
	if err != nil {
		return fail(err)
	}
	return put(func(h int) { limiters[h] = l })
}

// rlAllow(handle) -> {allowed, limit, remaining, resetMs, retryAfterMs}
//
// Mirrors limiter.Result one-for-one; the page renders the same numbers the
// middleware would put in X-RateLimit-* headers.
func rlAllow(_ js.Value, args []js.Value) any {
	mu.Lock()
	l, ok := limiters[args[0].Int()]
	mu.Unlock()
	if !ok {
		return map[string]any{"error": "no such limiter"}
	}

	res, err := l.Allow(context.Background())
	if err != nil {
		return fail(err)
	}
	return map[string]any{
		"allowed":      res.Allowed,
		"limit":        float64(res.Limit),
		"remaining":    float64(res.Remaining),
		"resetMs":      float64(res.Reset.UnixMilli()),
		"retryAfterMs": float64(res.RetryAfter.Milliseconds()),
	}
}

// ─── 1.5 consistent hashing ──────────────────────────────────────────────────

// ringNew(replicas) -> handle
//
// New() fixes the replica count for the life of the ring, so changing the
// virtual-node slider means building a fresh ring and re-adding the nodes.
// That is what ringRebuild does.
func ringNew(_ js.Value, args []js.Value) any {
	replicas := args[0].Int()
	if replicas <= 0 {
		return map[string]any{"error": "replicas must be > 0"}
	}
	return put(func(h int) {
		rings[h] = consistenthash.New(replicas)
		ringRepl[h] = replicas
	})
}

func ringOf(h int) *consistenthash.ConsistentHashRing {
	mu.Lock()
	defer mu.Unlock()
	return rings[h]
}

// ringRebuild(handle, replicas, nodes[]) -> bool
func ringRebuild(_ js.Value, args []js.Value) any {
	h := args[0].Int()
	replicas := args[1].Int()
	if replicas <= 0 {
		return false
	}
	fresh := consistenthash.New(replicas)
	nodes := args[2]
	for i := 0; i < nodes.Length(); i++ {
		fresh.Add(nodes.Index(i).String(), 1)
	}
	mu.Lock()
	rings[h] = fresh
	ringRepl[h] = replicas
	mu.Unlock()
	return true
}

// ringAdd(handle, node, weight) -> bool
func ringAdd(_ js.Value, args []js.Value) any {
	r := ringOf(args[0].Int())
	if r == nil {
		return false
	}
	weight := 1
	if len(args) > 2 {
		weight = args[2].Int()
	}
	return r.Add(args[1].String(), weight)
}

// ringRemove(handle, node) -> bool
func ringRemove(_ js.Value, args []js.Value) any {
	r := ringOf(args[0].Int())
	if r == nil {
		return false
	}
	return r.Remove(args[1].String())
}

// ringNodes(handle) -> [name...]  (sorted; Nodes() iterates a map, so the
// library's order is deliberately unspecified and would flicker the legend)
func ringNodes(_ js.Value, args []js.Value) any {
	r := ringOf(args[0].Int())
	if r == nil {
		return []any{}
	}
	names := r.Nodes()
	sort.Strings(names)
	out := make([]any, len(names))
	for i, n := range names {
		out[i] = n
	}
	return out
}

// ringGet(handle, key) -> node name, or "" when the ring is empty
func ringGet(_ js.Value, args []js.Value) any {
	r := ringOf(args[0].Int())
	if r == nil {
		return ""
	}
	node, ok := r.Get(args[1].String())
	if !ok {
		return ""
	}
	return node
}

// ringOwners(handle, keys[]) -> [node...]
// Batched so plotting 240 keys costs one JS↔wasm crossing instead of 240.
func ringOwners(_ js.Value, args []js.Value) any {
	r := ringOf(args[0].Int())
	keys := args[1]
	out := make([]any, keys.Length())
	for i := 0; i < keys.Length(); i++ {
		if r == nil {
			out[i] = ""
			continue
		}
		node, _ := r.Get(keys.Index(i).String())
		out[i] = node
	}
	return out
}

// ringKeyPos(keys[]) -> [position...] normalised to [0,1)
//
// This is the one place the bridge knows anything about the ring's internals:
// ring.go's keyHash is unexported, so its documented CRC-32 IEEE hash is
// recomputed here purely to decide where to DRAW a key. Ownership always comes
// from Get(). If the library ever changes its hash, the dots move but the
// colours stay correct.
func ringKeyPos(_ js.Value, args []js.Value) any {
	keys := args[0]
	out := make([]any, keys.Length())
	for i := 0; i < keys.Length(); i++ {
		h := crc32.ChecksumIEEE([]byte(keys.Index(i).String()))
		out[i] = float64(h) / 4294967296.0
	}
	return out
}

// ringSample(handle, n) -> {pos: [...], owner: [...]}
//
// Draws the ownership arcs without the library exporting its virtual-node
// positions. n probe keys are hashed, sorted by position, and each is asked
// who owns it. Consecutive probes bound an arc. With n well above the vnode
// count the boundary error is far below one pixel at the rendered size — this
// is a rendering approximation, never used for the "keys moved" numbers.
func ringSample(_ js.Value, args []js.Value) any {
	r := ringOf(args[0].Int())
	n := args[1].Int()
	if r == nil || n <= 0 {
		return map[string]any{"pos": []any{}, "owner": []any{}}
	}

	type probe struct {
		pos  uint32
		name string
	}
	probes := make([]probe, 0, n)
	for i := 0; i < n; i++ {
		k := "ring-probe:" + strconv.Itoa(i)
		probes = append(probes, probe{pos: crc32.ChecksumIEEE([]byte(k)), name: k})
	}
	sort.Slice(probes, func(i, j int) bool { return probes[i].pos < probes[j].pos })

	pos := make([]any, len(probes))
	owner := make([]any, len(probes))
	for i, p := range probes {
		node, _ := r.Get(p.name)
		pos[i] = float64(p.pos) / 4294967296.0
		owner[i] = node
	}
	return map[string]any{"pos": pos, "owner": owner}
}

// ─── 1.7 unique id generator ─────────────────────────────────────────────────

// snowNew(machineID, epochMs) -> handle | {error}
// epochMs <= 0 selects uid.DefaultEpoch (2020-01-01 UTC).
func snowNew(_ js.Value, args []js.Value) any {
	machineID := int64(args[0].Int())
	epoch := uid.DefaultEpoch
	if len(args) > 1 && args[1].Float() > 0 {
		epoch = time.UnixMilli(int64(args[1].Float())).UTC()
	}
	gen, err := uid.NewSnowflake(machineID, epoch)
	if err != nil {
		return fail(err)
	}
	return put(func(h int) { snows[h] = &snowHandle{gen: gen, epoch: epoch} })
}

// snowNext(handle) -> {id, bits, tsMs, machine, seq}
//
// id crosses as a decimal STRING: a Snowflake is int64 and would lose its low
// bits as a JS number. The page parses it with BigInt.
func snowNext(_ js.Value, args []js.Value) any {
	mu.Lock()
	s, ok := snows[args[0].Int()]
	mu.Unlock()
	if !ok {
		return map[string]any{"error": "no such generator"}
	}

	id, err := s.gen.NextID()
	if err != nil {
		return fail(err)
	}
	ts, machineID, seq := uid.DecomposeID(id, s.epoch)
	return map[string]any{
		"id":      strconv.FormatInt(id, 10),
		"bits":    strconv.FormatUint(uint64(id), 2),
		"tsMs":    float64(ts.UnixMilli()),
		"machine": float64(machineID),
		"seq":     float64(seq),
	}
}

// snowBurst(handle, n) -> {n, unique, ms, maxSeq, rollovers, lastId}
//
// Runs the real NextID loop. rollovers counts how often the 12-bit sequence
// filled up inside one millisecond and NextID had to park for the clock to
// tick — the guarantee that stops IDs repeating.
func snowBurst(_ js.Value, args []js.Value) any {
	mu.Lock()
	s, ok := snows[args[0].Int()]
	mu.Unlock()
	if !ok {
		return map[string]any{"error": "no such generator"}
	}
	n := args[1].Int()

	seen := make(map[int64]struct{}, n)
	var maxSeq, rollovers, lastSeq int64
	var lastID int64

	start := time.Now()
	for i := 0; i < n; i++ {
		id, err := s.gen.NextID()
		if err != nil {
			return fail(err)
		}
		_, _, seq := uid.DecomposeID(id, s.epoch)
		if seq > maxSeq {
			maxSeq = seq
		}
		if lastSeq == uid.MaxSequence && seq == 0 {
			rollovers++
		}
		lastSeq = seq
		lastID = id
		seen[id] = struct{}{}
	}
	elapsed := time.Since(start)

	return map[string]any{
		"n":         float64(n),
		"unique":    float64(len(seen)),
		"ms":        float64(elapsed.Nanoseconds()) / 1e6,
		"maxSeq":    float64(maxSeq),
		"rollovers": float64(rollovers),
		"lastId":    strconv.FormatInt(lastID, 10),
	}
}

// ulidNew() -> {id, bytes: [16]}
// bytes feeds the 128-bit strip; ULID has no int64 problem but the raw bytes
// are the only way to show the bit layout truthfully.
func ulidNew(_ js.Value, _ []js.Value) any {
	u, err := uid.NewULID()
	if err != nil {
		return fail(err)
	}
	raw := make([]any, 16)
	for i, b := range u {
		raw[i] = float64(b)
	}
	return map[string]any{"id": u.String(), "bytes": raw}
}

// ulidBurst(n) -> {n, unique, ms, lastId}
func ulidBurst(_ js.Value, args []js.Value) any {
	n := args[0].Int()
	seen := make(map[string]struct{}, n)
	last := ""

	start := time.Now()
	for i := 0; i < n; i++ {
		u, err := uid.NewULID()
		if err != nil {
			return fail(err)
		}
		last = u.String()
		seen[last] = struct{}{}
	}
	elapsed := time.Since(start)

	return map[string]any{
		"n":      float64(n),
		"unique": float64(len(seen)),
		"ms":     float64(elapsed.Nanoseconds()) / 1e6,
		"lastId": last,
	}
}

// ─── entrypoint ──────────────────────────────────────────────────────────────

func main() {
	exports := map[string]func(js.Value, []js.Value) any{
		"rlNew": rlNew, "rlAllow": rlAllow,
		"ringNew": ringNew, "ringRebuild": ringRebuild, "ringAdd": ringAdd,
		"ringRemove": ringRemove, "ringNodes": ringNodes, "ringGet": ringGet,
		"ringOwners": ringOwners, "ringKeyPos": ringKeyPos, "ringSample": ringSample,
		"snowNew": snowNew, "snowNext": snowNext, "snowBurst": snowBurst,
		"ulidNew": ulidNew, "ulidBurst": ulidBurst,
	}

	api := make(map[string]any, len(exports)+1)
	for name, fn := range exports {
		api[name] = js.FuncOf(fn)
	}
	api["ready"] = true

	js.Global().Set("MachineRoom", js.ValueOf(api))

	// Signal readiness, then park forever so the exported funcs stay alive.
	if cb := js.Global().Get("__machineRoomReady"); cb.Type() == js.TypeFunction {
		cb.Invoke()
	}
	select {}
}
