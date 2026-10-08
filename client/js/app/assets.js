// Made by scripts/build-manifest.js (npm run build:manifest) from client/models/assets.json,
// don't edit: the models the game downloads only as they're wanted (not before it starts: that's
// manifest.js), each file with its size in bytes and a hash of its bytes, fetched as path?h=hash.
// `release` names this release's set of kept files (these and the manifest's data), which the
// page tells the service worker (client/sw.js), so it can let go of what no release in use lists.
// test/manifest.test.js checks it's up to date; generated/asset_streaming_plan.md, section 2,
// says what each field is for.

export const ASSETS = Object.freeze({
    release: "76cd057627",
    models: {
        "dungeon-rock-cave": {
            "tier": "demand",
            "label": "A cave's rock (ambientCG Rock028, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/rock-cave-colour.jpg",
                    "hash": "704e439744",
                    "bytes": 72422
                },
                {
                    "path": "textures/dungeons/rock-cave-normal.jpg",
                    "hash": "564bfb9401",
                    "bytes": 129858
                }
            ]
        },
        "dungeon-ground-cave": {
            "tier": "demand",
            "label": "A cave's floor (ambientCG Ground022, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-cave-colour.jpg",
                    "hash": "fbb993fa64",
                    "bytes": 88553
                },
                {
                    "path": "textures/dungeons/ground-cave-normal.jpg",
                    "hash": "c2f5a75b14",
                    "bytes": 142478
                }
            ]
        },
        "dungeon-ground-dug": {
            "tier": "demand",
            "label": "An outlaws' hideout's floor (ambientCG Ground048, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-dug-colour.jpg",
                    "hash": "3894de7857",
                    "bytes": 88256
                },
                {
                    "path": "textures/dungeons/ground-dug-normal.jpg",
                    "hash": "c81029e93d",
                    "bytes": 106682
                }
            ]
        }
    },
});
