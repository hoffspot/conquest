// Icons for the buildings the player has gone into, on the minimap and the world map: a round
// badge, rimmed in the colour of what the building is, with its sign in it: a foaming tankard
// for a tavern, an anvil for a smithy, a temple's columns under its pediment for a temple,
// crossed swords behind a shield for an adventurers' guild, crossed keys for a town hall, a
// crown for a keep, and a crested helm for a barracks. And the places worth finding out in the
// world (core/places.js; the terrain plan's M7.5): a castle, a manor, an abbey, a windmill, a
// watchtower, a people's hall, a holy spring, a great rock, a totem, ruins, a ruined castle, a
// cave, the dragon's lair, a shrine, standing stones, a graveyard and a camp, each rimmed in the
// colour of who holds it (PLACE_RIMS); a dungeon's way in (an arch over steps going down, grey
// while it's cleared); an adventurers' cache once it's been seen (a chest); and each people's
// works, a lumber mill (a log and an axe), a mine (a pick over its ore) and a quarry (a squared
// block), rimmed in their holder's colour; and their fortifications, a guard tower (a
// battlemented tower) and a forward garrison (a curtain wall between two turrets, its gate in
// it), rimmed as the works are. Drawn on a canvas, from paths on a grid 24 across, centred on
// 0, 0.

// Each kind's look: its rim's colour, and its sign's parts ([path, fill, stroke, width])
const LOOKS = {
    tavern: {
        rim: "#e8a93a",
        parts: [
            // The tankard's body, its handle and its hoops, and the foam heaped over its rim
            ["M-7,-3 h10 v10.5 a1.5,1.5 0 0 1 -1.5,1.5 h-7 a1.5,1.5 0 0 1 -1.5,-1.5 z", "#c98a3a", "#3a2110", 1],
            ["M3,-0.5 h2.8 a2.4,2.4 0 0 1 2.4,2.4 v3 a2.4,2.4 0 0 1 -2.4,2.4 h-2.8", null, "#3a2110", 3.2],
            ["M3,-0.5 h2.8 a2.4,2.4 0 0 1 2.4,2.4 v3 a2.4,2.4 0 0 1 -2.4,2.4 h-2.8", null, "#c98a3a", 1.6],
            ["M-7,1.5 h10 M-7,5.5 h10", null, "#6b4520", 1],
            ["M-8,-2.5 a2.6,2.6 0 0 1 2.2,-3.8 a3.2,3.2 0 0 1 5.4,-1.2 a2.8,2.8 0 0 1 4.4,1.6 a2.2,2.2 0 0 1 0,3.6 z", "#fff6dc", "#3a2110", 1],
        ],
    },
    blacksmith: {
        rim: "#b8c2cc",
        parts: [
            // The anvil: its face and horn, its waist and foot; a spark off it
            ["M-9,-4.5 h13 c2.5,0 4.5,-0.6 6,-1.8 c-0.4,2.8 -2.6,4.8 -6,5.2 h-1.5 v2.6 l3.2,4.5 h-12.4 l3.2,-4.5 v-2.6 h-2 c-2,0 -3.5,-1.4 -3.5,-3.4 z", "#9aa4ae", "#1e2328", 1],
            ["M-8.2,-3.7 h12", null, "#dde3e8", 0.9],
            ["M2,-10 l1,2.4 l2.4,1 l-2.4,1 l-1,2.4 l-1,-2.4 l-2.4,-1 l2.4,-1 z", "#ffb13a", null, 0],
        ],
    },
    church: {
        rim: "#f2e6c4",
        parts: [
            // A temple's front: the pediment, the beam under it, four columns, and the steps
            ["M-9.5,-3.5 L0,-9.5 L9.5,-3.5 Z", "#f4efe2", "#3b3326", 1],
            ["M-9,-3.5 h18 v2.2 h-18 z", "#e6dcc4", "#3b3326", 0.9],
            ["M-7.6,-1 h2.4 v7 h-2.4 z M-3.2,-1 h2.4 v7 h-2.4 z M0.8,-1 h2.4 v7 h-2.4 z M5.2,-1 h2.4 v7 h-2.4 z", "#f4efe2", "#3b3326", 0.8],
            ["M-10,6 h20 v2.6 h-20 z", "#e6dcc4", "#3b3326", 0.9],
            ["M0,-6.8 a1.3,1.3 0 1 1 0.01,0 z", "#d9a93a", null, 0],
        ],
    },
    guild: {
        rim: "#d6b35a",
        parts: [
            // Two swords crossed behind a blue shield with a gold chevron
            ["M-9,-9 L8,8 M9,-9 L-8,8", null, "#1c1c22", 3.4],
            ["M-9,-9 L8,8 M9,-9 L-8,8", null, "#dfe4ea", 1.8],
            ["M5.5,9.5 l4,-4 M-5.5,9.5 l-4,-4", null, "#6b4520", 2.4],
            ["M-5.5,-5 h11 v4.5 c0,4.8 -2.8,7.6 -5.5,9 c-2.7,-1.4 -5.5,-4.2 -5.5,-9 z", "#2f5da8", "#14213d", 1.1],
            ["M-3.5,1.5 l3.5,-3 l3.5,3", null, "#e8c35a", 1.6],
        ],
    },
    hall: {
        rim: "#b8463c",
        parts: [
            // Two keys crossed, the town's: their bows, shafts and bits
            ["M-8,8 L6,-6 M8,8 L-6,-6", null, "#2a1a0e", 3.4],
            ["M-8,8 L6,-6 M8,8 L-6,-6", null, "#e2b54a", 1.8],
            ["M-9.4,5.6 a2.6,2.6 0 1 0 3.8,3.8 a2.6,2.6 0 1 0 -3.8,-3.8 z M9.4,5.6 a2.6,2.6 0 1 1 -3.8,3.8 a2.6,2.6 0 1 1 3.8,-3.8 z", "#e2b54a", "#2a1a0e", 1],
            ["M4,-4 l2.4,2.4 M2,-2 l2.4,2.4 M-4,-4 l-2.4,2.4 M-2,-2 l-2.4,2.4", null, "#2a1a0e", 1.2],
        ],
    },
    keep: {
        rim: "#8f6ad6",
        parts: [
            // A crown: its band and five points, a jewel on each
            ["M-9,6 h18 v3 h-18 z", "#e2b54a", "#2a1a0e", 1],
            ["M-9,6 L-9,-5 L-4.5,0 L0,-8 L4.5,0 L9,-5 L9,6 z", "#e2b54a", "#2a1a0e", 1.1],
            ["M-9,-5.5 a1.4,1.4 0 1 1 0.01,0 z M0,-8.5 a1.4,1.4 0 1 1 0.01,0 z M9,-5.5 a1.4,1.4 0 1 1 0.01,0 z", "#d0413a", "#2a1a0e", 0.8],
            ["M-4,3 h8", null, "#8f6ad6", 2],
        ],
    },
    barracks: {
        rim: "#6f8fb3",
        parts: [
            // A soldier's helm: its crest, its dome and brim, and the guard down over the nose
            ["M0,-5.2 c1.6,-3.2 4.8,-5.2 8.5,-5.2 c-1.4,2.8 -4.6,4.8 -8.5,5.2 z", "#c0392b", "#2a1a0e", 0.9],
            ["M-7.2,3 a7.2,8 0 0 1 14.4,0 z", "#aeb6bf", "#1e2328", 1.1],
            ["M-8.4,3 h16.8 v2.8 h-16.8 z", "#7d868f", "#1e2328", 1],
            ["M-1.3,5.8 h2.6 v4.6 l-1.3,1.4 l-1.3,-1.4 z", "#aeb6bf", "#1e2328", 0.9],
            ["M-4.2,-1.5 a4.5,5 0 0 1 3,-3.6", null, "#e6ebf0", 1.1],
        ],
    },
    // The places worth finding
    castle: {
        rim: "#c9a24a",
        parts: [
            // A tower with its battlements, its door, and a flag over it
            ["M0,-6 v-5.5", null, "#2a241c", 1.2],
            ["M0,-11.5 l6.5,1.8 l-6.5,1.8 z", "#d0413a", "#2a241c", 0.8],
            ["M-6,-2.5 h12 v11.5 h-12 z", "#bdb5a5", "#2a241c", 1],
            ["M-7.5,-6.5 h3 v4 h-3 z M-1.5,-6.5 h3 v4 h-3 z M4.5,-6.5 h3 v4 h-3 z M-7.5,-3 h15 v1.5 h-15 z", "#bdb5a5", "#2a241c", 0.9],
            ["M-2.2,9 v-4.2 a2.2,2.2 0 0 1 4.4,0 v4.2 z", "#3a2a1a", null, 0],
        ],
    },
    manor: {
        rim: "#c9a24a",
        parts: [
            // A house's front: its walls and roof, lit windows and a door
            ["M-8,-0.5 h16 v9.5 h-16 z", "#e2d6b8", "#2a241c", 1],
            ["M-9.5,-0.5 L0,-8.5 L9.5,-0.5 z", "#8a4f34", "#2a241c", 1],
            ["M-6.2,2 h3 v3 h-3 z M3.2,2 h3 v3 h-3 z", "#f2c66a", "#2a241c", 0.7],
            ["M-1.6,9 v-5 h3.2 v5 z", "#4a3020", null, 0],
        ],
    },
    abbey: {
        rim: "#f2e6c4",
        parts: [
            // A church: its nave, its tower with a cross, and a round window
            ["M-9.5,1.5 L-3.2,-4 L3.2,1.5 z", "#7c6a58", "#2a241c", 0.9],
            ["M-9,1.5 h12 v7.5 h-12 z", "#e8dfcb", "#2a241c", 1],
            ["M3,-5 h6 v14 h-6 z", "#e8dfcb", "#2a241c", 1],
            ["M2.4,-5 L6,-9 L9.6,-5 z", "#7c6a58", "#2a241c", 0.9],
            ["M6,-11.6 v2.6 M4.8,-10.6 h2.4", null, "#d9a93a", 1.2],
            ["M-3,4.5 a1.6,1.6 0 1 1 0.01,0 z", "#f2c66a", "#2a241c", 0.6],
        ],
    },
    windmill: {
        rim: "#c9a24a",
        parts: [
            // Its tower and cap, and its four sails
            ["M-3,-1.5 L3,-1.5 L4.2,9 L-4.2,9 z", "#e2d6b8", "#2a241c", 1],
            ["M-3.4,-1.5 a3.4,3 0 0 1 6.8,0 z", "#8a4f34", "#2a241c", 0.9],
            ["M0,-3.5 L-6.8,-9.6 M0,-3.5 L6.8,-9.6 M0,-3.5 L-7.2,3.6 M0,-3.5 L7.2,3.6", null, "#2a241c", 3],
            ["M0,-3.5 L-6.8,-9.6 M0,-3.5 L6.8,-9.6 M0,-3.5 L-7.2,3.6 M0,-3.5 L7.2,3.6", null, "#e6d8b6", 1.5],
        ],
    },
    watchtower: {
        rim: "#c9a24a",
        parts: [
            // A tall slender tower under a pointed roof, a slit in it
            ["M-3.6,-4 h7.2 v13 h-7.2 z", "#bdb5a5", "#2a241c", 1],
            ["M-5.2,-4 L0,-11 L5.2,-4 z", "#5d4a3a", "#2a241c", 1],
            ["M-0.7,-1 h1.4 v3.4 h-1.4 z M-0.7,4 h1.4 v2.4 h-1.4 z", "#1a1410", null, 0],
        ],
    },
    greatHall: {
        rim: "#c9a24a",
        parts: [
            // A people's great hall: long walls under a long roof, its door
            ["M-9,0 h18 v8.5 h-18 z", "#cdb48c", "#2a241c", 1],
            ["M-10.5,0 L-6,-7 L6,-7 L10.5,0 z", "#6b4a2e", "#2a241c", 1],
            ["M-1.8,8.5 v-4.5 a1.8,1.8 0 0 1 3.6,0 v4.5 z", "#2a1a10", null, 0],
        ],
    },
    spring: {
        rim: "#8fd0ff",
        parts: [
            // A holy pool, ringed in stones, a glint of light over it
            ["M-8.5,3.5 a8.5,4.2 0 1 0 17,0 a8.5,4.2 0 1 0 -17,0 z", "#9a9488", "#2a241c", 1],
            ["M-6.5,3.5 a6.5,2.8 0 1 0 13,0 a6.5,2.8 0 1 0 -13,0 z", "#3c7fb8", null, 0],
            ["M0,-10 l1,2.4 l2.4,1 l-2.4,1 l-1,2.4 l-1,-2.4 l-2.4,-1 l2.4,-1 z", "#dff3ff", null, 0],
        ],
    },
    rock: {
        rim: "#c9a24a",
        parts: [
            // A great rock jutting out over the land, the sun over it
            ["M5,-7 a3,3 0 1 1 0.01,0 z", "#f2c66a", null, 0],
            ["M-9.5,8.5 L-6.5,1 L-1,-2.5 L9.5,-4.5 L8,-1.5 L3,0.5 L5,8.5 z", "#b08a5a", "#2a241c", 1],
        ],
    },
    totem: {
        rim: "#c9a24a",
        parts: [
            // A carved pole crowned with horns
            ["M-2.2,-7 h4.4 v16 h-4.4 z", "#8a5a34", "#2a241c", 1],
            ["M-2,-6.5 C-5.4,-6.8 -7,-8.4 -6.6,-10.2 M2,-6.5 C5.4,-6.8 7,-8.4 6.6,-10.2", null, "#efe6d0", 1.8],
            ["M-1.1,-3.6 h0.9 v1 h-0.9 z M0.2,-3.6 h0.9 v1 h-0.9 z M-2.2,1 h4.4 M-2.2,4.5 h4.4", "#1a1410", "#1a1410", 0.8],
        ],
    },
    ruins: {
        rim: "#9fb4a8",
        parts: [
            // Broken columns of an old hall, the spring of an arch, rubble
            ["M-8,9 v-13 h3.6 v13 z M4.4,9 v-7.5 h3.6 v7.5 z", "#8f9888", "#1e2420", 1],
            ["M-4.4,-4 c2,-2 4.4,-2.6 6.8,-2.2 l-0.6,2.2 c-2,-0.2 -4,0.4 -6.2,2.4 z", "#8f9888", "#1e2420", 0.9],
            ["M-2.5,9 l1,-2.4 h3.4 l1.2,2.4 z", "#6f7868", "#1e2420", 0.8],
        ],
    },
    ruinedCastle: {
        rim: "#9fb4a8",
        parts: [
            // A tower broken off jagged at the top, its window dark
            ["M-6.5,9 v-12 l2,-2.5 l1.8,2.5 l2.2,-4 l2,3 l2,-1.5 l2.5,2.5 v12 z", "#7d8a78", "#1e2420", 1],
            ["M-1.5,3 v-3 a1.5,1.5 0 0 1 3,0 v3 z", "#141814", null, 0],
            ["M3,-1 l-1.4,3 l1.2,1.6", null, "#1e2420", 0.8],
        ],
    },
    cave: {
        rim: "#b8a07a",
        parts: [
            // A mound of rock, its dark mouth
            ["M-10.5,8.5 Q-9,-7.5 0,-9 Q9,-7.5 10.5,8.5 z", "#8a8172", "#1e1a14", 1],
            ["M-4.6,8.5 v-3.6 a4.6,4.6 0 0 1 9.2,0 v3.6 z", "#120e0a", null, 0],
        ],
    },
    lair: {
        rim: "#ff7a1a",
        parts: [
            // A dragon's claw marks, raked across
            ["M-6,-8.5 q3.2,8 -1,17 M0,-9.5 q3.2,8.4 -1,18 M6,-8.5 q3.2,8 -1,17", null, "#1a0c06", 3.6],
            ["M-6,-8.5 q3.2,8 -1,17 M0,-9.5 q3.2,8.4 -1,18 M6,-8.5 q3.2,8 -1,17", null, "#e0502a", 1.9],
        ],
    },
    shrine: {
        rim: "#f2e6c4",
        parts: [
            // A stone altar, a flame burning on it
            ["M0,1 c-3.4,-3 -1.4,-6.4 0,-9.6 c1.4,3.2 3.4,6.6 0,9.6 z", "#ffb13a", "#7a3a10", 0.7],
            ["M-7.5,1.5 h15 v2 h-15 z", "#c8c0b0", "#2a241c", 0.9],
            ["M-5.5,3.5 h11 v5.5 h-11 z", "#b0a898", "#2a241c", 0.9],
        ],
    },
    stones: {
        rim: "#b8b8a8",
        parts: [
            // Two standing stones, a lintel across them
            ["M-8,9 l0.6,-12 h3.8 l0.4,12 z M3.6,9 l0.4,-12 h3.8 l0.6,12 z", "#a8a89a", "#1e1e1a", 1],
            ["M-9.2,-6.2 h18.4 v3.2 h-18.4 z", "#a8a89a", "#1e1e1a", 1],
        ],
    },
    graveyard: {
        rim: "#9fb4a8",
        parts: [
            // Two headstones, round-headed, and a cross between them, on a mound
            ["M-10,9 q10,-4.6 20,0 z", "#6f7a5e", "#1e2420", 0.9],
            ["M-9,7.4 v-6.4 a2.6,2.6 0 0 1 5.2,0 v5.6 z M3.8,6.6 v-5.6 a2.6,2.6 0 0 1 5.2,0 v6.4 z", "#b0ab9c", "#1e2420", 1],
            ["M-1.1,6 v-10.5 h2.2 v10.5 z M-3.6,-1.6 h7.2 v2.2 h-7.2 z", "#c4bfb0", "#1e2420", 1],
        ],
    },
    // (A dungeon's way in, out in the wilds: core/dungeons)
    dungeon: {
        rim: "#c46a3a",
        parts: [
            // An arch of old stone over a dark way in, steps going down into it
            ["M-10,9 v-9 a10,9.5 0 0 1 20,0 v9 z", "#857c70", "#1e1a14", 1],
            ["M-5.6,9 v-8 a5.6,5.6 0 0 1 11.2,0 v8 z", "#0d0a08", null, 0],
            ["M-4.6,4.2 h9.2 M-4,6.7 h8", null, "#5a5248", 1.1],
            ["M0,-9.5 v3.2", null, "#1e1a14", 1],
        ],
    },
    // (An adventurers' cache out in the wilds, once seen: core/caches.js)
    cache: {
        rim: "#e8c35a",
        parts: [
            // A chest: its rounded lid and its body, the iron bands over both, and its lock
            ["M-8.5,-1 v-3 a8.5,5 0 0 1 17,0 v3 z", "#8a5a2e", "#2a1608", 1],
            ["M-8.5,-1 h17 v9 h-17 z", "#a06a36", "#2a1608", 1],
            ["M-5,-8.4 v16.4 M5,-8.4 v16.4", null, "#d9b04a", 1.4],
            ["M-8.5,-1 h17", null, "#2a1608", 1.2],
            ["M-1.8,-2.6 h3.6 v4.8 h-3.6 z", "#e8c35a", "#2a1608", 0.8],
        ],
    },
    // (Each people's works: docs/WAR.md *The works*; rimmed in the colour of who holds it)
    mill: {
        rim: "#c9a46a",
        parts: [
            // A log lying, its sawn end ringed; an axe standing over it
            ["M-9,1.5 h11 a3.5,3.5 0 0 1 0,7 h-11 a3.5,3.5 0 0 1 0,-7 z", "#8a5a2e", "#2a1608", 1],
            ["M2,5 m-3.5,0 a3.5,3.5 0 1 0 7,0 a3.5,3.5 0 1 0 -7,0", "#e2c28a", "#2a1608", 1],
            ["M2,5 m-1.5,0 a1.5,1.5 0 1 0 3,0 a1.5,1.5 0 1 0 -3,0", null, "#9a6a3a", 0.8],
            ["M-4,-9.5 L-1,1", null, "#2a1608", 2.6],
            ["M-4,-9.5 L-1,1", null, "#b07a42", 1.4],
            ["M-7.6,-9.6 q3.4,-2 6.6,-1.6 l0.8,3.6 q-3.6,0.2 -6.4,2.2 z", "#c8d0d8", "#1e2328", 1],
        ],
    },
    mine: {
        rim: "#c9a46a",
        parts: [
            // A pick laid over a heap of ore
            ["M-10,9 q4,-7.5 10,-7.5 q6,0 10,7.5 z", "#9a4a2a", "#2a1608", 1],
            ["M-5,5.5 l2,-1.6 l1.8,1.4 z M2,4.6 l2.2,-1.4 l1.6,1.6 z M-1.4,1.6 l1.6,-1 l1.4,1 z", "#d4744a", null, 0],
            ["M-6.5,4 L6,-8.5", null, "#2a1608", 2.6],
            ["M-6.5,4 L6,-8.5", null, "#b07a42", 1.4],
            ["M-0.6,-11 q8,0.4 10.4,7.2 q-4.4,-3.4 -8.6,-3.2 q2.6,-2.8 -1.8,-4 z", "#c8d0d8", "#1e2328", 1],
        ],
    },
    quarry: {
        rim: "#c9a46a",
        parts: [
            // A squared block of stone, its top and side, a wedge in its split
            ["M-8,-2 l6,-4.5 h10 l-6,4.5 z", "#d6d0c2", "#1e1e1a", 1],
            ["M-8,-2 h10 v10 h-10 z", "#b0aa9c", "#1e1e1a", 1],
            ["M2,-2 l6,-4.5 v10 l-6,4.5 z", "#8c877a", "#1e1e1a", 1],
            ["M-3,-2 v10", null, "#3a362e", 0.9],
            ["M-4.4,-6.2 l1.4,-4 l1.4,4 z", "#9aa4ae", "#1e2328", 0.8],
        ],
    },
    // (Each people's fortifications: docs/WAR.md *Fortifications*; rimmed as the works are)
    guardTower: {
        rim: "#c9a24a",
        parts: [
            // A stout square tower, battlemented, two loops in it and its door
            ["M-4.5,-4.5 h9 v13 h-9 z", "#bdb5a5", "#1e1e1a", 1],
            ["M-5.5,-4.5 v-4.1 h2.2 v2 h2.2 v-2 h2.2 v2 h2.2 v-2 h2.2 v4.1 z", "#a8a092", "#1e1e1a", 1],
            ["M-0.6,-2.6 h1.2 v3 h-1.2 z", "#1a1410", null, 0],
            ["M-1.8,8.5 v-3.6 a1.8,1.8 0 0 1 3.6,0 v3.6 z", "#2a1a10", null, 0],
        ],
    },
    garrison: {
        rim: "#c9a24a",
        parts: [
            // A curtain wall, battlemented, its gate in it, a turret at each end
            ["M-7.8,-0.5 h15.6 v7 h-15.6 z", "#bdb5a5", "#1e1e1a", 1],
            ["M-3.6,-0.5 v-1.8 h1.8 v1.8 z M-0.9,-0.5 v-1.8 h1.8 v1.8 z M1.8,-0.5 v-1.8 h1.8 v1.8 z", "#bdb5a5", "#1e1e1a", 0.8],
            ["M-7.8,-3.5 h3.2 v10 h-3.2 z M4.6,-3.5 h3.2 v10 h-3.2 z", "#a8a092", "#1e1e1a", 1],
            ["M-8.1,-3.5 v-2.5 h1.27 v1.2 h1.26 v-1.2 h1.27 v2.5 z M4.3,-3.5 v-2.5 h1.27 v1.2 h1.26 v-1.2 h1.27 v2.5 z", "#a8a092", "#1e1e1a", 1],
            ["M-6.6,0 h0.8 v2.6 h-0.8 z M5.8,0 h0.8 v2.6 h-0.8 z", "#1a1410", null, 0],
            ["M-2.2,6.5 v-3.9 a2.2,2.2 0 0 1 4.4,0 v3.9 z", "#2a1a10", null, 0],
        ],
    },
    camp: {
        rim: "#d0413a",
        parts: [
            // A tent, its door open, its poles crossed over the top
            ["M-9.5,8.5 L0,-7.5 L9.5,8.5 z", "#c9a46a", "#2a1a0e", 1],
            ["M0,-7.5 L-3,8.5 L3,8.5 z", "#3a2410", null, 0],
            ["M-2,-10.5 L2,-5 M2,-10.5 L-2,-5", null, "#2a1a0e", 1.2],
        ],
    },
};

/**
 * The rim a place's icon has for who holds it (core/places.js HOLDERS): its people's gold, the
 * outlaws' red, the dead's pale green, a great beast's fiery orange; grey once cleared, until it's
 * held again.
 */
export const PLACE_RIMS = Object.freeze({ friendly: "#e2c25a", bandits: "#d0413a", dead: "#7fe0b8", beast: "#ff7a1a", cleared: "#8a8a8a" });

/**
 * The rim a people's works' icon has (docs/WAR.md *The works*), by who holds it and how they
 * stand with the player's people: theirs or an ally's gold, a people at war with them a burnt
 * orange, anyone else's pale; brigands' the outlaws' red.
 */
export const WORKS_RIMS = Object.freeze({ own: "#e2c25a", enemy: "#e07a2a", other: "#a8b8c8", held: "#d0413a" });

/** Each kind of works' icon (LOOKS). */
export const WORKS_ICONS = Object.freeze({ "lumber mill": "mill", mine: "mine", quarry: "quarry" });

/** Each kind of fortification's icon (LOOKS), rimmed as a works' is, by its people (WORKS_RIMS). */
export const FORT_ICONS = Object.freeze({ tower: "guardTower", garrison: "garrison" });

// The paths, made once (Path2D: only in the browser)
let paths = null;

function pathsOf(kind) {
    paths ??= Object.fromEntries(Object.entries(LOOKS).map(([id, { parts }]) => [id, parts.map(([d]) => new Path2D(d))]));

    return paths[kind];
}

/** The kinds of building that have an icon. */
export const ICON_KINDS = Object.freeze(Object.keys(LOOKS));

/**
 * Draw the icon of a building of `kind` (tavern, blacksmith, church, guild, hall, keep), or of a
 * place (castle, cave and the rest), on a canvas's context, centred at x, y, `size` pixels across,
 * rimmed in its own colour or `rim`'s.
 */
export function drawBuildingIcon(context, kind, x, y, size, rim = null) {
    const look = LOOKS[kind];

    if (!look) {
        return;
    }

    const scale = size / 26;

    context.save();
    context.translate(x, y);
    context.scale(scale, scale);

    // The badge: dark, rimmed in its colour, with a shadow under it
    context.beginPath();
    context.arc(0, 0.8, 12.6, 0, 2 * Math.PI);
    context.fillStyle = "rgba(0, 0, 0, 0.45)";
    context.fill();
    context.beginPath();
    context.arc(0, 0, 12, 0, 2 * Math.PI);
    context.fillStyle = "#231a14";
    context.fill();
    context.lineWidth = 1.8;
    context.strokeStyle = rim ?? look.rim;
    context.stroke();

    context.lineCap = context.lineJoin = "round";

    pathsOf(kind).forEach((path, k) => {
        const [, fill, stroke, width] = look.parts[k];

        if (fill) {
            context.fillStyle = fill;
            context.fill(path);
        }

        if (stroke && width) {
            context.strokeStyle = stroke;
            context.lineWidth = width;
            context.stroke(path);
        }
    });

    context.restore();
}
