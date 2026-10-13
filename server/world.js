// The world server, run from Terminal (generated/world_server_plan.md §11, Phase 1):
//
//   npm run world-server                         its data where this system keeps an app's (platform/)
//   node server/world.js --port 8480 --data <folder>
//   node server/world.js --app                   as the menu-bar app runs it (plan §11, Phase 2)
//
// This is its launcher (launch.js): it runs the server (serve.js, which says what the arguments
// do) in a process of its own, as this version or a newer one an update installed in its data
// folder, and starts it again when it's updated, going back to the version before if the new one
// fails. It ends as the server does, with its exit code.

import path from "node:path";
import { parseArgs } from "node:util";
import { launch, WORLD_OPTIONS } from "./launch.js";
import { folders } from "./platform/index.js";
import { SERVER_VERSION } from "./storage/versions.js";
import { CODE } from "./update/installed.js";

const { values } = parseArgs({ options: WORLD_OPTIONS });
const root = path.resolve(values.data ?? folders().data);

process.exit(await launch({ root, args: process.argv.slice(2), own: { version: SERVER_VERSION, code: CODE } }));
