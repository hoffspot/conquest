// Builds game-ready GLBs from .blend (or .fbx, .glb, .gltf) files (README.md):
//
//     node build.js examples/dragon.json [more configs...]
//     npm run build                        # every example
//     node build.js --fixtures             # remakes the test fixtures (fixtures/*.py)
//
// Options:
//     --profile <name>  build only this profile of a config that has profiles (else all of them,
//                       each into <out>/<profile>/)
//     --out <dir>       write here, not where each config says
//     --blender <path>  run this Blender (else BLENDER, BLENDER_PYTHON, or .venv's bpy)
//     --strict          fail an asset that's over any of its budgets
//     --keep            keep each asset's work in <out>/.work: Blender's GLB, report and log, and
//                       each baked pass as a PNG
//     --verbose         show Blender's own output as it goes
//
// For each asset: Blender (blender/export.py) writes a GLB of what's to be exported; Node
// (lib/optimize.js) makes it ready for the game; and its report (lib/report.js) is written beside
// it, <name>.report.json, and summed up here.

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { findBlender, HERE, runBlender } from "./lib/blender.js";
import { blenderJob, loadConfigs } from "./lib/config.js";
import { optimize, optimizeVariant } from "./lib/optimize.js";
import { judge, makeReport, summarize } from "./lib/report.js";

const EXPORT_SCRIPT = path.join(HERE, "blender", "export.py");

/** Builds one asset from its config (lib/config.js). Returns its report and whether it's fit. */
export async function buildAsset(config, { blender, out = config.out, keep = false, verbose = false, strict = false, log = console.log } = {}) {
    const started = Date.now();
    const work = keep ? path.join(out, ".work", config.name) : mkdtempSync(path.join(os.tmpdir(), `blenderpipeline-${config.name}-`));

    mkdirSync(work, { recursive: true });
    mkdirSync(out, { recursive: true });

    try {
        const raw = path.join(work, `${config.name}.blender.glb`);
        const stageReport = path.join(work, `${config.name}.blender.json`);
        const job = path.join(work, `${config.name}.job.json`);
        const rawVariants = Object.fromEntries(Object.keys(config.variants).map((name) => [name, path.join(work, `${config.name}.${name}.blender.glb`)]));

        writeFileSync(job, JSON.stringify(blenderJob(config, { out: raw, report: stageReport, passes: keep ? work : null, variants: rawVariants }), null, 2));
        log(`${config.name}: exporting ${path.relative(process.cwd(), config.source)} with ${blender.label}`);

        try {
            await runBlender(blender, EXPORT_SCRIPT, ["--job", job], { log: path.join(work, `${config.name}.blender.log`), echo: verbose });
        } catch (error) {
            const said = readJson(stageReport)?.error;

            throw new Error(said ? `${config.name}: ${said}` : error.message);
        }

        const stage = readJson(stageReport);
        const glb = path.join(out, `${config.name}.glb`);
        const lodFile = (level) => path.join(out, `${config.name}.lod${level}.glb`);

        // (Lower-detail copies and variants from an earlier build that this one doesn't make)
        for (const old of readdirSync(out).filter((file) => file.startsWith(`${config.name}.`) && file.endsWith(".glb") && file !== `${config.name}.glb`)) {
            rmSync(path.join(out, old));
        }

        const optimized = await optimize(config, { raw, glb, lodFile });
        const variants = [];

        for (const [name, file] of Object.entries(rawVariants)) {
            variants.push(await optimizeVariant(config, name, { raw: file, glb: path.join(out, `${config.name}.${name}.glb`) }));
        }

        const report = await makeReport(config, { blender: stage, optimized, glb, variants });
        const verdict = judge(report, { strict });

        writeFileSync(path.join(out, `${config.name}.report.json`), `${JSON.stringify(report, null, 2)}\n`);

        for (const line of summarize(report)) {
            log(line);
        }

        log(`  ${verdict.ok ? "built" : `NOT FIT: ${verdict.problems.join("; ")}`} in ${((Date.now() - started) / 1000).toFixed(1)} s`);

        return { report, ...verdict };
    } finally {
        if (!keep) {
            rmSync(work, { recursive: true, force: true });
        }
    }
}

function readJson(file) {
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

/** Remakes the test fixtures: each fixtures/*.py run in Blender (they save their own .blend). */
async function makeFixtures(blender, verbose) {
    const folder = path.join(HERE, "fixtures");

    for (const script of readdirSync(folder).filter((file) => file.endsWith(".py"))) {
        console.log(`fixtures/${script}`);
        await runBlender(blender, path.join(folder, script), [], { echo: verbose });
    }
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            out: { type: "string" },
            blender: { type: "string" },
            strict: { type: "boolean", default: false },
            keep: { type: "boolean", default: false },
            verbose: { type: "boolean", default: false },
            fixtures: { type: "boolean", default: false },
            profile: { type: "string" },
        },
    });
    const blender = findBlender({ blender: values.blender ?? process.env.BLENDER });

    if (values.fixtures) {
        await makeFixtures(blender, values.verbose);
        return;
    }

    if (!positionals.length) {
        throw new Error("Which assets? node build.js examples/dragon.json (or npm run build for every example)");
    }

    const failed = [];

    for (const file of positionals) {
        // (A config with profiles: each, into a folder of its own)
        for (const config of loadConfigs(file, { profile: values.profile ?? null })) {
            const label = config.profile ? `${config.name} (${config.profile})` : config.name;
            const out = values.out ? path.resolve(values.out, config.profile ?? "") : config.out;

            try {
                const result = await buildAsset(config, { blender, out, keep: values.keep, verbose: values.verbose, strict: values.strict });

                if (!result.ok) {
                    failed.push(label);
                }
            } catch (error) {
                console.error(`${label}: FAILED\n${error.message}`);
                failed.push(label);
            }
        }
    }

    if (failed.length) {
        console.error(`\nNot built: ${failed.join(", ")}`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, "build.js")) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
