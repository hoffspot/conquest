// The shape a command may have, checked as it's heard from another's game (the scaling plan's
// 3-29).
//
// The rule the protocol keeps: a game tells the world what its player asks for, and nothing of
// what's so. A command names a thing to do and what to do it to; the world decides whether it can
// be done, by its own record of who the player is, where they stand and what they carry. Nothing
// a game says of its hero's place, health, gold or pack is taken for true, because none of it is
// asked: the hero's own state goes the other way only.
//
// So a command is small and plain, and this says how small and how plain, a kind at a time
// (COMMAND_SHAPES): a known type; fields that are a word, a number, a pair of them or nothing,
// but for the few a kind names as holding more (an offer's things, a table's orders); no more
// of it, no deeper, and no text longer than SHAPE allows; and nothing in it but plain objects,
// arrays and such values. The limits sit well above what the game sends (test/commandshape.
// test.js holds every command the game's code makes to them). What a handler makes of a field
// is still the handler's to check: this only keeps what reaches it bounded and unsurprising.
// One surprise it keeps out by name: a text that's "__proto__", "constructor" or any other name
// every object has. { type: "abandon", thread: "__proto__" } once gave up the thread every
// object is, and set what a thread keeps on all of them: the whole world's process, spoilt by
// one command (found by the hundred thousand of test/hardening.test.js).

/**
 * How much a command may hold: an id or a word no longer than `word` characters, a text no
 * longer than `text`; a number no further from nought than `far`; a small command no more than
 * `nodes` values in all and `depth` deep, a big one (COMMAND_SHAPES `big`) `bigNodes` and
 * `bigDepth`; a field left open to more than a word (a kind's `more`) no more than `more`
 * values.
 */
export const SHAPE = Object.freeze({ word: 96, text: 256, far: 1e9, nodes: 48, depth: 3, bigNodes: 4096, bigDepth: 7, more: 2048 });

const word = (value) => typeof value === "string" && value.length <= SHAPE.word;
const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= -SHAPE.far && value <= SHAPE.far;
const pair = (value) => Array.isArray(value) && value.length === 2 && number(value[0]) && number(value[1]);
// What most fields are: a word, a number, a yes or no, a place, or nothing
const simple = (value) => value === null || value === undefined || typeof value === "boolean" || word(value) || number(value) || pair(value);
const text = (value) => value === null || value === undefined || (typeof value === "string" && value.length <= SHAPE.text);
const required = (check) => (value) => value !== undefined && value !== null && check(value);
const within = (least, most) => (value) => value === undefined || (number(value) && value > least && value <= most);

/**
 * Each kind of command a game may send (core/host.js `command`): `fields`, those held to more
 * than being simple (a check each); `more`, those that may hold more than a word (a thing
 * bought, an order, a pick), each a plain tree of no more than SHAPE.more values; `big`, a
 * kind that may be big (SHAPE); `debug`, one only a world's debugger may give (Host.debugs:
 * its host's player, or an owner, as its rules say).
 */
export const COMMAND_SHAPES = Object.freeze({
    move: { fields: { to: required(pair) } },
    ahead: { fields: { facing: required(number), reach: within(0, 4096) } },
    engage: { fields: { target: required(word) } },
    approach: { fields: { target: required(word) } },
    enter: { fields: { link: required(word) } },
    stop: {},
    unlock: {},
    cast: { fields: { spell: required(word) } },
    summoned: {},
    party: { fields: { do: required(word), words: text } },
    treasure: {},
    read: {},
    pray: {},
    moonroad: {},
    buy: { more: ["item"] },
    sell: {},
    sellJunk: {},
    markJunk: {},
    craft: { more: ["using"] },
    salvage: {},
    salvageJunk: {},
    equip: {},
    unequip: {},
    use: {},
    arrange: {},
    sort: {},
    split: {},
    strongroom: {},
    discard: {},
    undiscard: {},
    drop: {},
    pickUp: {},
    ability: {},
    abandon: {},
    share: {},
    talk: {},
    order: { more: ["order"] },
    outfit: {},
    unoutfit: {},
    rename: { fields: { name: text } },
    pick: { more: ["pick"] },
    rule: {},
    effect: { more: ["effect"] },
    mission: {},
    camp: {},
    clear: {},
    emote: {},
    trade: {},
    offer: { more: ["items"], big: true },
    agree: {},
    cancel: {},
    travel: {},
    table: { more: ["orders", "realm", "counsel", "read"], big: true },
    budget: { fields: { invasion: required(number) } },
    fieldBattle: { debug: true },
    invade: { debug: true },
    rift: { debug: true },
    hellrift: { debug: true },
    rare: { debug: true },
    burn: { debug: true },
    // (What a game played from views asks its world, in place of reading a copy: core/
    // worldview.js answerOf)
    ask: { fields: { what: required(word) } },
});

/** The kinds only a world's debugger may give (COMMAND_SHAPES `debug`). */
export const DEBUG_COMMANDS = Object.freeze(Object.keys(COMMAND_SHAPES).filter((type) => COMMAND_SHAPES[type].debug));

/**
 * What's put in a misshapen command's place, for the world to refuse as it refuses any it
 * doesn't know: so a world played in step by every game (lockstep) still records that the
 * player sent one, and each copy refuses the same.
 */
export const MISSHAPEN = Object.freeze({ type: "misshapen" });

/**
 * A square no further than `reach` metres from someone (`from`: { x, y }): the one asked for
 * ([x, y]), or the one that far towards it. Where one heard from another's game may ask to
 * walk at once (core/netplay.js HEARD.walk).
 */
export function nearer(from, [x, y], reach) {
    const [dx, dy] = [x + 0.5 - from.x, y + 0.5 - from.y];
    const far = Math.sqrt(dx * dx + dy * dy);

    return far <= reach ? [x, y] : [Math.floor(from.x + (dx / far) * reach), Math.floor(from.y + (dy / far) * reach)];
}

const BARRED = new Set(["__proto__", "constructor", "prototype"]);

// How many values a plain tree holds, or Infinity for one that's too deep, holds what isn't
// plain (anything but objects of no kind of their own, arrays, texts, finite numbers, yes, no
// and nothing), a text too long, or a key no plain thing has
function weigh(value, depth, deepest) {
    if (value === null || value === undefined || typeof value === "boolean") {
        return 1;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? 1 : Infinity;
    }

    // (No text that names what every object has: an id's looked up in a table by it, and
    // "__proto__" or "constructor" finds something in every one, to be read as the world's or
    // written over for everything in it)
    if (typeof value === "string") {
        return value.length <= SHAPE.text && !(value in Object.prototype) ? 1 : Infinity;
    }

    if (typeof value !== "object" || depth >= deepest) {
        return Infinity;
    }

    const kind = Object.getPrototypeOf(value);
    let weight = 1;

    if (Array.isArray(value)) {
        for (let k = 0; k < value.length && weight < Infinity; k++) {
            weight += weigh(value[k], depth + 1, deepest);
        }

        return weight;
    }

    if (kind !== Object.prototype && kind !== null) {
        return Infinity;
    }

    for (const key of Object.keys(value)) {
        if (BARRED.has(key) || key.length > SHAPE.word) {
            return Infinity;
        }

        weight += weigh(value[key], depth + 1, deepest);

        if (weight === Infinity) {
            break;
        }
    }

    return weight;
}

/**
 * What's wrong with a command's shape, in a word or two, or null for one that's as it may be:
 * "plain" (not a plain object, or holding what isn't plain), "type" (no kind there is),
 * "big" (more of it than its kind may hold), or the name of the field that isn't as it
 * should be.
 */
export function misshapen(command) {
    if (command === null || typeof command !== "object" || Array.isArray(command) || (Object.getPrototypeOf(command) !== Object.prototype && Object.getPrototypeOf(command) !== null)) {
        return "plain";
    }

    if (typeof command.type !== "string" || !Object.hasOwn(COMMAND_SHAPES, command.type)) {
        return "type";
    }

    const shape = COMMAND_SHAPES[command.type];
    const [nodes, depth] = shape.big ? [SHAPE.bigNodes, SHAPE.bigDepth] : [SHAPE.nodes, SHAPE.depth];
    const weight = weigh(command, 0, depth);

    if (weight === Infinity) {
        return "plain";
    }

    if (weight > nodes) {
        return "big";
    }

    for (const key of Object.keys(command)) {
        const value = command[key];
        const check = shape.fields?.[key];

        if (shape.more?.includes(key)) {
            if (weigh(value, 0, depth) > SHAPE.more) {
                return key;
            }
        } else if (!simple(value) || (check && !check(value))) {
            return key;
        }
    }

    for (const key of Object.keys(shape.fields ?? {})) {
        if (!(key in command) && !shape.fields[key](undefined)) {
            return key;
        }
    }

    return null;
}
