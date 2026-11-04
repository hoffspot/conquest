# The scenery's models

## bellhaven-2.bin and bellhaven-far-3.bin

**White Castle**, by **DmitriyDryzhak** (its Unreal Engine files: the example scene of the castle
on its crag, its parts and its textures, exported from Unreal Engine by this repository's owner),
bought on **Fab** by this repository's owner under **Fab's Standard License**: Bellhaven, the Order
of the Bell's mother house, a place of its own in the game.

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
served scrambled as part of the game: the bought files put through `utilities/blenderpipeline`
(`private/bellhaven.json`, which stays out of the repository with the bought files).

- `bellhaven-2.bin`, its `phone` build, for the castle's own map: the artist's whole scene (the
  crag, the chasm, the bridge and the castle), cut into 98 cells of 40 m, 500,745 triangles with a
  lower detail of 166,820 packed in, its 16 materials' textures as KTX2 (1,024 pixels; normals 512).
- `bellhaven-far-3.bin`, its `far` build, the castle seen from the world round it: the same scene,
  its plain back walls dressed with its own parts (its buttresses, lancets, pilasters and
  cornices, set onto them; `private/bellhaven-far.json`), in one detail of 121,026 triangles, 19
  draw calls, its textures at 256 pixels.
- In both, its rocks that touched nothing are set down on what's under them or left out (the
  pipeline's `seat`). They replace `bellhaven.bin`, `bellhaven-far.bin` and `bellhaven-far-2.bin`,
  the earlier builds, which older builds of the game still fetch.

Each is scrambled as the game serves it, with whose it is in its glTF asset's `copyright`. They
aren't in this repository, but in the private one the game's builds fetch them from
(`docs/LICENSED_MODELS.md`).

`client/js/core/scenery/bellhaven.walk.js`, in this repository, is where the castle can be walked,
baked from it (`utilities/blenderpipeline`, README *Where it can be walked*): the height of each
square a body can stand on, no mesh or texture.

Don't copy them out of this game or use them in anything else.
