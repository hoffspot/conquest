---
name: set-scene-into-world
description: Set a bought or made scene (a castle on its crag, a ruin on its hill: one model with its own terrain) into Pellagos's procedural world as a landmark, so it sits in the land with no seam, no floating rocks and the world's own trees round it. Use when the owner asks for a scene model to stand in the world, to blend a scene's terrain with the world's, or when a set-in scene's ground, rocks or edges look wrong.
---

# Setting a scene into the world

How Bellhaven (DmitriyDryzhak's White Castle, November 2026) went into the world, and what it
took to make it look a part of the land. Read `contribution.md`, `docs/WORLD.md` (*Set into the
world*) and `utilities/blenderpipeline/README.md` (*Where it can be walked*, *Rocks that touch
nothing*) first. A bought scene comes in by the `import-licensed-model` skill's rules: never in
this repository, scrambled into `hoffspot/conquest-models`, a rebuilt file under a new name.

## What the owner wants, every time

- **No floating rocks**, anywhere: in the world, from any side, near or far, and in the scene's
  own map. Check them by measure (`seated.mjs`), not by eye alone.
- **One land.** The scene's ground looks like the world's (the same grass, rock, the land's
  colours), and runs on into it with no seam, no step, no pale apron.
- **Trees, bushes and grass on the land leading up to the scene and round it**, never inside
  its walls, on its paved ways, its road's end or the path up to its gate.
- Pictures from every side before it's called done.

## How it fits together

1. **The pipeline bakes the scene's ground** with its walk (`walk.under`: the lowest of it and the
   top of its floors over 4 m patches; `walk.ground`: the top of its terrain material and of all
   else over 2 m patches) and **seats its rocks** (`seat`), on every profile:
   ```json
   "walk": { "from": [0, 79.2, -50], "under": 4, "ground": { "materials": ["M_Ground"], "square": 2 } },
   "seat": { "materials": ["M_Rock*"], "gap": 1, "drop": 3 }
   ```
   Its far profile keeps more of its rocks and terrain than of the rest (`simplify.materials`,
   Bellhaven `M_Rock*` 0.03, `M_Ground` 0.08, 1.5% of the castle): simplified hard, a rock comes
   apart from the cliff it was set into.
2. **The plan places it** (`core/worldplan/settle.js`, Bellhaven's `BELLHAVEN`): laid out last,
   on the flattest land with room, measured with `landHeight` (ridges and all, not the plan's
   coarse cells), facing its road.
3. **The land's laid to it** (`core/terrain/scenes.js`, `SCENES`): its 0 set by its road's end;
   on the open ground (its terrain, or nothing of it, 6 m and more from all that stands on it,
   flooded in from its edges, so never within its walls) the land runs along its terrain, 10 cm
   under; round what stands on it, the terrain's kept and the land sinks under it, from 4 m in
   over 12 m; past its edges, the land eases to its own lie.
4. **It's drawn** (`world/landmark3d.js`): its far model, its terrain material swapped for the
   world's ground material (`ground.js` `groundMaterial({ land })`), all of it, and sunk 4 m on
   the open ground under the world's land, where the world's trees and grass grow (sites.js
   `growsAt`, `openOn`; overworld.js; far/trees.js).

## Rules learnt the hard way

- **Never hide the scene's terrain and draw the world's land in its place under its rocks.** The
  land's a height grid, and the far land reads it every 8 m near and 16, 32 m farther out: it
  can't follow a cliff, and every rock set into one floats in front of it. Keep the scene's own
  terrain where anything stands on it; give it the world's look instead.
- **Don't cut the scene's terrain away at a hard edge either.** The far land read every 16 or
  32 m can lie 15 to 50 m under the cut, a trench along it. Sink it under the land instead: where
  the land dips, the sunk terrain still shows, the same look.
- **Measure the land against the scene's floors** (`scenes.test.js`): the land never comes up
  through one.
- **The far model's what's seen in the world**, from 2.6 km in to the way in. Check it, not the
  full detail or the phone build.
- **The artist's own scene may have floating rocks.** White Castle's had 367 pieces touching
  nothing. `seat` sets down those within `drop` and leaves the rest out.
- **Not faded with the near world** (`NO_NEAR_FADE` on every material), or nothing of it shows
  past 128 m.
- The land under a slope read at a patch's middle: a patch's highest point is at its upper edge,
  so take half its rise off (`terrainOf`), or the land stands over the terrain on every slope.

## Checking it

Scripts in `scripts/`, run from the repository's root:

- `seated.mjs <glb>`: each rock, and whether anything touches its lower half, only its upper half,
  or none of it. Run it on the far and phone builds. The goal is none touching nothing.
- `open.mjs [scene]`: the map of its terrain: open (the land's and the trees'), kept, standing.
  Within the walls must be closed.
- `farland.mjs <seed>`: the land as the far land reads it, at 1, 8, 16 and 32 m, against the
  scene's terrain: how far it pokes through where kept, how far it falls under at the open edge.
- `where.mjs <from> <to>`: where each world puts it, and how much the land rises and falls round
  it.
- `edge.mjs <seed> [x] [z]`: the land across its edges and along its road.
- `shots.cjs`: pictures in the game (serve it with `PORT=8145 node server/index.js` after
  `npm run build:manifest`). Take at least these, at `DPR=2` for the owner: from its road, from its
  way in looking left and right along the crag, from each side, from behind, from above, and
  from 700 m. `HIDE=castle` shows the land alone, `HIDE=land` the scene alone.

The browser test `e2e/bellhaven.spec.js` checks its far model's drawn with the world's ground
material, its way in, and going in and out; `test/scenes.test.js` checks the land.

## Ideas not yet done

These were offered to the owner; ask before doing them.
- Tint the castle's own stone a little to the land's light and colour (mist, dusk).
- Boulders and scree from the world's own rocks along the crag's foot, where the cliff meets the
  land.
- Contact darkening at the walls' feet.
- The world's path texture along its walked ways.
- Mist in its chasm.
- The world's ground look in its own map too (its phone build's terrain).
- Facing that puts its plain back walls toward hills or forest.
