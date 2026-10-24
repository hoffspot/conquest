# Delivering the game: only what changed, from whatever the browser kept

The owner reloaded the game in Safari on an iPhone, from their own world server, and watched it
download all 13.9 MB again. They expected the game and its downloads to be kept in the browser, each
file checked by a checksum and fetched again only when it's new. Data files already worked that
way. The code didn't. This plan makes everything work that way, on every browser, and lets an update
download only the files it changed, in the background, while the game's played.

The research behind it (the code read and measured, iPhone, Android and desktop browsers, and how
others deliver and update large web apps) is in the session's report, *Game asset caching across
browsers*. The links below are the primary sources it found.

## 0. In brief

- **Every file the game downloads is known by a hash of its bytes**, as the data files are now:
  the code (about 384 modules), the engine, the navigation's WebAssembly and the fonts too.
  `npm run build:manifest` writes the hashes; a file's address is `path?h=hash`.
- **The page names its own release's files.** The import map in `index.html` (written by
  `build:manifest`) points every module at its hashed address, so a page only ever asks for its
  own release's code, wherever it's served from and whether or not the service worker is running.
- **The service worker serves a file it keeps by hash without asking the server**, and keeps it
  for good while a release in use lists it. Workers, fonts and the WebAssembly ask by plain
  address; the worker maps those to the hashed copy too, from the release the page told it.
- **The game's own server tags each file by its hash and compresses text.** A file that's the
  same is "not modified" whatever date a release gave it; code and pages are sent at about a
  quarter of their size.
- **An update downloads only the files it changed**, in the background while the game's played,
  and the page reloads into it at a quiet moment, with everything already there.
- **The browser's asked to keep the game's storage** where it's installed, and the player's told
  where storage can be lost (Safari, after 7 days unused, unless it's on the Home Screen).

## 1. Where we start

| What | Today | Cost |
|---|---|---|
| Data files (body, skin, models) | Fetched as `path?h=hash`, kept by the service worker for good (`client/sw.js` `byHash`) | None: they're never asked for again |
| Code (≈9.2 MB in 368 files in the manifest, plus `main.js` and its imports), engine (≈1 MB), navigation (≈0.9 MB), fonts | Network-first: `fetch(request, { cache: "no-cache" })` from the service worker on **every** load, not just a reload | One round trip per file, ≈385, even when nothing's changed. On HTTP/1.1 (the world server), six at a time: dozens of round trips |
| The service worker's own copy of the code | Used only offline, or within a minute for the same page | A 304 depends on the **browser's HTTP cache** still holding the file. Safari's and Chrome's are shared by every site and evicted under pressure (Android may delete Chrome's when storage is low); then every file comes again in full |
| The world server (`server/static.js`) | `no-cache` + `Last-Modified` (the file's date), no ETag, no compression, HTTP/1.1 | A release copies the files anew (`scripts/build-mac-app.js`, `fs.cp`), so after any update **every** file's date is new and every file comes again in full, uncompressed: ≈11.7 MB of code |
| GitHub Pages | gzip, HTTP/2, `max-age=600`, ETag from the file's date and size (measured: `W/"6adcb970-9a606"` for game.js is 13:58:08 and 632,326 bytes) | Every deploy dates every file anew, so every file comes again: ≈3.3 MB of code, gzipped |
| A file rolled back (an update that failed) | `If-Modified-Since` at or after the file's date counts as "not modified" | The browser keeps the newer version's copy: a page of two releases |
| An update while a game's under way | The new worker takes over; a module imported later (`together.js`, `wheelsetup.js`, `character-file.js`) comes from the new release | A page of two releases |

Measured in Chromium (Chrome for Testing 153), with the repository's own `server/static.js`, over
https and HTTP/1.1 as the world server serves, on a link like a phone's to a home server (100 ms
round trip, 15 Mbps; no loss modelled, so the times are the best case):

| A load | Requests | Answered "not modified" | Downloaded | Downloading |
|---|---|---|---|---|
| The first | 1,167 | | 17.9 MB | 11.3 s |
| A reload, nothing changed | 424 | 423 | headers only | 6.7 s |
| A reload, the browser's HTTP cache emptied (the worker's copies all there) | 424 | 11 | 12.5 MB | 9.7 s |
| A reload after an update that changed nothing (every file dated anew) | 424 | 11 | 12.5 MB | 9.7 s |
| The same three over HTTP/2 | | | | 3.8 s, 7.1 s, 7.1 s |

On HTTP/1.1 it's the round trips that cost: checking every file takes 70% as long as downloading
it all. The only things answered from the worker's copies are the 14 data files, the music and
the sounds. Also found:
- On a first visit the worker takes over late (it's registered while the loader's already
  downloading: 11 s in, over HTTP/1.1), so the body and skin aren't kept till the second visit,
  and the page's imports go to the network again.
- Workers are clients of their own to the service worker: the 11 modules the skin's and the
  sound's workers import are checked again on every load.
- The loading screen counts bytes whether they came over the network or not: a reload that
  downloads nothing still says "Downloading … of 13.9 MB".
- A changed `sw.js` reloads the page as it takes over: the whole start, twice.

How much an update actually changes: over the last 24 merges to `main`, 2 to 16 code files each,
about 1.3 MB (0.37 MB gzipped) in the middle one; 59 of the 412 boot files (3.7 MB) in the last
day, against 12.5 MB downloaded at every update. Fetching only those cuts a visit after an update
by about 90%. Compressed, the 12.5 MB would be 3.5 MB (gzip) or 3.0 MB (brotli).

## 2. What the browsers do

| | iPhone: Safari, and Chrome (WebKit) | Android: Chrome | Desktop: Chrome, Edge | Desktop: Firefox | Desktop: Safari |
|---|---|---|---|---|---|
| A normal reload | Goes through the service worker; the page is fetched afresh, the rest as cached ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/FrameLoader.cpp)) | Goes through the service worker; only the page is revalidated ([Chrome, 2017](https://blog.chromium.org/2017/01/reload-reloaded-faster-and-leaner-page_26.html)) | As Android | Revalidates everything not `immutable` | As iPhone |
| A hard reload | "Reload from origin" skips the service worker | None (pull-to-refresh is a normal reload) | Skips the service worker | Skips the service worker | Skips the service worker |
| Storage for the game (Cache Storage) | Up to 60% of the disk per site ([WebKit, Safari 17](https://webkit.org/blog/14403/updates-to-storage-policy/)) | Up to 60% of the disk per site ([web.dev](https://web.dev/articles/storage-for-the-web)) | As Android | 10% of the disk (up to 10 GiB); 50% if persisted | As iPhone |
| Lost when | **After 7 days of Safari use without the player touching the game**, all of it ([WebKit, 2020](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)); except on the Home Screen. Whole sites, least recently used, when the disk's nearly full | Whole sites, least recently used, when free space is under min(1 GB, 1% of the disk); not if persisted | As Android | Under pressure, if not persisted | As iPhone (not for apps added to the Dock) |
| `navigator.storage.persist()` | Granted by WebKit's own judgement, notably on the Home Screen | Granted without asking if installed, or among the player's most used sites | As Android | **Asks the player** | As iPhone |
| Compiled code kept | In memory only (no on-disk bytecode cache found) | V8's code cache, for files served from Cache Storage too ([v8.dev](https://v8.dev/blog/code-caching-for-devs)) | As Android | After the 4th load | As iPhone |
| What we need: import maps, brotli, gzip | Yes (import maps since 16.4) | Yes | Yes | Yes | Yes |

So: the service worker's own store is the one place every browser keeps the game reliably (unless
Safari's 7 days pass, or the disk fills), and the HTTP cache isn't. The plan serves from the
worker's store by hash, and makes the server's answers cheap for when it's gone.

## 3. The design

### 3.1 Every file by its hash

`scripts/build-manifest.js` gives every file in the manifest the hash of its bytes (the first 10
hex digits of its SHA-256, as for data now), and every module the game loads before the loader
starts (`main.js` and its imports) one too. It writes:
- `client/js/app/manifest.js`: as now, every file with its hash;
- the import map in `client/index.html`: `"./js/app/game.js": "./js/app/game.js?h=…"` for every
  module (and `"three"`, each of `"three/addons/…"`), and `main.js`'s own `<script src>` with its
  hash. About 25 KB in the page (3.3 KB gzipped). It's the same import map that maps `"three"`
  now: one map, so no browser needs to support several.
- the release's name, from every hashed address (code included), so a release that changed only
  code is a new release to the service worker.

`client/js/app/version.js` keeps its plain address: the Pages deploy and the Mac app stamp it with
the commit after the manifest's made, so its hash would be wrong.

Addresses keep their file names (`?h=` is a query), so `new URL("./x", import.meta.url)` still finds
its neighbours, and a server that doesn't know about hashes (Pages) serves the file all the same.

### 3.2 The page's own release, wherever it's served from

The import map is in the page, which is always fetched afresh: so a page asks only for its own
release's code, and a game under way keeps its own release's modules even if an update lands
(they're all downloaded before it starts, and kept while a page on that release is open:
`collect()`).

### 3.3 The service worker

- A request by hash: from what it keeps, without the network (as now). One already being fetched
  (the loader's) is waited for, not fetched twice.
- A request by plain address (a worker's modules, a font from the style sheet, the WebAssembly
  Recast's glue fetches): mapped to its hashed copy by the release of the page asking (by
  `clientId`; a worker's by the newest release), and served from what's kept.
- Pages and anything else not listed: network-first as now, but checked with the server using the
  worker's own copy's tag (`If-None-Match`), not the browser's HTTP cache, so a 304 doesn't depend
  on a cache the browser may have emptied.
- A file served from what's kept is handed over as kept (not wrapped in a new response), so Chrome
  keeps its compiled code with it.
- Registered before the loader starts, so on a first visit it's there to keep what's downloaded.

### 3.4 The server (`server/static.js`)

- `ETag: "hash"` (with `.br` or `.gzip` for a compressed one): a file whose bytes are the same is
  "not modified", whatever its date. `If-None-Match` is asked before `If-Modified-Since`, and the
  date counts only if it's the very date, so a rolled-back file isn't the newer one.
- Code, pages and other text compressed: brotli (quality 9: game.js in 60 ms, a tenth larger than
  the best, which takes a second) where the browser takes it, gzip where it doesn't (browsers send
  brotli only over https). Each version's compressed once and kept (64 MB at most, least recently
  sent let go of first). Parts of files (the models' ranges) never.
- HTTP/2 would let a first visit fetch hundreds of files over one connection. The server sorts its
  own TLS (its certificate's ACME check and WebSockets) on one port, so it isn't attempted here: a
  later question (§6).

### 3.5 Updates: only what changed, in the background

- When the game's on its title screen or between places, and every 15 minutes while it's played,
  the page asks for `index.html` afresh and reads its import map. A new release's files that the
  worker doesn't keep are downloaded by the worker in the background (checked by hash, kept),
  slowly while a game's under way (as the downloader paces the models).
- Once they're all here, the player's told an update's ready, and the page reloads into it at the
  next quiet moment (the title screen, or when they choose to). The reload then downloads nothing.
- A new service worker (`sw.js` itself changed) no longer reloads the page from under the player
  mid-game: it waits for that quiet moment too.

### 3.6 Keeping it

- `navigator.storage.persist()` once the game's run installed (Home Screen, or an installed app):
  granted there without asking, on every browser that grants it. Never in a tab on Firefox, which
  asks the player.
- Safari: Game options says that a game not added to the Home Screen may lose what it's
  downloaded after 7 days unused, with how to add it.
- The room kept for the catalog's models: the service worker takes half of what the browser says
  is left (`navigator.storage.estimate()`), but recent Chrome says a made-up figure (what's used
  and 10 GiB more), so it's capped at what's sensible for a phone.
- A model part-downloaded when the page is closed or reloaded is carried on from where it got to,
  not started again (its parts kept as they come).

### 3.7 Seeing it work

The loading screen says how much came from this device and how much was downloaded ("13.9 MB:
0.4 MB downloaded"), and the debug overlay the same, so a reload that downloads everything again
shows at once.

## 4. Stages

| Stage | What | Where |
|---|---|---|
| **1** | The server: tags by hash, `If-None-Match` first, exact dates, compression. This plan | `server/static.js`, `test/server.test.js` |
| **2** | Every file by its hash: the manifest and the import map, the page's release, the worker's plain-address mapping (workers' imports, fonts, WebAssembly) and waiting for a file being fetched; the worker registered before the loader | `scripts/build-manifest.js`, `client/index.html`, `client/js/app/{manifest,catalog,loader}.js`, `client/sw.js`, tests |
| **3** | Updates in the background, and the reload at a quiet moment | `client/js/app/` (an updater), `client/sw.js`, `client/index.html`, `client/js/main.js` |
| **4** | Keeping it, and seeing it: own tags for pages, `persist()`, Safari's note, the models' room capped, the loading screen's figure | `client/sw.js`, `client/js/main.js`, `client/js/app/{device,loader}.js`, the options |
| **5** | A part-downloaded model carried on after a reload, its parts kept as they come | `client/js/app/fetcher.js`, `client/sw.js` |

## 5. Tests and measurements

- `test/server.test.js`: tags, encodings, a file "not modified" by its tag in any encoding, a copy
  dated after the file not, ranges never compressed.
- `test/manifest.test.js`: every file hashed; the import map and `main.js`'s address up to date.
- `test/sw.test.js`: a plain address served from the hashed copy by the page's release; a file
  being fetched not fetched twice; own tags for pages.
- A browser test: loaded, then loaded again, the second load asks the server for no code at all;
  one file changed, only that file's downloaded.
- Measured in Chromium, before and after each stage: requests and bytes for a first load, a
  reload, a reload with the HTTP cache emptied, and a load after one file changed.

## 6. Open questions

- Which reload Safari's button is on an iPhone (a normal reload, or "from origin", which skips the
  service worker and would download everything whatever we do): to be checked on the phone with
  Web Inspector.
- Whether Chrome keeps compiled code for modules served from Cache Storage, measured in a trace.
- HTTP/2 on the world server, alongside its own TLS handling.
- Moving rarely used code (playing together, characters' files, the wheels' set-up) out of the
  boot download, into the background, as the models are.
