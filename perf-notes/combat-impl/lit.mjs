// node --allow-natives-syntax lit.mjs: does an object literal of N keys come out with fast
// properties, and do two from the same literal share a map, also after some of their
// undefined-made keys are given numbers and objects?
for (const n of [110, 127, 128, 140, 175, 200]) {
    const keys = Array.from({ length: n }, (_, k) => `k${k}`);
    const make = new Function(`return { ${keys.map((key, k) => `${key}: ${k < 100 ? k : "undefined"}`).join(", ")} };`);
    const [a, b, c] = [make(), make(), make()];

    b.k105 = 3;
    b.k106 = { at: 1 };
    c.k105 = 1.5;
    c.k107 = "x";

    // (Read them a few times, as the battle would: deprecated maps are left on a read)
    let sum = 0;

    for (let k = 0; k < 2000; k++) {
        for (const one of [a, b, c, make()]) {
            sum += one.k1 + (one.k105 ?? 0);
        }
    }

    const d = make();

    console.log(`${n} keys: fast ${eval("%HasFastProperties(a)")}, a and b one map ${eval("%HaveSameMap(a, b)")}, a and c ${eval("%HaveSameMap(a, c)")}, a and a new one ${eval("%HaveSameMap(a, d)")} (${sum > 0})`);
}
