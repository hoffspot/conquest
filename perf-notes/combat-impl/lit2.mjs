// node --allow-natives-syntax lit2.mjs: the same asked of objects made by a constructor whose
// prototype is Object's own (so they're plain objects to anything that asks), N keys each.
for (const n of [110, 128, 175, 260, 300]) {
    const keys = Array.from({ length: n }, (_, k) => `k${k}`);
    const Made = new Function(`${keys.map((key, k) => `this.${key} = ${k < 100 ? k : "undefined"};`).join("\n")}`);

    Made.prototype = Object.prototype;

    const make = () => new Made();
    const [a, b, c] = [make(), make(), make()];

    b.k105 = 3;
    b.k106 = { at: 1 };
    c.k105 = 1.5;
    c.k107 = "x";

    let sum = 0;

    for (let k = 0; k < 2000; k++) {
        for (const one of [a, b, c, make()]) {
            sum += one.k1 + (one.k105 ?? 0);
        }
    }

    const d = make();
    const plain = Object.getPrototypeOf(a) === Object.prototype && a.constructor === Object && JSON.stringify(a).length > 0 && Object.keys(structuredClone(a)).length === n;

    console.log(`${n} keys: fast ${eval("%HasFastProperties(a)")} ${eval("%HasFastProperties(d)")}, a and b one map ${eval("%HaveSameMap(a, b)")}, a and c ${eval("%HaveSameMap(a, c)")}, a and a new one ${eval("%HaveSameMap(a, d)")}, plain ${plain} (${sum > 0})`);
}
