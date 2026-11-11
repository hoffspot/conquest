// The quality level suggested for a device (client/js/world/view.js detectQuality): by what its
// browser tells of it, and an iPhone Low whatever Safari says of it
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectQuality, QUALITY } from "../client/js/world/view.js";

// What browsers say they are
const AGENTS = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    // (An iPad says it's a Mac, with a touch screen)
    ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
    android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

describe("the quality suggested for a device (view.js detectQuality)", () => {
    it("is Low for an iPhone as Safari tells of it, no memory told and 4 cores said for its 6: for its memory, and whatever it says of itself", () => {
        // (Safari's values: WebKit says 4 for any device with fewer than 8 cores, and tells no memory)
        const safari = { touch: true, memory: undefined, cores: 4, agent: AGENTS.iphone };

        assert.equal(detectQuality(safari), "low");
        // (The day an iPhone has 8 cores, or Safari tells what it has: Low still, not Medium by
        // itself, with 2.25 times the pixels and four times the shadow map)
        assert.equal(detectQuality({ ...safari, cores: 8 }), "low");
        assert.equal(detectQuality({ ...safari, cores: 6, memory: 8 }), "low");
        assert.equal(detectQuality({ ...safari, cores: undefined }), "low");
        assert.equal((QUALITY.medium.pixelRatio / QUALITY.low.pixelRatio) ** 2, 2.25);
        assert.equal((QUALITY.medium.shadows / QUALITY.low.shadows) ** 2, 4);
    });

    it("goes by its memory and cores for any other phone or tablet, an iPad among them; a computer High", () => {
        assert.equal(detectQuality({ touch: true, memory: 8, cores: 8, agent: AGENTS.android }), "medium");
        assert.equal(detectQuality({ touch: true, memory: 4, cores: 8, agent: AGENTS.android }), "low");
        assert.equal(detectQuality({ touch: true, memory: 8, cores: 4, agent: AGENTS.android }), "low");
        // (An iPad: 8 said for a chip with 8 cores or more, 4 for fewer, as before)
        assert.equal(detectQuality({ touch: true, memory: undefined, cores: 8, agent: AGENTS.ipad }), "medium");
        assert.equal(detectQuality({ touch: true, memory: undefined, cores: 4, agent: AGENTS.ipad }), "low");
        // (Nothing told of either: taken for plenty)
        assert.equal(detectQuality({ touch: true, agent: AGENTS.android }), "medium");
        assert.equal(detectQuality({ touch: false, memory: 2, cores: 2, agent: AGENTS.mac }), "high");
        assert.equal(detectQuality({ touch: false, memory: undefined, cores: 4, agent: AGENTS.iphone }), "high", "(by its pointer first)");
    });

    it("asks this device's browser, told of no other", () => {
        const kept = { matchMedia: globalThis.matchMedia, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
        const browser = (touch, navigator) => {
            globalThis.matchMedia = (query) => ({ matches: query === "(pointer: coarse)" && touch });
            Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true });
        };

        try {
            browser(true, { hardwareConcurrency: 4, userAgent: AGENTS.iphone });
            assert.equal(detectQuality(), "low");
            browser(true, { deviceMemory: 8, hardwareConcurrency: 8, userAgent: AGENTS.android });
            assert.equal(detectQuality(), "medium");
            browser(false, { deviceMemory: 8, hardwareConcurrency: 16, userAgent: AGENTS.mac });
            assert.equal(detectQuality(), "high");
        } finally {
            globalThis.matchMedia = kept.matchMedia;

            if (kept.navigator) {
                Object.defineProperty(globalThis, "navigator", kept.navigator);
            } else {
                delete globalThis.navigator;
            }
        }
    });
});
