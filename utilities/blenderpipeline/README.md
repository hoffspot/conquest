# The Blender pipeline

Turns `.blend` files, or FBX and glTF files as models for other engines come (Unity's, Unreal's,
Maya's), into game-ready GLB files for Pellagos's Three.js (r186): the mesh, its skeleton and
every animation, its materials baked onto one texture atlas when glTF can't carry them as they are
(UDIM tiles, procedural or mixed shaders, several materials on one mesh) or made from the texture
files that came with it, sized in metres and facing +z, compressed, checked with the Khronos glTF
Validator, and reported on. One config can build it several ways (*Profiles*, below): as it is,
at its full quality, to keep; and made small for play, on a phone and in a browser.

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
| `--profile <name>` | Builds only this profile of a config that has profiles (else every one, each into `<out>/<profile>/`) |
| `--out <dir>` | Writes there, not where the config says |
| `--blender <path>` | Runs this Blender (else `BLENDER`, then `BLENDER_PYTHON`, then `.venv`'s `bpy`) |
| `--strict` | Fails an asset that's over any of its budgets |
| `--keep` | Keeps the work in `<out>/.work/<name>/`: Blender's own GLB, its report and log, and every baked pass as a PNG, to look at |
| `--verbose` | Shows Blender's own output as it goes |
| `--fixtures` | Remakes the test fixtures (`fixtures/*.py`: the UDIM creature, the palette crate, the FBX creature) |

## What it does

**In Blender** (`blender/export.py`):

1. Opens the `.blend` (never running the Python it may carry), or imports an `.fbx`, `.glb` or
   `.gltf` into an empty scene (an FBX with its bones as they were made, not turned along their
   chains, so its clips play as made). It
   takes the "namespace:" off every name (`stripNamespaces`: Maya writes them, "Basemesh:pelvis").
   It makes the materials given from texture files (`materials`, *Materials from textures*,
   below). Then it picks what's exported: every mesh shown and rendered in the scene (or the
   `objects` or `collection` named), and the armature deforming them. Cameras, lights, hidden
   helpers, a rig's control objects (Maya's HumanIK) and bones' custom shapes (widgets) are left
   out. It joins the objects asked to be one mesh (`join`).
2. Brings in actions from other files (`actions`): a `.blend`'s by name (one clip a file, as
   Mesh2Motion keeps them, or a pack bought separately), or an `.fbx`'s, the clip moving its
   skeleton (an animation FBX, as Unity and Unreal packs have one for each clip: the skeleton it
   brings, and a control rig's clips, are left behind). It picks the armature's actions to export
   (`clips.include`, `clips.exclude`) and names them (`clips.rename`): every one that moves its
   bones, played or not, those an older Blender saved too (before 4.4, an action nothing played
   was kept for no kind of thing: it's claimed for the armature). Each becomes one glTF
   animation, sampled frame by frame with its constraints (IK and all) worked out.
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
5. Shrinks any other texture larger than `textures.maxSize` (`null`: none), and writes WebP (or
   JPEG, or PNG; PNG too for KTX2, which Node makes).
   With a normal map, it writes MikkTSpace tangents too (cutting n-gons into triangles), so
   Three.js shades it as it was baked.
6. Writes each variant's materials (`variants`, *Variants*, below): the model with them on, for
   Node to keep only the materials of.

**In Node** (`lib/optimize.js`):

1. Mends tangents that aren't a unit long. MikkTSpace gives none where a triangle's UVs have no
   area, as a few of a bought model's may (the Dreadthorn Dragon has 8 of its 82,905): the
   validator counts each as an error, and a normal map shades it as a black speck. Each gets a
   direction along the surface instead; the report says how many (`exported.tangentsMended`).
2. Turns it (`turn`) to face +z, sizes it in metres (`size`), stands it on its origin
   (`origin: "feet"`). All are baked into the data, skinned meshes included, not put on a node
   over it.
3. Makes up the clips it's asked for (`clips.invent`, `lib/invent.js`) from those there are: a
   stretch of one, with bones turned or moved over it, eased from key to key, or with their motion
   taken from another clip. A bite is an idle with the neck thrown forward and the jaw snapped
   shut; a death, a flinch held still while the body sinks and rolls (*Clips made up*, below).
4. Measures each clip's root motion (the bone carried across the ground, how far, how fast), and
   takes it out of the clips to be played in place (`clips.inPlace`): the drift from start to
   end, spread evenly, comes off the root bone; its sway and bounce stay. The report gives the
   speed, so the game can match a clip's playing speed to how fast the creature moves.
5. Thins the clips to `clips.fps` keyframes a second, if it's asked (a 60-frame source's at 30:
   at each 1/30 of a second, the nearest keyframe), always keeping each clip's last, so it keeps
   its length and a loop still meets its start; the report says how many went
   (`exported.keyframesThinned`). (Blender's own frame step stops short of a clip's last frame
   where its length isn't a multiple of the step: the centipede's 0.75-second run stopped at
   0.73.) Then takes out keyframes a straight line gives anyway, duplicates, and anything unused
   (a texture of one colour becomes the material's colour), and the material extensions the game
   doesn't draw (`stripMaterialExtensions`). A mesh's parts that share a material are joined into
   one draw call (separate objects keep their names).
6. Leaves out every channel that holds a bone where it stands at rest (`clips.trimStill`): a
   clip need only say what moves, and a baked rig keys every bone in every clip. Three.js holds a
   bone no clip moves where it stands.
7. Encodes the textures as KTX2 (`textures.format: "ktx2"`, `lib/ktx2.js`), which the GPU keeps
   compressed: a 2048-pixel texture takes 4 to 5 MB on a phone's GPU, mipmaps and all, where a
   WebP takes 21 MB once decoded. Each is encoded as what it's used for: colour (sRGB) and data
   (occlusion, roughness, metal) in ETC1S, small; normals in UASTC, sharper (`textures.ktx2`).
   Each is made a power of two on each side first, the nearest (1024 x 907 is made 1024 x 1024),
   no more than `maxSize`: the GPU's compressed formats are made of 4 x 4 blocks, and a texture,
   or a mipmap of it, whose sides aren't can't be relied on (Three.js warns of it, and drew a fur
   whose sides weren't black). Encoding is in WebAssembly ([ktx2-encoder](https://github.com/gz65555/ktx2-encoder), Basis
   Universal), so it needs nothing installed.
8. Works out whether each clip loops, and how far out the creature reaches at any moment of any
   clip (for culling).
9. Packs the lower-detail copies (`lods`) into the same GLB when `packLods` is set: each a mesh
   of its own beside the full one ("<mesh>.lod1"..., `extras.lod`), on the same skeleton, with
   the same materials, textures and clips, which otherwise each copy's file carries again. Then
   simplifies the full mesh itself, if `simplify` asks.
10. Validates it with the glTF Validator, before it's compressed (the validator can't read
    meshopt's compression) and after.
11. Makes lower-detail copies as files of their own (`lods`, without `packLods`), and compresses
    (`compress`).
12. Makes each variant's file: its materials alone, with only the textures it gives, made as the
    model's are (KTX2 and all); no meshes, skeleton or clips.

Then it reads the GLB back as the game would, and writes `<name>.report.json` beside it.

Builds are reproducible: the same sources, config and Blender make the same bytes.

## An asset's config

A JSON file; paths are relative to it. Only `source` is needed. A setting it doesn't know is an
error, so a misspelt one isn't silently ignored.

| Setting | Default | What it is |
| --- | --- | --- |
| `source` | | The `.blend`, `.fbx`, `.glb` or `.gltf` |
| `name` | the config file's name | The files written: `<name>.glb`, `<name>.report.json`, `<name>.lod1.glb`, `<name>.<variant>.glb`... |
| `out` | `"dist"` | Where to write (a profile's: `<out>/<profile>/`) |
| `stripNamespaces` | `true` | "namespace:" taken off the names of objects, bones, materials, images and actions, in the source and the actions brought in |
| `objects` / `collection` | all shown meshes | What to export, by name |
| `join` | `{}` | `{ "Body": ["Body", "Teeth*"] }`: objects joined into one mesh each, named so (one draw call for each material in it; a group kept apart can be shown or hidden on its own). The first named is the one the others join |
| `materials` | `{}` | Materials made from texture files, in place of the source's of these names (*Materials from textures*, below) |
| `variants` | `{}` | `{ "pale": { "materials": { "skin": { ... } } } }`: other looks, each `<name>.<variant>.glb` (*Variants*, below) |
| `profiles` | `{}` | `{ "full": { ... }, "phone": { ... } }`: ways to build it, each a set of these settings merged over the rest, into `<out>/<profile>/` (*Profiles*, below) |
| `actions` | `[]` | `[{ "from": "other.blend", "action": "Walk", "name": "Crawling" }]`: actions to bring in (`action` left out: all of that file's); or `{ "from": "Wolf@walk.fbx", "name": "Walk" }`: an FBX's clip that moves its skeleton |
| `clips.include` / `clips.exclude` | all / none | Which actions are exported (names; `*` and `?` wildcards) |
| `clips.rename` | `{}` | `{ "Blender name": "clip name" }` |
| `clips.inPlace` | `[]` | Clips to play in place (names, or `true` for all) |
| `clips.rootBone` | the topmost bone that's carried | The bone carrying the creature's travel |
| `clips.trimStill` | `false` | Leaves out channels that never move a bone from where it stands at rest |
| `clips.fps` | `null` | Keeps this many keyframes a second (a 60-frame source's at 30: half of them), and each clip's last, not every frame's |
| `clips.invent` | `[]` | Clips made up from those there are (*Clips made up*, below) |
| `deformBonesOnly` | `true` | Only bones that deform the mesh (above) |
| `keepBones` | `[]` | Bones to keep even if they move nothing (points to attach things to: a mouth for fire, a claw for footprints) |
| `applyModifiers` | `true` | Applies modifiers (mirror, subdivision...) except the armature |
| `textures.bake` | `"auto"` | `"auto"`: bake what glTF can't carry; `"always"`; `"never"` |
| `textures.udim` | `"atlas"` | UDIM tiles baked onto the atlas, or `"split"`: Blender's exporter's way, a material and textures for each tile, copied from their files as they are |
| `textures.mergeMaterials` | `true` | Several materials on one mesh baked into one (one draw call) |
| `textures.atlasSize` | `1024` | The atlas's largest size (pixels) |
| `textures.maxSize` | `1024` | The largest any other texture is kept at (`null`: as it is) |
| `textures.format` | `"webp"` | `"webp"`, `"jpeg"`, `"png"` or `"ktx2"` (KHR_texture_basisu: kept compressed on the GPU; Three.js reads it with KTX2Loader) |
| `textures.ktx2` | `{ "color": "etc1s", "data": "etc1s", "normal": "uastc", "quality": 128, "normalSize": null }` | For KTX2: each kind of map `"etc1s"` (small, blockier) or `"uastc"` (sharper, 4 to 5 times the size); ETC1S's quality (1 to 255); the largest a normal map's kept at (pixels; `null`: as the rest) |
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
| `packLods` | `false` | The lower-detail copies in the one GLB, beside the full mesh, sharing everything else, not files of their own |
| `simplify` | `null` | `{ "ratio": 0.3, "error": 0.01 }`: the full mesh itself simplified, when even it is more than the game wants (the copies' ratios stay shares of what Blender gave) |
| `budgets` | `{}` | Limits it's checked against: `triangles`, `vertices`, `joints`, `drawCalls`, `textureSize`, `textureMegabytes` (on the GPU, with mipmaps), `kilobytes` (the GLB), `clips` (names it must have) |

## Materials from textures

A bought model's FBX names its textures but doesn't carry them, and they come beside it, made for
the engine it was sold for (Unity's packed maps, Unreal's normal maps). `materials` makes each
material from its files, in place of the source's of that name:

```json
"materials": {
    "skin": {
        "baseColor": "Textures/Skin_Albedo.tga",
        "normal": "Textures/Skin_Normal.tga",
        "occlusion": "Textures/Skin_Occlusion.tga",
        "roughness": { "file": "Textures/Skin_MetallicSmoothness.tga", "channel": "A", "scale": 0.8, "invert": true },
        "metallic": 0,
        "emission": "Textures/Skin_Emission.tga",
        "emissionStrength": 2
    },
    "fur": { "baseColor": "Textures/Fur.tga", "alpha": "mask", "roughness": 0.9, "doubleSided": true }
}
```

| Map | What it is | Taken as |
| --- | --- | --- |
| `baseColor` | The colour (sRGB), and its alpha for `alpha` | A file |
| `alpha` | `"opaque"` (the default), `"mask"` (cut off at a half: fur, leaves, lace) or `"blend"` | |
| `alphaMap` | Its alpha from another file instead of the colour's own | One channel |
| `normal` | Tangent space; `"flipGreen": true` for DirectX's (Unreal's), as glTF's are OpenGL's | A file |
| `occlusion`, `roughness`, `metallic` | Packed into one texture, red, green and blue, as glTF has them, when any is a file; roughness and metal may each be a number for the whole material instead | One channel |
| `emission` | What glows (sRGB), as strong as `emissionStrength` (default 1) | A file |
| `doubleSided` | Drawn from both sides (fur cards, leaves); `false` by default | |

A map is a file, or `{ "file", "channel", "scale", "invert" }` to take one channel of one:
`"channel"` is `R` (the default), `G`, `B` or `A`; `"scale"` multiplies it (0 to 1); and `"invert":
true` turns it over (Unity keeps smoothness, glTF roughness). Unity's roughness is `1 - smoothness
x _GlossMapScale`: its material's `_GlossMapScale` is the scale. (Check a bought model's own
roughness files before using them: they may be empty, every pixel black.) Each file is shrunk to `textures.maxSize` before it's read, once however many
maps take from it, and the report says what each material was made from
(`exported.materialsFromTextures`).

## Variants

Other looks for the same model: another skin, its fur another colour. Each is written as
`<name>.<variant>.glb`, holding only its materials, and in them only the textures it gives:

```json
"variants": {
    "ash": { "materials": { "skin": { "baseColor": "Textures/Skin_Ash_Albedo.tga" }, "fur": { "baseColor": "Textures/Fur_Ash.tga" } } }
}
```

Its materials are made as `materials` makes them (a variant gives what differs: the rest stays
the model's), and its textures as the model's are (shrunk, KTX2 and all), so a look costs only
its own textures: a 1024-pixel colour map in KTX2 is about 300 KB. The game puts each variant
material's textures on the model's material of the same name (*Using it in the game*, below).
Different amounts of a model (its fur, its armour) are objects kept apart (`join`), shown or
hidden in the game: they cost nothing more to download.

## Profiles

One config can build the model several ways, each a set of settings merged over the rest, into a
folder of its own: first as it is, at its full quality, to keep and to come back to; then made for
play, small enough for a phone and a browser.

```json
"profiles": {
    "full": {
        "textures": { "maxSize": null, "format": "png" },
        "compress": "none",
        "resample": 0
    },
    "phone": {
        "textures": { "maxSize": 1024, "format": "ktx2" },
        "lods": [{ "ratio": 0.3, "error": 0.03 }],
        "packLods": true,
        "clips": { "trimStill": true },
        "budgets": { "triangles": 20000, "drawCalls": 3, "textureSize": 1024, "textureMegabytes": 6 }
    }
}
```

- **`full`** keeps everything: its textures at their own size (`maxSize: null`), losslessly
  (PNG), its mesh uncompressed (`compress: "none"`) and every keyframe (`resample: 0`). It's
  what the asset is, in glTF: to look at, to compare a play build with, and to make other
  profiles from later without the source to hand.
- **`phone`** is made for play: textures the GPU keeps compressed (KTX2, at most 1024 pixels),
  lower-detail copies packed in, compressed geometry, the channels that don't move left out, and
  budgets it must keep within (`--strict` fails it otherwise).
- Others as the game needs them (`desktop`, with 2048-pixel textures, say).

The game ships one play build of a model for every device, phones and all: it reads a model's
file once and every creature drawn from it shares its mesh and textures, so ten cost the GPU
what one does, and the lower-detail copies packed in draw the far ones. A bought creature of 16,000
triangles with seven 1024-pixel KTX2 textures is a 3 MB file and 9 MB on the GPU; at 512 pixels,
1.3 MB and 2 MB, a saving too small to keep two builds for.

`node build.js my-asset.json` builds every profile, into `<out>/full/` and `<out>/phone/`;
`--profile phone` only that one. A profile can't have its own `source`, `name` or `out`: they're
the asset's.

## What you get

`dist/<name>.glb`, its lower-detail copies, its variants (`<name>.<variant>.glb`), and
`dist/<name>.report.json`; for a config with profiles, each of them in `dist/<profile>/`:

- `meshes`: draw calls, vertices, triangles, joints and influences a vertex (of the full mesh);
- `lods`: each lower-detail copy's file and size, or, packed in, its level, meshes and triangles;
- `materials` and `textures`: each texture's size, format, kilobytes and GPU megabytes;
- `clips`: each clip's length, whether it loops, its root motion (bone, distance, speed,
  direction) and whether that was taken out, and the file it came from (or, made up, the clip
  it was made from: `madeFrom`);
- `bounds`: its box at rest, its box over every clip, and how far from its origin it ever reaches;
- `variants`: each variant's file and size, its materials and the textures in them;
- `exported`: what Blender exported, how each mesh was baked and why, what was left out, the
  channels left out for not moving, each texture made KTX2 (its kind, mode, size and bytes), the
  materials made from texture files and from which (`materialsFromTextures`), and the objects
  joined (`joined`);
- `profile`, `built` (Blender, its glTF exporter, and the source's format), `budgets`,
  `validation`, `notes` and `warnings`.

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
- **KTX2 textures** need Three.js's `KTX2Loader` and the Basis transcoder (`libs/basis/`), told the
  renderer: `new GLTFLoader().setKTX2Loader(new KTX2Loader().setTranscoderPath(path).detectSupport(renderer))`.
  The transcoder turns each texture into the GPU's own compressed format (ASTC on most phones, BC7
  on desktops, ETC2 elsewhere), in a worker. The game's loader does this already
  (`readKtx2With` in `client/js/world/art/engine/models.js`).
- **Packed lower detail** loads as meshes beside the full one, each with `userData.lod` (1, 2...):
  show one level at a time (`mesh.visible`), as the viewer's `lod(level)` does.
- **A variant** has materials and nothing else. Read it as the model is, and put its textures on
  the model's material of the same name (a copy, so the model's own stays for the others):

  ```js
  const look = await loadGltf("models/werewolf.ash.glb");
  const materials = await look.parser.getDependencies("material");

  scene.traverse((node) => {
      const own = node.isMesh && materials.find((material) => material.name === node.material.name);

      if (own) {
          node.material = node.material.clone();

          for (const map of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) {
              if (own[map]) {
                  node.material[map] = own[map];
              }
          }
      }
  });
  ```
- **Objects kept apart** (`join`) are meshes of their own by those names: hide one
  (`scene.getObjectByName("Mane").visible = false`) for a look with less of it.

## Clips made up

A bought model rarely has every clip a game wants: the Dreadthorn Dragon came with fourteen,
none of them a bite or a death. `clips.invent` makes them from those it has, after it's turned
and sized, so turns are the creature's own and moves are in metres:

```json
"invent": [
    { "name": "Bite", "from": "Idling", "start": 1, "seconds": 1.6, "layers": [
        { "bones": ["Neck", "Neck.001", "Neck.002"], "turn": "pitch", "keys": [[0, 0], [0.45, 3], [0.72, -2], [1.6, 0]] },
        { "bones": ["Jaw"], "turn": "pitch", "keys": [[0, 0], [0.62, -34], [0.76, 0]] },
        { "bone": "Hip", "move": [[0, [0, 0, 0]], [0.72, [0, -0.05, 0.45]], [1.6, [0, 0, 0]]] }
    ] }
]
```

- **`from`**, **`start`** and **`seconds`**: the stretch of a clip it's made from (by default
  all of it). **`hold`**: seconds in, from which that clip is held still (a death: the flinch
  held while the body falls).
- **A turn** (`bones`, `turn`, `keys`: `[seconds, degrees]`): each bone turned so many degrees,
  eased from key to key, about the creature's axes as the bone lies where the stretch starts.
  `pitch` raises the bone's tip (nose up, tail down), `yaw` turns it to the creature's left,
  `roll` turns it about the way the creature faces (its right side down), and `lift` raises its
  tip whichever way it points (a wing held out to the side). `weights`: a weight for each bone
  (a share of the degrees); `lag`: seconds each bone is held back on the one before it, as a tail
  whips; `axes`: seconds into the clip made, to take the bone's axes as it lies then (after the
  layers before this one: a wing spread by a graft, then laid down), not where the stretch starts.
- **A move** (`bone`, `move`: `[seconds, [left, up, forward]]`): metres along the creature's
  axes, added to where the clip has the bone (the hips lunging, sinking).
- **A graft** (`graft`, `bones`, `start`): those bones moved as another clip moves them (a
  hover's wings with a breath's neck). `keys` (`[seconds, share]`, 0 to 1): only that share of
  the other clip's motion, eased from key to key (a folded wing spread as the body falls); none,
  all of it.

The report says which clip each was made from (`madeFrom`). Check them by eye in the viewer, and
with the browser tests (each moves, stays inside its bounds).

## For a bought asset

**Its licence first.** This repository is public, and its rule is that assets in it are CC0, MIT
or similarly permissive (contribution.md, section 3). A bought model's files, and what's built from
them, don't go in it. Put them in `private/` here, which git ignores: the source, its config and
what's built. What the game draws of it is scrambled and kept in the private repository
`hoffspot/conquest-models`, which the game's builds fetch (`docs/LICENSED_MODELS.md`, at the top of
the repository: the owner's call, with the seller's permission, never a contributor's).

**From Unity or Unreal.** A model sold for another engine comes as FBX files: the model (its
skeleton in it), an FBX for each clip, and its textures beside them, made for that engine. Build
from them as they are: `source` the model's FBX, `actions` each clip's (`{ "from":
"Animations/Wolf@walk.fbx", "name": "Walk" }`), `materials` its textures (*Materials from
textures*, above: Unity's smoothness inverted, Unreal's normal maps' green flipped). A Unity
package (`.unitypackage`) is a gzipped tar: `mkdir pack && tar -xzf Wolf.unitypackage -C pack`,
then each folder in it is one file, `asset` (the file) beside `pathname` (where it was), and its
materials (`.mat`) say which texture is which (`_MainTex` the colour, `_BumpMap` the normals,
`_MetallicGlossMap` metal in red and smoothness in alpha, scaled by `_GlossMapScale`,
`_OcclusionMap`, `_EmissionMap`). Maya's
own files (`.mb`) don't open in Blender: the FBX is what's needed. And give it `profiles`: `full`
to keep it as bought, and one for play.

```text
private/
  dreadthorn/                  the asset as bought (unzipped)
  dreadthorn.json              its config ("out": "out")
  out/                         what's built
```

Its config, as built (`private/dreadthorn.json`). The dragon comes as two `.blend` files: use
`Dragon_Animation-baked.blend`, whose wings, tail and tongue have their dynamics baked into the
clips. The other works them out as it plays, and run without a window its drivers don't (172 of
them invalid) and its constraints go round in circles (66 dependency cycles): the seller's manual
says to bake them before exporting. It was modelled facing +y, so it's turned round:

```json
{
    "source": "dreadthorn/Dragon_Animation-baked.blend",
    "out": "out",
    "clips": {
        "rename": {
            "Animation_Idling": "Idling",
            "Animation_Crawling": "Crawling",
            "Animation_CrawlingLeft": "Crawling Left",
            "Animation_CrawlingRight": "Crawling Right",
            "Animation_Roar": "Roar",
            "Animation_GlidingFireBreath": "Breathing Fire",
            "Animation_HitReact": "Hit React",
            "Animation_TakeOff": "Take off",
            "Animation_Landing": "Landing",
            "Animation_Flying": "Flying",
            "Animation_FlyingLeft": "Flying Left",
            "Animation_FlyingRight": "Flying Right",
            "Animation_Gliding": "Gliding",
            "Animation_Hovering": "Hovering"
        },
        "inPlace": ["Crawling*"]
    },
    "keepBones": ["Jaw"],
    "textures": { "atlasSize": 2048, "maxSize": 2048, "format": "webp", "quality": 90 },
    "turn": 180,
    "size": { "length": 10 },
    "origin": "feet",
    "lods": [{ "ratio": 0.25, "error": 0.02 }],
    "budgets": {
        "triangles": 140000,
        "drawCalls": 1,
        "textureSize": 2048,
        "clips": ["Idling", "Crawling", "Crawling Left", "Crawling Right", "Roar", "Breathing Fire", "Hit React", "Take off", "Landing", "Flying", "Flying Left", "Flying Right", "Gliding", "Hovering"]
    }
}
```

What it makes (Blender 4.5.14 LTS, about 4.5 minutes, most of it baking):

- One mesh of 137,101 triangles and 180 joints, in one draw call; its lower-detail copy (34,266
  triangles) is for the dragon circling high over its lair. The GLB is 9.2 MB, most of it
  textures.
- Its nine 2K UDIM tiles become one atlas: at 2048 pixels each tile gets a third of that across
  (about 670 pixels). Its colour, normals, and occlusion with roughness take 64 MB on the GPU
  with their mipmaps (21 MB each); the 36 maps the game could use from its tiles, as they come,
  would take 768 MB. `textures.maxSize` is raised with `atlasSize`, or the atlas is shrunk to
  the default 1024.
- Its displacement and subsurface scattering maps are left out (the normal map keeps the
  displacement's detail; glTF has no subsurface scattering). The report says so.
- 8 of its tangents are mended (UVs with no area on a seam).
- It's 22 m long with a 35 m wingspan as it comes: at 10 m long, its wings span 16 m.
- Its fourteen clips, 8 s each. None ends quite as it starts, so the report calls none a loop:
  Idling, Roar, Hit React and Breathing Fire come back to within 6 degrees (the head, jaw and
  toes), the flying clips within 14 degrees (the toes), the crawls within 20 (the wing
  membranes). Played looped, each has a small hitch there. Take off and Landing play once. The crawls stay in place
  as they come, so the game moves the dragon itself.

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
| `udim-creature-phone.json` | The test creature | KTX2: colour, occlusion with roughness and metal, and emission in ETC1S, normals in UASTC shrunk to 256 px; still channels left out |
| `dragon-phone.json` | Mesh2Motion's dragon, as `dragon.json` | Made for phones: KTX2, still channels left out, the full mesh simplified to 70%, and two lower-detail copies packed into the one GLB; two clips made up from its idle, a bite and a death (`clips.invent`) |
| `fbx-creature.json` | The FBX test creature (`fixtures/make_fbx_creature.py`), as a bought asset for another engine comes | From FBX: namespaces taken off, a rig's control object and its clip left out, a clip from an animation FBX; objects joined (body and teeth) and kept apart (fur, mane); materials made from texture files (occlusion, roughness from scaled and inverted smoothness, and metal packed into one; a fur mask; glowing eyes); a variant (another colour for the skin); two profiles, `full` (PNG at its own size, uncompressed) and `phone` (64 px KTX2, meshopt, a lower detail packed in, budgets), into `dist/full/` and `dist/phone/` |

The test creature and crate are made by scripts, so they're known exactly: what colour each tile
is, where each segment is, how fast it crawls.

## Limits

- One armature in an export (name the objects for one at a time).
- From an FBX: the clips as the FBX has them baked. A rig's constraints and controls (Maya's
  HumanIK, a Unity Animator) aren't in it, so a clip that needs them has to be baked onto the
  skeleton when it's exported (`Bake Animation`).
- A variant is a material's textures and nothing else: its own mesh or skeleton can't be.
- Only the armature's actions are exported: shape-key (morph) animation and objects' own
  animation are left out, and the report says which actions were.
- WebP, JPEG and PNG textures take their full size on the GPU; KTX2 doesn't, but takes longer to
  build (a 2048-pixel texture: about 20 s in ETC1S, a few minutes in UASTC).
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
