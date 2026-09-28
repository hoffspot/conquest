// What goes between a game's host and its players, and into a saved world (docs/WAR.md), as
// text: JSON, but for numbers JSON can't carry (Infinity, -Infinity, NaN: "never yet", "not
// till then" in the battle), which go as { "$": "Infinity" } and come back as they were.
//
// Pure JavaScript, the same in Node and the browser.

const KEEP = "$";

/** `value` (plain data) as text. */
export function encode(value) {
    return JSON.stringify(value, (key, each) => (typeof each === "number" && !Number.isFinite(each) ? { [KEEP]: String(each) } : each));
}

/** Text from encode, as the plain data it was. */
export function decode(text) {
    return JSON.parse(text, (key, each) => {
        if (each && typeof each === "object" && !Array.isArray(each) && typeof each[KEEP] === "string") {
            const keys = Object.keys(each);

            if (keys.length === 1) {
                return Number(each[KEEP]);
            }
        }

        return each;
    });
}
