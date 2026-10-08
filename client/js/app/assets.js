// Made by scripts/build-manifest.js (npm run build:manifest) from client/models/assets.json,
// don't edit: the models the game downloads only as they're wanted (not before it starts: that's
// manifest.js), each file with its size in bytes and a hash of its bytes, fetched as path?h=hash.
// `release` names this release's set of kept files (these and the manifest's data), which the
// page tells the service worker (client/sw.js), so it can let go of what no release in use lists.
// test/manifest.test.js checks it's up to date; generated/asset_streaming_plan.md, section 2,
// says what each field is for.

export const ASSETS = Object.freeze({
    release: "7ba0fe0c2c",
    models: {
        "dungeon-rock-cave": {
            "tier": "demand",
            "label": "A cave's rock (ambientCG Rock028, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/rock-cave-colour.jpg",
                    "hash": "a1b4fa146a",
                    "bytes": 80290
                },
                {
                    "path": "textures/dungeons/rock-cave-normal.jpg",
                    "hash": "ac9cc28dff",
                    "bytes": 275323
                }
            ]
        },
        "dungeon-ground-cave": {
            "tier": "demand",
            "label": "A cave's floor (ambientCG Ground022, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-cave-colour.jpg",
                    "hash": "2557da5ccd",
                    "bytes": 99238
                },
                {
                    "path": "textures/dungeons/ground-cave-normal.jpg",
                    "hash": "a58a03c89b",
                    "bytes": 284952
                }
            ]
        },
        "dungeon-ground-dug": {
            "tier": "demand",
            "label": "An outlaws' hideout's trodden earth (ambientCG Ground048, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-dug-colour.jpg",
                    "hash": "5f15d17297",
                    "bytes": 113313
                },
                {
                    "path": "textures/dungeons/ground-dug-normal.jpg",
                    "hash": "7d1449ec05",
                    "bytes": 225547
                }
            ]
        },
        "dungeon-rock-dug": {
            "tier": "demand",
            "label": "An outlaws' hideout's rock, dug out (Poly Haven quarry_wall, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/rock-dug-colour.jpg",
                    "hash": "609aa51187",
                    "bytes": 64615
                },
                {
                    "path": "textures/dungeons/rock-dug-normal.jpg",
                    "hash": "37450dc546",
                    "bytes": 147824
                }
            ]
        },
        "dungeon-timber": {
            "tier": "demand",
            "label": "Rough timber, its posts and beams (Poly Haven rough_wood, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/timber-colour.jpg",
                    "hash": "bb19d05572",
                    "bytes": 64708
                },
                {
                    "path": "textures/dungeons/timber-normal.jpg",
                    "hash": "30b0ff278c",
                    "bytes": 92592
                }
            ]
        },
        "dungeon-stone-temple": {
            "tier": "demand",
            "label": "An ancient temple's dressed stone (Poly Haven stone_brick_wall_001, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/stone-temple-colour.jpg",
                    "hash": "1d894bf5d5",
                    "bytes": 66804
                },
                {
                    "path": "textures/dungeons/stone-temple-normal.jpg",
                    "hash": "ac2a1753a2",
                    "bytes": 163079
                }
            ]
        },
        "dungeon-floor-temple": {
            "tier": "demand",
            "label": "An ancient temple's flagstones (Poly Haven large_grey_tiles, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/floor-temple-colour.jpg",
                    "hash": "48e15be912",
                    "bytes": 49322
                },
                {
                    "path": "textures/dungeons/floor-temple-normal.jpg",
                    "hash": "feb9a0be71",
                    "bytes": 45878
                }
            ]
        }
    },
});
