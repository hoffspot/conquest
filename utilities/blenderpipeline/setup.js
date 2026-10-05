// Installs Blender's Python module (bpy) into .venv, for the pipeline to run Blender with:
//
//     npm run setup                         (bpy 4.5 LTS)
//     BPY_VERSION=5.0.1 npm run setup       (another)
//
// bpy needs Python 3.11, exactly. It's a large download (about 350 MB, 1 GB installed). Or don't:
// set BLENDER to a Blender 4.2 or later, and the pipeline runs that instead.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { HERE, VENV_PYTHON } from "./lib/blender.js";

const VERSION = process.env.BPY_VERSION ?? "4.5.14";

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: "inherit", ...options });

    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : ""}`);
    }
}

/** A Python 3.11 to make .venv with: [command, ...arguments before the script]. */
function findPython() {
    const candidates = process.platform === "win32" ? [["py", "-3.11"], ["python3.11"], ["python"]] : [["python3.11"], ["python3"]];

    for (const [command, ...args] of candidates) {
        const found = spawnSync(command, [...args, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: "utf8" });

        if (found.status === 0 && found.stdout.trim() === "3.11") {
            return [command, ...args];
        }
    }

    throw new Error("bpy needs Python 3.11, and there isn't one (python3.11). Install it, or set BLENDER to a Blender 4.2 or later instead");
}

try {
    if (!existsSync(VENV_PYTHON)) {
        const [python, ...args] = findPython();

        console.log(`Making ${path.relative(process.cwd(), path.join(HERE, ".venv"))} with ${[python, ...args].join(" ")}`);
        run(python, [...args, "-m", "venv", path.join(HERE, ".venv")]);
    }

    console.log(`Installing bpy ${VERSION} (Blender as a Python module: a large download)`);
    run(VENV_PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", `bpy==${VERSION}`]);
    run(VENV_PYTHON, ["-c", "import bpy; print('Blender', bpy.app.version_string, 'is ready')"]);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
