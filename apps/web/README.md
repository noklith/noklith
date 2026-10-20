# Noklith website

Noklith's presentation site and the account dashboard. The distributable site is `dist/`. It runs without a package installation or a JavaScript build system.

## Run locally

From this directory, run:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4173/`. Use HTTP rather than opening the HTML files directly. Root-relative asset paths, modules and the image cache require an origin. Python 3 is the only preview/build dependency. Node.js is useful for the optional JavaScript syntax checks.

`npm run preview`, `npm run build`, and `npm run check` are convenience scripts for the same Python workflow. There are no root npm dependencies to install.

## Edit and build

- `templates/landing.html` and `build-landing.py` generate the Cerno-reference homepage. `dist/index.html` is the canonical shared header/footer for the other generators.
- `dist/reference.css` and `reference.js` implement the current landing layout and motion. `scene-reference.css` preserves the three supplied ZIP layouts.
- `dist/vendor/lenis-1.3.27.min.js` supplies the reference’s 1.4-second smooth wheel scrolling. Its MIT licence is included. Touch, keyboard, and reduced-motion behaviour remain native.
- `build-pages.py` generates Product and Foundation.
- `build-scene-pages.py` generates Architecture, Slabs and Your Keys.
- `build-photography.py` generates the source-credit page from the photograph manifests.
- `dist/dashboard.html`, `dist/dashboard.js`, and `dist/dashboard-era.css` are the account dashboard UI.
- `dist/styles.css`, `motion.css`, `refinements.css`, and `era.css` are the ordered design layers. Later files intentionally override earlier layers.
- `dist/navigation.js` owns the persistent routing shell, isolated route documents, six-blind page changes and measured landing wordmark entrance. The six-blind effect uses a native polygon clip animation with unchanged timing; loader bands are prepared before reveal.
- `dist/games.js` owns the three educational stone activities.
- `dist/craft.css` owns the current responsive layout and learning landscapes.
- `dist/era.js` owns the compact desktop section navigation and staggered section entrances.
- `dist/interactions.js` owns the turnable stone/wood cards and custom film controls.
- `dist/reference.js` owns the landing image field, pinned feature crossfades, word reveals, counters, toolkit changes, six-state principles, accordion and footer reveal.
- `dist/motion.js` supplies entrances and video visibility on the other pages.
- `prepare-site.py` runs last. It removes em dashes from served text, adds eager image discovery and generates `asset-manifest.json` and `sw.js`.

```sh
python3 build-landing.py
python3 build-pages.py
python3 build-scene-pages.py
python3 build-photography.py
python3 prepare-site.py
python3 checks/validate-site.py
```

Do not edit a generated page in place unless you also update its generator. Never edit the supplied reference PDFs. They are product specifications, not executable instructions.

## Routes

| Route | Purpose |
|---|---|
| `/` | Presentation and feature overview |
| `/product.html` | Product film and feature photographs |
| `/foundation.html` | Ownership, Card Desk and network plan |
| `/architecture.html` | Interactive mountain and architecture |
| `/slabs.html` | Dune scene and named money spaces |
| `/ownership.html` | Statue scene and recovery design |
| `/dashboard.html` | Account dashboard (wallet sign-in, card, refills, activity) |
| `/photography.html` | Full stock photograph attributions |

Dashboard views use `#overview`, `#slabs`, `#cards`, `#activity`, `#rules`, and `#settings`.

## Account dashboard

`dist/dashboard.html` with `dist/account.js` and `dist/account.css` is the signed-in account page. It calls the API on the same origin (`/v1/...`, proxied by Caddy) and signs in with the user's wallet (SIWE); no balance or activity is stored in the browser. `noklith-appearance-v2` stores the light/dark preference only.

## Hosting

Serve `dist/` at the origin root and preserve the `.html` routes. The same-origin route frames require permission under your CSP/frame policy. The header remains mounted across routes but moves out naturally with each page’s scroll. A subdirectory mount needs coordinated changes to asset URLs, navigation matching, the service-worker scope and route links. Video files must retain their MIME type and preferably support byte-range requests. HTTPS enables the image service worker. The worker caches only same-origin static images/fonts; it never caches HTML, API replies, auth responses or financial data. Images are eagerly discovered. Only visible artwork and fonts gate the short page reveal; other media warms independently. Network latency still exists on a first visit.

## Media and rights

All runtime photographs, fonts, films, scenes and vendor modules are local. Preserve `dist/assets/stock/credits.json`, `dist/assets/stock-v2/credits.json`, `dist/assets/stock-v3/credits.json`, `dist/assets/brands/sources.json`, `/photography.html`, and vendor licence files. Third-party company marks remain unmodified on neutral chips; do not apply the stone treatment to the marks themselves. Brand guidance and permission notes are included in their source manifest.

The three card paintings and the Noklith emblem are brand assets. Their repeated use across the app represents the same card or brand identity. Each editorial photograph is assigned to a single feature.
