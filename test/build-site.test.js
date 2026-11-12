// The site's copy of the game as the Pages deploy puts it together (scripts/build-site.js): its
// code stripped of comments and whitespace, a source map beside each file, and its manifest and
// import map made again for the files as they then are. Built here on a small copy
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GAME_BODY } from "../client/js/characters/body.js";
import { hashOf } from "../scripts/build-manifest.js";
import { buildSite, stripped } from "../scripts/build-site.js";
import { stamped } from "../scripts/stamp-version.js";

const repository = fileURLToPath(new URL("..", import.meta.url));

// A small game: main.js and what it imports, the modules the game imports once it's loaded
// (scripts/build-manifest.js ENTRIES), one of which starts a worker, and the data the manifest lists
const ENTRIES = ["session", "creator", "worldmap", "wheelsetup", "together", "character-file"];
const SITE = {
    "index.html": [
        "<!doctype html>",
        "<html>",
        "    <head>",
        '        <link rel="stylesheet" href="styles.css">',
        '        <script type="importmap">',
        '            { "imports": {} }',
        "        </script>",
        '        <script type="module" src="js/main.js"></script>',
        "    </head>",
        "</html>",
        "",
    ].join("\n"),
    "js/main.js": [
        "// The page's own module: what it imports is loaded before the loader starts",
        'import { greeting } from "./app/words.js";',
        'import { COMMIT } from "./app/version.js";',
        "",
        "/** What the page says. */",
        "export function said(name) {",
        "    // (A comment inside, and an indent)",
        "    return `${greeting}, ${name}: ${COMMIT.length}`;",
        "}",
        "",
        "export const later = () => import(\"./app/session.js\");",
        "",
    ].join("\n"),
    "js/app/words.js": '// Words\nexport const greeting = "Well   met"; // (its spaces kept)\n',
    "js/app/session.js": [
        "// Starts a worker, by its address beside this module",
        "export function start(Worker) {",
        '    return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });',
        "}",
        "",
        "export const address = new URL(\"./worker.js\", import.meta.url).href;",
        "",
    ].join("\n"),
    "js/app/worker.js": '// The worker\'s own module, and what it imports\nimport { greeting } from "./words.js";\n\nexport const heard = greeting.length;\n',
    "js/lab/tool.js": "// A page of its own, not the game's: stripped as the rest, in no manifest\nexport const tool = 1;\n",
    "styles.css": "/* The page's style sheet: as it's written */\nbody {\n    margin: 0;\n}\n",
    "models/assets.json": '{ "models": {} }\n',
    [`characters/${GAME_BODY}.json`]: '{ "masks": [] }\n',
    [`characters/${GAME_BODY}.bin`]: "body",
    "fonts/letters.woff2": "font",
    // (So that Node reads the copy's modules as modules, as a browser does)
    "package.json": '{ "type": "module" }\n',
};

for (const name of ENTRIES.slice(1)) {
    SITE[`js/app/${name}.js`] = `// ${name}\nexport const name = ${JSON.stringify(name)};\n`;
}

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);

describe("the site's copy of the game, its code stripped (scripts/build-site.js)", () => {
    let site;
    let sizes;
    const read = (file) => readFile(path.join(site, file), "utf8");
    const version = readFile(new URL("../client/js/app/version.js", import.meta.url), "utf8");

    before(async () => {
        site = await mkdtemp(path.join(os.tmpdir(), "pellagos-site-"));

        for (const [file, text] of Object.entries({ ...SITE, "js/app/version.js": await version })) {
            await mkdir(path.dirname(path.join(site, file)), { recursive: true });
            await writeFile(path.join(site, file), text);
        }

        // (As the deploy copies them: the repository's own, about to be made again)
        await writeFile(path.join(site, "js/app/manifest.js"), "export const MANIFEST = [];\n");
        await writeFile(path.join(site, "js/app/assets.js"), "export const ASSETS = {};\n");
        sizes = await buildSite(site);
    });

    after(() => rm(site, { recursive: true, force: true }));

    it("takes the comments and indentation out of every module under js/, the code as it was", async () => {
        const main = await read("js/main.js");

        assert.ok(!/The page's own module|What the page says|A comment inside/.test(main));
        assert.ok(!/\n {4}/.test(main), "no indentation");
        assert.ok(Buffer.byteLength(main) < Buffer.byteLength(SITE["js/main.js"]));
        // (What's in a string or a template is the code's, not whitespace)
        assert.match(await read("js/app/words.js"), /"Well {3}met"/);
        assert.ok(!(await read("js/lab/tool.js")).includes("A page of its own"));

        // (Every module but version.js, and the manifest and catalog made again and stripped too)
        assert.equal(sizes.files, Object.keys(SITE).filter((file) => file.endsWith(".js")).length + 2);
        assert.ok(sizes.after < sizes.before);
    });

    it("leaves every module one that parses and runs as it did: its imports, its exports, what it works out", async () => {
        const modules = (await readdir(path.join(site, "js"), { recursive: true })).filter((name) => name.endsWith(".js"));

        assert.equal(modules.length, Object.keys(SITE).filter((file) => file.endsWith(".js")).length + 3);

        for (const name of modules) {
            await assert.doesNotReject(import(pathToFileURL(path.join(site, "js", name)).href), name);
        }

        const { said, later } = await import(pathToFileURL(path.join(site, "js/main.js")).href);

        assert.equal(said("Aldric"), "Well   met, Aldric: 40");
        assert.equal((await later()).address, pathToFileURL(path.join(site, "js/app/worker.js")).href);
    });

    it("keeps a worker's entry point found from the stripped code, by its address beside the module that starts it", async () => {
        const { MANIFEST } = await import(pathToFileURL(path.join(site, "js/app/manifest.js")).href);
        const code = MANIFEST.find(({ id }) => id === "code").files.map(([file]) => file);
        let asked;

        assert.match(await read("js/app/session.js"), /new Worker\(new URL\("\.\/worker\.js",import\.meta\.url\),\{type:"module"\}\)/);
        assert.ok(code.includes("js/app/worker.js"), "the worker's module is one the game downloads and keeps");
        assert.ok(code.includes("js/app/session.js"));
        // (What main.js loads itself isn't the loader's to download; nor a page of its own's code)
        assert.ok(!code.includes("js/app/words.js") && !code.includes("js/lab/tool.js"));

        (await import(pathToFileURL(path.join(site, "js/app/session.js")).href)).start(class {
            constructor(url, options) {
                asked = { url: url.href, options };
            }
        });
        assert.deepEqual(asked, { url: pathToFileURL(path.join(site, "js/app/worker.js")).href, options: { type: "module" } });
    });

    it("makes the manifest and the import map again, every hash and size the stripped file's own", async () => {
        const html = await read("index.html");
        const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
        const { MANIFEST } = await import(pathToFileURL(path.join(site, "js/app/manifest.js")).href);
        const modules = Object.keys(SITE).filter((file) => file.startsWith("js/app/") || file === "js/main.js");

        for (const file of [...modules, "js/app/manifest.js", "js/app/assets.js"]) {
            assert.equal(imports[`./${file}`], `./${file}?h=${sha(await readFile(path.join(site, file)))}`, file);
        }

        // (Not the code as it was written)
        assert.notEqual(imports["./js/main.js"], `./js/main.js?h=${sha(SITE["js/main.js"])}`);
        assert.match(html, new RegExp(`<script type="module" src="js/main\\.js\\?h=${sha(await readFile(path.join(site, "js/main.js")))}"></script>`));

        for (const [file, bytes, hash] of MANIFEST.flatMap(({ files }) => files)) {
            assert.equal(hash, sha(await readFile(path.join(site, file))), file);
            assert.equal(bytes, (await stat(path.join(site, file))).size, file);
        }

        // (The modules main.js imports preloaded at the stripped files' addresses; the style
        // sheet, left as it's written, at its own)
        assert.deepEqual([...html.matchAll(/<link rel="modulepreload" href="([^"]*)">/g)].map(([, href]) => href), [`js/app/words.js?h=${sha(await readFile(path.join(site, "js/app/words.js")))}`, "js/app/version.js"]);
        assert.equal(await read("styles.css"), SITE["styles.css"]);
        assert.match(html, new RegExp(`<link rel="stylesheet" href="styles\\.css\\?h=${sha(SITE["styles.css"])}">`));
    });

    it("leaves version.js as it's written, by name, for the deploy to stamp the commit into afterwards", async () => {
        const kept = await read("js/app/version.js");
        const html = await read("index.html");

        assert.equal(kept, await version);
        assert.ok(!html.includes("version.js?h="));
        assert.match(stamped(kept, "9c6a608eb2fcfae241790ecde86eab7d2d41d17a", "2026-10-15T12:49:42Z"), /export const COMMIT = "9c6a608eb2fcfae241790ecde86eab7d2d41d17a";/);
    });

    it("puts a source map beside each file, naming it as the repository has it and carrying its text", async () => {
        const main = await read("js/main.js");
        const map = JSON.parse(await read("js/main.js.map"));

        assert.ok(main.endsWith("//# sourceMappingURL=main.js.map\n"));
        assert.deepEqual(map.sources, ["../client/js/main.js"]);
        assert.deepEqual(map.sourcesContent, [SITE["js/main.js"]]);
        assert.ok(map.mappings.length > 0);
        assert.deepEqual(JSON.parse(await read("js/app/session.js.map")).sources, ["../../client/js/app/session.js"]);
        // (The manifest's too, of the manifest as it was made)
        assert.match(JSON.parse(await read("js/app/manifest.js.map")).sourcesContent[0], /^\/\/ Made by scripts\/build-manifest\.js/);
        assert.ok(!(await readdir(path.join(site, "js/app"))).includes("version.js.map"));
    });

    it("strips whitespace alone: no name changed, the newest syntax and letters outside ASCII as written, a licence's comment kept", async () => {
        const source = [
            "/*! A licence's notice */",
            "// A comment",
            "export class Keep {",
            "    #secret = 1n;",
            "",
            "    static longName(firstArgument, secondArgument) {",
            "        return firstArgument?.[secondArgument] ?? \"½ naïve…\";",
            "    }",
            "}",
            "",
            "const settled = await Promise.resolve(Keep.longName({ a: 1 }, \"a\"));",
            "",
            "export { settled };",
            "",
        ].join("\n");
        const { code, map } = await stripped(source, "js/core/keep.js");

        assert.equal(code, '/*! A licence\'s notice */export class Keep{#secret=1n;static longName(firstArgument,secondArgument){return firstArgument?.[secondArgument]??"½ naïve…"}}const settled=await Promise.resolve(Keep.longName({a:1},"a"));export{settled};\n//# sourceMappingURL=keep.js.map\n');
        assert.deepEqual(JSON.parse(map).sources, ["../../client/js/core/keep.js"]);
    });

    it("never strips the repository's own code, and leaves its own lists made for the repository's again", async () => {
        await assert.rejects(buildSite(path.join(repository, "client")), /Not the repository's own client folder/);
        await assert.rejects(buildSite(path.join(repository, "client/")), /Not the repository's own client folder/);

        // (After a site's built, the lists are made for the repository's own files again)
        assert.equal(await hashOf("js/main.js"), sha(await readFile(new URL("../client/js/main.js", import.meta.url))));
    });

    it("is run by the Pages deploy on the site's copy, after it's copied and before its version is stamped; nowhere else", async () => {
        const pages = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
        const copied = pages.indexOf("cp -R client _site");
        const built = pages.indexOf("node scripts/build-site.js _site");
        const stamp = pages.indexOf('node scripts/stamp-version.js _site/js/app/version.js "$GITHUB_SHA"');

        assert.ok(copied > 0 && built > copied && stamp > built);

        for (const workflow of ["ci.yml", "mac.yml"]) {
            assert.ok(!(await readFile(new URL(`../.github/workflows/${workflow}`, import.meta.url), "utf8")).includes("build-site"), workflow);
        }

        assert.ok(!(await readFile(new URL("../package.json", import.meta.url), "utf8")).includes("build-site"));
    });
});
