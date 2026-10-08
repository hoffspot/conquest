// Made by scripts/build-textures.js (npm run build:textures), don't edit: the photographs a
// dungeon's rock, stone, earth and timber are drawn with (client/textures/dungeons, CC0: where
// each is from is in that script), by name: each its catalog entry (app/assets.js: its colour
// and its normal map), how many metres one repeat of it covers, and its average colour (linear
// light, 0 to 1), which the theme's own is put in place of (world/dungeons3d.js).

export const DUNGEON_PICTURES = Object.freeze({
    "rock-cave": { entry: "dungeon-rock-cave", metres: 2.6, mean: [0.0798, 0.0764, 0.0598] },
    "ground-cave": { entry: "dungeon-ground-cave", metres: 2.2, mean: [0.2763, 0.2692, 0.2483] },
    "rock-dug": { entry: "dungeon-rock-dug", metres: 3, mean: [0.0749, 0.0574, 0.0349] },
    "ground-dug": { entry: "dungeon-ground-dug", metres: 1.8, mean: [0.0879, 0.0467, 0.0313] },
    "timber": { entry: "dungeon-timber", metres: 1.6, mean: [0.1208, 0.1009, 0.0793] },
    "stone-temple": { entry: "dungeon-stone-temple", metres: 2.4, mean: [0.0655, 0.0476, 0.0267] },
    "floor-temple": { entry: "dungeon-floor-temple", metres: 2.8, mean: [0.1897, 0.1723, 0.1427] },
});
