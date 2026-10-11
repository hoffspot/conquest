// The game's code loaded the same in every browser (client/js/main.js): the one module of it that
// waits as it loads (a top-level await: core/navigation.js, for its WebAssembly) is loaded on its
// own and wholly, before the three that bring in the rest side by side. While it was still waiting,
// mobile Safari went on with modules over it before those they import were done ("Cannot access
// 'TALK_REACH' before initialization": core/host.js's SHOP_REACH, from core/battle.js's), and the
// game never loaded.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const CODE = new URL("../client/js/", import.meta.url);

// Every module of the game's (not the labs' pages'), as paths under client/js
async function modules(dir = "") {
    const found = [];

    for (const entry of await readdir(new URL(dir, CODE), { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== "lab") {
            found.push(...(await modules(`${dir}${entry.name}/`)));
        } else if (entry.name.endsWith(".js")) {
            found.push(`${dir}${entry.name}`);
        }
    }

    return found;
}

describe("the game's code loaded (client/js/main.js)", () => {
    it("has one module that waits as it loads (a top-level await): the way-finding's", async () => {
        const waiting = [];

        for (const path of await modules()) {
            // (Top-level code isn't indented here; an await at the start of a line, or after an
            // assignment's "=", at the top level)
            const source = await readFile(new URL(path, CODE), "utf8");

            if (/^(?:await |(?:export )?(?:const|let|var) [^\n=]+= await )/m.test(source)) {
                waiting.push(path);
            }
        }

        assert.deepEqual(waiting, ["core/navigation.js"]);
    });

    it("loads it on its own, and waits for it, before bringing in the rest side by side", async () => {
        const main = await readFile(new URL("main.js", CODE), "utf8");
        const alone = main.indexOf('await import("./core/navigation.js");');
        const rest = main.indexOf('await Promise.all([import("./app/session.js"), import("./app/creator.js"), import("./app/hud.js")])');

        assert.ok(alone > 0 && rest > alone, "the way-finding first");
    });
});
