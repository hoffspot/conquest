# Heavier models downloaded in the background, and kept in the browser: the plan

A living plan, like `terrain_navmesh_overhaul_plan.md`: updated as each milestone lands and as
measurements come in. The [change log](#11-change-log) at the end records every change and why.

**Goal.** Bring heavier models into the game, such as creatures made by `utilities/blenderpipeline`
(a dragon is 0.3–5 MB). Do it without making the first download any bigger, and without making
anyone's game play worse while they arrive. Above all, playing together must not suffer. Keep what
has been downloaded in the browser, across visits and releases. Each release replaces exactly what
changed, deletes what was removed, and downloads nothing twice.

**Constraints.**
- The game runs well on an iPhone 16 Pro (contribution.md), on mobile networks as well as Wi-Fi.
- It's hosted on GitHub Pages: static files, headers we can't set. It's also served by
  `npm start`. Neither may be depended on alone (the terrain plan's rule).
- Playing together is a host streaming the world's steps over a WebSocket relay, 20 a second. Each
  joined game keeps 2–6 steps in hand, sized to how unevenly they arrive (`PLAYOUT`,
  `core/netplay.js`). Anything that delays those messages costs every joined player.

---

## 0. Decisions: the paradigm in brief

1. **Models are dressing, never rules.** Nothing in `client/js/core/` waits for an asset, or
   behaves differently for having one. Every model downloaded later has a stand-in drawn until it
   arrives: the creature built in code (`beasts/*.js`), or its lower-detail copy. Play never waits
   on a download, and two players' games may hold different models at the same moment without
   telling different stories.
2. **Three tiers.**
   - **Boot:** today's manifest, kept under a budget a test enforces.
   - **Near:** what the player is likely to meet soon, predicted from the world plan and fetched in
     the background.
   - **On demand:** what's needed now and wasn't predicted, fetched first.
3. **One downloader, one file at a time, ranked, and polite.** It sends small paced requests. A
   controller slows it whenever the round trip to the relay grows, which is the sign a download is
   queuing in front of the game's messages. It stops altogether while a player is joining.
4. **Content addressing.** Each downloadable asset is known by a hash of its bytes, listed in a
   catalog `npm run build:manifest` writes. A copy cached under its hash is correct forever: no
   expiry by time, no revalidation. A release that changes a model changes its hash. What no
   catalog in use lists any more is deleted.
5. **Degrade, don't break.** With no storage (private browsing), little storage, `saveData`, a slow
   link, or a model that can't be had, the game streams without keeping, or keeps the stand-ins.
   It never stalls and never errors.

---

## 1. Where we start (the audit)

| What | Today | What it means here |
| --- | --- | --- |
| First download | `app/loader.js` fetches the whole manifest (`app/manifest.js`, about 9.7 MB) before the title, 16 files at once. Body, skin and models are kept as blobs, and models are read through their blob URLs (`readModelsFrom`) | Fine for what's there now. Every heavy model added to it would make everyone wait for it |
| Models | `loadGltf`/`loadModel` (`world/art/engine/models.js`), with meshoptimizer's decoder since #191. The only model in the manifest is the chest (178 KB) | The loader is ready for the pipeline's models; nothing decides when to fetch them |
| Service worker | One cache, `pellagos-v1` (`client/sw.js`). Code and pages are network-first. Images, models and music are cache-first by URL and never checked again | A model changed in a release stays stale until `CACHE_NAME` is bumped, and bumping it throws away everything, music included |
| Playing together | Relay on the game's server (`server/relay.js`, WebSocket over TCP). About 1.7 KB/s to each joined player (docs/WAR.md). Joined games keep 2–6 steps in hand; one message late by 1 s counts as a dropped link (`PLAYOUT.late`) | Bandwidth is tiny; delay is what matters. A download filling the queue at the player's bottleneck (bufferbloat) adds its whole queue to every game message behind it |
| Hosting | GitHub Pages: static, `max-age=600`, ETag, no custom headers. `npm start` (`server/static.js`): `no-cache`, Last-Modified, **no byte ranges** | Pacing can't count on range requests everywhere (§3.2), and caching can't count on headers (§5) |
| Pipeline output | `<name>.glb`, `<name>.lodN.glb` and `<name>.report.json` (sizes, triangles, textures) | The catalog's sizes and lower-detail copies come from here |

---

## 2. The asset catalog (made with the manifest)

A second generated module beside the manifest, `client/js/app/assets.js`. It's made from a
hand-written list, `client/models/assets.json`, by `npm run build:manifest`, and checked up to date
by the manifest's test. (Built in A1, empty until A3 adds the first model.)

```js
export const ASSETS = Object.freeze({
    // (A hash of the addresses of every file kept by hash, the manifest's data and these: it
    // changes exactly when one of them does)
    release: "6c1e09a2b4",
    models: {
        dragon: {
            tier: "near",                              // or "demand": only once it's needed
            stand: "beast:dragon",                     // drawn till it's here (beasts/looks.js)
            when: { sites: ["dragon's lair"], within: 1500 },
            files: [
                { lod: 1, path: "models/beasts/dragon.lod1.glb", hash: "3f2a9c1e5b", bytes: 287331 },
                { lod: 0, path: "models/beasts/dragon.glb", hash: "9ab01c77d2", bytes: 1203040 },
            ],
        },
    },
});
```

`assets.json` holds the same without `hash` and `bytes`, which `npm run build:manifest` adds. It
checks each model has a tier and files, and that each file is there.

- **Hashes.** The first 10 hex digits of the SHA-256 of the file's bytes. They name it in URLs and
  caches, and check it arrived whole (§5.3). (No `sri` as well: against a corrupt or mismatched
  download 40 bits are plenty, and nothing guards against the server itself, which serves the
  code too.)
- **URLs** are the file's path with its hash, `models/beasts/dragon.glb?h=9ab01c77d2`. The file
  keeps its name in the repository and on the server; the query makes each version a different
  URL to every cache. That needs no build step to rename files, and GitHub Pages ignores the query.
- **Sizes** let the downloader plan, and show players how much an optional download is.
- **`when`** is how the near tier is predicted (§4): sites in the world plan, the lands a creature
  lives in, or `start` for something wanted soon after any start.
- **The manifest's data has hashes too:** the body, its skin and the chest (the groups the loader
  keeps). The loader fetches them by `?h=` and hands them out by their names, so nothing that
  reads them changes. Code and fonts are asked for by name (the page imports them, and the CSS
  names the fonts), so they have none.
- **The boot budget.** The manifest's test asserts the boot download stays within
  `BOOT_BUDGET` (12 MB; 9.2 MB in A1), and that no catalog file is in it. Growth is then a
  deliberate change to the budget, made in review (contribution.md, section 3, rule 9).

---

## 3. Downloading in the background without hurting play

### 3.1 The queue

One downloader (`app/fetcher.js`) and one download at a time. Several at once would only fill the
player's link faster, and help nothing that's waited for.

| Priority | What | Example |
| --- | --- | --- |
| **now** | Wanted on screen and not here: its stand-in is showing | The host's world spawned a wyvern this game hasn't got |
| **soon** | Predicted within the next minute or so | Walking towards a dragon's lair 900 m off: its lower-detail copy |
| **later** | Worth having before it's wanted | The full-detail dragon once its lower-detail copy is in; the homeland's creatures, while idle |

- A request already queued is raised in priority, not queued again.
- A **now** pre-empts the download in progress at its next chunk. The one stopped resumes later
  from where it got to (§3.2).
- A request no longer wanted (the player turned back) drops out of the queue. A file half
  downloaded keeps its chunks in memory for a while, in case it's wanted again.

### 3.2 Pacing: small requests, spaced out

- **Range requests**, 128–256 KB each (`Range: bytes=a-b`), with a token bucket deciding when the
  next may go. Between chunks nothing is in flight, so the game's messages never queue behind more
  than one chunk.
- **Where ranges aren't served** (a 200 instead of a 206: `npm start` today), it reads the response
  stream slowly. A reader paused between reads stops TCP's receive window opening, and the sender
  slows to match. It's less exact, since the browser buffers some ahead, but still bounded.
  `server/static.js` gets range support in milestone A2, and GitHub Pages's is to be checked then.
- `fetch(url, { priority: "low" })` where the browser honours it: a hint, not relied on.

### 3.3 The controller: backing off when the game's messages slow

Delay-based, as LEDBAT (RFC 6817) is: a download yields as soon as the round trip grows, before
anything is lost.

- **Measured:** the round trip to the relay. Playing together, it's measured as now (ping and
  pong). While a download runs, every 2 s, playing alone too, since the relay is the same machine's
  link. Also the joined game's playout: how many steps it keeps in hand, and how late messages come
  (`Joining.pace`).
- **Base:** the least round trip seen over the last minute. **Queueing:** the round trip now, less
  the base.
- **The rule, each chunk:**
  - queueing over the target (30 ms to start with), or the playout's steps in hand growing: halve
    the rate, and wait out one round trip before the next chunk;
  - queueing under half the target: add 32 KB/s;
  - never over half the throughput measured on the last chunks while playing together, nor over
    80% playing alone.
- **Starting rates:** 128 KB/s playing together, 1 MB/s alone. A 300 KB lower-detail dragon takes
  2–3 s; the full 1.2 MB about 10 s while playing together.
- Each number is a constant to tune by measurement (§9), not by guesswork.

### 3.4 Quiet times: when it doesn't download at all

- While this game is joining a world, from the click to the `welcome` and its snapshot, and until
  the playout settles (its steps in hand back to `PLAYOUT.least`, 5 s at least).
- While this game is the host and someone joins: from the `peer` notice until the joiner's first
  `ping` is answered, since the snapshot goes up the host's link.
- When the relay link drops or comes back (`away`, `back`, `rejoin`), and on `state` (the world
  sent again).
- For the first 10 s after the game starts, while shaders compile and the world is first built.

### 3.5 The device and the player

- `navigator.connection.saveData` or `effectiveType` of `2g` or slower (where the browser has them):
  only **now**, only lower-detail copies.
- `navigator.deviceMemory` and the Visual quality level (`world/view.js`) pick between quality
  variants once the catalog has them (§8, A5).
- A setting under Game options, **Extra models**:
  - **Automatic** (the default): everything above;
  - **Only when needed**: **now** only;
  - **Never**: stand-ins only, and nothing downloaded.

  Also there: how much is kept, **Download all now** (for playing offline), and **Clear**.

### 3.6 From bytes to a model without a hitch

- `MeshoptDecoder.useWorkers(2)`: decompression off the main thread.
- Textures as ImageBitmaps (GLTFLoader's default where `createImageBitmap` exists), decoded off the
  main thread.
- GPU upload and shader compiling spread over frames, before the model is first shown:
  `renderer.compileAsync`, and `initTexture` a texture a frame. `world/flyers3d.js` already gives
  each frame a few milliseconds to build a wyvern or dragon before it appears; models arriving go
  through the same budget.
- **The swap.** A stand-in becomes the model only when the swap can't be seen: out of view, far
  enough off, or behind a short fade. Never mid-attack. The new body answers the same
  `plan.pose()` the built creature does (`beasts/beast.js`), so the game can't tell the difference.

---

## 4. When to fetch what: prediction

Every player's game plays the same steps as the host's (deterministic: `core/random.js`), so each
can predict for itself what's coming. No message on the wire is needed, and `NET_VERSION` isn't
touched.

- **Sites.** For each catalog model with `when.sites`, the nearest such site in the world plan
  (`world.plan.sites`). Inside `within` metres: its lower-detail copy, **soon**. Inside a third of
  that: its full model, **soon**.
- **Lands.** A creature living in the land the player stands in, or the next land in the direction
  they're heading (`creatures.js`, `WYVERN_LANDS` in `world/flyers3d.js`): **soon**.
- **Spawns.** A creature put in the world near the player (`#arrive`, the battle's spawns) whose
  model isn't here: **now**. Its stand-in shows meanwhile.
- **The sky.** A dragon circling high over its lair (`flyers3d.js`) only ever needs its
  lower-detail copy.
- **Idle.** Playing alone, nothing queued for a minute, a link that's not metered: **later** for the
  homeland's creatures and the boss of the nearest perilous place.
- **Pinned.** Whatever the save's current region needs isn't evicted (§5.4).

---

## 5. The cache in the browser

### 5.1 Where

Cache Storage, through the service worker, as now. It holds whole responses, serves them when
offline, and works in every browser the game supports, iOS Safari included. What the service
worker needs to know is kept in one small JSON response in a cache of its own: the releases
heard of and the files each keeps by hash, the newest, each open page's release, and when each
kept file was last used. That avoids a second store, and an IndexedDB dependency in the worker.

| Cache | What | How it's served |
| --- | --- | --- |
| `pellagos-shell-v2` | Pages, code and files without a hash | Code and pages network-first, as before. Images and models without a hash from the copy, then checked in the background at most once a minute; the music's recordings (named by their content) never checked |
| `pellagos-boot-v2` | The manifest's data by `?h=`: the body, its skin, the chest | Cache-first, never checked; collected (§5.4) but never to make room |
| `pellagos-assets-v2` | The catalog's files by `?h=` | Cache-first, never checked; collected, and let go of to make room |
| `pellagos-state-v2` | What the worker knows (`sw-state.json`) | Not served |

A file downloaded whole goes to `assets` if a release heard of lists it as the catalog's, and to
`boot` otherwise. A request with a `Range` header (A2's downloader) goes straight to the server:
the downloader puts the whole file together, checks it and keeps it itself.

Each name's `-v2` is a version: changing one lets go of all that cache holds, and nothing else.
It's never changed for a release. The shell's is changed to let go of code no release uses any
more (an old Three.js's folder); the others only when how they're laid out changes.

### 5.2 Why no expiry by time

A copy is cached under the hash of its bytes, so a hit is always the right file. There's nothing
to revalidate and no `max-age` to guess. That's what makes GitHub Pages's ten minutes, and its
headers we can't set, not matter. Expiry is about what's no longer listed, and about space.

### 5.3 Integrity

- **Downloaded whole through the worker** (the loader's files): the page gets it as it arrives
  (the body is split: one half to the page, one to be checked), and the worker keeps it only once
  `crypto.subtle.digest` of the whole matches its hash. On a mismatch (a release published while
  a page was loading, so the server has another version) it's handed on, as before A1, but not
  kept, and asked for again the next time.
- **Downloaded in chunks** (A2's downloader): checked whole the same way before it's kept or
  used. On a mismatch it's neither: the game fetches the catalog again (code is network-first)
  and requeues it.

### 5.4 Expiry: what's kept, and for how long

An entry is **live** while any release in use lists its address:
- the newest release: that of the page started last. Each page tells the worker its release on
  starting (`postMessage`: the addresses it keeps, and `performance.timeOrigin`), and again when
  an update's worker takes over. A page started later has newer code, fetched network-first; a
  page open a while, telling its release again, doesn't make it the newest;
- that of each page still open (`clients.matchAll`, uncontrolled pages too).

Until a page has told its release, nothing is collected. A file kept or used in the last ten
minutes isn't collected either, whatever the releases say: its page may not have told its
release yet (the loader starts downloading before the message gets there).

Collection runs when the service worker activates, and whenever a page tells its release (once
a page load). Releases and pages no longer in use are forgotten then too.

1. **Replaced in a release:** the new version is downloaded when it's next wanted, not all at once
   on release day. The old version is deleted once no page on the old release is open. (Keeping
   it until the new one is cached, for a player offline, waits for A3: until then nothing could
   use an older version of a file.)
2. **Removed in a release:** deleted once no open page's release lists it.
3. **Unchanged:** same hash, same entry. Nothing is downloaded again, whatever else the release
   changed.
4. **Over budget:** the budget is the least of the player's setting (A4) and half of what the
   browser would let the game keep for them (`navigator.storage.estimate()`: its quota, less
   what's used besides the catalog's files). The least recently used entries go first; pinned
   (§4) and **now** last (A3). Only the catalog's files: never what a release in use needs to
   start.
5. **Gone without asking:** the browser may evict anything, at any time. Nothing trusts the JSON
   record alone: a `caches.match` miss is a miss, and the stand-in shows while it's fetched again.

### 5.5 Browsers, storage and persistence

`navigator.storage.estimate()` decides, at run time, rather than any number assumed here. Roughly:

| Browser | What to expect | What the game does |
| --- | --- | --- |
| Chrome, Edge (and other Chromium) | A large share of the disk per site. "Persistent" is granted without asking to installed or much-used sites | Asks `navigator.storage.persist()` once something's been downloaded |
| Firefox | Best-effort storage up to a share of the disk per site, which can be evicted under pressure. `persist()` asks the player | Asks only when they choose **Download all now** |
| Safari, iOS and macOS | Generous quotas since Safari 17. A site's script-written storage may be cleared after 7 days unused, unless it's a web app added to the Home Screen | Says so beside **Download all now**; the Home Screen app (the game is installable) keeps it |
| Private browsing, any browser | Little space, kept only for the session | Detected by a small quota: streams without keeping anything |

### 5.6 Moving from today's cache

On activating, the new service worker copies what `pellagos-v1` holds into the shell, then deletes
`pellagos-v1`, as `activate` already deletes old caches by prefix. It can't tell then which files
are still current: no page has told it its release yet. So when a file is first asked for by its
hash, a copy saved by name is looked for in the shell, and taken on (kept under its hash, and the
copy by name deleted) if its bytes match. Nobody downloads an unchanged file again, and code
already copied serves a player offline straight after the update.

---

## 6. The boot download

- It stays under the budget the test enforces (§2). Heavy models go in the catalog, never the
  manifest.
- The manifest's data has hashes too, so the body, its skin and the chest are kept by `?h=` in
  `pellagos-boot-v2`. Images (named by the page and its CSS) and the music's recordings aren't
  in the manifest: images are checked in the background, and the recordings are named by their
  content already (§5.1). So no cache's version needs changing for an asset again, and the comment
  in `sw.js` saying when to change it went.
- The loader keeps downloading 16 at once: before the title there's no game to protect.

---

## 7. Hosting

- **GitHub Pages:** nothing to configure. The `?h=` keys and the service worker do what headers
  would. Range requests are checked in A2 (§3.2).
- **`npm start`** (`server/static.js`), in A2:
  - byte ranges: `Accept-Ranges`, `206` and `Content-Range`;
  - `Cache-Control: public, max-age=31536000, immutable` for any `?h=` request (it's one version
    forever);
  - the rest as now.
- **The relay and the models on one machine** share its upstream. A game hosted for many players
  should serve its models from Pages or a CDN. An `ASSETS_BASE` setting in the catalog moves where
  they're fetched from, without moving the relay.

---

## 8. Milestones

Each is shippable alone, and the game is no worse after each.

| | Milestone | What lands |
| --- | --- | --- |
| **A1** (done) | The catalog and the cache | `assets.json` and the generated `assets.js` (hashes, sizes); hashes for the manifest's data too; the boot budget test; the service worker's `-v2` caches, `?h=` keys checked before they're kept, collection (§5.4) and the move from `pellagos-v1`. The body, its skin and the chest move to `?h=`. No lazy loading yet |
| **A2** | The downloader | `app/fetcher.js`: the queue, chunked range requests and slow reading, the controller, quiet times, `saveData`. Range support and `immutable` for `?h=` in `server/static.js`. The debug overlay shows the rate, queueing delay and what's queued |
| **A3** | The first model on demand | The pipeline's dragon (lower-detail copy and full) in the catalog. Prediction from lairs (§4); the stand-in swap (§3.6); `useWorkers`; compiling ahead |
| **A4** | Players' choices | **Extra models** under Game options; storage used, **Download all now**, **Clear**; `persist()` |
| **A5** | Quality variants | The pipeline builds texture variants (512, 1024, 2048); the catalog lists them; the device and Visual quality pick. KTX2 textures to be weighed after |

---

## 9. Tests and measurements

**Unit tests (Node):**
- the catalog is up to date with the files, and every file's hash and size are right;
- the boot download is under its budget, with no catalog file in it;
- collection, as a pure function: given the catalogs in use, the entries, the budget and the
  pinned, it returns exactly what to delete. Replaced, removed, unchanged, over budget, an old tab
  still open;
- the controller, as a pure function: from a series of round trips, the rates it chooses (backs
  off on a rise, recovers, never over its caps);
- the queue: priorities, raising, pre-empting and resuming, dropping.

**Browser tests (Playwright):**
- **A release:** serve catalog 1, cache everything, then serve catalog 2 with one model changed,
  one removed and one the same. The changed one is fetched again and the old copy deleted; the
  removed one is deleted; the same one isn't fetched at all.
- **Offline:** after **Download all now**, with the network cut, the game starts and draws the
  models.
- **The stand-in:** a model that 404s or arrives corrupt leaves the stand-in drawn, and no error.
- **Playing together under a download:** two pages, one hosting and one joined, and the network
  slowed with Chromium's emulation (DevTools Protocol: bandwidth and latency). With a large model
  downloading, the joined game's steps in hand stay within `PLAYOUT.most`, and no `late` passes.
  The same test with the controller turned off should fail, which is how we know it's measuring.

**In A1:** `test/sw.test.js` runs the worker with stand-ins for the caches, pages and network: a
file kept by hash once checked and never asked for again, a mismatch handed on but not kept, a
release replacing, removing and keeping files with an old page open and then closed, the newest
release, making room, the move from `pellagos-v1`; and collection as a pure function
(`toLetGo`). `test/manifest.test.js` checks the hashes, the catalog and the budget.
`e2e/caching.spec.js` does it in Chromium: the data kept by hash and not downloaded again, an
older release's copy let go of, and the game started offline.

**Measured before choosing the numbers (§3.3):** on a phone over 4G and over Wi-Fi with a
bufferbloated router, the round trip and playout while downloading at full speed, and then paced.

---

## 10. Open questions

- The controller's target (30 ms) and chunk size (128–256 KB) are first guesses: measured in A2.
- Background Fetch (Chromium only) for **Download all now**, so it carries on with the page
  closed. Worth it? Only after A4.
- Whether a host should hint models to joined players before spawning (it would need a message, and
  `NET_VERSION`). §4 says it needn't, since each game predicts the same spawns; to confirm in A3.
- Whether to keep lower-detail copies once the full model is cached: smaller to draw far off, but
  double the storage.

---

## 11. Change log

- **2026-10-05.** First version: the paradigm (models are dressing; tiers; one polite downloader;
  content-addressed caching collected by the catalogs in use), from the audit in §1.
- **2026-10-05. A1 landed:** the catalog (empty until A3), hashes for the manifest's data, the boot
  budget (12 MB), the service worker's `-v2` caches, collection and the move from `pellagos-v1`.
  Changed from the first version:
  - No `sri`: the hash is the SHA-256's first 10 hex digits, enough to check a download, and the
    worker checks a file against it before keeping it, so `fetch(integrity)` isn't needed (§2, §5.3).
  - A fourth cache, `state`, holds what the worker knows; which of `boot` and `assets` a file goes
    to is decided by the releases heard of (§5.1).
  - The newest release is that of the page started last, not the last heard of, as pages tell
    theirs again when an update's worker takes over. A file kept in the last ten minutes isn't
    collected, since the loader's downloads can reach the worker before its page's release does
    (§5.4).
  - Keeping a replaced file until its new version is cached waits for A3, which can use it (§5.4).
  - The move from `pellagos-v1` takes copies on by their bytes when they're first asked for by
    hash, since the worker doesn't know the hashes when it activates (§5.6).
  - Images and the music's recordings were never in the manifest: images are checked in the
    background now, and the recordings are named by their content (§5.1, §6).
  - `immutable` for `?h=` in `server/static.js` goes with A2's range support (§7).
