// What's round the player out in the world, for what's heard there (audio/ambience.js): the land
// underfoot and whether it's high; how far the waters near are (a stream, a river, a waterfall,
// the sea, a lake); how much of round about is a settlement's, and how far its market and its
// smithy are; how far a camp fire or a lit brazier is. Asked every half second or so, each answer
// cheap: the plan's lands, the rivers near, the settlements as they're laid out, the lights drawn.

import { CHUNK, WORLD_SIZE } from "../core/overworld.js";

// High: up the mountains, on the snow or the tundra, or this high (metres: the footing's scree,
// audio/footing.js)
const HIGH = 175;
const HIGH_LANDS = new Set(["mountain", "snow", "tundra"]);

// The sea and lakes looked for round about: this far off (metres), every so many ways round
const RINGS = [12, 30, 55, 85, 120, 150];
const SPOKES = 12;

// Rivers looked for this far from their banks (metres); a narrow one (this half-width or less, or
// a mountain stream) is heard as a stream; a lip this high (metres) as a waterfall
const RIVERS = 90;
const NARROW = 2.5;
const LIP = 0.6;

// A settlement round about: looked for here and this far off, every so many ways round; its
// market and smithy heard this far off (metres)
const ROUND = 22;
const MARKET = 60;
const SMITHY = 80;

export class Surroundings {
    /**
     * @param {object} overworld - The world outside (core/overworld.js): its lands,
     *   waters and settlements.
     */
    constructor(overworld) {
        this.overworld = overworld;

        // The waterfalls' lips by chunk ("cx cy" → [{ x, z }]), each found once
        this.lips = new Map();
    }

    /**
     * What's round (x, z) (metres), for audio/ambience.js ambienceOf (all but the place and the
     * time): `height`, how high the ground is there (metres: as the player stands on it, not
     * worked out again), `lights`, the lights drawn near ([{ x, z, kind }]: world/lights.js), and
     * whether the torches and braziers are `lit`.
     */
    at(x, z, { height = 0, lights = [], lit = false } = {}) {
        const land = this.#landAt(x, z);
        const settled = this.#settled(x, z);
        const places = this.#placesNear(x, z);

        return {
            land,
            high: HIGH_LANDS.has(land) || height > HIGH,
            water: { ...this.#rivers(x, z), ...this.#still(x, z) },
            settled,
            market: nearest(places.markets, x, z)?.far ?? Infinity,
            smithy: nearest(places.smithies, x, z, SMITHY),
            fire: nearest(lights.filter(({ kind }) => kind === "fire"), x, z)?.far ?? Infinity,
            brazier: lit ? (nearest(lights.filter(({ kind }) => kind === "brazier"), x, z)?.far ?? Infinity) : Infinity,
        };
    }

    #landAt(x, z) {
        return this.overworld.biomeAt(clamp(x), clamp(z));
    }

    // The nearest river (how far from its bank: as a stream if it's narrow), and the nearest
    // waterfall's lip
    #rivers(x, z) {
        const { waters } = this.overworld;
        const river = waters?.river(x, z, RIVERS);
        const found = {};

        if (river) {
            found[river.stream || river.half <= NARROW ? "stream" : "river"] = Math.max(0, river.gap);
        }

        const [cx, cz] = [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];
        let falls = Infinity;

        for (let j = cz - 1; j <= cz + 1; j++) {
            for (let i = cx - 1; i <= cx + 1; i++) {
                for (const lip of this.#lipsIn(i, j)) {
                    falls = Math.min(falls, Math.hypot(lip.x - x, lip.z - z));
                }
            }
        }

        return { ...found, falls };
    }

    // The waterfalls' lips in a chunk: where a river spills over one high enough to fall in a
    // sheet (world/falls.js draws it there)
    #lipsIn(cx, cz) {
        const key = `${cx} ${cz}`;

        if (!this.lips.has(key)) {
            const { waters } = this.overworld;
            const lips = [];

            for (const piece of waters?.riversNear(cx, cz) ?? []) {
                if (piece.lip >= LIP) {
                    const [x, z] = waters.placeOf(piece.bx, piece.by);

                    lips.push({ x, z });
                }
            }

            this.lips.set(key, lips);
        }

        return this.lips.get(key);
    }

    // How far the sea and the nearest lake are: the lands round about, ring by ring
    #still(x, z) {
        const found = { sea: Infinity, lake: Infinity };

        for (const ring of RINGS) {
            for (let k = 0; k < SPOKES; k++) {
                const angle = (2 * Math.PI * (k + (ring % 2) / 2)) / SPOKES;
                const land = this.#landAt(x + ring * Math.cos(angle), z + ring * Math.sin(angle));

                if (land in found) {
                    found[land] = Math.min(found[land], ring);
                }
            }
        }

        return found;
    }

    // How much of round about is a settlement's (0 to 1): here, and a little way off all round
    #settled(x, z) {
        let settled = this.overworld.settled(Math.floor(x), Math.floor(z)) ? 1 : 0;

        for (let k = 0; k < 8; k++) {
            const angle = (k * Math.PI) / 4;

            settled += this.overworld.settled(Math.floor(x + ROUND * Math.cos(angle)), Math.floor(z + ROUND * Math.sin(angle))) ? 1 : 0;
        }

        return settled / 9;
    }

    // The markets and smithies near: the town's, and those of the settlement here (each { x, z })
    #placesNear(x, z) {
        const { overworld } = this;
        const { stamp } = overworld;
        const markets = stamp.market ? [{ x: stamp.market[0], z: stamp.market[1] }] : [];
        const smithies = (stamp.buildings ?? []).filter(({ kind, name }) => kind === "landmark" && name === "blacksmith").map(({ x, y }) => ({ x, z: y }));
        const settlement = overworld.settlements?.at(Math.floor(x), Math.floor(z));

        if (settlement) {
            const { at, town } = settlement;

            if (town.market?.centre) {
                markets.push({ x: at[0] + town.market.centre[0], z: at[1] + town.market.centre[1] });
            }

            for (const { kind, name, x: px, y: py } of town.pieces ?? []) {
                if (kind === "landmark" && name === "blacksmith") {
                    smithies.push({ x: at[0] + px, z: at[1] + py });
                }
            }
        }

        return { markets: markets.filter(({ x: mx, z: mz }) => Math.hypot(mx - x, mz - z) < MARKET), smithies };
    }
}

// The nearest of some places to (x, z), and how far it is ({ x, z, far }), within `within` metres;
// or null
function nearest(places, x, z, within = Infinity) {
    let best = null;

    for (const place of places) {
        const far = Math.hypot(place.x - x, place.z - z);

        if (far < within && (!best || far < best.far)) {
            best = { x: place.x, z: place.z, far };
        }
    }

    return best;
}

// (Kept on the world's map, for asking its lands and heights)
const clamp = (v) => Math.max(0, Math.min(WORLD_SIZE - 0.01, v));
