/**
 * Same-origin proxy for leaderboard-go (chapter 2.10).
 *
 * Cloudflare Pages Function. The page talks to /lb/*; this forwards to
 * LEADERBOARD_ORIGIN/v1/*, WebSocket included.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * leaderboard-go already supports browsers directly: publishable keys are
 * read-only and Origin-checked, and reads get CORS headers. That covers
 * watching the board, but not playing on it. Score and player writes need a
 * secret key, and a secret key in a <script> tag is anybody's key.
 *
 * So the secret stays here, and this file decides what a visitor may write:
 *
 *  1. Only these routes exist: POST /lb/players (register), POST /lb/scores
 *     (clicks), and the reads (GET /lb/leaderboards/..., GET /lb/ws).
 *     Friendships, and anything the service adds later, are unreachable.
 *
 *  2. Write bodies are rebuilt, never forwarded. A visitor registers a
 *     "visitor-xxxxxxxx" player under a name they choose, and can only add
 *     clicks to such a player. The name is the one piece of visitor text that
 *     reaches a public board, so it is held to 1-20 letters, digits, spaces
 *     and _ . ' - (no markup, no URLs). A write carries 1 to 30 clicks: the
 *     page batches clicks every 1.5 s, and 30 in 1.5 s is already faster
 *     than a person clicks.
 *
 *  3. Client IP. Writes are rate-limited by rate-limiter-go keyed on
 *     X-Forwarded-For first. Forwarding CF-Connecting-IP keeps one bucket per
 *     visitor instead of one shared by everybody behind this proxy.
 *
 * Configure: Pages → Settings → Environment variables
 *   LEADERBOARD_ORIGIN  e.g. https://leaderboard-go-xxxxx.a.run.app
 *   LEADERBOARD_KEY     one of the service's SECRET_KEYS (mark it encrypted)
 */

const MAX_BODY_BYTES = 1024;
const VISITOR_ID = /^visitor-[0-9a-f]{8}$/;
const REGIONS = ["na", "eu", "apac"];
const MAX_DELTA = 30; // clicks per write; see 2. above
const NAME_MAX = 20;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u; // keep in step with index.html

function problem(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readJSON(request) {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) throw new Error("request body too large");
  return JSON.parse(new TextDecoder().decode(raw));
}

// Returns the upstream path and rebuilt body for an allowed request, or a
// Response refusing it.
async function route(request, segments) {
  const path = segments.join("/");

  if (request.method === "GET") {
    if (path === "ws" || segments[0] === "leaderboards") return { path };
    return problem(404, "not found");
  }
  if (request.method !== "POST") return problem(405, `method ${request.method} not allowed`);

  let body;
  try {
    body = await readJSON(request);
  } catch (err) {
    return problem(400, err.message);
  }

  if (path === "players") {
    const id = String(body.id || "");
    if (!VISITOR_ID.test(id)) return problem(400, "id must look like visitor-xxxxxxxx (8 hex digits)");
    const region = REGIONS.includes(body.region) ? body.region : "na";
    const name = String(body.name || "").replace(/\s+/g, " ").trim();
    if (!name || Array.from(name).length > NAME_MAX || !NAME_RE.test(name)) {
      return problem(400, `name must be 1-${NAME_MAX} letters, digits, spaces or _ . ' -`);
    }
    return { path, body: { id, name, region } };
  }
  if (path === "scores") {
    const id = String(body.player_id || "");
    const delta = body.delta;
    if (!VISITOR_ID.test(id)) return problem(403, "visitors can only add clicks to visitor players");
    if (!Number.isInteger(delta) || delta < 1 || delta > MAX_DELTA) {
      return problem(400, `a write carries 1 to ${MAX_DELTA} clicks`);
    }
    return { path, body: { player_id: id, delta } };
  }
  return problem(404, "not found");
}

export async function onRequest(context) {
  const { request, params, env } = context;

  if (!env.LEADERBOARD_ORIGIN || !env.LEADERBOARD_KEY) {
    return problem(
      503,
      "LEADERBOARD_ORIGIN / LEADERBOARD_KEY are not set. Deploy leaderboard-go and add " +
        "both in Pages → Settings → Environment variables."
    );
  }

  // [[path]] is a catch-all: /lb/leaderboards/daily -> ["leaderboards", "daily"]
  const segments = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const r = await route(request, segments);
  if (r instanceof Response) return r;

  const search = new URL(request.url).search;
  const target =
    `${env.LEADERBOARD_ORIGIN.replace(/\/+$/, "")}/v1/` +
    `${r.path.split("/").map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  headers.set("authorization", `Bearer ${env.LEADERBOARD_KEY}`);
  headers.set("accept", "application/json");
  const clientIP = request.headers.get("CF-Connecting-IP");
  if (clientIP) {
    headers.set("X-Forwarded-For", clientIP);
    headers.set("X-Real-IP", clientIP);
  }

  // WebSocket: hand the upgrade straight through. Workers proxy a socket by
  // returning the upstream's 101 response as-is.
  if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
    if (r.path !== "ws") return problem(400, "WebSocket upgrade only on /lb/ws");
    headers.set("Upgrade", "websocket");
    try {
      return await fetch(target, { headers });
    } catch (err) {
      return problem(502, `upstream unreachable: ${err.message}`);
    }
  }

  let body;
  if (r.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(r.body);
  }

  let upstream;
  try {
    upstream = await fetch(target, { method: request.method, headers, body, redirect: "manual" });
  } catch (err) {
    return problem(502, `upstream unreachable: ${err.message}`);
  }

  // Pass the response through, keeping the rate-limit headers the page reads.
  const out = new Headers();
  for (const name of [
    "content-type",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "retry-after",
  ]) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  out.set("cache-control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
