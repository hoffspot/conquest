// What a crowd's kind (one figure) holds, made as the game makes it: node measure-crowd.mjs [size=256]
import { REPO, THREE, makeKit, MB, allAtOnce } from "./harness.mjs";
const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const { WEAPONS } = await import(`${REPO}/client/js/core/weapons.js`);
const { Lods } = await import(`${REPO}/client/js/characters/lod.js`);
const { makingTemplate, CROWD } = await import(`${REPO}/client/js/world/crowd.js`);
const { folkFigureLook } = await import(`${REPO}/client/js/characters/folkcrowd.js`);
const { WAITING } = await import(`${REPO}/client/js/core/steps.js`);

const size = Number(process.argv[2] ?? 256);
const kit = makeKit(512);
kit.lods = new Lods();

async function make(key, spec) {
    const steps = makingTemplate(kit, key, { size, ...spec });
    let step = steps.next();
    let count = 0;
    const cpu0 = process.cpuUsage();
    while (!step.done) {
        if (step.value === WAITING) { await new Promise((r) => setTimeout(r, 5)); }
        step = steps.next();
        count++;
    }
    const cpu = process.cpuUsage(cpu0);
    return { template: step.value, steps: count, cpuMs: (cpu.user + cpu.system) / 1000 };
}

function report(key, { template, steps, cpuMs }) {
    const g = template.geometry;
    let bytes = 0; const per = {};
    for (const [name, a] of Object.entries(g.attributes)) { bytes += a.array.byteLength; per[name] = `${a.array.constructor.name.replace("Array", "")}x${a.itemSize}`; }
    const index = g.index.array.byteLength + (template.nearIndex?.array.byteLength ?? 0) + (template.farIndex?.array.byteLength ?? 0);
    const picture = template.picture.image;
    const moves = template.moves.image;
    const verts = g.attributes.position.count;
    const lean = verts * (12 + 4 + 4 + 4 + 4 + 4 + 4); // position f32x3, normal i8x4, uv u16x2, colour u8x4, bones u8x4, weights u8x4, set+part+surface u8x4
    console.log(`${key}: ${verts} corners, triangles merged ${g.index.count / 3}, near ${(template.nearIndex?.count ?? 0) / 3}, far ${(template.farIndex?.count ?? 0) / 3}`);
    console.log(`   attributes ${MB(bytes)} MB (${bytes / verts} B a corner: ${JSON.stringify(per)}), indices ${MB(index)} MB; packed as bytes where they can be: ${MB(lean)} MB (${lean / verts} B a corner)`);
    console.log(`   picture ${picture.width}x${picture.height} canvas -> card ${MB(picture.width * picture.height * 4 * 4 / 3)} MB with mips, page ${MB(picture.width * picture.height * 4)} MB (canvas backing)`);
    console.log(`   moves ${moves.width}x${moves.height} RGBA16F -> card ${MB(moves.width * moves.height * 8)} MB, page ${MB(moves.data.byteLength)} MB; moves ${Object.keys(template.table).join(",")}`);
    console.log(`   total card ${MB(bytes + index + picture.width * picture.height * 4 * 4 / 3 + moves.width * moves.height * 8)} MB, page ${MB(bytes + index + picture.width * picture.height * 4 + moves.data.byteLength)} MB; made in ${steps} steps, ${cpuMs.toFixed(0)} ms cpu`);
}

const weapon = WEAPONS.sword;
const look = soldierLook({ people: "human", weapon: "sword", seed: 3 });
report("human sword m", await make("human sword m", { look, guard: "sword", attack: weapon.attacks?.[0] ?? null, reaction: "slash" }));
const bow = soldierLook({ people: "elf", weapon: "bow", seed: 4, sex: "f" });
report("elf bow f", await make("elf bow f", { look: bow, guard: "bow", attack: WEAPONS.bow.attacks?.[0] ?? null, reaction: "pierce" }));
const folk = folkFigureLook({ people: "human", sex: "f", seed: 5, role: "townsfolk" });
report("townsfolk human f", await make("folk human f", { look: folk, calm: true }));
process.exit(0);
