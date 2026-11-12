// node --allow-natives-syntax lit3.mjs: a literal of 113 keys, then `more` keys given it one by
// one in a loop, undefined: fast? one map for all? And restored ones, made the same way and then
// Object.assign-ed a snapshot's keys?
for (const more of [14, 40, 65, 100, 140]) {
    const keys = Array.from({ length: 113 }, (_, k) => `k${k}`);
    const later = Array.from({ length: more }, (_, k) => `m${k}`);
    const literal = new Function(`return { ${keys.map((key, k) => `${key}: ${k}`).join(", ")} };`);
    const make = () => {
        const one = literal();

        for (const key of later) {
            one[key] = undefined;
        }

        return one;
    };
    const [a, b, c] = [make(), make(), make()];

    b.m5 = 3;
    b.m6 = { at: 1 };
    c.m5 = 1.5;
    c.m7 = "x";

    const restored = Object.assign(make(), JSON.parse(JSON.stringify(b)));
    let sum = 0;

    for (let k = 0; k < 2000; k++) {
        for (const one of [a, b, c, restored, make()]) {
            sum += one.k1 + (one.m5 ?? 0);
        }
    }

    const d = make();

    console.log(`113 + ${more} keys: fast ${eval("%HasFastProperties(a)")} ${eval("%HasFastProperties(restored)")}, a and b one map ${eval("%HaveSameMap(a, b)")}, a and c ${eval("%HaveSameMap(a, c)")}, a and a new one ${eval("%HaveSameMap(a, d)")}, a and one restored ${eval("%HaveSameMap(a, restored)")} (${sum > 0})`);
}
