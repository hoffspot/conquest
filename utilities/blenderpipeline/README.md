# The Blender pipeline

Turns `.blend` files into game-ready GLB files for Pellagos's Three.js (r186): the mesh, its
skeleton and every animation, its materials baked onto one texture atlas when glTF can't carry
them as they are (UDIM tiles, procedural or mixed shaders, several materials on one mesh), sized
in metres and facing +z, compressed, checked with the Khronos glTF Validator, and reported on.

It runs Blender without a window (Blender itself, or Blender's Python module, `bpy`), then
finishes the file in Node with [glTF-Transform](https://gltf-transform.dev) and
[meshoptimizer](https://github.com/zeux/meshoptimizer). It was built to bring bought, rigged and
animated creatures (such as the Dreadthorn Dragon: a Blender file, nine 2K UDIM tiles, fourteen
clips) into the game, and is tested on CC0 models from Mesh2Motion and on a test creature of its
own.

## Quick start

```sh
cd utilities/blenderpipeline
npm ci                 # its own dependencies (not the game's)
npm run setup          # Blender 4.5 LTS as a Python module, in .venv (needs Python 3.11; about 1 GB)
npm run build          # every example (examples/*.json) into dist/
npm run view           # look at them: http://localhost:8099/
```

With a Blender of your own (4.2 or later) instead of `npm run setup`:
`BLENDER=/path/to/blender node build.js examples/dragon.json`.

Build one asset, or several: `node build.js my-asset.json [more.json...]`. Options:

| Option | What it does |
| --- | --- |
| `--out <dir>` | Writes there, not where the config says |
| `--blender <path>` | Runs this Blender (else `BLENDER`, then `BLENDER_PYTHON`, then `.venv`'s `bpy`) |
| `--strict` | Fails an asset that's over any of its budgets |
| `--keep` | Keeps the work in `<out>/.work/<name>/`: Blender's own GLB, its report and log, and every baked pass as a PNG, to look at |
| `--verbose` | Shows Blender's own output as it goes |
| `--fixtures` | Remakes the test creature (`fixtures/*.py`) |

## What it does

**In Blender** (`blender/export.py`):

1. Opens the `.blend` and picks what's exported: every mesh shown and rendered in the scene (or
   the `objects` or `collection` named), and the armature deforming them. Cameras, lights,
   hidden helpers and bones' custom shapes (widgets) are left out.
2. Brings in actions from other `.blend` files (`actions`: one clip a file, as Mesh2Motion keeps
   them, or a pack bought separately), picks the armature's actions to export (`clips.include`,
   `clips.exclude`) and names them (`clips.rename`). Each becomes one glTF animation, sampled
   frame by frame with its constraints (IK and all) worked out.
3. Exports only the bones that deform the mesh: no control bones, IK targets or poles, and no
   bones flagged to deform that move no vertex (a chain's tips; a control bone flagged by mistake),
   unless they're kept (`keepBones`). A bone that moves nothing itself but carries others (a
   root) stays.
4. Bakes a mesh's materials onto one atlas if glTF can't carry them (`textures.bake`):
   - the atlas is laid out a rectangle for each material, and for each UDIM tile, keeping the
     artist's UV layout inside it and each one's resolution relative to the others
     (`blender/atlas.py`), as large as fits `textures.atlasSize`;
   - Cycles bakes base colour, alpha, roughness, metallic (each input of the Principled BSDF,
     shown as emission), normals (tangent space, normal maps and bumps included), emission and,
     if asked, ambient occlusion, with the armature at rest;
   - a flat material (one colour) is painted in, not baked;
   - faces whose UVs sit on a single point of a texture (a palette, as low-poly models often have)
     can't be baked: a mesh baked only to merge its materials keeps them instead, and otherwise
     the report warns;
   - what varies becomes a texture (occlusion, roughness and metallic share one), what doesn't a
     factor; what glTF has no place for (displacement, subsurface scattering, coat, sheen) is
     left out, and the report says so.
5. Shrinks any other texture larger than `textures.maxSize`, and writes WebP (or JPEG, or PNG).
   With a normal map, it writes MikkTSpace tangents too (cutting n-gons into triangles), so
   Three.js shades it as it was baked.

**In Node** (`lib/optimize.js`):

1. Turns it (`turn`) to face +z, sizes it in metres (`size`), stands it on its origin
   (`origin: "feet"`). All are baked into the data, skinned meshes included, not put on a node
   over it.
2. Measures each clip's root motion (the bone carried across the ground, how far, how fast), and
   takes it out of the clips to be played in place (`clips.inPlace`): the drift from start to
   end, spread evenly, comes off the root bone; its sway and bounce stay. The report gives the
   speed, so the game can match a clip's playing speed to how fast the creature moves.
3. Takes out keyframes a straight line gives anyway, duplicates, and anything unused (a texture
   of one colour becomes the material's colour), and the material extensions the game doesn't
   draw (`stripMaterialExtensions`). A mesh's parts that share a material are joined into one
   draw call (separate objects keep their names).
4. Works out whether each clip loops, and how far out the creature reaches at any moment of any
   clip (for culling).
5. Validates it with the glTF Validator, before it's compressed (the validator can't read
   meshopt's compression) and after.
6. Makes lower-detail copies (`lods`), and compresses (`compress`).

Then it reads the GLB back as the game would, and writes `<name>.report.json` beside it.

Builds are reproducible: the same sources, config and Blender make the same bytes.

## An asset's config

A JSON file; paths are relative to it. Only `source` is needed. A setting it doesn't know is an
error, so a misspelt one isn't silently ignored.

| Setting | Default | What it is |
| --- | --- | --- |
| `source` | | The `.blend` |
| `name` | the config file's name | The files written: `<name>.glb`, `<name>.report.json`, `<name>.lod1.glb`... |
| `out` | `"dist"` | Where to write |
| `objects` / `collection` | all shown meshes | What to export, by name |
| `actions` | `[]` | `[{ "from": "other.blend", "action": "Walk", "name": "Crawling" }]`: actions to bring in (`action` left out: all of that file's) |
| `clips.include` / `clips.exclude` | all / none | Which actions are exported (names; `*` and `?` wildcards) |
| `clips.rename` | `{}` | `{ "Blender name": "clip name" }` |
| `clips.inPlace` | `[]` | Clips to play in place (names, or `true` for all) |
| `clips.rootBone` | the topmost bone that's carried | The bone carrying the creature's travel |
| `deformBonesOnly` | `true` | Only bones that deform the mesh (above) |
| `keepBones` | `[]` | Bones to keep even if they move nothing (points to attach things to: a mouth for fire, a claw for footprints) |
| `applyModifiers` | `true` | Applies modifiers (mirror, subdivision...) except the armature |
| `textures.bake` | `"auto"` | `"auto"`: bake what glTF can't carry; `"always"`; `"never"` |
| `textures.udim` | `"atlas"` | UDIM tiles baked onto the atlas, or `"split"`: Blender's exporter's way, a material and textures for each tile, copied from their files as they are |
| `textures.mergeMaterials` | `true` | Several materials on one mesh baked into one (one draw call) |
| `textures.atlasSize` | `1024` | The atlas's largest size (pixels) |
| `textures.maxSize` | `1024` | The largest any other texture is kept at |
| `textures.format` | `"webp"` | `"webp"`, `"jpeg"` or `"png"` |
| `textures.quality` | `90` | WebP's and JPEG's quality |
| `textures.ao` | `false` | Bake ambient occlusion into the atlas |
| `textures.aoSamples` | `32` | Cycles's samples for it |
| `textures.proceduralSize` | `512` | Pixels a UV unit for a procedural texture's share of the atlas |
| `textures.margin` | `4` | Pixels baked round each island, so edges don't bleed when mipmapped |
| `size` | as it is | `{ "height" \| "length" \| "width" \| "longest": metres }` or `{ "scale": factor }` (measured at rest, after turning) |
| `turn` | `0` | Degrees about the vertical, counterclockwise from above, so it faces +z (Blender's front, −y, already is) |
| `origin` | `"keep"` | `"feet"`: its lowest point at y = 0, centred across |
| `compress` | `"meshopt"` | `"meshopt"` (EXT_meshopt_compression: smallest; Three.js needs the meshopt decoder, which the game's loader has), `"quantize"` (KHR_mesh_quantization: Three.js reads it as it is) or `"none"` |
| `resample` | `0.0001` | How far a resampled animation may stray from its keyframes |
| `stripMaterialExtensions` | `true` | Leaves out transmission, sheen, clearcoat and the like |
| `lods` | `[]` | `[{ "ratio": 0.35, "error": 0.02 }]`: lower-detail copies (share of vertices kept; error as a share of its size) |
| `budgets` | `{}` | Limits it's checked against: `triangles`, `vertices`, `joints`, `drawCalls`, `textureSize`, `textureMegabytes` (on the GPU, with mipmaps), `kilobytes` (the GLB), `clips` (names it must have) |

## What you get

`dist/<name>.glb`, its lower-detail copies, and `dist/<name>.report.json`:

- `meshes`: draw calls, vertices, triangles, joints and influences a vertex;
- `materials` and `textures`: each texture's size, format, kilobytes and GPU megabytes;
- `clips`: each clip's length, whether it loops, its root motion (bone, distance, speed,
  direction) and whether that was taken out, and the file it came from;
- `bounds`: its box at rest, its box over every clip, and how far from its origin it ever reaches;
- `exported`: what Blender exported, how each mesh was baked and why, what was left out;
- `budgets`, `validation`, `notes` and `warnings`.

And a summary as it's built:

```text
dragon: dist/dragon.glb, 301.9 KB (meshopt)
  3498 triangles, 2905 vertices, 1 draw call, 90 joints (4 a vertex)
  1 texture: 512x512 webp, 1.3 MB on the GPU
  4 clips: Crawling 1.33 s (loops), Flying 0.75 s, Gliding 2.00 s (loops), Idling 2.00 s (loops)
  12.04 x 1.97 x 9.00 m (across, up, along), reaching 6.80 m from its origin
  dist/dragon.lod1.glb: 1220 triangles, 280.6 KB
  within its 6 budgets
  glTF Validator: 0 errors, 0 warnings
  warning: rig-dragon.blend was saved by Blender 5.1.29, newer than this one (4.5.14 LTS): check the result
```

## Using it in the game

The game's own loader, `loadGltf` in `client/js/world/art/engine/models.js`, reads what this
makes, compressed or not (it has meshoptimizer's decoder):

```js
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { loadGltf } from "../world/art/engine/models.js";

const { scene: model, animations } = await loadGltf("models/dragon.glb");
const scene = clone(model);
const mixer = new THREE.AnimationMixer(scene);
const crawling = mixer.clipAction(THREE.AnimationClip.findByName(animations, "Crawling"));

// Its feet don't slide: play it as fast as it moves (the report's rootMotion.speed is metres a
// second at timeScale 1)
crawling.timeScale = speed / report.clips.find((clip) => clip.name === "Crawling").rootMotion.speed;
crawling.play();
// ...and every frame: mixer.update(dt)
```

- **The meshopt decoder** is Three.js's add-on `libs/meshopt_decoder.module.js`, copied into
  `client/vendor/three-r186/addons/` by `npm run vendor:three`. Anywhere else, give a GLTFLoader it:
  `new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)`. Without it, build with
  `"compress": "quantize"`, which GLTFLoader reads as it is (larger: see `dragon-statue`).
- **A clone for each.** `loadGltf` reads a file once and shares it: clone its scene for each one
  drawn (a skinned one with Three.js's `SkeletonUtils.clone`, so each has a skeleton of its own).
- **The rest pose** is each node's own transform, as loaded. Don't reset a skinned mesh with
  `skeleton.pose()`: once it's quantized, its inverse bind matrices carry the quantization, and its
  bind pose is no longer where it stands.
- Skinned meshes are at the top of the scene, as glTF would have them (their own transforms are
  ignored by Three.js anyway); move, turn and scale what holds `scene`.
- `bounds.radius` is how far it reaches from its origin at any moment of any clip: a culling
  sphere that's never too small.

## For a bought asset

**Its licence first.** This repository is public, and its rule is that assets in it are CC0, MIT
or similarly permissive (contribution.md, section 3). A bought model's files, and what's built from
them, don't go in it. Put them in `private/` here, which git ignores: the source, its config and
what's built.

```text
private/
  dreadthorn/                  the asset as bought (unzipped)
  dreadthorn.json              its config ("out": "out")
  out/                         what's built
```

A config for the Dreadthorn Dragon might be (its object, action and bone names are guesses until
it's opened; run it once, read the report's `notes` for what it found, and fill them in):

```json
{
    "source": "dreadthorn/dreadthorn_dragon.blend",
    "out": "out",
    "clips": {
        "exclude": ["*T-Pose*"],
        "inPlace": ["Crawling*"]
    },
    "keepBones": ["*jaw*"],
    "textures": { "atlasSize": 2048, "format": "webp", "quality": 90 },
    "size": { "length": 10 },
    "lods": [{ "ratio": 0.25, "error": 0.02 }],
    "budgets": {
        "triangles": 140000,
        "drawCalls": 1,
        "textureSize": 2048,
        "clips": ["Idling", "Crawling", "Crawling Left", "Crawling Right", "Roar", "Breathing Fire", "Hit React", "Take off", "Landing", "Flying", "Flying Left", "Flying Right", "Gliding", "Hovering"]
    }
}
```

What to expect from it:

- Its nine 2K UDIM tiles become one atlas: at 2048 pixels each tile gets a third of that across
  (about 670 pixels); at 4096, about 1350. Three or four textures (colour, normals, occlusion
  with roughness and metal, emission if it glows) of 2048 pixels take 64 to 85 MB on the GPU with
  their mipmaps (21 MB each). The 36 maps the game could use from its tiles, as they come, would
  take 768 MB.
- Its displacement and subsurface scattering maps are left out (the normal map keeps the
  displacement's detail; glTF has no subsurface scattering). The report says so.
- About 130,000 triangles at full detail: the lower-detail copy is for the dragon circling high
  over its lair.
- It's 35 m long as it comes: `size` makes it what the game wants.
- Its fourteen clips as they're named in the file; the budget's `clips` fails the build (with
  `--strict`) if any is missing.

## Testing

```sh
npm test               # unit tests, and the whole pipeline on every example (needs Blender)
npm run test:browser   # every GLB in dist/ loaded and played in Three.js r186, in Chromium
```

- `npm test` builds every example and checks it's fit (no validator errors, every action
  there), that it's what `dist/` has (field for field; byte for byte when built by the same
  Blender as `dist/` was), and that it does what its config asks. It checks that each mistake in a
  config is said clearly. It needs Blender: `npm run setup` first.
- `npm run test:browser` loads each GLB with GLTFLoader and the meshopt decoder. It checks that
  every clip is there and moves the creature, and that the creature's size at rest and in motion
  is what the report says (the pipeline's skinning and Three.js's agree). It also checks that
  loops end as they start, that travel is what the report says (none, in place) and that it's
  drawn. For the UDIM creature, it checks each tile's colour is where its segment is on the baked
  atlas. Set `CHROMIUM_PATH` to use a Chromium you have (`/opt/pw-browsers/chromium` in Claude's
  cloud sessions).
- `python3 blender/test_atlas.py`: the atlas packer on its own (`npm test` runs it too).

These aren't part of the game's CI (Blender is a large download). Run them when you change
anything here. The game's `npm run lint` does lint this folder's JavaScript.

After changing the pipeline, `npm run build` and commit `dist/`: the tests check it's up to date.

## The examples

| Config | From | What it tests |
| --- | --- | --- |
| `dragon.json` | Mesh2Motion's dragon rig, and four of its animation files | Actions from other files, renamed; IK control bones, widgets and bones that move nothing left out; scaled to 9 m; a lower-detail copy; meshopt |
| `horse.json` | Mesh2Motion's horse rig, and thirteen animation files | Many clips; a tip bone kept (`keepBones`); a palette texture; root motion in a death and a getting up |
| `dragon-statue.json` | Mesh2Motion's unrigged dragon model | No skeleton; a mirror modifier applied; a texture beside the file, shrunk to 256 px JPEG; stood on its feet; quantized |
| `palette-crate.json` | A test crate (`fixtures/make_palette_crate.py`) | Two materials whose faces sit on points of a palette: baking can't sample them, so they're kept, not merged onto an atlas; joined into one draw call all the same |
| `udim-creature.json` | The test creature (`fixtures/make_udim_creature.py`) | Four UDIM tiles, a procedural metal horn with a bump and glowing eyes, three materials baked onto one 512 px atlas (colour, normals, occlusion with roughness and metal, emission); an action from another file; one left out, one renamed; a crawl's 1.5 m/s travel taken out; cameras, lights, a hidden collider, a widget and a control bone left out |
| `udim-creature-split.json` | The test creature | UDIM tiles split by the exporter instead; its warning for a material it can't carry unbaked; one clip kept; quantized |

The test creature and crate are made by scripts, so they're known exactly: what colour each tile
is, where each segment is, how fast it crawls.

## Limits

- One armature in an export (name the objects for one at a time).
- Only the armature's actions are exported: shape-key (morph) animation and objects' own
  animation are left out, and the report says which actions were.
- Textures are WebP, JPEG or PNG, so on the GPU they take their full size (no KTX2).
- The atlas gives each material and UDIM tile a rectangle round all its UVs. That keeps the
  artist's layout, but a tile that's mostly empty wastes its share.
- Baking is Cycles on the CPU: a large mesh with ambient occlusion at 4096 pixels takes minutes.
- In `udim: "split"`, UDIM tiles are copied as their files are: no shrinking, no change of format.
- A file saved by a newer Blender than the one running opens with a warning (Mesh2Motion's are
  saved by 5.1; this runs 4.5 LTS, and is tested with 5.0 too).

## Credits

The CC0 test models and animations in `examples/mesh2motion/` are Mesh2Motion's source art
(<https://github.com/Mesh2Motion/mesh2motion-assets>; `examples/mesh2motion/README.md`). The
test creature and crate are made by `fixtures/make_udim_creature.py` and
`fixtures/make_palette_crate.py`, part of this repository.
