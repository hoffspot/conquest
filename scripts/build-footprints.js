// Measures what each people's props and yard fences stand on, as the art kits draw them, into
// client/js/core/setpieces/outlines.js, for the navigation mesh to walk round them as they're
// drawn (core/navigation/tiles.js), not by the squares they block:
//
//     npm run build:footprints
//
// Run it when a prop's or a fence's looks change; test/footprints.test.js checks the file is the
// art's.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "client/js/core/setpieces/outlines.js");

// (The art paints canvases: enough of one for it to in Node, every other drawing call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            createPattern: () => ({}),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { outlinesSource } = await import("../client/js/world/art/footprints.js");

await writeFile(output, await outlinesSource());
console.log(`Wrote ${path.relative(root, output)}`);
