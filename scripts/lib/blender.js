// Models that come as Blender's own files (.blend) or as FBX (scripts/build-props.js's `from`
// meshes), read with Blender's Python module: each made into an OBJ once (scripts/blender/to-obj.py)
// and kept in .cache/blender by what it was made from, then read as the other OBJs are.
//
// Blender's Python module is the one utilities/blenderpipeline sets up (`npm run setup` there:
// Blender 4.5 as a Python module, in its .venv), or another named by BLENDER_PYTHON.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const CACHE = new URL("../../.cache/blender/", import.meta.url);
const SCRIPT = fileURLToPath(new URL("../blender/to-obj.py", import.meta.url));
const PYTHON = process.env.BLENDER_PYTHON ?? fileURLToPath(new URL("../../utilities/blenderpipeline/.venv/bin/python", import.meta.url));

/** Whether a model's file (by its name) is one Blender has to read: a .blend or an FBX. */
export const byBlender = (name) => /\.(blend|fbx)$/i.test(name);

/**
 * The OBJ (its text) of a .blend's or an FBX's meshes (`bytes`, the file as it came; `name`, its
 * file's name, for what it is), made by Blender, or kept from the last time.
 */
export async function objFrom(bytes, name) {
    const key = createHash("sha256").update(new Uint8Array(bytes)).digest("hex").slice(0, 16);
    const kind = name.slice(name.lastIndexOf(".")).toLowerCase();
    const [model, obj] = [new URL(`${key}${kind}`, CACHE), new URL(`${key}.obj`, CACHE)];

    if (!existsSync(obj)) {
        if (!existsSync(PYTHON)) {
            throw new Error(`${name} needs Blender's Python module to be read: set it up with npm run setup in utilities/blenderpipeline, or name one with BLENDER_PYTHON`);
        }

        await mkdir(CACHE, { recursive: true });
        await writeFile(model, new Uint8Array(bytes));
        await promisify(execFile)(PYTHON, ["-I", SCRIPT, "--", fileURLToPath(model), fileURLToPath(obj)], { maxBuffer: 16 * 1024 * 1024 });
    }

    return readFile(obj, "utf8");
}
