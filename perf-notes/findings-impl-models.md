All eight items are committed on `worktree-agent-a8d7a78d89a3c653b` (worktree `/home/user/conquest/.claude/worktrees/agent-a8d7a78d89a3c653b`, base 84f08e2). The in-game browser tests (`e2e/pellagos.spec.js`) could not be run here: the game takes 100 to 140 s to reach playing on this machine against the helper's 90 s limit.

## 1. Items

1. **Parser — DONE** (e5c0a75). `read()` drops `gltf.parser`; a skin file gets its materials first via `readGltf/loadGltf(url, { materials: true })`, used by `readSkins` and the model viewer. `loadGltf`'s `files` and `loadModel`'s `loaded` still keep scene, shapes, materials, pictures and clips for the session; nothing of the file.
2. **Compressed pictures let go — DONE** (f37d16b). `releaseCompressed` in `release.js`; `releaseTexture` delegates to it (B5). Applied in `read()` only when `readKtx2With(..., { release: true })`, which the game's `session.js` passes; labs keep theirs because the castle lab re-sends mipmaps.
   - Grep result: the only texture `.clone()` is the bridges' painted picture, and no path disposes a model's picture and draws it again.
   - One path re-marks pictures: `dungeons3d.js` `setKitPicture`, on each keep level. A released picture now ignores `needsUpdate`.
   - Left out: dungeon wall pictures read through `readKtx2` (`pictureTexture`, not my file).
3. **Truthful count — DONE** (f37d16b). `heldOnPage` counts mipmap bytes and returns early for bare nodes. `memoryNow` has `modelsMB` (`modelsHeld`: shapes, clip keys, unsent pictures; what bodies share is not double counted); the debug overlay shows it.
4. **Fetch, don't read — DONE** (0875a7f, dc8a383). On touch, predicted kinds are fetched; read within 400 m of the lair or when one is in the battle; kept to 600 m.
   - I added a wait of at most 1 s in `#addingBeast` (outside my named regions). Without it, the first creature met was built as a full stand-in and stayed one until out of view, not for "up to a second".
5. **Crowd figures packed, B4 — DONE** (467dded). `packedFigure`: only used corners, 37 B each. Colour is 16-bit, not bytes as assigned: linear colours as bytes shift darks. Page copies of corners, triangles and moves are released.
   - B4 fixed; that exposed a crash when a crowd doubled after release (three.js recomputing bounds from released corners), fixed by giving the batch the figure's bounds.
6. **Figures kept between sessions — DONE** (80e93ef, e5ecca4). New `client/js/world/figurestore.js`: Cache API, keyed by code version and a hash of kind, size and spec; 40 most recent; off for "dev". Herd figures are not kept.
7. **One skeleton — DONE** (0f0b57a). `copyOf` rebinds meshes to one skeleton through the bind matrix (no geometry rewritten), skips unworn parts, makes clip actions lazily (idle up front), caches the sphere per model.
8. **KTX2 workers — DONE** (732ed16). Worker pool disposed after a quiet minute, recreated on the next read.

a392649 brings `release.js`'s header up to date, as you asked.

## 2. Numbers

| What | Before | After | How |
| --- | --- | --- | --- |
| Model as read, no pictures: werewolf / Order / riders | 6.6 / 23.8 / 34.5 MB | 2.2 / 10.1 / 15.3 MB | `model-retained.mjs`, plus the game's own reader |
| `heldOnPage`, 1024² ETC2 picture | 4.00 MB | 0.67 MB, 0 once sent | `held-compressed.mjs` |
| Human swordsman figure, card | 3.91 MB | 1.66 MB | `measure-crowd.mjs` |
| Same, page | 3.70 MB | 0.63 MB once sent | same |
| Its corners | 28,973 at 92 B | 9,080 at 37 B | `crowd-verts.mjs` |
| Elf archer / townswoman figure, card | 3.44 / 1.39 MB | 1.47 / 1.05 MB | `measure-crowd.mjs` |
| Figure made vs read from storage | 25 s of steps | 15 ms; 1.51 MB stored | headless Chromium |
| Brother copy | 8 skeletons, 98 KB/frame, 2.04 MB, 38 ms | 1, 12 KB, 0.72 MB, 22 ms | `load-model.mjs` |
| Choir knight copy | 9, 110 KB, 2.39 MB, 41 ms | 1, 12 KB, 0.95 MB, 30 ms | same |
| Rider copy | 16, 484 KB, 5.17 MB, 66 ms | 1, 30 KB, 2.12 MB, 53 ms | same |
| Werewolf copy | 4, 25 KB, 0.70 MB, 21 ms | 1, 6 KB, 0.42 MB, 15 ms | same |

- **Drawn the same:** a packed figure against the same figure as floats differs by at most 1/255 in a channel; a stored figure against a made one, 0. A one-skeleton copy against the model's own skins over five poses is at most 0.0002 mm out (0.0017 mm for the 17 m Dreadthorn).
- **Guard's sum, seed 1 start town** (phone viewport, headless, so pictures are RGBA): the old count read 208.4 MB, the new 186.1 MB. The 22 MB is two floors' five kit pictures, counted 29 MB while holding 6.7. With `modelsMB` it is 186.6 to 192.3 MB.
- **Item 8:** the workers' memory was not measured.

## 3. Tests

- **Unit, all pass:** crowd (35), figurestore (9, new), model-shadow (11), model (16), models (4), release (7), telemetry, beast-building, herd, folkcrowd, sw, manifest (after `build:manifest`), contribution, order, beast-culling, hover, cerberus, demon-boss, champions, convoys, folding, greenflame, hell-kinds, hells, orcs, sky, dungeons.
- **Lint:** clean on everything changed.
- **`e2e/models.spec.js`, 6 run, all pass:** KTX2 (extended: pictures released, re-mark harmless, same pixels), workers resting (new), Kaiju, werewolf, Order riders, let go and read again.
- **`e2e/pellagos.spec.js`, none passed:** the new touch-screen den test, the field battle crowds, the guard in its crowd and the existing den test all stopped at "Not playing" with no page errors. I ran the new den test's steps in a script with longer waits: fetched, not read at 1 km; read at 300 m. A werewolf met on touch went from not drawn to model, never stand-in.
- **Changed assertions:** none loosened.

## 4. For the lead

- Run `npm run build:manifest`: there is a new module, and I committed no generated files.
- `#memoryGuarding` still sums without `modelsMB`; I did not edit it. Add `+ memory.modelsMB` there if the guard should see models.
- The kit's line: `memoryNow` has a comment "THE KIT'S LINE GOES HERE" just above `const page = bodies + interiors + modelled`.
- Files outside my list:
  - `app/session.js`: one line.
  - `app/debug.js`: the overlay line.
  - `client/sw.js`: `FIGURES` added to `CACHES`, so the worker leaves the figures' cache alone.
  - `game.js`: `#addingBeast`, `SPARING_MODELS`, two import lines.
  - `e2e/pellagos.spec.js`: one new test.
- Conflicts to expect with the characters branch: `contribution.md`'s release bullet and GAME.md's "Letting go of what's on the graphics card" paragraph. Keep both sides.
- Two new browser tests are not in `e2e/durations.json`.
- Run the in-game crowd, den and Bellhaven keep browser tests on a quiet machine before merging.

## 5. Left alone

- `figureOf`'s `paint` calls `drawImage` on a compressed picture's `{ width, height }` if a crowd member carries licensed gear; it would throw and that kind would fail to be made. This predates my work.
- A released picture ignores `needsUpdate`, so a later wrap or colour-space change on it would not take. Today's kits all use REPEAT samplers.
- Recorded moves differ between runs of the same kind (332 against 379 rows), so figures are not bit-identical across sessions.
- Figure storage can reach about 60 MB (1.5 MB × 40); the owner's question assumed about 40.
- Clip-only assets (`wantClips`) are not in `modelsMB`, and the telemetry trend does not carry it.