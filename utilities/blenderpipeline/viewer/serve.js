// Serves the viewer (viewer/index.html) and what it loads: npm run view, then open
// http://localhost:8099/ (PORT for another port). Three.js comes from node_modules, the models
// from dist/ (or any folder under this one: ?file=private/out/my-asset.glb).

import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { HERE } from "../lib/blender.js";

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".bin": "application/octet-stream",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".wasm": "application/wasm",
};

/** The GLBs in dist/ (without their lower-detail copies), for the viewer's list. */
function listModels() {
    const dist = path.join(HERE, "dist");

    return existsSync(dist) ? readdirSync(dist).filter((file) => file.endsWith(".glb") && !/\.lod\d+\.glb$/.test(file)).sort().map((file) => `dist/${file}`) : [];
}

export function serve(port = Number(process.env.PORT) || 8099) {
    const server = createServer((request, response) => {
        const url = new URL(request.url, "http://localhost");

        if (url.pathname === "/") {
            response.writeHead(302, { Location: "/viewer/" });
            response.end();
            return;
        }

        if (url.pathname === "/models.json") {
            response.writeHead(200, { "Content-Type": TYPES[".json"] });
            response.end(JSON.stringify(listModels()));
            return;
        }

        const file = path.join(HERE, decodeURIComponent(url.pathname).replace(/\/$/, "/index.html"));

        // (Nothing outside this folder, and not Blender's own files)
        if (!file.startsWith(HERE + path.sep) || file.includes(`${path.sep}.venv${path.sep}`) || !existsSync(file) || !statSync(file).isFile()) {
            response.writeHead(404);
            response.end("not found");
            return;
        }

        response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
        createReadStream(file).pipe(response);
    });

    server.listen(port, () => console.log(`The viewer: http://localhost:${port}/`));

    return server;
}

serve();
