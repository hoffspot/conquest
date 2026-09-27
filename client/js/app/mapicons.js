// Icons for the buildings the player has gone into, on the minimap and the world map: a round
// badge, rimmed in the colour of what the building is, with its sign in it: a foaming tankard
// for a tavern, an anvil for a smithy, a temple's columns under its pediment for a temple, and
// crossed swords behind a shield for an adventurers' guild. Drawn on a canvas, from paths on a
// grid 24 across, centred on 0, 0.

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
};

// The paths, made once (Path2D: only in the browser)
let paths = null;

function pathsOf(kind) {
    paths ??= Object.fromEntries(Object.entries(LOOKS).map(([id, { parts }]) => [id, parts.map(([d]) => new Path2D(d))]));

    return paths[kind];
}

/** The kinds of building that have an icon. */
export const ICON_KINDS = Object.freeze(Object.keys(LOOKS));

/**
 * Draw the icon of a building of `kind` (tavern, blacksmith, church, guild) on a canvas's
 * context, centred at x, y, `size` pixels across.
 */
export function drawBuildingIcon(context, kind, x, y, size) {
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
    context.strokeStyle = look.rim;
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
