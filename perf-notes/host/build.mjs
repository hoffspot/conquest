// What building the world costs as the game loads (core/overworld.js buildWorld): the plan
// (worldplan/plan.js planWorld) and the rest, in this thread's CPU time; and how big the plan is.
const ROOT = "/home/user/conquest/client/js/core";
const cpu = () => {
    const { user, system } = process.threadCpuUsage();

    return (user + system) / 1000;
};
const c0 = cpu();
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { planWorld } = await import(`${ROOT}/worldplan/plan.js`);
const imported = cpu() - c0;
const seed = Number(process.argv[2] ?? 2);
let c1 = cpu();
const plan = planWorld(seed);
const planned = cpu() - c1;

c1 = cpu();

const world = buildWorld({ seed, plan });
const built = cpu() - c1;
const typed = Object.entries(plan).filter(([, value]) => ArrayBuffer.isView(value)).map(([key, value]) => [key, value.byteLength]);
const plain = Object.fromEntries(Object.entries(plan).filter(([, value]) => !ArrayBuffer.isView(value)));
let json = 0;

try {
    json = JSON.stringify(plain).length;
} catch (error) {
    json = `not plain: ${error.message}`;
}

console.log(`seed ${seed}: modules imported ${Math.round(imported)} ms cpu; planWorld ${Math.round(planned)} ms; the rest of buildWorld ${Math.round(built)} ms; the plan's typed arrays ${Math.round(typed.reduce((sum, [, bytes]) => sum + bytes, 0) / 1024)} KB (${typed.map(([key, bytes]) => `${key} ${Math.round(bytes / 1024)}`).join(", ")}); the rest of it as JSON ${typeof json === "number" ? `${Math.round(json / 1024)} KB` : json}; keys ${Object.keys(plan).join(",")}`);
void world;
