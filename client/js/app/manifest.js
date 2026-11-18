// Made by scripts/build-manifest.js (npm run build:manifest), don't edit: every file the game
// downloads before it starts, in groups, with each file's size in bytes (paths from the page), so
// the loading screen can show exactly how far it has got. Data files have a hash of their bytes
// too, and are fetched as path?h=hash. test/manifest.test.js checks it's up to date.

export const MANIFEST = Object.freeze([
    {
        id: "engine",
        label: "3D engine",
        detail: "Three.js rundefined",
        files: [
            ["vendor/meshoptimizer-1.3.0/meshopt_simplifier.min.js", 53692, "0edf7c5d6b"],
        ],
    },
    {
        id: "navigation",
        label: "Ways over the world",
        detail: "Recast and Detour (recast-navigation-js 0.44.0)",
        files: [
            ["vendor/recast-navigation-0.44.0/core.min.mjs", 49589, "33eb65a037"],
            ["vendor/recast-navigation-0.44.0/recast-navigation.wasm.js", 560115, "991e05aec0"],
            ["vendor/recast-navigation-0.44.0/recast-navigation.wasm.wasm", 340097, "5a59fe32e2"],
            ["vendor/recast-navigation-0.44.0/recast.mjs", 380, "fd28de385e"],
        ],
    },
    {
        id: "code",
        label: "Game code",
        detail: "Pellagos",
        files: [
            ["js/app/character-file.js", 16985, "35d66bf292"],
            ["js/app/choices.js", 7166, "4b77ccf428"],
            ["js/app/creator.js", 47878, "20636e4251"],
            ["js/app/hero-basics.js", 1775, "2c87404887"],
            ["js/app/heroes.js", 7982, "8044f6c022"],
            ["js/app/peer.js", 41918, "4c7661ff65"],
            ["js/app/plan-worker.js", 1669, "a83a0bcb7e"],
            ["js/app/plans.js", 11719, "4ec56330af"],
            ["js/app/session.js", 7513, "ba1937b4b4"],
            ["js/app/together.js", 22304, "b88b352c42"],
            ["js/app/wheelsetup.js", 6409, "cabc4ef49c"],
            ["js/app/worldmap.js", 71496, "e356a9a769"],
            ["js/audio/worker.js", 1847, "72fe04e052"],
            ["js/characters/garment-painter.js", 4994, "3f3d296812"],
            ["js/characters/lod-worker.js", 496, "c5723f6412"],
            ["js/characters/skin-worker.js", 5519, "e758d83414"],
            ["js/core/remote.js", 3985, "ddc0e5eb0b"],
            ["js/world/art/engine/paint-worker.js", 416, "2b3f5646f5"],
            ["js/world/far/far-worker.js", 1140, "7fd16af628"],
            ["js/world/far/silhouette-worker.js", 2323, "6c79b39842"],
            ["js/world/layout-worker.js", 1440, "0754bd8ff2"],
            ["js/world/navview.js", 8703, "cdd71caa41"],
            ["js/world/navworker.js", 738, "bd4184ef0f"],
            ["js/world/terrain-worker.js", 1089, "e49e4b7423"],
        ],
    },
    {
        id: "body",
        label: "Body and shapes",
        detail: "CharMorph's Vitruvian, with MakeHuman's sliders",
        files: [
            ["characters/vitruvian.bin", 2175884, "9a4021725d"],
            ["characters/vitruvian.json", 159378, "94a2ba7f25"],
        ],
    },
    {
        id: "skin",
        label: "Skin details",
        detail: "Its own skin's pictures, MakeHuman masks carried over, and the mouth's inside",
        files: [
            ["characters/vitruvian/masks/aureolae.png", 1366, "86a292fd67"],
            ["characters/vitruvian/masks/crotch.png", 3415, "a404ac099a"],
            ["characters/vitruvian/masks/ears.png", 4801, "cf876e0985"],
            ["characters/vitruvian/masks/eyelids.png", 6559, "b2a88317aa"],
            ["characters/vitruvian/masks/fingernails.png", 10893, "899ee1a8b7"],
            ["characters/vitruvian/masks/lips.png", 4420, "c41b1dbc44"],
            ["characters/vitruvian/masks/toenails.png", 6247, "e905b68d67"],
            ["characters/vitruvian/mouth.jpg", 47816, "848f8fd63c"],
            ["characters/vitruvian/skin/dark.jpg", 74612, "926ec46f69"],
            ["characters/vitruvian/skin/height.jpg", 220320, "dad7ba0ff3"],
            ["characters/vitruvian/skin/light.jpg", 100069, "254f7c7b56"],
            ["characters/vitruvian/skin/roughness.jpg", 107277, "3ee7f1d72e"],
        ],
    },
    {
        id: "fonts",
        label: "Lettering",
        detail: "UnifrakturMaguntia, for the tavern's signs",
        files: [
            ["fonts/UnifrakturMaguntia.woff2", 26512, "a467466874"],
        ],
    },
]);
