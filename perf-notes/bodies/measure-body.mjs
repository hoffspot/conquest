// What one body drawn in full holds, built as the game builds it (app/game.js #built,
// #addingFolk, #dressing): node measure-body.mjs [skin=512]
import { REPO, THREE, Character, makeKit, census, MB, allAtOnce } from "./harness.mjs";

const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const { folkLook, TOWNSFOLK_PARTS } = await import(`${REPO}/client/js/characters/folk.js`);
const { PRESETS } = await import(`${REPO}/client/js/characters/presets.js`);
const { Lods } = await import(`${REPO}/client/js/characters/lod.js`);
const { heldOnPage } = await import(`${REPO}/client/js/world/release.js`);

const skin = Number(process.argv[2] ?? 512);
const kit = makeKit(skin);

kit.lods = new Lods();

const game = { far: true, release: true, merge: true, hairDetail: 0.2 };
const build = (look, options = {}) => {
    const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, ...game, ...options });

    character.lowerDetail(kit.lods);

    return character;
};

const cast = [];

// The start town's guards (human: sword and bow), a few of each
for (let seed = 1; seed <= 4; seed++) {
    cast.push({ name: `guard sword #${seed}`, character: build(soldierLook({ people: "human", weapon: "sword", seed, sex: seed % 2 ? "m" : "f" })) });
}

for (let seed = 5; seed <= 6; seed++) {
    cast.push({ name: `guard bow #${seed}`, character: build(soldierLook({ people: "human", weapon: "bow", seed })) });
}

// Townsfolk out about their business
let n = 0;

for (const part of TOWNSFOLK_PARTS) {
    for (const sex of ["m", "f"]) {
        const seed = 100 + n++;

        cast.push({ name: `folk ${part} ${sex}`, character: build(folkLook({ role: "townsfolk", look: part, sex, seed })) });
    }
}

// The player (not merged: they change what they wear)
cast.push({ name: "player (heroine)", character: build(PRESETS.heroine, { merge: false, hairDetail: 0.2 }) });

// Wait for the lower-detail meshes (made here with meshoptimizer, no worker in Node)
await new Promise((resolve) => setTimeout(resolve, 100));
for (let k = 0; k < 200; k++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
}

// Who uses each texture
const users = new Map();
const all = cast.map(({ name, character }) => {
    const c = census(character.object);

    for (const texture of c.textures.keys()) {
        users.set(texture, (users.get(texture) ?? 0) + 1);
    }

    return { name, character, c };
});

console.log(`skin size ${skin}; ${cast.length} bodies\n`);

let own = 0;
let shared = new Map();
let page = 0;
let buffers = 0;

for (const { name, character, c } of all) {
    let mine = 0;
    let minePage = 0;
    const lines = [];

    for (const [texture, { slots, facts }] of c.textures) {
        const count = users.get(texture);
        const sharedByAll = count > 1;

        if (count === 1) {
            mine += facts.gpu;
            minePage += facts.page;
        } else {
            shared.set(texture, facts);
        }

        lines.push(`      ${[...slots].join(",")}: ${facts.w}x${facts.h} ${facts.channels}ch${facts.type > 1 ? `x${facts.type}B` : ""} ${facts.mips ? "mips" : "no-mips"} gpu ${MB(facts.gpu)} MB page ${MB(facts.page)} MB ${sharedByAll ? `(shared by ${count})` : "(own)"}`);
    }

    let geometry = 0;

    for (const { bytes } of c.geometries.values()) {
        geometry += bytes;
    }

    const bones = [...c.skeletons].map((s) => s.bones.length);
    const tri = (level) => {
        character.setDetail(level);

        let total = 0;

        character.object.traverse((node) => {
            if (!node.isMesh || !node.visible) {
                return;
            }

            const g = node.geometry;

            if (g.groups.length) {
                total += g.groups.reduce((sum, group) => sum + group.count, 0) / 3;
            } else {
                const count = Math.min(g.drawRange.count, g.index ? g.index.count : g.attributes.position.count);

                total += count / 3;
            }
        });
        character.setDetail(0);

        return Math.round(total);
    };
    const draws = (() => {
        let d = 0;

        character.object.traverse((node) => {
            if (node.isMesh && node.visible) {
                d += Math.max(1, node.geometry.groups.length && Array.isArray(node.material) ? node.geometry.groups.length : 1);
            }
        });

        return d;
    })();

    own += mine;
    page += minePage;
    buffers += geometry;
    console.log(`${name}: own textures gpu ${MB(mine)} MB, page ${MB(minePage)} MB; geometry ${MB(geometry)} MB (page; the same again on the card); meshes ${c.meshes} (skinned ${c.skinned}), draws ${draws}, skeletons ${c.skeletons.size} bones [${bones}], tris full/mid/far ${tri(0)}/${tri(1)}/${tri(2)}; heldOnPage ${MB(heldOnPage([character.object]))} MB; equipment ${[...character.equipment.values()].join(" ")}`);

    if (process.argv.includes("--detail")) {
        console.log(lines.join("\n"));

        for (const [, g] of c.geometries) {
            console.log(`      geom ${g.name}: ${g.vertices} verts, index ${g.index}, ${MB(g.bytes)} MB ${JSON.stringify(g.per)}`);
        }
    }
}

let sharedGpu = 0;
let sharedPage = 0;

for (const facts of shared.values()) {
    sharedGpu += facts.gpu;
    sharedPage += facts.page;
}

console.log(`\nTOTAL own textures: gpu ${MB(own)} MB, page ${MB(page)} MB over ${cast.length} bodies = ${MB(own / cast.length)} MB gpu each`);
console.log(`shared textures (used by 2+ of these): ${shared.size}, gpu ${MB(sharedGpu)} MB, page ${MB(sharedPage)} MB`);
console.log(`geometry (page copy) ${MB(buffers)} MB = ${MB(buffers / cast.length)} each`);

// The kit's caches: what's kept whoever's drawn
const sum = (list) => list.reduce((a, b) => a + b, 0);
const texBytes = (t) => t?.image?.data?.byteLength ?? 0;

console.log(`\nkit.garmentMaterials: ${kit.garmentMaterials?.size ?? 0} garments painted; page bytes ${MB(sum([...(kit.garmentMaterials?.values() ?? [])].map((m) => texBytes(m.map) + texBytes(m.bumpMap))))} MB`);
console.log(`kit.composites: ${kit.composites?.size ?? 0} outfits; page bytes ${MB(sum([...(kit.composites?.values() ?? [])].map(({ value: m }) => texBytes(m.map) + texBytes(m.bumpMap))))} MB; users ${[...(kit.composites?.values() ?? [])].map((e) => e.users).join(",")}`);
console.log(`kit.designTextures: ${kit.designTextures?.size ?? 0}`);
console.log(`kit.eyes: ${kit.eyes?.size ?? 0}`);

const tm = kit.texelMap;

if (tm) {
    console.log(`kit.texelMap: ${MB(sum(Object.values(tm).map((v) => v?.byteLength ?? 0)))} MB typed arrays (${Object.entries(tm).map(([k, v]) => `${k}:${v?.byteLength ? MB(v.byteLength) : "-"}`).join(" ")})`);
}

console.log(`kit.atlas fields: ${Object.keys(kit.atlas.fields).length} x ${skin}^2 = ${MB(sum(Object.values(kit.atlas.fields).map((f) => f.byteLength)))} MB; covered ${MB(kit.atlas.covered.byteLength)}; gutter ${kit.atlas.gutter.length} numbers (JS array)`);
console.log(`kit.lods kept: ${kit.lods.made.size}`);

let lodBytes = 0;

for (const promise of kit.lods.made.values()) {
    lodBytes += (await promise).byteLength;
}

console.log(`kit.lods bytes: ${MB(lodBytes)} MB`);
process.exit(0);
