# The scenery's models

## bellhaven.bin and bellhaven-far.bin

**White Castle**, by **DmitriyDryzhak** (its Unreal Engine files: the example scene of the castle
on its crag, its parts and its textures, exported from Unreal Engine by this repository's owner),
bought on **Fab** by this repository's owner under **Fab's Standard License**: Bellhaven, the Order
of the Bell's mother house, a place of its own in the game.

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
served scrambled as part of the game: the bought files put through `utilities/blenderpipeline`
(`private/bellhaven.json`, which stays out of the repository with the bought files).

- `bellhaven.bin`, its `phone` build, for the castle's own map: the artist's whole scene (the
  crag, the chasm, the bridge and the castle), cut into 98 cells of 40 m, 500,932 triangles with a
  lower detail of 166,817 packed in, its 16 materials' textures as KTX2 (1,024 pixels; normals 512).
- `bellhaven-far.bin`, its `far` build, the castle seen from the world round it: the same scene in
  one detail of 51,222 triangles, 15 draw calls, its textures at 256 pixels.

Each is scrambled as the game serves it, with whose it is in its glTF asset's `copyright`. They
aren't in this repository, but in the private one the game's builds fetch them from
(`docs/LICENSED_MODELS.md`).

`bellhaven.walk.json`, beside them in this repository, is where the castle can be walked, baked
from it (`utilities/blenderpipeline`, README *Where it can be walked*): the height of each square
a body can stand on, no mesh or texture.

Don't copy them out of this game or use them in anything else.
