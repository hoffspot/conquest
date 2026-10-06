# MakeHuman's clothes on the game's bodies: the plan

A living plan, like `asset_streaming_plan.md`: updated as each milestone lands and as measurements
come in. The [change log](#10-change-log) at the end records every change and why. Nothing here is
built yet.

**Goal.** Widen the wardrobe beyond what the game builds itself, with MakeHuman's openly licensed
clothes. Each one should follow every body slider, work on both bodies (MakeHuman's and
Vitruvian's), and fit within the phone budget, without making the first download any bigger.

**Constraints.**
- Only CC0, or CC-BY with a credit (contribution.md, section 3, rule 8). Nothing non-commercial,
  no-derivatives or AGPL. Each asset has its licence file and its credit in `README.md`.
- The game runs well on an iPhone 16 Pro (contribution.md). A character's draw calls and textures
  are what it costs.
- No build step in the browser: the game loads prepared data, as it does the bodies
  (`scripts/build-characters.js`, `scripts/build-vitruvian.js`).
- Both bodies, and every slider on each (`client/js/characters/body.js`, `GAME_BODY`).

---

## 0. Decisions: the paradigm in brief

1. **Imported at build time, never at run time.** A script, `scripts/build-clothes.js`, reads
   MakeHuman's files (`.mhclo`, `.obj`, `.mhmat`) and writes game data, as the bodies' build
   scripts do. The browser never parses a MakeHuman file.
2. **Bound to the game's own skin, not to MakeHuman's base mesh.** MakeHuman ties each clothing
   vertex to three vertices of its full base mesh, helpers included. The game keeps only the body,
   eyes and eyelashes (`PARTS` in `build-characters.js`: "MakeHuman's tights and scalp helpers
   aren't needed"). So each garment vertex is placed once, on MakeHuman's default body, and then
   bound again to a triangle of the game's body: where on it, and how far off it, along its
   normal. A garment bound that way follows every slider for free, because sliders move the
   body's vertices (`body.js`). Through the MakeHuman-to-Vitruvian fit the game already has, it
   follows Vitruvian's body too.
3. **Weights from the body.** A garment vertex bends as the skin it's bound to: the bound
   triangle's weights, blended. That's what MPFB2 does from MakeHuman's own vertices
   (`interpolate_weights`), and what the game's generated garments already do.
4. **A garment of its own kind, beside the generated ones.** An imported garment has its own
   texture coordinates and pictures. It can't be painted into the body's texture layout as the
   generated ones are (`compositeGarments`), so it's a draw call of its own, with its own
   material. It goes in the same slots (`SLOTS` in `equipment.js`) and layers, and hides the skin
   under it, as generated garments do.
5. **Downloaded when it's wanted.** Imported clothes are heavier than generated ones (their own
   meshes and pictures), so they go in the asset catalog (`client/models/assets.json`, the asset
   streaming plan), never in what's downloaded before the game starts. Until one arrives, its
   wearer wears a generated stand-in from the same slot.
6. **Budgets the build enforces:** triangles, texture size and bytes for each garment, with
   lower-detail copies for crowds. Over budget, the build fails and says why, as the Blender
   pipeline's report does.

---

## 1. What MakeHuman's clothes are

Read from MPFB2's own code (`src/mpfb/entities/clothes/mhclo.py` and
`src/mpfb/services/clothesservice.py`, at github.com/makehumancommunity/mpfb2).

**Files.** Each item has three:
- `<name>.mhclo`, the binding (below);
- `<name>.obj`, the mesh, with texture coordinates;
- `<name>.mhmat`, the material: diffuse, normal and other maps, and shader settings.

Most also have a thumbnail.

**The `.mhclo` file**, line by line:

| Key | Meaning |
| --- | --- |
| `name`, `uuid`, `tag` | What it is |
| `obj_file`, `material` | Its mesh and material |
| `# author …`, `# license …` | Comments, but they're where the author and licence are given. MPFB2 assumes CC0 unless a licence line says BY or AGPL |
| `x_scale a b d`, `y_scale …`, `z_scale …` | Two base-mesh vertices on each axis, and the distance between them that its offsets were measured at |
| `z_depth n` | Its layer: what's worn over what |
| `vertexboneweights_file` | Rare: weights of its own, instead of the base mesh's |
| `verts 0`, then one line per vertex | Either one base-mesh vertex index (it sits on that vertex), or nine numbers: three vertex indices, three weights and three offsets |
| `delete_verts`, then indices (`a - b` for a range) | Base-mesh vertices hidden under it |

**Where a vertex goes.** On MakeHuman's base mesh `V`, in MakeHuman's own coordinates (y up,
decimetres):

`p = w₀·V[i₀] + w₁·V[i₁] + w₂·V[i₂] + (d₀·sx, d₁·sy, d₂·sz)`

Each axis's scale is the distance between that axis's two vertices on this body, over the
recorded distance: `sx = |V[a].x − V[b].x| / d`. (MPFB2 swaps the offsets' axes into Blender's
z-up, `(d₀, −d₂, d₁)`; in MakeHuman's own frame they're as written.)

**Hidden skin.** MPFB2 hides only the faces all of whose vertices are listed
(`_conservative_mask`), so a garment's edge never shows a gap.

**The helpers.** MakeHuman's base mesh includes helper geometry: tights, a skirt and a scalp
shape. Many clothes are bound to those rather than to the skin, notably trousers and skirts. The
game's body data has no helpers, which is why decision 2 binds everything again to the skin.

---

## 2. Where the clothes come from

MakeHuman's asset packs: <https://static.makehumancommunity.org/assets/assetpacks.html> (reachable
from cloud sessions). Each pack's page lists every item with its author and licence. The ones a
medieval fantasy world can use:

| Pack | Licence | Worth a look |
| --- | --- | --- |
| Suits 02 | CC0 | Monk's robe, with its hood up, down or off (Donitz); Viking tunic, trousers and boots (RehmanPolanski); hero and heroine suits (culturalibre) |
| Dress 01 | CC0 | Mycenaean tunic (WDG); kimono (Mindfront); gowns (Margaret Toigo) |
| Shoes 01 | CC0 | Hero and heroine boots (culturalibre); pirate boots (grinsegold); ankle boots, cloth shoes (Toigo) |
| Hats 02 | CC0 | Warrior, Corinthian and Templar knight's helmets |
| Gloves 01, Hats 01, Masks 01, Skirts 01, Pants 01 | CC0 | To survey |
| Suits 03 | CC-BY | Wizard's robe (MaciekG) |
| Dress 02, Dress 03, Shirts 02, Shirts 03 (tunics), Shoes 03 (boots), Hats 03, Hats 04 (helmets), Skirts 02 | CC-BY | To survey |
| MakeHuman system assets | CC0 | Proxies, eyes, teeth, and a few modern clothes |

Most of MakeHuman's clothes are modern: jeans, suits, trainers. What suits this world is a smaller
set, mostly from community authors, so the first milestone is a survey (§7, C1).

**Making new ones.** MPFB2 has a clothes maker in Blender (*MakeClothes*:
`src/mpfb/ui/create_assets/makeclothes/`). It binds a mesh modelled over MakeHuman's base and
writes a `.mhclo`. Clothes made that way come in through the same importer, so the owner can add
pieces the packs don't have. A bought garment never goes in the repository
(`utilities/blenderpipeline/private/`).

---

## 3. What the game has now, and what it would add

| Kind | How it's made now | What importing adds |
| --- | --- | --- |
| Garments that wrap the body: shirts, tunics, trousers, boots, mail, plate | Regions of the body cut and pushed out (`garments.js`), painted into the body's texture layout | Seams, collars, folds and details a smooth shell can't have (a Viking tunic, a Mycenaean tunic) |
| Clothes that hang: skirts, gowns, aprons, cloaks | Rings of cloth from the waist, or the shoulders for cloaks (`drapes.js`: `travelCloak`, each people's `cloak.<people>`) | Gowns and robes with sleeves and bodices |
| Hoods | None | The monk's robe's hood, up or down |
| Helmets and hats | Rigid models on the head socket (`items.js`: `nasalHelm`, `orcHelm`, `wizardHat`…) | More helmets. These could stay rigid items (§4.6) |

So the importer's value is detail and kinds the builders can't describe. The generated garments
stay the backbone: light, recolourable by people (`liveries.js`), and drawn in one picture.

---

## 4. The importer (build time)

`npm run build:clothes -- --from=<folder of MakeHuman items> --mpfb2=../mpfb2`. It needs MPFB2 for
the base mesh and its targets, as `build:characters` does, and writes to `client/characters/clothes/`.

### 4.1 Reading
- Parse `.mhclo` (§1), `.obj` (quads into triangles; `parseObj` in `build-characters.js` already
  reads OBJ) and `.mhmat`.
- **Licence:** refuse anything that isn't CC0 or CC-BY. Each item's licence, author and source
  go into a credits list the build writes, for `README.md`.

### 4.2 Placing on MakeHuman's default body
The full base mesh, helpers and all, from MPFB2's `3dobjs/base.obj`, at the default shape (the
same one `build-characters.js` starts from). Each vertex goes where §1's formula puts it.

**Checked against MPFB2 itself:** load the same item on a default MakeHuman in Blender with MPFB2,
export, and compare vertex by vertex (within 0.1 mm). The repo's Blender (`utilities/blenderpipeline`,
bpy 4.5) can run MPFB2 headless for this, once, recording the numbers as a test fixture.

### 4.3 Binding again, to the game's skin
For each garment vertex, the nearest point of the game's body (body triangles only) that faces
the same way gives:
- the triangle it's on, and the barycentric weights within it;
- an offset in the triangle's own frame: along its normal, and along two directions in its plane.
  The frame is made the same way at run time from the shaped body, so the offset turns with the
  skin.

`build-vitruvian.js` already has the hardest part: `nearestPoints`, the nearest point of a set of
triangles facing the same way. The importer should share it (`scripts/lib/`), not copy it, and
add the frame.

- **On MakeHuman's body:** bound directly.
- **On Vitruvian's:** each garment vertex is first carried as its nearest MakeHuman point moves
  when MakeHuman's body is fitted onto Vitruvian's (`fitOnto`, as the Vitruvian build does). It's
  then bound to Vitruvian's skin the same way. Each garment keeps one binding per body (`BODIES`),
  and the game reads the one for `GAME_BODY`.
- **Loose clothes** (skirts, robes' hems, hoods) are far from the skin. Bound to the nearest skin,
  a hem would follow the thigh it's nearest and tear between the legs. These need weights spread
  over more bones (§4.4), or binding to the drapes' own bones (`DRAPE_BONES` in `drapes.js`) for
  the parts below the hips. To prove on one item in C2 before any more.
- **Checked:** at the default shape, every vertex comes back within 0.5 mm of where §4.2 put it.
  At each motion-check body (thinnest, shortest, bulkiest, tallest: `motioncheck.js`), no vertex
  is inside the skin by more than the garment's thickness.

### 4.4 Weights
The bound triangle's three vertices' four strongest bone weights, blended by the barycentric
weights and cut back to four, as the body keeps them. Options for each item, in its manifest
entry:
- `"stiff": ["head", "neck"]`: a hood moves with the head and neck, not the shoulders' skin;
- `"hang": true`: below the hips, weights eased onto the pelvis and both thighs, as drapes do, so
  a robe doesn't split.

### 4.5 Hidden skin, and layers
- `delete_verts`: MakeHuman's indices, then the game's (the build's `sourceOf` map for
  MakeHuman's body; the nearest-point carry for Vitruvian's). Hide only triangles all of whose
  vertices are listed (MPFB2's conservative mask), giving the body triangles it covers, as
  generated garments give (`covers`).
- `z_depth`: the game's layers (underwear, clothing, mid layer, armour, belts, straps; 0 to 5 in
  `garments.js`), by a table the survey settles. Each item can also be given its slot and layer
  outright.

### 4.6 Rigid pieces
Helmets bound only to the head are better as items on the head socket (`items.js`): one rigid
mesh, with no weights or binding. The importer can write them that way:
- the mesh, in the head bone's frame at the default shape;
- the socket and `hides: ["hair"]` (`equipment.js` `ITEMS`).

### 4.7 Pictures, and colour
- **Pictures:** the `.mhmat`'s diffuse (and normal, where there is one), scaled to the budget
  (512 or 1024) and written as WebP. Node has no WebP encoder among the project's packages. Either
  add one (`sharp` is native code and fast, a WebAssembly encoder is portable), or have the
  Blender pipeline's export, which already writes WebP, do it. Decide in C2.
- **Colour:** each people's colours (`liveries.js`) recolour the generated garments. An imported
  one can be tinted the same way only where a mask says so, so the importer can write one: the
  diffuse's least saturated regions, or a mask drawn by hand for each item. Until then, imported
  clothes keep their own colours.

### 4.8 Budgets, and copies with less detail
- **Each garment:** at most 4,000 triangles (the hero's whole skin is 28,000), a 1024 picture, and
  300 KB on disk. Over any, the build fails and says which.
- **A copy for crowds:** about 1,000 triangles, meshoptimizer's simplifier keeping the texture
  coordinates, as the Vitruvian build does, with a 256 picture. The game's character LOD
  (`lod.js`) picks it far off.

### 4.9 What it writes
Per garment: a `.bin` (packed typed arrays, `pack.js`, like the bodies'), its pictures, and an
entry in an index (`client/characters/clothes/index.json`). The `.bin` holds:
- the mesh: triangles and texture coordinates;
- per body: each vertex's triangle, barycentric weights, offsets and bone weights, and the body
  triangles it covers;
- the copy with less detail.

Each entry gives the slot, layer, options, licence and credit. A test checks that the index is up
to date with the source items and the build, as `manifest.test.js` does for the manifest. The
garments' files go in the asset catalog, `client/models/assets.json` (decision 5).

---

## 5. In the game (run time)

- **Built on a character:** from its binding for `GAME_BODY`, each vertex placed on the shaped
  body's triangle, plus its offset in that triangle's frame. A few milliseconds per garment, a
  step at a time as `fittingGarment` is (`character.js`'s building steps).
- **Drawn:** skinned to the character's skeleton, with its own material: one draw call more for
  each imported garment. The generated garments stay in their one picture.
- **Hidden skin:** its covers go into the character's hidden triangles, as generated garments'
  do. Skin under any garment isn't drawn.
- **Outfits:** imported garments get ids (`mh.<name>`) usable in `equipment.js` outfits and
  people's looks, like any garment.
- **Budget:** at most two imported garments on the hero, and the copies with less detail on
  folk. Measured on the iPhone budget before more.
- **Downloaded:** through the asset catalog and the downloader (the asset streaming plan, A2).
  A character wearing one that isn't here yet wears its stand-in, a generated garment from the
  same slot named in the index, and changes when it arrives, out of view.
- **Animation:** skinned only, as the body is. A hood with a hang to it, or a robe's skirt
  swinging, follows the drape bones' lead where §4.3 binds it to them.

---

## 6. Tests

**Unit (Node):**
- `.mhclo` parsing, on small fixtures: ranges in `delete_verts`, licence comments, single-index
  and nine-number lines;
- placement on MakeHuman's default body matching MPFB2's own (§4.2's recorded fixture);
- binding again: back within 0.5 mm at the default shape; never inside the skin past its
  thickness at the motion check's bodies; on both bodies;
- weights summing to 1, and four at most;
- covers: MPFB2's conservative mask;
- the build's budgets and licence refusal;
- the index up to date.

**Browser (Playwright):**
- in the character lab, an imported garment on both bodies, at the sliders' ends, walking and
  running. Pictures before and after for the pull request (contribution.md, section 3, rule 6);
- one that's missing leaves its stand-in, with no error.

**The motion check:** imported garments join the clipping checks (`test/clipping.test.js`), so a
motion that pushes a limb through a robe shows there.

---

## 7. Milestones

Each is shippable alone.

| | Milestone | What lands |
| --- | --- | --- |
| **C1** | The survey, and placing | The packs surveyed for this world: a table of candidates with licence, triangles, picture size, what's bound to helpers, and the slot each would take. `build-clothes.js` reads and places items on MakeHuman's default body, checked against MPFB2 in Blender. Nothing in the game yet |
| **C2** | One garment, MakeHuman's body | Binding to the skin, weights, covers, pictures (the WebP decision) and the budget, for one item: the monk's robe with its hood up, the hardest case (loose, hooded). In the character lab only |
| **C3** | Both bodies | The Vitruvian binding through the fit; tests at both bodies' slider ends |
| **C4** | In the game | Slots, outfits and people's looks; downloads through the catalog with generated stand-ins; copies with less detail for folk; the draw-call budget measured on a phone |
| **C5** | The wardrobe | The survey's chosen items through the importer, each credited; tinting masks where people's colours matter; helmets as rigid items. contribution.md and `README.md` say how to add one, from a pack or made with MPFB2's MakeClothes |

---

## 8. Open questions

- **Clothes bound to the helpers** (trousers, skirts): does binding them again to the skin keep
  them right through every slider, or do some need MakeHuman's tights helper kept, with its shapes
  added to the body's data? C1's survey says how many items it matters for.
- **Loose cloth:** drape bones, spread weights, or both? C2 decides on the robe.
- **WebP in Node:** a new dependency (`sharp`, or a WebAssembly encoder), or the Blender
  pipeline's export?
- **Tinting:** masks drawn by hand, or worked out from the pictures?
- **Several imported garments on one character:** their pictures could be packed into one atlas
  per outfit, to make one draw call of them all. Worth it only if C4's measurements say so.
- **CC-BY:** each item's credit carried into `README.md`, automatically from the build's credits
  list, or by hand?

---

## 9. Sources

- MPFB2: <https://github.com/makehumancommunity/mpfb2>
  - `src/mpfb/entities/clothes/mhclo.py`: the format;
  - `src/mpfb/services/clothesservice.py`: `fit_clothes_to_human`, `interpolate_weights`,
    `_conservative_mask`;
  - `src/mpfb/ui/create_assets/makeclothes/`: making clothes.
- MakeHuman's asset packs, each pack's page listing its items with authors and licences:
  <https://static.makehumancommunity.org/assets/assetpacks.html>
- In this repository: `scripts/build-characters.js` (`PARTS`, `parseObj`, `sourceOf`),
  `scripts/build-vitruvian.js` (`nearestPoints`, `fitOnto`), and these in `client/js/characters/`:
  - `garments.js`, `drapes.js`: how clothes are made now;
  - `equipment.js` (`SLOTS`, `ITEMS`) and `items.js`: slots, and rigid items on sockets;
  - `liveries.js`: people's colours;
  - `lod.js`: copies with less detail;
  - `body.js` (`GAME_BODY`, `BODIES`).

---

## 10. Change log

- **2026-10-06.** First version, before any code: the paradigm (imported at build time, bound
  again to the game's own skin so every slider and both bodies are followed, weights from the
  skin, a garment kind of its own, downloaded when wanted, budgets enforced); MakeHuman's format
  as MPFB2 reads it; the packs worth surveying, with their licences; milestones C1 to C5.
