# Phase 4 — Deploy the Machine Room frontend

Ready-to-file issue body. `gh` is not installed in the dev environment, so this
could not be pushed automatically. File it with either:

```bash
gh issue create --repo zeayush/system-design-from-scratch \
  --title "Deploy the Machine Room frontend (Phase 4)" \
  --body-file frontend/PHASE4-DEPLOY.md
```

or paste everything below the line into a new issue at
https://github.com/zeayush/system-design-from-scratch/issues/new

---

Phases 1–3 are done: `frontend/` renders four machines driven by the real
chapter libraries compiled to WebAssembly. Phase 5 (the `/api/*` proxy for 1.8)
is in place but dormant until that service is deployed. This issue covers
getting the page publicly reachable.

**Nothing in this issue requires changes to 1.4, 1.5, 1.7 or 1.8.**

## Target

Cloudflare Pages, custom domain. ~$10.44/yr for a `.com` at Cloudflare Registrar
(at-cost); hosting itself is $0 — unlimited bandwidth, unlimited static
requests, free SSL, commercial use permitted.

Not GitHub Pages: it only serves from repo root or `/docs`, and the wasm build
step wants a real build environment.

## Tasks

- [ ] **Build step.** Cloudflare Pages build config:
      - Build command: `bash frontend/build.sh`
      - Output directory: `frontend`
      - Environment variable: `GO_VERSION=1.22` (or later)
      - Submodules must be fetched — the `replace` directives in
        `frontend/wasm/go.mod` point straight at them. If the Pages build image
        does not init submodules, fall back to committing the built
        `frontend/static/machine.wasm` and setting the build command to empty.
- [ ] **Verify wasm serves correctly.** `machine.wasm` must come back as
      `application/wasm` or `instantiateStreaming` silently falls back to the
      slower ArrayBuffer path. Cloudflare sets this correctly by default;
      confirm in the network tab.
- [ ] **Check binary size.** Stdlib Go wasm lands around 2–4 MB (~1–1.5 MB
      gzipped). It is lazy-loaded per panel, so the hero costs nothing, but if
      this feels heavy, evaluate TinyGo — note `uid` imports `net`, which
      TinyGo may not accept.
- [ ] **Register the domain** and attach it to the Pages project.
- [ ] **Link it from the root README.** A live-demo line near the top is what
      converts a repo visitor into someone who actually clicks.
- [ ] **Confirm reduced-motion and mobile.** The layout collapses at 760px and
      all animation is gated behind `prefers-reduced-motion`.

## Follow-ups (separate issues)

- Phase 5 activation: deploy `url-shortener-go`, set `SHORTENER_ORIGIN` in the
  Pages dashboard, flip `SHORTENER_API` to `"/api"` in `frontend/index.html`.
- Phase 6: Rust wasm wrapper crate for a live Go-vs-Rust benchmark in 1.5/1.7.
