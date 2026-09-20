/**
 * Redirect edge for url-shortener-go (chapter 1.8).
 *
 * Deployed as its own Cloudflare Pages project on s.<domain>, separate from
 * the Machine Room on the apex.
 *
 * WHY A SECOND HOSTNAME
 * ---------------------
 * The shortener's redirect route is `GET /:code` at the root. Serving that
 * from the same hostname as the static site would mean every unmatched path
 * on the portfolio — a typo, a missing asset — got interpreted as a short
 * code. The two cannot share an origin.
 *
 * WHY A PROXY RATHER THAN DNS
 * ---------------------------
 * Pointing s.<domain> straight at the backend would expose the Cloud Run
 * hostname and require a platform-level domain mapping. Proxying keeps the
 * backend address in an environment variable and leaves the hostname behind
 * Cloudflare, where the certificate is already handled.
 *
 * Configure: Pages → Settings → Environment variables → SHORTENER_ORIGIN
 */

// The backend answers /:code with a 302. We must NOT follow it — the browser
// is the one that should. Anything else here is passed through untouched.
const PASSTHROUGH_HEADERS = ["location", "content-type", "cache-control", "expires"];

// Paths that are never short codes. Browsers and crawlers ask for these
// unprompted; forwarding them would log phantom clicks against real links.
const IGNORED = new Set([
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "apple-touch-icon.png",
  "apple-touch-icon-precomposed.png",
  ".well-known",
]);

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);

  const segments = Array.isArray(params.code) ? params.code : [params.code].filter(Boolean);
  const code = segments[0] || "";

  // Bare hostname → send visitors to the portfolio rather than 404.
  if (!code) {
    const home = env.PORTFOLIO_URL;
    return home
      ? Response.redirect(home, 302)
      : new Response("short link service", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
  }

  if (IGNORED.has(code.toLowerCase())) {
    return new Response("not found", { status: 404 });
  }

  // A short code is a single path segment. Anything deeper is not ours.
  if (segments.length > 1) {
    return new Response("not found", { status: 404 });
  }

  const origin = env.SHORTENER_ORIGIN;
  if (!origin) {
    return new Response(
      "SHORTENER_ORIGIN is not set. Deploy the backend and add it in " +
        "Pages → Settings → Environment variables.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const target = `${origin.replace(/\/+$/, "")}/${encodeURIComponent(code)}${url.search}`;

  const headers = new Headers();
  headers.set("accept", "*/*");

  // The backend hashes the client IP for analytics and derives device type
  // from the UA. Without these every click would look like one Cloudflare
  // machine running the same browser.
  const clientIP = request.headers.get("CF-Connecting-IP");
  if (clientIP) {
    headers.set("X-Forwarded-For", clientIP);
    headers.set("X-Real-IP", clientIP);
  }
  for (const h of ["user-agent", "referer", "accept-language"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers,
      redirect: "manual",
    });
  } catch (err) {
    return new Response(`upstream unreachable: ${err.message}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const out = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  // A short link's target can change; never let an edge or browser pin it.
  out.set("cache-control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
