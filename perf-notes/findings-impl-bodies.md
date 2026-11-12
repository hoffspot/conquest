**Bodies: report** (worktree `/home/user/conquest/.claude/worktrees/agent-a87da234a9606675b`, branch `worktree-agent-a87da234a9606675b`, base 84f08e2, nothing pushed)

**1. Items**
1. **B1: DONE.** One shared making for garments' and outfits' pictures (`wardrobe.js` `shared`). `interleave.mjs`: was 1 wearer counted, two pictures; now 2 wearers, one picture.
2. **F1: DONE.** Skin, outfit and wounds held at 256 under 120 px, back under 100 after 3 s; three steps on High. Swapped in place. The player's hero is never made smaller; a likeness waits for `Character.whole()`.
   - **100/119/121 px is not bit-identical.** By area, 0.05 to 0.5% of the skin would still sample the full level at 119 to 121 px. In headless Chromium (software GL), about 15% of the body's pixels differ, by 1.2/255 on average; 11 to 37 pixels differ by more than 2, at most 11 (front) or 28 (turned). The rounding of my mean against the card's own mipmaps accounts for most of it. No GL errors.
3. **F2: DONE**, (a) to (e). The guard should call **`letGoOfIdle(kit)`** and the memory count **`heldByKit(kit)`**, both in `client/js/characters/kit.js`; neither is wired.
4. **F8, F10, F12: DONE. F11: PARTLY.**
   - Done: the expressions' texture is released once sent.
   - Not done, the atlas's page copy: without it a body built at once is flat-skinned or stalls over a second rebuilding it, unless the game hides it until the worker's skin arrives. That is game.js visibility code outside my lines.
   - Not done, typed reference vertices: every garment's region function and ten places in `test/characters.test.js` read them as objects; I estimate 1.5 MB.
5. **Garbage: DONE** for the named paths. Poses are bit-identical before and after (six bodies hashed frame by frame). Still allocating most: `Rig.evaluate`, `Actions.sample`.
6. **F13: NOT DONE**, not started.

**2. Commits**
```
384200e Nothing made each frame keeping a scabbard off the leg, swinging a skirt or setting the walk's joints
26d1746 What every body shares sent once; a body measured only for a skirt; a skirt's swing worked out only when posed
8055bb0 The kit lets go of its page copies of what characters wear, once they're used
9fbbbb7 A body's pictures held at the size it's seen: 256 a side under 120 pixels tall
fdb8ea8 An outfit's picture made once for two built turn and turn about
```

**3. Outside my named lines**
- `game.js`: `#likeness` (+6 lines) and `#portray` (+4), both for whole pictures; new `#tallWhereBuilt` beside `#built`.
- `docs/CHARACTERS.md`, `docs/GAME.md`, `contribution.md`.
- New: `characters/wardrobe.js`, `characters/pictures.js`, `test/pictures.test.js`, `test/wardrobe.test.js`, `test/posing-garbage.test.js`.
- One assertion changed in `test/character-building.test.js`: bodies now share one `faceSlot` attribute.
- Generated files are left uncommitted.

**4. Tests and measurements**
- **Unit:** 594 run, one failure. "waits for a skin painted in the worker" failed three times in loaded batches (10 s wall-clock patience) and passes alone, 21/21.
- **Motion check:** 11,910 played, no regressions.
- **Repo Playwright:** could not run. Five attempts (pellagos.spec.js:1883, :3084 three times, :6156) hit the 90 s start limit on this loaded machine, with no page errors. My own headless runs passed: an orc went 256 to whole in 1.5 game-seconds and its likeness painted, with no GL or page errors.

| 25 bodies, skins 512, seen 80 px | Before | After |
| --- | --- | --- |
| Pictures on the card | 100.3 MB | 38.3 MB |
| Buffers on the card | 56.4 MB | 48.8 MB |
| Kit on the page | about 99 MB | 38.3 MB (34.3 flushed) |
| Skirt, drawn unposed | 31 to 36 µs | 4 µs |
| Made per frame: blade / skirt / joints | 110 / 49 / 21 KB | 20 / 16 / 0.2 KB |
| Posing garbage, six-body trace | 132 KB a body-frame | 89 KB |

"Before" for the kit is my sum of the reviewer's figures. Seen near (300 px), card pictures stay 100.3 MB.

**5. For the lead and owner**
- Wire `letGoOfIdle` and `heldByKit`. `bodiesMB` falls, so the guard's marks may want moving.
- F9: `#garmentMaterial` now counts the character as drawing with a garment; it is released in `#release()` (`leaveGarments`).
- The header of `world/release.js` and the QUALITY comment in `view.js` ("about ten megabytes") are now stale; not my files.
- `e2e/pellagos.spec.js:1883` counts blood texels (`> 200`): a body held at 256 has a quarter as many. Unverified.
- No version bumps.