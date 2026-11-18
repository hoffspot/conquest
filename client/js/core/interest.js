// Who's near where (generated/multiplayer_scaling_plan.md 1-3): the battle's characters kept by
// the square of ground they stand on, a grid of 32 m squares for each map, only the squares with
// anyone on them kept. Asked who's within a reach of a spot, it looks through the squares the
// reach touches and no one else: at a hundred players spread over the land, most of the battle's
// thousands are near none of them and are never looked at.
//
// The authority's alone, and nothing of the battle's: it reads where characters stand and writes
// nothing to them, so what it's asked changes no step, no checksum and no save. Who uses it must
// come out the same as going through everyone would (core/motion.js packMotion does, byte for
// byte: test/interest.test.js).
//
// Pure: no DOM, no network, no trigonometry.

/** How wide a square of the grid is (m). */
export const INTEREST = Object.freeze({ cell: 32 });

const OFFSET = 0x8000;
const SPAN = 0x10000;
const keyOf = (cx, cy) => (cx + OFFSET) * SPAN + (cy + OFFSET);

// How many squares a side a block of them is
const BLOCK = 8;

/** A battle's characters by where they stand: brought up to date (refresh), then asked (near). */
export class Interest {
    // Each map's ground with anyone on it: map id -> { squares (a square's key -> the square),
    // blocks (a block's key -> its squares) }. A square: { cx, cy, who (its characters' records) };
    // a block is BLOCK squares a side, so a reach is asked of a few blocks, not of every square
    // it touches (a reach of 160 m touches 121 squares, nearly all of them empty)
    #maps = new Map();

    // Each character's record: { actor, index, map, square, turn }
    #where = new WeakMap();

    #turn = 0;

    /** How many characters it holds. */
    size = 0;

    /** How many it's moved from one square to another, or put in or taken out, since it was made. */
    moved = 0;

    /**
     * Brought up to date with the battle's characters as they stand: anyone new put in, anyone
     * who's crossed into another square (or onto another map) moved, anyone gone taken out, and
     * each one's place in `actors` kept (near gives it). Everyone's looked at, but only that:
     * two sums and a comparison each.
     */
    refresh(actors) {
        const turn = ++this.#turn;
        const { cell } = INTEREST;

        for (let index = 0; index < actors.length; index++) {
            const actor = actors[index];
            const cx = Math.floor(actor.x / cell);
            const cy = Math.floor(actor.y / cell);
            let record = this.#where.get(actor);

            if (!record) {
                record = { actor, index, map: actor.map, square: null, turn };
                this.#where.set(actor, record);
                this.#put(record, cx, cy);
                this.size++;
            } else if (record.map !== actor.map || record.square.cx !== cx || record.square.cy !== cy) {
                this.#take(record);
                record.map = actor.map;
                this.#put(record, cx, cy);
            }

            record.index = index;
            record.turn = turn;
        }

        // (Someone's gone from the battle: whoever wasn't met this time is taken out)
        if (this.size !== actors.length) {
            const gone = [];

            for (const { squares } of this.#maps.values()) {
                for (const { who } of squares.values()) {
                    for (const record of who) {
                        if (record.turn !== turn) {
                            gone.push(record);
                        }
                    }
                }
            }

            for (const record of gone) {
                this.#take(record);
                this.#where.delete(record.actor);
                this.size--;
                this.moved++;
            }
        }
    }

    #put(record, cx, cy) {
        let ground = this.#maps.get(record.map);

        if (!ground) {
            this.#maps.set(record.map, (ground = { squares: new Map(), blocks: new Map() }));
        }

        const key = keyOf(cx, cy);
        let square = ground.squares.get(key);

        if (!square) {
            const block = keyOf(Math.floor(cx / BLOCK), Math.floor(cy / BLOCK));

            ground.squares.set(key, (square = { cx, cy, key, block, who: new Set() }));

            if (!ground.blocks.has(block)) {
                ground.blocks.set(block, new Set());
            }

            ground.blocks.get(block).add(square);
        }

        square.who.add(record);
        record.square = square;
        this.moved++;
    }

    // Out of its square; a square, a block and a map left with no one are let go of
    #take(record) {
        const ground = this.#maps.get(record.map);
        const { square } = record;

        square.who.delete(record);
        record.square = null;

        if (square.who.size === 0) {
            const block = ground.blocks.get(square.block);

            ground.squares.delete(square.key);
            block.delete(square);

            if (block.size === 0) {
                ground.blocks.delete(square.block);
            }

            if (ground.squares.size === 0) {
                this.#maps.delete(record.map);
            }
        }
    }

    /**
     * Everyone within `reach` (m) of a spot on a map, as it was last brought up to date: `visit`
     * called for each with their place in the battle's characters and how far off they are,
     * squared (m²: dx² + dy², the character's place less the spot's), in no order to rely on.
     * Returns how many it looked at to find them.
     */
    near(map, x, y, reach, visit) {
        const ground = this.#maps.get(map);

        if (!ground) {
            return 0;
        }

        const { cell } = INTEREST;
        const [x0, x1] = [Math.floor((x - reach) / cell), Math.floor((x + reach) / cell)];
        const [y0, y1] = [Math.floor((y - reach) / cell), Math.floor((y + reach) / cell)];
        const [bx0, bx1] = [Math.floor(x0 / BLOCK), Math.floor(x1 / BLOCK)];
        const [by0, by1] = [Math.floor(y0 / BLOCK), Math.floor(y1 / BLOCK)];
        const within = reach * reach;
        let looked = 0;

        // (A reach wider than the map has blocks: through its squares, not the reach's blocks)
        if (!((bx1 - bx0 + 1) * (by1 - by0 + 1) <= ground.blocks.size)) {
            for (const square of ground.squares.values()) {
                if (square.cx >= x0 && square.cx <= x1 && square.cy >= y0 && square.cy <= y1) {
                    looked += Interest.#look(square.who, x, y, within, visit);
                }
            }

            return looked;
        }

        for (let bx = bx0; bx <= bx1; bx++) {
            for (let by = by0; by <= by1; by++) {
                const block = ground.blocks.get(keyOf(bx, by));

                if (block) {
                    for (const square of block) {
                        if (square.cx >= x0 && square.cx <= x1 && square.cy >= y0 && square.cy <= y1) {
                            looked += Interest.#look(square.who, x, y, within, visit);
                        }
                    }
                }
            }
        }

        return looked;
    }

    static #look(who, x, y, within, visit) {
        for (const { actor, index } of who) {
            const dx = actor.x - x;
            const dy = actor.y - y;
            const apart = dx * dx + dy * dy;

            if (apart <= within) {
                visit(index, apart);
            }
        }

        return who.size;
    }

    /** How many squares have anyone on them, over every map. */
    get squares() {
        let total = 0;

        for (const { squares } of this.#maps.values()) {
            total += squares.size;
        }

        return total;
    }
}

const kept = new WeakMap();

/** A battle's grid, made the first time it's asked for and kept with the battle (not in it). */
export function interestOf(battle) {
    let interest = kept.get(battle);

    if (!interest) {
        kept.set(battle, (interest = new Interest()));
    }

    return interest;
}
