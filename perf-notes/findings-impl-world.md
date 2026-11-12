**The world's memory and drawing: report**

Twelve of thirteen items are in; item 12 is left out and item 7 stops short of the reviewer's plan. Worktree `/home/user/conquest/.claude/worktrees/agent-a6dcab61fbc43fe04`, branch `worktree-agent-a6dcab61fbc43fe04`, 15 commits on `84f08e2`, nothing pushed.

**1. Items (with commits)**
1. DONE `5de3a6d`: fixed in `atlas.js` (the promise resolves with nothing); `game.js build()` needed no change.
2. DONE `84272db`: `joined`, chunk features, ground and crown shadows released; `kept` option for tests.
3. DONE `9ea15a0`: `plantTrees` kept for labs; a unit test shows the same corners, normals, colours and boxes.
4. DONE `3355eed`.
5. DONE `c60378b`: the test builds three.js's own map beside it.
6. DONE `77a9d12`: by each sign's own distance, one repaint a frame.
7. PARTLY `bdf4f1a`: corners shared, 16-bit indices, normals in bytes. Colour and layer stay floats: colours run from 0.0026 to above 1, and layer reaches 33,083.
8. DONE `43b4bec`, `cb18a74`, reworked in `d4ce596`: a pass of its own after the frame. Leaving meshes unculled in the frame inflated its draw counts, and a pass before the frame raised `GL_INVALID_OPERATION` on frame one.
9. DONE `0921e59`, FinalizationRegistry included.
10. DONE `f50c003`.
11. DONE `1eab27e`: r186 skin and hair shaders are byte-identical; atlas and water differ only in the one `#if`.
12. NOT DONE: the generator makes no lighter tree shape with a matching outline, and "no pop" can't be shown without a device.
13. DONE `d078484`.

`7ba91a2` adds the browser numbers to the docs.

**3. Changed outside what was named**
- `client/js/lab/building-lab.js`: `farSigns: false`, twice.
- `client/js/app/game.js`: one line in the `buildTown` call (`woodland:`).
- `e2e/pellagos.spec.js`: one reader uses the kept bounding box.
- `contribution.md`, `docs/GAME.md`, `docs/CHARACTERS.md`.
- New: `client/js/world/sending.js`, `client/js/world/art/engine/corners.js`, `test/corners.test.js`, `test/sending.test.js`, `test/quality.test.js`.

**4. Tests and measurements**
- **Unit:** 50 files importing what changed: 837 run, 836 pass. The failure is the timing test in `test/rocks.test.js` (untouched code); it passes re-run. After the last change: 169/169 and 21/21.
- **Browser, `pellagos.spec.js:4013 :4138 :4276 :5263`:** 0/4 as written; all time out in the 90 s load wait. The base commit took 91 s and 145 s to load here, this branch 74 s and 105 s (load average 12–30). With only that wait lengthened locally, not committed: 4/4.
- **Browser, `building-lab.spec.js:26 :133 :247 :275`:** 4/4 unmodified.
- **Node scripts, before → after:**
  - start town 24.1 → 9.7 MB
  - a capital's buildings 39.9 → 20.0 MB
  - 30 signs at Medium 62.4 → 1.9 MB at 120 m, 38.5 MB in the market
  - 2048 shadow map's colour 16 → 4 MB
  - GPU counter on compressed pictures ×4.0 → ×1.0
- **Headless Chromium, High, start town, seed 2:**
  - page copies of the world 142 MB (95 MB once the camera has turned round) → 57 MB
  - graphics card after turning, by the counter, 300 → 243 MB; the texture part of that drop may include the counter's own correction
  - 157 meshes sent ahead in 9 frames, with the frame's draw calls and shader count unchanged and no WebGL error

**5. For the lead / owner**
- `client/js/app/manifest.js`, `client/js/app/assets.js` and the import map in `client/index.html` are regenerated but uncommitted; run `npm run build:manifest` on merge.
- No version bump is needed.
- The browser tests need a quieter machine to pass as written.
- The memory guard's 400 and 460 MB marks were set against the counter that over-counted compressed pictures; they may want revisiting.
- Item 8's three commits could be squashed.