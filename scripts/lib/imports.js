// What a module imports, told from its code without running it: for whoever needs to know what a
// file is made of (the unit tests' kept plans, by the planner's code: test/plan-cache.js) or what
// a change can reach (scripts/test-affected.js). It reads the code as text, the way the game's is
// written (an import or export statement starting its line); test/plan-cache.test.js checks it
// finds every module Node loads for the planner.

// `import ... from "x"` and `export ... from "x"` (over several lines, as the game's are written),
// `import "x"`, and `import("x")`
const IMPORTS = [/^[ \t]*(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']/gm, /^[ \t]*import\s*["']([^"']+)["']/gm, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g];

// An import() of something worked out as it runs
const WORKED_OUT = /\bimport\s*\(\s*(?!["'])/;

// `new URL("x", import.meta.url)`: a file beside the module, named for something else to load (a
// thread's code, a model, a page)
const BESIDE = /\bnew URL\(\s*["'`]([^"'`$]+)["'`]\s*,\s*import\.meta\.url\s*\)/g;

/** Every module a module's code imports, as it names them ("./x.js", "../y.js", "three", "node:fs"). */
export function importsIn(code) {
    return [...new Set(IMPORTS.flatMap((imports) => [...code.matchAll(imports)].map(([, from]) => from)))];
}

/** Whether a module's code imports something it works out as it runs: what that loads can't be told from the code. */
export function importsWorkedOut(code) {
    return WORKED_OUT.test(code);
}

/** Every file a module's code names beside itself (`new URL("x", import.meta.url)`), as it names them. */
export function namedBeside(code) {
    return [...new Set([...code.matchAll(BESIDE)].map(([, file]) => file))];
}
