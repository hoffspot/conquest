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
   coarse cells), turned with its plain back to the hills or the woods (`backedOf`), its front
   toward its road as far as that allows.
3. **The land's laid to it** (`core/terrain/scenes.js`, `SCENES`): its 0 set by its road's end;
   on the open ground (its terrain, or nothing of it, 6 m and more from all that stands on it,
   flooded in from its edges, so never within its walls) the land runs along its terrain, 10 cm
   under; round what stands on it, the terrain's kept and the land sinks under it, from 4 m in
   over 12 m; past its edges, the land eases to its own lie.
4. **It's drawn** (`world/landmark3d.js`): its far model, its terrain material swapped for the
   world's ground material (`ground.js` `groundMaterial({ land })`), all of it, and sunk 4 m on
   the open ground under the world's land, where the world's trees and grass grow (sites.js
   `growsAt`, `openOn`; overworld.js; far/trees.js).
5. **It's dressed** (`world/landmarkdress.js`), from the heights of its art as drawn, each metre:
   its ground darkened round what stands on it (`ground.js` `contactOf`), its rocks and walls at
   their feet (`footed`), boulders and scree of our own rocks along its crag's foot (`screeOf`),
   mist in its chasm (`DRESS.mist`, by scene: its box and how low its floor is).
6. **Its plain faces are dressed with its own parts** before the far model's built. The artist's
   scene is made to be seen from the front; its back was bare boxes.
   - Find them: `faces.mjs <glb>` lists each broad face that looks back or out to a side.
   - Set the parts onto them: `backwalls.py` (Bellhaven's placements, the rules to copy) writes
     the placements; `dress.py` sets each part onto its face, by a ray onto the wall, with a dark
     pane behind each window's tracery, and saves a `.blend`. Look at it with `look.py` first.
   - Build the far model from that `.blend`, with its own config (`private/bellhaven-far.json`:
     `source` the `.blend`, `join` the parts to the scene, `materials` the `M_Dress_*` copies'
     textures, `apart: ["M_Dress*"]`, and `simplify.materials` their own shares).

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
- **Look into every part of the scene from the world**, its chasm too: simplified to 1.5%,
  Bellhaven's bridge's Gothic piers were stacks of white spikes there. `materials.mjs` says
  which material is what's seen (`M_II_1_2`); give it a share of its own (8%).
- **Parts set onto a scene keep materials of their own**: the same as the castle's but for
  their names, the pipeline's dedup made them one with the castle's and they were cut to its
  1.5%. `apart` keeps them apart.
- **Faces' planes are only to the metre**: a window's tracery 0.3 m deep set onto the rounded
  plane was inside the wall. Ray onto the wall from just off it, not from far out, where a rock
  in front is hit first.
- **A material drawn with both the far land and the near world must be two**: the boulders'
  one material, its lights changed between the two passes, drew them black; the scene's terrain's
  one ground material drew it, past the near world, as a pale sheet the castle and the land
  showed through (from behind and to one side of Bellhaven). Give each copy its own.
- **Darken the ground only under what stands on it**: the darkening under every overhang and
  the bridge left the crag's ground in shade black. Take the lowest of what's over the ground,
  and keep it to about half of the world's darkening.
- **Measure the room round a scene before promising the land a gentle slope.** Bellhaven's
  crags stand 110 to 180 m over the land behind them, and a slope trees grow on wants 300 m or
  more to fall over; but the plan puts roads, streams, sites, camps and settlements within 100 to
  250 m of its edges in every world. Its hill takes the room there is (`hillOf`, short of each of
  them), and it's turned to where its hill's gentlest (`backedOf`, `steepestOf`). Don't let a
  hill's reach change quickly along the edges: the land between makes gullies.
- **Trees on a slope need a forest's floor under them.** Woods on a steep hill over the ground's
  own rock, and the near world's cliff faces, read as bare rock with trees stuck on. Where a hill
  is wooded, its ground's a forest's floor (`ground.js` `FOREST_FLOOR`) and no cliff faces are
  drawn (`kits/cliffs.js`), near and far alike.
- **Take pictures with the game's own draw distance.** Drawn out to 3 km, the near world drew
  the scene's near copy over the far land in front of it: from behind, a hill seemed to cut
  through Bellhaven, and its back walls, hidden in the game behind its crags, showed. The
  pictures had to be taken again. `shots.cjs` keeps the game's 160 m now (`NEAR_FAR` to change
  it, only to look at the near copy). Keep the camera near where the player stands, too: the far
  land has a hole 112 m round the player for the near world's ground, which is drawn only 160 m
  from the camera, so a camera 60 m off and 90 m up sees the sky through the land's edge.

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
  way in looking left and right along the crag, from each side, from behind, from above, from
  700 m, and into its chasm from its rim. `HIDE=castle` shows the land alone, `HIDE=land` the
  scene alone, `HIDE="landmark mist"` all but that part of its dressing (or anything of it whose
  material's so named: `HIDE="landmark ground"`, all but its own terrain), `HIDE="far:landmark
  boulders"` all but those drawn with the far land.
- `faces.mjs <glb>`: its broad plain faces, to be dressed. `materials.mjs <glb> [box]`: each
  material's triangles in the model and in a box of it.
- `look.py <scene> <png> <eye> <at> [lens]`, with the pipeline's Blender Python
  (`utilities/blenderpipeline/.venv/bin/python -I`): the scene, or a dressed `.blend`, in plain
  clay, its dressing tinted, from where you say (Blender's coordinates: z up, -y the game's z).

The browser test `e2e/bellhaven.spec.js` checks its far model's drawn with the world's ground
material, darkened round what stands on it, its rocks and walls at their feet, its dressing, its
way in, and going in and out; `test/scenes.test.js` checks the land, `test/landmarkdress.test.js`
the dressing.

## Ideas not yet done

These were offered to the owner; ask before doing them.
- Tint the castle's own stone a little to the land's light and colour (mist, dusk).
- The world's path texture along its walked ways.
- The world's ground look in its own map too (its phone build's terrain).
- The sun's shadows of its walls and rocks near the player (they cast none: it's drawn twice,
  and the shadow map's box is only 24 m round the player).
