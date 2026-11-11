// The unit tests ordered so that those a change can reach run first (scripts/test-affected.js,
// npm run test:affected): what a file reaches by imports, which tests read files or start
// processes, the three groups every test is in exactly one of, and the tests run as `npm test`
// runs them
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { importsIn, importsWorkedOut, namedBeside } from "../scripts/lib/imports.js";
import { EVERY, importedBy, optionsOf, order, reach, touches } from "../scripts/test-affected.js";

// A made-up repository: each file's code
const CODE = {
    "test/sword.test.js": 'import assert from "node:assert/strict";\nimport { sword } from "../client/js/core/sword.js";\nimport { help } from "./helpers.js";\n',
    "test/shield.test.js": 'import { shield } from "../client/js/core/shield.js";\n',
    "test/server.test.js": 'import { Server } from "../server/server.js";\n',
    "test/pages.test.js": 'import { readFileSync } from "node:fs";\n\nconst page = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");\n',
    "test/words.test.js": 'import { words } from "../client/js/app/words.js";\n',
    "test/helpers.js": "export const help = 1;\n",
    "client/js/core/sword.js": 'import {\n    steel,\n} from "./steel.js";\nexport { edge } from "./edge.js";\n',
    "client/js/core/shield.js": 'import { steel } from "./steel.js";\nexport const shield = () => import("./boss.js");\n',
    "client/js/core/steel.js": "export const steel = 1;\n",
    "client/js/core/edge.js": "export const edge = 1;\n",
    "client/js/core/boss.js": "export default 1;\n",
    "client/js/app/words.js": 'import * as THREE from "three";\nexport const words = THREE;\n',
    "server/server.js": 'import { Worker } from "node:worker_threads";\nexport const Server = () => new Worker(new URL("./thread.js", import.meta.url));\n',
    "server/thread.js": 'import { steel } from "../client/js/core/steel.js";\n',
};
const TESTS = Object.keys(CODE).filter((file) => file.endsWith(".test.js"));
const importsOf = (file) => (CODE[file] ? importedBy(file, CODE[file]) : []);
const graph = {
    reachOf: (test) => reach(test, importsOf),
    touching: (test) => [...reach(test, importsOf)].some((file) => !file.startsWith("client/") && touches(CODE[file] ?? "")),
};

describe("what a module imports, told from its code (scripts/lib/imports.js)", () => {
    it("finds every way a module names another, each once, and says when one's worked out as it runs", () => {
        const code = 'import a from "./a.js";\nimport {\n    b,\n    c,\n} from "../b.js";\nexport * from "./c.js";\nexport { d } from "./a.js";\nimport "./e.js";\nimport fs from "node:fs";\n\nconst f = () => import("./f.js");\n// (Not an import: taken from "./g.js")\nexport const from = "./h.js";\n';

        assert.deepEqual(importsIn(code), ["./a.js", "../b.js", "./c.js", "node:fs", "./e.js", "./f.js"]);
        assert.equal(importsWorkedOut(code), false);
        assert.equal(importsWorkedOut("const load = (name) => import(name);\n"), true);
        assert.equal(importsWorkedOut("const load = () => import(`./${name}.js`);\n"), true);
        assert.deepEqual(namedBeside('new Worker(new URL("./thread.js", import.meta.url));\nfetch(new URL("../models/a.bin", import.meta.url));\nnew URL("/elsewhere", "https://example.org");\n'), ["./thread.js", "../models/a.bin"]);
    });
});

describe("the unit tests ordered by what a change can reach (scripts/test-affected.js)", () => {
    it("follows a file's imports from the repository's root: what it imports, what they import, a thread's code named beside it; not packages, nor Node's own", () => {
        assert.deepEqual(importedBy("test/sword.test.js", CODE["test/sword.test.js"]), ["client/js/core/sword.js", "test/helpers.js"]);
        assert.deepEqual(importedBy("server/server.js", CODE["server/server.js"]), ["server/thread.js"]);
        assert.deepEqual(importedBy("client/js/app/words.js", CODE["client/js/app/words.js"]), []);
        assert.deepEqual(importedBy("a.js", 'import "../outside.js";\n'), [], "nothing outside the repository");

        assert.deepEqual([...reach("test/sword.test.js", importsOf)].sort(), ["client/js/core/edge.js", "client/js/core/steel.js", "client/js/core/sword.js", "test/helpers.js", "test/sword.test.js"]);
        assert.deepEqual([...reach("test/shield.test.js", importsOf)].sort(), ["client/js/core/boss.js", "client/js/core/shield.js", "client/js/core/steel.js", "test/shield.test.js"]);
        assert.deepEqual([...reach("test/server.test.js", importsOf)].sort(), ["client/js/core/steel.js", "server/server.js", "server/thread.js", "test/server.test.js"]);

        // (A file named beside a module that isn't code: reached, and followed no further)
        assert.deepEqual([...reach("test/pages.test.js", importsOf)].sort(), ["client/index.html", "test/pages.test.js"]);
    });

    it("knows the code that can read files or start processes or threads, by what it imports", () => {
        assert.equal(touches(CODE["test/pages.test.js"]), true);
        assert.equal(touches(CODE["server/server.js"]), true);
        assert.equal(touches('import { spawn } from "node:child_process";\n'), true);
        assert.equal(touches('import { mkdtemp } from "node:fs/promises";\n'), true);
        assert.equal(touches(CODE["test/sword.test.js"]), false);
        assert.equal(touches('import path from "node:path";\n// (readFileSync isn\'t called here)\n'), false);
    });

    it("runs first the tests a change can reach, then those that read files or start processes, then the rest: every test once, in the order they came", () => {
        const ordered = (changed) => order(TESTS, changed, graph);

        // (A module two tests reach, one of them through a thread's code; the tests that read files or start threads next, but for the one already first)
        assert.deepEqual(ordered(["client/js/core/steel.js"]), { first: ["test/sword.test.js", "test/shield.test.js", "test/server.test.js"], then: ["test/pages.test.js"], rest: ["test/words.test.js"] });

        // (A test itself; a helper; a module imported as it runs; a file that isn't code, named beside a test)
        assert.deepEqual(ordered(["test/words.test.js"]).first, ["test/words.test.js"]);
        assert.deepEqual(ordered(["test/helpers.js"]).first, ["test/sword.test.js"]);
        assert.deepEqual(ordered(["client/js/core/boss.js"]).first, ["test/shield.test.js"]);
        assert.deepEqual(ordered(["client/index.html"]), { first: ["test/pages.test.js"], then: ["test/server.test.js"], rest: ["test/sword.test.js", "test/shield.test.js", "test/words.test.js"] });

        // (Nothing a test imports, or nothing at all: those that read files still first)
        assert.deepEqual(ordered(["docs/WORLD.md", "client/styles.css"]), { first: [], then: ["test/server.test.js", "test/pages.test.js"], rest: ["test/sword.test.js", "test/shield.test.js", "test/words.test.js"] });
        assert.deepEqual(ordered([]), ordered(["docs/WORLD.md"]));

        // (A file taken away: whoever imported it is reached)
        assert.deepEqual(order(TESTS, ["client/js/core/gone.js"], { ...graph, reachOf: (test) => reach(test, (file) => (file === "test/words.test.js" ? ["client/js/core/gone.js"] : importsOf(file))) }).first, ["test/words.test.js"]);

        // (The packages, how the tests are run, or what's loaded into every one of them: all of them)
        for (const file of EVERY) {
            assert.deepEqual(ordered([file, "client/js/core/edge.js"]), { first: TESTS, then: [], rest: [] }, file);
        }

        // (Whatever changed, every test is in one group and one only)
        for (const changed of [[], ["client/js/core/steel.js"], ["server/thread.js", "test/pages.test.js"], ["package.json"], Object.keys(CODE)]) {
            const { first, then, rest } = ordered(changed);

            assert.deepEqual([...first, ...then, ...rest].sort(), [...TESTS].sort(), changed.join(" "));
        }
    });

    it("runs them as `npm test` does: Node's options from package.json's own script, which is still written the way it reads", () => {
        assert.deepEqual(optionsOf("node --import ./test/plan-cache.js --test --test-timeout=900000 test/*.test.js"), ["--import", "./test/plan-cache.js", "--test", "--test-timeout=900000"]);
        assert.deepEqual(optionsOf("node --test test/*.test.js"), ["--test"]);
        assert.throws(() => optionsOf("node --test test/"), /isn't "node <options> test\/\*\.test\.js" any more/);
        assert.throws(() => optionsOf("node scripts/run-tests.js"), /any more/);
        assert.throws(() => optionsOf("node --test test/core/*.test.js test/*.test.js"), /any more/);
        assert.throws(() => optionsOf("vitest run"), /any more/);

        const script = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts.test;

        assert.ok(optionsOf(script).includes("--test"), script);
    });

    it("lists every unit test file there is, once, whatever's changed", () => {
        const listed = execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/test-affected.js", import.meta.url)), "--list"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
            .trim()
            .split("\n");
        const tests = readdirSync(new URL(".", import.meta.url))
            .filter((name) => name.endsWith(".test.js"))
            .map((name) => `test/${name}`);

        assert.deepEqual([...listed].sort(), tests.sort());
    });
});
