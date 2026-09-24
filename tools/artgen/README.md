# Art generator

Makes the art for castles and towns by building each piece as a 3D model and rendering it from
the game's own camera, then saves the results as sprite sheets the game can draw from. It runs at
build time, not in the game:

```sh
npm run build:art                        # every style, into client/images/art/
npm run build:art -- --style=pixel       # one style
npm run build:art -- --previews=previews # also pictures of example castles and towns
```

It uses Playwright's Chromium (or `CHROMIUM_PATH`), with software WebGL where there is no GPU.
Both styles take about a minute.

## How it works

1. **The catalogue** (`client/js/core/setpieces/pieces.js`) lists every piece a castle or town
   can use, with its size in grid squares: walls 1 to 8 squares long, towers, gatehouses facing
   each way, keeps, houses of 8 sizes in 4 styles with 3 variants each, landmarks, props and
   trees. Each has a key, such as `house-3x2-timber-1`.
2. **Builders** (`kits/`) make a 3D model of each piece, in world pixels (a grid square is 20),
   with x east, y up and z south, starting at the north-west corner of the piece's first square.
   - `kits/castle.js`: walls, towers, gatehouses and keeps, made of stone masses, battlements,
     and cone and pyramid roofs. The approach follows
     [Castle Builder](https://github.com/JonRubashkin/Castle-Builder): pieces from simple
     shapes, and merlons spaced evenly along every top edge.
   - `kits/house.js`: houses of any size in four styles (whitewashed cottages with thatch,
     timber-framed, brick after LPC's brick house, and stone), each variant different: wall
     height, one or two storeys, gabled or hipped roof, roof and wall colours, door, windows,
     chimney.
   - `kits/town.js`: the tavern, church, blacksmith, market and windmill, props and trees, from
     KayKit's Medieval Hexagon models (`models/kaykit/`).
   - `engine/solid.js` builds shapes out of flat faces (boxes, turned boxes, gabled and hipped
     roofs, pyramids, cylinders and cones), with texture coordinates in world pixels so that
     bricks and roof tiles are the same size everywhere.
   - `engine/materials.js` paints the textures (ashlar, brick, plaster, thatch, slate, clay
     tiles, planks, cobbles, earth, soil) pixel by pixel from a seeded random generator, so the
     art comes out the same every time.
3. **The renderer** (`engine/render.js`) draws a piece as the game sees it: the orthographic
   camera looking down from 60°, with the ground stretched so that it lines up with the map
   grid, and the same sky and sunlight as the 3D units (`client/js/app/units3d.js`). It adds a
   soft light from the viewer's side so that the south faces the camera sees aren't lost in
   shade. Each piece gives two images: the piece itself, shaded by its own shadows, and the
   shadow it casts on the ground. Keeping the ground shadow apart lets neighbouring pieces'
   shadows merge without doubling up.
4. **Styles** (`main.js`):
   - `smooth`: 40 pixels per grid square, shadows at half that.
   - `pixel`: pixel art at LPC's 32 pixels per grid square. Every pixel is solid or clear, in
     the [LPC](https://github.com/ElizaWy/LPC) palette, with a dark outline (`engine/pixel.js`).
5. **Sheets** (`engine/atlas.js`): every sprite and shadow, trimmed to what can be seen and
   packed into one WebP per style (`client/images/art/setpieces-<style>.webp`), with a manifest
   (`.json`) saying where each piece's sprite and shadow are on the sheet and where their
   top-left corners go on the map.

**Layouts** (`client/js/core/setpieces/castle.js` and `town.js`) decide which pieces go where,
and **`compose.js`** draws a layout with its pieces: the map's grass, the layout's ground (roads,
cobbles, courtyards, gardens) blended in with ragged edges, every shadow merged into one, and
the pieces drawn back to front with any units among them.

## Adding to it

- **A new piece:** add it to `pieceCatalog()` in `pieces.js`, give it a builder in `kits/`, add
  the builder to `BUILDERS` in `main.js`, and run `npm run build:art`. A test checks that every
  catalogued piece has art.
- **A new style:** add it to `STYLES` in `main.js` with its scale and finishing steps, and to
  the list in `scripts/build-art.js`.
- **A new kind of place** (a desert village, a dungeon): add its pieces as above and a layout
  module next to `castle.js` and `town.js`.

Layouts may be made while the game runs (in a multiplayer game, both players make the same
castle from the same seed). So, like the map generator, they use only the seeded random numbers
and whole-number arithmetic of `client/js/core/random.js`. A test enforces this.

## Credits

- KayKit Medieval Hexagon Pack by Kay Lousberg (<https://kaylousberg.com>), CC0
  (`models/kaykit/LICENSE.txt`).
- The pixel-art palette is the Liberated Pixel Cup palette from LPC Revised
  (<https://github.com/ElizaWy/LPC>), OGA-BY 3.0.
- The castle pieces follow Castle Builder by Jon Rubashkin
  (<https://github.com/JonRubashkin/Castle-Builder>, MIT); the town layout follows Watabou's
  Medieval Fantasy City Generator (<https://github.com/watabou/TownGeneratorOS>). No code is
  copied from either.
