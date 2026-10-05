// Finding Blender, and running a script in it: Blender itself (`--blender`, or BLENDER), or
// Blender's Python module, bpy (BLENDER_PYTHON, or the one `npm run setup` installs in .venv)

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The Python in .venv (made by `npm run setup`). */
export const VENV_PYTHON = process.platform === "win32" ? path.join(HERE, ".venv", "Scripts", "python.exe") : path.join(HERE, ".venv", "bin", "python");

/**
 * The Blender to run scripts with: { command, label, args(script, scriptArgs) }. Blender itself
 * if one's named (`blender`, or BLENDER); else a Python with Blender's module (BLENDER_PYTHON,
 * or .venv's).
 */
export function findBlender({ blender = process.env.BLENDER } = {}) {
    if (blender) {
        return {
            command: blender,
            label: `Blender (${blender})`,
            args: (script, rest) => ["--background", "--factory-startup", "--python-exit-code", "1", "--python", script, "--", ...rest],
        };
    }

    const python = process.env.BLENDER_PYTHON ?? (existsSync(VENV_PYTHON) ? VENV_PYTHON : null);

    if (!python) {
        throw new Error("No Blender to run: `npm run setup` installs Blender's Python module (bpy), or set BLENDER to a Blender 4.2 or later (or BLENDER_PYTHON to a Python that has bpy)");
    }

    return { command: python, label: `bpy (${python})`, args: (script, rest) => [script, "--", ...rest] };
}

/**
 * Runs a Python script in Blender, its output kept in `log` (a file). Resolves when it's done;
 * rejects with the end of its output if it fails.
 */
export function runBlender(blender, script, rest, { log, echo = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(blender.command, blender.args(script, rest), { stdio: ["ignore", "pipe", "pipe"] });
        const output = [];
        const take = (chunk) => {
            output.push(chunk);

            if (echo) {
                process.stdout.write(chunk);
            }
        };

        child.stdout.on("data", take);
        child.stderr.on("data", take);
        child.on("error", (error) => reject(new Error(`couldn't run ${blender.label}: ${error.message}`)));
        child.on("close", (code) => {
            const text = Buffer.concat(output).toString("utf8");

            if (log) {
                writeFileSync(log, text);
            }

            if (code === 0) {
                resolve(text);
            } else {
                const tail = text.split("\n").filter((line) => line.trim()).slice(-15).join("\n");

                reject(new Error(`${path.basename(script)} failed in ${blender.label} (exit ${code}):\n${tail}`));
            }
        });
    });
}
