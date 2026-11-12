// node --import <this> --test ...: every key any battle's actor has, as the tests play, written
// (those seen, and how many shapes) to KEYS_OUT at exit.
import { appendFileSync } from "node:fs";

const { Battle } = await import(`${process.env.KEYS_ROOT}/client/js/core/battle.js`);
const seen = new Map();
const advance = Battle.prototype.advance;
let calls = 0;

Battle.prototype.advance = function (ms) {
    const events = advance.call(this, ms);

    if (calls++ % 10 === 0) {
        for (const actor of this.actors) {
            for (const key of Object.keys(actor)) {
                seen.set(key, (seen.get(key) ?? 0) + 1);
            }
        }
    }

    return events;
};

process.on("exit", () => {
    if (seen.size) {
        appendFileSync(process.env.KEYS_OUT, `${JSON.stringify(Object.fromEntries(seen))}\n`);
    }
});
