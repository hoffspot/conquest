// Bundles qrcode-generator (Kazuhiko Arase's QR code maker) into client/vendor/
// qrcode-generator-<version>/, minified: the world server's management page draws its addresses
// and keys as QR codes with it, for a phone on the Wi-Fi to scan (js/admin/page.js; generated/
// world_server_plan.md §10). Run this after changing the "qrcode-generator" version in
// package.json:
//
//     npm install && npm run vendor:qrcode
//
// then update the path js/admin/page.js imports it from, and delete the old vendor folder.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(path.join(root, "node_modules/qrcode-generator/package.json"), "utf8"));
const target = path.join(root, `client/vendor/qrcode-generator-${version}`);

// (The package has no LICENSE file: its source says MIT, and this is that license, with its notice)
const LICENSE = `qrcode-generator ${version}

Copyright (c) 2009 Kazuhiko Arase

URL: http://www.d-project.com/

The word 'QR Code' is registered trademark of DENSO WAVE INCORPORATED
http://www.denso-wave.com/qrcode/faqpatent-e.html

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`;

const { outputFiles } = await build({ stdin: { contents: `export { default as qrcode } from "qrcode-generator";`, resolveDir: root, loader: "js" }, bundle: true, minify: true, format: "esm", write: false, legalComments: "none" });

await mkdir(target, { recursive: true });
await writeFile(path.join(target, "qrcode.min.js"), `// qrcode-generator ${version}, by Kazuhiko Arase: MIT License (LICENSE). "QR Code" is a registered trademark of DENSO WAVE INCORPORATED\n${outputFiles[0].text}`);
await writeFile(path.join(target, "LICENSE"), LICENSE);

console.log(`qrcode-generator ${version} bundled into ${path.relative(root, target)}`);
