**The findings file was not written.** The harness refused the Write to `perf/findings-loading.md` ("subagents should return findings as text, not write report files"), and I did not work round it. The full findings are below for you to save; the ranked summary (under 400 words) is at the end. My scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/loading/` (run each with `node <script>` from that folder). No browser was run and nothing in the repository was touched.

Your question about the 53 MB that read models keep is answered in findings 1 and 2, and `sound.samples` / `recordings` in finding 8.

"MB" below is 1024 x 1024 bytes, as the game's loading screen counts.

---

# Loading, downloads, assets and sound: findings

Labels: MEASURED (I ran it), READ (traced in code, arithmetic shown), SUSPECTED (how to confirm is said).

## 1. Findings, ranked

### 1. Let go of the glTF parser as soon as a model is read

**Where.** `client/js/world/art/engine/models.js:28-32` (`read`), `:39-51` (`loadGltf`, whose `files` map never forgets), `:59-61` (`readGltf`); `client/js/beasts/model.js:1098` (`files`), `:1175` (`read.set(id, gltf)`), `:1310` (`sceneries.set(asset, gltf)`).

**What happens now.** `loader.parseAsync` resolves with three.js's result object, which carries `parser`. The game stores that object whole, so the parser lives as long as the model does (for `loadGltf`'s models, for good). Nothing in the game reads `gltf.parser` again, except one line that reads a skin file's materials from a parser it throws away straight after (`beasts/model.js:1058`; the lab's `lab/model-viewer.js:2000` does the same).

What the parser alone keeps alive (three r186 `GLTFLoader.js`; line numbers are the unminified copy in `node_modules/three/examples/jsm/loaders/`, same version as the vendored one):

| Held by the parser | Why | Line |
| --- | --- | --- |
| The file's whole binary chunk, copied | `this.body = data.slice(...)` | 1918 |
| The JSON as text | `this.content = textDecoder.decode(...)` | 1913 |
| The JSON as objects | `parser.json` | |
| Every picture's file bytes, again | each image's bufferView is a slice kept in `parser.cache`; the Blob made from it is a further copy, freed later | 3364-3369, 3020 |
| The clips' rotations as 16-bit numbers | the clips hold their own Float32 copies; the originals stay in `parser.cache` | |
| Every accessor, bufferView and dependency promise | the cache is only emptied when a parse starts | 2697 |

A later copy needs none of it: `modelBody` uses `gltf.scene`, `gltf.animations` and `gltf.skins` (`beasts/model.js:2061` on). So the parser can be dropped at once.

**What it costs.** MEASURED from the files (`parser-held.mjs`, `themes-held.mjs`): exact bytes of binary chunk + JSON text + picture bytes + 16-bit clip data. The JSON's objects come on top, roughly its text again in V8 (33 MB over all creature files; that measurement is noisy).

| Model | File | Kept by the parser alone |
| --- | --- | --- |
| werewolf | 3.2 MB | 5.5 MB |
| a boss (cerberus, golem, orc king, Dreadthorn) | 4.2 to 4.9 MB | 6.5 to 7.8 MB |
| the Order, mounted | 11.9 MB | 19.8 MB |
| Bellhaven (the scene) | 17.6 MB | 24.3 MB |
| an ants' nest, all nine kinds read | 26.1 MB | 42.6 MB |
| a hell, all 22 kinds read | 51.3 MB | 76.4 MB |
| every creature model (74 files) | 147.7 MB | 242 MB (1.64 times the files) |

Your snapshot agrees: the one model nothing was drawn from held `.parser` 16.4 MB, and its 2.9 MB body matches the werewolf's 2.86 MB binary chunk. Part of each `.parser` figure in the snapshot is picture data that the scene also holds (finding 2): the path through `parser.associations` is just the shortest one, so dropping the parser alone frees less than 16.4 MB there. By the files, it frees at least 5.5 MB for the werewolf and 2.4 to 6 MB for each of the three kits.

Who pays: the phone's memory, in every dungeon and near every lair. Safari's total leaves all of it out (`app/game.js:1922`: with no heap figure, the total is bodies + floors + GPU + sound + wasm), so the memory guard never saw it.

**The change.** In `models.js` `read()`, set `gltf.parser = null` before returning, unless the caller asks to keep it (`readGltf(url, { parser: true })`). `readSkins` passes that and takes its materials as now; the model viewer likewise.

**Gain.** 5.5 to 8 MB of page memory for each creature kind read, 20 to 24 MB for the two biggest files. Exact byte counts; a little more with the JSON objects.

**Effort.** S. **Risk.** None to the simulation or to what's drawn. **Confidence.** MEASURED for what's held; READ for "nothing needs it".

**Verify.** Repeat the heap snapshot: `fetchModelsWith`'s context loses its `.parser` entries. `e2e/models.spec.js` and `test/model.test.js` still pass.

---

### 2. A model's pictures are held twice: let the page's copy go once the graphics card has it, and don't read what's only predicted

**Where.** `client/js/world/release.js:39-53` (`releaseTexture` only knows `image.data`, and isn't used for models); `client/js/beasts/model.js:1420-1451` (`disposeModel`); `client/js/app/game.js:5377-5379` (`wantModel(kind)` for every kind within 1,500 m of a lair) and `:677` (`KEEP_MODELS = 2000`).

**What happens now.**

- A KTX2 picture comes back from the transcoder as a `CompressedTexture` whose `mipmaps[].data` are typed arrays on the page. three.js sends them to the card and keeps them. So each drawn model's pictures are held twice, the same size each. Nothing reads the page's copy again: a model's pictures are disposed only with the model (`disposeModel`; `scenery3d.js:222-235`), and a lost context already reloads the page (`main.js:295-302`).
- They can't be dropped before upload. A model nothing is drawn from has never been sent to the card, so the page's copy is its only one.
- A kind within 1.5 km of one of its lairs, or that may be met where the player is, is read (not only fetched) and kept while the player is within 2 km. That is the snapshot's one model, read, nothing drawn from it.

**What it costs.** MEASURED from the files (`skins.mjs`, `kinds-skins2.mjs`, `themes-held.mjs`), in an iPhone's formats (ETC2 at half a byte a pixel, ASTC at one, with mipmaps):

| | Its own pictures | The skins it reads |
| --- | --- | --- |
| werewolf | 6.7 MB | 4.0 MB |
| cerberus | 6.7 MB | 3.3 MB |
| golem | 5.7 MB | |
| the Order | 12.7 MB | 1.7 MB |
| the Order, mounted | 24.7 MB | 1.7 MB |
| Bellhaven (the scene) | 21.8 MB | |
| an ants' nest, all nine kinds | 21.3 MB | |

So a werewolf that may be met near the town holds about 10.7 MB of pictures on the page, plus finding 1's 5.5 MB, plus its shapes and clips, before one is drawn.

A caution on the snapshot's numbers: its `mipmaps[0].data` were 4 MB each, which is 1024 x 1024 uncompressed. That Chromium had no compressed formats, so KTX2Loader fell back to RGBA. An iPhone holds the same pictures at an eighth to a quarter of that. The snapshot's `.skins` 13.4 MB and its GPU texture total overstate a phone for model pictures; the parser's share (finding 1) is the same on both.

**The change**, in order of value for effort:

1. *Release after upload.* A `releaseCompressed(texture)` beside `releaseTexture`: on `texture.onUpdate`, replace `texture.mipmaps` with the same levels without their `data` (new level objects, so a clone sharing them isn't emptied before its own upload), and set `released.any`. Apply it to every picture of a model as it's read.
2. *Count them.* Add read models' and scenes' page copies to `memoryNow()` (compressed mipmaps in `heldOnPage`, over `read` and `sceneries`), so Safari's total and the memory guard see them.
3. *Fetch, don't read, what's only predicted* (on touch devices at least): `fetchModel(kind, "soon")` at 1.5 km, as a place's creatures are fetched at 150 m (`game.js:5390-5395`), and `wantModel` when one is put in the battle or the player is within a few hundred metres.

**Gain.** (1) gives back each drawn model's picture size on the page: 2 to 10 MB a kind, about 21 MB in a nest, 22 MB in Bellhaven. (3) gives the whole of a predicted model, 10 to 20 MB, until it's met. Estimated from the file counts.

**Effort.** (1) and (2) S; (3) M.

**Risk.** (1): a picture disposed and drawn again while its model is still held would come back empty. I found no such path, but check where a body is undressed and dressed again. (3): the stand-in shows about half a second to a second longer the first time a kind is met in the open. No change to the simulation.

**Confidence.** READ (three keeps `mipmaps`; the heap shows them retained); sizes MEASURED.

**Verify.** Heap snapshot before and after in a nest; `e2e/models.spec.js`; lose and restore the context once to see the reload path still works.

---

### 3. Decode recorded sound at the rate its content needs: a quarter less, nothing lost

**Where.** `client/js/audio/sound.js:2172-2191` (`#decodeData`), `:186` (`DECODED_BUDGET`); `scripts/build-sounds.js:59-60` (48 kHz, 64 kbps); `scripts/build-music.js:39-40` (32 kHz).

**Already done.** Every file is mono (MEASURED, `mp3.mjs`: 955 sounds and 152 music samples, all one channel). The 32 kHz files are decoded at 32 kHz, not the phone's 48. Music is 152 instrument notes averaging 2.3 s, sequenced note by note, so there is nothing to stream.

**What's left.** The files' rates are higher than their content, because the MP3 encoder cuts the top off (MEASURED, `spectrum.mjs`, `rates.mjs`: every file decoded with `mpg123-decoder` and its spectrum summed):

| Files | Stored at | Energy above | Could decode at | Saving |
| --- | --- | --- | --- | --- |
| 21 ambience beds (651 s) | 32 kHz | 12 kHz: none, -104 dB, in every one | 24 kHz | 25%: 79.4 to 59.6 MB if all decoded |
| 934 effects (855 s) | 48 kHz | 17 kHz: median -103 dB; 18 kHz: at most -71 dB | 36 kHz | 25%: 156.6 to 117.4 MB if all decoded |
| 152 music notes (346 s) | 32 kHz | varies: 45 have nothing above 8 kHz, some are bright | a rate per file | about 20%: 42.2 to 33.6 MB |

(32 kHz for the effects would save a third but isn't quite lossless: mail hits and snake hisses have real content between 16 and 17 kHz.)

What a phone holds now (MEASURED, `audio-sets.mjs`): the sounds downloaded at the start decode to 21.8 MB, a busy place's beds to 14 to 20 MB, the first three scores to 17.8 MB. With the 48 MB cap that is the crash reports' 82 MB: 48 of recorded sound, about 18 of music, the made sounds, the MP3s.

**The change.** In `#decodeData`, decode through the `OfflineAudioContext` at `min(the file's rate, a cap)`: 24,000 for beds, 36,000 for other recorded sounds (a field on `RECORDED`'s entries, or one written per file by `npm run build:sounds`). Then lower `DECODED_BUDGET.touch` from 48 to 36 MB: the same sounds stay decoded. Optionally a per-file rate for music from `build:music`.

**Gain.** 12 MB on a phone with the same sounds kept, about 3.6 MB more with per-file music rates: roughly 15 of 82 MB.

**Effort.** S. **Risk.** Nothing audible by the spectra; the existing fallback stays. No simulation change. **Confidence.** MEASURED.

**Verify.** `sound.memory()` after the same walk; mail hits and snake hisses at 36 kHz against 48 in the sound studio.

---

### 4. Strip comments and indentation from the code on the deployed site (not a bundle)

**Where.** `.github/workflows/pages.yml:44-49`; `scripts/build-manifest.js:28-33`.

**What happens now.** The game ships 474 modules, 14.48 MB, 4.06 MB gzipped (MEASURED, `graph.mjs`). 450 are the game's own. Comment lines are 3.5 MB of them (27% of bytes) and whitespace about 2.7 MB more (`strip.mjs`).

| The game's own 450 modules | Raw | Gzip |
| --- | --- | --- |
| As shipped | 12.86 MB | 3.69 MB |
| Comments stripped | 9.61 MB | 2.69 MB (-27%) |
| Comments and whitespace (`minifyWhitespace`) | 6.93 MB | 2.14 MB (-42%) |
| Full minify, a file at a time | 5.65 MB | 1.99 MB (-46%) |
| One bundle with splitting, minified (with vendor: 94 files) | 6.66 MB | 2.13 MB in all |

A first visit downloads about 7.0 MB over the wire (`boot.mjs`: the manifest's 413 files are 15.47 MB raw, 6.24 MB as sent; `main.js`'s own imports 0.58 MB; the page, styles and first pictures 0.2 MB). Whitespace-only minifying takes 1.55 MB off (22%) and halves what an update downloads (`game.js`: 245 KB gzipped to 130 KB). Safari keeps no compiled code between visits, so each load also parses 6 MB less.

**The change.** In the Pages job, after `cp -R client _site`: esbuild's `transform` over `_site/js/**/*.js` with `minifyWhitespace` only (about 7 s here), then make the manifest and import map for `_site` (a `--root` option on `build-manifest.js`), then stamp the version. Write external source maps. The repository, `npm start`, the tests and the Mac app are untouched.

**Why not a bundle.** MEASURED (`bundle.mjs`): 48% saved against 42 to 46%. It would cost per-file updates: the delivery plan counts a median update at 0.37 MB gzipped, where a bundle's main chunk is 1.0 MB and changes with nearly every merge. It needs nine worker entry points and care with 15 `import.meta.url` references. And the loader already fetches everything sixteen at a time before importing, so a bundle saves no round trips there.

**Effort.** M. **Risk.** The site's code is no longer byte for byte what CI tested (whitespace-only keeps that small; a browser test against `_site` would close it). Stack traces need the maps. **Confidence.** MEASURED sizes; 1.55 MB is 0.8 s at 15 Mbps, 2.5 s at 5.

---

### 5. Compress the models inside their scrambled container: a third less to wait for at a door

**Where.** `client/js/app/scramble.js` (`readable`), `scripts/scramble-model.js`.

**What happens now.** 206 MB of models are fetched as wanted, in ranges, and by `generated/asset_streaming_plan.md:141-142` Pages doesn't compress them. A fifth of the creatures' bytes is glTF JSON: 33.2 MB of 147.7 MB, which gzips to 2.3 MB (MEASURED, `json-parts.mjs`). It is the animations: 148,316 samplers, 68% of them two keys or fewer.

| Waited for at the door (`themes.mjs`) | Now | Gzipped whole |
| --- | --- | --- |
| a cave or hideout | 3.8 MB | 3.1 MB |
| a keep | 12.9 MB | 9.4 MB |
| an ants' nest | 26.1 MB | 17.8 MB |
| a hell | 51.3 MB | 35.6 MB |
| all creature models | 147.7 MB | 108.1 MB (-27%) |

At 15 Mbps a nest's wait goes from 14 s to 9.5 s.

**The change.** gzip, then scramble; in `readable()`, inflate with `DecompressionStream("gzip")` (Safari 16.4 and later, the import map's own floor). The deeper fix belongs to the pipeline: don't write a track that never leaves the rest pose.

**Effort.** M. **Risk.** Every model's hash changes, so every player downloads them again once. **Confidence.** MEASURED sizes. Confirm first, because `scramble.js:4-6` says the opposite of the plan: one ranged request with `Accept-Encoding: gzip` for a `.bin` on the live site. If Pages does compress those, this finding is void.

---

### 6. First paint and first visit: preload main.js's imports, register the service worker earlier, hash `styles.css`

**Where.** `client/index.html:18`, `:503-518`; `scripts/build-manifest.js:167-173`, `:340-355`; `client/sw.js:789-839`; `client/styles.css:225-230`.

**What happens now.** MEASURED (`graph.mjs`): `main.js` statically imports 68 modules (2.05 MB, 0.58 MB gzipped) found nine levels deep (1, 27, 8, 6, 6, 8, 5, 5, 3 a level), with no `modulepreload`. On a first visit that is nine round trips in a row before the loading bar moves. The service worker is registered only after them. `styles.css` (42 KB gzipped, render-blocking) and the crest's font (a 62 KB TTF) have no hash, so they're checked with the server on every load and, by the delivery plan's account of Pages' tags, download in full after every deploy. The import map is 42.7 KB of the page's 177 KB (8.7 of 36.5 KB gzipped), which is fine.

**The change.** All in `build-manifest.js`: write `modulepreload` links for `startFiles()`'s modules after the import map; register `sw.js` from the page's inline script; write `styles.css?h=...`; convert the font to WOFF2.

**Gain.** Estimated: eight round trips fewer on a first visit (0.4 to 0.8 s at 50 to 100 ms each); one fewer before first paint on every later visit. **Effort.** S. **Risk.** A `modulepreload` before the import map breaks the map in Safari 16 and 17. **Confidence.** MEASURED graph; the time is SUSPECTED until timed on a slowed link.

---

### 7. The service worker does work on every load that nothing uses

**Where.** `client/sw.js:647-696`, `:698-703`, `:226-269`; `client/js/app/loader.js:69-149`.

**What happens now.** READ. `collect()` runs on each page start and sizes every kept file with a `cache.match` (`:662-668`): about 480 look-ups for boot files whose sizes are never used (only the catalog's count). On a repeat visit the loader fetches all 400 code files (13 MB) through the worker only to count and discard them (`loader.js:83`, `:118-120`), then `import()` fetches each again. `fromKept` opens the cache by name on every request.

**The change.** Size only catalog entries; open the caches once; on a repeat visit ask the worker which addresses it keeps and fetch only the rest.

**Gain.** SUSPECTED: tenths of a second on a desktop, more on a phone, each repeat load. Confirm with the loading screen's own "x MB in y s" on the iPhone's second visit. **Effort.** S, S, M.

---

### 8. With Sound off, the game still makes and downloads its sounds

**Where.** `client/js/app/session.js:42-45`; `client/js/audio/sound.js:993-996`, `:1228-1236`, `:2053-2061`, `:2093`.

**What happens now.** READ. `audio.prepare()` runs whatever the setting. Until the browser's sound starts (the first tap, or never with Sound off), `sound.samples` holds the made sounds as PCM (Float32, 48 kHz, mono; the 1.8 MB entry is the wind) and `sound.recordings` holds MP3 files as downloaded, waiting to be decoded. Your snapshot shows exactly that state, 7.8 and 4.1 MB, because a headless page is never tapped. Once sound starts, `samples` is emptied into the browser's buffers and `recordings` moves to `mp3s` and `musicMp3s` (still MP3). So the 12.3 MB is the before-first-tap picture, not what a played game holds.

**The change.** Don't `prepare()` while Sound is off. **Gain.** About 12 MB and a 2.3 MB download for a player with Sound off. **Effort.** S. **Confidence.** READ.

---

### 9. The KTX2 transcoder's workers are never let go (suspected)

**Where.** `client/js/world/art/engine/models.js:17`, `:78-87`. Two workers each hold the Basis WebAssembly, whose heap grows to its biggest picture (the scene kits have 2048 x 2048 ones) and can't shrink. SUSPECTED tens of MB, counted nowhere. Confirm with the dedicated workers' memory after going into Bellhaven. Fix: dispose the pool after a quiet minute. S.

## 2. Checked and already good

- **Model files** (`glb.mjs`, all 260 inspected in memory): meshopt with quantized attributes on every creature and scene model, levels of detail packed in, KTX2 with mipmaps on all but five small models. The creatures' pictures take 258 MB on a card where RGBA would be 1,680 MB. Only 13 pictures are 2048.
- **Dungeon pictures**: 18 KTX2 at 512; 4.5 MB on a card against 24 MB as RGBA.
- **Sound's shape**: mono, own-rate decoding, a budget, MP3s kept, made sounds on demand.
- **Caching**: every file by its hash, updates fetch only what changed, in the background.
- **What's deferred**: 206 MB on demand against 15.47 MB before the title; the boot budget test (16 MB) has 0.5 MB of room.
- **Meshopt on the main thread**: not worth moving; the biggest model decodes to under 22 MB.
- **The 378 modules imported after the loader**: local by then, no round trips.

## 3. Bugs

1. **Three seconds lost on every load where the service worker can't register.** `app/device.js:107-118` waits for `controllerchange` or 3 s; `:138` only logs a failed `register()`. Sure of the path, not of how often.
2. **Sound off still prepares sound** (finding 8). Sure.
3. **Two documents disagree** on whether Pages compresses the models (`scramble.js:4-6` against `asset_streaming_plan.md:141-142`).
4. **Safari's memory total leaves out everything models hold on the page** (`game.js:1922`). In your Chromium snapshot the heap was 401 MB where bodies and floors, which stand in for it on Safari, were 88 MB.

## 4. Code structure

- **A scene's baked walk is a 435 KB module in the core's import graph** (`core/scenery/bellhaven.walk.js`). It is a fifth of what `main.js` loads before the loading bar and is parsed in four places, the page and three workers (`workers.mjs`). Each new scene will add another.
- **Two workers import most of the core**: the silhouette worker 86 modules (2.2 MB of source), the terrain worker 64 (1.9 MB). Not measured in a browser.
- **`loadGltf` never forgets** (`models.js:22-23`): props, gear and prop kits stay for the session.

## 5. Gameplay and design

- Lairs' models are read from 1.5 km and kept to 2 km, so one inside that ring of the start town is held all session. Places with a door do it better (fetched at 150 m, read at the door).
- 150 m may be too late for a nest's 26 MB on a slow link; fetching from further off costs only storage.

## 6. Questions for the owner

1. Is a minify step that runs only in the Pages deploy acceptable (finding 4)?
2. Once sound decodes smaller, should the phone's cap drop from 48 to 36 MB, or stay for fewer re-decodes?
3. On phones, is a stand-in showing up to a second longer acceptable in exchange for not holding predicted models?
4. Finding 5 makes every player download the models again once. Acceptable?

## Appendix: module graph

| | Modules | Raw | Gzip | Levels |
| --- | --- | --- | --- | --- |
| `main.js` and its static imports | 69 | 2.05 MB | 0.58 MB | 9 |
| `core/navigation.js` | 49 more | 0.90 MB | 0.27 MB | 7 |
| `session.js`, `creator.js`, `hud.js` | 329 more | 10.64 MB | 3.03 MB | 6 |
| Evaluated before the title | 447 | 13.59 MB | 3.89 MB | |
| Everything reachable | 474 | 14.48 MB | 4.06 MB | |

---

## Summary (top findings in rank order)

1. **Drop the glTF parser once a model is read** (S, no visible change). The stored result keeps the file's binary chunk, its JSON twice and every picture's bytes again: 5.5 to 8 MB per creature kind, 24 MB for Bellhaven, up to 43 MB in an ants' nest. Nothing reads it after the read. This is most of the "parser" share of your 53 MB.
2. **Release models' compressed pictures from the page after upload, count them, and fetch rather than read predicted kinds** (S to M). Each drawn model's pictures are held twice; a kind within 1.5 km of a lair is read and held undrawn. Note your snapshot's 4 MB pictures are Chromium's RGBA fallback; an iPhone holds an eighth to a quarter.
3. **Decode beds at 24 kHz and effects at 36 kHz** (S). Measured spectra show nothing above 12 and 18 kHz. About 12 to 15 MB of the phone's 82 MB. Mono and own-rate decoding are already done; music can't be streamed (it's sequenced notes).
4. **Whitespace-only minify in the Pages deploy** (M). 1.55 MB off a 7.0 MB first visit, updates halved. A bundle saves barely more and breaks per-file updates: not recommended.
5. **gzip models inside the scrambled container** (M). A nest's wait 26.1 to 17.8 MB. Confirm first that Pages doesn't already compress `.bin`.
6. **modulepreload for main.js's 68 imports, earlier service worker registration, hashed `styles.css`** (S). Nine round trips become one on a first visit.
7. **Service worker per-load waste** (S to M, cost suspected): 480 unused cache look-ups and a second read of 13 MB of code each repeat load.
8. **Sound off still makes and downloads sounds** (S). `sound.samples` is made PCM and `recordings` is MP3 bytes, both waiting for the first tap; your 12.3 MB is that pre-tap state.

Asset formats themselves are in good order and need no work.