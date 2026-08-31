/**
 * Same-origin proxy for url-shortener-go (chapter 1.8).
 *
 * Cloudflare Pages Function. Every /api/* request the page makes is served from
 * the page's own origin and forwarded here, so the browser never issues a
 * cross-origin request.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Three blockers stand between the static page and the deployed service. All
 * three are solved here, in frontend/, without editing url-shortener-go:
 *
 *  1. CORS. The service registers no CORS middleware, so a browser calling it
 *     from another origin fails the preflight and the response is unreadable.
 *     Adding CORS would mean editing 1.8. Proxying instead makes the request
 *     same-origin, where CORS simply does not apply.
 *
 *  2. Client IP. The service applies rate-limiter-go to /api keyed by
 *     GinIPExtractor -> c.ClientIP(). Behind a naive proxy every visitor
 *     arrives as one Cloudflare IP and shares a single bucket — the first
 *     enthusiastic visitor would 429 everybody else. We forward the real
 *     client address as X-Forwarded-For, which c.ClientIP() honours, so each
 *     visitor keeps their own bucket.
 *
 *  3. Origin secrecy. The backend URL lives in the SHORTENER_ORIGIN environment
 *     variable, set in the Pages dashboard, not committed here.
 *
 * Configure: Pages → Settings → Environment variables → SHORTENER_ORIGIN
 *            e.g. https://url-shortener.fly.dev
 */

const ALLOWED_METHODS = ["GET", "POST", "DELETE", "OPTIONS"];
const MAX_BODY_BYTES = 16 * 1024;

function problem(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequest(context) {
  const { request, params, env } = context;

  if (!ALLOWED_METHODS.includes(request.method)) {
    return problem(405, `method ${request.method} not allowed`);
  }

  const origin = env.SHORTENER_ORIGIN;
  if (!origin) {
    return problem(
      503,
      "SHORTENER_ORIGIN is not set. Deploy url-shortener-go and add it in " +
        "Pages → Settings → Environment variables."
    );
  }

  // [[path]] is a catch-all: /api/links/abc123 -> ["links", "abc123"]
  const segments = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const search = new URL(request.url).search;
  const target = `${origin.replace(/\/+$/, "")}/api/${segments.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", "application/json");

  // Blocker 2: hand the service the real client address so its IP-keyed
  // limiter still sees one bucket per visitor rather than one per proxy.
  const clientIP = request.headers.get("CF-Connecting-IP");
  if (clientIP) {
    headers.set("X-Forwarded-For", clientIP);
    headers.set("X-Real-IP", clientIP);
  }

  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return problem(413, "request body too large");
    body = raw;
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
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
