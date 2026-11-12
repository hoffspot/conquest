import { muster } from "./bench.mjs";

const fast = new Function("o", "return %HasFastProperties(o)");
const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
const { battle } = muster(20, "lasting", world);

console.log(`DELETED=${process.env.DELETED ?? ""}: ${battle.actors.filter((actor) => fast(actor)).length} of ${battle.actors.length} actors with fast properties`);
