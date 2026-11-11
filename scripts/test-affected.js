// Every unit test, those a change can reach first:
//
//     npm run test:affected                       (as `npm test` runs them, in another order)
//     npm run test:affected -- --list             (only says the order, a file to a line)
//     npm run test:affected -- --test-concurrency=2    (anything else is Node's own, as given)
//
// `npm test` runs the test files in the order of their names, so a change that breaks a test may
// not say so until the last of an hour's work. Here they run in three groups:
//
// 1. the test files the change can reach by imports: those changed themselves, and those that
//    import a changed file, or import what imports it;
// 2. the test files that read files or start processes or threads (themselves, or the server's
//    or the scripts' code they import), whatever changed: no import says what those depend on
//    (the manifest's test reads every file under client/);
// 3. all the rest.
//
// It runs every test, as `npm test` does (with its options, read from package.json): the order is
// all that's different, so a failure shows in minutes, and a pass is as much of one.
//
// What's changed is what the branch has that origin/main hasn't (git diff origin/main...HEAD), and
// what's in the working tree and not committed yet (changed, staged or new).

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { importsIn, namedBeside } from "./lib/imports.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The branch a change is told against. */
export const BASE = "origin/main";

/**
 * Files a change to reaches every test, whatever it imports: the packages and how the tests are
 * run (package.json, package-lock.json), and what's loaded into every test's process
 * (test/plan-cache.js).
 */
export const EVERY = Object.freeze(["package.json", "package-lock.json", "test/plan-cache.js"]);

// Node's own modules that read files or start processes or threads
const TOUCHING = Object.freeze(["node:fs", "node:fs/promises", "node:child_process", "node:worker_threads", "node:cluster"]);

/**
 * Whether code can read files or start processes or threads (it imports what does): what it
 * depends on then is more than its imports say.
 */
export function touches(code) {
    return importsIn(code).some((from) => TOUCHING.includes(from));
}

/**
 * The files a file's code imports, and those it names beside itself for something else to load
 * (a thread's code, a model: `new URL("x", import.meta.url)`): each from the repository's root,
 * with "/" between, as `file` is. Only those named by where they are ("./x.js", "../y.js"): a
 * package's or Node's own isn't the game's to change. One that's since been taken away is still
 * named: taking it away reaches whoever imports it.
 */
export function importedBy(file, code) {
    return [...new Set([...importsIn(code), ...namedBeside(code)])]
        .filter((from) => from.startsWith("."))
        .map((from) => path.posix.normalize(path.posix.join(path.posix.dirname(file), from)))
        .filter((imported) => !imported.startsWith("../"));
}

/**
 * Every file a file reaches by imports: itself, what it imports, what they import, as far as they
 * go. `importsOf(file)` gives the files a file imports (`importedBy` its code; none for what
 * isn't code).
 */
export function reach(file, importsOf) {
    const found = new Set([file]);

    // (Those found as it goes are followed in their turn)
    for (const each of found) {
        for (const imported of importsOf(each)) {
            found.add(imported);
        }
    }

    return found;
}

/**
 * The test files in the order to run them: { first (those the changed files can reach: changed
 * themselves, or reaching one that is), then (those that read files or start processes, whatever
 * changed), rest }, each in the order `tests` came in, every test in exactly one.
 *
 * @param {string[]} tests - The test files.
 * @param {string[]} changed - The files that changed.
 * @param {object} graph
 * @param {(test: string) => Set<string>} graph.reachOf - Every file a test reaches by imports (`reach`).
 * @param {(test: string) => boolean} graph.touching - Whether a test reads files or starts processes.
 */
export function order(tests, changed, { reachOf, touching }) {
    const all = changed.some((file) => EVERY.includes(file));
    const reached = (test) => all || changed.some((file) => reachOf(test).has(file));
    const first = tests.filter(reached);
    const then = tests.filter((test) => !first.includes(test) && touching(test));

    return { first, then, rest: tests.filter((test) => !first.includes(test) && !then.includes(test)) };
}

/**
 * How `npm test` runs the tests, from its script in package.json (`node <options> test/*.test.js`):
 * Node's options, for the same to be given the files in another order. It throws if the script is
 * no longer written that way, rather than run the tests some other way than `npm test` does.
 */
export function optionsOf(script) {
    const words = script.trim().split(/\s+/);

    if (words[0] !== "node" || words.at(-1) !== "test/*.test.js" || !words.includes("--test") || words.slice(1, -1).some((word) => !word.startsWith("-") && !word.startsWith("./"))) {
        throw new Error(`package.json's test script isn't "node <options> test/*.test.js" any more (${script}): scripts/test-affected.js runs the tests as it does, and needs to be told how`);
    }

    return words.slice(1, -1);
}

// What git says (a file to a line), or null if it can't
function git(...args) {
    try {
        return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
            .split("\n")
            .filter(Boolean);
    } catch {
        return null;
    }
}

// Run from the command line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const list = args.includes("--list");
    const options = optionsOf(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts.test);
    const tests = readdirSync(path.join(root, "test"))
        .filter((name) => name.endsWith(".test.js"))
        .sort()
        .map((name) => `test/${name}`);

    // What's changed: on the branch, and in the working tree
    const branch = git("diff", "--name-only", `${BASE}...HEAD`);
    const tree = [...(git("diff", "--name-only", "HEAD") ?? []), ...(git("ls-files", "--others", "--exclude-standard") ?? [])];
    const changed = [...new Set([...(branch ?? []), ...tree])].sort();

    // Each file read once: what it imports, and whether it reads files or starts processes (the
    // game's own code only: not a package's, nor what isn't JavaScript)
    const files = new Map();
    const read = (file) => {
        if (!files.has(file)) {
            const full = path.join(root, file);
            const code = /\.m?js$/.test(file) && existsSync(full) && statSync(full).isFile() ? readFileSync(full, "utf8") : null;

            files.set(file, { imports: code === null ? [] : importedBy(file, code), touches: code !== null && touches(code) });
        }

        return files.get(file);
    };
    const reaches = new Map();
    const reachOf = (test) => reaches.get(test) ?? reaches.set(test, reach(test, (file) => read(file).imports)).get(test);
    // (The code that runs in Node: the test's own, its helpers', the server's, the scripts'. The
    // game's own, which runs in the page, reads nothing there)
    const touching = (test) => [...reachOf(test)].some((file) => !file.startsWith("client/") && read(file).touches);
    const { first, then, rest } = order(tests, changed, { reachOf, touching });

    console.error(
        [
            branch ? `${changed.length} files changed (against ${BASE}, and not committed yet).` : `${changed.length} files changed and not committed yet (there's no ${BASE} here to tell the branch's changes by: git fetch origin main).`,
            `First the ${first.length} test files they can reach by imports, then the ${then.length} that read files or start processes or threads, then the other ${rest.length}.`,
        ].join("\n"),
    );

    if (list) {
        console.log([...first, ...then, ...rest].join("\n"));
    } else {
        const child = spawn(process.execPath, [...options, ...args, ...first, ...then, ...rest], { cwd: root, stdio: "inherit" });

        child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
    }
}
