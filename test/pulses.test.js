// The HUD's pulses that run for as long as what they mark is shown (client/styles.css): whoever
// the player's set on, their legendary weapon's charge full, a hell rift's tear. Each moves only
// opacity and transform, which a browser animates without painting anything again; a shadow or a
// filter animated is painted again on the page's thread every frame it runs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../client/styles.css", import.meta.url), "utf8");

// What a set of keyframes changes: the properties named in any of its frames
function animated(name) {
    const from = styles.indexOf(`@keyframes ${name} {`);

    assert.ok(from >= 0, `@keyframes ${name}`);

    // (To the brace that closes it: the first at the start of a line)
    const body = styles.slice(from, styles.indexOf("\n}", from));

    return [...new Set([...body.matchAll(/^\s+([a-z-]+):/gm)].map(([, property]) => property))].sort();
}

// The rule for a selector, as written (the last, if it ends more than one)
function rule(selector) {
    const from = styles.lastIndexOf(`\n${selector} {`);

    assert.ok(from >= 0, selector);

    return styles.slice(from, styles.indexOf("\n}", from));
}

describe("the HUD's pulses (styles.css)", () => {
    it("move only opacity and transform, each on a layer of its own", () => {
        assert.deepEqual(animated("attacker-pulse"), ["opacity"]);
        assert.deepEqual(animated("charge-full"), ["transform"]);
        assert.deepEqual(animated("charge-glow"), ["opacity", "transform"]);
        assert.deepEqual(animated("charge-near"), ["opacity", "transform"]);
        assert.deepEqual(animated("rift-throb"), ["transform"]);
        assert.deepEqual(animated("rift-flare"), ["opacity"]);
    });

    it("keep the look they had: the glow at its faintest still, at its brightest faded in over it", () => {
        // (Whoever the player's set on: 4 px of glow still, 14 px faded in behind the icon)
        assert.match(rule(".attacker.target"), /box-shadow:\s+0 0 4px 1px rgba\(255, 70, 50, 0\.55\),\s+0 1px 4px rgba\(0, 0, 0, 0\.6\);/);
        assert.doesNotMatch(rule(".attacker.target"), /animation:/);
        assert.match(rule(".attacker.target::after"), /box-shadow: 0 0 14px 5px rgba\(255, 70, 50, 0\.9\);/);
        assert.match(rule(".attacker.target::after"), /animation: attacker-pulse 0\.9s ease-in-out infinite alternate;/);
        assert.match(rule(".attacker.target::after"), /z-index: -1;/, "behind the icon and its lock's sights, as its shadow was");

        // (The charge full: a close glow and a wide one behind its disc, as its drop shadow of 4
        // and of 12 was (a drop shadow's blur is twice a box shadow's, and through the disc's
        // 72%), the one faded out as the other's faded in, swelling with the ring)
        assert.doesNotMatch(rule(".charge.full .charge-ring"), /filter:/);
        assert.match(rule(".charge.full::after"), /box-shadow: 0 0 8px color-mix\(in srgb, var\(--effect\) 72%, transparent\);/);
        assert.match(rule(".charge.full::after"), /animation: charge-near 0\.9s ease-in-out infinite;/);
        assert.match(rule(".charge.full::before"), /box-shadow: 0 0 24px color-mix\(in srgb, var\(--effect\) 72%, transparent\);/);
        assert.match(rule(".charge.full::before"), /animation: charge-glow 0\.9s ease-in-out infinite;/);
        assert.match(rule(".charge.full::before,\n.charge.full::after"), /z-index: -1;/, "behind the ring, as its shadow was");

        // (A rift's tear: the same tear 1.6 times as bright faded in over it, as its brightness was)
        assert.match(rule("#riftchip .tear::after"), /animation: rift-flare 1\.8s ease-in-out infinite;/);
    });

    it("are still for whoever asks for less motion", () => {
        const still = styles.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");

        for (const selector of [".attacker.target::after", ".charge.full::before,\n    .charge.full::after"]) {
            assert.match(still, new RegExp(`${selector.replace(/[.:]/g, "\\$&")} \\{\\s+animation: none;`), selector);
        }
    });
});
