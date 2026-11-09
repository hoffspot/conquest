# The heroes' gear's models

## medieval-shield-01.bin to medieval-shield-25.bin, medieval-sword-01.bin and medieval-sword-02.bin

**Dragon Motion's "Medieval Props Kit"** (its 25 shields and its 2 swords; its Unreal Engine files
exported by this repository's owner), by **Dragon Motion**, bought on **Fab** by this repository's
owner under **Fab's Standard License**: the designs the heroes' kite shields, tower shields and
swords are made in, each people's, the sellswords' and the Order of the Bell's
(`client/js/core/gear.js` `DESIGNS`, `client/js/characters/liveries.js` `KIT_DESIGNS`). Each is
drawn in a hero's hand, on their arm or slung on their back where the game's own shield or sword
was, that one drawn in its place till its file's read, and without this file.

Each piece was put in a `.blend` of its own (from the library's, `private/mpk-library/`) and
through `utilities/blenderpipeline` (`private/mpk-gear-<kind>-<n>.json`), all of which stay out of
the repository with the bought files: every triangle the pack made kept (253 to 893 a piece), its
own textures as KTX2 (512 pixels; normals 256), as the pack sized it (the game draws the long kites
smaller: `client/js/characters/items.js` `KIT_SHAPES`), a file of 100 to 160 KB, 3.8 MB the 27.

| Files | What they are | Whose (`DESIGNS`) |
|---|---|---|
| `medieval-shield-01` to `-05` | Heater shields: a gold cross on blue; a green dragon over a crown, on red; a black cross between lilies on blue; a pale cross on linen; a cross in a ring, on silver | Humans, lizard-folk, humans, the Order, the Order |
| `medieval-shield-06` to `-10` | Long kite shields: black lilies on saffron; a white cross, black and blue; roundels and a cross, black and red; silver scrollwork; dark scrollwork on sea-green | Cat-folk, humans, orcs, elves, elves |
| `medieval-shield-11` to `-15` | Kite shields with a boss: iron bands on black; teal and gold bends; a lily and a sword, red and gold; a gold dragon on red; etched steel | Dark elves, lizard-folk, cat-folk, lizard-folk, sellswords |
| `medieval-shield-16` to `-20` | Tower shields: faded painted figures; red dragons and a crown; small coats of arms on a black lattice; silver scrollwork on black; a lion and axes, red and blue | Cat-folk, lizard-folk, humans, dark elves, sellswords |
| `medieval-shield-21` to `-25` | Jousting shields: a crown, quartered blue and white; a black beast in a blue quarter; knights in battle; dark damask; verdigris damask | Humans, sellswords, cat-folk, orcs, dark elves |
| `medieval-sword-01`, `-02` | A knight's sword, long in the grip; a sword of blackened iron | Humans and the Order; orcs and sellswords |

They are not CC0 and not free to reuse. That licence lets them be used in a game their buyer
makes and distributed as part of it, never on their own, so they're in the game only in this
converted form, scrambled as the game serves them, with whose they are in each glTF asset's
`copyright`, and kept in the private repository the game's builds fetch them from, not in this one
(`docs/LICENSED_MODELS.md`).

Don't copy them out of this game or use them in anything else.
